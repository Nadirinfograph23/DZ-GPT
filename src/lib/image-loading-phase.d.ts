export type LoadingCategory = 'image' | 'news' | 'currency' | 'sports' | 'weather' | 'prayer' | 'code' | 'history' | 'quran' | 'github' | 'general'
export const IMAGE_REQUEST_RE: RegExp
export function detectLoadingCategory(msg: string): LoadingCategory
export function getLoadingPhases(msg: string): string[]
