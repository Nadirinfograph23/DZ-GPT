/**
 * YouTube Insight Module — Express Mount
 * Attaches new endpoints under /api/youtube-insight/*.
 * Additive only — touches no existing routes.
 *
 * Endpoints:
 *   GET  /api/youtube-insight/health
 *   POST /api/youtube-insight/analyze   { input }
 *   POST /api/youtube-insight/discuss   { videoId, message, videoData?, history? }
 *   GET  /api/youtube-insight/search?q=...
 */

import { handleYouTubeInput, handleVideoDiscussion } from './controller.js'
import { fetchVideoData } from './extractor.js'

// In-memory video cache — avoids re-fetching the same video in a session
const videoCache = new Map()
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

function getCachedVideo(videoId) {
  const entry = videoCache.get(videoId)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) { videoCache.delete(videoId); return null }
  return entry.data
}

function cacheVideo(videoId, data) {
  videoCache.set(videoId, { data, ts: Date.now() })
  if (videoCache.size > 100) {
    // Evict oldest entry
    const oldest = [...videoCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) videoCache.delete(oldest[0])
  }
}

function sanitize(str, max = 2000) {
  if (typeof str !== 'string') return ''
  return str.slice(0, max).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/**
 * Mount the YouTube Insight Module onto an Express app.
 * @param {Object}   app          — Express app instance
 * @param {Object}   options
 * @param {Function} options.aiGenerate — AI generator from server.js
 */
export function mountYouTubeInsight(app, { aiGenerate } = {}) {
  if (!app || typeof app.get !== 'function') {
    console.warn('[youtube-insight] no Express app; skipping mount')
    return
  }

  // ── Health ────────────────────────────────────────────────────────────────
  app.get('/api/youtube-insight/health', (_req, res) => {
    res.json({
      ok: true,
      module: 'youtube-insight',
      version: '1.0.0',
      capabilities: ['url-analysis', 'search', 'discussion', 'captions', 'ai-analysis'],
      aiAvailable: typeof aiGenerate === 'function',
      cachedVideos: videoCache.size,
    })
  })

  // ── Analyze: URL or Search ────────────────────────────────────────────────
  // POST /api/youtube-insight/analyze
  // Body: { input: "https://youtube.com/..." | "search query" }
  app.post('/api/youtube-insight/analyze', async (req, res) => {
    const input = sanitize(req.body?.input || '', 500)
    if (!input) {
      return res.status(400).json({ ok: false, error: 'input is required (YouTube URL or search query)' })
    }

    try {
      const result = await handleYouTubeInput(input, { aiGenerate })

      // Cache video data for follow-up /discuss calls
      if (result.ok && result.flow === 'url' && result.videoId) {
        const existing = getCachedVideo(result.videoId)
        if (!existing) {
          // Re-fetch to get full videoData with captions into cache
          fetchVideoData(result.videoId)
            .then(data => cacheVideo(result.videoId, data))
            .catch(() => {})
        }
      }

      res.json(result)
    } catch (err) {
      console.error('[youtube-insight] /analyze error:', err.message)
      res.status(500).json({
        ok: false,
        error: err.message,
        message: '⚠️ حدث خطأ أثناء تحليل الفيديو. يرجى المحاولة مرة أخرى.',
      })
    }
  })

  // ── Search only ───────────────────────────────────────────────────────────
  // GET /api/youtube-insight/search?q=...&limit=8
  app.get('/api/youtube-insight/search', async (req, res) => {
    const q = sanitize(String(req.query.q || ''), 200)
    if (!q) return res.status(400).json({ ok: false, error: 'q is required' })
    const limit = Math.min(Number(req.query.limit) || 8, 20)

    try {
      const result = await handleYouTubeInput(q, { aiGenerate: null }) // search only, no AI
      res.json(result)
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── Discuss: continue conversation about a video ──────────────────────────
  // POST /api/youtube-insight/discuss
  // Body: { videoId, message, history?: [{role,content}] }
  app.post('/api/youtube-insight/discuss', async (req, res) => {
    const { videoId, message, history } = req.body || {}
    const cleanVideoId = sanitize(String(videoId || ''), 20)
    const cleanMessage = sanitize(String(message || ''), 2000)

    if (!cleanVideoId) return res.status(400).json({ ok: false, error: 'videoId is required' })
    if (!cleanMessage) return res.status(400).json({ ok: false, error: 'message is required' })

    // Retrieve video data from cache, or fetch fresh
    let videoData = getCachedVideo(cleanVideoId)
    if (!videoData) {
      try {
        videoData = await fetchVideoData(cleanVideoId)
        cacheVideo(cleanVideoId, videoData)
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: `Could not load video data: ${err.message}`,
          message: '⚠️ تعذر تحميل بيانات الفيديو. يرجى البدء من جديد بإرسال رابط الفيديو.',
        })
      }
    }

    // Sanitize history
    const safeHistory = Array.isArray(history)
      ? history
          .filter(m => m && typeof m.role === 'string' && typeof m.content === 'string')
          .slice(-20)
          .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: sanitize(m.content, 1000) }))
      : []

    try {
      const result = await handleVideoDiscussion(videoData, cleanMessage, safeHistory, aiGenerate)
      res.json(result)
    } catch (err) {
      console.error('[youtube-insight] /discuss error:', err.message)
      res.status(500).json({ ok: false, reply: '⚠️ حدث خطأ. يرجى المحاولة مرة أخرى.' })
    }
  })

  // ── Fetch raw video metadata (no AI) ─────────────────────────────────────
  // GET /api/youtube-insight/video/:id
  app.get('/api/youtube-insight/video/:id', async (req, res) => {
    const videoId = sanitize(req.params.id || '', 20)
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ ok: false, error: 'Invalid video ID' })
    }

    let data = getCachedVideo(videoId)
    if (!data) {
      try {
        data = await fetchVideoData(videoId)
        cacheVideo(videoId, data)
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message })
      }
    }

    res.json({
      ok: true,
      video: {
        id: data.id,
        url: data.url,
        title: data.title,
        channel: data.channel,
        duration: data.duration,
        views: data.views,
        thumbnail: data.thumbnail,
        publishDate: data.publishDate,
        tags: data.tags,
        captionAvailable: !!data.captions,
      },
    })
  })

  console.log('[youtube-insight] mounted: /api/youtube-insight/{health,analyze,search,discuss,video/:id}')
}
