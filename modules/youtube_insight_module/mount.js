// YouTube Insight Module — stub mount
import express from 'express'

export function mountYouTubeInsight(app, opts = {}) {
  const router = express.Router()

  router.post('/analyze', async (req, res) => {
    res.json({ ok: false, error: 'YouTube Insight module is not available in this environment.' })
  })

  app.use('/api/youtube-insight', router)
}
