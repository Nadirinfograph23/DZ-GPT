/**
 * DZ Maps — Leaflet HTML Builder
 * Generates standalone interactive Leaflet.js map pages
 * Uses Leaflet CDN + OpenStreetMap tiles — 100% free & open source
 * v2: Enhanced geo card, professional UI
 */

import { POI_TYPES } from './intent.js'

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

/**
 * Build professional GEO CARD HTML for a verified location
 * Includes: name, type, parent wilaya, coordinates, interactive map, Google Maps link
 */
export function buildGeoCardHtml({ locationName, locationNameFr, lat, lng, type, parent, parentFr, confidence, zoom = 13 }) {
  const safeLocation = escHtml(locationName)
  const safeLocationFr = escHtml(locationNameFr || locationName)
  const gmapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
  const osmUrl   = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`

  const typeBadge  = type  ? `<span class="badge badge-type">${escHtml(type)}</span>` : ''
  const parentLine = parent ? `<div class="info-row"><span class="info-icon">🧭</span><span class="info-label">التابعة لـ</span><span class="info-val">ولاية ${escHtml(parent)}${parentFr ? ` / ${escHtml(parentFr)}` : ''}</span></div>` : ''
  const frLine     = locationNameFr && locationNameFr !== locationName
    ? `<div class="info-row"><span class="info-icon">🇫🇷</span><span class="info-label">بالفرنسية</span><span class="info-val">${safeLocationFr}</span></div>`
    : ''

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>📍 ${safeLocation}</title>
<link rel="stylesheet" href="${LEAFLET_CSS}">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Tahoma,sans-serif;background:#0a0a12;color:#e0e0e0;direction:rtl;height:100vh;display:flex;flex-direction:column;overflow:hidden}
  #card{background:linear-gradient(135deg,#12122a 0%,#0f1a2e 100%);border-bottom:1px solid #00ff9030;padding:14px 16px;flex-shrink:0}
  #card-header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
  #card-header h1{font-size:18px;color:#fff;font-weight:700;flex:1}
  .badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
  .badge-type{background:#00ff9015;color:#00ff90;border:1px solid #00ff9040}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
  .info-row{display:flex;align-items:center;gap:6px;font-size:12px;padding:5px 8px;background:#ffffff08;border-radius:6px;border:1px solid #ffffff10}
  .info-icon{font-size:14px;flex-shrink:0}
  .info-label{color:#888;flex-shrink:0}
  .info-val{color:#ccc;font-weight:500;word-break:break-all}
  .coords-val{font-family:monospace;color:#00ff90;font-size:11px}
  #links{display:flex;gap:8px;margin-top:10px}
  .link-btn{flex:1;padding:6px 10px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600;text-decoration:none;text-align:center;display:inline-flex;align-items:center;justify-content:center;gap:5px}
  .link-gmap{background:#4285f420;color:#4285f4;border:1px solid #4285f440}
  .link-osm{background:#00ff9015;color:#00ff90;border:1px solid #00ff9040}
  .link-btn:hover{opacity:0.8}
  #map{flex:1;min-height:0}
  .leaflet-popup-content-wrapper{direction:rtl;font-family:'Segoe UI',sans-serif}
  @media(max-width:480px){.info-grid{grid-template-columns:1fr}#card-header h1{font-size:15px}}
</style>
</head>
<body>
<div id="card">
  <div id="card-header">
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
  </div>
  <div id="links">
    <a class="link-btn link-gmap" href="${gmapsUrl}" target="_blank">🗺️ Google Maps</a>
    <a class="link-btn link-osm" href="${osmUrl}" target="_blank">🌐 OpenStreetMap</a>
  </div>
</div>
<div id="map"></div>
<script src="${LEAFLET_JS}"></script>
<script>
  var map = L.map('map',{zoomControl:true}).setView([${lat},${lng}],${zoom})
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://openstreetmap.org">OpenStreetMap</a>',maxZoom:19
  }).addTo(map)

  var icon = L.divIcon({
    html:'<div style="background:#00ff90;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 8px #00ff90aa"></div>',
    className:'',iconAnchor:[7,7]
  })
  L.marker([${lat},${lng}],{icon})
    .addTo(map)
    .bindPopup('<div style="direction:rtl;text-align:right"><b>📍 ${escJs(safeLocation)}</b>${type ? `<br><small>${escJs(type)}</small>` : ''}${parent ? `<br><small>ولاية ${escJs(parent)}</small>` : ''}<br><small style="color:#666">${lat.toFixed(5)}, ${lng.toFixed(5)}</small></div>')
    .openPopup()
</script>
</body>
</html>`
}

/**
 * Build full-page Leaflet HTML for POI results
 */
export function buildPoiMapHtml({ poiKey, locationName, centerLat, centerLng, pois }) {
  const def = POI_TYPES[poiKey] || { icon: '📍', nameAr: 'نتائج' }
  const safeLocation = escHtml(locationName || 'الجزائر')

  const markersJs = pois.map((p, i) => {
    const name    = escJs(p.nameAr || p.name || def.nameAr)
    const address = escJs(p.address || '')
    const dist    = p.distKm ? `${p.distKm} كم` : ''
    const phone   = p.phone ? `<br>📞 ${escJs(p.phone)}` : ''
    const link    = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`
    return `
      var m${i} = L.marker([${p.lat},${p.lng}]).addTo(map)
        .bindPopup('<div class="popup"><b>${def.icon} ${name}</b>${address ? `<br>📍 ${address}` : ''}${dist ? `<br>📏 ${dist}` : ''}${phone}<br><a href="${escJs(link)}" target="_blank">🗺️ فتح في OpenStreetMap</a></div>')
    `
  }).join('\n')

  const boundsJs = pois.length > 1
    ? `map.fitBounds([${pois.map(p => `[${p.lat},${p.lng}]`).join(',')}], {padding:[40,40]})`
    : `map.setView([${centerLat},${centerLng}], 14)`

  const listItems = pois.map((p, i) => `
    <div class="poi-item" onclick="map.setView([${p.lat},${p.lng}],16); m${i}.openPopup()">
      <span class="poi-icon">${def.icon}</span>
      <div class="poi-info">
        <div class="poi-name">${escHtml(p.nameAr || p.name || def.nameAr)}</div>
        ${p.address ? `<div class="poi-addr">📍 ${escHtml(p.address)}</div>` : ''}
        ${p.distKm ? `<div class="poi-dist">📏 ${p.distKm} كم</div>` : ''}
        ${p.phone ? `<div class="poi-phone">📞 ${escHtml(p.phone)}</div>` : ''}
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
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Tahoma,sans-serif;background:#0a0a12;color:#e0e0e0;direction:rtl;height:100vh;display:flex;flex-direction:column;overflow:hidden}
  #header{background:linear-gradient(135deg,#12122a 0%,#0f1a2e 100%);padding:10px 16px;border-bottom:1px solid #00ff9020;display:flex;align-items:center;gap:10px;flex-shrink:0}
  #header h1{font-size:14px;color:#00ff90;font-weight:700}
  #header span{font-size:11px;color:#aaa}
  #count-badge{background:#00ff9020;color:#00ff90;border:1px solid #00ff9060;padding:3px 10px;border-radius:20px;font-size:12px;margin-right:auto}
  #main{display:flex;flex:1;overflow:hidden}
  #map{flex:1;z-index:1}
  #sidebar{width:260px;background:#111;overflow-y:auto;border-right:1px solid #00ff9020;flex-shrink:0}
  #sidebar-title{padding:10px 12px;font-size:12px;color:#00ff90;border-bottom:1px solid #1a1a1a;font-weight:600;background:#0f1117}
  .poi-item{padding:10px 12px;border-bottom:1px solid #1a1a1a;cursor:pointer;transition:background .2s;display:flex;align-items:flex-start;gap:8px}
  .poi-item:hover{background:#1a1a2e}
  .poi-icon{font-size:18px;flex-shrink:0;margin-top:2px}
  .poi-info{flex:1;min-width:0}
  .poi-name{font-size:12px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .poi-addr,.poi-dist,.poi-phone{font-size:10px;color:#999;margin-top:2px}
  .poi-dist{color:#00ff90}
  .poi-num{width:22px;height:22px;border-radius:50%;background:#00ff9020;color:#00ff90;font-size:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border:1px solid #00ff9050}
  .popup{direction:rtl;text-align:right;font-family:'Segoe UI',sans-serif;min-width:180px}
  .popup b{display:block;margin-bottom:4px;color:#1a1a2e}
  .popup a{color:#0066cc;font-size:11px;text-decoration:none;display:block;margin-top:6px}
  #no-results{padding:20px;text-align:center;color:#666;font-size:13px}
  .leaflet-popup-content-wrapper{direction:rtl}
  @media(max-width:600px){#sidebar{display:none}#map{flex:1}}
</style>
</head>
<body>
<div id="header">
  <h1>${def.icon} ${def.nameAr} في ${safeLocation}</h1>
  <div id="count-badge">${pois.length} نتيجة</div>
</div>
<div id="main">
  <div id="sidebar">
    <div id="sidebar-title">📋 قائمة النتائج</div>
    ${listItems || '<div id="no-results">لا توجد نتائج</div>'}
  </div>
  <div id="map"></div>
</div>
<script src="${LEAFLET_JS}"></script>
<script>
  var map = L.map('map', {zoomControl:true,attributionControl:true})
    .setView([${centerLat},${centerLng}], 13)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map)

  L.circleMarker([${centerLat},${centerLng}], {
    radius:8, color:'#00ff90', fillColor:'#00ff90', fillOpacity:0.3, weight:2
  }).addTo(map).bindPopup('📍 ${escJs(safeLocation)}')

  ${markersJs}
  ${boundsJs}
</script>
</body>
</html>`
}

/**
 * Build routing map HTML (from A to B)
 */
export function buildRouteMapHtml({ fromName, toName, fromLat, fromLng, toLat, toLng, route }) {
  const routeJs = route?.geometry?.length
    ? `L.polyline(${JSON.stringify(route.geometry.map(([lng,lat]) => [lat,lng]))}, {color:'#00ff90',weight:4,opacity:0.8}).addTo(map).bindPopup('🛣️ ${escJs(fromName)} → ${escJs(toName)}<br>📏 ${route.distanceKm} كم — ⏱️ ${route.durationMin} دقيقة')`
    : ''

  const fitJs = route?.geometry?.length
    ? `map.fitBounds(${JSON.stringify(route.geometry.map(([lng,lat]) => [lat,lng]))}, {padding:[40,40]})`
    : `map.fitBounds([[${fromLat},${fromLng}],[${toLat},${toLng}]], {padding:[60,60]})`

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🗺️ مسار: ${escHtml(fromName)} ← ${escHtml(toName)}</title>
<link rel="stylesheet" href="${LEAFLET_CSS}">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Tahoma,sans-serif;background:#0a0a12;color:#e0e0e0;direction:rtl;height:100vh;display:flex;flex-direction:column}
  #header{background:linear-gradient(135deg,#12122a,#0f1a2e);padding:12px 16px;border-bottom:1px solid #00ff9020;flex-shrink:0}
  #header h1{font-size:14px;color:#00ff90;margin-bottom:8px}
  .route-stats{display:flex;gap:8px;flex-wrap:wrap}
  .stat{background:#00ff9015;border:1px solid #00ff9030;border-radius:8px;padding:4px 12px;color:#00ff90;font-size:12px}
  #map{flex:1}
</style>
</head>
<body>
<div id="header">
  <h1>🗺️ مسار: ${escHtml(fromName)} ← ${escHtml(toName)}</h1>
  <div class="route-stats">
    ${route ? `<div class="stat">📏 ${route.distanceKm} كم</div><div class="stat">⏱️ ~${route.durationMin} دقيقة</div>` : ''}
    <div class="stat">🚗 بالسيارة</div>
  </div>
</div>
<div id="map"></div>
<script src="${LEAFLET_JS}"></script>
<script>
  var map = L.map('map').setView([${(fromLat+toLat)/2},${(fromLng+toLng)/2}], 7)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://openstreetmap.org">OpenStreetMap</a>',maxZoom:19
  }).addTo(map)

  var iconA = L.divIcon({html:'<div style="background:#00ff90;color:#000;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap">🟢 ${escJs(fromName)}</div>',className:''})
  var iconB = L.divIcon({html:'<div style="background:#ff4444;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap">🔴 ${escJs(toName)}</div>',className:''})

  L.marker([${fromLat},${fromLng}],{icon:iconA}).addTo(map)
  L.marker([${toLat},${toLng}],  {icon:iconB}).addTo(map)

  ${routeJs}
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
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function escJs(s) {
  return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,'')
}
function calcBbox(lat, lng, delta) {
  return [lng-delta, lat-delta, lng+delta, lat+delta].join(',')
}
