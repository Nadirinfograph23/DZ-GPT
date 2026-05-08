/**
 * DZ Agent V5 — Executor
 * The main autonomous execution loop.
 * Runs plans step-by-step with retry, verification, and self-healing.
 */

import { replanFromFailure } from './planner.js'

const MAX_RETRIES = 3
const STEP_TIMEOUT_MS = 60000

export class TaskExecutor {
  constructor({ safeGenerateAI, toolRegistry, agentCoordinator, monitor, memory }) {
    this.ai = safeGenerateAI
    this.tools = toolRegistry
    this.coordinator = agentCoordinator
    this.monitor = monitor
    this.memory = memory
  }

  // ── Main execution loop ────────────────────────────────────────────────
  async execute(task, emit = () => {}) {
    const { plan, taskId } = task
    const context = {
      taskId,
      goal: plan.goal,
      stepResults: {},
      messages: [],
      startedAt: Date.now(),
    }

    this.monitor.taskStart(taskId, plan.goal)
    emit({ type: 'execution_start', taskId, goal: plan.goal, steps: plan.steps.length })

    let stepIndex = 0
    while (stepIndex < plan.steps.length) {
      const step = plan.steps[stepIndex]

      // Skip completed steps
      if (step.status === 'done') { stepIndex++; continue }

      // Check dependencies
      const depsReady = step.depends_on.every(depId => {
        const dep = plan.steps.find(s => s.id === depId)
        return dep && dep.status === 'done'
      })
      if (!depsReady) {
        emit({ type: 'step_waiting', stepId: step.id, waitingFor: step.depends_on })
        stepIndex++
        continue
      }

      // Build step input context
      const stepContext = this._buildStepContext(step, context)

      emit({ type: 'step_start', step: { id: step.id, description: step.description, agent: step.agent, tools: step.tools } })
      this.monitor.stepStart(taskId, step.id, step.description)

      // Execute with retry
      let result = null
      let lastError = null

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        step.attempts = attempt
        try {
          emit({ type: 'step_attempt', stepId: step.id, attempt, maxAttempts: MAX_RETRIES })

          // Timeout wrapper
          result = await Promise.race([
            this._executeStep(step, stepContext, emit),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Step timed out')), STEP_TIMEOUT_MS)
            ),
          ])

          if (result && !result.error) {
            lastError = null
            break
          }
          lastError = result?.error || 'Unknown error'
          if (attempt < MAX_RETRIES) {
            emit({ type: 'step_retry', stepId: step.id, attempt, error: lastError })
            await sleep(1000 * attempt) // exponential backoff
          }
        } catch (err) {
          lastError = err.message
          if (attempt < MAX_RETRIES) {
            emit({ type: 'step_retry', stepId: step.id, attempt, error: lastError })
            await sleep(1000 * attempt)
          }
        }
      }

      if (lastError && !result?.output) {
        // Step failed after all retries
        step.status = 'failed'
        step.error = lastError
        emit({ type: 'step_failed', stepId: step.id, error: lastError })
        this.monitor.stepFail(taskId, step.id, lastError)

        // Try to replan
        const replan = await replanFromFailure(plan, step, lastError, this.ai)
        if (replan.ok && replan.newSteps?.length > 0) {
          emit({ type: 'replanning', reason: lastError, newSteps: replan.newSteps.length })
          // Replace remaining pending steps with new steps
          const newSteps = replan.newSteps.map((s, i) => ({
            id: `replan-${Date.now()}-${i}`,
            description: s.description || s,
            agent: s.agent || 'coordinator',
            tools: Array.isArray(s.tools) ? s.tools : ['ai_think'],
            input: s.input || '',
            expected_output: s.expected_output || '',
            depends_on: [],
            status: 'pending',
            result: null,
            error: null,
            attempts: 0,
          }))
          // Remove remaining pending steps and add new ones
          plan.steps = [
            ...plan.steps.slice(0, stepIndex + 1),
            ...newSteps,
          ]
        } else {
          // Continue with next step anyway
        }
      } else {
        // Step succeeded
        step.status = 'done'
        step.result = result
        context.stepResults[step.id] = result
        context.messages.push({ role: 'assistant', content: `Step ${step.id} completed: ${JSON.stringify(result?.output || result).slice(0, 500)}` })
        emit({ type: 'step_done', stepId: step.id, result: sanitizeResult(result) })
        this.monitor.stepDone(taskId, step.id, result)
      }

      stepIndex++
    }

    // Final synthesis
    const finalResult = await this._synthesize(context, emit)
    emit({ type: 'execution_done', taskId, result: finalResult, duration: Date.now() - context.startedAt })
    this.monitor.taskDone(taskId, finalResult)

    return { ok: true, result: finalResult, context }
  }

  // ── Execute a single step ──────────────────────────────────────────────
  async _executeStep(step, context, emit) {
    const agentName = step.agent || 'coordinator'

    // Emit thinking
    emit({ type: 'agent_thinking', agent: agentName, step: step.id, description: step.description })

    // Use agent coordinator to route and execute
    const result = await this.coordinator.run({
      agentName,
      step,
      context,
      tools: this.tools,
      ai: this.ai,
      emit,
    })

    return result
  }

  // ── Build context for a step ───────────────────────────────────────────
  _buildStepContext(step, context) {
    const prevResults = step.depends_on
      .map(depId => context.stepResults[depId])
      .filter(Boolean)

    return {
      ...context,
      stepInput: step.input,
      previousResults: prevResults,
      allPreviousResults: Object.values(context.stepResults),
    }
  }

  // ── Final synthesis ────────────────────────────────────────────────────
  async _synthesize(context, emit) {
    emit({ type: 'synthesizing', message: 'Combining results...' })

    const stepSummaries = Object.entries(context.stepResults)
      .map(([id, result]) => `${id}: ${JSON.stringify(result?.output || result).slice(0, 300)}`)
      .join('\n')

    if (!stepSummaries) {
      return { summary: 'Task completed with no output', output: null }
    }

    try {
      const result = await this.ai({
        messages: [
          {
            role: 'system',
            content: 'You are a result synthesizer. Combine step outputs into a clear, complete final answer. Be concise but complete. Use markdown for formatting.',
          },
          {
            role: 'user',
            content: `Goal: ${context.goal}\n\nStep results:\n${stepSummaries}\n\nProvide the final synthesized answer:`,
          },
        ],
        query: context.goal,
        max_tokens: 2000,
      })

      return {
        summary: result?.content || 'Task completed',
        output: result?.content,
        stepResults: context.stepResults,
      }
    } catch {
      const allOutputs = Object.values(context.stepResults)
        .map(r => r?.output || JSON.stringify(r))
        .filter(Boolean)
        .join('\n\n')
      return { summary: allOutputs || 'Task completed', output: allOutputs }
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function sanitizeResult(result) {
  if (!result) return null
  const str = JSON.stringify(result)
  if (str.length > 2000) return { output: str.slice(0, 2000) + '…', truncated: true }
  return result
}
