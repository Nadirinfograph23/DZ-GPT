// Design Intelligence — stub mount
import express from 'express'

export function mountDesignIntelligence(app, opts = {}) {
  const router = express.Router()

  router.post('/analyze', async (req, res) => {
    res.json({ ok: false, error: 'Design Intelligence is not available in this environment.' })
  })

  app.use('/api/design-intelligence', router)
}
