/**
 * Small JSON body parser for serverless bundles.
 *
 * Express's body-parser/raw-body dependency can be miscompiled by the Vercel
 * ESM bundle. This parser works with both Node request streams and Vercel's
 * already-parsed req.body without depending on iconv-lite.
 */
export function jsonBodyParser(options = {}) {
  const limitText = String(options.limit || '1mb').toLowerCase()
  const match = limitText.match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb|b)?$/)
  const multiplier = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 }[match?.[2] || 'b'] || 1
  const limit = match ? Number(match[1]) * multiplier : 1024 * 1024

  return (req, res, next) => {
    if (req.body !== undefined || !['POST', 'PUT', 'PATCH'].includes(req.method)) return next()
    const contentType = String(req.headers['content-type'] || '').toLowerCase()
    if (!contentType.includes('application/json')) return next()

    let raw = ''
    let size = 0
    let settled = false
    const fail = (status, message) => {
      if (settled) return
      settled = true
      res.status(status).json({ error: message })
    }
    req.setEncoding('utf8')
    req.on('data', chunk => {
      if (settled) return
      size += Buffer.byteLength(chunk)
      if (size > limit) {
        req.removeAllListeners('data')
        fail(413, 'Request body too large')
        req.resume()
        return
      }
      raw += chunk
    })
    req.on('end', () => {
      if (settled) return
      try {
        req.body = raw.trim() ? JSON.parse(raw) : {}
        settled = true
        next()
      } catch {
        fail(400, 'Invalid JSON body')
      }
    })
    req.on('error', () => fail(400, 'Unable to read request body'))
  }
}