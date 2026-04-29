// V3 Research Agent — open-web search + smart agent ask.
import { internalFetch } from '../host.js'

export const ResearchAgent = {
  name: 'research',
  description: 'Open-web research via Google CSE + smart agent ask + news fusion',

  async run({ query, bus }) {
    bus.emit('agent.start', { agent: 'research' })
    bus.emit('agent.thought', { agent: 'research', text: `Searching the open web for: "${query}"` })

    // Race smart agent + raw search to get richest result
    const [askRes, searchRes] = await Promise.all([
      internalFetch(`/api/agent/ask?q=${encodeURIComponent(query)}&limit=6`),
      internalFetch(`/api/dz-agent-search`, {
        method: 'POST',
        body: JSON.stringify({ query }),
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => null),
    ])

    const sources = []
    if (askRes?.results) {
      for (const r of askRes.results.slice(0, 6)) {
        sources.push({ title: r.title || '', url: r.url || r.link || '', snippet: (r.snippet || '').slice(0, 240) })
      }
    }
    if (searchRes?.items) {
      for (const r of searchRes.items.slice(0, 6)) {
        sources.push({ title: r.title || '', url: r.url || r.link || '', snippet: (r.snippet || '').slice(0, 240) })
      }
    }
    bus.emit('agent.tool', { agent: 'research', tool: 'agent/ask + dz-agent-search', got: sources.length })

    // De-dupe by URL
    const seen = new Set(); const uniq = []
    for (const s of sources) {
      if (!s.url || seen.has(s.url)) continue
      seen.add(s.url); uniq.push(s)
    }

    bus.emit('agent.result', { agent: 'research', count: uniq.length })
    return { sources: uniq.slice(0, 8) }
  },
}
