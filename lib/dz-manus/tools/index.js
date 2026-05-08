/**
 * DZ-MANUS — Tool Registry
 * All tools available to the autonomous agent:
 *   web_search, browse, code_exec, summarize, github, math, memory_recall
 */

import { validateUrl, validateCode } from '../security.js'
import { recall } from '../memory.js'

// ── TOOL: web_search ──────────────────────────────────────────────────────

async function toolWebSearch({ query, limit = 6, lang = 'ar' }) {
  if (!query) return { error: 'query required' }

  const results = []

  // 1. DuckDuckGo Lite (no API key)
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${lang === 'ar' ? 'ar-DZ' : 'en-us'}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZ-MANUS/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    const html = await res.text()
    const matches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
    for (const m of matches.slice(0, limit)) {
      const href = m[1], title = m[2].trim()
      if (href.startsWith('http') && !href.includes('duckduckgo.com')) {
        results.push({ title, url: href, snippet: '' })
      }
    }
  } catch {}

  // 2. SearXNG public instance (fallback)
  if (results.length < 3) {
    try {
      const searxUrl = `https://searx.be/search?q=${encodeURIComponent(query)}&format=json&language=${lang}`
      const res = await fetch(searxUrl, {
        headers: { 'User-Agent': 'DZ-MANUS/1.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const data = await res.json()
        for (const r of (data.results || []).slice(0, limit - results.length)) {
          results.push({ title: r.title, url: r.url, snippet: r.content || '' })
        }
      }
    } catch {}
  }

  // 3. Wikipedia API (always reliable)
  try {
    const wikiLang = lang === 'ar' ? 'ar' : 'en'
    const wikiUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&format=json`
    const res = await fetch(wikiUrl, { signal: AbortSignal.timeout(6000) })
    if (res.ok) {
      const [, titles, snippets, urls] = await res.json()
      for (let i = 0; i < titles.length; i++) {
        if (urls[i]) results.push({ title: titles[i], url: urls[i], snippet: snippets[i] || '' })
      }
    }
  } catch {}

  return {
    query,
    results: results.slice(0, limit),
    count: results.length,
  }
}

// ── TOOL: browse ─────────────────────────────────────────────────────────

async function toolBrowse({ url, maxChars = 8000, extractLinks = false }) {
  const check = validateUrl(url)
  if (!check.allowed) return { error: `URL blocked: ${check.reason}` }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
    })
    if (!res.ok) return { error: `HTTP ${res.status}`, url }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('html') && !contentType.includes('text')) {
      return { error: 'non_html_content', contentType, url }
    }

    const html = await res.text()

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : ''

    // Extract meta description
    const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,400})/i)
    const description = metaMatch ? metaMatch[1].trim() : ''

    // Remove scripts, styles, nav, footer
    let cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#\d+;/g, ' ')
      .replace(/\s{3,}/g, '\n\n')
      .trim()

    const text = cleaned.slice(0, maxChars)

    // Extract links if requested
    let links = []
    if (extractLinks) {
      const linkMatches = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{1,100})/g)]
      links = linkMatches
        .map(m => ({ href: m[1], text: m[2].trim() }))
        .filter(l => l.href.startsWith('http') && l.text.length > 3)
        .slice(0, 20)
    }

    return { url, title, description, text, links, charCount: text.length }
  } catch (err) {
    return { error: err.message, url }
  }
}

// ── TOOL: code_exec ──────────────────────────────────────────────────────

async function toolCodeExec({ code, language = 'javascript', timeout = 5000 }) {
  const check = validateCode(code)
  if (!check.safe) return { error: `Code blocked: ${check.reason}` }

  if (language !== 'javascript' && language !== 'js') {
    return {
      error: null,
      language,
      note: 'Only JavaScript sandbox is available in this environment.',
      suggestion: 'Please rewrite in JavaScript.',
    }
  }

  const { createContext, runInNewContext } = await import('vm')

  const sandbox = {
    console: {
      log:   (...args) => logs.push(args.map(String).join(' ')),
      warn:  (...args) => logs.push('[WARN] ' + args.map(String).join(' ')),
      error: (...args) => logs.push('[ERROR] ' + args.map(String).join(' ')),
    },
    Math, JSON, parseInt, parseFloat, Number, String, Boolean, Array, Object,
    Date, RegExp, Error, Map, Set, Promise,
    setTimeout: () => {}, setInterval: () => {}, clearTimeout: () => {},
    result: undefined,
  }

  const logs = []
  const ctx = createContext(sandbox)
  const wrapped = `(async () => { ${code} })()`

  try {
    const result = await Promise.race([
      runInNewContext(wrapped, ctx, { timeout }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout)),
    ])
    return {
      success: true,
      result: result !== undefined ? String(result).slice(0, 5000) : undefined,
      logs: logs.slice(0, 100),
      output: logs.join('\n').slice(0, 5000),
    }
  } catch (err) {
    return { success: false, error: err.message, logs }
  }
}

// ── TOOL: summarize ───────────────────────────────────────────────────────
// Called with aiGenerate injected at mount time

async function toolSummarize({ text, instructions = 'لخص هذا النص', aiGenerate }) {
  if (!text) return { error: 'no text' }
  const prompt = `${instructions}:\n\n${text.slice(0, 12000)}`
  const result = await aiGenerate({
    messages: [
      { role: 'system', content: 'أنت مساعد متخصص في تلخيص النصوص بدقة.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 2000,
  })
  return { summary: result?.content || 'فشل التلخيص', model: result?.model }
}

// ── TOOL: github ─────────────────────────────────────────────────────────

async function toolGithub({ action, repo, query, path: filePath }) {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'DZ-MANUS/1.0',
  }
  const GTOKEN = process.env.GITHUB_TOKEN
  if (GTOKEN) headers.Authorization = `Bearer ${GTOKEN}`

  try {
    if (action === 'search') {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=5`
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
      if (!res.ok) return { error: `GitHub API ${res.status}` }
      const data = await res.json()
      return {
        results: (data.items || []).map(r => ({
          name: r.full_name, stars: r.stargazers_count, description: r.description,
          url: r.html_url, language: r.language, topics: r.topics,
        })),
      }
    }

    if (action === 'readme') {
      const url = `https://api.github.com/repos/${repo}/readme`
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
      if (!res.ok) return { error: `Repo not found: ${repo}` }
      const data = await res.json()
      const content = Buffer.from(data.content, 'base64').toString('utf8')
      return { repo, readme: content.slice(0, 8000) }
    }

    if (action === 'file') {
      const url = `https://api.github.com/repos/${repo}/contents/${filePath}`
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
      if (!res.ok) return { error: `File not found: ${repo}/${filePath}` }
      const data = await res.json()
      if (data.encoding === 'base64') {
        const content = Buffer.from(data.content, 'base64').toString('utf8')
        return { repo, path: filePath, content: content.slice(0, 8000), size: data.size }
      }
      return { repo, path: filePath, content: data.content, size: data.size }
    }

    if (action === 'issues') {
      const url = `https://api.github.com/repos/${repo}/issues?state=open&per_page=10`
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
      if (!res.ok) return { error: `Repo not found: ${repo}` }
      const data = await res.json()
      return { issues: (data || []).map(i => ({ id: i.number, title: i.title, state: i.state, labels: i.labels?.map(l => l.name) })) }
    }

    return { error: `Unknown action: ${action}. Use: search, readme, file, issues` }
  } catch (err) {
    return { error: err.message }
  }
}

// ── TOOL: memory_recall ───────────────────────────────────────────────────

function toolMemoryRecall({ query, limit = 5 }) {
  const memories = recall(query, { limit })
  return { query, memories, count: memories.length }
}

// ── TOOL: math ────────────────────────────────────────────────────────────

async function toolMath({ expression }) {
  const check = validateCode(expression)
  if (!check.safe) return { error: 'expression blocked' }
  try {
    const { runInNewContext } = await import('vm')
    const result = runInNewContext(expression, { Math, Number, parseInt, parseFloat }, { timeout: 2000 })
    return { expression, result: String(result) }
  } catch (err) {
    return { expression, error: err.message }
  }
}

// ── TOOL REGISTRY ─────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'web_search',
    description: 'البحث في الويب عن معلومات. يرجع قائمة نتائج مع روابط وعناوين.',
    params: ['query (string, required)', 'limit (int, default 6)', 'lang (string, default ar)'],
    example: { query: 'أفضل مكتبات React 2024', limit: 5 },
  },
  {
    name: 'browse',
    description: 'فتح رابط وقراءة محتوى الصفحة واستخراج النص.',
    params: ['url (string, required)', 'maxChars (int, default 8000)', 'extractLinks (bool)'],
    example: { url: 'https://example.com', extractLinks: true },
  },
  {
    name: 'code_exec',
    description: 'تنفيذ كود JavaScript في بيئة آمنة. يرجع النتيجة والسجلات.',
    params: ['code (string, required)', 'language (string, js only)', 'timeout (ms, default 5000)'],
    example: { code: 'const sum = [1,2,3].reduce((a,b)=>a+b,0); console.log(sum);' },
  },
  {
    name: 'summarize',
    description: 'تلخيص نص طويل باستخدام الذكاء الاصطناعي.',
    params: ['text (string, required)', 'instructions (string)'],
    example: { text: '...', instructions: 'لخص النقاط الرئيسية' },
  },
  {
    name: 'github',
    description: 'البحث في GitHub أو قراءة مستودع أو ملف أو issues.',
    params: ['action (search|readme|file|issues)', 'query?', 'repo?', 'path?'],
    example: { action: 'search', query: 'nodejs web scraper' },
  },
  {
    name: 'memory_recall',
    description: 'استرجاع ذكريات سابقة من الجلسات السابقة.',
    params: ['query (string, required)', 'limit (int, default 5)'],
    example: { query: 'مشروع الجزائر' },
  },
  {
    name: 'math',
    description: 'تنفيذ حسابات رياضية آمنة.',
    params: ['expression (string, required)'],
    example: { expression: 'Math.sqrt(144) + Math.PI' },
  },
]

/**
 * Execute a named tool with params
 * @param {string} name - tool name
 * @param {object} params - tool parameters
 * @param {function} aiGenerate - injected AI generation function
 */
export async function executeTool(name, params, aiGenerate) {
  const t0 = Date.now()
  let result

  try {
    switch (name) {
      case 'web_search':    result = await toolWebSearch(params); break
      case 'browse':        result = await toolBrowse(params); break
      case 'code_exec':     result = await toolCodeExec(params); break
      case 'summarize':     result = await toolSummarize({ ...params, aiGenerate }); break
      case 'github':        result = await toolGithub(params); break
      case 'memory_recall': result = toolMemoryRecall(params); break
      case 'math':          result = await toolMath(params); break
      default:              result = { error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    result = { error: `Tool error: ${err.message}` }
  }

  return {
    tool:    name,
    params,
    result,
    durationMs: Date.now() - t0,
  }
}
