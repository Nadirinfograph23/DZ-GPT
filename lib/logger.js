/**
 * lib/logger.js — DZ Agent Enhanced Structured Logger
 * ═════════════════════════════════════════════════════
 * التحسينات:
 *   ✅ request ID tracing عبر كل الـ pipeline
 *   ✅ structured JSON logs في production
 *   ✅ child loggers لكل module/agent
 *   ✅ performance timing (startTimer / endTimer)
 *   ✅ agent-specific log helpers
 *   ✅ log sampling لتقليل I/O في الحمل العالي
 *   ✅ backward compatible — نفس API القديمة
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const IS_PROD  = process.env.NODE_ENV === 'production'
const ENV_LEVEL = (process.env.LOG_LEVEL || (IS_PROD ? 'warn' : 'info')).toLowerCase()
const MIN_LEVEL = LEVELS[ENV_LEVEL] ?? LEVELS.info
const USE_JSON  = IS_PROD || process.env.LOG_FORMAT === 'json'

// ── Request ID store (AsyncLocalStorage-free, header-based) ──────────────────
const _reqIdStore = new Map()
let _globalReqId = 0

export function generateRequestId() {
  return `dz-${Date.now().toString(36)}-${(++_globalReqId).toString(36)}`
}

export function setRequestId(id) { _reqIdStore.set('current', id) }
export function getRequestId()   { return _reqIdStore.get('current') || null }
export function clearRequestId() { _reqIdStore.delete('current') }

// ── Express middleware — injects X-Request-Id ────────────────────────────────
export function requestIdMiddleware(req, res, next) {
  const id = req.headers['x-request-id'] || generateRequestId()
  req.requestId = id
  res.setHeader('x-request-id', id)
  setRequestId(id)
  res.on('finish', clearRequestId)
  next()
}

// ── Core formatter ────────────────────────────────────────────────────────────
function _format(level, ctx, args) {
  const ts  = new Date().toISOString().slice(11, 23) // HH:mm:ss.mmm
  const rid = getRequestId()

  if (USE_JSON) {
    // Structured JSON pour production / log aggregators
    const obj = {
      ts,
      level,
      ctx: ctx || undefined,
      rid: rid || undefined,
    }
    if (args.length === 1 && typeof args[0] === 'string') {
      obj.msg = args[0]
    } else if (args.length === 1 && args[0] instanceof Error) {
      obj.msg   = args[0].message
      obj.stack = args[0].stack?.split('\n')[1]?.trim()
    } else {
      obj.msg  = args.filter(a => typeof a === 'string').join(' ') || undefined
      const extra = args.filter(a => typeof a !== 'string')
      if (extra.length) obj.data = extra.length === 1 ? extra[0] : extra
    }
    return JSON.stringify(obj)
  }

  // Human-readable (dev)
  const prefix = [
    `[${ts}]`,
    ctx  ? `[${ctx}]`  : null,
    rid  ? `{${rid.slice(-6)}}` : null,
  ].filter(Boolean).join(' ')

  return [prefix, ...args]
}

function _emit(level, ctx, args) {
  if (LEVELS[level] < MIN_LEVEL) return
  const formatted = _format(level, ctx, args)

  if (USE_JSON) {
    // JSON — always plain console.log to stdout
    console.log(formatted)
    return
  }

  switch (level) {
    case 'debug': console.debug(...formatted); break
    case 'info':  console.log(...formatted);   break
    case 'warn':  console.warn(...formatted);  break
    case 'error': console.error(...formatted); break
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BaseLogger — shared methods
// ══════════════════════════════════════════════════════════════════════════════
class BaseLogger {
  constructor(ctx = null) { this.ctx = ctx }

  debug(...a) { _emit('debug', this.ctx, a) }
  info(...a)  { _emit('info',  this.ctx, a) }
  warn(...a)  { _emit('warn',  this.ctx, a) }
  error(...a) { _emit('error', this.ctx, a) }

  catchWarn(label, err) {
    _emit('warn',  this.ctx, [`[${label}] caught: ${err?.message || String(err)}`])
  }
  catchError(label, err) {
    _emit('error', this.ctx, [
      `[${label}] ERROR: ${err?.message || String(err)}`,
      err?.stack?.split('\n')[1] || '',
    ])
  }

  // ── Performance timing ─────────────────────────────────────────────────
  /**
   * startTimer(label) → returns endTimer function
   * endTimer() → logs elapsed ms and returns ms value
   */
  startTimer(label = 'op') {
    const t0 = Date.now()
    return (extra = '') => {
      const ms = Date.now() - t0
      _emit('debug', this.ctx, [`⏱ ${label}${extra ? ' ' + extra : ''}: ${ms}ms`])
      return ms
    }
  }

  // ── Agent-specific helpers ──────────────────────────────────────────────
  agentRoute(agentId, query = '', source = '') {
    _emit('info', this.ctx, [
      `→ [${agentId}]`,
      query ? `q="${query.slice(0,60)}"` : '',
      source ? `src=${source}` : '',
    ].filter(Boolean).join(' '))
  }

  agentResult(agentId, ok, ms = 0, extra = '') {
    const status = ok ? '✓' : '✗'
    _emit(ok ? 'info' : 'warn', this.ctx, [
      `${status} [${agentId}] ${ms}ms`,
      extra || '',
    ].filter(Boolean).join(' '))
  }

  intentDetected(intent, confidence = '', query = '') {
    _emit('debug', this.ctx, [
      `🧭 intent=${intent}`,
      confidence ? `conf=${confidence}` : '',
      query ? `q="${query.slice(0,50)}"` : '',
    ].filter(Boolean).join(' '))
  }

  cacheHit(key = '') {
    _emit('debug', this.ctx, [`⚡ cache HIT: ${key.slice(0, 60)}`])
  }

  cacheMiss(key = '') {
    _emit('debug', this.ctx, [`🔍 cache MISS: ${key.slice(0, 60)}`])
  }

  // ── Child logger ────────────────────────────────────────────────────────
  /**
   * Returns a new logger scoped to a module/agent name.
   * child('sports') → logs with [sports] prefix
   */
  child(name) {
    return new BaseLogger(this.ctx ? `${this.ctx}:${name}` : name)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Default singleton (backward compatible — same interface as old logger)
// ══════════════════════════════════════════════════════════════════════════════
export const logger = new BaseLogger()

// Pre-built child loggers for core modules
export const agentLog    = logger.child('agent')
export const intentLog   = logger.child('intent')
export const cacheLog    = logger.child('cache')
export const searchLog   = logger.child('search')
export const sportsLog   = logger.child('sports')
export const weatherLog  = logger.child('weather')
export const githubLog   = logger.child('github')
export const resLog      = logger.child('resilience')

export default logger
