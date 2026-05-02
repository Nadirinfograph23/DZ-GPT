/**
 * DZ Maps — Intent Detection Engine
 * Detects map/location queries in Arabic, French, and Algerian Darija.
 */

const POI_TYPES = {
  hospital: {
    labels: ['مستشفى','مستشفيات','عيادة','طوارئ','مركز صحي','صحة','hôpital','clinique','urgences','hopital'],
    osm: 'amenity~"hospital|clinic|doctors"',
    icon: '🏥',
    nameAr: 'مستشفى / عيادة',
  },
  mosque: {
    labels: ['مسجد','مساجد','جامع','صلاة','mosquée','mosquee','mosquée'],
    osm: 'amenity=place_of_worship][religion=muslim',
    icon: '🕌',
    nameAr: 'مسجد',
  },
  restaurant: {
    labels: ['مطعم','مطاعم','أكل','طعام','restaurant','manger','nourriture','pizza','burger'],
    osm: 'amenity~"restaurant|fast_food|cafe"',
    icon: '🍽️',
    nameAr: 'مطعم',
  },
  fuel: {
    labels: ['محطة بنزين','بنزين','وقود','نفط','محطة','station service','carburant','essence','naftal'],
    osm: 'amenity=fuel',
    icon: '⛽',
    nameAr: 'محطة وقود',
  },
  school: {
    labels: ['مدرسة','مدارس','ثانوية','متوسطة','ابتدائية','جامعة','école','lycée','université','collège','college'],
    osm: 'amenity~"school|university|college"',
    icon: '🏫',
    nameAr: 'مدرسة / جامعة',
  },
  bank: {
    labels: ['بنك','بنوك','صراف','سحب نقود','ATM','banque','distributeur','cpa','badr','bnp','cic'],
    osm: 'amenity~"bank|atm"',
    icon: '🏦',
    nameAr: 'بنك / صراف آلي',
  },
  pharmacy: {
    labels: ['صيدلية','صيدليات','دواء','pharmacie','médicaments','pharmacie','pharma'],
    osm: 'amenity=pharmacy',
    icon: '💊',
    nameAr: 'صيدلية',
  },
  police: {
    labels: ['شرطة','درك','مركز شرطة','أمن','police','gendarmerie','commissariat'],
    osm: 'amenity~"police|ranger_station"',
    icon: '👮',
    nameAr: 'مركز الشرطة',
  },
  post_office: {
    labels: ['بريد','مكتب بريد','طرد','colis','poste','algérie poste','poste algerie'],
    osm: 'amenity=post_office',
    icon: '📮',
    nameAr: 'مكتب البريد',
  },
  supermarket: {
    labels: ['سوبرماركت','سوق','بقالة','تسوق','supermarché','supermarche','marché','carrefour'],
    osm: 'shop~"supermarket|convenience|grocery"',
    icon: '🛒',
    nameAr: 'سوبرماركت / بقالة',
  },
  hotel: {
    labels: ['فندق','فنادق','إقامة','نزل','hôtel','hotel','auberge','logement'],
    osm: 'tourism~"hotel|hostel|guest_house"',
    icon: '🏨',
    nameAr: 'فندق',
  },
  park: {
    labels: ['حديقة','حدائق','متنزه','parc','jardin'],
    osm: 'leisure~"park|garden"',
    icon: '🌳',
    nameAr: 'حديقة',
  },
  airport: {
    labels: ['مطار','طيران','رحلة','aéroport','aeroport','vol'],
    osm: 'aeroway=aerodrome',
    icon: '✈️',
    nameAr: 'مطار',
  },
  government: {
    labels: ['بلدية','ولاية','إدارة','مصلحة','وكالة','mairie','wilaya','administration','daïra','daira','centre d\'impôts'],
    osm: 'amenity~"townhall|government|public_building"',
    icon: '🏛️',
    nameAr: 'إدارة حكومية',
  },
}

const MAP_TRIGGER_WORDS = [
  // Arabic
  'خريطة','خارطة','أين','وين','قريب','بالقرب','حول','مكان','موقع','عنوان',
  'أقرب','ابحث عن','دلني','دلّني','طريق','مسار','كيف أصل','كيف نوصل',
  'من ... إلى','بعيد','قريب منّي','GPS','location',
  // French
  'carte','map','où','localiser','près de','autour','trouver','itinéraire',
  'route','comment aller','direction','chemin',
  // Darija
  'فين','وين','قداش بعيد','كيفاش نروح','من وين','روحة','مسافة',
]

const ROUTING_WORDS = [
  'طريق','مسار','من','إلى','كيف أصل','كيف نوصل','itinéraire','route',
  'comment aller','من وين','كيفاش نروح','دلني على الطريق',
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
 * Returns true if message is a routing/directions query
 */
export function isRoutingQuery(msg) {
  const lower = msg.toLowerCase()
  return ROUTING_WORDS.some(w => lower.includes(w.toLowerCase()))
}

/**
 * Parse origin and destination from routing message
 * e.g. "طريق من وهران إلى سطيف" → { from: "وهران", to: "سطيف" }
 */
export function parseRouting(msg) {
  const patterns = [
    /من\s+(.+?)\s+(?:إلى|الى)\s+(.+?)(?:\s|$)/,
    /de\s+(.+?)\s+(?:à|vers|a)\s+(.+?)(?:\s|$)/i,
    /from\s+(.+?)\s+to\s+(.+?)(?:\s|$)/i,
  ]
  for (const pat of patterns) {
    const m = msg.match(pat)
    if (m) return { from: m[1].trim(), to: m[2].trim() }
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
  const preps = ['في','ب','حول','بالقرب من','قريب من','à','en','dans','près de','autour de','in','near','around']
  let loc = null
  for (const prep of preps) {
    const re = new RegExp(`${prep}\\s+([\\u0600-\\u06FFa-zA-ZÀ-ÿ][\\u0600-\\u06FFa-zA-ZÀ-ÿ\\s]{1,40})`, 'i')
    const m = cleaned.match(re)
    if (m) { loc = m[1].trim(); break }
  }
  return loc
}

export { POI_TYPES }
