/**
 * clone-engine/mount.js — V2
 * Mounts clone engine routes:
 *  POST /api/dz-agent/clone-v2               → AI clone (JSON)
 *  POST /api/dz-agent/clone-v2/stream        → AI clone (SSE real-time)
 *  POST /api/dz-agent/clone-v2/download-full → Full asset download (self-contained HTML + ZIP)
 *  GET  /api/dz-agent/clone-v2/zip/:id       → Download ZIP by session ID
 *
 * V2 Downloader (inspired by AhmadIbrahiim/Website-Downloader):
 *  - Downloads ALL real assets: CSS, JS, images, fonts
 *  - Inlines everything into a single self-contained offline HTML
 *  - ZIP archive with mirrored file structure (like wget -mkEpnp)
 */

import { runClonePipeline } from './pipeline.js'
import { downloadWebsite, extractAssetUrls, buildZipArchive } from './downloader.js'
import { fetchHtmlMultiStrategy } from './fetcher.js'
import { extractCssFromHtml, extractJsFromHtml } from '../web-generator/generator.js'

// In-memory ZIP cache (sessionId → { buffer, domain, createdAt })
const _zipCache = new Map()
const ZIP_TTL_MS = 30 * 60 * 1000 // 30 minutes

function cacheZip(id, buffer, domain) {
  _zipCache.set(id, { buffer, domain, createdAt: Date.now() })
  // Purge stale entries
  for (const [k, v] of _zipCache) {
    if (Date.now() - v.createdAt > ZIP_TTL_MS) _zipCache.delete(k)
  }
}

/**
 * @param {import('express').Application} app
 * @param {Function} aiGenerate - safeGenerateAI reference
 */
export function mountCloneEngineV2(app, aiGenerate) {

  // ── Standard AI clone endpoint (JSON) ────────────────────────────────────
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

      const { htmlCode, tokens, score, issues, strategy, imageCount, download } = result
      const cssCode = extractCssFromHtml(htmlCode)
      const jsCode  = extractJsFromHtml(htmlCode)
      const sectionLabel = result.section !== 'full' ? ` — قسم: ${result.section}` : ''

      // Cache ZIP if available
      let zipSessionId = null
      if (download?.zipBuffer) {
        zipSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        cacheZip(zipSessionId, download.zipBuffer, tokens.domain)
      }

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
        content: buildSuccessMessage(tokens, sectionLabel, score, strategy, imageCount || 0, result.copyright || '', download),
        webBuilderMeta: {
          type: tokens.layoutType,
          style: tokens.colorScheme === 'dark' ? 'dark' : 'premium',
          title: `🧬 ${tokens.title || tokens.domain}${sectionLabel}`,
          description: `استنساخ V3+V2 متقدم لـ ${tokens.domain}`,
          icon: '🧬',
        },
        webReaderIntent: 'build',
        // V2 Downloader metadata
        download: download ? {
          stats: download.stats,
          assetUrls: download.assetUrls,
          zipSessionId,
          zipDownloadUrl: zipSessionId ? `/api/dz-agent/clone-v2/zip/${zipSessionId}` : null,
          selfContainedSize: download.selfContainedHtml?.length || 0,
        } : null,
      })
    } catch (err) {
      console.error('[CloneEngineV2] clone-v2 error:', err.message)
      return res.status(500).json({ ok: false, error: 'خطأ داخلي في محرك الاستنساخ.' })
    }
  })

  // ── SSE streaming endpoint (real-time progress) ──────────────────────────
  app.post('/api/dz-agent/clone-v2/stream', async (req, res) => {
    const { url, section } = req.body
    if (!url) { res.status(400).json({ error: 'URL required' }); return }

    let targetUrl = url.trim()
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)

    try {
      const result = await runClonePipeline({
        url: targetUrl,
        section: section || 'full',
        aiGenerate: (messages, max_tokens) => aiGenerate({ messages, max_tokens }),
        onProgress: (p) => send('progress', p),
      })

      if (!result.ok) { send('error', { error: result.error }); res.end(); return }

      const { htmlCode, tokens, score, issues, strategy, imageCount, download } = result
      const cssCode = extractCssFromHtml(htmlCode)
      const jsCode  = extractJsFromHtml(htmlCode)
      const sectionLabel = result.section !== 'full' ? ` — قسم: ${result.section}` : ''

      let zipSessionId = null
      if (download?.zipBuffer) {
        zipSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        cacheZip(zipSessionId, download.zipBuffer, tokens.domain)
      }

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
        content: buildSuccessMessage(tokens, sectionLabel, score, strategy, imageCount || 0, result.copyright || '', download),
        webBuilderMeta: {
          type: tokens.layoutType,
          style: tokens.colorScheme === 'dark' ? 'dark' : 'premium',
          title: `🧬 ${tokens.title || tokens.domain}${sectionLabel}`,
          description: `استنساخ V3+V2 متقدم لـ ${tokens.domain}`,
          icon: '🧬',
        },
        webReaderIntent: 'build',
        download: download ? {
          stats: download.stats,
          assetUrls: download.assetUrls,
          zipSessionId,
          zipDownloadUrl: zipSessionId ? `/api/dz-agent/clone-v2/zip/${zipSessionId}` : null,
        } : null,
      })
    } catch (err) {
      console.error('[CloneEngineV2:SSE] error:', err.message)
      send('error', { error: 'خطأ داخلي في محرك الاستنساخ.' })
    } finally {
      res.end()
    }
  })

  // ── Full asset download endpoint (self-contained HTML + ZIP) ─────────────
  // Equivalent to: wget -mkEpnp --convert-links --adjust-extension --page-requisites
  // Inspired by: https://github.com/AhmadIbrahiim/Website-Downloader
  app.post('/api/dz-agent/clone-v2/download-full', async (req, res) => {
    const { url, format = 'json' } = req.body
    if (!url) return res.status(400).json({ error: 'URL required' })

    let targetUrl = url.trim()
    if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl

    console.log(`[CloneV2:DownloadFull] ${targetUrl} format=${format}`)

    try {
      // Step 1: Fetch raw HTML
      const { html: rawHtml, strategy, error: fetchErr } = await fetchHtmlMultiStrategy(targetUrl)
      if (!rawHtml || rawHtml.length < 100) {
        return res.status(200).json({ ok: false, error: `فشل جلب الموقع: ${fetchErr || 'empty'}` })
      }

      // Step 2: Download all assets + build self-contained HTML + ZIP
      // This endpoint is the explicit "full download" path — enable ZIP + full asset fetch
      const progressLog = []
      const result = await downloadWebsite(targetUrl, rawHtml, (p) => {
        progressLog.push(p)
        console.log(`[CloneV2:DownloadFull] ${p.stage} (${p.pct}%): ${p.message}`)
      }, { indexOnly: false, buildZip: true })

      // Cache ZIP
      let zipSessionId = null
      if (result.zipBuffer) {
        zipSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        let domain = 'site'
        try { domain = new URL(targetUrl).hostname } catch {}
        cacheZip(zipSessionId, result.zipBuffer, domain)
      }

      // If format=zip, redirect to download immediately
      if (format === 'zip' && zipSessionId) {
        return res.redirect(`/api/dz-agent/clone-v2/zip/${zipSessionId}`)
      }

      return res.status(200).json({
        ok: true,
        isWebsite: true,
        htmlCode: result.selfContainedHtml,
        cssCode: '',
        jsCode: '',
        fetchStrategy: strategy,
        stats: result.stats,
        assetUrls: {
          cssCount: result.assetUrls?.css?.length || 0,
          jsCount:  result.assetUrls?.js?.length  || 0,
          imgCount: result.assetUrls?.images?.length || 0,
        },
        zipSessionId,
        zipDownloadUrl: zipSessionId ? `/api/dz-agent/clone-v2/zip/${zipSessionId}` : null,
        content: buildDownloadMessage(targetUrl, result.stats, zipSessionId),
        webBuilderMeta: {
          type: 'clone',
          style: 'real-assets',
          title: `⬇️ تحميل كامل — ${new URL(targetUrl).hostname}`,
          description: `نسخة كاملة مع كل الأصول الحقيقية`,
          icon: '⬇️',
        },
      })
    } catch (err) {
      console.error('[CloneV2:DownloadFull] error:', err.message)
      return res.status(500).json({ ok: false, error: `خطأ: ${err.message}` })
    }
  })

  // ── ZIP download by session ID ────────────────────────────────────────────
  app.get('/api/dz-agent/clone-v2/zip/:id', (req, res) => {
    const entry = _zipCache.get(req.params.id)
    if (!entry) {
      return res.status(404).json({ error: 'ZIP not found or expired (TTL: 30 min)' })
    }
    const filename = `${entry.domain || 'site'}-clone-dz-agent.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', entry.buffer.length)
    res.send(entry.buffer)
    console.log(`[CloneV2:ZIP] Served ${filename} (${(entry.buffer.length / 1024).toFixed(0)} KB)`)
  })

  console.log('[CloneEngineV2] mounted: clone-v2 | clone-v2/stream | clone-v2/download-full | clone-v2/zip/:id')
}

// ── Message builders ──────────────────────────────────────────────────────────

function buildSuccessMessage(tokens, sectionLabel, score, strategy, imageCount, copyright, download) {
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

  let dlNote = ''
  if (download?.stats) {
    const s = download.stats
    dlNote = `\n📦 **V2 Downloader:** ${s.cssCount} CSS · ${s.jsCount} JS · ${s.imageCount} صورة مُدمَجة`
    if (download.assetUrls) {
      dlNote += ` | اكتُشف ${download.assetUrls.cssCount} CSS · ${download.assetUrls.jsCount} JS · ${download.assetUrls.imgCount} صورة`
    }
  }

  return `🧬 **استنساخ V3+V2${sectionLabel} — ${tokens.title || tokens.domain}**

${scoreBadge} دقة مرئية: **${score}%** | جلب عبر: \`${strategy}\`
✅ **${tokens.colors.length}** لون · **${tokens.fonts.length}** خط · **${tokens.sections.length}** قسم${imgBadge}${shadowBadge}
🎨 النظام: **${tokens.colorScheme === 'dark' ? 'داكن' : 'فاتح'}** | النوع: **${tokens.layoutType}**${techBadge}${yearsNote}${copyrightNote}${dlNote}
🖼️ Placeholders ملوّنة ✓ | الأزرار: محفوظة ✓ | الاستجابة: متعددة الشاشات ✓ | CSS الحقيقي: مُحقَن ✓

▶️ انقر **"معاينة مباشرة"** للمشاهدة أو **⬇ تحميل** للحفظ.`
}

function buildDownloadMessage(url, stats, zipSessionId) {
  let domain = url
  try { domain = new URL(url).hostname } catch {}
  return `⬇️ **تحميل كامل للموقع — ${domain}**

📦 **أصول جُلبت:**
- 🎨 CSS: ${stats.cssCount} ملف
- ⚙️ JS: ${stats.jsCount} ملف
- 🖼️ صور: ${stats.imageCount} صورة (مُحوَّلة إلى base64)
- ❌ فشل: ${stats.failedCount} ملف

💾 **HTML ذاتي الاكتفاء:** ${(stats.selfContainedSize / 1024).toFixed(0)} KB (يعمل 100% بدون إنترنت)
${stats.zipSize ? `🗜️ **ZIP:** ${(stats.zipSize / 1024).toFixed(0)} KB` : ''}
${zipSessionId ? `\n🔗 **تحميل ZIP:** \`/api/dz-agent/clone-v2/zip/${zipSessionId}\`` : ''}

مثل \`wget -mkEpnp --convert-links\` — كل الأصول الحقيقية ✓`
}
