// DZ Agent V4 PRO — Image Generation Engine v3
// Providers (بالتدوير الآلي):
//   1. Pollinations.ai (flux/turbo/realism/anime/3d) — مجاني، بلا token
//   2. HuggingFace FLUX.1-schnell                   — مجاني مع token اختياري
//   3. HuggingFace fal-ai/flux-schnell               — مجاني
//   4. HuggingFace FLUX.1-dev                        — احتياطي
//   5. SVG placeholder                               — لا يُعيد فارغاً أبداً
//
// img2img: HF InstructPix2Pix + Pollinations reference + SVG fallback
// Contract: { ok, id, url, promptUsed, model, provider }

import crypto from 'node:crypto'
import { translateForImage } from './translate.js'

const ENHANCE_SUFFIX = ', high quality, detailed, 4k, sharp focus'
const TIMEOUT_HF     = 30_000
const TIMEOUT_POL    = 25_000
const TIMEOUT_I2I    = 35_000
const TTL_MS         = 60 * 60 * 1000
const STORE          = new Map()

// ── Pollinations models ──────────────────────────────────────────────────────
export const POLLINATIONS_MODELS = [
  { id: 'flux',          label: 'Flux (أفضل جودة)',  default: true  },
  { id: 'turbo',         label: 'Turbo (أسرع)',      default: false },
  { id: 'flux-realism',  label: 'Flux Realism',      default: false },
  { id: 'flux-anime',    label: 'Anime',             default: false },
  { id: 'flux-3d',       label: '3D',                default: false },
  { id: 'flux-cablyai',  label: 'CablyAI',           default: false },
  { id: 'konyconi',      label: 'KonyConi',          default: false },
  { id: 'gptimage',      label: 'GPT Image',         default: false },
]

// نماذج التدوير للمحاولات الاحتياطية
const POL_FALLBACK_ORDER = ['turbo', 'flux-realism', 'flux', 'flux-anime', 'flux-3d']

// ── HuggingFace text-to-image providers (بالترتيب) ──────────────────────────
const HF_T2I_PROVIDERS = [
  {
    url:  'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
    body: (p, neg) => ({ inputs: p, ...(neg ? { parameters: { negative_prompt: neg } } : {}) }),
  },
  {
    url:  'https://router.huggingface.co/fal-ai/fal-ai/flux/schnell',
    body: (p) => ({ prompt: p, num_inference_steps: 4, image_size: 'square_hd' }),
  },
  {
    url:  'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-dev',
    body: (p, neg) => ({ inputs: p, parameters: { guidance_scale: 3.5, num_inference_steps: 20, ...(neg ? { negative_prompt: neg } : {}) } }),
  },
  {
    url:  'https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-3.5-medium',
    body: (p) => ({ inputs: p }),
  },
]

// ── HuggingFace img2img providers ───────────────────────────────────────────
const HF_I2I_PROVIDERS = [
  {
    url:   'https://router.huggingface.co/hf-inference/models/timbrooks/instruct-pix2pix',
    build: (b64, prompt) => ({
      inputs:     b64,
      parameters: { prompt, image_guidance_scale: 1.5, guidance_scale: 7.5, num_inference_steps: 25 },
    }),
  },
  {
    url:   'https://router.huggingface.co/hf-inference/models/diffusers/sdxl-turbo',
    build: (b64, prompt) => ({
      inputs:     b64,
      parameters: { prompt, num_inference_steps: 4, strength: 0.5 },
    }),
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Pollinations (GET + cache-bust) ──────────────────────────────────────────
async function tryPollinations(enhanced, model = 'flux', width = 768, height = 768, attempt = 0) {
  // seed مختلف دائماً + nonce لمنع الكاش على مستوى CDN
  const seed  = Math.floor(Math.random() * 9_000_000) + (attempt * 7919)
  const nonce = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`
  const url   = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced)}`
        + `?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false&_n=${nonce}`
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_POL)
  try {
    const r  = await fetch(url, { signal: ac.signal, redirect: 'follow' })
    const ct = r.headers.get('content-type') || ''
    if (r.ok && ct.startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 2000) return { buf, mime: ct, model: `pollinations/${model}`, provider: 'pollinations' }
    }
  } catch {}
  finally { clearTimeout(timer) }
  return null
}

// ── HuggingFace text-to-image ────────────────────────────────────────────────
async function tryHuggingFace(enhanced, negativePrompt) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  for (const prov of HF_T2I_PROVIDERS) {
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT_HF)
    try {
      const r = await fetch(prov.url, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'image/png',
        },
        body:   JSON.stringify(prov.body(enhanced, negativePrompt)),
        signal: ac.signal,
      })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && ct.startsWith('image/')) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 2000) {
          return { buf, mime: ct, model: prov.url.split('/').slice(-2).join('/'), provider: 'huggingface' }
        }
      }
    } catch {}
    finally { clearTimeout(timer) }
  }
  return null
}

// ── توليد الصورة (text-to-image) — الدالة الرئيسية ──────────────────────────
export async function generateImage({ prompt, model, negativePrompt, aiGenerate, width, height } = {}) {
  const tr       = await translateForImage({ aiGenerate, prompt })
  const enhanced = enhancePrompt(tr.english)
  if (!enhanced) throw new Error('prompt مطلوب')
  gc()

  const polModel = POLLINATIONS_MODELS.find(m => m.id === model)?.id || 'flux'
  const w = width  || 768
  const h = height || 768

  // ── محاولة 1: Pollinations و HuggingFace بالتوازي ───────────────────────
  try {
    const winner = await Promise.any([
      tryPollinations(enhanced, polModel, w, h, 0).then(r => { if (!r) throw new Error('pol-empty'); return r }),
      tryHuggingFace(enhanced, negativePrompt).then(r => { if (!r) throw new Error('hf-empty'); return r }),
    ])
    return storeAndReturn(winner.buf, winner.mime, enhanced, winner.model, winner.provider, tr)
  } catch {}

  // ── محاولة 2: تدوير Pollinations بنماذج مختلفة ──────────────────────────
  for (let i = 0; i < POL_FALLBACK_ORDER.length; i++) {
    const alt = POL_FALLBACK_ORDER[i]
    if (alt === polModel && i === 0) continue   // لا تكرر نفس النموذج
    const r = await tryPollinations(enhanced, alt, w, h, i + 1)
    if (r) return storeAndReturn(r.buf, r.mime, enhanced, r.model, r.provider, tr)
  }

  // ── محاولة 3: Pollinations مع حجم مختلف ─────────────────────────────────
  const r3 = await tryPollinations(enhanced, 'turbo', 512, 512, 99)
  if (r3) return storeAndReturn(r3.buf, r3.mime, enhanced, r3.model, r3.provider, tr)

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

// ── صورة إلى صورة (img2img) ─────────────────────────────────────────────────
export async function imageToImage({ prompt, imageUrl, imageBase64, strength = 0.75, aiGenerate } = {}) {
  if (!prompt) throw new Error('prompt مطلوب')

  const tr       = await translateForImage({ aiGenerate, prompt })
  const enhanced = enhancePrompt(tr.english)
  gc()

  // ── استخراج base64 من STORE عند URL محلي ─────────────────────────────────
  let imgData = imageBase64 || null

  if (!imgData && imageUrl) {
    // URL محلي من STORE (مثل /api/dz-agent-v4/image/img_xxx)
    if (imageUrl.startsWith('/api/dz-agent-v4/image/')) {
      const id     = imageUrl.split('/').pop()
      const stored = STORE.get(id)
      if (stored?.bytes) {
        imgData = stored.bytes.toString('base64')
      }
    }
    // URL خارجي — نحمّله مباشرة
    else if (imageUrl.startsWith('http')) {
      try {
        const res = await fetch(imageUrl, { signal: AbortSignal.timeout(12_000) })
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer())
          imgData = buf.toString('base64')
        }
      } catch {}
    }
    // data URL
    else if (imageUrl.startsWith('data:')) {
      imgData = imageUrl.split(',')[1] || null
    }
  }

  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''

  // ── 1. HuggingFace img2img (الأفضل عند توفر base64) ─────────────────────
  if (imgData && token) {
    for (const prov of HF_I2I_PROVIDERS) {
      const ac    = new AbortController()
      const timer = setTimeout(() => ac.abort(), TIMEOUT_I2I)
      try {
        const r = await fetch(prov.url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'image/png' },
          body:    JSON.stringify(prov.build(imgData, enhanced)),
          signal:  ac.signal,
        })
        const ct = r.headers.get('content-type') || ''
        if (r.ok && ct.startsWith('image/')) {
          const buf = Buffer.from(await r.arrayBuffer())
          if (buf.length > 2000) return storeAndReturn(buf, ct, enhanced, prov.url.split('/').slice(-2).join('/'), 'huggingface-i2i', tr)
        }
      } catch {}
      finally { clearTimeout(timer) }
    }
  }

  // ── 2. Pollinations img2img (يحتاج URL عام) ──────────────────────────────
  // إذا كان عندنا base64 → ارسل لـ Pollinations عبر prompt غني فقط
  // إذا كان URL عام → مرره مباشرة
  if (imageUrl && imageUrl.startsWith('http')) {
    try {
      const seed  = Math.floor(Math.random() * 9_000_000)
      const url   = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhanced)}`
            + `?model=turbo&image_url=${encodeURIComponent(imageUrl)}&seed=${seed}&nologo=true&strength=${strength}`
      const ac    = new AbortController()
      const timer = setTimeout(() => ac.abort(), TIMEOUT_I2I)
      try {
        const r  = await fetch(url, { signal: ac.signal, redirect: 'follow' })
        const ct = r.headers.get('content-type') || ''
        if (r.ok && ct.startsWith('image/')) {
          const buf = Buffer.from(await r.arrayBuffer())
          if (buf.length > 2000) return storeAndReturn(buf, ct, enhanced, 'pollinations/turbo-i2i', 'pollinations-i2i', tr)
        }
      } finally { clearTimeout(timer) }
    } catch {}
  }

  // ── 3. Fallback: توليد صورة جديدة بالـ prompt فقط ───────────────────────
  return generateImage({ prompt, aiGenerate })
}

// ── قراءة / إحصائيات ────────────────────────────────────────────────────────
export function getImage(id) { return STORE.get(id) || null }

export function imageStats() {
  return {
    cached:               STORE.size,
    totalBytes:           Array.from(STORE.values()).reduce((a, x) => a + x.bytes.length, 0),
    hfTokenConfigured:    !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY),
    pollinationsModels:   POLLINATIONS_MODELS.map(m => m.id),
    hfT2IProviders:       HF_T2I_PROVIDERS.length,
    hfI2IProviders:       HF_I2I_PROVIDERS.length,
  }
}

// ── SVG placeholder ──────────────────────────────────────────────────────────
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
