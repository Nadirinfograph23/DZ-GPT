// V3 Web App Generator — produces real, runnable React + Express templates.
// Each template returns { template, title, files: { 'path': 'content' }, totalBytes }.
// Files are stored as in-memory artifacts keyed by id; a download endpoint
// serves them as a zip created on the fly (with no zip dependency — uses
// the standard PKZIP "stored" (no compression) format which we encode by hand).

import crypto from 'node:crypto'

const ARTIFACTS = new Map() // id → { app, createdAt }
const TTL_MS = 60 * 60 * 1000 // 1h

const TEMPLATES = {
  'news-site': makeNewsSite,
  'saas-starter': makeSaasStarter,
  'blog-cms': makeBlogCms,
}

export function listTemplates() {
  return [
    { id: 'news-site',    description: 'Live news aggregator (Algerian + global) — React + Express' },
    { id: 'saas-starter', description: 'SaaS dashboard scaffold with auth-ready routes' },
    { id: 'blog-cms',     description: 'Markdown-driven blog/CMS with admin posts API' },
  ]
}

export function generateApp(templateId, opts = {}) {
  const fn = TEMPLATES[templateId]
  if (!fn) throw new Error(`unknown template: ${templateId}`)
  const app = fn(opts)
  app.template = templateId
  app.title = opts.title || 'My App'
  app.totalBytes = Object.values(app.files).reduce((acc, c) => acc + Buffer.byteLength(c, 'utf8'), 0)
  return app
}

export async function storeArtifact(app) {
  gc()
  const id = `a_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
  ARTIFACTS.set(id, { app, createdAt: Date.now() })
  return id
}

export function getArtifact(id) {
  const a = ARTIFACTS.get(id)
  return a ? a.app : null
}

export function getArtifactURL(id) {
  return `/api/dz-agent-v3/artifact/${id}/download`
}

function gc() {
  const cutoff = Date.now() - TTL_MS
  for (const [id, a] of ARTIFACTS) {
    if (a.createdAt < cutoff) ARTIFACTS.delete(id)
  }
}

// ─── Zip writer (no deps, "stored" method = no compression) ──────────────────
// Produces a valid PKZIP archive with local headers + central directory.
// Suitable for source code (a few hundred KB max).
export function createZip(files) {
  const fileEntries = []
  const localChunks = []
  let offset = 0

  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8')
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const size = data.length

    // Local file header (sig 0x04034b50)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)              // version needed
    local.writeUInt16LE(0, 6)               // flags
    local.writeUInt16LE(0, 8)               // method (0 = stored)
    local.writeUInt16LE(0, 10)              // modtime
    local.writeUInt16LE(0, 12)              // moddate
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(size, 18)           // compressed size
    local.writeUInt32LE(size, 22)           // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)              // extra len
    localChunks.push(local, nameBuf, data)

    fileEntries.push({ name, nameBuf, crc, size, offset })
    offset += local.length + nameBuf.length + data.length
  }

  // Central directory
  const centralChunks = []
  let centralSize = 0
  for (const f of fileEntries) {
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)            // version made by
    central.writeUInt16LE(20, 6)            // version needed
    central.writeUInt16LE(0, 8)             // flags
    central.writeUInt16LE(0, 10)            // method
    central.writeUInt16LE(0, 12)            // modtime
    central.writeUInt16LE(0, 14)            // moddate
    central.writeUInt32LE(f.crc, 16)
    central.writeUInt32LE(f.size, 20)
    central.writeUInt32LE(f.size, 24)
    central.writeUInt16LE(f.nameBuf.length, 28)
    central.writeUInt16LE(0, 30)            // extra
    central.writeUInt16LE(0, 32)            // comment
    central.writeUInt16LE(0, 34)            // disk
    central.writeUInt16LE(0, 36)            // internal attrs
    central.writeUInt32LE(0, 38)            // external attrs
    central.writeUInt32LE(f.offset, 42)
    centralChunks.push(central, f.nameBuf)
    centralSize += central.length + f.nameBuf.length
  }

  // End of central dir
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)                  // disk
  eocd.writeUInt16LE(0, 6)                  // disk with cd
  eocd.writeUInt16LE(fileEntries.length, 8)
  eocd.writeUInt16LE(fileEntries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)                 // comment len

  return Buffer.concat([...localChunks, ...centralChunks, eocd])
}

// CRC-32 (table-based, IEEE polynomial)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

// ─── Templates ───────────────────────────────────────────────────────────────
function makeNewsSite({ title = 'My News Site', brief = '' }) {
  const files = {
    'package.json': JSON.stringify({
      name: slug(title),
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'node server.js',
        start: 'NODE_ENV=production node server.js',
      },
      dependencies: { express: '^4.21.0', cors: '^2.8.5' },
    }, null, 2) + '\n',
    'README.md': `# ${title}\n\n_Generated by DZ Agent V3 — Dev Agent_\n\nBrief: ${brief}\n\n## Run\n\n\`\`\`bash\nnpm install\nnpm run dev   # → http://localhost:3000\n\`\`\`\n\n## Stack\n- Express server with built-in news aggregator\n- Vanilla HTML/CSS/JS frontend (no build step)\n- Auto-refresh every 5 minutes\n\n## Customize\n- Edit \`server.js\` to change RSS feeds\n- Edit \`public/index.html\` and \`public/styles.css\` to restyle\n`,
    'server.js': `import express from 'express'\nimport cors from 'cors'\nimport { fileURLToPath } from 'url'\nimport path from 'path'\n\nconst __filename = fileURLToPath(import.meta.url)\nconst __dirname = path.dirname(__filename)\n\nconst app = express()\napp.use(cors())\napp.use(express.static(path.join(__dirname, 'public')))\n\nconst FEEDS = [\n  { name: 'Le Soir d\\'Algerie', url: 'https://www.lesoirdalgerie.com/feed' },\n  { name: 'TSA',                 url: 'https://www.tsa-algerie.com/feed' },\n  { name: 'BBC World',           url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },\n  { name: 'Al Jazeera',          url: 'https://www.aljazeera.com/xml/rss/all.xml' },\n]\n\nlet CACHE = { ts: 0, items: [] }\nconst TTL = 5 * 60 * 1000\n\nasync function fetchFeed(feed) {\n  try {\n    const r = await fetch(feed.url, { signal: AbortSignal.timeout(7000) })\n    if (!r.ok) return []\n    const xml = await r.text()\n    const items = []\n    const re = /<item[\\s\\S]*?>([\\s\\S]*?)<\\/item>/gi\n    let m; let i = 0\n    while ((m = re.exec(xml)) && i < 10) {\n      const block = m[1]\n      const title = (block.match(/<title>(?:<!\\[CDATA\\[)?([^<\\]]+)/i) || [])[1] || ''\n      const link  = (block.match(/<link>(?:<!\\[CDATA\\[)?([^<\\]]+)/i)  || [])[1] || ''\n      const date  = (block.match(/<pubDate>([^<]+)/i) || [])[1] || ''\n      if (title) items.push({ title: title.trim(), link: link.trim(), date, source: feed.name })\n      i++\n    }\n    return items\n  } catch { return [] }\n}\n\nasync function refresh() {\n  const all = await Promise.all(FEEDS.map(fetchFeed))\n  CACHE = { ts: Date.now(), items: all.flat().sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 50) }\n}\n\napp.get('/api/news', async (_req, res) => {\n  if (Date.now() - CACHE.ts > TTL) await refresh()\n  res.json({ ok: true, count: CACHE.items.length, refreshedAt: CACHE.ts, items: CACHE.items })\n})\n\nconst PORT = process.env.PORT || 3000\napp.listen(PORT, () => {\n  console.log(\`${title} running on http://localhost:\${PORT}\`)\n  refresh().catch(() => {})\n})\n`,
    'public/index.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>${title}</title>\n<link rel="stylesheet" href="/styles.css">\n</head>\n<body>\n<header>\n  <h1>${title}</h1>\n  <p class="sub">Live news, auto-refreshed every 5 minutes.</p>\n</header>\n<main>\n  <div id="status">Loading…</div>\n  <ul id="news"></ul>\n</main>\n<script src="/app.js"></script>\n</body>\n</html>\n`,
    'public/styles.css': `* { box-sizing: border-box } body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0 }\nheader { padding: 32px 24px; border-bottom: 1px solid #1e293b; max-width: 980px; margin: 0 auto }\nheader h1 { margin: 0 0 6px; font-size: 28px }\n.sub { margin: 0; color: #94a3b8; font-size: 14px }\nmain { max-width: 980px; margin: 0 auto; padding: 24px }\n#status { color: #64748b; font-size: 13px; margin-bottom: 16px }\n#news { list-style: none; padding: 0; margin: 0 }\n#news li { padding: 14px 0; border-bottom: 1px solid #1e293b }\n#news a { color: #38bdf8; text-decoration: none; font-weight: 600 }\n#news a:hover { text-decoration: underline }\n#news .meta { color: #64748b; font-size: 12px; margin-top: 4px }\n`,
    'public/app.js': `async function load() {\n  document.getElementById('status').textContent = 'Loading latest…'\n  try {\n    const r = await fetch('/api/news')\n    const j = await r.json()\n    document.getElementById('status').textContent = \`\${j.count} stories · refreshed \${new Date(j.refreshedAt).toLocaleTimeString()}\`\n    const ul = document.getElementById('news')\n    ul.innerHTML = j.items.map(it => \`<li><a href="\${it.link}" target="_blank" rel="noopener">\${it.title}</a><div class="meta">\${it.source} · \${it.date ? new Date(it.date).toLocaleString() : ''}</div></li>\`).join('')\n  } catch (e) {\n    document.getElementById('status').textContent = 'Failed to load: ' + e.message\n  }\n}\nload()\nsetInterval(load, 5 * 60 * 1000)\n`,
    '.gitignore': 'node_modules\n.env\n.DS_Store\n',
  }
  return { files }
}

function makeSaasStarter({ title = 'My SaaS', brief = '' }) {
  const files = {
    'package.json': JSON.stringify({
      name: slug(title), version: '0.1.0', private: true, type: 'module',
      scripts: { dev: 'node server.js', start: 'NODE_ENV=production node server.js' },
      dependencies: { express: '^4.21.0', cors: '^2.8.5' },
    }, null, 2) + '\n',
    'README.md': `# ${title}\n\n_Generated by DZ Agent V3 — Dev Agent_\n\nBrief: ${brief}\n\n## What's included\n- Express backend with auth-ready routes (\`/api/auth/login\`, \`/api/auth/me\`)\n- Simple JWT-style session token (replace with real JWT before production)\n- Dashboard UI with sidebar, top stats, and a sample data table\n- In-memory user store (swap for Postgres / Mongo as needed)\n\n## Run\n\`\`\`bash\nnpm install\nnpm run dev   # → http://localhost:3000\n\`\`\`\n\n## Demo login\n\`admin@demo.com / admin\`\n`,
    'server.js': `import express from 'express'\nimport cors from 'cors'\nimport crypto from 'crypto'\nimport { fileURLToPath } from 'url'\nimport path from 'path'\n\nconst __dirname = path.dirname(fileURLToPath(import.meta.url))\nconst app = express()\napp.use(cors()); app.use(express.json())\napp.use(express.static(path.join(__dirname, 'public')))\n\n// In-memory user store (REPLACE WITH A REAL DB IN PRODUCTION)\nconst USERS = new Map([['admin@demo.com', { email: 'admin@demo.com', password: 'admin', name: 'Admin' }]])\nconst SESSIONS = new Map() // token → email\n\napp.post('/api/auth/login', (req, res) => {\n  const { email, password } = req.body || {}\n  const u = USERS.get(email)\n  if (!u || u.password !== password) return res.status(401).json({ ok: false, error: 'invalid credentials' })\n  const token = crypto.randomBytes(24).toString('hex')\n  SESSIONS.set(token, email)\n  res.json({ ok: true, token, user: { email: u.email, name: u.name } })\n})\n\napp.get('/api/auth/me', (req, res) => {\n  const token = (req.headers.authorization || '').replace('Bearer ', '')\n  const email = SESSIONS.get(token)\n  if (!email) return res.status(401).json({ ok: false })\n  res.json({ ok: true, user: USERS.get(email) })\n})\n\napp.get('/api/stats', (_req, res) => {\n  res.json({\n    activeUsers: 1240, mrr: 8920, churn: 0.034, signupsToday: 18,\n    chart: Array.from({ length: 14 }, () => Math.round(50 + Math.random() * 200)),\n  })\n})\n\nconst PORT = process.env.PORT || 3000\napp.listen(PORT, () => console.log(\`${title} running on http://localhost:\${PORT}\`))\n`,
    'public/index.html': `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="/styles.css"></head>\n<body><div id="app"></div><script src="/app.js"></script></body></html>\n`,
    'public/styles.css': `* { box-sizing: border-box } body { margin: 0; font-family: system-ui, sans-serif; background: #0b1120; color: #e2e8f0 }\n#app { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh }\n.sidebar { background: #0f172a; border-right: 1px solid #1e293b; padding: 24px 16px }\n.sidebar h2 { font-size: 14px; color: #94a3b8; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.06em }\n.sidebar a { display: block; padding: 8px 10px; color: #cbd5e1; text-decoration: none; border-radius: 6px; margin-bottom: 2px }\n.sidebar a.active, .sidebar a:hover { background: #1e293b; color: #fff }\nmain { padding: 28px 32px }\nmain h1 { margin: 0 0 24px }\n.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px }\n.card { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 16px }\n.card .label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px }\n.card .value { font-size: 28px; font-weight: 700 }\ntable { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden }\nth, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #334155 }\nth { background: #0f172a; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em }\n.login { max-width: 360px; margin: 80px auto; padding: 24px; background: #1e293b; border-radius: 10px }\n.login h1 { margin: 0 0 16px } .login input { width: 100%; padding: 10px; margin-bottom: 10px; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px }\n.login button { width: 100%; padding: 10px; background: #38bdf8; color: #0b1120; border: 0; border-radius: 6px; font-weight: 600; cursor: pointer }\n.login .err { color: #fca5a5; font-size: 13px; margin-top: 8px }\n`,
    'public/app.js': `const root = document.getElementById('app')\n\nasync function api(path, opts = {}) {\n  const token = localStorage.getItem('token') || ''\n  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...(opts.headers || {}) } })\n  return r.json()\n}\n\nasync function dashboard() {\n  const me = await api('/api/auth/me'); if (!me.ok) return login()\n  const stats = await api('/api/stats')\n  root.innerHTML = \`\n    <aside class="sidebar"><h2>${title}</h2><a class="active" href="#">Dashboard</a><a href="#">Users</a><a href="#">Billing</a><a href="#">Settings</a></aside>\n    <main><h1>Welcome, \${me.user.name}</h1>\n      <div class="cards">\n        <div class="card"><div class="label">Active users</div><div class="value">\${stats.activeUsers}</div></div>\n        <div class="card"><div class="label">MRR</div><div class="value">$\${stats.mrr}</div></div>\n        <div class="card"><div class="label">Churn</div><div class="value">\${(stats.churn*100).toFixed(1)}%</div></div>\n        <div class="card"><div class="label">Signups today</div><div class="value">\${stats.signupsToday}</div></div>\n      </div>\n      <table><thead><tr><th>Day</th><th>Signups</th></tr></thead><tbody>\n        \${stats.chart.map((v,i) => \`<tr><td>D-\${14-i}</td><td>\${v}</td></tr>\`).join('')}\n      </tbody></table>\n    </main>\`\n}\n\nfunction login() {\n  root.innerHTML = \`<div class="login"><h1>Sign in to ${title}</h1>\n    <input id="email" type="email" placeholder="email"><input id="pw" type="password" placeholder="password">\n    <button id="go">Sign in</button><div class="err" id="err"></div>\n    <p style="margin-top:12px;font-size:12px;color:#64748b">Demo: admin@demo.com / admin</p></div>\`\n  document.getElementById('go').onclick = async () => {\n    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: email.value, password: pw.value }) })\n    if (r.ok) { localStorage.setItem('token', r.token); dashboard() }\n    else document.getElementById('err').textContent = r.error || 'Login failed'\n  }\n}\n\ndashboard()\n`,
    '.gitignore': 'node_modules\n.env\n.DS_Store\n',
  }
  return { files }
}

function makeBlogCms({ title = 'My Blog', brief = '' }) {
  const files = {
    'package.json': JSON.stringify({
      name: slug(title), version: '0.1.0', private: true, type: 'module',
      scripts: { dev: 'node server.js', start: 'NODE_ENV=production node server.js' },
      dependencies: { express: '^4.21.0', cors: '^2.8.5' },
    }, null, 2) + '\n',
    'README.md': `# ${title}\n\n_Generated by DZ Agent V3 — Dev Agent_\n\nBrief: ${brief}\n\nMarkdown-driven blog with admin POST API.\n\n## Run\n\`\`\`bash\nnpm install\nnpm run dev   # → http://localhost:3000\n\`\`\`\n\n## Add a post\n\`\`\`bash\ncurl -X POST localhost:3000/api/posts -H 'content-type: application/json' \\\n  -H 'x-admin-token: change-me' \\\n  -d '{"title":"Hello","slug":"hello","body":"# Welcome\\n\\nFirst post."}'\n\`\`\`\n`,
    'server.js': `import express from 'express'\nimport cors from 'cors'\nimport fs from 'node:fs/promises'\nimport path from 'node:path'\nimport { fileURLToPath } from 'url'\n\nconst __dirname = path.dirname(fileURLToPath(import.meta.url))\nconst app = express()\napp.use(cors()); app.use(express.json())\napp.use(express.static(path.join(__dirname, 'public')))\n\nconst POSTS_FILE = path.join(__dirname, 'posts.json')\nconst ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me'\n\nasync function loadPosts() { try { return JSON.parse(await fs.readFile(POSTS_FILE, 'utf8')) } catch { return [] } }\nasync function savePosts(p) { await fs.writeFile(POSTS_FILE, JSON.stringify(p, null, 2), 'utf8') }\n\napp.get('/api/posts', async (_req, res) => res.json({ ok: true, posts: await loadPosts() }))\napp.get('/api/posts/:slug', async (req, res) => {\n  const p = (await loadPosts()).find(x => x.slug === req.params.slug)\n  if (!p) return res.status(404).json({ ok: false, error: 'not found' })\n  res.json({ ok: true, post: p })\n})\napp.post('/api/posts', async (req, res) => {\n  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(401).json({ ok: false, error: 'unauthorized' })\n  const { title, slug, body } = req.body || {}\n  if (!title || !slug || !body) return res.status(400).json({ ok: false, error: 'title, slug, body required' })\n  const posts = await loadPosts()\n  posts.unshift({ title, slug, body, publishedAt: new Date().toISOString() })\n  await savePosts(posts.slice(0, 500))\n  res.json({ ok: true })\n})\n\nconst PORT = process.env.PORT || 3000\napp.listen(PORT, () => console.log(\`${title} running on http://localhost:\${PORT}\`))\n`,
    'public/index.html': `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="/styles.css"></head>\n<body><header><h1>${title}</h1></header><main id="main">Loading…</main><script src="/app.js"></script></body></html>\n`,
    'public/styles.css': `body { font-family: ui-serif, Georgia, serif; max-width: 720px; margin: 0 auto; padding: 32px 24px; background: #fafaf9; color: #1c1917; line-height: 1.7 }\nheader h1 { font-size: 32px; margin: 0 0 24px }\narticle { padding: 16px 0; border-bottom: 1px solid #e7e5e4 }\narticle h2 a { color: #0c0a09; text-decoration: none }\narticle .date { color: #78716c; font-size: 13px }\narticle .body { font-size: 15px; color: #44403c }\n`,
    'public/app.js': `async function load() {\n  const r = await fetch('/api/posts'); const j = await r.json()\n  if (!j.ok || !j.posts.length) { document.getElementById('main').innerHTML = '<p>No posts yet. POST one to /api/posts (see README).</p>'; return }\n  document.getElementById('main').innerHTML = j.posts.map(p => \`<article><h2><a href="#/\${p.slug}">\${p.title}</a></h2><div class="date">\${new Date(p.publishedAt).toLocaleDateString()}</div><div class="body">\${(p.body || '').slice(0, 180)}…</div></article>\`).join('')\n}\nload()\n`,
    'posts.json': '[]\n',
    '.gitignore': 'node_modules\n.env\n.DS_Store\nposts.json\n',
  }
  return { files }
}

function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'app'
}
