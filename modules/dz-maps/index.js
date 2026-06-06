/**
 * DZ Maps — Main Entry Point v6
 * Smart Map Intelligence Engine for DZ Agent
 * Uses OpenStreetMap embed (no API key) + Algeria local geo DB
 * GOLDEN RULE: No map shown without verified Algerian location
 *              EXCEPT for GPS nearby queries (needsGps: true)
 *
 * v6: GeoIntelligence Precision Layer integrated as a transparent upgrade
 *     to resolveLocation(). All existing routes and exports unchanged.
 */

export { isMapQuery, detectPoiType, isRoutingQuery, parseRouting, extractLocationFromMsg, hasGpsIntent, GPS_PROXIMITY_WORDS, POI_TYPES } from './intent.js'
export { geocode, reverseGeocode, searchPOI, getRoute } from './geo.js'
export { buildPoiMapHtml, buildRouteMapHtml, buildLocationMapHtml, buildGeoCardHtml, buildPoiEmbedUrl, buildLocationEmbedUrl, buildRouteEmbedUrl, buildNearbyEmbedUrl, POI_EN_SEARCH } from './leaflet-builder.js'

import { isMapQuery, detectPoiType, isRoutingQuery, parseRouting, extractLocationFromMsg, hasGpsIntent, POI_TYPES } from './intent.js'
import { buildPoiEmbedUrl, buildLocationEmbedUrl, buildRouteEmbedUrl } from './leaflet-builder.js'
import { searchGeoLocation } from './algeria-geo-db.js'
import { geocode, getRoute, searchPOI } from './geo.js'

// ── GeoIntelligence Precision Layer ──────────────────────────────────────
// Loaded lazily — if it fails for any reason, existing logic takes over.
let _geoIntel = null
async function getGeoIntel() {
  if (_geoIntel) return _geoIntel
  try {
    const mod = await import('./geo-intelligence/index.js')
    _geoIntel = mod
    return _geoIntel
  } catch (e) {
    console.warn('[GeoIntel] Precision layer unavailable, using legacy resolve:', e.message)
    return null
  }
}

/**
 * Resolve a location string → {lat, lng, displayName, displayNameFr, ...}
 * 1. GeoIntelligence Precision Layer (multi-source, fuzzy, ranked)
 * 2. Local Algeria geo DB (fast, fuzzy) — legacy fallback
 * 3. Nominatim geocode fallback (Algeria only) — last resort
 * NEVER returns Algiers as default — returns null if unknown
 */
async function resolveLocation(locationStr, opts = {}) {
  if (!locationStr || !locationStr.trim()) return null

  // ── Try GeoIntelligence Precision Layer first ─────────────────────────
  try {
    const gi = await getGeoIntel()
    if (gi?.precisionResolve) {
      const result = await gi.precisionResolve(locationStr, {
        localDBFn:  searchGeoLocation,
        nominatimFn: geocode,
        poiType:    opts.poiType   || null,
        userLat:    opts.userLat   || null,
        userLng:    opts.userLng   || null,
        fullQuery:  opts.fullQuery || null,
      })
      if (result?.found && result.lat && result.lng) {
        return {
          lat:            result.lat,
          lng:            result.lng,
          displayName:    result.displayName,
          displayNameFr:  result.displayNameFr,
          type:           result.type,
          parent:         result.parent,
          parentFr:       result.parentFr,
          confidence:     Math.round((result.confidence ?? 0) * 100),
          fromLocalDB:    result.fromLocalDB ?? false,
          // Precision-layer bonus fields
          district:       result.district   || null,
          city:           result.city       || null,
          wilaya:         result.wilaya     || null,
          mapLink:        result.mapLink    || null,
          googleMapsLink: result.googleMapsLink || null,
          nearbyLandmarks: result.nearbyLandmarks || [],
          isSingleResult: result.isSingleResult ?? true,
          suggestions:    result.suggestions || [],
          confidenceDetails: result.confidenceDetails || null,
        }
      }
    }
  } catch (e) {
    console.warn('[GeoIntel] Precision resolve error, falling back:', e.message)
  }

  // ── Legacy fallback: local DB ─────────────────────────────────────────
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

  // ── Legacy fallback: Nominatim ────────────────────────────────────────
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
      mapMeta: { type: 'poi', gmapsUrl, poiKey, poiIcon: def.icon, poiNameAr: def.nameAr, locationName: center.displayName, locationFr: center.displayNameFr, lat: center.lat, lng: center.lng, specificName: specificName || null },
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
    mapMeta: { type: 'poi', poiKey, poiIcon: def.icon, poiNameAr: def.nameAr, locationName: center.displayName, locationFr: center.displayNameFr, lat: center.lat, lng: center.lng, specificName: specificName || null },
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
  html,body{height:100%;overflow:hidden;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl}
  #hdr{background:linear-gradient(135deg,${accentColor} 0%,${pinColor} 100%);color:#fff;padding:8px 12px;display:flex;align-items:center;gap:8px;position:relative;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,.25);flex-wrap:wrap}
  #hdr .ico{font-size:20px;line-height:1}
  #hdr .ttl{font-size:14px;font-weight:700}
  #hdr .sub{font-size:10px;opacity:.85}
  #hdr .gps-btn{margin-right:auto;background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.5);color:#fff;padding:4px 10px;border-radius:20px;font-size:11px;cursor:pointer;white-space:nowrap;transition:background .2s}
  #hdr .gps-btn:hover{background:rgba(255,255,255,.35)}
  #wrap{display:flex;height:calc(100vh - 48px)}
  #sidebar{width:200px;min-width:160px;overflow-y:auto;background:#1a1a2e;border-left:1px solid #333;flex-shrink:0}
  #sidebar .s-item{padding:8px 10px;border-bottom:1px solid #2a2a3e;cursor:pointer;transition:background .15s;display:flex;gap:8px;align-items:flex-start}
  #sidebar .s-item:hover{background:#2a2a4e}
  #sidebar .s-item.active{background:#${accentColor.replace('#','')}22;border-right:3px solid ${accentColor}}
  #sidebar .s-num{background:${pinColor};color:#fff;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px}
  #sidebar .s-name{color:#e8e8f0;font-size:11px;line-height:1.3}
  #sidebar .s-addr{color:#888;font-size:9px;margin-top:2px}
  #map{flex:1;min-width:0}
  .lbl{background:${pinColor};color:#fff;border:2px solid #fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.4);cursor:pointer;transition:transform .15s}
  .lbl:hover,.lbl.sel{transform:scale(1.25);background:#1a73e8}
  #nav-bar{display:none;position:absolute;bottom:0;left:0;right:0;background:#1a1a2e;color:#fff;padding:8px 12px;z-index:900;font-size:12px;flex-direction:column;gap:4px}
  #nav-bar.show{display:flex}
  #nav-bar .nav-title{font-weight:700;color:#7ee8a2}
  #nav-bar .nav-links{display:flex;gap:8px;flex-wrap:wrap}
  #nav-bar .nav-links a{background:#1a73e8;color:#fff;padding:5px 12px;border-radius:16px;text-decoration:none;font-size:11px}
  #nav-bar .nav-links a.osm{background:${accentColor}}
  #nav-bar .nav-close{position:absolute;top:6px;left:8px;cursor:pointer;font-size:16px;color:#aaa}
  #user-marker-info{display:none;background:#1a73e8;color:#fff;padding:3px 8px;border-radius:12px;font-size:10px;margin-right:8px}
</style>
</head>
<body>
<div id="hdr">
  <div class="ico">${def.icon}</div>
  <div>
    <div class="ttl">${def.nameAr} في ${locationLabel}</div>
    <div class="sub">${valid.length} نتيجة — OpenStreetMap 🌍</div>
  </div>
  <span id="user-marker-info">📍 موقعك</span>
  <button class="gps-btn" onclick="locateUser()">📍 موقعي والتوجيه</button>
</div>
<div id="wrap">
  <div id="sidebar" id="poi-list"></div>
  <div id="map"></div>
</div>
<div id="nav-bar">
  <span class="nav-close" onclick="closeNav()">✕</span>
  <div class="nav-title" id="nav-name"></div>
  <div class="nav-links" id="nav-links"></div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script>
const MARKERS = ${markersJSON};
const map = L.map('map',{zoomControl:true}).setView([${center.lat},${center.lon}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© <a href="https://osm.org/copyright">OpenStreetMap</a>',maxZoom:19
}).addTo(map);

let userMarker = null;
let userLat = null, userLng = null;
let selectedIdx = -1;
const leafletMarkers = [];

// Build sidebar
const sidebar = document.getElementById('sidebar');
MARKERS.forEach((m, i) => {
  const item = document.createElement('div');
  item.className = 's-item';
  item.id = 'si-' + i;
  item.innerHTML = '<div class="s-num">'+(i+1)+'</div><div><div class="s-name">'+m.name+'</div>'+(m.addr?'<div class="s-addr">'+m.addr+'</div>':'')+'</div>';
  item.addEventListener('click', () => selectPoi(i));
  sidebar.appendChild(item);
});

// Build markers
const group = L.featureGroup();
MARKERS.forEach((m, i) => {
  const iconEl = L.divIcon({
    className:'',
    html:'<div class="lbl" id="lbl-'+i+'">'+(i+1)+'</div>',
    iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-18]
  });
  const mk = L.marker([m.lat,m.lon],{icon:iconEl});
  mk.on('click', () => selectPoi(i));
  mk.addTo(map);
  group.addLayer(mk);
  leafletMarkers.push(mk);
});

if(MARKERS.length > 1) map.fitBounds(group.getBounds().pad(0.2));

function selectPoi(i) {
  // Deselect previous
  if(selectedIdx >= 0) {
    const prev = document.getElementById('si-'+selectedIdx);
    if(prev) prev.classList.remove('active');
  }
  selectedIdx = i;
  const m = MARKERS[i];

  // Highlight sidebar item
  const item = document.getElementById('si-'+i);
  if(item) { item.classList.add('active'); item.scrollIntoView({block:'nearest'}); }

  // Pan map to marker
  map.setView([m.lat, m.lon], 16);

  // Show navigation bar
  const navName = document.getElementById('nav-name');
  const navLinks = document.getElementById('nav-links');
  navName.textContent = (i+1)+'. '+m.name+(m.addr ? ' — '+m.addr : '');

  let gLink = 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(m.name+' ${locationLabel} Algeria');
  let osmLink = 'https://www.openstreetmap.org/?mlat='+m.lat+'&mlon='+m.lon+'&zoom=17';

  // If user location known, build directions links
  if(userLat !== null && userLng !== null) {
    gLink = 'https://www.google.com/maps/dir/?api=1&origin='+userLat+','+userLng+'&destination='+m.lat+','+m.lon+'&travelmode=driving';
    osmLink = 'https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route='+userLat+','+userLng+';'+m.lat+','+m.lon;
  }

  navLinks.innerHTML =
    '<a href="'+gLink+'" target="_blank">🚗 '+(userLat!==null?'توجيه - ':'')+'Google Maps ↗</a>'+
    '<a href="'+osmLink+'" target="_blank" class="osm">🗺️ OpenStreetMap ↗</a>';

  document.getElementById('nav-bar').classList.add('show');
}

function closeNav() {
  document.getElementById('nav-bar').classList.remove('show');
}

function locateUser() {
  if(!navigator.geolocation) { alert('المتصفح لا يدعم تحديد الموقع'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;

    if(userMarker) userMarker.remove();
    const userIcon = L.divIcon({
      className:'',
      html:'<div style="width:16px;height:16px;background:#1a73e8;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 3px rgba(26,115,232,.3)"></div>',
      iconSize:[16,16],iconAnchor:[8,8]
    });
    userMarker = L.marker([userLat, userLng], {icon: userIcon, zIndexOffset: 1000}).addTo(map);
    userMarker.bindPopup('<div style="direction:rtl;font-size:12px">📍 موقعك الحالي</div>');

    document.getElementById('user-marker-info').style.display = 'inline-block';
    map.setView([userLat, userLng], 14);

    // If a POI is already selected, update nav links
    if(selectedIdx >= 0) selectPoi(selectedIdx);
  }, () => { alert('تعذّر تحديد موقعك. تأكد من السماح بالوصول للموقع.'); });
}
<\/script>
</body>
</html>`
}
