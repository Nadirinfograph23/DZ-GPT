/**
 * DZ Agent V5 — API Mount
 * Mounts all autonomous agent endpoints at /api/dz-v5/*
 * Additive only — no existing routes changed.
 */

import express from 'express'
import { createPlan } from './core/planner.js'
import { TaskExecutor } from './core/executor.js'
import { getMemory } from './core/memory.js'
import { ReflectionEngine } from './core/reflection.js'
import { getRouter } from './core/router.js'
import { ToolRegistry } from './tools/registry.js'
import { AgentCoordinator } from './agents/coordinator.js'
import { getWorkspace } from './workspace/manager.js'
import { getMonitor } from './monitoring/logger.js'
import { getSandbox } from './security/sandbox.js'

// In-memory task store (taskId → {plan, status, events, result})
const TASKS = new Map()

// SSE connection store (taskId → [res, ...])
const SSE_CLIENTS = new Map()

function emit(taskId, event) {
  const clients = SSE_CLIENTS.get(taskId) || []
  const data = `data: ${JSON.stringify(event)}\n\n`
  clients.forEach(res => {
    try { res.write(data) } catch {}
  })
}

function closeSSE(taskId) {
  const clients = SSE_CLIENTS.get(taskId) || []
  clients.forEach(res => {
    try { res.write('data: {"type":"done"}\n\n'); res.end() } catch {}
  })
  SSE_CLIENTS.delete(taskId)
}

export function mountDzAgentV5(app, { safeGenerateAI } = {}) {
  const r = express.Router()
  r.use(express.json({ limit: '4mb' }))

  // ── Singletons ───────────────────────────────────────────────────────────
  const memory    = getMemory()
  const monitor   = getMonitor()
  const sandbox   = getSandbox()
  const workspace = getWorkspace()
  const modelRouter = getRouter()

  const tools = new ToolRegistry({ memory, workspaceManager: workspace })
  const coordinator = new AgentCoordinator()
  const reflection = new ReflectionEngine({ safeGenerateAI, memory })

  const executor = new TaskExecutor({
    safeGenerateAI,
    toolRegistry: tools,
    agentCoordinator: coordinator,
    monitor,
    memory,
  })

  // Wrap safeGenerateAI with model routing + monitoring
  async function routedAI(params) {
    const taskType = modelRouter.detectTaskType(params.query || '')
    const start = Date.now()
    try {
      const result = await safeGenerateAI(params)
      modelRouter.recordLatency(params.model || 'default', Date.now() - start)
      modelRouter.recordSuccess(params.model || 'default')
      return result
    } catch (err) {
      modelRouter.recordError(params.model || 'default')
      throw err
    }
  }

  // ── Health ────────────────────────────────────────────────────────────────
  r.get('/health', (_req, res) => {
    res.json({
      ok: true,
      version: 'v5-autonomous',
      capabilities: [
        'autonomous-planning', 'multi-agent', 'tool-calling',
        'persistent-memory', 'self-reflection', 'code-execution',
        'web-search', 'github-integration', 'file-system',
      ],
      monitor: monitor.stats(),
      memory: memory.stats(),
      sandbox: sandbox.stats(),
      workspace: workspace.stats(),
      tools: tools.list().map(t => t.name),
    })
  })

  // ── Submit task (async autonomous execution) ──────────────────────────────
  r.post('/task', async (req, res) => {
    const { goal, mode = 'auto', approvalMode = false } = req.body || {}

    // Validate
    const validation = sandbox.validateTask(goal)
    if (!validation.ok) return res.status(400).json({ error: validation.reason })

    // Build task ID
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // Get memory context
    const pastContext = memory.buildContext(goal, taskId)

    // Create plan
    let planResult
    try {
      planResult = await createPlan(goal, safeGenerateAI, { pastContext })
    } catch (err) {
      return res.status(500).json({ error: 'Planning failed: ' + err.message })
    }

    const { plan } = planResult

    // Validate plan
    const planValidation = sandbox.validatePlan(plan)
    if (!planValidation.ok) return res.status(400).json({ error: planValidation.reason })

    // Store task
    const task = {
      taskId,
      plan,
      goal,
      mode,
      approvalMode,
      status: 'planned',
      createdAt: Date.now(),
      events: [],
    }
    TASKS.set(taskId, task)
    sandbox.registerTask(taskId)
    workspace.createTaskWorkspace(taskId)
    workspace.saveTaskState(taskId, task)

    // Return immediately with taskId — execution happens async
    res.json({ ok: true, taskId, plan, status: 'planned' })

    // Execute in background
    setImmediate(async () => {
      task.status = 'running'
      monitor.taskStart(taskId, goal)

      const emitFn = (event) => {
        task.events.push({ ...event, ts: Date.now() })
        emit(taskId, event)
        // Save state periodically
        if (task.events.length % 5 === 0) workspace.saveTaskState(taskId, task)
      }

      try {
        const result = await executor.execute({ plan, taskId }, emitFn)
        task.status = 'done'
        task.result = result
        task.completedAt = Date.now()
        task.duration = task.completedAt - task.createdAt

        // Reflect
        const reflectionResult = await reflection.reflect(task, {
          plan, taskId, goal, stepResults: result.context?.stepResults || {},
          startedAt: task.createdAt,
        }).catch(() => null)
        task.reflection = reflectionResult

        emitFn({ type: 'task_complete', result: result.result, reflection: reflectionResult, duration: task.duration })
      } catch (err) {
        task.status = 'failed'
        task.error = err.message
        monitor.taskFail(taskId, err.message)
        emitFn({ type: 'task_error', error: err.message })
      } finally {
        sandbox.releaseTask(taskId)
        workspace.saveTaskState(taskId, task)
        closeSSE(taskId)
      }
    })
  })

  // ── Chat mode (synchronous, streaming) ────────────────────────────────────
  r.post('/chat', async (req, res) => {
    const { message, history = [], stream = true } = req.body || {}
    if (!message) return res.status(400).json({ error: 'message required' })

    const taskType = modelRouter.detectTaskType(message)
    const pastContext = memory.buildContext(message)

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      res.write(`data: ${JSON.stringify({ type: 'thinking', taskType })}\n\n`)

      try {
        const result = await safeGenerateAI({
          messages: [
            {
              role: 'system',
              content: `You are DZ Agent V5 — an advanced autonomous AI assistant.
You have capabilities to: search the web, execute code, browse websites, interact with GitHub, manage files.
${pastContext ? `\nRelevant memory:\n${pastContext}` : ''}
Be helpful, accurate, and concise. Use markdown for formatting.`,
            },
            ...history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message },
          ],
          query: message,
          max_tokens: 3000,
        })

        const content = result?.content || 'Unable to respond'
        res.write(`data: ${JSON.stringify({ type: 'response', content })}\n\n`)

        // Store in memory
        memory.storeLongTerm({ type: 'chat', query: message, response: content.slice(0, 500) })
      } catch (err) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`)
      }
      res.write('data: {"type":"done"}\n\n')
      res.end()
    } else {
      try {
        const result = await safeGenerateAI({
          messages: [
            { role: 'system', content: `You are DZ Agent V5 — an advanced autonomous AI. ${pastContext ? `Memory: ${pastContext}` : ''}` },
            ...history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message },
          ],
          query: message,
          max_tokens: 3000,
        })
        res.json({ ok: true, response: result?.content || '', taskType })
      } catch (err) {
        res.status(500).json({ error: err.message })
      }
    }
  })

  // ── SSE stream for task events ─────────────────────────────────────────────
  r.get('/task/:taskId/stream', (req, res) => {
    const { taskId } = req.params
    const task = TASKS.get(taskId)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // Send all buffered events
    if (task) {
      task.events.forEach(evt => {
        res.write(`data: ${JSON.stringify(evt)}\n\n`)
      })
      // If already done, close immediately
      if (task.status === 'done' || task.status === 'failed') {
        res.write('data: {"type":"done"}\n\n')
        res.end()
        return
      }
    }

    // Register as SSE client
    if (!SSE_CLIENTS.has(taskId)) SSE_CLIENTS.set(taskId, [])
    SSE_CLIENTS.get(taskId).push(res)

    req.on('close', () => {
      const clients = SSE_CLIENTS.get(taskId) || []
      SSE_CLIENTS.set(taskId, clients.filter(c => c !== res))
    })
  })

  // ── Get task status & result ───────────────────────────────────────────────
  r.get('/task/:taskId', (req, res) => {
    const task = TASKS.get(req.params.taskId)
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json({
      ok: true,
      taskId: task.taskId,
      goal: task.goal,
      status: task.status,
      plan: task.plan,
      result: task.result,
      reflection: task.reflection,
      error: task.error,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      duration: task.duration,
      eventCount: task.events?.length || 0,
    })
  })

  // ── List tasks ────────────────────────────────────────────────────────────
  r.get('/tasks', (_req, res) => {
    const tasks = [...TASKS.values()]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 50)
      .map(t => ({
        taskId: t.taskId,
        goal: t.goal,
        status: t.status,
        createdAt: t.createdAt,
        duration: t.duration,
        stepCount: t.plan?.steps?.length || 0,
      }))
    res.json({ ok: true, tasks, count: tasks.length })
  })

  // ── Delete task ────────────────────────────────────────────────────────────
  r.delete('/task/:taskId', (req, res) => {
    TASKS.delete(req.params.taskId)
    res.json({ ok: true, deleted: req.params.taskId })
  })

  // ── Memory endpoints ──────────────────────────────────────────────────────
  r.get('/memory', (_req, res) => {
    res.json({
      ok: true,
      stats: memory.stats(),
      recentEpisodes: memory.getRecentEpisodes(10),
      patterns: memory.getPatterns().slice(0, 20),
    })
  })

  r.post('/memory/search', (req, res) => {
    const { query, type = 'all' } = req.body || {}
    const results = {
      longTerm: type === 'all' || type === 'long' ? memory.searchLongTerm(query, 5) : [],
      episodes: type === 'all' || type === 'episodes' ? memory.searchEpisodes(query, 5) : [],
      patterns: type === 'all' || type === 'patterns' ? memory.getPatterns().slice(0, 10) : [],
    }
    res.json({ ok: true, results, query })
  })

  // ── Model router stats ────────────────────────────────────────────────────
  r.get('/models', (_req, res) => {
    res.json({ ok: true, models: modelRouter.stats() })
  })

  // ── Tools list ────────────────────────────────────────────────────────────
  r.get('/tools', (_req, res) => {
    res.json({ ok: true, tools: tools.list() })
  })

  // ── Workspace ─────────────────────────────────────────────────────────────
  r.get('/workspace', (_req, res) => {
    res.json({ ok: true, ...workspace.stats(), recentTasks: workspace.listTasks(20) })
  })

  app.use('/api/dz-v5', r)
  console.log('[DZ-V5] Autonomous Agent mounted: /api/dz-v5/{health,task,chat,tasks,memory,models,tools,workspace}')
}
