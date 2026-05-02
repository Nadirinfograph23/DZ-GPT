/**
 * DZ Maps — Leaflet HTML Builder v3
 * Professional Map Card UI with action buttons
 * Uses Leaflet CDN + OpenStreetMap tiles — 100% free & open source
 */

import { POI_TYPES } from './intent.js'

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

const BASE_STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#0a0a12;color:#e0e0e0;direction:rtl;height:100vh;display:flex;flex-direction:column;overflow:hidden}
  .map-card-header{background:linear-gradient(135deg,#0f1420 0%,#141b2e 100%);border-bottom:2px solid #00ff9030;padding:12px 16px;flex-shrink:0}
  .map-card-title{display:flex;align-items:center;gap:10px;margin-bottom:10px}
  .map-card-title h1{font-size:16px;color:#fff;font-weight:700;flex:1;line-height:1.3}
  .badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
  .badge-green{background:#00ff9015;color:#00ff90;border:1px solid #00ff9040}
  .badge-blue{background:#00ccff15;color:#00ccff;border:1px solid #00ccff40}
  .badge-orange{background:#ff990015;color:#ff9900;border:1px solid #ff990040}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
  .info-row{display:flex;align-items:center;gap:6px;font-size:12px;padding:5px 8px;background:#ffffff08;border-radius:6px;border:1px solid #ffffff10}
  .info-icon{font-size:13px;flex-shrink:0}
  .info-label{color:#777;flex-shrink:0;font-size:11px}
  .info-val{color:#ccc;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
  .coords-val{font-family:monospace;color:#00ff90;font-size:10px}
  .map-actions{display:flex;gap:8px;flex-wrap:wrap}
  .action-btn{flex:1;min-width:120px;padding:7px 12px;border-radius:9px;border:none;cursor:pointer;font-size:12px;font-weight:600;text-decoration:none;text-align:center;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .2s;font-family:inherit}
  .action-btn:hover{opacity:0.85;transform:translateY(-1px)}
  .btn-osm{background:#00ff9015;color:#00ff90;border:1px solid #00ff9040}
  .btn-gmaps{background:#4285f415;color:#4285f4;border:1px solid #4285f440}
  .btn-route{background:#ff990015;color:#ff9900;border:1px solid #ff990040}
  .btn-share{background:#9c27b015;color:#ce93d8;border:1px solid #9c27b040}
  #map{flex:1;min-height:0}
  .leaflet-popup-content-wrapper{direction:rtl;font-family:'Segoe UI',sans-serif;border-radius:10px!important;box-shadow:0 4px 20px rgba(0,0,0,.4)!important}
  .leaflet-popup-content{margin:10px 12px!important;font-size:12px}
  .popup-title{font-weight:700;color:#1a1a2e;margin-bottom:5px;font-size:13px}
  .popup-row{display:flex;align-items:center;gap:5px;margin:3px 0;color:#444;font-size:11px}
  .popup-link{color:#0066cc;font-size:11px;text-decoration:none;display:flex;align-items:center;gap:4px;margin-top:6px}
  @media(max-width:480px){.info-grid{grid-template-columns:1fr}.map-card-title h1{font-size:14px}.action-btn{font-size:11px;padding:6px 8px}}
`

/**
 * Build professional GEO CARD HTML for a verified location
 */
export function buildGeoCardHtml({ locationName, locationNameFr, lat, lng, type, parent, parentFr, confidence, zoom = 13 }) {
  const safeLocation = escHtml(locationName || 'موقع')
  const safeLocationFr = escHtml(locationNameFr || locationName || '')
  const gmapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
  const osmUrl   = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`
  const routeUrl = `https://www.openstreetmap.org/directions?from=&to=${lat}%2C${lng}`

  const typeBadge  = type ? `<span class="badge badge-green">${escHtml(type)}</span>` : ''
  const parentLine = parent
    ? `<div class="info-row"><span class="info-icon">🧭</span><span class="info-label">الولاية</span><span class="info-val">${escHtml(parent)}${parentFr ? ` / ${escHtml(parentFr)}` : ''}</span></div>`
    : ''
  const frLine = locationNameFr && locationNameFr !== locationName
    ? `<div class="info-row"><span class="info-icon">🇫🇷</span><span class="info-label">بالفرنسية</span><span class="info-val">${safeLocationFr}</span></div>`
    : ''
  const confLine = confidence
    ? `<div class="info-row"><span class="info-icon">✅</span><span class="info-label">دقة البحث</span><span class="info-val">${confidence}%</span></div>`
    : ''

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>📍 ${safeLocation}</title>
<link rel="stylesheet" href="${LEAFLET_CSS}">
<style>
${BASE_STYLES}
</style>
</head>
<body>
<div class="map-card-header">
  <div class="map-card-title">
    <h1>📍 ${safeLocation}</h1>
    ${typeBadge}
  </div>
  <div class="info-grid">
    ${frLine}
    ${parentLine}
    <div class="info-row">
      <span class="info-icon">🌍</span>
      <span class="info-label">الإحداثيات</span>
      <span class="info-val coords-val">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
    </div>
    ${type ? `<div class="info-row"><span class="info-icon">🏷️</span><span class="info-label">النوع</span><span class="info-val">${escHtml(type)}</span></div>` : ''}
    ${confLine}
  </div>
  <div class="map-actions">
    <a class="action-btn btn-osm" href="${osmUrl}" target="_blank">🗺️ فتح في OpenStreetMap</a>
    <a class="action-btn btn-gmaps" href="${gmapsUrl}" target="_blank">📍 Google Maps</a>
    <a class="action-btn btn-route" href="${routeUrl}" target="_blank">🚗 إنشاء مسار</a>
  </div>
</div>
<div id="map"></div>
<script src="${LEAFLET_JS}"></script>
<script>
  var map = L.map('map',{zoomControl:true}).setView([${lat},${lng}],${zoom})
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',maxZoom:19
  }).addTo(map)

  var pulseIcon = L.divIcon({
    html:'<div style="position:relative;width:24px;height:24px"><div style="position:absolute;inset:0;background:#00ff9040;border-radius:50%;animation:pulse 2s infinite"></div><div style="position:absolute;inset:4px;background:#00ff90;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px #00ff90aa"></div></div><style>@keyframes pulse{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.6);opacity:0}}</style>',
    className:'',iconAnchor:[12,12]
  })
  L.marker([${lat},${lng}],{icon:pulseIcon})
    .addTo(map)
    .bindPopup('<div class="popup-title">📍 ${escJs(safeLocation)}</div>${type ? `<div class="popup-row">🏷️ ${escJs(type)}</div>` : ''}${parent ? `<div class="popup-row">🧭 ولاية ${escJs(parent)}</div>` : ''}<div class="popup-row">🌍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</div><a class="popup-link" href="${escJs(osmUrl)}" target="_blank">🗺️ فتح في OpenStreetMap</a>')
    .openPopup()
</script>
</body>
</html>`
}

/**
 * Build full-page Leaflet HTML for POI results with sidebar
 */
export function buildPoiMapHtml({ poiKey, locationName, centerLat, centerLng, pois }) {
  const def = POI_TYPES[poiKey] || { icon: '📍', nameAr: 'نتائج' }
  const safeLocation = escHtml(locationName || 'الجزائر')
  const osmCenterUrl = `https://www.openstreetmap.org/?mlat=${centerLat}&mlon=${centerLng}#map=13/${centerLat}/${centerLng}`

  const markersJs = pois.map((p, i) => {
    const name    = escJs(p.nameAr || p.name || def.nameAr)
    const address = escJs(p.address || '')
    const dist    = p.distKm ? `${p.distKm} كم` : ''
    const phone   = p.phone ? `<div class="popup-row">📞 ${escJs(p.phone)}</div>` : ''
    const link    = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`
    const routeLink = `https://www.openstreetmap.org/directions?from=&to=${p.lat}%2C${p.lng}`
    return `
      var m${i} = L.marker([${p.lat},${p.lng}]).addTo(map)
        .bindPopup('<div class="popup-title">${def.icon} ${name}</div>${address ? `<div class="popup-row">📍 ${address}</div>` : ''}${dist ? `<div class="popup-row">📏 ${dist}</div>` : ''}${phone}<a class="popup-link" href="${escJs(link)}" target="_blank">🗺️ فتح في OSM</a><a class="popup-link" href="${escJs(routeLink)}" target="_blank">🚗 إنشاء مسار</a>')`
  }).join('\n')

  const boundsJs = pois.length > 1
    ? `map.fitBounds([${pois.map(p => `[${p.lat},${p.lng}]`).join(',')}], {padding:[50,50]})`
    : `map.setView([${centerLat},${centerLng}], 15)`

  const listItems = pois.map((p, i) => `
    <div class="poi-item" onclick="map.setView([${p.lat},${p.lng}],17);m${i}.openPopup()">
      <span class="poi-icon">${def.icon}</span>
      <div class="poi-info">
        <div class="poi-name">${escHtml(p.nameAr || p.name || def.nameAr)}</div>
        ${p.address ? `<div class="poi-meta">📍 ${escHtml(p.address)}</div>` : ''}
        ${p.distKm ? `<div class="poi-dist">📏 ${p.distKm} كم</div>` : ''}
        ${p.phone ? `<div class="poi-meta">📞 ${escHtml(p.phone)}</div>` : ''}
      </div>
      <div class="poi-num">${i + 1}</div>
    </div>
  `).join('')

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${def.icon} ${def.nameAr} — ${safeLocation}</title>
<link rel="stylesheet" href="${LEAFLET_CSS}">
<style>
${BASE_STYLES}
  body{height:100vh;flex-direction:column}
  .top-header{background:linear-gradient(135deg,#0f1420,#141b2e);padding:10px 14px;border-bottom:2px solid #00ff9030;flex-shrink:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .top-header-title{color:#00ff90;font-weight:700;font-size:14px;flex:1}
  .count-badge{background:#00ff9020;color:#00ff90;border:1px solid #00ff9060;padding:3px 12px;border-radius:20px;font-size:12px;font-weight:600;flex-shrink:0}
  .osm-link{background:#ffffff08;color:#aaa;border:1px solid #ffffff15;padding:3px 10px;border-radius:20px;font-size:11px;text-decoration:none;flex-shrink:0}
  .osm-link:hover{background:#ffffff15}
  #main{display:flex;flex:1;overflow:hidden}
  #map{flex:1;z-index:1}
  #sidebar{width:250px;background:#0d0d18;overflow-y:auto;border-right:1px solid #00ff9020;flex-shrink:0;display:flex;flex-direction:column}
  .sidebar-header{padding:10px 12px;font-size:12px;color:#00ff90;border-bottom:1px solid #1a1a2e;font-weight:600;background:#0f1117;flex-shrink:0;display:flex;align-items:center;gap:6px}
  .poi-item{padding:10px 12px;border-bottom:1px solid #1a1a2e;cursor:pointer;transition:background .15s;display:flex;align-items:flex-start;gap:8px}
  .poi-item:hover{background:#1a1a2e}
  .poi-icon{font-size:17px;flex-shrink:0;margin-top:2px}
  .poi-info{flex:1;min-width:0}
  .poi-name{font-size:12px;font-weight:600;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .poi-meta{font-size:10px;color:#777;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .poi-dist{font-size:10px;color:#00ff90;margin-top:2px;font-weight:600}
  .poi-num{width:22px;height:22px;border-radius:50%;background:#00ff9020;color:#00ff90;font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid #00ff9050;font-weight:700}
  @media(max-width:600px){#sidebar{display:none}}
</style>
</head>
<body>
<div class="top-header">
  <div class="top-header-title">${def.icon} ${def.nameAr} في ${safeLocation}</div>
  <div class="count-badge">${pois.length} نتيجة</div>
  <a class="osm-link" href="${osmCenterUrl}" target="_blank">🗺️ OSM</a>
</div>
<div id="main">
  <div id="sidebar">
    <div class="sidebar-header">📋 قائمة النتائج (${pois.length})</div>
    ${listItems || '<div style="padding:20px;text-align:center;color:#555;font-size:12px">لا توجد نتائج</div>'}
  </div>
  <div id="map"></div>
</div>
<script src="${LEAFLET_JS}"></script>
<script>
  var map = L.map('map',{zoomControl:true}).setView([${centerLat},${centerLng}],13)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',maxZoom:19
  }).addTo(map)

  L.circleMarker([${centerLat},${centerLng}],{
    radius:10,color:'#00ff90',fillColor:'#00ff90',fillOpacity:0.25,weight:2,dashArray:'4 4'
  }).addTo(map).bindPopup('📍 ${escJs(safeLocation)}')

  ${markersJs}
  ${boundsJs}
</script>
</body>
</html>`
}

/**
 * Build routing map HTML (from A to B) with stats overlay
 */
export function buildRouteMapHtml({ fromName, toName, fromLat, fromLng, toLat, toLng, route }) {
  const safeFrom = escHtml(fromName)
  const safeTo   = escHtml(toName)
  const midLat   = (fromLat + toLat) / 2
  const midLng   = (fromLng + toLng) / 2
  const osmRouteUrl = `https://www.openstreetmap.org/directions?from=${fromLat}%2C${fromLng}&to=${toLat}%2C${toLng}`
  const gmapsUrl = `https://www.google.com/maps/dir/${fromLat},${fromLng}/${toLat},${toLng}`

  const routePolylineJs = route?.geometry?.length
    ? `var routeLine = L.polyline(${JSON.stringify(route.geometry.map(([lng,lat]) => [lat,lng]))},{color:'#00ff90',weight:5,opacity:.9,lineJoin:'round'}).addTo(map)
       routeLine.bindPopup('<div style="text-align:right;direction:rtl"><b>🛣️ ${escJs(safeFrom)} ← ${escJs(safeTo)}</b><br>📏 ${route.distanceKm} كم — ⏱️ ${route.durationMin} دقيقة</div>')`
    : ''

  const fitJs = route?.geometry?.length
    ? `map.fitBounds(${JSON.stringify(route.geometry.map(([lng,lat]) => [lat,lng]))},{padding:[50,50]})`
    : `map.fitBounds([[${fromLat},${fromLng}],[${toLat},${toLng}]],{padding:[70,70]})`

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🗺️ ${safeFrom} ← ${safeTo}</title>
<link rel="stylesheet" href="${LEAFLET_CSS}">
<style>
${BASE_STYLES}
  body{flex-direction:column}
  .route-header{background:linear-gradient(135deg,#0f1420,#141b2e);padding:12px 16px;border-bottom:2px solid #00ff9030;flex-shrink:0}
  .route-title{font-size:14px;color:#fff;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .route-from{color:#00ff90}
  .route-to{color:#ff4444}
  .route-arrow{color:#888;font-size:18px}
  .route-stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
  .stat-pill{background:#00ff9015;border:1px solid #00ff9030;border-radius:20px;padding:5px 14px;color:#00ff90;font-size:12px;font-weight:600;display:flex;align-items:center;gap:5px}
  .stat-pill.orange{background:#ff990015;border-color:#ff990030;color:#ff9900}
</style>
</head>
<body>
<div class="route-header">
  <div class="route-title">
    🗺️ مسار:
    <span class="route-from">🟢 ${safeFrom}</span>
    <span class="route-arrow">→</span>
    <span class="route-to">🔴 ${safeTo}</span>
  </div>
  <div class="route-stats">
    ${route ? `
    <div class="stat-pill">📏 ${route.distanceKm} كم</div>
    <div class="stat-pill orange">⏱️ ~${route.durationMin} دقيقة بالسيارة</div>
    ` : ''}
    <div class="stat-pill">🚗 طريق بري</div>
  </div>
  <div class="map-actions" style="display:flex;gap:8px;flex-wrap:wrap">
    <a class="action-btn btn-osm" style="flex:1;min-width:120px;padding:6px 12px;border-radius:8px;border:1px solid #00ff9040;background:#00ff9015;color:#00ff90;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;font-size:11px;font-weight:600" href="${osmRouteUrl}" target="_blank">🗺️ تفاصيل الطريق في OSM</a>
    <a class="action-btn btn-gmaps" style="flex:1;min-width:120px;padding:6px 12px;border-radius:8px;border:1px solid #4285f440;background:#4285f415;color:#4285f4;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;font-size:11px;font-weight:600" href="${gmapsUrl}" target="_blank">📍 Google Maps</a>
  </div>
</div>
<div id="map"></div>
<script src="${LEAFLET_JS}"></script>
<script>
  var map = L.map('map',{zoomControl:true}).setView([${midLat},${midLng}],7)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://openstreetmap.org">OpenStreetMap</a>',maxZoom:19
  }).addTo(map)

  var iconA = L.divIcon({html:'<div style="background:#00ff90;color:#000;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,255,144,.4)">🟢 ${escJs(safeFrom)}</div>',className:'',iconAnchor:[0,0]})
  var iconB = L.divIcon({html:'<div style="background:#ff4444;color:#fff;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(255,68,68,.4)">🔴 ${escJs(safeTo)}</div>',className:'',iconAnchor:[0,0]})

  L.marker([${fromLat},${fromLng}],{icon:iconA}).addTo(map)
  L.marker([${toLat},${toLng}],  {icon:iconB}).addTo(map)

  ${routePolylineJs}
  ${fitJs}
</script>
</body>
</html>`
}

/**
 * Build a simple location overview map HTML (legacy fallback)
 */
export function buildLocationMapHtml({ locationName, lat, lng, zoom = 13 }) {
  return buildGeoCardHtml({ locationName, locationNameFr: locationName, lat, lng, type: null, parent: null, zoom })
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function escJs(s) {
  return String(s || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,'')
}
