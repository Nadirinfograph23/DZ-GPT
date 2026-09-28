import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve('lib/doctorSearch.js')
let src = fs.readFileSync(file, 'utf8')
let changed = false

// 1) Invalidate any Worker-memory doctor cache created by older broken parsers.
const oldCache = 'const cacheKey = `${normalizeText(speciality)}|${normalizeText(city)}`'
const newCache = 'const cacheKey = `doctor-v4|${normalizeText(speciality)}|${normalizeText(city)}`'
if (src.includes(oldCache) && !src.includes(newCache)) {
  src = src.replace(oldCache, newCache)
  changed = true
}

// 2) DZDOC uses French option labels while the Agent accepts Arabic queries.
// Resolve the Arabic request to the site's actual labels before looking up IDs.
const oldFilters = `  const specId = findOption(/special/i, speciality)\n  const regionId = findOption(/region|wilaya/i, city)`
const newFilters = `  const DZDOC_SPEC_QUERY = {\n    'طبيب اسنان': 'Chirurgien dentiste',\n    'اسنان': 'Chirurgien dentiste',\n    'طبيب عام': 'Médecin géneraliste',\n    'عام': 'Médecin géneraliste',\n    'طبيب قلب': 'Cardiologue',\n    'قلب': 'Cardiologue',\n    'طبيب اطفال': 'Pédiatre',\n    'اطفال': 'Pédiatre',\n    'طبيب عيون': 'Ophtalmologue',\n    'عيون': 'Ophtalmologue',\n    'طبيب جلدية': 'Dermatologue',\n    'جلدية': 'Dermatologue',\n    'طبيب نساء وتوليد': 'Gynécologue-obstétricien',\n    'نساء': 'Gynécologue-obstétricien',\n    'طبيب نفسي': 'Psychiatre',\n    'نفسي': 'Psychiatre',\n    'طبيب مسالك بولية': 'Urologue',\n    'مسالك': 'Urologue',\n    'طبيب اعصاب': 'Neurologue',\n    'اعصاب': 'Neurologue',\n    'انف واذن وحنجرة': 'ORL',\n    'orl': 'ORL',\n  }\n  const DZDOC_CITY_QUERY = {\n    'الجزائر': 'Alger', 'وهران': 'Oran', 'قسنطينة': 'Constantine', 'عنابة': 'Annaba',\n    'البليدة': 'Blida', 'باتنة': 'Batna', 'سطيف': 'Sétif', 'تلمسان': 'Tlemcen',\n    'بجاية': 'Béjaïa', 'سكيكدة': 'Skikda', 'قالمة': 'Guelma', 'جيجل': 'Jijel',\n    'تيزي وزو': 'Tizi Ouzou', 'بسكرة': 'Biskra', 'مستغانم': 'Mostaganem', 'تيارت': 'Tiaret',\n    'المدية': 'Médéa', 'معسكر': 'Mascara', 'ورقلة': 'Ouargla', 'غرداية': 'Ghardaïa',\n    'الشلف': 'Chlef', 'البويرة': 'Bouira', 'بومرداس': 'Boumerdès', 'المسيلة': "M'sila",\n    'ميلة': 'Mila', 'خنشلة': 'Khenchela', 'سوق اهراس': 'Souk Ahras', 'الوادي': 'El Oued',\n  }\n  const requestedSpec = DZDOC_SPEC_QUERY[norm(speciality)] || speciality\n  const requestedCity = DZDOC_CITY_QUERY[norm(city)] || city\n  let specId = findOption(/special/i, requestedSpec)\n  let regionId = findOption(/region|wilaya/i, requestedCity)\n  // Known public DZDOC filters; dynamic discovery remains the first choice.\n  if (!specId && norm(requestedSpec) === 'chirurgien dentiste') specId = '65'\n  if (!regionId && norm(requestedCity) === 'annaba') regionId = '23'`
if (src.includes(oldFilters) && !src.includes('const DZDOC_SPEC_QUERY')) {
  src = src.replace(oldFilters, newFilters)
  changed = true
}

// 3) Never treat an unresolved filter as a successful source. The caller must
// then use the other live source instead of displaying a fake directory row.
const oldUnresolved = `  if (!specId || !regionId) {\n    return { source: 'dzdoc', results: [{\n      name: \`Annuaire DZDOC — \${speciality} (\${city})\`,\n      speciality, city, address: '', phone: '',\n      profileUrl: url, directoryLink: true,\n    }], sourceUrl: url }\n  }`
const newUnresolved = `  if (!specId || !regionId) {\n    return { source: 'dzdoc', results: [], sourceUrl: 'https://dzdoc.com/recherche.php', error: \`DZDOC filters unresolved: specialty=\${speciality}, city=\${city}\` }\n  }`
if (src.includes(oldUnresolved)) {
  src = src.replace(oldUnresolved, newUnresolved)
  changed = true
}

if (!changed) {
  console.log('doctor-search patch already applied or source layout changed; no changes needed')
} else {
  fs.writeFileSync(file, src)
  console.log('doctor-search production patch applied')
}
