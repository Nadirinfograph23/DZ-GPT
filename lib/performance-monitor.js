/**
 * lib/performance-monitor.js — DZ Agent Performance Monitor
 * ══════════════════════════════════════════════════════════
 * مراقبة الأداء الحي لكل مكونات النظام:
 *   ✅ latency tracking per agent/endpoint
 *   ✅ throughput (req/sec) sliding window
 *   ✅ memory trend
 *   ✅ top slow queries
 *   ✅ error rate per agent
 *   ✅ cache hit rates
 *   ✅ /api/perf endpoint data
 */

import { cacheRegistry } from './cache.js'
import { systemHealthSnapshot } from './resilience.js'
import logger from './logger.js'

const log = logger.child('perf-monitor')

// ══════════════════════════════════════════════════════════════════════════════
// AgentTracker — tracks latency + errors per agent
// ══════════════════════════════════════════════════════════════════════════════
class AgentTracker {
  constructor(windowSize = 500) {
    this._agents = new Map()
    this._windowSize = windowSize
  }

  /** Record one agent call */
  record(agentId, { latencyMs = 0, ok = true, intent = '', query = '' } = {}) {
    if (!this._agents.has(agentId)) {
      this._agents.set(agentId, {
        total: 0, errors: 0,
        latencies: [], slowQueries: [],
      })
    }
    const a = this._agents.get(agentId)
    a.total++
    if (!ok) a.errors++
    a.latencies.push(latencyMs)
    if (a.latencies.length > this._windowSize) a.latencies.shift()

    // Track slow queries (> 5s)
    if (latencyMs > 5000 && query) {
      a.slowQueries.push({ query: query.slice(0, 80), latencyMs, ts: Date.now() })
      if (a.slowQueries.length > 20) a.slowQueries.shift()
    }
  }

  stats(agentId = null) {
    const summarize = (data) => {
      const lats = data.latencies
      const len  = lats.length
      const avg  = len ? Math.round(lats.reduce((s, l) => s + l, 0) / len) : 0
      const sorted = [...lats].sort((a, b) => a - b)
      const p95  = sorted[Math.floor(len * 0.95)] || 0
      const p99  = sorted[Math.floor(len * 0.99)] || 0
      return {
        total:        data.total,
        errors:       data.errors,
        errorRate:    data.total ? Math.round((data.errors / data.total) * 100) : 0,
        avgLatencyMs: avg,
        p95LatencyMs: p95,
        p99LatencyMs: p99,
        slowQueries:  data.slowQueries.slice(-5),
      }
    }

    if (agentId) {
      const d = this._agents.get(agentId)
      return d ? { [agentId]: summarize(d) } : {}
    }

    const result = {}
    for (const [id, data] of this._agents) {
      result[id] = summarize(data)
    }
    return result
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ThroughputWindow — requests per second (sliding window)
// ══════════════════════════════════════════════════════════════════════════════
class ThroughputWindow {
  constructor(windowMs = 60000) {
    this._windowMs  = windowMs
    this._timestamps = []
  }

  tick() {
    const now = Date.now()
    this._timestamps.push(now)
    // Prune old timestamps
    const cutoff = now - this._windowMs
    while (this._timestamps.length && this._timestamps[0] < cutoff) {
      this._timestamps.shift()
    }
  }

  /** Requests per second (averaged over window) */
  rps() {
    const windowSec = this._windowMs / 1000
    return +(this._timestamps.length / windowSec).toFixed(2)
  }

  /** Total in window */
  total() { return this._timestamps.length }
}

// ══════════════════════════════════════════════════════════════════════════════
// MemoryTrend — tracks heap usage over time
// ══════════════════════════════════════════════════════════════════════════════
class MemoryTrend {
  constructor(maxSamples = 60) {
    this._samples = []
    this._max = maxSamples
  }

  sample() {
    const mem = process.memoryUsage()
    this._samples.push({
      ts:          Date.now(),
      heapUsedMB:  Math.round(mem.heapUsed / 1024 / 1024),
      rssMB:       Math.round(mem.rss      / 1024 / 1024),
    })
    if (this._samples.length > this._max) this._samples.shift()
  }

  trend() {
    if (this._samples.length < 2) return 'stable'
    const first = this._samples[0].heapUsedMB
    const last  = this._samples[this._samples.length - 1].heapUsedMB
    const delta = last - first
    if (delta >  50) return 'growing'
    if (delta < -20) return 'shrinking'
    return 'stable'
  }

  latest() { return this._samples[this._samples.length - 1] || null }
  history() { return this._samples.slice(-10) }
}

// ══════════════════════════════════════════════════════════════════════════════
// PerformanceMonitor — singleton
// ══════════════════════════════════════════════════════════════════════════════
class PerformanceMonitor {
  constructor() {
    this.agents     = new AgentTracker()
    this.throughput = new ThroughputWindow(60000) // 1 min window
    this.memory     = new MemoryTrend(60)
    this._startTime = Date.now()

    // Sample memory every 30s
    const id = setInterval(() => this.memory.sample(), 30000)
    if (id?.unref) id.unref()
    this.memory.sample() // initial sample
  }

  /** Record an incoming request */
  onRequest() {
    this.throughput.tick()
  }

  /** Record agent call result */
  recordAgent(agentId, opts = {}) {
    this.agents.record(agentId, opts)
  }

  /** Full snapshot for /api/perf endpoint */
  snapshot() {
    const health = systemHealthSnapshot()
    return {
      uptime:        Math.round(process.uptime()),
      uptimeHuman:   formatUptime(process.uptime()),
      startTime:     new Date(this._startTime).toISOString(),
      throughput: {
        rps:         this.throughput.rps(),
        last60s:     this.throughput.total(),
      },
      memory: {
        ...health.memory,
        trend:   this.memory.trend(),
        history: this.memory.history(),
      },
      agents:    this.agents.stats(),
      caches:    cacheRegistry.snapshot(),
      circuits:  health.circuits,
      semaphores: health.semaphores,
    }
  }

  /** Summary for health check (lean) */
  healthSummary() {
    const mem = this.memory.latest()
    return {
      status:      'ok',
      uptime:      Math.round(process.uptime()),
      memHeapMB:   mem?.heapUsedMB || 0,
      memTrend:    this.memory.trend(),
      rps:         this.throughput.rps(),
      cacheHitRate: _avgCacheHitRate(),
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatUptime(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `${h}h ${m}m ${s}s`
}

function _avgCacheHitRate() {
  const snap = cacheRegistry.snapshot()
  const rates = Object.values(snap).map(c => c.hitRate || 0).filter(r => r > 0)
  if (!rates.length) return 0
  return Math.round(rates.reduce((s, r) => s + r, 0) / rates.length)
}

// ══════════════════════════════════════════════════════════════════════════════
// Express middleware — auto-records every request
// ══════════════════════════════════════════════════════════════════════════════
export function perfMiddleware(monitor) {
  return (req, res, next) => {
    monitor.onRequest()
    const t0 = Date.now()
    res.on('finish', () => {
      const ms = Date.now() - t0
      // Record to the appropriate agent based on path
      const agentId = pathToAgent(req.path)
      if (agentId) {
        monitor.recordAgent(agentId, {
          latencyMs: ms,
          ok:        res.statusCode < 400,
          query:     req.body?.message || req.query?.q || '',
        })
      }
    })
    next()
  }
}

function pathToAgent(path = '') {
  if (path.includes('dz-agent-chat'))   return 'chat_agent'
  if (path.includes('dz-agent-stream')) return 'stream_agent'
  if (path.includes('dz-agent-v4'))     return 'agent_v4'
  if (path.includes('dz-agent-v5'))     return 'agent_v5'
  if (path.includes('github'))          return 'github_agent'
  if (path.includes('quran'))           return 'quran_agent'
  if (path.includes('dz-tube'))         return 'youtube_agent'
  if (path.includes('weather'))         return 'weather_agent'
  if (path.includes('sports'))          return 'sports_agent'
  if (path.includes('maps'))            return 'maps_agent'
  if (path.includes('search'))          return 'search_agent'
  if (path.includes('clone'))           return 'clone_agent'
  return null
}

// ── Singleton ─────────────────────────────────────────────────────────────────
export const perfMonitor = new PerformanceMonitor()
export default perfMonitor
