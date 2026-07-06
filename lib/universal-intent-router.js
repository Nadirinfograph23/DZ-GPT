/**
 * lib/universal-intent-router.js — DZ Agent Universal Intent Router
 * ══════════════════════════════════════════════════════════════════
 * يصنّف كل سؤال ويوجّهه للوكيل الصحيح قبل وصوله لـ LLM.
 *
 * المبدأ (Addy Osmani Agent Skills):
 *   User Question
 *     ↓
 *   Intent Detection (patterns + confidence scoring)
 *     ↓
 *   Route to Specialized Agent
 *     ↓
 *   Validate Output
 *     ↓
 *   Format Final Response
 *
 * اللغات المدعومة: عربي · دارجة جزائرية · فرنسية · إنجليزية
 * Backward compatible — لا يكسر أي routing موجود.
 */

import { intentCache, makeKey } from './cache.js'
import { intentLog } from './logger.js'

// ══════════════════════════════════════════════════════════════════════════════
// Agent definitions — يتطابق مع config/agents.json
// ══════════════════════════════════════════════════════════════════════════════
const AGENTS = {

  // ── Maps ────────────────────────────────────────────────────────────────
  MAPS: {
    id: 'maps_agent',
    priority: 10,
    patterns: [
      /خريط[ةه]|maps?|carte|أين\s+(?:تقع|يقع|هي|هو)|ولاية|بلدية|دائرة/i,
      /مسافة\s+بين|itinéraire|اتجاه|طريق|مسار|géo/i,
      /إحداثيات|coordinates|latitude|longitude|GPS/i,
      /بحث\s+(?:عن|في)\s+(?:مكان|محل|عنوان)/i,
      /كيف\s+(?:أصل|تصل|نصل)\s+(?:إلى|ل)/i,
    ],
  },

  // ── Doctor / Health Search ────────────────────────────────────────────
  DOCTOR: {
    id: 'health_agent',
    priority: 10,
    patterns: [
      /طبيب|دكتور|docteur|médecin|clinic|عيادة|مستشفى|hôpital|hospital/i,
      /(?:ابحث|اعثر)\s+(?:عن|على)\s+(?:طبيب|دكتور|أخصائي|متخصص)/i,
      /(?:جراح|أخصائي|متخصص)\s+(?:في|ب|عيون|قلب|أطفال|نساء|عظام|أسنان)/i,
      /(?:قسم|دار)\s+(?:الصحة|العلاج|الطوارئ)/i,
      /pharmacie|صيدلية|دواء|médicament/i,
    ],
  },

  // ── Image Search ─────────────────────────────────────────────────────
  IMAGE_SEARCH: {
    id: 'image_search_agent',
    priority: 9,
    patterns: [
      /(?:ابحث|اعثر|أريد|أجلب)\s+(?:عن|على)?\s*صور[ةه]?/i,
      /image\s+search|بحث\s+صور|cherche\s+(?:une\s+)?image/i,
      /صور[ةه]?\s+(?:عن|ل|من)/i,
      /show\s+(?:me\s+)?(?:a\s+)?(?:photo|image|picture)/i,
    ],
  },

  // ── Image Generation ─────────────────────────────────────────────────
  IMAGE_GEN: {
    id: 'image_gen_agent',
    priority: 9,
    patterns: [
      /(?:ولّد|اصنع|أنشئ|ارسم|generate|create|draw)\s+(?:صورة|image|photo|painting|artwork)/i,
      /(?:صورة|image)\s+(?:مولّدة|بالذكاء|AI|اصطناعية|من وصف)/i,
      /text[\s-]to[\s-]image|image\s+generation|stable\s+diffusion|dall[\s-]?e/i,
      /ارسم\s+لي|generate\s+for\s+me/i,
    ],
  },

  // ── Weather ──────────────────────────────────────────────────────────
  WEATHER: {
    id: 'weather_agent',
    priority: 10,
    patterns: [
      /طقس|météo|weather|جو|حرارة|température|temperature/i,
      /(?:هل\s+)?(?:سيمطر|ستمطر|مطر|أمطار|rain|pluie)/i,
      /(?:درجة|درجات)\s+(?:الحرارة|حرارة)/i,
      /(?:طقس|جو)\s+(?:غدًا|اليوم|الأسبوع|ولاية|مدينة)/i,
      /(?:رياح|wind|vent|ضباب|fog|brouillard)/i,
    ],
  },

  // ── Sports / LFP ─────────────────────────────────────────────────────
  SPORTS: {
    id: 'sports_agent',
    priority: 9,
    patterns: [
      /دوري|ليغ|league|championnat|LFP/i,
      /مباراة|ماتش|match|لقاء/i,
      /نتيجة|résultat|score|هدف|but/i,
      /(?:لاعب|joueur|player)\s+(?:جزائري|algérien)/i,
      /ترتيب\s+(?:الدوري|الفرق)|classement/i,
      /هداف|buteur|scoreur/i,
      /(?:ريال|برشلونة|مانشستر|ليفربول|باريس|بايرن)/i,
      /(?:محرز|بونجاح|عطال|فيغولي|مازة)/i,
      /كووورة|sofascore|fotmob/i,
    ],
  },

  // ── World Cup ────────────────────────────────────────────────────────
  WORLD_CUP: {
    id: 'world_cup_agent',
    priority: 11, // highest — overrides SPORTS
    patterns: [
      /كأس\s*العالم|كأس‌العالم/i,
      /world\s*cup|coupe\s+du\s+monde/i,
      /مونديال|mondial/i,
      /fifa\s*2026|fwc2026|wc2026|wc\s*2026/i,
      /المونديال/i,
    ],
  },

  // ── Quran ─────────────────────────────────────────────────────────────
  QURAN: {
    id: 'quran_agent',
    priority: 10,
    patterns: [
      /قرآن|quran|quoran|coran/i,
      /(?:سورة|آية|أية|سور)\s/i,
      /تلاوة|تفسير\s+(?:ابن\s+كثير|الطبري|القرطبي)/i,
      /(?:اقرأ|اتلُ|ابحث\s+في)\s+(?:القرآن|سورة)/i,
      /(?:ما\s+)?معنى\s+(?:آية|الآية)/i,
    ],
  },

  // ── GitHub ────────────────────────────────────────────────────────────
  GITHUB: {
    id: 'github_agent',
    priority: 9,
    patterns: [
      /github|مستودع|repository|repo\b/i,
      /(?:commit|push|pull|merge|branch|fork)\b/i,
      /(?:ارفع|احفظ|ادفع)\s+(?:الكود|التعديلات|الملف)\s+(?:على|إلى)\s+github/i,
      /create\s+(?:a\s+)?(?:pull\s+request|PR|issue|repository)/i,
      /deploy\s+(?:to|on)\s+(?:vercel|netlify|github\s+pages)/i,
    ],
  },

  // ── News ─────────────────────────────────────────────────────────────
  NEWS: {
    id: 'news_agent',
    priority: 8,
    patterns: [
      /أخبار|خبر|news|actualité|nouvelles/i,
      /(?:آخر|أحدث|جديد)\s+(?:أخبار|مستجدات|تطورات)/i,
      /(?:أخبار|أحداث)\s+(?:الجزائر|اليوم|العالم|الرياضة)/i,
      /breaking\s+news|عاجل|عـاجل/i,
      /(?:الشروق|النهار|الخبر|البلاد|TSA|Ennahar|APS)\b/i,
    ],
  },

  // ── Web Builder ───────────────────────────────────────────────────────
  WEB_BUILDER: {
    id: 'webbuilder_agent',
    priority: 8,
    patterns: [
      /(?:ابنِ|اصنع|أنشئ|بناء)\s+(?:موقع|تطبيق\s+ويب|landing\s+page|صفحة)/i,
      /(?:create|build|make)\s+(?:a\s+)?(?:website|web\s+app|landing\s+page|portfolio)/i,
      /html\s+(?:موقع|site|page)|react\s+(?:app|component)/i,
      /موقع\s+(?:جاهز|احترافي|تجاري|شخصي)/i,
    ],
  },

  // ── Wikipedia / Knowledge ─────────────────────────────────────────────
  WIKI: {
    id: 'knowledge_agent',
    priority: 7,
    patterns: [
      /ويكيبيديا|wikipedia|wiki\b/i,
      /(?:ما|من|كيف|لماذا|متى|أين)\s+(?:هو|هي|هم|كان|كانت)\s+/i,
      /(?:تاريخ|معلومات|سيرة)\s+(?:عن|ذاتية\s+ل)/i,
      /(?:شرح|وصف|عرّف)\s+(?:مفهوم|كلمة|مصطلح)/i,
    ],
  },

  // ── Currency / Finance ────────────────────────────────────────────────
  CURRENCY: {
    id: 'currency_agent',
    priority: 9,
    patterns: [
      /(?:سعر|أسعار)\s+(?:الصرف|الدولار|اليورو|الدينار)/i,
      /(?:تحويل|بدّل)\s+(?:عملة|دولار|يورو|دينار)/i,
      /exchange\s+rate|forex|taux\s+de\s+change/i,
      /(?:dollar|euro|dinar|livre|yen)\s+(?:اليوم|سعر|بـ|مقابل)/i,
      /(?:الدولار|الدينار)\s+(?:الموازي|السوق)/i,
    ],
  },

  // ── Person Search ─────────────────────────────────────────────────────
  PERSON: {
    id: 'person_search_agent',
    priority: 8,
    patterns: [
      /(?:من\s+هو|من\s+هي|معلومات\s+عن)\s+\S+/i,
      /(?:سيرة\s+ذاتية|biography)\s+(?:ل|de)/i,
      /(?:ابحث|اعثر)\s+(?:عن|على)\s+(?:شخص|شخصية)/i,
    ],
  },

  // ── Web Search (fallback) ──────────────────────────────────────────────
  SEARCH: {
    id: 'search_agent',
    priority: 5, // lowest — fallback
    patterns: [
      /(?:ابحث|بحث|search|cherche|trouve)\s+/i,
      /(?:اعثر\s+على|find\s+me|trouver)/i,
    ],
  },
}

// ══════════════════════════════════════════════════════════════════════════════
// classifyUniversalIntent — المصنّف الرئيسي
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @param {string} query
 * @returns {{
 *   intent: string,
 *   agentId: string,
 *   confidence: 'high'|'medium'|'low',
 *   matchCount: number,
 *   ambiguous: boolean,
 *   candidates: Array<{intent: string, agentId: string, matchCount: number, priority: number}>
 * }}
 */
export function classifyUniversalIntent(query = '') {
  const q = (query || '').trim()
  if (!q) return _unknownIntent()

  // ── Cache check ──────────────────────────────────────────────────────────
  const cacheKey = makeKey('uni-intent', q)
  const cached = intentCache.get(cacheKey)
  if (cached) { intentLog.cacheHit(cacheKey); return cached }

  intentLog.cacheMiss(cacheKey)

  // ── Score each agent ─────────────────────────────────────────────────────
  const scores = []
  for (const [intentName, def] of Object.entries(AGENTS)) {
    let matchCount = 0
    for (const pattern of def.patterns) {
      if (pattern.test(q)) matchCount++
    }
    if (matchCount > 0) {
      scores.push({
        intent:     intentName,
        agentId:    def.id,
        matchCount,
        priority:   def.priority,
        score:      matchCount * def.priority,
      })
    }
  }

  if (!scores.length) {
    const result = _unknownIntent(q)
    intentCache.set(cacheKey, result)
    return result
  }

  // Sort: score desc, then priority desc
  scores.sort((a, b) => b.score - a.score || b.priority - a.priority)

  const top     = scores[0]
  const second  = scores[1]
  const ambiguous = second && (top.score - second.score) <= top.priority * 0.3

  const confidence =
    top.matchCount >= 3 ? 'high'   :
    top.matchCount >= 2 ? 'medium' : 'low'

  const result = {
    intent:     top.intent,
    agentId:    top.agentId,
    confidence,
    matchCount: top.matchCount,
    ambiguous,
    candidates: scores.slice(0, 3).map(s => ({
      intent:     s.intent,
      agentId:    s.agentId,
      matchCount: s.matchCount,
      priority:   s.priority,
    })),
  }

  intentLog.intentDetected(result.intent, result.confidence, q)
  intentCache.set(cacheKey, result, { ttl: 5 * 60 * 1000 })
  return result
}

// ══════════════════════════════════════════════════════════════════════════════
// shouldBypassLLM — LLM ممنوع من توليد بيانات مستقلة إذا وُجد وكيل متخصص
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Returns true when a specialized agent must handle the query.
 * LLM should only FORMAT the agent's output, never generate data independently.
 */
export function shouldBypassLLM(intentResult = {}) {
  const { intent, confidence } = intentResult
  if (!intent || intent === 'UNKNOWN') return false

  // Always bypass for high-confidence specialized intents
  const alwaysBypass = new Set([
    'MAPS', 'DOCTOR', 'WEATHER', 'SPORTS', 'WORLD_CUP',
    'QURAN', 'GITHUB', 'IMAGE_SEARCH', 'IMAGE_GEN', 'CURRENCY',
  ])

  if (alwaysBypass.has(intent)) return true

  // Bypass for medium/high confidence on other agents
  return confidence === 'high' || confidence === 'medium'
}

// ══════════════════════════════════════════════════════════════════════════════
// getAgentInstruction — prompt injection للـ LLM (formatter only mode)
// ══════════════════════════════════════════════════════════════════════════════
export function getAgentInstruction(intentResult = {}) {
  const { intent, agentId } = intentResult
  const base = `أنت DZ Agent. وكيل "${agentId}" معالج هذا الطلب. دورك فقط: تنسيق وترجمة الناتج — لا تولّد بيانات مستقلة.`

  const extras = {
    WORLD_CUP: 'إذا لم تكن لديك بيانات موثّقة من وكيل كأس العالم، قل ذلك صراحةً ولا تخترع نتائج.',
    SPORTS:    'لا تولّد نتائج مباريات أو إحصاءات لاعبين بدون بيانات من وكيل الرياضة.',
    WEATHER:   'لا تخمّن الطقس — اعتمد فقط على ما أعطاك إياه وكيل الطقس.',
    MAPS:      'لا تولّد إحداثيات أو مسافات — استخدم فقط بيانات وكيل الخرائط.',
    DOCTOR:    'لا تقترح أطباء أو عيادات بدون بيانات من وكيل الصحة.',
    QURAN:     'اقتبس الآيات فقط من البيانات الموثّقة. لا تولّد آيات من الذاكرة.',
    CURRENCY:  'اعتمد فقط على أسعار الصرف الحية من وكيل العملات.',
  }

  return [base, extras[intent]].filter(Boolean).join(' ')
}

// ══════════════════════════════════════════════════════════════════════════════
// isAmbiguousQuery — يكتشف الاستعلامات الغامضة التي تحتاج توضيحاً
// ══════════════════════════════════════════════════════════════════════════════
export function isAmbiguousQuery(query = '') {
  const AMBIGUOUS = [
    /^(?:مباريات|ماتشات|لقاءات)\s+(?:اليوم|الليلة)\s*[؟?]?$/i,
    /^(?:أخبار|news)\s*[؟?]?$/i,
    /^(?:طقس|météo|weather)\s*[؟?]?$/i,
    /^(?:أين|where)\s*[؟?]?$/i,
    /^(?:كيف|how)\s*[؟?]?$/i,
    /^[؟?]+$/,
    /^.{1,5}[؟?]?$/,  // too short
  ]
  return AMBIGUOUS.some(p => p.test((query || '').trim()))
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════
function _unknownIntent(query = '') {
  return {
    intent:     'UNKNOWN',
    agentId:    'search_agent',
    confidence: 'low',
    matchCount: 0,
    ambiguous:  false,
    candidates: [],
  }
}

// ── Convenience re-export for backward compat with agentRouter.js ─────────
export const INTENT_TYPES = Object.fromEntries(
  Object.keys(AGENTS).map(k => [k, k])
)
