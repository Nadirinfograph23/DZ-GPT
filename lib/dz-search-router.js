/**
 * DZ Search Router v2.0
 * ════════════════════════════════════════════════════════════════════
 * وحدة توجيه البحث الذكي — القرار الوحيد: SEARCH أم NO_SEARCH؟
 *
 * القواعد الصارمة (من المطور):
 *  • تعليمات المطور لها الأولوية المطلقة
 *  • لا تعديل على شخصية DZ Agent أو قواعده
 *  • البحث الحي أداة إضافية فقط — ليس إجابة
 *  • نتائج SearXNG تُستخدم كمصدر معلومات فقط
 *
 * المُصدَّر:
 *   dzSearchRouter(query)       → { decision, searchQuery, topic, reason, category }
 *   extractSearchTopic(query)   → string (الموضوع المستخرج للبحث)
 *   buildOptimizedQuery(query)  → string (استعلام محسّن لـ SearXNG)
 * ════════════════════════════════════════════════════════════════════
 */

// ══════════════════════════════════════════════════════════════════
// § 1 — NO_SEARCH PATTERNS (أولوية أعلى — تفحص أولاً)
// ══════════════════════════════════════════════════════════════════

const NO_SEARCH_RULES = [
  // برمجة وكود
  { re: /(?:اكتب|أكتب|اصنع|برمج|دير|انشئ|نفذ|شغل)\s+(?:لي\s+)?(?:كود|برنامج|سكريبت|دالة|خوارزمية|class|function|script)/i, reason: 'coding_task' },
  { re: /(?:write|create|make|build|code|program|implement)\s+(?:a\s+)?(?:function|class|script|algorithm|program|code)/i, reason: 'coding_task' },
  { re: /(?:اشرح|افهمني|ساعدني\s+في)\s+(?:الكود|البرمجة|الخوارزمية)/i, reason: 'code_explain' },
  { re: /(?:bug|error|خطأ\s+في\s+الكود|stack\s+trace|exception|debug)/i, reason: 'code_debug' },
  { re: /(?:syntax|compiler|runtime|مترجم|محرر)\s+(?:error|خطأ)/i, reason: 'code_error' },

  // رياضيات وحساب
  { re: /(?:احسب|حساب|اجمع|اطرح|اضرب|اقسم|جذر|تربيع|مشتقة|تكامل)\b/i, reason: 'math' },
  { re: /(?:calculate|compute|solve|مسألة|معادلة\s+رياضية|geometry|algebra)\b/i, reason: 'math' },
  { re: /^[\d\s\+\-\*\/\(\)\^\%=،,\.]+$/, reason: 'math_expression' },

  // ترجمة
  { re: /^(?:ترجم|ترجملي|حوّل)\s+(?:هذا|الجملة|الكلمة|النص|هذه)?\s*/i, reason: 'translation' },
  { re: /(?:translate|traduction|traduire)\s+/i, reason: 'translation' },
  { re: /(?:كلمة|جملة|نص)\s+(?:بالإنجليزية|بالفرنسية|بالعربية|بالأمازيغية)\s+(?:هي|يعني|معناها)/i, reason: 'translation' },

  // إعادة صياغة وتحرير نصوص
  { re: /(?:أعد\s+صياغة|راجع|صحّح|حسّن|نقّح|اكتب\s+بأسلوب)\s+(?:هذا\s+)?(?:النص|الجملة|الفقرة|المقال)/i, reason: 'text_editing' },
  { re: /(?:rephrase|rewrite|paraphrase|correct\s+this|improve\s+this)\s+(?:text|sentence|paragraph)/i, reason: 'text_editing' },

  // إنشاء نصوص إبداعية
  { re: /(?:اكتب|أكتب|انشئ|أنشئ)\s+(?:قصيدة|قصة|رسالة|مقال|خطاب|إعلان|محتوى|تغريدة|منشور)/i, reason: 'content_creation' },
  { re: /(?:write|compose|create)\s+(?:a\s+)?(?:poem|story|letter|article|essay|speech|tweet|post)/i, reason: 'content_creation' },

  // أسئلة شخصية وفلسفية
  { re: /(?:ما\s+رأيك|ما\s+هو\s+رأيك|ما\s+الأفضل\s+في\s+رأيك|أيّهما\s+تفضل|ما\s+تحب)\s+/i, reason: 'personal_opinion' },
  { re: /(?:هل\s+أنت|من\s+أنت|ما\s+أنت|كيف\s+تفكر|هل\s+تحب|هل\s+تشعر)\b/i, reason: 'personal_ai' },

  // محتوى قدّمه المستخدم في المحادثة
  { re: /(?:ما\s+رأيك\s+في\s+هذا|علّق\s+على\s+هذا|لخّص\s+ما\s+كتبته|ما\s+هو\s+ملخص\s+ما\s+قلته)/i, reason: 'conversation_content' },

  // تعريفات عامة (معرفة ثابتة في النموذج)
  { re: /^(?:ما\s+هو|ما\s+هي|ما\s+معنى|ما\s+المقصود\s+بـ?)\s+(?!(?:الحالي|الآن|اليوم|هذا\s+الأسبوع|هذا\s+الشهر|آخر|أحدث|الجديد))/i, reason: 'static_definition' },
  { re: /^(?:عرّف|اشرح|وضّح|اذكر)\s+(?:لي\s+)?(?:مفهوم|مصطلح|معنى|تعريف)\s+/i, reason: 'definition' },

  // أسئلة دينية ثابتة
  { re: /(?:آية|سورة|حديث|فقه|فريضة|ركن\s+من\s+أركان|حكم\s+الشرع|الإسلام\s+في)\s+/i, reason: 'religion_static' },

  // تاريخ ثابت (ليس أحداثاً جارية)
  { re: /(?:تاريخ|تأسيس|نشأة|إنشاء|بناء)\s+(?!(?:اليوم|هذا\s+الأسبوع|مؤخراً))/i, reason: 'history_static' },
]

// ══════════════════════════════════════════════════════════════════
// § 2 — SEARCH TRIGGERS (متى يُفعَّل البحث الحي؟)
// ══════════════════════════════════════════════════════════════════

// ① أخبار وأحداث جارية
const NEWS_SEARCH_RULES = [
  { re: /(?:أخبار|خبر|خبر\s+عاجل|آخر\s+(?:أخبار|مستجدات|تطورات|أحداث)|عاجل|breaking|actualité|nouvelles)\s*/i, category: 'news' },
  { re: /(?:ماذا\s+حدث|ما\s+الذي\s+حدث|واش\s+صار|واش\s+صرا|وش\s+صار|شنو\s+صار)\s*/i, category: 'news' },
  { re: /(?:أحداث|مستجدات|تطورات)\s+(?:الجزائر|العالم|المنطقة|اليوم|هذا\s+الأسبوع)/i, category: 'news' },
  { re: /(?:جديد|الجديد)\s+(?:في|عن|بخصوص)\s+\S+/i, category: 'news' },
  { re: /(?:آخر|أحدث)\s+(?:تصريح|بيان|قرار|إعلان|مرسوم|قانون)\s+/i, category: 'news' },
  { re: /(?:اليوم\s+في\s+الجزائر|يوم\s+الجزائر|في\s+الجزائر\s+اليوم)/i, category: 'news' },
]

// ② معلومات زمنية متغيرة
const REALTIME_DATA_RULES = [
  { re: /(?:سعر|أسعار|صرف|تحويل)\s+(?:الدولار|اليورو|الإسترليني|الريال|الدينار|الدرهم|الذهب|النفط|البترول|الأسهم)\s*/i, category: 'prices' },
  { re: /(?:سعر\s+الصرف|أسعار\s+الصرف|صرف\s+اليوم|الأسعار\s+اليوم)\s*/i, category: 'prices' },
  { re: /(?:الطقس|طقس|درجة\s+الحرارة|الجو|حرارة)\s+(?:اليوم|الآن|غداً|الأسبوع|هذه\s+الأيام)/i, category: 'weather' },
  { re: /(?:weather|météo|temperature|forecast)\s+(?:today|now|tomorrow|this\s+week)/i, category: 'weather' },
  { re: /(?:مباراة|مباريات|ماتش|ماتشات|نتيجة|نتائج|سكور|ترتيب|الدوري)\s+(?:اليوم|الليلة|هذا\s+الأسبوع|الجولة)/i, category: 'sports_live' },
  { re: /(?:وقت|موعد|مواعيد)\s+(?:رحلة|رحلات|طيران|قطار|حافلة)\s*/i, category: 'transport' },
  { re: /(?:نتائج\s+الانتخابات|نتائج\s+الاستفتاء|تصريح\s+(?:الرئيس|الوزير|المسؤول))\s+(?:اليوم|هذا\s+الأسبوع|مؤخراً)/i, category: 'official' },
]

// ③ بحث عن مواقع وروابط
const LINK_SEARCH_RULES = [
  { re: /(?:الموقع\s+الرسمي|رابط\s+التسجيل|رابط\s+التحميل|صفحة\s+رسمية|لينك\s+(?:رسمي|التسجيل|التحميل))/i, category: 'links' },
  { re: /(?:official\s+website|official\s+page|download\s+link|registration\s+link)/i, category: 'links' },
  { re: /(?:وثيقة\s+رسمية|استمارة|نموذج\s+تسجيل|ملف\s+(?:pdf|PDF)\s+(?:رسمي|لـ))/i, category: 'links' },
  { re: /(?:تنزيل|تحميل)\s+(?:برنامج|تطبيق|إصدار|نسخة)\s+(?:الجديد|الأخير|الحديث)/i, category: 'download' },
]

// ④ معلومات متغيرة (المسؤولون الحاليون، قوانين، إصدارات)
const DYNAMIC_INFO_RULES = [
  { re: /(?:الوزير\s+الحالي|الرئيس\s+الحالي|المدير\s+الحالي|الأمين\s+العام\s+الحالي)\s+(?:لـ|ل|وزارة|هيئة|منظمة)/i, category: 'current_officials' },
  { re: /(?:القانون\s+الجديد|المرسوم\s+الجديد|التعديل\s+الأخير|اللائحة\s+الجديدة)\s*/i, category: 'regulations' },
  { re: /(?:الإصدار\s+الجديد|النسخة\s+الأخيرة|آخر\s+إصدار|latest\s+version)\s+(?:من\s+)?(?:برنامج|تطبيق|نظام)/i, category: 'software' },
  { re: /(?:مواصفات|سعر)\s+(?:هاتف|جهاز|سيارة|منتج)\s+(?:الجديد|الجديدة|الأخير|هذا\s+العام)/i, category: 'product' },
  { re: /(?:شاغل\s+المنصب|من\s+هو\s+الوزير\s+الحالي|من\s+هو\s+رئيس)\s+/i, category: 'current_officials' },
]

// ⑤ طلبات صريحة من المستخدم
const EXPLICIT_SEARCH_RULES = [
  { re: /(?:ابحث|ابحثلي|دور|دورلي|فتّش|ابحث\s+في\s+الإنترنت|ابحث\s+على\s+الإنترنت|بحث\s+حي)/i, category: 'explicit' },
  { re: /(?:search|find|look\s+up|google\s+it|check\s+this|verify\s+this)/i, category: 'explicit' },
  { re: /(?:تحقق\s+من\s+هذا|تحقق\s+من\s+صحة|تأكد\s+من|راجع\s+(?:على\s+الإنترنت))/i, category: 'explicit' },
  { re: /(?:ابحث\s+عن\s+أحدث|ابحث\s+عن\s+آخر|جيبلي\s+أحدث|جيبلي\s+آخر)/i, category: 'explicit' },
  { re: /(?:بحث\s+الآن|ابحث\s+الآن|recherche\s+maintenant)/i, category: 'explicit' },
]

// ⑥ معلومات غير مؤكدة تحتاج بحثاً (قد لا تكون في ذاكرة النموذج)
const UNCERTAIN_INFO_RULES = [
  { re: /(?:هذا\s+الأسبوع|الأسبوع\s+الحالي|هذا\s+الشهر|الشهر\s+الحالي|هذا\s+العام|عام\s+2024|عام\s+2025|عام\s+2026)/i, category: 'temporal' },
  { re: /(?:مؤخراً|حديثاً|مؤخرا|في\s+الآونة\s+الأخيرة|في\s+الفترة\s+الأخيرة)/i, category: 'recent' },
  { re: /(?:آخر\s+تحديث|التحديث\s+الأخير|ما\s+الجديد\s+في)\s+/i, category: 'updates' },
  { re: /(?:منذ\s+(?:أمس|البارح|الأسبوع\s+الماضي)|في\s+(?:الأسبوع|الشهر)\s+الماضي)/i, category: 'recent' },
]

// ══════════════════════════════════════════════════════════════════
// § 3 — TOPIC EXTRACTOR (استخراج الموضوع الحقيقي من السؤال)
// ══════════════════════════════════════════════════════════════════

// أنماط استخراج الموضوع من صيغة "أخبار X" أو "ما جديد X"
const TOPIC_PREFIX_PATTERNS = [
  // "أخبار الذكاء الاصطناعي" → "الذكاء الاصطناعي"
  /^(?:أخبار|خبر|آخر\s+أخبار|أحدث\s+أخبار|آخر\s+مستجدات|آخر\s+تطورات|عاجل\s+بخصوص|ما\s+جديد|الجديد\s+في|جديد)\s+(?:حول|عن|في|بخصوص|بشأن)?\s*/i,
  // "أخبار اليوم عن X"
  /^(?:أخبار|خبر)\s+(?:اليوم|هذا\s+الأسبوع|هذا\s+الشهر|مؤخراً)\s+(?:عن|حول|بخصوص|في)?\s*/i,
  // "ما الجديد في X"
  /^(?:ما\s+الجديد|شنو\s+الجديد|وش\s+الجديد|ما\s+الذي\s+يحدث)\s+(?:في|مع|بشأن|حول)?\s*/i,
  // "آخر أخبار X اليوم/الأسبوع"
  /^(?:آخر|أحدث|جديد)\s+(?:أخبار|مستجدات|تطورات|أحداث)\s+/i,
]

// كلمات التوقيت التي نحذفها بعد استخراج الموضوع
const TIME_SUFFIXES = [
  /\s+(?:اليوم|هذا\s+النهار|هذه\s+الأيام|الآن|درك)$/i,
  /\s+(?:هذا\s+الأسبوع|الأسبوع\s+الحالي|في\s+الأسبوع)$/i,
  /\s+(?:هذا\s+الشهر|الشهر\s+الحالي)$/i,
  /\s+(?:مؤخراً|حديثاً|مؤخرا|في\s+الآونة\s+الأخيرة)$/i,
  /\s+(?:في\s+العالم|في\s+الجزائر|في\s+المنطقة)$/i,
]

/**
 * extractSearchTopic(query) — يستخرج الموضوع الحقيقي من السؤال
 * "أخبار الاقتصاد الجزائري" → "الاقتصاد الجزائري"
 * "أخبار الذكاء الاصطناعي هذا الأسبوع" → "الذكاء الاصطناعي"
 */
export function extractSearchTopic(query = '') {
  let topic = query.trim()

  // إزالة بادئات "أخبار / آخر أخبار / ما جديد..."
  for (const pat of TOPIC_PREFIX_PATTERNS) {
    const cleaned = topic.replace(pat, '').trim()
    if (cleaned && cleaned.length >= 2 && cleaned !== topic) {
      topic = cleaned
      break
    }
  }

  // إزالة لواحق الوقت
  for (const suf of TIME_SUFFIXES) {
    topic = topic.replace(suf, '').trim()
  }

  return topic.length >= 2 ? topic : query.trim()
}

/**
 * buildOptimizedQuery(query, topic, category) — يبني استعلام SearXNG محسّن
 * مثال: "أخبار الذكاء الاصطناعي هذا الأسبوع" → "ذكاء اصطناعي أخبار 2025"
 */
export function buildOptimizedQuery(query = '', topic = '', category = 'news') {
  const year = new Date().getFullYear()
  const cleanTopic = topic || extractSearchTopic(query)

  switch (category) {
    case 'news':
      // أضف "أخبار" فقط إذا لم تكن موجودة
      if (/أخبار/i.test(cleanTopic)) return `${cleanTopic} ${year}`
      return `${cleanTopic} أخبار ${year}`

    case 'prices':
      return `${cleanTopic} سعر اليوم ${year}`

    case 'weather':
      return query // الطقس يُرسل كما هو

    case 'sports_live':
      return `${cleanTopic} نتيجة مباراة اليوم`

    case 'links':
      return `${cleanTopic} موقع رسمي`

    case 'software':
    case 'download':
      return `${cleanTopic} تحميل ${year}`

    case 'current_officials':
      return `${cleanTopic} ${year}`

    case 'explicit':
    case 'temporal':
    case 'recent':
    default:
      return cleanTopic.length >= 4 ? `${cleanTopic} ${year}` : query
  }
}

// ══════════════════════════════════════════════════════════════════
// § 4 — MAIN ROUTER FUNCTION
// ══════════════════════════════════════════════════════════════════

/**
 * dzSearchRouter(query)
 * @param {string} query - رسالة المستخدم
 * @returns {{
 *   decision: 'SEARCH' | 'NO_SEARCH',
 *   topic: string,
 *   searchQuery: string,
 *   reason: string,
 *   category: string
 * }}
 */
export function dzSearchRouter(query = '') {
  const q = query.trim()

  if (!q || q.length < 3) {
    return { decision: 'NO_SEARCH', topic: q, searchQuery: q, reason: 'too_short', category: 'none' }
  }

  // ── Step 1: فحص NO_SEARCH أولاً (أولوية أعلى) ──────────────────────────
  for (const rule of NO_SEARCH_RULES) {
    if (rule.re.test(q)) {
      console.log(`[SearchRouter] ❌ NO_SEARCH | reason=${rule.reason} | "${q.slice(0, 60)}"`)
      return { decision: 'NO_SEARCH', topic: q, searchQuery: q, reason: rule.reason, category: 'blocked' }
    }
  }

  // ── Step 2: فحص SEARCH triggers بالترتيب ───────────────────────────────
  const allSearchRules = [
    ...EXPLICIT_SEARCH_RULES,   // الأعلى أولوية — صريح من المستخدم
    ...REALTIME_DATA_RULES,     // بيانات زمنية متغيرة
    ...NEWS_SEARCH_RULES,       // أخبار وأحداث
    ...LINK_SEARCH_RULES,       // مواقع وروابط
    ...DYNAMIC_INFO_RULES,      // معلومات متغيرة
    ...UNCERTAIN_INFO_RULES,    // معلومات قد تكون غير محدّثة
  ]

  for (const rule of allSearchRules) {
    if (rule.re.test(q)) {
      const topic       = extractSearchTopic(q)
      const searchQuery = buildOptimizedQuery(q, topic, rule.category)
      console.log(`[SearchRouter] ✅ SEARCH | category=${rule.category} | topic="${topic}" | searchQ="${searchQuery}" | "${q.slice(0, 60)}"`)
      return { decision: 'SEARCH', topic, searchQuery, reason: 'matched', category: rule.category }
    }
  }

  // ── Step 3: NO_SEARCH افتراضي ───────────────────────────────────────────
  console.log(`[SearchRouter] ➖ NO_SEARCH (default) | "${q.slice(0, 60)}"`)
  return { decision: 'NO_SEARCH', topic: q, searchQuery: q, reason: 'no_trigger', category: 'none' }
}

export default dzSearchRouter
