import { useState, useCallback } from 'react'
import { Code2, Github, ChevronDown, ChevronUp, Terminal, GitBranch, CheckCircle2, Loader2, X, AlertTriangle, Plus, FolderOpen, Globe, ExternalLink } from 'lucide-react'
import '../styles/agent-mode-bar.css'

export interface AgentModeState {
  active: boolean
  githubToken: string
  selectedRepo: string
  autoConfirm: boolean
}

interface Repo { full_name: string; name: string; private: boolean; language?: string; updated_at?: string }

interface AgentModeBarProps {
  state: AgentModeState
  onChange: (s: AgentModeState) => void
  githubUser?: { login: string; avatar: string } | null
  onCommandSelect?: (cmd: string) => void
  clientGithubToken?: string
}

const SLASH_COMMANDS = [
  { cmd: '/read',    desc: 'اقرأ محتوى ملف',                  example: '/read src/App.tsx' },
  { cmd: '/edit',    desc: 'عدّل ملف بتعليمة (يطلب تأكيد)',   example: '/edit server.js أضف route جديد' },
  { cmd: '/ls',      desc: 'اعرض ملفات مجلد',                 example: '/ls src/' },
  { cmd: '/tree',    desc: 'شجرة كاملة لهيكل المستودع',        example: '/tree src/' },
  { cmd: '/grep',    desc: 'ابحث عن نص داخل ملفات المستودع',   example: '/grep useState src/' },
  { cmd: '/find',    desc: 'ابحث عن ملف بالاسم أو النوع',     example: '/find *.config.js' },
  { cmd: '/history', desc: 'عرض آخر commits للمستودع',         example: '/history 15' },
  { cmd: '/diff',    desc: 'الفرق الحقيقي بين فرعين',         example: '/diff main feature/login' },
  { cmd: '/issues',  desc: 'إدارة GitHub Issues (عرض/إضافة/إغلاق)', example: '/issues new خطأ في login' },
  { cmd: '/actions', desc: 'حالة GitHub Actions (CI/CD)',      example: '/actions' },
  { cmd: '/release', desc: 'أنشئ إصداراً جديداً',              example: '/release v1.2.0 ميزات جديدة' },
  { cmd: '/review',  desc: 'مراجعة AI لـ Pull Request',        example: '/review 7' },
  { cmd: '/delete',  desc: 'احذف ملفاً من المستودع (يطلب تأكيد)', example: '/delete src/old.tsx' },
  { cmd: '/commit',  desc: 'احفظ التغييرات مع رسالة',         example: '/commit "fix: إصلاح bug الطقس"' },
  { cmd: '/pr',      desc: 'أنشئ Pull Request',                example: '/pr "feat: dark mode"' },
  { cmd: '/scan',    desc: 'افحص الكود عن أخطاء وثغرات',       example: '/scan' },
  { cmd: '/suggest', desc: 'اقترح تحسينات للكود',              example: '/suggest' },
  { cmd: '/deploy',  desc: 'انشر على GitHub Pages',            example: '/deploy' },
  { cmd: '/repos',   desc: 'اقترح مستودعات GitHub مفيدة',      example: '/repos ai' },
  { cmd: '/memory',  desc: 'ذاكرة المشروع (حفظ/عرض/تحديث)',   example: '/memory save ملاحظاتي' },
]

export default function AgentModeBar({ state, onChange, githubUser, onCommandSelect, clientGithubToken }: AgentModeBarProps) {
  const [expanded, setExpanded]         = useState(false)
  const [repos, setRepos]               = useState<Repo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoError, setRepoError]       = useState('')
  const [showCmds, setShowCmds]         = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  // Deploy panel state
  const [deployOpen, setDeployOpen]     = useState(false)
  const [deploying, setDeploying]       = useState(false)
  const [deploySteps, setDeploySteps]   = useState<Array<{ id: string; label: string; done: boolean }>>([])
  const [deployResult, setDeployResult] = useState<null | Record<string, unknown>>(null)
  const [deployError, setDeployError]   = useState('')

  // Workspace selection state
  const [workspaceReady, setWorkspaceReady] = useState(false)
  const [workspaceTab, setWorkspaceTab]     = useState<'select' | 'create'>('select')
  const [selectedWorkspace, setSelectedWorkspace] = useState('')
  const [newRepoName, setNewRepoName]       = useState('')
  const [creatingRepo, setCreatingRepo]     = useState(false)

  const toggle = useCallback(() => {
    if (state.active) {
      setConfirmDeactivate(true)
      return
    }
    setExpanded(true)
    onChange({ ...state, active: false })
  }, [state, onChange])

  const doDeactivate = useCallback(() => {
    setConfirmDeactivate(false)
    setShowCmds(false)
    setExpanded(false)
    setWorkspaceReady(false)
    setWorkspaceTab('select')
    setSelectedWorkspace('')
    setNewRepoName('')
    setRepos([])
    setRepoError('')
    onChange({ ...state, active: false, githubToken: '', selectedRepo: '' })
  }, [state, onChange])

  const fetchReposFromServer = useCallback(async (): Promise<Repo[]> => {
    const tok = state.githubToken || clientGithubToken || ''
    const res = await fetch('/api/dz-agent/github/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tok }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'فشل جلب المستودعات')
    return Array.isArray(data.repos) ? data.repos : []
  }, [state.githubToken, clientGithubToken])

  // Called from "تحميل المستودعات" button — fetches repos then shows workspace picker
  const connectGitHub = useCallback(async () => {
    setLoadingRepos(true)
    setRepoError('')
    try {
      const validRepos = await fetchReposFromServer()
      setRepos(validRepos)
      if (validRepos.length === 0) {
        setRepoError('😉👌 عاود تسجيل خروج من الفوق و عاود ادخل تسجيل دخول')
        return
      }
      setSelectedWorkspace(validRepos[0]?.full_name || '')
      setWorkspaceReady(true)
    } catch (e) {
      setRepoError((e as Error).message)
    } finally {
      setLoadingRepos(false)
    }
  }, [fetchReposFromServer])

  // Called from active repo dropdown to refresh list
  const loadRepos = useCallback(async () => {
    if (repos.length) return
    setLoadingRepos(true)
    try {
      const validRepos = await fetchReposFromServer()
      setRepos(validRepos)
      if (validRepos.length === 0) {
        setRepoError('😉👌 عاود تسجيل خروج من الفوق و عاود ادخل تسجيل دخول')
      }
    } catch {}
    finally { setLoadingRepos(false) }
  }, [repos.length, fetchReposFromServer])

  // Confirm workspace selection (existing repo)
  const handleSelectWorkspace = useCallback(() => {
    const repo = selectedWorkspace || repos[0]?.full_name || ''
    if (!repo) return
    setWorkspaceReady(false)
    setExpanded(false)
    onChange({ ...state, active: true, selectedRepo: repo })
  }, [selectedWorkspace, repos, state, onChange])

  // Create new repo then activate
  const handleCreateWorkspace = useCallback(async () => {
    const name = newRepoName.trim()
    if (!name) { setRepoError('اكتب اسم المستودع أولاً'); return }
    setCreatingRepo(true)
    setRepoError('')
    try {
      const tok = state.githubToken || clientGithubToken || ''
      const res = await fetch('/api/dz-agent/github/create-repo-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName: name, token: tok }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء المستودع')
      const fullName = `${data.owner}/${data.repo}`
      setWorkspaceReady(false)
      setExpanded(false)
      onChange({ ...state, active: true, selectedRepo: fullName })
    } catch (e) {
      setRepoError((e as Error).message)
    } finally {
      setCreatingRepo(false)
    }
  }, [newRepoName, state, onChange])

  const runDeploy = useCallback(async () => {
    if (!state.selectedRepo || deploying) return
    const tok = state.githubToken || clientGithubToken || ''
    setDeploying(true)
    setDeploySteps([])
    setDeployResult(null)
    setDeployError('')
    try {
      const res = await fetch('/api/dz-agent/github/pages/deploy-existing-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok, repo: state.selectedRepo }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({})) as Record<string, string>
        throw new Error(err.error || 'فشل الاتصال بالسيرفر')
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6).trim())
            if (event.type === 'step' && event.step) {
              setDeploySteps(prev => {
                const idx = prev.findIndex(s => s.id === event.step.id)
                if (idx > -1) { const next = [...prev]; next[idx] = event.step; return next }
                return [...prev, event.step]
              })
            } else if (event.type === 'done') {
              setDeployResult(event)
            } else if (event.type === 'error') {
              setDeployError(String(event.error || 'خطأ غير معروف'))
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setDeployError((err as Error).message)
    } finally {
      setDeploying(false)
    }
  }, [state.selectedRepo, state.githubToken, clientGithubToken, deploying])

  const handleCommandClick = (example: string) => {
    if (onCommandSelect) {
      onCommandSelect(example)
      setShowCmds(false)
    }
  }

  return (
    <div className={`amb-wrap ${state.active ? 'amb-wrap--active' : ''}`}>

      {/* ── Deactivate confirmation dialog ── */}
      {confirmDeactivate && (
        <div className="amb-deactivate-confirm">
          <div className="amb-deactivate-icon"><AlertTriangle size={16} /></div>
          <div className="amb-deactivate-text">
            <strong>إيقاف وضع الوكيل؟</strong>
            <span>سيتم قطع الاتصال بـ GitHub وإنهاء الجلسة الحالية.</span>
          </div>
          <div className="amb-deactivate-btns">
            <button className="amb-deactivate-yes" onClick={doDeactivate}>إيقاف</button>
            <button className="amb-deactivate-no" onClick={() => setConfirmDeactivate(false)}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ── Toggle row ── */}
      <div className="amb-row">
        <button
          className={`amb-toggle ${state.active ? 'amb-toggle--on' : ''}`}
          onClick={toggle}
          title={state.active ? 'إيقاف وضع الوكيل' : 'تفعيل وضع الوكيل البرمجي'}
        >
          <Code2 size={14} />
          <span>وكيل</span>
          <span className={`amb-dot ${state.active ? 'amb-dot--on' : ''}`} />
        </button>

        {state.active && (
          <>
            {/* Repo selector */}
            <div className="amb-repo-wrap" onClick={loadRepos}>
              <GitBranch size={12} />
              <select
                className="amb-repo-select"
                value={state.selectedRepo}
                onChange={e => onChange({ ...state, selectedRepo: e.target.value })}
                onClick={loadRepos}
              >
                {!state.selectedRepo && <option value="">— اختر مستودعاً —</option>}
                {repos.map(r => (
                  <option key={r.full_name} value={r.full_name}>
                    {r.name}{r.private ? ' 🔒' : ''}
                  </option>
                ))}
                {!repos.length && state.selectedRepo && (
                  <option value={state.selectedRepo}>{state.selectedRepo}</option>
                )}
              </select>
              {loadingRepos && <Loader2 size={12} className="amb-spin" />}
            </div>

            {/* Auto-confirm toggle */}
            <label className="amb-auto-label" title="تنفيذ مباشر بدون تأكيد">
              <input
                type="checkbox"
                checked={state.autoConfirm}
                onChange={e => onChange({ ...state, autoConfirm: e.target.checked })}
              />
              <span>تنفيذ تلقائي</span>
            </label>

            {/* Commands help */}
            <button
              className={`amb-cmds-btn ${showCmds ? 'amb-cmds-btn--on' : ''}`}
              onClick={() => setShowCmds(v => !v)}
              title="أوامر الوكيل"
            >
              <Terminal size={12} />
              <span>أوامر</span>
            </button>

            {/* Deploy to GitHub Pages */}
            {state.selectedRepo && (
              <button
                className={`amb-deploy-btn ${deployOpen ? 'amb-deploy-btn--on' : ''} ${deploying ? 'amb-deploy-btn--loading' : ''}`}
                onClick={() => { setDeployOpen(v => !v); if (!deployOpen) { setDeployResult(null); setDeploySteps([]); setDeployError('') } }}
                title="نشر على GitHub Pages"
                disabled={deploying}
              >
                {deploying ? <Loader2 size={12} className="amb-spin" /> : <Globe size={12} />}
                <span>{deploying ? 'جاري النشر...' : 'نشر'}</span>
              </button>
            )}

            {/* Expand/collapse */}
            <button className="amb-expand-btn" onClick={() => setExpanded(v => !v)}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </>
        )}

        {/* Status badge */}
        {!state.active && !expanded && (githubUser || state.githubToken) && (
          <span className="amb-status-badge amb-status-badge--idle">
            <Github size={11} /> GitHub مُتصل
          </span>
        )}
      </div>

      {/* ── Commands sheet ── */}
      {state.active && showCmds && (
        <div className="amb-cmds-sheet">
          <div className="amb-cmds-header">
            <Terminal size={13} />
            <span>أوامر الوكيل المتاحة — انقر لإدراج الأمر</span>
            <button onClick={() => setShowCmds(false)}><X size={12} /></button>
          </div>
          <div className="amb-cmds-list">
            {SLASH_COMMANDS.map(c => (
              <div
                key={c.cmd}
                className="amb-cmd-row amb-cmd-row--clickable"
                onClick={() => handleCommandClick(c.example)}
                title={`انقر لإدراج: ${c.example}`}
              >
                <code className="amb-cmd-code">{c.cmd}</code>
                <span className="amb-cmd-desc">{c.desc}</span>
                <code className="amb-cmd-ex">{c.example}</code>
                <span className="amb-cmd-insert-hint">← انقر</span>
              </div>
            ))}
          </div>
          <div className="amb-cmds-tip">
            💡 يمكنك أيضاً الكتابة بالطبيعي — الوكيل يفهم الدارجة والعربية والإنجليزية
          </div>
        </div>
      )}

      {/* ── Deploy Panel ── */}
      {state.active && deployOpen && (
        <div className="amb-deploy-panel">
          <div className="amb-deploy-header">
            <Globe size={14} />
            <span>نشر على GitHub Pages</span>
            {!deploying && (
              <button className="amb-deploy-close" onClick={() => setDeployOpen(false)}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Steps progress */}
          {deploySteps.length > 0 && (
            <div className="amb-deploy-steps">
              {deploySteps.map(s => (
                <div key={s.id} className={`amb-deploy-step ${s.done ? 'amb-deploy-step--done' : 'amb-deploy-step--running'}`}>
                  {s.done
                    ? <span className="amb-deploy-step-icon">✅</span>
                    : <Loader2 size={11} className="amb-spin amb-deploy-step-icon" />}
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Result card */}
          {deployResult && (deployResult.success as boolean) && (
            <div className="amb-deploy-result">
              <div className="amb-deploy-result-title">🎉 تم النشر بنجاح!</div>

              {!!deployResult.siteUrl && (
                <a
                  href={String(deployResult.siteUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="amb-deploy-site-link"
                >
                  <Globe size={12} />
                  <span>{String(deployResult.siteUrl)}</span>
                  <ExternalLink size={11} />
                </a>
              )}

              <div className="amb-deploy-report">
                <div className="amb-deploy-report-row">
                  <span>📦 المستودع</span>
                  <code>{String(deployResult.owner)}/{String(deployResult.repo)}</code>
                </div>
                {!!deployResult.commitSha && (
                  <div className="amb-deploy-report-row">
                    <span>🔖 Commit</span>
                    <code>{String(deployResult.commitSha)}</code>
                  </div>
                )}
                <div className="amb-deploy-report-row">
                  <span>📁 الملفات</span>
                  <code>{String(deployResult.fileCount)} ملف — {String(deployResult.stack)}</code>
                </div>
                <div className="amb-deploy-report-row">
                  <span>🌿 الفرع</span>
                  <code>{String(deployResult.defaultBranch)}</code>
                </div>
                <div className="amb-deploy-report-row">
                  <span>📅 التاريخ</span>
                  <code>{new Date(String(deployResult.deployedAt)).toLocaleString('ar-DZ')}</code>
                </div>
                <div className="amb-deploy-report-row">
                  <span>⚡ الحالة</span>
                  <code className={deployResult.buildOk ? 'amb-deploy-ok' : 'amb-deploy-building'}>
                    {deployResult.buildOk ? '✅ مبني' : '🟡 يتم البناء...'}
                  </code>
                </div>
              </div>

              <div className="amb-deploy-actions">
                <a href={String(deployResult.repoUrl)} target="_blank" rel="noopener noreferrer" className="amb-deploy-action-btn">
                  <Github size={12} /> المستودع
                </a>
                {!!deployResult.siteUrl && (
                  <a href={String(deployResult.siteUrl)} target="_blank" rel="noopener noreferrer" className="amb-deploy-action-btn amb-deploy-action-btn--primary">
                    <Globe size={12} /> فتح الموقع
                  </a>
                )}
                <button className="amb-deploy-action-btn" onClick={runDeploy} disabled={deploying}>
                  <Loader2 size={12} /> إعادة النشر
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {deployError && (
            <div className="amb-error" style={{ margin: '10px 0' }}>
              ❌ {deployError}
              <button className="amb-deploy-retry" onClick={runDeploy}>إعادة المحاولة</button>
            </div>
          )}

          {/* Initial state — ready to deploy */}
          {!deploying && !deployResult && !deployError && deploySteps.length === 0 && (
            <div className="amb-deploy-ready">
              <div className="amb-deploy-ready-repo">
                <GitBranch size={13} />
                <span>{state.selectedRepo}</span>
              </div>
              <p className="amb-deploy-ready-hint">
                سيتم تفعيل GitHub Pages تلقائياً وإعطائك رابط موقعك الحي مباشرةً
              </p>
              <button className="amb-deploy-go-btn" onClick={runDeploy}>
                <Globe size={14} /> ابدأ النشر الآن
              </button>
            </div>
          )}

          {/* Loading indicator */}
          {deploying && deploySteps.length === 0 && (
            <div className="amb-deploy-connecting">
              <Loader2 size={16} className="amb-spin" />
              <span>جاري الاتصال بـ GitHub...</span>
            </div>
          )}
        </div>
      )}

      {/* ── Setup panel (not active + expanded) ── */}
      {expanded && !state.active && !workspaceReady && (
        <div className="amb-setup-panel">
          <div className="amb-setup-title">
            <Github size={14} /> تفعيل وضع الوكيل البرمجي
          </div>

          {githubUser ? (
            <>
              <div className="amb-gh-user">
                <img src={githubUser.avatar} alt="" className="amb-gh-avatar" />
                <span>متصل كـ <strong>@{githubUser.login}</strong></span>
                <CheckCircle2 size={14} className="amb-check" />
                <button className="amb-connect-btn" onClick={connectGitHub} disabled={loadingRepos}>
                  {loadingRepos
                    ? <><Loader2 size={13} className="amb-spin" /> جاري الجلب...</>
                    : <><FolderOpen size={13} /> عرض المستودعات</>
                  }
                </button>
              </div>
            </>
          ) : (
            <div className="amb-oauth-section">
              <a href="/api/auth/github" className="amb-oauth-btn">
                <Github size={14} />
                اتصل بـ GitHub
              </a>
              <p className="amb-oauth-hint">
                انقر للاتصال بحسابك على GitHub وجلب مستوداتك
              </p>
            </div>
          )}

          {repoError && (
            <div className="amb-error">
              <Github size={13} /> {repoError}
            </div>
          )}
        </div>
      )}

      {/* ── Workspace picker (repos fetched, waiting for user to select) ── */}
      {workspaceReady && !state.active && (
        <div className="amb-workspace-panel">
          <div className="amb-workspace-title">
            <GitBranch size={14} />
            <span>اختر مستودع العمل</span>
          </div>

          {/* Tabs */}
          <div className="amb-workspace-tabs">
            <button
              className={`amb-workspace-tab ${workspaceTab === 'select' ? 'amb-workspace-tab--active' : ''}`}
              onClick={() => setWorkspaceTab('select')}
            >
              <FolderOpen size={12} /> مستودع موجود
            </button>
            <button
              className={`amb-workspace-tab ${workspaceTab === 'create' ? 'amb-workspace-tab--active' : ''}`}
              onClick={() => setWorkspaceTab('create')}
            >
              <Plus size={12} /> مستودع جديد
            </button>
          </div>

          {/* Select existing repo */}
          {workspaceTab === 'select' && (
            <div className="amb-workspace-body">
              <div className="amb-workspace-select-wrap">
                <GitBranch size={13} className="amb-workspace-select-icon" />
                <select
                  className="amb-workspace-select"
                  value={selectedWorkspace}
                  onChange={e => setSelectedWorkspace(e.target.value)}
                >
                  {repos.map(r => (
                    <option key={r.full_name} value={r.full_name}>
                      {r.name}{r.private ? ' 🔒' : ''}{r.language ? ` · ${r.language}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <p className="amb-workspace-hint">
                سيحمّل الوكيل ذاكرة المشروع <code>dz-agent.md</code> تلقائياً ويستكمل من حيث توقفت
              </p>
              <button className="amb-workspace-start-btn" onClick={handleSelectWorkspace}>
                <CheckCircle2 size={14} /> بدء العمل
              </button>
            </div>
          )}

          {/* Create new repo */}
          {workspaceTab === 'create' && (
            <div className="amb-workspace-body">
              <div className="amb-workspace-input-wrap">
                <Github size={13} className="amb-workspace-select-icon" />
                <input
                  className="amb-workspace-input"
                  type="text"
                  placeholder="اسم المستودع الجديد (بالإنجليزية)"
                  value={newRepoName}
                  onChange={e => setNewRepoName(e.target.value.replace(/\s+/g, '-').toLowerCase())}
                  onKeyDown={e => e.key === 'Enter' && !creatingRepo && handleCreateWorkspace()}
                  dir="ltr"
                />
              </div>
              <p className="amb-workspace-hint">
                سيُنشئ مستودعاً جديداً مع <code>README.md</code> و<code>dz-agent.md</code> لتتبع كل العمليات
              </p>
              <button
                className="amb-workspace-start-btn"
                onClick={handleCreateWorkspace}
                disabled={creatingRepo || !newRepoName.trim()}
              >
                {creatingRepo
                  ? <><Loader2 size={13} className="amb-spin" /> جاري الإنشاء...</>
                  : <><Plus size={13} /> إنشاء والبدء</>
                }
              </button>
            </div>
          )}

          {repoError && (
            <div className="amb-error" style={{ marginTop: 8 }}>
              <Github size={13} /> {repoError}
            </div>
          )}
        </div>
      )}

      {/* ── Active: repo status bar ── */}
      {state.active && expanded && state.selectedRepo && (
        <div className="amb-active-panel">
          <div className="amb-active-repo">
            <GitBranch size={13} />
            <span>المستودع النشط:</span>
            <strong>{state.selectedRepo}</strong>
            <a
              href={`https://github.com/${state.selectedRepo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="amb-ext-link"
            >
              <Github size={12} />
            </a>
          </div>
          <div className="amb-active-hint">
            الوكيل يعمل على هذا المستودع — كل أمر <code>/edit</code> أو <code>/commit</code> يطلب تأكيدك أولاً
            {state.autoConfirm && ' (التنفيذ التلقائي مُفعَّل ⚡)'}
          </div>
        </div>
      )}
    </div>
  )
}
