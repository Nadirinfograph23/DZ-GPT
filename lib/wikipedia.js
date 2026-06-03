/**
 * lib/wikipedia.js
 * Wikipedia API — يعمل تماماً مثل خانة البحث في ويكيبيديا
 * يدعم العربية، الفرنسية، الإنجليزية
 *
 * الاستراتيجية المحسّنة:
 *   1. OpenSearch (prefix) — أسرع، يشبه تلميح خانة البحث
 *   2. action=query&list=search — fallback للبحث النصي الكامل
 *   3. REST /page/summary — ملخص + صورة + وصف
 *   4. prop=extracts — نص المقدمة الكامل
 */

const WIKI_TIMEOUT = 10000

// ─── كلمات تدل على مقالة شخصية ───────────────────────────────────────────────
const _PERSON_ARTICLE_KW = [
  'ولد', 'وُلد', 'مواليد', 'توفي', 'توفّي', 'وفاة',
  'ممثل', 'مطرب', 'مغني', 'لاعب', 'رياضي', 'سياسي', 'كاتب',
  'مخرج', 'ملحن', 'عازف', 'موسيقار', 'شاعر', 'أديب', 'روائي',
  'وزير', 'رئيس', 'سفير', 'والي', 'نائب', 'قائد', 'جنرال',
  'فنان', 'راقص', 'مصور', 'رسام', 'هاكر', 'مبرمج', 'عالم',
  'actor', 'singer', 'footballer', 'born', 'politician', 'writer', 'player',
  'né', 'née', 'acteur', 'chanteur', 'footballeur', 'né le',
]
// ─── كلمات تدل على أن المقالة ليست عن شخص ────────────────────────────────────
const _NON_PERSON_KW = [
  'سورة', 'آية', 'الآيات', 'قرآن', 'جزء', 'ربع',
  'مدينة', 'ولاية', 'منطقة', 'دولة', 'بلدية', 'دائرة',
  'قانون', 'مصطلح', 'مفهوم', 'نظرية', 'عملية', 'شركة', 'منظمة',
  'surah', 'chapter', 'verse', 'city', 'province', 'region', 'commune',
]

/**
 * هل مقالة ويكيبيديا عن شخص حقيقي؟
 */
export function isPersonArticle(data) {
  if (!data) return false
  const desc = (data.description || '').toLowerCase()
  const extract = (data.extract || '').slice(0, 600).toLowerCase()
  const combined = desc + ' ' + extract

  if (_NON_PERSON_KW.some(kw => combined.includes(kw))) return false
  if (_PERSON_ARTICLE_KW.some(kw => combined.includes(kw.toLowerCase()))) return true
  if (data.type === 'standard' && desc.length > 3) return true
  return false
}

function detectLang(query) {
  if (/[\u0600-\u06FF]/.test(query)) return 'ar'
  if (/[àâçéèêëîïôùûü]/i.test(query) || /\b(le|la|les|un|une|des|et|est|qui|que)\b/i.test(query)) return 'fr'
  return 'en'
}

/**
 * ① OpenSearch — يعمل تماماً مثل خانة البحث (prefix/title matching)
 * يُرجع قائمة [titles, descriptions, urls]
 */
async function openSearch(query, lang, limit = 8) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKI_TIMEOUT)
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'opensearch',
      search: query,
      limit: String(limit),
      namespace: '0',
      format: 'json',
      origin: '*',
    })
    const res = await fetch(url, { signal: ac.signal })
    clearTimeout(timer)
    if (!res.ok) return []
    const data = await res.json()
    // data: [query, [titles], [descriptions], [urls]]
    const titles = data[1] || []
    const urls   = data[3] || []
    return titles.map((t, i) => ({ title: t, url: urls[i] || '' }))
  } catch {
    clearTimeout(timer)
    return []
  }
}

/**
 * ② Fulltext search fallback
 */
async function fulltextSearch(query, lang, limit = 5) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKI_TIMEOUT)
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: String(limit),
      srinfo: 'totalhits',
      srprop: 'snippet|titlesnippet',
      format: 'json',
      origin: '*',
    })
    const res = await fetch(url, { signal: ac.signal })
    clearTimeout(timer)
    if (!res.ok) return []
    const data = await res.json()
    return (data?.query?.search || []).map(r => ({ title: r.title, url: '' }))
  } catch {
    clearTimeout(timer)
    return []
  }
}

/**
 * ③ REST summary — ملخص + صورة + وصف + نوع المقالة
 */
async function fetchPageSummary(title, lang) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKI_TIMEOUT)
  try {
    const enc = encodeURIComponent(title.replace(/ /g, '_'))
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${enc}`
    const res = await fetch(url, { signal: ac.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const d = await res.json()
    if (!d.extract || d.extract.length < 30) return null
    return {
      title:       d.title,
      description: d.description || '',
      extract:     d.extract,
      url:         d.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${enc}`,
      thumbnail:   d.thumbnail?.source || null,
      type:        d.type || 'standard',
      lang,
      source: 'Wikipedia',
    }
  } catch {
    clearTimeout(timer)
    return null
  }
}

/**
 * ④ Extended extract — نص المقدمة الكامل (أطول من REST)
 */
async function fetchExtendedExtract(title, lang) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKI_TIMEOUT)
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query',
      titles: title,
      prop: 'extracts|pageimages|info',
      exintro: 'true',
      explaintext: 'true',
      inprop: 'url',
      pithumbsize: '300',
      format: 'json',
      origin: '*',
    })
    const res = await fetch(url, { signal: ac.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    const pages = data?.query?.pages || {}
    const page = Object.values(pages)[0]
    if (!page || page.missing !== undefined) return null
    return {
      extract:   (page.extract || '').trim(),
      thumbnail: page.thumbnail?.source || null,
      pageUrl:   page.fullurl || null,
    }
  } catch {
    clearTimeout(timer)
    return null
  }
}

/**
 * دالة البحث الرئيسية للأشخاص — تعمل مثل خانة البحث في ويكيبيديا بالضبط
 *
 * الخوارزمية:
 *   1. OpenSearch العربية → أول نتيجة مطابقة لعنوان (مثل خانة البحث)
 *   2. إذا فشل أو النتيجة ليست شخصاً → OpenSearch بـ (query + " شخصية")
 *   3. Fulltext search العربية fallback
 *   4. نفس الخطوات بالفرنسية ثم الإنجليزية
 *   5. لكل عنوان: REST summary + Extended extract معاً
 */
export async function searchPersonWikipedia(query) {
  const langOrder = ['ar', 'fr', 'en']

  for (const lang of langOrder) {
    // ─── محاولة 1: OpenSearch (مثل خانة البحث) ────────────────────────────────
    const osResults = await openSearch(query, lang)
    const picked = await _pickPersonFromTitles(osResults, lang)
    if (picked) return picked

    // ─── محاولة 2: OpenSearch بإضافة "شخصية" لتوضيح النية ─────────────────────
    if (lang === 'ar') {
      const os2 = await openSearch(query + ' شخصية', lang)
      const picked2 = await _pickPersonFromTitles(os2, lang)
      if (picked2) return picked2
    }

    // ─── محاولة 3: Fulltext search fallback ───────────────────────────────────
    const ftResults = await fulltextSearch(query, lang)
    const picked3 = await _pickPersonFromTitles(ftResults, lang)
    if (picked3) return picked3
  }

  return null
}

/**
 * من قائمة عناوين → جلب أول مقالة شخص
 */
async function _pickPersonFromTitles(candidates, lang) {
  for (const { title } of candidates.slice(0, 4)) {
    try {
      // جلب REST summary أولاً (سريع)
      const summary = await fetchPageSummary(title, lang)
      if (!summary) continue

      // جلب extract مطوّل
      const extended = await fetchExtendedExtract(title, lang)
      const fullExtract = extended?.extract || summary.extract
      const thumbnail   = extended?.thumbnail || summary.thumbnail

      // دمج البيانات
      const result = {
        ...summary,
        extract:   fullExtract.slice(0, 1500),
        thumbnail: thumbnail,
      }

      // هل المقالة عن شخص؟
      if (isPersonArticle(result)) return result

    } catch { continue }
  }
  return null
}

/**
 * بحث عام في ويكيبيديا (للمواضيع غير الشخصية)
 */
export async function searchWikipedia(query, { lang } = {}) {
  const detectedLang = lang || detectLang(query)
  const langs = detectedLang === 'ar' ? ['ar', 'fr', 'en']
              : detectedLang === 'fr' ? ['fr', 'ar', 'en']
              : ['en', 'ar', 'fr']

  for (const l of langs) {
    const osResults = await openSearch(query, l, 5)
    for (const { title } of osResults.slice(0, 3)) {
      const summary = await fetchPageSummary(title, l)
      if (summary) return summary
    }
    // fulltext fallback
    const ftResults = await fulltextSearch(query, l, 3)
    for (const { title } of ftResults.slice(0, 2)) {
      const summary = await fetchPageSummary(title, l)
      if (summary) return summary
    }
  }
  return null
}

/**
 * DuckDuckGo Instant Answer — معلومات فورية بدون مفتاح API
 */
export async function duckduckgoInstant(query) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKI_TIMEOUT)
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, { signal: ac.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    const answer = data.Answer || data.AbstractText || ''
    if (answer.length < 10) return null
    return {
      answer: answer.slice(0, 600),
      source: data.AbstractSource || data.AnswerType || '',
      url:    data.AbstractURL || '',
      type:   data.Type || 'A',
    }
  } catch {
    clearTimeout(timer)
    return null
  }
}

/**
 * بحث موحّد: Wikipedia + DuckDuckGo
 */
export async function webKnowledgeSearch(query) {
  const [wikiResult, ddgResult] = await Promise.allSettled([
    searchWikipedia(query),
    duckduckgoInstant(query),
  ])
  const wiki = wikiResult.status === 'fulfilled' ? wikiResult.value : null
  const ddg  = ddgResult.status  === 'fulfilled' ? ddgResult.value  : null
  if (!wiki && !ddg) return null

  const parts = []
  if (ddg?.answer) {
    parts.push(`**${ddg.source || 'معلومة فورية'}:** ${ddg.answer}`)
    if (ddg.url) parts.push(`[المصدر](${ddg.url})`)
  }
  if (wiki?.extract) {
    parts.push(`\n**${wiki.title}** (Wikipedia):\n${wiki.extract}`)
    parts.push(`[اقرأ المزيد](${wiki.url})`)
  }
  return {
    text: parts.join('\n'),
    wiki,
    ddg,
    sources: [
      ...(ddg?.url  ? [{ title: ddg.source || 'DuckDuckGo', url: ddg.url }] : []),
      ...(wiki?.url ? [{ title: `Wikipedia: ${wiki.title}`, url: wiki.url }] : []),
    ],
  }
}
