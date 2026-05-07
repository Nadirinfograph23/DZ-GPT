import os from 'os'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawn } from 'child_process'
import { resolveYtDlpBin, extractDownloadArgs, extractDirectAudioUrl, extractMetadata } from './extractor.js'
import { checkFfmpeg } from './ffmpeg.js'
import { getVideoMetadata } from './metadata.js'
import { cookiesArgs } from './cookies.js'
import { friendlyError, withExponentialBackoff } from './antiBot.js'
import { urlCache } from './cache.js'
import { monitor } from './monitor.js'
import { isValidYouTubeUrl, extractVideoId, sanitizeFilename, validateFormat, validateQuality, validateBitrate } from './security.js'
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
  monitor.info('[DLv2] Download service ready')
}

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

async function _doDownload(req, res, url, format, height, bitrate, videoId) {
  const bin = await resolveYtDlpBin()
  if (!bin) {
    return res.status(503).end('yt-dlp غير متوفر على هذا الخادم')
  }

  const hasFfmpeg = await checkFfmpeg()
  const { args, ext, mime } = await extractDownloadArgs(url, format, height, bitrate, hasFfmpeg)
  const outPath = tmpFile(ext)

  const titlePromise = fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
  ).then(r => r.ok ? r.json() : null).then(j => j?.title || null).catch(() => null)

  const fullArgs = [...args, '-o', outPath]

  const success = await new Promise(resolve => {
    monitor.info(`[DLv2:download] spawning yt-dlp format=${format} h=${height} ffmpeg=${hasFfmpeg}`)
    const proc = spawn(bin, fullArgs)
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })

    let gone = false
    const onClose = () => {
      gone = true
      if (!proc.killed) { try { proc.kill('SIGTERM') } catch {} }
      safeUnlink(outPath)
    }
    req.on('close', onClose)

    proc.on('error', e => {
      req.off('close', onClose)
      safeUnlink(outPath)
      monitor.error('[DLv2:download] spawn error: ' + e.message)
      resolve(false)
    })

    proc.on('close', async code => {
      req.off('close', onClose)
      if (gone) return resolve(true)
      if (code !== 0) {
        safeUnlink(outPath)
        monitor.warn(`[DLv2:download] yt-dlp exit ${code}: ${stderr.slice(0, 300)}`)
        resolve(false)
        return
      }

      const rawTitle = await Promise.race([titlePromise, Promise.resolve(null)])
      const safeTitle = sanitizeFilename(rawTitle || videoId)
      const isAudio = format === 'mp3' || format === 'audio' || format === 'm4a'
      const downloadName = isAudio
        ? `${safeTitle}.${ext}`
        : `${safeTitle}_${height}p.${ext}`

      streamFileToResponse(req, res, outPath, mime, downloadName)
      resolve(true)
    })
  })

  if (!success) {
    if (!res.headersSent) res.status(500).end('فشل التحميل من المصدر الرئيسي. تأكد من الرابط أو حاول مجدداً.')
  }
}

function streamFileToResponse(req, res, filePath, mime, downloadName) {
  fs.stat(filePath, (err, st) => {
    if (err || !st) {
      if (!res.headersSent) res.status(500).end('فشل التحميل')
      return safeUnlink(filePath)
    }
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Length', String(st.size))
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
    res.setHeader('X-DL-Engine', 'dz-v2')
    const rs = fs.createReadStream(filePath)
    rs.on('error', () => { try { res.end() } catch {}; safeUnlink(filePath) })
    rs.on('close', () => safeUnlink(filePath))
    req.on('close', () => { rs.destroy(); safeUnlink(filePath) })
    rs.pipe(res)
  })
}

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
