import { useState, useEffect, useCallback, useRef } from 'react'
import '../styles/system-health.css'

type ProviderStatus = 'ok' | 'warn' | 'error' | 'offline' | 'testing' | 'missing'

interface ProviderData {
  name: string
  available: boolean
  score: number
  successCount: number
  failureCount: number
  successRate: number | null
  avgLatencyMs: number | null
  lastUsed: number | null
  lastError: { error: string; ts: number } | null
  state?: string
  testStatus?: ProviderStatus
  testLatency?: number | null
  testError?: string | null
}

interface RouterLog {
  id: string
  provider: string
  model?: string
  success: boolean
  latencyMs: number | null
  error: string | null
  truncated: boolean
  empty: boolean
  ts: number
  type?: string
  chain?: Array<{ provider: string; success: boolean; latencyMs: number }>
}

interface SystemMemory {
  heapUsedMB: number
  heapTotalMB: number
}

interface SystemHealth {
  memory: SystemMemory
  semaphores: Array<{ label: string; running: number; max: number }>
  circuits: Array<{ label: string; state: string }>
  monitors: { agent: { total: number; success: number; avgMs: number }; chat: { total: number; success: number; avgMs: number } }
  ts: string
}

interface DiagSummary {
  totalRequests: number
  recentWindow: number
  successRate: number | null
  emptyResponses: number
  truncatedResponses: number
  highFailureProviders: Array<{ provider: string; recentFailures: number }>
  providerScores: Record<string, ProviderData>
  recommendations: Array<{ level: string; provider: string; msg: string }>
  ts: string
}

interface SyncStatus {
  status: string
  github: { commitSha: string | null; shortSha: string | null }
  vercel: { commitSha: string | null; shortSha: string | null; deploymentUrl: string | null; state: string }
  branch: string
  repository: string
  ts: string
}

const PROVIDER_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  mistral: 'mistral-small-latest',
  nvidia: 'meta/llama-3.3-70b-instruct',
  cohere: 'command-r-plus-08-2024',
  openrouter: 'meta-llama/llama-3.3-70b:free',
  groq: 'llama-3.3-70b-versatile',
  deepseek: 'deepseek-chat',
  ollama: 'local',
}

const TABS = ['Overview', 'Providers', 'Router Logs', 'Diagnostics', 'Deploy']

function scoreColor(score: number) {
  if (score >= 80) return '#22c55e'
  if (score >= 55) return '#eab308'
  return '#ef4444'
}

function statusBadge(status: ProviderStatus) {
  const map: Record<ProviderStatus, [string, string]> = {
    ok: ['ok', '● Connected'],
    warn: ['warn', '● Degraded'],
    error: ['error', '✕ Error'],
    offline: ['offline', '○ Offline'],
    testing: ['testing', '◌ Testing…'],
    missing: ['offline', '○ No Key'],
  }
  const [cls, label] = map[status] || ['offline', '○ Unknown']
  return <span className={`sh-badge ${cls}`}>{label}</span>
}

function relTime(ts: number | null) {
  if (!ts) return 'never'
  const diff = Date.now() - ts
  if (diff < 60000) return `${Math.round(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`
  return `${Math.round(diff / 3600000)}h ago`
}

export default function SystemHealth() {
  const [activeTab, setActiveTab] = useState(0)
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null)
  const [diagSummary, setDiagSummary] = useState<DiagSummary | null>(null)
  const [routerHealth, setRouterHealth] = useState<{ providers: ProviderData[]; metrics: { calls: number; success: number; failed: number } } | null>(null)
  const [routerLogs, setRouterLogs] = useState<RouterLog[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [providerTests, setProviderTests] = useState<Record<string, ProviderStatus>>({})
  const [providerTestResults, setProviderTestResults] = useState<Record<string, { latency?: number; error?: string; model?: string }>>({})
  const [testLog, setTestLog] = useState<string[]>([])
  const [loadingTests, setLoadingTests] = useState<Record<string, boolean>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [deployResult, setDeployResult] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [deployToken, setDeployToken] = useState('')
  const [logProvider, setLogProvider] = useState<string>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const logRef = useRef<HTMLDivElement>(null)

  const addTestLog = (line: string, type: 'ok' | 'err' | 'info' | 'warn' = 'info') => {
    const ts = new Date().toLocaleTimeString()
    setTestLog(prev => [...prev.slice(-200), `[${ts}] <${type}>${line}</${type}>`])
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 50)
  }

  const fetchAll = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const [sysRes, diagRes, routerRes, logsRes, syncRes] = await Promise.allSettled([
        fetch('/api/system-health').then(r => r.json()),
        fetch('/api/admin/router-diagnostic').then(r => r.json()),
        fetch('/api/ai-router/health').then(r => r.json()),
        fetch('/api/admin/router-logs?limit=100').then(r => r.json()),
        fetch('/api/dz-agent/sync-status').then(r => r.json()),
      ])
      if (sysRes.status === 'fulfilled') setSystemHealth(sysRes.value)
      if (diagRes.status === 'fulfilled') setDiagSummary(diagRes.value)
      if (routerRes.status === 'fulfilled') setRouterHealth(routerRes.value)
      if (logsRes.status === 'fulfilled') setRouterLogs(logsRes.value?.logs || [])
      if (syncRes.status === 'fulfilled') setSyncStatus(syncRes.value)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    let interval: ReturnType<typeof setInterval>
    if (autoRefresh) interval = setInterval(fetchAll, 15000)
    return () => clearInterval(interval)
  }, [fetchAll, autoRefresh])

  const testProvider = useCallback(async (provider: string) => {
    setLoadingTests(p => ({ ...p, [provider]: true }))
    setProviderTests(p => ({ ...p, [provider]: 'testing' }))
    addTestLog(`Testing ${provider}…`, 'info')
    const t0 = Date.now()
    try {
      const r = await fetch('/api/admin/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })
      const data = await r.json()
      const latency = Date.now() - t0
      if (data.ok) {
        setProviderTests(p => ({ ...p, [provider]: 'ok' }))
        setProviderTestResults(p => ({ ...p, [provider]: { latency, model: data.model } }))
        addTestLog(`✓ ${provider} responded in ${latency}ms (model: ${data.model || 'unknown'})`, 'ok')
      } else {
        const errMsg = data.error || 'Unknown error'
        setProviderTests(p => ({ ...p, [provider]: errMsg.includes('429') || errMsg.includes('rate') ? 'warn' : 'error' }))
        setProviderTestResults(p => ({ ...p, [provider]: { latency, error: errMsg } }))
        addTestLog(`✗ ${provider}: ${errMsg}`, 'err')
      }
    } catch (e: any) {
      setProviderTests(p => ({ ...p, [provider]: 'error' }))
      setProviderTestResults(p => ({ ...p, [provider]: { error: e.message } }))
      addTestLog(`✗ ${provider} network error: ${e.message}`, 'err')
    } finally {
      setLoadingTests(p => ({ ...p, [provider]: false }))
    }
  }, [])

  const testAllProviders = useCallback(async () => {
    addTestLog('=== Testing all providers ===', 'info')
    const providers = ['openai', 'gemini', 'mistral', 'nvidia', 'cohere', 'openrouter', 'groq']
    for (const p of providers) {
      await testProvider(p)
      await new Promise(r => setTimeout(r, 300))
    }
    addTestLog('=== Test run complete ===', 'info')
  }, [testProvider])

  const handleSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    addTestLog('Starting GitHub sync…', 'info')
    try {
      const r = await fetch('/api/dz-agent/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-deploy-token': deployToken },
        body: JSON.stringify({ message: 'chore: stability & router audit update' }),
      })
      const d = await r.json()
      if (d.success) {
        setSyncResult(`✓ Synced: ${d.message} (${d.shortSha || ''})`)
        addTestLog(`✓ GitHub sync: ${d.message}`, 'ok')
      } else {
        setSyncResult(`✗ ${d.error || 'Sync failed'}`)
        addTestLog(`✗ Sync failed: ${d.error}`, 'err')
      }
    } catch (e: any) {
      setSyncResult(`✗ Network error: ${e.message}`)
      addTestLog(`✗ Sync error: ${e.message}`, 'err')
    } finally {
      setSyncing(false)
      fetchAll()
    }
  }

  const handleDeploy = async () => {
    setDeploying(true)
    setDeployResult(null)
    addTestLog('Triggering Vercel deployment…', 'info')
    try {
      const r = await fetch('/api/dz-agent/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-deploy-token': deployToken },
        body: JSON.stringify({}),
      })
      const d = await r.json()
      if (d.success) {
        setDeployResult(`✓ Deploy triggered → ${d.url || 'https://dzagent.app'}`)
        addTestLog(`✓ Vercel deploy: ${d.message} sha=${d.shortSha}`, 'ok')
      } else {
        setDeployResult(`✗ ${d.error || 'Deploy failed'}`)
        addTestLog(`✗ Deploy failed: ${d.error}`, 'err')
      }
    } catch (e: any) {
      setDeployResult(`✗ Network error: ${e.message}`)
      addTestLog(`✗ Deploy error: ${e.message}`, 'err')
    } finally {
      setDeploying(false)
    }
  }

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify({ routerLogs, diagSummary, systemHealth, ts: new Date().toISOString() }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dz-agent-diagnostics-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const allProviders = diagSummary?.providerScores
    ? Object.entries(diagSummary.providerScores).map(([name, data]) => ({
        ...data,
        name,
        testStatus: providerTests[name],
        testLatency: providerTestResults[name]?.latency ?? null,
        testError: providerTestResults[name]?.error ?? null,
      }))
    : []

  const filteredLogs = logProvider === 'all' ? routerLogs : routerLogs.filter(l => l.provider === logProvider)

  const memPct = systemHealth ? Math.round((systemHealth.memory.heapUsedMB / systemHealth.memory.heapTotalMB) * 100) : 0

  return (
    <div className="sh-root">
      {/* Header */}
      <div className="sh-header">
        <div className="sh-header-left">
          <div className="sh-logo">DZ</div>
          <div>
            <div className="sh-title">System Health Center</div>
            <div className="sh-subtitle">DZ-Agent Admin Diagnostics</div>
          </div>
        </div>
        <div className="sh-header-actions">
          <button className="sh-btn" onClick={() => setAutoRefresh(p => !p)}>
            {autoRefresh ? '⏸ Pause' : '▶ Auto'}
          </button>
          <button className="sh-btn" onClick={fetchAll} disabled={isRefreshing}>
            <span className={isRefreshing ? 'sh-spin' : ''}>↻</span> Refresh
          </button>
          <button className="sh-btn" onClick={exportLogs}>⬇ Export</button>
          <button className="sh-btn primary" onClick={() => setActiveTab(4)}>🚀 Deploy</button>
        </div>
      </div>

      {/* Nav */}
      <div className="sh-nav">
        {TABS.map((tab, i) => (
          <button key={tab} className={`sh-nav-tab ${activeTab === i ? 'active' : ''}`} onClick={() => setActiveTab(i)}>
            {tab}
          </button>
        ))}
      </div>

      <div className="sh-body">

        {/* ─── TAB 0: OVERVIEW ─── */}
        {activeTab === 0 && (
          <>
            <div className="sh-grid">
              {/* Memory */}
              <div className="sh-card">
                <div className="sh-card-header">
                  <div className="sh-card-title">🧠 Memory</div>
                  <span className={`sh-badge ${memPct > 80 ? 'error' : memPct > 60 ? 'warn' : 'ok'}`}>{memPct}%</span>
                </div>
                <div className="sh-card-value" style={{ color: memPct > 80 ? '#ef4444' : '#22c55e' }}>
                  {systemHealth?.memory.heapUsedMB ?? '—'}<span style={{ fontSize: 14, fontWeight: 400, color: '#64748b' }}>MB</span>
                </div>
                <div className="sh-card-label">of {systemHealth?.memory.heapTotalMB ?? '—'}MB heap</div>
              </div>

              {/* AI Requests */}
              <div className="sh-card">
                <div className="sh-card-header">
                  <div className="sh-card-title">⚡ AI Requests</div>
                </div>
                <div className="sh-card-value" style={{ color: '#9acd32' }}>
                  {diagSummary?.totalRequests ?? '—'}
                </div>
                <div className="sh-card-label">
                  Success rate: {diagSummary?.successRate !== null && diagSummary?.successRate !== undefined ? `${diagSummary.successRate}%` : '—'}
                </div>
              </div>

              {/* Router */}
              <div className="sh-card">
                <div className="sh-card-header">
                  <div className="sh-card-title">🔀 Router</div>
                  <span className={`sh-badge ${routerHealth?.providers?.some((p: any) => p.available) ? 'ok' : 'error'}`}>
                    {routerHealth?.providers?.filter((p: any) => p.available).length ?? 0}/{routerHealth?.providers?.length ?? 0} active
                  </span>
                </div>
                <div className="sh-card-value" style={{ color: '#3b82f6' }}>
                  {routerHealth?.metrics.calls ?? '—'}
                </div>
                <div className="sh-card-label">total router calls</div>
              </div>

              {/* Failures */}
              <div className="sh-card">
                <div className="sh-card-header">
                  <div className="sh-card-title">⚠ Issues</div>
                </div>
                <div className="sh-card-value" style={{ color: (diagSummary?.emptyResponses ?? 0) > 0 ? '#ef4444' : '#22c55e' }}>
                  {diagSummary?.emptyResponses ?? 0}
                </div>
                <div className="sh-card-label">empty responses ({diagSummary?.truncatedResponses ?? 0} truncated)</div>
              </div>
            </div>

            {/* Circuit breakers */}
            <div className="sh-card" style={{ marginBottom: 16 }}>
              <div className="sh-card-header">
                <div className="sh-card-title">🔌 Circuit Breakers</div>
              </div>
              {systemHealth?.circuits.map(c => (
                <div key={c.label} className="sh-stat-row">
                  <span className="sh-stat-key">{c.label}</span>
                  <span className={`sh-badge ${c.state === 'closed' ? 'ok' : c.state === 'half-open' ? 'warn' : 'error'}`}>
                    {c.state}
                  </span>
                </div>
              ))}
              {systemHealth?.semaphores.map(s => (
                <div key={s.label} className="sh-stat-row">
                  <span className="sh-stat-key">semaphore:{s.label}</span>
                  <span className="sh-stat-val">{s.running}/{s.max} running</span>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            {(diagSummary?.recommendations?.length ?? 0) > 0 && (
              <div className="sh-card">
                <div className="sh-section-title">💡 Recommendations</div>
                {diagSummary?.recommendations.map((r, i) => (
                  <div key={i} className={`sh-rec ${r.level}`}>
                    <span>{r.level === 'critical' ? '🔴' : r.level === 'warning' ? '🟡' : '🟠'}</span>
                    <span>{r.msg}</span>
                  </div>
                ))}
              </div>
            )}
            {(diagSummary?.recommendations?.length ?? 0) === 0 && diagSummary && (
              <div className="sh-card">
                <div style={{ textAlign: 'center', padding: 24, color: '#22c55e' }}>
                  ✅ All systems nominal — no issues detected
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── TAB 1: PROVIDERS ─── */}
        {activeTab === 1 && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <button className="sh-btn primary" onClick={testAllProviders}>▶ Test All Providers</button>
              <button className="sh-btn" onClick={() => setTestLog([])}>Clear Log</button>
            </div>

            <div className="sh-provider-grid">
              {(allProviders.length ? allProviders : Object.keys(PROVIDER_MODELS).map(n => ({ name: n, available: false, score: 100, successCount: 0, failureCount: 0, successRate: null as null, avgLatencyMs: null as null, lastUsed: null as null, lastError: null as null, testStatus: undefined as ProviderStatus | undefined, testLatency: null as null, testError: null as null }))).map((p) => {
                const status: ProviderStatus = p.testStatus || (p.available ? 'ok' : 'missing')
                const score = p.score ?? 100
                return (
                  <div key={p.name} className={`sh-provider-card status-${status}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <div className="sh-provider-name">{p.name.toUpperCase()}</div>
                      {statusBadge(status)}
                    </div>
                    <div className="sh-provider-model">{PROVIDER_MODELS[p.name] || '—'}</div>
                    <div className="sh-score-bar">
                      <div className="sh-score-fill" style={{ width: `${score}%`, background: scoreColor(score) }} />
                    </div>
                    <div className="sh-provider-stats">
                      <div className="sh-provider-stat">
                        <span className="sh-provider-stat-val" style={{ color: scoreColor(score) }}>{score}</span>
                        <span className="sh-provider-stat-key">Score</span>
                      </div>
                      <div className="sh-provider-stat">
                        <span className="sh-provider-stat-val">{p.avgLatencyMs ?? providerTestResults[p.name]?.latency ?? '—'}{p.avgLatencyMs || providerTestResults[p.name]?.latency ? 'ms' : ''}</span>
                        <span className="sh-provider-stat-key">Latency</span>
                      </div>
                      <div className="sh-provider-stat">
                        <span className="sh-provider-stat-val">{p.successCount ?? 0}</span>
                        <span className="sh-provider-stat-key">Success</span>
                      </div>
                      <div className="sh-provider-stat">
                        <span className="sh-provider-stat-val">{p.failureCount ?? 0}</span>
                        <span className="sh-provider-stat-key">Failures</span>
                      </div>
                    </div>
                    {p.lastError && (
                      <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ✕ {p.lastError.error}
                      </div>
                    )}
                    {providerTestResults[p.name]?.error && (
                      <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        ✕ {providerTestResults[p.name].error}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="sh-btn"
                        style={{ flex: 1, justifyContent: 'center', fontSize: 11 }}
                        onClick={() => testProvider(p.name)}
                        disabled={loadingTests[p.name]}
                      >
                        {loadingTests[p.name] ? <span className="sh-spin">◌</span> : '▶'} Test
                      </button>
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
                      Last used: {relTime(p.lastUsed)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Test Console */}
            <div className="sh-card">
              <div className="sh-section-title">🖥 Test Console</div>
              <div className="sh-test-output" ref={logRef}>
                {testLog.length === 0 && <span style={{ color: '#64748b' }}>// Run a provider test to see output here…</span>}
                {testLog.map((line, i) => {
                  const type = line.match(/<(ok|err|info|warn)>/)?.[1] || 'info'
                  const text = line.replace(/<\/?(?:ok|err|info|warn)>/g, '')
                  return <div key={i} className={`sh-test-line-${type}`}>{text}</div>
                })}
              </div>
            </div>
          </>
        )}

        {/* ─── TAB 2: ROUTER LOGS ─── */}
        {activeTab === 2 && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                style={{ background: '#12121a', border: '1px solid #1e1e2e', color: '#e2e8f0', padding: '6px 10px', borderRadius: 6, fontSize: 12 }}
                value={logProvider}
                onChange={e => setLogProvider(e.target.value)}
              >
                <option value="all">All Providers</option>
                {Object.keys(PROVIDER_MODELS).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <span style={{ fontSize: 12, color: '#64748b' }}>{filteredLogs.length} entries</span>
            </div>

            <div className="sh-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="sh-log-table">
                  <thead>
                    <tr>
                      <th>Request ID</th>
                      <th>Provider</th>
                      <th>Model</th>
                      <th>Status</th>
                      <th>Latency</th>
                      <th>Flags</th>
                      <th>Error</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>No logs yet — router activity will appear here</td></tr>
                    )}
                    {filteredLogs.map((log, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{log.id?.slice(0, 16) || '—'}</td>
                        <td className="sh-log-provider">{log.provider || '—'}</td>
                        <td style={{ fontSize: 10, color: '#64748b' }}>{log.model || '—'}</td>
                        <td>
                          {log.success
                            ? <span className="sh-log-ok">✓</span>
                            : <span className="sh-log-fail">✗</span>}
                        </td>
                        <td>{log.latencyMs ? `${log.latencyMs}ms` : '—'}</td>
                        <td>
                          {log.empty && <span className="sh-badge error" style={{ marginRight: 4 }}>empty</span>}
                          {log.truncated && <span className="sh-badge warn">trunc</span>}
                        </td>
                        <td className="sh-log-error" title={log.error || ''}>{log.error || ''}</td>
                        <td style={{ color: '#64748b', fontSize: 10 }}>{log.ts ? new Date(log.ts).toLocaleTimeString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ─── TAB 3: DIAGNOSTICS ─── */}
        {activeTab === 3 && (
          <>
            <div className="sh-grid-2">
              <div className="sh-card">
                <div className="sh-section-title">📊 Chat Monitor</div>
                {['agent', 'chat'].map(k => {
                  const m = systemHealth?.monitors?.[k as 'agent' | 'chat']
                  return (
                    <div key={k} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, textTransform: 'uppercase' }}>{k}</div>
                      <div className="sh-stat-row"><span className="sh-stat-key">Total Calls</span><span className="sh-stat-val">{m?.total ?? 0}</span></div>
                      <div className="sh-stat-row"><span className="sh-stat-key">Successful</span><span className="sh-stat-val">{m?.success ?? 0}</span></div>
                      <div className="sh-stat-row"><span className="sh-stat-key">Avg Latency</span><span className="sh-stat-val">{m?.avgMs ?? 0}ms</span></div>
                    </div>
                  )
                })}
              </div>

              <div className="sh-card">
                <div className="sh-section-title">🔍 High-Failure Providers</div>
                {(diagSummary?.highFailureProviders?.length ?? 0) === 0 ? (
                  <div style={{ color: '#22c55e', padding: '12px 0' }}>✅ No high-failure providers detected</div>
                ) : diagSummary?.highFailureProviders.map((hf, i) => (
                  <div key={i} className="sh-stat-row">
                    <span className="sh-stat-key">{hf.provider}</span>
                    <span className="sh-badge error">{hf.recentFailures} failures</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="sh-card">
              <div className="sh-section-title">🔗 Fallback Chains (Recent)</div>
              <div className="sh-section-desc">Visualization of provider fallback paths from last 100 requests</div>
              {routerLogs.filter(l => l.type === 'fallback_chain').slice(0, 10).map((log, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>{new Date(log.ts).toLocaleTimeString()} — {log.id}</div>
                  <div className="sh-chain">
                    {log.chain?.map((node, j) => (
                      <>
                        <div key={j} className={`sh-chain-node ${node.success ? 'success' : 'fail'}`}>
                          {node.success ? '✓' : '✗'} {node.provider} {node.latencyMs ? `${node.latencyMs}ms` : ''}
                        </div>
                        {j < (log.chain?.length ?? 0) - 1 && <span className="sh-chain-arrow">→</span>}
                      </>
                    ))}
                  </div>
                </div>
              ))}
              {routerLogs.filter(l => l.type === 'fallback_chain').length === 0 && (
                <div style={{ color: '#64748b', padding: '12px 0' }}>No fallback chains recorded yet</div>
              )}
            </div>

            <div className="sh-card">
              <div className="sh-section-title">⚙ Groq Key Rotation</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="sh-btn" onClick={() => fetch('/api/groq-key-stats').then(r => r.json()).then(d => addTestLog(JSON.stringify(d, null, 2), 'info'))}>
                  View Groq Stats
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─── TAB 4: DEPLOY ─── */}
        {activeTab === 4 && (
          <>
            {/* Sync Status */}
            <div className="sh-card" style={{ marginBottom: 16 }}>
              <div className="sh-section-title">🔗 Sync Status</div>
              <div className="sh-deploy-row">
                <div className="sh-deploy-icon" style={{ background: '#1e293b', fontSize: 20 }}>⌥</div>
                <div style={{ flex: 1 }}>
                  <div className="sh-deploy-label">GitHub Repository</div>
                  <div className="sh-deploy-meta">
                    {syncStatus?.repository || 'Nadirinfograph23/DZ-GPT'} · branch: {syncStatus?.branch || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>SHA: {syncStatus?.github?.shortSha || '—'}</div>
                </div>
              </div>
              <div className="sh-deploy-row">
                <div className="sh-deploy-icon" style={{ background: '#1e293b', fontSize: 20 }}>▲</div>
                <div style={{ flex: 1 }}>
                  <div className="sh-deploy-label">Vercel Production</div>
                  <div className="sh-deploy-meta">
                    <a href="https://dzagent.app" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>
                      https://dzagent.app
                    </a>
                  </div>
                </div>
                <div>
                  <span className={`sh-badge ${syncStatus?.status === 'synced' ? 'ok' : syncStatus?.status === 'out_of_sync' ? 'warn' : 'offline'}`}>
                    {syncStatus?.status || 'unknown'}
                  </span>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>SHA: {syncStatus?.vercel?.shortSha || '—'}</div>
                </div>
              </div>
            </div>

            {/* Deploy Token */}
            <div className="sh-card" style={{ marginBottom: 16 }}>
              <div className="sh-section-title">🔑 Deploy Token</div>
              <div className="sh-section-desc">Enter the admin deploy token to authorize sync and deploy actions.</div>
              <input
                type="password"
                placeholder="Enter deploy token…"
                value={deployToken}
                onChange={e => setDeployToken(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            {/* Actions */}
            <div className="sh-grid-2">
              <div className="sh-card">
                <div className="sh-section-title">📤 Sync → GitHub</div>
                <div className="sh-section-desc">Commit local changes and push to GitHub. Vercel auto-deploys on push.</div>
                <button className="sh-btn primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }} onClick={handleSync} disabled={syncing || !deployToken}>
                  {syncing ? <><span className="sh-spin">◌</span> Syncing…</> : '📤 Sync to GitHub'}
                </button>
                {syncResult && (
                  <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 6, background: syncResult.startsWith('✓') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: syncResult.startsWith('✓') ? '#22c55e' : '#ef4444' }}>
                    {syncResult}
                  </div>
                )}
              </div>

              <div className="sh-card">
                <div className="sh-section-title">🚀 Force Deploy → Vercel</div>
                <div className="sh-section-desc">Trigger a new Vercel production deployment directly from GitHub.</div>
                <button className="sh-btn primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }} onClick={handleDeploy} disabled={deploying || !deployToken}>
                  {deploying ? <><span className="sh-spin">◌</span> Deploying…</> : '🚀 Deploy to Vercel'}
                </button>
                {deployResult && (
                  <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 6, background: deployResult.startsWith('✓') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: deployResult.startsWith('✓') ? '#22c55e' : '#ef4444' }}>
                    {deployResult}
                  </div>
                )}
              </div>
            </div>

            {/* Live links */}
            <div className="sh-card">
              <div className="sh-section-title">🌐 Production Links</div>
              {[
                { label: 'Main Site', url: 'https://dzagent.app/' },
                { label: 'DZ Agent', url: 'https://dzagent.app/dz-agent' },
                { label: 'AI Quran', url: 'https://dzagent.app/quran' },
                { label: 'DZ Tube', url: 'https://dzagent.app/dz-tube' },
                { label: 'DZ Chat', url: 'https://dzagent.app/dzchat' },
              ].map(({ label, url }) => (
                <div key={url} className="sh-stat-row">
                  <span className="sh-stat-key">{label}</span>
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', fontSize: 12, textDecoration: 'none' }}>{url}</a>
                </div>
              ))}
            </div>

            {/* Activity log */}
            <div className="sh-card">
              <div className="sh-section-title">📋 Activity Log</div>
              <div className="sh-test-output" ref={logRef}>
                {testLog.length === 0 && <span style={{ color: '#64748b' }}>// Deploy/sync activity will appear here…</span>}
                {testLog.map((line, i) => {
                  const type = line.match(/<(ok|err|info|warn)>/)?.[1] || 'info'
                  const text = line.replace(/<\/?(?:ok|err|info|warn)>/g, '')
                  return <div key={i} className={`sh-test-line-${type}`}>{text}</div>
                })}
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
