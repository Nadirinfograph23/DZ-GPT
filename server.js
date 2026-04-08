import express from 'express'
import { createServer as createViteServer } from 'vite'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'
const PORT = 5000

const app = express()
app.use(express.json())

// ===== API ROUTE =====
app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body

  const apiKey = process.env.AI_API_KEY
  const apiUrl = process.env.AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions'

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured.' })
  }

  const groqModelMap = {
    'chatgpt': 'llama-3.3-70b-versatile',
    'llama-70b': 'llama-3.3-70b-versatile',
    'llama-8b': 'llama-3.1-8b-instant',
    'gpt-oss-120b': 'openai/gpt-oss-120b',
    'gpt-oss-20b': 'openai/gpt-oss-20b',
    'llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen': 'qwen/qwen3-32b',
    'compound': 'groq/compound',
    'compound-mini': 'groq/compound-mini',
    'deepseek-pdf': 'llama-3.3-70b-versatile',
    'ocr-dz': 'llama-3.3-70b-versatile',
  }

  const actualModel = groqModelMap[model] || model

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: actualModel,
        messages,
        max_tokens: 4096,
        temperature: 0.7,
        stream: false,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || 'API provider returned an error',
      })
    }

    let content = data.choices?.[0]?.message?.content || 'No response generated.'

    if (content) {
      const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (cleaned) content = cleaned
    }

    return res.status(200).json({ content })
  } catch (error) {
    console.error('Chat API error:', error)
    return res.status(500).json({ error: 'Failed to generate response. Please try again.' })
  }
})

// ===== DZ AGENT API ROUTE =====
app.post('/api/dz-agent-chat', async (req, res) => {
  const { messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array required.' })
  }

  const { githubToken, currentRepo } = req.body
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content?.trim() || ''
  const lowerMsg = lastUserMessage.toLowerCase()

  // ── Local knowledge base ──────────────────────────────────────────────────
  const developerQuestions = [
    'من هو مطورك', 'من صنعك', 'من برمجك', 'من أنشأك', 'من طورك',
    'who is your developer', 'who made you', 'who created you', 'who built you', 'who programmed you',
    'qui est votre développeur', 'qui vous a créé', "qui t'a créé", 'qui vous a fait',
  ]
  if (developerQuestions.some(q => lowerMsg.includes(q))) {
    return res.status(200).json({
      content: 'نذير حوامرية | Nadir Infograph, خبير في مجال الذكاء الاصطناعي 🇩🇿',
    })
  }

  // ── GitHub command detection ──────────────────────────────────────────────
  const isListRepos = [
    'show my repos', 'list repos', 'my repositories', 'show repositories',
    'اعرض مستودعاتي', 'قائمة المستودعات', 'liste mes dépôts', 'montre mes dépôts',
    'show my repositories', 'list my repositories',
  ].some(p => lowerMsg.includes(p))

  if (isListRepos) {
    if (!githubToken) {
      return res.status(200).json({
        content: 'Please connect your GitHub token first. Click "Connect GitHub Token" at the top of the chat to add your Personal Access Token.',
      })
    }
    return res.status(200).json({ action: 'list-repos', content: 'Fetching your repositories...' })
  }

  // Detect: list files in repo
  const listFilesPatterns = [
    /show files? (?:in|of|for) ([^\s]+)/i,
    /browse ([^\s]+)/i,
    /open repo ([^\s]+)/i,
    /files? in ([^\s]+)/i,
    /اعرض ملفات ([^\s]+)/i,
    /montre les fichiers de ([^\s]+)/i,
  ]
  for (const pattern of listFilesPatterns) {
    const match = lastUserMessage.match(pattern)
    if (match) {
      const repo = match[1].includes('/') ? match[1] : (currentRepo || match[1])
      return res.status(200).json({ action: 'list-files', repo, content: `Listing files in ${repo}...` })
    }
  }

  // Detect: read/show file content
  const readFilePatterns = [
    /(?:read|show|open|view) (?:file )?["']?([^\s"']+\.[a-z]+)["']?/i,
    /اقرأ ملف ["']?([^\s"']+\.[a-z]+)["']?/i,
    /lis le fichier ["']?([^\s"']+\.[a-z]+)["']?/i,
  ]
  for (const pattern of readFilePatterns) {
    const match = lastUserMessage.match(pattern)
    if (match && currentRepo) {
      return res.status(200).json({ action: 'read-file', repo: currentRepo, path: match[1], content: `Reading ${match[1]}...` })
    }
  }

  // Detect: generate code request
  const isGenerateCode = [
    'generate', 'write a', 'create a script', 'create a function', 'write code',
    'انشئ', 'اكتب كود', 'اكتب سكريبت', 'génère', 'écris un script',
  ].some(p => lowerMsg.includes(p))

  if (isGenerateCode) {
    // Let AI handle it but inject code generation context
  }

  // ── AI response with GitHub-aware system prompt ───────────────────────────
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  const ollamaUrl = process.env.OLLAMA_PROXY_URL
  const groqKey = process.env.AI_API_KEY

  const systemPrompt = `You are DZ Agent, an advanced multilingual AI assistant and GitHub code agent created by Nadir Houamria (Nadir Infograph). 

You can:
- Help with GitHub repositories: reading, creating, and editing files
- Analyze and improve code in any language (Python, JavaScript, TypeScript, HTML/CSS, etc.)
- Generate clean, well-documented code from descriptions
- Suggest fixes, improvements, and unit tests
- Respond in Arabic, English, or French based on the user's language

${githubToken ? `GitHub is connected. Current repo context: ${currentRepo || 'none selected'}.` : 'GitHub is not connected. If the user asks about GitHub, remind them to connect their token.'}

When generating code, always:
1. Include helpful comments
2. Follow best practices
3. Use proper error handling
4. Format code in markdown code blocks

When suggesting code edits that require committing, describe the changes clearly and mention they can approve the commit action.

Be concise, accurate, and helpful. Use markdown formatting.`

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  const callAI = async (url, key, model, extra = {}) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages: apiMessages, max_tokens: 3000, temperature: 0.7, stream: false, ...extra }),
    })
    if (!r.ok) return null
    const d = await r.json()
    let content = d.choices?.[0]?.message?.content || null
    if (content) {
      const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (cleaned) content = cleaned
    }
    return content
  }

  // Try DeepSeek → Ollama → Groq → mock
  if (deepseekKey) {
    try {
      const content = await callAI('https://api.deepseek.com/v1/chat/completions', deepseekKey, 'deepseek-chat')
      if (content) return res.status(200).json({ content })
    } catch (err) { console.error('DeepSeek error:', err) }
  }

  if (ollamaUrl) {
    try {
      const r = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama3', messages: apiMessages, stream: false }),
      })
      if (r.ok) { const d = await r.json(); return res.status(200).json({ content: d.message?.content || 'No response.' }) }
    } catch (err) { console.error('Ollama error:', err) }
  }

  if (groqKey) {
    try {
      const content = await callAI('https://api.groq.com/openai/v1/chat/completions', groqKey, 'llama-3.3-70b-versatile')
      if (content) return res.status(200).json({ content })
    } catch (err) { console.error('Groq error:', err) }
  }

  return res.status(200).json({
    content: 'مرحباً! أنا DZ Agent.\n\nHello! I\'m DZ Agent — your multilingual AI & GitHub assistant.\n\nI can help you:\n- 🗂️ Browse GitHub repositories\n- 📄 Read and analyze code files\n- ✏️ Generate and edit code\n- 🔀 Create commits and pull requests\n\nConnect your GitHub token above to get started!\n\n_No AI API key configured — add DEEPSEEK_API_KEY or AI_API_KEY for full AI responses._',
  })
})

// ===== DZ AGENT GITHUB API ROUTES =====

// Helper: GitHub API fetch with token
async function ghFetch(endpoint, token, options = {}) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  return res
}

// List repositories
app.post('/api/dz-agent/github/repos', async (req, res) => {
  const { token } = req.body
  if (!token) return res.status(400).json({ error: 'GitHub token required.' })

  try {
    const response = await ghFetch('/user/repos?sort=updated&per_page=50&type=all', token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to fetch repos' })

    const repos = data.map(r => ({
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      language: r.language,
      private: r.private,
      default_branch: r.default_branch,
      html_url: r.html_url,
    }))

    return res.status(200).json({ repos })
  } catch (err) {
    console.error('GitHub repos error:', err)
    return res.status(500).json({ error: 'Failed to fetch repositories.' })
  }
})

// List files in repo/path
app.post('/api/dz-agent/github/files', async (req, res) => {
  const { token, repo, path = '' } = req.body
  if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })

  try {
    const endpoint = `/repos/${repo}/contents/${path}`
    const response = await ghFetch(endpoint, token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to list files' })

    const files = Array.isArray(data) ? data.map(f => ({
      name: f.name,
      path: f.path,
      type: f.type === 'dir' ? 'dir' : 'file',
      size: f.size,
    })) : []

    return res.status(200).json({ files })
  } catch (err) {
    console.error('GitHub files error:', err)
    return res.status(500).json({ error: 'Failed to list files.' })
  }
})

// Read file content
app.post('/api/dz-agent/github/file-content', async (req, res) => {
  const { token, repo, path } = req.body
  if (!token || !repo || !path) return res.status(400).json({ error: 'Token, repo, and path required.' })

  try {
    const response = await ghFetch(`/repos/${repo}/contents/${path}`, token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to read file' })

    if (data.encoding !== 'base64') return res.status(400).json({ error: 'Unsupported file encoding.' })
    const content = Buffer.from(data.content, 'base64').toString('utf-8')

    return res.status(200).json({ content, sha: data.sha, name: data.name })
  } catch (err) {
    console.error('GitHub file content error:', err)
    return res.status(500).json({ error: 'Failed to read file.' })
  }
})

// Analyze code with AI
app.post('/api/dz-agent/github/analyze', async (req, res) => {
  const { repo, path, content } = req.body
  if (!content) return res.status(400).json({ error: 'Content required for analysis.' })

  const groqKey = process.env.AI_API_KEY
  const deepseekKey = process.env.DEEPSEEK_API_KEY

  const prompt = `Analyze the following code from ${path || 'unknown file'} in repository ${repo || 'unknown repo'}.

Provide a comprehensive analysis including:
1. **Summary** — what the code does
2. **Issues** — bugs, anti-patterns, security vulnerabilities
3. **Improvements** — specific suggestions with code examples where appropriate
4. **Best Practices** — recommend any missing patterns or standards
5. **Unit Tests** — suggest 2-3 key test cases

Code:
\`\`\`
${content.slice(0, 8000)}
\`\`\``

  const apiMessages = [{ role: 'user', content: prompt }]

  const tryAPI = async (url, key, model, extra = {}) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model, messages: apiMessages, max_tokens: 3000, temperature: 0.3, stream: false, ...extra }),
    })
    return r
  }

  try {
    let analysis = null

    if (deepseekKey) {
      const r = await tryAPI('https://api.deepseek.com/v1/chat/completions', deepseekKey, 'deepseek-chat')
      if (r.ok) { const d = await r.json(); analysis = d.choices?.[0]?.message?.content }
    }

    if (!analysis && groqKey) {
      const r = await tryAPI('https://api.groq.com/openai/v1/chat/completions', groqKey, 'llama-3.3-70b-versatile')
      if (r.ok) { const d = await r.json(); analysis = d.choices?.[0]?.message?.content }
    }

    if (!analysis) {
      analysis = `## Code Analysis: ${path}\n\n**File:** ${path}\n**Repo:** ${repo}\n\n> No AI API key configured. Connect a DEEPSEEK_API_KEY or AI_API_KEY (Groq) in your environment variables for full analysis.\n\n**Basic check:** The file contains ${content.split('\n').length} lines of code.`
    }

    if (analysis) {
      const cleaned = analysis.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (cleaned) analysis = cleaned
    }

    return res.status(200).json({ analysis })
  } catch (err) {
    console.error('Analyze error:', err)
    return res.status(500).json({ error: 'Analysis failed.' })
  }
})

// Generate code
app.post('/api/dz-agent/github/generate', async (req, res) => {
  const { description, language = 'python' } = req.body
  if (!description) return res.status(400).json({ error: 'Description required.' })

  const groqKey = process.env.AI_API_KEY
  const deepseekKey = process.env.DEEPSEEK_API_KEY

  const prompt = `Generate clean, well-commented ${language} code based on this description:\n\n${description}\n\nRequirements:\n- Add helpful comments\n- Follow best practices for ${language}\n- Include error handling where appropriate\n- Keep the code production-ready`

  const apiMessages = [{ role: 'user', content: prompt }]

  try {
    let code = null

    if (deepseekKey) {
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: apiMessages, max_tokens: 3000, temperature: 0.2 }),
      })
      if (r.ok) { const d = await r.json(); code = d.choices?.[0]?.message?.content }
    }

    if (!code && groqKey) {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: apiMessages, max_tokens: 3000, temperature: 0.2 }),
      })
      if (r.ok) { const d = await r.json(); code = d.choices?.[0]?.message?.content }
    }

    if (!code) code = `# Generated code (mock — no API key configured)\n# Description: ${description}\n\nprint("Hello, World!")`

    if (code) {
      const cleaned = code.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (cleaned) code = cleaned
    }

    return res.status(200).json({ code })
  } catch (err) {
    console.error('Generate error:', err)
    return res.status(500).json({ error: 'Code generation failed.' })
  }
})

// Commit a file to GitHub
app.post('/api/dz-agent/github/commit', async (req, res) => {
  const { token, repo, path, content, message, branch } = req.body
  if (!token || !repo || !path || !content || !message) {
    return res.status(400).json({ error: 'Token, repo, path, content, and message are required.' })
  }

  try {
    // Get current file SHA (if exists, for update)
    let sha
    const existingRes = await ghFetch(`/repos/${repo}/contents/${path}`, token)
    if (existingRes.ok) {
      const existing = await existingRes.json()
      sha = existing.sha
    }

    const body = {
      message,
      content: Buffer.from(content).toString('base64'),
      ...(branch ? { branch } : {}),
      ...(sha ? { sha } : {}),
    }

    const commitRes = await ghFetch(`/repos/${repo}/contents/${path}`, token, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
    const commitData = await commitRes.json()

    if (!commitRes.ok) {
      return res.status(commitRes.status).json({ error: commitData.message || 'Commit failed.' })
    }

    return res.status(200).json({
      success: true,
      html_url: commitData.content?.html_url || `https://github.com/${repo}/blob/${branch || 'main'}/${path}`,
      sha: commitData.content?.sha,
    })
  } catch (err) {
    console.error('Commit error:', err)
    return res.status(500).json({ error: 'Commit failed.' })
  }
})

// Create Pull Request
app.post('/api/dz-agent/github/pr', async (req, res) => {
  const { token, repo, title, body, branch, base } = req.body
  if (!token || !repo || !title || !branch || !base) {
    return res.status(400).json({ error: 'Token, repo, title, branch, and base are required.' })
  }

  try {
    const prRes = await ghFetch(`/repos/${repo}/pulls`, token, {
      method: 'POST',
      body: JSON.stringify({ title, body: body || '', head: branch, base }),
    })
    const prData = await prRes.json()

    if (!prRes.ok) {
      return res.status(prRes.status).json({ error: prData.message || 'PR creation failed.' })
    }

    return res.status(200).json({ success: true, html_url: prData.html_url, number: prData.number })
  } catch (err) {
    console.error('PR error:', err)
    return res.status(500).json({ error: 'PR creation failed.' })
  }
})

// ===== SERVE FRONTEND =====
if (isProd) {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`)
  })
} else {
  // Dev: embed Vite as middleware so both API and frontend run on port 5000
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  })
  app.use(vite.middlewares)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dev server running on http://0.0.0.0:${PORT}`)
  })
}
