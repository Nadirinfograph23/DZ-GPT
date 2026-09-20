/**
 * DZ Agent — Worker Live Research Brain
 * --------------------------------------
 * Worker-native (fetch only): no Node http/https, no API key required.
 *
 * Pipeline:
 *   user query -> research intent detector -> SearXNG public instances
 *   -> Google News RSS / Wikipedia fallbacks -> source context -> AI Router
 *
 * IMPORTANT: This module is only invoked AFTER static-fact lookup in the
 * Worker. Existing fixed answers therefore keep their current behavior.
 */

const DEFAULT_SEARX_INSTANCES = [
  'https://searx.be',
  'https://search.bus-hit.me',
  'https://search.sapti.me',
  'https://searx.tiekoetter.com',
]

const SEARCH_TIMEOUT_MS = 6500
const MAX_RESULTS = 8

function cleanText(value = '') {
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\\s+/g, ' ')
    .trim()
}

function normalize(value = '') {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[\\u064B-\\u0652\\u0670\\u0640]/g, '')
    .replace(/[؟?!.,،:;()[\\]{}"']/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
}

const STRONG = [
  /\\b(?:ابحث|دورلي|فتش|فتّش|قلبلي|google it|search for|look up|find out|recherche)\\b/i,
  /(?:ابحث|قلب|دور|فتش).*(?:الانترنت|الويب|google|internet|web)/i,
  /(?:تحقق|تاكد|تأكد|verify|fact.?check).*(?:من|هذا|المعلومة|خبر)/i,
  /(?:احدث|آخر|الجديد|latest|recent|today|now|currently|currently|maintenant)/i,
  /(?:اليوم|الان|الآن|درك|هذا الاسبوع|هذا الشهر|مؤخرا|مؤخراً|حالياً|حاليا)/i,
  /(?:السعر|اسعار|سعر الصرف|cours|prix|price).*(?:اليوم|الان|الحالي|current)/i,
  /(?:الاصدار|الإصدار|version).*(?:الاخير|الأخير|الجديد|latest|current)/i,
  /(?:الرئيس|الوزير|المدير|المسؤول).*(?:الحالي|current)/i,
  /(?:ما الجديد|وش الجديد|شنو الجديد|واش الجديد|what.?s new|what happened)/i,
]

const WEAK = [
  /(?:هل|واش|هل صحيح|is it true|est.?ce vrai)/i,
  /(?:مقارنة|قارن|compare|comparison)/i,
  /(?:افضل|أفضل|best|top).*(?:حالياً|حاليا|today|current)/i,
  /(?:مواصفات|specs|specifications).*(?:الجديد|الاحدث|الأحدث|2026)/i,
  /(?:حدثني|اعطني معلومات|معلومات عن|tell me about).*(?:جديد|حالي|حديث)/i,
]

const STATIC_SHIELD = [
  /^(?:ما هو|ما هي|ما معنى|ما المقصود ب|اشرح|عرف|عرّف|define|what is)\\s+/i,
  /^(?:من هو|من هي|who is)\\s+[^?]+$/i,
]

export function detectLiveResearchNeed(query = '') {
  const q = String(query).trim()
  if (q.length < 4) return { search: false, score: 0, reason: 'too_short' }

  const n = normalize(q)
  if (STATIC_SHIELD.some(re => re.test(n)) && !STRONG.some(re => re.test(n))) {
    return { search: false, score: 0, reason: 'static_knowledge_candidate' }
  }

  let score = 0
  if (STRONG.some(re => re.test(n))) score += 3
  for (const re of WEAK) if (re.test(n)) score += 1

  // Fresh dates/versions are inherently time-sensitive.
  if (/(?:2026|2027|2028|هذا العام|السنة الحالية|current year)/i.test(n)) score += 2

  return {
    search: score >= 3,
    score,
    reason: score >= 3 ? 'time_sensitive_or_research_intent' : 'general_knowledge',
  }
}

function parseSearxJson(data, engine) {
  const results = Array.isArray(data?.results) ? data.results : []
  return results.slice(0, MAX_RESULTS).map(item => ({
    title: cleanText(item.title || ''),
    url: item.url || '',
    snippet: cleanText(item.content || item.snippet || ''),
    source: cleanText(item.engine || engine || 'SearXNG'),
    published: item.publishedDate || item.published || '',
  })).filter(r => r.title && r.url)
}

async function fetchJson(url, timeout = SEARCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DZ-Agent/LiveResearch (+https://dzagent.app)',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

function getSearxInstances(env = {}) {
  const configured = String(env?.SEARXNG_INSTANCES || '')
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
  return [...new Set([...configured, ...DEFAULT_SEARX_INSTANCES])]
}

async function searchSearx(query, env = {}) {
  const instances = getSearxInstances(env)

  // Query a small set in parallel; the first usable set wins.
  const attempts = instances.slice(0, 4).map(async instance => {
    const url = new URL(instance + '/search')
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('language', 'all')
    url.searchParams.set('safesearch', '1')
    return { instance, data: await fetchJson(url.toString()) }
  })

  const settled = await Promise.allSettled(attempts)
  for (const item of settled) {
    if (item.status !== 'fulfilled') continue
    const parsed = parseSearxJson(item.value.data, item.value.instance)
    if (parsed.length) return parsed
  }
  return []
}

function decodeXml(value = '') {
  return cleanText(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
}

function parseRss(xml, source) {
  const items = []
  const re = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let match
  while ((match = re.exec(xml)) && items.length < MAX_RESULTS) {
    const block = match[1]
    const get = tag => {
      const m = block.match(new RegExp('<' + tag + '(?:\\\\:[^\\s>]+)?[^>]*>([\\s\\S]*?)</' + tag + '>', 'i'))
      return m ? cleanText(m[1]) : ''
    }
    const title = get('title')
    const link = get('link')
    const description = get('description')
    const pubDate = get('pubDate') || get('published') || get('updated')
    if (title) items.push({ title, link, description, pubDate, source })
  }
  return items
}

async function searchGoogleNews(query) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query)
    + '&hl=ar&gl=DZ&ceid=DZ:ar'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/rss+xml,application/xml', 'User-Agent': 'DZ-Agent/LiveResearch' },
      signal: controller.signal,
    })
    if (!response.ok) return []
    return parseRss(await response.text(), 'Google News RSS')
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

async function searchWikipedia(query) {
  const url = 'https://ar.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: '5',
    format: 'json',
    origin: '*',
  })
  try {
    const data = await fetchJson(url.toString())
    return (data?.query?.search || []).slice(0, 5).map(item => ({
      title: cleanText(item.title),
      url: 'https://ar.wikipedia.org/wiki/' + encodeURIComponent(String(item.title).replace(/ /g, '_')),
      snippet: cleanText(item.snippet),
      source: 'Wikipedia العربية',
      published: '',
    }))
  } catch {
    return []
  }
}

function dedupe(results) {
  const seen = new Set()
  return results.filter(item => {
    const key = item.url || item.title
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export async function liveResearch(query, env = {}, { maxResults = MAX_RESULTS } = {}) {
  const decision = detectLiveResearchNeed(query)
  if (!decision.search) return null

  const [searx, news, wiki] = await Promise.all([
    searchSearx(query, env).catch(() => []),
    searchGoogleNews(query).catch(() => []),
    searchWikipedia(query).catch(() => []),
  ])

  const results = dedupe([...searx, ...news, ...wiki]).slice(0, maxResults)
  if (!results.length) return null

  const context = [
    '[LIVE_WEB_RESEARCH]',
    'تم إجراء بحث حي الآن. استخدم المصادر أدناه فقط للحقائق الزمنية أو المتغيرة، ولا تدّعِ أنك بحثت إذا لم تستخدمها.',
    'السؤال: ' + query,
    '',
    ...results.map((r, i) => [
      '[' + (i + 1) + '] ' + r.title,
      'المصدر: ' + r.source,
      'الرابط: ' + r.url,
      r.published ? 'التاريخ: ' + r.published : '',
      r.snippet ? 'المقتطف: ' + r.snippet : '',
    ].filter(Boolean).join('\\n')),
    '[/LIVE_WEB_RESEARCH]',
  ].join('\\n')

  return {
    decision,
    results,
    context,
    sources: results.map(r => ({ title: r.title, url: r.url, source: r.source, published: r.published })),
  }
}

export default liveResearch
