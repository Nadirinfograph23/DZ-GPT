import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Github, CheckCircle2, XCircle, Loader2, Clock,
  FileCode, GitBranch, GitPullRequest, FolderOpen,
  FilePlus, Trash2, Zap, User, Eye, Brain,
  AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Copy, Check,
  Globe, Terminal, Sparkles,
} from 'lucide-react'

export interface ReActStep {
  type: 'start' | 'thinking' | 'tool_call' | 'observation' | 'done' | 'error' | 'timeout'
  message?: string
  iteration?: number
  tool?: string
  thought?: string
  args?: Record<string, unknown>
  result?: Record<string, unknown>
  content?: string
  liveUrl?: string
  elapsed_ms?: number
  progress_pct?: number
}

interface Props {
  steps: ReActStep[]
  isLive?: boolean
}

interface Phase {
  id: number
  tool: string
  thought: string
  args: Record<string, unknown>
  label: string
  icon: React.ReactNode
  color: string
  status: 'pending' | 'running' | 'done' | 'failed'
  summary: string
  detail?: string
  resultUrl?: string
  elapsed_ms?: number
}

const TOOL_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  get_auth_user:      { label: 'التحقق من الهوية',    icon: <User size={13} />,          color: '#60a5fa' },
  list_repos:         { label: 'عرض المستودعات',       icon: <FolderOpen size={13} />,    color: '#34d399' },
  create_repo:        { label: 'إنشاء مستودع',         icon: <GitBranch size={13} />,     color: '#a78bfa' },
  list_files:         { label: 'عرض الملفات',          icon: <FolderOpen size={13} />,    color: '#60a5fa' },
  read_file:          { label: 'قراءة ملف',             icon: <FileCode size={13} />,      color: '#fbbf24' },
  push_file:          { label: 'رفع ملف',               icon: <FilePlus size={13} />,      color: '#34d399' },
  push_files_batch:   { label: 'رفع ملفات',            icon: <FilePlus size={13} />,      color: '#34d399' },
  list_branches:      { label: 'عرض الفروع',           icon: <GitBranch size={13} />,     color: '#60a5fa' },
  create_branch:      { label: 'إنشاء فرع',            icon: <GitBranch size={13} />,     color: '#a78bfa' },
  delete_branch:      { label: 'حذف فرع',              icon: <Trash2 size={13} />,        color: '#f87171' },
  create_pull_request:{ label: 'إنشاء Pull Request',   icon: <GitPullRequest size={13} />,color: '#a78bfa' },
  enable_pages:       { label: 'تفعيل GitHub Pages',   icon: <Zap size={13} />,           color: '#fbbf24' },
  get_repo_info:      { label: 'معلومات المستودع',     icon: <Eye size={13} />,           color: '#60a5fa' },
  get_pages_status:   { label: 'فحص GitHub Pages',     icon: <Globe size={13} />,         color: '#34d399' },
}

function fmtMs(ms?: number) {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function getResultSummary(tool: string, result: Record<string, unknown>): { summary: string; url?: string } {
  if (!result) return { summary: '—' }
  if (result.error) return { summary: `❌ ${String(result.error).slice(0, 60)}` }
  switch (tool) {
    case 'get_auth_user':
      return { summary: `@${result.login || '?'} · ${result.public_repos ?? '?'} مستودع` }
    case 'list_repos': {
      const repos = result.repos as Array<{ full_name: string }> | undefined
      const count = result.count ?? repos?.length ?? 0
      const names = repos?.slice(0, 2).map(r => r.full_name.split('/')[1]).join('، ') || ''
      return { summary: `${count} مستودع${names ? ' · ' + names : ''}` }
    }
    case 'create_repo': {
      const url = result.html_url as string | undefined
      return { summary: result.full_name ? String(result.full_name) : 'تم الإنشاء', url }
    }
    case 'list_files': {
      const items = result.items as Array<{ name: string }> | undefined
      const count = result.count ?? items?.length ?? 0
      return { summary: `${count} ملف/مجلد` }
    }
    case 'read_file': {
      const content = result.content as string | undefined
      return { summary: content ? `${content.slice(0, 50)}…` : 'تمت القراءة' }
    }
    case 'push_file':
    case 'push_files_batch': {
      const sha = result.commit as string | undefined
      const count = result.files_pushed as number | undefined
      return { summary: count != null ? `${count} ملف مرفوع` : sha ? `commit: ${String(sha).slice(0, 8)}` : 'تم الرفع' }
    }
    case 'list_branches': {
      const count = result.count ?? (result.branches as unknown[])?.length ?? 0
      return { summary: `${count} فرع` }
    }
    case 'create_branch':
      return { summary: result.branch ? `فرع: ${result.branch}` : 'تم الإنشاء' }
    case 'delete_branch':
      return { summary: 'تم الحذف' }
    case 'create_pull_request': {
      const url = result.html_url as string | undefined
      return { summary: result.title ? String(result.title).slice(0, 50) : 'تم إنشاء PR', url }
    }
    case 'enable_pages': {
      const url = result.html_url as string | undefined
      return { summary: url ? `الموقع: ${url}` : 'تم التفعيل', url }
    }
    case 'get_repo_info': {
      const url = result.html_url as string | undefined
      return { summary: result.full_name ? String(result.full_name) : 'تمت القراءة', url }
    }
    case 'get_pages_status': {
      const status = result.status as string | undefined
      return { summary: status === 'built' ? '✅ مباشر' : status === 'building' ? '⏳ يُبنى' : (status || 'فُحص') }
    }
    default:
      return { summary: JSON.stringify(result).slice(0, 60) }
  }
}

function buildPhases(steps: ReActStep[], isLive: boolean): Phase[] {
  const phases: Phase[] = []
  let phaseId = 0
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (step.type !== 'tool_call') continue
    phaseId++
    const tool = step.tool || ''
    const meta = TOOL_META[tool] || { label: tool, icon: <Brain size={13} />, color: '#9ca3af' }
    const obs = steps[i + 1]?.type === 'observation' ? steps[i + 1] : undefined
    const hasResult = !!obs
    let status: Phase['status'] = 'pending'
    let summary = '...'
    let resultUrl: string | undefined
    if (hasResult) {
      const r = getResultSummary(tool, obs!.result || {})
      summary = r.summary
      resultUrl = r.url
      status = obs!.result?.error ? 'failed' : 'done'
    } else if (isLive) {
      status = 'running'
      summary = 'جاري التنفيذ...'
    }
    phases.push({ id: phaseId, tool, thought: step.thought || '', args: step.args || {}, label: meta.label, icon: meta.icon, color: meta.color, status, summary, resultUrl, elapsed_ms: step.elapsed_ms })
  }
  return phases
}

function PhaseRow({ phase, isLast }: { phase: Phase; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const hasArgs = Object.keys(phase.args).filter(k => k !== 'token' && k !== '_login' && k !== 'content').length > 0
  return (
    <div className={`rp2-phase rp2-phase--${phase.status}`}>
      {!isLast && <div className="rp2-connector" />}
      <div className="rp2-phase-dot" style={{ borderColor: phase.status === 'done' ? '#22c55e' : phase.status === 'failed' ? '#ef4444' : phase.status === 'running' ? phase.color : '#2a2a3a' }}>
        {phase.status === 'done'    && <CheckCircle2 size={10} color="#22c55e" />}
        {phase.status === 'failed'  && <XCircle size={10} color="#ef4444" />}
        {phase.status === 'running' && <Loader2 size={10} color={phase.color} className="rp-spin" />}
        {phase.status === 'pending' && <span className="rp2-phase-num">{phase.id}</span>}
      </div>
      <div className="rp2-phase-body">
        <div className="rp2-phase-row" onClick={() => hasArgs && setExpanded(e => !e)} style={{ cursor: hasArgs ? 'pointer' : 'default' }}>
          <span style={{ color: phase.color }}>{phase.icon}</span>
          <span className="rp2-phase-label" style={{ color: phase.status === 'pending' ? '#4b5563' : '#e2e8f0' }}>{phase.label}</span>
          <span className="rp2-phase-sum" style={{ color: phase.status === 'failed' ? '#f87171' : phase.status === 'done' ? '#6ee7b7' : '#6b7280' }}>{phase.summary}</span>
          {phase.elapsed_ms && <span className="rp2-phase-time">{fmtMs(phase.elapsed_ms)}</span>}
          {phase.resultUrl && (
            <a href={phase.resultUrl} target="_blank" rel="noopener noreferrer" className="rp2-phase-link" onClick={e => e.stopPropagation()}>
              <ExternalLink size={9} />
            </a>
          )}
          {hasArgs && <button className="rp2-expand-btn">{expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}</button>}
        </div>
        {phase.thought && <div className="rp2-thought">"{phase.thought.slice(0, 120)}"</div>}
        {expanded && hasArgs && (
          <div className="rp2-args">
            {Object.entries(phase.args).filter(([k]) => k !== 'token' && k !== '_login' && k !== 'content').map(([k, v]) => (
              <div key={k} className="rp2-arg-row">
                <span className="rp2-arg-key">{k}:</span>
                <span className="rp2-arg-val">{typeof v === 'string' ? v.slice(0, 100) : JSON.stringify(v).slice(0, 100)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface SiteInfo { repo: string | null; hasHtml: boolean; htmlContent: string | null }
function extractSiteInfo(steps: ReActStep[]): SiteInfo {
  let repo: string | null = null, hasHtml = false, htmlContent: string | null = null
  for (const s of steps) {
    if (s.type === 'observation' && s.result) {
      if (typeof s.result.full_name === 'string') repo = s.result.full_name
      if (typeof s.result.repo === 'string') repo = s.result.repo
    }
    if (s.type === 'tool_call' && s.args) {
      const args = s.args as Record<string, unknown>
      if (typeof args.repo === 'string') repo = args.repo
      if (s.tool === 'push_file') {
        const p = String(args.path || '')
        if (p.includes('.html')) { hasHtml = true; if (typeof args.content === 'string') htmlContent = args.content }
      }
      if (s.tool === 'push_files_batch' && Array.isArray(args.files)) {
        const f = (args.files as Array<{ path?: string; content?: string }>).find(f => String(f.path || '').includes('.html'))
        if (f) { hasHtml = true; if (typeof f.content === 'string') htmlContent = f.content }
      }
    }
  }
  return { repo, hasHtml, htmlContent }
}

function extractLiveUrl(steps: ReActStep[]): string | null {
  const doneWithUrl = steps.find(s => s.type === 'done' && s.liveUrl)
  if (doneWithUrl?.liveUrl) return doneWithUrl.liveUrl
  for (const s of steps) {
    if (s.type === 'observation' && s.result) {
      const url = s.result.html_url as string | undefined
      if (url && url.includes('.github.io')) return url
      const su = (s.result.site_url || s.result.pagesUrl) as string | undefined
      if (su) return su
    }
  }
  const repoObs = steps.find(s => s.type === 'observation' && s.result?.full_name)
  const hasIndex = steps.some(s => s.type === 'observation' && (String(s.result?.path || s.result?.file || '').includes('index.html') || String(s.result?.files || '').includes('index.html')))
  if (repoObs && hasIndex) {
    const full = String(repoObs.result!.full_name)
    const [owner, repo] = full.split('/')
    if (owner && repo) return `https://${owner}.github.io/${repo}`
  }
  return null
}

// ── Current active tool label (for minimal loading bar) ───────────────────────
function getCurrentAction(steps: ReActStep[]): string {
  const lastTool = [...steps].reverse().find(s => s.type === 'tool_call')
  const lastThink = [...steps].reverse().find(s => s.type === 'thinking')
  if (lastTool) return TOOL_META[lastTool.tool || '']?.label || lastTool.tool || 'تنفيذ'
  if (lastThink) return lastThink.message || 'تحليل الطلب...'
  return 'الاتصال بـ GitHub...'
}

function getProgress(steps: ReActStep[]): number {
  const last = [...steps].reverse().find(s => s.progress_pct != null)
  if (last?.progress_pct != null) return last.progress_pct
  const tools = steps.filter(s => s.type === 'tool_call').length
  return Math.min(15 + tools * 15, 85)
}

export default function GitHubReActPanel({ steps, isLive = false }: Props) {
  const [showPhases, setShowPhases]   = useState(false)
  const [showReport, setShowReport]   = useState(false)
  const [copied, setCopied]           = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null)
  const [pagesStatus, setPagesStatus] = useState<'idle' | 'enabling' | 'building' | 'live' | 'error'>('idle')
  const [pagesUrl, setPagesUrl]       = useState<string | null>(null)
  const [elapsed, setElapsed]         = useState(0)
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef  = useRef<number>(Date.now())

  // Elapsed timer while live
  useEffect(() => {
    if (isLive && !timerRef.current) {
      startRef.current = Date.now()
      timerRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 200)
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  }, [isLive])

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const copyLink = useCallback((url: string) => {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }, [])

  const siteInfo = extractSiteInfo(steps)
  useEffect(() => {
    if (!siteInfo.htmlContent) { setPreviewUrl(null); return }
    const blob = new Blob([siteInfo.htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [siteInfo.htmlContent])

  const pollPagesStatus = useCallback((repo: string, fallbackUrl: string) => {
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const r = await fetch(`/api/dz-agent/github/react/pages-status?repo=${encodeURIComponent(repo)}`)
        const d = await r.json()
        if (d.status === 'built' || (d.enabled && d.html_url)) {
          setPagesStatus('live'); setPagesUrl(d.html_url || fallbackUrl)
          clearInterval(pollRef.current!); pollRef.current = null
        }
      } catch { /* ignore */ }
      if (attempts >= 18) { setPagesStatus('live'); setPagesUrl(fallbackUrl); clearInterval(pollRef.current!); pollRef.current = null }
    }, 10_000)
  }, [])

  const enablePages = useCallback(async () => {
    if (!siteInfo.repo) return
    setPagesStatus('enabling')
    try {
      const r = await fetch('/api/dz-agent/github/react/enable-pages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: siteInfo.repo }) })
      const d = await r.json()
      if (d.error) { setPagesStatus('error'); return }
      const url = d.html_url || `https://${siteInfo.repo.split('/')[0]}.github.io/${siteInfo.repo.split('/')[1]}/`
      setPagesUrl(url); setPagesStatus('building'); pollPagesStatus(siteInfo.repo, url)
    } catch { setPagesStatus('error') }
  }, [siteInfo.repo, pollPagesStatus])

  const startStep  = steps.find(s => s.type === 'start')
  const doneStep   = steps.find(s => s.type === 'done')
  const errorStep  = steps.find(s => s.type === 'error' || s.type === 'timeout')
  const isComplete = !!doneStep
  const isFailed   = !!errorStep && !isComplete
  const phases     = buildPhases(steps, isLive)
  const liveUrl    = isComplete ? extractLiveUrl(steps) : null
  const ghUser     = startStep?.message?.match(/@([\w-]+)/)?.[1]
  const doneCount  = phases.filter(p => p.status === 'done').length
  const failCount  = phases.filter(p => p.status === 'failed').length
  const currentAction = getCurrentAction(steps)
  const progress = isLive && !isComplete ? getProgress(steps) : isComplete ? 100 : 0

  if (!steps || steps.length === 0) return null

  return (
    <div className={`rp2-panel ${isLive && !isComplete ? 'rp2-panel--live' : ''} ${isComplete ? 'rp2-panel--done' : ''} ${isFailed ? 'rp2-panel--failed' : ''}`}>

      {/* ── LIVE: Minimal command bar ─────────────────────────────────────────── */}
      {isLive && !isComplete && !isFailed && (
        <div className="rp2-live-bar">
          <div className="rp2-live-bar-top">
            <div className="rp2-live-indicator">
              <span className="rp2-live-dot" />
              <Github size={12} style={{ color: '#86efac' }} />
              <span className="rp2-live-title">DZ Agent يعمل</span>
              {ghUser && <span className="rp2-live-user">@{ghUser}</span>}
            </div>
            <div className="rp2-live-meta">
              <span className="rp2-live-time">
                <Clock size={9} /> {(elapsed / 1000).toFixed(1)}s
              </span>
              {phases.length > 0 && (
                <span className="rp2-live-steps">{doneCount}/{doneCount + 1} خطوة</span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="rp2-progress-track">
            <div className="rp2-progress-fill" style={{ width: `${progress}%` }} />
            <div className="rp2-progress-glow" style={{ left: `${progress}%` }} />
          </div>

          {/* Current action */}
          <div className="rp2-current-action">
            <Terminal size={10} style={{ color: '#60a5fa', flexShrink: 0 }} />
            <span className="rp2-current-label">{currentAction}</span>
            <span className="rp2-dots"><span /><span /><span /></span>
          </div>

          {/* Phases toggle — hidden by default while running */}
          {phases.length > 0 && (
            <button className="rp2-toggle-phases-btn" onClick={() => setShowPhases(v => !v)}>
              {showPhases ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {showPhases ? 'إخفاء التفاصيل' : `عرض التفاصيل (${phases.length} خطوة)`}
            </button>
          )}

          {/* Collapsible phases during live */}
          {showPhases && phases.length > 0 && (
            <div className="rp2-phases-list">
              {phases.map((phase, idx) => <PhaseRow key={phase.id} phase={phase} isLast={idx === phases.length - 1} />)}
            </div>
          )}
        </div>
      )}

      {/* ── DONE: Compact result card ─────────────────────────────────────────── */}
      {isComplete && (
        <div className="rp2-done-card">
          <div className="rp2-done-header">
            <div className="rp2-done-status">
              <div className="rp2-done-icon">
                <Sparkles size={14} color="#22c55e" />
              </div>
              <div>
                <div className="rp2-done-title">اكتملت المهمة بنجاح</div>
                <div className="rp2-done-meta">
                  {ghUser && <span>@{ghUser}</span>}
                  <span className="rp2-done-sep">·</span>
                  <span>{doneCount} خطوة</span>
                  {failCount > 0 && <><span className="rp2-done-sep">·</span><span style={{ color: '#f87171' }}>{failCount} فشلت</span></>}
                  <span className="rp2-done-sep">·</span>
                  <span>{(elapsed / 1000).toFixed(1) !== '0.0' ? `${(elapsed / 1000).toFixed(1)}s` : fmtMs(steps.find(s => s.elapsed_ms)?.elapsed_ms)}</span>
                </div>
              </div>
            </div>
            {/* Phases toggle button */}
            <button className="rp2-toggle-phases-btn rp2-toggle-phases-btn--done" onClick={() => setShowPhases(v => !v)}>
              <Terminal size={10} />
              {showPhases ? 'إخفاء السجل' : `السجل (${phases.length})`}
              {showPhases ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
            </button>
          </div>

          {/* Collapsible phases after done */}
          {showPhases && (
            <div className="rp2-phases-list rp2-phases-list--in-done">
              {phases.map((phase, idx) => <PhaseRow key={phase.id} phase={phase} isLast={idx === phases.length - 1} />)}
            </div>
          )}
        </div>
      )}

      {/* ── FAILED ───────────────────────────────────────────────────────────── */}
      {isFailed && (
        <div className="rp2-failed-bar">
          <AlertTriangle size={12} color="#f87171" />
          <span>{errorStep?.message || 'فشل التنفيذ'}</span>
          {phases.length > 0 && (
            <button className="rp2-toggle-phases-btn" onClick={() => setShowPhases(v => !v)}>
              {showPhases ? 'إخفاء' : `عرض السجل (${phases.length})`}
            </button>
          )}
        </div>
      )}
      {isFailed && showPhases && (
        <div className="rp2-phases-list">
          {phases.map((phase, idx) => <PhaseRow key={phase.id} phase={phase} isLast={idx === phases.length - 1} />)}
        </div>
      )}

      {/* ── Preview Section ───────────────────────────────────────────────────── */}
      {isComplete && siteInfo.hasHtml && (
        <div className="rp-preview-section">
          <button className="rp-preview-toggle" onClick={() => setShowPreview(v => !v)}>
            <Eye size={11} />
            <span>{showPreview ? 'إخفاء المعاينة' : '👁 معاينة الموقع'}</span>
            {showPreview ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
          {showPreview && previewUrl && (
            <div className="rp-preview-frame-wrap">
              <div className="rp-preview-device-bar">
                <span className="rp-preview-dot" style={{ background: '#ff5f57' }} />
                <span className="rp-preview-dot" style={{ background: '#febc2e' }} />
                <span className="rp-preview-dot" style={{ background: '#28c840' }} />
                <span className="rp-preview-addr">{siteInfo.repo ? `${siteInfo.repo}` : 'معاينة محلية'}</span>
              </div>
              <iframe src={previewUrl} className="rp-preview-frame" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title="معاينة الموقع" />
            </div>
          )}
          {showPreview && !previewUrl && <div className="rp-preview-loading"><Loader2 size={13} className="rp-spin" /> جارٍ تحميل المعاينة...</div>}
        </div>
      )}

      {/* ── GitHub Pages Publish ──────────────────────────────────────────────── */}
      {isComplete && siteInfo.hasHtml && !liveUrl && pagesStatus !== 'live' && (
        <div className="rp-pages-publish">
          <div className="rp-pages-header"><Globe size={11} /><span className="rp-pages-title">نشر على GitHub Pages</span></div>
          {pagesStatus === 'idle' && (
            <button className="rp-pages-btn" onClick={enablePages} disabled={!siteInfo.repo} title={siteInfo.repo ? `نشر ${siteInfo.repo}` : 'لا يوجد مستودع'}>
              <Zap size={12} /> نشر الموقع مجاناً على GitHub Pages
            </button>
          )}
          {pagesStatus === 'enabling' && <div className="rp-pages-status rp-pages-status--building"><Loader2 size={11} className="rp-spin" /> جارٍ تفعيل GitHub Pages...</div>}
          {pagesStatus === 'building' && (
            <div className="rp-pages-status rp-pages-status--building">
              <Loader2 size={11} className="rp-spin" /> يتم بناء الموقع... قد يستغرق 1–2 دقيقة
              {pagesUrl && <a href={pagesUrl} target="_blank" rel="noopener noreferrer" className="rp-pages-preview-link">{pagesUrl}</a>}
            </div>
          )}
          {pagesStatus === 'error' && (
            <div className="rp-pages-status rp-pages-status--error">
              <XCircle size={11} /> فشل التفعيل — تأكد أن المستودع عام
              <button className="rp-pages-retry" onClick={() => setPagesStatus('idle')}>إعادة المحاولة</button>
            </div>
          )}
        </div>
      )}

      {/* ── Pages Live (manual enable) ────────────────────────────────────────── */}
      {pagesStatus === 'live' && pagesUrl && (
        <div className="rp-live-site rp-live-site--pages">
          <div className="rp-live-site-row">
            <a href={pagesUrl} target="_blank" rel="noopener noreferrer" className="rp-live-site-btn">
              <span className="rp-live-site-icon">🚀</span>
              <div className="rp-live-site-text">
                <span className="rp-live-site-label">موقعك مباشر على GitHub Pages</span>
                <span className="rp-live-site-url">{pagesUrl}</span>
              </div>
              <ExternalLink size={13} className="rp-live-site-arrow" />
            </a>
            <button className={`rp-copy-btn ${copied ? 'rp-copy-btn--done' : ''}`} onClick={() => copyLink(pagesUrl)} title="نسخ الرابط">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'تم النسخ!' : 'نسخ'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Auto-enabled Live Site ────────────────────────────────────────────── */}
      {isComplete && liveUrl && pagesStatus !== 'live' && (
        <div className="rp-live-site">
          <div className="rp-live-site-row">
            <a href={liveUrl} target="_blank" rel="noopener noreferrer" className="rp-live-site-btn">
              <span className="rp-live-site-icon">🌐</span>
              <div className="rp-live-site-text">
                <span className="rp-live-site-label">الموقع المباشر</span>
                <span className="rp-live-site-url">{liveUrl}</span>
              </div>
              <ExternalLink size={13} className="rp-live-site-arrow" />
            </a>
            <button className={`rp-copy-btn ${copied ? 'rp-copy-btn--done' : ''}`} onClick={() => copyLink(liveUrl!)} title="نسخ الرابط">
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'تم النسخ!' : 'نسخ'}</span>
            </button>
          </div>
          <p className="rp-live-site-note">⏱ قد يستغرق تفعيل الموقع 1–2 دقيقة بعد أول نشر</p>
        </div>
      )}

      {/* ── Final Report ──────────────────────────────────────────────────────── */}
      {isComplete && doneStep?.content && (
        <div className="rp-report">
          <button className="rp-report-toggle" onClick={() => setShowReport(r => !r)}>
            <span className="rp-report-toggle-label"><CheckCircle2 size={12} color="#22c55e" />التقرير النهائي</span>
            {showReport ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showReport && <div className="rp-report-body">{doneStep.content}</div>}
        </div>
      )}
    </div>
  )
}
