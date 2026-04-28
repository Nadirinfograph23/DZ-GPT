// DZ Agent — GitHub Intelligence Engine.
// Search repos & code, extract README, detect stack, surface insights.
// Uses GITHUB_TOKEN if available (5000 req/h instead of 60).

import { githubCache, makeKey } from './cache.js'

const GH_BASE = 'https://api.github.com'

function ghHeaders() {
  const h = { 'User-Agent': 'DZ-Agent/3.0', 'Accept': 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) h.Authorization = `token ${process.env.GITHUB_TOKEN}`
  return h
}

async function ghGet(path) {
  const r = await fetch(GH_BASE + path, { headers: ghHeaders(), signal: AbortSignal.timeout(12000) })
  if (!r.ok) throw new Error(`GitHub ${r.status} on ${path}`)
  return r.json()
}

// Search repos sorted by recently updated, with a relevance pass.
export async function searchRepos(query, { perPage = 8, sort = 'updated' } = {}) {
  const key = makeKey('gh:repos', query, { perPage, sort })
  const cached = githubCache.get(key)
  if (cached) return { ...cached, cached: true }

  const q = encodeURIComponent(query)
  const data = await ghGet(`/search/repositories?q=${q}&sort=${sort}&order=desc&per_page=${perPage}`)
  const items = (data.items || []).map(r => ({
    fullName: r.full_name,
    description: r.description,
    stars: r.stargazers_count,
    forks: r.forks_count,
    issues: r.open_issues_count,
    language: r.language,
    pushedAt: r.pushed_at,
    updatedAt: r.updated_at,
    url: r.html_url,
    topics: r.topics || [],
    license: r.license?.spdx_id || null,
    archived: r.archived,
    isFork: r.fork,
  }))

  // Filter: drop archived, drop "stale" (>1y since push) for sort=updated
  const fresh = items.filter(i => !i.archived && (!i.pushedAt || (Date.now() - Date.parse(i.pushedAt)) < 365 * 86400 * 1000))
  // Score: stars (log) + freshness + relevance keyword overlap
  const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)
  const scored = fresh.map(i => {
    const text = `${i.fullName} ${i.description || ''} ${(i.topics || []).join(' ')}`.toLowerCase()
    const rel = tokens.reduce((s, t) => s + (text.includes(t) ? 5 : 0), 0)
    const ageH = i.pushedAt ? (Date.now() - Date.parse(i.pushedAt)) / 3600e3 : 1e6
    const freshBoost = ageH < 24 ? 20 : ageH < 168 ? 12 : ageH < 720 ? 6 : 0
    const starBoost = Math.log10((i.stars || 0) + 10) * 8
    return { ...i, _score: rel + freshBoost + starBoost }
  }).sort((a, b) => b._score - a._score)

  const payload = {
    query,
    fetchedAt: new Date().toISOString(),
    total: data.total_count,
    items: scored.slice(0, perPage),
  }
  githubCache.set(key, payload)
  return payload
}

// Search code globally — useful for "how to" / snippet discovery.
export async function searchCode(query, { perPage = 6 } = {}) {
  const key = makeKey('gh:code', query, { perPage })
  const cached = githubCache.get(key)
  if (cached) return { ...cached, cached: true }
  const q = encodeURIComponent(query)
  const data = await ghGet(`/search/code?q=${q}&per_page=${perPage}`)
  const items = (data.items || []).map(c => ({
    repo: c.repository?.full_name,
    path: c.path,
    name: c.name,
    url: c.html_url,
    score: c.score,
  }))
  const payload = { query, fetchedAt: new Date().toISOString(), total: data.total_count, items }
  githubCache.set(key, payload)
  return payload
}

// Fetch README and detect stack.
export async function getRepoInsight(fullName) {
  const key = makeKey('gh:insight', fullName)
  const cached = githubCache.get(key)
  if (cached) return { ...cached, cached: true }

  const [meta, langs, readme] = await Promise.allSettled([
    ghGet(`/repos/${fullName}`),
    ghGet(`/repos/${fullName}/languages`),
    ghGet(`/repos/${fullName}/readme`).then(r => Buffer.from(r.content || '', 'base64').toString('utf8')),
  ])

  const m = meta.status === 'fulfilled' ? meta.value : {}
  const langMap = langs.status === 'fulfilled' ? langs.value : {}
  const readmeText = readme.status === 'fulfilled' ? readme.value : ''
  const stack = detectStack(readmeText, langMap, m.topics || [])

  const payload = {
    fullName,
    description: m.description,
    stars: m.stargazers_count,
    pushedAt: m.pushed_at,
    license: m.license?.spdx_id,
    topics: m.topics || [],
    languages: Object.entries(langMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k),
    stack,
    readmeExcerpt: (readmeText || '').slice(0, 4000),
    fetchedAt: new Date().toISOString(),
  }
  githubCache.set(key, payload)
  return payload
}

// Heuristic stack detector — fast, no AI needed.
export function detectStack(readme = '', languages = {}, topics = []) {
  const text = `${readme}\n${topics.join(' ')}`.toLowerCase()
  const stack = new Set()
  const flag = (label, patterns) => { if (patterns.some(p => text.includes(p))) stack.add(label) }
  flag('React',      ['react', 'jsx', 'tsx'])
  flag('Next.js',    ['next.js', 'nextjs', 'next/'])
  flag('Vue',        ['vue.js', 'vuejs', 'vue3'])
  flag('Svelte',     ['svelte'])
  flag('Angular',    ['angular'])
  flag('Vite',       ['vite'])
  flag('Tailwind',   ['tailwind'])
  flag('Express',    ['express'])
  flag('Fastify',    ['fastify'])
  flag('Nest.js',    ['nestjs', 'nest.js'])
  flag('FastAPI',    ['fastapi'])
  flag('Django',     ['django'])
  flag('Flask',      ['flask'])
  flag('PostgreSQL', ['postgres', 'postgresql'])
  flag('MongoDB',    ['mongodb', 'mongoose'])
  flag('Redis',      ['redis'])
  flag('Docker',     ['docker'])
  flag('Kubernetes', ['kubernetes', 'k8s'])
  // Languages from API
  for (const l of Object.keys(languages)) stack.add(l)
  return Array.from(stack).slice(0, 12)
}

// Trending repos — used by the cron warm-up.
export async function trendingRepos(language = '', { limit = 12 } = {}) {
  const sinceISO = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10)
  let q = `created:>${sinceISO} stars:>50`
  if (language) q += ` language:${language}`
  const data = await ghGet(`/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${limit}`)
  return (data.items || []).map(r => ({
    fullName: r.full_name, stars: r.stargazers_count, url: r.html_url,
    description: r.description, language: r.language, pushedAt: r.pushed_at,
  }))
}
