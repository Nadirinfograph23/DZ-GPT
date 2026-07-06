/**
 * middleware/responseGuard.js — Universal Response Validation Layer
 * ══════════════════════════════════════════════════════════════════
 * التحسينات:
 *   ✅ validation شاملة لكل الوكلاء (ليس الرياضة فقط)
 *   ✅ confidence scoring متعدد الأبعاد
 *   ✅ hallucination detection
 *   ✅ source trustworthiness scoring
 *   ✅ factual consistency check
 *   ✅ structured validation results
 * Backward compatible — validateResponse/buildBlockedResponse/addResponseMetadata
 * لا تزال تعمل بنفس الواجهة.
 */

import logger from '../lib/logger.js'
const log = logger.child('response-guard')

// ── Valid agents registry ────────────────────────────────────────────────────
const VALID_WC_AGENTS    = new Set(['world_cup_agent'])
const VALID_SPORT_AGENTS = new Set(['world_cup_agent', 'sports_agent', 'agent_router'])

const TRUSTED_SOURCES = new Set([
  'FotMob', 'SofaScore', '365score', 'API-Football',
  'jdwel.com', 'kooora.com', 'beinsports',
  'WC2026_LOCAL', 'WC2026_FULL_FIXTURES',
  'static', 'clarification', 'none',
  'FotMob/SofaScore', 'error',
  // Extended trusted sources
  'open-meteo', 'openweathermap', 'weather_agent',
  'nominatim', 'openstreetmap', 'dz-maps',
  'quran-api', 'quran_agent',
  'github-api', 'github_agent',
  'news_agent', 'rss', 'APS', 'الشروق', 'النهار',
  'wikipedia', 'wikidata', 'knowledge_agent',
  'health_agent', 'doctorSearch',
  'currency_agent', 'fawazahmed0',
  'image_search_agent', 'image_gen_agent',
  'search_agent', 'dz_agent',
])

// ── Hallucination signals — phrases that suggest model is making things up ──
const HALLUCINATION_SIGNALS = [
  /(?:أعتقد|يبدو لي|ربما|قد يكون|من المحتمل)\s+(?:أن\s+)?(?:النتيجة|المباراة|الهدف|الترتيب)/i,
  /لا\s+(?:أملك|أعرف|أتذكر)\s+(?:بيانات|معلومات)\s+(?:دقيقة|محددة|حالية)/i,
  /(?:وفق|حسب)\s+(?:ما\s+)?(?:أعلمه|ذاكرتي|تدريبي)/i,
  /(?:I|أنا)\s+(?:think|believe|assume|اعتقد|أظن)\s+the\s+(?:score|result)/i,
  /(?:based\s+on\s+my\s+training|من\s+معلوماتي\s+التدريبية)/i,
  /(?:as\s+of\s+my\s+last|آخر\s+(?:تحديث|معلومة)\s+(?:لديّ|عندي))/i,
]

// ══════════════════════════════════════════════════════════════════════════════
// validateResponse — backward compatible (sports/WC) + extended
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} response
 * @param {string} intent   - 'WORLD_CUP' | 'SPORTS_GENERAL' | any
 * @returns {{ valid: boolean, reason: string }}
 */
export function validateResponse(response = {}, intent = '') {
  if (!response.agent) {
    return { valid: false, reason: 'missing_agent_metadata' }
  }

  if (intent === 'WORLD_CUP' && !VALID_WC_AGENTS.has(response.agent)) {
    return { valid: false, reason: `wrong_agent_for_wc: ${response.agent}` }
  }

  if (['SPORTS_GENERAL', 'SPORTS'].includes(intent) &&
      !VALID_SPORT_AGENTS.has(response.agent)) {
    return { valid: false, reason: `unknown_agent: ${response.agent}` }
  }

  return { valid: true, reason: 'ok' }
}

// ══════════════════════════════════════════════════════════════════════════════
// validateUniversal — شامل لكل الوكلاء
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string}  opts.text         - نص الرد المُولَّد
 * @param {string}  opts.intent       - النية المكتشفة
 * @param {string}  opts.agentId      - معرف الوكيل
 * @param {string}  [opts.source]     - مصدر البيانات
 * @param {number}  [opts.latencyMs]  - وقت الاستجابة
 * @returns {ValidationResult}
 */
export function validateUniversal({
  text      = '',
  intent    = 'UNKNOWN',
  agentId   = '',
  source    = '',
  latencyMs = 0,
} = {}) {
  const result = {
    valid:       true,
    confidence:  'medium',
    score:       100,
    issues:      [],
    warnings:    [],
    hallucination: false,
    sourceScore: 0,
  }

  // ── 1. Empty response ────────────────────────────────────────────────────
  if (!text || text.trim().length < 10) {
    result.valid = false
    result.score = 0
    result.confidence = 'none'
    result.issues.push('empty_response')
    return result
  }

  // ── 2. Hallucination detection ───────────────────────────────────────────
  const hallucinationMatches = HALLUCINATION_SIGNALS.filter(p => p.test(text))
  if (hallucinationMatches.length > 0) {
    result.hallucination = true
    result.score -= 30 * hallucinationMatches.length
    result.warnings.push(`hallucination_signal (${hallucinationMatches.length} matches)`)
    if (hallucinationMatches.length >= 2) {
      result.confidence = 'low'
    }
  }

  // ── 3. Source trustworthiness ────────────────────────────────────────────
  if (source) {
    const trusted = [...TRUSTED_SOURCES].some(s =>
      source.toLowerCase().includes(s.toLowerCase()) ||
      s.toLowerCase().includes(source.toLowerCase())
    )
    result.sourceScore = trusted ? 100 : 40
    if (!trusted) {
      result.warnings.push(`untrusted_source: ${source}`)
      result.score -= 15
    }
  } else {
    result.sourceScore = 50 // no source info
    result.warnings.push('no_source_provided')
    result.score -= 5
  }

  // ── 4. Intent-specific validation ────────────────────────────────────────
  const intentChecks = getIntentChecks(intent)
  for (const check of intentChecks) {
    const passed = check.test(text, agentId, source)
    if (!passed) {
      result.score -= check.penalty
      if (check.critical) {
        result.valid = false
        result.issues.push(check.id)
      } else {
        result.warnings.push(check.id)
      }
    }
  }

  // ── 5. Length sanity ────────────────────────────────────────────────────
  if (text.length > 15000) {
    result.warnings.push('response_too_long')
    result.score -= 5
  }

  // ── 6. Latency penalty (soft) ────────────────────────────────────────────
  if (latencyMs > 30000) {
    result.warnings.push(`high_latency: ${latencyMs}ms`)
    result.score -= 5
  }

  // ── Final confidence rating ───────────────────────────────────────────────
  result.score = Math.max(0, Math.min(100, result.score))
  result.confidence =
    result.score >= 80 ? 'high'   :
    result.score >= 50 ? 'medium' :
    result.score >= 25 ? 'low'    : 'none'

  if (result.confidence === 'none' || result.score < 25) {
    result.valid = false
  }

  log.debug(`[${intent}/${agentId}] score=${result.score} conf=${result.confidence} issues=${result.issues.join(',')||'none'}`)
  return result
}

// ── Per-intent validation rules ──────────────────────────────────────────────
function getIntentChecks(intent) {
  const all = {
    WORLD_CUP: [
      {
        id: 'wc_no_invented_score',
        critical: true,
        penalty: 40,
        test: (text, agentId) => {
          // Fail if score-like patterns appear without world_cup_agent
          const hasScore = /\d+[\s-]+\d+/.test(text)
          return !hasScore || agentId === 'world_cup_agent'
        },
      },
    ],
    SPORTS: [
      {
        id: 'sports_needs_source',
        critical: false,
        penalty: 20,
        test: (text, agentId, source) => !!source && source !== 'none',
      },
    ],
    WEATHER: [
      {
        id: 'weather_needs_numbers',
        critical: false,
        penalty: 15,
        test: (text) => /\d+\s*°/.test(text) || /درجة|temperature|°C|°F/.test(text),
      },
    ],
    QURAN: [
      {
        id: 'quran_no_fabrication',
        critical: true,
        penalty: 50,
        test: (text, agentId) => {
          // Must come from quran_agent for actual ayat
          const hasAyah = /﴿|﴾|سورة/.test(text)
          return !hasAyah || agentId === 'quran_agent'
        },
      },
    ],
    CURRENCY: [
      {
        id: 'currency_needs_rate',
        critical: false,
        penalty: 20,
        test: (text) => /\d+[.,]\d+/.test(text),
      },
    ],
  }

  return all[intent] || []
}

// ══════════════════════════════════════════════════════════════════════════════
// buildBlockedResponse — backward compatible
// ══════════════════════════════════════════════════════════════════════════════
export function buildBlockedResponse(intent = '', reason = '') {
  log.warn(`🛡️ Blocked response — intent=${intent}, reason=${reason}`)

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

  const messages = {
    WEATHER:   '> ⚠️ وكيل الطقس لم يتمكن من جلب بيانات موثّقة. تحقق من [Open-Meteo](https://open-meteo.com).',
    MAPS:      '> ⚠️ وكيل الخرائط لم يجد نتيجة موثّقة. جرّب [خرائط Google](https://maps.google.com).',
    DOCTOR:    '> ⚠️ وكيل الصحة لم يجد طبيباً مطابقاً. جرّب [نقابة الأطباء](http://www.onm.org.dz).',
    QURAN:     '> ⚠️ لم يتم العثور على الآية. تحقق من [Quran.com](https://quran.com).',
    CURRENCY:  '> ⚠️ وكيل العملات لم يحصل على سعر موثوق. تحقق من [xe.com](https://www.xe.com).',
    NEWS:      '> ⚠️ وكيل الأخبار لم يجد نتائج. جرّب [الشروق](https://www.echoroukonline.com) مباشرةً.',
  }

  return {
    userResponse: messages[intent] || '> ⚠️ لم يتمكن الوكيل من تقديم بيانات موثّقة لهذا الطلب.',
    found: false,
    agent: `${(intent || 'unknown').toLowerCase()}_agent`,
    source: 'guard_blocked',
    confidence: 'none',
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// addResponseMetadata — backward compatible
// ══════════════════════════════════════════════════════════════════════════════
export function addResponseMetadata(response = {}, intent = '', query = '') {
  return {
    ...response,
    _meta: {
      agent:      response.agent || 'unknown',
      source:     response.source || 'unknown',
      confidence: response.confidence || 'unknown',
      intent,
      query:      query.slice(0, 80),
      timestamp:  new Date().toISOString(),
    },
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// buildLowConfidenceResponse — رد "لا أعلم بشكل كافٍ"
// ══════════════════════════════════════════════════════════════════════════════
export function buildLowConfidenceResponse(query = '', intent = '') {
  return {
    userResponse: [
      `> 🔍 **DZ Agent:** لا أملك معلومات موثّقة كافية للإجابة على هذا السؤال بدقة.`,
      `>`,
      `> للحصول على إجابة دقيقة، أنصح بـ:`,
      intent === 'SPORTS'   ? `> - [FotMob](https://fotmob.com) أو [SofaScore](https://sofascore.com)` : '',
      intent === 'NEWS'     ? `> - [الشروق](https://echoroukonline.com) أو [النهار](https://ennaharonline.com)` : '',
      intent === 'WEATHER'  ? `> - [Open-Meteo](https://open-meteo.com/en/forecast)` : '',
      `> - أو إعادة صياغة السؤال بمزيد من التفاصيل`,
    ].filter(Boolean).join('\n'),
    found: false,
    confidence: 'none',
    agent: 'response_guard',
    source: 'low_confidence_fallback',
  }
}
