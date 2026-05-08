/**
 * clone-engine/pipeline.js
 * Main multi-stage cloning pipeline.
 * Stage 1: Multi-strategy fetch
 * Stage 2: Deep extraction (cheerio + regex)
 * Stage 3: AI reconstruction (primary model)
 * Stage 4: Validation + auto-repair (secondary model if needed)
 */

import { fetchHtmlMultiStrategy } from './fetcher.js'
import { deepExtract } from './extractor.js'
import { buildCloneSystemPrompt, buildCloneUserPrompt, buildRepairPrompt } from './prompter.js'

// Validation helpers
function scoreClone(html, tokens) {
  if (!html || html.length < 500) return 0
  let score = 0
  if (/<html/i.test(html)) score += 10
  if (/<\/html>/i.test(html)) score += 10
  if (/<style[\s>]/i.test(html)) score += 10
  if (/<body[\s>]/i.test(html)) score += 5
  if (html.length > 3000) score += 10
  if (html.length > 8000) score += 10
  if (html.length > 15000) score += 10

  // Check color accuracy
  const usedColors = tokens.colors?.filter(c => html.includes(c)) || []
  score += Math.min(15, usedColors.length * 2)

  // Check sections coverage
  const sectionHits = (tokens.sections || []).filter(s =>
    html.toLowerCase().includes(s.replace('-', '')) ||
    html.toLowerCase().includes(s)
  )
  score += Math.min(20, sectionHits.length * 4)

  return Math.min(100, score)
}

function detectIssues(html, tokens) {
  const issues = []
  if (!html || html.length < 500) { issues.push('output too short'); return issues }
  if (!/<style[\s>]/i.test(html)) issues.push('missing CSS styles')
  if (html.length < 3000) issues.push('very minimal output')
  if ((tokens.sections || []).length > 3) {
    const missedSections = (tokens.sections || []).filter(s =>
      !html.toLowerCase().includes(s.replace('-', '')) &&
      !html.toLowerCase().includes(s.split('-')[0])
    )
    if (missedSections.length > 2) issues.push(`missing sections: ${missedSections.join(', ')}`)
  }
  return issues
}

/**
 * Run the full cloning pipeline.
 * @param {Object} opts
 * @param {string} opts.url - Target URL
 * @param {string} [opts.section] - Specific section to clone ('full' or section name)
 * @param {Function} opts.aiGenerate - async (messages, max_tokens) => { content, model }
 * @param {Function} [opts.onProgress] - called with progress stage strings
 * @returns {Promise<CloneResult>}
 */
export async function runClonePipeline({ url, section = 'full', aiGenerate, onProgress }) {
  const progress = onProgress || (() => {})

  // ─── Stage 1: Fetch ─────────────────────────────────────────────────────
  progress({ stage: 'fetch', message: `جارٍ جلب الموقع...`, pct: 10 })
  const { html: rawHtml, strategy, error: fetchError } = await fetchHtmlMultiStrategy(url)

  if (!rawHtml || rawHtml.length < 100) {
    return {
      ok: false,
      error: `لم أتمكن من الوصول إلى الموقع. (${fetchError || 'empty response'})`,
      tokens: null,
      strategy,
    }
  }

  console.log(`[CloneEngine] Fetched via ${strategy}: ${rawHtml.length} bytes`)

  // ─── Stage 2: Extract ────────────────────────────────────────────────────
  progress({ stage: 'extract', message: `استخراج المحتوى والتصميم...`, pct: 25 })
  const tokens = deepExtract(rawHtml, url)

  console.log(`[CloneEngine] Extracted — tech:[${tokens.techStack.join(',')}] colors:${tokens.colors.length} sections:[${tokens.sections.join(',')}] layout:${tokens.layoutType}`)

  // ─── Stage 3: AI Reconstruction ─────────────────────────────────────────
  progress({
    stage: 'generate',
    message: `بناء الاستنساخ (${tokens.techStack.length > 0 ? tokens.techStack.slice(0, 3).join(', ') : 'HTML/CSS'})...`,
    pct: 45,
    tech: tokens.techStack,
    sections: tokens.sections,
  })

  const systemPrompt = buildCloneSystemPrompt(tokens)
  const userPrompt = buildCloneUserPrompt(url, section, tokens)

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]

  const result = await aiGenerate(messages, 12000)
  let htmlCode = extractHtml(result?.content || '')

  // ─── Stage 4: Validation + Auto-repair ──────────────────────────────────
  if (!htmlCode || htmlCode.length < 500) {
    progress({ stage: 'repair', message: `إعادة المحاولة بنموذج مختلف...`, pct: 70 })

    // Retry with a more verbose prompt
    const retryMessages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: `IMPORTANT: Your previous response was empty or invalid. You MUST output a complete HTML file now.\n\n${userPrompt}\n\nOUTPUT HTML NOW:`,
      },
    ]
    const retryResult = await aiGenerate(retryMessages, 12000)
    htmlCode = extractHtml(retryResult?.content || '') || retryResult?.content || ''
  }

  if (!htmlCode || htmlCode.length < 200) {
    return {
      ok: false,
      error: 'فشل في توليد الكود. يرجى المحاولة مجدداً.',
      tokens,
      strategy,
    }
  }

  const score = scoreClone(htmlCode, tokens)
  const issues = detectIssues(htmlCode, tokens)

  // Auto-repair if score is low and issues found
  if (score < 50 && issues.length > 0) {
    progress({ stage: 'repair', message: `إصلاح تلقائي للمشاكل المكتشفة...`, pct: 75 })
    const repairPrompt = buildRepairPrompt(url, htmlCode, tokens, issues.join(', '))
    const repairMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: repairPrompt },
    ]
    const repairResult = await aiGenerate(repairMessages, 12000)
    const repairedHtml = extractHtml(repairResult?.content || '')
    if (repairedHtml && repairedHtml.length > htmlCode.length * 0.8) {
      htmlCode = repairedHtml
      console.log(`[CloneEngine] Auto-repair improved output from ${htmlCode.length} chars`)
    }
  }

  progress({ stage: 'done', message: `اكتمل الاستنساخ!`, pct: 100 })

  return {
    ok: true,
    htmlCode,
    tokens,
    strategy,
    score: scoreClone(htmlCode, tokens),
    issues,
    section: section || 'full',
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
