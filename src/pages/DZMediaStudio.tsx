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
  { id: 'auto',           label: '🤖 Auto (أسرع مزود)',              badge: 'AUTO',  tier: 'fast',    group: 'DZ MEDIA',       waitSecs: 2,   desc: 'يختار تلقائياً أسرع مزود متاح' },
  { id: 'imgcreator',     label: '🍌 Nano Banana 2 (ImgCreator)',    badge: 'FREE',  tier: 'fast',    group: 'DZ MEDIA PRO',   waitSecs: 60,  desc: 'Gemini backend — مجاني + Horde fallback' },
  { id: 'imgcreator-gpt', label: '🖼️ GPT Image 2 (ImgCreator)',     badge: 'FREE',  tier: 'fast',    group: 'DZ MEDIA PRO',   waitSecs: 60,  desc: 'GPT-4o backend — مجاني + Horde fallback' },
  { id: 'horde',          label: '🌐 Stable Horde (لا نهاية)',        badge: 'FREE∞', tier: 'medium',  group: 'DZ MEDIA',       waitSecs: 90,  desc: 'شبكة مجتمعية مجانية بلا حدود — ~60-120ث' },
  { id: 'nano-banana',    label: '✨ Gemini 2.0 Flash Image',         badge: 'PRO',   tier: 'fast',    group: 'DZ MEDIA PRO',   waitSecs: 5,   desc: 'جودة عالية + Horde fallback' },
  { id: 'hf',             label: '⚡ FLUX.1 / SDXL (HF)',             badge: 'FAST',  tier: 'fast',    group: 'DZ MEDIA',       waitSecs: 20,  desc: 'HuggingFace — مجاني + Horde fallback' },
  { id: 'flux',           label: '⚡ FLUX (Pollinations)',            badge: 'FREE',  tier: 'fast',    group: 'DZ MEDIA BASIC', waitSecs: 2,   desc: 'سريع مجاني' },
  { id: 'turbo',          label: '🚀 Turbo (Pollinations)',           badge: 'FREE',  tier: 'fast',    group: 'DZ MEDIA BASIC', waitSecs: 2,   desc: 'سريع مجاني' },
  { id: 'flux-realism',   label: '📸 FLUX Realism',                  badge: 'REAL',  tier: 'fast',    group: 'DZ MEDIA BASIC', waitSecs: 2,   desc: 'واقعية فائقة' },
  { id: 'flux-anime',     label: '🌸 FLUX Anime',                    badge: 'ANIME', tier: 'fast',    group: 'DZ MEDIA BASIC', waitSecs: 2,   desc: 'أسلوب أنيمي' },
  { id: 'flux-schnell',   label: '⚡ FLUX.1-schnell',                 badge: 'HD',    tier: 'fast',    group: 'DZ MEDIA',       waitSecs: 20,  desc: 'جودة عالية سريع' },
  { id: 'flux-dev',       label: '🎯 FLUX.1-dev',                    badge: 'HD',    tier: 'fast',    group: 'DZ MEDIA',       waitSecs: 20,  desc: 'جودة إبداعية' },
  { id: 'sd35-large',     label: '🖼️ Stable Diffusion 3.5 Large',    badge: 'HD',    tier: 'fast',    group: 'DZ MEDIA',       waitSecs: 20,  desc: 'SD3.5 جودة عالية' },
  { id: 'realvisxl',      label: '📷 RealVisXL V4.0',                 badge: 'REAL',  tier: 'fast',    group: 'DZ MEDIA',       waitSecs: 20,  desc: 'صور واقعية فائقة' },
]

const GROUP_ORDER = ['DZ MEDIA PRO', 'DZ MEDIA', 'DZ MEDIA BASIC']
const TIER_COLOR: Record<string, string> = {
  premium: 'linear-gradient(135deg,#f59e0b,#d97706)',
  fast:    'linear-gradient(135deg,#6366f1,#818cf8)',
}

const IMG_MODEL_SEQUENCE = DEFAULT_MODELS.map(m => m.id)

export default function DZMediaStudio() {
  const navigate = useNavigate()
  const [prompt, setPrompt]             = useState('')
  const [model, setModel]               = useState('auto')
  const [models, setModels]             = useState<ModelDef[]>(DEFAULT_MODELS)
  const [quota, setQuota]               = useState<QuotaInfo | null>(null)
  const [icCredits, setIcCredits]       = useState<{ remaining: number | null; backoffRemainMin: number } | null>(null)
  const [width, setWidth]               = useState(768)
  const [height, setHeight]             = useState(768)
  const [loading, setLoading]           = useState(false)
  const [result, setResult]             = useState<ImageResult | null>(null)
  const [error, setError]               = useState('')
  const [progress, setProgress]         = useState('')
  const [activeGroup, setActiveGroup]   = useState<string>('all')
  const [elapsed, setElapsed]           = useState(0)
  const timerRef                        = useRef<ReturnType<typeof setInterval> | null>(null)

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
      .then(d => { if (d.models?.length) setModels([...d.models, ...DEFAULT_MODELS.filter(dm => !d.models.find((m:ModelDef) => m.id === dm.id))]) })
      .catch(() => {})

    fetch('/api/dz-agent-v4/image/quota')
      .then(r => r.json())
      .then(d => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})

    fetch('/api/chatimg/credits')
      .then(r => r.json())
      .then(d => { if (d.ok) setIcCredits({ remaining: d.remaining, backoffRemainMin: d.backoffRemainMin ?? 0 }) })
      .catch(() => {})
  }, [])

  const refreshQuota = useCallback(() => {
    fetch('/api/dz-agent-v4/image/quota')
      .then(r => r.json())
      .then(d => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})
  }, [])

  const selectedModel = models.find(m => m.id === model) || models[0]
  const groups        = GROUP_ORDER.filter(g => models.some(m => m.group === g))
  const displayed     = activeGroup === 'all' ? models : models.filter(m => m.group === activeGroup)

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { setError('الرجاء كتابة وصف'); return }
    setLoading(true); setError('')

    const dzMediaIds = ['auto','nano-banana','imgcreator','imgcreator-gpt','horde','hf']
    const isDzMedia  = dzMediaIds.includes(model)
    const hasArabic  = /[\u0600-\u06FF]/.test(prompt)
    const modelQueue = isDzMedia
      ? [model, ...dzMediaIds.filter(id => id !== model)]
      : [model, ...IMG_MODEL_SEQUENCE.filter(id => !dzMediaIds.includes(id) && id !== model)]

    const isImgCreator = (id: string) => id === 'imgcreator' || id === 'imgcreator-gpt'

    let succeeded = false
    for (let i = 0; i < Math.min(modelQueue.length, 4); i++) {
      const tryModel = modelQueue[i]
      const tryEP    = dzMediaIds.includes(tryModel) ? '/api/chatimg/generate' : '/api/dz-agent-v4/image'
      const mDef     = DEFAULT_MODELS.find(m => m.id === tryModel)
      const waitNote = mDef?.waitSecs ? ` (~${mDef.waitSecs}ث)` : ''
      setProgress(hasArabic && i === 0
        ? `🔤 ترجمة ثم توليد بـ ${selectedModel?.label || model}${waitNote}...`
        : i === 0
          ? `🎨 جاري التوليد بـ ${selectedModel?.label || model}${waitNote}...`
          : `🔄 نموذج آخر (${i+1}/4)${waitNote}...`)

      try {
        const res  = await fetch(tryEP, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, model: tryModel, width, height }),
          signal: AbortSignal.timeout(100_000),
        })
        const data = await res.json() as {
          ok: boolean; url?: string; promptUsed?: string; model?: string; provider?: string
          error?: string; quotaExceeded?: boolean; quota?: QuotaInfo; translated?: boolean
          remainingCredits?: number | null
        }
        if (data.remainingCredits !== undefined)
          setIcCredits(prev => ({ remaining: data.remainingCredits ?? null, backoffRemainMin: prev?.backoffRemainMin ?? 0 }))
        if (data.quotaExceeded) {
          if (data.quota) setQuota(data.quota)
          if (isImgCreator(tryModel)) {
            setIcCredits({ remaining: 0, backoffRemainMin: 60 })
            continue
          }
          setError(data.error || 'تجاوزت الحصة'); break
        }
        if (data.ok && data.url) {
          setResult({
            type: 'image', url: data.url,
            prompt: data.promptUsed || prompt,
            model:    maskedModel(data.model || tryModel),
            provider: maskedProvider(data.provider || ''),
            translatedPrompt: data.translated ? data.promptUsed : undefined,
          })
          refreshQuota(); succeeded = true; break
        }
      } catch { /* timeout/network */ }
    }
    if (!succeeded && !error) {
      setError('فشلت جميع النماذج — جرّب وصفاً مختلفاً أو حاول لاحقاً')
    }
    setLoading(false); setProgress('')
  }, [prompt, model, width, height, selectedModel, error, refreshQuota])

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

      {quota && (
        <div className="dms-quota-bar">
          <div className="dms-quota-item">
            <span className="dms-quota-icon">⚡</span>
            <span>مجاني:</span>
            <div className="dms-quota-track">
              <div className="dms-quota-fill dms-quota-fill--fast"
                style={{ width: `${(quota.fast.remaining / quota.fast.limit) * 100}%` }} />
            </div>
            <span className="dms-quota-num">{quota.fast.remaining}/{quota.fast.limit}</span>
          </div>
          <div className="dms-quota-item">
            <span className="dms-quota-icon">✨</span>
            <span>PRO:</span>
            <div className="dms-quota-track">
              <div className="dms-quota-fill dms-quota-fill--premium"
                style={{ width: `${(quota.premium.remaining / quota.premium.limit) * 100}%` }} />
            </div>
            <span className="dms-quota-num">{quota.premium.remaining}/{quota.premium.limit}</span>
          </div>
          <span className="dms-quota-reset">يتجدد بعد {quota.resetInHours} ساعة</span>
        </div>
      )}

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
            <div className="dms-group-filter">
              <button className={`dms-group-btn${activeGroup === 'all' ? ' active' : ''}`} onClick={() => setActiveGroup('all')}>الكل</button>
              {groups.map(g => (
                <button key={g} className={`dms-group-btn${activeGroup === g ? ' active' : ''}`} onClick={() => setActiveGroup(g)}>{g}</button>
              ))}
            </div>
            <div className="dms-model-grid">
              {displayed.map(m => {
                const isIC      = m.id === 'imgcreator' || m.id === 'imgcreator-gpt'
                const icBlocked = isIC && !!icCredits?.backoffRemainMin && icCredits.backoffRemainMin > 0
                return (
                  <button
                    key={m.id}
                    title={m.desc || m.label}
                    className={`dms-model-card${model === m.id ? ' dms-model-card--active' : ''} dms-model-card--${m.tier}${icBlocked ? ' dms-model-card--dimmed' : ''}`}
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
                      {isIC && icCredits?.remaining !== null && icCredits?.remaining !== undefined && (
                        <span className="dms-model-badge" style={{ background: icCredits.remaining === 0 ? '#2d1010' : '#0d2d1a', color: icCredits.remaining === 0 ? '#f87171' : '#34d399', fontSize: '9px', padding: '1px 4px' }}>
                          {icCredits.remaining === 0 ? '⛔ نفدت' : `💳 ${icCredits.remaining}`}
                        </span>
                      )}
                      {isIC && icCredits?.backoffRemainMin && icCredits.backoffRemainMin > 0 ? (
                        <span className="dms-model-badge" style={{ background: '#2d1a00', color: '#fbbf24', fontSize: '9px', padding: '1px 4px' }}>
                          🔄 {icCredits.backoffRemainMin}د
                        </span>
                      ) : null}
                      <span className="dms-model-badge dms-model-badge--tier" style={{ background: TIER_COLOR[m.tier] }}>
                        {m.tier === 'premium' ? '✨' : '⚡'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
            {selectedModel?.tier === 'premium' && (
              <div className="dms-premium-note">
                ✨ نموذج DZ MEDIA PRO — يستهلك من حصة <strong>{quota?.premium.remaining ?? '?'}</strong> متبقية
                {quota?.premium.remaining === 0 && <span style={{ color: '#ef4444', marginRight: 8 }}>⚠️ نفدت — اختر DZ MEDIA</span>}
              </div>
            )}
            {(selectedModel?.id === 'imgcreator' || selectedModel?.id === 'imgcreator-gpt') && (
              <div className="dms-premium-note" style={{ borderColor: '#134e2a', color: '#86efac' }}>
                🎁 ImgCreator Guest — مجاني بدون مفتاح API — ~60ث — إذا نفدت الحصة يتولى <strong>Stable Horde</strong> تلقائياً
                {icCredits?.backoffRemainMin && icCredits.backoffRemainMin > 0 ? (
                  <span style={{ color: '#fbbf24', marginRight: 8 }}> — الحصة نفدت (تجديد {icCredits.backoffRemainMin}د) → Horde يعمل</span>
                ) : null}
              </div>
            )}
            {selectedModel?.id === 'horde' && (
              <div className="dms-premium-note" style={{ borderColor: '#1d4ed8', color: '#93c5fd' }}>
                🌐 Stable Horde — شبكة GPU مجتمعية مجانية بلا حدود — بدون أي مفتاح API — وقت الانتظار ~60-120 ثانية
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
