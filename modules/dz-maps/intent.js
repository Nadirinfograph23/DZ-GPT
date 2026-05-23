/**
 * DZ Maps — Intent Detection Engine v4
 * Detects map/location queries in Arabic, French, Darija (Algerian dialect).
 *
 * KEY PRINCIPLE:
 *   A message is a map query ONLY if it has EXPLICIT geographic/navigation intent.
 *   Presence of a city name alone is NOT enough — news, sports, history questions
 *   about a place are NOT map queries.
 */

const POI_TYPES = {
  hospital: {
    labels: [
      'مستشفى','مستشفيات','عيادة','عيادات','طوارئ','مركز صحي','صحة','مريض',
      'إسعاف','صحي','مستعجلات','polyclinique','hôpital','hopital','clinique','urgences','sante',
      'سبيطار','الطوارئ','مركز طبي',
    ],
    osm: 'amenity~"hospital|clinic|doctors"', icon: '🏥', nameAr: 'مستشفى / عيادة',
  },
  mosque: {
    labels: [
      'مسجد','مساجد','جامع','جوامع','صلاة','مصلى','mosquée','mosquee','masjid',
      'صلاة الجمعة','مكان الصلاة',
    ],
    osm: 'amenity=place_of_worship][religion=muslim', icon: '🕌', nameAr: 'مسجد',
  },
  restaurant: {
    labels: [
      'مطعم','مطاعم','أكل','طعام','وجبة','وجبات','كافيه','كافيتيريا','بيتزا',
      'برغر','سندويش','مأكولات','فطور','غداء','عشاء','قهوة',
      'restaurant','manger','nourriture','pizza','burger','café','cafe','brasserie','snack',
      'ماكلة','ماكلة قريبة','كلشي ياكلو',
    ],
    osm: 'amenity~"restaurant|fast_food|cafe"', icon: '🍽️', nameAr: 'مطعم',
  },
  fuel: {
    labels: [
      'محطة بنزين','محطة وقود','بنزين','وقود','نفط','محطة وقود','كازواير','نفطال',
      'station service','carburant','essence','naftal','gazole','gasoil','pompe à essence',
      'ستاسيون','عبي الكار',
    ],
    osm: 'amenity=fuel', icon: '⛽', nameAr: 'محطة وقود',
  },
  school: {
    labels: [
      'مدرسة','مدارس','ثانوية','متوسطة','ابتدائية','جامعة','جامعات','معهد',
      'كلية','تعليم','دراسة','école','lycée','université','collège','college','école primaire',
      'faculté','faculte','institut','enseignement',
      'مدرسة قريبة','اقرب جامعة','اقرب مدرسة',
    ],
    osm: 'amenity~"school|university|college"', icon: '🏫', nameAr: 'مدرسة / جامعة',
  },
  bank: {
    labels: [
      'بنك','بنوك','صراف','سحب نقود','ATM','صراف آلي','بنك الجزائر','CPA','BADR','BNA','BEA',
      'banque','distributeur','cpa','badr','bnp','atm','guichet automatique',
      'بنك قريب','بيرو دي بوست',
    ],
    osm: 'amenity~"bank|atm"', icon: '🏦', nameAr: 'بنك / صراف آلي',
  },
  pharmacy: {
    labels: [
      'صيدلية','صيدليات','دواء','أدوية','دوا','علاج','صيدلاني',
      'pharmacie','médicaments','pharmacie','pharma','medicaments',
      'الفارماسيان','الدوا','دواء قريب',
    ],
    osm: 'amenity=pharmacy', icon: '💊', nameAr: 'صيدلية',
  },
  police: {
    labels: [
      'شرطة','درك','مركز شرطة','أمن','مفوضية','مخفر','دائرة أمن','مصلحة الأمن',
      'police','gendarmerie','commissariat','sûreté','surete',
      'الشرطة','قسم الشرطة','مركز الأمن',
    ],
    osm: 'amenity~"police|ranger_station"', icon: '👮', nameAr: 'مركز الشرطة',
  },
  post_office: {
    labels: [
      'بريد','مكتب بريد','طرد','تحويل مال','بريد الجزائر',
      'colis','poste','algérie poste','poste algerie','CCP','mandat',
      'البوسطة','بوسطة الجزائر','البريد',
    ],
    osm: 'amenity=post_office', icon: '📮', nameAr: 'مكتب البريد',
  },
  supermarket: {
    labels: [
      'سوبرماركت','سوق','بقالة','تسوق','محل','دكان','ماركت',
      'supermarché','supermarche','marché','carrefour','alimentation','épicerie','epicerie',
      'السوبر','حانوت','الحوانت',
    ],
    osm: 'shop~"supermarket|convenience|grocery"', icon: '🛒', nameAr: 'سوبرماركت / بقالة',
  },
  hotel: {
    labels: [
      'فندق','فنادق','إقامة','نزل','مبيت','إيواء','نزيل',
      'hôtel','hotel','auberge','logement','hébergement','hebergement','pension',
      'الأوتيل','الفندق القريب','فين نبات',
    ],
    osm: 'tourism~"hotel|hostel|guest_house"', icon: '🏨', nameAr: 'فندق',
  },
  park: {
    labels: [
      'حديقة','حدائق','متنزه','ملعب','فضاء أخضر',
      'parc','jardin','espace vert','promenade',
      'الحديقة','جردينة',
    ],
    osm: 'leisure~"park|garden"', icon: '🌳', nameAr: 'حديقة',
  },
  airport: {
    labels: [
      'مطار','مطارات','طيران','رحلة جوية','المطار',
      'aéroport','aeroport','vol','terminal','aviation',
      'المطار القريب','مطار وهران','مطار الجزائر',
    ],
    osm: 'aeroway=aerodrome', icon: '✈️', nameAr: 'مطار',
  },
  government: {
    labels: [
      'بلدية','ولاية','إدارة','مصلحة','وكالة','دائرة','قضاء','محكمة',
      'تسجيل','وثيقة','شهادة','بطاقة تعريف','جواز سفر',
      'mairie','wilaya','administration','daïra','daira','tribunal','justice',
      'service administratif','mairie','prefecture',
      'البلدية','الولاية','الدائرة','المكتب',
    ],
    osm: 'amenity~"townhall|government|public_building"', icon: '🏛️', nameAr: 'إدارة / بلدية',
  },
  parking: {
    labels: [
      'ركن سيارة','ركن','موقف سيارات','بارك','parkage','parc de stationnement',
      'parking','stationnement',
      'باركيNG','وين نوقف الكار',
    ],
    osm: 'amenity=parking', icon: '🅿️', nameAr: 'موقف سيارات',
  },
  bus_station: {
    labels: [
      'محطة المسافرين', 'محطة الحافلات', 'محطة حافلات', 'محطة القطار', 'محطة القطارات',
      'محطة نقل', 'ساحة المسافرين', 'محطة الباص', 'باص', 'حافلة', 'حافلات',
      'ترمينال', 'المحطة الرئيسية',
      'gare routière', 'gare', 'terminal', 'station de bus', 'bus station', 'train station',
      'المحطة', 'الترمينال', 'وين الحافلة', 'وين القطار',
    ],
    osm: 'amenity~"bus_station|train_station|ferry_terminal"', icon: '🚌', nameAr: 'محطة المسافرين',
  },
}

// ── NON-MAP POI MODIFIERS — disqualify POI queries that are informational, not geographic ──
// e.g. "أشهر مطعم" / "تاريخ البلدية" / "ميزانية المستشفى" → NOT map queries
const NON_MAP_POI_MODIFIERS = /(?:أشهر|أفضل|تاريخ|تأسيس|نشأة|ميزانية|هيكل|نظام|دور|وظيفة|مهام|قصة|حكاية|سبب|لماذا|ماذا يفعل|كيف يعمل|معنى|تعريف|شرح|explain|histoire|meilleur|historique)/i

// ── ALGERIAN CITIES / WILAYAS — used for preposition-free detection ──────────
// Pattern: "مطعم سطيف" / "مستشفى نقاوس" / "مسجد في باتنة" — city name without explicit prep
// Ordered longest-first to prevent partial overlap (e.g. "تيزي وزو" before "تيزي")
export const ALGERIA_CITIES_AR = [
  // Wilayas (official names)
  'الجزائر العاصمة', 'البليدة', 'البويرة', 'تيزي وزو', 'أم البواقي', 'برج بوعريريج',
  'سوق أهراس', 'عين الدفلى', 'عين تيموشنت', 'سيدي بلعباس', 'غليزان',
  'رلزيان', 'تيسمسيلت', 'مستغانم', 'خنشلة', 'المسيلة', 'بومرداس', 'تيبازة',
  // Short wilaya names
  'وهران', 'قسنطينة', 'عنابة', 'باتنة', 'سطيف', 'بجاية', 'تلمسان', 'سكيكدة',
  'الجلفة', 'بسكرة', 'ورقلة', 'تبسة', 'قالمة', 'ميلة', 'جيجل', 'معسكر',
  'تيارت', 'الشلف', 'المدية', 'الوادي', 'بشار', 'تندوف', 'إليزي', 'أدرار',
  'غرداية', 'المنيعة', 'تمنراست', 'النعامة', 'البيض', 'الأغواط', 'الطارف',
  // Major cities / communes
  'نقاوس', 'عين مليلة', 'خراطة', 'بريكة', 'تبسة', 'عين البيضاء', 'أم الدواهر',
  'بوفاريك', 'خميس مليانة', 'شرشل', 'رويبة', 'المحمدية', 'حسين داي', 'القبة',
  'بابا علي', 'برج الكيفان', 'الحراش', 'بئر مراد رايس', 'دالي إبراهيم',
  'حيدرة', 'بن عكنون', 'الأبيار', 'شراقة', 'الدار البيضاء', 'سيدي موسى',
  'الرغاية', 'بوزريعة', 'بني مسوس', 'القليعة', 'لقبة', 'تيقزيرت',
  'بجاية', 'سيدي عيش', 'أقبو', 'برج منايل', 'الدلفة', 'ذراع بن خدة',
  'عزازقة', 'الأربعاء', 'بئر الذجر', 'باب الزوار', 'المرسى',
  'ميلة', 'تاجنانت', 'شلغوم العيد', 'تسالة المقراني', 'أولاد جلال',
  'طولقة', 'سيدي خالد', 'مشونش', 'برج زمورة', 'أم بواقي',
  'عين فكرون', 'قسنطينة', 'حامة بوزيان', 'الخروب', 'ديدوش مراد',
  'الزيادية', 'عين الاشياخ', 'مسيلة', 'بريكة', 'عين الكبيرة',
  // Darija spellings of common cities
  'الجزائر', 'وهران', 'قسنطينة', 'عنابة', 'باتنا', 'سطيف',
]

// ── NON-MAP EXCLUSION PATTERNS ───────────────────────────────────────────────
// If a message matches ANY of these, it is NEVER a map query,
// even if it contains location names or geographic keywords.
const NON_MAP_REGEXES = [
  // News, events & current affairs
  /ماذا حدث/i,
  /ما الذي حدث/i,
  /أحداث (اليوم|هذا|الأسبوع)/i,
  /مجريات/i,
  /آخر أخبار/i,
  /أخبار (اليوم|هذا|الأخيرة|عاجلة|الساعة)/i,
  /ماذا جرى/i,
  /ما جديد/i,
  /ما أخبار/i,

  // Sports results & standings (NOT stadium locations)
  /نتائج\s+(فريق|اتحاد|شبيبة|أمل|نجم|مولودية|وفاق|اتحاد|أهلي|ترجي|نادي|كأس|دوري|مباريات)/i,
  /نتائج (اليوم|أمس|هذا الأسبوع|الجولة)/i,
  /ترتيب\s+(الدوري|الفرق|البطولة)/i,
  /هداف (الدوري|البطولة)/i,
  /تشكيلة?\s+(الفريق|اليوم)/i,
  /ملخص المباراة/i,
  /ملخص مباراة/i,
  /اهداف مباراة/i,
  /احصائيات الفريق/i,

  // Website/app/tech creation — موقع means "website" in this context
  /(?:إنشاء|بناء|ابني|أنشئ|اصنع|اعمل|صمم|طور|انشاء)\s+(موقع|تطبيق|صفحة)/i,
  /موقع\s+(ويب|الكتروني|إلكتروني|انترنت|web)/i,
  /ويب\s*سايت/i,
  /web\s*site/i,
  /webpage/i,
  /landing\s*page/i,
  /صفحة\s+(ويب|الكترونية|رئيسية)/i,
  /تطبيق (جوال|موبايل|هاتف)/i,
  /اعمل لي (موقع|تطبيق)/i,

  // ── WEB FILE / INDEX REFERENCES ─────────────────────────────────────────
  // "موقع index" / "صفحة index.html" / "ملف index" → web dev context, NEVER map
  // KEY FIX: "موقع" before a filename = website/page, not geographic location
  /(?:موقع|صفحة|ملف|فايل|file)\s+index(?:\.[a-zA-Z0-9]+)?/i,
  /\bindex\.(html?|js|ts|jsx|tsx|php|css|vue|svelte|py|rb|asp|aspx)\b/i,
  /(?:موقع|صفحة|ملف|كود)\s+(?:html?|css|javascript|js|ts|jsx|tsx|react|vue|angular|next|nuxt|vite|django|flask|express|node|php|python)/i,
  /(?:صفحة|ملف)\s+(?:index|main|app|home|header|footer|navbar|style|script|component|layout|base)/i,
  /(?:موقع|تطبيق)\s+(?:react|vue|angular|next\.?js|nuxt|vite|django|flask|express|wordpress|laravel|symfony|spring|rails)/i,
  /(?:تصميم|واجهة|frontend|backend|fullstack|full-stack|UI|UX)/i,
  /(?:function|class\s+\w|variable|const\s+\w|let\s+\w|var\s+\w|import\s+|export\s+|async\s+|await\s+|fetch\(|npm\s+|pip\s+)/i,
  /(?:برمجة|خوارزمية|دالة|متغير|كلاس|مصفوفة|واجهة برمجية|فريمورك|مكتبة|ريبو|repository)/i,
  /\.(html?|css|js|ts|jsx|tsx|py|php|json|xml|yaml|sql|sh)\b/i,

  // Explanation / factual / historical queries (not navigation)
  /(?:اشرح|شرح|explain|ما هو|ما هي|ما معنى|ما تعريف|من هو|من هي)\s+\S/i,
  /(?:تاريخ|تأسيس|نشأة)\s+\S+(الجزائر|تونس|المغرب|وهران|قسنطينة|عنابة|سطيف|باتنة|تيزي|بجاية|تلمسان)/i,
  /(?:حضارة|ثقافة|تراث|عادات|تقاليد)\s+\S/i,
  /(?:عدد|كثافة)\s+السكان/i,
  /مساحة\s+(ولاية|مدينة|بلدية)\s+\S/i,

  // General "how to make/do" queries
  /(?:كيف\s+(?:أعمل|أصنع|أنشئ|أبني|أطور|أتعلم|أحصل|أجد|يمكنني))\s+\S/i,
]

// ── STRONG (UNAMBIGUOUS) MAP INTENT WORDS ────────────────────────────────────
// These alone are sufficient to conclude the message is a map query.
const STRONG_MAP_WORDS = [
  // Arabic — explicit map/navigation intent
  'خريطة', 'خارطة',
  'أين يوجد', 'أين تجد', 'أين هو', 'أين هي', 'أين أجد',
  'وين راه', 'وين هو', 'وين هي', 'وين نلقاه', 'وين نلقى',
  'دلني على', 'دلّني على', 'دلني وين',
  'كيف أصل', 'كيف نوصل', 'كيف أذهب', 'كيف أروح', 'كيف أذهب إلى',
  'كيفاش نروح', 'كيفاش نوصل', 'كيفاش نوصل ل',
  'إلى أين', 'إلى أي', 'ما الاتجاه',
  'قريب مني', 'قريبة مني', 'قريبون مني', 'قريبة من موقعي',
  'حولي', 'بالقرب مني', 'في محيطي', 'حواليا', 'الأقرب لي',
  'موقعي الحالي', 'من موقعي', 'من منطقتي', 'بالقرب من موقعي',
  'اعرض خريطة', 'أرني خريطة', 'أرني على الخريطة',
  'إحداثيات',
  // French
  'carte', 'où est', 'où se trouve', 'comment aller', 'itinéraire',
  'à proximité', 'autour de moi', 'près de moi', 'mon emplacement',
  'localiser', 'localisation', 'chemin vers',
  // English / Darija hybrid
  'near me', 'nearby', 'close to me', 'GPS location', 'show map',
  'فين', 'وين',
]

// GPS proximity words — "near me" intent
export const GPS_PROXIMITY_WORDS = [
  'حولي', 'بالقرب مني', 'قريب مني', 'قريبة مني', 'بالقرب', 'موقعي', 'في محيطي',
  'à proximité', 'autour de moi', 'près de moi', 'near me', 'close to me', 'nearby',
  'حواليا', 'الأقرب لي', 'من حوالي', 'من موقعي', 'من منطقتي',
]

const ROUTING_WORDS = [
  'طريق من', 'مسار من', 'كيف أصل', 'كيف نوصل', 'كيف أذهب', 'كيف أروح',
  'دلني على الطريق', 'المسافة بين', 'الوقت بين', 'مشوار من', 'رحلة من',
  'itinéraire', 'comment aller', 'direction vers', 'trajet',
  'كيفاش نروح', 'كيفاش نوصل', 'من ... الى', 'مشوار من',
]

// Location prepositions — required when only POI keyword present
// NOTE: longer patterns (بالقرب من، بمدينة، بولاية، بمنطقة) must come BEFORE the short ب pattern.
// Arabic prefix ب is written without space (بعنابة، بوهران، بالجزائر).
// (?:^|\s)ب ensures we only match standalone ب preposition, not ب inside words like ابحث/كتاب.
const LOC_PREP_REGEX = /(?:في\s|بالقرب\s+من\s?|قريب\s+من\s|بمدينة\s|بولاية\s|بمنطقة\s|داخل\s|(?:^|\s)ب(?:\s|(?=[\u0600-\u06FF]))|in\s|near\s|à\s|dans\s|en\s|près\s+de\s)/im

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/** Returns detected POI type key or null */
export function detectPoiType(msg) {
  const lower = msg.toLowerCase()
  for (const [key, def] of Object.entries(POI_TYPES)) {
    if (def.labels.some(lbl => lower.includes(lbl.toLowerCase()))) return key
  }
  return null
}

/**
 * Returns true if the message is definitively NOT a map query —
 * news, sports results, website creation, factual/historical questions, etc.
 */
export function isDefinitelyNotMapQuery(msg) {
  if (!msg) return false
  return NON_MAP_REGEXES.some(re => re.test(msg))
}

/**
 * Returns true if the message has a strong, unambiguous map/navigation intent word.
 */
function hasStrongMapIntent(msg) {
  const lower = msg.toLowerCase()
  return STRONG_MAP_WORDS.some(w => lower.includes(w.toLowerCase()))
}

/**
 * Returns true if message is a map/location query.
 *
 * Decision logic (in order):
 *   1. If non-map exclusion matches → false (always)
 *   2. If strong map intent word → true
 *   3. If routing query → true
 *   4. If POI keyword + location preposition → true
 *   4b. If POI keyword + known Algerian city (no preposition needed) → true
 *       e.g. "مطعم سطيف", "مكتب البريد نقاوس", "مسجد الفرقان عنابة"
 *   5. Otherwise → false
 */
export function isMapQuery(msg) {
  if (!msg) return false

  // Step 1 — Exclude non-geographic questions first
  if (isDefinitelyNotMapQuery(msg)) return false

  // Step 2 — Unambiguous geographic/navigation intent
  if (hasStrongMapIntent(msg)) return true

  // Step 3 — Explicit routing (من X إلى Y)
  if (isRoutingQuery(msg)) return true

  const hasPoi = detectPoiType(msg) !== null

  // Step 4 — POI keyword + explicit location preposition
  // e.g. "مستشفى في وهران"
  if (hasPoi && LOC_PREP_REGEX.test(msg)) return true

  // Step 4b — POI keyword + known Algerian city WITHOUT preposition
  // e.g. "مطعم سطيف", "مكتب البريد نقاوس", "صيدلية باتنة"
  if (hasPoi) {
    for (const city of ALGERIA_CITIES_AR) {
      if (msg.includes(city)) return true
    }
  }

  // Step 4c — POI keyword alone (no location) → trigger GPS fallback
  // e.g. "صيدلية", "مطعم", "مسجد", "محطة المسافرين" → show GPS nearby request
  // Guard: skip if message has non-map informational modifier
  if (hasPoi && !NON_MAP_POI_MODIFIERS.test(msg)) return true

  return false
}

/** Returns true if message contains GPS proximity intent ("near me") */
export function hasGpsIntent(msg) {
  if (!msg) return false
  const lower = msg.toLowerCase()
  return GPS_PROXIMITY_WORDS.some(w => lower.includes(w.toLowerCase()))
}

/** Returns true if message is a routing/directions query */
export function isRoutingQuery(msg) {
  if (!msg) return false
  const lower = msg.toLowerCase()
  const hasRoutingWord = ROUTING_WORDS.some(w => lower.includes(w.toLowerCase()))
  const hasFromTo =
    /من\s+\S+.*(?:إلى|الى|لـ|ل\s)/i.test(msg) ||
    /de\s+\S+.*(?:à|vers|a)\s/i.test(msg) ||
    /from\s+\S+.*to\s/i.test(msg)
  return hasRoutingWord && hasFromTo
}

/**
 * Parse origin and destination from routing message
 * e.g. "طريق من وهران إلى سطيف" → { from: "وهران", to: "سطيف" }
 */
export function parseRouting(msg) {
  const patterns = [
    /من\s+([^\s\u060C،,]+(?:\s+[^\s\u060C،,إالى]+)*?)\s+(?:إلى|الى|لـ|ل)\s+(.+?)(?:\s*[؟?]|$)/,
    /من\s+(.+?)\s+(?:إلى|الى)\s+(.+?)(?:\s|$)/,
    /de\s+(.+?)\s+(?:à|vers|a)\s+(.+?)(?:\s|$)/i,
    /from\s+(.+?)\s+to\s+(.+?)(?:\s|$)/i,
    /من\s+(.+?)\s+(?:لـ|ل\s+)(.+?)(?:\s|$)/,
  ]
  for (const pat of patterns) {
    const m = msg.match(pat)
    if (m && m[1] && m[2]) {
      const from = m[1].trim().replace(/^(في|ب|من)\s+/i, '')
      const to   = m[2].trim().replace(/^(في|ب|إلى|الى|لـ|ل)\s+/i, '')
      if (from.length >= 2 && to.length >= 2) return { from, to }
    }
  }
  return null
}

/**
 * Extract location name from message (after removing POI keywords)
 * e.g. "مستشفيات في الجزائر العاصمة" → "الجزائر العاصمة"
 * e.g. "مطعم سطيف"  → "سطيف"  (no preposition needed — city list fallback)
 */
export function extractLocationFromMsg(msg, poiKey) {
  let cleaned = msg
  if (poiKey && POI_TYPES[poiKey]) {
    for (const lbl of POI_TYPES[poiKey].labels) {
      cleaned = cleaned.replace(new RegExp(lbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
    }
  }
  const preps = [
    // Longer/compound preps FIRST so they don't get swallowed by short ب
    'في ولاية', 'في مدينة', 'في بلدية', 'بالقرب من', 'قريب من', 'بداخل', 'داخل',
    'بمدينة', 'بولاية', 'بمنطقة', 'بمحافظة',
    // Then short preps
    'في', 'ب', 'بـ', 'حول',
    // French / English
    'à', 'en', 'dans', 'près de', 'autour de', 'au centre de',
    'in', 'near', 'around', 'at',
  ]
  let loc = null
  for (const prep of preps) {
    const escapedPrep = prep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // For Arabic prefix ب/بـ: allow either space OR direct attachment (بعنابة = ب + عنابة)
    const separator = /^بـ?$/.test(prep) ? '(?:\\s+|(?=[\\u0600-\\u06FF]))' : '\\s+'
    const re = new RegExp(
      `${escapedPrep}${separator}([\\u0600-\\u06FFa-zA-ZÀ-ÿ][\\u0600-\\u06FFa-zA-ZÀ-ÿ\\s\\-]{1,40})`,
      'i'
    )
    const m = cleaned.match(re)
    if (m && m[1]) { loc = m[1].trim(); break }
  }
  // Wilaya number fallback
  if (!loc) {
    const wilayaNum = cleaned.match(/ولاية\s+(\d{1,2})/)
    if (wilayaNum) loc = `wilaya ${wilayaNum[1]}`
  }
  // City-list pass — ALWAYS runs on the original message to:
  //   a) Fill in when no preposition was found ("مطعم سطيف")
  //   b) Fix partial matches caused by ب-preposition false positives
  //      e.g. "صيدلية باتنة" → ب matched inside "باتنة" → loc="اتنة" (wrong) → override to "باتنة"
  for (const city of ALGERIA_CITIES_AR) {
    if (msg.includes(city)) {
      // Override if: no loc yet, OR the known city name is longer/more precise than what was extracted
      if (!loc || city.length > loc.length || !loc.includes(city)) {
        loc = city
      }
      break
    }
  }
  return loc
}

export { POI_TYPES }
