/**
 * DZ Agent — Real-Time Internet Search Engine
 * يبحث في الإنترنت لإجابة الأسئلة اللحظية (مباريات، أخبار، أسعار...)
 *
 * Sources: Google News RSS → DuckDuckGo → RSS Algérie-First
 */

// ── كلمات تدل على حاجة البحث الفوري ──────────────────────────────────────
const REALTIME_TRIGGERS = [
  // رياضة / مباريات
  'مباراة', 'مباريات', 'نتيجة', 'نتائج', 'تشكيلة', 'هدف', 'أهداف',
  'دوري', 'ترتيب', 'بطولة', 'كأس', 'ملخص', 'مباشر', 'اليوم', 'الليلة',
  'الجولة', 'ldc', 'can ', 'coupe', 'match', 'score', 'résultat',
  'منتخب الجزائر', 'الخضر', 'فريق الجزائر',
  // أخبار عاجلة
  'آخر أخبار', 'أخبار اليوم', 'عاجل', 'عاجلاً', 'حدث', 'حادثة',
  'breaking', 'dernières nouvelles', 'اليوم',
  // اقتصاد / أسعار
  'سعر الدولار', 'سعر اليورو', 'سعر الذهب', 'سعر النفط',
  'صرف اليوم', 'سعر الصرف',
  // طقس
  'طقس اليوم', 'درجة الحرارة', 'الطقس في',
  // أحداث جارية
  'الآن', 'حالياً', 'في الوقت الحالي', 'في هذه اللحظة',
  'هذا الأسبوع', 'هذا الشهر',
  // حكومة / وزراء / مناصب (بيانات حية)
  'وزير', 'وزراء', 'الحكومة الجزائرية', 'تشكيلة الحكومة',
  'الوزير الأول', 'رئيس الحكومة', 'من هو وزير', 'المنصب الحالي',
  'ministre', 'gouvernement algérien', 'premier ministre',
]

const SPORTS_TRIGGERS = [
  'مباراة', 'مباريات', 'نتيجة', 'نتائج', 'تشكيلة', 'هدف', 'دوري',
  'ترتيب', 'بطولة', 'كأس', 'ملخص', 'مباشر', 'match', 'score',
  'منتخب', 'الخضر', 'ldc', 'can', 'coupe d\'algérie',
]

/**
 * هل الاستعلام يحتاج بحثاً فورياً في الإنترنت؟
 */
export function isRealtimeQuery(query = '') {
  const q = query.toLowerCase()
  return REALTIME_TRIGGERS.some(kw => q.includes(kw.toLowerCase()))
}

export function isSportsQuery(query = '') {
  const q = query.toLowerCase()
  return SPORTS_TRIGGERS.some(kw => q.includes(kw.toLowerCase()))
}

/**
 * بناء استعلام بحث ذكي من سؤال المستخدم
 */
function buildSearchQuery(query) {
  const q = query.trim()
  if (isSportsQuery(q)) {
    if (/الجزائر|خضر|منتخب/.test(q)) return `منتخب الجزائر ${q} ${new Date().getFullYear()}`
    return `${q} ${new Date().getFullYear()}`
  }
  return q
}

/**
 * جلب أخبار من Google News RSS (مجاني بدون API key)
 */
async function fetchGoogleNewsRSS(query, lang = 'ar') {
  try {
    const encodedQ = encodeURIComponent(query)
    const url = lang === 'ar'
      ? `https://news.google.com/rss/search?q=${encodedQ}&hl=ar&gl=DZ&ceid=DZ:ar`
      : `https://news.google.com/rss/search?q=${encodedQ}&hl=fr&gl=DZ&ceid=DZ:fr`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DZ-Agent/5.0 (+https://dz-gpt.vercel.app)',
        'Accept': 'application/rss+xml,application/xml,text/xml,*/*',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []

    const xml = await res.text()
    const items = []
    const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi
    let m
    while ((m = itemRx.exec(xml)) !== null && items.length < 8) {
      const block = m[1]
      const get = (tag) => {
        const rx = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')
        const r2 = block.match(rx)
        return r2 ? r2[1].replace(/<[^>]+>/g, '').trim() : ''
      }
      const title = get('title')
      const pubDate = get('pubDate')
      const source = get('source') || 'Google News'
      if (!title || title.length < 5) continue
      items.push({ title, pubDate, source, link: get('link') })
    }
    return items
  } catch { return [] }
}

/**
 * جلب نتائج من DuckDuckGo (بدون API key)
 */
async function fetchDuckDuckGo(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
    })
    if (!res.ok) return []
    const data = await res.json()
    const results = []
    if (data.AbstractText) {
      results.push({ title: data.Heading || query, snippet: data.AbstractText.slice(0, 300), source: data.AbstractSource || 'DuckDuckGo' })
    }
    for (const r of (data.RelatedTopics || []).slice(0, 4)) {
      if (r.Text && r.Text.length > 20) {
        results.push({ title: r.Text.slice(0, 80), snippet: r.Text.slice(0, 200), source: 'DuckDuckGo' })
      }
    }
    return results
  } catch { return [] }
}

/**
 * جلب من RSS الجزائر المتخصصة للمباريات والرياضة
 */
async function fetchAlgeriaSportsRSS() {
  const sportsFeeds = [
    { name: 'APS رياضة', url: 'https://www.aps.dz/ar/sport/feed' },
    { name: 'الهداف', url: 'https://www.elheddaf.com/feed' },
    { name: 'Google رياضة الجزائر', url: 'https://news.google.com/rss/search?q=رياضة+الجزائر+مباراة&hl=ar&gl=DZ&ceid=DZ:ar' },
    { name: 'Google منتخب الجزائر', url: 'https://news.google.com/rss/search?q=منتخب+الجزائر&hl=ar&gl=DZ&ceid=DZ:ar' },
  ]

  const results = []
  await Promise.allSettled(sportsFeeds.map(async feed => {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/rss+xml,application/xml,*/*' },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return
      const xml = await res.text()
      const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi
      let m, count = 0
      while ((m = itemRx.exec(xml)) !== null && count < 5) {
        const block = m[1]
        const get = (tag) => {
          const rx = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i')
          const r2 = block.match(rx)
          return r2 ? r2[1].replace(/<[^>]+>/g, '').trim() : ''
        }
        const title = get('title')
        if (!title || title.length < 5) continue
        results.push({ title, pubDate: get('pubDate'), source: feed.name })
        count++
      }
    } catch {}
  }))
  return results
}

/**
 * الدالة الرئيسية — البحث الفوري في الإنترنت
 * تُرجع سياقاً جاهزاً للحقن في الـ system prompt
 */
export async function fetchRealtimeContext(query) {
  const searchQuery = buildSearchQuery(query)
  const isSports = isSportsQuery(query)
  const now = new Date()
  const dateStr = now.toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })

  try {
    // بحث متوازي من عدة مصادر
    const [googleAR, googleFR, ddg, sports] = await Promise.allSettled([
      fetchGoogleNewsRSS(searchQuery, 'ar'),
      isSports ? fetchGoogleNewsRSS(searchQuery, 'fr') : Promise.resolve([]),
      fetchDuckDuckGo(searchQuery),
      isSports ? fetchAlgeriaSportsRSS() : Promise.resolve([]),
    ])

    const newsAR = googleAR.status === 'fulfilled' ? googleAR.value : []
    const newsFR = googleFR.status === 'fulfilled' ? googleFR.value : []
    const ddgResults = ddg.status === 'fulfilled' ? ddg.value : []
    const sportsItems = sports.status === 'fulfilled' ? sports.value : []

    // دمج وإزالة التكرار
    const allNews = [...newsAR, ...sportsItems, ...newsFR]
      .filter((v, i, arr) => arr.findIndex(x => x.title === v.title) === i)
      .slice(0, 10)

    if (allNews.length === 0 && ddgResults.length === 0) return null

    // بناء السياق
    let ctx = `\n\n---\n## 🌐 نتائج البحث الفوري في الإنترنت\n`
    ctx += `📅 التاريخ: ${dateStr} — ⏰ الوقت: ${timeStr}\n`
    ctx += `🔍 البحث عن: "${searchQuery}"\n\n`

    if (allNews.length > 0) {
      ctx += `### 📰 أحدث الأخبار:\n`
      for (const item of allNews) {
        const dateInfo = item.pubDate ? ` (${new Date(item.pubDate).toLocaleDateString('ar-DZ')})` : ''
        ctx += `- **${item.title}**${dateInfo} — *${item.source}*\n`
      }
    }

    if (ddgResults.length > 0 && allNews.length < 3) {
      ctx += `\n### 🔎 معلومات إضافية:\n`
      for (const r of ddgResults.slice(0, 3)) {
        ctx += `- ${r.snippet} — *${r.source}*\n`
      }
    }

    ctx += `\n> ℹ️ **تعليمات للـ AI**: استخدم هذه البيانات الحقيقية للإجابة. لا تخترع نتائج. إذا لم تجد إجابة واضحة، قل للمستخدم أن المعلومة غير متاحة حالياً وأعطه المصادر.`
    ctx += `\n---\n`

    return ctx
  } catch (err) {
    console.warn('[RealtimeSearch] error:', err.message)
    return null
  }
}

/**
 * بحث حي عن شخص (لاعب، وزير، فنان، مسؤول...)
 * يُستخدم كـ fallback عندما لا تجد Wikipedia نتيجة
 * المصادر: Google News RSS (عربية + فرنسية) + DuckDuckGo Instant Answer
 */
export async function searchPersonOnline(personName) {
  try {
    const yearNow = new Date().getFullYear()

    const [arNews, frNews, ddg, ddgAlg] = await Promise.allSettled([
      fetchGoogleNewsRSS(personName, 'ar'),
      fetchGoogleNewsRSS(`${personName} algérie`, 'fr'),
      fetchDuckDuckGo(personName),
      fetchDuckDuckGo(`${personName} الجزائر ${yearNow}`),
    ])

    const newsAR  = arNews.status  === 'fulfilled' ? arNews.value  : []
    const newsFR  = frNews.status  === 'fulfilled' ? frNews.value  : []
    const ddgMain = ddg.status     === 'fulfilled' ? ddg.value     : []
    const ddgAlgR = ddgAlg.status  === 'fulfilled' ? ddgAlg.value  : []

    // دمج الأخبار مع إزالة التكرار
    const allNews = [...newsAR, ...newsFR]
      .filter((v, i, arr) => arr.findIndex(x => x.title === v.title) === i)
      .slice(0, 6)

    // أفضل نتيجة DuckDuckGo
    const bestDDG = [...ddgMain, ...ddgAlgR].find(r => r.snippet && r.snippet.length > 30)

    const hasInfo = allNews.length > 0 || !!bestDDG

    if (!hasInfo) return null

    // بناء سياق للـ AI
    let ctx = `[PERSON_WEB_CONTEXT]\n`
    ctx += `🔍 **نتائج البحث الحي عن: "${personName}"** (${new Date().toLocaleDateString('ar-DZ')})\n\n`

    if (bestDDG) {
      ctx += `### 📖 معلومة موثوقة:\n${bestDDG.snippet}\n— *المصدر: ${bestDDG.source}*\n\n`
    }

    if (allNews.length > 0) {
      ctx += `### 📰 أحدث الأخبار المتعلقة:\n`
      for (const item of allNews) {
        const d = item.pubDate ? ` (${new Date(item.pubDate).toLocaleDateString('ar-DZ')})` : ''
        ctx += `- **${item.title}**${d} — *${item.source}*\n`
      }
    }

    ctx += `\n[/PERSON_WEB_CONTEXT]`
    return { text: ctx, hasInfo }
  } catch (err) {
    console.warn('[PersonWebSearch] error:', err.message)
    return null
  }
}
