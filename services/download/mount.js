import {
  startup,
  getInfo,
  getAudioUrl,
  streamDownloadToResponse,
  getServiceHealth,
  listJobs,
  cancelJob,
  purgeCaches,
  monitor,
} from './index.js'
import { isValidYouTubeUrl, extractVideoId, validateFormat, validateQuality, validateBitrate } from './security.js'
import { urlCache } from './cache.js'
import { extractDirectAudioUrl } from './extractor.js'
import { checkFfmpeg, remuxStreamingAudio } from './ffmpeg.js'

export function mountDownloadV2(app) {
  startup().catch(e => console.error('[DLv2] startup error:', e.message))

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get('/api/dz-tube/v2/health', (req, res) => {
    try {
      res.json({ ok: true, service: 'dz-tube-v2', ...getServiceHealth() })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  // ── Video Metadata + Quality Info ──────────────────────────────────────────
  app.post('/api/dz-tube/v2/info', async (req, res) => {
    const url = String(req.body?.url || req.query?.url || '')
    if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'رابط YouTube غير صالح' })
    const bypassCache = req.query.refresh === '1'
    try {
      const info = await getInfo(url, { bypassCache })
      res.json(info)
    } catch (e) {
      monitor.error('[v2:info] ' + e.message)
      res.status(502).json({ error: 'تعذر جلب معلومات الفيديو', detail: e.message.slice(0, 200) })
    }
  })

  // ── Download (MP3 / MP4 / Audio) ───────────────────────────────────────────
  // New enhanced endpoint that replaces nothing — existing /api/dz-tube/download stays.
  // Quality: height for video (360/480/720/1080) or bitrate for MP3 (128/192/320)
  app.get('/api/dz-tube/v2/download', async (req, res) => {
    const url = String(req.query.url || '')
    const format = validateFormat(req.query.format) || 'mp4'
    const quality = Number(req.query.quality) || 720
    const bitrate = validateBitrate(req.query.bitrate) || 192

    if (!isValidYouTubeUrl(url)) return res.status(400).end('رابط YouTube غير صالح')

    const height = validateQuality(quality) || 720
    streamDownloadToResponse(req, res, url, { format, quality: height, bitrate })
  })

  // ── MP3 Quality Pipeline — explicit bitrate control ────────────────────────
  app.get('/api/dz-tube/v2/mp3', async (req, res) => {
    const url = String(req.query.url || '')
    const bitrate = validateBitrate(req.query.bitrate) || 192
    if (!isValidYouTubeUrl(url)) return res.status(400).end('رابط YouTube غير صالح')
    streamDownloadToResponse(req, res, url, { format: 'mp3', quality: 720, bitrate })
  })

  // ── Streaming Audio URL resolve ────────────────────────────────────────────
  app.get('/api/dz-tube/v2/audio-url', async (req, res) => {
    const url = String(req.query.url || '')
    if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'رابط YouTube غير صالح' })
    const bypassCache = !!req.query._r
    try {
      const audioUrl = await extractDirectAudioUrl(url, { bypassCache })
      res.json({ url: audioUrl, videoId: extractVideoId(url) })
    } catch (e) {
      monitor.error('[v2:audio-url] ' + e.message)
      res.status(502).json({ error: 'فشل استخراج رابط الصوت', detail: e.message.slice(0, 200) })
    }
  })

  // ── Background Audio Proxy (streaming mode) ─────────────────────────────────
  // Enhanced version of /api/dz-tube/audio-proxy with Safari/iOS remux support
  app.get('/api/dz-tube/v2/audio-proxy', async (req, res) => {
    const url = String(req.query.url || '')
    if (!isValidYouTubeUrl(url)) return res.status(400).end('invalid url')

    const bypassCache = !!req.query._r
    let upstreamUrl
    try {
      upstreamUrl = await extractDirectAudioUrl(url, { bypassCache })
    } catch (e) {
      monitor.error('[v2:audio-proxy] resolve failed: ' + e.message)
      return res.status(502).end('فشل تحضير الصوت')
    }

    const ua = req.headers['user-agent'] || ''
    const wantRemux = req.query.force_remux === '1' || isSafariOrIOS(ua)
    if (wantRemux && await checkFfmpeg()) {
      return remuxStreamingAudio(upstreamUrl, req, res)
    }

    return streamAudioBytes(req, res, upstreamUrl)
  })

  // ── Queue status ───────────────────────────────────────────────────────────
  app.get('/api/dz-tube/v2/queue', (req, res) => {
    res.json({ jobs: listJobs() })
  })

  app.delete('/api/dz-tube/v2/queue/:jobId', (req, res) => {
    const ok = cancelJob(req.params.jobId)
    res.json({ cancelled: ok })
  })

  // ── Logs & Monitoring ──────────────────────────────────────────────────────
  app.get('/api/dz-tube/v2/logs', (req, res) => {
    const type = String(req.query.type || 'all')
    const limit = Math.min(500, Math.max(10, Number(req.query.limit) || 100))
    res.json({ logs: monitor.getLogs(type, limit), stats: monitor.getStats() })
  })

  // ── Cache management ───────────────────────────────────────────────────────
  app.post('/api/dz-tube/v2/cache/purge', (req, res) => {
    purgeCaches()
    res.json({ ok: true, message: 'Cache purged' })
  })

  monitor.info('[DLv2] Routes mounted: /api/dz-tube/v2/*')
}

function isSafariOrIOS(ua) {
  if (!ua) return false
  if (/iPhone|iPad|iPod/i.test(ua)) return true
  if (/Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR/i.test(ua)) return true
  return false
}

async function streamAudioBytes(req, res, upstreamUrl) {
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    if (req.headers.range) headers['Range'] = req.headers.range

    const upstream = await fetch(upstreamUrl, { headers, signal: AbortSignal.timeout(30000) })
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(502).end('فشل الاتصال بالمصدر')
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mp4')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-DL-Engine', 'dz-v2')

    const passHeaders = ['content-length', 'content-range']
    for (const h of passHeaders) {
      const v = upstream.headers.get(h)
      if (v) res.setHeader(h, v)
    }
    res.status(upstream.status === 206 ? 206 : 200)

    if (!upstream.body) return res.end()

    const CHUNK = 1024 * 1024
    const reader = upstream.body.getReader()
    let cancelled = false
    req.on('close', () => { cancelled = true; try { reader.cancel() } catch {} })

    while (true) {
      const { done, value } = await reader.read()
      if (done || cancelled) break
      if (!res.write(value)) await new Promise(r => res.once('drain', r))
    }
    res.end()
  } catch (e) {
    monitor.warn('[v2:audio-bytes] ' + e.message)
    if (!res.headersSent) res.status(502).end('فشل بث الصوت')
    else { try { res.end() } catch {} }
  }
}
