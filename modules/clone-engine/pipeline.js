/**
 * clone-engine/pipeline.js  — V3
 * Main multi-stage cloning pipeline.
 * Stage 1: Multi-strategy fetch (7 strategies) + parallel Jina
 * Stage 2: Deep extraction V3 (footer, copyright, all text, keyframes, body snapshot)
 * Stage 3: AI reconstruction with full asset context (max 14000 tokens)
 * Stage 4: Post-processing (year/date preservation, asset URL rewriting)
 * Stage 5: Validation + auto-repair (score threshold 60)
 * Stage 6: Final copyright/year enforcement pass
 */

import { fetchHtmlMultiStrategy } from './fetcher.js'
import { deepExtract } from './extractor.js'
import { buildCloneSystemPrompt, buildIndexOnlySystemPrompt, buildCloneUserPrompt, buildRepairPrompt } from './prompter.js'
import { rewriteAssetsToAbsolute } from './asset-handler.js'

// ── Validation helpers ───────────────────────────────────────────────────────

function scoreClone(html, tokens) {
  if (!html || html.length < 500) return 0
  let score = 0
  if (/<html/i.test(html)) score += 8
  if (/<\/html>/i.test(html)) score += 8
  if (/<style[\s>]/i.test(html)) score += 10
  if (/<body[\s>]/i.test(html)) score += 5
  if (html.length > 5000)  score += 8
  if (html.length > 12000) score += 8
  if (html.length > 20000) score += 6

  // Color accuracy — how many extracted colors appear in output
  const usedColors = tokens.colors?.filter(c => html.includes(c)) || []
  score += Math.min(18, usedColors.length * 2)

  // Section coverage
  const sectionHits = (tokens.sections || []).filter(s =>
    html.toLowerCase().includes(s.replace('-', '')) ||
    html.toLowerCase().includes(s.split('-')[0])
  )
  score += Math.min(18, sectionHits.length * 3)

  // Real images present (V4 — reward actual <img> tags, not placeholders)
  const realImgCount = (html.match(/<img\s[^>]*src=["']https?:\/\//gi) || []).length
  if (realImgCount >= 4) score += 8
  else if (realImgCount >= 2) score += 4
  else if (realImgCount >= 1) score += 2

  // Animation presence
  if (/@keyframes/i.test(html)) score += 4
  if (/transition/i.test(html)) score += 3

  // Responsiveness
  if (/@media/i.test(html)) score += 6

  // Copyright/footer preserved
  if (tokens.footerContent?.copyright && html.includes(tokens.footerContent.copyright.slice(0, 20))) score += 5

  // Font CDN loaded
  if (tokens.fonts?.length > 0 && /fonts\.googleapis\.com/i.test(html)) score += 5

  return Math.min(100, score)
}

function detectIssues(html, tokens) {
  const issues = []
  if (!html || html.length < 500) { issues.push('output too short'); return issues }
  if (!/<style[\s>]/i.test(html)) issues.push('missing CSS styles')
  if (!/@media/i.test(html)) issues.push('not responsive — no media queries')
  if (html.length < 5000) issues.push('very minimal output — needs more detail')
  if ((tokens.sections || []).length > 3) {
    const missedSections = (tokens.sections || []).filter(s =>
      !html.toLowerCase().includes(s.replace('-', '')) &&
      !html.toLowerCase().includes(s.split('-')[0])
    )
    if (missedSections.length > 2) issues.push(`missing sections: ${missedSections.join(', ')}`)
  }
  if (tokens.colorScheme === 'dark' && !/background(?:-color)?\s*:\s*#(?:0|1|2)[0-9a-f]/i.test(html)) {
    issues.push('dark theme not applied correctly')
  }
  if (tokens.fonts?.length > 0 && !/fonts\.googleapis\.com/i.test(html)) {
    issues.push(`fonts not loaded from CDN: ${tokens.fonts.slice(0,2).join(', ')}`)
  }
  if (tokens.footerContent?.copyright && !html.includes(tokens.footerContent.copyright.slice(0, 15))) {
    issues.push(`copyright text not preserved: "${tokens.footerContent.copyright.slice(0, 40)}"`)
  }
  return issues
}

// ── V4: Post-processing — inject dynamic copyright year ───────────────────────
// The footer copyright always shows the CURRENT year via JS (new Date().getFullYear()).
// We ensure the cr-yr span + JS is present in the output.
function enforceVerbatimContent(html, tokens) {
  if (!html) return html

  // If the AI already used the dynamic cr-yr pattern, nothing to do
  if (html.includes('cr-yr') || html.includes('cr-year')) return html

  // Inject dynamic year script if a footer copyright section exists
  const hasFooter = /<footer[\s>]/i.test(html)
  if (!hasFooter) return html

  // Replace hardcoded years in footer copyright context with dynamic span
  let result = html
  const currentYear = new Date().getFullYear().toString()

  // Replace hardcoded year in footer © contexts
  result = result.replace(
    /(©|&copy;)\s*(19|20)\d{2}/gi,
    (match) => {
      const symbol = match.match(/©|&copy;/i)[0]
      return `${symbol} <span id="cr-yr">${currentYear}</span>`
    }
  )

  // Inject the JS to update cr-yr span (before </script> or before </body>)
  const crYrJs = `\n  // Dynamic copyright year\n  const _crYr = document.getElementById('cr-yr'); if (_crYr) _crYr.textContent = new Date().getFullYear();`
  if (result.includes('</script>')) {
    result = result.replace('</script>', crYrJs + '\n</script>')
  } else {
    result = result.replace('</body>', `<script>${crYrJs}\n</script>\n</body>`)
  }

  return result
}

/**
 * Run the V3 cloning pipeline.
 * Always runs in INDEX-ONLY mode (homepage only, slim prompt).
 */
export async function runClonePipeline({ url, section = 'full', aiGenerate, onProgress }) {
  const progress = onProgress || (() => {})

  // ─── Stage 1: Fetch — parallel race (3 strategies at once, fastest wins) ──
  progress({ stage: 'fetch', message: `🌐 جارٍ جلب الصفحة الرئيسية (3 استراتيجيات متوازية)...`, pct: 8 })
  const { html: rawHtml, strategy, error: fetchError } = await fetchHtmlMultiStrategy(url)

  if (!rawHtml || rawHtml.length < 100) {
    return {
      ok: false,
      error: `لم أتمكن من الوصول إلى الموقع. (${fetchError || 'empty response'})`,
      tokens: null,
      strategy,
    }
  }

  console.log(`[CloneEngineV3] Fetched via ${strategy}: ${rawHtml.length} bytes`)

  // ─── Stage 2: Deep Extract V3 ───────────────────────────────────────────
  progress({ stage: 'extract', message: `🔬 استخراج V3: ألوان · صور · copyright · كل النصوص · keyframes · DOM...`, pct: 20 })
  const tokens = deepExtract(rawHtml, url)

  console.log(`[CloneEngineV3] Extracted V3 — tech:[${tokens.techStack.join(',')}] colors:${tokens.colors.length} images:${tokens.images?.length || 0} sections:[${tokens.sections.join(',')}] footer-copyright:"${tokens.footerContent?.copyright?.slice(0,40) || 'none'}" years:${tokens.keyNumbers?.years?.join(',') || 'none'}`)

  // ─── Stage 3: AI Reconstruction — INDEX-ONLY slim prompt ────────────────
  progress({
    stage: 'generate',
    message: `🤖 توليد استنساخ الصفحة الرئيسية (prompt مضغوط · ${tokens.sections.length} أقسام)...`,
    pct: 38,
    tech: tokens.techStack,
    sections: tokens.sections,
    imageCount: tokens.images?.length || 0,
  })

  // INDEX-ONLY: use slim prompt (~8k chars vs ~30k) → AI generates reliably
  const systemPrompt = buildIndexOnlySystemPrompt(tokens)
  const userPrompt = buildCloneUserPrompt(url, section, tokens)

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  // 8000 output tokens — enough for full homepage (reduced from 12000 for speed)
  const result = await aiGenerate(messages, 8000)
  let htmlCode = extractHtml(result?.content || '')

  // ─── Stage 3b: Retry with even slimmer prompt if empty ───────────────────
  if (!htmlCode || htmlCode.length < 1000) {
    progress({ stage: 'retry', message: `🔄 إعادة المحاولة (prompt مخفف)...`, pct: 55 })
    const retryMessages = [
      {
        role: 'user',
        content: `You are an expert HTML developer. Clone the homepage of ${url}.

SPECS:
- Title: "${tokens.title || tokens.domain}"
- Sections (in order): ${tokens.sections.join(' → ')}
- Colors: ${tokens.colors.slice(0, 8).join(', ')}
- Primary: ${tokens.primaryColor || tokens.colors[0] || '#3b82f6'}
- Background: ${tokens.bgColor || (tokens.colorScheme === 'dark' ? '#0f172a' : '#ffffff')}
- Theme: ${tokens.colorScheme}
- Fonts: ${tokens.fonts?.slice(0, 2).join(', ') || 'system-ui'}
- Nav links: ${tokens.navLinks?.slice(0, 8).join(', ') || ''}
- Hero: ${tokens.heroContent?.h1 || ''} | ${tokens.heroContent?.subtext?.slice(0, 80) || ''}
- Copyright: "${tokens.footerContent?.copyright || ''}"
- Tech: ${tokens.techStack?.join(', ') || 'pure CSS'}

OUTPUT: ONE complete standalone HTML file (<!DOCTYPE html>…</html>).
All CSS in <style>. Responsive. Minimum 300 lines. Start immediately:`,
      },
    ]
    const retryResult = await aiGenerate(retryMessages, 8000)
    htmlCode = extractHtml(retryResult?.content || '') || retryResult?.content || ''
  }

  if (!htmlCode || htmlCode.length < 200) {
    return { ok: false, error: 'فشل في توليد الكود. يرجى المحاولة مجدداً.', tokens, strategy }
  }

  // ─── Stage 4: Asset URL Rewriting + Year Enforcement ────────────────────
  progress({ stage: 'assets', message: `🖼️ إصلاح مسارات الأصول · تطبيق قاعدة السنوات الحرفية...`, pct: 62 })
  try {
    htmlCode = rewriteAssetsToAbsolute(htmlCode, url)
    console.log(`[CloneEngineV3] Assets rewritten to absolute URLs`)
  } catch (assetErr) {
    console.warn(`[CloneEngineV3] Asset rewrite warning: ${assetErr.message}`)
  }

  // V3: Enforce verbatim years/copyright
  htmlCode = enforceVerbatimContent(htmlCode, tokens)

  // ─── Stage 4b: SKIPPED (LITE MODE) ───────────────────────────────────────
  // Real CSS/image download removed from main pipeline to save resources.
  // Use /api/dz-agent/clone-v2/download-full for full asset download.
  const downloadResult = null

  // ─── Stage 5: Validation + Auto-repair ──────────────────────────────────
  const score = scoreClone(htmlCode, tokens)
  const issues = detectIssues(htmlCode, tokens)

  if (score < 60 && issues.length > 0) {
    progress({ stage: 'repair', message: `🔧 إصلاح تلقائي V3: ${issues.join(', ')}...`, pct: 80 })
    const repairPrompt = buildRepairPrompt(url, htmlCode, tokens, issues.join(', '))
    const repairMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: repairPrompt },
    ]
    const repairResult = await aiGenerate(repairMessages, 10000)
    const repairedHtml = extractHtml(repairResult?.content || '')
    if (repairedHtml && repairedHtml.length > htmlCode.length * 0.7) {
      htmlCode = rewriteAssetsToAbsolute(repairedHtml, url)
      htmlCode = enforceVerbatimContent(htmlCode, tokens)
      console.log(`[CloneEngineV3] Auto-repair applied — new length: ${htmlCode.length}`)
    }
  }

  // ─── Stage 6: Dynamic copyright year injection (failsafe) ───────────────
  progress({ stage: 'copyright', message: `📅 تطبيق السنة الديناميكية في التذييل...`, pct: 92 })
  if (!htmlCode.includes('cr-yr') && !htmlCode.includes('cr-year')) {
    const currentYear = new Date().getFullYear().toString()
    // Replace any hardcoded year in footer © context
    htmlCode = htmlCode.replace(/(©|&copy;)\s*(19|20)\d{2}/gi, (match) => {
      const sym = match.match(/©|&copy;/i)[0]
      return `${sym} <span id="cr-yr">${currentYear}</span>`
    })
    // Inject JS updater before </script> or </body>
    const js = `\n  var _y=document.getElementById('cr-yr');if(_y)_y.textContent=new Date().getFullYear();`
    if (htmlCode.includes('</script>')) {
      htmlCode = htmlCode.replace('</script>', js + '\n</script>')
    } else {
      htmlCode = htmlCode.replace('</body>', `<script>${js}\n</script>\n</body>`)
    }
    console.log(`[CloneEngineV4] Dynamic copyright year injected`)
  }

  progress({ stage: 'done', message: `✅ اكتمل الاستنساخ V3 + V2 Downloader!`, pct: 100 })

  const finalScore = scoreClone(htmlCode, tokens)
  const finalIssues = detectIssues(htmlCode, tokens)

  return {
    ok: true,
    htmlCode,
    tokens,
    strategy,
    score: finalScore,
    issues: finalIssues,
    section: section || 'full',
    imageCount: tokens.images?.length || 0,
    sectionsFound: tokens.sections,
    copyright: tokens.footerContent?.copyright || '',
    // V2 Downloader data (null if download failed or was skipped)
    download: downloadResult ? {
      selfContainedHtml: downloadResult.selfContainedHtml,
      zipBuffer: downloadResult.zipBuffer,
      stats: downloadResult.stats,
      assetUrls: {
        cssCount: downloadResult.assetUrls?.css?.length || 0,
        jsCount:  downloadResult.assetUrls?.js?.length  || 0,
        imgCount: downloadResult.assetUrls?.images?.length || 0,
      },
    } : null,
  }
}

function extractHtml(text) {
  if (!text) return null
  const fenced = text.match(/```(?:html|HTML)?\s*(<!DOCTYPE[\s\S]*?<\/html>)\s*```/i)
  if (fenced) return fenced[1].trim()
  const anyFenced = text.match(/```(?:html|HTML)?\s*(<html[\s\S]*?<\/html>)\s*```/i)
  if (anyFenced) return anyFenced[1].trim()
  const rawDoctype = text.match(/(<!DOCTYPE html[\s\S]*?<\/html>)/i)
  if (rawDoctype) return rawDoctype[1].trim()
  const rawHtml = text.match(/(<html[\s\S]*?<\/html>)/i)
  if (rawHtml) return rawHtml[1].trim()
  if (text.includes('<') && text.includes('</') && text.length > 200) return text.trim()
  return null
}
