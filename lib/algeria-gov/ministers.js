/**
 * lib/algeria-gov/ministers.js
 * نظام التحقق التلقائي من الوزراء الجزائريين الحاليين
 * Sources: premier-ministre.gov.dz → el-mouradia.dz → fallback Google News
 * Cache: 24h TTL
 */

const MINISTERS_CACHE = { data: null, fetchedAt: 0 }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 ساعة

// ── مصادر الجلب بالأولوية ─────────────────────────────────────────────────
const SOURCES = [
  {
    name: 'premier-ministre.gov.dz',
    url: 'https://www.premier-ministre.gov.dz/ar/gouvernement/membres-du-gouvernement',
    priority: 1,
  },
  {
    name: 'el-mouradia.dz',
    url: 'https://www.el-mouradia.dz/ar/algerie/gouvernement/membres-du-gouvernement',
    priority: 2,
  },
  {
    name: 'algerie.dz',
    url: 'https://www.algerie.dz/ar/gouvernement',
    priority: 3,
  },
]

// ── رؤساء الحكومة الثابتون (fallback موثوق) ──────────────────────────────
const KNOWN_STATIC = [
  { role: 'رئيس الجمهورية', name: 'عبد المجيد تبون', ministry: 'رئاسة الجمهورية', since: '2019', source: 'static' },
]

// ── أنماط استخراج الوزراء من HTML ────────────────────────────────────────
const MINISTER_PATTERNS = [
  // Pattern: <h3 class="...">وزير الفلاحة</h3> ... <p>اسم الوزير</p>
  /<(?:h[2-4]|div|p)[^>]*class="[^"]*(?:minister|ministre|wazir|titre|nom|name|role|poste|fonction)[^"]*"[^>]*>([\s\S]{5,200}?)<\/(?:h[2-4]|div|p)>/gi,
  // Pattern: <td>الاسم</td><td>المنصب</td>
  /<tr[^>]*>[\s\S]*?<td[^>]*>([\u0600-\u06FF][^<]{5,80})<\/td>[\s\S]*?<td[^>]*>([\u0600-\u06FF][^<]{10,100})<\/td>/gi,
  // Pattern: JSON-LD or structured data
  /"name"\s*:\s*"([\u0600-\u06FF][^"]{5,60})"\s*,\s*"jobTitle"\s*:\s*"([^"]{10,100})"/g,
]

// ── تنظيف النص من HTML ───────────────────────────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ── استخراج الوزراء من HTML بالأنماط المتعددة ────────────────────────────
function extractMinistersFromHtml(html, sourceName) {
  const ministers = []
  const seen = new Set()

  // ── استخراج الكتل الهيكلية: article / li / div مع عنوان عربي ──────────
  const blockRe = /<(?:article|li|div)[^>]*>([\s\S]{30,600}?)<\/(?:article|li|div)>/gi
  let block
  // eslint-disable-next-line no-cond-assign
  while ((block = blockRe.exec(html)) !== null) {
    const inner = block[1]
    // يجب أن يحتوي على نص عربي
    const arabicWords = (inner.match(/[\u0600-\u06FF]{3,}/g) || [])
    if (arabicWords.length < 4) continue

    const text = stripHtml(inner)

    // نبحث عن أنماط "وزير/رئيس/كاتب الدولة"
    const roleMatch = text.match(
      /((?:وزير(?:ة)?|كاتب(?:ة)?\s+الدولة|رئيس\s+(?:مجلس|الحكومة|الوزراء|الجمهورية|الديوان)|مدير\s+عام|أمين\s+عام|والي|سفير)[\u0600-\u06FF\s،,()]{5,120})/
    )
    if (!roleMatch) continue

    const role = roleMatch[1].trim().replace(/\s+/g, ' ')

    // نبحث عن اسم شخص (3+ كلمات عربية بعد أو قبل المنصب)
    const nameMatch = text.match(
      /(?:^|[\n\r|،,])\s*([\u0600-\u06FF]{2,15}(?:\s+[\u0600-\u06FF]{2,15}){1,4})\s*(?:$|[\n\r|،,])/m
    )
    if (!nameMatch) continue

    const name = nameMatch[1].trim()
    // تجنب الأسماء القصيرة جداً أو التي تبدأ بـ"وزير"
    if (name.length < 8 || /^(?:وزير|رئيس|مدير|كاتب|السيد|السيدة)/.test(name)) continue

    const key = `${name}-${role}`.slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)

    ministers.push({
      name,
      role: role.slice(0, 120),
      ministry: role.replace(/^وزير(?:ة)?\s+/i, '').trim().slice(0, 80),
      source: sourceName,
    })
    if (ministers.length >= 50) break
  }

  return ministers
}

// ── جلب من مصدر واحد مع timeout ─────────────────────────────────────────
async function fetchFromSource(source) {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    const res = await fetch(source.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DZ-GPT-Bot/2.0; +https://dz-gpt.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const html = await res.text()
    const ministers = extractMinistersFromHtml(html, source.name)
    if (ministers.length > 0) {
      console.log(`[AlgGov] ✅ ${source.name}: extracted ${ministers.length} ministers`)
      return { ministers, source: source.name, url: source.url }
    }
    return null
  } catch (err) {
    console.warn(`[AlgGov] ⚠️ ${source.name} failed: ${err.message}`)
    return null
  }
}

// ── Fallback: بحث أخبار عن تعيينات الوزراء الأخيرة ──────────────────────
async function fetchMinistersFromNews() {
  try {
    const query = encodeURIComponent('وزراء الحكومة الجزائرية 2024 2025 تعيين')
    const url = `https://news.google.com/rss/search?q=${query}&hl=ar&gl=DZ&ceid=DZ:ar`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'DZ-GPT-Bot/2.0' },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const xml = await res.text()
    const items = []
    const itemRe = /<item>([\s\S]*?)<\/item>/g
    let m
    while ((m = itemRe.exec(xml)) !== null && items.length < 10) {
      const titleMatch = m[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)
      const linkMatch = m[1].match(/<link>(.*?)<\/link>/)
      if (titleMatch) {
        items.push({
          title: titleMatch[1].trim(),
          link: linkMatch ? linkMatch[1].trim() : '',
        })
      }
    }
    if (items.length > 0) {
      console.log(`[AlgGov] 📰 News fallback: ${items.length} items about ministers`)
      return { newsItems: items, source: 'Google News RSS', url }
    }
    return null
  } catch (err) {
    console.warn(`[AlgGov] News fallback failed: ${err.message}`)
    return null
  }
}

// ── الدالة الرئيسية: جلب بيانات الوزراء ─────────────────────────────────
export async function fetchAlgeriaMinistersData() {
  const now = Date.now()

  // ── استخدام الـ cache إذا كان حديثاً ─────────────────────────────────
  if (MINISTERS_CACHE.data && (now - MINISTERS_CACHE.fetchedAt) < CACHE_TTL_MS) {
    const ageMin = Math.floor((now - MINISTERS_CACHE.fetchedAt) / 60000)
    console.log(`[AlgGov] ♻️ Cache hit — age: ${ageMin}min`)
    return { ...MINISTERS_CACHE.data, cached: true, cacheAgeMin: ageMin }
  }

  console.log('[AlgGov] 🔍 Fetching ministers from official sources...')

  // ── محاولة المصادر الرسمية بالتسلسل ──────────────────────────────────
  for (const source of SOURCES) {
    const result = await fetchFromSource(source)
    if (result && result.ministers.length >= 5) {
      const data = {
        ministers: result.ministers,
        source: result.source,
        sourceUrl: result.url,
        fetchedAt: new Date().toISOString(),
        newsItems: null,
        status: 'scraped',
      }
      MINISTERS_CACHE.data = data
      MINISTERS_CACHE.fetchedAt = now
      return data
    }
  }

  // ── Fallback: أخبار التعيينات ─────────────────────────────────────────
  console.log('[AlgGov] ⚠️ All official sources failed — trying news fallback')
  const newsResult = await fetchMinistersFromNews()
  if (newsResult) {
    const data = {
      ministers: [],
      source: newsResult.source,
      sourceUrl: newsResult.url,
      fetchedAt: new Date().toISOString(),
      newsItems: newsResult.newsItems,
      status: 'news_fallback',
    }
    MINISTERS_CACHE.data = data
    MINISTERS_CACHE.fetchedAt = now
    return data
  }

  // ── Static fallback: البيانات الثابتة الموثوقة فقط ─────────────────────
  console.log('[AlgGov] 🔒 Using static fallback')
  return {
    ministers: KNOWN_STATIC,
    source: 'static (بيانات ثابتة)',
    sourceUrl: 'https://www.premier-ministre.gov.dz',
    fetchedAt: new Date().toISOString(),
    newsItems: null,
    status: 'static_fallback',
  }
}

// ── بناء نص السياق للـ system prompt ─────────────────────────────────────
export function buildMinistersContext(data) {
  if (!data) return ''

  const lines = [
    `## 🏛️ الحكومة الجزائرية — بيانات رسمية`,
    `> 📡 المصدر: **[${data.source}](${data.sourceUrl})** — ${data.fetchedAt ? data.fetchedAt.slice(0, 10) : ''}${data.cached ? ` *(cache — ${data.cacheAgeMin}د)*` : ''}`,
    `> ⚠️ استخدم هذه البيانات فقط للإجابة عن الوزراء والمناصب الحكومية — لا تخترع منصباً غير موجود هنا.`,
    '',
  ]

  if (data.status === 'scraped' && data.ministers.length > 0) {
    lines.push(`### أعضاء الحكومة (${data.ministers.length} منصب)`)
    lines.push('| المنصب | الاسم |')
    lines.push('|--------|-------|')
    for (const m of data.ministers) {
      lines.push(`| ${m.role} | **${m.name}** |`)
    }
  } else if (data.status === 'news_fallback' && data.newsItems?.length > 0) {
    lines.push(`### 📰 آخر أخبار التعيينات الحكومية`)
    lines.push(`> ⚠️ لم أتمكن من جلب قائمة الوزراء مباشرةً — هذه آخر الأخبار المتاحة:`)
    for (const item of data.newsItems) {
      lines.push(`• ${item.title}${item.link ? ` — [رابط](${item.link})` : ''}`)
    }
    lines.push(`> للتحقق الرسمي: [premier-ministre.gov.dz](https://www.premier-ministre.gov.dz/ar/gouvernement/membres-du-gouvernement)`)
  } else if (data.status === 'static_fallback') {
    lines.push(`### المناصب الثابتة الموثوقة`)
    for (const m of data.ministers) {
      lines.push(`• **${m.role}**: ${m.name}`)
    }
    lines.push(`> ⚠️ لم أتمكن من جلب قائمة الوزراء الكاملة من المصادر الرسمية — للتحقق: [premier-ministre.gov.dz](https://www.premier-ministre.gov.dz/ar/gouvernement/membres-du-gouvernement)`)
  }

  return lines.join('\n')
}

// ── كشف استعلامات الوزراء والمناصب الحكومية ──────────────────────────────
export function isMinisterQuery(message) {
  if (!message || message.length < 5) return false
  return /(?:وزير|وزراء|الوزارة|الحكومة\s+الجزائرية|من\s+هو\s+وزير|من\s+هي\s+وزيرة|رئيس\s+الحكومة|الوزير\s+الأول|أعضاء\s+الحكومة|تشكيل\s+الحكومة|الوزير\s+(?:المكلف|المنتدب)|كاتب\s+الدولة|ديوان\s+رئاسة|شكون\s+(?:هو\s+)?وزير|واش\s+(?:هو\s+)?وزير|وزير\s+ال[\u0600-\u06FF]+|ministre|gouvernement\s+algérien)/i.test(message)
}
