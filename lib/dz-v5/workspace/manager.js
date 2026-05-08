/**
 * DZ Agent V5 — Workspace Manager
 * Manages isolated task workspaces, project state, and artifact storage.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

const WORKSPACE_ROOT = resolve(process.cwd(), 'workspace')

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export class WorkspaceManager {
  constructor() {
    ensureDir(WORKSPACE_ROOT)
    ;['tasks', 'projects', 'cache', 'temp'].forEach(sub => ensureDir(join(WORKSPACE_ROOT, sub)))
  }

  // ── Task workspaces ────────────────────────────────────────────────────
  createTaskWorkspace(taskId) {
    const dir = join(WORKSPACE_ROOT, 'tasks', taskId)
    ensureDir(dir)
    return dir
  }

  saveTaskState(taskId, state) {
    const dir = join(WORKSPACE_ROOT, 'tasks', taskId)
    ensureDir(dir)
    writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf8')
  }

  loadTaskState(taskId) {
    const file = join(WORKSPACE_ROOT, 'tasks', taskId, 'state.json')
    if (!existsSync(file)) return null
    try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
  }

  saveArtifact(taskId, filename, content) {
    const dir = join(WORKSPACE_ROOT, 'tasks', taskId, 'artifacts')
    ensureDir(dir)
    const filepath = join(dir, filename)
    writeFileSync(filepath, typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8')
    return { path: `workspace/tasks/${taskId}/artifacts/${filename}`, size: content.length }
  }

  listArtifacts(taskId) {
    const dir = join(WORKSPACE_ROOT, 'tasks', taskId, 'artifacts')
    if (!existsSync(dir)) return []
    return readdirSync(dir).map(name => {
      const s = statSync(join(dir, name))
      return { name, size: s.size, modified: s.mtime.toISOString(), path: `workspace/tasks/${taskId}/artifacts/${name}` }
    })
  }

  // ── Projects ───────────────────────────────────────────────────────────
  listTasks(limit = 50) {
    const dir = join(WORKSPACE_ROOT, 'tasks')
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter(name => existsSync(join(dir, name, 'state.json')))
      .map(name => {
        const state = this.loadTaskState(name)
        return { taskId: name, goal: state?.plan?.goal || 'Unknown', status: state?.status || 'unknown', createdAt: state?.createdAt }
      })
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, limit)
  }

  // ── Cache ──────────────────────────────────────────────────────────────
  cacheGet(key) {
    const file = join(WORKSPACE_ROOT, 'cache', `${key.replace(/[^a-zA-Z0-9-]/g, '_')}.json`)
    if (!existsSync(file)) return null
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (data.expiresAt && Date.now() > data.expiresAt) return null
      return data.value
    } catch { return null }
  }

  cacheSet(key, value, ttlMs = 3600000) {
    const file = join(WORKSPACE_ROOT, 'cache', `${key.replace(/[^a-zA-Z0-9-]/g, '_')}.json`)
    writeFileSync(file, JSON.stringify({ value, expiresAt: Date.now() + ttlMs, key }), 'utf8')
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  stats() {
    const tasks = this.listTasks(1000)
    return {
      totalTasks: tasks.length,
      root: WORKSPACE_ROOT,
      subdirs: ['tasks', 'projects', 'cache', 'temp'],
    }
  }
}

let _instance = null
export function getWorkspace() {
  if (!_instance) _instance = new WorkspaceManager()
  return _instance
}
