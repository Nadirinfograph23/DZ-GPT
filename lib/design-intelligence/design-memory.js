/**
 * Design Intelligence — Design Memory
 * Stores analyzed design patterns in a lightweight JSON cache.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MEMORY_DIR = join(__dirname, '../../data/design-memory')
const MEMORY_FILE = join(MEMORY_DIR, 'designs.json')
const MAX_ENTRIES = 100

function ensureDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true })
}

function readMemory() {
  ensureDir()
  if (!existsSync(MEMORY_FILE)) return []
  try { return JSON.parse(readFileSync(MEMORY_FILE, 'utf8')) } catch { return [] }
}

function writeMemory(data) {
  ensureDir()
  writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf8')
}

export function saveDesign(analysis) {
  const memory = readMemory()
  const existing = memory.findIndex(m => m.url === analysis.url)
  const entry = {
    id: existing >= 0 ? memory[existing].id : `design-${Date.now()}`,
    url: analysis.url,
    title: analysis.title,
    uiStyle: analysis.uiStyle,
    primaryColor: analysis.colors[0] || null,
    fonts: analysis.fonts.slice(0, 3),
    sections: analysis.sections,
    analyzedAt: analysis.analyzedAt,
  }
  if (existing >= 0) memory[existing] = entry
  else memory.unshift(entry)
  if (memory.length > MAX_ENTRIES) memory.splice(MAX_ENTRIES)
  writeMemory(memory)
  return entry
}

export function getDesigns(limit = 20) {
  return readMemory().slice(0, limit)
}

export function getDesignByUrl(url) {
  return readMemory().find(m => m.url === url) || null
}

export function deleteDesign(id) {
  const memory = readMemory().filter(m => m.id !== id)
  writeMemory(memory)
}
