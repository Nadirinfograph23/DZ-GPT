// DZ Agent V5 — stub mount (endpoints under /api/dz-agent-v5/*)
import express from 'express'

export function mountDzAgentV5(app, opts = {}) {
  const router = express.Router()

  router.post('/chat', async (req, res) => {
    res.json({ ok: false, error: 'DZ Agent V5 is not available in this environment.' })
  })

  app.use('/api/dz-agent-v5', router)
}
