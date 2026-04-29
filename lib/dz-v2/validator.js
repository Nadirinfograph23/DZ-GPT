// DZ Agent V2 — Response Validation 2.0.
// Wraps any async generator with: empty-check → relevance-check →
// completeness-check → up to 3 regen attempts. Caller passes the generator
// fn and the original query; we return { content, attempts, rejectedReason }.

const PLACEHOLDER_RX = /^(null|undefined|n\/a|none|empty|---+|\.\.\.+|loading|please wait|error)\s*$/i
const SYSTEM_ECHO_RX = /^(system|assistant|user)\s*[:>]/i

function tokens(s) {
  return new Set(
    String(s || '')
      .toLowerCase()
      .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2),
  )
}

function relevance(query, answer) {
  const q = tokens(query)
  const a = tokens(answer)
  if (!q.size) return 1
  if (!a.size) return 0
  let hit = 0
  for (const t of q) if (a.has(t)) hit++
  return hit / q.size
}

export function isValid(text, query = '', { minLen = 20, minRelevance = 0 } = {}) {
  if (text === null || text === undefined) return { ok: false, reason: 'null' }
  if (typeof text !== 'string') return { ok: false, reason: 'not-string' }
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  if (cleaned.length < minLen) return { ok: false, reason: `too-short(${cleaned.length}<${minLen})` }
  if (PLACEHOLDER_RX.test(cleaned)) return { ok: false, reason: 'placeholder' }
  if (cleaned.length < 50 && SYSTEM_ECHO_RX.test(cleaned)) return { ok: false, reason: 'system-echo' }
  if (minRelevance > 0 && query) {
    const r = relevance(query, cleaned)
    if (r < minRelevance) return { ok: false, reason: `low-relevance(${r.toFixed(2)})` }
  }
  return { ok: true, reason: null }
}

// Run `gen()` up to maxAttempts times until a valid response is produced.
// `gen({ attempt, lastError })` is awaited each loop; returns string|null.
export async function generateWithRetry(gen, { query = '', maxAttempts = 3, minLen = 20, minRelevance = 0 } = {}) {
  let lastReason = null
  let lastContent = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let content
    try {
      content = await gen({ attempt, lastError: lastReason })
    } catch (err) {
      lastReason = `gen-throw(${err.message || err})`
      continue
    }
    const v = isValid(content, query, { minLen, minRelevance })
    if (v.ok) return { content, attempts: attempt, rejectedReason: null }
    lastReason = v.reason
    lastContent = content
  }
  return { content: lastContent, attempts: maxAttempts, rejectedReason: lastReason }
}
