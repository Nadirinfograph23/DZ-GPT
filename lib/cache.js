// DZ Agent — LRU + TTL cache (additive, non-breaking).
// Generic cache used by the smart router, news engine, github engine,
// and structured response engine. Zero dependencies.

export class LRUCache {
  constructor({ maxSize = 200, ttl = 10 * 60 * 1000 } = {}) {
    this.max = maxSize
    this.ttl = ttl
    this.map = new Map()
  }
  _now() { return Date.now() }
  has(key) {
    const e = this.map.get(key)
    if (!e) return false
    if (this._now() - e.ts > this.ttl) { this.map.delete(key); return false }
    return true
  }
  get(key) {
    const e = this.map.get(key)
    if (!e) return null
    if (this._now() - e.ts > this.ttl) { this.map.delete(key); return null }
    // Refresh recency
    this.map.delete(key)
    this.map.set(key, e)
    return e.value
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, { value, ts: this._now() })
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value
      this.map.delete(oldest)
    }
    return value
  }
  invalidate(key) { return this.map.delete(key) }
  clear() { this.map.clear() }
  stats() {
    return { size: this.map.size, max: this.max, ttlMs: this.ttl }
  }
}

// Shared singletons used across the smart agent layer.
export const queryCache  = new LRUCache({ maxSize: 300, ttl: 10 * 60 * 1000 })  // 10 min
export const newsCache   = new LRUCache({ maxSize: 100, ttl: 8 * 60 * 1000 })   // 8 min
export const githubCache = new LRUCache({ maxSize: 200, ttl: 30 * 60 * 1000 })  // 30 min
export const builderCache= new LRUCache({ maxSize: 50,  ttl: 60 * 60 * 1000 })  // 60 min

// Stable cache key for free-text queries.
export function makeKey(prefix, query, extras = {}) {
  const norm = (query || '').toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 200)
  const tail = Object.keys(extras).sort().map(k => `${k}=${String(extras[k]).slice(0,40)}`).join('|')
  return `${prefix}:${norm}${tail ? '|' + tail : ''}`
}
