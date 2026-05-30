// DZ Agent — Memory System v2 (Session-Scoped + Dice Similarity)
// ─────────────────────────────────────────────────────────────
// إصلاحات v2:
//   ① userId scoping — كل مستخدم له ذاكرة مستقلة
//   ② Dice coefficient — أدق من Jaccard للعربية
//   ③ MAX_ENTRIES 2000 (كان 500) + MAX_PER_USER 150
//   ④ حد أدنى لطول الكلمة 3 (كان 2) — يزيل الضوضاء
//   ⑤ searchMemories() — بحث متزامن للحقن في system prompt

import fs from 'node:fs/promises'
import path from 'node:path'

const FILE = path.resolve('data', 'memory.json')
const MAX_ENTRIES   = 2000   // global cap
const MAX_PER_USER  = 150    // cap per userId to prevent monopoly
const SIM_THRESHOLD = 0.42   // Dice threshold (أدق من Jaccard → عتبة أخفض)
const FRESH_REUSE_MS = 30 * 60 * 1000  // 30 min — auto-reuse cached answer

let _state = null
let _writeQueue = Promise.resolve()

function _now() { return Date.now() }

function normalize(text) {
  return String(text || '').toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')   // remove tashkeel
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function tokenize(text) {
  return new Set(normalize(text).split(' ').filter(t => t.length > 2))
}

// Dice coefficient — أفضل من Jaccard للنصوص القصيرة والعربية
function dice(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return (2 * inter) / (a.size + b.size)
}

async function _ensureLoaded() {
  if (_state) return _state
  try {
    const raw = await fs.readFile(FILE, 'utf8')
    _state = JSON.parse(raw)
    if (!Array.isArray(_state.entries)) _state.entries = []
  } catch {
    _state = { version: 2, createdAt: new Date().toISOString(), entries: [] }
    await _atomicWrite()
  }
  return _state
}

async function _atomicWrite() {
  _writeQueue = _writeQueue.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true })
    const tmp = FILE + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(_state, null, 2), 'utf8')
    await fs.rename(tmp, FILE)
  }).catch(err => { console.error('[memory] write error:', err.message) })
  return _writeQueue
}

// ── recall — إيجاد أقرب إجابة للسؤال ──────────────────────────────────────
// opts.userId  — اختياري: فلترة ذاكرة المستخدم فقط
// opts.global  — true: ابحث في كل الذاكرة بغض النظر عن userId
export async function recall(query, opts = {}) {
  const { userId = null, global: searchGlobal = false } = opts
  const state = await _ensureLoaded()
  const qTokens = tokenize(query)
  let best = null
  let bestSim = 0

  // فلترة: إذا كان userId موجوداً، نبحث في ذاكرته + الذاكرة العامة (بدون userId)
  const entries = (userId && !searchGlobal)
    ? state.entries.filter(e => !e.userId || e.userId === userId)
    : state.entries

  for (const e of entries) {
    const sim = dice(qTokens, tokenize(e.query))
    if (sim > bestSim) { bestSim = sim; best = e }
  }

  if (best && bestSim >= SIM_THRESHOLD) {
    const age = _now() - (best.ts || 0)
    return { ...best, similarity: bestSim, ageMs: age, fresh: age < FRESH_REUSE_MS }
  }
  return null
}

// ── remember — حفظ سؤال وإجابته ──────────────────────────────────────────
export async function remember({ query, intent, answer, sources = [], meta = {}, userId = null }) {
  if (!query || !answer) return null
  const state = await _ensureLoaded()
  const qNorm = normalize(query)

  const existingIdx = state.entries.findIndex(
    e => normalize(e.query) === qNorm && (e.userId || null) === userId
  )
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
    userId: userId || null,
    ts: _now(),
  }

  if (existingIdx >= 0) state.entries.splice(existingIdx, 1)
  state.entries.unshift(entry)

  // حد per-user: إذا تجاوز المستخدم MAX_PER_USER → احذف أقدم إدخالاته
  if (userId) {
    const userCount = state.entries.filter(e => e.userId === userId).length
    if (userCount > MAX_PER_USER) {
      let removed = 0
      for (let i = state.entries.length - 1; i >= 0 && removed < userCount - MAX_PER_USER; i--) {
        if (state.entries[i].userId === userId) {
          state.entries.splice(i, 1)
          removed++
        }
      }
    }
  }

  // global LRU trim
  if (state.entries.length > MAX_ENTRIES) state.entries.length = MAX_ENTRIES

  await _atomicWrite()
  return entry
}

// ── searchMemories — بحث متزامن (للحقن في system prompt) ──────────────────
// يُستخدم بدلاً من recall() حين لا نريد انتظار async
export function searchMemories({ query, userId = null, topK = 5 }) {
  if (!_state?.entries?.length) return []
  const qTokens = tokenize(query || '')
  if (!qTokens.size) return []

  const entries = userId
    ? _state.entries.filter(e => !e.userId || e.userId === userId)
    : _state.entries

  return entries
    .map(e => ({ ...e, _sim: dice(qTokens, tokenize(e.query)) }))
    .filter(e => e._sim >= SIM_THRESHOLD)
    .sort((a, b) => b._sim - a._sim)
    .slice(0, topK)
}

// ── buildMemoryContext — يبني كتلة system-prompt من الذاكرة ───────────────
export function buildMemoryContext(memories) {
  if (!memories?.length) return ''
  const lines = ['🧠 ذاكرة المستخدم (محادثات سابقة ذات صلة):']
  for (const m of memories.slice(0, 4)) {
    lines.push(`• [${m.intent || 'عام'}] س: "${m.query.slice(0, 120)}"`)
    lines.push(`  ج: "${m.answer.slice(0, 300)}..."`)
  }
  lines.push('> استخدم هذه الذاكرة إذا كانت ذات صلة بالسؤال الحالي.')
  return lines.join('\n')
}

// ── stats ──────────────────────────────────────────────────────────────────
export async function stats(userId = null) {
  const state = await _ensureLoaded()
  const entries = userId
    ? state.entries.filter(e => e.userId === userId)
    : state.entries
  const byIntent = entries.reduce((acc, e) => {
    acc[e.intent || 'general'] = (acc[e.intent || 'general'] || 0) + 1
    return acc
  }, {})
  return {
    total: entries.length,
    globalTotal: state.entries.length,
    max: userId ? MAX_PER_USER : MAX_ENTRIES,
    byIntent,
    oldest: entries.at(-1)?.ts || null,
    newest: entries[0]?.ts || null,
  }
}

export async function listRecent(n = 20, userId = null) {
  const state = await _ensureLoaded()
  const entries = userId
    ? state.entries.filter(e => e.userId === userId)
    : state.entries
  return entries.slice(0, n).map(({ query, intent, ts, userId: uid }) => ({
    query, intent, ts, userId: uid,
  }))
}

export async function forget(query, userId = null) {
  const state = await _ensureLoaded()
  const qNorm = normalize(query)
  const before = state.entries.length
  state.entries = state.entries.filter(e =>
    !(normalize(e.query) === qNorm && (e.userId || null) === userId)
  )
  if (state.entries.length < before) await _atomicWrite()
  return before - state.entries.length
}

export async function clearAll(userId = null) {
  const state = await _ensureLoaded()
  if (userId) {
    const before = state.entries.length
    state.entries = state.entries.filter(e => e.userId !== userId)
    await _atomicWrite()
    return before - state.entries.length
  }
  state.entries = []
  await _atomicWrite()
  return 0
}
