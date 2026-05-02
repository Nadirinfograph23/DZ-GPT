/**
 * DZ Maps — Main Entry Point v4
 * Smart Map Intelligence Engine for DZ Agent
 * Uses Google Maps embed (no API key needed) + Algeria local geo DB
 * GOLDEN RULE: No map shown without verified Algerian location
 */

export { isMapQuery, detectPoiType, isRoutingQuery, parseRouting, extractLocationFromMsg, hasGpsIntent, GPS_PROXIMITY_WORDS, POI_TYPES } from './intent.js'
export { geocode, reverseGeocode, searchPOI, getRoute } from './geo.js'
export { buildPoiMapHtml, buildRouteMapHtml, buildLocationMapHtml, buildGeoCardHtml, buildPoiEmbedUrl, buildLocationEmbedUrl, buildRouteEmbedUrl } from './leaflet-builder.js'

import { isMapQuery, detectPoiType, isRoutingQuery, parseRouting, extractLocationFromMsg, POI_TYPES } from './intent.js'
import { buildPoiEmbedUrl, buildLocationEmbedUrl, buildRouteEmbedUrl } from './leaflet-builder.js'
import { searchGeoLocation } from './algeria-geo-db.js'
import { geocode, getRoute } from './geo.js'

/**
 * Resolve a location string → {lat, lng, displayName, displayNameFr, type, parent}
 * 1. Local Algeria geo DB (fast, fuzzy)
 * 2. Nominatim geocode fallback (Algeria only)
 * NEVER returns Algiers as a default — returns null if unknown
 */
async function resolveLocation(locationStr) {
  if (!locationStr || !locationStr.trim()) return null

  // Step 1: Algeria local DB
  const result = searchGeoLocation(locationStr)
  if (result.found && result.entry) {
    const e = result.entry
    return {
      lat:            e.lat,
      lng:            e.lng,
      displayName:    e.nameAr || e.name,
      displayNameFr:  e.nameFr || e.name,
      type:           e.type,
      parent:         e.parent,
      parentFr:       e.parentFr,
      confidence:     result.confidence,
      fromLocalDB:    true,
    }
  }

  // Step 2: Nominatim fallback
  try {
    const geo = await geocode(locationStr, true)
    if (geo) {
      return {
        lat:           geo.lat,
        lng:           geo.lng,
        displayName:   locationStr,
        displayNameFr: locationStr,
        type:          null,
        parent:        null,
        confidence:    80,
        fromLocalDB:   false,
      }
    }
  } catch {}

  return null
}

function formatSuggestions(suggestions) {
  if (!suggestions?.length) return ''
  return suggestions.map(s =>
    `• **${s.nameAr}** (${s.nameFr || s.name})${s.parent ? ` — ${s.type} في ${s.parent}` : ` — ${s.type}`}`
  ).join('\n')
}

/**
 * Main handler: detects map intent, builds Google Maps embed URL + response text
 * @param {string} msg - cleaned user message
 * @param {object|null} _userLocation - ignored (GPS removed)
 * @returns {object|null} { content, isMap, mapHtml:'', mapMeta:{gmapsUrl,...} } or null
 */
export async function handleMapQuery(msg, _userLocation = null) {
  if (!isMapQuery(msg)) return null

  const poiKey  = detectPoiType(msg)
  const isRoute = isRoutingQuery(msg)
  const routing = isRoute ? parseRouting(msg) : null

  // ── ROUTING: A → B ────────────────────────────────────────────────────────
  if (routing) {
    const [fromGeo, toGeo] = await Promise.all([
      resolveLocation(routing.from),
      resolveLocation(routing.to),
    ])

    if (!fromGeo && !toGeo) {
      const fRes = searchGeoLocation(routing.from)
      const tRes = searchGeoLocation(routing.to)
      const sf = fRes.suggestions.slice(0, 2).map(s => s.nameAr).join('، ')
      const st = tRes.suggestions.slice(0, 2).map(s => s.nameAr).join('، ')
      return {
        content: `⚠️ لم أتمكن من تحديد الموقعين:\n- **${routing.from}**${sf ? ` — هل تقصد: ${sf}؟` : ''}\n- **${routing.to}**${st ? ` — هل تقصد: ${st}؟` : ''}\n\nاكتب الاسم بالعربية أو الفرنسية.`,
        isMap: false,
      }
    }
    if (!fromGeo) {
      const res = searchGeoLocation(routing.from)
      return {
        content: `⚠️ لم يتم العثور على **"${routing.from}"**.\n\n${formatSuggestions(res.suggestions) || 'حاول كتابة الاسم بطريقة مختلفة.'}`,
        isMap: false,
      }
    }
    if (!toGeo) {
      const res = searchGeoLocation(routing.to)
      return {
        content: `⚠️ لم يتم العثور على **"${routing.to}"**.\n\n${formatSuggestions(res.suggestions) || 'حاول كتابة الاسم بطريقة مختلفة.'}`,
        isMap: false,
      }
    }

    let routeStats = null
    try { routeStats = await getRoute(fromGeo.lat, fromGeo.lng, toGeo.lat, toGeo.lng) } catch {}

    const gmapsUrl = buildRouteEmbedUrl(fromGeo.displayNameFr, toGeo.displayNameFr)
    const distText = routeStats
      ? `المسافة: **${routeStats.distanceKm} كم** — وقت الوصول التقريبي: **~${routeStats.durationMin} دقيقة** بالسيارة.`
      : ''

    return {
      content: `🗺️ **مسار: ${fromGeo.displayName} ← ${toGeo.displayName}**\n\n${distText}\n\n> 🟢 نقطة الانطلاق: ${fromGeo.displayName}\n> 🔴 الوجهة: ${toGeo.displayName}\n\nالخريطة جاهزة 👇`,
      isMap:   true,
      mapHtml: '',
      mapMeta: {
        type:        'route',
        gmapsUrl,
        from:        fromGeo.displayName,
        to:          toGeo.displayName,
        fromFr:      fromGeo.displayNameFr,
        toFr:        toGeo.displayNameFr,
        distanceKm:  routeStats?.distanceKm,
        durationMin: routeStats?.durationMin,
      },
    }
  }

  // ── LOCATION / POI SEARCH ─────────────────────────────────────────────────
  const locStr = extractLocationFromMsg(msg, poiKey)
  let center = null

  if (locStr) {
    center = await resolveLocation(locStr)
  }

  // ⚠️ GOLDEN RULE: No map without a verified location
  if (!center) {
    const fallback = searchGeoLocation(locStr || msg.slice(0, 60))
    const sugg = formatSuggestions(fallback.suggestions)
    return {
      content: `⚠️ **لم يتم العثور على الموقع**\n\nلم أجد مدينة أو ولاية جزائرية في رسالتك.\n\n${sugg ? `**أقرب المواقع المشابهة:**\n${sugg}\n\n` : ''}جرّب: "مستشفى في وهران" أو "صيدلية في قسنطينة"`,
      isMap: false,
    }
  }

  // ── Pure location card (no POI keyword) ──────────────────────────────────
  if (!poiKey) {
    const gmapsUrl = buildLocationEmbedUrl(center.displayNameFr)
    const typeLabel   = center.type   ? ` (${center.type})`      : ''
    const parentLabel = center.parent ? ` — ولاية ${center.parent}` : ''

    return {
      content: `📍 **${center.displayName}**${typeLabel}${parentLabel}\n\n🌍 الإحداثيات: \`${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}\`\n\nالخريطة جاهزة 👇`,
      isMap:   true,
      mapHtml: '',
      mapMeta: {
        type:         'location',
        gmapsUrl,
        locationName: center.displayName,
        locationFr:   center.displayNameFr,
        lat:          center.lat,
        lng:          center.lng,
        locationType: center.type,
        parent:       center.parent,
      },
    }
  }

  // ── POI Search ────────────────────────────────────────────────────────────
  const def      = POI_TYPES[poiKey]
  const gmapsUrl = buildPoiEmbedUrl(poiKey, center.displayNameFr)

  const topList = def
    ? `\n\n> اضغط على الخريطة لرؤية ${def.nameAr} القريبة في ${center.displayName}`
    : ''

  return {
    content: `${def.icon} **${def.nameAr} في ${center.displayName}**${topList}\n\nالخريطة جاهزة 👇`,
    isMap:   true,
    mapHtml: '',
    mapMeta: {
      type:         'poi',
      gmapsUrl,
      poiKey,
      poiIcon:      def.icon,
      poiNameAr:    def.nameAr,
      locationName: center.displayName,
      locationFr:   center.displayNameFr,
      lat:          center.lat,
      lng:          center.lng,
    },
  }
}
