// Download V2 service — stub mount
import express from 'express'

export function mountDownloadV2(app) {
  const router = express.Router()

  router.post('/start', async (req, res) => {
    res.json({ ok: false, error: 'Download V2 service is not available in this environment.' })
  })

  app.use('/api/download-v2', router)
}
