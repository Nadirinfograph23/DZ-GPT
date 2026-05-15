import { useEffect, useState, useCallback } from 'react'
import {
  Github, CheckCircle2, XCircle, Loader2, Clock,
  FileCode, GitBranch, GitPullRequest, FolderOpen,
  FilePlus, Trash2, Zap, User, Eye, Brain,
  AlertTriangle, ChevronDown, ChevronUp, ExternalLink, Copy, Check,
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
}

interface Props {
  steps: ReActStep[]
  isLive?: boolean
}

// ── Phase derived from a tool_call + its observation ─────────────────────────
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
}

const TOOL_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  get_auth_user:      { label: 'التحقق من الهوية',    icon: <User size={14} />,          color: '#60a5fa' },
  list_repos:         { label: 'عرض المستودعات',       icon: <FolderOpen size={14} />,    color: '#34d399' },
  create_repo:        { label: 'إنشاء مستودع',         icon: <GitBranch size={14} />,     color: '#a78bfa' },
  list_files:         { label: 'عرض الملفات',          icon: <FolderOpen size={14} />,    color: '#60a5fa' },
  read_file:          { label: 'قراءة ملف',             icon: <FileCode size={14} />,      color: '#fbbf24' },
  push_file:          { label: 'رفع ملف',               icon: <FilePlus size={14} />,      color: '#34d399' },
  push_files_batch:   { label: 'رفع ملفات (دفعة)',     icon: <FilePlus size={14} />,      color: '#34d399' },
  list_branches:      { label: 'عرض الفروع',           icon: <GitBranch size={14} />,     color: '#60a5fa' },
  create_branch:      { label: 'إنشاء فرع',            icon: <GitBranch size={14} />,     color: '#a78bfa' },
  delete_branch:      { label: 'حذف فرع',              icon: <Trash2 size={14} />,        color: '#f87171' },
  create_pull_request:{ label: 'إنشاء Pull Request',   icon: <GitPullRequest size={14} />,color: '#a78bfa' },
  enable_pages:       { label: 'تفعيل GitHub Pages',   icon: <Zap size={14} />,           color: '#fbbf24' },
  get_repo_info:      { label: 'معلومات المستودع',     icon: <Eye size={14} />,           color: '#60a5fa' },
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
      const names = repos?.slice(0, 3).map(r => r.full_name.split('/')[1]).join('، ') || ''
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
      return {
        summary: count != null ? `${count} ملف مرفوع` : sha ? `commit: ${String(sha).slice(0, 8)}` : 'تم الرفع',
      }
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
    const meta = TOOL_META[tool] || { label: tool, icon: <Brain size={14} />, color: '#9ca3af' }

    // Look for the next observation
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

    phases.push({
      id: phaseId,
      tool,
      thought: step.thought || '',
      args: step.args || {},
      label: meta.label,
      icon: meta.icon,
      color: meta.color,
      status,
      summary,
      resultUrl,
    })
  }

  return phases
}

function PhaseCard({ phase, isLast }: { phase: Phase; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const hasArgs = Object.keys(phase.args).filter(k => k !== 'token' && k !== '_login' && k !== 'content').length > 0

  return (
    <div className={`rp-phase rp-phase--${phase.status}`}>
      {/* Connector line */}
      {!isLast && <div className="rp-connector" />}

      {/* Status dot */}
      <div className="rp-phase-dot" style={{ borderColor: phase.status === 'done' ? '#22c55e' : phase.status === 'failed' ? '#ef4444' : phase.status === 'running' ? phase.color : '#2a2a2a' }}>
        {phase.status === 'done'    && <CheckCircle2 size={11} color="#22c55e" />}
        {phase.status === 'failed'  && <XCircle size={11} color="#ef4444" />}
        {phase.status === 'running' && <Loader2 size={11} color={phase.color} className="rp-spin" />}
        {phase.status === 'pending' && <span className="rp-phase-num">{phase.id}</span>}
      </div>

      {/* Content */}
      <div className="rp-phase-content">
        <div className="rp-phase-header" onClick={() => hasArgs && setExpanded(e => !e)}>
          <span className="rp-phase-icon" style={{ color: phase.color }}>{phase.icon}</span>
          <span className="rp-phase-label" style={{ color: phase.status === 'pending' ? '#4b5563' : '#e5e7eb' }}>
            {phase.label}
          </span>
          {phase.status === 'running' && (
            <span className="rp-phase-badge rp-phase-badge--running">يعمل</span>
          )}
          {phase.status === 'failed' && (
            <span className="rp-phase-badge rp-phase-badge--failed">فشل</span>
          )}
          <div className="rp-phase-summary" style={{
            color: phase.status === 'failed' ? '#f87171'
              : phase.status === 'done' ? '#6ee7b7'
              : '#4b5563',
          }}>
            {phase.summary}
          </div>
          {phase.resultUrl && (
            <a href={phase.resultUrl} target="_blank" rel="noopener noreferrer" className="rp-phase-link" onClick={e => e.stopPropagation()}>
              <ExternalLink size={10} />
            </a>
          )}
          {hasArgs && (
            <button className="rp-expand-btn" onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}>
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          )}
        </div>

        {/* Thought */}
        {phase.thought && (
          <div className="rp-phase-thought">"{phase.thought.slice(0, 100)}"</div>
        )}

        {/* Args detail (expandable) */}
        {expanded && hasArgs && (
          <div className="rp-phase-args">
            {Object.entries(phase.args)
              .filter(([k]) => k !== 'token' && k !== '_login' && k !== 'content')
              .map(([k, v]) => (
                <div key={k} className="rp-arg-row">
                  <span className="rp-arg-key">{k}:</span>
                  <span className="rp-arg-val">
                    {typeof v === 'string' ? v.slice(0, 80) : JSON.stringify(v).slice(0, 80)}
                  </span>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  )
}

/** Scan all steps to extract the first live site URL */
function extractLiveUrl(steps: ReActStep[]): string | null {
  // 1. Explicit liveUrl on a done step (injected by DZChatBox from server)
  const doneWithUrl = steps.find(s => s.type === 'done' && s.liveUrl)
  if (doneWithUrl?.liveUrl) return doneWithUrl.liveUrl

  // 2. enable_pages observation with html_url
  for (const s of steps) {
    if (s.type === 'observation' && s.result) {
      const url = s.result.html_url as string | undefined
      if (url && url.includes('.github.io')) return url
      const su = (s.result.site_url || s.result.pagesUrl) as string | undefined
      if (su) return su
    }
  }

  // 3. Infer from create_repo full_name + index.html push
  const repoObs = steps.find(s => s.type === 'observation' && s.result?.full_name)
  const hasIndex = steps.some(s =>
    s.type === 'observation' && (
      String(s.result?.path || s.result?.file || '').includes('index.html') ||
      String(s.result?.files || '').includes('index.html')
    )
  )
  if (repoObs && hasIndex) {
    const full = String(repoObs.result!.full_name)
    const [owner, repo] = full.split('/')
    if (owner && repo) return `https://${owner}.github.io/${repo}`
  }
  return null
}

export default function GitHubReActPanel({ steps, isLive = false }: Props) {
  const [showReport, setShowReport] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyLink = useCallback((url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

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

  // Auto-open report when done
  useEffect(() => {
    if (isComplete && doneStep?.content) setShowReport(true)
  }, [isComplete, doneStep])

  if (!steps || steps.length === 0) return null

  return (
    <div className={`rp-panel ${isLive ? 'rp-panel--live' : ''} ${isComplete ? 'rp-panel--done' : ''} ${isFailed ? 'rp-panel--failed' : ''}`}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="rp-header">
        <div className="rp-header-left">
          <Github size={13} />
          <span className="rp-header-title">Dz Agent 🇩🇿</span>
          {ghUser && <span className="rp-header-user">@{ghUser}</span>}
        </div>
        <div className="rp-header-right">
          {isLive && !isComplete && !isFailed && (
            <span className="rp-badge rp-badge--live">
              <Loader2 size={9} className="rp-spin" /> يعمل
            </span>
          )}
          {isComplete && (
            <span className="rp-badge rp-badge--done">
              <CheckCircle2 size={9} /> اكتمل
            </span>
          )}
          {isFailed && (
            <span className="rp-badge rp-badge--failed">
              <AlertTriangle size={9} /> فشل
            </span>
          )}
          {phases.length > 0 && (
            <span className="rp-badge rp-badge--count">
              <Clock size={9} />
              {doneCount}/{phases.length} مرحلة
            </span>
          )}
        </div>
      </div>

      {/* ── Phases Pipeline ──────────────────────────────────────────────────── */}
      {phases.length > 0 ? (
        <div className="rp-pipeline">
          <div className="rp-pipeline-title">المراحل</div>
          <div className="rp-phases-list">
            {phases.map((phase, idx) => (
              <PhaseCard key={phase.id} phase={phase} isLast={idx === phases.length - 1} />
            ))}
            {/* Running indicator when live but no tool calls yet */}
            {isLive && !isComplete && phases.length === 0 && (
              <div className="rp-phase rp-phase--running">
                <div className="rp-phase-dot" style={{ borderColor: '#60a5fa' }}>
                  <Loader2 size={11} color="#60a5fa" className="rp-spin" />
                </div>
                <div className="rp-phase-content">
                  <div className="rp-phase-header">
                    <span className="rp-phase-label">يحلّل الطلب...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : isLive && !isComplete ? (
        <div className="rp-pipeline">
          <div className="rp-phase rp-phase--running">
            <div className="rp-phase-dot" style={{ borderColor: '#60a5fa' }}>
              <Loader2 size={11} color="#60a5fa" className="rp-spin" />
            </div>
            <div className="rp-phase-content">
              <div className="rp-phase-header">
                <span className="rp-phase-label" style={{ color: '#60a5fa' }}>يحلّل الطلب ويعدّ الأدوات...</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Stats Bar ───────────────────────────────────────────────────────── */}
      {phases.length > 0 && (
        <div className="rp-stats">
          <span className="rp-stat rp-stat--done">
            <CheckCircle2 size={10} /> {doneCount} نجحت
          </span>
          {failCount > 0 && (
            <span className="rp-stat rp-stat--failed">
              <XCircle size={10} /> {failCount} فشلت
            </span>
          )}
          <span className="rp-stat rp-stat--total">
            {phases.length} مرحلة
          </span>
        </div>
      )}

      {/* ── Live Site Button ─────────────────────────────────────────────────── */}
      {isComplete && liveUrl && (
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
            <button
              className={`rp-copy-btn ${copied ? 'rp-copy-btn--done' : ''}`}
              onClick={() => copyLink(liveUrl!)}
              title="نسخ الرابط"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'تم النسخ!' : 'نسخ'}</span>
            </button>
          </div>
          <p className="rp-live-site-note">⏱ قد يستغرق تفعيل الموقع 1–2 دقيقة بعد أول نشر</p>
        </div>
      )}

      {/* ── Final Report ─────────────────────────────────────────────────────── */}
      {isComplete && doneStep?.content && (
        <div className="rp-report">
          <button className="rp-report-toggle" onClick={() => setShowReport(r => !r)}>
            <span className="rp-report-toggle-label">
              <CheckCircle2 size={12} color="#22c55e" />
              التقرير النهائي
            </span>
            {showReport ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showReport && (
            <div className="rp-report-body">
              {doneStep.content}
            </div>
          )}
        </div>
      )}

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {isFailed && errorStep?.message && (
        <div className="rp-error-row">
          <AlertTriangle size={11} color="#f87171" />
          <span>{errorStep.message}</span>
        </div>
      )}
    </div>
  )
}
