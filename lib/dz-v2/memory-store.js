// DZ Agent V2 — 3-tier memory store (additive, file-based).
//
//   Short-term  : in-memory ring buffer per session (last 20 turns)
//   Long-term   : disk JSON, user preferences + repeated patterns + topics
//   Semantic    : disk JSON, keyword-weighted recall (no vector DB needed
//                 — Jaccard + TF on tokens gives surprisingly good results
//                 at this scale and ships zero dependencies).
//
// Persisted to data/dz-v2/memory.json. Atomic writes with a serialized queue.

import fs from 'node:fs/promises'
import path from 'node:path'

// On Vercel serverless the deployment package (/var/task) is read-only;
// only /tmp is writable. Use /tmp in that environment so writes don't fail.
const FILE = process.env.VERCEL
  ? path.resolve('/tmp', 'dz-v2', 'memory.json')
  : path.resolve('data', 'dz-v2', 'memory.json')
const MAX_LONG = 1000
const MAX_SEMANTIC = 2000
const SHORT_TURNS = 20
const SHORT_TTL_MS = 60 * 60 * 1000 // 1h idle

const shortBySession = new Map() // sessionId → { turns:[], updatedAt }
let _disk = null
let _writeChain = Promise.resolve()

function now() { return Date.now() }

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
}

function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens)
  const b = new Set(bTokens)
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

async function loadDisk() {
  if (_disk) return _disk
  try {
    const raw = await fs.readFile(FILE, 'utf8')
    _disk = JSON.parse(raw)
  } catch {
    _disk = {
      version: 2,
      createdAt: new Date().toISOString(),
      long: [],      // { sessionId, key, value, weight, updatedAt }
      semantic: [],  // { id, sessionId, query, answer, lang, intent, tokens, ts }
    }
    await persist()
  }
  if (!Array.isArray(_disk.long)) _disk.long = []
  if (!Array.isArray(_disk.semantic)) _disk.semantic = []
  return _disk
}

async function persist() {
  _writeChain = _writeChain.then(async () => {
    try {
      await fs.mkdir(path.dirname(FILE), { recursive: true })
      const tmp = FILE + '.tmp'
      await fs.writeFile(tmp, JSON.stringify(_disk, null, 2), 'utf8')
      await fs.rename(tmp, FILE)
    } catch (err) {
      console.warn('[dz-v2/memory] persist failed:', err.message)
    }
  })
  return _writeChain
}

// ─── short-term ──────────────────────────────────────────────────────────────
export function rememberTurn(sessionId, role, content) {
  if (!sessionId) sessionId = '_anon'
  const slot = shortBySession.get(sessionId) || { turns: [], updatedAt: now() }
  slot.turns.push({ role, content: String(content || '').slice(0, 4000), ts: now() })
  if (slot.turns.length > SHORT_TURNS * 2) slot.turns.splice(0, slot.turns.length - SHORT_TURNS * 2)
  slot.updatedAt = now()
  shortBySession.set(sessionId, slot)

  // Light idle GC
  if (shortBySession.size > 200) {
    const cutoff = now() - SHORT_TTL_MS
    for (const [k, v] of shortBySession) {
      if (v.updatedAt < cutoff) shortBySession.delete(k)
    }
  }
}

export function getShortTermContext(sessionId, maxTurns = 8) {
  if (!sessionId) sessionId = '_anon'
  const slot = shortBySession.get(sessionId)
  if (!slot) return []
  return slot.turns.slice(-(maxTurns * 2))
}

// ─── long-term (preferences, patterns) ───────────────────────────────────────
export async function setPreference(sessionId, key, value, weight = 1) {
  const d = await loadDisk()
  const idx = d.long.findIndex(p => p.sessionId === sessionId && p.key === key)
  const entry = { sessionId, key, value, weight, updatedAt: new Date().toISOString() }
  if (idx >= 0) {
    d.long[idx] = { ...d.long[idx], ...entry, weight: (d.long[idx].weight || 0) + weight }
  } else {
    d.long.push(entry)
  }
  if (d.long.length > MAX_LONG) d.long.splice(0, d.long.length - MAX_LONG)
  await persist()
}

export async function getPreferences(sessionId) {
  const d = await loadDisk()
  return d.long
    .filter(p => p.sessionId === sessionId || p.sessionId === '_global')
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, 30)
}

// ─── semantic recall ─────────────────────────────────────────────────────────
export async function recordSemantic(sessionId, { query, answer, lang, intent }) {
  const d = await loadDisk()
  d.semantic.push({
    id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: sessionId || '_anon',
    query: String(query || '').slice(0, 500),
    answer: String(answer || '').slice(0, 2000),
    lang: lang || 'ar',
    intent: intent || 'general',
    tokens: tokenize(`${query} ${answer}`),
    ts: Date.now(),
  })
  if (d.semantic.length > MAX_SEMANTIC) d.semantic.splice(0, d.semantic.length - MAX_SEMANTIC)
  await persist()
}

export async function recallSemantic(query, { sessionId = null, topK = 3, minScore = 0.18 } = {}) {
  const d = await loadDisk()
  if (!d.semantic.length) return []
  const qTokens = tokenize(query)
  if (!qTokens.length) return []
  const scored = []
  for (const e of d.semantic) {
    const s = jaccard(qTokens, e.tokens)
    // Bonus for same session
    const sessionBoost = sessionId && e.sessionId === sessionId ? 0.05 : 0
    // Recency decay (24h half-life)
    const ageH = (Date.now() - e.ts) / (60 * 60 * 1000)
    const recency = Math.max(0, 1 - ageH / 168) * 0.05
    const score = s + sessionBoost + recency
    if (score >= minScore) scored.push({ entry: e, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).map(x => ({
    query: x.entry.query,
    answer: x.entry.answer,
    lang: x.entry.lang,
    intent: x.entry.intent,
    score: Number(x.score.toFixed(3)),
    ts: x.entry.ts,
  }))
}

export async function memoryStats() {
  const d = await loadDisk()
  return {
    short: { sessions: shortBySession.size },
    long: d.long.length,
    semantic: d.semantic.length,
    file: FILE,
  }
}

export async function purgeMemory({ kind = 'all', olderThanDays = null } = {}) {
  const d = await loadDisk()
  if (kind === 'short' || kind === 'all') shortBySession.clear()
  const cutoff = olderThanDays ? Date.now() - olderThanDays * 86400000 : null
  if (kind === 'semantic' || kind === 'all') {
    d.semantic = cutoff ? d.semantic.filter(e => e.ts >= cutoff) : []
  }
  if (kind === 'long' || kind === 'all') {
    d.long = cutoff
      ? d.long.filter(e => new Date(e.updatedAt).getTime() >= cutoff)
      : []
  }
  await persist()
  return memoryStats()
}
