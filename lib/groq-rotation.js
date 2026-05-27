/**
 * lib/groq-rotation.js — Shared Groq Key Rotation Pool
 *
 * Collects ALL Groq keys from env:
 *   GROQ_API_KEY, AI_API_KEY, AI_API_KEY_2 … AI_API_KEY_10
 *
 * Exports:
 *   getGroqKeyPool()          → string[]   all configured keys
 *   pickGroqKey()             → string|null best available key (least-used, not cooling)
 *   markGroqSuccess(key, ms)  → void        record a successful call
 *   markGroqRateLimit(key)    → void        429 — 60s cooldown
 *   markGroqError(key)        → void        other error — 30s cooldown
 *   groqKeyCount()            → number      total configured keys
 */

const COOLDOWN_RATE_LIMIT_MS = 60_000   // 429 → 60s off
const COOLDOWN_ERROR_MS      = 30_000   // other error → 30s off
const MAX_CONSECUTIVE_ERRORS = 3        // disable key after 3 in a row

const _stats = new Map()

function _stat(key) {
  if (!_stats.has(key)) {
    _stats.set(key, {
      requests: 0,
      errors: 0,
      consecutive: 0,
      totalMs: 0,
      avgMs: 0,
      cooldownUntil: 0,
    })
  }
  return _stats.get(key)
}

function _isCooling(key) {
  return Date.now() < _stat(key).cooldownUntil
}

export function getGroqKeyPool() {
  const seen = new Set()
  const keys = []
  const candidates = [
    process.env.GROQ_API_KEY,
    process.env.AI_API_KEY,
    ...Array.from({ length: 9 }, (_, i) => process.env[`AI_API_KEY_${i + 2}`]),
  ]
  for (const k of candidates) {
    if (k && k.trim() && !seen.has(k)) {
      seen.add(k)
      keys.push(k)
    }
  }
  return keys
}

export function groqKeyCount() {
  return getGroqKeyPool().length
}

/**
 * Returns the best available key with jitter:
 * - skip keys in cooldown
 * - prefer least-used, then fastest avg
 * - add random jitter among keys within ±3 requests of the best (avoids predictable patterns)
 * - if ALL cooling → return soonest-to-recover key anyway
 */
export function pickGroqKey() {
  const all = getGroqKeyPool()
  if (!all.length) return null

  const available = all.filter(k => !_isCooling(k))
  const pool = available.length ? available : [...all].sort((a, b) => _stat(a).cooldownUntil - _stat(b).cooldownUntil)

  pool.sort((a, b) => {
    const sa = _stat(a), sb = _stat(b)
    if (sa.requests !== sb.requests) return sa.requests - sb.requests
    if (sa.avgMs && sb.avgMs) return sa.avgMs - sb.avgMs
    return 0
  })

  // Jitter: pick randomly among keys within ±3 requests of the least-used
  // This prevents predictable traffic patterns that anti-abuse systems can detect
  if (available.length > 1) {
    const bestReqs = _stat(pool[0]).requests
    const candidates = pool.filter(k => _stat(k).requests <= bestReqs + 3)
    const key = candidates[Math.floor(Math.random() * candidates.length)]
    return key
  }

  const key = pool[0]
  if (!available.length) {
    const cd = Math.ceil((_stat(key).cooldownUntil - Date.now()) / 1000)
    console.warn(`[Groq:Rotation] All ${all.length} key(s) cooling — using soonest (${cd}s left)`)
  }
  return key
}

export function markGroqSuccess(key, elapsedMs) {
  const s = _stat(key)
  s.requests++
  s.consecutive = 0
  s.totalMs += elapsedMs
  s.avgMs = Math.round(s.totalMs / s.requests)
}

export function markGroqRateLimit(key) {
  const s = _stat(key)
  s.errors++
  s.consecutive++
  s.cooldownUntil = Date.now() + COOLDOWN_RATE_LIMIT_MS
  const idx = getGroqKeyPool().indexOf(key) + 1
  console.warn(`[Groq:Rotation] Key #${idx} rate-limited — cooling 60s`)
}

export function markGroqError(key) {
  const s = _stat(key)
  s.errors++
  s.consecutive++
  if (s.consecutive >= MAX_CONSECUTIVE_ERRORS) {
    s.cooldownUntil = Date.now() + COOLDOWN_ERROR_MS
    const idx = getGroqKeyPool().indexOf(key) + 1
    console.warn(`[Groq:Rotation] Key #${idx} has ${s.consecutive} consecutive errors — cooling 30s`)
  }
}

export function getGroqRotationStats() {
  return getGroqKeyPool().map((k, i) => {
    const s = _stat(k)
    const cooling = _isCooling(k)
    const cdSec = cooling ? Math.ceil((s.cooldownUntil - Date.now()) / 1000) : 0
    return {
      index: i + 1,
      status: cooling ? `CD:${cdSec}s` : 'OK',
      requests: s.requests,
      errors: s.errors,
      avgMs: s.avgMs,
    }
  })
}
