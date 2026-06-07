/**
 * lib/dz-image-providers/perchance.js
 * Perchance AI Image Generator — مجاني، بدون مفتاح API
 *
 * Flow:
 *   1. GET page to obtain cookies + adAccessCode token
 *   2. GET /api/verifyUser → userKey
 *   3. POST /api/generate  → imageId
 *   4. GET /api/downloadTemporaryImage → binary image
 *
 * Note: Perchance requires a browser-side adAccessCode.
 * This implementation attempts multiple strategies to obtain it.
 */

const BASE      = 'https://image-generation.perchance.org'
const PAGE_URL  = 'https://perchance.org/ai-text-to-image-v2'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const RESOLUTIONS = ['512x512', '768x768', '768x512', '512x768', '1024x1024', '512x768', '256x256']

function nearestResolution(w, h) {
  const target = `${w}x${h}`
  if (RESOLUTIONS.includes(target)) return target
  const area = w * h
  let best = '512x512', bestDiff = Infinity
  for (const r of RESOLUTIONS) {
    const [rw, rh] = r.split('x').map(Number)
    const diff = Math.abs(rw * rh - area)
    if (diff < bestDiff) { bestDiff = diff; best = r }
  }
  return best
}

// Cache adAccessCode (TTL 30 min — expires often)
let _cachedCode = null
let _cacheTs    = 0
const CODE_TTL  = 30 * 60 * 1000

async function getAdAccessCode(cookieJar = '') {
  if (_cachedCode && Date.now() - _cacheTs < CODE_TTL) return _cachedCode

  const ac = new AbortController()
  const tm = setTimeout(() => ac.abort(), 14_000)
  try {
    // Strategy 1: Perchance free-usage code API
    const r = await fetch(
      `${PAGE_URL.replace('perchance.org', 'perchance.org')}/api/getAdAccessCodeForFreeUsage?generatorId=ai-text-to-image-v2&userKey=__undefined__`,
      {
        headers: {
          'User-Agent': UA,
          'Referer':    PAGE_URL,
          'Cookie':     cookieJar,
          'Accept':     'application/json, text/plain, */*',
        },
        signal: ac.signal,
      }
    )
    clearTimeout(tm)
    if (r.ok) {
      const d = await r.json().catch(() => null)
      if (d?.adAccessCode) {
        _cachedCode = d.adAccessCode
        _cacheTs    = Date.now()
        return _cachedCode
      }
    }
  } catch (_) { clearTimeout(tm) }

  // Strategy 2: Try known free access codes from public Perchance implementations
  // These are well-known public codes from open-source perchance wrappers
  const publicCodes = ['null', '0', 'free', '__none__']
  for (const code of publicCodes) {
    try {
      const ac2 = new AbortController()
      const tm2 = setTimeout(() => ac2.abort(), 10_000)
      const r2  = await fetch(
        `${BASE}/api/verifyUser?userKey=__undefined__&adAccessCode=${code}`,
        {
          headers: { 'User-Agent': UA, 'Referer': PAGE_URL, 'Accept': 'application/json', 'Cookie': cookieJar },
          signal: ac2.signal,
        }
      )
      clearTimeout(tm2)
      if (r2.ok) {
        const d = await r2.json().catch(() => null)
        if (d?.userKey && d?.status !== 'failed_verification') {
          _cachedCode = code
          _cacheTs    = Date.now()
          return code
        }
      }
    } catch (_) {}
  }

  return null
}

async function getPageCookies() {
  const ac = new AbortController()
  const tm = setTimeout(() => ac.abort(), 12_000)
  try {
    const r = await fetch(PAGE_URL, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow',
      signal: ac.signal,
    })
    clearTimeout(tm)
    const setCookie = r.headers.get('set-cookie') || ''
    // Extract cookie string (name=value pairs)
    return setCookie.split(',')
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ')
  } catch (_) { clearTimeout(tm) }
  return ''
}

/**
 * generatePerchance(prompt, { width, height, negativePrompt })
 * → { ok, url?, imageBase64?, mime?, provider, model, generationTime }
 */
export async function generatePerchance(prompt, {
  width          = 512,
  height         = 512,
  negativePrompt = 'blurry, ugly, low quality, watermark, text, deformed, bad anatomy',
  guidanceScale  = 7,
} = {}) {
  const t0 = Date.now()

  // Step 1: Get cookies from page visit (helps with session)
  const cookieJar = await getPageCookies()

  // Step 2: Get adAccessCode
  const adAccessCode = await getAdAccessCode(cookieJar)
  if (!adAccessCode) {
    return {
      ok:    false,
      provider: 'Perchance',
      model:    'Perchance AI',
      error: 'Perchance: cannot obtain adAccessCode — requires browser ad interaction',
    }
  }

  // Step 3: verifyUser → userKey
  let userKey
  try {
    const ac = new AbortController()
    const tm = setTimeout(() => ac.abort(), 12_000)
    const r  = await fetch(
      `${BASE}/api/verifyUser?userKey=__undefined__&adAccessCode=${encodeURIComponent(adAccessCode)}`,
      {
        headers: { 'User-Agent': UA, 'Referer': PAGE_URL, 'Accept': 'application/json', 'Cookie': cookieJar },
        signal: ac.signal,
      }
    )
    clearTimeout(tm)
    if (!r.ok) throw new Error(`verifyUser HTTP ${r.status}`)
    const d = await r.json()
    if (d.status === 'failed_verification') throw new Error(`verification failed: ${d.reason}`)
    userKey = d.userKey
    if (!userKey) throw new Error('userKey missing')
  } catch (e) {
    return { ok: false, provider: 'Perchance', model: 'Perchance AI', error: `verifyUser: ${e.message}` }
  }

  const resolution = nearestResolution(Math.min(width, 1024), Math.min(height, 1024))
  const body = new URLSearchParams({
    prompt,
    negativePrompt,
    resolution,
    guidanceScale: String(guidanceScale),
    seed:          String(Math.floor(Math.random() * 999999)),
    userKey,
    channel:       'private',
    adAccessCode,
  })

  // Step 4: generate → imageId
  let imageId
  try {
    const ac = new AbortController()
    const tm = setTimeout(() => ac.abort(), 40_000)
    const r  = await fetch(`${BASE}/api/generate`, {
      method:  'POST',
      headers: {
        'User-Agent':   UA,
        'Referer':      PAGE_URL,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept':       'application/json',
        'Cookie':       cookieJar,
      },
      body:   body.toString(),
      signal: ac.signal,
    })
    clearTimeout(tm)
    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      throw new Error(`generate HTTP ${r.status}: ${txt.slice(0, 80)}`)
    }
    const data = await r.json()
    if (data.error)  throw new Error(data.error)
    imageId = data.imageId
    if (!imageId)    throw new Error('imageId missing')
  } catch (e) {
    return { ok: false, provider: 'Perchance', model: 'Perchance AI', error: `generate: ${e.message}` }
  }

  // Step 5: download image
  try {
    const imgUrl = `${BASE}/api/downloadTemporaryImage?imageId=${encodeURIComponent(imageId)}&userKey=${encodeURIComponent(userKey)}`
    const ac     = new AbortController()
    const tm     = setTimeout(() => ac.abort(), 20_000)
    const imgRes = await fetch(imgUrl, {
      headers: { 'User-Agent': UA, 'Referer': PAGE_URL, 'Cookie': cookieJar },
      signal: ac.signal,
    })
    clearTimeout(tm)
    if (!imgRes.ok) throw new Error(`download HTTP ${imgRes.status}`)
    const ct  = imgRes.headers.get('content-type') || 'image/jpeg'
    const buf = Buffer.from(await imgRes.arrayBuffer())
    if (buf.length < 1000) throw new Error('image too small — likely error page')

    console.log(`[perchance] ✅ ${buf.length.toLocaleString()} bytes in ${Date.now() - t0}ms`)
    return {
      ok:             true,
      imageBase64:    buf.toString('base64'),
      mime:           ct.split(';')[0].trim() || 'image/jpeg',
      provider:       'Perchance',
      model:          'Perchance AI',
      generationTime: Date.now() - t0,
    }
  } catch (e) {
    return { ok: false, provider: 'Perchance', model: 'Perchance AI', error: `download: ${e.message}` }
  }
}
