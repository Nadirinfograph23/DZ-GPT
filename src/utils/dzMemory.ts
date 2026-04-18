// ===== DZ AGENT USER BEHAVIOR MEMORY =====
// Lightweight localStorage-based intelligence layer
// No external dependencies — zero UI impact

const STORAGE_KEYS = {
  QUERIES:     'dza-memory-queries',
  INTENTS:     'dza-memory-intents',
  FEATURES:    'dza-memory-features',
} as const

const MAX_QUERIES   = 30  // last 30 queries stored
const MAX_INTENTS   = 50  // intent event log

// ── Intent detection ──────────────────────────────────────────────────────────
export type UserIntent = 'coding' | 'quran' | 'ocr' | 'news' | 'sports' | 'weather' | 'github' | 'currency' | 'education' | 'general'

const INTENT_PATTERNS: { intent: UserIntent; patterns: string[] }[] = [
  { intent: 'coding',    patterns: ['كود','برمجة','python','javascript','react','node','debug','خطأ','سكريبت','دالة','function','class','html','css','api','git','fix','error','refactor','improve code','code'] },
  { intent: 'quran',     patterns: ['قرآن','آية','سورة','تفسير','quran','ayah','surah','recit','تلاوة'] },
  { intent: 'ocr',       patterns: ['ocr','نص','استخراج','صورة','pdf','مستند','scan','extract text'] },
  { intent: 'news',      patterns: ['أخبار','خبر','اليوم','عاجل','news','breaking','actualité','جديد'] },
  { intent: 'sports',    patterns: ['رياضة','مباراة','كرة','دوري','نتيجة','هدف','منتخب','sport','football','match','score','goal'] },
  { intent: 'weather',   patterns: ['طقس','جو','حرارة','مطر','weather','température','météo'] },
  { intent: 'github',    patterns: ['github','مستودع','repo','commit','pull request','pr','فرع','branch','ملف','file'] },
  { intent: 'currency',  patterns: ['دولار','يورو','صرف','دينار','currency','exchange','dollar','euro','devise'] },
  { intent: 'education', patterns: ['درس','تعلم','مراجعة','امتحان','بكالوريا','bac','bem','lesson','exercise','eddirasa','math','physics'] },
]

export function detectIntent(text: string): UserIntent {
  const lower = text.toLowerCase()
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some(p => lower.includes(p))) return intent
  }
  return 'general'
}

// ── Query storage ─────────────────────────────────────────────────────────────
export interface StoredQuery {
  text: string
  intent: UserIntent
  ts: number
}

function readQueries(): StoredQuery[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.QUERIES) || '[]')
  } catch { return [] }
}

function writeQueries(q: StoredQuery[]) {
  try { localStorage.setItem(STORAGE_KEYS.QUERIES, JSON.stringify(q)) } catch {}
}

export function trackQuery(text: string) {
  if (!text || text.length < 3) return
  const intent = detectIntent(text)
  const queries = readQueries()
  queries.unshift({ text: text.slice(0, 200), intent, ts: Date.now() })
  writeQueries(queries.slice(0, MAX_QUERIES))
  trackIntentEvent(intent)
}

// ── Intent frequency tracking ─────────────────────────────────────────────────
function trackIntentEvent(intent: UserIntent) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.INTENTS) || '{}') as Record<string, number>
    raw[intent] = (raw[intent] || 0) + 1
    localStorage.setItem(STORAGE_KEYS.INTENTS, JSON.stringify(raw))
  } catch {}
}

export function getTopIntents(n = 3): UserIntent[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.INTENTS) || '{}') as Record<string, number>
    return Object.entries(raw)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([intent]) => intent as UserIntent)
  } catch { return [] }
}

// ── Feature usage tracking ─────────────────────────────────────────────────────
export function trackFeatureUsage(feature: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.FEATURES) || '{}') as Record<string, number>
    raw[feature] = (raw[feature] || 0) + 1
    localStorage.setItem(STORAGE_KEYS.FEATURES, JSON.stringify(raw))
  } catch {}
}

export function getTopFeatures(n = 5): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.FEATURES) || '{}') as Record<string, number>
    return Object.entries(raw)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([f]) => f)
  } catch { return [] }
}

// ── Recent queries ─────────────────────────────────────────────────────────────
export function getRecentQueries(n = 5): StoredQuery[] {
  return readQueries().slice(0, n)
}

// ── Build context string for AI injection ──────────────────────────────────────
// Returns a compact context hint based on last N interactions + dominant intent
export function buildBehaviorContext(n = 3): string {
  const recent = getRecentQueries(n)
  if (recent.length === 0) return ''

  const topIntents = getTopIntents(2)
  const parts: string[] = []

  if (topIntents.length > 0) {
    const intentLabels: Record<UserIntent, string> = {
      coding: 'البرمجة والكود',
      quran: 'القرآن الكريم',
      ocr: 'OCR واستخراج النصوص',
      news: 'الأخبار',
      sports: 'الرياضة',
      weather: 'الطقس',
      github: 'GitHub والمستودعات',
      currency: 'أسعار الصرف',
      education: 'التعليم',
      general: 'المواضيع العامة',
    }
    const labels = topIntents.map(i => intentLabels[i] || i).join(' و ')
    parts.push(`المستخدم يهتم بشكل رئيسي بـ: ${labels}`)
  }

  if (recent.length >= 2) {
    const prevTexts = recent.slice(1, 3).map(q => q.text).join(' | ')
    parts.push(`آخر تفاعلات المستخدم: "${prevTexts}"`)
  }

  return parts.length > 0 ? `\n[سياق المستخدم: ${parts.join('. ')}]` : ''
}

// ── Smart suggestions based on history ────────────────────────────────────────
// Returns suggestions sorted by user's historical preferences (no UI, just data)
const BASE_SUGGESTIONS: Record<UserIntent, string[]> = {
  coding:    ['اكتب دالة Python', 'شرح async/await', 'إصلاح خطأ TypeError', 'refactor هذا الكود', 'هيكل Node.js Express'],
  quran:     ['تفسير سورة الفاتحة', 'معنى آية الكرسي', 'بحث في القرآن'],
  ocr:       ['استخراج نص من صورة', 'OCR لملف PDF', 'تحليل مستند'],
  news:      ['أخبار الجزائر اليوم', 'آخر الأحداث الدولية', 'عناوين الصحف'],
  sports:    ['نتائج مباريات اليوم', 'جدول الدوري الجزائري', 'أخبار المنتخب'],
  weather:   ['طقس الجزائر العاصمة', 'توقعات الأسبوع', 'طقس وهران'],
  github:    ['عرض مستودعاتي', 'تحليل الكود', 'إنشاء Pull Request'],
  currency:  ['سعر الدولار اليوم', 'سعر اليورو', 'جدول أسعار الصرف'],
  education: ['دروس الرياضيات', 'مراجعة الفيزياء بكالوريا', 'تمارين اللغة الفرنسية'],
  general:   ['ما هو الذكاء الاصطناعي', 'اشرح مفهوم REST API', 'أفضل ممارسات البرمجة'],
}

export function getSmartSuggestions(currentInput: string, n = 3): string[] {
  const currentIntent = currentInput.length > 2 ? detectIntent(currentInput) : null
  const topIntents = getTopIntents(2)

  const intentOrder = currentIntent
    ? [currentIntent, ...topIntents.filter(i => i !== currentIntent)]
    : topIntents.length > 0 ? topIntents : ['general' as UserIntent]

  const suggestions: string[] = []
  for (const intent of intentOrder) {
    const pool = BASE_SUGGESTIONS[intent] || []
    for (const s of pool) {
      if (!suggestions.includes(s)) suggestions.push(s)
      if (suggestions.length >= n) return suggestions
    }
  }
  return suggestions.slice(0, n)
}

// ── Retry utility (used by dashboard loaders) ──────────────────────────────────
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 800
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (retries <= 0) throw err
    await new Promise(r => setTimeout(r, delayMs))
    return withRetry(fn, retries - 1, delayMs)
  }
}

// ── Clear all memory ───────────────────────────────────────────────────────────
export function clearMemory() {
  try {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k))
  } catch {}
}
