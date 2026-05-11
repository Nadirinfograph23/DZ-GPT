import { useEffect, useRef } from 'react'
import {
  Brain, ClipboardList, Code2, ScanSearch, CheckCircle2,
  XCircle, Loader2, Wrench, TestTube2, Search, Sparkles,
  Construction, AlertCircle,
} from 'lucide-react'

export type AgentStepIcon =
  | 'think' | 'plan' | 'write' | 'scan' | 'done' | 'error'
  | 'build' | 'test' | 'search' | 'fix' | 'warn'

export type AgentStepStatus = 'pending' | 'running' | 'done' | 'error' | 'warn'

export interface AgentStep {
  id: string
  label: string
  icon: AgentStepIcon
  status: AgentStepStatus
  detail?: string
}

interface AgentStepsPanelProps {
  steps: AgentStep[]
  taskType?: string
  taskLabel?: string
}

const ICON_MAP: Record<AgentStepIcon, React.ReactNode> = {
  think:  <Brain size={13} />,
  plan:   <ClipboardList size={13} />,
  write:  <Code2 size={13} />,
  scan:   <ScanSearch size={13} />,
  done:   <CheckCircle2 size={13} />,
  error:  <XCircle size={13} />,
  build:  <Construction size={13} />,
  test:   <TestTube2 size={13} />,
  search: <Search size={13} />,
  fix:    <Wrench size={13} />,
  warn:   <AlertCircle size={13} />,
}

const TASK_LABELS: Record<string, string> = {
  code:     '⚙️ وضع توليد الكود',
  debug:    '🔍 وضع التصحيح',
  clone:    '🌐 وضع الاستنساخ',
  research: '🔬 وضع البحث',
  general:  '🤖 وضع عام',
}

export default function AgentStepsPanel({ steps, taskType, taskLabel }: AgentStepsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [steps.length])

  if (!steps.length) return null

  const modeLabel = taskLabel ?? (taskType ? TASK_LABELS[taskType] : null) ?? '🤖 DZ Agent'
  const activeStep = steps.find(s => s.status === 'running')
  const doneCount = steps.filter(s => s.status === 'done').length
  const hasError = steps.some(s => s.status === 'error')
  const isDone = steps.some(s => s.id === 'done' && s.status === 'done')

  return (
    <div className="asp-wrapper" ref={panelRef}>
      <div className="asp-header">
        <span className="asp-mode-badge">
          <Sparkles size={10} />
          {modeLabel}
        </span>
        {!isDone && !hasError && activeStep && (
          <span className="asp-status-text">
            <Loader2 size={11} className="asp-spin" />
            {activeStep.label}
          </span>
        )}
        {isDone && (
          <span className="asp-status-text asp-status-text--done">
            <CheckCircle2 size={11} />
            اكتمل ({doneCount} خطوة)
          </span>
        )}
        {hasError && !isDone && (
          <span className="asp-status-text asp-status-text--error">
            <XCircle size={11} />
            خطأ
          </span>
        )}
      </div>

      <div className="asp-steps">
        {steps.map((step, idx) => (
          <div
            key={step.id + idx}
            className={`asp-step asp-step--${step.status}`}
          >
            <div className="asp-step-left">
              <div className={`asp-step-dot asp-step-dot--${step.status}`}>
                {step.status === 'running' ? (
                  <Loader2 size={11} className="asp-spin" />
                ) : step.status === 'done' ? (
                  <CheckCircle2 size={11} />
                ) : step.status === 'error' ? (
                  <XCircle size={11} />
                ) : step.status === 'warn' ? (
                  <AlertCircle size={11} />
                ) : (
                  ICON_MAP[step.icon] ?? <span className="asp-dot-inner" />
                )}
              </div>
              {idx < steps.length - 1 && (
                <div className={`asp-connector asp-connector--${step.status === 'pending' ? 'pending' : 'active'}`} />
              )}
            </div>
            <div className="asp-step-body">
              <div className="asp-step-label">
                <span className="asp-step-icon">{ICON_MAP[step.icon]}</span>
                {step.label}
              </div>
              {step.detail && (
                <div className="asp-step-detail">{step.detail}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
