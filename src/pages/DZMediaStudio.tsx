import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/dz-media-studio.css'

interface ModelDef {
  id: string; label: string; badge?: string; tier: 'fast' | 'premium'; group: string; waitSecs?: number | null; desc?: string
}
interface QuotaInfo {
  fast:    { remaining: number; used: number; limit: number }
  premium: { remaining: number; used: number; limit: number }
  resetInHours: number
}
interface AspectPreset {
  label: string; sub: string; w: number; h: number; shape: 'tall'|'square'|'wide'|'photo'
}
interface ImageResult {
  type: 'image'
  url: string; prompt: string; model: string; provider: string
  translatedPrompt?: string
}

const IMG_PRESETS: AspectPreset[] = [
  { label: 'عمودي',  sub: '9:16', w: 576,  h: 1024, shape: 'tall'   },
  { label: 'مربع',   sub: '1:1',  w: 768,  h: 768,  shape: 'square' },
  { label: 'أفقي',   sub: '16:9', w: 1024, h: 576,  shape: 'wide'   },
  { label: 'كلاسيك', sub: '4:3',  w: 1024, h: 768,  shape: 'photo'  },
]

const DEFAULT_MODELS: ModelDef[] = [
  { id: 'auto',           label: '⚡ DZ Image (سريع)',               badge: 'مجاني', tier: 'fast',   group: 'DZ MEDIA',     waitSecs: 12,  desc: 'توليد سريع ~12 ثانية — مجاني دائماً' },
  { id: 'imgcreator',     label: '🍌 Nano Banana 2',                 badge: 'مجاني', tier: 'fast',   group: 'DZ MEDIA PRO', waitSecs: 15,  desc: 'Gemini 2.0 Flash Image — مجاني تماماً' },
  { id: 'imgcreator-gpt', label: '🖼️ GPT Image 2',                  badge: 'مجاني', tier: 'fast',   group: 'DZ MEDIA PRO', waitSecs: 15,  desc: 'GPT-4o Image — مجاني تماماً' },
  { id: 'horde',          label: '🌐 Stable Horde (جودة عالية)',     badge: 'مجاني', tier: 'fast',   group: 'DZ MEDIA',     waitSecs: 90,  desc: 'شبكة GPU مجتمعية — جودة فائقة — ~60-120 ث' },
]

const TIER_COLOR: Record<string, string> = {
  premium: 'linear-gradient(135deg,#f59e0b,#d97706)',
  fast:    'linear-gradient(135deg,#6366f1,#818cf8)',
}

export default function DZMediaStudio() {
  const navigate = useNavigate()
  const [prompt, setPrompt]             = useState('')
  const [model, setModel]               = useState('auto')
  const [models, setModels]   = useState<ModelDef[]>(DEFAULT_MODELS)
  const [width, setWidth]     = useState(768)
  const [height, setHeight]   = useState(768)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<ImageResult | null>(null)
  const [error, setError]     = useState('')
  const [progress, setProgress] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const timerRef              = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── عداد الوقت أثناء التوليد ──────────────────────────────────────────────
  useEffect(() => {
    if (loading) {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  }, [loading])

  useEffect(() => {
    fetch('/api/chatimg/models')
      .then(r => r.json())
      .then(d => { if (d.models?.length) setModels(d.models) })
      .catch(() => {})
  }, [])

  const selectedModel = models.find(m => m.id === model) || models[0]

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { setError('الرجاء كتابة وصف'); return }
    setLoading(true); setError('')

    const mDef    = DEFAULT_MODELS.find(m => m.id === model) || DEFAULT_MODELS[0]
    const waitSec = mDef.waitSecs ?? 12
    setProgress(`🎨 جاري التوليد بـ ${mDef.label} (~${waitSec} ثانية)...`)

    try {
      const res  = await fetch('/api/chatimg/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model, width, height }),
        signal: AbortSignal.timeout(model === 'horde' ? 175_000 : 75_000),
      })
      const data = await res.json() as {
        ok: boolean; url?: string; promptUsed?: string; model?: string; provider?: string
        error?: string; translated?: boolean; remainingCredits?: number | null
      }
      if (data.ok && data.url) {
        setResult({
          type: 'image', url: data.url,
          prompt: data.promptUsed || prompt,
          model:    maskedModel(data.model || model),
          provider: maskedProvider(data.provider || ''),
          translatedPrompt: data.translated ? data.promptUsed : undefined,
        })
      }
    } catch { /* timeout */ }
    setLoading(false); setProgress('')
  }, [prompt, model, width, height])

  return (
    <div className="dms-root" dir="rtl">
      <header className="dms-header">
        <button className="dms-back-btn" onClick={() => navigate('/')}>← الرئيسية</button>
        <div className="dms-header-title">
          <span className="dms-header-icon">🎨</span>
          <h1>DZ Media Studio</h1>
          <span className="dms-badge">AI</span>
        </div>
        <p className="dms-header-sub">
          توليد الصور بالذكاء الاصطناعي — DZ MEDIA PRO · DZ MEDIA · DZ MEDIA BASIC
        </p>
      </header>


      <div className="dms-body">

        {/* ══════ لوحة الإدخال ══════ */}
        <div className="dms-panel">
          <p className="dms-tab-desc">
            <span style={{ color: '#c8ff00' }}>🎨</span> اكتب وصفاً وسيولّد الذكاء الاصطناعي صورة احترافية
          </p>

          <div className="dms-prompt-wrap">
            <label className="dms-label">✏️ وصف المشهد</label>
            <textarea
              className="dms-textarea"
              rows={3}
              placeholder="مثال: قصبة الجزائر عند الغروب، فوتوريالستيك، 8K"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }}
            />
          </div>

          {/* اختيار النموذج */}
          <div className="dms-section">
            <label className="dms-label">🧠 النموذج</label>
            <div className="dms-model-grid">
              {models.map(m => (
                <button
                  key={m.id}
                  title={m.desc || m.label}
                  className={`dms-model-card${model === m.id ? ' dms-model-card--active' : ''} dms-model-card--${m.tier}`}
                  onClick={() => setModel(m.id)}
                >
                  <span className="dms-model-label">{m.label}</span>
                  <div className="dms-model-badges">
                    {m.badge && <span className="dms-model-badge dms-model-badge--tag">{m.badge}</span>}
                    {m.waitSecs && (
                      <span className="dms-model-badge" style={{ background: '#0f2830', color: '#4ade80', fontSize: '9px', padding: '1px 4px' }}>
                        ~{m.waitSecs}ث
                      </span>
                    )}
                    <span className="dms-model-badge dms-model-badge--tier" style={{ background: TIER_COLOR[m.tier] || TIER_COLOR.fast }}>
                      ⚡
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {selectedModel?.id === 'horde' && (
              <div className="dms-premium-note" style={{ borderColor: '#1d4ed8', color: '#93c5fd' }}>
                🌐 Stable Horde — شبكة GPU مجتمعية مجانية بلا حدود — بدون أي مفتاح API — ~60-120 ثانية
              </div>
            )}
            {(selectedModel?.id === 'imgcreator' || selectedModel?.id === 'imgcreator-gpt') && (
              <div className="dms-premium-note" style={{ borderColor: '#134e2a', color: '#86efac' }}>
                🎁 {selectedModel.label} — مجاني تماماً بدون مفتاح API — ~15 ثانية
              </div>
            )}
          </div>

          {/* مقياس الإطار */}
          <div className="dms-section">
            <label className="dms-label">📐 مقياس الإطار</label>
            <div className="dms-aspect-row">
              {IMG_PRESETS.map(p => {
                const active = width === p.w && height === p.h
                return (
                  <button
                    key={p.shape}
                    className={`dms-aspect-btn${active ? ' dms-aspect-btn--active' : ''}`}
                    onClick={() => { setWidth(p.w); setHeight(p.h) }}
                    title={`${p.w}×${p.h}`}
                  >
                    <span className={`dms-aspect-frame dms-aspect-frame--${p.shape}`} />
                    <span className="dms-aspect-label">{p.label}</span>
                    <span className="dms-aspect-sub">{p.sub}</span>
                  </button>
                )
              })}
            </div>
            <p className="dms-dim-hint">{width}×{height} px</p>
          </div>

          {error   && <div className="dms-error">⚠️ {error}</div>}
          {loading && (
            <div className="dms-progress">
              <span>{progress || '⏳ جاري العمل...'}</span>
              <span className="dms-elapsed-badge">{elapsed}ث</span>
            </div>
          )}

          <button className="dms-generate-btn" onClick={handleGenerate} disabled={loading}
            style={{ background: loading ? undefined : 'linear-gradient(135deg, #c8ff00, #a3cc00)' }}>
            {loading
              ? <><span className="dms-spinner" /> {progress || 'جاري...'} <span className="dms-elapsed-inline">{elapsed}ث</span></>
              : <>🎨 ولّد الصورة</>
            }
          </button>
          <p className="dms-hint">Ctrl+Enter للتوليد السريع</p>
        </div>

        {/* ══════ لوحة النتيجة ══════ */}
        <div className="dms-result-panel dms-result-panel--text2img">

          {!result && !loading && (
            <div className="dms-empty-state">
              <div className="dms-empty-icon" style={{ color: '#c8ff00' }}>🎨</div>
              <p className="dms-empty-title" style={{ color: '#c8ff00' }}>الصورة ستظهر هنا</p>
              <p className="dms-empty-sub">اكتب وصفاً واختر نموذجاً وانقر "ولّد الصورة"</p>
            </div>
          )}

          {loading && (
            <div className="dms-loading-anim">
              <div className="dms-loading-ring" style={{ borderTopColor: '#c8ff00' }} />
              <p className="dms-loading-text">{progress || '⏳ جاري التوليد...'}</p>
              <div className="dms-loading-timer">
                <span className="dms-timer-count">{elapsed}</span>
                <span className="dms-timer-unit">ثانية</span>
                {elapsed >= 10 && <span className="dms-timer-hint"> — يُرجى الانتظار…</span>}
                {elapsed >= 40 && <span className="dms-timer-hint" style={{color:'#fbbf24'}}> — يجرّب نموذجاً بديلاً…</span>}
              </div>
              <p className="dms-loading-sub">قد يستغرق 10–90 ثانية حسب النموذج</p>
            </div>
          )}

          {result && (
            <div className="dms-result-card">
              <div className="dms-result-img-wrap">
                <img
                  src={result.url} alt={result.prompt}
                  className="dms-result-img" loading="eager"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
                />
              </div>

              <div className="dms-result-meta">
                <span className="dms-result-model" style={{ color: '#c8ff00' }}>✨ {result.model}</span>
                <span className="dms-result-sep">·</span>
                <span className="dms-result-provider">{result.provider}</span>
              </div>

              {result.translatedPrompt && (
                <div className="dms-translated-box">
                  <span className="dms-translated-title">🔤 تُرجم تلقائياً:</span>
                  <span className="dms-translated-text" dir="ltr">"{result.translatedPrompt}"</span>
                </div>
              )}

              <div className="dms-result-actions">
                <a href={result.url} download={`dz-media-${Date.now()}.png`}
                  target="_blank" rel="noopener noreferrer" className="dms-action-btn dms-action-btn--dl">
                  ⬇ تحميل
                </a>
                <button className="dms-action-btn" onClick={handleGenerate} disabled={loading}>🔄 جديد</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="dms-footer">
        <span className="dms-footer-text">DZ MEDIA STUDIO 2026 — PRO · BASIC · AI</span>
        <span className="dms-footer-flag"> 🇩🇿</span>
      </footer>
    </div>
  )
}

function maskedProvider(raw: string): string {
  const r = raw.toLowerCase()
  if (r.includes('pro') || r.includes('gemini') || r.includes('openai') || r.includes('openrouter') || r.includes('gpt')) return 'DZ MEDIA PRO'
  if (r.includes('basic') || r.includes('pollinations')) return 'DZ MEDIA BASIC'
  return 'DZ MEDIA'
}
function maskedModel(raw: string): string {
  if (!raw) return 'DZ MEDIA'
  if (raw.toLowerCase().startsWith('dz media')) return raw
  const r = raw.toLowerCase()
  if (r.includes('gemini') || r.includes('nano') || r.includes('banana')) return 'DZ MEDIA PRO Nano'
  if (r.includes('gpt') || r.includes('openai') || r.includes('vision'))  return 'DZ MEDIA PRO Vision'
  if (r.includes('pollinations') || r.includes('basic'))                  return 'DZ MEDIA BASIC'
  if (r.includes('flux') || r.includes('hugging') || r.includes('stable') || r.includes('realvis')) return 'DZ MEDIA FLUX'
  return 'DZ MEDIA'
}
