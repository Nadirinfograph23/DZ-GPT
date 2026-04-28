// DZ Agent — Multi-step Reasoner.
// Orchestrates: planner → smart router engines → fusion → citations → final
// markdown. Designed for "deep research" / "thinking" mode endpoints.

import { planQuery } from './planner.js'
import { ask, setNewsFetcher } from './router.js'
import { getTopNews } from './news.js'
import { searchRepos } from './github.js'
import { buildSite } from './builder.js'
import { rankAndTrim } from './ranker.js'
import { buildResponseBundle } from './responder.js'
import { detectInjection, sanitizeOutbound, quarantineExternal } from './safety.js'
import { remember, recall } from './memory.js'

const MAX_PARALLEL_STEPS = 4

async function runStep(step) {
  try {
    if (step.kind === 'github') {
      const r = await searchRepos(step.query, { perPage: 6 })
      return { step, items: r.items || [], kind: 'github' }
    }
    if (step.kind === 'news') {
      const r = await getTopNews({ query: step.query, limit: 8, sportsContext: !!step.sportsContext })
      return { step, items: r.items || [], kind: 'news', counts: r.counts }
    }
    if (step.kind === 'builder') {
      const r = await buildSite(step.query)
      return { step, plan: r.plan, files: r.files, nextSteps: r.nextSteps, kind: 'builder' }
    }
  } catch (err) {
    return { step, error: err.message, kind: step.kind, items: [] }
  }
  return { step, items: [], kind: step.kind }
}

// Fuse multiple step outputs into a single ranked, deduplicated payload.
function fuseResults(plan, stepResults) {
  // Builder is single-step; pass through.
  const builder = stepResults.find(r => r.kind === 'builder')
  if (builder) {
    return { ok: true, kind: 'builder', plan: builder.plan, files: builder.files, nextSteps: builder.nextSteps }
  }
  // Aggregate news + repos; rank globally with the original query for relevance.
  const newsItems = stepResults.filter(r => r.kind === 'news').flatMap(r => r.items)
  const repoItems = stepResults.filter(r => r.kind === 'github').flatMap(r => r.items)
  const rankedNews = rankAndTrim(newsItems, { query: plan.query, sportsContext: !!plan.intent.flags?.isSports, limit: 12 })
  const counts = stepResults.filter(r => r.kind === 'news')
    .reduce((acc, r) => {
      acc.algeria += r.counts?.algeria || 0
      acc.arabic  += r.counts?.arabic  || 0
      acc.global  += r.counts?.global  || 0
      acc.total   += r.counts?.total   || 0
      return acc
    }, { algeria: 0, arabic: 0, global: 0, total: 0, kept: rankedNews.length })

  const kind = rankedNews.length && repoItems.length ? 'structured'
    : rankedNews.length ? 'news'
    : repoItems.length ? 'github'
    : 'general'

  return {
    ok: rankedNews.length + repoItems.length > 0,
    kind,
    cards: kind === 'news' || kind === 'general' ? rankedNews.map(toCard) : undefined,
    table: kind === 'structured' ? rankedNews.map(toRow) : (kind === 'github' ? repoItems.map(toRepoRow) : undefined),
    repos: kind === 'structured' && repoItems.length ? repoItems.slice(0, 6).map(toRepoRow) : undefined,
    counts,
  }
}

function toCard(n) {
  return {
    title: n.title, url: n.link || n.url, source: n.source, tier: n.tier,
    pubDate: n.pubDate, excerpt: (n.description || '').slice(0, 280), score: n._score,
  }
}
function toRow(n) {
  return { title: n.title, url: n.link || n.url, source: n.source, date: n.pubDate, score: n._score }
}
function toRepoRow(r) {
  return {
    fullName: r.fullName, repo: r.fullName, stars: r.stars, lang: r.language,
    pushedAt: r.pushedAt, url: r.url, description: r.description,
  }
}

// Self-critique: lightweight pass to flag thin or contradictory results.
function selfCritique(fused, plan) {
  const issues = []
  const cards = fused.cards || fused.table || []
  if (!cards.length) issues.push('no items retrieved')
  if (cards.length && (fused.counts?.algeria || 0) === 0 && plan.lang === 'ar') {
    issues.push('Arabic query but zero Algerian sources — consider a sub-query in Arabic.')
  }
  // Detect injection attempts in fetched titles/snippets
  for (const c of cards.slice(0, 8)) {
    const txt = `${c.title || ''} ${c.excerpt || ''}`
    const inj = detectInjection(txt)
    if (inj.suspicious) { issues.push(`possible injection in "${(c.source || '').slice(0, 40)}"`); break }
  }
  return { issues, ok: issues.length === 0 }
}

// Public: deep-research orchestrator.
//   query → plan → parallel steps → fuse → critique → render → memory.
export async function reason(rawQuery, options = {}) {
  const startedAt = Date.now()
  const query = String(rawQuery || '').trim()
  if (!query) return { ok: false, error: 'empty query' }

  // Memory recall — reuse fresh deep-research answers.
  if (!options.bypassMemory) {
    const memo = await recall(query)
    if (memo?.fresh && memo.intent === 'deep') {
      return {
        ok: true, kind: 'deep', memoryHit: true, similarity: memo.similarity,
        markdown: memo.answer, citations: memo.sources, latencyMs: Date.now() - startedAt,
      }
    }
  }

  // 1) Plan
  const plan = planQuery(query)
  // 2) Run steps in parallel (capped)
  const slice = plan.steps.slice(0, MAX_PARALLEL_STEPS)
  const stepResults = await Promise.all(slice.map(runStep))
  // 3) Fuse
  const fused = fuseResults(plan, stepResults)
  // 4) Self-critique
  const critique = selfCritique(fused, plan)
  // 5) Render markdown + citations
  const bundle = buildResponseBundle(fused, { lang: plan.lang })
  // 6) Sanitize outbound (no secret leakage from any source)
  bundle.markdown = sanitizeOutbound(bundle.markdown)

  const final = {
    ok: fused.ok,
    kind: 'deep',
    intent: plan.intent.primary,
    lang: plan.lang,
    plan: { subqueries: plan.subqueries, steps: plan.steps.map(s => ({ kind: s.kind, query: s.query, purpose: s.purpose })) },
    counts: fused.counts,
    critique,
    markdown: bundle.markdown,
    citations: bundle.citations,
    latencyMs: Date.now() - startedAt,
    fetchedAt: new Date().toISOString(),
  }

  if (fused.ok) {
    remember({
      query, intent: 'deep',
      answer: final.markdown,
      sources: bundle.citations.map(c => ({ title: c.title, url: c.url, source: c.source })),
      meta: { kind: fused.kind, lang: plan.lang },
    }).catch(() => {})
  }
  return final
}

// Re-export so the mount file has one place to inject.
export { setNewsFetcher } from './router.js'

// Quarantine helper re-export — used by anyone passing scraped content into
// downstream model calls.
export { quarantineExternal }

// Convenience: a "thinking" mode that just runs the planner + critique without
// rendering markdown, useful for showing reasoning in dev tools.
export function think(rawQuery) {
  return planQuery(rawQuery)
}
