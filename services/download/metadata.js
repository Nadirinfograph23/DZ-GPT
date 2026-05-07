import { extractMetadata } from './extractor.js'
import { metadataCache } from './cache.js'
import { extractVideoId } from './security.js'
import { monitor } from './monitor.js'
import { checkFfmpeg } from './ffmpeg.js'

const INVIDIOUS_INSTANCES = [
  'https://invidious.snopyta.org',
  'https://vid.puffyan.us',
  'https://invidious.kavin.rocks',
  'https://inv.riverside.rocks',
]

async function fetchOEmbed(url) {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!r.ok) return null
    const j = await r.json()
    return { title: j.title, channel: j.author_name, thumbnail: j.thumbnail_url }
  } catch { return null }
}

async function fetchInvidiousInfo(videoId) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const r = await fetch(`${base}/api/v1/videos/${videoId}?fields=title,author,viewCount,lengthSeconds,published,videoThumbnails`, {
        signal: AbortSignal.timeout(6000),
      })
      if (!r.ok) continue
      const j = await r.json()
      const thumb = (j.videoThumbnails || []).find(t => t.quality === 'maxres') || j.videoThumbnails?.[0]
      return {
        title: j.title,
        channel: j.author,
        views: j.viewCount,
        duration: j.lengthSeconds,
        uploadDate: j.published ? new Date(j.published * 1000).toISOString().slice(0, 10).replace(/-/g, '') : null,
        thumbnail: thumb?.url || null,
        _source: 'invidious',
      }
    } catch {}
  }
  return null
}

export async function getVideoMetadata(url, opts = {}) {
  const videoId = extractVideoId(url)
  const cacheKey = 'meta:' + url

  if (!opts.bypassCache) {
    const cached = metadataCache.get(cacheKey)
    if (cached) return { ...cached, _fromCache: true }
  }

  let result = null

  try {
    result = await extractMetadata(url, opts)
  } catch (e) {
    monitor.warn('[metadata] yt-dlp extraction failed: ' + e.message.slice(0, 100))

    if (videoId) {
      const [oembed, invidious] = await Promise.allSettled([
        fetchOEmbed(url),
        fetchInvidiousInfo(videoId),
      ])
      const o = oembed.status === 'fulfilled' ? oembed.value : null
      const iv = invidious.status === 'fulfilled' ? invidious.value : null
      if (o || iv) {
        result = {
          id: videoId,
          title: iv?.title || o?.title || 'بدون عنوان',
          thumbnail: iv?.thumbnail || o?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: iv?.duration || 0,
          channel: iv?.channel || o?.channel || '',
          views: iv?.views || 0,
          uploadDate: iv?.uploadDate || null,
          formats: [],
          audioFormats: [],
          _source: iv ? 'invidious' : 'oembed',
          _cachedAt: Date.now(),
        }
        metadataCache.set(cacheKey, result)
      }
    }

    if (!result) throw e
  }

  const hasFfmpeg = await checkFfmpeg()
  const heights = (result.formats || []).map(f => f.height).filter(Boolean)
  const uniqueHeights = [...new Set(heights)].sort((a, b) => b - a)

  return {
    ...result,
    hasFfmpeg,
    heights: uniqueHeights,
    downloadableHeights: computeDownloadableHeights(uniqueHeights, hasFfmpeg),
    available: {
      mp4: uniqueHeights.length > 0,
      mp3: true,
      audio: true,
    },
  }
}

function computeDownloadableHeights(heights, hasFfmpeg) {
  if (!hasFfmpeg) {
    return heights.includes(360) ? [360] : (heights.includes(720) ? [720] : heights.slice(0, 1))
  }
  const standard = [2160, 1440, 1080, 720, 480, 360, 240, 144]
  const result = []
  for (const h of standard) {
    if (heights.some(fh => fh >= h)) result.push(h)
  }
  return result.length > 0 ? result : heights.slice(0, 5)
}
