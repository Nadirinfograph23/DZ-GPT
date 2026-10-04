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

export function isAlgerianRadioStation(station) {
  const country = normalize(station?.country).trim()
  return station?.category === 'algeria' || String(station?.countrycode || '').trim().toUpperCase() === 'DZ' || country === 'algeria'
}

export function matchesRadioCategory(station, category = 'all') {
  if (!category || category === 'all') return true
  const definition = RADIO_CATEGORY_FILTERS.find(item => item.id === category)
  if (!definition) return false
  const stationText = normalize([station?.name, station?.tags, station?.language].filter(Boolean).join(' '))
  return definition.keywords.some(keyword => stationText.includes(normalize(keyword)))
}

export function filterRadioStations(stations, { country = 'all', category = 'all' } = {}) {
  return stations.filter(station => (country !== 'algeria' || isAlgerianRadioStation(station)) && matchesRadioCategory(station, category))
}
