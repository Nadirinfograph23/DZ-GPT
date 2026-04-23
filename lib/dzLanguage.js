// DZ Agent — Language layer (additive, non-breaking).
// Provides:
//   - normalizeDarija(text)  : Latin/Franco-Arabic Darija → Arabic equivalent
//   - darijaDictionary       : tiny Darija→MSA lexicon (understanding only)
//   - detectStyle(text)      : 'darija' | 'msa' | 'french' | 'mixed' | 'unknown'
//   - detectLightIntent(text): { type: 'greeting'|'question'|'request'|'thanks'|'other', keywords: [...] }
//   - moderateMessage(text)  : { ok, severity, reason, replyIfBlocked }
//   - recordPendingLearning(entry, opts) : appends to data/pending_learning.json
//
// Designed to sit BEFORE existing handlers without replacing any of them.

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ───────────────────────── Franco-Arabic → Arabic mapping ─────────────────────────
// Phrase-level (handled BEFORE token-level transliteration to avoid corruption)
const PHRASE_MAP = [
  // Common DZ greetings & expressions (Latin → Arabic)
  [/\bwach\s+rak\b/gi, 'واش راك'],
  [/\bwech\s+rak\b/gi, 'واش راك'],
  [/\bwach\s+raki\b/gi, 'واش راكي'],
  [/\bach\s+rak\b/gi, 'واش راك'],
  [/\bwach\s+kayn\b/gi, 'واش كاين'],
  [/\bwa(c|ch|sh)h?\b/gi, 'واش'],
  [/\brani\s+mlih\b/gi, 'راني مليح'],
  [/\brani\s+labas\b/gi, 'راني لاباس'],
  [/\brak\s+mlih\b/gi, 'راك مليح'],
  [/\bsahit?\b/gi, 'صحيت'],
  [/\bsa?7it?\b/gi, 'صحيت'],
  [/\bbarakallahou\s+fik\b/gi, 'بارك الله فيك'],
  [/\bnchallah\b/gi, 'إن شاء الله'],
  [/\binchallah\b/gi, 'إن شاء الله'],
  [/\bmachallah\b/gi, 'ما شاء الله'],
  [/\bmashallah\b/gi, 'ما شاء الله'],
  [/\bhamdoulah\b/gi, 'الحمد لله'],
  [/\balhamdoulilah\b/gi, 'الحمد لله'],
  // Common French shortforms (kept as French — they’re understood as-is)
  [/\bcv\b/gi, 'ça va'],
  [/\bstp\b/gi, "s'il te plaît"],
  [/\bsvp\b/gi, "s'il vous plaît"],
  [/\bjsp\b/gi, 'je ne sais pas'],
  [/\bjpp\b/gi, "j'en peux plus"],
  [/\bmdr\b/gi, 'mort de rire'],
]

// Token-level Franco-Arabic → Arabic words (single tokens)
// Only triggered when a clearly-Latin token appears AND we’re in a Darija
// context (heuristic: at least one PHRASE_MAP hit OR contains arabizi digits 2/3/5/7/9).
const TOKEN_MAP = {
  rak: 'راك', raki: 'راكي', rani: 'راني', rana: 'رانا', rahom: 'راهم', rahoum: 'راهم',
  kayn: 'كاين', kayna: 'كاينة', makanch: 'ماكانش', makanche: 'ماكانش',
  mlih: 'مليح', mliha: 'مليحة', labas: 'لاباس', bikhir: 'بخير',
  bsah: 'بصح', bessah: 'بصح', kifach: 'كيفاش', kifesh: 'كيفاش',
  kima: 'كيما', win: 'وين', winek: 'وينك', fin: 'فين',
  bezzef: 'بزاف', barcha: 'برشا', chwiya: 'شوية', chuya: 'شوية',
  walou: 'والو', balak: 'بلاك', yallah: 'يلا', yala: 'يلا',
  khoya: 'خويا', khouya: 'خويا', khoti: 'ختي', khti: 'ختي',
  ana: 'أنا', enta: 'أنت', enti: 'أنتي', houwa: 'هو', hiya: 'هي',
  hna: 'هنا', temma: 'تما', daba: 'دابا', toa: 'توا', drouk: 'دروك',
  semah: 'سامح', smah: 'سامح', sami: 'سامحني',
  habib: 'حبيب', habibi: 'حبيبي', sahbi: 'صاحبي', sahebi: 'صاحبي',
}

// Arabizi digits commonly used as letter substitutes — heuristic for Darija context
const ARABIZI_DIGIT_RE = /[2357879][a-z]|\b\w*[2357][a-z]+\b/i

// Returns true if string contains any Arabic letter
function hasArabic(s) { return /[\u0600-\u06FF]/.test(String(s || '')) }
// Returns true if string contains any Latin letter
function hasLatin(s)  { return /[A-Za-z]/.test(String(s || '')) }

// ───────────────────────── Style detection ─────────────────────────
const FRENCH_HINTS = [
  'bonjour','salut','merci','svp','stp','oui','non','pourquoi','comment','quoi','où',
  'aide','aidez','peux','pouvez','je','tu','vous','nous','c\'est','il y a',
]
const DARIJA_HINTS = [
  'واش','راك','راكي','راني','كاين','بزاف','مليح','بصح','كيفاش','وينك','يلا','خويا','بصاح',
  'wach','wech','rak','raki','rani','kayn','kayna','mlih','bsah','bessah','kifach','khoya','sahbi','bezzef',
]

export function detectStyle(text) {
  if (!text || typeof text !== 'string') return 'unknown'
  const t = text.toLowerCase()
  const ar = hasArabic(t)
  const la = hasLatin(t)
  const darijaScore = DARIJA_HINTS.filter(w => t.includes(w)).length
  const frenchScore = FRENCH_HINTS.filter(w => new RegExp(`\\b${w}\\b`, 'i').test(t)).length
  const arabiziScore = ARABIZI_DIGIT_RE.test(t) ? 1 : 0
  if (darijaScore + arabiziScore >= 1) {
    if (ar && la) return 'mixed'
    return 'darija'
  }
  if (frenchScore >= 1 && !ar) return 'french'
  if (ar && la) return 'mixed'
  if (ar) return 'msa'
  if (la) return 'french'
  return 'unknown'
}

// ───────────────────────── Normalization ─────────────────────────
// Returns { normalized, changed, hits } — DOES NOT mutate the original semantics.
// Should be used as an UNDERSTANDING aid; the original text is still passed to
// downstream handlers.
export function normalizeDarija(text) {
  if (!text || typeof text !== 'string') return { normalized: text || '', changed: false, hits: 0 }
  let out = text
  let hits = 0
  for (const [re, rep] of PHRASE_MAP) {
    const before = out
    out = out.replace(re, rep)
    if (out !== before) hits++
  }
  // Token-level only if we already see Darija context to avoid false positives on real names.
  const darijaContext = hits > 0 || ARABIZI_DIGIT_RE.test(text) || DARIJA_HINTS.some(w => text.toLowerCase().includes(w))
  if (darijaContext) {
    out = out.replace(/\b([A-Za-z]{2,12})\b/g, (m) => {
      const k = m.toLowerCase()
      if (TOKEN_MAP[k]) { hits++; return TOKEN_MAP[k] }
      return m
    })
  }
  out = out.replace(/\s+/g, ' ').trim()
  return { normalized: out, changed: out !== text, hits }
}

// Tiny Darija → MSA dictionary (understanding only — never shown to user).
export const darijaDictionary = Object.freeze({
  'واش': 'ماذا', 'واش راك': 'كيف حالك', 'راك': 'أنت', 'راكي': 'أنتِ',
  'راني': 'أنا', 'كاين': 'يوجد', 'ماكانش': 'لا يوجد',
  'مليح': 'جيد', 'بصح': 'لكن', 'كيفاش': 'كيف', 'وينك': 'أين أنت',
  'بزاف': 'كثيراً', 'يلا': 'هيا', 'خويا': 'أخي', 'صحيت': 'شكراً',
  'دروك': 'الآن', 'توا': 'الآن', 'بخير': 'بخير', 'لاباس': 'بخير',
})

// ───────────────────────── Light intent detection ─────────────────────────
// This is an ADDITIVE hint; existing detectors (developer, capabilities, doctor,
// emergency, education, etc.) keep running unchanged.
const GREETING_RE = /\b(salam|salem|salam aleykoum|aslama|سلام|السلام عليكم|مرحبا|أهلا|صباح الخير|مساء الخير|bonjour|bonsoir|salut|hi|hello|hey)\b/i
const THANKS_RE   = /\b(merci|شكرا|شكراً|بارك الله فيك|صحيت|sahit|sa7it|thanks|thank you)\b/i
const QUESTION_RE = /[؟?]|^\s*(واش|كيفاش|كيف|متى|أين|من|لماذا|ماذا|قداش|wach|wech|kifach|combien|comment|pourquoi|quand|où|qui|quoi|how|what|when|where|why|who)\b/i
const REQUEST_RE  = /\b(عاونّي|ساعدني|نحتاج|بغيت|أبغي|أريد|aide|aidez|je veux|je voudrais|peux-tu|peut-on|stp|svp|please|can you|help)\b/i

export function detectLightIntent(text) {
  const t = String(text || '').trim()
  if (!t) return { type: 'other', keywords: [] }
  if (GREETING_RE.test(t)) return { type: 'greeting', keywords: ['greeting'] }
  if (THANKS_RE.test(t))   return { type: 'thanks',   keywords: ['thanks'] }
  if (REQUEST_RE.test(t))  return { type: 'request',  keywords: ['request'] }
  if (QUESTION_RE.test(t)) return { type: 'question', keywords: ['question'] }
  return { type: 'other', keywords: [] }
}

// ───────────────────────── Moderation: DZ Darija profanity ─────────────────────────
// Conservative list focused on clearly-insulting tokens only. We deliberately
// avoid borderline / context-dependent words to keep false positives low.
// Stored as normalized roots; a lightweight obfuscation-resistant matcher
// collapses repeated chars and digit/letter substitutions before testing.
const PROFANITY_ROOTS = [
  // Arabic (DZ)
  'كلب','كلبه','حمار','حمارة','بهيمة','حقير','حقيره','وسخ','وسخه',
  'زبي','طيز','طيزك','نيك','نيكك','نيكمك','نيك ربك','يلعن','العن','يلعنك',
  'قحبه','قحبة','شرموطه','شرموطة','زامل','زاملة','عرص','عرصة',
  'ابن الكلب','ابن القحبه','ابن القحبة','ابن الزانيه','ابن الحرام',
  'يا حيوان','يا كلب','يا حمار','يا حقير','يا وسخ',
  // Arabizi / Latin Darija
  'kahba','9ahba','9a7ba','kahbat','9ahbat','9a7bat',
  'zebi','zebbi','tiz','tizek','niq','nik','nikomek','ni9','ni9ek',
  'cherrmouta','chermota','cha3moot','3ars','3arss',
  'wled lkahba','weld lkahba','wld 9a7ba',
  'klb','7mar','hmar','b3ima','wsekh','wsakh',
  // French insults often used in DZ
  'putain','pute','salope','enculé','encule','connard','connasse','enculer',
  'fdp','tg','ta gueule','va te faire','batard','bâtard',
]

const SEVERE_ROOTS = [
  'نيك ربك','يلعن دين','يلعن ربك','نيك امك','nik om','nik omek','nik mok','nikomek',
  'ابن القحبه','ابن القحبة','ابن الزانيه','wled lkahba','wld 9a7ba',
  'enculé','enculer','va te faire',
]

function deobfuscate(s) {
  let x = String(s || '').toLowerCase()
  // Collapse 3+ repeated chars: niiiik → nik, كككلب → كلب
  x = x.replace(/(.)\1{2,}/g, '$1')
  // Common Arabizi digit substitutions
  x = x.replace(/3/g, 'a').replace(/7/g, 'h').replace(/9/g, 'q').replace(/2/g, 'a').replace(/5/g, 'kh').replace(/8/g, 'gh')
  // Remove zero-width/spacing-only chars and most punctuation that hides letters
  x = x.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
  x = x.replace(/[._\-*+~`'"!?,;:|/\\(){}\[\]<>]/g, ' ')
  // Strip Arabic diacritics & tatweel
  x = x.replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  // Normalize alif/ya/ta-marbuta
  x = x.replace(/[إأآا]/g, 'ا').replace(/[يى]/g, 'ي').replace(/ة/g, 'ه')
  x = x.replace(/\s+/g, ' ').trim()
  return x
}

export function moderateMessage(text) {
  if (!text || typeof text !== 'string') {
    return { ok: true, severity: 'clean', reason: '', replyIfBlocked: '' }
  }
  const probe = deobfuscate(text)
  // Severe match → always blocked
  for (const r of SEVERE_ROOTS) {
    const rr = deobfuscate(r)
    if (probe.includes(rr)) {
      return {
        ok: false,
        severity: 'severe',
        reason: 'severe_profanity',
        replyIfBlocked: 'نقدر نعاونك، بصح حاول تستعمل كلام محترم 👍',
      }
    }
  }
  for (const r of PROFANITY_ROOTS) {
    const rr = deobfuscate(r)
    // Use word-ish boundary: surrounded by space or string edge in the deobfuscated probe
    const re = new RegExp(`(^|\\s)${rr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`)
    if (re.test(' ' + probe + ' ')) {
      return {
        ok: false,
        severity: 'offensive',
        reason: 'profanity',
        replyIfBlocked: 'نقدر نعاونك، بصح حاول تستعمل كلام محترم 👍',
      }
    }
  }
  return { ok: true, severity: 'clean', reason: '', replyIfBlocked: '' }
}

// ───────────────────────── Pending learning storage (constrained) ─────────────────────────
const LEARNING_PATH = path.resolve(__dirname, '..', 'data', 'pending_learning.json')
const MAX_LEARNING_ENTRIES = 500
const URL_RE = /(https?:\/\/|www\.)\S+/i
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PHONE_RE_LEARN = /(?:\+?213|00213|0)\s*[2-7](?:[\s.\-/]?\d){7,8}/

let learningQueue = null      // in-memory cache
let learningWriting = false   // serialize writes
let learningDirty = false

async function loadLearning() {
  if (Array.isArray(learningQueue)) return learningQueue
  try {
    const raw = await fs.readFile(LEARNING_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    learningQueue = Array.isArray(parsed) ? parsed : []
  } catch {
    learningQueue = []
  }
  return learningQueue
}

async function flushLearning() {
  if (learningWriting || !learningDirty) return
  learningWriting = true
  try {
    await fs.mkdir(path.dirname(LEARNING_PATH), { recursive: true })
    await fs.writeFile(LEARNING_PATH, JSON.stringify(learningQueue.slice(-MAX_LEARNING_ENTRIES), null, 0), 'utf8')
    learningDirty = false
  } catch (err) {
    // Silent — learning is best-effort and must never break the chat path
    console.warn('[dzLanguage] failed to persist pending_learning:', err?.message || err)
  } finally {
    learningWriting = false
  }
}

// Records ONLY safe, non-sensitive entries. Never stores:
//   - profane messages
//   - URLs / emails / phone numbers
//   - empty / very long / non-textual payloads
export async function recordPendingLearning({ input, normalized }, opts = {}) {
  try {
    if (!input || typeof input !== 'string') return false
    if (input.length < 2 || input.length > 280) return false
    if (URL_RE.test(input) || EMAIL_RE.test(input) || PHONE_RE_LEARN.test(input)) return false
    const mod = opts.moderation || moderateMessage(input)
    if (!mod.ok) return false
    await loadLearning()
    learningQueue.push({
      input: input.trim(),
      normalized: (normalized || '').trim() || input.trim(),
      style: opts.style || detectStyle(input),
      intent: opts.intent || detectLightIntent(input).type,
      timestamp: Date.now(),
    })
    if (learningQueue.length > MAX_LEARNING_ENTRIES * 2) {
      learningQueue = learningQueue.slice(-MAX_LEARNING_ENTRIES)
    }
    learningDirty = true
    // Fire-and-forget; don’t await to avoid blocking the request path
    flushLearning()
    return true
  } catch {
    return false
  }
}

export async function getPendingLearningStats() {
  await loadLearning()
  return { count: learningQueue.length, capacity: MAX_LEARNING_ENTRIES }
}
