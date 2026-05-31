// DZ Agent V4 PRO — Video Generation Engine
// Providers (مجاني كلياً):
//   1. Pollinations video (text-to-video) — مجاني بلا حدود
//   2. HuggingFace cerspense/zeroscope_v2_576w — أسرع
//   3. HuggingFace damo-vilab/text-to-video-ms-1.7b — جودة أعلى
//   4. HuggingFace ali-vilab/i2vgen-xl — صورة → فيديو
//   * تدوير تلقائي بين مفاتيح HF_TOKEN,HF_TOKEN_2..HF_TOKEN_10
//
// Rate limiting: 5 فيديوهات/IP/يوم مع عداد تنازلي للطابور

import crypto from 'node:crypto'

const TTL_MS   = 2 * 60 * 60 * 1000  // ساعتان
const STORE    = new Map()            // id → { mime, bytes, prompt, model, createdAt, type }
const TIMEOUT  = 55_000

// ── Rate Limiting: 5 فيديوهات لكل IP في اليوم ───────────────────────────
const DAILY_LIMIT  = 5
const RATE_STORE   = new Map()  // ip → { count, resetAt }

function getRateInfo(ip) {
  const now  = Date.now()
  const day  = 24 * 60 * 60 * 1000
  let entry  = RATE_STORE.get(ip)
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + day }
    RATE_STORE.set(ip, entry)
  }
  return entry
}

export function checkVideoQuota(ip) {
  const entry     = getRateInfo(ip)
  const remaining = Math.max(0, DAILY_LIMIT - entry.count)
  const msLeft    = Math.max(0, entry.resetAt - Date.now())
  const hLeft     = Math.ceil(msLeft / 3_600_000)
  return { remaining, used: entry.count, limit: DAILY_LIMIT, resetInHours: hLeft }
}

export function consumeVideoQuota(ip) {
  const entry = getRateInfo(ip)
  if (entry.count >= DAILY_LIMIT) return false
  entry.count++
  RATE_STORE.set(ip, entry)
  return true
}

// ── HF Token rotation ────────────────────────────────────────────────────
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

function newId() {
  return `vid_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
}

function gc() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, x] of STORE) if (x.createdAt < cutoff) STORE.delete(id)
}

// ── Pollinations Video (text-to-video) ────────────────────────────────────
async function tryPollinationsVideo(prompt, width = 480, height = 480, duration = 3) {
  try {
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT)
    try {
      const r = await fetch('https://video.pollinations.ai/', {
        method:   'POST',
        headers:  { 'Content-Type': 'application/json' },
        body:     JSON.stringify({ prompt, model: 'wan', width, height, duration }),
        signal:   ac.signal,
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

// ── HuggingFace Zeroscope (سريع) ──────────────────────────────────────────
async function tryZeroscope(prompt) {
  const token = nextHFToken()
  if (!token) return null
  try {
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT)
    try {
      const r = await fetch('https://router.huggingface.co/hf-inference/models/cerspense/zeroscope_v2_576w', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ inputs: prompt }),
        signal:  ac.signal,
      })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && (ct.includes('video') || ct.includes('mp4') || ct.includes('octet'))) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 1000) return { buf, mime: 'video/mp4', model: 'hf/zeroscope_v2' }
      }
    } finally { clearTimeout(timer) }
  } catch {}
  return null
}

// ── HuggingFace damo-vilab (جودة أعلى) ─────────────────────────────────────
async function tryHFVideo(prompt) {
  const token = nextHFToken()
  if (!token) return null
  try {
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT)
    try {
      const r = await fetch('https://router.huggingface.co/hf-inference/models/damo-vilab/text-to-video-ms-1.7b', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ inputs: prompt }),
        signal:  ac.signal,
      })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && (ct.includes('video') || ct.includes('mp4') || ct.includes('octet'))) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 1000) return { buf, mime: 'video/mp4', model: 'hf/text-to-video-ms' }
      }
    } finally { clearTimeout(timer) }
  } catch {}
  return null
}

// ── HuggingFace image-to-video ──────────────────────────────────────────────
async function tryHFImageToVideo(imageUrl, prompt) {
  const token = nextHFToken()
  if (!token || !imageUrl) return null
  try {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10_000) })
    if (!imgRes.ok) return null
    const imgBuf  = Buffer.from(await imgRes.arrayBuffer())
    const imgB64  = imgBuf.toString('base64')
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT)
    try {
      const r = await fetch('https://router.huggingface.co/hf-inference/models/ali-vilab/i2vgen-xl', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ inputs: imgB64, parameters: prompt ? { prompt } : {} }),
        signal:  ac.signal,
      })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && (ct.includes('video') || ct.includes('mp4') || ct.includes('octet'))) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 1000) return { buf, mime: 'video/mp4', model: 'hf/i2vgen-xl' }
      }
    } finally { clearTimeout(timer) }
  } catch {}
  return null
}

// ── توليد فيديو من نص (text-to-video) ──────────────────────────────────────
export async function textToVideo({ prompt, width = 480, height = 480, duration = 3, ip = 'anonymous' } = {}) {
  if (!prompt?.trim()) throw new Error('prompt مطلوب')
  gc()

  // فحص الحصة اليومية
  const quota = checkVideoQuota(ip)
  if (quota.remaining === 0) {
    return {
      ok: false,
      rateLimited: true,
      error: `⏳ وصلت إلى الحدّ اليومي (${quota.limit} فيديوهات/يوم). تجديد خلال ${quota.resetInHours} ساعة.`,
      quota,
    }
  }

  // محاولة متوازية: Pollinations + Zeroscope (الأسرع) → damo-vilab
  let winner = null
  try {
    winner = await Promise.any([
      tryPollinationsVideo(prompt, width, height, duration).then(r => { if (!r) throw new Error('pol-fail'); return r }),
      tryZeroscope(prompt).then(r => { if (!r) throw new Error('zs-fail'); return r }),
      tryHFVideo(prompt).then(r => { if (!r) throw new Error('hf-fail'); return r }),
    ])
  } catch {}

  if (!winner) {
    return {
      ok: false,
      error: 'توليد الفيديو غير متاح حالياً. تأكد من إضافة HF_TOKEN أو حاول لاحقاً.',
      provider: 'none',
      quota,
    }
  }

  // خصم من الحصة
  consumeVideoQuota(ip)
  const updatedQuota = checkVideoQuota(ip)

  const id = newId()
  STORE.set(id, { mime: winner.mime, bytes: winner.buf, prompt, model: winner.model, createdAt: Date.now(), type: 'video' })
  return {
    ok: true,
    id,
    url: `/api/dz-agent-v4/video/${id}`,
    prompt,
    model: winner.model,
    bytes: winner.buf.length,
    provider: winner.model.split('/')[0],
    quota: updatedQuota,
  }
}

// ── صورة إلى فيديو (image-to-video) ────────────────────────────────────────
export async function imageToVideo({ imageUrl, prompt = 'animate this image smoothly', ip = 'anonymous' } = {}) {
  if (!imageUrl) throw new Error('imageUrl مطلوب')
  gc()

  const quota = checkVideoQuota(ip)
  if (quota.remaining === 0) {
    return {
      ok: false,
      rateLimited: true,
      error: `⏳ وصلت إلى الحدّ اليومي (${quota.limit} فيديوهات/يوم). تجديد خلال ${quota.resetInHours} ساعة.`,
      quota,
    }
  }

  const result = await tryHFImageToVideo(imageUrl, prompt)
  if (result) {
    consumeVideoQuota(ip)
    const updatedQuota = checkVideoQuota(ip)
    const id = newId()
    STORE.set(id, { mime: result.mime, bytes: result.buf, prompt, model: result.model, createdAt: Date.now(), type: 'video' })
    return {
      ok: true,
      id,
      url: `/api/dz-agent-v4/video/${id}`,
      prompt,
      model: result.model,
      bytes: result.buf.length,
      provider: 'huggingface',
      quota: updatedQuota,
    }
  }

  return {
    ok: false,
    error: 'تحويل الصورة لفيديو يتطلب HF_TOKEN. أضفه في Secrets ثم حاول مجدداً.',
    provider: 'none',
    quota,
  }
}

export function getVideo(id) { return STORE.get(id) || null }

export function videoStats() {
  return {
    cached: STORE.size,
    totalBytes: Array.from(STORE.values()).reduce((a, x) => a + x.bytes.length, 0),
    hfTokens: getHFTokens().length,
    hfTokenConfigured: getHFTokens().length > 0,
    dailyLimit: DAILY_LIMIT,
  }
}
