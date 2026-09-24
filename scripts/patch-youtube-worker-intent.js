import fs from 'node:fs'

const path = 'workers/entry.js'
const source = fs.readFileSync(path, 'utf8')

// The Worker has a dedicated YouTube path, but its historical intent regex
// only recognized "شرح ... فيديو". A normal request such as
// "شرح أدوات الفوتوشوب" therefore fell through to generic AI even though the
// YouTube Insight controller was healthy. Patch the deployed Worker source at
// build time so the production runtime recognizes tutorial/search intent.
const old = "شرح .*فيديو|tutorial|how to"
const replacement = "شرح\\s+(?:.*(?:فيديو|دروس|درس|أدوات|برنامج|برامج|فوتوشوب|photoshop|excel|word|برمجة|تعلم|تعليم))|دروس\\s+.+|tutorials?|how\\s+to\\s+.+|تعلم\\s+.+|تعليم\\s+.+"

if (!source.includes(old)) {
  console.log('[YouTube intent patch] source already patched or pattern changed; leaving file untouched')
  process.exit(0)
}

const updated = source.replace(old, replacement)
if (updated === source) throw new Error('YouTube intent patch made no change')
fs.writeFileSync(path, updated)
console.log('[YouTube intent patch] applied successfully')
