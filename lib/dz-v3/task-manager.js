// DZ Agent V3 — Task lifecycle manager.
// Tracks all V3 tasks (autonomous runs + app generations + scrapes) with a
// short TTL. Each task has: id, kind, status, agentLog, result, error, ts.
// Persisted to /tmp/dz-v3/tasks.json on Vercel (read-only /var/task) or
// data/dz-v3/tasks.json locally.

import fs from 'node:fs/promises'
import path from 'node:path'
import { AgentBus } from './bus.js'

const BASE = process.env.VERCEL
  ? path.resolve('/tmp', 'dz-v3')
  : path.resolve('data', 'dz-v3')
const FILE = path.join(BASE, 'tasks.json')
const MAX_TASKS = 200
const TTL_MS = 24 * 60 * 60 * 1000 // 24h

const tasks = new Map() // id → task
let _writeChain = Promise.resolve()
let _loaded = false

async function load() {
  if (_loaded) return
  try {
    const raw = await fs.readFile(FILE, 'utf8')
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) for (const t of arr) tasks.set(t.id, t)
  } catch {}
  _loaded = true
}

async function persist() {
  _writeChain = _writeChain.then(async () => {
    try {
      await fs.mkdir(BASE, { recursive: true })
      const arr = Array.from(tasks.values()).slice(-MAX_TASKS)
      const tmp = FILE + '.tmp'
      await fs.writeFile(tmp, JSON.stringify(arr, null, 2), 'utf8')
      await fs.rename(tmp, FILE)
    } catch (err) {
      // silent — file may be ephemeral
    }
  })
  return _writeChain
}

function gc() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, t] of tasks) {
    if (t.createdAt < cutoff) tasks.delete(id)
  }
  if (tasks.size > MAX_TASKS) {
    const sorted = Array.from(tasks.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt)
    while (tasks.size > MAX_TASKS) tasks.delete(sorted.shift()[0])
  }
}

export async function createTask({ kind, query = '', sessionId = null, lang = 'ar' }) {
  await load()
  gc()
  const id = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const task = {
    id,
    kind,           // 'autonomous' | 'generate-app' | 'scrape-live' | 'agent-call'
    status: 'pending',
    query, sessionId, lang,
    agentLog: [],
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  tasks.set(id, task)

  const bus = new AgentBus(id)
  bus.subscribe((evt) => {
    task.agentLog.push(evt)
    if (task.agentLog.length > 200) task.agentLog.splice(0, task.agentLog.length - 200)
    task.updatedAt = Date.now()
    if (evt.kind === 'task.done') { task.status = 'done'; task.result = evt.result || null; persist() }
    if (evt.kind === 'task.error') { task.status = 'error'; task.error = evt.error || null; persist() }
    if (evt.kind === 'task.start') { task.status = 'running'; persist() }
  })
  // Attach the bus so caller can use it (not persisted in tasks file)
  Object.defineProperty(task, 'bus', { value: bus, enumerable: false })

  await persist()
  return task
}

export function getTask(id) {
  return tasks.get(id) || null
}

export function listTasks({ limit = 25 } = {}) {
  const arr = Array.from(tasks.values())
  arr.sort((a, b) => b.createdAt - a.createdAt)
  return arr.slice(0, limit).map(({ agentLog, ...t }) => ({ ...t, agentLogLen: agentLog.length }))
}

export function tasksStats() {
  const arr = Array.from(tasks.values())
  const byStatus = {}; const byKind = {}
  for (const t of arr) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1
    byKind[t.kind] = (byKind[t.kind] || 0) + 1
  }
  return { total: arr.length, byStatus, byKind, file: FILE }
}
