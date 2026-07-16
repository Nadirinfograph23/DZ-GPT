/**
 * DZ Agent — Real-Time Search v5 (Search Brain Edition)
 * ✅ Search Brain  → طبقة القرار الذكي (SearXNG + RSS + Crawl4AI)
 * ✅ RSS جزائرية  → المصدر الأساسي للأخبار
 * ✅ Google News RSS → مصدر ثانوي
 * ✅ Crawl4AI      → استخراج المحتوى العميق
 * ✅ SearXNG       → يُستخدم تلقائياً إذا كان متاحاً (بدون تعطيل)
 *
 * Exports:
 *   isRealtimeQuery(q)          → boolean
 *   isSportsQuery(q)            → boolean
 *   fetchRealtimeContext(q)     → string | null
 *   searchPersonOnline(name)    → {text, hasInfo} | null
 */

import { unifiedSearch, buildSearchContext } from './unified-search.js'
import { isEntityDefinitionQuery }           from './entity-question-guard.js'
import { fetchSearchBrainContext, searchBrainGate } from './search-brain.js'
import { dzSearchRouter, buildOptimizedQuery }  from './dz-search-router.js'

// ── كلمات تستدعي بحثاً فورياً (احتياطي — الراوتر الرئيسي هو dzSearchRouter) ──
const REALTIME_TRIGGERS = [
  // رياضة
  'مباراة', 'مباريات', 'نتيجة', 'نتائج', 'تشكيلة', 'هدف', 'أهداف',
  'دوري', 'ترتيب', 'بطولة', 'كأس', 'ملخص', 'مباشر', 'اليوم', 'الليلة',
  'الجولة', 'ldc', 'can ', 'coupe', 'match', 'score', 'résultat',
  'منتخب الجزائر', 'الخضر', 'فريق الجزائر',
  // أخبار — عبارات مركّبة + مفردة "أخبار" (إصلاح: كانت مفقودة)
  'أخبار', 'آخر أخبار', 'أخبار اليوم', 'عاجل', 'عاجلاً', 'حدث', 'حادثة',
  'breaking', 'dernières nouvelles', 'actualité',
  // اقتصاد
  'سعر الدولار', 'سعر اليورو', 'سعر الذهب', 'سعر النفط', 'صرف اليوم', 'سعر الصرف',
  'أسعار الصرف', 'سعر النفط',
  // طقس
  'طقس اليوم', 'درجة الحرارة', 'الطقس في',
  // أحداث راهنة
  'الحالي', 'الحالية', 'الآن', 'في الوقت الحالي', 'هذا الأسبوع', 'هذا الشهر',
  'مؤخراً', 'حديثاً', 'مؤخرا',
  // حكومة
  'تشكيلة الحكومة', 'الحكومة الجزائرية',
  'آخر أخبار الوزير', 'تصريح وزير', 'تصريح الوزير',
  'ministre', 'gouvernement algérien',
]

const SPORTS_TRIGGERS = [
  'مباراة', 'مباريات', 'نتيجة', 'نتائج', 'تشكيلة', 'هدف', 'دوري',
  'ترتيب', 'بطولة', 'كأس', 'ملخص', 'مباشر', 'match', 'score',
  'منتخب', 'الخضر', 'ldc', 'can', "coupe d'algérie",
]

/**
 * isRealtimeQuery — يجمع dzSearchRouter (الراوتر الذكي) + REALTIME_TRIGGERS (الاحتياطي)
 */
export function isRealtimeQuery(q = '') {
  // ── Entity Definition Guard ───────────────────────────────────────────────
  if (isEntityDefinitionQuery(q)) return false

  // ── الراوتر الذكي أولاً ─────────────────────────────────────────────────
  const routerDecision = dzSearchRouter(q)
  if (routerDecision.decision === 'SEARCH') return true

  // ── fallback: REALTIME_TRIGGERS الكلاسيكية ───────────────────────────────
  const lq = q.toLowerCase()
  return REALTIME_TRIGGERS.some(kw => lq.includes(kw.toLowerCase()))
}

export function isSportsQuery(q = '') {
  const lq = q.toLowerCase()
  return SPORTS_TRIGGERS.some(kw => lq.includes(kw.toLowerCase()))
}

// ── البحث الفوري — Search Brain أولاً، RSS كـ fallback ─────────────────────

/**
 * fetchRealtimeContext(query, searchQuery?)
 * @param {string} query       — السؤال الأصلي للمستخدم (يُعرض في log)
 * @param {string} searchQuery — الاستعلام المحسّن (اختياري — من dzSearchRouter)
 *                               إذا لم يُعطَ يُستخدم query مباشرة
 */
export async function fetchRealtimeContext(query, searchQuery) {
  try {
    // استخدم الاستعلام المحسّن إذا توفر، وإلا استخدم الأصلي
    const effectiveQuery = (searchQuery && searchQuery.trim().length >= 3)
      ? searchQuery
      : query
    const isSports = isSportsQuery(effectiveQuery) || isSportsQuery(query)

    if (effectiveQuery !== query) {
      console.log(`[RealtimeSearch] 🎯 Topic-optimized query: "${query.slice(0,50)}" → "${effectiveQuery}"`)
    }

    // ① حاول عبر Search Brain (SearXNG + RSS + Crawl4AI)
    const brainResult = await fetchSearchBrainContext(effectiveQuery, {
      forceSearch: true,
      maxResults:  12,
      mode: isSports ? 'live' : 'primary',
    })

    if (brainResult && !brainResult.ask && brainResult.context) {
      return brainResult.context
    }

    // ② fallback: RSS مباشر (النظام القديم — دائماً يعمل)
    const { items, extractedContent } = await unifiedSearch(effectiveQuery, {
      dzRSSOnly:  false,
      personMode: false,
      langHint:   'both',
      maxResults: 12,
    })

    if (!items.length && !extractedContent) return null

    return buildSearchContext({
      items,
      extractedContent,
      query: effectiveQuery,
      label: isSports
        ? '⚽ أخبار رياضية — مصادر RSS جزائرية'
        : '📰 أخبار الجزائر — RSS مباشر',
    })
  } catch (err) {
    console.warn('[RealtimeSearch] error:', err.message)
    return null
  }
}

// ── البحث عن شخص ────────────────────────────────────────────────────────────

export async function searchPersonOnline(personName) {
  try {
    const year = new Date().getFullYear()

    const [r1, r2] = await Promise.allSettled([
      unifiedSearch(personName, { personMode: true, langHint: 'both', maxResults: 8 }),
      unifiedSearch(`${personName} الجزائر ${year}`, { personMode: false, langHint: 'ar', maxResults: 6 }),
    ])

    const items1    = r1.status === 'fulfilled' ? r1.value.items : []
    const extracted1 = r1.status === 'fulfilled' ? r1.value.extractedContent : null
    const items2    = r2.status === 'fulfilled' ? r2.value.items : []

    const seen = new Set()
    const combined = [...items1, ...items2].filter(it => {
      const k = (it.title || '').slice(0, 60).toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    const hasInfo = combined.length > 0 || !!extracted1
    if (!hasInfo) return null

    const ctx = buildSearchContext({
      items:            combined,
      extractedContent: extracted1,
      query:            personName,
      label:            `🔍 بحث عن "${personName}" — RSS جزائرية`,
    })

    const wrapped = `[PERSON_WEB_CONTEXT]\n${ctx}\n[/PERSON_WEB_CONTEXT]`
    return { text: wrapped, hasInfo: true }
  } catch (err) {
    console.warn('[PersonWebSearch] error:', err.message)
    return null
  }
}

// ── تصدير searchBrainGate للوكلاء الذين يريدون سؤال المستخدم ──────────────

export { searchBrainGate }
