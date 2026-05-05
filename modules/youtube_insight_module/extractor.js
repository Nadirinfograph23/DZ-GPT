/**
 * YouTube Insight Module — Extractor
 * Handles all YouTube data fetching: URL detection, video info, search, captions.
 * Uses youtube-sr and @distube/ytdl-core (already installed in the project).
 * No external API key required for basic extraction.
 */

import YouTubeSR from 'youtube-sr'
import ytdl from '@distube/ytdl-core'

// ── Regex patterns for YouTube URL detection ─────────────────────────────────
const YT_URL_PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  /youtube\.com\/watch\?.*&v=([A-Za-z0-9_-]{11})/,
]

/**
 * Detect whether a string is a YouTube URL or a search query.
 * @param {string} input
 * @returns {{ type: 'url'|'search', videoId: string|null, query: string }}
 */
export function detectInput(input) {
  const str = String(input || '').trim()
  for (const pattern of YT_URL_PATTERNS) {
    const match = str.match(pattern)
    if (match) return { type: 'url', videoId: match[1], query: str }
  }
  return { type: 'search', videoId: null, query: str }
}

/**
 * Search YouTube for videos matching a query.
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function searchVideos(query, limit = 8) {
  try {
    const results = await YouTubeSR.YouTube.search(query, { limit, type: 'video', safeSearch: false })
    return (results || []).map(v => ({
      id: v.id,
      title: v.title || '',
      channel: v.channel?.name || '',
      thumbnail: v.thumbnail?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      duration: v.durationFormatted || '',
      views: v.views || 0,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      uploadedAt: v.uploadedAt || '',
    }))
  } catch (err) {
    console.warn('[YouTubeInsight:Extractor] search error:', err.message)
    return []
  }
}

/**
 * Fetch detailed video metadata using ytdl-core.
 * Falls back to youtube-sr if ytdl fails.
 * @param {string} videoId
 * @returns {Promise<Object>}
 */
export async function fetchVideoData(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`
  let data = null

  // Strategy 1: ytdl-core — rich metadata
  try {
    const info = await ytdl.getInfo(url)
    const details = info.videoDetails || {}
    const keywords = details.keywords || []
    data = {
      id: videoId,
      url,
      title: details.title || '',
      description: (details.description || '').slice(0, 3000),
      channel: details.ownerChannelName || details.author?.name || '',
      channelId: details.channelId || '',
      duration: details.lengthSeconds ? formatDuration(Number(details.lengthSeconds)) : '',
      durationSeconds: Number(details.lengthSeconds) || 0,
      views: Number(details.viewCount) || 0,
      likes: Number(details.likes) || 0,
      thumbnail: details.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      tags: keywords.slice(0, 20),
      publishDate: details.publishDate || '',
      isLive: details.isLiveContent || false,
      category: details.category || '',
    }
  } catch (ytdlErr) {
    console.warn('[YouTubeInsight:Extractor] ytdl-core failed, trying youtube-sr:', ytdlErr.message)

    // Strategy 2: youtube-sr scraper
    try {
      const v = await YouTubeSR.YouTube.getVideo(url)
      if (v) {
        data = {
          id: videoId,
          url,
          title: v.title || '',
          description: (v.description || '').slice(0, 3000),
          channel: v.channel?.name || '',
          channelId: v.channel?.id || '',
          duration: v.durationFormatted || '',
          durationSeconds: v.duration || 0,
          views: v.views || 0,
          likes: 0,
          thumbnail: v.thumbnail?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          tags: [],
          publishDate: v.uploadedAt || '',
          isLive: v.live || false,
          category: '',
        }
      }
    } catch (srErr) {
      console.warn('[YouTubeInsight:Extractor] youtube-sr also failed:', srErr.message)
    }
  }

  if (!data) {
    // Minimal fallback with just the ID
    data = {
      id: videoId,
      url,
      title: '',
      description: '',
      channel: '',
      channelId: '',
      duration: '',
      durationSeconds: 0,
      views: 0,
      likes: 0,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      tags: [],
      publishDate: '',
      isLive: false,
      category: '',
    }
  }

  // Try to fetch captions
  data.captions = await fetchCaptions(videoId)
  data.captionSource = data.captions ? 'youtube-timedtext' : 'none'

  return data
}

/**
 * Attempt to fetch auto-generated or manual captions via YouTube's timedtext API.
 * Tries Arabic then French then English.
 * @param {string} videoId
 * @returns {Promise<string|null>}
 */
export async function fetchCaptions(videoId) {
  const langs = ['ar', 'fr', 'en', 'en-US', 'en-GB']
  for (const lang of langs) {
    try {
      const capUrl = `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}&fmt=json3`
      const r = await fetch(capUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'ar,en;q=0.9,fr;q=0.8',
        },
        signal: AbortSignal.timeout(6000),
      })
      if (!r.ok) continue
      const json = await r.json().catch(() => null)
      if (!json?.events) continue
      const text = json.events
        .filter(e => e.segs)
        .map(e => e.segs.map(s => s.utf8 || '').join(''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text.length > 50) {
        return text.slice(0, 8000)
      }
    } catch {
      // Try next language
    }
  }
  return null
}

/**
 * Format seconds as mm:ss or h:mm:ss
 */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Build a concise text representation of video data for the AI.
 * @param {Object} videoData
 * @returns {string}
 */
export function buildVideoContext(videoData) {
  const parts = []
  if (videoData.title) parts.push(`العنوان: ${videoData.title}`)
  if (videoData.channel) parts.push(`القناة: ${videoData.channel}`)
  if (videoData.duration) parts.push(`المدة: ${videoData.duration}`)
  if (videoData.views) parts.push(`المشاهدات: ${videoData.views.toLocaleString('ar-DZ')}`)
  if (videoData.publishDate) parts.push(`تاريخ النشر: ${videoData.publishDate}`)
  if (videoData.tags?.length) parts.push(`الكلمات المفتاحية: ${videoData.tags.slice(0, 10).join(', ')}`)
  if (videoData.description) parts.push(`\nالوصف:\n${videoData.description.slice(0, 1500)}`)
  if (videoData.captions) parts.push(`\nالنص الكامل (مقتطف):\n${videoData.captions.slice(0, 4000)}`)
  return parts.join('\n')
}
