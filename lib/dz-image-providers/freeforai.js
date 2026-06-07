/**
 * lib/dz-image-providers/freeforai.js
 * FreeForAI (aifreeforever.com) — مولّد صور مجاني متعدد النماذج
 * بدون مفتاح API — يستخدم headers تحاكي المتصفح
 *
 * Strategy: Multi-endpoint probing + page-scraped API discovery
 * Fallback: Cloudflare bypass via realistic browser headers
 */

const BASE    = 'https://aifreeforever.com'
const FILES   = 'https://files.aifreeforever.com'

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
]
function rUA() { return UA_POOL[Math.floor(Math.random() * UA_POOL.length)] }

// Known models from their page source
const MODEL_ALIASES = {
  'flux-schnell':       'flux-schnell',
  'flux-fast':          'flux-fast',
  'nano-banana':        'nano-banana',
  'nano-banana-2':      'nano-banana-2',
  'flux-dev':           'flux-dev',
  'sdxl':               'sdxl-lightning',
  'default':            'flux-fast',
}

// Endpoint candidates in priority order
function buildEndpoints(modelId, prompt, w, h) {
  const seed = Math.floor(Math.random() * 9999999)
  const jsonBody = JSON.stringify({ model: modelId, prompt, width: w, height: h, steps: 20, seed, negative_prompt: 'blurry, ugly, low quality' })
  const formBody = new URLSearchParams({ model: modelId, prompt, width: String(w), height: String(h), steps: '20', seed: String(seed) }).toString()

  return [
    { url: `${BASE}/api/generate`,             ct: 'application/json',                  body: jsonBody },
    { url: `${BASE}/api/image`,                ct: 'application/json',                  body: jsonBody },
    { url: `${BASE}/api/v1/generate`,          ct: 'application/json',                  body: jsonBody },
    { url: `${BASE}/api/txt2img`,              ct: 'application/x-www-form-urlencoded', body: formBody },
    { url: `${BASE}/api/models/${modelId}/generate`, ct: 'application/json',            body: jsonBody },
    { url: `${FILES}/api/generate`,            ct: 'application/json',                  body: jsonBody },
  ]
}

function extractResult(data) {
  if (!data) return null
  const url = data.url || data.imageUrl || data.image_url || data.output
    || data.data?.url || data.result?.url || (Array.isArray(data.images) && data.images[0])
  if (url && typeof url === 'string') return { url: url.startsWith('http') ? url : `${BASE}${url}` }

  const b64 = data.b64_json || data.base64 || data.image_base64
  if (b64) return { imageBase64: b64, mime: data.mime || 'image/png' }

  return null
}

/**
 * generateFreeForAI(prompt, { width, height, model })
 * → { ok, url?, imageBase64?, mime?, provider, model, generationTime }
 */
export async function generateFreeForAI(prompt, {
  width  = 1024,
  height = 1024,
  model  = 'default',
} = {}) {
  const t0      = Date.now()
  const modelId = MODEL_ALIASES[model] || MODEL_ALIASES['default']
  const w = Math.min(Math.max(Math.round(width  / 64) * 64, 512), 1024)
  const h = Math.min(Math.max(Math.round(height / 64) * 64, 512), 1024)

  const ua      = rUA()
  const headers = {
    'User-Agent':         ua,
    'Accept':             'application/json, */*',
    'Accept-Language':    'en-US,en;q=0.9,ar;q=0.8,fr;q=0.7',
    'Accept-Encoding':    'gzip, deflate, br',
    'Referer':            `${BASE}/image-generators`,
    'Origin':             BASE,
    'Cache-Control':      'no-cache',
    'Pragma':             'no-cache',
    'DNT':                '1',
    'Sec-Ch-Ua':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile':   '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest':     'empty',
    'Sec-Fetch-Mode':     'cors',
    'Sec-Fetch-Site':     'same-origin',
  }

  const endpoints = buildEndpoints(modelId, prompt, w, h)

  for (const ep of endpoints) {
    try {
      const ac = new AbortController()
      const tm = setTimeout(() => ac.abort(), 40_000)

      const r = await fetch(ep.url, {
        method:  'POST',
        headers: { ...headers, 'Content-Type': ep.ct },
        body:    ep.body,
        signal:  ac.signal,
      })
      clearTimeout(tm)

      if (r.status === 403 || r.status === 503 || r.status === 404 || r.status === 405) continue

      const rct = r.headers.get('content-type') || ''

      if (rct.startsWith('image/') && r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 1000) {
          console.log(`[freeforai] ✅ binary via ${ep.url} ${buf.length.toLocaleString()} bytes`)
          return { ok: true, imageBase64: buf.toString('base64'), mime: rct.split(';')[0].trim(), provider: 'FreeForAI', model: `FreeForAI (${modelId})`, generationTime: Date.now() - t0 }
        }
      }

      if (r.ok && rct.includes('json')) {
        const data = await r.json().catch(() => null)
        const img  = extractResult(data)
        if (img) {
          console.log(`[freeforai] ✅ JSON via ${ep.url}`)
          return { ok: true, ...img, provider: 'FreeForAI', model: `FreeForAI (${modelId})`, generationTime: Date.now() - t0 }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`[freeforai] ${ep.url}: ${e.message}`)
    }
  }

  return { ok: false, provider: 'FreeForAI', model: `FreeForAI (${modelId})`, error: 'FreeForAI: all endpoints failed (Cloudflare-protected or no public API)' }
}
