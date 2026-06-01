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
import { generateImage, imageToImage, getImage, imageStats, getImageModels, checkImageQuota, POLLINATIONS_MODELS } from './image.js'
import { textToVideo, imageToVideo, getVideo, videoStats, checkVideoQuota, T2V_MODELS, I2V_MODELS } from './video.js'
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
      engines: ['code', 'image', 'chart', 'map', 'dispatcher'],
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

      if (verdict.intent === 'video') {
        const vid = await textToVideo({ prompt })
        return res.json({ ok: vid.ok, route: 'video', verdict, video: vid,
          format: vid.ok ? `VIDEO: ${vid.url}\nPROMPT: ${prompt}` : `⚠️ ${vid.error}` })
      }

      if (verdict.intent === 'img2img') {
        const imageUrl = String(req.body?.imageUrl || req.body?.image_url || '').trim()
        if (!imageUrl) {
          return res.json({ ok: false, route: 'img2img', verdict,
            error: 'img2img يحتاج إرسال imageUrl مع الطلب. استخدم /api/dz-agent-v4/img2img مباشرة.' })
        }
        const result = await imageToImage({ prompt, imageUrl, aiGenerate })
        return res.json({ ok: result.ok, route: 'img2img', verdict, image: result,
          format: result.ok ? `IMAGE: ${result.url}\nPROMPT USED: ${result.promptUsed}` : undefined })
      }

      if (verdict.intent === 'img2video') {
        const imageUrl = String(req.body?.imageUrl || req.body?.image_url || '').trim()
        if (!imageUrl) {
          return res.json({ ok: false, route: 'img2video', verdict,
            error: 'img2video يحتاج imageUrl. استخدم /api/dz-agent-v4/img2video مباشرة.' })
        }
        const vid = await imageToVideo({ imageUrl, prompt })
        return res.json({ ok: vid.ok, route: 'img2video', verdict, video: vid,
          format: vid.ok ? `VIDEO: ${vid.url}\nSOURCE IMAGE: ${imageUrl}` : `⚠️ ${vid.error}` })
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

  // ── Image quota ────────────────────────────────────────────────────────────
  r.get('/image/quota', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'anonymous'
    res.json({ ok: true, quota: checkImageQuota(ip) })
  })

  // ── All image models list ──────────────────────────────────────────────────
  r.get('/image/models', (_req, res) => {
    res.json({ ok: true, models: getImageModels() })
  })

  // ── Image generation ───────────────────────────────────────────────────────
  r.post('/image', async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim()
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt is required' })
    const ip = req.ip || req.socket?.remoteAddress || 'anonymous'
    try {
      const img = await generateImage({
        prompt,
        model:          req.body?.model,
        negativePrompt: req.body?.negativePrompt,
        width:          parseInt(req.body?.width)  || undefined,
        height:         parseInt(req.body?.height) || undefined,
        aiGenerate,
        ip,
      })
      if (!img.ok) return res.status(img.quotaExceeded ? 429 : 502).json(img)
      res.json({ ok: true, ...img, format: `IMAGE: ${img.url}\nPROMPT USED: ${img.promptUsed}` })
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

  // ── Image-to-Image (img2img) ───────────────────────────────────────────────
  r.post('/img2img', async (req, res) => {
    const prompt   = String(req.body?.prompt || '').trim()
    const imageUrl = String(req.body?.imageUrl || req.body?.image_url || '').trim()
    const imgB64   = req.body?.imageBase64 || req.body?.image_base64 || null
    const strength = parseFloat(req.body?.strength) || 0.75
    const ip       = req.ip || req.socket?.remoteAddress || 'anonymous'
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt مطلوب' })
    if (!imageUrl && !imgB64) return res.status(400).json({ ok: false, error: 'imageUrl أو imageBase64 مطلوب' })
    try {
      const result = await imageToImage({ prompt, imageUrl, imageBase64: imgB64, strength, aiGenerate, ip })
      res.json({ ok: result.ok, ...result,
        format: result.ok ? `IMAGE: ${result.url}\nPROMPT USED: ${result.promptUsed}` : undefined })
    } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  // ── Video quota check ────────────────────────────────────────────────────
  r.get('/video/quota', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'anonymous'
    res.json({ ok: true, quota: checkVideoQuota(ip) })
  })

  // ── Text-to-Video ──────────────────────────────────────────────────────────
  r.post('/video', async (req, res) => {
    const prompt   = String(req.body?.prompt || '').trim()
    const width    = parseInt(req.body?.width)  || 480
    const height   = parseInt(req.body?.height) || 480
    const duration = parseFloat(req.body?.duration) || 3
    const ip       = req.ip || req.socket?.remoteAddress || 'anonymous'
    if (!prompt) return res.status(400).json({ ok: false, error: 'prompt مطلوب' })
    try {
      const result = await textToVideo({ prompt, width, height, duration, ip })
      res.json(result)
    } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  // ── Image-to-Video ──────────────────────────────────────────────────────────
  r.post('/img2video', async (req, res) => {
    const imageUrl = String(req.body?.imageUrl || req.body?.image_url || '').trim()
    const prompt   = String(req.body?.prompt   || 'animate this smoothly').trim()
    const model    = req.body?.model || null
    const ip       = req.ip || req.socket?.remoteAddress || 'anonymous'
    if (!imageUrl) return res.status(400).json({ ok: false, error: 'imageUrl مطلوب' })
    try {
      const result = await imageToVideo({ imageUrl, prompt, ip, model })
      res.json(result)
    } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
  })

  // ── Video: قائمة النماذج ─────────────────────────────────────────────────
  // يجب أن يكون قبل /video/:id لأن "models" ستُؤخذ كـ id بدون ذلك
  r.get('/video/models', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'anonymous'
    const quota = checkVideoQuota(ip)
    const hasToken  = !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY)
    const hasLTX    = !!(process.env.LTX_API_KEY || process.env.LTX_KEY)
    const hasFal    = !!(process.env.FAL_KEY || process.env.FAL_API_KEY)
    res.json({ ok: true, hasToken, hasLTX, hasFal, quota, t2v: T2V_MODELS, i2v: I2V_MODELS })
  })

  // ── Video: حصة المستخدم اليومية ─────────────────────────────────────────
  r.get('/video/quota', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'anonymous'
    res.json({ ok: true, quota: checkVideoQuota(ip) })
  })

  // ── Video serve ─────────────────────────────────────────────────────────────
  r.get('/video/:id', (req, res) => {
    const it = getVideo(req.params.id)
    if (!it) return res.status(404).json({ ok: false, error: 'video not found or expired' })
    res.setHeader('content-type', it.mime || 'video/mp4')
    res.setHeader('cache-control', 'public, max-age=7200')
    res.setHeader('accept-ranges', 'bytes')
    res.send(it.bytes)
  })

  // ── Media stats (images + videos) ──────────────────────────────────────────
  r.get('/media/stats', (_req, res) => {
    res.json({ ok: true, images: imageStats(), videos: videoStats() })
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
  console.log('[dz-agent-v4] mounted: /api/dz-agent-v4/{health,plan,generate,modify,smart,classify,image,img2img,video,img2video,chart,media/stats,projects,project/:id/...}')
}

export default mountDzAgentV4
