/**
 * DZ-GPT — DBpedia Semantic Knowledge Graph
 * مصدر المعرفة الدلالي للتحقق الثانوي
 *
 * APIs:
 *   1. DBpedia Lookup API  → البحث بالاسم
 *   2. DBpedia SPARQL      → استعلامات هيكلية
 *   3. DBpedia Spotlight   → ربط الكيانات
 */

const DBPEDIA_LOOKUP   = 'https://lookup.dbpedia.org/api/search'
const DBPEDIA_SPARQL   = 'https://dbpedia.org/sparql'
const DBPEDIA_SPOTLIGHT = 'https://api.dbpedia-spotlight.org/en/annotate'
const FETCH_TIMEOUT    = 8000

/**
 * lookupDBpedia — البحث عن كيان بالاسم
 *
 * @param {string} name - اسم الكيان
 * @param {number} maxResults - أقصى عدد نتائج
 * @returns {Promise<Array>} - قائمة الكيانات المطابقة
 */
export async function lookupDBpedia(name, maxResults = 5) {
  try {
    const params = new URLSearchParams({
      query: name,
      format: 'json',
      maxResults: String(maxResults),
    })
    const res = await fetch(`${DBPEDIA_LOOKUP}?${params}`, {
      headers: {
        'User-Agent': 'DZ-GPT/2.0 (+https://dz-gpt.vercel.app)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.docs || []).map(doc => ({
      uri: doc.resource?.[0] || '',
      label: doc.label?.[0] || '',
      description: doc.comment?.[0] || '',
      types: doc.type || [],
      score: parseFloat(doc.score?.[0] || '0'),
    })).filter(e => e.uri)
  } catch (err) {
    console.warn('[DBpedia] lookup error:', err.message)
    return []
  }
}

/**
 * queryDBpediaSPARQL — استعلام SPARQL لجلب معلومات هيكلية
 *
 * @param {string} resourceUri - URI الكيان من DBpedia
 * @returns {Promise<object|null>} - معلومات الكيان
 */
export async function queryDBpediaSPARQL(resourceUri) {
  if (!resourceUri) return null
  const sparql = `
    PREFIX dbo: <http://dbpedia.org/ontology/>
    PREFIX dbp: <http://dbpedia.org/property/>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>

    SELECT ?name ?abstract ?birthDate ?birthPlace ?nationality ?occupation ?team
    WHERE {
      <${resourceUri}> rdfs:label ?name .
      OPTIONAL { <${resourceUri}> dbo:abstract ?abstract . FILTER(LANG(?abstract) IN ('ar','en','fr')) }
      OPTIONAL { <${resourceUri}> dbo:birthDate ?birthDate }
      OPTIONAL { <${resourceUri}> dbo:birthPlace ?birthPlace }
      OPTIONAL { <${resourceUri}> dbo:nationality ?nationality }
      OPTIONAL { <${resourceUri}> dbo:occupation ?occupation }
      OPTIONAL { <${resourceUri}> dbo:team ?team }
      FILTER(LANG(?name) IN ('ar','en','fr'))
    }
    LIMIT 10
  `
  try {
    const params = new URLSearchParams({ query: sparql, format: 'application/sparql-results+json' })
    const res = await fetch(`${DBPEDIA_SPARQL}?${params}`, {
      headers: {
        'User-Agent': 'DZ-GPT/2.0 (+https://dz-gpt.vercel.app)',
        Accept: 'application/sparql-results+json',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!res.ok) return null
    const data = await res.json()
    const bindings = data.results?.bindings || []
    if (!bindings.length) return null

    const entity = { uri: resourceUri, labels: [], abstracts: [], properties: {} }
    for (const b of bindings) {
      if (b.name?.value) entity.labels.push(b.name.value)
      if (b.abstract?.value && b.abstract.value.length > 50) entity.abstracts.push(b.abstract.value)
      if (b.birthDate?.value) entity.properties.birthDate = b.birthDate.value
      if (b.birthPlace?.value) entity.properties.birthPlace = b.birthPlace.value
      if (b.nationality?.value) entity.properties.nationality = b.nationality.value
      if (b.occupation?.value) entity.properties.occupation = b.occupation.value
      if (b.team?.value) entity.properties.team = b.team.value
    }

    entity.labels = [...new Set(entity.labels)]
    entity.abstracts = [...new Set(entity.abstracts)]
    return entity
  } catch (err) {
    console.warn('[DBpedia] SPARQL error:', err.message)
    return null
  }
}

/**
 * verifyWithDBpedia — التحقق من معلومات كيان باستخدام DBpedia
 *
 * @param {string} name - اسم الشخصية أو الكيان
 * @returns {Promise<{found: boolean, data: object|null, confidence: number}>}
 */
export async function verifyWithDBpedia(name) {
  try {
    const entities = await lookupDBpedia(name, 3)
    if (!entities.length) return { found: false, data: null, confidence: 0 }

    const best = entities[0]
    const detail = await queryDBpediaSPARQL(best.uri)

    const arAbstract = detail?.abstracts?.find(a => /[\u0600-\u06FF]/.test(a))
    const enAbstract = detail?.abstracts?.[0]

    let confidence = 30
    if (best.score > 100) confidence += 20
    if (arAbstract) confidence += 25
    else if (enAbstract) confidence += 15
    if (detail?.properties?.birthDate) confidence += 10
    if (detail?.properties?.nationality) confidence += 5

    return {
      found: true,
      data: {
        uri: best.uri,
        label: best.label,
        description: best.description,
        abstract: arAbstract || enAbstract || best.description,
        properties: detail?.properties || {},
        allLabels: detail?.labels || [best.label],
        source: 'DBpedia',
      },
      confidence: Math.min(confidence, 90),
    }
  } catch (err) {
    console.warn('[DBpedia] verify error:', err.message)
    return { found: false, data: null, confidence: 0 }
  }
}

/**
 * searchDBpediaFreeText — البحث النصي في DBpedia
 */
export async function searchDBpediaFreeText(query, maxResults = 5) {
  try {
    const params = new URLSearchParams({ query, maxResults: String(maxResults), format: 'json' })
    const res = await fetch(`${DBPEDIA_LOOKUP}?${params}`, {
      headers: { 'User-Agent': 'DZ-GPT/2.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.docs || []).map(d => ({
      label: d.label?.[0] || '',
      description: d.comment?.[0] || '',
      uri: d.resource?.[0] || '',
      types: d.type || [],
    })).filter(d => d.label)
  } catch {
    return []
  }
}

/**
 * buildDBpediaContext — بناء سياق نصي لحقن في الـ prompt
 */
export function buildDBpediaContext(data) {
  if (!data?.data) return null

  let ctx = `### 🔗 DBpedia (تحقق دلالي):\n`
  ctx += `**الكيان:** ${data.data.label}\n`
  if (data.data.abstract) {
    ctx += `**وصف:** ${data.data.abstract.slice(0, 600)}\n`
  }
  if (data.data.properties) {
    const p = data.data.properties
    if (p.birthDate) ctx += `**تاريخ الميلاد:** ${p.birthDate}\n`
    if (p.birthPlace) ctx += `**مكان الميلاد:** ${p.birthPlace.split('/').pop()}\n`
    if (p.nationality) ctx += `**الجنسية:** ${p.nationality.split('/').pop()}\n`
    if (p.team) ctx += `**الفريق:** ${p.team.split('/').pop()}\n`
    if (p.occupation) ctx += `**المهنة:** ${p.occupation.split('/').pop()}\n`
  }
  ctx += `**المصدر:** [DBpedia](${data.data.uri})\n`
  ctx += `**نسبة الثقة:** ${data.confidence}%\n`
  return ctx
}
