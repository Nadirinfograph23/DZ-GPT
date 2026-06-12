/**
 * middleware/agentRouter.js
 * ══════════════════════════════════════════════════════════
 * Intent Router — يصنّف كل سؤال رياضي قبل وصوله إلى LLM
 *
 * الهيكل:
 *   User Query
 *     ↓
 *   classifyIntent()  ← يحدد النوع (WORLD_CUP / SPORTS_GENERAL / NOT_SPORTS)
 *     ↓
 *   routeToAgent()    ← يوجّه للوكيل الصحيح ويمنع LLM
 *     ↓
 *   LLM Formatter فقط (تنسيق + ترجمة — لا بيانات مستقلة)
 *
 * القواعد:
 *   1. إذا تم تحديد وكيل متخصص → LLM ممنوع من توليد بيانات مستقلة
 *   2. كأس العالم له سلطة مطلقة على أسئلته
 *   3. "مباريات اليوم" بدون تحديد → يسأل المستخدم
 */

// ── كلمات كأس العالم (أي كلمة منها = توجيه إلزامي) ─────────────────────
const WC_KEYWORDS = [
  'كأس العالم', 'كأس‌العالم',
  'world cup', 'worldcup',
  'مونديال',
  'fifa 2026', 'fwc2026', 'wc2026', 'wc 2026',
  'fifa world cup',
  'المونديال',
  'كوبا موندياليست',
  'mondial',
]

// ── كلمات البيانات الحية لكأس العالم ─────────────────────────────────────
const WC_LIVE_PATTERNS = [
  /مباريات?\s*(?:اليوم|الليلة|الآن|النهار)/i,
  /نتائج\s*(?:اليوم|الليلة|الآن)/i,
  /(?:اليوم|الليلة|الآن)\s*.*مباريات?/i,
  /هداف|أفضل\s+هداف|ترتيب\s+الهداف/i,
  /تشكيل(?:ة|ات)?/i,
  /حكم|طاقم\s+تحكيم/i,
  /بطاقة\s+(?:صفراء|حمراء)|إنذار/i,
  /ترتيب\s+(?:المجموعة|مجموعة)/i,
  /نقاط\s+(?:الجزائر|فريق|منتخب)/i,
  /جدول\s+(?:المجموعة|النتائج)/i,
  /برنامج\s+(?:المباريات|اليوم)/i,
  /الجولة\s+(?:\d+|الأولى|الثانية|الثالثة)/i,
  /من\s+(?:فاز|ربح|سجل|صنع)\s+(?:في|ب)?\s*(?:كأس|المونديال)/i,
  /ملخص\s+(?:مباراة|يوم|الأمس)/i,
  /مواعيد|توقيت/i,
]

// ── كلمات الرياضة العامة (غير كأس العالم) ──────────────────────────────
const SPORTS_KEYWORDS = [
  /دوري|ليغ|league/i,
  /نادي|ناد[ي]?|club|فريق(?!\s+وطني)/i,
  /لاعب|player/i,
  /انتقال|صفقة|transfert|mercato|تعاقد/i,
  /دوري\s+أبطال|تشامبيونز|champions/i,
  /دوري\s+(?:إنجليزي|إسباني|فرنسي|ألماني|إيطالي)/i,
  /الدوري\s+(?:الجزائري|المحترف)/i,
  /(?:ريال\s+مدريد|برشلونة|مانشستر|ليفربول|باريس|بايرن)/i,
  /(?:محرز|بونجاح|عطال|فيغولي|مازة|بن\s+ناصر)/i,
  /ركلات\s+الترجيح|هدف\s+(?:خارج\s+الملعب|الأرض|الوادية)/i,
  /أفريقيا|كان|afcon|caf/i,
  /ترتيب\s+(?:الدوري|الفرق)/i,
]

// ── كشف استعلام غامض "مباريات اليوم" بدون تحديد ──────────────────────
const AMBIGUOUS_TODAY_PATTERNS = [
  /^(?:مباريات|ماتشات|لقاءات)\s+(?:اليوم|الليلة)\s*[؟?]?$/i,
  /^(?:شكون|من)\s+يلعب\s+(?:اليوم|الليلة)\s*[؟?]?$/i,
  /^(?:برنامج|جدول)\s+(?:اليوم|الليلة)\s*[؟?]?$/i,
]

// ════════════════════════════════════════════════════════════════════════════
// classifyIntent — المصنّف الرئيسي
// ════════════════════════════════════════════════════════════════════════════
/**
 * @param {string} query
 * @returns {{
 *   intent: 'WORLD_CUP' | 'SPORTS_GENERAL' | 'NOT_SPORTS' | 'AMBIGUOUS_TODAY',
 *   confidence: 'high' | 'medium' | 'low',
 *   keywords: string[],
 *   wcSubType: string | null,
 * }}
 */
export function classifyIntent(query = '') {
  const q = query.trim()
  const qLower = q.toLowerCase()
  const foundKeywords = []

  // ── 1. كأس العالم — أعلى أولوية ────────────────────────────────────────
  const hasWCKeyword = WC_KEYWORDS.some(kw => {
    if (qLower.includes(kw)) { foundKeywords.push(kw); return true }
    return false
  })

  if (hasWCKeyword) {
    // تحديد النوع الفرعي
    let wcSubType = 'GENERAL'
    if (/اليوم|الليلة|الآن|النهار|هاذ\s+النهار/i.test(q)) wcSubType = 'TODAY'
    else if (/الغد|غدا?|بكر[اة]/i.test(q)) wcSubType = 'TOMORROW'
    else if (/ترتيب|نقاط|صدارة|مجموعة\s+[a-lA-L]/i.test(q)) wcSubType = 'STANDINGS'
    else if (/هداف|ترتيب\s+الهداف/i.test(q)) wcSubType = 'SCORERS'
    else if (/تشكيل|تشكيلة/i.test(q)) wcSubType = 'LINEUP'
    else if (/مباريات|برنامج|جدول|رزنامة|fixture/i.test(q)) wcSubType = 'FIXTURES'

    return { intent: 'WORLD_CUP', confidence: 'high', keywords: foundKeywords, wcSubType }
  }

  // ── 2. كأس العالم — أنماط غير مباشرة (بدون كلمة "كأس العالم" صريحة) ──
  const hasWCPattern = WC_LIVE_PATTERNS.some(p => {
    if (p.test(q)) { foundKeywords.push(p.source); return true }
    return false
  })
  if (hasWCPattern &&
      /(?:مباراة|مباريات|نتائج|جدول|برنامج)\s+.*(?:اليوم|الآن|الليلة)/i.test(q)) {
    // قد تكون لأي بطولة — نعيّنها رياضة عامة ونترك الوكيل يقرر
  }

  // ── 3. "مباريات اليوم" بدون تحديد البطولة ──────────────────────────────
  const isAmbiguous = AMBIGUOUS_TODAY_PATTERNS.some(p => p.test(q.trim()))
  if (isAmbiguous) {
    return { intent: 'AMBIGUOUS_TODAY', confidence: 'high', keywords: [], wcSubType: null }
  }

  // ── 4. رياضة عامة ───────────────────────────────────────────────────────
  const hasSportsKeyword = SPORTS_KEYWORDS.some(p => {
    if (p.test(q)) { foundKeywords.push(p.source); return true }
    return false
  })
  if (hasSportsKeyword) {
    return { intent: 'SPORTS_GENERAL', confidence: 'medium', keywords: foundKeywords, wcSubType: null }
  }

  // ── 5. كلمات رياضة عامة نصية ────────────────────────────────────────────
  const sportNlp = /مباراة|ماتش|ملعب|مرمى|هدف|تسجيل|خسر|فاز|ربح|نتيجة|سكور/i
  if (sportNlp.test(q)) {
    return { intent: 'SPORTS_GENERAL', confidence: 'low', keywords: ['sport-nlp'], wcSubType: null }
  }

  return { intent: 'NOT_SPORTS', confidence: 'high', keywords: [], wcSubType: null }
}

// ════════════════════════════════════════════════════════════════════════════
// buildAmbiguousResponse — رد على "مباريات اليوم" بدون تحديد
// ════════════════════════════════════════════════════════════════════════════
export function buildAmbiguousResponse(query = '') {
  return {
    userResponse: [
      `## ⚽ مباريات اليوم`,
      ``,
      `أي بطولة تريد متابعتها؟ حدّد لأعطيك المعلومات الدقيقة:`,
      ``,
      `| الخيار | المثال |`,
      `|--------|--------|`,
      `| 🌐 **كأس العالم 2026** | "مباريات اليوم كأس العالم" |`,
      `| 🏴󠁧󠁢󠁥󠁮󠁧󠁿 **الدوري الإنجليزي** | "مباريات اليوم البريميرليغ" |`,
      `| 🇪🇸 **الدوري الإسباني** | "مباريات اليوم لا ليغا" |`,
      `| 🇩🇿 **الدوري الجزائري** | "مباريات اليوم الرابطة الأولى" |`,
      `| 🌍 **دوري أبطال أفريقيا** | "مباريات اليوم CAF" |`,
    ].join('\n'),
    found: false,
    agent: 'agent_router',
    source: 'clarification',
    confidence: 'high',
    needsClarification: true,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// routeToAgent — الدالة الرئيسية للتوجيه
// ════════════════════════════════════════════════════════════════════════════
/**
 * @param {string} query
 * @param {Array} messages
 * @returns {{ handled: boolean, response: object | null, intent: object }}
 */
export async function routeToAgent(query, messages = []) {
  const intent = classifyIntent(query)

  // ── AMBIGUOUS_TODAY — اسأل المستخدم ─────────────────────────────────────
  if (intent.intent === 'AMBIGUOUS_TODAY') {
    return {
      handled: true,
      response: buildAmbiguousResponse(query),
      intent,
    }
  }

  // ── WORLD_CUP — وكيل كأس العالم بسلطة مطلقة ────────────────────────────
  if (intent.intent === 'WORLD_CUP') {
    const { runWorldCupAgent } = await import('../agents/worldCupAgent.js')
    const res = await runWorldCupAgent(query, messages)
    return { handled: true, response: res, intent }
  }

  // ── SPORTS_GENERAL — وكيل الرياضة العامة ───────────────────────────────
  if (intent.intent === 'SPORTS_GENERAL') {
    const { runGeneralSportsAgent } = await import('../agents/sportsAgent.js')
    const res = await runGeneralSportsAgent(query, messages)
    return { handled: true, response: res, intent }
  }

  // ── NOT_SPORTS — لا توجيه ────────────────────────────────────────────────
  return { handled: false, response: null, intent }
}
