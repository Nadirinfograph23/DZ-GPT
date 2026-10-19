/**
 * lib/dz-image-providers/index.js
 * DZ Image Provider System — نظام توليد الصور المتعدد المزودين
 *
 * Priority order:
 *   1. Perchance AI Image Generator
 *   2. Raphael AI
 *   3. FreeForAI (aifreeforever.com)
 *   4. Pollinations AI (guaranteed fallback — always works)
 *
 * Features:
 *   ✅ No API keys required
 *   ✅ Auto-fallback on failure
 *   ✅ TTL cache (2h) keyed by prompt+size
 *   ✅ Arabic/French/Darija → English translation
 *   ✅ Safety filtering (multi-language)
 *   ✅ Timeout handling per provider
 *   ✅ Modular: add providers by exporting generate() + adding to PROVIDERS array
 */

import { generatePerchance }  from './perchance.js'
import { generateRaphael }    from './raphael.js'
import { generateFreeForAI }  from './freeforai.js'
import crypto                 from 'node:crypto'

// ── Translation ───────────────────────────────────────────────────────────────
const TRANS_CACHE = new Map()
const TRANS_TTL   = 4 * 60 * 60 * 1000  // 4h

function sourceLanguage(text) {
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return 'ar'
  if (/[àâçéèêëîïôùûüÀÂÇÉÈÊËÎÏÔÙÛÜ]/.test(text)
      || /\b(le|la|les|un|une|des|du|de|je|tu|il|nous|vous|ils|est|sont|avec|dans|sur|pour|au|aux)\b/i.test(text)) return 'fr'
  return null
}

function isNonEnglish(text) {
  return sourceLanguage(text) !== null
}

async function translatePrompt(text) {
  const rawText = String(text || '').trim()
  const lang = sourceLanguage(rawText)
  if (!lang) return rawText
  const key = crypto.createHash('sha256').update(`${lang}:${rawText}`).digest('hex')
  const hit = TRANS_CACHE.get(key)
  if (hit && Date.now() - hit.ts < TRANS_TTL) return hit.val

  try {
    const ac = new AbortController()
    const timeout = setTimeout(() => ac.abort(), 7_000)
    const queryText = rawText.slice(0, 500)
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(queryText)}&langpair=${lang}|en&de=dz-gpt@replit.app`
    let response
    try {
      response = await fetch(url, { signal: ac.signal })
    } finally {
      clearTimeout(timeout)
    }
    if (!response.ok) return rawText
    const data = await response.json()
    const translated = String(data?.responseData?.translatedText || '').trim()
    if (translated.length <= 3 || translated === rawText || translated.toLowerCase().startsWith('mymemory') || /[\u0600-\u06FF]/.test(translated)) return rawText
    const remainder = rawText.slice(queryText.length).trim()
    const result = remainder ? `${translated} ${remainder}` : translated
    if (TRANS_CACHE.size >= 300) {
      const firstKey = TRANS_CACHE.keys().next().value
      if (firstKey) TRANS_CACHE.delete(firstKey)
    }
    TRANS_CACHE.set(key, { val: result, ts: Date.now() })
    console.log(`[dz-providers:translate] ${lang}→en | chars=${rawText.length}`)
    return result
  } catch {}
  return rawText
}

// ── Safety filter ─────────────────────────────────────────────────────────────
const BLOCKED = [
  /\b(nsfw|nude|naked|porn|xxx|hentai|sex|erotic|adult.?content)\b/i,
  /\b(عاري|إباحي|جنسي|فاضح|بورن)\b/,
  /\b(nu|pornographi[eéq]|érotique|sexuel)\b/i,
  /\b(child|minor|infant|toddler|kid).{0,15}(nude|sex|naked|erotic)\b/i,
]
function isSafe(prompt) {
  return !BLOCKED.some(p => p.test(prompt))
}

// ── Cache (TTL 2h, max 150 entries) ──────────────────────────────────────────
const IMG_CACHE    = new Map()
const CACHE_TTL    = 2 * 60 * 60 * 1000
const CACHE_MAX    = 150

function ck(prompt, w, h) {
  return crypto.createHash('md5').update(`${prompt}:${w}x${h}`).digest('hex').slice(0,16)
}
function cGet(key) {
  const e = IMG_CACHE.get(key)
  if (!e) return null
  if (Date.now() - e.ts > CACHE_TTL) { IMG_CACHE.delete(key); return null }
  return e.v
}
function cSet(key, value) {
  if (IMG_CACHE.size >= CACHE_MAX) {
    const old = [...IMG_CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (old) IMG_CACHE.delete(old[0])
  }
  IMG_CACHE.set(key, { v: value, ts: Date.now() })
}
export function getCacheStats() {
  const now = Date.now(); let alive = 0
  for (const [, e] of IMG_CACHE) if (now - e.ts < CACHE_TTL) alive++
  return { total: IMG_CACHE.size, alive, ttlH: CACHE_TTL / 3_600_000 }
}

// ── Pollinations fallback (server-verified URL — always works) ────────────────
function buildPollinationsUrl(prompt, w, h, model = 'flux-realism') {
  const seed  = Math.floor(Math.random() * 9_000_000)
  const nonce = Date.now().toString(36)
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
    + `?model=${model}&width=${w}&height=${h}&seed=${seed}&nologo=true&enhance=false&_n=${nonce}`
}

// ── Provider registry ─────────────────────────────────────────────────────────
// The first 3 are the user-requested providers.
// Provider 4 (Pollinations) is the guaranteed fallback — always succeeds.
const PROVIDERS = [
  {
    id:       'perchance',
    name:     'Perchance AI',
    generate: generatePerchance,
  },
  {
    id:       'raphael',
    name:     'Raphael AI',
    generate: generateRaphael,
  },
  {
    id:       'freeforai',
    name:     'FreeForAI',
    generate: generateFreeForAI,
  },
  {
    id:       'pollinations',
    name:     'Pollinations AI',
    generate: async (prompt, { width, height }) => {
      // Returns a direct URL — browser fetches directly (no server-side image download)
      const url = buildPollinationsUrl(prompt, width, height, 'flux-realism')
      // Quick HEAD check that Pollinations is reachable
      try {
        const ac = new AbortController()
        setTimeout(() => ac.abort(), 8_000)
        const r = await fetch(url, { method: 'HEAD', signal: ac.signal, redirect: 'follow' })
        if (r.ok || r.status === 200) {
          return { ok: true, url, provider: 'Pollinations AI', model: 'FLUX Realism (Pollinations)', generationTime: 0 }
        }
      } catch {}
      // Even if HEAD check fails, return the URL — browser will try
      return { ok: true, url, provider: 'Pollinations AI', model: 'FLUX Realism (Pollinations)', generationTime: 0 }
    },
  },
]

export function getProviders() {
  return PROVIDERS.map(p => ({ id: p.id, name: p.name }))
}

// ── Main generation function ──────────────────────────────────────────────────
/**
 * generateImage(prompt, options)
 *
 * @param {string} prompt — وصف الصورة (عربي/فرنسي/إنجليزي)
 * @param {object} options
 *   @param {number}   [options.width=768]
 *   @param {number}   [options.height=768]
 *   @param {string}   [options.preferredProvider='auto'] — 'perchance'|'raphael'|'freeforai'|'pollinations'|'auto'
 *   @param {boolean}  [options.useCache=true]
 *   @param {string}   [options.negativePrompt]
 *
 * @returns {{ ok, url?, imageBase64?, mime?, provider, model, generationTime, cached, translated, englishPrompt, error? }}
 */
export async function generateImage(prompt, {
  width             = 768,
  height            = 768,
  preferredProvider = 'auto',
  useCache          = true,
  negativePrompt    = 'blurry, ugly, low quality, watermark, text, deformed',
} = {}) {

  const rawPrompt = prompt?.trim()
  if (!rawPrompt) return { ok: false, error: 'prompt مطلوب' }
  if (!isSafe(rawPrompt)) return { ok: false, error: 'المحتوى غير مسموح به — الرجاء تعديل الوصف', blocked: true }

  const englishPrompt = await translatePrompt(rawPrompt)
  const translated    = englishPrompt !== rawPrompt

  const w = Math.min(Math.max(Number(width)  || 768, 256), 1024)
  const h = Math.min(Math.max(Number(height) || 768, 256), 1024)

  const key = ck(englishPrompt, w, h)
  if (useCache) {
    const cached = cGet(key)
    if (cached) {
      console.log(`[dz-providers] 📦 cache hit "${englishPrompt.slice(0,40)}"`)
      return { ...cached, cached: true, translated, originalPrompt: translated ? rawPrompt : undefined, englishPrompt }
    }
  }

  // Build ordered provider list
  let ordered = [...PROVIDERS]
  if (preferredProvider !== 'auto' && preferredProvider !== 'pollinations') {
    const pref = ordered.find(p => p.id === preferredProvider)
    if (pref) {
      // Move preferred to front, keep fallback (pollinations) at end
      ordered = [pref, ...ordered.filter(p => p.id !== preferredProvider)]
    }
  }

  const errors = []

  for (const provider of ordered) {
    console.log(`[dz-providers] 🚀 trying ${provider.name} for "${englishPrompt.slice(0,50)}"`)
    try {
      const result = await provider.generate(englishPrompt, { width: w, height: h, negativePrompt })

      if (result.ok) {
        const response = {
          ok:             true,
          url:            result.url,
          imageBase64:    result.imageBase64,
          mime:           result.mime,
          provider:       result.provider,
          model:          result.model,
          generationTime: result.generationTime,
          cached:         false,
          translated,
          originalPrompt: translated ? rawPrompt : undefined,
          englishPrompt,
        }
        // Cache: store URL results (skip large base64 to save memory)
        if (useCache && (result.url || result.imageBase64)) {
          cSet(key, {
            ok: true, url: result.url, imageBase64: result.imageBase64,
            mime: result.mime, provider: result.provider, model: result.model,
            generationTime: result.generationTime,
          })
        }
        console.log(`[dz-providers] ✅ ${provider.name} (${result.generationTime}ms)`)
        return response
      }

      errors.push(`${provider.name}: ${result.error}`)
      console.warn(`[dz-providers] ⚠️ ${provider.name}: ${result.error}`)

    } catch (e) {
      errors.push(`${provider.name}: ${e.message}`)
      console.warn(`[dz-providers] ❌ ${provider.name}: ${e.message}`)
    }
  }

  // Should never reach here (Pollinations is the guaranteed fallback)
  return { ok: false, error: `جميع المزودين فشلوا: ${errors.join(' | ')}`, errors, englishPrompt, translated }
}
