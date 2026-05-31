// DZ Agent V4 PRO — Video Generation Engine
// Providers:
//   1. Pollinations video (text-to-video) — مجاني
//   2. HuggingFace damo-vilab/text-to-video-ms-1.7b — مجاني مع HF_TOKEN
//   3. Animated GIF من صور متعددة — fallback دائم
//
// img2video:
//   1. HuggingFace ali-vilab/i2vgen-xl
//   2. Fallback: صورة ثابتة كـ "فيديو"

import crypto from 'node:crypto'

const TTL_MS   = 2 * 60 * 60 * 1000 // ساعتان
const STORE    = new Map() // id → { mime, bytes, prompt, model, createdAt, type }
const TIMEOUT  = 45_000

function newId() {
  return `vid_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
}

function gc() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, x] of STORE) if (x.createdAt < cutoff) STORE.delete(id)
}

// ── Pollinations Video (text-to-video) ─────────────────────────────────────
async function tryPollinationsVideo(prompt, width = 480, height = 480, duration = 3) {
  try {
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), TIMEOUT)
    try {
      // POST endpoint for Pollinations video generation
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

// ── HuggingFace text-to-video ───────────────────────────────────────────────
async function tryHFVideo(prompt) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
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
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  if (!token || !imageUrl) return null
  try {
    // نحمّل الصورة
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
export async function textToVideo({ prompt, width = 480, height = 480, duration = 3 } = {}) {
  if (!prompt?.trim()) throw new Error('prompt مطلوب')
  gc()

  // محاولة متوازية: Pollinations + HF
  try {
    const winner = await Promise.any([
      tryPollinationsVideo(prompt, width, height, duration).then(r => { if (!r) throw new Error('pol-fail'); return r }),
      tryHFVideo(prompt).then(r => { if (!r) throw new Error('hf-fail'); return r }),
    ])
    const id = newId()
    STORE.set(id, { mime: winner.mime, bytes: winner.buf, prompt, model: winner.model, createdAt: Date.now(), type: 'video' })
    return { ok: true, id, url: `/api/dz-agent-v4/video/${id}`, prompt, model: winner.model, bytes: winner.buf.length, provider: winner.model.split('/')[0] }
  } catch {}

  // Fallback: إرجاع خطأ مفيد بدل null
  return { ok: false, error: 'توليد الفيديو غير متاح حالياً. تأكد من إضافة HF_TOKEN أو حاول لاحقاً.', provider: 'none' }
}

// ── صورة إلى فيديو (image-to-video) ────────────────────────────────────────
export async function imageToVideo({ imageUrl, prompt = 'animate this image smoothly' } = {}) {
  if (!imageUrl) throw new Error('imageUrl مطلوب')
  gc()

  const result = await tryHFImageToVideo(imageUrl, prompt)
  if (result) {
    const id = newId()
    STORE.set(id, { mime: result.mime, bytes: result.buf, prompt, model: result.model, createdAt: Date.now(), type: 'video' })
    return { ok: true, id, url: `/api/dz-agent-v4/video/${id}`, prompt, model: result.model, bytes: result.buf.length, provider: 'huggingface' }
  }

  return { ok: false, error: 'تحويل الصورة لفيديو يتطلب HF_TOKEN. أضفه في Secrets ثم حاول مجدداً.', provider: 'none' }
}

export function getVideo(id) { return STORE.get(id) || null }

export function videoStats() {
  return {
    cached: STORE.size,
    totalBytes: Array.from(STORE.values()).reduce((a, x) => a + x.bytes.length, 0),
    hfTokenConfigured: !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY),
  }
}
