/**
 * DZ Agent — Search Brain v1.0
 * طبقة البحث الذكي (Live Search Brain)
 *
 * Architecture:
 *   User Query → Intent Analyzer → Search Brain Layer → Engine Router
 *   → [SearXNG (primary) | RSS+Crawl4AI (fallback) | OpenSerp | YaCy]
 *   → Result Cleaner + Ranker → dz Agent Response
 *
 * القواعد:
 *   ✅ لا تكسر النظام الحالي
 *   ✅ SearXNG أولاً إذا كان متاحاً، RSS كـ fallback
 *   ✅ يسأل المستخدم عند الغموض
 *   ✅ يميّز STATIC / DYNAMIC / UNCERTAIN
 */

import { unifiedSearch, buildSearchContext } from './unified-search.js'

// ─── كلمات مفتاحية للكشف الذكي ──────────────────────────────────────────────

const DYNAMIC_KEYWORDS = [
  // عربي
  'أخبار', 'عاجل', 'اليوم', 'الآن', 'هذا الأسبوع', 'هذا الشهر',
  'آخر', 'جديد', 'تحديث', 'حالياً', 'لحظياً', 'مباشر',
  'سعر', 'صرف', 'نتيجة', 'نتائج', 'مباراة', 'مباريات',
  'طقس', 'حرارة', 'ترتيب', 'دوري', 'بطولة',
  // french / english
  'latest', 'current', 'now', 'today', 'breaking', 'news',
  'price', 'score', 'result', 'weather',
  'actualité', 'dernières', 'maintenant',
]

const STATIC_KEYWORDS = [
  // أسئلة تعريفية / تاريخية
  'ما هو', 'ما هي', 'من هو', 'من هي', 'ما معنى', 'عرّف',
  'تاريخ', 'قصة', 'سيرة', 'نبذة', 'ترجمة',
  'كيفاش', 'كيف تعمل', 'شرح',
  'what is', 'who is', 'define', 'explain', 'history of',
  'qu\'est-ce que', 'qui est', 'expliquer',
]

// ─── كشف نوع الاستعلام ───────────────────────────────────────────────────────

/**
 * classifyQuery — يُصنّف الاستعلام إلى: 'dynamic' | 'static' | 'uncertain'
 */
export function classifyQuery(query = '') {
  const q = query.toLowerCase().trim()

  if (q.length < 5) return 'uncertain'

  const isDynamic = DYNAMIC_KEYWORDS.some(kw => q.includes(kw.toLowerCase()))
  const isStatic  = STATIC_KEYWORDS.some(kw => q.includes(kw.toLowerCase()))

  if (isDynamic && !isStatic) return 'dynamic'
  if (isStatic && !isDynamic) return 'static'
  if (isDynamic && isStatic)  return 'dynamic' // dynamic wins
  return 'uncertain'
}

// ─── SearchBrain Class ───────────────────────────────────────────────────────

export class SearchBrain {
  constructor(config = {}) {
    this.searxng  = config.searxng  || process.env.SEARXNG_URL  || null
    this.openserp = config.openserp || process.env.OPENSERP_URL || null
    this.yacy     = config.yacy     || process.env.YACY_URL     || null
    this._searxngAlive = null       // cache: null=unknown, true/false
    this._searxngChecked = 0
  }

  // ── Health Check لـ SearXNG ────────────────────────────────────────────────

  async isSearXNGAlive() {
    if (!this.searxng) return false
    const now = Date.now()
    // أعد الفحص كل 60 ثانية فقط
    if (this._searxngAlive !== null && now - this._searxngChecked < 60_000) {
      return this._searxngAlive
    }
    try {
      const res = await fetch(`${this.searxng}/search?q=test&format=json`, {
        signal: AbortSignal.timeout(2500),
      })
      this._searxngAlive = res.ok
    } catch {
      this._searxngAlive = false
    }
    this._searxngChecked = now
    return this._searxngAlive
  }

  // ── SearXNG Search ─────────────────────────────────────────────────────────

  async searxngSearch(query, options = {}) {
    if (!this.searxng) return []
    try {
      const url = `${this.searxng}/search?q=${encodeURIComponent(query)}&format=json&language=ar-DZ`
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const data = await res.json()
      return (data.results || []).slice(0, options.maxResults || 8).map(r => ({
        title:   r.title   || '',
        url:     r.url     || '',
        snippet: r.content || r.snippet || '',
        source:  'SearXNG',
        engine:  (r.engines || []).join(','),
      }))
    } catch (err) {
      console.warn('[SearchBrain:SearXNG]', err.message)
      return []
    }
  }

  // ── OpenSerp Search ────────────────────────────────────────────────────────

  async openSerpSearch(query, options = {}) {
    if (!this.openserp) return []
    try {
      const res = await fetch(this.openserp, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ q: query, lang: 'ar', num: options.maxResults || 8 }),
        signal:  AbortSignal.timeout(5000),
      })
      if (!res.ok) return []
      const data = await res.json()
      return (Array.isArray(data) ? data : data.results || []).map(r => ({
        title:   r.title   || '',
        url:     r.url || r.link || '',
        snippet: r.snippet || r.content || '',
        source:  'OpenSerp',
      }))
    } catch (err) {
      console.warn('[SearchBrain:OpenSerp]', err.message)
      return []
    }
  }

  // ── YaCy Search ────────────────────────────────────────────────────────────

  async yacySearch(query, options = {}) {
    if (!this.yacy) return []
    try {
      const url = `${this.yacy}/yacysearch.json?query=${encodeURIComponent(query)}&maximumRecords=${options.maxResults || 8}`
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const data = await res.json()
      const items = data?.channels?.[0]?.items || []
      return items.map(i => ({
        title:   i.title       || '',
        url:     i.link        || '',
        snippet: i.description || '',
        source:  'YaCy',
      }))
    } catch (err) {
      console.warn('[SearchBrain:YaCy]', err.message)
      return []
    }
  }

  // ── RSS + Crawl4AI Fallback (النظام الحالي) ────────────────────────────────

  async rssFallbackSearch(query, options = {}) {
    try {
      const { items, extractedContent } = await unifiedSearch(query, {
        dzRSSOnly:  false,
        personMode: false,
        langHint:   'both',
        maxResults: options.maxResults || 12,
      })
      return { items, extractedContent }
    } catch (err) {
      console.warn('[SearchBrain:RSS]', err.message)
      return { items: [], extractedContent: null }
    }
  }

  // ── Engine Router ──────────────────────────────────────────────────────────

  routeEngines(query = '') {
    const q = query.toLowerCase()
    if (q.includes('أخبار') || q.includes('عاجل') || q.includes('news') || q.includes('breaking'))
      return 'live'       // SearXNG + RSS
    if (q.includes('بحث عميق') || q.includes('deep') || q.includes('research'))
      return 'all'        // جميع المحركات
    return 'primary'      // SearXNG فقط أو RSS كـ fallback
  }

  // ── Deduplicator ───────────────────────────────────────────────────────────

  dedup(results) {
    const seen = new Set()
    return results.filter(r => {
      const key = (r.url || r.title || '').slice(0, 80).toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  // ── الدالة الرئيسية للبحث ─────────────────────────────────────────────────

  /**
   * search(query, options?)
   * يُعيد: { results[], mode, engine, context }
   *   - results  : قائمة النتائج الموحّدة
   *   - mode     : 'searxng' | 'rss' | 'hybrid' | 'all'
   *   - context  : نص جاهز للحقن في system prompt
   */
  async search(query, options = {}) {
    const mode   = options.mode || this.routeEngines(query)
    const maxRes = options.maxResults || 10
    let results  = []
    let engine   = 'rss'
    let rssData  = null

    // ① حاول SearXNG أولاً إذا كان متاحاً
    const useSearxng = this.searxng && (await this.isSearXNGAlive())

    if (useSearxng) {
      const searxResults = await this.searxngSearch(query, { maxResults: maxRes })
      if (searxResults.length > 0) {
        results.push(...searxResults)
        engine = 'searxng'
      }
    }

    // ② إذا mode=all أضف OpenSerp + YaCy
    if (mode === 'all') {
      const [os, yc] = await Promise.allSettled([
        this.openSerpSearch(query, { maxResults: 5 }),
        this.yacySearch(query, { maxResults: 5 }),
      ])
      if (os.status === 'fulfilled') results.push(...os.value)
      if (yc.status === 'fulfilled') results.push(...yc.value)
    }

    // ③ دائماً اجلب RSS كطبقة دعم أو كـ fallback رئيسي
    if (results.length < 5 || mode === 'live') {
      rssData = await this.rssFallbackSearch(query, { maxResults: maxRes })
      const rssItems = (rssData.items || []).map(it => ({
        title:   it.title   || '',
        url:     it.link    || it.url || '',
        snippet: it.snippet || '',
        source:  it.source  || 'RSS',
        pubDate: it.pubDate,
      }))
      results.push(...rssItems)
      engine = results.length > 0
        ? (engine === 'searxng' ? 'hybrid' : 'rss')
        : 'rss'
    }

    // ④ إزالة التكرار + ترتيب (الأحدث أولاً)
    results = this.dedup(results).slice(0, maxRes)

    // ⑤ بناء سياق جاهز للـ AI
    let context = null
    if (results.length > 0 || rssData?.extractedContent) {
      const rssItems = rssData?.items || []
      context = buildSearchContext({
        items:            rssItems,
        extractedContent: rssData?.extractedContent || null,
        query,
        label: `🧠 Search Brain [${engine.toUpperCase()}] — نتائج البحث الحي`,
      })
      // أضف نتائج SearXNG/OpenSerp/YaCy إلى السياق إذا لم تكن RSS
      if (results.length > 0 && engine !== 'rss') {
        const extra = results
          .filter(r => r.source !== 'RSS')
          .slice(0, 5)
          .map((r, i) => `${i + 1}. **${r.title}** — ${r.snippet?.slice(0, 200) || ''}\n   🔗 ${r.url}`)
          .join('\n')
        if (extra) context += `\n\n📡 **نتائج إضافية [${engine.toUpperCase()}]:**\n${extra}`
      }
    }

    return { results, mode, engine, context }
  }
}

// ─── Singleton Instance ───────────────────────────────────────────────────────

export const searchBrain = new SearchBrain({
  searxng:  process.env.SEARXNG_URL  || null,
  openserp: process.env.OPENSERP_URL || null,
  yacy:     process.env.YACY_URL     || null,
})

// ─── Decision Gate ────────────────────────────────────────────────────────────

/**
 * searchBrainGate(query)
 *
 * القرار الذكي الموحّد للوكيل:
 *   'dynamic'   → ابحث مباشرة
 *   'static'    → لا تبحث
 *   'uncertain' → اسأل المستخدم
 *
 * @returns { action: 'search'|'skip'|'ask', type: string, question?: string }
 */
export function searchBrainGate(query = '') {
  const type = classifyQuery(query)
  if (type === 'dynamic')   return { action: 'search', type }
  if (type === 'static')    return { action: 'skip',   type }
  return {
    action:   'ask',
    type:     'uncertain',
    question: 'هل تريد أن أقوم ببحث حي للحصول على أحدث المعلومات؟',
  }
}

/**
 * fetchSearchBrainContext(query, options?)
 *
 * الدالة الرئيسية للاستخدام من الوكلاء — تدمج القرار والبحث:
 *   - إذا dynamic  → يبحث ويُعيد { context, engine, results }
 *   - إذا static   → يُعيد null (لا حاجة لبحث)
 *   - إذا uncertain → يُعيد { ask: true, question }
 *
 * @param {string} query
 * @param {object} options  — { forceSearch, maxResults, mode }
 * @returns {object|null}
 */
export async function fetchSearchBrainContext(query, options = {}) {
  const gate = searchBrainGate(query)

  if (!options.forceSearch && gate.action === 'skip')  return null
  if (!options.forceSearch && gate.action === 'ask')   return { ask: true, question: gate.question }

  try {
    const result = await searchBrain.search(query, options)
    console.log(`[SearchBrain] engine=${result.engine} results=${result.results.length} query="${query.slice(0, 50)}"`)
    return result.context ? result : null
  } catch (err) {
    console.error('[SearchBrain] fatal error:', err.message)
    return null
  }
}
