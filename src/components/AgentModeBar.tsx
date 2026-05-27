import { useState, useCallback } from 'react'
import { Code2, Github, ChevronDown, ChevronUp, Terminal, GitBranch, CheckCircle2, Loader2, X } from 'lucide-react'
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
}

const SLASH_COMMANDS = [
  { cmd: '/read',    desc: 'اقرأ محتوى ملف',           example: '/read src/App.tsx' },
  { cmd: '/edit',    desc: 'عدّل ملف (يطلب تأكيد)',     example: '/edit server.js أضف route جديد' },
  { cmd: '/commit',  desc: 'احفظ التغييرات مع رسالة',  example: '/commit "fix: إصلاح bug الطقس"' },
  { cmd: '/diff',    desc: 'اعرض الفرق بين نسختين',    example: '/diff main..feature' },
  { cmd: '/pr',      desc: 'أنشئ Pull Request',         example: '/pr "feat: dark mode"' },
  { cmd: '/ls',      desc: 'اعرض ملفات المستودع',       example: '/ls src/' },
  { cmd: '/scan',    desc: 'افحص الكود عن أخطاء',       example: '/scan' },
  { cmd: '/suggest', desc: 'اقترح تحسينات',             example: '/suggest' },
  { cmd: '/deploy',  desc: 'انشر على GitHub Pages',     example: '/deploy' },
]

export default function AgentModeBar({ state, onChange, githubUser }: AgentModeBarProps) {
  const [expanded, setExpanded]   = useState(false)
  const [repos, setRepos]         = useState<Repo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoError, setRepoError] = useState('')
  const [showCmds, setShowCmds]   = useState(false)

  const toggle = useCallback(() => {
    if (!state.active && !state.githubToken) {
      setExpanded(true)
      onChange({ ...state, active: false })
      return
    }
    onChange({ ...state, active: !state.active })
    if (!state.active) setExpanded(true)
  }, [state, onChange])

  const connectGitHub = useCallback(async () => {
    setLoadingRepos(true)
    setRepoError('')
    try {
      const rr = await fetch('https://api.github.com/user/repos?sort=updated&per_page=20', {
        headers: { Authorization: `token ${state.githubToken}`, 'User-Agent': 'DZ-GPT/1.0' },
      })
      const repoData: Repo[] = await rr.json()
      setRepos(Array.isArray(repoData) ? repoData : [])
      onChange({ ...state, active: true, selectedRepo: repoData[0]?.full_name || '' })
    } catch (e) {
      setRepoError((e as Error).message)
    } finally {
      setLoadingRepos(false)
    }
  }, [state, onChange])

  const loadRepos = useCallback(async () => {
    if (!state.githubToken || repos.length) return
    setLoadingRepos(true)
    try {
      const rr = await fetch('https://api.github.com/user/repos?sort=updated&per_page=20', {
        headers: { Authorization: `token ${state.githubToken}`, 'User-Agent': 'DZ-GPT/1.0' },
      })
      const data: Repo[] = await rr.json()
      setRepos(Array.isArray(data) ? data : [])
    } catch {}
    finally { setLoadingRepos(false) }
  }, [state.githubToken, repos.length])

  return (
    <div className={`amb-wrap ${state.active ? 'amb-wrap--active' : ''}`}>
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

            {/* Expand/collapse */}
            <button className="amb-expand-btn" onClick={() => setExpanded(v => !v)}>
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </>
        )}

        {/* Status badge */}
        {!state.active && state.githubToken && (
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
            <span>أوامر الوكيل المتاحة</span>
            <button onClick={() => setShowCmds(false)}><X size={12} /></button>
          </div>
          <div className="amb-cmds-list">
            {SLASH_COMMANDS.map(c => (
              <div key={c.cmd} className="amb-cmd-row">
                <code className="amb-cmd-code">{c.cmd}</code>
                <span className="amb-cmd-desc">{c.desc}</span>
                <code className="amb-cmd-ex">{c.example}</code>
              </div>
            ))}
          </div>
          <div className="amb-cmds-tip">
            💡 يمكنك أيضاً الكتابة بالطبيعي — الوكيل يفهم الدارجة والعربية والإنجليزية
          </div>
        </div>
      )}

      {/* ── Expanded panel (token + repo setup) ── */}
      {expanded && !state.active && (
        <div className="amb-setup-panel">
          <div className="amb-setup-title">
            <Github size={14} /> تفعيل وضع الوكيل البرمجي
          </div>

          {githubUser ? (
            <div className="amb-gh-user">
              <img src={githubUser.avatar} alt="" className="amb-gh-avatar" />
              <span>متصل كـ <strong>@{githubUser.login}</strong></span>
              <CheckCircle2 size={14} className="amb-check" />
              <button className="amb-connect-btn" onClick={connectGitHub} disabled={loadingRepos}>
                {loadingRepos ? <Loader2 size={13} className="amb-spin" /> : null}
                تحميل المستودعات
              </button>
            </div>
          ) : (
            <div className="amb-oauth-section">
              <a href="/api/auth/github" className="amb-oauth-btn">
                <Github size={14} />
                اتصل بـ GitHub
              </a>
              <p className="amb-oauth-hint">
                😉 عاود أخرج من GitHub الفوق، دير تسجيل خروج و عاود دير تسجيل دخول
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
