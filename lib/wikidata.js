/**
 * lib/wikidata.js
 * Wikidata SPARQL & Entity API — أول مصدر في سلسلة التحقق
 *
 * يُستخدم كمصدر أولوية قصوى للتحقق من:
 * - الشخصيات العامة (رياضيون، سياسيون، فنانون)
 * - الأحداث التاريخية (تاريخ، مكان، مشاركون)
 * - الأندية والمنظمات والأماكن
 */

const WIKIDATA_TIMEOUT = 8000

// ─── SPARQL endpoint ─────────────────────────────────────────────────────────
const SPARQL_URL = 'https://query.wikidata.org/sparql'

// ─── Wikidata Entity API ──────────────────────────────────────────────────────
const WIKIDATA_SEARCH_URL = 'https://www.wikidata.org/w/api.php'

/**
 * البحث في Wikidata بالاسم — يُرجع كيان موثوق أو null
 */
export async function searchWikidata(query, lang = 'ar') {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKIDATA_TIMEOUT)
  try {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      search: query,
      language: lang,
      uselang: lang,
      type: 'item',
      limit: '5',
      format: 'json',
      origin: '*',
    })
    const res = await fetch(`${WIKIDATA_SEARCH_URL}?${params}`, { signal: ac.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    const results = data?.search || []
    if (!results.length) {
      // Fallback to English search
      if (lang !== 'en') return searchWikidata(query, 'en')
      return null
    }

    const top = results[0]
    return {
      id: top.id,
      label: top.label,
      description: top.description || '',
      url: `https://www.wikidata.org/wiki/${top.id}`,
      source: 'wikidata',
      confidence: _calcWikidataConfidence(top, query),
    }
  } catch (err) {
    clearTimeout(timer)
    if (err.name !== 'AbortError') console.warn('[Wikidata] search error:', err.message)
    return null
  }
}

/**
 * جلب تفاصيل كيان Wikidata بالـ ID (Q-number)
 */
export async function fetchWikidataEntity(entityId) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKIDATA_TIMEOUT)
  try {
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: entityId,
      languages: 'ar|en|fr',
      props: 'labels|descriptions|claims|sitelinks',
      format: 'json',
      origin: '*',
    })
    const res = await fetch(`${WIKIDATA_SEARCH_URL}?${params}`, { signal: ac.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    const entity = data?.entities?.[entityId]
    if (!entity) return null
    return _parseWikidataEntity(entity, entityId)
  } catch (err) {
    clearTimeout(timer)
    if (err.name !== 'AbortError') console.warn('[Wikidata] entity fetch error:', err.message)
    return null
  }
}

/**
 * SPARQL query لجلب معلومات تفصيلية عن شخص بالاسم
 * يُرجع: تاريخ الميلاد، الجنسية، المهنة، النادي/الفريق الحالي (للرياضيين)
 */
export async function queryPersonSPARQL(name, lang = 'ar') {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKIDATA_TIMEOUT)
  try {
    const encodedName = name.replace(/"/g, '\\"')
    const sparql = `
SELECT DISTINCT ?person ?personLabel ?birthDate ?nationalityLabel ?occupationLabel ?employerLabel ?sportLabel WHERE {
  ?person wikibase:label { bd:serviceParam wikibase:language "${lang},en,fr" }
  ?person rdfs:label ?label FILTER(CONTAINS(LCASE(?label), LCASE("${encodedName}")))
  OPTIONAL { ?person wdt:P569 ?birthDate }
  OPTIONAL { ?person wdt:P27 ?nationality . ?nationality wikibase:label { bd:serviceParam wikibase:language "${lang},en" } }
  OPTIONAL { ?person wdt:P106 ?occupation . ?occupation wikibase:label { bd:serviceParam wikibase:language "${lang},en" } }
  OPTIONAL { ?person wdt:P54 ?employer . ?employer wikibase:label { bd:serviceParam wikibase:language "${lang},en" } }
  OPTIONAL { ?person wdt:P641 ?sport . ?sport wikibase:label { bd:serviceParam wikibase:language "${lang},en" } }
} LIMIT 3`

    const res = await fetch(`${SPARQL_URL}?query=${encodeURIComponent(sparql)}&format=json`, {
      signal: ac.signal,
      headers: { 'Accept': 'application/sparql-results+json', 'User-Agent': 'DZAgent/1.0' },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    const bindings = data?.results?.bindings || []
    if (!bindings.length) return null

    const b = bindings[0]
    return {
      personLabel: b.personLabel?.value || name,
      birthDate: b.birthDate?.value || null,
      nationality: b.nationalityLabel?.value || null,
      occupation: b.occupationLabel?.value || null,
      currentTeam: b.employerLabel?.value || null,
      sport: b.sportLabel?.value || null,
      source: 'wikidata-sparql',
      confidence: 90,
    }
  } catch (err) {
    clearTimeout(timer)
    if (err.name !== 'AbortError') console.warn('[Wikidata SPARQL] error:', err.message)
    return null
  }
}

/**
 * التحقق من حدث تاريخي عبر Wikidata
 */
export async function verifyHistoricalEvent(eventName) {
  try {
    const result = await searchWikidata(eventName, 'ar')
    if (!result) return null

    const entity = await fetchWikidataEntity(result.id)
    if (!entity) return result

    return {
      ...result,
      ...entity,
      source: 'wikidata',
    }
  } catch (err) {
    console.warn('[Wikidata] historical event error:', err.message)
    return null
  }
}

/**
 * تطبيع أشكال الاسم البديلة (مثل: إبراهيم مازة / إبراهيم مازا)
 */
export function normalizeArabicName(name) {
  if (!name || typeof name !== 'string') return name
  return name
    .trim()
    // توحيد الهمزة
    .replace(/[إأآا]/g, 'ا')
    // توحيد التاء المربوطة/الهاء
    .replace(/[ةه]$/g, 'ة')
    // إزالة التشكيل
    .replace(/[\u064B-\u065F]/g, '')
    // توحيد الياء
    .replace(/[يى]/g, 'ي')
    .trim()
}

/**
 * إنشاء قائمة أشكال بديلة للاسم للبحث المتعدد
 */
export function generateNameVariants(name) {
  if (!name) return [name]
  const normalized = normalizeArabicName(name)
  const variants = new Set([name, normalized])

  // بديل التاء المربوطة/الألف المقصورة في نهاية الاسم
  variants.add(name.replace(/ة$/, 'ا'))
  variants.add(name.replace(/ا$/, 'ة'))
  variants.add(name.replace(/ي$/, 'ى'))
  variants.add(name.replace(/ى$/, 'ي'))

  // بديل الهمزات في البداية
  variants.add(name.replace(/^إ/, 'ا'))
  variants.add(name.replace(/^أ/, 'ا'))
  variants.add(name.replace(/^ا/, 'أ'))

  return [...variants].filter(v => v && v.length > 2)
}

/**
 * حساب درجة الثقة من نتيجة Wikidata
 */
function _calcWikidataConfidence(wikidataResult, query) {
  if (!wikidataResult) return 0
  const label = (wikidataResult.label || '').toLowerCase()
  const q = (query || '').toLowerCase()
  const normalizedLabel = normalizeArabicName(label)
  const normalizedQ = normalizeArabicName(q)

  if (normalizedLabel === normalizedQ) return 98
  if (label === q || label.includes(q) || q.includes(label)) return 92
  if (normalizedLabel.includes(normalizedQ) || normalizedQ.includes(normalizedLabel)) return 85
  if (wikidataResult.description && wikidataResult.description.length > 10) return 75
  return 65
}

/**
 * تحليل كيان Wikidata وتحويله إلى بنية موحدة
 */
function _parseWikidataEntity(entity, entityId) {
  const getLabel = (langs) => {
    for (const l of langs) {
      if (entity.labels?.[l]?.value) return entity.labels[l].value
    }
    return entityId
  }

  const getDesc = (langs) => {
    for (const l of langs) {
      if (entity.descriptions?.[l]?.value) return entity.descriptions[l].value
    }
    return ''
  }

  const getClaims = (prop) => {
    const claims = entity.claims?.[prop] || []
    return claims
      .filter(c => c.mainsnak?.snaktype === 'value')
      .map(c => c.mainsnak.datavalue?.value)
      .filter(Boolean)
  }

  const label = getLabel(['ar', 'fr', 'en'])
  const description = getDesc(['ar', 'fr', 'en'])

  // P569 = تاريخ الميلاد، P570 = تاريخ الوفاة، P27 = الجنسية، P106 = المهنة
  const birthDateValues = getClaims('P569')
  const birthDate = birthDateValues[0]?.time
    ? birthDateValues[0].time.replace(/^\+/, '').slice(0, 10)
    : null

  const wikipediaAr = entity.sitelinks?.arwiki?.title || null
  const wikipediaEn = entity.sitelinks?.enwiki?.title || null

  return {
    id: entityId,
    label,
    description,
    birthDate,
    wikipediaAr,
    wikipediaEn,
    wikiUrl: `https://www.wikidata.org/wiki/${entityId}`,
    arWikiUrl: wikipediaAr ? `https://ar.wikipedia.org/wiki/${encodeURIComponent(wikipediaAr)}` : null,
    enWikiUrl: wikipediaEn ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikipediaEn)}` : null,
    source: 'wikidata',
  }
}
