/**
 * lib/wikipedia.js
 * Wikipedia API + DuckDuckGo Instant Answer — بحث مجاني بدون مفتاح API
 * يدعم العربية، الفرنسية، الإنجليزية
 */

const WIKI_TIMEOUT = 8000

function detectLang(query) {
  if (/[\u0600-\u06FF]/.test(query)) return 'ar'
  if (/[àâçéèêëîïôùûü]/i.test(query) || /\b(le|la|les|un|une|des|et|est|qui|que)\b/i.test(query)) return 'fr'
  return 'en'
}

/**
 * بحث Wikipedia وإرجاع ملخص المقالة
 */
export async function searchWikipedia(query, { lang } = {}) {
  const detectedLang = lang || detectLang(query)
  const langs = detectedLang === 'ar' ? ['ar', 'fr', 'en']
              : detectedLang === 'fr' ? ['fr', 'ar', 'en']
              : ['en', 'ar', 'fr']

  for (const l of langs) {
    try {
      const result = await fetchWikiSummary(query, l)
      if (result) return result
    } catch {}
  }
  return null
}

// ─── كلمات تدل على مقالة شخصية ────────────────────────────────────────────────
const _PERSON_ARTICLE_KW = [
  'ولد', 'وُلد', 'مواليد', 'توفي', 'توفّي',
  'ممثل', 'مطرب', 'مغني', 'لاعب', 'رياضي', 'سياسي', 'كاتب',
  'مخرج', 'ملحن', 'عازف', 'موسيقار', 'شاعر', 'أديب',
  'وزير', 'رئيس', 'سفير', 'والي', 'نائب', 'قائد',
  'فنان', 'راقص', 'مصور', 'رسام', 'هاكر', 'مبرمج',
  'actor', 'singer', 'footballer', 'born', 'politician', 'writer',
  'né', 'née', 'acteur', 'chanteur', 'footballeur',
]
// ─── كلمات تدل على أن المقالة ليست عن شخص ────────────────────────────────────
const _NON_PERSON_KW = [
  'سورة', 'آية', 'الآيات', 'قرآن', 'جزء', 'ربع',
  'مدينة', 'ولاية', 'منطقة', 'دولة', 'بلدية', 'دائرة',
  'قانون', 'مصطلح', 'مفهوم', 'نظرية', 'عملية', 'شركة',
  'surah', 'chapter', 'verse', 'city', 'province', 'region',
]

/**
 * هل مقالة ويكيبيديا عن شخص حقيقي؟
 */
export function isPersonArticle(data) {
  if (!data) return false
  // type='standard' + description يحتوي كلمة بشرية
  const desc = (data.description || '').toLowerCase()
  const extract = (data.extract || '').toLowerCase()
  const combined = desc + ' ' + extract

  // نفِ أولاً الأنماط الغير-شخصية
  if (_NON_PERSON_KW.some(kw => combined.includes(kw))) return false

  // أكّد إذا وُجدت كلمات شخصية
  if (_PERSON_ARTICLE_KW.some(kw => combined.includes(kw.toLowerCase()))) return true

  // Wikipedia API type: 'standard' مع description قصير شخصي
  if (data.type === 'standard' && desc.length > 0) return true

  return false
}

async function fetchWikiSummary(query, lang) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKI_TIMEOUT)

  try {
    // أولاً: ابحث عن العنوان الصحيح
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: '5',
      format: 'json',
      origin: '*',
    })

    const searchRes = await fetch(searchUrl, { signal: ac.signal })
    clearTimeout(timer)

    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const results = searchData?.query?.search || []
    if (results.length === 0) return null

    // جرّب أول 3 نتائج حتى نجد الأنسب
    for (const hit of results.slice(0, 3)) {
      const title = encodeURIComponent(hit.title)
      const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`

      const ac2 = new AbortController()
      const timer2 = setTimeout(() => ac2.abort(), WIKI_TIMEOUT)

      try {
        const summaryRes = await fetch(summaryUrl, { signal: ac2.signal })
        clearTimeout(timer2)
        if (!summaryRes.ok) continue
        const data = await summaryRes.json()
        if (!data.extract || data.extract.length < 30) continue

        return {
          title: data.title,
          description: data.description || '',
          extract: data.extract.slice(0, 900),
          url: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${title}`,
          lang,
          source: 'Wikipedia',
          thumbnail: data.thumbnail?.source || null,
          type: data.type || 'standard',
          pageType: data.type,
        }
      } catch {
        clearTimeout(timer2)
        continue
      }
    }
    return null
  } catch (e) {
    clearTimeout(timer)
    return null
  }
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
    const source = data.AbstractSource || data.AnswerType || ''
    const url2 = data.AbstractURL || ''

    if (answer.length < 10) return null

    return {
      answer: answer.slice(0, 600),
      source,
      url: url2,
      type: data.Type || 'A',
    }
  } catch (e) {
    clearTimeout(timer)
    return null
  }
}

/**
 * بحث موحّد: Wikipedia + DuckDuckGo معاً
 * يُرجع أفضل نتيجة متاحة
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
      ...(ddg?.url ? [{ title: ddg.source || 'DuckDuckGo', url: ddg.url }] : []),
      ...(wiki?.url ? [{ title: `Wikipedia: ${wiki.title}`, url: wiki.url }] : []),
    ],
  }
}
