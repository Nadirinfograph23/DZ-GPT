/**
 * DZ Agent V5 — File System Tool
 * Secure read/write access restricted to the workspace directory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, resolve, dirname, extname, relative } from 'path'

const WORKSPACE_ROOT = resolve(process.cwd(), 'workspace')
const MAX_FILE_SIZE = 1024 * 1024 // 1MB
const MAX_READ_CHARS = 50000
const ALLOWED_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.py', '.sh', '.html', '.css', '.csv',
  '.yaml', '.yml', '.xml', '.env.example', '.toml', '.rs', '.go', '.java', '.c', '.cpp', '.h',
])

function ensureWorkspace() {
  if (!existsSync(WORKSPACE_ROOT)) mkdirSync(WORKSPACE_ROOT, { recursive: true })
  ;['tasks', 'projects', 'cache', 'temp'].forEach(sub => {
    const dir = join(WORKSPACE_ROOT, sub)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  })
}

function safePath(inputPath) {
  ensureWorkspace()
  const resolved = resolve(join(WORKSPACE_ROOT, inputPath))
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error('Path traversal blocked — access outside workspace denied')
  }
  return resolved
}

export class FileSystemTool {
  constructor(mode = 'read') {
    this.mode = mode
  }

  async execute(input, _ctx) {
    const path = typeof input === 'string' ? input : input.path
    const content = typeof input === 'object' ? input.content : null
    const action = typeof input === 'object' ? (input.action || this.mode) : this.mode

    if (!path) return { error: 'No path provided' }

    try {
      if (action === 'read' || action === 'file_read') return this.read(path)
      if (action === 'write' || action === 'file_write') return this.write(path, content)
      if (action === 'list') return this.list(path)
      if (action === 'delete') return this.delete(path)
      if (action === 'exists') return { output: existsSync(safePath(path)), path }
      return this.read(path) // default
    } catch (err) {
      return { error: err.message }
    }
  }

  read(path) {
    const fullPath = safePath(path)
    if (!existsSync(fullPath)) return { error: `File not found: ${path}` }

    const stat = statSync(fullPath)
    if (stat.isDirectory()) return this.list(path)
    if (stat.size > MAX_FILE_SIZE) return { error: `File too large: ${stat.size} bytes (max 1MB)` }

    const ext = extname(fullPath).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext) && !ext) {
      return { error: `File type not allowed: ${ext || 'no extension'}` }
    }

    try {
      const content = readFileSync(fullPath, 'utf8')
      return {
        output: content.slice(0, MAX_READ_CHARS),
        path,
        size: stat.size,
        truncated: content.length > MAX_READ_CHARS,
        encoding: 'utf8',
      }
    } catch (err) {
      return { error: `Cannot read file: ${err.message}` }
    }
  }

  write(path, content) {
    if (!content && content !== '') return { error: 'No content provided' }

    const ext = extname(path).toLowerCase()
    if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
      return { error: `Cannot write file type: ${ext}` }
    }

    const fullPath = safePath(path)
    const dir = dirname(fullPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    const strContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
    writeFileSync(fullPath, strContent, 'utf8')
    return { output: `File written: ${path}`, path, size: strContent.length }
  }

  list(path = '') {
    const fullPath = safePath(path)
    if (!existsSync(fullPath)) return { error: `Path not found: ${path}` }

    const stat = statSync(fullPath)
    if (!stat.isDirectory()) return this.read(path)

    try {
      const entries = readdirSync(fullPath)
      const items = entries.map(name => {
        try {
          const entryPath = join(fullPath, name)
          const s = statSync(entryPath)
          return {
            name,
            type: s.isDirectory() ? 'dir' : 'file',
            size: s.isFile() ? s.size : null,
            path: relative(WORKSPACE_ROOT, entryPath),
            modified: s.mtime.toISOString(),
          }
        } catch { return { name, type: 'unknown', error: true } }
      })
      return { output: items, count: items.length, path: path || 'workspace/' }
    } catch (err) {
      return { error: err.message }
    }
  }

  delete(path) {
    const fullPath = safePath(path)
    if (!existsSync(fullPath)) return { error: `File not found: ${path}` }
    const stat = statSync(fullPath)
    if (stat.isDirectory()) return { error: 'Cannot delete directories' }
    unlinkSync(fullPath)
    return { output: `Deleted: ${path}`, deleted: true }
  }
}
