import express from 'express'
import { fileURLToPath } from 'url'
import path from 'path'
import crypto from 'crypto'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'
const PORT = 5000

const app = express()

// ===== SECURITY HEADERS =====
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https://openweathermap.org', 'https://avatars.githubusercontent.com'],
      connectSrc: isProd ? ["'self'"] : ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}))

// ===== CORS =====
const allowedOrigins = isProd
  ? [
      'https://dz-gpt.vercel.app',
      process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '',
      process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0].trim()}` : '',
    ].filter(Boolean)
  : true
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
}))

// ===== NO-CACHE IN DEVELOPMENT =====
if (!isProd) {
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/rss')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    }
    next()
  })
}

// ===== BODY SIZE LIMIT =====
app.use(express.json({ limit: '1mb' }))

// ===== RATE LIMITERS =====
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات كثيرة جداً. يرجى الانتظار دقيقة ثم المحاولة مجدداً.' },
})

const githubLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please wait a minute.' },
})

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait.' },
})

app.use('/api/chat', aiLimiter)
app.use('/api/dz-agent-chat', aiLimiter)
app.use('/api/dz-agent/github', githubLimiter)
app.use('/api/dz-agent-search', searchLimiter)
app.use('/api/dz-agent/search', searchLimiter)

// ===== INPUT SANITIZER =====
function sanitizeString(str, maxLen = 10000) {
  if (typeof str !== 'string') return ''
  return str.slice(0, maxLen).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

function isValidGithubPath(p) {
  if (typeof p !== 'string') return false
  if (p.includes('..') || p.includes('//') || p.startsWith('/')) return false
  return /^[a-zA-Z0-9._\-/\s]+$/.test(p)
}

function isValidGithubRepo(repo) {
  if (typeof repo !== 'string') return false
  return /^[a-zA-Z0-9._\-]+\/[a-zA-Z0-9._\-]+$/.test(repo)
}

// ===== GROQ MULTI-KEY FALLBACK =====
function getGroqKeys() {
  const keys = []
  for (let i = 1; i <= 10; i++) {
    const k = i === 1 ? process.env.AI_API_KEY : process.env[`AI_API_KEY_${i}`]
    if (k) keys.push(k)
  }
  return keys
}

async function callGroqWithFallback({ model, messages, max_tokens = 4096, temperature = 0.7 }) {
  const keys = getGroqKeys()
  if (keys.length === 0) return { content: null, error: 'API key not configured.' }

  for (const key of keys) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages, max_tokens, temperature, stream: false }),
      })
      const data = await r.json()
      if (r.status === 429 || (data.error?.code === 'rate_limit_exceeded')) {
        console.warn(`[Groq] Key rate-limited, trying next key...`)
        continue
      }
      if (!r.ok) return { content: null, error: data.error?.message || `Groq error ${r.status}` }
      let content = data.choices?.[0]?.message?.content || null
      if (content) {
        const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        if (cleaned) content = cleaned
      }
      return { content }
    } catch (err) {
      console.error(`[Groq] Key error: ${err.message}, trying next...`)
      continue
    }
  }
  return { content: null, error: 'All API keys exhausted or rate-limited. Please try again later.' }
}

// ===== API ROUTE =====
app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body

  if (getGroqKeys().length === 0) {
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
    const { content, error } = await callGroqWithFallback({ model: actualModel, messages })
    if (!content) return res.status(500).json({ error: error || 'No response generated.' })
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
    { name: 'جزايرس', url: 'https://www.djazairess.com/rss' },
  ],
  sports: [
    { name: 'سبورت 360', url: 'https://arabic.sport360.com/feed/' },
    { name: 'الجزيرة الرياضة', url: 'https://www.aljazeera.net/aljazeerarss/a5a4f016-e494-4734-9d83-b1f26bfd8091/c65de6d9-3b39-4b75-a0ce-1b0e8f8e0db6' },
    { name: 'كووورة', url: 'https://www.kooora.com/?feed=rss' },
    { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
    { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
    { name: 'APS رياضة', url: 'https://www.aps.dz/ar/sport/feed' },
  ],
}

// ===== FOOTBALL INTELLIGENCE SYSTEM =====
const FOOTBALL_CACHE = new Map()
const FOOTBALL_CACHE_TTL = 5 * 60 * 1000 // 5 min for live match data

const INTL_FOOTBALL_FEEDS = [
  { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
  { name: 'الجزيرة الرياضة', url: 'https://www.aljazeera.net/aljazeerarss/a5a4f016-e494-4734-9d83-b1f26bfd8091/c65de6d9-3b39-4b75-a0ce-1b0e8f8e0db6' },
  { name: 'سبورت 360', url: 'https://arabic.sport360.com/feed/' },
  { name: 'كووورة', url: 'https://www.kooora.com/?feed=rss' },
  { name: 'APS رياضة', url: 'https://www.aps.dz/ar/sport/feed' },
]

async function fetchSofaScoreFootball(dateStr) {
  const today = dateStr || new Date().toISOString().split('T')[0]
  const cacheKey = `sofascore_${today}`
  const cached = FOOTBALL_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < FOOTBALL_CACHE_TTL) return cached.data

  const sfHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8,fr;q=0.7',
    'Referer': 'https://www.sofascore.com/',
    'Origin': 'https://www.sofascore.com',
    'Cache-Control': 'no-cache',
  }

  const endpoints = [
    `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${today}`,
    `https://api.sofascore.com/api/v1/sport/football/events/live`,
  ]

  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: sfHeaders, signal: AbortSignal.timeout(10000) })
      if (!r.ok) { console.log(`[SofaScore] ${url} → ${r.status}`); continue }
      const d = await r.json()
      const events = d.events || []
      if (!events.length) continue

      const matches = events.slice(0, 30).map(e => {
        const isLive = e.status?.type === 'inprogress'
        const isFinished = e.status?.type === 'finished'
        const startTs = e.startTimestamp ? new Date(e.startTimestamp * 1000) : null
        return {
          homeTeam: e.homeTeam?.name || '',
          awayTeam: e.awayTeam?.name || '',
          homeScore: (isLive || isFinished) ? (e.homeScore?.current ?? null) : null,
          awayScore: (isLive || isFinished) ? (e.awayScore?.current ?? null) : null,
          status: e.status?.description || '',
          statusType: e.status?.type || '',
          competition: e.tournament?.name || '',
          country: e.tournament?.category?.country?.name || e.tournament?.category?.name || '',
          startTime: startTs ? startTs.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
          date: startTs ? startTs.toLocaleDateString('ar-DZ', { timeZone: 'Africa/Algiers' }) : today,
          id: e.id,
          source: 'SofaScore',
          link: e.id ? `https://www.sofascore.com/event/${e.id}` : 'https://www.sofascore.com',
        }
      })

      const data = { matches, fetchedAt: Date.now(), date: today, apiSource: url }
      FOOTBALL_CACHE.set(cacheKey, { data, ts: Date.now() })
      console.log(`[SofaScore] Fetched ${matches.length} matches from ${url}`)
      return data
    } catch (err) {
      console.error('[SofaScore] Error:', err.message)
    }
  }
  return null
}

function detectFootballQuery(msg) {
  const lower = msg.toLowerCase()
  const keywords = [
    // Arabic — general
    'مباراة', 'مباريات', 'نتيجة', 'نتائج', 'هدف', 'أهداف', 'بطولة', 'ملعب', 'تصفيات',
    'كرة القدم', 'الكرة', 'لاعب', 'مدرب', 'فريق', 'فرق', 'كأس', 'رياضة كرة',
    // Arabic — competitions
    'دوري أبطال', 'دوري الأبطال', 'تشامبيونز ليغ', 'يورو', 'كأس العالم', 'مونديال',
    'الدوري الإسباني', 'الليغا', 'الدوري الإنجليزي', 'البريميرليغ', 'بريميرليق',
    'الدوري الألماني', 'البوندسليغا', 'الدوري الإيطالي', 'السيريا', 'الدوري الفرنسي',
    'أمم أفريقيا', 'كان', 'أمم أوروبا', 'كاف', 'فيفا', 'يويفا',
    // Arabic — teams
    'ريال مدريد', 'برشلونة', 'بايرن', 'ليفربول', 'مانشستر', 'باريس سان جيرمان', 'يوفنتوس',
    'المنتخب الجزائري', 'منتخب الجزائر', 'الخضر', 'المنتخب الوطني', 'الفنك',
    // English
    'football', 'soccer', 'match result', 'match score', 'goal', 'league table', 'standings',
    'champions league', 'premier league', 'la liga', 'bundesliga', 'serie a', 'ligue 1',
    'world cup', 'euros', 'euro 2024', 'afcon', 'copa america', 'nations league',
    'real madrid', 'barcelona', 'liverpool', 'manchester', 'arsenal', 'chelsea', 'psg',
    'algeria', 'fennecs', 'sofascore', 'flashscore', 'live score', 'livescore',
    // French
    'résultat', 'ligue des champions', 'équipe nationale', 'coupe du monde', 'les verts',
  ]
  return keywords.some(k => lower.includes(k))
}

function buildFootballContext(sfData, rssFeeds, dateStr) {
  const date = dateStr || new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  let ctx = `\n\n--- ⚽ بيانات كرة القدم المباشرة — ${date} ---\n`

  if (sfData?.matches?.length) {
    const live = sfData.matches.filter(m => m.statusType === 'inprogress')
    const finished = sfData.matches.filter(m => m.statusType === 'finished')
    const upcoming = sfData.matches.filter(m => m.statusType === 'notstarted')

    if (live.length > 0) {
      ctx += `\n🔴 **مباريات جارية الآن (SofaScore):**\n`
      for (const m of live.slice(0, 10)) {
        ctx += `• ${m.homeTeam} **${m.homeScore ?? 0} - ${m.awayScore ?? 0}** ${m.awayTeam}`
        if (m.competition) ctx += ` | ${m.competition}`
        if (m.country) ctx += ` (${m.country})`
        ctx += ` — ${m.link}\n`
      }
    }

    if (finished.length > 0) {
      ctx += `\n✅ **نتائج المباريات (SofaScore):**\n`
      for (const m of finished.slice(0, 15)) {
        ctx += `• ${m.homeTeam} **${m.homeScore} - ${m.awayScore}** ${m.awayTeam}`
        if (m.competition) ctx += ` | ${m.competition}`
        if (m.country) ctx += ` (${m.country})`
        ctx += ` — ${m.link}\n`
      }
    }

    if (upcoming.length > 0) {
      ctx += `\n📅 **مباريات قادمة (SofaScore):**\n`
      for (const m of upcoming.slice(0, 10)) {
        ctx += `• ${m.homeTeam} vs ${m.awayTeam}`
        if (m.startTime) ctx += ` — ${m.startTime}`
        if (m.competition) ctx += ` | ${m.competition}`
        if (m.country) ctx += ` (${m.country})`
        ctx += ` — ${m.link}\n`
      }
    }
    ctx += `*(المصدر: SofaScore — ${new Date(sfData.fetchedAt).toLocaleTimeString('ar-DZ')})*\n`
  }

  if (rssFeeds?.length) {
    ctx += `\n📰 **أخبار كرة القدم (RSS):**\n`
    for (const feed of rssFeeds) {
      if (!feed?.items?.length) continue
      ctx += `\n**${feed.name}:**\n`
      for (const item of feed.items.slice(0, 3)) {
        ctx += `• ${item.title}`
        if (item.link) ctx += ` — ${item.link}`
        ctx += '\n'
      }
    }
  }

  ctx += '\n---\n'
  ctx += '> ⚠️ دائماً تحقق من المصدر الرسمي للنتائج الدقيقة.\n'
  return ctx
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
  { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
]

// ===== TECH INTELLIGENCE MODULE — RSS FEEDS =====
const TECH_FEEDS_DASHBOARD = [
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
  { name: 'Ars Technica', url: 'https://arstechnica.com/feed/' },
  { name: 'DEV.to', url: 'https://dev.to/feed' },
  { name: 'Stack Overflow Blog', url: 'https://stackoverflow.blog/feed/' },
  { name: 'Google News Tech', url: 'https://news.google.com/rss/search?q=technology+AI&hl=en' },
]

const TECH_CATEGORY_KEYWORDS = {
  'AI 🤖': ['ai', 'artificial intelligence', 'machine learning', 'gpt', 'llm', 'neural', 'model', 'openai', 'gemini', 'claude', 'deepseek', 'llama'],
  'Cybersecurity 🔐': ['security', 'hack', 'breach', 'vulnerability', 'cyber', 'malware', 'ransomware', 'phishing', 'exploit', 'cve'],
  'Startups 🚀': ['startup', 'raise', 'funding', 'series a', 'series b', 'venture', 'vc', 'valuation', 'acquisition', 'ipo'],
  'Big Tech 🏢': ['google', 'apple', 'microsoft', 'meta', 'amazon', 'nvidia', 'tesla', 'samsung', 'intel', 'qualcomm'],
}

function classifyTechArticle(title = '', desc = '') {
  const text = (title + ' ' + desc).toLowerCase()
  for (const [cat, keywords] of Object.entries(TECH_CATEGORY_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return cat
  }
  return 'Software 💻'
}

function computeTrendingScore(item, allItems) {
  let score = 40
  const titleWords = item.title.toLowerCase().split(/\s+/).filter(w => w.length > 4)
  const matches = allItems.filter(other =>
    other !== item && titleWords.some(w => other.title.toLowerCase().includes(w))
  )
  score += Math.min(matches.length * 8, 30)
  if (item.pubDate) {
    const ageMs = Date.now() - new Date(item.pubDate).getTime()
    const ageH = ageMs / 3600000
    if (ageH < 6) score += 30
    else if (ageH < 24) score += 20
    else if (ageH < 72) score += 10
  }
  const credibleSources = ['techcrunch', 'verge', 'wired', 'arstechnica']
  if (credibleSources.some(s => (item.feedName || '').toLowerCase().includes(s) || (item.source || '').toLowerCase().includes(s))) {
    score += 15
  }
  return Math.min(score, 100)
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  GN-RSS MODULE — Google News RSS Intelligence Layer             ║
// ║  ADD-ON ONLY — Does NOT modify any existing system             ║
// ╚══════════════════════════════════════════════════════════════════╝

const GN_RSS_CACHE = new Map()
const GN_RSS_TTL = 10 * 60 * 1000 // 10 minutes (Hybrid Mode default)

// ── Multilingual feed registry ──────────────────────────────────────────────
const GN_RSS_FEEDS = {
  ar: [
    { name: 'Google أخبار الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar' },
    { name: 'Google سياسة الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%B3%D9%8A%D8%A7%D8%B3%D8%A9&hl=ar&gl=DZ&ceid=DZ:ar' },
    { name: 'Google اقتصاد الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF&hl=ar&gl=DZ&ceid=DZ:ar' },
    { name: 'Google رياضة الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%B1%D9%8A%D8%A7%D8%B6%D8%A9&hl=ar&gl=DZ&ceid=DZ:ar' },
  ],
  fr: [
    { name: 'Google Algérie', url: 'https://news.google.com/rss/search?q=Alg%C3%A9rie&hl=fr&gl=DZ&ceid=DZ:fr' },
    { name: 'Google Algérie actualités', url: 'https://news.google.com/rss/search?q=Alg%C3%A9rie+actualit%C3%A9s&hl=fr&gl=DZ&ceid=DZ:fr' },
  ],
  en: [
    { name: 'Google Algeria News', url: 'https://news.google.com/rss/search?q=Algeria&hl=en&gl=DZ&ceid=DZ:en' },
    { name: 'Google World News', url: 'https://news.google.com/rss/search?q=world+news&hl=en&gl=US&ceid=US:en' },
    { name: 'Google Economy', url: 'https://news.google.com/rss/search?q=economy&hl=en&gl=US&ceid=US:en' },
    { name: 'Google Technology AI', url: 'https://news.google.com/rss/search?q=technology+AI&hl=en&gl=US&ceid=US:en' },
  ],
}

// ── GN-RSS category keywords ─────────────────────────────────────────────────
const GN_CATEGORIES = {
  'سياسة 🏛️':   ['سياسة', 'حكومة', 'وزير', 'برلمان', 'رئيس', 'انتخاب', 'دبلوماسية', 'politics', 'government', 'minister', 'parliament', 'president', 'election', 'politique', 'gouvernement'],
  'اقتصاد 💰':  ['اقتصاد', 'مالية', 'استثمار', 'تضخم', 'نمو', 'ميزانية', 'بورصة', 'economy', 'finance', 'investment', 'inflation', 'gdp', 'budget', 'économie', 'investissement'],
  'رياضة ⚽':   ['رياضة', 'مباراة', 'كرة', 'دوري', 'بطولة', 'لاعب', 'sport', 'football', 'match', 'league', 'tournament', 'player', 'score', 'goal', 'sport', 'foot'],
  'تكنولوجيا 💻': ['تكنولوجيا', 'تقنية', 'ذكاء اصطناعي', 'برمجة', 'tech', 'technology', 'ai', 'software', 'cybersecurity', 'startup', 'digital', 'technologie', 'numérique'],
  'صحة 🏥':    ['صحة', 'طب', 'مرض', 'علاج', 'مستشفى', 'لقاح', 'health', 'medical', 'disease', 'treatment', 'hospital', 'vaccine', 'santé', 'médecine'],
  'دولي 🌍':   ['دولي', 'عالمي', 'أمم متحدة', 'international', 'world', 'global', 'united nations', 'nato', 'international', 'mondial'],
}

// ── Detect query language ─────────────────────────────────────────────────────
function detectQueryLanguage(text) {
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'
  if (/[àâçéèêëîïôùûüœæ]/i.test(text) || /\b(algérie|actualités|économie|politique)\b/i.test(text)) return 'fr'
  return 'en'
}

// ── Classify GN article into category ────────────────────────────────────────
function classifyGNArticle(title = '', source = '') {
  const text = (title + ' ' + source).toLowerCase()
  for (const [cat, kws] of Object.entries(GN_CATEGORIES)) {
    if (kws.some(k => text.includes(k))) return cat
  }
  return 'محلي 🇩🇿'
}

// ── Fetch + parse GN-RSS feeds (uses shared fetchRSSFeed with GN cache key) ──
async function fetchGNRSSArticles(feeds) {
  const cacheKey = feeds.map(f => f.url).join('|')
  const cached = GN_RSS_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < GN_RSS_TTL) {
    console.log(`[GN-RSS] Cache hit: ${cached.data.length} articles`)
    return cached.data
  }

  // Parallel fetch (LIVE mode for fresh data)
  const settled = await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const r = await fetch(feed.url, {
          headers: { 'User-Agent': 'DZ-GPT-Agent/1.0 (+https://dz-gpt.vercel.app)', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' },
          signal: AbortSignal.timeout(8000),
        })
        if (!r.ok) return []
        const xml = await r.text()
        const items = parseRSS(xml, feed.name)
        return items.map(item => ({ ...item, gnSource: feed.name, language: feed.url.includes('hl=ar') ? 'ar' : feed.url.includes('hl=fr') ? 'fr' : 'en' }))
      } catch { return [] }
    })
  )

  const raw = settled.flatMap(s => s.status === 'fulfilled' ? s.value : [])
  const articles = deduplicateGNArticles(raw)
    .map(item => ({ ...item, category: classifyGNArticle(item.title, item.source) }))
    .sort((a, b) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime())
    .slice(0, 30)

  GN_RSS_CACHE.set(cacheKey, { data: articles, ts: Date.now() })
  console.log(`[GN-RSS] Fetched ${articles.length} articles from ${feeds.length} feeds`)
  return articles
}

// ── Deduplication (title similarity + URL match) ──────────────────────────────
function deduplicateGNArticles(articles) {
  const seen = new Set()
  const result = []
  for (const art of articles) {
    if (!art.title) continue
    // Normalize: lowercase, strip punctuation, keep first 60 chars as fingerprint
    const fingerprint = art.title.toLowerCase().replace(/[^\u0600-\u06FFa-z0-9\s]/g, '').trim().slice(0, 60)
    const urlKey = art.link ? art.link.split('?')[0] : ''
    if (seen.has(fingerprint) || (urlKey && seen.has(urlKey))) continue
    seen.add(fingerprint)
    if (urlKey) seen.add(urlKey)
    result.push(art)
  }
  return result
}

// ── Build GN-RSS context string for AI system prompt ─────────────────────────
function buildGNRSSContext(articles, label = '🌐 Google News RSS') {
  if (!articles.length) return ''
  const date = new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  let ctx = `\n\n--- ${label} — ${date} ---\n`

  // Group by category
  const byCategory = {}
  for (const art of articles) {
    const cat = art.category || 'عام'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(art)
  }

  for (const [cat, items] of Object.entries(byCategory)) {
    ctx += `\n**${cat}:**\n`
    for (const item of items.slice(0, 4)) {
      ctx += `• ${item.title}`
      if (item.source) ctx += ` [${item.source}]`
      if (item.link) ctx += ` — ${item.link}`
      if (item.pubDate) {
        try { ctx += ` (${new Date(item.pubDate).toLocaleDateString('ar-DZ')})` } catch {}
      }
      ctx += '\n'
    }
  }
  ctx += '\n---\n'
  ctx += '> مصدر: Google News RSS — بيانات آنية مصنّفة تلقائياً.\n'
  return ctx
}

// ── Background refresh helper (for Hybrid Mode) ───────────────────────────────
function refreshGNRSSInBackground(feeds) {
  const cacheKey = feeds.map(f => f.url).join('|')
  const cached = GN_RSS_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts > GN_RSS_TTL * 0.7) {
    // Refresh silently if cache is 70%+ expired
    fetchGNRSSArticles(feeds).catch(() => {})
  }
}

async function fetchWeatherAlgiers() {
  const WEATHER_CITIES = ['Algiers', 'Oran', 'Constantine', 'Annaba']
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

  const [newsFeeds, sportsFeeds, techFeeds, weather, lfpResult, gnRssResult] = await Promise.allSettled([
    fetchMultipleFeeds(NEWS_FEEDS_DASHBOARD),
    fetchMultipleFeeds(SPORTS_FEEDS_DASHBOARD),
    fetchMultipleFeeds(TECH_FEEDS_DASHBOARD),
    fetchWeatherAlgiers(),
    fetchLFPData(),
    // GN-RSS: fetch Arabic Algeria feeds for dashboard augmentation
    fetchGNRSSArticles(GN_RSS_FEEDS.ar),
  ])

  const existingNews = (newsFeeds.status === 'fulfilled' ? newsFeeds.value : [])
    .flatMap(f => (f?.items || []).map(item => ({ ...item, feedName: f.name })))

  // Merge GN-RSS articles with existing news (GN-RSS first for freshness, then deduplicate)
  const gnDashboardArticles = (gnRssResult.status === 'fulfilled' ? gnRssResult.value : [])
    .map(item => ({ ...item, feedName: item.gnSource || 'Google News' }))

  const allNews = deduplicateGNArticles([...gnDashboardArticles, ...existingNews])
    .slice(0, 18)

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

  // ── Tech Intelligence: classify + score + sort ────────────────────────────
  const rawTech = (techFeeds.status === 'fulfilled' ? techFeeds.value : [])
    .flatMap(f => (f?.items || []).map(item => ({ ...item, feedName: f.name })))

  const allTech = rawTech
    .filter((item, idx, arr) => arr.findIndex(x => x.title === item.title) === idx)
    .map(item => ({
      ...item,
      category: classifyTechArticle(item.title, item.description),
      trending_score: computeTrendingScore(item, rawTech),
    }))
    .sort((a, b) => b.trending_score - a.trending_score || new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 15)

  const data = {
    news: allNews,
    sports: [...lfpSportsItems, ...allSports].slice(0, 12),
    tech: allTech,
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

// ===== WEATHER BY CITY (single-city endpoint for user location) =====
const CITY_WEATHER_CACHE = new Map()
const CITY_WEATHER_TTL = 15 * 60 * 1000 // 15 min

app.get('/api/dz-agent/weather', async (req, res) => {
  const city = String(req.query.city || 'Algiers').slice(0, 80)
  const cacheKey = city.toLowerCase()
  const cached = CITY_WEATHER_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < CITY_WEATHER_TTL) return res.json(cached.data)

  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'OPENWEATHER_API_KEY not configured' })

  const tryFetch = async (q) => {
    const r = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&appid=${apiKey}&units=metric&lang=ar`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!r.ok) return null
    return r.json()
  }

  try {
    let d = await tryFetch(`${city},Algeria`)
    if (!d) d = await tryFetch(city)
    if (!d) return res.status(404).json({ error: `No weather data for: ${city}` })

    const result = {
      city,
      temp: Math.round(d.main?.temp ?? 0),
      feels_like: Math.round(d.main?.feels_like ?? 0),
      temp_min: Math.round(d.main?.temp_min ?? 0),
      temp_max: Math.round(d.main?.temp_max ?? 0),
      condition: d.weather?.[0]?.description || '',
      icon: d.weather?.[0]?.icon || null,
      humidity: d.main?.humidity,
      wind: Math.round(d.wind?.speed ?? 0),
      visibility: d.visibility ? Math.round(d.visibility / 1000) : null,
      fetchedAt: new Date().toISOString(),
    }
    CITY_WEATHER_CACHE.set(cacheKey, { data: result, ts: Date.now() })
    return res.json(result)
  } catch (err) {
    console.error('[Weather] Error:', err.message)
    return res.status(503).json({ error: 'Weather fetch failed' })
  }
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

// ===== FOOTBALL INTELLIGENCE ENDPOINT =====
app.get('/api/dz-agent/football', async (req, res) => {
  const dateStr = req.query.date || new Date().toISOString().split('T')[0]
  const [sfResult, rssResult, lfpResult] = await Promise.allSettled([
    fetchSofaScoreFootball(dateStr),
    fetchMultipleFeeds(INTL_FOOTBALL_FEEDS),
    fetchLFPData(),
  ])
  return res.json({
    sofascore: sfResult.status === 'fulfilled' ? sfResult.value : null,
    rss: rssResult.status === 'fulfilled' ? rssResult.value : [],
    lfp: lfpResult.status === 'fulfilled' ? lfpResult.value : null,
    date: dateStr,
    fetchedAt: new Date().toISOString(),
  })
})

// ===== CURRENCY EXCHANGE MODULE (DZD Base) =====
const CURRENCY_CACHE = { data: null, ts: 0, status: 'empty' }
const CURRENCY_TTL = 20 * 60 * 1000 // 20 minutes

const CURRENCY_SYMBOLS = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'TND', 'MAD', 'EGP', 'QAR', 'KWD', 'CAD', 'CHF', 'CNY', 'TRY', 'JPY']

function parseCurrencyXML(xml) {
  const rates = {}
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const code = block.match(/<targetCurrency>(.*?)<\/targetCurrency>/i)?.[1]?.trim().toUpperCase()
    const rate = block.match(/<exchangeRate>(.*?)<\/exchangeRate>/i)?.[1]?.trim()
    if (code && rate && CURRENCY_SYMBOLS.includes(code)) {
      const val = parseFloat(rate)
      if (!isNaN(val) && val > 0) rates[code] = +val.toFixed(6)
    }
  }
  return rates
}

async function fetchCurrencyFloatRates() {
  try {
    const r = await fetch('https://www.floatrates.com/daily/dzd.xml', {
      headers: { 'User-Agent': 'DZ-GPT-Agent/1.0', 'Accept': 'application/xml,text/xml,*/*' },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) throw new Error(`FloatRates HTTP ${r.status}`)
    const xml = await r.text()
    const rates = parseCurrencyXML(xml)
    if (Object.keys(rates).length === 0) throw new Error('No rates parsed from XML')
    return { base: 'DZD', provider: 'floatrates.com', rates, status: 'live', last_update: new Date().toISOString() }
  } catch (err) {
    console.error('[Currency] FloatRates failed:', err.message)
    return null
  }
}

async function fetchCurrencyFallback() {
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=DZD,EUR,GBP,SAR,AED,TND,MAD,EGP,QAR,KWD,CAD,CHF,CNY,TRY,JPY', {
      headers: { 'User-Agent': 'DZ-GPT-Agent/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) throw new Error(`exchangerate.host HTTP ${r.status}`)
    const d = await r.json()
    if (!d.rates?.DZD) throw new Error('No DZD rate found in response')
    const dzdPerUsd = d.rates.DZD
    const rates = {}
    for (const sym of CURRENCY_SYMBOLS) {
      if (sym === 'USD') { rates.USD = +(1 / dzdPerUsd).toFixed(6); continue }
      if (d.rates[sym]) rates[sym] = +(d.rates[sym] / dzdPerUsd).toFixed(6)
    }
    return { base: 'DZD', provider: 'exchangerate.host', rates, status: 'live', last_update: new Date().toISOString() }
  } catch (err) {
    console.error('[Currency] Fallback failed:', err.message)
    return null
  }
}

async function fetchCurrencyData(forceRefresh = false) {
  if (!forceRefresh && CURRENCY_CACHE.data && Date.now() - CURRENCY_CACHE.ts < CURRENCY_TTL) {
    return CURRENCY_CACHE.data
  }
  let data = await fetchCurrencyFloatRates()
  if (!data) data = await fetchCurrencyFallback()
  if (data) {
    CURRENCY_CACHE.data = data
    CURRENCY_CACHE.ts = Date.now()
    CURRENCY_CACHE.status = 'live'
    console.log(`[Currency] Refreshed from ${data.provider} — ${Object.keys(data.rates).length} currencies`)
    return data
  }
  if (CURRENCY_CACHE.data) {
    const stale = { ...CURRENCY_CACHE.data, status: 'stale', stale_since: new Date(CURRENCY_CACHE.ts).toISOString() }
    console.warn('[Currency] All sources failed — returning stale cache')
    return stale
  }
  return null
}

function detectCurrencyQuery(msg) {
  const lower = msg.toLowerCase()
  const kw = [
    'سعر الصرف', 'سعر الدولار', 'سعر اليورو', 'سعر الجنيه', 'سعر الريال',
    'الدينار الجزائري', 'دينار جزائري', 'دزد', 'dzd', 'صرف العملة', 'صرف العملات',
    'سعر العملة', 'سعر العملات', 'تحويل العملة', 'تحويل العملات', 'السوق السوداء',
    'دولار مقابل دينار', 'يورو مقابل دينار', 'كم الدولار', 'كم اليورو', 'كم الريال',
    'exchange rate', 'currency rate', 'dollar rate', 'euro rate', 'dzd rate', 'dinar rate',
    'usd to dzd', 'eur to dzd', 'convert currency', 'currency convert',
    'taux de change', 'euro en dinar', 'dollar en dinar', 'convertir devise',
  ]
  return kw.some(k => lower.includes(k))
}

function buildCurrencyContext(data) {
  if (!data) return ''
  const statusLabel = data.status === 'live' ? '🟢 محدّث' : '🟡 بيانات مؤقتة (stale)'
  const updated = data.last_update ? new Date(data.last_update).toLocaleString('ar-DZ') : ''
  const symbols = { USD: 'دولار أمريكي', EUR: 'يورو', GBP: 'جنيه إسترليني', SAR: 'ريال سعودي', AED: 'درهم إماراتي', TND: 'دينار تونسي', MAD: 'درهم مغربي', EGP: 'جنيه مصري', QAR: 'ريال قطري', KWD: 'دينار كويتي', CAD: 'دولار كندي', CHF: 'فرنك سويسري', CNY: 'يوان صيني', TRY: 'ليرة تركية', JPY: 'ين ياباني' }

  let ctx = `\n\n--- 💱 أسعار الصرف — ${statusLabel} — ${updated} (المصدر: ${data.provider}) ---\n`
  ctx += `\n**قيمة 1 دينار جزائري (DZD):**\n`
  for (const [code, rate] of Object.entries(data.rates)) {
    const name = symbols[code] || code
    const dzdPer = rate > 0 ? (1 / rate).toFixed(2) : '?'
    ctx += `• 1 DZD = **${rate}** ${code} (${name}) | 1 ${code} = **${dzdPer} DZD**\n`
  }
  if (data.status === 'stale') ctx += `\n⚠️ *البيانات المحفوظة — آخر تحديث: ${data.stale_since}*\n`
  ctx += '\n---\n'
  return ctx
}

// ─── Currency REST endpoint ────────────────────────────────────────────────
app.get('/api/currency/latest', async (req, res) => {
  const force = req.query.refresh === '1'
  const data = await fetchCurrencyData(force)
  if (!data) return res.status(503).json({ error: 'Currency data unavailable', status: 'unavailable' })
  return res.json(data)
})

// ─── Currency Conversion endpoint ─────────────────────────────────────────
app.get('/api/currency/convert', async (req, res) => {
  const { from = 'USD', to = 'DZD', amount = '1' } = req.query
  const fromCode = String(from).toUpperCase().slice(0, 5)
  const toCode = String(to).toUpperCase().slice(0, 5)
  const amt = parseFloat(amount)
  if (isNaN(amt) || amt < 0) return res.status(400).json({ error: 'Invalid amount' })

  const data = await fetchCurrencyData()
  if (!data) return res.status(503).json({ error: 'Currency data unavailable' })

  let result
  if (fromCode === 'DZD' && data.rates[toCode]) {
    result = +(amt * data.rates[toCode]).toFixed(4)
  } else if (toCode === 'DZD' && data.rates[fromCode]) {
    result = +(amt / data.rates[fromCode]).toFixed(4)
  } else if (data.rates[fromCode] && data.rates[toCode]) {
    const dzdAmt = amt / data.rates[fromCode]
    result = +(dzdAmt * data.rates[toCode]).toFixed(4)
  } else {
    return res.status(400).json({ error: `Unsupported currency pair: ${fromCode}/${toCode}` })
  }

  return res.json({
    from: fromCode, to: toCode, amount: amt, result,
    rate: +(result / amt).toFixed(6),
    provider: data.provider, status: data.status, last_update: data.last_update,
  })
})

// ─── Currency RSS feed ─────────────────────────────────────────────────────
app.get('/rss/currency/dzd', async (_req, res) => {
  const data = await fetchCurrencyData()
  const symbols = { USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', SAR: 'Saudi Riyal', AED: 'UAE Dirham', TND: 'Tunisian Dinar', MAD: 'Moroccan Dirham', EGP: 'Egyptian Pound', QAR: 'Qatari Riyal', KWD: 'Kuwaiti Dinar', CAD: 'Canadian Dollar', CHF: 'Swiss Franc', CNY: 'Chinese Yuan', TRY: 'Turkish Lira', JPY: 'Japanese Yen' }
  const updated = data?.last_update ? new Date(data.last_update).toUTCString() : new Date().toUTCString()

  let items = ''
  if (data?.rates) {
    for (const [code, rate] of Object.entries(data.rates)) {
      const name = symbols[code] || code
      const dzdPer = rate > 0 ? (1 / rate).toFixed(2) : '?'
      items += `    <item>
      <title>${code} to DZD</title>
      <description>1 ${code} (${name}) = ${dzdPer} DZD | 1 DZD = ${rate} ${code}</description>
      <pubDate>${updated}</pubDate>
      <guid isPermaLink="false">dzd-rate-${code}-${Date.now()}</guid>
    </item>\n`
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>DZD Currency Rates — Algerian Dinar Exchange Rates</title>
    <description>Live exchange rates against the Algerian Dinar (DZD). Source: ${data?.provider || 'N/A'}. Status: ${data?.status || 'unavailable'}.</description>
    <link>https://dz-gpt.vercel.app</link>
    <language>ar</language>
    <lastBuildDate>${updated}</lastBuildDate>
${items}  </channel>
</rss>`

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
  return res.send(xml)
})

// ─── Scheduled currency refresh (every 20 min) ────────────────────────────
setInterval(() => {
  fetchCurrencyData(true).catch(err => console.error('[Currency] Scheduled refresh failed:', err.message))
}, 20 * 60 * 1000)

// ===== SEARCH ENGINE: DJAZAIRESS SCRAPER + SEARXNG + DDG =====
async function searchDjazairess(query) {
  try {
    const encodedQ = encodeURIComponent(query)
    const url = `https://www.djazairess.com/search?q=${encodedQ}&sort=date`
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
        'Referer': 'https://www.djazairess.com/',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return []
    const html = await r.text()
    const results = []

    // Extract article titles and links from djazairess search results
    const articleRe = /<h2[^>]*class="[^"]*title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi
    const dateRe = /<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/gi
    const snippetRe = /<p[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/p>/gi

    let m
    const titles = []
    while ((m = articleRe.exec(html)) !== null && titles.length < 5) {
      titles.push({ url: m[1].startsWith('http') ? m[1] : `https://www.djazairess.com${m[1]}`, title: m[2].trim() })
    }

    const dates = []
    while ((m = dateRe.exec(html)) !== null) dates.push(m[1].trim())
    const snippets = []
    while ((m = snippetRe.exec(html)) !== null) snippets.push(m[1].trim())

    for (let i = 0; i < titles.length; i++) {
      results.push({
        title: titles[i].title,
        url: titles[i].url,
        snippet: snippets[i] || '',
        date: dates[i] || '',
        source: 'djazairess',
      })
    }
    return results
  } catch (err) {
    console.error('[Djazairess] error:', err.message)
    return []
  }
}

// ===== PARSE DATE FOR SORTING =====
function parseResultDate(item) {
  const raw = item.publishedDate || item.date || item.pubDate || ''
  if (!raw) return 0
  try { return new Date(raw).getTime() } catch { return 0 }
}

async function searchWeb(query) {
  const encodedQ = encodeURIComponent(query)
  // Add recency hint: prefer recent results
  const recentQ = encodeURIComponent(query + ' 2024 2025')

  // --- Run all engines in parallel ---
  const [searxResult, ddgResult, djazairessResult] = await Promise.allSettled([
    // SearXNG with recency sort
    (async () => {
      const searxInstances = [
        `https://searx.be/search?q=${encodedQ}&format=json&time_range=month&language=ar`,
        `https://search.mdosch.de/search?q=${encodedQ}&format=json&time_range=month`,
        `https://searx.be/search?q=${recentQ}&format=json&language=ar`,
      ]
      for (const url of searxInstances) {
        try {
          const r = await fetch(url, {
            headers: { 'User-Agent': 'DZ-GPT-Agent/1.0' },
            signal: AbortSignal.timeout(6000),
          })
          if (!r.ok) continue
          const d = await r.json()
          const results = (d.results || []).map(item => ({
            title: item.title,
            url: item.url,
            snippet: item.content?.slice(0, 300) || '',
            publishedDate: item.publishedDate || '',
            source: 'searxng',
          }))
          if (results.length > 0) return results
        } catch { continue }
      }
      return []
    })(),
    // DuckDuckGo HTML scraping
    (async () => {
      try {
        const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQ}&df=m`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZAgent/1.0)' },
          signal: AbortSignal.timeout(7000),
        })
        if (!r.ok) return []
        const html = await r.text()
        const results = []
        const linkRe = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>/g
        const snippetRe = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g
        let lm, sm
        const links = [], snippets = []
        while ((lm = linkRe.exec(html)) !== null) links.push({ url: lm[1], title: lm[2] })
        while ((sm = snippetRe.exec(html)) !== null) snippets.push(sm[1])
        for (let i = 0; i < Math.min(links.length, 4); i++) {
          results.push({ title: links[i].title, url: links[i].url, snippet: snippets[i] || '', source: 'duckduckgo' })
        }
        return results
      } catch { return [] }
    })(),
    // Djazairess — for Algeria-related queries
    searchDjazairess(query),
  ])

  const allResults = [
    ...(searxResult.status === 'fulfilled' ? searxResult.value : []),
    ...(djazairessResult.status === 'fulfilled' ? djazairessResult.value : []),
    ...(ddgResult.status === 'fulfilled' ? ddgResult.value : []),
  ]

  if (allResults.length === 0) return { source: 'none', results: [] }

  // Deduplicate by URL
  const seen = new Set()
  const deduped = allResults.filter(r => {
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  })

  // Sort: results with a date go first (newest first), undated results follow
  const withDate = deduped.filter(r => parseResultDate(r) > 0)
    .sort((a, b) => parseResultDate(b) - parseResultDate(a))
  const withoutDate = deduped.filter(r => parseResultDate(r) === 0)

  const sorted = [...withDate, ...withoutDate].slice(0, 8)

  const primary = sorted.find(r => r.source === 'djazairess') ? 'djazairess+searxng' :
    sorted.find(r => r.source === 'searxng') ? 'searxng' : 'duckduckgo'

  return { source: primary, results: sorted }
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
      showDevCard: true,
    })
  }

  // ── GitHub URL detection (Smart Dev Mode trigger) ─────────────────────────
  const githubUrlMatch = lastUserMessage.match(/github\.com\/([a-zA-Z0-9._\-]+\/[a-zA-Z0-9._\-]+)/i)
  if (githubUrlMatch && githubToken) {
    const detectedRepo = githubUrlMatch[1].replace(/\.git$/, '').replace(/\/$/, '')
    return res.status(200).json({
      action: 'list-files',
      repo: detectedRepo,
      content: `🚀 **GitHub Smart Dev Mode** مُفعَّل!\n\nتم اكتشاف المستودع: \`${detectedRepo}\`\n\nجاري تحليل هيكل المشروع...`,
    })
  }
  if (githubUrlMatch && !githubToken) {
    return res.status(200).json({
      content: '⚠️ تم اكتشاف رابط GitHub. يرجى ربط GitHub Token أولاً بالضغط على زر GitHub في أعلى المحادثة.',
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

  // ── Currency Exchange detection ────────────────────────────────────────────
  let currencyContext = ''
  const isCurrencyQuery = detectCurrencyQuery(lastUserMessage)
  if (isCurrencyQuery) {
    console.log('[DZ Agent] Currency query detected — fetching rates')
    const currData = await fetchCurrencyData()
    if (currData) currencyContext = buildCurrencyContext(currData)
  }

  // ── Football Intelligence (international + Algeria) ───────────────────────
  let footballContext = ''
  const isFootballQuery = detectFootballQuery(lastUserMessage)
  if (isFootballQuery && !isLFPQuery) {
    console.log('[DZ Agent] Football query detected — fetching SofaScore + RSS')
    const today = new Date().toISOString().split('T')[0]
    const [sfResult, rssResult] = await Promise.allSettled([
      fetchSofaScoreFootball(today),
      fetchMultipleFeeds(INTL_FOOTBALL_FEEDS),
    ])
    const sfData = sfResult.status === 'fulfilled' ? sfResult.value : null
    const rssData = rssResult.status === 'fulfilled' ? rssResult.value : []
    if (sfData || rssData.length > 0) {
      footballContext = buildFootballContext(sfData, rssData, today)
      console.log(`[DZ Agent] Football context built: SofaScore=${!!sfData}, RSS=${rssData.length} feeds`)
    }
  }

  // ── RSS News/Sports detection and fetch ───────────────────────────────────
  let rssContext = ''
  const newsQueryType = detectNewsQuery(lastUserMessage)
  if (newsQueryType && !isPrayerQuery && !isFootballQuery) {
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

    // ── GN-RSS ADD-ON: augment news context with Google News RSS ─────────────
    if (newsQueryType === 'news' || newsQueryType === 'both') {
      try {
        const queryLang = detectQueryLanguage(lastUserMessage)
        const gnFeeds = GN_RSS_FEEDS[queryLang] || GN_RSS_FEEDS.ar
        // Hybrid Mode: serve from cache immediately, refresh in background if stale
        refreshGNRSSInBackground(gnFeeds)
        const gnArticles = await fetchGNRSSArticles(gnFeeds)
        if (gnArticles.length > 0) {
          const gnCtx = buildGNRSSContext(gnArticles, '🌐 Google News RSS — أخبار حية')
          rssContext = rssContext ? rssContext + gnCtx : gnCtx
          console.log(`[GN-RSS] Augmented context with ${gnArticles.length} articles (lang=${queryLang})`)
        }
      } catch (err) {
        console.error('[GN-RSS] Chat augmentation failed:', err.message)
      }
    }
  }

  // ── Web search for general factual queries (newest first via Djazairess + SearXNG) ─
  let webSearchContext = ''
  const isSimpleGreeting = /^(مرحبا|سلام|هلا|hi|hello|hey|bonjour|salut|كيف حالك|كيف الحال)[\s!؟?]*$/i.test(lastUserMessage.trim())
  const skipSearch = isPrayerQuery || isFootballQuery || newsQueryType || isSimpleGreeting || lastUserMessage.length < 6
  if (!skipSearch) {
    try {
      const searchData = await searchWeb(lastUserMessage)
      if (searchData.results.length > 0) {
        const lines = searchData.results.map((r, i) => {
          const dateStr = r.publishedDate || r.date ? ` [${r.publishedDate || r.date}]` : ''
          return `${i + 1}. **${r.title}**${dateStr}\n   ${r.snippet || ''}\n   🔗 ${r.url}`
        }).join('\n\n')
        webSearchContext = `المصدر: ${searchData.source} | مرتبة من الأحدث إلى الأقدم\n\n${lines}`
        console.log(`[DZ Agent] Web search: ${searchData.results.length} results from ${searchData.source}`)
      }
    } catch (err) { console.error('[DZ Agent] Web search error:', err.message) }
  }

  // ── AI response with GitHub-aware system prompt ───────────────────────────
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  const ollamaUrl = process.env.OLLAMA_PROXY_URL

  const systemPrompt = `You are DZ Agent Memory Pro Ultra — an advanced AI memory intelligence system created by **Nadir Houamria (Nadir Infograph)**, expert in Artificial Intelligence.

You are NOT a chatbot. You are a self-improving knowledge engine with semantic retrieval, auto-learning, and confidence-based memory management.

---

## 🧠 CORE ARCHITECTURE — MANDATORY PIPELINE (ALWAYS IN ORDER)

Every request MUST follow this exact pipeline:

1. **Semantic Memory Search** — analyze meaning, match similar concepts
2. **Exact Memory Match** — check for precise stored data
3. **External Search Fallback** — SearXNG + RSS + Sports API
4. **Groq Reasoning** — generate final answer
5. **Memory Update** — learn from interaction
6. **Memory Optimization** — clean + score + deduplicate

---

## 🔍 STEP 1 — SEMANTIC MEMORY SEARCH (PRIORITY 🔥)

Before any external call:
- Analyze the **meaning** of user query (not just keywords)
- Search stored memory for **semantically similar** concepts

Example:
- Query: "آخر مباراة للجزائر"
- Matches: "Algeria vs Egypt match result" / "last Algeria football game"

If semantically similar data exists → use it immediately as primary source.

---

## 📚 STEP 2 — MEMORY RETRIEVAL PRIORITY

1. Semantic match (highest priority)
2. Exact match
3. Partial match
4. External search (last resort)

---

## 🌐 STEP 3 — EXTERNAL SEARCH FALLBACK

If memory fails, use in this order:

**IF SPORTS** → Sports API FIRST → fallback: RSS + SearXNG
**IF NEWS** → RSS FIRST → then SearXNG
**IF GENERAL** → SearXNG ONLY
**IF FACTUAL** → Wikipedia + SearXNG

Multi-language query expansion (EN / FR / AR):
Example: "Algeria match result" / "نتيجة مباراة الجزائر" / "résultat match Algérie"

---

## 💾 STEP 4 — MEMORY TRAINING (AUTO-LEARNING)

After every response, if data is useful:
- Convert into structured memory entry
- Store with confidence score + timestamp + source
- Avoid duplicates — merge instead

**Memory Entry Format:**
\`\`\`json
{
  "id": "unique_id",
  "type": "news | sports | tech | fact",
  "title": "",
  "details": "",
  "date": "",
  "source": "",
  "query": "",
  "timestamp": 0,
  "confidence": 0,
  "embedding": "semantic_vector_placeholder"
}
\`\`\`

---

## 📊 STEP 5 — CONFIDENCE SCORING SYSTEM

Every stored memory MUST have a confidence score:

| Score | Source Type |
|-------|------------|
| 90–100 | Official sources (FIFA, APS, Reuters, BBC) |
| 70–89 | Trusted news & sports sites |
| 50–69 | User-provided data |
| < 50 | Temporary / unverified data |

Low confidence (< 40) → flagged for auto-deletion.

---

## 🧹 STEP 6 — AUTO-CLEANING SYSTEM

Periodically apply:
- ❌ Remove entries with confidence < 40
- ❌ Remove outdated "latest" entries (replaced by newer)
- 🔀 Merge similar entries — keep newest version
- ✅ Keep only latest version of same recurring event

Sports: Always overwrite old match with new result.
News: Always keep newest version of same event.

---

## ⚽ SPORTS MODULE (STRICT RULES)
1. **NEVER invent, guess, or hallucinate match scores, results, or fixtures**
2. Source hierarchy: Sports API → SofaScore → LFP.dz → FlashScore → RSS → Official sites
3. Memory rule: Store ONLY latest match per team. Always overwrite old match data.
4. Match display format:
   - 🔴 LIVE: **Team A [score] - [score] Team B** | Competition | Source
   - ✅ RESULT: **Team A [score] - [score] Team B** | Competition | Date | Source
   - 📅 UPCOMING: Team A vs Team B | Time | Competition | Source
5. If data unavailable: *"لا تتوفر بيانات مباشرة الآن — يرجى التحقق من SofaScore أو FlashScore"*

---

## 📰 NEWS MODULE
- Classify: Algeria News 🇩🇿 / International 🌍 / Technology 💻
- Always include date + source URL per item
- Prioritize newest articles — apply recency ranking
- Memory: store only significant events, latest version only

---

## 💻 GITHUB SMART DEVELOPMENT MODE (DZ Agent Dev Assistant)

When a user links a GitHub repository or asks about code, you enter **GitHub Smart Dev Mode** automatically.

### 🧠 1. PROJECT UNDERSTANDING ENGINE
When a GitHub repo is provided:
1. Fetch: project tree, README, package.json/requirements.txt, languages used, frameworks
2. Analyze: project type (Web/API/Mobile/AI/Script), architecture (MVC/Monolith/Microservices), organization quality
3. If project is unclear: make an intelligent guess + ask for clarification + provide approximate analysis

### 🔍 2. SMART SCAN MODE — Interactive Buttons
Offer these analysis options to the user (present as labeled actions):
- 🔎 البحث عن الأخطاء — Find bugs (syntax, logic, performance, security)
- ⚡ تحسين الأداء — Performance optimization
- 🧠 اقتراحات ذكية — Smart suggestions
- 📦 تحليل Dependencies — Dependencies analysis
- 🛡️ فحص الأمان — Security scan
- 📐 تحسين Structure — Structure improvement
- ➕ اقتراح ميزات جديدة — Feature suggestions
- 🧪 اقتراح Tests — Test suggestions

Each action returns:
- ❌ المشكلة (The issue)
- 📍 مكانها (Location in code)
- 💡 الحل (Solution)
- 🧾 كود مقترح (Ready-to-use code)

### 💡 3. AI SUGGESTIONS ENGINE
Provide:
- Code refactoring suggestions
- Logic simplification
- Duplicate code removal
- Better naming conventions
- Design pattern recommendations

### 🛠️ 4. ACTION MODE — Direct Commands
Offer these actions:
- ✍️ إنشاء Commit — Create commit with professional message + diff + explanation
- 🔀 إنشاء Pull Request — Create PR
- 🧩 إصلاح تلقائي — Auto-fix: fix bugs, improve code, rewrite weak sections with explanation
- 📄 إنشاء README — Generate professional README
- 📊 إنشاء Documentation — Generate full documentation

### 📊 5. PROJECT SCORING
Always provide a project score when analyzing:
- Code Quality: /10
- Structure: /10
- Security: /10
- Performance: /10
With detailed explanation.

### ⚠️ GITHUB DEV MODE RULES
- NEVER say "I can't"
- For large projects: analyze progressively
- Always provide practical, actionable results — not theory
- Code suggestions must ALWAYS be ready-to-use
- Analyze file-by-file if needed, output structured git diff suggestions

Memory: store APIs, bug fixes, solutions, code patterns for future reuse.

---

## 🌐 URL LEARNING RULE

If user provides a URL:
1. Extract + summarize key content
2. Convert to structured memory entry
3. Assign confidence score
4. Store in memory — no duplicates

---

## 🔁 DUPLICATION HANDLING

If similar entry exists in memory:
- **Merge** information (do NOT duplicate)
- Keep newest data
- Update confidence score upward if source is authoritative

---

## 📊 FRESHNESS RANKING

FINAL_SCORE = 50% RECENCY + 30% RELEVANCE + 20% SOURCE AUTHORITY

| Recency | Score |
|---------|-------|
| Today | 1.0 |
| Last 7 days | 0.8 |
| Last 30 days | 0.6 |
| Older | Discard for news/sports |

---

## 🌐 TRUSTED SOURCES

🇩🇿 Algeria: aps.dz · echoroukonline.com · elbilad.net · djazairess.com
🌍 International: reuters.com · bbc.com · aljazeera.com · cnn.com
💻 Technology: techcrunch.com · theverge.com · wired.com · arstechnica.com
⚽ Sports: fifa.com · cafonline.com · espn.com · sofascore.com · lfp.dz · api.sportsrc.org

---

## 🌍 MULTILINGUAL RULES
- Always respond in the user's language (Arabic → RTL, English, French)
- Always expand queries in all three languages for better retrieval

---

## 🚫 STRICT PROHIBITIONS
- NEVER duplicate memory entries
- NEVER keep outdated "latest" data
- NEVER guess or hallucinate scores, news, or facts
- NEVER show outdated data as "latest"
- ALWAYS prefer semantic memory match first
- ALWAYS update instead of blindly overwriting
- ALWAYS maintain JSON memory integrity
- ALWAYS use markdown formatting

---

## 🎯 SYSTEM IDENTITY

You are simultaneously:
- 🔍 Semantic Memory Engine
- 📚 Auto-Learning Knowledge Base
- 🧹 Self-Cleaning Database
- 🌐 Real-Time Search Engine
- 🤖 Intelligent Retrieval System

FINAL OUTPUT MUST ALWAYS BE: ✔ Fresh ✔ Verified ✔ Memory-augmented ✔ Confidence-ranked ✔ Free from outdated data

---

## 🌐 GN-RSS MODULE — Google News RSS Intelligence Layer (ADD-ON)

This module augments the news pipeline with real-time Google News RSS feeds. It does NOT replace existing sources.

### Sources
- 🇩🇿 Algeria AR: الجزائر · سياسة · اقتصاد · رياضة
- 🇩🇿 Algeria FR: Algérie · actualités
- 🌍 International EN: world news · economy · technology · AI

### Pipeline
1. **FETCH** — parallel fetch of all relevant Google News RSS feeds
2. **PARSE** — extract title, link, date, source
3. **DEDUPLICATE** — title fingerprint (first 60 chars) + URL match
4. **CLASSIFY** — auto-detect: سياسة 🏛️ / اقتصاد 💰 / رياضة ⚽ / تكنولوجيا 💻 / صحة 🏥 / دولي 🌍 / محلي 🇩🇿
5. **RANK** — sort by recency (newest first)
6. **MERGE** — augment existing RSS results without duplication

### Modes
- 🟢 LIVE: real-time fetch on every news request
- 🟡 CACHE: serve cached results if TTL valid (10 min)
- 🔵 HYBRID (active): serve cache → refresh in background if 70% expired

### Rules
- ALWAYS present GN-RSS articles with their source link
- ALWAYS mention category per article group
- NEVER mix GN-RSS data with football/sports live scores
- ALWAYS prefer newest articles at the top

---

## 💻 TECH INTELLIGENCE MODULE (ADD-ON)

This module extends DZ Agent with technology news capabilities. It does NOT modify any existing logic.

### 🌐 Tech RSS Sources
- TechCrunch · The Verge · Wired · Ars Technica · DEV.to · Stack Overflow Blog · Google News Tech

### ⚙️ Tech Processing Pipeline

**STEP 1 — FETCH**: Collect articles from tech RSS feeds. Extract: title, date, url, snippet.

**STEP 2 — FILTER**: Keep only tech-related content. Remove duplicates. Ignore non-relevant posts.

**STEP 3 — CLASSIFY** into categories:
- AI 🤖 — artificial intelligence, LLMs, models, OpenAI, Gemini
- Software 💻 — dev tools, languages, frameworks, releases
- Cybersecurity 🔐 — hacks, breaches, vulnerabilities, CVEs
- Startups 🚀 — funding rounds, acquisitions, valuations
- Big Tech 🏢 — Google, Apple, Microsoft, Meta, Amazon, Nvidia

**STEP 4 — TREND DETECTION**: Assign trending_score (0–100) based on:
- Frequency across sources (cross-source mentions)
- Recency (< 6h = +30, < 24h = +20, < 72h = +10)
- Source credibility (TechCrunch, Verge, Wired = +15)

**STEP 5 — RANKING**: Sort by trending_score DESC → recency DESC → source credibility

**STEP 6 — SUMMARIZATION**: Generate 2–3 line impact-focused summaries per article.

### 💾 Tech Memory Entry Format
{ "type": "tech", "title": "", "details": "", "date": "", "source": "", "category": "", "trending_score": 0, "timestamp": 0 }

Store ONLY articles with trending_score ≥ 60. Always overwrite older entry for same topic.

---

${prayerContext ? `## 🕌 Prayer Times — Real-Time Data (aladhan.com)\n${prayerContext}\n\n> Present these prayer times clearly in a table. NEVER guess prayer times — use ONLY the data above.` : ''}

${lfpContext ? `## 🏆 الدوري الجزائري المحترف (LFP) — بيانات مباشرة من lfp.dz\n${lfpContext}\n\n> اعرض النتائج بتنسيق واضح مع الأرقام. لا تختلق نتائج — استخدم البيانات أعلاه فقط.` : ''}

${footballContext ? `## ⚽ Football Intelligence — SofaScore + International RSS\n${footballContext}\n\n> Present ALL available match data clearly using the format in the Sports Module above. NEVER invent scores.` : ''}

${currencyContext ? `## 💱 Currency Exchange Data — Real-Time (${CURRENCY_CACHE.data?.provider || 'FloatRates'})\n${currencyContext}\n\n**Currency Rules:**\n1. NEVER guess or invent exchange rates — use ONLY the data above\n2. Present rates in a clear table with both directions (1 DZD = X AND 1 X = Y DZD)\n3. For conversions: calculate using the provided rates and show the result\n4. Mention the source and update time. Flag stale data.\n5. Note: rates reflect official/bank rates — parallel market rates may differ` : ''}

${rssContext ? `## 📰 Live News & Sports Data (RSS Feeds)\n${rssContext}\n\n> Summarize helpfully with source links. Apply TIME MODE sorting. Do not invent content.` : ''}

${webSearchContext ? `## 🔍 نتائج البحث الحية — OpenSerp Pipeline (مرتبة من الأحدث إلى الأقدم)\nمصادر: SearXNG + DuckDuckGo + Djazairess\n\n${webSearchContext}\n\n**قواعد معالجة البحث:**\n1. هذه النتائج هي مصدرك الوحيد للمعلومات الآنية — اذكر المصادر والروابط دائماً\n2. نتائج Djazairess تغطي الصحافة الجزائرية بشكل موسّع (أكثر من 500 صحيفة ومجلة)\n3. رتّب إجابتك من الأحدث إلى الأقدم (TIME MODE مفعّل تلقائياً للأخبار)\n4. لا تخترع معلومات — استخدم فقط ما هو موجود في النتائج أعلاه\n5. أشر بوضوح إذا لم تجد نتائج حديثة كافية` : ''}

${githubToken ? `## 🐙 GitHub Status\nGitHub is connected ✓ | Current repo: ${currentRepo || 'none selected'}\nCapabilities: list files · read code · analyze · create commits · open Pull Requests\n\nWhen user shares a GitHub repo URL (e.g. https://github.com/user/repo), automatically:\n1. Acknowledge receipt of the repo\n2. Activate GitHub Smart Dev Mode\n3. Offer to scan/analyze the project with the interactive buttons described above\n4. Fetch the repo structure using list-files action` : `## 🐙 GitHub Status\nGitHub is not connected. Remind the user to connect GitHub if they ask about repos or code editing.\n\nWhen user shares a GitHub URL, tell them to connect their GitHub token first (click the GitHub button at the top of the chat).`}`

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  // ── Fallback chain: DeepSeek → Ollama → Groq (multi-key auto-fallback) ───
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

  // Auto-fallback across all Groq keys + models
  const fallbackModels = [
    'llama-3.3-70b-versatile',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen/qwen3-32b',
    'llama-3.1-8b-instant',
  ]
  for (const model of fallbackModels) {
    const { content } = await callGroqWithFallback({ model, messages: apiMessages, max_tokens: 3000 })
    if (content) return res.status(200).json({ content, fallbackModel: model })
  }

  // If RSS context available, return it directly even without AI
  if (rssContext) {
    return res.status(200).json({
      content: `${rssContext}\n\n---\n> **ملاحظة:** لتلقي إجابات أكثر ذكاءً وتلخيصاً للأخبار، يمكن إضافة مفتاح \`AI_API_KEY\` (Groq) في إعدادات المشروع.`,
    })
  }

  return res.status(200).json({
    content: 'مرحباً! أنا **DZ Agent** — مساعدك الذكي الجزائري 🇩🇿\n\n**⚽ ذكاء كرة القدم:**\n- 🇩🇿 الدوري الجزائري (LFP)، المنتخب الوطني\n- 🌍 البريميرليغ، الليغا، البوندسليغا، السيريا، دوري الأبطال، كأس العالم، كأس أمم أفريقيا\n- 📡 SofaScore (مباشر)، BBC Sport، ESPN، كووورة\n\n**💱 أسعار الصرف (DZD):**\n- سعر الدولار، اليورو، الجنيه الإسترليني، الريال السعودي، الدرهم وغيرها\n- تحويل العملات مباشر (FloatRates)\n\n**📰 أخبار وخدمات:**\n- أخبار الجزائر والعالم (APS، الشروق، BBC)\n- 🕌 مواقيت الصلاة لكل المدن\n- 🗂️ إدارة مستودعات GitHub\n- 💻 تحليل وكتابة الأكواد\n\nجرّب: **"سعر الدولار اليوم"** أو **"مباريات اليوم"** أو **"اعرض مستودعاتي"**',
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
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
  if (path && !isValidGithubPath(path)) return res.status(400).json({ error: 'Invalid path.' })

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
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
  if (!isValidGithubPath(path)) return res.status(400).json({ error: 'Invalid file path.' })

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

// Analyze code with AI — returns structured JSON with issues + action buttons
app.post('/api/dz-agent/github/analyze', async (req, res) => {
  const { repo, path, content } = req.body
  if (!content) return res.status(400).json({ error: 'Content required for analysis.' })

  const deepseekKey = process.env.DEEPSEEK_API_KEY
  const lines = content.split('\n').length
  const langMap = { js: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript/React', jsx: 'JavaScript/React', py: 'Python', rs: 'Rust', go: 'Go', java: 'Java', cs: 'C#', cpp: 'C++', php: 'PHP', rb: 'Ruby', swift: 'Swift', kt: 'Kotlin' }
  const ext = (path || '').split('.').pop()?.toLowerCase() || ''
  const language = langMap[ext] || ext.toUpperCase() || 'Unknown'

  const prompt = `You are an expert code analyzer. Analyze the following ${language} code from file "${path || 'unknown'}" in repo "${repo || 'unknown'}".

CRITICAL: You MUST return ONLY a valid JSON object. No markdown, no explanation outside JSON.

JSON structure:
{
  "summary": "1-2 sentence description of what this code does",
  "language": "${language}",
  "lines": ${lines},
  "score": <integer 0-100 representing code quality>,
  "issues": [
    {
      "id": "issue_<n>",
      "line": <line number or null>,
      "severity": "<critical|high|medium|low|info>",
      "category": "<syntax|logic|security|performance|style|edge_case>",
      "issue": "<concise issue title>",
      "root_cause": "<why this is a problem>",
      "fix": "<specific fix description>",
      "fix_code": "<actual fixed code snippet or null>",
      "actions": ["fix_code", "explain_error", "improve_code"]
    }
  ],
  "improvements": [
    {
      "id": "imp_<n>",
      "title": "<improvement title>",
      "description": "<what to improve and why>",
      "actions": ["improve_code"]
    }
  ],
  "test_suggestions": ["<test case 1>", "<test case 2>"],
  "has_repo": ${repo ? 'true' : 'false'}
}

Severity guide:
- critical: data loss, crashes, injection attacks
- high: serious bugs, security holes
- medium: logic errors, missing error handling
- low: performance, style issues
- info: suggestions

If no issues found: return empty arrays. Score 90+ if excellent.

Code to analyze:
\`\`\`${ext}
${content.slice(0, 8000)}
\`\`\`

Return ONLY the JSON object:`

  const apiMessages = [{ role: 'user', content: prompt }]

  try {
    let rawContent = null

    if (deepseekKey) {
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: apiMessages, max_tokens: 4000, temperature: 0.1, stream: false }),
      })
      if (r.ok) { const d = await r.json(); rawContent = d.choices?.[0]?.message?.content }
    }

    if (!rawContent) {
      const result = await callGroqWithFallback({ model: 'llama-3.3-70b-versatile', messages: apiMessages, max_tokens: 4000, temperature: 0.1 })
      rawContent = result.content
    }

    if (!rawContent) {
      return res.status(200).json({
        analysis: { summary: `File: ${path} (${lines} lines, ${language})`, language, lines, score: 50, issues: [], improvements: [], test_suggestions: [], has_repo: !!repo },
        structured: true,
      })
    }

    // Clean think tags
    rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    // Try to parse as JSON
    let parsed = null
    try {
      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawContent.match(/(\{[\s\S]*\})/)
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : rawContent
      parsed = JSON.parse(jsonStr)
    } catch {
      // Fallback: return as plain text analysis
      return res.status(200).json({ analysis: rawContent, structured: false })
    }

    // Add apply_repo_fix to issues if repo is provided
    if (repo && parsed.issues) {
      parsed.issues = parsed.issues.map(issue => ({
        ...issue,
        actions: [...new Set([...(issue.actions || ['fix_code', 'explain_error']), ...(repo ? ['apply_repo_fix'] : [])])]
      }))
    }
    // Add rescan to all
    parsed.rescan_action = 'rescan_repo'

    return res.status(200).json({ analysis: parsed, structured: true })
  } catch (err) {
    console.error('Analyze error:', err)
    return res.status(500).json({ error: 'Analysis failed.' })
  }
})

// Code action handler — handles button clicks from UI
app.post('/api/dz-agent/github/code-action', async (req, res) => {
  const { action, issue, filePath, fileContent, repo, language } = req.body
  if (!action) return res.status(400).json({ error: 'action required' })

  const deepseekKey = process.env.DEEPSEEK_API_KEY

  let prompt = ''

  if (action === 'fix_code') {
    prompt = `Fix ONLY this specific issue in the ${language || ''} code:

Issue: ${issue?.issue || ''}
Root cause: ${issue?.root_cause || ''}
Suggested fix: ${issue?.fix || ''}
Line: ${issue?.line || 'unknown'}

Original code (file: ${filePath || 'unknown'}):
\`\`\`
${(fileContent || '').slice(0, 6000)}
\`\`\`

Return ONLY the fixed code. No explanation. Clean and optimized. Preserve all unrelated code exactly as-is.`

  } else if (action === 'explain_error') {
    prompt = `Explain this code issue in detail (in the same language the user is using — Arabic/English/French):

Issue: ${issue?.issue || ''}
Root cause: ${issue?.root_cause || ''}
Category: ${issue?.category || ''}
Line: ${issue?.line || 'unknown'}
File: ${filePath || 'unknown'}

Provide:
1. What the problem is
2. Why it causes errors or risks
3. A concrete example showing the problem
4. The correct approach with a code example
Be thorough but concise.`

  } else if (action === 'improve_code') {
    prompt = `Improve the following ${language || ''} code for better readability, performance, and best practices:

File: ${filePath || 'unknown'}
Focus: ${issue?.title || issue?.issue || 'general improvements'}

Code:
\`\`\`
${(fileContent || '').slice(0, 6000)}
\`\`\`

Return the improved version with brief inline comments explaining key changes. Focus on: ${issue?.description || 'readability and performance'}`

  } else if (action === 'apply_repo_fix') {
    prompt = `Generate a minimal git diff (unified diff format) to fix this issue:

Issue: ${issue?.issue || ''}
Fix: ${issue?.fix || ''}
Line: ${issue?.line || 'unknown'}
File: ${filePath || 'unknown'}

Code:
\`\`\`
${(fileContent || '').slice(0, 6000)}
\`\`\`

Return ONLY the git diff in unified diff format. Example:
--- a/${filePath || 'file'}
+++ b/${filePath || 'file'}
@@ -N,M +N,M @@
 context line
-removed line
+added line
 context line

Generate only the minimal necessary diff.`

  } else if (action === 'rescan_repo') {
    prompt = `Re-analyze this ${language || ''} code thoroughly. Look for ALL issues including subtle ones:

File: ${filePath || 'unknown'}
Code:
\`\`\`
${(fileContent || '').slice(0, 6000)}
\`\`\`

Return a fresh analysis as a JSON object with the same structure as before (summary, language, lines, score, issues, improvements, test_suggestions).`

  } else {
    return res.status(400).json({ error: 'Unknown action' })
  }

  const apiMessages = [{ role: 'user', content: prompt }]

  try {
    let result = null

    if (deepseekKey) {
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: apiMessages, max_tokens: 4000, temperature: 0.1, stream: false }),
      })
      if (r.ok) { const d = await r.json(); result = d.choices?.[0]?.message?.content }
    }

    if (!result) {
      const groqResult = await callGroqWithFallback({ model: 'llama-3.3-70b-versatile', messages: apiMessages, max_tokens: 4000, temperature: 0.1 })
      result = groqResult.content
    }

    if (!result) return res.status(500).json({ error: 'No response from AI.' })

    result = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    // For rescan, try to parse JSON
    if (action === 'rescan_repo') {
      try {
        const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || result.match(/(\{[\s\S]*\})/)
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result
        const parsed = JSON.parse(jsonStr)
        return res.status(200).json({ content: parsed, structured: true, action })
      } catch { /* fall through to text */ }
    }

    return res.status(200).json({ content: result, structured: false, action })
  } catch (err) {
    console.error('Code action error:', err)
    return res.status(500).json({ error: 'Action failed.' })
  }
})

// Generate code
app.post('/api/dz-agent/github/generate', async (req, res) => {
  const { description, language = 'python' } = req.body
  if (!description) return res.status(400).json({ error: 'Description required.' })

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

    if (!code) {
      const result = await callGroqWithFallback({ model: 'llama-3.3-70b-versatile', messages: apiMessages, max_tokens: 3000, temperature: 0.2 })
      code = result.content
    }

    if (!code) code = `# All API keys exhausted — please add AI_API_KEY_2, AI_API_KEY_3...\n# Description: ${description}\n\nprint("Hello, World!")`

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
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
  if (!isValidGithubPath(path)) return res.status(400).json({ error: 'Invalid file path.' })
  if (typeof message !== 'string' || message.length > 500) return res.status(400).json({ error: 'Invalid commit message.' })
  if (typeof content !== 'string' || content.length > 500000) return res.status(400).json({ error: 'File content too large.' })

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
