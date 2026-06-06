/**
 * DZ Maps — Overpass API Client v1
 * Fetches real POI data from OpenStreetMap near given GPS coordinates.
 * Uses public Overpass API — no key required.
 */

// OSM Overpass tag filters per POI type
const OVERPASS_TAGS = {
  hospital:    [['amenity', '~"hospital|clinic|doctors"']],
  mosque:      [['amenity', '"place_of_worship"'], ['religion', '"muslim"']],
  restaurant:  [['amenity', '~"restaurant|fast_food|cafe"']],
  fuel:        [['amenity', '"fuel"']],
  school:      [['amenity', '~"school|university|college"']],
  bank:        [['amenity', '~"bank|atm"']],
  pharmacy:    [['amenity', '"pharmacy"']],
  police:      [['amenity', '"police"']],
  post_office: [['amenity', '"post_office"']],
  supermarket: [['shop', '~"supermarket|convenience|grocery"']],
  hotel:       [['tourism', '~"hotel|hostel|guest_house"']],
  park:        [['leisure', '~"park|garden"']],
  airport:     [['aeroway', '"aerodrome"']],
  government:  [['amenity', '~"townhall|government|public_building"']],
  parking:     [['amenity', '"parking"']],
  youth_center:[['amenity', '~"community_centre|social_centre|youth_centre"']],
  stadium:     [['leisure', '~"stadium|sports_centre|pitch|track"']],
  library:     [['amenity', '"library"']],
  fire_station:[['amenity', '"fire_station"']],
  mosque_named:[['amenity', '"place_of_worship"'], ['religion', '"muslim"']],
}

// Fallback generic filter for unknown POI types
const GENERIC_TAGS = [['amenity', '~"hospital|pharmacy|police|bank|restaurant|mosque"']]

/**
 * Haversine distance in meters between two coordinates
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Format distance for display in Arabic UI
 * < 1000m → "340م"  |  >= 1000m → "1.2 كم"
 */
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}م`
  return `${(meters / 1000).toFixed(1)} كم`
}

/**
 * Build Overpass QL query string
 */
function buildQuery(tagPairs, lat, lng, radiusM) {
  const filters = tagPairs.map(([k, v]) => `["${k}"=${v}]`).join('')
  const around  = `(around:${radiusM},${lat},${lng})`
  return `[out:json][timeout:15];(\n  node${filters}${around};\n  way${filters}${around};\n);\nout center qt 10;`
}

/**
 * Query Overpass API and return sorted list of nearby POIs
 * @param {number} lat
 * @param {number} lng
 * @param {string|null} poiKey   - key from POI_TYPES (e.g. "pharmacy")
 * @param {number} radiusM       - search radius in metres (default 3000)
 * @returns {Promise<Array>}     - sorted by distance, max 7 results
 */
export async function queryNearby(lat, lng, poiKey = null, radiusM = 3000) {
  const tagPairs = (poiKey && OVERPASS_TAGS[poiKey]) || GENERIC_TAGS
  const query    = buildQuery(tagPairs, lat, lng, radiusM)

  // Try multiple Overpass endpoints for reliability
  const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]

  let data = null
  for (const endpoint of ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    `data=${encodeURIComponent(query)}`,
        signal:  AbortSignal.timeout(12000),
      })
      if (resp.ok) {
        data = await resp.json()
        break
      }
    } catch { /* try next endpoint */ }
  }

  if (!data?.elements?.length) return []

  const results = data.elements.map(el => {
    // Ways have a "center" object; nodes have lat/lon directly
    const elLat = el.lat ?? el.center?.lat
    const elLng = el.lon ?? el.center?.lon
    if (!elLat || !elLng) return null

    const tags = el.tags || {}
    const name = tags['name:ar'] || tags.name || tags['name:fr'] || tags.brand || null
    if (!name) return null   // skip unnamed POIs

    return {
      osmId:     el.id,
      name,
      nameAr:    tags['name:ar'] || null,
      nameFr:    tags['name:fr'] || tags.name || null,
      lat:       elLat,
      lng:       elLng,
      distanceM: Math.round(haversine(lat, lng, elLat, elLng)),
      phone:     tags.phone || tags['contact:phone'] || null,
      opening:   tags.opening_hours || null,
    }
  }).filter(Boolean)

  // Sort by distance ascending, deduplicate by name, take top 7
  const seen = new Set()
  return results
    .sort((a, b) => a.distanceM - b.distanceM)
    .filter(r => {
      const key = r.name.toLowerCase().trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 7)
}
