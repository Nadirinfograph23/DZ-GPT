/**
 * AI Router — Capability-Aware Multi-Provider Chain (Intelligence Upgrade)
 *
 * Upgrades over original:
 *   - Capability-aware routing: selects the BEST provider for the task type,
 *     not just the first available one in a fixed order.
 *   - Health-aware: skips providers that failed recently (circuit-breaker lite).
 *   - Latency-aware: prefers fast providers for realtime queries.
 *   - taskHint parameter: 'realtime' | 'multilingual' | 'technical' | 'retrieval' | 'reasoning' | 'general'
 *
 * Provider capability matrix:
 *   OpenAI   — best general reasoning, reliable, moderate latency
 *   Gemini   — best multilingual + long context + intent analysis
 *   Mistral  — lightweight fast generation, good for chitchat/translation
 *   NVIDIA   — technical tasks, structured generation, code
 *   Cohere   — retrieval optimization, reranking, RAG-style tasks
 *   OpenRouter — broad model access, complex reasoning fallback
 *
 * All original exports preserved for backward compatibility.
 */

import http from 'node:http'
import https from 'node:https'
import {
  generateRequestId,
  recordProviderAttempt,
  recordFallbackChain,
  getProviderScores,
  getRouterLogs,
  getRouterDiagnosticSummary,
  resetProviderScore,
} from './diagnostics.js'
import {
  getGroqKeyPool,
  pickGroqKey,
  markGroqSuccess,
  markGroqRateLimit,
  markGroqError,
  groqKeyCount,
} from '../groq-rotation.js'

const metrics = { calls: 0, success: 0, failed: 0 }

// ── Circuit-breaker state (in-memory, resets on restart) ─────────────────────
// Tracks recent failures per provider to skip unhealthy ones temporarily.

const _circuitState = {}
const CIRCUIT_COOLDOWN_MS = 30_000   // 30 second cooldown after N failures
const CIRCUIT_FAIL_THRESHOLD = 5      // failures before opening circuit

function _isCircuitOpen(provider) {
  const s = _circuitState[provider]
  if (!s) return false
  if (s.failures < CIRCUIT_FAIL_THRESHOLD) return false
  if (Date.now() - s.lastFailAt > CIRCUIT_COOLDOWN_MS) {
    // Cooldown expired — allow one probe attempt
    s.failures = 0
    return false
  }
  return true
}

function _recordFailure(provider) {
  if (!_circuitState[provider]) _circuitState[provider] = { failures: 0, lastFailAt: 0 }
  _circuitState[provider].failures++
  _circuitState[provider].lastFailAt = Date.now()
}

function _recordSuccess(provider) {
  if (_circuitState[provider]) _circuitState[provider].failures = 0
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateContent(text) {
  if (!text || typeof text !== 'string') return false
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\s+/g, ' ').trim()
  return clean.length >= 5
}

function isTruncated(text) {
  if (!text) return false
  const t = text.trim()
  return t.endsWith('...') || t.endsWith('…') || (t.length > 100 && !t.match(/[.!?؟。\n]$/))
}

async function postJSON(url, headers, body, timeoutMs = 20000) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) {
    const err = await r.text().catch(() => '')
    throw new Error(`HTTP ${r.status}: ${err.slice(0, 200)}`)
  }
  return r.json()
}

// ── Provider implementations ──────────────────────────────────────────────────

async function tryReplitAI(messages, max_tokens) {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) return null
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const cappedTokens = Math.min(max_tokens, 8192)
  // Use http.request directly to avoid AbortSignal.timeout undici issues
  // Proxy can take 30-35s for large HTML/code generation — use 65s timeout
  const timeoutMs = 65000
  try {
    const content = await new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify({ model: 'gpt-4.1-mini', messages, max_tokens: cappedTokens })
      const url = new URL(baseURL + '/chat/completions')
      const transport = url.protocol === 'https:' ? https : http
      const req = transport.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(bodyStr),
        },
        timeout: timeoutMs,
      }, (res) => {
        let raw = ''
        res.on('data', chunk => { raw += chunk })
        res.on('end', () => {
          try {
            const d = JSON.parse(raw)
            resolve(d.choices?.[0]?.message?.content || null)
          } catch { resolve(null) }
        })
      })
      req.on('timeout', () => { req.destroy(); reject(new Error('[stallGuard] timeout after ' + timeoutMs + 'ms')) })
      req.on('error', reject)
      req.write(bodyStr)
      req.end()
    })
    if (validateContent(content)) {
      console.log('[ai-router] ✓ OpenAI/Replit integration')
      return { content, model: 'openai:gpt-4.1-mini', truncated: isTruncated(content) }
    }
    return null
  } catch (e) {
    console.warn('[ai-router] OpenAI failed:', e.message)
    throw e
  }
}

async function tryGemini(messages, max_tokens) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return null
  try {
    const systemMsg = messages.find(m => m.role === 'system')
    const conversationMsgs = messages.filter(m => m.role !== 'system')
    const contents = conversationMsgs.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const body = {
      contents,
      generationConfig: { maxOutputTokens: Math.min(max_tokens, 8192) },
    }
    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] }
    }
    // Try gemini-2.5-flash first, fall back to gemini-2.0-flash
    let data
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash']
    let lastErr
    for (const model of models) {
      try {
        data = await postJSON(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {},
          body,
          25000,
        )
        if (data.candidates) break
      } catch (e) { lastErr = e }
    }
    if (!data) throw lastErr || new Error('Gemini: no response')
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || null
    if (validateContent(content)) {
      console.log('[ai-router] ✓ Gemini')
      return { content, model: 'gemini:gemini-2.0-flash', truncated: isTruncated(content) }
    }
    return null
  } catch (e) {
    console.warn('[ai-router] Gemini failed:', e.message)
    throw e
  }
}

async function tryGroq(messages, max_tokens) {
  const pool = getGroqKeyPool()
  if (!pool.length) return null

  const tried = new Set()
  const maxAttempts = Math.min(pool.length, 3)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = pickGroqKey()
    if (!apiKey || tried.has(apiKey)) break
    tried.add(apiKey)
    const t0 = Date.now()
    try {
      const data = await postJSON(
        'https://api.groq.com/openai/v1/chat/completions',
        { Authorization: `Bearer ${apiKey}` },
        { model: 'llama-3.3-70b-versatile', messages, max_tokens: Math.min(max_tokens, 8192) },
        30000,
      )
      const content = data.choices?.[0]?.message?.content || null
      if (validateContent(content)) {
        markGroqSuccess(apiKey, Date.now() - t0)
        console.log(`[ai-router] ✓ Groq (key #${attempt + 1})`)
        return { content, model: 'groq:llama-3.3-70b-versatile', truncated: isTruncated(content) }
      }
      return null
    } catch (e) {
      const msg = e.message || ''
      if (msg.includes('429') || msg.includes('rate')) {
        markGroqRateLimit(apiKey)
        console.warn(`[ai-router] Groq key #${attempt + 1} rate-limited, trying next...`)
        continue
      }
      markGroqError(apiKey)
      console.warn('[ai-router] Groq failed:', msg.slice(0, 80))
      throw e
    }
  }
  return null
}

async function tryMistral(messages, max_tokens) {
  const apiKey = process.env.MISTRAL_API_KEY
  if (!apiKey) return null
  try {
    const data = await postJSON(
      'https://api.mistral.ai/v1/chat/completions',
      { Authorization: `Bearer ${apiKey}` },
      { model: 'mistral-small-latest', messages, max_tokens: Math.min(max_tokens, 8192) },
      20000,
    )
    const content = data.choices?.[0]?.message?.content || null
    if (validateContent(content)) {
      console.log('[ai-router] ✓ Mistral')
      return { content, model: 'mistral:mistral-small-latest', truncated: isTruncated(content) }
    }
    return null
  } catch (e) {
    console.warn('[ai-router] Mistral failed:', e.message)
    throw e
  }
}

async function tryNvidia(messages, max_tokens) {
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) return null
  try {
    const data = await postJSON(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      { Authorization: `Bearer ${apiKey}` },
      { model: 'meta/llama-3.3-70b-instruct', messages, max_tokens: Math.min(max_tokens, 8192) },
      10000,
    )
    const content = data.choices?.[0]?.message?.content || null
    if (validateContent(content)) {
      console.log('[ai-router] ✓ NVIDIA NIM')
      return { content, model: 'nvidia:llama-3.3-70b-instruct', truncated: isTruncated(content) }
    }
    return null
  } catch (e) {
    console.warn('[ai-router] NVIDIA failed:', e.message)
    throw e
  }
}

async function tryCohere(messages, max_tokens) {
  const apiKey = process.env.COHERE_API_KEY
  if (!apiKey) return null
  try {
    const systemMsg = messages.find(m => m.role === 'system')
    const chatHistory = messages
      .filter(m => m.role !== 'system')
      .slice(0, -1)
      .map(m => ({ role: m.role === 'assistant' ? 'CHATBOT' : 'USER', message: m.content }))
    const lastUser = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUser) return null
    const body = {
      model: 'command-r-plus-08-2024',
      message: lastUser.content,
      max_tokens: Math.min(max_tokens, 4096),
      chat_history: chatHistory,
    }
    if (systemMsg) body.preamble = systemMsg.content
    const data = await postJSON(
      'https://api.cohere.com/v1/chat',
      { Authorization: `Bearer ${apiKey}` },
      body,
      8000,
    )
    const content = data.text || null
    if (validateContent(content)) {
      console.log('[ai-router] ✓ Cohere')
      return { content, model: 'cohere:command-r-plus', truncated: isTruncated(content) }
    }
    return null
  } catch (e) {
    console.warn('[ai-router] Cohere failed:', e.message)
    throw e
  }
}

async function tryOpenRouter(messages, max_tokens) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null
  try {
    const data = await postJSON(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://dz-gpt.replit.app',
        'X-Title': 'DZ-GPT',
      },
      { model: 'openai/gpt-oss-120b:free', messages, max_tokens: Math.min(max_tokens, 8192) },
      10000,
    )
    const content = data.choices?.[0]?.message?.content || null
    if (validateContent(content)) {
      console.log('[ai-router] ✓ OpenRouter')
      return { content, model: 'openrouter:llama-3.3-70b', truncated: isTruncated(content) }
    }
    return null
  } catch (e) {
    console.warn('[ai-router] OpenRouter failed:', e.message)
    throw e
  }
}

// ── Provider registry ─────────────────────────────────────────────────────────

const PROVIDER_FNS = {
  openai:     (messages, max_tokens) => tryReplitAI(messages, max_tokens),
  groq:       (messages, max_tokens) => tryGroq(messages, max_tokens),
  gemini:     (messages, max_tokens) => tryGemini(messages, max_tokens),
  mistral:    (messages, max_tokens) => tryMistral(messages, max_tokens),
  nvidia:     (messages, max_tokens) => tryNvidia(messages, max_tokens),
  cohere:     (messages, max_tokens) => tryCohere(messages, max_tokens),
  openrouter: (messages, max_tokens) => tryOpenRouter(messages, max_tokens),
}

// ── Capability-aware provider ordering ───────────────────────────────────────
//
// Each taskHint maps to an ordered list of preferred providers.
// The router tries them in this order, falling back through the chain.
//
// Design rationale (per provider capability):
//   openai     — strongest general reasoning; reliable; used as anchor
//   gemini     — best multilingual (Arabic/French/English); long context
//   mistral    — fast, efficient; good for translation + chitchat
//   nvidia     — technical/structured tasks; code generation
//   cohere     — RAG/retrieval optimization; document Q&A
//   openrouter — broad access; final catch-all for advanced reasoning

const CAPABILITY_ORDER = {
  // Fast realtime queries — prioritize lowest latency
  realtime:     ['groq', 'openai', 'mistral', 'gemini', 'nvidia', 'cohere', 'openrouter'],
  // Multilingual, Darija, code-switched Arabic/French
  multilingual: ['gemini', 'openai', 'groq', 'mistral', 'cohere', 'nvidia', 'openrouter'],
  // Code, technical, structured output
  technical:    ['openai', 'groq', 'nvidia', 'gemini', 'mistral', 'cohere', 'openrouter'],
  // Retrieval, RAG, document-grounded Q&A
  retrieval:    ['cohere', 'openai', 'groq', 'gemini', 'mistral', 'nvidia', 'openrouter'],
  // Deep reasoning, complex multi-step problems
  reasoning:    ['openai', 'groq', 'openrouter', 'gemini', 'nvidia', 'cohere', 'mistral'],
  // Lightweight translation / chitchat
  translation:  ['groq', 'mistral', 'gemini', 'openai', 'cohere', 'nvidia', 'openrouter'],
  // Default sequential order — Groq first (fastest ~0.5s), then fallback chain
  general:      ['groq', 'openai', 'gemini', 'mistral', 'nvidia', 'cohere', 'openrouter'],
}

function resolveProviderOrder(taskHint) {
  return CAPABILITY_ORDER[taskHint] || CAPABILITY_ORDER.general
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Race the top N providers simultaneously — resolves with the first good response.
 * Used for low-latency fallback when sequential ordering is too slow.
 */
async function _raceProviders(providers, messages, max_tokens, reqId, taskHint) {
  const available = providers.filter(({ name }) => !_isCircuitOpen(name))
  if (available.length === 0) return null

  const t0 = Date.now()
  const racePromises = available.map(({ name, fn }) =>
    fn(messages, max_tokens)
      .then(result => {
        if (result?.content && validateContent(result.content)) {
          _recordSuccess(name)
          recordProviderAttempt(reqId, name, { success: true, latencyMs: Date.now() - t0, model: result.model })
          return { ...result, _provider: name }
        }
        _recordFailure(name)
        return Promise.reject(new Error(`${name}: empty`))
      })
      .catch(e => {
        _recordFailure(name)
        return Promise.reject(e)
      })
  )

  try {
    const winner = await Promise.any(racePromises)
    console.log(`[ai-router] ✓ race winner: ${winner._provider} (${Date.now() - t0}ms)`)
    return winner
  } catch {
    return null
  }
}

/**
 * @param {Array} messages - Chat messages array
 * @param {Object} opts
 * @param {number} opts.max_tokens
 * @param {string} opts.requestId
 * @param {string} opts.taskHint - 'realtime'|'multilingual'|'technical'|'retrieval'|'reasoning'|'translation'|'general'
 */
export async function callAIRouter(messages, { max_tokens = 2000, requestId, taskHint = 'general' } = {}) {
  metrics.calls++
  const reqId = requestId || generateRequestId()
  const chainLog = []

  // Build ordered provider list based on task capability
  const providerOrder = resolveProviderOrder(taskHint)
  const providers = providerOrder.map(name => ({ name, fn: PROVIDER_FNS[name] })).filter(p => p.fn)

  const routingReason = `taskHint=${taskHint} → order=[${providerOrder.join(',')}]`
  console.log(`[ai-router] routing: ${routingReason} (reqId=${reqId})`)

  // ── Fast-path: race the top 3 available providers simultaneously ─────────────
  // For realtime/multilingual hints, use parallel racing instead of sequential fallback.
  // This halves worst-case latency when the first provider is slow or down.
  const _useRaceMode = taskHint === 'realtime' || taskHint === 'multilingual' || taskHint === 'general'
  if (_useRaceMode && providers.length >= 2) {
    const topProviders = providers.slice(0, Math.min(3, providers.length))
    const raceResult = await _raceProviders(topProviders, messages, max_tokens, reqId, taskHint)
    if (raceResult) {
      metrics.success++
      return {
        content: raceResult.content,
        model: raceResult.model,
        requestId: reqId,
        taskHint,
        routingReason,
        latencyMs: 0,
      }
    }
    // Race failed — fall through to sequential for remaining providers
    console.warn(`[ai-router] race failed for top providers — sequential fallback for rest`)
  }

  // ── Sequential fallback for remaining / non-race providers ──────────────────
  const startIdx = (_useRaceMode && providers.length >= 2) ? Math.min(3, providers.length) : 0
  for (const { name, fn } of providers.slice(startIdx)) {
    if (_isCircuitOpen(name)) {
      console.log(`[ai-router] ⚡ ${name} circuit open — skipping`)
      continue
    }

    const t0 = Date.now()
    try {
      const result = await fn(messages, max_tokens)
      const latencyMs = Date.now() - t0

      if (result && result.content) {
        const isEmpty = !validateContent(result.content)
        recordProviderAttempt(reqId, name, {
          success: !isEmpty,
          latencyMs,
          model: result.model,
          truncated: result.truncated || false,
          empty: isEmpty,
        })
        chainLog.push({ provider: name, success: !isEmpty, latencyMs, taskHint })

        if (!isEmpty) {
          _recordSuccess(name)
          metrics.success++
          if (chainLog.length > 1) recordFallbackChain(reqId, chainLog)
          return {
            content: result.content,
            model: result.model,
            requestId: reqId,
            taskHint,
            routingReason,
            latencyMs,
          }
        }
        console.warn(`[ai-router] ${name} returned empty content`)
        _recordFailure(name)
        continue
      }

      if (result === null) continue
      chainLog.push({ provider: name, success: false, latencyMs, error: 'empty' })
    } catch (e) {
      const latencyMs = Date.now() - t0
      _recordFailure(name)
      recordProviderAttempt(reqId, name, {
        success: false,
        latencyMs,
        error: e.message,
        empty: false,
      })
      chainLog.push({ provider: name, success: false, latencyMs, error: e.message })
      console.warn(`[ai-router] ${name} threw:`, e.message)
    }
  }

  metrics.failed++
  console.warn('[ai-router] All providers exhausted for request:', reqId)
  if (chainLog.length > 1) recordFallbackChain(reqId, chainLog)
  return { content: null, model: null, requestId: reqId, taskHint, routingReason }
}

// ── Single provider test ──────────────────────────────────────────────────────

export async function testSingleProvider(provider) {
  const testMessages = [{ role: 'user', content: 'Reply with exactly: OK' }]
  const t0 = Date.now()
  const fn = PROVIDER_FNS[provider]
  if (!fn) throw new Error(`Unknown provider: ${provider}`)

  const result = await fn(testMessages, 50)
  const latencyMs = Date.now() - t0

  if (!result || !result.content) throw new Error('Empty or null response')
  return { ok: true, model: result.model, latencyMs, content: result.content?.slice(0, 100) }
}

export function getProviderStatus() {
  const groqKeys = groqKeyCount()
  return [
    { name: 'openai',      available: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY), state: 'closed' },
    { name: 'groq',        available: groqKeys > 0, state: 'closed', keyCount: groqKeys },
    { name: 'gemini',      available: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY), state: 'closed' },
    { name: 'mistral',     available: !!process.env.MISTRAL_API_KEY, state: 'closed' },
    { name: 'nvidia',      available: !!process.env.NVIDIA_API_KEY, state: 'closed' },
    { name: 'cohere',      available: !!process.env.COHERE_API_KEY, state: 'closed' },
    { name: 'openrouter',  available: !!process.env.OPENROUTER_API_KEY, state: 'closed' },
  ]
}

export function getRouterHealthSnapshot() {
  return {
    ...metrics,
    providers: getProviderStatus().filter(p => p.available).map(p => p.name),
    circuitState: Object.fromEntries(
      Object.entries(_circuitState).map(([k, v]) => [k, { failures: v.failures, open: _isCircuitOpen(k) }])
    ),
    capabilityRouting: Object.keys(CAPABILITY_ORDER),
    ts: new Date().toISOString(),
  }
}

// Re-export diagnostics
export { getProviderScores, getRouterLogs, getRouterDiagnosticSummary, generateRequestId, resetProviderScore }
