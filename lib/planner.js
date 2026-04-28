// DZ Agent — Query Planner.
// Decompose a complex user query into 1-3 focused sub-queries (Perplexity rule).
// Pure function, lightweight heuristics, no LLM call required.

import { detectIntent, expandQuery, detectQueryLanguage } from './intent.js'

const MAX_SUBQUERIES = 3

// Conjunctions that suggest multi-part questions.
const SPLIT_AR = /\s+(و|ثم|أيضا|كذلك|أو)\s+/g
const SPLIT_EN = /\s+(and also|and|then|also|or)\s+/gi
const SPLIT_FR = /\s+(et aussi|et|puis|ou)\s+/gi

// Question pivots: useful for splitting compound questions.
const QUESTION_AR = /(ما|من|أين|متى|كيف|لماذا|كم)\s/g
const QUESTION_EN = /\b(what|who|where|when|how|why|which|how many)\b/gi

function uniqShort(arr) {
  const seen = new Set()
  const out = []
  for (const s of arr) {
    const t = String(s || '').trim()
    if (!t) continue
    const k = t.toLowerCase().slice(0, 80)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
    if (out.length >= MAX_SUBQUERIES) break
  }
  return out
}

// Detect if a query has multiple distinct asks.
function splitConjunctions(q) {
  let parts = [q]
  for (const rx of [SPLIT_AR, SPLIT_EN, SPLIT_FR]) {
    const next = []
    for (const p of parts) next.push(...p.split(rx))
    parts = next.filter(p => p && p.length > 4 && !/^(و|et|and|then|also|or|أو|ثم)$/i.test(p.trim()))
  }
  return parts
}

// Detect compound questions ("what X and how Y") by pivoting on question words.
function splitQuestionPivots(q) {
  const positions = []
  for (const rx of [QUESTION_AR, QUESTION_EN]) {
    let m
    while ((m = rx.exec(q)) !== null) positions.push(m.index)
  }
  if (positions.length < 2) return [q]
  positions.sort((a, b) => a - b)
  const parts = []
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i]
    const end = i + 1 < positions.length ? positions[i + 1] : q.length
    parts.push(q.slice(start, end).trim())
  }
  return parts
}

// Inject temporal qualifiers when query implies "now" / "today" without dates.
function addTemporalQualifier(q, lang) {
  const hasYear = /(20\d{2})/.test(q)
  const hasTime = /(today|now|اليوم|الآن|aujourd|maintenant|latest|recent|آخر)/i.test(q)
  if (hasYear || !hasTime) return q
  const year = new Date().getFullYear()
  if (lang === 'ar') return `${q} ${year}`
  return `${q} ${year}`
}

// Main: build an execution plan for the smart router.
export function planQuery(rawQuery) {
  const query = String(rawQuery || '').trim()
  if (!query) return { query, lang: 'en', intent: { primary: 'general' }, subqueries: [], steps: [] }

  const intent = detectIntent(query)
  const lang = detectQueryLanguage(query)

  // 1) Try splitting on conjunctions, then on question pivots.
  let parts = splitConjunctions(query)
  if (parts.length === 1) parts = splitQuestionPivots(query)

  // 2) For each part, light expansion (AR<->EN seeds) — first variant only.
  const expanded = []
  for (const p of parts) {
    const variants = expandQuery(p, lang)
    expanded.push(addTemporalQualifier(variants[0], lang))
  }

  // 3) If the original was short and broad, also add a context-prefixed variant.
  if (parts.length === 1 && query.split(/\s+/).length <= 4) {
    const variants = expandQuery(query, lang)
    if (variants[1]) expanded.push(addTemporalQualifier(variants[1], lang))
  }

  const subqueries = uniqShort(expanded)

  // 4) Build the step plan — what the smart router should run, in order.
  const steps = []
  if (intent.primary === 'github' || intent.flags.isCode) {
    steps.push({ kind: 'github', query: subqueries[0], purpose: 'Find best repos' })
  }
  if (intent.primary === 'news' || intent.primary === 'structured' || intent.flags.isNews) {
    for (const sq of subqueries) {
      steps.push({ kind: 'news', query: sq, purpose: 'Fetch fresh news', sportsContext: !!intent.flags.isSports })
    }
  }
  if (intent.primary === 'builder') {
    steps.push({ kind: 'builder', query, purpose: 'Generate site plan + scaffold' })
  }
  if (steps.length === 0) {
    // General hybrid plan
    for (const sq of subqueries) steps.push({ kind: 'news', query: sq, purpose: 'Background context' })
  }

  return {
    query,
    lang,
    intent,
    subqueries,
    steps: steps.slice(0, 4),  // hard cap
    notes: parts.length > 1 ? `Detected ${parts.length} sub-questions` : 'Single-topic query',
  }
}
