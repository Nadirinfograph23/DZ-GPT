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
export function selectPlugins(query, { maxTools = 3, threshold = 0.25 } = {}) {
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
export async function runPlugins(selected, ctx, { timeoutMs = 6000 } = {}) {
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
        ? 0.85 : 0
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
        ? 0.9 : 0
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
        ? 0.9 : 0
    },
    async run({ query }) {
      if (typeof host.fetchWeather !== 'function') return null
      // crude city extraction
      const m = query.match(/(?:in|à|في)\s+([\p{L}\s]+)/iu)
      const city = m ? m[1].trim() : 'Algiers'
      return host.fetchWeather(city)
    },
  })

  registerPlugin({
    name: 'web-search',
    description: 'Open-web search via Google CSE for fresh / niche queries',
    langTags: ['ar', 'fr', 'en'],
    match(q) {
      // Catch-all low-score, used when nothing else fires
      return /\b(search|cherche|بحث|قوقل|google|trouve|find)\b/i.test(q)
        ? 0.7 : 0.2
    },
    async run({ query }) {
      if (typeof host.fetchWebSearch !== 'function') return { items: [] }
      return host.fetchWebSearch(query)
    },
  })

  registerPlugin({
    name: 'github',
    description: 'Search GitHub repos & code patterns for the developer agent',
    langTags: ['ar', 'fr', 'en'],
    match(q) {
      return /\b(github|repo|repository|library|package|npm|pip|open source|مكتبة|مستودع|code source)\b/i.test(q)
        ? 0.8 : 0
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
        ? 0.8 : 0
    },
    // Dev plugin doesn't call an external service; it just signals "dev mode"
    // so the executor uses a developer-tuned system prompt.
    async run() { return { mode: 'dev' } },
  })
}
