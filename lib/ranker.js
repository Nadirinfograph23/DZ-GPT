// DZ Agent — Source credibility & relevance ranker.
// Algeria-first scoring. Pure functions (no side effects).

// Tier weights — higher = more authoritative for an Algeria-first audience.
const SOURCE_TIERS = {
  // Algeria — Priority 1 (max priority)
  'djazairess.com':   60,
  'aps.dz':           55,
  'echoroukonline.com': 50,
  'echorouk.dz':      50,
  'ennaharonline.com':50,
  'ennahar.tv':       50,
  'tsa-algerie.com':  48,
  'tsa.dz':           48,
  'elbilad.net':      46,
  'elbilad.dz':       46,
  'el-hadef.dz':      45,  // sports only — bonus applied separately
  'elheddaf.com':     45,
  'elhayat.dz':       44,
  'algerie360.com':   42,
  'liberte-algerie.com': 42,
  'lemidi-dz.com':    40,
  'elwatan-dz.com':   40,
  'elkhabar.com':     45,
  'lfp.dz':           50,  // for sports only

  // Algeria — Google News filter
  'news.google.com/search?q=algeria': 40,

  // Arabic — Priority 2
  'aljazeera.net':    25,
  'aljazeera.com':    25,
  'alarabiya.net':    25,
  'sky-news-arabia.com': 22,
  'cnn.com/arabic':   20,
  'bbc.com/arabic':   25,

  // Global — Priority 3
  'reuters.com':      18,
  'bbc.com':          15,
  'bbc.co.uk':        15,
  'apnews.com':       15,
  'theguardian.com':  12,
  'nytimes.com':      12,
  'bloomberg.com':    14,
}

const SPORTS_BONUS_DOMAINS = ['el-hadef.dz', 'elheddaf.com', 'lfp.dz', 'kooora.com', 'sofascore.com']

const SPAM_PATTERNS = [
  /\b(buy now|free download|adult|casino|betting odds|نقدا|نسخه)\b/i,
  /[a-z0-9]{20,}\.com/i,  // gibberish-looking domains
]

function hostFromUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
}

export function tierScoreForHost(host) {
  if (!host) return 0
  // Exact match
  if (SOURCE_TIERS[host] != null) return SOURCE_TIERS[host]
  // Suffix match for subdomains (e.g. ar.aljazeera.net)
  for (const [k, v] of Object.entries(SOURCE_TIERS)) {
    if (host.endsWith('.' + k) || host === k) return v
  }
  return 0
}

export function freshnessScore(pubDate) {
  if (!pubDate) return 0
  const t = Date.parse(pubDate)
  if (!t || Number.isNaN(t)) return 0
  const ageH = (Date.now() - t) / (1000 * 60 * 60)
  if (ageH < 1)   return 25
  if (ageH < 6)   return 20
  if (ageH < 24)  return 15
  if (ageH < 72)  return 8
  if (ageH < 168) return 3
  return 0
}

export function relevanceScore(item, query) {
  if (!query) return 0
  const q = query.toLowerCase()
  const tokens = q.split(/\s+/).filter(t => t.length > 2)
  const haystack = [item.title, item.description, item.snippet, item.feedName, item.source]
    .filter(Boolean).join(' ').toLowerCase()
  let s = 0
  for (const t of tokens) if (haystack.includes(t)) s += 4
  // bonus for Algeria mentions
  if (/الجزائر|algeria|algérie|algerien/i.test(haystack)) s += 4
  return Math.min(s, 25)
}

export function isSpam(item) {
  const text = [item.title, item.description, item.snippet].filter(Boolean).join(' ')
  return SPAM_PATTERNS.some(rx => rx.test(text))
}

// Master scorer — returns numeric score, higher is better.
// Used for both news items and search results.
export function scoreItem(item, { query = '', sportsContext = false } = {}) {
  const url = item.url || item.link || ''
  const host = hostFromUrl(url)
  const tier = tierScoreForHost(host)
  const fresh = freshnessScore(item.pubDate || item.date || item.publishedDate)
  const rel = relevanceScore(item, query)
  let score = tier + fresh + rel
  // Sports specialist bonus
  if (sportsContext && SPORTS_BONUS_DOMAINS.some(d => host.endsWith(d))) score += 10
  // Penalize spammy items
  if (isSpam(item)) score -= 50
  return score
}

// Deduplicate a ranked list by hostname+title prefix. Keeps highest-scored.
export function dedupRanked(items) {
  const seen = new Set()
  const out = []
  for (const it of items) {
    const url = it.url || it.link || ''
    const host = hostFromUrl(url)
    const key = `${host}::${(it.title || '').slice(0, 60).toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

// Final ranker: score → sort → dedup → top N
export function rankAndTrim(items, opts = {}) {
  const { query = '', sportsContext = false, limit = 10 } = opts
  const scored = (items || [])
    .filter(Boolean)
    .map(it => ({ ...it, _score: scoreItem(it, { query, sportsContext }) }))
    .filter(it => it._score > 0)
    .sort((a, b) => b._score - a._score)
  return dedupRanked(scored).slice(0, limit)
}

export const SOURCE_TIER_TABLE = SOURCE_TIERS
