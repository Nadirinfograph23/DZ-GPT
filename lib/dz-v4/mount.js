// DZ Agent V4 PRO — Express mount.
// Additive endpoints under /api/dz-agent-v4/* — never modifies V1/V2/V3 code.
// All endpoints respond as JSON (or zip for download), and never throw to
// the user: errors are wrapped into { ok: false, error } payloads.

import express from 'express'
import {
  runFullGeneration,
  planProject,
  generateFiles,
  modifyFile,
  detectLanguage,
} from './generator.js'
import {
  saveProject,
  getProject,
  getProjectFiles,
  getProjectFile,
  updateProjectFile,
  listProjects,
  deleteProject,
  projectStats,
  newProjectId,
} from './project-store.js'
import { validateProject } from './validator.js'
import { createZip } from '../dz-v3/webapp-generator.js'

export function mountDzAgentV4(app, { aiGenerate } = {}) {
  if (!app || typeof app.use !== 'function') {
    throw new Error('mountDzAgentV4: express app is required')
  }
  if (typeof aiGenerate !== 'function') {
    throw new Error('mountDzAgentV4: aiGenerate function is required')
  }

  const r = express.Router()
  r.use(express.json({ limit: '2mb' }))

  // ── Health ────────────────────────────────────────────────────────────────
  r.get('/health', (_req, res) => {
    res.json({ ok: true, version: 'v4-pro', stats: projectStats() })
  })

  // ── Plan only (preview the structure before generating) ───────────────────
  r.post('/plan', async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim()
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt is required' })
    try {
      const plan = await planProject({ aiGenerate, prompt })
      res.json({ ok: true, plan })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  // ── Full generation: plan → files → validate → persist ───────────────────
  r.post('/generate', async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim()
    const persist = req.body?.persist !== false
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt is required' })
    try {
      const result = await runFullGeneration({ aiGenerate, prompt })
      let projectId = null
      if (persist) {
        const meta = saveProject({
          id: newProjectId(),
          plan: result.plan,
          files: result.files,
          prompt,
        })
        projectId = meta.id
      }
      res.json({
        ok: result.validation.ok,
        projectId,
        plan: result.plan,
        files: result.files,
        validation: result.validation,
        durationMs: result.durationMs,
        downloadUrl: projectId ? `/api/dz-agent-v4/project/${projectId}/download` : null,
      })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  // ── Modify a single file in an existing project ───────────────────────────
  r.post('/modify', async (req, res) => {
    const projectId = String(req.body?.projectId || '')
    const filePath = String(req.body?.path || '')
    const instruction = String(req.body?.instruction || '').trim()
    if (!projectId || !filePath || !instruction) {
      return res.status(400).json({ ok: false, error: 'projectId, path and instruction are required' })
    }
    const meta = getProject(projectId)
    if (!meta) return res.status(404).json({ ok: false, error: 'project not found' })
    const file = getProjectFile(projectId, filePath)
    if (!file) return res.status(404).json({ ok: false, error: 'file not found' })
    try {
      const updated = await modifyFile({
        aiGenerate,
        currentFile: file,
        instruction,
        language: detectLanguage(instruction),
      })
      if (!updated) return res.status(502).json({ ok: false, error: 'modifier returned no content' })
      const newMeta = updateProjectFile(projectId, updated)
      res.json({ ok: true, project: newMeta, file: updated })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  // ── Project introspection ─────────────────────────────────────────────────
  r.get('/projects', (_req, res) => {
    res.json({ ok: true, projects: listProjects(50), stats: projectStats() })
  })

  r.get('/project/:id', (req, res) => {
    const meta = getProject(req.params.id)
    if (!meta) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, project: meta })
  })

  r.get('/project/:id/files', (req, res) => {
    const files = getProjectFiles(req.params.id)
    if (!files) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, files })
  })

  r.get('/project/:id/file', (req, res) => {
    const filePath = String(req.query?.path || '')
    if (!filePath) return res.status(400).json({ ok: false, error: 'path required' })
    const file = getProjectFile(req.params.id, filePath)
    if (!file) return res.status(404).json({ ok: false, error: 'file not found' })
    res.json({ ok: true, file })
  })

  r.get('/project/:id/validate', (req, res) => {
    const meta = getProject(req.params.id)
    const files = getProjectFiles(req.params.id)
    if (!meta || !files) return res.status(404).json({ ok: false, error: 'not found' })
    res.json({ ok: true, validation: validateProject(meta, files) })
  })

  r.get('/project/:id/download', (req, res) => {
    const meta = getProject(req.params.id)
    const files = getProjectFiles(req.params.id)
    if (!meta || !files) return res.status(404).json({ ok: false, error: 'not found' })
    const map = {}
    for (const f of files) {
      const rel = f.path.replace(/^\/project\/?/, '')
      map[rel] = f.content
    }
    const zip = createZip(map)
    res.setHeader('content-type', 'application/zip')
    res.setHeader('content-disposition', `attachment; filename="${meta.id}.zip"`)
    res.send(zip)
  })

  r.delete('/project/:id', (req, res) => {
    const ok = deleteProject(req.params.id)
    res.json({ ok })
  })

  app.use('/api/dz-agent-v4', r)
  console.log('[dz-agent-v4] mounted: /api/dz-agent-v4/{health,plan,generate,modify,projects,project/:id/...}')
}

export default mountDzAgentV4
