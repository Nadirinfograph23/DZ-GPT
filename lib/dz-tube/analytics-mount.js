// Mounts /api/dz-tube/analytics/* on the Express app.
// Pure additive — no existing route changed.
import { recordEvents, getRecent, getStats } from './analytics.js'

export function mountDzTubeAnalytics(app) {
  if (!app || typeof app.post !== 'function') return

  app.post('/api/dz-tube/analytics/event', async (req, res) => {
    try {
      const events = Array.isArray(req.body?.events) ? req.body.events : (Array.isArray(req.body) ? req.body : [req.body])
      const n = await recordEvents(events)
      res.json({ ok: true, recorded: n })
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message })
    }
  })

  app.get('/api/dz-tube/analytics/recent', (req, res) => {
    res.json({ ok: true, events: getRecent(Number(req.query.limit) || 50) })
  })

  app.get('/api/dz-tube/analytics/stats', async (_req, res) => {
    try {
      const stats = await getStats()
      res.json({ ok: true, stats })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  console.log('[dz-tube-analytics] mounted: /api/dz-tube/analytics/{event,recent,stats}')
}
