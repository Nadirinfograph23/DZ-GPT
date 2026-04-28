// DZ Agent — RSS Live News Engine (Algeria-first).
// Wraps the existing fetchMultipleFeeds helper from server.js — no duplication.
// Adds a prioritized feed manifest, parallel fetching, ranking, and dedup.

import { rankAndTrim, isSpam } from './ranker.js'
import { newsCache, makeKey } from './cache.js'

// === FEED MANIFEST (Priority 1 → Priority 3) ==============================
// Every entry includes: name, url, tier (1=Algeria, 2=Arabic, 3=Global),
// type ('news' | 'sports' | 'aggregator'), and lang.
export const FEED_MANIFEST = [
  // ---------- Priority 1 — Algeria (MAX) ----------
  { name: 'APS (وكالة الأنباء الجزائرية)', url: 'https://www.aps.dz/ar/feed', tier: 1, type: 'news', lang: 'ar' },
  { name: 'Echorouk Online',               url: 'https://www.echoroukonline.com/feed', tier: 1, type: 'news', lang: 'ar' },
  { name: 'Ennahar Online',                url: 'https://www.ennaharonline.com/feed/', tier: 1, type: 'news', lang: 'ar' },
  { name: 'TSA Algérie',                   url: 'https://www.tsa-algerie.com/feed/',   tier: 1, type: 'news', lang: 'fr' },
  { name: 'El Bilad',                      url: 'https://www.elbilad.net/rss',         tier: 1, type: 'news', lang: 'ar' },
  { name: 'Djazairess (aggregator)',       url: 'https://www.djazairess.com/rss',      tier: 1, type: 'aggregator', lang: 'ar' },
  { name: 'El Heddaf',                     url: 'https://www.elheddaf.com/feed',       tier: 1, type: 'sports', lang: 'ar' },
  { name: 'El Hayat',                      url: 'https://elhayatdz.dz/feed/',          tier: 1, type: 'news', lang: 'ar' },
  { name: 'Google News — Algeria (AR)',    url: 'https://news.google.com/rss/search?q=الجزائر&hl=ar&gl=DZ&ceid=DZ:ar', tier: 1, type: 'news', lang: 'ar' },
  { name: 'Google News — Algeria (FR)',    url: 'https://news.google.com/rss/search?q=algerie&hl=fr&gl=DZ&ceid=DZ:fr', tier: 1, type: 'news', lang: 'fr' },

  // ---------- Priority 2 — Arabic ----------
  { name: 'Al Jazeera (AR)',  url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84f4f3b1e3d/73d0e1b4-532f-45ef-b135-bfdff8b8cab9', tier: 2, type: 'news', lang: 'ar' },
  { name: 'Al Arabiya (AR)',  url: 'https://www.alarabiya.net/feed/rss2/ar.xml', tier: 2, type: 'news', lang: 'ar' },
  { name: 'BBC Arabic',       url: 'https://feeds.bbci.co.uk/arabic/rss.xml',   tier: 2, type: 'news', lang: 'ar' },

  // ---------- Priority 3 — Global ----------
  { name: 'Reuters World',    url: 'https://feeds.reuters.com/reuters/worldNews',  tier: 3, type: 'news', lang: 'en' },
  { name: 'BBC World',        url: 'https://feeds.bbci.co.uk/news/world/rss.xml', tier: 3, type: 'news', lang: 'en' },
  { name: 'AP News — World',  url: 'https://news.google.com/rss/search?q=site:apnews.com+world&hl=en', tier: 3, type: 'news', lang: 'en' },
]

// Convenience selectors
export function feedsByTier(tier) { return FEED_MANIFEST.filter(f => f.tier === tier) }
export function feedsByType(type) { return FEED_MANIFEST.filter(f => f.type === type) }
export const ALGERIA_FEEDS  = feedsByTier(1)
export const ARABIC_FEEDS   = feedsByTier(2)
export const GLOBAL_FEEDS   = feedsByTier(3)
export const SPORTS_FEEDS   = feedsByType('sports')

// Lightweight RSS fetcher — used as a fallback when the server's
// fetchMultipleFeeds is not injected. Same XML parser strategy.
async function _fetchFeed(feed) {
  try {
    const r = await fetch(feed.url, {
      headers: {
        'User-Agent': 'DZ-Agent/3.0 (+https://dz-gpt.vercel.app)',
        'Accept': 'application/rss+xml,application/xml,text/xml,*/*',
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
        link: get('link') || (block.match(/<link[^>]+href=["']([^"']+)/i) || [])[1] || '',
        description: get('description').slice(0, 400),
        pubDate: get('pubDate') || get('dc:date') || '',
        source: feed.name,
        feedName: feed.name,
        tier: feed.tier,
        feedType: feed.type,
      })
      if (items.length >= 10) break
    }
    return { name: feed.name, items, fetchedAt: new Date().toISOString() }
  } catch (err) {
    console.warn(`[news] feed failed: ${feed.name} — ${err.message}`)
    return null
  }
}

// Fetch many feeds in parallel using either an injected fetcher (server.js
// provides one) or our local one. Always returns a flat list of items.
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
      tier: it.tier ?? feed.tier,
      feedType: it.feedType || feed.type,
      source: it.source || feed.name,
    }))
    items.push(...feedItems)
  }
  return items
}

// Main: get top N news items for a query, Algeria-first, with caching.
export async function getTopNews({ query = '', limit = 12, sportsContext = false, fetcher } = {}) {
  const key = makeKey('news', query, { limit, sportsContext: !!sportsContext })
  const cached = newsCache.get(key)
  if (cached) return { ...cached, cached: true }

  // Pick feeds by intent: sports → sports + Algeria; otherwise all tiers.
  const feeds = sportsContext
    ? [...SPORTS_FEEDS, ...ALGERIA_FEEDS.filter(f => f.type !== 'sports')]
    : FEED_MANIFEST

  const items = (await fetchFeedsParallel(feeds, { fetcher })).filter(it => !isSpam(it))
  const ranked = rankAndTrim(items, { query, sportsContext, limit })

  const payload = {
    query,
    fetchedAt: new Date().toISOString(),
    counts: {
      total: items.length,
      algeria: items.filter(i => i.tier === 1).length,
      arabic:  items.filter(i => i.tier === 2).length,
      global:  items.filter(i => i.tier === 3).length,
      kept:    ranked.length,
    },
    items: ranked,
  }
  newsCache.set(key, payload)
  return payload
}

// Background warm-up — pre-fetch top headlines so first user is fast.
export async function warmUp({ fetcher } = {}) {
  try {
    await getTopNews({ query: 'الجزائر اليوم', limit: 12, fetcher })
    await getTopNews({ query: 'كرة القدم الجزائر', limit: 8, sportsContext: true, fetcher })
    return { ok: true, warmedAt: new Date().toISOString() }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
