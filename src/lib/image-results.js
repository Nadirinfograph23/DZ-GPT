function isHttpUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Keep only image results with a usable web URL, preferring a thumbnail for display. */
export function normalizeImageResults(results, limit = 12) {
  if (!Array.isArray(results)) return []
  const maxResults = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 12
  return results.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const originalUrl = isHttpUrl(item.url) ? item.url.trim() : ''
    const fullUrl = isHttpUrl(item.fullUrl) ? item.fullUrl.trim() : originalUrl
    const thumbnail = isHttpUrl(item.thumbnail) ? item.thumbnail.trim() : ''
    const url = thumbnail || originalUrl || fullUrl
    if (!url) return []
    const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Image result'
    return [{ ...item, url, fullUrl: fullUrl || url, title }]
  }).slice(0, maxResults)
}
