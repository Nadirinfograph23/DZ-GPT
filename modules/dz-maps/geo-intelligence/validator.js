/**
 * GeoIntelligence — Geo Validation & Confidence Engine
 * Validates that results are inside Algeria, match requested region,
 * and assigns a confidence score (0-1) to every candidate.
 */

import { fuzzyScore, smartNormalize } from './arabic-fuzzy.js'

// Algeria bounding box (tight)
const DZ_BOUNDS = { minLat: 18.96, maxLat: 37.09, minLng: -8.67, maxLng: 11.999 }

// Source quality weights (higher = more trusted)
const SOURCE_WEIGHT = {
  local_db:   1.00,
  nominatim:  0.88,
  photon:     0.82,
  overpass:   0.85,
  wikidata:   0.78,
  geonames:   0.75,
}

/**
 * Check if coordinates are inside Algeria's bounding box
 */
export function isInsideAlgeria(lat, lng) {
  return (
    lat >= DZ_BOUNDS.minLat && lat <= DZ_BOUNDS.maxLat &&
    lng >= DZ_BOUNDS.minLng && lng <= DZ_BOUNDS.maxLng
  )
}

/**
 * Haversine distance in km between two coordinate pairs
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

/**
 * Check if a result is within maxKm of the requested city center.
 * Returns true if no city center is known (permissive).
 */
export function isWithinCity(result, cityLat, cityLng, maxKm = 60) {
  if (!cityLat || !cityLng) return true
  if (!result.lat || !result.lng) return false
  return haversineKm(cityLat, cityLng, result.lat, result.lng) <= maxKm
}

/**
 * Compute confidence score (0-1) for a single geo result
 *
 * Factors:
 *   - name similarity to query
 *   - is inside Algeria
 *   - city/region match
 *   - source quality
 *   - OSM importance (if available)
 *   - distance to requested location
 */
export function computeConfidence({
  result,
  query,
  requestedCity = null,
  requestedCityLat = null,
  requestedCityLng = null,
}) {
  let score = 0

  // 1. Algeria bounds check (hard gate — not inside = very low)
  const inDZ = !result.lat || !result.lng || isInsideAlgeria(result.lat, result.lng)
  if (!inDZ) return 0.05

  // 2. Source quality (base)
  const srcW = SOURCE_WEIGHT[result.source] ?? 0.70
  score += srcW * 0.25

  // 3. Name similarity to query
  const nameSim = fuzzyScore(query, result.name)
  const nameFrSim = result.nameFr ? fuzzyScore(query, result.nameFr) : 0
  const nameArSim = result.nameAr ? fuzzyScore(query, result.nameAr) : 0
  const bestName = Math.max(nameSim, nameFrSim, nameArSim)
  score += bestName * 0.35

  // 4. City/region match bonus
  if (requestedCity) {
    const cityStr = smartNormalize(requestedCity)
    const hasCityInName = result.city
      ? fuzzyScore(requestedCity, result.city) > 0.75
      : false
    const hasCityInDisplay = result.displayName
      ? smartNormalize(result.displayName).includes(cityStr)
      : false
    if (hasCityInName || hasCityInDisplay) score += 0.20
  }

  // 5. Distance to requested city center
  if (requestedCityLat && requestedCityLng && result.lat && result.lng) {
    const distKm = haversineKm(requestedCityLat, requestedCityLng, result.lat, result.lng)
    // 0km = 0.15, 50km = 0, linear
    const distScore = Math.max(0, 0.15 * (1 - distKm / 50))
    score += distScore
  }

  // 6. OSM importance / rank bonus
  if (result.importance != null) {
    score += Math.min(result.importance, 1) * 0.05
  }

  return Math.min(Math.max(score, 0), 1)
}

/**
 * Filter results to only those inside Algeria (or very close to border)
 */
export function filterAlgeria(results) {
  return results.filter(r => {
    if (!r.lat || !r.lng) return false
    return isInsideAlgeria(r.lat, r.lng)
  })
}

/**
 * Filter results within maxKm of a city center
 */
export function filterByCity(results, cityLat, cityLng, maxKm = 60) {
  if (!cityLat || !cityLng) return results
  return results.filter(r => isWithinCity(r, cityLat, cityLng, maxKm))
}

/**
 * Assign confidence scores to a list of results and return sorted by score
 */
export function scoreAndSort(results, { query, requestedCity, requestedCityLat, requestedCityLng }) {
  return results
    .map(r => ({
      ...r,
      confidence: computeConfidence({
        result: r,
        query,
        requestedCity,
        requestedCityLat,
        requestedCityLng,
      }),
    }))
    .sort((a, b) => b.confidence - a.confidence)
}

/**
 * Deduplicate results by proximity (merge results within 100m of each other)
 * Keeps the one with highest confidence
 */
export function deduplicate(results, thresholdKm = 0.1) {
  const kept = []
  for (const r of results) {
    const nearby = kept.find(k =>
      k.lat && k.lng && r.lat && r.lng &&
      haversineKm(k.lat, k.lng, r.lat, r.lng) < thresholdKm
    )
    if (!nearby) {
      kept.push(r)
    } else if ((r.confidence ?? 0) > (nearby.confidence ?? 0)) {
      Object.assign(nearby, r)
    }
  }
  return kept
}

/**
 * Format a geo result into the standard response object
 * Always includes: name, district, city, coordinates, mapLink, confidence, nearbyLandmarks
 */
export function formatGeoResult(r, index = 0) {
  const lat  = r.lat  ? parseFloat(r.lat).toFixed(5)  : null
  const lng  = r.lng  ? parseFloat(r.lng).toFixed(5)  : null
  const conf = r.confidence ?? 0

  return {
    rank:        index + 1,
    name:        r.nameAr || r.name || r.displayName || '—',
    nameFr:      r.nameFr || r.name || null,
    district:    r.district || r.suburb || r.neighbourhood || null,
    city:        r.city || r.town || r.village || null,
    wilaya:      r.wilaya || r.state || null,
    lat:         lat ? parseFloat(lat) : null,
    lng:         lng ? parseFloat(lng) : null,
    coordinates: lat && lng ? `${lat}, ${lng}` : null,
    mapLink:     lat && lng
      ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=16`
      : null,
    googleMapsLink: lat && lng
      ? `https://maps.google.com/?q=${lat},${lng}`
      : null,
    confidence:  parseFloat(conf.toFixed(3)),
    confidencePct: Math.round(conf * 100),
    source:      r.source || 'unknown',
    osmId:       r.osmId || null,
    phone:       r.phone || null,
    website:     r.website || null,
    openingHours: r.openingHours || null,
    nearbyLandmarks: r.nearbyLandmarks || [],
    displayName: r.displayName || null,
  }
}
