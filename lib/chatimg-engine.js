/**
 * lib/chatimg-engine.js
 * محرك توليد الصور — DZ MEDIA
 * مزودون متعددون مع تدوير anti-block تلقائي
 */

import crypto from 'node:crypto'

// ── Anti-block headers ────────────────────────────────────────────────────────
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:123.0) Gecko/20100101 Firefox/123.0',
]
const REFERERS = [
  'https://www.google.com/',
  'https://www.bing.com/',
  'https://duckduckgo.com/',
  'https://images.google.com/',
]
function rUA()  { return UA_POOL[Math.floor(Math.random() * UA_POOL.length)] }
function rRef() { return REFERERS[Math.floor(Math.random() * REFERERS.length)] }

function antiBlockHeaders(extra = {}) {
  return {
    'User-Agent':      rUA(),
    'Accept':          'image/webp,image/png,image/*,*/*;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
    'Referer':         rRef(),
    'Sec-Fetch-Dest':  'image',
    'Sec-Fetch-Mode':  'no-cors',
    'DNT':             '1',
    ...extra,
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }
function jitter(base, spread = 0.3) {
  return Math.round(base * (1 + (Math.random() - 0.5) * spread))
}

// ── In-memory result store (TTL 2h) ──────────────────────────────────────────
const STORE  = new Map()
const TTL_MS = 2 * 60 * 60 * 1000

export function gcStore() {
  const cut = Date.now() - TTL_MS
  for (const [k, v] of STORE) if (v.ts < cut) STORE.delete(k)
}

function storeResult(buf, mime, meta = {}) {
  const id = `dzmedia_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
  STORE.set(id, { buf, mime, ts: Date.now(), ...meta })
  gcStore()
  return id
}

export function getStoredResult(id) { return STORE.get(id) || null }

// ── Rate limiter ──────────────────────────────────────────────────────────────
const RATE       = new Map()
const RATE_LIMIT = 30
const RATE_WIN   = 60 * 60 * 1000

export function checkRate(ip) {
  const now = Date.now()
  let e = RATE.get(ip)
  if (!e || now >= e.reset) e = { count: 0, reset: now + RATE_WIN }
  return {
    ok: e.count < RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - e.count),
    limit: RATE_LIMIT,
    resetInMin: Math.ceil((e.reset - now) / 60_000),
  }
}
export function consumeRate(ip) {
  const now = Date.now()
  let e = RATE.get(ip)
  if (!e || now >= e.reset) e = { count: 0, reset: now + RATE_WIN }
  e.count++
  RATE.set(ip, e)
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER A: DZ MEDIA PRO — Gemini (نموذج الجودة العالية)
// ═══════════════════════════════════════════════════════════════════════════════
async function tryGemini(prompt, width, height) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || ''
  if (!key) return null

  const ratio = width > height ? '16:9' : width < height ? '9:16' : '1:1'
  const models = [
    'gemini-2.0-flash-preview-image-generation',
    'gemini-2.5-flash-preview-05-20',
  ]

  for (const model of models) {
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), 50_000)
    try {
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          ...(model !== 'gemini-2.0-flash-preview-image-generation'
            ? { imageConfig: { aspectRatio: ratio } }
            : {}),
        },
      }
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal }
      )
      if (!r.ok) { const t = await r.text().catch(() => ''); console.warn(`[dzmedia:pro-a/${model}] ${r.status} — ${t.slice(0,100)}`); continue }
      const data  = await r.json()
      const parts = data?.candidates?.[0]?.content?.parts || []
      for (const p of parts) {
        if (p?.inlineData?.data) {
          const buf  = Buffer.from(p.inlineData.data, 'base64')
          const mime = p.inlineData.mimeType || 'image/png'
          if (buf.length > 2000) {
            console.log(`[dzmedia:pro-a] ✅ ${buf.length.toLocaleString()} bytes`)
            return { buf, mime, model: 'Gemini 2.0 Flash Image', provider: 'DZ MEDIA PRO' }
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`[dzmedia:pro-a/${model}]`, e.message)
    } finally { clearTimeout(timer) }
    await delay(jitter(800))
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER B: DZ MEDIA — HuggingFace FLUX
// ═══════════════════════════════════════════════════════════════════════════════
const HF_IMAGE_MODELS = [
  'black-forest-labs/FLUX.1-schnell',
  'black-forest-labs/FLUX.1-dev',
  'stabilityai/stable-diffusion-3.5-large',
  'SG161222/RealVisXL_V4.0',
]

async function tryHuggingFace(prompt, width, height) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  if (!token) return null

  for (const model of HF_IMAGE_MODELS) {
    const url   = `https://router.huggingface.co/hf-inference/models/${model}`
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), 45_000)
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept:         'image/png',
          'x-use-cache':  'false',
          ...antiBlockHeaders(),
        },
        body: JSON.stringify({ inputs: prompt, parameters: { width, height, num_inference_steps: 25 } }),
        signal: ac.signal,
      })
      if (r.ok) {
        const ct  = r.headers.get('content-type') || 'image/png'
        const buf = Buffer.from(await r.arrayBuffer())
        if (ct.startsWith('image/') && buf.length > 2000) {
          console.log(`[dzmedia:b/${model.split('/')[1]}] ✅ ${buf.length.toLocaleString()} bytes`)
          return { buf, mime: ct, model: 'FLUX.1-schnell (HF)', provider: 'DZ MEDIA' }
        }
      } else {
        console.warn(`[dzmedia:b/${model.split('/')[1]}] HTTP ${r.status}`)
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`[dzmedia:b/${model.split('/')[1]}]`, e.message)
    } finally { clearTimeout(timer) }
    await delay(jitter(500))
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER C: DZ MEDIA BASIC — Pollinations (دائماً مجاني)
// ═══════════════════════════════════════════════════════════════════════════════
const POLL_MODELS = ['flux', 'flux-realism', 'turbo', 'flux-anime', 'flux-3d']

async function tryPollinations(prompt, width, height, modelHint = 'flux', attempt = 0) {
  const seed  = Math.floor(Math.random() * 9_000_000) + attempt * 7919
  const nonce = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`

  const models = modelHint !== 'flux'
    ? [modelHint, ...POLL_MODELS.filter(m => m !== modelHint)]
    : POLL_MODELS

  for (const model of models) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
      + `?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false&private=true&_n=${nonce}`
    const ac    = new AbortController()
    const timer = setTimeout(() => ac.abort(), 35_000)
    try {
      const r  = await fetch(url, { headers: antiBlockHeaders(), signal: ac.signal, redirect: 'follow' })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && ct.startsWith('image/')) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 2000) {
          console.log(`[dzmedia:basic/${model}] ✅ ${buf.length.toLocaleString()} bytes`)
          return { buf, mime: ct, model: 'FLUX (Pollinations)', provider: 'DZ MEDIA BASIC' }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`[dzmedia:basic/${model}]`, e.message)
    } finally { clearTimeout(timer) }
    await delay(jitter(300))
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER D: DZ MEDIA PRO — OpenRouter Vision
// ═══════════════════════════════════════════════════════════════════════════════
async function tryOpenRouter(prompt, width, height) {
  const key = process.env.OPENROUTER_API_KEY || ''
  if (!key) return null

  const size = width >= height ? '1024x1024' : '1024x1792'
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), 60_000)
  try {
    const r = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dz-gpt.vercel.app',
        'X-Title':      'DZ MEDIA',
        ...antiBlockHeaders({ Accept: 'application/json' }),
      },
      body: JSON.stringify({ model: 'openai/gpt-image-1', prompt, n: 1, size, response_format: 'b64_json' }),
      signal: ac.signal,
    })
    if (r.ok) {
      const data = await r.json()
      const b64  = data?.data?.[0]?.b64_json
      if (b64) {
        const buf = Buffer.from(b64, 'base64')
        if (buf.length > 2000) {
          console.log(`[dzmedia:pro-d] ✅ ${buf.length.toLocaleString()} bytes`)
          return { buf, mime: 'image/png', model: 'GPT Image 2', provider: 'DZ MEDIA PRO' }
        }
      }
    } else {
      console.warn(`[dzmedia:pro-d] HTTP ${r.status}`)
    }
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('[dzmedia:pro-d]', e.message)
  } finally { clearTimeout(timer) }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: generateWithChatIMG — waterfall تلقائي مع fallback
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateWithChatIMG(prompt, {
  width          = 768,
  height         = 768,
  preferredModel = 'auto',
  ip             = 'anon',
} = {}) {
  const enhanced = prompt.trim()
  if (!enhanced) throw new Error('prompt مطلوب')

  const rate = checkRate(ip)
  if (!rate.ok) {
    return { ok: false, rateLimited: true, error: `تجاوزت الحصة (${RATE_LIMIT}/ساعة) — جرب بعد ${rate.resetInMin} دقيقة` }
  }

  try {
    let result = null

    if (preferredModel === 'gpt-image-2') {
      result = await tryOpenRouter(enhanced, width, height)
        || await tryGemini(enhanced, width, height)
    } else if (preferredModel === 'nano-banana') {
      result = await tryGemini(enhanced, width, height)
        || await tryOpenRouter(enhanced, width, height)
    } else if (preferredModel === 'hf') {
      result = await tryHuggingFace(enhanced, width, height)
        || await tryPollinations(enhanced, width, height, 'flux')
    } else if (['flux','turbo','flux-realism','flux-anime'].includes(preferredModel)) {
      result = await tryPollinations(enhanced, width, height, preferredModel)
        || await tryGemini(enhanced, width, height)
    } else if (['flux-schnell','flux-dev','sd35-large','realvisxl'].includes(preferredModel)) {
      result = await tryHuggingFace(enhanced, width, height)
        || await tryPollinations(enhanced, width, height, 'flux')
    } else {
      // Auto: race الأسرع
      const race = await Promise.any([
        tryGemini(enhanced, width, height).then(r => { if (!r) throw new Error('null'); return r }),
        tryPollinations(enhanced, width, height, 'flux').then(r => { if (!r) throw new Error('null'); return r }),
      ]).catch(() => null)

      if (race) result = race
      else {
        result = await tryHuggingFace(enhanced, width, height)
          || await tryOpenRouter(enhanced, width, height)
          || await tryPollinations(enhanced, width, height, 'turbo')
      }
    }

    if (!result) {
      return { ok: false, error: 'فشلت جميع المزودين — حاول مجدداً أو جرّب وصفاً مختلفاً' }
    }

    const id = storeResult(result.buf, result.mime, { prompt: enhanced, model: result.model, provider: result.provider })
    consumeRate(ip)

    return {
      ok:         true,
      url:        `/api/chatimg/img/${id}`,
      model:      result.model,
      provider:   result.provider,
      promptUsed: enhanced,
      bytes:      result.buf.length,
      rate:       checkRate(ip),
    }
  } catch (e) {
    console.error('[dzmedia-engine]', e.message)
    return { ok: false, error: e.message }
  }
}

// ── قائمة النماذج المعروضة ────────────────────────────────────────────────────
export const CHATIMG_MODELS = [
  { id: 'auto',        label: '🤖 Auto (Gemini + FLUX)',   badge: 'AUTO',  tier: 'fast',    group: 'DZ MEDIA',       desc: 'أسرع مزود متاح تلقائياً' },
  { id: 'nano-banana', label: '🍌 Gemini 2.0 Flash Image', badge: 'PRO',   tier: 'fast',    group: 'DZ MEDIA PRO',   desc: 'جودة 4K عالية مجاناً' },
  { id: 'gpt-image-2', label: '🤖 GPT Image 2',            badge: 'PRO',   tier: 'premium', group: 'DZ MEDIA PRO',   desc: 'نموذج الرؤية المتقدم' },
  { id: 'hf',          label: '⚡ FLUX.1-schnell (HF)',     badge: 'FAST',  tier: 'fast',    group: 'DZ MEDIA',       desc: 'سريع ومجاني' },
]
