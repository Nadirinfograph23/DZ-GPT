// ══════════════════════════════════════════════════════════════════
// 🌐 Giststack Provider — PRIMARY Social Media Download Provider
// ══════════════════════════════════════════════════════════════════
// Wraps the social-download-all-in-one RapidAPI service that powers
// https://www.giststack.com/tools/social-media-downloader
//
// Supported platforms:
//   YouTube · TikTok · Instagram · Facebook · X/Twitter
//   Pinterest · Reddit · Vimeo · Dailymotion · SoundCloud + more
//
// Environment:
//   RAPIDAPI_KEY — required for live calls (set as Replit Secret)
//
// Security:
//   SSRF protection — private/loopback IPs are rejected before any
//   network request is made.
//   Rate limiting — enforced upstream by RapidAPI; 30-second timeout.
//   File-size limit — 500 MB hard cap per format entry.
//   URL validation — scheme must be http(s), no credentials, ≤2 KB.
// ══════════════════════════════════════════════════════════════════

const RAPIDAPI_HOST = 'social-download-all-in-one.p.rapidapi.com'
const RAPIDAPI_URL  = `https://${RAPIDAPI_HOST}/v1/social/autolink`
const TIMEOUT_MS    = 15_000   // 15 s
const MAX_SIZE_BYTES = 500 * 1024 * 1024  // 500 MB

// ── SSRF guard ────────────────────────────────────────────────────
const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|::1|fc|fd|fe80|169\.254)/i

function validateUrlSsrf(rawUrl) {
  let parsed
  try { parsed = new URL(rawUrl) } catch { throw Object.assign(new Error('INVALID_URL'), { errorType: 'INVALID_URL' }) }

  if (!['http:', 'https:'].includes(parsed.protocol))
    throw Object.assign(new Error('INVALID_URL: only http(s) allowed'), { errorType: 'INVALID_URL' })

  if (parsed.username || parsed.password)
    throw Object.assign(new Error('INVALID_URL: credentials not allowed'), { errorType: 'INVALID_URL' })

  if (rawUrl.length > 2048)
    throw Object.assign(new Error('INVALID_URL: URL too long'), { errorType: 'INVALID_URL' })

  const host = parsed.hostname
  if (PRIVATE_IP_RE.test(host) || host === 'localhost')
    throw Object.assign(new Error('SSRF_BLOCKED: private or loopback address'), { errorType: 'SSRF_BLOCKED' })

  return parsed.href
}

// ── Response normaliser ──────────────────────────────────────────
/**
 * Map RapidAPI medias[] → { video[], audio[] } in the same shape
 * used by the rest of the DZ-GPT extraction pipeline.
 *
 * RapidAPI media object shape:
 * {
 *   url, quality, extension, type, videoAvailable, audioAvailable,
 *   chunked, size, thumbnail?
 * }
 */
function normaliseResponse(data) {
  const medias = Array.isArray(data.medias) ? data.medias : []

  // height heuristic from quality strings like "1080p", "720p", "hd", "sd"
  const qualityToHeight = q => {
    if (!q) return null
    const m = String(q).match(/(\d{3,4})p?/i)
    if (m) return parseInt(m[1])
    const lo = q.toLowerCase()
    if (/\b(4k|2160)\b/.test(lo)) return 2160
    if (/\b1440\b/.test(lo))      return 1440
    if (/\bhd\b/.test(lo))        return 720
    if (/\bsd\b/.test(lo))        return 360
    return null
  }

  const video = []
  const audio = []

  for (const m of medias) {
    if (!m.url || typeof m.url !== 'string') continue
    // Size guard
    if (m.size && m.size > MAX_SIZE_BYTES) continue

    const ext = (m.extension || '').toLowerCase().replace(/^\./, '') || 'mp4'

    if (m.type === 'audio' || (!m.videoAvailable && m.audioAvailable)) {
      audio.push({
        url:     m.url,
        ext:     ext || 'm4a',
        bitrate: m.bitrate ?? null,
        size:    m.size    ?? null,
        muxed:   false,
        source:  'giststack',
      })
    } else {
      const hasAudio = m.audioAvailable !== false
      video.push({
        url:      m.url,
        quality:  m.quality || null,
        height:   qualityToHeight(m.quality),
        ext:      ext || 'mp4',
        size:     m.size ?? null,
        hasAudio: hasAudio,
        source:   'giststack',
      })
    }
  }

  // Sort: video by height desc, audio by bitrate desc
  video.sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
  audio.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))

  return {
    title:     data.title     || '',
    thumbnail: data.thumbnail || '',
    duration:  data.duration  || 0,
    uploader:  data.author    || '',
    video,
    audio,
    source:    'giststack',
  }
}

// ── Main export ───────────────────────────────────────────────────
/**
 * Fetch media info from the Giststack/RapidAPI social downloader.
 *
 * @param {string} url  — public social media URL
 * @returns {Promise<MediaInfo>}  normalised info object
 * @throws if RAPIDAPI_KEY is missing, URL is invalid/private, or API fails
 */
export async function giststackFetchInfo(url) {
  const key = process.env.RAPIDAPI_KEY
  if (!key) throw Object.assign(new Error('RAPIDAPI_KEY not set'), { errorType: 'CONFIG_ERROR' })

  const cleanUrl = validateUrlSsrf(url)

  const ctrl    = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  let resp, body
  try {
    resp = await fetch(RAPIDAPI_URL, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Accept':         'application/json',
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
        'User-Agent':     'DZ-GPT/3.0 (+https://dz-gpt.vercel.app)',
      },
      body: JSON.stringify({ url: cleanUrl }),
      signal: ctrl.signal,
    })
    clearTimeout(timeout)
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError')
      throw Object.assign(new Error('Giststack timeout after 15 s'), { errorType: 'TIMEOUT' })
    throw Object.assign(new Error(`Giststack network error: ${err.message}`), { errorType: 'NETWORK_ERROR' })
  }

  // Rate limit / auth errors
  if (resp.status === 429)
    throw Object.assign(new Error('Giststack rate limited (429)'), { errorType: 'RATE_LIMITED' })
  if (resp.status === 401 || resp.status === 403)
    throw Object.assign(new Error('Giststack auth failed — check RAPIDAPI_KEY'), { errorType: 'CONFIG_ERROR' })

  try { body = await resp.json() } catch {
    throw Object.assign(new Error(`Giststack bad response (HTTP ${resp.status})`), { errorType: 'PROVIDER_ERROR' })
  }

  if (!resp.ok || body.error || body.message?.toLowerCase().includes('invalid api key')) {
    const msg = body.message || body.error || `HTTP ${resp.status}`
    throw Object.assign(new Error(`Giststack error: ${msg}`), { errorType: 'PROVIDER_ERROR' })
  }

  const info = normaliseResponse(body)

  if (!info.video.length && !info.audio.length)
    throw Object.assign(new Error('Giststack returned no usable media URLs'), { errorType: 'MEDIA_NOT_FOUND' })

  console.log(`[GiststackProvider] ✅ title="${info.title.slice(0,50)}" video=${info.video.length} audio=${info.audio.length}`)
  return info
}

/**
 * Check if the Giststack provider is configured (RAPIDAPI_KEY is set).
 * Use this guard before adding to download plans.
 */
export function isGiststackAvailable() {
  return !!process.env.RAPIDAPI_KEY
}

/**
 * Get the best direct CDN download URL from Giststack info,
 * suitable for passing to fetchToFile() in download-manager.
 *
 * @param {object} info   — result of giststackFetchInfo()
 * @param {'video'|'audio'} format
 * @param {string} quality — '1080' | '720' | '480' | '360' | 'best'
 */
export function giststackPickUrl(info, format, quality) {
  if (format === 'audio') {
    return info.audio[0]?.url ?? null
  }
  const h = parseInt(quality) || 0
  const candidates = info.video.filter(v => !h || (v.height ?? 9999) <= h + 100)
  const best = candidates[0] ?? info.video[0]
  return best?.url ?? null
}
