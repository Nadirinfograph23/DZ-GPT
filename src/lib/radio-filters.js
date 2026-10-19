const normalize = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '')
  .toLowerCase()

export const RADIO_CATEGORY_FILTERS = [
  { id: 'religious', label: 'القرآن والدين', keywords: ['quran', 'islamic', 'religious', 'religion', 'recitation', 'قرآن', 'إسلام', 'ديني', 'دينية'] },
  { id: 'news', label: 'الأخبار', keywords: ['news', 'info', 'actualite', 'current affairs', 'أخبار', 'اخبار', 'إخبار'] },
  { id: 'music', label: 'الموسيقى', keywords: ['music', 'pop', 'rock', 'jazz', 'classical', 'classique', 'dance', 'hits', 'hit', 'rai', 'موسيقى', 'أغاني', 'راي'] },
  { id: 'sports', label: 'الرياضة', keywords: ['sport', 'football', 'soccer', 'رياضة', 'كرة القدم'] },
  { id: 'culture', label: 'الثقافة والأمازيغية', keywords: ['culture', 'cultural', 'kabyle', 'amazigh', 'tamazight', 'mozabite', 'ثقافة', 'قبائلي', 'أمازيغ', 'مزابي'] },
  { id: 'talk', label: 'حوارات وبرامج', keywords: ['talk', 'spoken', 'podcast', 'interview', 'discussion', 'debate', 'حوارات', 'حوار', 'حديث', 'برامج'] },
]

export const RADIO_COUNTRY_FILTERS = [
  { id: 'algeria', label: 'الجزائر', flag: '🇩🇿', codes: ['DZ'], names: ['algeria'] },
  { id: 'france', label: 'فرنسا', flag: '🇫🇷', codes: ['FR'], names: ['france'] },
  { id: 'uk', label: 'بريطانيا', flag: '🇬🇧', codes: ['GB', 'UK'], names: ['united kingdom', 'great britain', 'britain', 'england', 'scotland', 'wales'] },
  { id: 'us', label: 'الولايات المتحدة', flag: '🇺🇸', codes: ['US'], names: ['united states', 'usa', 'america'] },
  { id: 'egypt', label: 'مصر', flag: '🇪🇬', codes: ['EG'], names: ['egypt'] },
]

const COUNTRY_CODES_BY_NAME = {
  algeria: 'DZ', france: 'FR', 'united kingdom': 'GB', 'great britain': 'GB', britain: 'GB', uk: 'GB',
  'the united kingdom of great britain and northern ireland': 'GB',
  'united states': 'US', 'united states of america': 'US', 'the united states of america': 'US', usa: 'US', america: 'US',
  egypt: 'EG', morocco: 'MA', tunisia: 'TN', lebanon: 'LB', jordan: 'JO', 'saudi arabia': 'SA', switzerland: 'CH',
}

export function getRadioCountryFlag(station) {
  let code = String(station?.countrycode || '').trim().toUpperCase()
  if (code === 'UK') code = 'GB'
  if (!/^[A-Z]{2}$/.test(code)) code = COUNTRY_CODES_BY_NAME[normalize(station?.country).trim()] || ''
  if (!/^[A-Z]{2}$/.test(code)) return ''
  return [...code].map(letter => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('')
}

export function isAlgerianRadioStation(station) {
  const country = normalize(station?.country).trim()
  return station?.category === 'algeria' || String(station?.countrycode || '').trim().toUpperCase() === 'DZ' || country === 'algeria'
}

export function matchesRadioCountry(station, country = 'all') {
  if (!country || country === 'all') return true
  if (country === 'algeria') return isAlgerianRadioStation(station)
  const definition = RADIO_COUNTRY_FILTERS.find(item => item.id === country)
  if (!definition) return false
  const code = String(station?.countrycode || '').trim().toUpperCase()
  if (definition.codes.includes(code)) return true
  const name = normalize(station?.country).trim()
  return definition.names.some(alias => name.includes(normalize(alias)))
}

export function matchesRadioCategory(station, category = 'all') {
  if (!category || category === 'all') return true
  const definition = RADIO_CATEGORY_FILTERS.find(item => item.id === category)
  if (!definition) return false
  const stationText = normalize([station?.name, station?.tags, station?.language].filter(Boolean).join(' '))
  return definition.keywords.some(keyword => stationText.includes(normalize(keyword)))
}

export function filterRadioStations(stations, { country = 'all', category = 'all' } = {}) {
  return stations.filter(station => matchesRadioCountry(station, country) && matchesRadioCategory(station, category))
}
