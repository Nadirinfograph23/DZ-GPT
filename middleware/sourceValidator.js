/**
 * middleware/sourceValidator.js
 * ══════════════════════════════════════════════════════════
 * Source Priority System — التحقق من أولوية المصادر
 *
 * لوكيل كأس العالم:
 *   1. jdwel.com/2026-world-cup-fixtures/
 *   2. fotmob.com (league 77)
 *   3. kooora.com WC2026
 *   4. beinsports.com/ar-mena
 *   5. WC2026_LOCAL (fallback)
 *
 * لوكيل الرياضة العامة:
 *   1. FotMob
 *   2. SofaScore
 *   3. 365score
 *   4. API-Football
 *   5. Kooora
 */

// ── أولوية مصادر كأس العالم ──────────────────────────────────────────────
export const WC_SOURCE_PRIORITY = [
  { name: 'jdwel.com', url: 'https://jdwel.com/2026-world-cup-fixtures/', priority: 1, type: 'official_schedule' },
  { name: 'FotMob',    url: 'https://www.fotmob.com/leagues/77/matches/world-cup', priority: 2, type: 'live_data' },
  { name: 'kooora.com',url: 'https://www.kooora.com/', priority: 3, type: 'arabic_source' },
  { name: 'beinsports',url: 'https://www.beinsports.com/ar-mena/', priority: 4, type: 'arabic_broadcast' },
  { name: 'WC2026_LOCAL', url: null, priority: 5, type: 'local_fallback' },
]

// ── أولوية مصادر الرياضة العامة ──────────────────────────────────────────
export const SPORTS_SOURCE_PRIORITY = [
  { name: 'FotMob',       url: 'https://www.fotmob.com',       priority: 1 },
  { name: 'SofaScore',    url: 'https://www.sofascore.com',     priority: 2 },
  { name: '365score',     url: 'https://www.365scores.com/ar',  priority: 3 },
  { name: 'API-Football', url: 'https://api-football.com',      priority: 4 },
  { name: 'kooora.com',   url: 'https://www.kooora.com',        priority: 5 },
]

// ── التحقق من صحة المصدر ────────────────────────────────────────────────
export function validateSource(source = '', agentType = 'general') {
  if (!source || source === 'none' || source === 'error') {
    return { valid: false, priority: 99, message: 'no_source' }
  }

  const pool = agentType === 'world_cup' ? WC_SOURCE_PRIORITY : SPORTS_SOURCE_PRIORITY
  const found = pool.find(s =>
    source.toLowerCase().includes(s.name.toLowerCase()) ||
    s.name.toLowerCase().includes(source.toLowerCase())
  )

  if (!found) {
    return { valid: true, priority: 10, message: 'unknown_but_accepted' }
  }

  return { valid: true, priority: found.priority, message: 'ok', sourceInfo: found }
}

// ── بناء footer المصادر ─────────────────────────────────────────────────
export function buildSourcesFooter(sources = [], agentType = 'general') {
  if (!sources?.length) return ''

  const icons = {
    'FotMob':       '⚽',
    'SofaScore':    '📊',
    '365score':     '📡',
    'jdwel.com':    '📋',
    'kooora.com':   '🇩🇿',
    'beinsports':   '📺',
    'WC2026_LOCAL': '🗃️',
    'API-Football': '🏆',
  }

  const parts = sources.map(s => {
    const icon = Object.entries(icons).find(([k]) => s.includes(k))?.[1] || '🔗'
    return `${icon} ${s}`
  })

  return `\n> 📌 _المصادر: ${parts.join(' · ')}_`
}
