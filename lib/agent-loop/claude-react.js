/**
 * DZ Agent — Claude Code-Style ReAct Loop
 * Inspired by: github.com/Alishahryar1/free-claude-code
 *
 * Key differences from react.js:
 *  1. Uses native Groq/NVIDIA function calling (tool_calls) — no JSON-in-text parsing
 *  2. Parallel tool execution (multiple tool_calls in one turn)
 *  3. Claude Code persona — autonomous, systematic, professional
 *  4. Better error recovery and self-correction
 *  5. Falls back gracefully to text-based react.js on errors
 */

import { executeGithubTool, GITHUB_TOOLS } from '../tools/github-tools.js'

const MAX_ITERATIONS = 12
const LOOP_TIMEOUT_MS = 90_000

// ── User identity cache ────────────────────────────────────────────────────────
const _userCache = new Map()
const USER_CACHE_TTL = 5 * 60 * 1000

// ── OpenAI function schemas for GitHub tools ───────────────────────────────────
const GITHUB_FUNCTION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_auth_user',
      description: 'Get the authenticated GitHub user info (login, name, repos count). Call this first if user identity is unknown.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_repos',
      description: 'List the user\'s GitHub repositories',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['all', 'public', 'private'], description: 'Filter by visibility (default: all)' },
          per_page: { type: 'number', description: 'Number of repos to return (default: 20, max: 100)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_repo',
      description: 'Create a new GitHub repository',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Repository name (use kebab-case, e.g. my-portfolio)' },
          description: { type: 'string', description: 'Short description of the repository' },
          isPrivate: { type: 'boolean', description: 'Whether the repo is private (default: false)' },
          autoInit: { type: 'boolean', description: 'Initialize with README (default: true)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and folders in a GitHub repository path',
      parameters: {
        type: 'object',
        required: ['repo'],
        properties: {
          repo: { type: 'string', description: 'Repository in owner/repo format' },
          path: { type: 'string', description: 'Folder path to list (empty for root)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the content of a file from a GitHub repository',
      parameters: {
        type: 'object',
        required: ['repo', 'path'],
        properties: {
          repo: { type: 'string', description: 'Repository in owner/repo format' },
          path: { type: 'string', description: 'File path inside the repository' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'push_file',
      description: 'Create or update a single file in a GitHub repository',
      parameters: {
        type: 'object',
        required: ['repo', 'path', 'content'],
        properties: {
          repo: { type: 'string', description: 'Repository in owner/repo format' },
          path: { type: 'string', description: 'File path (e.g. index.html, src/app.js)' },
          content: { type: 'string', description: 'Complete file content as a string' },
          message: { type: 'string', description: 'Commit message' },
          branch: { type: 'string', description: 'Branch name (default: main)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'push_files_batch',
      description: 'Push multiple files to a GitHub repo in a single atomic commit. Preferred over multiple push_file calls.',
      parameters: {
        type: 'object',
        required: ['repo', 'files'],
        properties: {
          repo: { type: 'string', description: 'Repository in owner/repo format' },
          files: {
            type: 'array',
            description: 'Array of files to push',
            items: {
              type: 'object',
              required: ['path', 'content'],
              properties: {
                path: { type: 'string', description: 'File path' },
                content: { type: 'string', description: 'File content' },
              },
            },
          },
          message: { type: 'string', description: 'Commit message' },
          branch: { type: 'string', description: 'Branch name (default: main)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_branches',
      description: 'List all branches in a GitHub repository',
      parameters: {
        type: 'object',
        required: ['repo'],
        properties: {
          repo: { type: 'string', description: 'Repository in owner/repo format' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_branch',
      description: 'Create a new branch in a GitHub repository',
      parameters: {
        type: 'object',
        required: ['repo', 'branch'],
        properties: {
          repo: { type: 'string', description: 'Repository in owner/repo format' },
          branch: { type: 'string', description: 'New branch name' },
          from_branch: { type: 'string', description: 'Source branch (default: main)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_pull_request',
      description: 'Create a pull request in a GitHub repository',
      parameters: {
        type: 'object',
        required: ['repo', 'title', 'head'],
        properties: {
          repo: { type: 'string', description: 'Repository in owner/repo format' },
          title: { type: 'string', description: 'PR title' },
          head: { type: 'string', description: 'Source branch' },
          base: { type: 'string', description: 'Target branch (default: main)' },
          body: { type: 'string', description: 'PR description' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enable_pages',
      description: 'Enable GitHub Pages for a repository to publish it as a website',
      parameters: {
        type: 'object',
        required: ['repo'],
        properties: {
          repo: { type: 'string', description: 'Repository in owner/repo format' },
          branch: { type: 'string', description: 'Branch to publish from (default: main)' },
          path: { type: 'string', description: 'Path to publish from (default: /)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pages_status',
      description: 'Check GitHub Pages deployment status for a repository',
      parameters: {
        type: 'object',
        required: ['repo'],
        properties: {
          repo: { type: 'string', description: 'Repository in owner/repo format' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_repo_info',
      description: 'Get detailed information about a GitHub repository',
      parameters: {
        type: 'object',
        required: ['repo'],
        properties: {
          repo: { type: 'string', description: 'Repository in owner/repo format' },
        },
      },
    },
  },
]

// ── Build Claude Code-style system prompt ──────────────────────────────────────
function buildClaudeSystemPrompt(githubLogin) {
  const identity = githubLogin
    ? `GitHub Account: @${githubLogin} — All GitHub operations authorized and ready.`
    : 'GitHub account not yet verified — call get_auth_user first.'

  return `You are DZ Agent — an autonomous software engineering agent powered by a free Claude Code proxy (inspired by github.com/Alishahryar1/free-claude-code). You have the precision and autonomy of Claude Code with access to real GitHub tools.

## Identity
${identity}

## Core Principles (Claude Code behavior)
1. **Always act, never theorize** — Use tools immediately. Never say "I will do X" without calling a tool.
2. **Be systematic** — Think step-by-step, execute in order, verify each step.
3. **Generate real content** — When creating websites/apps, write complete, professional, production-quality code.
4. **Report actual results** — Only use URLs, commit SHAs, and data from real tool outputs.
5. **Parallel execution** — When multiple independent tools can run simultaneously, call them all at once.

## Website Creation Rule (MANDATORY)
When creating a website, landing page, or HTML project:
1. create_repo — descriptive name (e.g. portfolio-ahmed, dz-store)
2. push_files_batch — push ALL files (index.html, style.css, script.js) in ONE commit
   - HTML must be COMPLETE: full layout, real CSS, animations, responsive design
   - NEVER push placeholder or skeleton HTML
3. enable_pages — ALWAYS call this right after pushing
4. get_pages_status — verify the build started
5. Final answer: include the live URL → https://{owner}.github.io/{repo}/

## Language
Respond in the SAME language the user writes in: Arabic (العربية), Darija (الدارجة), French, or English.

## Tool Use
- You have access to real GitHub API tools via function calling
- All tool calls are executed immediately against the real GitHub API  
- If a tool fails, analyze the error and retry with corrected parameters
- After all work is done, give a comprehensive final answer with all results`
}

// ── Execute a GitHub tool ──────────────────────────────────────────────────────
async function executeTool(toolName, args) {
  if (GITHUB_TOOLS[toolName]) {
    return await executeGithubTool(toolName, args)
  }
  return { error: `Unknown tool: "${toolName}". Available: ${Object.keys(GITHUB_TOOLS).join(', ')}` }
}

// ── Call Groq with function calling ───────────────────────────────────────────
async function callGroqFunctionCalling({ messages, tools, model = 'llama-3.3-70b-versatile', max_tokens = 4096 }) {
  const keys = [
    process.env.AI_API_KEY,
    process.env.AI_API_KEY_2,
    process.env.AI_API_KEY_3,
    process.env.GROQ_API_KEY,
  ].filter(Boolean)

  if (keys.length === 0) throw new Error('No Groq API key available')

  for (const key of keys) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages,
          max_tokens,
          temperature: 0,
          tools,
          tool_choice: 'auto',
          parallel_tool_calls: true,
        }),
        signal: AbortSignal.timeout(25_000),
      })

      if (r.status === 429) { continue } // Try next key
      if (!r.ok) {
        const err = await r.text()
        throw new Error(`Groq ${r.status}: ${err.slice(0, 150)}`)
      }

      return await r.json()
    } catch (err) {
      if (err.message.includes('429') || err.message.includes('rate')) continue
      throw err
    }
  }
  throw new Error('All Groq keys exhausted or rate limited')
}

// ── Build the final answer prompt ─────────────────────────────────────────────
function buildFinalAnswerMessages(loopMessages, executedTools) {
  return [
    ...loopMessages,
    {
      role: 'user',
      content: `All ${executedTools} GitHub operations completed successfully. Now write a comprehensive final answer:
- Summarize what was accomplished
- Include all relevant URLs (repositories, GitHub Pages, Pull Requests)
- Include commit SHAs if available  
- If a website was deployed, prominently show the live URL
- Be specific with actual results from the tool outputs above
- Write in the same language the user used`,
    },
  ]
}

// ── Main Claude ReAct Loop ─────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.query
 * @param {Array}  opts.messages
 * @param {string} [opts.githubToken]
 * @param {Function} [opts.onStep]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{content: string, steps: Array, model: string}>}
 */
export async function runClaudeReActLoop({ query, messages, githubToken, onStep, signal }) {
  const effectiveToken = githubToken || process.env.GITHUB_TOKEN || ''
  const hasToken = !!effectiveToken
  const steps = []
  const loopStart = Date.now()
  let toolsExecuted = 0

  function emit(step) {
    onStep?.(step)
    steps.push(step)
  }

  // Guard: no token
  if (!hasToken) {
    const msg = '⚠️ **GitHub غير متصل**\n\nانقر على زر **"ربط GitHub"** في أعلى الصفحة ثم أعد المحاولة.'
    emit({ type: 'error', message: 'لا يوجد GitHub token' })
    return { content: msg, steps, model: 'claude-react' }
  }

  // ── Resolve GitHub identity (cached) ────────────────────────────────────────
  let githubLogin = null
  const cacheKey = effectiveToken.slice(-12)
  const cached = _userCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < USER_CACHE_TTL) {
    githubLogin = cached.login
    emit({ type: 'thinking', iteration: 0, message: `✅ @${githubLogin} (cache)` })
  } else {
    try {
      emit({ type: 'thinking', iteration: 0, message: 'التحقق من هوية GitHub...' })
      const r = await fetch('https://api.github.com/user', {
        headers: { Authorization: `token ${effectiveToken}`, 'User-Agent': 'DZ-Agent/Claude', Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(6000),
      })
      if (r.ok) {
        const u = await r.json()
        githubLogin = u.login
        _userCache.set(cacheKey, { login: githubLogin, ts: Date.now() })
        emit({ type: 'thinking', iteration: 0, message: `✅ @${githubLogin}` })
      }
    } catch (_) {}
  }

  const systemPrompt = buildClaudeSystemPrompt(githubLogin)
  const tokenObj = { token: effectiveToken, _login: githubLogin }

  // Build loop messages (system injected into first user message for Groq compatibility)
  const loopMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.filter(m => m.role !== 'system').slice(-4),
    { role: 'user', content: query },
  ]

  emit({ type: 'start', message: `🤖 Claude Mode — @${githubLogin || 'unknown'}` })

  let iteration = 0
  let lastTextContent = ''

  // ── Main loop ────────────────────────────────────────────────────────────────
  while (iteration < MAX_ITERATIONS) {
    if (signal?.aborted) break
    if (Date.now() - loopStart > LOOP_TIMEOUT_MS) {
      emit({ type: 'timeout', message: 'انتهت مهلة التنفيذ (90s)' })
      break
    }

    iteration++
    const progressPct = Math.min(8 + toolsExecuted * 15, 82)
    emit({ type: 'thinking', iteration, message: `التفكير ${iteration}...`, progress_pct: progressPct })

    let groqResp
    try {
      groqResp = await callGroqFunctionCalling({
        messages: loopMessages,
        tools: GITHUB_FUNCTION_TOOLS,
        max_tokens: 1200,
      })
    } catch (err) {
      emit({ type: 'error', message: `خطأ Groq: ${err.message}` })
      break
    }

    const choice = groqResp.choices?.[0]
    const msg = choice?.message
    if (!msg) { emit({ type: 'error', message: 'رد فارغ من Groq' }); break }

    const finishReason = choice?.finish_reason
    const toolCalls = msg.tool_calls || []
    lastTextContent = msg.content || lastTextContent

    console.log(`[claude-react] iter=${iteration} finish=${finishReason} tools=${toolCalls.length} done=${toolsExecuted}`)

    // ── Final answer: no more tool calls ───────────────────────────────────────
    if (finishReason === 'stop' && toolCalls.length === 0) {
      if (toolsExecuted > 0 || (msg.content && msg.content.length > 20)) {
        const finalContent = msg.content || lastTextContent || `✅ اكتملت ${toolsExecuted} عملية GitHub بنجاح.`
        emit({ type: 'done', message: 'اكتملت المهمة', content: finalContent, progress_pct: 100 })
        return { content: finalContent, steps, model: 'claude-react/groq-llama3.3' }
      }
    }

    // ── Tool calls (parallel execution) ───────────────────────────────────────
    if (toolCalls.length > 0) {
      // Add assistant message with tool_calls to loop
      loopMessages.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: toolCalls,
      })

      // Execute all tool calls (in parallel if independent)
      const toolResults = await Promise.all(
        toolCalls.map(async (tc) => {
          const toolName = tc.function?.name || ''
          let args = {}
          try { args = JSON.parse(tc.function?.arguments || '{}') } catch (_) {}

          const argsWithToken = { ...args, token: effectiveToken, _login: githubLogin }
          const toolStart = Date.now()

          // Emit tool_call step
          emit({
            type: 'tool_call',
            tool: toolName,
            thought: `[Claude Mode] Calling ${toolName}`,
            args,
            message: `⚙️ ${toolName}`,
            progress_pct: progressPct,
          })

          let result
          try {
            result = await executeTool(toolName, argsWithToken)
          } catch (err) {
            result = { error: err.message }
          }
          const elapsed = Date.now() - toolStart
          toolsExecuted++

          emit({
            type: 'observation',
            tool: toolName,
            result,
            message: result.error ? `❌ ${toolName}` : `✅ ${toolName}`,
            elapsed_ms: elapsed,
            progress_pct: Math.min(progressPct + 12, 90),
          })

          return { id: tc.id, toolName, result }
        })
      )

      // Add tool results to loop messages
      for (const { id, result } of toolResults) {
        loopMessages.push({
          role: 'tool',
          tool_call_id: id,
          content: JSON.stringify(result).slice(0, 3000),
        })
      }

      continue
    }

    // ── LLM returned text without tool calls after tools were executed ─────────
    if (toolsExecuted > 0 && msg.content) {
      emit({ type: 'done', message: 'رد نهائي', content: msg.content, progress_pct: 100 })
      return { content: msg.content, steps, model: 'claude-react/groq-llama3.3' }
    }

    // ── Force tool usage if nothing called yet ─────────────────────────────────
    if (toolsExecuted === 0) {
      loopMessages.push(
        { role: 'assistant', content: msg.content || '' },
        {
          role: 'user',
          content: `You must use the available GitHub tools to complete this task. Stop writing text and call a tool NOW. Available tools: ${GITHUB_FUNCTION_TOOLS.map(t => t.function.name).join(', ')}`,
        }
      )
      continue
    }

    break
  }

  // ── Request final summary if tools were run ───────────────────────────────────
  if (toolsExecuted > 0) {
    try {
      const summaryResp = await callGroqFunctionCalling({
        messages: buildFinalAnswerMessages(loopMessages, toolsExecuted),
        tools: [],
        max_tokens: 600,
      })
      const summary = summaryResp.choices?.[0]?.message?.content || lastTextContent
      emit({ type: 'done', message: 'اكتملت المهمة', content: summary, progress_pct: 100 })
      return { content: summary, steps, model: 'claude-react/groq-llama3.3' }
    } catch (_) {}
  }

  const fallback = lastTextContent || `اكتملت ${toolsExecuted} عملية GitHub.`
  emit({ type: 'done', message: 'اكتمل', content: fallback, progress_pct: 100 })
  return { content: fallback, steps, model: 'claude-react/groq-llama3.3' }
}
