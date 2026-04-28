// DZ Agent — Smart Router (orchestrator).
// Pipes: detectIntent → route → fetch → rank → build response → memory + cache.

import { detectIntent, expandQuery, enhanceBuilderQuery } from './intent.js'
import { getTopNews } from './news.js'
import { searchRepos, searchCode, getRepoInsight, trendingRepos } from './github.js'
import { buildSite } from './builder.js'
import { recall, remember, stats as memStats } from './memory.js'
import { queryCache, makeKey } from './cache.js'
import { rankAndTrim } from './ranker.js'

const FAILSAFE_MSG = '⚠️ لم أتمكن من العثور على بيانات حديثة. حاول إعادة صياغة السؤال أو إضافة كلمة مفتاحية أوضح.'

function ok(payload) { return { ok: true, ...payload } }
function fail(message, extra = {}) { return { ok: false, message, ...extra } }

// ---------- Engines ----------

async function newsEngine(query, intent, opts) {
  const sportsContext = !!intent.flags.isSports
  const news = await getTopNews({ query, limit: opts.limit || 12, sportsContext, fetcher: opts.fetcher })
  if (!news.items?.length) return fail(FAILSAFE_MSG, { kind: 'news' })
  return ok({
    kind: 'news',
    breaking: !!intent.breakingNews,
    counts: news.counts,
    cards: news.items.map(n => ({
      title: n.title,
      url: n.link || n.url,
      source: n.source,
      tier: n.tier,
      pubDate: n.pubDate,
      excerpt: (n.description || '').slice(0, 280),
      score: n._score,
    })),
    cached: !!news.cached,
  })
}

async function githubEngine(query, intent, opts) {
  const [repos, code] = await Promise.allSettled([
    searchRepos(query, { perPage: opts.limit || 8 }),
    searchCode(query, { perPage: 5 }),
  ])
  const reposVal = repos.status === 'fulfilled' ? repos.value : { items: [] }
  const codeVal  = code.status === 'fulfilled'  ? code.value  : { items: [] }
  if (!reposVal.items?.length && !codeVal.items?.length) return fail(FAILSAFE_MSG, { kind: 'github' })

  // Optional deep-dive: if exactly one strong repo dominates, attach insight
  let insight = null
  if (reposVal.items?.[0]?.fullName) {
    try { insight = await getRepoInsight(reposVal.items[0].fullName) } catch {}
  }

  return ok({
    kind: 'github',
    table: reposVal.items.slice(0, 8).map(r => ({
      repo: r.fullName,
      stars: r.stars,
      lang: r.language,
      pushed: r.pushedAt,
      url: r.url,
      description: r.description,
    })),
    code: codeVal.items.slice(0, 5),
    insight: insight ? {
      repo: insight.fullName,
      stack: insight.stack,
      languages: insight.languages,
      readmeExcerpt: insight.readmeExcerpt?.slice(0, 1500),
    } : null,
  })
}

async function builderEngine(query) {
  const built = await buildSite(query)
  return ok({
    kind: 'builder',
    plan: built.plan,
    files: built.files,
    nextSteps: built.nextSteps,
    cached: !!built.cached,
  })
}

// "Structured" intent: news/data with a comparative angle → return a table.
async function structuredEngine(query, intent, opts) {
  // Try news + (if asked) repos in parallel
  const [news, repos] = await Promise.allSettled([
    getTopNews({ query, limit: 8, sportsContext: !!intent.flags.isSports, fetcher: opts.fetcher }),
    intent.flags.isCode ? searchRepos(query, { perPage: 6 }) : Promise.resolve({ items: [] }),
  ])
  const newsVal = news.status === 'fulfilled' ? news.value : { items: [] }
  const repoVal = repos.status === 'fulfilled' ? repos.value : { items: [] }

  if (!newsVal.items?.length && !repoVal.items?.length) return fail(FAILSAFE_MSG, { kind: 'structured' })

  return ok({
    kind: 'structured',
    table: newsVal.items.map(n => ({
      title: n.title,
      source: n.source,
      date: n.pubDate,
      url: n.link || n.url,
      score: n._score,
    })),
    repos: repoVal.items?.slice(0, 5) || [],
  })
}

// "General" intent: hybrid — top news + trending repos for context, ranked.
async function hybridEngine(query, intent, opts) {
  const queries = expandQuery(query, intent.lang)
  const newsRuns = await Promise.allSettled(
    queries.map(q => getTopNews({ query: q, limit: 6, fetcher: opts.fetcher })),
  )
  const allItems = []
  for (const r of newsRuns) {
    if (r.status === 'fulfilled') allItems.push(...(r.value.items || []))
  }
  const top = rankAndTrim(allItems, { query, limit: 8 })
  if (!top.length) return fail(FAILSAFE_MSG, { kind: 'general' })
  return ok({
    kind: 'general',
    cards: top.map(n => ({
      title: n.title, url: n.link || n.url, source: n.source,
      tier: n.tier, excerpt: (n.description || '').slice(0, 240),
    })),
  })
}

// ---------- Public API ----------

// Fetcher injection lets server.js share its richer fetchMultipleFeeds when
// available, so we don't double-implement RSS plumbing.
let _injectedFetcher = null
export function setNewsFetcher(fn) { _injectedFetcher = typeof fn === 'function' ? fn : null }

export async function ask(query, options = {}) {
  const startedAt = Date.now()
  const q = String(query || '').trim()
  if (!q) return fail('Empty query.')

  // 0) Cache first
  const cacheKey = makeKey('agent', q, { limit: options.limit || 10 })
  if (!options.bypassCache) {
    const cached = queryCache.get(cacheKey)
    if (cached) return { ...cached, cached: true, latencyMs: Date.now() - startedAt }
  }

  // 1) Memory recall — reuse very recent answers verbatim
  if (!options.bypassMemory) {
    const remembered = await recall(q)
    if (remembered?.fresh && remembered.answer) {
      return ok({
        kind: remembered.intent || 'general',
        memoryHit: true,
        similarity: remembered.similarity,
        answer: remembered.answer,
        sources: remembered.sources || [],
        latencyMs: Date.now() - startedAt,
      })
    }
  }

  // 2) Intent + route
  const intent = detectIntent(q)
  const fetcher = _injectedFetcher
  let result
  try {
    switch (intent.primary) {
      case 'builder':    result = await builderEngine(q); break
      case 'github':     result = await githubEngine(q, intent, { fetcher, limit: options.limit }); break
      case 'news':       result = await newsEngine(q, intent, { fetcher, limit: options.limit }); break
      case 'structured': result = await structuredEngine(q, intent, { fetcher, limit: options.limit }); break
      default:           result = await hybridEngine(q, intent, { fetcher, limit: options.limit })
    }
  } catch (err) {
    return fail(`engine error: ${err.message}`, { intent: intent.primary })
  }

  const final = {
    ...result,
    intent: intent.primary,
    flags: intent.flags,
    lang: intent.lang,
    liveMode: intent.liveMode,
    latencyMs: Date.now() - startedAt,
    fetchedAt: new Date().toISOString(),
    failsafe: !result.ok ? FAILSAFE_MSG : undefined,
  }

  // 3) Cache + memory (only if we got real content)
  if (result.ok) {
    queryCache.set(cacheKey, final)
    // Build a readable answer summary for memory
    const summary = summarizeForMemory(final)
    const sources = collectSources(final)
    remember({ query: q, intent: intent.primary, answer: summary, sources }).catch(() => {})
  }
  return final
}

function summarizeForMemory(payload) {
  if (payload.answer) return payload.answer
  const cards = payload.cards || payload.table || []
  return cards.slice(0, 5).map((c, i) => `${i + 1}. ${c.title || c.repo} — ${c.source || c.url || ''}`).join('\n')
}

function collectSources(payload) {
  const list = []
  for (const arr of [payload.cards, payload.table, payload.code]) {
    if (Array.isArray(arr)) for (const c of arr) list.push({ title: c.title || c.repo, url: c.url, source: c.source })
  }
  return list
}

// Diagnostics surface for /api/agent/health
export async function health() {
  return {
    ok: true,
    memory: await memStats(),
    cache: {
      query: queryCache.stats(),
    },
    fetcherInjected: !!_injectedFetcher,
    ts: new Date().toISOString(),
  }
}

// Cron: warm the news cache every N hours (called from agent-mount.js)
export async function backgroundRefresh() {
  const tasks = [
    getTopNews({ query: 'الجزائر اليوم', limit: 12, fetcher: _injectedFetcher }),
    getTopNews({ query: 'كرة القدم الجزائر', limit: 8, sportsContext: true, fetcher: _injectedFetcher }),
    getTopNews({ query: 'اقتصاد الجزائر', limit: 8, fetcher: _injectedFetcher }),
    trendingRepos('TypeScript', { limit: 12 }).catch(() => []),
  ]
  const out = await Promise.allSettled(tasks)
  return {
    ok: true,
    ranAt: new Date().toISOString(),
    tasks: out.map(r => r.status),
  }
}
