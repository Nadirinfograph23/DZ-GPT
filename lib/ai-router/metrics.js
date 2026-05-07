// ═══════════════════════════════════════════════════════════════════
// AI Router — Per-Provider Metrics & Health Tracking
// Uses the same CircuitBreaker + HealthMonitor from lib/resilience.js
// ═══════════════════════════════════════════════════════════════════

import { CircuitBreaker, HealthMonitor } from '../resilience.js'

export const PROVIDER_NAMES = [
  'groq', 'gemini', 'mistral', 'github', 'nvidia', 'cohere', 'openrouter', 'deepseek', 'ollama',
]

const circuits = {}
const monitors = {}
const latencyMap = {}

for (const name of PROVIDER_NAMES) {
  circuits[name] = new CircuitBreaker({
    name,
    failureThreshold: 4,
    successThreshold: 2,
    cooldownMs: 45_000,
  })
  monitors[name] = new HealthMonitor({ name, windowMs: 5 * 60_000 })
  latencyMap[name] = { total: 0, count: 0, avg: 0 }
}

export function getCircuit(name) { return circuits[name] }
export function getMonitor(name) { return monitors[name] }

export function recordProviderSuccess(name, latencyMs) {
  circuits[name]?.recordSuccess()
  monitors[name]?.record(true, latencyMs)
  const l = latencyMap[name]
  if (l) {
    l.total += latencyMs
    l.count++
    l.avg = Math.round(l.total / l.count)
  }
}

export function recordProviderFailure(name, reason = '') {
  circuits[name]?.recordFailure(reason)
  monitors[name]?.record(false, 0)
}

export function isProviderAvailable(name) {
  return circuits[name]?.isAvailable() ?? false
}

export function getRouterHealthSnapshot() {
  return PROVIDER_NAMES.map(name => ({
    provider: name,
    available: isProviderAvailable(name),
    circuit: circuits[name]?.stats() ?? null,
    health: monitors[name]?.stats() ?? null,
    avgLatencyMs: latencyMap[name]?.avg ?? 0,
  }))
}
