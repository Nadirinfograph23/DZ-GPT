import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Home } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import '../styles/dz-agent-v5.css'

// ── Types ─────────────────────────────────────────────────────────────────
interface PlanStep {
  id: string
  description: string
  agent: string
  tools: string[]
  status: 'pending' | 'running' | 'done' | 'failed'
  expected_output?: string
}

interface ExecutionEvent {
  type: string
  ts?: number
  step?: { id: string; description: string; agent: string; tools: string[] }
  stepId?: string
  agent?: string
  message?: string
  tool?: string
  preview?: string
  ok?: boolean
  result?: { summary?: string; output?: string }
  error?: string
  reflection?: { quality_score?: number; summary?: string; lessons?: string[]; what_worked?: string[]; what_failed?: string[] }
  plan?: PlanStep[]
  goal?: string
  steps?: number
  duration?: number
  query?: string
  url?: string
  newSteps?: number
  reason?: string
  attempt?: number
  maxAttempts?: number
  taskType?: string
  content?: string
}

interface TaskHistory {
  taskId: string
  goal: string
  status: string
  createdAt: number
}

// ── Agent definitions ────────────────────────────────────────────────────
const AGENTS = [
  { name: 'coordinator', icon: '🧠', label: 'Coordinator' },
  { name: 'research', icon: '🔍', label: 'Research' },
  { name: 'coding', icon: '💻', label: 'Coding' },
  { name: 'web', icon: '🌐', label: 'Web' },
  { name: 'file', icon: '📁', label: 'File' },
  { name: 'devops', icon: '⚙️', label: 'DevOps' },
  { name: 'reviewer', icon: '✅', label: 'Reviewer' },
]

const TOOLS = ['web_search', 'browser', 'code_exec', 'github', 'file_read', 'file_write', 'ai_think', 'memory_search', 'youtube_search']

const SUGGESTIONS = [
  { icon: '🔍', text: 'Research the latest developments in AI agents and create a summary report' },
  { icon: '💻', text: 'Write a Python script to scrape and analyze Hacker News trending stories' },
  { icon: '🌐', text: 'Find and compare the top 5 open-source LLM frameworks on GitHub' },
  { icon: '📊', text: 'Build a data pipeline that fetches weather data and generates insights' },
]

const EVENT_ICONS: Record<string, { icon: string; type: string }> = {
  execution_start:  { icon: '🚀', type: 'info' },
  plan:             { icon: '📋', type: 'info' },
  step_start:       { icon: '▶', type: 'info' },
  step_done:        { icon: '✓', type: 'success' },
  step_failed:      { icon: '✗', type: 'error' },
  step_retry:       { icon: '🔄', type: 'info' },
  step_waiting:     { icon: '⏸', type: 'info' },
  agent_thinking:   { icon: '💭', type: 'thinking' },
  agent_active:     { icon: '⚡', type: 'agent' },
  tool_call:        { icon: '🔧', type: 'tool' },
  tool_result:      { icon: '📦', type: 'tool' },
  synthesizing:     { icon: '🔮', type: 'thinking' },
  replanning:       { icon: '🔄', type: 'info' },
  task_complete:    { icon: '🎉', type: 'success' },
  task_error:       { icon: '❌', type: 'error' },
  thinking:         { icon: '💭', type: 'thinking' },
  response:         { icon: '✨', type: 'success' },
}

// ── Helpers ───────────────────────────────────────────────────────────────
function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function DZAgentV5() {
  const navigate = useNavigate()
  const feedRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sseRef = useRef<EventSource | null>(null)

  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'auto' | 'chat'>('auto')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'feed' | 'history' | 'memory'>('feed')
  const [status, setStatus] = useState<'idle' | 'busy' | 'error'>('idle')

  // Feed state
  const [events, setEvents] = useState<ExecutionEvent[]>([])
  const [plan, setPlan] = useState<PlanStep[]>([])
  const [currentGoal, setCurrentGoal] = useState('')
  const [taskResult, setTaskResult] = useState<string>('')
  const [taskReflection, setTaskReflection] = useState<ExecutionEvent['reflection'] | null>(null)
  const [currentTaskId, setCurrentTaskId] = useState<string>('')

  // Sidebar state
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set())
  const [activeTools, setActiveTools] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<TaskHistory[]>([])
  const [memoryStats, setMemoryStats] = useState<Record<string, number>>({})

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [events])

  // Load history on mount
  useEffect(() => {
    fetch('/api/dz-v5/tasks').then(r => r.json()).then(d => {
      if (d.ok) setHistory(d.tasks || [])
    }).catch(() => {})
    fetch('/api/dz-v5/memory').then(r => r.json()).then(d => {
      if (d.ok && d.stats) setMemoryStats(d.stats)
    }).catch(() => {})
  }, [])

  // Cleanup SSE on unmount
  useEffect(() => () => { sseRef.current?.close() }, [])

  // ── Submit task ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const goal = input.trim()
    if (!goal || loading) return

    setLoading(true)
    setStatus('busy')
    setInput('')
    setEvents([])
    setPlan([])
    setTaskResult('')
    setTaskReflection(null)
    setCurrentGoal(goal)
    setActiveAgents(new Set())
    setActiveTools(new Set())
    setActiveTab('feed')
    sseRef.current?.close()

    if (mode === 'chat') {
      setEvents([{ type: 'thinking', message: 'Thinking...' }])
      try {
        const res = await fetch('/api/dz-v5/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: goal, stream: false }),
        })
        const data = await res.json()
        setEvents([{ type: 'response', content: data.response }])
        setTaskResult(data.response || '')
      } catch (err: unknown) {
        setEvents([{ type: 'task_error', error: String(err) }])
      } finally {
        setLoading(false)
        setStatus('idle')
      }
      return
    }

    // Auto mode: submit task
    try {
      const res = await fetch('/api/dz-v5/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, mode }),
      })
      const data = await res.json()
      if (!data.ok) {
        setEvents([{ type: 'task_error', error: data.error }])
        setStatus('error')
        setLoading(false)
        return
      }

      const taskId = data.taskId
      setCurrentTaskId(taskId)
      if (data.plan?.steps) setPlan(data.plan.steps)

      setHistory(prev => [{ taskId, goal, status: 'planned', createdAt: Date.now() }, ...prev.slice(0, 49)])

      // Connect to SSE stream
      const es = new EventSource(`/api/dz-v5/task/${taskId}/stream`)
      sseRef.current = es

      es.onmessage = (e) => {
        try {
          const event: ExecutionEvent = JSON.parse(e.data)

          if (event.type === 'done') {
            es.close()
            setLoading(false)
            setStatus('idle')
            setHistory(prev => prev.map(h => h.taskId === taskId ? { ...h, status: 'done' } : h))
            return
          }

          setEvents(prev => [...prev, { ...event, ts: Date.now() }])

          // Update plan step statuses
          if (event.type === 'step_start' && event.step) {
            setPlan(prev => prev.map(s => s.id === event.step!.id ? { ...s, status: 'running' } : s))
            setActiveAgents(prev => new Set([...prev, event.step!.agent]))
          }
          if (event.type === 'step_done' && event.stepId) {
            setPlan(prev => prev.map(s => s.id === event.stepId ? { ...s, status: 'done' } : s))
          }
          if (event.type === 'step_failed' && event.stepId) {
            setPlan(prev => prev.map(s => s.id === event.stepId ? { ...s, status: 'failed' } : s))
          }
          if (event.type === 'tool_call' && event.tool) {
            setActiveTools(prev => new Set([...prev, event.tool!]))
          }
          if (event.type === 'agent_active' && event.agent) {
            setActiveAgents(prev => new Set([...prev, event.agent!]))
          }
          if (event.type === 'task_complete') {
            const result = event.result?.summary || event.result?.output || ''
            setTaskResult(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
            setTaskReflection(event.reflection || null)
          }
          if (event.type === 'task_error') {
            setStatus('error')
            setLoading(false)
            setHistory(prev => prev.map(h => h.taskId === taskId ? { ...h, status: 'failed' } : h))
          }
        } catch {}
      }

      es.onerror = () => {
        es.close()
        setLoading(false)
        if (status === 'busy') setStatus('error')
      }
    } catch (err: unknown) {
      setEvents([{ type: 'task_error', error: String(err) }])
      setStatus('error')
      setLoading(false)
    }
  }, [input, mode, loading, status])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
  }

  // ── Render event ───────────────────────────────────────────────────────
  const renderEvent = (event: ExecutionEvent, i: number) => {
    const cfg = EVENT_ICONS[event.type] || { icon: '•', type: 'info' }

    if (event.type === 'task_complete') return null // rendered separately as result card
    if (event.type === 'execution_start') return (
      <div key={i} className="v5-event">
        <div className={`v5-event-icon ${cfg.type}`}>{cfg.icon}</div>
        <div className="v5-event-body">
          <div className="v5-event-title">Autonomous execution started</div>
          <div className="v5-event-detail">{event.steps} steps planned</div>
        </div>
      </div>
    )

    if (event.type === 'tool_call') return (
      <div key={i} className="v5-tool-call">
        <div className="v5-tool-call-header">🔧 {event.tool}</div>
        {event.preview && <div className="v5-tool-call-detail">{event.preview}</div>}
        {event.query && <div className="v5-tool-call-detail">Query: {event.query}</div>}
        {event.url && <div className="v5-tool-call-detail">URL: {event.url}</div>}
      </div>
    )

    if (event.type === 'tool_result') return (
      <div key={i} className="v5-event" style={{ padding: '4px 0' }}>
        <div className={`v5-event-icon ${event.ok ? 'success' : 'error'}`}>{event.ok ? '✓' : '✗'}</div>
        <div className="v5-event-body">
          <div className="v5-event-detail">{event.tool}: {event.preview || (event.ok ? 'OK' : 'failed')}</div>
        </div>
      </div>
    )

    if (event.type === 'agent_thinking') return (
      <div key={i} className="v5-thinking">
        <div className="v5-spinner" />
        <span style={{ color: '#6366f1' }}>{event.agent || 'agent'}</span>
        <span style={{ color: '#555' }}>— {event.message || 'thinking...'}</span>
      </div>
    )

    if (event.type === 'replanning') return (
      <div key={i} className="v5-event">
        <div className="v5-event-icon info">🔄</div>
        <div className="v5-event-body">
          <div className="v5-event-title">Replanning — {event.newSteps} new steps</div>
          {event.reason && <div className="v5-event-detail">Reason: {event.reason}</div>}
        </div>
      </div>
    )

    if (event.type === 'step_retry') return (
      <div key={i} className="v5-event">
        <div className="v5-event-icon info">🔄</div>
        <div className="v5-event-body">
          <div className="v5-event-detail">Retry {event.attempt}/{event.maxAttempts}: {event.error}</div>
        </div>
      </div>
    )

    if (event.type === 'thinking') return (
      <div key={i} className="v5-thinking">
        <div className="v5-spinner" />
        <span style={{ color: '#555' }}>Processing with {event.taskType || 'AI'}...</span>
      </div>
    )

    if (event.type === 'response' && event.content) return null // rendered as result

    return (
      <div key={i} className="v5-event">
        <div className={`v5-event-icon ${cfg.type}`}>{cfg.icon}</div>
        <div className="v5-event-body">
          <div className="v5-event-title">
            {event.step?.description || event.message || event.stepId || event.agent || event.type}
          </div>
          {event.error && <div className="v5-event-detail" style={{ color: '#fca5a5' }}>{event.error}</div>}
          {event.preview && <div className="v5-event-detail">{event.preview}</div>}
        </div>
      </div>
    )
  }

  const hasContent = events.length > 0 || taskResult || currentGoal

  return (
    <div className="v5">
      {/* Header */}
      <div className="v5-header">
        <button className="v5-header-back v5-header-back--icon" onClick={() => navigate('/')} title="الصفحة الرئيسية">
          <Home size={16} />
        </button>
        <div className="v5-logo">🤖</div>
        <div className="v5-header-info">
          <h1>DZ Agent V5</h1>
          <p>Autonomous Multi-Agent AI Operating System</p>
        </div>
        <div className="v5-header-status">
          <div className={`v5-status-dot ${status}`} />
          <span className="v5-status-text">{status === 'idle' ? 'Ready' : status === 'busy' ? 'Running' : 'Error'}</span>
          <div className="v5-mode-badge">Manus × Devin × OpenHands</div>
        </div>
      </div>

      {/* Layout */}
      <div className="v5-layout">
        {/* Left Sidebar — Agents + Tools */}
        <div className="v5-sidebar-left">
          <div className="v5-sidebar-section">
            <div className="v5-sidebar-title">Agent Network</div>
            {AGENTS.map(agent => (
              <div key={agent.name} className={`v5-agent-card ${activeAgents.has(agent.name) ? 'active' : ''}`}>
                <span className="v5-agent-icon">{agent.icon}</span>
                <span className="v5-agent-name">{agent.label}</span>
                {activeAgents.has(agent.name) && <span className="v5-agent-status active">active</span>}
              </div>
            ))}
          </div>

          <hr className="v5-divider" />

          <div className="v5-sidebar-section">
            <div className="v5-sidebar-title">Tool Registry</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {TOOLS.map(tool => (
                <div key={tool} className={`v5-tool-pill ${activeTools.has(tool) ? 'active' : ''}`}>
                  {tool.replace('_', ' ')}
                </div>
              ))}
            </div>
          </div>

          {plan.length > 0 && (
            <>
              <hr className="v5-divider" />
              <div className="v5-sidebar-section">
                <div className="v5-sidebar-title">Execution Plan ({plan.length} steps)</div>
                {plan.map((step, i) => (
                  <div key={step.id} className={`v5-plan-step ${step.status}`}>
                    <div className="v5-step-num">{i + 1}</div>
                    <div className="v5-step-info">
                      <div className="v5-step-desc" style={{ fontSize: 11 }}>{step.description.slice(0, 60)}</div>
                      <div className="v5-step-meta">
                        <span className="v5-step-agent">{step.agent}</span>
                        {step.tools?.slice(0, 2).map(t => <span key={t} className="v5-step-tool">{t}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Main Panel */}
        <div className="v5-main">
          {/* Tabs */}
          <div className="v5-tabs">
            {[
              { id: 'feed', label: '⚡ Live Feed' },
              { id: 'history', label: `🗂️ History (${history.length})` },
              { id: 'memory', label: '🧠 Memory' },
            ].map(t => (
              <button
                key={t.id}
                className={`v5-tab ${activeTab === t.id ? 'active' : ''}`}
                onClick={() => setActiveTab(t.id as typeof activeTab)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Feed */}
          {activeTab === 'feed' && (
            <div className="v5-feed" ref={feedRef}>
              {!hasContent ? (
                <div className="v5-empty">
                  <div className="v5-empty-icon">🤖</div>
                  <h2>DZ Autonomous Agent</h2>
                  <p>Give me any task — I'll plan it, research it, code it, and execute it autonomously.</p>
                  <div className="v5-suggestion-grid">
                    {SUGGESTIONS.map((s, i) => (
                      <div key={i} className="v5-suggestion" onClick={() => setInput(s.text)}>
                        <span className="v5-suggestion-icon">{s.icon}</span>
                        {s.text}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Goal card */}
                  {currentGoal && (
                    <div className="v5-task-goal">
                      <div className="v5-task-goal-label">🎯 Task Goal</div>
                      <div className="v5-task-goal-text">{currentGoal}</div>
                      {currentTaskId && <div style={{ fontSize: 10, color: '#444', marginTop: 6 }}>ID: {currentTaskId}</div>}
                    </div>
                  )}

                  {/* Events */}
                  {events.map((event, i) => renderEvent(event, i))}

                  {/* Loading indicator */}
                  {loading && (
                    <div className="v5-thinking" style={{ margin: '8px 0' }}>
                      <div className="v5-thinking-dots">
                        <span /><span /><span />
                      </div>
                      <span style={{ color: '#555', marginLeft: 4 }}>Agent is working...</span>
                    </div>
                  )}

                  {/* Result */}
                  {taskResult && (
                    <div className="v5-result-card">
                      <div className="v5-result-label">
                        ✅ Task Complete
                        {taskReflection?.quality_score && (
                          <span className="v5-reflection-score" style={{ marginLeft: 'auto' }}>
                            ⭐ {taskReflection.quality_score}/10
                          </span>
                        )}
                      </div>
                      <div className="v5-result-content v5-md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{taskResult}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* Reflection */}
                  {taskReflection && (
                    <div className="v5-reflection-card">
                      <div className="v5-reflection-title">🪞 Agent Reflection</div>
                      {taskReflection.summary && <p style={{ color: '#aaa', fontSize: 12, margin: '4px 0' }}>{taskReflection.summary}</p>}
                      {taskReflection.lessons && taskReflection.lessons.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>LESSONS LEARNED</div>
                          {taskReflection.lessons.map((l, i) => (
                            <div key={i} style={{ fontSize: 11, color: '#888', padding: '2px 0' }}>• {l}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* History tab */}
          {activeTab === 'history' && (
            <div className="v5-feed">
              {history.length === 0 ? (
                <div className="v5-empty" style={{ padding: '40px 20px' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                  <h2 style={{ fontSize: 16, background: 'none', WebkitTextFillColor: '#888' }}>No tasks yet</h2>
                  <p style={{ margin: 0 }}>Submitted tasks will appear here</p>
                </div>
              ) : history.map(task => (
                <div key={task.taskId} className="v5-history-item" onClick={() => {
                  setInput(task.goal)
                  setActiveTab('feed')
                }}>
                  <div className={`v5-history-dot ${task.status}`} />
                  <div className="v5-history-text">{task.goal}</div>
                  <div className="v5-history-time">{timeAgo(task.createdAt)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Memory tab */}
          {activeTab === 'memory' && (
            <div className="v5-feed">
              <div className="v5-plan-card" style={{ marginBottom: 12 }}>
                <div className="v5-plan-header">🧠 Memory System Stats</div>
                <div style={{ padding: '10px 14px' }}>
                  {Object.entries(memoryStats).map(([k, v]) => (
                    <div key={k} className="v5-memory-stat">
                      <span>{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                      <span>{typeof v === 'number' ? (k === 'successRate' ? `${v}%` : v) : v}</span>
                    </div>
                  ))}
                  {Object.keys(memoryStats).length === 0 && (
                    <div style={{ color: '#555', fontSize: 12, padding: '4px 0' }}>No memory data yet</div>
                  )}
                </div>
              </div>
              <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>
                Memory accumulates as you complete tasks.<br />
                Past learnings improve future executions.
              </div>
            </div>
          )}

          {/* Input */}
          <div className="v5-input-area">
            <div className="v5-input-row">
              <div className="v5-input-wrap">
                <textarea
                  ref={textareaRef}
                  className="v5-textarea"
                  placeholder={mode === 'auto'
                    ? 'Describe any task — I\'ll plan and execute it autonomously... (Ctrl+Enter to send)'
                    : 'Ask me anything... (Ctrl+Enter to send)'}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={loading}
                  rows={2}
                  onInput={e => {
                    const t = e.target as HTMLTextAreaElement
                    t.style.height = 'auto'
                    t.style.height = Math.min(t.scrollHeight, 200) + 'px'
                  }}
                />
                <div className="v5-input-footer">
                  <div className="v5-mode-toggle">
                    <button className={`v5-mode-btn ${mode === 'auto' ? 'active' : ''}`} onClick={() => setMode('auto')}>
                      🤖 Autonomous
                    </button>
                    <button className={`v5-mode-btn ${mode === 'chat' ? 'active' : ''}`} onClick={() => setMode('chat')}>
                      💬 Chat
                    </button>
                  </div>
                  <span className="v5-char-count">{input.length} chars · Ctrl+Enter</span>
                </div>
              </div>
              <button className="v5-send-btn" onClick={handleSubmit} disabled={loading || !input.trim()}>
                {loading ? <div className="v5-spinner" style={{ width: 18, height: 18 }} /> : '↑'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar — Model routing + execution stats */}
        <div className="v5-sidebar-right">
          <div className="v5-sidebar-section">
            <div className="v5-sidebar-title">AI Model Routing</div>
            {[
              { name: 'Llama 3.3 70B', provider: 'Groq', strength: 'General', speed: '●●●●●' },
              { name: 'QwQ 32B', provider: 'Groq', strength: 'Reasoning', speed: '●●●●○' },
              { name: 'DeepSeek', provider: 'DeepSeek', strength: 'Coding', speed: '●●●○○' },
              { name: 'Gemma 2 9B', provider: 'Groq', strength: 'Analysis', speed: '●●●●●' },
            ].map(m => (
              <div key={m.name} className="v5-agent-card">
                <div>
                  <div style={{ fontSize: 11, color: '#ccc', fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: '#555' }}>{m.provider} · {m.strength}</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 10, color: '#6366f1' }}>{m.speed}</div>
              </div>
            ))}
          </div>

          <hr className="v5-divider" />

          <div className="v5-sidebar-section">
            <div className="v5-sidebar-title">Capabilities</div>
            {[
              { icon: '🧩', label: 'Multi-Agent Routing' },
              { icon: '🔄', label: 'Autonomous Replanning' },
              { icon: '🛡️', label: 'Sandboxed Execution' },
              { icon: '🧠', label: 'Persistent Memory' },
              { icon: '🔍', label: 'Web Search + Browse' },
              { icon: '💻', label: 'Code Write + Execute' },
              { icon: '🐙', label: 'GitHub Integration' },
              { icon: '📁', label: 'File System Access' },
              { icon: '🪞', label: 'Self-Reflection Loop' },
              { icon: '⚡', label: 'Real-Time SSE Stream' },
            ].map(cap => (
              <div key={cap.label} className="v5-agent-card">
                <span className="v5-agent-icon">{cap.icon}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{cap.label}</span>
              </div>
            ))}
          </div>

          <hr className="v5-divider" />

          <div className="v5-sidebar-section">
            <div className="v5-sidebar-title">Quick Actions</div>
            <button
              style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#777', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', marginBottom: 6, textAlign: 'left' }}
              onClick={() => { setEvents([]); setPlan([]); setTaskResult(''); setCurrentGoal(''); setTaskReflection(null) }}
            >
              🗑️ Clear Feed
            </button>
            <button
              style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: '#777', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
              onClick={() => fetch('/api/dz-v5/memory').then(r => r.json()).then(d => { if (d.ok && d.stats) setMemoryStats(d.stats) })}
            >
              🔄 Refresh Memory
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
