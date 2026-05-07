import { extractMetadata } from './extractor.js'
import { metadataCache } from './cache.js'
import { extractVideoId } from './security.js'
import { monitor } from './monitor.js'
import { checkFfmpeg } from './ffmpeg.js'
import { randomUserAgent } from './antiBot.js'

// Updated working Invidious instances (2025)
const INVIDIOUS_INSTANCES = [
  'https://invidious.privacyredirect.com',
  'https://invidious.fdn.fr',
  'https://iv.datura.network',
  'https://invidious.nerdvpn.de',
  'https://invidious.lunar.icu',
]

// Working Piped API instances (2025)
const PIPED_API_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.projectsegfau.lt',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.adminforge.de',
]

async function fetchOEmbed(url) {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': randomUserAgent() } }
    )
    if (!r.ok) return null
    const j = await r.json()
    return { title: j.title, channel: j.author_name, thumbnail: j.thumbnail_url }
  } catch { return null }
}

async function fetchInvidiousInfo(videoId) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const r = await fetch(
        `${base}/api/v1/videos/${videoId}?fields=title,author,viewCount,lengthSeconds,published,videoThumbnails`,
        { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': randomUserAgent() } }
      )
      if (!r.ok) continue
      const j = await r.json()
      if (j.error) continue
      const thumb = (j.videoThumbnails || []).find(t => t.quality === 'maxres')
        || (j.videoThumbnails || []).find(t => t.quality === 'high')
        || j.videoThumbnails?.[0]
      monitor.info(`[metadata:invidious] Got info from ${base}`)
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

async function fetchPipedInfo(videoId) {
  for (const base of PIPED_API_INSTANCES) {
    try {
      const r = await fetch(`${base}/streams/${videoId}`, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': randomUserAgent() },
      })
      if (!r.ok) continue
      const j = await r.json()
      if (j.error) continue
      monitor.info(`[metadata:piped] Got info from ${base}`)
      return {
        title: j.title,
        channel: j.uploader,
        views: j.views,
        duration: j.duration,
        uploadDate: j.uploadedDate ? j.uploadedDate.replace(/-/g, '') : null,
        thumbnail: j.thumbnailUrl || null,
        _source: 'piped',
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
      // Try all fallbacks in parallel for speed
      const [oembed, invidious, piped] = await Promise.allSettled([
        fetchOEmbed(url),
        fetchInvidiousInfo(videoId),
        fetchPipedInfo(videoId),
      ])
      const o = oembed.status === 'fulfilled' ? oembed.value : null
      const iv = invidious.status === 'fulfilled' ? invidious.value : null
      const pd = piped.status === 'fulfilled' ? piped.value : null

      const best = iv || pd || o
      if (best || o) {
        result = {
          id: videoId,
          title: best?.title || o?.title || 'بدون عنوان',
          thumbnail: best?.thumbnail || o?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: best?.duration || 0,
          channel: best?.channel || o?.channel || '',
          views: best?.views || 0,
          uploadDate: best?.uploadDate || null,
          description: '',
          formats: [],
          audioFormats: [],
          _source: best?._source || (o ? 'oembed' : 'unknown'),
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
      mp4: uniqueHeights.length > 0 || result._source !== undefined,
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
