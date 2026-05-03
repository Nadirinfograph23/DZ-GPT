// DZ Place Search — OpenStreetMap Nominatim real-place finder for Algeria
// Free, no API key required. Returns real addresses + Leaflet map HTML.
//
// Exports:
//   searchPlaces(serviceType, location, limit?)  → raw Nominatim results[]
//   buildPlaceResponse(results, serviceType, location, style) → { text, mapHtml, count }
//   PLACE_INTENTS  — set of intent types this module handles

export const PLACE_INTENTS = new Set(['search_places','search_pharmacy','search_hospital'])

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const UA        = 'DZ-Agent/2.0 (dz-gpt.vercel.app contact: nadir@infograph.dz)'

// ─── OSM service type config ────────────────────────────────────────────────
export const SERVICE_CONFIG = {
  restaurant: { amenity:'restaurant',        labelAr:'مطعم',       labelFr:'Restaurant',      emoji:'🍽️' },
  cafe:       { amenity:'cafe',              labelAr:'مقهى',       labelFr:'Café',            emoji:'☕' },
  pharmacy:   { amenity:'pharmacy',          labelAr:'صيدلية',     labelFr:'Pharmacie',       emoji:'💊' },
  hospital:   { amenity:'hospital',          labelAr:'مستشفى',     labelFr:'Hôpital',         emoji:'🏥' },
  clinic:     { amenity:'clinic',            labelAr:'عيادة',      labelFr:'Clinique',        emoji:'🏨' },
  bank:       { amenity:'bank',              labelAr:'بنك',        labelFr:'Banque',          emoji:'🏦' },
  school:     { amenity:'school',            labelAr:'مدرسة',      labelFr:'École',           emoji:'🏫' },
  hotel:      { amenity:'hotel',             labelAr:'فندق',       labelFr:'Hôtel',           emoji:'🏨' },
  gym:        { amenity:'fitness_centre',    labelAr:'صالة رياضية',labelFr:'Salle de sport',  emoji:'🏋️' },
  mosque:     { amenity:'place_of_worship',  labelAr:'مسجد',       labelFr:'Mosquée',         emoji:'🕌' },
  market:     { amenity:'supermarket',       labelAr:'سوق',        labelFr:'Supermarché',     emoji:'🛒' },
  station:    { amenity:'bus_station',       labelAr:'محطة',       labelFr:'Gare routière',   emoji:'🚌' },
}

// Map intent type → service type key
export const INTENT_TO_SERVICE = {
  search_pharmacy:  'pharmacy',
  search_hospital:  'hospital',
  search_places:    null,  // determined from entities.serviceType
}

// ─── Nominatim query ────────────────────────────────────────────────────────
export async function searchPlaces(serviceType, location, limit = 8) {
  const svc = SERVICE_CONFIG[serviceType] || SERVICE_CONFIG.restaurant
  const locQuery = (!location || location === 'موقعك الحالي') ? 'algérie' : location

  // Try structured query first (amenity + city + country)
  const params = new URLSearchParams({
    amenity: svc.amenity,
    city:    locQuery,
    country: 'Algeria',
    format:  'json',
    limit:   String(limit),
    addressdetails: '1',
    'accept-language': 'ar,fr,en',
    countrycodes: 'dz',
  })

  let results = []
  try {
    const resp = await fetch(`${NOMINATIM}?${params}`, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(7000),
    })
    if (resp.ok) results = await resp.json()
  } catch { /* fall through to free-text */ }

  // Fallback: free-text query if structured returned nothing
  if (!Array.isArray(results) || results.length === 0) {
    const fallbackParams = new URLSearchParams({
      q:       `${svc.labelFr} ${locQuery} Algeria`,
      format:  'json',
      limit:   String(limit),
      addressdetails: '1',
      'accept-language': 'ar,fr,en',
      countrycodes: 'dz',
    })
    try {
      const resp2 = await fetch(`${NOMINATIM}?${fallbackParams}`, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(7000),
      })
      if (resp2.ok) results = await resp2.json()
    } catch { /* give up */ }
  }

  if (!Array.isArray(results)) return []

  // Filter results to ensure they belong to the requested location
  if (location && location !== 'موقعك الحالي' && location !== 'algérie') {
    const locLower = location.toLowerCase()
    const filtered = results.filter(r => {
      const addr = r.address || {}
      const addrCity = (addr.city || addr.town || addr.village || addr.county || addr.state || '').toLowerCase()
      const displayName = (r.display_name || '').toLowerCase()
      return addrCity.includes(locLower) || locLower.includes(addrCity) || displayName.includes(locLower)
    })
    if (filtered.length > 0) return filtered
  }

  return results
}

// ─── Format response ────────────────────────────────────────────────────────
export function buildPlaceResponse(results, serviceType, location, style = 'darija') {
  const svc   = SERVICE_CONFIG[serviceType] || { labelAr:'مكان', labelFr:'Lieu', emoji:'📍' }
  const loc   = location || 'الجزائر'
  const isDZ  = ['darija','franco','mixed'].includes(style)
  const isFr  = style === 'french'

  if (!results || results.length === 0) {
    const noResult = isDZ
      ? `${svc.emoji} ما لقيت ${svc.labelAr} في ${loc} — جرب تكتب اسم المدينة بالعربية أو الفرنسية.`
      : isFr
        ? `${svc.emoji} Aucun(e) ${svc.labelFr} trouvé(e) à ${loc}. Essayez avec une autre ville.`
        : `${svc.emoji} لم يتم العثور على ${svc.labelAr} في ${loc}. جرب اسم المدينة بالفرنسية.`
    return { text: noResult, mapHtml: null, count: 0 }
  }

  const lines = []

  // Header
  if (isDZ) {
    lines.push(`${svc.emoji} **كاين ${results.length} ${svc.labelAr} في ${loc}** 🇩🇿`)
  } else if (isFr) {
    lines.push(`${svc.emoji} **${results.length} ${svc.labelFr} trouvé(s) à ${loc}**`)
  } else {
    lines.push(`${svc.emoji} **تم العثور على ${results.length} ${svc.labelAr} في ${loc}**`)
  }
  lines.push('')

  results.slice(0, 8).forEach((place, i) => {
    const name    = (place.name || place.display_name?.split(',')[0] || svc.labelAr).trim()
    const addr    = place.address || {}
    const street  = addr.road || addr.pedestrian || addr.neighbourhood || addr.suburb || ''
    const city    = addr.city || addr.town || addr.village || addr.county || loc
    const short   = [street, city].filter(Boolean).join(', ')
    const osmLink = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}&zoom=17`

    lines.push(`**${i + 1}. ${name}**`)
    if (short) lines.push(`   📍 ${short}`)
    lines.push(`   🗺️ [فتح في الخريطة](${osmLink})`)
    lines.push('')
  })

  // Footer
  if (isDZ) {
    lines.push(`> المصدر: OpenStreetMap 🌍 | كبّس على "فتح في الخريطة" باش تشوف الموقع بالضبط.`)
  } else if (isFr) {
    lines.push(`> Source: OpenStreetMap 🌍 | Cliquez sur "Ouvrir dans la carte" pour localiser.`)
  } else {
    lines.push(`> المصدر: OpenStreetMap 🌍 | انقر على "فتح في الخريطة" للعثور على الموقع.`)
  }

  const mapHtml = _buildLeafletMap(results, svc, loc)
  return { text: lines.join('\n'), mapHtml, count: results.length }
}

// ─── Leaflet mini-map HTML ────────────────────────────────────────────────
function _buildLeafletMap(places, svc, locationLabel) {
  const valid = places
    .filter(p => p.lat && p.lon)
    .map(p => ({
      lat:  parseFloat(p.lat),
      lon:  parseFloat(p.lon),
      name: (p.name || p.display_name?.split(',')[0] || svc.labelAr || '').trim(),
      addr: [p.address?.road, p.address?.city || p.address?.town].filter(Boolean).join(', '),
    }))

  if (valid.length === 0) return null

  const center       = valid[0]
  const markersJSON  = JSON.stringify(valid)
  const accentColor  = '#006233'  // Algerian green
  const pinColor     = '#D21034'  // Algerian red

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${svc.emoji} ${svc.labelAr} في ${locationLabel}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{height:100%;overflow:hidden;font-family:'Segoe UI',Tahoma,Arial,sans-serif}
  #hdr{
    background:linear-gradient(135deg,${accentColor} 0%,${pinColor} 100%);
    color:#fff;padding:10px 14px;display:flex;align-items:center;gap:10px;
    position:relative;z-index:1000;box-shadow:0 2px 8px rgba(0,0,0,.25)
  }
  #hdr .ico{font-size:22px;line-height:1}
  #hdr .ttl{font-size:15px;font-weight:700;letter-spacing:.3px}
  #hdr .sub{font-size:11px;opacity:.85}
  #map{height:calc(100vh - 52px);width:100%}
  .lbl{
    background:${pinColor};color:#fff;border:2px solid #fff;
    border-radius:50%;width:30px;height:30px;
    display:flex;align-items:center;justify-content:center;
    font-size:13px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.4);
    cursor:pointer
  }
</style>
</head>
<body>
<div id="hdr">
  <div class="ico">${svc.emoji}</div>
  <div>
    <div class="ttl">${svc.labelAr} في ${locationLabel}</div>
    <div class="sub">${valid.length} نتيجة — OpenStreetMap 🌍</div>
  </div>
</div>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const MARKERS = ${markersJSON};
const map = L.map('map',{zoomControl:true}).setView([${center.lat},${center.lon}],14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© <a href="https://osm.org/copyright">OpenStreetMap</a>',
  maxZoom:19
}).addTo(map);

const group = L.featureGroup();
MARKERS.forEach((m,i) => {
  const icon = L.divIcon({
    className:'',
    html:'<div class="lbl">'+(i+1)+'</div>',
    iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-18]
  });
  const popup = '<div style="font-family:sans-serif;min-width:160px;direction:rtl">'
    +'<strong style="font-size:13px">'+(i+1)+'. '+m.name+'</strong>'
    +(m.addr?'<br><span style="color:#555;font-size:11px">📍 '+m.addr+'</span>':'')
    +'<br><a href="https://www.openstreetmap.org/?mlat='+m.lat+'&mlon='+m.lon+'&zoom=17" target="_blank" style="color:${accentColor};font-size:11px;text-decoration:none">فتح في OpenStreetMap ↗</a>'
    +'</div>';
  L.marker([m.lat,m.lon],{icon}).bindPopup(popup,{maxWidth:240}).addTo(map);
  group.addLayer(L.marker([m.lat,m.lon]));
});
if(MARKERS.length>1) map.fitBounds(group.getBounds().pad(0.25));
</script>
</body>
</html>`
}
