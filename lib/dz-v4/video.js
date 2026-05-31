// DZ Agent V4 PRO — Video Generation Engine v3
// نماذج HuggingFace مجانية محدّثة 2025-2026:
//
//   Text-to-Video:
//     1. Pollinations (wan)          — أسرع، بلا token
//     2. Wan-AI/Wan2.1-T2V-1.3B      — وان 2.1 الخفيف، نتائج حقيقية
//     3. THUDM/CogVideoX-2b          — CogVideoX الخفيف، جودة عالية
//     4. Lightricks/LTX-Video        — LTX أسرع نموذج مفتوح (470K downloads)
//     5. genmo/mochi-1-preview        — Mochi احتياطي
//
//   Image-to-Video:
//     1. Lightricks/LTX-Video        — LTX صورة→فيديو سلس
//     2. stabilityai/stable-video-diffusion-img2vid — SVD كلاسيكي
//     3. ali-vilab/i2vgen-xl         — i2vgen احتياطي
//
//   Fallback: Pollinations إطارات سينمائية

import crypto from 'node:crypto'

const TTL_MS          = 2 * 60 * 60 * 1000
const STORE           = new Map()
const TIMEOUT         = 120_000     // 2 دقيقة — نماذج T2V تحتاج وقتاً
const WAIT_RETRY_MAX  = 8           // محاولات عند 503 (النموذج يُحمَّل)
const WAIT_RETRY_DELAY = 10_000     // 10 ثواني بين المحاولات

// ── Rate Limiting ────────────────────────────────────────────────────────────
const DAILY_LIMIT = 8
const RATE_STORE  = new Map()

function getRateInfo(ip) {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  let e = RATE_STORE.get(ip)
  if (!e || now >= e.resetAt) { e = { count: 0, resetAt: now + day }; RATE_STORE.set(ip, e) }
  return e
}
export function checkVideoQuota(ip) {
  const e = getRateInfo(ip)
  return {
    remaining:     Math.max(0, DAILY_LIMIT - e.count),
    used:          e.count,
    limit:         DAILY_LIMIT,
    resetInHours:  Math.ceil((e.resetAt - Date.now()) / 3_600_000),
  }
}
export function consumeVideoQuota(ip) {
  const e = getRateInfo(ip)
  if (e.count >= DAILY_LIMIT) return false
  e.count++; RATE_STORE.set(ip, e); return true
}

// ── HF Token Rotation ────────────────────────────────────────────────────────
function getHFTokens() {
  const tokens = []
  const base = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  if (base) tokens.push(base)
  for (let i = 2; i <= 10; i++) {
    const t = process.env[`HF_TOKEN_${i}`] || ''
    if (t) tokens.push(t)
  }
  return tokens
}
let _hfIdx = 0
function nextHFToken() {
  const tokens = getHFTokens()
  if (!tokens.length) return ''
  const tok = tokens[_hfIdx % tokens.length]
  _hfIdx++
  return tok
}

// ── قائمة النماذج — HuggingFace فقط (بدون Pollinations) ─────────────────────
let _t2vIdx = 0
let _i2vIdx = 0

// نماذج Text-to-Video (2026) — مع الـ metadata للعرض في UI
export const T2V_MODELS = [
  { id: 'wan2',        hfId: 'Wan-AI/Wan2.1-T2V-1.3B',                  label: 'Wan 2.1 Fast',  badge: 'سريع',    color: '#10b981' },
  { id: 'wan2-14b',    hfId: 'Wan-AI/Wan2.1-T2V-14B-Diffusers',         label: 'Wan 2.1 Pro',   badge: 'جودة',    color: '#06b6d4' },
  { id: 'ltx',         hfId: 'Lightricks/LTX-Video',                     label: 'LTX Video',     badge: 'خفيف',    color: '#8b5cf6' },
  { id: 'cogvideo',    hfId: 'THUDM/CogVideoX1.5-5B',                    label: 'CogVideoX 5B',  badge: 'HD',      color: '#6366f1' },
  { id: 'hunyuan',     hfId: 'tencent/HunyuanVideo',                     label: 'HunyuanVideo',  badge: 'احترافي', color: '#ec4899' },
  { id: 'animatediff', hfId: 'ByteDance/AnimateDiff-Lightning',          label: 'AnimateDiff',   badge: 'GIF',     color: '#f59e0b' },
  { id: 'skyreels',    hfId: 'Skywork/SkyReels-V2-DF-1.3B-540P',        label: 'SkyReels V2',   badge: 'جديد',    color: '#0ea5e9' },
  { id: 'opensora',    hfId: 'hpcai-tech/Open-Sora',                     label: 'Open-Sora 2',   badge: 'مفتوح',   color: '#84cc16' },
  { id: 'mochi',       hfId: 'genmo/mochi-1-preview',                    label: 'Mochi 1',       badge: 'إبداعي',  color: '#a855f7' },
]

// نماذج Image-to-Video (2026)
export const I2V_MODELS = [
  { id: 'wan-i2v',      hfId: 'Wan-AI/Wan2.1-I2V-14B-720P-Diffusers',              label: 'Wan 2.1 I2V',   badge: 'جودة',  color: '#10b981' },
  { id: 'ltx-i2v',      hfId: 'Lightricks/LTX-Video',                              label: 'LTX Video',     badge: 'سريع',  color: '#8b5cf6' },
  { id: 'cogvideo-i2v', hfId: 'THUDM/CogVideoX-5b-I2V',                            label: 'CogVideoX I2V', badge: 'HD',    color: '#6366f1' },
  { id: 'svd',          hfId: 'stabilityai/stable-video-diffusion-img2vid-xt-1-1', label: 'SVD XT 1.1',    badge: 'ناعم',  color: '#3b82f6' },
  { id: 'animdiff2',    hfId: 'ByteDance/AnimateDiff-Lightning',                   label: 'AnimateDiff',   badge: 'GIF',   color: '#f59e0b' },
]

function nextT2VModel() {
  const m = T2V_MODELS[_t2vIdx % T2V_MODELS.length]; _t2vIdx++; return m.hfId
}
function nextI2VModel() {
  const m = I2V_MODELS[_i2vIdx % I2V_MODELS.length]; _i2vIdx++; return m.hfId
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function newId() { return `vid_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}` }
function gc() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, x] of STORE) if (x.createdAt < cutoff) STORE.delete(id)
}

// تحديد نوع المحتوى من البايتات أو الـ content-type
function detectMediaType(ct, buf) {
  if (ct.includes('video') || ct.includes('mp4'))  return 'video/mp4'
  if (ct.includes('gif'))                           return 'image/gif'
  // Magic bytes
  if (buf.length >= 8) {
    // MP4 / QuickTime — ftyp box
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'video/mp4'
    // GIF89a / GIF87a
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
    // WebM — EBML header
    if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'video/webm'
  }
  return ct.includes('octet') ? 'video/mp4' : null
}

// ── HF Inference مع انتظار تحميل النموذج ────────────────────────────────────
async function hfInference({ model, token, body, timeoutMs = TIMEOUT }) {
  // جرّب كلا العنوانين (router الجديد + api-inference الكلاسيكي)
  const urls = [
    `https://router.huggingface.co/hf-inference/models/${model}`,
    `https://api-inference.huggingface.co/models/${model}`,
  ]

  for (const url of urls) {
    for (let attempt = 0; attempt <= WAIT_RETRY_MAX; attempt++) {
      const ac    = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      try {
        const r = await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify(body),
          signal:  ac.signal,
        })
        clearTimeout(timer)

        if (r.status === 503 || r.status === 504) {
          const estTime = parseInt(r.headers.get('x-estimated-time') || '0', 10)
          const wait    = Math.max(WAIT_RETRY_DELAY, (estTime || 12) * 1000)
          console.log(`[HF:${model}] ${r.status} — النموذج يُحمَّل، انتظار ${Math.round(wait/1000)}s (${attempt+1}/${WAIT_RETRY_MAX+1})`)
          if (attempt < WAIT_RETRY_MAX) { await new Promise(res => setTimeout(res, wait)); continue }
          break  // جرّب العنوان الآخر
        }

        if (r.status === 404) { console.log(`[HF:${model}] 404 على ${url}`); break }
        if (!r.ok) { console.warn(`[HF:${model}] HTTP ${r.status} على ${url}`); break }

        const ct  = r.headers.get('content-type') || ''
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length < 500) { console.warn(`[HF:${model}] ردّ صغير: ${buf.length} bytes`); break }

        const mime = detectMediaType(ct, buf)
        if (!mime) { console.warn(`[HF:${model}] نوع غير معروف: ${ct}`); break }

        console.log(`[HF:${model}] ✅ ${mime} — ${buf.length.toLocaleString()} bytes`)
        return { buf, mime, model }

      } catch (err) {
        clearTimeout(timer)
        if (err.name === 'AbortError') { console.warn(`[HF:${model}] timeout`); break }
        console.warn(`[HF:${model}] خطأ: ${err.message}`)
        break
      }
    }
  }
  return null
}

// ── بناء body حسب النموذج ────────────────────────────────────────────────────
function buildT2VBody(model, prompt) {
  const map = {
    'Wan-AI/Wan2.1-T2V-1.3B':           { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'Wan-AI/Wan2.1-T2V-14B-Diffusers':  { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'Lightricks/LTX-Video':             { inputs: prompt, parameters: { num_frames: 25, num_inference_steps: 25, width: 512, height: 288 } },
    'THUDM/CogVideoX1.5-5B':            { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, guidance_scale: 6 } },
    'tencent/HunyuanVideo':             { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, width: 512, height: 288 } },
    'ByteDance/AnimateDiff-Lightning':  { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 4 } },
    'Skywork/SkyReels-V2-DF-1.3B-540P':{ inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'hpcai-tech/Open-Sora':             { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, width: 512, height: 288 } },
    'genmo/mochi-1-preview':            { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 64, guidance_scale: 4.5 } },
  }
  return map[model] || { inputs: prompt }
}

function buildI2VBody(model, imgB64, prompt) {
  const map = {
    'Wan-AI/Wan2.1-I2V-14B-720P-Diffusers':              { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20 } },
    'Lightricks/LTX-Video':                              { inputs: imgB64, parameters: { prompt, num_frames: 25, num_inference_steps: 25 } },
    'THUDM/CogVideoX-5b-I2V':                            { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20, guidance_scale: 6 } },
    'stabilityai/stable-video-diffusion-img2vid-xt-1-1': { inputs: imgB64, parameters: { decode_chunk_size: 8, num_frames: 21 } },
    'ByteDance/AnimateDiff-Lightning':                   { inputs: imgB64, parameters: { prompt, num_frames: 16 } },
  }
  return map[model] || { inputs: imgB64, parameters: prompt ? { prompt } : {} }
}

// ── Pollinations Video (بدون token) ─────────────────────────────────────────
async function tryPollinationsVideo(prompt, width = 480, height = 480, duration = 3) {
  try {
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), 60_000)
    try {
      const r = await fetch('https://video.pollinations.ai/', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt, model: 'wan', width, height, duration }),
        signal:  ac.signal,
        redirect: 'follow',
      })
      const ct  = r.headers.get('content-type') || ''
      const mime = detectMediaType(ct, Buffer.alloc(0))
      if (r.ok && mime) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 1000) return { buf, mime, model: 'pollinations/wan' }
      }
    } finally { clearTimeout(timer) }
  } catch {}
  return null
}

// ── HF Text-to-Video (يدوّر بين النماذج) ────────────────────────────────────
async function tryHFTextToVideo(prompt, preferredId = null) {
  const token = nextHFToken()
  if (!token) { console.log('[Video T2V] لا يوجد HF_TOKEN'); return null }

  // بناء ترتيب التدوير: المفضَّل أولاً ثم الباقي
  let order = [...T2V_MODELS]
  if (preferredId) {
    const pref = order.find(m => m.id === preferredId || m.hfId === preferredId)
    if (pref) order = [pref, ...order.filter(m => m !== pref)]
  }

  for (const m of order) {
    const t = nextHFToken() || token
    console.log(`[Video T2V] جرّب ${m.label} (${m.hfId})...`)
    const result = await hfInference({ model: m.hfId, token: t, body: buildT2VBody(m.hfId, prompt) })
    if (result) return result
  }
  return null
}

// ── HF Image-to-Video ────────────────────────────────────────────────────────
async function tryHFImageToVideo(imageUrl, prompt, preferredId = null) {
  const token = nextHFToken()
  if (!token || !imageUrl) return null

  let imgB64
  if (imageUrl.startsWith('data:')) {
    imgB64 = imageUrl.split(',')[1]
  } else {
    try {
      const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) return null
      imgB64 = Buffer.from(await res.arrayBuffer()).toString('base64')
    } catch { return null }
  }

  let order = [...I2V_MODELS]
  if (preferredId) {
    const pref = order.find(m => m.id === preferredId || m.hfId === preferredId)
    if (pref) order = [pref, ...order.filter(m => m !== pref)]
  }

  for (const m of order) {
    const t = nextHFToken() || token
    console.log(`[Video I2V] جرّب ${m.label} (${m.hfId})...`)
    const result = await hfInference({ model: m.hfId, token: t, body: buildI2VBody(m.hfId, imgB64, prompt) })
    if (result) return result
  }
  return null
}

// ── Fallback: Pollinations إطارات سينمائية ──────────────────────────────────
function pollinationsFrames(prompt, isAnim = false) {
  const seed  = Math.floor(Math.random() * 9_000_000)
  const items = isAnim
    ? [
        { s: 'cinematic motion blur, fluid movement, smooth',            m: 'flux-realism' },
        { s: 'dramatic lighting shift, slow motion, ethereal',           m: 'flux'         },
        { s: 'wide angle pan, dynamic composition, golden hour',         m: 'turbo'        },
        { s: 'close-up macro, cinematic depth, ultra sharp',             m: 'flux-realism' },
      ]
    : [
        { s: 'wide establishing shot, cinematic, 8k, golden hour',       m: 'flux'         },
        { s: 'medium shot, soft bokeh, cinematic lighting',              m: 'flux-realism' },
        { s: 'close-up detail, cinematic, ultra sharp, moody',           m: 'flux'         },
        { s: 'aerial wide angle, cinematic pan, vibrant colors',         m: 'turbo'        },
      ]
  return items.map((f, i) => {
    const enc = encodeURIComponent(`${prompt}, ${f.s}`)
    return `https://image.pollinations.ai/prompt/${enc}?model=${f.m}&width=576&height=320&seed=${seed + i * 31337}&nologo=true`
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// TEXT-TO-VIDEO
// ══════════════════════════════════════════════════════════════════════════════
export async function textToVideo({
  prompt, width = 512, height = 288, duration = 3,
  ip = 'anonymous', model: preferredModel = null,
} = {}) {
  if (!prompt?.trim()) throw new Error('prompt مطلوب')
  gc()

  const quota = checkVideoQuota(ip)
  if (quota.remaining === 0) {
    return {
      ok: false, rateLimited: true,
      error: `⏳ وصلت إلى الحدّ اليومي (${quota.limit} فيديوهات/يوم). تجديد خلال ${quota.resetInHours}h.`,
      quota,
    }
  }

  let winner = null

  // 1. HuggingFace نماذج حقيقية بالتدوير (بدون Pollinations)
  if (getHFTokens().length > 0) {
    winner = await tryHFTextToVideo(prompt, preferredModel)
  }

  // 3. Fallback: إطارات سينمائية
  if (!winner) {
    consumeVideoQuota(ip)
    const frames = pollinationsFrames(prompt)
    return {
      ok: true, url: frames[0], frames, isFrames: true,
      prompt, model: 'DZ Cinematic AI', provider: 'Pollinations AI',
      quota: checkVideoQuota(ip),
      note: 'النماذج مشغولة — إطارات سينمائية. أضف HF_TOKEN للفيديو الحقيقي.',
    }
  }

  consumeVideoQuota(ip)
  const id = newId()
  STORE.set(id, { mime: winner.mime, bytes: winner.buf, prompt, model: winner.model, createdAt: Date.now(), type: winner.mime.startsWith('video') ? 'video' : 'gif' })

  return {
    ok: true, id,
    url:      `/api/dz-agent-v4/video/${id}`,
    prompt, model: winner.model,
    bytes:    winner.buf.length,
    provider: winner.model.startsWith('pollinations') ? 'Pollinations' : 'HuggingFace',
    mimeType: winner.mime,
    quota:    checkVideoQuota(ip),
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE-TO-VIDEO
// ══════════════════════════════════════════════════════════════════════════════
export async function imageToVideo({
  imageUrl, prompt = 'animate this image smoothly',
  ip = 'anonymous', model: preferredModel = null,
} = {}) {
  if (!imageUrl) throw new Error('imageUrl مطلوب')
  gc()

  const quota = checkVideoQuota(ip)
  if (quota.remaining === 0) {
    return {
      ok: false, rateLimited: true,
      error: `⏳ وصلت إلى الحدّ اليومي (${quota.limit} فيديوهات/يوم). تجديد خلال ${quota.resetInHours}h.`,
      quota,
    }
  }

  let winner = null

  if (getHFTokens().length > 0) {
    winner = await tryHFImageToVideo(imageUrl, prompt)
  }

  if (!winner) {
    consumeVideoQuota(ip)
    const frames = pollinationsFrames(prompt, true)
    return {
      ok: true, url: frames[0], frames, isFrames: true,
      prompt, model: 'DZ Animate AI', provider: 'Pollinations AI',
      quota: checkVideoQuota(ip),
      note: 'أضف HF_TOKEN لتوليد فيديو حقيقي.',
    }
  }

  consumeVideoQuota(ip)
  const id = newId()
  STORE.set(id, { mime: winner.mime, bytes: winner.buf, prompt, model: winner.model, createdAt: Date.now(), type: winner.mime.startsWith('video') ? 'video' : 'gif' })

  return {
    ok: true, id,
    url:      `/api/dz-agent-v4/video/${id}`,
    prompt, model: winner.model,
    bytes:    winner.buf.length,
    provider: 'HuggingFace',
    mimeType: winner.mime,
    quota:    checkVideoQuota(ip),
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────
export function getVideo(id)  { return STORE.get(id) || null }

export function videoStats() {
  return {
    cached:            STORE.size,
    totalBytes:        Array.from(STORE.values()).reduce((a, x) => a + (x.bytes?.length || 0), 0),
    hfTokens:          getHFTokens().length,
    hfConfigured:      getHFTokens().length > 0,
    dailyLimit:        DAILY_LIMIT,
    t2vModels:         T2V_MODELS,
    i2vModels:         I2V_MODELS,
    activeT2V:         T2V_MODELS[_t2vIdx % T2V_MODELS.length],
    activeI2V:         I2V_MODELS[_i2vIdx % I2V_MODELS.length],
  }
}
