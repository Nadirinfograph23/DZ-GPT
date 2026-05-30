/**
 * DZ Agent — Autonomous Reasoning Engine
 *
 * Implements 6 reasoning strategies that operate BEFORE the AI call
 * (by enriching system messages) and AFTER (via self-reflection).
 *
 * Strategies (activated per query complexity):
 *   [1] Chain-of-Thought (CoT)         — step-by-step reasoning injection
 *   [2] ReAct                          — structured Thought→Action→Observation
 *   [3] Tree-of-Thoughts (ToT)         — multi-path consideration for complex choices
 *   [4] Self-Reflection                — post-generation critique & revision
 *   [5] Task Decomposition             — breaks multi-step queries into sub-tasks
 *   [6] Multi-Agent Orchestration      — planner + executor + QA roles
 *
 * Integration: call `applyReasoning(messages, query, opts)` before safeGenerateAI().
 * Returns enriched messages — no extra AI calls for simple/moderate queries.
 * Self-reflection (extra AI call) only fires for `complex` + `multi_step` queries.
 *
 * Design principles:
 *   - Zero latency for simple queries (pass-through)
 *   - Minimal latency for moderate queries (prompt injection only)
 *   - Deep reasoning only when query genuinely requires it
 *   - No UI/frontend changes — pure backend reasoning layer
 */

// ══════════════════════════════════════════════════════════════════════════════
// COMPLEXITY CLASSIFIER
// ══════════════════════════════════════════════════════════════════════════════

const COMPLEXITY_PATTERNS = {
  // Multi-step / planning queries (عربي + دارجة + فرنسي)
  multi_step: [
    /خطة|plan\s+for|استراتيجية|strategy|roadmap|خارطة\s*طريق/i,
    /كيف\s+أ.*و.*و|how\s+to.*and.*and/i,
    /خطوة.*خطوة|step\s+by\s+step|étape\s+par\s+étape/i,
    /أنشئ.*ثم.*ثم|create.*then.*then/i,
    /أولاً.*ثانياً.*ثالثاً|first.*second.*third/i,
    // دارجة: خطوات مرحلية
    /كيفاش\s+ندير.*و.*و|دير.*بعد.*بعد/i,
    /خطوات\s+(تاع|باش|علاش)|من\s+وين\s+نبدا.*وكيفاش/i,
    /نقطة.*نقطة|مرحلة.*مرحلة|واحدة\s+واحدة/i,
  ],
  // Deep analysis / reasoning (عربي + دارجة)
  complex: [
    /حلّل|analyze|analyse|تحليل\s+معمّق|deep\s+analysis/i,
    /قارن.*بين|compare.*between|comparaison\s+entre/i,
    /ما\s+هو\s+أفضل|what\s+is\s+best|meilleur\s+choix/i,
    /لماذا.*سبب|why.*reason|pourquoi.*raison/i,
    /كيف\s+يعمل.*تفصيل|how\s+does.*detail/i,
    /تقييم|evaluate|assessment|دراسة\s+جدوى|feasibility/i,
    /أثبت|prove|demonstrate|برهن/i,
    // دارجة: تحليل ومقارنة
    /أنهي\s+أحسن|أنهو\s+أحسن|واش\s+أحسن.*ولا/i,
    /قارن.*بين|الفرق\s+بين.*و|علاش\s+هذا\s+أحسن\s+من/i,
    /فسّرلي\s+بالتفصيل|شرحلي\s+من\s+الأول|وضّحلي\s+مزيان/i,
    /علاش.*ما.*ش.*و.*ما.*ش|لماذا.*لا.*و.*لا/i,
  ],
  // Research / factual queries (عربي + دارجة + فرنسي)
  research: [
    /ابحث|research|recherche|اجمع\s+معلومات/i,
    /ما\s+آخر|latest|recent|أحدث\s+معلومات/i,
    /اشرح.*بالتفصيل|explain.*in\s+detail|explique.*en\s+détail/i,
    /تقرير\s+عن|report\s+on|rapport\s+sur/i,
    // دارجة: استفسارات تحتاج جمع معلومات
    /دور.*علي\s+معلومات|جمعلي.*معلومات|عطيني.*معلومات.*كاملة/i,
    /واش\s+صحيح\s+إن|واش\s+صحيح\s+بلي|واش\s+هو\s+الصح/i,
    /شرحلي\s+(تاريخ|كل\s+شي|قصة|سيرة|حياة)/i,
  ],
  // Code generation / debugging (عربي + دارجة + فرانكو)
  code: [
    /اكتب\s+كود|write\s+code|écris\s+un\s+code/i,
    /ابني|build\s+me|construis/i,
    /أصلح|fix\s+the\s+bug|debug|خطأ\s+في\s+الكود/i,
    /برنامج\s+كامل|full\s+program|application\s+complète/i,
    // دارجة: كود وبرمجة
    /دير\s+لي\s+(كود|برنامج|موقع|تطبيق|سكريبت)/i,
    /كيفاش\s+ندير\s+(كود|برنامج|موقع|تطبيق|loop|function)/i,
    /صلحلي\s+(الكود|البرنامج|الخطأ|الباغ)|علاش\s+ما\s+يخدمش\s+الكود/i,
    /dir\s+(li\s+)?(code|website|app|programme)|kteb\s+code/i,
  ],
}

// ── كشف كثافة الدارجة — جملة قصيرة لكن معناها عميق ──────────────────────────
const DZ_DENSITY_PATTERNS = [
  /كيفاش\s+ندير/i,           // كيفاش ندير X → how to do X (procedure needed)
  /كيفاش\s+(نسجل|نبدا|نتعلم|نكتب|نبني|نشغّل|نحل)/i,
  /علاش\s+ما\s+\S+ش/i,       // علاش ما يخدمش → why X is not working (debug)
  /علاه\s+ما\s+\S+ش/i,
  /واش\s+\S+\s+ولا\s+\S+/i,   // واش X ولا Y → comparison
  /أنهي\s+أحسن/i,            // أنهي أحسن → which is better (comparison)
  /انهي\s+أحسن/i,
  /من\s+وين\s+نبدا/i,         // من وين نبدا → where to start (path needed)
  /شرحلي\s+(كيفاش|علاش|واش)/i, // شرحلي كيفاش → explain how
  /فسّرلي\s+\S+/i,            // فسّرلي X → explain X
  /وضّحلي\s+\S+/i,            // وضّحلي X → clarify X
  /شكون\s+\S+\s+و\s+واش/i,   // شكون X وواش → who is X and what (research)
  /دير\s+لي\s+(موقع|تطبيق|برنامج|سكريبت)/i, // دير لي موقع → build me (code)
]

/**
 * Classify query complexity.
 * Returns: 'simple' | 'moderate' | 'complex' | 'multi_step' | 'research' | 'code'
 *
 * دارجة الجزائرية: الجمل قصيرة لكن كثيفة المعنى — نفحص الكثافة بمعزل عن عدد الكلمات
 */
export function classifyComplexity(query) {
  if (!query || query.trim().length < 3) return 'simple'
  const wordCount = query.trim().split(/\s+/).length

  // ① فحص أنماط الدارجة الكثيفة أولاً — حتى لو الجملة قصيرة (< 6 كلمات)
  for (const [level, patterns] of Object.entries(COMPLEXITY_PATTERNS)) {
    if (patterns.some(p => p.test(query))) return level
  }

  // ② كشف الكثافة الدارجة: جمل قصيرة (4-8 كلمات) لكن تحتاج تفكيراً
  if (wordCount >= 4 && wordCount <= 10) {
    if (DZ_DENSITY_PATTERNS.some(p => p.test(query))) return 'moderate'
  }

  // ③ جمل قصيرة جداً → بسيط
  if (wordCount < 6) return 'simple'

  // ④ معتدل بعدد الكلمات
  if (wordCount >= 15) return 'moderate'

  return 'simple'
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 1 — CHAIN OF THOUGHT (CoT)
// Injects explicit step-by-step reasoning instruction into system prompt.
// Zero extra AI calls — pure prompt enrichment.
// ══════════════════════════════════════════════════════════════════════════════

const COT_BLOCK = `## Chain-of-Thought Reasoning Protocol (mandatory for this query)

Before writing your final answer, internally execute this exact reasoning sequence:

**[THINK]**
1. What is the user EXPLICITLY asking for?
2. What do they IMPLICITLY need (unstated goal)?
3. What information do I have vs. what is missing?
4. What are the 2-3 most likely correct interpretations?

**[PLAN]**
5. Break the query into N sub-questions (list them).
6. For each sub-question: what source / knowledge do I use?
7. What is the logical order of answering them?

**[DRAFT]**
8. Generate a draft answer for each sub-question.
9. Are there contradictions between sub-answers? Resolve them.

**[VALIDATE]**
10. Does my draft fully answer question (1) AND need (2)?
11. Is any fact uncertain? Label it [غير مؤكد].
12. Is the answer in the correct language and format?

**[OUTPUT]**
Only after completing the above: write your final user-facing response.
Do NOT show the THINK/PLAN/DRAFT steps — output only the final answer.`

function injectCoT(messages) {
  const sys = messages.find(m => m.role === 'system')
  if (!sys) return messages
  return messages.map(m =>
    m.role === 'system'
      ? { ...m, content: m.content + '\n\n' + COT_BLOCK }
      : m
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 2 — REACT (Reasoning + Acting)
// Instructs the model to structure reasoning as Thought→Action→Observation→Answer.
// Zero extra AI calls — pure prompt enrichment.
// ══════════════════════════════════════════════════════════════════════════════

const REACT_BLOCK = `## ReAct Reasoning Protocol (mandatory for research/multi-step queries)

Structure your internal reasoning as a ReAct loop before outputting:

**Thought 1:** What do I know about this topic? What gaps exist?
**Action 1:** [search | recall | compute | none] — which tool/source would fill the gap?
**Observation 1:** What do the retrieved results or knowledge say?

**Thought 2:** Based on Observation 1, what can I now conclude? What remains unclear?
**Action 2:** [additional source | cross-check | synthesis | none]
**Observation 2:** Result of Action 2.

**Thought 3 (Final):** Synthesize all observations. Is my conclusion well-supported?
**Answer:** [Output only this to the user — the above is internal reasoning]

Rules:
- If search results are provided in context, treat them as Observation 1.
- If results are missing, explicitly state [بحث مطلوب] / [search required].
- Never present information from Thought/Action steps as verified facts unless from an Observation.`

function injectReAct(messages) {
  const sys = messages.find(m => m.role === 'system')
  if (!sys) return messages
  return messages.map(m =>
    m.role === 'system'
      ? { ...m, content: m.content + '\n\n' + REACT_BLOCK }
      : m
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 3 — TREE OF THOUGHTS (ToT)
// For decision/comparison queries — considers multiple paths before selecting best.
// Zero extra AI calls — pure prompt enrichment.
// ══════════════════════════════════════════════════════════════════════════════

const TOT_BLOCK = `## Tree-of-Thoughts Protocol (mandatory for comparison/decision queries)

Internally consider MULTIPLE solution paths before answering:

**Branch A:** [Most conventional / mainstream approach]
- Pros: ...
- Cons: ...
- Confidence: X%

**Branch B:** [Alternative approach or interpretation]
- Pros: ...
- Cons: ...
- Confidence: X%

**Branch C:** [Edge case or nuanced approach — if relevant]
- Pros: ...
- Cons: ...
- Confidence: X%

**Selection:** Choose the branch (or hybrid) with highest confidence AND best fit for user's actual need.

Output only the selected answer — not the branch analysis. If branches are roughly equal, present a brief comparison table.`

function injectToT(messages) {
  const sys = messages.find(m => m.role === 'system')
  if (!sys) return messages
  return messages.map(m =>
    m.role === 'system'
      ? { ...m, content: m.content + '\n\n' + TOT_BLOCK }
      : m
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 4 — TASK DECOMPOSITION
// For multi-step queries — decomposes into sub-tasks and plans execution order.
// ══════════════════════════════════════════════════════════════════════════════

const DECOMP_BLOCK = `## Task Decomposition Protocol (mandatory for multi-step requests)

Before answering, decompose the user's request into atomic sub-tasks:

**Task Breakdown:**
T1: [First atomic task — define what "done" looks like]
T2: [Second atomic task — depends on T1? yes/no]
T3: [Third atomic task — parallel or sequential?]
... (add as many as needed)

**Execution Order:**
- Sequential if T(n+1) depends on T(n)
- Parallel if tasks are independent

**Completion Check:**
After completing all sub-tasks: does the combined output fully answer the user's request?
If no: identify the gap and fill it before outputting.

**Output:** Present the completed work as a unified, coherent answer — not as a list of sub-task results.`

function injectDecomposition(messages) {
  const sys = messages.find(m => m.role === 'system')
  if (!sys) return messages
  return messages.map(m =>
    m.role === 'system'
      ? { ...m, content: m.content + '\n\n' + DECOMP_BLOCK }
      : m
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 5 — MULTI-AGENT ORCHESTRATION
// Simulates specialized agent roles within a single model call.
// ══════════════════════════════════════════════════════════════════════════════

const MULTI_AGENT_BLOCK = `## Multi-Agent Orchestration (internal simulation)

Internally simulate the following specialized agents working in sequence:

**🔎 RESEARCHER Agent:**
- Identify all relevant facts, data, and sources for this query.
- Flag any information that is uncertain or potentially outdated.
- Output: [Fact inventory with confidence levels]

**🧠 ANALYST Agent:**
- Receive RESEARCHER's output.
- Apply domain expertise to interpret and contextualize the facts.
- Identify patterns, implications, and key insights.
- Output: [Structured analysis]

**✍️ WRITER Agent:**
- Receive ANALYST's output.
- Format the response for the user's language, tone, and technical level.
- Apply DZ Agent formatting rules (Markdown, RTL, tables, citations).
- Output: [Final user-facing response]

**🔍 QA Agent (final gate):**
- Check: Is the response complete, accurate, well-formatted, and free of hallucinations?
- If any check fails: send back to the responsible agent for correction.
- Only when all checks pass: release the response.

Present only the WRITER's final output — internal agent work stays hidden.`

function injectMultiAgent(messages) {
  const sys = messages.find(m => m.role === 'system')
  if (!sys) return messages
  return messages.map(m =>
    m.role === 'system'
      ? { ...m, content: m.content + '\n\n' + MULTI_AGENT_BLOCK }
      : m
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY 6 — SELF-REFLECTION (post-generation)
// Makes a second lightweight AI call to critique and improve the first answer.
// Only activated for `complex` and `multi_step` queries.
// ══════════════════════════════════════════════════════════════════════════════

const REFLECTION_SYSTEM = `أنت DZ Agent QA — مراجع متخصص في جودة الإجابات.
مهمتك: تقييم إجابة AI ومراجعتها، ثم إنتاج نسخة محسّنة.

قواعد التقييم:
- هل أجابت الإجابة فعلاً على السؤال المطروح؟
- هل توجد معلومات مخترعة أو غير مؤكدة؟
- هل الإجابة مكتملة أم ناقصة؟
- هل الصياغة واضحة ومنظمة؟

إذا كانت الإجابة جيدة: أعدها كما هي بدون تغيير.
إذا احتاجت تحسيناً: أنتج نسخة محسّنة مع الحفاظ على نفس اللغة والتنسيق.
لا تضف تعليقات عن عملية المراجعة — أخرج الإجابة النهائية فقط.`

/**
 * Self-reflection pass — calls AI again to critique and improve the answer.
 * Only used for complex queries. Returns improved content or original if reflection fails.
 *
 * @param {string} originalQuery  - The user's original question
 * @param {string} draftAnswer    - The AI's first-pass answer
 * @param {Function} genFn        - Async function (messages) => { content, model }
 * @returns {Promise<string>}     - Improved answer (or original on failure)
 */
export async function selfReflect(originalQuery, draftAnswer, genFn) {
  if (!draftAnswer || !genFn) return draftAnswer
  try {
    const reflectionMessages = [
      { role: 'system', content: REFLECTION_SYSTEM },
      {
        role: 'user',
        content: `السؤال الأصلي:\n${originalQuery}\n\nالإجابة المقترحة:\n${draftAnswer}\n\nراجع هذه الإجابة وأنتج نسخة نهائية محسّنة:`,
      },
    ]
    const result = await genFn(reflectionMessages)
    if (result?.content && result.content.length > 50) {
      console.log(`[Reasoning] ✓ Self-reflection improved answer (model=${result.model})`)
      return result.content
    }
  } catch (err) {
    console.warn(`[Reasoning] Self-reflection failed: ${err.message}`)
  }
  return draftAnswer
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE — applyReasoning()
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Apply the appropriate reasoning strategy to the messages array.
 * Called BEFORE safeGenerateAI() — enriches the system prompt.
 *
 * @param {Array}  messages  - Original messages array (system + history + user)
 * @param {string} query     - The current user query (last user message)
 * @param {Object} opts
 * @param {string} opts.intent    - Detected intent ('news'|'code'|'general'|...)
 * @param {boolean} opts.hasSearch - Whether search results are in context
 * @returns {{ messages: Array, strategy: string, complexity: string, needsReflection: boolean }}
 */
export function applyReasoning(messages, query, opts = {}) {
  const { intent = 'general', hasSearch = false } = opts

  const complexity = classifyComplexity(query)

  // Simple queries: no reasoning overhead — pass through immediately
  if (complexity === 'simple') {
    return { messages, strategy: 'passthrough', complexity, needsReflection: false }
  }

  let enriched = messages
  let strategy = 'none'
  let needsReflection = false

  switch (complexity) {
    case 'multi_step':
      // Multi-step: decompose + CoT + multi-agent
      enriched = injectDecomposition(enriched)
      enriched = injectCoT(enriched)
      enriched = injectMultiAgent(enriched)
      strategy = 'decompose+cot+multi_agent'
      needsReflection = true
      break

    case 'complex':
      // Complex analysis/comparison: CoT + ToT (if comparison) + reflection
      enriched = injectCoT(enriched)
      const isComparison = /قارن|compare|مقارنة|الفرق\s+بين|difference\s+between|vs\./i.test(query)
      if (isComparison) {
        enriched = injectToT(enriched)
        strategy = 'cot+tot'
      } else {
        strategy = 'cot'
      }
      needsReflection = true
      break

    case 'research':
      // Research queries: ReAct + CoT (when search context available)
      if (hasSearch) {
        enriched = injectReAct(enriched)
        enriched = injectCoT(enriched)
        strategy = 'react+cot'
      } else {
        enriched = injectCoT(enriched)
        strategy = 'cot'
      }
      needsReflection = false
      break

    case 'code':
      // Code queries: CoT + multi-agent QA
      enriched = injectCoT(enriched)
      enriched = injectMultiAgent(enriched)
      strategy = 'cot+multi_agent'
      needsReflection = false
      break

    case 'moderate':
    default:
      // Moderate: lightweight CoT injection only
      enriched = injectCoT(enriched)
      strategy = 'cot'
      needsReflection = false
      break
  }

  console.log(`[Reasoning] complexity=${complexity} strategy=${strategy} reflect=${needsReflection} intent=${intent}`)

  return { messages: enriched, strategy, complexity, needsReflection }
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

export default {
  applyReasoning,
  selfReflect,
  classifyComplexity,
}
