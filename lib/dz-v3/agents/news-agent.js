// V3 News Agent — fetches and organizes news from existing V1 sources.
import { internalFetch } from '../host.js'

export const NewsAgent = {
  name: 'news',
  description: 'Scrapes & aggregates Algerian + global news (RSS, djazairess, lfp.dz, Google News)',

  async run({ query, lang, bus }) {
    bus.emit('agent.start', { agent: 'news' })
    bus.emit('agent.thought', { agent: 'news', text: `Fetching news for: "${query || 'latest'}"` })

    const data = await internalFetch(`/api/dz-agent/news?q=${encodeURIComponent(query || '')}&limit=12`)
    const items = Array.isArray(data?.items) ? data.items : []
    bus.emit('agent.tool', { agent: 'news', tool: '/api/dz-agent/news', got: items.length, error: data?.error || null })

    const top = items.slice(0, 8).map(it => ({
      title: it.title || it.headline || '',
      link: it.link || it.url || '',
      source: it.source || it.feed || '',
      published: it.published || it.pubDate || null,
    }))

    bus.emit('agent.result', { agent: 'news', count: top.length })
    return { items: top, raw: items.length }
  },
}
