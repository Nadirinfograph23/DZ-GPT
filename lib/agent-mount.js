// DZ Agent — Express mount.
// Adds new endpoints WITHOUT touching the existing /api/dz-agent-* routes.
// Phase 1 (engines):
//   GET  /api/agent/health
//   POST /api/agent/ask           { query, limit?, bypassCache?, bypassMemory? }
//   GET  /api/agent/ask?q=...
//   GET  /api/agent/news?q=...
//   GET  /api/agent/github?q=...
//   POST /api/agent/builder       { brief }
//   GET  /api/agent/memory/recent
//   GET  /api/agent/memory/stats
//   POST /api/agent/memory/purge
//   POST /api/agent/refresh       (manual cron trigger)
// Phase 2 (intelligence):
//   GET  /api/agent/plan?q=...    decompose into sub-queries + step plan
//   GET  /api/agent/think?q=...   intent + plan only (no fetch)
//   GET/POST /api/agent/deep      full deep-research pipeline (plan → fetch → fuse → critique → render + citations)
//   POST /api/agent/render        render any router payload as Markdown + citations
//   GET  /api/agent/system-prompt?intent=...
//   POST /api/agent/safety/scan   prompt-injection / harm scoring
//   POST /api/agent/safety/refusal
//
// Also installs a 6-hour background refresh loop.

import { ask, health, setNewsFetcher, backgroundRefresh } from './router.js'
import { getTopNews } from './news.js'
import { searchRepos, getRepoInsight } from './github.js'
import { buildSite } from './builder.js'
import { listRecent, stats as memStats, purge as memPurge } from './memory.js'
import { reason, think } from './reasoner.js'
import { planQuery } from './planner.js'
import { buildResponseBundle } from './responder.js'
import { buildSystemPrompt, buildContextHeader } from './prompts.js'
import { detectInjection, sanitizeOutbound, buildRefusal, quickHarmScore } from './safety.js'

const REFRESH_MS = 6 * 60 * 60 * 1000  // 6 hours

let _interval = null

export function mountSmartAgent(app, { fetcher } = {}) {
  if (!app || typeof app.get !== 'function') {
    console.warn('[agent-mount] no Express app passed; skipping mount')
    return
  }
  if (fetcher) setNewsFetcher(fetcher)

  app.get('/api/agent/health', async (_req, res) => {
    try { res.json(await health()) }
    catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  app.get('/api/agent/ask', async (req, res) => {
    try { res.json(await ask(String(req.query.q || ''), { limit: Number(req.query.limit) || 10 })) }
    catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  app.post('/api/agent/ask', async (req, res) => {
    try {
      const { query, limit, bypassCache, bypassMemory } = req.body || {}
      res.json(await ask(query, { limit, bypassCache, bypassMemory }))
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  app.get('/api/agent/news', async (req, res) => {
    try {
      const sportsContext = req.query.sports === '1' || req.query.sports === 'true'
      res.json(await getTopNews({
        query: String(req.query.q || ''),
        limit: Number(req.query.limit) || 12,
        sportsContext,
      }))
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  app.get('/api/agent/github', async (req, res) => {
    try {
      const repos = await searchRepos(String(req.query.q || ''), { perPage: Number(req.query.limit) || 8 })
      let insight = null
      if (req.query.insight === '1' && repos.items?.[0]) {
        try { insight = await getRepoInsight(repos.items[0].fullName) } catch {}
      }
      res.json({ ok: true, ...repos, insight })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  app.post('/api/agent/builder', async (req, res) => {
    try {
      const brief = (req.body && req.body.brief) || req.query.brief
      if (!brief) return res.status(400).json({ ok: false, error: 'brief is required' })
      res.json({ ok: true, ...(await buildSite(brief)) })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  app.get('/api/agent/memory/recent', async (_req, res) => {
    try { res.json({ ok: true, items: await listRecent(30) }) }
    catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  app.get('/api/agent/memory/stats', async (_req, res) => {
    try { res.json({ ok: true, ...(await memStats()) }) }
    catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  app.post('/api/agent/memory/purge', async (_req, res) => {
    try { res.json(await memPurge()) }
    catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  app.post('/api/agent/refresh', async (_req, res) => {
    try { res.json(await backgroundRefresh()) }
    catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // ---------- Phase 2: planner / reasoner / formatter / safety ----------

  // Plan-only — what would the agent do for this query?
  app.get('/api/agent/plan', (req, res) => {
    try {
      const q = String(req.query.q || '')
      res.json({ ok: true, ...planQuery(q) })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // Deep-research / thinking — full pipeline (plan → multi-fetch → fuse → critique → render)
  app.post('/api/agent/deep', async (req, res) => {
    try {
      const { query, bypassMemory } = req.body || {}
      if (!query) return res.status(400).json({ ok: false, error: 'query is required' })
      res.json(await reason(query, { bypassMemory }))
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })
  app.get('/api/agent/deep', async (req, res) => {
    try {
      const q = String(req.query.q || '')
      if (!q) return res.status(400).json({ ok: false, error: 'q is required' })
      res.json(await reason(q))
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // "Think" — fast, no fetch: just shows the planner's decomposition + intent.
  app.get('/api/agent/think', (req, res) => {
    try {
      const q = String(req.query.q || '')
      res.json({ ok: true, plan: think(q) })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // Render — convert any router payload to clean Markdown + citations.
  app.post('/api/agent/render', (req, res) => {
    try {
      const { payload, lang } = req.body || {}
      if (!payload) return res.status(400).json({ ok: false, error: 'payload is required' })
      res.json({ ok: true, ...buildResponseBundle(payload, { lang: lang || 'ar' }) })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // Inspect the system prompt the agent would use for a given intent.
  app.get('/api/agent/system-prompt', (req, res) => {
    try {
      const intent = String(req.query.intent || 'general')
      const ctx = buildContextHeader({ intent })
      res.json({ ok: true, intent, prompt: buildSystemPrompt(intent), context: ctx })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // Safety: scan a piece of text for prompt-injection / harm.
  app.post('/api/agent/safety/scan', (req, res) => {
    try {
      const text = (req.body && (req.body.text || req.body.input)) || ''
      const inj = detectInjection(text)
      const harm = quickHarmScore(text)
      const sanitized = sanitizeOutbound(text)
      res.json({ ok: true, injection: inj, harm, sanitized })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // Safety: build a clean refusal message in the requested language.
  app.post('/api/agent/safety/refusal', (req, res) => {
    try {
      const { reason, alternative, lang } = req.body || {}
      res.json({ ok: true, message: buildRefusal({ reason, alternative, lang }) })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  // Background refresh loop — runs every 6h
  if (!_interval) {
    _interval = setInterval(() => {
      backgroundRefresh()
        .then(r => console.log('[agent] background refresh:', r.tasks?.join(',')))
        .catch(err => console.warn('[agent] refresh error:', err.message))
    }, REFRESH_MS)
    if (typeof _interval.unref === 'function') _interval.unref()
    // Initial warm-up after 5s so it doesn't block server start
    setTimeout(() => {
      backgroundRefresh()
        .then(r => console.log('[agent] initial warm-up:', r.tasks?.join(',')))
        .catch(() => {})
    }, 5000)
  }

  console.log('[agent] smart agent endpoints mounted under /api/agent/*')
}

export function unmountSmartAgent() {
  if (_interval) { clearInterval(_interval); _interval = null }
}
