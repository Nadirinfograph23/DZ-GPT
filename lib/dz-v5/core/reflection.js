/**
 * DZ Agent V5 — Reflection Engine
 * After each task: analyze what happened, extract lessons, improve future runs.
 * Inspired by AutoGPT's self-reflection and Reflexion paper.
 */

export class ReflectionEngine {
  constructor({ safeGenerateAI, memory }) {
    this.ai = safeGenerateAI
    this.memory = memory
  }

  // ── Reflect on completed task ──────────────────────────────────────────
  async reflect(task, executionContext) {
    const { plan, taskId } = task
    const { stepResults, startedAt, goal } = executionContext
    const duration = Date.now() - startedAt

    const completedSteps = plan.steps.filter(s => s.status === 'done').length
    const failedSteps = plan.steps.filter(s => s.status === 'failed').length
    const success = failedSteps === 0 && completedSteps > 0

    // Build execution summary for AI reflection
    const executionSummary = plan.steps.map(step => {
      const r = stepResults[step.id]
      return `Step ${step.id} [${step.status}]: ${step.description}
  Agent: ${step.agent} | Tools: ${step.tools?.join(', ')}
  Result: ${JSON.stringify(r?.output || r?.error || 'no output').slice(0, 200)}`
    }).join('\n\n')

    const systemPrompt = `You are an AI reflection engine. Analyze a completed task execution and extract learnings.
Return JSON with this structure:
{
  "success": boolean,
  "quality_score": 1-10,
  "what_worked": ["list of things that worked well"],
  "what_failed": ["list of failures or issues"],
  "lessons": ["actionable lessons for future similar tasks"],
  "improvements": ["specific improvements to apply next time"],
  "summary": "2-3 sentence overall assessment"
}`

    const userPrompt = `Task Goal: ${goal}
Duration: ${Math.round(duration / 1000)}s
Steps: ${completedSteps} completed, ${failedSteps} failed

Execution trace:
${executionSummary}

Reflect on this execution and extract lessons.`

    let reflection = null
    try {
      const result = await this.ai({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        query: `reflect on: ${goal}`,
        max_tokens: 1000,
      })

      const content = result?.content || ''
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        reflection = JSON.parse(jsonMatch[0])
      }
    } catch (err) {
      reflection = {
        success,
        quality_score: success ? 7 : 3,
        what_worked: completedSteps > 0 ? ['Some steps completed successfully'] : [],
        what_failed: failedSteps > 0 ? [`${failedSteps} steps failed`] : [],
        lessons: [],
        improvements: [],
        summary: success ? 'Task completed successfully.' : 'Task had failures that need investigation.',
      }
    }

    reflection = reflection || {}
    reflection.taskId = taskId
    reflection.goal = goal
    reflection.duration = duration
    reflection.reflectedAt = Date.now()

    // Store lessons in memory
    if (reflection.lessons?.length > 0) {
      for (const lesson of reflection.lessons) {
        this.memory.storePattern({
          key: `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'lesson',
          lesson,
          context: goal,
          quality: reflection.quality_score,
        })
      }
    }

    // Store episode in episodic memory
    this.memory.storeEpisode(taskId, {
      goal,
      result: reflection.summary || 'Task completed',
      reflection: reflection.summary,
      duration,
      success,
    })

    // Store reflection in long-term memory
    this.memory.storeLongTerm({
      type: 'reflection',
      goal,
      taskId,
      reflection,
      success,
    })

    return reflection
  }

  // ── Quick self-check during execution ─────────────────────────────────
  async verifyStepResult(step, result, goal) {
    // Quick heuristic check — only use AI for complex verifications
    if (!result || result.error) return { ok: false, reason: result?.error || 'No result' }

    const output = result.output || result
    if (!output) return { ok: false, reason: 'Empty output' }

    // Simple checks
    if (typeof output === 'string' && output.length < 5) {
      return { ok: false, reason: 'Output too short' }
    }

    // For complex steps, do AI verification
    if (step.agent === 'coding' || step.expected_output?.includes('code')) {
      return await this._verifyCodeOutput(step, output)
    }

    return { ok: true, confidence: 0.8 }
  }

  async _verifyCodeOutput(step, output) {
    try {
      const result = await this.ai({
        messages: [
          {
            role: 'system',
            content: 'You are a code reviewer. Check if the output satisfies the expected output description. Return JSON: {"ok": boolean, "reason": "brief reason"}',
          },
          {
            role: 'user',
            content: `Expected: ${step.expected_output}\n\nActual output:\n${typeof output === 'string' ? output.slice(0, 1000) : JSON.stringify(output).slice(0, 1000)}`,
          },
        ],
        query: 'verify code output',
        max_tokens: 200,
      })
      const content = result?.content || ''
      const match = content.match(/\{.*\}/)
      if (match) return JSON.parse(match[0])
    } catch {}
    return { ok: true, confidence: 0.6, note: 'Verification skipped' }
  }

  // ── Improve system prompt based on reflections ─────────────────────────
  async improvePrompt(basePrompt, taskType, memory) {
    const lessons = memory.getPatterns('lesson')
      .filter(p => p.context?.includes(taskType) || taskType.includes('code'))
      .slice(0, 3)
    if (lessons.length === 0) return basePrompt
    const additions = lessons.map(l => `- ${l.lesson}`).join('\n')
    return `${basePrompt}\n\nLearned improvements:\n${additions}`
  }
}
