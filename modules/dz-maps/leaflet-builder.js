/**
 * DZ Maps — Google Maps Embed Builder v4
 * Builds Google Maps embed URLs for POI, location, and route queries.
 * No API key required — uses public Google Maps embed endpoint.
 */

import { POI_TYPES } from './intent.js'

// English search terms for each POI type (used in Google Maps query)
const POI_EN_SEARCH = {
  hospital:     'hospital',
  mosque:       'mosque',
  restaurant:   'restaurant',
  fuel:         'gas station',
  school:       'school',
  bank:         'bank ATM',
  pharmacy:     'pharmacy',
  police:       'police station',
  post_office:  'post office',
  supermarket:  'supermarket',
  hotel:        'hotel',
  park:         'park',
  airport:      'airport',
  government:   'city hall government',
  parking:      'parking',
}

/**
 * Build a Google Maps embed URL for a POI search
 * e.g. "hospital in Annaba Algeria"
 */
export function buildPoiEmbedUrl(poiKey, cityFr) {
  const enSearch = POI_EN_SEARCH[poiKey] || (POI_TYPES[poiKey]?.nameAr) || 'place'
  const q = `${enSearch} in ${cityFr} Algeria`
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`
}

/**
 * Build a Google Maps embed URL for a specific location
 * e.g. "Annaba Algeria"
 */
export function buildLocationEmbedUrl(cityFr) {
  const q = `${cityFr} Algeria`
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`
}

/**
 * Build a Google Maps embed URL for routing (A → B)
 */
export function buildRouteEmbedUrl(fromFr, toFr) {
  const saddr = `${fromFr} Algeria`
  const daddr = `${toFr} Algeria`
  return `https://www.google.com/maps?saddr=${encodeURIComponent(saddr)}&daddr=${encodeURIComponent(daddr)}&output=embed`
}

/**
 * Build full card HTML using Google Maps embed iframe
 * Used as legacy mapHtml (iframe with embedded Google Maps)
 */
export function buildGeoCardHtml({ locationName, locationNameFr, lat, lng }) {
  const q = encodeURIComponent(`${locationNameFr || locationName} Algeria`)
  const embedUrl = `https://www.google.com/maps?q=${q}&output=embed`
  return buildMapCardHtml({ title: `📍 ${locationName}`, embedUrl, type: 'location' })
}

export function buildPoiMapHtml({ poiKey, locationName, locationNameFr, centerLat, centerLng, pois }) {
  const def = POI_TYPES[poiKey] || { icon: '📍', nameAr: 'نتائج' }
  const cityFr = locationNameFr || locationName
  const embedUrl = buildPoiEmbedUrl(poiKey, cityFr)
  return buildMapCardHtml({ title: `${def.icon} ${def.nameAr} في ${locationName}`, embedUrl, type: 'poi' })
}

export function buildRouteMapHtml({ fromName, toName, fromLat, fromLng, toLat, toLng, route, fromNameFr, toNameFr }) {
  const embedUrl = buildRouteEmbedUrl(fromNameFr || fromName, toNameFr || toName)
  return buildMapCardHtml({ title: `🗺️ ${fromName} → ${toName}`, embedUrl, type: 'route' })
}

export function buildLocationMapHtml({ locationName, locationNameFr, lat, lng }) {
  return buildGeoCardHtml({ locationName, locationNameFr, lat, lng })
}

// ── Internal helper ────────────────────────────────────────────────────────
function buildMapCardHtml({ title, embedUrl }) {
  // Return a minimal wrapper — MapPreview will use meta.gmapsUrl directly
  // This HTML is only used as legacy fallback
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a12;display:flex;flex-direction:column;height:100vh}iframe{flex:1;border:none;width:100%;height:100%}</style></head><body><iframe src="${embedUrl}" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></body></html>`
}
