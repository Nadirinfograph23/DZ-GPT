/**
 * DZ Agent — Intent Router v2.0
 * ══════════════════════════════════════════════════════════════════════════════
 * القاعدة الذهبية: صنّف أولاً ← تحقق ثانياً ← أجب ثالثاً
 * Classify → Verify → Answer
 *
 * يعمل قبل كل رد — لا استثناء.
 *
 * الأولويات:
 *  1. سؤال صريح
 *  2. كيان مسمّى
 *  3. ذاكرة السياق
 *  4. الرسالة السابقة
 *  5. البحث
 *
 * النتيجة: { intent, confidence, entities, action, source, needsClarification, clarificationMsg }
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ══════════════════════════════════════════════════════════════════════════════
// § 1 — INTENT CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════

export const INTENTS = {
  GREETING:          'GREETING',
  PUBLIC_FIGURE:     'PUBLIC_FIGURE',
  SPORTS_FIXTURES:   'SPORTS_FIXTURES',
  SPORTS_RESULTS:    'SPORTS_RESULTS',
  SPORTS_PLAYER:     'SPORTS_PLAYER',
  HISTORICAL_EVENT:  'HISTORICAL_EVENT',
  HISTORICAL_FIGURE: 'HISTORICAL_FIGURE',
  NEWS:              'NEWS',
  WEATHER:           'WEATHER',
  DEFINITION:        'DEFINITION',
  LOCATION:          'LOCATION',
  COMPARISON:        'COMPARISON',
  CODING:            'CODING',
  UNKNOWN:           'UNKNOWN',
}

export const SOURCES = {
  NONE:                'none',
  WIKIDATA_WIKIPEDIA:  'wikidata→wikipedia→dbpedia',
  SEARXNG_CRAWL4AI:    'searxng→crawl4ai',
  WEATHER_PROVIDER:    'weather-provider',
  WIKIPEDIA_FIRST:     'wikipedia→wikidata→dbpedia',
  MODEL_KNOWLEDGE:     'model-knowledge',
  CLARIFICATION_ONLY:  'clarification-only',
}

// ══════════════════════════════════════════════════════════════════════════════
// § 1.5 — ARABIC NAME NORMALIZATION (تطبيع أسماء العربية للمطابقة)
// يحل مشكلة: "ابراهيم مازا" ≠ "إبراهيم مازة" رغم أنهما نفس الشخص
// ══════════════════════════════════════════════════════════════════════════════

function normalizeArabic(text = '') {
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
}

// ══════════════════════════════════════════════════════════════════════════════
// § 2 — ALGERIAN DIALECT NORMALIZATION (الدارجة → فصحى)
// ══════════════════════════════════════════════════════════════════════════════

const DARIJA_MAP = [
  // سلام / تحية
  { re: /^(سلام|صباح\s+الخير|صباح\s+النور|مساء\s+الخير|واش\s+راك|هلا|كيفاش\s+راك|لاباس|شراك|شنو\s+هواك|ça\s+va|bonjour|bonsoir|salam|wesh|hola)\s*[!؟?]*$/i,
    intent: 'GREETING' },

  // مباريات اليوم (SPORTS_FIXTURES)
  { re: /(كاين|فيه|واش\s+فيه|هل\s+فيه|وش\s+كاين)\s+(ماتشات|مباريات|لقاءات)\s*(اليوم|هذا\s+النهار|الليلة|غدوة|درك)/i,
    intent: 'SPORTS_FIXTURES' },
  { re: /(شكون|من|أيّ\s+فريق)\s+(يلعب|سيلعب|يلاعب)\s*(اليوم|الليلة|هذا\s+المساء)/i,
    intent: 'SPORTS_FIXTURES' },
  { re: /(مع\s+من|ضد\s+من)\s+(ستلعب|يلعب|يلاعب)\s*(الجزائر|المنتخب|الخضر)/i,
    intent: 'SPORTS_FIXTURES' },
  { re: /(برنامج|جدول)\s+(المباريات|اللقاءات|الماتشات)/i,
    intent: 'SPORTS_FIXTURES' },

  // نتائج المباريات (SPORTS_RESULTS)
  { re: /(نتيجة|نتائج|شحال|سكور)\s+(مباراة|الماتش|اللقاء|ديربي)/i,
    intent: 'SPORTS_RESULTS' },
  { re: /(شكون|من)\s+(ربح|فاز|هزم|كسب)\s+(في\s+)?(مباراة|الماتش|ديربي)/i,
    intent: 'SPORTS_RESULTS' },
  { re: /(شحال|كم)\s+(ربح|فاز|نتيجة|سكور)\s+(ريال\s+مدريد|برشلونة|الجزائر|الخضر|الأهلي)/i,
    intent: 'SPORTS_RESULTS' },

  // مكان اللاعب / فريقه (SPORTS_PLAYER)
  { re: /(وين|أين|فين)\s+(يلعب|يشتغل|راه)\s+[^\s]/i,
    intent: 'SPORTS_PLAYER' },
  { re: /(فريق|نادي)\s+(بونجاح|محرز|مازة|مازا|بن|[A-Za-z\u0600-\u06FF]{3,20})/i,
    intent: 'SPORTS_PLAYER' },
  { re: /مع\s+من\s+(يلعب|يشتغل|راه|يلتحق)\s+/i,
    intent: 'SPORTS_PLAYER' },

  // أخبار (NEWS)
  { re: /(واش\s+صرا|واش\s+صار|وش\s+صار|شنو\s+صار|واش\s+كاين|وش\s+كاين)\s*(اليوم|البارح|درك|هذا\s+النهار)?/i,
    intent: 'NEWS' },
  { re: /(آخر|أحدث|جديد|عاجل)\s+(أخبار|خبر)/i,
    intent: 'NEWS' },

  // الطقس (WEATHER)
  { re: /(طقس|الطقس|الجو|جو|حرارة|درجة\s+الحرارة|مطر|رياح|شمس)\s*(اليوم|غدوة|درك|الآن|هذا\s+الأسبوع)?/i,
    intent: 'WEATHER' },
  { re: /(شحال|كم)\s+(الحرارة|الجو|البرد|الدفا)\s*(اليوم|الآن|درك)?/i,
    intent: 'WEATHER' },
  { re: /(واش|هل)\s+(يمطر|غادي\s+يمطر|ريح|باردة|حارة)/i,
    intent: 'WEATHER' },

  // أين تقع / موقع (LOCATION)
  { re: /(وين|أين|فين)\s+(تقع|توجد|موجودة?|جاية|جاي)\s+/i,
    intent: 'LOCATION' },
  { re: /(موقع|مكان|إحداثيات)\s+(مدينة|ولاية|بلدة|جبل|نهر|بحيرة)\s+/i,
    intent: 'LOCATION' },

  // تعريف (DEFINITION)
  { re: /(شنو|واش|ما)\s+(هو|هي|يعني|معنى|معناه|معناها|راه|راها)\s+/i,
    intent: 'DEFINITION' },
  { re: /(عرّف|اشرح|فسّر|وضّح)\s+(لي|لنا)?\s+/i,
    intent: 'DEFINITION' },
  { re: /(كيفاش|كيف)\s+(يشتغل|يعمل|يخدم|يفيد)\s+/i,
    intent: 'DEFINITION' },

  // مقارنة (COMPARISON)
  { re: /(الفرق|قارن|قارنلي)\s+(بين|بيناتهم)\s+/i,
    intent: 'COMPARISON' },
  { re: /(من\s+الأفضل|من\s+الأحسن|أيّهما\s+أفضل)\s*/i,
    intent: 'COMPARISON' },
]

// ══════════════════════════════════════════════════════════════════════════════
// § 3 — INTENT PATTERNS (أنماط التصنيف الرئيسية)
// ══════════════════════════════════════════════════════════════════════════════

const GREETING_PATTERNS = [
  /^(سلام|صباح\s+الخير|صباح\s+النور|مساء\s+الخير|مرحبا|هلا|يسعد\s+صباحك|أهلاً|أهلا)\s*[!؟?]*$/i,
  /^(واش\s+راك|كيفاش\s+راك|لاباس|شراك|واش\s+تحب|bonjour|bonsoir|salam|salut|hi|hello|hey)\s*[!؟?]*$/i,
  /^(مرحباً|هلا|يعطيك\s+الصحة|يسلم)\s*[!؟?]*$/i,
]

const HISTORICAL_FIGURE_PATTERNS = [
  /الأمير|الشيخ|الباي|الداي|الخليفة|الحاج\s+مسعود|ابن\s+باديس|فرحات\s+عباس|مصالي\s+الحاج|لاريبا|بن\s+مهيدي/,
  /نيلسون\s+مانديلا|شي\s+غيفارا|ابن\s+خلدون|ابن\s+رشد|صلاح\s+الدين|الفاتح|المنصور|هارون\s+الرشيد/,
  /(?:من\s+هو|من\s+هي|سيرة|ترجمة|نبذة|تاريخ)\s+(?:الأمير|الشيخ|الباي|الداي)/,
]

const PUBLIC_FIGURE_PATTERNS = [
  /(?:من\s+هو|من\s+هي|شكون\s+هو|شكون\s+هي)\s+[A-Za-z\u0600-\u06FF\s]{3,40}/,
  /[A-Za-z\u0600-\u06FF\s]{3,40}\s+(?:هو\s*[؟?]|هي\s*[؟?]|من\s+هو\s*[؟?]|من\s+هي\s*[؟?])/,
  /(?:عمر|ميلاد|تاريخ\s+ميلاد|جنسية|زوجة|زوج)\s+(?:لاعب|سياسي|وزير|رئيس|فنان|ممثل|مغني)/,
  /(?:رياض\s+محرز|ابراهيم\s+مازا|ابراهيم\s+مازة|إبراهيم\s+مازة|إبراهيم\s+مازا|يوسف\s+عطال|سفيان\s+فيغولي|إسلام\s+سليماني)/,
  /(?:تبون|بن\s+صالح|أويحيى|بدوي|جراد|عرقاب|بلعريبي)\s*(?:من\s+هو|وزير|رئيس)?/i,
]

const SPORTS_FIXTURES_PATTERNS = [
  /(?:مباريات|ماتشات|لقاءات)\s+(?:اليوم|الليلة|غداً|هذا\s+الأسبوع)/,
  /(?:متى|وقت|موعد)\s+(?:مباراة|ماتش|لقاء)\s+/,
  /(?:برنامج|جدول)\s+(?:المباريات|اللقاءات|الدوري)/,
  /(?:كأس|بطولة|الدوري)\s+.*(?:اليوم|الجولة\s+القادمة)/,
]

const SPORTS_RESULTS_PATTERNS = [
  /(?:نتيجة|نتائج|سكور)\s+(?:مباراة|ماتش|ديربي|اللقاء)/,
  /(?:شكون|من|أيّ)\s+(?:ربح|فاز|هزم|كسب|سجّل)/,
  /(?:شحال|كم)\s+(?:ربح|سجّل|هدف)\s+/,
]

const SPORTS_PLAYER_PATTERNS = [
  /(?:وين|أين|فين)\s+(?:يلعب|يشتغل|يلعب\s+درك)\s+/,
  /(?:فريق|نادي)\s+(?:[A-Za-z\u0600-\u06FF]{3,25})/,
  // إصلاح: \s+ أصبحت داخل المجموعة الاختيارية → يطابق الاسم المجرد بدون كلمات مفتاحية
  /(?:محرز|رياض\s+محرز|بونجاح|بغداد\s+بونجاح|مازة|مازا|إبراهيم\s+مازة?|ابراهيم\s+مازة?|عطال|يوسف\s+عطال|فيغولي|سفيان\s+فيغولي|بن\s+ناصر|إسماعيل\s+بن\s+ناصر|حمروني|سليماني|إسلام\s+سليماني|بن\s+رحمة|سعيد\s+بن\s+رحمة|عوار|حسام\s+عوار|بن\s+سبعيني|رامي\s+بن\s+سبعيني|عدلي|ياسين\s+عدلي|براهيمي|ياسين\s+براهيمي|بلايلي|يوسف\s+بلايلي|آيت\s+نور|ريان\s+آيت\s+نور)(?:\s+(?:أين|وين|فريق|نادي|من|يلعب))?/,
  /(?:انتقل|رحل|ذهب)\s+(?:إلى|لـ)\s+(?:فريق|نادي)/,
  /مع\s+من\s+(?:يلعب|يشتغل)\s+/,
  /(?:يلعب|يشتغل)\s+(?:مع|في|ضمن)\s+(?:فريق|نادي)?/,
]

const HISTORICAL_EVENT_PATTERNS = [
  /(?:الثورة|الحرب|معركة|حصار|حادثة|اتفاقية|معاهدة)\s+/,
  /(?:ثورة\s+التحرير|الاستقلال|الثورة\s+الجزائرية|ثورة\s+نوفمبر)/,
  /(?:الحرب\s+العالمية|حرب\s+الخليج|حرب\s+فيتنام)/,
  /(?:معركة\s+بدر|فتح\s+مكة|معركة\s+الجزائر)/,
]

const NEWS_PATTERNS = [
  /(?:أخبار|آخر\s+أخبار|خبر\s+عاجل|breaking|عاجل)\s*/,
  /(?:واش\s+صرا|واش\s+صار)\s+اليوم/,
  /(?:اليوم\s+في\s+الجزائر|جديد\s+الجزائر|آخر\s+مستجدات)/,
  /(?:أحداث|مستجدات|تطورات)\s+(?:الجزائر|العالم|اليوم)/,
]

const WEATHER_PATTERNS = [
  /(?:طقس|الطقس|الجو|درجة\s+الحرارة|حرارة|مطر|رياح)/,
  /(?:شحال\s+الحرارة|كم\s+الحرارة)/,
  /(?:météo|temps\s+qu'il\s+fait|quel\s+temps)/i,
  /(?:weather|temperature|forecast)/i,
]

const DEFINITION_PATTERNS = [
  /(?:ما\s+هو|ما\s+هي|ما\s+معنى|ما\s+المقصود)\s+/,
  /(?:عرّف|اشرح|وضّح|فسّر)\s+(?:لي|لنا)?\s+/,
  /(?:ما\s+الفرق|الفرق\s+بين)\s+/,
  /(?:كيفاش|كيف)\s+(?:يشتغل|يعمل|يفيد)/,
]

const LOCATION_PATTERNS = [
  /(?:أين\s+تقع|وين\s+تقع|فين\s+تقع)\s+/,
  /(?:موقع|مكان|إحداثيات)\s+(?:مدينة|ولاية|بلدية)/,
  /(?:الجزائر\s+العاصمة|وهران|قسنطينة|عنابة|سطيف|باتنة)\s+(?:أين|وين|فين)/,
]

const COMPARISON_PATTERNS = [
  /(?:الفرق\s+بين|قارن\s+بين)\s+/,
  /(?:من\s+الأفضل|من\s+الأحسن)\s+/,
  /(?:أيّهما|أيهم)\s+(?:أفضل|أحسن|أقوى)\s+/,
]

const CODING_PATTERNS = [
  /(?:اكتب\s+كود|برمج|دير\s+لي\s+كود|write\s+code|code\s+this)/i,
  /(?:كود\s+html|كود\s+css|كود\s+javascript|كود\s+python|كود\s+php)/i,
  /(?:bug|error|خطأ\s+في\s+الكود|stack\s+trace|exception)/i,
]

// ══════════════════════════════════════════════════════════════════════════════
// § 4 — ENTITY DETECTION LAYER (طبقة كشف الكيانات)
// ══════════════════════════════════════════════════════════════════════════════

const KNOWN_PLAYERS = [
  'رياض محرز', 'إبراهيم مازة', 'ابراهيم مازة', 'إبراهيم مازا', 'ابراهيم مازا',
  'يوسف عطال', 'سفيان فيغولي',
  'إسلام سليماني', 'بغداد بونجاح', 'وليد سليماني', 'عمر السومة',
  'محرز', 'مازة', 'مازا', 'بونجاح', 'عطال', 'فيغولي', 'سليماني',
  'بن ناصر', 'حمروني', 'مرضي', 'بلال بن حمودة',
]

// قائمة مُطبَّعة للمطابقة السريعة (تُحسب مرة واحدة)
const KNOWN_PLAYERS_NORMALIZED = KNOWN_PLAYERS.map(normalizeArabic)

const KNOWN_HISTORICAL_FIGURES = [
  'الأمير عبد القادر', 'هواري بومدين', 'أحمد بن بلة', 'العربي بن مهيدي',
  'لاريبا', 'مصالي الحاج', 'فرحات عباس', 'ابن باديس',
  'نيلسون مانديلا', 'شي غيفارا', 'صلاح الدين', 'ابن خلدون',
]

const KNOWN_POLITICIANS = [
  // رؤساء الجمهورية
  'تبون', 'عبد المجيد تبون',
  'عبد العزيز بوتفليقة', 'بوتفليقة',
  'اليامين زروال', 'زروال',
  'علي كافي',
  'محمد بوضياف', 'بوضياف',
  'الشاذلي بن جديد', 'بن جديد',
  'رابح بيطاط', 'بيطاط',
  'هواري بومدين', 'بومدين',
  'أحمد بن بلة', 'بن بلة',
  'عبد القادر بن صالح',
  // وزراء أوائل
  'نذير العرباوي', 'العرباوي',
  'أيمن بن عبد الرحمن',
  'عبد العزيز جراد', 'جراد',
  'نور الدين بدوي',
  'عبد المالك سلال', 'سلال',
  'أحمد أويحيى', 'أويحيى',
  // الوزراء الحاليون (حكومة العرباوي 2023-الآن)
  'ياسين وليد',
  'أحمد عطاف', 'عطاف',
  'إبراهيم مراد',
  'عمر بلحاج',
  'لعزيز فايد', 'فايد',
  'محمد عرقاب', 'عرقاب',
  'علي عون',
  'الطيب ضيف',
  'يوسف شرفة',
  'طاهر قردان',
  'موسى بن لعزيز',
  'لخضر رخروخ', 'رخروخ',
  'محمد طارق بلعريبي',
  'صالح أمار',
  'عبد الحق سايحي', 'سايحي',
  'عبد الحكيم بلعيد', 'بلعيد',
  'كمال بداري', 'بداري',
  'عبد الرشيد ترار', 'ترار',
  'فيصل بن طالب',
  'كريمة بلعريبي',
  'زينب بن دودة',
  'محمد لعقاب', 'لعقاب',
  'يوسف شاهد',
  'كمال بلجود',
  // سياسيون تاريخيون
  'أرسلان بن خضرة',
]

const KNOWN_TEAMS = [
  'الجزائر', 'المنتخب الجزائري', 'الخضر', 'الرجاء', 'الوداد',
  'الأهلي', 'الزمالك', 'ريال مدريد', 'برشلونة', 'باريس سان جيرمان',
  'مانشستر سيتي', 'ليفربول', 'شباب بلوزداد', 'مولودية الجزائر',
  'اتحاد الجزائر', 'وفاق سطيف', 'نصر حسين داي', 'أمل بوسعادة',
]

const AMBIGUOUS_NAMES_EXTENDED = {
  'ياسين':    ['ياسين بونو (حارس مرمى مغربي)', 'ياسين عدلي (لاعب جزائري)'],
  'محمد':     ['محمد — حدد الاسم الكامل'],
  'خالد':     ['خالد — حدد الاسم الكامل والمجال'],
  'أحمد':     ['أحمد — حدد الاسم الكامل'],
  'علي':      ['علي — حدد الاسم الكامل'],
  'عمر':      ['عمر — حدد الاسم الكامل'],
  'يوسف':     ['يوسف عطال (لاعب جزائري)', 'يوسف آخر — حدد'],
  'الأهلي':   ['النادي الأهلي المصري', 'النادي الأهلي السعودي', 'الأهلي الليبي'],
  'محرز':     ['رياض محرز (لاعب جزائري)', 'محرز — فنان أو شخص آخر'],
  'بن علي':   ['زين العابدين بن علي (رئيس تونس السابق)', 'بن علي — شخص آخر'],
  'الرئيس السابق': null,
  'الملك': null,
}

/**
 * detectEntities — استخراج الكيانات من الرسالة
 * @param {string} text
 * @returns {{ players: string[], figures: string[], politicians: string[], teams: string[], raw: string[] }}
 */
export function detectEntities(text = '') {
  const t = text.trim()
  const tNorm = normalizeArabic(t)
  const found = {
    players:    [],
    figures:    [],
    politicians:[],
    teams:      [],
    raw:        [],
  }

  // مطابقة اللاعبين مع تطبيع النص (يحل مشكلة إبراهيم/ابراهيم ومازة/مازا)
  for (let i = 0; i < KNOWN_PLAYERS.length; i++) {
    const p = KNOWN_PLAYERS[i]
    const pNorm = KNOWN_PLAYERS_NORMALIZED[i]
    if (t.includes(p) || tNorm.includes(pNorm)) {
      if (!found.players.includes(p)) { found.players.push(p); found.raw.push(p) }
    }
  }
  for (const f of KNOWN_HISTORICAL_FIGURES) {
    const fNorm = normalizeArabic(f)
    if (t.includes(f) || tNorm.includes(fNorm)) { found.figures.push(f); found.raw.push(f) }
  }
  for (const p of KNOWN_POLITICIANS)  {
    const pNorm = normalizeArabic(p)
    if (t.includes(p) || tNorm.includes(pNorm)) { found.politicians.push(p); found.raw.push(p) }
  }
  for (const tm of KNOWN_TEAMS)       { if (t.includes(tm)) { found.teams.push(tm); found.raw.push(tm) } }

  // ازالة التكرار
  found.raw = [...new Set(found.raw)]
  return found
}

/**
 * detectAmbiguousEntity — كشف الاسم الغامض (كلمة واحدة بدون سياق)
 * @param {string} text
 * @returns {{ ambiguous: boolean, name: string|null, options: string[]|null }}
 */
export function detectAmbiguousEntity(text = '') {
  const t = text.trim()
  const words = t.match(/[\u0621-\u064A\u0660-\u0669]+/g) || []

  if (words.length > 4) return { ambiguous: false, name: null, options: null }

  // إذا تطابق الاسم الكامل مع كيان معروف → ليس غامضاً أبداً
  const allKnown = [...KNOWN_PLAYERS, ...KNOWN_HISTORICAL_FIGURES, ...KNOWN_POLITICIANS, ...KNOWN_TEAMS]
  const tNorm = normalizeArabic(t)
  if (allKnown.some(k => {
    const kNorm = normalizeArabic(k)
    return tNorm === kNorm || tNorm.startsWith(kNorm + ' ') || tNorm.endsWith(' ' + kNorm)
  })) {
    return { ambiguous: false, name: null, options: null }
  }

  for (const [key, options] of Object.entries(AMBIGUOUS_NAMES_EXTENDED)) {
    const keyWords = key.match(/[\u0621-\u064A\u0660-\u0669]+/g) || []
    // ── الإصلاح الأساسي: مطابقة النص الكامل فقط (لا substring) ──────────────
    // "ياسين" → ambiguous ✓ | "ياسين وليد" → NOT ambiguous ✓
    // المنطق: النص يجب أن يساوي المفتاح الغامض بالضبط (بعد التطبيع)
    // أو يكون المفتاح هو كامل النص مع كلمات تساوي كلمات المفتاح فقط
    const keyNorm = normalizeArabic(key)
    const textMatchesKeyExactly = tNorm === keyNorm
    const textIsKeyWithNoExtra = words.length === keyWords.length && t.includes(key)
    if ((textMatchesKeyExactly || textIsKeyWithNoExtra) && options) {
      return {
        ambiguous: true,
        name: key,
        options: options,
      }
    }
  }

  return { ambiguous: false, name: null, options: null }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 5 — GREETING FAST-PATH (تحية سريعة)
// ══════════════════════════════════════════════════════════════════════════════

function isGreeting(text = '') {
  const t = text.trim().toLowerCase()
  if (t.length > 50) return false
  // من الدارجة أولاً
  for (const { re, intent } of DARIJA_MAP) {
    if (intent === 'GREETING' && re.test(t)) return true
  }
  return GREETING_PATTERNS.some(p => p.test(t))
}

// ══════════════════════════════════════════════════════════════════════════════
// § 6 — MAIN CLASSIFIER (المصنّف الرئيسي)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * classifyIntent — المصنّف الرئيسي لـ DZ Agent
 *
 * @param {string} message — رسالة المستخدم
 * @param {Array}  history — سجل المحادثة [{role,content}]
 * @returns {{
 *   intent: string,
 *   confidence: number,          // 0-100
 *   entities: object,            // كيانات مكتشفة
 *   action: string,              // ما يجب فعله
 *   source: string,              // مصدر البيانات الموصى به
 *   needsClarification: boolean,
 *   clarificationMsg: string|null,
 *   darijaType: string|null,     // نوع الدارجة إذا كانت موجودة
 *   debugLabel: string,          // للتسجيل فقط
 * }}
 */
export function classifyIntent(message = '', history = []) {
  const msg = message.trim()
  if (!msg) {
    return _result(INTENTS.UNKNOWN, 0, {}, 'none', SOURCES.CLARIFICATION_ONLY,
      true, 'لم أفهم المقصود بدقة، هل يمكنك توضيح السؤال؟', null, 'empty-message')
  }

  // ── STEP 1: GREETING CHECK (أسرع مسار) ─────────────────────────────────
  if (isGreeting(msg)) {
    return _result(INTENTS.GREETING, 99, {}, 'reply-conversational', SOURCES.NONE,
      false, null, null, 'greeting-fastpath')
  }

  // ── STEP 2: ENTITY DETECTION (كشف الكيانات أولاً) ──────────────────────
  const entities = detectEntities(msg)
  const ambiguity = detectAmbiguousEntity(msg)

  // ── STEP 3: DARIJA QUICK MAP (الدارجة قبل الأنماط المعيارية) ────────────
  for (const { re, intent } of DARIJA_MAP) {
    if (re.test(msg)) {
      const { action, source } = _getActionAndSource(intent, entities)
      return _result(intent, 90, entities, action, source,
        false, null, intent, `darija-map:${intent}`)
    }
  }

  // ── STEP 4: AMBIGUITY GATE (بوابة الغموض) ───────────────────────────────
  if (ambiguity.ambiguous) {
    const clarMsg = _buildAmbiguityMsg(ambiguity)
    return _result(INTENTS.UNKNOWN, 30, entities, 'ask-clarification',
      SOURCES.CLARIFICATION_ONLY, true, clarMsg, null, `ambiguous:${ambiguity.name}`)
  }

  // ── STEP 5: PATTERN MATCHING (مطابقة الأنماط) ────────────────────────────
  const scored = _scoreAllIntents(msg, entities)
  const best = scored[0]

  if (!best || best.score < 20) {
    // ── STEP 5.5: ENTITY FALLBACK ─────────────────────────────────────────
    // إذا كشفنا لاعباً/شخصية معروفة لكن لا نمط تطابق → نعامله كـ SPORTS_PLAYER/PUBLIC_FIGURE
    // هذا يحل: "ابراهيم مازا" بدون "من هو" أو "أين يلعب"
    if (entities.players.length > 0) {
      const { action, source } = _getActionAndSource(INTENTS.SPORTS_PLAYER, entities)
      return _result(INTENTS.SPORTS_PLAYER, 65, entities, action, source,
        false, null, null, `entity-fallback:player:${entities.players[0]}`)
    }
    if (entities.politicians.length > 0) {
      const { action, source } = _getActionAndSource(INTENTS.PUBLIC_FIGURE, entities)
      return _result(INTENTS.PUBLIC_FIGURE, 65, entities, action, source,
        false, null, null, `entity-fallback:politician:${entities.politicians[0]}`)
    }
    if (entities.figures.length > 0) {
      const { action, source } = _getActionAndSource(INTENTS.HISTORICAL_FIGURE, entities)
      return _result(INTENTS.HISTORICAL_FIGURE, 65, entities, action, source,
        false, null, null, `entity-fallback:figure:${entities.figures[0]}`)
    }

    // UNKNOWN — confidence منخفضة
    return _result(INTENTS.UNKNOWN, 10, entities, 'ask-clarification',
      SOURCES.CLARIFICATION_ONLY, true,
      'لم أفهم المقصود بدقة، هل يمكنك توضيح السؤال؟',
      null, 'low-confidence')
  }

  const { action, source } = _getActionAndSource(best.intent, entities)
  const confidence = Math.min(95, best.score)

  return _result(best.intent, confidence, entities, action, source,
    false, null, null, `pattern:${best.intent}`)
}

// ══════════════════════════════════════════════════════════════════════════════
// § 7 — SCORING ENGINE (محرك التسجيل)
// ══════════════════════════════════════════════════════════════════════════════

function _scoreAllIntents(msg, entities) {
  const scores = []

  const check = (intent, patterns, baseScore, entityBonus = 0) => {
    const hit = patterns.some(p => p.test(msg))
    if (hit) {
      let score = baseScore + entityBonus
      scores.push({ intent, score })
    }
  }

  // شخصية تاريخية (عامل: وجود اسم تاريخي معروف)
  check(INTENTS.HISTORICAL_FIGURE, HISTORICAL_FIGURE_PATTERNS, 80,
    entities.figures.length > 0 ? 15 : 0)

  // شخصية عامة
  check(INTENTS.PUBLIC_FIGURE, PUBLIC_FIGURE_PATTERNS, 70,
    (entities.players.length + entities.politicians.length) > 0 ? 20 : 0)

  // مباريات اليوم
  check(INTENTS.SPORTS_FIXTURES, SPORTS_FIXTURES_PATTERNS, 85,
    entities.teams.length > 0 ? 10 : 0)

  // نتائج
  check(INTENTS.SPORTS_RESULTS, SPORTS_RESULTS_PATTERNS, 85,
    entities.teams.length > 0 ? 10 : 0)

  // لاعب
  check(INTENTS.SPORTS_PLAYER, SPORTS_PLAYER_PATTERNS, 80,
    entities.players.length > 0 ? 15 : 0)

  // حدث تاريخي
  check(INTENTS.HISTORICAL_EVENT, HISTORICAL_EVENT_PATTERNS, 80)

  // أخبار
  check(INTENTS.NEWS, NEWS_PATTERNS, 75)

  // طقس
  check(INTENTS.WEATHER, WEATHER_PATTERNS, 90)

  // تعريف
  check(INTENTS.DEFINITION, DEFINITION_PATTERNS, 70)

  // موقع
  check(INTENTS.LOCATION, LOCATION_PATTERNS, 80)

  // مقارنة
  check(INTENTS.COMPARISON, COMPARISON_PATTERNS, 75)

  // برمجة
  check(INTENTS.CODING, CODING_PATTERNS, 85)

  // فرز تنازلي
  return scores.sort((a, b) => b.score - a.score)
}

// ══════════════════════════════════════════════════════════════════════════════
// § 8 — ACTION & SOURCE RESOLVER (محدد الإجراء والمصدر)
// ══════════════════════════════════════════════════════════════════════════════

function _getActionAndSource(intent, entities = {}) {
  switch (intent) {
    case INTENTS.GREETING:
      return { action: 'reply-conversational', source: SOURCES.NONE }

    case INTENTS.PUBLIC_FIGURE:
    case INTENTS.HISTORICAL_FIGURE:
      return { action: 'lookup-wikidata-wikipedia-dbpedia', source: SOURCES.WIKIDATA_WIKIPEDIA }

    case INTENTS.SPORTS_PLAYER:
      return { action: 'lookup-wikidata-wikipedia', source: SOURCES.WIKIDATA_WIKIPEDIA }

    case INTENTS.HISTORICAL_EVENT:
      return { action: 'lookup-wikipedia-wikidata-dbpedia', source: SOURCES.WIKIPEDIA_FIRST }

    case INTENTS.SPORTS_FIXTURES:
    case INTENTS.SPORTS_RESULTS:
    case INTENTS.NEWS:
    case INTENTS.CODING:
      return { action: 'search-searxng-crawl4ai', source: SOURCES.SEARXNG_CRAWL4AI }

    case INTENTS.WEATHER:
      return { action: 'use-weather-provider', source: SOURCES.WEATHER_PROVIDER }

    case INTENTS.DEFINITION:
      return { action: 'lookup-wikipedia-first', source: SOURCES.WIKIPEDIA_FIRST }

    case INTENTS.LOCATION:
      return { action: 'lookup-wikidata-wikipedia', source: SOURCES.WIKIDATA_WIKIPEDIA }

    case INTENTS.COMPARISON:
      return { action: 'gather-facts-then-compare', source: SOURCES.SEARXNG_CRAWL4AI }

    default:
      return { action: 'ask-clarification', source: SOURCES.CLARIFICATION_ONLY }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 9 — HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function _result(intent, confidence, entities, action, source,
  needsClarification, clarificationMsg, darijaType, debugLabel) {
  return { intent, confidence, entities, action, source,
    needsClarification, clarificationMsg, darijaType, debugLabel }
}

function _buildAmbiguityMsg(ambiguity) {
  if (!ambiguity.options) {
    return `⚠️ **توضيح مطلوب**\n\n"${ambiguity.name}" — يمكن أن تقصد أشخاصاً أو كيانات متعددة.\nهل يمكنك تحديد الاسم الكامل أو المجال (رياضة، سياسة، فن...)?`
  }
  const lines = [
    `🤔 **هل تقصد واحداً من هؤلاء؟**\n`,
    ...ambiguity.options.map((o, i) => `**${i + 1}.** ${o}`),
    '',
    '> اختر رقماً أو اكتب الاسم الكامل.',
  ]
  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════════════
// § 10 — SYSTEM PROMPT BLOCK (الحقن في System Prompt)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * buildIntentBlock — يبني كتلة السياق للـ System Prompt
 * @param {{ intent, confidence, entities, action, source, needsClarification }} classification
 * @returns {string}
 */
export function buildIntentBlock(classification) {
  const { intent, confidence, entities, action, source, needsClarification, clarificationMsg } = classification

  // ── بوّابة المسار: المراحل 1-4 أُنجزت بالنظام — أخبر النموذج بذلك ──
  let block = `[PIPELINE_GATE — المسار الإلزامي السبع مراحل]\n`
  block += `✅ المرحلة ① فهم النية       → مكتملة (النية: ${intent} | الثقة: ${confidence}%)\n`
  block += `✅ المرحلة ② تحديد الكيان   → مكتملة (الكيانات: ${entities?.raw?.length > 0 ? entities.raw.join(', ') : 'لا يوجد كيان صريح'})\n`
  block += `✅ المرحلة ③ قرار البحث     → مكتملة (الإجراء: ${action})\n`
  block += `✅ المرحلة ④ اختيار المصدر  → مكتملة (المصدر: ${source})\n`
  block += `⏳ المرحلة ⑤ التحقق من الدليل → مسؤوليتك أنت — لا تتخطّها\n`
  block += `⏳ المرحلة ⑥ صياغة الجواب   → مسؤوليتك أنت — من الدليل المُتحقق فقط\n`
  block += `⏳ المرحلة ⑦ المراجعة الذاتية → مسؤوليتك أنت — قبل الإرسال\n`
  block += `[/PIPELINE_GATE]\n\n`

  block += `[INTENT_CLASSIFICATION]\n`
  block += `النية: ${intent} | الثقة: ${confidence}% | الإجراء: ${action}\n`
  block += `المصدر المُوصى به: ${source}\n`

  if (entities?.raw?.length > 0) {
    block += `الكيانات المكتشفة: ${entities.raw.join(', ')}\n`
  }

  if (needsClarification && clarificationMsg) {
    block += `[CLARIFICATION_REQUIRED]\n${clarificationMsg}\n[/CLARIFICATION_REQUIRED]\n`
    block += `⚠️ هذا السؤال غامض — أجب بطلب التوضيح فقط ولا تخمّن.\n`
  }

  block += `[/INTENT_CLASSIFICATION]`

  return block
}

/**
 * INTENT_CLASSIFIER_POLICY — طبقة السياسة للـ System Prompt
 */
export const INTENT_CLASSIFIER_POLICY = `
[INTENT_CLASSIFIER — إلزامي قبل كل رد]

╔══════════════════════════════════════════════════════════════════╗
║  🔒 المسار الإلزامي السبع مراحل — تُطبَّق تلقائياً بهذا الترتيب  ║
║  ① فهم النية  ② تحديد الكيان  ③ قرار البحث  ④ اختيار المصدر   ║
║  ⑤ التحقق من الدليل  ⑥ صياغة الجواب  ⑦ المراجعة الذاتية      ║
╚══════════════════════════════════════════════════════════════════╝

─── المرحلة ① — فهم النية ───────────────────────────────────────
صنّف نية المستخدم وفق هذا الترتيب:

① GREETING        → رد محادثياً — لا تبحث.
② PUBLIC_FIGURE   → Wikidata → Wikipedia → DBpedia. إذا كان الاسم غامضاً: اسأل.
③ SPORTS_FIXTURES → SearXNG → Crawl4AI. لا تستخدم ذاكرتك الداخلية أبداً.
④ SPORTS_RESULTS  → SearXNG → Crawl4AI.
⑤ SPORTS_PLAYER   → Wikidata → Wikipedia. تحقق من النادي الحالي.
⑥ HISTORICAL_EVENT→ Wikipedia → Wikidata → DBpedia.
⑦ NEWS            → SearXNG → Crawl4AI.
⑧ WEATHER         → مزود الطقس. لا تستخدم Wikipedia.
⑨ DEFINITION      → Wikipedia أولاً.
⑩ LOCATION        → Wikidata → Wikipedia.
⑪ COMPARISON      → اجمع الحقائق أولاً. ثم قارن.
⑫ UNKNOWN         → "لم أفهم المقصود بدقة، هل يمكنك توضيح السؤال؟"

قاعدة الدارجة الجزائرية:
• كاين ماتشات اليوم → SPORTS_FIXTURES
• واش صرا اليوم     → NEWS
• وين يلعب محرز     → SPORTS_PLAYER
• شكون يلعب اليوم   → SPORTS_FIXTURES
• شحال الحرارة      → WEATHER
• شنو هو / واش راه  → DEFINITION
• الأهلي (وحده)     → AMBIGUOUS → اسأل: الأهلي المصري أم السعودي؟

─── المرحلة ② — تحديد الكيان ────────────────────────────────────
• اسم واحد غامض (ياسين، محمد، الأهلي) → لا تخمّن → اسأل عن الهوية.
• اسم مع لقب أو فريق → استخرج الكيان → تحقق مباشرة.
• اسم مُطبَّع (أ/إ/آ → ا) موجود في السياق المُحقن → استخدمه مباشرة.

─── المرحلة ③ — قرار البحث ─────────────────────────────────────
• حقائق ثابتة → ذاكرة داخلية ✅
• معلومات زمنية (أخبار، مباريات، مناصب حالية) → بحث خارجي إلزامي ✅
• إذا طُلب "بدون بحث" → تجاهل، نفّذ البحث المطلوب ❌

─── المرحلة ④ — اختيار المصدر ──────────────────────────────────
• شخصية/رياضي/سياسي   → Wikidata ← Wikipedia AR ← Wikipedia EN
• حدث تاريخي           → Wikipedia ← Wikidata ← DBpedia
• أخبار/مباريات حالية  → SearXNG ← Crawl4AI
• طقس                  → مزود الطقس المحلي
• تعريف                → Wikipedia أولاً

─── المرحلتان ⑤⑥⑦ — إلزامية على النموذج ──────────────────────
⑤ التحقق من الدليل: لا تستخدم أي معلومة غير موجودة في [WIKIPEDIA_CONTEXT]
   أو [PERSON_WEB_CONTEXT] أو [DECISION_TREE_CONTEXT]
⑥ صياغة الجواب: فقط من الدليل المُتحقق — أشر إلى المصدر دائماً
⑦ المراجعة الذاتية: قبل الإرسال تحقق: صحة المعلومة، اللغة، المصدر، غياب الكلمات الممنوعة

القاعدة الذهبية: صنّف أولاً ← تحقق ثانياً ← أجب ثالثاً ← راجع قبل الإرسال. لا تتخطّ أي خطوة.
`.trim()
