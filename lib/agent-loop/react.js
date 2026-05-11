/**
 * DZ Agent — ReAct Loop (Reasoning + Acting)
 * Pattern: Thought → Action (tool call) → Observation → Repeat → Final Answer
 *
 * The LLM outputs structured JSON tool calls. The executor runs them against
 * real GitHub API, web search, or code sandbox. Results are fed back as
 * observations. Loop continues until the LLM outputs a Final Answer.
 */

import { executeGithubTool, GITHUB_TOOLS } from '../tools/github-tools.js'

const MAX_ITERATIONS = 8
const LOOP_TIMEOUT_MS = 90_000

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
    ? `✅ GitHub متصل — الحساب: **@${githubLogin || 'unknown'}** — يمكن تنفيذ جميع العمليات`
    : '⚠️ GitHub غير متصل — اطلب من المستخدم الاتصال أولاً'

  const userHint = githubLogin
    ? `\n**المستخدم الحالي:** @${githubLogin} — استخدم هذا الاسم دائماً في الـ URLs والردود. لا تستخدم "username" كـ placeholder أبداً.`
    : ''

  return `أنت DZ Agent V5 — مهندس برمجيات ذاتي قادر على تنفيذ مهام GitHub حقيقية بشكل مستقل.

${tokenStatus}${userHint}

## الأدوات المتاحة لك:
${buildToolSchemaText()}

## كيفية استخدام الأدوات:
عندما تحتاج لتنفيذ عملية، أخرج كتلة JSON بالشكل التالي بالضبط:

\`\`\`tool_call
{
  "thought": "تفكيرك في الخطوة التالية",
  "tool": "اسم_الأداة",
  "args": { "مفتاح": "قيمة" }
}
\`\`\`

عندما تنتهي من جميع الخطوات وتريد إرسال الرد النهائي للمستخدم، أخرج:

\`\`\`final_answer
ردك الكامل للمستخدم هنا
\`\`\`

## قواعد مهمة:
- نفّذ العمليات فعلياً — لا تقل "سأفعل" بدون تنفيذ
- إذا فشلت عملية، حلّل السبب وحاول البديل
- أخبر المستخدم بالنتائج الفعلية (URLs، أسماء الملفات، الـ commit SHA)
- استخدم اللغة التي يكتب بها المستخدم (عربي/إنجليزي/فرنسي)
- لا تختلق نتائج — استخدم فقط ما أرجعته الأدوات فعلاً`
}

// ── Parse LLM output for tool calls or final answer ───────────────────────────
function parseLLMOutput(text) {
  // Try tool_call block
  const toolMatch = text.match(/```tool_call\s*([\s\S]*?)```/i)
  if (toolMatch) {
    try {
      const parsed = JSON.parse(toolMatch[1].trim())
      if (parsed.tool) {
        return { type: 'tool_call', thought: parsed.thought || '', tool: parsed.tool, args: parsed.args || {} }
      }
    } catch (_) {}
  }

  // Try JSON directly (fallback for models that ignore markdown)
  const jsonMatch = text.match(/\{[\s\S]*?"tool"\s*:\s*"([\w_]+)"[\s\S]*?\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.tool) {
        return { type: 'tool_call', thought: parsed.thought || '', tool: parsed.tool, args: parsed.args || {} }
      }
    } catch (_) {}
  }

  // Try final_answer block
  const finalMatch = text.match(/```final_answer\s*([\s\S]*?)```/i)
  if (finalMatch) {
    return { type: 'final_answer', content: finalMatch[1].trim() }
  }

  // If no structured output but the response is substantial — treat as final answer
  // (some models just answer directly)
  if (text.trim().length > 50) {
    return { type: 'final_answer', content: text.trim() }
  }

  return { type: 'unknown' }
}

// ── Execute a tool call ────────────────────────────────────────────────────────
async function executeTool(toolName, args) {
  // GitHub tools
  if (GITHUB_TOOLS[toolName]) {
    return await executeGithubTool(toolName, args)
  }
  return { error: `الأداة "${toolName}" غير معروفة. الأدوات المتاحة: ${Object.keys(GITHUB_TOOLS).join(', ')}` }
}

// ── Main ReAct loop ───────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.query - User message
 * @param {Array}  opts.messages - Chat history [{role, content}]
 * @param {Function} opts.aiGenerate - AI generation function
 * @param {string}  [opts.githubToken] - User's GitHub OAuth token (preferred over env)
 * @param {Function} [opts.onStep] - Stream callback: (step) => void
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{content: string, steps: Array, model: string}>}
 */
export async function runReActLoop({ query, messages, aiGenerate, githubToken, onStep, signal }) {
  // Resolve effective token: user token first, then server env token
  const effectiveToken = githubToken || process.env.GITHUB_TOKEN || ''
  const hasGithubToken = !!effectiveToken

  const steps = []
  const loopStart = Date.now()

  function emit(step) {
    onStep?.(step)
    steps.push(step)
  }

  // ── Guard: no token at all → return connect message immediately ────────────
  if (!hasGithubToken) {
    const noTokenMsg = `⚠️ **GitHub غير متصل**\n\nلتنفيذ عمليات GitHub (إنشاء مستودعات، رفع ملفات...)، يجب الاتصال بحسابك أولاً.\n\n**كيفية الاتصال:**\nانقر على زر **"ربط GitHub"** في أعلى الصفحة ثم أعد المحاولة.`
    emit({ type: 'error', message: 'لا يوجد GitHub token' })
    return { content: noTokenMsg, steps, model: null }
  }

  // ── Pre-fetch real GitHub user BEFORE starting the loop ───────────────────
  let githubLogin = null
  try {
    emit({ type: 'thinking', iteration: 0, message: 'التحقق من هوية GitHub...' })
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${effectiveToken}`,
        'User-Agent': 'DZ-Agent/5.0',
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (userRes.ok) {
      const userData = await userRes.json()
      githubLogin = userData.login
      emit({ type: 'thinking', iteration: 0, message: `✅ GitHub: @${githubLogin}` })
    }
  } catch (_) {
    // Non-fatal: continue without username
  }

  // Inject real username into every tool call going forward
  const tokenWithUser = { token: effectiveToken, _login: githubLogin }

  const systemPrompt = buildSystemPrompt(hasGithubToken, githubLogin)

  // Build conversation for the loop
  const loopMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.filter(m => m.role !== 'system').slice(-6),
    { role: 'user', content: query },
  ]

  let iteration = 0

  emit({ type: 'start', message: `بدء ReAct Agent Loop — @${githubLogin || 'unknown'}` })

  while (iteration < MAX_ITERATIONS) {
    if (signal?.aborted) break
    if (Date.now() - loopStart > LOOP_TIMEOUT_MS) {
      emit({ type: 'timeout', message: 'انتهت مهلة التنفيذ' })
      break
    }

    iteration++
    emit({ type: 'thinking', iteration, message: `التفكير في الخطوة ${iteration}...` })

    // Ask LLM for next step
    let llmOutput
    try {
      const result = await aiGenerate({
        messages: loopMessages,
        query,
        max_tokens: 2000,
        temperature: 0.3,
      })
      llmOutput = typeof result === 'string' ? result : (result?.content || '')
    } catch (err) {
      emit({ type: 'error', message: `خطأ في توليد AI: ${err.message}` })
      break
    }

    if (!llmOutput) break

    const parsed = parseLLMOutput(llmOutput)

    // Final answer
    if (parsed.type === 'final_answer') {
      emit({ type: 'done', message: 'اكتملت المهمة', content: parsed.content })
      return { content: parsed.content, steps, model: 'react-loop' }
    }

    // Tool call
    if (parsed.type === 'tool_call') {
      emit({
        type: 'tool_call',
        tool: parsed.tool,
        thought: parsed.thought,
        args: parsed.args,
        message: `⚙️ تنفيذ: ${parsed.tool}`,
      })

      // Execute the tool for real — always inject the resolved token
      let observation
      try {
        const argsWithToken = { ...parsed.args, token: parsed.args.token || effectiveToken }
        observation = await executeTool(parsed.tool, argsWithToken)
      } catch (err) {
        observation = { error: err.message }
      }

      const observationStr = JSON.stringify(observation, null, 2)
      emit({
        type: 'observation',
        tool: parsed.tool,
        result: observation,
        message: observation.error
          ? `❌ ${parsed.tool}: ${observation.error}`
          : `✅ ${parsed.tool}: نجح`,
      })

      // Feed observation back into conversation
      loopMessages.push(
        { role: 'assistant', content: llmOutput },
        {
          role: 'user',
          content: `**نتيجة الأداة "${parsed.tool}":**\n\`\`\`json\n${observationStr}\n\`\`\`\n\nواصل التنفيذ.`,
        }
      )
      continue
    }

    // Unknown output — treat as final answer
    emit({ type: 'done', message: 'رد مباشر', content: llmOutput })
    return { content: llmOutput, steps, model: 'react-loop' }
  }

  // Fallback if loop exhausted without final answer
  const fallback = `⚠️ اكتملت ${iteration} خطوات بدون إجابة نهائية. يرجى إعادة صياغة الطلب.`
  return { content: fallback, steps, model: 'react-loop' }
}

// ── Detect if a query needs the ReAct loop ────────────────────────────────────
const GITHUB_ACTION_PATTERNS = [
  /أنش[ئئ]\s*(مستودع|repo)/i,
  /ارفع|رفع\s*(ملف|كود)/i,
  /عدّل|حدّث|تعديل\s*(ملف)/i,
  /احذف\s*(فرع|مستودع)/i,
  /أنش[ئئ]\s*(فرع|branch)/i,
  /صدّر|تصدير.*github/i,
  /اعرض\s*(مستودعاتي|repos|ملفات)/i,
  /فعّل\s*(github pages|pages)/i,
  /أنش[ئئ]\s*(pull request|PR)/i,
  /create\s*(repo|repository|branch)/i,
  /push\s*(file|code|changes)/i,
  /update\s*file\s*in/i,
  /delete\s*branch/i,
  /list\s*(repos|files|branches)/i,
  /enable\s*(pages|github pages)/i,
  /create\s*pr\b|create\s*pull/i,
  /commit\s*(and|&)\s*(push|pr)/i,
  /deploy.*github/i,
  /github.*deploy/i,
  /اقرأ\s*ملف/i,
  /read\s*file.*github/i,
]

export function shouldUseReActLoop(query) {
  return GITHUB_ACTION_PATTERNS.some(p => p.test(query))
}
