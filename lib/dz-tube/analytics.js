// DZ Tube — Mini Player analytics store.
// Append-only JSONL log of player events (play/pause/skip/complete/error).
// On Vercel writes go to /tmp; locally to data/dz-tube/.
// Aggregates served via /api/dz-tube/analytics/stats.

import fs from 'node:fs/promises'
import path from 'node:path'

const BASE = process.env.VERCEL
  ? path.resolve('/tmp', 'dz-tube')
  : path.resolve('data', 'dz-tube')
const FILE = path.join(BASE, 'analytics.jsonl')
const ROTATED = path.join(BASE, 'analytics.prev.jsonl')
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB rotation
const MAX_RECENT = 200

let _writeChain = Promise.resolve()
const recent = []

async function rotateIfNeeded() {
  try {
    const st = await fs.stat(FILE)
    if (st.size > MAX_BYTES) {
      try { await fs.rm(ROTATED, { force: true }) } catch {}
      await fs.rename(FILE, ROTATED)
    }
  } catch {}
}

export async function recordEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return 0
  const lines = []
  const now = Date.now()
  for (const e of events) {
    if (!e || typeof e !== 'object') continue
    const safe = {
      type: String(e.type || 'unknown').slice(0, 24),
      trackId: e.trackId ? String(e.trackId).slice(0, 32) : null,
      trackTitle: e.trackTitle ? String(e.trackTitle).slice(0, 200) : undefined,
      position: Number.isFinite(e.position) ? Math.round(e.position) : undefined,
      duration: Number.isFinite(e.duration) ? Math.round(e.duration) : undefined,
      rate: Number.isFinite(e.rate) ? e.rate : undefined,
      volume: Number.isFinite(e.volume) ? e.volume : undefined,
      ts: Number.isFinite(e.ts) ? e.ts : now,
      message: e.message ? String(e.message).slice(0, 200) : undefined,
    }
    lines.push(JSON.stringify(safe))
    recent.push(safe)
  }
  if (recent.length > MAX_RECENT) recent.splice(0, recent.length - MAX_RECENT)

  _writeChain = _writeChain.then(async () => {
    try {
      await fs.mkdir(BASE, { recursive: true })
      await rotateIfNeeded()
      await fs.appendFile(FILE, lines.join('\n') + '\n', 'utf8')
    } catch {}
  })
  return lines.length
}

export function getRecent(limit = 50) {
  return recent.slice(-Math.max(1, Math.min(limit, MAX_RECENT)))
}

export async function getStats() {
  const out = {
    file: FILE,
    inMemoryRecent: recent.length,
    byType: {},
    topTracks: [],
    completionRate: null,
    avgListenSeconds: null,
    errors24h: 0,
    last24hCount: 0,
  }
  let lines = []
  try { lines = (await fs.readFile(FILE, 'utf8')).split(/\r?\n/).filter(Boolean) } catch {}

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  const trackStats = new Map() // trackId → { plays, completes, skips, totalListen, title }
  let totalListen = 0; let listenCount = 0

  for (const line of lines) {
    try {
      const e = JSON.parse(line)
      out.byType[e.type] = (out.byType[e.type] || 0) + 1
      if (e.ts >= dayAgo) {
        out.last24hCount++
        if (e.type === 'error') out.errors24h++
      }
      if (e.trackId) {
        let t = trackStats.get(e.trackId)
        if (!t) { t = { id: e.trackId, plays: 0, completes: 0, skips: 0, totalListen: 0, title: '' }; trackStats.set(e.trackId, t) }
        if (e.trackTitle && !t.title) t.title = e.trackTitle
        if (e.type === 'play') t.plays++
        if (e.type === 'complete') t.completes++
        if (e.type === 'skip') t.skips++
        if ((e.type === 'pause' || e.type === 'complete' || e.type === 'skip') && Number.isFinite(e.position) && e.position > 0) {
          t.totalListen += e.position
          totalListen += e.position
          listenCount++
        }
      }
    } catch {}
  }

  const tracks = Array.from(trackStats.values())
  tracks.sort((a, b) => b.plays - a.plays)
  out.topTracks = tracks.slice(0, 10)

  const totalPlays = tracks.reduce((acc, t) => acc + t.plays, 0)
  const totalCompletes = tracks.reduce((acc, t) => acc + t.completes, 0)
  out.completionRate = totalPlays > 0 ? +(totalCompletes / totalPlays).toFixed(3) : null
  out.avgListenSeconds = listenCount > 0 ? Math.round(totalListen / listenCount) : null
  out.totalEvents = lines.length

  return out
}
