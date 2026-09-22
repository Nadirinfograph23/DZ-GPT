/**
 * YouTube Insight Module — production mount
 * Exposes the existing controller through the API used by the chat UI.
 * Search and URL analysis share one deterministic engine; no stub response.
 */
import express from 'express'
import { handleYouTubeInput, handleVideoDiscussion } from './controller.js'

export function mountYouTubeInsight(app, opts = {}) {
  const router = express.Router()
  const aiGenerate = opts.aiGenerate || (async () => null)

  router.post('/analyze', async (req, res) => {
    try {
      const body = req.body || {}
      const input = String(body.url || body.query || body.text || '').trim()
      if (!input) return res.status(400).json({ ok: false, error: 'url or query is required' })

      const result = await handleYouTubeInput(input, {
        aiGenerate,
        preloadedMeta: body.preloadedMeta || null,
        noSuggestions: !!body.noSuggestions,
      })
      return res.json({ ok: true, ...result })
    } catch (error) {
      console.error('[YouTube Insight] analyze failed:', error)
      return res.status(502).json({
        ok: false,
        error: error?.message || 'YouTube analysis failed',
      })
    }
  })

  router.post('/discuss', async (req, res) => {
    try {
      const body = req.body || {}
      const question = String(body.question || body.text || '').trim()
      if (!question) return res.status(400).json({ ok: false, error: 'question is required' })

      const result = await handleVideoDiscussion(
        body.youtubeContext || {},
        question,
        Array.isArray(body.history) ? body.history : [],
        aiGenerate,
      )
      return res.json({ ok: true, ...result })
    } catch (error) {
      console.error('[YouTube Insight] discussion failed:', error)
      return res.status(502).json({
        ok: false,
        error: error?.message || 'YouTube discussion failed',
      })
    }
  })

  app.use('/api/youtube-insight', router)
}
