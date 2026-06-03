/**
 * DZ Agent — Real-Time Search (v2)
 * غلاف فوق unified-search.js — يحافظ على نفس الـ API للـ server.js
 *
 * Exports:
 *   isRealtimeQuery(q)          → boolean
 *   isSportsQuery(q)            → boolean
 *   fetchRealtimeContext(q)     → string | null   (سياق للحقن في prompt)
 *   searchPersonOnline(name)    → {text, hasInfo} | null
 */

import { unifiedSearch, buildSearchContext } from './unified-search.js'

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
    const { items, jinaContent } = await unifiedSearch(query, {
      dzRSSOnly: false,
      personMode: false,
      langHint: isSports ? 'both' : 'both',
      maxResults: 12,
    })

    if (!items.length && !jinaContent) return null

    return buildSearchContext({
      items,
      jinaContent,
      query,
      label: isSports ? '⚽ نتائج البحث الرياضي' : '🌐 نتائج البحث الفوري',
    })
  } catch (err) {
    console.warn('[RealtimeSearch] error:', err.message)
    return null
  }
}

// ── البحث عن شخص (fallback عند فشل Wikipedia) ──────────────────────────────

export async function searchPersonOnline(personName) {
  try {
    const year = new Date().getFullYear()

    // بحث مزدوج: الاسم وحده + الاسم مع الجزائر
    const [r1, r2] = await Promise.allSettled([
      unifiedSearch(personName, { personMode: true, langHint: 'both', maxResults: 8 }),
      unifiedSearch(`${personName} الجزائر ${year}`, { personMode: false, langHint: 'ar', maxResults: 6 }),
    ])

    const items1 = r1.status === 'fulfilled' ? r1.value.items : []
    const jina1  = r1.status === 'fulfilled' ? r1.value.jinaContent : null
    const items2 = r2.status === 'fulfilled' ? r2.value.items : []

    // دمج + إزالة التكرار
    const seen = new Set()
    const combined = [...items1, ...items2].filter(it => {
      const k = (it.title || '').slice(0, 60).toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    const hasInfo = combined.length > 0 || !!jina1

    if (!hasInfo) return null

    // بناء سياق للـ AI
    const ctx = buildSearchContext({
      items: combined,
      jinaContent: jina1,
      query: personName,
      label: `🔍 بحث حي عن "${personName}"`,
    })

    // تغليف بـ [PERSON_WEB_CONTEXT] لتمييزه في الـ prompt
    const wrapped = `[PERSON_WEB_CONTEXT]\n${ctx}\n[/PERSON_WEB_CONTEXT]`

    return { text: wrapped, hasInfo: true }
  } catch (err) {
    console.warn('[PersonWebSearch] error:', err.message)
    return null
  }
}
