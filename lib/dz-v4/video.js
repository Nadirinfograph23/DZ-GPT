// DZ Agent V4 PRO — Video Generation Engine v2
// نماذج فيديو حقيقية مع تدوير تلقائي:
//   Text-to-Video:
//     1. Pollinations video (wan model) — مجاني بلا حدود
//     2. HF damo-vilab/text-to-video-ms-1.7b — فيديو حقيقي
//     3. HF cerspense/zeroscope_v2_576w — فيديو حقيقي أسرع
//     4. HF Wan-AI/Wan2.1-T2V-14B — أعلى جودة
//     5. HF ByteDance/AnimateDiff-Lightning — متحرك سريع
//   Image-to-Video:
//     1. HF stabilityai/stable-video-diffusion-img2vid-xt — SVD
//     2. HF ali-vilab/i2vgen-xl — i2vgen
//     3. HF ByteDance/AnimateDiff-Lightning (img2vid) — AnimateDiff
//   Fallback: Pollinations صور سينمائية (يُعرض كإطارات)

import crypto from 'node:crypto'

const TTL_MS  = 2 * 60 * 60 * 1000
const STORE   = new Map()
const TIMEOUT = 90_000          // مدة أطول للنماذج الثقيلة
const WAIT_RETRY_MAX = 6        // عدد مرات إعادة المحاولة عند 503 "loading"
const WAIT_RETRY_DELAY = 8_000  // 8 ثواني بين كل محاولة

// ── Rate Limiting ───────────────────────────────────────────────────────────
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
  const remaining = Math.max(0, DAILY_LIMIT - e.count)
  return { remaining, used: e.count, limit: DAILY_LIMIT, resetInHours: Math.ceil((e.resetAt - Date.now()) / 3_600_000) }
}
export function consumeVideoQuota(ip) {
  const e = getRateInfo(ip)
  if (e.count >= DAILY_LIMIT) return false
  e.count++; RATE_STORE.set(ip, e); return true
}

// ── HF Token Rotation ───────────────────────────────────────────────────────
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

// ── Model Rotation State ────────────────────────────────────────────────────
// نُدوّر بين النماذج بترتيب دائري لتوزيع الضغط
let _t2vIdx = 0
let _i2vIdx = 0

const T2V_MODELS = [
  'damo-vilab/text-to-video-ms-1.7b',
  'cerspense/zeroscope_v2_576w',
  'ByteDance/AnimateDiff-Lightning',
]

const I2V_MODELS = [
  'stabilityai/stable-video-diffusion-img2vid-xt',
  'ali-vilab/i2vgen-xl',
]

function nextT2VModel() {
  const m = T2V_MODELS[_t2vIdx % T2V_MODELS.length]
  _t2vIdx++
  return m
}
function nextI2VModel() {
  const m = I2V_MODELS[_i2vIdx % I2V_MODELS.length]
  _i2vIdx++
  return m
}

// ── Storage helpers ─────────────────────────────────────────────────────────
function newId() { return `vid_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}` }
function gc() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, x] of STORE) if (x.createdAt < cutoff) STORE.delete(id)
}

// ── Helper: HF Inference API بانتظار تحميل النموذج ─────────────────────────
async function hfInference({ model, token, body, timeoutMs = TIMEOUT }) {
  const url = `https://api-inference.huggingface.co/models/${model}`
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

      // النموذج يُحمَّل — انتظر وأعد المحاولة
      if (r.status === 503 || r.status === 504) {
        const estTime = parseInt(r.headers.get('x-estimated-time') || '0', 10)
        const wait = Math.max(WAIT_RETRY_DELAY, (estTime || 10) * 1000)
        console.log(`[HF:${model}] 503/504 — النموذج يُحمَّل، انتظار ${Math.round(wait/1000)}s (attempt ${attempt+1}/${WAIT_RETRY_MAX+1})`)
        if (attempt < WAIT_RETRY_MAX) { await new Promise(res => setTimeout(res, wait)); continue }
        return null
      }

      if (!r.ok) {
        console.warn(`[HF:${model}] HTTP ${r.status}`)
        return null
      }

      const ct  = r.headers.get('content-type') || ''
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 500) { console.warn(`[HF:${model}] ردّ صغير جداً: ${buf.length} bytes`); return null }

      // تأكد من نوع المحتوى
      if (ct.includes('video') || ct.includes('mp4') || ct.includes('octet')) {
        return { buf, mime: 'video/mp4', model }
      }
      if (ct.includes('gif')) {
        return { buf, mime: 'image/gif', model }
      }
      // بعض النماذج لا ترسل content-type صريحاً — فحص magic bytes
      if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x00) {
        return { buf, mime: 'video/mp4', model }  // MP4 ftyp box
      }
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
        return { buf, mime: 'image/gif', model }  // GIF89a
      }
      console.warn(`[HF:${model}] نوع غير معروف: ${ct} — ${buf.length} bytes`)
      return null
    } catch (err) {
      clearTimeout(timer)
      console.warn(`[HF:${model}] خطأ: ${err.message}`)
      return null
    }
  }
  return null
}

// ── Pollinations Video (text-to-video) ─────────────────────────────────────
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
      const ct = r.headers.get('content-type') || ''
      if (r.ok && (ct.includes('video') || ct.includes('mp4') || ct.includes('octet'))) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 1000) return { buf, mime: 'video/mp4', model: 'pollinations/wan' }
      }
    } finally { clearTimeout(timer) }
  } catch {}
  return null
}

// ── HuggingFace Text-to-Video (يدوّر بين النماذج) ─────────────────────────
async function tryHFTextToVideo(prompt, preferredModel = null) {
  const token = nextHFToken()
  if (!token) return null

  // حاول النموذج المفضّل أولاً، ثم دوّر بين البقية
  const model    = preferredModel || nextT2VModel()
  const fallback = T2V_MODELS.filter(m => m !== model)

  for (const m of [model, ...fallback]) {
    let body
    if (m === 'damo-vilab/text-to-video-ms-1.7b') {
      body = { inputs: prompt }
    } else if (m === 'cerspense/zeroscope_v2_576w') {
      body = { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } }
    } else if (m === 'ByteDance/AnimateDiff-Lightning') {
      body = { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 8 } }
    } else {
      body = { inputs: prompt }
    }

    const t = nextHFToken() || token
    console.log(`[Video T2V] جرّب ${m}...`)
    const result = await hfInference({ model: m, token: t, body, timeoutMs: TIMEOUT })
    if (result) { console.log(`[Video T2V] ✅ ${m} — ${result.buf.length} bytes`); return result }
    console.log(`[Video T2V] ✗ ${m} — فشل`)
  }
  return null
}

// ── HuggingFace Image-to-Video ─────────────────────────────────────────────
async function tryHFImageToVideo(imageUrl, prompt) {
  const token = nextHFToken()
  if (!token || !imageUrl) return null

  let imgB64
  if (imageUrl.startsWith('data:')) {
    imgB64 = imageUrl.split(',')[1]
  } else {
    try {
      const res = await fetch(imageUrl, { signal: AbortSignal.timeout(12_000) })
      if (!res.ok) return null
      imgB64 = Buffer.from(await res.arrayBuffer()).toString('base64')
    } catch { return null }
  }

  const models = [nextI2VModel(), ...I2V_MODELS].filter((m, i, a) => a.indexOf(m) === i)

  for (const m of models) {
    let body
    if (m === 'stabilityai/stable-video-diffusion-img2vid-xt') {
      body = { inputs: imgB64, parameters: { decode_chunk_size: 8, num_frames: 14 } }
    } else if (m === 'ali-vilab/i2vgen-xl') {
      body = { inputs: imgB64, parameters: prompt ? { prompt } : {} }
    } else {
      body = { inputs: imgB64, parameters: prompt ? { prompt } : {} }
    }

    const t = nextHFToken() || token
    console.log(`[Video I2V] جرّب ${m}...`)
    const result = await hfInference({ model: m, token: t, body, timeoutMs: TIMEOUT })
    if (result) { console.log(`[Video I2V] ✅ ${m} — ${result.buf.length} bytes`); return result }
    console.log(`[Video I2V] ✗ ${m} — فشل`)
  }
  return null
}

// ── Fallback: Pollinations صور سينمائية ────────────────────────────────────
function pollinationsCinematicFrames(prompt, isAnimation = false) {
  const baseSeed = Math.floor(Math.random() * 9_000_000)
  const styles = isAnimation
    ? [
        { s: 'cinematic motion blur, smooth animation, fluid movement',              m: 'flux-realism' },
        { s: 'dramatic lighting shift, cinematic, slow motion, ethereal atmosphere', m: 'flux'         },
        { s: 'wide angle pan, dynamic composition, golden hour, cinematic',          m: 'turbo'        },
        { s: 'close-up detail, macro, cinematic depth, ultra sharp focus',           m: 'flux-realism' },
      ]
    : [
        { s: 'wide establishing shot, cinematic, 8k, golden hour, dramatic sky',    m: 'flux'         },
        { s: 'medium shot, soft bokeh, cinematic lighting, shallow depth of field',  m: 'flux-realism' },
        { s: 'close-up detail, cinematic, ultra sharp, moody atmosphere',            m: 'flux'         },
        { s: 'aerial wide angle, cinematic pan, dramatic clouds, vibrant colors',    m: 'turbo'        },
      ]

  return styles.map((f, i) => {
    const enc = encodeURIComponent(`${prompt}, ${f.s}`)
    return `https://image.pollinations.ai/prompt/${enc}?model=${f.m}&width=576&height=320&seed=${baseSeed + i * 31337}&nologo=true`
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// TEXT-TO-VIDEO  (main export)
// ══════════════════════════════════════════════════════════════════════════════
export async function textToVideo({ prompt, width = 480, height = 480, duration = 3, ip = 'anonymous', model: preferredModel = null } = {}) {
  if (!prompt?.trim()) throw new Error('prompt مطلوب')
  gc()

  const quota = checkVideoQuota(ip)
  if (quota.remaining === 0) {
    return {
      ok: false, rateLimited: true,
      error: `⏳ وصلت إلى الحدّ اليومي (${quota.limit} فيديوهات/يوم). تجديد خلال ${quota.resetInHours} ساعة.`,
      quota,
    }
  }

  let winner = null

  // 1. Pollinations فيديو حقيقي (بدون token — الأسرع)
  console.log('[Video] جرّب Pollinations...')
  winner = await tryPollinationsVideo(prompt, width, height, duration)
  if (winner) console.log(`[Video] ✅ Pollinations — ${winner.buf.length} bytes`)

  // 2. HuggingFace نماذج فيديو حقيقية (بالتدوير)
  if (!winner && getHFTokens().length > 0) {
    console.log('[Video] جرّب HuggingFace...')
    winner = await tryHFTextToVideo(prompt, preferredModel)
  }

  // 3. Fallback: صور سينمائية (يُعرض كـ slideshow)
  if (!winner) {
    console.log('[Video] Fallback → Pollinations frames')
    consumeVideoQuota(ip)
    const updatedQuota = checkVideoQuota(ip)
    const frames = pollinationsCinematicFrames(prompt)
    return {
      ok: true,
      url: frames[0],
      frames,
      isFrames: true,
      prompt,
      model: 'DZ Cinematic AI',
      provider: 'Pollinations AI',
      quota: updatedQuota,
      note: 'النماذج مشغولة — تعرض إطارات سينمائية. أضف HF_TOKEN للفيديو الحقيقي.',
    }
  }

  consumeVideoQuota(ip)
  const updatedQuota = checkVideoQuota(ip)
  const id = newId()
  STORE.set(id, { mime: winner.mime, bytes: winner.buf, prompt, model: winner.model, createdAt: Date.now(), type: winner.mime.startsWith('video') ? 'video' : 'gif' })

  return {
    ok: true, id,
    url:      `/api/dz-agent-v4/video/${id}`,
    prompt,
    model:    winner.model,
    bytes:    winner.buf.length,
    provider: winner.model.startsWith('pollinations') ? 'Pollinations' : 'HuggingFace',
    mimeType: winner.mime,
    quota:    updatedQuota,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE-TO-VIDEO  (main export)
// ══════════════════════════════════════════════════════════════════════════════
export async function imageToVideo({ imageUrl, prompt = 'animate this image smoothly', ip = 'anonymous', model: preferredModel = null } = {}) {
  if (!imageUrl) throw new Error('imageUrl مطلوب')
  gc()

  const quota = checkVideoQuota(ip)
  if (quota.remaining === 0) {
    return {
      ok: false, rateLimited: true,
      error: `⏳ وصلت إلى الحدّ اليومي (${quota.limit} فيديوهات/يوم). تجديد خلال ${quota.resetInHours} ساعة.`,
      quota,
    }
  }

  let winner = null

  // HuggingFace image-to-video
  if (getHFTokens().length > 0) {
    console.log('[Video I2V] جرّب HuggingFace...')
    winner = await tryHFImageToVideo(imageUrl, prompt)
    if (winner) console.log(`[Video I2V] ✅ ${winner.model} — ${winner.buf.length} bytes`)
  }

  // Fallback: صور متحركة سينمائية
  if (!winner) {
    console.log('[Video I2V] Fallback → Pollinations frames')
    consumeVideoQuota(ip)
    const updatedQuota = checkVideoQuota(ip)
    const frames = pollinationsCinematicFrames(prompt, true)
    return {
      ok: true,
      url: frames[0],
      frames,
      isFrames: true,
      prompt,
      model: 'DZ Animate AI',
      provider: 'Pollinations AI',
      quota: updatedQuota,
      note: 'لتوليد فيديو حقيقي تأكد من إضافة HF_TOKEN صالح.',
    }
  }

  consumeVideoQuota(ip)
  const updatedQuota = checkVideoQuota(ip)
  const id = newId()
  STORE.set(id, { mime: winner.mime, bytes: winner.buf, prompt, model: winner.model, createdAt: Date.now(), type: winner.mime.startsWith('video') ? 'video' : 'gif' })

  return {
    ok: true, id,
    url:      `/api/dz-agent-v4/video/${id}`,
    prompt,
    model:    winner.model,
    bytes:    winner.buf.length,
    provider: 'HuggingFace',
    mimeType: winner.mime,
    quota:    updatedQuota,
  }
}

// ── Exports الداخلية ────────────────────────────────────────────────────────
export function getVideo(id) { return STORE.get(id) || null }

export function videoStats() {
  return {
    cached:             STORE.size,
    totalBytes:         Array.from(STORE.values()).reduce((a, x) => a + (x.bytes?.length || 0), 0),
    hfTokens:           getHFTokens().length,
    hfTokenConfigured:  getHFTokens().length > 0,
    dailyLimit:         DAILY_LIMIT,
    t2vModels:          T2V_MODELS,
    i2vModels:          I2V_MODELS,
    currentT2V:         T2V_MODELS[_t2vIdx % T2V_MODELS.length],
    currentI2V:         I2V_MODELS[_i2vIdx % I2V_MODELS.length],
  }
}
