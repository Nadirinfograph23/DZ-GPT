/**
 * DZ Agent V5 — Web Search Tool
 * Uses Google CSE + DuckDuckGo fallback for real-time web search.
 */

export class WebSearchTool {
  async execute(input, _ctx) {
    const query = typeof input === 'string' ? input : input.query
    if (!query) return { error: 'No query provided' }

    // Try Google CSE first
    const googleResult = await this._googleCSE(query)
    if (googleResult && googleResult.length > 0) {
      return { output: googleResult, source: 'google', query }
    }

    // Fallback: DuckDuckGo Instant Answer
    const ddgResult = await this._duckDuckGo(query)
    if (ddgResult) return { output: ddgResult, source: 'ddg', query }

    return { error: 'All search providers failed', query }
  }

  async _googleCSE(query) {
    const apiKey = process.env.GOOGLE_API_KEY
    const cx = process.env.GOOGLE_CSE_ID || '12e6f922595f64d35'
    if (!apiKey) return null

    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=5`
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      const data = await res.json()

      if (!data.items?.length) return null
      return data.items.map(item => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        source: item.displayLink,
      }))
    } catch { return null }
  }

  async _duckDuckGo(query) {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      const data = await res.json()

      const results = []
      if (data.AbstractText) {
        results.push({ title: data.Heading || query, snippet: data.AbstractText, url: data.AbstractURL, source: 'DuckDuckGo' })
      }
      if (data.RelatedTopics?.length > 0) {
        data.RelatedTopics.slice(0, 4).forEach(t => {
          if (t.Text && t.FirstURL) {
            results.push({ title: t.Text.slice(0, 80), snippet: t.Text, url: t.FirstURL, source: 'DuckDuckGo' })
          }
        })
      }
      return results.length > 0 ? results : null
    } catch { return null }
  }
}
