import { spawn } from 'child_process'
import fs from 'fs'
import { monitor } from './monitor.js'

let _ffmpegAvailable = null

export async function checkFfmpeg() {
  if (_ffmpegAvailable !== null) return _ffmpegAvailable
  return new Promise(resolve => {
    const p = spawn('ffmpeg', ['-version'])
    p.on('error', () => { _ffmpegAvailable = false; resolve(false) })
    p.on('close', code => { _ffmpegAvailable = code === 0; resolve(_ffmpegAvailable) })
  })
}

export function resetFfmpegCache() { _ffmpegAvailable = null }

export async function convertToMp3(inputPath, outputPath, bitrate = 192) {
  const hasFf = await checkFfmpeg()
  if (!hasFf) throw new Error('ffmpeg غير متوفر على الخادم')

  const kbps = [128, 192, 320].includes(bitrate) ? bitrate : 192

  return new Promise((resolve, reject) => {
    monitor.info(`[ffmpeg] Converting to MP3 ${kbps}kbps: ${inputPath}`)
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-b:a', `${kbps}k`,
      '-ar', '44100',
      '-ac', '2',
      outputPath,
    ])
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', code => {
      if (code !== 0) {
        monitor.error('[ffmpeg] MP3 conversion failed: ' + stderr.slice(0, 300))
        return reject(new Error('ffmpeg MP3 conversion failed: ' + stderr.slice(0, 200)))
      }
      monitor.info(`[ffmpeg] MP3 conversion done → ${outputPath}`)
      resolve(outputPath)
    })
  })
}

export async function remuxToMp4(inputPath, outputPath) {
  const hasFf = await checkFfmpeg()
  if (!hasFf) {
    fs.renameSync(inputPath, outputPath)
    return outputPath
  }

  return new Promise((resolve, reject) => {
    monitor.info(`[ffmpeg] Remuxing to MP4 with faststart: ${inputPath}`)
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'mp4',
      outputPath,
    ])
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', code => {
      if (code !== 0) {
        monitor.warn('[ffmpeg] Remux failed, using raw: ' + stderr.slice(0, 200))
        try { fs.renameSync(inputPath, outputPath) } catch {}
        return resolve(outputPath)
      }
      try { fs.unlinkSync(inputPath) } catch {}
      monitor.info('[ffmpeg] Remux done → ' + outputPath)
      resolve(outputPath)
    })
  })
}

export async function extractAudioStream(inputPath, outputPath, opts = {}) {
  const hasFf = await checkFfmpeg()
  if (!hasFf) throw new Error('ffmpeg غير متوفر')
  const format = opts.format || 'aac'
  const bitrate = opts.bitrate || 192

  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', inputPath, '-vn']
    if (format === 'mp3') {
      args.push('-acodec', 'libmp3lame', '-b:a', `${bitrate}k`, '-ar', '44100', '-ac', '2')
    } else if (format === 'aac') {
      args.push('-acodec', 'aac', '-b:a', `${bitrate}k`, '-ar', '44100', '-ac', '2')
    } else {
      args.push('-acodec', 'copy')
    }
    args.push(outputPath)
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', code => {
      if (code !== 0) return reject(new Error('Audio extraction failed: ' + stderr.slice(0, 200)))
      resolve(outputPath)
    })
  })
}

export async function remuxStreamingAudio(upstreamUrl, req, res) {
  const hasFf = await checkFfmpeg()
  if (!hasFf) throw new Error('ffmpeg not available')

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  const proc = spawn('ffmpeg', [
    '-user_agent', ua,
    '-i', upstreamUrl,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-vn',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  res.setHeader('Content-Type', 'audio/mp4')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Remux', 'aac-mp4')

  let stderr = ''
  proc.stderr.on('data', d => { stderr += d.toString() })
  proc.stdout.pipe(res)

  proc.on('error', e => {
    monitor.error('[ffmpeg:remux-stream] ' + e.message)
    if (!res.headersSent) res.status(502).end('remux failed')
    else { try { res.end() } catch {} }
  })

  req.on('close', () => { try { proc.kill('SIGKILL') } catch {} })
  proc.on('close', code => {
    if (code !== 0) monitor.warn('[ffmpeg:remux-stream] exit ' + code + ' ' + stderr.slice(0, 200))
    try { res.end() } catch {}
  })
}
