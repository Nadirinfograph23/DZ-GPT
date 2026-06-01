// DZ Agent V4 PRO — Video Generation Engine v6
//
// ── مزودون مرتّبون حسب الأولوية:
//   1. fal.ai          — نماذج WanVideo/LTX مستضافة (FAL_KEY اختياري، حصة مجانية)
//   2. HuggingFace     — تدوير آلي بين 10 نماذج (HF_TOKEN اختياري)
//   3. Pollinations    — frame-by-frame بدون أي مفتاح (دائماً يعمل)
//
// ── إصلاحات v6:
//   ✅ x-wait-for-model:true — لا مزيد من 503 بسبب تحميل النموذج
//   ✅ timeout أطول: 150s (fast) / 300s (heavy)
//   ✅ retry أكثر: 5 محاولات
//   ✅ fal.ai provider جديد (WanVideo + LTX مجاناً)
//   ✅ Pollinations frames fallback — يعمل دائماً بلا مفتاح
//   ✅ Binary body لـ I2V (أكثر توافقاً مع HF)

import crypto from 'node:crypto'

const TTL_MS           = 2 * 60 * 60 * 1000
const STORE            = new Map()
const TIMEOUT_FAST     = 150_000   // 150 ثانية
const TIMEOUT_HEAVY    = 300_000   // 5 دقائق
const WAIT_RETRY_MAX   = 5
const WAIT_RETRY_DELAY = 12_000    // 12 ثانية بين المحاولات

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

// ── fal.ai tokens ─────────────────────────────────────────────────────────────
function getFalKey() {
  return process.env.FAL_KEY || process.env.FAL_API_KEY || ''
}

// ── قوائم النماذج ────────────────────────────────────────────────────────────
export const T2V_MODELS = [
  { id: 'ltx',         hfId: 'Lightricks/LTX-Video',                      label: 'LTX Video',      badge: 'سريع',    color: '#8b5cf6', tier: 'fast'  },
  { id: 'animatediff', hfId: 'ByteDance/AnimateDiff-Lightning',           label: 'AnimateDiff',    badge: 'GIF',     color: '#f59e0b', tier: 'fast'  },
  { id: 't2v-ms',      hfId: 'damo-vilab/text-to-video-ms-1.7b',          label: 'ModelScope T2V', badge: 'خفيف',    color: '#84cc16', tier: 'fast'  },
  { id: 'wan2',        hfId: 'Wan-AI/Wan2.1-T2V-1.3B',                   label: 'Wan 2.1 Fast',   badge: 'سريع',    color: '#10b981', tier: 'fast'  },
  { id: 'skyreels',    hfId: 'Skywork/SkyReels-V2-DF-1.3B-540P',         label: 'SkyReels V2',    badge: 'جديد',    color: '#0ea5e9', tier: 'fast'  },
  { id: 'wan2-14b',    hfId: 'Wan-AI/Wan2.1-T2V-14B-Diffusers',          label: 'Wan 2.1 Pro',    badge: 'جودة',    color: '#06b6d4', tier: 'heavy' },
  { id: 'cogvideo',    hfId: 'THUDM/CogVideoX1.5-5B',                     label: 'CogVideoX 5B',   badge: 'HD',      color: '#6366f1', tier: 'heavy' },
  { id: 'hunyuan',     hfId: 'tencent/HunyuanVideo',                      label: 'HunyuanVideo',   badge: 'احترافي', color: '#ec4899', tier: 'heavy' },
  { id: 'mochi',       hfId: 'genmo/mochi-1-preview',                     label: 'Mochi 1',        badge: 'إبداعي',  color: '#a855f7', tier: 'heavy' },
  { id: 'opensora',    hfId: 'hpcai-tech/Open-Sora',                      label: 'Open-Sora 2',    badge: 'مفتوح',   color: '#f97316', tier: 'heavy' },
]

export const I2V_MODELS = [
  { id: 'svd',           hfId: 'stabilityai/stable-video-diffusion-img2vid-xt-1-1', label: 'SVD XT 1.1',    badge: 'ناعم',   color: '#3b82f6', tier: 'fast'  },
  { id: 'ltx-i2v',       hfId: 'Lightricks/LTX-Video',                              label: 'LTX I2V',       badge: 'سريع',   color: '#8b5cf6', tier: 'fast'  },
  { id: 'i2vgen',        hfId: 'ali-vilab/i2vgen-xl',                               label: 'I2VGen-XL',     badge: 'متوازن', color: '#0891b2', tier: 'fast'  },
  { id: 'animdiff2',     hfId: 'ByteDance/AnimateDiff-Lightning',                   label: 'AnimateDiff',   badge: 'GIF',    color: '#f59e0b', tier: 'fast'  },
  { id: 'wan-i2v',       hfId: 'Wan-AI/Wan2.1-I2V-14B-720P-Diffusers',              label: 'Wan 2.1 I2V',   badge: 'جودة',   color: '#10b981', tier: 'heavy' },
  { id: 'cogvideo-i2v',  hfId: 'THUDM/CogVideoX-5b-I2V',                            label: 'CogVideoX I2V', badge: 'HD',     color: '#6366f1', tier: 'heavy' },
]

// fal.ai model map
const FAL_T2V_MODELS = [
  { id: 'fal-ltx',  falId: 'fal-ai/ltx-video',            label: 'LTX Video (fal)',    tier: 'fast'  },
  { id: 'fal-wan',  falId: 'fal-ai/wan-t2v',              label: 'WanVideo T2V (fal)', tier: 'fast'  },
  { id: 'fal-kling',falId: 'fal-ai/kling-video/v1.6/standard/text-to-video', label: 'Kling 1.6 (fal)', tier: 'heavy' },
]

const FAL_I2V_MODELS = [
  { id: 'fal-ltx-i2v', falId: 'fal-ai/ltx-video/image-to-video', label: 'LTX I2V (fal)',    tier: 'fast'  },
  { id: 'fal-wan-i2v',  falId: 'fal-ai/wan-i2v',                  label: 'WanVideo I2V (fal)', tier: 'fast' },
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

// ── HF Inference — مع x-wait-for-model:true ──────────────────────────────────
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
        // إصلاح v6: x-wait-for-model:true يلغي 503 بسبب التحميل
        const headers = {
          Authorization:       `Bearer ${token}`,
          'x-wait-for-model':  'true',
          'x-use-cache':       'false',
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
            console.log(`[HF:${model.split('/')[1]}] قيد التحميل — انتظار ${Math.round(wait/1000)}s (${attempt+1}/${WAIT_RETRY_MAX})`)
            await new Promise(res => setTimeout(res, wait))
            continue
          }
          break
        }
        if (r.status === 402) { console.warn(`[HF:${model.split('/')[1]}] حصة منتهية`); break }
        if (!r.ok) { console.warn(`[HF:${model.split('/')[1]}] HTTP ${r.status}`); break }

        const ct  = r.headers.get('content-type') || ''
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length < 500) { console.warn(`[HF:${model.split('/')[1]}] ردّ قصير جداً (${buf.length}b)`); break }

        const mime = detectMediaType(ct, buf)
        if (!mime) { console.warn(`[HF:${model.split('/')[1]}] mime غير معروف: ${ct}`); break }

        console.log(`[HF:${model.split('/')[1]}] ✅ ${mime} — ${buf.length.toLocaleString()} bytes`)
        return { buf, mime, model }
      } catch (err) {
        clearTimeout(timer)
        if (err.name === 'AbortError') { console.warn(`[HF:${model.split('/')[1]}] timeout بعد ${timeoutMs/1000}s`); break }
        console.warn(`[HF:${model.split('/')[1]}] خطأ:`, err.message)
        break
      }
    }
  }
  return null
}

// ── fal.ai Inference ──────────────────────────────────────────────────────────
async function falInference({ falId, input, tier = 'fast' }) {
  const key = getFalKey()
  if (!key) return null
  const timeoutMs = tier === 'heavy' ? TIMEOUT_HEAVY : TIMEOUT_FAST
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    // fal.ai async queue
    const submitRes = await fetch(`https://queue.fal.run/${falId}`, {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
      signal: ac.signal,
    })
    if (!submitRes.ok) { clearTimeout(timer); return null }
    const { request_id } = await submitRes.json()
    if (!request_id) { clearTimeout(timer); return null }

    // poll for result
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
        // Download the video
        const vidRes = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) })
        if (!vidRes.ok) break
        const buf = Buffer.from(await vidRes.arrayBuffer())
        const mime = detectMediaType(vidRes.headers.get('content-type') || 'video/mp4', buf)
        clearTimeout(timer)
        console.log(`[fal.ai:${falId.split('/')[1]}] ✅ ${mime} — ${buf.length.toLocaleString()} bytes`)
        return { buf, mime, model: falId }
      }
      if (st.status === 'FAILED' || st.status === 'CANCELLED') break
      console.log(`[fal.ai:${falId.split('/')[1]}] حالة: ${st.status} (${i+1}/30)`)
    }
    clearTimeout(timer)
  } catch (err) {
    clearTimeout(timer)
    console.warn(`[fal.ai:${falId}] خطأ:`, err.message)
  }
  return null
}

// ── Pollinations Frames Fallback (بدون API key — دائماً يعمل) ─────────────────
async function pollinationsFrames(prompt, count = 5) {
  const seed = Math.floor(Math.random() * 999999)
  const motionWords = ['starting', 'moving', 'flowing', 'transforming', 'ending']
  const frames = []
  for (let i = 0; i < count; i++) {
    const framePrompt = `${prompt}, ${motionWords[i] || 'motion'}, cinematic frame ${i + 1} of ${count}`
    const enc = encodeURIComponent(framePrompt)
    frames.push(`https://image.pollinations.ai/prompt/${enc}?width=768&height=432&seed=${seed + i}&nologo=true&model=flux`)
  }
  // اختبار أول frame
  try {
    const test = await fetch(frames[0], { signal: AbortSignal.timeout(15_000) })
    if (!test.ok) return null
  } catch { return null }
  return frames
}

// ── بناء body النماذج ─────────────────────────────────────────────────────────
function buildT2VBody(model, prompt) {
  const map = {
    'Lightricks/LTX-Video':                  { inputs: prompt, parameters: { num_frames: 25, num_inference_steps: 25, width: 512, height: 288 } },
    'ByteDance/AnimateDiff-Lightning':        { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 4  } },
    'damo-vilab/text-to-video-ms-1.7b':      { inputs: prompt },
    'Wan-AI/Wan2.1-T2V-1.3B':               { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'Wan-AI/Wan2.1-T2V-14B-Diffusers':       { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'THUDM/CogVideoX1.5-5B':                 { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, guidance_scale: 6 } },
    'tencent/HunyuanVideo':                  { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, width: 512, height: 288 } },
    'Skywork/SkyReels-V2-DF-1.3B-540P':      { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20 } },
    'hpcai-tech/Open-Sora':                  { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 20, width: 512, height: 288 } },
    'genmo/mochi-1-preview':                 { inputs: prompt, parameters: { num_frames: 16, num_inference_steps: 64, guidance_scale: 4.5 } },
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

// ── HF T2V بالتدوير ──────────────────────────────────────────────────────────
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
      console.log(`[T2V] حصة ${m.tier} انتهت — تخطي ${m.label}`)
      continue
    }
    console.log(`[T2V:HF] جرّب ${m.label}...`)
    const t      = nextHFToken() || token
    const result = await hfInference({ model: m.hfId, token: t, body: buildT2VBody(m.hfId, prompt), tier: m.tier })
    if (result) { consumeQuota(ip, m.tier); return result }
  }
  return null
}

// ── fal.ai T2V ───────────────────────────────────────────────────────────────
async function tryFalTextToVideo(prompt, ip) {
  if (!getFalKey()) return null
  for (const m of FAL_T2V_MODELS) {
    const quota = checkVideoQuota(ip)
    const tierKey = m.tier === 'heavy' ? 'heavy' : 'fast'
    if (quota[tierKey].remaining === 0) continue
    console.log(`[T2V:fal] جرّب ${m.label}...`)
    const result = await falInference({
      falId: m.falId,
      input: { prompt, num_frames: 16, width: 512, height: 288 },
      tier: m.tier,
    })
    if (result) { consumeQuota(ip, m.tier); return result }
  }
  return null
}

// ── HF I2V بالتدوير ──────────────────────────────────────────────────────────
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

  let order = [...I2V_MODELS]
  if (preferredId) {
    const pref = order.find(m => m.id === preferredId || m.hfId === preferredId)
    if (pref) order = [pref, ...order.filter(m => m !== pref)]
  }

  for (const m of order) {
    const quota = checkVideoQuota(ip)
    const tierKey = m.tier === 'heavy' ? 'heavy' : 'fast'
    if (quota[tierKey].remaining === 0) continue

    console.log(`[I2V:HF] جرّب ${m.label}...`)
    const t = nextHFToken() || token

    // SVD يستقبل binary أفضل — جرّب الاثنين
    if (m.hfId === 'stabilityai/stable-video-diffusion-img2vid-xt-1-1') {
      const rBin = await hfInference({ model: m.hfId, token: t, body: null, tier: m.tier, binaryBuf: imgBuf })
      if (rBin) { consumeQuota(ip, m.tier); return rBin }
    }
    const result = await hfInference({ model: m.hfId, token: t, body: buildI2VBody(m.hfId, imgB64, prompt), tier: m.tier })
    if (result) { consumeQuota(ip, m.tier); return result }
  }
  return null
}

// ── fal.ai I2V ───────────────────────────────────────────────────────────────
async function tryFalImageToVideo(imageUrl, prompt, ip) {
  if (!getFalKey()) return null
  for (const m of FAL_I2V_MODELS) {
    const quota = checkVideoQuota(ip)
    const tierKey = m.tier === 'heavy' ? 'heavy' : 'fast'
    if (quota[tierKey].remaining === 0) continue
    console.log(`[I2V:fal] جرّب ${m.label}...`)
    const result = await falInference({
      falId: m.falId,
      input: { image_url: imageUrl, prompt, num_frames: 16 },
      tier: m.tier,
    })
    if (result) { consumeQuota(ip, m.tier); return result }
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

  // 1. fal.ai (أولوية عالية إذا متوفر)
  let winner = null
  if (getFalKey()) {
    winner = await tryFalTextToVideo(prompt, ip)
    if (winner) console.log('[T2V] ✅ fal.ai نجح')
  }

  // 2. HuggingFace بالتدوير
  if (!winner && getHFTokens().length > 0) {
    winner = await tryHFTextToVideo(prompt, preferredModel, ip)
    if (winner) console.log('[T2V] ✅ HuggingFace نجح')
  }

  // 3. Pollinations frames fallback — يعمل دائماً بلا مفتاح
  if (!winner) {
    console.log('[T2V] جرّب Pollinations frames fallback...')
    const frames = await pollinationsFrames(prompt, 6)
    if (frames) {
      const quota = checkVideoQuota(ip)
      consumeQuota(ip, 'fast')
      return {
        ok: true, isFrames: true,
        frames, url: frames[0],
        prompt, model: 'Pollinations Frames',
        provider: 'Pollinations AI',
        mimeType: 'image/jpeg',
        quota: checkVideoQuota(ip),
        note: 'عرض متتالي لإطارات الفيديو — أضف HF_TOKEN أو FAL_KEY لفيديو حقيقي',
      }
    }
  }

  if (!winner) {
    return {
      ok: false,
      error: 'تعذّر توليد الفيديو الآن — النماذج مشغولة. سيُعاد المحاولة تلقائياً.',
      providers: {
        hf: getHFTokens().length,
        fal: !!getFalKey(),
      },
      quota: checkVideoQuota(ip),
    }
  }

  const id = newId()
  STORE.set(id, {
    mime: winner.mime, bytes: winner.buf,
    prompt, model: winner.model,
    createdAt: Date.now(),
    type: winner.mime.startsWith('video') ? 'video' : 'gif',
  })

  return {
    ok: true, id,
    url:      `/api/dz-agent-v4/video/${id}`,
    prompt, model: winner.model,
    bytes:    winner.buf.length,
    provider: getFalKey() && winner.model.startsWith('fal') ? 'fal.ai' : 'HuggingFace',
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

  // 1. fal.ai (أولوية عالية إذا متوفر)
  let winner = null
  if (getFalKey()) {
    winner = await tryFalImageToVideo(imageUrl, prompt, ip)
    if (winner) console.log('[I2V] ✅ fal.ai نجح')
  }

  // 2. HuggingFace بالتدوير
  if (!winner && getHFTokens().length > 0) {
    winner = await tryHFImageToVideo(imageUrl, prompt, preferredModel, ip)
    if (winner) console.log('[I2V] ✅ HuggingFace نجح')
  }

  // 3. Pollinations frames fallback
  if (!winner) {
    console.log('[I2V] جرّب Pollinations frames fallback...')
    const animPrompt = `${prompt}, cinematic motion, smooth animation`
    const frames = await pollinationsFrames(animPrompt, 6)
    if (frames) {
      consumeQuota(ip, 'fast')
      return {
        ok: true, isFrames: true,
        frames, url: frames[0],
        prompt, model: 'Pollinations Frames',
        provider: 'Pollinations AI',
        mimeType: 'image/jpeg',
        quota: checkVideoQuota(ip),
        note: 'عرض متتالي للإطارات — أضف HF_TOKEN أو FAL_KEY لتحريك الصورة حقيقياً',
      }
    }
  }

  if (!winner) {
    return {
      ok: false,
      error: 'تعذّر تحريك الصورة الآن — النماذج مشغولة. سيُعاد المحاولة تلقائياً.',
      providers: {
        hf: getHFTokens().length,
        fal: !!getFalKey(),
      },
      quota: checkVideoQuota(ip),
    }
  }

  const id = newId()
  STORE.set(id, {
    mime: winner.mime, bytes: winner.buf,
    prompt, model: winner.model,
    createdAt: Date.now(),
    type: winner.mime.startsWith('video') ? 'video' : 'gif',
  })

  return {
    ok: true, id,
    url:      `/api/dz-agent-v4/video/${id}`,
    prompt, model: winner.model,
    bytes:    winner.buf.length,
    provider: getFalKey() && winner.model.startsWith('fal') ? 'fal.ai' : 'HuggingFace',
    mimeType: winner.mime,
    quota:    checkVideoQuota(ip),
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
export function getVideo(id)   { return STORE.get(id) || null }

export function videoStats() {
  return {
    cached:        STORE.size,
    totalBytes:    Array.from(STORE.values()).reduce((a, x) => a + (x.bytes?.length || 0), 0),
    hfTokens:      getHFTokens().length,
    hfConfigured:  getHFTokens().length > 0,
    falConfigured: !!getFalKey(),
    quotaFast:     QUOTA_FAST,
    quotaHeavy:    QUOTA_HEAVY,
    t2vModels:     T2V_MODELS,
    i2vModels:     I2V_MODELS,
    falT2vModels:  FAL_T2V_MODELS,
    falI2vModels:  FAL_I2V_MODELS,
  }
}
