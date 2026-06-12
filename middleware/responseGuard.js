/**
 * middleware/responseGuard.js
 * ══════════════════════════════════════════════════════════
 * طبقة التحقق — تمنع أي رد رياضي بدون بيانات وكيل موثّقة
 *
 * القواعد:
 *   1. كل رد عن كأس العالم يجب أن يحتوي agent='world_cup_agent'
 *   2. كل رد رياضي يجب أن يحتوي source موثوق
 *   3. إذا فُقد agent/source → رفض الرد وإعادة التوجيه
 */

const VALID_WC_AGENTS   = new Set(['world_cup_agent'])
const VALID_SPORT_AGENTS = new Set(['world_cup_agent', 'sports_agent', 'agent_router'])
const TRUSTED_SOURCES    = new Set([
  'FotMob', 'SofaScore', '365score', 'API-Football',
  'jdwel.com', 'kooora.com', 'beinsports',
  'WC2026_LOCAL', 'WC2026_FULL_FIXTURES',
  'static', 'clarification', 'none',
  'FotMob/SofaScore', 'error',
])

// ── validateResponse ─────────────────────────────────────────────────────
/**
 * التحقق من صحة الرد
 * @param {object} response - رد الوكيل
 * @param {string} intent   - 'WORLD_CUP' | 'SPORTS_GENERAL'
 * @returns {{ valid: boolean, reason: string }}
 */
export function validateResponse(response = {}, intent = '') {
  // التحقق من وجود metadata
  if (!response.agent) {
    return { valid: false, reason: 'missing_agent_metadata' }
  }

  // التحقق من أن كأس العالم يأتي من وكيل كأس العالم فقط
  if (intent === 'WORLD_CUP' && !VALID_WC_AGENTS.has(response.agent)) {
    return { valid: false, reason: `wrong_agent_for_wc: ${response.agent}` }
  }

  // التحقق العام لأي رد رياضي
  if (!VALID_SPORT_AGENTS.has(response.agent)) {
    return { valid: false, reason: `unknown_agent: ${response.agent}` }
  }

  return { valid: true, reason: 'ok' }
}

// ── buildBlockedResponse — رد عند الرفض ────────────────────────────────
export function buildBlockedResponse(intent = '', reason = '') {
  console.warn(`[ResponseGuard] 🛡️ Blocked response — intent=${intent}, reason=${reason}`)

  if (intent === 'WORLD_CUP') {
    return {
      userResponse: [
        `## ⚽ كأس العالم FIFA 2026`,
        ``,
        `> 🛡️ **وكيل كأس العالم:** البيانات الحية غير متاحة حالياً من المصادر الرسمية.`,
        `> ❌ لن أعطيك معلومات من ذاكرة النموذج — قد تكون قديمة أو غير دقيقة.`,
        ``,
        `**تابع مباشرةً من:**`,
        `| المصدر | الرابط |`,
        `|--------|--------|`,
        `| 🏆 FIFA | [fifa.com/worldcup](https://www.fifa.com/worldcup) |`,
        `| 📡 365score | [نتائج مباشرة](https://www.365scores.com/ar/football/world-cup-2026) |`,
        `| ⚽ FotMob | [WC2026](https://www.fotmob.com/leagues/77/matches/world-cup) |`,
        `| 📋 jdwel | [الجدول](https://jdwel.com/2026-world-cup-fixtures/) |`,
      ].join('\n'),
      found: false,
      agent: 'world_cup_agent',
      source: 'guard_blocked',
      confidence: 'none',
    }
  }

  return {
    userResponse: [
      `> ⚠️ لم يتمكن الوكيل الرياضي من تقديم بيانات موثّقة لهذا الطلب.`,
      `> تحقق من [FotMob](https://www.fotmob.com) أو [SofaScore](https://www.sofascore.com) مباشرةً.`,
    ].join('\n'),
    found: false,
    agent: 'sports_agent',
    source: 'guard_blocked',
    confidence: 'none',
  }
}

// ── addResponseMetadata — إضافة metadata للرد ──────────────────────────
export function addResponseMetadata(response = {}, intent = '', query = '') {
  return {
    ...response,
    _meta: {
      agent: response.agent || 'unknown',
      source: response.source || 'unknown',
      confidence: response.confidence || 'unknown',
      intent,
      query: query.slice(0, 80),
      timestamp: new Date().toISOString(),
    },
  }
}
