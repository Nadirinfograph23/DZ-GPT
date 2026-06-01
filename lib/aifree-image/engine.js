/**
 * lib/aifree-image/engine.js
 * Pure JS image generation engine — no Python subprocess needed.
 *
 * Providers (in priority order):
 *   1. HuggingFace Inference API  (works from Vercel, needs HF_TOKEN)
 *   2. Pollinations AI             (free, no key, always available)
 *
 * All models below are VERIFIED to exist on HuggingFace (200 + pipeline=text-to-image).
 * Pollinations models are included as fast/free options (same underlying engine).
 */

const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''

// ── Model routing table ───────────────────────────────────────────────────────
// Verified 2026-06-01: HF models confirmed via /api/models endpoint (HTTP 200 + pipeline=text-to-image)
// Removed: nano-banana-pro (doesn't exist), seedream (404 on HF), gptimage (not a real distinct model)
export const MODELS = [
  // ── Pollinations (fast, free, no key needed) ──────────────────────────────
  { id: 'flux',            label: '⚡ FLUX',              badge: 'FAST',  provider: 'pollinations', pollinationsModel: 'flux' },
  { id: 'turbo',           label: '🚀 Turbo',             badge: 'FAST',  provider: 'pollinations', pollinationsModel: 'turbo' },
  { id: 'flux-realism',    label: '📸 FLUX Realism',      badge: 'REAL',  provider: 'pollinations', pollinationsModel: 'flux-realism' },
  { id: 'flux-anime',      label: '🌸 FLUX Anime',        badge: '',      provider: 'pollinations', pollinationsModel: 'flux-anime' },

  // ── HuggingFace Inference — VERIFIED models (HF_TOKEN required) ───────────
  { id: 'flux-schnell',    label: '⚡ FLUX Schnell',       badge: 'HF',    provider: 'hf', hfModel: 'black-forest-labs/FLUX.1-schnell',                 pollinationsModel: 'flux' },
  { id: 'flux-dev',        label: '🎯 FLUX Dev',           badge: 'HD',    provider: 'hf', hfModel: 'black-forest-labs/FLUX.1-dev',                     pollinationsModel: 'flux-realism' },
  { id: 'sd35-large',      label: '🖼️ SD 3.5 Large',      badge: 'HD',    provider: 'hf', hfModel: 'stabilityai/stable-diffusion-3.5-large',           pollinationsModel: 'turbo' },
  { id: 'sd35-medium',     label: '🖼️ SD 3.5 Medium',     badge: '',      provider: 'hf', hfModel: 'stabilityai/stable-diffusion-3.5-medium',          pollinationsModel: 'turbo' },
  { id: 'sdxl-lightning',  label: '⚡ SDXL Lightning',    badge: '',      provider: 'hf', hfModel: 'ByteDance/SDXL-Lightning',                         pollinationsModel: 'turbo' },
  { id: 'playground',      label: '🎮 Playground 2.5',    badge: '',      provider: 'hf', hfModel: 'playgroundai/playground-v2.5-1024px-aesthetic',     pollinationsModel: 'flux' },
  { id: 'juggernaut',      label: '💪 Juggernaut XL',     badge: '',      provider: 'hf', hfModel: 'RunDiffusion/Juggernaut-XL-v9',                    pollinationsModel: 'flux-realism' },
  { id: 'realvisxl',       label: '📷 RealVis XL',        badge: 'REAL',  provider: 'hf', hfModel: 'SG161222/RealVisXL_V4.0',                          pollinationsModel: 'flux-realism' },
  { id: 'sana',            label: '✨ SANA 1.6B',          badge: 'NEW',   provider: 'hf', hfModel: 'Efficient-Large-Model/Sana_1600M_1024px_diffusers', pollinationsModel: 'flux' },
]

const MODEL_MAP = Object.fromEntries(MODELS.map(m => [m.id, m]))

// ── HuggingFace Inference API ─────────────────────────────────────────────────
async function generateHF(hfModel, prompt, width, height, steps) {
  if (!HF_TOKEN) throw new Error('HF_TOKEN not set')

  const payload = {
    inputs: prompt,
    parameters: { width, height, num_inference_steps: steps, guidance_scale: 7.5 },
  }

  const r = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${HF_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
    signal:  AbortSignal.timeout(90_000),
  })

  if (!r.ok) {
    const err = await r.text().catch(() => r.status)
    throw new Error(`HF ${r.status}: ${String(err).slice(0, 200)}`)
  }

  const ct  = r.headers.get('content-type') || ''
  const buf = await r.arrayBuffer()

  if (ct.includes('image/')) {
    const b64  = Buffer.from(buf).toString('base64')
    const mime = ct.split(';')[0].trim()
    return { imageBase64: b64, mime, endpoint: `hf:${hfModel}` }
  }

  // JSON response
  const text = Buffer.from(buf).toString('utf-8')
  const data = JSON.parse(text)
  const url  = data.url || data.image_url || data.imageUrl || (Array.isArray(data) && data[0]?.url)
  if (url) return { imageUrl: url, endpoint: `hf:${hfModel}` }
  const b64 = data.base64 || data.imageBase64
  if (b64) return { imageBase64: b64, mime: 'image/png', endpoint: `hf:${hfModel}` }

  throw new Error(`HF: unexpected response: ${text.slice(0, 200)}`)
}

// ── Pollinations AI ───────────────────────────────────────────────────────────
async function generatePollinations(pollinationsModel, prompt, width, height) {
  const seed = Math.floor(Math.random() * 999999)
  const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
    + `?model=${pollinationsModel}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false`

  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(`Pollinations ${r.status}`)
  return { imageUrl: url, endpoint: `pollinations:${pollinationsModel}` }
}

// ── Main generate function ────────────────────────────────────────────────────
export async function generateImage(prompt, {
  model  = 'flux',
  width  = 768,
  height = 768,
  steps  = 25,
} = {}) {
  const meta = MODEL_MAP[model] || MODEL_MAP['flux']

  // HF models: try HF first, fall back to Pollinations
  if (meta.provider === 'hf' && meta.hfModel) {
    if (HF_TOKEN) {
      try {
        const result = await generateHF(meta.hfModel, prompt, width, height, steps)
        return { ok: true, ...result, model: meta.id, label: meta.label, provider: 'HuggingFace' }
      } catch (e) {
        console.warn(`[img-engine] HF failed for ${meta.hfModel}: ${e.message} — falling back to Pollinations`)
      }
    }
    // Fallback: Pollinations
    const pModel = meta.pollinationsModel || 'flux'
    const result  = await generatePollinations(pModel, prompt, width, height)
    return { ok: true, ...result, model: meta.id, label: meta.label, provider: 'Pollinations AI (fallback)' }
  }

  // Pollinations-native models
  const pModel = meta.pollinationsModel || 'flux'
  const result  = await generatePollinations(pModel, prompt, width, height)
  return { ok: true, ...result, model: meta.id, label: meta.label, provider: 'Pollinations AI' }
}

// ── Get models list ───────────────────────────────────────────────────────────
export function getModels() {
  return MODELS.map(({ id, label, badge, provider }) => ({ id, label, badge, provider }))
}
