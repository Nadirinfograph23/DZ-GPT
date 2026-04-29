// DZ Agent V2 — Express mount.
// Adds NEW endpoints under /api/dz-agent-v2/*. Does not touch existing
// /api/chat, /api/dz-agent-chat, /api/agent/*, /api/dz-agent/* routes.
//
//   POST /api/dz-agent-v2/chat            { query, sessionId? }
//   GET  /api/dz-agent-v2/health
//   GET  /api/dz-agent-v2/plan?q=...
//   GET  /api/dz-agent-v2/plugins
//   GET  /api/dz-agent-v2/memory/stats
//   POST /api/dz-agent-v2/memory/purge   { kind?, olderThanDays? }
//   GET  /api/dz-agent-v2/learning/recent
//   GET  /api/dz-agent-v2/learning/stats

import { handle } from './orchestrator.js'
import { plan } from './agents.js'
import { installDefaultPlugins, listPlugins } from './plugins.js'
import { memoryStats, purgeMemory } from './memory-store.js'
import { getRecent, getStats } from './learning.js'

export function mountDzAgentV2(app, { aiGenerate, host } = {}) {
  if (!app || typeof app.post !== 'function') {
    console.warn('[dz-agent-v2] no Express app; skipping mount')
    return
  }
  if (typeof aiGenerate !== 'function') {
    console.warn('[dz-agent-v2] missing aiGenerate dependency; chat endpoint will fail')
  }

  installDefaultPlugins(host || {})

  app.post('/api/dz-agent-v2/chat', async (req, res) => {
    try {
      const { query, sessionId } = req.body || {}
      const out = await handle({ query, sessionId, aiGenerate })
      res.json(out)
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  app.get('/api/dz-agent-v2/health', (_req, res) => {
    res.json({ ok: true, version: 'v2', uptimeMs: Math.round(process.uptime() * 1000), now: Date.now() })
  })

  app.get('/api/dz-agent-v2/plan', (req, res) => {
    try {
      const q = String(req.query.q || '').trim()
      if (!q) return res.status(400).json({ ok: false, error: 'q required' })
      const p = plan(q, { sessionId: String(req.query.sessionId || '') || null })
      res.json({ ok: true, plan: { ...p, pluginsToRun: p.pluginsToRun.map(x => ({ name: x.plugin.name, score: x.score })) } })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  app.get('/api/dz-agent-v2/plugins', (_req, res) => {
    res.json({ ok: true, plugins: listPlugins() })
  })

  app.get('/api/dz-agent-v2/memory/stats', async (_req, res) => {
    try { res.json({ ok: true, ...(await memoryStats()) }) }
    catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  app.post('/api/dz-agent-v2/memory/purge', async (req, res) => {
    try {
      const { kind, olderThanDays } = req.body || {}
      const out = await purgeMemory({ kind, olderThanDays })
      res.json({ ok: true, ...out })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  app.get('/api/dz-agent-v2/learning/recent', (req, res) => {
    res.json({ ok: true, recent: getRecent(Number(req.query.limit) || 25) })
  })

  app.get('/api/dz-agent-v2/learning/stats', (_req, res) => {
    res.json({ ok: true, ...getStats() })
  })

  console.log('[dz-agent-v2] mounted: /api/dz-agent-v2/{chat,health,plan,plugins,memory,learning}')
}
