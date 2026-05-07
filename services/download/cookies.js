import fs from 'fs'
import os from 'os'
import path from 'path'
import { monitor } from './monitor.js'

const COOKIES_DIR = path.join(os.tmpdir(), 'dz-tube-cookies')
try { fs.mkdirSync(COOKIES_DIR, { recursive: true }) } catch {}

let _cookiesPathCache = null

export async function getCookiesPath() {
  if (_cookiesPathCache) return _cookiesPathCache

  const raw = process.env.YOUTUBE_COOKIES
  if (!raw || !raw.trim()) return null

  try {
    const p = path.join(COOKIES_DIR, 'cookies.txt')
    fs.writeFileSync(p, raw.trim(), { mode: 0o600 })
    _cookiesPathCache = p
    monitor.info('[cookies] Loaded YOUTUBE_COOKIES from env → ' + p)
    return p
  } catch (e) {
    monitor.warn('[cookies] Failed to write cookies file: ' + e.message)
    return null
  }
}

export function resetCookiesCache() {
  _cookiesPathCache = null
}

export async function cookiesArgs() {
  const p = await getCookiesPath()
  return p ? ['--cookies', p] : []
}

export function hasCookies() {
  return !!(process.env.YOUTUBE_COOKIES || '').trim()
}

export function cookiesStatus() {
  return {
    configured: hasCookies(),
    path: _cookiesPathCache || null,
    source: hasCookies() ? 'env:YOUTUBE_COOKIES' : null,
  }
}
