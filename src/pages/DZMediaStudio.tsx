import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/dz-media-studio.css'

type Tab = 'text2img' | 'img2img' | 'text2video' | 'img2video'
type ImgProvider = 'pollinations' | 'aifree'

const TABS: { id: Tab; label: string; icon: string; desc: string }[] = [
  { id: 'text2img',   label: 'نص → صورة',    icon: '🎨', desc: 'وصف مشهدك وسيولّد لك صورة احترافية' },
  { id: 'img2img',    label: 'صورة → صورة',  icon: '🖼️', desc: 'حوّل أو عدّل صورة موجودة بوصف نصي' },
  { id: 'text2video', label: 'نص → فيديو',   icon: '🎬', desc: 'ولّد فيديو قصير من وصف نصي — مجاني' },
  { id: 'img2video',  label: 'صورة → فيديو', icon: '📽️', desc: 'حرّك صورة ثابتة وحوّلها لفيديو' },
]

const POLLINATIONS_MODELS = [
  { id: 'flux',         label: '⚡ Flux' },
  { id: 'turbo',        label: '🚀 Turbo' },
  { id: 'flux-realism', label: '📸 Realism' },
  { id: 'flux-anime',   label: '🌸 Anime' },
  { id: 'flux-3d',      label: '🧊 3D' },
]

const AIFREE_DEFAULT_MODELS = [
  { id: 'flux-schnell',                 label: '⚡ FLUX Schnell',   badge: 'FAST' },
  { id: 'flux-dev',                     label: '🎯 FLUX Dev',       badge: 'HD'   },
  { id: 'stable-diffusion-3.5-large',   label: '🖼️ SD 3.5 Large',  badge: 'NEW'  },
  { id: 'stable-diffusion-3.5-medium',  label: '🖼️ SD 3.5 Medium', badge: ''     },
  { id: 'sdxl-lightning',               label: '⚡ SDXL Lightning', badge: ''     },
  { id: 'playground-v2.5',              label: '🎮 Playground 2.5', badge: ''     },
  { id: 'juggernaut-xl',                label: '💪 Juggernaut XL',  badge: ''     },
  { id: 'realvisxl',                    label: '📷 RealVis XL',     badge: 'REAL' },
]

interface AspectPreset {
  label: string; sub: string; w: number; h: number; shape: 'tall'|'square'|'wide'|'photo'
}
const IMG_PRESETS: AspectPreset[] = [
  { label: 'عمودي',  sub: '9:16', w: 576,  h: 1024, shape: 'tall' },
  { label: 'مربع',   sub: '1:1',  w: 768,  h: 768,  shape: 'square' },
  { label: 'أفقي',   sub: '16:9', w: 1024, h: 576,  shape: 'wide' },
  { label: 'كلاسيك', sub: '4:3',  w: 1024, h: 768,  shape: 'photo' },
]
const VID_PRESETS: AspectPreset[] = [
  { label: 'عمودي', sub: '9:16', w: 320, h: 576, shape: 'tall' },
  { label: 'مربع',  sub: '1:1',  w: 512, h: 512, shape: 'square' },
  { label: 'أفقي',  sub: '16:9', w: 576, h: 320, shape: 'wide' },
]

interface Quota { remaining: number; used: number; limit: number; resetInHours: number }
interface VideoModel {
  id: string; hfId: string; label: string; badge: string; color: string
  status: 'available' | 'loading' | 'unavailable' | 'unknown'
}
interface Result {
  type: 'image' | 'video' | 'gif' | 'frames'
  url: string; prompt: string; model: string; provider: string; error?: string
  frames?: string[]; note?: string
}

// ── مكوّن عرض الإطارات كـ slideshow ─────────────────────────────────────────
function FrameSlideshow({ frames, alt }: { frames: string[]; alt: string }) {
  const [idx, setIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (frames.length <= 1) return
    timerRef.current = setInterval(() => setIdx(i => (i + 1) % frames.length), 600)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [frames])

  return (
    <div style={{ position: 'relative' }}>
      <img
        src={frames[idx]}
        alt={alt}
        className="dms-result-img"
        loading="lazy"
        onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
      />
      <div style={{
        position: 'absolute', bottom: 8, right: 8,
        background: 'rgba(0,0,0,0.6)', color: '#fff',
        fontSize: 11, padding: '2px 8px', borderRadius: 8, direction: 'ltr',
      }}>
        {idx + 1}/{frames.length}
      </div>
    </div>
  )
}

export default function DZMediaStudio() {
  const navigate = useNavigate()
  const [tab, setTab]                   = useState<Tab>('text2img')
  const [prompt, setPrompt]             = useState('')
  const [imgProvider, setImgProvider]   = useState<ImgProvider>('pollinations')
  const [imgModel, setImgModel]         = useState('flux')
  const [aifreeModel, setAifreeModel]   = useState('flux-schnell')
  const [aifreeModels, setAifreeModels] = useState(AIFREE_DEFAULT_MODELS)
  const [aifreeStatus, setAifreeStatus] = useState<'idle'|'loading'|'online'|'offline'>('idle')
  const [videoModelId, setVideoModelId] = useState<string>('auto')
  const [imageUrl, setImageUrl]         = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [width, setWidth]               = useState(768)
  const [height, setHeight]             = useState(768)
  const [loading, setLoading]             = useState(false)
  const [result, setResult]               = useState<Result | null>(null)
  const [error, setError]                 = useState('')
  const [progress, setProgress]           = useState('')
  const [translatedPrompt, setTranslatedPrompt] = useState<string | null>(null)
  const [quota, setQuota]               = useState<Quota | null>(null)
  const [t2vModels, setT2vModels]       = useState<VideoModel[]>([])
  const [i2vModels, setI2vModels]       = useState<VideoModel[]>([])
  const [hasToken, setHasToken]         = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const isVideoTab = tab === 'text2video' || tab === 'img2video'
  const presets    = isVideoTab ? VID_PRESETS : IMG_PRESETS

  // جلب نماذج الفيديو + الحصة عند الانتقال لتاب الفيديو
  useEffect(() => {
    if (!isVideoTab) return
    fetch('/api/dz-agent-v4/video/models')
      .then(r => r.json())
      .then(d => {
        if (d.t2v) setT2vModels(d.t2v)
        if (d.i2v) setI2vModels(d.i2v)
        if (d.quota) setQuota(d.quota)
        if (d.hasToken !== undefined) setHasToken(d.hasToken)
      })
      .catch(() => {
        fetch('/api/dz-agent-v4/video/quota')
          .then(r => r.json())
          .then(d => { if (d.quota) setQuota(d.quota) })
          .catch(() => {})
      })
  }, [isVideoTab])

  // جلب نماذج AiFreeForever عند اختيار المزود
  useEffect(() => {
    if (imgProvider !== 'aifree' || tab !== 'text2img') return
    if (aifreeStatus === 'loading' || aifreeStatus === 'online') return
    setAifreeStatus('loading')
    fetch('/api/dz-media/aifree/models')
      .then(r => r.json())
      .then(d => {
        if (d.models?.length) setAifreeModels(d.models.map((m: {id:string;label:string;badge?:string}) => ({
          ...m, label: m.label || m.id, badge: m.badge || ''
        })))
        setAifreeStatus('online')
      })
      .catch(() => setAifreeStatus('offline'))
  }, [imgProvider, tab, aifreeStatus])

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab)
    setResult(null)
    setError('')
    const nextVideo = newTab === 'text2video' || newTab === 'img2video'
    if (nextVideo) { setWidth(512); setHeight(288) }
    else { setWidth(768); setHeight(768) }
  }

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const src = ev.target?.result as string
      setImagePreview(src)
      if (src.startsWith('http')) setImageUrl(src)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && tab !== 'img2video') {
      setError('الرجاء كتابة وصف للصورة/الفيديو'); return
    }
    if ((tab === 'img2img' || tab === 'img2video') && !imageUrl && !imagePreview) {
      setError('الرجاء رفع صورة أو إدخال رابطها'); return
    }
    setLoading(true); setError(''); setResult(null); setTranslatedPrompt(null)

    try {
      if (tab === 'text2img') {
        if (imgProvider === 'aifree') {
          const hasArabic = /[\u0600-\u06FF]/.test(prompt)
          setProgress(
            hasArabic
              ? `🔤 جاري ترجمة الوصف للإنجليزية... ثم توليد الصورة عبر AiFreeForever (${aifreeModel})`
              : `🖼️ جاري توليد الصورة عبر AiFreeForever (${aifreeModel}) — قد يستغرق دقيقة...`
          )
          const res  = await fetch('/api/dz-media/aifree/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model: aifreeModel, width, height }),
            signal: AbortSignal.timeout(110_000),
          })
          const data = await res.json() as {
            ok: boolean; imageUrl?: string; model?: string; provider?: string; error?: string
            translatedPrompt?: string; originalPrompt?: string; detectedLang?: string
          }
          if (data.ok && data.imageUrl) {
            if (data.translatedPrompt) setTranslatedPrompt(data.translatedPrompt)
            setResult({ type: 'image', url: data.imageUrl, prompt, model: data.model || aifreeModel, provider: 'AiFreeForever' })
          } else {
            setError(data.error || 'فشل التوليد عبر AiFreeForever — جرّب نموذجاً آخر أو انتظر قليلاً')
          }
        } else {
          setProgress('🎨 جاري توليد الصورة عبر Pollinations FLUX...')
          const seed = Math.floor(Math.random() * 999999)
          const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
            + `?model=${imgModel}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false`
          setResult({ type: 'image', url, prompt, model: `pollinations/${imgModel}`, provider: 'Pollinations AI' })
        }
        setProgress('')

      } else if (tab === 'img2img') {
        setProgress('🖼️ جاري تعديل الصورة...')
        const res  = await fetch('/api/dz-agent-v4/img2img', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            imageUrl:    imagePreview || imageUrl,
            imageBase64: imagePreview?.startsWith('data:') ? imagePreview.split(',')[1] : null,
          }),
          signal: AbortSignal.timeout(60_000),
        })
        const data = await res.json() as { ok: boolean; url?: string; promptUsed?: string; model?: string; provider?: string; error?: string }
        if (data.ok && data.url) {
          setResult({ type: 'image', url: data.url, prompt: data.promptUsed || prompt, model: data.model || 'img2img', provider: data.provider || '' })
        } else {
          setError(data.error || 'فشل التحويل، حاول مجدداً')
        }

      } else if (tab === 'text2video') {
        const modelName = videoModelId !== 'auto'
          ? (t2vModels.find(m => m.id === videoModelId)?.label || videoModelId)
          : 'Auto'
        setProgress(`🎬 جاري التوليد بنموذج ${modelName}... قد يستغرق 3 دقائق`)
        const res  = await fetch('/api/dz-agent-v4/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt, width, height, duration: 3,
            model: videoModelId !== 'auto' ? videoModelId : undefined,
          }),
          signal: AbortSignal.timeout(360_000),
        })
        const data = await res.json() as { ok: boolean; url?: string; frames?: string[]; isFrames?: boolean; model?: string; provider?: string; error?: string; rateLimited?: boolean; quota?: Quota; note?: string }
        if (data.quota) setQuota(data.quota)
        if (data.ok && data.url) {
          const rType = data.isFrames ? 'frames' : data.url.includes('gif') ? 'gif' : 'video'
          const rModel = data.isFrames ? `${data.model || 'DZ Cinematic'} — إطارات` : (data.model || 'video')
          setResult({ type: rType, url: data.url, frames: data.frames, prompt, model: rModel, provider: data.provider || '', note: data.note })
          if (data.model && !data.isFrames) {
            setT2vModels(prev => prev.map(m => m.label === data.model ? { ...m, status: 'available' } : m))
          }
        } else if (data.rateLimited) {
          setError(data.error || 'تجاوزت الحدّ اليومي')
        } else {
          setError(data.error || 'توليد الفيديو غير متاح حالياً.')
        }

      } else if (tab === 'img2video') {
        const modelName = videoModelId !== 'auto'
          ? (i2vModels.find(m => m.id === videoModelId)?.label || videoModelId)
          : 'Auto'
        setProgress(`📽️ جاري التحويل بنموذج ${modelName}... قد يستغرق 3 دقائق`)
        const res  = await fetch('/api/dz-agent-v4/img2video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: imagePreview || imageUrl,
            prompt:   prompt || 'animate smoothly',
            model:    videoModelId !== 'auto' ? videoModelId : undefined,
          }),
          signal: AbortSignal.timeout(360_000),
        })
        const data = await res.json() as { ok: boolean; url?: string; frames?: string[]; isFrames?: boolean; model?: string; provider?: string; error?: string; rateLimited?: boolean; quota?: Quota; note?: string }
        if (data.quota) setQuota(data.quota)
        if (data.ok && data.url) {
          const rType  = data.isFrames ? 'frames' : 'video'
          const rModel = data.isFrames ? `${data.model || 'DZ Animate'} — إطارات` : (data.model || 'img2video')
          setResult({ type: rType, url: data.url, frames: data.frames, prompt, model: rModel, provider: data.provider || '', note: data.note })
        } else if (data.rateLimited) {
          setError(data.error || 'تجاوزت الحدّ اليومي')
        } else {
          setError(data.error || 'تحويل الصورة لفيديو غير متاح حالياً.')
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('AbortError') ? 'انتهت مهلة الطلب — حاول مجدداً' : msg)
    } finally {
      setLoading(false); setProgress('')
    }
  }, [tab, prompt, imgModel, videoModelId, imageUrl, imagePreview, width, height, t2vModels, i2vModels])

  const currentTab   = TABS.find(t => t.id === tab)!
  const isQuotaEmpty = isVideoTab && quota?.remaining === 0
  const activeVideoModels = tab === 'text2video' ? t2vModels : i2vModels

  // تحديد لون الحالة
  function statusColor(s: string) {
    if (s === 'available') return '#22c55e'
    if (s === 'loading')   return '#f59e0b'
    if (s === 'unavailable') return '#ef4444'
    return '#64748b'
  }
  function statusLabel(s: string) {
    if (s === 'available')   return '●'
    if (s === 'loading')     return '◎'
    if (s === 'unavailable') return '●'
    return '○'
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
        <p className="dms-header-sub">توليد وتحويل الصور والفيديوهات بالذكاء الاصطناعي</p>
      </header>

      <div className="dms-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`dms-tab${tab === t.id ? ' dms-tab--active' : ''}`}
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

          {/* شريط الحصة اليومية */}
          {isVideoTab && quota && (
            <div className={`dms-quota-bar${isQuotaEmpty ? ' dms-quota-bar--empty' : ''}`}>
              <div className="dms-quota-info">
                <span>🎬 حصتك اليومية</span>
                <span className="dms-quota-count">
                  {isQuotaEmpty
                    ? `⏳ انتهت — تجديد خلال ${quota.resetInHours}س`
                    : `${quota.remaining} متبق من ${quota.limit}/يوم`}
                </span>
              </div>
              <div className="dms-quota-track">
                <div className="dms-quota-fill" style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }} />
              </div>
            </div>
          )}

          {/* رفع صورة */}
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
                className="dms-input"
                type="url"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
              />
            </div>
          )}

          {/* وصف النص */}
          <div className="dms-prompt-wrap">
            <label className="dms-label">
              {tab === 'img2video' ? '✏️ وصف الحركة (اختياري)' : '✏️ وصف الصورة / الفيديو'}
            </label>
            <textarea
              className="dms-textarea"
              rows={3}
              placeholder={
                tab === 'text2img'   ? 'مثال: قصبة الجزائر عند الغروب بألوان دافئة' :
                tab === 'img2img'    ? 'مثال: نفس الصورة لكن بأسلوب أنيمي ياباني' :
                tab === 'text2video' ? 'مثال: أمواج البحر الأزرق تتلاطم بهدوء' :
                                       'مثال: حركة بطيئة وناعمة من اليسار لليمين'
              }
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }}
            />
          </div>

          {/* اختيار مزود الصورة */}
          {tab === 'text2img' && (
            <div className="dms-section">
              <label className="dms-label">⚡ مزود التوليد</label>
              <div className="dms-model-btns" style={{ marginBottom: 10 }}>
                <button
                  className={`dms-model-btn${imgProvider === 'pollinations' ? ' dms-model-btn--active' : ''}`}
                  onClick={() => setImgProvider('pollinations')}
                >
                  🌸 Pollinations AI
                </button>
                <button
                  className={`dms-model-btn${imgProvider === 'aifree' ? ' dms-model-btn--active' : ''}`}
                  onClick={() => { setImgProvider('aifree'); setAifreeStatus('idle') }}
                  title="يستخدم تجاوز Cloudflare للوصول إلى aifreeforever.com"
                >
                  🔓 AiFreeForever
                  {aifreeStatus === 'online'   && <span style={{color:'#22c55e',marginRight:4}}>●</span>}
                  {aifreeStatus === 'loading'  && <span style={{color:'#f59e0b',marginRight:4}}>◎</span>}
                  {aifreeStatus === 'offline'  && <span style={{color:'#ef4444',marginRight:4}}>●</span>}
                </button>
              </div>

              {/* نماذج Pollinations */}
              {imgProvider === 'pollinations' && (
                <>
                  <label className="dms-label" style={{fontSize:12,opacity:0.7}}>النموذج</label>
                  <div className="dms-model-btns">
                    {POLLINATIONS_MODELS.map(m => (
                      <button
                        key={m.id}
                        className={`dms-model-btn${imgModel === m.id ? ' dms-model-btn--active' : ''}`}
                        onClick={() => setImgModel(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* نماذج AiFreeForever */}
              {imgProvider === 'aifree' && (
                <>
                  <div style={{fontSize:12,opacity:0.65,marginBottom:6,direction:'rtl'}}>
                    🔓 يتجاوز حماية Cloudflare تلقائياً — أول طلب قد يأخذ 30 ث للتهيئة
                    {aifreeStatus === 'loading' && ' · جارٍ الاتصال...'}
                    {aifreeStatus === 'online'  && ' · ✅ متصل'}
                    {aifreeStatus === 'offline' && ' · ⚠️ غير متاح حالياً'}
                  </div>
                  <div className="dms-model-btns" style={{flexWrap:'wrap'}}>
                    {aifreeModels.map(m => (
                      <button
                        key={m.id}
                        className={`dms-model-btn${aifreeModel === m.id ? ' dms-model-btn--active' : ''}`}
                        onClick={() => setAifreeModel(m.id)}
                        style={{position:'relative'}}
                      >
                        {m.label}
                        {m.badge && (
                          <span style={{
                            fontSize:9, background:'#7c3aed', color:'#fff',
                            borderRadius:4, padding:'1px 4px', marginRight:4,
                            verticalAlign:'middle',
                          }}>{m.badge}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ===== نماذج الفيديو ===== */}
          {isVideoTab && (
            <div className="dms-section">
              <label className="dms-label">🤖 اختر نموذج التوليد</label>

              {/* Open-Sora بانر رئيسي */}
              {tab === 'text2video' && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(132,204,22,0.12), rgba(34,197,94,0.08))',
                  border: '1px solid rgba(132,204,22,0.35)',
                  borderRadius: 10, padding: '10px 14px', marginBottom: 10,
                  direction: 'rtl', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 22 }}>🎬</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#65a30d', fontSize: 13 }}>
                      Open-Sora 2.0 — النموذج الرئيسي
                    </div>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                      نموذج مفتوح المصدر من{' '}
                      <a href="https://github.com/hpcaitech/Open-Sora" target="_blank" rel="noopener noreferrer"
                         style={{ color: '#84cc16', textDecoration: 'underline' }}>
                        hpcaitech/Open-Sora
                      </a>
                      {' '}— تلقائياً في كل مرة، مع AnimateDiff كاحتياط
                    </div>
                  </div>
                </div>
              )}

              {/* زر Auto */}
              <div className="dms-vid-model-grid">
                <button
                  className={`dms-vid-model-card${videoModelId === 'auto' ? ' dms-vid-model-card--active' : ''}`}
                  onClick={() => setVideoModelId('auto')}
                >
                  <span className="dms-vid-status" style={{ color: '#22c55e' }}>⟳</span>
                  <span className="dms-vid-name">Auto</span>
                  <span className="dms-vid-badge" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>تلقائي</span>
                </button>

                {activeVideoModels.map(m => (
                  <button
                    key={m.id}
                    className={`dms-vid-model-card${videoModelId === m.id ? ' dms-vid-model-card--active' : ''}`}
                    onClick={() => setVideoModelId(m.id)}
                    title={m.hfId || m.id}
                    style={m.id === 'opensora' ? { border: '1.5px solid rgba(132,204,22,0.5)' } : {}}
                  >
                    <span
                      className={`dms-vid-status${m.status === 'loading' ? ' dms-vid-status--pulse' : ''}`}
                      style={{ color: m.id === 'opensora' ? '#84cc16' : statusColor(m.status) }}
                    >
                      {m.id === 'opensora' ? '🔓' : statusLabel(m.status)}
                    </span>
                    <span className="dms-vid-name">{m.label}</span>
                    <span
                      className="dms-vid-badge"
                      style={{ background: `${m.color}22`, color: m.color }}
                    >
                      {m.badge}
                    </span>
                  </button>
                ))}
              </div>

              {/* مفتاح لون الحالة */}
              <div className="dms-status-legend">
                <span><span style={{ color: '#84cc16' }}>🔓</span> Open-Sora</span>
                <span><span style={{ color: '#22c55e' }}>●</span> متاح</span>
                <span><span style={{ color: '#f59e0b' }}>◎</span> يُحمَّل</span>
                <span><span style={{ color: '#ef4444' }}>●</span> غير متاح</span>
              </div>
            </div>
          )}

          {/* مقياس الإطار */}
          {(tab === 'text2img' || tab === 'text2video') && (
            <div className="dms-section">
              <label className="dms-label">مقياس الإطار</label>
              <div className="dms-aspect-row">
                {presets.map(p => {
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
          {loading && <div className="dms-progress">{progress || '⏳ جاري التوليد...'}</div>}

          <button
            className="dms-generate-btn"
            onClick={handleGenerate}
            disabled={loading || isQuotaEmpty}
          >
            {loading ? (
              <><span className="dms-spinner" /> {progress || 'جاري التوليد...'}</>
            ) : isQuotaEmpty ? (
              <>⏳ انتهت الحصة — خلال {quota!.resetInHours}س</>
            ) : (
              <>{currentTab.icon} {
                tab === 'text2img'   ? 'ولّد الصورة' :
                tab === 'img2img'    ? 'حوّل الصورة' :
                tab === 'text2video' ? 'ولّد الفيديو' :
                                       'حوّل لفيديو'
              }</>
            )}
          </button>
          <p className="dms-hint">Ctrl+Enter لتوليد سريع</p>
        </div>

        {/* ======= لوحة النتيجة ======= */}
        <div className="dms-result-panel">
          {!result && !loading && (
            <div className="dms-empty-state">
              <div className="dms-empty-icon">{currentTab.icon}</div>
              <p>النتيجة ستظهر هنا</p>
            </div>
          )}
          {loading && (
            <div className="dms-loading-anim">
              <div className="dms-loading-ring" />
              <p>{progress || 'جاري التوليد...'}</p>
            </div>
          )}
          {result && (
            <div className="dms-result-card">
              {(result.type === 'image' || result.type === 'gif') && (
                <img
                  src={result.url}
                  alt={result.prompt}
                  className="dms-result-img"
                  loading="lazy"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
                />
              )}
              {result.type === 'frames' && result.frames && result.frames.length > 0 && (
                <FrameSlideshow frames={result.frames} alt={result.prompt} />
              )}
              {result.type === 'video' && (
                <video
                  src={result.url}
                  className="dms-result-video"
                  controls
                  autoPlay
                  loop
                  playsInline
                />
              )}
              <div className="dms-result-meta">
                <span className="dms-result-model">✨ {result.model}</span>
                <span className="dms-result-provider">via {result.provider}</span>
              </div>
              {translatedPrompt && (
                <div style={{
                  background: 'rgba(124,58,237,0.08)',
                  border: '1px solid rgba(124,58,237,0.25)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  margin: '8px 0 0',
                  direction: 'rtl',
                  fontSize: 12,
                }}>
                  <div style={{ color: '#7c3aed', fontWeight: 700, marginBottom: 3 }}>
                    🔤 تُرجم تلقائياً للإنجليزية:
                  </div>
                  <div style={{ color: '#334155', fontStyle: 'italic', direction: 'ltr', textAlign: 'left' }}>
                    "{translatedPrompt}"
                  </div>
                </div>
              )}
              {result.note && (
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0', textAlign: 'center', direction: 'rtl' }}>
                  💡 {result.note}
                </p>
              )}
              <div className="dms-result-actions">
                <a
                  href={result.url}
                  download={`dz-media-${Date.now()}.${result.type === 'video' ? 'mp4' : result.type === 'gif' ? 'gif' : 'jpg'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dms-action-btn dms-action-btn--dl"
                >⬇ تحميل</a>
                {(result.type === 'image' || result.type === 'gif' || result.type === 'frames') && (
                  <button
                    className="dms-action-btn dms-action-btn--use"
                    onClick={() => { setImagePreview(result.url); setImageUrl(result.url); handleTabChange('img2img') }}
                  >🔄 img2img</button>
                )}
                {(result.type === 'image' || result.type === 'gif' || result.type === 'frames') && (
                  <button
                    className="dms-action-btn dms-action-btn--vid"
                    onClick={() => { setImagePreview(result.url); setImageUrl(result.url); handleTabChange('img2video') }}
                  >🎬 فيديو</button>
                )}
                <button className="dms-action-btn" onClick={() => handleGenerate()} disabled={loading}>
                  🔄 جديد
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="dms-footer">
        <span className="dms-footer-text">AI DZ MEDIA 2026 ®</span>
        <span className="dms-footer-flag"> 🇩🇿</span>
      </footer>
    </div>
  )
}
