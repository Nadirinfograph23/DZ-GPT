/**
 * DZ Autonomous Agent — Express Router Mount
 * Exposes SSE streaming endpoint: POST /api/dz-agent/autonomous/stream
 *
 * Purely additive — no existing routes modified.
 */

import express from 'express'
import { runAutonomousPipeline } from './orchestrator.js'
import { shouldUseAutonomousPipeline } from './task-classifier.js'

function sanitize(str, max = 8000) {
  if (typeof str !== 'string') return ''
  return str.slice(0, max).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

export function mountAutonomousAgent(app, { aiGenerate } = {}) {
  if (!app || typeof app.use !== 'function') return
  if (typeof aiGenerate !== 'function') {
    console.warn('[autonomous] aiGenerate not provided — autonomous agent disabled')
    return
  }

  const router = express.Router()
  router.use(express.json({ limit: '512kb' }))

  // ── Health check ──────────────────────────────────────────────────────────
  router.get('/health', (_req, res) => {
    res.json({ ok: true, version: 'autonomous-v1', status: 'active' })
  })

  // ── Classify (for UI preview) ─────────────────────────────────────────────
  router.post('/classify', (req, res) => {
    const { classifyAutonomousTask, shouldUseAutonomousPipeline } = require('./task-classifier.js')
    const query = sanitize(req.body?.query || '', 2000)
    if (!query) return res.status(400).json({ error: 'query required' })
    const task = classifyAutonomousTask(query)
    res.json({ ok: true, task, willUseAutonomous: shouldUseAutonomousPipeline(query) })
  })

  // ── Main SSE Streaming Endpoint ───────────────────────────────────────────
  router.post('/stream', async (req, res) => {
    const query    = sanitize(req.body?.query || '', 8000)
    const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-10) : []

    if (!query) {
      res.status(400).json({ error: 'query is required' })
      return
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    const sendEvent = (type, data) => {
      try {
        const line = `data: ${JSON.stringify({ type, ...data })}\n\n`
        res.write(line)
        res.flush?.()
      } catch (_) {}
    }

    // Heartbeat every 15s to prevent proxy timeouts
    const heartbeat = setInterval(() => {
      try { res.write(': heartbeat\n\n'); res.flush?.() } catch (_) { clearInterval(heartbeat) }
    }, 15000)

    // Abort if client disconnects
    const abortCtrl = new AbortController()
    req.on('close', () => abortCtrl.abort())

    try {
      sendEvent('start', { query: query.slice(0, 80) })

      const result = await runAutonomousPipeline({
        query,
        messages,
        aiGenerate,
        signal: abortCtrl.signal,
        onStep: (step) => sendEvent('step', { step }),
      })

      sendEvent('done', {
        content: result.content,
        model: result.model,
        task: result.task,
      })
    } catch (err) {
      console.error('[autonomous/stream] Error:', err.message)
      sendEvent('error', { message: err.message || 'Unknown error' })
    } finally {
      clearInterval(heartbeat)
      res.end()
    }
  })

  app.use('/api/dz-agent/autonomous', router)
  console.log('[autonomous] mounted: /api/dz-agent/autonomous/{health,classify,stream}')
}
