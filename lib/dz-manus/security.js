/**
 * DZ-MANUS — Security Layer
 * Validates URLs, commands, code before execution.
 * NEVER allows: file system escapes, crypto miners, privilege escalation, rm -rf, etc.
 */

// ── Blocked URL patterns ───────────────────────────────────────────────────
const BLOCKED_URL_PATTERNS = [
  /localhost/i, /127\.0\.0\.1/, /0\.0\.0\.0/,
  /10\.\d+\.\d+\.\d+/, /192\.168\./, /172\.(1[6-9]|2\d|3[01])\./,
  /169\.254\./, /::1/, /file:\/\//i, /ftp:\/\//i,
  /metadata\.google\.internal/i, /169\.254\.169\.254/,
]

// ── Blocked shell/code patterns ────────────────────────────────────────────
const BLOCKED_CODE_PATTERNS = [
  /rm\s+-rf/i, /rmdir/i, /del\s+\/[qfs]/i,
  /chmod\s+777/i, /sudo\s+/i, /su\s+-/i,
  /curl.*\|\s*bash/i, /wget.*\|\s*sh/i,
  /eval\s*\(/i, /exec\s*\(/i, /spawn\s*\(/i,
  /child_process/i, /require\s*\(\s*['"]child_process/i,
  /process\.exit/i, /process\.kill/i,
  /crypto.*mine/i, /monero/i, /bitcoin.*wallet/i,
  /xmrig/i, /stratum\+tcp/i,
  /base64_decode.*eval/i,
  /fs\.unlink/i, /fs\.rmdir/i, /fs\.rm\(/i,
  /\.\.\/\.\.\/\.\.\//,
]

// ── Allowed domains for browse tool ───────────────────────────────────────
const SAFE_DOMAINS = [
  'wikipedia.org', 'github.com', 'stackoverflow.com',
  'developer.mozilla.org', 'npmjs.com', 'pypi.org',
  'openstreetmap.org', 'arxiv.org', 'scholar.google.com',
  'medium.com', 'dev.to', 'hashnode.com', 'freecodecamp.org',
  'w3schools.com', 'geeksforgeeks.org', 'leetcode.com',
  'youtube.com', 'twitter.com', 'linkedin.com',
  'djazairess.com', 'ech-chaab.dz', 'ennahar.com',
  'el-watan.com', 'liberte-algerie.com', 'tsa-algerie.com',
  'aps.dz', 'radioalgerie.dz',
]

// ── Safe file path roots ───────────────────────────────────────────────────
const SAFE_FILE_ROOTS = [
  '/tmp/dz-manus-workspace/',
  '/home/runner/workspace/data/',
]

/**
 * Validate a URL for browsing
 * Returns { allowed: bool, reason: string }
 */
export function validateUrl(url) {
  if (!url || typeof url !== 'string') return { allowed: false, reason: 'invalid_url' }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { allowed: false, reason: 'non_http_protocol' }
  }
  for (const pat of BLOCKED_URL_PATTERNS) {
    if (pat.test(url)) return { allowed: false, reason: 'blocked_internal_address' }
  }
  return { allowed: true }
}

/**
 * Validate code before execution in sandbox
 * Returns { safe: bool, reason?: string }
 */
export function validateCode(code) {
  if (!code || typeof code !== 'string') return { safe: false, reason: 'empty_code' }
  if (code.length > 50000) return { safe: false, reason: 'code_too_long' }
  for (const pat of BLOCKED_CODE_PATTERNS) {
    if (pat.test(code)) {
      return { safe: false, reason: `blocked_pattern: ${pat.toString().slice(1, 40)}` }
    }
  }
  return { safe: true }
}

/**
 * Validate a file path for read/write
 */
export function validateFilePath(filePath) {
  if (!filePath) return { allowed: false, reason: 'empty_path' }
  const normalized = filePath.replace(/\.\.\//g, '').replace(/\.\.$/g, '')
  if (normalized !== filePath) return { allowed: false, reason: 'path_traversal_detected' }
  const allowed = SAFE_FILE_ROOTS.some(root => filePath.startsWith(root))
  if (!allowed) return { allowed: false, reason: 'path_outside_safe_roots' }
  return { allowed: true }
}

/**
 * Sanitize AI-generated steps for safe display/execution
 */
export function sanitizeStep(step) {
  if (!step) return step
  if (step.tool === 'shell' || step.tool === 'bash') {
    return { ...step, tool: 'disabled', reason: 'shell_execution_not_permitted' }
  }
  if (step.tool === 'browse' && step.params?.url) {
    const check = validateUrl(step.params.url)
    if (!check.allowed) {
      return { ...step, blocked: true, reason: check.reason }
    }
  }
  if (step.tool === 'code_exec' && step.params?.code) {
    const check = validateCode(step.params.code)
    if (!check.safe) {
      return { ...step, blocked: true, reason: check.reason }
    }
  }
  return step
}

/**
 * Rate limiter per user/session
 */
const _taskCounts = new Map()
export function checkRateLimit(sessionId, maxTasksPerHour = 20) {
  const now = Date.now()
  const key = sessionId || 'default'
  const entry = _taskCounts.get(key) || { count: 0, windowStart: now }
  if (now - entry.windowStart > 3600_000) {
    _taskCounts.set(key, { count: 1, windowStart: now })
    return { allowed: true }
  }
  if (entry.count >= maxTasksPerHour) {
    return { allowed: false, reason: `rate_limit: ${entry.count}/${maxTasksPerHour} tasks/hour` }
  }
  entry.count++
  _taskCounts.set(key, entry)
  return { allowed: true }
}
