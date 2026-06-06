/**
 * DZ-GPT — Search Query Optimizer for SearXNG
 * محسّن استعلامات البحث الذكي
 *
 * Pipeline:
 *   User Question
 *   ↓ Intent Classifier
 *   ↓ Entity Extraction
 *   ↓ Query Rewriter (multi-variation)
 *   ↓ SearXNG Search (parallel)
 *   ↓ Relevance Filter (entity must appear)
 *   ↓ Date Ranking
 *   ↓ Source Verification (≥2 sources)
 *   ↓ Structured Result
 */

import { searchWithSearXNG } from './search-decision-tree.js'

// ─── أنواع الاستعلامات ────────────────────────────────────────────────────────

const INTENT_TYPES = {
  BREAKING_NEWS:    'breaking_news',
  RECENT_EVENT:     'recent_event',
  HISTORICAL_EVENT: 'historical_event',
  BIOGRAPHY:        'biography',
  SPORTS:           'sports',
  LOCATION:         'location',
  GENERAL:          'general',
}

// ─── أنماط الكشف ──────────────────────────────────────────────────────────────

const PATTERNS = {
  BREAKING_NEWS: [
    /عاجل|breaking|flash|urgent|الآن|للتو|منذ قليل|خبر عاجل/i,
    /آخر حادثة|آخر حدث|آخر خبر|latest news|just happened/i,
  ],
  RECENT_EVENT: [
    /اليوم|هذا الأسبوع|هذا الشهر|أمس|recently|هذه السنة|2025|2026/i,
    /آخر|حديثاً|مؤخراً|recent|latest|new development/i,
    /ماذا حدث|ما الذي حدث|what happened/i,
  ],
  HISTORICAL_EVENT: [
    /ماذا حدث في|أزمة|حرب|ثورة|معركة|انقلاب|اتفاقية/i,
    /crisis|war|revolution|battle|coup|agreement|treaty/i,
    /تاريخ|في عام \d{4}|history|historical/i,
  ],
  BIOGRAPHY: [
    /من هو|من هي|سيرة|ترجمة|نبذة|biography|who is|who was/i,
    /ولد|مواليد|born|date of birth|عمر|age of/i,
  ],
  SPORTS: [
    /مباراة|نتيجة|دوري|بطولة|كأس|هدف|لاعب|مدرب/i,
    /match|score|league|cup|goal|player|coach|résultat/i,
    /منتخب|فريق|نادي|team|club/i,
  ],
  LOCATION: [
    /أين|where is|where are|موقع|location|عاصمة|capital/i,
    /مدينة|بلد|دولة|country|city|region/i,
  ],
}

/**
 * classifyIntent — تصنيف نوع الاستعلام
 */
export function classifyIntent(query = '') {
  const q = query.trim()

  if (PATTERNS.BREAKING_NEWS.some(p => p.test(q))) return INTENT_TYPES.BREAKING_NEWS
  if (PATTERNS.SPORTS.some(p => p.test(q))) return INTENT_TYPES.SPORTS
  if (PATTERNS.BIOGRAPHY.some(p => p.test(q))) return INTENT_TYPES.BIOGRAPHY
  if (PATTERNS.HISTORICAL_EVENT.some(p => p.test(q))) return INTENT_TYPES.HISTORICAL_EVENT
  if (PATTERNS.RECENT_EVENT.some(p => p.test(q))) return INTENT_TYPES.RECENT_EVENT
  if (PATTERNS.LOCATION.some(p => p.test(q))) return INTENT_TYPES.LOCATION
  return INTENT_TYPES.GENERAL
}

// ─── استخراج الكيان الرئيسي ────────────────────────────────────────────────────

/**
 * extractEntity — استخراج الكيان الرئيسي من الاستعلام
 * مثال: "آخر حادثة جرت لترمب" → "ترمب"
 */
export function extractEntity(query = '') {
  const q = query.trim()

  // إزالة كلمات التمهيد الشائعة
  const noise = [
    'آخر', 'أحدث', 'حادثة', 'حدث', 'خبر', 'أخبار', 'جرت', 'حدثت',
    'ماذا', 'ما هو', 'من هو', 'من هي', 'هل', 'متى', 'أين',
    'latest', 'recent', 'news', 'event', 'about', 'regarding',
    'لـ', 'عن', 'حول', 'بخصوص', 'متعلق بـ', 'لترمب', 'بترمب',
  ]

  // أسماء مشهورة للكشف المباشر
  const KNOWN_ENTITIES = [
    // سياسة دولية
    { ar: 'ترامب', en: 'Trump', alt: ['ترمب', 'donald trump'] },
    { ar: 'بايدن', en: 'Biden', alt: ['joe biden'] },
    { ar: 'بوتين', en: 'Putin', alt: ['فلاديمير بوتين'] },
    { ar: 'ماكرون', en: 'Macron', alt: ['إيمانويل ماكرون'] },
    { ar: 'نتنياهو', en: 'Netanyahu', alt: ['بيبي نتنياهو'] },
    { ar: 'زيلينسكي', en: 'Zelensky', alt: ['زيلينسكي', 'أوكرانيا'] },
    { ar: 'بايدن', en: 'Biden', alt: ['جو بايدن'] },
    { ar: 'أردوغان', en: 'Erdogan', alt: ['طيب أردوغان'] },
    { ar: 'تبون', en: 'Tebboune', alt: ['عبد المجيد تبون'] },
    { ar: 'كيم جونغ أون', en: 'Kim Jong Un', alt: ['كوريا الشمالية'] },
    // رياضة
    { ar: 'محرز', en: 'Mahrez', alt: ['رياض محرز'] },
    { ar: 'مبابي', en: 'Mbappe', alt: ['كيليان مبابي'] },
    { ar: 'رونالدو', en: 'Ronaldo', alt: ['كريستيانو'] },
    { ar: 'ميسي', en: 'Messi', alt: ['ليونيل ميسي'] },
    // أحداث
    { ar: 'غزة', en: 'Gaza', alt: ['فلسطين'] },
    { ar: 'أوكرانيا', en: 'Ukraine', alt: ['الحرب الأوكرانية'] },
    { ar: 'سوريا', en: 'Syria', alt: [] },
    { ar: 'ليبيا', en: 'Libya', alt: [] },
  ]

  const ql = q.toLowerCase()

  for (const entity of KNOWN_ENTITIES) {
    const allForms = [entity.ar.toLowerCase(), entity.en.toLowerCase(), ...entity.alt.map(a => a.toLowerCase())]
    if (allForms.some(f => ql.includes(f))) {
      return { ar: entity.ar, en: entity.en, raw: entity.ar }
    }
  }

  // استخراج عام: أخذ الكلمة الأطول بعد إزالة الضوضاء
  const words = q.split(/\s+/).filter(w => !noise.some(n => w.includes(n)) && w.length > 2)
  const longest = words.sort((a, b) => b.length - a.length)[0] || q
  return { ar: longest, en: longest, raw: longest }
}

// ─── مولّد الاستعلامات المتعددة ────────────────────────────────────────────────

/**
 * generateQueryVariations — توليد استعلامات متعددة حسب نوع الاستعلام
 */
export function generateQueryVariations(query, intent, entity) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.toLocaleString('ar', { month: 'long' })

  const ar = entity.ar || query
  const en = entity.en || query

  switch (intent) {
    case INTENT_TYPES.BREAKING_NEWS:
    case INTENT_TYPES.RECENT_EVENT:
      return [
        `آخر أخبار ${ar}`,
        `${ar} اليوم ${year}`,
        `${ar} أخبار عاجلة`,
        `${en} latest news`,
        `${en} today ${year}`,
        `${en} recent developments`,
        `${ar} ${month} ${year}`,
        `${en} news ${year}`,
      ]

    case INTENT_TYPES.SPORTS:
      return [
        `${ar} نتائج اليوم`,
        `${ar} آخر مباراة`,
        `${ar} ${year}`,
        `${en} results today`,
        `${en} latest match ${year}`,
        `${ar} أداء حديث`,
      ]

    case INTENT_TYPES.BIOGRAPHY:
      return [
        `من هو ${ar}`,
        `سيرة ذاتية ${ar}`,
        `${ar} معلومات`,
        `${en} biography`,
        `${en} profile`,
        `${en} who is`,
      ]

    case INTENT_TYPES.HISTORICAL_EVENT: {
      // استخرج اسم الحدث مباشرة
      const eventName = query.replace(/ماذا حدث في|أزمة|حرب|ثورة|تاريخ/gi, '').trim()
      return [
        eventName,
        `${eventName} تاريخ`,
        `${eventName} history`,
        `${en} history`,
        `${en} Wikipedia`,
      ]
    }

    case INTENT_TYPES.LOCATION:
      return [
        `${ar} موقع`,
        `${ar} معلومات`,
        `${en} location`,
        `${en} information`,
      ]

    default:
      return [
        query,
        `${ar} ${year}`,
        `${en}`,
        `${ar} معلومات`,
      ]
  }
}

// ─── فلتر الصلة ───────────────────────────────────────────────────────────────

/**
 * isRelevant — هل النتيجة ذات صلة بالكيان المطلوب؟
 * الكيان يجب أن يظهر في العنوان أو المقتطف
 */
function isRelevant(result, entity) {
  const text = `${result.title} ${result.snippet}`.toLowerCase()
  const arLow = (entity.ar || '').toLowerCase()
  const enLow = (entity.en || '').toLowerCase()

  if (!arLow && !enLow) return true
  return text.includes(arLow) || text.includes(enLow) ||
         (arLow.length > 3 && text.includes(arLow.slice(0, -1))) // جذر الكلمة
}

// ─── ترتيب بالتاريخ + الصلة ───────────────────────────────────────────────────

function rankResults(results, entity) {
  return results
    .filter(r => r.title && r.url)
    .map(r => {
      let score = 0

      // صلة بالكيان في العنوان
      const titleLow = (r.title || '').toLowerCase()
      const arLow = (entity.ar || '').toLowerCase()
      const enLow = (entity.en || '').toLowerCase()
      if (arLow && titleLow.includes(arLow)) score += 5
      if (enLow && titleLow.includes(enLow)) score += 4

      // صلة في المقتطف
      const snippetLow = (r.snippet || '').toLowerCase()
      if (arLow && snippetLow.includes(arLow)) score += 2
      if (enLow && snippetLow.includes(enLow)) score += 2

      // حداثة النتيجة
      if (r.date) {
        const age = Date.now() - new Date(r.date).getTime()
        if (age < 3_600_000)     score += 6   // أقل من ساعة
        else if (age < 86_400_000)   score += 4   // أقل من يوم
        else if (age < 604_800_000)  score += 2   // أقل من أسبوع
        else if (age < 2_592_000_000) score += 1  // أقل من شهر
      }

      // عربية = أولوية
      if (/[\u0600-\u06FF]/.test(r.title)) score += 2

      // مصادر موثوقة
      const trusted = ['bbc', 'reuters', 'aljazeera', 'france24', 'elkhabar', 'ennahar', 'aps.dz', 'tsa']
      if (trusted.some(t => (r.url || '').includes(t))) score += 3

      return { ...r, _score: score }
    })
    .sort((a, b) => b._score - a._score)
}

// ─── التحقق من مصدرين ─────────────────────────────────────────────────────────

/**
 * verifyConsensus — هل يوافق مصدران على الحدث؟
 * يعيد true إذا ظهر الكيان في ≥2 نتائج مختلفة المصدر
 */
function verifyConsensus(results, entity) {
  const relevant = results.filter(r => isRelevant(r, entity))
  const uniqueSources = new Set(relevant.map(r => {
    try { return new URL(r.url).hostname } catch { return r.source || 'unknown' }
  }))
  return {
    verified: uniqueSources.size >= 2,
    count: uniqueSources.size,
    sources: [...uniqueSources].slice(0, 5),
  }
}

// ─── إزالة المكرر ─────────────────────────────────────────────────────────────

function dedup(results) {
  const seen = new Set()
  return results.filter(r => {
    const key = (r.title || '').toLowerCase().slice(0, 70)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── بناء السياق المحسّن ────────────────────────────────────────────────────────

/**
 * buildOptimizedContext — بناء سياق منظم للحقن في prompt
 */
export function buildOptimizedContext({ results, query, entity, intent, consensus, noResult }) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })

  if (noResult) {
    return `\n\n---\n## 🔍 نتائج البحث المحسّن\n📅 ${dateStr} — ⏰ ${timeStr}\n\n` +
           `⚠️ **لم أجد نتائج موثوقة مرتبطة بطلبك.**\n` +
           `الكيان المبحوث: **${entity.ar || query}**\n---\n`
  }

  let ctx = `\n\n---\n## 🔍 نتائج البحث المحسّن (Query Optimizer)\n`
  ctx += `📅 ${dateStr} — ⏰ ${timeStr}\n`
  ctx += `🎯 **الكيان:** ${entity.ar}${entity.en !== entity.ar ? ` (${entity.en})` : ''}\n`
  ctx += `📌 **نوع الاستعلام:** ${INTENT_LABELS[intent] || intent}\n`
  ctx += `✅ **التحقق:** ${consensus.verified ? `${consensus.count} مصادر مستقلة` : 'مصدر واحد — تحقق أولي'}\n\n`

  const arResults = results.filter(r => /[\u0600-\u06FF]/.test(r.title))
  const enResults = results.filter(r => !/[\u0600-\u06FF]/.test(r.title))

  if (arResults.length > 0) {
    ctx += `### 📰 نتائج عربية:\n`
    for (const r of arResults.slice(0, 7)) {
      const d = r.date ? ` (${new Date(r.date).toLocaleDateString('ar-DZ')})` : ''
      const link = r.url ? ` — [رابط](${r.url})` : ''
      ctx += `- **${r.title}**${d} — *${r.source}*${link}\n`
      if (r.snippet?.length > 30) ctx += `  > ${r.snippet.slice(0, 250)}\n`
    }
  }

  if (enResults.length > 0) {
    ctx += `\n### 📰 International Results:\n`
    for (const r of enResults.slice(0, 4)) {
      const d = r.date ? ` (${r.date.slice(0, 10)})` : ''
      const link = r.url ? ` — [link](${r.url})` : ''
      ctx += `- **${r.title}**${d} — *${r.source}*${link}\n`
      if (r.snippet?.length > 30) ctx += `  > ${r.snippet.slice(0, 200)}\n`
    }
  }

  if (consensus.sources.length > 0) {
    ctx += `\n📡 **مصادر:** ${consensus.sources.join(' · ')}\n`
  }

  ctx += `\n> ℹ️ **للـ AI**: استخدم هذه النتائج الحقيقية فقط. لا تخترع أحداثاً. لا تخمّن. العربية أولاً. إذا لم تجد دليلاً على الحدث في النتائج — قل ذلك صراحةً.`
  ctx += `\n---\n`
  return ctx
}

const INTENT_LABELS = {
  breaking_news:    '🔴 خبر عاجل',
  recent_event:     '📰 حدث حديث',
  historical_event: '📜 حدث تاريخي',
  biography:        '👤 سيرة شخصية',
  sports:           '⚽ رياضة',
  location:         '📍 موقع / مكان',
  general:          '🌐 استعلام عام',
}

// ─── الدالة الرئيسية ──────────────────────────────────────────────────────────

/**
 * optimizedSearch — محرك البحث المحسّن الكامل
 *
 * @param {string} query - استعلام المستخدم الأصلي
 * @param {object} opts
 *   @param {string} opts.categories - فئات SearXNG
 *   @param {number} opts.maxResults  - أقصى عدد نتائج
 * @returns {Promise<{
 *   context: string,
 *   results: Array,
 *   entity: object,
 *   intent: string,
 *   consensus: object,
 *   confidence: number,
 * }>}
 */
export async function optimizedSearch(query, {
  categories = 'general,news',
  maxResults = 12,
} = {}) {
  console.log(`[QueryOptimizer] ▶ Query: "${query.slice(0, 60)}"`)

  // ── 1. تصنيف النية واستخراج الكيان ──────────────────────────────────────
  const intent = classifyIntent(query)
  const entity = extractEntity(query)
  console.log(`[QueryOptimizer] Intent: ${intent} | Entity: ${entity.ar} / ${entity.en}`)

  // ── 2. توليد الاستعلامات المتعددة ──────────────────────────────────────
  const variations = generateQueryVariations(query, intent, entity)
  console.log(`[QueryOptimizer] Generated ${variations.length} query variations`)

  // ── 3. بحث متوازي بكل الاستعلامات ──────────────────────────────────────
  // نقسم إلى مجموعات لتجنب الضغط على SearXNG
  const isTimeSensitive = intent === INTENT_TYPES.BREAKING_NEWS || intent === INTENT_TYPES.RECENT_EVENT
  const primaryVariations = variations.slice(0, 4)   // الأولويات العالية
  const secondaryVariations = variations.slice(4)    // احتياطية

  const primaryResults = await Promise.allSettled(
    primaryVariations.map(v => searchWithSearXNG(v, {
      categories,
      language: /[\u0600-\u06FF]/.test(v) ? 'ar' : 'en',
      maxResults: 6,
      timeoutMs: isTimeSensitive ? 5000 : 7000,
    }))
  )

  let allResults = primaryResults
    .filter(r => r.status === 'fulfilled' && r.value?.length > 0)
    .flatMap(r => r.value)

  // إذا النتائج قليلة، نجرب الاستعلامات الاحتياطية
  if (allResults.length < 4 && secondaryVariations.length > 0) {
    console.log(`[QueryOptimizer] Low results (${allResults.length}), trying secondary queries...`)
    const secondaryResults = await Promise.allSettled(
      secondaryVariations.slice(0, 2).map(v => searchWithSearXNG(v, {
        categories,
        language: /[\u0600-\u06FF]/.test(v) ? 'ar' : 'en',
        maxResults: 5,
        timeoutMs: 5000,
      }))
    )
    allResults = allResults.concat(
      secondaryResults
        .filter(r => r.status === 'fulfilled' && r.value?.length > 0)
        .flatMap(r => r.value)
    )
  }

  // ── 4. تنظيف + فلتر الصلة ───────────────────────────────────────────────
  const deduped = dedup(allResults)
  const relevant = deduped.filter(r => isRelevant(r, entity))

  // إذا لا توجد نتائج ذات صلة بالكيان، نستخدم كل النتائج
  const finalPool = relevant.length >= 3 ? relevant : deduped

  // ── 5. ترتيب بالتاريخ + الصلة ───────────────────────────────────────────
  const ranked = rankResults(finalPool, entity).slice(0, maxResults)

  // ── 6. التحقق من مصدرين ─────────────────────────────────────────────────
  const consensus = verifyConsensus(ranked, entity)
  console.log(`[QueryOptimizer] ${ranked.length} results | Sources: ${consensus.count} | Verified: ${consensus.verified}`)

  // ── 7. حساب الثقة ────────────────────────────────────────────────────────
  let confidence = 0
  if (ranked.length === 0)       confidence = 0
  else if (!consensus.verified)  confidence = 50
  else if (ranked.length >= 4)   confidence = 78
  else if (ranked.length >= 2)   confidence = 65

  // ── 8. بناء السياق ───────────────────────────────────────────────────────
  const context = buildOptimizedContext({
    results: ranked,
    query,
    entity,
    intent,
    consensus,
    noResult: ranked.length === 0,
  })

  return { context, results: ranked, entity, intent, consensus, confidence }
}
