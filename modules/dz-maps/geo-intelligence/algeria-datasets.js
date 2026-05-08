/**
 * GeoIntelligence — Algeria Extended Local Datasets
 * Augments the existing algeria-geo-db.js with:
 *   - Famous mosques with exact coordinates
 *   - Key public institutions
 *   - Major neighborhoods / districts
 *   - Well-known landmarks
 *   - Common alternate spellings & aliases
 */

// ── FAMOUS MOSQUES ─────────────────────────────────────────────────────────
export const FAMOUS_MOSQUES = [
  { name: 'مسجد الجامع الكبير', nameFr: 'Grande Mosquée d\'Alger', city: 'الجزائر', lat: 36.7754, lng: 3.0588, type: 'mosque' },
  { name: 'مسجد كتشاوة', nameFr: 'Mosquée Ketchaoua', city: 'الجزائر', lat: 36.7831, lng: 3.0596, type: 'mosque' },
  { name: 'مسجد الأمير عبد القادر', nameFr: 'Mosquée Emir Abdelkader', city: 'قسنطينة', lat: 36.3719, lng: 6.6094, type: 'mosque' },
  { name: 'مسجد سيدي بومدين', nameFr: 'Mosquée Sidi Boumediene', city: 'تلمسان', lat: 34.8811, lng: -1.3164, type: 'mosque' },
  { name: 'مسجد الأغا', nameFr: 'Mosquée Agha', city: 'الجزائر', lat: 36.7468, lng: 3.0573, type: 'mosque' },
  { name: 'مسجد سيدي رمضان', nameFr: 'Mosquée Sidi Ramdan', city: 'الجزائر', lat: 36.7844, lng: 3.0619, type: 'mosque' },
  { name: 'الجامع الجديد الكبير', nameFr: 'Grande Mosquée d\'Alger (nouvelle)', city: 'الجزائر', lat: 36.8022, lng: 3.0583, type: 'mosque' },
  { name: 'مسجد سيدي سحنون', nameFr: 'Mosquée Sidi Sahnoune', city: 'قسنطينة', lat: 36.3650, lng: 6.6111, type: 'mosque' },
]

// ── MAJOR INSTITUTIONS ─────────────────────────────────────────────────────
export const PUBLIC_INSTITUTIONS = [
  { name: 'مطار هواري بومدين الدولي', nameFr: 'Aéroport Houari Boumediene', city: 'الجزائر', lat: 36.6910, lng: 3.2154, type: 'airport' },
  { name: 'مطار أحمد بن بلة', nameFr: 'Aéroport Ahmed Ben Bella', city: 'وهران', lat: 35.6244, lng: -0.6212, type: 'airport' },
  { name: 'مطار محمد بوضياف', nameFr: 'Aéroport Mohamed Boudiaf', city: 'قسنطينة', lat: 36.2760, lng: 6.6204, type: 'airport' },
  { name: 'جامعة الجزائر 1', nameFr: 'Université d\'Alger 1', city: 'الجزائر', lat: 36.7500, lng: 3.0588, type: 'university' },
  { name: 'جامعة وهران 1', nameFr: 'Université d\'Oran 1', city: 'وهران', lat: 35.6989, lng: -0.6328, type: 'university' },
  { name: 'جامعة قسنطينة 1', nameFr: 'Université Constantine 1', city: 'قسنطينة', lat: 36.3719, lng: 6.5700, type: 'university' },
  { name: 'المستشفى الجامعي مصطفى باشا', nameFr: 'CHU Mustapha Bacha', city: 'الجزائر', lat: 36.7483, lng: 3.0631, type: 'hospital' },
  { name: 'المستشفى الجامعي وهران', nameFr: 'CHU Oran', city: 'وهران', lat: 35.7104, lng: -0.6388, type: 'hospital' },
  { name: 'المستشفى الجامعي قسنطينة', nameFr: 'CHU Constantine', city: 'قسنطينة', lat: 36.3483, lng: 6.6058, type: 'hospital' },
  { name: 'البريد المركزي الجزائر', nameFr: 'Poste Centrale Alger', city: 'الجزائر', lat: 36.7408, lng: 3.0572, type: 'post_office' },
  { name: 'محطة القطار الجزائر العاصمة', nameFr: 'Gare d\'Alger', city: 'الجزائر', lat: 36.7368, lng: 3.0875, type: 'station' },
]

// ── FAMOUS LANDMARKS ───────────────────────────────────────────────────────
export const LANDMARKS = [
  { name: 'مقام الشهيد', nameFr: 'Mémorial du Martyr', city: 'الجزائر', lat: 36.7762, lng: 3.0581, type: 'landmark' },
  { name: 'الجزائر العاصمة القصبة', nameFr: 'Casbah d\'Alger', city: 'الجزائر', lat: 36.7867, lng: 3.0606, type: 'historic' },
  { name: 'جسر سيدي مسيد', nameFr: 'Pont de Sidi M\'Cid', city: 'قسنطينة', lat: 36.3670, lng: 6.6094, type: 'landmark' },
  { name: 'صخرة عيلان', nameFr: 'Rochers El Harrach', city: 'قسنطينة', lat: 36.3600, lng: 6.6233, type: 'landmark' },
  { name: 'ميناء الجزائر', nameFr: 'Port d\'Alger', city: 'الجزائر', lat: 36.7700, lng: 3.0508, type: 'port' },
  { name: 'شارع الديمقراطية وهران', nameFr: 'Bd de la Démocratie Oran', city: 'وهران', lat: 35.6976, lng: -0.6337, type: 'street' },
  { name: 'الأهرامات تيبازة', nameFr: 'Pyramides de Tipaza', city: 'تيبازة', lat: 36.5928, lng: 2.4483, type: 'historic' },
  { name: 'دجرجرة تيزي وزو', nameFr: 'Djurdjura Tizi Ouzou', city: 'تيزي وزو', lat: 36.4639, lng: 3.8453, type: 'natural' },
  { name: 'صحراء تمنراست', nameFr: 'Sahara Tamanrasset', city: 'تمنراست', lat: 22.7855, lng: 5.5228, type: 'natural' },
  { name: 'برج الطاسيلي', nameFr: 'Tassili n\'Ajjer', city: 'إيليزي', lat: 25.4644, lng: 8.4778, type: 'natural' },
]

// ── MAJOR NEIGHBORHOODS / DISTRICTS ───────────────────────────────────────
export const NEIGHBORHOODS = [
  { name: 'باب الواد', nameFr: 'Bab El Oued', city: 'الجزائر', lat: 36.7883, lng: 3.0450, type: 'neighbourhood' },
  { name: 'حيدرة', nameFr: 'Hydra', city: 'الجزائر', lat: 36.7400, lng: 3.0178, type: 'neighbourhood' },
  { name: 'بن عكنون', nameFr: 'Ben Aknoun', city: 'الجزائر', lat: 36.7372, lng: 3.0050, type: 'neighbourhood' },
  { name: 'القبة', nameFr: 'El Biar / La Casbah', city: 'الجزائر', lat: 36.7694, lng: 3.0583, type: 'neighbourhood' },
  { name: 'بولوغين', nameFr: 'Bologhine', city: 'الجزائر', lat: 36.8008, lng: 3.0350, type: 'neighbourhood' },
  { name: 'شراقة', nameFr: 'Cheraga', city: 'الجزائر', lat: 36.7658, lng: 2.9556, type: 'neighbourhood' },
  { name: 'الأبيار', nameFr: 'El Biar', city: 'الجزائر', lat: 36.7556, lng: 3.0189, type: 'neighbourhood' },
  { name: 'سيدي بلعباس', nameFr: 'Sidi Bel Abbès', city: 'سيدي بلعباس', lat: 35.1897, lng: -0.6375, type: 'city' },
  { name: 'صيدلية بن مهيدي', nameFr: 'Ben M\'hidi Oran', city: 'وهران', lat: 35.6976, lng: -0.6358, type: 'neighbourhood' },
  { name: 'سطاوالي', nameFr: 'Staoueli', city: 'الجزائر', lat: 36.7422, lng: 2.8822, type: 'neighbourhood' },
]

// ── ALIAS TABLE (common alternate names) ──────────────────────────────────
export const ALIASES = {
  'العاصمة':     { canonical: 'الجزائر', lat: 36.7372, lng: 3.0869 },
  'algiers':     { canonical: 'الجزائر', lat: 36.7372, lng: 3.0869 },
  'alger':       { canonical: 'الجزائر', lat: 36.7372, lng: 3.0869 },
  'oran':        { canonical: 'وهران',   lat: 35.6987, lng: -0.6349 },
  'wahran':      { canonical: 'وهران',   lat: 35.6987, lng: -0.6349 },
  'constantine': { canonical: 'قسنطينة', lat: 36.3650, lng: 6.6147 },
  'qusantina':   { canonical: 'قسنطينة', lat: 36.3650, lng: 6.6147 },
  'annaba':      { canonical: 'عنابة',   lat: 36.9000, lng: 7.7667 },
  'setif':       { canonical: 'سطيف',    lat: 36.1898, lng: 5.4108 },
  'sétif':       { canonical: 'سطيف',    lat: 36.1898, lng: 5.4108 },
  'blida':       { canonical: 'البليدة', lat: 36.4700, lng: 2.8278 },
  'tizi ouzou':  { canonical: 'تيزي وزو', lat: 36.7167, lng: 4.0500 },
  'tlemcen':     { canonical: 'تلمسان',  lat: 34.8831, lng: -1.3160 },
  'bejaia':      { canonical: 'بجاية',   lat: 36.7539, lng: 5.0564 },
  'bejaïa':     { canonical: 'بجاية',   lat: 36.7539, lng: 5.0564 },
  'batna':       { canonical: 'باتنة',   lat: 35.5553, lng: 6.1742 },
  'biskra':      { canonical: 'بسكرة',   lat: 34.8500, lng: 5.7333 },
  'ghardaia':    { canonical: 'غرداية',  lat: 32.4900, lng: 3.6700 },
  'ouargla':     { canonical: 'ورقلة',   lat: 31.9500, lng: 5.3200 },
  'msila':       { canonical: 'المسيلة', lat: 35.7069, lng: 4.5406 },
  'bordj bou arreridj': { canonical: 'برج بوعريريج', lat: 36.0739, lng: 4.7628 },
  'souk ahras':  { canonical: 'سوق أهراس', lat: 36.2869, lng: 7.9514 },
  'el oued':     { canonical: 'الوادي',  lat: 33.3667, lng: 6.8667 },
  'tamanrasset': { canonical: 'تمنراست', lat: 22.7856, lng: 5.5228 },
}

// ── COMBINED ALL DATASETS ──────────────────────────────────────────────────
export const ALL_DATASETS = [
  ...FAMOUS_MOSQUES.map(e => ({ ...e, source: 'local_db', importance: 0.9 })),
  ...PUBLIC_INSTITUTIONS.map(e => ({ ...e, source: 'local_db', importance: 0.95 })),
  ...LANDMARKS.map(e => ({ ...e, source: 'local_db', importance: 0.85 })),
  ...NEIGHBORHOODS.map(e => ({ ...e, source: 'local_db', importance: 0.80 })),
]

/**
 * Search the extended local dataset for a query string.
 * Returns up to maxResults matches with fuzzy scoring.
 */
export function searchExtendedDatasets(query, poiType = null, maxResults = 5) {
  // Dynamic import of fuzzyScore to avoid circular deps
  const normalize = (s) => s ? s.toLowerCase().replace(/[\u0610-\u061A\u064B-\u065F]/g, '').trim() : ''

  const q = normalize(query)
  let candidates = ALL_DATASETS

  // Filter by POI type if specified
  if (poiType) {
    candidates = candidates.filter(c => c.type === poiType || c.type?.includes(poiType))
  }

  const scored = candidates
    .map(c => {
      const scores = [
        c.name ? (normalize(c.name).includes(q) ? 1 : normalize(c.name).startsWith(q) ? 0.9 : 0) : 0,
        c.nameFr ? (normalize(c.nameFr).includes(q) ? 0.9 : 0) : 0,
        q && normalize(c.name).includes(q.slice(0, 4)) ? 0.7 : 0,
      ]
      return { ...c, _score: Math.max(...scores) }
    })
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, maxResults)
    .map(({ _score, ...c }) => ({ ...c, confidence: _score }))

  return scored
}

/**
 * Resolve a known alias to its canonical form + coordinates
 */
export function resolveAlias(query) {
  const normalized = query.toLowerCase().trim()
  return ALIASES[normalized] || null
}
