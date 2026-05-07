import fs from 'fs'
import os from 'os'
import path from 'path'

const LOG_DIR = path.join(os.tmpdir(), 'dz-tube-logs')
try { fs.mkdirSync(LOG_DIR, { recursive: true }) } catch {}

const MAX_LOG_ENTRIES = 2000
const _downloadLog = []
const _errorLog = []
const _extractorLog = []

function ts() { return new Date().toISOString() }

function appendLog(arr, entry) {
  arr.push(entry)
  if (arr.length > MAX_LOG_ENTRIES) arr.splice(0, arr.length - MAX_LOG_ENTRIES)
}

export const monitor = {
  info(msg, meta = {}) {
    const entry = { ts: ts(), level: 'INFO', msg, ...meta }
    appendLog(_downloadLog, entry)
    console.log('[DLv2:INFO]', msg)
  },

  warn(msg, meta = {}) {
    const entry = { ts: ts(), level: 'WARN', msg, ...meta }
    appendLog(_downloadLog, entry)
    appendLog(_errorLog, entry)
    console.warn('[DLv2:WARN]', msg)
  },

  error(msg, meta = {}) {
    const entry = { ts: ts(), level: 'ERROR', msg, ...meta }
    appendLog(_downloadLog, entry)
    appendLog(_errorLog, entry)
    console.error('[DLv2:ERROR]', msg)
  },

  extractorEvent(event, data = {}) {
    const entry = { ts: ts(), event, ...data }
    appendLog(_extractorLog, entry)
    console.log(`[DLv2:extractor:${event}]`, JSON.stringify(data).slice(0, 200))
  },

  downloadEvent(event, data = {}) {
    const entry = { ts: ts(), event, ...data }
    appendLog(_downloadLog, entry)
    if (process.env.DZ_DEBUG === '1') {
      console.log(`[DLv2:download:${event}]`, JSON.stringify(data).slice(0, 300))
    }
  },

  getLogs(type = 'all', limit = 100) {
    const map = { download: _downloadLog, error: _errorLog, extractor: _extractorLog, all: _downloadLog }
    const arr = map[type] || _downloadLog
    return arr.slice(-limit)
  },

  getStats() {
    const now = Date.now()
    const lastHour = _downloadLog.filter(e => new Date(e.ts).getTime() > now - 3600000)
    const errors = lastHour.filter(e => e.level === 'ERROR').length
    const warnings = lastHour.filter(e => e.level === 'WARN').length
    return {
      totalLogEntries: _downloadLog.length,
      lastHourEvents: lastHour.length,
      lastHourErrors: errors,
      lastHourWarnings: warnings,
      extractorEvents: _extractorLog.length,
    }
  },
}

export default monitor
