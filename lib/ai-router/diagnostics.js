/**
 * Router Diagnostic Engine — DZ-Agent
 * Tracks per-request: provider used, latency, failures, fallback chains, scores
 */

const MAX_LOG_ENTRIES = 500
const routerLogs = []
let requestCounter = 0

// Provider score store (higher = better)
const providerScores = new Map()
const providerLatencies = new Map()
const providerFailures = new Map()
const providerSuccesses = new Map()
const providerLastUsed = new Map()
const providerLastError = new Map()

const PROVIDERS = ['openai', 'gemini', 'mistral', 'nvidia', 'cohere', 'openrouter', 'groq', 'deepseek', 'ollama']

function initProvider(name) {
  if (!providerScores.has(name)) {
    providerScores.set(name, 100)
    providerLatencies.set(name, [])
    providerFailures.set(name, 0)
    providerSuccesses.set(name, 0)
  }
}

PROVIDERS.forEach(initProvider)

export function generateRequestId() {
  requestCounter++
  return `req_${Date.now().toString(36)}_${requestCounter.toString(36).padStart(4, '0')}`
}

export function recordProviderAttempt(requestId, provider, { success, latencyMs, error, model, truncated, empty }) {
  initProvider(provider)

  const now = Date.now()
  providerLastUsed.set(provider, now)

  if (success) {
    providerSuccesses.set(provider, (providerSuccesses.get(provider) || 0) + 1)
    const lats = providerLatencies.get(provider)
    lats.push(latencyMs)
    if (lats.length > 50) lats.shift()

    // Score improvement: +2 for success, +1 for fast response
    let score = providerScores.get(provider) || 100
    score = Math.min(100, score + 2)
    if (latencyMs < 2000) score = Math.min(100, score + 1)
    providerScores.set(provider, score)
  } else {
    providerFailures.set(provider, (providerFailures.get(provider) || 0) + 1)
    providerLastError.set(provider, { error: error || 'unknown', ts: now })

    // Score penalty
    let score = providerScores.get(provider) || 100
    if (empty) score -= 5
    if (error?.includes('429') || error?.includes('rate')) score -= 15
    else if (error?.includes('timeout') || error?.includes('abort')) score -= 8
    else score -= 10
    score = Math.max(0, score)
    providerScores.set(provider, score)
  }

  // Log entry
  const entry = {
    id: requestId,
    provider,
    model: model || null,
    success,
    latencyMs: latencyMs || null,
    error: error || null,
    truncated: truncated || false,
    empty: empty || false,
    ts: now,
  }

  routerLogs.push(entry)
  if (routerLogs.length > MAX_LOG_ENTRIES) routerLogs.shift()

  return entry
}

export function recordFallbackChain(requestId, chain) {
  // chain = [{provider, success, latencyMs, error}]
  const entry = {
    id: requestId,
    type: 'fallback_chain',
    chain,
    totalMs: chain.reduce((a, c) => a + (c.latencyMs || 0), 0),
    finalProvider: chain.find(c => c.success)?.provider || null,
    ts: Date.now(),
  }
  routerLogs.push(entry)
  if (routerLogs.length > MAX_LOG_ENTRIES) routerLogs.shift()
  return entry
}

export function getProviderScores() {
  const result = {}
  for (const name of PROVIDERS) {
    initProvider(name)
    const lats = providerLatencies.get(name) || []
    const avgLat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null
    const successes = providerSuccesses.get(name) || 0
    const failures = providerFailures.get(name) || 0
    const total = successes + failures
    result[name] = {
      score: providerScores.get(name) || 100,
      successCount: successes,
      failureCount: failures,
      successRate: total ? Math.round((successes / total) * 100) : null,
      avgLatencyMs: avgLat,
      lastUsed: providerLastUsed.get(name) || null,
      lastError: providerLastError.get(name) || null,
    }
  }
  return result
}

export function getRouterLogs(limit = 100, providerFilter = null) {
  let logs = routerLogs.slice().reverse()
  if (providerFilter) logs = logs.filter(l => l.provider === providerFilter)
  return logs.slice(0, limit)
}

export function getRouterDiagnosticSummary() {
  const scores = getProviderScores()
  const recentLogs = routerLogs.slice(-50)
  const recentErrors = recentLogs.filter(l => !l.success && l.error)
  const recentSuccesses = recentLogs.filter(l => l.success)
  const emptyResponses = recentLogs.filter(l => l.empty)
  const truncated = recentLogs.filter(l => l.truncated)

  // Detect patterns
  const providerErrorCounts = {}
  for (const log of recentErrors) {
    providerErrorCounts[log.provider] = (providerErrorCounts[log.provider] || 0) + 1
  }

  const highFailureProviders = Object.entries(providerErrorCounts)
    .filter(([, count]) => count >= 3)
    .map(([provider, count]) => ({ provider, recentFailures: count }))

  return {
    totalRequests: requestCounter,
    recentWindow: recentLogs.length,
    successRate: recentLogs.length
      ? Math.round((recentSuccesses.length / recentLogs.length) * 100)
      : null,
    emptyResponses: emptyResponses.length,
    truncatedResponses: truncated.length,
    highFailureProviders,
    providerScores: scores,
    recommendations: generateRecommendations(scores, highFailureProviders),
    ts: new Date().toISOString(),
  }
}

function generateRecommendations(scores, highFailure) {
  const recs = []

  for (const [name, data] of Object.entries(scores)) {
    if (data.score < 40) recs.push({ level: 'critical', provider: name, msg: `${name} score critically low (${data.score}) — consider disabling temporarily` })
    else if (data.score < 60) recs.push({ level: 'warning', provider: name, msg: `${name} score degraded (${data.score}) — monitor closely` })
    if (data.avgLatencyMs && data.avgLatencyMs > 8000) recs.push({ level: 'warning', provider: name, msg: `${name} avg latency ${data.avgLatencyMs}ms is high` })
  }

  for (const { provider, recentFailures } of highFailure) {
    recs.push({ level: 'error', provider, msg: `${provider} had ${recentFailures} failures in last 50 requests — check API key and quota` })
  }

  return recs
}

export function resetProviderScore(provider) {
  providerScores.set(provider, 100)
  providerFailures.set(provider, 0)
  providerSuccesses.set(provider, 0)
  providerLatencies.set(provider, [])
  providerLastError.delete(provider)
}

export function clearRouterLogs() {
  routerLogs.length = 0
  requestCounter = 0
}
