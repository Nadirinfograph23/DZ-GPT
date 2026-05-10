/**
 * clone-engine/mount.js
 * Mounts the upgraded clone engine routes.
 * - POST /api/dz-agent/clone-v2        → standard JSON response
 * - POST /api/dz-agent/clone-v2/stream → SSE real-time progress
 *
 * The old /api/dz-agent/clone-advanced endpoint remains untouched.
 */

import { runClonePipeline } from './pipeline.js'
import { extractCssFromHtml, extractJsFromHtml } from '../web-generator/generator.js'

/**
 * @param {import('express').Application} app
 * @param {Function} aiGenerate - safeGenerateAI reference
 */
export function mountCloneEngineV2(app, aiGenerate) {

  // ── Standard endpoint (JSON) ─────────────────────────────────────────────
  app.post('/api/dz-agent/clone-v2', async (req, res) => {
    const { url, section } = req.body
    if (!url) return res.status(400).json({ error: 'URL required' })

    let targetUrl = url.trim()
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl

    console.log(`[CloneEngineV2] clone-v2 requested: ${targetUrl} | section=${section || 'full'}`)

    try {
      const result = await runClonePipeline({
        url: targetUrl,
        section: section || 'full',
        aiGenerate: (messages, max_tokens) => aiGenerate({ messages, max_tokens }),
      })

      if (!result.ok) {
        return res.status(200).json({ ok: false, error: result.error, tokens: result.tokens || null })
      }

      const { htmlCode, tokens, score, issues, strategy, imageCount } = result
      const cssCode = extractCssFromHtml(htmlCode)
      const jsCode  = extractJsFromHtml(htmlCode)
      const sectionLabel = result.section !== 'full' ? ` — قسم: ${result.section}` : ''

      return res.status(200).json({
        ok: true,
        isWebsite: true,
        htmlCode,
        cssCode: cssCode || '',
        jsCode:  jsCode  || '',
        tokens,
        score,
        issues,
        fetchStrategy: strategy,
        content: buildSuccessMessage(tokens, sectionLabel, score, strategy, imageCount || 0, result.copyright || ''),
        webBuilderMeta: {
          type: tokens.layoutType,
          style: tokens.colorScheme === 'dark' ? 'dark' : 'premium',
          title: `🧬 ${tokens.title || tokens.domain}${sectionLabel}`,
          description: `استنساخ V3 متقدم لـ ${tokens.domain}`,
          icon: '🧬',
        },
        webReaderIntent: 'build',
      })
    } catch (err) {
      console.error('[CloneEngineV3] clone-v2 error:', err.message)
      return res.status(500).json({ ok: false, error: 'خطأ داخلي في محرك الاستنساخ V3.' })
    }
  })

  // ── SSE streaming endpoint (real-time progress) ──────────────────────────
  app.post('/api/dz-agent/clone-v2/stream', async (req, res) => {
    const { url, section } = req.body
    if (!url) {
      res.status(400).json({ error: 'URL required' })
      return
    }

    let targetUrl = url.trim()
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    try {
      const result = await runClonePipeline({
        url: targetUrl,
        section: section || 'full',
        aiGenerate: (messages, max_tokens) => aiGenerate({ messages, max_tokens }),
        onProgress: (progress) => {
          send('progress', progress)
        },
      })

      if (!result.ok) {
        send('error', { error: result.error })
        res.end()
        return
      }

      const { htmlCode, tokens, score, issues, strategy, imageCount } = result
      const cssCode = extractCssFromHtml(htmlCode)
      const jsCode  = extractJsFromHtml(htmlCode)
      const sectionLabel = result.section !== 'full' ? ` — قسم: ${result.section}` : ''

      send('result', {
        ok: true,
        isWebsite: true,
        htmlCode,
        cssCode: cssCode || '',
        jsCode:  jsCode  || '',
        tokens,
        score,
        issues,
        fetchStrategy: strategy,
        content: buildSuccessMessage(tokens, sectionLabel, score, strategy, imageCount || 0, result.copyright || ''),
        webBuilderMeta: {
          type: tokens.layoutType,
          style: tokens.colorScheme === 'dark' ? 'dark' : 'premium',
          title: `🧬 ${tokens.title || tokens.domain}${sectionLabel}`,
          description: `استنساخ V3 متقدم لـ ${tokens.domain}`,
          icon: '🧬',
        },
        webReaderIntent: 'build',
      })
    } catch (err) {
      console.error('[CloneEngineV3:SSE] error:', err.message)
      send('error', { error: 'خطأ داخلي في محرك الاستنساخ V3.' })
    } finally {
      res.end()
    }
  })

  console.log('[CloneEngineV2] mounted: /api/dz-agent/clone-v2, /api/dz-agent/clone-v2/stream')
}

function buildSuccessMessage(tokens, sectionLabel, score, strategy, imageCount, copyright) {
  const techBadge = tokens.techStack?.length > 0
    ? `\n🔬 **Stack:** ${tokens.techStack.slice(0, 5).join(' · ')}`
    : ''
  const scoreBadge = score >= 85 ? '🟢' : score >= 65 ? '🟡' : '🟠'
  const imgBadge = imageCount > 0 ? ` · **${imageCount}** صورة` : ''
  const shadowBadge = tokens.shadowTokens?.length > 0 ? ` · **${tokens.shadowTokens.length}** ظل` : ''
  const yearsNote = tokens.keyNumbers?.years?.length
    ? `\n📅 السنوات المحفوظة: ${tokens.keyNumbers.years.join(', ')}`
    : ''
  const copyrightNote = copyright
    ? `\n©️ حقوق الملكية: "${copyright.slice(0, 60)}"`
    : ''
  return `🧬 **استنساخ V3${sectionLabel} — ${tokens.title || tokens.domain}**

${scoreBadge} دقة مرئية: **${score}%** | جلب عبر: \`${strategy}\`
✅ **${tokens.colors.length}** لون · **${tokens.fonts.length}** خط · **${tokens.sections.length}** قسم${imgBadge}${shadowBadge}
🎨 النظام: **${tokens.colorScheme === 'dark' ? 'داكن' : 'فاتح'}** | النوع: **${tokens.layoutType}**${techBadge}${yearsNote}${copyrightNote}
🖼️ Placeholders ملوّنة ✓ | الأزرار: محفوظة ✓ | الاستجابة: متعددة الشاشات ✓ | CSS: كامل ✓

▶️ انقر **"معاينة مباشرة"** للمشاهدة أو **⬇ تحميل** للحفظ.`
}
