/**
 * DZ Agent — GitHub Tool Executor
 * Direct GitHub REST + Git Data API calls — no HTTP middleware.
 * Used by the ReAct agent loop to execute real GitHub actions.
 */

const GH_BASE = 'https://api.github.com'

import { getIntegrationSecret } from '../integration-secrets.js'

function getToken() {
  return getIntegrationSecret('github')
}

function ghHeaders(token) {
  const tok = token || getToken()
  const h = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'DZ-Agent/5.0',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (tok) h['Authorization'] = `token ${tok}`
  return h
}

async function ghFetch(endpoint, { method = 'GET', body, token } = {}) {
  const opts = {
    method,
    headers: ghHeaders(token),
    signal: AbortSignal.timeout(20000),
  }
  if (body) opts.body = JSON.stringify(body)
  const r = await fetch(GH_BASE + endpoint, opts)
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data }
}

function isValidRepo(repo) {
  return typeof repo === 'string' && /^[\w.\-]+\/[\w.\-]{1,100}$/.test(repo)
}
function isValidPath(p) {
  if (!p || typeof p !== 'string') return false
  if (p.includes('..') || p.startsWith('/')) return false
  return /^[\w.\-/]+$/.test(p) && p.length <= 500
}
function isValidName(n) {
  return typeof n === 'string' && /^[\w.\-]{1,100}$/.test(n)
}

// ── Tool: get_auth_user ────────────────────────────────────────────────────────
export async function get_auth_user({ token } = {}) {
  const { ok, data } = await ghFetch('/user', { token })
  if (!ok) return { error: data.message || 'Failed to get user info' }
  return {
    login: data.login,
    name: data.name,
    public_repos: data.public_repos,
    plan: data.plan?.name || 'free',
  }
}

// ── Tool: list_repos ──────────────────────────────────────────────────────────
export async function list_repos({ token, type = 'all', per_page = 20 } = {}) {
  const { ok, data } = await ghFetch(`/user/repos?sort=updated&per_page=${per_page}&type=${type}`, { token })
  if (!ok) return { error: data.message || 'Failed to list repositories' }
  if (!Array.isArray(data)) return { error: 'Unexpected response from GitHub' }
  return {
    count: data.length,
    repos: data.map(r => ({
      full_name: r.full_name,
      description: r.description,
      private: r.private,
      language: r.language,
      stars: r.stargazers_count,
      updated_at: r.updated_at,
      html_url: r.html_url,
      default_branch: r.default_branch,
    })),
  }
}

// ── Tool: create_repo ─────────────────────────────────────────────────────────
export async function create_repo({ name, description = '', isPrivate = false, autoInit = true, token } = {}) {
  if (!isValidName(name)) return { error: 'Invalid repo name. Use letters, numbers, hyphens (max 100).' }
  const { ok, status, data } = await ghFetch('/user/repos', {
    method: 'POST',
    body: { name, description, private: !!isPrivate, auto_init: autoInit },
    token,
  })
  if (!ok) return { error: data.message || `Failed to create repo (${status})` }
  return {
    success: true,
    full_name: data.full_name,
    html_url: data.html_url,
    clone_url: data.clone_url,
    default_branch: data.default_branch || 'main',
  }
}

// ── Tool: list_files ──────────────────────────────────────────────────────────
export async function list_files({ repo, path = '', branch, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format. Use owner/repo.' }
  // Strip leading/trailing slashes to avoid GitHub API 404
  const cleanPath = typeof path === 'string' ? path.replace(/^\/+|\/+$/g, '') : ''
  const safePath = cleanPath && isValidPath(cleanPath) ? cleanPath : ''
  const refParam = branch ? `?ref=${encodeURIComponent(branch)}` : ''
  const { ok, status, data } = await ghFetch(`/repos/${repo}/contents/${safePath}${refParam}`, { token })
  // Empty repo returns 409
  if (status === 409) return { repo, path: safePath || '/', files: [], empty: true }
  if (!ok) return { error: data.message || 'Failed to list files' }
  if (!Array.isArray(data)) return { error: 'Path points to a file, not a directory' }
  return {
    repo,
    path: safePath || '/',
    files: data.map(f => ({ name: f.name, path: f.path, type: f.type, size: f.size })),
  }
}

// ── Tool: read_file ───────────────────────────────────────────────────────────
export async function read_file({ repo, path, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format. Use owner/repo.' }
  if (!isValidPath(path)) return { error: 'Invalid file path.' }
  const { ok, data } = await ghFetch(`/repos/${repo}/contents/${path}`, { token })
  if (!ok) return { error: data.message || 'Failed to read file' }
  if (!data.content) return { error: 'File is empty or binary' }
  const content = Buffer.from(data.content, 'base64').toString('utf-8')
  return { repo, path, content, sha: data.sha, size: data.size }
}

// ── Tool: push_file ───────────────────────────────────────────────────────────
export async function push_file({ repo, path, content, message = 'Update via DZ Agent', branch = 'main', token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format. Use owner/repo.' }
  if (!isValidPath(path)) return { error: 'Invalid file path.' }
  if (typeof content !== 'string') return { error: 'Content must be a string.' }

  // Get current SHA if file exists
  let sha
  const existing = await ghFetch(`/repos/${repo}/contents/${path}?ref=${branch}`, { token })
  if (existing.ok && existing.data?.sha) sha = existing.data.sha

  const body = {
    message: message.slice(0, 500),
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch,
  }
  if (sha) body.sha = sha

  const { ok, status, data } = await ghFetch(`/repos/${repo}/contents/${path}`, {
    method: 'PUT', body, token,
  })
  if (!ok) return { error: data.message || `Failed to push file (${status})` }
  return {
    success: true,
    path,
    sha: data.content?.sha,
    html_url: data.content?.html_url,
    commit: data.commit?.sha?.slice(0, 7),
  }
}

// ── Tool: push_files_batch ────────────────────────────────────────────────────
export async function push_files_batch({ repo, files, message = 'Update via DZ Agent', branch = 'main', token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format. Use owner/repo.' }
  if (!Array.isArray(files) || files.length === 0) return { error: 'No files provided.' }
  const tok = token || getToken()

  try {
    // 1. Get latest commit SHA
    const refRes = await ghFetch(`/repos/${repo}/git/refs/heads/${branch}`, { token: tok })
    if (!refRes.ok) return { error: `Branch "${branch}" not found in ${repo}` }
    const latestSha = refRes.data.object?.sha
    if (!latestSha) return { error: 'Cannot get branch SHA' }

    // 2. Get base tree SHA
    const commitRes = await ghFetch(`/repos/${repo}/git/commits/${latestSha}`, { token: tok })
    const baseTree = commitRes.data?.tree?.sha
    if (!baseTree) return { error: 'Cannot get base tree SHA' }

    // 3. Create blobs for each file
    const treeItems = []
    for (const f of files) {
      if (!isValidPath(f.path)) continue
      const blobRes = await ghFetch(`/repos/${repo}/git/blobs`, {
        method: 'POST',
        body: { content: f.content, encoding: 'utf-8' },
        token: tok,
      })
      if (!blobRes.ok) return { error: `Failed to create blob for ${f.path}` }
      treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blobRes.data.sha })
    }

    // 4. Create new tree
    const newTreeRes = await ghFetch(`/repos/${repo}/git/trees`, {
      method: 'POST',
      body: { base_tree: baseTree, tree: treeItems },
      token: tok,
    })
    if (!newTreeRes.ok) return { error: 'Failed to create tree' }

    // 5. Create commit
    const commitR = await ghFetch(`/repos/${repo}/git/commits`, {
      method: 'POST',
      body: { message: message.slice(0, 500), tree: newTreeRes.data.sha, parents: [latestSha] },
      token: tok,
    })
    if (!commitR.ok) return { error: 'Failed to create commit' }

    // 6. Update branch ref
    const updateRef = await ghFetch(`/repos/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: { sha: commitR.data.sha, force: false },
      token: tok,
    })
    if (!updateRef.ok) return { error: 'Failed to update branch ref' }

    return {
      success: true,
      commit: commitR.data.sha?.slice(0, 7),
      files_pushed: treeItems.length,
      branch,
      repo,
    }
  } catch (err) {
    return { error: err.message }
  }
}

// ── Tool: list_branches ───────────────────────────────────────────────────────
export async function list_branches({ repo, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  const { ok, data } = await ghFetch(`/repos/${repo}/branches?per_page=30`, { token })
  if (!ok) return { error: data.message || 'Failed to list branches' }
  return {
    repo,
    branches: (Array.isArray(data) ? data : []).map(b => ({
      name: b.name,
      sha: b.commit?.sha?.slice(0, 7),
      protected: b.protected,
    })),
  }
}

// ── Tool: create_branch ───────────────────────────────────────────────────────
export async function create_branch({ repo, branch, from_branch = 'main', token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  if (!branch || typeof branch !== 'string') return { error: 'Branch name required.' }

  const refRes = await ghFetch(`/repos/${repo}/git/refs/heads/${from_branch}`, { token })
  if (!refRes.ok) return { error: `Source branch "${from_branch}" not found` }
  const sha = refRes.data.object?.sha

  const { ok, data } = await ghFetch(`/repos/${repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${branch}`, sha },
    token,
  })
  if (!ok) return { error: data.message || 'Failed to create branch' }
  return { success: true, branch, from: from_branch, sha: sha?.slice(0, 7) }
}

// ── Tool: delete_branch ───────────────────────────────────────────────────────
export async function delete_branch({ repo, branch, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  if (!branch || branch === 'main' || branch === 'master') return { error: 'Cannot delete default branch.' }
  const { ok, status, data } = await ghFetch(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'DELETE', token,
  })
  if (status === 204) return { success: true, deleted: branch }
  if (!ok) return { error: data.message || 'Failed to delete branch' }
  return { success: true, deleted: branch }
}

// ── Tool: create_pull_request ─────────────────────────────────────────────────
export async function create_pull_request({ repo, title, body = '', head, base = 'main', token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  if (!title || !head) return { error: 'Title and head branch required.' }
  const { ok, status, data } = await ghFetch(`/repos/${repo}/pulls`, {
    method: 'POST',
    body: { title: title.slice(0, 256), body: body.slice(0, 2000), head, base },
    token,
  })
  if (!ok) return { error: data.message || `Failed to create PR (${status})` }
  return {
    success: true,
    number: data.number,
    html_url: data.html_url,
    title: data.title,
    state: data.state,
  }
}

// ── Tool: enable_pages ────────────────────────────────────────────────────────
export async function enable_pages({ repo, branch = 'main', path = '/', token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }

  // 1. Try POST (first-time enable) — always use source-based (legacy), never workflow
  const { ok, status, data } = await ghFetch(`/repos/${repo}/pages`, {
    method: 'POST',
    body: { source: { branch, path } },
    token,
  })

  // 2. If already enabled (409), switch to legacy via PUT
  if (status === 409) {
    const { ok: putOk, data: putData } = await ghFetch(`/repos/${repo}/pages`, {
      method: 'PUT',
      body: { build_type: 'legacy', source: { branch, path } },
      token,
    })
    const owner = repo.split('/')[0]
    const repoName = repo.split('/')[1]
    return {
      success: true,
      already_enabled: true,
      switched_to_legacy: putOk,
      html_url: putData?.html_url || `https://${owner}.github.io/${repoName}/`,
      status: putData?.status || 'built',
    }
  }

  if (!ok) return { error: data?.message || 'Failed to enable GitHub Pages' }

  const owner = repo.split('/')[0]
  const repoName = repo.split('/')[1]
  return {
    success: true,
    html_url: data?.html_url || `https://${owner}.github.io/${repoName}/`,
    status: data?.status,
    source: data?.source,
  }
}

// ── Tool: get_pages_status ────────────────────────────────────────────────────
export async function get_pages_status({ repo, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  const { ok, status, data } = await ghFetch(`/repos/${repo}/pages`, { token })
  if (status === 404) return { enabled: false, status: 'not_enabled' }
  if (!ok) return { error: data.message || 'Failed to get Pages status' }
  const owner = repo.split('/')[0]
  const repoName = repo.split('/')[1]
  return {
    enabled: true,
    status: data.status || 'unknown',
    html_url: data.html_url || `https://${owner}.github.io/${repoName}/`,
    source: data.source,
  }
}

// ── Tool: get_repo_info ───────────────────────────────────────────────────────
export async function get_repo_info({ repo, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  const { ok, data } = await ghFetch(`/repos/${repo}`, { token })
  if (!ok) return { error: data.message || 'Repo not found' }
  return {
    full_name: data.full_name,
    description: data.description,
    private: data.private,
    language: data.language,
    stars: data.stargazers_count,
    forks: data.forks_count,
    open_issues: data.open_issues_count,
    default_branch: data.default_branch,
    html_url: data.html_url,
    created_at: data.created_at,
    updated_at: data.updated_at,
    has_pages: data.has_pages,
  }
}

// ── Tool: search_code ─────────────────────────────────────────────────────────
export async function search_code({ repo, query, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  if (!query) return { error: 'query is required.' }
  const q = encodeURIComponent(`${query} repo:${repo}`)
  const { ok, data } = await ghFetch(`/search/code?q=${q}&per_page=20`, { token })
  if (!ok) return { error: data.message || 'Code search failed' }
  return {
    total: data.total_count,
    results: (data.items || []).map(i => ({ path: i.path, url: i.html_url, sha: i.sha })),
  }
}

// ── Tool: find_files ──────────────────────────────────────────────────────────
export async function find_files({ repo, pattern, branch = 'main', token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  if (!pattern) return { error: 'pattern is required.' }
  const branchInfo = await ghFetch(`/repos/${repo}/branches/${encodeURIComponent(branch)}`, { token })
  if (!branchInfo.ok) return { error: `Branch "${branch}" not found` }
  const treeSha = branchInfo.data.commit?.commit?.tree?.sha
  if (!treeSha) return { error: 'Cannot get tree SHA' }
  const { ok, data } = await ghFetch(`/repos/${repo}/git/trees/${treeSha}?recursive=1`, { token })
  if (!ok) return { error: data.message || 'Failed to get file tree' }
  const regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.'), 'i')
  const matches = (data.tree || []).filter(f => f.type === 'blob' && regex.test(f.path.split('/').pop() || f.path))
  return { repo, pattern, matches: matches.map(f => ({ path: f.path, size: f.size })) }
}

// ── Tool: get_commits ─────────────────────────────────────────────────────────
export async function get_commits({ repo, branch = 'main', per_page = 10, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  const n = Math.min(Number(per_page) || 10, 30)
  const { ok, data } = await ghFetch(`/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${n}`, { token })
  if (!ok) return { error: data.message || 'Failed to get commits' }
  return {
    repo, branch,
    commits: (Array.isArray(data) ? data : []).map(c => ({
      sha: c.sha?.slice(0, 7),
      message: c.commit?.message?.split('\n')[0]?.slice(0, 120),
      author: c.commit?.author?.name,
      date: c.commit?.author?.date,
      url: c.html_url,
    })),
  }
}

// ── Tool: delete_file ─────────────────────────────────────────────────────────
export async function delete_file({ repo, path, message = 'Delete via DZ Agent', branch = 'main', token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  if (!isValidPath(path)) return { error: 'Invalid file path.' }
  const existing = await ghFetch(`/repos/${repo}/contents/${path}?ref=${branch}`, { token })
  if (!existing.ok) return { error: existing.data.message || 'File not found' }
  const sha = existing.data.sha
  const { ok, status, data } = await ghFetch(`/repos/${repo}/contents/${path}`, {
    method: 'DELETE',
    body: { message: message.slice(0, 500), sha, branch },
    token,
  })
  if (status === 200 || ok) return { success: true, path, repo, commit: data.commit?.sha?.slice(0, 7) }
  return { error: data.message || 'Failed to delete file' }
}

// ── Tool: get_tree ────────────────────────────────────────────────────────────
export async function get_tree({ repo, path = '', branch = 'main', token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  const branchInfo = await ghFetch(`/repos/${repo}/branches/${encodeURIComponent(branch)}`, { token })
  if (!branchInfo.ok) return { error: `Branch "${branch}" not found` }
  const treeSha = branchInfo.data.commit?.commit?.tree?.sha
  if (!treeSha) return { error: 'Cannot get tree SHA' }
  const { ok, data } = await ghFetch(`/repos/${repo}/git/trees/${treeSha}?recursive=1`, { token })
  if (!ok) return { error: data.message || 'Failed to get tree' }
  const prefix = path ? path.replace(/\/$/, '') + '/' : ''
  const items = (data.tree || [])
    .filter(f => !prefix || f.path.startsWith(prefix))
    .map(f => ({ path: f.path, type: f.type, size: f.size }))
    .slice(0, 200)
  return { repo, branch, root: path || '/', items }
}

// ── Tool: get_diff ────────────────────────────────────────────────────────────
export async function get_diff({ repo, base, head, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  if (!base || !head) return { error: 'base and head are required.' }
  const { ok, data } = await ghFetch(`/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`, { token })
  if (!ok) return { error: data.message || 'Failed to get diff' }
  return {
    repo, base, head,
    ahead_by: data.ahead_by,
    behind_by: data.behind_by,
    status: data.status,
    commits: (data.commits || []).map(c => ({
      sha: c.sha?.slice(0, 7),
      message: c.commit?.message?.split('\n')[0]?.slice(0, 100),
    })),
    files: (data.files || []).map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch?.slice(0, 800),
    })),
  }
}

// ── Tool: create_issue ────────────────────────────────────────────────────────
export async function create_issue({ repo, title, body = '', labels = [], token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  if (!title) return { error: 'title is required.' }
  const { ok, status, data } = await ghFetch(`/repos/${repo}/issues`, {
    method: 'POST',
    body: { title: title.slice(0, 256), body: body.slice(0, 2000), labels },
    token,
  })
  if (!ok) return { error: data.message || `Failed to create issue (${status})` }
  return { success: true, number: data.number, title: data.title, html_url: data.html_url, state: data.state }
}

// ── Tool: close_issue ─────────────────────────────────────────────────────────
export async function close_issue({ repo, issue_number, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  if (!issue_number) return { error: 'issue_number is required.' }
  const { ok, data } = await ghFetch(`/repos/${repo}/issues/${issue_number}`, {
    method: 'PATCH',
    body: { state: 'closed' },
    token,
  })
  if (!ok) return { error: data.message || 'Failed to close issue' }
  return { success: true, number: data.number, state: data.state, html_url: data.html_url }
}

// ── Tool: get_actions ─────────────────────────────────────────────────────────
export async function get_actions({ repo, per_page = 5, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  const { ok, data } = await ghFetch(`/repos/${repo}/actions/runs?per_page=${Math.min(Number(per_page) || 5, 10)}`, { token })
  if (!ok) return { error: data.message || 'Failed to get Actions runs' }
  return {
    repo,
    total: data.total_count,
    runs: (data.workflow_runs || []).map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      branch: r.head_branch,
      sha: r.head_sha?.slice(0, 7),
      created_at: r.created_at,
      html_url: r.html_url,
    })),
  }
}

// ── Tool: create_release ──────────────────────────────────────────────────────
export async function create_release({ repo, tag, name, body = '', prerelease = false, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  if (!tag) return { error: 'tag is required (e.g. v1.0.0).' }
  const { ok, status, data } = await ghFetch(`/repos/${repo}/releases`, {
    method: 'POST',
    body: { tag_name: tag, name: name || tag, body: body.slice(0, 2000), prerelease },
    token,
  })
  if (!ok) return { error: data.message || `Failed to create release (${status})` }
  return { success: true, id: data.id, tag: data.tag_name, name: data.name, html_url: data.html_url }
}

// ── Tool: get_pr_files ────────────────────────────────────────────────────────
export async function get_pr_files({ repo, pull_number, token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format.' }
  if (!pull_number) return { error: 'pull_number is required.' }
  const [prRes, filesRes] = await Promise.all([
    ghFetch(`/repos/${repo}/pulls/${pull_number}`, { token }),
    ghFetch(`/repos/${repo}/pulls/${pull_number}/files?per_page=30`, { token }),
  ])
  if (!prRes.ok) return { error: prRes.data.message || 'PR not found' }
  return {
    repo,
    number: prRes.data.number,
    title: prRes.data.title,
    state: prRes.data.state,
    head: prRes.data.head?.ref,
    base: prRes.data.base?.ref,
    html_url: prRes.data.html_url,
    body: prRes.data.body?.slice(0, 500),
    files: (Array.isArray(filesRes.data) ? filesRes.data : []).map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch?.slice(0, 600),
    })),
  }
}

// ── Tool dispatcher ───────────────────────────────────────────────────────────
export const GITHUB_TOOLS = {
  get_auth_user,
  list_repos,
  create_repo,
  list_files,
  read_file,
  push_file,
  push_files_batch,
  list_branches,
  create_branch,
  delete_branch,
  create_pull_request,
  enable_pages,
  get_pages_status,
  get_repo_info,
  search_code,
  find_files,
  get_commits,
  delete_file,
  get_tree,
  get_diff,
  create_issue,
  close_issue,
  get_actions,
  create_release,
  get_pr_files,
}

export async function executeGithubTool(toolName, args = {}) {
  const fn = GITHUB_TOOLS[toolName]
  if (!fn) return { error: `Unknown GitHub tool: "${toolName}"` }
  const token = args.token || getIntegrationSecret('github')
  try {
    return await fn({ ...args, token })
  } catch (err) {
    return { error: err.message }
  }
}
