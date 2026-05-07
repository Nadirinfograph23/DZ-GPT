import { spawn } from 'child_process'
import { antiBotArgs, randomUserAgent, withExponentialBackoff } from './antiBot.js'
import { cookiesArgs } from './cookies.js'
import { metadataCache, urlCache } from './cache.js'
import { extractVideoId } from './security.js'
import { monitor } from './monitor.js'

const PLAYER_CLIENTS = [
  { name: 'android', args: 'youtube:player_client=android' },
  { name: 'web_creator', args: 'youtube:player_client=web_creator' },
  { name: 'ios', args: 'youtube:player_client=ios' },
  { name: 'mweb', args: 'youtube:player_client=mweb' },
  { name: 'android,ios,web', args: 'youtube:player_client=android,ios,web' },
]

let _ytDlpBin = null
let _binChecked = false

export async function resolveYtDlpBin() {
  if (_binChecked) return _ytDlpBin
  _binChecked = true
  const candidates = [
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
    if (ok) { _ytDlpBin = c; monitor.info(`[extractor] yt-dlp binary: ${c}`); return c }
  }
  monitor.warn('[extractor] yt-dlp not found on PATH')
  return null
}

export function resetBinCache() {
  _ytDlpBin = null
  _binChecked = false
}

async function runYtDlpWithClient(bin, url, extraArgs, clientConfig, timeoutMs = 45000) {
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
    }
  }
  throw lastErr || new Error('All extractor clients failed for metadata')
}

export async function extractDirectAudioUrl(url, opts = {}) {
  const videoId = extractVideoId(url)
  const cacheKey = 'audio_url:' + (videoId || url)

  if (!opts.bypassCache) {
    const cached = urlCache.get(cacheKey)
    if (cached) return cached
  }

  const bin = await resolveYtDlpBin()
  if (!bin) throw new Error('yt-dlp غير متوفر')

  const formatStr = 'bestaudio[ext=m4a]/bestaudio/best'

  let lastErr = null
  for (const client of PLAYER_CLIENTS) {
    try {
      const { stdout } = await withExponentialBackoff(
        () => runYtDlpWithClient(bin, url, ['-f', formatStr, '-g', '--no-playlist'], client, 30000),
        { maxAttempts: 2, baseDelay: 1000, label: `audio-url:${client.name}` }
      )
      const resolved = stdout.trim().split('\n')[0]
      if (!resolved) throw new Error('No URL returned')
      urlCache.set(cacheKey, resolved)
      monitor.info(`[extractor] Audio URL resolved via client=${client.name}`)
      return resolved
    } catch (e) {
      monitor.warn(`[extractor:audio-url] client=${client.name} failed: ${e.message.slice(0, 100)}`)
      lastErr = e
    }
  }
  throw lastErr || new Error('All extractor clients failed for audio URL')
}

export async function extractDownloadArgs(url, format, height, bitrate, hasFfmpeg, opts = {}) {
  const cookies = await cookiesArgs()
  const ua = randomUserAgent()
  const clientArg = 'android,ios,web'

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
    formatStr = 'bestaudio/18'
    ext = 'mp3'; mime = 'audio/mpeg'
    return {
      args: [...baseArgs, '-f', formatStr, '-x', '--audio-format', 'mp3', '--audio-quality', `${bitrate}k`],
      ext, mime
    }
  }
  if (isAudio && hasFfmpeg) {
    formatStr = 'bestaudio[ext=m4a]/bestaudio/18'
    ext = 'm4a'; mime = 'audio/mp4'
    return {
      args: [...baseArgs, '-f', formatStr, '-x', '--audio-format', 'm4a'],
      ext, mime
    }
  }
  if (isAudio) {
    formatStr = 'bestaudio[ext=m4a]/bestaudio/18'
    ext = 'm4a'; mime = 'audio/mp4'
    return { args: [...baseArgs, '-f', formatStr], ext, mime }
  }
  if (hasFfmpeg) {
    formatStr = `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${height}][ext=mp4]/best[height<=${height}]/22/18`
    ext = 'mp4'; mime = 'video/mp4'
    return { args: [...baseArgs, '-f', formatStr, '--merge-output-format', 'mp4'], ext, mime }
  }
  formatStr = `best[ext=mp4][acodec!=none][vcodec!=none][height<=${height}]/22/18`
  ext = 'mp4'; mime = 'video/mp4'
  return { args: [...baseArgs, '-f', formatStr], ext, mime }
}
