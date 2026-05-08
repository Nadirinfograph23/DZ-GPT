/**
 * Design Intelligence — API Routes Mount
 * Mounts all /api/dz-design/* endpoints.
 */

import express from 'express'
import { analyzeWebsite } from './analyzer.js'
import { generateCssVariables, generateTailwindTokens, generateDesignMd, generateReactComponent } from './token-engine.js'
import { buildPage, improveDesign, generateTailwindPage } from './page-builder.js'
import { saveDesign, getDesigns, getDesignByUrl, deleteDesign } from './design-memory.js'

// Simple in-memory analysis cache (URL → result, 30min TTL)
const ANALYSIS_CACHE = new Map()
const CACHE_TTL = 30 * 60 * 1000

function getCached(url) {
  const entry = ANALYSIS_CACHE.get(url)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { ANALYSIS_CACHE.delete(url); return null }
  return entry.data
}
function setCached(url, data) {
  ANALYSIS_CACHE.set(url, { data, ts: Date.now() })
  if (ANALYSIS_CACHE.size > 50) {
    const oldest = [...ANALYSIS_CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) ANALYSIS_CACHE.delete(oldest[0])
  }
}

export function mountDesignIntelligence(app, { safeGenerateAI } = {}) {
  const r = express.Router()
  r.use(express.json({ limit: '2mb' }))

  // ── Health ────────────────────────────────────────────────────────────────
  r.get('/health', (_req, res) => {
    res.json({ ok: true, version: 'v1', features: ['analyze', 'tokens', 'design-md', 'page-builder', 'memory'] })
  })

  // ── Analyze website ───────────────────────────────────────────────────────
  r.post('/analyze', async (req, res) => {
    const { url, force } = req.body || {}
    if (!url?.trim()) return res.status(400).json({ error: 'URL required' })

    let normalized = url.trim()
    if (!/^https?:\/\//.test(normalized)) normalized = 'https://' + normalized

    try {
      if (!force) {
        const cached = getCached(normalized)
        if (cached) return res.json({ ok: true, analysis: cached, cached: true })
      }

      const analysis = await analyzeWebsite(normalized)
      setCached(normalized, analysis)
      saveDesign(analysis)
      res.json({ ok: true, analysis, cached: false })
    } catch (err) {
      console.error('[DZ-Design:analyze]', err.message)
      res.status(500).json({ error: 'Analysis failed: ' + err.message })
    }
  })

  // ── Generate tokens (CSS vars + Tailwind + DESIGN.md) ────────────────────
  r.post('/tokens', async (req, res) => {
    const { url, analysis: providedAnalysis } = req.body || {}
    try {
      let analysis = providedAnalysis
      if (!analysis && url) {
        let normalized = url.trim()
        if (!/^https?:\/\//.test(normalized)) normalized = 'https://' + normalized
        analysis = getCached(normalized) || await analyzeWebsite(normalized)
        setCached(normalized, analysis)
        saveDesign(analysis)
      }
      if (!analysis) return res.status(400).json({ error: 'analysis or url required' })

      res.json({
        ok: true,
        cssVariables: generateCssVariables(analysis),
        tailwindConfig: generateTailwindTokens(analysis),
        designMd: generateDesignMd(analysis),
        reactComponent: generateReactComponent(analysis),
      })
    } catch (err) {
      console.error('[DZ-Design:tokens]', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ── Generate DESIGN.md only ───────────────────────────────────────────────
  r.post('/generate-design-md', async (req, res) => {
    const { analysis } = req.body || {}
    if (!analysis) return res.status(400).json({ error: 'analysis required' })
    res.json({ ok: true, designMd: generateDesignMd(analysis) })
  })

  // ── AI Page builder ───────────────────────────────────────────────────────
  r.post('/generate-page', async (req, res) => {
    if (!safeGenerateAI) return res.status(503).json({ error: 'AI not available' })
    const { prompt, analysis, pageType = 'landing', format = 'react' } = req.body || {}
    try {
      const code = format === 'html'
        ? await generateTailwindPage(safeGenerateAI, { prompt, analysis, pageType })
        : await buildPage(safeGenerateAI, { prompt, analysis, pageType })
      res.json({ ok: true, code, format })
    } catch (err) {
      console.error('[DZ-Design:page-builder]', err.message)
      res.status(500).json({ error: err.message })
    }
  })

  // ── Improve existing design ───────────────────────────────────────────────
  r.post('/improve', async (req, res) => {
    if (!safeGenerateAI) return res.status(503).json({ error: 'AI not available' })
    const { currentCode, feedback } = req.body || {}
    if (!feedback) return res.status(400).json({ error: 'feedback required' })
    try {
      const code = await improveDesign(safeGenerateAI, { currentCode, feedback })
      res.json({ ok: true, code })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  })

  // ── Design memory ─────────────────────────────────────────────────────────
  r.get('/memory', (_req, res) => {
    res.json({ ok: true, designs: getDesigns(30) })
  })

  r.delete('/memory/:id', (req, res) => {
    deleteDesign(req.params.id)
    res.json({ ok: true })
  })

  app.use('/api/dz-design', r)
  console.log('[DZ-Design] mounted: /api/dz-design/{health,analyze,tokens,generate-design-md,generate-page,improve,memory}')
}
