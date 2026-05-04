#!/usr/bin/env node
/**
 * update-changelog.mjs
 * تشغيل: node scripts/update-changelog.mjs
 * يقرأ git log ويُحدِّث CHANGELOG.md تلقائياً بآخر commit
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, '..')
const CHANGELOG = resolve(ROOT, 'CHANGELOG.md')

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim()
}

// ── Category detection ──────────────────────────────────────────────────────
function classify(subject) {
  const s = subject.toLowerCase()
  if (s.startsWith('feat') || s.includes('add') || s.includes('مضاف'))     return '✨ مضاف'
  if (s.startsWith('fix')  || s.includes('إصلاح') || s.includes('repair')) return '🐛 إصلاح'
  if (s.startsWith('perf') || s.includes('تحسين') || s.includes('optim'))  return '🔧 محسَّن'
  if (s.startsWith('refactor') || s.includes('إعادة'))                      return '♻️ إعادة هيكلة'
  if (s.startsWith('docs') || s.includes('توثيق'))                          return '📖 توثيق'
  if (s.startsWith('chore') || s.includes('تنظيف'))                         return '🔩 صيانة'
  return '🔧 محسَّن'
}

// ── Get last 50 commits ─────────────────────────────────────────────────────
const raw = run('git log --pretty=format:"%H|%ad|%s" --date=short -50')
const commits = raw.split('\n').map(line => {
  const [hash, date, ...rest] = line.split('|')
  return { hash: hash?.slice(0, 7), date, subject: rest.join('|') }
}).filter(c => c.hash && c.date && c.subject)

// ── Group by date ────────────────────────────────────────────────────────────
const byDate = {}
for (const c of commits) {
  if (!byDate[c.date]) byDate[c.date] = []
  byDate[c.date].push(c)
}

// ── Build new entries ─────────────────────────────────────────────────────────
const headCommit = run('git rev-parse --short HEAD')
const branch     = run('git rev-parse --abbrev-ref HEAD')
const today      = new Date().toISOString().slice(0, 10)

let entriesBlock = ''
for (const date of Object.keys(byDate).sort((a, b) => b.localeCompare(a))) {
  const dayCommits = byDate[date]

  // Group by category
  const cats = {}
  for (const c of dayCommits) {
    const cat = classify(c.subject)
    if (!cats[cat]) cats[cat] = []
    cats[cat].push(c)
  }

  entriesBlock += `\n---\n\n## [${date}]\n\n`
  for (const [cat, items] of Object.entries(cats)) {
    entriesBlock += `### ${cat}\n`
    for (const item of items) {
      entriesBlock += `- ${item.subject} \`${item.hash}\`\n`
    }
    entriesBlock += '\n'
  }
}

// ── Write CHANGELOG ───────────────────────────────────────────────────────────
const header = `# CHANGELOG — DZ GPT 🇩🇿

> سجل تلقائي لكل التحسينات والتغييرات في المشروع.
> يُحدَّث بتشغيل: \`node scripts/update-changelog.mjs\`
`

const footer = `\n---\n\n> **آخر تحديث تلقائي:** ${today}  \n> **Commit HEAD:** \`${headCommit}\`  \n> **الفرع الحالي:** \`${branch}\`\n`

writeFileSync(CHANGELOG, header + entriesBlock + footer, 'utf8')

console.log(`✅ CHANGELOG.md محدَّث — ${commits.length} commit(s) من ${Object.keys(byDate).length} يوم/أيام`)
console.log(`📄 HEAD: ${headCommit} | branch: ${branch}`)
