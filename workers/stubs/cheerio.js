// Lightweight selector support for the Worker build.
// Full cheerio is retained for the Node runtime and is not needed by the
// dashboard routes served directly/through the Express bridge.
function decode(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function attrs(source = '') {
  const result = {}
  const re = /([:\w-]+)\s*=\s*(['"])(.*?)\2/g
  let match
  while ((match = re.exec(source))) result[match[1]] = match[3]
  return result
}

function nodesFrom(html = '') {
  const nodes = []
  const re = /<([A-Za-z][\w:-]*)([^>]*)>([\s\S]*?)<\/\1\s*>/gi
  let match
  while ((match = re.exec(html))) {
    nodes.push({
      tagName: match[1],
      attrs: attrs(match[2]),
      inner: match[3],
      outer: match[0],
    })
  }
  return nodes
}

function selectorMatches(node, selector) {
  selector = selector.trim()
  const tag = (selector.match(/^([A-Za-z][\w:-]*)/) || [])[1]
  if (tag && node.tagName.toLowerCase() !== tag.toLowerCase()) return false
  for (const cls of selector.matchAll(/\.([\w-]+)/g)) {
    if (!(node.attrs.class || '').split(/\s+/).includes(cls[1])) return false
  }
  for (const attr of selector.matchAll(/\[([\w:-]+)(?:=(["']?)(.*?)\2)?\]/g)) {
    const value = node.attrs[attr[1]]
    if (value == null) return false
    if (attr[3] && value !== attr[3]) return false
  }
  return Boolean(tag || /\./.test(selector) || /\[/.test(selector))
}

function wrap(items, rootHtml) {
  const list = Array.isArray(items) ? items : items ? [items] : []
  const api = {
    length: list.length,
    each(callback) {
      list.forEach((node, index) => callback(index, node))
      return api
    },
    first() {
      return wrap(list[0], rootHtml)
    },
    attr(name) {
      return list[0]?.attrs?.[name]
    },
    text() {
      return decode(list.map(node => node.inner ?? node.outer ?? '').join(' '))
    },
    html() {
      return list[0]?.inner || ''
    },
    find(selector) {
      return wrap(select(list.map(node => node.inner || '').join(' '), selector), rootHtml)
    },
    filter(callback) {
      return wrap(list.filter((node, index) => callback(index, node)), rootHtml)
    },
    closest(selector) {
      return wrap(list.find(node => selectorMatches(node, selector)), rootHtml)
    },
    remove() {
      return api
    },
  }
  return api
}

function select(html, selector) {
  const all = nodesFrom(html)
  return selector.split(',').flatMap(part => {
    const trimmed = part.trim()
    return all.filter(node => selectorMatches(node, trimmed))
  })
}

export function load(html = '') {
  const root = (value) => value && value.tagName ? wrap(value, html) : wrap(select(html, value), html)
  return root
}