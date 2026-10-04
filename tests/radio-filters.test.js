import assert from 'node:assert/strict'
import { filterRadioStations, isAlgerianRadioStation, matchesRadioCategory, RADIO_CATEGORY_FILTERS } from '../src/lib/radio-filters.js'

const stations = [
  { stationuuid: 'dz-quran', name: 'Radio Coran', country: 'Algeria', countrycode: 'DZ', category: 'algeria', tags: 'quran,islamic', language: 'Arabic' },
  { stationuuid: 'dz-news', name: 'Radio Algerie Chaine 3', country: 'Algeria', category: 'algeria', tags: 'news,information', language: 'French' },
  { stationuuid: 'fr-music', name: 'Jazz Radio Paris', country: 'France', countrycode: 'FR', category: 'international', tags: 'jazz,music', language: 'French' },
  { stationuuid: 'dz-culture', name: 'Radio Kabyle', country: 'Algeria', countrycode: 'DZ', tags: 'kabyle,amazigh,culture', language: 'Tamazight' },
]

assert.deepEqual(filterRadioStations(stations).map(station => station.stationuuid), ['dz-quran', 'dz-news', 'fr-music', 'dz-culture'])
assert.deepEqual(filterRadioStations(stations, { country: 'algeria' }).map(station => station.stationuuid), ['dz-quran', 'dz-news', 'dz-culture'])
assert.deepEqual(filterRadioStations(stations, { category: 'music' }).map(station => station.stationuuid), ['fr-music'])
assert.deepEqual(filterRadioStations(stations, { country: 'algeria', category: 'culture' }).map(station => station.stationuuid), ['dz-culture'])
assert.equal(isAlgerianRadioStation({ country: 'Algéria' }), true)
assert.equal(matchesRadioCategory(stations[0], 'religious'), true)
assert.equal(matchesRadioCategory(stations[1], 'religious'), false)
assert.equal(RADIO_CATEGORY_FILTERS.length, 6)
console.log('Radio filter tests passed (8 assertions).')
