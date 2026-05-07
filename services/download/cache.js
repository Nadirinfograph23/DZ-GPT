import { monitor } from './monitor.js'

const METADATA_TTL_MS = 30 * 60 * 1000
const URL_TTL_MS = 20 * 60 * 1000
const THUMBNAIL_TTL_MS = 60 * 60 * 1000
const MAX_ENTRIES = 500

class TTLCache {
  constructor(name, ttlMs, maxEntries = 500) {
    this._name = name
    this._ttl = ttlMs
    this._max = maxEntries
    this._store = new Map()
  }

  get(key) {
    const entry = this._store.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this._store.delete(key)
      return null
    }
    return entry.value
  }

  getStale(key) {
    const entry = this._store.get(key)
    return entry ? entry.value : null
  }

  set(key, value, ttlMs) {
    if (this._store.size >= this._max) {
      const overflow = this._store.size - this._max + 1
      let i = 0
      for (const k of this._store.keys()) {
        if (i++ >= overflow) break
        this._store.delete(k)
      }
    }
    this._store.set(key, { value, expiresAt: Date.now() + (ttlMs || this._ttl) })
  }

  delete(key) { this._store.delete(key) }
  clear() { this._store.clear() }
  size() { return this._store.size }

  stats() {
    const now = Date.now()
    let live = 0, expired = 0
    for (const [, v] of this._store) {
      if (v.expiresAt > now) live++; else expired++
    }
    return { name: this._name, total: this._store.size, live, expired }
  }
}

export const metadataCache = new TTLCache('metadata', METADATA_TTL_MS, MAX_ENTRIES)
export const urlCache = new TTLCache('url', URL_TTL_MS, 200)
export const thumbnailCache = new TTLCache('thumbnail', THUMBNAIL_TTL_MS, 300)

export function getCacheStats() {
  return {
    metadata: metadataCache.stats(),
    url: urlCache.stats(),
    thumbnail: thumbnailCache.stats(),
  }
}

export function purgeCaches() {
  metadataCache.clear()
  urlCache.clear()
  thumbnailCache.clear()
  monitor.info('[cache] All caches purged')
}
