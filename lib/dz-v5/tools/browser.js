/**
 * DZ Agent V5 — Browser Tool
 * Fetches, parses, and extracts information from web pages.
 * Provides Devin/Manus-style web browsing capability.
 */

const MAX_CONTENT_CHARS = 8000
const TIMEOUT_MS = 15000

export class BrowserTool {
  async execute(input, _ctx) {
    const url = typeof input === 'string' ? input : input.url
    const action = typeof input === 'object' ? (input.action || 'read') : 'read'
    const selector = typeof input === 'object' ? input.selector : null
    const extract = typeof input === 'object' ? input.extract : null

    if (!url) return { error: 'No URL provided' }

    // Validate URL
    let normalizedUrl = url
    if (!/^https?:\/\//i.test(url)) normalizedUrl = 'https://' + url

    try {
      new URL(normalizedUrl)
    } catch {
      return { error: `Invalid URL: ${url}` }
    }

    if (action === 'read' || action === 'fetch') {
      return await this._fetchPage(normalizedUrl, { selector, extract })
    }
    if (action === 'links') {
      return await this._extractLinks(normalizedUrl)
    }
    if (action === 'search') {
      return await this._searchPage(normalizedUrl, extract)
    }

    return await this._fetchPage(normalizedUrl, { selector, extract })
  }

  async _fetchPage(url, { selector, extract } = {}) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DZ-Agent/5.0; +https://dz-gpt.vercel.app)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      })
      clearTimeout(timer)

      if (!res.ok) return { error: `HTTP ${res.status}: ${res.statusText}`, url }

      const contentType = res.headers.get('content-type') || ''
      const html = await res.text()

      // Extract text content
      const text = this._htmlToText(html)
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
      const description = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i)?.[1]?.trim()

      let content = text
      if (extract) {
        content = this._extractByKeyword(text, extract)
      }

      return {
        output: content.slice(0, MAX_CONTENT_CHARS),
        url,
        title,
        description,
        contentType: contentType.split(';')[0],
        truncated: content.length > MAX_CONTENT_CHARS,
        fullLength: content.length,
      }
    } catch (err) {
      if (err.name === 'AbortError') return { error: 'Page fetch timed out', url }
      return { error: err.message, url }
    }
  }

  async _extractLinks(url) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZ-Agent/5.0)' },
      })
      const html = await res.text()
      const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)</gi
      const links = []
      let m
      while ((m = linkRe.exec(html)) !== null && links.length < 30) {
        const href = m[1]
        const text = m[2].trim()
        if (href && !href.startsWith('#') && !href.startsWith('javascript:') && text.length > 1) {
          const absoluteUrl = href.startsWith('http') ? href : new URL(href, url).href
          links.push({ url: absoluteUrl, text: text.slice(0, 100) })
        }
      }
      return { output: links, count: links.length, pageUrl: url }
    } catch (err) {
      return { error: err.message, url }
    }
  }

  _searchPage(url, keyword) {
    return this._fetchPage(url, { extract: keyword })
  }

  _htmlToText(html) {
    return html
      // Remove scripts and styles
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, '')
      // Replace block elements with newlines
      .replace(/<\/(div|p|section|article|h[1-6]|li|tr|td|th|br)[^>]*>/gi, '\n')
      // Remove all remaining tags
      .replace(/<[^>]+>/g, ' ')
      // Decode HTML entities
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      // Clean whitespace
      .replace(/\s{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
  }

  _extractByKeyword(text, keyword) {
    const kw = keyword.toLowerCase()
    const lines = text.split('\n')
    const relevant = []
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(kw)) {
        // Include context lines
        const start = Math.max(0, i - 1)
        const end = Math.min(lines.length - 1, i + 3)
        for (let j = start; j <= end; j++) {
          if (!relevant.includes(lines[j]) && lines[j].trim()) {
            relevant.push(lines[j])
          }
        }
      }
    })
    return relevant.length > 0 ? relevant.join('\n') : text
  }
}
