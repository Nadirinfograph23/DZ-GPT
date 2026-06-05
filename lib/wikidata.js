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
 * جلب حقائق هيكلية للشخص بالـ entity ID مع حل أسماء P19/P54/P27
 * يستخدم بعد searchWikidata — لا يحتاج SPARQL
 * يُرجع: birthDate, birthPlace, currentTeam, nationality
 */
export async function fetchWikidataEntityWithFacts(entityId) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKIDATA_TIMEOUT)
  try {
    // ── 1. جلب الـ entity الرئيسي ────────────────────────────────────────
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

    // ── 2. استخراج Q-IDs المرتبطة (P19/P54/P27) ─────────────────────────
    const _getQid = (prop) => {
      const claims = entity.claims?.[prop] || []
      for (const c of claims) {
        const qid = c.mainsnak?.datavalue?.value?.id
        if (qid) return qid
      }
      return null
    }
    const _getCurrentTeamQid = () => {
      const claims = entity.claims?.P54 || []
      // نأخذ أول نادٍ بدون تاريخ انتهاء (P582) — هو النادي الحالي
      for (const c of claims) {
        if (!c.qualifiers?.P582) {
          const qid = c.mainsnak?.datavalue?.value?.id
          if (qid) return qid
        }
      }
      // fallback: آخر نادٍ في القائمة
      const last = claims[claims.length - 1]
      return last?.mainsnak?.datavalue?.value?.id || null
    }

    const birthPlaceQid  = _getQid('P19')
    const currentTeamQid = _getCurrentTeamQid()
    const nationalityQid = _getQid('P27')
    const birthDateRaw   = entity.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time

    // ── 3. Batch resolve الـ Q-IDs للأسماء ──────────────────────────────
    const qidsToResolve = [birthPlaceQid, currentTeamQid, nationalityQid].filter(Boolean)
    const resolved = {}
    if (qidsToResolve.length > 0) {
      try {
        const ac2 = new AbortController()
        const t2 = setTimeout(() => ac2.abort(), WIKIDATA_TIMEOUT)
        const batchParams = new URLSearchParams({
          action: 'wbgetentities',
          ids: qidsToResolve.join('|'),
          languages: 'ar|en|fr',
          props: 'labels',
          format: 'json',
          origin: '*',
        })
        const batchRes = await fetch(`${WIKIDATA_SEARCH_URL}?${batchParams}`, { signal: ac2.signal })
        clearTimeout(t2)
        if (batchRes.ok) {
          const batchData = await batchRes.json()
          for (const qid of qidsToResolve) {
            const e = batchData?.entities?.[qid]
            if (!e) continue
            for (const lang of ['ar', 'fr', 'en']) {
              if (e.labels?.[lang]?.value) { resolved[qid] = e.labels[lang].value; break }
            }
          }
        }
      } catch { /* تجاهل أخطاء الـ batch */ }
    }

    return {
      id: entityId,
      birthDate: birthDateRaw ? birthDateRaw.replace(/^\+/, '').slice(0, 10) : null,
      birthPlace: birthPlaceQid ? (resolved[birthPlaceQid] || null) : null,
      currentTeam: currentTeamQid ? (resolved[currentTeamQid] || null) : null,
      nationality: nationalityQid ? (resolved[nationalityQid] || null) : null,
      wikipediaAr: entity.sitelinks?.arwiki?.title || null,
      wikipediaEn: entity.sitelinks?.enwiki?.title || null,
      source: 'wikidata-entity-facts',
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[Wikidata] entityWithFacts error:', err.message)
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
SELECT DISTINCT ?person ?personLabel ?birthDate ?birthPlaceLabel ?nationalityLabel ?occupationLabel ?employerLabel ?sportLabel WHERE {
  ?person wikibase:label { bd:serviceParam wikibase:language "${lang},en,fr" }
  ?person rdfs:label ?label FILTER(CONTAINS(LCASE(?label), LCASE("${encodedName}")))
  OPTIONAL { ?person wdt:P569 ?birthDate }
  OPTIONAL { ?person wdt:P19 ?birthPlace . ?birthPlace wikibase:label { bd:serviceParam wikibase:language "${lang},en" } }
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
      birthPlace: b.birthPlaceLabel?.value || null,
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

  // ── تواريخ ──────────────────────────────────────────────────────────────
  // P569 = تاريخ الميلاد
  const birthDateValues = getClaims('P569')
  const birthDate = birthDateValues[0]?.time
    ? birthDateValues[0].time.replace(/^\+/, '').slice(0, 10)
    : null

  // ── مكان الميلاد P19 ─────────────────────────────────────────────────
  const birthPlaceClaims = getClaims('P19')
  let birthPlace = null
  if (birthPlaceClaims.length > 0) {
    const bpId = birthPlaceClaims[0]?.id || birthPlaceClaims[0]
    if (typeof bpId === 'string' && bpId.startsWith('Q')) {
      // يجب جلب الاسم من الـ entity المرتبط — نُرجع الـ ID مؤقتاً ويُحلّ لاحقاً
      birthPlace = `wikidata:${bpId}`
    } else if (birthPlaceClaims[0]?.['entity-type']) {
      birthPlace = `wikidata:${birthPlaceClaims[0].id}`
    }
  }
  // استخراج مباشر من labels إن كانت مُدرجة في entity
  const birthPlaceLabel = (() => {
    const claims = entity.claims?.P19 || []
    for (const c of claims) {
      const qid = c.mainsnak?.datavalue?.value?.id
      if (!qid) continue
      // محاولة الحصول على الاسم من entity المُحمّل
      const linked = entity.entities?.[qid]
      if (linked) {
        for (const l of ['ar', 'fr', 'en']) {
          if (linked.labels?.[l]?.value) return linked.labels[l].value
        }
      }
    }
    return null
  })()
  if (birthPlaceLabel) birthPlace = birthPlaceLabel

  // ── النادي/الفريق الحالي P54 ─────────────────────────────────────────
  const teamClaims = entity.claims?.P54 || []
  let currentTeam = null
  for (const c of teamClaims) {
    // نأخذ فقط العضوية الحالية (بدون تاريخ انتهاء)
    const endTime = c.qualifiers?.P582
    if (!endTime) {
      const teamQid = c.mainsnak?.datavalue?.value?.id
      if (teamQid) {
        // نُرجع ID للحل لاحقاً أو نجد الاسم في entity
        currentTeam = `wikidata:${teamQid}`
        break
      }
    }
  }

  // ── الجنسية P27 ──────────────────────────────────────────────────────
  const nationalityClaims = getClaims('P27')
  let nationality = null
  if (nationalityClaims.length > 0) {
    const natId = nationalityClaims[0]?.id || nationalityClaims[0]
    if (typeof natId === 'string' && natId.startsWith('Q')) {
      nationality = `wikidata:${natId}`
    }
  }

  const wikipediaAr = entity.sitelinks?.arwiki?.title || null
  const wikipediaEn = entity.sitelinks?.enwiki?.title || null
  const wikipediaFr = entity.sitelinks?.frwiki?.title || null
  const labelEn     = entity.labels?.en?.value || null
  const labelFr     = entity.labels?.fr?.value || null

  return {
    id: entityId,
    label,
    description,
    birthDate,
    birthPlace,
    currentTeam,
    nationality,
    wikipediaAr,
    wikipediaEn,
    wikipediaFr,
    labelEn,
    labelFr,
    wikiUrl: `https://www.wikidata.org/wiki/${entityId}`,
    arWikiUrl: wikipediaAr ? `https://ar.wikipedia.org/wiki/${encodeURIComponent(wikipediaAr)}` : null,
    enWikiUrl: wikipediaEn ? `https://en.wikipedia.org/wiki/${encodeURIComponent(wikipediaEn)}` : null,
    frWikiUrl: wikipediaFr ? `https://fr.wikipedia.org/wiki/${encodeURIComponent(wikipediaFr)}` : null,
    source: 'wikidata',
  }
}

/**
 * resolveWikipediaLinks — يُرجع روابط Wikipedia الثلاثة (ar/en/fr) من معرّف Wikidata
 */
export async function resolveWikipediaLinks(wikidataId) {
  if (!wikidataId) return {}
  const entity = await fetchWikidataEntity(wikidataId).catch(() => null)
  if (!entity) return {}
  return {
    ar: entity.wikipediaAr || null,
    en: entity.wikipediaEn || null,
    fr: entity.wikipediaFr || null,
    labelEn: entity.labelEn || null,
    labelFr: entity.labelFr || null,
  }
}
