import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/dz-media-studio.css'

// ── Interfaces ───────────────────────────────────────────────────────────────
interface ModelDef {
  id: string; label: string; badge?: string; tier: 'fast' | 'premium'
  group: string; waitSecs?: number | null; desc?: string
}
interface AspectPreset {
  label: string; sub: string; w: number; h: number; shape: 'tall'|'square'|'wide'|'photo'
}
interface ImageResult {
  type: 'image'; url: string; prompt: string; model: string; provider: string
  translatedPrompt?: string
}
interface SearchImage {
  url: string; fullUrl?: string; title: string
  source: string; sourceUrl: string
  width?: number; height?: number; license?: string; creator?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────
const IMG_PRESETS: AspectPreset[] = [
  { label: 'عمودي',  sub: '9:16', w: 576,  h: 1024, shape: 'tall'   },
  { label: 'مربع',   sub: '1:1',  w: 768,  h: 768,  shape: 'square' },
  { label: 'أفقي',   sub: '16:9', w: 1024, h: 576,  shape: 'wide'   },
  { label: 'كلاسيك', sub: '4:3',  w: 1024, h: 768,  shape: 'photo'  },
]

const DEFAULT_MODELS: ModelDef[] = [
  { id: 'auto',         label: '⚡ DZ Image (FLUX)',    badge: 'مجاني', tier: 'fast',    group: 'DZ MEDIA',        waitSecs: 10, desc: 'FLUX.1 — توليد سريع ~10 ثانية مجاني دائماً'            },
  { id: 'turbo',        label: '🚀 Turbo',               badge: 'مجاني', tier: 'fast',    group: 'DZ MEDIA',        waitSecs: 5,  desc: 'SDXL Turbo — أسرع نموذج ~5 ثانية'                      },
  { id: 'flux-realism', label: '📷 FLUX Realism',        badge: 'مجاني', tier: 'fast',    group: 'DZ MEDIA',        waitSecs: 15, desc: 'صور واقعية فوتوريالستيك — مجاني تماماً'                },
  { id: 'flux-anime',   label: '🌸 FLUX Anime',          badge: 'مجاني', tier: 'fast',    group: 'DZ MEDIA',        waitSecs: 15, desc: 'رسوم أنيمي واحترافية — مجاني تماماً'                   },
  { id: 'flux-3d',      label: '🧊 FLUX 3D',             badge: 'مجاني', tier: 'fast',    group: 'DZ MEDIA',        waitSecs: 15, desc: 'تصيير ثلاثي الأبعاد — مجاني تماماً'                    },
  { id: 'flux-cablyai', label: '🎭 FLUX CablyAI',        badge: 'مجاني', tier: 'fast',    group: 'DZ MEDIA',        waitSecs: 15, desc: 'فوتوريالستيك احترافي بجودة استوديو'                    },
  { id: 'playground',   label: '🎮 Playground v2',        badge: 'مجاني', tier: 'fast',    group: 'DZ MEDIA',        waitSecs: 15, desc: 'نموذج جمالي فائق الجودة — مجاني'                       },
  { id: 'horde',        label: '🌐 Stable Horde (HD)',   badge: 'مجاني', tier: 'fast',    group: 'DZ MEDIA HD',     waitSecs: 90, desc: 'شبكة GPU مجتمعية — جودة عالية جداً ~60-120 ث'          },
  { id: 'perchance',    label: '🎲 Perchance AI',         badge: 'جديد',  tier: 'fast',    group: 'مزودون خارجيون', waitSecs: 20, desc: 'Perchance AI Generator — مجاني بدون مفتاح'              },
  { id: 'raphael',      label: '🖌️ Raphael AI',          badge: 'جديد',  tier: 'fast',    group: 'مزودون خارجيون', waitSecs: 25, desc: 'Raphael AI — FLUX مجاني عالي الجودة'                    },
  { id: 'freeforai',    label: '🆓 FreeForAI',            badge: 'جديد',  tier: 'fast',    group: 'مزودون خارجيون', waitSecs: 30, desc: 'FreeForAI — متعدد النماذج مجاناً'                      },
]

const EXTERNAL_PROVIDERS = new Set(['perchance', 'raphael', 'freeforai'])
const TIER_COLOR: Record<string, string> = {
  premium: 'linear-gradient(135deg,#f59e0b,#d97706)',
  fast:    'linear-gradient(135deg,#6366f1,#818cf8)',
}

const PRO_FILTERS = [
  'Portrait', 'Landscape', 'Anime', 'Realistic', 'Painting',
  'Fantasy', 'Sci-Fi', 'Architecture', 'Logo', 'Character Design',
  'Vehicle', 'Nature', 'Algeria', 'Historical', 'Islamic Art', 'Minimal',
]

const PRO_EXAMPLES = [
  'مسجد جزائري مستقبلي', 'Algiers Cyberpunk city',
  'محارب نوميدي', 'صحراء الجزائر غروب',
  'قسنطينة ليلاً', 'سيارة مستقبلية',
]

export default function DZMediaStudio() {
  const navigate = useNavigate()

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'generate' | 'search'>('generate')

  // ── Generate states ────────────────────────────────────────────────────────
  const [prompt, setPrompt]             = useState('')
  const [model, setModel]               = useState('auto')
  const [models, setModels]             = useState<ModelDef[]>(DEFAULT_MODELS)
  const [width, setWidth]               = useState(768)
  const [height, setHeight]             = useState(768)
  const [loading, setLoading]           = useState(false)
  const [enhancing, setEnhancing]       = useState(false)
  const [imgLoading, setImgLoading]     = useState(false)
  const [result, setResult]             = useState<ImageResult | null>(null)
  const [error, setError]               = useState('')
  const [progress, setProgress]         = useState('')
  const [elapsed, setElapsed]           = useState(0)
  const [enhancedHint, setEnhancedHint] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Search (AI DZ img PRO) states ─────────────────────────────────────────
  const [searchPrompt, setSearchPrompt]   = useState('')
  const [searchResults, setSearchResults] = useState<SearchImage[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchPage, setSearchPage]       = useState(0)
  const [hasMore, setHasMore]             = useState(false)
  const [searchFilter, setSearchFilter]   = useState('')
  const [searchStatus, setSearchStatus]   = useState('')
  const [searchError, setSearchError]     = useState('')
  const [searchDone, setSearchDone]       = useState(false)
  const [copiedUrl, setCopiedUrl]         = useState('')
  const sentinelRef  = useRef<HTMLDivElement>(null)
  const searchDoneRef = useRef(false)

  // ── Generate timer ────────────────────────────────────────────────────────
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

  // ── Generate handlers ─────────────────────────────────────────────────────
  const handleEnhance = useCallback(async () => {
    if (!prompt.trim()) { setError('الرجاء كتابة وصف أولاً'); return }
    setEnhancing(true); setError(''); setEnhancedHint('')
    try {
      const ac = new AbortController()
      const tid = setTimeout(() => ac.abort(), 22_000)
      const res = await fetch('/api/chatimg/enhance-prompt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }), signal: ac.signal,
      })
      clearTimeout(tid)
      const data = await res.json() as { ok: boolean; enhanced?: string; fallback?: boolean; error?: string }
      if (data.ok && data.enhanced) {
        setPrompt(data.enhanced)
        setEnhancedHint(data.fallback ? '✅ تم تحسين البرومبت (قاعدة محلية)' : '✨ تم تحسين البرومبت بالذكاء الاصطناعي!')
        setTimeout(() => setEnhancedHint(''), 5000)
      } else {
        setError(data.error || 'فشل التحسين — حاول مرة أخرى')
      }
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      setError(isAbort ? 'انتهت مهلة التحسين' : 'فشل الاتصال بخادم التحسين')
    }
    setEnhancing(false)
  }, [prompt])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { setError('الرجاء كتابة وصف'); return }
    setLoading(true); setError(''); setResult(null)

    const mDef    = DEFAULT_MODELS.find(m => m.id === model) || DEFAULT_MODELS[0]
    const waitSec = mDef.waitSecs ?? 12
    setProgress(`🎨 جاري التوليد بـ ${mDef.label} (~${waitSec} ثانية)...`)

    const isExternal = EXTERNAL_PROVIDERS.has(model)
    const endpoint   = isExternal ? '/api/dz-media/providers/generate' : '/api/chatimg/generate'
    const body       = isExternal
      ? JSON.stringify({ prompt, width, height, provider: model })
      : JSON.stringify({ prompt, model, width, height })

    const timeoutMs = model === 'horde' ? 175_000 : isExternal ? 80_000 : 65_000
    const ac = new AbortController()
    const timeoutId = setTimeout(() => ac.abort(), timeoutMs)

    try {
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body, signal: ac.signal,
      })
      clearTimeout(timeoutId)
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        if (res.status === 451) throw new Error('المحتوى محظور — الرجاء تعديل الوصف')
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`)
      }
      const data = await res.json() as {
        ok: boolean; url?: string; promptUsed?: string; englishPrompt?: string
        model?: string; provider?: string; error?: string; translated?: boolean
        generationTime?: number; cached?: boolean
      }
      if (data.ok && data.url) {
        setImgLoading(true)
        const displayProvider = isExternal ? (data.provider || mDef.label) : maskedProvider(data.provider || '')
        const displayModel    = isExternal ? (data.model    || mDef.label) : maskedModel(data.model || model)
        const usedPrompt      = data.promptUsed || data.englishPrompt || prompt
        setResult({ type: 'image', url: data.url, prompt: usedPrompt, model: displayModel, provider: displayProvider, translatedPrompt: data.translated ? usedPrompt : undefined })
      } else {
        setError(data.error || 'فشل التوليد — حاول مجدداً أو جرّب نموذجاً آخر')
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const isAbort = err instanceof Error && err.name === 'AbortError'
      setError(isAbort ? 'انتهت مهلة الطلب — جرّب نموذجاً أسرع كـ Turbo'
        : `فشل الاتصال بالخادم — ${err instanceof Error ? err.message.slice(0, 80) : 'خطأ غير معروف'}`)
    }
    setLoading(false); setProgress('')
  }, [prompt, model, width, height])

  // ── Search handlers ───────────────────────────────────────────────────────
  const handleSearch = useCallback(async (pg = 0, filterOverride?: string) => {
    const q   = searchPrompt.trim()
    const flt = filterOverride !== undefined ? filterOverride : searchFilter
    if (!q) { setSearchError('الرجاء كتابة وصف للبحث'); return }

    setSearchLoading(true); setSearchError('')
    if (pg === 0) {
      setSearchResults([]); setSearchDone(false)
      setSearchStatus('🔍 AI DZ img PRO يبحث عن أفضل صور AI...')
    } else {
      setSearchStatus('⏳ جاري تحميل المزيد...')
    }

    try {
      const res = await fetch('/api/dz-media/ai-img-pro/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: q, page: pg, filter: flt }),
      })
      const data = await res.json() as {
        ok: boolean; images?: SearchImage[]; total?: number; page?: number; hasMore?: boolean; error?: string
      }
      if (!data.ok) throw new Error(data.error || 'فشل البحث')

      const imgs = data.images || []
      setSearchResults(prev => pg === 0 ? imgs : [...prev, ...imgs])
      setHasMore(data.hasMore || false)
      setSearchPage(pg)
      setSearchDone(true)
      searchDoneRef.current = true
      setSearchStatus(imgs.length > 0
        ? '✅ تم العثور على أفضل النتائج المطابقة لوصفك.'
        : '⚠️ لم يتم العثور على نتائج — جرّب وصفاً مختلفاً')
    } catch (e) {
      setSearchError(`فشل البحث — ${e instanceof Error ? e.message : 'خطأ غير معروف'}`)
      setSearchStatus('')
    }
    setSearchLoading(false)
  }, [searchPrompt, searchFilter])

  // إعادة البحث عند تغيير الفلتر (بعد أول بحث)
  useEffect(() => {
    if (searchDoneRef.current && searchPrompt.trim()) {
      handleSearch(0, searchFilter)
    }
  }, [searchFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !searchLoading) {
        handleSearch(searchPage + 1)
      }
    }, { threshold: 0.1 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, searchLoading, searchPage, handleSearch])

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl(''), 2000)
    } catch { /* ignored */ }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="dms-root" dir="rtl">

      {/* ── Header ── */}
      <header className="dms-header">
        <button className="dms-back-btn" onClick={() => navigate('/')}>← الرئيسية</button>
        <div className="dms-header-title">
          <span className="dms-header-icon">🎨</span>
          <h1>DZ Media Studio</h1>
          <span className="dms-badge">AI</span>
        </div>
        <p className="dms-header-sub">توليد الصور بالذكاء الاصطناعي</p>
      </header>

      {/* ── Mode Tabs ── */}
      <div className="dms-tabs">
        <button className={`dms-tab${mode === 'generate' ? ' dms-tab--active' : ''}`} onClick={() => setMode('generate')}>
          <span className="dms-tab-icon">🎨</span>
          توليد الصور
        </button>
        <button className={`dms-tab${mode === 'search' ? ' dms-tab--active' : ''}`} onClick={() => setMode('search')}>
          <span className="dms-tab-icon">🔍</span>
          AI DZ img PRO
          <span className="dms-pro-new-badge">جديد</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════
          GENERATE MODE
      ══════════════════════════════════════════════════════ */}
      {mode === 'generate' && (
        <div className="dms-body">

          {/* لوحة الإدخال */}
          <div className="dms-panel">
            <p className="dms-tab-desc">
              <span style={{ color: '#c8ff00' }}>🎨</span> اكتب وصفاً وسيولّد الذكاء الاصطناعي صورة احترافية
            </p>

            <div className="dms-prompt-wrap">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label className="dms-label" style={{ margin: 0 }}>✏️ وصف المشهد</label>
                <button
                  onClick={handleEnhance}
                  disabled={enhancing || loading || !prompt.trim()}
                  title="يُحوّل وصفك القصير إلى برومبت احترافي مفصّل"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: enhancing ? '#1a2a1a' : 'linear-gradient(135deg,#c8ff00,#a3cc00)',
                    color: enhancing ? '#c8ff00' : '#0a1a0a',
                    border: 'none', borderRadius: 8, padding: '4px 10px',
                    fontSize: 12, fontWeight: 700, cursor: enhancing ? 'wait' : 'pointer',
                    opacity: (!prompt.trim() || loading) ? 0.5 : 1, transition: 'all 0.2s',
                  }}
                >
                  {enhancing ? <><span className="dms-spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> جاري التحسين…</> : <>✨ تحسين</>}
                </button>
              </div>
              <textarea
                className="dms-textarea" rows={3}
                placeholder="مثال: قصبة الجزائر عند الغروب — اكتب بالعربية أو الإنجليزية"
                value={prompt}
                onChange={e => { setPrompt(e.target.value); setEnhancedHint('') }}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }}
              />
              {enhancedHint && (
                <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8, background: '#0f2b0f', border: '1px solid #2d6a2d', color: '#86efac', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {enhancedHint}
                </div>
              )}
            </div>

            {/* النموذج */}
            <div className="dms-section">
              <label className="dms-label">🧠 النموذج</label>
              <div className="dms-model-grid">
                {models.map(m => (
                  <button
                    key={m.id} title={m.desc || m.label}
                    className={`dms-model-card${model === m.id ? ' dms-model-card--active' : ''} dms-model-card--${m.tier}`}
                    onClick={() => setModel(m.id)}
                  >
                    <span className="dms-model-label">{m.label}</span>
                    <div className="dms-model-badges">
                      {m.badge && <span className="dms-model-badge dms-model-badge--tag">{m.badge}</span>}
                      {m.waitSecs && <span className="dms-model-badge" style={{ background: '#0f2830', color: '#4ade80', fontSize: '9px', padding: '1px 4px' }}>~{m.waitSecs}ث</span>}
                      <span className="dms-model-badge dms-model-badge--tier" style={{ background: TIER_COLOR[m.tier] || TIER_COLOR.fast }}>⚡</span>
                    </div>
                  </button>
                ))}
              </div>
              {selectedModel?.id === 'horde' && (
                <div className="dms-premium-note" style={{ borderColor: '#1d4ed8', color: '#93c5fd' }}>
                  🌐 Stable Horde — شبكة GPU مجتمعية مجانية — جودة عالية جداً — ~60-120 ثانية
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
                    <button key={p.shape}
                      className={`dms-aspect-btn${active ? ' dms-aspect-btn--active' : ''}`}
                      onClick={() => { setWidth(p.w); setHeight(p.h) }} title={`${p.w}×${p.h}`}
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

            {error && <div className="dms-error">⚠️ {error}</div>}
            {loading && (
              <div className="dms-progress">
                <span>{progress || '⏳ جاري العمل...'}</span>
                <span className="dms-elapsed-badge">{elapsed}ث</span>
              </div>
            )}

            <button className="dms-generate-btn" onClick={handleGenerate} disabled={loading}
              style={{ background: loading ? undefined : 'linear-gradient(135deg, #c8ff00, #a3cc00)' }}>
              {loading ? <><span className="dms-spinner" /> {progress || 'جاري...'} <span className="dms-elapsed-inline">{elapsed}ث</span></> : <>🎨 ولّد الصورة</>}
            </button>
            <p className="dms-hint">Ctrl+Enter للتوليد السريع</p>
          </div>

          {/* لوحة النتيجة */}
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
                  {elapsed >= 40 && <span className="dms-timer-hint" style={{ color: '#fbbf24' }}> — يجرّب نموذجاً بديلاً…</span>}
                </div>
                <p className="dms-loading-sub">قد يستغرق 10–90 ثانية حسب النموذج</p>
              </div>
            )}
            {result && (
              <div className="dms-result-card">
                <div className="dms-result-img-wrap" style={{ position: 'relative' }}>
                  {imgLoading && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', zIndex: 2, borderRadius: '8px' }}>
                      <div className="dms-loading-ring" style={{ borderTopColor: '#c8ff00', width: 40, height: 40, marginBottom: 10 }} />
                      <span style={{ color: '#c8ff00', fontSize: 13 }}>جاري تحميل الصورة…</span>
                    </div>
                  )}
                  <img src={result.url} alt={result.prompt} className="dms-result-img" loading="eager"
                    onLoad={() => setImgLoading(false)}
                    onError={e => { setImgLoading(false); setError('تعذّر تحميل الصورة — حاول مرة أخرى.'); (e.target as HTMLImageElement).style.display = 'none' }}
                    style={{ opacity: imgLoading ? 0 : 1, transition: 'opacity 0.4s' }}
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
                  <a href={result.url} download={`dz-media-${Date.now()}.png`} target="_blank" rel="noopener noreferrer" className="dms-action-btn dms-action-btn--dl">⬇ تحميل</a>
                  <button className="dms-action-btn" onClick={handleGenerate} disabled={loading || imgLoading}>🔄 جديد</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SEARCH MODE — AI DZ img PRO
      ══════════════════════════════════════════════════════ */}
      {mode === 'search' && (
        <div className="dms-pro-root">

          {/* Search bar */}
          <div className="dms-pro-searchbar">
            <div className="dms-pro-logo">
              <span className="dms-pro-logo-icon">🔍</span>
              <span className="dms-pro-logo-text">AI DZ img PRO</span>
              <span className="dms-pro-logo-sub">بحث ذكي عن صور AI في Pinterest</span>
            </div>
            <div className="dms-pro-input-row">
              <textarea
                className="dms-pro-input"
                rows={2}
                placeholder="اكتب وصف الصورة... مثال: مدينة الجزائر Cyberpunk، محارب نوميدي، مسجد مستقبلي"
                value={searchPrompt}
                onChange={e => setSearchPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch(0) } }}
              />
              <button className="dms-pro-search-btn" onClick={() => handleSearch(0)} disabled={searchLoading}>
                {searchLoading && searchPage === 0 ? <span className="dms-spinner" /> : '🔍 بحث'}
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="dms-pro-filters">
            <button className={`dms-pro-filter${searchFilter === '' ? ' dms-pro-filter--active' : ''}`} onClick={() => setSearchFilter('')}>
              🌐 الكل
            </button>
            {PRO_FILTERS.map(f => (
              <button key={f} className={`dms-pro-filter${searchFilter === f ? ' dms-pro-filter--active' : ''}`} onClick={() => setSearchFilter(f)}>
                {f}
              </button>
            ))}
          </div>

          {/* Status bar */}
          {(searchStatus || searchLoading) && !searchError && (
            <div className={`dms-pro-status${searchLoading ? ' dms-pro-status--busy' : ''}`}>
              {searchLoading && <span className="dms-spinner dms-spinner--xs" />}
              <span>{searchStatus}</span>
            </div>
          )}
          {searchError && <div className="dms-pro-error-bar">⚠️ {searchError}</div>}

          {/* Empty / Welcome state */}
          {!searchResults.length && !searchLoading && !searchDone && (
            <div className="dms-pro-welcome">
              <div className="dms-pro-welcome-icon">🎨</div>
              <p className="dms-pro-welcome-title">ابحث عن أفضل صور الذكاء الاصطناعي</p>
              <p className="dms-pro-welcome-sub">يبحث AI DZ img PRO داخل Pinterest ويجمع أجود الصور لك تلقائياً</p>
              <div className="dms-pro-examples">
                {PRO_EXAMPLES.map(ex => (
                  <button key={ex} className="dms-pro-example" onClick={() => { setSearchPrompt(ex); handleSearch(0) }}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No results */}
          {searchDone && !searchLoading && searchResults.length === 0 && !searchError && (
            <div className="dms-pro-welcome">
              <div className="dms-pro-welcome-icon">😕</div>
              <p className="dms-pro-welcome-title">لم يتم العثور على نتائج</p>
              <p className="dms-pro-welcome-sub">جرّب وصفاً مختلفاً أو أزل الفلتر المحدد</p>
            </div>
          )}

          {/* Results grid */}
          {searchResults.length > 0 && (
            <>
              <div className="dms-pro-count">
                🖼️ {searchResults.length} صورة{hasMore ? '+' : ''} — {searchPrompt}
              </div>
              <div className="dms-pro-grid">
                {searchResults.map((img, i) => (
                  <div key={`${img.url}-${i}`} className="dms-pro-card">
                    <div className="dms-pro-card-img-wrap">
                      <img
                        src={img.url}
                        alt={img.title}
                        className="dms-pro-card-img"
                        loading="lazy"
                        onError={e => {
                          const el = e.target as HTMLImageElement
                          el.src = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='%23111827'/><text x='100' y='105' text-anchor='middle' fill='%23374151' font-size='13' font-family='sans-serif'>No image</text></svg>`
                        }}
                      />
                      <div className="dms-pro-card-overlay">
                        <div className="dms-pro-card-actions">
                          <a href={img.sourceUrl} target="_blank" rel="noopener noreferrer" className="dms-pro-card-btn" title="فتح في Pinterest">📌</a>
                          <a href={img.url} target="_blank" rel="noopener noreferrer" className="dms-pro-card-btn" title="فتح الصورة">⬇</a>
                          <button className="dms-pro-card-btn" title="نسخ الرابط" onClick={() => handleCopy(img.url)}>
                            {copiedUrl === img.url ? '✅' : '🔗'}
                          </button>
                          <button className="dms-pro-card-btn" title="مشاركة" onClick={() => {
                            if (navigator.share) navigator.share({ title: img.title, url: img.url }).catch(() => {})
                            else handleCopy(img.url)
                          }}>↗</button>
                        </div>
                      </div>
                    </div>
                    <div className="dms-pro-card-info">
                      <p className="dms-pro-card-title" title={img.title}>{img.title.slice(0, 55)}{img.title.length > 55 ? '…' : ''}</p>
                      <span className="dms-pro-card-src">📌 Pinterest</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="dms-pro-sentinel">
            {searchLoading && searchPage > 0 && (
              <div className="dms-pro-loadmore">
                <span className="dms-spinner" />
                <span>جاري تحميل المزيد...</span>
              </div>
            )}
            {!hasMore && searchDone && searchResults.length > 0 && (
              <div className="dms-pro-end">✅ تم عرض جميع النتائج ({searchResults.length} صورة)</div>
            )}
          </div>
        </div>
      )}

      <footer className="dms-footer">
        <span className="dms-footer-text">DZ MEDIA STUDIO 2026</span>
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
