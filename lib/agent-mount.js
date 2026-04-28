// DZ Agent — Express mount.
// Adds new endpoints WITHOUT touching the existing /api/dz-agent-* routes.
//   GET  /api/agent/health
//   POST /api/agent/ask           { query, limit?, bypassCache?, bypassMemory? }
//   GET  /api/agent/ask?q=...
//   GET  /api/agent/news?q=...
//   GET  /api/agent/github?q=...
//   POST /api/agent/builder       { brief }
//   GET  /api/agent/memory/recent
//   GET  /api/agent/memory/stats
//   POST /api/agent/refresh       (manual cron trigger)
//
// Also installs a 6-hour background refresh loop.

import { ask, health, setNewsFetcher, backgroundRefresh } from './router.js'
import { getTopNews } from './news.js'
import { searchRepos, getRepoInsight } from './github.js'
import { buildSite } from './builder.js'
import { listRecent, stats as memStats, purge as memPurge } from './memory.js'

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
