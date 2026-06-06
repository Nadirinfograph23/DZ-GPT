/**
 * DZ-GPT — Search Query Optimizer for SearXNG v2
 * محسّن استعلامات البحث الذكي — متخصص في الأحداث الزمنية
 *
 * Intent Types:
 *   FUTURE_EVENT   → متى سيـ / موعد / قادم / مرتقب
 *   PAST_EVENT     → آخر حادثة / ما الذي حدث / آخر خبر
 *   BREAKING_NEWS  → عاجل / الآن / للتو
 *   SPORTS_TIME    → متى ستلعب / موعد المباراة / ضد
 *   EXAM_SCHEDULE  → بكالوريا / امتحان / موعد الامتحان
 *   BIOGRAPHY      → من هو / سيرة
 *   HISTORICAL     → تاريخي / في عام
 *   GENERAL        → عام
 */

import { searchWithSearXNG } from './search-decision-tree.js'

// ─── التاريخ الحالي (مُحدَّث عند كل استدعاء) ─────────────────────────────────

function getNow() {
  const now = new Date()
  return {
    year:       now.getFullYear(),
    month:      now.getMonth() + 1,
    monthAr:    now.toLocaleString('ar', { month: 'long' }),
    monthEn:    now.toLocaleString('en', { month: 'long' }),
    dayAr:      now.toLocaleDateString('ar-DZ', { day: 'numeric', month: 'long', year: 'numeric' }),
    iso:        now.toISOString().slice(0, 10),
  }
}

// ─── أنواع الاستعلام ──────────────────────────────────────────────────────────

const INTENT = {
  FUTURE_EVENT:   'future_event',
  PAST_EVENT:     'past_event',
  BREAKING_NEWS:  'breaking_news',
  SPORTS_TIME:    'sports_time',
  SPORTS_RESULT:  'sports_result',
  EXAM_SCHEDULE:  'exam_schedule',
  BIOGRAPHY:      'biography',
  HISTORICAL:     'historical',
  LOCATION:       'location',
  GENERAL:        'general',
}

// ─── أنماط الكشف (بالترتيب الأولوي) ─────────────────────────────────────────

const INTENT_PATTERNS = [
  // امتحانات / مواعيد رسمية
  {
    type: INTENT.EXAM_SCHEDULE,
    patterns: [
      /(?:متى|موعد|تاريخ|جدول)\s*(?:بكالوريا|باك|bac|امتحان|مسابقة|اختبار)/i,
      /(?:بكالوريا|باك|bac)\s*(?:متى|موعد|تاريخ|جدول|يبدأ|تبدأ)/i,
      /(?:بكالوريا|امتحانات)\s*\d{4}/i,
    ],
  },
  // رياضة — موعد مباراة قادمة
  {
    type: INTENT.SPORTS_TIME,
    patterns: [
      /(?:متى|موعد|تاريخ|مباراة|توقيت)\s*(?:ستلعب|يلعب|تلعب|ضد|أمام|مقابل)/i,
      /(?:ستلعب|يلعب|تلعب)\s*\S+\s*(?:ضد|أمام|مقابل)/i,
      /(?:ضد|أمام|مقابل)\s*\S+\s*(?:متى|موعد|توقيت)/i,
      /منتخب\s*\S+\s*(?:ضد|أمام|مقابل)/i,
      /موعد\s*(?:المباراة|مباراة|لقاء)/i,
    ],
  },
  // رياضة — نتيجة / آخر مباراة
  {
    type: INTENT.SPORTS_RESULT,
    patterns: [
      /(?:نتيجة|نتائج|ملخص|أهداف|هداف)\s*مباراة/i,
      /(?:مباراة|لقاء)\s*(?:أمس|البارحة|اليوم)/i,
      /(?:دوري|بطولة|كأس)\s*(?:ترتيب|جدول)/i,
    ],
  },
  // حدث مستقبلي — متى سيـ
  {
    type: INTENT.FUTURE_EVENT,
    patterns: [
      /متى\s*(?:سيـ|ستـ|سي|ست|سـ)/i,
      /(?:موعد|تاريخ)\s*(?:زيارة|لقاء|قمة|اجتماع|توقيع|انطلاق|إطلاق|افتتاح)/i,
      /(?:مرتقب|قادم|المقبل|القادم|المتوقع|سيجري|ستجري|سيزور|ستزور)/i,
      /متى\s+(?:سيتم|ستبدأ|يبدأ|تبدأ|سيبدأ|ينطلق|تنطلق)/i,
    ],
  },
  // حدث ماضٍ / آخر خبر
  {
    type: INTENT.PAST_EVENT,
    patterns: [
      /آخر\s*(?:حادثة|حدث|خبر|تصريح|تغريدة|قرار|اتفاق)/i,
      /(?:ماذا|ما الذي)\s*(?:حدث|جرى|قاله|فعله)/i,
      /(?:أحدث|آخر)\s*(?:أخبار|تطورات)/i,
      /(?:جرت|حدثت|وقعت)\s*له|لها|لـ/i,
    ],
  },
  // أخبار عاجلة
  {
    type: INTENT.BREAKING_NEWS,
    patterns: [
      /عاجل|breaking|flash|للتو|منذ قليل|خبر عاجل/i,
    ],
  },
  // سيرة / شخصية
  {
    type: INTENT.BIOGRAPHY,
    patterns: [
      /(?:من هو|من هي|سيرة|ترجمة|نبذة|biography|who is)/i,
      /(?:ولد|مواليد|born|عمر)\s/i,
    ],
  },
  // تاريخي
  {
    type: INTENT.HISTORICAL,
    patterns: [
      /(?:ماذا حدث في|أزمة|ثورة|معركة|انقلاب)\s/i,
      /في\s+عام\s+\d{4}/i,
    ],
  },
  // موقع
  {
    type: INTENT.LOCATION,
    patterns: [
      /(?:أين|where is|موقع|عاصمة|capital)\s/i,
    ],
  },
]

export function classifyIntent(query = '') {
  const q = query.trim()
  for (const { type, patterns } of INTENT_PATTERNS) {
    if (patterns.some(p => p.test(q))) return type
  }
  return INTENT.GENERAL
}

// ─── استخراج الكيانات (يدعم كيانين مزدوجين) ──────────────────────────────────

const KNOWN_ENTITIES = [
  // سياسة دولية
  { ar: 'ترامب',       en: 'Trump',        alt: ['ترمب', 'donald trump', 'trump'] },
  { ar: 'بايدن',       en: 'Biden',         alt: ['joe biden'] },
  { ar: 'بوتين',       en: 'Putin',         alt: ['فلاديمير بوتين', 'vladimir putin'] },
  { ar: 'ماكرون',      en: 'Macron',        alt: ['إيمانويل ماكرون', 'emmanuel macron'] },
  { ar: 'نتنياهو',     en: 'Netanyahu',     alt: ['بيبي نتنياهو'] },
  { ar: 'زيلينسكي',    en: 'Zelensky',      alt: ['zelenskyy', 'ukraine'] },
  { ar: 'أردوغان',     en: 'Erdogan',       alt: ['طيب أردوغان', 'recep tayyip erdogan'] },
  { ar: 'تبون',        en: 'Tebboune',      alt: ['عبد المجيد تبون'] },
  { ar: 'كيم جونغ',    en: 'Kim Jong Un',   alt: ['كوريا الشمالية'] },
  { ar: 'لابن',        en: 'Le Pen',        alt: ['مارين لوبان', 'marine le pen'] },
  { ar: 'ميلوني',      en: 'Meloni',        alt: ['giorgia meloni'] },
  { ar: 'شولتس',       en: 'Scholz',        alt: ['أولاف شولتس'] },
  // منتخبات / فرق
  { ar: 'الجزائر',     en: 'Algeria',       alt: ['المنتخب الجزائري', 'الخضر', 'dz', 'algérie'] },
  { ar: 'المغرب',      en: 'Morocco',       alt: ['المنتخب المغربي', 'maroc'] },
  { ar: 'فرنسا',       en: 'France',        alt: ['المنتخب الفرنسي'] },
  { ar: 'إسبانيا',     en: 'Spain',         alt: ['espagne', 'españa'] },
  { ar: 'بوليفيا',     en: 'Bolivia',       alt: ['bolivie'] },
  { ar: 'مصر',         en: 'Egypt',         alt: ['المنتخب المصري', 'egypte'] },
  { ar: 'تونس',        en: 'Tunisia',       alt: ['المنتخب التونسي', 'tunisie'] },
  { ar: 'السنغال',     en: 'Senegal',       alt: ['sénégal'] },
  { ar: 'نيجيريا',     en: 'Nigeria',       alt: [] },
  // رياضيون
  { ar: 'محرز',        en: 'Mahrez',        alt: ['رياض محرز', 'riyad mahrez'] },
  { ar: 'مبابي',       en: 'Mbappe',        alt: ['كيليان مبابي', 'kylian mbappe'] },
  { ar: 'رونالدو',     en: 'Ronaldo',       alt: ['كريستيانو', 'cristiano'] },
  { ar: 'ميسي',        en: 'Messi',         alt: ['ليونيل ميسي', 'lionel messi'] },
  { ar: 'بنزيمة',      en: 'Benzema',       alt: ['كريم بنزيمة', 'karim benzema'] },
  // أحداث / مناطق
  { ar: 'غزة',         en: 'Gaza',          alt: ['فلسطين', 'palestine'] },
  { ar: 'روسيا',       en: 'Russia',        alt: ['الاتحاد الروسي', 'russie'] },
  { ar: 'أوكرانيا',    en: 'Ukraine',       alt: ['الحرب الأوكرانية'] },
  { ar: 'سوريا',       en: 'Syria',         alt: ['syrie'] },
  { ar: 'ليبيا',       en: 'Libya',         alt: ['libye'] },
  { ar: 'السودان',     en: 'Sudan',         alt: ['soudan'] },
  { ar: 'إيران',       en: 'Iran',          alt: [] },
  { ar: 'إسرائيل',     en: 'Israel',        alt: ['israël'] },
  // مصطلحات دراسية
  { ar: 'بكالوريا',    en: 'Baccalaureate', alt: ['باك', 'bac', 'البكالوريا'] },
  { ar: 'شهادة التعليم المتوسط', en: 'BEM', alt: ['bem', 'التعليم المتوسط'] },
]

/**
 * extractEntities — يستخرج حتى كيانين (مثال: الجزائر + بوليفيا)
 */
export function extractEntities(query = '') {
  const ql = query.toLowerCase()
  const found = []

  for (const entity of KNOWN_ENTITIES) {
    const allForms = [
      entity.ar.toLowerCase(),
      entity.en.toLowerCase(),
      ...entity.alt.map(a => a.toLowerCase()),
    ]
    if (allForms.some(f => f.length > 1 && ql.includes(f))) {
      found.push(entity)
      if (found.length >= 2) break
    }
  }

  if (found.length === 0) {
    // استخراج عام — أطول كلمة عربية بعد حذف stop words
    const STOP = new Set([
      'متى', 'سيـ', 'ستـ', 'هل', 'ما', 'من', 'أين', 'كيف', 'لماذا',
      'آخر', 'حادثة', 'حدث', 'خبر', 'أخبار', 'جرت', 'حدثت',
      'موعد', 'تاريخ', 'جدول', 'سيزور', 'ستلعب', 'يلعب', 'ضد', 'أمام',
      'في', 'من', 'إلى', 'على', 'عن', 'مع', 'بـ', 'لـ',
    ])
    const words = query.split(/\s+/).filter(w =>
      w.length >= 3 && !STOP.has(w) && /[\u0600-\u06FF]/.test(w)
    )
    const longest = words.sort((a, b) => b.length - a.length)[0] || query
    return [{ ar: longest, en: longest, alt: [] }]
  }

  return found
}

// للتوافق مع الكود القديم
export function extractEntity(query = '') {
  return extractEntities(query)[0] || { ar: query, en: query, alt: [] }
}

// ─── مولّد الاستعلامات الزمنية الذكية ─────────────────────────────────────────

/**
 * generateQueryVariations — يولّد استعلامات SearXNG محسّنة حسب النية والكيانات
 */
export function generateQueryVariations(query, intent, entities) {
  const { year, month, monthAr, monthEn } = getNow()

  const primary   = entities[0] || { ar: '', en: '' }
  const secondary = entities[1] || null

  const ar  = primary.ar
  const en  = primary.en
  const ar2 = secondary?.ar || ''
  const en2 = secondary?.en || ''

  // ── استعلامات مشتركة — الأصلي دائماً أولاً ──────────────────────────────
  const BASE = [query]  // الاستعلام الأصلي هو الأفضل دائماً

  switch (intent) {

    // ── حدث مستقبلي: متى سيـ / موعد / زيارة ─────────────────────────────
    case INTENT.FUTURE_EVENT: {
      // استخرج الفعل/الحدث من الاستعلام
      const eventWords = query
        .replace(/متى|سيـ|ستـ|سي|ست|موعد|تاريخ|يبدأ|تبدأ|سيتم/gi, '')
        .replace(ar, '').replace(ar2, '').trim()

      return [
        ...BASE,
        ar2 ? `${ar} ${ar2} ${year}` : `موعد ${ar} ${year}`,
        ar2 ? `${en} ${en2} ${year}` : `${en} ${year} date`,
        ar2 ? `${ar} ${ar2} ${monthAr}` : `${ar} ${monthAr} ${year}`,
        ar2 ? `${en} ${en2} when ${year}` : `when will ${en} ${year}`,
        ar2 ? `${ar} زد ${ar2}` : '',
        `${ar} موعد مقرر ${year}`,
        `${en} schedule ${year}`,
        ar2 ? `${en} vs ${en2} ${year}` : `${en} upcoming ${year}`,
      ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
    }

    // ── رياضة — موعد مباراة قادمة ─────────────────────────────────────────
    case INTENT.SPORTS_TIME: {
      return [
        ...BASE,
        ar2 ? `${ar} ضد ${ar2}` : `${ar} مباراة ${year}`,
        ar2 ? `${ar} vs ${ar2}` : `${ar} next match`,
        ar2 ? `${ar} ${ar2} موعد` : `موعد مباراة ${ar}`,
        ar2 ? `${en} vs ${en2} date ${year}` : `${en} match schedule ${year}`,
        ar2 ? `${en} vs ${en2} ${monthEn} ${year}` : `${en} fixture ${year}`,
        ar2 ? `${ar} ${ar2} ${year}` : `${ar} موعد ${monthAr} ${year}`,
        ar2 ? `${ar} مقابل ${ar2} متى` : `${ar} جدول المباريات`,
      ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
    }

    // ── رياضة — نتيجة / ملخص ──────────────────────────────────────────────
    case INTENT.SPORTS_RESULT: {
      return [
        ...BASE,
        ar2 ? `${ar} ${ar2} نتيجة` : `نتيجة ${ar}`,
        ar2 ? `${ar} vs ${ar2} result` : `${ar} result`,
        `${ar} اليوم ${year}`,
        ar2 ? `${en} vs ${en2} score` : `${en} score today`,
        ar2 ? `${ar} ضد ${ar2} ملخص` : `ملخص ${ar}`,
      ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
    }

    // ── جدول امتحانات ─────────────────────────────────────────────────────
    case INTENT.EXAM_SCHEDULE: {
      return [
        ...BASE,
        `${ar} ${year} الجزائر`,
        `موعد ${ar} ${year}`,
        `جدول ${ar} ${year}`,
        `تاريخ ${ar} ${year} الجزائر`,
        `${en} ${year} Algeria`,
        `${ar} ${year} وزارة التربية`,
        `${ar} موعد الجزائر ${monthAr} ${year}`,
        `baccalauréat Algérie ${year} date`,
      ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
    }

    // ── حدث ماضٍ ──────────────────────────────────────────────────────────
    case INTENT.PAST_EVENT: {
      return [
        ...BASE,
        `آخر أخبار ${ar}`,
        `${ar} ${year}`,
        `${ar} ${monthAr} ${year}`,
        `${en} latest news`,
        `${en} ${year}`,
        `${en} recent event ${year}`,
        `${ar} أخبار عاجلة`,
        `${en} news ${monthEn} ${year}`,
      ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
    }

    // ── أخبار عاجلة ───────────────────────────────────────────────────────
    case INTENT.BREAKING_NEWS: {
      return [
        ...BASE,
        `${ar} عاجل`,
        `${ar} الآن ${year}`,
        `${en} breaking news`,
        `${en} just now`,
        `${ar} ${monthAr} ${year}`,
        `${en} today ${year}`,
      ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
    }

    // ── سيرة شخصية ────────────────────────────────────────────────────────
    case INTENT.BIOGRAPHY: {
      return [
        ...BASE,
        `من هو ${ar}`,
        `${ar} سيرة ذاتية`,
        `${en} biography`,
        `${en} profile`,
        `${en} who is`,
      ].filter(Boolean)
    }

    // ── تاريخي ────────────────────────────────────────────────────────────
    case INTENT.HISTORICAL: {
      return [
        ...BASE,
        `${ar} تاريخ`,
        `${en} history`,
        `${en} Wikipedia`,
      ].filter(Boolean)
    }

    // ── عام ───────────────────────────────────────────────────────────────
    default: {
      return [
        ...BASE,
        `${ar} ${year}`,
        ar2 ? `${ar} ${ar2}` : `${ar} معلومات`,
        `${en} ${year}`,
        ar2 ? `${en} ${en2}` : `${en}`,
      ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i)
    }
  }
}

// ─── كشف الكلمات الزمنية في النتائج ─────────────────────────────────────────

const DATE_KEYWORDS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  'جانفي', 'فيفري', 'مارس', 'أفريل', 'جوان', 'جويلية', 'أوت',
  'موعد', 'تاريخ', 'جدول', 'سيكون', 'ستكون', 'مقرر', 'مرتقب',
  'في', 'يوم', 'الشهر', 'القادم', 'المقبل',
]
const DATE_KEYWORDS_EN = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'scheduled', 'planned', 'date', 'upcoming', 'confirmed', 'set for',
]
const DATE_PATTERN = /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b|\b\d{4}\b|\b\d{1,2}\s+(?:يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)\b/i

function hasDateInfo(text = '') {
  const t = text.toLowerCase()
  return DATE_PATTERN.test(t) ||
    DATE_KEYWORDS_AR.some(k => t.includes(k)) ||
    DATE_KEYWORDS_EN.some(k => t.includes(k))
}

// ─── فلتر الصلة ───────────────────────────────────────────────────────────────

function isRelevant(result, entities) {
  const text = `${result.title} ${result.snippet}`.toLowerCase()
  return entities.some(entity => {
    const arLow = (entity.ar || '').toLowerCase()
    const enLow = (entity.en || '').toLowerCase()
    const altMatch = (entity.alt || []).some(a => text.includes(a.toLowerCase()))
    return (arLow.length > 1 && text.includes(arLow)) ||
           (enLow.length > 1 && text.includes(enLow)) ||
           altMatch ||
           (arLow.length > 4 && text.includes(arLow.slice(0, -1)))
  })
}

// ─── ترتيب الصلة + الحداثة + المعلومات الزمنية ───────────────────────────────

function rankResults(results, entities, intent) {
  const isTimeQuery = [
    INTENT.FUTURE_EVENT, INTENT.SPORTS_TIME,
    INTENT.EXAM_SCHEDULE, INTENT.PAST_EVENT,
  ].includes(intent)

  return results
    .filter(r => r.title && r.url)
    .map(r => {
      let score = 0
      const titleLow   = (r.title   || '').toLowerCase()
      const snippetLow = (r.snippet || '').toLowerCase()
      const allText    = `${titleLow} ${snippetLow}`

      // ── صلة بالكيانات ──────────────────────────────────────────────────
      for (const entity of entities) {
        const arLow = (entity.ar || '').toLowerCase()
        const enLow = (entity.en || '').toLowerCase()
        if (arLow && titleLow.includes(arLow))   score += 6
        if (enLow && titleLow.includes(enLow))   score += 5
        if (arLow && snippetLow.includes(arLow)) score += 3
        if (enLow && snippetLow.includes(enLow)) score += 2
        // الأشكال البديلة
        for (const alt of (entity.alt || [])) {
          if (allText.includes(alt.toLowerCase())) score += 2
        }
      }

      // ── معلومات زمنية في النص (مهم لاستعلامات "متى") ─────────────────
      if (isTimeQuery && hasDateInfo(allText)) score += 8

      // ── حداثة النشر ───────────────────────────────────────────────────
      if (r.date) {
        const age = Date.now() - new Date(r.date).getTime()
        if      (age < 3_600_000)      score += 7  // < ساعة
        else if (age < 86_400_000)     score += 5  // < يوم
        else if (age < 604_800_000)    score += 3  // < أسبوع
        else if (age < 2_592_000_000)  score += 1  // < شهر
      }

      // ── لغة عربية = أولوية ────────────────────────────────────────────
      if (/[\u0600-\u06FF]/.test(r.title)) score += 2

      // ── مصادر موثوقة ──────────────────────────────────────────────────
      const trusted = [
        'bbc', 'reuters', 'aljazeera', 'france24', 'ap.org', 'afp',
        'elkhabar', 'ennahar', 'aps.dz', 'tsa-algerie', 'echorouk',
        'elbilad', 'algerie360', 'radioalgerie', 'elheddaf',
        'fifa.com', 'caf', 'faf.dz', 'lfp.dz',
        'education.gov.dz', 'onec.dz',
      ]
      if (trusted.some(t => (r.url || '').toLowerCase().includes(t))) score += 4

      return { ...r, _score: score, _hasDate: hasDateInfo(allText) }
    })
    .sort((a, b) => b._score - a._score)
}

// ─── إزالة التكرار ────────────────────────────────────────────────────────────

function dedup(results) {
  const seen = new Set()
  return results.filter(r => {
    const key = (r.title || '').toLowerCase().replace(/\s+/g, ' ').slice(0, 80)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── التحقق من المصادر ────────────────────────────────────────────────────────

function verifyConsensus(results, entities) {
  const relevant = results.filter(r => isRelevant(r, entities))
  const uniqueSources = new Set(relevant.map(r => {
    try { return new URL(r.url).hostname } catch { return r.source || 'unknown' }
  }))
  return {
    verified: uniqueSources.size >= 2,
    count:    uniqueSources.size,
    sources:  [...uniqueSources].slice(0, 6),
  }
}

// ─── بناء السياق للـ LLM ──────────────────────────────────────────────────────

const INTENT_LABELS = {
  future_event:   '📅 حدث مستقبلي',
  past_event:     '📰 حدث ماضٍ',
  breaking_news:  '🔴 خبر عاجل',
  sports_time:    '⚽ موعد رياضي',
  sports_result:  '🏆 نتيجة رياضية',
  exam_schedule:  '🎓 جدول امتحانات',
  biography:      '👤 سيرة شخصية',
  historical:     '📜 حدث تاريخي',
  location:       '📍 موقع / مكان',
  general:        '🌐 استعلام عام',
}

export function buildOptimizedContext({ results, query, entities, intent, consensus, noResult }) {
  const { dayAr } = getNow()
  const primary = entities[0] || { ar: query, en: query }

  if (noResult) {
    return `\n\n---\n## 🔍 نتائج البحث\n📅 ${dayAr}\n\n` +
           `⚠️ **لم أجد نتائج موثوقة مرتبطة بطلبك.**\n` +
           `الكيان المبحوث: **${primary.ar || query}**\n---\n`
  }

  const isTimeQuery = [INTENT.FUTURE_EVENT, INTENT.SPORTS_TIME, INTENT.EXAM_SCHEDULE].includes(intent)

  let ctx = `\n\n---\n## 🔍 نتائج البحث (SearXNG)\n`
  ctx += `📅 **التاريخ الحالي:** ${dayAr}\n`
  ctx += `🎯 **البحث:** ${INTENT_LABELS[intent] || intent}`
  if (entities.length > 1) {
    ctx += ` — **${entities.map(e => e.ar).join(' vs ')}**`
  } else {
    ctx += ` — **${primary.ar}**`
  }
  ctx += `\n`
  ctx += `✅ **المصادر:** ${consensus.verified ? `${consensus.count} مصادر مستقلة` : 'مصدر أولي'}\n`

  if (isTimeQuery) {
    ctx += `\n> ⚡ **ملاحظة للـ AI:** هذا استعلام زمني — ركّز على النتائج التي تحتوي تواريخ أو مواعيد محددة. اذكر التاريخ الدقيق إن وُجد.\n`
  }
  ctx += '\n'

  const arResults = results.filter(r => /[\u0600-\u06FF]/.test(r.title))
  const enResults = results.filter(r => !/[\u0600-\u06FF]/.test(r.title))

  if (arResults.length > 0) {
    ctx += `### 📰 نتائج عربية:\n`
    for (const r of arResults.slice(0, 8)) {
      const d    = r.date ? ` (${new Date(r.date).toLocaleDateString('ar-DZ')})` : ''
      const link = r.url  ? ` — [رابط](${r.url})` : ''
      const dateFlag = r._hasDate ? ' 📅' : ''
      ctx += `- **${r.title}**${dateFlag}${d} — *${r.source}*${link}\n`
      if (r.snippet?.length > 30) {
        ctx += `  > ${r.snippet.slice(0, 300)}\n`
      }
    }
  }

  if (enResults.length > 0) {
    ctx += `\n### 🌐 International Results:\n`
    for (const r of enResults.slice(0, 4)) {
      const d    = r.date ? ` (${r.date.slice(0, 10)})` : ''
      const link = r.url  ? ` — [link](${r.url})` : ''
      const dateFlag = r._hasDate ? ' 📅' : ''
      ctx += `- **${r.title}**${dateFlag}${d} — *${r.source}*${link}\n`
      if (r.snippet?.length > 30) ctx += `  > ${r.snippet.slice(0, 200)}\n`
    }
  }

  if (consensus.sources.length > 0) {
    ctx += `\n📡 **المصادر:** ${consensus.sources.join(' · ')}\n`
  }

  ctx += `\n> ℹ️ **للـ AI**: استخدم هذه النتائج الحقيقية فقط. `
  if (isTimeQuery) {
    ctx += `إذا وجدت تاريخاً أو موعداً محدداً اذكره. إذا لم تجد موعداً مؤكداً قل ذلك صراحةً. `
  }
  ctx += `لا تخترع معلومات. لا تخمّن. العربية أولاً.`
  ctx += `\n---\n`
  return ctx
}

// ─── الدالة الرئيسية ──────────────────────────────────────────────────────────

/**
 * optimizedSearch — محرك البحث المحسّن الكامل v2
 */
export async function optimizedSearch(query, {
  categories = 'general,news',
  maxResults  = 12,
} = {}) {
  console.log(`[QueryOptimizer v2] ▶ "${query.slice(0, 70)}"`)

  // ── 1. تصنيف + استخراج الكيانات ──────────────────────────────────────
  const intent   = classifyIntent(query)
  const entities = extractEntities(query)
  console.log(`[QueryOptimizer v2] Intent: ${intent} | Entities: ${entities.map(e => e.ar).join(' + ')}`)

  // ── 2. توليد الاستعلامات ──────────────────────────────────────────────
  const variations = generateQueryVariations(query, intent, entities)
  console.log(`[QueryOptimizer v2] Variations: ${variations.slice(0, 4).join(' | ')}`)

  // ── 3. بحث متوازي (4 استعلامات أولوية) ──────────────────────────────
  const isTimeSensitive = [
    INTENT.FUTURE_EVENT, INTENT.PAST_EVENT,
    INTENT.BREAKING_NEWS, INTENT.SPORTS_TIME, INTENT.EXAM_SCHEDULE,
  ].includes(intent)

  const primary4   = variations.slice(0, 4)
  const secondary4 = variations.slice(4, 8)

  const primarySettled = await Promise.allSettled(
    primary4.map(v => searchWithSearXNG(v, {
      categories,
      language:  /[\u0600-\u06FF]/.test(v) ? 'ar' : 'en',
      maxResults: 8,
      timeoutMs:  isTimeSensitive ? 5000 : 7000,
    }))
  )

  let allResults = primarySettled
    .filter(r => r.status === 'fulfilled' && r.value?.length > 0)
    .flatMap(r => r.value)

  // ── 4. استعلامات احتياطية إذا النتائج قليلة ──────────────────────────
  if (allResults.length < 5 && secondary4.length > 0) {
    console.log(`[QueryOptimizer v2] Low results (${allResults.length}), trying secondary...`)
    const secSettled = await Promise.allSettled(
      secondary4.slice(0, 3).map(v => searchWithSearXNG(v, {
        categories,
        language:  /[\u0600-\u06FF]/.test(v) ? 'ar' : 'en',
        maxResults: 6,
        timeoutMs:  5000,
      }))
    )
    allResults = allResults.concat(
      secSettled
        .filter(r => r.status === 'fulfilled' && r.value?.length > 0)
        .flatMap(r => r.value)
    )
  }

  // ── 5. تنظيف + فلتر الصلة ─────────────────────────────────────────────
  const deduped  = dedup(allResults)
  const relevant = deduped.filter(r => isRelevant(r, entities))
  const pool     = relevant.length >= 3 ? relevant : deduped

  // ── 6. ترتيب ──────────────────────────────────────────────────────────
  const ranked = rankResults(pool, entities, intent).slice(0, maxResults)

  // ── 7. التحقق من المصادر ──────────────────────────────────────────────
  const consensus = verifyConsensus(ranked, entities)
  console.log(`[QueryOptimizer v2] ${ranked.length} results | ${consensus.count} sources | verified: ${consensus.verified}`)

  // ── 8. الثقة ──────────────────────────────────────────────────────────
  let confidence = 0
  if (ranked.length === 0)      confidence = 0
  else if (!consensus.verified) confidence = 50
  else if (ranked.length >= 4)  confidence = 80
  else if (ranked.length >= 2)  confidence = 65

  // ── 9. بناء السياق ────────────────────────────────────────────────────
  const context = buildOptimizedContext({
    results: ranked,
    query,
    entities,
    intent,
    consensus,
    noResult: ranked.length === 0,
  })

  return { context, results: ranked, entities, entity: entities[0], intent, consensus, confidence }
}
