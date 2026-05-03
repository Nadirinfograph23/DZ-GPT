/**
 * DZ Maps — Main Entry Point v5
 * Smart Map Intelligence Engine for DZ Agent
 * Uses OpenStreetMap embed (no API key) + Algeria local geo DB
 * GOLDEN RULE: No map shown without verified Algerian location
 *              EXCEPT for GPS nearby queries (needsGps: true)
 */

export { isMapQuery, detectPoiType, isRoutingQuery, parseRouting, extractLocationFromMsg, hasGpsIntent, GPS_PROXIMITY_WORDS, POI_TYPES } from './intent.js'
export { geocode, reverseGeocode, searchPOI, getRoute } from './geo.js'
export { buildPoiMapHtml, buildRouteMapHtml, buildLocationMapHtml, buildGeoCardHtml, buildPoiEmbedUrl, buildLocationEmbedUrl, buildRouteEmbedUrl, buildNearbyEmbedUrl, POI_EN_SEARCH } from './leaflet-builder.js'

import { isMapQuery, detectPoiType, isRoutingQuery, parseRouting, extractLocationFromMsg, hasGpsIntent, POI_TYPES } from './intent.js'
import { buildPoiEmbedUrl, buildLocationEmbedUrl, buildRouteEmbedUrl } from './leaflet-builder.js'
import { searchGeoLocation } from './algeria-geo-db.js'
import { geocode, getRoute, searchPOI } from './geo.js'

/**
 * Resolve a location string → {lat, lng, displayName, displayNameFr, ...}
 * 1. Local Algeria geo DB (fast, fuzzy)
 * 2. Nominatim geocode fallback (Algeria only)
 * NEVER returns Algiers as default — returns null if unknown
 */
async function resolveLocation(locationStr) {
  if (!locationStr || !locationStr.trim()) return null

  const result = searchGeoLocation(locationStr)
  if (result.found && result.entry) {
    const e = result.entry
    return {
      lat:           e.lat,
      lng:           e.lng,
      displayName:   e.nameAr || e.name,
      displayNameFr: e.nameFr || e.name,
      type:          e.type,
      parent:        e.parent,
      parentFr:      e.parentFr,
      confidence:    result.confidence,
      fromLocalDB:   true,
    }
  }

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
 * Main handler: detects map intent, builds OSM embed URL + response text
 * @param {string} msg - cleaned user message
 * @returns {object|null} { content, isMap, mapHtml, mapMeta } or null
 */
export async function handleMapQuery(msg, _userLocation = null) {
  if (!isMapQuery(msg)) return null

  const poiKey  = detectPoiType(msg)
  const isRoute = isRoutingQuery(msg)
  const routing = isRoute ? parseRouting(msg) : null

  // ── GPS NEARBY INTENT ────────────────────────────────────────────────────
  // When user says "قريب مني" / "من موقعي" — request GPS from browser
  if (hasGpsIntent(msg)) {
    const def = poiKey ? POI_TYPES[poiKey] : null
    const poiLabel = def ? def.nameAr : 'مرفق'
    const poiIcon  = def ? def.icon  : '📍'
    return {
      content: def
        ? `${poiIcon} **${poiLabel} القريبة منك**\n\nاضغط على الزر أدناه للسماح بتحديد موقعك، وسأُظهر لك خريطة بأقرب ${poiLabel} 📍`
        : `📍 **البحث القريب منك**\n\nاضغط على الزر لتحديد موقعك وعرض الخريطة.`,
      isMap:   true,
      mapHtml: '',
      mapMeta: {
        type:      'gps-nearby',
        needsGps:  true,
        poiKey:    poiKey || null,
        poiIcon,
        poiNameAr: poiLabel,
      },
    }
  }

  // ── ROUTING: A → B ───────────────────────────────────────────────────────
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

    const gmapsUrl = buildRouteEmbedUrl(
      fromGeo.displayNameFr, toGeo.displayNameFr,
      fromGeo.lat, fromGeo.lng, toGeo.lat, toGeo.lng
    )
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
        fromLat:     fromGeo.lat,
        fromLng:     fromGeo.lng,
        toLat:       toGeo.lat,
        toLng:       toGeo.lng,
        distanceKm:  routeStats?.distanceKm,
        durationMin: routeStats?.durationMin,
      },
    }
  }

  // ── LOCATION / POI SEARCH ────────────────────────────────────────────────
  const locStr = extractLocationFromMsg(msg, poiKey)
  let center = null

  if (locStr) {
    center = await resolveLocation(locStr)
  }

  // GOLDEN RULE: No map without verified location
  if (!center) {
    const fallback = searchGeoLocation(locStr || msg.slice(0, 60))
    const sugg = formatSuggestions(fallback.suggestions)
    return {
      content: `⚠️ **لم يتم العثور على الموقع**\n\nلم أجد مدينة أو ولاية جزائرية في رسالتك.\n\n${sugg ? `**أقرب المواقع المشابهة:**\n${sugg}\n\n` : ''}جرّب: "مستشفى في وهران" أو "صيدلية في قسنطينة"\n\nأو اسأل عن **قريب مني** لاستخدام موقعك الحالي 📍`,
      isMap: false,
    }
  }

  // ── Pure location card (no POI keyword) ─────────────────────────────────
  if (!poiKey) {
    const gmapsUrl = buildLocationEmbedUrl(center.displayNameFr, center.lat, center.lng)
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

  // ── POI Search — precise results via Nominatim + Overpass ────────────────
  const def = POI_TYPES[poiKey]
  const specificName = _extractSpecificName(msg, poiKey)

  let poiResults = []

  // 1. If specific name, search Nominatim with name + city
  if (specificName) {
    const queries = [
      `${specificName} ${center.displayNameFr} Algeria`,
      `${specificName} ${center.displayName}`,
    ]
    for (const q of queries) {
      if (poiResults.length > 0) break
      poiResults = await _searchNominatimPoi(q, 50, center.lat, center.lng)
    }
  }

  // 2. Fallback: Overpass API for nearby POIs of this type
  if (poiResults.length === 0) {
    try {
      const overpassRes = await searchPOI(poiKey, center.lat, center.lng, 15000, 10)
      poiResults = overpassRes.map(r => ({
        name: r.nameAr || r.name,
        lat: r.lat,
        lng: r.lng,
        address: r.address || '',
        phone: r.phone || null,
        website: r.website || null,
        distKm: r.distKm,
      }))
    } catch { /* non-fatal */ }
  }

  // 3. Filter by distance from requested city (max 50km)
  poiResults = poiResults.filter(r =>
    r.lat && r.lng && _haversineKm(center.lat, center.lng, r.lat, r.lng) <= 50
  )

  // 4. If no results, fallback to generic embed
  if (poiResults.length === 0) {
    const gmapsUrl = buildPoiEmbedUrl(poiKey, center.displayNameFr, center.lat, center.lng)
    return {
      content: `${def.icon} **${def.nameAr} في ${center.displayName}**\n\n> لم أجد نتائج محددة. اضغط على الخريطة لاستكشاف ${def.nameAr} في المنطقة.\n\nالخريطة جاهزة 👇`,
      isMap:   true,
      mapHtml: '',
      mapMeta: { type: 'poi', gmapsUrl, poiKey, poiIcon: def.icon, poiNameAr: def.nameAr, locationName: center.displayName, locationFr: center.displayNameFr, lat: center.lat, lng: center.lng },
    }
  }

  // 5. Build detailed response with list + Leaflet map
  const textLines = [
    `${def.icon} **${specificName ? specificName + ' — ' : ''}${def.nameAr} في ${center.displayName}** 🇩🇿`,
    '',
  ]
  poiResults.slice(0, 8).forEach((p, i) => {
    textLines.push(`**${i + 1}. ${p.name}**`)
    if (p.address) textLines.push(`   📍 ${typeof p.address === 'string' ? p.address : _formatAddr(p.address, center.displayName)}`)
    if (p.phone)   textLines.push(`   📞 ${p.phone}`)
    textLines.push(`   🗺️ [فتح في الخريطة](https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}&zoom=17)`)
    textLines.push('')
  })
  textLines.push(`> المصدر: OpenStreetMap 🌍 | ${poiResults.length} نتيجة في ${center.displayName}`)

  const mapHtml = _buildPoiLeafletMap(poiResults.slice(0, 8), def, center.displayName)

  return {
    content: textLines.join('\n'),
    isMap:   true,
    mapHtml,
    mapMeta: { type: 'poi', poiKey, poiIcon: def.icon, poiNameAr: def.nameAr, locationName: center.displayName, locationFr: center.displayNameFr, lat: center.lat, lng: center.lng },
  }
}

// ───────────────────────── POI Search Helpers ─────────────────────────

function _extractSpecificName(msg, poiKey) {
  if (!poiKey || !POI_TYPES[poiKey]) return null
  let cleaned = msg
  for (const lbl of POI_TYPES[poiKey].labels) {
    cleaned = cleaned.replace(new RegExp(lbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
  }
  const prepMatch = cleaned.match(/(?:في|ب|بـ|بولاية|بمدينة)\s+.+$/i)
  if (prepMatch) cleaned = cleaned.replace(prepMatch[0], '')
  // Remove leading search verbs
  cleaned = cleaned.replace(/^(أبحث عن|ابحث عن|نحوس على|نقلب على|وين|فين|أين)\s*/i, '')
  const name = cleaned.trim()
  return name.length >= 2 ? name : null
}

async function _searchNominatimPoi(query, maxDistKm, centerLat, centerLng) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '8',
    addressdetails: '1',
    'accept-language': 'ar,fr',
    countrycodes: 'dz',
  })
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'DZ-Agent/2.0 (dz-gpt.vercel.app)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const results = await res.json()
    if (!Array.isArray(results)) return []
    return results
      .map(r => ({
        name: r.display_name?.split(',')[0]?.trim() || '',
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        address: r.address || {},
        phone: null,
        website: null,
      }))
      .filter(r => r.lat && r.lng && _haversineKm(centerLat, centerLng, r.lat, r.lng) <= maxDistKm)
  } catch { return [] }
}

function _haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function _formatAddr(addr, fallbackCity) {
  if (typeof addr === 'string') return addr
  const parts = [addr.road || addr.pedestrian || addr.neighbourhood || addr.suburb, addr.city || addr.town || addr.village || fallbackCity].filter(Boolean)
  return parts.join(', ')
}

function _buildPoiLeafletMap(places, def, locationLabel) {
  const valid = places.filter(p => p.lat && p.lng).map(p => ({
    lat: parseFloat(p.lat), lon: parseFloat(p.lng),
    name: (p.name || def.nameAr).trim(),
    addr: typeof p.address === 'string' ? p.address : _formatAddr(p.address, locationLabel),
  }))
  if (valid.length === 0) return ''

  const center = valid[0]
  const markersJSON = JSON.stringify(valid)
  const accentColor = '#006233'
  const pinColor = '#D21034'

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${def.icon} ${def.nameAr} في ${locationLabel}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{height:100%;overflow:hidden;font-family:'Segoe UI',Tahoma,Arial,sans-serif}
  #hdr{background:linear-gradient(135deg,${accentColor} 0%,${pinColor} 100%);color:#fff;padding:10px 14px;display:flex;align-items:center;gap:10px;position:relative;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,.25)}
  #hdr .ico{font-size:22px;line-height:1}
  #hdr .ttl{font-size:15px;font-weight:700;letter-spacing:.3px}
  #hdr .sub{font-size:11px;opacity:.85}
  #map{height:calc(100vh - 52px);width:100%}
  .lbl{background:${pinColor};color:#fff;border:2px solid #fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer}
</style>
</head>
<body>
<div id="hdr">
  <div class="ico">${def.icon}</div>
  <div>
    <div class="ttl">${def.nameAr} في ${locationLabel}</div>
    <div class="sub">${valid.length} نتيجة — OpenStreetMap 🌍</div>
  </div>
</div>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script>
const MARKERS = ${markersJSON};
const map = L.map('map',{zoomControl:true}).setView([${center.lat},${center.lon}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© <a href="https://osm.org/copyright">OpenStreetMap</a>',maxZoom:19
}).addTo(map);
const group = L.featureGroup();
MARKERS.forEach((m,i) => {
  const icon = L.divIcon({className:'',html:'<div class="lbl">'+(i+1)+'</div>',iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-18]});
  const popup = '<div style="font-family:sans-serif;min-width:160px;direction:rtl"><strong style="font-size:13px">'+(i+1)+'. '+m.name+'</strong>'+(m.addr?'<br><span style="color:#555;font-size:11px">📍 '+m.addr+'</span>':'')+'<br><a href="https://www.openstreetmap.org/?mlat='+m.lat+'&mlon='+m.lon+'&zoom=17" target="_blank" style="color:${accentColor};font-size:11px;text-decoration:none">فتح في OpenStreetMap ↗</a></div>';
  L.marker([m.lat,m.lon],{icon}).bindPopup(popup,{maxWidth:240}).addTo(map);
  group.addLayer(L.marker([m.lat,m.lon]));
});
if(MARKERS.length>1) map.fitBounds(group.getBounds().pad(0.25));
<\/script>
</body>
</html>`
}
