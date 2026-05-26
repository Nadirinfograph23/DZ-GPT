import { useState, useEffect, useRef, useCallback } from 'react'
import {
  GitBranch, Github, Rocket, CheckCircle2, Circle,
  Loader2, ChevronDown, ChevronRight, ExternalLink,
  Plus, AlertCircle, Code2, Globe, Zap, Terminal, Search, Cpu, Upload
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

const makeSteps = (): PipelineStep[] =>
  INITIAL_STEPS.map(s => ({ ...s, details: [] }))

export default function DZAgentGitHub() {
  const [task, setTask]         = useState('')
  const [repoName, setRepoName] = useState('')
  const [steps, setSteps]       = useState<PipelineStep[]>(makeSteps)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult]     = useState<TaskResult | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({})
  const [githubStatus, setGithubStatus] = useState<{
    ok: boolean; login?: string; avatar?: string
  } | null>(null)
  const [history, setHistory] = useState<TaskHistory[]>(() => {
    try { return JSON.parse(localStorage.getItem('dz-agent-gh-history') || '[]') } catch { return [] }
  })

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/dz-agent/github/agent-status')
      .then(r => r.json())
      .then(d => setGithubStatus(d))
      .catch(() => setGithubStatus({ ok: false }))
  }, [])

  useEffect(() => {
    localStorage.setItem('dz-agent-gh-history', JSON.stringify(history.slice(0, 50)))
  }, [history])

  const resetPipeline = () => {
    setSteps(makeSteps())
    setResult(null)
    setError(null)
    setShowDetails({})
  }

  const updateStep = useCallback((id: string, patch: Partial<PipelineStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }, [])

  const addDetail = useCallback((id: string, text: string) => {
    setSteps(prev => prev.map(s =>
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
        body: JSON.stringify({
          task: task.trim(),
          repoName: repoName.trim() || undefined,
        }),
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
            } else if (msg.type === 'result') {
              Object.assign(taskResult, msg.data)
              setResult({ ...taskResult })
            } else if (msg.type === 'error') {
              setError(msg.message)
              setSteps(prev => prev.map(s =>
                s.status === 'running' ? { ...s, status: 'error' } : s
              ))
            }
          } catch {}
        }
      }

      setHistory(prev => [{
        id: taskId,
        task: task.trim(),
        createdAt: Date.now(),
        status: taskResult.repoUrl ? 'done' : 'error',
        result: taskResult,
      }, ...prev])

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع'
      setError(msg)
      setSteps(prev => prev.map(s =>
        s.status === 'running' ? { ...s, status: 'error' } : s
      ))
    } finally {
      setIsRunning(false)
    }
  }, [task, repoName, isRunning, updateStep, addDetail])

  const handleStop = () => {
    abortRef.current?.abort()
    setIsRunning(false)
  }

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
            <span>GitHub Workflow Engine</span>
          </div>
          <div className="dzgh-header-branch">
            <Code2 size={13} />
            <span>devin/1774405518-init-dz-gpt</span>
          </div>
        </header>

        <div className="dzgh-content">

          {/* ===== INPUT ===== */}
          <div className="dzgh-input-section">
            <div className="dzgh-input-label">وصف المهمة</div>
            <textarea
              className="dzgh-textarea"
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder={
                'مثال: أنشئ موقع portfolio React احترافي ونشره على GitHub Pages\n' +
                'مثال: ابني لوحة تحكم Bootstrap مع رسوم بيانية\n' +
                'مثال: أنشئ أداة حاسبة HTML/CSS/JS'
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
                placeholder="اسم المستودع (اختياري — يُولَّد تلقائياً)"
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

          {/* ===== PIPELINE ===== */}
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
                          showDetails[step.id]
                            ? <ChevronDown size={12} />
                            : <ChevronRight size={12} />
                        )}
                      </div>
                      {showDetails[step.id] && step.details.length > 0 && (
                        <div className="dzgh-step-details">
                          {step.details.map((d, i) => (
                            <div key={i} className="dzgh-step-detail">{d}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===== ERROR ===== */}
          {error && (
            <div className="dzgh-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* ===== RESULT ===== */}
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
                {result.prUrl && (
                  <a href={result.prUrl} target="_blank" rel="noopener noreferrer" className="dzgh-link dzgh-link--pr">
                    <GitBranch size={13} /> Pull Request <ExternalLink size={11} />
                  </a>
                )}
              </div>
              {result.commitSha && (
                <div className="dzgh-result-commit">
                  <code>commit: {result.commitSha.slice(0, 12)}</code>
                </div>
              )}
              {result.files && result.files.length > 0 && (
                <div className="dzgh-result-files">
                  <div className="dzgh-result-files-title">الملفات المرفوعة ({result.files.length})</div>
                  {result.files.map((f, i) => (
                    <div key={i} className="dzgh-result-file">{f}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ===== WELCOME ===== */}
          {!isPipelineActive && !result && !error && (
            <div className="dzgh-welcome">
              <div className="dzgh-welcome-icon">
                <Github size={52} />
              </div>
              <div className="dzgh-welcome-title">DZ Agent — GitHub Builder</div>
              <div className="dzgh-welcome-desc">
                وصّف مشروعك وسأنفذ تلقائياً: إنشاء المستودع ← كتابة الكود بالـ AI ← النشر على GitHub Pages ← مزامنة Vercel
              </div>
              <div className="dzgh-examples">
                {[
                  'أنشئ موقع portfolio React احترافي',
                  'ابني لوحة تحكم مع رسوم بيانية',
                  'أنشئ أداة حاسبة HTML/CSS/JS',
                  'ابني صفحة هبوط Bootstrap',
                ].map(ex => (
                  <button key={ex} className="dzgh-example-btn" onClick={() => setTask(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
