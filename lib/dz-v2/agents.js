// DZ Agent V2 — Multi-agent flow (Planner → Executor → QA).
// Pure logic; the AI generator and plugin host are injected so this module
// stays decoupled from server.js internals.

import { detectLanguage, languageInstruction, languageLabel } from './language.js'
import { selectPlugins, runPlugins, isRealTimeQuery } from './plugins.js'
import { recallSemantic, getShortTermContext } from './memory-store.js'
import { generateWithRetry, isValid } from './validator.js'
import { enrichQueryContext } from '../dz-unified-pipeline.js'

// ─── Planner ─────────────────────────────────────────────────────────────────
export function plan(query, { sessionId } = {}) {
  const lang = detectLanguage(query)
  const intent = classifyIntent(query)
  const realTime = isRealTimeQuery(query)

  // For real-time queries, boost maxTools so web-search always runs alongside news/weather/etc.
  const tools = selectPlugins(query, { maxTools: realTime ? 4 : 3 })

  // Ensure web-search is always included for real-time queries
  const hasWebSearch = tools.some(t => t.plugin.name === 'web-search')
  if (realTime && !hasWebSearch) {
    // Force-add web-search at the front with high priority
    const { REGISTRY } = getRegistry()
    const webSearch = REGISTRY && REGISTRY.get ? REGISTRY.get('web-search') : null
    if (webSearch) {
      tools.unshift({ plugin: webSearch, score: 0.95 })
      if (tools.length > 4) tools.pop()
    }
  }

  const steps = []
  if (realTime) {
    steps.push({ kind: 'search', description: 'MANDATORY: Run real-time web search first' })
  }
  if (tools.length) {
    steps.push({ kind: 'enrich', description: `Run tools: ${tools.map(t => t.plugin.name).join(', ')}` })
  }
  steps.push({ kind: 'reason', description: 'Synthesize answer from FRESH web context + tool outputs' })
  steps.push({ kind: 'validate', description: 'QA: empty / relevance / freshness / completeness' })

  return {
    lang,
    intent,
    steps,
    pluginsToRun: tools,
    sessionId: sessionId || null,
    realTime,
  }
}

// Fallback registry getter used only for force-injecting web-search plugin.
// Returns empty if module not fully initialized.
function getRegistry() {
  try {
    return { REGISTRY: null } // plugins.js manages its own registry
  } catch { return { REGISTRY: null } }
}

function classifyIntent(q) {
  const s = String(q || '').toLowerCase()
  if (/\b(code|build|create|fix|debug|refactor|app|website|api|كود|برمج|طور|اصنع|crée|construis)\b/i.test(s)) return 'dev'
  if (/\b(news|akhbar|أخبار|عاجل|actualit|info|breaking|today|latest|recent|حدث)\b/i.test(s)) return 'news'
  if (/\b(weather|météo|m[eé]teo|طقس)\b/i.test(s)) return 'weather'
  if (/\b(currency|dollar|euro|dinar|دينار|دولار|change)\b/i.test(s)) return 'finance'
  if (/\b(sport|match|football|كرة|دوري|league|championnat|score|result|winner|champion)\b/i.test(s)) return 'sports'
  if (/\b(quran|قرآن|سورة|آية)\b/i.test(s)) return 'quran'
  if (/\b(politics|election|president|minister|government|سياسة|انتخابات|رئيس|وزير|حكومة)\b/i.test(s)) return 'politics'
  if (/\b(celebrity|مشهور|فنان|ممثل|مغني|singer|actor)\b/i.test(s)) return 'celebrity'
  if (/\?$|\b(what|who|why|how|where|when|ما|من|كيف|أين|متى|لماذا|comment|pourquoi|où)\b/i.test(s)) return 'qa'
  return 'general'
}

// ─── Format search results for LLM context ───────────────────────────────────
function formatSearchResults(items) {
  if (!Array.isArray(items) || !items.length) return null
  return items
    .slice(0, 5) // top 5 only
    .map((item, i) => {
      const date = item.date ? ` [${item.date.slice(0, 10)}]` : ''
      const title = item.title ? `**${item.title}**` : ''
      const snippet = item.snippet || item.description || ''
      const url = item.url || item.link || ''
      return `${i + 1}.${date} ${title}\n${snippet}${url ? `\nSource: ${url}` : ''}`
    })
    .join('\n\n')
}

// ─── Executor ────────────────────────────────────────────────────────────────
export async function execute(query, planResult, { aiGenerate, sessionId, history = [] } = {}) {
  const { lang, pluginsToRun, realTime } = planResult

  // ── Unified pipeline enrichment ──────────────────────────────────────────
  const unified = enrichQueryContext(query, history)
  const intent  = unified.intent?.intent || planResult.intent

  // 1. Run tools in parallel (extended timeout for real-time queries)
  const toolResults = pluginsToRun.length
    ? await runPlugins(pluginsToRun, { query, lang, intent }, { timeoutMs: realTime ? 9000 : 6000 })
    : []

  // 1b. DEBUG log: which plugins ran and whether they succeeded
  console.log('[dz-agent-v2] plugins run:', toolResults.map(t => `${t.name}:${t.ok ? 'ok' : 'fail'}`).join(', '))

  // 1c. For real-time queries: if web-search returned no items, flag it
  const webSearchResult = toolResults.find(t => t.name === 'web-search')
  const webItems = webSearchResult?.ok ? (webSearchResult.data?.items || []) : []
  const hasWebData = webItems.length > 0

  if (realTime && !hasWebData) {
    console.warn('[dz-agent-v2] Real-time query but web-search returned 0 items. Answer may be outdated.')
  }

  // 2. Recall semantic memory + short-term context
  const [recalled, shortCtx] = await Promise.all([
    recallSemantic(query, { sessionId, topK: 2 }).catch(() => []),
    Promise.resolve(getShortTermContext(sessionId, 6)),
  ])

  // 3. Build system prompt with HARD GUARDRAIL for real-time queries
  const now = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  const sysParts = [
    `You are DZ Agent V2 — a senior, multilingual AI assistant for Algerian users. Today's date: ${now}.`,
    languageInstruction(lang),
    `Detected intent: ${intent}. Detected language: ${languageLabel(lang)}.`,
  ]

  // ── حقن كتلة التوحيد ──────────────────────────────────────────────────────
  if (unified.systemBlock) sysParts.push(unified.systemBlock)

  // HARD GUARDRAIL: real-time queries must use web data
  if (realTime) {
    sysParts.push(`🚨 REAL-TIME QUERY DETECTED — STRICT RULES:
1. You MUST base your answer PRIMARILY on the REAL-TIME WEB RESULTS provided in TOOL CONTEXT below.
2. Internal training knowledge is FORBIDDEN as the primary source for this query — it may be outdated.
3. If web data conflicts with your training, web data WINS. Always.
4. If no fresh web results are available, explicitly say "I couldn't find up-to-date information on this topic" — do NOT fabricate or use stale knowledge.
5. Always cite the date/source of information when available.
6. Prioritize the NEWEST results (highest date timestamp) first.`)
  }

  sysParts.push(`Rules:
- Never return an empty, vague, or placeholder answer.
- Use the provided TOOL CONTEXT when relevant — it contains REAL-TIME data.
- If you are uncertain, state what you do know and suggest the next step.
- For dev/coding intents: behave like a senior full-stack engineer (working code, brief explanation).
- For news/finance/weather/sports/politics: ALWAYS prefer the freshest data from TOOL CONTEXT.
- Match the user's language (${languageLabel(lang)}) and tone.`)

  // 4. Inject tool results — format web-search results specially for clarity
  if (toolResults.length) {
    const ctxParts = toolResults
      .filter(t => t.ok && t.data)
      .map(t => {
        if (t.name === 'web-search') {
          const formatted = formatSearchResults(t.data?.items || [])
          if (!formatted) return null
          return `[REAL-TIME WEB SEARCH RESULTS — Use these as primary source]\n${formatted}`
        }
        return `[TOOL:${t.name}] ${stringify(t.data).slice(0, 1500)}`
      })
      .filter(Boolean)
      .join('\n\n')
    if (ctxParts) sysParts.push(`TOOL CONTEXT (REAL-TIME DATA — Prioritize over training knowledge):\n${ctxParts}`)
  }

  if (recalled.length) {
    const mem = recalled
      .map(r => `Q(${r.lang}, ${r.score}): ${r.query}\nA: ${r.answer.slice(0, 300)}`)
      .join('\n---\n')
    sysParts.push(`SEMANTIC MEMORY (past context — use only if web data is unavailable):\n${mem}`)
  }

  const messages = [
    { role: 'system', content: sysParts.join('\n\n') },
    ...shortCtx.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: query },
  ]

  // 5. Generate with retry + validation
  const result = await generateWithRetry(
    async ({ attempt, lastError }) => {
      const sys = attempt > 1
        ? messages[0].content + `\n\nPREVIOUS ATTEMPT WAS REJECTED: ${lastError}. Please answer more concretely, stay on topic, and use the real-time data provided.`
        : messages[0].content
      const msgs = [{ role: 'system', content: sys }, ...messages.slice(1)]
      const r = await aiGenerate({ messages: msgs, query, max_tokens: 2400 })
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
    realTime: !!realTime,
    hasWebData,
  }
}

// ─── QA ──────────────────────────────────────────────────────────────────────
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
