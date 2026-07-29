/**
 * routes/downloader.js
 * 📥 DZ-GPT Robust Social Media Downloader API
 *
 * POST   /api/download/start          — create a background download job
 * GET    /api/download/progress/:id   — SSE stream (progress/done/error)
 * GET    /api/download/file/:id       — serve completed file
 * GET    /api/download/status/:id     — quick poll (non-SSE)
 * DELETE /api/download/job/:id        — cancel job
 */

import express    from 'express'
import fs         from 'fs'
import rateLimit  from 'express-rate-limit'
import { createJob, getJob, cancelJob, subscribe, DL_ERRORS } from '../lib/download-manager.js'

const router = express.Router()

// Per-IP HTTP limiter (defence-in-depth; job-level limit is in download-manager)
const httpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'طلبات كثيرة — انتظر قليلاً', errorType: 'RATE_LIMITED' },
})

// ── Helpers ───────────────────────────────────────────────────────
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown'
}

// ══════════════════════════════════════════════════════════════════
// POST /api/download/start
// Body: { url, format, quality, platform, title }
// Returns: { ok, jobId }
// ══════════════════════════════════════════════════════════════════
router.post('/start', httpLimiter, (req, res) => {
  const { url, format, quality, platform, title } = req.body ?? {}

  if (!url || typeof url !== 'string' || url.length > 2048)
    return res.status(400).json({ ok: false, error: 'url مطلوب ويجب أن يكون رابطاً صالحاً', errorType: DL_ERRORS.UNSUPPORTED_URL })

  const result = createJob({
    url:      url.trim(),
    format:   ['audio', 'video'].includes(format) ? format : 'video',
    quality:  String(quality || 'best'),
    platform: typeof platform === 'string' ? platform : null,
    title:    typeof title   === 'string' ? title    : '',
    ip: clientIp(req),
  })

  if (!result.ok) return res.status(429).json(result)
  return res.json(result)
})

// ══════════════════════════════════════════════════════════════════
// GET /api/download/progress/:jobId   — Server-Sent Events
// Events: status | queued | progress | retry | done | error
// ══════════════════════════════════════════════════════════════════
router.get('/progress/:jobId', (req, res) => {
  const job = getJob(req.params.jobId)
  if (!job) {
    return res.status(404).json({ ok: false, error: 'المهمة غير موجودة أو انتهت صلاحيتها', errorType: DL_ERRORS.DOWNLOAD_EXPIRED })
  }

  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('X-Accel-Buffering', 'no')   // nginx: disable proxy buffering
  res.flushHeaders()

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch {}
  }

  // Snapshot current state on connect
  send('status', {
    status: job.status, progress: job.progress,
    speed: job.speed,   eta: job.eta,
    loaded: job.loaded, total: job.total,
    ext: job.ext,       filename: job.filename,
  })

  // Already terminal?
  if (job.status === 'done') {
    send('done', { ext: job.ext, filename: job.filename, size: job.total })
    return res.end()
  }
  if (job.status === 'error') {
    send('error', { error: job.error, errorType: job.errorType })
    return res.end()
  }

  // Subscribe to live updates
  const unsub = subscribe(req.params.jobId, (event, data) => {
    send(event, data)
    if (event === 'done' || event === 'error') {
      setTimeout(() => { try { res.end() } catch {} }, 600)
    }
  })

  // Heartbeat every 15 s so proxies/load-balancers don't close idle SSE
  const hb = setInterval(() => { try { res.write(':hb\n\n') } catch {} }, 15000)

  req.on('close', () => { clearInterval(hb); unsub() })
})

// ══════════════════════════════════════════════════════════════════
// GET /api/download/file/:jobId   — serve the finished file
// ══════════════════════════════════════════════════════════════════
router.get('/file/:jobId', (req, res) => {
  const job = getJob(req.params.jobId)
  if (!job)
    return res.status(404).json({ ok: false, error: 'الملف غير موجود أو انتهت صلاحيته', errorType: DL_ERRORS.DOWNLOAD_EXPIRED })
  if (job.status !== 'done')
    return res.status(202).json({ ok: false, error: 'التحميل لم ينته بعد', status: job.status, progress: job.progress })
  if (!job.filePath || !fs.existsSync(job.filePath))
    return res.status(404).json({ ok: false, error: 'الملف غير موجود على الخادم', errorType: DL_ERRORS.STORAGE_ERROR })

  const ext      = job.ext || 'mp4'
  const isVideo  = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'm4v'].includes(ext)
  const isAudio  = ['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac'].includes(ext)
  const mime     = isVideo ? `video/${ext === 'mp4' ? 'mp4' : 'webm'}`
                 : isAudio ? `audio/${ext}`
                 : 'application/octet-stream'

  const safeName = (job.filename || 'media').replace(/[^\w\u0600-\u06FF\s._-]/g, '_').slice(0, 180)
  const stat     = fs.statSync(job.filePath)

  res.setHeader('Content-Type',        mime)
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName + '.' + ext)}`)
  res.setHeader('Content-Length',      stat.size)
  res.setHeader('Cache-Control',       'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')

  const stream = fs.createReadStream(job.filePath)
  req.on('close', () => { try { stream.destroy() } catch {} })
  stream.on('error', () => { try { res.end() } catch {} })
  stream.pipe(res)
})

// ══════════════════════════════════════════════════════════════════
// GET /api/download/status/:jobId   — lightweight poll
// ══════════════════════════════════════════════════════════════════
router.get('/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId)
  if (!job)
    return res.status(404).json({ ok: false, error: 'not found', errorType: DL_ERRORS.DOWNLOAD_EXPIRED })
  res.json({
    ok: true,
    status:    job.status,
    progress:  job.progress,
    speed:     job.speed,
    eta:       job.eta,
    loaded:    job.loaded,
    total:     job.total,
    ext:       job.ext,
    error:     job.error,
    errorType: job.errorType,
  })
})

// ══════════════════════════════════════════════════════════════════
// DELETE /api/download/job/:jobId   — cancel & cleanup
// ══════════════════════════════════════════════════════════════════
router.delete('/job/:jobId', (req, res) => {
  const ok = cancelJob(req.params.jobId)
  res.json({ ok })
})

export default router
