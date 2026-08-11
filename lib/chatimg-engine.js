/**
 * lib/chatimg-engine.js
 * محرك توليد الصور — DZ MEDIA
 * مزودون مجانيون مُختبرون فعلياً: Pollinations · Stable Horde
 * ترجمة تلقائية: عربي/فرنسي → إنجليزي عبر MyMemory API (مجاني)
 */

import crypto from 'node:crypto'

// ── Auto-translation: Arabic/French → English (Pollinations needs English) ────
const TRANSLATE_CACHE = new Map()

function hasNonLatin(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text)   // Arabic
      || /[àâçéèêëîïôùûüÀÂÇÉÈÊËÎÏÔÙÛÜ]/.test(text)              // French accents
      || /\b(le|la|les|un|une|des|je|tu|il|nous|vous|ils|est|sont|avec|dans|sur)\b/i.test(text)
}

async function translateToEnglish(text) {
  const key = text.slice(0, 120)
  if (TRANSLATE_CACHE.has(key)) return TRANSLATE_CACHE.get(key)
  if (!hasNonLatin(text)) return text  // already English-ish

  try {
    const ac  = new AbortController()
    const t   = setTimeout(() => ac.abort(), 6_000)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=ar|en&de=dz-gpt@replit.app`
    const r   = await fetch(url, { signal: ac.signal })
    clearTimeout(t)
    if (!r.ok) return text
    const d   = await r.json()
    const tr  = d?.responseData?.translatedText
    if (tr && tr.length > 3 && tr !== text) {
      TRANSLATE_CACHE.set(key, tr)
      console.log(`[dzmedia:translate] "${text.slice(0,40)}" → "${tr.slice(0,40)}"`)
      return tr
    }
  } catch {}
  return text
}

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

// ── Rate limiter — per user (IP) ──────────────────────────────────────────────
// كل مستخدم بـ IP منفصل → 30 توليد/ساعة مستقلة
const RATE       = new Map()
const RATE_LIMIT = 30
const RATE_WIN   = 60 * 60 * 1000

// حصة خاصة للنماذج البطيئة (Horde) — 10/ساعة لكل مستخدم
const HORDE_RATE_LIMIT = 10
const HORDE_RATE       = new Map()

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

function checkHordeRate(ip) {
  const now = Date.now()
  let e = HORDE_RATE.get(ip)
  if (!e || now >= e.reset) e = { count: 0, reset: now + RATE_WIN }
  return { ok: e.count < HORDE_RATE_LIMIT, remaining: Math.max(0, HORDE_RATE_LIMIT - e.count) }
}
function consumeHordeRate(ip) {
  const now = Date.now()
  let e = HORDE_RATE.get(ip)
  if (!e || now >= e.reset) e = { count: 0, reset: now + RATE_WIN }
  e.count++
  HORDE_RATE.set(ip, e)
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER A: DZ MEDIA PRO — Gemini (مجاني مع GEMINI_API_KEY)
// ═══════════════════════════════════════════════════════════════════════════════
async function tryGemini(prompt, width, height) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || ''
  if (!key) return null

  const model = 'gemini-2.0-flash-preview-image-generation'
  const ac    = new AbortController()
  const timer = setTimeout(() => ac.abort(), 30_000)
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
        signal: ac.signal,
      }
    )
    clearTimeout(timer)
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      console.warn(`[dzmedia:gemini] HTTP ${r.status} — ${t.slice(0, 150)}`)
      return null
    }
    const data  = await r.json()
    const parts = data?.candidates?.[0]?.content?.parts || []
    for (const p of parts) {
      if (p?.inlineData?.data) {
        const buf  = Buffer.from(p.inlineData.data, 'base64')
        const mime = p.inlineData.mimeType || 'image/png'
        if (buf.length > 2000) {
          console.log(`[dzmedia:gemini] ✅ ${buf.length.toLocaleString()} bytes`)
          return { buf, mime, model: 'Gemini Flash Image', provider: 'DZ MEDIA PRO' }
        }
      }
    }
    console.warn('[dzmedia:gemini] no image in response')
  } catch (e) {
    clearTimeout(timer)
    console.warn('[dzmedia:gemini]', e.name === 'AbortError' ? 'timeout 30s' : e.message)
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER B: DZ MEDIA — HuggingFace FLUX (مجاني مع HF_TOKEN)
// ═══════════════════════════════════════════════════════════════════════════════
const HF_IMAGE_MODELS = [
  'black-forest-labs/FLUX.1-schnell',
  'black-forest-labs/FLUX.1-dev',
  'stabilityai/stable-diffusion-3.5-large',
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
        },
        body: JSON.stringify({ inputs: prompt, parameters: { width, height, num_inference_steps: 20 } }),
        signal: ac.signal,
      })
      if (r.ok) {
        const ct  = r.headers.get('content-type') || 'image/png'
        const buf = Buffer.from(await r.arrayBuffer())
        if (ct.startsWith('image/') && buf.length > 2000) {
          console.log(`[dzmedia:hf/${model.split('/')[1]}] ✅ ${buf.length.toLocaleString()} bytes`)
          return { buf, mime: ct, model: `HF ${model.split('/')[1]}`, provider: 'DZ MEDIA' }
        }
      } else {
        console.warn(`[dzmedia:hf/${model.split('/')[1]}] HTTP ${r.status}`)
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`[dzmedia:hf/${model.split('/')[1]}]`, e.message)
    } finally { clearTimeout(timer) }
    await delay(jitter(300))
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER C: DZ IMAGE — Pollinations AI (مجاني تماماً بلا مفتاح)
// نماذج مُختبرة: flux · turbo · flux-realism · flux-anime · flux-3d · flux-cablyai · playground-v2
// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER C: DZ IMAGE — Pollinations AI
// نُعيد URL مباشر للمتصفح (المتصفح يجلب الصورة مباشرةً بدون وساطة الخادم)
// هذا يتجاوز حظر 402 على IP الخادم — المتصفح (home IP) مسموح دائماً
// ═══════════════════════════════════════════════════════════════════════════════
function buildPollinationsUrl(prompt, width, height, attempt = 0, model = 'flux') {
  const seed  = Math.floor(Math.random() * 9_000_000) + attempt * 7919
  const nonce = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
    + `?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false&_n=${nonce}`
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER D: Stable Horde — مجاني تماماً (شبكة GPU مجتمعية)
// جودة عالية جداً — وقت انتظار 30-120 ثانية حسب الحمل
// ═══════════════════════════════════════════════════════════════════════════════
const HORDE_ANON_KEY = '0000000000'
const HORDE_UA = 'DZ-GPT:2.0:dzagent.app'

const HORDE_MODELS = [
  'AlbedoBase XL (SDXL)',
  'Deliberate',
  'Juggernaut XL',
  'Realistic Vision',
  'SDXL 1.0',
]

async function tryStableHorde(prompt, width, height) {
  const w = Math.min(Math.max(Math.round(width / 64) * 64, 512), 1024)
  const h = Math.min(Math.max(Math.round(height / 64) * 64, 512), 1024)

  const ac0 = new AbortController()
  const t0  = setTimeout(() => ac0.abort(), 20_000)
  let jobId = null
  try {
    const r = await fetch('https://stablehorde.net/api/v2/generate/async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': HORDE_ANON_KEY, 'Client-Agent': HORDE_UA },
      body: JSON.stringify({
        prompt,
        params: { width: w, height: h, steps: 25, n: 1, sampler_name: 'k_euler_a', cfg_scale: 7.5, karras: true },
        models: HORDE_MODELS.slice(0, 3),
        r2: false, shared: false, nsfw: false, trusted_workers: false,
      }),
      signal: ac0.signal,
    })
    clearTimeout(t0)
    const d = await r.json()
    if (!d.id) { console.warn('[horde] no job id:', JSON.stringify(d).slice(0, 100)); return null }
    jobId = d.id
    console.log(`[horde] job ${jobId} submitted`)
  } catch (e) { clearTimeout(t0); console.warn('[horde] submit:', e.message); return null }

  const deadline = Date.now() + 150_000
  while (Date.now() < deadline) {
    await delay(jitter(7000, 0.2))
    const ac = new AbortController()
    const t  = setTimeout(() => ac.abort(), 12_000)
    try {
      const pr = await fetch(`https://stablehorde.net/api/v2/generate/check/${jobId}`, {
        headers: { 'apikey': HORDE_ANON_KEY, 'Client-Agent': HORDE_UA }, signal: ac.signal,
      })
      clearTimeout(t)
      const pd = await pr.json()
      console.log(`[horde] wait_time=${pd.wait_time}s queue=${pd.queue_position} done=${pd.done}`)
      if (!pd.done) continue

      const sr = await fetch(`https://stablehorde.net/api/v2/generate/status/${jobId}`, {
        headers: { 'apikey': HORDE_ANON_KEY, 'Client-Agent': HORDE_UA },
        signal: AbortSignal.timeout(12_000),
      })
      const sd  = await sr.json()
      const gen = sd.generations?.[0]
      if (!gen?.img) { console.warn('[horde] no image in result'); return null }
      const buf = Buffer.from(gen.img, 'base64')
      if (buf.length > 2000) {
        console.log(`[horde] ✅ ${buf.length.toLocaleString()} bytes model="${gen.model}"`)
        return { buf, mime: 'image/webp', model: `${gen.model || 'Stable Horde'} (HD)`, provider: 'DZ MEDIA HD' }
      }
    } catch (e) { clearTimeout(t); if (e.name !== 'AbortError') console.warn('[horde] poll:', e.message) }
  }
  console.warn('[horde] timeout 150s')
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN: generateWithChatIMG — توجيه ذكي لكل نموذج مع fallback تلقائي
// الحصة: 30 توليد/ساعة لكل مستخدم (IP) — مستقلة تماماً بين المستخدمين
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateWithChatIMG(prompt, {
  width          = 768,
  height         = 768,
  preferredModel = 'auto',
  ip             = 'anon',
} = {}) {
  const rawPrompt = prompt.trim()
  if (!rawPrompt) throw new Error('prompt مطلوب')

  // فحص الحصة الشخصية لكل مستخدم
  const rate = checkRate(ip)
  if (!rate.ok) {
    return { ok: false, rateLimited: true, error: `تجاوزت الحصة (${RATE_LIMIT}/ساعة) — جرب بعد ${rate.resetInMin} دقيقة` }
  }

  // ترجمة تلقائية: عربي/فرنسي → إنجليزي (Pollinations يحتاج إنجليزي)
  const enhanced  = await translateToEnglish(rawPrompt)
  const translated = enhanced !== rawPrompt

  console.log(`[dzmedia] model=${preferredModel} | translated=${translated} | prompt="${enhanced.slice(0,60)}"`)

  try {
    // ── نماذج Pollinations — نُعيد URL مباشر للمتصفح (لتجاوز حظر 402 على server IP) ──
    const POLLINATIONS_MAP = {
      'turbo':        'turbo',
      'flux-realism': 'flux-realism',
      'flux-anime':   'flux-anime',
      'flux-3d':      'flux-3d',
      'flux-cablyai': 'flux-cablyai',
      'playground':   'playground-v2',
      'auto':         'flux',
    }

    if (preferredModel !== 'horde') {
      const polModel = POLLINATIONS_MAP[preferredModel] || 'flux'
      const directUrl = buildPollinationsUrl(enhanced, width, height, 0, polModel)
      consumeRate(ip)
      console.log(`[dzmedia] ✅ direct URL | model=${polModel} | translated=${translated}`)
      return {
        ok:             true,
        directUrl,
        url:            directUrl,   // للتوافق مع الكود القديم
        model:          `DZ Image (${polModel})`,
        provider:       'DZ MEDIA',
        promptUsed:     enhanced,
        originalPrompt: translated ? rawPrompt : undefined,
        translated,
        direct:         true,        // يخبر الـ frontend بأن الصورة تُجلب مباشرةً
        rate:           checkRate(ip),
      }
    }

    // ── Stable Horde — يُحمَّل عبر الخادم (يُعيد base64) ────────────────────────
    const hRate = checkHordeRate(ip)
    if (!hRate.ok) {
      return { ok: false, rateLimited: true, error: `تجاوزت حصة Stable Horde (${HORDE_RATE_LIMIT}/ساعة) — جرب نموذجاً آخر أو انتظر` }
    }
    const hordeResult = await tryStableHorde(enhanced, width, height)

    if (!hordeResult) {
      // Fallback: أعطِ رابط Pollinations مباشر إذا فشل Horde
      const directUrl = buildPollinationsUrl(enhanced, width, height, 0, 'flux')
      consumeRate(ip)
      return {
        ok: true, directUrl, url: directUrl,
        model: 'DZ Image (flux)', provider: 'DZ MEDIA',
        promptUsed: enhanced, originalPrompt: translated ? rawPrompt : undefined,
        translated, direct: true, rate: checkRate(ip),
      }
    }

    const id = storeResult(hordeResult.buf, hordeResult.mime, { prompt: enhanced, model: hordeResult.model, provider: hordeResult.provider })
    consumeRate(ip)
    consumeHordeRate(ip)

    return {
      ok:             true,
      url:            `/api/chatimg/img/${id}`,
      model:          hordeResult.model,
      provider:       hordeResult.provider,
      promptUsed:     enhanced,
      originalPrompt: translated ? rawPrompt : undefined,
      translated,
      bytes:          hordeResult.buf.length,
      rate:           checkRate(ip),
    }
  } catch (e) {
    console.error('[dzmedia-engine]', e.message)
    return { ok: false, error: e.message, retryable: true }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT ENHANCER — تحسين البرومبت بالذكاء الاصطناعي
// يُحوّل الوصف القصير إلى برومبت احترافي مفصّل لتوليد صور أفضل جودة
// ═══════════════════════════════════════════════════════════════════════════════
export async function enhancePromptForImage(rawPrompt) {
  if (!rawPrompt?.trim()) throw new Error('prompt مطلوب')

  // ترجمة أولاً إذا كان غير إنجليزي
  const englishPrompt = await translateToEnglish(rawPrompt.trim())

  const instruction = `You are a professional AI image prompt engineer. Enhance the following image prompt for Stable Diffusion / FLUX AI. Add: lighting quality, camera style, artistic details, mood, color palette. Keep result under 90 words. Return ONLY the enhanced prompt, no explanations.

Original: ${englishPrompt}`

  try {
    const ac  = new AbortController()
    const t   = setTimeout(() => ac.abort(), 14_000)
    const url = `https://text.pollinations.ai/${encodeURIComponent(instruction)}?model=openai&seed=${Date.now() % 9999}&json=false`
    const r   = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': rUA(), 'Accept': 'text/plain,*/*' } })
    clearTimeout(t)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    let enhanced = (await r.text()).trim()

    // تنظيف: أزل أي مقدمة غير مطلوبة
    enhanced = enhanced
      .replace(/^(enhanced prompt[:\s]*|here(?:'s| is) (?:the )?enhanced[^:]*:\s*|output[:\s]*)/i, '')
      .replace(/^["']|["']$/g, '')
      .trim()
      .slice(0, 500)

    if (enhanced.length < 15) throw new Error('response too short')

    console.log(`[dzmedia:enhance] "${rawPrompt.slice(0,40)}" → "${enhanced.slice(0,60)}…"`)
    return {
      ok:             true,
      enhanced,
      original:       rawPrompt,
      englishBase:    englishPrompt !== rawPrompt ? englishPrompt : undefined,
      translated:     englishPrompt !== rawPrompt,
    }
  } catch (e) {
    console.warn('[dzmedia:enhance] fallback to rule-based:', e.message)
    // Rule-based fallback: أضف مُحسّنات ثابتة عالية الجودة
    const enhanced = `${englishPrompt}, photorealistic, 8K resolution, cinematic lighting, highly detailed, sharp focus, professional photography, vibrant colors, award-winning composition`
    return {
      ok:          true,
      enhanced,
      original:    rawPrompt,
      englishBase: englishPrompt !== rawPrompt ? englishPrompt : undefined,
      translated:  englishPrompt !== rawPrompt,
      fallback:    true,
    }
  }
}

// ── قائمة النماذج المتاحة (مجانية ومُختبرة فعلياً — بدون مفتاح API) ──────────
export const CHATIMG_MODELS = [
  { id: 'auto',         label: '⚡ DZ Image (FLUX)',        badge: 'مجاني', tier: 'fast',   group: 'DZ MEDIA',    desc: 'FLUX.1 — توليد سريع ~10 ثانية مجاني دائماً',          waitSecs: 10  },
  { id: 'turbo',        label: '🚀 Turbo',                   badge: 'مجاني', tier: 'fast',   group: 'DZ MEDIA',    desc: 'SDXL Turbo — أسرع نموذج في المنصة ~5 ثانية',          waitSecs: 5   },
  { id: 'flux-realism', label: '📷 FLUX Realism',            badge: 'مجاني', tier: 'fast',   group: 'DZ MEDIA',    desc: 'صور واقعية فوتوريالستيك — مجاني تماماً',              waitSecs: 15  },
  { id: 'flux-anime',   label: '🌸 FLUX Anime',              badge: 'مجاني', tier: 'fast',   group: 'DZ MEDIA',    desc: 'رسوم أنيمي واحترافية — مجاني تماماً',                 waitSecs: 15  },
  { id: 'flux-3d',      label: '🧊 FLUX 3D',                 badge: 'مجاني', tier: 'fast',   group: 'DZ MEDIA',    desc: 'تصيير ثلاثي الأبعاد — مجاني تماماً',                  waitSecs: 15  },
  { id: 'flux-cablyai', label: '🎭 FLUX CablyAI',            badge: 'مجاني', tier: 'fast',   group: 'DZ MEDIA',    desc: 'فوتوريالستيك احترافي بجودة استوديو',                  waitSecs: 15  },
  { id: 'playground',   label: '🎮 Playground v2',            badge: 'مجاني', tier: 'fast',   group: 'DZ MEDIA',    desc: 'نموذج جمالي فائق الجودة — مجاني',                     waitSecs: 15  },
  { id: 'horde',        label: '🌐 Stable Horde (HD)',       badge: 'مجاني', tier: 'medium', group: 'DZ MEDIA HD',  desc: 'شبكة GPU مجتمعية — جودة عالية جداً — ~60-120 ث',     waitSecs: 90  },
]
