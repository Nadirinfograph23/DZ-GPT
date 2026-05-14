// lib/skills/mount.js
// DZ-GitHub-Execution-Skill — Express Router
// يُضيف endpoints جديدة بدون تعديل الـ routes الموجودة

import {
  analyzeRepo,
  readRepoFile,
  writeRepoFile,
  deleteRepoFile,
  listRepoDirectory,
  createBranch,
  createPullRequest,
  syncToVercel,
  getVercelStatus,
  buildOperationReport,
} from './dz-github-skill.js'

import { classifyCommand, extractCommandParams, buildInstallInstructions } from './dz-terminal-skill.js'
import { buildDebugReport } from './dz-debug-skill.js'
import { autoFixLoop, buildAutoFixSummary } from './dz-auto-fix-skill.js'
import { runExecutionCycle, MODES } from './dz-execution-engine.js'
import { analyzeProjectDeep, buildIntelligenceReport } from './dz-project-intelligence.js'
import { skillMemory } from './dz-memory-skill.js'
import {
  deployAndWait,
  listDeployments,
  getDeploymentLogs,
  listVercelEnvVars,
  addVercelEnvVar,
  getSyncStatus,
} from './dz-vercel-skill.js'

const DEFAULT_OWNER = 'Nadirinfograph23'
const DEFAULT_REPO  = 'DZ-GPT'
const DEFAULT_BRANCH = 'devin/1774405518-init-dz-gpt'
const VERCEL_PROJECT = 'prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5'

function resolveToken(req) {
  return req.headers['x-github-token']
    || req.body?.token
    || process.env.GITHUB_TOKEN
    || ''
}

export function mountGitHubSkill(app) {
  // ── Health ──────────────────────────────────────────────────────────────
  app.get('/api/github-skill/health', async (req, res) => {
    const ghOk = !!process.env.GITHUB_TOKEN
    const vercelOk = !!process.env.VERCEL_TOKEN
    const vercelStatus = vercelOk ? await getVercelStatus(VERCEL_PROJECT).catch(() => null) : null
    res.json({
      ok: true,
      github: ghOk ? 'connected' : 'no_token',
      vercel: vercelOk ? (vercelStatus?.state || 'connected') : 'no_token',
      vercelUrl: 'https://dz-gpt.vercel.app',
      defaultRepo: `${DEFAULT_OWNER}/${DEFAULT_REPO}`,
      defaultBranch: DEFAULT_BRANCH,
      skills: ['analyze', 'file-ops', 'branch', 'pr', 'debug', 'auto-fix', 'sync'],
    })
  })

  // ── تحليل repo ────────────────────────────────────────────────────────
  app.post('/api/github-skill/analyze', async (req, res) => {
    const { owner = DEFAULT_OWNER, repo = DEFAULT_REPO } = req.body
    const token = resolveToken(req)
    try {
      const analysis = await analyzeRepo(owner, repo, token)
      res.json({ ok: true, analysis })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── قراءة ملف ─────────────────────────────────────────────────────────
  app.post('/api/github-skill/file/read', async (req, res) => {
    const { owner = DEFAULT_OWNER, repo = DEFAULT_REPO, path, branch = DEFAULT_BRANCH } = req.body
    if (!path) return res.status(400).json({ ok: false, error: 'path مطلوب' })
    const token = resolveToken(req)
    try {
      const file = await readRepoFile(owner, repo, path, branch, token)
      res.json({ ok: true, file })
    } catch (err) {
      res.status(404).json({ ok: false, error: err.message })
    }
  })

  // ── كتابة / إنشاء ملف ─────────────────────────────────────────────────
  app.post('/api/github-skill/file/write', async (req, res) => {
    const { owner = DEFAULT_OWNER, repo = DEFAULT_REPO, path, content, message, branch = DEFAULT_BRANCH } = req.body
    if (!path || content === undefined) return res.status(400).json({ ok: false, error: 'path و content مطلوبان' })
    const token = resolveToken(req)
    try {
      const result = await writeRepoFile(owner, repo, path, content, message, branch, token)
      const report = buildOperationReport({ operation: result.action === 'created' ? 'إنشاء ملف' : 'تعديل ملف', files: [path], branch, commitSha: result.commitSha })
      res.json({ ok: true, result, report })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── حذف ملف ───────────────────────────────────────────────────────────
  app.delete('/api/github-skill/file', async (req, res) => {
    const { owner = DEFAULT_OWNER, repo = DEFAULT_REPO, path, branch = DEFAULT_BRANCH } = req.body
    if (!path) return res.status(400).json({ ok: false, error: 'path مطلوب' })
    const token = resolveToken(req)
    try {
      const result = await deleteRepoFile(owner, repo, path, branch, token)
      res.json({ ok: true, result })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── قائمة ملفات مجلد ──────────────────────────────────────────────────
  app.post('/api/github-skill/file/list', async (req, res) => {
    const { owner = DEFAULT_OWNER, repo = DEFAULT_REPO, dir = '', branch = DEFAULT_BRANCH } = req.body
    const token = resolveToken(req)
    try {
      const files = await listRepoDirectory(owner, repo, dir, branch, token)
      res.json({ ok: true, path: dir || '/', count: files.length, files })
    } catch (err) {
      res.status(404).json({ ok: false, error: err.message })
    }
  })

  // ── إنشاء فرع ─────────────────────────────────────────────────────────
  app.post('/api/github-skill/branch/create', async (req, res) => {
    const { owner = DEFAULT_OWNER, repo = DEFAULT_REPO, branch, from = DEFAULT_BRANCH } = req.body
    if (!branch) return res.status(400).json({ ok: false, error: 'branch مطلوب' })
    const token = resolveToken(req)
    try {
      const result = await createBranch(owner, repo, branch, from, token)
      res.json({ ok: true, result })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── إنشاء Pull Request ─────────────────────────────────────────────────
  app.post('/api/github-skill/pr/create', async (req, res) => {
    const { owner = DEFAULT_OWNER, repo = DEFAULT_REPO, head, base = 'main', title, body } = req.body
    if (!head) return res.status(400).json({ ok: false, error: 'head (اسم الفرع المصدر) مطلوب' })
    const token = resolveToken(req)
    try {
      const pr = await createPullRequest(owner, repo, head, base, title, body, token)
      res.json({ ok: true, pr })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── تحليل خطأ + اقتراح إصلاح ─────────────────────────────────────────
  app.post('/api/github-skill/debug', async (req, res) => {
    const { errorText, stack = [] } = req.body
    if (!errorText) return res.status(400).json({ ok: false, error: 'errorText مطلوب' })
    const report = buildDebugReport(errorText, stack)
    res.json({ ok: true, report })
  })

  // ── إصلاح تلقائي ──────────────────────────────────────────────────────
  app.post('/api/github-skill/auto-fix', async (req, res) => {
    const {
      owner = DEFAULT_OWNER, repo = DEFAULT_REPO,
      errorText, branch = DEFAULT_BRANCH, stack = []
    } = req.body
    if (!errorText) return res.status(400).json({ ok: false, error: 'errorText مطلوب' })
    const token = resolveToken(req)
    try {
      const steps = []
      const result = await autoFixLoop({
        owner, repo, errorText, branch, stack, token,
        onProgress: (s) => steps.push(s),
      })
      const summary = buildAutoFixSummary(result)
      res.json({ ok: true, summary, steps, ...result })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── مزامنة Vercel فقط ─────────────────────────────────────────────────
  app.post('/api/github-skill/sync/vercel', async (req, res) => {
    const { branch = DEFAULT_BRANCH } = req.body
    const vercelToken = process.env.VERCEL_TOKEN
    try {
      const deployment = await syncToVercel(VERCEL_PROJECT, branch, vercelToken)
      res.json({ ok: true, deployment, liveUrl: 'https://dz-gpt.vercel.app' })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── مزامنة كاملة: ملف → GitHub → Vercel ──────────────────────────────
  app.post('/api/github-skill/sync/full', async (req, res) => {
    const {
      owner = DEFAULT_OWNER, repo = DEFAULT_REPO,
      branch = DEFAULT_BRANCH,
      files = [],        // [{ path, content, message }]
      triggerVercel = true,
    } = req.body
    const token = resolveToken(req)
    const results = { github: [], vercel: null, errors: [] }

    for (const f of files) {
      if (!f.path || f.content === undefined) { results.errors.push(`ملف بدون path أو content`); continue }
      try {
        const r = await writeRepoFile(owner, repo, f.path, f.content, f.message, branch, token)
        results.github.push({ path: f.path, commitSha: r.commitSha, action: r.action })
      } catch (err) {
        results.errors.push(`${f.path}: ${err.message}`)
      }
    }

    if (triggerVercel && process.env.VERCEL_TOKEN) {
      try {
        results.vercel = await syncToVercel(VERCEL_PROJECT, branch, process.env.VERCEL_TOKEN)
      } catch (err) {
        results.errors.push(`Vercel: ${err.message}`)
      }
    }

    const report = buildOperationReport({
      operation: 'مزامنة كاملة GitHub + Vercel',
      files: results.github.map(f => f.path),
      branch,
      commitSha: results.github[results.github.length - 1]?.commitSha,
      errors: results.errors,
      vercel: results.vercel,
    })

    res.json({ ok: results.errors.length === 0, results, report, liveUrl: 'https://dz-gpt.vercel.app' })
  })

  // ── تنفيذ أمر طبيعي (NLU dispatcher) ─────────────────────────────────
  app.post('/api/github-skill/execute', async (req, res) => {
    const { command, owner = DEFAULT_OWNER, repo = DEFAULT_REPO, branch = DEFAULT_BRANCH, context = {} } = req.body
    if (!command) return res.status(400).json({ ok: false, error: 'command مطلوب' })

    const token = resolveToken(req)
    const { action } = classifyCommand(command)
    const params = extractCommandParams(command, action)

    const finalOwner = params.owner || owner
    const finalRepo  = params.repo  || repo
    const finalBranch = params.branch || branch

    try {
      let result = {}

      switch (action) {
        case 'analyze_repo':
          result = await analyzeRepo(finalOwner, finalRepo, token)
          break
        case 'read_file':
          if (!params.filePath) return res.status(400).json({ ok: false, error: 'لم أجد اسم الملف في الأمر' })
          result = await readRepoFile(finalOwner, finalRepo, params.filePath, finalBranch, token)
          break
        case 'list_files':
          result = await listRepoDirectory(finalOwner, finalRepo, params.filePath || '', finalBranch, token)
          break
        case 'create_branch':
          if (!params.branch) return res.status(400).json({ ok: false, error: 'حدد اسم الفرع الجديد' })
          result = await createBranch(finalOwner, finalRepo, params.branch, finalBranch, token)
          break
        case 'create_pr':
          if (!params.branch) return res.status(400).json({ ok: false, error: 'حدد الفرع المصدر' })
          result = await createPullRequest(finalOwner, finalRepo, params.branch, 'main', params.prTitle, '', token)
          break
        case 'sync_vercel':
          result = await syncToVercel(VERCEL_PROJECT, finalBranch, process.env.VERCEL_TOKEN)
          break
        case 'debug':
          result = buildDebugReport(context.errorText || command, context.stack || [])
          break
        case 'install_deps':
          result = buildInstallInstructions(params.packageName || '', context.stack || [])
          break
        case 'status': {
          const [analysis, vercelStatus] = await Promise.allSettled([
            analyzeRepo(finalOwner, finalRepo, token),
            getVercelStatus(VERCEL_PROJECT),
          ])
          result = {
            repo: analysis.status === 'fulfilled' ? analysis.value : null,
            vercel: vercelStatus.status === 'fulfilled' ? vercelStatus.value : null,
          }
          break
        }
        default:
          result = { action: 'general_query', message: 'الأمر لم يُطابق عملية GitHub محددة — استخدم /api/dz-agent-chat للمحادثة العامة' }
      }

      res.json({ ok: true, action, params, result })
    } catch (err) {
      res.status(500).json({ ok: false, action, error: err.message })
    }
  })

  // ── Execution Engine — دورة التنفيذ الكاملة ANALYZE→PLAN→EXECUTE→VERIFY→FIX→REPORT ──
  app.post('/api/exec/run', async (req, res) => {
    const { command, mode = 'autonomous', context = {} } = req.body
    if (!command) return res.status(400).json({ ok: false, error: 'command مطلوب' })
    const steps = []
    try {
      const result = await runExecutionCycle({
        userCommand: command,
        mode: MODES[mode.toUpperCase()] || MODES.AUTONOMOUS,
        context,
        onStep: (s) => steps.push(s),
        token:       process.env.GITHUB_TOKEN,
        vercelToken: process.env.VERCEL_TOKEN,
      })
      res.json({ ok: result.success, result })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, steps })
    }
  })

  // ── Execution Modes list ────────────────────────────────────────────────
  app.get('/api/exec/modes', (_req, res) => {
    res.json({ ok: true, modes: Object.values(MODES), descriptions: {
      build: 'بناء المشروع وإصلاح أخطاء البناء',
      deploy: 'نشر على Vercel أو GitHub Pages',
      debug: 'تشخيص وإصلاح الأخطاء',
      github: 'عمليات GitHub (ملفات، فروع، PRs)',
      auto_fix: 'إصلاح تلقائي دون تدخل',
      refactor: 'إعادة هيكلة الكود',
      autonomous: 'وضع مستقل — يختار Engine الأفضل تلقائياً',
      analyze: 'تحليل المشروع فقط بدون تعديل',
    }})
  })

  // ── Project Intelligence — تحليل عميق للمشروع ──────────────────────────
  app.post('/api/intel/analyze', async (req, res) => {
    const { owner = DEFAULT_OWNER, repo = DEFAULT_REPO, branch = DEFAULT_BRANCH } = req.body
    const token = resolveToken(req)
    try {
      const analysis = await analyzeProjectDeep(owner, repo, branch, token)
      skillMemory.cacheRepoAnalysis(owner, repo, analysis)
      const report = buildIntelligenceReport(analysis)
      res.json({ ok: true, analysis, report })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  // ── Memory Skill — إحصاءات ذاكرة المهارات ────────────────────────────
  app.get('/api/exec/memory/stats', (_req, res) => {
    res.json({ ok: true, stats: skillMemory.stats() })
  })

  app.get('/api/exec/memory/recall', (req, res) => {
    const { q } = req.query
    if (!q) return res.status(400).json({ ok: false, error: 'q مطلوب' })
    const hit = skillMemory.recall(q)
    res.json({ ok: true, hit })
  })

  app.delete('/api/exec/memory', (_req, res) => {
    skillMemory.clear()
    res.json({ ok: true, cleared: true })
  })

  // ── Vercel Skill — deployments وlogs وenv vars وsync status ────────────
  app.post('/api/vercel/deploy', async (req, res) => {
    const { branch = DEFAULT_BRANCH, repoId = '1191199822' } = req.body
    const steps = []
    try {
      const dep = await deployAndWait({
        branch, repoId,
        maxWaitMs: 120000,
        onProgress: (s) => steps.push(s),
        token: process.env.VERCEL_TOKEN,
      })
      res.json({ ok: true, deployment: dep, steps })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message, steps })
    }
  })

  app.get('/api/vercel/deployments', async (req, res) => {
    const { limit = 5, target } = req.query
    try {
      const deployments = await listDeployments({ limit: Number(limit), target, token: process.env.VERCEL_TOKEN })
      res.json({ ok: true, deployments })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  app.get('/api/vercel/logs/:deployId', async (req, res) => {
    try {
      const logs = await getDeploymentLogs(req.params.deployId, process.env.VERCEL_TOKEN)
      res.json({ ok: true, logs })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  app.get('/api/vercel/env', async (_req, res) => {
    try {
      const vars = await listVercelEnvVars(undefined, process.env.VERCEL_TOKEN)
      res.json({ ok: true, vars })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  app.post('/api/vercel/env', async (req, res) => {
    const { key, value, target, type } = req.body
    if (!key || !value) return res.status(400).json({ ok: false, error: 'key و value مطلوبان' })
    try {
      const result = await addVercelEnvVar({ key, value, target, type, token: process.env.VERCEL_TOKEN })
      res.json({ ok: true, result })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  app.get('/api/vercel/sync-status', async (req, res) => {
    const { branch = DEFAULT_BRANCH } = req.query
    try {
      const status = await getSyncStatus({ branch, token: process.env.VERCEL_TOKEN })
      res.json({ ok: true, status })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  console.log('[github-skill] mounted: /api/github-skill/* | /api/exec/* | /api/intel/* | /api/vercel/*')
}
