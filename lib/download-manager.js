// ══════════════════════════════════════════════════════════════════
// 📥 DZ-GPT Download Manager — Background Job Queue v1.0
// ══════════════════════════════════════════════════════════════════
// Architecture:
//   createJob() → queue → runJob() → executeDownload()
//                                  → yt-dlp (primary, with progress)
//                                  → Cobalt API (fallback)
//                                  → graceful error
//
// Design principles:
//   - Jobs run in background — never blocks HTTP requests
//   - Real-time progress via SSE (subscribe/emit)
//   - Concurrency-limited (3 simultaneous downloads)
//   - Per-IP rate limiting (5 downloads / 10 min)
//   - Auto-cleanup after 30 min
//   - No credentials in source code
// ══════════════════════════════════════════════════════════════════

import path    from 'path'
import os      from 'os'
import crypto  from 'crypto'
import fs      from 'fs'
import { spawn } from 'child_process'
import { giststackFetchInfo, giststackPickUrl, isGiststackAvailable } from './providers/giststack-provider.js'
import { viddariResolve, viddariPickUrl, isViddariSupported } from './providers/viddari-provider.js'

// ── Configuration ──────────────────────────────────────────────────
const CONCURRENCY    = 3
const RATE_MAX       = 5
const RATE_WINDOW_MS = 10 * 60 * 1000   // 10 min
const JOB_TTL_MS     = 30 * 60 * 1000   // 30 min file retention
const DL_TIMEOUT_MS  = 8 * 60 * 1000    // 8 min max per download

// ── Temp directory ─────────────────────────────────────────────────
export const DL_TMP_DIR = path.join(os.tmpdir(), 'dz-downloads')
try { fs.mkdirSync(DL_TMP_DIR, { recursive: true }) } catch {}

// ── In-memory stores ─────────────────────────────────────────────
const jobs     = new Map()   // Map<jobId, Job>
const listeners= new Map()   // Map<jobId, Set<(ev,data)=>void>>
const rateMap  = new Map()   // Map<ip, { count, resetAt }>
let   running  = 0
const queue    = []

// ── Error codes ──────────────────────────────────────────────────
export const DL_ERRORS = {
  UNSUPPORTED_URL:   'UNSUPPORTED_URL',
  EXTRACTION_FAILED: 'EXTRACTION_FAILED',
  PLATFORM_BLOCKED:  'PLATFORM_BLOCKED',
  RATE_LIMITED:      'RATE_LIMITED',
  DNS_ERROR:         'DNS_ERROR',
  NETWORK_ERROR:     'NETWORK_ERROR',
  TIMEOUT:           'TIMEOUT',
  FILE_TOO_LARGE:    'FILE_TOO_LARGE',
  STORAGE_ERROR:     'STORAGE_ERROR',
  DOWNLOAD_EXPIRED:  'DOWNLOAD_EXPIRED',
}

// ── Error classifier ─────────────────────────────────────────────
function classifyError(msg = '') {
  const m = msg.toLowerCase()
  if (m.includes('unsupported url') || m.includes('no suitable extractor') || m.includes('is not a valid url'))
    return DL_ERRORS.UNSUPPORTED_URL
  if (m.includes('403') || m.includes('forbidden') || m.includes('private video') || m.includes('members only'))
    return DL_ERRORS.PLATFORM_BLOCKED
  if (m.includes('429') || m.includes('too many requests') || m.includes('rate limit'))
    return DL_ERRORS.RATE_LIMITED
  if (m.includes('getaddrinfo') || m.includes('dns') || m.includes('enotfound'))
    return DL_ERRORS.DNS_ERROR
  if (m.includes('timed out') || m.includes('timeout'))
    return DL_ERRORS.TIMEOUT
  if (m.includes('econnreset') || m.includes('connection reset') || m.includes('econnrefused'))
    return DL_ERRORS.NETWORK_ERROR
  if (m.includes('too large') || m.includes('no space'))
    return DL_ERRORS.FILE_TOO_LARGE
  return DL_ERRORS.EXTRACTION_FAILED
}

// ── Rate limiter ──────────────────────────────────────────────────
function checkRate(ip) {
  const now = Date.now()
  const e = rateMap.get(ip)
  if (!e || now > e.resetAt) { rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS }); return true }
  if (e.count >= RATE_MAX) return false
  e.count++
  return true
}

// ── SSE helpers ──────────────────────────────────────────────────
function emit(jobId, event, data) {
  const subs = listeners.get(jobId)
  if (!subs) return
  for (const cb of subs) try { cb(event, data) } catch {}
}

export function subscribe(jobId, cb) {
  if (!listeners.has(jobId)) listeners.set(jobId, new Set())
  listeners.get(jobId).add(cb)
  return () => {
    const s = listeners.get(jobId)
    if (s) { s.delete(cb); if (!s.size) listeners.delete(jobId) }
  }
}

export function getJob(jobId) { return jobs.get(jobId) ?? null }

// ── Parse yt-dlp progress line ───────────────────────────────────
// [download]   2.5% of   45.78MiB at    1.23MiB/s ETA 00:36
const _PR = /\[download\]\s+([\d.]+)%\s+of\s+([\d.]+)(KiB|MiB|GiB|B)\s+at\s+([\d.]+)(KiB|MiB|GiB|B|k|M|G)\/s\s+ETA\s+(\d+):(\d+)/

function toBytes(n, u) {
  const x = parseFloat(n)
  if (u === 'GiB' || u === 'G') return x * 1073741824
  if (u === 'MiB' || u === 'M') return x * 1048576
  if (u === 'KiB' || u === 'k') return x * 1024
  return x
}

function parseProgress(line) {
  const m = line.match(_PR)
  if (!m) return null
  const pct   = Math.round(parseFloat(m[1]))
  const total = Math.round(toBytes(m[2], m[3]))
  const speed = Math.round(toBytes(m[4], m[5]))
  const eta   = parseInt(m[6]) * 60 + parseInt(m[7])
  return { pct, total, speed, eta, loaded: Math.round((pct / 100) * total) }
}

// ── yt-dlp binary (cached) ───────────────────────────────────────
let _binCache = undefined
async function getYtDlpBin() {
  if (_binCache !== undefined) return _binCache
  const candidates = []
  if (process.env.YTDLP_BIN) candidates.push(process.env.YTDLP_BIN)
  try {
    const { fileURLToPath } = await import('url')
    const { dirname, join } = await import('path')
    const here = dirname(fileURLToPath(import.meta.url))
    candidates.push(join(here, '..', 'bin', 'yt-dlp'))
    candidates.push(join(process.cwd(), 'bin', 'yt-dlp'))
  } catch {}
  candidates.push('yt-dlp')
  for (const c of candidates) {
    const ok = await new Promise(res => {
      try {
        if (c.includes('/')) {
          if (!fs.existsSync(c)) return res(false)
          try { fs.chmodSync(c, 0o755) } catch {}
        }
        const p = spawn(c, ['--version'])
        const t = setTimeout(() => { try { p.kill() } catch {}; res(false) }, 3000)
        p.on('error', () => { clearTimeout(t); res(false) })
        p.on('close', code => { clearTimeout(t); res(code === 0) })
      } catch { res(false) }
    })
    if (ok) { _binCache = c; return c }
  }
  _binCache = null
  return null
}

// ── yt-dlp cookies ───────────────────────────────────────────────
async function getYtDlpCookies() {
  try {
    if (process.env.YTDLP_COOKIES_PATH && fs.existsSync(process.env.YTDLP_COOKIES_PATH))
      return ['--cookies', process.env.YTDLP_COOKIES_PATH]
    if (process.env.YOUTUBE_COOKIES) {
      const p = path.join(DL_TMP_DIR, 'yt-cookies.txt')
      fs.writeFileSync(p, Buffer.from(process.env.YOUTUBE_COOKIES, 'base64').toString())
      return ['--cookies', p]
    }
  } catch {}
  return []
}

// ── Client rotation for anti-bot ─────────────────────────────────
const YT_CLIENTS = ['ios', 'android,ios,web', 'tv_embedded', 'mweb']
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
]
let _uai = 0; function nextUA() { return USER_AGENTS[_uai++ % USER_AGENTS.length] }

// ── Run yt-dlp with progress ─────────────────────────────────────
function ytDlpDownload(bin, url, fmt, outTpl, cookies, clientIdx, job) {
  return new Promise((resolve, reject) => {
    const client = YT_CLIENTS[clientIdx % YT_CLIENTS.length]
    const args = [
      '-f', fmt,
      '-o', outTpl,
      '--no-playlist', '--no-warnings',
      '--progress', '--newline',
      '--extractor-args', `youtube:player_client=${client};skip=hls`,
      '--user-agent', nextUA(),
      '--geo-bypass', '--no-check-certificate', '--no-check-formats',
      '--retries', '3', '--fragment-retries', '3',
      '--socket-timeout', '30',
      '--merge-output-format', 'mp4',
      ...cookies,
      url,
    ]
    const proc = spawn(bin, args)
    job._proc = proc

    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch {}
      reject(new Error('Download timeout after 8 minutes'))
    }, DL_TIMEOUT_MS)

    let stderr = ''
    const onLine = line => {
      const pg = parseProgress(line)
      if (pg) {
        Object.assign(job, { progress: pg.pct, speed: pg.speed, eta: pg.eta, loaded: pg.loaded, total: pg.total })
        emit(job.id, 'progress', pg)
      }
    }
    proc.stdout.on('data', d => d.toString().split('\n').forEach(onLine))
    proc.stderr.on('data', d => {
      stderr += d.toString()
      d.toString().split('\n').forEach(onLine)
    })
    proc.on('error', err => { clearTimeout(killTimer); reject(err) })
    proc.on('close', code => {
      clearTimeout(killTimer)
      delete job._proc
      if (code === 0 || code === null) resolve()
      else reject(new Error(stderr.slice(-600) || `yt-dlp exited ${code}`))
    })
  })
}

// ── Download from direct URL (Cobalt / Viddari fallback) ─────────
async function fetchToFile(url, dest, job, extraHeaders = {}) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': nextUA(), 'Accept': '*/*', ...extraHeaders },
    signal: AbortSignal.timeout(DL_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from upstream`)

  const total = parseInt(resp.headers.get('content-length') || '0')
  job.total = total

  const writer = fs.createWriteStream(dest)
  const reader = resp.body.getReader()
  let loaded = 0, lastTime = Date.now(), lastLoaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    await new Promise((res, rej) => writer.write(value, err => err ? rej(err) : res()))
    loaded += value.byteLength
    const now = Date.now()
    if (now - lastTime > 350) {
      const speed = Math.round((loaded - lastLoaded) / ((now - lastTime) / 1000))
      const pct   = total > 0 ? Math.round((loaded / total) * 100) : 0
      const eta   = speed > 0 && total > 0 ? Math.round((total - loaded) / speed) : 0
      Object.assign(job, { progress: pct, speed, eta, loaded, total })
      emit(job.id, 'progress', { pct, total, speed, eta, loaded })
      lastLoaded = loaded; lastTime = now
    }
  }
  await new Promise((res, rej) => writer.end(err => err ? rej(err) : res()))
}

// ── Cobalt fallback ───────────────────────────────────────────────
const COBALT = [
  'https://api.cobalt.best',
  'https://cobalt.tools',
  'https://dwnld.nichijou.co',
  'https://cobalt.api.timelessnesses.me',
  'https://cobaltapi.0x7d.eu',
]
async function cobaltUrl(url, format) {
  for (const base of COBALT) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 10000)
      const r = await fetch(`${base}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json',
          'User-Agent': 'DZ-GPT/2.0 (+https://dz-gpt.vercel.app)' },
        body: JSON.stringify({
          url,
          downloadMode: format === 'audio' ? 'audio' : 'auto',
          filenameStyle: 'basic',
          videoQuality: '720',
          audioFormat: 'mp3',
          audioBitrate: '192',
        }),
        signal: ctrl.signal,
      })
      clearTimeout(t)
      const j = await r.json().catch(() => ({}))
      if (j.status === 'error' || j.error) continue
      if (j.url) return j.url
    } catch { /* next instance */ }
  }
  return null
}

// ── Find output file ─────────────────────────────────────────────
function findFile(id) {
  try {
    const f = fs.readdirSync(DL_TMP_DIR).find(x => x.startsWith(id + '.'))
    if (!f) return null
    const full = path.join(DL_TMP_DIR, f)
    const ext  = path.extname(f).slice(1) || 'mp4'
    const size = fs.statSync(full).size
    return { path: full, ext, size }
  } catch { return null }
}

// ── Cleanup ───────────────────────────────────────────────────────
function cleanupJob(id) {
  const job = jobs.get(id)
  if (!job) return
  clearTimeout(job._cleanupTimer)
  if (job._proc) { try { job._proc.kill('SIGKILL') } catch {} }
  if (job.filePath) { try { fs.unlinkSync(job.filePath) } catch {} }
  jobs.delete(id)
  listeners.delete(id)
  console.log(`[DLMgr:${id}] cleaned up`)
}

export function cancelJob(id) {
  const job = jobs.get(id)
  if (!job) return false
  cleanupJob(id)
  return true
}

// ── Queue drain ───────────────────────────────────────────────────
function drain() {
  while (running < CONCURRENCY && queue.length > 0) runJob(queue.shift())
}

// ── Execute one download job ──────────────────────────────────────
// Provider chain: Viddari → Giststack → yt-dlp → Cobalt
async function executeDownload(job) {
  const { id, url, format, quality } = job

  // ── 0. VIDDARI — First Provider (no API key needed) ───────────
  if (isViddariSupported(url)) {
    try {
      emit(id, 'status', { status: 'running', message: 'جارٍ الاستخراج عبر Viddari...' })
      const info   = await viddariResolve(url)
      const cdnUrl = viddariPickUrl(info, format)
      if (cdnUrl) {
        const ext  = format === 'audio' ? 'm4a' : 'mp4'
        const dest = path.join(DL_TMP_DIR, `${id}.${ext}`)
        job.ext = ext
        if (info.title && !job.title) job.title = info.title
        emit(id, 'status', { status: 'running', message: 'Viddari ✅ — جارٍ التحميل...' })
        // Viddari proxy URLs need Origin/Referer headers
        const headers = cdnUrl.includes('api.viddari.com')
          ? { 'Origin': 'https://viddari.com', 'Referer': 'https://viddari.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          : undefined
        await fetchToFile(cdnUrl, dest, job, headers)
        if (fs.existsSync(dest)) {
          job.filePath = dest; job.ext = ext
          job.status = 'done'
          emit(id, 'done', { ext, size: fs.statSync(dest).size, filename: job.filename })
          console.log(`[DLMgr:${id}] ✅ Viddari primary success`)
          return
        }
      }
    } catch (e) {
      console.warn(`[DLMgr:${id}] Viddari fail: ${e.message?.slice(0, 100)}`)
      emit(id, 'retry', { attempt: 0, error: 'Viddari unavailable — trying Giststack...' })
    }
  }

  // ── 1. GISTSTACK — Secondary Provider ─────────────────────────
  if (isGiststackAvailable()) {
    try {
      emit(id, 'status', { status: 'running', message: 'جارٍ الاستخراج عبر Giststack...' })
      const info    = await giststackFetchInfo(url)
      const cdnUrl  = giststackPickUrl(info, format, quality)
      if (cdnUrl) {
        const ext  = format === 'audio' ? 'm4a' : 'mp4'
        const dest = path.join(DL_TMP_DIR, `${id}.${ext}`)
        job.ext = ext
        // Update job title/thumbnail from Giststack metadata
        if (info.title && !job.title) job.title = info.title
        emit(id, 'status', { status: 'running', message: 'Giststack ✅ — جارٍ التحميل...' })
        await fetchToFile(cdnUrl, dest, job)
        if (fs.existsSync(dest)) {
          job.filePath = dest; job.ext = ext
          job.status = 'done'
          emit(id, 'done', { ext, size: fs.statSync(dest).size, filename: job.filename })
          console.log(`[DLMgr:${id}] ✅ Giststack primary success`)
          return
        }
      }
    } catch (e) {
      console.warn(`[DLMgr:${id}] Giststack primary fail: ${e.message?.slice(0, 100)}`)
      emit(id, 'retry', { attempt: 0, error: 'Giststack unavailable — trying yt-dlp...' })
    }
  }

  // ── 2. yt-dlp — Secondary Provider ────────────────────────────
  let fmtSel
  if (format === 'audio') {
    fmtSel = 'bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio/best'
    job.ext = 'm4a'
  } else {
    const h = parseInt(quality) || 0
    const hStr = h >= 1080 ? '1080' : h >= 720 ? '720' : h >= 480 ? '480' : h >= 360 ? '360' : ''
    fmtSel = hStr
      ? `bestvideo[height<=${hStr}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${hStr}]+bestaudio/best[height<=${hStr}]/best`
      : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
    job.ext = 'mp4'
  }

  const outTpl  = path.join(DL_TMP_DIR, `${id}.%(ext)s`)
  const dlpBin  = await getYtDlpBin()
  const cookies = await getYtDlpCookies()

  if (dlpBin) {
    let lastErr = null
    for (let i = 0; i < 3; i++) {
      try {
        emit(id, 'status', { status: 'running', attempt: i + 1 })
        await ytDlpDownload(dlpBin, url, fmtSel, outTpl, cookies, i, job)
        const dl = findFile(id)
        if (dl) {
          job.filePath = dl.path; job.ext = dl.ext
          job.status = 'done'
          emit(id, 'done', { ext: dl.ext, size: dl.size, filename: job.filename })
          return
        }
        throw new Error('yt-dlp succeeded but output file not found')
      } catch (e) {
        lastErr = e
        const errType = classifyError(e.message)
        console.warn(`[DLMgr:${id}] yt-dlp attempt ${i + 1} fail: ${e.message?.slice(0, 80)}`)
        if ([DL_ERRORS.PLATFORM_BLOCKED, DL_ERRORS.UNSUPPORTED_URL].includes(errType)) break
        if (i < 2) {
          emit(id, 'retry', { attempt: i + 1, error: e.message?.slice(0, 100) })
          await new Promise(r => setTimeout(r, (i + 1) * 1500))
        }
      }
    }
    console.warn(`[DLMgr:${id}] yt-dlp exhausted, trying Cobalt`)
  }

  // ── 3. Cobalt — Tertiary Fallback ──────────────────────────────
  emit(id, 'status', { status: 'running', message: 'جارٍ المحاولة عبر Cobalt...' })
  const cUrl = await cobaltUrl(url, format).catch(() => null)
  if (cUrl) {
    const ext  = format === 'audio' ? 'mp3' : 'mp4'
    const dest = path.join(DL_TMP_DIR, `${id}.${ext}`)
    await fetchToFile(cUrl, dest, job)
    if (fs.existsSync(dest)) {
      job.filePath = dest; job.ext = ext
      job.status = 'done'
      emit(id, 'done', { ext, size: fs.statSync(dest).size, filename: job.filename })
      return
    }
  }

  throw new Error('فشل التحميل — جميع الطرق استُنفذت (Giststack + yt-dlp + Cobalt)')
}

// ── Run job wrapper ───────────────────────────────────────────────
async function runJob(job) {
  running++
  job.status = 'running'
  emit(job.id, 'status', { status: 'running' })
  try {
    await executeDownload(job)
  } catch (err) {
    job.status = 'error'
    job.error  = err.message?.slice(0, 200) || 'خطأ غير معروف'
    job.errorType = classifyError(err.message)
    emit(job.id, 'error', { error: job.error, errorType: job.errorType })
    console.error(`[DLMgr:${job.id}] FAILED: ${job.error}`)
  } finally {
    running--
    // Schedule cleanup
    job._cleanupTimer = setTimeout(() => cleanupJob(job.id), JOB_TTL_MS)
    drain()
  }
}

// ══════════════════════════════════════════════════════════════════
// createJob — public API
// ══════════════════════════════════════════════════════════════════
export function createJob({ url, format = 'video', quality = 'best', platform = null, title = '', ip = 'unknown' }) {
  if (!checkRate(ip)) {
    return { ok: false, error: 'حد التحميل: 5 ملفات كل 10 دقائق — حاول بعد قليل', errorType: DL_ERRORS.RATE_LIMITED }
  }

  const id       = crypto.randomBytes(14).toString('hex')
  const filename = (title || platform || 'media').replace(/[^\w\u0600-\u06FF\s._-]/g, '_').slice(0, 120).trim() || 'media'

  const job = {
    id, url, format, quality, platform, title, filename,
    status: 'queued',
    progress: 0, speed: 0, eta: 0, loaded: 0, total: 0,
    ext: format === 'audio' ? 'm4a' : 'mp4',
    error: null, errorType: null, filePath: null,
    createdAt: Date.now(),
    _proc: null, _cleanupTimer: null,
  }

  jobs.set(id, job)

  if (running < CONCURRENCY) {
    runJob(job)
  } else {
    queue.push(job)
    emit(id, 'queued', { position: queue.length })
    console.log(`[DLMgr:${id}] queued (position ${queue.length})`)
  }

  console.log(`[DLMgr:${id}] created — url=${url.slice(0, 60)} fmt=${format} quality=${quality}`)
  return { ok: true, jobId: id }
}

// ── Periodic GC (every 5 min) ─────────────────────────────────────
setInterval(() => {
  const exp = Date.now() - JOB_TTL_MS
  for (const [id, job] of jobs) {
    if (job.createdAt < exp && !job._cleanupTimer) cleanupJob(id)
  }
}, 5 * 60 * 1000)
