// DZ Agent — RSS Live News Engine V2 (Algeria-first + Smart Ranking).
// Upgraded: May 2026 — more sources, AI ranking, category classification,
// breaking-news detection, dedup, token-optimized summaries.

import { rankAndTrim, isSpam } from './ranker.js'
import { newsCache, makeKey } from './cache.js'

// ═══════════════════════════════════════════════════════════════════
// FEED MANIFEST — 7 tiers: Algeria(1) → N.Africa(2) → Arabic(3) →
//                          Sports(4) → Tech/AI(5) → Global(6) → Aggregators(7)
// ═══════════════════════════════════════════════════════════════════
export const FEED_MANIFEST = [

  // ── Tier 1 — Algeria (MAX PRIORITY) ────────────────────────────
  { name: 'APS وكالة الأنباء الجزائرية', url: 'https://www.aps.dz/ar/feed',                                           tier: 1, type: 'news',       lang: 'ar', trust: 1.0 },
  { name: 'APS رياضة',                   url: 'https://www.aps.dz/ar/sport/feed',                                      tier: 1, type: 'sports',     lang: 'ar', trust: 1.0 },
  { name: 'راديو الجزائر',               url: 'https://news.radioalgerie.dz/ar/rss.xml',                               tier: 1, type: 'news',       lang: 'ar', trust: 0.95 },
  { name: 'الشروق أونلاين',              url: 'https://www.echoroukonline.com/feed',                                   tier: 1, type: 'news',       lang: 'ar', trust: 0.92 },
  { name: 'النهار أونلاين',              url: 'https://www.ennaharonline.com/feed/',                                   tier: 1, type: 'news',       lang: 'ar', trust: 0.92 },
  { name: 'الخبر',                       url: 'https://www.elkhabar.com/rss',                                          tier: 1, type: 'news',       lang: 'ar', trust: 0.90 },
  { name: 'TSA Algérie',                 url: 'https://www.tsa-algerie.com/feed/',                                     tier: 1, type: 'news',       lang: 'fr', trust: 0.93 },
  { name: 'البلاد',                      url: 'https://www.elbilad.net/rss',                                           tier: 1, type: 'news',       lang: 'ar', trust: 0.88 },
  { name: 'الهداف (رياضة)',              url: 'https://www.elheddaf.com/feed',                                         tier: 1, type: 'sports',     lang: 'ar', trust: 0.90 },
  { name: 'الحياة',                      url: 'https://elhayatdz.dz/feed/',                                            tier: 1, type: 'news',       lang: 'ar', trust: 0.85 },
  { name: 'الوطن',                       url: 'https://www.el-watan.com/feed/',                                        tier: 1, type: 'news',       lang: 'fr', trust: 0.88 },
  { name: 'الفجر',                       url: 'https://www.al-fadjr.com/feed/',                                        tier: 1, type: 'news',       lang: 'ar', trust: 0.85 },
  { name: 'جزاير تيوب',                  url: 'https://www.dzairtube.dz/feed/',                                        tier: 1, type: 'news',       lang: 'ar', trust: 0.80 },
  { name: 'جزايرس (أرشيف)',              url: 'https://www.djazairess.com/rss',                                        tier: 1, type: 'aggregator', lang: 'ar', trust: 0.82 },
  { name: 'Google أخبار الجزائر (AR)',   url: 'https://news.google.com/rss/search?q=الجزائر&hl=ar&gl=DZ&ceid=DZ:ar', tier: 1, type: 'aggregator', lang: 'ar', trust: 0.88 },
  { name: 'Google Algérie (FR)',          url: 'https://news.google.com/rss/search?q=algerie&hl=fr&gl=DZ&ceid=DZ:fr', tier: 1, type: 'aggregator', lang: 'fr', trust: 0.88 },

  // ── Tier 2 — North Africa ───────────────────────────────────────
  { name: 'تونس نيوز',                   url: 'https://www.tunisienumerique.com/feed/',                                tier: 2, type: 'news',       lang: 'ar', trust: 0.78 },
  { name: 'موروكو وورلد نيوز',            url: 'https://www.moroccoworldnews.com/feed/',                               tier: 2, type: 'news',       lang: 'en', trust: 0.78 },
  { name: 'مصر العربي',                  url: 'https://www.masrawy.com/rss/rss.aspx?section=news',                    tier: 2, type: 'news',       lang: 'ar', trust: 0.75 },

  // ── Tier 3 — Arabic International ──────────────────────────────
  { name: 'الجزيرة عربي',               url: 'https://www.aljazeera.com/xml/rss/all.xml',                             tier: 3, type: 'news',       lang: 'ar', trust: 0.92 },
  { name: 'العربية',                     url: 'https://www.alarabiya.net/feed/rss2/ar.xml',                           tier: 3, type: 'news',       lang: 'ar', trust: 0.90 },
  { name: 'BBC عربي',                    url: 'https://feeds.bbci.co.uk/arabic/rss.xml',                              tier: 3, type: 'news',       lang: 'ar', trust: 0.95 },
  { name: 'رويترز عربي',                 url: 'https://feeds.reuters.com/reuters/arabicNews',                         tier: 3, type: 'news',       lang: 'ar', trust: 0.98 },
  { name: 'فرانس 24 عربي',               url: 'https://www.france24.com/ar/rss',                                     tier: 3, type: 'news',       lang: 'ar', trust: 0.90 },
  { name: 'سكاي نيوز عربية',             url: 'https://www.skynewsarabia.com/api/rss',                                tier: 3, type: 'news',       lang: 'ar', trust: 0.88 },

  // ── Tier 4 — Sports ─────────────────────────────────────────────
  { name: 'BBC Sport',                   url: 'https://feeds.bbci.co.uk/sport/rss.xml',                               tier: 4, type: 'sports',     lang: 'en', trust: 0.95 },
  { name: 'BBC Sport Football',          url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',                      tier: 4, type: 'sports',     lang: 'en', trust: 0.95 },
  { name: 'ESPN Soccer',                 url: 'https://www.espn.com/espn/rss/soccer/news',                            tier: 4, type: 'sports',     lang: 'en', trust: 0.93 },
  { name: 'Sky Sports',                  url: 'https://feeds.skynews.com/feeds/rss/sports.xml',                       tier: 4, type: 'sports',     lang: 'en', trust: 0.90 },
  { name: 'سبورت 360',                   url: 'https://arabic.sport360.com/feed/',                                   tier: 4, type: 'sports',     lang: 'ar', trust: 0.85 },
  { name: 'كووورة',                      url: 'https://www.kooora.com/?feed=rss',                                     tier: 4, type: 'sports',     lang: 'ar', trust: 0.85 },
  { name: 'CAF Football',                url: 'https://www.cafonline.com/rss-feed/',                                  tier: 4, type: 'sports',     lang: 'en', trust: 0.92 },
  { name: 'Yahoo Sports',                url: 'https://sports.yahoo.com/rss/',                                        tier: 4, type: 'sports',     lang: 'en', trust: 0.88 },

  // ── Tier 5 — Technology & AI ────────────────────────────────────
  { name: 'The Verge',                   url: 'https://www.theverge.com/rss/index.xml',                               tier: 5, type: 'tech',       lang: 'en', trust: 0.92 },
  { name: 'TechCrunch',                  url: 'https://techcrunch.com/feed/',                                         tier: 5, type: 'tech',       lang: 'en', trust: 0.93 },
  { name: 'Wired',                       url: 'https://www.wired.com/feed/rss',                                       tier: 5, type: 'tech',       lang: 'en', trust: 0.90 },
  { name: 'MIT Tech Review',             url: 'https://www.technologyreview.com/feed/',                               tier: 5, type: 'tech',       lang: 'en', trust: 0.92 },
  { name: 'VentureBeat AI',              url: 'https://venturebeat.com/category/ai/feed/',                            tier: 5, type: 'tech',       lang: 'en', trust: 0.88 },
  { name: 'Ars Technica',                url: 'https://feeds.arstechnica.com/arstechnica/index',                      tier: 5, type: 'tech',       lang: 'en', trust: 0.90 },
  { name: 'Hacker News (top)',           url: 'https://hnrss.org/frontpage',                                          tier: 5, type: 'tech',       lang: 'en', trust: 0.85 },

  // ── Tier 6 — Global ─────────────────────────────────────────────
  { name: 'Reuters World',               url: 'https://feeds.reuters.com/reuters/worldNews',                          tier: 6, type: 'news',       lang: 'en', trust: 0.98 },
  { name: 'BBC World',                   url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                         tier: 6, type: 'news',       lang: 'en', trust: 0.97 },
  { name: 'AP News World',               url: 'https://news.google.com/rss/search?q=site:apnews.com+world&hl=en',    tier: 6, type: 'news',       lang: 'en', trust: 0.97 },
  { name: 'CNN',                         url: 'http://rss.cnn.com/rss/edition.rss',                                   tier: 6, type: 'news',       lang: 'en', trust: 0.88 },
  { name: 'Al Jazeera English',          url: 'https://www.aljazeera.com/xml/rss/all.xml',                            tier: 6, type: 'news',       lang: 'en', trust: 0.92 },
]

// ── Convenience selectors ────────────────────────────────────────
export function feedsByTier(tier) { return FEED_MANIFEST.filter(f => f.tier === tier) }
export function feedsByType(type) { return FEED_MANIFEST.filter(f => f.type === type) }
export const ALGERIA_FEEDS    = feedsByTier(1)
export const N_AFRICA_FEEDS   = feedsByTier(2)
export const ARABIC_FEEDS     = feedsByTier(3)
export const SPORTS_FEEDS     = feedsByType('sports')
export const TECH_FEEDS       = feedsByType('tech')
export const GLOBAL_FEEDS     = feedsByTier(6)

// ═══════════════════════════════════════════════════════════════════
// NEWS CATEGORIES — multi-language keyword classification
// ═══════════════════════════════════════════════════════════════════
export const NEWS_CATEGORIES = {
  'الجزائر 🇩🇿':       ['الجزائر', 'جزائر', 'algérie', 'algeria', 'algerian', 'وهران', 'قسنطينة', 'عنابة', 'تيزي وزو', 'البليدة'],
  'سياسة 🏛️':         ['سياسة', 'حكومة', 'وزير', 'برلمان', 'رئيس', 'انتخاب', 'دبلوماسية', 'politics', 'government', 'minister', 'president', 'election', 'politique'],
  'اقتصاد 💰':        ['اقتصاد', 'مالية', 'استثمار', 'تضخم', 'نمو', 'ميزانية', 'بورصة', 'دينار', 'economy', 'finance', 'inflation', 'gdp', 'économie'],
  'رياضة ⚽':         ['رياضة', 'مباراة', 'كرة', 'دوري', 'بطولة', 'لاعب', 'هدف', 'مرمى', 'sport', 'football', 'match', 'league', 'goal', 'player'],
  'تكنولوجيا 💻':     ['تكنولوجيا', 'تقنية', 'ذكاء اصطناعي', 'برمجة', 'tech', 'ai', 'software', 'startup', 'cyber', 'digital', 'chatgpt', 'llm'],
  'صحة 🏥':          ['صحة', 'طب', 'مرض', 'علاج', 'مستشفى', 'لقاح', 'وباء', 'health', 'medical', 'hospital', 'vaccine', 'santé'],
  'أمن 🔒':          ['أمن', 'إرهاب', 'جريمة', 'شرطة', 'درك', 'security', 'crime', 'police', 'terrorism', 'sécurité'],
  'ثقافة 🎭':         ['ثقافة', 'فن', 'سينما', 'موسيقى', 'رواية', 'مهرجان', 'culture', 'art', 'cinema', 'music', 'festival'],
  'طقس 🌤️':          ['طقس', 'حرارة', 'مطر', 'عاصفة', 'موجة', 'weather', 'temperature', 'rain', 'storm', 'météo'],
  'دولي 🌍':         ['دولي', 'عالمي', 'أمم متحدة', 'international', 'world', 'global', 'nato', 'onu'],
  'أخبار عاجلة 🚨':  ['عاجل', 'breaking', 'urgent', 'flash', 'just in', 'عاجلاً', 'مستعجل'],
}

export function classifyArticle(title = '', source = '', desc = '') {
  const text = `${title} ${source} ${desc}`.toLowerCase()
  for (const [cat, kws] of Object.entries(NEWS_CATEGORIES)) {
    if (kws.some(k => text.includes(k.toLowerCase()))) return cat
  }
  return 'متنوع 📰'
}

// ═══════════════════════════════════════════════════════════════════
// BREAKING NEWS DETECTION — trigger if ≥3 sources share similar headline
// ═══════════════════════════════════════════════════════════════════
function normalizeHeadline(title = '') {
  return title.toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 6)
    .join(' ')
}

export function detectBreakingEvents(items = []) {
  const clusters = new Map()
  for (const item of items) {
    const key = normalizeHeadline(item.title)
    if (!key) continue
    if (!clusters.has(key)) clusters.set(key, [])
    clusters.get(key).push(item)
  }
  const breaking = []
  for (const [, group] of clusters) {
    if (group.length >= 3) {
      const sources = [...new Set(group.map(i => i.source))]
      breaking.push({
        headline: group[0].title,
        count: group.length,
        sources,
        items: group,
        isBreaking: true,
      })
    }
  }
  return breaking
}

// ═══════════════════════════════════════════════════════════════════
// SMART RANKING — recency(40%) + source_trust(25%) + trend(20%) + tier(15%)
// ═══════════════════════════════════════════════════════════════════
function parseDate(dateStr = '') {
  try { return new Date(dateStr).getTime() } catch { return 0 }
}

function recencyScore(pubDate = '') {
  const ts = parseDate(pubDate)
  if (!ts) return 0.5
  const ageMs = Date.now() - ts
  const ageHours = ageMs / (1000 * 60 * 60)
  if (ageHours < 1) return 1.0
  if (ageHours < 3) return 0.9
  if (ageHours < 6) return 0.8
  if (ageHours < 12) return 0.7
  if (ageHours < 24) return 0.55
  if (ageHours < 48) return 0.4
  return 0.2
}

export function smartRank(items = [], { query = '', sportsContext = false } = {}) {
  const qLower = query.toLowerCase()
  return items
    .map(item => {
      const feed = FEED_MANIFEST.find(f => f.name === item.source || f.name === item.feedName)
      const trust = feed?.trust ?? 0.70
      const tier = feed?.tier ?? 5
      const tierScore = tier === 1 ? 1.0 : tier === 2 ? 0.85 : tier === 3 ? 0.75 : tier === 4 ? 0.70 : tier === 5 ? 0.60 : 0.50
      const recency = recencyScore(item.pubDate)
      // Relevance bonus if query words match title
      const titleLower = (item.title || '').toLowerCase()
      const relevance = qLower && qLower.split(' ').some(w => w.length > 3 && titleLower.includes(w)) ? 0.15 : 0
      // Sports boost
      const sportsBoost = sportsContext && feed?.type === 'sports' ? 0.10 : 0
      // Breaking news boost
      const breakingBoost = NEWS_CATEGORIES['أخبار عاجلة 🚨'].some(k => titleLower.includes(k)) ? 0.10 : 0
      const score = (recency * 0.40) + (trust * 0.25) + (tierScore * 0.20) + (relevance + sportsBoost + breakingBoost) * 0.15
      return { ...item, _score: score, category: classifyArticle(item.title, item.source, item.description) }
    })
    .sort((a, b) => b._score - a._score)
}

// ═══════════════════════════════════════════════════════════════════
// DEDUPLICATION — title similarity (word overlap ≥60%)
// ═══════════════════════════════════════════════════════════════════
function titleWords(title = '') {
  return new Set(title.toLowerCase().split(/[\s\-–—]+/).filter(w => w.length > 3))
}

export function deduplicateItems(items = []) {
  const seen = []
  const out = []
  for (const item of items) {
    const ws = titleWords(item.title)
    const isDup = seen.some(sw => {
      const inter = [...ws].filter(w => sw.has(w)).length
      const union = new Set([...ws, ...sw]).size
      return union > 0 && inter / union >= 0.60
    })
    if (!isDup) {
      seen.push(ws)
      out.push(item)
    }
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════
// LIGHTWEIGHT RSS FETCHER (fallback when server.js fetcher not injected)
// ═══════════════════════════════════════════════════════════════════
async function _fetchFeed(feed) {
  try {
    const r = await fetch(feed.url, {
      headers: {
        'User-Agent': 'DZ-Agent/4.0 (+https://dz-gpt.vercel.app) Algeria-first news engine',
        'Accept': 'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const xml = await r.text()
    const items = []
    const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi
    let m
    while ((m = itemRx.exec(xml)) !== null) {
      const block = m[1]
      const get = (tag) => {
        const rx = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')
        const r2 = block.match(rx)
        return r2 ? r2[1].replace(/<[^>]+>/g, '').trim() : ''
      }
      const title = get('title')
      if (!title) continue
      items.push({
        title,
        link:        get('link') || (block.match(/<link[^>]+href=["']([^"']+)/i) || [])[1] || '',
        description: get('description').slice(0, 350),
        pubDate:     get('pubDate') || get('dc:date') || get('updated') || '',
        source:      feed.name,
        feedName:    feed.name,
        tier:        feed.tier,
        feedType:    feed.type,
        lang:        feed.lang,
        trust:       feed.trust,
      })
      if (items.length >= 12) break
    }
    return { name: feed.name, items, fetchedAt: new Date().toISOString() }
  } catch (err) {
    console.warn(`[news] feed failed: ${feed.name} — ${err.message}`)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════
// PARALLEL FETCH
// ═══════════════════════════════════════════════════════════════════
export async function fetchFeedsParallel(feeds, { fetcher } = {}) {
  const fn = fetcher || _fetchFeed
  const results = await Promise.allSettled(feeds.map(f => fn(f)))
  const items = []
  for (let i = 0; i < results.length; i++) {
    const feed = feeds[i]
    if (results[i].status !== 'fulfilled' || !results[i].value) continue
    const value = results[i].value
    const feedItems = (value.items || []).map(it => ({
      ...it,
      feedName: it.feedName || feed.name,
      tier:     it.tier  ?? feed.tier,
      feedType: it.feedType || feed.type,
      source:   it.source || feed.name,
      trust:    it.trust  ?? feed.trust ?? 0.70,
      lang:     it.lang   || feed.lang,
    }))
    items.push(...feedItems)
  }
  return items
}

// ═══════════════════════════════════════════════════════════════════
// MAIN API — getTopNews
// ═══════════════════════════════════════════════════════════════════
export async function getTopNews({ query = '', limit = 15, sportsContext = false, techContext = false, fetcher } = {}) {
  const key = makeKey('news_v2', query, { limit, sportsContext: !!sportsContext, techContext: !!techContext })
  const cached = newsCache.get(key)
  if (cached) return { ...cached, cached: true }

  // Select feeds by intent
  let feeds
  if (sportsContext) {
    feeds = [...SPORTS_FEEDS, ...ALGERIA_FEEDS.filter(f => f.type !== 'sports')]
  } else if (techContext) {
    feeds = [...TECH_FEEDS, ...ALGERIA_FEEDS, ...GLOBAL_FEEDS.slice(0, 2)]
  } else {
    feeds = FEED_MANIFEST
  }

  const raw  = await fetchFeedsParallel(feeds, { fetcher })
  const deduped = deduplicateItems(raw.filter(it => !isSpam(it)))
  const ranked  = smartRank(deduped, { query, sportsContext }).slice(0, limit)
  const breaking = detectBreakingEvents(deduped)

  const payload = {
    query,
    fetchedAt: new Date().toISOString(),
    breaking,
    counts: {
      total:    raw.length,
      deduped:  deduped.length,
      algeria:  deduped.filter(i => i.tier === 1).length,
      arabic:   deduped.filter(i => i.tier === 2 || i.tier === 3).length,
      sports:   deduped.filter(i => i.feedType === 'sports').length,
      tech:     deduped.filter(i => i.feedType === 'tech').length,
      global:   deduped.filter(i => i.tier === 6).length,
      kept:     ranked.length,
    },
    items: ranked,
  }
  newsCache.set(key, payload)
  return payload
}

// ═══════════════════════════════════════════════════════════════════
// BACKGROUND WARM-UP — pre-fetch on server start
// ═══════════════════════════════════════════════════════════════════
export async function warmUp({ fetcher } = {}) {
  try {
    await Promise.all([
      getTopNews({ query: 'الجزائر اليوم', limit: 15, fetcher }),
      getTopNews({ query: 'كرة القدم الجزائر', limit: 10, sportsContext: true, fetcher }),
      getTopNews({ query: 'ذكاء اصطناعي تقنية', limit: 8, techContext: true, fetcher }),
    ])
    return { ok: true, warmedAt: new Date().toISOString() }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
