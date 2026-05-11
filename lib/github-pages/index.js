// lib/github-pages/index.js
// DZ Agent — GitHub Pages Autonomous Deployment Engine
// Capabilities: Create repo → AI-generate site → Push files → Enable Pages → Return live URL

const GH_API = 'https://api.github.com'

// ── Headers factory ───────────────────────────────────────────────────────────
function makeGhHeaders(token) {
  return {
    Authorization: `token ${token}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }
}

// ── Generic GitHub fetch ──────────────────────────────────────────────────────
async function ghFetch(method, path, token, body, timeout = 15000) {
  const opts = {
    method,
    headers: makeGhHeaders(token),
    signal: AbortSignal.timeout(timeout),
  }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(`${GH_API}${path}`, opts)
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data }
}

// ── Sanitize repo name (GitHub-safe slug) ─────────────────────────────────────
export function sanitizeRepoName(name) {
  return (name || 'my-site')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || 'my-site'
}

// ── Get authenticated user ─────────────────────────────────────────────────
export async function getAuthUser(token) {
  const { ok, data } = await ghFetch('GET', '/user', token)
  if (!ok) throw new Error('فشل التحقق من هوية المستخدم. تحقق من صلاحيات الـ GitHub Token.')
  return data
}

// ── Create GitHub repository ───────────────────────────────────────────────
export async function createRepo(token, repoName, description = '', isPrivate = false) {
  const { ok, status, data } = await ghFetch('POST', '/user/repos', token, {
    name: repoName,
    description: (description || '').slice(0, 255),
    private: isPrivate,
    auto_init: false,
    has_wiki: false,
    has_projects: false,
  })
  if (!ok) {
    if (status === 422) throw new Error(`المستودع "${repoName}" موجود مسبقاً أو الاسم غير صالح. جرّب اسماً آخر.`)
    throw new Error(`فشل إنشاء المستودع: ${data.message || status}`)
  }
  return data
}

// ── Batch push files using Git Data API ────────────────────────────────────
export async function batchPushFiles(token, owner, repo, files, commitMessage = 'Initial commit by DZ Agent 🤖', branch = 'main') {
  const headers = makeGhHeaders(token)

  // Get base SHA if branch exists
  let baseSha = null
  let baseTreeSha = null
  const branchRes = await fetch(`${GH_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
    headers, signal: AbortSignal.timeout(10000),
  })
  if (branchRes.ok) {
    const bd = await branchRes.json()
    baseSha = bd.object?.sha
    if (baseSha) {
      const commitInfo = await fetch(`${GH_API}/repos/${owner}/${repo}/git/commits/${baseSha}`, {
        headers, signal: AbortSignal.timeout(10000),
      })
      if (commitInfo.ok) {
        const ci = await commitInfo.json()
        baseTreeSha = ci.tree?.sha
      }
    }
  }

  // Create blobs for each file
  const treeItems = []
  for (const file of files) {
    const blobRes = await fetch(`${GH_API}/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: Buffer.from(file.content).toString('base64'), encoding: 'base64' }),
      signal: AbortSignal.timeout(20000),
    })
    if (!blobRes.ok) {
      const e = await blobRes.json().catch(() => ({}))
      throw new Error(`فشل رفع الملف ${file.path}: ${e.message || blobRes.status}`)
    }
    const blob = await blobRes.json()
    treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })
  }

  // Create tree
  const treeBody = { tree: treeItems }
  if (baseTreeSha) treeBody.base_tree = baseTreeSha
  const treeRes = await fetch(`${GH_API}/repos/${owner}/${repo}/git/trees`, {
    method: 'POST', headers, body: JSON.stringify(treeBody), signal: AbortSignal.timeout(20000),
  })
  if (!treeRes.ok) throw new Error('فشل إنشاء شجرة الملفات على GitHub')
  const tree = await treeRes.json()

  // Create commit
  const commitBody = {
    message: commitMessage,
    tree: tree.sha,
    author: { name: 'DZ Agent', email: 'agent@dz-gpt.app', date: new Date().toISOString() },
  }
  if (baseSha) commitBody.parents = [baseSha]
  const newCommitRes = await fetch(`${GH_API}/repos/${owner}/${repo}/git/commits`, {
    method: 'POST', headers, body: JSON.stringify(commitBody), signal: AbortSignal.timeout(20000),
  })
  if (!newCommitRes.ok) throw new Error('فشل إنشاء الـ commit على GitHub')
  const newCommit = await newCommitRes.json()

  // Update or create branch ref
  const refPath = `/repos/${owner}/${repo}/git/refs/heads/${branch}`
  const refCheck = await fetch(`${GH_API}${refPath}`, { headers, signal: AbortSignal.timeout(10000) })
  if (refCheck.ok) {
    await fetch(`${GH_API}${refPath}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
      signal: AbortSignal.timeout(10000),
    })
  } else {
    await fetch(`${GH_API}/repos/${owner}/${repo}/git/refs`, {
      method: 'POST', headers,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: newCommit.sha }),
      signal: AbortSignal.timeout(10000),
    })
  }

  return newCommit.sha
}

// ── Enable GitHub Pages via REST API ───────────────────────────────────────
export async function enableGitHubPages(token, owner, repo) {
  // Try workflow-based Pages first (modern approach)
  const { ok, data } = await ghFetch('POST', `/repos/${owner}/${repo}/pages`, token, {
    build_type: 'workflow',
  })
  if (ok) return data

  // Fallback: classic source-based Pages
  const { ok: ok2, data: data2 } = await ghFetch('POST', `/repos/${owner}/${repo}/pages`, token, {
    source: { branch: 'main', path: '/' },
  })
  if (ok2) return data2

  // Check if already enabled
  const { ok: ok3, data: data3 } = await ghFetch('GET', `/repos/${owner}/${repo}/pages`, token)
  if (ok3) return data3

  // Non-fatal: Pages might need manual activation for new repos
  console.warn(`[GH Pages] Could not auto-enable Pages for ${owner}/${repo}: ${data?.message}`)
  return null
}

// ── Get GitHub Pages deployment status ─────────────────────────────────────
export async function getPagesStatus(token, owner, repo) {
  const { ok, data } = await ghFetch('GET', `/repos/${owner}/${repo}/pages`, token)
  if (!ok) return null
  return {
    url: data.html_url,
    status: data.status,
    cname: data.cname,
    source: data.source,
    buildType: data.build_type,
  }
}

// ── GitHub Actions workflow YAML for Pages deploy ──────────────────────────
export function generatePagesWorkflow() {
  return `name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`
}

// ── Generate README.md ──────────────────────────────────────────────────────
export function generateReadme(repoName, description, siteUrl) {
  return `# ${repoName}

> ${description || 'موقع ويب تم إنشاؤه بواسطة DZ Agent'}

## 🌐 الموقع المباشر

${siteUrl}

## 🤖 Generated by DZ-GPT

هذا الموقع تم إنشاؤه ونشره تلقائياً بواسطة [DZ-GPT](https://dz-gpt.vercel.app) — مساعد الذكاء الاصطناعي الجزائري.

---

*Built with ❤️ using DZ Agent GitHub Pages Deployment Engine*
`
}

// ── Detect GitHub Pages deployment intent ──────────────────────────────────
export function detectGitHubPagesIntent(message) {
  // Exclude pure repo-creation requests — these are handled by createRepoTriggers
  const pureRepoCreate = [
    /^أنشئ\s+مستودع(\s+باسم|\s+جديد)?(\s+\S+)?$/i,
    /^انشئ\s+مستودع(\s+باسم|\s+جديد)?(\s+\S+)?$/i,
    /^create\s+(a\s+)?(new\s+)?repo(sitory)?(\s+named?|\s+called?)?\s+\S+/i,
    /^(new|create)\s+repo\s+\S+/i,
  ]
  if (pureRepoCreate.some(p => p.test(message.trim()))) return false

  const patterns = [
    /github\s*pages/i,
    /github\.io/i,
    /gh-pages/i,
    /gh\s+pages/i,
    /انشر\s*(على|ع)\s*github/i,
    /نشر\s*(على|ع)\s*github/i,
    /deploy.*github/i,
    /موقع\s*(على|ع)\s*github/i,
    /portfolio.*github/i,
    /github.*portfolio/i,
    /pages.*github/i,
    /github.*pages/i,
    /أنشئ.*موقع.*github/i,
    /انشئ.*موقع.*github/i,
    /نشر.*github/i,
    /صفحة.*github/i,
    /create.*github.*site/i,
    /publish.*github/i,
    /host.*github/i,
    /اعمل\s*موقع.*github/i,
    /اعمللي\s*موقع.*github/i,
    /username\.github\.io/i,
  ]
  return patterns.some(p => p.test(message))
}

// ── Extract site metadata from the user prompt ──────────────────────────────
export function extractPagesRequestMeta(message) {
  const m = message.toLowerCase()

  // Site type detection
  let siteType = 'landing'
  if (/portfolio|بورتفوليو|سيرة|cv|resume/i.test(m)) siteType = 'portfolio'
  else if (/blog|مدونة/i.test(m)) siteType = 'blog'
  else if (/متجر|shop|store|ecommerce/i.test(m)) siteType = 'store'
  else if (/شركة|company|business|خدمات|agency/i.test(m)) siteType = 'business'
  else if (/مطعم|restaurant|cafe|مقهى/i.test(m)) siteType = 'restaurant'

  // Extract username if provided
  const usernameMatch = message.match(/(?:username|user|مستخدم|حساب)[:\s]+([a-zA-Z0-9\-_]+)/i)
    || message.match(/(?:github\.com\/|@)([a-zA-Z0-9\-_]+)/i)
  const username = usernameMatch?.[1] || null

  // Extract repo name if provided
  const repoMatch = message.match(/(?:repo|مستودع|اسم المستودع|اسم المشروع)[:\s]+([a-zA-Z0-9\-_]+)/i)
  let repoName = repoMatch?.[1] || null
  if (!repoName) {
    const typeNames = { portfolio: 'my-portfolio', blog: 'my-blog', store: 'my-store', business: 'my-business', restaurant: 'my-restaurant', landing: 'my-site' }
    repoName = typeNames[siteType] || 'my-site'
  }

  // Site description
  const cleanMsg = message.replace(/github\s*pages|github\.io|أنشئ|انشئ|اعمل|اعملي|اصنع|deploy|نشر/gi, '').trim()
  const description = cleanMsg.slice(0, 150)

  return { siteType, repoName: sanitizeRepoName(repoName), username, description }
}

// ── Upload a single file (PUT Contents API) ────────────────────────────────
export async function uploadSingleFile(token, owner, repo, filePath, content, branch = 'main', message = 'Update by DZ Agent') {
  const headers = makeGhHeaders(token)
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${filePath}`

  // Get existing SHA if file exists
  let sha
  const check = await fetch(`${url}?ref=${branch}`, { headers, signal: AbortSignal.timeout(8000) })
  if (check.ok) {
    const existing = await check.json()
    sha = existing.sha
  }

  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`فشل رفع ${filePath}: ${err.message || res.status}`)
  }
  return await res.json()
}

// ── Wait for GitHub Pages to become active (poll) ──────────────────────────
export async function waitForPagesActive(token, owner, repo, maxWaitMs = 120000) {
  const start = Date.now()
  const POLL_INTERVAL = 10000

  while (Date.now() - start < maxWaitMs) {
    const status = await getPagesStatus(token, owner, repo)
    if (status && (status.status === 'built' || status.status === 'active')) {
      return { active: true, url: status.url || `https://${owner}.github.io/${repo}`, status: status.status }
    }
    // 404 → still building
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
  // Return expected URL even if not yet active — GitHub Actions takes time
  return { active: false, url: `https://${owner}.github.io/${repo}`, status: 'building' }
}

// ── Full pipeline with streaming steps ────────────────────────────────────
export async function deployProject({
  token,
  analysis,
  projectFiles,
  onStep,
}) {
  onStep = onStep || (() => {})

  // Step 1: Auth
  onStep({ step: 'auth', label: '🔑 التحقق من هوية GitHub...' })
  const user = await getAuthUser(token)
  const owner = user.login
  onStep({ step: 'auth', label: `✅ مرحباً @${owner}`, done: true })

  // Step 2: Repo name
  const repoName = sanitizeRepoName(analysis.repoName || `${analysis.siteType}-site`)
  const siteUrl  = `https://${owner}.github.io/${repoName}`
  const repoUrl  = `https://github.com/${owner}/${repoName}`

  // Step 3: Create repo
  onStep({ step: 'create_repo', label: `📦 إنشاء مستودع "${repoName}"...` })
  let repoReused = false
  try {
    await createRepo(token, repoName, analysis.description || `${analysis.siteType} — by DZ Agent`, false)
    onStep({ step: 'create_repo', label: `✅ المستودع جاهز: ${repoName}`, done: true })
  } catch (err) {
    if (err.message.includes('مسبقاً') || err.message.includes('already exists')) {
      repoReused = true
      onStep({ step: 'create_repo', label: `♻️ المستودع "${repoName}" موجود — سنستخدمه`, done: true })
    } else {
      throw err
    }
  }

  // Step 4: Upload files
  onStep({ step: 'upload', label: `⬆️ رفع ${projectFiles.length} ملف إلى GitHub...` })
  const commitSha = await batchPushFiles(
    token, owner, repoName, projectFiles,
    `🚀 Deploy by DZ Agent 🇩🇿 — ${analysis.siteType}`, 'main'
  )
  onStep({ step: 'upload', label: `✅ تم رفع ${projectFiles.length} ملف بنجاح`, done: true, commitSha })

  // Step 5: Enable Pages
  onStep({ step: 'pages', label: '🌐 تفعيل GitHub Pages...' })
  let pagesResult = null
  try {
    pagesResult = await enableGitHubPages(token, owner, repoName)
    onStep({ step: 'pages', label: '✅ GitHub Pages مُفعَّل', done: true })
  } catch (pErr) {
    onStep({ step: 'pages', label: `⚠️ Pages: ${pErr.message} — الرابط سيكون جاهزاً بعد البناء`, done: true })
  }

  return {
    owner,
    repo: repoName,
    repoUrl,
    siteUrl,
    commitSha,
    pagesEnabled: !!pagesResult,
    pagesStatus: pagesResult?.status || 'building',
    repoReused,
    fileCount: projectFiles.length,
  }
}

// ── Full pipeline: Create repo + generate site + enable Pages ──────────────
export async function deployGitHubPages({ token, prompt, siteType, repoName, description, htmlContent }) {
  const user = await getAuthUser(token)
  const owner = user.login
  const finalRepoName = sanitizeRepoName(repoName || `${siteType}-site`)
  const siteUrl = `https://${owner}.github.io/${finalRepoName}`

  // Step 1: Create repository
  console.log(`[GH Pages] Creating repo: ${owner}/${finalRepoName}`)
  let repoReused = false
  try {
    await createRepo(token, finalRepoName, description || `${siteType} site — by DZ Agent`, false)
  } catch (err) {
    if (err.message.includes('مسبقاً') || err.message.includes('already exists')) {
      repoReused = true
      console.log(`[GH Pages] Repo already exists — reusing: ${owner}/${finalRepoName}`)
    } else {
      throw err
    }
  }

  // Step 2: Prepare all files
  const files = [
    { path: 'index.html', content: htmlContent },
    { path: '.github/workflows/pages.yml', content: generatePagesWorkflow() },
    { path: 'README.md', content: generateReadme(finalRepoName, description, siteUrl) },
  ]

  // Step 3: Batch push all files
  console.log(`[GH Pages] Pushing ${files.length} files to ${owner}/${finalRepoName}`)
  const commitSha = await batchPushFiles(
    token, owner, finalRepoName, files,
    `🚀 Initial deploy by DZ Agent — ${siteType} site`, 'main'
  )

  // Step 4: Enable GitHub Pages
  console.log(`[GH Pages] Enabling Pages for ${owner}/${finalRepoName}`)
  const pagesResult = await enableGitHubPages(token, owner, finalRepoName)

  return {
    owner,
    repo: finalRepoName,
    repoUrl: `https://github.com/${owner}/${finalRepoName}`,
    siteUrl,
    commitSha,
    pagesEnabled: !!pagesResult,
    pagesStatus: pagesResult?.status || 'building',
    repoReused,
  }
}
