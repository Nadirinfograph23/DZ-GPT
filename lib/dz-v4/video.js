// DZ Agent V4 PRO — Video Generation Engine v5
// نماذج HuggingFace 2025-2026 بالتدوير الآلي (Pollinations محذوف كلياً):
//
//   Text-to-Video (HuggingFace فقط):
//     1. Wan-AI/Wan2.1-T2V-1.3B   — HuggingFace مجاني، سريع
//     2. Lightricks/LTX-Video     — أسرع نموذج مفتوح
//     3. ByteDance/AnimateDiff     — GIF سريع
//     4. Wan-AI/Wan2.1-T2V-14B    — HuggingFace جودة عالية
//     5. THUDM/CogVideoX1.5-5B    — جودة عالية
//     6. Skywork/SkyReels-V2       — جديد 2026
//     7. tencent/HunyuanVideo      — احترافي
//     8. genmo/mochi-1-preview     — إبداعي
//     9. damo-vilab/t2v-ms-1.7b    — خفيف
//    10. hpcai-tech/Open-Sora       — مفتوح
//
//   Image-to-Video (HuggingFace فقط):
//     1. Wan-AI/Wan2.1-I2V-14B
//     2. Lightricks/LTX-Video
//     3. THUDM/CogVideoX-5b-I2V
//     4. stabilityai/SVD-XT
//     5. ali-vilab/i2vgen-xl
//     6. ByteDance/AnimateDiff
//
//   حصص المستخدم:
//     - HF Fast (Wan 1.3B, AnimateDiff, LTX, SkyReels, ModelScope): 15 فيديو/يوم
//     - HF Heavy (Wan 14B, CogVideoX, HunyuanVideo, Mochi, OpenSora): 4 فيديو/يوم

import crypto from 'node:crypto'

const TTL_MS           = 2 * 60 * 60 * 1000
const STORE            = new Map()
const TIMEOUT_FAST     = 90_000    // 90 ثانية للنماذج السريعة
const TIMEOUT_HEAVY    = 180_000   // 3 دقائق للنماذج الثقيلة
const WAIT_RETRY_MAX   = 6
const WAIT_RETRY_DELAY = 12_000

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const QUOTA_FAST  = 15   // فيديوهات/يوم بالنماذج السريعة
const QUOTA_HEAVY = 4    // فيديوهات/يوم بالنماذج الثقيلة
const RATE_STORE  = new Map()

function getRateEntry(ip) {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  let e = RATE_STORE.get(ip)
  if (!e || now >= e.resetAt) {
    e = { fast: 0, heavy: 0, resetAt: now + day }
    RATE_STORE.set(ip, e)
  }
  return e
}

export function checkVideoQuota(ip) {
  const e = getRateEntry(ip)
  return {
    fast:          { remaining: Math.max(0, QUOTA_FAST - e.fast),   used: e.fast,   limit: QUOTA_FAST  },
    heavy:         { remaining: Math.max(0, QUOTA_HEAVY - e.heavy), used: e.heavy,  limit: QUOTA_HEAVY },
    resetInHours:  Math.ceil((e.resetAt - Date.now()) / 3_600_000),
  }
}

function consumeQuota(ip, tier = 'fast') {
  const e = getRateEntry(ip)
  if (tier === 'heavy') {
    if (e.heavy >= QUOTA_HEAVY) return false
    e.heavy++
  } else {
    if (e.fast >= QUOTA_FAST) return false
    e.fast++
  }
  RATE_STORE.set(ip, e)
  return true
}

// ── HF Token Rotation ─────────────────────────────────────────────────────────
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

// ── قوائم النماذج ────────────────────────────────────────────────────────────
export const T2V_MODELS = [
  { id: 'wan2',        hfId: 'Wan-AI/Wan2.1-T2V-1.3B',                   label: 'Wan 2.1 Fast',   badge: 'سريع',    color: '#10b981', tier: 'fast'  },
  { id: 'ltx',         hfId: 'Lightricks/LTX-Video',                      label: 'LTX Video',      badge: 'خفيف',    color: '#8b5cf6', tier: 'fast'  },
  { id: 'animatediff', hfId: 'ByteDance/AnimateDiff-Lightning',           label: 'AnimateDiff',    badge: 'GIF',     color: '#f59e0b', tier: 'fast'  },
  { id: 'wan2-14b',    hfId: 'Wan-AI/Wan2.1-T2V-14B-Diffusers',          label: 'Wan 2.1 Pro',    badge: 'جودة',    color: '#06b6d4', tier: 'heavy' },
  { id: 'cogvideo',    hfId: 'THUDM/CogVideoX1.5-5B',                     label: 'CogVideoX 5B',   badge: 'HD',      color: '#6366f1', tier: 'heavy' },
  { id: 'skyreels',    hfId: 'Skywork/SkyReels-V2-DF-1.3B-540P',         label: 'SkyReels V2',    badge: 'جديد',    color: '#0ea5e9', tier: 'fast'  },
  { id: 'hunyuan',     hfId: 'tencent/HunyuanVideo',                      label: 'HunyuanVideo',   badge: 'احترافي', color: '#ec4899', tier: 'heavy' },
  { id: 'mochi',       hfId: 'genmo/mochi-1-preview',                     label: 'Mochi 1',        badge: 'إبداعي',  color: '#a855f7', tier: 'heavy' },
  { id: 't2v-ms',      hfId: 'damo-vilab/text-to-video-ms-1.7b',          label: 'ModelScope T2V', badge: 'خفيف',    color: '#84cc16', tier: 'fast'  },
  { id: 'opensora',    hfId: 'hpcai-tech/Open-Sora',                      label: 'Open-Sora 2',    badge: 'مفتوح',   color: '#f97316', tier: 'heavy' },
]

export const I2V_MODELS = [
  { id: 'wan-i2v',       hfId: 'Wan-AI/Wan2.1-I2V-14B-720P-Diffusers',              label: 'Wan 2.1 I2V',   badge: 'جودة', color: '#10b981', tier: 'heavy' },
  { id: 'ltx-i2v',       hfId: 'Lightricks/LTX-Video',                              label: 'LTX I2V',       badge: 'سريع', color: '#8b5cf6', tier: 'fast'  },
  { id: 'cogvideo-i2v',  hfId: 'THUDM/CogVideoX-5b-I2V',                            label: 'CogVideoX I2V', badge: 'HD',   color: '#6366f1', tier: 'heavy' },
  { id: 'svd',           hfId: 'stabilityai/stable-video-diffusion-img2vid-xt-1-1', label: 'SVD XT 1.1',    badge: 'ناعم', color: '#3b82f6', tier: 'fast'  },
  { id: 'i2vgen',        hfId: 'ali-vilab/i2vgen-xl',                               label: 'I2VGen-XL',     badge: 'متوازن',color: '#0891b2', tier: 'fast'  },
  { id: 'animdiff2',     hfId: 'ByteDance/AnimateDiff-Lightning',                   label: 'AnimateDiff',   badge: 'GIF',  color: '#f59e0b', tier: 'fast'  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function newId()  { return `vid_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}` }
function gc() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, x] of STORE) if (x.createdAt < cutoff) STORE.delete(id)
}

function detectMediaType(ct, buf) {
  if (ct.includes('video') || ct.includes('mp4'))  return 'video/mp4'
  if (ct.includes('gif'))                           return 'image/gif'
  if (buf && buf.length >= 8) {
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return 'video/mp4'
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)                    return 'image/gif'
    if (buf[0] === 0x1A && buf[1] === 0x45 && buf[2] === 0xDF && buf[3] === 0xA3) return 'video/webm'
  }
  return ct.includes('octet') ? 'video/mp4' : null
}

// Pollinations محذوف كلياً من توليد الفيديو

// ── HF Inference مع انتظار تحميل النموذج ────────────────────────────────────
async function hfInference({ model, token, body, tier = 'fast' }) {
  const timeoutMs = tier === 'heavy' ? TIMEOUT_HEAVY : TIMEOUT_FAST
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
          if (attempt < WAIT_RETRY_MAX) {
            console.log(`[HF:${model.split('/')[1]}] يُحمَّل — انتظار ${Math.round(wait/1000)}s`)
            await new Promise(res => setTimeout(res, wait))
            continue
          }
          break
        }

        if (r.status === 404 || !r.ok) { break }

        const ct  = r.headers.get('content-type') || ''
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length < 500) break

        const mime = detectMediaType(ct, buf)
        if (!mime) break

        console.log(`[HF:${model.split('/')[1]}] ✅ ${mime} — ${buf.length.toLocaleString()} bytes`)
        return { buf, mime, model }
      } catch (err) {
        clearTimeout(timer)
        if (err.name === 'AbortError') { console.warn(`[HF:${model.split('/')[1]}] timeout`); break }
        break
      }
    }
  }
  return null
}

// ── بناء body حسب النموذج ────────────────────────────────────────────────────
function buildT2VBody(model, prompt) {
  const map = {
    'Wan-AI/Wan2.1-T2V-1.3B':               { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'Wan-AI/Wan2.1-T2V-14B-Diffusers':       { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'Lightricks/LTX-Video':                  { inputs: prompt, parameters: { num_frames: 25, num_inference_steps: 25, width: 512, height: 288 } },
    'THUDM/CogVideoX1.5-5B':                 { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, guidance_scale: 6 } },
    'tencent/HunyuanVideo':                  { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, width: 512, height: 288 } },
    'ByteDance/AnimateDiff-Lightning':        { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 4 } },
    'Skywork/SkyReels-V2-DF-1.3B-540P':      { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'hpcai-tech/Open-Sora':                  { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, width: 512, height: 288 } },
    'genmo/mochi-1-preview':                 { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 64, guidance_scale: 4.5 } },
    'damo-vilab/text-to-video-ms-1.7b':      { inputs: prompt },
  }
  return map[model] || { inputs: prompt }
}

function buildI2VBody(model, imgB64, prompt) {
  const map = {
    'Wan-AI/Wan2.1-I2V-14B-720P-Diffusers':              { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20 } },
    'Lightricks/LTX-Video':                              { inputs: imgB64, parameters: { prompt, num_frames: 25, num_inference_steps: 25 } },
    'THUDM/CogVideoX-5b-I2V':                            { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20, guidance_scale: 6 } },
    'stabilityai/stable-video-diffusion-img2vid-xt-1-1': { inputs: imgB64, parameters: { decode_chunk_size: 8, num_frames: 21 } },
    'ali-vilab/i2vgen-xl':                               { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20 } },
    'ByteDance/AnimateDiff-Lightning':                    { inputs: imgB64, parameters: { prompt, num_frames: 16 } },
  }
  return map[model] || { inputs: imgB64, parameters: prompt ? { prompt } : {} }
}

// ── HF T2V بالتدوير بين النماذج ─────────────────────────────────────────────
async function tryHFTextToVideo(prompt, preferredId, ip) {
  const token = nextHFToken()
  if (!token) return null

  let order = [...T2V_MODELS]
  if (preferredId) {
    const pref = order.find(m => m.id === preferredId || m.hfId === preferredId)
    if (pref) order = [pref, ...order.filter(m => m !== pref)]
  }

  for (const m of order) {
    const quota = checkVideoQuota(ip)
    const tierKey = m.tier === 'heavy' ? 'heavy' : 'fast'
    if (quota[tierKey].remaining === 0) {
      console.log(`[Video T2V] حصة ${m.tier} انتهت لـ ${ip}، تخطي ${m.label}`)
      continue
    }

    console.log(`[Video T2V] جرّب ${m.label} (${m.hfId})...`)
    const t      = nextHFToken() || token
    const result = await hfInference({ model: m.hfId, token: t, body: buildT2VBody(m.hfId, prompt), tier: m.tier })
    if (result) {
      consumeQuota(ip, m.tier)
      return result
    }
  }
  return null
}

// ── HF I2V بالتدوير ──────────────────────────────────────────────────────────
async function tryHFImageToVideo(imageUrl, prompt, preferredId, ip) {
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
    const quota = checkVideoQuota(ip)
    const tierKey = m.tier === 'heavy' ? 'heavy' : 'fast'
    if (quota[tierKey].remaining === 0) continue

    console.log(`[Video I2V] جرّب ${m.label} (${m.hfId})...`)
    const t      = nextHFToken() || token
    const result = await hfInference({ model: m.hfId, token: t, body: buildI2VBody(m.hfId, imgB64, prompt), tier: m.tier })
    if (result) {
      consumeQuota(ip, m.tier)
      return result
    }
  }
  return null
}


// ════════════════════════════════════════════════════════════════════════════
// TEXT-TO-VIDEO
// ════════════════════════════════════════════════════════════════════════════
export async function textToVideo({
  prompt, width = 512, height = 288,
  ip = 'anonymous', model: preferredModel = null,
} = {}) {
  if (!prompt?.trim()) throw new Error('prompt مطلوب')
  gc()

  // HuggingFace بالتدوير — النموذج الوحيد المستخدم
  let winner = null
  if (getHFTokens().length > 0) {
    winner = await tryHFTextToVideo(prompt, preferredModel, ip)
  }

  if (!winner) {
    return {
      ok: false,
      error: 'تعذّر توليد الفيديو. تأكد من ضبط HF_TOKEN وحاول مجدداً.',
      quota: checkVideoQuota(ip),
    }
  }

  const id = newId()
  STORE.set(id, {
    mime:      winner.mime,
    bytes:     winner.buf,
    prompt,
    model:     winner.model,
    createdAt: Date.now(),
    type:      winner.mime.startsWith('video') ? 'video' : 'gif',
  })

  return {
    ok: true, id,
    url:      `/api/dz-agent-v4/video/${id}`,
    prompt,
    model:    winner.model,
    bytes:    winner.buf.length,
    provider: 'HuggingFace',
    mimeType: winner.mime,
    quota:    checkVideoQuota(ip),
  }
}

// ════════════════════════════════════════════════════════════════════════════
// IMAGE-TO-VIDEO
// ════════════════════════════════════════════════════════════════════════════
export async function imageToVideo({
  imageUrl, prompt = 'animate this image smoothly, cinematic motion',
  ip = 'anonymous', model: preferredModel = null,
} = {}) {
  if (!imageUrl) throw new Error('imageUrl مطلوب')
  gc()

  // HuggingFace I2V — النموذج الوحيد المستخدم
  let winner = null
  if (getHFTokens().length > 0) {
    winner = await tryHFImageToVideo(imageUrl, prompt, preferredModel, ip)
  }

  if (!winner) {
    return {
      ok: false,
      error: 'تعذّر تحريك الصورة. تأكد من ضبط HF_TOKEN وحاول مجدداً.',
      quota: checkVideoQuota(ip),
    }
  }

  const id = newId()
  STORE.set(id, {
    mime:      winner.mime,
    bytes:     winner.buf,
    prompt,
    model:     winner.model,
    createdAt: Date.now(),
    type:      winner.mime.startsWith('video') ? 'video' : 'gif',
  })

  return {
    ok: true, id,
    url:      `/api/dz-agent-v4/video/${id}`,
    prompt,
    model:    winner.model,
    bytes:    winner.buf.length,
    provider: 'HuggingFace',
    mimeType: winner.mime,
    quota:    checkVideoQuota(ip),
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
export function getVideo(id)   { return STORE.get(id) || null }

export function videoStats() {
  return {
    cached:       STORE.size,
    totalBytes:   Array.from(STORE.values()).reduce((a, x) => a + (x.bytes?.length || 0), 0),
    hfTokens:     getHFTokens().length,
    hfConfigured: getHFTokens().length > 0,
    quotaFast:    QUOTA_FAST,
    quotaHeavy:   QUOTA_HEAVY,
    t2vModels:    T2V_MODELS,
    i2vModels:    I2V_MODELS,
  }
}
