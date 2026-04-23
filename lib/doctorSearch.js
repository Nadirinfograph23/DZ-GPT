// Multi-source doctor search for DZ Agent.
// Sources (priority order): pj-dz, addalile, sahadoc, docteur360, algerie-docto.
// Responsibilities: per-source fetching, normalization, dedup + merge, ranking,
// 24h cache, polite delays. Designed to be modular and easily extensible.

import * as cheerio from 'cheerio'

// ───────────────────────── Cache ─────────────────────────
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const cache = new Map() // key -> { ts, results }

export function getCached(key) {
  const e = cache.get(key)
  if (!e) return null
  if (Date.now() - e.ts > CACHE_TTL_MS) { cache.delete(key); return null }
  return e.results
}
export function setCached(key, results) {
  cache.set(key, { ts: Date.now(), results })
  if (cache.size > 300) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) cache.delete(oldest[0])
  }
}

// ───────────────────────── Normalization ─────────────────────────
const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g
const TATWEEL = /\u0640/g

export function normalizeText(s) {
  if (!s) return ''
  return String(s)
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/[يى]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[._\-,;:!?()"'`«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeName(name) {
  if (!name) return ''
  return normalizeText(name)
    .replace(/^(dr|d|docteur|الدكتور|الدكتوره|دكتور|دكتوره|د)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePhone(phone) {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  // Strip Algeria country code variants
  if (digits.startsWith('00213')) return '0' + digits.slice(5)
  if (digits.startsWith('213')) return '0' + digits.slice(3)
  return digits
}

// ───────────────────────── Polite fetcher with per-host delay ─────────────────────────
const PER_HOST_DELAY_MS = 1500
const lastFetchByHost = new Map()
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; DZAgent/1.0; +https://dz-gpt.vercel.app)',
  'Accept-Language': 'ar,fr;q=0.8,en;q=0.6',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

async function politeFetch(url, { timeoutMs = 8000 } = {}) {
  const host = new URL(url).host
  const since = Date.now() - (lastFetchByHost.get(host) || 0)
  if (since < PER_HOST_DELAY_MS) {
    await new Promise(r => setTimeout(r, PER_HOST_DELAY_MS - since))
  }
  lastFetchByHost.set(host, Date.now())

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: DEFAULT_HEADERS, redirect: 'follow' })
    clearTimeout(t)
    if (!res.ok) return { ok: false, status: res.status, html: '' }
    const html = await res.text()
    return { ok: true, status: res.status, html }
  } catch (err) {
    clearTimeout(t)
    return { ok: false, status: 0, html: '', error: err.name === 'AbortError' ? 'timeout' : String(err.message || err) }
  }
}

// ───────────────────────── Generic card extraction helpers ─────────────────────────
const PHONE_RE = /(?:\+?213|0)\s?[5-7](?:[\s.\-]?\d){8}/

function extractFromCard($, $el) {
  const text = $el.text().replace(/\s+/g, ' ').trim()
  const name =
    $el.find('h1, h2, h3, .name, .doctor-name, .nom, [itemprop="name"], .title').first().text().trim() ||
    $el.find('a').first().text().trim()
  const speciality =
    $el.find('.speciality, .specialty, .specialite, .doctor-specialty, [itemprop="medicalSpecialty"], .specialty-name').first().text().trim()
  const city =
    $el.find('.city, .ville, .location, .doctor-city, [itemprop="addressLocality"]').first().text().trim()
  const address =
    $el.find('.address, .adresse, [itemprop="streetAddress"], .doctor-address').first().text().trim()
  const phoneAttr =
    $el.find('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/i, '').trim() || ''
  const phoneMatch = text.match(PHONE_RE)
  const phone = phoneAttr || (phoneMatch ? phoneMatch[0] : '')
  return { name, speciality, city, address, phone }
}

function extractGeneric(html, baseUrl) {
  const $ = cheerio.load(html)
  const out = []
  const seen = new Set()
  const selectors = [
    '.doctor-card', '.doctor-item', '.search-result-item', '.result-item',
    'article.doctor', '.profile-card', '.card.doctor', '.item.doctor',
    '[itemtype*="Physician"]', '[itemtype*="LocalBusiness"]',
    '.listing-item', '.annuaire-item', '.medecin-item',
    '.search-result', '.listing', '.entry',
  ]
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const data = extractFromCard($, $(el))
      if (!data.name) return
      const key = normalizeName(data.name) + '|' + normalizeText(data.city)
      if (seen.has(key)) return
      seen.add(key)
      out.push(data)
    })
    if (out.length > 0) break
  }
  // Fallback: heading-anchor scan
  if (out.length === 0) {
    $('h2 a, h3 a, .name a').each((_, el) => {
      const $el = $(el)
      const name = $el.text().trim()
      if (!name) return
      if (!/^(Dr\.?|د\.?|د\s|Docteur|Médecin)/i.test(name)) return
      const $card = $el.closest('article, .card, .item, li, div')
      const data = extractFromCard($, $card.length ? $card : $el)
      data.name = data.name || name
      const key = normalizeName(data.name) + '|' + normalizeText(data.city)
      if (seen.has(key)) return
      seen.add(key)
      out.push(data)
    })
  }
  return out.slice(0, 15).map(d => ({ ...d, sourceUrl: baseUrl }))
}

// ───────────────────────── Per-source fetchers ─────────────────────────
// Each returns { source, results, sourceUrl, error? } and never throws.

async function fetchPjDz(speciality, city) {
  const q = encodeURIComponent([speciality, city].filter(Boolean).join(' '))
  const url = `https://pj-dz.com/search?q=${q}`
  const r = await politeFetch(url)
  if (!r.ok) return { source: 'pj-dz', results: [], sourceUrl: url, error: r.error || `HTTP ${r.status}` }
  return { source: 'pj-dz', results: extractGeneric(r.html, url), sourceUrl: url }
}

async function fetchAddalile(speciality, city) {
  const q = encodeURIComponent([speciality, city].filter(Boolean).join(' '))
  const url = `https://addalile.com/?s=${q}`
  const r = await politeFetch(url)
  if (!r.ok) return { source: 'addalile', results: [], sourceUrl: url, error: r.error || `HTTP ${r.status}` }
  return { source: 'addalile', results: extractGeneric(r.html, url), sourceUrl: url }
}

async function fetchSahadoc(speciality, city) {
  const q = encodeURIComponent([speciality, city].filter(Boolean).join(' '))
  const url = `https://www.sahadoc.net/ar/recherche?q=${q}`
  const r = await politeFetch(url)
  if (!r.ok) return { source: 'sahadoc', results: [], sourceUrl: url, error: r.error || `HTTP ${r.status}` }
  return { source: 'sahadoc', results: extractGeneric(r.html, url), sourceUrl: url }
}

async function fetchDocteur360(speciality, city) {
  const q = encodeURIComponent([speciality, city].filter(Boolean).join(' '))
  const url = `https://docteur360.com.dz/recherche?q=${q}`
  const r = await politeFetch(url)
  if (!r.ok) return { source: 'docteur360', results: [], sourceUrl: url, error: r.error || `HTTP ${r.status}` }
  return { source: 'docteur360', results: extractGeneric(r.html, url), sourceUrl: url }
}

async function fetchAlgerieDocto(speciality, city) {
  const q = encodeURIComponent([speciality, city].filter(Boolean).join(' '))
  const url = `https://algerie-docto.com/?s=${q}`
  const r = await politeFetch(url)
  if (!r.ok) return { source: 'algerie-docto', results: [], sourceUrl: url, error: r.error || `HTTP ${r.status}` }
  return { source: 'algerie-docto', results: extractGeneric(r.html, url), sourceUrl: url }
}

// Source registry — ordered by priority (first = highest)
export const SOURCES = [
  { id: 'pj-dz',         fetcher: fetchPjDz },
  { id: 'addalile',      fetcher: fetchAddalile },
  { id: 'sahadoc',       fetcher: fetchSahadoc },
  { id: 'docteur360',    fetcher: fetchDocteur360 },
  { id: 'algerie-docto', fetcher: fetchAlgerieDocto },
]

// ───────────────────────── Merge / Dedup / Rank ─────────────────────────
function dedupKey(d) {
  const name = normalizeName(d.name)
  const phone = normalizePhone(d.phone)
  if (phone) return `phone:${phone}`
  const city = normalizeText(d.city)
  return `name:${name}|city:${city}`
}

function pickBetter(a, b, field) {
  const av = (a?.[field] || '').trim()
  const bv = (b?.[field] || '').trim()
  if (av && bv) return av.length >= bv.length ? av : bv
  return av || bv
}

export function mergeResults(perSourceLists) {
  const map = new Map() // key -> merged doctor
  for (const list of perSourceLists) {
    for (const raw of list.results || []) {
      if (!raw.name) continue
      const key = dedupKey(raw)
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          name: raw.name.trim(),
          speciality: (raw.speciality || '').trim(),
          city: (raw.city || '').trim(),
          address: (raw.address || '').trim(),
          phone: normalizePhone(raw.phone),
          sources: [list.source],
          sourceUrls: [raw.sourceUrl || list.sourceUrl].filter(Boolean),
        })
      } else {
        existing.name = pickBetter(existing, raw, 'name')
        existing.speciality = pickBetter(existing, raw, 'speciality')
        existing.city = pickBetter(existing, raw, 'city')
        existing.address = pickBetter(existing, raw, 'address')
        existing.phone = existing.phone || normalizePhone(raw.phone)
        if (!existing.sources.includes(list.source)) existing.sources.push(list.source)
        const u = raw.sourceUrl || list.sourceUrl
        if (u && !existing.sourceUrls.includes(u)) existing.sourceUrls.push(u)
      }
    }
  }
  // Rank: more sources first, then has phone, then more complete fields
  const completeness = (d) =>
    (d.phone ? 1 : 0) + (d.address ? 1 : 0) + (d.city ? 1 : 0) + (d.speciality ? 1 : 0)
  return [...map.values()].sort((a, b) => {
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length
    if (!!b.phone !== !!a.phone) return (b.phone ? 1 : 0) - (a.phone ? 1 : 0)
    return completeness(b) - completeness(a)
  })
}

// ───────────────────────── Public API ─────────────────────────
// Optional local DB hook — caller may provide its own results to be merged first.
export async function searchDoctors({ speciality, city, localResults = [] } = {}) {
  if (!speciality || !city) return { results: [], errors: [] }
  const cacheKey = `${normalizeText(speciality)}|${normalizeText(city)}`
  const cached = getCached(cacheKey)
  if (cached) return { results: cached, errors: [], cached: true }

  const lists = []
  if (localResults.length) {
    lists.push({ source: 'local', results: localResults, sourceUrl: '' })
  }
  // Fetch sources sequentially in priority order to keep load polite and
  // honor the per-host delay, while still capturing every source.
  const errors = []
  for (const s of SOURCES) {
    const r = await s.fetcher(speciality, city)
    if (r.error) errors.push({ source: s.id, error: r.error })
    lists.push(r)
  }

  const merged = mergeResults(lists).slice(0, 12)
  if (merged.length > 0) setCached(cacheKey, merged)
  return { results: merged, errors, cached: false }
}

// ───────────────────────── Formatting ─────────────────────────
export function osmUrl(name, city) {
  const q = encodeURIComponent([name, city].filter(Boolean).join(' '))
  return `https://www.openstreetmap.org/search?query=${q}`
}

export function formatResults(results, specialityLabel, cityLabel) {
  const header = `🩺 **${specialityLabel}${cityLabel ? ` في ${cityLabel}` : ''}**`
  if (!results.length) {
    return header + '\n\nلم أجد نتائج حالياً من المصادر المتاحة. جرّب تخصصاً مرادفاً أو ولاية مجاورة.'
  }
  const lines = results.map((d, i) => {
    const cityLine = d.city || cityLabel
    const parts = [
      `**${i + 1}. ${d.name}**`,
      cityLine ? `📍 ${cityLine}` : '',
      `🧠 التخصص: ${d.speciality || specialityLabel}`,
      d.phone ? `📞 ${d.phone}` : '',
      d.address ? `🏠 ${d.address}` : '',
      `🌐 المصدر: ${d.sources.join('، ')}`,
      `🗺️ [عرض على الخريطة](${osmUrl(d.name, cityLine)})`,
    ].filter(Boolean)
    return parts.join('\n')
  }).join('\n\n')
  return header + '\n\n' + lines + '\n\n_المصادر المدمجة: pj-dz، addalile، sahadoc، docteur360، algerie-docto_'
}
