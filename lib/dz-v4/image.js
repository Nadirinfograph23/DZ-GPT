// DZ Agent V4 PRO — image generation engine.
// Uses the HuggingFace free inference API (Stable Diffusion family).
// HF_TOKEN is OPTIONAL: with a token you get a fair quota; without it
// the public endpoint still works but is rate-limited. If HF returns
// any error, we fall back to a deterministic SVG placeholder so the
// "never empty" V4 contract holds.
//
// Output contract (per the SYSTEM ROLE):
//   IMAGE: <url to /api/dz-agent-v4/image/:id>
//   PROMPT USED: <enhanced prompt>

import crypto from 'node:crypto'

// HuggingFace migrated text-to-image inference behind a provider router.
// The legacy `api-inference.huggingface.co/models/*` returns 404 / 410 for
// every SD model now. The current free path is the `hf-inference` provider
// on the router, with FLUX.1-schnell as the fastest free model.
const PROVIDERS = [
  // [endpoint URL, body builder]
  ['https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
    (prompt, neg) => ({ inputs: prompt, ...(neg ? { parameters: { negative_prompt: neg } } : {}) })],
  ['https://router.huggingface.co/fal-ai/fal-ai/flux/schnell',
    (prompt) => ({ prompt, num_inference_steps: 4, image_size: 'square_hd' })],
]
// Kept for /image?model=… overrides — falls back to the legacy URL pattern.
const HF_BASE = 'https://router.huggingface.co/hf-inference/models'
const MODELS = ['black-forest-labs/FLUX.1-schnell']
const ENHANCE_SUFFIX = ', high quality, realistic, 4k, detailed lighting, sharp focus'
const TIMEOUT_MS = 35_000
const TTL_MS = 60 * 60 * 1000 // 1h
const STORE = new Map() // id → { mime, bytes (Buffer), prompt, model, createdAt }

export function enhancePrompt(prompt) {
  const p = String(prompt || '').trim()
  if (!p) return ''
  // Avoid duplicating the suffix if the user already wrote it
  if (/4k|high quality|sharp focus/i.test(p)) return p
  return p + ENHANCE_SUFFIX
}

export async function generateImage({ prompt, model, negativePrompt } = {}) {
  const enhanced = enhancePrompt(prompt)
  if (!enhanced) throw new Error('prompt is required')

  gc()

  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  let lastErr = null

  // Build the candidate list:
  //  - If user passed `model`, try the legacy router URL first
  //  - Then fall through to the curated PROVIDERS list (FLUX.1-schnell etc.)
  const candidates = []
  if (model) {
    candidates.push([
      `${HF_BASE}/${model}`,
      (prompt, neg) => ({ inputs: prompt, ...(neg ? { parameters: { negative_prompt: neg } } : {}) }),
    ])
  }
  for (const p of PROVIDERS) candidates.push(p)

  for (const [endpoint, buildBody] of candidates) {
    try {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
      let r
      try {
        r = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            Accept: 'image/png',
          },
          body: JSON.stringify(buildBody(enhanced, negativePrompt)),
          signal: ac.signal,
        })
      } finally { clearTimeout(t) }

      const ct = r.headers.get('content-type') || ''
      if (!r.ok) {
        const body = ct.includes('json') ? await r.json().catch(() => ({})) : await r.text().catch(() => '')
        lastErr = new Error(`${endpoint}: ${r.status} ${typeof body === 'string' ? body.slice(0, 160) : (body.error || JSON.stringify(body).slice(0, 160))}`)
        continue
      }
      if (!ct.startsWith('image/')) {
        const text = await r.text().catch(() => '')
        lastErr = new Error(`${endpoint}: non-image response (${ct}) ${text.slice(0, 140)}`)
        continue
      }
      const buf = Buffer.from(await r.arrayBuffer())
      const id = newId()
      const modelLabel = endpoint.split('/').slice(-2).join('/')
      STORE.set(id, { mime: ct, bytes: buf, prompt: enhanced, model: modelLabel, createdAt: Date.now() })
      return {
        ok: true,
        id,
        url: `/api/dz-agent-v4/image/${id}`,
        promptUsed: enhanced,
        model: modelLabel,
        bytes: buf.length,
        provider: 'huggingface',
      }
    } catch (e) {
      lastErr = e
    }
  }

  // Fallback: deterministic SVG placeholder so the engine never returns empty.
  const svg = placeholderSvg(enhanced)
  const id = newId()
  STORE.set(id, {
    mime: 'image/svg+xml',
    bytes: Buffer.from(svg, 'utf8'),
    prompt: enhanced,
    model: 'placeholder/svg',
    createdAt: Date.now(),
  })
  return {
    ok: true,
    id,
    url: `/api/dz-agent-v4/image/${id}`,
    promptUsed: enhanced,
    model: 'placeholder/svg',
    bytes: svg.length,
    provider: 'fallback',
    note: lastErr ? `HF unavailable: ${lastErr.message}` : 'HF unavailable',
  }
}

export function getImage(id) {
  const it = STORE.get(id)
  return it || null
}

export function imageStats() {
  return {
    cached: STORE.size,
    totalBytes: Array.from(STORE.values()).reduce((a, x) => a + x.bytes.length, 0),
    hfTokenConfigured: !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY),
  }
}

function gc() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, x] of STORE) if (x.createdAt < cutoff) STORE.delete(id)
}

function newId() {
  return `img_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
}

function placeholderSvg(prompt) {
  const safe = String(prompt).slice(0, 120).replace(/[<&>]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]))
  // Hash the prompt → stable color
  const h = crypto.createHash('sha1').update(prompt).digest()
  const c1 = `#${h.slice(0,3).toString('hex')}`
  const c2 = `#${h.slice(3,6).toString('hex')}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <g font-family="system-ui, sans-serif" fill="rgba(255,255,255,0.92)" text-anchor="middle">
    <text x="512" y="500" font-size="36" font-weight="700">DZ Agent V4 — Image Placeholder</text>
    <text x="512" y="560" font-size="22" opacity="0.85">${safe}</text>
  </g>
</svg>`
}
