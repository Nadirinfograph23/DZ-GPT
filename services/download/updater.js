import { spawn } from 'child_process'
import { monitor } from './monitor.js'

let _lastCheckTs = 0
let _currentVersion = null
let _updateInProgress = false
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

async function getYtDlpVersion(bin) {
  return new Promise((resolve) => {
    const proc = spawn(bin || 'yt-dlp', ['--version'])
    let out = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.on('error', () => resolve(null))
    proc.on('close', code => resolve(code === 0 ? out.trim() : null))
  })
}

async function selfUpdateYtDlp(bin) {
  return new Promise((resolve) => {
    monitor.info('[updater] Trying yt-dlp -U (self-update)...')
    const proc = spawn(bin || 'yt-dlp', ['-U'], { timeout: 60000 })
    let out = '', err = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.stderr.on('data', d => { err += d.toString() })
    proc.on('error', e => { resolve({ ok: false, reason: e.message, needsPip: false }) })
    proc.on('close', code => {
      const combined = (out + err).toLowerCase()
      const needsPip = combined.includes('pip') || combined.includes('wheel') || combined.includes('pypi') || combined.includes('package manager')
      if (code === 0) {
        monitor.info('[updater] yt-dlp self-update OK')
        resolve({ ok: true, needsPip: false })
      } else {
        monitor.warn(`[updater] yt-dlp -U failed (exit ${code}): ${(err || out).trim().slice(0, 200)}`)
        resolve({ ok: false, reason: (err || out).trim().slice(0, 200), needsPip })
      }
    })
  })
}

async function pipUpdateYtDlp() {
  return new Promise((resolve) => {
    monitor.info('[updater] Trying pip install -U yt-dlp...')
    const proc = spawn('pip', ['install', '-U', 'yt-dlp', '--quiet'], { timeout: 90000 })
    let out = '', err = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.stderr.on('data', d => { err += d.toString() })
    proc.on('error', e => { monitor.warn('[updater] pip update error: ' + e.message); resolve(false) })
    proc.on('close', code => {
      if (code === 0) {
        monitor.info('[updater] pip install -U yt-dlp succeeded')
        resolve(true)
      } else {
        monitor.warn('[updater] pip install -U yt-dlp failed: ' + (err || out).slice(0, 200))
        resolve(false)
      }
    })
  })
}

export async function checkAndUpdateYtDlp(bin) {
  if (_updateInProgress) return { status: 'in_progress', version: _currentVersion }
  const now = Date.now()
  if (_lastCheckTs && now - _lastCheckTs < CHECK_INTERVAL_MS) {
    return { status: 'cached', version: _currentVersion }
  }

  _updateInProgress = true
  _lastCheckTs = now

  try {
    const version = await getYtDlpVersion(bin)
    if (!version) {
      monitor.warn('[updater] Could not determine yt-dlp version')
      return { status: 'unavailable', version: null }
    }
    _currentVersion = version
    monitor.info(`[updater] yt-dlp current version: ${version}`)

    const selfResult = await selfUpdateYtDlp(bin)

    if (selfResult.ok) {
      const newVersion = await getYtDlpVersion(bin)
      _currentVersion = newVersion || version
      if (newVersion && newVersion !== version) {
        monitor.info(`[updater] Updated: ${version} → ${newVersion}`)
        return { status: 'updated', from: version, to: newVersion }
      }
      return { status: 'already_latest', version: _currentVersion }
    }

    if (selfResult.needsPip) {
      monitor.info('[updater] yt-dlp is pip/Nix managed — trying pip install -U yt-dlp')
      const pipOk = await pipUpdateYtDlp()
      if (pipOk) {
        const newVersion = await getYtDlpVersion(bin)
        _currentVersion = newVersion || version
        if (newVersion && newVersion !== version) {
          monitor.info(`[updater] pip updated: ${version} → ${newVersion}`)
          return { status: 'pip_updated', from: version, to: newVersion }
        }
        return { status: 'pip_already_latest', version: _currentVersion }
      }
      monitor.info(`[updater] yt-dlp is Nix-managed (${version}) — skipping update, version is current`)
      return { status: 'managed_by_nix', version: _currentVersion }
    }

    return { status: 'update_failed', version: _currentVersion, reason: selfResult.reason }
  } catch (e) {
    monitor.warn('[updater] Update check error: ' + e.message)
    return { status: 'error', error: e.message, version: _currentVersion }
  } finally {
    _updateInProgress = false
  }
}

export function getCurrentVersion() { return _currentVersion }
export function getLastCheckTs() { return _lastCheckTs }
