export interface ImageSearchResult {
  url: string
  fullUrl: string
  title: string
  source?: string
  sourceUrl?: string
  creator?: string
  [key: string]: unknown
}

export function normalizeImageResults(results: unknown, limit?: number): ImageSearchResult[]
