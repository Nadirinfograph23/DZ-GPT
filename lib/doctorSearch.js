// Multi-source doctor search for DZ Agent.
// Sources (EQUAL priority — fetched in parallel):
//   sahadoc, algerie-docto, addalile, pj-dz, docteur360, sihhatech
// pj-dz, docteur360 and sihhatech are SPAs/JS-required and block server-side
// scraping; for those we always return a deep-link "directory" entry so every
// source contributes. All sources have equal weight in dedup/merge/ranking.
//
// Optional: pass userLocation:{lat,lng} to enable distance-based ranking
// (geocodes top results via Nominatim and sorts by Haversine distance).

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

// Geocode cache (separate from results cache, longer TTL)
const GEO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const geoCache = new Map()

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

// ───────────────────────── French → Arabic translation ─────────────────────────
// Specialty FR → AR
const FR_AR_SPECIALITY = {
  'dentiste': 'طبيب أسنان',
  'cardiologue': 'طبيب قلب',
  'orthopédiste': 'طبيب عظام',
  'orthopediste': 'طبيب عظام',
  'chirurgien orthopédiste': 'جراح عظام',
  'chirurgien-orthopediste': 'جراح عظام',
  'gynécologue': 'طبيب نساء وتوليد',
  'gynecologue': 'طبيب نساء وتوليد',
  'gynécologue-obstétricien': 'طبيب نساء وتوليد',
  'pédiatre': 'طبيب أطفال',
  'pediatre': 'طبيب أطفال',
  'ophtalmologue': 'طبيب عيون',
  'dermatologue': 'طبيب جلدية',
  'généraliste': 'طبيب عام',
  'generaliste': 'طبيب عام',
  'médecin généraliste': 'طبيب عام',
  'medecin generaliste': 'طبيب عام',
  'médecin': 'طبيب',
  'medecin': 'طبيب',
  'docteur': 'دكتور',
  'orl': 'أنف وأذن وحنجرة',
  'psychiatre': 'طبيب نفسي',
  'rhumatologue': 'طبيب مفاصل',
  'urologue': 'طبيب مسالك بولية',
  'neurologue': 'طبيب أعصاب',
  'chirurgien': 'جراح',
  'chirurgien généraliste': 'جراح عام',
  'chirurgien-generaliste': 'جراح عام',
  'radiologue': 'طبيب أشعة',
  'gastro-entérologue': 'طبيب جهاز هضمي',
  'gastroenterologue': 'طبيب جهاز هضمي',
  'pneumologue': 'طبيب رئة',
  'endocrinologue': 'طبيب غدد',
  'néphrologue': 'طبيب كلى',
  'oncologue': 'طبيب أورام',
}

// Common address tokens FR → AR
const FR_AR_ADDRESS = {
  'rue': 'شارع',
  'avenue': 'جادة',
  'boulevard': 'شارع رئيسي',
  'route': 'طريق',
  'cité': 'حي',
  'cite': 'حي',
  'quartier': 'حي',
  'place': 'ساحة',
  'centre ville': 'وسط المدينة',
  'centre-ville': 'وسط المدينة',
  'cabinet': 'عيادة',
  'clinique': 'عيادة',
  'hôpital': 'مستشفى',
  'hopital': 'مستشفى',
  'immeuble': 'عمارة',
  'bâtiment': 'مبنى',
  'batiment': 'مبنى',
  'étage': 'طابق',
  'etage': 'طابق',
  'rdc': 'الطابق الأرضي',
  'résidence': 'إقامة',
  'residence': 'إقامة',
}

// City FR → AR (subset commonly seen on doctor sites)
const FR_AR_CITY = {
  'alger': 'الجزائر', 'oran': 'وهران', 'constantine': 'قسنطينة',
  'annaba': 'عنابة', 'blida': 'البليدة', 'batna': 'باتنة',
  'setif': 'سطيف', 'sétif': 'سطيف', 'tlemcen': 'تلمسان',
  'tizi ouzou': 'تيزي وزو', 'tizi-ouzou': 'تيزي وزو', 'bejaia': 'بجاية',
  'béjaïa': 'بجاية', 'bechar': 'بشار', 'béchar': 'بشار',
  'biskra': 'بسكرة', 'mostaganem': 'مستغانم', 'tiaret': 'تيارت',
  'djelfa': 'الجلفة', 'medea': 'المدية', 'médéa': 'المدية',
  'mascara': 'معسكر', 'ouargla': 'ورقلة', 'ghardaia': 'غرداية',
  'ghardaïa': 'غرداية', 'jijel': 'جيجل', 'skikda': 'سكيكدة',
  'guelma': 'قالمة', 'tipaza': 'تيبازة', 'boumerdes': 'بومرداس',
  'boumerdès': 'بومرداس', 'sidi bel abbes': 'سيدي بلعباس',
  'sidi bel abbès': 'سيدي بلعباس', 'el oued': 'الوادي',
  'bordj bou arreridj': 'برج بوعريريج', 'relizane': 'غليزان',
  'mila': 'ميلة', 'khenchela': 'خنشلة', 'souk ahras': 'سوق أهراس',
  'naama': 'النعامة', 'naâma': 'النعامة', 'tindouf': 'تندوف',
  'illizi': 'إليزي', 'tamanrasset': 'تمنراست', 'el bayadh': 'البيض',
  'el tarf': 'الطارف', 'el taref': 'الطارف', 'tissemsilt': 'تيسمسيلت',
  'ain defla': 'عين الدفلى', 'ain temouchent': 'عين تموشنت',
  'aïn témouchent': 'عين تموشنت', 'aïn defla': 'عين الدفلى',
  'msila': 'المسيلة', 'm\'sila': 'المسيلة', 'oum el bouaghi': 'أم البواقي',
  'bouira': 'البويرة', 'tebessa': 'تبسة', 'tébessa': 'تبسة',
  'saida': 'سعيدة', 'saïda': 'سعيدة', 'laghouat': 'الأغواط',
  'adrar': 'أدرار', 'chlef': 'الشلف',
}

// Returns true if string contains any Arabic letter
function hasArabic(s) {
  return /[\u0600-\u06FF]/.test(String(s || ''))
}

function translateSpeciality(fr) {
  if (!fr) return ''
  if (hasArabic(fr)) return fr
  const key = normalizeText(fr)
  if (FR_AR_SPECIALITY[key]) return FR_AR_SPECIALITY[key]
  // Try partial: longest matching prefix
  for (const k of Object.keys(FR_AR_SPECIALITY).sort((a, b) => b.length - a.length)) {
    if (key.includes(k)) return FR_AR_SPECIALITY[k]
  }
  return fr
}

function translateCity(fr) {
  if (!fr) return ''
  if (hasArabic(fr)) return fr
  const key = normalizeText(fr)
  return FR_AR_CITY[key] || fr
}

function translateAddress(addr) {
  if (!addr) return ''
  if (hasArabic(addr)) return addr
  let out = String(addr)
  for (const [fr, ar] of Object.entries(FR_AR_ADDRESS)) {
    const re = new RegExp(`\\b${fr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    out = out.replace(re, ar)
  }
  // Translate city tokens inside addresses too
  for (const [fr, ar] of Object.entries(FR_AR_CITY)) {
    const re = new RegExp(`\\b${fr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    out = out.replace(re, ar)
  }
  return out
}

// ───────────────────────── Slug maps (sahadoc) ─────────────────────────
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

async function politeFetch(url, { timeoutMs = 9000, headers = {} } = {}) {
  const host = new URL(url).host
  const since = Date.now() - (lastFetchByHost.get(host) || 0)
  if (since < PER_HOST_DELAY_MS) {
    await new Promise(r => setTimeout(r, PER_HOST_DELAY_MS - since))
  }
  lastFetchByHost.set(host, Date.now())

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { ...DEFAULT_HEADERS, ...headers }, redirect: 'follow' })
    clearTimeout(t)
    if (!res.ok) return { ok: false, status: res.status, html: '' }
    const html = await res.text()
    return { ok: true, status: res.status, html }
  } catch (err) {
    clearTimeout(t)
    return { ok: false, status: 0, html: '', error: err.name === 'AbortError' ? 'timeout' : String(err.message || err) }
  }
}

// Algerian phone numbers — covers BOTH:
//   • Mobile  (10 digits): 0[5-7]XX XX XX XX
//   • Fixed-line (9 digits): 0[2-4]X XX XX XX
// Also accepts +213 / 213 / 00213 prefixes and arbitrary separators.
const PHONE_RE = /(?:\+?213|00213|0)\s*[2-7](?:[\s.\-/]?\d){7,8}/

function extractPhone($el, raw) {
  // 1) tel: links (most reliable)
  const tel = $el.find?.('a[href^="tel:"]')?.first?.()?.attr?.('href')
  if (tel) return tel.replace(/^tel:/i, '').trim()
  // 2) data-* attributes commonly used for click-to-reveal phones
  for (const attr of ['data-phone', 'data-tel', 'data-telephone', 'data-number']) {
    const v = $el.attr?.(attr)
    if (v && PHONE_RE.test(v)) return v
  }
  // 3) regex over the full text (handles inline phones)
  const text = (raw ?? $el.text?.() ?? '').replace(/\s+/g, ' ')
  const m = text.match(PHONE_RE)
  return m ? m[0] : ''
}

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
    const phone = extractPhone($el)
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
    const name = $el.find('h1,h2,h3,h4,strong,a').first().text().trim()
    if (!name || name.length > 100) return
    const phone = extractPhone($el, text)
    const href = $el.find('a').first().attr('href') || ''
    const profileUrl = href.startsWith('http') ? href : (href ? `https://algerie-docto.com${href}` : url)
    out.push({ name, speciality, city, address: '', phone, profileUrl })
  })
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
    const phone = extractPhone($card, text)
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

// ───────────────────────── Source: SIHHATECH ─────────────────────────
// sihhatech.com is a JS-driven SPA; server-side scraping returns empty content.
// We try a server fetch first; if it yields no parseable cards we surface a
// directory link so the source still contributes.
async function fetchSihhatech(speciality, city) {
  const q = encodeURIComponent(`${speciality} ${city}`)
  const searchUrl = `https://sihhatech.com/search?query=${q}`
  const r = await politeFetch(searchUrl)
  const out = []
  if (r.ok && r.html) {
    try {
      const $ = cheerio.load(r.html)
      $('[class*="doctor"], [class*="Doctor"], article, .card, li').each((_, el) => {
        const $el = $(el)
        const text = $el.text().replace(/\s+/g, ' ').trim()
        if (!text) return
        const name = $el.find('h1, h2, h3, h4, a').first().text().trim()
        if (!name || name.length < 3 || name.length > 120) return
        if (!/dr|docteur|د\.|دكتور|cabinet|clinique|عياد/i.test(name + ' ' + text)) return
        const phone = extractPhone($el, text)
        const href = $el.find('a').first().attr('href') || ''
        const profileUrl = href.startsWith('http') ? href : (href ? `https://sihhatech.com${href}` : searchUrl)
        out.push({ name, speciality, city, address: '', phone, profileUrl })
      })
    } catch { /* parse failed — fall back to directory */ }
  }
  // Dedup intra-source
  const seen = new Set()
  const unique = []
  for (const d of out) {
    const k = normalizeName(d.name)
    if (!k || seen.has(k)) continue
    seen.add(k); unique.push(d)
  }
  if (unique.length === 0) {
    return {
      source: 'sihhatech',
      results: [{
        name: `Annuaire sihhatech — ${speciality} (${city})`,
        speciality, city, address: '', phone: '',
        profileUrl: searchUrl,
        directoryLink: true,
      }],
      sourceUrl: searchUrl,
    }
  }
  return { source: 'sihhatech', results: unique.slice(0, 12), sourceUrl: searchUrl }
}

// All sources have EQUAL priority — fetched in parallel.
export const SOURCES = [
  { id: 'sahadoc',       fetcher: fetchSahadoc },
  { id: 'algerie-docto', fetcher: fetchAlgerieDocto },
  { id: 'addalile',      fetcher: fetchAddalile },
  { id: 'pj-dz',         fetcher: fetchPjDz },
  { id: 'docteur360',    fetcher: fetchDocteur360 },
  { id: 'sihhatech',     fetcher: fetchSihhatech },
]

// ───────────────────────── Geocoding (Nominatim) ─────────────────────────
async function geocodeOne(query) {
  const key = normalizeText(query)
  if (!key) return null
  const cached = geoCache.get(key)
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL_MS) return cached.coords
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'DZ-GPT/1.0 (doctor-search)', 'Accept-Language': 'ar,fr,en' },
    })
    clearTimeout(t)
    if (!res.ok) return null
    const arr = await res.json()
    if (Array.isArray(arr) && arr[0] && arr[0].lat && arr[0].lon) {
      const coords = { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) }
      geoCache.set(key, { ts: Date.now(), coords })
      return coords
    }
    geoCache.set(key, { ts: Date.now(), coords: null })
  } catch { /* network/timeout — silent */ }
  return null
}

function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat)
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, Math.sqrt(x))))
}

// Annotate up to maxGeocode results with .distanceKm (when address geocodes).
async function annotateDistances(results, userLocation, { maxGeocode = 8 } = {}) {
  if (!userLocation || typeof userLocation.lat !== 'number' || typeof userLocation.lng !== 'number') return results
  const real = results.filter(r => !r.directoryLink)
  const subset = real.slice(0, maxGeocode)
  await Promise.all(subset.map(async (d) => {
    const q = [d.address, d.city, 'Algeria'].filter(Boolean).join(', ').trim()
    if (!q || q === 'Algeria') return
    const coords = await geocodeOne(q)
    if (coords) {
      d.lat = coords.lat
      d.lng = coords.lng
      d.distanceKm = Math.round(haversineKm(userLocation, coords) * 10) / 10
    }
  }))
  return results
}

// ───────────────────────── Merge / Dedup / Rank ─────────────────────────
function dedupKey(d) {
  if (d.directoryLink) return `dir:${d.name}`
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
  const completeness = (d) =>
    (d.phone ? 1 : 0) + (d.address ? 1 : 0) + (d.city ? 1 : 0) + (d.speciality ? 1 : 0)
  return [...map.values()].sort((a, b) => {
    if (!!a.directoryLink !== !!b.directoryLink) return a.directoryLink ? 1 : -1
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length
    if (!!b.phone !== !!a.phone) return (b.phone ? 1 : 0) - (a.phone ? 1 : 0)
    return completeness(b) - completeness(a)
  })
}

// Re-sort: GPS distance first when available, then existing rank.
function rankWithDistance(results) {
  const real = results.filter(d => !d.directoryLink)
  const dirs = results.filter(d => d.directoryLink)
  real.sort((a, b) => {
    const ad = typeof a.distanceKm === 'number' ? a.distanceKm : Infinity
    const bd = typeof b.distanceKm === 'number' ? b.distanceKm : Infinity
    if (ad !== bd) return ad - bd
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length
    return (b.phone ? 1 : 0) - (a.phone ? 1 : 0)
  })
  return [...real, ...dirs]
}

// Translate French fields to Arabic (preserving the original name).
function translateResult(d) {
  d.specialityAr = translateSpeciality(d.speciality)
  d.cityAr = translateCity(d.city)
  d.addressAr = translateAddress(d.address)
  return d
}

// ───────────────────────── Public API ─────────────────────────
export async function searchDoctors({ speciality, city, localResults = [], userLocation = null } = {}) {
  if (!speciality || !city) return { results: [], errors: [] }
  const cacheKey = `${normalizeText(speciality)}|${normalizeText(city)}`
  const geoKey = userLocation ? `|gps:${userLocation.lat.toFixed(2)},${userLocation.lng.toFixed(2)}` : ''
  const fullKey = cacheKey + geoKey
  const cached = getCached(fullKey)
  if (cached) return { results: cached, errors: [], cached: true }

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

  let all = mergeResults(lists)

  // GPS-aware distance annotation + re-rank
  if (userLocation) {
    await annotateDistances(all, userLocation, { maxGeocode: 8 })
    all = rankWithDistance(all)
  }

  const real = all.filter(d => !d.directoryLink).slice(0, 15)
  const dirs = all.filter(d => d.directoryLink)

  // Translate French → Arabic for every kept result
  for (const d of real) translateResult(d)
  for (const d of dirs) translateResult(d)

  const merged = [...real, ...dirs]
  if (real.length > 0) setCached(fullKey, merged)
  return { results: merged, errors, cached: false }
}

// ───────────────────────── Formatting ─────────────────────────
export function osmUrl(name, city) {
  const q = encodeURIComponent([name, city].filter(Boolean).join(' '))
  return `https://www.openstreetmap.org/search?query=${q}`
}

export function googleMapsUrl(name, city) {
  const q = encodeURIComponent([name, city, 'Algeria'].filter(Boolean).join(' '))
  return `https://www.google.com/maps/search/${q}`
}

// RLM (U+200F) at the start of each Markdown paragraph nudges renderers that
// honor `dir="auto"` to detect RTL. We deliberately avoid wrapping each line
// in RLI/PDI brackets — those characters render as visible squares in some
// fonts and break Markdown bold/link parsing in subtle ways.
const RLM = '\u200F'
// Left-to-Right Isolate around phone digits / latin names so they don't get
// reversed when embedded in an Arabic paragraph.
const ltr = (s) => `\u2066${s}\u2069`

function formatPhone(p) {
  if (!p) return ''
  const d = String(p).replace(/\D/g, '')
  let pretty = d
  if (d.length === 10 && d.startsWith('0')) {
    // Mobile: 0XXX XX XX XX
    pretty = `${d.slice(0,4)} ${d.slice(4,6)} ${d.slice(6,8)} ${d.slice(8,10)}`
  } else if (d.length === 9 && d.startsWith('0')) {
    // Fixed-line: 0XX XX XX XX
    pretty = `${d.slice(0,3)} ${d.slice(3,5)} ${d.slice(5,7)} ${d.slice(7,9)}`
  } else if (d.length === 12 && d.startsWith('213')) {
    pretty = `+213 ${d.slice(3,4)} ${d.slice(4,6)} ${d.slice(6,8)} ${d.slice(8,10)} ${d.slice(10,12)}`
  }
  return ltr(pretty)
}

export function formatResults(results, specialityLabel, cityLabel, opts = {}) {
  const { hasGps = false, sourceCount = 6 } = opts
  const header = `${RLM}🩺 **${specialityLabel}${cityLabel ? ` في ${cityLabel}` : ''}**`
  const real = results.filter(d => !d.directoryLink)
  const dirs = results.filter(d => d.directoryLink)

  if (!real.length && !dirs.length) {
    return header + '\n\n' + RLM + 'لم أجد نتائج حالياً من المصادر المتاحة. جرّب تخصصاً مرادفاً أو ولاية مجاورة.'
  }

  const lines = real.map((d, i) => {
    const cityLine = d.cityAr || translateCity(d.city) || cityLabel
    const specLine = d.specialityAr || translateSpeciality(d.speciality) || specialityLabel
    const addrLine = d.addressAr || translateAddress(d.address) || ''
    const distLine = (typeof d.distanceKm === 'number')
      ? `📏 المسافة التقريبية: ${ltr(`~${d.distanceKm} كم`)}`
      : ''
    // Each line starts with RLM so paragraph direction auto-detects to RTL.
    const parts = [
      `${RLM}**${i + 1}. ${ltr(d.name)}**`,
      cityLine ? `${RLM}📍 ${cityLine}` : '',
      `${RLM}🧠 التخصص: ${specLine}`,
      d.phone ? `${RLM}📞 ${formatPhone(d.phone)}` : '',
      addrLine ? `${RLM}🏠 ${addrLine}` : '',
      distLine ? `${RLM}${distLine}` : '',
      `${RLM}🌐 المصدر: ${d.sources.join('، ')}`,
      d.profileUrl ? `${RLM}🔗 [الملف الشخصي](${d.profileUrl})` : '',
    ].filter(Boolean)
    return parts.join('  \n')
  }).join('\n\n---\n\n')

  let out = header + '\n\n' + (lines || `${RLM}_(لا أطباء مفصّلون من المصادر القابلة للقراءة في هذا البحث)_`)
  if (dirs.length) {
    out += '\n\n---\n\n' + `${RLM}📂 **مصادر إضافية للبحث المباشر:**` + '\n\n' +
      dirs.map(d => `${RLM}- 🔗 [${d.sources[0]}](${d.profileUrl})`).join('\n')
  }
  const gpsTag = hasGps ? ' · 📡 GPS مفعّل (مرتّب حسب القرب)' : ''
  out += '\n\n' + `${RLM}_تم البحث في ${sourceCount} مصادر بالتوازي${gpsTag}_`
  return out
}
