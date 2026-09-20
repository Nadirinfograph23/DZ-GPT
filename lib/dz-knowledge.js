/**
 * lib/dz-knowledge.js — قاعدة المعرفة الجزائرية الثابتة
 * Anti-Hallucination Knowledge Base for DZ Agent
 *
 * يُغطي:
 *   - رؤساء الجزائر (1962 → الآن)
 *   - رؤساء الحكومة الجزائريين
 *   - القادة الحاليون للعالم (2025-2026)
 *   - الولايات الجزائرية الـ58 الحقيقية
 *   - الأحداث الوهمية المعروفة
 *   - الأماكن الوهمية المعروفة
 *   - دوال البحث والتحقق
 */

// ══════════════════════════════════════════════════════════════════════════════
// رؤساء الجزائر (1962 → الآن) — بالترتيب الزمني
// ══════════════════════════════════════════════════════════════════════════════
export const DZ_PRESIDENTS = [
  {
    name: 'أحمد بن بلة',
    name_fr: 'Ahmed Ben Bella',
    startYear: 1962, endYear: 1965,
    startMs: Date.UTC(1962, 8, 15),  // 15 Sep 1962
    endMs:   Date.UTC(1965, 5, 19),  // 19 Jun 1965
    notes: 'أول رئيس للجزائر المستقلة، أُطيح به في انقلاب عسكري بقيادة بومدين'
  },
  {
    name: 'هواري بومدين',
    name_fr: 'Houari Boumédiène',
    startYear: 1965, endYear: 1978,
    startMs: Date.UTC(1965, 5, 19),
    endMs:   Date.UTC(1978, 11, 27), // 27 Dec 1978
    notes: 'رئيس مجلس الثورة ثم رئيس الجمهورية، توفي في منصبه'
  },
  {
    name: 'رابح بيطاط',
    name_fr: 'Rabah Bitat',
    startYear: 1978, endYear: 1979,
    startMs: Date.UTC(1978, 11, 27),
    endMs:   Date.UTC(1979, 1, 9),   // 9 Feb 1979
    notes: 'رئيس مؤقت بعد وفاة بومدين'
  },
  {
    name: 'الشاذلي بن جديد',
    name_fr: 'Chadli Bendjedid',
    startYear: 1979, endYear: 1992,
    startMs: Date.UTC(1979, 1, 9),
    endMs:   Date.UTC(1992, 0, 11),  // 11 Jan 1992
    notes: 'استقال في يناير 1992 إثر أزمة الانتخابات'
  },
  {
    name: 'محمد بوضياف',
    name_fr: 'Mohamed Boudiaf',
    startYear: 1992, endYear: 1992,
    startMs: Date.UTC(1992, 0, 16),
    endMs:   Date.UTC(1992, 5, 29),  // 29 Jun 1992
    notes: 'رئيس المجلس الأعلى للدولة، اغتيل في جوان 1992'
  },
  {
    name: 'علي كافي',
    name_fr: 'Ali Kafi',
    startYear: 1992, endYear: 1994,
    startMs: Date.UTC(1992, 6, 2),
    endMs:   Date.UTC(1994, 0, 31),
    notes: 'رئيس المجلس الأعلى للدولة'
  },
  {
    name: 'اليامين زروال',
    name_fr: 'Liamine Zéroual',
    startYear: 1994, endYear: 1999,
    startMs: Date.UTC(1994, 0, 31),
    endMs:   Date.UTC(1999, 3, 27),
    notes: 'انتُخب عام 1995، استقال قبل نهاية ولايته'
  },
  {
    name: 'عبد العزيز بوتفليقة',
    name_fr: 'Abdelaziz Bouteflika',
    startYear: 1999, endYear: 2019,
    startMs: Date.UTC(1999, 3, 27),
    endMs:   Date.UTC(2019, 3, 2),   // 2 Apr 2019
    notes: 'استقال في أبريل 2019 تحت ضغط الحراك الشعبي بعد 20 سنة في السلطة'
  },
  {
    name: 'عبد القادر بن صالح',
    name_fr: 'Abdelkader Bensalah',
    startYear: 2019, endYear: 2019,
    startMs: Date.UTC(2019, 3, 9),
    endMs:   Date.UTC(2019, 11, 19),
    notes: 'رئيس مؤقت لحين انتخاب الرئيس الجديد'
  },
  {
    name: 'عبد المجيد تبون',
    name_fr: 'Abdelmadjid Tebboune',
    startYear: 2019, endYear: null,
    startMs: Date.UTC(2019, 11, 19),
    endMs:   null,
    notes: 'الرئيس الحالي للجمهورية الجزائرية، انتُخب ديسمبر 2019، وأُعيد انتخابه سبتمبر 2024'
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// رؤساء الحكومة الجزائريين (وزراء أول) — مختصر للأحقاب الرئيسية
// ══════════════════════════════════════════════════════════════════════════════
export const DZ_PRIME_MINISTERS = [
  { name: 'أحمد بن بيتور',        startYear: 1999, endYear: 2000 },
  { name: 'علي بن فليس',           startYear: 2000, endYear: 2003 },
  { name: 'أحمد أويحيى',           startYear: 2003, endYear: 2006 },
  { name: 'عبد العزيز بلخادم',     startYear: 2006, endYear: 2008 },
  { name: 'أحمد أويحيى',           startYear: 2008, endYear: 2012 },
  { name: 'عبد المالك سلال',       startYear: 2012, endYear: 2017 },
  { name: 'أحمد أويحيى',           startYear: 2017, endYear: 2019 },
  { name: 'نور الدين بدوي',        startYear: 2019, endYear: 2019 },
  { name: 'عبد العزيز جراد',       startYear: 2019, endYear: 2021 },
  { name: 'أيمن بن عبد الرحمان',  startYear: 2021, endYear: null  },
]

// ══════════════════════════════════════════════════════════════════════════════
// وزراء الخارجية الجزائريين (آخر المعروفين)
// ══════════════════════════════════════════════════════════════════════════════
export const DZ_FOREIGN_MINISTERS = [
  { name: 'أحمد عطاف', startYear: 2021, endYear: null, notes: 'وزير الشؤون الخارجية الحالي (2026)' },
]

// ══════════════════════════════════════════════════════════════════════════════
// قادة العالم الحاليون (2025-2026)
// ══════════════════════════════════════════════════════════════════════════════
export const WORLD_LEADERS_2026 = {
  'الأمم المتحدة': {
    ar: 'أنطونيو غوتيريش', fr: 'António Guterres',
    role_ar: 'الأمين العام للأمم المتحدة',
    since: 2017, notes: 'ولايته الثانية حتى 2026'
  },
  'الولايات المتحدة': {
    ar: 'دونالد ترامب', fr: 'Donald Trump',
    role_ar: 'الرئيس الـ47 للولايات المتحدة',
    since: 2025, notes: 'الولاية الثانية — تولى يناير 2025'
  },
  'فرنسا': {
    ar: 'إيمانويل ماكرون', fr: 'Emmanuel Macron',
    role_ar: 'رئيس الجمهورية الفرنسية',
    since: 2017, notes: 'في ولايته الثانية (2022-2027)'
  },
  'المغرب': {
    ar: 'الملك محمد السادس', fr: 'Mohammed VI',
    role_ar: 'ملك المغرب',
    since: 1999, notes: 'ملك المغرب منذ وفاة والده الملك الحسن الثاني'
  },
  'تونس': {
    ar: 'قيس سعيد', fr: 'Kaïs Saïed',
    role_ar: 'رئيس الجمهورية التونسية',
    since: 2019, notes: 'يتولى الحكم منذ 2019'
  },
  'مصر': {
    ar: 'عبد الفتاح السيسي', fr: 'Abdel Fattah el-Sissi',
    role_ar: 'رئيس جمهورية مصر العربية',
    since: 2014
  },
  'المملكة العربية السعودية': {
    ar: 'الملك سلمان بن عبد العزيز', fr: 'Salman ben Abdelaziz',
    role_ar: 'خادم الحرمين الشريفين ملك المملكة العربية السعودية',
    since: 2015
  },
  'تركيا': {
    ar: 'رجب طيب أردوغان', fr: 'Recep Tayyip Erdoğan',
    role_ar: 'رئيس الجمهورية التركية',
    since: 2014
  },
  'ألمانيا': {
    ar: 'فريدريش ميرتس', fr: 'Friedrich Merz',
    role_ar: 'المستشار الألماني',
    since: 2025
  },
  'المملكة المتحدة': {
    ar: 'كير ستارمر', fr: 'Keir Starmer',
    role_ar: 'رئيس وزراء المملكة المتحدة',
    since: 2024
  },
}

// رؤساء سابقون للعالم
export const WORLD_FORMER_LEADERS = {
  'فرنسا': [
    { ar: 'فرانسوا هولاند', endYear: 2017, notes: 'قبل ماكرون مباشرة' },
    { ar: 'نيكولا ساركوزي', startYear: 2007, endYear: 2012 },
    { ar: 'جاك شيراك', startYear: 1995, endYear: 2007 },
  ],
  'الولايات المتحدة': [
    { ar: 'جو بايدن', startYear: 2021, endYear: 2025, notes: 'قبل ترامب الثانية مباشرة' },
    { ar: 'دونالد ترامب', startYear: 2017, endYear: 2021, notes: 'الولاية الأولى' },
    { ar: 'باراك أوباما', startYear: 2009, endYear: 2017 },
    { ar: 'جورج بوش الابن', startYear: 2001, endYear: 2009 },
    { ar: 'بيل كلينتون', startYear: 1993, endYear: 2001 },
  ],
}

// ══════════════════════════════════════════════════════════════════════════════
// الولايات الجزائرية الـ58 الحقيقية
// ══════════════════════════════════════════════════════════════════════════════
export const REAL_DZ_WILAYAS = new Set([
  'أدرار', 'الشلف', 'الأغواط', 'أم البواقي', 'باتنة', 'بجاية', 'بسكرة', 'بشار',
  'البليدة', 'البويرة', 'تمنراست', 'تبسة', 'تلمسان', 'تيارت', 'تيزي وزو', 'الجزائر',
  'الجلفة', 'جيجل', 'سطيف', 'سعيدة', 'سكيكدة', 'سيدي بلعباس', 'عنابة', 'قالمة',
  'قسنطينة', 'المدية', 'مستغانم', 'المسيلة', 'معسكر', 'ورقلة', 'وهران', 'البيض',
  'إليزي', 'برج بوعريريج', 'بومرداس', 'الطارف', 'تندوف', 'تسمسيلت', 'الوادي',
  'خنشلة', 'سوق أهراس', 'تيبازة', 'ميلة', 'عين الدفلى', 'النعامة', 'عين تموشنت',
  'غرداية', 'غليزان',
  // الولايات الجديدة (2019)
  'تيميمون', 'برج باجي مختار', 'أولاد جلال', 'بني عباس', 'عين صالح',
  'عين قزام', 'تقرت', 'جانت', 'المغير', 'المنيعة',
])

// ══════════════════════════════════════════════════════════════════════════════
// أنماط الأحداث الوهمية المعروفة
// ══════════════════════════════════════════════════════════════════════════════
export const FICTIONAL_DZ_EVENT_PATTERNS = [
  /ثورة الجزائر الثانية/i,
  /حرب.{0,20}(البرتغال|المكسيك|كندا|البرازيل|الهند|اليابان|كوريا).{0,20}(الجزائر|جزائرية?)/i,
  /(الجزائر|جزائرية?).{0,20}حرب.{0,20}(البرتغال|المكسيك|كندا|البرازيل|الهند)/i,
  /معاهدة وهران.{0,30}(20\d{2}|1[89]\d{2})/i,
  /معاهدة.{0,20}(وهران|قسنطينة|الجزائر).{0,30}(كندا|البرازيل|المكسيك|اليابان)/i,
  /انقلاب الجزائر.{0,10}(202[2-9]|203\d)/i,
  /الجزائر.*ضد.*(البرازيل|الأرجنتين|ألمانيا|إيطاليا).*(نهائي|كأس العالم)/i,
  /(نهائي|كأس العالم).*(الجزائر.*البرازيل|البرازيل.*الجزائر)/i,
]

// أماكن وهمية متكررة
export const FICTIONAL_DZ_PLACES = [
  { pattern: /مدينة الزمرد/i, reason: 'لا توجد مدينة بهذا الاسم في الجزائر' },
  { pattern: /ولاية عين النور/i, reason: '"عين النور" ليست من بين الولايات الجزائرية الـ58' },
  { pattern: /مدينة الشروق العظمى/i, reason: '"الشروق العظمى" ليست مدينة — الشروق منطقة سكنية في الجزائر العاصمة' },
  { pattern: /مطار الأمير خالد الدولي/i, reason: 'لا يوجد مطار بهذا الاسم في الجزائر' },
  { pattern: /مطار الأمير (سعيد|ناصر|فارس) الدولي/i, reason: 'لا يوجد مطار جزائري بهذا الاسم' },
]

// ══════════════════════════════════════════════════════════════════════════════
// دوال البحث والتحقق
// ══════════════════════════════════════════════════════════════════════════════

/**
 * يعيد رئيس الجزائر في سنة معينة
 * @param {number} year
 * @returns {object|null} — رئيس أو { error: 'pre_independence' }
 */
export function getAlgeriaPresidentByYear(year) {
  const y = parseInt(year)
  if (isNaN(y)) return null
  if (y < 1962) return { error: 'pre_independence', year: y }
  const now = new Date().getFullYear()
  if (y > now) return { error: 'future', year: y }

  // إذا كانت السنة 1978، هواري بومدين مات في ديسمبر — نعيده هو (حكم معظم العام)
  const matches = DZ_PRESIDENTS.filter(p => {
    const startY = p.startYear
    const endY = p.endYear ?? (now + 1)
    return y >= startY && y < endY
  })

  if (matches.length === 0) return null
  // إذا كانت هناك رؤساء متعددون في نفس العام (تحول)، نعيد الأهم
  return matches[matches.length - 1]
}

/**
 * يعيد رئيس الحكومة في سنة معينة
 */
export function getAlgeriaPMByYear(year) {
  const y = parseInt(year)
  if (isNaN(y)) return null
  if (y < 1962) return { error: 'pre_independence', year: y }
  const now = new Date().getFullYear()
  if (y > now) return { error: 'future', year: y }

  const matches = DZ_PRIME_MINISTERS.filter(p => {
    const startY = p.startYear
    const endY = p.endYear ?? (now + 1)
    return y >= startY && y <= endY
  })
  return matches.length > 0 ? matches[matches.length - 1] : null
}

/**
 * يعيد الرئيس السابق (قبل شخص معين)
 */
export function getAlgeriaPredecessor(name) {
  const norm = (s) => s.replace(/\s+/g, ' ').trim()
  const idx = DZ_PRESIDENTS.findIndex(p =>
    norm(p.name).includes(norm(name)) || norm(name).includes(norm(p.name))
  )
  if (idx <= 0) return null
  return DZ_PRESIDENTS[idx - 1]
}

/**
 * هل السنة مستقبلية؟
 */
export function isFutureYear(year) {
  return parseInt(year) > new Date().getFullYear()
}

/**
 * هل الحدث المذكور وهمي؟
 */
export function isFictionalDZEvent(text) {
  return FICTIONAL_DZ_EVENT_PATTERNS.find(p => p.test(text)) || null
}

/**
 * هل المكان وهمي؟
 */
export function isFictionalDZPlace(text) {
  return FICTIONAL_DZ_PLACES.find(p => p.pattern.test(text)) || null
}

/**
 * هل الولاية المذكورة موجودة؟
 */
export function isDZWilayaReal(name) {
  const clean = name.replace(/^(ولاية\s+|في\s+|ب)/i, '').trim()
  return REAL_DZ_WILAYAS.has(clean)
}

/**
 * هل هو سؤال ما قبل الاستقلال؟
 */
export function isPreIndependenceQuery(text, year) {
  const y = parseInt(year)
  if (!isNaN(y) && y < 1962) return true
  // أنماط صريحة
  if (/قبل الاستقلال|قبل استقلال الجزائر|إبان الاستعمار|في عهد الاستعمار/i.test(text)) return true
  // سنة قبل 1830 مع ذكر الجزائر
  if (/\b(1[0-7]\d{2}|18[012]\d)\b/.test(text) && /الجزائر|جزائر/i.test(text)) return true
  return false
}

// ══════════════════════════════════════════════════════════════════════════════
// استخراج السنة من رسالة المستخدم
// ══════════════════════════════════════════════════════════════════════════════
export function extractYearFromMessage(msg) {
  // بحث عن أرقام 4 خانات
  const matches = msg.match(/\b(1[5-9]\d{2}|20[0-9]{2})\b/g)
  if (matches) return parseInt(matches[0])
  // تواريخ مكتوبة بالحروف مثل "سنة ألف وتسعمائة..."
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// كشف سؤال الرئيس حسب السنة
// ══════════════════════════════════════════════════════════════════════════════
export function detectPresidentYearQuery(msg) {
  const lq = msg.trim()

  // نمط: "من كان رئيس الجزائر سنة XXXX" / "شكون كان رئيس الجزائر في XXXX"
  const presidentYearRE = /(?:من\s+كان|شكون\s+كان|qui\s+était|quel\s+était)\s+(?:ال)?رئيس\s+(?:ال)?جزائر\s+(?:سنة|في\s+سنة|عام|في\s+عام|يوم)?\s*(\d{4})/i
  const m1 = lq.match(presidentYearRE)
  if (m1) return { type: 'president_year', year: parseInt(m1[1]) }

  // نمط: "رئيس الجزائر سنة 1985"
  const m2 = lq.match(/رئيس\s+(?:ال)?جزائر\s+(?:سنة|في|عام)?\s*(\d{4})/i)
  if (m2) return { type: 'president_year', year: parseInt(m2[1]) }

  // نمط: "من كان رئيس الجزائر قبل تبون"
  if (/(?:من\s+كان|شكون\s+كان)\s+رئيس\s+(?:ال)?جزائر\s+قبل\s+تبون/i.test(lq) ||
      /شكون\s+كان\s+(?:ال)?رئيس\s+قبل\s+تبون/i.test(lq)) {
    return { type: 'president_before', name: 'تبون' }
  }

  // نمط: "من كان رئيس الجزائر قبل عبد المجيد تبون"
  // نستخدم \u0621-\u064A لاستثناء علامات الترقيم العربية (؟ = U+061F)
  const m3 = lq.match(/(?:من\s+كان|شكون\s+كان)\s+رئيس.{0,20}قبل\s+([\u0621-\u064A\s]{3,30})/i)
  if (m3) {
    const _captured = m3[1].trim().replace(/[\s؟?!،,\.]+$/, '')
    if (_captured.length >= 3) return { type: 'president_before', name: _captured }
  }

  // نمط: "من كان رئيس الجزائر قبل بوتفليقة" (fallback صريح)
  if (/قبل\s+بوتفليقة/i.test(lq) && /رئيس/i.test(lq)) {
    return { type: 'president_before', name: 'بوتفليقة' }
  }

  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// كشف سؤال رئيس الحكومة حسب السنة
// ══════════════════════════════════════════════════════════════════════════════
export function detectPMYearQuery(msg) {
  const m = msg.match(/(?:من\s+كان|شكون\s+كان)\s+(?:ال)?وزير\s+الأول|رئيس\s+(?:ال)?حكومة.{0,30}(?:سنة|في|عام)\s*(\d{4})/i)
  if (m && m[1]) return { type: 'pm_year', year: parseInt(m[1]) }
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// ردود جاهزة للأسئلة الثابتة
// ══════════════════════════════════════════════════════════════════════════════

export function buildPresidentYearResponse(year) {
  const result = getAlgeriaPresidentByYear(year)
  if (!result) return null

  if (result.error === 'pre_independence') {
    return [
      `## ⚠️ تصحيح تاريخي`,
      ``,
      `**الجزائر لم تكن دولةً مستقلة عام ${year}.**`,
      ``,
      year >= 1830
        ? `كانت الجزائر في تلك الفترة تحت **الاحتلال الفرنسي** (1830–1962)، ولم يكن لها رئيس جمهورية.`
        : `كانت الجزائر في تلك الفترة إمّا تحت الحكم العثماني أو كيانات تقليدية سابقة.`,
      ``,
      `🗓️ **الاستقلال:** 5 يوليو 1962 — أول رئيس: **أحمد بن بلة** (سبتمبر 1962).`,
      `📚 **المصدر:** حقيقة تاريخية ثابتة`,
    ].join('\n')
  }

  if (result.error === 'future') {
    return `⚠️ **عام ${year} لم يأتِ بعد** — لا يمكنني الإجابة عن أحداث مستقبلية.`
  }

  const current = result.endYear === null
  const endNote = current
    ? `(لا يزال في منصبه حتى الآن)`
    : `(غادر السلطة عام ${result.endYear})`

  return [
    `## 🇩🇿 رئيس الجزائر عام ${year}`,
    ``,
    `**${result.name}** *(${result.name_fr})*`,
    ``,
    `🗓️ تولّى السلطة: **${result.startYear}** — انتهت ولايته: **${result.endYear ?? 'الآن'}** ${endNote}`,
    `📝 ${result.notes}`,
    ``,
    `⚡ **المصدر:** قاعدة بيانات تاريخية ثابتة — ثقة 100%`,
  ].join('\n')
}

export function buildPresidentBeforeResponse(name) {
  const predecessor = getAlgeriaPredecessor(name)
  if (!predecessor) return null

  const current = predecessor.endYear === null
  return [
    `## 🇩🇿 الرئيس قبل ${name}`,
    ``,
    `**${predecessor.name}** *(${predecessor.name_fr})*`,
    ``,
    `🗓️ حكم من **${predecessor.startYear}** إلى **${predecessor.endYear ?? 'الآن'}**`,
    `📝 ${predecessor.notes}`,
    ``,
    `⚡ **المصدر:** قاعدة بيانات تاريخية ثابتة`,
  ].join('\n')
}

export function buildPMYearResponse(year) {
  const result = getAlgeriaPMByYear(year)
  if (!result) return null

  if (result.error === 'pre_independence') {
    return `⚠️ **تصحيح تاريخي:** الجزائر لم تكن دولةً مستقلة عام ${year} — لا وجود لرئيس حكومة جزائري في تلك الحقبة.`
  }

  return [
    `## 🇩🇿 رئيس الحكومة الجزائرية عام ${year}`,
    ``,
    `**${result.name}**`,
    ``,
    `🗓️ في منصبه من ${result.startYear} إلى ${result.endYear ?? 'الآن'}`,
    ``,
    `⚡ **المصدر:** قاعدة بيانات ثابتة`,
  ].join('\n')
}
