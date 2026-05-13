/**
 * DZ Agent — GitHub Tool Executor
 * Direct GitHub REST + Git Data API calls — no HTTP middleware.
 * Used by the ReAct agent loop to execute real GitHub actions.
 */

const GH_BASE = 'https://api.github.com'

function getToken() {
  return process.env.GITHUB_TOKEN || ''
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
export async function list_files({ repo, path = '', token } = {}) {
  if (!isValidRepo(repo)) return { error: 'Invalid repo format. Use owner/repo.' }
  const safePath = path && isValidPath(path) ? path : ''
  const { ok, data } = await ghFetch(`/repos/${repo}/contents/${safePath}`, { token })
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
  get_repo_info,
}

export async function executeGithubTool(toolName, args = {}) {
  const fn = GITHUB_TOOLS[toolName]
  if (!fn) return { error: `Unknown GitHub tool: "${toolName}"` }
  const token = args.token || process.env.GITHUB_TOKEN || ''
  try {
    return await fn({ ...args, token })
  } catch (err) {
    return { error: err.message }
  }
}
