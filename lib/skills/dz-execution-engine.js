// lib/skills/dz-execution-engine.js
// DZ Execution Engine — ANALYZE → PLAN → EXECUTE → VERIFY → FIX → RETRY → REPORT
// يُحوّل DZ Agent من chatbot إلى AI Execution Agent حقيقي

import { analyzeRepo, writeRepoFile, readRepoFile, createBranch, syncToVercel } from './dz-github-skill.js'
import { classifyCommand, extractCommandParams } from './dz-terminal-skill.js'
import { buildDebugReport } from './dz-debug-skill.js'
import { autoFixLoop } from './dz-auto-fix-skill.js'
import { analyzeProjectDeep } from './dz-project-intelligence.js'
import { skillMemory } from './dz-memory-skill.js'

const MAX_RETRIES = 3
const VERCEL_PROJECT_ID = 'prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5'
const DEFAULT_OWNER  = 'Nadirinfograph23'
const DEFAULT_REPO   = 'DZ-GPT'
const DEFAULT_BRANCH = 'devin/1774405518-init-dz-gpt'

// ── Execution Modes ────────────────────────────────────────────────────────
export const MODES = {
  BUILD:      'build',
  DEPLOY:     'deploy',
  DEBUG:      'debug',
  GITHUB:     'github',
  AUTO_FIX:   'auto_fix',
  REFACTOR:   'refactor',
  AUTONOMOUS: 'autonomous',
  ANALYZE:    'analyze',
}

// ── دورة التنفيذ الكاملة ───────────────────────────────────────────────────
export async function runExecutionCycle({
  userCommand,
  mode = MODES.AUTONOMOUS,
  context = {},
  onStep,
  token,
  vercelToken,
}) {
  onStep = onStep || (() => {})
  const sessionId = `exec-${Date.now()}`
  const steps = []
  const log = (phase, label, data = {}) => {
    const entry = { phase, label, ts: new Date().toISOString(), ...data }
    steps.push(entry)
    onStep(entry)
  }

  const owner  = context.owner  || DEFAULT_OWNER
  const repo   = context.repo   || DEFAULT_REPO
  const branch = context.branch || DEFAULT_BRANCH
  const ghToken = token || process.env.GITHUB_TOKEN
  const vToken  = vercelToken || process.env.VERCEL_TOKEN

  const result = {
    sessionId,
    command: userCommand,
    mode,
    steps: [],
    filesModified: [],
    errors: [],
    fixes: [],
    gitStatus: null,
    vercelStatus: null,
    success: false,
    report: '',
  }

  try {
    // ── PHASE 1: ANALYZE ───────────────────────────────────────────────────
    log('ANALYZE', '🔍 تحليل الأمر وفهم السياق...')
    const { action, params } = _parseIntent(userCommand, context)
    const memoryHit = skillMemory.recall(userCommand)
    if (memoryHit) log('ANALYZE', `💾 وُجد سياق سابق: ${memoryHit.summary}`, { cached: true })

    const repoAnalysis = context.repoAnalysis || await analyzeRepo(owner, repo, ghToken).catch(() => null)
    if (repoAnalysis) log('ANALYZE', `📁 Stack: ${(repoAnalysis.stack || []).slice(0, 5).join(', ')}`)

    log('ANALYZE', `✅ الإجراء المحدد: ${action}`, { action, params, done: true })

    // ── PHASE 2: PLAN ──────────────────────────────────────────────────────
    log('PLAN', '📋 بناء خطة التنفيذ...')
    const plan = buildExecutionPlan(action, params, repoAnalysis, mode)
    log('PLAN', `✅ ${plan.steps.length} خطوات مخططة`, { steps: plan.steps, done: true })

    // ── PHASE 3: EXECUTE ───────────────────────────────────────────────────
    log('EXECUTE', '⚙️ تنفيذ العمليات الحقيقية...')
    const execResult = await _execute(action, params, { owner, repo, branch, ghToken, vToken, repoAnalysis, plan, log })
    result.filesModified = execResult.filesModified || []
    result.gitStatus     = execResult.gitStatus || null
    result.vercelStatus  = execResult.vercelStatus || null
    if (execResult.errors?.length) result.errors.push(...execResult.errors)
    log('EXECUTE', `✅ تم تنفيذ ${result.filesModified.length} عملية`, { done: true })

    // ── PHASE 4: VERIFY ────────────────────────────────────────────────────
    log('VERIFY', '🔎 التحقق من نتائج التنفيذ...')
    const verifyResult = await _verify(result, { owner, repo, branch, ghToken })
    if (!verifyResult.ok) {
      result.errors.push(...(verifyResult.errors || []))
      log('VERIFY', `⚠️ تحقق جزئي — ${verifyResult.errors?.join(', ')}`)
    } else {
      log('VERIFY', '✅ التحقق ناجح', { done: true })
    }

    // ── PHASE 5: FIX (if needed) ───────────────────────────────────────────
    if (result.errors.length && execResult.errorText) {
      log('FIX', '🛠️ تطبيق إصلاحات تلقائية...')
      let retries = 0
      while (retries < MAX_RETRIES && result.errors.length > 0) {
        retries++
        log('RETRY', `🔄 محاولة ${retries}/${MAX_RETRIES}...`)
        const fixResult = await autoFixLoop({
          owner, repo, errorText: execResult.errorText,
          branch, stack: repoAnalysis?.stack || [], token: ghToken,
          onProgress: (s) => log('FIX', s.label),
        })
        result.fixes.push(...(fixResult.fixed || []))
        if (fixResult.fixed?.length > 0) {
          result.errors = []
          log('FIX', `✅ إصلاح ${fixResult.fixed.length} مشكلة`, { done: true })
          break
        }
      }
    }

    // ── PHASE 6: REPORT ────────────────────────────────────────────────────
    result.success = result.errors.length === 0
    result.report  = buildFinalReport(result, plan)
    result.steps   = steps

    skillMemory.store({
      key: userCommand,
      action,
      success: result.success,
      summary: `${action} — ${result.filesModified.length} ملفات — ${result.success ? 'نجح' : 'فشل جزئياً'}`,
      filesModified: result.filesModified,
      ts: Date.now(),
    })

    log('REPORT', result.success ? '✅ العملية اكتملت بنجاح' : '⚠️ اكتملت مع تحفظات', { done: true })
    return result

  } catch (err) {
    result.errors.push(err.message)
    result.steps = steps
    result.report = `## ❌ خطأ في التنفيذ\n**السبب:** ${err.message}\n\n**اقتراح:** ${buildDebugReport(err.message).fixes?.[0] || 'راجع logs السيرفر'}`
    log('ERROR', `❌ ${err.message}`)
    return result
  }
}

// ── تحليل النية من الأمر الطبيعي ─────────────────────────────────────────
function _parseIntent(command, context) {
  const { action } = classifyCommand(command)
  const params = extractCommandParams(command, action)

  // دمج مع context الموجود
  if (context.owner && !params.owner) params.owner = context.owner
  if (context.repo  && !params.repo)  params.repo  = context.repo
  if (context.branch && !params.branch) params.branch = context.branch

  return { action, params }
}

// ── بناء خطة التنفيذ ──────────────────────────────────────────────────────
function buildExecutionPlan(action, params, repoAnalysis, mode) {
  const plans = {
    analyze_repo:   { steps: ['fetch_meta', 'fetch_tree', 'detect_stack', 'scan_issues', 'generate_report'] },
    create_file:    { steps: ['validate_path', 'generate_content', 'write_github', 'verify_file'] },
    fix_build:      { steps: ['fetch_logs', 'classify_error', 'apply_fix', 'verify_build'] },
    deploy_pages:   { steps: ['auth_github', 'create_repo', 'push_files', 'enable_pages', 'verify_url'] },
    sync_vercel:    { steps: ['push_github', 'trigger_vercel', 'poll_status', 'verify_url'] },
    full_sync:      { steps: ['push_github', 'trigger_vercel', 'poll_status'] },
    create_branch:  { steps: ['get_base_sha', 'create_ref', 'verify_branch'] },
    create_pr:      { steps: ['check_diff', 'open_pr', 'verify_pr'] },
    debug:          { steps: ['classify_error', 'locate_file', 'suggest_fix'] },
    auto_fix:       { steps: ['read_file', 'apply_patch', 'write_github', 'verify'] },
    status:         { steps: ['fetch_github_sha', 'fetch_vercel_state', 'compare', 'report'] },
    list_files:     { steps: ['fetch_directory'] },
    read_file:      { steps: ['fetch_content', 'decode', 'display'] },
    general_query:  { steps: ['route_to_ai'] },
  }
  return plans[action] || plans.general_query
}

// ── تنفيذ العملية الفعلية ─────────────────────────────────────────────────
async function _execute(action, params, ctx) {
  const { owner, repo, branch, ghToken, vToken, repoAnalysis, log } = ctx
  const out = { filesModified: [], errors: [], errorText: '', gitStatus: null, vercelStatus: null }

  switch (action) {
    case 'analyze_repo': {
      const a = await analyzeRepo(params.owner || owner, params.repo || repo, ghToken)
      out.analysis = a
      out.gitStatus = { sha: null, branch: a.defaultBranch }
      break
    }
    case 'create_file': {
      if (!params.filePath) { out.errors.push('مسار الملف غير محدد'); break }
      const content = params.content || `// ${params.filePath} — أُنشئ بواسطة DZ Agent\n`
      const r = await writeRepoFile(owner, repo, params.filePath, content, `feat: add ${params.filePath}`, branch, ghToken)
      out.filesModified.push(params.filePath)
      out.gitStatus = { sha: r.commitSha, branch }
      break
    }
    case 'sync_vercel':
    case 'full_sync': {
      const dep = await syncToVercel(null, branch, vToken)
      out.vercelStatus = dep
      log('EXECUTE', `🚀 Vercel deployment: ${dep.state} — ${dep.deploymentId}`)
      break
    }
    case 'create_branch': {
      if (!params.branch) { out.errors.push('اسم الفرع غير محدد'); break }
      const r = await createBranch(owner, repo, params.branch, branch, ghToken)
      out.gitStatus = { branch: r.branch, sha: r.sha }
      break
    }
    case 'status': {
      const [ghR, vR] = await Promise.allSettled([
        analyzeRepo(owner, repo, ghToken),
        fetch(`https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=1`, {
          headers: { Authorization: `Bearer ${vToken}` }, signal: AbortSignal.timeout(8000),
        }).then(r => r.json()).then(d => d.deployments?.[0] || null),
      ])
      out.analysis = ghR.status === 'fulfilled' ? ghR.value : null
      out.vercelStatus = vR.status === 'fulfilled' ? vR.value : null
      break
    }
    case 'debug': {
      const errText = params.errorText || ''
      out.debugReport = buildDebugReport(errText, repoAnalysis?.stack || [])
      out.errorText = errText
      break
    }
    default:
      out.errors.push(`الإجراء "${action}" يحتاج معالجة AI — استخدم /api/dz-agent-chat`)
  }
  return out
}

// ── التحقق من نتائج التنفيذ ────────────────────────────────────────────────
async function _verify(result, { owner, repo, branch, ghToken }) {
  const errors = []

  for (const filePath of result.filesModified) {
    try {
      await readRepoFile(owner, repo, filePath, branch, ghToken)
    } catch {
      errors.push(`تحقق فشل: ${filePath} غير موجود على GitHub`)
    }
  }

  if (result.vercelStatus && !['READY', 'BUILDING', 'QUEUED', 'INITIALIZING'].includes(result.vercelStatus.state)) {
    errors.push(`Vercel state غير متوقع: ${result.vercelStatus.state}`)
  }

  return { ok: errors.length === 0, errors }
}

// ── تقرير نهائي احترافي ───────────────────────────────────────────────────
function buildFinalReport(result, plan) {
  const status = result.success ? '✅ نجح' : '⚠️ اكتمل مع تحفظات'
  const lines = [
    `## 📋 تقرير التنفيذ — DZ Execution Engine`,
    `**الحالة:** ${status} | **الوضع:** ${result.mode} | **ID:** \`${result.sessionId}\``,
    '',
    `**الأمر المنفذ:** ${result.command}`,
    `**الخطوات المخططة:** ${plan.steps.join(' → ')}`,
    '',
  ]

  if (result.filesModified.length) {
    lines.push(`### 📁 الملفات المعدلة (${result.filesModified.length})`)
    result.filesModified.forEach(f => lines.push(`- \`${f}\``))
    lines.push('')
  }
  if (result.gitStatus?.sha) {
    lines.push(`**Git Commit:** \`${result.gitStatus.sha.slice(0,8)}\` على \`${result.gitStatus.branch}\``)
  }
  if (result.vercelStatus) {
    lines.push(`**Vercel:** ${result.vercelStatus.state} — [dzagent.app](https://dzagent.app)`)
  }
  if (result.fixes.length) {
    lines.push('', `### 🛠️ إصلاحات مطبّقة (${result.fixes.length})`)
    result.fixes.forEach(f => lines.push(`- \`${f.file}\` — ${f.action}`))
  }
  if (result.errors.length) {
    lines.push('', `### ❌ أخطاء مكتشفة (${result.errors.length})`)
    result.errors.forEach(e => lines.push(`- ${e}`))
  }

  lines.push('', `---`, `*DZ Execution Engine • ${new Date().toISOString()}*`)
  return lines.join('\n')
}
