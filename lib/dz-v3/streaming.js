// DZ Agent V3 — Server-Sent Events helper.
// Streams a task's agent log live. Replays history first, then subscribes
// to new events until the task completes or the client disconnects.

import { getTask } from './task-manager.js'

export function streamTaskSSE(req, res, taskId) {
  const task = getTask(taskId)
  if (!task) {
    res.status(404).json({ ok: false, error: 'task not found' })
    return
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  const send = (evt) => {
    try {
      res.write(`event: ${evt.kind}\n`)
      res.write(`data: ${JSON.stringify(evt)}\n\n`)
    } catch {}
  }

  // 1) replay history
  for (const evt of task.agentLog) send(evt)

  // 2) subscribe to live (if task still running)
  let unsub = null
  if (task.bus) {
    unsub = task.bus.subscribe(send)
  }

  // 3) heartbeat to keep connection alive
  const hb = setInterval(() => {
    try { res.write(': ping\n\n') } catch {}
  }, 15000)

  // 4) end on terminal status (or disconnect)
  const finish = () => {
    clearInterval(hb)
    if (unsub) unsub()
    try { res.end() } catch {}
  }

  req.on('close', finish)

  if (task.status === 'done' || task.status === 'error') {
    setTimeout(finish, 50)
  } else {
    // Auto-close after a hard cap (Vercel function limit ≈ 60s)
    setTimeout(finish, 55_000)
  }
}
