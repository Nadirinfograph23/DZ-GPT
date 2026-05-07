import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { monitor } from './monitor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUNDLED_BIN = path.resolve(__dirname, '../../bin/yt-dlp')

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
    const proc = spawn(bin || 'yt-dlp', ['-U'], { timeout: 120000 })
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

// Try to update the bundled binary via GitHub releases
async function downloadLatestBundledBin() {
  try {
    monitor.info('[updater] Checking latest yt-dlp release from GitHub...')
    const r = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'DZ-GPT-yt-dlp-updater' },
    })
    if (!r.ok) return false
    const release = await r.json()
    const asset = (release.assets || []).find(a => a.name === 'yt-dlp')
    if (!asset) return false

    monitor.info(`[updater] Downloading yt-dlp ${release.tag_name} to bundled location...`)
    const bin = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(60000) })
    if (!bin.ok) return false

    const fs = await import('fs')
    const buffer = await bin.arrayBuffer()
    fs.writeFileSync(BUNDLED_BIN, Buffer.from(buffer), { mode: 0o755 })
    monitor.info(`[updater] Bundled yt-dlp updated to ${release.tag_name}`)
    return release.tag_name
  } catch (e) {
    monitor.warn('[updater] Failed to download latest binary: ' + e.message)
    return false
  }
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

    // Try self-update first (works when not Nix-managed)
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

      // Try downloading the bundled binary as last resort
      monitor.info(`[updater] yt-dlp is Nix-managed (${version}) — attempting bundled binary update`)
      const newTag = await downloadLatestBundledBin()
      if (newTag) {
        // Reset bin cache so next call picks up the new bundled binary
        const { resetBinCache } = await import('./extractor.js')
        resetBinCache()
        return { status: 'bundled_updated', version: newTag }
      }

      monitor.info(`[updater] yt-dlp Nix-managed (${version}) — using as-is`)
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
