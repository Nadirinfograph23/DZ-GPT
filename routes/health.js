/**
 * routes/health.js
 * Health, status, and diagnostics endpoints.
 * Extracted from server.js lines 839–920, 2022–2060.
 *
 * POST /api/dz-agent/ratings
 * GET  /api/dz-agent/ratings/stats
 * GET  /api/dz-agent/preload-status
 * GET  /api/dz-agent/connectivity
 * GET  /api/dz-agent/agent-status
 * GET  /api/groq-key-stats
 * GET  /api/system-health
 * GET  /api/ai-router/health
 * GET  /api/health  (simple uptime check)
 *
 * Factory deps:
 *   MESSAGE_RATINGS  - Map<string, {vote, query, ts}>
 *   PRELOAD_CACHE    - cache object with .has()
 *   WEATHER_CACHE_V2 - cache object with .size
 *   CURRENCY_CACHE_V2
 *   SPORTS_CACHE_V2
 *   resilientFetch   - async (url, opts) => Response
 *   MAX_REQ_PER_SEC  - number
 *   getGroqKeys      - () => string[]
 *   getKeyStats      - (key) => { requests, errors, avgMs, cooldownUntil, consecutiveErrors }
 *   systemHealthSnapshot   - () => object
 *   getProviderStatus      - () => object
 *   getRouterHealthSnapshot - () => object
 */
import { Router } from 'express'
import perfMonitor from '../lib/performance-monitor.js'
import { cacheRegistry } from '../lib/cache.js'

export function createHealthRouter(deps = {}) {
  const {
    MESSAGE_RATINGS = new Map(),
    PRELOAD_CACHE   = { has: () => false },
    WEATHER_CACHE_V2  = { size: 0 },
    CURRENCY_CACHE_V2 = { size: 0 },
    SPORTS_CACHE_V2   = { size: 0 },
    resilientFetch,
    MAX_REQ_PER_SEC = 3,
    getGroqKeys,
    getKeyStats,
    systemHealthSnapshot,
    getProviderStatus,
    getRouterHealthSnapshot,
  } = deps

  const router = Router()

  // ── Simple uptime ping ────────────────────────────────────────
  router.get('/health', (_req, res) => {
    res.json({ ok: true, uptime: Math.floor(process.uptime()), ts: new Date().toISOString() })
  })

  // ── Performance dashboard (full snapshot) ─────────────────────
  router.get('/perf', (_req, res) => {
    try {
      res.json(perfMonitor.snapshot())
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // ── Health summary (lean — for monitoring services) ──────────
  router.get('/health/live', (_req, res) => {
    try {
      res.json({ ok: true, ...perfMonitor.healthSummary(), ts: new Date().toISOString() })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // ── Cache stats ────────────────────────────────────────────────
  router.get('/cache/stats', (_req, res) => {
    try {
      res.json({ caches: cacheRegistry.snapshot(), totalBytes: cacheRegistry.totalBytes() })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // ── Cache invalidation (admin) ────────────────────────────────
  router.post('/cache/invalidate', (req, res) => {
    const { namespace, pattern } = req.body || {}
    if (!namespace) return res.status(400).json({ error: 'namespace required' })
    const cache = cacheRegistry.get(namespace)
    if (!cache) return res.status(404).json({ error: `Cache "${namespace}" not found` })
    if (pattern) {
      const count = cache.invalidatePattern(new RegExp(pattern))
      return res.json({ ok: true, invalidated: count, namespace, pattern })
    }
    cache.clear()
    res.json({ ok: true, cleared: true, namespace })
  })

  // ── Message ratings ───────────────────────────────────────────
  router.post('/dz-agent/ratings', (req, res) => {
    const { messageId, vote, query } = req.body || {}
    if (!messageId || !['up', 'down'].includes(vote)) {
      return res.status(400).json({ error: 'messageId and vote (up|down) required' })
    }
    MESSAGE_RATINGS.set(String(messageId), {
      vote,
      query: (query || '').slice(0, 300),
      ts: Date.now(),
    })
    res.json({ ok: true, total: MESSAGE_RATINGS.size })
  })

  router.get('/dz-agent/ratings/stats', (_req, res) => {
    const all = [...MESSAGE_RATINGS.values()]
    const up   = all.filter(r => r.vote === 'up').length
    const down = all.filter(r => r.vote === 'down').length
    const total = all.length
    const recent = [...MESSAGE_RATINGS.entries()]
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, 20)
      .map(([id, r]) => ({ id, ...r, tsIso: new Date(r.ts).toISOString() }))
    res.json({ total, up, down, ratio: total ? Math.round((up / total) * 100) : 0, recent })
  })

  // ── Preload status ────────────────────────────────────────────
  router.get('/dz-agent/preload-status', (_req, res) => {
    res.json({
      preloaded: {
        weather_algiers: PRELOAD_CACHE.has('weather_algiers'),
        currency: PRELOAD_CACHE.has('currency'),
      },
      cacheStats: {
        weather:  WEATHER_CACHE_V2.size,
        currency: CURRENCY_CACHE_V2.size,
        sports:   SPORTS_CACHE_V2.size,
      },
      fetchedAt: new Date().toISOString(),
    })
  })

  // ── Network connectivity probe ────────────────────────────────
  router.get('/dz-agent/connectivity', async (_req, res) => {
    const probes = [
      { name: 'open-meteo',    url: 'https://api.open-meteo.com/v1/forecast?latitude=36.737&longitude=3.086&current=temperature_2m&forecast_days=1' },
      { name: 'currency-cdn', url: 'https://latest.currency-api.pages.dev/v1/currencies/dzd.json' },
      { name: 'kooora',       url: 'https://www.kooora.com/?l=108' },
    ]
    const results = {}
    await Promise.allSettled(probes.map(async p => {
      try {
        const r = resilientFetch
          ? await resilientFetch(p.url, { timeout: 6000, retries: 1 })
          : await fetch(p.url, { signal: AbortSignal.timeout(6000) })
        results[p.name] = r.ok ? 'online' : `http_${r.status}`
      } catch { results[p.name] = 'offline' }
    }))
    const allOnline = Object.values(results).every(v => v === 'online')
    res.json({ online: allOnline, sources: results, fetchedAt: new Date().toISOString() })
  })

  // ── Multi-agent status ────────────────────────────────────────
  router.get('/dz-agent/agent-status', (_req, res) => {
    res.json({
      agents: {
        data:     { status: 'active', description: 'Scraping + API fetching' },
        parsing:  { status: 'active', description: 'HTML parsing & data structuring' },
        cache:    { status: 'active', description: 'TTL caching & stale fallback', entries: WEATHER_CACHE_V2.size + CURRENCY_CACHE_V2.size },
        response: { status: 'active', description: 'AI response generation' },
      },
      resilience: {
        headerRotation: true,
        randomDelay: true,
        throttling: `max ${MAX_REQ_PER_SEC} req/sec/domain`,
        retries: 3,
        staleCache: true,
        sourceCascade: true,
      },
      fetchedAt: new Date().toISOString(),
    })
  })

  // ── Groq key rotation stats ───────────────────────────────────
  router.get('/groq-key-stats', (_req, res) => {
    if (!getGroqKeys || !getKeyStats) {
      return res.json({ total: 0, active: 0, keys: [], note: 'Groq stats not available' })
    }
    const all = getGroqKeys()
    const now = Date.now()
    const stats = all.map((k, i) => {
      const s = getKeyStats(k)
      return {
        index: i + 1,
        status: s.cooldownUntil > now ? 'cooldown' : 'active',
        cooldownSecondsLeft: s.cooldownUntil > now ? Math.ceil((s.cooldownUntil - now) / 1000) : 0,
        requests: s.requests,
        errors: s.errors,
        avgResponseMs: s.avgMs,
      }
    })
    res.json({ total: all.length, active: stats.filter(s => s.status === 'active').length, keys: stats })
  })

  // ── System health ─────────────────────────────────────────────
  router.get('/system-health', (_req, res) => {
    try {
      res.json(systemHealthSnapshot ? systemHealthSnapshot() : { ok: true })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // ── AI router health ──────────────────────────────────────────
  router.get('/ai-router/health', (_req, res) => {
    try {
      res.json({
        ok: true,
        providers: getProviderStatus ? getProviderStatus() : {},
        metrics: getRouterHealthSnapshot ? getRouterHealthSnapshot() : {},
        ts: new Date().toISOString(),
      })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  return router
}
