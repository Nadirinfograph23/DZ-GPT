// Multi-source doctor search for DZ Agent.
// Sources (EQUAL priority — fetched in parallel):
//   sahadoc, algerie-docto, addalile, pj-dz, docteur360, sihhatech, machrou3, beesiha
// pj-dz, docteur360, sihhatech and machrou3 are SPAs/JS-required and block
// server-side scraping; for those we always return a deep-link "directory"
// entry so every source contributes. All sources have equal weight in
// dedup/merge/ranking.
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

// ───────────────────────── Source: DZDOC ─────────────────────────
// dzdoc.com — Algerian medical directory, tries multiple URL patterns
const DZDOC_SPEC_SLUG = {
  'dentiste': 'dentiste', 'cardiologue': 'cardiologue', 'orthopédiste': 'orthopediste',
  'orthopediste': 'orthopediste', 'gynécologue': 'gynecologue', 'gynecologue': 'gynecologue',
  'pédiatre': 'pediatre', 'pediatre': 'pediatre', 'ophtalmologue': 'ophtalmologue',
  'dermatologue': 'dermatologue', 'généraliste': 'generaliste', 'generaliste': 'generaliste',
  'medecin generaliste': 'generaliste', 'orl': 'orl', 'psychiatre': 'psychiatre',
  'rhumatologue': 'rhumatologue', 'urologue': 'urologue', 'neurologue': 'neurologue',
  'chirurgien': 'chirurgien', 'radiologue': 'radiologue',
}
const DZDOC_CITY_SLUG = {
  'alger': 'alger', 'الجزائر': 'alger', 'oran': 'oran', 'وهران': 'oran',
  'constantine': 'constantine', 'قسنطينة': 'constantine', 'annaba': 'annaba', 'عنابة': 'annaba',
  'setif': 'setif', 'سطيف': 'setif', 'batna': 'batna', 'باتنة': 'batna',
  'blida': 'blida', 'البليدة': 'blida', 'bejaia': 'bejaia', 'بجاية': 'bejaia',
  'tlemcen': 'tlemcen', 'تلمسان': 'tlemcen', 'tizi ouzou': 'tizi-ouzou', 'تيزي وزو': 'tizi-ouzou',
  'skikda': 'skikda', 'سكيكدة': 'skikda', 'guelma': 'guelma', 'قالمة': 'guelma',
  'ouargla': 'ouargla', 'ورقلة': 'ouargla', 'biskra': 'biskra', 'بسكرة': 'biskra',
  'mostaganem': 'mostaganem', 'مستغانم': 'mostaganem', 'tiaret': 'tiaret', 'تيارت': 'tiaret',
  'jijel': 'jijel', 'جيجل': 'jijel', 'bechar': 'bechar', 'بشار': 'bechar',
  'mascara': 'mascara', 'معسكر': 'mascara', 'medea': 'medea', 'المدية': 'medea',
  'boumerdes': 'boumerdes', 'بومرداس': 'boumerdes', 'tipaza': 'tipaza', 'تيبازة': 'tipaza',
  'mila': 'mila', 'ميلة': 'mila', 'el oued': 'el-oued', 'الوادي': 'el-oued',
  'souk ahras': 'souk-ahras', 'سوق أهراس': 'souk-ahras', 'sidi bel abbes': 'sidi-bel-abbes',
  'chlef': 'chlef', 'الشلف': 'chlef', 'laghouat': 'laghouat', 'الأغواط': 'laghouat',
  'ghardaia': 'ghardaia', 'غرداية': 'ghardaia', 'tamanrasset': 'tamanrasset',
  'adrar': 'adrar', 'ain defla': 'ain-defla', 'ain temouchent': 'ain-temouchent',
  'msila': 'msila', 'المسيلة': 'msila', 'khenchela': 'khenchela', 'خنشلة': 'khenchela',
}

async function fetchDzdoc(speciality, city) {
  const specKey = normalizeText(speciality || '')
  const cityKey = normalizeText(city || '')
  const specSlug = DZDOC_SPEC_SLUG[specKey] || slugify(speciality || '')
  const citySlug = DZDOC_CITY_SLUG[cityKey] || DZDOC_CITY_SLUG[city?.toLowerCase()] || slugify(city || '')
  const q = encodeURIComponent(`${speciality || ''} ${city || ''}`.trim())

  const candidates = []
  if (specSlug && citySlug) {
    candidates.push(`https://dzdoc.com/medecins/${specSlug}/${citySlug}`)
    candidates.push(`https://dzdoc.com/annuaire/${specSlug}-${citySlug}`)
    candidates.push(`https://dzdoc.com/docteurs?specialite=${specSlug}&ville=${citySlug}`)
  }
  candidates.push(`https://dzdoc.com/search?q=${q}`)
  candidates.push(`https://dzdoc.com/recherche?q=${q}`)
  candidates.push(`https://dzdoc.com/?s=${q}`)

  const out = []
  let usedUrl = candidates[0]

  for (const url of candidates) {
    usedUrl = url
    const r = await politeFetch(url, { timeoutMs: 9000 })
    if (!r.ok || !r.html) continue
    try {
      const $ = cheerio.load(r.html)
      $([
        '[class*="doctor"]', '[class*="Doctor"]', '[class*="medecin"]', '[class*="Medecin"]',
        '[class*="praticien"]', '[class*="card"]', '[class*="Card"]', '[class*="result"]',
        'article', '.listing-item', '.doc-item', '.profile-item', 'li.item',
      ].join(', ')).each((_, el) => {
        const $el = $(el)
        const text = $el.text().replace(/\s+/g, ' ').trim()
        if (!text || text.length < 5) return
        const name = $el.find('h1,h2,h3,h4,a,strong,.name,.title,.doctor-name,.medecin-name').first().text().trim()
        if (!name || name.length < 3 || name.length > 120) return
        if (!/dr\.?|د\.?|دكتور|docteur|cabinet|clinique|médecin|medecin|طبيب|عيادة/i.test(name + ' ' + text)) return
        const phone = extractPhone($el, text)
        const addrEl = $el.find('[class*="addr"],[class*="loc"],[class*="adresse"],address').first().text().trim()
          || $el.find('p,span').filter((_, e) => /rue|avenue|cité|boulevard|commune|شارع|حي/i.test($(e).text())).first().text().trim()
        const specEl = $el.find('[class*="spec"],[class*="special"],[class*="Spec"]').first().text().trim()
          || $el.find('span,small,p').filter((_, e) => /dentiste|cardio|gyneco|pediatr|dermato|généraliste/i.test($(e).text())).first().text().trim()
        const href = ($el.find('a').first().attr('href') || '').trim()
        const profileUrl = href.startsWith('http') ? href : (href ? `https://dzdoc.com${href.startsWith('/') ? '' : '/'}${href}` : url)
        out.push({ name, speciality: specEl || speciality || '', city: city || '', address: addrEl || '', phone, profileUrl })
      })
      if (out.length >= 3) break
    } catch { /* try next URL */ }
  }

  const seen = new Set()
  const unique = []
  for (const d of out) {
    const k = normalizeName(d.name)
    if (!k || seen.has(k)) continue
    seen.add(k); unique.push(d)
  }

  if (unique.length === 0) {
    return {
      source: 'dzdoc',
      results: [{
        name: `dzdoc.com — ${speciality || ''}${city ? ' (' + city + ')' : ''}`.trim(),
        speciality: speciality || '', city: city || '', address: '', phone: '',
        profileUrl: `https://dzdoc.com/search?q=${q}`,
        directoryLink: true,
      }],
      sourceUrl: usedUrl,
    }
  }
  return { source: 'dzdoc', results: unique.slice(0, 15), sourceUrl: usedUrl }
}

// ───────────────────────── Source: DALIL ATIBAA ─────────────────────────
// dalil-atibaa.com — Algerian medical directory
const DALIL_SPEC_SLUG = {
  'dentiste': 'dentistes', 'cardiologue': 'cardiologues', 'orthopédiste': 'orthopedistes',
  'orthopediste': 'orthopedistes', 'gynécologue': 'gynecologues', 'gynecologue': 'gynecologues',
  'pédiatre': 'pediatres', 'pediatre': 'pediatres', 'ophtalmologue': 'ophtalmologues',
  'dermatologue': 'dermatologues', 'généraliste': 'generalistes', 'generaliste': 'generalistes',
  'medecin generaliste': 'generalistes', 'orl': 'orl', 'psychiatre': 'psychiatres',
  'rhumatologue': 'rhumatologues', 'urologue': 'urologues', 'neurologue': 'neurologues',
  'chirurgien': 'chirurgiens', 'radiologue': 'radiologues',
}
const DALIL_CITY_SLUG = {
  'alger': 'alger', 'الجزائر': 'alger', 'oran': 'oran', 'وهران': 'oran',
  'constantine': 'constantine', 'قسنطينة': 'constantine', 'annaba': 'annaba', 'عنابة': 'annaba',
  'setif': 'setif', 'سطيف': 'setif', 'batna': 'batna', 'باتنة': 'batna',
  'blida': 'blida', 'البليدة': 'blida', 'bejaia': 'bejaia', 'بجاية': 'bejaia',
  'tlemcen': 'tlemcen', 'تلمسان': 'tlemcen', 'tizi ouzou': 'tizi-ouzou', 'تيزي وزو': 'tizi-ouzou',
  'skikda': 'skikda', 'سكيكدة': 'skikda', 'guelma': 'guelma', 'قالمة': 'guelma',
  'ouargla': 'ouargla', 'ورقلة': 'ouargla', 'biskra': 'biskra', 'بسكرة': 'biskra',
  'mostaganem': 'mostaganem', 'مستغانم': 'mostaganem', 'tiaret': 'tiaret', 'تيارت': 'tiaret',
  'jijel': 'jijel', 'جيجل': 'jijel', 'bechar': 'bechar', 'بشار': 'bechar',
  'medea': 'medea', 'المدية': 'medea', 'boumerdes': 'boumerdes', 'بومرداس': 'boumerdes',
  'mila': 'mila', 'ميلة': 'mila', 'sidi bel abbes': 'sidi-bel-abbes',
  'chlef': 'chlef', 'الشلف': 'chlef', 'laghouat': 'laghouat', 'ghardaia': 'ghardaia',
  'mascara': 'mascara', 'msila': 'msila', 'el oued': 'el-oued',
}

async function fetchDalilAtibaa(speciality, city) {
  const specKey = normalizeText(speciality || '')
  const cityKey = normalizeText(city || '')
  const specSlug = DALIL_SPEC_SLUG[specKey] || slugify(speciality || '')
  const citySlug = DALIL_CITY_SLUG[cityKey] || DALIL_CITY_SLUG[city?.toLowerCase()] || slugify(city || '')
  const q = encodeURIComponent(`${speciality || ''} ${city || ''}`.trim())

  const candidates = []
  if (specSlug && citySlug) {
    candidates.push(`https://www.dalil-atibaa.com/medecins/${specSlug}-${citySlug}.html`)
    candidates.push(`https://www.dalil-atibaa.com/${specSlug}/${citySlug}`)
    candidates.push(`https://www.dalil-atibaa.com/medecin/${specSlug}-${citySlug}`)
    candidates.push(`https://www.dalil-atibaa.com/recherche?specialite=${specSlug}&ville=${citySlug}`)
  }
  candidates.push(`https://www.dalil-atibaa.com/recherche?q=${q}`)
  candidates.push(`https://www.dalil-atibaa.com/search?q=${q}`)
  candidates.push(`https://www.dalil-atibaa.com/?s=${q}`)

  const out = []
  let usedUrl = candidates[0]

  for (const url of candidates) {
    usedUrl = url
    const r = await politeFetch(url, { timeoutMs: 9000 })
    if (!r.ok || !r.html) continue
    try {
      const $ = cheerio.load(r.html)
      $([
        '[class*="doctor"]', '[class*="Doctor"]', '[class*="medecin"]', '[class*="Medecin"]',
        '[class*="praticien"]', '[class*="card"]', '[class*="Card"]',
        '[class*="result"]', '[class*="listing"]', 'article', '.doc-item',
        'li.item', 'li.medecin', 'li.doctor', '.entry', '.post',
      ].join(', ')).each((_, el) => {
        const $el = $(el)
        const text = $el.text().replace(/\s+/g, ' ').trim()
        if (!text || text.length < 5) return
        const name = $el.find('h1,h2,h3,h4,a,strong,.name,.titre,.doctor-name').first().text().trim()
        if (!name || name.length < 3 || name.length > 120) return
        if (!/dr\.?|د\.?|دكتور|docteur|cabinet|clinique|médecin|medecin|طبيب|عيادة/i.test(name + ' ' + text)) return
        const phone = extractPhone($el, text)
        const addrEl = $el.find('[class*="addr"],[class*="loc"],[class*="adresse"],address').first().text().trim()
          || $el.find('p,span').filter((_, e) => /rue|avenue|cité|boulevard|commune|شارع|حي/i.test($(e).text())).first().text().trim()
        const specEl = $el.find('[class*="spec"],[class*="special"],[class*="Spec"],[class*="specialite"]').first().text().trim()
          || $el.find('span,small,p').filter((_, e) => /dentiste|cardio|gyneco|pediatr|dermato|généraliste/i.test($(e).text())).first().text().trim()
        const href = ($el.find('a').first().attr('href') || '').trim()
        const profileUrl = href.startsWith('http') ? href : (href ? `https://www.dalil-atibaa.com${href.startsWith('/') ? '' : '/'}${href}` : url)
        out.push({ name, speciality: specEl || speciality || '', city: city || '', address: addrEl || '', phone, profileUrl })
      })
      if (out.length >= 3) break
    } catch { /* try next URL */ }
  }

  const seen = new Set()
  const unique = []
  for (const d of out) {
    const k = normalizeName(d.name)
    if (!k || seen.has(k)) continue
    seen.add(k); unique.push(d)
  }

  if (unique.length === 0) {
    return {
      source: 'dalil-atibaa',
      results: [{
        name: `dalil-atibaa.com — ${speciality || ''}${city ? ' (' + city + ')' : ''}`.trim(),
        speciality: speciality || '', city: city || '', address: '', phone: '',
        profileUrl: `https://www.dalil-atibaa.com/recherche?q=${q}`,
        directoryLink: true,
      }],
      sourceUrl: usedUrl,
    }
  }
  return { source: 'dalil-atibaa', results: unique.slice(0, 15), sourceUrl: usedUrl }
}

// ───────────────────────── Source: MON MEDECIN DZ ─────────────────────────
// monmedecin-dz.com — Algerian doctor booking / directory site
const MONMEDECIN_SPEC_SLUG = {
  'dentiste': 'dentiste', 'cardiologue': 'cardiologue', 'orthopédiste': 'orthopediste',
  'orthopediste': 'orthopediste', 'gynécologue': 'gynecologue', 'gynecologue': 'gynecologue',
  'pédiatre': 'pediatre', 'pediatre': 'pediatre', 'ophtalmologue': 'ophtalmologue',
  'dermatologue': 'dermatologue', 'généraliste': 'generaliste', 'generaliste': 'generaliste',
  'medecin generaliste': 'generaliste', 'orl': 'orl', 'psychiatre': 'psychiatre',
  'rhumatologue': 'rhumatologue', 'urologue': 'urologue', 'neurologue': 'neurologue',
  'chirurgien': 'chirurgien', 'radiologue': 'radiologue',
}
const MONMEDECIN_CITY_SLUG = {
  'alger': 'alger', 'الجزائر': 'alger', 'oran': 'oran', 'وهران': 'oran',
  'constantine': 'constantine', 'قسنطينة': 'constantine', 'annaba': 'annaba', 'عنابة': 'annaba',
  'setif': 'setif', 'سطيف': 'setif', 'batna': 'batna', 'باتنة': 'batna',
  'blida': 'blida', 'البليدة': 'blida', 'bejaia': 'bejaia', 'بجاية': 'bejaia',
  'tlemcen': 'tlemcen', 'تلمسان': 'tlemcen', 'tizi ouzou': 'tizi-ouzou', 'تيزي وزو': 'tizi-ouzou',
  'skikda': 'skikda', 'سكيكدة': 'skikda', 'guelma': 'guelma', 'قالمة': 'guelma',
  'ouargla': 'ouargla', 'ورقلة': 'ouargla', 'biskra': 'biskra', 'بسكرة': 'biskra',
  'mostaganem': 'mostaganem', 'مستغانم': 'mostaganem', 'tiaret': 'tiaret', 'تيارت': 'tiaret',
  'jijel': 'jijel', 'جيجل': 'jijel', 'bechar': 'bechar', 'بشار': 'bechar',
  'medea': 'medea', 'المدية': 'medea', 'boumerdes': 'boumerdes', 'بومرداس': 'boumerdes',
  'mila': 'mila', 'ميلة': 'mila', 'sidi bel abbes': 'sidi-bel-abbes',
  'chlef': 'chlef', 'الشلف': 'chlef', 'laghouat': 'laghouat', 'ghardaia': 'ghardaia',
  'mascara': 'mascara', 'msila': 'msila', 'el oued': 'el-oued',
}

async function fetchMonMedecinDz(speciality, city) {
  const specKey = normalizeText(speciality || '')
  const cityKey = normalizeText(city || '')
  const specSlug = MONMEDECIN_SPEC_SLUG[specKey] || slugify(speciality || '')
  const citySlug = MONMEDECIN_CITY_SLUG[cityKey] || MONMEDECIN_CITY_SLUG[city?.toLowerCase()] || slugify(city || '')
  const q = encodeURIComponent(`${speciality || ''} ${city || ''}`.trim())

  const candidates = []
  if (specSlug && citySlug) {
    candidates.push(`https://monmedecin-dz.com/medecins/${specSlug}/${citySlug}`)
    candidates.push(`https://monmedecin-dz.com/docteurs/${specSlug}-${citySlug}`)
    candidates.push(`https://monmedecin-dz.com/search?specialite=${specSlug}&ville=${citySlug}`)
  }
  candidates.push(`https://monmedecin-dz.com/search?q=${q}`)
  candidates.push(`https://monmedecin-dz.com/recherche?q=${q}`)
  candidates.push(`https://monmedecin-dz.com/?s=${q}`)

  const out = []
  let usedUrl = candidates[0]

  for (const url of candidates) {
    usedUrl = url
    const r = await politeFetch(url, { timeoutMs: 9000 })
    if (!r.ok || !r.html) continue
    try {
      const $ = cheerio.load(r.html)
      $([
        '[class*="doctor"]', '[class*="Doctor"]', '[class*="medecin"]', '[class*="Medecin"]',
        '[class*="praticien"]', '[class*="card"]', '[class*="Card"]', '[class*="result"]',
        '[class*="listing"]', 'article', '.doc-item', 'li.item', '.entry',
      ].join(', ')).each((_, el) => {
        const $el = $(el)
        const text = $el.text().replace(/\s+/g, ' ').trim()
        if (!text || text.length < 5) return
        const name = $el.find('h1,h2,h3,h4,a,strong,.name,.titre,.doctor-name').first().text().trim()
        if (!name || name.length < 3 || name.length > 120) return
        if (!/dr\.?|د\.?|دكتور|docteur|cabinet|clinique|médecin|medecin|طبيب|عيادة/i.test(name + ' ' + text)) return
        const phone = extractPhone($el, text)
        const addrEl = $el.find('[class*="addr"],[class*="loc"],[class*="adresse"],address').first().text().trim()
          || $el.find('p,span').filter((_, e) => /rue|avenue|cité|boulevard|commune|شارع|حي/i.test($(e).text())).first().text().trim()
        const specEl = $el.find('[class*="spec"],[class*="special"],[class*="Spec"],[class*="specialite"]').first().text().trim()
          || $el.find('span,small,p').filter((_, e) => /dentiste|cardio|gyneco|pediatr|dermato|généraliste/i.test($(e).text())).first().text().trim()
        const href = ($el.find('a').first().attr('href') || '').trim()
        const profileUrl = href.startsWith('http') ? href : (href ? `https://monmedecin-dz.com${href.startsWith('/') ? '' : '/'}${href}` : url)
        out.push({ name, speciality: specEl || speciality || '', city: city || '', address: addrEl || '', phone, profileUrl })
      })
      if (out.length >= 3) break
    } catch { /* try next URL */ }
  }

  const seen = new Set()
  const unique = []
  for (const d of out) {
    const k = normalizeName(d.name)
    if (!k || seen.has(k)) continue
    seen.add(k); unique.push(d)
  }

  if (unique.length === 0) {
    return {
      source: 'monmedecin-dz',
      results: [{
        name: `monmedecin-dz.com — ${speciality || ''}${city ? ' (' + city + ')' : ''}`.trim(),
        speciality: speciality || '', city: city || '', address: '', phone: '',
        profileUrl: `https://monmedecin-dz.com/search?q=${q}`,
        directoryLink: true,
      }],
      sourceUrl: usedUrl,
    }
  }
  return { source: 'monmedecin-dz', results: unique.slice(0, 15), sourceUrl: usedUrl }
}


// ═══════════════════════════════════════════════════════════════
// ACTIVE SOURCES — 4 Algerian medical directories (equal priority)
// ═══════════════════════════════════════════════════════════════
export const SOURCES = [
  { id: 'sahadoc',      fetcher: fetchSahadoc },
  { id: 'dzdoc',        fetcher: fetchDzdoc },
  { id: 'dalil-atibaa', fetcher: fetchDalilAtibaa },
  { id: 'monmedecin-dz',fetcher: fetchMonMedecinDz },
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
    // 1. Real results before directory links
    if (!!a.directoryLink !== !!b.directoryLink) return a.directoryLink ? 1 : -1
    // 2. Phone availability (highest priority for real results)
    if (!!b.phone !== !!a.phone) return (b.phone ? 1 : 0) - (a.phone ? 1 : 0)
    // 3. Confirmed by more sources
    if (b.sources.length !== a.sources.length) return b.sources.length - a.sources.length
    // 4. More complete profile
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

// ───────────────────────── Fuzzy name scoring ─────────────────────────
function tokenSet(s) {
  return new Set(normalizeName(s).split(' ').filter(t => t && t.length > 1))
}
function nameScore(query, candidate) {
  const q = tokenSet(query)
  const c = tokenSet(candidate)
  if (q.size === 0 || c.size === 0) return 0
  let inter = 0
  for (const t of q) if (c.has(t)) inter++
  // Jaccard-ish overlap, plus prefix bonus
  const overlap = inter / q.size
  const candStr = normalizeName(candidate)
  const qStr = normalizeName(query)
  const prefixBonus = candStr.includes(qStr) ? 0.4 : 0
  return overlap + prefixBonus
}

// ───────────────────────── Public API: Search by name ─────────────────────────
export async function searchDoctorsByName({ name, userLocation = null } = {}) {
  const cleanName = normalizeName(name)
  if (!cleanName) return { results: [], errors: [] }
  const cacheKey = `byname:${cleanName}`
  const cached = getCached(cacheKey)
  if (cached) return { results: cached, errors: [], cached: true }

  // Use the name as the search term across all sources (city left blank).
  const settled = await Promise.allSettled(
    SOURCES.map(s => s.fetcher(name, ''))
  )
  const lists = []
  const errors = []
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

  // The name was passed as the "speciality" arg to the source fetchers, so
  // clear that polluted field — we have no real specialty when searching by name.
  for (const d of all) {
    if (normalizeText(d.speciality) === normalizeText(name)) d.speciality = ''
  }
  // Score each non-directory result against the name query and filter.
  for (const d of all) {
    if (!d.directoryLink) d.nameScore = nameScore(name, d.name)
  }
  const real = all
    .filter(d => !d.directoryLink && (d.nameScore || 0) >= 0.3)
    .sort((a, b) => (b.nameScore || 0) - (a.nameScore || 0))
    .slice(0, 15)
  const dirs = all.filter(d => d.directoryLink)

  if (userLocation && real.length) {
    await annotateDistances(real, userLocation, { maxGeocode: 8 })
  }

  for (const d of real) translateResult(d)
  for (const d of dirs) translateResult(d)

  const merged = [...real, ...dirs]
  if (real.length > 0) setCached(cacheKey, merged)
  return { results: merged, errors, cached: false, byName: true, queryName: name }
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

// ─── Clickable map link ─────────────────────────────────────────────────────
// Returns a Markdown link that opens Google Maps.
// If lat/lng are known, uses precise coordinates (pin). Otherwise, uses text search.
// Apple Maps fallback is handled client-side (OS detection is browser-side).
export function mapLink(name, city, lat, lng, label) {
  let gmUrl, osmFallback
  if (lat && lng) {
    gmUrl     = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    osmFallback = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=17`
  } else {
    const q   = encodeURIComponent([name, city, 'Algérie'].filter(Boolean).join(', '))
    gmUrl     = `https://www.google.com/maps/search/?api=1&query=${q}`
    osmFallback = `https://www.openstreetmap.org/search?query=${q}`
  }
  const display = label || [name, city].filter(Boolean).join(' — ') || 'خريطة'
  // Primary: Google Maps | secondary OSM in brackets
  return `[📍 ${display}](${gmUrl})`
}

// ─── Clickable phone (tel: link) ────────────────────────────────────────────
// Converts an Algerian phone number to a tel: Markdown link.
// Works on Android, iPhone, WebView, PWA.
export function telLink(phone) {
  if (!phone) return ''
  const d = String(phone).replace(/\D/g, '')
  let e164 = d
  if (d.length === 10 && d.startsWith('0')) {
    e164 = '+213' + d.slice(1)
  } else if (d.length === 9 && !d.startsWith('0') && !d.startsWith('2')) {
    e164 = '+213' + d
  } else if (d.length === 12 && d.startsWith('213')) {
    e164 = '+' + d
  } else if (d.startsWith('00213')) {
    e164 = '+' + d.slice(2)
  }
  const pretty = formatPhone(phone)
  return `[📞 ${pretty}](tel:${e164})`
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

// ───────────────────────── Emergency numbers (Algeria) ─────────────────────────
export const EMERGENCY_INFO = `${RLM}🚑 **أرقام الطوارئ في الجزائر:**

${RLM}- 🚒 **الحماية المدنية:** ${ltr('14')}
${RLM}- 👮 **الشرطة:** ${ltr('1548')}
${RLM}- 🪖 **الدرك الوطني:** ${ltr('1055')}
${RLM}- 🚑 **الإسعاف (SAMU):** ${ltr('115')} _(أو حسب الولاية / المستشفى)_
${RLM}- ☎️ **الاستعلامات الطبية:** اتصل بمستشفى الولاية مباشرة

${RLM}_في حالة طارئة قصوى: اتصل بـ **14** (الحماية المدنية) — متاح ${ltr('24/7')}._`

// Render results as a mandatory 4-column Markdown table (RTL friendly via leading RLM).
// Columns: اسم الطبيب | الاختصاص | العنوان | الهاتف
function renderTable(real, fallbackSpec, fallbackCity) {
  const header =
    `${RLM}| 👨‍⚕️ اسم الطبيب | 🏥 الاختصاص | 📍 العنوان | 📞 الهاتف |\n` +
    `${RLM}|---|---|---|---|`
  const rows = real.map((d) => {
    const rawName = d.name?.trim() || '—'
    const cleanName = /^(dr\.?\s|docteur\s|د\.?\s|الدكتور\s|الدكتوره\s|دكتور\s|دكتوره\s)/i.test(rawName)
      ? rawName : `د. ${rawName}`
    const name = ltr(cleanName)

    const spec = (d.specialityAr || translateSpeciality(d.speciality) || fallbackSpec || '—').replace(/\|/g, '·')
    const cityTxt = (d.cityAr || translateCity(d.city) || fallbackCity || '').replace(/\|/g, '·')
    const addrTxt = (d.addressAr || translateAddress(d.address) || '').replace(/\|/g, '·')
    const distStr = typeof d.distanceKm === 'number' ? ` _(~${d.distanceKm} كم)_` : ''

    // Clickable address → Google Maps
    const locationLabel = addrTxt ? `${addrTxt}، ${cityTxt}` : (cityTxt || 'الجزائر')
    const locationCell = mapLink(cleanName, cityTxt, d.lat, d.lng, locationLabel + distStr).replace(/\|/g, '·')

    // Clickable phone → tel: link
    const phoneCell = d.phone ? telLink(d.phone).replace(/\|/g, '·') : '—'

    return `${RLM}| **${name}** | ${spec} | ${locationCell} | ${phoneCell} |`
  })
  return [header, ...rows].join('\n')
}

// Specialty → emoji map for card headers
const SPEC_EMOJI = {
  'أسنان': '🦷', 'قلب': '🫀', 'عظام': '🦴', 'أطفال': '👶',
  'عيون': '👁️', 'جلدية': '🌿', 'نفسي': '🧠', 'نساء': '👩‍⚕️',
  'توليد': '👩‍⚕️', 'أعصاب': '🧬', 'مسالك': '💧', 'هضمي': '🩺',
  'رئة': '🫁', 'أورام': '🩺', 'كلى': '🩺', 'غدد': '🩺',
  'أشعة': '📡', 'جراح': '🔪', 'عام': '🩺', 'باطني': '🩺',
}

function specEmoji(spec) {
  if (!spec) return '🩺'
  for (const [k, v] of Object.entries(SPEC_EMOJI)) {
    if (spec.includes(k)) return v
  }
  return '🩺'
}

// Guess gender from name (Arabic female names or French feminine endings)
function guessGender(name) {
  if (!name) return 'm'
  const n = name
  if (/(?:سمية|فاطمة|نور|مريم|أمينة|سارة|رنيم|إيمان|خديجة|هدى|نادية|ليلى|سناء|وردة|أسماء|زينب|حنان|رشيدة|بشرى|لطيفة|جميلة|حورية|نجوى|سهيلة|وسيلة|كريمة|نعيمة|صليحة|عقيلة|زهرة|يمينة)/i.test(n)) return 'f'
  if (/(?:Sonia|Samia|Fatima|Sara|Nora|Maria|Leila|Nadia|Amina|Rania|Meriem|Asma|Khadija|Houda|Dalila|Nassima|Djamila|Hanane|Nawel|Souad|Farida|Malika|Karima|Naima)\b/i.test(n)) return 'f'
  if (/a$/.test(n.trim().split(' ').pop() || '')) return 'f'
  return 'm'
}

// Render results as clean doctor cards — RTL, clickable address + phone
// Order (mandatory): 1-Name, 2-Specialty, 3-Address (→Maps), 4-Phone (→tel:)
function renderCards(real, fallbackSpec, fallbackCity) {
  return real.map((d, i) => {
    const specLine = d.specialityAr || translateSpeciality(d.speciality) || fallbackSpec || ''
    const cityLine = d.cityAr || translateCity(d.city) || fallbackCity || ''
    const addrLine = d.addressAr || translateAddress(d.address) || ''
    const emoji = specEmoji(specLine)
    const genderIcon = guessGender(d.name) === 'f' ? '👩‍⚕️' : '👨‍⚕️'

    // ── 1. Name ────────────────────────────────────────────────────────────
    const cleanName = /^(dr\.?\s|docteur\s|د\.?\s|الدكتور\s)/i.test(d.name.trim())
      ? d.name.trim()
      : `د. ${d.name.trim()}`

    // ── 2. Specialty ───────────────────────────────────────────────────────
    const specStr = specLine ? `${RLM}• ${emoji} **${specLine}**` : ''

    // ── 3. Address → clickable Google Maps link ────────────────────────────
    const distStr = typeof d.distanceKm === 'number' ? ` _(~${d.distanceKm} كم)_` : ''
    let addrStr = ''
    if (addrLine || cityLine) {
      const locationLabel = addrLine
        ? `${addrLine}، ${cityLine}`.replace(/^،\s*/, '').replace(/،\s*$/, '')
        : cityLine
      // mapLink generates: [📍 label](https://maps.google.com/...)
      addrStr = `${RLM}• ${mapLink(cleanName, cityLine, d.lat, d.lng, locationLabel)}${distStr}`
    }

    // ── 4. Phone → clickable tel: link ────────────────────────────────────
    let phoneStr = ''
    if (d.phone) {
      // telLink generates: [📞 0550 XX XX XX](tel:+213550XXXXXX)
      phoneStr = `${RLM}• ${telLink(d.phone)}`
    } else {
      phoneStr = `${RLM}• 📞 _غير متوفر_`
    }

    const lines = [
      `${RLM}${genderIcon} **${ltr(cleanName)}**`,
      specStr,
      addrStr,
      phoneStr,
    ].filter(Boolean)

    // Optional: profile page link
    if (d.profileUrl && !d.directoryLink) {
      lines.push(`${RLM}• 🔗 [صفحة الطبيب](${d.profileUrl})`)
    }

    return lines.join('  \n')
  }).join('\n\n')
}

export function formatResults(results, specialityLabel, cityLabel, opts = {}) {
  const { hasGps = false, sourceCount = 4, byName = false, queryName = '' } = opts
  const specEmoji2 = specEmoji(specialityLabel)
  const today = new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const headerLabel = byName
    ? `🔎 **نتائج البحث عن: ${ltr(queryName || specialityLabel)}**`
    : `${specEmoji2} **${specialityLabel}${cityLabel ? ` في ${cityLabel}` : ''}**`
  const header = `${RLM}${headerLabel}\n${RLM}_📅 ${today}_`
  const real = results.filter(d => !d.directoryLink)
  const dirs = results.filter(d => d.directoryLink)

  if (!real.length && !dirs.length) {
    return (
      header + '\n\n' +
      `${RLM}> ⚠️ لم أجد نتائج حالياً من ${sourceCount} مصادر متاحة.\n\n` +
      `${RLM}💡 **اقتراحات:**\n` +
      `${RLM}• جرّب ولاية مجاورة\n` +
      `${RLM}• جرّب تخصصاً مرادفاً (مثل: طبيب عام بدل باطني)\n` +
      `${RLM}• ابحث باسم الطبيب مباشرة: \`دكتور [الاسم]\``
    )
  }

  // ── ALWAYS render a 4-column table: اسم الطبيب | الاختصاص | العنوان | الهاتف ──
  let body = ''
  if (real.length > 0) {
    const withPhone  = real.filter(d => d.phone).length
    const withAddr   = real.filter(d => d.address || d.city).length
    const stats = [
      `**${real.length}** طبيب`,
      withPhone ? `📞 ${withPhone} رقم قابل للاتصال` : null,
      withAddr  ? `📍 ${withAddr} عنوان على الخريطة` : null,
      hasGps    ? '📡 مرتّب حسب القرب منك' : 'مرتّب حسب اكتمال البيانات',
    ].filter(Boolean).join(' · ')
    body = `${RLM}> ✅ ${stats}\n\n` + renderTable(real, specialityLabel, cityLabel)
  } else if (dirs.length > 0) {
    // No scraped data — show directory sources in a table so the user still gets a table
    body = `${RLM}> ⚠️ لم تتوفر بيانات مفصّلة من المواقع الطبية مباشرةً — إليك روابط البحث المباشر:\n\n` +
      `${RLM}| 🌐 الموقع الطبي | 🔗 بحث مباشر |\n` +
      `${RLM}|---|---|\n` +
      dirs.map(d => {
        const name = d.name || d.sources?.[0] || 'دليل طبي'
        const link = d.profileUrl ? `[🔍 ابحث هنا](${d.profileUrl})` : '—'
        return `${RLM}| **${name}** | ${link} |`
      }).join('\n')
  } else {
    body = `${RLM}> _(لم تُرجع أي مصادر بيانات لهذا البحث)_`
  }

  let out = header + '\n\n' + body

  // Only add the directory section when we also have real results (avoid duplication)
  if (dirs.length && real.length > 0) {
    out += '\n\n---\n\n' +
      `${RLM}📂 **بحث مباشر في المواقع الطبية:**\n\n` +
      dirs.map(d => `${RLM}• 🌐 [${d.name || d.sources?.[0] || 'دليل'}](${d.profileUrl})`).join('\n')
  }

  const tipGps  = !hasGps ? `\n${RLM}💡 _أرسل موقعك الجغرافي لترتيب النتائج حسب القرب منك_` : ''
  out += `\n\n${RLM}---\n${RLM}_اضغط 📍 للخريطة · اضغط 📞 للاتصال المباشر_${tipGps}`
  return out
}
