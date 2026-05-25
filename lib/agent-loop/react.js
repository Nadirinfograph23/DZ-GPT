/**
 * DZ Agent — ReAct Loop (Reasoning + Acting)
 * Pattern: Thought → Action (tool call) → Observation → Repeat → Final Answer
 *
 * The LLM outputs structured JSON tool calls. The executor runs them against
 * real GitHub API, web search, or code sandbox. Results are fed back as
 * observations. Loop continues until the LLM outputs a Final Answer.
 */

import { executeGithubTool, GITHUB_TOOLS } from '../tools/github-tools.js'

const MAX_ITERATIONS = 10
const LOOP_TIMEOUT_MS = 120_000

// ── GitHub user identity cache (TTL: 5 min) ────────────────────────────────
const _userCache = new Map() // token_prefix → { login, ts }
const USER_CACHE_TTL = 5 * 60 * 1000

// ── Tool schema for LLM ───────────────────────────────────────────────────────
const TOOL_SCHEMAS = {
  get_auth_user: {
    desc: 'Get the authenticated GitHub user info (login, name, plan)',
    params: {},
  },
  list_repos: {
    desc: 'List the user\'s GitHub repositories',
    params: { type: 'all|public|private', per_page: 'number (default 20)' },
  },
  create_repo: {
    desc: 'Create a new GitHub repository',
    params: { name: 'repo name (required)', description: 'string', isPrivate: 'boolean', autoInit: 'boolean' },
  },
  list_files: {
    desc: 'List files/folders in a GitHub repo path',
    params: { repo: 'owner/repo (required)', path: 'folder path (optional)' },
  },
  read_file: {
    desc: 'Read the content of a file from a GitHub repo',
    params: { repo: 'owner/repo (required)', path: 'file path (required)' },
  },
  push_file: {
    desc: 'Create or update a single file in a GitHub repo',
    params: { repo: 'owner/repo (required)', path: 'file path (required)', content: 'file content string (required)', message: 'commit message', branch: 'branch name (default: main)' },
  },
  push_files_batch: {
    desc: 'Push multiple files to a GitHub repo in a single commit (atomic)',
    params: { repo: 'owner/repo (required)', files: '[{path, content}] array (required)', message: 'commit message', branch: 'branch name (default: main)' },
  },
  list_branches: {
    desc: 'List all branches in a GitHub repo',
    params: { repo: 'owner/repo (required)' },
  },
  create_branch: {
    desc: 'Create a new branch in a GitHub repo',
    params: { repo: 'owner/repo (required)', branch: 'new branch name (required)', from_branch: 'source branch (default: main)' },
  },
  delete_branch: {
    desc: 'Delete a branch from a GitHub repo',
    params: { repo: 'owner/repo (required)', branch: 'branch to delete (required)' },
  },
  create_pull_request: {
    desc: 'Create a pull request in a GitHub repo',
    params: { repo: 'owner/repo (required)', title: 'PR title (required)', head: 'source branch (required)', base: 'target branch (default: main)', body: 'PR description' },
  },
  enable_pages: {
    desc: 'Enable GitHub Pages for a repository',
    params: { repo: 'owner/repo (required)', branch: 'branch (default: main)', path: 'path (default: /)' },
  },
  get_pages_status: {
    desc: 'Check GitHub Pages deployment status: not_enabled / building / built / errored',
    params: { repo: 'owner/repo (required)' },
  },
  get_repo_info: {
    desc: 'Get detailed information about a GitHub repository',
    params: { repo: 'owner/repo (required)' },
  },
}

function buildToolSchemaText() {
  return Object.entries(TOOL_SCHEMAS).map(([name, { desc, params }]) => {
    const paramStr = Object.entries(params).map(([k, v]) => `    - ${k}: ${v}`).join('\n')
    return `• ${name}: ${desc}${paramStr ? '\n' + paramStr : ''}`
  }).join('\n')
}

function buildSystemPrompt(hasGithubToken, githubLogin = null) {
  const tokenStatus = hasGithubToken
    ? `✅ GitHub CONNECTED — Account: @${githubLogin || 'unknown'} — ALL operations authorized`
    : '⚠️ GitHub NOT connected — ask user to connect first via the GitHub button at the top'

  const userHint = githubLogin
    ? `\nCURRENT USER: @${githubLogin} — always use this exact login in all URLs and responses. NEVER use "username" as a placeholder.`
    : ''

  return `You are DZ Agent — an advanced autonomous GitHub engineering agent.
${tokenStatus}${userHint}

# CRITICAL INSTRUCTION — READ FIRST
You MUST use tool_call format for EVERY action. NEVER write explanatory text instead of calling a tool.
If you need information → call a tool. If you need to create/modify files → call a tool.
Writing prose instead of tool calls will FAIL the task.

# YOUR ROLE
Execute tasks INSIDE GitHub repositories using the tools below.
- List and analyze repositories
- Create/modify files with real content
- Create branches and commit changes
- Deploy GitHub Pages
- Fix build errors

NEVER answer theoretically. NEVER simulate execution. ALWAYS use tools.

# AVAILABLE TOOLS
${buildToolSchemaText()}

# EXACT OUTPUT FORMAT — FOLLOW THIS PRECISELY

## To call a tool:
\`\`\`tool_call
{
  "thought": "brief reason for this action",
  "tool": "exact_tool_name",
  "args": { "key": "value" }
}
\`\`\`

## To give the final answer (ONLY after all tools are done):
\`\`\`final_answer
Your complete summary with actual results (URLs, commit SHAs, file paths)
\`\`\`

# EXAMPLES OF CORRECT OUTPUT

User: "اعرض مستودعاتي"
\`\`\`tool_call
{"thought":"أحتاج لعرض قائمة مستودعات المستخدم","tool":"list_repos","args":{"per_page":20}}
\`\`\`

User: "أنشئ مستودع جديد اسمه my-app"
\`\`\`tool_call
{"thought":"سأنشئ مستودع جديد باسم my-app","tool":"create_repo","args":{"name":"my-app","description":"","autoInit":true}}
\`\`\`

User: "ما هي ملفات مستودع user/repo"
\`\`\`tool_call
{"thought":"سأقرأ ملفات المستودع","tool":"list_files","args":{"repo":"${githubLogin || 'owner'}/repo","path":""}}
\`\`\`

# WEBSITE DEPLOYMENT RULE — MANDATORY
When user asks to create or push a website / HTML page / landing page:
ALWAYS follow this exact sequence:
  1. create_repo (if no repo specified — use a descriptive name)
  2. push_file: push index.html with COMPLETE, beautiful HTML content (full page, not placeholder)
  3. enable_pages: ALWAYS call this after pushing HTML — sets branch=main, path=/
  4. get_pages_status: verify Pages is building/built
  5. In final_answer: include the live URL → https://{owner}.github.io/{repo}/

NEVER skip enable_pages when pushing a website. The user expects a LIVE URL.
NEVER push placeholder HTML — always generate a real, styled, complete website.

# STRICT RULES
- FIRST call: always verify identity with get_auth_user if user is unknown
- Execute operations — NEVER say "I will do" without calling a tool
- Report ACTUAL results (URLs, commit SHAs) from tool outputs only
- Respond in the same language the user writes in (Arabic / French / English / Darija)
- Never fabricate results — only use what tools actually returned
- After successful tool calls → continue with next steps or give final_answer
- Maximum ${MAX_ITERATIONS} iterations — be efficient`
}

// ── Parse LLM output — aggressive multi-strategy extraction ───────────────────
function parseLLMOutput(text) {
  if (!text || !text.trim()) return { type: 'unknown' }

  // Strategy 1: Explicit ```tool_call``` block (canonical format)
  const toolCallBlock = text.match(/```tool_call\s*([\s\S]*?)```/i)
  if (toolCallBlock) {
    try {
      const parsed = JSON.parse(toolCallBlock[1].trim())
      if (parsed.tool && typeof parsed.tool === 'string' && TOOL_SCHEMAS[parsed.tool]) {
        return { type: 'tool_call', thought: parsed.thought || '', tool: parsed.tool, args: parsed.args || {} }
      }
    } catch (_) {}
  }

  // Strategy 2: Any ```json``` or ``` block containing a tool key
  const codeBlocks = [...text.matchAll(/```(?:json|javascript|js)?\s*([\s\S]*?)```/gi)]
  for (const m of codeBlocks) {
    try {
      const parsed = JSON.parse(m[1].trim())
      if (parsed.tool && typeof parsed.tool === 'string') {
        return { type: 'tool_call', thought: parsed.thought || '', tool: parsed.tool, args: parsed.args || {} }
      }
    } catch (_) {}
  }

  // Strategy 3: Raw JSON with "tool" key — simple one-level objects
  const simpleJsonMatches = [...text.matchAll(/\{[^{}]{5,300}\}/g)]
  for (const m of simpleJsonMatches) {
    try {
      const parsed = JSON.parse(m[0])
      if (parsed.tool && typeof parsed.tool === 'string') {
        return { type: 'tool_call', thought: parsed.thought || '', tool: parsed.tool, args: parsed.args || {} }
      }
    } catch (_) {}
  }

  // Strategy 4: Nested JSON with args — balance-aware extraction
  const toolKeyIdx = text.search(/"tool"\s*:\s*"[\w_]+"/)
  if (toolKeyIdx >= 0) {
    // Walk backwards to find the opening {
    let depth = 0, start = -1
    for (let i = toolKeyIdx; i >= 0; i--) {
      if (text[i] === '}') depth++
      else if (text[i] === '{') {
        if (depth === 0) { start = i; break }
        depth--
      }
    }
    if (start >= 0) {
      // Walk forward to find the matching }
      depth = 0
      let end = -1
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') {
          depth--
          if (depth === 0) { end = i + 1; break }
        }
      }
      if (end > start) {
        try {
          const parsed = JSON.parse(text.slice(start, end))
          if (parsed.tool && typeof parsed.tool === 'string') {
            return { type: 'tool_call', thought: parsed.thought || '', tool: parsed.tool, args: parsed.args || {} }
          }
        } catch (_) {}
      }
    }
  }

  // Strategy 5: Explicit ```final_answer``` block
  const finalBlock = text.match(/```final_answer\s*([\s\S]*?)```/i)
  if (finalBlock) {
    return { type: 'final_answer', content: finalBlock[1].trim() }
  }

  // Strategy 6: Explicit final answer markers in text
  const finalMarkers = [
    /^#+\s*(final answer|الإجابة النهائية|النتيجة النهائية|الخلاصة)/im,
    /\*\*(final answer|الإجابة النهائية|النتيجة النهائية)\*\*/i,
    /^(final answer|الإجابة النهائية)\s*[:：]/im,
  ]
  for (const marker of finalMarkers) {
    if (marker.test(text)) {
      const idx = text.search(marker)
      const content = text.slice(idx).replace(/^[^\n]*\n/, '').trim() || text.trim()
      return { type: 'final_answer', content }
    }
  }

  // Strategy 7: text_only — return text content for loop to decide
  return { type: 'text_only', content: text.trim() }
}

// ── Execute a tool call ────────────────────────────────────────────────────────
async function executeTool(toolName, args) {
  if (GITHUB_TOOLS[toolName]) {
    return await executeGithubTool(toolName, args)
  }
  return { error: `الأداة "${toolName}" غير معروفة. الأدوات المتاحة: ${Object.keys(GITHUB_TOOLS).join(', ')}` }
}

// ── Build a coerce message to force the LLM back to tool format ───────────────
function buildCoerceMessage(toolsExecuted, iteration) {
  if (toolsExecuted === 0 && iteration <= 2) {
    return `STOP. Do NOT write text explanations. You MUST output a tool_call JSON block NOW to start executing.\n\nUse EXACTLY this format:\n\`\`\`tool_call\n{"thought":"reason","tool":"tool_name","args":{}}\n\`\`\`\n\nAvailable tools: ${Object.keys(TOOL_SCHEMAS).join(', ')}\n\nOutput the tool_call NOW.`
  }
  return `You must use tool_call format or final_answer format. Do NOT write prose.\n\nIf done: output \`\`\`final_answer\n...\n\`\`\`\nIf more work: output \`\`\`tool_call\n{...}\n\`\`\``
}

// ── Main ReAct loop ───────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.query - User message
 * @param {Array}  opts.messages - Chat history [{role, content}]
 * @param {Function} opts.aiGenerate - AI generation function
 * @param {string}  [opts.githubToken] - User's GitHub OAuth token
 * @param {Function} [opts.onStep] - Stream callback: (step) => void
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{content: string, steps: Array, model: string}>}
 */
export async function runReActLoop({ query, messages, aiGenerate, githubToken, onStep, signal }) {
  const effectiveToken = githubToken || process.env.GITHUB_TOKEN || ''
  const hasGithubToken = !!effectiveToken

  const steps = []
  const loopStart = Date.now()
  let toolsExecuted = 0

  function emit(step) {
    onStep?.(step)
    steps.push(step)
  }

  // ── Guard: no token → return connect message immediately ──────────────────
  if (!hasGithubToken) {
    const noTokenMsg = `⚠️ **GitHub غير متصل**\n\nلتنفيذ عمليات GitHub، يجب الاتصال بحسابك أولاً.\n\n**كيفية الاتصال:**\nانقر على زر **"ربط GitHub"** في أعلى الصفحة ثم أعد المحاولة.`
    emit({ type: 'error', message: 'لا يوجد GitHub token' })
    return { content: noTokenMsg, steps, model: null }
  }

  // ── Pre-fetch real GitHub user — with 5-min cache ─────────────────────────
  let githubLogin = null
  const cacheKey = effectiveToken.slice(-12)
  const cached = _userCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < USER_CACHE_TTL) {
    githubLogin = cached.login
    emit({ type: 'thinking', iteration: 0, message: `✅ GitHub: @${githubLogin} (cached)` })
  } else {
    try {
      emit({ type: 'thinking', iteration: 0, message: 'التحقق من هوية GitHub...' })
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${effectiveToken}`,
          'User-Agent': 'DZ-Agent/5.0',
          Accept: 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(6000),
      })
      if (userRes.ok) {
        const userData = await userRes.json()
        githubLogin = userData.login
        _userCache.set(cacheKey, { login: githubLogin, ts: Date.now() })
        emit({ type: 'thinking', iteration: 0, message: `✅ GitHub: @${githubLogin}` })
      }
    } catch (_) {}
  }

  const tokenWithUser = { token: effectiveToken, _login: githubLogin }
  const systemPrompt = buildSystemPrompt(hasGithubToken, githubLogin)

  const loopMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.filter(m => m.role !== 'system').slice(-6),
    { role: 'user', content: query },
  ]

  let iteration = 0
  let consecutiveTextOnly = 0

  emit({ type: 'start', message: `بدء ReAct Agent Loop — @${githubLogin || 'unknown'}` })

  while (iteration < MAX_ITERATIONS) {
    if (signal?.aborted) break
    if (Date.now() - loopStart > LOOP_TIMEOUT_MS) {
      emit({ type: 'timeout', message: 'انتهت مهلة التنفيذ' })
      break
    }

    iteration++
    emit({ type: 'thinking', iteration, message: `التفكير في الخطوة ${iteration}...` })

    // Ask LLM for next step — use temperature 0 for deterministic tool calls
    let llmOutput
    try {
      const result = await aiGenerate({
        messages: loopMessages,
        query,
        max_tokens: 800,
        temperature: 0,
      })
      llmOutput = typeof result === 'string' ? result : (result?.content || '')
    } catch (err) {
      emit({ type: 'error', message: `خطأ في توليد AI: ${err.message}` })
      break
    }

    if (!llmOutput) {
      emit({ type: 'error', message: 'رد فارغ من الـ AI' })
      break
    }

    const parsed = parseLLMOutput(llmOutput)
    console.log(`[ReAct] iter=${iteration} parsed.type=${parsed.type} tools_done=${toolsExecuted}`)

    // ── Final answer ──────────────────────────────────────────────────────────
    if (parsed.type === 'final_answer') {
      emit({ type: 'done', message: 'اكتملت المهمة', content: parsed.content })
      return { content: parsed.content, steps, model: 'react-loop' }
    }

    // ── Tool call ─────────────────────────────────────────────────────────────
    if (parsed.type === 'tool_call') {
      consecutiveTextOnly = 0
      const progressPct = Math.min(10 + toolsExecuted * 18, 80)
      emit({
        type: 'tool_call',
        tool: parsed.tool,
        thought: parsed.thought,
        args: parsed.args,
        message: `⚙️ تنفيذ: ${parsed.tool}`,
        progress_pct: progressPct,
      })

      let observation
      const toolStart = Date.now()
      try {
        const argsWithToken = { ...parsed.args, token: parsed.args.token || effectiveToken }
        observation = await executeTool(parsed.tool, argsWithToken)
      } catch (err) {
        observation = { error: err.message }
      }
      const toolElapsed = Date.now() - toolStart

      toolsExecuted++
      const observationStr = JSON.stringify(observation, null, 2)
      emit({
        type: 'observation',
        tool: parsed.tool,
        result: observation,
        message: observation.error
          ? `❌ ${parsed.tool}: ${observation.error}`
          : `✅ ${parsed.tool}: نجح`,
        elapsed_ms: toolElapsed,
        progress_pct: Math.min(progressPct + 10, 88),
      })

      loopMessages.push(
        { role: 'assistant', content: llmOutput },
        {
          role: 'user',
          content: `**نتيجة الأداة "${parsed.tool}":**\n\`\`\`json\n${observationStr.slice(0, 3000)}\n\`\`\`\n\nواصل التنفيذ. إذا انتهيت من كل المطلوب، أعطِ \`\`\`final_answer\`\`\`. إذا تحتاج خطوة أخرى، استخدم \`\`\`tool_call\`\`\`.`,
        }
      )
      continue
    }

    // ── text_only: LLM wrote prose instead of a tool call ────────────────────
    if (parsed.type === 'text_only') {
      consecutiveTextOnly++

      // If we've executed tools already and get a substantial text response → treat as final answer
      if (toolsExecuted > 0 && consecutiveTextOnly >= 1) {
        emit({ type: 'done', message: 'رد مباشر', content: parsed.content })
        return { content: parsed.content, steps, model: 'react-loop' }
      }

      // No tools executed yet — force the LLM back to tool format
      if (consecutiveTextOnly <= 3) {
        emit({ type: 'thinking', iteration, message: `⚠️ إعادة توجيه (محاولة ${consecutiveTextOnly})...` })
        const coerceMsg = buildCoerceMessage(toolsExecuted, iteration)
        loopMessages.push(
          { role: 'assistant', content: llmOutput },
          { role: 'user', content: coerceMsg }
        )
        continue
      }

      // Too many text-only responses → give up and return as final
      emit({ type: 'done', message: 'رد نصي', content: parsed.content })
      return { content: parsed.content, steps, model: 'react-loop' }
    }

    // unknown
    emit({ type: 'error', message: 'مخرجات غير متوقعة من الـ AI' })
    break
  }

  // Fallback
  const lastText = [...loopMessages].reverse().find(m => m.role === 'assistant')?.content || ''
  const fallbackContent = lastText.length > 50
    ? lastText
    : `اكتملت ${toolsExecuted} عملية. يرجى إعادة صياغة الطلب لمزيد من التفاصيل.`

  emit({ type: 'done', message: `اكتمل بعد ${iteration} دورة`, content: fallbackContent })
  return { content: fallbackContent, steps, model: 'react-loop' }
}

// ── Detect if a query needs the ReAct loop ────────────────────────────────────
const GITHUB_ACTION_PATTERNS = [
  /أنش[ئئيى]\s*(مستودع|ريبو|repo|repository)/i,
  /ارفع|رفع\s*(ملف|كود|مشروع)/i,
  /عدّل|عدل|حدّث|حدث|تعديل|تحديث\s*(ملف)/i,
  /احذف\s*(فرع|مستودع|ملف)/i,
  /أنش[ئئيى]\s*(فرع|branch|pr|pull)/i,
  /صدّر|تصدير.*github/i,
  /اعرض\s*(مستودعاتي|مستودعات|repos|ملفات|الملفات|فروع)/i,
  /فعّل|فعل\s*(github pages|pages)/i,
  /أنش[ئئيى]\s*(pull request|PR)/i,
  /اقرأ|اقرا\s*(ملف|الملف)/i,
  /ابحث.*github|github.*ابحث/i,
  /اكتب.*في.*github|ضع.*في.*المستودع/i,
  /عطيني.*مستودعاتي|شوفلي.*مستودع/i,
  /انشئ.*مشروع.*github|ابني.*مشروع.*ونشره/i,
  /نشر.*github|github.*نشر/i,
  /commit.*push|push.*commit/i,
  /رفع.*github|github.*رفع/i,
  /مستودع.*جديد|مستودع.*github/i,
  /github.*مستودع|repo.*جديد/i,
  /create\s*(a\s*)?(new\s*)?(repo|repository|branch|pr|pull\s*request)/i,
  /push\s*(file|code|changes|to\s*github|this\s*to)/i,
  /update\s*(file|code|this\s*file)\s*(in|on|to)/i,
  /delete\s*(branch|file|repo)/i,
  /list\s*(my\s*)?(repos|repositories|files|branches)/i,
  /read\s*(the\s*)?file\s*(from|in|on)/i,
  /enable\s*(github\s*)?pages/i,
  /create\s*pr\b|create\s*pull\s*request/i,
  /commit\s*(and|&)\s*(push|pr)/i,
  /deploy\s*(to\s*)?(github|gh\s*pages)/i,
  /github.*deploy|upload.*github/i,
  /make\s*(a\s*)?repo|new\s*repository/i,
  /add\s*(file|code|this)\s*(to|into)\s*(github|the\s*repo)/i,
  /show\s*(me\s*)?my\s*(repos|repositories|github)/i,
  /get\s*(the\s*)?file\s*(from|in)\s*(github|the\s*repo)/i,
  /merge\s*(branch|pr|pull)/i,
  /clone.*repo|fork.*repo/i,
  /dir.*repo|saweb.*repo|ana.*repo/i,
  /refa3.*github|dir.*push/i,
  /wari.*repos|3tini.*repos/i,
  /github\s*token|token.*github/i,
]

// ── STRICT MODE ISOLATION GUARD ──────────────────────────────────────────────
// These patterns BLOCK GitHub ReAct loop even if GitHub is mentioned.
// News, explanations, discussions, questions → NEVER trigger ReAct.
const REACT_BLOCK_PATTERNS = [
  /أخبار|خبر|عاجل|مستجدات|نشرة/i,
  /اشرح لي|فسّر|ما هو|ما هي|كيف يعمل|لماذا|ما معنى|ما رأيك/i,
  /explain|what is|what are|how does|tell me about|summarize|translate/i,
  /explique|qu'est-ce que|comment fonctionne|résume/i,
  /تاريخ|ثقافة|دين|إسلام|رياضة|نتائج المباريات/i,
  /news|breaking news|latest news|headlines|sports result/i,
  /ترجم|لخّص|اختصر|ترجمة|تلخيص/i,
  // GitHub mentioned in info-seeking context (NOT action context)
  /أفضل مستودعات|أشهر مستودعات|trending.*github|github trending/i,
  /best repos|top repos|popular github|awesome list/i,
  /ما هو github|شرح github|كيف يعمل github/i,
]

export function shouldUseReActLoop(query) {
  if (!query) return false

  // STEP 1: Block if conversation-only pattern detected
  if (REACT_BLOCK_PATTERNS.some(p => p.test(query))) return false

  // STEP 2: Must have explicit GitHub ACTION verb + github mention
  if (/\bgithub\b/i.test(query) && /\b(create|push|add|delete|update|list|show|read|deploy|merge|clone|fork|commit|انشئ|ارفع|احذف|عدّل|اعرض|نشر|رفع|ادفع)\b/i.test(query)) {
    return true
  }

  // STEP 3: Match strict action patterns
  return GITHUB_ACTION_PATTERNS.some(p => p.test(query))
}
