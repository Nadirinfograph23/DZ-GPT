import { spawn } from 'child_process'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..')
const LOCAL_YTDLP = join(PROJECT_ROOT, 'bin', 'yt-dlp')
const YTDLP_PATH = process.env.YTDLP_PATH || (existsSync(LOCAL_YTDLP) ? LOCAL_YTDLP : 'yt-dlp')
const MCP_VIDEO_ANALYZER_CMD = join(PROJECT_ROOT, 'node_modules', '.bin', 'mcp-video-analyzer')
const MCP_VIDEO_ANALYZER_ARGS = ['analyze']
const ANALYSIS_TIMEOUT_MS = 120_000

/**
 * @typedef {Object} VideoAnalyzerResult
 * @property {boolean} ok
 * @property {string} url
 * @property {Object} [metadata]
 * @property {Array} [transcript]
 * @property {Array} [ocrResults]
 * @property {Array} [timeline]
 * @property {Array} [frames]
 * @property {string[]} [warnings]
 * @property {number} [frameCount]
 * @property {string} [error]
 */

export async function analyzeVideo(url, opts = {}) {
  const { detail = 'standard', maxFrames, forceRefresh = false } = opts

  if (!url || typeof url !== 'string') {
    return { ok: false, url, error: 'url مطلوب' }
  }

  const args = [url, '--detail', detail]
  if (maxFrames) args.push('--max-frames', String(maxFrames))
  if (forceRefresh) args.push('--force-refresh')

  return new Promise((resolve) => {
    const ytdlpDir = join(PROJECT_ROOT, 'bin')
    const child = spawn(MCP_VIDEO_ANALYZER_CMD, [...MCP_VIDEO_ANALYZER_ARGS, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: ANALYSIS_TIMEOUT_MS,
      env: { ...process.env, PATH: `${ytdlpDir}${process.env.PATH ? ':' + process.env.PATH : ''}` },
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGKILL') } catch {}
      resolve({ ok: false, url, error: 'انتهت المهلة — التحليل استغرق وقتاً أطول من المتوقع', warnings: [stderr] })
    }, ANALYSIS_TIMEOUT_MS)

    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, url, error: `فشل تشغيل محلل الفيديو: ${err.message}`, warnings: [stderr] })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) return

      const trimmed = stdout.trim()
      if (!trimmed) {
        return resolve({ ok: false, url, error: `لم يتم إخراج نتائج (exit ${code})`, warnings: [stderr] })
      }

      try {
        const parsed = JSON.parse(trimmed)
        const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter(Boolean) : (stderr ? [stderr] : [])

        if (code !== 0 && !parsed.metadata && !parsed.transcript) {
          return resolve({
            ok: false,
            url,
            error: `تحليل الفيديو فشل (exit ${code})`,
            warnings,
            raw: parsed,
          })
        }

        return resolve({
          ok: true,
          url,
          metadata: parsed.metadata,
          transcript: Array.isArray(parsed.transcript) ? parsed.transcript : undefined,
          ocrResults: Array.isArray(parsed.ocrResults) ? parsed.ocrResults : undefined,
          timeline: Array.isArray(parsed.timeline) ? parsed.timeline : undefined,
          frames: Array.isArray(parsed.frames) ? parsed.frames : undefined,
          frameCount: parsed.frameCount,
          warnings,
          raw: parsed,
        })
      } catch (e) {
        return resolve({
          ok: false,
          url,
          error: `نتيجة غير صالحة من محلل الفيديو`,
          warnings: [stderr, `JSON parse error: ${e.message}`],
        })
      }
    })
  })
}

export function isMCPVideoAnalyzerAvailable() {
  try {
    const ytdlpOk = existsSync(YTDLP_PATH) || execSync('yt-dlp --version', { encoding: 'utf8', timeout: 5000 }).trim()
    const binOk = existsSync(MCP_VIDEO_ANALYZER_CMD)
    return Boolean(ytdlpOk && binOk)
  } catch {
    return false
  }
}
