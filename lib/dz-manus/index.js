/**
 * DZ-MANUS — Autonomous AI Operating System
 * Inspired by: Manus, Devin, OpenHands, Jarvis
 * Built on: Node.js + safeGenerateAI + free tools
 *
 * Architecture:
 *   Goal → Plan → Execute → Review → Synthesize → Response
 *
 * Features:
 *   - Multi-step autonomous task execution
 *   - 7 specialized tools (search, browse, code, github, math, memory, summarize)
 *   - SSE streaming of real-time progress
 *   - Task memory with file persistence
 *   - Security sandboxing
 *   - Human approval checkpoints
 *   - Automatic retry + error recovery
 */

import { planTask, critiquePlan, replanFromStep } from './planner.js'
import { executePlan, synthesizeResults } from './executor.js'
import { validateUrl, checkRateLimit } from './security.js'
import { createTask, getTask, updateTask, recall, remember, getAllTasks, getTaskStats, cancelTask } from './memory.js'
import { TOOL_DEFINITIONS } from './tools/index.js'

const MAX_ITERATIONS = 3  // Max plan→execute cycles before forcing stop

let _aiGenerate = null

export function configure({ aiGenerate }) {
  _aiGenerate = aiGenerate
}

// ── REVIEWER ─────────────────────────────────────────────────────────────

const REVIEWER_SYSTEM = `أنت مراجع نتائج (Result Reviewer) لنظام DZ-MANUS.
مهمتك: تقييم ما إذا كانت نتائج المهمة تحقق الهدف الأصلي.

أرجع JSON:
{
  "completed": true|false,
  "score": 0-100,
  "reason": "شرح التقييم",
  "missing": ["ما ينقص"],
  "replan_needed": false,
  "replan_hint": ""
}`

async function reviewResults(plan, stepResults, finalAnswer) {
  if (!_aiGenerate) return { completed: true, score: 80, reason: 'no reviewer' }

  const messages = [
    { role: 'system', content: REVIEWER_SYSTEM },
    {
      role: 'user',
      content: `الهدف: ${plan.goal}\n\nالإجابة النهائية:\n${(finalAnswer || '').slice(0, 3000)}\n\nعدد الخطوات المنفذة: ${Object.keys(stepResults).length}\n\nهل تحقق الهدف؟`,
    },
  ]

  try {
    const result = await _aiGenerate({ messages, query: 'review', max_tokens: 800 })
    if (!result?.content) return { completed: true, score: 75, reason: 'reviewer failed' }
    const jsonMatch = result.content.match(/\{[\s\S]+\}/)
    if (jsonMatch) return JSON.parse(jsonMatch[0])
  } catch {}

  return { completed: true, score: 75, reason: 'review parse error' }
}

// ── MAIN TASK EXECUTION ───────────────────────────────────────────────────

/**
 * Run a complete autonomous task
 * @param {string}   taskId     - unique task ID
 * @param {string}   goal       - user's goal/instruction
 * @param {object}   opts       - { sessionId, skipCritique, maxIterations, onProgress }
 * @returns {object} { taskId, status, answer, plan, review, steps }
 */
export async function runTask(taskId, goal, {
  sessionId     = null,
  skipCritique  = false,
  maxIterations = MAX_ITERATIONS,
  onProgress    = null,
} = {}) {
  if (!_aiGenerate) throw new Error('DZ-MANUS not configured: call configure({ aiGenerate })')

  // ── Rate limit ────────────────────────────────────────────────────────
  const rateCheck = checkRateLimit(sessionId || taskId)
  if (!rateCheck.allowed) {
    return { taskId, status: 'error', error: rateCheck.reason }
  }

  // ── Create task record ────────────────────────────────────────────────
  createTask({ id: taskId, goal, sessionId })
  updateTask(taskId, { status: 'planning' })
  emit(onProgress, 'task_created', { taskId, goal })

  // ── Recall relevant memories ──────────────────────────────────────────
  const memories = recall(goal, { limit: 3, minSim: 0.15 })
  emit(onProgress, 'memory_recalled', { count: memories.length })

  try {
    // ── PHASE 1: PLAN ─────────────────────────────────────────────────
    emit(onProgress, 'phase', { phase: 'planning', message: 'جاري التخطيط...' })
    let plan = await planTask(goal, { memories }, _aiGenerate)

    // Optional: critique pass (improves plan quality)
    if (!skipCritique && plan.complexity !== 'low') {
      emit(onProgress, 'phase', { phase: 'critique', message: 'مراجعة الخطة...' })
      plan = await critiquePlan(plan, _aiGenerate)
    }

    updateTask(taskId, { status: 'running', plan })
    emit(onProgress, 'plan_ready', {
      taskId,
      title:       plan.title,
      steps:       plan.steps?.length || 0,
      complexity:  plan.complexity,
    })

    // ── PHASE 2: EXECUTE ──────────────────────────────────────────────
    let allResults = {}
    let iteration  = 0

    while (iteration < maxIterations) {
      iteration++
      emit(onProgress, 'phase', {
        phase:     'executing',
        iteration,
        message:   `تنفيذ الخطوات (${iteration}/${maxIterations})...`,
      })

      const iterResults = await executePlan(plan, taskId, _aiGenerate, onProgress)
      allResults = { ...allResults, ...iterResults }

      // Check if we need to replan due to failures
      const failedCritical = plan.steps?.find(s =>
        s.critical && iterResults[s.id]?.error
      )
      if (failedCritical && iteration < maxIterations) {
        emit(onProgress, 'phase', { phase: 'replanning', message: 'إعادة التخطيط...' })
        const newPlan = await replanFromStep(plan, failedCritical.id, failedCritical.error || 'unknown', _aiGenerate)
        if (newPlan?.steps?.length) {
          plan = { ...plan, steps: [...(plan.steps || []), ...newPlan.steps] }
          updateTask(taskId, { plan })
          continue
        }
      }
      break
    }

    // ── PHASE 3: SYNTHESIZE ───────────────────────────────────────────
    emit(onProgress, 'phase', { phase: 'synthesizing', message: 'تجميع النتائج...' })
    const synthesis = await synthesizeResults(plan, allResults, _aiGenerate, onProgress)
    const answer = synthesis?.content || 'لم أتمكن من إكمال المهمة.'

    // ── PHASE 4: REVIEW ───────────────────────────────────────────────
    emit(onProgress, 'phase', { phase: 'reviewing', message: 'مراجعة النتائج...' })
    const review = await reviewResults(plan, allResults, answer)

    // ── Store memory ──────────────────────────────────────────────────
    remember(`مهمة: ${goal}\nالنتيجة: ${answer.slice(0, 500)}`, {
      tags:   ['task', 'completed'],
      source: 'manus',
      taskId,
    })

    // ── Update task record ────────────────────────────────────────────
    updateTask(taskId, {
      status:  'done',
      results: allResults,
      review,
      endTs:   Date.now(),
      iterations: iteration,
      answer,
    })

    emit(onProgress, 'task_done', {
      taskId,
      score:       review.score,
      completed:   review.completed,
      iterations:  iteration,
      model:       synthesis?.model,
    })

    return {
      taskId,
      status:     'done',
      answer,
      plan,
      review,
      iterations: iteration,
      model:      synthesis?.model,
    }

  } catch (err) {
    updateTask(taskId, { status: 'error', error: err.message, endTs: Date.now() })
    emit(onProgress, 'task_error', { taskId, error: err.message })
    return { taskId, status: 'error', error: err.message }
  }
}

// ── PUBLIC API ────────────────────────────────────────────────────────────

export { getTask, getAllTasks, getTaskStats, cancelTask, TOOL_DEFINITIONS }

function emit(onProgress, type, data) {
  if (typeof onProgress === 'function') {
    try { onProgress({ type, ...data, ts: Date.now() }) } catch {}
  }
}

export const VERSION = '1.0.0'
export const AGENTS = [
  { id: 'planner',   name: 'Planner Agent',   role: 'يحلل الهدف ويضع الخطة', icon: '🧠', status: 'idle' },
  { id: 'executor',  name: 'Executor Agent',   role: 'ينفذ الخطوات بالأدوات', icon: '⚙️', status: 'idle' },
  { id: 'research',  name: 'Research Agent',   role: 'يبحث ويجمع المعلومات',  icon: '🔍', status: 'idle' },
  { id: 'coder',     name: 'Coder Agent',      role: 'يكتب وينفذ الأكواد',    icon: '💻', status: 'idle' },
  { id: 'browser',   name: 'Browser Agent',    role: 'يتصفح المواقع',          icon: '🌐', status: 'idle' },
  { id: 'reviewer',  name: 'Reviewer Agent',   role: 'يراجع ويقيّم النتائج',  icon: '✅', status: 'idle' },
  { id: 'memory',    name: 'Memory Agent',     role: 'يتذكر ويسترجع السياق',  icon: '🗄️', status: 'idle' },
]
