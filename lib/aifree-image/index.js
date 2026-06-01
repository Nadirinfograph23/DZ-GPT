/**
 * lib/aifree-image/index.js
 * Node.js interface to the Python CF-bypass service (port 7891)
 * Starts the Python process on first call; keeps it alive.
 */
import { spawn }     from 'child_process'
import { fileURLToPath } from 'url'
import path          from 'path'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const SVC_URL    = 'http://127.0.0.1:7891'
const SVC_SCRIPT = path.join(__dirname, 'cf_service.py')
const TIMEOUT_MS = 100_000

let _proc   = null
let _ready  = false
let _booting= null   // Promise while booting

// ── start Python service ──────────────────────────────────────────────────────
function startService() {
  if (_proc) return
  console.log('[aifree] Starting CF-bypass service...')
  _proc = spawn('python3', [SVC_SCRIPT], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })
  _proc.stdout.on('data', d => {
    const line = d.toString().trim()
    console.log('[aifree-py]', line)
    if (line.includes('Ready')) _ready = true
  })
  _proc.stderr.on('data', d => {
    const line = d.toString().trim()
    if (line) console.warn('[aifree-py:err]', line)
  })
  _proc.on('exit', (code) => {
    console.warn(`[aifree] service exited (code=${code}) — will restart on next request`)
    _proc  = null
    _ready = false
  })
}

// ── wait until /health responds ───────────────────────────────────────────────
async function waitReady(maxMs = 50_000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${SVC_URL}/health`, { signal: AbortSignal.timeout(3000) })
      if (r.ok) { _ready = true; return true }
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 800))
  }
  return false
}

// ── ensure service is running ─────────────────────────────────────────────────
async function ensureRunning() {
  if (_ready) return true
  if (_booting) return _booting

  _booting = (async () => {
    startService()
    const ok = await waitReady()
    _booting = null
    return ok
  })()

  return _booting
}

// ── public API ────────────────────────────────────────────────────────────────
/**
 * Get list of available models from aifreeforever.com
 * @returns {Promise<Array<{id,label,badge}>>}
 */
export async function getModels() {
  await ensureRunning()
  try {
    const r = await fetch(`${SVC_URL}/models`, { signal: AbortSignal.timeout(20_000) })
    const d = await r.json()
    return d.models || []
  } catch (e) {
    console.warn('[aifree] getModels error:', e.message)
    return []
  }
}

/**
 * Generate an image via aifreeforever.com (CF-bypassed)
 * @param {string} prompt
 * @param {object} opts
 * @returns {Promise<{ok,imageUrl?,imageBase64?,mime?,model,provider,error?}>}
 */
export async function generateImage(prompt, {
  model  = 'flux-schnell',
  width  = 768,
  height = 768,
  steps  = 25,
} = {}) {
  const up = await ensureRunning()
  if (!up) return { ok: false, error: 'CF-bypass service failed to start' }

  try {
    const r = await fetch(`${SVC_URL}/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ prompt, model, width, height, steps }),
      signal:  AbortSignal.timeout(TIMEOUT_MS),
    })
    const data = await r.json()
    return data
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// Pre-warm on module load (non-blocking)
ensureRunning().catch(() => {})
