// DZ Agent V2 — Plugin (tool) registry.
// Each plugin = { name, description, langTags, match(query) → score 0..1, run(ctx) → result }.
// Lightweight: no LLM tool-calling needed; the planner calls match() to decide
// which tools to invoke for the given query, then forwards results to the
// executor as enrichment context.

const REGISTRY = new Map()

export function registerPlugin(plugin) {
  if (!plugin || !plugin.name) throw new Error('plugin requires a name')
  REGISTRY.set(plugin.name, plugin)
}

export function listPlugins() {
  return Array.from(REGISTRY.values()).map(p => ({
    name: p.name,
    description: p.description || '',
    langTags: p.langTags || [],
  }))
}

// Score every plugin against the query. Returns plugins with score > 0,
// sorted descending. Caps at maxTools to avoid running too many.
export function selectPlugins(query, { maxTools = 4, threshold = 0.25 } = {}) {
  const scored = []
  for (const p of REGISTRY.values()) {
    let score = 0
    try { score = Number(p.match(query) || 0) } catch {}
    if (score >= threshold) scored.push({ plugin: p, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxTools)
}

// Run all selected plugins in parallel with a per-tool timeout.
export async function runPlugins(selected, ctx, { timeoutMs = 7000 } = {}) {
  const tasks = selected.map(({ plugin, score }) => withTimeout(
    Promise.resolve().then(() => plugin.run(ctx)).then(
      data => ({ name: plugin.name, score, ok: true, data }),
      err  => ({ name: plugin.name, score, ok: false, error: err?.message || String(err) }),
    ),
    timeoutMs,
    plugin.name,
  ))
  return Promise.all(tasks)
}

function withTimeout(promise, ms, name) {
  return Promise.race([
    promise,
    new Promise(resolve =>
      setTimeout(() => resolve({ name, ok: false, error: `timeout(${ms}ms)` }), ms),
    ),
  ])
}

// ─── Real-time intent detection helper ───────────────────────────────────────
// Returns true if the query is about real-world recent events that need fresh data.
export function isRealTimeQuery(q) {
  return /\b(news|akhbar|أخبار|آخر|اليوم|عاجل|اخبار|actualit[eé]|info|today|breaking|مستجدات|latest|recent|حدث|حوادث|حادثة|وفاة|توفي|قتل|اعتقل|أطلق|سقط|فاز|خسر|نتيجة|نتائج|ماذا حدث|ما الجديد|سياسة|رياضة|مباراة|كأس|دوري|منتخب|مشهور|فنان|ممثل|مغني|صحيفة|جريدة|تقرير|ميزانية|قانون|مرسوم|تصريح|political|election|match|score|tournament|champion|celebrity|singer|actor|accident|earthquake|flood|fire|attack|conflict|war|peace|summit|president|minister|government|parliament|senate|congress|protest|strike|démission|manifestation|séisme|inondation|attentat|election|résultats?|palmarès)\b/i.test(q)
}

// ─── Built-in plugins ────────────────────────────────────────────────────────
// Each plugin uses simple keyword scoring for match() and reuses existing
// V1 endpoints/internals via the `host` callbacks injected at mount time.

export function installDefaultPlugins(host) {
  // host = { fetchNews, fetchCurrency, fetchWeather, fetchWebSearch, fetchGithub }

  registerPlugin({
    name: 'news',
    description: 'Algerian + global breaking news (RSS / Google News / djazairess / lfp.dz)',
    langTags: ['ar', 'fr', 'en'],
    match(q) {
      return /\b(news|akhbar|أخبار|آخر|اليوم|عاجل|اخبار|actualit[eé]|info|today|breaking|مستجدات)\b/i.test(q)
        ? 0.90 : 0
    },
    async run({ query }) {
      if (typeof host.fetchNews !== 'function') return { items: [] }
      return host.fetchNews(query)
    },
  })

  registerPlugin({
    name: 'currency',
    description: 'Exchange rates (DZD, USD, EUR, MAD, TND ...)',
    langTags: ['ar', 'fr', 'en'],
    match(q) {
      return /\b(dollar|euro|dzd|dinar|currency|exchange|rate|sarf|صرف|دولار|يورو|دينار|monnaie|change|cours)\b/i.test(q)
        ? 0.92 : 0
    },
    async run() {
      if (typeof host.fetchCurrency !== 'function') return null
      return host.fetchCurrency()
    },
  })

  registerPlugin({
    name: 'weather',
    description: 'Real-time weather for any Algerian or world city',
    langTags: ['ar', 'fr', 'en'],
    match(q) {
      return /\b(weather|temperature|temps|m[eé]t[eé]o|طقس|الطقس|الجو|درجة الحرارة|météo)\b/i.test(q)
        ? 0.92 : 0
    },
    async run({ query }) {
      if (typeof host.fetchWeather !== 'function') return null
      const m = query.match(/(?:in|à|في)\s+([\p{L}\s]+)/iu)
      const city = m ? m[1].trim() : 'Algiers'
      return host.fetchWeather(city)
    },
  })

  registerPlugin({
    name: 'web-search',
    description: 'Open-web search via Google CSE for fresh / real-time queries — MANDATORY for news, politics, celebrities, incidents, recent events',
    langTags: ['ar', 'fr', 'en'],
    match(q) {
      // MANDATORY HIGH SCORE for real-time queries (news, politics, celebrities, incidents, recent events)
      if (isRealTimeQuery(q)) return 0.95

      // High score when user explicitly asks to search
      if (/\b(search|cherche|بحث|قوقل|google|trouve|find|ابحث|ابحث لي|فتش|اعثر)\b/i.test(q)) return 0.88

      // Default low catch-all score for general queries that may need context
      return 0.22
    },
    async run({ query }) {
      if (typeof host.fetchWebSearch !== 'function') return { items: [] }
      const result = await host.fetchWebSearch(query)
      // Ensure items are sorted by date (freshest first)
      if (result && Array.isArray(result.items)) {
        result.items = result.items
          .filter(item => item && (item.title || item.snippet))
          .sort((a, b) => {
            const da = a.date ? new Date(a.date).getTime() : 0
            const db = b.date ? new Date(b.date).getTime() : 0
            return db - da
          })
          .slice(0, 5) // top 5 freshest
      }
      return result
    },
  })

  registerPlugin({
    name: 'github',
    description: 'Search GitHub repos & code patterns for the developer agent',
    langTags: ['ar', 'fr', 'en'],
    match(q) {
      return /\b(github|repo|repository|library|package|npm|pip|open source|مكتبة|مستودع|code source)\b/i.test(q)
        ? 0.82 : 0
    },
    async run({ query }) {
      if (typeof host.fetchGithub !== 'function') return { items: [] }
      return host.fetchGithub(query)
    },
  })

  registerPlugin({
    name: 'dev',
    description: 'Coding / app generation tasks routed to the executor agent',
    langTags: ['ar', 'fr', 'en'],
    match(q) {
      return /\b(code|build|create|make|fix|debug|refactor|generate|app|website|api|saas|dashboard|component|function|بناء|اصنع|انشئ|كود|برمج|طور|موقع|تطبيق|crée|construis|développe|application|site)\b/i.test(q)
        ? 0.82 : 0
    },
    async run() { return { mode: 'dev' } },
  })
}
