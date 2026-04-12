import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Bot, Copy, Check, RotateCcw, Sparkles, Github,
  FolderOpen, FileText, ChevronRight, ChevronDown, AlertCircle,
  CheckCircle2, XCircle, GitCommit, GitPullRequest,
  Key, Trash2, RefreshCw, Terminal, Zap,
  ShieldAlert, Bug, Gauge, Lightbulb, GitBranch, ScanSearch, Wrench, Info,
  BookOpen, Pencil, Star, Activity, GitMerge, Search, Lock,
  BarChart2, Users, ExternalLink, MessageSquare, Tag, Clock,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import DZDashboard from './DZDashboard'

// ===== TYPES =====
type RichType =
  | 'text'
  | 'repos'
  | 'files'
  | 'file-content'
  | 'approval'
  | 'action-log'
  | 'code-analysis'
  | 'repo-selected'
  | 'branches'
  | 'issues'
  | 'pulls'
  | 'stats'

type CodeActionType = 'fix_code' | 'explain_error' | 'improve_code' | 'apply_repo_fix' | 'rescan_repo'

type ThinkingStepType = 'read' | 'analyze' | 'write' | 'scan' | 'list' | 'search' | 'commit' | 'pr'

interface ThinkingStep {
  type: ThinkingStepType
  label: string
}

interface BranchItem {
  name: string
  protected: boolean
  sha: string
}

interface IssueItem {
  number: number
  title: string
  state: string
  user: string
  labels: string[]
  created_at: string
  updated_at: string
  html_url: string
  comments: number
}

interface PullItem {
  number: number
  title: string
  state: string
  user: string
  head: string
  base: string
  created_at: string
  updated_at: string
  html_url: string
  draft: boolean
}

interface RepoStats {
  name: string
  stars: number
  forks: number
  watchers: number
  open_issues: number
  size: number
  language: string
  languages: Record<string, number>
  contributors: { login: string; contributions: number }[]
  created_at: string
  updated_at: string
  default_branch: string
}

interface CodeIssue {
  id: string
  line: number | null
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: string
  issue: string
  root_cause: string
  fix: string
  fix_code: string | null
  actions: CodeActionType[]
}

interface CodeImprovement {
  id: string
  title: string
  description: string
  actions: CodeActionType[]
}

interface CodeAnalysisData {
  summary: string
  language: string
  lines: number
  score: number
  issues: CodeIssue[]
  improvements: CodeImprovement[]
  test_suggestions: string[]
  has_repo: boolean
}

interface RepoItem {
  name: string
  full_name: string
  description: string | null
  language: string | null
  private: boolean
  default_branch: string
  html_url: string
}

interface FileItem {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
}

interface PendingAction {
  type: 'commit' | 'pr'
  repo: string
  path?: string
  content?: string
  message?: string
  branch?: string
  title?: string
  body?: string
  base?: string
}

interface DZMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  richType?: RichType
  repos?: RepoItem[]
  files?: FileItem[]
  fileContent?: { path: string; content: string; repo: string }
  codeAnalysis?: { data: CodeAnalysisData; filePath: string; fileContent: string; repo: string }
  pendingAction?: PendingAction
  actionLog?: ActionLogEntry[]
  isError?: boolean
  showDevCard?: boolean
  selectedRepo?: RepoItem
  branches?: BranchItem[]
  issues?: IssueItem[]
  pulls?: PullItem[]
  stats?: RepoStats
}

interface ActionLogEntry {
  timestamp: string
  type: string
  description: string
  status: 'success' | 'error' | 'pending'
  repo?: string
}

// ===== HELPERS =====
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}


// ===== CODE ANALYSIS PANEL =====
const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string; icon: React.ReactNode }> = {
  critical: { color: '#f87171', bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.25)', label: 'حرج', icon: <ShieldAlert size={12} /> },
  high:     { color: '#fb923c', bg: 'rgba(251,146,60,0.07)',  border: 'rgba(251,146,60,0.25)',  label: 'عالي', icon: <Bug size={12} /> },
  medium:   { color: '#facc15', bg: 'rgba(250,204,21,0.07)',  border: 'rgba(250,204,21,0.25)',  label: 'متوسط', icon: <AlertCircle size={12} /> },
  low:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.07)',  border: 'rgba(96,165,250,0.25)',  label: 'منخفض', icon: <Gauge size={12} /> },
  info:     { color: '#a78bfa', bg: 'rgba(167,139,250,0.07)', border: 'rgba(167,139,250,0.25)', label: 'معلومة', icon: <Info size={12} /> },
}

const ACTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  fix_code:       { label: 'إصلاح', icon: <Wrench size={11} />, cls: 'ca-btn ca-btn--fix' },
  explain_error:  { label: 'شرح', icon: <Info size={11} />, cls: 'ca-btn ca-btn--explain' },
  improve_code:   { label: 'تحسين', icon: <Lightbulb size={11} />, cls: 'ca-btn ca-btn--improve' },
  apply_repo_fix: { label: 'Diff', icon: <GitBranch size={11} />, cls: 'ca-btn ca-btn--diff' },
  rescan_repo:    { label: 'إعادة الفحص', icon: <ScanSearch size={11} />, cls: 'ca-btn ca-btn--rescan' },
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#4ade80' : score >= 60 ? '#facc15' : score >= 40 ? '#fb923c' : '#f87171'
  const r = 22, circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  return (
    <div className="ca-score-ring">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#1a1a1a" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 28 28)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <span className="ca-score-num" style={{ color }}>{score}</span>
    </div>
  )
}

function CodeAnalysisPanel({
  data, filePath, onAction
}: {
  data: CodeAnalysisData
  filePath: string
  fileContent: string
  repo: string
  onAction: (action: CodeActionType, issue?: CodeIssue | CodeImprovement) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const critCount = data.issues.filter(i => i.severity === 'critical' || i.severity === 'high').length
  const medCount  = data.issues.filter(i => i.severity === 'medium').length

  return (
    <div className="ca-root">
      {/* Header */}
      <div className="ca-header">
        <div className="ca-header-left">
          <span className="ca-file-name">{filePath.split('/').pop()}</span>
          <span className="ca-lang-badge">{data.language}</span>
          <span className="ca-lines">{data.lines} سطر</span>
        </div>
        <ScoreRing score={data.score} />
      </div>

      {/* Summary */}
      <p className="ca-summary">{data.summary}</p>

      {/* Stats */}
      <div className="ca-stats">
        <div className="ca-stat ca-stat--red">
          <ShieldAlert size={13} /><span>{critCount} حرج/عالي</span>
        </div>
        <div className="ca-stat ca-stat--yellow">
          <Bug size={13} /><span>{medCount} متوسط</span>
        </div>
        <div className="ca-stat ca-stat--blue">
          <Lightbulb size={13} /><span>{data.improvements.length} تحسينات</span>
        </div>
        <button className="ca-stat ca-stat--rescan" onClick={() => onAction('rescan_repo')}>
          <ScanSearch size={12} /> إعادة الفحص
        </button>
      </div>

      {/* Issues */}
      {data.issues.length > 0 && (
        <div className="ca-section">
          <div className="ca-section-title"><Bug size={13} /> المشاكل المكتشفة ({data.issues.length})</div>
          <div className="ca-issues-list">
            {data.issues.map(issue => {
              const sev = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.info
              const isOpen = expanded.has(issue.id)
              return (
                <div key={issue.id} className="ca-issue" style={{ '--sev-color': sev.color, '--sev-bg': sev.bg, '--sev-border': sev.border } as React.CSSProperties}>
                  <button className="ca-issue-header" onClick={() => toggle(issue.id)}>
                    <span className="ca-sev-badge" style={{ color: sev.color, background: sev.bg, border: `1px solid ${sev.border}` }}>
                      {sev.icon} {sev.label}
                    </span>
                    {issue.line && <span className="ca-line-num">L{issue.line}</span>}
                    <span className="ca-issue-title">{issue.issue}</span>
                    <ChevronDown size={13} className={`ca-chevron ${isOpen ? 'ca-chevron--open' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="ca-issue-body">
                      <div className="ca-detail"><span className="ca-detail-label">السبب:</span> {issue.root_cause}</div>
                      <div className="ca-detail"><span className="ca-detail-label">الإصلاح:</span> {issue.fix}</div>
                      {issue.fix_code && (
                        <pre className="ca-code-snippet"><code>{issue.fix_code}</code></pre>
                      )}
                      <div className="ca-action-row">
                        {(issue.actions || []).map(act => {
                          const cfg = ACTION_CONFIG[act]
                          if (!cfg) return null
                          return (
                            <button key={act} className={cfg.cls} onClick={() => onAction(act, issue)}>
                              {cfg.icon} {cfg.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Improvements */}
      {data.improvements.length > 0 && (
        <div className="ca-section">
          <div className="ca-section-title"><Lightbulb size={13} /> اقتراحات التحسين</div>
          <div className="ca-issues-list">
            {data.improvements.map(imp => (
              <div key={imp.id} className="ca-issue ca-issue--improve">
                <button className="ca-issue-header" onClick={() => toggle(imp.id)}>
                  <span className="ca-sev-badge ca-sev-badge--green"><Lightbulb size={11} /> تحسين</span>
                  <span className="ca-issue-title">{imp.title}</span>
                  <ChevronDown size={13} className={`ca-chevron ${expanded.has(imp.id) ? 'ca-chevron--open' : ''}`} />
                </button>
                {expanded.has(imp.id) && (
                  <div className="ca-issue-body">
                    <div className="ca-detail">{imp.description}</div>
                    <div className="ca-action-row">
                      {(imp.actions || []).map(act => {
                        const cfg = ACTION_CONFIG[act]
                        if (!cfg) return null
                        return (
                          <button key={act} className={cfg.cls} onClick={() => onAction(act, imp)}>
                            {cfg.icon} {cfg.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tests */}
      {data.test_suggestions.length > 0 && (
        <div className="ca-section">
          <div className="ca-section-title"><Terminal size={13} /> اقتراحات الاختبار</div>
          <ul className="ca-tests-list">
            {data.test_suggestions.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {data.issues.length === 0 && data.improvements.length === 0 && (
        <div className="ca-clean"><CheckCircle2 size={18} /> الكود نظيف — لا مشاكل مكتشفة</div>
      )}
    </div>
  )
}

// ===== CODE BLOCK =====
function DZCodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const language = className?.replace('language-', '') || ''
  const codeText = String(children).replace(/\n$/, '')

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="dz-code-block">
      <div className="dz-code-block-header">
        <span className="dz-code-lang">{language || 'code'}</span>
        <button className="dz-code-copy-btn" onClick={handleCopy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code className={className}>{children}</code></pre>
    </div>
  )
}

// ===== TYPING EFFECT =====
function TypingEffect({ text, onDone }: { text: string; onDone: () => void }) {
  const [displayed, setDisplayed] = useState('')
  const indexRef = useRef(0)

  useEffect(() => {
    indexRef.current = 0
    setDisplayed('')
    const interval = setInterval(() => {
      indexRef.current++
      setDisplayed(text.slice(0, indexRef.current))
      if (indexRef.current >= text.length) {
        clearInterval(interval)
        onDone()
      }
    }, 6)
    return () => clearInterval(interval)
  }, [text, onDone])

  return <span>{displayed}</span>
}

// ===== REPOS LIST =====
function ReposList({
  repos,
  onSelect,
  onExport,
}: {
  repos: RepoItem[]
  onSelect: (repo: RepoItem) => void
  onExport: (selected: RepoItem[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleRepo = (fullName: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(fullName)) next.delete(fullName)
      else next.add(fullName)
      return next
    })
  }

  const selectedRepos = repos.filter(r => selected.has(r.full_name))

  return (
    <div className="gh-repos-list">
      <div className="gh-section-title">
        <Github size={14} />
        <span>Repositories ({repos.length})</span>
        {selected.size > 0 && (
          <button
            className="gh-export-btn"
            onClick={() => onExport(selectedRepos)}
          >
            <FolderOpen size={12} />
            تصدير ({selected.size}) إلى DZ Agent
          </button>
        )}
      </div>
      {repos.map(repo => (
        <div
          key={repo.full_name}
          className={`gh-repo-item gh-repo-item--selectable ${selected.has(repo.full_name) ? 'gh-repo-item--selected' : ''}`}
        >
          <label className="gh-repo-checkbox-label">
            <input
              type="checkbox"
              className="gh-repo-checkbox"
              checked={selected.has(repo.full_name)}
              onChange={() => toggleRepo(repo.full_name)}
            />
            <div className="gh-repo-info" onClick={() => onSelect(repo)}>
              <div className="gh-repo-main">
                <FolderOpen size={14} className="gh-repo-icon" />
                <span className="gh-repo-name">{repo.name}</span>
                {repo.private && <span className="gh-badge gh-badge--private">Private</span>}
              </div>
              {repo.description && (
                <p className="gh-repo-desc">{repo.description}</p>
              )}
              <div className="gh-repo-meta">
                {repo.language && <span className="gh-lang">{repo.language}</span>}
                <span className="gh-branch">
                  <ChevronRight size={10} />
                  {repo.default_branch}
                </span>
              </div>
            </div>
          </label>
        </div>
      ))}
    </div>
  )
}

// ===== FILES LIST =====
function FilesList({
  files,
  currentPath,
  onSelectFile,
  onSelectDir,
  repo: repoName,
}: {
  files: FileItem[]
  repo: string
  currentPath: string
  onSelectFile: (file: FileItem) => void
  onSelectDir: (dir: FileItem) => void
}) {
  return (
    <div className="gh-files-list">
      <div className="gh-section-title">
        <FolderOpen size={14} />
        <span>{repoName}{currentPath ? ` / ${currentPath}` : ''}</span>
      </div>
      {files.map(file => (
        <button
          key={file.path}
          className={`gh-file-item ${file.type === 'dir' ? 'gh-file-item--dir' : ''}`}
          onClick={() => file.type === 'dir' ? onSelectDir(file) : onSelectFile(file)}
        >
          {file.type === 'dir' ? (
            <ChevronDown size={13} className="gh-file-icon" />
          ) : (
            <FileText size={13} className="gh-file-icon" />
          )}
          <span className="gh-file-name">{file.name}</span>
          {file.size !== undefined && file.type === 'file' && (
            <span className="gh-file-size">{formatSize(file.size)}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ===== FILE CONTENT VIEW =====
function FileContentView({
  path,
  content,
  repo: _repo,
  onAnalyze,
  onEdit,
}: {
  path: string
  content: string
  repo: string
  onAnalyze: () => void
  onEdit: () => void
}) {
  const [copied, setCopied] = useState(false)
  const lines = content.split('\n').length
  const ext = path.split('.').pop() || ''

  return (
    <div className="gh-file-content">
      <div className="gh-file-header">
        <div className="gh-file-header-left">
          <FileText size={14} />
          <span className="gh-file-path">{path}</span>
          <span className="gh-badge">{lines} lines</span>
        </div>
        <div className="gh-file-header-right">
          <button className="gh-action-btn" onClick={onAnalyze}>
            <Zap size={13} />
            Analyze
          </button>
          <button className="gh-action-btn" onClick={onEdit}>
            <GitCommit size={13} />
            Edit & Commit
          </button>
          <button
            className="gh-action-btn"
            onClick={() => {
              navigator.clipboard.writeText(content)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="gh-file-code">
        <pre><code className={`language-${ext}`}>{content}</code></pre>
      </div>
    </div>
  )
}

// ===== APPROVAL DIALOG =====
function ApprovalDialog({
  action,
  onApprove,
  onCancel,
}: {
  action: PendingAction
  onApprove: () => void
  onCancel: () => void
}) {
  return (
    <div className="gh-approval">
      <div className="gh-approval-header">
        <AlertCircle size={16} className="gh-approval-icon" />
        <span>Approval Required</span>
      </div>
      <div className="gh-approval-body">
        {action.type === 'commit' ? (
          <>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Action:</span>
              <span className="gh-approval-value">
                <GitCommit size={13} /> Commit to repository
              </span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Repo:</span>
              <span className="gh-approval-value">{action.repo}</span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">File:</span>
              <span className="gh-approval-value">{action.path}</span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Branch:</span>
              <span className="gh-approval-value">{action.branch}</span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Message:</span>
              <span className="gh-approval-value">{action.message}</span>
            </div>
            {action.content && (
              <div className="gh-approval-preview">
                <div className="gh-approval-preview-title">New content preview:</div>
                <pre className="gh-approval-code">{action.content.slice(0, 500)}{action.content.length > 500 ? '\n...(truncated)' : ''}</pre>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Action:</span>
              <span className="gh-approval-value">
                <GitPullRequest size={13} /> Create Pull Request
              </span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Repo:</span>
              <span className="gh-approval-value">{action.repo}</span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Title:</span>
              <span className="gh-approval-value">{action.title}</span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Branch:</span>
              <span className="gh-approval-value">{action.branch} → {action.base}</span>
            </div>
          </>
        )}
      </div>
      <div className="gh-approval-actions">
        <button className="gh-approve-btn" onClick={onApprove}>
          <CheckCircle2 size={15} />
          Approve & Execute
        </button>
        <button className="gh-cancel-btn" onClick={onCancel}>
          <XCircle size={15} />
          Cancel
        </button>
      </div>
    </div>
  )
}

// ===== ACTION LOG =====
function ActionLogPanel({ entries }: { entries: ActionLogEntry[] }) {
  return (
    <div className="gh-action-log">
      <div className="gh-section-title">
        <Terminal size={14} />
        <span>Action Log</span>
      </div>
      {entries.length === 0 ? (
        <p className="gh-log-empty">No actions yet.</p>
      ) : (
        entries.map((e, i) => (
          <div key={i} className={`gh-log-entry gh-log-entry--${e.status}`}>
            <div className="gh-log-top">
              {e.status === 'success' ? <CheckCircle2 size={12} /> : e.status === 'error' ? <XCircle size={12} /> : <RefreshCw size={12} />}
              <span className="gh-log-type">{e.type}</span>
              <span className="gh-log-time">{e.timestamp}</span>
            </div>
            <p className="gh-log-desc">{e.description}</p>
            {e.repo && <span className="gh-log-repo">{e.repo}</span>}
          </div>
        ))
      )}
    </div>
  )
}

// ===== DEVELOPER CARD =====
const DEVELOPER = {
  name: 'Nadir Infograph',
  avatar: 'https://i.postimg.cc/Y0zgGHqt/FB-IMG-1775858111445.jpg',
  facebook: 'https://facebook.com/nadir.infograph23',
}

function DeveloperCard() {
  return (
    <div className="dev-card">
      <img
        className="dev-card-avatar"
        src={DEVELOPER.avatar}
        alt={DEVELOPER.name}
      />
      <div className="dev-card-info">
        <span className="dev-card-label">عن المطور</span>
        <span className="dev-card-name">{DEVELOPER.name}</span>
        <span className="dev-card-role">خبير في الذكاء الاصطناعي 🇩🇿</span>
      </div>
      <a
        className="dev-card-fb"
        href={DEVELOPER.facebook}
        target="_blank"
        rel="noreferrer"
        title="Facebook"
        aria-label="Facebook"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
        </svg>
      </a>
    </div>
  )
}

// ===== REPO ACTION PANEL =====
const REPO_ACTIONS: { id: string; Icon: React.ElementType; label: string; desc: string; color: string }[] = [
  { id: 'scan',     Icon: ScanSearch,     label: 'فحص شامل',       desc: 'تحليل شامل للمستودع',     color: '#60a5fa' },
  { id: 'bugs',     Icon: Bug,            label: 'إيجاد الأخطاء',   desc: 'كشف الأخطاء والثغرات',    color: '#f87171' },
  { id: 'security', Icon: ShieldAlert,    label: 'فحص أمني',        desc: 'ثغرات أمنية وحماية',      color: '#fb923c' },
  { id: 'suggest',  Icon: Lightbulb,      label: 'اقتراحات',        desc: 'تحسينات الكود والأداء',   color: '#fbbf24' },
  { id: 'fix',      Icon: Wrench,         label: 'إصلاح تلقائي',    desc: 'إصلاح وCommit مباشر',     color: '#4ade80' },
  { id: 'files',    Icon: FolderOpen,     label: 'الملفات',         desc: 'تصفح ملفات المستودع',     color: '#94a3b8' },
  { id: 'branches', Icon: GitBranch,      label: 'الفروع',          desc: 'إدارة فروع المستودع',     color: '#c084fc' },
  { id: 'issues',   Icon: AlertCircle,    label: 'المشاكل',         desc: 'Issues المفتوحة',          color: '#fb923c' },
  { id: 'pulls',    Icon: GitPullRequest, label: 'Pull Requests',   desc: 'طلبات الدمج النشطة',      color: '#38bdf8' },
  { id: 'commit',   Icon: GitCommit,      label: 'Commit',          desc: 'حفظ تعديل مباشر',         color: '#06b6d4' },
  { id: 'pr',       Icon: GitMerge,       label: 'إنشاء PR',        desc: 'Pull Request جديد',        color: '#f97316' },
  { id: 'stats',    Icon: BarChart2,      label: 'إحصائيات',        desc: 'إحصائيات ومساهمون',       color: '#a78bfa' },
]

function RepoActionPanel({
  repo,
  onAction,
}: {
  repo: RepoItem
  onAction: (action: string, repo: RepoItem) => void
}) {
  return (
    <div className="rap-root">
      <div className="rap-header">
        <div className="rap-repo-info">
          <FolderOpen size={15} />
          <span className="rap-repo-name">{repo.name}</span>
          {repo.private && <span className="gh-badge gh-badge--private">Private</span>}
          {repo.language && <span className="rap-lang">{repo.language}</span>}
        </div>
        <a href={repo.html_url} target="_blank" rel="noreferrer" className="rap-gh-link">
          <Github size={13} /> GitHub
        </a>
      </div>
      {repo.description && <p className="rap-desc">{repo.description}</p>}
      <div className="rap-grid">
        {REPO_ACTIONS.map(a => (
          <button
            key={a.id}
            className="rap-btn"
            style={{ '--rap-color': a.color } as React.CSSProperties}
            onClick={() => onAction(a.id, repo)}
          >
            <span className="rap-btn-icon" style={{ color: a.color }}>
              <a.Icon size={18} />
            </span>
            <span className="rap-btn-label">{a.label}</span>
            <span className="rap-btn-desc">{a.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ===== BRANCHES PANEL =====
function BranchesPanel({ branches, repo }: { branches: BranchItem[]; repo: string }) {
  return (
    <div className="gh-list-panel">
      <div className="gh-list-header">
        <GitBranch size={14} />
        <span>الفروع ({branches.length}) — {repo.split('/')[1]}</span>
      </div>
      {branches.map(b => (
        <div key={b.name} className="gh-branch-item">
          <div className="gh-branch-left">
            <GitBranch size={12} className="gh-branch-icon" />
            <span className="gh-branch-name">{b.name}</span>
            {b.protected && (
              <span className="gh-badge gh-badge--protected"><Lock size={9} /> محمي</span>
            )}
          </div>
          <span className="gh-branch-sha">{b.sha}</span>
        </div>
      ))}
    </div>
  )
}

// ===== ISSUES PANEL =====
function IssuesPanel({ issues, repo }: { issues: IssueItem[]; repo: string }) {
  const formatDate = (d: string) => new Date(d).toLocaleDateString('ar-DZ', { month: 'short', day: 'numeric' })
  return (
    <div className="gh-list-panel">
      <div className="gh-list-header">
        <AlertCircle size={14} />
        <span>المشاكل المفتوحة ({issues.length}) — {repo.split('/')[1]}</span>
      </div>
      {issues.length === 0 ? (
        <div className="gh-list-empty"><CheckCircle2 size={14} /> لا توجد مشاكل مفتوحة</div>
      ) : issues.map(issue => (
        <div key={issue.number} className="gh-issue-item">
          <div className="gh-issue-top">
            <span className="gh-issue-num">#{issue.number}</span>
            <span className="gh-issue-title">{issue.title}</span>
            <a href={issue.html_url} target="_blank" rel="noreferrer" className="gh-item-link">
              <ExternalLink size={11} />
            </a>
          </div>
          <div className="gh-issue-meta">
            <span className="gh-issue-user"><Users size={10} /> {issue.user}</span>
            <span className="gh-issue-date"><Clock size={10} /> {formatDate(issue.updated_at)}</span>
            {issue.comments > 0 && <span className="gh-issue-comments"><MessageSquare size={10} /> {issue.comments}</span>}
            {issue.labels.map(l => <span key={l} className="gh-label"><Tag size={9} /> {l}</span>)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== PULLS PANEL =====
function PullsPanel({ pulls, repo }: { pulls: PullItem[]; repo: string }) {
  const formatDate = (d: string) => new Date(d).toLocaleDateString('ar-DZ', { month: 'short', day: 'numeric' })
  return (
    <div className="gh-list-panel">
      <div className="gh-list-header">
        <GitPullRequest size={14} />
        <span>Pull Requests ({pulls.length}) — {repo.split('/')[1]}</span>
      </div>
      {pulls.length === 0 ? (
        <div className="gh-list-empty"><CheckCircle2 size={14} /> لا توجد Pull Requests مفتوحة</div>
      ) : pulls.map(pr => (
        <div key={pr.number} className={`gh-pr-item ${pr.draft ? 'gh-pr-item--draft' : ''}`}>
          <div className="gh-issue-top">
            <span className="gh-issue-num">#{pr.number}</span>
            {pr.draft && <span className="gh-badge gh-badge--draft">Draft</span>}
            <span className="gh-issue-title">{pr.title}</span>
            <a href={pr.html_url} target="_blank" rel="noreferrer" className="gh-item-link">
              <ExternalLink size={11} />
            </a>
          </div>
          <div className="gh-issue-meta">
            <span className="gh-issue-user"><Users size={10} /> {pr.user}</span>
            <span className="gh-pr-branch"><GitBranch size={10} /> {pr.head} → {pr.base}</span>
            <span className="gh-issue-date"><Clock size={10} /> {formatDate(pr.updated_at)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== STATS PANEL =====
function StatsPanel({ stats }: { stats: RepoStats }) {
  const totalBytes = Object.values(stats.languages).reduce((a, b) => a + b, 0) || 1
  const formatSize = (kb: number) => kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`
  const formatDate = (d: string) => new Date(d).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric' })
  return (
    <div className="gh-stats-panel">
      <div className="gh-list-header">
        <BarChart2 size={14} />
        <span>إحصائيات — {stats.name}</span>
      </div>
      <div className="gh-stats-grid">
        <div className="gh-stat-card">
          <Star size={14} className="gh-stat-icon" style={{ color: '#fbbf24' }} />
          <span className="gh-stat-value">{stats.stars?.toLocaleString()}</span>
          <span className="gh-stat-label">نجمة</span>
        </div>
        <div className="gh-stat-card">
          <GitBranch size={14} className="gh-stat-icon" style={{ color: '#c084fc' }} />
          <span className="gh-stat-value">{stats.forks?.toLocaleString()}</span>
          <span className="gh-stat-label">Fork</span>
        </div>
        <div className="gh-stat-card">
          <AlertCircle size={14} className="gh-stat-icon" style={{ color: '#fb923c' }} />
          <span className="gh-stat-value">{stats.open_issues?.toLocaleString()}</span>
          <span className="gh-stat-label">مشكلة</span>
        </div>
        <div className="gh-stat-card">
          <Activity size={14} className="gh-stat-icon" style={{ color: '#4ade80' }} />
          <span className="gh-stat-value">{formatSize(stats.size)}</span>
          <span className="gh-stat-label">الحجم</span>
        </div>
      </div>
      {Object.keys(stats.languages).length > 0 && (
        <div className="gh-stats-langs">
          <div className="gh-stats-section-title"><Search size={12} /> اللغات</div>
          <div className="gh-langs-bar">
            {Object.entries(stats.languages).slice(0, 6).map(([lang, bytes]) => (
              <div
                key={lang}
                className="gh-lang-segment"
                style={{ width: `${(bytes / totalBytes) * 100}%` }}
                title={`${lang}: ${((bytes / totalBytes) * 100).toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="gh-langs-legend">
            {Object.entries(stats.languages).slice(0, 6).map(([lang, bytes]) => (
              <span key={lang} className="gh-lang-item">
                {lang} <span className="gh-lang-pct">{((bytes / totalBytes) * 100).toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {stats.contributors?.length > 0 && (
        <div className="gh-stats-contribs">
          <div className="gh-stats-section-title"><Users size={12} /> المساهمون</div>
          {stats.contributors.map(c => (
            <div key={c.login} className="gh-contrib-item">
              <span className="gh-contrib-name">{c.login}</span>
              <span className="gh-contrib-count">{c.contributions} مساهمة</span>
            </div>
          ))}
        </div>
      )}
      <div className="gh-stats-dates">
        <span><Clock size={10} /> أُنشئ: {formatDate(stats.created_at)}</span>
        <span><RefreshCw size={10} /> آخر تحديث: {formatDate(stats.updated_at)}</span>
        <span><GitBranch size={10} /> الفرع الرئيسي: {stats.default_branch}</span>
      </div>
    </div>
  )
}

// ===== GITHUB TOKEN PANEL =====
function GitHubTokenPanel({
  token,
  onSave,
  onClear,
}: {
  token: string
  onSave: (t: string) => void
  onClear: () => void
}) {
  const [input, setInput] = useState('')
  const [show, setShow] = useState(false)

  const handleSave = () => {
    if (input.trim()) {
      onSave(input.trim())
      setInput('')
    }
  }

  if (token) {
    return (
      <div className="gh-token-set">
        <Key size={13} />
        <span>GitHub Connected</span>
        <button className="gh-token-clear" onClick={onClear}>
          <Trash2 size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="gh-token-panel">
      <button className="gh-token-toggle" onClick={() => setShow(!show)}>
        <Github size={14} />
        Connect GitHub Token
        <ChevronDown size={13} className={show ? 'rotated' : ''} />
      </button>
      {show && (
        <div className="gh-token-input-row">
          <input
            type="password"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxxxxx"
            className="gh-token-input"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <button className="gh-token-save" onClick={handleSave}>
            Connect
          </button>
        </div>
      )}
      <p className="gh-token-hint">
        Token stored locally only. Never sent to third parties.
      </p>
    </div>
  )
}

// ===== SUGGESTION CARDS =====
interface SuggestionCard {
  id: string
  icon: string
  category: string
  color: string
  glow: string
  border: string
  suggestions: { label: string; command: string }[]
}

const SUGGESTION_CARDS: SuggestionCard[] = [
  {
    id: 'news',
    icon: '📰',
    category: 'أخبار',
    color: '#c8ff00',
    glow: 'rgba(200,255,0,0.12)',
    border: 'rgba(200,255,0,0.2)',
    suggestions: [
      { label: 'أخبار الجزائر الآن', command: 'أخبار الجزائر اليوم' },
      { label: 'آخر الأحداث العربية', command: 'آخر الأحداث العربية والدولية اليوم' },
      { label: 'أبرز عناوين الصحف', command: 'أبرز عناوين الصحف الجزائرية اليوم' },
    ],
  },
  {
    id: 'sports',
    icon: '⚽',
    category: 'رياضة',
    color: '#00ff88',
    glow: 'rgba(0,255,136,0.12)',
    border: 'rgba(0,255,136,0.2)',
    suggestions: [
      { label: 'نتائج مباريات اليوم', command: 'نتائج مباريات كرة القدم اليوم' },
      { label: 'جدول الدوري الجزائري', command: 'جدول وترتيب الدوري الجزائري المحترف' },
      { label: 'أخبار المنتخب الوطني', command: 'أخبار المنتخب الجزائري لكرة القدم' },
    ],
  },
  {
    id: 'currency',
    icon: '💱',
    category: 'أسعار الصرف',
    color: '#fbbf24',
    glow: 'rgba(251,191,36,0.12)',
    border: 'rgba(251,191,36,0.2)',
    suggestions: [
      { label: 'سعر الدولار اليوم', command: 'سعر الدولار الأمريكي مقابل الدينار الجزائري اليوم' },
      { label: 'سعر اليورو والجنيه', command: 'سعر اليورو والجنيه الإسترليني مقابل الدينار الجزائري' },
      { label: 'جدول كامل لأسعار الصرف', command: 'أعطني جدول أسعار الصرف الكامل مقابل الدينار الجزائري اليوم' },
    ],
  },
  {
    id: 'code',
    icon: '💻',
    category: 'برمجة',
    color: '#a78bfa',
    glow: 'rgba(167,139,250,0.12)',
    border: 'rgba(167,139,250,0.2)',
    suggestions: [
      { label: 'دالة Python لترتيب قائمة', command: 'اكتب دالة Python لترتيب قائمة أرقام تنازلياً مع شرح الكود' },
      { label: 'شرح async/await', command: 'اشرح مفهوم async/await في JavaScript بأمثلة عملية' },
      { label: 'إصلاح خطأ TypeError', command: 'كيف أصلح خطأ TypeError في Python؟ أعطني الأسباب الشائعة والحلول' },
    ],
  },
  {
    id: 'github',
    icon: '🐙',
    category: 'GitHub & كود',
    color: '#f97316',
    glow: 'rgba(249,115,22,0.12)',
    border: 'rgba(249,115,22,0.2)',
    suggestions: [
      { label: 'عرض مستودعاتي', command: 'اعرض مستودعاتي على GitHub' },
      { label: 'تحليل الكود', command: 'حلل الكود في مستودعي وأعطني تقريراً عن الأخطاء والتحسينات' },
      { label: 'إنشاء مشروع جديد', command: 'ساعدني في إنشاء مشروع Python جديد على GitHub مع ملف README' },
    ],
  },
  {
    id: 'weather',
    icon: '🌦',
    category: 'طقس',
    color: '#38bdf8',
    glow: 'rgba(56,189,248,0.12)',
    border: 'rgba(56,189,248,0.2)',
    suggestions: [
      { label: 'طقس الجزائر العاصمة', command: 'حالة الطقس في الجزائر العاصمة اليوم' },
      { label: 'طقس وهران وقسنطينة', command: 'حالة الطقس في وهران وقسنطينة' },
      { label: 'توقعات الأسبوع', command: 'توقعات الطقس في الجزائر هذا الأسبوع' },
    ],
  },
  {
    id: 'debug',
    icon: '🔧',
    category: 'تحليل وتصحيح',
    color: '#fb7185',
    glow: 'rgba(251,113,133,0.12)',
    border: 'rgba(251,113,133,0.2)',
    suggestions: [
      { label: 'مراجعة كود React', command: 'راجع هذا الكود واقترح تحسينات:\n```jsx\nfunction App() { return <div>Hello</div> }\n```' },
      { label: 'أفضل ممارسات API', command: 'ما هي أفضل ممارسات تصميم REST API؟ مع أمثلة عملية' },
      { label: 'هيكل مشروع Node.js', command: 'أعطني هيكل مشروع Node.js + Express احترافي مع شرح كل مجلد' },
    ],
  },
]

function DZSuggestionCards({ onSend }: { onSend: (cmd: string) => void }) {
  return (
    <div className="dz-cards-grid">
      {SUGGESTION_CARDS.map(card => (
        <div
          key={card.id}
          className="dz-scard"
          style={{
            '--card-glow': card.glow,
            '--card-border': card.border,
            '--card-color': card.color,
          } as React.CSSProperties}
        >
          <div className="dz-scard-header">
            <span className="dz-scard-icon">{card.icon}</span>
            <span className="dz-scard-category" style={{ color: card.color }}>{card.category}</span>
          </div>
          <div className="dz-scard-suggestions">
            {card.suggestions.map((s, i) => (
              <button
                key={i}
                className="dz-scard-chip"
                onClick={() => onSend(s.command)}
              >
                <span className="dz-scard-chip-arrow">›</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function DZInvocationGuide({ onSend }: { onSend: (cmd: string) => void }) {
  const examples = [
    { code: '@dz-agent', label: 'استدعاء DZ Agent للأخبار، البحث، GitHub، الطقس والرياضة', prompt: '@dz-agent أعطني أخبار الجزائر اليوم مع المصادر' },
    { code: '@dz-gpt', label: 'استدعاء DZ GPT للأسئلة العامة والشرح والكتابة', prompt: '@dz-gpt اشرح لي الحوسبة الكمية ببساطة' },
    { code: '/github', label: 'أوامر GitHub: عرض المستودعات، تحليل كود، ملفات، PR', prompt: '/github اعرض مستودعاتي' },
  ]

  return (
    <div className="dz-invoke-guide">
      <div className="dz-invoke-guide-head">
        <MessageSquare size={14} />
        <span>أكواد الاستدعاء داخل المحادثة</span>
      </div>
      <div className="dz-invoke-grid">
        {examples.map(item => (
          <button key={item.code} className="dz-invoke-chip" onClick={() => onSend(item.prompt)}>
            <code>{item.code}</code>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <p>يمكنك كتابة الكود في بداية الرسالة، مثال: <code>@dz-agent حلل هذا المستودع</code> أو <code>@dz-gpt اكتب خطة مشروع</code>.</p>
    </div>
  )
}

// ===== MAIN COMPONENT =====
interface DZChatBoxProps {
  chatId?: string | null
  language?: 'ar' | 'en' | 'fr'
  onTitleChange?: (title: string) => void
}

export default function DZChatBox({ chatId, language = 'ar', onTitleChange }: DZChatBoxProps) {
  const [messages, setMessages] = useState<DZMessage[]>(() => {
    if (!chatId) return []
    try {
      const saved = localStorage.getItem(`dz-agent-msgs-${chatId}`)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [typingId, setTypingId] = useState<string | null>(null)
  const [thinkingStep, setThinkingStep] = useState<ThinkingStep | null>(null)
  const [githubToken, setGithubToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem('dz-agent-gh-token') || ''
    } catch {
      return ''
    }
  })
  const [serverGithubConnected, setServerGithubConnected] = useState(false)
  const [oauthEnabled, setOauthEnabled] = useState(false)
  const [githubUser, setGithubUser] = useState<{ login: string; name: string; avatar: string; url: string; repos: number } | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [showGhMenu, setShowGhMenu] = useState(false)
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([])
  const [showLog, setShowLog] = useState(false)
  const [currentRepo, setCurrentRepo] = useState<string>('')
  const [currentPath, setCurrentPath] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Handle OAuth callback from URL hash & auth errors from URL params
  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#gh_oauth=')) {
      const token = hash.replace('#gh_oauth=', '')
      if (token) {
        setGithubToken(token)
        sessionStorage.setItem('dz-agent-gh-token', token)
        localStorage.removeItem('dz-agent-gh-token')
        window.history.replaceState(null, '', '/dz-agent')
        // Auto-fetch user info and repos after OAuth connect
        fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0' }
        }).then(r => r.json()).then(u => {
          setGithubUser({ login: u.login, name: u.name || u.login, avatar: u.avatar_url, url: u.html_url, repos: u.public_repos })
        }).catch(() => {})
      }
    }
    const params = new URLSearchParams(window.location.search)
    const err = params.get('auth_error')
    if (err) {
      const errMsg = err === 'denied'
        ? 'رفضت الإذن على GitHub.'
        : err === 'csrf'
        ? 'فشل التحقق الأمني (CSRF). حاول مجدداً.'
        : err === 'config'
        ? 'GitHub OAuth غير مُهيَّأ على الخادم.'
        : 'فشل الاتصال بـ GitHub. حاول مجدداً.'
      setAuthError(errMsg)
      window.history.replaceState(null, '', '/dz-agent')
    }
    localStorage.removeItem('dz-agent-gh-token')
  }, [])

  // Check server GitHub connection on mount
  useEffect(() => {
    fetch('/api/dz-agent/github/status')
      .then(r => r.json())
      .then(d => {
        if (d.connected) setServerGithubConnected(true)
        if (d.oauthEnabled) setOauthEnabled(true)
        if (d.user) setGithubUser(d.user)
      })
      .catch(() => {})
  }, [])

  // Save messages to localStorage when they change
  useEffect(() => {
    if (!chatId) return
    try {
      localStorage.setItem(`dz-agent-msgs-${chatId}`, JSON.stringify(messages))
    } catch {}
    // Update chat title from first user message
    const firstUser = messages.find(m => m.role === 'user')
    if (firstUser && onTitleChange) {
      const title = firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? '...' : '')
      onTitleChange(title)
    }
  }, [messages, chatId, onTitleChange])

  // Auto-scroll — only when there are messages or loading, not on empty state
  useEffect(() => {
    if (messages.length === 0 && !isLoading) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + 'px'
    }
  }, [input])

  const addToLog = useCallback((entry: Omit<ActionLogEntry, 'timestamp'>) => {
    setActionLog(prev => [{
      ...entry,
      timestamp: new Date().toLocaleTimeString(),
    }, ...prev])
  }, [])

  const saveToken = useCallback((t: string) => {
    setGithubToken(t)
    sessionStorage.setItem('dz-agent-gh-token', t)
    localStorage.removeItem('dz-agent-gh-token')
  }, [])

  const clearToken = useCallback(() => {
    setGithubToken('')
    setGithubUser(null)
    setServerGithubConnected(false)
    setShowGhMenu(false)
    sessionStorage.removeItem('dz-agent-gh-token')
    localStorage.removeItem('dz-agent-gh-token')
  }, [])

  const copyMessage = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const addAssistantMessage = useCallback((msg: Omit<DZMessage, 'id' | 'role'>) => {
    const id = generateId()
    setMessages(prev => [...prev, { ...msg, id, role: 'assistant' }])
    if (msg.richType === 'text' || !msg.richType) setTypingId(id)
    return id
  }, [])

  // ===== GITHUB ACTIONS =====
  const fetchRepos = useCallback(async () => {
    if (!githubToken && !serverGithubConnected) {
      addAssistantMessage({ content: 'يرجى ربط توكن GitHub أولاً لعرض المستودعات. انقر على "ربط GitHub" في الأعلى.', richType: 'text' })
      return
    }
    setIsLoading(true)
    setThinkingStep({ type: 'list', label: 'جلب المستودعات من GitHub...' })
    addToLog({ type: 'list-repos', description: 'Listing GitHub repositories', status: 'pending' })
    try {
      const res = await fetch('/api/dz-agent/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch repos')
      addAssistantMessage({ content: `Found ${data.repos.length} repositories:`, richType: 'repos', repos: data.repos })
      addToLog({ type: 'list-repos', description: `Listed ${data.repos.length} repositories`, status: 'success' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `Failed to fetch repositories: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'list-repos', description: `Error: ${msg}`, status: 'error' })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const fetchFiles = useCallback(async (repo: string, path = '') => {
    if (!githubToken && !serverGithubConnected) return
    setIsLoading(true)
    setThinkingStep({ type: 'read', label: `قراءة الملفات في ${repo.split('/')[1] || repo}...` })
    addToLog({ type: 'list-files', description: `Browsing ${repo}${path ? '/' + path : ''}`, status: 'pending', repo })
    try {
      const res = await fetch('/api/dz-agent/github/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo, path }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch files')
      setCurrentRepo(repo)
      setCurrentPath(path)
      addAssistantMessage({ content: `Files in ${repo}${path ? '/' + path : ''}:`, richType: 'files', files: data.files })
      addToLog({ type: 'list-files', description: `Listed ${data.files.length} files in ${repo}`, status: 'success', repo })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `Failed to list files: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'list-files', description: `Error: ${msg}`, status: 'error' })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const fetchFileContent = useCallback(async (repo: string, path: string) => {
    if (!githubToken && !serverGithubConnected) return
    setIsLoading(true)
    setThinkingStep({ type: 'read', label: `قراءة الملف: ${path.split('/').pop()}...` })
    addToLog({ type: 'read-file', description: `Reading ${path} from ${repo}`, status: 'pending', repo })
    try {
      const res = await fetch('/api/dz-agent/github/file-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo, path }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to read file')
      addAssistantMessage({ content: `Content of ${path}:`, richType: 'file-content', fileContent: { path, content: data.content, repo } })
      addToLog({ type: 'read-file', description: `Read ${path} (${data.content.split('\n').length} lines)`, status: 'success', repo })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `Failed to read file: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'read-file', description: `Error reading ${path}: ${msg}`, status: 'error' })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const analyzeCode = useCallback(async (repo: string, path: string, content: string) => {
    setIsLoading(true)
    setThinkingStep({ type: 'analyze', label: `تحليل الكود في ${path.split('/').pop()}...` })
    addToLog({ type: 'analyze-code', description: `Analyzing ${path}`, status: 'pending', repo })
    try {
      const res = await fetch('/api/dz-agent/github/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, path, content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')

      if (data.structured && data.analysis && typeof data.analysis === 'object') {
        addAssistantMessage({
          content: `تحليل: ${path}`,
          richType: 'code-analysis',
          codeAnalysis: { data: data.analysis as CodeAnalysisData, filePath: path, fileContent: content, repo },
        })
      } else {
        addAssistantMessage({ content: typeof data.analysis === 'string' ? data.analysis : JSON.stringify(data.analysis, null, 2), richType: 'text' })
      }
      addToLog({ type: 'analyze-code', description: `Analysis complete for ${path}`, status: 'success', repo })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `Analysis failed: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'analyze-code', description: `Error: ${msg}`, status: 'error' })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [addToLog, addAssistantMessage])

  const executeCodeAction = useCallback(async (
    action: CodeActionType,
    filePath: string,
    fileContent: string,
    repo: string,
    issue?: CodeIssue | CodeImprovement
  ) => {
    setIsLoading(true)
    const stepMap: Record<string, ThinkingStep> = {
      fix_code:       { type: 'write', label: 'إصلاح الكود...' },
      explain_error:  { type: 'analyze', label: 'شرح الخطأ...' },
      improve_code:   { type: 'write', label: 'تحسين الكود...' },
      apply_repo_fix: { type: 'analyze', label: 'إعداد Git Diff...' },
      rescan_repo:    { type: 'scan', label: 'إعادة الفحص...' },
    }
    setThinkingStep(stepMap[action] || { type: 'analyze', label: 'معالجة...' })
    const actionLabels: Record<string, string> = {
      fix_code: `إصلاح: ${(issue as CodeIssue)?.issue || ''}`,
      explain_error: `شرح الخطأ: ${(issue as CodeIssue)?.issue || ''}`,
      improve_code: `تحسين: ${(issue as CodeImprovement)?.title || (issue as CodeIssue)?.issue || filePath}`,
      apply_repo_fix: `Git Diff لـ: ${(issue as CodeIssue)?.issue || ''}`,
      rescan_repo: `إعادة فحص: ${filePath}`,
    }
    addToLog({ type: 'code-action', description: actionLabels[action] || action, status: 'pending', repo })
    try {
      const res = await fetch('/api/dz-agent/github/code-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, issue, filePath, fileContent, repo, language: '' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')

      if (data.structured && data.action === 'rescan_repo' && typeof data.content === 'object') {
        addAssistantMessage({
          content: `إعادة فحص: ${filePath}`,
          richType: 'code-analysis',
          codeAnalysis: { data: data.content as CodeAnalysisData, filePath, fileContent, repo },
        })
      } else {
        const prefix: Record<string, string> = {
          fix_code: '🔧 **الكود المُصلح:**\n\n',
          explain_error: '📖 **شرح الخطأ:**\n\n',
          improve_code: '✨ **الكود المُحسّن:**\n\n',
          apply_repo_fix: '📋 **Git Diff:**\n\n',
          rescan_repo: '🔄 **نتائج الفحص المحدّثة:**\n\n',
        }
        addAssistantMessage({ content: (prefix[action] || '') + data.content, richType: 'text' })
      }
      addToLog({ type: 'code-action', description: actionLabels[action], status: 'success', repo })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل الإجراء: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'code-action', description: `Error: ${msg}`, status: 'error', repo })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [addToLog, addAssistantMessage])

  const prepareEdit = useCallback((fileContent: { path: string; content: string; repo: string }) => {
    setInput(`Edit file "${fileContent.path}" in ${fileContent.repo} and fix any issues or improve the code.`)
    textareaRef.current?.focus()
  }, [])

  const handleExportRepos = useCallback((repos: RepoItem[]) => {
    if (repos.length === 0) return
    const firstRepo = repos[0]
    setCurrentRepo(firstRepo.full_name)
    addAssistantMessage({
      content: repos.length > 1
        ? `✅ تم اختيار **${repos.length}** مستودعات — النشط الآن: **${firstRepo.name}** — اختر إجراءً:`
        : `✅ تم اختيار **${firstRepo.name}** — اختر إجراءً:`,
      richType: 'repo-selected',
      selectedRepo: firstRepo,
    })
  }, [addAssistantMessage])

  const selectRepo = useCallback((repo: RepoItem) => {
    setCurrentRepo(repo.full_name)
    addAssistantMessage({
      content: `تم اختيار **${repo.name}** — اختر إجراءً:`,
      richType: 'repo-selected',
      selectedRepo: repo,
    })
  }, [addAssistantMessage])

  const fetchBranches = useCallback(async (repo: RepoItem) => {
    setIsLoading(true)
    setThinkingStep({ type: 'list', label: `جلب فروع ${repo.name}...` })
    addToLog({ type: 'list-branches', description: `Listing branches for ${repo.name}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch branches')
      addAssistantMessage({ content: `الفروع في ${repo.name}:`, richType: 'branches', branches: data.branches, selectedRepo: repo })
      addToLog({ type: 'list-branches', description: `Listed ${data.branches.length} branches`, status: 'success', repo: repo.full_name })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل جلب الفروع: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'list-branches', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const fetchIssues = useCallback(async (repo: RepoItem) => {
    setIsLoading(true)
    setThinkingStep({ type: 'list', label: `جلب مشاكل ${repo.name}...` })
    addToLog({ type: 'list-issues', description: `Listing issues for ${repo.name}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch issues')
      addAssistantMessage({ content: `المشاكل في ${repo.name}:`, richType: 'issues', issues: data.issues, selectedRepo: repo })
      addToLog({ type: 'list-issues', description: `Listed ${data.issues.length} issues`, status: 'success', repo: repo.full_name })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل جلب المشاكل: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'list-issues', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const fetchPulls = useCallback(async (repo: RepoItem) => {
    setIsLoading(true)
    setThinkingStep({ type: 'list', label: `جلب Pull Requests لـ ${repo.name}...` })
    addToLog({ type: 'list-pulls', description: `Listing PRs for ${repo.name}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/pulls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch PRs')
      addAssistantMessage({ content: `Pull Requests في ${repo.name}:`, richType: 'pulls', pulls: data.pulls, selectedRepo: repo })
      addToLog({ type: 'list-pulls', description: `Listed ${data.pulls.length} PRs`, status: 'success', repo: repo.full_name })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل جلب PRs: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'list-pulls', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const fetchStats = useCallback(async (repo: RepoItem) => {
    setIsLoading(true)
    setThinkingStep({ type: 'analyze', label: `جلب إحصائيات ${repo.name}...` })
    addToLog({ type: 'repo-stats', description: `Fetching stats for ${repo.name}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch stats')
      addAssistantMessage({ content: `إحصائيات ${repo.name}:`, richType: 'stats', stats: data, selectedRepo: repo })
      addToLog({ type: 'repo-stats', description: `Stats fetched for ${repo.name}`, status: 'success', repo: repo.full_name })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل جلب الإحصائيات: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'repo-stats', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const scanRepo = useCallback(async (repo: RepoItem, focus?: string) => {
    setIsLoading(true)
    const stepLabel = focus === 'bugs' ? 'البحث عن الأخطاء...' : focus === 'security' ? 'الفحص الأمني...' : focus === 'suggest' ? 'توليد الاقتراحات...' : focus === 'fix' ? 'إعداد الإصلاحات...' : 'الفحص الشامل...'
    setThinkingStep({ type: focus === 'security' ? 'scan' : focus === 'fix' ? 'write' : 'analyze', label: stepLabel })
    addToLog({ type: 'repo-scan', description: `Scanning ${repo.name}${focus ? ` (${focus})` : ''}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/repo-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name, focus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      const scannedList = data.filesScanned?.map((f: string) => `\`${f}\``).join(' · ') || ''
      addAssistantMessage({
        content: `## 🔍 تقرير المستودع: \`${repo.name}\`\n**الملفات المفحوصة:** ${scannedList}\n\n${data.analysis}`,
        richType: 'text',
      })
      addToLog({ type: 'repo-scan', description: `Scan complete — ${data.filesScanned?.length || 0} files`, status: 'success', repo: repo.full_name })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل الفحص: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'repo-scan', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const handleRepoAction = useCallback(async (action: string, repo: RepoItem) => {
    setCurrentRepo(repo.full_name)
    switch (action) {
      case 'scan':
        await scanRepo(repo)
        break
      case 'bugs':
        await scanRepo(repo, 'bugs')
        break
      case 'security':
        await scanRepo(repo, 'security')
        break
      case 'suggest':
        await scanRepo(repo, 'suggest')
        break
      case 'fix':
        await scanRepo(repo, 'fix')
        break
      case 'report':
        await scanRepo(repo, 'report')
        break
      case 'files':
        await fetchFiles(repo.full_name)
        break
      case 'branches':
        await fetchBranches(repo)
        break
      case 'issues':
        await fetchIssues(repo)
        break
      case 'pulls':
        await fetchPulls(repo)
        break
      case 'stats':
        await fetchStats(repo)
        break
      case 'pr':
        setInput(`أنشئ Pull Request جديد في مستودع ${repo.name} — صف التغييرات المطلوبة والفرع المصدر`)
        textareaRef.current?.focus()
        break
      case 'commit':
        setInput(`قم بعمل Commit في مستودع ${repo.name} — صف التعديل الذي تريد حفظه`)
        textareaRef.current?.focus()
        break
    }
  }, [scanRepo, fetchFiles, fetchBranches, fetchIssues, fetchPulls, fetchStats])

  const executeApprovedAction = useCallback(async (action: PendingAction, msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, pendingAction: undefined, content: 'Action approved. Executing...' } : m))
    setIsLoading(true)

    if (action.type === 'commit') {
      addToLog({ type: 'commit', description: `Committing ${action.path} to ${action.repo}`, status: 'pending', repo: action.repo })
      try {
        const res = await fetch('/api/dz-agent/github/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: githubToken, ...action }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Commit failed')
        addAssistantMessage({ content: `Commit successful!\n\n**File:** ${action.path}\n**Repo:** ${action.repo}\n**Branch:** ${action.branch}\n**Message:** ${action.message}\n\n[View on GitHub](${data.html_url})`, richType: 'text' })
        addToLog({ type: 'commit', description: `Committed ${action.path} — "${action.message}"`, status: 'success', repo: action.repo })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        addAssistantMessage({ content: `Commit failed: ${msg}`, richType: 'text', isError: true })
        addToLog({ type: 'commit', description: `Commit error: ${msg}`, status: 'error', repo: action.repo })
      }
    } else if (action.type === 'pr') {
      addToLog({ type: 'create-pr', description: `Creating PR in ${action.repo}`, status: 'pending', repo: action.repo })
      try {
        const res = await fetch('/api/dz-agent/github/pr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: githubToken, ...action }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'PR creation failed')
        addAssistantMessage({ content: `Pull Request created!\n\n**Title:** ${action.title}\n**Repo:** ${action.repo}\n**Branch:** ${action.branch} → ${action.base}\n\n[View PR](${data.html_url})`, richType: 'text' })
        addToLog({ type: 'create-pr', description: `Created PR: "${action.title}"`, status: 'success', repo: action.repo })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        addAssistantMessage({ content: `PR creation failed: ${msg}`, richType: 'text', isError: true })
        addToLog({ type: 'create-pr', description: `PR error: ${msg}`, status: 'error', repo: action.repo })
      }
    }

    setIsLoading(false)
  }, [githubToken, addToLog, addAssistantMessage])

  // ===== SEND MESSAGE =====
  const sendMessage = useCallback(async (overrideInput?: string) => {
    const text = (overrideInput ?? input).trim()
    if (!text || isLoading) return

    const userMessage: DZMessage = { id: generateId(), role: 'user', content: text, richType: 'text' }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      abortRef.current = new AbortController()
      const res = await fetch('/api/dz-agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
          githubToken: githubToken || undefined,
          currentRepo: currentRepo || undefined,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || `Server error: ${res.status}`)
      }

      const data = await res.json()

      if (data.action === 'list-repos') {
        await fetchRepos()
        return
      }
      if (data.action === 'list-files' && data.repo) {
        await fetchFiles(data.repo, data.path || '')
        return
      }
      if (data.action === 'read-file' && data.repo && data.path) {
        await fetchFileContent(data.repo, data.path)
        return
      }

      if (data.pendingAction) {
        addAssistantMessage({
          content: data.content || 'Please review and approve this action:',
          richType: 'approval',
          pendingAction: data.pendingAction,
        })
      } else {
        addAssistantMessage({ content: data.content || 'No response generated.', richType: 'text', showDevCard: !!data.showDevCard })
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      addAssistantMessage({ content: 'Sorry, an error occurred. Please try again.', richType: 'text', isError: true })
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [input, isLoading, messages, githubToken, currentRepo, fetchRepos, fetchFiles, fetchFileContent, addAssistantMessage])

  const regenerate = useCallback(async () => {
    if (messages.length < 2 || isLoading) return
    const withoutLast = messages.slice(0, -1)
    setMessages(withoutLast)
    setIsLoading(true)
    try {
      abortRef.current = new AbortController()
      const res = await fetch('/api/dz-agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: withoutLast.map(m => ({ role: m.role, content: m.content })),
          githubToken: githubToken || undefined,
        }),
        signal: abortRef.current.signal,
      })
      const data = await res.json()
      addAssistantMessage({ content: data.content || 'No response.', richType: 'text' })
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      addAssistantMessage({ content: 'Error. Please try again.', richType: 'text', isError: true })
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [messages, isLoading, githubToken, addAssistantMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    abortRef.current?.abort()
    setMessages([])
    setIsLoading(false)
    setTypingId(null)
  }

  const isGithubConnected = serverGithubConnected || !!githubToken

  // ===== RENDER =====
  return (
    <div className="dz-chatbox" dir="rtl">
      {/* GitHub Bar */}
      <div className="dz-gh-bar">
        {isGithubConnected ? (
          <div className="gh-connected-wrapper" style={{ position: 'relative' }}>
            <button
              className="gh-token-set gh-connected-btn"
              onClick={() => setShowGhMenu(v => !v)}
              title="خيارات GitHub"
            >
              {githubUser?.avatar ? (
                <>
                  <img src={githubUser.avatar} alt={githubUser.login} className="gh-user-avatar" />
                  <span className="gh-user-name">{githubUser.name || githubUser.login}</span>
                  <span className="gh-user-repos">({githubUser.repos} repos)</span>
                </>
              ) : (
                <>
                  <Github size={13} />
                  <span>GitHub متصل ✓</span>
                </>
              )}
              <ChevronDown size={12} className={showGhMenu ? 'rotated' : ''} />
            </button>
            {showGhMenu && (
              <div className="gh-dropdown-menu">
                <button className="gh-dropdown-item" onClick={() => { setShowGhMenu(false); fetchRepos() }}>
                  <FolderOpen size={13} />
                  عرض مستودعاتي
                </button>
                {githubUser?.url && (
                  <a href={githubUser.url} target="_blank" rel="noreferrer" className="gh-dropdown-item">
                    <Github size={13} />
                    فتح الملف الشخصي
                  </a>
                )}
                <button className="gh-dropdown-item gh-dropdown-item--danger" onClick={clearToken}>
                  <Trash2 size={13} />
                  تسجيل الخروج
                </button>
              </div>
            )}
          </div>
        ) : oauthEnabled ? (
          <div className="gh-oauth-section">
            <a href="/api/auth/github" className="gh-oauth-connect-btn">
              <Github size={14} />
              الاتصال بـ GitHub
            </a>
            <span className="gh-oauth-optional">اختياري · للمشاريع والكود</span>
          </div>
        ) : (
          <GitHubTokenPanel token={githubToken} onSave={saveToken} onClear={clearToken} />
        )}
        <button
          className={`gh-log-toggle ${showLog ? 'active' : ''}`}
          onClick={() => setShowLog(!showLog)}
          title="سجل الإجراءات"
        >
          <Terminal size={13} />
          السجل ({actionLog.length})
        </button>
      </div>

      {/* Auth error */}
      {authError && (
        <div className="dz-auth-error">
          <span>⚠️ {authError}</span>
          <button onClick={() => setAuthError(null)}>×</button>
        </div>
      )}

      {/* Action Log Panel */}
      {showLog && <ActionLogPanel entries={actionLog} />}

      {/* Welcome Screen OR Messages — mutually exclusive to avoid flex space split */}
      {messages.length === 0 && !isLoading && !showLog ? (
        <div className="dz-welcome">
          <div className="dz-welcome-icon">
            <Bot size={30} />
          </div>
          <h2 className="dz-welcome-title">DZ Agent</h2>
          <p className="dz-welcome-sub">
            مساعدك الذكي للأخبار · الرياضة · الطقس · GitHub
            {isGithubConnected && <span className="dz-gh-connected-badge"> · GitHub متصل ✓</span>}
          </p>

          <DZInvocationGuide onSend={(cmd) => sendMessage(cmd)} />

          {!isGithubConnected && (
            <div className="dz-github-note">
              <Github size={14} className="dz-github-note-icon" />
              <span>
                ربط GitHub <strong>اختياري</strong> — مطلوب فقط إذا أردت تصحيح كود في مشروعك، إنشاء مشروع جديد، أو الحصول على مساعدة في بناء مشروع.
              </span>
              {oauthEnabled && (
                <a href="/api/auth/github" className="dz-github-note-btn">
                  <Github size={12} /> ربط الآن
                </a>
              )}
            </div>
          )}

          <DZSuggestionCards onSend={(cmd) => sendMessage(cmd)} />
        </div>
      ) : (
      /* Messages */
      <div className="dz-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`dz-message dz-message--${msg.role}`}>
            <div className="dz-message-avatar">
              {msg.role === 'user' ? (
                <div className="dz-avatar dz-avatar--user">U</div>
              ) : (
                <div className={`dz-avatar dz-avatar--bot ${msg.isError ? 'dz-avatar--error' : ''}`}>
                  <Sparkles size={15} />
                </div>
              )}
            </div>
            <div className="dz-message-body">
              <div className="dz-message-sender">
                {msg.role === 'user' ? 'You' : 'DZ Agent'}
              </div>
              <div className={`dz-message-text ${msg.isError ? 'dz-message-text--error' : ''}`}>
                {msg.role === 'assistant' ? (
                  typingId === msg.id && msg.richType === 'text' ? (
                    <TypingEffect text={msg.content} onDone={() => setTypingId(null)} />
                  ) : (
                    <>
                      {msg.content && (
                        <ReactMarkdown
                          components={{
                            code({ className, children, ...props }) {
                              const isBlock = className?.startsWith('language-')
                              if (isBlock) return <DZCodeBlock className={className}>{children}</DZCodeBlock>
                              return <code className={className} {...props}>{children}</code>
                            },
                            pre({ children }) { return <>{children}</> },
                          }}
                        >{msg.content}</ReactMarkdown>
                      )}
                      {msg.showDevCard && <DeveloperCard />}
                      {msg.richType === 'repos' && msg.repos && (
                        <ReposList
                          repos={msg.repos}
                          onSelect={selectRepo}
                          onExport={handleExportRepos}
                        />
                      )}
                      {msg.richType === 'repo-selected' && msg.selectedRepo && (
                        <RepoActionPanel
                          repo={msg.selectedRepo}
                          onAction={handleRepoAction}
                        />
                      )}
                      {msg.richType === 'files' && msg.files && (
                        <FilesList
                          files={msg.files}
                          repo={currentRepo}
                          currentPath={currentPath}
                          onSelectFile={(f) => fetchFileContent(currentRepo, f.path)}
                          onSelectDir={(d) => fetchFiles(currentRepo, d.path)}
                        />
                      )}
                      {msg.richType === 'file-content' && msg.fileContent && (
                        <FileContentView
                          path={msg.fileContent.path}
                          content={msg.fileContent.content}
                          repo={msg.fileContent.repo}
                          onAnalyze={() => analyzeCode(msg.fileContent!.repo, msg.fileContent!.path, msg.fileContent!.content)}
                          onEdit={() => prepareEdit(msg.fileContent!)}
                        />
                      )}
                      {msg.richType === 'code-analysis' && msg.codeAnalysis && (
                        <CodeAnalysisPanel
                          data={msg.codeAnalysis.data}
                          filePath={msg.codeAnalysis.filePath}
                          fileContent={msg.codeAnalysis.fileContent}
                          repo={msg.codeAnalysis.repo}
                          onAction={(action, issue) => executeCodeAction(
                            action,
                            msg.codeAnalysis!.filePath,
                            msg.codeAnalysis!.fileContent,
                            msg.codeAnalysis!.repo,
                            issue
                          )}
                        />
                      )}
                      {msg.richType === 'branches' && msg.branches && msg.selectedRepo && (
                        <BranchesPanel branches={msg.branches} repo={msg.selectedRepo.full_name} />
                      )}
                      {msg.richType === 'issues' && msg.issues && msg.selectedRepo && (
                        <IssuesPanel issues={msg.issues} repo={msg.selectedRepo.full_name} />
                      )}
                      {msg.richType === 'pulls' && msg.pulls && msg.selectedRepo && (
                        <PullsPanel pulls={msg.pulls} repo={msg.selectedRepo.full_name} />
                      )}
                      {msg.richType === 'stats' && msg.stats && (
                        <StatsPanel stats={msg.stats} />
                      )}
                      {msg.richType === 'approval' && msg.pendingAction && (
                        <ApprovalDialog
                          action={msg.pendingAction}
                          onApprove={() => executeApprovedAction(msg.pendingAction!, msg.id)}
                          onCancel={() => {
                            setMessages(prev => prev.map(m =>
                              m.id === msg.id ? { ...m, pendingAction: undefined, content: 'تم إلغاء الإجراء من قِبل المستخدم.' } : m
                            ))
                            addToLog({ type: msg.pendingAction!.type, description: 'تم الإلغاء', status: 'error', repo: msg.pendingAction!.repo })
                          }}
                        />
                      )}
                    </>
                  )
                ) : (
                  msg.content
                )}
              </div>
              {msg.role === 'assistant' && !msg.pendingAction && (
                <div className="dz-message-actions">
                  {msg.content && (
                    <button className="dz-action-btn" onClick={() => copyMessage(msg.id, msg.content)}>
                      {copiedId === msg.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedId === msg.id ? 'تم النسخ' : 'نسخ'}
                    </button>
                  )}
                  {msg.id === messages[messages.length - 1]?.id && msg.richType === 'text' && (
                    <button className="dz-action-btn" onClick={regenerate}>
                      <RotateCcw size={13} />
                      إعادة المحاولة
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="dz-message dz-message--assistant">
            <div className="dz-message-avatar">
              <div className="dz-avatar dz-avatar--bot dz-avatar--thinking">
                {thinkingStep?.type === 'read'    ? <BookOpen size={15} /> :
                 thinkingStep?.type === 'analyze' ? <Zap size={15} /> :
                 thinkingStep?.type === 'write'   ? <Pencil size={15} /> :
                 thinkingStep?.type === 'scan'    ? <ShieldAlert size={15} /> :
                 thinkingStep?.type === 'commit'  ? <GitCommit size={15} /> :
                 thinkingStep?.type === 'pr'      ? <GitPullRequest size={15} /> :
                 thinkingStep?.type === 'search'  ? <Search size={15} /> :
                 thinkingStep?.type === 'list'    ? <FolderOpen size={15} /> :
                 <Sparkles size={15} />}
              </div>
            </div>
            <div className="dz-message-body">
              <div className="dz-message-sender">DZ Agent</div>
              {thinkingStep ? (
                <div className="dz-thinking-step">
                  <span className="dz-thinking-label">{thinkingStep.label}</span>
                  <div className="dz-typing-indicator">
                    <span /><span /><span />
                  </div>
                </div>
              ) : (
                <div className="dz-typing-indicator">
                  <span /><span /><span />
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      )}

      {/* Input */}
      <div className="dz-input-area">
        {messages.length > 0 && (
          <button className="dz-clear-btn" onClick={clearChat}>مسح المحادثة</button>
        )}
        <div className="dz-input-container">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isGithubConnected
              ? (language === 'fr' ? 'Écrivez votre message... (GitHub connecté ✓)' : language === 'en' ? 'Type your message... (GitHub connected ✓)' : 'أكتب رسالتك... (GitHub متصل ✓)')
              : (language === 'fr' ? 'Écrivez votre message à DZ Agent...' : language === 'en' ? 'Type your message to DZ Agent...' : 'أكتب رسالتك لـ DZ Agent...')
            }
            rows={1}
            className="dz-chat-input"
          />
          <div className="dz-input-actions">
            {isLoading ? (
              <button className="dz-stop-btn" onClick={() => { abortRef.current?.abort(); setIsLoading(false) }}>إيقاف</button>
            ) : (
              <button className="dz-send-btn" onClick={() => sendMessage()} disabled={!input.trim()}>
                <Send size={18} />
              </button>
            )}
          </div>
        </div>
        <p className="dz-disclaimer">قد يُخطئ DZ Agent. راجع دائماً قبل الموافقة على إجراءات GitHub.</p>
      </div>
    </div>
  )
}
