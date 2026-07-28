// ══════════════════════════════════════════════════════════════════
// 📥 Browser-side Media Extractor — v2
// Extraction runs from the USER'S BROWSER (residential IP).
// Server IP is blocked by most platforms; browser residential IP is not.
//
// YouTube:   → /api/yt-stream (server proxy using InnerTube + oEmbed fallback)
// TikTok:    → tikwm.com directly (CORS ✅, residential IP)
// Twitter/X: → fxtwitter.com API (CORS ✅)
// Vimeo:     → player.vimeo.com/config (CORS ✅)
// Others:    → /api/dz-agent/download (server-side yt-dlp)
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
  canStream?: boolean       // false = YouTube or platform without direct streams
  cobaltUrl?: string        // set when canStream=false → link to cobalt.tools
}

// ── ID extractors ─────────────────────────────────────────────────
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
  try { const m = new URL(url).pathname.match(/\/(\d{5,})/); return m ? m[1] : null } catch { return null }
}
export function extractTwitterId(url: string): string | null {
  try { const m = new URL(url).pathname.match(/\/status\/(\d+)/); return m ? m[1] : null } catch { return null }
}

// ══════════════════════════════════════════════════════════════════
// YouTube — server proxy endpoint (InnerTube + oEmbed fallback)
// Our server tries multiple InnerTube clients; falls back to oEmbed
// metadata when all clients fail (datacenter IP may be blocked).
// canStream:false → show cobalt.tools redirect in card UI.
// ══════════════════════════════════════════════════════════════════
async function extractYouTube(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  const id = extractYouTubeId(url)
  if (!id) throw new Error('رابط YouTube غير صالح')

  // ── Primary: universal extractor (Cobalt first → yt-dlp → Piped) ────────
  // /api/dz-agent/download uses extractMediaInfoAny which tries Cobalt first
  // for YouTube — bypasses datacenter-IP blocks that affect InnerTube.
  try {
    const resp = await fetch(`/api/dz-agent/download?url=${encodeURIComponent(url)}`, { signal })
    if (resp.ok) {
      const d = await resp.json()
      if (d.video?.length || d.audio?.length) {
        return {
          title: d.title || '',
          thumbnail: d.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          duration: d.duration || 0,
          uploader: d.uploader || '',
          video: (d.video || []) as VideoFormat[],
          audio: (d.audio || []) as AudioFormat[],
          canStream: true,
          cobaltUrl: `https://cobalt.tools/?u=${encodeURIComponent(url)}`,
        }
      }
    }
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error
  }

  // ── Fallback: InnerTube direct (fast metadata, may have streams) ─────────
  let d: any = null
  try {
    const resp = await fetch(`/api/yt-stream?id=${encodeURIComponent(id)}`, { signal })
    if (resp.ok) d = await resp.json()
  } catch (error) {
    if ((error as any)?.name === 'AbortError') throw error
  }

  if (d?.video?.length || d?.audio?.length) {
    return {
      title: d.title || '',
      thumbnail: d.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      duration: d.duration || 0,
      uploader: d.uploader || '',
      video: (d.video || []) as VideoFormat[],
      audio: (d.audio || []) as AudioFormat[],
      canStream: true,
      cobaltUrl: `https://cobalt.tools/?u=${encodeURIComponent(url)}`,
    }
  }

  // ── All failed: honest error ──────────────────────────────────────────────
  throw new Error('تعذّر استخراج YouTube — قد يكون الفيديو محمياً أو محجوباً')
}

// ══════════════════════════════════════════════════════════════════
// TikTok — tikwm.com (CORS ✅, browser residential IP bypasses block)
// ══════════════════════════════════════════════════════════════════
async function extractTikTok(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  const resp = await fetch('https://www.tikwm.com/api/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ url, hd: '1' }).toString(),
    signal,
  })
  if (!resp.ok) throw new Error(`tikwm HTTP ${resp.status}`)
  const d = await resp.json()
  if (d.code !== 0 || !d.data) throw new Error(d.msg || 'فشل استخراج TikTok — تأكد من الرابط')
  const dat = d.data

  const video: VideoFormat[] = []
  if (dat.hdplay) video.push({ url: dat.hdplay, quality: 'HD (بدون علامة مائية)', height: null, ext: 'mp4', size: dat.hd_size ?? null, hasAudio: true })
  if (dat.play)   video.push({ url: dat.play,   quality: 'SD (بدون علامة مائية)', height: null, ext: 'mp4', size: dat.size   ?? null, hasAudio: true })
  if (video.length === 0) throw new Error('لا توجد روابط تحميل لهذا الفيديو')

  return {
    title: dat.title || dat.desc || 'TikTok Video',
    thumbnail: dat.cover || dat.origin_cover || '',
    duration: dat.duration ?? 0,
    uploader: dat.author?.nickname || dat.author?.unique_id || '',
    video,
    audio: dat.music ? [{ url: dat.music, ext: 'mp3', bitrate: 128, size: null, muxed: false }] : [],
    canStream: true,
  }
}

// ══════════════════════════════════════════════════════════════════
// Twitter / X — fxtwitter API (CORS ✅)
// ══════════════════════════════════════════════════════════════════
async function extractTwitter(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  const id = extractTwitterId(url)
  if (!id) throw new Error('رابط Twitter/X غير صالح')

  // Try fxtwitter first, then vxtwitter as fallback
  let d: any = null
  for (const base of ['https://api.fxtwitter.com', 'https://api.vxtwitter.com']) {
    try {
      const resp = await fetch(`${base}/i/status/${id}`, { signal })
      if (!resp.ok) continue
      const raw = await resp.json()
      if (raw?.tweet || raw?.media_extended) { d = raw; break }
    } catch {}
  }

  if (!d) throw new Error('تعذّر الوصول إلى Twitter/X API')

  // fxtwitter shape
  const tweet = d.tweet || {}
  const media = tweet.media || {}
  const videos = media.videos || []

  // vxtwitter shape fallback
  const mediaExtended: any[] = d.media_extended || []

  const videoFmts: VideoFormat[] = []
  for (const vid of videos) {
    const variants = (vid.variants || [])
      .filter((v: any) => v.url && (v.content_type?.includes('video') || v.url?.endsWith('.mp4')))
      .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
    for (const v of variants) {
      videoFmts.push({ url: v.url, quality: v.bitrate ? `${Math.round(v.bitrate / 1000)} kbps` : null, height: null, ext: 'mp4', size: null, hasAudio: true })
    }
  }
  // vxtwitter
  for (const m of mediaExtended) {
    if (m.type === 'video' && m.url) {
      const variants = (m.variants || [{ url: m.url, bitrate: 0 }]).sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
      for (const v of variants) {
        if (v.url) videoFmts.push({ url: v.url, quality: null, height: null, ext: 'mp4', size: null, hasAudio: true })
      }
    }
  }

  if (videoFmts.length === 0) throw new Error('لم يتم العثور على فيديو في هذه التغريدة')

  const thumb = media.videos?.[0]?.thumbnail_url || media.photos?.[0]?.url || mediaExtended[0]?.thumbnail_url || ''
  return {
    title: (tweet.text || d.text || '').slice(0, 120) || 'Twitter/X Video',
    thumbnail: thumb,
    duration: 0,
    uploader: tweet.author?.name ?? tweet.author?.screen_name ?? d.user_screen_name ?? '',
    video: videoFmts,
    audio: [],
    canStream: true,
  }
}

// ══════════════════════════════════════════════════════════════════
// Vimeo — player.vimeo.com config (CORS ✅, gives direct CDN URLs)
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
  const prog: any[] = (d.request?.files?.progressive ?? []).sort((a: any, b: any) => (b.height ?? 0) - (a.height ?? 0))
  if (prog.length === 0) throw new Error('لا تتوفر روابط تحميل لهذا الفيديو — قد يكون خاصاً')

  const thumbs = vid.thumbs ?? {}
  const thumb: string = thumbs['1280'] ?? thumbs['960'] ?? thumbs['640'] ?? (Object.values(thumbs)[0] as string) ?? ''

  return {
    title: vid.title ?? 'Vimeo Video',
    thumbnail: typeof thumb === 'string' ? thumb : '',
    duration: vid.duration ?? 0,
    uploader: vid.owner?.name ?? '',
    video: prog.map((p: any) => ({
      url: p.url, quality: p.quality ?? (p.height ? `${p.height}p` : null),
      height: p.height ?? null, ext: 'mp4', size: null, hasAudio: true,
    })),
    audio: [],
    canStream: true,
  }
}

// ══════════════════════════════════════════════════════════════════
// Social extractor — Facebook / Instagram / Pinterest + all others
// Calls /api/social/extract (platform-specific APIs + Cobalt + yt-dlp)
// Falls back to /api/dz-agent/download if social endpoint fails.
// ══════════════════════════════════════════════════════════════════
async function extractViaSocial(url: string, platform: string, signal?: AbortSignal): Promise<MediaInfo> {
  const resp = await fetch(
    `/api/social/extract?url=${encodeURIComponent(url)}&platform=${encodeURIComponent(platform)}`,
    { signal }
  )
  const d = await resp.json()
  if (!resp.ok || !d.ok) throw new Error(d.error ?? `Social extract HTTP ${resp.status}`)
  return {
    title: d.title ?? '',
    thumbnail: d.thumbnail ?? '',
    duration: d.duration ?? 0,
    uploader: d.uploader ?? '',
    video: (d.video ?? []) as VideoFormat[],
    audio: (d.audio ?? []) as AudioFormat[],
    canStream: true,
  }
}

// ── Generic server fallback (yt-dlp) ──────────────────────────────
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
    canStream: true,
  }
}

// ── Facebook ───────────────────────────────────────────────────────
async function extractFacebook(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  try { return await extractViaSocial(url, 'facebook', signal) } catch (e) {
    if ((e as any)?.name === 'AbortError') throw e
  }
  return extractViaServer(url, signal)
}

// ── Instagram ──────────────────────────────────────────────────────
async function extractInstagram(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  try { return await extractViaSocial(url, 'instagram', signal) } catch (e) {
    if ((e as any)?.name === 'AbortError') throw e
  }
  return extractViaServer(url, signal)
}

// ── Pinterest ──────────────────────────────────────────────────────
async function extractPinterest(url: string, signal?: AbortSignal): Promise<MediaInfo> {
  try { return await extractViaSocial(url, 'pinterest', signal) } catch (e) {
    if ((e as any)?.name === 'AbortError') throw e
  }
  return extractViaServer(url, signal)
}

// ══════════════════════════════════════════════════════════════════
// Main entry point
// ══════════════════════════════════════════════════════════════════
export async function extractMedia(url: string, platform: string | null, signal?: AbortSignal): Promise<MediaInfo> {
  switch (platform) {
    case 'youtube':     return extractYouTube(url, signal)
    case 'tiktok':      return extractTikTok(url, signal)
    case 'twitter':     return extractTwitter(url, signal)
    case 'vimeo':       return extractVimeo(url, signal)
    case 'facebook':    return extractFacebook(url, signal)
    case 'instagram':   return extractInstagram(url, signal)
    case 'pinterest':   return extractPinterest(url, signal)
    case 'dailymotion':
    default:            return extractViaSocial(url, platform ?? 'other', signal)
                          .catch(() => extractViaServer(url, signal))
  }
}
