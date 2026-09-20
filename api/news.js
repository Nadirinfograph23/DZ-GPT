// Vercel Serverless Function — Algeria News
// /api/dz-agent/news?q=...

const NEWS_CACHE = { data: null, ts: 0 }
const NEWS_TTL = 15 * 60 * 1000

const NEWS_FEEDS = [
  { name: 'Google أخبار الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: 'النهار', url: 'https://www.ennaharonline.com/feed/' },
  { name: 'الشروق أونلاين', url: 'https://www.echoroukonline.com/feed' },
  { name: 'البلاد', url: 'https://www.elbilad.net/feed' },
]

function decodeXmlText(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

function parseRss(xml, source) {
  const items = []
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
    const block = match[1]
    const get = (tag) => {
      const found = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))
      return found ? decodeXmlText(found[1]) : ''
    }
    const title = get('title')
    if (!title) continue
    const link = get('link') || (block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || ''
    items.push({ title, link, source, pubDate: get('pubDate') || get('dc:date') || get('updated') || '' })
  }
  return items
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const now = Date.now()
  if (NEWS_CACHE.data && NEWS_CACHE.ts > now - NEWS_TTL) {
    return res.status(200).json(NEWS_CACHE.data)
  }

  try {
    const settled = await Promise.allSettled(
      NEWS_FEEDS.map(async (feed) => {
        const response = await fetch(feed.url, {
          headers: { 'Accept': 'application/rss+xml,application/xml,text/xml,*/*', 'User-Agent': 'DZ-Agent/1.0' },
          signal: AbortSignal.timeout(8000),
        })
        if (!response.ok) return []
        return parseRss(await response.text(), feed.name)
      }),
    )

    const seen = new Set()
    const items = settled
      .flatMap(result => result.status === 'fulfilled' ? result.value : [])
      .filter(item => {
        const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => (Date.parse(a.pubDate || '') || 0) - (Date.parse(b.pubDate || '') || 0))
      .slice(-20)

    const data = { items, generatedAt: new Date().toISOString() }
    NEWS_CACHE.data = data
    NEWS_CACHE.ts = now
    return res.status(200).json(data)
  } catch (err) {
    return res.status(200).json({ items: [], error: 'تعذّر جلب الأخبار', generatedAt: new Date().toISOString() })
  }
}
