/**
 * lib/server-utils.js
 * Shared server utilities — extracted from server.js for modular architecture.
 * Exports: sanitizeString, resolveGitHubToken, ghHeaders, isValidGithubPath,
 *          isValidGithubRepo, buildScrapingHeaders, randomDelay, resilientFetch, makeCache, MAX_REQ_PER_SEC
 */
import { autoCleanMap } from './resilience.js'

// ── Input sanitizer ──────────────────────────────────────────
export function sanitizeString(str, maxLen = 10000) {
  if (typeof str !== 'string') return ''
  return str.slice(0, maxLen).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

// ── GitHub utilities ─────────────────────────────────────────
export function resolveGitHubToken(reqToken = '') {
  const safe = sanitizeString(reqToken, 300)
  if (safe) return safe
  return process.env.GITHUB_PERSONAL_ACCESS_TOKEN ||
         process.env.GITHUB_TOKEN || ''
}

export function ghHeaders(token) {
  return {
    Authorization: `token ${token}`,
    'User-Agent': 'DZ-GPT-Agent/2.0',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

export function isValidGithubPath(p) {
  if (typeof p !== 'string') return false
  if (p.includes('..') || p.includes('//') || p.startsWith('/')) return false
  return /^[a-zA-Z0-9._\-/\s]+$/.test(p)
}

export function isValidGithubRepo(repo) {
  if (typeof repo !== 'string') return false
  return /^[a-zA-Z0-9._\-]+\/[a-zA-Z0-9._\-]+$/.test(repo)
}

// ── Anti-block header rotation ───────────────────────────────
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
]

const REFERERS = [
  'https://www.google.com/',
  'https://www.google.dz/',
  'https://www.bing.com/',
  'https://duckduckgo.com/',
  'https://search.yahoo.com/',
]

function randomUA() { return UA_POOL[Math.floor(Math.random() * UA_POOL.length)] }
function randomReferer() { return REFERERS[Math.floor(Math.random() * REFERERS.length)] }

export function buildScrapingHeaders(extra = {}) {
  return {
    'User-Agent': randomUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': randomReferer(),
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'DNT': '1',
    ...extra,
  }
}

export function randomDelay(minMs = 300, maxMs = 1200) {
  return new Promise(res => setTimeout(res, minMs + Math.random() * (maxMs - minMs)))
}

// ── Throttle queue ────────────────────────────────────────────
const _THROTTLE_MAP = new Map()
export const MAX_REQ_PER_SEC = 3
autoCleanMap(_THROTTLE_MAP, { ttlMs: 10_000, label: 'throttle-utils' })

function _throttleCheck(url) {
  const domain = (() => { try { return new URL(url).hostname } catch { return 'unknown' } })()
  const now = Date.now()
  const entry = _THROTTLE_MAP.get(domain) || { count: 0, resetAt: now + 1000 }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 1000 }
  if (entry.count >= MAX_REQ_PER_SEC) return false
  entry.count++
  _THROTTLE_MAP.set(domain, entry)
  return true
}

async function _waitForThrottle(url, retries = 8) {
  for (let i = 0; i < retries; i++) {
    if (_throttleCheck(url)) return
    await randomDelay(350, 700)
  }
}

// ── Resilient fetch ───────────────────────────────────────────
export async function resilientFetch(url, opts = {}) {
  const {
    timeout = 12000,
    retries = 3,
    delay = true,
    scrapingHeaders = true,
    extraHeaders = {},
    body = undefined,
    method = 'GET',
  } = opts

  await _waitForThrottle(url)
  let lastErr

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0 && delay) await randomDelay(600 * attempt, 1500 * attempt)
    try {
      const headers = scrapingHeaders
        ? buildScrapingHeaders(extraHeaders)
        : { 'User-Agent': 'DZ-GPT-Agent/1.0', ...extraHeaders }

      const fetchOpts = { method, headers, signal: AbortSignal.timeout(timeout) }
      if (body) fetchOpts.body = body

      const r = await fetch(url, fetchOpts)

      if (r.status === 429) {
        const retryAfter = parseInt(r.headers.get('retry-after') || '5', 10)
        console.warn(`[ResilientFetch] 429 on ${url} — backing off ${retryAfter}s`)
        await randomDelay(retryAfter * 1000, retryAfter * 1000 + 2000)
        lastErr = new Error(`HTTP 429`)
        continue
      }
      if (r.status === 503 || r.status === 502) {
        lastErr = new Error(`HTTP ${r.status}`)
        await randomDelay(1000, 2000)
        continue
      }
      return r
    } catch (err) {
      lastErr = err
      console.warn(`[ResilientFetch] attempt ${attempt + 1}/${retries} failed for ${url}: ${err.message}`)
    }
  }
  throw lastErr || new Error(`resilientFetch failed for ${url}`)
}

// ── Cache factory ─────────────────────────────────────────────
export function makeCache(ttlMs = 10 * 60 * 1000) {
  const store = new Map()
  return {
    get(key) {
      const e = store.get(key)
      if (!e) return null
      if (Date.now() - e.ts > ttlMs) return null
      return e.data
    },
    getStale(key) {
      const e = store.get(key)
      return e ? { data: e.data, ts: e.ts, stale: Date.now() - e.ts > ttlMs } : null
    },
    set(key, data) { store.set(key, { data, ts: Date.now() }) },
    has(key) { return store.has(key) },
    invalidate(key) { store.delete(key) },
    clear() { store.clear() },
    get size() { return store.size },
  }
}
