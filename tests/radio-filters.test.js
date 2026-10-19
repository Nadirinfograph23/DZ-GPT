import assert from 'node:assert/strict'
import { filterRadioStations, getRadioCountryFlag, isAlgerianRadioStation, matchesRadioCategory, matchesRadioCountry, RADIO_CATEGORY_FILTERS, RADIO_COUNTRY_FILTERS } from '../src/lib/radio-filters.js'

const stations = [
  { stationuuid: 'dz-quran', name: 'Radio Coran', country: 'Algeria', countrycode: 'DZ', category: 'algeria', tags: 'quran,islamic', language: 'Arabic' },
  { stationuuid: 'dz-news', name: 'Radio Algerie Chaine 3', country: 'Algeria', countrycode: 'DZ', category: 'algeria', tags: 'news,information', language: 'French' },
  { stationuuid: 'fr-music', name: 'Jazz Radio Paris', country: 'France', countrycode: 'FR', category: 'international', tags: 'jazz,music', language: 'French' },
  { stationuuid: 'dz-culture', name: 'Radio Kabyle', country: 'Algeria', countrycode: 'DZ', tags: 'kabyle,amazigh,culture', language: 'Tamazight' },
  { stationuuid: 'uk-news', name: 'BBC World Service', country: 'The United Kingdom Of Great Britain And Northern Ireland', countrycode: 'GB', category: 'international', tags: 'news,talk,english', language: 'English' },
  { stationuuid: 'us-music', name: 'KEXP 90.3', country: 'United States', countrycode: 'US', category: 'international', tags: 'music,rock,indie', language: 'English' },
  { stationuuid: 'eg-quran', name: 'Cairo Quran Radio', country: 'Egypt', countrycode: 'EG', category: 'arabic', tags: 'quran,religious', language: 'Arabic' },
]

assert.deepEqual(filterRadioStations(stations).map(station => station.stationuuid), ['dz-quran', 'dz-news', 'fr-music', 'dz-culture', 'uk-news', 'us-music', 'eg-quran'])
assert.deepEqual(filterRadioStations(stations, { country: 'algeria' }).map(station => station.stationuuid), ['dz-quran', 'dz-news', 'dz-culture'])
assert.deepEqual(filterRadioStations(stations, { country: 'france' }).map(station => station.stationuuid), ['fr-music'])
assert.deepEqual(filterRadioStations(stations, { country: 'uk' }).map(station => station.stationuuid), ['uk-news'])
assert.deepEqual(filterRadioStations(stations, { country: 'us' }).map(station => station.stationuuid), ['us-music'])
assert.deepEqual(filterRadioStations(stations, { country: 'egypt' }).map(station => station.stationuuid), ['eg-quran'])
assert.deepEqual(filterRadioStations(stations, { category: 'music' }).map(station => station.stationuuid), ['fr-music', 'us-music'])
assert.deepEqual(filterRadioStations(stations, { country: 'egypt', category: 'religious' }).map(station => station.stationuuid), ['eg-quran'])
assert.equal(isAlgerianRadioStation({ country: 'Algéria' }), true)
assert.equal(matchesRadioCategory(stations[0], 'religious'), true)
assert.equal(matchesRadioCategory(stations[1], 'religious'), false)
assert.equal(matchesRadioCountry(stations[4], 'uk'), true)
assert.equal(matchesRadioCountry(stations[5], 'france'), false)
assert.equal(getRadioCountryFlag(stations[2]), '🇫🇷')
assert.equal(getRadioCountryFlag(stations[4]), '🇬🇧')
assert.equal(getRadioCountryFlag(stations[5]), '🇺🇸')
assert.equal(getRadioCountryFlag(stations[6]), '🇪🇬')
assert.equal(RADIO_CATEGORY_FILTERS.length, 6)
assert.equal(RADIO_COUNTRY_FILTERS.length, 5)
console.log('Radio country/category tests passed (19 assertions).')
