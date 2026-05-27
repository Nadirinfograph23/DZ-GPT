/**
 * DZ Dialect Intelligence Engine
 * Algerian Darija Understanding System — 4 Core Modules
 *
 * Module 1: Normalizer
 * Module 2: Semantic Understander (NLU)
 * Module 3: Intent Detector
 * Module 4: Darija Response Generator
 * + Context Learner
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR   = join(__dirname, '..', 'data')
const DICT_PATH  = join(DATA_DIR, 'dz_dialect.json')
const LEARN_PATH = join(DATA_DIR, 'dz_learned.json')

// ─── Load dictionaries ───────────────────────────────────────────────────────
let _dict = null
let _dictLoadedAt = 0
let _learned = null
let _learnedLoadedAt = 0
const _DICT_TTL_MS    = 10 * 60 * 1000   // إعادة تحميل القاموس كل 10 دقائق تلقائياً
const _LEARNED_TTL_MS =  5 * 60 * 1000   // إعادة تحميل الكلمات المتعلَّمة كل 5 دقائق

function loadDict() {
  const now = Date.now()
  if (_dict && (now - _dictLoadedAt) < _DICT_TTL_MS) return _dict
  try {
    _dict = JSON.parse(readFileSync(DICT_PATH, 'utf8'))
    _dictLoadedAt = now
  } catch {
    if (!_dict) _dict = { words: [], slang_map: {}, response_map: {}, intent_patterns: {} }
  }
  return _dict
}

function loadLearned() {
  const now = Date.now()
  if (_learned && (now - _learnedLoadedAt) < _LEARNED_TTL_MS) return _learned
  try {
    _learned = JSON.parse(readFileSync(LEARN_PATH, 'utf8'))
    _learnedLoadedAt = now
  } catch {
    if (!_learned) _learned = { learned: [] }
  }
  return _learned
}

/** إجبار إعادة تحميل القاموس فوراً (مثلاً بعد تحديث الملف) */
export function reloadDict() {
  _dictLoadedAt = 0
  _learnedLoadedAt = 0
  _dict = null
  _learned = null
}

function saveLearned(data) {
  _learned = data
  writeFileSync(LEARN_PATH, JSON.stringify(data, null, 2), 'utf8')
}

// ─── MODULE 1: NORMALIZER ────────────────────────────────────────────────────
/**
 * normalize(text)
 * - Remove diacritics (تشكيل)
 * - Normalize Arabic letter variants (أ إ آ → ا)
 * - Replace Darija slang with standard Arabic
 * - Detect mixed language
 */
export function normalize(text) {
  if (!text || typeof text !== 'string') return { normalized: '', original: text, replacements: [], languages: [] }

  const dict = loadDict()
  const slangMap = { ...dict.slang_map }

  // Add learned words to the map
  const learned = loadLearned()
  for (const entry of learned.learned || []) {
    if (entry.word && entry.guessed_meaning) {
      slangMap[entry.word] = entry.guessed_meaning
    }
  }

  let normalized = text

  // 1. Remove Arabic diacritics (harakat/tashkeel)
  normalized = normalized.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '')

  // 2. Normalize Arabic letter variants
  normalized = normalized
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ة')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')

  // 3. Fuzzy normalize: collapse repeated letters (بزاااف → بزاف)
  normalized = normalized.replace(/(.)\1{2,}/g, '$1$1')

  // 4. Replace Darija slang words with standard Arabic (longest match first)
  // FIX: استخدام حدود مسافة/ترقيم بدل حدود حروف عربية — تعمل مع الدارجة الجزائرية
  const replacements = []
  const sortedKeys = Object.keys(slangMap).sort((a, b) => b.length - a.length)
  const _SEP = '[\\s،,;؛!?؟.\\n\\r\\t]'

  // إضافة newlines كـ padding لضمان تطابق الكلمات في بداية/نهاية الجملة
  let padded = '\n' + normalized + '\n'

  for (const darija of sortedKeys) {
    const standard = slangMap[darija]
    try {
      const re = new RegExp(`(?<=${_SEP})${escapeRegex(darija)}(?=${_SEP})`, 'g')
      const updated = padded.replace(re, standard)
      if (updated !== padded) {
        replacements.push({ darija, standard })
        padded = updated
      }
    } catch {
      // fallback: إذا فشل الـ regex، تخطى الكلمة
    }
  }
  normalized = padded.slice(1, -1)  // إزالة الـ padding

  // 5. Detect languages present
  const languages = detectLanguages(text)

  return {
    normalized,
    original: text,
    replacements,
    languages,
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function detectLanguages(text) {
  const langs = []
  if (/[\u0600-\u06FF]/.test(text)) langs.push('arabic')
  if (/[a-zA-Zàâçéèêëîïôùûüœæ]{2,}/.test(text)) {
    const frPatterns = /\b(je|tu|il|elle|nous|vous|ils|elles|est|sont|avec|pour|dans|sur|le|la|les|un|une|des|du|de|et|ou|mais|donc|or|ni|car|oui|non|merci|bonjour|comment|quoi|pourquoi|voici|voilà|bien|très|aussi|même|plus|moins|tout|toute|rien|jamais|toujours)\b/i.test(text)
    langs.push(frPatterns ? 'french' : 'latin')
  }
  if (/\d/.test(text)) langs.push('numbers')
  return langs
}

// ─── MODULE 2: SEMANTIC UNDERSTANDER (NLU) ──────────────────────────────────
/**
 * understand_dz(text)
 * Full NLU pipeline:
 * 1. Tokenize
 * 2. Match with dictionary
 * 3. Replace with standard meanings
 * 4. Reconstruct normalized sentence
 */
export function understand_dz(text) {
  if (!text || typeof text !== 'string') return { standard: text, tokens: [], matches: [], intent: 'unknown', confidence: 0 }

  const dict = loadDict()

  // Run normalizer first
  const normResult = normalize(text)

  // Tokenize (split on spaces and punctuation, keep Arabic words)
  const tokens = tokenize(text)

  // Match each token against dictionary
  const matches = []
  const enrichedTokens = tokens.map(token => {
    const cleanToken = token.replace(/[\u0610-\u061A\u064B-\u065F\u0670]/g, '').replace(/[أإآٱ]/g, 'ا')
    const entry = findInDict(cleanToken, dict)
    if (entry) {
      matches.push({ token, entry })
      return { token, darija: entry.word, standard: entry.meaning_ar, category: entry.category }
    }
    return { token, darija: token, standard: token, category: null }
  })

  // Reconstruct standard Arabic sentence
  const standard = normResult.normalized

  // Detect intent
  const intentResult = detectIntent(text, normResult.normalized, dict)

  // Detect if this contains unknown darija words
  const unknownWords = detectUnknownDarija(tokens, dict)

  return {
    original: text,
    standard,
    tokens: enrichedTokens,
    matches,
    intent: intentResult.intent,
    intent_confidence: intentResult.confidence,
    languages: normResult.languages,
    replacements: normResult.replacements,
    unknownWords,
  }
}

function tokenize(text) {
  return text
    .split(/[\s،,;؛.!?؟\n\r\t]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0)
}

function findInDict(word, dict) {
  const lw = word.toLowerCase()
  // Exact match
  const exact = dict.words.find(e =>
    e.word === word ||
    e.word === lw ||
    (e.variants || []).includes(word) ||
    (e.variants || []).includes(lw)
  )
  if (exact) return exact

  // Fuzzy: match if within 1 character edit distance for words >= 4 chars
  if (word.length >= 4) {
    const fuzzy = dict.words.find(e => levenshtein(e.word, word) <= 1)
    if (fuzzy) return fuzzy
  }

  // Check slang map
  if (dict.slang_map[word]) {
    return { word, meaning_ar: dict.slang_map[word], category: 'slang' }
  }

  return null
}

function detectUnknownDarija(tokens, dict) {
  const unknown = []
  for (const token of tokens) {
    if (token.length < 2) continue
    if (!isArabic(token)) continue
    const found = findInDict(token, dict)
    if (!found && !dict.slang_map[token]) {
      // Check if it looks like Darija (doesn't match fusha patterns)
      unknown.push(token)
    }
  }
  return unknown.slice(0, 5) // Return up to 5 unknown words
}

function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text)
}

// ─── MODULE 3: INTENT ENGINE ─────────────────────────────────────────────────
/**
 * detectIntent(original, normalized, dict)
 * Classifies: question | request | command | greeting | gratitude | farewell
 * + specific intents like build_web, code_help, etc.
 */
export function detectIntent(original, normalized, dict = null) {
  if (!dict) dict = loadDict()
  const text = (original + ' ' + (normalized || '')).toLowerCase()
  const patterns = dict.intent_patterns || {}

  // Specific intents first (highest priority)
  const specificIntents = [
    { intent: 'build_web_app', patterns: patterns.build_web || [], keywords: ['موقع', 'ويب', 'html', 'صفحة', 'website', 'web'], weight: 3 },
    { intent: 'code_help',     patterns: patterns.code_help || [], keywords: ['كود', 'برمجة', 'كيفاش ندير', 'code', 'python', 'javascript', 'برنامج'], weight: 3 },
    { intent: 'greeting',      patterns: patterns.greeting || [],  keywords: ['سلام', 'مرحبا', 'صباح', 'مساء', 'هلا', 'hello', 'hi', 'bonjour'], weight: 2 },
    { intent: 'farewell',      patterns: patterns.farewell || [],  keywords: ['بالسلامة', 'نشوفك', 'وداع', 'goodbye', 'au revoir'], weight: 2 },
    { intent: 'gratitude',     patterns: patterns.gratitude || [], keywords: ['شكر', 'مرسي', 'merci', 'thank', 'يعطيك'], weight: 2 },
  ]

  for (const si of specificIntents) {
    const allKeywords = [...si.patterns, ...si.keywords]
    const hits = allKeywords.filter(k => text.includes(k.toLowerCase())).length
    if (hits >= 1) {
      return { intent: si.intent, confidence: Math.min(0.99, hits * 0.3 + 0.5) }
    }
  }

  // Generic intents
  const qWords = patterns.question || []
  if (qWords.some(q => text.includes(q)) || text.includes('?') || text.includes('؟')) {
    return { intent: 'question', confidence: 0.8 }
  }

  const cmdWords = patterns.command || []
  if (cmdWords.some(c => text.includes(c))) {
    return { intent: 'command', confidence: 0.75 }
  }

  const reqWords = patterns.request || []
  if (reqWords.some(r => text.includes(r))) {
    return { intent: 'request', confidence: 0.7 }
  }

  return { intent: 'statement', confidence: 0.5 }
}

// ─── MODULE 4: DARIJA RESPONSE GENERATOR ────────────────────────────────────
/**
 * toDarija(arabicText)
 * Converts standard Arabic response text to Algerian Darija style
 */
export function toDarija(arabicText) {
  if (!arabicText || typeof arabicText !== 'string') return arabicText
  const dict = loadDict()
  const responseMap = dict.response_map || {}

  let darija = arabicText

  // Sort by length descending to replace longer phrases first
  const phrases = Object.keys(responseMap).sort((a, b) => b.length - a.length)

  // FIX: same boundary approach as normalize() — padding + separator lookbehind/ahead
  const _SEP_R = '[\\s،,;؛!?؟.\\n\\r\\t]'
  let paddedD = '\n' + darija + '\n'
  for (const arabic of phrases) {
    const dzWord = responseMap[arabic]
    try {
      const re = new RegExp(`(?<=${_SEP_R})${escapeRegex(arabic)}(?=${_SEP_R})`, 'g')
      paddedD = paddedD.replace(re, dzWord)
    } catch { /* skip invalid patterns */ }
  }
  darija = paddedD.slice(1, -1)

  // Add Darija-style sentence starters and enders
  darija = addDarijaFlair(darija)

  return darija
}

function addDarijaFlair(text) {
  if (!text || text.length < 5) return text
  let result = text
  // استبدال كلمات فصحى شائعة بالدارجة في ردود الـ AI
  const wordSwaps = [
    [/\bكثيراً\b/g,   'بزاف'],
    [/\bكثيرًا\b/g,   'بزاف'],
    [/\bجيد جداً\b/g, 'مليح بزاف'],
    [/\bجيداً\b/g,    'مليح'],
    [/\bصحيح\b/g,     'صاح'],
    [/\bيمكنك\b/g,    'تنجم'],
    [/\bيمكنني\b/g,   'نجم'],
    [/\bأستطيع\b/g,   'نجم'],
    [/\bلا يمكن\b/g,  'ما ينجمش'],
    [/\bانتهى\b/g,    'خلاص'],
    [/\bحسناً\b/g,    'طيب'],
    [/\bانتظر\b/g,    'استنى'],
    [/\bاذهب\b/g,     'روح'],
    [/\bتعال\b/g,     'أجي'],
  ]
  for (const [re, dz] of wordSwaps) result = result.replace(re, dz)
  return result
}

/**
 * buildDarijaResponse(content)
 * Full response generation: wraps standard content with Darija style
 */
export function buildDarijaResponse(content) {
  if (!content) return content

  // Apply toDarija conversion
  const darijaContent = toDarija(content)

  return darijaContent
}

// ─── CONTEXT LEARNER ────────────────────────────────────────────────────────
/**
 * learnWord(word, context, guessedMeaning)
 * Stores new discovered Darija words dynamically
 */
export function learnWord(word, context, guessedMeaning = '') {
  if (!word || word.length < 2) return false
  const data = loadLearned()

  // Check if already learned
  const existing = data.learned.find(e => e.word === word)
  if (existing) {
    existing.seen_count = (existing.seen_count || 1) + 1
    existing.last_seen  = new Date().toISOString()
    if (guessedMeaning) existing.guessed_meaning = guessedMeaning
    saveLearned(data)
    return false // already known
  }

  data.learned.push({
    word,
    context: context?.slice(0, 200) || '',
    guessed_meaning: guessedMeaning,
    seen_count: 1,
    learned_at: new Date().toISOString(),
    last_seen:  new Date().toISOString(),
  })

  saveLearned(data)
  return true // newly learned
}

/**
 * autoLearnFromText(text)
 * Scans text for unknown Darija words and stores them
 */
export function autoLearnFromText(text) {
  if (!text) return []
  const dict = loadDict()
  const tokens = tokenize(text)
  const newWords = []

  for (const token of tokens) {
    if (!isArabic(token) || token.length < 3) continue
    const known = findInDict(token, dict)
    if (!known) {
      const learned = learnWord(token, text)
      if (learned) newWords.push(token)
    }
  }

  return newWords
}

// ─── LEVENSHTEIN (fuzzy matching) ────────────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])
    }
  }
  return dp[m][n]
}

// ─── DIALECT CONTEXT BUILDER ─────────────────────────────────────────────────
/**
 * buildDialectContext(userMessage)
 * Generates a context string to inject into LLM prompts
 * so the AI understands Darija input and can respond in Darija style
 */
export function buildDialectContext(userMessage) {
  const understanding = understand_dz(userMessage)

  if (!understanding.replacements.length && !understanding.matches.length) {
    return null // No Darija detected
  }

  const lines = [
    '[نظام اللهجة الجزائرية — DZ Dialect Layer]',
    `النص الأصلي: "${understanding.original}"`,
    `المعنى المعياري: "${understanding.standard}"`,
  ]

  if (understanding.replacements.length > 0) {
    lines.push('مفردات مترجمة من الدارجة:')
    for (const r of understanding.replacements) {
      lines.push(`  • "${r.darija}" = "${r.standard}"`)
    }
  }

  if (understanding.intent !== 'unknown' && understanding.intent !== 'statement') {
    lines.push(`النية: ${understanding.intent} (ثقة: ${Math.round(understanding.intent_confidence * 100)}%)`)
  }

  if (understanding.languages.length > 1) {
    lines.push(`لغات مكتشفة: ${understanding.languages.join(', ')} (نص مختلط)`)
  }

  lines.push('تعليمات: افهم الرسالة بالسياق الجزائري، وأجب بالدارجة الجزائرية إذا كان المستخدم يستخدمها.')

  return lines.join('\n')
}

/**
 * isDarijaText(text)
 * Returns true if the text contains significant Darija content
 */
export function isDarijaText(text) {
  if (!text) return false
  const dict = loadDict()
  const tokens = tokenize(text)
  let darijaCount = 0
  for (const token of tokens) {
    if (dict.slang_map[token] || findInDict(token, dict)) darijaCount++
  }
  return darijaCount >= 1 || /واشراك|كيفاش|بزاف|مليح|خايب|نتا|راني|راه|درك|دروك|ضرك|يلا|ماشي|برك|بصح|علاه|علاش|واش|وين|فين|شكون|لاباس|تاني|ياسر|قاع|فالو|خلاص|والله|مزيان|مخربق|زعفان|مهبول|يخمم|يعيى|يسقسي|ديجا|واه|هيه|ياك|باه|ممبعد|معليش|ربي يسهل|واش كاين|واش صاري|فوقاش|كلش مليح|هادي سهلة|راك غالط/.test(text)
}

// ─── FULL PIPELINE ────────────────────────────────────────────────────────────
/**
 * fullPipeline(userMessage)
 * Runs all modules: normalize → understand → intent → context
 */
export function fullPipeline(userMessage) {
  const isDialect = isDarijaText(userMessage)
  const understanding = understand_dz(userMessage)
  const dialectContext = buildDialectContext(userMessage)

  // Auto-learn unknown words
  const newWords = autoLearnFromText(userMessage)

  return {
    isDialect,
    understanding,
    dialectContext,
    newWordsLearned: newWords,
    standardText: understanding.standard,
    intent: understanding.intent,
  }
}
