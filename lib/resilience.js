// ═══════════════════════════════════════════════════════════════════
// DZ Agent — Resilience Layer
// Zero dependencies. Pure Node.js. Additive — does not modify callers.
//
// Exports:
//   Semaphore          — concurrency limiter (prevents AI call pile-up)
//   Deduplicator       — in-flight request dedup (saves API quota)
//   CircuitBreaker     — per-provider fault isolation
//   RequestQueue       — bounded queue with priority + overflow rejection
//   withTimeout        — Promise race with clean abort
//   withRetry          — exponential-backoff retry wrapper
//   stallGuard         — wraps an async fn; always resolves (never hangs)
//   HealthMonitor      — lightweight uptime/failure-rate tracker
//   resilientWrap      — combines semaphore + dedup + circuit + stallGuard
//   scheduleOnce       — single-instance background job (no overlap)
// ═══════════════════════════════════════════════════════════════════

// ─── Semaphore ────────────────────────────────────────────────────────────────
// Limits concurrent async operations. Callers queue when at capacity.
export class Semaphore {
  constructor(max = 5, { name = 'sem' } = {}) {
    this.max = max
    this.name = name
    this._running = 0
    this._queue = []
  }

  acquire() {
    return new Promise((resolve) => {
      if (this._running < this.max) {
        this._running++
        resolve()
      } else {
        this._queue.push(resolve)
      }
    })
  }

  release() {
    if (this._queue.length > 0) {
      const next = this._queue.shift()
      next()
    } else {
      this._running = Math.max(0, this._running - 1)
    }
  }

  async run(fn) {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  get pending() { return this._queue.length }
  get running() { return this._running }

  stats() {
    return { name: this.name, max: this.max, running: this._running, queued: this._queue.length }
  }
}

// ─── Deduplicator ─────────────────────────────────────────────────────────────
// Ensures only ONE in-flight promise exists per cache key.
// Subsequent callers with the same key get the same promise — no duplicate AI calls.
export class Deduplicator {
  constructor({ name = 'dedup', ttlMs = 30_000 } = {}) {
    this.name = name
    this.ttlMs = ttlMs
    this._inflight = new Map() // key → { promise, ts }
  }

  // Run fn() only once per key. Concurrent calls with same key await same promise.
  async run(key, fn) {
    const existing = this._inflight.get(key)
    if (existing) {
      // If the stored promise is not too stale, reuse it
      if (Date.now() - existing.ts < this.ttlMs) {
        return existing.promise
      }
    }

    const promise = Promise.resolve()
      .then(() => fn())
      .finally(() => {
        // Clean up after completion
        const e = this._inflight.get(key)
        if (e && e.promise === promise) {
          this._inflight.delete(key)
        }
      })

    this._inflight.set(key, { promise, ts: Date.now() })
    return promise
  }

  get size() { return this._inflight.size }

  // Cleanup stale entries (call periodically)
  prune() {
    const now = Date.now()
    for (const [k, v] of this._inflight) {
      if (now - v.ts > this.ttlMs * 2) this._inflight.delete(k)
    }
  }

  stats() {
    return { name: this.name, inflight: this._inflight.size }
  }
}

// ─── CircuitBreaker ───────────────────────────────────────────────────────────
// Tracks per-provider failure rate. Opens circuit after threshold;
// auto-resets after cooldown. Prevents cascade failures.
export class CircuitBreaker {
  static CLOSED = 'closed'
  static OPEN   = 'open'
  static HALF   = 'half-open'

  constructor({
    name = 'cb',
    failureThreshold = 5,    // consecutive failures before opening
    successThreshold = 2,    // successes in half-open before closing
    cooldownMs       = 30_000,
    samplingWindowMs = 60_000,
  } = {}) {
    this.name = name
    this.failureThreshold = failureThreshold
    this.successThreshold = successThreshold
    this.cooldownMs = cooldownMs
    this.samplingWindowMs = samplingWindowMs
    this._state = CircuitBreaker.CLOSED
    this._failures = 0
    this._successes = 0
    this._openedAt = 0
    this._calls = 0
    this._totalFailures = 0
    this._totalSuccesses = 0
  }

  get state() {
    if (this._state === CircuitBreaker.OPEN) {
      if (Date.now() - this._openedAt >= this.cooldownMs) {
        this._state = CircuitBreaker.HALF
        this._successes = 0
        console.log(`[CircuitBreaker:${this.name}] → half-open (testing recovery)`)
      }
    }
    return this._state
  }

  isAvailable() {
    return this.state !== CircuitBreaker.OPEN
  }

  recordSuccess() {
    this._totalSuccesses++
    this._calls++
    if (this._state === CircuitBreaker.HALF) {
      this._successes++
      if (this._successes >= this.successThreshold) {
        this._state = CircuitBreaker.CLOSED
        this._failures = 0
        console.log(`[CircuitBreaker:${this.name}] → closed (recovered)`)
      }
    } else {
      this._failures = 0 // reset on success
    }
  }

  recordFailure(reason = '') {
    this._totalFailures++
    this._calls++
    this._failures++
    if (this._failures >= this.failureThreshold && this._state !== CircuitBreaker.OPEN) {
      this._state = CircuitBreaker.OPEN
      this._openedAt = Date.now()
      console.warn(`[CircuitBreaker:${this.name}] → OPEN after ${this._failures} failures (${reason})`)
    }
  }

  async run(fn, fallback = null) {
    if (!this.isAvailable()) {
      console.warn(`[CircuitBreaker:${this.name}] BLOCKED (circuit open)`)
      if (typeof fallback === 'function') return fallback()
      throw new Error(`Circuit open for ${this.name}`)
    }
    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (err) {
      this.recordFailure(err.message)
      throw err
    }
  }

  stats() {
    return {
      name: this.name,
      state: this.state,
      failures: this._failures,
      totalCalls: this._calls,
      totalFailures: this._totalFailures,
      totalSuccesses: this._totalSuccesses,
      cooldownSecondsLeft: this._state === CircuitBreaker.OPEN
        ? Math.max(0, Math.ceil((this.cooldownMs - (Date.now() - this._openedAt)) / 1000))
        : 0,
    }
  }
}

// ─── RequestQueue ─────────────────────────────────────────────────────────────
// Bounded async queue. When at capacity, new requests are rejected immediately
// rather than hanging or crashing. Prevents memory exhaustion under load.
export class RequestQueue {
  constructor({ maxSize = 50, name = 'queue' } = {}) {
    this.maxSize = maxSize
    this.name = name
    this._queue = []
    this._processing = false
    this._totalProcessed = 0
    this._totalRejected = 0
  }

  async enqueue(fn, { priority = 0 } = {}) {
    if (this._queue.length >= this.maxSize) {
      this._totalRejected++
      throw new Error(`[RequestQueue:${this.name}] overloaded — ${this._queue.length} requests queued`)
    }

    return new Promise((resolve, reject) => {
      this._queue.push({ fn, resolve, reject, priority, ts: Date.now() })
      this._queue.sort((a, b) => b.priority - a.priority) // higher priority first
      this._drain()
    })
  }

  _drain() {
    if (this._processing || this._queue.length === 0) return
    this._processing = true
    const { fn, resolve, reject } = this._queue.shift()
    Promise.resolve()
      .then(() => fn())
      .then((result) => {
        this._totalProcessed++
        resolve(result)
      })
      .catch(reject)
      .finally(() => {
        this._processing = false
        this._drain()
      })
  }

  get size() { return this._queue.length }

  stats() {
    return {
      name: this.name,
      queued: this._queue.length,
      maxSize: this.maxSize,
      totalProcessed: this._totalProcessed,
      totalRejected: this._totalRejected,
    }
  }
}

// ─── withTimeout ──────────────────────────────────────────────────────────────
// Race a promise against a timeout. Rejects with a clear error on expiry.
export function withTimeout(promise, ms, label = 'operation') {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[timeout] ${label} exceeded ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// ─── withRetry ────────────────────────────────────────────────────────────────
// Retry with exponential backoff. Skips retry on fatal errors.
export async function withRetry(fn, {
  maxAttempts = 3,
  baseDelayMs = 500,
  maxDelayMs  = 10_000,
  label       = 'fn',
  isFatal     = (err) => false,
} = {}) {
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      lastErr = err
      if (isFatal(err)) throw err
      if (attempt < maxAttempts) {
        const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
        const jitter = Math.random() * 200
        console.warn(`[withRetry:${label}] attempt ${attempt}/${maxAttempts} failed: ${err.message} — retrying in ${Math.round(delay + jitter)}ms`)
        await new Promise(r => setTimeout(r, delay + jitter))
      }
    }
  }
  throw lastErr
}

// ─── stallGuard ───────────────────────────────────────────────────────────────
// Wraps an async fn. ALWAYS resolves — never rejects, never hangs beyond maxMs.
// Returns { ok, value, error, timedOut }.
export async function stallGuard(fn, { maxMs = 30_000, fallbackValue = null, label = 'fn' } = {}) {
  try {
    const value = await withTimeout(Promise.resolve().then(() => fn()), maxMs, label)
    return { ok: true, value, error: null, timedOut: false }
  } catch (err) {
    const timedOut = err.message?.includes('[timeout]')
    if (timedOut) {
      console.warn(`[stallGuard:${label}] timed out after ${maxMs}ms`)
    } else {
      console.warn(`[stallGuard:${label}] error: ${err.message}`)
    }
    return { ok: false, value: fallbackValue, error: err.message, timedOut }
  }
}

// ─── HealthMonitor ────────────────────────────────────────────────────────────
// Tracks rolling success/failure counts and latency for an endpoint or provider.
export class HealthMonitor {
  constructor({ name = 'monitor', windowMs = 60_000, buckets = 12 } = {}) {
    this.name = name
    this.windowMs = windowMs
    this.bucketMs = Math.floor(windowMs / buckets)
    this.buckets = buckets
    this._data = [] // { ts, success, failure, latencySum, latencyCount }
    this._currentBucket = null
    this._totalSuccess = 0
    this._totalFailure = 0
  }

  _bucket() {
    const slotTs = Math.floor(Date.now() / this.bucketMs) * this.bucketMs
    if (!this._currentBucket || this._currentBucket.ts !== slotTs) {
      this._currentBucket = { ts: slotTs, success: 0, failure: 0, latencySum: 0, latencyCount: 0 }
      this._data.push(this._currentBucket)
      // Prune old buckets
      const cutoff = Date.now() - this.windowMs
      while (this._data.length > 0 && this._data[0].ts < cutoff) {
        this._data.shift()
      }
    }
    return this._currentBucket
  }

  record(success, latencyMs = 0) {
    const b = this._bucket()
    if (success) {
      b.success++
      this._totalSuccess++
    } else {
      b.failure++
      this._totalFailure++
    }
    if (latencyMs > 0) {
      b.latencySum += latencyMs
      b.latencyCount++
    }
  }

  stats() {
    const now = Date.now()
    const cutoff = now - this.windowMs
    const recent = this._data.filter(b => b.ts >= cutoff)
    const success = recent.reduce((s, b) => s + b.success, 0)
    const failure = recent.reduce((s, b) => s + b.failure, 0)
    const total = success + failure
    const latSum = recent.reduce((s, b) => s + b.latencySum, 0)
    const latCount = recent.reduce((s, b) => s + b.latencyCount, 0)

    return {
      name: this.name,
      windowSeconds: Math.round(this.windowMs / 1000),
      requests: total,
      successRate: total > 0 ? Math.round((success / total) * 100) : 100,
      failureRate: total > 0 ? Math.round((failure / total) * 100) : 0,
      avgLatencyMs: latCount > 0 ? Math.round(latSum / latCount) : 0,
      totalSuccess: this._totalSuccess,
      totalFailure: this._totalFailure,
      healthy: total === 0 || success / total >= 0.5,
    }
  }
}

// ─── resilientWrap ────────────────────────────────────────────────────────────
// Combines: Semaphore + Deduplicator + stallGuard into a single call.
// This is the main "make it never fail" wrapper for expensive operations.
export function resilientWrap({ semaphore, deduplicator, maxMs = 30_000, label = 'fn' } = {}) {
  return async function wrappedFn(key, fn, fallbackValue = null) {
    const runner = async () => {
      if (semaphore) {
        return semaphore.run(() => stallGuard(fn, { maxMs, fallbackValue, label }))
      }
      return stallGuard(fn, { maxMs, fallbackValue, label })
    }

    if (deduplicator && key) {
      return deduplicator.run(key, runner)
    }
    return runner()
  }
}

// ─── scheduleOnce ─────────────────────────────────────────────────────────────
// Like setInterval but guarantees only ONE instance runs at a time.
// If the job takes longer than intervalMs, the next run is deferred.
export function scheduleOnce(fn, intervalMs, { label = 'job', runImmediately = false } = {}) {
  let running = false
  let lastRanAt = 0

  const tick = async () => {
    if (running) return
    running = true
    lastRanAt = Date.now()
    try {
      await fn()
    } catch (err) {
      console.warn(`[scheduleOnce:${label}] error: ${err.message}`)
    } finally {
      running = false
    }
  }

  const handle = setInterval(tick, intervalMs)
  if (typeof handle.unref === 'function') handle.unref()

  if (runImmediately) setTimeout(tick, 0)

  return {
    stop: () => clearInterval(handle),
    stats: () => ({ label, running, lastRanAt, intervalMs }),
  }
}

// ─── MapCleanup ───────────────────────────────────────────────────────────────
// Auto-prunes a Map<key, {ts, ...}> to prevent memory leaks from growing maps.
export function autoCleanMap(map, { ttlMs = 60_000, label = 'map' } = {}) {
  const interval = setInterval(() => {
    const now = Date.now()
    let pruned = 0
    for (const [k, v] of map) {
      const ts = typeof v === 'object' ? (v.ts || v.resetAt || v.createdAt || 0) : 0
      if (ts && now - ts > ttlMs) {
        map.delete(k)
        pruned++
      }
    }
    if (pruned > 0) {
      console.log(`[autoCleanMap:${label}] pruned ${pruned} entries (size now: ${map.size})`)
    }
  }, Math.min(ttlMs, 5 * 60_000))
  if (typeof interval.unref === 'function') interval.unref()
  return interval
}

// ─── Global singletons ────────────────────────────────────────────────────────
// Shared across all layers so the same limits apply system-wide.

// Max 6 concurrent AI generation calls (prevents OOM + rate limit cascade)
export const aiSemaphore = new Semaphore(6, { name: 'ai-gen' })

// Dedup identical in-flight AI queries (saves API quota under burst)
export const aiDeduplicator = new Deduplicator({ name: 'ai-gen', ttlMs: 20_000 })

// Circuit breakers per provider
export const groqCircuit    = new CircuitBreaker({ name: 'groq',    failureThreshold: 8, cooldownMs: 20_000 })
export const deepseekCircuit= new CircuitBreaker({ name: 'deepseek',failureThreshold: 5, cooldownMs: 30_000 })
export const ollamaCircuit  = new CircuitBreaker({ name: 'ollama',  failureThreshold: 3, cooldownMs: 15_000 })

// Health monitors
export const agentMonitor   = new HealthMonitor({ name: 'dz-agent', windowMs: 5 * 60_000 })
export const chatMonitor    = new HealthMonitor({ name: 'chat',      windowMs: 5 * 60_000 })

// Dedup for news/cache refreshes — prevent parallel identical fetches
export const fetchDeduplicator = new Deduplicator({ name: 'fetch', ttlMs: 60_000 })

// ─── Graceful fallback messages (AR/FR/EN) ───────────────────────────────────
export const OVERLOAD_MESSAGES = {
  ar: 'النظام مشغول حالياً. يرجى المحاولة مرة أخرى بعد لحظات.',
  fr: 'Le système est occupé. Veuillez réessayer dans un moment.',
  en: 'The system is busy right now. Please try again in a moment.',
}

export function getOverloadMessage(lang = 'ar') {
  return OVERLOAD_MESSAGES[lang] || OVERLOAD_MESSAGES.ar
}

// ─── Full system health snapshot ─────────────────────────────────────────────
export function systemHealthSnapshot() {
  return {
    ts: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    memory: (() => {
      const m = process.memoryUsage()
      return {
        heapUsedMB:  Math.round(m.heapUsed  / 1_048_576),
        heapTotalMB: Math.round(m.heapTotal / 1_048_576),
        rssMB:       Math.round(m.rss       / 1_048_576),
      }
    })(),
    semaphores: [aiSemaphore.stats()],
    circuits: [groqCircuit.stats(), deepseekCircuit.stats(), ollamaCircuit.stats()],
    monitors: [agentMonitor.stats(), chatMonitor.stats()],
    deduplicators: [aiDeduplicator.stats(), fetchDeduplicator.stats()],
  }
}
