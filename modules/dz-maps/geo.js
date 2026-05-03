/**
 * DZ Maps — Geocoding & POI Engine
 * Uses Nominatim (geocoding) + Overpass API (POI search) — 100% free & open source
 */

import https from 'https'
import { POI_TYPES } from './intent.js'

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org'
const OVERPASS_BASE  = 'https://overpass-api.de/api/interpreter'
const UA = 'DZ-Agent/1.0 (dz-gpt.vercel.app; contact@dzgpt.dz)'

/**
 * Simple HTTPS GET returning parsed JSON
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    }
    https.get(url, opts, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error('JSON parse error: ' + data.slice(0, 120))) }
      })
    }).on('error', reject)
  })
}

/**
 * Simple HTTPS POST returning parsed JSON (for Overpass)
 */
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body)
    const opts = {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': buf.length,
      },
    }
    const u = new URL(url)
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, ...opts }, (res) => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { reject(new Error('Overpass parse error')) }
      })
    })
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

/**
 * Geocode a place name → { lat, lng, displayName, boundingBox }
 * Always restricted to Algeria (countrycodes=dz)
 */
export async function geocode(query, restrictDZ = true) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
    addressdetails: '1',
    'accept-language': 'ar,fr',
  })
  if (restrictDZ) params.set('countrycodes', 'dz')

  const url = `${NOMINATIM_BASE}/search?${params}`
  const results = await fetchJson(url)

  if (!results?.length) {
    if (restrictDZ) return geocode(query, false)
    return null
  }
  const r = results[0]
  return {
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    displayName: r.display_name,
    boundingBox: r.boundingbox?.map(Number) || null,
    type: r.type,
    osmId: r.osm_id,
  }
}

/**
 * Reverse geocode lat/lng → address string
 */
export async function reverseGeocode(lat, lng) {
  const url = `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ar,fr`
  const r = await fetchJson(url)
  return r?.display_name || null
}

/**
 * Search POIs near a location using Overpass API
 * Returns array of { name, lat, lng, address, tags, osmId }
 */
export async function searchPOI(poiKey, lat, lng, radiusM = 5000, limit = 15) {
  const def = POI_TYPES[poiKey]
  if (!def) return []

  const osmFilter = def.osm
  // Build Overpass QL query
  const query = `[out:json][timeout:15];
(
  node[${osmFilter}](around:${radiusM},${lat},${lng});
  way[${osmFilter}](around:${radiusM},${lat},${lng});
  relation[${osmFilter}](around:${radiusM},${lat},${lng});
);
out center ${limit};`

  const body = `data=${encodeURIComponent(query)}`
  const data = await postJson(OVERPASS_BASE, body)

  if (!data?.elements?.length) return []

  return data.elements.map(el => {
    const elat = el.lat ?? el.center?.lat
    const elng = el.lon ?? el.center?.lon
    const dist = elat && elng ? haversineKm(lat, lng, elat, elng) : null
    return {
      osmId: el.id,
      name: el.tags?.name || el.tags?.['name:ar'] || el.tags?.['name:fr'] || def.nameAr,
      nameAr: el.tags?.['name:ar'] || el.tags?.name || def.nameAr,
      lat: elat,
      lng: elng,
      phone: el.tags?.phone || el.tags?.['contact:phone'] || null,
      website: el.tags?.website || el.tags?.['contact:website'] || null,
      address: buildAddress(el.tags),
      distKm: dist,
      tags: el.tags || {},
    }
  }).filter(p => p.lat && p.lng)
    .sort((a, b) => (a.distKm || 999) - (b.distKm || 999))
    .slice(0, limit)
}

/**
 * Get routing via OSRM (free, open source)
 * Returns { distance, duration, geometry: [[lng,lat],...] }
 */
export async function getRoute(fromLat, fromLng, toLat, toLng) {
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`
  try {
    const data = await fetchJson(url)
    if (!data?.routes?.length) return null
    const r = data.routes[0]
    return {
      distanceKm: (r.distance / 1000).toFixed(1),
      durationMin: Math.round(r.duration / 60),
      geometry: r.geometry?.coordinates || [],
    }
  } catch { return null }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))).toFixed(2)
}

function buildAddress(tags) {
  if (!tags) return ''
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
    tags['addr:state'],
  ].filter(Boolean)
  return parts.join('، ') || ''
}
