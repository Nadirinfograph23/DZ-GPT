/**
 * DZ Agent V5 — Memory System
 * Multi-tier memory: short-term (session), long-term (file), episodic (tasks), semantic (patterns)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MEMORY_DIR = join(__dirname, '../../../data/v5-memory')
const LONG_TERM_FILE = join(MEMORY_DIR, 'long-term.json')
const EPISODIC_FILE = join(MEMORY_DIR, 'episodic.json')
const PATTERNS_FILE = join(MEMORY_DIR, 'patterns.json')
const MAX_LONG_TERM = 500
const MAX_EPISODIC = 200
const MAX_PATTERNS = 100

function ensureDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true })
}

function readJSON(file, fallback = []) {
  try {
    if (!existsSync(file)) return fallback
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch { return fallback }
}

function writeJSON(file, data) {
  ensureDir()
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

export class MemorySystem {
  constructor() {
    // Short-term memory: in-memory session context
    this.shortTerm = new Map() // taskId → { messages, context, facts }
    this.sessionFacts = [] // global session facts
    ensureDir()
  }

  // ── Short-term (session) ───────────────────────────────────────────────
  setSession(taskId, data) {
    this.shortTerm.set(taskId, {
      ...this.shortTerm.get(taskId),
      ...data,
      updatedAt: Date.now(),
    })
  }

  getSession(taskId) {
    return this.shortTerm.get(taskId) || null
  }

  addSessionFact(fact) {
    this.sessionFacts.push({ fact, addedAt: Date.now() })
    if (this.sessionFacts.length > 50) this.sessionFacts.shift()
  }

  getSessionFacts() { return this.sessionFacts }

  clearSession(taskId) { this.shortTerm.delete(taskId) }

  // ── Long-term (file-backed) ────────────────────────────────────────────
  storeLongTerm(entry) {
    const memory = readJSON(LONG_TERM_FILE)
    const item = {
      id: `lt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...entry,
      storedAt: Date.now(),
    }
    memory.unshift(item)
    if (memory.length > MAX_LONG_TERM) memory.splice(MAX_LONG_TERM)
    writeJSON(LONG_TERM_FILE, memory)
    return item.id
  }

  searchLongTerm(query, limit = 5) {
    const memory = readJSON(LONG_TERM_FILE)
    if (!query || memory.length === 0) return memory.slice(0, limit)
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2)
    return memory
      .map(item => {
        const text = JSON.stringify(item).toLowerCase()
        const score = keywords.filter(k => text.includes(k)).length
        return { ...item, _score: score }
      })
      .filter(item => item._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
  }

  // ── Episodic (task history) ────────────────────────────────────────────
  storeEpisode(taskId, { goal, result, reflection, duration, success }) {
    const episodes = readJSON(EPISODIC_FILE)
    const episode = {
      id: taskId,
      goal,
      result: typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result).slice(0, 500),
      reflection: reflection || null,
      duration,
      success,
      storedAt: Date.now(),
    }
    const existing = episodes.findIndex(e => e.id === taskId)
    if (existing >= 0) episodes[existing] = episode
    else episodes.unshift(episode)
    if (episodes.length > MAX_EPISODIC) episodes.splice(MAX_EPISODIC)
    writeJSON(EPISODIC_FILE, episodes)
  }

  getRecentEpisodes(limit = 10) {
    return readJSON(EPISODIC_FILE).slice(0, limit)
  }

  searchEpisodes(query, limit = 5) {
    const episodes = readJSON(EPISODIC_FILE)
    if (!query) return episodes.slice(0, limit)
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2)
    return episodes
      .map(ep => {
        const text = `${ep.goal} ${ep.result} ${ep.reflection || ''}`.toLowerCase()
        const score = keywords.filter(k => text.includes(k)).length
        return { ...ep, _score: score }
      })
      .filter(ep => ep._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
  }

  // ── Semantic patterns (learned behaviors) ─────────────────────────────
  storePattern(pattern) {
    const patterns = readJSON(PATTERNS_FILE)
    const existing = patterns.findIndex(p => p.key === pattern.key)
    if (existing >= 0) {
      patterns[existing] = { ...patterns[existing], ...pattern, updatedAt: Date.now(), count: (patterns[existing].count || 0) + 1 }
    } else {
      patterns.unshift({ ...pattern, count: 1, storedAt: Date.now() })
    }
    if (patterns.length > MAX_PATTERNS) patterns.splice(MAX_PATTERNS)
    writeJSON(PATTERNS_FILE, patterns)
  }

  getPatterns(type = null) {
    const patterns = readJSON(PATTERNS_FILE)
    if (!type) return patterns
    return patterns.filter(p => p.type === type)
  }

  // ── Context builder ────────────────────────────────────────────────────
  buildContext(goal, taskId = null) {
    const similar = this.searchEpisodes(goal, 3)
    const relevant = this.searchLongTerm(goal, 3)
    const patterns = this.getPatterns('lesson').slice(0, 5)

    let context = ''
    if (similar.length > 0) {
      context += `\nSimilar past tasks:\n${similar.map(e => `- "${e.goal}" → ${e.success ? 'SUCCESS' : 'FAILED'}: ${e.result?.slice(0, 100)}`).join('\n')}`
    }
    if (patterns.length > 0) {
      context += `\nLearned patterns:\n${patterns.map(p => `- ${p.lesson}`).join('\n')}`
    }
    if (taskId) {
      const session = this.getSession(taskId)
      if (session?.facts?.length > 0) {
        context += `\nCurrent session facts:\n${session.facts.map(f => `- ${f}`).join('\n')}`
      }
    }
    return context.trim()
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  stats() {
    const longTerm = readJSON(LONG_TERM_FILE)
    const episodic = readJSON(EPISODIC_FILE)
    const patterns = readJSON(PATTERNS_FILE)
    return {
      shortTerm: this.shortTerm.size,
      longTerm: longTerm.length,
      episodic: episodic.length,
      patterns: patterns.length,
      successRate: episodic.length > 0
        ? Math.round((episodic.filter(e => e.success).length / episodic.length) * 100)
        : 0,
    }
  }
}

// Singleton
let _instance = null
export function getMemory() {
  if (!_instance) _instance = new MemorySystem()
  return _instance
}
