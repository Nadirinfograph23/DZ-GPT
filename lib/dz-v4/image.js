// DZ Agent V4 PRO — Image Generation Engine v2
// Providers (بالتوازي بدل التسلسل):
//   1. Pollinations.ai  — مجاني تماماً، سريع، لا token
//   2. HuggingFace FLUX — مجاني مع token اختياري
//   3. SVG placeholder  — لا يُعيد فارغاً أبداً
//
// img2img: Pollinations ?image_url= / HF InstructPix2Pix
// Contract: { ok, id, url, promptUsed, model, provider }

import crypto from 'node:crypto'
import { translateForImage } from './translate.js'

// ── إعدادات ────────────────────────────────────────────────────────────────
const ENHANCE_SUFFIX = ', high quality, detailed, 4k, sharp'
const TIMEOUT_HF     = 25_000  // كان 35s → 25s
const TIMEOUT_POL    = 22_000  // كان 40s → 22s
const TIMEOUT_I2I    = 30_000
const TTL_MS         = 60 * 60 * 1000
const STORE          = new Map() // id → { mime, bytes, prompt, model, createdAt, type }

// ── Pollinations models المتاحة ─────────────────────────────────────────────
export const POLLINATIONS_MODELS = [
  { id: 'flux',          label: 'Flux (أفضل جودة)',   default: true },
  { id: 'turbo',         label: 'Turbo (أسرع)',       default: false },
  { id: 'flux-realism',  label: 'Flux Realism',       default: false },
  { id: 'flux-anime',    label: 'Anime',              default: false },
  { id: 'flux-3d',       label: '3D',                 default: false },
  { id: 'flux-cablyai',  label: 'CablyAI',            default: false },
]

// ── HuggingFace providers ───────────────────────────────────────────────────
const HF_PROVIDERS = [
  ['https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
    (p, neg) => ({ inputs: p, ...(neg ? { parameters: { negative_prompt: neg } } : {}) })],
  ['https://router.huggingface.co/fal-ai/fal-ai/flux/schnell',
    (p) => ({ prompt: p, num_inference_steps: 4, image_size: 'square_hd' })],
]

// ── Helpers ─────────────────────────────────────────────────────────────────
export function enhancePrompt(p) {
  const s = String(p || '').trim()
  if (!s) return ''
  if (/4k|high quality|sharp focus/i.test(s)) return s
  return s + ENHANCE_SUFFIX
}

function newId() {
  return `img_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
}

function gc() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, x] of STORE) if (x.createdAt < cutoff) STORE.delete(id)
}

function storeAndReturn(buf, mime, enhanced, model, provider, tr) {
  const id = newId()
  STORE.set(id, { mime, bytes: buf, prompt: enhanced, model, createdAt: Date.now(), type: 'image' })
  return {
    ok: true, id,
    url: `/api/dz-agent-v4/image/${id}`,
    promptUsed: enhanced,
    originalPrompt: tr?.original || enhanced,
    translated: tr?.translated || false,
    sourceLanguage: tr?.language || 'en',
    model, bytes: buf.length, provider,
  }
}

// ── مزود Pollinations (GET مباشر، موثوق، مجاني) ───────────────────────────
async function tryPollinations(enhanced, model = 'flux', width = 768, height = 768) {
  const seed  = Math.floor(Math.random() * 999_999)
  const url   = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced)}`
        + `?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false`
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_POL)
  try {
    const r  = await fetch(url, { signal: ac.signal, redirect: 'follow' })
    const ct = r.headers.get('content-type') || ''
    if (r.ok && ct.startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 1000) return { buf, mime: ct, model: `pollinations/${model}`, provider: 'pollinations' }
    }
  } finally { clearTimeout(timer) }
  return null
}

// ── مزود HuggingFace ────────────────────────────────────────────────────────
async function tryHuggingFace(enhanced, negativePrompt) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  for (const [endpoint, buildBody] of HF_PROVIDERS) {
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT_HF)
    try {
      const r = await fetch(endpoint, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'image/png',
        },
        body:   JSON.stringify(buildBody(enhanced, negativePrompt)),
        signal: ac.signal,
      })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && ct.startsWith('image/')) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 1000) {
          return { buf, mime: ct, model: endpoint.split('/').slice(-2).join('/'), provider: 'huggingface' }
        }
      }
    } catch { /* continue */ } finally { clearTimeout(timer) }
  }
  return null
}

// ── توليد الصورة (text-to-image) — الدالة الرئيسية ─────────────────────────
export async function generateImage({ prompt, model, negativePrompt, aiGenerate, width, height } = {}) {
  const tr       = await translateForImage({ aiGenerate, prompt })
  const enhanced = enhancePrompt(tr.english)
  if (!enhanced) throw new Error('prompt مطلوب')
  gc()

  const polModel = POLLINATIONS_MODELS.find(m => m.id === model)?.id || 'flux'
  const w = width  || 768
  const h = height || 768

  // ── Race: Pollinations و HuggingFace بالتوازي ───────────────────────────
  try {
    const winner = await Promise.any([
      tryPollinations(enhanced, polModel, w, h).then(r => { if (!r) throw new Error('pol-empty'); return r }),
      tryHuggingFace(enhanced, negativePrompt).then(r => { if (!r) throw new Error('hf-empty');  return r }),
    ])
    return storeAndReturn(winner.buf, winner.mime, enhanced, winner.model, winner.provider, tr)
  } catch {
    // Promise.any throws AggregateError if ALL fail → fallback below
  }

  // ── Fallback: إعادة محاولة Pollinations بنموذج مختلف ───────────────────
  const fallbackPol = await tryPollinations(enhanced, 'turbo', w, h)
  if (fallbackPol) return storeAndReturn(fallbackPol.buf, fallbackPol.mime, enhanced, 'pollinations/turbo', 'pollinations', tr)

  // ── Last resort: SVG placeholder (لا يُعيد فارغاً أبداً) ─────────────────
  const svg = placeholderSvg(enhanced)
  const id  = newId()
  STORE.set(id, { mime: 'image/svg+xml', bytes: Buffer.from(svg, 'utf8'), prompt: enhanced, model: 'placeholder/svg', createdAt: Date.now(), type: 'image' })
  return {
    ok: true, id, url: `/api/dz-agent-v4/image/${id}`,
    promptUsed: enhanced, originalPrompt: tr.original,
    translated: tr.translated, sourceLanguage: tr.language,
    model: 'placeholder/svg', bytes: svg.length, provider: 'fallback',
  }
}

// ── صورة إلى صورة (img2img) ────────────────────────────────────────────────
export async function imageToImage({ prompt, imageUrl, imageBase64, strength = 0.75, aiGenerate } = {}) {
  if (!prompt) throw new Error('prompt مطلوب')

  const tr       = await translateForImage({ aiGenerate, prompt })
  const enhanced = enhancePrompt(tr.english)
  gc()

  // 1. Pollinations img2img (يدعم image_url parameter)
  if (imageUrl) {
    try {
      const seed  = Math.floor(Math.random() * 999_999)
      const url   = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced)}`
            + `?model=turbo&image_url=${encodeURIComponent(imageUrl)}&seed=${seed}&nologo=true`
      const ac    = new AbortController()
      const timer = setTimeout(() => ac.abort(), TIMEOUT_I2I)
      try {
        const r  = await fetch(url, { signal: ac.signal, redirect: 'follow' })
        const ct = r.headers.get('content-type') || ''
        if (r.ok && ct.startsWith('image/')) {
          const buf = Buffer.from(await r.arrayBuffer())
          if (buf.length > 1000) return storeAndReturn(buf, ct, enhanced, 'pollinations/turbo-i2i', 'pollinations-i2i', tr)
        }
      } finally { clearTimeout(timer) }
    } catch {}
  }

  // 2. HuggingFace InstructPix2Pix (يدعم image + text instruction)
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  if (token && (imageBase64 || imageUrl)) {
    try {
      let imgData = imageBase64
      if (!imgData && imageUrl) {
        // نحمّل الصورة الأصلية كـ base64
        const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) })
        if (imgRes.ok) {
          const buf  = Buffer.from(await imgRes.arrayBuffer())
          imgData = buf.toString('base64')
        }
      }
      if (imgData) {
        const ac    = new AbortController()
        const timer = setTimeout(() => ac.abort(), TIMEOUT_I2I)
        try {
          const r = await fetch('https://router.huggingface.co/hf-inference/models/timbrooks/instruct-pix2pix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'image/png' },
            body: JSON.stringify({ inputs: imgData, parameters: { prompt: enhanced, image_guidance_scale: strength } }),
            signal: ac.signal,
          })
          const ct = r.headers.get('content-type') || ''
          if (r.ok && ct.startsWith('image/')) {
            const buf = Buffer.from(await r.arrayBuffer())
            if (buf.length > 1000) return storeAndReturn(buf, ct, enhanced, 'hf/instruct-pix2pix', 'huggingface-i2i', tr)
          }
        } finally { clearTimeout(timer) }
      }
    } catch {}
  }

  // 3. Fallback: توليد صورة جديدة بالـ prompt فقط
  return generateImage({ prompt, aiGenerate })
}

// ── قراءة الصورة من الـ store ───────────────────────────────────────────────
export function getImage(id) { return STORE.get(id) || null }

export function imageStats() {
  return {
    cached: STORE.size,
    totalBytes: Array.from(STORE.values()).reduce((a, x) => a + x.bytes.length, 0),
    hfTokenConfigured: !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY),
    pollinationsModels: POLLINATIONS_MODELS.map(m => m.id),
  }
}

// ── SVG placeholder ─────────────────────────────────────────────────────────
function placeholderSvg(prompt) {
  const safe = String(prompt).slice(0, 120).replace(/[<&>"']/g, c =>
    ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]))
  const h  = crypto.createHash('sha1').update(prompt).digest()
  const c1 = `#${h.slice(0,3).toString('hex')}`
  const c2 = `#${h.slice(3,6).toString('hex')}`
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 768" width="768" height="768">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="768" height="768" fill="url(#g)"/>
  <rect x="284" y="284" width="200" height="200" rx="24" fill="rgba(255,255,255,0.12)"/>
  <g font-family="system-ui,sans-serif" fill="rgba(255,255,255,0.88)" text-anchor="middle">
    <text x="384" y="360" font-size="42">🎨</text>
    <text x="384" y="420" font-size="18" font-weight="700">DZ Agent — Image</text>
    <text x="384" y="452" font-size="13" opacity="0.75">${safe.slice(0,60)}</text>
  </g>
</svg>`
}
