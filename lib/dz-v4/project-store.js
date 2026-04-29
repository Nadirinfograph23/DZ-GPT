// DZ Agent V4 PRO — persistent project store.
// On Replit / local dev: writes under data/dz-v4/projects/<id>/
// On Vercel serverless: writes under /tmp/dz-v4/projects/<id>/ (read-only FS otherwise)
// Also keeps a lightweight in-memory index for fast listing.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const isVercel = !!process.env.VERCEL
const ROOT = isVercel
  ? path.join('/tmp', 'dz-v4', 'projects')
  : path.join(process.cwd(), 'data', 'dz-v4', 'projects')

ensureDir(ROOT)

const INDEX = new Map() // id → { id, title, stack, entry, createdAt, updatedAt, fileCount }

// Hydrate index from disk on boot (best effort)
try {
  for (const id of fs.readdirSync(ROOT)) {
    const metaPath = path.join(ROOT, id, '_meta.json')
    if (fs.existsSync(metaPath)) {
      try { INDEX.set(id, JSON.parse(fs.readFileSync(metaPath, 'utf8'))) } catch {}
    }
  }
} catch {}

export function newProjectId() {
  return `p_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`
}

export function saveProject({ id, plan, files, prompt }) {
  if (!id) id = newProjectId()
  const dir = path.join(ROOT, id)
  ensureDir(dir)

  for (const f of files) {
    // f.path looks like /project/index.html — strip the /project/ prefix
    const rel = f.path.replace(/^\/project\/?/, '')
    if (!rel) continue
    const full = path.join(dir, rel)
    ensureDir(path.dirname(full))
    fs.writeFileSync(full, f.content, 'utf8')
  }

  const meta = {
    id,
    title: plan?.title || 'Untitled',
    stack: plan?.stack || 'static',
    entry: plan?.entry || null,
    description: plan?.description || '',
    prompt: prompt || '',
    files: files.map(f => ({ path: f.path, lang: f.lang, bytes: Buffer.byteLength(f.content, 'utf8') })),
    fileCount: files.length,
    totalBytes: files.reduce((a, f) => a + Buffer.byteLength(f.content, 'utf8'), 0),
    createdAt: INDEX.get(id)?.createdAt || Date.now(),
    updatedAt: Date.now(),
  }
  fs.writeFileSync(path.join(dir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf8')
  INDEX.set(id, meta)
  return meta
}

export function getProject(id) {
  const meta = INDEX.get(id)
  if (!meta) return null
  return meta
}

export function getProjectFiles(id) {
  const meta = INDEX.get(id)
  if (!meta) return null
  const dir = path.join(ROOT, id)
  const out = []
  for (const f of meta.files) {
    const rel = f.path.replace(/^\/project\/?/, '')
    const full = path.join(dir, rel)
    let content = ''
    try { content = fs.readFileSync(full, 'utf8') } catch {}
    out.push({ path: f.path, lang: f.lang, bytes: f.bytes, content })
  }
  return out
}

export function getProjectFile(id, filePath) {
  const meta = INDEX.get(id)
  if (!meta) return null
  const f = meta.files.find(x => x.path === filePath)
  if (!f) return null
  const rel = f.path.replace(/^\/project\/?/, '')
  const full = path.join(ROOT, id, rel)
  try {
    return { path: f.path, lang: f.lang, content: fs.readFileSync(full, 'utf8') }
  } catch {
    return null
  }
}

export function updateProjectFile(id, file) {
  const meta = INDEX.get(id)
  if (!meta) return null
  const dir = path.join(ROOT, id)
  const rel = file.path.replace(/^\/project\/?/, '')
  const full = path.join(dir, rel)
  ensureDir(path.dirname(full))
  fs.writeFileSync(full, file.content, 'utf8')

  const idx = meta.files.findIndex(x => x.path === file.path)
  const entry = { path: file.path, lang: file.lang || 'txt', bytes: Buffer.byteLength(file.content, 'utf8') }
  if (idx === -1) meta.files.push(entry)
  else meta.files[idx] = entry
  meta.fileCount = meta.files.length
  meta.totalBytes = meta.files.reduce((a, f) => a + f.bytes, 0)
  meta.updatedAt = Date.now()
  fs.writeFileSync(path.join(dir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf8')
  INDEX.set(id, meta)
  return meta
}

export function listProjects(limit = 25) {
  return Array.from(INDEX.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}

export function deleteProject(id) {
  const dir = path.join(ROOT, id)
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  return INDEX.delete(id)
}

export function projectStats() {
  const all = Array.from(INDEX.values())
  return {
    total: all.length,
    totalFiles: all.reduce((a, m) => a + m.fileCount, 0),
    totalBytes: all.reduce((a, m) => a + m.totalBytes, 0),
    storageRoot: ROOT,
    persistent: !isVercel,
  }
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}
