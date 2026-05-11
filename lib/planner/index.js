/**
 * DZ Agent — Deployment Planner
 * Plan → Execute → Reflect → Fix → Retry
 *
 * Architecture:
 *   analyzeRequest()      — extract intent, type, name, features from user message
 *   createDeployPlan()    — produce ordered task list
 *   executeWithRecovery() — run tasks with retry + reflection
 *   reflectionLoop()      — analyze failure, generate fix action
 */

// ── Request Analyzer ──────────────────────────────────────────────────────────

const SITE_PATTERNS = {
  portfolio:  [/portfolio|بورتفوليو|سيرة ذاتية|cv\b|resume/i],
  blog:       [/blog|مدونة|مقالات|articles/i],
  store:      [/متجر|store|shop|ecommerce|منتجات|products/i],
  business:   [/شركة|company|business|وكالة|agency|خدمات\b/i],
  restaurant: [/مطعم|restaurant|cafe|مقهى|food|طعام/i],
  landing:    [/landing|هبوط|عروض|promo|صفحة تسويق/i],
  dashboard:  [/dashboard|لوحة.*تحكم|admin|إدارة/i],
  docs:       [/docs|توثيق|documentation|دليل/i],
}

const PROJECT_TYPE_PATTERNS = {
  react: [/react|vite.*react|react.*vite|create-react-app/i],
  vue:   [/vue\.?js|nuxt/i],
  html:  [/html|static|single.*page|spa|بسيط|عادي/i],
}

export function analyzeRequest(message) {
  const m = message.toLowerCase()

  // Detect project type
  let projectType = 'html'
  for (const [type, pats] of Object.entries(PROJECT_TYPE_PATTERNS)) {
    if (pats.some(p => p.test(m))) { projectType = type; break }
  }

  // Detect site type
  let siteType = 'landing'
  for (const [type, pats] of Object.entries(SITE_PATTERNS)) {
    if (pats.some(p => p.test(m))) { siteType = type; break }
  }

  // Extract repo name from message
  const repoMatch = message.match(/(?:باسم|اسمه|named?|called?|repo[:\s]+)\s*["']?([\w\-\.]+)["']?/i)
    || message.match(/(?:مستودع|repo|project)[:\s]+["']?([\w\-\.]+)["']?/i)
  const rawName = repoMatch?.[1] || `${siteType}-site`
  const repoName = rawName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || `${siteType}-site`

  // Extract description
  const description = message
    .replace(/أنشئ|انشئ|اصنع|اعمل|create|build|deploy|نشر|موقع|مستودع|github\s*pages/gi, '')
    .trim()
    .slice(0, 150)

  // Detect features
  const features = {
    animations:    /animation|حركة|متحرك|animate/i.test(m),
    darkMode:      /dark.*mode|وضع.*ليلي|ثيم.*داكن/i.test(m),
    rtl:           /arabic|عربي|rtl|يمين.*يسار/i.test(m) || /[\u0600-\u06FF]/.test(message),
    tailwind:      /tailwind/i.test(m),
    multiPage:     /multi.*page|صفحات.*متعددة|navbar|تنقل/i.test(m),
    contactForm:   /form|نموذج|contact|تواصل|اتصل/i.test(m),
  }

  return { projectType, siteType, repoName, description, features, originalMessage: message }
}

// ── Task Plan Builder ─────────────────────────────────────────────────────────

export function createDeployPlan(analysis) {
  const { projectType, siteType, repoName, description } = analysis

  const tasks = [
    {
      id: 'auth',
      label: 'التحقق من هوية GitHub',
      icon: '🔑',
      fn: 'get_auth_user',
      critical: true,
    },
    {
      id: 'generate',
      label: `توليد ملفات ${siteType} (${projectType})`,
      icon: '🧠',
      fn: 'generate_project_files',
      critical: true,
    },
    {
      id: 'create_repo',
      label: `إنشاء مستودع "${repoName}"`,
      icon: '📦',
      fn: 'create_repo',
      critical: true,
      args: { repoName, description },
    },
    {
      id: 'upload_files',
      label: 'رفع ملفات المشروع',
      icon: '⬆️',
      fn: 'upload_files',
      critical: true,
    },
    {
      id: 'enable_pages',
      label: 'تفعيل GitHub Pages',
      icon: '🌐',
      fn: 'enable_pages',
      critical: false,
    },
    {
      id: 'wait_pages',
      label: 'انتظار تفعيل الموقع',
      icon: '⏳',
      fn: 'wait_for_pages',
      critical: false,
    },
  ]

  return tasks
}

// ── Reflection Loop — analyze error and produce fix ───────────────────────────

export function reflectionLoop(taskId, error, context) {
  const msg = (error?.message || String(error)).toLowerCase()

  // Already exists — use existing repo
  if (msg.includes('already exists') || msg.includes('422')) {
    return {
      action: 'use_existing_repo',
      fix: `المستودع "${context.repoName}" موجود مسبقاً — سأستخدمه مباشرةً.`,
      retry: false,
    }
  }

  // Rate limit
  if (msg.includes('rate limit') || msg.includes('403')) {
    return {
      action: 'wait_and_retry',
      fix: 'تجاوزنا حد الطلبات على GitHub. انتظار 30 ثانية ثم إعادة المحاولة...',
      waitMs: 30000,
      retry: true,
    }
  }

  // Token issues
  if (msg.includes('401') || msg.includes('bad credential') || msg.includes('unauthorized')) {
    return {
      action: 'token_error',
      fix: 'خطأ في التحقق — تحقق من صلاحيات GitHub Token (يجب أن يحتوي على `repo` + `pages`).',
      retry: false,
    }
  }

  // Pages already enabled
  if (msg.includes('pages') && (msg.includes('already enabled') || msg.includes('409'))) {
    return {
      action: 'pages_already_active',
      fix: 'GitHub Pages مُفعَّل بالفعل على هذا المستودع.',
      retry: false,
    }
  }

  // Network timeout
  if (msg.includes('timeout') || msg.includes('abort') || msg.includes('etimedout')) {
    return {
      action: 'retry_request',
      fix: 'انتهت مهلة الاتصال. إعادة المحاولة...',
      waitMs: 3000,
      retry: true,
    }
  }

  // Upload failure — split and retry
  if (taskId === 'upload_files' && msg.includes('fail')) {
    return {
      action: 'retry_upload',
      fix: 'فشل رفع بعض الملفات — إعادة المحاولة واحداً واحداً.',
      retry: true,
    }
  }

  // Generic — try once more
  return {
    action: 'generic_retry',
    fix: `حدث خطأ: ${error?.message || error}. إعادة المحاولة...`,
    retry: true,
  }
}

// ── Task Executor — run plan step by step ─────────────────────────────────────

/**
 * executeWithRecovery
 * @param {Array} tasks - task plan from createDeployPlan
 * @param {object} context - { token, aiGenerate, buildProject, ... }
 * @param {Function} onStep - (step: { taskId, status, message, data? }) => void
 * @param {number} maxRetries - per-task retry limit
 */
export async function executeWithRecovery(tasks, context, onStep, maxRetries = 2) {
  const results = {}

  for (const task of tasks) {
    let attempt = 0
    let success = false
    let lastError = null

    while (attempt <= maxRetries && !success) {
      try {
        onStep({ taskId: task.id, status: 'running', message: `${task.icon} ${task.label}...`, attempt })

        const result = await runTask(task, context, results)
        results[task.id] = result
        success = true
        onStep({ taskId: task.id, status: 'done', message: `✅ ${task.label}`, data: result })

      } catch (err) {
        lastError = err
        const reflection = reflectionLoop(task.id, err, {
          ...context,
          repoName: task.args?.repoName || context.repoName,
        })

        onStep({ taskId: task.id, status: 'error', message: `⚠️ ${reflection.fix}`, attempt })

        if (!reflection.retry || attempt >= maxRetries) {
          if (task.critical) {
            throw new Error(`[${task.id}] ${reflection.fix}\n\nتفاصيل: ${err.message}`)
          } else {
            // Non-critical: continue with partial result
            results[task.id] = { skipped: true, reason: reflection.fix }
            success = true
          }
        } else {
          if (reflection.waitMs) await sleep(reflection.waitMs)
          attempt++
        }
      }
    }
  }

  return results
}

// ── Individual task runner ────────────────────────────────────────────────────

async function runTask(task, context, results) {
  const {
    token, aiGenerate, analysis,
    createRepo, batchPushFiles, enableGitHubPages, getAuthUser, generateProjectFiles,
  } = context

  switch (task.fn) {
    case 'get_auth_user': {
      const user = await getAuthUser(token)
      context.owner = user.login
      context.userInfo = user
      return { login: user.login, name: user.name }
    }

    case 'generate_project_files': {
      const files = await generateProjectFiles(analysis, aiGenerate)
      context.projectFiles = files
      return { fileCount: files.length, files: files.map(f => f.path) }
    }

    case 'create_repo': {
      const { repoName, description } = task.args
      context.repoName = repoName
      try {
        const repo = await createRepo(token, repoName, description, false)
        context.repoCreated = true
        return { full_name: `${context.owner}/${repoName}`, html_url: repo.html_url || `https://github.com/${context.owner}/${repoName}` }
      } catch (err) {
        // Repo already exists — continue with it
        if (err.message.includes('مسبقاً') || err.message.includes('422') || err.message.includes('already exists')) {
          context.repoCreated = false
          return { full_name: `${context.owner}/${repoName}`, html_url: `https://github.com/${context.owner}/${repoName}`, reused: true }
        }
        throw err
      }
    }

    case 'upload_files': {
      const owner = context.owner
      const repo  = context.repoName
      const files = context.projectFiles || []
      if (!files.length) throw new Error('لا توجد ملفات للرفع')
      const sha = await batchPushFiles(token, owner, repo, files, '🚀 Deploy by DZ Agent 🇩🇿', 'main')
      context.commitSha = sha
      return { commitSha: sha, fileCount: files.length }
    }

    case 'enable_pages': {
      const owner = context.owner
      const repo  = context.repoName
      const pagesResult = await enableGitHubPages(token, owner, repo)
      context.pagesEnabled = !!pagesResult
      context.siteUrl = `https://${owner}.github.io/${repo}`
      return { enabled: !!pagesResult, url: context.siteUrl, status: pagesResult?.status || 'building' }
    }

    case 'wait_for_pages': {
      // Non-blocking: just report expected URL and estimated wait time
      const url = context.siteUrl || `https://${context.owner}.github.io/${context.repoName}`
      return { url, estimatedWait: '1-3 دقائق', note: 'الموقع يُبنى عبر GitHub Actions' }
    }

    default:
      throw new Error(`مهمة غير معروفة: ${task.fn}`)
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
