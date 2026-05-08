/**
 * GeoIntelligence — Main Precision Layer
 * Combines: intent detection, multi-source search, Arabic fuzzy matching,
 *           smart ranking, geo validation, confidence engine, Algeria datasets.
 *
 * INTEGRATION RULE:
 *   Drop-in upgrade for resolveLocation() in dz-maps/index.js.
 *   Same return shape. Never breaks existing map routes.
 *
 * AI+GEO HYBRID:
 *   LLM only interprets intent (POI type, city name from query).
 *   Geo engine decides final coordinates. No hallucination.
 */

import { queryVariants, fuzzyScore, smartNormalize, normalizeLatin } from './arabic-fuzzy.js'
import { multiSourceSearch, multiVariantSearch } from './multi-source.js'
import { rankResults, mergeWithLocalDB, buildSuggestions } from './ranker.js'
import {
  filterAlgeria,
  filterByCity,
  formatGeoResult,
  haversineKm,
  isInsideAlgeria,
} from './validator.js'
import {
  searchExtendedDatasets,
  resolveAlias,
  ALL_DATASETS,
} from './algeria-datasets.js'

// Confidence threshold below which we return suggestions instead of one answer
const CONFIDENCE_THRESHOLD = 0.65

// Intent categories for enhanced POI detection
const INTENT_CATEGORIES = {
  mosque:     ['مسجد','مساجد','جامع','جوامع','مصلى','صلاة','mosquée','masjid'],
  restaurant: ['مطعم','مطاعم','أكل','طعام','وجبة','restaurant','café','cafe','snack'],
  school:     ['مدرسة','ثانوية','متوسطة','ابتدائية','جامعة','معهد','école','lycée','université'],
  hospital:   ['مستشفى','عيادة','طوارئ','مركز صحي','hôpital','clinique','urgences'],
  pharmacy:   ['صيدلية','دواء','pharmacie'],
  bank:       ['بنك','صراف','ATM','banque','distributeur'],
  government: ['بلدية','ولاية','دائرة','إدارة','mairie','wilaya'],
  fuel:       ['بنزين','محطة وقود','نفطال','carburant','station service'],
  hotel:      ['فندق','فنادق','إقامة','hôtel','auberge'],
  park:       ['حديقة','متنزه','parc','jardin'],
  airport:    ['مطار','aéroport'],
  landmark:   ['نصب','مقام','صخرة','برج','قلعة','ضريح','مزار'],
  street:     ['شارع','طريق','حي','حارة','rue','avenue','boulevard'],
  neighbourhood: ['حي','حومة','دوار','قرية','douar'],
}

/**
 * Detect geo intent category from a query string
 */
export function detectGeoIntent(query) {
  const lower = query.toLowerCase()
  for (const [category, keywords] of Object.entries(INTENT_CATEGORIES)) {
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return category
    }
  }
  return null
}

/**
 * Extract city/region context from a query string
 * e.g. "مسجد في وهران" → "وهران"
 */
function extractCityContext(query) {
  const patterns = [
    /(?:في|بـ?|بمدينة|بولاية|داخل|بالقرب من)\s+([\u0600-\u06FFa-zA-ZÀ-ÿ][\u0600-\u06FFa-zA-ZÀ-ÿ\s\-]{1,30})/i,
    /(?:à|dans|en|près de|au centre de)\s+([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s\-]{1,30})/i,
    /(?:in|near|at)\s+([a-zA-Z][a-zA-Z\s\-]{1,30})/i,
  ]
  for (const pat of patterns) {
    const m = query.match(pat)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

/**
 * Resolve a city name to coordinates using local DB + alias table
 */
async function resolveCityCenter(cityStr, localDBFn) {
  if (!cityStr) return null

  // Check alias table first
  const alias = resolveAlias(cityStr)
  if (alias) return { lat: alias.lat, lng: alias.lng, name: alias.canonical }

  // Try local DB
  if (localDBFn) {
    const local = localDBFn(cityStr)
    if (local.found && local.entry) {
      return { lat: local.entry.lat, lng: local.entry.lng, name: local.entry.nameAr || local.entry.name }
    }
  }

  // Try extended datasets
  const extended = searchExtendedDatasets(cityStr, null, 1)
  if (extended.length && extended[0].lat && extended[0].lng) {
    return { lat: extended[0].lat, lng: extended[0].lng, name: extended[0].name }
  }

  // Try Nominatim for the city
  try {
    const { searchNominatim } = await import('./multi-source.js')
    const results = await searchNominatim(`${cityStr} Algeria`, { limit: 1 })
    if (results.length && isInsideAlgeria(results[0].lat, results[0].lng)) {
      return { lat: results[0].lat, lng: results[0].lng, name: results[0].name }
    }
  } catch {}

  return null
}

/**
 * Main precision resolve function.
 * Drop-in upgrade for dz-maps/index.js resolveLocation().
 *
 * @param {string} locationStr  - raw location string from user message
 * @param {object} opts
 * @param {function} [opts.localDBFn]      - searchGeoLocation from algeria-geo-db.js
 * @param {function} [opts.nominatimFn]    - existing geocode() from geo.js
 * @param {string}   [opts.poiType]        - detected POI type key
 * @param {number}   [opts.userLat]        - user GPS lat (if known)
 * @param {number}   [opts.userLng]        - user GPS lng
 * @param {string}   [opts.fullQuery]      - original full user message for city extraction
 *
 * @returns {Promise<object>} {
 *   found, entry, confidence, isSingleResult, suggestions,
 *   -- entry shape (same as existing resolveLocation) --
 *   lat, lng, displayName, displayNameFr, type, parent, parentFr,
 *   confidence, fromLocalDB,
 *   -- new precision fields --
 *   district, city, wilaya, mapLink, nearbyLandmarks, confidenceDetails
 * }
 */
export async function precisionResolve(locationStr, opts = {}) {
  const {
    localDBFn = null,
    nominatimFn = null,
    poiType = null,
    userLat = null,
    userLng = null,
    fullQuery = null,
  } = opts

  if (!locationStr?.trim()) return { found: false, confidence: 0, suggestions: [] }

  const query = locationStr.trim()

  // ── STEP 1: Check alias table (instant) ───────────────────────────────────
  const alias = resolveAlias(query.toLowerCase())
  if (alias) {
    return {
      found: true,
      confidence: 1.0,
      isSingleResult: true,
      suggestions: [],
      lat:           alias.lat,
      lng:           alias.lng,
      displayName:   alias.canonical,
      displayNameFr: query,
      type:          'city',
      parent:        null,
      parentFr:      null,
      fromLocalDB:   true,
      district:      null,
      city:          alias.canonical,
      wilaya:        alias.canonical,
      mapLink:       `https://www.openstreetmap.org/?mlat=${alias.lat}&mlon=${alias.lng}&zoom=12`,
      nearbyLandmarks: [],
      confidenceDetails: { source: 'alias_table', score: 1.0 },
    }
  }

  // ── STEP 2: Local DB (fast, highest quality) ──────────────────────────────
  let localResult = null
  if (localDBFn) {
    try {
      const localSearch = localDBFn(query)
      if (localSearch.found && localSearch.entry && (localSearch.confidence ?? 0) >= 60) {
        localResult = localSearch.entry
        localResult._localConfidence = (localSearch.confidence ?? 80) / 100
      }
    } catch {}
  }

  // ── STEP 3: Extended local datasets (mosques, landmarks, etc.) ─────────────
  const extendedResults = searchExtendedDatasets(query, poiType, 5)

  // ── STEP 4: Extract city context from full query for geo validation ────────
  const cityStr = extractCityContext(fullQuery || query)
  const cityCenter = await resolveCityCenter(cityStr, localDBFn)

  // ── STEP 5: Multi-source geo search with fuzzy variants ───────────────────
  const variants = queryVariants(query)
  let externalResults = []
  try {
    externalResults = await multiVariantSearch(variants, {
      countryCode: 'dz',
      limit: 8,
      sources: ['nominatim', 'photon'],
    })
  } catch {}

  // ── STEP 6: Add Wikidata for landmarks/cultural places ────────────────────
  let wikidataResults = []
  if (!localResult && externalResults.length < 3) {
    try {
      const { searchWikidata } = await import('./multi-source.js')
      wikidataResults = await searchWikidata(query, { limit: 3 })
    } catch {}
  }

  // ── STEP 7: Merge all sources ─────────────────────────────────────────────
  const allExternal = [
    ...externalResults,
    ...wikidataResults,
    ...extendedResults.map(e => ({
      ...e,
      source: 'local_db',
      displayName: e.name,
      nameFr: e.nameFr || e.name,
    })),
  ]

  // Merge with local DB result (boosted)
  const merged = mergeWithLocalDB(
    localResult ? { ...localResult, confidence: localResult._localConfidence } : null,
    allExternal
  )

  // ── STEP 8: Filter to Algeria ─────────────────────────────────────────────
  const inAlgeria = filterAlgeria(merged)
  if (!inAlgeria.length && !localResult) {
    return { found: false, confidence: 0, suggestions: [], error: 'no_results_in_algeria' }
  }

  const candidates = inAlgeria.length ? inAlgeria : merged

  // ── STEP 9: Filter by city if requested ───────────────────────────────────
  const cityFiltered = cityCenter
    ? filterByCity(candidates, cityCenter.lat, cityCenter.lng, 80)
    : candidates
  const pool = cityFiltered.length >= 1 ? cityFiltered : candidates

  // ── STEP 10: Rank all candidates ──────────────────────────────────────────
  const ranked = rankResults(pool, {
    query,
    poiType,
    requestedCity:    cityStr || null,
    requestedCityLat: cityCenter?.lat,
    requestedCityLng: cityCenter?.lng,
    userLat,
    userLng,
  })

  if (!ranked.length) {
    return { found: false, confidence: 0, suggestions: [] }
  }

  const best = ranked[0]
  const bestConf = best.confidence ?? 0

  // ── STEP 11: Confidence gate ──────────────────────────────────────────────
  // If confidence too low, return multiple suggestions instead of hallucinating
  if (bestConf < CONFIDENCE_THRESHOLD) {
    const suggestions = buildSuggestions(ranked, 5)
    return {
      found:          true,
      isSingleResult: false,
      confidence:     bestConf,
      suggestions,
      // Still provide best guess fields for backward compat
      lat:            best.lat,
      lng:            best.lng,
      displayName:    best.nameAr || best.name || best.displayName,
      displayNameFr:  best.nameFr || best.name,
      type:           best.type,
      parent:         best.city || best.wilaya,
      parentFr:       best.city || best.wilaya,
      fromLocalDB:    best.source === 'local_db',
      district:       best.district || null,
      city:           best.city || null,
      wilaya:         best.wilaya || null,
      mapLink:        best.lat && best.lng
        ? `https://www.openstreetmap.org/?mlat=${best.lat}&mlon=${best.lng}&zoom=14`
        : null,
      nearbyLandmarks: [],
      confidenceDetails: { source: best.source, score: bestConf, lowConfidence: true },
    }
  }

  // ── STEP 12: Build nearby landmarks (top 3 from local datasets near best) ─
  let nearbyLandmarks = []
  if (best.lat && best.lng) {
    nearbyLandmarks = ALL_DATASETS
      .filter(d => d.lat && d.lng)
      .map(d => ({ ...d, _dist: haversineKm(best.lat, best.lng, d.lat, d.lng) }))
      .filter(d => d._dist < 3 && (d.name !== (best.nameAr || best.name)))
      .sort((a, b) => a._dist - b._dist)
      .slice(0, 3)
      .map(d => ({ name: d.name, nameFr: d.nameFr, distKm: parseFloat(d._dist.toFixed(2)), type: d.type }))
  }

  // ── STEP 13: Build final result (same shape as existing resolveLocation) ───
  return {
    found:          true,
    isSingleResult: true,
    confidence:     bestConf,
    suggestions:    buildSuggestions(ranked.slice(1), 3),

    // Backward-compatible fields (resolveLocation shape)
    lat:           best.lat,
    lng:           best.lng,
    displayName:   best.nameAr || best.name || best.displayName || locationStr,
    displayNameFr: best.nameFr || best.name || locationStr,
    type:          best.type || null,
    parent:        best.city || best.wilaya || null,
    parentFr:      best.city || best.wilaya || null,
    fromLocalDB:   best.source === 'local_db',

    // New precision fields
    district:      best.district || null,
    city:          best.city || null,
    wilaya:        best.wilaya || null,
    osmId:         best.osmId || null,
    phone:         best.phone || null,
    website:       best.website || null,
    openingHours:  best.openingHours || null,
    mapLink: best.lat && best.lng
      ? `https://www.openstreetmap.org/?mlat=${best.lat}&mlon=${best.lng}&zoom=16`
      : null,
    googleMapsLink: best.lat && best.lng
      ? `https://maps.google.com/?q=${best.lat},${best.lng}`
      : null,
    nearbyLandmarks,
    confidenceDetails: {
      source:         best.source,
      score:          parseFloat(bestConf.toFixed(3)),
      lowConfidence:  false,
      requestedCity:  cityStr || null,
      cityMatchFound: !!cityCenter,
    },
  }
}

/**
 * Format a precision result as a human-readable Arabic response string
 * used in the chat response (additive — called by handleMapQuery in index.js)
 */
export function formatPrecisionResponse(result, query) {
  if (!result?.found) return null

  const lines = []
  const conf = result.confidence ?? 0
  const confBadge = conf >= 0.85 ? '🟢' : conf >= 0.65 ? '🟡' : '🟠'
  const confPct = Math.round(conf * 100)

  if (!result.isSingleResult && result.suggestions?.length > 1) {
    lines.push(`🔍 **وجدت عدة مواقع محتملة لـ "${query}":**\n`)
    result.suggestions.forEach(s => {
      lines.push(`**${s.rank}. ${s.name}**${s.nameFr && s.nameFr !== s.name ? ` (${s.nameFr})` : ''}`)
      if (s.city) lines.push(`   📍 ${s.city}`)
      if (s.coordinates) lines.push(`   🌍 \`${s.coordinates}\``)
      if (s.mapLink) lines.push(`   🗺️ [فتح في الخريطة](${s.mapLink})`)
      lines.push(`   ${confBadge} ثقة: ${s.confidence}%`)
      lines.push('')
    })
    lines.push('> حدد الموقع الذي تقصده لأعطيك الخريطة الدقيقة.')
    return lines.join('\n')
  }

  if (result.lat && result.lng) {
    const name = result.displayName || query
    const city = result.city || result.wilaya || ''
    const district = result.district ? ` — حي ${result.district}` : ''

    lines.push(`📍 **${name}**${city ? ` في ${city}` : ''}${district}`)
    if (result.wilaya && result.wilaya !== city) lines.push(`🏛️ ولاية ${result.wilaya}`)
    lines.push(`🌍 \`${parseFloat(result.lat).toFixed(5)}, ${parseFloat(result.lng).toFixed(5)}\``)
    lines.push(`🗺️ [فتح في OpenStreetMap](${result.mapLink})`)
    if (result.googleMapsLink) lines.push(`📱 [Google Maps](${result.googleMapsLink})`)
    lines.push(`${confBadge} دقة التحديد: **${confPct}%**`)

    if (result.nearbyLandmarks?.length) {
      lines.push('\n**معالم قريبة:**')
      result.nearbyLandmarks.forEach(lm => {
        lines.push(`• ${lm.name} — ${lm.distKm} كم`)
      })
    }

    if (result.suggestions?.length) {
      lines.push('\n**مواقع بديلة:**')
      result.suggestions.slice(0, 2).forEach(s => {
        lines.push(`• [${s.name}](${s.mapLink || '#'})${s.city ? ` في ${s.city}` : ''} (${s.confidence}%)`)
      })
    }
  }

  return lines.join('\n')
}
