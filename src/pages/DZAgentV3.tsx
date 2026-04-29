import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

type AgentEvent = {
  taskId: string
  kind: string
  ts: number
  agent?: string
  text?: string
  tool?: string
  count?: number
  error?: string
  result?: any
  ok?: boolean
  [k: string]: any
}

type Task = {
  id: string
  kind: string
  status: 'pending' | 'running' | 'done' | 'error'
  query: string
  lang: string
  agentLog: AgentEvent[]
  result: any
  error: any
  createdAt: number
  updatedAt: number
}

const AGENT_COLORS: Record<string, string> = {
  planner: '#a78bfa',
  news: '#f59e0b',
  research: '#38bdf8',
  dev: '#10b981',
  execution: '#ef4444',
  qa: '#ec4899',
  synthesis: '#c8ff00',
}

export default function DZAgentV3() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [agents, setAgents] = useState<Array<{ name: string; description: string }>>([])
  const esRef = useRef<EventSource | null>(null)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  // Initial load
  useEffect(() => {
    fetch('/api/dz-agent-v3/agents').then(r => r.json()).then(j => j.ok && setAgents(j.agents)).catch(() => {})
    refreshTasks()
  }, [])

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const refreshTasks = useCallback(async () => {
    try {
      const r = await fetch('/api/dz-agent-v3/tasks?limit=10')
      const j = await r.json()
      if (j.ok) setRecentTasks(j.tasks)
    } catch {}
  }, [])

  const closeStream = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
  }, [])

  const subscribeStream = useCallback((taskId: string) => {
    closeStream()
    const es = new EventSource(`/api/dz-agent-v3/task/${taskId}/stream`)
    esRef.current = es
    es.onmessage = (e) => {
      try { const evt = JSON.parse(e.data); setEvents(prev => [...prev, evt]) } catch {}
    }
    // V3 emits typed events too
    ;['task.start', 'task.done', 'task.error', 'agent.start', 'agent.thought', 'agent.tool', 'agent.result', 'agent.error'].forEach(k => {
      es.addEventListener(k, (e: MessageEvent) => {
        try {
          const evt = JSON.parse(e.data)
          setEvents(prev => [...prev, evt])
          if (k === 'task.done' || k === 'task.error') {
            // Refresh task to get final result + status
            fetch(`/api/dz-agent-v3/task/${taskId}`).then(r => r.json()).then(j => j.ok && setActiveTask(j.task))
            setSubmitting(false)
            refreshTasks()
            closeStream()
          }
        } catch {}
      })
    })
    es.onerror = () => { setSubmitting(false); closeStream() }
  }, [closeStream, refreshTasks])

  const submit = async () => {
    if (!query.trim() || submitting) return
    setSubmitting(true)
    setEvents([])
    setActiveTask(null)
    try {
      const r = await fetch('/api/dz-agent-v3/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const j = await r.json()
      if (!j.ok) {
        setEvents([{ taskId: '', kind: 'task.error', ts: Date.now(), error: j.error || 'failed to start' }])
        setSubmitting(false)
        return
      }
      const t = await fetch(`/api/dz-agent-v3/task/${j.taskId}`).then(r => r.json())
      if (t.ok) setActiveTask(t.task)
      subscribeStream(j.taskId)
    } catch (err: any) {
      setEvents([{ taskId: '', kind: 'task.error', ts: Date.now(), error: err.message }])
      setSubmitting(false)
    }
  }

  const loadTask = async (taskId: string) => {
    closeStream()
    const t = await fetch(`/api/dz-agent-v3/task/${taskId}`).then(r => r.json())
    if (t.ok) {
      setActiveTask(t.task)
      setEvents(t.task.agentLog || [])
      if (t.task.status === 'running' || t.task.status === 'pending') subscribeStream(taskId)
    }
  }

  const examples = [
    'Build a news website that displays Algerian football news',
    'Create a SaaS dashboard called "MarketPulse"',
    'اصنع لي مدونة باسم "تقنيات اليوم"',
    'Recherche les dernières actualités sur l\'IA en Algérie',
  ]

  return (
    <div style={S.page}>
      <header style={S.header}>
        <button onClick={() => navigate('/')} style={S.back}>← Home</button>
        <div>
          <div style={S.brand}>DZ Agent V3</div>
          <div style={S.tagline}>Autonomous multi-agent · Web app generator · Live task streaming</div>
        </div>
        <div style={S.badges}>
          {agents.map(a => (
            <span key={a.name} style={{ ...S.badge, background: (AGENT_COLORS[a.name] || '#475569') + '22', color: AGENT_COLORS[a.name] || '#cbd5e1', borderColor: (AGENT_COLORS[a.name] || '#475569') + '55' }} title={a.description}>
              {a.name}
            </span>
          ))}
        </div>
      </header>

      <div style={S.body}>
        <aside style={S.sidebar}>
          <h3 style={S.sectionH}>Recent tasks</h3>
          {recentTasks.length === 0 && <div style={S.muted}>No tasks yet.</div>}
          {recentTasks.map(t => (
            <button key={t.id} onClick={() => loadTask(t.id)} style={{ ...S.taskItem, ...(activeTask?.id === t.id ? S.taskItemActive : {}) }}>
              <div style={S.taskQuery}>{t.query.slice(0, 60)}{t.query.length > 60 ? '…' : ''}</div>
              <div style={S.taskMeta}>
                <span style={{ ...S.statusDot, background: statusColor(t.status) }} />
                {t.status} · {t.lang} · {timeAgo(t.createdAt)}
              </div>
            </button>
          ))}
        </aside>

        <main style={S.main}>
          <div style={S.composer}>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }}
              placeholder="Ask V3 to build something, scrape news, or research a topic… (⌘/Ctrl+Enter to send)"
              style={S.textarea}
              disabled={submitting}
            />
            <div style={S.composerActions}>
              <div style={S.examples}>
                {examples.map((ex, i) => (
                  <button key={i} onClick={() => setQuery(ex)} style={S.exampleBtn} disabled={submitting}>{ex.slice(0, 40)}…</button>
                ))}
              </div>
              <button onClick={submit} disabled={submitting || !query.trim()} style={S.submitBtn}>
                {submitting ? 'Running…' : 'Run autonomous task'}
              </button>
            </div>
          </div>

          <div style={S.split}>
            <section style={S.panel}>
              <h3 style={S.sectionH}>Live agent log {events.length > 0 && <span style={S.count}>{events.length}</span>}</h3>
              <div style={S.log}>
                {events.length === 0 && <div style={S.muted}>No activity yet. Submit a task above.</div>}
                {events.map((e, i) => (
                  <div key={i} style={S.logEntry}>
                    <span style={S.logTime}>{new Date(e.ts).toLocaleTimeString()}</span>
                    {e.agent && <span style={{ ...S.logAgent, background: (AGENT_COLORS[e.agent] || '#475569') + '33', color: AGENT_COLORS[e.agent] || '#cbd5e1' }}>{e.agent}</span>}
                    <span style={S.logKind}>{e.kind.replace('agent.', '').replace('task.', 'task:')}</span>
                    <span style={S.logText}>{summarize(e)}</span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </section>

            <section style={S.panel}>
              <h3 style={S.sectionH}>Result</h3>
              {!activeTask && <div style={S.muted}>Run a task to see the result here.</div>}
              {activeTask && <ResultView task={activeTask} />}
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

function ResultView({ task }: { task: Task }) {
  const r = task.result
  if (task.status === 'error') return <div style={{ ...S.muted, color: '#fca5a5' }}>Error: {String(task.error || 'unknown')}</div>
  if (task.status === 'pending' || task.status === 'running') return <div style={S.muted}>Running… (status: {task.status})</div>
  if (!r) return <div style={S.muted}>No result.</div>
  return (
    <div>
      {r.summary && (
        <div style={S.summaryBox}>
          <div style={S.summaryLabel}>SYNTHESIS</div>
          <div style={S.summary}>{r.summary}</div>
        </div>
      )}
      {r.app && r.deploy && (
        <div style={S.appBox}>
          <div style={S.summaryLabel}>GENERATED APP</div>
          <div style={S.appTitle}>{r.app.title} <span style={S.appTpl}>{r.app.template}</span></div>
          <div style={S.muted}>{r.app.fileCount} files · {(r.app.totalBytes / 1024).toFixed(1)} KB</div>
          <a href={r.deploy.downloadPath} style={S.downloadBtn} download>⬇ Download zip</a>
          {r.deploy.deployInstructions && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', color: '#94a3b8' }}>Deploy instructions</summary>
              <ol style={{ marginTop: 8, paddingLeft: 20 }}>
                {r.deploy.deployInstructions.map((s: string, i: number) => <li key={i} style={{ marginBottom: 4, fontSize: 13 }}>{s}</li>)}
              </ol>
            </details>
          )}
        </div>
      )}
      {r.news && r.news.count > 0 && (
        <div style={S.section}>
          <div style={S.summaryLabel}>NEWS AGENT · {r.news.count} ITEMS</div>
          <ul style={S.list}>{r.news.items.slice(0, 5).map((it: any, i: number) => (
            <li key={i}><a href={it.link} target="_blank" rel="noopener" style={S.link}>{it.title}</a> <span style={S.muted}>· {it.source}</span></li>
          ))}</ul>
        </div>
      )}
      {r.research && r.research.count > 0 && (
        <div style={S.section}>
          <div style={S.summaryLabel}>RESEARCH AGENT · {r.research.count} SOURCES</div>
          <ul style={S.list}>{r.research.sources.slice(0, 5).map((s: any, i: number) => (
            <li key={i}><a href={s.url} target="_blank" rel="noopener" style={S.link}>{s.title || s.url}</a></li>
          ))}</ul>
        </div>
      )}
      {r.qa && (
        <div style={{ ...S.section, color: r.qa.ok ? '#86efac' : '#fca5a5' }}>
          QA: {r.qa.ok ? '✓ all checks passed' : `⚠ ${r.qa.issues.length} issues — ${r.qa.issues.join('; ')}`}
        </div>
      )}
    </div>
  )
}

function summarize(e: AgentEvent): string {
  if (e.kind === 'task.start') return `Task started · "${e.query}" (${e.lang})`
  if (e.kind === 'task.done') return 'Task complete'
  if (e.kind === 'task.error') return `Task error: ${e.error}`
  if (e.kind === 'agent.thought') return e.text || ''
  if (e.kind === 'agent.tool') return `${e.tool || ''} → ${e.got ?? e.files ?? '?'}`
  if (e.kind === 'agent.result') {
    const parts: string[] = []
    if (e.count !== undefined) parts.push(`${e.count} items`)
    if (e.template) parts.push(`template=${e.template}`)
    if (e.fileCount) parts.push(`${e.fileCount} files`)
    if (e.artifactId) parts.push(`artifact=${e.artifactId}`)
    if (e.ok !== undefined) parts.push(e.ok ? 'ok' : `issues=${(e.issues || []).length}`)
    return parts.join(' · ') || 'done'
  }
  if (e.kind === 'agent.error') return `error: ${e.error}`
  if (e.kind === 'agent.start') return `started`
  return ''
}

function statusColor(s: string) { return s === 'done' ? '#10b981' : s === 'running' ? '#f59e0b' : s === 'error' ? '#ef4444' : '#64748b' }
function timeAgo(t: number) {
  const d = Math.floor((Date.now() - t) / 1000)
  if (d < 60) return `${d}s ago`
  if (d < 3600) return `${Math.floor(d/60)}m ago`
  return `${Math.floor(d/3600)}h ago`
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0b1120', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' },
  header: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', borderBottom: '1px solid #1e293b', flexWrap: 'wrap' },
  back: { background: 'transparent', color: '#94a3b8', border: '1px solid #334155', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' },
  brand: { fontSize: 18, fontWeight: 700, color: '#c8ff00' },
  tagline: { fontSize: 12, color: '#64748b' },
  badges: { display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' },
  badge: { fontSize: 11, padding: '3px 8px', borderRadius: 10, border: '1px solid', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 },
  body: { display: 'grid', gridTemplateColumns: '260px 1fr', gap: 0, minHeight: 'calc(100vh - 73px)' },
  sidebar: { borderRight: '1px solid #1e293b', padding: 16, overflowY: 'auto', maxHeight: 'calc(100vh - 73px)' },
  sectionH: { fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.06, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 },
  count: { background: '#334155', color: '#cbd5e1', fontSize: 11, padding: '1px 7px', borderRadius: 10 },
  taskItem: { display: 'block', width: '100%', textAlign: 'left', background: '#0f172a', border: '1px solid #1e293b', padding: 10, borderRadius: 6, marginBottom: 6, cursor: 'pointer', color: '#e2e8f0' },
  taskItemActive: { borderColor: '#c8ff00' },
  taskQuery: { fontSize: 13, marginBottom: 4 },
  taskMeta: { fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: '50%' },
  main: { padding: 24, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' },
  composer: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 14 },
  textarea: { width: '100%', minHeight: 70, background: '#020617', color: '#e2e8f0', border: '1px solid #1e293b', borderRadius: 6, padding: 10, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' },
  composerActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 12, flexWrap: 'wrap' },
  examples: { display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 },
  exampleBtn: { background: 'transparent', color: '#64748b', border: '1px solid #334155', padding: '4px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer' },
  submitBtn: { background: '#c8ff00', color: '#0b1120', border: 0, padding: '8px 18px', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 14 },
  split: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1, minHeight: 0 },
  panel: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', minHeight: 0 },
  log: { flex: 1, overflowY: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 12 },
  logEntry: { display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #1e293b22', alignItems: 'baseline' },
  logTime: { color: '#475569', fontSize: 10, minWidth: 70 },
  logAgent: { fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600, textTransform: 'uppercase' },
  logKind: { color: '#64748b', fontSize: 11, minWidth: 70 },
  logText: { color: '#cbd5e1', flex: 1, wordBreak: 'break-word' },
  muted: { color: '#64748b', fontSize: 13 },
  summaryBox: { background: '#0a1024', border: '1px solid #1e293b', borderRadius: 6, padding: 12, marginBottom: 14 },
  summaryLabel: { fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6, fontWeight: 600 },
  summary: { fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' },
  appBox: { background: '#0a1024', border: '1px solid #14532d', borderRadius: 6, padding: 12, marginBottom: 14 },
  appTitle: { fontSize: 16, fontWeight: 600, marginBottom: 4 },
  appTpl: { fontSize: 11, background: '#14532d', color: '#86efac', padding: '2px 8px', borderRadius: 10, marginLeft: 8 },
  downloadBtn: { display: 'inline-block', marginTop: 10, background: '#10b981', color: '#0b1120', padding: '8px 14px', borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: 13 },
  section: { padding: '10px 0', fontSize: 13 },
  list: { paddingLeft: 18, margin: '8px 0' },
  link: { color: '#38bdf8', textDecoration: 'none' },
}
