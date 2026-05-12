/**
 * clone-engine/fetcher.js  — V2
 * Multi-strategy HTML fetcher with anti-bot headers, proxy fallback chain,
 * redirect following, and enhanced Jina/scraping integration.
 * Never throws — always returns { html, strategy, error? }.
 */

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
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
    'Sec-Ch-Ua': '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1',
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

async function tryJinaReader(url, timeout = 20000) {
  // Jina AI Reader — bypasses Cloudflare, renders JS-heavy pages, returns full HTML
  const api = `https://r.jina.ai/${url}`
  const r = await fetch(api, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml,*/*',
      'X-Return-Format': 'html',
      'X-With-Images-Summary': 'true',
      'X-With-Links-Summary': 'true',
      'X-No-Cache': 'true',
      'User-Agent': pickUA(),
    },
    signal: AbortSignal.timeout(timeout),
  })
  if (!r.ok) throw new Error(`jina HTTP ${r.status}`)
  const text = await r.text()
  if (!text || text.length < 200) throw new Error('jina: too short')
  return text
}

async function tryScrapingBeePublic(url, timeout = 15000) {
  // Public scraping proxy alternative — htmlpreview style approach
  const encoded = encodeURIComponent(url)
  const api = `https://thingproxy.freeboard.io/fetch/${encoded}`
  const r = await fetch(api, {
    headers: browserHeaders(),
    signal: AbortSignal.timeout(timeout),
  })
  if (!r.ok) throw new Error(`thingproxy HTTP ${r.status}`)
  const text = await r.text()
  if (!text || text.length < 200) throw new Error('thingproxy: too short')
  return text
}

async function tryWebProxy(url, timeout = 14000) {
  // htmlpreview.github.io style — works for many static sites
  const api = `https://api.webscraping.ai/html?url=${encodeURIComponent(url)}&timeout=10000`
  const r = await fetch(api, {
    headers: { 'User-Agent': pickUA() },
    signal: AbortSignal.timeout(timeout),
  })
  if (!r.ok) throw new Error(`webscraping.ai HTTP ${r.status}`)
  const text = await r.text()
  if (!text || text.length < 200) throw new Error('webscraping.ai: too short')
  return text
}

async function tryWaybackMachine(url, timeout = 15000) {
  // Wayback Machine CDX API - try to get last archived snapshot
  const cdxApi = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`
  const r = await fetch(cdxApi, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`wayback CDX HTTP ${r.status}`)
  const data = await r.json()
  const snapshotUrl = data?.archived_snapshots?.closest?.url
  if (!snapshotUrl) throw new Error('wayback: no snapshot found')
  const r2 = await fetch(snapshotUrl, {
    headers: browserHeaders(),
    signal: AbortSignal.timeout(timeout),
  })
  if (!r2.ok) throw new Error(`wayback snapshot HTTP ${r2.status}`)
  return await r2.text()
}

/**
 * Race a set of strategies in parallel — return the first that succeeds.
 * If all fail, return null.
 */
async function raceStrategies(candidates) {
  return new Promise((resolve) => {
    let settled = 0
    let won = false
    if (candidates.length === 0) { resolve(null); return }
    for (const { name, fn } of candidates) {
      fn()
        .then(html => {
          if (!won && html && html.length > 200) {
            won = true
            console.log(`[CloneEngine:race] ✓ ${name} — ${html.length} bytes`)
            resolve({ html, strategy: name, length: html.length })
          } else {
            settled++
            if (settled === candidates.length && !won) resolve(null)
          }
        })
        .catch(err => {
          console.warn(`[CloneEngine:race] ${name} failed: ${err.message}`)
          settled++
          if (settled === candidates.length && !won) resolve(null)
        })
    }
  })
}

/**
 * Main export — races top strategies in parallel, then falls back sequentially.
 * Returns { html, strategy, length, error? }
 */
export async function fetchHtmlMultiStrategy(url) {
  // Wave 1: race the 3 fastest strategies simultaneously (fastest wins)
  const wave1 = await raceStrategies([
    { name: 'direct',     fn: () => tryFetch(url, 10000) },
    { name: 'allorigins', fn: () => tryAllOrigins(url, 9000) },
    { name: 'jina-reader',fn: () => tryJinaReader(url, 14000) },
  ])
  if (wave1) return wave1

  // Wave 2: sequential fallbacks if wave 1 all failed
  const fallbacks = [
    { name: 'codetabs',        fn: () => tryCodeTabs(url) },
    { name: 'corsproxy',       fn: () => tryCorsBridge(url) },
    { name: 'thingproxy',      fn: () => tryScrapingBeePublic(url) },
    { name: 'wayback-machine', fn: () => tryWaybackMachine(url) },
  ]
  let lastErr = null
  for (const { name, fn } of fallbacks) {
    try {
      const html = await fn()
      if (html && html.length > 200) {
        console.log(`[CloneEngine:fallback] ✓ ${name} — ${html.length} bytes`)
        return { html, strategy: name, length: html.length }
      }
      console.warn(`[CloneEngine:fallback] ${name} returned too-short response`)
    } catch (err) {
      lastErr = err
      console.warn(`[CloneEngine:fallback] ${name} failed: ${err.message}`)
    }
  }
  return { html: '', strategy: 'none', length: 0, error: lastErr?.message || 'All strategies failed' }
}
