// ══════════════════════════════════════════════════════════════════════════════
// 🇩🇿 DZ KNOWLEDGE BASE — Router الرئيسي
// يُحدد الـ KB المناسب لكل سؤال ويُعيد السياق للحقن في system prompt
// لا يُعدّل أي منطق موجود — يعمل كطبقة إضافية فوق كل شيء
// ══════════════════════════════════════════════════════════════════════════════

import { isProverbsQuery, getProverbsContext }       from './proverbs.js'
import { isWilayaQuery,   getWilayaContext }         from './wilayas.js'
import { isCuisineQuery,  getCuisineContext }         from './cuisine.js'
import { isHistoryQuery,  getHistoryContext }         from './history.js'
import { isMusicArtsQuery, getMusicArtsContext }     from './music-arts.js'
import { isFamousQuery,   getFamousContext }         from './famous.js'
import { isUniversityQuery, getUniversityContext }   from './universities.js'
import { isEconomyQuery,  getEconomyContext }        from './economy.js'
import { isDialectQuery,  getDialectContext }        from './dialect-ext.js'
import { isLawQuery,      getLawContext }            from './law.js'

// ── الـ detectors مرتبة حسب الأولوية ─────────────────────────────────────
const KB_MODULES = [
  { id: 'law',        detect: isLawQuery,         build: getLawContext },
  { id: 'economy',    detect: isEconomyQuery,      build: getEconomyContext },
  { id: 'history',    detect: isHistoryQuery,      build: getHistoryContext },
  { id: 'famous',     detect: isFamousQuery,       build: getFamousContext },
  { id: 'wilayas',    detect: isWilayaQuery,       build: getWilayaContext },
  { id: 'cuisine',    detect: isCuisineQuery,      build: getCuisineContext },
  { id: 'music_arts', detect: isMusicArtsQuery,    build: getMusicArtsContext },
  { id: 'universities',detect: isUniversityQuery,  build: getUniversityContext },
  { id: 'proverbs',   detect: isProverbsQuery,     build: getProverbsContext },
  { id: 'dialect',    detect: isDialectQuery,      build: getDialectContext },
]

// حد أقصى لعدد الـ KBs المحقونة في prompt واحد (لضبط التوكنز)
const MAX_KB_SECTIONS = 2

/**
 * getDZKBContext(msg) — يُعيد [DZ_KB] block أو '' إذا لم يتطابق شيء
 * @param {string} msg — رسالة المستخدم الأخيرة
 * @returns {string}
 */
export function getDZKBContext(msg) {
  if (typeof msg !== 'string' || msg.trim().length < 3) return ''

  const matched = []
  for (const mod of KB_MODULES) {
    try {
      if (mod.detect(msg)) {
        matched.push(mod)
        if (matched.length >= MAX_KB_SECTIONS) break
      }
    } catch { /* لا نكسر الـ flow بأي حال */ }
  }

  if (matched.length === 0) return ''

  const parts = []
  for (const mod of matched) {
    try {
      const ctx = mod.build(msg)
      if (ctx) parts.push(ctx)
    } catch (e) {
      console.warn(`[DZ-KB] ${mod.id} build error:`, e?.message?.slice(0, 60))
    }
  }

  if (parts.length === 0) return ''

  return `\n\n[DZ_ALGERIAN_KNOWLEDGE_BASE]\n${parts.join('\n\n')}\n[/DZ_ALGERIAN_KNOWLEDGE_BASE]\n\n⚡ استخدم المعلومات الواردة في [DZ_ALGERIAN_KNOWLEDGE_BASE] كمرجع أول وأساسي للإجابة على هذا السؤال. إذا كانت المعلومات كاملة → أجب مباشرة منها. إذا كانت تحتاج إضافة → أكمل من معرفتك.\n`
}

export { KB_MODULES }
