import fs from 'node:fs'

const path = 'workers/entry.js'
const source = fs.readFileSync(path, 'utf8')

// Production is Cloudflare Worker, so this patch must be applied to the exact
// Worker entry that Wrangler bundles. Fail closed if the expected intent rule
// changes: an unpatched Worker must never be silently deployed.
const old = "شرح .*فيديو|tutorial|how to"
const replacement = "شرح\\s+(?:.*(?:فيديو|دروس|درس|أدوات|برنامج|برامج|فوتوشوب|photoshop|excel|word|برمجة|تعلم|تعليم))|دروس\\s+.+|tutorials?|how\\s+to\\s+.+|تعلم\\s+.+|تعليم\\s+.+"
const marker = 'دروس\\s+.+'

if (source.includes(old)) {
  const updated = source.replace(old, replacement)
  if (updated === source) throw new Error('[YouTube intent patch] replacement made no change')
  fs.writeFileSync(path, updated)
  console.log('[YouTube intent patch] applied to workers/entry.js')
} else if (source.includes(marker) && source.includes('tutorials?')) {
  console.log('[YouTube intent patch] already applied')
} else {
  throw new Error('[YouTube intent patch] REQUIRED YouTube intent pattern was not found; refusing to deploy an unpatched Worker')
}

const finalSource = fs.readFileSync(path, 'utf8')
if (!finalSource.includes('دروس\\s+.+') || !finalSource.includes('tutorials?') || !finalSource.includes('تعليم\\s+.+')) {
  throw new Error('[YouTube intent patch] post-patch verification failed')
}

console.log('[YouTube intent patch] verification passed: tutorial/search intent is present in the Worker source')
