/**
 * DZ Agent V5 — Autonomous GitHub Engineer
 * Real tool execution via ReAct loop: Thought → Action → Observation → Answer
 * Endpoints: /api/dz-agent-v5/{chat, health, tools}
 */

import express from 'express'
import { runReActLoop, shouldUseReActLoop } from '../agent-loop/react.js'

export function mountDzAgentV5(app, opts = {}) {
  const { safeGenerateAI } = opts
  const router = express.Router()

  // ── Health ──────────────────────────────────────────────────────────────────
  router.get('/health', (req, res) => {
    res.json({
      ok: true,
      version: 'v5',
      name: 'DZ Agent V5 — Autonomous GitHub Engineer',
      github_token: !!process.env.GITHUB_TOKEN,
      capabilities: [
        'create_repo', 'push_file', 'push_files_batch', 'list_repos',
        'list_files', 'read_file', 'list_branches', 'create_branch',
        'delete_branch', 'create_pull_request', 'enable_pages', 'get_repo_info',
      ],
    })
  })

  // ── Tools list ──────────────────────────────────────────────────────────────
  router.get('/tools', (req, res) => {
    res.json({
      tools: [
        { name: 'create_repo', desc: 'إنشاء مستودع GitHub جديد' },
        { name: 'list_repos', desc: 'عرض قائمة مستودعاتي' },
        { name: 'push_file', desc: 'رفع أو تعديل ملف في مستودع' },
        { name: 'push_files_batch', desc: 'رفع عدة ملفات دفعة واحدة (atomic commit)' },
        { name: 'list_files', desc: 'عرض ملفات مستودع أو مجلد' },
        { name: 'read_file', desc: 'قراءة محتوى ملف من مستودع' },
        { name: 'list_branches', desc: 'عرض فروع المستودع' },
        { name: 'create_branch', desc: 'إنشاء فرع جديد' },
        { name: 'delete_branch', desc: 'حذف فرع' },
        { name: 'create_pull_request', desc: 'إنشاء Pull Request' },
        { name: 'enable_pages', desc: 'تفعيل GitHub Pages' },
        { name: 'get_repo_info', desc: 'معلومات تفصيلية عن مستودع' },
        { name: 'get_auth_user', desc: 'معلومات المستخدم المصادق عليه' },
      ],
    })
  })

  // ── Chat — SSE streaming ────────────────────────────────────────────────────
  router.post('/chat', async (req, res) => {
    if (!safeGenerateAI) {
      return res.status(503).json({ error: 'AI engine not available.' })
    }

    const { messages = [], stream = false, github_token } = req.body
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    const query = lastUser?.content?.trim() || ''

    if (!query) return res.status(400).json({ error: 'No user message found.' })

    // Resolve token: request body first, then env
    const resolvedToken = (typeof github_token === 'string' ? github_token.trim() : '') || process.env.GITHUB_TOKEN || ''

    // Decide: use ReAct loop or standard AI
    const useReAct = shouldUseReActLoop(query)

    if (!stream) {
      // Non-streaming: run loop, return JSON result
      if (useReAct) {
        const steps = []
        const result = await runReActLoop({
          query,
          messages,
          aiGenerate: safeGenerateAI,
          githubToken: resolvedToken,
          onStep: (s) => steps.push(s),
        }).catch(err => ({ content: `⚠️ خطأ: ${err.message}`, steps: [], model: null }))

        return res.json({
          content: result.content,
          model: result.model,
          mode: 'react-loop',
          steps: result.steps || steps,
          github_token: !!process.env.GITHUB_TOKEN,
        })
      } else {
        // Standard AI for non-GitHub queries
        try {
          const result = await safeGenerateAI({ messages, query, max_tokens: 4096 })
          return res.json({
            content: result?.content || '',
            model: result?.model || 'unknown',
            mode: 'standard',
          })
        } catch (err) {
          return res.status(500).json({ error: err.message })
        }
      }
    }

    // SSE streaming mode
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    function sendEvent(event, data) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    const abortController = new AbortController()
    req.on('close', () => abortController.abort())

    try {
      if (useReAct) {
        sendEvent('start', { mode: 'react-loop', github_token: !!process.env.GITHUB_TOKEN })

        const result = await runReActLoop({
          query,
          messages,
          aiGenerate: safeGenerateAI,
          githubToken: resolvedToken,
          signal: abortController.signal,
          onStep: (step) => sendEvent('step', step),
        })

        sendEvent('done', { content: result.content, model: result.model, steps: result.steps })
      } else {
        sendEvent('start', { mode: 'standard' })
        const result = await safeGenerateAI({ messages, query, max_tokens: 4096 })
        sendEvent('done', { content: result?.content || '', model: result?.model || 'unknown' })
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        sendEvent('error', { message: err.message })
      }
    } finally {
      res.end()
    }
  })

  // ── Direct tool execution endpoint (for UI buttons) ─────────────────────────
  // SECURITY FIX: يتطلب رمز داخلي في header — يمنع وصول جهات خارجية
  router.post('/execute-tool', (req, res, next) => {
    const internalToken = req.headers['x-internal-token'] || req.headers['x-dz-token']
    const envSecret = process.env.INTERNAL_SECRET || process.env.GITHUB_TOKEN?.slice(0, 16)
    // السماح فقط للطلبات الداخلية أو من localhost أو إذا لا يوجد secret مُعيَّن
    const isLocal = (req.ip === '127.0.0.1' || req.ip === '::1' || req.hostname === 'localhost')
    if (envSecret && !isLocal && internalToken !== envSecret) {
      return res.status(403).json({ error: 'Forbidden: x-internal-token header required for tool execution.' })
    }
    next()
  }, async (req, res) => {
    const { tool, args = {} } = req.body
    if (!tool || typeof tool !== 'string') {
      return res.status(400).json({ error: 'Tool name required.' })
    }
    if (typeof args !== 'object' || Array.isArray(args)) {
      return res.status(400).json({ error: 'Args must be a plain object.' })
    }

    // Args sanitization — reject suspiciously large or dangerous values
    const ALLOWED_ARG_KEYS = new Set([
      'repo', 'path', 'content', 'message', 'branch', 'from_branch',
      'name', 'description', 'isPrivate', 'autoInit', 'files',
      'type', 'per_page', 'title', 'head', 'base', 'body', 'token',
    ])
    const sanitizedArgs = {}
    for (const [k, v] of Object.entries(args)) {
      if (!ALLOWED_ARG_KEYS.has(k)) continue  // strip unknown keys
      if (typeof v === 'string' && v.length > 500_000) {
        return res.status(400).json({ error: `Arg "${k}" exceeds 500KB limit.` })
      }
      sanitizedArgs[k] = v
    }

    // Import and execute tool directly
    try {
      const { executeGithubTool, GITHUB_TOOLS } = await import('../tools/github-tools.js')
      if (!GITHUB_TOOLS[tool]) {
        return res.status(400).json({ error: `Unknown tool: "${tool}"` })
      }
      const result = await executeGithubTool(tool, {
        ...sanitizedArgs,
        token: sanitizedArgs.token || process.env.GITHUB_TOKEN || '',
      })
      return res.json({ tool, result })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  })

  app.use('/api/dz-agent-v5', router)
  console.log('[dz-v5] ✅ mounted: /api/dz-agent-v5/{chat,health,tools,execute-tool}')
}
