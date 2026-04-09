import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Bot, Copy, Check, RotateCcw, Sparkles, Github,
  FolderOpen, FileText, ChevronRight, ChevronDown, AlertCircle,
  CheckCircle2, XCircle, GitCommit, GitPullRequest,
  Key, Trash2, RefreshCw, Terminal, Zap,
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
  pendingAction?: PendingAction
  actionLog?: ActionLogEntry[]
  isError?: boolean
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

// ===== MAIN COMPONENT =====
export default function DZChatBox() {
  const [messages, setMessages] = useState<DZMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [typingId, setTypingId] = useState<string | null>(null)
  const [githubToken, setGithubToken] = useState<string>(() =>
    localStorage.getItem('dz-agent-gh-token') || ''
  )
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
        localStorage.setItem('dz-agent-gh-token', token)
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
    localStorage.setItem('dz-agent-gh-token', t)
  }, [])

  const clearToken = useCallback(() => {
    setGithubToken('')
    setGithubUser(null)
    setServerGithubConnected(false)
    setShowGhMenu(false)
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
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const fetchFiles = useCallback(async (repo: string, path = '') => {
    if (!githubToken && !serverGithubConnected) return
    setIsLoading(true)
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
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const fetchFileContent = useCallback(async (repo: string, path: string) => {
    if (!githubToken && !serverGithubConnected) return
    setIsLoading(true)
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
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const analyzeCode = useCallback(async (repo: string, path: string, content: string) => {
    setIsLoading(true)
    addToLog({ type: 'analyze-code', description: `Analyzing ${path}`, status: 'pending', repo })
    try {
      const res = await fetch('/api/dz-agent/github/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, path, content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      addAssistantMessage({ content: data.analysis, richType: 'text' })
      addToLog({ type: 'analyze-code', description: `Analysis complete for ${path}`, status: 'success', repo })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `Analysis failed: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'analyze-code', description: `Error: ${msg}`, status: 'error' })
    } finally {
      setIsLoading(false)
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
    const repoNames = repos.map(r => r.name).join('، ')
    addAssistantMessage({
      content: `✅ تم تصدير ${repos.length > 1 ? 'المستودعات' : 'المستودع'} **${repoNames}** إلى DZ Agent.\n\nالمستودع النشط الآن: \`${firstRepo.full_name}\`\n\nيمكنك الآن:\n- 📂 طلب قراءة الملفات\n- 🔍 تحليل الكود\n- ✏️ تعديل وإنشاء Commits\n- 🔀 فتح Pull Requests`,
      richType: 'text',
    })
  }, [addAssistantMessage])

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
        addAssistantMessage({ content: data.content || 'No response generated.', richType: 'text' })
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
            <Bot size={40} />
          </div>
          <h2 className="dz-welcome-title">DZ Agent</h2>
          <p className="dz-welcome-sub">
            مساعدك الذكي للأخبار · الرياضة · الطقس · GitHub
            {isGithubConnected && <span className="dz-gh-connected-badge"> · GitHub متصل ✓</span>}
          </p>

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

          {/* Live Dashboard Cards — unique to DZ Agent */}
          <div className="dz-dashboard-wrapper">
            <DZDashboard onSend={(q) => sendMessage(q)} />
          </div>

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
                      {msg.richType === 'repos' && msg.repos && (
                        <ReposList
                          repos={msg.repos}
                          onSelect={(repo) => fetchFiles(repo.full_name)}
                          onExport={handleExportRepos}
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
              <div className="dz-avatar dz-avatar--bot">
                <Sparkles size={15} />
              </div>
            </div>
            <div className="dz-message-body">
              <div className="dz-message-sender">DZ Agent</div>
              <div className="dz-typing-indicator">
                <span /><span /><span />
              </div>
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
            placeholder={isGithubConnected ? 'أكتب رسالتك... (GitHub متصل ✓)' : 'أكتب رسالتك لـ DZ Agent...'}
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
