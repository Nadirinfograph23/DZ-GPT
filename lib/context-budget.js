/**
 * lib/context-budget.js — DZ Agent Context Budget Manager
 * ═════════════════════════════════════════════════════════
 * يدير "ميزانية tokens" لكل طلب لمنع:
 *   - تجاوز حد السياق
 *   - حشو المحادثة بمعلومات غير ذات صلة
 *   - تكرار الاستدلال
 *
 * المبدأ:
 *   Only load relevant context.
 *   Reduce token usage.
 *   Cache previous results.
 *   Prevent duplicated reasoning.
 */

import { queryCache, makeKey } from './cache.js'
import logger from './logger.js'

const log = logger.child('ctx-budget')

// ══════════════════════════════════════════════════════════════════════════════
// Token estimator — rough but fast (no tiktoken dependency)
// Rule: ~4 chars ≈ 1 token (English/code), ~3 chars ≈ 1 token (Arabic)
// ══════════════════════════════════════════════════════════════════════════════
const ARABIC_RE = /[\u0600-\u06FF]/

export function estimateTokens(text = '') {
  if (!text) return 0
  const isArabic = ARABIC_RE.test(text)
  return Math.ceil(text.length / (isArabic ? 3 : 4))
}

export function estimateMessagesTokens(messages = []) {
  return messages.reduce((sum, m) => {
    return sum + estimateTokens(m.content || '') + 4 // role overhead
  }, 3) // base overhead
}

// ══════════════════════════════════════════════════════════════════════════════
// ContextBudget — manages token budget for one request
// ══════════════════════════════════════════════════════════════════════════════
export class ContextBudget {
  /**
   * @param {object} opts
   * @param {number} opts.maxTokens      - hard limit (default 6000)
   * @param {number} opts.systemReserve  - tokens reserved for system prompt (default 800)
   * @param {number} opts.outputReserve  - tokens reserved for model output (default 1200)
   * @param {string} opts.intent         - current detected intent (for priority loading)
   */
  constructor({
    maxTokens     = 6000,
    systemReserve = 800,
    outputReserve = 1200,
    intent        = 'UNKNOWN',
  } = {}) {
    this.maxTokens     = maxTokens
    this.systemReserve = systemReserve
    this.outputReserve = outputReserve
    this.intent        = intent

    this._used = systemReserve // system prompt already consumes budget
    this._items = []           // loaded context items in priority order
  }

  /** Available tokens for context */
  get available() {
    return this.maxTokens - this._used - this.outputReserve
  }

  /** Total tokens used so far */
  get used() { return this._used }

  /**
   * Try to add a context item.
   * Returns true if added, false if budget exhausted.
   * @param {object} item
   * @param {string}  item.content   - text content
   * @param {string}  item.label     - human label (for debugging)
   * @param {number}  [item.priority] - 1=critical, 5=optional (default 3)
   * @param {boolean} [item.required] - if true, always include (truncate if needed)
   */
  add(item) {
    const { content = '', label = 'ctx', priority = 3, required = false } = item
    const tokens = estimateTokens(content)

    if (tokens === 0) return true

    if (tokens <= this.available) {
      this._items.push({ ...item, tokens, added: true })
      this._used += tokens
      return true
    }

    if (required) {
      // Truncate to fit
      const maxChars = Math.max(0, this.available * 3.5) | 0
      const truncated = content.slice(0, maxChars) + (maxChars < content.length ? '…' : '')
      const truncatedTokens = estimateTokens(truncated)
      this._items.push({ ...item, content: truncated, tokens: truncatedTokens, added: true, truncated: true })
      this._used += truncatedTokens
      log.warn(`[${label}] Context truncated: ${tokens}→${truncatedTokens} tokens (budget exhausted)`)
      return true
    }

    log.debug(`[${label}] Skipped (budget): ${tokens} tokens needed, ${this.available} available`)
    this._items.push({ ...item, tokens, added: false, reason: 'budget_exhausted' })
    return false
  }

  /**
   * Add multiple items sorted by priority (1=critical first)
   */
  addAll(items = []) {
    const sorted = [...items].sort((a, b) => (a.priority || 3) - (b.priority || 3))
    return sorted.map(item => this.add(item))
  }

  /**
   * Build final context string from added items
   * @param {string} [separator] - separator between items
   */
  build(separator = '\n\n') {
    return this._items
      .filter(i => i.added)
      .map(i => i.content)
      .join(separator)
  }

  /**
   * Build messages array for chat completions
   * @param {string}    systemPrompt
   * @param {Array}     history        - previous messages
   * @param {string}    userQuery
   */
  buildMessages(systemPrompt = '', history = [], userQuery = '') {
    const messages = []

    // 1. System prompt (always first)
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    // 2. Context block (agent results, search results, etc.)
    const ctxBlock = this.build()
    if (ctxBlock) {
      messages.push({ role: 'system', content: `## Context\n${ctxBlock}` })
    }

    // 3. Trim history to fit remaining budget
    const historyBudget = Math.floor(this.available * 0.4)
    const trimmedHistory = trimHistory(history, historyBudget)
    messages.push(...trimmedHistory)

    // 4. Current user query
    if (userQuery) {
      messages.push({ role: 'user', content: userQuery })
    }

    return messages
  }

  /** Diagnostics */
  stats() {
    return {
      intent:        this.intent,
      maxTokens:     this.maxTokens,
      used:          this._used,
      available:     this.available,
      outputReserve: this.outputReserve,
      items:         this._items.length,
      itemsAdded:    this._items.filter(i => i.added).length,
      itemsSkipped:  this._items.filter(i => !i.added).length,
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// trimHistory — keep most recent messages within token budget
// ══════════════════════════════════════════════════════════════════════════════
export function trimHistory(messages = [], maxTokens = 1500) {
  if (!messages.length) return []

  // Walk from most recent backward
  const result = []
  let used = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    const t = estimateTokens(m.content || '') + 4
    if (used + t > maxTokens) break
    result.unshift(m)
    used += t
  }

  return result
}

// ══════════════════════════════════════════════════════════════════════════════
// deduplicateContext — removes near-duplicate sentences/paragraphs
// ══════════════════════════════════════════════════════════════════════════════
export function deduplicateContext(text = '', threshold = 0.85) {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  if (paragraphs.length <= 1) return text

  const unique = []
  for (const para of paragraphs) {
    const isDup = unique.some(u => similarity(u, para) >= threshold)
    if (!isDup) unique.push(para)
  }

  return unique.join('\n\n')
}

// Simple Jaccard similarity on word sets
function similarity(a = '', b = '') {
  const setA = new Set(a.toLowerCase().split(/\s+/))
  const setB = new Set(b.toLowerCase().split(/\s+/))
  const intersection = [...setA].filter(w => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  return union ? intersection / union : 0
}

// ══════════════════════════════════════════════════════════════════════════════
// loadRelevantContext — يحمّل السياق ذي الصلة فقط حسب النية
// ══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string}   opts.intent      - detected intent
 * @param {string}   opts.query       - user query
 * @param {object}   opts.agentResult - result from specialized agent
 * @param {Array}    opts.history     - conversation history
 * @param {string}   opts.systemPrompt
 * @param {number}   [opts.maxTokens]
 * @returns {{ messages: Array, budget: ContextBudget }}
 */
export function loadRelevantContext({
  intent       = 'UNKNOWN',
  query        = '',
  agentResult  = null,
  history      = [],
  systemPrompt = '',
  maxTokens    = 6000,
} = {}) {
  // Check cache for identical (intent+query) combinations
  const cacheKey = makeKey('ctx', `${intent}:${query}`, { hasAgent: !!agentResult })
  const cached = queryCache.get(cacheKey)
  if (cached && !agentResult) return cached // don't cache when fresh agent data present

  const budget = new ContextBudget({ maxTokens, intent })

  // Priority map: which context types matter for each intent
  const intentPriorities = {
    WORLD_CUP:    { agent: 1, history: 4, knowledge: 3 },
    SPORTS:       { agent: 1, history: 4, knowledge: 3 },
    WEATHER:      { agent: 1, history: 5, knowledge: 5 },
    MAPS:         { agent: 1, history: 5, knowledge: 4 },
    DOCTOR:       { agent: 1, history: 3, knowledge: 4 },
    QURAN:        { agent: 1, history: 3, knowledge: 2 },
    GITHUB:       { agent: 1, history: 2, knowledge: 5 },
    NEWS:         { agent: 1, history: 4, knowledge: 5 },
    WIKI:         { agent: 2, history: 4, knowledge: 1 },
    IMAGE_GEN:    { agent: 2, history: 3, knowledge: 5 },
    IMAGE_SEARCH: { agent: 2, history: 4, knowledge: 5 },
    CURRENCY:     { agent: 1, history: 5, knowledge: 5 },
    UNKNOWN:      { agent: 3, history: 2, knowledge: 3 },
  }

  const prio = intentPriorities[intent] || intentPriorities.UNKNOWN

  // 1. Agent result (highest priority for specialized agents)
  if (agentResult) {
    const agentText = typeof agentResult === 'string'
      ? agentResult
      : agentResult.userResponse || agentResult.result || JSON.stringify(agentResult).slice(0, 2000)

    budget.add({
      label:    'agent_result',
      content:  deduplicateContext(agentText),
      priority: prio.agent,
      required: true,
    })
  }

  const result = {
    messages: budget.buildMessages(systemPrompt, history, query),
    budget,
  }

  // Cache only when no live agent data
  if (!agentResult) {
    queryCache.set(cacheKey, result, { ttl: 2 * 60 * 1000 })
  }

  log.debug(`Context built: ${budget.used} tokens, ${budget.itemsAdded} items, intent=${intent}`)
  return result
}
