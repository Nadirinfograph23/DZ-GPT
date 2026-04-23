// Multi-source doctor search for DZ Agent.
// Sources (EQUAL priority — fetched in parallel):
//   sahadoc, algerie-docto, addalile, pj-dz, docteur360
// pj-dz and docteur360 are SPAs that block server-side scraping; for those
// we always return a deep-link "directory" entry so every source contributes.
// All sources have equal weight in dedup/merge/ranking.

import * as cheerio from 'cheerio'

// ───────────────────────── Cache ─────────────────────────
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const cache = new Map()

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
  if (digits.startsWith('00213')) return '0' + digits.slice(5)
  if (digits.startsWith('213')) return '0' + digits.slice(3)
  return digits
}

// ───────────────────────── Slug maps (sahadoc) ─────────────────────────
// French specialty -> sahadoc slug (s-{slug})
const SAHADOC_SPEC_SLUG = {
  'dentiste': 'dentiste',
  'cardiologue': 'cardiologue',
  'orthopédiste': 'chirurgien-orthopediste',
  'orthopediste': 'chirurgien-orthopediste',
  'gynécologue': 'gynecologue-obstetricien',
  'gynecologue': 'gynecologue-obstetricien',
  'pédiatre': 'pediatre',
  'pediatre': 'pediatre',
  'ophtalmologue': 'ophtalmologue',
  'dermatologue': 'dermatologue',
  'généraliste': 'medecin-generaliste',
  'generaliste': 'medecin-generaliste',
  'médecin généraliste': 'medecin-generaliste',
  'medecin generaliste': 'medecin-generaliste',
  'orl': 'orl',
  'psychiatre': 'psychiatre',
  'rhumatologue': 'rhumatologue',
  'urologue': 'urologue',
  'neurologue': 'neurologue',
  'chirurgien': 'chirurgien-generaliste',
}

// French city/wilaya -> sahadoc slug (w-{slug})
const SAHADOC_CITY_SLUG = {
  'adrar': 'adrar', 'chlef': 'chlef', 'laghouat': 'laghouat',
  'oum el bouaghi': 'oum-el-bouaghi', 'batna': 'batna', 'bejaia': 'bejaia',
  'biskra': 'biskra', 'bechar': 'bechar', 'blida': 'blida', 'bouira': 'bouira',
  'tamanrasset': 'tamanrasset', 'tebessa': 'tebessa', 'tlemcen': 'tlemcen',
  'tiaret': 'tiaret', 'tizi ouzou': 'tizi-ouzou', 'alger': 'alger',
  'djelfa': 'djelfa', 'jijel': 'jijel', 'setif': 'setif', 'saida': 'saida',
  'skikda': 'skikda', 'sidi bel abbes': 'sidi-bel-abbes', 'annaba': 'annaba',
  'guelma': 'guelma', 'constantine': 'constantine', 'medea': 'medea',
  'mostaganem': 'mostaganem', 'msila': 'msila', 'mascara': 'mascara',
  'ouargla': 'ouargla', 'oran': 'oran', 'el bayadh': 'el-bayadh',
  'illizi': 'illizi', 'bordj bou arreridj': 'bordj-bou-arreridj',
  'boumerdes': 'boumerdes', 'el tarf': 'el-taref', 'tindouf': 'tindouf',
  'tissemsilt': 'tissemsilt', 'el oued': 'el-oued', 'khenchela': 'khenchela',
  'souk ahras': 'souk-ahras', 'tipaza': 'tipaza', 'mila': 'mila',
  'ain defla': 'ain-defla', 'naama': 'naama', 'ain temouchent': 'ain-temouchent',
  'ghardaia': 'ghardaia', 'relizane': 'relizane',
}

const slugify = (s) => normalizeText(s).replace(/\s+/g, '-')

// ───────────────────────── Polite fetcher ─────────────────────────
const PER_HOST_DELAY_MS = 1200
const lastFetchByHost = new Map()
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Accept-Language': 'fr,ar;q=0.9,en;q=0.7',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

async function politeFetch(url, { timeoutMs = 9000 } = {}) {
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

const PHONE_RE = /(?:\+?213|0)\s?[5-7](?:[\s.\-]?\d){8}/

// ───────────────────────── Source: SAHADOC ─────────────────────────
async function fetchSahadoc(speciality, city) {
  const specKey = normalizeText(speciality)
  const cityKey = normalizeText(city)
  const specSlug = SAHADOC_SPEC_SLUG[specKey] || slugify(speciality)
  const citySlug = SAHADOC_CITY_SLUG[cityKey] || slugify(city)
  const url = `https://www.sahadoc.net/docteur/s-${specSlug}/w-${citySlug}/`
  const r = await politeFetch(url)
  if (!r.ok) {
    return { source: 'sahadoc', results: [], sourceUrl: url, error: r.error || `HTTP ${r.status}` }
  }
  const $ = cheerio.load(r.html)
  const out = []
  $('.doctor-card').each((_, el) => {
    const $el = $(el)
    const name = $el.find('.doctor-card__name').first().text().trim()
    if (!name) return
    const speciality = $el.find('.doctor-card__spec').first().text().trim()
    const loc = $el.find('.doctor-card__loc').first().text().trim()
    const phoneAttr = $el.find('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/i, '').trim() || ''
    const text = $el.text().replace(/\s+/g, ' ')
    const phoneMatch = text.match(PHONE_RE)
    const phone = phoneAttr || (phoneMatch ? phoneMatch[0] : '')
    const href = $el.find('a').first().attr('href') || ''
    out.push({
      name, speciality, city: loc.split(',').pop()?.trim() || city,
      address: loc, phone, profileUrl: href || url,
    })
  })
  return { source: 'sahadoc', results: out.slice(0, 15), sourceUrl: url }
}

// ───────────────────────── Source: ALGERIE-DOCTO ─────────────────────────
async function fetchAlgerieDocto(speciality, city) {
  const q = encodeURIComponent(`${speciality} ${city}`)
  const url = `https://algerie-docto.com/search?q=${q}`
  const r = await politeFetch(url)
  if (!r.ok) {
    return { source: 'algerie-docto', results: [], sourceUrl: url, error: r.error || `HTTP ${r.status}` }
  }
  const $ = cheerio.load(r.html)
  const out = []
  $('[class*="CardSearch-module"], [class*="Card-module"]').each((_, el) => {
    const $el = $(el)
    const text = $el.text().replace(/\s+/g, ' ').trim()
    if (!text) return
    // Heuristic: a name typically appears in the first heading/strong/link
    const name =
      $el.find('h1,h2,h3,h4,strong,a').first().text().trim()
    if (!name || name.length > 100) return
    const phoneAttr = $el.find('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/i, '').trim() || ''
    const phoneMatch = text.match(PHONE_RE)
    const phone = phoneAttr || (phoneMatch ? phoneMatch[0] : '')
    const href = $el.find('a').first().attr('href') || ''
    const profileUrl = href.startsWith('http') ? href : (href ? `https://algerie-docto.com${href}` : url)
    out.push({
      name, speciality, city, address: '', phone, profileUrl,
    })
  })
  // Dedup intra-source by name
  const seen = new Set()
  const unique = []
  for (const d of out) {
    const k = normalizeName(d.name)
    if (!k || seen.has(k)) continue
    seen.add(k); unique.push(d)
  }
  return { source: 'algerie-docto', results: unique.slice(0, 15), sourceUrl: url }
}

// ───────────────────────── Source: ADDALILE ─────────────────────────
async function fetchAddalile(speciality, city) {
  const q = encodeURIComponent(`${speciality} ${city}`)
  const url = `https://addalile.com/?s=${q}`
  const r = await politeFetch(url)
  if (!r.ok) {
    return { source: 'addalile', results: [], sourceUrl: url, error: r.error || `HTTP ${r.status}` }
  }
  const $ = cheerio.load(r.html)
  const out = []
  $('article, .post, .entry, .listing-item, h2 a, h3 a').each((_, el) => {
    const $el = $(el)
    const $card = el.tagName === 'a' ? $el.closest('article, .post, .entry, li, div') : $el
    const name = $card.find('h1, h2, h3, .entry-title').first().text().trim() || $el.text().trim()
    if (!name || name.length < 3 || name.length > 120) return
    if (!/dr|د\.|دكتور|docteur|cabinet|clinique|عياد/i.test(name + ' ' + $card.text())) return
    const text = $card.text().replace(/\s+/g, ' ')
    const phoneAttr = $card.find('a[href^="tel:"]').first().attr('href')?.replace(/^tel:/i, '').trim() || ''
    const phoneMatch = text.match(PHONE_RE)
    const phone = phoneAttr || (phoneMatch ? phoneMatch[0] : '')
    const href = $card.find('a').first().attr('href') || ''
    out.push({ name, speciality, city, address: '', phone, profileUrl: href || url })
  })
  const seen = new Set()
  const unique = []
  for (const d of out) {
    const k = normalizeName(d.name)
    if (!k || seen.has(k)) continue
    seen.add(k); unique.push(d)
  }
  return { source: 'addalile', results: unique.slice(0, 12), sourceUrl: url }
}

// ───────────────────────── Source: PJ-DZ (SPA — directory link) ─────────────────────────
async function fetchPjDz(speciality, city) {
  // pj-dz.com redirects to dz.hakym.com which is a SPA; server-side scraping
  // returns an empty <div id="root">. We surface a directory link so users can
  // continue the search there. This keeps the source active with equal priority.
  const url = `https://dz.hakym.com/fr/app/search?q=${encodeURIComponent(`${speciality} ${city}`)}`
  return {
    source: 'pj-dz',
    results: [{
      name: `Annuaire pj-dz — ${speciality} (${city})`,
      speciality, city, address: '', phone: '',
      profileUrl: url,
      directoryLink: true,
    }],
    sourceUrl: url,
  }
}

// ───────────────────────── Source: DOCTEUR360 (search requires JS — directory link) ─────────────────────────
async function fetchDocteur360(speciality, city) {
  const url = `https://docteur360.com.dz/searchdoctor?speciality=${encodeURIComponent(speciality)}&city=${encodeURIComponent(city)}`
  return {
    source: 'docteur360',
    results: [{
      name: `Annuaire docteur360 — ${speciality} (${city})`,
      speciality, city, address: '', phone: '',
      profileUrl: url,
      directoryLink: true,
    }],
    sourceUrl: url,
  }
}

// All sources have EQUAL priority — fetched in parallel.
export const SOURCES = [
  { id: 'sahadoc',       fetcher: fetchSahadoc },
  { id: 'algerie-docto', fetcher: fetchAlgerieDocto },
  { id: 'addalile',      fetcher: fetchAddalile },
  { id: 'pj-dz',         fetcher: fetchPjDz },
  { id: 'docteur360',    fetcher: fetchDocteur360 },
]

// ───────────────────────── Merge / Dedup / Rank ─────────────────────────
function dedupKey(d) {
  if (d.directoryLink) return `dir:${d.name}` // never merge directory links
  const phone = normalizePhone(d.phone)
  if (phone) return `phone:${phone}`
  const name = normalizeName(d.name)
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
  const map = new Map()
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
          profileUrl: raw.profileUrl || '',
          sources: [list.source],
          sourceUrls: [raw.profileUrl || list.sourceUrl].filter(Boolean),
          directoryLink: !!raw.directoryLink,
        })
      } else {
        existing.name = pickBetter(existing, raw, 'name')
        existing.speciality = pickBetter(existing, raw, 'speciality')
        existing.city = pickBetter(existing, raw, 'city')
        existing.address = pickBetter(existing, raw, 'address')
        existing.phone = existing.phone || normalizePhone(raw.phone)
        existing.profileUrl = existing.profileUrl || raw.profileUrl || ''
        if (!existing.sources.includes(list.source)) existing.sources.push(list.source)
        const u = raw.profileUrl || list.sourceUrl
        if (u && !existing.sourceUrls.includes(u)) existing.sourceUrls.push(u)
      }
    }
  }
  // Rank: real doctors first (directoryLink last), then more sources, then phone, then completeness
  const completeness = (d) =>
    (d.phone ? 1 : 0) + (d.address ? 1 : 0) + (d.city ? 1 : 0) + (d.speciality ? 1 : 0)
  return [...map.values()].sort((a, b) => {
    if (!!a.directoryLink !== !!b.directoryLink) return a.directoryLink ? 1 : -1
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length
    if (!!b.phone !== !!a.phone) return (b.phone ? 1 : 0) - (a.phone ? 1 : 0)
    return completeness(b) - completeness(a)
  })
}

// ───────────────────────── Public API ─────────────────────────
export async function searchDoctors({ speciality, city, localResults = [] } = {}) {
  if (!speciality || !city) return { results: [], errors: [] }
  const cacheKey = `${normalizeText(speciality)}|${normalizeText(city)}`
  const cached = getCached(cacheKey)
  if (cached) return { results: cached, errors: [], cached: true }

  // PARALLEL fetch — all sources have equal priority.
  const settled = await Promise.allSettled(SOURCES.map(s => s.fetcher(speciality, city)))
  const lists = []
  const errors = []
  if (localResults.length) lists.push({ source: 'local', results: localResults, sourceUrl: '' })
  settled.forEach((r, i) => {
    const id = SOURCES[i].id
    if (r.status === 'fulfilled') {
      const v = r.value
      if (v.error) errors.push({ source: id, error: v.error })
      lists.push(v)
    } else {
      errors.push({ source: id, error: String(r.reason?.message || r.reason) })
    }
  })

  const all = mergeResults(lists)
  const real = all.filter(d => !d.directoryLink).slice(0, 15)
  const dirs = all.filter(d => d.directoryLink) // always keep all directory links
  const merged = [...real, ...dirs]
  if (real.length > 0) setCached(cacheKey, merged)
  return { results: merged, errors, cached: false }
}

// ───────────────────────── Formatting ─────────────────────────
export function osmUrl(name, city) {
  const q = encodeURIComponent([name, city].filter(Boolean).join(' '))
  return `https://www.openstreetmap.org/search?query=${q}`
}

export function formatResults(results, specialityLabel, cityLabel) {
  const header = `🩺 **${specialityLabel}${cityLabel ? ` في ${cityLabel}` : ''}**`
  const real = results.filter(d => !d.directoryLink)
  const dirs = results.filter(d => d.directoryLink)

  if (!real.length && !dirs.length) {
    return header + '\n\nلم أجد نتائج حالياً من المصادر المتاحة. جرّب تخصصاً مرادفاً أو ولاية مجاورة.'
  }

  const lines = real.map((d, i) => {
    const cityLine = d.city || cityLabel
    const parts = [
      `**${i + 1}. ${d.name}**`,
      cityLine ? `📍 ${cityLine}` : '',
      `🧠 التخصص: ${d.speciality || specialityLabel}`,
      d.phone ? `📞 ${d.phone}` : '',
      d.address ? `🏠 ${d.address}` : '',
      `🌐 المصدر: ${d.sources.join('، ')}`,
      d.profileUrl ? `🔗 [الملف الشخصي](${d.profileUrl})` : '',
      `🗺️ [عرض على الخريطة](${osmUrl(d.name, cityLine)})`,
    ].filter(Boolean)
    return parts.join('\n')
  }).join('\n\n')

  let out = header + '\n\n' + (lines || '_(لا أطباء مفصّلون من المصادر القابلة للقراءة في هذا البحث)_')
  if (dirs.length) {
    out += '\n\n---\n📂 **مصادر إضافية للبحث المباشر:**\n' +
      dirs.map(d => `- 🔗 [${d.sources[0]}](${d.profileUrl})`).join('\n')
  }
  out += '\n\n_تم البحث في 5 مصادر بالتوازي وبأولوية متساوية_'
  return out
}
