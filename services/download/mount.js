// Download V2 service — yt-dlp based YouTube downloader.
//
// @distube/ytdl-core is no longer a reliable choice for current YouTube
// extraction. The repository already ships a yt-dlp executable in bin/ and
// Vercel includes that directory in the serverless function bundle. yt-dlp is
// actively maintained and is widely used by download applications.
import express from 'express'
import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const YTDLP_CANDIDATES = [
  path.resolve(process.cwd(), 'bin', 'yt-dlp'),
  path.resolve(process.cwd(), 'bin', 'yt-dlp_linux'),
]

function getYtDlp() {
  return YTDLP_CANDIDATES.find(p => fs.existsSync(p)) || 'yt-dlp'
}

function extractVideoId(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0]
    if (host.endsWith('youtube.com')) {
      const v = url.searchParams.get('v')
      if (v) return v
      const match = url.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/)
      if (match) return match[1]
    }
  } catch {}
  return String(value || '').match(/^[\w-]{11}$/)?.[0] || null
}

function isYouTubeUrl(value) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, '').toLowerCase()
    return host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')
  } catch { return false }
}

function safeFilename(title) {
  return String(title || 'video')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'video'
}

function runYtDlp(args, { collectStdout = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(getYtDlp(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { if (collectStdout) stdout += chunk.toString() })
    child.stderr.on('data', chunk => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(stderr.trim().split('\n').slice(-3).join(' ') || `yt-dlp exited with ${code}`))
    })
  })
}

function contentType(format) {
  return format === 'mp3' ? 'audio/mpeg' : format === 'mp4' ? 'video/mp4' : 'audio/mp4'
}

function outputExtension(format, ffmpegAvailable) {
  if (format === 'mp4') return 'mp4'
  if (format === 'mp3' && ffmpegAvailable) return 'mp3'
  return 'm4a'
}

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    path.resolve(process.cwd(), 'bin', 'ffmpeg'),
  ].filter(Boolean)
  return candidates.find(p => fs.existsSync(p)) || null
}

async function getInfo(url) {
  const { stdout } = await runYtDlp([
    '--dump-single-json',
    '--no-warnings',
    '--skip-download',
    '--no-playlist',
    '--js-runtimes', 'node',
    url,
  ])
  return JSON.parse(stdout)
}

function sendError(res, status, error, detail) {
  if (res.headersSent) return
  res.status(status).json({ error, ...(process.env.NODE_ENV === 'development' && detail ? { detail } : {}) })
}

async function handleDownload(req, res) {
  const input = req.method === 'POST' ? (req.body || {}) : req.query
  const url = String(input.url || '').trim()
  const format = String(input.format || 'mp4').toLowerCase()
  const quality = String(input.quality || 'best').trim()

  if (!isYouTubeUrl(url) || !extractVideoId(url)) return sendError(res, 400, 'رابط YouTube غير صالح')
  if (!['mp4', 'mp3', 'm4a', 'audio'].includes(format)) return sendError(res, 400, 'الصيغة غير مدعومة')

  let meta
  try {
    meta = await getInfo(url)
  } catch (err) {
    console.error('[DZ Tube] metadata failed:', err?.message || err)
    return sendError(res, 502, 'تعذر استخراج الفيديو حالياً', err?.message)
  }

  const title = safeFilename(meta.title)
  const ffmpeg = findFfmpeg()
  const actualExt = outputExtension(format, Boolean(ffmpeg))
  const requestedHeight = Number.parseInt(quality, 10)

  let formatSelector
  let extra = []
  if (format === 'mp4') {
    // Prefer a single progressive MP4 so the response can be streamed directly
    // without requiring FFmpeg to merge separate video/audio tracks.
    formatSelector = Number.isFinite(requestedHeight) && requestedHeight > 0
      ? `best[ext=mp4][vcodec!=none][acodec!=none][height<=${requestedHeight}]/best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]`
      : 'best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]'
  } else if (format === 'mp3' && ffmpeg) {
    // MP3 requires transcoding; only request it when a real FFmpeg binary is
    // available. This avoids the old failure mode on serverless deployments.
    formatSelector = 'bestaudio/best'
    extra = ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '--ffmpeg-location', ffmpeg]
  } else {
    // M4A is YouTube's native AAC container and needs no transcoding. When MP3
    // was requested but FFmpeg is unavailable, return the native M4A instead
    // of failing the entire download.
    formatSelector = 'bestaudio[ext=m4a]/bestaudio'
  }

  const suffix = format === 'mp4' && Number.isFinite(requestedHeight) && requestedHeight > 0 ? `_${requestedHeight}p` : ''
  const filename = `${title}${suffix}.${actualExt}`
  const args = [
    '--no-warnings',
    '--no-progress',
    '--no-playlist',
    '--force-overwrites',
    '--js-runtimes', 'node',
    '-f', formatSelector,
    '-o', '-',
    ...extra,
    url,
  ]

  let child
  try {
    child = spawn(getYtDlp(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    console.error('[DZ Tube] spawn failed:', err?.message || err)
    return sendError(res, 502, 'محرك التحميل غير متاح حالياً', err?.message)
  }

  let stderr = ''
  let started = false
  child.stderr.on('data', chunk => { stderr += chunk.toString() })
  child.on('error', err => {
    if (!started) sendError(res, 502, 'تعذر تشغيل محرك التحميل', err?.message)
    else res.destroy(err)
  })

  res.status(200)
  res.setHeader('Content-Type', contentType(actualExt === 'm4a' ? 'm4a' : format))
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  started = true
  child.stdout.pipe(res)

  const finish = code => {
    if (code !== 0 && !res.writableEnded) {
      console.error('[DZ Tube] yt-dlp download failed:', stderr.trim().slice(-2000))
      res.destroy(new Error(stderr.trim() || `yt-dlp exited with ${code}`))
    }
  }
  child.on('close', finish)
  req.on('close', () => {
    if (!res.writableEnded) {
      try { child.kill('SIGTERM') } catch {}
    }
  })
}

async function handleInfo(req, res) {
  const url = String(req.body?.url || req.query?.url || '').trim()
  if (!isYouTubeUrl(url) || !extractVideoId(url)) return sendError(res, 400, 'رابط YouTube غير صالح')
  try {
    const info = await getInfo(url)
    const heights = [...new Set((info.formats || [])
      .filter(f => f.vcodec && f.vcodec !== 'none' && f.ext === 'mp4' && Number.isFinite(Number(f.height)))
      .map(f => Number(f.height)))]
      .sort((a, b) => a - b)
    res.json({
      title: info.title || 'YouTube video',
      thumbnail: info.thumbnail || info.thumbnails?.at(-1)?.url || null,
      duration: Number(info.duration || 0),
      uploader: info.uploader || info.channel || '',
      view_count: Number(info.view_count || 0),
      downloadableHeights: heights.length ? heights : [360],
    })
  } catch (err) {
    console.error('[DZ Tube] info failed:', err?.message || err)
    sendError(res, 502, 'تعذر جلب معلومات الفيديو حالياً', err?.message)
  }
}

export function mountDownloadV2(app) {
  const router = express.Router()
  router.get('/download', handleDownload)
  router.post('/download', handleDownload)
  router.post('/start', handleDownload)
  router.post('/info', handleInfo)
  router.get('/info', handleInfo)

  // V2 endpoint. The DZ Tube client uses this route for downloads while the
  // legacy /api/dz-tube/info remains compatible with existing search flows.
  app.use('/api/download-v2', router)
}
