// Resilience layer — circuit breakers, semaphores, deduplicators

class CircuitBreaker {
  constructor(name, { failureThreshold = 5, resetTimeout = 30000 } = {}) {
    this.name = name
    this.failureThreshold = failureThreshold
    this.resetTimeout = resetTimeout
    this.failures = 0
    this.state = 'CLOSED'
    this.nextAttempt = 0
  }
  isAvailable() {
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttempt) {
        this.state = 'HALF_OPEN'
        return true
      }
      return false
    }
    return true
  }
  recordSuccess() {
    this.failures = 0
    this.state = 'CLOSED'
  }
  recordFailure(reason) {
    this.failures++
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN'
      this.nextAttempt = Date.now() + this.resetTimeout
    }
  }
  getState() { return this.state }
}

/**
 * CircuitRegistry — مسجّل مشترك لجميع circuit breakers
 *
 * يضمن أن server.js و ai-router يستخدمان نفس الـ CircuitBreaker لكل مزوّد.
 * فشل Groq في أي طريق يُحدّث نفس الـ circuit دون تعارض أو تكرار.
 */
class CircuitRegistry {
  constructor() {
    this._map = new Map()
  }

  /**
   * @param {string} name - اسم المزوّد (groq, gemini, mistral, ...)
   * @param {object} opts - { failureThreshold, resetTimeout }
   * @returns {CircuitBreaker}
   */
  get(name, opts = {}) {
    if (!this._map.has(name)) {
      this._map.set(name, new CircuitBreaker(name, opts))
    }
    return this._map.get(name)
  }

  /** لقطة حالة جميع الـ circuits المسجّلة — للتشخيص والـ health endpoint */
  snapshot() {
    const result = {}
    for (const [name, cb] of this._map) {
      result[name] = { state: cb.getState(), failures: cb.failures, open: !cb.isAvailable() }
    }
    return result
  }
}

class Semaphore {
  constructor(max = 5) {
    this.max = max
    this.current = 0
    this.queue = []
  }
  async run(fn) {
    if (this.current >= this.max) {
      await new Promise(resolve => this.queue.push(resolve))
    }
    this.current++
    try {
      return await fn()
    } finally {
      this.current--
      if (this.queue.length > 0) this.queue.shift()()
    }
  }
  stats() {
    return { running: this.current, max: this.max, queued: this.queue.length }
  }
}

class Deduplicator {
  constructor() {
    this.pending = new Map()
  }
  async run(key, fn) {
    if (this.pending.has(key)) return this.pending.get(key)
    const p = fn().finally(() => this.pending.delete(key))
    this.pending.set(key, p)
    return p
  }
  prune() {
    // Resolved promises are already removed via .finally(); this is a no-op safety call
    this.pending.forEach((v, k) => {
      if (v && typeof v.then !== 'function') this.pending.delete(k)
    })
  }
}

class Monitor {
  constructor() {
    this.total = 0
    this.success = 0
    this.latencies = []
  }
  record(ok, latencyMs = 0) {
    this.total++
    if (ok) this.success++
    this.latencies.push(latencyMs)
    if (this.latencies.length > 1000) this.latencies.shift()
  }
  stats() {
    const avg = this.latencies.length
      ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length)
      : 0
    return { total: this.total, success: this.success, avgLatencyMs: avg }
  }
}

export const aiSemaphore = new Semaphore(5)
export const aiDeduplicator = new Deduplicator()
export const agentMonitor = new Monitor()
export const chatMonitor = new Monitor()
export const fetchDeduplicator = new Deduplicator()

// ── مسجّل الـ circuits المشترك ────────────────────────────────────────────────
// server.js و ai-router يستخدمان نفس الـ instance — صفر تكرار.
export const circuitRegistry = new CircuitRegistry()

// Named exports for backward compatibility with server.js imports
// هذه مجرد مراجع للكائنات الموجودة داخل circuitRegistry — نفس الـ object تماماً.
export const groqCircuit     = circuitRegistry.get('groq',     { failureThreshold: 5, resetTimeout: 30000 })
export const deepseekCircuit = circuitRegistry.get('deepseek', { failureThreshold: 3, resetTimeout: 60000 })
export const ollamaCircuit   = circuitRegistry.get('ollama',   { failureThreshold: 3, resetTimeout: 30000 })

export async function stallGuard(fn, timeoutMs = 30000) {
  return withTimeout(fn(), timeoutMs, 'stallGuard timeout')
}

export function withTimeout(promise, ms, label = 'timeout') {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`[${label}] timed out after ${ms}ms`)), ms)
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(t))
  })
}

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

// scheduleOnce(fn, intervalMs, { label })
// Runs fn immediately, then re-schedules after intervalMs.
// Guarantees next run only starts AFTER previous completes (no overlap).
const _scheduled = new Map()
export function scheduleOnce(fn, intervalMs = 60000, { label } = {}) {
  if (typeof fn !== 'function') {
    console.error(`[scheduleOnce:${label || '?'}] fn is not a function`)
    return
  }
  const key = label || fn.toString().slice(0, 60)
  if (_scheduled.has(key)) return

  const run = async () => {
    try { await fn() } catch (e) { console.error(`[scheduleOnce:${key}]`, e?.message) }
    _scheduled.delete(key)
    const id = setTimeout(run, intervalMs)
    if (id?.unref) id.unref()
    _scheduled.set(key, id)
  }

  const id = setTimeout(run, 0)
  if (id?.unref) id.unref()
  _scheduled.set(key, id)
}

export function systemHealthSnapshot() {
  const mem = process.memoryUsage()
  return {
    memory: {
      ...mem,
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    },
    semaphores: [
      { name: 'ai', ...aiSemaphore.stats() },
    ],
    circuits: circuitRegistry.snapshot(),
    agent: agentMonitor.stats(),
    chat: chatMonitor.stats(),
    uptime: process.uptime(),
  }
}

export function getOverloadMessage() {
  return 'النظام مشغول حالياً، يرجى المحاولة مرة أخرى بعد لحظات.'
}
