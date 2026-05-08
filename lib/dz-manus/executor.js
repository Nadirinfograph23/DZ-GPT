/**
 * DZ-MANUS — Step Executor
 * Executes plan steps one by one, streams progress via callback,
 * handles tool dispatch, error recovery, and result injection.
 */

import { executeTool } from './tools/index.js'
import { sanitizeStep, validateUrl } from './security.js'
import { addTaskStep } from './memory.js'

const MAX_STEP_RETRIES = 2
const STEP_TIMEOUT_MS  = 45_000

/**
 * Execute all steps in a plan
 * @param {object}   plan       - The plan object from planner.js
 * @param {string}   taskId     - Task ID for memory tracking
 * @param {function} aiGenerate - safeGenerateAI
 * @param {function} onProgress - callback(event) for SSE streaming
 * @returns {object[]} array of step results
 */
export async function executePlan(plan, taskId, aiGenerate, onProgress) {
  const steps   = plan.steps || []
  const results = {}   // stepId → result

  emit(onProgress, 'plan_start', {
    taskId,
    totalSteps:  steps.length,
    planTitle:   plan.title,
    complexity:  plan.complexity,
  })

  for (const rawStep of steps) {
    const step = sanitizeStep(rawStep)

    if (step.blocked) {
      emit(onProgress, 'step_blocked', { taskId, step: step.id, reason: step.reason })
      results[step.id] = { blocked: true, reason: step.reason }
      continue
    }

    // Inject results from dependency steps into params
    const params = injectDependencies(step.params, step.dependsOn, results)

    emit(onProgress, 'step_start', {
      taskId,
      step:        step.id,
      description: step.description,
      tool:        step.tool,
      params:      sanitizeParamsForLog(params),
    })

    const t0 = Date.now()
    step.startTs = t0

    let stepResult = null
    let lastError  = null

    for (let attempt = 0; attempt <= MAX_STEP_RETRIES; attempt++) {
      if (attempt > 0) {
        emit(onProgress, 'step_retry', { taskId, step: step.id, attempt })
        await sleep(1000 * attempt)
      }

      try {
        stepResult = await Promise.race([
          executeStepWithAI(step, params, aiGenerate),
          timeout(STEP_TIMEOUT_MS, `Step ${step.id} timed out`),
        ])

        if (stepResult && !stepResult.error) break
        lastError = stepResult?.error || 'unknown error'
      } catch (err) {
        lastError = err.message
        if (attempt === MAX_STEP_RETRIES) {
          stepResult = { error: lastError }
        }
      }
    }

    const durationMs = Date.now() - t0
    step.endTs     = Date.now()
    step.durationMs = durationMs

    if (stepResult?.error && step.critical) {
      emit(onProgress, 'step_error', {
        taskId, step: step.id,
        error: stepResult.error, durationMs,
      })
      // Critical step failed — record but continue (reviewer will decide)
      results[step.id] = { error: stepResult.error }
      addTaskStep(taskId, { stepId: step.id, tool: step.tool, status: 'error', error: stepResult.error, durationMs })
    } else {
      // Success
      results[step.id] = stepResult
      const preview = buildResultPreview(stepResult, step.tool)
      emit(onProgress, 'step_done', {
        taskId, step: step.id,
        tool: step.tool,
        preview,
        durationMs,
        resultSize: JSON.stringify(stepResult).length,
      })
      addTaskStep(taskId, { stepId: step.id, tool: step.tool, status: 'done', durationMs, preview })
    }
  }

  emit(onProgress, 'execution_done', { taskId, stepsCompleted: Object.keys(results).length })
  return results
}

/**
 * Execute a single step, dispatching to the right tool
 */
async function executeStepWithAI(step, params, aiGenerate) {
  // For summarize tool, text might come from a previous result injected as param
  if (step.tool === 'summarize' && !params.text) {
    return { error: 'summarize: no text provided from previous steps' }
  }

  return executeTool(step.tool, params, aiGenerate)
}

/**
 * Synthesize all step results into a final answer
 */
export async function synthesizeResults(plan, stepResults, aiGenerate, onProgress) {
  emit(onProgress, 'synthesis_start', { plan: plan.title })

  // Build context from results
  const contextParts = []
  for (const step of (plan.steps || [])) {
    const res = stepResults[step.id]
    if (!res || res.error) continue
    const preview = buildResultPreview(res, step.tool)
    contextParts.push(`=== نتيجة خطوة ${step.id}: ${step.description} ===\n${preview}`)
  }

  if (!contextParts.length) {
    return { content: 'لم تتوفر نتائج كافية لإجابة شاملة.', model: null }
  }

  const messages = [
    {
      role: 'system',
      content: `أنت DZ-MANUS، نظام ذكاء اصطناعي متقدم يلخص نتائج مهمة بشكل احترافي.
اكتب إجابة شاملة ومنظمة بناءً على المعلومات المتوفرة.
استخدم Markdown للتنسيق. أضف مراجع إذا وجدت.
الهدف الأصلي: ${plan.goal}
تعليمات التلخيص: ${plan.final_synthesis || 'اجمع النتائج في إجابة شاملة'}`,
    },
    {
      role: 'user',
      content: `بناءً على نتائج التنفيذ التالية، اكتب الإجابة النهائية:\n\n${contextParts.join('\n\n').slice(0, 14000)}`,
    },
  ]

  const result = await aiGenerate({ messages, query: `synthesis:${plan.goal}`, max_tokens: 4000 })
  emit(onProgress, 'synthesis_done', { model: result?.model })
  return result || { content: 'فشل التلخيص النهائي.', model: null }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Inject results from dependency steps into current step params.
 * Placeholder syntax: {{step_N_result}}, {{step_N_text}}, {{step_N_summary}}
 */
function injectDependencies(params, dependsOn, results) {
  if (!dependsOn?.length || !params) return params
  let paramsStr = JSON.stringify(params)

  for (const depId of dependsOn) {
    const depResult = results[depId]
    if (!depResult) continue

    // Extract most useful text from the dependency result
    const text = extractTextFromResult(depResult)
    paramsStr = paramsStr
      .replace(new RegExp(`\\{\\{step_${depId}_result\\}\\}`, 'g'), text.slice(0, 4000))
      .replace(new RegExp(`\\{\\{step_${depId}_text\\}\\}`,   'g'), text.slice(0, 4000))
      .replace(new RegExp(`\\{\\{step_${depId}_summary\\}\\}`, 'g'), text.slice(0, 2000))

    // Special: if the current tool is "summarize" and has no text,
    // inject the dep result as text
    try {
      const parsed = JSON.parse(paramsStr)
      if (!parsed.text && text) parsed.text = text.slice(0, 12000)
      paramsStr = JSON.stringify(parsed)
    } catch {}
  }

  try { return JSON.parse(paramsStr) } catch { return params }
}

function extractTextFromResult(result) {
  if (!result) return ''
  if (typeof result === 'string') return result
  // Tool-specific extraction
  if (result.result?.text)   return result.result.text
  if (result.result?.summary) return result.result.summary
  if (result.result?.results) return JSON.stringify(result.result.results)
  if (result.result?.output) return result.result.output
  if (result.result?.readme) return result.result.readme
  if (result.text)   return result.text
  if (result.summary) return result.summary
  if (result.output) return result.output
  return JSON.stringify(result).slice(0, 3000)
}

function buildResultPreview(result, tool) {
  if (!result) return 'لا يوجد نتيجة'
  const r = result.result || result
  switch (tool) {
    case 'web_search': {
      const items = r.results || []
      return items.slice(0, 3).map(i => `• ${i.title} — ${i.url}`).join('\n') || 'لا نتائج'
    }
    case 'browse':
      return (r.text || r.error || '').slice(0, 500)
    case 'code_exec':
      return r.output || r.result || r.error || ''
    case 'summarize':
      return (r.summary || '').slice(0, 500)
    case 'github':
      return JSON.stringify(r).slice(0, 500)
    case 'memory_recall':
      return `${r.count || 0} ذاكرة`
    case 'math':
      return `${r.expression} = ${r.result}`
    default:
      return JSON.stringify(r).slice(0, 300)
  }
}

function sanitizeParamsForLog(params) {
  if (!params) return {}
  const p = { ...params }
  if (p.code) p.code = p.code.slice(0, 100) + '...'
  if (p.text) p.text = p.text.slice(0, 100) + '...'
  return p
}

function emit(onProgress, type, data) {
  if (typeof onProgress === 'function') {
    try { onProgress({ type, ...data, ts: Date.now() }) } catch {}
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function timeout(ms, msg) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))
}
