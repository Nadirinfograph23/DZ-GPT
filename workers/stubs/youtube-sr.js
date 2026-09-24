// Cloudflare Worker adapter for youtube-sr.
// Production YouTube search must not depend on one unofficial instance.
// Providers are tried in order, each with a hard timeout, and results are
// validated/deduplicated before they reach the YouTube Insight controller.

const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
  'https://invidious.f5.si',
]
const UA = 'Mozilla/5.0 (compatible; DZ-Agent/2.3; +https://dzagent.app)'
const ID_RE = /^[A-Za-z0-9_-]{11}$/

function video(id, title = '', extra = {}) {
  return {
    id,
    title: String(title || '').trim() || 'YouTube video',
    description: extra.description || '',
    duration: Number(extra.duration || 0),
    views: Number(extra.views || 0),
    channel: { name: extra.channel || '' },
    thumbnail: { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` },
    thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }],
  }
}

function normalize(data, limit) {
  if (!Array.isArray(data)) return []
  return data.map(v => {
    const id = v.videoId || v.id || ''
    return video(id, v.title, {
      description: v.description,
      duration: Number(v.lengthSeconds || v.duration || 0) * 1000,
      views: v.viewCount || v.views,
      channel: v.author || v.channel?.name || v.channel,
    })
  }).filter(v => ID_RE.test(v.id) && v.title.length > 1).slice(0, limit)
}

async function fetchText(url, timeout = 7000, headers = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, ...headers } })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.text()
  } finally { clearTimeout(timer) }
}

async function invidious(query, limit) {
  const q = encodeURIComponent(query)
  const attempts = INVIDIOUS.map(async base => {
    const raw = await fetchText(`${base}/api/v1/search?q=${q}&type=video&page=1`, 4500, { Accept: 'application/json' })
    const data = JSON.parse(raw)
    const out = normalize(data, limit)
    if (!out.length) throw new Error('empty')
    return out
  })
  return Promise.any(attempts)
}

async function youtubeHtml(query, limit) {
  const q = encodeURIComponent(query)
  const html = await fetchText(`https://www.youtube.com/results?search_query=${q}&hl=ar`, 8000, {
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'ar,en;q=0.8',
  })
  const out = []
  const seen = new Set()

  // YouTube embeds videoId/title in ytInitialData. Extract IDs first, then
  // recover a nearby title when available. This survives UI markup changes
  // better than scraping CSS selectors.
  const idRe = /"videoId":"([A-Za-z0-9_-]{11})"/g
  let m
  while ((m = idRe.exec(html)) && out.length < limit) {
    const id = m[1]
    if (seen.has(id)) continue
    seen.add(id)
    const window = html.slice(m.index, Math.min(html.length, m.index + 2500))
    const titleMatch = window.match(/"title":\{"runs":\[\{"text":"((?:\\.|[^"\\])*)"/)
    let title = query
    if (titleMatch) {
      try { title = JSON.parse('"' + titleMatch[1] + '"') } catch { title = titleMatch[1] }
    }
    out.push(video(id, title))
  }
  if (!out.length) throw new Error('YouTube HTML contained no video results')
  return out
}

async function jina(query, limit) {
  const q = encodeURIComponent(query)
  const md = await fetchText(`https://r.jina.ai/https://www.youtube.com/results?search_query=${q}`, 9000, { Accept: 'text/plain,text/markdown,*/*' })
  const out = []
  const seen = new Set()
  const re = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g
  let m
  while ((m = re.exec(md)) && out.length < limit) {
    const id = m[1]
    if (seen.has(id)) continue
    seen.add(id)
    const before = md.slice(Math.max(0, m.index - 300), m.index)
    const tm = before.match(/\[([^\]]{3,180})\]\([^)]*$/)
    out.push(video(id, tm?.[1] || query))
  }
  if (!out.length) throw new Error('Jina contained no YouTube results')
  return out
}

async function google(query, limit) {
  const q = encodeURIComponent(`site:youtube.com/watch ${query}`)
  const html = await fetchText(`https://www.google.com/search?q=${q}&num=10&hl=ar`, 6000, { 'Accept-Language': 'ar,en;q=0.8' })
  const out = []
  const seen = new Set()
  const re = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g
  let m
  while ((m = re.exec(html)) && out.length < limit) {
    const id = m[1]
    if (seen.has(id)) continue
    seen.add(id)
    out.push(video(id, query))
  }
  if (!out.length) throw new Error('Google contained no YouTube results')
  return out
}

async function search(query, options = {}) {
  const q = String(query || '').trim()
  const limit = Math.min(Math.max(Number(options.limit) || 8, 1), 12)
  if (!q) return []

  const providers = [
    () => youtubeHtml(q, limit),
    () => invidious(q, limit),
    () => jina(q, limit),
    () => google(q, limit),
  ]
  const deadline = new Promise((_, reject) => setTimeout(() => reject(new Error('all YouTube providers timed out')), 14000))

  try {
    const result = await Promise.race([Promise.any(providers.map(fn => fn())), deadline])
    if (Array.isArray(result) && result.length) {
      console.log(`[DZ YouTube] ${result.length} results for: ${q}`)
      return result
    }
  } catch (e) {
    console.warn('[DZ YouTube] providers failed:', e?.message || e)
  }
  return []
}

const YouTube = {
  search,
  getVideo: async () => { throw new Error('youtube-sr getVideo is unavailable in Cloudflare Workers') },
}

export { YouTube }
export default YouTube
