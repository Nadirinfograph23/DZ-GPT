/**
 * DZ Maps — Main Entry Point
 * Map Intelligence Engine for DZ Agent
 * Sources: OpenStreetMap, Nominatim, Overpass API, OSRM — 100% free & open source
 * v2: Full Algeria geo DB, fuzzy matching, NO default Algiers fallback
 */

export { isMapQuery, detectPoiType, isRoutingQuery, parseRouting, extractLocationFromMsg, hasGpsIntent, GPS_PROXIMITY_WORDS, POI_TYPES } from './intent.js'
export { geocode, reverseGeocode, searchPOI, getRoute } from './geo.js'
export { buildPoiMapHtml, buildRouteMapHtml, buildLocationMapHtml, buildGeoCardHtml } from './leaflet-builder.js'

import { isMapQuery, detectPoiType, isRoutingQuery, parseRouting, extractLocationFromMsg, hasGpsIntent, POI_TYPES } from './intent.js'
import { geocode, searchPOI, getRoute } from './geo.js'
import { buildPoiMapHtml, buildRouteMapHtml, buildLocationMapHtml, buildGeoCardHtml } from './leaflet-builder.js'
import { searchGeoLocation, normText } from './algeria-geo-db.js'

/**
 * Resolve a location string → {lat, lng, displayName, type, parent}
 * 1. Check Algeria local DB with fuzzy matching (fast, zero API call)
 * 2. Fall back to Nominatim geocoding (always restricted to Algeria)
 * NEVER defaults to Algiers — returns null if not found
 */
async function resolveLocation(locationStr) {
  if (!locationStr || !locationStr.trim()) return null

  // ── Step 1: local Algeria geo DB (instant, fuzzy) ──────────────────────
  const result = searchGeoLocation(locationStr)
  if (result.found && result.entry) {
    const e = result.entry
    return {
      lat: e.lat,
      lng: e.lng,
      displayName: e.nameAr || e.name,
      displayNameFr: e.nameFr || e.name,
      type: e.type,
      parent: e.parent,
      parentFr: e.parentFr,
      confidence: result.confidence,
      fromLocalDB: true,
    }
  }

  // ── Step 2: Nominatim fallback (Algeria only) ───────────────────────────
  try {
    const geo = await geocode(locationStr, true)
    if (geo) {
      return {
        lat: geo.lat,
        lng: geo.lng,
        displayName: locationStr,
        displayNameFr: locationStr,
        type: null,
        parent: null,
        confidence: 85,
        fromLocalDB: false,
      }
    }
  } catch {}

  return null // NOT FOUND — never return Algiers as default
}

/**
 * Format suggestions for user feedback
 */
function formatSuggestions(suggestions) {
  if (!suggestions || !suggestions.length) return ''
  return suggestions.map(s =>
    `• **${s.nameAr}** (${s.nameFr || s.name})${s.parent ? ` — ${s.type} في ${s.parent}` : ` — ${s.type}`}`
  ).join('\n')
}

/**
 * Main handler: process a map query and return map HTML + summary text
 * @param {string} msg - user message
 * @param {object|null} userLocation - {lat, lng} from GPS (optional)
 * @returns {object|null} { mapHtml, content, mapMeta } or null if not a map query
 */
export async function handleMapQuery(msg, userLocation = null) {
  if (!isMapQuery(msg)) return null

  const poiKey  = detectPoiType(msg)
  const isRoute = isRoutingQuery(msg)
  const routing = isRoute ? parseRouting(msg) : null

  // ── Routing: A → B ──────────────────────────────────────────────────────
  if (routing) {
    const [fromGeo, toGeo] = await Promise.all([
      resolveLocation(routing.from),
      resolveLocation(routing.to),
    ])

    // ⚠️ Cannot find either location — show error, NEVER fallback to Algiers
    if (!fromGeo && !toGeo) {
      const fromRes = searchGeoLocation(routing.from)
      const toRes   = searchGeoLocation(routing.to)
      const suggFrom = fromRes.suggestions.slice(0, 2).map(s => s.nameAr).join('، ')
      const suggTo   = toRes.suggestions.slice(0, 2).map(s => s.nameAr).join('، ')
      return {
        content: `⚠️ لم أتمكن من تحديد الموقعين:\n- **${routing.from}**${suggFrom ? ` — هل تقصد: ${suggFrom}؟` : ''}\n- **${routing.to}**${suggTo ? ` — هل تقصد: ${suggTo}؟` : ''}\n\nاكتب الاسم بشكل أوضح أو جرّب باللغة العربية أو الفرنسية.`,
        isMap: false,
      }
    }
    if (!fromGeo) {
      const res = searchGeoLocation(routing.from)
      const sugg = formatSuggestions(res.suggestions)
      return {
        content: `⚠️ لم يتم العثور على **"${routing.from}"** بدقة.\n\nاقتراحات مشابهة:\n${sugg || 'لا توجد اقتراحات — حاول كتابة الاسم بطريقة مختلفة.'}`,
        isMap: false,
      }
    }
    if (!toGeo) {
      const res = searchGeoLocation(routing.to)
      const sugg = formatSuggestions(res.suggestions)
      return {
        content: `⚠️ لم يتم العثور على **"${routing.to}"** بدقة.\n\nاقتراحات مشابهة:\n${sugg || 'لا توجد اقتراحات — حاول كتابة الاسم بطريقة مختلفة.'}`,
        isMap: false,
      }
    }

    let route = null
    try { route = await getRoute(fromGeo.lat, fromGeo.lng, toGeo.lat, toGeo.lng) } catch {}

    const mapHtml = buildRouteMapHtml({
      fromName: fromGeo.displayName,
      toName:   toGeo.displayName,
      fromLat:  fromGeo.lat,
      fromLng:  fromGeo.lng,
      toLat:    toGeo.lat,
      toLng:    toGeo.lng,
      route,
    })

    const distText = route
      ? `المسافة: **${route.distanceKm} كم** — وقت الوصول التقريبي: **~${route.durationMin} دقيقة** بالسيارة.`
      : ''

    return {
      content: `🗺️ **مسار: ${fromGeo.displayName} ← ${toGeo.displayName}**\n\n${distText}\n\n> 🟢 نقطة الانطلاق: ${fromGeo.displayName}\n> 🔴 الوجهة: ${toGeo.displayName}\n\nالخريطة التفاعلية جاهزة 👇`,
      isMap: true,
      mapHtml,
      mapMeta: {
        type: 'route',
        from: fromGeo.displayName,
        to:   toGeo.displayName,
        distanceKm: route?.distanceKm,
        durationMin: route?.durationMin,
      },
    }
  }

  // ── Location / POI Search ────────────────────────────────────────────────
  const locStr = extractLocationFromMsg(msg, poiKey)
  let center   = userLocation
    ? { lat: userLocation.lat, lng: userLocation.lng, displayName: 'موقعك الحالي', type: null, parent: null }
    : null

  if (!center && locStr) {
    center = await resolveLocation(locStr)
  }

  // ⚠️ GOLDEN RULE: NO MAP WITHOUT VERIFIED LOCATION
  if (!center) {
    // Try to get fuzzy suggestions from the raw message
    const fallbackQuery = locStr || msg.slice(0, 60)
    const res = searchGeoLocation(fallbackQuery)
    const sugg = formatSuggestions(res.suggestions)

    return {
      content: `⚠️ **لم يتم العثور على الموقع بدقة**\n\nلم أجد موقعاً جزائرياً مطابقاً لـ: *"${locStr || msg.slice(0, 40)}"*\n\n${sugg ? `**أقرب المواقع المشابهة:**\n${sugg}\n\n` : ''}جرّب أن تكتب الاسم:\n• بالعربية: مثلاً "وهران", "الوادي", "بسكرة"\n• بالفرنسية: مثلاً "Oran", "El Oued", "Biskra"\n• أو اذكر رقم الولاية: مثلاً "ولاية 39"`,
      isMap: false,
    }
  }

  // ── Simple location card (no POI) ───────────────────────────────────────
  if (!poiKey) {
    const mapHtml = buildGeoCardHtml({
      locationName: center.displayName,
      locationNameFr: center.displayNameFr,
      lat: center.lat,
      lng: center.lng,
      type: center.type,
      parent: center.parent,
      confidence: center.confidence,
    })

    const typeLabel = center.type ? ` (${center.type})` : ''
    const parentLabel = center.parent ? ` — تابعة لولاية ${center.parent}` : ''

    return {
      content: `📍 **${center.displayName}**${typeLabel}${parentLabel}\n\n🌍 الإحداثيات: \`${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}\`\n\nالخريطة التفاعلية جاهزة 👇`,
      isMap: true,
      mapHtml,
      mapMeta: {
        type: 'location',
        locationName: center.displayName,
        lat: center.lat,
        lng: center.lng,
        locationType: center.type,
        parent: center.parent,
      },
    }
  }

  // ── POI Search ───────────────────────────────────────────────────────────
  const def  = POI_TYPES[poiKey]
  let   pois = []
  try {
    pois = await searchPOI(poiKey, center.lat, center.lng, 8000, 20)
  } catch (e) {
    console.error('[DZ-Maps] Overpass error:', e.message)
  }

  if (!pois.length) {
    const mapHtml = buildGeoCardHtml({
      locationName: center.displayName,
      locationNameFr: center.displayNameFr,
      lat: center.lat,
      lng: center.lng,
      type: center.type,
      parent: center.parent,
    })
    return {
      content: `🔍 لم أجد ${def.icon} **${def.nameAr}** في نطاق 8 كم حول **${center.displayName}**.\n\nجرب تحديد ولاية أخرى أو ابحث بمنطقة أوسع.`,
      isMap: true,
      mapHtml,
      mapMeta: { type: 'empty', poiKey, locationName: center.displayName },
    }
  }

  const mapHtml = buildPoiMapHtml({
    poiKey,
    locationName: center.displayName,
    centerLat:    center.lat,
    centerLng:    center.lng,
    pois,
  })

  const topPois = pois.slice(0, 5).map((p, i) =>
    `${i+1}. **${p.nameAr || p.name}**${p.distKm ? ` — ${p.distKm} كم` : ''}${p.address ? ` — ${p.address}` : ''}`
  ).join('\n')

  return {
    content: `${def.icon} **${def.nameAr} في ${center.displayName}** — وجدت **${pois.length} نتيجة**\n\n${topPois}\n\nاضغط على أي نقطة في الخريطة للتفاصيل 👇`,
    isMap: true,
    mapHtml,
    mapMeta: {
      type:         'poi',
      poiKey,
      poiIcon:      def.icon,
      poiNameAr:    def.nameAr,
      locationName: center.displayName,
      lat:          center.lat,
      lng:          center.lng,
      count:        pois.length,
    },
  }
}
