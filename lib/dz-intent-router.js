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
  { re: /(فريق|نادي)\s+(بونجاح|محرز|مازة|بن|[A-Za-z\u0600-\u06FF]{3,20})/i,
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
  /(?:عمر|ميلاد|تاريخ\s+ميلاد|جنسية|زوجة|زوج)\s+(?:لاعب|سياسي|وزير|رئيس|فنان|ممثل|مغني)/,
  /(?:رياض\s+محرز|إبراهيم\s+مازة|يوسف\s+عطال|سفيان\s+فيغولي|إسلام\s+سليماني)/,
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
  /(?:محرز|بونجاح|مازة|عطال|فيغولي|بن\s+ناصر|حمروني)\s+(?:أين|وين|فريق)/,
  /(?:انتقل|رحل|ذهب)\s+(?:إلى|لـ)\s+(?:فريق|نادي)/,
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
  'رياض محرز', 'إبراهيم مازة', 'يوسف عطال', 'سفيان فيغولي',
  'إسلام سليماني', 'بغداد بونجاح', 'وليد سليماني', 'عمر السومة',
  'محرز', 'مازة', 'بونجاح', 'عطال', 'فيغولي', 'سليماني',
  'بن ناصر', 'حمروني', 'مرضي', 'بلال بن حمودة',
]

const KNOWN_HISTORICAL_FIGURES = [
  'الأمير عبد القادر', 'هواري بومدين', 'أحمد بن بلة', 'العربي بن مهيدي',
  'لاريبا', 'مصالي الحاج', 'فرحات عباس', 'ابن باديس',
  'نيلسون مانديلا', 'شي غيفارا', 'صلاح الدين', 'ابن خلدون',
]

const KNOWN_POLITICIANS = [
  'تبون', 'عبد المجيد تبون', 'أيمن بن عبد الرحمن', 'عبد العزيز جراد',
  'عبد العزيز بوتفليقة', 'أحمد أويحيى', 'أرسلان بن خضرة',
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
  const found = {
    players:    [],
    figures:    [],
    politicians:[],
    teams:      [],
    raw:        [],
  }

  for (const p of KNOWN_PLAYERS)      { if (t.includes(p)) { found.players.push(p);     found.raw.push(p) } }
  for (const f of KNOWN_HISTORICAL_FIGURES) { if (t.includes(f)) { found.figures.push(f); found.raw.push(f) } }
  for (const p of KNOWN_POLITICIANS)  { if (t.includes(p)) { found.politicians.push(p); found.raw.push(p) } }
  for (const tm of KNOWN_TEAMS)       { if (t.includes(tm)) { found.teams.push(tm);     found.raw.push(tm) } }

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

  // إذا تطابق الاسم الكامل مع كيان معروف → ليس غامضاً
  const allKnown = [...KNOWN_PLAYERS, ...KNOWN_HISTORICAL_FIGURES, ...KNOWN_POLITICIANS, ...KNOWN_TEAMS]
  if (allKnown.some(k => t === k || t.startsWith(k + ' ') || t.endsWith(' ' + k))) {
    return { ambiguous: false, name: null, options: null }
  }

  for (const [key, options] of Object.entries(AMBIGUOUS_NAMES_EXTENDED)) {
    if (t.includes(key) && words.length <= 2) {
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

  let block = `[INTENT_CLASSIFICATION]\n`
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

قبل أي رد، صنّف نية المستخدم وفق هذا الترتيب:

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

قاعدة الكيانات:
• اسم واحد غامض (ياسين، محمد، الأهلي) → لا تخمّن → اسأل عن الهوية.
• اسم مع لقب أو فريق → استخرج الكيان → تحقق مباشرة.

القاعدة الذهبية: صنّف أولاً ← تحقق ثانياً ← أجب ثالثاً. لا تتخطّ أي خطوة.
`.trim()
