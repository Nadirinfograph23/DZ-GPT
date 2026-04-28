// DZ Agent — Local memory system (self-learning).
// File-based JSON persistence at /data/memory.json. Atomic writes,
// LRU semantics, similarity-based retrieval. Zero dependencies.

import fs from 'node:fs/promises'
import path from 'node:path'

const FILE = path.resolve('data', 'memory.json')
const MAX_ENTRIES = 500
const SIM_THRESHOLD = 0.55
const FRESH_REUSE_MS = 30 * 60 * 1000 // 30 min — auto-reuse cached answer

let _state = null
let _writeQueue = Promise.resolve()

function _now() { return Date.now() }

function normalize(text) {
  return String(text || '').toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function tokenize(text) {
  return new Set(normalize(text).split(' ').filter(t => t.length > 2))
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const union = a.size + b.size - inter
  return union > 0 ? inter / union : 0
}

async function _ensureLoaded() {
  if (_state) return _state
  try {
    const raw = await fs.readFile(FILE, 'utf8')
    _state = JSON.parse(raw)
    if (!Array.isArray(_state.entries)) _state.entries = []
  } catch {
    _state = { version: 1, createdAt: new Date().toISOString(), entries: [] }
    await _atomicWrite()
  }
  return _state
}

async function _atomicWrite() {
  // Serialize writes to avoid races
  _writeQueue = _writeQueue.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true })
    const tmp = FILE + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(_state, null, 2), 'utf8')
    await fs.rename(tmp, FILE)
  }).catch(err => { console.error('[memory] write error:', err.message) })
  return _writeQueue
}

export async function recall(query) {
  const state = await _ensureLoaded()
  const qTokens = tokenize(query)
  let best = null
  let bestSim = 0
  for (const e of state.entries) {
    const sim = jaccard(qTokens, tokenize(e.query))
    if (sim > bestSim) { bestSim = sim; best = e }
  }
  if (best && bestSim >= SIM_THRESHOLD) {
    const age = _now() - (best.ts || 0)
    return { ...best, similarity: bestSim, ageMs: age, fresh: age < FRESH_REUSE_MS }
  }
  return null
}

export async function remember({ query, intent, answer, sources = [], meta = {} }) {
  if (!query || !answer) return null
  const state = await _ensureLoaded()
  const qNorm = normalize(query)

  // Update existing entry if same normalized query already exists.
  const existingIdx = state.entries.findIndex(e => normalize(e.query) === qNorm)
  const entry = {
    query,
    intent: intent || 'general',
    answer: String(answer).slice(0, 8000),
    sources: (sources || []).slice(0, 12).map(s => ({
      title: s.title || s.name || '',
      url: s.url || s.link || '',
      source: s.source || s.feedName || '',
    })),
    meta: { ...meta, useCount: (state.entries[existingIdx]?.meta?.useCount || 0) + 1 },
    ts: _now(),
  }
  if (existingIdx >= 0) state.entries.splice(existingIdx, 1)
  state.entries.unshift(entry)

  // LRU trim
  if (state.entries.length > MAX_ENTRIES) state.entries.length = MAX_ENTRIES

  await _atomicWrite()
  return entry
}

export async function stats() {
  const state = await _ensureLoaded()
  const byIntent = state.entries.reduce((acc, e) => {
    acc[e.intent || 'general'] = (acc[e.intent || 'general'] || 0) + 1
    return acc
  }, {})
  return {
    total: state.entries.length,
    max: MAX_ENTRIES,
    byIntent,
    oldest: state.entries.at(-1)?.ts || null,
    newest: state.entries[0]?.ts || null,
  }
}

export async function listRecent(n = 20) {
  const state = await _ensureLoaded()
  return state.entries.slice(0, n).map(e => ({
    query: e.query,
    intent: e.intent,
    sources: e.sources?.length || 0,
    useCount: e.meta?.useCount || 1,
    ageMin: Math.round((_now() - e.ts) / 60000),
  }))
}

export async function purge() {
  _state = { version: 1, createdAt: new Date().toISOString(), entries: [] }
  await _atomicWrite()
  return { ok: true }
}
