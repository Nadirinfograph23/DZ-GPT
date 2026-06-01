import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/dz-media-studio.css'

type Tab = 'text2img' | 'img2img' | 'text2video' | 'img2video'

interface ModelDef {
  id: string; label: string; badge?: string; tier: 'fast' | 'premium'; group: string
}
interface VidModel {
  id: string; label: string; badge?: string; color?: string
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
interface VideoResult {
  type: 'video'
  url: string; frames?: string[]; isFrames?: boolean
  prompt: string; model: string; provider: string
  mimeType?: string; note?: string
}
type Result = ImageResult | VideoResult

/* ── نموذج مسار التبويب ───────────────────────────────── */
const TABS: { id: Tab; label: string; icon: string; desc: string; color: string }[] = [
  { id: 'text2img',   label: 'نص → صورة',   icon: '🎨', desc: 'اكتب وصفاً وسيولّد الذكاء الاصطناعي صورة احترافية',   color: '#c8ff00' },
  { id: 'img2img',    label: 'صورة → صورة', icon: '🖼️', desc: 'حوّل أو عدّل صورة موجودة بوصف نصي',                   color: '#818cf8' },
  { id: 'text2video', label: 'نص → فيديو',   icon: '🎬', desc: 'ولّد مقطع فيديو من وصف نصي بالذكاء الاصطناعي',       color: '#fb923c' },
  { id: 'img2video',  label: 'صورة → فيديو', icon: '🎥', desc: 'حرّك صورة ثابتة وحوّلها إلى فيديو متحرك',            color: '#f472b6' },
]

const IMG_PRESETS: AspectPreset[] = [
  { label: 'عمودي',  sub: '9:16', w: 576,  h: 1024, shape: 'tall'   },
  { label: 'مربع',   sub: '1:1',  w: 768,  h: 768,  shape: 'square' },
  { label: 'أفقي',   sub: '16:9', w: 1024, h: 576,  shape: 'wide'   },
  { label: 'كلاسيك', sub: '4:3',  w: 1024, h: 768,  shape: 'photo'  },
]

/* ── نماذج الصور (بدون أسماء مصادر خارجية) ────────────── */
const DEFAULT_MODELS: ModelDef[] = [
  { id: 'auto',         label: '🤖 DZ MEDIA Auto',         badge: 'AUTO',  tier: 'fast',    group: 'DZ MEDIA'       },
  { id: 'nano-banana',  label: '🍌 DZ MEDIA PRO Nano',      badge: 'PRO',   tier: 'fast',    group: 'DZ MEDIA PRO'   },
  { id: 'gpt-image-2',  label: '🤖 DZ MEDIA PRO Vision',    badge: 'PRO',   tier: 'premium', group: 'DZ MEDIA PRO'   },
  { id: 'hf',           label: '⚡ DZ MEDIA FLUX',           badge: 'FAST',  tier: 'fast',    group: 'DZ MEDIA'       },
  { id: 'flux',         label: '⚡ DZ MEDIA BASIC',          badge: 'BASIC', tier: 'fast',    group: 'DZ MEDIA BASIC' },
  { id: 'turbo',        label: '🚀 DZ MEDIA BASIC Turbo',   badge: 'BASIC', tier: 'fast',    group: 'DZ MEDIA BASIC' },
  { id: 'flux-realism', label: '📸 DZ MEDIA BASIC Réel',    badge: 'BASIC', tier: 'fast',    group: 'DZ MEDIA BASIC' },
  { id: 'flux-anime',   label: '🌸 DZ MEDIA BASIC Anime',   badge: 'BASIC', tier: 'fast',    group: 'DZ MEDIA BASIC' },
  { id: 'flux-schnell', label: '⚡ DZ MEDIA Schnell',        badge: 'HD',    tier: 'fast',    group: 'DZ MEDIA'       },
  { id: 'flux-dev',     label: '🎯 DZ MEDIA Dev',            badge: 'HD',    tier: 'fast',    group: 'DZ MEDIA'       },
  { id: 'sd35-large',   label: '🖼️ DZ MEDIA Ultra HD',      badge: 'HD',    tier: 'fast',    group: 'DZ MEDIA'       },
  { id: 'realvisxl',    label: '📷 DZ MEDIA Réel XL',        badge: 'REAL',  tier: 'fast',    group: 'DZ MEDIA'       },
]

const DEFAULT_VID_T2V: VidModel[] = [
  { id: 'auto',        label: '🤖 DZ MEDIA Auto',    badge: 'AUTO',   color: '#c8ff00' },
  { id: 'animatediff', label: '🎞️ DZ MEDIA Classic', badge: 'GIF',    color: '#f59e0b' },
  { id: 't2v-ms',      label: '⚡ DZ MEDIA Light',   badge: 'خفيف',  color: '#10b981' },
  { id: 'ltx-hf',      label: '🎬 DZ MEDIA Fast',    badge: 'سريع',  color: '#8b5cf6' },
]
const DEFAULT_VID_I2V: VidModel[] = [
  { id: 'auto',      label: '🤖 DZ MEDIA Auto',    badge: 'AUTO',   color: '#c8ff00' },
  { id: 'svd',       label: '🌊 DZ MEDIA Smooth',  badge: 'ناعم',  color: '#3b82f6' },
  { id: 'i2vgen',    label: '⚖️ DZ MEDIA Balance', badge: 'متوازن', color: '#0891b2' },
  { id: 'animdiff2', label: '🎞️ DZ MEDIA Classic', badge: 'GIF',    color: '#f59e0b' },
]

/* ترتيب المجموعات */
const GROUP_ORDER = ['DZ MEDIA PRO', 'DZ MEDIA', 'DZ MEDIA BASIC']
const TIER_COLOR: Record<string, string> = {
  premium: 'linear-gradient(135deg,#f59e0b,#d97706)',
  fast:    'linear-gradient(135deg,#6366f1,#818cf8)',
}

/* نماذج الصور المتاحة للـ fallback التلقائي */
const IMG_MODEL_SEQUENCE = DEFAULT_MODELS.map(m => m.id)

/* ──────────────────────────────────────────────────────── */
export default function DZMediaStudio() {
  const navigate = useNavigate()
  const [tab, setTab]                     = useState<Tab>('text2img')
  const [prompt, setPrompt]               = useState('')
  const [model, setModel]                 = useState('auto')
  const [vidModel, setVidModel]           = useState('')
  const [models, setModels]               = useState<ModelDef[]>(DEFAULT_MODELS)
  const [t2vModels, setT2vModels]         = useState<VidModel[]>(DEFAULT_VID_T2V)
  const [i2vModels, setI2vModels]         = useState<VidModel[]>(DEFAULT_VID_I2V)
  const [quota, setQuota]                 = useState<QuotaInfo | null>(null)
  const [imageUrl, setImageUrl]           = useState('')
  const [imagePreview, setImagePreview]   = useState<string | null>(null)
  const [width, setWidth]                 = useState(768)
  const [height, setHeight]               = useState(768)
  const [loading, setLoading]             = useState(false)

  /* إطار نتيجة منفصل لكل تبويب */
  const [results, setResults]             = useState<Partial<Record<Tab, Result>>>({})
  const [errors, setErrors]               = useState<Partial<Record<Tab, string>>>({})

  const [progress, setProgress]           = useState('')
  const [activeGroup, setActiveGroup]     = useState<string>('all')
  const [frameIdx, setFrameIdx]           = useState(0)
  const fileRef  = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  /* ── جلب النماذج والحصة ── */
  useEffect(() => {
    fetch('/api/chatimg/models')
      .then(r => r.json())
      .then(d => { if (d.models?.length) setModels([...d.models, ...DEFAULT_MODELS.filter(dm => !d.models.find((m:ModelDef) => m.id === dm.id))]) })
      .catch(() => {})

    fetch('/api/dz-agent-v4/image/quota')
      .then(r => r.json())
      .then(d => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})

    fetch('/api/dz-agent-v4/video/models')
      .then(r => r.json())
      .then(d => {
        if (d.t2v?.length) {
          setT2vModels([
            { id: 'auto', label: '🤖 DZ MEDIA Auto', badge: 'AUTO', color: '#c8ff00' },
            ...d.t2v.map((m: VidModel & { label: string }) => ({
              ...m,
              label: `DZ MEDIA ${m.label || m.id}`,
            })),
          ])
        }
        if (d.i2v?.length) {
          setI2vModels([
            { id: 'auto', label: '🤖 DZ MEDIA Auto', badge: 'AUTO', color: '#c8ff00' },
            ...d.i2v.map((m: VidModel & { label: string }) => ({
              ...m,
              label: `DZ MEDIA ${m.label || m.id}`,
            })),
          ])
        }
      })
      .catch(() => {})
  }, [])

  /* Slideshow للإطارات */
  useEffect(() => {
    const r = results[tab]
    if (r?.type !== 'video' || !(r as VideoResult).isFrames || !(r as VideoResult).frames?.length) return
    const iv = setInterval(() => setFrameIdx(i => (i + 1) % ((r as VideoResult).frames!.length)), 1000)
    return () => clearInterval(iv)
  }, [results, tab])

  /* إعادة ضبط المؤشر عند تبديل التبويب */
  useEffect(() => { setFrameIdx(0) }, [tab])

  const refreshQuota = useCallback(() => {
    fetch('/api/dz-agent-v4/image/quota')
      .then(r => r.json())
      .then(d => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})
  }, [])

  const setTabResult = (t: Tab, r: Result | null) =>
    setResults(prev => ({ ...prev, [t]: r ?? undefined }))
  const setTabError  = (t: Tab, msg: string) =>
    setErrors(prev => ({ ...prev, [t]: msg }))
  const clearTabError = (t: Tab) =>
    setErrors(prev => ({ ...prev, [t]: '' }))

  const selectedModel   = models.find(m => m.id === model) || models[0]
  const isVideoTab      = tab === 'text2video' || tab === 'img2video'
  const currentResult   = results[tab] ?? null
  const currentError    = errors[tab]  ?? ''
  const currentTab      = TABS.find(t => t.id === tab)!
  const vidModelList    = tab === 'text2video' ? t2vModels : i2vModels

  const groups    = GROUP_ORDER.filter(g => models.some(m => m.group === g))
  const displayed = activeGroup === 'all' ? models : models.filter(m => m.group === activeGroup)
  const vidResult = currentResult?.type === 'video' ? (currentResult as VideoResult) : null

  /* ── تغيير التبويب (بدون مسح النتيجة) ── */
  const handleTabChange = (t: Tab) => {
    setTab(t); clearTabError(t)
  }

  /* ── رفع الصورة ── */
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

  /* ── التوليد مع fallback تلقائي ── */
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && tab !== 'img2video') { setTabError(tab, 'الرجاء كتابة وصف'); return }
    if ((tab === 'img2img' || tab === 'img2video') && !imageUrl && !imagePreview) {
      setTabError(tab, 'الرجاء رفع صورة أو إدخال رابطها'); return
    }
    setLoading(true); clearTabError(tab)

    /* ─── نص → صورة ─────────────────────────────────── */
    if (tab === 'text2img') {
      const chatimgIds  = ['auto','nano-banana','gpt-image-2','hf']
      const isChatIMG   = chatimgIds.includes(model)
      const hasArabic   = /[\u0600-\u06FF]/.test(prompt)
      const modelQueue  = isChatIMG
        ? [model, ...chatimgIds.filter(id => id !== model)]          // chatimg fallback قائمة
        : [model, ...IMG_MODEL_SEQUENCE.filter(id => !chatimgIds.includes(id) && id !== model)]

      let succeeded = false
      for (let i = 0; i < Math.min(modelQueue.length, 4); i++) {
        const tryModel = modelQueue[i]
        const tryEP    = chatimgIds.includes(tryModel) ? '/api/chatimg/generate' : '/api/dz-agent-v4/image'
        setProgress(hasArabic && i === 0
          ? `🔤 ترجمة ثم توليد بـ ${selectedModel?.label || model}...`
          : i === 0
            ? `🎨 جاري التوليد بـ ${selectedModel?.label || model}...`
            : `🔄 نموذج آخر (${i+1}/4)...`)

        try {
          const res  = await fetch(tryEP, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model: tryModel, width, height }),
            signal: AbortSignal.timeout(90_000),
          })
          const data = await res.json() as {
            ok: boolean; url?: string; promptUsed?: string; model?: string; provider?: string
            error?: string; quotaExceeded?: boolean; quota?: QuotaInfo; translated?: boolean
          }
          if (data.quotaExceeded) { if (data.quota) setQuota(data.quota); setTabError(tab, data.error || 'تجاوزت الحصة'); break }
          if (data.ok && data.url) {
            setTabResult(tab, {
              type: 'image', url: data.url,
              prompt: data.promptUsed || prompt,
              model:    maskedModel(data.model || tryModel),
              provider: maskedProvider(data.provider || ''),
              translatedPrompt: data.translated ? data.promptUsed : undefined,
            })
            refreshQuota(); succeeded = true; break
          }
        } catch { /* timeout/network — جرّب التالي */ }
      }
      if (!succeeded && !currentError) {
        setTabError(tab, 'فشلت جميع النماذج — جرّب وصفاً مختلفاً أو حاول لاحقاً')
      }

    /* ─── صورة → صورة ────────────────────────────────── */
    } else if (tab === 'img2img') {
      setProgress('🖼️ جاري تعديل الصورة...')
      let ok = false
      try {
        const res  = await fetch('/api/dz-agent-v4/img2img', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            imageUrl:    imagePreview || imageUrl,
            imageBase64: imagePreview?.startsWith('data:') ? imagePreview.split(',')[1] : null,
          }),
          signal: AbortSignal.timeout(75_000),
        })
        const data = await res.json() as { ok: boolean; url?: string; promptUsed?: string; model?: string; provider?: string; error?: string }
        if (data.ok && data.url) {
          setTabResult(tab, {
            type: 'image', url: data.url,
            prompt: data.promptUsed || prompt,
            model:    maskedModel(data.model || 'img2img'),
            provider: maskedProvider(data.provider || ''),
          })
          ok = true
        }
      } catch { /* timeout */ }
      if (!ok) {
        // Fallback: Pollinations img2img
        setProgress('🔄 نموذج احتياطي...')
        try {
          const seed    = Math.floor(Math.random() * 9_000_000)
          const encoded = encodeURIComponent(`${prompt}, ultra detailed, photorealistic, high quality`)
          const url     = `https://image.pollinations.ai/prompt/${encoded}?model=flux-realism&width=${width}&height=${height}&seed=${seed}&nologo=true`
          setTabResult(tab, {
            type: 'image', url,
            prompt, model: 'DZ MEDIA BASIC', provider: 'DZ MEDIA BASIC',
          })
        } catch {
          setTabError(tab, 'فشل التعديل — جرّب مجدداً')
        }
      }

    /* ─── نص → فيديو ─────────────────────────────────── */
    } else if (tab === 'text2video') {
      setProgress('🎬 جاري توليد الفيديو... (30-120 ثانية)')
      let ok = false
      try {
        const res  = await fetch('/api/dz-agent-v4/video', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, model: vidModel || undefined, width, height }),
          signal: AbortSignal.timeout(130_000),
        })
        const data = await res.json() as {
          ok: boolean; url?: string; frames?: string[]; isFrames?: boolean
          model?: string; provider?: string; mimeType?: string; error?: string; rateLimited?: boolean; note?: string
        }
        if (data.rateLimited) { setTabError(tab, data.error || 'تجاوزت الحصة اليومية'); }
        else if (data.ok && data.url) {
          setTabResult(tab, {
            type: 'video',
            url: data.url, frames: data.frames, isFrames: data.isFrames,
            prompt,
            model:    maskedModel(data.model || 'video'),
            provider: maskedProvider(data.provider || ''),
            mimeType: data.mimeType, note: data.note,
          })
          ok = true
        }
      } catch { /* timeout */ }
      if (!ok && !currentError) {
        // Fallback: إطارات سينمائية
        setProgress('🔄 نموذج احتياطي — إطارات سينمائية...')
        const seed   = Math.floor(Math.random() * 9_000_000)
        const styles = ['wide establishing shot, cinematic, golden hour', 'medium shot, soft bokeh, cinematic lighting', 'close-up, cinematic, ultra sharp']
        const frames = styles.map((s, i) =>
          `https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt}, ${s}`)}?model=flux&width=${width}&height=${height}&seed=${seed + i * 7919}&nologo=true`
        )
        setTabResult(tab, {
          type: 'video', url: frames[0], frames, isFrames: true,
          prompt, model: 'DZ MEDIA BASIC', provider: 'DZ MEDIA BASIC', note: 'إطارات سينمائية (أضف HF_TOKEN لفيديو حقيقي)',
        })
      }

    /* ─── صورة → فيديو ───────────────────────────────── */
    } else if (tab === 'img2video') {
      setProgress('🎥 جاري تحريك الصورة... (30-120 ثانية)')
      let ok = false
      try {
        const res  = await fetch('/api/dz-agent-v4/img2video', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: imagePreview || imageUrl,
            prompt:   prompt || 'animate smoothly with natural motion',
            model:    vidModel || undefined,
          }),
          signal: AbortSignal.timeout(130_000),
        })
        const data = await res.json() as {
          ok: boolean; url?: string; frames?: string[]; isFrames?: boolean
          model?: string; provider?: string; mimeType?: string; error?: string; rateLimited?: boolean; note?: string
        }
        if (data.rateLimited) { setTabError(tab, data.error || 'تجاوزت الحصة') }
        else if (data.ok && data.url) {
          setTabResult(tab, {
            type: 'video', url: data.url, frames: data.frames, isFrames: data.isFrames,
            prompt: prompt || 'animate',
            model:    maskedModel(data.model || 'i2v'),
            provider: maskedProvider(data.provider || ''),
            mimeType: data.mimeType, note: data.note,
          })
          ok = true
        }
      } catch { /* timeout */ }
      if (!ok && !currentError) {
        setProgress('🔄 نموذج احتياطي...')
        const seed   = Math.floor(Math.random() * 9_000_000)
        const frames = [0,1,2,3].map(i =>
          `https://image.pollinations.ai/prompt/${encodeURIComponent(`${prompt || 'animate smoothly'}, cinematic frame ${i+1}`)}?model=flux-realism&width=768&height=432&seed=${seed + i * 12345}&nologo=true`
        )
        setTabResult(tab, {
          type: 'video', url: frames[0], frames, isFrames: true,
          prompt: prompt || 'animate', model: 'DZ MEDIA BASIC', provider: 'DZ MEDIA BASIC',
        })
      }
    }

    setLoading(false); setProgress('')
  }, [tab, prompt, model, vidModel, imageUrl, imagePreview, width, height, selectedModel, currentError, refreshQuota])

  const downloadVideo = () => {
    if (!vidResult) return
    const url = vidResult.isFrames ? vidResult.frames?.[frameIdx] || vidResult.url : vidResult.url
    const a   = document.createElement('a')
    a.href = url; a.download = `dz-video-${Date.now()}.${vidResult.mimeType?.includes('gif') ? 'gif' : 'mp4'}`
    a.target = '_blank'; a.click()
  }

  /* ════════════════════════════════ JSX ════════════════════════════════ */
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
          صور وفيديو بالذكاء الاصطناعي — DZ MEDIA PRO · DZ MEDIA · DZ MEDIA BASIC
        </p>
      </header>

      {/* شريط الحصة */}
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

      {/* التبويبات */}
      <div className="dms-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`dms-tab dms-tab--${t.id}${tab === t.id ? ' dms-tab--active' : ''}`}
            onClick={() => handleTabChange(t.id)}
            style={tab === t.id ? { borderColor: `${t.color}66`, color: t.color, background: `${t.color}15` } : {}}
          >
            <span className="dms-tab-icon">{t.icon}</span>
            <span className="dms-tab-label">{t.label}</span>
            {/* نقطة النتيجة الجاهزة */}
            {results[t.id] && tab !== t.id && (
              <span className="dms-tab-dot" style={{ background: t.color }} />
            )}
          </button>
        ))}
      </div>

      <div className="dms-body">

        {/* ══════ لوحة الإدخال ══════ */}
        <div className="dms-panel">
          <p className="dms-tab-desc">
            <span style={{ color: currentTab.color }}>{currentTab.icon}</span> {currentTab.desc}
          </p>

          {/* رفع الصورة — img2img + img2video */}
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

          {/* اختيار نموذج الصور */}
          {tab === 'text2img' && (
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
                  ✨ نموذج DZ MEDIA PRO — يستهلك من حصة <strong>{quota?.premium.remaining ?? '?'}</strong> متبقية
                  {quota?.premium.remaining === 0 && <span style={{ color: '#ef4444', marginRight: 8 }}>⚠️ نفدت — اختر DZ MEDIA</span>}
                </div>
              )}
            </div>
          )}

          {/* اختيار نموذج الفيديو */}
          {isVideoTab && (
            <div className="dms-section">
              <label className="dms-label">🎬 نموذج DZ MEDIA</label>
              <div className="dms-vid-model-grid">
                {vidModelList.map(m => (
                  <button
                    key={m.id}
                    className={`dms-vid-model-card${vidModel === m.id ? ' dms-vid-model-card--active' : ''}`}
                    onClick={() => setVidModel(vidModel === m.id ? '' : m.id)}
                    style={vidModel === m.id ? { borderColor: m.color, boxShadow: `0 0 0 1px ${m.color}22` } : {}}
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
                ⚡ اختر نموذجاً أو اترك "Auto" — يتم الانتقال التلقائي عند الفشل
              </div>
            </div>
          )}

          {/* مقياس الإطار (للصور) */}
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

          {currentError && <div className="dms-error">⚠️ {currentError}</div>}
          {loading      && <div className="dms-progress">{progress || '⏳ جاري العمل...'}</div>}

          <button className="dms-generate-btn" onClick={handleGenerate} disabled={loading}
            style={{ background: loading ? undefined : `linear-gradient(135deg, ${currentTab.color}, ${currentTab.color}bb)` }}>
            {loading
              ? <><span className="dms-spinner" /> {progress || 'جاري...'}</>
              : <>{currentTab.icon} {
                  tab === 'text2img'   ? 'ولّد الصورة' :
                  tab === 'img2img'    ? 'حوّل الصورة' :
                  tab === 'text2video' ? 'ولّد الفيديو' :
                  'حرّك الصورة'
                }</>
            }
          </button>
          <p className="dms-hint">Ctrl+Enter للتوليد السريع</p>
        </div>

        {/* ══════ لوحة النتيجة — إطار خاص بكل تبويب ══════ */}
        <div className={`dms-result-panel dms-result-panel--${tab}`}>

          {/* ── حالة فارغة ── */}
          {!currentResult && !loading && (
            <div className="dms-empty-state">
              <div className="dms-empty-icon" style={{ color: currentTab.color }}>{currentTab.icon}</div>
              <p className="dms-empty-title" style={{ color: currentTab.color }}>
                {isVideoTab ? 'الفيديو سيظهر هنا' : 'الصورة ستظهر هنا'}
              </p>
              <p className="dms-empty-sub">
                {tab === 'text2img'   ? 'اكتب وصفاً واختر نموذجاً وانقر "ولّد الصورة"' :
                 tab === 'img2img'    ? 'ارفع صورة وأضف وصف التعديل' :
                 tab === 'text2video' ? 'اكتب وصف المشهد وانقر "ولّد الفيديو"' :
                 'ارفع صورة وانقر "حرّك الصورة"'}
              </p>
              {/* عرض نتائج التبويبات الأخرى كإشارات */}
              <div className="dms-other-results-hint">
                {(Object.entries(results) as [Tab, Result][]).filter(([t]) => t !== tab).map(([t, r]) => {
                  const ti = TABS.find(x => x.id === t)!
                  return r ? (
                    <button key={t} className="dms-other-tab-badge" onClick={() => setTab(t)} style={{ borderColor: `${ti.color}44` }}>
                      {ti.icon} {ti.label} — جاهز
                    </button>
                  ) : null
                })}
              </div>
            </div>
          )}

          {/* ── جاري التحميل ── */}
          {loading && (
            <div className="dms-loading-anim">
              <div className="dms-loading-ring" style={{ borderTopColor: currentTab.color }} />
              <p className="dms-loading-text">{progress || '⏳ جاري التوليد...'}</p>
              <p className="dms-loading-sub">
                {isVideoTab ? 'الفيديو قد يستغرق 30-120 ثانية' : 'قد يستغرق 10-60 ثانية حسب النموذج'}
              </p>
            </div>
          )}

          {/* ── النتيجة ── */}
          {currentResult && (
            <div className="dms-result-card">

              {/* صورة */}
              {currentResult.type === 'image' && (
                <div className="dms-result-img-wrap">
                  <img
                    src={currentResult.url} alt={currentResult.prompt}
                    className="dms-result-img" loading="eager"
                    onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
                  />
                </div>
              )}

              {/* فيديو */}
              {currentResult.type === 'video' && (
                <div className="dms-result-img-wrap">
                  {vidResult?.isFrames ? (
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
                    <video
                      ref={videoRef}
                      src={vidResult?.url}
                      className="dms-result-video"
                      controls autoPlay loop muted playsInline
                    />
                  )}
                </div>
              )}

              {/* مؤشر النموذج */}
              <div className="dms-result-meta">
                <span className="dms-result-model" style={{ color: currentTab.color }}>
                  {currentResult.type === 'video' ? '🎬' : '✨'} {currentResult.model}
                </span>
                <span className="dms-result-sep">·</span>
                <span className="dms-result-provider">{currentResult.provider}</span>
              </div>

              {/* الوصف المترجم */}
              {currentResult.type === 'image' && (currentResult as ImageResult).translatedPrompt && (
                <div className="dms-translated-box">
                  <span className="dms-translated-title">🔤 تُرجم تلقائياً:</span>
                  <span className="dms-translated-text" dir="ltr">"{(currentResult as ImageResult).translatedPrompt}"</span>
                </div>
              )}

              {/* أزرار الإجراءات */}
              <div className="dms-result-actions">
                {currentResult.type === 'image' ? (
                  <>
                    <a href={currentResult.url} download={`dz-media-${Date.now()}.png`}
                      target="_blank" rel="noopener noreferrer" className="dms-action-btn dms-action-btn--dl">
                      ⬇ تحميل
                    </a>
                    <button className="dms-action-btn dms-action-btn--use"
                      onClick={() => { setImagePreview(currentResult.url); setImageUrl(currentResult.url); handleTabChange('img2img') }}>
                      🖼️ تعديل
                    </button>
                    <button className="dms-action-btn dms-action-btn--vid"
                      onClick={() => { setImagePreview(currentResult.url); setImageUrl(currentResult.url); handleTabChange('img2video') }}>
                      🎥 تحريك
                    </button>
                    <button className="dms-action-btn" onClick={handleGenerate} disabled={loading}>🔄 جديد</button>
                  </>
                ) : (
                  <>
                    <button className="dms-action-btn dms-action-btn--dl" onClick={downloadVideo}>⬇ تحميل</button>
                    {vidResult?.isFrames && (
                      <button className="dms-action-btn dms-action-btn--use"
                        onClick={() => {
                          const u = vidResult.frames?.[frameIdx] || vidResult.url
                          setImagePreview(u); setImageUrl(u); handleTabChange('img2img')
                        }}>🖼️ تعديل إطار</button>
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
        <span className="dms-footer-text">DZ MEDIA STUDIO 2026 — PRO · BASIC · AI</span>
        <span className="dms-footer-flag"> 🇩🇿</span>
      </footer>
    </div>
  )
}

/* ── مساعدات إخفاء أسماء المصادر ── */
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
  if (r.includes('gpt') || r.includes('openai') || r.includes('vision')) return 'DZ MEDIA PRO Vision'
  if (r.includes('pollinations') || r.includes('basic')) return 'DZ MEDIA BASIC'
  if (r.includes('flux') || r.includes('hugging') || r.includes('stable') || r.includes('realvis')) return 'DZ MEDIA FLUX'
  if (r.includes('open-sora') || r.includes('opensora')) return 'DZ MEDIA Pro Video'
  if (r.includes('animate') || r.includes('animatediff')) return 'DZ MEDIA Classic'
  if (r.includes('ltx') || r.includes('modelscope')) return 'DZ MEDIA Fast'
  if (r.includes('svd') || r.includes('img2vid')) return 'DZ MEDIA Smooth'
  if (r.includes('i2vgen') || r.includes('i2v')) return 'DZ MEDIA Balance'
  return 'DZ MEDIA'
}
