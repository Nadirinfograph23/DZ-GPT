// Small RSS/Atom parser for the Worker build.
// The full package is Node-oriented and is only used by the Eddirasa crawler.
function decode(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

function parseBlock(block) {
  const item = {}
  const tag = /<([A-Za-z][\w:.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g
  let match
  while ((match = tag.exec(block))) {
    const name = match[1]
    if (name === 'item' || name === 'entry') continue
    item[name] = decode(match[2].replace(/<[^>]+>/g, ''))
  }
  return item
}

export class XMLParser {
  constructor() {}

  parse(xml = '') {
    const rssItems = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
      .map(match => parseBlock(match[1]))
    if (rssItems.length) return { rss: { channel: { item: rssItems } } }

    const atomEntries = [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)]
      .map(match => parseBlock(match[1]))
    return { feed: { entry: atomEntries } }
  }
}