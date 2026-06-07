/**
 * lib/dz-image-providers/raphael.js
 * Raphael AI — مولّد صور مجاني (FLUX-based) بدون مفتاح API
 * https://raphael.app
 *
 * Strategy: Try multiple endpoint discovery patterns for their Next.js/API setup.
 * Raphael uses a custom backend — probe known patterns + fallback to alt methods.
 */

const BASE = 'https://raphael.app'

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
]
function rUA() { return UA_LIST[Math.floor(Math.random() * UA_LIST.length)] }

function baseHeaders(extra = {}) {
  return {
    'User-Agent':      rUA(),
    'Accept':          'application/json, */*;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
    'Referer':         `${BASE}/`,
    'Origin':          BASE,
    'DNT':             '1',
    'Sec-Fetch-Dest':  'empty',
    'Sec-Fetch-Mode':  'cors',
    'Sec-Fetch-Site':  'same-origin',
    ...extra,
  }
}

// All known endpoint patterns to try (in priority order)
const ENDPOINTS = [
  // Standard REST
  { method: 'POST', path: '/api/generate',          body: (p, w, h) => JSON.stringify({ prompt: p, width: w, height: h, seed: Math.floor(Math.random() * 9999999) }) },
  { method: 'POST', path: '/api/text-to-image',     body: (p, w, h) => JSON.stringify({ prompt: p, width: w, height: h }) },
  { method: 'POST', path: '/api/image/generate',    body: (p, w, h) => JSON.stringify({ prompt: p, width: w, height: h }) },
  { method: 'POST', path: '/api/images',            body: (p, w, h) => JSON.stringify({ prompt: p }) },
  { method: 'POST', path: '/api/create',            body: (p, w, h) => JSON.stringify({ prompt: p, w, h }) },
  { method: 'POST', path: '/api/flux',              body: (p, w, h) => JSON.stringify({ prompt: p }) },
  { method: 'POST', path: '/api/v1/generate',       body: (p, w, h) => JSON.stringify({ prompt: p, width: w, height: h }) },
  { method: 'POST', path: '/api/v1/images/generate',body: (p, w, h) => JSON.stringify({ prompt: p }) },
  // Form-encoded alternatives
  {
    method: 'POST', path: '/api/generate',
    contentType: 'application/x-www-form-urlencoded',
    body: (p, w, h) => new URLSearchParams({ prompt: p, width: String(w), height: String(h) }).toString(),
  },
]

function extractImageResult(data, ct = '') {
  if (!data) return null
  const url = data.url || data.imageUrl || data.image_url || data.image
    || data.output?.[0] || data.data?.url || data.result?.url
    || (Array.isArray(data) && (data[0]?.url || data[0]))
  if (url && typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:'))) return { url }

  const b64 = data.b64_json || data.base64 || data.image_base64
  if (b64) return { imageBase64: b64, mime: data.mime || 'image/png' }

  return null
}

/**
 * generateRaphael(prompt, { width, height })
 * → { ok, url?, imageBase64?, mime?, provider, model, generationTime }
 */
export async function generateRaphael(prompt, {
  width  = 1024,
  height = 1024,
} = {}) {
  const t0 = Date.now()
  const w  = Math.min(Math.max(Math.round(width  / 64) * 64, 512), 1024)
  const h  = Math.min(Math.max(Math.round(height / 64) * 64, 512), 1024)

  for (const ep of ENDPOINTS) {
    const ct = ep.contentType || 'application/json'
    try {
      const ac = new AbortController()
      const tm = setTimeout(() => ac.abort(), 30_000)

      const r = await fetch(`${BASE}${ep.path}`, {
        method:  ep.method,
        headers: baseHeaders({ 'Content-Type': ct }),
        body:    ep.body(prompt, w, h),
        signal:  ac.signal,
      })
      clearTimeout(tm)

      // Skip obvious failures
      if (r.status === 404 || r.status === 405) continue
      if (r.status === 403 || r.status === 503) {
        console.warn(`[raphael] ${ep.path} blocked (${r.status})`)
        continue
      }

      const rct = r.headers.get('content-type') || ''

      if (rct.startsWith('image/') && r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 1000) {
          console.log(`[raphael] ✅ image binary via ${ep.path} ${buf.length.toLocaleString()} bytes`)
          return { ok: true, imageBase64: buf.toString('base64'), mime: rct.split(';')[0].trim(), provider: 'Raphael', model: 'Raphael AI (FLUX)', generationTime: Date.now() - t0 }
        }
      }

      if (r.ok && rct.includes('json')) {
        const data = await r.json().catch(() => null)
        const img  = extractImageResult(data, rct)
        if (img) {
          console.log(`[raphael] ✅ JSON via ${ep.path}`)
          return { ok: true, ...img, provider: 'Raphael', model: 'Raphael AI (FLUX)', generationTime: Date.now() - t0 }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(`[raphael] ${ep.path}: ${e.message}`)
    }
  }

  console.warn('[raphael] all endpoints failed — no public API found')
  return { ok: false, provider: 'Raphael', model: 'Raphael AI', error: 'Raphael: no accessible public API endpoint found' }
}
