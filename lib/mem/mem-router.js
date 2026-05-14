// lib/mem/mem-router.js
// DZ-Agent-Memory-Layer — Express API routes
// /api/memory/*

import {
  storeMemory,
  searchMemories,
  buildMemoryContext,
  memoryStats,
  clearMemory,
  storeUserPreference,
  storeExecutionResult,
  storeErrorFix,
  storeProjectContext,
  MEM_TYPE,
} from './dz-mem0.js'

export function mountMemoryRouter(app) {
  // ── صحة الخدمة ────────────────────────────────────────────────────────────
  app.get('/api/memory/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'DZ-Agent-Memory-Layer',
      types: Object.values(MEM_TYPE),
      endpoints: [
        'POST /api/memory/store',
        'POST /api/memory/search',
        'GET  /api/memory/stats',
        'POST /api/memory/user-pref',
        'POST /api/memory/execution',
        'POST /api/memory/error-fix',
        'POST /api/memory/project',
        'DELETE /api/memory/clear',
      ],
    })
  })

  // ── حفظ ذكرى ──────────────────────────────────────────────────────────────
  app.post('/api/memory/store', (req, res) => {
    const { type, projectId, query, content, meta } = req.body
    if (!content) return res.status(400).json({ ok: false, error: 'content مطلوب' })
    try {
      const entry = storeMemory({ type, projectId, query, content, meta })
      res.json({ ok: true, entry })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── بحث واسترجاع ──────────────────────────────────────────────────────────
  app.post('/api/memory/search', (req, res) => {
    const { query, projectId, topK = 6, types } = req.body
    if (!query) return res.status(400).json({ ok: false, error: 'query مطلوب' })
    try {
      const memories = searchMemories({ query, projectId, topK, types })
      const context  = buildMemoryContext(memories)
      res.json({ ok: true, memories, context, count: memories.length })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── إحصاءات ───────────────────────────────────────────────────────────────
  app.get('/api/memory/stats', (req, res) => {
    const { projectId } = req.query
    try {
      res.json({ ok: true, stats: memoryStats(projectId) })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── تفضيل مستخدم ──────────────────────────────────────────────────────────
  app.post('/api/memory/user-pref', (req, res) => {
    const { key, value, projectId } = req.body
    if (!key || !value) return res.status(400).json({ ok: false, error: 'key و value مطلوبان' })
    try {
      const entry = storeUserPreference(key, value, projectId)
      res.json({ ok: true, entry })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── نتيجة تنفيذ ───────────────────────────────────────────────────────────
  app.post('/api/memory/execution', (req, res) => {
    const { action, result, files, branch, repo, projectId } = req.body
    if (!action) return res.status(400).json({ ok: false, error: 'action مطلوب' })
    try {
      const entry = storeExecutionResult({ action, result, files, branch, repo, projectId })
      res.json({ ok: true, entry })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── خطأ وحله ──────────────────────────────────────────────────────────────
  app.post('/api/memory/error-fix', (req, res) => {
    const { error, fix, status, repo, projectId } = req.body
    if (!error) return res.status(400).json({ ok: false, error: 'error مطلوب' })
    try {
      const entry = storeErrorFix({ error, fix, status, repo, projectId })
      res.json({ ok: true, entry })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── سياق مشروع ────────────────────────────────────────────────────────────
  app.post('/api/memory/project', (req, res) => {
    const { repo, framework, stack, branch, deployTarget, issues } = req.body
    if (!repo) return res.status(400).json({ ok: false, error: 'repo مطلوب' })
    try {
      const entry = storeProjectContext({ repo, framework, stack, branch, deployTarget, issues })
      res.json({ ok: true, entry })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── مسح ───────────────────────────────────────────────────────────────────
  app.delete('/api/memory/clear', (req, res) => {
    const { projectId } = req.body
    try {
      const result = clearMemory(projectId)
      res.json({ ok: true, result })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  console.log('[mem0] DZ-Agent-Memory-Layer mounted: /api/memory/{health,store,search,stats,user-pref,execution,error-fix,project,clear}')
}
