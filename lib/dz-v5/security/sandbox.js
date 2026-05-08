/**
 * DZ Agent V5 — Security Sandbox
 * Validates inputs, filters dangerous operations, enforces execution limits.
 */

// Maximum tokens per task to prevent runaway AI costs
const MAX_TOKENS_PER_TASK = 50000
const MAX_TASK_DURATION_MS = 5 * 60 * 1000 // 5 minutes
const MAX_CONCURRENT_TASKS = 3
const MAX_STEPS_PER_PLAN = 15

const BLOCKED_DOMAINS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', // metadata
  '10.0.0.0', '172.16.0.0', '192.168.0.0', // private
])

const BLOCKED_PATTERNS = [
  /process\.env\.(GROQ|DEEPSEEK|OPENAI|ANTHROPIC|GITHUB_TOKEN|VERCEL)/i,
  /require\(['"]child_process['"]\)/,
  /eval\s*\(/,
  /Function\s*\(/,
  /__import__\s*\(/,
  /os\.system\s*\(/,
  /subprocess\.(call|run|Popen)/,
  /exec\s*\(/,
]

export class SecuritySandbox {
  constructor() {
    this.activeTasks = new Set()
    this.tokenCounts = new Map()  // taskId → token count
    this.taskStartTimes = new Map()
  }

  // ── Request validation ─────────────────────────────────────────────────
  validateTask(goal) {
    if (!goal || typeof goal !== 'string') return { ok: false, reason: 'Invalid goal' }
    if (goal.length > 5000) return { ok: false, reason: 'Goal too long (max 5000 chars)' }
    if (goal.length < 3) return { ok: false, reason: 'Goal too short' }

    // Check for injection attempts
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(goal)) {
        return { ok: false, reason: 'Goal contains blocked pattern' }
      }
    }

    // Check concurrent task limit
    if (this.activeTasks.size >= MAX_CONCURRENT_TASKS) {
      return { ok: false, reason: `Too many active tasks (max ${MAX_CONCURRENT_TASKS})` }
    }

    return { ok: true }
  }

  validateUrl(url) {
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { ok: false, reason: 'Only HTTP/HTTPS URLs allowed' }
      }
      const hostname = parsed.hostname.toLowerCase()
      for (const blocked of BLOCKED_DOMAINS) {
        if (hostname === blocked || hostname.startsWith(blocked)) {
          return { ok: false, reason: `Blocked domain: ${hostname}` }
        }
      }
      return { ok: true }
    } catch {
      return { ok: false, reason: 'Invalid URL' }
    }
  }

  validateCode(code) {
    if (!code || typeof code !== 'string') return { ok: false, reason: 'Invalid code' }
    if (code.length > 100000) return { ok: false, reason: 'Code too long (max 100KB)' }

    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(code)) {
        return { ok: false, reason: `Blocked pattern detected: ${pattern.source.slice(0, 30)}` }
      }
    }
    return { ok: true }
  }

  validatePlan(plan) {
    if (!plan || !Array.isArray(plan.steps)) return { ok: false, reason: 'Invalid plan' }
    if (plan.steps.length > MAX_STEPS_PER_PLAN) {
      return { ok: false, reason: `Too many steps (max ${MAX_STEPS_PER_PLAN})` }
    }
    return { ok: true }
  }

  // ── Task lifecycle ─────────────────────────────────────────────────────
  registerTask(taskId) {
    this.activeTasks.add(taskId)
    this.tokenCounts.set(taskId, 0)
    this.taskStartTimes.set(taskId, Date.now())
  }

  releaseTask(taskId) {
    this.activeTasks.delete(taskId)
    this.tokenCounts.delete(taskId)
    this.taskStartTimes.delete(taskId)
  }

  checkTaskLimits(taskId) {
    const tokens = this.tokenCounts.get(taskId) || 0
    const startTime = this.taskStartTimes.get(taskId) || Date.now()
    const elapsed = Date.now() - startTime

    if (tokens > MAX_TOKENS_PER_TASK) {
      return { ok: false, reason: `Token limit exceeded (${tokens}/${MAX_TOKENS_PER_TASK})` }
    }
    if (elapsed > MAX_TASK_DURATION_MS) {
      return { ok: false, reason: `Task duration limit exceeded (${Math.round(elapsed / 1000)}s)` }
    }
    return { ok: true }
  }

  addTokens(taskId, count) {
    this.tokenCounts.set(taskId, (this.tokenCounts.get(taskId) || 0) + count)
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  stats() {
    return {
      activeTasks: this.activeTasks.size,
      maxConcurrent: MAX_CONCURRENT_TASKS,
      limits: {
        maxTokensPerTask: MAX_TOKENS_PER_TASK,
        maxDurationMs: MAX_TASK_DURATION_MS,
        maxStepsPerPlan: MAX_STEPS_PER_PLAN,
      },
    }
  }
}

let _instance = null
export function getSandbox() {
  if (!_instance) _instance = new SecuritySandbox()
  return _instance
}
