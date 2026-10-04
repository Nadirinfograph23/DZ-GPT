export type RadioCountryFilter = 'all' | 'algeria'
export type RadioCategoryFilter = 'all' | 'religious' | 'news' | 'music' | 'sports' | 'culture' | 'talk'
export interface RadioFilterStation { name: string; country?: string; countrycode?: string; category?: string; tags?: string; language?: string }
export interface RadioCategoryDefinition { id: Exclude<RadioCategoryFilter, 'all'>; label: string; keywords: readonly string[] }
export const RADIO_CATEGORY_FILTERS: readonly RadioCategoryDefinition[]
export function isAlgerianRadioStation(station: RadioFilterStation): boolean
export function matchesRadioCategory(station: RadioFilterStation, category?: RadioCategoryFilter): boolean
export function filterRadioStations<T extends RadioFilterStation>(stations: readonly T[], filters?: { country?: RadioCountryFilter; category?: RadioCategoryFilter }): T[]
