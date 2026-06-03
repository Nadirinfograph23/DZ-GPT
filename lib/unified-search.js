/**
 * DZ-GPT — Unified Search Engine v2
 * محرك بحث موحد — عربي أولاً، جزائري أولاً
 *
 * Sources (ordered by Arabic/DZ priority):
 *   1. RSS جزائرية عربية   → الخبر · النهار · البلاد · الجزائر360 · إذاعة الجزائر
 *   2. RSS جزائرية فرنسية  → TSA · Le Matin d'Algérie
 *   3. Google News RSS      → ar/fr/en
 *   4. DuckDuckGo Instant   → JSON no-key
 *   5. Jina AI Reader       → full content extraction (person/deep queries)
 *
 * Scoring: Arabic +3 · Algerian source +2 · <24h +2 · <7d +1
 */

// ─── نقاط الأولوية ──────────────────────────────────────────────────────────

const ARABIC_UNICODE_RE = /[\u0600-\u06FF]/

/** المصادر الجزائرية المعروفة (domain matching) */
const DZ_DOMAINS = [
  'elkhabar.com', 'ennaharonline.com', 'elbilad.net', 'algerie360.com',
  'radioalgerie.dz', 'aps.dz', 'tsa-algerie.com', 'lematindalgerie.com',
  'elwatan.com', 'echoroukonline.com', 'elheddaf.com', 'eljoumahouria.com',
  'algerie-focus.com', 'algerie-presse.com', 'tout-sur-algerie.com',
  'algerie360.com', 'aps.dz',
]

function scoreItem(item) {
  let score = 0
  // عربية +3
  if (ARABIC_UNICODE_RE.test(item.title || '') || ARABIC_UNICODE_RE.test(item.snippet || '')) score += 3
  // مصدر جزائري +2
  const src = (item.source || item.link || '').toLowerCase()
  if (DZ_DOMAINS.some(d => src.includes(d))) score += 2
  // حداثة
  if (item.pubDate) {
    const age = Date.now() - new Date(item.pubDate).getTime()
    if (age < 86_400_000) score += 2       // < 24h
    else if (age < 604_800_000) score += 1  // < 7d
  }
  return score
}

function dedup(items) {
  const seen = new Set()
  return items.filter(it => {
    const key = (it.title || it.snippet || '').slice(0, 60).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── مصلّح XML بسيط ─────────────────────────────────────────────────────────

function parseRSSItems(xml, sourceName) {
  const items = []
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m
  while ((m = itemRx.exec(xml)) !== null && items.length < 8) {
    const block = m[1]
    const get = (tag) => {
      const rx = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')
      const r = block.match(rx)
      return r ? r[1].replace(/<[^>]+>/g, '').trim() : ''
    }
    const title = get('title')
    if (!title || title.length < 5) continue
    items.push({
      title,
      pubDate: get('pubDate'),
      link: get('link'),
      snippet: get('description').slice(0, 200),
      source: sourceName,
    })
  }
  return items
}

// ─── المصادر ─────────────────────────────────────────────────────────────────

/** RSS الجزائرية العربية (أولوية 1) */
const DZ_AR_FEEDS = [
  { name: 'الخبر',          url: 'https://www.elkhabar.com/feed/' },
  { name: 'النهار أونلاين', url: 'https://www.ennaharonline.com/feed/' },
  { name: 'البلاد',         url: 'https://www.elbilad.net/feed' },
  { name: 'الجزائر360',    url: 'https://www.algerie360.com/feed/' },
  { name: 'إذاعة الجزائر', url: 'https://www.radioalgerie.dz/news/ar/rss.xml' },
]

/** RSS الجزائرية فرنسية (أولوية 2) */
const DZ_FR_FEEDS = [
  { name: 'TSA Algérie',          url: 'https://www.tsa-algerie.com/feed/' },
  { name: 'Le Matin d\'Algérie',  url: 'https://www.lematindalgerie.com/feed/' },
]

async function fetchRSSFeed({ name, url }, signal) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DZ-GPT/2.0 (+https://dz-gpt.vercel.app)',
        'Accept': 'application/rss+xml,application/xml,text/xml,*/*',
      },
      signal: signal || AbortSignal.timeout(6000),
      redirect: 'follow',
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRSSItems(xml, name)
  } catch { return [] }
}

/** Google News RSS — عربي أو فرنسي */
async function fetchGoogleNews(query, lang = 'ar') {
  try {
    const q = encodeURIComponent(query)
    const url = lang === 'ar'
      ? `https://news.google.com/rss/search?q=${q}&hl=ar&gl=DZ&ceid=DZ:ar`
      : `https://news.google.com/rss/search?q=${q}&hl=fr&gl=DZ&ceid=DZ:fr`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DZ-GPT/2.0', Accept: 'application/rss+xml,*/*' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    return parseRSSItems(await res.text(), lang === 'ar' ? 'Google أخبار عربي' : 'Google Actualités DZ')
  } catch { return [] }
}

/** DuckDuckGo Instant Answer — بدون API key */
async function fetchDDG(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DZ-GPT/2.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
    })
    if (!res.ok) return []
    const data = await res.json()
    const out = []
    if (data.AbstractText?.length > 30) {
      out.push({
        title: data.Heading || query,
        snippet: data.AbstractText.slice(0, 400),
        source: data.AbstractSource || 'DuckDuckGo',
        link: data.AbstractURL || '',
        pubDate: null,
      })
    }
    for (const r of (data.RelatedTopics || []).slice(0, 5)) {
      if (r.Text?.length > 20) {
        out.push({ title: r.Text.slice(0, 80), snippet: r.Text.slice(0, 250), source: 'DuckDuckGo', pubDate: null })
      }
    }
    return out
  } catch { return [] }
}

/**
 * Jina AI Reader — استخراج المحتوى الكامل من URL
 * مجاني، بدون API key، مثالي لمقالات الشخصيات
 */
export async function jinaRead(url) {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        'User-Agent': 'DZ-GPT/2.0',
        'Accept': 'text/plain,*/*',
        'X-Return-Format': 'text',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const text = await res.text()
    // نأخذ أول 1200 حرف فقط (كافية للفهم)
    return text.replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200)
  } catch { return null }
}

// ─── الدالة الرئيسية ─────────────────────────────────────────────────────────

/**
 * UnifiedSearch.search(query, options)
 *
 * @param {string} query   - نص البحث
 * @param {object} options
 *   @param {boolean} options.dzRSSOnly   - فقط RSS الجزائرية (للأخبار المحلية)
 *   @param {boolean} options.personMode  - وضع البحث عن شخصية (يفعّل Jina)
 *   @param {string}  options.langHint    - 'ar'|'fr'|'both' (default 'both')
 *   @param {number}  options.maxResults  - أقصى عدد نتائج (default 10)
 *
 * @returns {Promise<{items: Array, jinaContent: string|null}>}
 */
export async function unifiedSearch(query, {
  dzRSSOnly = false,
  personMode = false,
  langHint = 'both',
  maxResults = 10,
} = {}) {
  const year = new Date().getFullYear()
  const dzQuery = query.includes('الجزائر') ? query : `${query} الجزائر ${year}`

  // ── جلب متوازي من كل المصادر ──────────────────────────────────────────────
  const tasks = [
    // أولوية 1: RSS جزائرية عربية
    ...DZ_AR_FEEDS.map(f => fetchRSSFeed(f)),
    // أولوية 2: RSS جزائرية فرنسية
    ...DZ_FR_FEEDS.map(f => fetchRSSFeed(f)),
  ]

  if (!dzRSSOnly) {
    tasks.push(
      // Google News عربي (أولوية 3)
      fetchGoogleNews(dzQuery, 'ar'),
      // Google News فرنسي
      langHint !== 'ar' ? fetchGoogleNews(query, 'fr') : Promise.resolve([]),
      // DuckDuckGo
      fetchDDG(query),
      // DuckDuckGo مع إضافة "الجزائر"
      personMode ? fetchDDG(dzQuery) : Promise.resolve([]),
    )
  }

  const settled = await Promise.allSettled(tasks)
  const allItems = settled
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)

  // ── تقييم + ترتيب + إزالة التكرار ────────────────────────────────────────
  const scored = allItems
    .map(item => ({ ...item, _score: scoreItem(item) }))
    .sort((a, b) => b._score - a._score)

  const results = dedup(scored).slice(0, maxResults)

  // ── Jina AI: استخراج محتوى أعلى نتيجة (وضع الشخصيات فقط) ────────────────
  let jinaContent = null
  if (personMode && results.length > 0) {
    const topLinks = results
      .filter(r => r.link && r.link.startsWith('http'))
      .slice(0, 2)
      .map(r => r.link)

    if (topLinks.length > 0) {
      const jinaResults = await Promise.allSettled(topLinks.map(jinaRead))
      const texts = jinaResults
        .filter(r => r.status === 'fulfilled' && r.value && r.value.length > 100)
        .map(r => r.value)
      if (texts.length > 0) jinaContent = texts.join('\n\n---\n\n')
    }
  }

  return { items: results, jinaContent }
}

// ─── وظيفة بناء السياق (للحقن في الـ AI prompt) ──────────────────────────────

/**
 * بناء سياق نصي جاهز للحقن في prompt
 * مرتّب: العربي أولاً، الجزائري أولاً
 */
export function buildSearchContext({
  items,
  jinaContent,
  query,
  label = '🌐 نتائج البحث الموحد',
}) {
  if (!items?.length && !jinaContent) return null

  const now = new Date()
  const dateStr = now.toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })

  let ctx = `\n\n---\n## ${label}\n`
  ctx += `📅 ${dateStr} — ⏰ ${timeStr}\n`
  ctx += `🔍 البحث: "${query}"\n\n`

  // محتوى Jina (أكثر عمقاً — يأتي أولاً)
  if (jinaContent) {
    ctx += `### 📄 محتوى مفصّل (Jina AI Reader):\n${jinaContent}\n\n`
  }

  // الأخبار مرتّبة (عربية + جزائرية أولاً بفضل الـ score)
  if (items.length > 0) {
    const arItems = items.filter(i => ARABIC_UNICODE_RE.test(i.title || ''))
    const frItems = items.filter(i => !ARABIC_UNICODE_RE.test(i.title || ''))

    if (arItems.length > 0) {
      ctx += `### 📰 نتائج عربية:\n`
      for (const item of arItems.slice(0, 7)) {
        const d = item.pubDate ? ` (${new Date(item.pubDate).toLocaleDateString('ar-DZ')})` : ''
        const link = item.link ? ` — [رابط](${item.link})` : ''
        ctx += `- **${item.title}**${d} — *${item.source}*${link}\n`
        if (item.snippet?.length > 30 && ARABIC_UNICODE_RE.test(item.snippet)) {
          ctx += `  > ${item.snippet}\n`
        }
      }
    }

    if (frItems.length > 0) {
      ctx += `\n### 📰 Résultats français:\n`
      for (const item of frItems.slice(0, 4)) {
        const d = item.pubDate ? ` (${new Date(item.pubDate).toLocaleDateString('fr-DZ')})` : ''
        ctx += `- **${item.title}**${d} — *${item.source}*\n`
      }
    }
  }

  ctx += `\n> ℹ️ **للـ AI**: استخدم هذه النتائج الحقيقية للإجابة. العربية أولاً. لا تخترع معلومات غير موجودة هنا.`
  ctx += `\n---\n`
  return ctx
}
