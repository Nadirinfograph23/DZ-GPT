/**
 * routes/github.js
 * DZ Agent — GitHub CRUD & status endpoints (Phase 1 extraction).
 * Complex AI/streaming routes remain in server.js (Phase 2).
 *
 * Extracted routes:
 *   GET  /api/dz-agent/github/status
 *   GET  /api/dz-agent/github/agent-status
 *   GET  /api/dz-agent/github/pages/status
 *   GET  /api/dz-agent/github/react/pages-status
 *   POST /api/dz-agent/github/repos
 *   POST /api/dz-agent/github/create-repo
 *   POST /api/dz-agent/github/delete-branch
 *   POST /api/dz-agent/github/files
 *   POST /api/dz-agent/github/file-content
 *   POST /api/dz-agent/github/branches
 *   POST /api/dz-agent/github/issues
 *   POST /api/dz-agent/github/pulls
 *   POST /api/dz-agent/github/stats
 *   POST /api/dz-agent/github/create-file
 *   POST /api/dz-agent/github/commit
 *   POST /api/dz-agent/github/pr
 *   POST /api/dz-agent/github/react/enable-pages
 *
 * Still in server.js (Phase 2):
 *   analyze-project, generate-and-push, improve-design, pages/deploy,
 *   pages/update, pages/stream-deploy, deploy-sync, create-branch,
 *   create-repo-full, exec, init-empty-repo, verify-env, exec-pipeline,
 *   react/stream, claude/stream, analyze, code-action, generate,
 *   repo-scan, smart-push, agent-build, agent-edit, agent
 *
 * Factory deps:
 *   githubLimiter - express rate-limit middleware
 */
import { Router } from 'express'
import {
  isValidGithubRepo,
  isValidGithubPath,
  sanitizeString,
  resolveGitHubToken,
  ghHeaders,
} from '../lib/server-utils.js'
import { getPagesStatus, enableGitHubPages as ghPagesEnable } from '../lib/github-pages/index.js'

// ── Internal fetch helper ─────────────────────────────────────
async function ghFetch(endpoint, token, options = {}) {
  const { method = 'GET', body, headers: extra = {} } = options
  return fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `token ${token}`,
      'User-Agent': 'DZ-GPT/1.0',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...extra,
    },
    ...(body ? { body } : {}),
    signal: AbortSignal.timeout(15000),
  })
}

// ── Helpers: empty-repo detection & initialisation ───────────
async function isRepoEmpty(token, repo) {
  const r = await ghFetch(`/repos/${repo}/contents`, token)
  if (r.status === 409) return true
  if (!r.ok) return false
  const d = await r.json().catch(() => null)
  return !!(d?.message && /Git Repository is empty/i.test(d.message))
}

async function initRepoWithReadme(token, repo, branch = 'main') {
  const repoName = repo.split('/')[1]
  const body = {
    message: 'Initial commit — add README.md',
    content: Buffer.from(`# ${repoName}\n\nCreated by DZ Agent 🇩🇿\n`).toString('base64'),
    branch,
  }
  const r = await ghFetch(`/repos/${repo}/contents/README.md`, token, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const d = await r.json().catch(() => ({}))
    throw new Error(d.message || 'Failed to create initial commit')
  }
  console.log(`[GitHub] ✅ Initial commit created for ${repo}`)
  return r.json()
}

// ── Router factory ────────────────────────────────────────────
export function createGitHubRouter(deps = {}) {
  const { githubLimiter = (_req, _res, next) => next() } = deps
  const router = Router()

  // ── GET /dz-agent/github/status ─────────────────────────────
  router.get('/dz-agent/github/status', async (_req, res) => {
    const token = process.env.GITHUB_TOKEN
    const hasOAuth = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
    if (!token) return res.json({ connected: false, oauthEnabled: hasOAuth })
    try {
      const r = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0' },
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) return res.json({ connected: true, oauthEnabled: hasOAuth })
      const u = await r.json()
      res.json({
        connected: true,
        oauthEnabled: hasOAuth,
        user: { login: u.login, name: u.name || u.login, avatar: u.avatar_url, url: u.html_url, repos: u.public_repos },
      })
    } catch { res.json({ connected: true, oauthEnabled: hasOAuth }) }
  })

  // ── GET /dz-agent/github/agent-status ───────────────────────
  router.get('/dz-agent/github/agent-status', async (_req, res) => {
    const tok = resolveGitHubToken()
    if (!tok) return res.json({ ok: false, error: 'لا يوجد GITHUB_PERSONAL_ACCESS_TOKEN أو GITHUB_TOKEN', configured: false })
    try {
      const hdr = ghHeaders(tok)
      const [userRes, rateRes] = await Promise.all([
        fetch('https://api.github.com/user', { headers: hdr, signal: AbortSignal.timeout(6000) }),
        fetch('https://api.github.com/rate_limit', { headers: hdr, signal: AbortSignal.timeout(6000) }),
      ])
      if (!userRes.ok) return res.json({ ok: false, error: 'Token غير صالح', configured: true })
      const user = await userRes.json()
      const rate = await rateRes.json()
      const scopes = rateRes.headers.get('x-oauth-scopes') || ''
      res.json({
        ok: true,
        configured: true,
        login: user.login,
        name: user.name,
        avatar: user.avatar_url,
        tokenSource: process.env.GITHUB_PERSONAL_ACCESS_TOKEN ? 'GITHUB_PERSONAL_ACCESS_TOKEN' : 'GITHUB_TOKEN',
        scopes: scopes.split(',').map(s => s.trim()).filter(Boolean),
        rateLimit: rate.rate,
      })
    } catch (err) {
      res.json({ ok: false, error: err.message, configured: true })
    }
  })

  // ── GET /dz-agent/github/pages/status ───────────────────────
  router.get('/dz-agent/github/pages/status', async (req, res) => {
    const token = process.env.GITHUB_TOKEN
    if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })
    const { owner, repo } = req.query
    if (!owner || !repo) return res.status(400).json({ error: 'owner و repo مطلوبان.' })
    if (!isValidGithubRepo(`${owner}/${repo}`)) return res.status(400).json({ error: 'Invalid repo.' })
    try {
      const status = await getPagesStatus(token, owner, repo)
      if (!status) return res.status(404).json({ error: 'GitHub Pages غير مفعّل لهذا المستودع.' })
      res.json({ success: true, ...status })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // ── GET /dz-agent/github/react/pages-status ─────────────────
  router.get('/dz-agent/github/react/pages-status', async (req, res) => {
    const { repo } = req.query
    if (!repo || !isValidGithubRepo(repo)) return res.status(400).json({ error: 'repo مطلوب' })
    const token = process.env.GITHUB_TOKEN
    const [owner, repoName] = repo.split('/')
    try {
      const status = await getPagesStatus(token, owner, repoName)
      if (!status) return res.json({ enabled: false, status: 'not_enabled' })
      res.json({ enabled: true, ...status })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  // ── POST /dz-agent/github/repos ─────────────────────────────
  router.post('/dz-agent/github/repos', githubLimiter, async (req, res) => {
    const token = req.body.token || process.env.GITHUB_TOKEN || ''
    if (!token) return res.status(400).json({ error: 'GitHub token required.' })
    try {
      const response = await ghFetch('/user/repos?sort=updated&per_page=50&type=all', token)
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to fetch repos' })
      const repos = data.map(r => ({
        name: r.name, full_name: r.full_name, description: r.description,
        language: r.language, private: r.private, default_branch: r.default_branch, html_url: r.html_url,
      }))
      res.json({ repos })
    } catch (err) {
      console.error('[github/repos]', err.message)
      res.status(500).json({ error: 'Failed to fetch repositories.' })
    }
  })

  // ── POST /dz-agent/github/create-repo ───────────────────────
  router.post('/dz-agent/github/create-repo', githubLimiter, async (req, res) => {
    const token = req.body.token || process.env.GITHUB_TOKEN || ''
    if (!token) return res.status(400).json({ error: 'GitHub token required.' })
    const { name, description = '', isPrivate = false, autoInit = true } = req.body
    if (!name || typeof name !== 'string' || !/^[\w\-\.]{1,100}$/.test(name)) {
      return res.status(400).json({ error: 'Invalid repository name. Use letters, numbers, hyphens, dots (max 100 chars).' })
    }
    try {
      const r = await ghFetch('/user/repos', token, {
        method: 'POST',
        body: JSON.stringify({ name, description, private: !!isPrivate, auto_init: autoInit }),
      })
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json({ error: data.message || 'Failed to create repository.' })
      console.log(`[GitHub] ✅ Created repo: ${data.full_name}`)
      res.status(201).json({
        success: true, full_name: data.full_name, html_url: data.html_url,
        clone_url: data.clone_url, default_branch: data.default_branch || 'main', private: data.private,
      })
    } catch (err) {
      console.error('[github/create-repo]', err.message)
      res.status(500).json({ error: 'Failed to create repository.' })
    }
  })

  // ── POST /dz-agent/github/delete-branch ─────────────────────
  router.post('/dz-agent/github/delete-branch', githubLimiter, async (req, res) => {
    const token = req.body.token || process.env.GITHUB_TOKEN || ''
    const { repo, branch } = req.body
    if (!token || !repo || !branch) return res.status(400).json({ error: 'Token, repo, and branch required.' })
    if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
    if (branch === 'main' || branch === 'master') return res.status(400).json({ error: 'Cannot delete default branch.' })
    try {
      const r = await ghFetch(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, { method: 'DELETE' })
      if (r.status === 422 || r.status === 404) {
        const d = await r.json().catch(() => ({}))
        return res.status(r.status).json({ error: d.message || `Branch "${branch}" not found.` })
      }
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        return res.status(r.status).json({ error: d.message || 'Failed to delete branch.' })
      }
      console.log(`[GitHub] ✅ Deleted branch ${branch} from ${repo}`)
      res.json({ success: true, message: `تم حذف الفرع "${branch}" من ${repo}` })
    } catch (err) {
      console.error('[github/delete-branch]', err.message)
      res.status(500).json({ error: 'Failed to delete branch.' })
    }
  })

  // ── POST /dz-agent/github/files ─────────────────────────────
  router.post('/dz-agent/github/files', githubLimiter, async (req, res) => {
    const token = req.body.token || process.env.GITHUB_TOKEN || ''
    const { repo, path = '' } = req.body
    if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })
    if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
    if (path && !isValidGithubPath(path)) return res.status(400).json({ error: 'Invalid path.' })
    try {
      const response = await ghFetch(`/repos/${repo}/contents/${path}`, token)
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to list files' })
      const files = Array.isArray(data) ? data.map(f => ({
        name: f.name, path: f.path, type: f.type === 'dir' ? 'dir' : 'file', size: f.size,
      })) : []
      res.json({ files })
    } catch (err) {
      console.error('[github/files]', err.message)
      res.status(500).json({ error: 'Failed to list files.' })
    }
  })

  // ── POST /dz-agent/github/file-content ──────────────────────
  router.post('/dz-agent/github/file-content', githubLimiter, async (req, res) => {
    const token = req.body.token || process.env.GITHUB_TOKEN || ''
    const { repo, path } = req.body
    if (!token || !repo || !path) return res.status(400).json({ error: 'Token, repo, and path required.' })
    if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
    if (!isValidGithubPath(path)) return res.status(400).json({ error: 'Invalid file path.' })
    try {
      const response = await ghFetch(`/repos/${repo}/contents/${path}`, token)
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to read file' })
      if (data.encoding !== 'base64') return res.status(400).json({ error: 'Unsupported file encoding.' })
      const content = Buffer.from(data.content, 'base64').toString('utf-8')
      res.json({ content, sha: data.sha, name: data.name })
    } catch (err) {
      console.error('[github/file-content]', err.message)
      res.status(500).json({ error: 'Failed to read file.' })
    }
  })

  // ── POST /dz-agent/github/branches ──────────────────────────
  router.post('/dz-agent/github/branches', githubLimiter, async (req, res) => {
    const token = req.body.token || process.env.GITHUB_TOKEN || ''
    const { repo } = req.body
    if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })
    if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
    try {
      const response = await ghFetch(`/repos/${repo}/branches?per_page=30`, token)
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to fetch branches' })
      const branches = data.map(b => ({ name: b.name, protected: b.protected, sha: b.commit?.sha?.slice(0, 7) || '' }))
      res.json({ branches })
    } catch (err) {
      console.error('[github/branches]', err.message)
      res.status(500).json({ error: 'Failed to fetch branches.' })
    }
  })

  // ── POST /dz-agent/github/issues ────────────────────────────
  router.post('/dz-agent/github/issues', githubLimiter, async (req, res) => {
    const token = req.body.token || process.env.GITHUB_TOKEN || ''
    const { repo, state = 'open' } = req.body
    if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })
    if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
    const safeState = ['open', 'closed', 'all'].includes(state) ? state : 'open'
    try {
      const response = await ghFetch(`/repos/${repo}/issues?state=${safeState}&per_page=20&sort=updated`, token)
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to fetch issues' })
      const issues = data.filter(i => !i.pull_request).map(i => ({
        number: i.number, title: sanitizeString(i.title, 200), state: i.state,
        user: i.user?.login || '', labels: (i.labels || []).map(l => l.name).slice(0, 5),
        created_at: i.created_at, updated_at: i.updated_at, html_url: i.html_url, comments: i.comments || 0,
      }))
      res.json({ issues })
    } catch (err) {
      console.error('[github/issues]', err.message)
      res.status(500).json({ error: 'Failed to fetch issues.' })
    }
  })

  // ── POST /dz-agent/github/pulls ─────────────────────────────
  router.post('/dz-agent/github/pulls', githubLimiter, async (req, res) => {
    const token = req.body.token || process.env.GITHUB_TOKEN || ''
    const { repo, state = 'open' } = req.body
    if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })
    if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
    const safeState = ['open', 'closed', 'all'].includes(state) ? state : 'open'
    try {
      const response = await ghFetch(`/repos/${repo}/pulls?state=${safeState}&per_page=20&sort=updated`, token)
      const data = await response.json()
      if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to fetch PRs' })
      const pulls = data.map(p => ({
        number: p.number, title: sanitizeString(p.title, 200), state: p.state,
        user: p.user?.login || '', head: p.head?.ref || '', base: p.base?.ref || '',
        created_at: p.created_at, updated_at: p.updated_at, html_url: p.html_url, draft: !!p.draft,
      }))
      res.json({ pulls })
    } catch (err) {
      console.error('[github/pulls]', err.message)
      res.status(500).json({ error: 'Failed to fetch pull requests.' })
    }
  })

  // ── POST /dz-agent/github/stats ─────────────────────────────
  router.post('/dz-agent/github/stats', githubLimiter, async (req, res) => {
    const token = req.body.token || process.env.GITHUB_TOKEN || ''
    const { repo } = req.body
    if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })
    if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
    try {
      const [repoRes, contribRes, langsRes] = await Promise.allSettled([
        ghFetch(`/repos/${repo}`, token),
        ghFetch(`/repos/${repo}/contributors?per_page=5`, token),
        ghFetch(`/repos/${repo}/languages`, token),
      ])
      const repoData   = repoRes.status === 'fulfilled'   ? await repoRes.value.json()   : {}
      const contribData = contribRes.status === 'fulfilled' && contribRes.value.ok ? await contribRes.value.json() : []
      const langsData  = langsRes.status === 'fulfilled'  && langsRes.value.ok  ? await langsRes.value.json()  : {}
      res.json({
        name: repoData.name || repo.split('/')[1],
        stars: repoData.stargazers_count || 0, forks: repoData.forks_count || 0,
        watchers: repoData.watchers_count || 0, open_issues: repoData.open_issues_count || 0,
        size: repoData.size || 0, language: repoData.language || null, languages: langsData,
        contributors: Array.isArray(contribData)
          ? contribData.map(c => ({ login: c.login || '', contributions: c.contributions || 0 })) : [],
        created_at: repoData.created_at || null, updated_at: repoData.updated_at || null,
        default_branch: repoData.default_branch || 'main',
      })
    } catch (err) {
      console.error('[github/stats]', err.message)
      res.status(500).json({ error: 'Failed to fetch repo stats.' })
    }
  })

  // ── POST /dz-agent/github/create-file ───────────────────────
  router.post('/dz-agent/github/create-file', githubLimiter, async (req, res) => {
    const { repo, path: filePath, content, message, branch = 'main' } = req.body
    if (!repo || !filePath || !content || !message) {
      return res.status(400).json({ error: 'repo, path, content, message are required.' })
    }
    if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repo format.' })
    if (!isValidGithubPath(filePath)) return res.status(400).json({ error: 'Invalid file path.' })
    const token = process.env.GITHUB_TOKEN
    if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured.' })
    try {
      let sha
      const checkRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`,
        { headers: { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0', Accept: 'application/vnd.github+json' } }
      )
      if (checkRes.ok) sha = (await checkRes.json()).sha

      const body = { message: sanitizeString(message, 500), content: Buffer.from(content).toString('base64'), branch }
      if (sha) body.sha = sha

      const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0', 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
      })
      const result = await putRes.json()
      if (!putRes.ok) return res.status(putRes.status).json({ error: result.message || 'GitHub file write failed.' })
      res.json({
        success: true, action: sha ? 'updated' : 'created', path: filePath,
        repo, branch, sha: result.content?.sha, url: result.content?.html_url, commit: result.commit?.sha,
      })
    } catch (err) {
      console.error('[GitHub:create-file]', err.message)
      res.status(500).json({ error: `GitHub file operation failed: ${err.message}` })
    }
  })

  // ── POST /dz-agent/github/commit ────────────────────────────
  router.post('/dz-agent/github/commit', githubLimiter, async (req, res) => {
    const token = req.body.token || process.env.GITHUB_TOKEN || ''
    const { repo, path, content, message, branch } = req.body
    if (!token || !repo || !path || !content || !message) {
      return res.status(400).json({ error: 'Token, repo, path, content, and message are required.' })
    }
    if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
    if (!isValidGithubPath(path)) return res.status(400).json({ error: 'Invalid file path.' })
    if (typeof message !== 'string' || message.length > 500) return res.status(400).json({ error: 'Invalid commit message.' })
    if (typeof content !== 'string' || content.length > 500000) return res.status(400).json({ error: 'File content too large.' })
    const targetBranch = branch || 'main'
    try {
      if (await isRepoEmpty(token, repo)) {
        console.log(`[GitHub] ⚠️ Repo ${repo} is empty — creating initial README.md commit`)
        try { await initRepoWithReadme(token, repo, targetBranch); await new Promise(r => setTimeout(r, 1500)) } catch {}
      }
      let sha
      const existingRes = await ghFetch(`/repos/${repo}/contents/${path}`, token)
      if (existingRes.ok) sha = (await existingRes.json()).sha

      const body = { message, content: Buffer.from(content).toString('base64'), branch: targetBranch, ...(sha ? { sha } : {}) }
      const commitRes = await ghFetch(`/repos/${repo}/contents/${path}`, token, { method: 'PUT', body: JSON.stringify(body) })
      const commitData = await commitRes.json()

      if (!commitRes.ok && /Git Repository is empty/i.test(commitData.message || '')) {
        try { await initRepoWithReadme(token, repo, targetBranch) } catch {}
        await new Promise(r => setTimeout(r, 2000))
        const retry = await ghFetch(`/repos/${repo}/contents/${path}`, token, {
          method: 'PUT',
          body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), branch: targetBranch }),
        })
        const retryData = await retry.json()
        if (!retry.ok) return res.status(retry.status).json({ error: retryData.message || 'Commit failed.' })
        return res.json({
          success: true, autoInited: true,
          html_url: retryData.content?.html_url || `https://github.com/${repo}/blob/${targetBranch}/${path}`,
          sha: retryData.content?.sha,
        })
      }
      if (!commitRes.ok) return res.status(commitRes.status).json({ error: commitData.message || 'Commit failed.' })
      res.json({
        success: true,
        html_url: commitData.content?.html_url || `https://github.com/${repo}/blob/${targetBranch}/${path}`,
        sha: commitData.content?.sha,
      })
    } catch (err) {
      console.error('[github/commit]', err.message)
      res.status(500).json({ error: 'Commit failed.' })
    }
  })

  // ── POST /dz-agent/github/pr ─────────────────────────────────
  router.post('/dz-agent/github/pr', githubLimiter, async (req, res) => {
    const token = req.body.token || process.env.GITHUB_TOKEN || ''
    const { repo, title, body, branch, base } = req.body
    if (!token || !repo || !title || !branch || !base) {
      return res.status(400).json({ error: 'Token, repo, title, branch, and base are required.' })
    }
    if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
    try {
      const prRes = await ghFetch(`/repos/${repo}/pulls`, token, {
        method: 'POST',
        body: JSON.stringify({ title, body: body || '', head: branch, base }),
      })
      const prData = await prRes.json()
      if (!prRes.ok) return res.status(prRes.status).json({ error: prData.message || 'PR creation failed.' })
      res.json({ success: true, html_url: prData.html_url, number: prData.number })
    } catch (err) {
      console.error('[github/pr]', err.message)
      res.status(500).json({ error: 'PR creation failed.' })
    }
  })

  // ── POST /dz-agent/github/react/enable-pages ────────────────
  router.post('/dz-agent/github/react/enable-pages', githubLimiter, async (req, res) => {
    const { repo } = req.body
    if (!repo || !isValidGithubRepo(repo)) return res.status(400).json({ error: 'repo مطلوب (owner/repo)' })
    const token = process.env.GITHUB_TOKEN
    if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط' })
    const [owner, repoName] = repo.split('/')
    try {
      const result = await ghPagesEnable(token, owner, repoName)
      const html_url = (result && result.html_url) || `https://${owner}.github.io/${repoName}/`
      res.json({ success: true, html_url, status: result?.status || 'building' })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })

  return router
}
