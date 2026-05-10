// Chat store — file-based persistent message storage
import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data', 'chat')
const MSGS_FILE = path.join(DATA_DIR, 'messages.json')
const PINNED_FILE = path.join(DATA_DIR, 'pinned.json')
const REACTIONS_FILE = path.join(DATA_DIR, 'reactions.json')

async function ensureDir() {
  await mkdir(DATA_DIR, { recursive: true })
}

async function readJSON(file, fallback) {
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeJSON(file, data) {
  await ensureDir()
  await writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}

export async function pushMsg(msg) {
  const msgs = await readJSON(MSGS_FILE, [])
  msgs.push({ ...msg, _ts: Date.now() })
  if (msgs.length > 500) msgs.splice(0, msgs.length - 500)
  await writeJSON(MSGS_FILE, msgs)
}

export async function getMessages(since = 0, limit = 80) {
  const msgs = await readJSON(MSGS_FILE, [])
  return msgs.filter(m => (m._ts || 0) > since).slice(-limit)
}

export async function deleteMsg(id) {
  const msgs = await readJSON(MSGS_FILE, [])
  const updated = msgs.filter(m => m.id !== id)
  await writeJSON(MSGS_FILE, updated)
}

export async function setPinned(data) {
  await writeJSON(PINNED_FILE, data)
}

export async function getPinned() {
  return readJSON(PINNED_FILE, null)
}

export async function react(msgId, emoji, userId) {
  const reactions = await readJSON(REACTIONS_FILE, {})
  if (!reactions[msgId]) reactions[msgId] = {}
  if (!reactions[msgId][emoji]) reactions[msgId][emoji] = []
  const list = reactions[msgId][emoji]
  const idx = list.indexOf(userId)
  if (idx === -1) list.push(userId)
  else list.splice(idx, 1)
  await writeJSON(REACTIONS_FILE, reactions)
}

export async function getReactions(msgId) {
  const reactions = await readJSON(REACTIONS_FILE, {})
  return reactions[msgId] || {}
}
