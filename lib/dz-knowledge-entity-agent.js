/**
 * lib/dz-knowledge-entity-agent.js
 * ════════════════════════════════════════════════════════════════════════════
 * DZ Knowledge Entity Agent — نظام التعرف على الكيانات والمعرفة
 *
 * المهمة الوحيدة: التعريف والكشف عن الكيانات (WHO / WHAT)
 * المصادر: Wikidata → Wikipedia → DBpedia (بهذا الترتيب)
 * يمنع: هلوسة LLM — LLM للتلخيص والتنسيق فقط وليس كمصدر حقائق
 *
 * قواعد الفصل الصارمة:
 *   WHO / WHAT    → Knowledge Entity Agent (هذا الملف)
 *   WHERE (خريطة) → Maps Agent
 *   آخر أحداث    → Search Agent
 *   خدمات/مقدمون  → Service Agent
 * ════════════════════════════════════════════════════════════════════════════
 */

const AGENT_TIMEOUT = 12000
const CACHE_TTL_MS  = 30 * 60 * 1000   // 30 دقيقة
const MIN_CONFIDENCE = 0.85             // عتبة الثقة الدنيا

// ══════════════════════════════════════════════════════════════════════════
// § 1 — INTENT CLASSIFIER — تصنيف نوع الطلب قبل أي معالجة
// ══════════════════════════════════════════════════════════════════════════

export const ENTITY_INTENT = {
  KNOWLEDGE_QUERY: 'KNOWLEDGE_QUERY',   // من هو / ما هو / عرفني بـ
  LIVE_SEARCH:     'LIVE_SEARCH',       // آخر أخبار / ماذا حدث / تصريح
  MAPS_SEARCH:     'MAPS_SEARCH',       // أين يوجد / أقرب / بالقرب مني
  SERVICE_QUERY:   'SERVICE_QUERY',     // أريد طبيب / أبحث عن محامي
  UNRELATED:       'UNRELATED',         // لا يخص هذا الوكيل
}

// أنماط تحديد Knowledge Query (WHO / WHAT)
const KNOWLEDGE_TRIGGERS = [
  /^من\s+هو\b/i,
  /^من\s+هي\b/i,
  /^شكون\s+هو\b/i,
  /^شكون\s+هي\b/i,
  /^ما\s+هو\b/i,
  /^ما\s+هي\b/i,
  /^ما\s+هي\s+(?:دولة|ولاية|مدينة|بلدية|منطقة)\b/i,
  /(?:عرّفني|عرّف\s+لي|أخبرني)\s+(?:بـ|عن|ب)\b/i,
  /(?:معلومات|معلومة|نبذة|سيرة|تاريخ|ترجمة)\s+(?:عن|حول)\b/i,
  /(?:من\s+كتب|من\s+ألّف|من\s+أخرج|من\s+لحّن)\b/i,
  /(?:مؤلف|كاتب|صاحب|مخرج|ملحن)\s+(?:كتاب|رواية|فيلم|أغنية)\b/i,
  /(?:رئيس|وزير|ملك|أمير|حاكم)\s+(?:دولة|جمهورية|مملكة|\w+)\b/i,
  /(?:الرئيس|الوزير)\s+(?:الحالي|الأول|العام)\b/i,
  /هل\s+تعرف\b/i,
  /^(?:اشرح|فسّر|وضّح|عرّف)\b/i,
  /(?:من\s+هو\s+)?(?:الرئيس|رئيس)\s+(?:الأمريكي|الفرنسي|المصري|الجزائري|الإيراني|التركي|الروسي|الصيني|البريطاني)/i,
  /(?:متى|تاريخ)\s+(?:وُلد|وفاة|استشهد|تأسس|بُني|اكتُشف)\b/i,
  /(?:ما\s+هي\s+)?(?:عاصمة|لغة|مساحة|عدد\s+سكان|عملة)\s+/i,
]

// أنماط تدل على Live Search — يجب إعادة التوجيه لـ Search Agent
const LIVE_SEARCH_TRIGGERS = [
  /(?:آخر|أحدث|أخير)\s+(?:أخبار|خبر|تصريح|تصريحات|لقاء|زيارة|اجتماع)/i,
  /(?:اليوم|البارح|الأمس|الآن|حالياً|درك|هذا\s+النهار)\s+(?:أخبار|ماذا|في|صرا)/i,
  /(?:ماذا\s+حدث|وش\s+صار|واش\s+صار|شنو\s+صار)/i,
  /(?:آخر\s+لقاء|آخر\s+اجتماع|آخر\s+زيارة|أين\s+التقى)\b/i,
  /(?:تصريح|تصريحات|خطاب)\s+(?:اليوم|الأخير|الجديد)/i,
  /(?:breaking|عاجل|عاجل:)/i,
]

// أنماط تدل على Maps/Local — يجب إعادة التوجيه لـ Maps Agent
const MAPS_SEARCH_TRIGGERS = [
  /(?:أقرب|أبحث\s+عن)\s+(?:مستشفى|صيدلية|مطعم|فندق|مدرسة|بنك|ميكانيكي|محامي|طبيب)\b/i,
  /(?:بالقرب\s+مني|قريب\s+مني|في\s+حيّي|في\s+منطقتي)\b/i,
  /(?:أين\s+يوجد|وين\s+كاين|فين\s+كاين)\s+(?:مستشفى|صيدلية|محل|دكتور|طبيب)\b/i,
  /(?:موقع|عنوان|كيف\s+أصل\s+إلى|طريق\s+إلى)\s+(?:مستشفى|صيدلية|محل)\b/i,
]

// أنماط تدل على Service Query — يجب إعادة التوجيه لـ Service Agent
const SERVICE_SEARCH_TRIGGERS = [
  /(?:أريد|أبحث\s+عن)\s+(?:طبيب|دكتور|محامي|ميكانيكي|مهندس|معلم|أستاذ|كهربائي|سباك)\b/i,
  /(?:من\s+يمكنه|من\s+يساعدني|من\s+يقدر)\s+(?:على|في)\b/i,
  /(?:خدمة|خدمات|مزود|مقدم\s+خدمة)\b/i,
]

/**
 * classifyIntent — يصنّف نية المستخدم ويوجّه للوكيل المناسب
 * @param {string} query
 * @returns {{ intent: string, confidence: number, shouldHandle: boolean, redirectReason?: string }}
 */
export function classifyEntityIntent(query = '') {
  const q = query.trim()
  if (!q || q.length < 3) return { intent: ENTITY_INTENT.UNRELATED, confidence: 0, shouldHandle: false }

  // فحص الأنماط المانعة أولاً (أولوية قصوى)
  for (const re of LIVE_SEARCH_TRIGGERS) {
    if (re.test(q)) return {
      intent: ENTITY_INTENT.LIVE_SEARCH,
      confidence: 0.95,
      shouldHandle: false,
      redirectReason: 'هذا سؤال عن أحداث حية — يُعاد التوجيه لـ Search Agent',
      redirectTo: 'DZ_SEARCH_AGENT',
    }
  }
  for (const re of MAPS_SEARCH_TRIGGERS) {
    if (re.test(q)) return {
      intent: ENTITY_INTENT.MAPS_SEARCH,
      confidence: 0.95,
      shouldHandle: false,
      redirectReason: 'هذا طلب خريطة أو خدمة محلية — يُعاد التوجيه لـ Maps Agent',
      redirectTo: 'DZ_MAPS_AGENT',
    }
  }
  for (const re of SERVICE_SEARCH_TRIGGERS) {
    if (re.test(q)) return {
      intent: ENTITY_INTENT.SERVICE_QUERY,
      confidence: 0.90,
      shouldHandle: false,
      redirectReason: 'هذا طلب مزود خدمة — يُعاد التوجيه لـ Service Agent',
      redirectTo: 'DZ_SERVICE_AGENT',
    }
  }

  // فحص أنماط Knowledge Query
  for (const re of KNOWLEDGE_TRIGGERS) {
    if (re.test(q)) return {
      intent: ENTITY_INTENT.KNOWLEDGE_QUERY,
      confidence: 0.90,
      shouldHandle: true,
    }
  }

  return { intent: ENTITY_INTENT.UNRELATED, confidence: 0, shouldHandle: false }
}

// ══════════════════════════════════════════════════════════════════════════
// § 2 — ENTITY RECOGNITION (NER) — استخراج الكيان من السؤال
// ══════════════════════════════════════════════════════════════════════════

export const ENTITY_TYPE = {
  PERSON:      'PERSON',      // شخصية
  GEOGRAPHIC:  'GEOGRAPHIC',  // كيان جغرافي
  WORK:        'WORK',        // عمل فكري (كتاب/فيلم/أغنية)
  ORG:         'ORG',         // منظمة / مؤسسة
  EVENT:       'EVENT',       // حدث تاريخي
  UNKNOWN:     'UNKNOWN',
}

const PERSON_ROLE_MAP = {
  'رئيس':   ['P6', 'P35'],      // head of government / head of state
  'وزير':   ['P39'],
  'ملك':    ['P35'],
  'أمير':   ['P35'],
  'مؤلف':   ['P50'],
  'كاتب':   ['P50'],
  'مخرج':   ['P57'],
  'ملحن':   ['P86'],
  'رياضي':  ['P54'],
  'لاعب':   ['P54'],
}

// أنماط استخراج الكيان + نوعه
const ENTITY_EXTRACTION_PATTERNS = [
  // شخص: "من هو [اسم]"
  { re: /^(?:من\s+هو|من\s+هي|شكون\s+هو|شكون\s+هي)\s+(.{2,60}?)(?:\s*[؟?])?$/, type: ENTITY_TYPE.PERSON },
  // رئيس دولة: "الرئيس الأمريكي الحالي"
  { re: /(?:رئيس|وزير|ملك|أمير)\s+(?:دولة\s+)?([A-Za-z\u0600-\u06FF\s]{2,30})(?:\s+الحالي)?/, type: ENTITY_TYPE.PERSON, role: true },
  // كيان جغرافي: "ما هي ولاية X" / "ما هي دولة X" / "ما هي مدينة X"
  { re: /(?:ما\s+هي|ما\s+هو)\s+(?:ولاية|مدينة|بلدية|دولة|منطقة|بلدة|دائرة)\s+(.{2,50}?)(?:\s*[؟?])?$/, type: ENTITY_TYPE.GEOGRAPHIC },
  { re: /(?:عرّفني|معلومات)\s+(?:عن|بـ|حول)\s+(?:ولاية|مدينة|بلدية|دولة|منطقة)\s+(.{2,50}?)(?:\s*[؟?])?$/, type: ENTITY_TYPE.GEOGRAPHIC },
  // عمل فكري: "من كتب / من ألّف [عمل]"
  { re: /(?:من\s+كتب|من\s+ألّف|مؤلف|كاتب)\s+(?:كتاب|رواية|قصة|ديوان|مسرحية)?\s+(.{2,60}?)(?:\s*[؟?])?$/, type: ENTITY_TYPE.WORK },
  { re: /(?:من\s+أخرج|مخرج)\s+(?:فيلم|مسلسل)?\s+(.{2,60}?)(?:\s*[؟?])?$/, type: ENTITY_TYPE.WORK },
  // عام: "معلومات عن [كيان]"
  { re: /(?:معلومات|نبذة|سيرة|تاريخ)\s+(?:عن|حول|بـ)\s+(.{2,70}?)(?:\s*[؟?])?$/, type: ENTITY_TYPE.UNKNOWN },
  { re: /(?:عرّفني|أخبرني)\s+(?:بـ|عن|حول)\s+(.{2,70}?)(?:\s*[؟?])?$/, type: ENTITY_TYPE.UNKNOWN },
  // اسم مباشر (آخر محاولة)
  { re: /^(.{3,60}?)\s+(?:من\s+هو|هو\s+من|هي\s+من|من\s+هي)\s*[؟?]?$/, type: ENTITY_TYPE.PERSON },
]

/**
 * extractEntity — يستخرج الكيان من السؤال ويحدد نوعه
 * @param {string} query
 * @returns {{ entity: string, type: string, role?: string } | null}
 */
export function extractEntity(query = '') {
  const q = query.trim().replace(/\s+/g, ' ')

  for (const { re, type } of ENTITY_EXTRACTION_PATTERNS) {
    const m = q.match(re)
    if (m?.[1]) {
      const entity = m[1].trim()
        .replace(/[؟?!،,\.]/g, '')
        .replace(/^(هو|هي|ال)\s+/i, '')
        .trim()
      if (entity.length >= 2) return { entity, type }
    }
  }

  // استخراج احتياطي: احذف أداة السؤال من البداية وخذ ما تبقى
  const fallback = q
    .replace(/^(?:من\s+هو|من\s+هي|ما\s+هو|ما\s+هي|شكون\s+هو|شكون\s+هي|عرّفني\s+بـ|معلومات\s+عن|نبذة\s+عن|تاريخ)\s*/i, '')
    .replace(/[؟?!]/g, '')
    .trim()
  if (fallback.length >= 2 && fallback.length <= 80) {
    return { entity: fallback, type: ENTITY_TYPE.UNKNOWN }
  }

  return null
}

// ══════════════════════════════════════════════════════════════════════════
// § 3 — KNOWLEDGE RETRIEVAL PIPELINE
// المصادر بالأولوية: Wikidata → Wikipedia → DBpedia
// ══════════════════════════════════════════════════════════════════════════

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'
const WIKIPEDIA_AR = 'https://ar.wikipedia.org/w/api.php'
const WIKIPEDIA_EN = 'https://en.wikipedia.org/w/api.php'
const DBPEDIA_LOOKUP = 'https://lookup.dbpedia.org/api/search'

// ──────────────────────────────────────────────────────────────────────────
// 3a. Wikidata Search + Entity Fetch
// ──────────────────────────────────────────────────────────────────────────
async function _fetchWikidataEntity(entityName) {
  try {
    const searchUrl = `${WIKIDATA_API}?` + new URLSearchParams({
      action: 'wbsearchentities', search: entityName,
      language: 'ar', uselang: 'ar', type: 'item',
      limit: '5', format: 'json', origin: '*',
    })
    const sRes = await fetch(searchUrl, { signal: AbortSignal.timeout(AGENT_TIMEOUT) })
    if (!sRes.ok) return null
    const sData = await sRes.json()
    const hits = sData?.search || []
    if (!hits.length) {
      // fallback English
      const enUrl = `${WIKIDATA_API}?` + new URLSearchParams({
        action: 'wbsearchentities', search: entityName,
        language: 'en', uselang: 'ar', type: 'item',
        limit: '5', format: 'json', origin: '*',
      })
      const enRes = await fetch(enUrl, { signal: AbortSignal.timeout(AGENT_TIMEOUT) })
      if (!enRes.ok) return null
      const enData = await enRes.json()
      hits.push(...(enData?.search || []))
    }
    if (!hits.length) return null

    for (const hit of hits.slice(0, 3)) {
      const eUrl = `${WIKIDATA_API}?` + new URLSearchParams({
        action: 'wbgetentities', ids: hit.id,
        languages: 'ar|fr|en',
        props: 'labels|descriptions|claims|sitelinks',
        format: 'json', origin: '*',
      })
      const eRes = await fetch(eUrl, { signal: AbortSignal.timeout(AGENT_TIMEOUT) })
      if (!eRes.ok) continue
      const eData = await eRes.json()
      const ent = eData?.entities?.[hit.id]
      if (!ent) continue

      const label = ent.labels?.ar?.value || ent.labels?.fr?.value || ent.labels?.en?.value || hit.label
      const desc  = ent.descriptions?.ar?.value || ent.descriptions?.en?.value || hit.description || ''

      // استخراج بيانات هيكلية مفيدة
      const claims = ent.claims || {}
      const structured = _extractStructuredClaims(claims)

      // رابط Wikipedia
      const arWiki = ent.sitelinks?.arwiki?.title
      const frWiki = ent.sitelinks?.frwiki?.title
      const enWiki = ent.sitelinks?.enwiki?.title
      const wikiTitle = arWiki || frWiki || enWiki
      const wikiLang  = arWiki ? 'ar' : frWiki ? 'fr' : enWiki ? 'en' : null

      return {
        id: hit.id,
        label, desc, structured,
        wikiTitle, wikiLang,
        wikiUrl: wikiTitle ? `https://ar.wikipedia.org/wiki/${encodeURIComponent(arWiki || wikiTitle)}` : null,
        wikidataUrl: `https://www.wikidata.org/wiki/${hit.id}`,
        source: 'wikidata',
        confidence: _calcConfidence(label, entityName, desc),
      }
    }
    return null
  } catch { return null }
}

// استخراج بيانات مفيدة من claims بدون SPARQL
function _extractStructuredClaims(claims = {}) {
  const PROPS = {
    P569: 'تاريخ الميلاد',
    P570: 'تاريخ الوفاة / الاستشهاد',
    P19:  'مكان الميلاد',
    P27:  'الجنسية',
    P39:  'المنصب',
    P54:  'الفريق / النادي',
    P106: 'المهنة / الوظيفة',
    P131: 'يقع في',
    P17:  'الدولة',
    P856: 'الموقع الرسمي',
    P571: 'تاريخ التأسيس',
    P576: 'تاريخ الحل / الانتهاء',
    P580: 'بداية الفترة',
    P582: 'نهاية الفترة',
  }
  const result = {}
  for (const [prop, label] of Object.entries(PROPS)) {
    const claim = claims[prop]?.[0]?.mainsnak
    if (!claim) continue
    const dv = claim.datavalue
    if (!dv) continue
    if (dv.type === 'time') {
      const raw = dv.value?.time || ''
      result[label] = _formatDate(raw.replace(/^\+/, ''))
    } else if (dv.type === 'string') {
      result[label] = dv.value
    } else if (dv.type === 'wikibase-entityid') {
      // نحتاج lookup إضافي — نتجاهل لتوفير الوقت
    }
  }
  return result
}

function _formatDate(dateStr = '') {
  if (!dateStr) return null
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return dateStr.slice(0, 10)
  const [, y, mo, d] = m
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو',
                  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const month = months[parseInt(mo, 10) - 1] || mo
  if (d === '00' || d === '01' && mo === '01') return y
  if (d === '00') return `${month} ${y}`
  return `${parseInt(d, 10)} ${month} ${y}`
}

function _calcConfidence(label = '', query = '', desc = '') {
  if (!label) return 0
  const normalize = s => s.replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').toLowerCase().trim()
  const nl = normalize(label)
  const nq = normalize(query)
  if (nl === nq) return 1.0
  if (nl.includes(nq) || nq.includes(nl)) return 0.92
  const words = nq.split(' ').filter(w => w.length > 2)
  const matched = words.filter(w => nl.includes(w)).length
  const ratio = words.length ? matched / words.length : 0
  return Math.min(0.5 + ratio * 0.4 + (desc ? 0.05 : 0), 1.0)
}

// ──────────────────────────────────────────────────────────────────────────
// 3b. Wikipedia Extract Fetch
// ──────────────────────────────────────────────────────────────────────────
async function _fetchWikipediaExtract(title, lang = 'ar') {
  try {
    const base = lang === 'ar' ? WIKIPEDIA_AR : WIKIPEDIA_EN
    const url = `${base}?` + new URLSearchParams({
      action: 'query', prop: 'extracts|description|pageprops',
      exintro: '1', explaintext: '1', exsentences: '8',
      titles: title, format: 'json', origin: '*', redirects: '1',
    })
    const res = await fetch(url, { signal: AbortSignal.timeout(AGENT_TIMEOUT) })
    if (!res.ok) return null
    const data = await res.json()
    const pages = Object.values(data?.query?.pages || {})
    const page = pages[0]
    if (!page || page.missing || !page.extract) return null
    return {
      title: page.title,
      extract: page.extract.trim(),
      description: page.description || '',
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      lang,
    }
  } catch { return null }
}

// ──────────────────────────────────────────────────────────────────────────
// 3c. DBpedia Lookup (مصدر ثالث للتحقق الإضافي)
// ──────────────────────────────────────────────────────────────────────────
async function _fetchDBpedia(entityName) {
  try {
    const url = `${DBPEDIA_LOOKUP}?` + new URLSearchParams({
      query: entityName, maxResults: '3', format: 'json',
    })
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const data = await res.json()
    const docs = data?.docs || []
    if (!docs.length) return null
    const top = docs[0]
    return {
      label:   top.label?.[0] || entityName,
      comment: top.comment?.[0] || '',
      types:   top.type || [],
      url:     top.resource?.[0] || null,
      source:  'dbpedia',
    }
  } catch { return null }
}

// ══════════════════════════════════════════════════════════════════════════
// § 4 — IN-MEMORY CACHE LAYER (تقليل API Calls + تسريع الرد)
// ══════════════════════════════════════════════════════════════════════════

const _CACHE = new Map()

function _cacheKey(entity) {
  return entity.replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي')
               .replace(/\s+/g,' ').toLowerCase().trim()
}

function _cacheGet(entity) {
  const k = _cacheKey(entity)
  const entry = _CACHE.get(k)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _CACHE.delete(k); return null }
  return entry.data
}

function _cacheSet(entity, data) {
  if (_CACHE.size > 500) {
    const oldest = [..._CACHE.entries()].sort((a,b) => a[1].ts - b[1].ts).slice(0, 50)
    oldest.forEach(([k]) => _CACHE.delete(k))
  }
  _CACHE.set(_cacheKey(entity), { data, ts: Date.now() })
}

export function getCacheStats() {
  return { size: _CACHE.size, maxTTL: CACHE_TTL_MS / 60000 + ' min' }
}

// ══════════════════════════════════════════════════════════════════════════
// § 5 — RESPONSE FORMATTER — تنسيق الإجابة بقالب موحد
// ══════════════════════════════════════════════════════════════════════════

function _buildEntityResponse({ entity, entityType, wikidataResult, wikiExtract, dbpediaResult, confidence }) {
  const lines = []
  const name = wikidataResult?.label || wikiExtract?.title || entity
  const desc = wikidataResult?.desc || wikiExtract?.description || dbpediaResult?.comment || ''

  // العنوان
  const icon = entityType === ENTITY_TYPE.GEOGRAPHIC ? '🗺️'
             : entityType === ENTITY_TYPE.WORK       ? '📖'
             : '👤'
  lines.push(`## ${icon} ${name}`)
  lines.push('')

  // الوصف المختصر
  if (desc) lines.push(`> *${desc}*`, '')

  // البيانات الهيكلية من Wikidata
  const structured = wikidataResult?.structured || {}
  const structuredEntries = Object.entries(structured).filter(([,v]) => v)
  if (structuredEntries.length) {
    lines.push('### 📋 معلومات أساسية')
    lines.push('')
    lines.push('| الخاصية | القيمة |')
    lines.push('|---------|--------|')
    for (const [k, v] of structuredEntries) {
      lines.push(`| **${k}** | ${v} |`)
    }
    lines.push('')
  }

  // النبذة من Wikipedia
  if (wikiExtract?.extract && wikiExtract.extract.length > 30) {
    lines.push('### 📖 نبذة')
    lines.push('')
    const text = wikiExtract.extract.slice(0, 800).trim()
    lines.push(text)
    lines.push('')
  } else if (dbpediaResult?.comment && !wikiExtract) {
    lines.push('### 📖 نبذة')
    lines.push('')
    lines.push(dbpediaResult.comment.slice(0, 500))
    lines.push('')
  }

  // درجة الثقة والمصادر
  lines.push('---')
  lines.push('')
  lines.push('| المصدر | الرابط | الثقة |')
  lines.push('|--------|--------|--------|')

  const pct = Math.round((confidence || 0.85) * 100)

  if (wikiExtract?.url) {
    lines.push(`| 📚 **Wikipedia** | [${wikiExtract.title}](${wikiExtract.url}) | ${pct}% |`)
  }
  if (wikidataResult?.wikidataUrl) {
    lines.push(`| 🔗 **Wikidata** | [${wikidataResult.id}](${wikidataResult.wikidataUrl}) | ${pct}% |`)
  }
  if (dbpediaResult?.url) {
    lines.push(`| 🌐 **DBpedia** | [رابط](${dbpediaResult.url}) | — |`)
  }

  lines.push('')
  lines.push(`> 🔍 *استُرجعت هذه المعلومات من مصادر معرفية موثوقة — يونيو 2026*`)
  lines.push(`> ⚠️ *LLM يُستخدم للتلخيص والتنسيق فقط — المصادر أعلاه هي الحقيقة المرجعية*`)

  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════════
// § 6 — MAIN ENTRY POINT
// resolveKnowledgeEntity — يستقبل سؤال ويُرجع إجابة موثوقة أو null
// ══════════════════════════════════════════════════════════════════════════

/**
 * resolveKnowledgeEntity
 * @param {string} query — سؤال المستخدم (عربي/فرنسي/إنجليزي)
 * @returns {Promise<{ content, model, found, confidence, intent, redirectTo? } | null>}
 */
export async function resolveKnowledgeEntity(query = '') {
  const q = query.trim()
  if (!q || q.length < 3) return null

  // ① تصنيف النية — Guard صارم
  const classification = classifyEntityIntent(q)
  if (!classification.shouldHandle) {
    // ليس من اختصاص هذا الوكيل
    return {
      content: null,
      model: 'knowledge-entity-redirect',
      found: false,
      confidence: 0,
      intent: classification.intent,
      redirectTo: classification.redirectTo,
      redirectReason: classification.redirectReason,
    }
  }

  // ② استخراج الكيان
  const entityResult = extractEntity(q)
  if (!entityResult) return null

  const { entity, type: entityType } = entityResult
  console.log(`[KnowledgeEntity] 🔍 entity="${entity}" type="${entityType}"`)

  // ③ فحص الكاش
  const cached = _cacheGet(entity)
  if (cached) {
    console.log(`[KnowledgeEntity] ⚡ Cache hit: "${entity}"`)
    return { ...cached, _fromCache: true }
  }

  // ④ Retrieval بالتوازي: Wikidata + Wikipedia + DBpedia
  const [wikidataResult, dbpediaResult] = await Promise.all([
    _fetchWikidataEntity(entity).catch(() => null),
    _fetchDBpedia(entity).catch(() => null),
  ])

  // ⑤ Wikipedia extract (بناءً على نتيجة Wikidata)
  let wikiExtract = null
  if (wikidataResult?.wikiTitle) {
    wikiExtract = await _fetchWikipediaExtract(wikidataResult.wikiTitle, wikidataResult.wikiLang || 'ar').catch(() => null)
  }
  if (!wikiExtract && entity.length >= 3) {
    // بحث مباشر في Wikipedia
    const searchUrl = `${WIKIPEDIA_AR}?` + new URLSearchParams({
      action: 'query', list: 'search', srsearch: entity,
      srlimit: '3', format: 'json', origin: '*',
    })
    try {
      const sRes = await fetch(searchUrl, { signal: AbortSignal.timeout(AGENT_TIMEOUT) })
      const sData = await sRes.json()
      const hits = sData?.query?.search || []
      if (hits.length) {
        wikiExtract = await _fetchWikipediaExtract(hits[0].title, 'ar').catch(() => null)
      }
    } catch {}
  }

  // ⑥ حساب درجة الثقة
  const confidence = wikidataResult?.confidence
    ?? (wikiExtract ? 0.88 : dbpediaResult ? 0.70 : 0)

  // ⑦ تحقق من عتبة الثقة
  if (confidence < MIN_CONFIDENCE && !wikiExtract && !wikidataResult) {
    console.log(`[KnowledgeEntity] ⚠️ Low confidence (${(confidence*100).toFixed(0)}%) for "${entity}"`)
    const result = {
      content: _buildLowConfidenceResponse(entity),
      model: 'knowledge-entity-low-confidence',
      found: false,
      confidence,
      intent: ENTITY_INTENT.KNOWLEDGE_QUERY,
    }
    return result
  }

  // ⑧ بناء الرد
  const content = _buildEntityResponse({
    entity, entityType, wikidataResult, wikiExtract, dbpediaResult, confidence,
  })

  if (!content) return null

  const result = {
    content,
    model: wikidataResult ? 'knowledge-entity-wikidata' : wikiExtract ? 'knowledge-entity-wikipedia' : 'knowledge-entity-dbpedia',
    found: true,
    confidence,
    intent: ENTITY_INTENT.KNOWLEDGE_QUERY,
    entityName: wikidataResult?.label || wikiExtract?.title || entity,
    entityType,
    sources: [
      wikidataResult ? 'Wikidata' : null,
      wikiExtract    ? 'Wikipedia' : null,
      dbpediaResult  ? 'DBpedia' : null,
    ].filter(Boolean),
  }

  // ⑨ تخزين في الكاش
  _cacheSet(entity, result)
  console.log(`[KnowledgeEntity] ✅ "${entity}" → confidence=${(confidence*100).toFixed(0)}% sources=${result.sources.join('+')}`)

  return result
}

// ──────────────────────────────────────────────────────────────────────────
// رد منخفض الثقة — يوجه للمصادر المباشرة
// ──────────────────────────────────────────────────────────────────────────
function _buildLowConfidenceResponse(entity) {
  const enc = encodeURIComponent(entity)
  return [
    `## 🔍 لم أتمكن من التحقق من معلومات "${entity}" بثقة كافية`,
    '',
    'لضمان دقة المعلومات، يُرجى الرجوع مباشرةً إلى المصادر الموثوقة:',
    '',
    '| المصدر | الرابط |',
    '|--------|--------|',
    `| 📚 **ويكيبيديا العربية** | [بحث](https://ar.wikipedia.org/w/index.php?search=${enc}) |`,
    `| 🔗 **Wikidata** | [بحث](https://www.wikidata.org/w/index.php?search=${enc}) |`,
    `| 🌐 **DBpedia** | [بحث](https://dbpedia.org/page/${enc}) |`,
    `| 🔍 **Google** | [بحث](https://www.google.com/search?q=${enc}) |`,
    '',
    '> ⚠️ *درجة الثقة أقل من 85% — لا يمكن الجزم بالمعلومات بدون مصدر موثوق*',
  ].join('\n')
}

// ══════════════════════════════════════════════════════════════════════════
// § 7 — ROUTING GUARD (للاستخدام في server.js)
// ══════════════════════════════════════════════════════════════════════════

/**
 * ENTITY_ROUTING_POLICY — سياسة التوجيه الصارمة
 * تُستخدم كـ system prompt لمنع تداخل الوكلاء
 */
export const ENTITY_ROUTING_POLICY = `
## 🔴 قواعد التوجيه الصارمة — DZ Knowledge Entity Agent

هذا الوكيل مسؤول **حصراً** عن:
- أسئلة التعريف والتحقق من الهوية (WHO / WHAT)
- الشخصيات العامة: رؤساء، وزراء، علماء، فنانون، رياضيون، شخصيات تاريخية
- الكيانات الجغرافية: دول، ولايات، مدن، مناطق
- الأعمال الفكرية: كتب، أفلام، أغانٍ (مؤلف / مخرج / ملحن)

**ممنوع على هذا الوكيل:**
- ❌ أسئلة الأحداث الحية (آخر أخبار / ماذا حدث اليوم) → Search Agent
- ❌ طلبات الخرائط والخدمات المحلية (أقرب مستشفى) → Maps Agent
- ❌ طلبات مقدمي الخدمات (أريد طبيب) → Service Agent
- ❌ اختراع معلومات أو استخدام LLM كمصدر حقائق

**الإجراء عند الشك:**
إذا لم تتجاوز درجة الثقة 85% → أخبر المستخدم وأعطه روابط المصادر مباشرة.
`.trim()
