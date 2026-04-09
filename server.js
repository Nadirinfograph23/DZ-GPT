import express from 'express'
import { fileURLToPath } from 'url'
import path from 'path'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'
const PORT = 5000

const app = express()
app.use(express.json())

// ===== API ROUTE =====
app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body

  const apiKey = process.env.AI_API_KEY
  const apiUrl = process.env.AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions'

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured.' })
  }

  const groqModelMap = {
    'chatgpt': 'llama-3.3-70b-versatile',
    'llama-70b': 'llama-3.3-70b-versatile',
    'llama-8b': 'llama-3.1-8b-instant',
    'gpt-oss-120b': 'openai/gpt-oss-120b',
    'gpt-oss-20b': 'openai/gpt-oss-20b',
    'llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen': 'qwen/qwen3-32b',
    'compound': 'groq/compound',
    'compound-mini': 'groq/compound-mini',
    'deepseek-pdf': 'llama-3.3-70b-versatile',
    'ocr-dz': 'llama-3.3-70b-versatile',
  }

  const actualModel = groqModelMap[model] || model

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: actualModel,
        messages,
        max_tokens: 4096,
        temperature: 0.7,
        stream: false,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'API provider returned an error',
      })
    }

    let content = data.choices?.[0]?.message?.content || 'No response generated.'

    if (content) {
      const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (cleaned) content = cleaned
    }

    return res.status(200).json({ content })
  } catch (error) {
    console.error('Chat API error:', error)
    return res.status(500).json({ error: 'Failed to generate response. Please try again.' })
  }
})

// ===== DZ AGENT SEARCH ROUTE =====
app.post('/api/dz-agent-search', async (req, res) => {
  const { query } = req.body
  if (!query) return res.status(400).json({ error: 'Query required.' })

  console.log(`[DZ Search] Query: ${query}`)

  const signal = AbortSignal.timeout(8000)

  // Run all sources in parallel for speed
  const [ddgResult, wikiResult, wikidataResult, soResult] = await Promise.allSettled([

    // ── DuckDuckGo Instant Answer ─────────────────────────────────────────────
    (async () => {
      const r = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { headers: { 'Accept': 'application/json' }, signal }
      )
      if (!r.ok) return []
      const ddg = await r.json()
      if (ddg.AbstractText) {
        return [{ source: 'DuckDuckGo', title: ddg.Heading || query, snippet: ddg.AbstractText.slice(0, 400), url: ddg.AbstractURL || undefined }]
      }
      if (ddg.RelatedTopics?.length > 0) {
        return ddg.RelatedTopics.slice(0, 2)
          .filter(t => t.Text)
          .map(t => ({ source: 'DuckDuckGo', title: t.Text.split(' - ')[0] || query, snippet: t.Text.slice(0, 300), url: t.FirstURL || undefined }))
      }
      return []
    })(),

    // ── Wikipedia (REST summary + search — proper server-side headers) ────────
    (async () => {
      const isArabic = /[\u0600-\u06FF]/.test(query)
      const lang = isArabic ? 'ar' : 'en'
      const wikiHeaders = { 'User-Agent': 'DZ-GPT/1.0 (https://dz-gpt.vercel.app)' }

      // Try REST summary first (fastest)
      try {
        const summaryR = await fetch(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.split(' ').slice(0, 3).join('_'))}`,
          { headers: wikiHeaders, signal }
        )
        if (summaryR.ok) {
          const s = await summaryR.json()
          if (s.extract) {
            return [{ source: 'Wikipedia', title: s.title, snippet: s.extract.slice(0, 400), url: s.content_urls?.desktop?.page }]
          }
        }
      } catch (_) {}

      // Fallback: search API (no origin param for server-side)
      const r = await fetch(
        `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=2`,
        { headers: wikiHeaders, signal }
      )
      if (!r.ok) return []
      const d = await r.json()
      return (d?.query?.search || []).slice(0, 1).map(p => ({
        source: 'Wikipedia',
        title: p.title,
        snippet: p.snippet.replace(/<[^>]*>/g, '').slice(0, 400),
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
      }))
    })(),

    // ── Wikidata ──────────────────────────────────────────────────────────────
    (async () => {
      const lang = /[\u0600-\u06FF]/.test(query) ? 'ar' : 'en'
      const r = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=${lang}&format=json&limit=2`,
        { headers: { 'User-Agent': 'DZ-GPT/1.0 (https://dz-gpt.vercel.app)' }, signal }
      )
      if (!r.ok) return []
      const d = await r.json()
      return (d?.search || []).slice(0, 1)
        .filter(e => e.description)
        .map(e => ({ source: 'Wikidata', title: e.label || query, snippet: e.description, url: e.concepturi || `https://www.wikidata.org/wiki/${e.id}` }))
    })(),

    // ── StackOverflow (code queries only) ────────────────────────────────────
    (async () => {
      const isCode = /\b(code|function|error|bug|api|python|javascript|js|react|node)\b/i.test(query)
      if (!isCode) return []
      const r = await fetch(
        `https://api.stackexchange.com/2.3/search?order=desc&sort=relevance&intitle=${encodeURIComponent(query)}&site=stackoverflow&pagesize=2`,
        { signal }
      )
      if (!r.ok) return []
      const d = await r.json()
      return (d?.items || []).slice(0, 1).map(item => ({
        source: 'StackOverflow',
        title: item.title,
        snippet: `${item.answer_count} إجابة · ${item.score} نقطة`,
        url: item.link,
      }))
    })(),
  ])

  const results = [
    ...(ddgResult.status === 'fulfilled' ? ddgResult.value : []),
    ...(wikiResult.status === 'fulfilled' ? wikiResult.value : []),
    ...(wikidataResult.status === 'fulfilled' ? wikidataResult.value : []),
    ...(soResult.status === 'fulfilled' ? soResult.value : []),
  ]

  console.log(`[DZ Search] Returning ${results.length} results`)
  return res.status(200).json({ results })
})

// ===== RSS FEED SYSTEM FOR DZ AGENT =====
const RSS_CACHE = new Map()
const RSS_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

const RSS_FEEDS = {
  national: [
    { name: 'APS وكالة الأنباء', url: 'https://www.aps.dz/ar/feed' },
    { name: 'الشروق أونلاين', url: 'https://www.echoroukonline.com/feed' },
    { name: 'النهار', url: 'https://www.ennaharonline.com/feed/' },
    { name: 'الخبر', url: 'https://www.elkhabar.com/rss' },
    { name: 'البلاد', url: 'https://www.elbilad.net/feed/' },
    { name: 'الجزيرة', url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9' },
    { name: 'BBC عربي', url: 'http://feeds.bbci.co.uk/arabic/rss.xml' },
  ],
  sports: [
    { name: 'سبورت 360', url: 'https://arabic.sport360.com/feed/' },
    { name: 'الجزيرة الرياضة', url: 'https://www.aljazeera.net/aljazeerarss/a5a4f016-e494-4734-9d83-b1f26bfd8091/c65de6d9-3b39-4b75-a0ce-1b0e8f8e0db6' },
    { name: 'كووورة', url: 'https://www.kooora.com/?feed=rss' },
  ],
}

function parseRSS(xml, sourceName) {
  const items = []
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const getTag = (tag) => {
      const r = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))
      if (!r) return ''
      return r[1].replace(/<[^>]+>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&#\d+;/g,'').trim()
    }
    const rawLink = block.match(/<link>\s*(https?:\/\/[^\s<]+)/i)?.[1] || getTag('link') || ''
    const title = getTag('title')
    if (!title) continue
    items.push({
      title,
      link: rawLink,
      description: getTag('description').slice(0, 250),
      pubDate: getTag('pubDate') || getTag('dc:date') || '',
      source: sourceName,
    })
  }
  return items.slice(0, 8)
}

async function fetchRSSFeed(feed) {
  const cached = RSS_CACHE.get(feed.url)
  if (cached && Date.now() - cached.ts < RSS_CACHE_TTL) return cached.data

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const resp = await fetch(feed.url, {
      headers: { 'User-Agent': 'DZ-GPT-Agent/1.0 (+https://dz-gpt.vercel.app)', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) return null
    const xml = await resp.text()
    const items = parseRSS(xml, feed.name)
    const result = { name: feed.name, items, fetchedAt: new Date().toISOString() }
    RSS_CACHE.set(feed.url, { data: result, ts: Date.now() })
    return result
  } catch (err) {
    console.error(`[RSS] ${feed.name} fetch failed:`, err.message)
    return null
  }
}

async function fetchMultipleFeeds(feeds) {
  const results = await Promise.allSettled(feeds.map(f => fetchRSSFeed(f)))
  return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)
}

function detectLFPQuery(msg) {
  const lower = msg.toLowerCase()
  const lfpKw = [
    'الدوري الجزائري', 'الرابطة المحترفة', 'رابطة كرة القدم', 'lfp', 'lp1', 'ligue pro',
    'dz league', 'الجولة', 'نتائج الدوري', 'ترتيب الدوري', 'نتائج المباريات الجزائرية',
    'مباريات اليوم الجزائر', 'الفريق الجزائري', 'شباب الجزائر', 'مولودية الجزائر',
    'مولودية وهران', 'شبيبة القبائل', 'اتحاد العاصمة', 'نصر حسين داي', 'بلوزداد',
    'وفاق سطيف', 'شباب بلوزداد', 'جمعية الشلف', 'أهلي برج', 'أهلي شلف',
  ]
  return lfpKw.some(k => lower.includes(k))
}

function detectNewsQuery(msg) {
  const lower = msg.toLowerCase()
  const sportsKw = [
    'كرة','مباراة','مباريات','نتيجة','نتائج','هدف','أهداف','فريق','دوري','بطولة','كأس','مونديال',
    'ملعب','لاعب','تصفيات','رياضة','رياضي','المنتخب','الرابطة','football','soccer','sport','sports',
    'match','score','goal','team','league','cup','fifa','kooora','كووورة',
  ]
  const newsKw = [
    'أخبار','خبر','اليوم','الآن','آخر','جديد','تقرير','حدث','أحداث','عاجل','بيان',
    'news','latest','today','breaking','recent','actualité','nouvelles','aujourd','حوادث',
    'الجزائر','سياسة','اقتصاد','صحة','تعليم','برلمان','حكومة','وزير',
  ]
  const isSports = sportsKw.some(k => lower.includes(k))
  const isNews = newsKw.some(k => lower.includes(k))
  if (isSports && isNews) return 'both'
  if (isSports) return 'sports'
  if (isNews) return 'news'
  return null
}

function buildRSSContext(feedResults, queryType) {
  if (!feedResults.length) return ''
  const date = new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const label = queryType === 'sports' ? '⚽ نتائج وأخبار رياضية' : '📰 أخبار'
  let ctx = `\n\n--- ${label} — ${date} ---\n`
  for (const feed of feedResults) {
    if (!feed.items?.length) continue
    ctx += `\n**${feed.name}:**\n`
    for (const item of feed.items.slice(0, 4)) {
      ctx += `• ${item.title}`
      if (item.link) ctx += ` — ${item.link}`
      if (item.description) ctx += `\n  ${item.description}`
      ctx += '\n'
    }
  }
  ctx += '\n---\n'
  return ctx
}

// Endpoint: manual RSS fetch (for direct use)
app.get('/api/dz-agent/rss/:type', async (req, res) => {
  const type = req.params.type === 'sports' ? 'sports' : 'national'
  const feeds = RSS_FEEDS[type]
  const results = await fetchMultipleFeeds(feeds)
  res.json({ type, results, count: results.reduce((s, r) => s + (r?.items?.length || 0), 0) })
})

// ===== DZ AGENT DASHBOARD — Live Cards =====
const DASHBOARD_CACHE = { data: null, ts: 0 }
const DASHBOARD_TTL = 10 * 60 * 1000 // 10 min

const NEWS_FEEDS_DASHBOARD = [
  { name: 'APS', url: 'https://www.aps.dz/ar/feed' },
  { name: 'الشروق', url: 'https://www.echoroukonline.com/feed' },
  { name: 'النهار', url: 'https://www.ennaharonline.com/feed/' },
  { name: 'الخبر', url: 'https://www.elkhabar.com/rss' },
  { name: 'الجزيرة', url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9' },
  { name: 'BBC عربي', url: 'http://feeds.bbci.co.uk/arabic/rss.xml' },
]
const SPORTS_FEEDS_DASHBOARD = [
  { name: 'سبورت 360', url: 'https://arabic.sport360.com/feed/' },
  { name: 'الجزيرة الرياضة', url: 'https://www.aljazeera.net/aljazeerarss/a5a4f016-e494-4734-9d83-b1f26bfd8091/c65de6d9-3b39-4b75-a0ce-1b0e8f8e0db6' },
  { name: 'كووورة', url: 'https://www.kooora.com/?feed=rss' },
]

async function fetchWeatherAlgiers() {
  const WEATHER_CITIES = ['Algiers', 'Oran', 'Constantine']
  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    return WEATHER_CITIES.map(city => ({ city, temp: null, condition: null, icon: null, error: 'No API key' }))
  }
  const results = await Promise.allSettled(
    WEATHER_CITIES.map(async (city) => {
      const r = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=ar`,
        { signal: AbortSignal.timeout(6000) }
      )
      if (!r.ok) return { city, temp: null, condition: null, icon: null }
      const d = await r.json()
      return {
        city,
        temp: Math.round(d.main?.temp ?? null),
        condition: d.weather?.[0]?.description || null,
        icon: d.weather?.[0]?.icon || null,
        humidity: d.main?.humidity,
        wind: Math.round(d.wind?.speed ?? 0),
      }
    })
  )
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { city: WEATHER_CITIES[i], temp: null, condition: null, icon: null }
  )
}

app.get('/api/dz-agent/dashboard', async (_req, res) => {
  if (DASHBOARD_CACHE.data && Date.now() - DASHBOARD_CACHE.ts < DASHBOARD_TTL) {
    return res.json(DASHBOARD_CACHE.data)
  }

  const [newsFeeds, sportsFeeds, weather, lfpResult] = await Promise.allSettled([
    fetchMultipleFeeds(NEWS_FEEDS_DASHBOARD),
    fetchMultipleFeeds(SPORTS_FEEDS_DASHBOARD),
    fetchWeatherAlgiers(),
    fetchLFPData(),
  ])

  const allNews = (newsFeeds.status === 'fulfilled' ? newsFeeds.value : [])
    .flatMap(f => (f?.items || []).map(item => ({ ...item, feedName: f.name })))
    .slice(0, 12)

  const allSports = (sportsFeeds.status === 'fulfilled' ? sportsFeeds.value : [])
    .flatMap(f => (f?.items || []).map(item => ({ ...item, feedName: f.name })))
    .slice(0, 6)

  // Prepend LFP matches/articles to sports
  const lfpData = lfpResult.status === 'fulfilled' ? lfpResult.value : null
  const lfpSportsItems = []
  if (lfpData) {
    const played = lfpData.matches.filter(m => m.played)
    for (const m of played) {
      lfpSportsItems.push({
        title: `${m.home} ${m.homeScore} - ${m.awayScore} ${m.away}`,
        description: m.round || '',
        link: m.link || 'https://lfp.dz',
        pubDate: '',
        source: 'lfp.dz',
        feedName: '🏆 الدوري الجزائري',
      })
    }
    for (const a of (lfpData.articles || []).slice(0, 3)) {
      lfpSportsItems.push({
        title: a.title,
        description: '',
        link: a.link || 'https://lfp.dz',
        pubDate: a.date || '',
        source: 'lfp.dz',
        feedName: '🏆 رابطة LFP',
      })
    }
  }

  const weatherData = weather.status === 'fulfilled' ? weather.value : []

  const data = {
    news: allNews,
    sports: [...lfpSportsItems, ...allSports].slice(0, 12),
    weather: weatherData,
    lfp: lfpData || null,
    fetchedAt: new Date().toISOString(),
  }

  DASHBOARD_CACHE.data = data
  DASHBOARD_CACHE.ts = Date.now()
  return res.json(data)
})

// ===== PRAYER TIMES =====
const PRAYER_CACHE = new Map()
const PRAYER_CACHE_TTL = 12 * 60 * 1000 // 12 minutes

const ALGERIAN_CITIES = {
  'الجزائر': 'Algiers', 'الجزائر العاصمة': 'Algiers', 'algiers': 'Algiers',
  'وهران': 'Oran', 'oran': 'Oran',
  'قسنطينة': 'Constantine', 'constantine': 'Constantine',
  'عنابة': 'Annaba', 'annaba': 'Annaba',
  'بجاية': 'Bejaia', 'bejaia': 'Bejaia', 'béjaïa': 'Bejaia',
  'تلمسان': 'Tlemcen', 'tlemcen': 'Tlemcen',
  'سطيف': 'Setif', 'setif': 'Setif', 'sétif': 'Setif',
  'بسكرة': 'Biskra', 'biskra': 'Biskra',
  'تيزي وزو': 'Tizi Ouzou', 'tizi ouzou': 'Tizi Ouzou',
  'باتنة': 'Batna', 'batna': 'Batna',
  'البليدة': 'Blida', 'blida': 'Blida',
  'سكيكدة': 'Skikda', 'skikda': 'Skikda',
  'غرداية': 'Ghardaia', 'ghardaia': 'Ghardaia',
}

function detectCityFromQuery(text) {
  const lower = text.toLowerCase()
  for (const [ar, en] of Object.entries(ALGERIAN_CITIES)) {
    if (lower.includes(ar.toLowerCase())) return en
  }
  return 'Algiers'
}

async function fetchPrayerTimesAladhan(city, country = 'Algeria') {
  const cacheKey = `${city}-${country}`
  const cached = PRAYER_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < PRAYER_CACHE_TTL) return cached.data

  try {
    const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=2`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(`aladhan API error: ${r.status}`)
    const d = await r.json()
    if (d.code !== 200) throw new Error('aladhan returned non-200')
    const t = d.data?.timings
    const result = {
      city,
      country,
      source: 'aladhan.com',
      date: d.data?.date?.readable || new Date().toLocaleDateString('ar-DZ'),
      times: {
        'الفجر': t?.Fajr || '--',
        'الشروق': t?.Sunrise || '--',
        'الظهر': t?.Dhuhr || '--',
        'العصر': t?.Asr || '--',
        'المغرب': t?.Maghrib || '--',
        'العشاء': t?.Isha || '--',
      },
    }
    PRAYER_CACHE.set(cacheKey, { data: result, ts: Date.now() })
    return result
  } catch (err) {
    console.error('[Prayer] aladhan error:', err.message)
    return null
  }
}

app.get('/api/dz-agent/prayer', async (req, res) => {
  const city = req.query.city || 'Algiers'
  const data = await fetchPrayerTimesAladhan(city)
  if (!data) return res.status(503).json({ error: 'تعذّر جلب مواقيت الصلاة' })
  return res.json(data)
})

// ===== LFP.DZ SCRAPING =====
const LFP_CACHE = { data: null, ts: 0 }
const LFP_CACHE_TTL = 15 * 60 * 1000 // 15 min

function decodeHtmlEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
}

function decodeUnicodeEscapes(str) {
  return str.replace(/\\u([0-9A-Fa-f]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
}

function parseLFPMatches(html) {
  const matches = []
  const galleryRe = /gallery-data="([^"]+)"/g
  const roundRe = /<h5[^>]*match-card-round[^>]*>([\s\S]*?)<\/h5>/g
  const dateRe = /<div[^>]*match-date[^>]*>([\s\S]*?)<\/div>/g
  const timeRe = /<div[^>]*match-time[^>]*>([\s\S]*?)<\/div>/g
  const locationRe = /<div[^>]*match-location[^>]*>([\s\S]*?)<\/div>/g
  const btnRe = /window\.location\.href='\/ar\/match\/(\d+)'/g

  let roundMatches = [...html.matchAll(/<h5[^>]*match-card-round[^>]*>([\s\S]*?)<\/h5>/g)].map(m => m[1].trim())
  let dateMatches = [...html.matchAll(/<div[^>]*match-date[^>]*>([\s\S]*?)<\/div>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
  let timeMatches = [...html.matchAll(/<div[^>]*match-time[^>]*>([\s\S]*?)<\/div>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
  let matchIds = [...html.matchAll(/window\.location\.href='\/ar\/match\/(\d+)'/g)].map(m => m[1])

  let idx = 0
  let galleryMatch
  while ((galleryMatch = galleryRe.exec(html)) !== null) {
    try {
      const raw = decodeHtmlEntities(galleryMatch[1])
      const decoded = decodeUnicodeEscapes(raw)
      const data = JSON.parse(decoded)
      const home = data.clubHome?.name?.replace(/\\/g, '') || ''
      const away = data.clubAway?.name?.replace(/\\/g, '') || ''
      const homeScore = data.clubHome?.score
      const awayScore = data.clubAway?.score
      const matchId = matchIds[idx] || data.id
      matches.push({
        id: data.id,
        round: roundMatches[idx] || '',
        home,
        away,
        homeScore: homeScore === '-' ? null : homeScore,
        awayScore: awayScore === '-' ? null : awayScore,
        played: homeScore !== '-' && homeScore !== null && homeScore !== undefined,
        date: dateMatches[idx] || '',
        time: timeMatches[idx] || '',
        link: matchId ? `https://lfp.dz/ar/match/${matchId}` : '',
      })
    } catch {}
    idx++
  }
  return matches
}

function parseLFPArticles(html) {
  const articles = []
  const seen = new Set()

  // Split by recent-article blocks
  const blocks = html.split('<div class="recent-article">')
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]
    const altMatch = /alt="([^"]+)"/.exec(block)
    const hrefMatch = /href="(\/ar\/article\/(\d+))"/.exec(block)
    if (!altMatch || !hrefMatch) continue
    const title = altMatch[1].trim()
    const articleId = hrefMatch[2]
    if (title.length < 10 || title === 'LFP' || seen.has(articleId)) continue
    seen.add(articleId)
    articles.push({
      title,
      link: `https://lfp.dz${hrefMatch[1]}`,
      date: '',
    })
  }

  return articles
}

async function fetchLFPData() {
  if (LFP_CACHE.data && Date.now() - LFP_CACHE.ts < LFP_CACHE_TTL) return LFP_CACHE.data

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const headers = { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate', 'Accept-Language': 'ar,fr;q=0.9' }

  try {
    const [homeRes, articlesRes] = await Promise.allSettled([
      fetch('https://lfp.dz/ar', { headers, signal: AbortSignal.timeout(10000) }),
      fetch('https://lfp.dz/ar/articles', { headers, signal: AbortSignal.timeout(10000) }),
    ])

    const homeHtml = homeRes.status === 'fulfilled' && homeRes.value.ok ? await homeRes.value.text() : ''
    const articlesHtml = articlesRes.status === 'fulfilled' && articlesRes.value.ok ? await articlesRes.value.text() : ''

    const matches = homeHtml ? parseLFPMatches(homeHtml) : []
    const articles = articlesHtml ? parseLFPArticles(articlesHtml) : []

    const data = {
      matches,
      articles: articles.slice(0, 10),
      fetchedAt: new Date().toISOString(),
      source: 'lfp.dz',
    }

    LFP_CACHE.data = data
    LFP_CACHE.ts = Date.now()
    console.log(`[LFP] Scraped ${matches.length} matches, ${articles.length} articles`)
    return data
  } catch (err) {
    console.error('[LFP] Scraping error:', err.message)
    return LFP_CACHE.data || { matches: [], articles: [], fetchedAt: null, source: 'lfp.dz' }
  }
}

app.get('/api/dz-agent/lfp', async (_req, res) => {
  const data = await fetchLFPData()
  res.json(data)
})

// ===== SEARCH ENDPOINT =====
async function searchWeb(query) {
  const encodedQ = encodeURIComponent(query)

  // Try SearXNG public instance
  const searxInstances = [
    `https://searx.be/search?q=${encodedQ}&format=json&language=ar`,
    `https://search.mdosch.de/search?q=${encodedQ}&format=json`,
  ]

  for (const url of searxInstances) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'DZ-GPT-Agent/1.0' },
        signal: AbortSignal.timeout(6000),
      })
      if (!r.ok) continue
      const d = await r.json()
      const results = (d.results || []).slice(0, 5).map(item => ({
        title: item.title,
        url: item.url,
        snippet: item.content?.slice(0, 200) || '',
      }))
      if (results.length > 0) return { source: 'searxng', results }
    } catch { continue }
  }

  // Fallback: DuckDuckGo HTML scraping
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQ}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZAgent/1.0)' },
      signal: AbortSignal.timeout(7000),
    })
    if (r.ok) {
      const html = await r.text()
      const results = []
      const linkRe = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>/g
      const snippetRe = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g
      let lm, sm
      const links = [], snippets = []
      while ((lm = linkRe.exec(html)) !== null) links.push({ url: lm[1], title: lm[2] })
      while ((sm = snippetRe.exec(html)) !== null) snippets.push(sm[1])
      for (let i = 0; i < Math.min(links.length, 4); i++) {
        results.push({ title: links[i].title, url: links[i].url, snippet: snippets[i] || '' })
      }
      if (results.length > 0) return { source: 'duckduckgo', results }
    }
  } catch (err) { console.error('[Search] DDG error:', err.message) }

  return { source: 'none', results: [] }
}

app.post('/api/dz-agent/search', async (req, res) => {
  const { query } = req.body
  if (!query) return res.status(400).json({ error: 'query required' })
  const data = await searchWeb(query)
  return res.json(data)
})

// ===== VERCEL DEPLOY TRIGGER =====
const VERCEL_PROJECT_ID = 'prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5'

app.post('/api/dz-agent/deploy', async (req, res) => {
  const vercelToken = process.env.VERCEL_TOKEN
  if (!vercelToken) return res.status(500).json({ error: 'VERCEL_TOKEN not configured.' })

  try {
    // Get latest deployment to redeploy
    const listRes = await fetch(`https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=1`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
    })
    const listData = await listRes.json()
    const latestDeploy = listData.deployments?.[0]

    if (!latestDeploy) return res.status(404).json({ error: 'No deployment found to redeploy.' })

    const r = await fetch(`https://api.vercel.com/v13/deployments/${latestDeploy.uid}/redeploy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'production' }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || 'Deploy failed.', detail: d })
    return res.json({ success: true, message: 'Vercel deploy triggered.', url: `https://${d.url || 'dz-gpt.vercel.app'}` })
  } catch (err) {
    console.error('Vercel deploy error:', err)
    return res.status(500).json({ error: 'Failed to trigger deploy.' })
  }
})

// ===== DZ AGENT API ROUTE =====
app.post('/api/dz-agent-chat', async (req, res) => {
  const { messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array required.' })
  }

  const { currentRepo } = req.body
  const githubToken = req.body.githubToken || process.env.GITHUB_TOKEN || ''
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content?.trim() || ''
  const lowerMsg = lastUserMessage.toLowerCase()

  // ── Local knowledge base ──────────────────────────────────────────────────
  const developerQuestions = [
    'من هو مطورك', 'من صنعك', 'من برمجك', 'من أنشأك', 'من طورك', 'من طور dz agent', 'من صمم',
    'who is your developer', 'who made you', 'who created you', 'who built you', 'who programmed you', 'who designed you',
    'qui est votre développeur', 'qui vous a créé', "qui t'a créé", 'qui vous a fait', 'qui a développé',
    'who is dz agent developer', 'من هو مطور', 'مطور dz', 'مطور الوكيل',
  ]
  if (developerQuestions.some(q => lowerMsg.includes(q))) {
    return res.status(200).json({
      content: 'المطور هو: **نذير حوامرية - Nadir Infograph** 🇩🇿\nخبير في مجال الذكاء الاصطناعي',
    })
  }

  // ── GitHub command detection ──────────────────────────────────────────────
  const isListRepos = [
    'show my repos', 'list repos', 'my repositories', 'show repositories',
    'اعرض مستودعاتي', 'قائمة المستودعات', 'liste mes dépôts', 'montre mes dépôts',
    'show my repositories', 'list my repositories',
  ].some(p => lowerMsg.includes(p))

  if (isListRepos) {
    if (!githubToken) {
      return res.status(200).json({
        content: 'Please connect your GitHub token first. Click "Connect GitHub Token" at the top of the chat to add your Personal Access Token.',
      })
    }
    return res.status(200).json({ action: 'list-repos', content: 'Fetching your repositories...' })
  }

  // Detect: list files in repo
  const listFilesPatterns = [
    /show files? (?:in|of|for) ([^\s]+)/i,
    /browse ([^\s]+)/i,
    /open repo ([^\s]+)/i,
    /files? in ([^\s]+)/i,
    /اعرض ملفات ([^\s]+)/i,
    /montre les fichiers de ([^\s]+)/i,
  ]
  for (const pattern of listFilesPatterns) {
    const match = lastUserMessage.match(pattern)
    if (match) {
      const repo = match[1].includes('/') ? match[1] : (currentRepo || match[1])
      return res.status(200).json({ action: 'list-files', repo, content: `Listing files in ${repo}...` })
    }
  }

  // Detect: read/show file content
  const readFilePatterns = [
    /(?:read|show|open|view) (?:file )?["']?([^\s"']+\.[a-z]+)["']?/i,
    /اقرأ ملف ["']?([^\s"']+\.[a-z]+)["']?/i,
    /lis le fichier ["']?([^\s"']+\.[a-z]+)["']?/i,
  ]
  for (const pattern of readFilePatterns) {
    const match = lastUserMessage.match(pattern)
    if (match && currentRepo) {
      return res.status(200).json({ action: 'read-file', repo: currentRepo, path: match[1], content: `Reading ${match[1]}...` })
    }
  }

  // Detect: create PR / commit intent
  const isPRIntent = [
    'أنشئ pull request', 'انشئ pull request', 'إنشاء pull request',
    'أنشئ pr', 'انشئ pr', 'إنشاء pr', 'اعمل pr', 'اعمل pull request',
    'create pull request', 'create a pr', 'open a pr', 'create pr',
    'créer une pull request', 'créer un pr',
  ].some(p => lowerMsg.includes(p))

  const isCommitIntent = [
    'commit هذا', 'كوميت', 'احفظ التعديلات', 'احفظ الملف', 'commit this',
    'commit changes', 'commit the file', 'save to github', 'push commit',
    'commit and push', 'اعمل commit', 'ارفع التعديلات',
  ].some(p => lowerMsg.includes(p))

  if (isPRIntent && currentRepo && githubToken) {
    const branch = `dz-agent/${Date.now()}`
    return res.status(200).json({
      content: `سأقوم بإنشاء Pull Request في المستودع **${currentRepo}**.\n\nالفرع: \`${branch}\` ← \`main\`\n\nهل تريد المتابعة؟`,
      pendingAction: {
        type: 'pr',
        repo: currentRepo,
        title: `DZ Agent: تحسينات تلقائية`,
        body: `Pull Request تلقائي من DZ Agent\n\nطُلب بواسطة: ${lastUserMessage}`,
        branch,
        base: 'main',
      },
    })
  }

  if (isCommitIntent && currentRepo && githubToken) {
    return res.status(200).json({
      content: `لإتمام الـ Commit، حدد الملف الذي تريد حفظ تعديلاته في مستودع **${currentRepo}**.\n\nيمكنك فتح الملف أولاً باستخدام FileViewer ثم طلب الـ Commit.`,
    })
  }

  // Detect: generate code request
  const isGenerateCode = [
    'generate', 'write a', 'create a script', 'create a function', 'write code',
    'انشئ', 'اكتب كود', 'اكتب سكريبت', 'génère', 'écris un script',
  ].some(p => lowerMsg.includes(p))

  if (isGenerateCode) {
    // Let AI handle it but inject code generation context
  }

  // ── Prayer times detection ────────────────────────────────────────────────
  const prayerKeywords = [
    'مواقيت الصلاة', 'وقت الصلاة', 'أوقات الصلاة', 'موعد الصلاة', 'الآذان',
    'الفجر','الظهر','العصر','المغرب','العشاء',
    'prayer times', 'prayer time', 'salat', 'salah times', 'azan', 'adhan',
  ]
  const isPrayerQuery = prayerKeywords.some(k => lowerMsg.includes(k))
  let prayerContext = ''
  if (isPrayerQuery) {
    const city = detectCityFromQuery(lastUserMessage)
    const prayerData = await fetchPrayerTimesAladhan(city)
    if (prayerData) {
      const times = Object.entries(prayerData.times).map(([name, time]) => `• ${name}: ${time}`).join('\n')
      prayerContext = `\n\n--- 🕌 مواقيت الصلاة في ${city} — ${prayerData.date} ---\n${times}\n(المصدر: ${prayerData.source})\n---`
    }
  }

  // ── LFP (الدوري الجزائري المحترف) detection ──────────────────────────────
  let lfpContext = ''
  const isLFPQuery = detectLFPQuery(lastUserMessage)
  if (isLFPQuery) {
    console.log('[DZ Agent] LFP query detected — fetching from lfp.dz')
    const lfpData = await fetchLFPData()
    if (lfpData && (lfpData.matches.length > 0 || lfpData.articles.length > 0)) {
      const fetchDate = lfpData.fetchedAt ? new Date(lfpData.fetchedAt).toLocaleString('ar-DZ') : ''
      lfpContext = `\n\n--- ⚽ الرابطة الجزائرية المحترفة (LFP) — المصدر: lfp.dz — ${fetchDate} ---\n`

      const played = lfpData.matches.filter(m => m.played)
      const upcoming = lfpData.matches.filter(m => !m.played)

      if (played.length > 0) {
        lfpContext += `\n**نتائج المباريات:**\n`
        for (const m of played) {
          lfpContext += `• ${m.round}: ${m.home} **${m.homeScore} - ${m.awayScore}** ${m.away}`
          if (m.date) lfpContext += ` (${m.date})`
          if (m.link) lfpContext += ` — ${m.link}`
          lfpContext += '\n'
        }
      }

      if (upcoming.length > 0) {
        lfpContext += `\n**مباريات قادمة:**\n`
        for (const m of upcoming.slice(0, 6)) {
          lfpContext += `• ${m.round}: ${m.home} vs ${m.away}`
          if (m.date) lfpContext += ` — ${m.date}`
          if (m.time) lfpContext += ` ${m.time}`
          lfpContext += '\n'
        }
      }

      if (lfpData.articles.length > 0) {
        lfpContext += `\n**أخبار رابطة LFP:**\n`
        for (const a of lfpData.articles.slice(0, 5)) {
          lfpContext += `• ${a.title}`
          if (a.link) lfpContext += ` — ${a.link}`
          lfpContext += '\n'
        }
      }

      lfpContext += '\n---'
    }
  }

  // ── RSS News/Sports detection and fetch ───────────────────────────────────
  let rssContext = ''
  const newsQueryType = detectNewsQuery(lastUserMessage)
  if (newsQueryType && !isPrayerQuery) {
    console.log(`[DZ Agent] News query detected: ${newsQueryType}`)
    let feedsToFetch = []
    if (newsQueryType === 'sports') feedsToFetch = RSS_FEEDS.sports
    else if (newsQueryType === 'news') feedsToFetch = RSS_FEEDS.national
    else feedsToFetch = [...RSS_FEEDS.national, ...RSS_FEEDS.sports]

    const feedResults = await fetchMultipleFeeds(feedsToFetch)
    if (feedResults.length > 0) {
      rssContext = buildRSSContext(feedResults, newsQueryType)
      console.log(`[DZ Agent] RSS fetched: ${feedResults.length} sources, context length: ${rssContext.length}`)
    }
  }

  // ── AI response with GitHub-aware system prompt ───────────────────────────
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  const ollamaUrl = process.env.OLLAMA_PROXY_URL
  const groqKey = process.env.AI_API_KEY

  const systemPrompt = `You are DZ Agent — a powerful multilingual AI assistant, Algerian news aggregator, and GitHub code agent created by **Nadir Houamria (Nadir Infograph)**, an expert in Artificial Intelligence.

## Your Capabilities
- **Algerian & Sports News**: Real-time RSS feeds (APS, النهار, البلاد, الحياة, كووورة, FIFA)
- **🏆 الدوري الجزائري المحترف**: Live data scraped directly from lfp.dz — matches, results, news
- **GitHub Integration**: Browse, read, create, edit files; create commits; open Pull Requests
- **Code Intelligence**: Analyze, debug, generate, and improve code in any language
- **AI-Powered Answers**: Always respond using the most capable AI model available on this platform
- **Multilingual**: Respond in Arabic, English, or French — matching the user's language

## Key Rules
1. **ALWAYS use AI reasoning** to formulate every response — never dump raw data without explanation
2. When RSS data is available, interpret and summarize it meaningfully with context
3. For LFP data: present match results in a clear table or list format with scores highlighted
4. For code requests: include comments, follow best practices, use proper error handling, format in markdown code blocks
5. For GitHub actions (commit, PR): clearly describe what you will do and ask for confirmation
6. Be concise, structured, and helpful. Use markdown formatting

${prayerContext ? `## Prayer Times Data (real-time from aladhan.com)\n${prayerContext}\n\nPresent these prayer times clearly and beautifully. NEVER generate or guess prayer times — always use the data above.` : ''}

${lfpContext ? `## 🏆 الدوري الجزائري المحترف — بيانات مباشرة من lfp.dz\n${lfpContext}\n\nاعرض هذه النتائج بتنسيق جميل وواضح. لا تختلق نتائج أو أرقام من عندك — استخدم فقط البيانات أعلاه.` : ''}

${rssContext ? `## Live News/Sports Data (fetched now)\n${rssContext}\n\nSummarize and explain this data in a helpful way. Include source links when available.` : ''}

${githubToken ? `## GitHub Status\nGitHub is connected ✓. Current repo: ${currentRepo || 'none selected'}.\nYou can: list files, read code, create commits, and open Pull Requests.` : '## GitHub Status\nGitHub is not connected. Remind the user to connect GitHub if they ask about repos or code editing.'}`

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  const callGroqModel = async (model) => {
    if (!groqKey) return null
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model, messages: apiMessages, max_tokens: 3000, temperature: 0.7, stream: false }),
      })
      if (!r.ok) return null
      const d = await r.json()
      let content = d.choices?.[0]?.message?.content || null
      if (content) {
        const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        if (cleaned) content = cleaned
      }
      return content
    } catch (err) {
      console.error(`Groq ${model} error:`, err.message)
      return null
    }
  }

  // ── Fallback chain: DeepSeek → Ollama → Groq models (auto-fallback) ──────
  if (deepseekKey) {
    try {
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: apiMessages, max_tokens: 3000, temperature: 0.7, stream: false }),
      })
      if (r.ok) {
        const d = await r.json()
        const content = d.choices?.[0]?.message?.content
        if (content) return res.status(200).json({ content })
      }
    } catch (err) { console.error('DeepSeek error:', err.message) }
  }

  if (ollamaUrl) {
    try {
      const r = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama3', messages: apiMessages, stream: false }),
      })
      if (r.ok) { const d = await r.json(); const c = d.message?.content; if (c) return res.status(200).json({ content: c }) }
    } catch (err) { console.error('Ollama error:', err.message) }
  }

  // Auto-fallback to Groq models (most powerful first)
  const fallbackModels = [
    'llama-3.3-70b-versatile',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen/qwen3-32b',
    'llama-3.1-8b-instant',
  ]
  for (const model of fallbackModels) {
    const content = await callGroqModel(model)
    if (content) return res.status(200).json({ content, fallbackModel: model })
  }

  // If RSS context available, return it directly even without AI
  if (rssContext) {
    return res.status(200).json({
      content: `${rssContext}\n\n---\n> **ملاحظة:** لتلقي إجابات أكثر ذكاءً وتلخيصاً للأخبار، يمكن إضافة مفتاح \`AI_API_KEY\` (Groq) في إعدادات المشروع.`,
    })
  }

  return res.status(200).json({
    content: 'مرحباً! أنا **DZ Agent** — مساعدك الذكي الجزائري 🇩🇿\n\n**أستطيع مساعدتك في:**\n- 📰 أخبار الجزائر الوطنية (APS، النهار، البلاد)\n- ⚽ نتائج مباريات كرة القدم (كووورة، FIFA)\n- 🗂️ إدارة مستودعات GitHub (قراءة، تعديل، Commit، PR)\n- 💻 تحليل وإنشاء الأكواد البرمجية\n- 🤖 الإجابة على أسئلتك بالعربية أو الإنجليزية أو الفرنسية\n\nجرّب: **"أخبار اليوم"** أو **"اعرض مستودعاتي"** أو **"اكتب لي دالة Python"**',
  })
})

// ===== DZ AGENT GITHUB API ROUTES =====

// Helper: GitHub API fetch with token
async function ghFetch(endpoint, token, options = {}) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  return res
}

// ===== GITHUB OAUTH =====
// In-memory CSRF state store (auto-expires after 10 minutes)
const oauthStates = new Map()

function cleanOldStates() {
  const now = Date.now()
  for (const [key, val] of oauthStates) {
    if (now - val.ts > 10 * 60 * 1000) oauthStates.delete(key)
  }
}

function getBaseUrl(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`
  const proto = req.headers['x-forwarded-proto'] || req.protocol
  return `${proto}://${req.get('host')}`
}

app.get('/api/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) {
    return res.status(500).send('GitHub OAuth غير مُهيَّأ. أضف GITHUB_CLIENT_ID إلى الأسرار.')
  }
  cleanOldStates()
  const state = crypto.randomUUID()
  oauthStates.set(state, { ts: Date.now() })
  const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`
  const scope = 'repo user read:user'
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`
  res.redirect(authUrl)
})

app.get('/api/auth/github/callback', async (req, res) => {
  const { code, state } = req.query
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!code || !clientId || !clientSecret) {
    return res.redirect('/dz-agent?auth_error=config')
  }

  // CSRF validation
  if (!state || !oauthStates.has(state)) {
    console.warn('GitHub OAuth: invalid or missing state (possible CSRF)')
    return res.redirect('/dz-agent?auth_error=csrf')
  }
  oauthStates.delete(state)

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    })
    const data = await tokenRes.json()

    if (data.access_token) {
      return res.redirect(`/dz-agent#gh_oauth=${data.access_token}`)
    } else {
      console.error('GitHub OAuth error:', data.error_description || data.error)
      return res.redirect('/dz-agent?auth_error=denied')
    }
  } catch (err) {
    console.error('GitHub OAuth callback error:', err)
    return res.redirect('/dz-agent?auth_error=server')
  }
})

// Check if server has GitHub token configured (also fetches authenticated user info)
app.get('/api/dz-agent/github/status', async (_req, res) => {
  const token = process.env.GITHUB_TOKEN
  const hasOAuth = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
  if (!token) return res.status(200).json({ connected: false, oauthEnabled: hasOAuth })
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0' }
    })
    if (!r.ok) return res.status(200).json({ connected: true, oauthEnabled: hasOAuth })
    const u = await r.json()
    res.status(200).json({
      connected: true,
      oauthEnabled: hasOAuth,
      user: { login: u.login, name: u.name || u.login, avatar: u.avatar_url, url: u.html_url, repos: u.public_repos }
    })
  } catch (_) {
    res.status(200).json({ connected: true, oauthEnabled: hasOAuth })
  }
})

// List repositories
app.post('/api/dz-agent/github/repos', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  if (!token) return res.status(400).json({ error: 'GitHub token required.' })

  try {
    const response = await ghFetch('/user/repos?sort=updated&per_page=50&type=all', token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to fetch repos' })

    const repos = data.map(r => ({
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      language: r.language,
      private: r.private,
      default_branch: r.default_branch,
      html_url: r.html_url,
    }))

    return res.status(200).json({ repos })
  } catch (err) {
    console.error('GitHub repos error:', err)
    return res.status(500).json({ error: 'Failed to fetch repositories.' })
  }
})

// List files in repo/path
app.post('/api/dz-agent/github/files', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo, path = '' } = req.body
  if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })

  try {
    const endpoint = `/repos/${repo}/contents/${path}`
    const response = await ghFetch(endpoint, token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to list files' })

    const files = Array.isArray(data) ? data.map(f => ({
      name: f.name,
      path: f.path,
      type: f.type === 'dir' ? 'dir' : 'file',
      size: f.size,
    })) : []

    return res.status(200).json({ files })
  } catch (err) {
    console.error('GitHub files error:', err)
    return res.status(500).json({ error: 'Failed to list files.' })
  }
})

// Read file content
app.post('/api/dz-agent/github/file-content', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo, path } = req.body
  if (!token || !repo || !path) return res.status(400).json({ error: 'Token, repo, and path required.' })

  try {
    const response = await ghFetch(`/repos/${repo}/contents/${path}`, token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to read file' })

    if (data.encoding !== 'base64') return res.status(400).json({ error: 'Unsupported file encoding.' })
    const content = Buffer.from(data.content, 'base64').toString('utf-8')

    return res.status(200).json({ content, sha: data.sha, name: data.name })
  } catch (err) {
    console.error('GitHub file content error:', err)
    return res.status(500).json({ error: 'Failed to read file.' })
  }
})

// Analyze code with AI
app.post('/api/dz-agent/github/analyze', async (req, res) => {
  const { repo, path, content } = req.body
  if (!content) return res.status(400).json({ error: 'Content required for analysis.' })

  const groqKey = process.env.AI_API_KEY
  const deepseekKey = process.env.DEEPSEEK_API_KEY

  const prompt = `Analyze the following code from ${path || 'unknown file'} in repository ${repo || 'unknown repo'}.

Provide a comprehensive analysis including:
1. **Summary** — what the code does
2. **Issues** — bugs, anti-patterns, security vulnerabilities
3. **Improvements** — specific suggestions with code examples where appropriate
4. **Best Practices** — recommend any missing patterns or standards
5. **Unit Tests** — suggest 2-3 key test cases

Code:
\`\`\`
${content.slice(0, 8000)}
\`\`\``

  const apiMessages = [{ role: 'user', content: prompt }]

  const tryAPI = async (url, key, model, extra = {}) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages: apiMessages, max_tokens: 3000, temperature: 0.3, stream: false, ...extra }),
    })
    return r
  }

  try {
    let analysis = null

    if (deepseekKey) {
      const r = await tryAPI('https://api.deepseek.com/v1/chat/completions', deepseekKey, 'deepseek-chat')
      if (r.ok) { const d = await r.json(); analysis = d.choices?.[0]?.message?.content }
    }

    if (!analysis && groqKey) {
      const r = await tryAPI('https://api.groq.com/openai/v1/chat/completions', groqKey, 'llama-3.3-70b-versatile')
      if (r.ok) { const d = await r.json(); analysis = d.choices?.[0]?.message?.content }
    }

    if (!analysis) {
      analysis = `## Code Analysis: ${path}\n\n**File:** ${path}\n**Repo:** ${repo}\n\n> No AI API key configured. Connect a DEEPSEEK_API_KEY or AI_API_KEY (Groq) in your environment variables for full analysis.\n\n**Basic check:** The file contains ${content.split('\n').length} lines of code.`
    }

    if (analysis) {
      const cleaned = analysis.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (cleaned) analysis = cleaned
    }

    return res.status(200).json({ analysis })
  } catch (err) {
    console.error('Analyze error:', err)
    return res.status(500).json({ error: 'Analysis failed.' })
  }
})

// Generate code
app.post('/api/dz-agent/github/generate', async (req, res) => {
  const { description, language = 'python' } = req.body
  if (!description) return res.status(400).json({ error: 'Description required.' })

  const groqKey = process.env.AI_API_KEY
  const deepseekKey = process.env.DEEPSEEK_API_KEY

  const prompt = `Generate clean, well-commented ${language} code based on this description:\n\n${description}\n\nRequirements:\n- Add helpful comments\n- Follow best practices for ${language}\n- Include error handling where appropriate\n- Keep the code production-ready`

  const apiMessages = [{ role: 'user', content: prompt }]

  try {
    let code = null

    if (deepseekKey) {
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: apiMessages, max_tokens: 3000, temperature: 0.2 }),
      })
      if (r.ok) { const d = await r.json(); code = d.choices?.[0]?.message?.content }
    }

    if (!code && groqKey) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: apiMessages, max_tokens: 3000, temperature: 0.2 }),
      })
      if (r.ok) { const d = await r.json(); code = d.choices?.[0]?.message?.content }
    }

    if (!code) code = `# Generated code (mock — no API key configured)\n# Description: ${description}\n\nprint("Hello, World!")`

    if (code) {
      const cleaned = code.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (cleaned) code = cleaned
    }

    return res.status(200).json({ code })
  } catch (err) {
    console.error('Generate error:', err)
    return res.status(500).json({ error: 'Code generation failed.' })
  }
})

// Commit a file to GitHub
app.post('/api/dz-agent/github/commit', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo, path, content, message, branch } = req.body
  if (!token || !repo || !path || !content || !message) {
    return res.status(400).json({ error: 'Token, repo, path, content, and message are required.' })
  }

  try {
    // Get current file SHA (if exists, for update)
    let sha
    const existingRes = await ghFetch(`/repos/${repo}/contents/${path}`, token)
    if (existingRes.ok) {
      const existing = await existingRes.json()
      sha = existing.sha
    }

    const body = {
      message,
      content: Buffer.from(content).toString('base64'),
      ...(branch ? { branch } : {}),
      ...(sha ? { sha } : {}),
    }

    const commitRes = await ghFetch(`/repos/${repo}/contents/${path}`, token, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
    const commitData = await commitRes.json()

    if (!commitRes.ok) {
      return res.status(commitRes.status).json({ error: commitData.message || 'Commit failed.' })
    }

    return res.status(200).json({
      success: true,
      html_url: commitData.content?.html_url || `https://github.com/${repo}/blob/${branch || 'main'}/${path}`,
      sha: commitData.content?.sha,
    })
  } catch (err) {
    console.error('Commit error:', err)
    return res.status(500).json({ error: 'Commit failed.' })
  }
})

// Create Pull Request
app.post('/api/dz-agent/github/pr', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo, title, body, branch, base } = req.body
  if (!token || !repo || !title || !branch || !base) {
    return res.status(400).json({ error: 'Token, repo, title, branch, and base are required.' })
  }

  try {
    const prRes = await ghFetch(`/repos/${repo}/pulls`, token, {
      method: 'POST',
      body: JSON.stringify({ title, body: body || '', head: branch, base }),
    })
    const prData = await prRes.json()

    if (!prRes.ok) {
      return res.status(prRes.status).json({ error: prData.message || 'PR creation failed.' })
    }

    return res.status(200).json({ success: true, html_url: prData.html_url, number: prData.number })
  } catch (err) {
    console.error('PR error:', err)
    return res.status(500).json({ error: 'PR creation failed.' })
  }
})

// ===== EXPORT APP (for Vercel serverless) =====
export { app }

// ===== SERVE FRONTEND + START SERVER (only when run directly) =====
const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  if (isProd) {
    app.use(express.static(path.join(__dirname, 'dist')))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'))
    })
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`)
    })
  } else {
    // Dev: embed Vite as middleware so both API and frontend run on port 5000
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    })
    app.use(vite.middlewares)
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Dev server running on http://0.0.0.0:${PORT}`)
    })
  }
}
