/**
 * DZ Maps — Main Entry Point
 * Map Intelligence Engine for DZ Agent
 * Sources: OpenStreetMap, Nominatim, Overpass API, OSRM — 100% free & open source
 */

export { isMapQuery, detectPoiType, isRoutingQuery, parseRouting, extractLocationFromMsg, POI_TYPES } from './intent.js'
export { geocode, reverseGeocode, searchPOI, getRoute } from './geo.js'
export { buildPoiMapHtml, buildRouteMapHtml, buildLocationMapHtml } from './leaflet-builder.js'

import { isMapQuery, detectPoiType, isRoutingQuery, parseRouting, extractLocationFromMsg, POI_TYPES } from './intent.js'
import { geocode, searchPOI, getRoute } from './geo.js'
import { buildPoiMapHtml, buildRouteMapHtml, buildLocationMapHtml } from './leaflet-builder.js'

/**
 * Default Algerian cities for fallback geocoding
 */
const DZ_CITIES = {
  'الجزائر العاصمة': { lat: 36.7372, lng: 3.0865 },
  'الجزائر': { lat: 36.7372, lng: 3.0865 },
  'alger': { lat: 36.7372, lng: 3.0865 },
  'وهران': { lat: 35.6987, lng: -0.6349 },
  'oran': { lat: 35.6987, lng: -0.6349 },
  'قسنطينة': { lat: 36.3650, lng: 6.6147 },
  'constantine': { lat: 36.3650, lng: 6.6147 },
  'عنابة': { lat: 36.9000, lng: 7.7667 },
  'annaba': { lat: 36.9000, lng: 7.7667 },
  'سطيف': { lat: 36.1911, lng: 5.4131 },
  'setif': { lat: 36.1911, lng: 5.4131 },
  'سكيكدة': { lat: 36.8765, lng: 6.9062 },
  'تلمسان': { lat: 34.8833, lng: -1.3167 },
  'tlemcen': { lat: 34.8833, lng: -1.3167 },
  'بسكرة': { lat: 34.8500, lng: 5.7333 },
  'biskra': { lat: 34.8500, lng: 5.7333 },
  'بجاية': { lat: 36.7539, lng: 5.0564 },
  'bejaia': { lat: 36.7539, lng: 5.0564 },
  'تيزي وزو': { lat: 36.7170, lng: 4.0465 },
  'tizi ouzou': { lat: 36.7170, lng: 4.0465 },
  'برج بوعريريج': { lat: 36.0703, lng: 4.7630 },
  'غرداية': { lat: 32.4912, lng: 3.6740 },
  'ghardaia': { lat: 32.4912, lng: 3.6740 },
  'بومرداس': { lat: 36.7645, lng: 3.4776 },
  'المدية': { lat: 36.2679, lng: 2.7528 },
  'الشلف': { lat: 36.1653, lng: 1.3338 },
  'الأغواط': { lat: 33.8000, lng: 2.8833 },
  'المسيلة': { lat: 35.7056, lng: 4.5444 },
  'جيجل': { lat: 36.8186, lng: 5.7660 },
  'خنشلة': { lat: 35.4333, lng: 7.1500 },
  'ورقلة': { lat: 31.9497, lng: 5.3244 },
  'ouargla': { lat: 31.9497, lng: 5.3244 },
  'تيارت': { lat: 35.3713, lng: 1.3217 },
  'تيسمسيلت': { lat: 35.6070, lng: 1.8073 },
  'سعيدة': { lat: 34.8317, lng: 0.1500 },
  'مستغانم': { lat: 35.9312, lng: 0.0892 },
  'معسكر': { lat: 35.3955, lng: 0.1400 },
  'ميلة': { lat: 36.4500, lng: 6.2667 },
  'عين الدفلى': { lat: 36.2638, lng: 1.9658 },
  'نعامة': { lat: 33.2667, lng: -0.3167 },
  'عين تموشنت': { lat: 35.2959, lng: -1.1392 },
  'غليزان': { lat: 35.9656, lng: 0.5469 },
  'البيض': { lat: 33.6900, lng: 1.0042 },
  'إليزي': { lat: 26.4847, lng: 8.4842 },
  'تندوف': { lat: 27.8000, lng: -8.1500 },
  'تمنراست': { lat: 22.7906, lng: 5.5228 },
  'tamanrasset': { lat: 22.7906, lng: 5.5228 },
  'أدرار': { lat: 27.8741, lng: -0.2889 },
}

/**
 * Resolve a location string → {lat, lng, displayName}
 * First checks local city DB, then Nominatim
 */
async function resolveLocation(locationStr) {
  if (!locationStr) return null
  const lowerLoc = locationStr.trim().toLowerCase()

  // Check local DB first (faster, no API call)
  for (const [key, coords] of Object.entries(DZ_CITIES)) {
    if (lowerLoc.includes(key) || key.includes(lowerLoc)) {
      return { ...coords, displayName: locationStr }
    }
  }

  // Fall back to Nominatim
  try {
    return await geocode(locationStr, true)
  } catch {
    return null
  }
}

/**
 * Main handler: process a map query and return map HTML + summary text
 * @param {string} msg - user message
 * @param {object|null} userLocation - {lat, lng} from GPS (optional)
 * @returns {object|null} { mapHtml, content, mapMeta } or null if not a map query
 */
export async function handleMapQuery(msg, userLocation = null) {
  if (!isMapQuery(msg)) return null

  const poiKey   = detectPoiType(msg)
  const isRoute  = isRoutingQuery(msg)
  const routing  = isRoute ? parseRouting(msg) : null

  // ── Routing: A → B ──────────────────────────────────────────────────────
  if (routing) {
    const [fromGeo, toGeo] = await Promise.all([
      resolveLocation(routing.from),
      resolveLocation(routing.to),
    ])

    if (!fromGeo || !toGeo) {
      return {
        content: `⚠️ لم أتمكن من تحديد المواقع: **${routing.from}** أو **${routing.to}**. تحقق من أسماء المدن وحاول مجدداً.`,
        isMap: false,
      }
    }

    let route = null
    try { route = await getRoute(fromGeo.lat, fromGeo.lng, toGeo.lat, toGeo.lng) } catch {}

    const mapHtml = buildRouteMapHtml({
      fromName: routing.from,
      toName:   routing.to,
      fromLat:  fromGeo.lat,
      fromLng:  fromGeo.lng,
      toLat:    toGeo.lat,
      toLng:    toGeo.lng,
      route,
    })

    const distText = route ? `المسافة: **${route.distanceKm} كم** — وقت الوصول التقريبي: **~${route.durationMin} دقيقة** بالسيارة.` : ''

    return {
      content: `🗺️ **مسار: ${routing.from} ← ${routing.to}**\n\n${distText}\n\n> 🟢 نقطة الانطلاق: ${routing.from}\n> 🔴 الوجهة: ${routing.to}\n\nالخريطة التفاعلية جاهزة 👇`,
      isMap: true,
      mapHtml,
      mapMeta: {
        type: 'route',
        from: routing.from,
        to:   routing.to,
        distanceKm: route?.distanceKm,
        durationMin: route?.durationMin,
      },
    }
  }

  // ── POI Search ──────────────────────────────────────────────────────────
  const locStr = extractLocationFromMsg(msg, poiKey)
  let center   = userLocation ? { lat: userLocation.lat, lng: userLocation.lng, displayName: 'موقعك الحالي' } : null

  if (!center && locStr) {
    center = await resolveLocation(locStr)
  }

  // Default to Algiers if no location found
  if (!center) {
    center = { lat: 36.7372, lng: 3.0865, displayName: 'الجزائر العاصمة' }
  }

  // If no specific POI, just show location map
  if (!poiKey) {
    const mapHtml = buildLocationMapHtml({
      locationName: center.displayName,
      lat: center.lat,
      lng: center.lng,
    })
    return {
      content: `📍 **${center.displayName}**\n\nالإحداثيات: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}\n\nالخريطة التفاعلية جاهزة 👇`,
      isMap: true,
      mapHtml,
      mapMeta: { type: 'location', locationName: center.displayName, lat: center.lat, lng: center.lng },
    }
  }

  // Fetch POIs
  const def   = POI_TYPES[poiKey]
  let   pois  = []
  try {
    pois = await searchPOI(poiKey, center.lat, center.lng, 8000, 20)
  } catch (e) {
    console.error('[DZ-Maps] Overpass error:', e.message)
  }

  if (!pois.length) {
    // Fallback: show location map with message
    const mapHtml = buildLocationMapHtml({ locationName: center.displayName, lat: center.lat, lng: center.lng })
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
