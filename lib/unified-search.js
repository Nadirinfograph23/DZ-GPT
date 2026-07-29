/**
 * DZ-GPT — Unified Search Engine v4 (RSS-First Edition)
 * محرك بحث موحد — عربي أولاً، جزائري أولاً
 *
 * Sources (ordered by Arabic/DZ priority):
 *   1. RSS جزائرية عربية  → الشروق · الخبر · النهار · البلاد · الجزائر360 · APS · الحياة · إذاعة الجزائر
 *   2. RSS جزائرية فرنسية → TSA · Le Matin d'Algérie
 *   3. Google News RSS     → ar/fr (أخبار الجزائر)
 *   4. Crawl4AI            → استخراج محتوى عميق
 *
 * ❌ SearXNG  → معطّل (كان يسبب بطئاً وفشلاً متكرراً)
 * ❌ Jina AI  → مُزال نهائياً
 * ✅ Crawl4AI → لاستخراج المحتوى العميق
 *
 * Scoring: Arabic +3 · Algerian source +2 · <24h +2 · <7d +1
 */

import { extractMultiple, extractForPerson } from './crawl4ai.js'

// ─── نقاط الأولوية ──────────────────────────────────────────────────────────

const ARABIC_UNICODE_RE = /[\u0600-\u06FF]/

const DZ_DOMAINS = [
  'elkhabar.com', 'ennaharonline.com', 'elbilad.net', 'algerie360.com',
  'radioalgerie.dz', 'aps.dz', 'tsa-algerie.com', 'lematindalgerie.com',
  'elwatan.com', 'echoroukonline.com', 'elheddaf.com', 'eljoumahouria.com',
  'algerie-focus.com', 'algerie-presse.com', 'tout-sur-algerie.com',
  'djazairess.com', 'ennahar-online.com', 'al-hayat.dz', 'elhayat-dz.com',
  'elheddaf.com', 'elhayat.dz',
]

function scoreItem(item) {
  let score = 0
  if (ARABIC_UNICODE_RE.test(item.title || '') || ARABIC_UNICODE_RE.test(item.snippet || '')) score += 3
  const src = (item.source || item.link || item.url || '').toLowerCase()
  if (DZ_DOMAINS.some(d => src.includes(d))) score += 2
  if (item.pubDate || item.date) {
    const age = Date.now() - new Date(item.pubDate || item.date).getTime()
    if (age < 86_400_000) score += 2
    else if (age < 604_800_000) score += 1
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

// ─── مصلّح RSS ────────────────────────────────────────────────────────────────

function parseRSSItems(xml, sourceName) {
  const items = []
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m
  while ((m = itemRx.exec(xml)) !== null && items.length < 10) {
    const block = m[1]
    const get = (tag) => {
      const rx = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')
      const r = block.match(rx)
      return r ? r[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim() : ''
    }
    const title = get('title')
    if (!title || title.length < 5) continue
    const description = get('description') || get('content:encoded') || ''
    items.push({
      title,
      pubDate: get('pubDate'),
      link: get('link'),
      snippet: description.slice(0, 400),
      source: sourceName,
    })
  }
  return items
}

// ─── المصادر RSS الجزائرية ──────────────────────────────────────────────────

const DZ_AR_FEEDS = [
  { name: 'الشروق',         url: 'https://www.echoroukonline.com/feed' },
  { name: 'الخبر',          url: 'https://www.elkhabar.com/feed/' },
  { name: 'النهار',         url: 'https://www.ennaharonline.com/feed/' },
  { name: 'البلاد',         url: 'https://www.elbilad.net/feed' },
  { name: 'الجزائر360',    url: 'https://www.algerie360.com/feed/' },
  { name: 'إذاعة الجزائر', url: 'https://www.radioalgerie.dz/news/ar/rss.xml' },
  { name: 'الحياة',        url: 'https://www.elhayat-dz.com/feed/' },
  { name: 'APS',           url: 'https://www.aps.dz/ar/rss' },
]

const DZ_FR_FEEDS = [
  { name: 'TSA Algérie',         url: 'https://www.tsa-algerie.com/feed/' },
  { name: "Le Matin d'Algérie", url: 'https://www.lematindalgerie.com/feed/' },
]

async function fetchRSSFeed({ name, url }, signal) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DZ-GPT/4.0 (+https://dz-gpt.vercel.app)',
        'Accept': 'application/rss+xml,application/xml,text/xml,*/*',
      },
      signal: signal || AbortSignal.timeout(7000),
      redirect: 'follow',
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRSSItems(xml, name)
  } catch { return [] }
}

async function fetchGoogleNews(query, lang = 'ar') {
  try {
    const q = encodeURIComponent(query)
    const url = lang === 'ar'
      ? `https://news.google.com/rss/search?q=${q}&hl=ar&gl=DZ&ceid=DZ:ar`
      : `https://news.google.com/rss/search?q=${q}&hl=fr&gl=DZ&ceid=DZ:fr`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DZ-GPT/4.0', Accept: 'application/rss+xml,*/*' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    return parseRSSItems(await res.text(), lang === 'ar' ? 'Google أخبار الجزائر' : 'Google Actualités DZ')
  } catch { return [] }
}

// ─── الدالة الرئيسية ─────────────────────────────────────────────────────────

/**
 * unifiedSearch — البحث الموحد (RSS-First Edition)
 * SearXNG معطّل — نستخدم RSS الجزائرية + Google News فقط
 *
 * @param {string} query
 * @param {object} options
 * @returns {Promise<{items: Array, extractedContent: string|null}>}
 */
export async function unifiedSearch(query, {
  dzRSSOnly = false,
  personMode = false,
  langHint = 'both',
  maxResults = 10,
} = {}) {
  const year = new Date().getFullYear()
  // ⚠️ FIX: لا نُضيف "الجزائر + year" إلا إذا كان الاستعلام خبرياً فعلاً
  // السبب: إضافتها لكل استعلام يُجبر Google News على إعطاء أخبار جزائرية
  // بدل المعلومات الفعلية المطلوبة (مثل "ما هو نظام الطيبات")
  const _isNewsQuery = /(?:أخبار|عاجل|اليوم|الآن|آخر\s+أخبار|breaking|news|actualité|dernières)/i.test(query)
  const _isAlgeriaQuery = /(?:الجزائر|algeria|algérie|\bDZ\b)/i.test(query)
  // فقط الاستعلامات الخبرية أو التي لا تحتوي على "الجزائر" بالفعل تُعالَج بالإضافة
  const dzQuery = (_isAlgeriaQuery || !_isNewsQuery)
    ? query
    : `${query} الجزائر ${year}`
  // للـ Google News: استخدم الاستعلام الخام للمواضيع العامة
  const googleQuery = _isNewsQuery
    ? (query.includes('الجزائر') ? query : `${query} الجزائر ${year}`)
    : query

  // ── جلب متوازي من كل المصادر RSS ─────────────────────────────────────────
  const tasks = [
    // أولوية 1: RSS جزائرية عربية (8 مصادر)
    ...DZ_AR_FEEDS.map(f => fetchRSSFeed(f)),
    // أولوية 2: RSS جزائرية فرنسية
    ...DZ_FR_FEEDS.map(f => fetchRSSFeed(f)),
  ]

  if (!dzRSSOnly) {
    tasks.push(
      fetchGoogleNews(googleQuery, 'ar'),
      langHint !== 'ar' ? fetchGoogleNews(query, 'fr') : Promise.resolve([]),
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

  // ── Crawl4AI: استخراج محتوى عميق ─────────────────────────────────────────
  let extractedContent = null
  if (personMode && results.length > 0) {
    const topLinks = results
      .filter(r => (r.link || r.url) && (r.link || r.url).startsWith('http'))
      .slice(0, 2)
      .map(r => r.link || r.url)

    if (topLinks.length > 0) {
      extractedContent = await extractForPerson(topLinks)
    }
  }

  return { items: results, extractedContent }
}

// ─── وظيفة بناء السياق ───────────────────────────────────────────────────────

/**
 * buildSearchContext — بناء سياق جاهز للحقن في prompt
 * كل المحتوى من RSS الجزائرية + Google News + Crawl4AI
 */
export function buildSearchContext({
  items,
  extractedContent,
  query,
  label = '📰 أخبار الجزائر',
}) {
  if (!items?.length && !extractedContent) return null

  const now = new Date()
  const dateStr = now.toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })

  let ctx = `\n\n---\n## ${label}\n`
  ctx += `📅 ${dateStr} — ⏰ ${timeStr}\n`
  ctx += `🔍 البحث: "${query}"\n\n`

  if (extractedContent) {
    ctx += `### 📄 محتوى مستخرج:\n${extractedContent}\n\n`
  }

  if (items.length > 0) {
    const arItems = items.filter(i => ARABIC_UNICODE_RE.test(i.title || ''))
    const frItems = items.filter(i => !ARABIC_UNICODE_RE.test(i.title || ''))

    if (arItems.length > 0) {
      ctx += `### 📰 نتائج عربية:\n`
      for (const item of arItems.slice(0, 8)) {
        const d = (item.pubDate || item.date) ? ` (${new Date(item.pubDate || item.date).toLocaleDateString('ar-DZ')})` : ''
        ctx += `- **${item.title}**${d} — *${item.source}*\n`
        if (item.snippet?.length > 30 && ARABIC_UNICODE_RE.test(item.snippet)) {
          ctx += `  > ${item.snippet.slice(0, 350)}\n`
        }
      }
    }

    if (frItems.length > 0) {
      ctx += `\n### 📰 Résultats français:\n`
      for (const item of frItems.slice(0, 4)) {
        const d = (item.pubDate || item.date) ? ` (${new Date(item.pubDate || item.date).toLocaleDateString('fr-DZ')})` : ''
        ctx += `- **${item.title}**${d} — *${item.source}*\n`
        if (item.snippet?.length > 30) {
          ctx += `  > ${item.snippet.slice(0, 250)}\n`
        }
      }
    }
  }

  ctx += `\n> ℹ️ **للـ AI**: استخدم هذه النتائج الحقيقية للإجابة. العربية أولاً. لا تخترع معلومات غير موجودة هنا. الدقة أهم من السرعة.`
  ctx += `\n---\n`
  return ctx
}

// دالة backward-compatible للسياق المستخرج
export { buildSearchContext as buildSearchContextLegacy }

// stub لـ SearXNG (معطّل — backward compatibility فقط)
export async function searchWithSearXNGStub() { return [] }
