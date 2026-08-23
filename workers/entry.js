/**
 * Cloudflare Workers entry point — DZ AGENT
 * =========================================
 * Direct bridge: CF Workers Request → Express (Node.js) → CF Workers Response
 *
 * Why a custom bridge instead of @whatwg-node/server:
 *   @whatwg-node/server passes a WhatWG Request directly to Express as `req`.
 *   Express then tries `req.url = req.url.slice(1)` which throws
 *   "Cannot assign to read only property 'url'" on the native CF Request.
 *   This bridge creates a mutable Node-compatible request — avoiding the crash.
 */

import { Readable } from 'node:stream'

let expressApp = null

// Cloudflare Workers can cold-start before the Express news preloader has
// populated its in-memory cache. Keep a small, keyless RSS fallback here so a
// valid live-news request never degrades to "news unavailable" just because the
// Node compatibility bridge is still warming up.
const WORKER_NEWS_FEEDS = [
  {
    name: 'Google أخبار الجزائر',
    url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar',
  },
  { name: 'النهار', url: 'https://www.ennaharonline.com/feed/' },
  { name: 'الشروق أونلاين', url: 'https://www.echoroukonline.com/feed' },
  { name: 'البلاد', url: 'https://www.elbilad.net/feed' },
]

const WORKER_NEWS_QUERY_RE = /(?:أخبار|خبر|عاجل|اليوم|الآن|آخر|news|breaking|actualité|derni[eè]res)/i

function decodeXmlText(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

function parseWorkerRss(xml, source) {
  const items = []
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let match

  while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
    const block = match[1]
    const get = (tag) => {
      const found = block.match(new RegExp(
        `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
        'i',
      ))
      return found ? decodeXmlText(found[1]) : ''
    }
    const title = get('title')
    if (!title) continue
    const link = get('link') || (
      block.match(/<link[^>]+href=["']([^"']+)["']/i) || []
    )[1] || ''
    items.push({
      title,
      link,
      source,
      pubDate: get('pubDate') || get('dc:date') || get('updated') || '',
    })
  }

  return items
}


// ===== WEATHER DIRECT (Worker-native, no server.js) =====
const WORKER_WEATHER_CACHE = { data: null, ts: 0 }
const WORKER_WEATHER_TTL = 10 * 60 * 1000 // 10 min

const WILAYA_COORDS = {
  'الجزائر': { lat: 36.7538, lon: 3.0588 },
  'وهران': { lat: 35.6969, lon: -0.6331 },
  'قسنطينة': { lat: 36.365, lon: 6.6147 },
  'عنابة': { lat: 36.9, lon: 7.7667 },
  'باتنة': { lat: 35.55, lon: 6.1667 },
  'بجاية': { lat: 36.75, lon: 5.0833 },
  'تلمسان': { lat: 34.8783, lon: -1.3167 },
  'تيزي وزو': { lat: 36.7167, lon: 4.05 },
  'سطيف': { lat: 36.1911, lon: 5.4136 },
  'سوق أهراس': { lat: 36.2833, lon: 7.95 },
}

const WILAYA_ALIASES = {
  'oran': 'وهران', 'constantine': 'قسنطينة', 'annaba': 'عنابة',
  'batna': 'باتنة', 'bejaia': 'بجاية', 'béjaïa': 'بجاية',
  'tlemcen': 'تلمسان', 'tizi ouzou': 'تيزي وزو', 'setif': 'سطيف',
  'skikda': 'سطيف', 'jijel': 'عنابة', 'algiers': 'الجزائر',
  'alger': 'الجزائر', 'adrar': 'الأغواط', 'biskra': 'بسكرة',
}

const AR_CONDITIONS = {
  0: 'سماء صافية', 1: 'صافية غالباً', 2: 'غيمة جزئية', 3: 'غائمة',
  45: 'ضباب', 48: 'ضباب مع صقيع',
  51: 'رذاذ خفيف', 53: 'رذاذ متوسط', 55: 'رذاذ كثيف',
  61: 'مطر خفيف', 63: 'مطر متوسط', 65: 'مطر غزير',
  71: 'ثلج خفيف', 73: 'ثلج متوسط', 75: 'ثلج غزير',
  80: 'زخات مطر خفيفة', 81: 'زخات مطر متوسطة', 82: 'زخات مطر غزيرة',
  95: 'عاصفة رعدية', 96: 'عاصفة رعدية مع برد', 99: 'عاصفة رعدية قوية',
}

function getWilayaCoords(city) {
  const lower = city.toLowerCase()
  const alias = WILAYA_ALIASES[lower] || WILAYA_ALIASES[lower.split(' ')[0]]
  if (alias && WILAYA_COORDS[alias]) return { ...WILAYA_COORDS[alias], label: alias }
  for (const [name, coords] of Object.entries(WILAYA_COORDS)) {
    if (lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)) {
      return { ...coords, label: name }
    }
  }
  return { lat: 36.7538, lon: 3.0588, label: 'الجزائر العاصمة' }
}

async function fetchWeatherDirect(request) {
  const url = new URL(request.url)
  const city = String(url.searchParams.get('city') || 'Algiers').slice(0, 80)
  const lat = parseFloat(url.searchParams.get('lat'))
  const lon = parseFloat(url.searchParams.get('lon'))

  // Check cache first
  const cacheKey = (!isNaN(lat) && !isNaN(lon)) ? `${lat},${lon}` : city
  const now = Date.now()
  if (WORKER_WEATHER_CACHE.data && WORKER_WEATHER_CACHE.ts > now - WORKER_WEATHER_TTL && WORKER_WEATHER_CACHE.key === cacheKey) {
    const data = { ...WORKER_WEATHER_CACHE.data, city: coords.label || city }
    return new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }

  let coords
  if (!isNaN(lat) && !isNaN(lon)) {
    coords = { lat, lon, label: 'موقعك الحالي' }
  } else {
    coords = getWilayaCoords(city)
  }

  try {
    // Primary: open-meteo (free, no key)
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto&forecast_days=1`
    const omResp = await fetch(omUrl, { headers: { 'User-Agent': 'DZ-Agent-Worker/1.0' }, signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000); return ctrl.signal })() })
    if (!omResp.ok) throw new Error(`open-meteo ${omResp.status}`)
    const omData = await omResp.json()
    const current = omData.current || {}
    const temp = current.temperature_2m ?? null
    const conditionCode = current.weather_code ?? null
    const condition = conditionCode !== null ? (AR_CONDITIONS[conditionCode] || `حالة ${conditionCode}`) : null
    const data = {
      city: coords.label || city,
      temp, feels_like: temp, temp_min: temp, temp_max: temp,
      condition, icon: conditionCode, humidity: current.relative_humidity_2m ?? null,
      wind: current.wind_speed_10m ?? null, visibility: null,
      source: 'open-meteo.com', fetchedAt: new Date().toISOString(), status: 'ok'
    }
    WORKER_WEATHER_CACHE.data = data
    WORKER_WEATHER_CACHE.ts = now
    WORKER_WEATHER_CACHE.key = cacheKey
    return new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  } catch (err) {
    console.error('[Worker:Weather] Failed:', err.message)
    return new Response(JSON.stringify({
      city: coords.label || city, temp: null, feels_like: null, temp_min: null, temp_max: null,
      condition: null, icon: null, humidity: null, wind: null, visibility: null,
      error: 'تعذّر جلب الطقس حالياً', status: 'unavailable',
      fetchedAt: new Date().toISOString()
    }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }
}


// ===== PRAYER DIRECT (Worker-native, no server.js) =====
const WORKER_PRAYER_CACHE = { data: null, ts: 0 }
const WORKER_PRAYER_TTL = 60 * 60 * 1000 // 1 hour

const DZ_WILAYAS = [
  'الجزائر','وهران','قسنطينة','عنابة','باتنة','بجاية','تلمسان','تيزي وزو',
  'سطيف','سوق أهراس','البليدة','بومرداس','المسيلة','ميلة','أم البواقي','خنشلة',
  'الأغواط','البيض','ورقلة','غرداية','ت撒ات','إليزي','برج بوعريريج','بسكرة',
  'الوادي','تندوف','الجلفة','الأرزاوي','تيبازة','الشلف','تيارت','سيدي بلعباس',
  'معسكر','غليزان','تيسمسيلت',' Médéa','Blida','Boumerdès','Tipaza','Chlef',
]

async function fetchPrayerDirect(request) {
  const url = new URL(request.url)
  const city = String(url.searchParams.get('city') || 'Algiers').slice(0, 80)
  const lat = parseFloat(url.searchParams.get('lat'))
  const lon = parseFloat(url.searchParams.get('lon'))

  // Check cache first
  const cacheKey = (!isNaN(lat) && !isNaN(lon)) ? `${lat},${lon}` : city
  const now = Date.now()
  if (WORKER_PRAYER_CACHE.data && WORKER_PRAYER_CACHE.ts > now - WORKER_PRAYER_TTL && WORKER_PRAYER_CACHE.key === cacheKey) {
    const data = { ...WORKER_PRAYER_CACHE.data, city: coords.label || city }
    return new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }

  let coords
  if (!isNaN(lat) && !isNaN(lon)) {
    coords = { lat, lon, label: 'موقعك الحالي' }
  } else {
    coords = getWilayaCoords(city)
  }

  try {
    // Use aladhan API (free, no key)
    const method = 2 // Islamic Society of North America
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const aladhanUrl = `https://api.aladhan.com/v1/timings/${date}?latitude=${coords.lat}&longitude=${coords.lon}&method=${method}&iso8601=true`
    const resp = await fetch(aladhanUrl, { headers: { 'User-Agent': 'DZ-Agent-Worker/1.0' }, signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000); return ctrl.signal })() })
    if (!resp.ok) throw new Error(`aladhan ${resp.status}`)
    const json = await resp.json()
    const timings = json.data?.timings || {}
    const hijri = json.data?.date?.hijri || {}
    const data = {
      city: coords.label || city,
      country: 'Algeria',
      source: 'aladhan.com',
      date: new Date().toLocaleDateString('ar-DZ'),
      hijri: hijri.date || '',
      hijriMonth: hijri.month?.ar || '',
      times: {
        'الفجر': timings['Fajr'] || '--',
        'الشروق': timings['Sunrise'] || '--',
        'الظهر': timings['Dhuhr'] || '--',
        'العصر': timings['Asr'] || '--',
        'المغرب': timings['Maghrib'] || '--',
        'العشاء': timings['Isha'] || '--',
      },
      status: 'ok'
    }
    WORKER_PRAYER_CACHE.data = data
    WORKER_PRAYER_CACHE.ts = now
    WORKER_PRAYER_CACHE.key = cacheKey
    return new Response(JSON.stringify(data), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  } catch (err) {
    console.error('[Worker:Prayer] Failed:', err.message)
    return new Response(JSON.stringify({
      city: coords.label || city, country: 'Algeria', source: 'unavailable',
      date: new Date().toLocaleDateString('ar-DZ'),
      times: { 'الفجر': '--', 'الشروق': '--', 'الظهر': '--', 'العصر': '--', 'المغرب': '--', 'العشاء': '--' },
      error: 'تعذّر جلب مواقيت الصلاة حالياً', status: 'unavailable'
    }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }
}

async function fetchWorkerNewsFallback(request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return null
  }

  const messages = Array.isArray(payload?.messages) ? payload.messages : []
  const lastUserMessage = [...messages]
    .reverse()
    .find(message => message?.role === 'user' && typeof message.content === 'string')
    ?.content
    ?.trim() || ''

  const isAlgeriaNewsQuery = /الجزائر|الجزاير|algeria|alg[eé]rie/i.test(lastUserMessage)
  if (!isAlgeriaNewsQuery || !WORKER_NEWS_QUERY_RE.test(lastUserMessage)) return null

  const settled = await Promise.allSettled(
    WORKER_NEWS_FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: {
          Accept: 'application/rss+xml,application/xml,text/xml,*/*',
          'User-Agent': 'DZ-Agent-Worker/1.0 (+https://dzagent.app)',
        },
        signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 6500); return ctrl.signal })(),
      })
      if (!response.ok) return []
      return parseWorkerRss(await response.text(), feed.name)
    }),
  )

  const seen = new Set()
  const items = settled
    .flatMap(result => result.status === 'fulfilled' ? result.value : [])
    .filter(item => {
      const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.pubDate || '') || 0
      const bTime = Date.parse(b.pubDate || '') || 0
      return bTime - aTime
    })
    .slice(0, 20)

  if (!items.length) return null

  const date = new Date().toLocaleDateString('ar-DZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const content = [
    `## 📰 آخر أخبار الجزائر — ${date}`,
    '',
    ...items.map(item => {
      const link = item.link ? ` [عرض الخبر](${item.link})` : ''
      return `- **${item.title}** — *${item.source}*${link}`
    }),
    '',
    '---',
    '> ℹ️ تم جلب العناوين مباشرة من RSS عبر Cloudflare Worker.',
  ].join('\n')

  return new Response(JSON.stringify({
    content,
    status: 'rss_worker_direct',
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * Copy CF Workers secrets/vars into process.env so server.js finds its keys.
 */
function injectEnv(env) {
  for (const [key, val] of Object.entries(env)) {
    if (typeof val === 'string' && !process.env[key]) {
      process.env[key] = val
    }
  }
  process.env.CF_PAGES  = '1'
  process.env.NODE_ENV  = 'production'
}

async function getApp(env) {
  if (expressApp) return expressApp
  injectEnv(env)
  const { app } = await import('../server.js')
  expressApp = app
  return expressApp
}

/**
 * Bridge a CF Workers Request into Express and collect the response.
 */
async function handleWithExpress(app, cfRequest) {
  const url = new URL(cfRequest.url)

  // Buffer request body
  let bodyBuf = null
  if (cfRequest.method !== 'GET' && cfRequest.method !== 'HEAD') {
    try { bodyBuf = Buffer.from(await cfRequest.arrayBuffer()) } catch {}
  }

  // Flatten headers into plain object
  const reqHeaders = {}
  cfRequest.headers.forEach((v, k) => { reqHeaders[k.toLowerCase()] = v })
  // Disable compression: CF Workers handles its own gzip/brotli.
  // Without this, Node's `compression` middleware would pipe through a
  // zlib Transform stream that our fake res can't handle correctly.
  reqHeaders['accept-encoding'] = 'identity'

  // Read JSON once at the Worker boundary. Express's body-parser expects a
  // native IncomingMessage and can otherwise wait indefinitely on a bridged
  // stream in the Workers runtime. Passing the parsed object and a zero body
  // length makes body-parser take its normal "no body left to read" path.
  let parsedBody
  const contentType = reqHeaders['content-type'] || ''
  if (bodyBuf?.length && /\bapplication\/json\b/i.test(contentType)) {
    try {
      parsedBody = JSON.parse(bodyBuf.toString('utf8'))
      reqHeaders['content-length'] = '0'
      delete reqHeaders['transfer-encoding']
    } catch {
      // Leave malformed JSON to Express so it returns its usual 400 response.
    }
  }

  // ── IncomingMessage-compatible request ───────────────────────────────────
  // body-parser relies on the request being a real Node readable stream. A
  // plain object with hand-written `on()`/`read()` methods can leave raw-body
  // waiting forever in Workers, which results in a 1101/hung request.
  const req = Readable.from(bodyBuf ? [bodyBuf] : [])
  Object.assign(req, {
    method:            cfRequest.method,
    url:               url.pathname + url.search,  // WRITABLE — no crash
    headers:           reqHeaders,
    httpVersion:       '1.1',
    httpVersionMajor:  1,
    httpVersionMinor:  1,
    complete:          true,
    readable:          true,
    socket:    { remoteAddress: '127.0.0.1', encrypted: url.protocol === 'https:', destroy() {} },
    connection:{ remoteAddress: '127.0.0.1', encrypted: url.protocol === 'https:' },
    _body:     bodyBuf,
    body:              parsedBody,
  })

  // ── Fake ServerResponse (res) ─────────────────────────────────────────────
  return new Promise((resolve) => {
    const resHdrs = {}
    const chunks  = []
    let   sc      = 200
    let   settled = false

    function finish() {
      if (settled) return
      settled = true
      const body = chunks.length ? Buffer.concat(chunks) : null
      const cfHdrs = new Headers()
      for (const [k, v] of Object.entries(resHdrs)) {
        if (Array.isArray(v)) v.forEach(val => cfHdrs.append(k, String(val)))
        else cfHdrs.set(k, String(v))
      }
      resolve(new Response(body, { status: res.statusCode || sc, headers: cfHdrs }))
    }

    const res = {
      statusCode:          200,
      statusMessage:       'OK',
      writableEnded:       false,
      finished:            false,
      headersSent:         false,
      locals:              {},

      status(code)            { this.statusCode = code; return this },
      writeHead(code, mOrH, h){ this.statusCode = code; if (typeof mOrH==='object') Object.assign(resHdrs,mOrH); if(h) Object.assign(resHdrs,h); return this },
      setHeader(k,v)          { resHdrs[k.toLowerCase()] = v; return this },
      removeHeader(k)         { delete resHdrs[k.toLowerCase()] },
      getHeader(k)            { return resHdrs[k.toLowerCase()] },
      getHeaders()            { return { ...resHdrs } },
      hasHeader(k)            { return k.toLowerCase() in resHdrs },
      flushHeaders()          {},

      write(chunk, enc, cb) {
        if (chunk) {
          chunks.push(typeof chunk === 'string'
            ? Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8')
            : Buffer.from(chunk))
        }
        if (typeof enc === 'function') enc()
        if (typeof cb  === 'function') cb()
        return true
      },

      end(data, enc, cb) {
        if (data && data !== '') {
          if (typeof data === 'string')
            chunks.push(Buffer.from(data, typeof enc === 'string' ? enc : 'utf8'))
          else if (data)
            chunks.push(Buffer.from(data))
        }
        if (typeof data === 'function') data()
        if (typeof enc  === 'function') enc()
        if (typeof cb   === 'function') cb()
        this.writableEnded = this.finished = this.headersSent = true
        finish()
        return this
      },

      json(data)       { this.setHeader('content-type','application/json; charset=utf-8'); this.end(JSON.stringify(data)) },
      send(data)       { this.end(data ?? '') },
      sendStatus(code) { this.statusCode = code; this.end('') },
      type(t)          { this.setHeader('content-type', t.includes('/') ? t : `text/${t}`); return this },

      redirect(urlOrCode, maybeUrl) {
        const [code, loc] = typeof urlOrCode === 'number' ? [urlOrCode, maybeUrl] : [302, urlOrCode]
        this.statusCode = code
        this.setHeader('location', loc)
        this.end('')
      },

      // EventEmitter stubs (Express uses these)
      on()            { return this },
      once()          { return this },
      emit()          {},
      removeListener(){ return this },
      destroy()       {},
      writable:             true,
      writableHighWaterMark: 16384,
      writableLength:        0,
    }

    try {
      app(req, res, (err) => {
        if (err) {
          res.statusCode = 500
          resHdrs['content-type'] = 'application/json'
          chunks.length = 0
          chunks.push(Buffer.from(JSON.stringify({ error: 'Handler error', message: err?.message })))
        }
        finish()
      })
    } catch (err) {
      resolve(new Response(
        JSON.stringify({ error: 'Server error', message: err?.message }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      ))
    }
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const isApiOrWebSocketPath =
      url.pathname === '/api' ||
      url.pathname.startsWith('/api/') ||
      url.pathname === '/ws' ||
      url.pathname.startsWith('/ws/')

    // ── Static assets → ASSETS binding (dist/) ────────────────────────────
    if (!isApiOrWebSocketPath) {
      if (env.ASSETS) {
        const asset = await env.ASSETS.fetch(request)
        // Keep the public brand correct even if an edge has a stale HTML
        // asset from before the rename. This only touches user-facing shell
        // metadata; routes, script URLs, and all application behavior remain
        // unchanged.
        if (
          asset.ok &&
          (url.pathname === '/' ||
            url.pathname === '/index.html' ||
            url.pathname === '/manifest.webmanifest')
        ) {
          const headers = new Headers(asset.headers)
          const body = (await asset.text()).replaceAll('DZ GPT', 'DZ AGENT')
          return new Response(body, { status: asset.status, headers })
        }

        // BrowserRouter needs the application shell for direct navigations and
        // refreshes such as /dz-agent. Only fall back for document-like
        // requests or extensionless paths: a missing .js/.css/image must stay
        // a real 404, and /api/* and /ws/* never enter this branch.
        const lastPathSegment = url.pathname.split('/').pop() || ''
        const acceptsHtml = (request.headers.get('accept') || '')
          .toLowerCase()
          .includes('text/html')
        const isDocumentRequest = request.method === 'GET' || request.method === 'HEAD'
        const isExtensionlessPath = !lastPathSegment.includes('.')

        if (isDocumentRequest && (acceptsHtml || isExtensionlessPath)) {
          const indexRequest = new Request(new URL('/index.html', request.url), {
            method: request.method,
            headers: request.headers,
          })
          const spaShell = await env.ASSETS.fetch(indexRequest)
          if (spaShell.ok) return spaShell
        }

        return asset
      }
      return new Response('Not Found', { status: 404 })
    }

    // ── API routes → Express ───────────────────────────────────────────────
    try {
      // Preserve the body for a Worker-native fallback. The Express bridge
      // consumes the original stream before we can inspect its response.
      const newsRequest = (
        request.method === 'POST' &&
        url.pathname === '/api/dz-agent-chat'
      ) ? request.clone() : null
      // Serve the Algeria-news card before loading the Node compatibility
      // bridge. This makes the keyless news path independent of Express,
      // whose optional stream modules can fail during a Worker cold start.
      if (newsRequest) {
        const directNews = await fetchWorkerNewsFallback(newsRequest)
        if (directNews) return directNews
      }

      // Direct Worker-native routes (no server.js needed)
      if (url.pathname === '/api/dz-agent/weather' && request.method === 'GET') {
        return fetchWeatherDirect(request)
      }
      if (url.pathname === '/api/dz-agent/prayer' && request.method === 'GET') {
        return fetchPrayerDirect(request)
      }

      const app = await getApp(env)
      const response = await handleWithExpress(app, request)
      return response
    } catch (err) {
      console.error('[Worker] Fatal:', err?.message, '\n', err?.stack?.split('\n').slice(0,3).join('\n'))
      return new Response(
        JSON.stringify({ error: 'Server error', message: err?.message }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      )
    }
  },
}
