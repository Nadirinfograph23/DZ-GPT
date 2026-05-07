const VALID_YT_HOSTNAMES = new Set([
  'www.youtube.com', 'youtube.com', 'm.youtube.com',
  'youtu.be', 'music.youtube.com',
])

const VALID_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const VALID_URL_PATTERN = /^https?:\/\//i

export function isValidYouTubeUrl(url) {
  if (!url || typeof url !== 'string') return false
  if (!VALID_URL_PATTERN.test(url)) return false
  try {
    const u = new URL(url)
    return VALID_YT_HOSTNAMES.has(u.hostname)
  } catch {
    return false
  }
}

export function extractVideoId(url) {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]
      return VALID_VIDEO_ID.test(id) ? id : null
    }
    const v = u.searchParams.get('v')
    if (v && VALID_VIDEO_ID.test(v)) return v
    const segments = u.pathname.split('/')
    for (const seg of segments) {
      if (VALID_VIDEO_ID.test(seg)) return seg
    }
  } catch {}
  return null
}

export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'video'
  return name
    .replace(/[^\w\u0600-\u06FF\s.\-]/g, '')
    .slice(0, 100)
    .trim()
    .replace(/\s+/g, '_') || 'video'
}

export function validateFormat(format) {
  const allowed = ['mp4', 'mp3', 'audio', 'm4a']
  return allowed.includes(String(format).toLowerCase()) ? String(format).toLowerCase() : null
}

export function validateQuality(quality) {
  const allowed = [128, 192, 320, 144, 240, 360, 480, 720, 1080, 1440, 2160]
  const q = Number(quality)
  return allowed.includes(q) ? q : 720
}

export function validateBitrate(bitrate) {
  const allowed = [128, 192, 320]
  const b = Number(bitrate)
  return allowed.includes(b) ? b : 192
}

export function sanitizeFfmpegArg(arg) {
  if (typeof arg !== 'string') return ''
  return arg.replace(/[;&|`$(){}[\]<>'"\\]/g, '')
}
