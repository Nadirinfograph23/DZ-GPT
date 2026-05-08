import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/design-intelligence.css'

// ── Types ──────────────────────────────────────────────────────────────────
interface DesignAnalysis {
  url: string
  title: string
  colors: string[]
  fonts: string[]
  spacing: string[]
  borderRadius: string[]
  shadows: string[]
  cssVariables: Record<string, string>
  sections: string[]
  uiStyle: string
  analyzedAt: number
}

interface DesignTokens {
  cssVariables: string
  tailwindConfig: string
  designMd: string
  reactComponent: string
}

interface MemoryEntry {
  id: string
  url: string
  title: string
  uiStyle: string
  primaryColor: string | null
  fonts: string[]
  sections: string[]
  analyzedAt: number
}

type Tab = 'analyze' | 'tokens' | 'builder' | 'memory'
type TokenTab = 'css' | 'tailwind' | 'markdown' | 'react'

// ── Helpers ────────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button className={`dz-design-copy-btn ${copied ? 'copied' : ''}`} onClick={copy}>
      {copied ? '✓ Copied' : '⎘ Copy'}
    </button>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function DesignIntelligence() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('analyze')

  // Analyzer state
  const [url, setUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<DesignAnalysis | null>(null)
  const [analyzeError, setAnalyzeError] = useState('')

  // Tokens state
  const [tokens, setTokens] = useState<DesignTokens | null>(null)
  const [tokensLoading, setTokensLoading] = useState(false)
  const [activeTokenTab, setActiveTokenTab] = useState<TokenTab>('css')

  // Builder state
  const [builderPrompt, setBuilderPrompt] = useState('')
  const [pageType, setPageType] = useState('landing')
  const [pageFormat, setPageFormat] = useState('react')
  const [generatedCode, setGeneratedCode] = useState('')
  const [buildLoading, setBuildLoading] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Memory state
  const [memory, setMemory] = useState<MemoryEntry[]>([])
  const [memoryLoading, setMemoryLoading] = useState(false)

  // ── Analyze ──────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    if (!url.trim()) return
    setAnalyzing(true)
    setAnalyzeError('')
    setAnalysis(null)
    setTokens(null)
    try {
      const res = await fetch('/api/dz-design/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Analysis failed')
      setAnalysis(data.analysis)
    } catch (e: unknown) {
      setAnalyzeError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }, [url])

  // ── Generate Tokens ──────────────────────────────────────────────────────
  const handleGenerateTokens = useCallback(async () => {
    if (!analysis) return
    setTokensLoading(true)
    try {
      const res = await fetch('/api/dz-design/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setTokens(data)
      setActiveTab('tokens')
    } catch (e) {
      console.error(e)
    } finally {
      setTokensLoading(false)
    }
  }, [analysis])

  // ── Build Page ───────────────────────────────────────────────────────────
  const handleBuildPage = useCallback(async () => {
    setBuildLoading(true)
    setGeneratedCode('')
    setShowPreview(false)
    try {
      const res = await fetch('/api/dz-design/generate-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: builderPrompt,
          analysis,
          pageType,
          format: pageFormat,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)
      setGeneratedCode(data.code)
    } catch (e: unknown) {
      setGeneratedCode(`// Error: ${e instanceof Error ? e.message : 'Generation failed'}`)
    } finally {
      setBuildLoading(false)
    }
  }, [builderPrompt, analysis, pageType, pageFormat])

  // ── Load Memory ──────────────────────────────────────────────────────────
  const loadMemory = useCallback(async () => {
    setMemoryLoading(true)
    try {
      const res = await fetch('/api/dz-design/memory')
      const data = await res.json()
      if (data.ok) setMemory(data.designs || [])
    } catch {}
    finally { setMemoryLoading(false) }
  }, [])

  const deleteMemory = useCallback(async (id: string) => {
    await fetch(`/api/dz-design/memory/${id}`, { method: 'DELETE' })
    setMemory(prev => prev.filter(m => m.id !== id))
  }, [])

  const loadFromMemory = useCallback((entry: MemoryEntry) => {
    setUrl(entry.url)
    setActiveTab('analyze')
  }, [])

  useEffect(() => {
    if (activeTab === 'memory') loadMemory()
  }, [activeTab, loadMemory])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="dz-design">
      {/* Header */}
      <div className="dz-design-header">
        <button className="dz-design-header-back" onClick={() => navigate('/')}>← Back</button>
        <div className="dz-design-header-icon">🎨</div>
        <div>
          <h1>Design Intelligence</h1>
          <p>Analyze any website — extract design tokens, generate components & pages</p>
        </div>
        <div className="dz-design-header-badge">DZ Design v1</div>
      </div>

      {/* Tabs */}
      <div className="dz-design-tabs">
        {([
          { id: 'analyze', label: '🔍 Analyze Website' },
          { id: 'tokens', label: '⚙️ Design Tokens' },
          { id: 'builder', label: '🏗️ AI Page Builder' },
          { id: 'memory', label: '🗂️ Design Memory' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            className={`dz-design-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="dz-design-body">
        {/* ── Analyze Tab ─────────────────────────────────────────────── */}
        {activeTab === 'analyze' && (
          <div className="dz-design-analyzer">
            <div className="dz-design-url-row">
              <input
                className="dz-design-url-input"
                type="text"
                placeholder="https://example.com"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              />
              <button
                className="dz-design-analyze-btn"
                onClick={handleAnalyze}
                disabled={analyzing || !url.trim()}
              >
                {analyzing ? <><span className="dz-design-spinner" /> Analyzing...</> : '🔍 Analyze'}
              </button>
            </div>

            {analyzeError && <div className="dz-design-error">❌ {analyzeError}</div>}

            {analyzing && (
              <div className="dz-design-loading">
                <span className="dz-design-spinner" />
                Fetching website and extracting design tokens...
              </div>
            )}

            {analysis && (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="dz-design-style-badge">
                    🎨 {analysis.uiStyle}
                  </div>
                  <span style={{ color: '#555', fontSize: 12 }}>
                    Analyzed: <strong style={{ color: '#888' }}>{analysis.title || analysis.url}</strong>
                  </span>
                  <button
                    className="dz-design-analyze-btn"
                    style={{ padding: '8px 16px', fontSize: 12 }}
                    onClick={handleGenerateTokens}
                    disabled={tokensLoading}
                  >
                    {tokensLoading ? '⌛ Generating...' : '⚙️ Generate Tokens'}
                  </button>
                </div>

                <div className="dz-design-results">
                  {/* Colors */}
                  <div className="dz-design-card">
                    <div className="dz-design-card-title">🎨 Colors ({analysis.colors.length})</div>
                    <div className="dz-design-color-grid">
                      {analysis.colors.map((c, i) => (
                        <div
                          key={i}
                          className="dz-design-color-swatch"
                          title={`Click to copy ${c}`}
                          onClick={() => navigator.clipboard.writeText(c)}
                        >
                          <div className="dz-design-color-dot" style={{ background: c }} />
                          <span className="dz-design-color-val">{c}</span>
                        </div>
                      ))}
                      {analysis.colors.length === 0 && <span style={{ color: '#555', fontSize: 13 }}>No colors found</span>}
                    </div>
                  </div>

                  {/* Fonts */}
                  <div className="dz-design-card">
                    <div className="dz-design-card-title">🔤 Typography</div>
                    <div className="dz-design-tag-list">
                      {analysis.fonts.map((f, i) => <span key={i} className="dz-design-tag">{f}</span>)}
                      {analysis.fonts.length === 0 && <span style={{ color: '#555', fontSize: 13 }}>No fonts detected</span>}
                    </div>
                    {analysis.spacing.length > 0 && (
                      <>
                        <div className="dz-design-card-title" style={{ marginTop: 14 }}>📐 Spacing</div>
                        <div className="dz-design-tag-list">
                          {analysis.spacing.map((s, i) => <span key={i} className="dz-design-tag">{s}</span>)}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Border radius + shadows */}
                  <div className="dz-design-card">
                    <div className="dz-design-card-title">🔲 Border Radius</div>
                    <div className="dz-design-tag-list">
                      {analysis.borderRadius.map((r, i) => <span key={i} className="dz-design-tag">{r}</span>)}
                      {analysis.borderRadius.length === 0 && <span style={{ color: '#555', fontSize: 13 }}>None found</span>}
                    </div>
                    {analysis.shadows.length > 0 && (
                      <>
                        <div className="dz-design-card-title" style={{ marginTop: 14 }}>🌑 Shadows</div>
                        <div className="dz-design-tag-list">
                          {analysis.shadows.map((s, i) => <span key={i} className="dz-design-tag">{s.substring(0, 40)}{s.length > 40 ? '…' : ''}</span>)}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Sections */}
                  <div className="dz-design-card">
                    <div className="dz-design-card-title">🧩 Page Sections</div>
                    <div className="dz-design-tag-list">
                      {analysis.sections.map((s, i) => <span key={i} className="dz-design-section-pill">{s}</span>)}
                      {analysis.sections.length === 0 && <span style={{ color: '#555', fontSize: 13 }}>None detected</span>}
                    </div>
                  </div>

                  {/* CSS Variables */}
                  {Object.keys(analysis.cssVariables).length > 0 && (
                    <div className="dz-design-card dz-design-card--full">
                      <div className="dz-design-card-title">⚙️ CSS Variables from Source ({Object.keys(analysis.cssVariables).length})</div>
                      <div className="dz-design-code-block">
                        {Object.entries(analysis.cssVariables).slice(0, 30).map(([k, v]) => `${k}: ${v};`).join('\n')}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {!analysis && !analyzing && !analyzeError && (
              <div className="dz-design-empty">
                <h3>Paste any website URL above</h3>
                <p>We'll extract colors, fonts, spacing, shadows, CSS variables and more</p>
              </div>
            )}
          </div>
        )}

        {/* ── Tokens Tab ──────────────────────────────────────────────── */}
        {activeTab === 'tokens' && (
          <div>
            {!tokens && !analysis && (
              <div className="dz-design-empty">
                <h3>No tokens yet</h3>
                <p>Analyze a website first, then click "Generate Tokens"</p>
              </div>
            )}
            {!tokens && analysis && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <button className="dz-design-analyze-btn" onClick={handleGenerateTokens} disabled={tokensLoading}>
                  {tokensLoading ? <><span className="dz-design-spinner" /> Generating tokens...</> : '⚙️ Generate Design Tokens'}
                </button>
              </div>
            )}
            {tokens && (
              <div>
                <div className="dz-design-token-tabs">
                  {([
                    { id: 'css', label: 'CSS Variables' },
                    { id: 'tailwind', label: 'Tailwind Config' },
                    { id: 'markdown', label: 'DESIGN.md' },
                    { id: 'react', label: 'React Component' },
                  ] as { id: TokenTab; label: string }[]).map(t => (
                    <button
                      key={t.id}
                      className={`dz-design-token-tab ${activeTokenTab === t.id ? 'active' : ''}`}
                      onClick={() => setActiveTokenTab(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {activeTokenTab === 'css' && (
                  <>
                    <div className="dz-design-code-block">{tokens.cssVariables}</div>
                    <CopyBtn text={tokens.cssVariables} />
                  </>
                )}
                {activeTokenTab === 'tailwind' && (
                  <>
                    <div className="dz-design-code-block">{tokens.tailwindConfig}</div>
                    <CopyBtn text={tokens.tailwindConfig} />
                  </>
                )}
                {activeTokenTab === 'markdown' && (
                  <>
                    <div className="dz-design-code-block">{tokens.designMd}</div>
                    <CopyBtn text={tokens.designMd} />
                  </>
                )}
                {activeTokenTab === 'react' && (
                  <>
                    <div className="dz-design-code-block">{tokens.reactComponent}</div>
                    <CopyBtn text={tokens.reactComponent} />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Builder Tab ─────────────────────────────────────────────── */}
        {activeTab === 'builder' && (
          <div className="dz-design-builder">
            {!analysis && (
              <div className="dz-design-error" style={{ borderColor: 'rgba(250,204,21,0.3)', background: 'rgba(250,204,21,0.06)', color: '#fde68a' }}>
                💡 Tip: Analyze a website first to use its design tokens in page generation
              </div>
            )}

            <div className="dz-design-builder-controls">
              <input
                className="dz-design-prompt-input"
                placeholder="Describe the page: e.g. 'SaaS landing page for an AI writing tool with dark theme'"
                value={builderPrompt}
                onChange={e => setBuilderPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleBuildPage()}
              />
              <select className="dz-design-select" value={pageType} onChange={e => setPageType(e.target.value)}>
                <option value="landing">Landing Page</option>
                <option value="dashboard">Dashboard</option>
                <option value="blog">Blog</option>
                <option value="ecommerce">E-Commerce</option>
                <option value="portfolio">Portfolio</option>
                <option value="saas">SaaS App</option>
              </select>
              <select className="dz-design-select" value={pageFormat} onChange={e => setPageFormat(e.target.value)}>
                <option value="react">React JSX</option>
                <option value="html">HTML + Tailwind</option>
              </select>
              <button
                className="dz-design-generate-btn"
                onClick={handleBuildPage}
                disabled={buildLoading}
              >
                {buildLoading ? <><span className="dz-design-spinner" /> Building...</> : '🏗️ Generate'}
              </button>
            </div>

            {buildLoading && (
              <div className="dz-design-loading">
                <span className="dz-design-spinner" />
                AI is generating your page...
              </div>
            )}

            {generatedCode && !buildLoading && (
              <div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
                  <span style={{ color: '#888', fontSize: 13 }}>Generated {pageFormat === 'html' ? 'HTML' : 'React'} · {generatedCode.length} chars</span>
                  {pageFormat === 'html' && (
                    <button
                      className="dz-design-token-tab"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setShowPreview(!showPreview)}
                    >
                      {showPreview ? '🙈 Hide Preview' : '👁️ Live Preview'}
                    </button>
                  )}
                  <CopyBtn text={generatedCode} />
                </div>
                <div className="dz-design-code-block">{generatedCode}</div>
                {showPreview && pageFormat === 'html' && (
                  <div className="dz-design-preview">
                    <iframe
                      title="Page Preview"
                      srcDoc={generatedCode}
                      sandbox="allow-scripts"
                    />
                  </div>
                )}
              </div>
            )}

            {!generatedCode && !buildLoading && (
              <div className="dz-design-empty">
                <h3>Describe your page above</h3>
                <p>The AI will generate a full page using the design tokens from the analyzed website</p>
              </div>
            )}
          </div>
        )}

        {/* ── Memory Tab ──────────────────────────────────────────────── */}
        {activeTab === 'memory' && (
          <div>
            {memoryLoading && (
              <div className="dz-design-loading">
                <span className="dz-design-spinner" /> Loading design history...
              </div>
            )}
            {!memoryLoading && memory.length === 0 && (
              <div className="dz-design-empty">
                <h3>No saved designs yet</h3>
                <p>Every website you analyze is automatically saved here</p>
              </div>
            )}
            {!memoryLoading && memory.length > 0 && (
              <div className="dz-design-memory-grid">
                {memory.map(entry => (
                  <div key={entry.id} className="dz-design-memory-card" onClick={() => loadFromMemory(entry)}>
                    <div className="dz-design-memory-title">{entry.title || 'Untitled'}</div>
                    <div className="dz-design-memory-url">{entry.url}</div>
                    <div className="dz-design-memory-meta">
                      {entry.primaryColor && (
                        <div className="dz-design-memory-color" style={{ background: entry.primaryColor }} />
                      )}
                      <span className="dz-design-memory-style">{entry.uiStyle}</span>
                      <button
                        className="dz-design-memory-delete"
                        onClick={e => { e.stopPropagation(); deleteMemory(entry.id) }}
                        title="Delete"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
