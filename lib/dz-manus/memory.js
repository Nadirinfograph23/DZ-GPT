/**
 * DZ-MANUS — Memory System
 * Long-term task memory + context recall + session memory
 * File-backed persistence in data/dz-manus-memory.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR  = join(process.cwd(), 'data')
const MEM_FILE  = join(DATA_DIR, 'dz-manus-memory.json')
const TASK_FILE = join(DATA_DIR, 'dz-manus-tasks.json')
const MAX_MEMORIES = 500
const MAX_TASKS    = 200

// ── In-memory stores ───────────────────────────────────────────────────────
let _memories = []  // [{id, text, embedding, tags, ts, source}]
let _tasks    = new Map()  // taskId → TaskRecord

// ── Init ──────────────────────────────────────────────────────────────────
function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function loadMemories() {
  ensureDir()
  try {
    if (existsSync(MEM_FILE)) {
      _memories = JSON.parse(readFileSync(MEM_FILE, 'utf8')) || []
    }
  } catch { _memories = [] }
}

function loadTasks() {
  ensureDir()
  try {
    if (existsSync(TASK_FILE)) {
      const arr = JSON.parse(readFileSync(TASK_FILE, 'utf8')) || []
      _tasks = new Map(arr.map(t => [t.id, t]))
    }
  } catch { _tasks = new Map() }
}

function saveMemories() {
  ensureDir()
  try { writeFileSync(MEM_FILE, JSON.stringify(_memories.slice(-MAX_MEMORIES)), 'utf8') } catch {}
}

function saveTasks() {
  ensureDir()
  try {
    const arr = [..._tasks.values()].slice(-MAX_TASKS)
    writeFileSync(TASK_FILE, JSON.stringify(arr), 'utf8')
  } catch {}
}

// Initialize
loadMemories()
loadTasks()

// ── Simple bag-of-words similarity ────────────────────────────────────────
function tokenize(text) {
  return (text || '').toLowerCase()
    .replace(/[^\u0600-\u06FF\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2)
}

function similarity(a, b) {
  const ta = new Set(tokenize(a))
  const tb = new Set(tokenize(b))
  if (!ta.size || !tb.size) return 0
  const inter = [...ta].filter(t => tb.has(t)).length
  return inter / Math.sqrt(ta.size * tb.size)
}

// ── Memory API ────────────────────────────────────────────────────────────

/**
 * Store a memory entry
 */
export function remember(text, { tags = [], source = 'task', taskId = null } = {}) {
  const entry = {
    id:     `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text:   text.slice(0, 2000),
    tags,
    source,
    taskId,
    ts:     Date.now(),
  }
  _memories.push(entry)
  if (_memories.length > MAX_MEMORIES) _memories = _memories.slice(-MAX_MEMORIES)
  saveMemories()
  return entry.id
}

/**
 * Search memories by semantic similarity
 */
export function recall(query, { limit = 5, minSim = 0.1, tags = [] } = {}) {
  let pool = _memories
  if (tags.length) pool = pool.filter(m => tags.some(t => m.tags.includes(t)))
  return pool
    .map(m => ({ ...m, _sim: similarity(query, m.text) }))
    .filter(m => m._sim >= minSim)
    .sort((a, b) => b._sim - a._sim)
    .slice(0, limit)
    .map(({ _sim, ...m }) => ({ ...m, relevance: parseFloat(_sim.toFixed(3)) }))
}

/**
 * Get all memories for a specific task
 */
export function getTaskMemories(taskId) {
  return _memories.filter(m => m.taskId === taskId)
}

// ── Task Store API ────────────────────────────────────────────────────────

export function createTask({
  id, goal, sessionId = null, metadata = {},
}) {
  const task = {
    id,
    goal:       goal.slice(0, 2000),
    sessionId,
    metadata,
    status:     'pending',     // pending|planning|running|reviewing|done|error|cancelled
    steps:      [],
    results:    [],
    memories:   [],
    error:      null,
    plan:       null,
    review:     null,
    startTs:    Date.now(),
    updateTs:   Date.now(),
    endTs:      null,
    iterations: 0,
  }
  _tasks.set(id, task)
  saveTasks()
  return task
}

export function getTask(id) {
  return _tasks.get(id) || null
}

export function getAllTasks({ sessionId = null, limit = 50 } = {}) {
  let arr = [..._tasks.values()]
  if (sessionId) arr = arr.filter(t => t.sessionId === sessionId)
  return arr
    .sort((a, b) => b.startTs - a.startTs)
    .slice(0, limit)
    .map(t => ({
      id: t.id, goal: t.goal, status: t.status,
      startTs: t.startTs, endTs: t.endTs,
      steps: t.steps.length, sessionId: t.sessionId,
    }))
}

export function updateTask(id, patch) {
  const task = _tasks.get(id)
  if (!task) return null
  Object.assign(task, patch, { updateTs: Date.now() })
  _tasks.set(id, task)
  saveTasks()
  return task
}

export function addTaskStep(taskId, step) {
  const task = _tasks.get(taskId)
  if (!task) return
  task.steps.push({ ...step, ts: Date.now() })
  task.updateTs = Date.now()
  _tasks.set(taskId, task)
}

export function cancelTask(id) {
  return updateTask(id, { status: 'cancelled', endTs: Date.now() })
}

export function getTaskStats() {
  const arr = [..._tasks.values()]
  return {
    total:    arr.length,
    done:     arr.filter(t => t.status === 'done').length,
    running:  arr.filter(t => t.status === 'running').length,
    error:    arr.filter(t => t.status === 'error').length,
    memories: _memories.length,
  }
}
