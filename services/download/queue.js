import { monitor } from './monitor.js'
import { sleep } from './antiBot.js'
import crypto from 'crypto'
import fs from 'fs'

const MAX_CONCURRENT = 3
const MAX_QUEUE_SIZE = 20
const JOB_TTL_MS = 10 * 60 * 1000

const _jobs = new Map()
let _running = 0

function makeJobId() {
  return crypto.randomBytes(8).toString('hex')
}

export function createJob(meta = {}) {
  if (_jobs.size >= MAX_QUEUE_SIZE) {
    pruneExpired()
    if (_jobs.size >= MAX_QUEUE_SIZE) throw new Error('قائمة التحميل ممتلئة. حاول مجدداً بعد قليل.')
  }
  const id = makeJobId()
  const job = {
    id,
    status: 'queued',
    progress: 0,
    meta,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    outPath: null,
    error: null,
    cancel: null,
    _cancelled: false,
  }
  _jobs.set(id, job)
  monitor.downloadEvent('job_created', { id, meta })
  return job
}

export function getJob(id) { return _jobs.get(id) || null }

export function cancelJob(id) {
  const job = _jobs.get(id)
  if (!job) return false
  job._cancelled = true
  job.status = 'cancelled'
  if (job.cancel) { try { job.cancel() } catch {} }
  if (job.outPath) { try { fs.unlinkSync(job.outPath) } catch {} }
  monitor.downloadEvent('job_cancelled', { id })
  return true
}

export function listJobs() {
  pruneExpired()
  return Array.from(_jobs.values()).map(j => ({
    id: j.id, status: j.status, progress: j.progress,
    meta: j.meta, createdAt: j.createdAt, finishedAt: j.finishedAt,
    error: j.error,
  }))
}

export function pruneExpired() {
  const now = Date.now()
  for (const [id, job] of _jobs) {
    if (['done', 'error', 'cancelled'].includes(job.status) && now - (job.finishedAt || job.createdAt) > JOB_TTL_MS) {
      if (job.outPath) { try { fs.unlinkSync(job.outPath) } catch {} }
      _jobs.delete(id)
    }
  }
}

export function queueStats() {
  pruneExpired()
  let queued = 0, running = 0, done = 0, error = 0
  for (const j of _jobs.values()) {
    if (j.status === 'queued') queued++
    else if (j.status === 'running') running++
    else if (j.status === 'done') done++
    else if (j.status === 'error') error++
  }
  return { queued, running, done, error, total: _jobs.size, maxConcurrent: MAX_CONCURRENT }
}

export async function enqueue(job, fn) {
  while (_running >= MAX_CONCURRENT) {
    if (job._cancelled) { job.status = 'cancelled'; return }
    await sleep(200)
  }
  if (job._cancelled) { job.status = 'cancelled'; return }

  _running++
  job.status = 'running'
  job.startedAt = Date.now()
  monitor.downloadEvent('job_start', { id: job.id })

  try {
    const result = await fn(job)
    if (!job._cancelled) {
      job.status = 'done'
      job.progress = 100
      job.finishedAt = Date.now()
      monitor.downloadEvent('job_done', { id: job.id, ms: job.finishedAt - job.startedAt })
    }
    return result
  } catch (e) {
    if (!job._cancelled) {
      job.status = 'error'
      job.error = e.message
      job.finishedAt = Date.now()
      monitor.downloadEvent('job_error', { id: job.id, error: e.message.slice(0, 200) })
    }
    throw e
  } finally {
    _running--
  }
}

scheduleQueueCleanup()
function scheduleQueueCleanup() {
  setInterval(pruneExpired, 5 * 60 * 1000)
}
