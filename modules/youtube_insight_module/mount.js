// YouTube Insight Module — production mount
import express from 'express'
import { handleYouTubeInput, handleVideoDiscussion } from './controller.js'

export function mountYouTubeInsight(app, opts = {}) {
  const router = express.Router()
  const aiGenerate = opts.aiGenerate

  router.post('/analyze', async (req, res) => {
    try {
      const input = String(req.body?.url || req.body?.query || req.body?.text || '').trim()
      if (!input) return res.status(400).json({ ok: false, error: 'أرسل رابط YouTube أو كلمات البحث.' })
      const result = await handleYouTubeInput(input, {
        aiGenerate,
        preloadedMeta: req.body?.preloadedMeta || null,
        noSuggestions: Boolean(req.body?.noSuggestions),
      })
      return res.json({ ok: true, ...result })
    } catch (err) {
      console.error('[YouTube Insight] analyze:', err)
      return res.status(502).json({ ok: false, error: 'تعذر معالجة فيديو YouTube حالياً.' })
    }
  })

  router.post('/discuss', async (req, res) => {
    try {
      const context = req.body?.video || req.body?.context || {}
      const question = String(req.body?.question || '').trim()
      if (!context?.id || !question) {
        return res.status(400).json({ ok: false, error: 'يلزم فيديو نشط وسؤال.' })
      }
      const result = await handleVideoDiscussion(
        context,
        question,
        Array.isArray(req.body?.history) ? req.body.history : [],
        aiGenerate,
      )
      return res.json({ ok: true, ...result })
    } catch (err) {
      console.error('[YouTube Insight] discuss:', err)
      return res.status(502).json({ ok: false, error: 'تعذر تحليل الفيديو حالياً.' })
    }
  })

  app.use('/api/youtube-insight', router)
}
