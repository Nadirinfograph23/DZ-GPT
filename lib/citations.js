// DZ Agent — Perplexity-style numbered inline citations.
// Pure functions. Used by responder.js and the deep-research engine.

// Build a citation registry from a list of source items.
// Each source must have at least { title, url }. Adds source/host as metadata.
export function buildCitations(items = []) {
  const registry = []
  const seen = new Map()  // url -> citation index
  let idx = 1
  for (const it of items) {
    const url = it.url || it.link || ''
    if (!url) continue
    if (seen.has(url)) continue
    seen.set(url, idx)
    let host = ''
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch {}
    registry.push({
      n: idx,
      title: (it.title || it.repo || host || url).slice(0, 200),
      url,
      host,
      source: it.source || it.feedName || host,
      pubDate: it.pubDate || it.publishedDate || null,
    })
    idx++
  }
  return registry
}

// Insert citation markers into a text body. Heuristic: for each sentence,
// match best source by keyword overlap and append [n]. Already-cited
// sentences are skipped.
export function attachInlineCitations(text, registry) {
  if (!text || !registry?.length) return text
  const sentences = text.split(/(?<=[.!?؟])\s+/)
  return sentences.map(s => {
    if (!s.trim() || /\[\d+\]/.test(s)) return s
    const best = bestMatch(s, registry)
    if (!best) return s
    return s.replace(/[\s.,؛،]*$/, m => ` [${best.n}]${m}`)
  }).join(' ')
}

function bestMatch(sentence, registry) {
  const tokens = new Set(
    sentence.toLowerCase()
      .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
      .split(/\s+/).filter(t => t.length > 3)
  )
  let bestScore = 0
  let best = null
  for (const c of registry) {
    const text = `${c.title} ${c.source}`.toLowerCase()
    let score = 0
    for (const t of tokens) if (text.includes(t)) score++
    if (score > bestScore) { bestScore = score; best = c }
  }
  return bestScore >= 1 ? best : null
}

// Render a JSON-serializable map of citations for the API response.
// The frontend can use this to render the [n] superscripts as links.
export function exportCitations(registry) {
  return registry.map(c => ({
    n: c.n,
    title: c.title,
    url: c.url,
    host: c.host,
    source: c.source,
    pubDate: c.pubDate,
  }))
}

// Strip any model-emitted bibliography section (Perplexity rule: no biblio).
export function stripBibliography(text) {
  if (!text) return text
  return text
    .replace(/\n+#+\s*(References|Sources|Bibliography|المراجع|المصادر)\b[\s\S]*$/i, '')
    .replace(/\n+(References|Sources|المراجع|المصادر):?\s*\n[\s\S]*$/i, '')
    .trim()
}
