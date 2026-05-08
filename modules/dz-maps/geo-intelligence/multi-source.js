/**
 * GeoIntelligence — Multi-Source Geo Search Engine
 * Searches simultaneously: Nominatim, Photon, GeoNames (optional), Wikidata
 * All free, no mandatory API key. Results merged and normalized.
 */

const UA = 'DZ-GeoIntelligence/1.0 (dz-gpt.vercel.app)'
const TIMEOUT_MS = 7000

function timeout(ms) {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), ms)
  )
}

async function safeFetch(url, options = {}) {
  try {
    const res = await Promise.race([
      fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, ...options }),
      timeout(TIMEOUT_MS),
    ])
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── NOMINATIM ─────────────────────────────────────────────────────────────

export async function searchNominatim(query, { countryCode = 'dz', limit = 8 } = {}) {
  const params = new URLSearchParams({
    q:                query,
    format:           'json',
    limit:            String(limit),
    addressdetails:   '1',
    extratags:        '1',
    namedetails:      '1',
    'accept-language': 'ar,fr,en',
  })
  if (countryCode) params.set('countrycodes', countryCode)

  const data = await safeFetch(`https://nominatim.openstreetmap.org/search?${params}`)
  if (!Array.isArray(data)) return []

  return data.map(r => ({
    source:      'nominatim',
    name:        r.namedetails?.['name:ar'] || r.namedetails?.name || r.display_name?.split(',')[0]?.trim() || '',
    nameAr:      r.namedetails?.['name:ar'] || null,
    nameFr:      r.namedetails?.['name:fr'] || null,
    displayName: r.display_name || '',
    lat:         parseFloat(r.lat),
    lng:         parseFloat(r.lon),
    type:        r.type || r.class || null,
    importance:  r.importance ? parseFloat(r.importance) : null,
    osmId:       r.osm_id || null,
    city:        r.address?.city || r.address?.town || r.address?.village || r.address?.municipality || null,
    district:    r.address?.suburb || r.address?.neighbourhood || r.address?.quarter || null,
    wilaya:      r.address?.state || null,
    phone:       r.extratags?.phone || r.extratags?.['contact:phone'] || null,
    website:     r.extratags?.website || null,
    openingHours: r.extratags?.opening_hours || null,
  })).filter(r => !isNaN(r.lat) && !isNaN(r.lng))
}

// ── PHOTON (Komoot) ───────────────────────────────────────────────────────
// Fast OSM-based geocoder, supports multilingual, no key required

export async function searchPhoton(query, { limit = 8 } = {}) {
  const params = new URLSearchParams({
    q:    query,
    lang: 'ar',
    limit: String(limit),
  })

  const data = await safeFetch(`https://photon.komoot.io/api/?${params}`)
  if (!data?.features) return []

  return data.features
    .filter(f => f.geometry?.coordinates)
    .map(f => {
      const p = f.properties || {}
      const [lng, lat] = f.geometry.coordinates
      // Filter Algeria only (country code)
      if (p.country_code && p.country_code.toLowerCase() !== 'dz') return null
      return {
        source:      'photon',
        name:        p.name || p.street || '',
        nameAr:      null,
        nameFr:      p.name || null,
        displayName: [p.name, p.city, p.state, p.country].filter(Boolean).join(', '),
        lat:         parseFloat(lat),
        lng:         parseFloat(lng),
        type:        p.osm_value || p.type || null,
        importance:  null,
        osmId:       p.osm_id || null,
        city:        p.city || p.district || null,
        district:    p.district || p.locality || null,
        wilaya:      p.state || null,
        phone:       null,
        website:     null,
        openingHours: null,
      }
    })
    .filter(Boolean)
    .filter(r => !isNaN(r.lat) && !isNaN(r.lng))
}

// ── WIKIDATA ──────────────────────────────────────────────────────────────
// Free, no key, structured data with Arabic labels

export async function searchWikidata(query, { limit = 5 } = {}) {
  const params = new URLSearchParams({
    action:   'wbsearchentities',
    search:   query,
    language: 'ar',
    type:     'item',
    limit:    String(limit),
    format:   'json',
    origin:   '*',
  })

  const data = await safeFetch(`https://www.wikidata.org/w/api.php?${params}`)
  if (!data?.search?.length) return []

  // For each Wikidata entity, get coordinates via SPARQL
  const ids = data.search.slice(0, 3).map(e => e.id)
  if (!ids.length) return []

  const sparql = `
    SELECT ?item ?itemLabel ?itemLabelFr ?lat ?lng ?cityLabel ?countryCode WHERE {
      VALUES ?item { ${ids.map(id => `wd:${id}`).join(' ')} }
      OPTIONAL { ?item wdt:P625 ?coord . BIND(geof:latitude(?coord) AS ?lat) BIND(geof:longitude(?coord) AS ?lng) }
      OPTIONAL { ?item wdt:P17 ?country . ?country wdt:P297 ?countryCode }
      OPTIONAL { ?item wdt:P131 ?city . ?city rdfs:label ?cityLabel FILTER(LANG(?cityLabel)="ar") }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "ar". ?item rdfs:label ?itemLabel }
    } LIMIT 5`

  const sparqlData = await safeFetch(
    `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`
  )
  if (!sparqlData?.results?.bindings?.length) return []

  return sparqlData.results.bindings
    .filter(b => b.lat?.value && b.lng?.value)
    .filter(b => !b.countryCode || b.countryCode.value.toLowerCase() === 'dz')
    .map(b => ({
      source:      'wikidata',
      name:        b.itemLabel?.value || query,
      nameAr:      b.itemLabel?.value || null,
      nameFr:      b.itemLabelFr?.value || null,
      displayName: b.itemLabel?.value || query,
      lat:         parseFloat(b.lat.value),
      lng:         parseFloat(b.lng.value),
      type:        null,
      importance:  0.5,
      osmId:       null,
      city:        b.cityLabel?.value || null,
      district:    null,
      wilaya:      null,
      phone:       null,
      website:     null,
      openingHours: null,
    }))
    .filter(r => !isNaN(r.lat) && !isNaN(r.lng))
}

// ── GEONAMES (optional, uses "demo" account for basic queries) ─────────────
// Falls back gracefully if unavailable

export async function searchGeoNames(query, { username = 'demo', limit = 5 } = {}) {
  const params = new URLSearchParams({
    q:           query,
    country:     'DZ',
    maxRows:     String(limit),
    type:        'json',
    username,
    style:       'FULL',
    lang:        'ar',
  })

  const data = await safeFetch(`http://api.geonames.org/searchJSON?${params}`)
  if (!data?.geonames?.length) return []

  return data.geonames
    .filter(g => g.lat && g.lng)
    .map(g => ({
      source:      'geonames',
      name:        g.name || '',
      nameAr:      g.toponymName || g.name || null,
      nameFr:      g.name || null,
      displayName: [g.name, g.adminName1, 'Algeria'].filter(Boolean).join(', '),
      lat:         parseFloat(g.lat),
      lng:         parseFloat(g.lng),
      type:        g.fcodeName || g.fcl || null,
      importance:  g.population ? Math.min(g.population / 2000000, 1) : 0.3,
      osmId:       null,
      city:        g.adminName2 || g.adminName1 || null,
      district:    null,
      wilaya:      g.adminName1 || null,
      phone:       null,
      website:     null,
      openingHours: null,
    }))
}

// ── COMBINED MULTI-SOURCE SEARCH ──────────────────────────────────────────

/**
 * Search all sources simultaneously and merge results.
 * @param {string} query - the search query
 * @param {object} opts
 * @param {string} [opts.countryCode='dz'] - ISO country code restriction
 * @param {number} [opts.limit=8] - max results per source
 * @param {string[]} [opts.sources] - which sources to use
 * @returns {Promise<object[]>} merged array of raw geo results
 */
export async function multiSourceSearch(query, {
  countryCode = 'dz',
  limit = 8,
  sources = ['nominatim', 'photon', 'wikidata'],
} = {}) {
  const tasks = []

  if (sources.includes('nominatim')) {
    tasks.push(
      searchNominatim(query, { countryCode, limit }).catch(() => [])
    )
  }
  if (sources.includes('photon')) {
    tasks.push(
      searchPhoton(query, { limit }).catch(() => [])
    )
  }
  if (sources.includes('wikidata')) {
    tasks.push(
      searchWikidata(query, { limit: Math.min(limit, 5) }).catch(() => [])
    )
  }
  if (sources.includes('geonames')) {
    tasks.push(
      searchGeoNames(query, { limit: Math.min(limit, 5) }).catch(() => [])
    )
  }

  const settled = await Promise.allSettled(tasks)
  const all = settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)

  return all
}

/**
 * Search with multiple query variants simultaneously (for fuzzy/transliterated queries)
 */
export async function multiVariantSearch(queryVariants, opts = {}) {
  const tasks = queryVariants.slice(0, 3).map(q => multiSourceSearch(q, opts).catch(() => []))
  const results = await Promise.allSettled(tasks)
  return results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
}
