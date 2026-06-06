/**
 * DZ Agent — Real-Time Search v3 (SearXNG Edition)
 * ❌ Jina AI → مُزال نهائياً
 * ✅ SearXNG  → محرك البحث الأساسي
 * ✅ Crawl4AI → استخراج المحتوى
 *
 * Exports:
 *   isRealtimeQuery(q)          → boolean
 *   isSportsQuery(q)            → boolean
 *   fetchRealtimeContext(q)     → string | null
 *   searchPersonOnline(name)    → {text, hasInfo} | null
 */

import { unifiedSearch, buildSearchContext } from './unified-search.js'
import { optimizedSearch, classifyIntent } from './search-query-optimizer.js'

// ── كلمات تستدعي بحثاً فورياً ──────────────────────────────────────────────

const REALTIME_TRIGGERS = [
  // رياضة
  'مباراة', 'مباريات', 'نتيجة', 'نتائج', 'تشكيلة', 'هدف', 'أهداف',
  'دوري', 'ترتيب', 'بطولة', 'كأس', 'ملخص', 'مباشر', 'اليوم', 'الليلة',
  'الجولة', 'ldc', 'can ', 'coupe', 'match', 'score', 'résultat',
  'منتخب الجزائر', 'الخضر', 'فريق الجزائر',
  // أخبار
  'آخر أخبار', 'أخبار اليوم', 'عاجل', 'عاجلاً', 'حدث', 'حادثة',
  'breaking', 'dernières nouvelles',
  // اقتصاد
  'سعر الدولار', 'سعر اليورو', 'سعر الذهب', 'سعر النفط', 'صرف اليوم', 'سعر الصرف',
  // طقس
  'طقس اليوم', 'درجة الحرارة', 'الطقس في',
  // أحداث راهنة
  'الآن', 'حالياً', 'في الوقت الحالي', 'هذا الأسبوع', 'هذا الشهر',
  // حكومة
  'وزير', 'وزراء', 'الحكومة الجزائرية', 'تشكيلة الحكومة',
  'الوزير الأول', 'رئيس الحكومة', 'من هو وزير', 'المنصب الحالي',
  'ministre', 'gouvernement algérien', 'premier ministre',
]

const SPORTS_TRIGGERS = [
  'مباراة', 'مباريات', 'نتيجة', 'نتائج', 'تشكيلة', 'هدف', 'دوري',
  'ترتيب', 'بطولة', 'كأس', 'ملخص', 'مباشر', 'match', 'score',
  'منتخب', 'الخضر', 'ldc', 'can', "coupe d'algérie",
]

export function isRealtimeQuery(q = '') {
  const lq = q.toLowerCase()
  return REALTIME_TRIGGERS.some(kw => lq.includes(kw.toLowerCase()))
}

export function isSportsQuery(q = '') {
  const lq = q.toLowerCase()
  return SPORTS_TRIGGERS.some(kw => lq.includes(kw.toLowerCase()))
}

// ── البحث الفوري للأسئلة العامة ────────────────────────────────────────────

export async function fetchRealtimeContext(query) {
  try {
    const isSports = isSportsQuery(query)
    const intent = classifyIntent(query)

    // أخبار عاجلة وأحداث حديثة → Query Optimizer (متعدد الاستعلامات)
    const isNewsOrEvent = ['breaking_news', 'recent_event'].includes(intent) ||
      /آخر|حادثة|حدث|خبر|عاجل|اليوم|breaking|latest/i.test(query)

    if (isNewsOrEvent || isSports) {
      const opt = await optimizedSearch(query, {
        categories: isSports ? 'general,news' : 'news,general',
        maxResults: 12,
      })
      if (opt.results.length > 0) return opt.context
      // fallback إلى البحث الموحد
    }

    // بحث موحد عادي للاستعلامات الأخرى
    const { items, extractedContent } = await unifiedSearch(query, {
      dzRSSOnly: false,
      personMode: false,
      langHint: 'both',
      maxResults: 12,
    })

    if (!items.length && !extractedContent) return null

    return buildSearchContext({
      items,
      extractedContent,
      query,
      label: isSports ? '⚽ نتائج البحث الرياضي (SearXNG)' : '🌐 نتائج البحث الفوري (SearXNG)',
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

    const items1 = r1.status === 'fulfilled' ? r1.value.items : []
    const extracted1 = r1.status === 'fulfilled' ? r1.value.extractedContent : null
    const items2 = r2.status === 'fulfilled' ? r2.value.items : []

    // دمج + إزالة التكرار
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
      items: combined,
      extractedContent: extracted1,
      query: personName,
      label: `🔍 بحث SearXNG عن "${personName}"`,
    })

    const wrapped = `[PERSON_WEB_CONTEXT]\n${ctx}\n[/PERSON_WEB_CONTEXT]`
    return { text: wrapped, hasInfo: true }
  } catch (err) {
    console.warn('[PersonWebSearch] error:', err.message)
    return null
  }
}
