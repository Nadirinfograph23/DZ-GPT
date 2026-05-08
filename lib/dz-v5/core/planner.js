/**
 * DZ Agent V5 — Planner
 * Converts a user goal into a structured multi-step execution plan.
 * Inspired by Manus/Devin/AutoGPT planning loops.
 */

const PLAN_SCHEMA = `{
  "goal": "string — restate the user goal clearly",
  "complexity": "simple|medium|complex",
  "steps": [
    {
      "id": "step-1",
      "description": "what to do",
      "agent": "coordinator|coding|research|web|file|devops|reviewer",
      "tools": ["web_search", "code_exec", "browser", "github", "file_read", "file_write"],
      "input": "what data/context this step needs",
      "expected_output": "what this step should produce",
      "depends_on": []
    }
  ],
  "success_criteria": "how to know the task is complete",
  "estimated_steps": 3
}`

const AGENT_CAPABILITIES = {
  coordinator: 'orchestrates other agents, makes decisions, synthesizes results',
  coding: 'writes, edits, debugs, refactors code in any language',
  research: 'searches the web, reads URLs, synthesizes information',
  web: 'browses websites, fills forms, extracts data from pages',
  file: 'reads, writes, creates, deletes files in the workspace',
  devops: 'runs commands, manages deployments, handles CI/CD',
  reviewer: 'reviews code or content for quality, security, correctness',
}

const AVAILABLE_TOOLS = [
  'web_search — search the internet for current information',
  'browser — navigate and interact with websites',
  'code_exec — execute code in a sandboxed environment',
  'github — interact with GitHub repos (read files, create PRs, etc.)',
  'file_read — read files from the workspace',
  'file_write — write files to the workspace',
  'ai_think — use AI reasoning without external tools',
  'memory_search — search past tasks and learnings',
  'youtube_search — search YouTube videos',
  'image_understand — analyze and understand images',
]

export async function createPlan(goal, safeGenerateAI, context = {}) {
  const systemPrompt = `You are an expert AI task planner similar to Manus, Devin, and OpenHands.
Your job is to decompose a user goal into a precise, executable step-by-step plan.

Available agents:
${Object.entries(AGENT_CAPABILITIES).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Available tools:
${AVAILABLE_TOOLS.join('\n')}

Rules:
1. Keep plans minimal — use the fewest steps needed
2. Simple tasks = 1-3 steps. Medium = 3-6. Complex = 6-10 max.
3. Each step must be concrete and actionable
4. Specify only tools that will actually be needed
5. Set depends_on correctly for parallel vs sequential execution
6. Return ONLY valid JSON matching this schema — no markdown:
${PLAN_SCHEMA}`

  const userPrompt = `Goal: ${goal}
${context.pastContext ? `\nRelevant past context:\n${context.pastContext}` : ''}
${context.userPrefs ? `\nUser preferences: ${context.userPrefs}` : ''}

Create a minimal, executable plan to achieve this goal.`

  try {
    const result = await safeGenerateAI({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      query: goal,
      max_tokens: 2000,
    })

    const content = result?.content || ''
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in planner response')

    const plan = JSON.parse(jsonMatch[0])
    plan.id = `plan-${Date.now()}`
    plan.createdAt = Date.now()
    plan.goal = goal
    plan.status = 'pending'

    // Validate structure
    if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
      throw new Error('Invalid plan: no steps')
    }

    // Ensure step IDs
    plan.steps = plan.steps.map((step, i) => ({
      id: step.id || `step-${i + 1}`,
      description: step.description || 'Execute step',
      agent: step.agent || 'coordinator',
      tools: Array.isArray(step.tools) ? step.tools : [],
      input: step.input || '',
      expected_output: step.expected_output || '',
      depends_on: Array.isArray(step.depends_on) ? step.depends_on : [],
      status: 'pending',
      result: null,
      error: null,
      attempts: 0,
    }))

    return { ok: true, plan }
  } catch (err) {
    // Fallback: create a simple 1-step plan
    const fallback = createFallbackPlan(goal)
    return { ok: true, plan: fallback, fallback: true, error: err.message }
  }
}

export async function replanFromFailure(originalPlan, failedStep, error, safeGenerateAI) {
  const completedSteps = originalPlan.steps.filter(s => s.status === 'done')
  const remainingSteps = originalPlan.steps.filter(s => s.status === 'pending' || s.status === 'failed')

  const systemPrompt = `You are an AI replanner. A step in the execution plan failed.
Analyze the failure and create a revised plan for the remaining steps.
Return ONLY valid JSON with a "steps" array.`

  const userPrompt = `Original goal: ${originalPlan.goal}

Completed steps: ${completedSteps.map(s => `- ${s.description}: ${JSON.stringify(s.result)?.slice(0, 200)}`).join('\n')}

Failed step: ${failedStep.description}
Error: ${error}

Remaining steps: ${remainingSteps.map(s => s.description).join(', ')}

Create a revised approach. Keep it simple and practical.`

  try {
    const result = await safeGenerateAI({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      query: `replan after failure: ${error}`,
      max_tokens: 1500,
    })

    const content = result?.content || ''
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { ok: false }

    const revised = JSON.parse(jsonMatch[0])
    return { ok: true, newSteps: revised.steps || [] }
  } catch {
    return { ok: false }
  }
}

function createFallbackPlan(goal) {
  return {
    id: `plan-${Date.now()}`,
    goal,
    complexity: 'simple',
    status: 'pending',
    createdAt: Date.now(),
    steps: [
      {
        id: 'step-1',
        description: `Research and analyze: ${goal}`,
        agent: 'research',
        tools: ['web_search', 'ai_think'],
        input: goal,
        expected_output: 'Analysis and answer',
        depends_on: [],
        status: 'pending',
        result: null,
        error: null,
        attempts: 0,
      },
    ],
    success_criteria: 'User goal is addressed',
    estimated_steps: 1,
  }
}
