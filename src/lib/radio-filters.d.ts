export type RadioCountryFilter = 'all' | 'algeria' | 'france' | 'uk' | 'us' | 'egypt'
export type RadioCategoryFilter = 'all' | 'religious' | 'news' | 'music' | 'sports' | 'culture' | 'talk'
export interface RadioFilterStation { name: string; country?: string; countrycode?: string; category?: string; tags?: string; language?: string }
export interface RadioCategoryDefinition { id: Exclude<RadioCategoryFilter, 'all'>; label: string; keywords: readonly string[] }
export interface RadioCountryDefinition { id: Exclude<RadioCountryFilter, 'all'>; label: string; flag: string; codes: readonly string[]; names: readonly string[] }
export const RADIO_CATEGORY_FILTERS: readonly RadioCategoryDefinition[]
export const RADIO_COUNTRY_FILTERS: readonly RadioCountryDefinition[]
export function getRadioCountryFlag(station: RadioFilterStation): string
export function isAlgerianRadioStation(station: RadioFilterStation): boolean
export function matchesRadioCountry(station: RadioFilterStation, country?: RadioCountryFilter): boolean
export function matchesRadioCategory(station: RadioFilterStation, category?: RadioCategoryFilter): boolean
export function filterRadioStations<T extends RadioFilterStation>(stations: readonly T[], filters?: { country?: RadioCountryFilter; category?: RadioCategoryFilter }): T[]
