/**
 * YouTube Insight Module — Extractor (yt-dlp primary)
 *
 * Strategy:
 *   Video info  → yt-dlp -J  (rich metadata + caption tracks)
 *   Search      → yt-dlp ytsearch:N  with --flat-playlist, fallback to youtube-sr
 *   Captions    → parsed from yt-dlp JSON automatic_captions / subtitles fields,
 *                 then fetched as json3 from YouTube's timedtext CDN
 *
 * yt-dlp is already on PATH in this environment (/nix/store/.../bin/yt-dlp).
 * youtube-sr is kept only as a lightweight search fallback.
 */

import { spawn } from 'child_process'
import YouTubeSR from 'youtube-sr'

// ── yt-dlp binary + shared anti-bot args ─────────────────────────────────────
const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp'

const YTDLP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function antiBotArgs() {
  return [
    '--extractor-args', 'youtube:player_client=android,ios,web',
    '--user-agent', YTDLP_UA,
    '--geo-bypass',
    '--no-check-certificate',
    '--retries', '3',
    '--fragment-retries', '3',
    '--socket-timeout', '20',
  ]
}

/**
 * Run yt-dlp with the given args and return parsed JSON stdout.
 * Rejects on non-zero exit or JSON parse failure.
 */
function runYtDlp(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, args)
    let stdout = ''
    let stderr = ''
    const kill = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch {}
      reject(new Error(`yt-dlp timeout after ${timeoutMs / 1000}s`))
    }, timeoutMs)
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', err => { clearTimeout(kill); reject(err) })
    proc.on('close', code => {
      clearTimeout(kill)
      if (code !== 0) return reject(new Error((stderr || `yt-dlp exited ${code}`).slice(0, 400)))
      try { resolve(JSON.parse(stdout)) } catch (e) { reject(new Error(`JSON parse: ${e.message}`)) }
    })
  })
}

// ── URL / Search detection ────────────────────────────────────────────────────
const YT_URL_RE = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  /youtube\.com\/watch\?.*&v=([A-Za-z0-9_-]{11})/,
]

/**
 * Detect whether a string is a YouTube URL or a plain search query.
 * @param {string} input
 * @returns {{ type: 'url'|'search', videoId: string|null, query: string }}
 */
export function detectInput(input) {
  const str = String(input || '').trim()
  for (const re of YT_URL_RE) {
    const m = str.match(re)
    if (m) return { type: 'url', videoId: m[1], query: str }
  }
  return { type: 'search', videoId: null, query: str }
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search YouTube via yt-dlp ytsearch, falling back to youtube-sr.
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function searchVideos(query, limit = 8) {
  // Primary: yt-dlp flat-playlist (fast, no format resolution)
  try {
    const data = await runYtDlp([
      `ytsearch${limit}:${query}`,
      '--flat-playlist',
      '-J',
      '--no-warnings',
      ...antiBotArgs(),
    ], 25000)

    const entries = data.entries || (data.id ? [data] : [])
    if (entries.length > 0) {
      return entries
        .filter(e => e && e.id)
        .map(e => ({
          id: e.id,
          title: e.title || '',
          channel: e.uploader || e.channel || '',
          thumbnail: e.thumbnail || `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
          duration: e.duration ? formatDuration(Number(e.duration)) : '',
          durationSeconds: Number(e.duration) || 0,
          views: Number(e.view_count) || 0,
          url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
          uploadedAt: e.upload_date ? formatUploadDate(e.upload_date) : '',
        }))
    }
  } catch (err) {
    console.warn('[YouTubeInsight:Extractor] yt-dlp search failed, using youtube-sr fallback:', err.message)
  }

  // Fallback: youtube-sr JS scraper
  try {
    const results = await YouTubeSR.YouTube.search(query, { limit, type: 'video', safeSearch: false })
    return (results || []).map(v => ({
      id: v.id,
      title: v.title || '',
      channel: v.channel?.name || '',
      thumbnail: v.thumbnail?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      duration: v.durationFormatted || '',
      durationSeconds: 0,
      views: v.views || 0,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      uploadedAt: v.uploadedAt || '',
    }))
  } catch (err) {
    console.warn('[YouTubeInsight:Extractor] youtube-sr fallback also failed:', err.message)
    return []
  }
}

// ── Video metadata ────────────────────────────────────────────────────────────

/**
 * Fetch full video metadata using yt-dlp -J.
 * Includes automatic caption track URLs when available.
 * @param {string} videoId
 * @returns {Promise<Object>}
 */
/**
 * Fetch minimal title + channel from YouTube's public oEmbed endpoint.
 * No auth required, very fast, works even when yt-dlp is blocked.
 */
async function fetchOEmbed(videoId) {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { 'User-Agent': YTDLP_UA }, signal: AbortSignal.timeout(6000) }
    )
    if (!r.ok) return null
    const j = await r.json().catch(() => null)
    if (!j?.title) return null
    return { title: j.title, channel: j.author_name || '' }
  } catch {
    return null
  }
}

export async function fetchVideoData(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`
  let raw = null

  // Primary: yt-dlp full JSON (includes subtitles / automatic_captions)
  try {
    raw = await runYtDlp([
      '-J',
      '--no-warnings',
      '--no-playlist',
      ...antiBotArgs(),
      url,
    ], 30000)
  } catch (err) {
    console.warn('[YouTubeInsight:Extractor] yt-dlp -J failed:', err.message)
  }

  let data
  if (raw) {
    data = {
      id: videoId,
      url,
      title: raw.title || '',
      description: String(raw.description || '').slice(0, 3000),
      channel: raw.uploader || raw.channel || raw.uploader_id || '',
      channelId: raw.channel_id || '',
      duration: raw.duration ? formatDuration(Number(raw.duration)) : '',
      durationSeconds: Number(raw.duration) || 0,
      views: Number(raw.view_count) || 0,
      likes: Number(raw.like_count) || 0,
      thumbnail: raw.thumbnail
        || (Array.isArray(raw.thumbnails) && raw.thumbnails.length
          ? raw.thumbnails[raw.thumbnails.length - 1].url
          : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
      tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 20) : [],
      categories: Array.isArray(raw.categories) ? raw.categories : [],
      publishDate: raw.upload_date ? formatUploadDate(raw.upload_date) : '',
      isLive: raw.is_live || false,
      language: raw.language || null,
      _subtitles: raw.subtitles || {},
      _autoCaptions: raw.automatic_captions || {},
    }
  } else {
    // yt-dlp failed — try oEmbed for at least title + channel
    const oembed = await fetchOEmbed(videoId)
    console.log(`[YouTubeInsight:Extractor] oEmbed fallback: ${oembed ? oembed.title : 'failed'}`)
    data = {
      id: videoId,
      url,
      title: oembed?.title || '',
      description: '',
      channel: oembed?.channel || '',
      channelId: '',
      duration: '', durationSeconds: 0, views: 0, likes: 0,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      tags: [], categories: [], publishDate: '', isLive: false, language: null,
      _subtitles: {}, _autoCaptions: {},
    }
  }

  // Fetch captions — works independently of yt-dlp via timedtext API
  data.captions = await fetchCaptionsFromTracks(data._subtitles, data._autoCaptions, videoId)
  data.captionSource = data.captions ? 'fetched' : 'none'
  console.log(`[YouTubeInsight:Extractor] videoId=${videoId} title="${data.title.slice(0,40)}" captions=${data.captions ? data.captions.length + ' chars' : 'none'}`)

  // Clean up internal fields
  delete data._subtitles
  delete data._autoCaptions

  return data
}

// ── Caption resolution ────────────────────────────────────────────────────────

/**
 * Find the best caption track URL from yt-dlp's subtitles/automatic_captions maps,
 * fetch it as json3, and extract the full transcript text.
 *
 * Preference order: manual subs (ar → fr → en) then auto-caps same order.
 */
async function fetchCaptionsFromTracks(subtitles, autoCaptions, videoId) {
  const LANG_PRIORITY = ['ar', 'fr', 'en', 'en-US', 'en-GB']

  const pickTrackUrl = (trackMap) => {
    for (const lang of LANG_PRIORITY) {
      const tracks = trackMap[lang]
      if (!Array.isArray(tracks) || tracks.length === 0) continue
      // Prefer json3 format, then srv3, then any
      const json3 = tracks.find(t => t.ext === 'json3')
      const srv3  = tracks.find(t => t.ext === 'srv3')
      const any   = tracks[0]
      const chosen = json3 || srv3 || any
      if (chosen?.url) return chosen.url
    }
    return null
  }

  // Try manual subtitles first, then auto-captions
  const trackUrl = pickTrackUrl(subtitles) || pickTrackUrl(autoCaptions)

  if (trackUrl) {
    try {
      const text = await fetchAndParseCaption(trackUrl)
      if (text && text.length > 50) return text.slice(0, 8000)
    } catch (err) {
      console.warn('[YouTubeInsight:Extractor] caption fetch from track url failed:', err.message)
    }
  }

  // Last resort: YouTube timedtext API (no yt-dlp needed)
  return fetchCaptionsTimedtext(videoId)
}

async function fetchAndParseCaption(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': YTDLP_UA },
    signal: AbortSignal.timeout(8000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)

  const ct = r.headers.get('content-type') || ''

  // json3 format
  if (ct.includes('json') || url.includes('json3')) {
    const json = await r.json()
    return (json.events || [])
      .filter(e => e.segs)
      .map(e => e.segs.map(s => s.utf8 || '').join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // srv3 / ttml XML format
  const xml = await r.text()
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchCaptionsTimedtext(videoId) {
  // Include both manual and auto-generated (asr) track variants for major languages
  const candidates = [
    'ar', 'fr', 'en', 'en-US', 'en-GB',
    'a.ar', 'a.fr', 'a.en',  // auto-generated prefix used by YouTube
  ]
  for (const lang of candidates) {
    try {
      // Some auto-generated tracks use "asr" kind parameter
      const capUrl = `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}&fmt=json3`
      const r = await fetch(capUrl, {
        headers: { 'User-Agent': YTDLP_UA, 'Accept-Language': 'ar,en;q=0.9,fr;q=0.8' },
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) continue
      const json = await r.json().catch(() => null)
      if (!json?.events?.length) continue
      const text = json.events
        .filter(e => e.segs)
        .map(e => e.segs.map(s => s.utf8 || '').join(''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text.length > 50) {
        console.log(`[YouTubeInsight:Extractor] timedtext found lang=${lang} len=${text.length}`)
        return text.slice(0, 8000)
      }
    } catch { /* try next lang */ }
  }

  // Last attempt: fetch the available captions list from YouTube's timedtext API
  try {
    const listUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&type=list`
    const lr = await fetch(listUrl, {
      headers: { 'User-Agent': YTDLP_UA },
      signal: AbortSignal.timeout(6000),
    })
    if (lr.ok) {
      const xml = await lr.text()
      // Extract lang codes from XML e.g. <track id="0" name="" lang_code="ar" .../>
      const langMatches = [...xml.matchAll(/lang_code="([^"]+)"/g)].map(m => m[1])
      for (const lang of langMatches.slice(0, 5)) {
        try {
          const capUrl = `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}&fmt=json3`
          const r = await fetch(capUrl, {
            headers: { 'User-Agent': YTDLP_UA },
            signal: AbortSignal.timeout(8000),
          })
          if (!r.ok) continue
          const json = await r.json().catch(() => null)
          if (!json?.events?.length) continue
          const text = json.events
            .filter(e => e.segs)
            .map(e => e.segs.map(s => s.utf8 || '').join(''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
          if (text.length > 50) {
            console.log(`[YouTubeInsight:Extractor] timedtext list-found lang=${lang} len=${text.length}`)
            return text.slice(0, 8000)
          }
        } catch { /* continue */ }
      }
    }
  } catch { /* ignore */ }

  return null
}

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Build a concise text representation of video data for the AI prompt.
 */
export function buildVideoContext(videoData) {
  const parts = []
  if (videoData.title)       parts.push(`العنوان: ${videoData.title}`)
  if (videoData.channel)     parts.push(`القناة: ${videoData.channel}`)
  if (videoData.duration)    parts.push(`المدة: ${videoData.duration}`)
  if (videoData.views)       parts.push(`المشاهدات: ${videoData.views.toLocaleString('ar-DZ')}`)
  if (videoData.publishDate) parts.push(`تاريخ النشر: ${videoData.publishDate}`)
  if (videoData.language)    parts.push(`لغة الفيديو: ${videoData.language}`)
  if (videoData.categories?.length) parts.push(`الفئة: ${videoData.categories.join(', ')}`)
  if (videoData.tags?.length) parts.push(`الكلمات المفتاحية: ${videoData.tags.slice(0, 10).join(', ')}`)
  if (videoData.description) parts.push(`\nالوصف:\n${videoData.description.slice(0, 1500)}`)
  if (videoData.captions)    parts.push(`\nالنص الكامل (مقتطف):\n${videoData.captions.slice(0, 4000)}`)
  return parts.join('\n')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatUploadDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd || ''
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}
