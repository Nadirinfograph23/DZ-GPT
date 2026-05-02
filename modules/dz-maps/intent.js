/**
 * DZ Maps — Intent Detection Engine v3
 * Detects map/location queries in Arabic, French, Darija (Algerian dialect).
 * Enhanced with full keyword coverage and smart routing detection.
 */

const POI_TYPES = {
  hospital: {
    labels: [
      'مستشفى','مستشفيات','عيادة','عيادات','طوارئ','مركز صحي','صحة','مريض',
      'إسعاف','صحي','مستعجلات','polyclinique','hôpital','hopital','clinique','urgences','sante',
      // Darija
      'سبيطار','الطوارئ','مركز طبي',
    ],
    osm: 'amenity~"hospital|clinic|doctors"',
    icon: '🏥',
    nameAr: 'مستشفى / عيادة',
  },
  mosque: {
    labels: [
      'مسجد','مساجد','جامع','جوامع','صلاة','مصلى','mosquée','mosquee','masjid',
      'صلاة الجمعة','مكان الصلاة',
    ],
    osm: 'amenity=place_of_worship][religion=muslim',
    icon: '🕌',
    nameAr: 'مسجد',
  },
  restaurant: {
    labels: [
      'مطعم','مطاعم','أكل','طعام','وجبة','وجبات','كافيه','كافيتيريا','بيتزا',
      'برغر','سندويش','مأكولات','فطور','غداء','عشاء','قهوة',
      'restaurant','manger','nourriture','pizza','burger','café','cafe','brasserie','snack',
      // Darija
      'ماكلة','ماكلة قريبة','كلشي ياكلو','نقصد ياكل',
    ],
    osm: 'amenity~"restaurant|fast_food|cafe"',
    icon: '🍽️',
    nameAr: 'مطعم',
  },
  fuel: {
    labels: [
      'محطة بنزين','محطة وقود','بنزين','وقود','نفط','محطة','كازواير','نفطال',
      'station service','carburant','essence','naftal','gazole','gasoil','pompe',
      // Darija
      'ستاسيون','عبي الكار','محطة الكار',
    ],
    osm: 'amenity=fuel',
    icon: '⛽',
    nameAr: 'محطة وقود',
  },
  school: {
    labels: [
      'مدرسة','مدارس','ثانوية','متوسطة','ابتدائية','جامعة','جامعات','معهد',
      'كلية','تعليم','دراسة','école','lycée','université','collège','college','école primaire',
      'faculté','faculte','institut','enseignement',
      // Darija
      'مدرسة قريبة','اقرب جامعة','اقرب مدرسة',
    ],
    osm: 'amenity~"school|university|college"',
    icon: '🏫',
    nameAr: 'مدرسة / جامعة',
  },
  bank: {
    labels: [
      'بنك','بنوك','صراف','سحب نقود','ATM','صراف آلي','بنك الجزائر','CPA','BADR','BNA','BEA',
      'banque','distributeur','cpa','badr','bnp','cic','atm','guichet',
      // Darija
      'بنك قريب','بيرو دي بوست','بريد الجزائر كاش',
    ],
    osm: 'amenity~"bank|atm"',
    icon: '🏦',
    nameAr: 'بنك / صراف آلي',
  },
  pharmacy: {
    labels: [
      'صيدلية','صيدليات','دواء','أدوية','دوا','علاج','صيدلاني',
      'pharmacie','médicaments','pharmacie','pharma','medicaments',
      // Darija
      'الفارماسيان','الدوا','دواء قريب',
    ],
    osm: 'amenity=pharmacy',
    icon: '💊',
    nameAr: 'صيدلية',
  },
  police: {
    labels: [
      'شرطة','درك','مركز شرطة','أمن','مفوضية','مخفر','دائرة أمن','مصلحة الأمن',
      'police','gendarmerie','commissariat','sûreté','surete',
      // Darija
      'الشرطة','قسم الشرطة','مركز الأمن',
    ],
    osm: 'amenity~"police|ranger_station"',
    icon: '👮',
    nameAr: 'مركز الشرطة',
  },
  post_office: {
    labels: [
      'بريد','مكتب بريد','طرد','تحويل مال','بريد الجزائر',
      'colis','poste','algérie poste','poste algerie','CCP','mandat',
      // Darija
      'البوسطة','بوسطة الجزائر','البريد',
    ],
    osm: 'amenity=post_office',
    icon: '📮',
    nameAr: 'مكتب البريد',
  },
  supermarket: {
    labels: [
      'سوبرماركت','سوق','بقالة','تسوق','محل','دكان','ماركت',
      'supermarché','supermarche','marché','carrefour','alimentation','épicerie','epicerie',
      // Darija
      'السوبر','حانوت','الحوانت','يتسوق',
    ],
    osm: 'shop~"supermarket|convenience|grocery"',
    icon: '🛒',
    nameAr: 'سوبرماركت / بقالة',
  },
  hotel: {
    labels: [
      'فندق','فنادق','إقامة','نزل','مبيت','إيواء','نزيل',
      'hôtel','hotel','auberge','logement','hébergement','hebergement','pension',
      // Darija
      'الأوتيل','الفندق القريب','فين نبات',
    ],
    osm: 'tourism~"hotel|hostel|guest_house"',
    icon: '🏨',
    nameAr: 'فندق',
  },
  park: {
    labels: [
      'حديقة','حدائق','متنزه','ملعب','فضاء أخضر',
      'parc','jardin','espace vert','promenade',
      // Darija
      'الحديقة','جردينة','الجردينة',
    ],
    osm: 'leisure~"park|garden"',
    icon: '🌳',
    nameAr: 'حديقة',
  },
  airport: {
    labels: [
      'مطار','مطارات','طيران','رحلة جوية','المطار',
      'aéroport','aeroport','vol','terminal','aviation',
      // Darija
      'المطار القريب','مطار وهران','مطار الجزائر',
    ],
    osm: 'aeroway=aerodrome',
    icon: '✈️',
    nameAr: 'مطار',
  },
  government: {
    labels: [
      'بلدية','ولاية','إدارة','مصلحة','وكالة','دائرة','قضاء','محكمة',
      'تسجيل','وثيقة','شهادة','بطاقة تعريف','جواز سفر',
      'mairie','wilaya','administration','daïra','daira','tribunal','justice',
      'service administratif','mairie','prefecture',
      // Darija
      'البلدية','الولاية','الدائرة','المكتب','خدمات إدارية',
    ],
    osm: 'amenity~"townhall|government|public_building"',
    icon: '🏛️',
    nameAr: 'إدارة / بلدية',
  },
  parking: {
    labels: [
      'ركن سيارة','ركن','موقف سيارات','بارك','parkage','parc de stationnement',
      'parking','stationnement',
      // Darija
      'باركيNG','وين نوقف الكار',
    ],
    osm: 'amenity=parking',
    icon: '🅿️',
    nameAr: 'موقف سيارات',
  },
}

// Map query trigger words — Arabic, French, Darija
const MAP_TRIGGER_WORDS = [
  // Arabic — core geographic intent words
  'خريطة','خارطة','أين','وين','قريب','بالقرب','بالقرب من','حول','حولي',
  'مكان','موقع','عنوان','إحداثيات','أقرب','ابحث عن','دلني','دلّني',
  'طريق','مسار','اتجاه','الاتجاه','المسافة','مسافة','بعيد','كيف أصل',
  'كيف نوصل','كيف أذهب','كيف أروح','GPS','location','إلى أين','من أين',
  'موقعي','محيطي','في المنطقة','قريب مني','قريبة مني','قريبون مني',
  // French
  'carte','map','où','localiser','près de','autour','trouver','itinéraire',
  'route','comment aller','direction','chemin','distance','à proximité',
  'proche','autour de moi','mon emplacement','localisation',
  // Darija (Algerian dialect)
  'فين','وين','قداش بعيد','كيفاش نروح','من وين','روحة','بعيد وقت','وين نلقاه',
  'وين هو','دلني وين','شو الطريق','مسافة','ولاية','بلدية','دائرة',
  'وين راه','كيفاش نوصل','اقرب','الاقرب','نبغي نروح',
]

const ROUTING_WORDS = [
  // Arabic
  'طريق','مسار','من','إلى','الى','كيف أصل','كيف نوصل','كيف أذهب','كيف أروح',
  'دلني على الطريق','المسافة بين','الوقت بين','رحلة','مشوار','بكم ساعة',
  // French
  'itinéraire','route','comment aller','de ... à','direction vers','aller à',
  'trajet','chemin vers','combien de km','distance de',
  // Darija
  'من وين','كيفاش نروح','كيفاش نوصل','مشوار من','المسافة من','من ... لـ','من ... الى',
]

// GPS proximity words — used to detect "near me" intent
export const GPS_PROXIMITY_WORDS = [
  'حولي','بالقرب مني','قريب مني','قريبة مني','بالقرب','موقعي','في محيطي',
  'à proximité','autour de moi','près de moi','near me','close to me','nearby',
  'حواليا','قريب مني','الأقرب لي','من حوالي',
]

/**
 * Returns detected POI type key or null
 */
export function detectPoiType(msg) {
  const lower = msg.toLowerCase()
  for (const [key, def] of Object.entries(POI_TYPES)) {
    if (def.labels.some(lbl => lower.includes(lbl.toLowerCase()))) return key
  }
  return null
}

/**
 * Returns true if message is a map/location query
 */
export function isMapQuery(msg) {
  if (!msg) return false
  const lower = msg.toLowerCase()
  const hasTrigger = MAP_TRIGGER_WORDS.some(w => lower.includes(w.toLowerCase()))
  const hasPoi = detectPoiType(msg) !== null
  return hasTrigger || hasPoi
}

/**
 * Returns true if message contains GPS proximity intent ("near me")
 */
export function hasGpsIntent(msg) {
  if (!msg) return false
  const lower = msg.toLowerCase()
  return GPS_PROXIMITY_WORDS.some(w => lower.includes(w.toLowerCase()))
}

/**
 * Returns true if message is a routing/directions query
 */
export function isRoutingQuery(msg) {
  if (!msg) return false
  const lower = msg.toLowerCase()
  // Must have routing word + either "من" pattern with "إلى" or known structure
  const hasRoutingWord = ROUTING_WORDS.some(w => lower.includes(w.toLowerCase()))
  const hasFromTo = /من\s+\S+.*(?:إلى|الى|لـ|ل\s)/i.test(msg) ||
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
    // Arabic: من X إلى/الى Y
    /من\s+([^\s\u060C،,]+(?:\s+[^\s\u060C،,إالى]+)*?)\s+(?:إلى|الى|لـ|ل)\s+(.+?)(?:\s*[؟?]|$)/,
    /من\s+(.+?)\s+(?:إلى|الى)\s+(.+?)(?:\s|$)/,
    // French: de X à/vers Y
    /de\s+(.+?)\s+(?:à|vers|a)\s+(.+?)(?:\s|$)/i,
    // English: from X to Y
    /from\s+(.+?)\s+to\s+(.+?)(?:\s|$)/i,
    // Darija: من X لـ/ل Y
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
    'في','ب','بـ','حول','بالقرب من','قريب من','داخل','بداخل',
    'à','en','dans','près de','autour de','au centre de','à',
    'in','near','around','at',
    'في ولاية','في مدينة','في بلدية',
  ]
  let loc = null
  for (const prep of preps) {
    const re = new RegExp(`${prep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+([\\u0600-\\u06FFa-zA-ZÀ-ÿ][\\u0600-\\u06FFa-zA-ZÀ-ÿ\\s\\-]{1,40})`, 'i')
    const m = cleaned.match(re)
    if (m && m[1]) { loc = m[1].trim(); break }
  }
  // If still null, try to find wilaya number pattern (ولاية 31)
  if (!loc) {
    const wilayaNum = cleaned.match(/ولاية\s+(\d{1,2})/)
    if (wilayaNum) loc = `wilaya ${wilayaNum[1]}`
  }
  return loc
}

export { POI_TYPES }
