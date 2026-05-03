/**
 * DZ Maps — OSM Embed Builder v5
 * Builds OpenStreetMap embed URLs for POI, location, route, and GPS nearby.
 * No API key required — uses public OSM tile server.
 */

import { POI_TYPES } from './intent.js'

export const POI_EN_SEARCH = {
  hospital:    'hospital clinic',
  mosque:      'mosque masjid',
  restaurant:  'restaurant',
  fuel:        'gas station fuel',
  school:      'school university',
  bank:        'bank ATM',
  pharmacy:    'pharmacy',
  police:      'police station',
  post_office: 'post office',
  supermarket: 'supermarket grocery',
  hotel:       'hotel',
  park:        'park garden',
  airport:     'airport',
  government:  'city hall government',
  parking:     'parking',
}

/**
 * Internal: build OSM export embed URL
 * bbox = [west, south, east, north], optional marker
 */
function osmEmbed(lat, lng, d = 0.08, marker = true) {
  const w = (lng - d).toFixed(5)
  const s = (lat - d).toFixed(5)
  const e = (lng + d).toFixed(5)
  const n = (lat + d).toFixed(5)
  const mk = marker ? `&marker=${lat},${lng}` : ''
  return `https://www.openstreetmap.org/export/embed.html?bbox=${w},${s},${e},${n}&layer=mapnik${mk}`
}

/** POI search — wider view, no marker (shows surrounding area) */
export function buildPoiEmbedUrl(_poiKey, _cityFr, lat, lng) {
  if (lat && lng) return osmEmbed(lat, lng, 0.10, false)
  return null
}

/** Single location — tight zoom with pin marker */
export function buildLocationEmbedUrl(_cityFr, lat, lng) {
  if (lat && lng) return osmEmbed(lat, lng, 0.07, true)
  return null
}

/** Route A→B — bbox covering both endpoints */
export function buildRouteEmbedUrl(_fromFr, _toFr, fromLat, fromLng, toLat, toLng) {
  if (fromLat && fromLng && toLat && toLng) {
    const minLat = Math.min(fromLat, toLat) - 0.15
    const maxLat = Math.max(fromLat, toLat) + 0.15
    const minLng = Math.min(fromLng, toLng) - 0.15
    const maxLng = Math.max(fromLng, toLng) + 0.15
    return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng.toFixed(5)},${minLat.toFixed(5)},${maxLng.toFixed(5)},${maxLat.toFixed(5)}&layer=mapnik`
  }
  return null
}

/** GPS nearby — very tight zoom on user's exact coordinates */
export function buildNearbyEmbedUrl(lat, lng) {
  return osmEmbed(lat, lng, 0.030, true)
}

// ── Legacy HTML wrappers (kept for compatibility) ──────────────────────────
function wrapEmbed(embedUrl) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a12;height:100vh;display:flex;flex-direction:column}iframe{flex:1;border:none;width:100%;height:100%}</style></head><body><iframe src="${embedUrl}" allowfullscreen loading="lazy"></iframe></body></html>`
}

export function buildGeoCardHtml({ locationName, locationNameFr, lat, lng }) {
  const url = buildLocationEmbedUrl(locationNameFr || locationName, lat, lng)
  return url ? wrapEmbed(url) : ''
}

export function buildPoiMapHtml({ poiKey, locationName, locationNameFr, centerLat, centerLng }) {
  const url = buildPoiEmbedUrl(poiKey, locationNameFr || locationName, centerLat, centerLng)
  return url ? wrapEmbed(url) : ''
}

export function buildRouteMapHtml({ fromName, toName, fromLat, fromLng, toLat, toLng, fromNameFr, toNameFr }) {
  const url = buildRouteEmbedUrl(fromNameFr || fromName, toNameFr || toName, fromLat, fromLng, toLat, toLng)
  return url ? wrapEmbed(url) : ''
}

export function buildLocationMapHtml({ locationName, locationNameFr, lat, lng }) {
  return buildGeoCardHtml({ locationName, locationNameFr, lat, lng })
}
