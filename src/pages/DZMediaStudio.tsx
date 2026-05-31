import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/dz-media-studio.css'

type Tab = 'text2img' | 'img2img' | 'text2video' | 'img2video'

const TABS: { id: Tab; label: string; icon: string; desc: string }[] = [
  { id: 'text2img',   label: 'نص → صورة',   icon: '🎨', desc: 'وصف مشهدك وسيولّد لك FLUX صورة احترافية' },
  { id: 'img2img',    label: 'صورة → صورة', icon: '🖼️', desc: 'حوّل أو عدّل صورة موجودة بوصف نصي' },
  { id: 'text2video', label: 'نص → فيديو',  icon: '🎬', desc: 'ولّد فيديو قصير من وصف نصي — مجاني' },
  { id: 'img2video',  label: 'صورة → فيديو', icon: '📽️', desc: 'حرّك صورة ثابتة وحوّلها لفيديو' },
]

const POLLINATIONS_MODELS = [
  { id: 'flux',         label: '⚡ Flux' },
  { id: 'turbo',        label: '🚀 Turbo' },
  { id: 'flux-realism', label: '📸 Realism' },
  { id: 'flux-anime',   label: '🌸 Anime' },
  { id: 'flux-3d',      label: '🧊 3D' },
]

interface Quota {
  remaining: number
  used: number
  limit: number
  resetInHours: number
}

interface Result {
  type: 'image' | 'video'
  url: string
  prompt: string
  model: string
  provider: string
  error?: string
}

export default function DZMediaStudio() {
  const navigate = useNavigate()
  const [tab, setTab]               = useState<Tab>('text2img')
  const [prompt, setPrompt]         = useState('')
  const [model, setModel]           = useState('flux')
  const [imageUrl, setImageUrl]     = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [width, setWidth]           = useState(768)
  const [height, setHeight]         = useState(768)
  const [loading, setLoading]       = useState(false)
  const [result, setResult]         = useState<Result | null>(null)
  const [error, setError]           = useState('')
  const [progress, setProgress]     = useState('')
  const [quota, setQuota]           = useState<Quota | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isVideoTab = tab === 'text2video' || tab === 'img2video'

  // جلب حصة الفيديو عند تغيير التبويب لفيديو
  useEffect(() => {
    if (!isVideoTab) return
    fetch('/api/dz-agent-v4/video/quota')
      .then(r => r.json())
      .then(d => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})
  }, [isVideoTab])

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

    setLoading(true); setError(''); setResult(null)

    try {
      if (tab === 'text2img') {
        setProgress('🎨 جاري توليد الصورة عبر Pollinations FLUX...')
        const seed = Math.floor(Math.random() * 999999)
        const url  = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
          + `?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false`
        setResult({ type: 'image', url, prompt, model: `pollinations/${model}`, provider: 'Pollinations AI' })
        setProgress('')

      } else if (tab === 'img2img') {
        setProgress('🖼️ جاري تعديل الصورة...')
        const res = await fetch('/api/dz-agent-v4/img2img', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            imageUrl: imagePreview || imageUrl,
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
        setProgress('🎬 جاري توليد الفيديو... قد يستغرق دقيقة أو دقيقتين')
        const res = await fetch('/api/dz-agent-v4/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, width, height, duration: 3 }),
          signal: AbortSignal.timeout(90_000),
        })
        const data = await res.json() as { ok: boolean; url?: string; model?: string; provider?: string; error?: string; rateLimited?: boolean; quota?: Quota }
        if (data.quota) setQuota(data.quota)
        if (data.ok && data.url) {
          setResult({ type: 'video', url: data.url, prompt, model: data.model || 'video', provider: data.provider || '' })
        } else if (data.rateLimited) {
          setError(data.error || 'تجاوزت الحدّ اليومي')
        } else {
          setError(data.error || 'توليد الفيديو غير متاح حالياً. تأكد من وجود HF_TOKEN.')
        }

      } else if (tab === 'img2video') {
        setProgress('📽️ جاري تحويل الصورة لفيديو...')
        const res = await fetch('/api/dz-agent-v4/img2video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: imagePreview || imageUrl, prompt: prompt || 'animate smoothly' }),
          signal: AbortSignal.timeout(90_000),
        })
        const data = await res.json() as { ok: boolean; url?: string; model?: string; provider?: string; error?: string; rateLimited?: boolean; quota?: Quota }
        if (data.quota) setQuota(data.quota)
        if (data.ok && data.url) {
          setResult({ type: 'video', url: data.url, prompt, model: data.model || 'img2video', provider: data.provider || '' })
        } else if (data.rateLimited) {
          setError(data.error || 'تجاوزت الحدّ اليومي')
        } else {
          setError(data.error || 'تحويل الصورة لفيديو يتطلب HF_TOKEN مع رصيد.')
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('AbortError') ? 'انتهت مهلة الطلب — حاول مجدداً' : msg)
    } finally {
      setLoading(false); setProgress('')
    }
  }, [tab, prompt, model, imageUrl, imagePreview, width, height])

  const currentTab = TABS.find(t => t.id === tab)!

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
            onClick={() => { setTab(t.id); setResult(null); setError('') }}
          >
            <span className="dms-tab-icon">{t.icon}</span>
            <span className="dms-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="dms-body">
        <div className="dms-panel">
          <p className="dms-tab-desc">{currentTab.icon} {currentTab.desc}</p>

          {/* شريط الحصة اليومية للفيديو */}
          {isVideoTab && quota && (
            <div className={`dms-quota-bar ${quota.remaining === 0 ? 'dms-quota-bar--empty' : ''}`}>
              <div className="dms-quota-info">
                <span>🎬 الحصة اليومية</span>
                <span className="dms-quota-count">
                  {quota.remaining === 0
                    ? `⏳ انتهت — تجديد خلال ${quota.resetInHours}س`
                    : `${quota.remaining} متبق من ${quota.limit}`}
                </span>
              </div>
              <div className="dms-quota-track">
                <div
                  className="dms-quota-fill"
                  style={{ width: `${(quota.used / quota.limit) * 100}%` }}
                />
              </div>
            </div>
          )}

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

          {tab === 'text2img' && (
            <div className="dms-models-row">
              <label className="dms-label">النموذج:</label>
              <div className="dms-model-btns">
                {POLLINATIONS_MODELS.map(m => (
                  <button
                    key={m.id}
                    className={`dms-model-btn${model === m.id ? ' dms-model-btn--active' : ''}`}
                    onClick={() => setModel(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(tab === 'text2img' || tab === 'text2video') && (
            <div className="dms-size-row">
              <label className="dms-label">الحجم:</label>
              <div className="dms-size-btns">
                {([[512,512,'مربع'], [768,768,'HD'], [1024,1024,'FHD'], [1024,576,'أفقي'], [576,1024,'عمودي']] as [number,number,string][]).map(([w,h,lbl]) => (
                  <button
                    key={`${w}x${h}`}
                    className={`dms-size-btn${width === w && height === h ? ' dms-size-btn--active' : ''}`}
                    onClick={() => { setWidth(w); setHeight(h) }}
                  >
                    {lbl}<br /><small>{w}×{h}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isVideoTab && (
            <div className="dms-video-providers">
              <span className="dms-label">مزودو الفيديو المجانيون:</span>
              <div className="dms-provider-chips">
                <span className="dms-chip">🌊 Pollinations</span>
                <span className="dms-chip">⚡ Zeroscope</span>
                <span className="dms-chip">🤗 HuggingFace</span>
              </div>
            </div>
          )}

          {error && <div className="dms-error">⚠️ {error}</div>}
          {loading && <div className="dms-progress">{progress || '⏳ جاري التوليد...'}</div>}

          <button
            className="dms-generate-btn"
            onClick={handleGenerate}
            disabled={loading || (isVideoTab && quota?.remaining === 0)}
          >
            {loading ? (
              <><span className="dms-spinner" /> {progress || 'جاري التوليد...'}</>
            ) : isVideoTab && quota?.remaining === 0 ? (
              <>⏳ انتهت الحصة — خلال {quota.resetInHours}س</>
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
              {result.type === 'image' && (
                <img
                  src={result.url}
                  alt={result.prompt}
                  className="dms-result-img"
                  loading="lazy"
                  onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
                />
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
              <div className="dms-result-actions">
                <a
                  href={result.url}
                  download={`dz-media-${Date.now()}.${result.type === 'video' ? 'mp4' : 'jpg'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dms-action-btn dms-action-btn--dl"
                >
                  ⬇ تحميل
                </a>
                {result.type === 'image' && (
                  <button
                    className="dms-action-btn dms-action-btn--use"
                    onClick={() => { setImagePreview(result.url); setImageUrl(result.url); setTab('img2img') }}
                  >
                    🔄 img2img
                  </button>
                )}
                {result.type === 'image' && (
                  <button
                    className="dms-action-btn dms-action-btn--vid"
                    onClick={() => { setImagePreview(result.url); setImageUrl(result.url); setTab('img2video') }}
                  >
                    🎬 فيديو
                  </button>
                )}
                <button
                  className="dms-action-btn"
                  onClick={() => handleGenerate()}
                  disabled={loading}
                >
                  🔄 جديد
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
