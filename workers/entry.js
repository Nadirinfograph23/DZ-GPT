/**
 * Cloudflare Workers entry point — DZ-GPT
 * =========================================
 * Direct bridge: CF Workers Request → Express (Node.js) → CF Workers Response
 *
 * Why a custom bridge instead of @whatwg-node/server:
 *   @whatwg-node/server passes a WhatWG Request directly to Express as `req`.
 *   Express then tries `req.url = req.url.slice(1)` which throws
 *   "Cannot assign to read only property 'url'" on the native CF Request.
 *   This bridge creates a plain mutable object as req — avoiding the crash.
 */

let expressApp = null

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

  // ── Fake IncomingMessage (req) ────────────────────────────────────────────
  const req = {
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
    _bodyRead: false,
    read()     { if (!this._bodyRead) { this._bodyRead = true; return this._body } return null },
    pipe(dest) { if (this._body) dest.write(this._body); dest.end(); return dest },
    resume()   { return this },
    pause()    { return this },
    destroy()  {},
    setEncoding() { return this },
    unpipe()   { return this },
    on(ev, fn) {
      if (ev === 'data' && this._body) setTimeout(() => fn(this._body), 0)
      if (ev === 'end')               setTimeout(() => fn(), 0)
      if (ev === 'close')             setTimeout(() => fn(), 0)
      return this
    },
    once(ev, fn)    { return this.on(ev, fn) },
    removeListener(){ return this },
    emit()          { return false },
  }

  // ── Fake ServerResponse (res) ─────────────────────────────────────────────
  return new Promise((resolve) => {
    const resHdrs = {}
    const chunks  = []
    let   sc      = 200

    function finish() {
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

    // ── Static assets → ASSETS binding (dist/) ────────────────────────────
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/ws/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request)
      return new Response('Not Found', { status: 404 })
    }

    // ── API routes → Express ───────────────────────────────────────────────
    try {
      const app = await getApp(env)
      return await handleWithExpress(app, request)
    } catch (err) {
      console.error('[Worker] Fatal:', err?.message, '\n', err?.stack?.split('\n').slice(0,3).join('\n'))
      return new Response(
        JSON.stringify({ error: 'Server error', message: err?.message }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      )
    }
  },
}
