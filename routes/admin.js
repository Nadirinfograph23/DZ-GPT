/**
 * routes/admin.js
 * Admin diagnostic and monitoring endpoints.
 * Extracted from server.js lines 2312–2435.
 *
 * GET  /api/admin/router-diagnostic
 * GET  /api/admin/router-logs
 * GET  /api/admin/provider-scores
 * POST /api/admin/reset-provider/:provider
 * POST /api/admin/test-provider
 * GET  /api/admin/full-report
 * GET  /api/system-health
 * GET  /api/ai-router/health
 *
 * Security: protected by requireAdmin middleware (open if DEPLOY_ADMIN_TOKEN not set).
 *
 * Factory deps:
 *   getGroqKeys          - () => string[]
 *   callGroqWithFallback - async ({ model, messages, max_tokens }) => { content, error }
 *   PORT                 - number
 */
import { Router } from 'express'
import {
  getRouterDiagnosticSummary,
  getProviderStatus,
  testSingleProvider,
  getProviderScores,
  getRouterLogs,
  resetProviderScore,
  getRouterHealthSnapshot,
} from '../lib/ai-router/index.js'
import { systemHealthSnapshot } from '../lib/resilience.js'
import { requireAdmin } from '../middleware/auth.js'

export function createAdminRouter(deps = {}) {
  const { getGroqKeys, callGroqWithFallback, PORT = 5000 } = deps
  const router = Router()

  // ── Admin-protected routes ────────────────────────────────────
  router.get('/admin/router-diagnostic', requireAdmin, (_req, res) => {
    try { res.json(getRouterDiagnosticSummary()) }
    catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  router.get('/admin/router-logs', requireAdmin, (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || '100', 10), 500)
      const provider = req.query.provider || null
      res.json({ logs: getRouterLogs(limit, provider), ts: new Date().toISOString() })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  router.get('/admin/provider-scores', requireAdmin, (_req, res) => {
    try { res.json({ scores: getProviderScores(), ts: new Date().toISOString() }) }
    catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  router.post('/admin/reset-provider/:provider', requireAdmin, (req, res) => {
    const ALLOWED = ['openai', 'gemini', 'mistral', 'nvidia', 'cohere', 'openrouter', 'groq', 'deepseek', 'ollama']
    const { provider } = req.params
    if (!ALLOWED.includes(provider)) {
      return res.status(400).json({ ok: false, error: `Unknown provider: ${provider}` })
    }
    try {
      resetProviderScore(provider)
      res.json({ ok: true, provider, msg: `Score for ${provider} reset to 100` })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  router.post('/admin/test-provider', requireAdmin, async (req, res) => {
    const { provider } = req.body || {}
    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ ok: false, error: 'provider name required' })
    }
    const allowed = ['openai', 'gemini', 'mistral', 'nvidia', 'cohere', 'openrouter', 'groq']
    if (!allowed.includes(provider)) {
      return res.status(400).json({ ok: false, error: `Unknown provider: ${provider}` })
    }

    if (provider === 'groq') {
      const keys = getGroqKeys ? getGroqKeys() : []
      if (!keys.length) return res.json({ ok: false, error: 'No Groq API key configured (AI_API_KEY)' })
      const t0 = Date.now()
      try {
        const { content, error } = await callGroqWithFallback({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
          max_tokens: 10,
        })
        if (content) return res.json({ ok: true, model: 'groq:llama-3.1-8b-instant', latencyMs: Date.now() - t0 })
        return res.json({ ok: false, error: error || 'Empty response from Groq' })
      } catch (e) { return res.json({ ok: false, error: e.message }) }
    }

    try {
      const result = await testSingleProvider(provider)
      return res.json(result)
    } catch (e) { return res.json({ ok: false, error: e.message }) }
  })

  router.get('/admin/full-report', requireAdmin, async (_req, res) => {
    try {
      const [syncResult] = await Promise.allSettled([
        Promise.race([
          fetch(`http://localhost:${PORT}/api/dz-agent/sync-status`).then(r => r.json()),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
        ]),
      ])
      const sync = syncResult.status === 'fulfilled' ? syncResult.value : null
      const keys = getGroqKeys ? getGroqKeys() : []

      res.json({
        generated: new Date().toISOString(),
        systemHealth: systemHealthSnapshot(),
        routerDiagnostics: getRouterDiagnosticSummary(),
        providerStatus: getProviderStatus(),
        groqKeys: { count: keys.length, configured: keys.length > 0 },
        environmentKeys: {
          GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
          VERCEL_TOKEN: !!process.env.VERCEL_TOKEN,
          GROQ_API_KEY: keys.length > 0,
          GEMINI_API_KEY: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
          MISTRAL_API_KEY: !!process.env.MISTRAL_API_KEY,
          NVIDIA_API_KEY: !!process.env.NVIDIA_API_KEY,
          COHERE_API_KEY: !!process.env.COHERE_API_KEY,
          OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
          AI_INTEGRATIONS_OPENAI: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
          HF_TOKEN: !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY),
          OPENWEATHER: !!process.env.OPENWEATHER_API_KEY,
          GOOGLE_CSE: !!((process.env.GOOGLE_API_KEY_NEW || process.env.GOOGLE_API_KEY) && process.env.GOOGLE_CSE_ID),
        },
        sync,
      })
    } catch (err) { res.status(500).json({ ok: false, error: err.message }) }
  })

  return router
}
