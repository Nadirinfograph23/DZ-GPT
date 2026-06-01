// DZ Agent V4 PRO — Image Generation Engine v4
// ── مزودون بالترتيب:
//   1. OpenRouter  (GPT Image 2, Gemini Flash Image, Gemini Pro Image) — يحتاج OPENROUTER_API_KEY
//   2. HuggingFace Router (FLUX.1-schnell, FLUX.1-dev, SD 3.5)        — يحتاج HF_TOKEN
//   3. Pollinations AI    (flux, turbo, realism, anime, 3d)            — مجاني دائماً
//   4. SVG placeholder                                                  — لا يُعيد فارغاً أبداً
// ── img2img: HF InstructPix2Pix + Pollinations reference
// ── نظام الحصص: 30 سريع / 10 مميز يومياً لكل IP

import crypto from 'node:crypto'
import { translateForImage } from './translate.js'

const ENHANCE_SUFFIX = ', high quality, detailed, 4k, sharp focus'
const TIMEOUT_OR     = 60_000   // OpenRouter
const TIMEOUT_HF     = 40_000   // HuggingFace
const TIMEOUT_POL    = 25_000   // Pollinations
const TIMEOUT_I2I    = 45_000   // img2img
const TTL_MS         = 60 * 60 * 1000
const STORE          = new Map()

// ── Quota system ──────────────────────────────────────────────────────────────
const QUOTA_FAST    = 30   // Pollinations + HF (يومي)
const QUOTA_PREMIUM = 10   // OpenRouter (يومي)
const RATE_STORE    = new Map()

function getRateEntry(ip) {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  let e = RATE_STORE.get(ip)
  if (!e || now >= e.resetAt) {
    e = { fast: 0, premium: 0, resetAt: now + day }
    RATE_STORE.set(ip, e)
  }
  return e
}

export function checkImageQuota(ip = 'anonymous') {
  const e = getRateEntry(ip)
  return {
    fast:         { remaining: Math.max(0, QUOTA_FAST - e.fast),       used: e.fast,    limit: QUOTA_FAST    },
    premium:      { remaining: Math.max(0, QUOTA_PREMIUM - e.premium), used: e.premium, limit: QUOTA_PREMIUM },
    resetInHours: Math.ceil((e.resetAt - Date.now()) / 3_600_000),
  }
}

function consumeQuota(ip, tier = 'fast') {
  const e = getRateEntry(ip)
  if (tier === 'premium') {
    if (e.premium >= QUOTA_PREMIUM) return false
    e.premium++
  } else {
    if (e.fast >= QUOTA_FAST) return false
    e.fast++
  }
  RATE_STORE.set(ip, e)
  return true
}

// ── النماذج المتاحة ───────────────────────────────────────────────────────────
export const IMAGE_MODELS = [
  // ── OpenRouter Premium ────────────────────────────────────────────────────
  { id: 'gemini-flash-image', label: '⚡ Gemini Flash Image', badge: 'NEW',   tier: 'premium', provider: 'openrouter', orModel: 'google/gemini-2.5-flash-image',    group: 'Google' },
  { id: 'gemini-pro-image',   label: '🌟 Gemini Pro Image',  badge: 'PRO',   tier: 'premium', provider: 'openrouter', orModel: 'google/gemini-3-pro-image-preview', group: 'Google' },
  { id: 'gpt-image-2',        label: '🤖 GPT Image 2.0',     badge: 'GPT2',  tier: 'premium', provider: 'openrouter', orModel: 'openai/gpt-5.4-image-2',           group: 'OpenAI' },
  { id: 'gpt-image-mini',     label: '🤖 GPT Image Mini',    badge: 'GPT',   tier: 'premium', provider: 'openrouter', orModel: 'openai/gpt-5-image-mini',          group: 'OpenAI' },
  // ── HuggingFace (مجاني مع HF_TOKEN) ──────────────────────────────────────
  { id: 'flux-schnell',       label: '⚡ FLUX Schnell',       badge: 'HF',    tier: 'fast',    provider: 'hf', hfUrl: 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', group: 'HuggingFace' },
  { id: 'flux-dev',           label: '🎯 FLUX Dev',           badge: 'HD',    tier: 'fast',    provider: 'hf', hfUrl: 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-dev',     group: 'HuggingFace' },
  { id: 'sd35-large',         label: '🖼️ SD 3.5 Large',      badge: 'HD',    tier: 'fast',    provider: 'hf', hfUrl: 'https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-3.5-large', group: 'HuggingFace' },
  { id: 'sd35-medium',        label: '🖼️ SD 3.5 Medium',     badge: '',      tier: 'fast',    provider: 'hf', hfUrl: 'https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-3.5-medium', group: 'HuggingFace' },
  { id: 'sdxl-lightning',     label: '⚡ SDXL Lightning',     badge: '',      tier: 'fast',    provider: 'hf', hfUrl: 'https://router.huggingface.co/hf-inference/models/ByteDance/SDXL-Lightning',              group: 'HuggingFace' },
  { id: 'juggernaut',         label: '💪 Juggernaut XL',      badge: '',      tier: 'fast',    provider: 'hf', hfUrl: 'https://router.huggingface.co/hf-inference/models/RunDiffusion/Juggernaut-XL-v9',          group: 'HuggingFace' },
  { id: 'realvisxl',          label: '📷 RealVis XL',         badge: 'REAL',  tier: 'fast',    provider: 'hf', hfUrl: 'https://router.huggingface.co/hf-inference/models/SG161222/RealVisXL_V4.0',               group: 'HuggingFace' },
  { id: 'playground',         label: '🎮 Playground 2.5',     badge: '',      tier: 'fast',    provider: 'hf', hfUrl: 'https://router.huggingface.co/hf-inference/models/playgroundai/playground-v2.5-1024px-aesthetic', group: 'HuggingFace' },
  // ── Pollinations (مجاني بدون token) ──────────────────────────────────────
  { id: 'flux',               label: '⚡ FLUX',               badge: 'FAST',  tier: 'fast',    provider: 'pollinations', polModel: 'flux',         group: 'Pollinations' },
  { id: 'turbo',              label: '🚀 Turbo',              badge: 'FAST',  tier: 'fast',    provider: 'pollinations', polModel: 'turbo',        group: 'Pollinations' },
  { id: 'flux-realism',       label: '📸 FLUX Realism',       badge: 'REAL',  tier: 'fast',    provider: 'pollinations', polModel: 'flux-realism', group: 'Pollinations' },
  { id: 'flux-anime',         label: '🌸 FLUX Anime',         badge: '',      tier: 'fast',    provider: 'pollinations', polModel: 'flux-anime',   group: 'Pollinations' },
  { id: 'flux-3d',            label: '🧊 FLUX 3D',            badge: '',      tier: 'fast',    provider: 'pollinations', polModel: 'flux-3d',      group: 'Pollinations' },
]

// For backward compat
export const POLLINATIONS_MODELS = IMAGE_MODELS
  .filter(m => m.provider === 'pollinations')
  .map(m => ({ id: m.polModel, label: m.label, default: m.polModel === 'flux' }))

const MODEL_MAP = Object.fromEntries(IMAGE_MODELS.map(m => [m.id, m]))

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── OpenRouter Image Generation ───────────────────────────────────────────────
async function tryOpenRouter(prompt, orModel, width, height) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY غير متوفر')

  // For OpenAI image models — use /v1/images/generations (DALL-E compatible)
  if (orModel.startsWith('openai/')) {
    const size = width === height ? '1024x1024'
               : width > height  ? '1792x1024'
               : '1024x1792'
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT_OR)
    try {
      const r = await fetch('https://openrouter.ai/api/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://dz-gpt.vercel.app',
          'X-Title': 'DZ GPT Media Studio',
        },
        body: JSON.stringify({ model: orModel, prompt, n: 1, size, response_format: 'b64_json' }),
        signal: ac.signal,
      })
      if (!r.ok) {
        const err = await r.text().catch(() => r.status)
        throw new Error(`OpenRouter/${orModel}: ${r.status} — ${String(err).slice(0, 200)}`)
      }
      const data = await r.json()
      const b64  = data?.data?.[0]?.b64_json || data?.data?.[0]?.url
      if (!b64) throw new Error('OpenRouter: لا توجد صورة في الرد')
      if (b64.startsWith('http')) {
        // URL — fetch it
        const imgR = await fetch(b64, { signal: AbortSignal.timeout(20_000) })
        if (!imgR.ok) throw new Error(`OpenRouter: fetch image URL failed`)
        const buf = Buffer.from(await imgR.arrayBuffer())
        if (buf.length < 2000) throw new Error('OpenRouter: صورة فارغة')
        return { buf, mime: 'image/png', model: orModel, provider: 'OpenRouter/OpenAI' }
      }
      const buf = Buffer.from(b64, 'base64')
      if (buf.length < 2000) throw new Error('OpenRouter: صورة فارغة')
      return { buf, mime: 'image/png', model: orModel, provider: 'OpenRouter/OpenAI' }
    } finally { clearTimeout(timer) }
  }

  // For Google Gemini image models — use /v1/chat/completions
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_OR)
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dz-gpt.vercel.app',
        'X-Title': 'DZ GPT Media Studio',
      },
      body: JSON.stringify({
        model: orModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
      }),
      signal: ac.signal,
    })
    if (!r.ok) {
      const err = await r.text().catch(() => r.status)
      throw new Error(`OpenRouter/${orModel}: ${r.status} — ${String(err).slice(0, 200)}`)
    }
    const data = await r.json()
    const content = data?.choices?.[0]?.message?.content

    // Content may be an array of parts or a string
    const parts = Array.isArray(content) ? content : [{ type: 'text', text: content }]
    for (const part of parts) {
      // image_url part
      if (part?.type === 'image_url') {
        const imgUrl = part.image_url?.url || part.image_url
        if (imgUrl?.startsWith('data:')) {
          const [header, b64] = imgUrl.split(',')
          const mime = header.split(':')[1].split(';')[0]
          const buf  = Buffer.from(b64, 'base64')
          if (buf.length > 2000) return { buf, mime, model: orModel, provider: 'OpenRouter/Gemini' }
        }
        if (imgUrl?.startsWith('http')) {
          const imgR = await fetch(imgUrl, { signal: AbortSignal.timeout(20_000) })
          if (imgR.ok) {
            const buf = Buffer.from(await imgR.arrayBuffer())
            if (buf.length > 2000) return { buf, mime: 'image/png', model: orModel, provider: 'OpenRouter/Gemini' }
          }
        }
      }
      // inline_data part (Gemini style)
      if (part?.inline_data?.data) {
        const buf = Buffer.from(part.inline_data.data, 'base64')
        if (buf.length > 2000) return { buf, mime: part.inline_data.mime_type || 'image/png', model: orModel, provider: 'OpenRouter/Gemini' }
      }
    }
    throw new Error(`OpenRouter/${orModel}: لم يتم إرجاع صورة في الرد`)
  } finally { clearTimeout(timer) }
}

// ── HuggingFace text-to-image ─────────────────────────────────────────────────
async function tryHuggingFace(hfUrl, prompt) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_HF)
  try {
    const r = await fetch(hfUrl, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'image/png',
      },
      body:   JSON.stringify({ inputs: prompt }),
      signal: ac.signal,
    })
    const ct = r.headers.get('content-type') || ''
    if (r.ok && ct.startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 2000) {
        const modelName = hfUrl.split('/models/')[1] || hfUrl.split('/').slice(-2).join('/')
        return { buf, mime: ct, model: modelName, provider: 'HuggingFace' }
      }
    }
  } catch {}
  finally { clearTimeout(timer) }
  return null
}

// ── Pollinations ──────────────────────────────────────────────────────────────
async function tryPollinations(polModel = 'flux', prompt, width = 768, height = 768, attempt = 0) {
  const seed  = Math.floor(Math.random() * 9_000_000) + (attempt * 7919)
  const nonce = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`
  const url   = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
        + `?model=${polModel}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false&private=true&_n=${nonce}`
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), 35_000)
  try {
    const r  = await fetch(url, { signal: ac.signal, redirect: 'follow' })
    const ct = r.headers.get('content-type') || ''
    if (r.ok && ct.startsWith('image/')) {
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 2000) return { buf, mime: ct, model: `pollinations/${polModel}`, provider: 'Pollinations AI' }
    }
  } catch {}
  finally { clearTimeout(timer) }
  return null
}

// ── HuggingFace img2img ───────────────────────────────────────────────────────
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

// ── الدالة الرئيسية: توليد صورة ──────────────────────────────────────────────
export async function generateImage({ prompt, model, negativePrompt, aiGenerate, width, height, ip } = {}) {
  const tr       = await translateForImage({ aiGenerate, prompt })
  const enhanced = enhancePrompt(tr.english)
  if (!enhanced) throw new Error('prompt مطلوب')
  gc()

  const w   = width  || 768
  const h   = height || 768
  const meta = MODEL_MAP[model] || null
  const userIp = ip || 'anonymous'

  // ── نموذج OpenRouter مختار صراحةً ──────────────────────────────────────────
  if (meta?.provider === 'openrouter') {
    if (!consumeQuota(userIp, 'premium')) {
      return {
        ok: false,
        error: `تجاوزت الحصة اليومية للنماذج المميزة (${QUOTA_PREMIUM}/يوم). جرّب نموذجاً مجانياً أو انتظر حتى الغد.`,
        quotaExceeded: true,
        quota: checkImageQuota(userIp),
      }
    }
    try {
      const r = await tryOpenRouter(enhanced, meta.orModel, w, h)
      return storeAndReturn(r.buf, r.mime, enhanced, r.model, r.provider, tr)
    } catch (e) {
      console.warn(`[img-engine] OpenRouter ${meta.orModel} failed: ${e.message}`)
      // لا تسترجع الحصة — انتقل للاحتياطي
    }
  }

  // ── نموذج HuggingFace مختار صراحةً ─────────────────────────────────────────
  if (meta?.provider === 'hf') {
    if (!consumeQuota(userIp, 'fast')) {
      return {
        ok: false,
        error: `تجاوزت الحصة اليومية (${QUOTA_FAST}/يوم). انتظر حتى الغد.`,
        quotaExceeded: true,
        quota: checkImageQuota(userIp),
      }
    }
    const r = await tryHuggingFace(meta.hfUrl, enhanced)
    if (r) return storeAndReturn(r.buf, r.mime, enhanced, r.model, r.provider, tr)
    // فشل → Pollinations احتياطياً
    const pol = await tryPollinations('flux', enhanced, w, h)
    if (pol) return storeAndReturn(pol.buf, pol.mime, enhanced, pol.model, pol.provider, tr)
  }

  // ── نموذج Pollinations مختار صراحةً ────────────────────────────────────────
  if (meta?.provider === 'pollinations') {
    if (!consumeQuota(userIp, 'fast')) {
      return {
        ok: false,
        error: `تجاوزت الحصة اليومية (${QUOTA_FAST}/يوم). انتظر حتى الغد.`,
        quotaExceeded: true,
        quota: checkImageQuota(userIp),
      }
    }
    const r = await tryPollinations(meta.polModel, enhanced, w, h)
    if (r) return storeAndReturn(r.buf, r.mime, enhanced, r.model, r.provider, tr)
  }

  // ── بدون نموذج محدد: دوّر بين المزودين ──────────────────────────────────────
  if (!consumeQuota(userIp, 'fast')) {
    return {
      ok: false,
      error: `تجاوزت الحصة اليومية (${QUOTA_FAST}/يوم). انتظر حتى الغد.`,
      quotaExceeded: true,
      quota: checkImageQuota(userIp),
    }
  }

  // محاولة 1: HF + Pollinations بالتوازي
  try {
    const hfUrl = IMAGE_MODELS.find(m => m.provider === 'hf')?.hfUrl
    const winner = await Promise.any([
      hfUrl ? tryHuggingFace(hfUrl, enhanced).then(r => { if (!r) throw new Error('hf-empty'); return r }) : Promise.reject('no-hf'),
      tryPollinations('flux', enhanced, w, h).then(r => { if (!r) throw new Error('pol-empty'); return r }),
    ])
    return storeAndReturn(winner.buf, winner.mime, enhanced, winner.model, winner.provider, tr)
  } catch {}

  // محاولة 2: تدوير Pollinations
  for (const polModel of ['turbo', 'flux-realism', 'flux-anime', 'flux-3d', 'flux']) {
    const r = await tryPollinations(polModel, enhanced, w, h)
    if (r) return storeAndReturn(r.buf, r.mime, enhanced, r.model, r.provider, tr)
  }

  // محاولة 3: Pollinations بحجم أصغر
  const r3 = await tryPollinations('turbo', enhanced, 512, 512, 99)
  if (r3) return storeAndReturn(r3.buf, r3.mime, enhanced, r3.model, r3.provider, tr)

  // Last resort: SVG placeholder (لا يُعيد فارغاً أبداً)
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

// ── صورة إلى صورة (img2img) ──────────────────────────────────────────────────
export async function imageToImage({ prompt, imageUrl, imageBase64, strength = 0.75, aiGenerate, ip } = {}) {
  if (!prompt) throw new Error('prompt مطلوب')

  const tr       = await translateForImage({ aiGenerate, prompt })
  const enhanced = enhancePrompt(tr.english)
  gc()

  // استخراج base64
  let imgData = imageBase64 || null
  if (!imgData && imageUrl) {
    if (imageUrl.startsWith('/api/dz-agent-v4/image/')) {
      const stored = STORE.get(imageUrl.split('/').pop())
      if (stored?.bytes) imgData = stored.bytes.toString('base64')
    } else if (imageUrl.startsWith('http')) {
      try {
        const res = await fetch(imageUrl, { signal: AbortSignal.timeout(12_000) })
        if (res.ok) imgData = Buffer.from(await res.arrayBuffer()).toString('base64')
      } catch {}
    } else if (imageUrl.startsWith('data:')) {
      imgData = imageUrl.split(',')[1] || null
    }
  }

  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''

  // 1. HuggingFace img2img
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

  // 2. Pollinations img2img
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

  // 3. Fallback: توليد صورة جديدة
  return generateImage({ prompt, aiGenerate, ip })
}

// ── قراءة / إحصائيات ──────────────────────────────────────────────────────────
export function getImage(id) { return STORE.get(id) || null }

export function imageStats() {
  return {
    cached:           STORE.size,
    totalBytes:       Array.from(STORE.values()).reduce((a, x) => a + x.bytes.length, 0),
    models:           IMAGE_MODELS.length,
    premiumModels:    IMAGE_MODELS.filter(m => m.tier === 'premium').length,
    fastModels:       IMAGE_MODELS.filter(m => m.tier === 'fast').length,
    hfTokenSet:       !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY),
    openrouterSet:    !!process.env.OPENROUTER_API_KEY,
    quotaFastLimit:   QUOTA_FAST,
    quotaPremiumLimit:QUOTA_PREMIUM,
  }
}

export function getImageModels() {
  return IMAGE_MODELS.map(({ id, label, badge, tier, provider, group }) => ({ id, label, badge, tier, provider, group }))
}

// ── SVG placeholder ────────────────────────────────────────────────────────────
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
