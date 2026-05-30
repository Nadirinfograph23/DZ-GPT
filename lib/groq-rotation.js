/**
 * lib/groq-rotation.js — Shared Groq Key Rotation Pool v2
 *
 * Fixes v2:
 *   ① Jitter on cooldown — prevents thundering herd (all keys recover at same time)
 *   ② Exponential backoff for repeated rate limits (60s → 120s → 240s)
 *   ③ Smart health score — combines recency, speed, error rate
 *   ④ Warm-up detection — new keys start with low priority until proven stable
 *
 * Collects ALL Groq keys from env:
 *   GROQ_API_KEY, AI_API_KEY, AI_API_KEY_2 … AI_API_KEY_10
 */

const COOLDOWN_BASE_MS       = 60_000   // 429 → base 60s
const COOLDOWN_ERROR_MS      = 30_000   // error → 30s
const COOLDOWN_MAX_MS        = 300_000  // max 5min (exponential backoff cap)
const MAX_CONSECUTIVE_ERRORS = 3
const JITTER_MS              = 8_000    // ±8s random jitter on cooldowns

const _stats = new Map()

function _stat(key) {
  if (!_stats.has(key)) {
    _stats.set(key, {
      requests: 0,
      errors: 0,
      rateLimits: 0,    // عداد مستقل لـ 429
      consecutive: 0,
      totalMs: 0,
      avgMs: 0,
      cooldownUntil: 0,
      backoffLevel: 0,  // مستوى الـ exponential backoff
    })
  }
  return _stats.get(key)
}

function _isCooling(key) {
  return Date.now() < _stat(key).cooldownUntil
}

// Jitter: يمنع كل المفاتيح من التعافي في نفس اللحظة
function _withJitter(ms) {
  const jitter = (Math.random() * 2 - 1) * JITTER_MS  // بين -8s و +8s
  return Math.max(5000, ms + jitter)
}

// Exponential backoff: 60s → 120s → 240s → 300s (cap)
function _backoffMs(level) {
  return Math.min(COOLDOWN_BASE_MS * Math.pow(2, level), COOLDOWN_MAX_MS)
}

// Health score: يُقيّم جودة المفتاح (أعلى = أفضل)
function _healthScore(key) {
  const s = _stat(key)
  if (_isCooling(key)) return -1
  const errRate = s.requests > 0 ? s.errors / s.requests : 0
  const speedScore = s.avgMs > 0 ? Math.max(0, 1 - s.avgMs / 5000) : 0.5
  const freshness = s.requests === 0 ? 0.5 : 1  // مفاتيح جديدة = متوسطة الأولوية
  return (1 - errRate) * 0.5 + speedScore * 0.3 + freshness * 0.2
}

export function getGroqKeyPool() {
  const seen = new Set()
  const keys = []
  const candidates = [
    process.env.GROQ_API_KEY,
    process.env.AI_API_KEY,
    ...Array.from({ length: 9 }, (_, i) => process.env[`AI_API_KEY_${i + 2}`]),
  ]
  for (const k of candidates) {
    if (k && k.trim() && !seen.has(k)) {
      seen.add(k)
      keys.push(k)
    }
  }
  return keys
}

export function groqKeyCount() {
  return getGroqKeyPool().length
}

/**
 * pickGroqKey() — يختار أفضل مفتاح متاح
 * - يتجاهل المفاتيح في حالة cooldown
 * - يُرجّح بـ health score (سرعة + معدل نجاح)
 * - إذا الكل في cooldown → يُعيد الأسرع تعافياً مع تحذير
 */
export function pickGroqKey() {
  const all = getGroqKeyPool()
  if (!all.length) return null

  const available = all.filter(k => !_isCooling(k))
  const pool = available.length
    ? available
    : [...all].sort((a, b) => _stat(a).cooldownUntil - _stat(b).cooldownUntil)

  if (!available.length) {
    const key = pool[0]
    const cd = Math.ceil((_stat(key).cooldownUntil - Date.now()) / 1000)
    console.warn(`[Groq] All ${all.length} key(s) cooling — soonest ${cd}s left`)
    return key
  }

  // ترتيب بـ health score (أعلى أولاً)
  pool.sort((a, b) => _healthScore(b) - _healthScore(a))

  // Jitter بين أفضل المفاتيح (±1 من الأفضل) لتوزيع الحمل
  if (available.length > 1) {
    const bestScore = _healthScore(pool[0])
    const top = pool.filter(k => _healthScore(k) >= bestScore * 0.85)
    return top[Math.floor(Math.random() * Math.min(top.length, 3))]
  }

  return pool[0]
}

export function markGroqSuccess(key, elapsedMs) {
  const s = _stat(key)
  s.requests++
  s.consecutive = 0
  s.backoffLevel = Math.max(0, s.backoffLevel - 1)  // تحسين تدريجي
  s.totalMs += elapsedMs
  s.avgMs = Math.round(s.totalMs / s.requests)
}

export function markGroqRateLimit(key) {
  const s = _stat(key)
  s.errors++
  s.rateLimits++
  s.consecutive++
  s.backoffLevel = Math.min(s.backoffLevel + 1, 4)  // رفع مستوى الـ backoff
  const cooldown = _withJitter(_backoffMs(s.backoffLevel))
  s.cooldownUntil = Date.now() + cooldown
  const idx = getGroqKeyPool().indexOf(key) + 1
  const cd = Math.ceil(cooldown / 1000)
  console.warn(`[Groq] Key #${idx} rate-limited (429) × ${s.rateLimits} — cooling ${cd}s (backoff lvl ${s.backoffLevel})`)
}

export function markGroqError(key) {
  const s = _stat(key)
  s.errors++
  s.consecutive++
  if (s.consecutive >= MAX_CONSECUTIVE_ERRORS) {
    const cooldown = _withJitter(COOLDOWN_ERROR_MS * s.consecutive)
    s.cooldownUntil = Date.now() + cooldown
    const idx = getGroqKeyPool().indexOf(key) + 1
    console.warn(`[Groq] Key #${idx} — ${s.consecutive} consecutive errors — cooling ${Math.ceil(cooldown / 1000)}s`)
  }
}

export function getGroqRotationStats() {
  return getGroqKeyPool().map((k, i) => {
    const s = _stat(k)
    const cooling = _isCooling(k)
    const cdSec = cooling ? Math.ceil((s.cooldownUntil - Date.now()) / 1000) : 0
    return {
      index: i + 1,
      status: cooling ? `CD:${cdSec}s` : 'OK',
      health: Math.round(_healthScore(k) * 100) + '%',
      requests: s.requests,
      errors: s.errors,
      rateLimits: s.rateLimits,
      avgMs: s.avgMs,
      backoffLevel: s.backoffLevel,
    }
  })
}
