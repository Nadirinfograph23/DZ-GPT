import { extractMetadata } from './extractor.js'
import { metadataCache } from './cache.js'
import { extractVideoId } from './security.js'
import { monitor } from './monitor.js'
import { checkFfmpeg } from './ffmpeg.js'
import { randomUserAgent } from './antiBot.js'

// Invidious instances (live-probed 2026-05)
const INVIDIOUS_INSTANCES = [
  'https://invidious.materialio.us',
  'https://iv.ggtyler.dev',
  'https://invidious.protokolla.fi',
  'https://inv.in.projectsegfau.lt',
  'https://invidious.privacyredirect.com',
  'https://invidious.fdn.fr',
]

// Piped API instances (live-probed 2026-05)
const PIPED_API_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://piapi.ggtyler.dev',
  'https://pipedapi.kavin.rocks',
  'https://api.piped.privacydev.net',
  'https://pipedapi.adminforge.de',
]

// ytdown.to UA and endpoints
const _YTDOWN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

// ── ytdown.to fallback stream resolver ───────────────────────────
// Polls ytdown.to's worker API to get a direct download URL.
// Returns { url, ext, mime } or null if unavailable.
export async function fetchYtdownStream(youtubeUrl, format = 'mp3') {
  try {
    const body = new URLSearchParams({ url: youtubeUrl }).toString()
    const headers = {
      'User-Agent': _YTDOWN_UA,
      'Origin': 'https://app.ytdown.to',
      'Referer': 'https://app.ytdown.to/fr23/',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': '*/*',
    }
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 18000)
    let data
    try {
      const r = await fetch('https://app.ytdown.to/proxy.php', { method: 'POST', headers, body, signal: ctrl.signal })
      clearTimeout(t)
      if (!r.ok) return null
      data = await r.json().catch(() => null)
    } catch { clearTimeout(t); return null }

    const api = data?.api
    if (!api || String(api.status || '').toLowerCase() !== 'ok') return null
    const items = Array.isArray(api.mediaItems) ? api.mediaItems : []

    // Pick item based on format
    let item
    if (format === 'mp3') {
      item = items.find(m => m.type === 'Audio' && String(m.mediaExtension || '').toUpperCase() === 'MP3')
    } else if (format === 'audio' || format === 'm4a') {
      const audios = items.filter(m => m.type === 'Audio' && String(m.mediaExtension || '').toUpperCase() === 'M4A')
      audios.sort((a, b) => parseInt(b.mediaQuality || 0) - parseInt(a.mediaQuality || 0))
      item = audios[0]
    } else {
      const videos = items.filter(m => m.type === 'Video' && String(m.mediaExtension || '').toUpperCase() === 'MP4')
      item = videos[0]
    }
    if (!item?.mediaUrl) return null

    // Poll for direct download URL
    const pollUrl = item.mediaUrl
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 200 : 1200))
      try {
        const pr = await fetch(pollUrl, {
          headers: { 'User-Agent': _YTDOWN_UA, 'Referer': 'https://app.ytdown.to/', 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        })
        if (!pr.ok) continue
        const pd = await pr.json().catch(() => null)
        if (!pd) continue
        const status = String(pd.status || '').toLowerCase()
        const fileUrl = pd.fileUrl || pd.file_url || pd.url
        if ((status === 'completed' || status === 'done' || fileUrl) && fileUrl) {
          const ext = format === 'mp3' ? 'mp3' : (format === 'audio' || format === 'm4a') ? 'm4a' : 'mp4'
          const mime = format === 'mp3' ? 'audio/mpeg' : (ext === 'm4a' ? 'audio/mp4' : 'video/mp4')
          return { url: fileUrl, ext, mime, source: 'ytdown' }
        }
        if (status === 'error' || status === 'failed') return null
      } catch {}
    }
    return null
  } catch {
    return null
  }
}

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

// ── Stream URL fetchers (fallback when yt-dlp is blocked) ─────────

export async function fetchInvidiousStream(videoId, { isAudio = true, height = 720 } = {}) {
  const results = INVIDIOUS_INSTANCES.map(async (base) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    try {
      const r = await fetch(
        `${base}/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`,
        { signal: ctrl.signal, headers: { 'User-Agent': randomUserAgent() } }
      )
      clearTimeout(t)
      if (!r.ok) return null
      const j = await r.json()
      if (j.error) return null

      if (isAudio) {
        const audios = (j.adaptiveFormats || []).filter(a => a?.type?.startsWith('audio/'))
        if (!audios.length) return null
        const m4a = audios.filter(a => a.type.includes('mp4') || a.type.includes('m4a'))
        const pool = m4a.length ? m4a : audios
        pool.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        const pick = pool[0]
        if (!pick?.itag) return null
        return {
          url: `${base}/latest_version?id=${encodeURIComponent(videoId)}&itag=${pick.itag}&local=true`,
          mime: pick.type.includes('webm') ? 'audio/webm' : 'audio/mp4',
          ext: pick.type.includes('webm') ? 'webm' : 'm4a',
          source: 'invidious',
        }
      } else {
        const combined = (j.formatStreams || []).filter(v => v?.itag && (!v.type || v.type.includes('mp4')))
        combined.sort((a, b) => (parseInt(b.resolution || 0) || 0) - (parseInt(a.resolution || 0) || 0))
        const pick = combined.find(v => (parseInt(v.resolution || 0) || 0) <= height) || combined[0]
        if (!pick?.itag) return null
        return {
          url: `${base}/latest_version?id=${encodeURIComponent(videoId)}&itag=${pick.itag}&local=true`,
          mime: 'video/mp4',
          ext: 'mp4',
          source: 'invidious',
        }
      }
    } catch { clearTimeout(t); return null }
  })
  try {
    return await Promise.any(results.map(p => p.then(v => v || Promise.reject(new Error('null')))))
  } catch { return null }
}

export async function fetchPipedStream(videoId, { isAudio = true, height = 720 } = {}) {
  const results = PIPED_API_INSTANCES.map(async (base) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    try {
      const r = await fetch(`${base}/streams/${videoId}`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': randomUserAgent() },
      })
      clearTimeout(t)
      if (!r.ok) return null
      const j = await r.json()
      if (j.error) return null

      if (isAudio) {
        const audios = (j.audioStreams || []).filter(a => a?.url)
        if (!audios.length) return null
        const m4a = audios.filter(a => !(a.format || '').toLowerCase().includes('webm'))
        const pool = m4a.length ? m4a : audios
        pool.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        const pick = pool[0]
        return { url: pick.url, mime: pick.mimeType || 'audio/mp4', ext: (pick.format || '').toLowerCase().includes('webm') ? 'webm' : 'm4a', source: 'piped' }
      } else {
        const videos = (j.videoStreams || []).filter(v => v?.url && v.videoOnly === false)
        const pool = videos.length ? videos : (j.videoStreams || []).filter(v => v?.url)
        if (!pool.length) return null
        pool.sort((a, b) => (b.height || 0) - (a.height || 0))
        const pick = pool.find(v => (v.height || 0) <= height) || pool[pool.length - 1]
        return { url: pick.url, mime: pick.mimeType || 'video/mp4', ext: (pick.format || '').toLowerCase().includes('webm') ? 'webm' : 'mp4', source: 'piped' }
      }
    } catch { clearTimeout(t); return null }
  })
  try {
    return await Promise.any(results.map(p => p.then(v => v || Promise.reject(new Error('null')))))
  } catch { return null }
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
