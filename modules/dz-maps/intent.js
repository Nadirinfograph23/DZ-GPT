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
}

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
  // Newspapers & headlines
  /عناوين/i,
  /صحف/i,
  /صحيفة/i,
  /جرائد/i,
  /جريدة/i,
  /الصحف/i,
  /الجرائد/i,
  /newspaper/i,
  /headlines/i,

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
const LOC_PREP_REGEX = /(?:في\s|ب\s|بـ\s|بمدينة\s|بولاية\s|بالقرب\s+من\s|قريب\s+من\s|داخل\s|بمنطقة\s|in\s|near\s|à\s|dans\s|en\s|près\s+de\s)/i

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

  // Step 4 — POI keyword + explicit location preposition
  // e.g. "مستشفى في وهران" (NOT just "مستشفى")
  const hasPoi = detectPoiType(msg) !== null
  if (hasPoi && LOC_PREP_REGEX.test(msg)) return true

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
 */
export function extractLocationFromMsg(msg, poiKey) {
  let cleaned = msg
  if (poiKey && POI_TYPES[poiKey]) {
    for (const lbl of POI_TYPES[poiKey].labels) {
      cleaned = cleaned.replace(new RegExp(lbl, 'gi'), '')
    }
  }
  const preps = [
    'في', 'ب', 'بـ', 'حول', 'بالقرب من', 'قريب من', 'داخل', 'بداخل',
    'à', 'en', 'dans', 'près de', 'autour de', 'au centre de',
    'in', 'near', 'around', 'at',
    'في ولاية', 'في مدينة', 'في بلدية',
  ]
  let loc = null
  for (const prep of preps) {
    const re = new RegExp(
      `${prep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+([\\u0600-\\u06FFa-zA-ZÀ-ÿ][\\u0600-\\u06FFa-zA-ZÀ-ÿ\\s\\-]{1,40})`,
      'i'
    )
    const m = cleaned.match(re)
    if (m && m[1]) { loc = m[1].trim(); break }
  }
  if (!loc) {
    const wilayaNum = cleaned.match(/ولاية\s+(\d{1,2})/)
    if (wilayaNum) loc = `wilaya ${wilayaNum[1]}`
  }
  return loc
}

export { POI_TYPES }
