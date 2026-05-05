import { app } from '../server.js'

// Message Ratings — added here to guarantee Vercel picks them up
const MESSAGE_RATINGS = new Map()

app.post('/api/dz-agent/ratings', (req, res) => {
  const { messageId, vote, query } = req.body || {}
  if (!messageId || !['up', 'down'].includes(vote)) {
    return res.status(400).json({ error: 'messageId and vote (up|down) required' })
  }
  MESSAGE_RATINGS.set(String(messageId), {
    vote,
    query: (query || '').slice(0, 300),
    ts: Date.now(),
  })
  res.json({ ok: true, total: MESSAGE_RATINGS.size })
})

app.get('/api/dz-agent/ratings/stats', (_req, res) => {
  const all = [...MESSAGE_RATINGS.values()]
  const up   = all.filter(r => r.vote === 'up').length
  const down = all.filter(r => r.vote === 'down').length
  const total = all.length
  const recent = [...MESSAGE_RATINGS.entries()]
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, 20)
    .map(([id, r]) => ({ id, ...r, tsIso: new Date(r.ts).toISOString() }))
  res.json({ total, up, down, ratio: total ? Math.round((up / total) * 100) : 0, recent })
})

export default app
