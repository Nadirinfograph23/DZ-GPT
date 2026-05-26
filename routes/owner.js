/**
 * routes/owner.js
 * Owner command and breaking-feeds management endpoints.
 * Extracted from server.js lines 2225–2310.
 *
 * POST   /api/owner/command
 * GET    /api/owner/config
 * GET    /api/owner/breaking-feeds
 * POST   /api/owner/breaking-feeds
 * DELETE /api/owner/breaking-feeds
 * PATCH  /api/owner/breaking-feeds/pause
 * PATCH  /api/owner/breaking-feeds/resume
 * POST   /api/owner/breaking-feeds/poll
 *
 * All routes require owner identity (Nadirinfograph23 GitHub token).
 *
 * Factory deps:
 *   getRSSFeeds - () => RSS_FEEDS object (lazy getter to avoid temporal dead zone)
 */
import { Router } from 'express'
import {
  loadOwnerConfig, saveOwnerConfig,
  processOwnerCommand, verifyOwnerToken,
} from '../lib/owner-commands.js'
import {
  listFeeds, addFeed, removeFeed,
  pauseFeed, resumeFeed, triggerPollNow,
} from '../lib/breaking-news.js'

export function createOwnerRouter(deps = {}) {
  const { getRSSFeeds } = deps
  const router = Router()

  async function _ownerAuth(req, res) {
    const tok =
      (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') ||
      req.body?.githubToken ||
      process.env.GITHUB_TOKEN ||
      ''
    const ok = await verifyOwnerToken(tok)
    if (!ok) res.status(403).json({ ok: false, error: 'تحقق الهوية فشل — يجب أن تكون Nadirinfograph23.' })
    return ok
  }

  router.post('/owner/command', async (req, res) => {
    const { message, githubToken } = req.body || {}
    if (!message) return res.status(400).json({ error: 'message is required' })
    const tok = githubToken || process.env.GITHUB_TOKEN || ''
    const isOwner = await verifyOwnerToken(tok)
    if (!isOwner) {
      return res.status(403).json({ error: 'تحقق الهوية فشل — يجب أن تكون مالك المشروع (Nadirinfograph23).' })
    }
    const cfg = loadOwnerConfig()
    const result = processOwnerCommand(message, cfg)
    if (result.success && result.config) {
      saveOwnerConfig(result.config)
      if (result.feed && getRSSFeeds) {
        const RSS_FEEDS = getRSSFeeds()
        const alreadyIn = RSS_FEEDS?.national?.some(f => f.url === result.feed.url)
        if (!alreadyIn && RSS_FEEDS?.national) {
          RSS_FEEDS.national.push({ name: result.feed.name, url: result.feed.url, _owner: true })
        }
      }
    }
    res.json({ success: result.success, message: result.message, config: result.config })
  })

  router.get('/owner/config', async (req, res) => {
    const tok = req.headers.authorization?.replace('token ', '') || process.env.GITHUB_TOKEN || ''
    const isOwner = await verifyOwnerToken(tok)
    if (!isOwner) return res.status(403).json({ error: 'غير مصرح' })
    res.json(loadOwnerConfig())
  })

  router.get('/owner/breaking-feeds', async (req, res) => {
    if (!await _ownerAuth(req, res)) return
    res.json({ ok: true, feeds: listFeeds() })
  })

  router.post('/owner/breaking-feeds', async (req, res) => {
    if (!await _ownerAuth(req, res)) return
    const { name, url } = req.body || {}
    const result = addFeed(name?.trim(), url?.trim())
    res.status(result.ok ? 200 : 400).json(result)
  })

  router.delete('/owner/breaking-feeds', async (req, res) => {
    if (!await _ownerAuth(req, res)) return
    const { url } = req.body || {}
    if (!url) return res.status(400).json({ ok: false, error: 'url مطلوب' })
    res.json(removeFeed(url))
  })

  router.patch('/owner/breaking-feeds/pause', async (req, res) => {
    if (!await _ownerAuth(req, res)) return
    const { url } = req.body || {}
    if (!url) return res.status(400).json({ ok: false, error: 'url مطلوب' })
    res.json(pauseFeed(url))
  })

  router.patch('/owner/breaking-feeds/resume', async (req, res) => {
    if (!await _ownerAuth(req, res)) return
    const { url } = req.body || {}
    if (!url) return res.status(400).json({ ok: false, error: 'url مطلوب' })
    res.json(resumeFeed(url))
  })

  router.post('/owner/breaking-feeds/poll', async (req, res) => {
    if (!await _ownerAuth(req, res)) return
    triggerPollNow().catch(() => {})
    res.json({ ok: true, message: 'بدأ الفحص الفوري — النتائج ستُبث عبر SSE إذا وُجدت أخبار عاجلة' })
  })

  return router
}
