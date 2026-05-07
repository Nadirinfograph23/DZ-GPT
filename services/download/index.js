import os from 'os'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'
import {
  resolveYtDlpBin,
  extractDownloadArgs,
  extractDirectAudioUrl,
  extractMetadata,
  DOWNLOAD_CLIENTS,
} from './extractor.js'
import { checkFfmpeg } from './ffmpeg.js'
import { getVideoMetadata } from './metadata.js'
import { cookiesArgs } from './cookies.js'
import { friendlyError, withExponentialBackoff, sleep } from './antiBot.js'
import { urlCache } from './cache.js'
import { monitor } from './monitor.js'
import {
  isValidYouTubeUrl,
  extractVideoId,
  sanitizeFilename,
  validateFormat,
  validateQuality,
  validateBitrate,
} from './security.js'
import { checkAndUpdateYtDlp, getCurrentVersion } from './updater.js'
import { queueStats, listJobs, cancelJob } from './queue.js'
import { getCacheStats, purgeCaches } from './cache.js'

export { monitor } from './monitor.js'

const TMP_DIR = path.join(os.tmpdir(), 'dz-tube-dl')
try { fs.mkdirSync(TMP_DIR, { recursive: true }) } catch {}

function tmpFile(ext) {
  return path.join(TMP_DIR, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`)
}

function safeUnlink(p) {
  if (!p) return
  try { fs.unlinkSync(p) } catch {}
}

// ── Startup ───────────────────────────────────────────────────────
let _startupDone = false
export async function startup() {
  if (_startupDone) return
  _startupDone = true

  monitor.info('[DLv2] Starting download service...')

  const bin = await resolveYtDlpBin()
  if (bin) {
    monitor.info(`[DLv2] yt-dlp binary: ${bin}`)
    checkAndUpdateYtDlp(bin).then(result => {
      monitor.info(`[DLv2] yt-dlp update check: ${JSON.stringify(result)}`)
    }).catch(e => {
      monitor.warn('[DLv2] yt-dlp update check failed: ' + e.message)
    })
  } else {
    monitor.warn('[DLv2] yt-dlp not found — download service will use fallbacks only')
  }

  const hasFf = await checkFfmpeg()
  monitor.info(`[DLv2] ffmpeg available: ${hasFf}`)

  // Schedule tmp dir cleanup every 30 min
  setInterval(() => cleanupTmpDir(), 30 * 60 * 1000)
  monitor.info('[DLv2] Download service ready')
}

// ── Public API ────────────────────────────────────────────────────
export async function getInfo(url, opts = {}) {
  if (!isValidYouTubeUrl(url)) throw new Error('رابط YouTube غير صالح')
  return getVideoMetadata(url, opts)
}

export async function getAudioUrl(url, opts = {}) {
  if (!isValidYouTubeUrl(url)) throw new Error('رابط YouTube غير صالح')
  return extractDirectAudioUrl(url, opts)
}

export function streamDownloadToResponse(req, res, url, options = {}) {
  const format = validateFormat(options.format) || 'mp4'
  const quality = validateQuality(options.quality) || 720
  const bitrate = validateBitrate(options.bitrate) || 192

  if (!isValidYouTubeUrl(url)) {
    if (!res.headersSent) res.status(400).end('رابط YouTube غير صالح')
    return
  }

  const videoId = extractVideoId(url) || 'video'
  monitor.downloadEvent('start', { url: url.slice(-40), format, quality, bitrate })

  _doDownload(req, res, url, format, quality, bitrate, videoId).catch(e => {
    monitor.error('[DLv2:download] unhandled: ' + e.message)
    if (!res.headersSent) res.status(500).end(friendlyError(e) || 'فشل التحميل')
    else { try { res.end() } catch {} }
  })
}

// ── Core download engine with multi-client retry ──────────────────
async function _doDownload(req, res, url, format, height, bitrate, videoId) {
  const bin = await resolveYtDlpBin()
  if (!bin) {
    return res.status(503).end('yt-dlp غير متوفر على هذا الخادم')
  }

  const hasFfmpeg = await checkFfmpeg()

  // Fetch title in the background (non-blocking)
  const titlePromise = fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
  ).then(r => r.ok ? r.json() : null).then(j => j?.title || null).catch(() => null)

  const isAudio = format === 'mp3' || format === 'audio' || format === 'm4a'

  // ── Multi-client retry loop ────────────────────────────────────
  let lastErr = null
  for (let ci = 0; ci < DOWNLOAD_CLIENTS.length; ci++) {
    const clientConfig = DOWNLOAD_CLIENTS[ci]

    // If client aborted due to request close, stop immediately
    if (res.writableEnded) return

    try {
      const { args, ext, mime } = await extractDownloadArgs(url, format, height, bitrate, hasFfmpeg, {
        clientArg: clientConfig.name,
      })
      const outPath = tmpFile(ext)
      // URL must be the last argument for yt-dlp
      const fullArgs = [...args, '-o', outPath, url]

      monitor.info(`[DLv2:download] attempt client=${clientConfig.name} format=${format} h=${height} ffmpeg=${hasFfmpeg}`)

      const result = await runDownloadProcess(bin, fullArgs, outPath, req)

      if (result.aborted) return // client disconnected
      if (!result.success) {
        monitor.warn(`[DLv2:download] client=${clientConfig.name} failed: ${result.stderr?.slice(0, 150)}`)
        lastErr = new Error(result.stderr || `client ${clientConfig.name} failed`)

        // Back off before trying next client
        if (ci < DOWNLOAD_CLIENTS.length - 1) await sleep(1500 + ci * 500)
        continue
      }

      // ── Success: stream file to client ────────────────────────
      const rawTitle = await Promise.race([titlePromise, Promise.resolve(null)])
      const safeTitle = sanitizeFilename(rawTitle || videoId)
      const downloadName = isAudio
        ? `${safeTitle}.${ext}`
        : `${safeTitle}_${height}p.${ext}`

      monitor.info(`[DLv2:download] success client=${clientConfig.name} → streaming`)
      streamFileToResponse(req, res, outPath, mime, downloadName)
      return

    } catch (e) {
      monitor.warn(`[DLv2:download] client=${clientConfig.name} exception: ${e.message.slice(0, 150)}`)
      lastErr = e
      if (ci < DOWNLOAD_CLIENTS.length - 1) await sleep(1500 + ci * 500)
    }
  }

  // All clients failed
  const msg = friendlyError(lastErr) || 'فشل التحميل من جميع المصادر. تأكد من الرابط أو حاول مجدداً.'
  monitor.error(`[DLv2:download] all clients failed for ${videoId}: ${lastErr?.message?.slice(0, 200)}`)
  if (!res.headersSent) res.status(500).end(msg)
}

// ── yt-dlp process runner ─────────────────────────────────────────
function runDownloadProcess(bin, args, outPath, req) {
  return new Promise(resolve => {
    const TIMEOUT_MS = 5 * 60 * 1000 // 5 min max per attempt
    const proc = spawn(bin, args)
    let stderr = ''
    let aborted = false

    const killProc = () => {
      aborted = true
      try { proc.kill('SIGTERM') } catch {}
      setTimeout(() => { try { proc.kill('SIGKILL') } catch {} }, 2000)
      safeUnlink(outPath)
    }

    // Kill if client disconnects
    const onReqClose = () => {
      monitor.info('[DLv2:download] Client disconnected — aborting yt-dlp')
      killProc()
      resolve({ aborted: true, success: false })
    }
    req.once('close', onReqClose)

    const timer = setTimeout(() => {
      monitor.warn('[DLv2:download] yt-dlp timeout after 5min')
      killProc()
      resolve({ aborted: false, success: false, stderr: 'timeout' })
    }, TIMEOUT_MS)

    proc.stderr.on('data', d => { stderr += d.toString() })

    proc.on('error', e => {
      clearTimeout(timer)
      req.off('close', onReqClose)
      safeUnlink(outPath)
      resolve({ aborted: false, success: false, stderr: e.message })
    })

    proc.on('close', code => {
      clearTimeout(timer)
      req.off('close', onReqClose)

      if (aborted) return // already resolved

      if (code !== 0) {
        safeUnlink(outPath)
        resolve({ aborted: false, success: false, stderr })
        return
      }

      // Verify output file exists and has content
      try {
        const st = fs.statSync(outPath)
        if (st.size === 0) {
          safeUnlink(outPath)
          resolve({ aborted: false, success: false, stderr: 'Empty output file' })
          return
        }
      } catch {
        resolve({ aborted: false, success: false, stderr: 'Output file missing' })
        return
      }

      resolve({ aborted: false, success: true, outPath })
    })
  })
}

// ── File streaming ────────────────────────────────────────────────
function streamFileToResponse(req, res, filePath, mime, downloadName) {
  fs.stat(filePath, (err, st) => {
    if (err || !st || st.size === 0) {
      if (!res.headersSent) res.status(500).end('فشل التحميل — الملف فارغ أو مفقود')
      return safeUnlink(filePath)
    }
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Length', String(st.size))
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
    res.setHeader('X-DL-Engine', 'dz-v2')
    res.setHeader('X-DL-Size', String(st.size))
    const rs = fs.createReadStream(filePath)
    rs.on('error', () => { try { res.end() } catch {}; safeUnlink(filePath) })
    rs.on('close', () => safeUnlink(filePath))
    req.on('close', () => { rs.destroy(); safeUnlink(filePath) })
    rs.pipe(res)
  })
}

// ── Tmp dir cleanup ───────────────────────────────────────────────
function cleanupTmpDir() {
  try {
    const files = fs.readdirSync(TMP_DIR)
    const cutoff = Date.now() - 30 * 60 * 1000 // 30 min
    let removed = 0
    for (const f of files) {
      const fp = path.join(TMP_DIR, f)
      try {
        const st = fs.statSync(fp)
        if (st.mtimeMs < cutoff) { fs.unlinkSync(fp); removed++ }
      } catch {}
    }
    if (removed > 0) monitor.info(`[DLv2] Cleaned up ${removed} stale tmp files`)
  } catch (e) {
    monitor.warn('[DLv2] Tmp cleanup error: ' + e.message)
  }
}

// ── Health & Stats ────────────────────────────────────────────────
export function getServiceHealth() {
  return {
    ytDlpVersion: getCurrentVersion(),
    queue: queueStats(),
    cache: getCacheStats(),
    logs: monitor.getStats(),
    uptime: process.uptime(),
  }
}

export { queueStats, listJobs, cancelJob, getCacheStats, purgeCaches }
