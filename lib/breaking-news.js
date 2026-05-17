/**
 * DZ Agent — Breaking News Detector
 * يكشف الأخبار العاجلة فقط عندما يُصنّفها المصدر نفسه كذلك.
 * لا تخمين — فقط category tags + title prefixes التي تستخدمها المصادر فعلياً.
 *
 * الإدارة في وقت التشغيل (بدون إعادة تشغيل):
 *   listFeeds()         ← قائمة المصادر مع الحالة
 *   addFeed(name, url)  ← إضافة مصدر جديد
 *   removeFeed(url)     ← حذف مصدر
 *   pauseFeed(url)      ← إيقاف مؤقت (يبقى في القائمة)
 *   resumeFeed(url)     ← استئناف
 *   triggerPollNow()    ← فحص فوري
 */

// ── أنماط عناوين المصادر الخاصة بالأخبار العاجلة ─────────────────────────────
const BREAKING_TITLE_PREFIXES = [
  /^عاجل\s*[:\-–|،]/i,
  /^\[عاجل\]/i,
  /^🔴\s*عاجل/,
  /^⚡\s*عاجل/,
  /^عاجل\s+عاجل/i,
  /^breaking\s*[:\-–|]/i,
  /^flash\s*[:\-–|]/i,
  /^actu[\s-]flash/i,
  /^urgent\s*[:\-–|]/i,
  /^خبر\s+عاجل\s*[:\-–|]/i,
]

const BREAKING_CATEGORIES = [
  'عاجل', 'breaking', 'breaking-news', 'breaking news',
  'flash', 'urgent', 'actu-flash', 'dernière minute',
  'خبر عاجل', 'أخبار عاجلة',
]

export function isSourceTaggedBreaking(title, categories = []) {
  for (const cat of categories) {
    const c = cat.toLowerCase().trim()
    if (BREAKING_CATEGORIES.some(bc => c.includes(bc))) return true
  }
  const t = title.trim()
  for (const pattern of BREAKING_TITLE_PREFIXES) {
    if (pattern.test(t)) return true
  }
  return false
}

// ── قائمة المصادر الديناميكية ─────────────────────────────────────────────────
// كل مصدر: { name, url, paused, addedAt, lastChecked, lastError }
let _feeds = [
  { name: 'APS وكالة الأنباء',  url: 'https://www.aps.dz/ar/feed',                    paused: false },
  { name: 'الشروق أونلاين',     url: 'https://www.echoroukonline.com/feed',            paused: false },
  { name: 'النهار أونلاين',     url: 'https://www.ennaharonline.com/feed/',            paused: false },
  { name: 'الخبر',              url: 'https://www.elkhabar.com/rss',                   paused: false },
  { name: 'TSA Algérie',        url: 'https://www.tsa-algerie.com/feed/',              paused: false },
  { name: 'الجزيرة عربي',       url: 'https://www.aljazeera.com/xml/rss/all.xml',      paused: false },
  { name: 'BBC عربي',           url: 'https://feeds.bbci.co.uk/arabic/rss.xml',        paused: false },
  { name: 'العربية',            url: 'https://www.alarabiya.net/feed/rss2/ar.xml',     paused: false },
].map(f => ({ ...f, addedAt: new Date().toISOString(), lastChecked: null, lastError: null }))

// ── إدارة المصادر ─────────────────────────────────────────────────────────────

export function listFeeds() {
  return _feeds.map(f => ({ ...f }))
}

export function addFeed(name, url) {
  if (!name || !url) return { ok: false, error: 'name و url مطلوبان' }
  try { new URL(url) } catch { return { ok: false, error: 'رابط URL غير صالح' } }
  if (_feeds.find(f => f.url === url)) return { ok: false, error: 'المصدر موجود مسبقاً' }
  _feeds.push({ name, url, paused: false, addedAt: new Date().toISOString(), lastChecked: null, lastError: null })
  console.log(`[BreakingNews] ➕ مصدر جديد: ${name} (${url})`)
  return { ok: true }
}

export function removeFeed(url) {
  const before = _feeds.length
  _feeds = _feeds.filter(f => f.url !== url)
  const removed = _feeds.length < before
  if (removed) console.log(`[BreakingNews] 🗑️ مصدر محذوف: ${url}`)
  return { ok: removed, error: removed ? undefined : 'المصدر غير موجود' }
}

export function pauseFeed(url) {
  const feed = _feeds.find(f => f.url === url)
  if (!feed) return { ok: false, error: 'المصدر غير موجود' }
  feed.paused = true
  console.log(`[BreakingNews] ⏸️ مصدر موقوف: ${feed.name}`)
  return { ok: true }
}

export function resumeFeed(url) {
  const feed = _feeds.find(f => f.url === url)
  if (!feed) return { ok: false, error: 'المصدر غير موجود' }
  feed.paused = false
  console.log(`[BreakingNews] ▶️ مصدر مستأنف: ${feed.name}`)
  return { ok: true }
}

// ── جلب وتحليل RSS ────────────────────────────────────────────────────────────
async function fetchAndParseBreaking(feed) {
  try {
    const resp = await fetch(feed.url, {
      headers: {
        'User-Agent': 'DZ-GPT-Agent/1.0 (+https://dz-gpt.vercel.app)',
        Accept: 'application/rss+xml,application/xml,text/xml,*/*',
      },
      signal: AbortSignal.timeout(9000),
    })

    feed.lastChecked = new Date().toISOString()

    if (!resp.ok) {
      feed.lastError = `HTTP ${resp.status}`
      return []
    }

    feed.lastError = null
    const xml = await resp.text()

    const decode = (s) => s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&#\d+;/g, '').trim()

    const items = []
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
    let match

    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1]

      const getTag = (tag) => {
        const r = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))
        return r ? decode(r[1]) : ''
      }

      const title = getTag('title')
      if (!title) continue

      const catMatches = [...block.matchAll(/<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi)]
      const categories = catMatches.map(m => decode(m[1])).filter(Boolean)

      if (!isSourceTaggedBreaking(title, categories)) continue

      const rawLink = block.match(/<link>\s*(https?:\/\/[^\s<]+)/i)?.[1]
        || block.match(/<link[^>]+href=["'](https?:\/\/[^"']+)["']/i)?.[1]
        || ''
      const pubDate = getTag('pubDate') || getTag('dc:date') || ''
      const description = getTag('description').slice(0, 200)

      items.push({ title, link: rawLink, pubDate, description, source: feed.name, categories })
    }

    return items
  } catch (e) {
    feed.lastChecked = new Date().toISOString()
    feed.lastError = e.message?.slice(0, 80) || 'Unknown error'
    return []
  }
}

// ── إزالة التكرار ─────────────────────────────────────────────────────────────
const _seenBreaking = new Set()
const SEEN_TTL = 12 * 60 * 60 * 1000

function makeKey(item) {
  return item.title.trim().slice(0, 80).replace(/\s+/g, ' ').toLowerCase()
}

function filterNew(items) {
  return items.filter(item => {
    const key = makeKey(item)
    if (_seenBreaking.has(key)) return false
    _seenBreaking.add(key)
    setTimeout(() => _seenBreaking.delete(key), SEEN_TTL)
    return true
  })
}

// ── دورة الفحص ────────────────────────────────────────────────────────────────
let _onBreakingCb = null

async function runPoll() {
  const active = _feeds.filter(f => !f.paused)
  if (active.length === 0) return
  try {
    const results = await Promise.allSettled(active.map(fetchAndParseBreaking))
    const allItems = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    const newItems = filterNew(allItems)
    if (newItems.length > 0) {
      console.log(`[BreakingNews] 🔴 ${newItems.length} خبر(أخبار) عاجلة جديدة مُكتشفة`)
      _onBreakingCb?.(newItems)
    }
  } catch (e) {
    console.warn('[BreakingNews] Poll error:', e.message)
  }
}

/** فحص فوري — يُستخدم من لوحة الإدارة */
export async function triggerPollNow() {
  await runPoll()
}

export function startBreakingNewsPoller(onBreaking) {
  _onBreakingCb = onBreaking
  setTimeout(runPoll, 45_000)
  const interval = setInterval(runPoll, 2 * 60 * 1000)
  return () => clearInterval(interval)
}
