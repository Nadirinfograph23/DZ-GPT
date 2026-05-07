import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { antiBotArgs, randomUserAgent, withExponentialBackoff, throttledRequest, isSignatureError } from './antiBot.js'
import { cookiesArgs } from './cookies.js'
import { metadataCache, urlCache } from './cache.js'
import { extractVideoId } from './security.js'
import { monitor } from './monitor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUNDLED_BIN = path.resolve(__dirname, '../../bin/yt-dlp')

// Priority order: tv_embedded and web_safari are most bot-resistant
const PLAYER_CLIENTS = [
  { name: 'android',            args: 'youtube:player_client=android' },
  { name: 'tv_embedded',        args: 'youtube:player_client=tv_embedded' },
  { name: 'web_creator',        args: 'youtube:player_client=web_creator' },
  { name: 'ios',                args: 'youtube:player_client=ios' },
  { name: 'mweb',               args: 'youtube:player_client=mweb' },
  { name: 'android,ios,web',    args: 'youtube:player_client=android,ios,web' },
  { name: 'web_safari',         args: 'youtube:player_client=web_safari' },
]

// Download clients — ordered by stability for file downloads
const DOWNLOAD_CLIENTS = [
  { name: 'android',         args: 'youtube:player_client=android' },
  { name: 'android,ios,web', args: 'youtube:player_client=android,ios,web' },
  { name: 'tv_embedded',     args: 'youtube:player_client=tv_embedded' },
  { name: 'web_creator',     args: 'youtube:player_client=web_creator' },
  { name: 'ios',             args: 'youtube:player_client=ios' },
]

let _ytDlpBin = null
let _binChecked = false

export async function resolveYtDlpBin() {
  if (_binChecked) return _ytDlpBin
  _binChecked = true

  // Try bundled binary first, then env override, then system yt-dlp
  const candidates = [
    BUNDLED_BIN,
    process.env.YTDLP_BIN,
    'yt-dlp',
  ].filter(Boolean)

  for (const c of candidates) {
    const ok = await new Promise(resolve => {
      try {
        const p = spawn(c, ['--version'])
        const t = setTimeout(() => { try { p.kill('SIGKILL') } catch {}; resolve(false) }, 5000)
        p.on('error', () => { clearTimeout(t); resolve(false) })
        p.on('close', code => { clearTimeout(t); resolve(code === 0) })
      } catch { resolve(false) }
    })
    if (ok) {
      _ytDlpBin = c
      monitor.info(`[extractor] yt-dlp binary: ${c}`)
      return c
    }
  }

  monitor.warn('[extractor] yt-dlp not found on PATH or bundled location')
  return null
}

export function resetBinCache() {
  _ytDlpBin = null
  _binChecked = false
}

// ── Core yt-dlp runner ─────────────────────────────────────────────
async function runYtDlpWithClient(bin, url, extraArgs, clientConfig, timeoutMs = 50000) {
  await throttledRequest('youtube.com')
  const cookies = await cookiesArgs()
  const ua = randomUserAgent()
  const baseArgs = [
    '--extractor-args', clientConfig.args,
    '--user-agent', ua,
    '--geo-bypass',
    '--no-check-certificate',
    '--retries', '3',
    '--fragment-retries', '3',
    '--socket-timeout', '25',
    '--no-warnings',
    '--no-playlist',
  ]
  const args = [...baseArgs, ...cookies, ...extraArgs, url]

  return new Promise((resolve, reject) => {
    monitor.extractorEvent('start', { client: clientConfig.name, url: url.slice(-40) })
    const proc = spawn(bin, args)
    let stdout = '', stderr = ''
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch {}
      reject(new Error(`yt-dlp timeout (${timeoutMs}ms) client=${clientConfig.name}`))
    }, timeoutMs)

    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', e => { clearTimeout(timer); reject(e) })
    proc.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) {
        monitor.extractorEvent('fail', { client: clientConfig.name, code, stderr: stderr.slice(0, 200) })
        return reject(new Error(stderr.slice(0, 300) || `exit ${code}`))
      }
      monitor.extractorEvent('success', { client: clientConfig.name })
      resolve({ stdout, stderr })
    })
  })
}

// ── Metadata extraction ────────────────────────────────────────────
export async function extractMetadata(url, opts = {}) {
  const cacheKey = 'meta:' + url
  if (!opts.bypassCache) {
    const cached = metadataCache.get(cacheKey)
    if (cached) return cached
  }

  const bin = await resolveYtDlpBin()
  if (!bin) throw new Error('yt-dlp غير متوفر')

  let lastErr = null
  for (const client of PLAYER_CLIENTS) {
    try {
      const { stdout } = await runYtDlpWithClient(bin, url, ['-J', '--no-playlist'], client)
      const info = JSON.parse(stdout)
      const result = {
        id: info.id,
        title: info.title || 'بدون عنوان',
        thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`,
        duration: info.duration || 0,
        channel: info.uploader || info.channel || '',
        views: info.view_count || 0,
        uploadDate: info.upload_date || null,
        description: (info.description || '').slice(0, 500),
        formats: (info.formats || []).filter(f => f.vcodec && f.vcodec !== 'none' && f.height).map(f => ({
          height: f.height,
          ext: f.ext,
          fps: f.fps,
          filesize: f.filesize || null,
          vcodec: f.vcodec,
          acodec: f.acodec,
        })),
        audioFormats: (info.formats || []).filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')).map(f => ({
          ext: f.ext,
          abr: f.abr || null,
          filesize: f.filesize || null,
          acodec: f.acodec,
        })),
        _extractedWithClient: client.name,
        _cachedAt: Date.now(),
      }
      metadataCache.set(cacheKey, result)
      return result
    } catch (e) {
      monitor.warn(`[extractor:meta] client=${client.name} failed: ${e.message.slice(0, 100)}`)
      lastErr = e
      // For signature errors, skip remaining clients (needs update) and throw immediately
      if (isSignatureError(e)) {
        monitor.warn('[extractor:meta] Signature error — all clients likely affected')
        break
      }
    }
  }
  throw lastErr || new Error('All extractor clients failed for metadata')
}

// ── Audio URL extraction (for streaming mode) ─────────────────────
export async function extractDirectAudioUrl(url, opts = {}) {
  const videoId = extractVideoId(url)
  const cacheKey = 'audio_url:' + (videoId || url)

  if (!opts.bypassCache) {
    const cached = urlCache.get(cacheKey)
    if (cached) return cached
  }

  const bin = await resolveYtDlpBin()
  if (!bin) throw new Error('yt-dlp غير متوفر')

  const formatStr = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best'

  let lastErr = null
  for (const client of PLAYER_CLIENTS) {
    try {
      const { stdout } = await withExponentialBackoff(
        () => runYtDlpWithClient(bin, url, ['-f', formatStr, '-g', '--no-playlist'], client, 30000),
        { maxAttempts: 2, baseDelay: 1000, label: `audio-url:${client.name}` }
      )
      const resolved = stdout.trim().split('\n')[0]
      if (!resolved || !resolved.startsWith('http')) throw new Error('No valid URL returned')
      urlCache.set(cacheKey, resolved)
      monitor.info(`[extractor] Audio URL resolved via client=${client.name}`)
      return resolved
    } catch (e) {
      monitor.warn(`[extractor:audio-url] client=${client.name} failed: ${e.message.slice(0, 100)}`)
      lastErr = e
    }
  }

  // Last resort: try Piped API for audio URL
  if (videoId) {
    const pipedUrl = await extractAudioUrlPiped(videoId)
    if (pipedUrl) {
      urlCache.set(cacheKey, pipedUrl, 10 * 60 * 1000) // shorter TTL for piped
      monitor.info('[extractor] Audio URL resolved via Piped fallback')
      return pipedUrl
    }
  }

  throw lastErr || new Error('All extractor clients failed for audio URL')
}

// ── Piped API fallback for audio URL ──────────────────────────────
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.projectsegfau.lt',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.adminforge.de',
]

async function extractAudioUrlPiped(videoId) {
  for (const base of PIPED_INSTANCES) {
    try {
      const r = await fetch(`${base}/streams/${videoId}`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': randomUserAgent() },
      })
      if (!r.ok) continue
      const data = await r.json()
      const streams = data.audioStreams || []
      // Prefer m4a/aac, then webm/opus
      const best = streams.find(s => s.mimeType?.includes('audio/mp4'))
        || streams.find(s => s.mimeType?.includes('audio/webm'))
        || streams[0]
      if (best?.url) {
        monitor.info(`[extractor:piped] Got audio URL from ${base}`)
        return best.url
      }
    } catch (e) {
      monitor.warn(`[extractor:piped] ${base} failed: ${e.message.slice(0, 80)}`)
    }
  }
  return null
}

// ── Download args builder ─────────────────────────────────────────
export async function extractDownloadArgs(url, format, height, bitrate, hasFfmpeg, opts = {}) {
  const cookies = await cookiesArgs()
  const ua = randomUserAgent()
  // Use the best multi-client combo for downloads
  const clientArg = opts.clientArg || 'android,ios,web'

  const baseArgs = [
    '--extractor-args', `youtube:player_client=${clientArg}`,
    '--user-agent', ua,
    '--geo-bypass',
    '--no-check-certificate',
    '--retries', '4',
    '--fragment-retries', '4',
    '--socket-timeout', '30',
    '--no-warnings',
    '--no-playlist',
    ...cookies,
  ]

  let formatStr, mime, ext
  const isAudio = format === 'mp3' || format === 'audio' || format === 'm4a'

  if (format === 'mp3' && hasFfmpeg) {
    formatStr = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/18'
    ext = 'mp3'; mime = 'audio/mpeg'
    return {
      args: [...baseArgs, '-f', formatStr, '-x', '--audio-format', 'mp3', '--audio-quality', `${bitrate}k`],
      ext, mime, clientArg
    }
  }
  if (isAudio && hasFfmpeg) {
    formatStr = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/18'
    ext = 'm4a'; mime = 'audio/mp4'
    return {
      args: [...baseArgs, '-f', formatStr, '-x', '--audio-format', 'm4a'],
      ext, mime, clientArg
    }
  }
  if (isAudio) {
    formatStr = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/18'
    ext = 'm4a'; mime = 'audio/mp4'
    return { args: [...baseArgs, '-f', formatStr], ext, mime, clientArg }
  }
  if (hasFfmpeg) {
    formatStr = `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}][ext=mp4]/best[height<=${height}]/22/18`
    ext = 'mp4'; mime = 'video/mp4'
    return { args: [...baseArgs, '-f', formatStr, '--merge-output-format', 'mp4'], ext, mime, clientArg }
  }
  formatStr = `best[ext=mp4][acodec!=none][vcodec!=none][height<=${height}]/best[height<=${height}]/22/18`
  ext = 'mp4'; mime = 'video/mp4'
  return { args: [...baseArgs, '-f', formatStr], ext, mime, clientArg }
}

// Export DOWNLOAD_CLIENTS for use in index.js retry loop
export { DOWNLOAD_CLIENTS }
