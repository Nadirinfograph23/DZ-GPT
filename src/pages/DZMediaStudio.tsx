import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/dz-media-studio.css'

type Tab = 'text2img' | 'img2img'
type ImgProvider = 'pollinations' | 'aifree'

const TABS: { id: Tab; label: string; icon: string; desc: string }[] = [
  { id: 'text2img', label: 'نص → صورة',   icon: '🎨', desc: 'وصف مشهدك وسيولّد لك صورة احترافية' },
  { id: 'img2img',  label: 'صورة → صورة', icon: '🖼️', desc: 'حوّل أو عدّل صورة موجودة بوصف نصي' },
]

const POLLINATIONS_MODELS = [
  { id: 'flux',         label: '⚡ Flux' },
  { id: 'turbo',        label: '🚀 Turbo' },
  { id: 'flux-realism', label: '📸 Realism' },
  { id: 'flux-anime',   label: '🌸 Anime' },
  { id: 'flux-3d',      label: '🧊 3D' },
]

const AIFREE_DEFAULT_MODELS = [
  { id: 'flux',           label: '⚡ FLUX',            badge: 'FAST'      },
  { id: 'flux-realism',   label: '📸 FLUX Realism',   badge: 'REAL'      },
  { id: 'flux-anime',     label: '🌸 FLUX Anime',     badge: ''          },
  { id: 'turbo',          label: '🚀 Turbo',           badge: 'FAST'      },
  { id: 'gptimage',       label: '✨ GPT Image',       badge: 'GPT'       },
  { id: 'flux-schnell',   label: '⚡ FLUX Schnell',    badge: 'HF'        },
  { id: 'flux-dev',       label: '🎯 FLUX Dev',        badge: 'HD'        },
  { id: 'sd35-large',     label: '🖼️ SD 3.5 Large',   badge: 'HD'        },
  { id: 'sd35-medium',    label: '🖼️ SD 3.5 Medium',  badge: ''          },
  { id: 'sdxl-lightning', label: '⚡ SDXL Lightning',  badge: ''          },
  { id: 'playground',     label: '🎮 Playground 2.5',  badge: ''          },
  { id: 'juggernaut',     label: '💪 Juggernaut XL',   badge: ''          },
  { id: 'realvisxl',      label: '📷 RealVis XL',      badge: 'REAL'      },
  { id: 'seedream',       label: '🌱 Seedream',         badge: 'ByteDance' },
  { id: 'nano-banana-pro',label: '🍌 Nano Banana Pro', badge: 'PRO'       },
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

interface Result {
  type: 'image'
  url: string; prompt: string; model: string; provider: string; error?: string
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
  const [imageUrl, setImageUrl]         = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [width, setWidth]               = useState(768)
  const [height, setHeight]             = useState(768)
  const [loading, setLoading]           = useState(false)
  const [result, setResult]             = useState<Result | null>(null)
  const [error, setError]               = useState('')
  const [progress, setProgress]         = useState('')
  const [translatedPrompt, setTranslatedPrompt] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // جلب نماذج AiFreeForever عند اختيار المزود
  useEffect(() => {
    if (imgProvider !== 'aifree' || tab !== 'text2img') return
    if (aifreeStatus === 'loading' || aifreeStatus === 'online') return
    setAifreeStatus('loading')
    fetch('/api/dz-media/aifree/models')
      .then(r => r.json())
      .then(d => {
        if (d.models?.length) {
          setAifreeModels(d.models.map((m: {id:string;label:string;badge?:string}) => ({
            ...m, label: m.label || m.id, badge: m.badge || ''
          })))
        }
        setAifreeStatus('online')
      })
      .catch(() => setAifreeStatus('offline'))
  }, [imgProvider, tab, aifreeStatus])

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab)
    setResult(null)
    setError('')
    setWidth(768); setHeight(768)
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
    if (!prompt.trim()) {
      setError('الرجاء كتابة وصف للصورة'); return
    }
    if (tab === 'img2img' && !imageUrl && !imagePreview) {
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
            translatedPrompt?: string
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
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('AbortError') ? 'انتهت مهلة الطلب — حاول مجدداً' : msg)
    } finally {
      setLoading(false); setProgress('')
    }
  }, [tab, prompt, imgModel, aifreeModel, imageUrl, imagePreview, width, height, imgProvider])

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
        <p className="dms-header-sub">توليد وتحويل الصور بالذكاء الاصطناعي</p>
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

          {/* رفع صورة — img2img فقط */}
          {tab === 'img2img' && (
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
            <label className="dms-label">✏️ {tab === 'img2img' ? 'وصف التعديل المطلوب' : 'وصف الصورة'}</label>
            <textarea
              className="dms-textarea"
              rows={3}
              placeholder={
                tab === 'text2img'
                  ? 'مثال: قصبة الجزائر عند الغروب بألوان دافئة'
                  : 'مثال: نفس الصورة لكن بأسلوب أنيمي ياباني'
              }
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }}
            />
          </div>

          {/* اختيار مزود الصورة — text2img فقط */}
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
                >
                  🤖 DZ Image Engine
                  {aifreeStatus === 'online'  && <span style={{color:'#22c55e',marginRight:4}}>●</span>}
                  {aifreeStatus === 'loading' && <span style={{color:'#f59e0b',marginRight:4}}>◎</span>}
                  {aifreeStatus === 'offline' && <span style={{color:'#ef4444',marginRight:4}}>●</span>}
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

          {/* مقياس الإطار */}
          <div className="dms-section">
            <label className="dms-label">مقياس الإطار</label>
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
          {loading && <div className="dms-progress">{progress || '⏳ جاري التوليد...'}</div>}

          <button
            className="dms-generate-btn"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <><span className="dms-spinner" /> {progress || 'جاري التوليد...'}</>
            ) : (
              <>{currentTab.icon} {tab === 'text2img' ? 'ولّد الصورة' : 'حوّل الصورة'}</>
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
              <img
                src={result.url}
                alt={result.prompt}
                className="dms-result-img"
                loading="lazy"
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3' }}
              />
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
              <div className="dms-result-actions">
                <a
                  href={result.url}
                  download={`dz-media-${Date.now()}.jpg`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dms-action-btn dms-action-btn--dl"
                >⬇ تحميل</a>
                <button
                  className="dms-action-btn dms-action-btn--use"
                  onClick={() => { setImagePreview(result.url); setImageUrl(result.url); handleTabChange('img2img') }}
                >🔄 img2img</button>
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
