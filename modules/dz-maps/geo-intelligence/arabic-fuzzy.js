/**
 * GeoIntelligence — Arabic Fuzzy Matching Engine
 * Handles: diacritics removal, normalization, AR↔FR transliteration,
 *          typo tolerance (Levenshtein/Jaro-Winkler), mixed-language queries
 */

// ── Arabic diacritics (tashkeel) ──────────────────────────────────────────
const DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g

// ── Hamza / Alif normalization map ────────────────────────────────────────
const ALIF_NORMALIZE = [
  [/[أإآٱ]/g, 'ا'],
  [/ة/g,      'ه'],
  [/ى/g,      'ي'],
  [/ئ/g,      'ي'],
  [/ؤ/g,      'و'],
]

// ── Arabic → Latin transliteration (for matching FR/EN queries) ───────────
const AR_TO_LATIN = [
  ['ش', 'ch'], ['ث', 'th'], ['خ', 'kh'], ['ذ', 'dh'], ['ص', 'ss'],
  ['ض', 'dh'], ['ط', 'tt'], ['ظ', 'th'], ['غ', 'gh'], ['ق', 'q'],
  ['ع', "'"],  ['ح', 'h'],  ['ج', 'dj'], ['ز', 'z'],  ['ر', 'r'],
  ['ن', 'n'],  ['م', 'm'],  ['ل', 'l'],  ['ك', 'k'],  ['ف', 'f'],
  ['ب', 'b'],  ['ت', 't'],  ['د', 'd'],  ['س', 's'],  ['و', 'ou'],
  ['ي', 'i'],  ['ا', 'a'],  ['ه', 'e'],  ['ح', 'h'],  ['ء', ''],
]

// ── French → Arabic approximate map (common Algerian place prefixes) ──────
const FR_PREFIX_MAP = {
  'ain':     'عين',
  'aïn':     'عين',
  "ain el":  'عين ال',
  'oued':    'واد',
  'sidi':    'سيدي',
  'beni':    'بني',
  'bou':     'بو',
  'el':      'ال',
  'ech':     'الش',
  'les':     '',
  'bir':     'بئر',
  'ksar':    'قصر',
  'dar':     'دار',
  'zaouia':  'زاوية',
  'djebel':  'جبل',
  'bordj':   'برج',
  'souk':    'سوق',
  'messaad': 'مسعد',
}

// ── French accent normalization ────────────────────────────────────────────
const FR_ACCENT_MAP = [
  [/[éèêë]/g, 'e'],
  [/[àâä]/g,  'a'],
  [/[ùûü]/g,  'u'],
  [/[ôö]/g,   'o'],
  [/[îï]/g,   'i'],
  [/ç/g,      'c'],
  [/œ/g,      'oe'],
  [/æ/g,      'ae'],
]

/**
 * Normalize Arabic text:
 * remove diacritics, normalize alif/hamza/teh-marbuta/alif-maqsoura
 */
export function normalizeArabic(str) {
  if (!str) return ''
  let s = str.replace(DIACRITICS_RE, '')
  for (const [re, rep] of ALIF_NORMALIZE) s = s.replace(re, rep)
  return s.trim().toLowerCase()
}

/**
 * Normalize French/Latin text:
 * lowercase, remove accents, collapse spaces
 */
export function normalizeLatin(str) {
  if (!str) return ''
  let s = str.toLowerCase()
  for (const [re, rep] of FR_ACCENT_MAP) s = s.replace(re, rep)
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Smart normalize: detects Arabic vs Latin and applies correct normalization
 */
export function smartNormalize(str) {
  if (!str) return ''
  const isArabic = /[\u0600-\u06FF]/.test(str)
  return isArabic ? normalizeArabic(str) : normalizeLatin(str)
}

/**
 * Transliterate Arabic → Latin (approximate, for cross-language matching)
 */
export function arabicToLatin(str) {
  let s = normalizeArabic(str)
  for (const [ar, lat] of AR_TO_LATIN) s = s.split(ar).join(lat)
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Expand French prefix to Arabic equivalent for better matching
 * e.g. "ain el hamam" → also match "عين الحمام"
 */
export function expandFrenchPrefix(str) {
  const lower = normalizeLatin(str)
  for (const [fr, ar] of Object.entries(FR_PREFIX_MAP)) {
    if (lower.startsWith(fr + ' ') || lower === fr) {
      return ar + ' ' + lower.slice(fr.length).trim()
    }
  }
  return null
}

/**
 * Levenshtein distance between two strings
 */
export function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    }
  }
  return dp[m][n]
}

/**
 * Jaro similarity between two strings (0-1)
 */
function jaro(s1, s2) {
  if (s1 === s2) return 1
  const len1 = s1.length, len2 = s2.length
  if (!len1 || !len2) return 0
  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0)
  const s1Matches = new Array(len1).fill(false)
  const s2Matches = new Array(len2).fill(false)
  let matches = 0, transpositions = 0
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist)
    const end   = Math.min(i + matchDist + 1, len2)
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = s2Matches[j] = true
      matches++; break
    }
  }
  if (!matches) return 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }
  return (matches/len1 + matches/len2 + (matches - transpositions/2)/matches) / 3
}

/**
 * Jaro-Winkler similarity (0-1) — better for short strings / names
 */
export function jaroWinkler(s1, s2) {
  const j = jaro(s1, s2)
  let prefix = 0
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++
    else break
  }
  return j + (prefix * 0.1 * (1 - j))
}

/**
 * Main fuzzy match score between a query and a candidate name (0-1)
 * Tries: exact, prefix, Arabic-normalized, transliterated, Jaro-Winkler
 */
export function fuzzyScore(query, candidate) {
  if (!query || !candidate) return 0

  const q  = smartNormalize(query)
  const c  = smartNormalize(candidate)
  const qL = normalizeLatin(query)
  const cL = normalizeLatin(candidate)

  // Exact match
  if (q === c || qL === cL) return 1.0

  // Contains match
  if (c.includes(q) || q.includes(c)) return 0.92
  if (cL.includes(qL) || qL.includes(cL)) return 0.88

  // Arabic-to-Latin cross match
  const qTrans = arabicToLatin(query)
  const cTrans = arabicToLatin(candidate)
  if (qTrans && (cL.includes(qTrans) || qTrans.includes(cL))) return 0.82
  if (cTrans && (qL.includes(cTrans) || cTrans.includes(qL))) return 0.82

  // Jaro-Winkler on normalized forms
  const jw1 = jaroWinkler(q, c)
  const jw2 = jaroWinkler(qTrans, cL)
  const jw  = Math.max(jw1, jw2)

  // Levenshtein tolerance for typos
  const maxLen = Math.max(q.length, c.length)
  const lev = levenshtein(q, c)
  const levSim = maxLen > 0 ? 1 - lev / maxLen : 0

  return Math.max(jw, levSim)
}

/**
 * Detect if query is mixed Arabic-French (e.g. "ain el hamam" or "مسجد sidi")
 */
export function isMixedQuery(str) {
  const hasAr = /[\u0600-\u06FF]/.test(str)
  const hasLat = /[a-zA-Z]/.test(str)
  return hasAr && hasLat
}

/**
 * Generate all normalized variants of a query string for multi-matching
 */
export function queryVariants(str) {
  const variants = new Set()
  variants.add(str)
  variants.add(smartNormalize(str))
  variants.add(normalizeLatin(str))
  variants.add(normalizeArabic(str))
  const trans = arabicToLatin(str)
  if (trans) variants.add(trans)
  const expanded = expandFrenchPrefix(str)
  if (expanded) {
    variants.add(expanded)
    variants.add(normalizeArabic(expanded))
  }
  return [...variants].filter(v => v && v.length >= 2)
}
