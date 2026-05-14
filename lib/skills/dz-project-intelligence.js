// lib/skills/dz-project-intelligence.js
// DZ Project Intelligence — تحليل عميق لإعدادات أي مشروع GitHub
// يقرأ: package.json, vite.config, tsconfig, next.config, Dockerfile, workflows, requirements.txt

import { readRepoFile, listRepoDirectory } from './dz-github-skill.js'

// ── أسماء ملفات الإعداد الأساسية لكل بيئة ────────────────────────────────
const CONFIG_FILES = [
  'package.json', 'package-lock.json',
  'vite.config.js', 'vite.config.ts',
  'next.config.js', 'next.config.mjs', 'next.config.ts',
  'tsconfig.json', 'tsconfig.app.json',
  'tailwind.config.js', 'tailwind.config.ts',
  'vercel.json', 'netlify.toml',
  '.env.example', '.env',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  'requirements.txt', 'pyproject.toml', 'setup.py',
  'README.md', '.gitignore',
  'eslint.config.js', '.eslintrc.json', '.eslintrc.js',
  'postcss.config.js', 'postcss.config.mjs',
]

const WORKFLOW_DIR = '.github/workflows'

// ── تحليل كامل وعميق للمشروع ─────────────────────────────────────────────
export async function analyzeProjectDeep(owner, repo, branch = 'main', token) {
  const result = {
    owner, repo, branch,
    configs: {},
    dependencies: { prod: [], dev: [], total: 0 },
    framework: null,
    buildTool: null,
    deployTarget: null,
    nodeVersion: null,
    pythonVersion: null,
    scripts: {},
    workflows: [],
    envVars: [],
    issues: [],
    suggestions: [],
    analyzedAt: new Date().toISOString(),
  }

  // قراءة الملفات المتعددة بالتوازي
  const reads = await Promise.allSettled(
    CONFIG_FILES.map(f =>
      readRepoFile(owner, repo, f, branch, token)
        .then(r => ({ file: f, content: r.content }))
        .catch(() => null)
    )
  )

  for (const r of reads) {
    if (r.status === 'fulfilled' && r.value) {
      result.configs[r.value.file] = r.value.content
    }
  }

  // قراءة GitHub Actions workflows
  try {
    const wfFiles = await listRepoDirectory(owner, repo, WORKFLOW_DIR, branch, token)
    const wfReads = await Promise.allSettled(
      wfFiles.filter(f => f.name.endsWith('.yml') || f.name.endsWith('.yaml'))
        .map(f => readRepoFile(owner, repo, f.path, branch, token).then(r => ({ name: f.name, content: r.content })))
    )
    result.workflows = wfReads.filter(r => r.status === 'fulfilled').map(r => r.value)
  } catch { /* workflows dir doesn't exist */ }

  // تحليل package.json
  if (result.configs['package.json']) {
    _analyzePackageJson(result)
  }

  // تحليل vercel.json
  if (result.configs['vercel.json']) {
    _analyzeVercelJson(result)
  }

  // تحليل Dockerfile
  if (result.configs['Dockerfile']) {
    _analyzeDockerfile(result)
  }

  // تحليل requirements.txt (Python)
  if (result.configs['requirements.txt']) {
    _analyzePythonDeps(result)
  }

  // اكتشاف مشاكل المشروع
  _detectProjectIssues(result)

  // توليد اقتراحات
  _generateSuggestions(result)

  return result
}

// ── تحليل package.json ─────────────────────────────────────────────────────
function _analyzePackageJson(result) {
  try {
    const pkg = JSON.parse(result.configs['package.json'])
    const deps    = Object.keys(pkg.dependencies    || {})
    const devDeps = Object.keys(pkg.devDependencies || {})

    result.dependencies.prod  = deps
    result.dependencies.dev   = devDeps
    result.dependencies.total = deps.length + devDeps.length
    result.scripts = pkg.scripts || {}
    result.nodeVersion = pkg.engines?.node || null

    // كشف framework
    if (deps.includes('next') || devDeps.includes('next'))                result.framework = 'Next.js'
    else if (deps.includes('react') || deps.includes('react-dom'))        result.framework = 'React'
    else if (deps.includes('vue') || deps.includes('@vue/core'))          result.framework = 'Vue'
    else if (deps.includes('@sveltejs/kit') || deps.includes('svelte'))   result.framework = 'Svelte'
    else if (deps.includes('@angular/core'))                              result.framework = 'Angular'
    else if (deps.includes('express') || deps.includes('fastify'))        result.framework = 'Node API'
    else if (!deps.length && result.configs['index.html'])                result.framework = 'Static HTML'

    // كشف build tool
    if (devDeps.includes('vite') || deps.includes('vite'))                result.buildTool = 'Vite'
    else if (devDeps.includes('webpack'))                                  result.buildTool = 'Webpack'
    else if (devDeps.includes('parcel'))                                   result.buildTool = 'Parcel'
    else if (devDeps.includes('esbuild'))                                  result.buildTool = 'esbuild'
    else if (result.framework === 'Next.js')                              result.buildTool = 'Next.js Built-in'

    // كشف مشاكل في scripts
    if (!result.scripts.build)  result.issues.push({ type: 'missing_script', severity: 'medium', msg: 'لا يوجد script build في package.json' })
    if (!result.scripts.dev && !result.scripts.start) result.issues.push({ type: 'missing_script', severity: 'low', msg: 'لا يوجد script dev أو start' })

    // كشف outdated patterns
    if (deps.includes('react') && !deps.includes('react-dom')) {
      result.issues.push({ type: 'missing_dep', severity: 'high', msg: 'react موجود لكن react-dom غير موجود' })
    }

  } catch (e) {
    result.issues.push({ type: 'parse_error', severity: 'critical', msg: `package.json غير صالح: ${e.message}` })
  }
}

// ── تحليل vercel.json ─────────────────────────────────────────────────────
function _analyzeVercelJson(result) {
  try {
    const v = JSON.parse(result.configs['vercel.json'])
    result.deployTarget = 'Vercel'
    result.vercelConfig = {
      buildCommand: v.buildCommand,
      outputDir:    v.outputDirectory,
      framework:    v.framework,
      rewrites:     (v.rewrites || []).length,
      functions:    Object.keys(v.functions || {}).length,
    }
  } catch { result.issues.push({ type: 'parse_error', severity: 'medium', msg: 'vercel.json غير صالح' }) }
}

// ── تحليل Dockerfile ──────────────────────────────────────────────────────
function _analyzeDockerfile(result) {
  const df = result.configs['Dockerfile']
  result.deployTarget = result.deployTarget || 'Docker'
  const fromMatch = df.match(/^FROM\s+([^\s]+)/m)
  if (fromMatch) result.dockerBase = fromMatch[1]
  const exposeMatch = df.match(/^EXPOSE\s+(\d+)/m)
  if (exposeMatch) result.dockerPort = parseInt(exposeMatch[1])
}

// ── تحليل requirements.txt ────────────────────────────────────────────────
function _analyzePythonDeps(result) {
  const lines = result.configs['requirements.txt'].split('\n').filter(l => l.trim() && !l.startsWith('#'))
  result.dependencies.python = lines.map(l => l.split('==')[0].split('>=')[0].trim())
  result.dependencies.total += lines.length

  if (result.dependencies.python.includes('django'))   result.framework = result.framework || 'Django'
  if (result.dependencies.python.includes('flask'))    result.framework = result.framework || 'Flask'
  if (result.dependencies.python.includes('fastapi'))  result.framework = result.framework || 'FastAPI'
  if (result.dependencies.python.includes('uvicorn'))  result.buildTool = 'uvicorn'
}

// ── كشف مشاكل المشروع ────────────────────────────────────────────────────
function _detectProjectIssues(result) {
  if (!result.configs['.gitignore']) {
    result.issues.push({ type: 'missing_file', severity: 'medium', msg: '.gitignore غير موجود — قد تُرفع ملفات حساسة' })
  }
  if (result.configs['.env']) {
    if (!result.configs['.gitignore'] || !result.configs['.gitignore'].includes('.env')) {
      result.issues.push({ type: 'security', severity: 'critical', msg: '.env موجود وقد لا يكون في .gitignore — خطر تسريب!' })
    }
  }
  if (!result.configs['README.md']) {
    result.issues.push({ type: 'missing_docs', severity: 'low', msg: 'README.md غير موجود' })
  }
  if (result.dependencies.total > 150) {
    result.issues.push({ type: 'bloat', severity: 'low', msg: `عدد الحزم كبير (${result.dependencies.total}) — يمكن تقليصه` })
  }
  if (result.framework === 'React' && result.buildTool === null) {
    result.issues.push({ type: 'missing_config', severity: 'medium', msg: 'مشروع React بدون build tool محدد' })
  }
  if (!result.workflows.length) {
    result.issues.push({ type: 'missing_ci', severity: 'low', msg: 'لا توجد GitHub Actions workflows — يُنصح بإضافة CI/CD' })
  }
}

// ── توليد اقتراحات تحسين ──────────────────────────────────────────────────
function _generateSuggestions(result) {
  if (result.framework === 'React' && result.buildTool === 'Vite') {
    result.suggestions.push('استخدم `vite-plugin-react` لتسريع HMR')
  }
  if (!result.deployTarget) {
    result.suggestions.push('أضف vercel.json أو netlify.toml للنشر التلقائي')
  }
  if (!result.workflows.length) {
    result.suggestions.push('أضف GitHub Action لتشغيل tests تلقائياً عند كل push')
  }
  if (result.dependencies.dev.includes('typescript') && !result.configs['tsconfig.json']) {
    result.suggestions.push('TypeScript مثبت لكن tsconfig.json غير موجود — أضفه')
  }
  if (result.framework === 'Next.js' && !result.vercelConfig) {
    result.suggestions.push('Next.js + Vercel: الأمثل معاً — أضف vercel.json')
  }
  if (result.issues.some(i => i.type === 'security')) {
    result.suggestions.push('🔴 أولوية قصوى: انقل المتغيرات الحساسة إلى Replit Secrets أو Vercel Env')
  }
}

// ── تقرير تحليل المشروع ─────────────────────────────────────────────────
export function buildIntelligenceReport(analysis) {
  const critical = analysis.issues.filter(i => i.severity === 'critical')
  const high     = analysis.issues.filter(i => i.severity === 'high')
  const other    = analysis.issues.filter(i => !['critical','high'].includes(i.severity))

  const lines = [
    `## 🔬 تقرير تحليل المشروع — ${analysis.owner}/${analysis.repo}`,
    `**Framework:** ${analysis.framework || 'غير محدد'} | **Build Tool:** ${analysis.buildTool || 'غير محدد'} | **Deploy:** ${analysis.deployTarget || 'غير محدد'}`,
    `**الحزم:** ${analysis.dependencies.total} | **Scripts:** ${Object.keys(analysis.scripts).join(', ') || 'لا يوجد'}`,
    `**GitHub Actions:** ${analysis.workflows.length} workflow`,
    '',
  ]

  if (critical.length) {
    lines.push('### 🔴 مشاكل حرجة')
    critical.forEach(i => lines.push(`- **${i.type}**: ${i.msg}`))
    lines.push('')
  }
  if (high.length) {
    lines.push('### 🟠 مشاكل عالية الأولوية')
    high.forEach(i => lines.push(`- **${i.type}**: ${i.msg}`))
    lines.push('')
  }
  if (other.length) {
    lines.push('### 🟡 ملاحظات')
    other.forEach(i => lines.push(`- ${i.msg}`))
    lines.push('')
  }
  if (analysis.suggestions.length) {
    lines.push('### 💡 اقتراحات')
    analysis.suggestions.forEach(s => lines.push(`- ${s}`))
    lines.push('')
  }
  if (analysis.workflows.length) {
    lines.push('### ⚙️ GitHub Actions')
    analysis.workflows.forEach(w => lines.push(`- \`${w.name}\``))
  }

  return lines.join('\n')
}
