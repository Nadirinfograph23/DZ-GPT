/**
 * DZ-MANUS — Express Routes + SSE Streaming
 * Mounts all DZ-MANUS endpoints under /api/dz-manus/*
 *
 * Endpoints:
 *   POST   /api/dz-manus/task           — Submit new autonomous task
 *   GET    /api/dz-manus/task/:id       — Get task status + result
 *   DELETE /api/dz-manus/task/:id       — Cancel task
 *   GET    /api/dz-manus/tasks          — List all tasks
 *   GET    /api/dz-manus/stream/:id     — SSE stream for task progress
 *   GET    /api/dz-manus/health         — System health
 *   GET    /api/dz-manus/agents         — Agent network status
 *   GET    /api/dz-manus/tools          — Available tools
 *   GET    /api/dz-manus/stats          — Memory + task stats
 *   POST   /api/dz-manus/research       — Quick deep research
 */

import { configure, runTask, getTask, getAllTasks, getTaskStats, cancelTask, TOOL_DEFINITIONS, AGENTS, VERSION } from './index.js'

// In-memory SSE subscriber registry (taskId → Set of res objects)
const _subscribers = new Map()

function addSubscriber(taskId, res) {
  if (!_subscribers.has(taskId)) _subscribers.set(taskId, new Set())
  _subscribers.get(taskId).add(res)
}

function removeSubscriber(taskId, res) {
  _subscribers.get(taskId)?.delete(res)
}

function broadcastEvent(taskId, event) {
  const subs = _subscribers.get(taskId)
  if (!subs?.size) return
  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const res of subs) {
    try { res.write(data) } catch {}
  }
}

function broadcastClose(taskId) {
  const subs = _subscribers.get(taskId)
  if (!subs?.size) return
  for (const res of subs) {
    try { res.write('data: {"type":"stream_end"}\n\n'); res.end() } catch {}
  }
  _subscribers.delete(taskId)
}

export function mountDzManus(app, { safeGenerateAI }) {
  configure({ aiGenerate: safeGenerateAI })

  console.log('[DZ-MANUS] Autonomous AI System mounted: /api/dz-manus/*')

  // ── Health ────────────────────────────────────────────────────────────
  app.get('/api/dz-manus/health', (req, res) => {
    const stats = getTaskStats()
    res.json({
      status:  'ok',
      version: VERSION,
      agents:  AGENTS.length,
      tools:   TOOL_DEFINITIONS.length,
      ...stats,
    })
  })

  // ── Agents ────────────────────────────────────────────────────────────
  app.get('/api/dz-manus/agents', (req, res) => {
    res.json({ agents: AGENTS, version: VERSION })
  })

  // ── Tools ────────────────────────────────────────────────────────────
  app.get('/api/dz-manus/tools', (req, res) => {
    res.json({ tools: TOOL_DEFINITIONS })
  })

  // ── Stats ────────────────────────────────────────────────────────────
  app.get('/api/dz-manus/stats', (req, res) => {
    res.json(getTaskStats())
  })

  // ── List Tasks ────────────────────────────────────────────────────────
  app.get('/api/dz-manus/tasks', (req, res) => {
    const sessionId = req.query.session || null
    res.json({ tasks: getAllTasks({ sessionId, limit: 50 }) })
  })

  // ── Get Task ─────────────────────────────────────────────────────────
  app.get('/api/dz-manus/task/:id', (req, res) => {
    const task = getTask(req.params.id)
    if (!task) return res.status(404).json({ error: 'task_not_found' })
    res.json(task)
  })

  // ── Cancel Task ───────────────────────────────────────────────────────
  app.delete('/api/dz-manus/task/:id', (req, res) => {
    const task = cancelTask(req.params.id)
    if (!task) return res.status(404).json({ error: 'task_not_found' })
    broadcastEvent(req.params.id, { type: 'cancelled' })
    broadcastClose(req.params.id)
    res.json({ cancelled: true, taskId: req.params.id })
  })

  // ── SSE Stream ────────────────────────────────────────────────────────
  app.get('/api/dz-manus/stream/:id', (req, res) => {
    const taskId = req.params.id

    res.setHeader('Content-Type',  'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection',    'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    // Send existing task state immediately
    const task = getTask(taskId)
    if (task) {
      res.write(`data: ${JSON.stringify({ type: 'task_state', task })}\n\n`)
      if (task.status === 'done' || task.status === 'error' || task.status === 'cancelled') {
        res.write('data: {"type":"stream_end"}\n\n')
        return res.end()
      }
    }

    // Register subscriber
    addSubscriber(taskId, res)

    // Heartbeat
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n') } catch { clearInterval(heartbeat) }
    }, 15000)

    req.on('close', () => {
      clearInterval(heartbeat)
      removeSubscriber(taskId, res)
    })
  })

  // ── Submit Task (async — returns taskId immediately, streams via SSE) ─
  app.post('/api/dz-manus/task', async (req, res) => {
    const {
      goal,
      sessionId    = null,
      stream       = true,
      maxIterations = 3,
      skipCritique = false,
    } = req.body || {}

    if (!goal || typeof goal !== 'string' || goal.trim().length < 5) {
      return res.status(400).json({ error: 'goal required (min 5 chars)' })
    }

    const taskId = `manus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Return taskId immediately
    res.json({ taskId, goal: goal.trim(), status: 'queued', streamUrl: `/api/dz-manus/stream/${taskId}` })

    // Run task asynchronously
    setImmediate(async () => {
      try {
        await runTask(taskId, goal.trim(), {
          sessionId,
          maxIterations: Math.min(maxIterations, 5),
          skipCritique,
          onProgress: (event) => broadcastEvent(taskId, event),
        })
      } catch (err) {
        broadcastEvent(taskId, { type: 'task_error', error: err.message })
      } finally {
        broadcastClose(taskId)
      }
    })
  })

  // ── Quick Research (synchronous, returns answer directly) ─────────────
  app.post('/api/dz-manus/research', async (req, res) => {
    const { query, depth = 'medium', lang = 'ar' } = req.body || {}
    if (!query) return res.status(400).json({ error: 'query required' })

    const taskId = `research_${Date.now()}`

    try {
      let answer = ''
      const events = []

      const result = await runTask(taskId, query, {
        skipCritique:  depth === 'low',
        maxIterations: depth === 'deep' ? 3 : 1,
        onProgress: (e) => events.push(e),
      })

      return res.json({
        query,
        answer:  result.answer,
        status:  result.status,
        review:  result.review,
        taskId,
        events:  events.slice(-10),
      })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  })

  // ── Tool Test (direct tool invocation for testing) ────────────────────
  app.post('/api/dz-manus/tool', async (req, res) => {
    const { tool, params } = req.body || {}
    if (!tool) return res.status(400).json({ error: 'tool required' })
    try {
      const { executeTool } = await import('./tools/index.js')
      const result = await executeTool(tool, params || {}, safeGenerateAI)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })
}
