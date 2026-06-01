// DZ Agent V4 PRO — Video Generation Engine v7
//
// ── مزودون مرتّبون حسب الأولوية (تدوير آلي):
//   1. LTX Video API  — ltx-2-3-fast/pro، 1080p، MP4 مباشر، بدون انتظار
//   2. fal.ai         — WanVideo/LTX، قائمة انتظار async (FAL_KEY)
//   3. HuggingFace    — 10 نماذج بالتدوير + x-wait-for-model:true
//   4. Pollinations   — 6 إطارات slideshow، بدون أي مفتاح، دائماً يعمل
//
// ── مفاتيح بالتدوير:
//   LTX_API_KEY, LTX_API_KEY_2 ... LTX_API_KEY_10
//   HF_TOKEN, HF_TOKEN_2 ... HF_TOKEN_10
//   FAL_KEY

import crypto from 'node:crypto'

const TTL_MS           = 2 * 60 * 60 * 1000
const STORE            = new Map()
const TIMEOUT_LTX      = 85_000    // 85s لـ LTX v1 (synchronous) — أقل من Vercel 300s
const TIMEOUT_FAST     = 90_000    // 90s لـ HF fast
const TIMEOUT_HEAVY    = 200_000   // 200s لـ HF heavy
const WAIT_RETRY_MAX   = 3         // 3 محاولات فقط (أسرع على Vercel)
const WAIT_RETRY_DELAY = 6_000     // 6s بين كل محاولة
const LTX_V2_POLL_INT  = 5_000     // polling interval للـ v2 async
const LTX_V2_TIMEOUT   = 200_000   // 200s لـ v2 async polling كامل

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const QUOTA_FAST  = 15
const QUOTA_HEAVY = 4
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
    fast:         { remaining: Math.max(0, QUOTA_FAST - e.fast),   used: e.fast,   limit: QUOTA_FAST  },
    heavy:        { remaining: Math.max(0, QUOTA_HEAVY - e.heavy), used: e.heavy,  limit: QUOTA_HEAVY },
    resetInHours: Math.ceil((e.resetAt - Date.now()) / 3_600_000),
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

// ── LTX Key Rotation ──────────────────────────────────────────────────────────
function getLTXKeys() {
  const keys = []
  const base = process.env.LTX_API_KEY || process.env.LTX_KEY || ''
  if (base) keys.push(base)
  for (let i = 2; i <= 10; i++) {
    const k = process.env[`LTX_API_KEY_${i}`] || ''
    if (k) keys.push(k)
  }
  return keys
}
let _ltxIdx = 0
function nextLTXKey() {
  const keys = getLTXKeys()
  if (!keys.length) return ''
  const key = keys[_ltxIdx % keys.length]
  _ltxIdx++
  return key
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

function getFalKey() {
  return process.env.FAL_KEY || process.env.FAL_API_KEY || ''
}

// ── قوائم النماذج ─────────────────────────────────────────────────────────────
// ملاحظة: حُذفت النماذج الثقيلة التي لا تعمل عبر HF Inference المجاني
// (HunyuanVideo, CogVideoX, Wan 14B, SkyReels) — استُبدلت بـ Open-Sora 2.0
export const T2V_MODELS = [
  // ── LTX Video API (أفضل جودة — يحتاج LTX_API_KEY) ─────────────────────
  { id: 'ltx-fast',    ltxModel: 'ltx-2-3-fast', label: 'LTX Video 2.3 Fast',  badge: 'HD سريع', color: '#06b6d4', tier: 'fast',  provider: 'ltx' },
  { id: 'ltx-pro',     ltxModel: 'ltx-2-3-pro',  label: 'LTX Video 2.3 Pro',   badge: 'جودة 4K', color: '#8b5cf6', tier: 'heavy', provider: 'ltx' },
  // ── Open-Sora 2.0 — مفتوح المصدر (hpcaitech) ────────────────────────────
  { id: 'opensora',    label: 'Open-Sora 2.0 (hpcaitech)', badge: 'مفتوح', color: '#84cc16', tier: 'fast', provider: 'opensora' },
  // ── HuggingFace Inference (مجاني — يعمل دائماً) ─────────────────────────
  { id: 'animatediff', hfId: 'ByteDance/AnimateDiff-Lightning',   label: 'AnimateDiff Lightning', badge: 'GIF',   color: '#f59e0b', tier: 'fast', provider: 'hf' },
  { id: 't2v-ms',      hfId: 'damo-vilab/text-to-video-ms-1.7b',  label: 'ModelScope T2V 1.7B',   badge: 'خفيف',  color: '#10b981', tier: 'fast', provider: 'hf' },
  { id: 'ltx-hf',      hfId: 'Lightricks/LTX-Video',              label: 'LTX-Video (HF)',        badge: 'مجاني', color: '#8b5cf6', tier: 'fast', provider: 'hf' },
]

export const I2V_MODELS = [
  // ── LTX Video API ─────────────────────────────────────────────────────────
  { id: 'ltx-i2v-fast', ltxModel: 'ltx-2-3-fast', label: 'LTX Video 2.3 I2V Fast', badge: 'HD سريع', color: '#06b6d4', tier: 'fast',  provider: 'ltx' },
  { id: 'ltx-i2v-pro',  ltxModel: 'ltx-2-3-pro',  label: 'LTX Video 2.3 I2V Pro',  badge: 'جودة 4K', color: '#8b5cf6', tier: 'heavy', provider: 'ltx' },
  // ── HuggingFace Inference ─────────────────────────────────────────────────
  { id: 'svd',      hfId: 'stabilityai/stable-video-diffusion-img2vid-xt-1-1', label: 'Stable Video Diffusion XT', badge: 'ناعم',   color: '#3b82f6', tier: 'fast', provider: 'hf' },
  { id: 'i2vgen',   hfId: 'ali-vilab/i2vgen-xl',                              label: 'I2VGen-XL',                  badge: 'متوازن', color: '#0891b2', tier: 'fast', provider: 'hf' },
  { id: 'animdiff2',hfId: 'ByteDance/AnimateDiff-Lightning',                  label: 'AnimateDiff Lightning',      badge: 'GIF',    color: '#f59e0b', tier: 'fast', provider: 'hf' },
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

// ════════════════════════════════════════════════════════════════════════════
// LTX Video API — مزوّد رئيسي (synchronous, MP4 مباشر)
// ════════════════════════════════════════════════════════════════════════════

// رفع صورة إلى LTX storage وإرجاع storage_uri
async function ltxUploadImage(imgBuf, contentType = 'image/jpeg', key) {
  try {
    const upRes = await fetch('https://api.ltx.video/v1/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_type: contentType }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!upRes.ok) return null
    const { upload_url, storage_uri } = await upRes.json()
    if (!upload_url || !storage_uri) return null

    // رفع البيانات الثنائية لـ GCS
    const putRes = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'x-goog-content-length-range': '0,104857600',
      },
      body: imgBuf,
      signal: AbortSignal.timeout(30_000),
    })
    if (!putRes.ok) return null
    return storage_uri
  } catch (e) {
    console.warn('[LTX:upload]', e.message)
    return null
  }
}

// LTX v1 Text-to-Video (synchronous — يُرجع MP4 مباشرة)
async function ltxT2V({ prompt, model = 'ltx-2-3-fast', resolution = '1920x1080', duration = 6, fps = 24, key }) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_LTX)
  try {
    const r = await fetch('https://api.ltx.video/v1/text-to-video', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model, duration, resolution, fps }),
      signal: ac.signal,
    })
    clearTimeout(timer)

    if (r.status === 402) { console.warn('[LTX:T2V] رصيد غير كافٍ'); return null }
    if (r.status === 429) { console.warn('[LTX:T2V] rate limit'); return null }
    if (r.status === 422) { console.warn('[LTX:T2V] محتوى مرفوض'); return null }
    if (!r.ok) { console.warn(`[LTX:T2V] HTTP ${r.status}`); return null }

    const ct  = r.headers.get('content-type') || ''
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 1000) { console.warn('[LTX:T2V] ردّ فارغ'); return null }

    const mime = detectMediaType(ct, buf)
    if (!mime) { console.warn('[LTX:T2V] mime غير معروف'); return null }

    console.log(`[LTX:T2V:${model}] ✅ ${(buf.length/1024/1024).toFixed(1)}MB`)
    return { buf, mime, model: `LTX ${model}` }
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') console.warn(`[LTX:T2V] timeout ${TIMEOUT_LTX/1000}s`)
    else console.warn('[LTX:T2V]', e.message)
    return null
  }
}

// LTX v1 Image-to-Video (synchronous)
async function ltxI2V({ imageUri, prompt, model = 'ltx-2-3-fast', resolution = '1920x1080', duration = 6, fps = 24, key }) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_LTX)
  try {
    const body = { prompt, model, duration, resolution, fps, image_uri: imageUri }
    const r = await fetch('https://api.ltx.video/v1/image-to-video', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    })
    clearTimeout(timer)

    if (r.status === 402) { console.warn('[LTX:I2V] رصيد غير كافٍ للـ I2V'); return null }
    if (r.status === 429) { console.warn('[LTX:I2V] rate limit'); return null }
    if (r.status === 422) { console.warn('[LTX:I2V] محتوى مرفوض'); return null }
    if (!r.ok) { console.warn(`[LTX:I2V] HTTP ${r.status}`); return null }

    const ct  = r.headers.get('content-type') || ''
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 1000) return null

    const mime = detectMediaType(ct, buf)
    if (!mime) return null

    console.log(`[LTX:I2V:${model}] ✅ ${(buf.length/1024/1024).toFixed(1)}MB`)
    return { buf, mime, model: `LTX ${model}` }
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') console.warn(`[LTX:I2V] timeout`)
    else console.warn('[LTX:I2V]', e.message)
    return null
  }
}

// LTX v2 Text-to-Video (async — submit + poll, مناسب لـ Vercel timeout)
async function ltxT2VAsync({ prompt, model = 'ltx-2-3-fast', resolution = '1920x1080', duration = 6, fps = 24, key }) {
  const startAt = Date.now()
  try {
    // 1. إرسال الطلب
    const submitRes = await fetch('https://api.ltx.video/v2/text-to-video', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model, duration, resolution, fps }),
      signal: AbortSignal.timeout(15_000),
    })
    if (submitRes.status === 402) { console.warn('[LTX:v2] رصيد غير كافٍ'); return null }
    if (submitRes.status === 429) { console.warn('[LTX:v2] rate limit'); return null }
    if (!submitRes.ok) { console.warn(`[LTX:v2] submit HTTP ${submitRes.status}`); return null }
    const { id } = await submitRes.json()
    if (!id) { console.warn('[LTX:v2] لا يوجد job ID'); return null }
    console.log(`[LTX:v2] job ${id} — polling...`)

    // 2. Polling حتى COMPLETED أو timeout
    while (Date.now() - startAt < LTX_V2_TIMEOUT) {
      await new Promise(r => setTimeout(r, LTX_V2_POLL_INT))
      const pollRes = await fetch(`https://api.ltx.video/v2/text-to-video/${id}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!pollRes.ok) continue
      const job = await pollRes.json()
      const status = job.status || job.state || ''
      if (status === 'completed' || status === 'COMPLETED') {
        const videoUrl = job.url || job.video_url || job.output?.url || ''
        if (!videoUrl) { console.warn('[LTX:v2] لا URL في النتيجة'); return null }
        // تحميل الفيديو
        const vidRes = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) })
        if (!vidRes.ok) return null
        const buf = Buffer.from(await vidRes.arrayBuffer())
        if (buf.length < 1000) return null
        const mime = detectMediaType(vidRes.headers.get('content-type') || 'video/mp4', buf)
        console.log(`[LTX:v2] ✅ ${(buf.length/1024/1024).toFixed(1)}MB في ${((Date.now()-startAt)/1000).toFixed(0)}s`)
        return { buf, mime, model: `LTX ${model}` }
      }
      if (status === 'failed' || status === 'FAILED' || status === 'cancelled') {
        console.warn(`[LTX:v2] job ${status}`)
        return null
      }
      console.log(`[LTX:v2] ... ${status} (${((Date.now()-startAt)/1000).toFixed(0)}s)`)
    }
    console.warn(`[LTX:v2] timeout ${LTX_V2_TIMEOUT/1000}s`)
    return null
  } catch (e) {
    console.warn('[LTX:v2]', e.message)
    return null
  }
}

// ── محاولة LTX T2V بالتدوير بين المفاتيح ─────────────────────────────────────
async function tryLTXTextToVideo(prompt, preferredId, ip) {
  const keys = getLTXKeys()
  if (!keys.length) return null

  // ترتيب النماذج
  let ltxModels = T2V_MODELS.filter(m => m.provider === 'ltx')
  if (preferredId) {
    const pref = ltxModels.find(m => m.id === preferredId)
    if (pref) ltxModels = [pref, ...ltxModels.filter(m => m !== pref)]
  }

  for (const m of ltxModels) {
    const quota = checkVideoQuota(ip)
    const tierKey = m.tier === 'heavy' ? 'heavy' : 'fast'
    if (quota[tierKey].remaining === 0) continue

    const key = nextLTXKey()
    // 1. جرّب v1 synchronous أولاً (أسرع)
    console.log(`[T2V:LTX] v1 ${m.label}...`)
    let result = await ltxT2V({
      prompt, model: m.ltxModel,
      resolution: '1920x1080', duration: 6, fps: 24, key,
    })
    // 2. fallback: v2 async إذا فشل v1 لأسباب غير رصيد
    if (!result) {
      console.log(`[T2V:LTX] v2 async ${m.label}...`)
      result = await ltxT2VAsync({
        prompt, model: m.ltxModel,
        resolution: '1920x1080', duration: 6, fps: 24, key,
      })
    }
    if (result) { consumeQuota(ip, m.tier); return result }
  }
  return null
}

// ── محاولة LTX I2V بالتدوير بين المفاتيح ─────────────────────────────────────
async function tryLTXImageToVideo(imageUri, prompt, preferredId, ip) {
  const keys = getLTXKeys()
  if (!keys.length || !imageUri) return null

  let ltxModels = I2V_MODELS.filter(m => m.provider === 'ltx')
  if (preferredId) {
    const pref = ltxModels.find(m => m.id === preferredId)
    if (pref) ltxModels = [pref, ...ltxModels.filter(m => m !== pref)]
  }

  for (const m of ltxModels) {
    const quota = checkVideoQuota(ip)
    const tierKey = m.tier === 'heavy' ? 'heavy' : 'fast'
    if (quota[tierKey].remaining === 0) continue

    const key = nextLTXKey()

    // إذا كانت الصورة base64، نرفعها أولاً لـ LTX storage
    let uri = imageUri
    if (imageUri.startsWith('data:')) {
      console.log(`[I2V:LTX] رفع الصورة إلى LTX storage...`)
      const mimeMatch = imageUri.match(/data:([^;]+);base64,/)
      const mimeType  = mimeMatch?.[1] || 'image/jpeg'
      const imgBuf    = Buffer.from(imageUri.split(',')[1], 'base64')
      const storageUri = await ltxUploadImage(imgBuf, mimeType, key)
      if (!storageUri) { console.warn('[I2V:LTX] فشل رفع الصورة'); continue }
      uri = storageUri
    } else if (!imageUri.startsWith('http') && !imageUri.startsWith('ltx://')) {
      // URL خارجي — نحمّله ونرفعه
      try {
        const res = await fetch(imageUri, { signal: AbortSignal.timeout(20_000) })
        if (!res.ok) continue
        const imgBuf = Buffer.from(await res.arrayBuffer())
        const ct     = res.headers.get('content-type') || 'image/jpeg'
        const storageUri = await ltxUploadImage(imgBuf, ct, key)
        if (!storageUri) continue
        uri = storageUri
      } catch { continue }
    }

    console.log(`[I2V:LTX] جرّب ${m.label}...`)
    const result = await ltxI2V({
      imageUri: uri, prompt, model: m.ltxModel,
      resolution: '1920x1080', duration: 6, fps: 24, key,
    })
    if (result) { consumeQuota(ip, m.tier); return result }
  }
  return null
}

// ════════════════════════════════════════════════════════════════════════════
// HuggingFace Inference (fallback)
// ════════════════════════════════════════════════════════════════════════════

async function hfInference({ model, token, body, tier = 'fast', binaryBuf = null }) {
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
        const headers = {
          Authorization:      `Bearer ${token}`,
          'x-wait-for-model': 'true',
          'x-use-cache':      'false',
        }
        let fetchBody
        if (binaryBuf) {
          headers['Content-Type'] = 'application/octet-stream'
          fetchBody = binaryBuf
        } else {
          headers['Content-Type'] = 'application/json'
          fetchBody = JSON.stringify(body)
        }

        const r = await fetch(url, { method: 'POST', headers, body: fetchBody, signal: ac.signal })
        clearTimeout(timer)

        if (r.status === 503 || r.status === 504) {
          const estTime = parseInt(r.headers.get('x-estimated-time') || '0', 10)
          const wait    = Math.max(WAIT_RETRY_DELAY, (estTime || 15) * 1000)
          if (attempt < WAIT_RETRY_MAX) {
            console.log(`[HF:${model.split('/')[1]}] تحميل — انتظار ${Math.round(wait/1000)}s (${attempt+1}/${WAIT_RETRY_MAX})`)
            await new Promise(res => setTimeout(res, wait))
            continue
          }
          break
        }
        if (r.status === 402) { console.warn(`[HF:${model.split('/')[1]}] حصة منتهية`); break }
        if (!r.ok) { console.warn(`[HF:${model.split('/')[1]}] HTTP ${r.status}`); break }

        const ct  = r.headers.get('content-type') || ''
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length < 500) { break }

        const mime = detectMediaType(ct, buf)
        if (!mime) { break }

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

function buildT2VBody(model, prompt) {
  const map = {
    'Lightricks/LTX-Video':                  { inputs: prompt, parameters: { num_frames: 25, num_inference_steps: 25, width: 512, height: 288 } },
    'ByteDance/AnimateDiff-Lightning':        { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 4  } },
    'damo-vilab/text-to-video-ms-1.7b':      { inputs: prompt },
    'Wan-AI/Wan2.1-T2V-1.3B':               { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'Skywork/SkyReels-V2-DF-1.3B-540P':      { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'Wan-AI/Wan2.1-T2V-14B-Diffusers':       { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'THUDM/CogVideoX1.5-5B':                 { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, guidance_scale: 6 } },
    'tencent/HunyuanVideo':                  { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, width: 512, height: 288 } },
  }
  return map[model] || { inputs: prompt }
}

function buildI2VBody(model, imgB64, prompt) {
  const map = {
    'stabilityai/stable-video-diffusion-img2vid-xt-1-1': { inputs: imgB64, parameters: { decode_chunk_size: 8, num_frames: 21 } },
    'Lightricks/LTX-Video':                              { inputs: imgB64, parameters: { prompt, num_frames: 25, num_inference_steps: 25 } },
    'ali-vilab/i2vgen-xl':                               { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20 } },
    'ByteDance/AnimateDiff-Lightning':                   { inputs: imgB64, parameters: { prompt, num_frames: 16 } },
    'Wan-AI/Wan2.1-I2V-14B-720P-Diffusers':              { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20 } },
    'THUDM/CogVideoX-5b-I2V':                            { inputs: imgB64, parameters: { prompt, num_frames: 16, num_inference_steps: 20, guidance_scale: 6 } },
  }
  return map[model] || { inputs: imgB64, parameters: prompt ? { prompt } : {} }
}

async function tryHFTextToVideo(prompt, preferredId, ip) {
  const token = nextHFToken()
  if (!token) return null

  let order = T2V_MODELS.filter(m => m.provider === 'hf')
  if (preferredId) {
    const pref = order.find(m => m.id === preferredId || m.hfId === preferredId)
    if (pref) order = [pref, ...order.filter(m => m !== pref)]
  }

  for (const m of order) {
    const quota = checkVideoQuota(ip)
    if (quota[m.tier === 'heavy' ? 'heavy' : 'fast'].remaining === 0) continue
    console.log(`[T2V:HF] جرّب ${m.label}...`)
    const result = await hfInference({ model: m.hfId, token: nextHFToken() || token, body: buildT2VBody(m.hfId, prompt), tier: m.tier })
    if (result) { consumeQuota(ip, m.tier); return result }
  }
  return null
}

async function tryHFImageToVideo(imageUrl, prompt, preferredId, ip) {
  const token = nextHFToken()
  if (!token || !imageUrl) return null

  let imgB64, imgBuf
  if (imageUrl.startsWith('data:')) {
    imgB64 = imageUrl.split(',')[1]
    imgBuf = Buffer.from(imgB64, 'base64')
  } else {
    try {
      const res = await fetch(imageUrl, { signal: AbortSignal.timeout(20_000) })
      if (!res.ok) return null
      imgBuf = Buffer.from(await res.arrayBuffer())
      imgB64 = imgBuf.toString('base64')
    } catch { return null }
  }

  let order = I2V_MODELS.filter(m => m.provider === 'hf')
  if (preferredId) {
    const pref = order.find(m => m.id === preferredId || m.hfId === preferredId)
    if (pref) order = [pref, ...order.filter(m => m !== pref)]
  }

  for (const m of order) {
    const quota = checkVideoQuota(ip)
    if (quota[m.tier === 'heavy' ? 'heavy' : 'fast'].remaining === 0) continue
    console.log(`[I2V:HF] جرّب ${m.label}...`)
    const t = nextHFToken() || token
    if (m.hfId === 'stabilityai/stable-video-diffusion-img2vid-xt-1-1') {
      const r = await hfInference({ model: m.hfId, token: t, body: null, tier: m.tier, binaryBuf: imgBuf })
      if (r) { consumeQuota(ip, m.tier); return r }
    }
    const result = await hfInference({ model: m.hfId, token: t, body: buildI2VBody(m.hfId, imgB64, prompt), tier: m.tier })
    if (result) { consumeQuota(ip, m.tier); return result }
  }
  return null
}

// ── fal.ai (async queue) ──────────────────────────────────────────────────────
async function falInference({ falId, input, tier = 'fast' }) {
  const key = getFalKey()
  if (!key) return null
  const timeoutMs = tier === 'heavy' ? TIMEOUT_HEAVY : TIMEOUT_FAST
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const submitRes = await fetch(`https://queue.fal.run/${falId}`, {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
      signal: ac.signal,
    })
    if (!submitRes.ok) { clearTimeout(timer); return null }
    const { request_id } = await submitRes.json()
    if (!request_id) { clearTimeout(timer); return null }

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 8000))
      const statusRes = await fetch(`https://queue.fal.run/${falId}/requests/${request_id}/status`, {
        headers: { Authorization: `Key ${key}` },
      })
      if (!statusRes.ok) continue
      const st = await statusRes.json()
      if (st.status === 'COMPLETED') {
        const resultRes = await fetch(`https://queue.fal.run/${falId}/requests/${request_id}`, {
          headers: { Authorization: `Key ${key}` },
        })
        if (!resultRes.ok) break
        const result = await resultRes.json()
        const videoUrl = result?.video?.url || result?.output?.video?.url || null
        if (!videoUrl) break
        const vidRes = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) })
        if (!vidRes.ok) break
        const buf = Buffer.from(await vidRes.arrayBuffer())
        const mime = detectMediaType(vidRes.headers.get('content-type') || 'video/mp4', buf)
        clearTimeout(timer)
        return { buf, mime, model: falId }
      }
      if (st.status === 'FAILED' || st.status === 'CANCELLED') break
    }
    clearTimeout(timer)
  } catch (err) {
    clearTimeout(timer)
    console.warn(`[fal.ai:${falId}]`, err.message)
  }
  return null
}

// ── Pollinations Frames (دائماً يعمل — بدون مفتاح) ───────────────────────────
async function pollinationsFrames(prompt, count = 6) {
  const seed = Math.floor(Math.random() * 999999)
  const motionWords = ['beginning', 'early', 'mid', 'late', 'ending', 'final']
  const frames = []
  for (let i = 0; i < count; i++) {
    const fp  = `${prompt}, ${motionWords[i] || 'motion'}, cinematic frame ${i + 1} of ${count}`
    const enc = encodeURIComponent(fp)
    frames.push(`https://image.pollinations.ai/prompt/${enc}?width=768&height=432&seed=${seed + i}&nologo=true&model=flux`)
  }
  try {
    const test = await fetch(frames[0], { signal: AbortSignal.timeout(15_000) })
    if (!test.ok) return null
  } catch { return null }
  return frames
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

  let winner = null

  // 1. LTX Video API (أولوية قصوى — synchronous، 1080p، MP4)
  if (getLTXKeys().length > 0 && checkVideoQuota(ip).fast.remaining > 0) {
    winner = await tryLTXTextToVideo(prompt, preferredModel, ip)
    if (winner) console.log('[T2V] ✅ LTX Video API')
  }

  // 2. Open-Sora 2.0 (Gradio Space — مفتوح المصدر)
  if (!winner && (preferredModel === 'opensora' || !preferredModel)) {
    try {
      const { openSoraTextToVideo } = await import('../open-sora/index.js')
      const result = await openSoraTextToVideo(prompt, { width, height })
      if (result) { winner = result; consumeQuota(ip, 'fast'); console.log('[T2V] ✅ Open-Sora 2.0') }
    } catch (e) { console.warn('[T2V:Open-Sora]', e.message) }
  }

  // 3. fal.ai
  if (!winner && getFalKey()) {
    const result = await falInference({ falId: 'fal-ai/wan-t2v', input: { prompt, num_frames: 16, width: 512, height: 288 }, tier: 'fast' })
    if (result) { winner = result; consumeQuota(ip, 'fast'); console.log('[T2V] ✅ fal.ai') }
  }

  // 4. HuggingFace بالتدوير
  if (!winner && getHFTokens().length > 0) {
    winner = await tryHFTextToVideo(prompt, preferredModel, ip)
    if (winner) console.log('[T2V] ✅ HuggingFace')
  }

  // 4. Pollinations frames (دائماً يعمل)
  if (!winner) {
    console.log('[T2V] Pollinations frames fallback...')
    const frames = await pollinationsFrames(prompt, 6)
    if (frames) {
      consumeQuota(ip, 'fast')
      return {
        ok: true, isFrames: true, frames, url: frames[0],
        prompt, model: 'Pollinations Frames', provider: 'Pollinations AI',
        mimeType: 'image/jpeg', quota: checkVideoQuota(ip),
        note: 'عرض متتالي للإطارات — أضف LTX_API_KEY لفيديو حقيقي 1080p',
      }
    }
  }

  if (!winner) {
    return {
      ok: false,
      error: 'جميع النماذج مشغولة حالياً — حاول مجدداً بعد لحظة.',
      providers: { ltx: getLTXKeys().length, hf: getHFTokens().length, fal: !!getFalKey() },
      quota: checkVideoQuota(ip),
    }
  }

  const id = newId()
  STORE.set(id, { mime: winner.mime, bytes: winner.buf, prompt, model: winner.model, createdAt: Date.now(), type: winner.mime.startsWith('video') ? 'video' : 'gif' })

  return {
    ok: true, id, url: `/api/dz-agent-v4/video/${id}`,
    prompt, model: winner.model,
    bytes: winner.buf.length,
    provider: winner.model.startsWith('LTX') ? 'LTX Video' : winner.model.startsWith('fal') ? 'fal.ai' : 'HuggingFace',
    mimeType: winner.mime, quota: checkVideoQuota(ip),
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

  let winner = null

  // 1. LTX Video API I2V
  if (getLTXKeys().length > 0 && checkVideoQuota(ip).fast.remaining > 0) {
    winner = await tryLTXImageToVideo(imageUrl, prompt, preferredModel, ip)
    if (winner) console.log('[I2V] ✅ LTX Video API')
  }

  // 2. fal.ai
  if (!winner && getFalKey()) {
    const result = await falInference({ falId: 'fal-ai/ltx-video/image-to-video', input: { image_url: imageUrl, prompt, num_frames: 16 }, tier: 'fast' })
    if (result) { winner = result; consumeQuota(ip, 'fast'); console.log('[I2V] ✅ fal.ai') }
  }

  // 3. HuggingFace
  if (!winner && getHFTokens().length > 0) {
    winner = await tryHFImageToVideo(imageUrl, prompt, preferredModel, ip)
    if (winner) console.log('[I2V] ✅ HuggingFace')
  }

  // 4. Pollinations frames
  if (!winner) {
    console.log('[I2V] Pollinations frames fallback...')
    const frames = await pollinationsFrames(`${prompt}, cinematic motion, smooth animation`, 6)
    if (frames) {
      consumeQuota(ip, 'fast')
      return {
        ok: true, isFrames: true, frames, url: frames[0],
        prompt, model: 'Pollinations Frames', provider: 'Pollinations AI',
        mimeType: 'image/jpeg', quota: checkVideoQuota(ip),
        note: 'عرض متتالي للإطارات — أضف LTX_API_KEY لتحريك الصورة حقيقياً',
      }
    }
  }

  if (!winner) {
    return {
      ok: false,
      error: 'جميع النماذج مشغولة حالياً — حاول مجدداً بعد لحظة.',
      providers: { ltx: getLTXKeys().length, hf: getHFTokens().length, fal: !!getFalKey() },
      quota: checkVideoQuota(ip),
    }
  }

  const id = newId()
  STORE.set(id, { mime: winner.mime, bytes: winner.buf, prompt, model: winner.model, createdAt: Date.now(), type: winner.mime.startsWith('video') ? 'video' : 'gif' })

  return {
    ok: true, id, url: `/api/dz-agent-v4/video/${id}`,
    prompt, model: winner.model, bytes: winner.buf.length,
    provider: winner.model.startsWith('LTX') ? 'LTX Video' : winner.model.startsWith('fal') ? 'fal.ai' : 'HuggingFace',
    mimeType: winner.mime, quota: checkVideoQuota(ip),
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
export function getVideo(id)  { return STORE.get(id) || null }

export function videoStats() {
  return {
    cached:        STORE.size,
    totalBytes:    Array.from(STORE.values()).reduce((a, x) => a + (x.bytes?.length || 0), 0),
    ltxKeys:       getLTXKeys().length,
    ltxConfigured: getLTXKeys().length > 0,
    hfTokens:      getHFTokens().length,
    hfConfigured:  getHFTokens().length > 0,
    falConfigured: !!getFalKey(),
    quotaFast:     QUOTA_FAST,
    quotaHeavy:    QUOTA_HEAVY,
    t2vModels:     T2V_MODELS,
    i2vModels:     I2V_MODELS,
  }
}
