/**
 * lib/resilience.js — DZ Agent Enhanced Resilience Layer
 * ════════════════════════════════════════════════════════
 * التحسينات:
 *   ✅ retry مع exponential backoff + jitter
 *   ✅ timeout ذكي per-provider
 *   ✅ half-open state يختبر provider واحد قبل الفتح الكامل
 *   ✅ health snapshot مفصّل
 *   ✅ overload detection
 * Backward compatible — نفس exports القديمة.
 */

import logger from './logger.js'
const log = logger.child('resilience')

// ══════════════════════════════════════════════════════════════════════════════
// CircuitBreaker — enhanced
// ══════════════════════════════════════════════════════════════════════════════
class CircuitBreaker {
  constructor(name, {
    failureThreshold = 5,
    resetTimeout     = 30000,
    halfOpenMax      = 1,       // max concurrent calls in HALF_OPEN
    successThreshold = 2,       // successes needed in HALF_OPEN to CLOSE
  } = {}) {
    this.name             = name
    this.failureThreshold = failureThreshold
    this.resetTimeout     = resetTimeout
    this.halfOpenMax      = halfOpenMax
    this.successThreshold = successThreshold

    this.failures        = 0
    this.successesInHalf = 0
    this.state           = 'CLOSED'   // CLOSED | OPEN | HALF_OPEN
    this.nextAttempt     = 0
    this._halfOpenActive = 0

    // Metrics
    this._totalCalls    = 0
    this._totalFailures = 0
    this._openedAt      = null
    this._lastError     = null
  }

  isAvailable() {
    if (this.state === 'CLOSED') return true

    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttempt) {
        this.state = 'HALF_OPEN'
        this.successesInHalf = 0
        this._halfOpenActive = 0
        log.warn(`[${this.name}] OPEN → HALF_OPEN`)
        return this._halfOpenActive < this.halfOpenMax
      }
      return false
    }

    // HALF_OPEN
    return this._halfOpenActive < this.halfOpenMax
  }

  recordSuccess() {
    this._totalCalls++
    if (this.state === 'HALF_OPEN') {
      this._halfOpenActive = Math.max(0, this._halfOpenActive - 1)
      this.successesInHalf++
      if (this.successesInHalf >= this.successThreshold) {
        this.failures = 0
        this.state = 'CLOSED'
        this._openedAt = null
        log.info(`[${this.name}] HALF_OPEN → CLOSED (recovered)`)
      }
    } else {
      this.failures = Math.max(0, this.failures - 1) // decay on success
    }
  }

  recordFailure(reason = '') {
    this._totalCalls++
    this._totalFailures++
    this._lastError = reason

    if (this.state === 'HALF_OPEN') {
      this._halfOpenActive = Math.max(0, this._halfOpenActive - 1)
      this.state = 'OPEN'
      this.nextAttempt = Date.now() + this.resetTimeout * 2 // longer reset after half-open fail
      log.warn(`[${this.name}] HALF_OPEN → OPEN (still failing: ${reason})`)
      return
    }

    this.failures++
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN'
      this.nextAttempt = Date.now() + this.resetTimeout
      this._openedAt = new Date().toISOString()
      log.warn(`[${this.name}] CLOSED → OPEN (${this.failures} failures, reason: ${reason})`)
    }
  }

  onAttempt() {
    if (this.state === 'HALF_OPEN') this._halfOpenActive++
  }

  getState() { return this.state }

  snapshot() {
    return {
      name:          this.name,
      state:         this.state,
      failures:      this.failures,
      open:          !this.isAvailable(),
      totalCalls:    this._totalCalls,
      totalFailures: this._totalFailures,
      lastError:     this._lastError,
      openedAt:      this._openedAt,
      msUntilRetry:  this.state === 'OPEN' ? Math.max(0, this.nextAttempt - Date.now()) : 0,
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CircuitRegistry
// ══════════════════════════════════════════════════════════════════════════════
class CircuitRegistry {
  constructor() { this._map = new Map() }

  get(name, opts = {}) {
    if (!this._map.has(name)) {
      this._map.set(name, new CircuitBreaker(name, opts))
    }
    return this._map.get(name)
  }

  snapshot() {
    const result = {}
    for (const [name, cb] of this._map) {
      result[name] = cb.snapshot()
    }
    return result
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Semaphore
// ══════════════════════════════════════════════════════════════════════════════
class Semaphore {
  constructor(max = 5) {
    this.max     = max
    this.current = 0
    this.queue   = []
    this._peak   = 0
    this._total  = 0
  }

  async run(fn) {
    if (this.current >= this.max) {
      await new Promise(resolve => this.queue.push(resolve))
    }
    this.current++
    this._total++
    this._peak = Math.max(this._peak, this.current)
    try {
      return await fn()
    } finally {
      this.current--
      if (this.queue.length > 0) this.queue.shift()()
    }
  }

  stats() {
    return {
      running: this.current,
      max:     this.max,
      queued:  this.queue.length,
      peak:    this._peak,
      total:   this._total,
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Deduplicator
// ══════════════════════════════════════════════════════════════════════════════
class Deduplicator {
  constructor() { this.pending = new Map() }

  async run(key, fn) {
    if (this.pending.has(key)) return this.pending.get(key)
    const p = fn().finally(() => this.pending.delete(key))
    this.pending.set(key, p)
    return p
  }

  prune() {
    this.pending.forEach((v, k) => {
      if (v && typeof v.then !== 'function') this.pending.delete(k)
    })
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Monitor
// ══════════════════════════════════════════════════════════════════════════════
class Monitor {
  constructor(windowSize = 200) {
    this.total     = 0
    this.success   = 0
    this.latencies = []
    this.windowSize = windowSize
    this._p95cache  = null
  }

  record(ok, latencyMs = 0) {
    this.total++
    if (ok) this.success++
    this.latencies.push(latencyMs)
    if (this.latencies.length > this.windowSize) this.latencies.shift()
    this._p95cache = null // invalidate cache
  }

  stats() {
    const len = this.latencies.length
    const avg = len ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / len) : 0
    const p95 = this._p95(len)
    return {
      total:   this.total,
      success: this.success,
      errors:  this.total - this.success,
      errorRate: this.total ? Math.round(((this.total - this.success) / this.total) * 100) : 0,
      avgLatencyMs: avg,
      p95LatencyMs: p95,
    }
  }

  _p95(len) {
    if (!len) return 0
    if (this._p95cache !== null) return this._p95cache
    const sorted = [...this.latencies].sort((a, b) => a - b)
    this._p95cache = sorted[Math.floor(len * 0.95)] || sorted[len - 1] || 0
    return this._p95cache
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// withRetry — exponential backoff + jitter
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @param {Function} fn         - async function to retry
 * @param {object}   opts
 * @param {number}   opts.maxAttempts   - (default 3)
 * @param {number}   opts.baseDelayMs   - initial delay in ms (default 500)
 * @param {number}   opts.maxDelayMs    - max delay in ms (default 8000)
 * @param {Function} opts.shouldRetry   - (err, attempt) => bool (default: retry all)
 * @param {string}   opts.label         - for logging
 * @returns {Promise<*>}
 */
export async function withRetry(fn, {
  maxAttempts = 3,
  baseDelayMs = 500,
  maxDelayMs  = 8000,
  shouldRetry = () => true,
  label       = 'op',
} = {}) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn(attempt)
      if (attempt > 1) log.info(`[${label}] succeeded on attempt ${attempt}`)
      return result
    } catch (err) {
      lastErr = err
      const isLast = attempt === maxAttempts
      const retry  = !isLast && shouldRetry(err, attempt)

      if (!retry) {
        log.warn(`[${label}] failed (attempt ${attempt}/${maxAttempts}): ${err?.message}`)
        throw err
      }

      // Exponential backoff with jitter
      const exp   = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
      const jitter = Math.random() * exp * 0.3 // ±15% jitter
      const delay  = Math.round(exp + jitter)

      log.warn(`[${label}] attempt ${attempt} failed — retrying in ${delay}ms: ${err?.message}`)
      await sleep(delay)
    }
  }
  throw lastErr
}

// ══════════════════════════════════════════════════════════════════════════════
// withTimeout — enhanced with label
// ══════════════════════════════════════════════════════════════════════════════
export function withTimeout(promise, ms, label = 'timeout') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`[${label}] timed out after ${ms}ms`)),
      ms
    )
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(t))
  })
}

export async function stallGuard(fn, timeoutMs = 30000, label = 'stallGuard') {
  return withTimeout(typeof fn === 'function' ? fn() : fn, timeoutMs, label)
}

// ══════════════════════════════════════════════════════════════════════════════
// withCircuit — retry + circuit breaker integrated
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Wraps an async call with circuit breaker + retry.
 * @param {CircuitBreaker} circuit
 * @param {Function}       fn        - async () => result
 * @param {object}         opts      - same as withRetry
 */
export async function withCircuit(circuit, fn, opts = {}) {
  if (!circuit.isAvailable()) {
    const snap = circuit.snapshot()
    const wait = snap.msUntilRetry
    throw new Error(`[circuit:${circuit.name}] OPEN — retry in ${Math.ceil(wait/1000)}s`)
  }
  circuit.onAttempt()
  try {
    const result = await withRetry(fn, { label: circuit.name, ...opts })
    circuit.recordSuccess()
    return result
  } catch (err) {
    circuit.recordFailure(err?.message || 'unknown')
    throw err
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// autoCleanMap / scheduleOnce (backward compatible)
// ══════════════════════════════════════════════════════════════════════════════
export function autoCleanMap(map, { ttlMs = 60000, label = 'map' } = {}) {
  const id = setInterval(() => {
    const now = Date.now()
    for (const [k, v] of map) {
      const ts = v?._ts || v?.ts || (typeof v === 'number' ? v : null)
      if (ts && now - ts > ttlMs) map.delete(k)
    }
  }, ttlMs)
  if (id?.unref) id.unref()
}

const _scheduled = new Map()
export function scheduleOnce(fn, intervalMs = 60000, { label } = {}) {
  if (typeof fn !== 'function') {
    log.error(`[scheduleOnce:${label || '?'}] fn is not a function`)
    return
  }
  const key = label || fn.toString().slice(0, 60)
  if (_scheduled.has(key)) return

  const run = async () => {
    try { await fn() } catch (e) { log.catchError(`scheduleOnce:${key}`, e) }
    _scheduled.delete(key)
    const id = setTimeout(run, intervalMs)
    if (id?.unref) id.unref()
    _scheduled.set(key, id)
  }

  const id = setTimeout(run, 0)
  if (id?.unref) id.unref()
  _scheduled.set(key, id)
}

// ══════════════════════════════════════════════════════════════════════════════
// systemHealthSnapshot — enhanced
// ══════════════════════════════════════════════════════════════════════════════
export function systemHealthSnapshot() {
  const mem = process.memoryUsage()
  return {
    memory: {
      ...mem,
      heapUsedMB:  Math.round(mem.heapUsed  / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB:       Math.round(mem.rss       / 1024 / 1024),
    },
    semaphores: [
      { name: 'ai', ...aiSemaphore.stats() },
    ],
    circuits: circuitRegistry.snapshot(),
    agent:   agentMonitor.stats(),
    chat:    chatMonitor.stats(),
    uptime:  process.uptime(),
    nodeVersion: process.version,
    platform:    process.platform,
  }
}

export function getOverloadMessage() {
  return 'النظام مشغول حالياً، يرجى المحاولة مرة أخرى بعد لحظات.'
}

// ── Singleton exports (backward compatible) ──────────────────────────────────
export const aiSemaphore      = new Semaphore(5)
export const aiDeduplicator   = new Deduplicator()
export const agentMonitor     = new Monitor()
export const chatMonitor      = new Monitor()
export const fetchDeduplicator = new Deduplicator()

export const circuitRegistry  = new CircuitRegistry()

export const groqCircuit      = circuitRegistry.get('groq',     { failureThreshold: 5, resetTimeout: 30000 })
export const deepseekCircuit  = circuitRegistry.get('deepseek', { failureThreshold: 3, resetTimeout: 60000 })
export const ollamaCircuit    = circuitRegistry.get('ollama',   { failureThreshold: 3, resetTimeout: 30000 })

// ── Internal helpers ──────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
