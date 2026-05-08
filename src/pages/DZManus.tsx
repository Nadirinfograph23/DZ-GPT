import React, { useState, useEffect, useRef, useCallback } from 'react'

interface AgentDef { id: string; name: string; role: string; icon: string; status: string }
interface StepEvent {
  type: string; step?: number; description?: string; tool?: string
  preview?: string; durationMs?: number; error?: string; phase?: string
  message?: string; params?: any; planTitle?: string; totalSteps?: number
  score?: number; completed?: boolean; iterations?: number; model?: string
  ts?: number
}
interface TaskInfo {
  id: string; goal: string; status: string; startTs: number; endTs?: number
  steps?: number; sessionId?: string
}

const AGENTS: AgentDef[] = [
  { id: 'planner',  name: 'Planner',  role: 'يخطط المهام',      icon: '🧠', status: 'idle' },
  { id: 'executor', name: 'Executor', role: 'ينفذ الخطوات',     icon: '⚙️', status: 'idle' },
  { id: 'research', name: 'Research', role: 'يبحث ويحلل',       icon: '🔍', status: 'idle' },
  { id: 'coder',    name: 'Coder',    role: 'يكتب الأكواد',     icon: '💻', status: 'idle' },
  { id: 'browser',  name: 'Browser',  role: 'يتصفح المواقع',    icon: '🌐', status: 'idle' },
  { id: 'reviewer', name: 'Reviewer', role: 'يراجع النتائج',    icon: '✅', status: 'idle' },
  { id: 'memory',   name: 'Memory',   role: 'يدير الذاكرة',     icon: '🗄️', status: 'idle' },
]

const TOOL_COLORS: Record<string, string> = {
  web_search:    'text-blue-400',
  browse:        'text-green-400',
  code_exec:     'text-yellow-400',
  summarize:     'text-purple-400',
  github:        'text-orange-400',
  memory_recall: 'text-pink-400',
  math:          'text-cyan-400',
}

const PHASE_LABELS: Record<string, string> = {
  planning:    'التخطيط',
  critique:    'مراجعة الخطة',
  executing:   'التنفيذ',
  replanning:  'إعادة التخطيط',
  synthesizing:'تجميع النتائج',
  reviewing:   'مراجعة النتائج',
}

function AgentCard({ agent, active }: { agent: AgentDef; active: boolean }) {
  return (
    <div className={`flex items-center gap-2 p-2 rounded-lg border transition-all duration-300 ${
      active
        ? 'border-green-500/50 bg-green-500/10 shadow-lg shadow-green-500/10'
        : 'border-white/5 bg-white/3'
    }`}>
      <span className="text-lg">{agent.icon}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold truncate ${active ? 'text-green-300' : 'text-white/60'}`}>
          {agent.name}
        </div>
        <div className="text-[10px] text-white/30 truncate">{agent.role}</div>
      </div>
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
        active ? 'bg-green-400 animate-pulse' : 'bg-white/10'
      }`} />
    </div>
  )
}

function StepCard({ event, index }: { event: StepEvent; index: number }) {
  const isPhase = event.type === 'phase'
  const isDone  = event.type === 'step_done'
  const isError = event.type === 'step_error'
  const isBlock = event.type === 'step_blocked'

  if (event.type === 'task_created') {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center flex-shrink-0">
          <span className="text-xs">🚀</span>
        </div>
        <div>
          <div className="text-xs font-medium text-blue-300">مهمة جديدة</div>
          <div className="text-xs text-white/40">{event.goal}</div>
        </div>
      </div>
    )
  }

  if (isPhase) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="w-1 h-4 bg-purple-500/50 rounded-full flex-shrink-0" />
        <div className="text-xs text-purple-300/70 font-medium">
          {PHASE_LABELS[event.phase || ''] || event.phase} — {event.message}
        </div>
      </div>
    )
  }

  if (event.type === 'plan_ready') {
    return (
      <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <span className="text-base">📋</span>
        <div>
          <div className="text-xs font-semibold text-blue-300">{event.planTitle}</div>
          <div className="text-xs text-white/40">{event.totalSteps} خطوات • {event.complexity}</div>
        </div>
      </div>
    )
  }

  if (event.type === 'step_start') {
    return (
      <div className="flex items-center gap-3 py-2 opacity-70">
        <div className="w-6 h-6 rounded-full border border-yellow-500/50 bg-yellow-500/10 flex items-center justify-center flex-shrink-0 animate-spin-slow">
          <span className="text-xs">⟳</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${TOOL_COLORS[event.tool || ''] || 'text-white/60'}`}>
              [{event.tool}]
            </span>
            <span className="text-xs text-white/50 truncate">{event.description}</span>
          </div>
        </div>
        <div className="w-3 h-3 rounded-full border-2 border-yellow-400/50 border-t-yellow-400 animate-spin flex-shrink-0" />
      </div>
    )
  }

  if (isDone) {
    return (
      <div className="flex items-start gap-3 py-2">
        <div className="w-6 h-6 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-xs">✓</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium ${TOOL_COLORS[event.tool || ''] || 'text-white/60'}`}>
              [{event.tool}]
            </span>
            <span className="text-xs text-green-300/70">خطوة {event.step}</span>
            {event.durationMs && (
              <span className="text-xs text-white/20">{event.durationMs}ms</span>
            )}
          </div>
          {event.preview && (
            <div className="mt-1 text-xs text-white/40 bg-white/3 rounded p-2 truncate max-w-full">
              {event.preview}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center flex-shrink-0">
          <span className="text-xs">✗</span>
        </div>
        <div className="text-xs text-red-400">
          خطأ في خطوة {event.step}: {event.error}
        </div>
      </div>
    )
  }

  if (event.type === 'task_done') {
    return (
      <div className="flex items-center gap-3 py-3 px-3 rounded-lg bg-green-500/10 border border-green-500/30">
        <span className="text-lg">🎯</span>
        <div>
          <div className="text-xs font-bold text-green-300">مهمة مكتملة</div>
          <div className="text-xs text-white/40">
            نقاط: {event.score}% • {event.iterations} دورة • نموذج: {event.model}
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default function DZManus() {
  const [goal, setGoal]       = useState('')
  const [taskId, setTaskId]   = useState<string | null>(null)
  const [status, setStatus]   = useState<string>('idle')
  const [events, setEvents]   = useState<StepEvent[]>([])
  const [answer, setAnswer]   = useState<string>('')
  const [tasks, setTasks]     = useState<TaskInfo[]>([])
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set())
  const [phase, setPhase]     = useState<string>('')
  const [stats, setStats]     = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [tab, setTab]         = useState<'chat' | 'tasks' | 'agents' | 'tools'>('chat')

  const esRef   = useRef<EventSource | null>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load initial data
  useEffect(() => {
    loadStats()
    loadTasks()
  }, [])

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [events])

  async function loadStats() {
    try {
      const r = await fetch('/api/dz-manus/stats')
      if (r.ok) setStats(await r.json())
    } catch {}
  }

  async function loadTasks() {
    try {
      const r = await fetch('/api/dz-manus/tasks')
      if (r.ok) {
        const d = await r.json()
        setTasks(d.tasks || [])
      }
    } catch {}
  }

  function updateActiveAgents(eventType: string, tool?: string) {
    const agentMap: Record<string, string[]> = {
      planning:    ['planner'],
      critique:    ['planner', 'reviewer'],
      executing:   ['executor'],
      synthesizing:['executor', 'research'],
      reviewing:   ['reviewer'],
      web_search:  ['research', 'browser'],
      browse:      ['browser'],
      code_exec:   ['coder'],
      github:      ['coder', 'research'],
      summarize:   ['research'],
      memory_recall:['memory'],
    }
    const key = tool || eventType.replace('phase:', '')
    const active = agentMap[key] || []
    setActiveAgents(new Set(active))
  }

  function startSSE(id: string) {
    if (esRef.current) esRef.current.close()

    const es = new EventSource(`/api/dz-manus/stream/${id}`)
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const event: StepEvent = JSON.parse(e.data)

        if (event.type === 'stream_end') {
          es.close()
          esRef.current = null
          setStatus('done')
          setActiveAgents(new Set())
          loadTasks()
          loadStats()
          return
        }

        if (event.type === 'task_state') {
          const task = (event as any).task
          if (task?.answer) setAnswer(task.answer)
          if (task?.status) setStatus(task.status)
          return
        }

        if (event.type === 'phase') {
          setPhase(event.phase || '')
          updateActiveAgents(event.phase || '')
        }

        if (event.type === 'step_start') {
          updateActiveAgents('executing', event.tool)
        }

        if (event.type === 'task_done') {
          setStatus('done')
        }

        if (event.type === 'task_error') {
          setStatus('error')
        }

        setEvents(prev => [...prev, event])
      } catch {}
    }

    es.onerror = () => {
      if (status !== 'done') setStatus('error')
      es.close()
    }
  }

  async function submitTask() {
    const g = goal.trim()
    if (!g || isLoading) return

    setIsLoading(true)
    setEvents([])
    setAnswer('')
    setPhase('')
    setActiveAgents(new Set())
    setStatus('queued')

    try {
      const r = await fetch('/api/dz-manus/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: g, sessionId: 'dz-manus-ui', maxIterations: 3 }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setTaskId(data.taskId)
      setGoal('')
      startSSE(data.taskId)
    } catch (err: any) {
      setStatus('error')
      setEvents([{ type: 'task_error', error: err.message }])
    } finally {
      setIsLoading(false)
    }
  }

  async function cancelCurrentTask() {
    if (!taskId) return
    await fetch(`/api/dz-manus/task/${taskId}`, { method: 'DELETE' })
    esRef.current?.close()
    setStatus('cancelled')
    setActiveAgents(new Set())
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitTask()
  }

  const statusColor = {
    idle:      'text-white/40',
    queued:    'text-blue-400',
    planning:  'text-purple-400',
    running:   'text-yellow-400',
    done:      'text-green-400',
    error:     'text-red-400',
    cancelled: 'text-gray-400',
  }[status] || 'text-white/40'

  const EXAMPLE_TASKS = [
    'ابحث عن أفضل 5 مكتبات JavaScript لعام 2024 وقارن بينها',
    'اشرح كيفية بناء REST API بـ Node.js مع مثال عملي',
    'ابحث عن أخبار الذكاء الاصطناعي الجديدة وقدم ملخصاً',
    'اكتب دالة JavaScript لحساب الفيبوناتشي وتحقق من صحتها',
    'ابحث عن مستودعات GitHub المشهورة لمشاريع الجزائر',
  ]

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden font-sans" dir="rtl">

      {/* ── SIDEBAR ── */}
      <div className="w-64 flex-shrink-0 border-l border-white/5 flex flex-col bg-[#0d0d14]">
        {/* Logo */}
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-sm font-bold shadow-lg">M</div>
            <div>
              <div className="text-sm font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">DZ-MANUS</div>
              <div className="text-[10px] text-white/30">Autonomous AI System</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5">
          {(['chat','agents','tasks'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 text-[10px] font-medium transition-colors ${
                tab === t ? 'text-blue-400 border-b border-blue-400' : 'text-white/30 hover:text-white/60'
              }`}>
              {t === 'chat' ? '💬' : t === 'agents' ? '🤖' : '📋'}
            </button>
          ))}
        </div>

        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {tab === 'agents' && (
            <>
              <div className="text-[10px] text-white/20 mb-2 uppercase tracking-wider">شبكة الوكلاء</div>
              {AGENTS.map(a => (
                <AgentCard key={a.id} agent={a} active={activeAgents.has(a.id)} />
              ))}
            </>
          )}

          {tab === 'tasks' && (
            <>
              <div className="text-[10px] text-white/20 mb-2 uppercase tracking-wider">المهام السابقة</div>
              {tasks.length === 0 && (
                <div className="text-xs text-white/20 text-center py-4">لا توجد مهام بعد</div>
              )}
              {tasks.map(t => (
                <button key={t.id} onClick={() => { setTab('chat') }}
                  className="w-full text-right p-2 rounded-lg bg-white/3 hover:bg-white/5 border border-white/5 transition-colors">
                  <div className="text-xs text-white/70 truncate">{t.goal}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] ${
                      t.status === 'done' ? 'text-green-400' :
                      t.status === 'error' ? 'text-red-400' : 'text-white/30'
                    }`}>{t.status}</span>
                    <span className="text-[10px] text-white/20">{t.steps} خطوات</span>
                  </div>
                </button>
              ))}
            </>
          )}

          {tab === 'chat' && (
            <>
              <div className="text-[10px] text-white/20 mb-2 uppercase tracking-wider">إحصائيات</div>
              {stats && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'إجمالي', value: stats.total },
                    { label: 'منجزة',  value: stats.done },
                    { label: 'ذاكرة',  value: stats.memories },
                    { label: 'خطأ',    value: stats.error },
                  ].map(s => (
                    <div key={s.label} className="p-2 rounded-lg bg-white/3 border border-white/5 text-center">
                      <div className="text-base font-bold text-blue-400">{s.value}</div>
                      <div className="text-[10px] text-white/30">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4">
                <div className="text-[10px] text-white/20 mb-2 uppercase tracking-wider">أمثلة</div>
                {EXAMPLE_TASKS.map((ex, i) => (
                  <button key={i} onClick={() => setGoal(ex)}
                    className="w-full text-right text-[11px] text-white/40 hover:text-white/70 py-1 border-b border-white/5 transition-colors truncate">
                    ← {ex.slice(0, 45)}...
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Status bar */}
        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              status === 'running' || status === 'queued' ? 'bg-yellow-400 animate-pulse' :
              status === 'done' ? 'bg-green-400' :
              status === 'error' ? 'bg-red-400' : 'bg-white/20'
            }`} />
            <span className={`text-[11px] ${statusColor}`}>
              {phase ? PHASE_LABELS[phase] || phase : status}
            </span>
          </div>
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="border-b border-white/5 px-6 py-3 flex items-center gap-4 bg-[#0d0d14]">
          <div className="flex-1">
            <h1 className="text-sm font-bold text-white/90">DZ-MANUS — Autonomous AI Operating System</h1>
            <p className="text-xs text-white/30">مستوحى من: Manus • Devin • OpenHands • Jarvis</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/dz-agent" className="text-xs text-white/30 hover:text-white/60 transition-colors">← DZ Agent</a>
            {taskId && (status === 'running' || status === 'queued' || status === 'planning') && (
              <button onClick={cancelCurrentTask}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/30 transition-colors">
                إيقاف
              </button>
            )}
          </div>
        </div>

        {/* Two-panel layout */}
        <div className="flex-1 flex overflow-hidden">

          {/* Activity Feed */}
          <div className="w-80 flex-shrink-0 border-l border-white/5 flex flex-col bg-[#0c0c13]">
            <div className="px-4 py-2 border-b border-white/5">
              <div className="text-[10px] text-white/30 uppercase tracking-wider">سجل التنفيذ المباشر</div>
            </div>
            <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-1">
              {events.length === 0 && (
                <div className="text-center text-white/20 text-xs mt-8">
                  <div className="text-2xl mb-2">⚡</div>
                  <div>أرسل مهمة لبدء التنفيذ</div>
                </div>
              )}
              {events.map((e, i) => (
                <StepCard key={i} event={e} index={i} />
              ))}
            </div>
          </div>

          {/* Main content: Answer + Input */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Answer area */}
            <div className="flex-1 overflow-y-auto p-6">
              {!answer && status === 'idle' && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/20 flex items-center justify-center text-3xl mb-4 shadow-xl">
                    🤖
                  </div>
                  <h2 className="text-xl font-bold text-white/80 mb-2">DZ-MANUS</h2>
                  <p className="text-white/40 text-sm mb-6 leading-relaxed">
                    نظام ذكاء اصطناعي مستقل يخطط وينفذ المهام تلقائياً.
                    يستخدم 7 وكلاء متخصصين و7 أدوات متقدمة.
                  </p>
                  <div className="grid grid-cols-2 gap-3 w-full">
                    {[
                      { icon: '🔍', label: 'بحث عميق', desc: 'متعدد المصادر' },
                      { icon: '🌐', label: 'تصفح مواقع', desc: 'استخراج محتوى' },
                      { icon: '💻', label: 'تنفيذ أكواد', desc: 'بيئة آمنة' },
                      { icon: '📊', label: 'تحليل بيانات', desc: 'ومقارنة' },
                      { icon: '🐙', label: 'GitHub', desc: 'قراءة مستودعات' },
                      { icon: '🗄️', label: 'ذاكرة طويلة', desc: 'سياق مستمر' },
                    ].map(f => (
                      <div key={f.label} className="p-3 rounded-xl bg-white/3 border border-white/5 text-right">
                        <div className="text-lg mb-1">{f.icon}</div>
                        <div className="text-xs font-semibold text-white/70">{f.label}</div>
                        <div className="text-[10px] text-white/30">{f.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(status === 'queued' || status === 'planning' || status === 'running') && !answer && (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-blue-500/20 border-t-blue-400 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center text-xl">🤖</div>
                  </div>
                  <div className="text-white/60 text-sm font-medium">
                    {PHASE_LABELS[phase] || 'جاري المعالجة'}...
                  </div>
                  <div className="flex gap-2">
                    {[...activeAgents].map(a => {
                      const agent = AGENTS.find(ag => ag.id === a)
                      return agent ? (
                        <div key={a} className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 border border-white/10">
                          <span className="text-xs">{agent.icon}</span>
                          <span className="text-[10px] text-white/50">{agent.name}</span>
                        </div>
                      ) : null
                    })}
                  </div>
                </div>
              )}

              {answer && (
                <div className="max-w-3xl mx-auto">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-600/30 to-emerald-600/30 border border-green-500/30 flex items-center justify-center">
                      <span className="text-sm">✅</span>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-green-300">الإجابة النهائية</div>
                      <div className="text-xs text-white/30">
                        {events.find(e => e.type === 'task_done')?.model || 'DZ-MANUS'}
                      </div>
                    </div>
                  </div>
                  <div className="prose prose-invert max-w-none">
                    <div className="bg-white/3 border border-white/5 rounded-xl p-5 text-sm text-white/85 leading-relaxed whitespace-pre-wrap">
                      {answer}
                    </div>
                  </div>

                  {/* Score badge */}
                  {events.find(e => e.type === 'task_done') && (
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                        <div className="w-2 h-2 rounded-full bg-green-400" />
                        <span className="text-xs text-green-300">
                          نقاط: {events.find(e => e.type === 'task_done')?.score}%
                        </span>
                      </div>
                      <button onClick={() => { setAnswer(''); setEvents([]); setStatus('idle') }}
                        className="text-xs text-white/30 hover:text-white/60 transition-colors">
                        مهمة جديدة ←
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="border-t border-white/5 p-4 bg-[#0d0d14]">
              <div className="max-w-3xl mx-auto">
                <div className="flex gap-3 items-end">
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={goal}
                      onChange={e => setGoal(e.target.value)}
                      onKeyDown={handleKey}
                      placeholder="صف المهمة التي تريد تنفيذها... (Ctrl+Enter للإرسال)"
                      rows={3}
                      disabled={isLoading || status === 'running' || status === 'queued'}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/90 placeholder-white/20 resize-none focus:outline-none focus:border-blue-500/50 focus:bg-white/7 transition-all disabled:opacity-40"
                    />
                    <div className="absolute bottom-2 left-3 text-[10px] text-white/15">
                      Ctrl+Enter للإرسال
                    </div>
                  </div>
                  <button
                    onClick={submitTask}
                    disabled={!goal.trim() || isLoading || status === 'running' || status === 'queued'}
                    className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all font-bold text-sm shadow-lg shadow-blue-500/20 flex-shrink-0"
                  >
                    {isLoading ? '...' : 'تنفيذ'}
                  </button>
                </div>
                <div className="mt-2 text-[10px] text-white/15 text-center">
                  DZ-MANUS v1.0 • 7 وكلاء • 7 أدوات • بحث + تصفح + أكواد + GitHub
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
