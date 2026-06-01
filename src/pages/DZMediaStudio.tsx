import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/dz-media-studio.css'

type Tab = 'text2img' | 'img2img' | 'text2video' | 'img2video'

interface ModelDef {
  id: string; label: string; badge?: string; tier: 'fast' | 'premium'; provider: string; group: string
}
interface VidModel {
  id: string; label: string; badge?: string; color?: string; tier?: string; provider?: string; status?: string
}
interface QuotaInfo {
  fast:    { remaining: number; used: number; limit: number }
  premium: { remaining: number; used: number; limit: number }
  resetInHours: number
}
interface AspectPreset {
  label: string; sub: string; w: number; h: number; shape: 'tall'|'square'|'wide'|'photo'
}

const TABS: { id: Tab; label: string; icon: string; desc: string }[] = [
  { id: 'text2img',   label: 'نص → صورة',   icon: '🎨', desc: 'اكتب وصفاً وسيولّد الذكاء الاصطناعي صورة احترافية' },
  { id: 'img2img',    label: 'صورة → صورة', icon: '🖼️', desc: 'حوّل أو عدّل صورة موجودة بوصف نصي' },
  { id: 'text2video', label: 'نص → فيديو',   icon: '🎬', desc: 'ولّد مقطع فيديو من وصف نصي بالذكاء الاصطناعي' },
  { id: 'img2video',  label: 'صورة → فيديو', icon: '🎥', desc: 'حرّك صورة ثابتة وحوّلها إلى فيديو متحرك' },
]

const IMG_PRESETS: AspectPreset[] = [
  { label: 'عمودي',  sub: '9:16', w: 576,  h: 1024, shape: 'tall'   },
  { label: 'مربع',   sub: '1:1',  w: 768,  h: 768,  shape: 'square' },
  { label: 'أفقي',   sub: '16:9', w: 1024, h: 576,  shape: 'wide'   },
  { label: 'كلاسيك', sub: '4:3',  w: 1024, h: 768,  shape: 'photo'  },
]

const DEFAULT_MODELS: ModelDef[] = [
  { id: 'auto',        label: '🤖 ChatIMG Auto',    badge: 'SMART', tier: 'fast',    provider: 'chatimg', group: 'ChatIMG'   },
  { id: 'nano-banana', label: '🍌 Nano Banana Pro', badge: 'FREE',  tier: 'fast',    provider: 'chatimg', group: 'ChatIMG'   },
  { id: 'gpt-image-2', label: '🤖 GPT Image 2',     badge: 'OR',    tier: 'premium', provider: 'chatimg', group: 'ChatIMG'   },
  { id: 'hf',          label: '⚡ FLUX HuggingFace', badge: 'HF',    tier: 'fast',    provider: 'chatimg', group: 'ChatIMG'   },
  { id: 'flux',        label: '⚡ FLUX',             badge: 'FAST',  tier: 'fast',    provider: 'pollinations', group: 'Pollinations' },
  { id: 'turbo',       label: '🚀 Turbo',            badge: 'FAST',  tier: 'fast',    provider: 'pollinations', group: 'Pollinations' },
  { id: 'flux-realism',label: '📸 FLUX Realism',     badge: 'REAL',  tier: 'fast',    provider: 'pollinations', group: 'Pollinations' },
  { id: 'flux-anime',  label: '🌸 FLUX Anime',       badge: '',      tier: 'fast',    provider: 'pollinations', group: 'Pollinations' },
  { id: 'flux-schnell',label: '⚡ FLUX Schnell',      badge: 'HF',    tier: 'fast',    provider: 'hf', group: 'HuggingFace' },
  { id: 'flux-dev',    label: '🎯 FLUX Dev',          badge: 'HD',    tier: 'fast',    provider: 'hf', group: 'HuggingFace' },
  { id: 'sd35-large',  label: '🖼️ SD 3.5 Large',    badge: 'HD',    tier: 'fast',    provider: 'hf', group: 'HuggingFace' },
  { id: 'realvisxl',   label: '📷 RealVis XL',       badge: 'REAL',  tier: 'fast',    provider: 'hf', group: 'HuggingFace' },
]

const DEFAULT_VID_T2V: VidModel[] = [
  { id: 'animatediff', label: 'AnimateDiff',  badge: 'GIF',   color: '#f59e0b', provider: 'hf' },
  { id: 't2v-ms',      label: 'ModelScope',   badge: 'خفيف',  color: '#10b981', provider: 'hf' },
  { id: 'ltx-hf',      label: 'LTX HF',       badge: 'مجاني', color: '#8b5cf6', provider: 'hf' },
]
const DEFAULT_VID_I2V: VidModel[] = [
  { id: 'svd',       label: 'SVD XT',      badge: 'ناعم',   color: '#3b82f6', provider: 'hf' },
  { id: 'i2vgen',    label: 'I2VGen-XL',   badge: 'متوازن', color: '#0891b2', provider: 'hf' },
  { id: 'animdiff2', label: 'AnimateDiff', badge: 'GIF',    color: '#f59e0b', provider: 'hf' },
]

const GROUP_ORDER = ['ChatIMG', 'HuggingFace', 'Pollinations']
const TIER_COLOR: Record<string, string> = {
  premium: 'linear-gradient(135deg,#f59e0b,#d97706)',
  fast:    'linear-gradient(135deg,#6366f1,#818cf8)',
}

interface ImageResult {
  type: 'image'
  url: string; prompt: string; model: string; provider: string
  translatedPrompt?: string
}
interface VideoResult {
  type: 'video'
  url: string; frames?: string[]; isFrames?: boolean
  prompt: string; model: string; provider: string
  mimeType?: string; note?: string
}
type Result = ImageResult | VideoResult

export default function DZMediaStudio() {
  const navigate = useNavigate()
  const [tab, setTab]                   = useState<Tab>('text2img')
  const [prompt, setPrompt]             = useState('')
  const [model, setModel]               = useState('auto')
  const [vidModel, setVidModel]         = useState('')
  const [models, setModels]             = useState<ModelDef[]>(DEFAULT_MODELS)
  const [t2vModels, setT2vModels]       = useState<VidModel[]>(DEFAULT_VID_T2V)
  const [i2vModels, setI2vModels]       = useState<VidModel[]>(DEFAULT_VID_I2V)
  const [quota, setQuota]               = useState<QuotaInfo | null>(null)
  const [imageUrl, setImageUrl]         = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [width, setWidth]               = useState(768)
  const [height, setHeight]             = useState(768)
  const [loading, setLoading]           = useState(false)
  const [result, setResult]             = useState<Result | null>(null)
  const [error, setError]               = useState('')
  const [progress, setProgress]         = useState('')
  const [imgError, setImgError]         = useState(false)
  const [activeGroup, setActiveGroup]   = useState<string>('all')
  const [frameIdx, setFrameIdx]         = useState(0)
  const fileRef   = useRef<HTMLInputElement>(null)
  const videoRef  = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    fetch('/api/chatimg/models')
      .then(r => r.json())
      .then(d => { if (d.models?.length) setModels(d.models) })
      .catch(() => {})

    fetch('/api/dz-agent-v4/image/quota')
      .then(r => r.json())
      .then(d => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})

    fetch('/api/dz-agent-v4/video/models')
      .then(r => r.json())
      .then(d => {
        if (d.t2v?.length) setT2vModels(d.t2v)
        if (d.i2v?.length) setI2vModels(d.i2v)
      })
      .catch(() => {})
  }, [])

  // Slideshow for frame sequences
  useEffect(() => {
    if (result?.type !== 'video' || !result.isFrames || !result.frames?.length) return
    const iv = setInterval(() => setFrameIdx(i => (i + 1) % result.frames!.length), 1000)
    return () => clearInterval(iv)
  }, [result])

  const refreshQuota = useCallback(() => {
    fetch('/api/dz-agent-v4/image/quota')
      .then(r => r.json())
      .then(d => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})
  }, [])

  const selectedModel = models.find(m => m.id === model) || models[0]
  const isVideoTab    = tab === 'text2video' || tab === 'img2video'

  const handleTabChange = (t: Tab) => {
    setTab(t); setResult(null); setError('')
    setWidth(768); setHeight(768); setImgError(false); setFrameIdx(0)
  }

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target?.result as string
      setImagePreview(src)
      if (src.startsWith('http')) setImageUrl(src)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) { setError('الرجاء كتابة وصف'); return }
    if ((tab === 'img2img' || tab === 'img2video') && !imageUrl && !imagePreview) {
      setError('الرجاء رفع صورة أو إدخال رابطها'); return
    }
    setLoading(true); setError(''); setResult(null); setImgError(false); setFrameIdx(0)

    try {
      // ── TEXT → IMAGE ──────────────────────────────────────────────────────
      if (tab === 'text2img') {
        const isChatIMG = ['auto', 'nano-banana', 'gpt-image-2', 'hf'].includes(model)
        const hasArabic = /[\u0600-\u06FF]/.test(prompt)
        setProgress(hasArabic
          ? `🔤 ترجمة الوصف ثم التوليد بـ ${selectedModel?.label || model}...`
          : `🎨 جاري التوليد بـ ${selectedModel?.label || model}...`)

        const endpoint  = isChatIMG ? '/api/chatimg/generate' : '/api/dz-agent-v4/image'
        const body: Record<string, unknown> = { prompt, model, width, height }

        const res  = await fetch(endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
          signal:  AbortSignal.timeout(90_000),
        })
        const data = await res.json() as {
          ok: boolean; url?: string; promptUsed?: string; model?: string
          provider?: string; error?: string; quotaExceeded?: boolean; quota?: QuotaInfo
          translated?: boolean; sourceLanguage?: string
        }

        if (data.quotaExceeded) { if (data.quota) setQuota(data.quota); setError(data.error || 'تجاوزت الحصة اليومية'); return }
        if (data.ok && data.url) {
          setResult({
            type: 'image', url: data.url,
            prompt: data.promptUsed || prompt,
            model: data.model || model,
            provider: data.provider || '',
            translatedPrompt: data.translated ? data.promptUsed : undefined,
          })
          refreshQuota()
        } else {
          setError(data.error || 'فشل التوليد — جرّب نموذجاً آخر')
        }

      // ── IMAGE → IMAGE ──────────────────────────────────────────────────────
      } else if (tab === 'img2img') {
        setProgress('🖼️ جاري تعديل الصورة...')
        const res  = await fetch('/api/dz-agent-v4/img2img', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            prompt,
            imageUrl:    imagePreview || imageUrl,
            imageBase64: imagePreview?.startsWith('data:') ? imagePreview.split(',')[1] : null,
          }),
          signal: AbortSignal.timeout(75_000),
        })
        const data = await res.json() as { ok: boolean; url?: string; promptUsed?: string; model?: string; provider?: string; error?: string }
        if (data.ok && data.url) {
          setResult({ type: 'image', url: data.url, prompt: data.promptUsed || prompt, model: data.model || 'img2img', provider: data.provider || '' })
          refreshQuota()
        } else {
          setError(data.error || 'فشل التحويل، حاول مجدداً')
        }

      // ── TEXT → VIDEO ──────────────────────────────────────────────────────
      } else if (tab === 'text2video') {
        setProgress('🎬 جاري توليد الفيديو... (قد يستغرق 30-120 ثانية)')
        const res  = await fetch('/api/dz-agent-v4/video', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ prompt, model: vidModel || undefined, width, height }),
          signal:  AbortSignal.timeout(130_000),
        })
        const data = await res.json() as {
          ok: boolean; url?: string; frames?: string[]; isFrames?: boolean
          model?: string; provider?: string; mimeType?: string; error?: string
          rateLimited?: boolean; note?: string
        }
        if (data.rateLimited) { setError(data.error || 'تجاوزت الحصة اليومية للفيديو'); return }
        if (data.ok && data.url) {
          setResult({
            type: 'video',
            url: data.url,
            frames: data.frames,
            isFrames: data.isFrames,
            prompt,
            model: data.model || 'AI Video',
            provider: data.provider || '',
            mimeType: data.mimeType,
            note: data.note,
          })
        } else {
          setError(data.error || 'فشل توليد الفيديو — حاول مجدداً')
        }

      // ── IMAGE → VIDEO ──────────────────────────────────────────────────────
      } else if (tab === 'img2video') {
        setProgress('🎥 جاري تحريك الصورة... (قد يستغرق 30-120 ثانية)')
        const res  = await fetch('/api/dz-agent-v4/img2video', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            imageUrl: imagePreview || imageUrl,
            prompt:   prompt || 'animate smoothly with natural motion',
            model:    vidModel || undefined,
          }),
          signal: AbortSignal.timeout(130_000),
        })
        const data = await res.json() as {
          ok: boolean; url?: string; frames?: string[]; isFrames?: boolean
          model?: string; provider?: string; mimeType?: string; error?: string
          rateLimited?: boolean; note?: string
        }
        if (data.rateLimited) { setError(data.error || 'تجاوزت الحصة اليومية'); return }
        if (data.ok && data.url) {
          setResult({
            type: 'video',
            url: data.url,
            frames: data.frames,
            isFrames: data.isFrames,
            prompt: prompt || 'animate',
            model: data.model || 'I2V',
            provider: data.provider || '',
            mimeType: data.mimeType,
            note: data.note,
          })
        } else {
          setError(data.error || 'فشل تحريك الصورة — حاول مجدداً')
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('AbortError') ? 'انتهت مهلة الطلب (130 ث) — جرّب نموذجاً أسرع' : msg)
    } finally {
      setLoading(false); setProgress('')
    }
  }, [tab, prompt, model, vidModel, models, selectedModel, imageUrl, imagePreview, width, height, refreshQuota])

  const groups    = GROUP_ORDER.filter(g => models.some(m => m.group === g))
  const displayed = activeGroup === 'all' ? models : models.filter(m => m.group === activeGroup)
  const currentTab = TABS.find(t => t.id === tab)!
  const vidModelList = tab === 'text2video' ? t2vModels : i2vModels

  const isVideo = result?.type === 'video'
  const vidResult = isVideo ? (result as VideoResult) : null

  const downloadVideo = () => {
    if (!vidResult) return
    const url = vidResult.isFrames ? vidResult.frames?.[0] || vidResult.url : vidResult.url
    const a   = document.createElement('a')
    a.href    = url
    a.download = `dz-video-${Date.now()}.${vidResult.mimeType?.includes('gif') ? 'gif' : 'mp4'}`
    a.target  = '_blank'
    a.click()
  }

  return (
    <div className="dms-root" dir="rtl">
      <header className="dms-header">
        <button className="dms-back-btn" onClick={() => navigate('/')}>← الرئيسية</button>
        <div className="dms-header-title">
          <span className="dms-header-icon">🎭</span>
          <h1>DZ Media Studio</h1>
          <span className="dms-badge">AI</span>
        </div>
        <p className="dms-header-sub">
          صور وفيديو بالذكاء الاصطناعي — مدعوم بـ ChatIMG · GPT Image 2 · Nano Banana Pro · FLUX
        </p>
      </header>

      {/* ── شريط الحصة ── */}
      {quota && !isVideoTab && (
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
            <span>مميز:</span>
            <div className="dms-quota-track">
              <div className="dms-quota-fill dms-quota-fill--premium"
                style={{ width: `${(quota.premium.remaining / quota.premium.limit) * 100}%` }} />
            </div>
            <span className="dms-quota-num">{quota.premium.remaining}/{quota.premium.limit}</span>
          </div>
          <span className="dms-quota-reset">يتجدد بعد {quota.resetInHours} ساعة</span>
        </div>
      )}

      {/* ── التبويبات ── */}
      <div className="dms-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`dms-tab${tab === t.id ? ' dms-tab--active' : ''}${
              (t.id === 'text2video' || t.id === 'img2video') ? ' dms-tab--video' : ''}`}
            onClick={() => handleTabChange(t.id)}
          >
            <span className="dms-tab-icon">{t.icon}</span>
            <span className="dms-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="dms-body">

        {/* ======= لوحة الإدخال ======= */}
        <div className="dms-panel">
          <p className="dms-tab-desc">{currentTab.icon} {currentTab.desc}</p>

          {/* رفع صورة — img2img + img2video */}
          {(tab === 'img2img' || tab === 'img2video') && (
            <div className="dms-upload-zone">
              <input type="file" ref={fileRef} accept="image/*" hidden onChange={handleFileUpload} />
              {imagePreview ? (
                <div className="dms-preview-wrap">
                  <img src={imagePreview} alt="preview" className="dms-img-preview" />
                  <button className="dms-remove-img" onClick={() => { setImagePreview(null); setImageUrl('') }}>✕ إزالة</button>
                </div>
              ) : (
                <div className="dms-upload-drop" onClick={() => fileRef.current?.click()}>
                  <span className="dms-upload-icon">📤</span>
                  <span>اضغط لرفع صورة</span>
                </div>
              )}
              <div className="dms-or-sep">— أو أدخل رابط الصورة —</div>
              <input
                className="dms-input" type="url"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
              />
            </div>
          )}

          {/* وصف النص */}
          <div className="dms-prompt-wrap">
            <label className="dms-label">
              ✏️ {tab === 'img2img' ? 'وصف التعديل' : tab === 'img2video' ? 'وصف الحركة (اختياري)' : 'وصف المشهد'}
            </label>
            <textarea
              className="dms-textarea"
              rows={tab === 'img2video' ? 2 : 3}
              placeholder={
                tab === 'text2img'   ? 'مثال: قصبة الجزائر عند الغروب، فوتوريالستيك، 8K' :
                tab === 'img2img'    ? 'مثال: نفس الصورة بأسلوب أنيمي ياباني' :
                tab === 'text2video' ? 'مثال: طائر يحلق فوق جبال الجزائر في غروب الشمس' :
                'مثال: تحريك ناعم، بانوراما خفيفة (اتركه فارغاً للتحريك التلقائي)'
              }
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }}
            />
          </div>

          {/* ── اختيار نموذج الصورة ── */}
          {(tab === 'text2img') && (
            <div className="dms-section">
              <label className="dms-label">🧠 النموذج</label>
              <div className="dms-group-filter">
                <button className={`dms-group-btn${activeGroup === 'all' ? ' active' : ''}`} onClick={() => setActiveGroup('all')}>الكل</button>
                {groups.map(g => (
                  <button key={g} className={`dms-group-btn${activeGroup === g ? ' active' : ''}`} onClick={() => setActiveGroup(g)}>{g}</button>
                ))}
              </div>
              <div className="dms-model-grid">
                {displayed.map(m => (
                  <button
                    key={m.id}
                    className={`dms-model-card${model === m.id ? ' dms-model-card--active' : ''} dms-model-card--${m.tier}`}
                    onClick={() => setModel(m.id)}
                    title={`${m.group} · ${m.tier === 'premium' ? 'مميز' : 'مجاني'}`}
                  >
                    <span className="dms-model-label">{m.label}</span>
                    <div className="dms-model-badges">
                      {m.badge && <span className="dms-model-badge dms-model-badge--tag">{m.badge}</span>}
                      <span className="dms-model-badge dms-model-badge--tier" style={{ background: TIER_COLOR[m.tier] }}>
                        {m.tier === 'premium' ? '✨' : '⚡'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              {selectedModel?.tier === 'premium' && (
                <div className="dms-premium-note">
                  ✨ نموذج مميز — يستهلك من حصة <strong>{quota?.premium.remaining ?? '?'}</strong> متبقية
                  {quota?.premium.remaining === 0 && <span style={{ color: '#ef4444', marginRight: 8 }}>⚠️ نفدت — اختر مجانياً</span>}
                </div>
              )}
            </div>
          )}

          {/* ── اختيار نموذج الفيديو ── */}
          {isVideoTab && (
            <div className="dms-section">
              <label className="dms-label">🎬 نموذج الفيديو</label>
              <div className="dms-vid-model-grid">
                {vidModelList.map(m => (
                  <button
                    key={m.id}
                    className={`dms-vid-model-card${vidModel === m.id ? ' dms-vid-model-card--active' : ''}`}
                    onClick={() => setVidModel(vidModel === m.id ? '' : m.id)}
                    style={vidModel === m.id ? { borderColor: m.color, boxShadow: `0 0 0 1px ${m.color}22` } : {}}
                    title={m.provider}
                  >
                    <span className="dms-vid-name">{m.label}</span>
                    {m.badge && (
                      <span className="dms-vid-badge" style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44` }}>
                        {m.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="dms-no-token-note">
                ⚡ اختر نموذجاً أو اترك فارغاً للاختيار التلقائي — الفيديو يستغرق 30-120 ثانية
              </div>
            </div>
          )}

          {/* ── مقياس الإطار (للصور فقط) ── */}
          {!isVideoTab && (
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
          )}

          {error   && <div className="dms-error">⚠️ {error}</div>}
          {loading && <div className="dms-progress">{progress || '⏳ جاري العمل...'}</div>}

          <button className="dms-generate-btn" onClick={handleGenerate} disabled={loading}>
            {loading ? (
              <><span className="dms-spinner" /> {progress || 'جاري...'}</>
            ) : (
              <>{currentTab.icon} {
                tab === 'text2img'   ? 'ولّد الصورة' :
                tab === 'img2img'    ? 'حوّل الصورة' :
                tab === 'text2video' ? 'ولّد الفيديو' :
                'حرّك الصورة'
              }</>
            )}
          </button>
          <p className="dms-hint">Ctrl+Enter للتوليد السريع</p>
        </div>

        {/* ======= لوحة النتيجة ======= */}
        <div className="dms-result-panel">
          {!result && !loading && (
            <div className="dms-empty-state">
              <div className="dms-empty-icon">{currentTab.icon}</div>
              <p className="dms-empty-title">
                {isVideoTab ? 'الفيديو سيظهر هنا' : 'الصورة ستظهر هنا'}
              </p>
              <p className="dms-empty-sub">
                {tab === 'text2img'   ? 'اكتب وصفاً واختر نموذجاً وانقر "ولّد الصورة"' :
                 tab === 'img2img'    ? 'ارفع صورة وأضف وصف التعديل' :
                 tab === 'text2video' ? 'اكتب وصف المشهد وانقر "ولّد الفيديو"' :
                 'ارفع صورة وانقر "حرّك الصورة"'}
              </p>
            </div>
          )}

          {loading && (
            <div className="dms-loading-anim">
              <div className="dms-loading-ring" />
              <p className="dms-loading-text">{progress || '⏳ جاري التوليد...'}</p>
              <p className="dms-loading-sub">
                {isVideoTab ? 'الفيديو قد يستغرق 30-120 ثانية' : 'قد يستغرق 10-60 ثانية حسب النموذج'}
              </p>
            </div>
          )}

          {result && (
            <div className="dms-result-card">

              {/* ── عرض الصورة ── */}
              {result.type === 'image' && (
                <div className="dms-result-img-wrap">
                  {imgError ? (
                    <div className="dms-img-fallback">
                      <span>⚠️</span>
                      <p>تعذّر عرض الصورة</p>
                      <a href={result.url} target="_blank" rel="noopener noreferrer" className="dms-action-btn dms-action-btn--dl">
                        🔗 افتح في تبويب جديد
                      </a>
                    </div>
                  ) : (
                    <img
                      src={result.url} alt={result.prompt}
                      className="dms-result-img" loading="eager"
                      onLoad={() => setImgError(false)}
                      onError={() => setImgError(true)}
                    />
                  )}
                </div>
              )}

              {/* ── عرض الفيديو ── */}
              {result.type === 'video' && (
                <div className="dms-result-img-wrap">
                  {vidResult?.isFrames ? (
                    /* Slideshow للإطارات */
                    <div className="dms-frames-wrap">
                      <img
                        src={vidResult.frames?.[frameIdx] || vidResult.url}
                        alt={`frame ${frameIdx + 1}`}
                        className="dms-result-img"
                      />
                      <div className="dms-frames-overlay">
                        <span>🎬 إطار {frameIdx + 1}/{vidResult.frames?.length || 1}</span>
                        {vidResult.note && <span className="dms-frames-note">💡 {vidResult.note}</span>}
                      </div>
                    </div>
                  ) : (
                    /* فيديو حقيقي */
                    <video
                      ref={videoRef}
                      src={vidResult?.url}
                      className="dms-result-video"
                      controls autoPlay loop muted playsInline
                      onError={() => setImgError(true)}
                    />
                  )}
                </div>
              )}

              {/* معلومات النموذج */}
              <div className="dms-result-meta">
                <span className="dms-result-model">
                  {result.type === 'video' ? '🎬' : '✨'} {result.model}
                </span>
                <span className="dms-result-sep">·</span>
                <span className="dms-result-provider">{result.provider}</span>
              </div>

              {/* الوصف المترجم */}
              {result.type === 'image' && result.translatedPrompt && (
                <div className="dms-translated-box">
                  <span className="dms-translated-title">🔤 تُرجم تلقائياً:</span>
                  <span className="dms-translated-text" dir="ltr">"{result.translatedPrompt}"</span>
                </div>
              )}

              {/* ── أزرار الإجراءات ── */}
              <div className="dms-result-actions">
                {result.type === 'image' ? (
                  <>
                    <a
                      href={result.url} download={`dz-media-${Date.now()}.png`}
                      target="_blank" rel="noopener noreferrer"
                      className="dms-action-btn dms-action-btn--dl"
                    >⬇ تحميل</a>
                    <button
                      className="dms-action-btn dms-action-btn--use"
                      onClick={() => { setImagePreview(result.url); setImageUrl(result.url); handleTabChange('img2img') }}
                    >🖼️ img2img</button>
                    <button
                      className="dms-action-btn dms-action-btn--vid"
                      onClick={() => { setImagePreview(result.url); setImageUrl(result.url); handleTabChange('img2video') }}
                    >🎥 تحريك</button>
                    <button className="dms-action-btn" onClick={handleGenerate} disabled={loading}>🔄 جديد</button>
                  </>
                ) : (
                  <>
                    <button className="dms-action-btn dms-action-btn--dl" onClick={downloadVideo}>⬇ تحميل</button>
                    {vidResult?.isFrames && (
                      <button
                        className="dms-action-btn dms-action-btn--use"
                        onClick={() => {
                          const url = vidResult.frames?.[frameIdx] || vidResult.url
                          setImagePreview(url); setImageUrl(url); handleTabChange('img2img')
                        }}
                      >🖼️ تعديل إطار</button>
                    )}
                    <button className="dms-action-btn" onClick={handleGenerate} disabled={loading}>🔄 جديد</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="dms-footer">
        <span className="dms-footer-text">DZ MEDIA STUDIO 2026 ® — ChatIMG × AI</span>
        <span className="dms-footer-flag"> 🇩🇿</span>
      </footer>
    </div>
  )
}
