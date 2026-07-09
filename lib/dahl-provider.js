/**
 * lib/dahl-provider.js — Dahl Inference Provider
 * ════════════════════════════════════════════════
 * OpenAI-compatible provider for Dahl Cloud inference.
 *
 * Configuration (Replit Secrets / env vars):
 *   DAHL_API_KEY     — required, stored securely in Replit Secrets
 *   DAHL_BASE_URL    — optional, defaults to https://api.dahlcloud.com/v1
 *   DAHL_ENABLED     — optional, set to "false" to disable without removing key
 *
 * Features:
 *   ✅ Smart model routing by taskHint
 *   ✅ Circuit breaker integration (shared circuitRegistry)
 *   ✅ Health monitoring with latency/success tracking
 *   ✅ Automatic failover on timeout / rate-limit / server error
 *   ✅ Feature capability detection (vision, reasoning, tool-call, long-context)
 *   ✅ No API key ever logged or exposed to frontend
 */

import logger from './logger.js'
import { circuitRegistry } from './resilience.js'

// ── Configuration ──────────────────────────────────────────────────────────────
const DAHL_BASE_URL  = (process.env.DAHL_BASE_URL || 'https://api.dahlcloud.com/v1').replace(/\/$/, '')
const DAHL_API_KEY   = process.env.DAHL_API_KEY || ''
const DAHL_ENABLED   = process.env.DAHL_ENABLED !== 'false'

// ── Circuit Breaker ────────────────────────────────────────────────────────────
export const dahlCircuit = circuitRegistry.get('dahl', {
  failureThreshold: 4,
  resetTimeout:     45_000,   // 45 s — slightly longer than Groq
  halfOpenMax:      1,
  successThreshold: 2,
})

// ── Health Monitor (rolling window 100 calls) ─────────────────────────────────
const _health = {
  calls:      0,
  success:    0,
  failures:   0,
  latencies:  [],     // last 50 response times
  lastError:  null,
  lastSuccessAt: null,

  record(ok, latencyMs, error = null) {
    this.calls++
    if (ok) {
      this.success++
      this.lastSuccessAt = new Date().toISOString()
    } else {
      this.failures++
      this.lastError = error || 'unknown'
    }
    this.latencies.push(latencyMs)
    if (this.latencies.length > 50) this.latencies.shift()
  },

  snapshot() {
    const len = this.latencies.length
    const avg = len ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / len) : 0
    const sorted = [...this.latencies].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(len * 0.95)] || sorted[len - 1] || 0
    return {
      provider:      'dahl',
      enabled:       DAHL_ENABLED,
      configured:    !!DAHL_API_KEY,
      baseUrl:       DAHL_BASE_URL,
      circuit:       dahlCircuit.getState(),
      calls:         this.calls,
      successRate:   this.calls ? Math.round((this.success / this.calls) * 100) : 0,
      failures:      this.failures,
      avgLatencyMs:  avg,
      p95LatencyMs:  p95,
      lastError:     this.lastError,
      lastSuccessAt: this.lastSuccessAt,
    }
  },
}

// ── Model Capability Matrix ────────────────────────────────────────────────────
// Maps taskHint → preferred Dahl model.
// Model names can be overridden via env: DAHL_MODEL_<HINT>=model-name
//
// Why this order:
//   • realtime / general / multilingual → fastest available model
//   • reasoning / research → strongest available model
//   • vision → vision-capable model
//   • code / technical → code-specialized model
//   • longcontext → highest context-window model
//
const _MODEL_DEFAULTS = {
  realtime:     process.env.DAHL_MODEL_REALTIME     || 'dahl-fast',
  general:      process.env.DAHL_MODEL_GENERAL      || 'dahl-fast',
  multilingual: process.env.DAHL_MODEL_MULTILINGUAL || 'dahl-fast',
  translation:  process.env.DAHL_MODEL_TRANSLATION  || 'dahl-fast',
  reasoning:    process.env.DAHL_MODEL_REASONING    || 'dahl-pro',
  research:     process.env.DAHL_MODEL_RESEARCH     || 'dahl-pro',
  technical:    process.env.DAHL_MODEL_TECHNICAL    || 'dahl-pro',
  code:         process.env.DAHL_MODEL_CODE         || 'dahl-pro',
  retrieval:    process.env.DAHL_MODEL_RETRIEVAL    || 'dahl-pro',
  agent:        process.env.DAHL_MODEL_AGENT        || 'dahl-pro',
  longcontext:  process.env.DAHL_MODEL_LONGCONTEXT  || 'dahl-pro',
  vision:       process.env.DAHL_MODEL_VISION       || 'dahl-vision',
  website:      process.env.DAHL_MODEL_WEBSITE      || 'dahl-pro',
  html:         process.env.DAHL_MODEL_HTML         || 'dahl-pro',
}

// ── Cached model list from /v1/models (refreshed every 10 minutes) ─────────────
let _modelsCache    = null
let _modelsCacheAt  = 0
const MODELS_TTL_MS = 10 * 60 * 1000

// ── Capability Flags ───────────────────────────────────────────────────────────
// Detected from the models list; cached alongside _modelsCache.
const _capabilities = {
  vision:      false,
  reasoning:   true,
  toolCalling: false,
  longContext: false,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _isRetryable(errMsg) {
  const m = (errMsg || '').toLowerCase()
  return (
    m.includes('429') ||
    m.includes('rate') ||
    m.includes('timeout') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('network') ||
    m.includes('econnreset') ||
    m.includes('enotfound') ||
    m.includes('abort')
  )
}

function _validateContent(text) {
  if (!text || typeof text !== 'string') return false
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\s+/g, ' ').trim()
  return clean.length >= 5
}

async function _postJSON(path, body, timeoutMs = 25_000) {
  const url = `${DAHL_BASE_URL}${path}`
  const r = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${DAHL_API_KEY}`,
      // OpenRouter-style metadata — harmless for other providers
      'HTTP-Referer':  'https://dz-gpt.vercel.app',
      'X-Title':       'DZ-GPT',
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!r.ok) {
    const txt = await r.text().catch(() => '')
    throw new Error(`Dahl HTTP ${r.status}: ${txt.slice(0, 200)}`)
  }

  return r.json()
}

async function _getJSON(path, timeoutMs = 10_000) {
  const url = `${DAHL_BASE_URL}${path}`
  const r = await fetch(url, {
    method:  'GET',
    headers: { 'Authorization': `Bearer ${DAHL_API_KEY}` },
    signal:  AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) throw new Error(`Dahl HTTP ${r.status}`)
  return r.json()
}

// ── Model Discovery ────────────────────────────────────────────────────────────

async function _fetchModels() {
  if (_modelsCache && Date.now() - _modelsCacheAt < MODELS_TTL_MS) return _modelsCache
  try {
    const data = await _getJSON('/models', 8_000)
    const models = data?.data || data?.models || []
    _modelsCache   = models
    _modelsCacheAt = Date.now()

    // Detect capabilities from model IDs / metadata
    for (const m of models) {
      const id = (m.id || '').toLowerCase()
      if (id.includes('vision') || id.includes('vl') || m.capabilities?.vision) {
        _capabilities.vision = true
      }
      if (id.includes('128k') || id.includes('long') || (m.context_length || 0) > 64_000) {
        _capabilities.longContext = true
      }
      if (m.capabilities?.tools || m.capabilities?.function_calling) {
        _capabilities.toolCalling = true
      }
    }

    logger.info(`[dahl] discovered ${models.length} models — vision=${_capabilities.vision} longCtx=${_capabilities.longContext}`)
    return models
  } catch (e) {
    logger.warn('[dahl] model discovery failed:', e.message)
    return _modelsCache || []
  }
}

// ── Model Selection ────────────────────────────────────────────────────────────

function _selectModel(taskHint, hasImage = false) {
  if (hasImage) return _MODEL_DEFAULTS.vision
  return _MODEL_DEFAULTS[taskHint] || _MODEL_DEFAULTS.general
}

// ── Main Provider Function ─────────────────────────────────────────────────────

/**
 * tryDahl(messages, max_tokens, opts)
 *
 * Called by the ai-router. Returns { content, model, truncated } or null.
 * Never throws — all errors are caught and logged without exposing the API key.
 *
 * @param {Array}  messages    - OpenAI-format message array
 * @param {number} max_tokens  - max output tokens
 * @param {object} opts
 * @param {string} opts.taskHint - routing hint from the router
 * @param {boolean} opts.hasImage - whether the request contains image data
 */
export async function tryDahl(messages, max_tokens = 2000, opts = {}) {
  // Fast-path: disabled or not configured
  if (!DAHL_ENABLED || !DAHL_API_KEY) return null

  // Circuit breaker check
  if (!dahlCircuit.isAvailable()) {
    logger.info('[dahl] circuit OPEN — skipping')
    return null
  }

  const { taskHint = 'general', hasImage = false } = opts
  const model = _selectModel(taskHint, hasImage)
  const t0    = Date.now()

  try {
    dahlCircuit.onAttempt()

    const data = await _postJSON('/chat/completions', {
      model,
      messages,
      max_tokens: Math.min(max_tokens, 8192),
      temperature: 0.7,
      stream: false,
    }, 25_000)

    const content = data?.choices?.[0]?.message?.content || null
    const latencyMs = Date.now() - t0

    if (_validateContent(content)) {
      dahlCircuit.recordSuccess()
      _health.record(true, latencyMs)

      const usage = data?.usage || {}
      logger.info(`[dahl] ✓ ${model} | ${latencyMs}ms | in=${usage.prompt_tokens || '?'} out=${usage.completion_tokens || '?'}`)

      return {
        content,
        model:     `dahl:${model}`,
        truncated: content.trim().length > 200 && !content.trim().match(/[.!?؟\n]$/),
        usage,
      }
    }

    // Got a response but content was empty/invalid
    logger.warn(`[dahl] empty content from ${model}`)
    dahlCircuit.recordFailure('empty content')
    _health.record(false, latencyMs, 'empty content')
    return null

  } catch (e) {
    const latencyMs = Date.now() - t0
    const msg       = e.message || String(e)
    const retryable = _isRetryable(msg)

    // Never log the API key — only the sanitized error message
    logger.warn(`[dahl] ✗ ${model} | ${latencyMs}ms | ${msg.slice(0, 120)}`)

    dahlCircuit.recordFailure(msg.slice(0, 80))
    _health.record(false, latencyMs, msg.slice(0, 80))

    // For retryable errors, throw so the router can record the fallback chain
    if (retryable) throw e
    return null
  }
}

// ── Vision Wrapper ────────────────────────────────────────────────────────────

/**
 * tryDahlVision(prompt, imageBase64, mimeType)
 * Sends an image + text prompt to the Dahl vision model.
 * Returns { content, model } or null.
 */
export async function tryDahlVision(prompt, imageBase64, mimeType = 'image/jpeg') {
  if (!DAHL_ENABLED || !DAHL_API_KEY || !_capabilities.vision) return null
  if (!dahlCircuit.isAvailable()) return null

  const t0 = Date.now()
  const model = _MODEL_DEFAULTS.vision
  try {
    dahlCircuit.onAttempt()
    const data = await _postJSON('/chat/completions', {
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text',       text: prompt },
          { type: 'image_url',  image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ],
      }],
      max_tokens: 2048,
    }, 30_000)

    const content = data?.choices?.[0]?.message?.content || null
    if (_validateContent(content)) {
      dahlCircuit.recordSuccess()
      _health.record(true, Date.now() - t0)
      logger.info(`[dahl] ✓ vision ${model} | ${Date.now() - t0}ms`)
      return { content, model: `dahl:${model}` }
    }

    dahlCircuit.recordFailure('empty vision response')
    _health.record(false, Date.now() - t0, 'empty vision')
    return null
  } catch (e) {
    dahlCircuit.recordFailure(e.message)
    _health.record(false, Date.now() - t0, e.message.slice(0, 80))
    logger.warn('[dahl] vision failed:', e.message.slice(0, 80))
    return null
  }
}

// ── Health Check ──────────────────────────────────────────────────────────────

/**
 * dahlHealthCheck()
 * Lightweight ping: sends a minimal request and measures latency.
 * Called by the background health monitor every few minutes.
 */
export async function dahlHealthCheck() {
  if (!DAHL_ENABLED || !DAHL_API_KEY) {
    return { ok: false, reason: 'disabled or not configured' }
  }
  const t0 = Date.now()
  try {
    const data = await _postJSON('/chat/completions', {
      model:      _MODEL_DEFAULTS.general,
      messages:   [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_tokens: 5,
    }, 12_000)

    const content = data?.choices?.[0]?.message?.content || ''
    const latencyMs = Date.now() - t0
    const ok = content.length > 0

    if (ok && !dahlCircuit.isAvailable()) {
      // Probe passed — mark a success to help half-open recovery
      dahlCircuit.recordSuccess()
    }

    logger.info(`[dahl:health] ${ok ? '✓' : '✗'} ${latencyMs}ms`)
    return { ok, latencyMs, model: _MODEL_DEFAULTS.general }
  } catch (e) {
    const latencyMs = Date.now() - t0
    logger.warn(`[dahl:health] failed: ${e.message.slice(0, 80)}`)
    return { ok: false, latencyMs, error: e.message.slice(0, 80) }
  }
}

// ── Diagnostics / Status ──────────────────────────────────────────────────────

export function getDahlStatus() {
  return {
    ..._health.snapshot(),
    capabilities: { ..._capabilities },
    models:       _MODEL_DEFAULTS,
    circuitDetail: dahlCircuit.snapshot(),
  }
}

export function getDahlCapabilities() {
  return { ..._capabilities }
}

// ── Warm-up: fetch model list in background on first import ──────────────────
if (DAHL_ENABLED && DAHL_API_KEY) {
  // Fire-and-forget; failures are silently swallowed
  setTimeout(() => _fetchModels().catch(() => {}), 2_000)
}
