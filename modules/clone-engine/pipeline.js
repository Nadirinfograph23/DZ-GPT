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
import { buildCloneSystemPrompt, buildCloneUserPrompt, buildRepairPrompt } from './prompter.js'
import { rewriteAssetsToAbsolute } from './asset-handler.js'
import { downloadWebsite, injectRealCssIntoClone, extractAssetUrls } from './downloader.js'

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

  // Placeholder images present (V3 — we expect placeholders, not real imgs)
  const phCount = (html.match(/صورة\s*\d/g) || []).length
  if (phCount > 0) score += Math.min(6, phCount * 2)

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

// ── V3: Post-processing — enforce verbatim years/copyright ────────────────────
function enforceVerbatimContent(html, tokens) {
  if (!tokens.footerContent?.copyright) return html

  const copyright = tokens.footerContent.copyright
  const years = tokens.keyNumbers?.years || []

  // Extract years from copyright
  const copyrightYears = copyright.match(/\b(19|20)\d{2}\b/g) || []

  if (copyrightYears.length === 0 && years.length === 0) return html

  let result = html

  // Replace common AI year substitutions (2025, 2026) with the actual year from site
  const siteYear = copyrightYears[0] || years[0]
  if (siteYear) {
    // In footer/copyright contexts, replace wrong years
    const wrongYears = ['2025', '2026', '2027'].filter(y => y !== siteYear)
    for (const wy of wrongYears) {
      // Only replace in clearly copyright contexts (near ©, copyright, All Rights, etc.)
      result = result.replace(
        new RegExp(`(©|&copy;|copyright|all rights|tous droits)[^<]{0,30}${wy}`, 'gi'),
        (match) => match.replace(wy, siteYear)
      )
      result = result.replace(
        new RegExp(`${wy}([^<]{0,30})(©|&copy;|copyright|all rights|tous droits)`, 'gi'),
        (match) => match.replace(wy, siteYear)
      )
    }
  }

  return result
}

/**
 * Run the full V3 cloning pipeline.
 */
export async function runClonePipeline({ url, section = 'full', aiGenerate, onProgress }) {
  const progress = onProgress || (() => {})

  // ─── Stage 1: Fetch ─────────────────────────────────────────────────────
  progress({ stage: 'fetch', message: `🌐 جارٍ جلب الموقع بـ 7 استراتيجيات...`, pct: 8 })
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

  // ─── Stage 3: AI Reconstruction ─────────────────────────────────────────
  progress({
    stage: 'generate',
    message: `🤖 إعادة بناء الاستنساخ V3 بدقة 95–100%... (${tokens.sections.length} أقسام · ${tokens.images?.length || 0} صورة)`,
    pct: 38,
    tech: tokens.techStack,
    sections: tokens.sections,
    imageCount: tokens.images?.length || 0,
  })

  const systemPrompt = buildCloneSystemPrompt(tokens)
  const userPrompt = buildCloneUserPrompt(url, section, tokens)

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  // INDEX-ONLY: 10000 tokens is enough for a full homepage clone (faster)
  const result = await aiGenerate(messages, 10000)
  let htmlCode = extractHtml(result?.content || '')

  // ─── Stage 3b: Retry if empty or too short ───────────────────────────────
  if (!htmlCode || htmlCode.length < 1000) {
    progress({ stage: 'retry', message: `🔄 إعادة المحاولة بتعليمات أقوى (V3)...`, pct: 55 })
    const retryMessages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `CRITICAL RETRY — V3 Clone of ${url}:
Your previous response was empty or too short. You MUST output a COMPLETE HTML file now.
${userPrompt}

IMPORTANT REMINDERS:
- Output MUST start with <!DOCTYPE html>
- MUST include ALL sections: ${tokens.sections.join(' → ')}
- MUST use colors: ${tokens.colors.slice(0,6).join(', ')}
- MUST preserve years verbatim: ${tokens.keyNumbers?.years?.join(', ') || 'none'}
- Copyright VERBATIM: "${tokens.footerContent?.copyright || ''}"
- Minimum 400 lines of HTML

START WITH <!DOCTYPE html> NOW:`,
      },
    ]
    const retryResult = await aiGenerate(retryMessages, 10000)
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

  // ─── Stage 4b: Real CSS Injection — INDEX-ONLY (fast path) ──────────────
  // Fetches CSS only (max 5 sheets), skips JS entirely, limits images to 8.
  // ZIP is NOT built here — only on explicit download request.
  let downloadResult = null
  try {
    progress({ stage: 'real-assets', message: `🌐 جلب CSS الحقيقي من الصفحة الرئيسية (سريع — بدون JS · بدون ZIP)...`, pct: 68 })
    downloadResult = await downloadWebsite(url, rawHtml, (p) => {
      progress({ ...p, pct: 68 + Math.round((p.pct - 38) * 0.14) })
    }, { indexOnly: true, buildZip: false })
    // Inject real CSS layout into AI clone (non-destructive — only structural rules)
    if (downloadResult.assets?.css && Object.keys(downloadResult.assets.css).length > 0) {
      htmlCode = injectRealCssIntoClone(htmlCode, downloadResult.assets.css)
      console.log(`[CloneEngineV3/INDEX] Injected ${Object.keys(downloadResult.assets.css).length} CSS sheets (JS skipped, ZIP skipped)`)
    }
    progress({ stage: 'real-assets', message: `✅ CSS الحقيقي مدمج (${downloadResult.stats.cssCount} ملف · ${downloadResult.stats.imageCount} صورة)`, pct: 80 })
  } catch (dlErr) {
    console.warn(`[CloneEngineV3/V2] Real asset download failed (non-fatal): ${dlErr.message}`)
  }

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

  // ─── Stage 6: Final copyright injection (failsafe) ──────────────────────
  if (tokens.footerContent?.copyright) {
    const copyright = tokens.footerContent.copyright
    // If copyright line is still missing, inject it into existing footer
    if (!htmlCode.includes(copyright.slice(0, 20))) {
      progress({ stage: 'copyright', message: `📌 تطبيق نص حقوق الملكية الأصلي...`, pct: 92 })
      const copyrightYears = copyright.match(/\b(19|20)\d{2}\b/g) || []
      if (copyrightYears.length > 0) {
        const siteYear = copyrightYears[0]
        const wrongYears = ['2025', '2026', '2027'].filter(y => y !== siteYear)
        for (const wy of wrongYears) {
          // More aggressive replacement in footer section
          htmlCode = htmlCode.replace(
            new RegExp(`(<footer[^>]*>[\\s\\S]{0,2000})${wy}`, 'i'),
            (match) => match.replace(wy, siteYear)
          )
        }
      }
      console.log(`[CloneEngineV3] Copyright enforcement applied`)
    }
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
