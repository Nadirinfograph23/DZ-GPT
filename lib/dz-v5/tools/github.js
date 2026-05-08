/**
 * DZ Agent V5 — GitHub Tool
 * Interact with GitHub: read files, search repos, list issues, create PRs, etc.
 */

const BASE = 'https://api.github.com'
const TIMEOUT_MS = 12000

function headers() {
  const h = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'DZ-Agent/5.0',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (process.env.GITHUB_TOKEN) h['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
  return h
}

async function ghFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`GitHub API ${res.status}: ${err.message || res.statusText}`)
  }
  return res.json()
}

export class GitHubTool {
  async execute(input, _ctx) {
    const action = typeof input === 'object' ? input.action : 'read_file'
    const params = typeof input === 'object' ? input : { action: 'search', query: input }

    switch (action) {
      case 'read_file':    return this.readFile(params)
      case 'list_files':   return this.listFiles(params)
      case 'search_code':  return this.searchCode(params)
      case 'search_repos': return this.searchRepos(params)
      case 'list_issues':  return this.listIssues(params)
      case 'get_repo':     return this.getRepo(params)
      case 'list_commits': return this.listCommits(params)
      case 'create_file':  return this.createFile(params)
      default:
        return this.searchRepos(params)
    }
  }

  async readFile({ owner, repo, path, branch = 'main' }) {
    if (!owner || !repo || !path) return { error: 'owner, repo, path required' }
    try {
      const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`)
      const content = Buffer.from(data.content || '', 'base64').toString('utf8')
      return { output: content, url: data.html_url, sha: data.sha, size: data.size }
    } catch (err) { return { error: err.message } }
  }

  async listFiles({ owner, repo, path = '', branch = 'main' }) {
    if (!owner || !repo) return { error: 'owner and repo required' }
    try {
      const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`)
      const files = Array.isArray(data) ? data : [data]
      return {
        output: files.map(f => ({ name: f.name, type: f.type, path: f.path, size: f.size })),
        count: files.length,
      }
    } catch (err) { return { error: err.message } }
  }

  async searchCode({ query, owner, repo, language }) {
    if (!query) return { error: 'query required' }
    let q = query
    if (owner && repo) q += ` repo:${owner}/${repo}`
    if (language) q += ` language:${language}`
    try {
      const data = await ghFetch(`/search/code?q=${encodeURIComponent(q)}&per_page=10`)
      return {
        output: (data.items || []).map(item => ({
          path: item.path,
          repo: item.repository.full_name,
          url: item.html_url,
          sha: item.sha,
        })),
        total: data.total_count,
      }
    } catch (err) { return { error: err.message } }
  }

  async searchRepos({ query, language, sort = 'stars', limit = 10 }) {
    if (!query) return { error: 'query required' }
    let q = query
    if (language) q += ` language:${language}`
    try {
      const data = await ghFetch(`/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&per_page=${limit}`)
      return {
        output: (data.items || []).map(r => ({
          name: r.full_name,
          description: r.description,
          stars: r.stargazers_count,
          language: r.language,
          url: r.html_url,
          updated: r.updated_at,
        })),
        total: data.total_count,
      }
    } catch (err) { return { error: err.message } }
  }

  async listIssues({ owner, repo, state = 'open', limit = 20 }) {
    if (!owner || !repo) return { error: 'owner and repo required' }
    try {
      const data = await ghFetch(`/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}`)
      return {
        output: data.map(i => ({ number: i.number, title: i.title, state: i.state, url: i.html_url, created: i.created_at })),
        count: data.length,
      }
    } catch (err) { return { error: err.message } }
  }

  async getRepo({ owner, repo }) {
    if (!owner || !repo) return { error: 'owner and repo required' }
    try {
      const data = await ghFetch(`/repos/${owner}/${repo}`)
      return {
        output: {
          name: data.full_name,
          description: data.description,
          language: data.language,
          stars: data.stargazers_count,
          forks: data.forks_count,
          openIssues: data.open_issues_count,
          defaultBranch: data.default_branch,
          url: data.html_url,
          topics: data.topics,
          updatedAt: data.updated_at,
        },
      }
    } catch (err) { return { error: err.message } }
  }

  async listCommits({ owner, repo, branch = 'main', limit = 10 }) {
    if (!owner || !repo) return { error: 'owner and repo required' }
    try {
      const data = await ghFetch(`/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${limit}`)
      return {
        output: data.map(c => ({
          sha: c.sha.slice(0, 8),
          message: c.commit.message.split('\n')[0],
          author: c.commit.author.name,
          date: c.commit.author.date,
          url: c.html_url,
        })),
        count: data.length,
      }
    } catch (err) { return { error: err.message } }
  }

  async createFile({ owner, repo, path, content, message, branch = 'main' }) {
    if (!owner || !repo || !path || !content) return { error: 'owner, repo, path, content required' }
    if (!process.env.GITHUB_TOKEN) return { error: 'GITHUB_TOKEN not available' }
    try {
      const encoded = Buffer.from(content).toString('base64')
      const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({ message: message || `Create ${path} via DZ Agent`, content: encoded, branch }),
      })
      return { output: { url: data.content?.html_url, sha: data.content?.sha }, created: true }
    } catch (err) { return { error: err.message } }
  }
}
