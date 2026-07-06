/**
 * middleware/rateLimiters.js — Enhanced Rate Limiters
 * ═════════════════════════════════════════════════════
 * التحسينات:
 *   ✅ rate limit بـ IP + userId (dual key)
 *   ✅ dynamic limits حسب بيئة التشغيل
 *   ✅ custom error responses بالعربية
 *   ✅ skip function للـ health endpoints
 *   ✅ قراءة X-Forwarded-For وراء proxy
 * Backward compatible — نفس exports القديمة.
 */
import rateLimit from 'express-rate-limit'

// ── Environment config ────────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV !== 'production'

// In dev: 5x looser limits for easier testing
const DEV_MULTIPLIER = IS_DEV ? 5 : 1

// ── Key generator: IP + optional userId header ────────────────────────────────
function keyGenerator(req) {
  const ip = (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  )
  const userId = req.headers['x-user-id'] || ''
  return userId ? `${ip}:${userId}` : ip
}

// ── Skip function for health/status endpoints ─────────────────────────────────
function skipHealthChecks(req) {
  return req.path === '/api/health' ||
         req.path === '/api/health/live' ||
         req.path === '/__healthz'
}

// ── Factory helper ────────────────────────────────────────────────────────────
function makeLimiter({ windowMs, max, message, skip } = {}) {
  return rateLimit({
    windowMs,
    max:             Math.ceil(max * DEV_MULTIPLIER),
    standardHeaders: true,
    legacyHeaders:   false,
    keyGenerator,
    skip:            skip || skipHealthChecks,
    handler(req, res, next, opts) {
      const retryAfter = Math.ceil(opts.windowMs / 1000)
      res.status(429).json({
        error:       message || 'طلبات كثيرة جداً. يرجى الانتظار.',
        retryAfter,
        limit:       opts.max,
        windowMs:    opts.windowMs,
      })
    },
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// Rate limiter definitions
// ══════════════════════════════════════════════════════════════════════════════

/** AI chat endpoints — /api/dz-agent-chat, /api/dz-agent-stream */
export const aiLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max:      20,
  message:  'طلبات ذكاء اصطناعي كثيرة جداً. يرجى الانتظار دقيقة ثم المحاولة مجدداً.',
})

/** GitHub operations */
export const githubLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max:      30,
  message:  'طلبات GitHub كثيرة. يرجى الانتظار دقيقة.',
})

/** Search endpoints */
export const searchLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max:      15,
  message:  'طلبات بحث كثيرة جداً. يرجى الانتظار.',
})

/** Deploy operations — strict */
export const deployLimiter = makeLimiter({
  windowMs: 5 * 60 * 1000,
  max:      3,
  message:  'حد النشر تجاوز. يرجى الانتظار 5 دقائق.',
})

/** Clone engine */
export const cloneLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max:      6,
  message:  'طلبات استنساخ كثيرة. يرجى الانتظار دقيقة.',
})

/** Admin / privileged routes */
export const strictLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max:      5,
  message:  'تجاوزت الحد. يرجى الانتظار.',
})

/** Image generation — expensive, strict */
export const imageLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max:      8,
  message:  'طلبات توليد الصور كثيرة. يرجى الانتظار دقيقة.',
})

/** TTS / voice — medium */
export const voiceLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max:      12,
  message:  'طلبات الصوت كثيرة. يرجى الانتظار دقيقة.',
})

/** WebSocket upgrade protection */
export const wsLimiter = makeLimiter({
  windowMs: 10 * 1000,
  max:      5,
  message:  'محاولات اتصال كثيرة. يرجى الانتظار.',
})

/** General API fallback */
export const generalLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max:      60,
  message:  'طلبات كثيرة جداً. يرجى التباطؤ.',
})
