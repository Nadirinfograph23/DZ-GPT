// ══════════════════════════════════════════════════════════════════
// 🎬 Viddari Provider — Social Media Download Provider
// ══════════════════════════════════════════════════════════════════
// Uses the public API powering https://viddari.com
// Discovered endpoint: POST https://api.viddari.com/api/resolve
//
// Supported platforms (as confirmed by Viddari):
//   TikTok · Instagram · Reddit · X/Twitter · Pinterest · YouTube Shorts
//
// No API key required — public endpoint with rate limit 20 req/min.
//
// Security:
//   SSRF protection — private/loopback IPs rejected before any request.
//   Timeout — 20s hard cap.
//   File-size limit — 500 MB hard cap.
//   No CAPTCHA bypass / no login bypass / no private-content access.
//
// Fallback note:
//   If Viddari is unavailable, the caller must fall back to
//   Giststack → yt-dlp → Cobalt (handled by download-manager.js).
// ══════════════════════════════════════════════════════════════════

const VIDDARI_API_BASE = 'https://api.viddari.com'
const VIDDARI_RESOLVE  = `${VIDDARI_API_BASE}/api/resolve`
const TIMEOUT_MS       = 20_000   // 20 s
const MAX_SIZE_BYTES   = 500 * 1024 * 1024  // 500 MB

// ── Supported platforms ───────────────────────────────────────────
const VIDDARI_PLATFORMS = new Set([
  'tiktok', 'instagram', 'reddit', 'twitter', 'pinterest', 'youtube',
])

// ── SSRF guard ────────────────────────────────────────────────────
const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|::1|fc|fd|fe80|169\.254)/i

function validateUrlSsrf(rawUrl) {
  let parsed
  try { parsed = new URL(rawUrl) } catch {
    throw Object.assign(new Error('INVALID_URL'), { errorType: 'INVALID_URL' })
  }
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

// ── Detect platform from URL ──────────────────────────────────────
function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^(www\.|m\.|vm\.|l\.)/, '')
    if (/tiktok\.com/.test(host))         return 'tiktok'
    if (/instagram\.com/.test(host))      return 'instagram'
    if (/reddit\.com|redd\.it/.test(host))return 'reddit'
    if (/x\.com|twitter\.com/.test(host)) return 'twitter'
    if (/pinterest\.com/.test(host))      return 'pinterest'
    if (/youtu\.?be|youtube\.com/.test(host)) return 'youtube'
    return null
  } catch { return null }
}

// ── Response normaliser ───────────────────────────────────────────
/**
 * Normalise Viddari resolve response → { title, thumbnail, video[], audio[], source }
 * Viddari returns: { downloadUrl (relative path), title?, thumbnail?, platform?, duration? }
 * downloadUrl is a relative path: "/api/download/..." on api.viddari.com
 */
function normaliseResponse(data, platform) {
  const video = []
  const audio = []

  // Build the actual downloadable URL
  // downloadUrl may be a relative path ("/api/download/...") or full URL
  let mediaUrl = null
  if (data.downloadUrl) {
    mediaUrl = data.downloadUrl.startsWith('http')
      ? data.downloadUrl
      : `${VIDDARI_API_BASE}${data.downloadUrl}`
  } else if (data.url) {
    mediaUrl = data.url
  }

  if (mediaUrl) {
    // Size check (if provided)
    const size = data.size ?? null
    if (!size || size <= MAX_SIZE_BYTES) {
      const ext = (data.ext || data.format || 'mp4').toLowerCase().replace(/^\./, '')

      if (data.mediaType === 'audio' || ext === 'mp3' || ext === 'm4a') {
        audio.push({
          url:    mediaUrl,
          ext:    ext || 'm4a',
          size,
          muxed:  false,
          source: 'viddari',
          // Viddari proxied URLs need headers when fetching
          requiresHeaders: mediaUrl.includes('api.viddari.com'),
        })
      } else {
        const quality = data.quality || data.resolution || null
        const height  = quality ? (parseInt(String(quality).match(/\d+/)?.[0]) || null) : null
        video.push({
          url:      mediaUrl,
          quality:  quality || 'best',
          height,
          ext:      ext || 'mp4',
          size,
          hasAudio: true,
          source:   'viddari',
          requiresHeaders: mediaUrl.includes('api.viddari.com'),
        })
      }
    }
  }

  // Handle multiple formats if Viddari returns them
  if (Array.isArray(data.formats) && data.formats.length > 0) {
    video.length = 0; audio.length = 0  // reset and rebuild
    for (const f of data.formats) {
      if (!f.url) continue
      const fUrl = f.url.startsWith('http') ? f.url : `${VIDDARI_API_BASE}${f.url}`
      const size = f.size ?? null
      if (size && size > MAX_SIZE_BYTES) continue
      const ext = (f.ext || f.format || 'mp4').toLowerCase().replace(/^\./, '')
      if (f.type === 'audio' || ext === 'mp3' || ext === 'm4a') {
        audio.push({ url: fUrl, ext: ext || 'm4a', size, muxed: false, source: 'viddari', requiresHeaders: fUrl.includes('api.viddari.com') })
      } else {
        const h = f.height || (f.quality ? parseInt(String(f.quality).match(/\d+/)?.[0]) : null) || null
        video.push({ url: fUrl, quality: f.quality || (h ? `${h}p` : 'best'), height: h, ext: ext || 'mp4', size, hasAudio: f.hasAudio !== false, source: 'viddari', requiresHeaders: fUrl.includes('api.viddari.com') })
      }
    }
    video.sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
    audio.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
  }

  return {
    title:     data.title     || data.caption || '',
    thumbnail: data.thumbnail || data.cover   || '',
    duration:  data.duration  || 0,
    uploader:  data.author    || data.uploader || '',
    platform:  platform,
    video,
    audio,
    source:    'viddari',
  }
}

// ── Main export ───────────────────────────────────────────────────
/**
 * Fetch media info from Viddari's public API.
 *
 * @param {string} url  — public social media URL
 * @returns {Promise<MediaInfo>}  normalised info object
 * @throws if URL is invalid/private or platform unsupported
 */
export async function viddariResolve(url) {
  const cleanUrl = validateUrlSsrf(url)
  const platform = detectPlatform(cleanUrl)

  const ctrl    = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  let resp, body
  try {
    resp = await fetch(VIDDARI_RESOLVE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':        'application/json',
        'Origin':        'https://viddari.com',
        'Referer':       'https://viddari.com/',
        'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ url: cleanUrl }),
      signal: ctrl.signal,
    })
    clearTimeout(timeout)
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError')
      throw Object.assign(new Error('Viddari timeout after 20 s'), { errorType: 'TIMEOUT' })
    throw Object.assign(new Error(`Viddari network error: ${err.message}`), { errorType: 'NETWORK_ERROR' })
  }

  // Rate limit
  if (resp.status === 429)
    throw Object.assign(new Error('Viddari rate limited (429) — 20 req/min exceeded'), { errorType: 'RATE_LIMITED' })

  try { body = await resp.json() } catch {
    throw Object.assign(new Error(`Viddari bad response (HTTP ${resp.status})`), { errorType: 'PROVIDER_ERROR' })
  }

  // Structured error responses from Viddari
  if (!resp.ok || body?.error) {
    const code = body?.error || ''
    const msg  = body?.message || body?.error || `HTTP ${resp.status}`

    if (code === 'content_unavailable')
      throw Object.assign(new Error(`Viddari: هذا المحتوى محمي أو محذوف (${body?.platform || 'المنصة'})`), { errorType: 'PLATFORM_BLOCKED' })
    if (code === 'upstream_unavailable')
      throw Object.assign(new Error(`Viddari: المنصة غير متاحة مؤقتاً (${body?.platform || 'upstream'})`), { errorType: 'PROVIDER_ERROR' })

    throw Object.assign(new Error(`Viddari error: ${msg}`), { errorType: 'PROVIDER_ERROR' })
  }

  const info = normaliseResponse(body, platform)

  if (!info.video.length && !info.audio.length)
    throw Object.assign(new Error('Viddari returned no usable media URLs'), { errorType: 'MEDIA_NOT_FOUND' })

  console.log(`[ViddariProvider] ✅ title="${(info.title || '').slice(0, 50)}" platform=${platform} video=${info.video.length} audio=${info.audio.length}`)
  return info
}

/**
 * Check if a URL's platform is supported by Viddari.
 * Viddari handles: TikTok, Instagram, Reddit, X/Twitter, Pinterest, YouTube Shorts.
 */
export function isViddariSupported(url) {
  const p = detectPlatform(url)
  return p !== null && VIDDARI_PLATFORMS.has(p)
}

/**
 * Pick the best direct URL from Viddari info for download.
 */
export function viddariPickUrl(info, format) {
  if (format === 'audio') return info.audio[0]?.url ?? info.video[0]?.url ?? null
  return info.video[0]?.url ?? info.audio[0]?.url ?? null
}
