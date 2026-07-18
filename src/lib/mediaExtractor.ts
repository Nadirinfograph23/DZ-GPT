// ══════════════════════════════════════════════════════════════════
// 📥 Browser-side Media Extractor
// All extraction runs from the USER'S browser (residential IP)
// so datacenter IP blocks on server don't matter.
// ══════════════════════════════════════════════════════════════════

export interface VideoFormat {
  url: string
  quality: string | null
  height: number | null
  ext: string
  size: number | null
  hasAudio: boolean
}
export interface AudioFormat {
  url: string
  ext: string
  bitrate: number | null
  size: number | null
  muxed: boolean
  mime?: string | null
}
export interface MediaInfo {
  title: string
  thumbnail: string
  duration: number
  uploader: string
  video: VideoFormat[]
  audio: AudioFormat[]
}

// ── URL ID extractors ─────────────────────────────────────────────
export function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (/youtu\.be$/.test(u.hostname)) return u.pathname.slice(1).split(/[/?#]/)[0] || null
    const v = u.searchParams.get('v')
    if (v) return v
    const m = u.pathname.match(/\/(shorts|embed|live|v)\/([a-zA-Z0-9_-]{6,})/i)
    return m ? m[2] : null
  } catch { return null }
}

export function extractVimeoId(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/\/(\d{5,})/)
    return m ? m[1] : null
  } catch { return null }
}

export function extractTwitterId(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/\/status\/(\d+)/)
    return m ? m[1] : null
  } catch { return null }
}

// ══════════════════════════════════════════════════════════════════
// YouTube — via Invidious instances (CORS-friendly, many public ones)
// ══════════════════════════════════════════════════════════════════
const INVIDIOUS_INSTANCES = [
  'inv.vern.cc',
  'invidious.privacydev.net',
  'yewtu.be',
  'yt.cdaut.de',
  'invidious.nerdvpn.de',
  'invidious.fdn.fr',
  'iv.datura.network',
  'invidious.flokinet.to',
  'iv.melmac.space',
  'invidious.perennialte.ch',
  'invidious.einfachzocken.eu',
  'invidious.privacyredirect.com',
  'yt.artemislena.eu',
  'invidious.drgns.space',
  'inv.tux.pizza',
]

async function tryInvidiousInstance(instance: string, id: string, signal?: AbortSignal): Promise<MediaInfo> {
  const url = `https://${instance}/api/v1/videos/${id}?fields=title,videoThumbnailUrl,lengthSeconds,author,formatStreams,adaptiveFormats,thumbnails`
  const resp = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const d = await resp.json()
  if (!d.title) throw new Error('no title in response')

  // Progressive streams = muxed (audio+video) — best for download
  const video: VideoFormat[] = ((d.formatStreams as any[]) || [])
    .filter(f => f.url && f.type?.startsWith('video'))
    .map(f => ({
      url: f.url as string,
      quality: (f.qualityLabel ?? f.quality ?? null) as string | null,
      height: (f.resolution ? parseInt(f.resolution) : f.height ?? null) as number | null,
      ext: (f.container ?? 'mp4') as string,
      size: null,
      hasAudio: true,
    }))
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))

  // Adaptive audio-only streams
  const audio: AudioFormat[] = ((d.adaptiveFormats as any[]) || [])
    .filter(f => f.url && f.type?.startsWith('audio'))
    .map(f => ({
      url: f.url as string,
      ext: (f.container ?? 'webm') as string,
      bitrate: f.bitrate ? Math.round(f.bitrate / 1000) : null,
      size: f.clen ? parseInt(f.clen) : null,
      muxed: false,
      mime: (f.type ?? null) as string | null,
    }))
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))

  if (video.length === 0) throw new Error('no video streams')

  const thumbs: any[] = d.thumbnails ?? []
  const thumb: string =
    d.videoThumbnailUrl ??
    (thumbs.length ? thumbs[thumbs.length - 1].url : '') ??
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`

  return { title: d.title, thumbnail: thumb, duration: d.lengthSeconds ?? 0, uploader: d.author ?? '', video, audio }
}

async function extractYouTube(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  const id = extractYouTubeId(url)
  if (!id) throw new Error('رابط YouTube غير صالح')

  // Race all instances — first valid response wins
  const results = await Promise.allSettled(
    INVIDIOUS_INSTANCES.map(inst => tryInvidiousInstance(inst, id, signal))
  )
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.video.length > 0) return r.value
  }
  throw new Error('تعذّر استخراج الفيديو من YouTube — قد يكون خاصاً أو محذوفاً')
}

// ══════════════════════════════════════════════════════════════════
// TikTok — via tikwm.com (CORS ✅, no-watermark API)
// ══════════════════════════════════════════════════════════════════
async function extractTikTok(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  const resp = await fetch('https://www.tikwm.com/api/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `url=${encodeURIComponent(url)}&hd=1`,
    signal,
  })
  if (!resp.ok) throw new Error(`tikwm HTTP ${resp.status}`)
  const d = await resp.json()
  if (d.code !== 0 || !d.data) {
    throw new Error(d.msg || 'فشل استخراج TikTok — تأكد من الرابط')
  }
  const dat = d.data

  const video: VideoFormat[] = []
  if (dat.hdplay) video.push({ url: dat.hdplay, quality: 'HD (بدون علامة مائية)', height: null, ext: 'mp4', size: dat.hd_size ?? null, hasAudio: true })
  if (dat.play)   video.push({ url: dat.play,   quality: 'SD (بدون علامة مائية)', height: null, ext: 'mp4', size: dat.size   ?? null, hasAudio: true })

  const audio: AudioFormat[] = []
  if (dat.music) audio.push({ url: dat.music, ext: 'mp3', bitrate: 128, size: null, muxed: false })

  if (video.length === 0) throw new Error('لا توجد روابط تحميل لهذا الفيديو')

  return {
    title: dat.title || dat.desc || 'TikTok Video',
    thumbnail: dat.cover || dat.origin_cover || '',
    duration: dat.duration ?? 0,
    uploader: dat.author?.nickname || dat.author?.unique_id || '',
    video,
    audio,
  }
}

// ══════════════════════════════════════════════════════════════════
// Twitter / X — via fxtwitter API (CORS ✅)
// ══════════════════════════════════════════════════════════════════
async function extractTwitter(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  const id = extractTwitterId(url)
  if (!id) throw new Error('رابط Twitter/X غير صالح')

  const resp = await fetch(`https://api.fxtwitter.com/i/status/${id}`, { signal })
  if (!resp.ok) throw new Error(`fxtwitter HTTP ${resp.status}`)
  const d = await resp.json()
  const tweet = d.tweet
  if (!tweet) throw new Error('التغريدة غير موجودة أو خاصة')

  const media = tweet.media ?? {}
  const video: VideoFormat[] = []

  for (const vid of (media.videos ?? [])) {
    const variants: any[] = (vid.variants ?? [])
      .filter((v: any) => v.url && (v.content_type?.includes('video') || v.url?.endsWith('.mp4')))
      .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
    for (const v of variants) {
      video.push({
        url: v.url,
        quality: v.bitrate ? `${Math.round(v.bitrate / 1000)} kbps` : null,
        height: null,
        ext: 'mp4',
        size: null,
        hasAudio: true,
      })
    }
  }

  if (video.length === 0) throw new Error('لم يتم العثور على فيديو في هذه التغريدة')

  const thumb: string = media.videos?.[0]?.thumbnail_url || media.photos?.[0]?.url || ''

  return {
    title: tweet.text?.slice(0, 120) || 'Twitter/X Video',
    thumbnail: thumb,
    duration: 0,
    uploader: tweet.author?.name ?? tweet.author?.screen_name ?? '',
    video,
    audio: [],
  }
}

// ══════════════════════════════════════════════════════════════════
// Vimeo — via player.vimeo.com config (CORS ✅, gives direct CDN URLs)
// ══════════════════════════════════════════════════════════════════
async function extractVimeo(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  const id = extractVimeoId(url)
  if (!id) throw new Error('رابط Vimeo غير صالح')

  const resp = await fetch(`https://player.vimeo.com/video/${id}/config`, {
    headers: { Referer: 'https://vimeo.com/', Origin: 'https://vimeo.com' },
    signal,
  })
  if (!resp.ok) throw new Error(`Vimeo config HTTP ${resp.status}`)
  const d = await resp.json()

  const vid = d.video ?? {}
  const progressive: any[] = (d.request?.files?.progressive ?? [])
    .sort((a: any, b: any) => (b.height ?? 0) - (a.height ?? 0))

  const video: VideoFormat[] = progressive.map(p => ({
    url: p.url,
    quality: p.quality ?? (p.height ? `${p.height}p` : null),
    height: p.height ?? null,
    ext: 'mp4',
    size: null,
    hasAudio: true,
  }))

  const thumbs = vid.thumbs ?? {}
  const thumb: string = thumbs['1280'] ?? thumbs['960'] ?? thumbs['640'] ?? Object.values(thumbs)[0] as string ?? ''

  return {
    title: vid.title ?? 'Vimeo Video',
    thumbnail: typeof thumb === 'string' ? thumb : '',
    duration: vid.duration ?? 0,
    uploader: vid.owner?.name ?? '',
    video,
    audio: [],
  }
}

// ══════════════════════════════════════════════════════════════════
// Instagram / Facebook / Pinterest / Dailymotion
// → Proxy through our server-side yt-dlp endpoint
//   (some work on server, others fail gracefully)
// ══════════════════════════════════════════════════════════════════
async function extractViaServer(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  const resp = await fetch(`/api/dz-agent/download?url=${encodeURIComponent(url)}`, { signal })
  const d = await resp.json()
  if (!resp.ok || !d.ok) throw new Error(d.error ?? `Server HTTP ${resp.status}`)
  return {
    title: d.title ?? '',
    thumbnail: d.thumbnail ?? '',
    duration: d.duration ?? 0,
    uploader: d.uploader ?? '',
    video: (d.video ?? []) as VideoFormat[],
    audio: (d.audio ?? []) as AudioFormat[],
  }
}

// ══════════════════════════════════════════════════════════════════
// Main entry point
// ══════════════════════════════════════════════════════════════════
export async function extractMedia(url: string, platform: string | null, signal?: AbortSignal): Promise<MediaInfo> {
  switch (platform) {
    case 'youtube':    return extractYouTube(url, signal)
    case 'tiktok':     return extractTikTok(url, signal)
    case 'twitter':    return extractTwitter(url, signal)
    case 'vimeo':      return extractVimeo(url, signal)
    case 'instagram':
    case 'facebook':
    case 'pinterest':
    case 'dailymotion':
    default:           return extractViaServer(url, signal)
  }
}
