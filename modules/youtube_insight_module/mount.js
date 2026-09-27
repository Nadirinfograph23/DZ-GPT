// YouTube Insight Module — HTTP adapter for the DZ Agent controller
import express from 'express'
import { handleYouTubeInput, handleVideoDiscussion } from './controller.js'

export function mountYouTubeInsight(app, opts = {}) {
  const router = express.Router()
  const aiGenerate = opts.aiGenerate

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'youtube-insight' })
  })

  router.post('/analyze', async (req, res) => {
    try {
      const input = req.body?.url || req.body?.videoUrl || req.body?.query
      if (!input || typeof input !== 'string') {
        return res.status(400).json({ ok: false, error: 'url or query is required.' })
      }
      const result = await handleYouTubeInput(input, {
        aiGenerate,
        preloadedMeta: req.body?.preloadedMeta,
      })
      return res.json({ ok: true, ...result })
    } catch (error) {
      console.error('[youtube-insight] analyze failed:', error.message)
      return res.status(502).json({ ok: false, error: 'YouTube analysis failed.' })
    }
  })

  router.post('/search', async (req, res) => {
    try {
      const query = req.body?.query
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ ok: false, error: 'query is required.' })
      }
      const result = await handleYouTubeInput(query, { aiGenerate, noSuggestions: true })
      return res.json({ ok: true, ...result })
    } catch (error) {
      console.error('[youtube-insight] search failed:', error.message)
      return res.status(502).json({ ok: false, error: 'YouTube search failed.' })
    }
  })

  router.post('/discuss', async (req, res) => {
    try {
      const context = req.body?.youtubeContext || req.body?.video
      const question = req.body?.question
      if (!context || !question || typeof question !== 'string') {
        return res.status(400).json({ ok: false, error: 'video context and question are required.' })
      }
      const result = await handleVideoDiscussion(
        context,
        question,
        Array.isArray(req.body?.history) ? req.body.history : [],
        aiGenerate,
      )
      return res.json({ ok: true, ...result })
    } catch (error) {
      console.error('[youtube-insight] discussion failed:', error.message)
      return res.status(502).json({ ok: false, error: 'YouTube discussion failed.' })
    }
  })

  router.get('/video/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').match(/^[\w-]{6,}$/)?.[0]
      if (!id) return res.status(400).json({ ok: false, error: 'Invalid video id.' })
      const result = await handleYouTubeInput(`https://www.youtube.com/watch?v=${id}`, { aiGenerate })
      return res.json({ ok: true, ...result })
    } catch (error) {
      console.error('[youtube-insight] video failed:', error.message)
      return res.status(502).json({ ok: false, error: 'YouTube video analysis failed.' })
    }
  })

  app.use('/api/youtube-insight', router)
}
