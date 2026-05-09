/**
 * clone-engine/pipeline.js  — V2
 * Main multi-stage cloning pipeline.
 * Stage 1: Multi-strategy fetch (7 strategies)
 * Stage 2: Deep extraction V2 (images, SVGs, buttons, shadows, spacing, skeleton)
 * Stage 3: AI reconstruction with full asset context
 * Stage 4: Asset URL rewriting (relative → absolute)
 * Stage 5: Validation + auto-repair
 */

import { fetchHtmlMultiStrategy } from './fetcher.js'
import { deepExtract } from './extractor.js'
import { buildCloneSystemPrompt, buildCloneUserPrompt, buildRepairPrompt } from './prompter.js'
import { rewriteAssetsToAbsolute } from './asset-handler.js'

// ── Validation helpers ───────────────────────────────────────────────────────

function scoreClone(html, tokens) {
  if (!html || html.length < 500) return 0
  let score = 0
  if (/<html/i.test(html)) score += 8
  if (/<\/html>/i.test(html)) score += 8
  if (/<style[\s>]/i.test(html)) score += 10
  if (/<body[\s>]/i.test(html)) score += 5
  if (html.length > 3000) score += 8
  if (html.length > 8000) score += 8
  if (html.length > 15000) score += 6

  // Color accuracy
  const usedColors = tokens.colors?.filter(c => html.includes(c)) || []
  score += Math.min(15, usedColors.length * 2)

  // Section coverage
  const sectionHits = (tokens.sections || []).filter(s =>
    html.toLowerCase().includes(s.replace('-', '')) ||
    html.toLowerCase().includes(s.split('-')[0])
  )
  score += Math.min(18, sectionHits.length * 3)

  // V2: Image presence
  const imgCount = (html.match(/<img[^>]+src=/gi) || []).length
  if (imgCount > 0) score += Math.min(8, imgCount * 2)

  // V2: Animation presence
  if (/@keyframes/i.test(html)) score += 4
  if (/transition/i.test(html)) score += 3

  // V2: Responsiveness
  if (/@media/i.test(html)) score += 5

  return Math.min(100, score)
}

function detectIssues(html, tokens) {
  const issues = []
  if (!html || html.length < 500) { issues.push('output too short'); return issues }
  if (!/<style[\s>]/i.test(html)) issues.push('missing CSS styles')
  if (!/@media/i.test(html)) issues.push('not responsive — no media queries')
  if (html.length < 3000) issues.push('very minimal output')
  if ((tokens.images || []).length > 0 && (html.match(/<img/gi) || []).length === 0) {
    issues.push('missing images — no <img> tags found')
  }
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
  return issues
}

/**
 * Run the full V2 cloning pipeline.
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

  console.log(`[CloneEngineV2] Fetched via ${strategy}: ${rawHtml.length} bytes`)

  // ─── Stage 2: Deep Extract V2 ───────────────────────────────────────────
  progress({ stage: 'extract', message: `🔬 استخراج التصميم: ألوان · صور · أزرار · ظلال · هيكل...`, pct: 22 })
  const tokens = deepExtract(rawHtml, url)

  console.log(`[CloneEngineV2] Extracted V2 — tech:[${tokens.techStack.join(',')}] colors:${tokens.colors.length} images:${tokens.images?.length || 0} sections:[${tokens.sections.join(',')}] layout:${tokens.layoutType} shadows:${tokens.shadowTokens?.length || 0}`)

  // ─── Stage 3: AI Reconstruction ─────────────────────────────────────────
  progress({
    stage: 'generate',
    message: `🤖 بناء الاستنساخ (${tokens.techStack.length > 0 ? tokens.techStack.slice(0, 3).join(', ') : 'HTML/CSS'}) مع ${tokens.images?.length || 0} صورة...`,
    pct: 40,
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

  const result = await aiGenerate(messages, 8000)
  let htmlCode = extractHtml(result?.content || '')

  // ─── Stage 3b: Retry if empty ────────────────────────────────────────────
  if (!htmlCode || htmlCode.length < 500) {
    progress({ stage: 'retry', message: `🔄 إعادة المحاولة بتعليمات أقوى...`, pct: 60 })
    const retryMessages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `CRITICAL: Your previous response was empty or invalid. You MUST output a complete HTML file now.\n\n${userPrompt}\n\nOUTPUT FULL HTML NOW — start with <!DOCTYPE html>:`,
      },
    ]
    const retryResult = await aiGenerate(retryMessages, 8000)
    htmlCode = extractHtml(retryResult?.content || '') || retryResult?.content || ''
  }

  if (!htmlCode || htmlCode.length < 200) {
    return { ok: false, error: 'فشل في توليد الكود. يرجى المحاولة مجدداً.', tokens, strategy }
  }

  // ─── Stage 4: Asset URL Rewriting ────────────────────────────────────────
  progress({ stage: 'assets', message: `🖼️ إصلاح مسارات الصور والأصول...`, pct: 72 })
  try {
    htmlCode = rewriteAssetsToAbsolute(htmlCode, url)
    console.log(`[CloneEngineV2] Assets rewritten to absolute URLs`)
  } catch (assetErr) {
    console.warn(`[CloneEngineV2] Asset rewrite warning: ${assetErr.message}`)
  }

  // ─── Stage 5: Validation + Auto-repair ──────────────────────────────────
  const score = scoreClone(htmlCode, tokens)
  const issues = detectIssues(htmlCode, tokens)

  if (score < 55 && issues.length > 0) {
    progress({ stage: 'repair', message: `🔧 إصلاح تلقائي: ${issues.join(', ')}...`, pct: 80 })
    const repairPrompt = buildRepairPrompt(url, htmlCode, tokens, issues.join(', '))
    const repairMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: repairPrompt },
    ]
    const repairResult = await aiGenerate(repairMessages, 8000)
    const repairedHtml = extractHtml(repairResult?.content || '')
    if (repairedHtml && repairedHtml.length > htmlCode.length * 0.7) {
      htmlCode = rewriteAssetsToAbsolute(repairedHtml, url)
      console.log(`[CloneEngineV2] Auto-repair applied — new length: ${htmlCode.length}`)
    }
  }

  progress({ stage: 'done', message: `✅ اكتمل الاستنساخ V2!`, pct: 100 })

  return {
    ok: true,
    htmlCode,
    tokens,
    strategy,
    score: scoreClone(htmlCode, tokens),
    issues: detectIssues(htmlCode, tokens),
    section: section || 'full',
    imageCount: tokens.images?.length || 0,
    sectionsFound: tokens.sections,
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
