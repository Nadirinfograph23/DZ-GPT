// Vercel Serverless Function — National Team News (standalone, no server.js)
// /api/national-team/news?bypassCache=1

const NATIONAL_TEAM_CACHE = { items: [], ts: 0, seenTitles: new Set() }
const NATIONAL_TEAM_TTL = 5 * 60 * 1000

const NATIONAL_TEAM_RSS_FEEDS = [
  { name: 'الهداف', url: 'https://www.elheddaf.com/feed' },
  { name: 'APS رياضة', url: 'https://www.aps.dz/ar/sport/feed' },
  { name: 'Sport DZ', url: 'https://www.sport-dz.com/feed/' },
  { name: 'Google الخضر', url: 'https://news.google.com/rss/search?q=%22%D8%A7%D9%84%D8%AE%D8%B6%D8%B1%22+%D9%83%D8%B1%D8%A9+%D9%82%D8%AF%D9%85&hl=ar&gl=DZ&ceid=DZ:ar&sort=date' },
  { name: 'Google محاربو الصحراء', url: 'https://news.google.com/rss/search?q=%22%D9%85%D8%AD%D8%A7%D8%B1%D8%A8%D9%88+%D8%A7%D9%84%D8%B5%D8%AD%D8%B1%D8%A7%D8%A1%22&hl=ar&gl=DZ&ceid=DZ:ar&sort=date' },
  { name: 'Google المنتخب الجزائري', url: 'https://news.google.com/rss/search?q=%28site%3Aennaharonline.com+OR+site%3Aechoroukonline.com+OR+site%3Aelkhabar.com+OR+site%3Aelbilad.net+OR+site%3Aelhayatalarabiya.dz+OR+site%3Aaps.dz+OR+site%3Aelheddaf.com%29+%22%D8%A7%D9%84%D9%85%D9%86%D8%AA%D8%AE%D8%A8+%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1%D9%8A%22&hl=ar&gl=DZ&ceid=DZ:ar&sort=date' },
  { name: 'Google الفريق الوطني', url: 'https://news.google.com/rss/search?q=%22%D8%A7%D9%84%D9%81%D8%B1%D9%8A%D9%82+%D8%A7%D9%84%D9%88%D8%B7%D9%86%D9%8A%22+%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D9%83%D8%B1%D8%A9+%D9%82%D8%AF%D9%85&hl=ar&gl=DZ&ceid=DZ:ar&sort=date' },
  { name: 'سبورت 360', url: 'https://arabic.sport360.com/feed/' },
]

const _NT_NON_SPORTS = ['سياسة','حكومة','وزير','برلمان','رئيس الجمهورية','اقتصاد','مالية','استثمار','بنك','دينار','أسعار','ميزانية','جريمة','أمن','إرهاب','حزب','انتخاب']
function _ntIsSports(title = '', desc = '') {
  const text = `${title} ${desc}`.toLowerCase()
  return !_NT_NON_SPORTS.some(k => text.includes(k))
}

function parseNationalTeamRss(xml, feedName = 'أخبار المنتخب') {
  const items = []
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1]
    const title = (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1] || block.match(/<title>(.*?)<\/title>/i)?.[1] || '').trim()
    const link = (block.match(/<link>(.*?)<\/link>/i)?.[1] || '').trim()
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1] || '').trim()
    const desc = (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1] || block.match(/<description>(.*?)<\/description>/i)?.[1] || '').replace(/<[^>]+>/g,'').trim().slice(0, 200)
    const source = (block.match(/<source[^>]*>(.*?)<\/source>/i)?.[1] || feedName).trim()
    if (title && title.length > 5 && _ntIsSports(title, desc)) {
      items.push({ title, link, pubDate, source, feedName: source, description: desc })
    }
  }
  return items.slice(0, 12)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const bypassCache = req.query.bypassCache === '1'
    const now = Date.now()
    if (!bypassCache && NATIONAL_TEAM_CACHE.ts && now - NATIONAL_TEAM_CACHE.ts < NATIONAL_TEAM_TTL) {
      return res.status(200).json({ items: NATIONAL_TEAM_CACHE.items, fetchedAt: new Date().toISOString() })
    }

    const results = await Promise.allSettled(
      NATIONAL_TEAM_RSS_FEEDS.map(async (feed) => {
        const response = await fetch(feed.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZ-GPT/2.0)', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
          signal: AbortSignal.timeout(10000),
        })
        if (!response.ok) return []
        const xml = await response.text()
        return parseNationalTeamRss(xml, feed.name)
      }),
    )

    const allItems = []
    const seenTitles = new Set()
    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const it of r.value) {
          const norm = it.title.toLowerCase().replace(/\s+/g,' ').trim()
          if (!seenTitles.has(norm)) { seenTitles.add(norm); allItems.push(it) }
        }
      }
    }

    allItems.sort((a, b) => {
      const da = a.pubDate ? new Date(a.pubDate).getTime() : 0
      const db = b.pubDate ? new Date(b.pubDate).getTime() : 0
      return db - da
    })

    const items = allItems.slice(0, 20)
    NATIONAL_TEAM_CACHE.items = items
    NATIONAL_TEAM_CACHE.ts = now
    return res.status(200).json({ items, fetchedAt: new Date().toISOString() })
  } catch (err) {
    return res.status(500).json({ error: err.message, items: [] })
  }
}
