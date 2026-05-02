/**
 * DZ Maps — Leaflet HTML Builder
 * Generates standalone interactive Leaflet.js map pages
 * Uses Leaflet CDN + OpenStreetMap tiles — 100% free & open source
 */

import { POI_TYPES } from './intent.js'

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

/**
 * Build full-page Leaflet HTML for POI results
 * @param {object} opts
 * @param {string} opts.poiKey
 * @param {string} opts.locationName
 * @param {number} opts.centerLat
 * @param {number} opts.centerLng
 * @param {Array}  opts.pois
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
  body{font-family:'Segoe UI',Tahoma,sans-serif;background:#0f0f0f;color:#e0e0e0;direction:rtl;height:100vh;display:flex;flex-direction:column;overflow:hidden}
  #header{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:10px 16px;border-bottom:1px solid #00ff9020;display:flex;align-items:center;gap:10px;flex-shrink:0}
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

  // Center marker
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
  body{font-family:'Segoe UI',Tahoma,sans-serif;background:#0f0f0f;color:#e0e0e0;direction:rtl;height:100vh;display:flex;flex-direction:column}
  #header{background:linear-gradient(135deg,#1a1a2e,#16213e);padding:10px 16px;border-bottom:1px solid #00ff9020;flex-shrink:0}
  #header h1{font-size:14px;color:#00ff90;margin-bottom:6px}
  .route-stats{display:flex;gap:16px;font-size:12px}
  .stat{background:#00ff9015;border:1px solid #00ff9030;border-radius:8px;padding:4px 12px;color:#00ff90}
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
 * Build a simple location overview map HTML
 */
export function buildLocationMapHtml({ locationName, lat, lng, zoom = 13 }) {
  const safeLocation = escHtml(locationName)
  const bbox = calcBbox(lat, lng, 0.05)
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>📍 ${safeLocation}</title>
<link rel="stylesheet" href="${LEAFLET_CSS}">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0f0f0f;height:100vh;display:flex;flex-direction:column}
  #header{background:linear-gradient(135deg,#1a1a2e,#16213e);padding:10px 16px;border-bottom:1px solid #00ff9020;flex-shrink:0}
  #header h1{font-size:14px;color:#00ff90}
  #header p{font-size:11px;color:#888;margin-top:4px}
  #map{flex:1}
</style>
</head>
<body>
<div id="header">
  <h1>📍 ${safeLocation}</h1>
  <p>إحداثيات: ${lat.toFixed(4)}, ${lng.toFixed(4)}</p>
</div>
<div id="map"></div>
<script src="${LEAFLET_JS}"></script>
<script>
  var map = L.map('map').setView([${lat},${lng}],${zoom})
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'© <a href="https://openstreetmap.org">OpenStreetMap</a>',maxZoom:19
  }).addTo(map)
  L.marker([${lat},${lng}]).addTo(map)
    .bindPopup('📍 ${escJs(safeLocation)}').openPopup()
</script>
</body>
</html>`
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
