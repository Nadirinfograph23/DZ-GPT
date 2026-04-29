// V3 host bridge — calls back into the local Express app via internal HTTP.
// On Vercel each function is a separate isolate so we still hit the same
// host (loopback) which is fine because all V1/V2 routes live on `app`.

const PORT = Number(process.env.PORT) || 5000

export async function internalFetch(pathOrUrl, init = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `http://127.0.0.1:${PORT}${pathOrUrl}`
  const ac = new AbortController()
  const timeoutMs = init.timeoutMs || 8000
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetch(url, { ...init, signal: ac.signal })
    if (!r.ok) return null
    const ct = r.headers.get('content-type') || ''
    return ct.includes('json') ? r.json() : r.text()
  } catch {
    return null
  } finally { clearTimeout(t) }
}
