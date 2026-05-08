/**
 * DZ Agent V5 — Intelligent Model Router
 * Routes tasks to the best available AI model based on type, latency, and capability.
 * Extends the existing Groq/DeepSeek/Ollama infrastructure.
 */

const MODEL_PROFILES = {
  // Speed-optimized (Groq)
  'llama-3.3-70b-versatile': { provider: 'groq', strength: ['general', 'reasoning', 'coding'], speed: 9, quality: 8 },
  'llama-3.1-8b-instant': { provider: 'groq', strength: ['simple', 'fast'], speed: 10, quality: 6 },
  'gemma2-9b-it': { provider: 'groq', strength: ['analysis', 'structured'], speed: 9, quality: 7 },
  'qwen-qwq-32b': { provider: 'groq', strength: ['reasoning', 'math', 'planning'], speed: 7, quality: 9 },
  // Quality-optimized
  'deepseek-chat': { provider: 'deepseek', strength: ['coding', 'analysis', 'math'], speed: 5, quality: 9 },
  'deepseek-reasoner': { provider: 'deepseek', strength: ['complex-reasoning', 'math', 'planning'], speed: 3, quality: 10 },
  // Multimodal
  'gemini-2.0-flash': { provider: 'google', strength: ['multimodal', 'vision', 'fast'], speed: 8, quality: 8 },
}

const TASK_TYPE_PREFERENCES = {
  coding: ['deepseek-chat', 'llama-3.3-70b-versatile', 'qwen-qwq-32b'],
  reasoning: ['qwen-qwq-32b', 'deepseek-reasoner', 'llama-3.3-70b-versatile'],
  planning: ['llama-3.3-70b-versatile', 'qwen-qwq-32b', 'deepseek-chat'],
  research: ['llama-3.3-70b-versatile', 'gemma2-9b-it', 'deepseek-chat'],
  analysis: ['deepseek-chat', 'llama-3.3-70b-versatile', 'gemma2-9b-it'],
  fast: ['llama-3.1-8b-instant', 'gemma2-9b-it', 'llama-3.3-70b-versatile'],
  vision: ['gemini-2.0-flash', 'llama-3.3-70b-versatile'],
  general: ['llama-3.3-70b-versatile', 'gemma2-9b-it', 'deepseek-chat'],
}

export class ModelRouter {
  constructor() {
    this.latencyHistory = new Map() // model → [latency_ms, ...]
    this.errorHistory = new Map()   // model → error_count
    this.lastUsed = new Map()       // model → timestamp (for rotation)
  }

  // ── Select best model for task ─────────────────────────────────────────
  selectModel(taskType = 'general', priority = 'balanced') {
    const preferences = TASK_TYPE_PREFERENCES[taskType] || TASK_TYPE_PREFERENCES.general
    const available = preferences.filter(m => !this._isCircuitOpen(m))

    if (available.length === 0) return preferences[0] // fallback even if circuit open

    if (priority === 'speed') {
      return available.sort((a, b) => {
        const pa = MODEL_PROFILES[a] || {}
        const pb = MODEL_PROFILES[b] || {}
        return (pb.speed || 5) - (pa.speed || 5)
      })[0]
    }

    if (priority === 'quality') {
      return available.sort((a, b) => {
        const pa = MODEL_PROFILES[a] || {}
        const pb = MODEL_PROFILES[b] || {}
        return (pb.quality || 5) - (pa.quality || 5)
      })[0]
    }

    // Balanced: score by quality * latency_factor * error_penalty
    return available.sort((a, b) => this._score(b) - this._score(a))[0]
  }

  // ── Detect task type from content ─────────────────────────────────────
  detectTaskType(text) {
    const lower = text.toLowerCase()
    if (/code|program|function|class|bug|error|implement|typescript|javascript|python|api/.test(lower)) return 'coding'
    if (/reason|why|how|explain|analyze|understand|think/.test(lower)) return 'reasoning'
    if (/plan|strategy|steps|roadmap|design|architect/.test(lower)) return 'planning'
    if (/search|find|research|look up|what is|who is|when/.test(lower)) return 'research'
    if (/image|photo|vision|screenshot|visual/.test(lower)) return 'vision'
    if (/quick|simple|yes|no|short/.test(lower)) return 'fast'
    return 'general'
  }

  // ── Record latency for adaptive routing ───────────────────────────────
  recordLatency(model, ms) {
    const history = this.latencyHistory.get(model) || []
    history.push(ms)
    if (history.length > 10) history.shift()
    this.latencyHistory.set(model, history)
  }

  recordError(model) {
    this.errorHistory.set(model, (this.errorHistory.get(model) || 0) + 1)
  }

  recordSuccess(model) {
    // Decay error count on success
    const current = this.errorHistory.get(model) || 0
    if (current > 0) this.errorHistory.set(model, Math.max(0, current - 1))
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  stats() {
    return Object.keys(MODEL_PROFILES).map(model => ({
      model,
      ...MODEL_PROFILES[model],
      avgLatency: this._avgLatency(model),
      errors: this.errorHistory.get(model) || 0,
      circuitOpen: this._isCircuitOpen(model),
    }))
  }

  // ── Private ───────────────────────────────────────────────────────────
  _avgLatency(model) {
    const history = this.latencyHistory.get(model) || []
    if (history.length === 0) return null
    return Math.round(history.reduce((a, b) => a + b, 0) / history.length)
  }

  _score(model) {
    const profile = MODEL_PROFILES[model] || {}
    const quality = profile.quality || 5
    const speed = profile.speed || 5
    const errors = this.errorHistory.get(model) || 0
    const latency = this._avgLatency(model) || 2000
    const latencyScore = Math.max(0, 10 - latency / 500)
    return (quality * 0.5) + (speed * 0.3) + (latencyScore * 0.2) - (errors * 2)
  }

  _isCircuitOpen(model) {
    const errors = this.errorHistory.get(model) || 0
    return errors >= 5 // circuit opens after 5 consecutive errors
  }
}

// Singleton
let _routerInstance = null
export function getRouter() {
  if (!_routerInstance) _routerInstance = new ModelRouter()
  return _routerInstance
}
