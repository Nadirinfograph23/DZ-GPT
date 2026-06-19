/**
 * lib/wiki-entity-lookup.js
 * استرجاع حي من Wikipedia + Wikidata لأسئلة الكيانات
 * (كتاب → مؤلف، فيلم → مخرج، لاعب → نادي، شاعر → قصيدة)
 */

const WIKI_TIMEOUT = 12000

const _RELATION_MAP = {
  author:    { ar: 'المؤلف / الكاتب', wdProp: 'P50' },
  director:  { ar: 'المخرج',          wdProp: 'P57' },
  composer:  { ar: 'الملحن',          wdProp: 'P86' },
  publisher: { ar: 'الناشر',          wdProp: 'P123' },
  performer: { ar: 'المغني / المؤدي', wdProp: 'P175' },
}

// ─── كشف نوع الاستعلام والكيان المستهدف ──────────────────────────────────────
export function detectEntityAttributeQuery(q = '') {
  const t = q.trim()

  // نمط: "من هو/هي مؤلف/كاتب/صاحب [كتاب/رواية/...] X"
  // نمط: "من كتب X" / "من ألّف X" / "من أخرج فيلم X"
  const patterns = [
    { re: /(?:من\s+(?:هو|هي)?\s*)?(?:مؤلف|كاتب|صاحب|واضع|ألّف|كتب)\s+(?:كتاب|رواية|قصة|ديوان|مسرحية|قصيدة|نص|مقال)?\s*(.{2,60})/i, rel: 'author' },
    { re: /(?:من\s+(?:أخرج|هو\s+مخرج))\s+(?:فيلم|مسلسل|عرض)?\s*(.{2,60})/i, rel: 'director' },
    { re: /(?:من\s+(?:لحّن|هو\s+ملحن))\s+(?:أغنية|موسيقى|لحن)?\s*(.{2,60})/i, rel: 'composer' },
    { re: /(?:من\s+(?:غنى|يغني|أدّى))\s+(?:أغنية)?\s*(.{2,60})/i, rel: 'performer' },
  ]

  for (const { re, rel } of patterns) {
    const m = t.match(re)
    if (m?.[1]) {
      const entity = m[1].trim().replace(/[؟?!،,.]/g, '').trim()
      if (entity.length >= 2) {
        return { entity, relation: rel, relationAr: _RELATION_MAP[rel].ar }
      }
    }
  }
  return null
}

// ─── Wikipedia AR: بحث + استخراج المقالة ──────────────────────────────────────
async function _searchWikiAR(query) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKI_TIMEOUT)
  try {
    // 1. OpenSearch
    const searchUrl = `https://ar.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'opensearch', search: query, limit: '5',
      namespace: '0', format: 'json', origin: '*',
    })
    const sRes = await fetch(searchUrl, { signal: ac.signal })
    clearTimeout(timer)
    if (!sRes.ok) return null
    const [, titles, , urls] = await sRes.json()
    if (!titles?.length) return null
    const title = titles[0]
    const url   = urls?.[0] || `https://ar.wikipedia.org/wiki/${encodeURIComponent(title)}`

    // 2. Extract
    const eAc = new AbortController()
    const eTimer = setTimeout(() => eAc.abort(), WIKI_TIMEOUT)
    const extractUrl = `https://ar.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query', prop: 'extracts|description',
      exintro: '1', explaintext: '1', titles: title,
      format: 'json', origin: '*', redirects: '1',
    })
    const eRes = await fetch(extractUrl, { signal: eAc.signal })
    clearTimeout(eTimer)
    if (!eRes.ok) return null
    const eData = await eRes.json()
    const pages = Object.values(eData?.query?.pages || {})
    const page  = pages[0]
    if (!page || page.missing) return null
    return {
      title: page.title,
      extract: page.extract || '',
      description: page.description || '',
      url,
    }
  } catch {
    clearTimeout(timer)
    return null
  }
}

// ─── Wikidata: بحث بالاسم + استخراج العلاقة (P50، P57...) ──────────────────
async function _queryWikidata(entityName, relation = 'author') {
  const prop = _RELATION_MAP[relation]?.wdProp
  if (!prop) return null
  try {
    // 1. البحث عن الكيان (الكتاب / الفيلم...)
    const sUrl = `https://www.wikidata.org/w/api.php?` + new URLSearchParams({
      action: 'wbsearchentities', search: entityName,
      language: 'ar', limit: '5', format: 'json', origin: '*',
    })
    const sRes = await fetch(sUrl, { signal: AbortSignal.timeout(10000) })
    const sData = await sRes.json()
    const hits = sData?.search || []
    if (!hits.length) return null

    // جرّب أول 3 نتائج حتى نجد واحدة بها الخاصية المطلوبة
    for (const hit of hits.slice(0, 3)) {
      const entityId = hit.id
      const eUrl = `https://www.wikidata.org/w/api.php?` + new URLSearchParams({
        action: 'wbgetentities', ids: entityId, props: 'claims|labels|descriptions|sitelinks',
        languages: 'ar|en|fr', format: 'json', origin: '*',
      })
      const eRes  = await fetch(eUrl, { signal: AbortSignal.timeout(10000) })
      const eData = await eRes.json()
      const entity = eData?.entities?.[entityId]
      const claims = entity?.claims?.[prop] || []
      if (!claims.length) continue

      const personId = claims[0]?.mainsnak?.datavalue?.value?.id
      if (!personId) continue

      // اسم الشخص
      const pUrl = `https://www.wikidata.org/w/api.php?` + new URLSearchParams({
        action: 'wbgetentities', ids: personId,
        props: 'labels|descriptions|sitelinks',
        languages: 'ar|en|fr', format: 'json', origin: '*',
      })
      const pRes  = await fetch(pUrl, { signal: AbortSignal.timeout(10000) })
      const pData = await pRes.json()
      const person = pData?.entities?.[personId]
      const nameAr = person?.labels?.ar?.value
                  || person?.labels?.fr?.value
                  || person?.labels?.en?.value
                  || null
      const descAr = person?.descriptions?.ar?.value
                  || person?.descriptions?.en?.value
                  || null
      const wikiTitle = person?.sitelinks?.arwiki?.title
                     || person?.sitelinks?.frwiki?.title
                     || person?.sitelinks?.enwiki?.title
                     || null

      // مقال Wikipedia للشخص
      let personExtract = ''
      if (wikiTitle) {
        try {
          const lang = person?.sitelinks?.arwiki ? 'ar' : person?.sitelinks?.frwiki ? 'fr' : 'en'
          const wUrl = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
            action: 'query', prop: 'extracts|description',
            exintro: '1', explaintext: '1', exsentences: '4',
            titles: wikiTitle, format: 'json', origin: '*',
          })
          const wRes  = await fetch(wUrl, { signal: AbortSignal.timeout(8000) })
          const wData = await wRes.json()
          const wPages = Object.values(wData?.query?.pages || {})
          personExtract = wPages[0]?.extract?.slice(0, 500) || ''
        } catch {}
      }

      // مقال Wikipedia للكيان (الكتاب / الفيلم)
      const entityWikiTitle = entity?.sitelinks?.arwiki?.title || null
      const entityWikiUrl = entityWikiTitle
        ? `https://ar.wikipedia.org/wiki/${encodeURIComponent(entityWikiTitle)}`
        : `https://www.wikidata.org/wiki/${entityId}`

      return {
        entityName,
        entityWikiUrl,
        personId,
        personName:    nameAr,
        personDesc:    descAr,
        personExtract,
        personWikiUrl: wikiTitle
          ? `https://ar.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`
          : `https://www.wikidata.org/wiki/${personId}`,
        source: 'wikidata',
      }
    }
    return null
  } catch { return null }
}

// ─── استخراج المؤلف من نص مقالة Wikipedia ──────────────────────────────────
function _extractFromText(text = '', relation = 'author') {
  if (!text) return null
  const pats = {
    author: [
      /(?:ألّفه|كتبه|أنشأه|وضعه|صنّفه|نشره)\s+([^،.\n]{3,60})/i,
      /(?:للكاتب|للمؤلف|للأديب|للشاعر|للعالم|للفيلسوف|للروائي)\s+([^،.\n]{3,60})/i,
      /(?:تأليف|من تأليف|بقلم)\s*:?\s*([^،.\n]{3,60})/i,
    ],
    director: [
      /(?:أخرجه|من إخراج|إخراج)\s*:?\s*([^،.\n]{3,60})/i,
    ],
    composer: [
      /(?:ألحانه|من ألحان|لحّنه)\s*:?\s*([^،.\n]{3,60})/i,
    ],
  }
  for (const re of (pats[relation] || pats.author)) {
    const m = text.match(re)
    if (m?.[1]?.trim()) return m[1].trim().replace(/[،.؟!]/g, '').trim()
  }
  return null
}

// ─── بناء رد منسّق ────────────────────────────────────────────────────────────
function _buildResponse(result, originalQuery) {
  if (!result) return null

  const { entityName, relation, relationAr,
          authorName, authorDesc, authorExtract,
          personName, personDesc, personExtract,
          entityWikiUrl, personWikiUrl, source } = result

  const name    = authorName    || personName    || null
  const desc    = authorDesc    || personDesc    || ''
  const extract = authorExtract || personExtract || ''

  if (!name && !extract) return null

  const lines = []

  if (name) {
    lines.push(`## 📖 ${entityName}`)
    lines.push(``)
    lines.push(`> **${relationAr}:** **${name}**`)
    if (desc) lines.push(`> *${desc}*`)
    lines.push(``)
    if (extract) {
      lines.push(`### 👤 نبذة عن ${name}`)
      lines.push(extract.trim())
      lines.push(``)
    }
  } else if (extract) {
    lines.push(`## 📖 ${entityName}`)
    lines.push(``)
    lines.push(extract.trim())
    lines.push(``)
  }

  // مصادر
  const srcLines = []
  if (entityWikiUrl) srcLines.push(`| 📚 **Wikipedia — الكتاب/العمل** | [رابط](${entityWikiUrl}) |`)
  if (personWikiUrl && name) srcLines.push(`| 👤 **Wikipedia — ${name}** | [رابط](${personWikiUrl}) |`)

  if (srcLines.length) {
    lines.push(`---`)
    lines.push(``)
    lines.push(`| المصدر | الرابط |`)
    lines.push(`|--------|--------|`)
    lines.push(...srcLines)
    lines.push(``)
    lines.push(`> 📅 *معلومات مُسترجعة من Wikipedia/Wikidata — يونيو 2026*`)
  }

  return lines.join('\n')
}

// ─── Entry point رئيسي ────────────────────────────────────────────────────────
/**
 * يحلّ أسئلة الكيانات بشكل حي من Wikipedia + Wikidata
 * @returns { content, model, found } | null
 */
export async function resolveEntityQuery(q = '') {
  const detected = detectEntityAttributeQuery(q)
  if (!detected) return null

  const { entity, relation, relationAr } = detected
  console.log(`[WikiEntityLookup] 🔍 entity="${entity}" relation="${relation}"`)

  // تشغيل Wikipedia + Wikidata بالتوازي
  const [wikiArticle, wdResult] = await Promise.all([
    _searchWikiAR(entity).catch(() => null),
    _queryWikidata(entity, relation).catch(() => null),
  ])

  // ① Wikidata — البيانات الهيكلية (الأدق)
  if (wdResult?.personName) {
    console.log(`[WikiEntityLookup] ✅ Wikidata: "${entity}" → ${wdResult.personName}`)
    const content = _buildResponse(
      { ...wdResult, entityName: entity, relation, relationAr,
        authorName: wdResult.personName, authorDesc: wdResult.personDesc,
        authorExtract: wdResult.personExtract, personWikiUrl: wdResult.personWikiUrl },
      q
    )
    if (content) return { content, model: 'wiki-entity-wikidata', found: true }
  }

  // ② نص المقالة — استخراج المؤلف من الجملة الأولى
  if (wikiArticle?.extract) {
    const extracted = _extractFromText(wikiArticle.extract, relation)
    if (extracted) {
      console.log(`[WikiEntityLookup] ✅ Wikipedia text: "${entity}" → ${extracted}`)
      const content = _buildResponse(
        { entityName: entity, relation, relationAr,
          authorName: extracted, authorDesc: '', authorExtract: '',
          entityWikiUrl: wikiArticle.url, personWikiUrl: null },
        q
      )
      if (content) return { content, model: 'wiki-entity-text', found: true }
    }

    // ③ مقالة Wikipedia مباشرة (على الأقل نعرض محتواها)
    if (wikiArticle.extract.length > 80) {
      console.log(`[WikiEntityLookup] ℹ️ Wikipedia article only: "${wikiArticle.title}"`)
      const content = _buildResponse(
        { entityName: wikiArticle.title, relation, relationAr,
          authorName: null, authorDesc: '', authorExtract: wikiArticle.extract.slice(0, 600),
          entityWikiUrl: wikiArticle.url, personWikiUrl: null },
        q
      )
      if (content) return { content, model: 'wiki-entity-article', found: true }
    }
  }

  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// TEMPORAL QUERY SYSTEM — "متى استشهد X" / "متى وُلد X" / "متى حدثت معركة X"
// ══════════════════════════════════════════════════════════════════════════════

const _WD_DATE_PROPS = {
  death:     { id: 'P570', ar: 'تاريخ الوفاة / الاستشهاد' },
  birth:     { id: 'P569', ar: 'تاريخ الميلاد' },
  inception: { id: 'P571', ar: 'تاريخ التأسيس' },
  start:     { id: 'P580', ar: 'تاريخ البداية' },
  end:       { id: 'P582', ar: 'تاريخ النهاية' },
  point:     { id: 'P585', ar: 'تاريخ الحدث' },
}

export function detectTemporalQuery(q = '') {
  const t = q.trim()
  const hasWhen = /(?:متى|في\s+أي\s+(?:تاريخ|سنة|عام|يوم)|ما\s+(?:تاريخ|سنة|يوم|عام)|مِتى|when)/i.test(t)
  if (!hasWhen) return null

  let dateType = 'point'
  if (/(?:استشهد|اغتيل|أُعدم|عُدم|قُتل|توفي|وفاة|رحل|مات|انتهى\s+ب|سقط|ذُبح|نُفِّذ)/i.test(t)) dateType = 'death'
  else if (/(?:وُلد|ولادة|ميلاد|مولد)/i.test(t)) dateType = 'birth'
  else if (/(?:تأسس|تأسيس|أُسِّس|نشأ|أُنشئ|إنشاء)/i.test(t)) dateType = 'inception'
  else if (/(?:بدأت|انطلقت|بداية|انطلاق|شُنّت|اندلعت)/i.test(t)) dateType = 'start'
  else if (/(?:انتهت|نهاية|أُنجزت|اكتملت)/i.test(t)) dateType = 'end'

  const entity = t
    .replace(/^(?:متى|في\s+أي\s+(?:تاريخ|سنة|عام|يوم)|ما\s+(?:تاريخ|سنة|يوم|عام)|when)\s*/i, '')
    .replace(/(?:استشهد|اغتيل|أُعدم|عُدم|قُتل|توفي|وفاة|رحل|مات|وُلد|ولادة|ميلاد|مولد|تأسس|تأسيس|بدأت|انطلقت|اندلعت|انتهت|حدث|وقع|جرى|كان)\s*/gi, '')
    .replace(/[؟?!،,.]/g, '')
    .trim()

  if (!entity || entity.length < 2) return null
  return { entity, dateType, dateTypeAr: _WD_DATE_PROPS[dateType].ar }
}

function _formatWDDate(dateStr = '') {
  if (!dateStr) return null
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return dateStr.replace(/^\+/, '').replace(/T.*/, '')
  const [, y, mo, d] = m
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const month = months[parseInt(mo, 10) - 1] || mo
  if (d === '00') return `${month} ${y}`
  return `${parseInt(d, 10)} ${month} ${y}`
}

async function _fetchWDDate(entityName, dateType = 'death') {
  const prop = _WD_DATE_PROPS[dateType]?.id
  if (!prop) return null
  try {
    const sUrl = `https://www.wikidata.org/w/api.php?` + new URLSearchParams({
      action: 'wbsearchentities', search: entityName,
      language: 'ar', limit: '5', format: 'json', origin: '*',
    })
    const sRes  = await fetch(sUrl, { signal: AbortSignal.timeout(10000) })
    const sData = await sRes.json()
    const hits  = sData?.search || []
    if (!hits.length) return null

    for (const hit of hits.slice(0, 3)) {
      const eUrl = `https://www.wikidata.org/w/api.php?` + new URLSearchParams({
        action: 'wbgetentities', ids: hit.id,
        props: 'claims|labels|descriptions|sitelinks',
        languages: 'ar|en|fr', format: 'json', origin: '*',
      })
      const eRes  = await fetch(eUrl, { signal: AbortSignal.timeout(10000) })
      const eData = await eRes.json()
      const ent   = eData?.entities?.[hit.id]
      const claims = ent?.claims?.[prop] || []
      if (!claims.length) continue

      const raw = claims[0]?.mainsnak?.datavalue?.value?.time || ''
      const formatted = _formatWDDate(raw.replace(/^\+/, ''))
      if (!formatted) continue

      const nameAr = ent?.labels?.ar?.value || ent?.labels?.en?.value || entityName
      const descAr = ent?.descriptions?.ar?.value || ent?.descriptions?.en?.value || ''
      const wikiAR = ent?.sitelinks?.arwiki?.title || null

      let extract = ''
      if (wikiAR) {
        try {
          const wUrl = `https://ar.wikipedia.org/w/api.php?` + new URLSearchParams({
            action: 'query', prop: 'extracts',
            exintro: '1', explaintext: '1', exsentences: '4',
            titles: wikiAR, format: 'json', origin: '*',
          })
          const wRes  = await fetch(wUrl, { signal: AbortSignal.timeout(8000) })
          const wData = await wRes.json()
          const pages = Object.values(wData?.query?.pages || {})
          extract = pages[0]?.extract?.slice(0, 500) || ''
        } catch {}
      }

      return {
        name: nameAr, desc: descAr, date: formatted, extract,
        wikiUrl: wikiAR ? `https://ar.wikipedia.org/wiki/${encodeURIComponent(wikiAR)}` : `https://www.wikidata.org/wiki/${hit.id}`,
      }
    }
    return null
  } catch { return null }
}

async function _fetchWikiDateExtract(entityName) {
  try {
    const sUrl = `https://ar.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query', list: 'search', srsearch: entityName,
      srlimit: '3', format: 'json', origin: '*',
    })
    const sRes  = await fetch(sUrl, { signal: AbortSignal.timeout(10000) })
    const sData = await sRes.json()
    const hits  = sData?.query?.search || []
    if (!hits.length) return null
    const title = hits[0].title
    const eUrl = `https://ar.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'query', prop: 'extracts',
      exintro: '1', explaintext: '1', exsentences: '5',
      titles: title, format: 'json', origin: '*', redirects: '1',
    })
    const eRes  = await fetch(eUrl, { signal: AbortSignal.timeout(10000) })
    const eData = await eRes.json()
    const pages = Object.values(eData?.query?.pages || {})
    const page  = pages[0]
    if (!page || page.missing) return null
    return { title: page.title, extract: page.extract || '', url: `https://ar.wikipedia.org/wiki/${encodeURIComponent(page.title)}` }
  } catch { return null }
}

export async function resolveTemporalQuery(q = '') {
  const detected = detectTemporalQuery(q)
  if (!detected) return null
  const { entity, dateType, dateTypeAr } = detected
  console.log(`[WikiTemporalLookup] 🗓️ entity="${entity}" dateType="${dateType}"`)

  const [wdResult, wikiResult] = await Promise.all([
    _fetchWDDate(entity, dateType).catch(() => null),
    _fetchWikiDateExtract(entity).catch(() => null),
  ])

  if (wdResult?.date) {
    console.log(`[WikiTemporalLookup] ✅ Wikidata: "${entity}" → ${wdResult.date}`)
    const lines = [
      `## 📅 ${wdResult.name}`,
      ``,
      `> **${dateTypeAr}:** 🗓️ **${wdResult.date}**`,
    ]
    if (wdResult.desc) lines.push(`> *${wdResult.desc}*`)
    lines.push(``)
    if (wdResult.extract) {
      lines.push(`### 📖 نبذة`)
      lines.push(wdResult.extract.trim())
      lines.push(``)
    }
    lines.push(`---`)
    lines.push(`| المصدر | الرابط |`)
    lines.push(`|--------|--------|`)
    lines.push(`| 📚 **Wikipedia** | [${wdResult.name}](${wdResult.wikiUrl}) |`)
    lines.push(`| 🔗 **Wikidata** | [بيانات هيكلية](https://www.wikidata.org) |`)
    lines.push(``)
    lines.push(`> 📅 *معلومات من Wikidata — يونيو 2026*`)
    return { content: lines.join('\n'), model: 'wiki-temporal-wikidata', found: true }
  }

  if (wikiResult?.extract && wikiResult.extract.length > 50) {
    console.log(`[WikiTemporalLookup] ℹ️ Wikipedia fallback for "${entity}"`)
    const lines = [
      `## 📅 ${wikiResult.title}`,
      ``,
      wikiResult.extract.trim(),
      ``,
      `---`,
      `| المصدر | الرابط |`,
      `|--------|--------|`,
      `| 📚 **Wikipedia** | [${wikiResult.title}](${wikiResult.url}) |`,
    ]
    return { content: lines.join('\n'), model: 'wiki-temporal-article', found: true }
  }

  return null
}
