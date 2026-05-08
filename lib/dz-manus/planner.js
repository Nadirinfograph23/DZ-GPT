/**
 * DZ-MANUS — Task Planner
 * Converts a user goal into a structured execution plan with steps.
 * Each step has: tool, params, description, dependsOn[], expected_output
 */

import { TOOL_DEFINITIONS } from './tools/index.js'

const PLANNER_SYSTEM = `أنت مخطط مهام ذكي (Task Planner) لنظام DZ-MANUS الذاتي.

مهمتك: تحويل هدف المستخدم إلى خطة تنفيذ دقيقة ومنظمة.

الأدوات المتاحة:
${TOOL_DEFINITIONS.map(t => `- ${t.name}: ${t.description}\n  المعاملات: ${t.params.join(', ')}`).join('\n')}

قواعد التخطيط:
1. اقسم المهمة إلى خطوات منطقية (3-8 خطوات كحد أقصى)
2. كل خطوة تستخدم أداة واحدة محددة
3. الخطوات يمكن أن تعتمد على نتائج خطوات سابقة (dependsOn)
4. كن دقيقاً في معاملات الأدوات
5. خطط للفشل: أضف خطوات بديلة إذا لزم

أرجع JSON فقط بهذا الشكل:
{
  "title": "عنوان الخطة",
  "goal": "وصف الهدف",
  "complexity": "low|medium|high",
  "estimated_steps": 5,
  "needs_approval": false,
  "steps": [
    {
      "id": 1,
      "description": "وصف الخطوة",
      "tool": "web_search",
      "params": {"query": "...", "limit": 5},
      "dependsOn": [],
      "expected_output": "قائمة نتائج بحث",
      "critical": true
    }
  ],
  "final_synthesis": "كيف سيتم تجميع النتائج في إجابة نهائية"
}`

const CRITIC_SYSTEM = `أنت ناقد خطط (Plan Critic). مهمتك مراجعة خطة تنفيذ والتحقق من:
1. هل الخطوات منطقية ومتسلسلة؟
2. هل الأدوات المختارة مناسبة؟
3. هل هناك خطوات زائدة أو ناقصة؟
4. هل المعاملات صحيحة؟

أرجع JSON: {"valid": true|false, "issues": [...], "improved_plan": {...} | null}`

/**
 * Generate an execution plan from a user goal
 * @param {string} goal - user's task goal
 * @param {object} context - optional context (sessionId, memories, etc.)
 * @param {function} aiGenerate - safeGenerateAI function
 * @returns {object} structured plan
 */
export async function planTask(goal, context = {}, aiGenerate) {
  const contextStr = context.memories?.length
    ? `\nسياق ذاكرة سابقة:\n${context.memories.map(m => `- ${m.text}`).join('\n')}`
    : ''

  const messages = [
    { role: 'system', content: PLANNER_SYSTEM },
    { role: 'user', content: `الهدف: ${goal}${contextStr}\n\nأنشئ خطة تنفيذ مفصلة.` },
  ]

  const result = await aiGenerate({ messages, query: `plan:${goal}`, max_tokens: 3000 })
  if (!result?.content) {
    return buildFallbackPlan(goal)
  }

  const plan = parseJsonPlan(result.content)
  if (!plan) return buildFallbackPlan(goal)

  // Validate and sanitize
  plan.steps = (plan.steps || []).map((s, i) => ({
    id:              s.id || i + 1,
    description:     s.description || `خطوة ${i + 1}`,
    tool:            s.tool || 'web_search',
    params:          s.params || {},
    dependsOn:       Array.isArray(s.dependsOn) ? s.dependsOn : [],
    expected_output: s.expected_output || '',
    critical:        s.critical !== false,
    status:          'pending',
    result:          null,
    error:           null,
    startTs:         null,
    endTs:           null,
    durationMs:      null,
  }))

  plan.createdAt = Date.now()
  plan.model = result.model
  return plan
}

/**
 * Optional plan critique pass — improves plan quality
 */
export async function critiquePlan(plan, aiGenerate) {
  if (!plan?.steps?.length) return plan

  try {
    const messages = [
      { role: 'system', content: CRITIC_SYSTEM },
      { role: 'user', content: `راجع هذه الخطة:\n${JSON.stringify(plan, null, 2)}` },
    ]
    const result = await aiGenerate({ messages, query: 'plan:critique', max_tokens: 2000 })
    if (!result?.content) return plan

    const critique = parseJsonPlan(result.content)
    if (critique?.valid === false && critique?.improved_plan) {
      console.log('[MANUS:Planner] Plan improved by critic')
      return { ...critique.improved_plan, _critiqued: true }
    }
  } catch {}

  return plan
}

/**
 * Replan from a specific failed step
 */
export async function replanFromStep(originalPlan, failedStepId, error, aiGenerate) {
  const messages = [
    { role: 'system', content: PLANNER_SYSTEM },
    {
      role: 'user',
      content: `الخطة الأصلية فشلت في الخطوة ${failedStepId}.\nالخطأ: ${error}\n\nالخطة الأصلية:\n${JSON.stringify(originalPlan.steps?.slice(0, failedStepId), null, 2)}\n\nأنشئ خطة بديلة للمكمل الباقي من: ${originalPlan.goal}`,
    },
  ]

  try {
    const result = await aiGenerate({ messages, query: 'plan:replan', max_tokens: 2000 })
    if (!result?.content) return null
    const newPlan = parseJsonPlan(result.content)
    if (newPlan?.steps?.length) {
      newPlan.steps = newPlan.steps.map((s, i) => ({ ...s, id: failedStepId + i, status: 'pending' }))
      return newPlan
    }
  } catch {}
  return null
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseJsonPlan(content) {
  if (!content) return null
  // Extract JSON block
  const jsonMatch = content.match(/```json\s*([\s\S]+?)\s*```/) ||
                    content.match(/```\s*([\s\S]+?)\s*```/) ||
                    content.match(/(\{[\s\S]+\})/)
  const raw = jsonMatch ? jsonMatch[1] : content.trim()
  try { return JSON.parse(raw) } catch { return null }
}

function buildFallbackPlan(goal) {
  return {
    title:           goal.slice(0, 60),
    goal,
    complexity:      'medium',
    estimated_steps: 3,
    needs_approval:  false,
    steps: [
      {
        id: 1, description: `البحث عن: ${goal}`,
        tool: 'web_search', params: { query: goal, limit: 6 },
        dependsOn: [], expected_output: 'نتائج بحث', critical: true,
        status: 'pending', result: null, error: null,
      },
      {
        id: 2, description: 'تحليل وتلخيص النتائج',
        tool: 'summarize', params: { instructions: `لخص المعلومات عن: ${goal}` },
        dependsOn: [1], expected_output: 'ملخص شامل', critical: true,
        status: 'pending', result: null, error: null,
      },
    ],
    final_synthesis: 'تجميع نتائج البحث في إجابة شاملة',
    _fallback:       true,
    createdAt:       Date.now(),
  }
}
