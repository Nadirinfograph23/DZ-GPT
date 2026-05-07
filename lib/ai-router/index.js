// ═══════════════════════════════════════════════════════════════════
// AI Router — Multi-Provider Fallback System
// Priority: Groq → Gemini → Mistral → GitHub → NVIDIA → Cohere → OpenRouter
// Never throws. Always returns { content, model } or { content: null }.
// ═══════════════════════════════════════════════════════════════════

import {
  recordProviderSuccess,
  recordProviderFailure,
  isProviderAvailable,
  getRouterHealthSnapshot,
} from './metrics.js'

import {
  callGemini,
  callMistral,
  callGitHubModels,
  callNvidia,
  callCohere,
  callOpenRouter,
} from './providers.js'

export { getRouterHealthSnapshot }

// ── Provider registry ─────────────────────────────────────────────
// Each entry: { name, fn, envKey, models }
// Ordered by preference — Groq is handled externally by the existing system;
// these are the fallback chain when Groq (and DeepSeek/Ollama) fail.
const FALLBACK_PROVIDERS = [
  {
    name: 'gemini',
    fn: callGemini,
    envKey: 'GEMINI_API_KEY',
    model: 'gemini-2.5-flash',
  },
  {
    name: 'mistral',
    fn: callMistral,
    envKey: 'MISTRAL_API_KEY',
    model: 'mistral-large-latest',
  },
  {
    name: 'github',
    fn: callGitHubModels,
    envKey: 'GITHUB_TOKEN',
    model: 'gpt-4o-mini',
  },
  {
    name: 'nvidia',
    fn: callNvidia,
    envKey: 'NVIDIA_API_KEY',
    model: 'meta/llama-3.3-70b-instruct',
  },
  {
    name: 'cohere',
    fn: callCohere,
    envKey: 'COHERE_API_KEY',
    model: 'command-r-plus',
  },
  {
    name: 'openrouter',
    fn: callOpenRouter,
    envKey: 'OPENROUTER_API_KEY',
    model: 'meta-llama/llama-3.3-70b-instruct',
  },
]

// Returns list of configured + available providers
function getAvailableProviders() {
  return FALLBACK_PROVIDERS.filter(p => {
    if (!process.env[p.envKey]) return false
    if (!isProviderAvailable(p.name)) {
      console.warn(`[AIRouter] ${p.name} circuit open — skipping`)
      return false
    }
    return true
  })
}

// Simple in-memory response cache for fail-safe mode (last 50 responses)
const responseCache = new Map()
const CACHE_MAX = 50
const CACHE_TTL = 30 * 60 * 1000

function cacheKey(messages) {
  const last = [...(messages || [])].reverse().find(m => m?.role === 'user')?.content || ''
  return last.slice(0, 100).trim()
}

function cacheGet(messages) {
  const k = cacheKey(messages)
  const entry = responseCache.get(k)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL) { responseCache.delete(k); return null }
  return entry.result
}

function cacheSet(messages, result) {
  const k = cacheKey(messages)
  if (responseCache.size >= CACHE_MAX) {
    const oldest = [...responseCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) responseCache.delete(oldest[0])
  }
  responseCache.set(k, { result, ts: Date.now() })
}

// ── Main router function ───────────────────────────────────────────
// Called AFTER Groq/DeepSeek/Ollama have all failed.
// Tries each configured fallback provider in order.
// Returns { content, model } or { content: null, model: null, cached: true } from cache.
export async function callAIRouter(messages, { max_tokens = 3000 } = {}) {
  const providers = getAvailableProviders()

  if (providers.length === 0) {
    console.warn('[AIRouter] No fallback providers configured or all circuits open')
    const cached = cacheGet(messages)
    if (cached) {
      console.log('[AIRouter] Serving cached response (fail-safe mode)')
      return { ...cached, cached: true }
    }
    return { content: null, model: null }
  }

  for (const provider of providers) {
    const t0 = Date.now()
    try {
      console.log(`[AIRouter] Trying ${provider.name} (${provider.model})...`)
      const result = await provider.fn(messages, { max_tokens, model: provider.model })

      if (result?.content && result.content.trim().length >= 5) {
        const latency = Date.now() - t0
        recordProviderSuccess(provider.name, latency)
        console.log(`[AIRouter] ✓ ${provider.name} responded in ${latency}ms`)
        cacheSet(messages, result)
        return result
      }

      // Empty response counts as failure
      recordProviderFailure(provider.name, 'empty response')
      console.warn(`[AIRouter] ${provider.name} returned empty — trying next`)

    } catch (err) {
      recordProviderFailure(provider.name, err.message)
      console.warn(`[AIRouter] ${provider.name} threw: ${err.message} — trying next`)
    }
  }

  // All providers failed — try cache as last resort
  const cached = cacheGet(messages)
  if (cached) {
    console.log('[AIRouter] All providers failed — serving cached response')
    return { ...cached, cached: true }
  }

  console.warn('[AIRouter] All providers exhausted — no response available')
  return { content: null, model: null }
}

// ── Provider availability check (for /api/ai-router/health) ───────
export function getProviderStatus() {
  return FALLBACK_PROVIDERS.map(p => ({
    name: p.name,
    configured: !!process.env[p.envKey],
    available: isProviderAvailable(p.name),
    model: p.model,
  }))
}
