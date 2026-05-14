// lib/skills/dz-auto-fix-skill.js
// DZ-Auto-Fix-Skill — حلقة الإصلاح الذاتي
// يكتشف خطأ → يقترح إصلاح → يطبقه على GitHub → يُعيد المحاولة

import { analyzeError, buildDebugReport, extractErrorLocation } from './dz-debug-skill.js'
import { writeRepoFile, readRepoFile } from './dz-github-skill.js'

const MAX_RETRIES = 3

// ── تطبيق إصلاح TypeScript TS6133 (unused variable) ─────────────────────
async function fixUnusedVariable(owner, repo, errorText, branch, token) {
  const fixes = []
  const locations = extractErrorLocation(errorText)

  for (const loc of locations) {
    const { file, line } = loc
    if (!file || !line) continue

    try {
      const { content, sha } = await readRepoFile(owner, repo, file, branch, token)
      const lines = content.split('\n')
      const targetLine = lines[line - 1] || ''

      // Fix: prefix unused state variable with _
      const fixed = targetLine
        .replace(/const\s+\[(\w+),\s*set/g, (m, name) => `const [_${name}, set`)
        .replace(/const\s+(\w+)\s*=\s*(?!.*set[A-Z])/g, (m, name) => `const _${name} = `)

      if (fixed !== targetLine) {
        lines[line - 1] = fixed
        const newContent = lines.join('\n')
        const result = await writeRepoFile(owner, repo, file, newContent,
          `fix: suppress unused variable TS6133 in ${file}:${line}`, branch, token)
        fixes.push({ file, line, action: 'unused_var_prefixed', commitSha: result.commitSha })
      }
    } catch (err) {
      fixes.push({ file, line, action: 'failed', reason: err.message })
    }
  }
  return fixes
}

// ── تطبيق إصلاح .gitignore ────────────────────────────────────────────────
async function addGitignore(owner, repo, stack = [], branch, token) {
  const nodeIgnore = `node_modules/\ndist/\n.env\n.env.local\n.env.*.local\n*.log\n.DS_Store\nThumb.db\n`
  const pythonIgnore = `__pycache__/\n*.pyc\n*.pyo\n.env\nvenv/\n.venv/\ndist/\nbuild/\n*.egg-info/\n`

  const isPython = stack.some(s => ['Python', 'Django', 'Flask', 'FastAPI'].includes(s))
  const content = isPython ? pythonIgnore + nodeIgnore : nodeIgnore

  const result = await writeRepoFile(owner, repo, '.gitignore', content,
    'chore: add .gitignore by DZ Agent', branch, token)
  return { file: '.gitignore', action: 'created', commitSha: result.commitSha }
}

// ── تطبيق إصلاح README ────────────────────────────────────────────────────
async function addReadme(owner, repo, branch, token, stack = []) {
  const content = `# ${repo}

> مشروع تم إنشاؤه وتحليله بواسطة **DZ Agent** 🇩🇿

## 🚀 تشغيل المشروع

\`\`\`bash
npm install
npm run dev
\`\`\`

## 🛠️ التقنيات المستخدمة

${stack.map(s => `- ${s}`).join('\n')}

## 🤖 DZ Agent

تم توليد هذا الـ README تلقائياً بواسطة [DZ-GPT](https://dz-gpt.vercel.app).
`
  const result = await writeRepoFile(owner, repo, 'README.md', content,
    'docs: add README.md by DZ Agent', branch, token)
  return { file: 'README.md', action: 'created', commitSha: result.commitSha }
}

// ── حلقة الإصلاح الذاتي الرئيسية ─────────────────────────────────────────
export async function autoFixLoop({ owner, repo, errorText, branch = 'main', stack = [], token, onProgress }) {
  onProgress = onProgress || (() => {})
  const allFixes = []
  const report = buildDebugReport(errorText, stack)

  onProgress({ step: 'analyze', label: `🔍 نوع الخطأ: ${report.label}`, done: false })

  // TypeScript errors — إصلاح تلقائي
  if (report.errorType === 'typescript' && report.autoFixable) {
    onProgress({ step: 'fix', label: '🔧 تطبيق إصلاح TypeScript...', done: false })
    const tsFixes = await fixUnusedVariable(owner, repo, errorText, branch, token)
    allFixes.push(...tsFixes)
    const success = tsFixes.filter(f => f.action !== 'failed')
    if (success.length) {
      onProgress({ step: 'fix', label: `✅ تم إصلاح ${success.length} متغير غير مستخدم`, done: true })
    }
  }

  // Security: missing .gitignore
  const securityIssue = report.locations.length === 0 && errorText.includes('.env')
  if (securityIssue || stack.includes('security_missing_gitignore')) {
    onProgress({ step: 'security', label: '🔒 إضافة .gitignore لحماية الأسرار...', done: false })
    const f = await addGitignore(owner, repo, stack, branch, token)
    allFixes.push(f)
    onProgress({ step: 'security', label: '✅ .gitignore أُضيف', done: true })
  }

  onProgress({ step: 'done', label: `📋 الإصلاح انتهى — ${allFixes.length} إجراء مُنفَّذ`, done: true })

  return {
    fixed: allFixes.filter(f => f.action !== 'failed'),
    failed: allFixes.filter(f => f.action === 'failed'),
    report,
    suggestions: report.fixes,
  }
}

// ── توليد تقرير إصلاح نهائي ──────────────────────────────────────────────
export function buildAutoFixSummary(result) {
  const { fixed, failed, report, suggestions } = result
  const lines = [
    `## 🛠️ نتيجة Auto-Fix`,
    `**نوع الخطأ:** ${report.label}`,
    `**قابل للإصلاح التلقائي:** ${report.autoFixable ? '✅ نعم' : '❌ يحتاج تدخل يدوي'}`,
    '',
  ]

  if (fixed.length) {
    lines.push(`### ✅ إصلاحات مُطبَّقة (${fixed.length})`)
    fixed.forEach(f => lines.push(`- \`${f.file}:${f.line || ''}\` — ${f.action} | commit: \`${(f.commitSha || '').slice(0, 8)}\``))
    lines.push('')
  }

  if (failed.length) {
    lines.push(`### ❌ إصلاحات فاشلة (${failed.length})`)
    failed.forEach(f => lines.push(`- \`${f.file}\` — ${f.reason}`))
    lines.push('')
  }

  if (suggestions.length) {
    lines.push('### 💡 اقتراحات يدوية')
    suggestions.forEach(s => lines.push(`- ${s}`))
  }

  return lines.join('\n')
}
