/**
 * DZ-GPT — Search Decision Tree (SearXNG Edition)
 * محرك القرار الرئيسي للبحث والتحقق
 *
 * Decision Flow:
 *   شخصية تاريخية → Wikidata → Wikipedia → DBpedia
 *   شخصية عامة    → Wikidata → Wikipedia → DBpedia
 *   حدث تاريخي    → Wikipedia → Wikidata → DBpedia
 *   أخبار حالية   → SearXNG → Crawl4AI
 *   أخبار رياضية  → SearXNG → Crawl4AI
 *   مباريات اليوم → SearXNG → Crawl4AI
 *   إعلان رسمي    → SearXNG → Crawl4AI
 *   اسم غامض      → Wikidata → اطلب توضيح
 *
 * Confidence Rules:
 *   ≥ 95%  → أجب مباشرة
 *   80-94% → أجب مع ملاحظة تحفظ
 *   60-79% → اطلب توضيح
 *   < 60%  → رفض التخمين
 */

import { searchWikidata, fetchWikidataEntity, normalizeArabicName } from './wikidata.js'
import { verifyWithDBpedia, buildDBpediaContext } from './dbpedia.js'
import { extractContent, extractMultiple } from './crawl4ai.js'
import { optimizedSearch } from './search-query-optimizer.js'
import {
  runVerificationChain,
  detectAmbiguousEntity,
  isHistoricalEventQuery,
  needsSportsVerification,
  applyConfidenceSystem,
  buildNoSourceResponse,
  buildClarificationResponse,
} from './verification-policy.js'

// ─── تصنيف الاستعلام ─────────────────────────────────────────────────────────

const HISTORICAL_FIGURE_PATTERNS = [
  /الأمير|الشيخ|الباي|الداي|الخليفة|الحاج|الحاجة/,
  /ثورة|استقلال|مقاومة|فتح|معركة|حصار/,
  /من هو|من هي|سيرة|ترجمة|نبذة/,
]

const CURRENT_NEWS_PATTERNS = [
  /اليوم|الآن|هذا الأسبوع|هذا الشهر|هذه السنة/,
  /أخبار|عاجل|breaking|dernières|آخر/,
  /2024|2025|2026/,
]

const SPORTS_PATTERNS = [
  /مباراة|مباريات|نتيجة|نتائج|ترتيب|دوري|بطولة|كأس|هدف/,
  /match|score|résultat|classement|championnat/,
  /منتخب|الخضر|الرياضة|فريق|نادي/,
  /تشكيلة|هداف|مؤهلات|تصفيات/,
]

const PUBLIC_FIGURE_PATTERNS = [
  /لاعب|مدرب|سياسي|وزير|رئيس|مدير|ممثل|مغني|فنان/,
  /player|coach|minister|president|actor|singer/,
  /من هو|من هي|عمر|ميلاد|تاريخ ميلاد/,
]

const GOVERNMENT_PATTERNS = [
  /وزير|وزراء|الحكومة|الوزارة|الرئيس|الوزير الأول/,
  /ministre|gouvernement|premier ministre/,
  /تشكيلة الحكومة|المنصب الحالي/,
]

const OFFICIAL_ANNOUNCEMENT_PATTERNS = [
  /إعلان|قرار|مرسوم|قانون|مشروع قانون/,
  /communiqué|décret|loi|annonce officielle/,
]

// ─── قائمة أسماء اللاعبين الجزائريين المعروفين (للكشف بدون كلمات مفتاحية) ──────
const KNOWN_ALGERIAN_PLAYER_NAMES = [
  'رياض محرز', 'محرز', 'إبراهيم مازة', 'ابراهيم مازة', 'إبراهيم مازا', 'ابراهيم مازا',
  'يوسف عطال', 'سفيان فيغولي', 'إسلام سليماني', 'بغداد بونجاح',
  'إسماعيل بن ناصر', 'سعيد بن رحمة', 'حسام عوار', 'رامي بن سبعيني',
  'ياسين عدلي', 'ياسين براهيمي', 'يوسف بلايلي', 'ريان آيت نور',
  'آدم عوناس', 'فريد بلغول', 'بونجاح', 'عطال', 'مازة', 'مازا',
  'سليماني', 'فيغولي', 'براهيمي', 'بلايلي', 'عوار', 'بن سبعيني',
]

// ─── قائمة أسماء الوزراء والرؤساء الجزائريين (للكشف بدون كلمات مفتاحية) ──────
const KNOWN_ALGERIAN_GOV_NAMES = [
  'ياسين وليد', 'أحمد عطاف', 'إبراهيم مراد', 'لعزيز فايد', 'محمد عرقاب',
  'الطيب ضيف', 'طاهر قردان', 'موسى بن لعزيز', 'لخضر رخروخ',
  'محمد طارق بلعريبي', 'عبد الحق سايحي', 'عبد الحكيم بلعيد', 'كمال بداري',
  'عبد الرشيد ترار', 'فيصل بن طالب', 'كريمة بلعريبي', 'يوسف شاهد',
  'كمال بلجود', 'نذير العرباوي', 'سيفي غريب',
  'عبد المجيد تبون', 'تبون', 'بوتفليقة', 'بومدين', 'بن بلة', 'زروال', 'بوضياف',
]

/**
 * classifyQuery — تصنيف نوع الاستعلام
 */
export function classifyQuery(query = '') {
  const q = query.trim()

  const test = (patterns) => patterns.some(p => p.test(q))

  if (test(SPORTS_PATTERNS)) {
    if (test(CURRENT_NEWS_PATTERNS) || /اليوم|هذه الجولة|الأسبوع/.test(q)) return 'SPORTS_LIVE'
    return 'SPORTS_GENERAL'
  }
  if (test(CURRENT_NEWS_PATTERNS)) return 'CURRENT_NEWS'
  if (test(GOVERNMENT_PATTERNS) && test(CURRENT_NEWS_PATTERNS)) return 'CURRENT_NEWS'
  if (test(GOVERNMENT_PATTERNS)) return 'PUBLIC_FIGURE'
  if (test(OFFICIAL_ANNOUNCEMENT_PATTERNS)) return 'OFFICIAL_ANNOUNCEMENT'
  if (test(HISTORICAL_FIGURE_PATTERNS)) return 'HISTORICAL_FIGURE'
  if (test(PUBLIC_FIGURE_PATTERNS)) return 'PUBLIC_FIGURE'
  if (isHistoricalEventQuery(q)) return 'HISTORICAL_EVENT'

  // ── كشف اسم لاعب جزائري معروف بدون كلمات مفتاحية ──────────────────────────
  // مثال: "رياض محرز" وحده → SPORTS_GENERAL بدل GENERAL
  for (const name of KNOWN_ALGERIAN_PLAYER_NAMES) {
    if (q.includes(name)) return 'SPORTS_GENERAL'
  }

  // ── كشف اسم مسؤول/وزير جزائري معروف بدون كلمات مفتاحية ────────────────────
  // مثال: "ياسين وليد" وحده → PUBLIC_FIGURE بدل GENERAL
  for (const name of KNOWN_ALGERIAN_GOV_NAMES) {
    if (q.includes(name)) return 'PUBLIC_FIGURE'
  }

  return 'GENERAL'
}

// ─── قوائم الأسماء الغامضة ──────────────────────────────────────────────────

const AMBIGUOUS_NAMES = {
  'ياسين': [
    'ياسين بونو (حارس المرمى المغربي)',
    'ياسين عدلي (لاعب كرة القدم الجزائري)',
    'محمود ياسين (ممثل مصري)',
  ],
  'محمد': [
    'محمد شخصية دينية',
    'محمد رياضي — حدد الاسم الكامل',
    'محمد سياسي — حدد الاسم الكامل',
  ],
  'الأهلي': [
    'الأهلي السعودي (نادي كرة قدم)',
    'الأهلي المصري (نادي كرة قدم)',
    'النادي الأهلي الليبي',
  ],
  'محرز': [
    'رياض محرز (لاعب كرة القدم الجزائري)',
    'محرز فنان',
    'محرز شخص آخر',
  ],
  'بن علي': [
    'زين العابدين بن علي (رئيس تونس السابق)',
    'بن علي — شخص جزائري',
  ],
  'الرئيس السابق': null,
  'الملك': null,
}

/**
 * detectAmbiguity — كشف الغموض في الاستعلام
 * @returns {{ ambiguous: boolean, message: string|null, options: string[]|null }}
 */
export function detectAmbiguity(query = '') {
  const q = query.trim()

  // اسم واحد فقط (احتمال غموض عالٍ)
  const wordsAr = q.match(/[\u0621-\u064A\u0660-\u0669]+/g) || []
  const wordCount = wordsAr.length

  for (const [key, options] of Object.entries(AMBIGUOUS_NAMES)) {
    // الغموض فقط للاسم المفرد — الاسم الكامل (كلمتان+) لا يُعدّ غامضاً
    if (q.includes(key) && wordCount === 1) {
      if (!options) {
        return {
          ambiguous: true,
          message: `هل يمكنك توضيح: "${key}" — أي دولة أو شخص تقصد تحديداً؟`,
          options: null,
        }
      }
      return {
        ambiguous: true,
        message: `هل تقصد:`,
        options: options.map((o, i) => `${i + 1}. ${o}`),
      }
    }
  }

  // اسم مفرد عربي يحتمل الغموض
  if (wordCount === 1 && wordsAr[0] && wordsAr[0].length >= 4) {
    const singleName = wordsAr[0]
    if (/^(ياسين|محمد|خالد|أحمد|عمر|علي|حسن|يوسف)$/.test(singleName)) {
      return {
        ambiguous: true,
        message: `الاسم "${singleName}" غير كافٍ — يُرجى ذكر الاسم الكامل أو تحديد المجال (رياضة، سياسة، فن...).`,
        options: null,
      }
    }
  }

  return { ambiguous: false, message: null, options: null }
}

/**
 * buildAmbiguityResponse — بناء رد الغموض
 */
export function buildAmbiguityResponse(ambiguity) {
  let msg = `⚠️ **توضيح مطلوب**\n\n${ambiguity.message}\n`
  if (ambiguity.options) {
    msg += '\n' + ambiguity.options.join('\n')
    msg += '\n\nأخبرني بالرقم أو اكتب الاسم الكامل.'
  }
  return msg
}

// ─── SearXNG Integration ──────────────────────────────────────────────────────

// ── قائمة instances مرتّبة: المُختبَرة أولاً ──────────────────────────────────
// ✅ مؤكدة العمل   ⏳ احتياطية سريعة الفشل   ❌ محذوفة (ميتة أو محظورة دائماً)
const SEARXNG_INSTANCES = [
  // ✅ مؤكدة (200 < 0.5s)
  'https://search.hbubli.cc',
  'https://nyc1.sx.ggtyler.dev',
  // ⏳ احتياطية — تفشل بسرعة إذا حُظرت (429/403 < 0.5s)
  'https://searx.tiekoetter.com',
  'https://searx.lunar.icu',
  'https://etsi.me',
  'https://priv.au',
  'https://search.sapti.me',
  'https://paulgo.io',
  'https://searx.be',
  'https://search.inetol.net',
  // ❌ محذوف: searxng.world, searx.work, search.privacyguides.net → 000 (6s ضائعة)
]

const SEARXNG_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Accept': 'application/json, text/html;q=0.9, */*;q=0.8',
  'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
  'DNT': '1',
}

// ── Circuit Breaker — تتبع الفشل لكل instance ───────────────────────────────
const _cbFailures = new Map()   // base → timestamp آخر فشل
const _cbSuccesses = new Map()  // base → timestamp آخر نجاح
const CB_COOLDOWN   = 4 * 60 * 1000  // 4 دقائق قبل إعادة المحاولة
let   _lastSuccess  = null            // sticky: آخر instance نجح

function _cbIsOpen(base) {
  const lastFail = _cbFailures.get(base)
  if (!lastFail) return false
  return (Date.now() - lastFail) < CB_COOLDOWN
}
function _cbRecordFailure(base) { _cbFailures.set(base, Date.now()) }
function _cbRecordSuccess(base) {
  _cbFailures.delete(base)
  _cbSuccesses.set(base, Date.now())
  _lastSuccess = base
}

/**
 * searchWithSearXNG v2 — Race-All + Circuit Breaker + Sticky Success
 *
 * بدلاً من الدُفعات التسلسلية (batch of 3 × 6s = 18s في الأسوأ):
 * → نُسابق كل instances دفعة واحدة مع timeout قصير (4s)
 * → أول نتيجة صحيحة تفوز فوراً
 * → الـ circuit breaker يتخطى instances فاشلة حديثاً
 * → sticky: آخر instance نجحت تُجرَّب أولاً دائماً
 *
 * @returns {Promise<Array>}
 */
export async function searchWithSearXNG(query, {
  categories = 'general,news',
  language   = 'ar',
  maxResults = 8,
  timeoutMs  = 4000,  // مخفّض من 6000 → 4000 (instances تستجيب < 0.5s إذا تعمل)
} = {}) {
  const enc = encodeURIComponent(query)
  const langParam = language === 'ar' ? '&language=ar&locale=ar-DZ' : `&language=${language}`

  // ── بناء القائمة المُرتَّبة: sticky أولاً ← circuit-open مستثنى ──────────
  const available = [
    ...((_lastSuccess && !_cbIsOpen(_lastSuccess)) ? [_lastSuccess] : []),
    ...SEARXNG_INSTANCES.filter(b => b !== _lastSuccess && !_cbIsOpen(b)),
  ]

  if (available.length === 0) {
    // إذا حُظرت كلها → أعد تشغيل الدائرة جزئياً (أطول cooldown منتهية أولاً)
    const sorted = [..._cbFailures.entries()].sort((a, b) => a[1] - b[1])
    sorted.slice(0, 3).forEach(([b]) => _cbFailures.delete(b))
    available.push(...SEARXNG_INSTANCES.slice(0, 3))
    console.warn('[SearXNG] ⚠ All instances in CB cooldown — partial reset')
  }

  const tryInstance = async (base) => {
    const url = `${base}/search?q=${enc}&format=json&categories=${categories}${langParam}`
    try {
      const res = await fetch(url, {
        headers: SEARXNG_HEADERS,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      })
      if (!res.ok) { _cbRecordFailure(base); return null }
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('json')) { _cbRecordFailure(base); return null }
      const data = await res.json()
      const results = (data.results || []).slice(0, maxResults).map(item => ({
        source:  item.engine || 'SearXNG',
        title:   item.title  || '',
        snippet: (item.content || item.description || '').slice(0, 400),
        url:     item.url    || '',
        date:    item.publishedDate || '',
        via:     base,
      })).filter(r => r.url && r.title)
      if (results.length > 0) { _cbRecordSuccess(base); return results }
      _cbRecordFailure(base)
      return null
    } catch { _cbRecordFailure(base); return null }
  }

  // ── مرحلة 1: Race الـ 2 المؤكدتين فوراً ─────────────────────────────────
  const priority = available.slice(0, 2)
  const rest     = available.slice(2)

  let winner = null

  // Promise.any: أول نجاح يفوز — أسرع من Promise.race
  const raceWithTimeout = (instances, ms) => new Promise(resolve => {
    let done = false
    const finish = (val) => { if (!done) { done = true; resolve(val) } }
    const timer = setTimeout(() => finish(null), ms)
    Promise.allSettled(instances.map(b => tryInstance(b).then(r => {
      if (r) { clearTimeout(timer); finish(r) }
    })))
  })

  if (priority.length > 0) {
    winner = await raceWithTimeout(priority, timeoutMs)
    if (winner) {
      console.log(`[SearXNG] ✓ ${winner.length} results via ${winner[0]?.via} (priority)`)
      return winner
    }
  }

  // ── مرحلة 2: Race باقي instances ─────────────────────────────────────────
  if (rest.length > 0) {
    winner = await raceWithTimeout(rest, timeoutMs)
    if (winner) {
      console.log(`[SearXNG] ✓ ${winner.length} results via ${winner[0]?.via} (fallback)`)
      return winner
    }
  }

  console.warn(`[SearXNG] ✗ All instances failed for: "${query.slice(0, 50)}"`)

  // ── Fallback نهائي: DuckDuckGo HTML ──────────────────────────────────────
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${enc}&kl=ar-dz`
    const res = await fetch(ddgUrl, {
      headers: { 'User-Agent': SEARXNG_HEADERS['User-Agent'], Accept: 'text/html' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const html = await res.text()
    const linkRe    = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
    const links = [], snippets = []
    let m
    while ((m = linkRe.exec(html)) !== null && links.length < maxResults) {
      let u = m[1]
      if (u.includes('uddg=')) { try { u = new URLSearchParams(u.split('?')[1]).get('uddg') || u } catch {} }
      const title = m[2].replace(/<[^>]+>/g, '').trim()
      if (u.startsWith('http') && title) links.push({ url: u, title })
    }
    while ((m = snippetRe.exec(html)) !== null) snippets.push(m[1].replace(/<[^>]+>/g, '').trim())
    const ddgResults = links.map((l, i) => ({
      source: 'DuckDuckGo', title: l.title, url: l.url,
      snippet: snippets[i] || '', date: '',
    }))
    if (ddgResults.length > 0) console.log(`[SearXNG] ✓ DDG fallback: ${ddgResults.length} results`)
    return ddgResults
  } catch {
    return []
  }
}

// ─── SearXNG → Crawl4AI Pipeline ─────────────────────────────────────────────

/**
 * searchAndExtract — SearXNG ثم Crawl4AI على أعلى النتائج
 * @returns {Promise<{results: Array, extractedContent: string|null, confidence: number}>}
 */
export async function searchAndExtract(query, { categories = 'general,news', maxExtract = 2 } = {}) {
  const results = await searchWithSearXNG(query, { categories, maxResults: 8 })
  if (!results.length) return { results: [], extractedContent: null, confidence: 20 }

  const topUrls = results
    .filter(r => r.url && r.url.startsWith('http'))
    .slice(0, maxExtract)
    .map(r => r.url)

  let extractedContent = null
  if (topUrls.length > 0) {
    extractedContent = await extractMultiple(topUrls, maxExtract)
  }

  const confidence = results.length >= 4 ? (extractedContent ? 82 : 70) : (extractedContent ? 70 : 55)

  return { results, extractedContent, confidence }
}

// ─── البناء السياقي للـ prompt ───────────────────────────────────────────────

/**
 * buildSearXNGContext — بناء سياق SearXNG للحقن في prompt
 */
export function buildSearXNGContext(results = [], extractedContent = null, query = '') {
  if (!results.length && !extractedContent) return null

  const now = new Date()
  const dateStr = now.toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })

  let ctx = `\n\n---\n## 🔍 بحث SearXNG\n`
  ctx += `📅 ${dateStr} — ⏰ ${timeStr}\n`
  ctx += `🔍 البحث: "${query}"\n\n`

  if (extractedContent && extractedContent.length > 100) {
    ctx += `### 📄 محتوى مستخرج (Crawl4AI):\n${extractedContent.slice(0, 1500)}\n\n`
  }

  if (results.length > 0) {
    const ARABIC_RE = /[\u0600-\u06FF]/
    const arResults = results.filter(r => ARABIC_RE.test(r.title) || ARABIC_RE.test(r.snippet))
    const enResults = results.filter(r => !ARABIC_RE.test(r.title))

    if (arResults.length > 0) {
      ctx += `### 📰 نتائج عربية:\n`
      for (const r of arResults.slice(0, 6)) {
        const d = r.date ? ` (${r.date.slice(0, 10)})` : ''
        const link = r.url ? ` — [رابط](${r.url})` : ''
        ctx += `- **${r.title}**${d} — *${r.source}*${link}\n`
        if (r.snippet?.length > 30) ctx += `  > ${r.snippet.slice(0, 200)}\n`
      }
    }

    if (enResults.length > 0) {
      ctx += `\n### 📰 International Results:\n`
      for (const r of enResults.slice(0, 3)) {
        ctx += `- **${r.title}** — *${r.source}*\n`
        if (r.snippet) ctx += `  > ${r.snippet.slice(0, 150)}\n`
      }
    }
  }

  ctx += `\n> ℹ️ **للـ AI**: استخدم هذه النتائج الحقيقية فقط. لا تخترع معلومات. العربية أولاً. الدقة أهم من السرعة.`
  ctx += `\n---\n`
  return ctx
}

// ─── محرك القرار الرئيسي ─────────────────────────────────────────────────────

/**
 * resolveQuery — نقطة الدخول الرئيسية لمحرك القرار
 *
 * @param {string} query - استعلام المستخدم
 * @param {object} opts
 *   @param {Function} opts.searchWikipedia - دالة بحث Wikipedia (من server.js)
 * @returns {Promise<{
 *   type: string,
 *   context: string|null,
 *   confidence: number,
 *   sources: string[],
 *   ambiguous: boolean,
 *   ambiguityMessage: string|null,
 *   noSource: boolean,
 * }>}
 */
export async function resolveQuery(query, { searchWikipediaFn = null } = {}) {
  const queryType = classifyQuery(query)
  console.log(`[DecisionTree] Query type: ${queryType} for: "${query.slice(0, 50)}"`)

  const result = {
    type: queryType,
    context: null,
    confidence: 0,
    sources: [],
    ambiguous: false,
    ambiguityMessage: null,
    noSource: false,
  }

  // ── كشف الغموض أولاً ───────────────────────────────────────────────────────
  const ambiguity = detectAmbiguity(query)
  if (ambiguity.ambiguous) {
    result.ambiguous = true
    result.ambiguityMessage = buildAmbiguityResponse(ambiguity)
    result.confidence = 0
    return result
  }

  // ── شجرة القرار ───────────────────────────────────────────────────────────

  switch (queryType) {
    // ── شخصية تاريخية: Wikidata → Wikipedia → DBpedia ─────────────────────
    case 'HISTORICAL_FIGURE': {
      const verification = await runVerificationChain(query)
      if (verification.found && verification.confidence >= 60) {
        result.context = verification.context
        result.confidence = verification.confidence
        result.sources = verification.sources || ['Wikidata', 'Wikipedia']
      } else {
        // DBpedia كمصدر أخير
        const dbpedia = await verifyWithDBpedia(query)
        if (dbpedia.found && dbpedia.confidence >= 50) {
          result.context = buildDBpediaContext(dbpedia)
          result.confidence = dbpedia.confidence
          result.sources = ['DBpedia']
        } else {
          result.noSource = true
          result.confidence = 0
        }
      }
      break
    }

    // ── شخصية عامة: Wikidata → Wikipedia → DBpedia ────────────────────────
    case 'PUBLIC_FIGURE': {
      const verification = await runVerificationChain(query)
      if (verification.found && verification.confidence >= 60) {
        result.context = verification.context
        result.confidence = verification.confidence
        result.sources = verification.sources || ['Wikidata', 'Wikipedia']
      } else {
        // SearXNG كبحث إضافي + DBpedia للتحقق
        const [searxResult, dbpedia] = await Promise.allSettled([
          searchAndExtract(query, { maxExtract: 1 }),
          verifyWithDBpedia(query),
        ])
        const searx = searxResult.status === 'fulfilled' ? searxResult.value : { results: [], extractedContent: null, confidence: 0 }
        const db = dbpedia.status === 'fulfilled' ? dbpedia.value : { found: false, confidence: 0 }

        if (searx.results.length > 0 || db.found) {
          const ctxParts = []
          if (verification.context) ctxParts.push(verification.context)
          if (searx.results.length > 0) ctxParts.push(buildSearXNGContext(searx.results, searx.extractedContent, query))
          if (db.found && db.confidence > 40) ctxParts.push(buildDBpediaContext(db))
          result.context = ctxParts.filter(Boolean).join('\n')
          result.confidence = Math.max(searx.confidence, db.confidence, verification.confidence || 0)
          result.sources = ['SearXNG', db.found ? 'DBpedia' : null].filter(Boolean)
        } else {
          result.noSource = true
          result.confidence = 0
        }
      }
      break
    }

    // ── حدث تاريخي: Wikipedia → Wikidata → DBpedia ────────────────────────
    case 'HISTORICAL_EVENT': {
      const verification = await runVerificationChain(query)
      if (verification.found && verification.confidence >= 55) {
        result.context = verification.context
        result.confidence = verification.confidence
        result.sources = verification.sources || ['Wikipedia', 'Wikidata']
      } else {
        const dbpedia = await verifyWithDBpedia(query)
        if (dbpedia.found) {
          result.context = buildDBpediaContext(dbpedia)
          result.confidence = dbpedia.confidence
          result.sources = ['DBpedia']
        } else {
          result.noSource = true
          result.confidence = 0
        }
      }
      break
    }

    // ── أخبار حالية: Query Optimizer → SearXNG (multi-variation) ─────────
    case 'CURRENT_NEWS': {
      const opt = await optimizedSearch(query, { categories: 'general,news', maxResults: 12 })
      if (opt.results.length > 0) {
        result.context = opt.context
        result.confidence = opt.confidence
        result.sources = ['SearXNG-Optimized', opt.consensus.verified ? 'Multi-Source' : null].filter(Boolean)
      } else {
        result.noSource = true
        result.confidence = 0
      }
      break
    }

    // ── رياضة مباشرة: Query Optimizer → SearXNG (multi-variation) ────────
    case 'SPORTS_LIVE': {
      const opt = await optimizedSearch(query, { categories: 'general,news', maxResults: 12 })
      if (opt.results.length > 0) {
        result.context = opt.context
        result.confidence = opt.confidence
        result.sources = ['SearXNG-Optimized', opt.consensus.verified ? 'Multi-Source' : null].filter(Boolean)
      } else {
        result.noSource = true
        result.confidence = 0
      }
      break
    }

    // ── رياضة عامة: Wikidata/Wikipedia + SearXNG ───────────────────────────
    case 'SPORTS_GENERAL': {
      const [wikResult, searxResult] = await Promise.allSettled([
        runVerificationChain(query),
        searchAndExtract(query, { categories: 'general,news', maxExtract: 1 }),
      ])
      const wik = wikResult.status === 'fulfilled' ? wikResult.value : { found: false, confidence: 0 }
      const searx = searxResult.status === 'fulfilled' ? searxResult.value : { results: [], confidence: 0 }

      const ctxParts = []
      if (wik.found && wik.context) ctxParts.push(wik.context)
      if (searx.results?.length > 0) ctxParts.push(buildSearXNGContext(searx.results, searx.extractedContent, query))

      if (ctxParts.length > 0) {
        result.context = ctxParts.join('\n')
        result.confidence = Math.max(wik.confidence || 0, searx.confidence || 0)
        result.sources = ['SearXNG', wik.found ? 'Wikipedia' : null].filter(Boolean)
      } else {
        result.noSource = true
        result.confidence = 0
      }
      break
    }

    // ── إعلان رسمي: Query Optimizer → SearXNG (multi-variation) ─────────
    case 'OFFICIAL_ANNOUNCEMENT': {
      const opt = await optimizedSearch(query, { categories: 'general,news', maxResults: 10 })
      if (opt.results.length > 0) {
        result.context = opt.context
        result.confidence = opt.confidence
        result.sources = ['SearXNG-Optimized', opt.consensus.verified ? 'Multi-Source' : null].filter(Boolean)
      } else {
        result.noSource = true
        result.confidence = 0
      }
      break
    }

    // ── عام: SearXNG أولاً + Wikipedia كتحقق ──────────────────────────────
    default: {
      const [searxResult, wikResult] = await Promise.allSettled([
        searchAndExtract(query, { categories: 'general,news', maxExtract: 1 }),
        runVerificationChain(query),
      ])
      const searx = searxResult.status === 'fulfilled' ? searxResult.value : { results: [], confidence: 0 }
      const wik = wikResult.status === 'fulfilled' ? wikResult.value : { found: false, confidence: 0 }

      const ctxParts = []
      if (searx.results?.length > 0) ctxParts.push(buildSearXNGContext(searx.results, searx.extractedContent, query))
      if (wik.found && wik.context) ctxParts.push(wik.context)

      if (ctxParts.length > 0) {
        result.context = ctxParts.join('\n')
        result.confidence = Math.max(searx.confidence || 0, wik.confidence || 0)
        result.sources = ['SearXNG', wik.found ? 'Wikipedia' : null].filter(Boolean)
      } else {
        result.noSource = true
        result.confidence = 0
      }
    }
  }

  // ── تطبيق نظام الثقة ──────────────────────────────────────────────────────
  result.confidenceLabel = applyConfidenceLabel(result.confidence)
  return result
}

/**
 * applyConfidenceLabel — تحديد مستوى الثقة النصي
 */
export function applyConfidenceLabel(confidence) {
  if (confidence >= 95) return 'DIRECT'
  if (confidence >= 80) return 'UNCERTAIN'
  if (confidence >= 60) return 'CLARIFY'
  return 'REFUSE'
}

/**
 * buildFinalContext — بناء السياق النهائي للـ LLM
 * مع ملاحظات الثقة ومصادر التحقق
 */
export function buildFinalContext(queryResult) {
  const { context, confidence, sources, type, ambiguous, noSource } = queryResult

  if (ambiguous) return queryResult.ambiguityMessage

  if (noSource || confidence < 40) {
    return `⚠️ **لم أجد معلومات موثوقة كافية للإجابة على هذا السؤال.**\n\nلا يمكنني الإجابة بدون مصدر موثوق. يُرجى إعادة صياغة السؤال أو تحديد مصدر تريد الاستناد إليه.`
  }

  let header = ''
  if (confidence >= 95) {
    header = `✅ **إجابة موثوقة** (${confidence}% — ${sources.join(', ')})\n\n`
  } else if (confidence >= 80) {
    header = `⚠️ **إجابة بتحفظ** (${confidence}% — ${sources.join(', ')}) — تحقق من المصادر المرفقة.\n\n`
  } else {
    header = `❓ **معلومات غير مكتملة** (${confidence}%) — قد تكون غير دقيقة.\n\n`
  }

  return header + (context || '')
}
