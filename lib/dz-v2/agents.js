// DZ Agent V2 — Multi-agent flow (Planner → Executor → QA).
// Pure logic; the AI generator and plugin host are injected so this module
// stays decoupled from server.js internals.

import { detectLanguage, languageInstruction, languageLabel } from './language.js'
import { selectPlugins, runPlugins } from './plugins.js'
import { recallSemantic, getShortTermContext } from './memory-store.js'
import { generateWithRetry, isValid } from './validator.js'

// ─── Planner ─────────────────────────────────────────────────────────────────
// Lightweight intent + step planning. Returns:
//   { lang, intent, steps:[{kind, description}], pluginsToRun:[...] }
//
// "kind" ∈ 'enrich' (plugin call) | 'reason' (LLM step) | 'validate'
export function plan(query, { sessionId } = {}) {
  const lang = detectLanguage(query)
  const intent = classifyIntent(query)
  const tools = selectPlugins(query, { maxTools: 3 })

  const steps = []
  if (tools.length) {
    steps.push({ kind: 'enrich', description: `Run tools: ${tools.map(t => t.plugin.name).join(', ')}` })
  }
  steps.push({ kind: 'reason', description: 'Synthesize answer from context + tool outputs' })
  steps.push({ kind: 'validate', description: 'QA: empty / relevance / completeness' })

  return {
    lang,
    intent,
    steps,
    pluginsToRun: tools, // [{ plugin, score }]
    sessionId: sessionId || null,
  }
}

function classifyIntent(q) {
  const s = String(q || '').toLowerCase()
  if (/\b(code|build|create|fix|debug|refactor|app|website|api|كود|برمج|طور|اصنع|crée|construis)\b/i.test(s)) return 'dev'
  if (/\b(news|akhbar|أخبار|عاجل|actualit|info)\b/i.test(s)) return 'news'
  if (/\b(weather|météo|m[eé]teo|طقس)\b/i.test(s)) return 'weather'
  if (/\b(currency|dollar|euro|dinar|دينار|دولار|change)\b/i.test(s)) return 'finance'
  if (/\b(sport|match|football|كرة|دوري|league|championnat)\b/i.test(s)) return 'sports'
  if (/\b(quran|قرآن|سورة|آية)\b/i.test(s)) return 'quran'
  if (/\?$|\b(what|who|why|how|where|when|ما|من|كيف|أين|متى|لماذا|comment|pourquoi|où)\b/i.test(s)) return 'qa'
  return 'general'
}

// ─── Executor ────────────────────────────────────────────────────────────────
// Runs the plan: gathers tool outputs, builds a context-rich prompt, calls
// the AI generator, then hands off to QA. `aiGenerate` is the injected
// `safeGenerateAI`-style fn from server.js.
export async function execute(query, planResult, { aiGenerate, sessionId } = {}) {
  const { lang, intent, pluginsToRun } = planResult

  // 1. Run tools in parallel
  const toolResults = pluginsToRun.length
    ? await runPlugins(pluginsToRun, { query, lang, intent }, { timeoutMs: 6000 })
    : []

  // 2. Recall semantic memory + short-term context
  const [recalled, shortCtx] = await Promise.all([
    recallSemantic(query, { sessionId, topK: 2 }).catch(() => []),
    Promise.resolve(getShortTermContext(sessionId, 6)),
  ])

  // 3. Build messages
  const sysParts = [
    `You are DZ Agent V2 — a senior, multilingual AI assistant for Algerian users.`,
    languageInstruction(lang),
    `Detected intent: ${intent}. Detected language: ${languageLabel(lang)}.`,
    `Rules:
- Never return an empty, vague, or placeholder answer.
- Use the provided TOOL CONTEXT and MEMORY when relevant.
- If you are uncertain, state what you do know and suggest the next step.
- For dev/coding intents: behave like a senior full-stack engineer (working code, brief explanation).
- For news/finance/weather/sports: prefer the freshest data from TOOL CONTEXT.
- Match the user's language (${languageLabel(lang)}) and tone.`,
  ]

  if (toolResults.length) {
    const ctx = toolResults
      .filter(t => t.ok && t.data)
      .map(t => `[TOOL:${t.name}] ${stringify(t.data).slice(0, 1500)}`)
      .join('\n\n')
    if (ctx) sysParts.push(`TOOL CONTEXT:\n${ctx}`)
  }

  if (recalled.length) {
    const mem = recalled
      .map(r => `Q(${r.lang}, ${r.score}): ${r.query}\nA: ${r.answer.slice(0, 300)}`)
      .join('\n---\n')
    sysParts.push(`SEMANTIC MEMORY (similar past turns):\n${mem}`)
  }

  const messages = [
    { role: 'system', content: sysParts.join('\n\n') },
    ...shortCtx.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: query },
  ]

  // 4. Generate with retry + validation
  const result = await generateWithRetry(
    async ({ attempt, lastError }) => {
      const sys = attempt > 1
        ? messages[0].content + `\n\nPREVIOUS ATTEMPT WAS REJECTED: ${lastError}. Please answer more concretely and stay on the user's topic.`
        : messages[0].content
      const msgs = [{ role: 'system', content: sys }, ...messages.slice(1)]
      const r = await aiGenerate({ messages: msgs, query, max_tokens: 2200 })
      return r?.content || null
    },
    { query, maxAttempts: 3, minLen: 20, minRelevance: 0 },
  )

  return {
    content: result.content,
    attempts: result.attempts,
    rejectedReason: result.rejectedReason,
    valid: !!result.content && isValid(result.content, query).ok,
    plugins: toolResults.map(t => ({ name: t.name, ok: t.ok, score: t.score })),
    recalled: recalled.length,
    lang,
    intent,
  }
}

// ─── QA ──────────────────────────────────────────────────────────────────────
// Final guard. Returns either the validated answer or a graceful localized
// fallback so the user never gets nothing.
export function qa(execResult, query) {
  const { content, lang, valid, rejectedReason } = execResult
  if (valid && content) return { ok: true, content, lang, rejectedReason: null }
  const fallback = {
    ar: `لم أستطع تكوين إجابة موثوقة الآن لسؤالك: "${truncate(query, 80)}".\nحاول إعادة صياغة السؤال أو إضافة تفاصيل، وسأجيبك مباشرة.`,
    fr: `Je n'ai pas pu produire une réponse fiable pour votre question : « ${truncate(query, 80)} ».\nReformulez ou ajoutez plus de détails et je répondrai immédiatement.`,
    en: `I couldn't produce a reliable answer for: "${truncate(query, 80)}".\nTry rephrasing or adding details and I'll respond right away.`,
  }
  return { ok: false, content: fallback[lang] || fallback.ar, lang, rejectedReason }
}

function truncate(s, n) {
  s = String(s || '')
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function stringify(v) {
  try {
    if (typeof v === 'string') return v
    return JSON.stringify(v)
  } catch { return String(v) }
}
