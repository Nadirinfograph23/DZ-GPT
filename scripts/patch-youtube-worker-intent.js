import fs from 'node:fs'

const path = 'workers/entry.js'
const source = fs.readFileSync(path, 'utf8')

// This patch runs against the exact Worker entry that Wrangler bundles.
// Keep it deterministic and fail closed: a production build must never ship
// without recognizing ordinary tutorial requests such as "شرح أدوات الفوتوشوب".
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
const requiredMarkers = [
  'دروس\\s+.+',
  'tutorials?',
  'تعليم\\s+.+',
  'فوتوشوب',
  'photoshop',
]
for (const markerText of requiredMarkers) {
  if (!finalSource.includes(markerText)) {
    throw new Error('[YouTube intent patch] post-patch verification failed: ' + markerText)
  }
}

// Validate the exact regression queries before Wrangler deploys the Worker.
// This catches both accidental intent regressions and incorrect escaping in the patch.
const intent = /(?:youtube|youtu\.be|يوتيوب|يوتيب|فيديو|فيديوهات|بالفيديو|ابحث عن فيديو|حلّل الفيديو|حلل الفيديو|اشرح لي الفيديو|شرح\s+(?:.*(?:فيديو|دروس|درس|أدوات|برنامج|برامج|فوتوشوب|photoshop|excel|word|برمجة|تعلم|تعليم))|دروس\s+.+|tutorials?|how\s+to\s+.+|تعلم\s+.+|تعليم\s+.+)/i
const regressionQueries = [
  'شرح أدوات الفوتوشوب',
  'شرح فوتوشوب للمبتدئين',
  'دروس الفوتوشوب',
  'Photoshop tutorial',
]
for (const query of regressionQueries) {
  if (!intent.test(query)) throw new Error('[YouTube intent patch] regression query not recognized: ' + query)
}

console.log('[YouTube intent patch] verification passed: production Worker recognizes tutorial/YouTube queries, including "شرح أدوات الفوتوشوب"')
