/**
 * lib/dz-knowledge-entity-agent.js  v2.1 (fixed)
 * ════════════════════════════════════════════════════════════════════════════
 * DZ Knowledge Entity Agent — نظام التعرف على الكيانات والمعرفة
 *
 * الإصلاحات v2.1:
 *  - حذف \b بعد الكلمات العربية (لا يعمل في JS مع Unicode)
 *  - توسيع KNOWLEDGE_TRIGGERS لتشمل كل أنماط WHO/WHAT
 *  - إصلاح MAPS + SERVICE triggers
 *  - إضافة Wikidata SPARQL لاستعلامات "رئيس دولة حالي"
 *  - تحسين entity extraction لأسئلة المناصب
 *  - تقليل MIN_CONFIDENCE للكيانات غير المعروفة
 * ════════════════════════════════════════════════════════════════════════════
 */

const AGENT_TIMEOUT  = 12000
const CACHE_TTL_MS   = 30 * 60 * 1000
const MIN_CONFIDENCE     = 0.72   // عتبة الثقة العامة
const MIN_CONFIDENCE_GEO = 0.48   // عتبة أقل للكيانات الجغرافية (عواصم، مدن، دول)

// ══════════════════════════════════════════════════════════════════════════
// § 1 — INTENT CLASSIFIER
// ══════════════════════════════════════════════════════════════════════════

export const ENTITY_INTENT = {
  KNOWLEDGE_QUERY: 'KNOWLEDGE_QUERY',
  LIVE_SEARCH:     'LIVE_SEARCH',
  MAPS_SEARCH:     'MAPS_SEARCH',
  SERVICE_QUERY:   'SERVICE_QUERY',
  UNRELATED:       'UNRELATED',
}

// ─────────────────────────────────────────────────────────────────────────
// ملاحظة مهمة: لا تستخدم \b بعد الحروف العربية — JS regex لا يدعمه
// استبدلها بـ (?=\s|$|[؟?,،.!]) أو أزلها كلياً
// ─────────────────────────────────────────────────────────────────────────

// Live Search — يُفحص أوّلاً (أولوية أعلى)
const LIVE_SEARCH_TRIGGERS = [
  /(?:آخر|أحدث|أخير)\s+(?:أخبار|خبر|تصريح|تصريحات|لقاء|زيارة|اجتماع)/i,
  /(?:آخر\s+لقاء|آخر\s+اجتماع|آخر\s+زيارة|أين\s+التقى)/i,
  /(?:اليوم|البارح|الأمس|الآن|حالياً|درك)\s+(?:أخبار|ماذا|صرا)/i,
  /(?:ماذا\s+حدث|وش\s+صار|واش\s+صار|شنو\s+صار)/i,
  /(?:تصريح|تصريحات|خطاب)\s+(?:اليوم|الأخير|الجديد)/i,
  /(?:breaking|عاجل:?\s)/i,
]

// Maps / Local Search
const MAPS_SEARCH_TRIGGERS = [
  // أقرب / أبحث عن + مكان خدمي
  /(?:أقرب|أبحث\s+عن)\s+(?:مستشفى|صيدلية|مطعم|فندق|مدرسة|بنك|ميكانيكي|محامي|طبيب|دكتور|كافيه|مقهى|محطة)/i,
  // أين يوجد / وين كاين + مكان خدمي
  /(?:أين\s+يوجد|وين\s+كاين|فين\s+كاين)\s+(?:مستشفى|صيدلية|محل|دكتور|طبيب|فندق|مطعم)/i,
  // أقرب فندق / مستشفى في / بالقرب
  /أقرب\s+(?:فندق|مستشفى|صيدلية|مطعم|مدرسة|محطة)/i,
  /(?:بالقرب\s+مني|قريب\s+مني|في\s+حيّي|في\s+منطقتي)/i,
  /(?:موقع|عنوان|كيف\s+أصل\s+إلى)\s+(?:مستشفى|صيدلية|محل)/i,
]

// Service Query
const SERVICE_SEARCH_TRIGGERS = [
  // أريد طبيب / دكتور / محامي + أي كلمة بعده
  /^أريد\s+(?:طبيب|دكتور|محامي|ميكانيكي|مهندس|معلم|أستاذ|كهربائي|سباك)/i,
  /(?:أريد|أبحث\s+عن)\s+(?:طبيب|دكتور|محامي|ميكانيكي|مهندس|كهربائي|سباك)\s+/i,
  /(?:من\s+يمكنه|من\s+يساعدني|من\s+يقدر)\s+(?:على|في)/i,
]

// Knowledge Query — WHO / WHAT — بدون \b عند نهاية الكلمات العربية
// ⚠️ قاعدة: أسئلة "من هو + منصب + الحالي/السابق/الجديد" → KNOWLEDGE (وليست LIVE_SEARCH)
const KNOWLEDGE_TRIGGERS = [
  // من هو / من هي — مع أو بدون ^ (يسمح بوجوده في أي مكان)
  /(?:^|\s)من\s+(?:هو|هي)\s+/i,
  /(?:^|\s)شكون\s+(?:هو|هي)\s+/i,

  // ما هو / ما هي — يكفي وجودهما
  /(?:^|\s)ما\s+(?:هو|هي)\s+/i,
  /(?:^|\s)ما\s+هي\s+(?:دولة|ولاية|مدينة|بلدية|منطقة|بلدة|دائرة|محافظة)/i,

  // عرّفني / أخبرني
  /(?:عرّفني|عرّف\s+لي|أخبرني)\s+(?:بـ|عن|ب)/i,

  // معلومات / نبذة / سيرة / تاريخ
  /(?:معلومات|معلومة|نبذة|سيرة|تاريخ|ترجمة)\s+(?:عن|حول)/i,

  // من كتب / ألّف / أخرج
  /(?:من\s+كتب|من\s+ألّف|من\s+أخرج|من\s+لحّن)/i,

  // مؤلف / كاتب / مخرج + عمل
  /(?:مؤلف|كاتب|صاحب|مخرج|ملحن)\s+(?:كتاب|رواية|فيلم|أغنية|مسرحية|ديوان)/i,

  // رئيس / وزير / ملك + دولة — بدون \b
  /(?:رئيس|وزير|ملك|أمير|حاكم)\s+(?:دولة|جمهورية|مملكة|الجزائر|مصر|فرنسا|أمريكا|الولايات|الصين|روسيا|تركيا|إيران|ألمانيا|إيطاليا|إسبانيا|البرازيل|المملكة|الأردن|السعودية|المغرب|تونس|ليبيا|العراق|سوريا|لبنان|اليمن|السودان|الإمارات|قطر|الكويت|البحرين|عُمان)/i,

  // الرئيس الأمريكي / الفرنسي... الحالي / السابق / الجديد
  /(?:الرئيس|رئيس)\s+(?:الأمريكي|الفرنسي|المصري|الجزائري|الإيراني|التركي|الروسي|الصيني|البريطاني|الألماني|الإيطالي|الإسباني|البرازيلي|الأردني|السعودي|المغربي|التونسي|اللبناني|العراقي)/i,

  // ★ جديد: الرئيس/الوزير + الحالي/السابق/الجديد (حتى بدون ذكر الدولة)
  /(?:الرئيس|رئيس\s+الجمهورية|رئيس\s+الدولة)\s+(?:الحالي|الحالية|السابق|السابقة|الجديد|الجديدة)/i,
  /(?:وزير|الوزير)\s+(?:الداخلية|الخارجية|الدفاع|التعليم|الصحة|المالية|العدل|الطاقة|الزراعة|النقل|السياحة|الثقافة|الاتصال|التجارة|الصناعة|الشباب|الدين|الأوقاف)(?:\s+(?:الحالي|السابق|الجديد))?/i,
  /(?:رئيس\s+الحكومة|الوزير\s+الأول|رئيس\s+الوزراء)\s*(?:الحالي|السابق|الجديد)?/i,

  // ★ جديد: "الرئيس الأمريكي الحالي" → KNOWLEDGE حتى لو احتوى "الحالي"
  /(?:الرئيس|الوزير|الملك|الأمير)\s+\w+(?:\s+\w+)?\s+(?:الحالي|الحالية|السابق|السابقة|الجديد|الجديدة)/i,

  // من يشغل منصب / يتولى منصب
  /(?:من\s+يشغل|من\s+يتولى|من\s+يحمل)\s+(?:منصب|حقيبة)/i,

  // اشرح / فسّر / وضّح + كيان
  /^(?:اشرح|فسّر|وضّح|عرّف)\s+/i,

  // متى وُلد / توفي / استشهد / تأسس
  /(?:متى|تاريخ)\s+(?:وُلد|ولادة|وفاة|استشهد|تأسس|بُني|اكتُشف)/i,

  // عاصمة / لغة / عملة / مساحة + دولة
  /(?:عاصمة|لغة|عملة|مساحة|عدد\s+سكان)\s+(?:دولة|جمهورية|\w+)/i,

  // هل تعرف + كيان
  /هل\s+تعرف\s+/i,
]

/**
 * classifyEntityIntent
 */
export function classifyEntityIntent(query = '') {
  const q = query.trim()
  if (!q || q.length < 2) return { intent: ENTITY_INTENT.UNRELATED, confidence: 0, shouldHandle: false }

  // 1. Live Search (أولوية أعلى)
  for (const re of LIVE_SEARCH_TRIGGERS) {
    if (re.test(q)) return {
      intent: ENTITY_INTENT.LIVE_SEARCH,
      confidence: 0.95,
      shouldHandle: false,
      redirectReason: 'سؤال عن أحداث حية → Search Agent',
      redirectTo: 'DZ_SEARCH_AGENT',
    }
  }

  // 2. Maps Search
  for (const re of MAPS_SEARCH_TRIGGERS) {
    if (re.test(q)) return {
      intent: ENTITY_INTENT.MAPS_SEARCH,
      confidence: 0.93,
      shouldHandle: false,
      redirectReason: 'طلب خريطة أو خدمة محلية → Maps Agent',
      redirectTo: 'DZ_MAPS_AGENT',
    }
  }

  // 3. Service Query
  for (const re of SERVICE_SEARCH_TRIGGERS) {
    if (re.test(q)) return {
      intent: ENTITY_INTENT.SERVICE_QUERY,
      confidence: 0.90,
      shouldHandle: false,
      redirectReason: 'طلب مزود خدمة → Service Agent',
      redirectTo: 'DZ_SERVICE_AGENT',
    }
  }

  // 4. Knowledge Query
  for (const re of KNOWLEDGE_TRIGGERS) {
    if (re.test(q)) return {
      intent: ENTITY_INTENT.KNOWLEDGE_QUERY,
      confidence: 0.88,
      shouldHandle: true,
    }
  }

  return { intent: ENTITY_INTENT.UNRELATED, confidence: 0, shouldHandle: false }
}

// ══════════════════════════════════════════════════════════════════════════
// § 2 — ENTITY RECOGNITION (NER)
// ══════════════════════════════════════════════════════════════════════════

export const ENTITY_TYPE = {
  PERSON:     'PERSON',
  GEOGRAPHIC: 'GEOGRAPHIC',
  WORK:       'WORK',
  ORG:        'ORG',
  ROLE_QUERY: 'ROLE_QUERY',   // "رئيس دولة X" — يحتاج SPARQL
  UNKNOWN:    'UNKNOWN',
}

// خريطة المدن الجزائرية الكبرى → الإنجليزية
const ALGERIAN_CITIES = {
  'الجزائر': 'Algiers', 'وهران': 'Oran', 'قسنطينة': 'Constantine',
  'عنابة': 'Annaba', 'سطيف': 'Sétif', 'باتنة': 'Batna',
  'سيدي بلعباس': 'Sidi Bel Abbès', 'بسكرة': 'Biskra',
  'تيزي وزو': 'Tizi Ouzou', 'تلمسان': 'Tlemcen',
  'بجاية': 'Béjaïa', 'الشلف': 'Chlef', 'مستغانم': 'Mostaganem',
  'سكيكدة': 'Skikda', 'المدية': 'Médéa', 'بومرداس': 'Boumerdes',
  'تبسة': 'Tébessa', 'أم البواقي': 'Oum El Bouaghi',
  'المسيلة': 'M\'Sila', 'ورقلة': 'Ouargla', 'غرداية': 'Ghardaïa',
  'الأغواط': 'Laghouat', 'البليدة': 'Blida', 'تيبازة': 'Tipaza',
  'شرشال': 'Cherchell', 'بودواو': 'Boudouaou',
  'عين الدفلى': 'Aïn Defla', 'الجلفة': 'Djelfa',
  'خنشلة': 'Khenchela', 'السوقر': 'Sougueur',
  'تمنراست': 'Tamanrasset', 'إليزي': 'Illizi', 'أدرار': 'Adrar',
  'النعامة': 'Naâma', 'عين تموشنت': 'Aïn Témouchent',
  'تيارت': 'Tiaret', 'سعيدة': 'Saïda', 'المغير': 'El Mghair',
}

// خريطة الدول بالعربية → الإنجليزية لـ Wikidata search
const COUNTRY_MAP = {
  'أمريكا': 'United States', 'الولايات المتحدة': 'United States', 'الأمريكي': 'United States',
  'فرنسا': 'France', 'الفرنسي': 'France',
  'مصر': 'Egypt', 'المصري': 'Egypt',
  'الجزائر': 'Algeria', 'الجزائري': 'Algeria',
  'إيران': 'Iran', 'الإيراني': 'Iran',
  'تركيا': 'Turkey', 'التركي': 'Turkey',
  'روسيا': 'Russia', 'الروسي': 'Russia',
  'الصين': 'China', 'الصيني': 'China',
  'بريطانيا': 'United Kingdom', 'البريطاني': 'United Kingdom',
  'ألمانيا': 'Germany', 'الألماني': 'Germany',
  'إيطاليا': 'Italy', 'الإيطالي': 'Italy',
  'إسبانيا': 'Spain', 'الإسباني': 'Spain',
  'البرازيل': 'Brazil', 'البرازيلي': 'Brazil',
  'الأردن': 'Jordan', 'الأردني': 'Jordan',
  'السعودية': 'Saudi Arabia', 'السعودي': 'Saudi Arabia',
  'المغرب': 'Morocco', 'المغربي': 'Morocco',
  'تونس': 'Tunisia', 'التونسي': 'Tunisia',
  'ليبيا': 'Libya', 'الليبي': 'Libya',
  'العراق': 'Iraq', 'العراقي': 'Iraq',
  'سوريا': 'Syria', 'السوري': 'Syria',
  'لبنان': 'Lebanon', 'اللبناني': 'Lebanon',
  'اليمن': 'Yemen', 'اليمني': 'Yemen',
  'الإمارات': 'United Arab Emirates', 'الإماراتي': 'United Arab Emirates',
  'قطر': 'Qatar', 'القطري': 'Qatar',
  'الكويت': 'Kuwait', 'الكويتي': 'Kuwait',
  'اليابان': 'Japan', 'الياباني': 'Japan', 'يابان': 'Japan',
  'كوريا': 'South Korea', 'الكوري': 'South Korea',
  'الهند': 'India', 'الهندي': 'India',
  'باكستان': 'Pakistan', 'الباكستاني': 'Pakistan',
  'كندا': 'Canada', 'الكندي': 'Canada',
  'أستراليا': 'Australia', 'الأسترالي': 'Australia',
}

// ══ قاموس العواصم والحقائق الجغرافية الثابتة ═══════════════════════════════
// يُستخدم للإجابة الفورية بدون استدعاء APIs خارجية
const CAPITALS_MAP = {
  'الجزائر': { capital: 'الجزائر العاصمة', en: 'Algiers', pop: '~3.5 مليون', flag: '🇩🇿' },
  'مصر': { capital: 'القاهرة', en: 'Cairo', pop: '~22 مليون', flag: '🇪🇬' },
  'المغرب': { capital: 'الرباط', en: 'Rabat', pop: '~600 ألف', flag: '🇲🇦' },
  'تونس': { capital: 'تونس', en: 'Tunis', pop: '~2.7 مليون', flag: '🇹🇳' },
  'ليبيا': { capital: 'طرابلس', en: 'Tripoli', pop: '~1.2 مليون', flag: '🇱🇾' },
  'السودان': { capital: 'الخرطوم', en: 'Khartoum', pop: '~6 مليون', flag: '🇸🇩' },
  'موريتانيا': { capital: 'نواكشوط', en: 'Nouakchott', pop: '~1 مليون', flag: '🇲🇷' },
  'فرنسا': { capital: 'باريس', en: 'Paris', pop: '~2.1 مليون', flag: '🇫🇷' },
  'أمريكا': { capital: 'واشنطن', en: 'Washington D.C.', pop: '~700 ألف', flag: '🇺🇸' },
  'الولايات المتحدة': { capital: 'واشنطن', en: 'Washington D.C.', pop: '~700 ألف', flag: '🇺🇸' },
  'بريطانيا': { capital: 'لندن', en: 'London', pop: '~9 مليون', flag: '🇬🇧' },
  'ألمانيا': { capital: 'برلين', en: 'Berlin', pop: '~3.7 مليون', flag: '🇩🇪' },
  'إيطاليا': { capital: 'روما', en: 'Rome', pop: '~2.8 مليون', flag: '🇮🇹' },
  'إسبانيا': { capital: 'مدريد', en: 'Madrid', pop: '~3.3 مليون', flag: '🇪🇸' },
  'روسيا': { capital: 'موسكو', en: 'Moscow', pop: '~12.5 مليون', flag: '🇷🇺' },
  'الصين': { capital: 'بكين', en: 'Beijing', pop: '~21 مليون', flag: '🇨🇳' },
  'اليابان': { capital: 'طوكيو', en: 'Tokyo', pop: '~14 مليون', flag: '🇯🇵' },
  'الهند': { capital: 'نيودلهي', en: 'New Delhi', pop: '~30 مليون', flag: '🇮🇳' },
  'تركيا': { capital: 'أنقرة', en: 'Ankara', pop: '~5.7 مليون', flag: '🇹🇷' },
  'إيران': { capital: 'طهران', en: 'Tehran', pop: '~9.5 مليون', flag: '🇮🇷' },
  'السعودية': { capital: 'الرياض', en: 'Riyadh', pop: '~7.6 مليون', flag: '🇸🇦' },
  'الإمارات': { capital: 'أبوظبي', en: 'Abu Dhabi', pop: '~1.5 مليون', flag: '🇦🇪' },
  'قطر': { capital: 'الدوحة', en: 'Doha', pop: '~1 مليون', flag: '🇶🇦' },
  'الكويت': { capital: 'مدينة الكويت', en: 'Kuwait City', pop: '~3 مليون', flag: '🇰🇼' },
  'الأردن': { capital: 'عمّان', en: 'Amman', pop: '~4.2 مليون', flag: '🇯🇴' },
  'العراق': { capital: 'بغداد', en: 'Baghdad', pop: '~8.7 مليون', flag: '🇮🇶' },
  'سوريا': { capital: 'دمشق', en: 'Damascus', pop: '~2.5 مليون', flag: '🇸🇾' },
  'لبنان': { capital: 'بيروت', en: 'Beirut', pop: '~2.4 مليون', flag: '🇱🇧' },
  'فلسطين': { capital: 'القدس', en: 'Jerusalem', pop: '~950 ألف', flag: '🇵🇸' },
  'البرازيل': { capital: 'برازيليا', en: 'Brasília', pop: '~3.1 مليون', flag: '🇧🇷' },
  'كندا': { capital: 'أوتاوا', en: 'Ottawa', pop: '~1.4 مليون', flag: '🇨🇦' },
  'أستراليا': { capital: 'كانبيرا', en: 'Canberra', pop: '~470 ألف', flag: '🇦🇺' },
  'باكستان': { capital: 'إسلام آباد', en: 'Islamabad', pop: '~1.1 مليون', flag: '🇵🇰' },
  'كوريا': { capital: 'سيول', en: 'Seoul', pop: '~10 مليون', flag: '🇰🇷' },
}

// استخراج اسم الدولة من سؤال "ما هي عاصمة X؟"
function _extractCapitalQuery(q = '') {
  const m = q.match(/(?:ما|ما\s+هي|ايش|وين|أين)\s+(?:هي\s+)?عاصمة\s+(?:دولة\s+)?(.{2,40}?)(?:\s*[؟?])?$/i)
           || q.match(/عاصمة\s+(?:دولة\s+)?(.{2,40}?)(?:\s*[؟?])?$/i)
  if (!m) return null
  return m[1].trim().replace(/[؟?!،,\.]/g, '').replace(/^(ال)/, 'ال').trim()
}

// بناء رد عاصمة من القاموس الثابت
function _buildCapitalResponse(countryAr, data) {
  return [
    `## ${data.flag} عاصمة ${countryAr}`,
    ``,
    `> 🏛️ **العاصمة:** **${data.capital}** *(${data.en})*`,
    ``,
    `| المعلومة | القيمة |`,
    `|----------|--------|`,
    `| 🏳️ الدولة | ${countryAr} |`,
    `| 🏙️ العاصمة | ${data.capital} |`,
    `| 🌍 الاسم الإنجليزي | ${data.en} |`,
    `| 👥 عدد السكان | ${data.pop} |`,
    ``,
    `> 📅 *معلومات جغرافية ثابتة — DZ-GPT 2026*`,
  ].join('\n')
}

// Wikidata P-codes للمناصب
const ROLE_SPARQL_MAP = {
  'رئيس': 'P6',    // head of government
  'ملك':  'P35',   // head of state
  'أمير': 'P35',
}

// أنماط استخراج الكيان
const ENTITY_EXTRACTION_PATTERNS = [
  // رئيس دولة X → ROLE_QUERY
  { re: /(?:الرئيس|رئيس)\s+(الأمريكي|الفرنسي|المصري|الجزائري|الإيراني|التركي|الروسي|الصيني|البريطاني|الألماني|الإيطالي|الإسباني|البرازيلي|الأردني|السعودي|المغربي|التونسي|اللبناني|العراقي)(?:\s+الحالي)?/i,
    type: ENTITY_TYPE.ROLE_QUERY, isRole: true, role: 'رئيس' },

  // من يشغل منصب رئيس X
  { re: /(?:من\s+يشغل|من\s+يتولى)\s+منصب\s+(?:رئيس|وزير)\s+(.{2,50}?)(?:\s*[؟?])?$/i,
    type: ENTITY_TYPE.ROLE_QUERY, isRole: true, role: 'رئيس' },

  // من هو / من هي [اسم]
  { re: /(?:من\s+(?:هو|هي)|شكون\s+(?:هو|هي))\s+(.{2,60}?)(?:\s*[؟?])?$/i,
    type: ENTITY_TYPE.PERSON },

  // ما هي [ولاية/مدينة/بلدية/دولة] X
  { re: /ما\s+هي\s+(?:ولاية|مدينة|بلدية|دولة|منطقة|بلدة|دائرة)\s+(.{2,50}?)(?:\s*[؟?])?$/i,
    type: ENTITY_TYPE.GEOGRAPHIC },

  // ما هي/هو [كيان مباشر]
  { re: /ما\s+(?:هي|هو)\s+(.{2,60}?)(?:\s*[؟?])?$/i,
    type: ENTITY_TYPE.UNKNOWN },

  // من كتب / مؤلف [عمل] — نلتقط اسم العمل لاستخراج المؤلف
  { re: /(?:من\s+(?:كتب|ألّف)|(?:مؤلف|كاتب|صاحب)\s+(?:كتاب|رواية|قصة|ديوان|مسرحية)?)\s*(.{2,60}?)(?:\s*[؟?])?$/i,
    type: ENTITY_TYPE.WORK, isAuthorQuery: true },

  // من أخرج [فيلم]
  { re: /(?:من\s+أخرج|مخرج\s+(?:فيلم|مسلسل)?)\s*(.{2,60}?)(?:\s*[؟?])?$/i,
    type: ENTITY_TYPE.WORK, isAuthorQuery: true },

  // معلومات عن / نبذة عن
  { re: /(?:معلومات|نبذة|سيرة|تاريخ)\s+(?:عن|حول)\s+(.{2,70}?)(?:\s*[؟?])?$/i,
    type: ENTITY_TYPE.UNKNOWN },

  // عرّفني بـ / أخبرني عن
  { re: /(?:عرّفني|أخبرني)\s+(?:بـ|عن|ب)\s+(.{2,70}?)(?:\s*[؟?])?$/i,
    type: ENTITY_TYPE.UNKNOWN },

  // اشرح / وضّح [كيان]
  { re: /^(?:اشرح|فسّر|وضّح|عرّف)\s+(.{2,70}?)(?:\s*[؟?])?$/i,
    type: ENTITY_TYPE.UNKNOWN },
]

/**
 * detectRoleQuery — هل هذا سؤال عن منصب حالي؟
 * مثال: "من هو الرئيس الأمريكي الحالي؟" → { role:'رئيس', country:'United States' }
 */
function detectRoleQuery(q = '') {
  // نمط 1: "الرئيس الأمريكي الحالي"
  const adjMatch = q.match(/(?:الرئيس|رئيس)\s+(الأمريكي|الفرنسي|المصري|الجزائري|الإيراني|التركي|الروسي|الصيني|البريطاني|الألماني|الإيطالي|الإسباني|البرازيلي|الأردني|السعودي|المغربي|التونسي|اللبناني|العراقي|الياباني|الكوري|الهندي|الكندي)/i)
  if (adjMatch) {
    const adj = adjMatch[1]
    const country = COUNTRY_MAP[adj] || adj
    return { role: 'رئيس', country, countryAr: adj.replace(/^ال/, '') }
  }

  // نمط 2: "من يشغل منصب رئيس X"
  const posMatch = q.match(/(?:من\s+يشغل|من\s+يتولى)\s+منصب\s+(?:رئيس|وزير)\s+(.{2,40}?)(?:\s*[؟?])?$/)
  if (posMatch) {
    // ننظّف الكلمات الزمنية مثل "حاليا" "الآن" "في الوقت الراهن"
    const countryAr = posMatch[1].trim()
      .replace(/\s+(?:حاليا|حالياً|الآن|درك|في\s+الوقت\s+الحالي|في\s+الوقت\s+الراهن)\s*$/i, '')
      .trim()
    const country = COUNTRY_MAP[countryAr] || countryAr
    return { role: 'رئيس', country, countryAr }
  }

  // نمط 3: "رئيس دولة X" صريح
  for (const [arKey, enVal] of Object.entries(COUNTRY_MAP)) {
    if (q.includes(arKey)) {
      const hasRole = /رئيس|ملك|أمير|وزير/.test(q)
      if (hasRole) return { role: 'رئيس', country: enVal, countryAr: arKey }
    }
  }

  return null
}

export function extractEntity(query = '') {
  const q = query.trim().replace(/\s+/g, ' ')

  // أوّلاً: فحص ROLE_QUERY (رئيس دولة X)
  const roleQ = detectRoleQuery(q)
  if (roleQ) return { entity: roleQ.country, entityAr: roleQ.countryAr, type: ENTITY_TYPE.ROLE_QUERY, role: roleQ.role, isRole: true }

  for (const { re, type } of ENTITY_EXTRACTION_PATTERNS) {
    if (type === ENTITY_TYPE.ROLE_QUERY) continue
    const m = q.match(re)
    if (m?.[1]) {
      let entity = m[1].trim()
        .replace(/[؟?!،,\.]/g, '')
        .replace(/^(هو|هي|ال)\s+/i, '')
        .trim()
      if (entity.length >= 2) {
        // ترقية النوع: إذا كان الكيان دولة أو مدينة معروفة → GEOGRAPHIC
        const resolvedType = _resolveEntityType(entity, type)
        return { entity, type: resolvedType }
      }
    }
  }

  // Fallback: أزل أدوات السؤال من البداية
  const fallback = q
    .replace(/^(?:من\s+(?:هو|هي)|ما\s+(?:هو|هي)|شكون\s+(?:هو|هي)|عرّفني\s+(?:بـ|عن|ب)|معلومات\s+عن|نبذة\s+عن|تاريخ)\s*/i, '')
    .replace(/[؟?!]/g, '').trim()
  if (fallback.length >= 2 && fallback.length <= 80) {
    const resolvedType = _resolveEntityType(fallback, ENTITY_TYPE.UNKNOWN)
    return { entity: fallback, type: resolvedType }
  }
  return null
}

/** ترقية نوع الكيان: تحقق إن كان دولة أو مدينة معروفة */
function _resolveEntityType(entity, defaultType) {
  const clean = entity.replace(/^ال/, '')
  if (COUNTRY_MAP[entity] || COUNTRY_MAP[clean]) return ENTITY_TYPE.GEOGRAPHIC
  if (ALGERIAN_CITIES[entity] || ALGERIAN_CITIES[clean]) return ENTITY_TYPE.GEOGRAPHIC
  return defaultType
}

// ══════════════════════════════════════════════════════════════════════════
// § 3 — KNOWLEDGE RETRIEVAL PIPELINE
// ══════════════════════════════════════════════════════════════════════════

const WIKIDATA_API  = 'https://www.wikidata.org/w/api.php'
const SPARQL_URL    = 'https://query.wikidata.org/sparql'
const WIKIPEDIA_AR  = 'https://ar.wikipedia.org/w/api.php'
const WIKIPEDIA_EN  = 'https://en.wikipedia.org/w/api.php'
const DBPEDIA_URL   = 'https://lookup.dbpedia.org/api/search'

// ─── 3a. Wikidata SPARQL لاستعلامات "رئيس دولة X حالياً" ─────────────────
async function _sparqlCurrentLeader(countryEnglish) {
  // نبحث عن رئيس الدولة الحالي عبر P6 (head of government)
  const sparql = `
SELECT DISTINCT ?person ?personLabel ?personDesc ?startDate WHERE {
  ?country wdt:P31 wd:Q3624078 ;
           rdfs:label "${countryEnglish}"@en .
  ?country p:P6 ?statement .
  ?statement ps:P6 ?person .
  OPTIONAL { ?statement pq:P580 ?startDate . }
  FILTER NOT EXISTS { ?statement pq:P582 ?endDate }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ar,fr,en". }
}
ORDER BY DESC(?startDate)
LIMIT 3
`.trim()

  try {
    const url = `${SPARQL_URL}?query=${encodeURIComponent(sparql)}&format=json`
    const res = await fetch(url, {
      headers: { 'Accept': 'application/sparql-results+json', 'User-Agent': 'DZ-GPT/2.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const bindings = data?.results?.bindings || []
    if (!bindings.length) return null

    const top = bindings[0]
    const name = top.personLabel?.value
    const desc = top.personDesc?.value || ''
    const startDate = top.startDate?.value?.slice(0, 10) || null
    const personId  = top.person?.value?.split('/').pop() || null

    return { name, desc, startDate, personId, source: 'wikidata-sparql' }
  } catch { return null }
}

// ─── 3b. Wikidata Entity Search ───────────────────────────────────────────
async function _fetchWikidataEntity(entityName, lang = 'ar') {
  try {
    const searchUrl = `${WIKIDATA_API}?` + new URLSearchParams({
      action: 'wbsearchentities', search: entityName,
      language: lang, uselang: 'ar', type: 'item',
      limit: '5', format: 'json', origin: '*',
    })
    const sRes = await fetch(searchUrl, { signal: AbortSignal.timeout(AGENT_TIMEOUT) })
    if (!sRes.ok) return null
    const sData = await sRes.json()
    let hits = sData?.search || []

    // Fallback إلى English إذا لم يجد بالعربية
    if (!hits.length && lang === 'ar') {
      return _fetchWikidataEntity(entityName, 'en')
    }
    if (!hits.length) return null

    for (const hit of hits.slice(0, 3)) {
      const eUrl = `${WIKIDATA_API}?` + new URLSearchParams({
        action: 'wbgetentities', ids: hit.id,
        languages: 'ar|fr|en',
        props: 'labels|descriptions|claims|sitelinks',
        format: 'json', origin: '*',
      })
      const eRes  = await fetch(eUrl, { signal: AbortSignal.timeout(AGENT_TIMEOUT) })
      if (!eRes.ok) continue
      const eData = await eRes.json()
      const ent   = eData?.entities?.[hit.id]
      if (!ent) continue

      const label = ent.labels?.ar?.value || ent.labels?.fr?.value || ent.labels?.en?.value || hit.label || entityName
      const desc  = ent.descriptions?.ar?.value || ent.descriptions?.en?.value || hit.description || ''
      const structured = _extractStructuredClaims(ent.claims || {})
      const arWiki = ent.sitelinks?.arwiki?.title
      const frWiki = ent.sitelinks?.frwiki?.title
      const enWiki = ent.sitelinks?.enwiki?.title
      const wikiTitle = arWiki || frWiki || enWiki
      const wikiLang  = arWiki ? 'ar' : frWiki ? 'fr' : enWiki ? 'en' : null

      return {
        id: hit.id, label, desc, structured,
        wikiTitle, wikiLang,
        wikiUrl: arWiki ? `https://ar.wikipedia.org/wiki/${encodeURIComponent(arWiki)}` : null,
        wikidataUrl: `https://www.wikidata.org/wiki/${hit.id}`,
        source: 'wikidata',
        confidence: _calcConfidence(label, entityName, desc),
      }
    }
    return null
  } catch { return null }
}

function _extractStructuredClaims(claims = {}) {
  const PROPS = {
    P569: 'تاريخ الميلاد', P570: 'تاريخ الوفاة / الاستشهاد',
    P27:  'الجنسية',       P106: 'المهنة / الوظيفة',
    P39:  'المنصب',        P54:  'الفريق / النادي',
    P131: 'يقع في',        P17:  'الدولة',
    P571: 'تاريخ التأسيس', P580: 'بداية الفترة', P582: 'نهاية الفترة',
  }
  const result = {}
  for (const [prop, label] of Object.entries(PROPS)) {
    const claim = claims[prop]?.[0]?.mainsnak
    if (!claim?.datavalue) continue
    const dv = claim.datavalue
    if (dv.type === 'time') {
      const r = _formatDate(dv.value?.time?.replace(/^\+/, '') || '')
      if (r) result[label] = r
    } else if (dv.type === 'string') {
      result[label] = dv.value
    }
  }
  return result
}

function _formatDate(dateStr = '') {
  if (!dateStr) return null
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return dateStr.slice(0, 10)
  const [, y, mo, d] = m
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const month = months[parseInt(mo, 10) - 1] || mo
  if (d === '00') return `${month} ${y}`
  return `${parseInt(d, 10)} ${month} ${y}`
}

function _calcConfidence(label = '', query = '', desc = '') {
  if (!label) return 0
  const n = s => s.replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي')
                  .replace(/\s+/g,' ').toLowerCase().trim()
  const nl = n(label), nq = n(query)
  if (nl === nq) return 1.0
  if (nl.includes(nq) || nq.includes(nl)) return 0.92
  const words = nq.split(' ').filter(w => w.length > 2)
  const matched = words.filter(w => nl.includes(w)).length
  const ratio = words.length ? matched / words.length : 0
  return Math.min(0.55 + ratio * 0.38 + (desc ? 0.05 : 0), 0.97)
}

// ─── 3c. Wikipedia Extract ────────────────────────────────────────────────
async function _fetchWikipediaExtract(title, lang = 'ar') {
  try {
    const base = lang === 'ar' ? WIKIPEDIA_AR : lang === 'en' ? WIKIPEDIA_EN : `https://${lang}.wikipedia.org/w/api.php`
    const url = `${base}?` + new URLSearchParams({
      action: 'query', prop: 'extracts|description',
      exintro: '1', explaintext: '1', exsentences: '8',
      titles: title, format: 'json', origin: '*', redirects: '1',
    })
    const res = await fetch(url, { signal: AbortSignal.timeout(AGENT_TIMEOUT) })
    if (!res.ok) return null
    const data = await res.json()
    const pages = Object.values(data?.query?.pages || {})
    const page  = pages[0]
    if (!page || page.missing || !page.extract) return null
    return {
      title: page.title,
      extract: page.extract.trim(),
      description: page.description || '',
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      lang,
    }
  } catch { return null }
}

// ─── Wikipedia direct search (إذا لم يجد عبر Wikidata) ───────────────────
async function _searchWikipediaAR(query) {
  try {
    const url = `${WIKIPEDIA_AR}?` + new URLSearchParams({
      action: 'query', list: 'search', srsearch: query,
      srlimit: '3', format: 'json', origin: '*',
    })
    const res = await fetch(url, { signal: AbortSignal.timeout(AGENT_TIMEOUT) })
    if (!res.ok) return null
    const data = await res.json()
    const hits = data?.query?.search || []
    if (!hits.length) return null
    return _fetchWikipediaExtract(hits[0].title, 'ar')
  } catch { return null }
}

// ─── 3d. DBpedia ──────────────────────────────────────────────────────────
async function _fetchDBpedia(entityName) {
  try {
    const url = `${DBPEDIA_URL}?` + new URLSearchParams({
      query: entityName, maxResults: '3', format: 'json',
    })
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const docs = data?.docs || []
    if (!docs.length) return null
    const top = docs[0]
    return {
      label:   top.label?.[0] || entityName,
      comment: top.comment?.[0] || '',
      types:   top.type || [],
      url:     top.resource?.[0] || null,
      source:  'dbpedia',
    }
  } catch { return null }
}

// ─── 3e. Person info via Wikidata entity ID (SPARQL نتيجة) ────────────────
async function _fetchPersonByWikidataId(personId) {
  try {
    const url = `${WIKIDATA_API}?` + new URLSearchParams({
      action: 'wbgetentities', ids: personId,
      languages: 'ar|fr|en',
      props: 'labels|descriptions|claims|sitelinks',
      format: 'json', origin: '*',
    })
    const res  = await fetch(url, { signal: AbortSignal.timeout(AGENT_TIMEOUT) })
    const data = await res.json()
    const ent  = data?.entities?.[personId]
    if (!ent) return null
    const label = ent.labels?.ar?.value || ent.labels?.fr?.value || ent.labels?.en?.value
    const desc  = ent.descriptions?.ar?.value || ent.descriptions?.en?.value || ''
    const arWiki = ent.sitelinks?.arwiki?.title
    const enWiki = ent.sitelinks?.enwiki?.title
    return { label, desc, arWiki, enWiki, wikidataUrl: `https://www.wikidata.org/wiki/${personId}` }
  } catch { return null }
}

// ══════════════════════════════════════════════════════════════════════════
// § 4 — IN-MEMORY CACHE
// ══════════════════════════════════════════════════════════════════════════

const _CACHE = new Map()

function _cacheKey(entity) {
  return entity.replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي')
               .replace(/\s+/g,' ').toLowerCase().trim()
}
function _cacheGet(k) {
  const entry = _CACHE.get(_cacheKey(k))
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _CACHE.delete(_cacheKey(k)); return null }
  return entry.data
}
function _cacheSet(k, data) {
  if (_CACHE.size > 500) {
    const old = [..._CACHE.entries()].sort((a,b) => a[1].ts - b[1].ts).slice(0,50)
    old.forEach(([key]) => _CACHE.delete(key))
  }
  _CACHE.set(_cacheKey(k), { data, ts: Date.now() })
}
export function getCacheStats() {
  return { size: _CACHE.size, ttlMin: CACHE_TTL_MS / 60000 }
}

// ══════════════════════════════════════════════════════════════════════════
// § 5 — RESPONSE FORMATTER
// ══════════════════════════════════════════════════════════════════════════

function _buildEntityResponse({ entity, entityType, wikidataResult, wikiExtract, dbpediaResult, confidence, roleData, originalQuery }) {
  const lines = []
  const name = roleData?.name || wikidataResult?.label || wikiExtract?.title || entity

  const icon = entityType === ENTITY_TYPE.GEOGRAPHIC ? '🗺️'
             : entityType === ENTITY_TYPE.WORK       ? '📖'
             : entityType === ENTITY_TYPE.ROLE_QUERY ? '🏛️'
             : '👤'

  // ── بناء قائمة المصادر (source cards) أولاً لنعرف أرقامها ──────────────
  const sourceCards = []
  if (roleData?.personId) {
    sourceCards.push({
      num: sourceCards.length + 1,
      icon: '🔗',
      label: 'Wikidata SPARQL',
      domain: 'wikidata.org',
      title: roleData.name || 'بيانات المنصب',
      url: `https://www.wikidata.org/wiki/${roleData.personId}`,
      note: 'قاعدة بيانات المعرفة الحرة — بيانات حية',
    })
  }
  if (wikidataResult?.wikidataUrl && !roleData) {
    sourceCards.push({
      num: sourceCards.length + 1,
      icon: '🔗',
      label: 'Wikidata',
      domain: 'wikidata.org',
      title: wikidataResult.label || entity,
      url: wikidataResult.wikidataUrl,
      note: 'قاعدة بيانات المعرفة الحرة',
    })
  }
  if (wikiExtract?.url) {
    sourceCards.push({
      num: sourceCards.length + 1,
      icon: '📚',
      label: 'Wikipedia',
      domain: wikiExtract.lang === 'en' ? 'en.wikipedia.org' : wikiExtract.lang === 'fr' ? 'fr.wikipedia.org' : 'ar.wikipedia.org',
      title: wikiExtract.title,
      url: wikiExtract.url,
      note: wikiExtract.description || wikiExtract.extract?.slice(0, 80)?.replace(/\n/g, ' ') || '',
    })
  }
  if (dbpediaResult?.url) {
    sourceCards.push({
      num: sourceCards.length + 1,
      icon: '🌐',
      label: 'DBpedia',
      domain: 'dbpedia.org',
      title: dbpediaResult.label || entity,
      url: dbpediaResult.url,
      note: dbpediaResult.comment?.slice(0, 80)?.replace(/\n/g, ' ') || 'قاعدة بيانات موسوعية',
    })
  }

  // ref helper: يُعيد [¹] [²] ... للمصادر ذات الصلة
  const ref = (...labels) => {
    const nums = sourceCards
      .filter(s => labels.includes(s.label) || labels.includes('all'))
      .map(s => `[${s.num}]`)
    return nums.length ? ' ' + nums.join('') : ''
  }

  // ── العنوان ──────────────────────────────────────────────────────────────
  lines.push(`## ${icon} ${name}`)
  lines.push('')

  const desc = roleData?.desc || wikidataResult?.desc || wikiExtract?.description || dbpediaResult?.comment || ''
  if (desc) lines.push(`> *${desc}*${ref('Wikidata', 'Wikidata SPARQL', 'Wikipedia')}`, '')

  // ── معلومات المناصب ──────────────────────────────────────────────────────
  if (entityType === ENTITY_TYPE.ROLE_QUERY && roleData) {
    lines.push('### 📋 المعلومات الأساسية', '')
    lines.push('| الخاصية | القيمة |')
    lines.push('|---------|--------|')
    lines.push(`| **الاسم** | ${roleData.name}${ref('Wikidata SPARQL')} |`)
    if (roleData.startDate) lines.push(`| **تاريخ تولّي المنصب** | ${roleData.startDate}${ref('Wikidata SPARQL')} |`)
    if (wikiExtract?.extract) {
      const snippet = wikiExtract.extract.slice(0, 200).replace(/\n/g, ' ').trim()
      lines.push(`| **نبذة** | ${snippet}...${ref('Wikipedia')} |`)
    }
    lines.push('')
  } else {
    // ── البيانات الهيكلية من Wikidata ─────────────────────────────────────
    const structured = wikidataResult?.structured || {}
    const entries = Object.entries(structured).filter(([,v]) => v)
    if (entries.length) {
      lines.push('### 📋 معلومات أساسية', '')
      lines.push('| الخاصية | القيمة |')
      lines.push('|---------|--------|')
      for (const [k,v] of entries) lines.push(`| **${k}** | ${v}${ref('Wikidata')} |`)
      lines.push('')
    }
  }

  // ── النبذة من Wikipedia ──────────────────────────────────────────────────
  if (wikiExtract?.extract && wikiExtract.extract.length > 30 && entityType !== ENTITY_TYPE.ROLE_QUERY) {
    lines.push('### 📖 نبذة', '')
    const extract = wikiExtract.extract.slice(0, 900).trim()
    // أضف رقم المرجع [N] في نهاية أول جملة
    const firstDot = extract.indexOf('.')
    const citedExtract = firstDot > 0
      ? extract.slice(0, firstDot + 1) + ref('Wikipedia') + extract.slice(firstDot + 1)
      : extract + ref('Wikipedia')
    lines.push(citedExtract)
    lines.push('')
  } else if (!wikiExtract && dbpediaResult?.comment) {
    lines.push('### 📖 نبذة', '')
    lines.push(dbpediaResult.comment.slice(0, 500) + ref('DBpedia'))
    lines.push('')
  }

  // ── Source Cards (أسلوب ChatGPT) ─────────────────────────────────────────
  if (sourceCards.length > 0) {
    lines.push('---', '')
    lines.push('**المصادر:**', '')
    for (const s of sourceCards) {
      lines.push(`**[${s.num}]** ${s.icon} [**${s.label}** — *${s.title}*](${s.url})`)
      if (s.note) lines.push(`   > ${s.note.slice(0, 100)}`)
      lines.push('')
    }
    const now = new Date().toLocaleDateString('ar-DZ')
    lines.push(`> 🗓️ *آخر تحقق: ${now}*`)
  }

  return lines.join('\n')
}

function _buildLowConfidenceResponse(entity) {
  const enc = encodeURIComponent(entity)
  return [
    `## 🔍 لم أتمكن من التحقق من "${entity}" بثقة كافية (أقل من 72%)`,
    '',
    'للتأكد من المعلومات، يُرجى الرجوع مباشرة للمصادر:',
    '',
    '| المصدر | الرابط |',
    '|--------|--------|',
    `| 📚 **ويكيبيديا العربية** | [بحث](https://ar.wikipedia.org/w/index.php?search=${enc}) |`,
    `| 🔗 **Wikidata** | [بحث](https://www.wikidata.org/w/index.php?search=${enc}) |`,
    `| 🌐 **DBpedia** | [بحث](https://dbpedia.org/search?query=${enc}) |`,
    `| 🔍 **Google** | [بحث](https://www.google.com/search?q=${enc}) |`,
    '',
    '> ⚠️ *درجة الثقة أقل من 72% — لا يمكن الجزم بالمعلومات بدون مصدر موثوق*',
  ].join('\n')
}

// ══════════════════════════════════════════════════════════════════════════
// § 6 — MAIN ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════

export async function resolveKnowledgeEntity(query = '') {
  const q = query.trim()
  if (!q || q.length < 2) return null

  // ① تصنيف النية
  const classification = classifyEntityIntent(q)
  if (!classification.shouldHandle) {
    return {
      content: null,
      model: 'knowledge-entity-redirect',
      found: false, confidence: 0,
      intent: classification.intent,
      redirectTo: classification.redirectTo,
      redirectReason: classification.redirectReason,
    }
  }

  // ② FAST PATH — أسئلة العاصمة من القاموس الثابت (بدون API)
  const _capQuery = _extractCapitalQuery(q)
  if (_capQuery) {
    const _capKey = _capQuery.replace(/^ال/, '')
    const _capData = CAPITALS_MAP[_capQuery] || CAPITALS_MAP[_capKey]
                  || CAPITALS_MAP['ال' + _capKey] || CAPITALS_MAP[_capQuery.replace(/^ال/, '')]
    if (_capData) {
      console.log(`[KnowledgeEntity] 🏛️ Static capital: "${_capQuery}" → "${_capData.capital}"`)
      return {
        content: _buildCapitalResponse(_capQuery, _capData),
        model: 'dz-knowledge-static-capitals',
        found: true,
        confidence: 1.0,
        _bypassLLM: true,
      }
    }
  }

  const entityResult = extractEntity(q)
  if (!entityResult) return null

  const { entity, entityAr, type: entityType, isRole } = entityResult
  console.log(`[KnowledgeEntity] 🔍 entity="${entity}" type="${entityType}"`)

  // ③ Cache check
  const cacheKey = isRole ? `role:${entity}` : entity
  const cached   = _cacheGet(cacheKey)
  if (cached) {
    console.log(`[KnowledgeEntity] ⚡ Cache: "${cacheKey}"`)
    return { ...cached, _fromCache: true }
  }

  let wikidataResult = null
  let wikiExtract    = null
  let dbpediaResult  = null
  let roleData       = null
  let confidence     = 0

  // ④ ROLE QUERY — استخدام SPARQL للمناصب الحالية
  if (isRole) {
    const sparqlResult = await _sparqlCurrentLeader(entity).catch(() => null)
    if (sparqlResult?.name) {
      roleData   = sparqlResult
      confidence = 0.90
      console.log(`[KnowledgeEntity] ✅ SPARQL leader: "${sparqlResult.name}"`)

      // جلب Wikipedia للشخص
      if (sparqlResult.personId) {
        const personInfo = await _fetchPersonByWikidataId(sparqlResult.personId).catch(() => null)
        if (personInfo?.arWiki) {
          wikiExtract = await _fetchWikipediaExtract(personInfo.arWiki, 'ar').catch(() => null)
        } else if (personInfo?.enWiki) {
          wikiExtract = await _fetchWikipediaExtract(personInfo.enWiki, 'en').catch(() => null)
        }
        if (!wikiExtract && sparqlResult.name) {
          wikiExtract = await _searchWikipediaAR(sparqlResult.name).catch(() => null)
        }
      }
    } else {
      // SPARQL فشل — fallback إلى بحث عادي بالاسم الإنجليزي
      console.log(`[KnowledgeEntity] ⚠️ SPARQL failed for "${entity}", trying direct search`)
      wikidataResult = await _fetchWikidataEntity(entity, 'en').catch(() => null)
      if (!wikidataResult) wikidataResult = await _fetchWikidataEntity(entityAr || entity, 'ar').catch(() => null)
    }
  }

  // ⑤-A  WORK / AUTHOR QUERY — "من هو مؤلف رواية X؟"
  //       نبحث عن العمل الأدبي ثم نستخرج مؤلفه عبر Wikipedia infobox
  let workTitle = null
  if (entityType === ENTITY_TYPE.WORK) {
    // استخراج عنوان العمل من الاستعلام
    const workMatch = q.match(/(?:كتاب|رواية|فيلم|مسرحية|ديوان|مسلسل|أغنية)\s+(.{2,60}?)(?:\s*[؟?])?$/)
    workTitle = workMatch?.[1]?.trim() || entity
    // ابحث عن العمل في Wikipedia
    const workWiki = await _searchWikipediaAR(workTitle).catch(() => null)
    if (workWiki) {
      // استخرج اسم المؤلف من النص
      const authorMatch = workWiki.extract?.match(/(?:ألّفه|كتبه|مؤلفه|تأليف)\s+([^\n،,،]{3,50})/i)
      if (authorMatch?.[1]) {
        const authorName = authorMatch[1].trim()
        wikidataResult = await _fetchWikidataEntity(authorName).catch(() => null)
        if (!wikiExtract) {
          wikiExtract = await _searchWikipediaAR(authorName).catch(() => null) || workWiki
        }
      } else {
        // لا نجد اسم مؤلف صريح — استخدم نتيجة العمل نفسه
        wikiExtract = workWiki
      }
    }
    if (!wikidataResult) wikidataResult = await _fetchWikidataEntity(workTitle).catch(() => null)
  }

  // ⑤ GENERAL ENTITY — Wikidata + DBpedia بالتوازي
  if (!isRole || (!roleData && !wikidataResult)) {
    const searchTerm = entity
    const [wdRes, dbRes] = await Promise.all([
      wikidataResult ? Promise.resolve(wikidataResult) : _fetchWikidataEntity(searchTerm).catch(() => null),
      _fetchDBpedia(searchTerm).catch(() => null),
    ])
    if (!wikidataResult) wikidataResult = wdRes
    dbpediaResult = dbRes

    // Fallback إلى English إذا كانت الكلمة في COUNTRY_MAP وفشل البحث العربي
    if (!wikidataResult && !wikiExtract) {
      const enFallback = COUNTRY_MAP[entity] || COUNTRY_MAP[entity.replace(/^ال/, '')]
      if (enFallback) {
        wikidataResult = await _fetchWikidataEntity(enFallback, 'en').catch(() => null)
      }
    }
  }

  // ⑥ Wikipedia Extract
  if (!wikiExtract) {
    if (wikidataResult?.wikiTitle) {
      wikiExtract = await _fetchWikipediaExtract(wikidataResult.wikiTitle, wikidataResult.wikiLang || 'ar').catch(() => null)
    }
    // إذا فشل البحث العربي جرب مصطلحات أخرى
    if (!wikiExtract) {
      wikiExtract = await _searchWikipediaAR(entity).catch(() => null)
    }
    // للكيانات الجغرافية: جرب الاسم الإنجليزي إذا فشل العربي
    if (!wikiExtract && entityType === ENTITY_TYPE.GEOGRAPHIC) {
      const enName = COUNTRY_MAP[entity] || COUNTRY_MAP[entity.replace(/^ال/, '')]
      if (enName) {
        const enWiki = await _fetchWikipediaExtract(enName, 'en').catch(() => null)
        if (enWiki) wikiExtract = enWiki
      }
    }
  }

  // ⑦ Confidence scoring
  if (!confidence) {
    if (roleData)            confidence = 0.90
    else if (wikidataResult) confidence = wikidataResult.confidence || 0.80
    else if (wikiExtract)    confidence = 0.78
    else if (dbpediaResult)  confidence = 0.65
    else                     confidence = 0
  }

  // ⑦-B رفع الثقة للكيانات الجغرافية المعروفة (دول / مدن مُسجّلة في خرائطنا)
  if (entityType === ENTITY_TYPE.GEOGRAPHIC && confidence < MIN_CONFIDENCE) {
    const _clean = entity.replace(/^ال/, '')
    const _isKnown = COUNTRY_MAP[entity] || COUNTRY_MAP[_clean]
                  || ALGERIAN_CITIES[entity] || ALGERIAN_CITIES[_clean]
                  || CAPITALS_MAP[entity] || CAPITALS_MAP[_clean]
    if (_isKnown) {
      confidence = Math.max(confidence, 0.76)
    }
  }

  // ⑦-C رفع الثقة عند تطابق DBpedia label مع اسم الكيان
  //   (يحمي من الهلوسة — لا يرفع إلا إذا وجد DBpedia تطابقاً حقيقياً)
  if (dbpediaResult && confidence < MIN_CONFIDENCE) {
    const _n = s => s.replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').toLowerCase().trim()
    const _dl = _n(dbpediaResult.label || '')
    const _eq = _n(entity)
    const _words = _eq.split(/\s+/).filter(w => w.length > 2)
    const _matched = _words.filter(w => _dl.includes(w)).length
    const _ratio   = _words.length ? _matched / _words.length : 0
    if (_ratio >= 0.5 || _dl.includes(_eq) || _eq.includes(_dl)) {
      // DBpedia وجد كيانات يتطابق اسمها مع الاستعلام → نثق به
      confidence = Math.max(confidence, 0.74)
    }
  }

  // ⑦-D رفع الثقة عند وجود DBpedia + Wikipedia معاً
  if (dbpediaResult && wikiExtract && confidence < MIN_CONFIDENCE) {
    confidence = 0.78
  }

  // ⑧ Hallucination guard — كيانات غير موجودة أو ثقة منخفضة جداً
  // نعتبر DBpedia مصدراً صالحاً أيضاً
  const hasNoResults = !roleData && !wikidataResult && !wikiExtract && !dbpediaResult
  const _effectiveMin = entityType === ENTITY_TYPE.GEOGRAPHIC ? MIN_CONFIDENCE_GEO : MIN_CONFIDENCE
  if (hasNoResults || confidence < _effectiveMin) {
    const result = {
      content: _buildLowConfidenceResponse(entity),
      model: 'knowledge-entity-low-confidence',
      found: false, confidence, intent: ENTITY_INTENT.KNOWLEDGE_QUERY,
    }
    if (!hasNoResults) _cacheSet(cacheKey, result)
    return result
  }

  // ⑨ Build response
  const content = _buildEntityResponse({
    entity, entityType, wikidataResult, wikiExtract, dbpediaResult,
    confidence, roleData, originalQuery: q,
  })
  if (!content) return null

  const result = {
    content,
    model: roleData ? 'knowledge-entity-sparql'
         : wikidataResult ? 'knowledge-entity-wikidata'
         : wikiExtract    ? 'knowledge-entity-wikipedia'
         : 'knowledge-entity-dbpedia',
    found: true, confidence,
    intent: ENTITY_INTENT.KNOWLEDGE_QUERY,
    entityName: roleData?.name || wikidataResult?.label || wikiExtract?.title || entity,
    entityType,
    sources: [
      roleData       ? 'Wikidata-SPARQL' : null,
      wikidataResult ? 'Wikidata'         : null,
      wikiExtract    ? 'Wikipedia'        : null,
      dbpediaResult  ? 'DBpedia'          : null,
    ].filter(Boolean),
    lastVerified: new Date().toISOString(),
  }

  _cacheSet(cacheKey, result)
  console.log(`[KnowledgeEntity] ✅ "${entity}" model=${result.model} conf=${(confidence*100).toFixed(0)}% sources=${result.sources.join('+')}`)
  return result
}

// ══════════════════════════════════════════════════════════════════════════
// § 7 — ROUTING POLICY CONSTANT
// ══════════════════════════════════════════════════════════════════════════

export const ENTITY_ROUTING_POLICY = `
## 🔴 قواعد التوجيه الصارمة — DZ Knowledge Entity Agent v2.1

مسؤوليات هذا الوكيل (WHO / WHAT فقط):
- الشخصيات العامة: رؤساء، وزراء، علماء، فنانون، رياضيون، شخصيات تاريخية
- الكيانات الجغرافية: دول، ولايات، مدن، بلديات، مناطق
- الأعمال الفكرية: كتب، أفلام، أغانٍ (مؤلف / مخرج / ملحن)
- المناصب الحالية: رئيس دولة X عبر Wikidata SPARQL (بيانات حديثة)

محظور تماماً:
- ❌ أحداث حية (اليوم / آخر لقاء / تصريح) → Search Agent
- ❌ خرائط وخدمات محلية (أقرب مستشفى) → Maps Agent
- ❌ مقدمو خدمات (أريد طبيباً) → Service Agent
- ❌ اختراع معلومات — LLM للتنسيق فقط وليس كمصدر حقائق

إذا انخفضت الثقة عن 72%: أرجع روابط المصادر مباشرة — لا تخترع إجابة.
`.trim()
