// DZ Agent V3 — Express mount.
// New endpoints under /api/dz-agent-v3/*. Additive; touches no existing route.
//
//   POST /api/dz-agent-v3/run                { query, sessionId? }
//   GET  /api/dz-agent-v3/task/:id
//   GET  /api/dz-agent-v3/task/:id/stream    (SSE)
//   GET  /api/dz-agent-v3/tasks
//   POST /api/dz-agent-v3/generate-app       { template, title?, brief?, lang? }
//   GET  /api/dz-agent-v3/templates
//   GET  /api/dz-agent-v3/artifact/:id/download
//   POST /api/dz-agent-v3/scrape-live        { topic? }
//   GET  /api/dz-agent-v3/agents
//   GET  /api/dz-agent-v3/health

import { createTask, getTask, listTasks, tasksStats } from './task-manager.js'
import { streamTaskSSE } from './streaming.js'
import { runAutonomous, AGENTS } from './orchestrator.js'
import { generateApp, listTemplates, storeArtifact, getArtifact, getArtifactURL, createZip } from './webapp-generator.js'
import { detectLanguage } from '../dz-v2/language.js'
import { internalFetch } from './host.js'

export function mountDzAgentV3(app, { aiGenerate } = {}) {
  if (!app || typeof app.post !== 'function') {
    console.warn('[dz-agent-v3] no Express app; skipping mount')
    return
  }

  app.get('/api/dz-agent-v3/health', (_req, res) => {
    res.json({ ok: true, version: 'v3', agents: Object.keys(AGENTS), now: Date.now() })
  })

  app.get('/api/dz-agent-v3/agents', (_req, res) => {
    res.json({
      ok: true,
      agents: Object.values(AGENTS).map(a => ({ name: a.name, description: a.description })),
    })
  })

  app.get('/api/dz-agent-v3/templates', (_req, res) => {
    res.json({ ok: true, templates: listTemplates() })
  })

  // Autonomous run — returns taskId immediately, runs in background, streamed via SSE
  app.post('/api/dz-agent-v3/run', async (req, res) => {
    try {
      const { query, sessionId } = req.body || {}
      if (!query || !String(query).trim()) {
        return res.status(400).json({ ok: false, error: 'query required' })
      }
      const lang = detectLanguage(query)
      const task = await createTask({ kind: 'autonomous', query, sessionId, lang })

      // Fire and forget; client subscribes via SSE
      runAutonomous({ task, aiGenerate }).catch(err => {
        console.warn('[dz-agent-v3] runAutonomous error:', err.message)
      })

      res.json({
        ok: true,
        taskId: task.id,
        streamUrl: `/api/dz-agent-v3/task/${task.id}/stream`,
        statusUrl: `/api/dz-agent-v3/task/${task.id}`,
        lang, query,
      })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  app.get('/api/dz-agent-v3/task/:id', (req, res) => {
    const t = getTask(req.params.id)
    if (!t) return res.status(404).json({ ok: false, error: 'task not found' })
    const { bus, ...safe } = t
    res.json({ ok: true, task: safe })
  })

  app.get('/api/dz-agent-v3/task/:id/stream', (req, res) => {
    streamTaskSSE(req, res, req.params.id)
  })

  app.get('/api/dz-agent-v3/tasks', (req, res) => {
    res.json({ ok: true, tasks: listTasks({ limit: Number(req.query.limit) || 25 }), stats: tasksStats() })
  })

  // Generate app + return file tree (synchronous; small)
  app.post('/api/dz-agent-v3/generate-app', async (req, res) => {
    try {
      const { template = 'saas-starter', title, brief = '', lang } = req.body || {}
      const app = generateApp(template, { title, brief, lang })
      const artifactId = await storeArtifact(app)
      res.json({
        ok: true,
        template: app.template,
        title: app.title,
        fileCount: Object.keys(app.files).length,
        totalBytes: app.totalBytes,
        files: Object.keys(app.files),       // names only by default
        artifactId,
        downloadUrl: getArtifactURL(artifactId),
      })
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message })
    }
  })

  app.get('/api/dz-agent-v3/artifact/:id/download', (req, res) => {
    const app = getArtifact(req.params.id)
    if (!app) return res.status(404).json({ ok: false, error: 'artifact not found or expired' })
    try {
      const zip = createZip(app.files)
      const fname = (app.template || 'app') + '-' + req.params.id + '.zip'
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Content-Length': String(zip.length),
      })
      res.end(zip)
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // Show file content of a generated artifact (for preview UI)
  app.get('/api/dz-agent-v3/artifact/:id/file', (req, res) => {
    const app = getArtifact(req.params.id)
    if (!app) return res.status(404).json({ ok: false, error: 'artifact not found or expired' })
    const f = String(req.query.path || '')
    if (!(f in app.files)) return res.status(404).json({ ok: false, error: 'file not in artifact' })
    res.type('text/plain').send(app.files[f])
  })

  // Live scrape — quick non-task aggregator (news + currency + weather)
  app.post('/api/dz-agent-v3/scrape-live', async (req, res) => {
    try {
      const { topic = '', city = 'Algiers' } = req.body || {}
      const [news, currency, weather] = await Promise.all([
        internalFetch(`/api/dz-agent/news?q=${encodeURIComponent(topic)}&limit=8`),
        internalFetch(`/api/currency/latest`),
        internalFetch(`/api/dz-agent/weather?city=${encodeURIComponent(city)}`),
      ])
      res.json({ ok: true, scrapedAt: Date.now(), news, currency, weather })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  console.log('[dz-agent-v3] mounted: /api/dz-agent-v3/{run,task,tasks,generate-app,templates,artifact,scrape-live,agents,health}')
}
