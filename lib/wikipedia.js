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

async function fetchWikiSummary(query, lang) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKI_TIMEOUT)

  try {
    // أولاً: ابحث عن العنوان الصحيح
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: '3',
      format: 'json',
      origin: '*',
    })

    const searchRes = await fetch(searchUrl, { signal: ac.signal })
    clearTimeout(timer)

    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const firstResult = searchData?.query?.search?.[0]
    if (!firstResult) return null

    // ثانياً: اجلب ملخص المقالة
    const title = encodeURIComponent(firstResult.title)
    const summaryUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`

    const ac2 = new AbortController()
    const timer2 = setTimeout(() => ac2.abort(), WIKI_TIMEOUT)

    const summaryRes = await fetch(summaryUrl, { signal: ac2.signal })
    clearTimeout(timer2)

    if (!summaryRes.ok) return null
    const data = await summaryRes.json()

    if (!data.extract || data.extract.length < 30) return null

    return {
      title: data.title,
      extract: data.extract.slice(0, 800),
      url: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${title}`,
      lang,
      source: 'Wikipedia',
      thumbnail: data.thumbnail?.source || null,
    }
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
