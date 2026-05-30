import { useState, useEffect, useRef, useCallback } from 'react'
import {
  GitBranch, Github, Rocket, CheckCircle2, Circle,
  Loader2, ChevronDown, ChevronRight, ExternalLink,
  Plus, AlertCircle, Code2, Globe, Zap, Terminal, Search, Cpu, Upload,
  Eye, EyeOff, Edit3, RefreshCw, Send, Monitor
} from 'lucide-react'
import '../styles/dz-agent-github.css'

type PipelineStatus = 'idle' | 'running' | 'done' | 'error'

interface PipelineStep {
  id: string
  labelAr: string
  icon: React.ReactNode
  status: PipelineStatus
  details: string[]
}

interface TaskResult {
  repoUrl?: string
  pagesUrl?: string
  vercelUrl?: string
  commitSha?: string
  files?: string[]
  prUrl?: string
  vercelDeployId?: string
  modifiedHtml?: string
}

interface TaskHistory {
  id: string
  task: string
  createdAt: number
  status: PipelineStatus
  result?: TaskResult
}

const INITIAL_STEPS: Omit<PipelineStep, 'details'>[] = [
  { id: 'analyze',  labelAr: 'تحليل المهمة',        icon: <Search size={14} />,   status: 'idle' },
  { id: 'generate', labelAr: 'توليد الكود بالـ AI',  icon: <Cpu size={14} />,      status: 'idle' },
  { id: 'push',     labelAr: 'رفع إلى GitHub',       icon: <Upload size={14} />,   status: 'idle' },
  { id: 'deploy',   labelAr: 'نشر GitHub Pages',     icon: <Rocket size={14} />,   status: 'idle' },
  { id: 'verify',   labelAr: 'مزامنة Vercel',        icon: <Globe size={14} />,    status: 'idle' },
]

const EDIT_STEPS: Omit<PipelineStep, 'details'>[] = [
  { id: 'fetch',  labelAr: 'جلب الكود الحالي',     icon: <Search size={14} />,  status: 'idle' },
  { id: 'modify', labelAr: 'تعديل بالذكاء الاصطناعي', icon: <Cpu size={14} />,  status: 'idle' },
  { id: 'push',   labelAr: 'رفع التعديلات',         icon: <Upload size={14} />, status: 'idle' },
]

const makeSteps = (defs: Omit<PipelineStep, 'details'>[] = INITIAL_STEPS): PipelineStep[] =>
  defs.map(s => ({ ...s, details: [] }))

export default function DZAgentGitHub() {
  const [task, setTask]           = useState('')
  const [repoName, setRepoName]   = useState('')
  const [steps, setSteps]         = useState<PipelineStep[]>(makeSteps())
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult]       = useState<TaskResult | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({})
  const [githubStatus, setGithubStatus] = useState<{ ok: boolean; login?: string; avatar?: string } | null>(null)
  const [history, setHistory]     = useState<TaskHistory[]>(() => {
    try { return JSON.parse(localStorage.getItem('dz-agent-gh-history') || '[]') } catch { return [] }
  })

  // Preview states
  const [previewHtml, setPreviewHtml]   = useState<string | null>(null)
  const [showPreview, setShowPreview]   = useState(true)
  const [previewSiteType, setPreviewSiteType] = useState('landing')

  // Edit states
  const [editMode, setEditMode]         = useState(false)
  const [editRequest, setEditRequest]   = useState('')
  const [editSteps, setEditSteps]       = useState<PipelineStep[]>(makeSteps(EDIT_STEPS))
  const [isEditing, setIsEditing]       = useState(false)
  const [editError, setEditError]       = useState<string | null>(null)
  const [currentRepo, setCurrentRepo]   = useState<{ owner: string; repo: string } | null>(null)

  const abortRef     = useRef<AbortController | null>(null)
  const editAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/dz-agent/github/agent-status')
      .then(r => r.json())
      .then(d => setGithubStatus(d))
      .catch(() => setGithubStatus({ ok: false }))
  }, [])

  useEffect(() => {
    try { localStorage.setItem('dz-agent-gh-history', JSON.stringify(history.slice(0, 50))) } catch {}
  }, [history])

  const resetPipeline = () => {
    setSteps(makeSteps())
    setResult(null)
    setError(null)
    setShowDetails({})
    setPreviewHtml(null)
    setEditMode(false)
    setEditRequest('')
    setEditSteps(makeSteps(EDIT_STEPS))
    setEditError(null)
  }

  const updateStep = useCallback((id: string, patch: Partial<PipelineStep>, setter = setSteps) => {
    setter(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }, [])

  const addDetail = useCallback((id: string, text: string, setter = setSteps) => {
    setter(prev => prev.map(s =>
      s.id === id ? { ...s, details: [...s.details, text] } : s
    ))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!task.trim() || isRunning) return
    setIsRunning(true)
    resetPipeline()
    const taskId = Date.now().toString()
    abortRef.current = new AbortController()
    const taskResult: TaskResult = {}

    try {
      const res = await fetch('/api/dz-agent/github/agent-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: task.trim(), repoName: repoName.trim() || undefined }),
        signal: abortRef.current.signal,
      })

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'فشل الاتصال بالخادم' }))
        throw new Error(err.error || `Server error: ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6))
            if (msg.type === 'step') {
              updateStep(msg.step, { status: msg.status })
              if (msg.detail) addDetail(msg.step, msg.detail)
            } else if (msg.type === 'detail') {
              addDetail(msg.step, msg.text)
            } else if (msg.type === 'preview') {
              setPreviewHtml(msg.html)
              if (msg.siteType) setPreviewSiteType(msg.siteType)
              setShowPreview(true)
            } else if (msg.type === 'result') {
              Object.assign(taskResult, msg.data)
              setResult({ ...taskResult })
              // Extract owner/repo for edit mode
              if (msg.data.repoUrl) {
                const parts = msg.data.repoUrl.replace('https://github.com/', '').split('/')
                if (parts.length >= 2) setCurrentRepo({ owner: parts[0], repo: parts[1] })
              }
            } else if (msg.type === 'error') {
              setError(msg.message)
              setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s))
            }
          } catch {}
        }
      }

      setHistory(prev => [{
        id: taskId, task: task.trim(), createdAt: Date.now(),
        status: taskResult.repoUrl ? 'done' : 'error',
        result: taskResult,
      }, ...prev])

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع'
      setError(msg)
      setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s))
    } finally {
      setIsRunning(false)
    }
  }, [task, repoName, isRunning, updateStep, addDetail])

  const handleEdit = useCallback(async () => {
    if (!editRequest.trim() || isEditing || !currentRepo) return
    setIsEditing(true)
    setEditSteps(makeSteps(EDIT_STEPS))
    setEditError(null)
    editAbortRef.current = new AbortController()

    try {
      const res = await fetch('/api/dz-agent/github/agent-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: currentRepo.owner,
          repo: currentRepo.repo,
          editRequest: editRequest.trim(),
          currentHtml: previewHtml || undefined,
        }),
        signal: editAbortRef.current.signal,
      })

      if (!res.ok || !res.body) throw new Error('فشل الاتصال')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6))
            if (msg.type === 'step') {
              updateStep(msg.step, { status: msg.status }, setEditSteps)
              if (msg.detail) addDetail(msg.step, msg.detail, setEditSteps)
            } else if (msg.type === 'detail') {
              addDetail(msg.step, msg.text, setEditSteps)
            } else if (msg.type === 'preview') {
              setPreviewHtml(msg.html)
              setShowPreview(true)
            } else if (msg.type === 'result') {
              setResult(prev => ({ ...prev, ...msg.data }))
              setEditRequest('')
            } else if (msg.type === 'error') {
              setEditError(msg.message)
              setEditSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s))
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setEditError(err instanceof Error ? err.message : 'خطأ غير متوقع')
    } finally {
      setIsEditing(false)
    }
  }, [editRequest, isEditing, currentRepo, previewHtml, updateStep, addDetail])

  const handleStop = () => { abortRef.current?.abort(); setIsRunning(false) }

  const isPipelineActive = isRunning || steps.some(s => s.status !== 'idle')

  return (
    <div className="dzgh-layout">

      {/* ===== SIDEBAR ===== */}
      <aside className="dzgh-sidebar">
        <div className="dzgh-sidebar-header">
          <div className="dzgh-logo">
            <Github size={20} />
            <div>
              <div className="dzgh-logo-name">DZ Agent</div>
              <div className="dzgh-logo-sub">GitHub Builder</div>
            </div>
          </div>
        </div>

        <div className={`dzgh-status-badge ${githubStatus?.ok ? 'dzgh-status-badge--connected' : 'dzgh-status-badge--disconnected'}`}>
          <div className="dzgh-status-dot" />
          {githubStatus?.ok
            ? <span>EXECUTION MODE — @{githubStatus.login}</span>
            : <span>GitHub غير متصل</span>
          }
        </div>

        <button
          className="dzgh-new-btn"
          onClick={() => { setTask(''); setRepoName(''); resetPipeline() }}
        >
          <Plus size={14} /> مهمة جديدة
        </button>

        <div className="dzgh-history">
          {history.length === 0 ? (
            <div className="dzgh-history-empty">لا توجد مهام سابقة</div>
          ) : (
            history.map(h => (
              <div key={h.id} className="dzgh-history-item" onClick={() => setTask(h.task)}>
                <div className={`dzgh-history-dot dzgh-history-dot--${h.status}`} />
                <div className="dzgh-history-text">{h.task.slice(0, 45)}{h.task.length > 45 ? '…' : ''}</div>
                <div className="dzgh-history-time">
                  {new Date(h.createdAt).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ===== MAIN ===== */}
      <main className="dzgh-main">
        <header className="dzgh-header">
          <div className="dzgh-header-title">
            <GitBranch size={18} />
            <span>DZ Agent Workflow Engine</span>
          </div>
          <div className="dzgh-header-right">
            {previewHtml && (
              <button
                className={`dzgh-preview-toggle ${showPreview ? 'dzgh-preview-toggle--active' : ''}`}
                onClick={() => setShowPreview(p => !p)}
              >
                {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{showPreview ? 'إخفاء المعاينة' : 'إظهار المعاينة'}</span>
              </button>
            )}
            <div className="dzgh-header-branch">
              <Code2 size={13} />
              <span>devin/1774405518-init-dz-gpt</span>
            </div>
          </div>
        </header>

        {/* ===== SPLIT VIEW: CONTROLS + PREVIEW ===== */}
        <div className={`dzgh-workspace ${previewHtml && showPreview ? 'dzgh-workspace--split' : ''}`}>

          {/* ===== LEFT PANEL: Controls ===== */}
          <div className="dzgh-controls-panel">
            <div className="dzgh-content">

              {/* INPUT */}
              <div className="dzgh-input-section">
                <div className="dzgh-input-label">وصف المهمة</div>
                <textarea
                  className="dzgh-textarea"
                  value={task}
                  onChange={e => setTask(e.target.value)}
                  placeholder={
                    'مثال: أنشئ موقع مطعم جزائري احترافي\n' +
                    'مثال: ابني موقع portfolio لمصمم غرافيك\n' +
                    'مثال: أنشئ متجر إلكتروني للإكسسوارات'
                  }
                  disabled={isRunning}
                  rows={4}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit() }}
                />
                <div className="dzgh-input-row">
                  <input
                    className="dzgh-input-repo"
                    value={repoName}
                    onChange={e => setRepoName(e.target.value)}
                    placeholder="اسم المستودع (اختياري)"
                    disabled={isRunning}
                  />
                  <button
                    className={`dzgh-run-btn${isRunning ? ' dzgh-run-btn--stop' : ''}`}
                    onClick={isRunning ? handleStop : handleSubmit}
                    disabled={!task.trim() && !isRunning}
                  >
                    {isRunning
                      ? <><Loader2 size={15} className="dzgh-spin" /> إيقاف</>
                      : <><Rocket size={15} /> تنفيذ</>
                    }
                  </button>
                </div>
                <div className="dzgh-hint">Ctrl+Enter للتنفيذ السريع</div>
              </div>

              {/* PIPELINE */}
              {isPipelineActive && (
                <div className="dzgh-pipeline">
                  <div className="dzgh-pipeline-title">
                    <Terminal size={13} />
                    <span>خطة العمل</span>
                  </div>
                  <div className="dzgh-steps">
                    {steps.map(step => (
                      <div key={step.id} className={`dzgh-step dzgh-step--${step.status}`}>
                        <div className="dzgh-step-icon-wrap">
                          {step.status === 'running'
                            ? <Loader2 size={14} className="dzgh-spin" />
                            : step.status === 'done'
                              ? <CheckCircle2 size={14} />
                              : step.status === 'error'
                                ? <AlertCircle size={14} />
                                : <Circle size={14} />
                          }
                        </div>
                        <div className="dzgh-step-body">
                          <div
                            className="dzgh-step-header"
                            onClick={() => step.details.length > 0 && setShowDetails(p => ({ ...p, [step.id]: !p[step.id] }))}
                          >
                            <span className="dzgh-step-label">{step.labelAr}</span>
                            {step.details.length > 0 && (
                              showDetails[step.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />
                            )}
                          </div>
                          {showDetails[step.id] && step.details.length > 0 && (
                            <div className="dzgh-step-details">
                              {step.details.map((d, i) => <div key={i} className="dzgh-step-detail">{d}</div>)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ERROR */}
              {error && (
                <div className="dzgh-error">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {/* RESULT */}
              {result && (
                <div className="dzgh-result">
                  <div className="dzgh-result-title">
                    <CheckCircle2 size={16} />
                    <span>اكتملت المهمة بنجاح</span>
                  </div>
                  <div className="dzgh-result-links">
                    {result.repoUrl && (
                      <a href={result.repoUrl} target="_blank" rel="noopener noreferrer" className="dzgh-link dzgh-link--github">
                        <Github size={13} /> المستودع <ExternalLink size={11} />
                      </a>
                    )}
                    {result.pagesUrl && (
                      <a href={result.pagesUrl} target="_blank" rel="noopener noreferrer" className="dzgh-link dzgh-link--pages">
                        <Globe size={13} /> GitHub Pages <ExternalLink size={11} />
                      </a>
                    )}
                    {result.vercelUrl && (
                      <a href={result.vercelUrl} target="_blank" rel="noopener noreferrer" className="dzgh-link dzgh-link--vercel">
                        <Zap size={13} /> Vercel Live <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                  {result.commitSha && (
                    <div className="dzgh-result-commit">
                      <code>commit: {result.commitSha.slice(0, 12)}</code>
                    </div>
                  )}

                  {/* EDIT SECTION */}
                  <div className="dzgh-edit-section">
                    <button
                      className={`dzgh-edit-toggle ${editMode ? 'dzgh-edit-toggle--active' : ''}`}
                      onClick={() => setEditMode(p => !p)}
                    >
                      <Edit3 size={13} />
                      <span>{editMode ? 'إخفاء التعديل' : 'عدّل الموقع وأعد نشره'}</span>
                    </button>

                    {editMode && (
                      <div className="dzgh-edit-form">
                        <div className="dzgh-edit-label">
                          <RefreshCw size={12} />
                          <span>ما التعديل المطلوب؟</span>
                        </div>
                        <textarea
                          className="dzgh-edit-textarea"
                          value={editRequest}
                          onChange={e => setEditRequest(e.target.value)}
                          placeholder={'مثال: غيّر لون الـ hero إلى بنفسجي\nمثال: أضف قسم آراء العملاء\nمثال: ترجم المحتوى للفرنسية'}
                          disabled={isEditing}
                          rows={3}
                          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleEdit() }}
                        />
                        <button
                          className="dzgh-edit-btn"
                          onClick={handleEdit}
                          disabled={!editRequest.trim() || isEditing || !currentRepo}
                        >
                          {isEditing
                            ? <><Loader2 size={13} className="dzgh-spin" /> جارٍ التعديل...</>
                            : <><Send size={13} /> تطبيق التعديل ونشره</>
                          }
                        </button>

                        {/* EDIT PIPELINE */}
                        {isEditing && (
                          <div className="dzgh-edit-pipeline">
                            {editSteps.map(step => (
                              <div key={step.id} className={`dzgh-edit-step dzgh-edit-step--${step.status}`}>
                                <div className="dzgh-edit-step-icon">
                                  {step.status === 'running'
                                    ? <Loader2 size={12} className="dzgh-spin" />
                                    : step.status === 'done'
                                      ? <CheckCircle2 size={12} />
                                      : step.status === 'error'
                                        ? <AlertCircle size={12} />
                                        : <Circle size={12} />
                                  }
                                </div>
                                <span>{step.labelAr}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {editError && (
                          <div className="dzgh-error" style={{ fontSize: '12px' }}>
                            <AlertCircle size={13} /> {editError}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* WELCOME */}
              {!isPipelineActive && !result && !error && (
                <div className="dzgh-welcome">
                  <div className="dzgh-welcome-icon"><Github size={52} /></div>
                  <div className="dzgh-welcome-title">DZ Agent — GitHub Builder</div>
                  <div className="dzgh-welcome-desc">
                    وصّف مشروعك وسأنفذ تلقائياً: تحليل ← توليد موقع عصري ← معاينة فورية ← رفع لـ GitHub Pages
                  </div>
                  <div className="dzgh-examples">
                    {[
                      'أنشئ موقع مطعم جزائري احترافي',
                      'ابني موقع portfolio لمطور ويب',
                      'أنشئ متجر إلكتروني للملابس',
                      'ابني موقع وكالة تصميم عصري',
                    ].map(ex => (
                      <button key={ex} className="dzgh-example-btn" onClick={() => setTask(ex)}>
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ===== RIGHT PANEL: Live Preview ===== */}
          {previewHtml && showPreview && (
            <div className="dzgh-preview-panel">
              <div className="dzgh-preview-header">
                <div className="dzgh-preview-title">
                  <Monitor size={14} />
                  <span>معاينة الموقع</span>
                  <span className="dzgh-preview-badge">{previewSiteType.toUpperCase()}</span>
                </div>
                <div className="dzgh-preview-dots">
                  <span className="dzgh-dot dzgh-dot--red" />
                  <span className="dzgh-dot dzgh-dot--yellow" />
                  <span className="dzgh-dot dzgh-dot--green" />
                </div>
              </div>
              <div className="dzgh-preview-body">
                <iframe
                  className="dzgh-preview-iframe"
                  srcDoc={previewHtml}
                  sandbox="allow-scripts allow-same-origin"
                  title="معاينة الموقع"
                />
              </div>
              {isRunning && (
                <div className="dzgh-preview-notice">
                  <Loader2 size={12} className="dzgh-spin" />
                  <span>جارٍ النشر على GitHub Pages...</span>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
