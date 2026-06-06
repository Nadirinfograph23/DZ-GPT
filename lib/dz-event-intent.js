/**
 * DZ Agent — Time-Sensitive Event Intent Detector v1.0
 * ══════════════════════════════════════════════════════════════════════════════
 * يكشف الاستعلامات عن الأحداث الآنية والأخبار الحديثة
 * ويوجّهها فوراً إلى SearXNG بدلاً من الانتظار كـ fallback
 *
 * Logic:
 *   1. Strong patterns → confidence 0.95 (فوري)
 *   2. Scored: temporal + event + entity → إذا score ≥ 0.5 → isTimeSensitive
 *
 * Exports:
 *   detectTimeSensitiveIntent(query) → { isTimeSensitive, eventType, confidence, searchQuery, trigger }
 *   isTimeSensitiveQuery(query)      → boolean (shorthand)
 *   buildEventSearchQuery(query)     → string (استعلام محسّن للبحث)
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ── TEMPORAL KEYWORDS — مؤشرات زمنية عربية فصحى ────────────────────────────
const TEMPORAL_FORMAL = [
  'آخر', 'أحدث', 'الجديد', 'الجديدة', 'حالياً', 'الآن', 'اليوم',
  'أمس', 'البارحة', 'مؤخراً', 'حديثاً', 'هذا الأسبوع', 'هذا الشهر',
  'هذا العام', 'في الوقت الحالي', 'حتى الآن', 'مستجدات', 'تطورات',
  'تحديث', 'تحديثات', 'عاجل', 'breaking', 'منذ قليل', 'قبل قليل',
  'للتو', 'توّاً', 'في هذه اللحظة', 'الساعة', 'اليوم الجمعة',
  'اليوم السبت', 'أخيراً', 'حديث',
]

// ── TEMPORAL KEYWORDS — دارجة جزائرية ────────────────────────────────────────
const TEMPORAL_DIALECT = [
  'واش راه صاري', 'واش صاري', 'واش صرا', 'وش صرا',
  'واش صار', 'وش صار', 'واش كاين جديد', 'وش كاين جديد',
  'واش كاين', 'وش كاين', 'آخر خبر', 'آخر الأخبار',
  'خبر جديد', 'واش راه جديد', 'واش راه',
  'دروك', 'درك', 'توا', 'هاذ الأيام', 'هذا الأيام',
  'البارح', 'طرى', 'طرا', 'صار', 'وقع',
  'واش جرا', 'وش جرا', 'شنو صرا', 'شنو جرا',
]

// ── EVENT KEYWORDS — حوادث واصطدامات ──────────────────────────────────────────
const EVENT_ACCIDENTS = [
  'حادث', 'حادثة', 'اصطدام', 'انقلاب', 'تحطم', 'تصادم',
  'سقط', 'وقوع حادث', 'انزلاق', 'دهس', 'جنح', 'شنطة',
  'كارثة طريق', 'حوادث المرور',
]

// ── EVENT KEYWORDS — كوارث طبيعية ──────────────────────────────────────────
const EVENT_DISASTERS = [
  'زلزال', 'زلازل', 'فيضان', 'فيضانات', 'عاصفة', 'كارثة',
  'إعصار', 'غرق', 'انهيار', 'انهيار أرضي', 'براكين', 'بركان',
  'جفاف', 'حرائق', 'ضحايا', 'قتيل', 'مصابين', 'وفيات',
  'مات', 'توفي', 'توفى', 'لقي حتفه', 'سقط قتيلاً',
]

// ── EVENT KEYWORDS — حريق وانفجار ──────────────────────────────────────────
const EVENT_FIRE_EXPLOSION = [
  'حريق', 'حرائق', 'انفجار', 'تفجير', 'قنبلة', 'اشتعل',
  'احترق', 'دمّر', 'مبنى محترق', 'نشوب حريق', 'إخماد',
]

// ── EVENT KEYWORDS — أحداث سياسية ──────────────────────────────────────────
const EVENT_POLITICAL = [
  'استقال', 'استقالة', 'إقالة', 'أُقيل', 'عُيِّن', 'تعيين',
  'تعيّن', 'انتخب', 'انتخاب', 'فاز في الانتخاب', 'هزم في',
  'اعتُقل', 'اعتقال', 'طُرد', 'ألقي القبض', 'حُكم عليه',
  'سُجن', 'أُفرج', 'أُطلق سراح', 'هجوم', 'اغتيال', 'اغتيل',
  'ضربة', 'غارة', 'قصف', 'قرار', 'مرسوم', 'وقّع', 'أمضى',
  'اتفاقية', 'معاهدة', 'قمة', 'اجتماع طارئ', 'مظاهرة',
  'احتجاج', 'اعتصام', 'عقوبات', 'حصار',
]

// ── EVENT KEYWORDS — رياضة (نتائج وانتقالات) ───────────────────────────────
const EVENT_SPORTS = [
  'فاز', 'خسر', 'تعادل', 'نتيجة المباراة', 'انتقل', 'صفقة',
  'إصابة اللاعب', 'أحرز', 'سجّل هدف', 'طُرد', 'احتجز',
  'ضمّه', 'تعاقد', 'رحل', 'انتهت مباراة',
]

// ── EVENT KEYWORDS — تغيير حالة (وفاة، مرض، نجاح، فضيحة) ──────────────────
const EVENT_STATUS_CHANGE = [
  'تحول', 'تبدّل', 'تغيّر', 'أصبح', 'بات', 'انضم', 'غادر',
  'ترك', 'عاد', 'وصل', 'أفلس', 'أعلن إفلاس', 'انتشر',
  'ظهر', 'كشف', 'فضيحة', 'اعترف', 'أنكر',
]

// ── الكل ─────────────────────────────────────────────────────────────────────
const ALL_TEMPORAL = [...TEMPORAL_FORMAL, ...TEMPORAL_DIALECT]
const ALL_EVENTS = [
  ...EVENT_ACCIDENTS, ...EVENT_DISASTERS, ...EVENT_FIRE_EXPLOSION,
  ...EVENT_POLITICAL, ...EVENT_SPORTS, ...EVENT_STATUS_CHANGE,
]

// ── أنماط قوية — trigger فوري بغض النظر عن الدرجة ─────────────────────────
const STRONG_NEWS_PATTERNS = [
  // دارجة جزائرية — استعلامات الأحداث
  /واش\s+صر[ا]/i,
  /وش\s+صر[ا]/i,
  /واش\s+صار/i,
  /وش\s+صار/i,
  /واش\s+راه\s+صاري/i,
  /واش\s+صاري/i,
  /واش\s+كاين\s+جديد/i,
  /وش\s+كاين\s+جديد/i,
  /واش\s+جرى?/i,
  /وش\s+جرى?/i,
  /شنو\s+صر[اى]/i,
  /شنو\s+جر[اى]/i,
  // عربية فصحى — ماذا حدث
  /ماذا\s+حدث/i,
  /ما\s+الذي\s+حدث/i,
  /ماذا\s+جرى/i,
  /ما\s+الجديد\s+(?:في|عن|بخصوص|حول|ل)/i,
  /(?:أخبار|مستجدات|تطورات|جديد)\s+(?:عن|حول|بخصوص|ل[ـ]?)\s+\S+/i,
  /(?:آخر|أحدث)\s+(?:أخبار|تطورات|مستجدات|أنباء)/i,
  /(?:خبر|نبأ)\s+عاجل/i,
  /(?:عاجل|breaking)\s*:/i,
  // حوادث محددة
  /(?:ماذا|ما\s+الذي)\s+حدث\s+(?:في|ل|مع)/i,
  /(?:تعرّض|تعرض)\s+(?:له|لها|لهم)\s+\S+/i,
  /(?:تعرّض|تعرض)\s+\S+\s+(?:لـ?|إلى)/i,
  /\S+\s+(?:تعرّض|تعرض)\s+(?:لـ?|إلى|ل)/i,
  // "آخر حادثة تعرض لها X"
  /آخر\s+(?:حادثة|حادث|واقعة|حدث|هجوم|اعتداء)\s+(?:تعرّض|مرّ|حدث|وقع|طال)\s+/i,
]

// ── أنماط تدمج كيان مع حدث ─────────────────────────────────────────────────
const ENTITY_EVENT_PATTERNS = [
  // اسم + حادثة/هجوم/اعتقال
  /\S{3,}\s+(?:اغتيل|اعتُقل|طُرد|استقال|حُكم|سُجن|أُطلق|توفي|مات|أُصيب|تعرّض)/i,
  // حدث + شخص
  /(?:هجوم|اعتقال|اغتيال|وفاة|استقالة)\s+(?:على\s+|ضد\s+)?\S{3,}/i,
]

/**
 * detectTimeSensitiveIntent — كشف الاستعلامات الحساسة زمنياً
 * @param {string} query
 * @returns {{ isTimeSensitive: boolean, eventType: string, confidence: number, searchQuery: string, trigger: string }}
 */
export function detectTimeSensitiveIntent(query = '') {
  const q = (query || '').trim()
  if (q.length < 5) return { isTimeSensitive: false, eventType: 'none', confidence: 0, searchQuery: q, trigger: 'too_short' }

  const qLower = q.toLowerCase()

  // 1️⃣ أنماط قوية — trigger فوري
  for (const pattern of STRONG_NEWS_PATTERNS) {
    if (pattern.test(q)) {
      return { isTimeSensitive: true, eventType: 'general_news', confidence: 0.95, searchQuery: q, trigger: 'strong_pattern' }
    }
  }
  for (const pattern of ENTITY_EVENT_PATTERNS) {
    if (pattern.test(q)) {
      return { isTimeSensitive: true, eventType: 'entity_event', confidence: 0.90, searchQuery: q, trigger: 'entity_event' }
    }
  }

  // 2️⃣ Score-based detection
  let score = 0
  let eventType = 'general_news'

  // مؤشرات زمنية
  const matchedTemporal = ALL_TEMPORAL.filter(kw => qLower.includes(kw.toLowerCase()))
  if (matchedTemporal.length > 0) {
    score += Math.min(0.4 + (matchedTemporal.length - 1) * 0.05, 0.55)
  }

  // فئات الأحداث
  const eventCats = [
    { kws: EVENT_ACCIDENTS,      type: 'accident',       weight: 0.55 },
    { kws: EVENT_DISASTERS,      type: 'disaster',       weight: 0.55 },
    { kws: EVENT_FIRE_EXPLOSION, type: 'fire_explosion', weight: 0.55 },
    { kws: EVENT_POLITICAL,      type: 'political',      weight: 0.52 },
    { kws: EVENT_SPORTS,         type: 'sports_event',   weight: 0.40 },
    { kws: EVENT_STATUS_CHANGE,  type: 'status_change',  weight: 0.40 },
  ]

  let maxEventWeight = 0
  for (const cat of eventCats) {
    const matched = cat.kws.filter(kw => qLower.includes(kw.toLowerCase()))
    if (matched.length > 0 && cat.weight > maxEventWeight) {
      maxEventWeight = cat.weight
      eventType = cat.type
    }
  }
  score += maxEventWeight

  // Boost: مؤشر زمني + حدث → يؤكد الخبرية
  if (matchedTemporal.length > 0 && maxEventWeight > 0) score += 0.15

  // Boost: استعلام مباشر عن شخصية + مؤشر زمني
  if (/(?:لـ?|على|مع|ل)\s+[A-Za-z\u0600-\u06FF]{3,}/i.test(q) && matchedTemporal.length > 0) score += 0.1

  const confidence = Math.min(score, 1.0)
  return {
    isTimeSensitive: confidence >= 0.5,
    eventType,
    confidence,
    searchQuery: q,
    trigger: 'scored',
  }
}

/**
 * isTimeSensitiveQuery — shorthand boolean check
 * @param {string} query
 * @returns {boolean}
 */
export function isTimeSensitiveQuery(query = '') {
  return detectTimeSensitiveIntent(query).isTimeSensitive
}

/**
 * buildEventSearchQuery — بناء استعلام بحث محسّن للأحداث
 * يحوّل الدارجة إلى عربية فصحى أوضح للمحركات
 * @param {string} query
 * @returns {string}
 */
export function buildEventSearchQuery(query = '') {
  let q = (query || '').trim()

  // تحويل أنماط الدارجة لعبارات بحث أوضح
  const replacements = [
    [/واش\s+صرا\s+ل/gi,       'ما الذي حدث لـ'],
    [/وش\s+صرا\s+ل/gi,        'ما الذي حدث لـ'],
    [/واش\s+صار\s+ل/gi,       'ما الذي حدث لـ'],
    [/وش\s+صار\s+ل/gi,        'ما الذي حدث لـ'],
    [/واش\s+صرا/gi,            'ماذا حدث'],
    [/وش\s+صرا/gi,             'ماذا حدث'],
    [/واش\s+صار/gi,            'ماذا حدث'],
    [/واش\s+صاري/gi,           'ما الأخبار الجديدة'],
    [/واش\s+كاين\s+جديد/gi,   'ما الجديد'],
    [/شنو\s+صرا/gi,            'ماذا حدث'],
    [/شنو\s+جرا/gi,            'ماذا حدث'],
    [/آخر\s+خبر\s+عن/gi,      'آخر أخبار'],
    [/واش\s+راه\s+صاري/gi,     'ما الأخبار الجديدة'],
    [/دروك|درك|توا/gi,         ''],
  ]

  for (const [from, to] of replacements) {
    q = q.replace(from, to)
  }

  return q.replace(/\s+/g, ' ').trim()
}
