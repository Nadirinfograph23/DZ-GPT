// DZ Agent V4 PRO — parses the strict FILE: block format produced by the LLM.
// Tolerates minor LLM drift: optional language tag, trailing whitespace,
// CRLF line endings, leading prose before the first FILE: marker.

const FILE_LINE = /^\s*FILE:\s*(\/[^\s\n\r`]+)\s*$/m

export function parseFileBlocks(raw) {
  if (!raw || typeof raw !== 'string') return []
  const text = raw.replace(/\r\n/g, '\n')

  const files = []
  let cursor = 0

  while (cursor < text.length) {
    const rest = text.slice(cursor)
    const m = rest.match(FILE_LINE)
    if (!m) break
    const fileLineStart = cursor + m.index
    const fileLineEnd = fileLineStart + m[0].length
    const path = m[1]

    // Find the opening ``` after the FILE: line
    const afterLine = text.slice(fileLineEnd)
    const fenceOpen = afterLine.match(/```([a-zA-Z0-9+_-]*)\s*\n/)
    if (!fenceOpen) {
      cursor = fileLineEnd
      continue
    }
    const lang = (fenceOpen[1] || '').toLowerCase()
    const codeStart = fileLineEnd + fenceOpen.index + fenceOpen[0].length

    // Find closing ``` (on its own line ideally, but tolerate inline)
    const closeRel = text.slice(codeStart).search(/\n```\s*(?:\n|$)/)
    let content, nextCursor
    if (closeRel === -1) {
      // No closing fence — take until next FILE: or end of text
      const nextFile = text.slice(codeStart).search(/\n\s*FILE:\s*\//)
      if (nextFile === -1) {
        content = text.slice(codeStart).replace(/\n```\s*$/, '')
        nextCursor = text.length
      } else {
        content = text.slice(codeStart, codeStart + nextFile)
        nextCursor = codeStart + nextFile
      }
    } else {
      content = text.slice(codeStart, codeStart + closeRel)
      nextCursor = codeStart + closeRel + '\n```'.length
    }

    files.push({
      path: path.trim(),
      lang: lang || langFromPath(path),
      content: content.replace(/^\n+/, '').replace(/\s+$/, '\n'),
    })
    cursor = nextCursor
  }

  return files
}

export function langFromPath(p) {
  const ext = (p.split('.').pop() || '').toLowerCase()
  const map = {
    html: 'html', htm: 'html',
    css: 'css',
    js: 'js', mjs: 'js', cjs: 'js',
    ts: 'ts', tsx: 'tsx', jsx: 'jsx',
    json: 'json',
    php: 'php',
    md: 'md',
    yml: 'yaml', yaml: 'yaml',
    txt: 'txt',
  }
  return map[ext] || 'txt'
}

export function parseJsonObject(raw) {
  if (!raw) return null
  let s = String(raw).trim()
  // Strip code fences if the LLM ignored instructions
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // Find first { ... last }
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last === -1 || last < first) return null
  const slice = s.slice(first, last + 1)
  try {
    return JSON.parse(slice)
  } catch {
    // Best-effort: remove trailing commas
    try { return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1')) } catch { return null }
  }
}
