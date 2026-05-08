/**
 * clone-engine/fetcher.js
 * Multi-strategy HTML fetcher with anti-bot headers, proxy fallback chain,
 * and redirect following. Never throws — always returns { html, strategy, error? }.
 */

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
]
function pickUA() { return UA_POOL[Math.floor(Math.random() * UA_POOL.length)] }

function browserHeaders(extra = {}) {
  return {
    'User-Agent': pickUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,ar;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'DNT': '1',
    ...extra,
  }
}

async function tryFetch(url, timeout = 14000) {
  const r = await fetch(url, {
    headers: browserHeaders(),
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('html') && !ct.includes('text') && !ct.includes('xml') && !ct.includes('json')) {
    throw new Error(`Non-HTML content-type: ${ct}`)
  }
  return await r.text()
}

async function tryAllOrigins(url, timeout = 12000) {
  const api = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
  const r = await fetch(api, { signal: AbortSignal.timeout(timeout) })
  if (!r.ok) throw new Error(`allorigins HTTP ${r.status}`)
  const data = await r.json()
  if (!data?.contents) throw new Error('allorigins: empty contents')
  return data.contents
}

async function tryCodeTabs(url, timeout = 12000) {
  const api = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
  const r = await fetch(api, { signal: AbortSignal.timeout(timeout) })
  if (!r.ok) throw new Error(`codetabs HTTP ${r.status}`)
  const text = await r.text()
  if (!text || text.length < 100) throw new Error('codetabs: empty response')
  return text
}

async function tryCorsBridge(url, timeout = 12000) {
  const api = `https://corsproxy.io/?${encodeURIComponent(url)}`
  const r = await fetch(api, {
    headers: browserHeaders(),
    signal: AbortSignal.timeout(timeout),
  })
  if (!r.ok) throw new Error(`corsproxy HTTP ${r.status}`)
  return await r.text()
}

/**
 * Main export — tries strategies in order until one succeeds.
 * Returns { html, strategy, length, error? }
 */
export async function fetchHtmlMultiStrategy(url) {
  const strategies = [
    { name: 'direct',      fn: () => tryFetch(url) },
    { name: 'allorigins',  fn: () => tryAllOrigins(url) },
    { name: 'codetabs',    fn: () => tryCodeTabs(url) },
    { name: 'corsproxy',   fn: () => tryCorsBridge(url) },
  ]

  let lastErr = null
  for (const { name, fn } of strategies) {
    try {
      const html = await fn()
      if (html && html.length > 200) {
        console.log(`[CloneEngine:fetch] ✓ ${name} — ${html.length} bytes`)
        return { html, strategy: name, length: html.length }
      }
      console.warn(`[CloneEngine:fetch] ${name} returned too-short response`)
    } catch (err) {
      lastErr = err
      console.warn(`[CloneEngine:fetch] ${name} failed: ${err.message}`)
    }
  }
  return { html: '', strategy: 'none', length: 0, error: lastErr?.message || 'All strategies failed' }
}
