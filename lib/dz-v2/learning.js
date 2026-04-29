// DZ Agent V2 — Self-learning interaction log.
// Append-only JSONL at data/dz-v2/learning.jsonl. Each entry records a full
// V2 turn outcome (model, validation status, attempts, latency, plugins used,
// user-perceived correction signal). Used by analytics + future fine-tuning.

import fs from 'node:fs/promises'
import path from 'node:path'

// Vercel /var/task is read-only; use /tmp on Vercel.
const BASE = process.env.VERCEL
  ? path.resolve('/tmp', 'dz-v2')
  : path.resolve('data', 'dz-v2')
const FILE = path.join(BASE, 'learning.jsonl')
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB rotation
const ROTATED = path.join(BASE, 'learning.prev.jsonl')

let _writeChain = Promise.resolve()
const recent = [] // last N for /api/dz-agent-v2/learning/recent
const RECENT_MAX = 100

async function ensureDir() {
  await fs.mkdir(path.dirname(FILE), { recursive: true })
}

async function rotateIfNeeded() {
  try {
    const st = await fs.stat(FILE)
    if (st.size >= MAX_BYTES) {
      try { await fs.rename(FILE, ROTATED) } catch {}
    }
  } catch {}
}

export function logTurn(entry) {
  const record = {
    ts: new Date().toISOString(),
    sessionId: entry.sessionId || '_anon',
    lang: entry.lang || null,
    intent: entry.intent || null,
    query: String(entry.query || '').slice(0, 500),
    answerPreview: String(entry.answer || '').slice(0, 200),
    answerLen: (entry.answer || '').length,
    model: entry.model || null,
    plugins: Array.isArray(entry.plugins) ? entry.plugins.slice(0, 8) : [],
    attempts: entry.attempts || 1,
    valid: entry.valid !== false,
    latencyMs: entry.latencyMs || null,
    rejectedReason: entry.rejectedReason || null,
  }
  recent.push(record)
  if (recent.length > RECENT_MAX) recent.splice(0, recent.length - RECENT_MAX)
  _writeChain = _writeChain.then(async () => {
    try {
      await ensureDir()
      await rotateIfNeeded()
      await fs.appendFile(FILE, JSON.stringify(record) + '\n', 'utf8')
    } catch (err) {
      console.warn('[dz-v2/learning] append failed:', err.message)
    }
  })
}

export function getRecent(limit = 25) {
  return recent.slice(-Math.max(1, Math.min(limit, RECENT_MAX))).reverse()
}

export function getStats() {
  const total = recent.length
  if (!total) return { total: 0 }
  const valid = recent.filter(r => r.valid).length
  const langs = {}
  const intents = {}
  let totalLatency = 0
  let latencyCount = 0
  let totalAttempts = 0
  for (const r of recent) {
    langs[r.lang || 'unknown'] = (langs[r.lang || 'unknown'] || 0) + 1
    intents[r.intent || 'unknown'] = (intents[r.intent || 'unknown'] || 0) + 1
    if (r.latencyMs) { totalLatency += r.latencyMs; latencyCount++ }
    totalAttempts += r.attempts || 1
  }
  return {
    total,
    successRate: Number((valid / total).toFixed(3)),
    avgLatencyMs: latencyCount ? Math.round(totalLatency / latencyCount) : null,
    avgAttempts: Number((totalAttempts / total).toFixed(2)),
    langs,
    intents,
  }
}
