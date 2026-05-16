/**
 * DZ Agent — Breaking News Detector
 * يكشف الأخبار العاجلة فقط عندما يُصنّفها المصدر نفسه كذلك.
 * لا تخمين — فقط category tags + title prefixes التي تستخدمها المصادر فعلياً.
 */

// ── أنماط عناوين المصادر الخاصة بالأخبار العاجلة ─────────────────────────────
// هذه الأنماط تستخدمها المصادر نفسها (APS، الشروق، الجزيرة، BBC عربي...) في بداية العنوان
const BREAKING_TITLE_PREFIXES = [
  /^عاجل\s*[:\-–|،]/i,      // "عاجل:" — APS، الشروق، النهار، الخبر
  /^\[عاجل\]/i,             // "[عاجل]"
  /^🔴\s*عاجل/,             // "🔴 عاجل"
  /^⚡\s*عاجل/,             // "⚡ عاجل"
  /^عاجل\s+عاجل/i,          // "عاجل عاجل" — بعض المصادر المصرية
  /^breaking\s*[:\-–|]/i,   // "Breaking:" — الجزيرة English، BBC
  /^flash\s*[:\-–|]/i,      // "Flash:" — TSA، فرانس 24
  /^actu[\s-]flash/i,       // "Actu-flash" — مصادر فرنسية
  /^urgent\s*[:\-–|]/i,     // "Urgent:"
  /^خبر\s+عاجل\s*[:\-–|]/i, // "خبر عاجل:"
]

// ── تصنيفات RSS التي تضعها المصادر لتمييز أخبارها العاجلة ───────────────────
const BREAKING_CATEGORIES = [
  'عاجل', 'breaking', 'breaking-news', 'breaking news',
  'flash', 'urgent', 'actu-flash', 'dernière minute',
  'خبر عاجل', 'أخبار عاجلة',
]

export function isSourceTaggedBreaking(title, categories = []) {
  // 1. التحقق من category tag — المصدر وسم العنصر صراحةً
  for (const cat of categories) {
    const c = cat.toLowerCase().trim()
    if (BREAKING_CATEGORIES.some(bc => c.includes(bc))) return true
  }
  // 2. التحقق من بداية العنوان — نمط ثابت يستخدمه المصدر
  const t = title.trim()
  for (const pattern of BREAKING_TITLE_PREFIXES) {
    if (pattern.test(t)) return true
  }
  return false
}

// ── جلب وتحليل RSS مع استخراج category tags ──────────────────────────────────
async function fetchAndParseBreaking(feed) {
  try {
    const resp = await fetch(feed.url, {
      headers: {
        'User-Agent': 'DZ-GPT-Agent/1.0 (+https://dz-gpt.vercel.app)',
        Accept: 'application/rss+xml,application/xml,text/xml,*/*',
      },
      signal: AbortSignal.timeout(9000),
    })
    if (!resp.ok) return []
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

      // استخراج جميع category tags
      const catMatches = [...block.matchAll(/<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi)]
      const categories = catMatches.map(m => decode(m[1])).filter(Boolean)

      // كشف عاجل من وسم المصدر نفسه فقط
      if (!isSourceTaggedBreaking(title, categories)) continue

      const rawLink = block.match(/<link>\s*(https?:\/\/[^\s<]+)/i)?.[1]
        || block.match(/<link[^>]+href=["'](https?:\/\/[^"']+)["']/i)?.[1]
        || ''
      const pubDate = getTag('pubDate') || getTag('dc:date') || ''
      const description = getTag('description').slice(0, 200)

      items.push({ title, link: rawLink, pubDate, description, source: feed.name, categories })
    }

    return items
  } catch {
    return []
  }
}

// ── إزالة التكرار ─────────────────────────────────────────────────────────────
const _seenBreaking = new Set()
const SEEN_TTL = 12 * 60 * 60 * 1000 // 12h

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

// ── المصادر المُراقَبة (الجزائرية + عربية كبرى) ──────────────────────────────
const BREAKING_FEEDS = [
  { name: 'APS وكالة الأنباء',  url: 'https://www.aps.dz/ar/feed' },
  { name: 'الشروق أونلاين',     url: 'https://www.echoroukonline.com/feed' },
  { name: 'النهار أونلاين',     url: 'https://www.ennaharonline.com/feed/' },
  { name: 'الخبر',              url: 'https://www.elkhabar.com/rss' },
  { name: 'TSA Algérie',        url: 'https://www.tsa-algerie.com/feed/' },
  { name: 'الجزيرة عربي',       url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'BBC عربي',           url: 'https://feeds.bbci.co.uk/arabic/rss.xml' },
  { name: 'العربية',            url: 'https://www.alarabiya.net/feed/rss2/ar.xml' },
]

// ── دورة الفحص ────────────────────────────────────────────────────────────────
export function startBreakingNewsPoller(onBreaking) {
  async function poll() {
    try {
      const results = await Promise.allSettled(BREAKING_FEEDS.map(fetchAndParseBreaking))
      const allItems = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
      const newItems = filterNew(allItems)
      if (newItems.length > 0) {
        console.log(`[BreakingNews] 🔴 ${newItems.length} خبر(أخبار) عاجلة جديدة مُكتشفة من المصادر`)
        onBreaking(newItems)
      }
    } catch (e) {
      console.warn('[BreakingNews] Poll error:', e.message)
    }
  }

  // فحص أولي بعد 45 ثانية من بدء الخادم
  setTimeout(poll, 45_000)
  // ثم كل دقيقتين
  const interval = setInterval(poll, 2 * 60 * 1000)
  return () => clearInterval(interval)
}
