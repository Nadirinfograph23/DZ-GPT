// lib/skills/dz-github-skill.js
// DZ-GitHub-Execution-Skill — Core Engine
// يُكمل lib/github.js (بحث/تحليل) و lib/github-pages/index.js (نشر Pages)
// يُضيف: إدارة ملفات، فروع، PRs، تحليل repos خارجية، Vercel sync

const GH_API = 'https://api.github.com'
const VERCEL_API = 'https://api.vercel.com'

// ── Headers ────────────────────────────────────────────────────────────────
function ghHeaders(token) {
  return {
    Authorization: `token ${token || process.env.GITHUB_TOKEN}`,
    'User-Agent': 'DZ-GPT-Skill/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function ghFetch(method, path, token, body, timeout = 15000) {
  const opts = { method, headers: ghHeaders(token), signal: AbortSignal.timeout(timeout) }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(`${GH_API}${path}`, opts)
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data }
}

// ── تحليل repo خارجي كامل ──────────────────────────────────────────────────
export async function analyzeRepo(owner, repo, token) {
  const t = token || process.env.GITHUB_TOKEN
  const [metaR, treesR, branchesR, releasesR] = await Promise.allSettled([
    ghFetch('GET', `/repos/${owner}/${repo}`, t),
    ghFetch('GET', `/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, t),
    ghFetch('GET', `/repos/${owner}/${repo}/branches?per_page=20`, t),
    ghFetch('GET', `/repos/${owner}/${repo}/releases?per_page=3`, t),
  ])

  const meta   = metaR.status   === 'fulfilled' ? metaR.value.data   : {}
  const trees  = treesR.status  === 'fulfilled' ? treesR.value.data  : {}
  const branches = branchesR.status === 'fulfilled' ? branchesR.value.data : []
  const releases = releasesR.status === 'fulfilled' ? releasesR.value.data : []

  const allFiles = (trees.tree || []).map(f => f.path)
  const stack = detectProjectStack(allFiles, meta.topics || [], meta.language || '')

  const configFiles = allFiles.filter(f =>
    ['package.json','vite.config','next.config','tsconfig','requirements.txt',
     'docker-compose','Dockerfile','.github/workflows','vercel.json','netlify.toml'].some(k => f.includes(k))
  )

  const issues = detectPotentialIssues(allFiles, stack)

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    description: meta.description || '',
    defaultBranch: meta.default_branch || 'main',
    stars: meta.stargazers_count || 0,
    forks: meta.forks_count || 0,
    isPrivate: meta.private || false,
    language: meta.language || '',
    size: meta.size || 0,
    pushedAt: meta.pushed_at,
    stack,
    configFiles,
    totalFiles: allFiles.length,
    branches: (branches || []).map(b => b.name),
    latestRelease: releases?.[0]?.tag_name || null,
    issues,
    cloneUrl: `https://github.com/${owner}/${repo}`,
    pagesUrl: `https://${owner}.github.io/${repo}`,
    analyzedAt: new Date().toISOString(),
  }
}

// ── كشف نوع المشروع من ملفاته ──────────────────────────────────────────────
export function detectProjectStack(files, topics = [], primaryLang = '') {
  const f = files.join('\n').toLowerCase()
  const t = topics.join(' ').toLowerCase()
  const combined = `${f} ${t} ${primaryLang.toLowerCase()}`
  const stack = new Set()
  const add = (label, patterns) => { if (patterns.some(p => combined.includes(p))) stack.add(label) }

  add('React',     ['react', 'jsx', 'tsx', 'react-dom'])
  add('Next.js',   ['next.config', 'nextjs', 'next/'])
  add('Vue',       ['vue.config', 'vuejs', 'nuxt'])
  add('Svelte',    ['svelte.config', 'svelte'])
  add('Angular',   ['angular.json', 'angularjs'])
  add('Vite',      ['vite.config', 'vite'])
  add('TypeScript',['tsconfig', '.ts', '.tsx'])
  add('Tailwind',  ['tailwind.config', 'tailwindcss'])
  add('Express',   ['express', 'app.use', 'router.get'])
  add('Fastify',   ['fastify'])
  add('FastAPI',   ['fastapi', 'uvicorn'])
  add('Django',    ['django', 'manage.py', 'settings.py'])
  add('Flask',     ['flask', 'wsgi.py'])
  add('Python',    ['requirements.txt', '.py', 'pyproject'])
  add('Node.js',   ['package.json', 'node_modules', '.js'])
  add('Docker',    ['dockerfile', 'docker-compose'])
  add('PostgreSQL',['postgres', 'pg', 'drizzle', 'prisma'])
  add('MongoDB',   ['mongodb', 'mongoose'])
  add('Redis',     ['redis', 'ioredis'])
  add('Vercel',    ['vercel.json', 'vercel'])
  add('GitHub Actions', ['.github/workflows'])
  add('Stripe',    ['stripe'])
  add('Static Site',['index.html', '.html'])

  if (primaryLang && primaryLang !== 'JavaScript' && primaryLang !== 'TypeScript') {
    stack.add(primaryLang)
  }
  return Array.from(stack).slice(0, 15)
}

// ── اكتشاف المشاكل المحتملة ────────────────────────────────────────────────
export function detectPotentialIssues(files, stack) {
  const issues = []
  const f = files.join('\n')

  if (stack.includes('React') && !f.includes('package.json')) {
    issues.push({ type: 'missing_file', severity: 'high', message: 'package.json غير موجود في مشروع React' })
  }
  if (stack.includes('TypeScript') && !f.includes('tsconfig')) {
    issues.push({ type: 'missing_config', severity: 'medium', message: 'tsconfig.json غير موجود' })
  }
  if (stack.includes('Next.js') && !f.includes('next.config')) {
    issues.push({ type: 'missing_config', severity: 'low', message: 'next.config غير موجود — قد يكون اختيارياً' })
  }
  if (!f.includes('readme') && !f.includes('README')) {
    issues.push({ type: 'missing_docs', severity: 'low', message: 'README.md غير موجود' })
  }
  if (f.includes('.env') && !f.includes('.gitignore')) {
    issues.push({ type: 'security', severity: 'critical', message: '.env موجود لكن .gitignore غير موجود — خطر تسريب أسرار!' })
  }
  if (!f.includes('.gitignore')) {
    issues.push({ type: 'missing_file', severity: 'medium', message: '.gitignore غير موجود' })
  }
  return issues
}

// ── قراءة ملف من GitHub ────────────────────────────────────────────────────
export async function readRepoFile(owner, repo, filePath, branch = 'main', token) {
  const t = token || process.env.GITHUB_TOKEN
  const { ok, status, data } = await ghFetch('GET', `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`, t)
  if (!ok) throw new Error(`الملف "${filePath}" غير موجود أو لا يمكن الوصول إليه (${status})`)
  if (data.type !== 'file') throw new Error(`"${filePath}" ليس ملفاً — هو ${data.type}`)
  const content = Buffer.from(data.content || '', 'base64').toString('utf8')
  return { path: filePath, content, sha: data.sha, size: data.size, encoding: 'utf8' }
}

// ── كتابة / تعديل ملف ─────────────────────────────────────────────────────
export async function writeRepoFile(owner, repo, filePath, content, commitMessage, branch = 'main', token) {
  const t = token || process.env.GITHUB_TOKEN
  const url = `/repos/${owner}/${repo}/contents/${filePath}`

  let sha
  const { ok, data: existing } = await ghFetch('GET', `${url}?ref=${branch}`, t)
  if (ok && existing.sha) sha = existing.sha

  const body = {
    message: commitMessage || `chore: update ${filePath} by DZ Agent`,
    content: Buffer.from(content).toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  }
  const { ok: wOk, status, data } = await ghFetch('PUT', url, t, body, 30000)
  if (!wOk) throw new Error(`فشل كتابة "${filePath}": ${data.message || status}`)
  return {
    path: filePath,
    sha: data.content?.sha,
    commitSha: data.commit?.sha,
    commitUrl: data.commit?.html_url,
    action: sha ? 'updated' : 'created',
  }
}

// ── حذف ملف ───────────────────────────────────────────────────────────────
export async function deleteRepoFile(owner, repo, filePath, branch = 'main', token) {
  const t = token || process.env.GITHUB_TOKEN
  const { ok, data: existing } = await ghFetch('GET', `/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`, t)
  if (!ok) throw new Error(`الملف "${filePath}" غير موجود`)
  const { ok: dOk, status, data } = await ghFetch('DELETE', `/repos/${owner}/${repo}/contents/${filePath}`, t, {
    message: `chore: delete ${filePath} by DZ Agent`,
    sha: existing.sha,
    branch,
  })
  if (!dOk) throw new Error(`فشل حذف "${filePath}": ${data.message || status}`)
  return { path: filePath, deleted: true, commitSha: data.commit?.sha }
}

// ── قائمة ملفات مجلد ──────────────────────────────────────────────────────
export async function listRepoDirectory(owner, repo, dirPath = '', branch = 'main', token) {
  const t = token || process.env.GITHUB_TOKEN
  const pathPart = dirPath ? `/${dirPath}` : ''
  const { ok, status, data } = await ghFetch('GET', `/repos/${owner}/${repo}/contents${pathPart}?ref=${branch}`, t)
  if (!ok) throw new Error(`المجلد "${dirPath || '/'}" غير موجود (${status})`)
  if (!Array.isArray(data)) throw new Error(`"${dirPath}" ليس مجلداً`)
  return data.map(item => ({
    name: item.name,
    path: item.path,
    type: item.type,
    size: item.size,
    sha: item.sha,
  }))
}

// ── إنشاء فرع جديد ────────────────────────────────────────────────────────
export async function createBranch(owner, repo, newBranch, fromBranch = 'main', token) {
  const t = token || process.env.GITHUB_TOKEN

  const { ok: refOk, data: refData } = await ghFetch('GET', `/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`, t)
  if (!refOk) throw new Error(`الفرع المصدر "${fromBranch}" غير موجود`)
  const sha = refData.object?.sha
  if (!sha) throw new Error(`لا يمكن الحصول على SHA للفرع "${fromBranch}"`)

  const { ok, status, data } = await ghFetch('POST', `/repos/${owner}/${repo}/git/refs`, t, {
    ref: `refs/heads/${newBranch}`,
    sha,
  })
  if (!ok) {
    if (status === 422) throw new Error(`الفرع "${newBranch}" موجود مسبقاً`)
    throw new Error(`فشل إنشاء الفرع: ${data.message || status}`)
  }
  return { branch: newBranch, fromBranch, sha: data.object?.sha }
}

// ── فتح Pull Request ───────────────────────────────────────────────────────
export async function createPullRequest(owner, repo, head, base = 'main', title, body = '', token) {
  const t = token || process.env.GITHUB_TOKEN
  const { ok, status, data } = await ghFetch('POST', `/repos/${owner}/${repo}/pulls`, t, {
    title: title || `[DZ Agent] ${head} → ${base}`,
    body: body || `تم إنشاء هذا الـ PR تلقائياً بواسطة DZ Agent 🤖\n\nالفرع: \`${head}\` → \`${base}\``,
    head,
    base,
  })
  if (!ok) {
    if (status === 422) throw new Error(`PR موجود مسبقاً أو لا توجد فروق بين "${head}" و "${base}"`)
    throw new Error(`فشل إنشاء PR: ${data.message || status}`)
  }
  return { number: data.number, url: data.html_url, title: data.title, state: data.state }
}

// ── مزامنة مع Vercel (trigger deployment) ─────────────────────────────────
export async function syncToVercel(projectId, branch, vercelToken) {
  const t = vercelToken || process.env.VERCEL_TOKEN
  if (!t) throw new Error('VERCEL_TOKEN غير موجود')

  const r = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'dz-gpt',
      gitSource: { type: 'github', repoId: '1191199822', ref: branch },
      target: 'production',
    }),
    signal: AbortSignal.timeout(20000),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`فشل إطلاق Vercel deployment: ${data.error?.message || data.message || r.status}`)
  return { deploymentId: data.id, url: data.url, state: data.readyState }
}

// ── جلب حالة آخر Vercel deployment ───────────────────────────────────────
export async function getVercelStatus(projectId = 'prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5', vercelToken) {
  const t = vercelToken || process.env.VERCEL_TOKEN
  if (!t) return null
  const r = await fetch(`${VERCEL_API}/v6/deployments?projectId=${projectId}&limit=1&target=production`, {
    headers: { Authorization: `Bearer ${t}` },
    signal: AbortSignal.timeout(10000),
  })
  const data = await r.json().catch(() => ({}))
  const dep = data.deployments?.[0]
  if (!dep) return null
  return {
    id: dep.uid,
    state: dep.readyState,
    url: dep.url ? `https://${dep.url}` : 'https://dz-gpt.vercel.app',
    createdAt: dep.createdAt,
    meta: dep.meta,
  }
}

// ── تقرير احترافي بعد كل عملية ───────────────────────────────────────────
export function buildOperationReport({ operation, files = [], branch, commitSha, errors = [], fixes = [], vercel = null }) {
  const lines = [`## 📋 تقرير DZ-GitHub-Skill`, `**العملية:** ${operation}`, '']

  if (files.length) {
    lines.push(`**الملفات المعدلة (${files.length}):**`)
    files.forEach(f => lines.push(`- \`${f}\``))
    lines.push('')
  }
  if (branch) lines.push(`**الفرع:** \`${branch}\``)
  if (commitSha) lines.push(`**Commit:** \`${commitSha.slice(0, 8)}\``)
  if (errors.length) {
    lines.push('', `**❌ أخطاء (${errors.length}):**`)
    errors.forEach(e => lines.push(`- ${e}`))
  }
  if (fixes.length) {
    lines.push('', `**✅ إصلاحات مطبّقة (${fixes.length}):**`)
    fixes.forEach(f => lines.push(`- ${f}`))
  }
  if (vercel) {
    lines.push('', `**🚀 Vercel:** ${vercel.state} — [dz-gpt.vercel.app](https://dz-gpt.vercel.app)`)
  }

  return lines.join('\n')
}
