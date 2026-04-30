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
import { generateImage, getImage, imageStats } from './image.js'
import { buildChartProject, SUPPORTED_CHART_TYPES } from './chart.js'
import { dispatch, classifyIntent } from './dispatcher.js'

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
    res.json({
      ok: true,
      version: 'v4-pro',
      engines: ['code', 'image', 'chart', 'dispatcher'],
      stats: projectStats(),
      images: imageStats(),
      chartTypes: SUPPORTED_CHART_TYPES,
    })
  })

  // ── Smart dispatcher: classify a prompt into code | image | chart ────────
  r.post('/classify', async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim()
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt is required' })
    try {
      const verdict = await dispatch({ aiGenerate, prompt })
      res.json({ ok: true, ...verdict })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  // ── Smart endpoint: classify + execute the right engine in one call ──────
  r.post('/smart', async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim()
    const persist = req.body?.persist !== false
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt is required' })
    try {
      const verdict = await dispatch({ aiGenerate, prompt })

      if (verdict.intent === 'image') {
        const img = await generateImage({ prompt, aiGenerate })
        return res.json({
          ok: true, route: 'image', verdict,
          image: img,
          format: `IMAGE: ${img.url}\nPROMPT USED: ${img.promptUsed}`,
        })
      }

      if (verdict.intent === 'chart') {
        // Without structured data we fall through to code (the LLM can scaffold a chart project)
        if (!req.body?.data && !req.body?.datasets) {
          // Generate a code project that includes a chart scaffold via the code engine
          const result = await runFullGeneration({ aiGenerate, prompt })
          const meta = persist ? saveProject({ id: newProjectId(), plan: result.plan, files: result.files, prompt }) : null
          return res.json({
            ok: result.validation.ok, route: 'chart-via-code', verdict,
            projectId: meta?.id || null,
            plan: result.plan, files: result.files,
            validation: result.validation,
            downloadUrl: meta ? `/api/dz-agent-v4/project/${meta.id}/download` : null,
          })
        }
        const { plan, files } = buildChartProject({
          title: req.body?.title || prompt.slice(0, 80),
          type: req.body?.type,
          labels: req.body?.labels,
          datasets: req.body?.datasets,
          data: req.body?.data,
          options: req.body?.options,
        })
        const meta = persist ? saveProject({ id: newProjectId(), plan, files, prompt }) : null
        return res.json({
          ok: true, route: 'chart', verdict,
          projectId: meta?.id || null,
          plan, files,
          validation: validateProject(plan, files),
          downloadUrl: meta ? `/api/dz-agent-v4/project/${meta.id}/download` : null,
        })
      }

      // Default: code engine
      const result = await runFullGeneration({ aiGenerate, prompt })
      const meta = persist ? saveProject({ id: newProjectId(), plan: result.plan, files: result.files, prompt }) : null
      return res.json({
        ok: result.validation.ok, route: 'code', verdict,
        projectId: meta?.id || null,
        plan: result.plan, files: result.files,
        validation: result.validation,
        durationMs: result.durationMs,
        downloadUrl: meta ? `/api/dz-agent-v4/project/${meta.id}/download` : null,
      })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  // ── Image generation (free HuggingFace SD with SVG fallback) ─────────────
  r.post('/image', async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim()
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt is required' })
    try {
      const img = await generateImage({
        prompt,
        model: req.body?.model,
        negativePrompt: req.body?.negativePrompt,
        aiGenerate,
      })
      res.json({
        ok: true, ...img,
        format: `IMAGE: ${img.url}\nPROMPT USED: ${img.promptUsed}`,
      })
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message })
    }
  })

  r.get('/image/:id', (req, res) => {
    const it = getImage(req.params.id)
    if (!it) return res.status(404).json({ ok: false, error: 'image not found or expired' })
    res.setHeader('content-type', it.mime)
    res.setHeader('cache-control', 'public, max-age=3600')
    res.send(it.bytes)
  })

  // ── Chart generation (Chart.js, deterministic, free) ──────────────────────
  r.post('/chart', async (req, res) => {
    const persist = req.body?.persist !== false
    try {
      const { plan, files } = buildChartProject({
        title: req.body?.title,
        type: req.body?.type,
        labels: req.body?.labels,
        datasets: req.body?.datasets,
        data: req.body?.data,
        options: req.body?.options,
      })
      const validation = validateProject(plan, files)
      let projectId = null
      if (persist) {
        const meta = saveProject({ id: newProjectId(), plan, files, prompt: req.body?.title || 'chart' })
        projectId = meta.id
      }
      res.json({
        ok: validation.ok,
        projectId,
        plan, files, validation,
        downloadUrl: projectId ? `/api/dz-agent-v4/project/${projectId}/download` : null,
        previewHint: 'Open /project/index.html (after extracting the zip) in a browser.',
      })
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message })
    }
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
  console.log('[dz-agent-v4] mounted: /api/dz-agent-v4/{health,plan,generate,modify,smart,classify,image,chart,projects,project/:id/...}')
}

export default mountDzAgentV4
