/**
 * GeoIntelligence — Smart Ranking Engine
 * Merges results from multiple sources and ranks by:
 *   name similarity, city match, district match, distance, importance,
 *   Arabic/French transliteration match, review/popularity signals
 */

import { fuzzyScore, smartNormalize, arabicToLatin, normalizeLatin } from './arabic-fuzzy.js'
import { haversineKm, deduplicate, scoreAndSort } from './validator.js'

// Source priority for tie-breaking
const SOURCE_PRIORITY = {
  local_db:  6,
  nominatim: 5,
  overpass:  4,
  photon:    3,
  wikidata:  2,
  geonames:  1,
}

/**
 * Compute a ranking score (0-1) for a single result vs query context
 */
export function rankScore(result, {
  query,
  poiType      = null,
  requestedCity = null,
  requestedCityLat = null,
  requestedCityLng = null,
  userLat      = null,
  userLng      = null,
}) {
  let score = 0

  // ── 1. Name similarity (40% of score) ────────────────────────────────────
  const names = [
    result.name,
    result.nameAr,
    result.nameFr,
    result.displayName,
  ].filter(Boolean)

  const bestNameSim = Math.max(...names.map(n => fuzzyScore(query, n)), 0)
  score += bestNameSim * 0.40

  // ── 2. City match (20%) ───────────────────────────────────────────────────
  if (requestedCity) {
    const cityNames = [
      result.city,
      result.wilaya,
      result.displayName,
    ].filter(Boolean)
    const citySim = Math.max(...cityNames.map(c => fuzzyScore(requestedCity, c)), 0)
    score += citySim * 0.20
  }

  // ── 3. District / neighbourhood match (8%) ────────────────────────────────
  if (result.district && requestedCity) {
    const districtSim = fuzzyScore(requestedCity, result.district)
    score += districtSim * 0.08
  }

  // ── 4. Distance to requested city center (15%) ────────────────────────────
  if (requestedCityLat && requestedCityLng && result.lat && result.lng) {
    const km = haversineKm(requestedCityLat, requestedCityLng, result.lat, result.lng)
    // 0km = 0.15, 100km = 0
    score += Math.max(0, 0.15 * (1 - km / 100))
  }

  // ── 5. Distance to user (10%) — only when user position known ────────────
  if (userLat && userLng && result.lat && result.lng) {
    const km = haversineKm(userLat, userLng, result.lat, result.lng)
    // 0km = 0.10, 200km = 0
    score += Math.max(0, 0.10 * (1 - km / 200))
  }

  // ── 6. Place importance / popularity (7%) ─────────────────────────────────
  if (result.importance != null) {
    score += Math.min(parseFloat(result.importance), 1) * 0.07
  }

  // ── 7. Source priority bonus (bonus, not main factor) ─────────────────────
  const srcBonus = ((SOURCE_PRIORITY[result.source] ?? 0) / 6) * 0.05
  score += srcBonus

  // ── 8. POI type tag match bonus ───────────────────────────────────────────
  if (poiType && result.type) {
    const typeStr = normalizeLatin(result.type)
    const poiStr  = normalizeLatin(poiType)
    if (typeStr.includes(poiStr) || poiStr.includes(typeStr)) score += 0.03
  }

  return Math.min(Math.max(score, 0), 1)
}

/**
 * Rank and deduplicate a list of geo results.
 * @param {object[]} results - raw results from multi-source search
 * @param {object} context   - { query, requestedCity, requestedCityLat, requestedCityLng, userLat, userLng, poiType }
 * @returns {object[]} ranked, deduplicated, scored results
 */
export function rankResults(results, context) {
  if (!results?.length) return []

  // Add rank score to each result
  const scored = results.map(r => ({
    ...r,
    _rankScore: rankScore(r, context),
  }))

  // Deduplicate by proximity (100m threshold)
  const deduped = deduplicate(scored.sort((a, b) => b._rankScore - a._rankScore))

  // Final sort by rank score
  return deduped
    .sort((a, b) => b._rankScore - a._rankScore)
    .map(({ _rankScore, ...r }) => ({
      ...r,
      confidence: _rankScore,
    }))
}

/**
 * Merge results from local DB and external sources, preferring local DB matches.
 * Local DB results are given a source weight boost.
 */
export function mergeWithLocalDB(localResult, externalResults) {
  if (!localResult) return externalResults

  // Local DB result gets boosted confidence
  const local = {
    source:      'local_db',
    name:        localResult.nameAr || localResult.name,
    nameAr:      localResult.nameAr,
    nameFr:      localResult.nameFr || localResult.name,
    displayName: localResult.nameAr || localResult.name,
    lat:         localResult.lat,
    lng:         localResult.lng,
    type:        localResult.type,
    city:        localResult.parent,
    district:    null,
    wilaya:      localResult.parent,
    importance:  1.0,
    confidence:  (localResult.confidence || 80) / 100,
    fromLocalDB: true,
  }

  // Remove external duplicates very close to the local result
  const filtered = externalResults.filter(r => {
    if (!r.lat || !r.lng) return true
    const dist = haversineKm(local.lat, local.lng, r.lat, r.lng)
    return dist > 0.5 // keep if more than 500m away
  })

  return [local, ...filtered]
}

/**
 * Build ranked suggestions array for UI display
 * (used when confidence < 0.65 to offer multiple choices instead of hallucinating)
 */
export function buildSuggestions(results, maxCount = 5) {
  return results
    .slice(0, maxCount)
    .map((r, i) => ({
      rank:         i + 1,
      name:         r.nameAr || r.name || r.displayName,
      nameFr:       r.nameFr || r.name,
      city:         r.city || r.wilaya,
      coordinates:  r.lat && r.lng ? `${parseFloat(r.lat).toFixed(4)}, ${parseFloat(r.lng).toFixed(4)}` : null,
      confidence:   Math.round((r.confidence || 0) * 100),
      mapLink:      r.lat && r.lng
        ? `https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}&zoom=15`
        : null,
    }))
}
