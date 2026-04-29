// DZ Agent V2 — Top-level orchestrator.
// Single entry point: handle({ query, sessionId, aiGenerate }) → final answer.
// Wires Planner → Executor → QA, persists memory, logs the turn.

import { plan, execute, qa } from './agents.js'
import { rememberTurn, recordSemantic } from './memory-store.js'
import { logTurn } from './learning.js'

export async function handle({ query, sessionId, aiGenerate }) {
  const t0 = Date.now()
  const cleanQuery = String(query || '').trim()
  if (!cleanQuery) {
    return { ok: false, content: 'Empty query.', lang: 'ar', planSteps: [], plugins: [], attempts: 0, latencyMs: 0 }
  }

  // 1. Remember user turn (short-term)
  rememberTurn(sessionId, 'user', cleanQuery)

  // 2. Plan
  const planResult = plan(cleanQuery, { sessionId })

  // 3. Execute
  let execResult
  try {
    execResult = await execute(cleanQuery, planResult, { aiGenerate, sessionId })
  } catch (err) {
    execResult = {
      content: null, attempts: 1, rejectedReason: `executor-error: ${err.message}`,
      valid: false, plugins: [], recalled: 0, lang: planResult.lang, intent: planResult.intent,
    }
  }

  // 4. QA
  const final = qa(execResult, cleanQuery)
  const latencyMs = Date.now() - t0

  // 5. Persist & log
  rememberTurn(sessionId, 'assistant', final.content)
  if (final.ok && final.content) {
    recordSemantic(sessionId, {
      query: cleanQuery,
      answer: final.content,
      lang: final.lang,
      intent: planResult.intent,
    }).catch(() => {})
  }
  logTurn({
    sessionId,
    lang: final.lang,
    intent: planResult.intent,
    query: cleanQuery,
    answer: final.content,
    plugins: execResult.plugins?.map(p => p.name) || [],
    attempts: execResult.attempts,
    valid: final.ok,
    latencyMs,
    rejectedReason: final.rejectedReason || execResult.rejectedReason || null,
  })

  return {
    ok: final.ok,
    content: final.content,
    lang: final.lang,
    intent: planResult.intent,
    planSteps: planResult.steps,
    plugins: execResult.plugins,
    recalled: execResult.recalled,
    attempts: execResult.attempts,
    rejectedReason: final.rejectedReason || null,
    latencyMs,
  }
}
