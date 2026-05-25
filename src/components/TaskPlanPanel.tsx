/**
 * TaskPlanPanel.tsx — Smart Task Planner UI
 * Shows a structured execution plan before the agent runs a complex task.
 * User must click "تنفيذ الخطة" to approve or "إلغاء" to cancel.
 */
import { useState } from 'react'
import { Play, X, Clock, Zap, ChevronRight } from 'lucide-react'

export interface PlanStep {
  id: number
  icon: string
  title: string
  description: string
  category: string
  color: string
}

export interface TaskPlan {
  title: string
  summary: string
  estimated_time: string
  complexity: 'low' | 'medium' | 'high'
  steps: PlanStep[]
}

interface Props {
  plan: TaskPlan
  query: string
  onApprove: () => void
  onCancel: () => void
}

const COMPLEXITY_LABEL: Record<string, string> = {
  low:    'بسيط',
  medium: 'متوسط',
  high:   'معقد',
}
const COMPLEXITY_COLOR: Record<string, string> = {
  low:    '#34d399',
  medium: '#fbbf24',
  high:   '#f87171',
}

export default function TaskPlanPanel({ plan, onApprove, onCancel }: Props) {
  const [approved, setApproved] = useState(false)
  const complexity = plan.complexity || 'medium'

  const handleApprove = () => {
    setApproved(true)
    onApprove()
  }

  return (
    <div className="tpp-wrapper">
      {/* Header */}
      <div className="tpp-header">
        <div className="tpp-header-left">
          <span className="tpp-icon">📋</span>
          <div>
            <div className="tpp-title">{plan.title}</div>
            <div className="tpp-summary">{plan.summary}</div>
          </div>
        </div>
        <div className="tpp-meta">
          <span className="tpp-badge tpp-badge--time">
            <Clock size={10} /> {plan.estimated_time}
          </span>
          <span
            className="tpp-badge tpp-badge--complexity"
            style={{ color: COMPLEXITY_COLOR[complexity], borderColor: COMPLEXITY_COLOR[complexity] + '55' }}
          >
            <Zap size={10} /> {COMPLEXITY_LABEL[complexity] || complexity}
          </span>
        </div>
      </div>

      {/* Steps */}
      <div className="tpp-steps">
        {(plan.steps || []).map((step, i) => (
          <div key={step.id} className="tpp-step">
            {/* Connector line */}
            {i < plan.steps.length - 1 && <div className="tpp-connector" />}

            {/* Dot */}
            <div className="tpp-dot" style={{ borderColor: step.color, boxShadow: `0 0 6px ${step.color}44` }}>
              <span className="tpp-dot-icon">{step.icon}</span>
            </div>

            {/* Body */}
            <div className="tpp-step-body">
              <div className="tpp-step-header">
                <span className="tpp-step-num">{step.id}</span>
                <span className="tpp-step-title">{step.title}</span>
                <ChevronRight size={11} className="tpp-step-arrow" style={{ color: step.color }} />
              </div>
              <div className="tpp-step-desc">{step.description}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer — action buttons */}
      {!approved ? (
        <div className="tpp-footer">
          <button className="tpp-btn tpp-btn--cancel" onClick={onCancel}>
            <X size={13} /> إلغاء
          </button>
          <button className="tpp-btn tpp-btn--approve" onClick={handleApprove}>
            <Play size={13} /> تنفيذ الخطة
          </button>
        </div>
      ) : (
        <div className="tpp-footer tpp-footer--running">
          <span className="tpp-running-dot" />
          <span className="tpp-running-label">جاري التنفيذ...</span>
        </div>
      )}
    </div>
  )
}
