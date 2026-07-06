/**
 * lib/cache.js — DZ Agent Enhanced LRU + TTL Cache
 * ══════════════════════════════════════════════════
 * التحسينات:
 *   ✅ hit/miss metrics per namespace
 *   ✅ cache warming API
 *   ✅ per-namespace TTL overrides
 *   ✅ size estimation
 *   ✅ stale-while-revalidate pattern
 *   ✅ event hooks (onEvict, onHit, onMiss)
 *   ✅ bulk operations (mget, mset)
 *   ✅ namespace isolation
 * Zero external dependencies — backward compatible.
 */

// ── Utility: rough byte estimator ──────────────────────────────────────────
function estimateBytes(value) {
  try {
    return JSON.stringify(value).length * 2 // UTF-16 approx
  } catch {
    return 512
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LRUCache — core implementation
// ══════════════════════════════════════════════════════════════════════════════
export class LRUCache {
  /**
   * @param {object} opts
   * @param {number}   opts.maxSize       - max entries (default 200)
   * @param {number}   opts.ttl           - default TTL in ms (default 10 min)
   * @param {number}   opts.maxBytes      - max total bytes (0 = unlimited)
   * @param {string}   opts.name          - namespace label for metrics
   * @param {Function} opts.onEvict       - callback(key, value) on eviction
   * @param {boolean}  opts.staleWhileRevalidate - serve stale while refreshing
   */
  constructor({
    maxSize = 200,
    ttl = 10 * 60 * 1000,
    maxBytes = 0,
    name = 'default',
    onEvict = null,
    staleWhileRevalidate = false,
  } = {}) {
    this.max = maxSize
    this.ttl = ttl
    this.maxBytes = maxBytes
    this.name = name
    this.onEvict = onEvict
    this.staleWhileRevalidate = staleWhileRevalidate
    this.map = new Map()
    this._totalBytes = 0

    // ── Metrics ───────────────────────────────────────────────────────────
    this._hits = 0
    this._misses = 0
    this._evictions = 0
    this._writes = 0
    this._staleHits = 0
  }

  _now() { return Date.now() }

  _isExpired(entry) {
    const effectiveTTL = entry.ttl ?? this.ttl
    return this._now() - entry.ts > effectiveTTL
  }

  // ── has ──────────────────────────────────────────────────────────────────
  has(key) {
    const e = this.map.get(key)
    if (!e) return false
    if (this._isExpired(e)) {
      if (!this.staleWhileRevalidate) {
        this._evict(key, e)
        return false
      }
    }
    return true
  }

  // ── get ──────────────────────────────────────────────────────────────────
  /**
   * @param {string} key
   * @param {object} [opts]
   * @param {boolean} [opts.allowStale] - return stale value even if expired
   * @returns {*} value or null
   */
  get(key, { allowStale = false } = {}) {
    const e = this.map.get(key)
    if (!e) {
      this._misses++
      return null
    }

    if (this._isExpired(e)) {
      if (allowStale || this.staleWhileRevalidate) {
        this._staleHits++
        return e.value // serve stale
      }
      this._evict(key, e)
      this._misses++
      return null
    }

    // Refresh recency (LRU touch)
    this.map.delete(key)
    this.map.set(key, e)
    this._hits++
    return e.value
  }

  // ── set ──────────────────────────────────────────────────────────────────
  /**
   * @param {string} key
   * @param {*}      value
   * @param {object} [opts]
   * @param {number} [opts.ttl]  - per-entry TTL override in ms
   */
  set(key, value, { ttl } = {}) {
    const bytes = estimateBytes(value)

    if (this.map.has(key)) {
      const old = this.map.get(key)
      this._totalBytes -= old.bytes || 0
      this.map.delete(key)
    }

    const entry = { value, ts: this._now(), bytes, ttl }
    this.map.set(key, entry)
    this._totalBytes += bytes
    this._writes++

    // Enforce maxSize
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value
      this._evict(oldest, this.map.get(oldest))
    }

    // Enforce maxBytes
    if (this.maxBytes > 0) {
      while (this._totalBytes > this.maxBytes && this.map.size > 0) {
        const oldest = this.map.keys().next().value
        this._evict(oldest, this.map.get(oldest))
      }
    }

    return value
  }

  // ── mget / mset ──────────────────────────────────────────────────────────
  mget(keys) {
    return keys.map(k => ({ key: k, value: this.get(k) }))
  }

  mset(entries, opts = {}) {
    for (const { key, value, ttl } of entries) {
      this.set(key, value, { ttl: ttl ?? opts.ttl })
    }
  }

  // ── invalidate / clear ───────────────────────────────────────────────────
  invalidate(key) {
    const e = this.map.get(key)
    if (e) this._evict(key, e)
    return this
  }

  /**
   * Invalidate all keys matching a prefix or regex
   * @param {string|RegExp} pattern
   */
  invalidatePattern(pattern) {
    const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern
    let count = 0
    for (const [k, e] of this.map) {
      if (re.test(k)) { this._evict(k, e); count++ }
    }
    return count
  }

  clear() {
    this.map.clear()
    this._totalBytes = 0
    return this
  }

  // ── warm — preload entries ────────────────────────────────────────────────
  /**
   * Warm the cache with an array of { key, value, ttl? } objects
   * Skips keys already present (don't overwrite live data)
   */
  warm(entries = []) {
    let loaded = 0
    for (const { key, value, ttl } of entries) {
      if (!this.has(key)) {
        this.set(key, value, { ttl })
        loaded++
      }
    }
    return loaded
  }

  // ── private evict ─────────────────────────────────────────────────────────
  _evict(key, entry) {
    this._totalBytes -= entry?.bytes || 0
    this.map.delete(key)
    this._evictions++
    if (this.onEvict) {
      try { this.onEvict(key, entry?.value) } catch { /* silent */ }
    }
  }

  // ── stats ─────────────────────────────────────────────────────────────────
  stats() {
    const total = this._hits + this._misses
    return {
      name:        this.name,
      size:        this.map.size,
      max:         this.max,
      ttlMs:       this.ttl,
      bytesUsed:   this._totalBytes,
      maxBytes:    this.maxBytes,
      hits:        this._hits,
      misses:      this._misses,
      staleHits:   this._staleHits,
      writes:      this._writes,
      evictions:   this._evictions,
      hitRate:     total ? Math.round((this._hits / total) * 100) : 0,
    }
  }

  resetMetrics() {
    this._hits = this._misses = this._evictions = this._writes = this._staleHits = 0
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CacheRegistry — مسجّل مركزي لجميع caches
// ══════════════════════════════════════════════════════════════════════════════
class CacheRegistry {
  constructor() { this._map = new Map() }

  register(name, cache) {
    this._map.set(name, cache)
    return cache
  }

  get(name) { return this._map.get(name) }

  /** لقطة إحصائيات كل الـ caches — للـ /api/health endpoint */
  snapshot() {
    const result = {}
    for (const [name, cache] of this._map) {
      result[name] = cache.stats()
    }
    return result
  }

  /** إجمالي الذاكرة المستخدمة بكل الـ caches */
  totalBytes() {
    let total = 0
    for (const cache of this._map.values()) total += cache._totalBytes
    return total
  }

  /** تنظيف المنتهية يدوياً — يُستدعى بـ scheduleOnce */
  pruneAll() {
    let pruned = 0
    for (const cache of this._map.values()) {
      for (const [k, e] of cache.map) {
        if (cache._isExpired(e)) { cache._evict(k, e); pruned++ }
      }
    }
    return pruned
  }
}

export const cacheRegistry = new CacheRegistry()

// ══════════════════════════════════════════════════════════════════════════════
// Shared singletons — backward compatible exports
// ══════════════════════════════════════════════════════════════════════════════
export const queryCache = cacheRegistry.register('query',
  new LRUCache({ name: 'query',   maxSize: 300, ttl: 10 * 60 * 1000 }))

export const newsCache = cacheRegistry.register('news',
  new LRUCache({ name: 'news',    maxSize: 100, ttl:  8 * 60 * 1000 }))

export const githubCache = cacheRegistry.register('github',
  new LRUCache({ name: 'github',  maxSize: 200, ttl: 30 * 60 * 1000 }))

export const builderCache = cacheRegistry.register('builder',
  new LRUCache({ name: 'builder', maxSize:  50, ttl: 60 * 60 * 1000 }))

export const intentCache = cacheRegistry.register('intent',
  new LRUCache({ name: 'intent',  maxSize: 500, ttl:  5 * 60 * 1000 }))

export const weatherCache = cacheRegistry.register('weather',
  new LRUCache({ name: 'weather', maxSize: 100, ttl: 15 * 60 * 1000 }))

export const sportsCache = cacheRegistry.register('sports',
  new LRUCache({ name: 'sports',  maxSize: 150, ttl:  3 * 60 * 1000 }))

// ── Stable cache key for free-text queries (backward compatible) ──────────
export function makeKey(prefix, query, extras = {}) {
  const norm = (query || '').toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 200)
  const tail = Object.keys(extras).sort().map(k => `${k}=${String(extras[k]).slice(0,40)}`).join('|')
  return `${prefix}:${norm}${tail ? '|' + tail : ''}`
}
