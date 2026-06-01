import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/dz-media-studio.css'

type Tab = 'text2img' | 'img2img'

interface ModelDef {
  id: string; label: string; badge?: string; tier: 'fast' | 'premium'; provider: string; group: string
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
  { id: 'text2img', label: 'نص → صورة',   icon: '🎨', desc: 'وصف مشهدك وسيولّد لك صورة احترافية' },
  { id: 'img2img',  label: 'صورة → صورة', icon: '🖼️', desc: 'حوّل أو عدّل صورة موجودة بوصف نصي' },
]

const IMG_PRESETS: AspectPreset[] = [
  { label: 'عمودي',  sub: '9:16', w: 576,  h: 1024, shape: 'tall'   },
  { label: 'مربع',   sub: '1:1',  w: 768,  h: 768,  shape: 'square' },
  { label: 'أفقي',   sub: '16:9', w: 1024, h: 576,  shape: 'wide'   },
  { label: 'كلاسيك', sub: '4:3',  w: 1024, h: 768,  shape: 'photo'  },
]

// النماذج الافتراضية — تُحدَّث من الـ API
const DEFAULT_MODELS: ModelDef[] = [
  { id: 'gemini-flash-image', label: '⚡ Gemini Flash Image', badge: 'NEW',   tier: 'premium', provider: 'openrouter', group: 'Google'      },
  { id: 'gemini-pro-image',   label: '🌟 Gemini Pro Image',  badge: 'PRO',   tier: 'premium', provider: 'openrouter', group: 'Google'      },
  { id: 'gpt-image-2',        label: '🤖 GPT Image 2.0',     badge: 'GPT2',  tier: 'premium', provider: 'openrouter', group: 'OpenAI'      },
  { id: 'gpt-image-mini',     label: '🤖 GPT Image Mini',    badge: 'GPT',   tier: 'premium', provider: 'openrouter', group: 'OpenAI'      },
  { id: 'flux-schnell',       label: '⚡ FLUX Schnell',       badge: 'HF',    tier: 'fast',    provider: 'hf',         group: 'HuggingFace' },
  { id: 'flux-dev',           label: '🎯 FLUX Dev',           badge: 'HD',    tier: 'fast',    provider: 'hf',         group: 'HuggingFace' },
  { id: 'sd35-large',         label: '🖼️ SD 3.5 Large',      badge: 'HD',    tier: 'fast',    provider: 'hf',         group: 'HuggingFace' },
  { id: 'realvisxl',          label: '📷 RealVis XL',         badge: 'REAL',  tier: 'fast',    provider: 'hf',         group: 'HuggingFace' },
  { id: 'juggernaut',         label: '💪 Juggernaut XL',      badge: '',      tier: 'fast',    provider: 'hf',         group: 'HuggingFace' },
  { id: 'flux',               label: '⚡ FLUX',               badge: 'FAST',  tier: 'fast',    provider: 'pollinations', group: 'Pollinations' },
  { id: 'turbo',              label: '🚀 Turbo',              badge: 'FAST',  tier: 'fast',    provider: 'pollinations', group: 'Pollinations' },
  { id: 'flux-realism',       label: '📸 FLUX Realism',       badge: 'REAL',  tier: 'fast',    provider: 'pollinations', group: 'Pollinations' },
  { id: 'flux-anime',         label: '🌸 FLUX Anime',         badge: '',      tier: 'fast',    provider: 'pollinations', group: 'Pollinations' },
]

const GROUP_ORDER = ['Google', 'OpenAI', 'HuggingFace', 'Pollinations']
const TIER_COLOR: Record<string, string> = {
  premium: 'linear-gradient(135deg,#f59e0b,#d97706)',
  fast:    'linear-gradient(135deg,#6366f1,#818cf8)',
}

interface Result {
  type: 'image'
  url: string; prompt: string; model: string; provider: string
  translatedPrompt?: string
}

export default function DZMediaStudio() {
  const navigate = useNavigate()
  const [tab, setTab]               = useState<Tab>('text2img')
  const [prompt, setPrompt]         = useState('')
  const [model, setModel]           = useState('flux')
  const [models, setModels]         = useState<ModelDef[]>(DEFAULT_MODELS)
  const [quota, setQuota]           = useState<QuotaInfo | null>(null)
  const [imageUrl, setImageUrl]     = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [width, setWidth]           = useState(768)
  const [height, setHeight]         = useState(768)
  const [loading, setLoading]       = useState(false)
  const [result, setResult]         = useState<Result | null>(null)
  const [error, setError]           = useState('')
  const [progress, setProgress]     = useState('')
  const [imgError, setImgError]     = useState(false)
  const [activeGroup, setActiveGroup] = useState<string>('all')
  const fileRef = useRef<HTMLInputElement>(null)

  // جلب النماذج والحصة عند التحميل
  useEffect(() => {
    fetch('/api/dz-agent-v4/image/models')
      .then(r => r.json())
      .then(d => { if (d.models?.length) setModels(d.models) })
      .catch(() => {})

    fetch('/api/dz-agent-v4/image/quota')
      .then(r => r.json())
      .then(d => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})
  }, [])

  // تحديث الحصة بعد كل توليد
  const refreshQuota = useCallback(() => {
    fetch('/api/dz-agent-v4/image/quota')
      .then(r => r.json())
      .then(d => { if (d.quota) setQuota(d.quota) })
      .catch(() => {})
  }, [])

  const selectedModel = models.find(m => m.id === model) || models[0]

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab); setResult(null); setError('')
    setWidth(768); setHeight(768); setImgError(false)
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
    if (!prompt.trim()) { setError('الرجاء كتابة وصف للصورة'); return }
    if (tab === 'img2img' && !imageUrl && !imagePreview) {
      setError('الرجاء رفع صورة أو إدخال رابطها'); return
    }
    setLoading(true); setError(''); setResult(null); setImgError(false)

    const selModel = models.find(m => m.id === model)
    const tier     = selModel?.tier || 'fast'
    const modelLbl = selModel?.label || model

    try {
      if (tab === 'text2img') {
        const hasArabic = /[\u0600-\u06FF]/.test(prompt)
        setProgress(hasArabic
          ? `🔤 ترجمة الوصف للإنجليزية ثم التوليد بـ ${modelLbl}...`
          : `🎨 جاري التوليد بـ ${modelLbl}${tier === 'premium' ? ' (نموذج مميز)' : ''}...`)

        const res  = await fetch('/api/dz-agent-v4/image', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ prompt, model, width, height }),
          signal:  AbortSignal.timeout(90_000),
        })
        const data = await res.json() as {
          ok: boolean; url?: string; promptUsed?: string; model?: string
          provider?: string; error?: string; quotaExceeded?: boolean; quota?: QuotaInfo
          translated?: boolean; sourceLanguage?: string
        }

        if (data.quotaExceeded) {
          if (data.quota) setQuota(data.quota)
          setError(data.error || 'تجاوزت الحصة اليومية')
          return
        }
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

      } else {
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
          setResult({
            type: 'image', url: data.url,
            prompt: data.promptUsed || prompt,
            model: data.model || 'img2img',
            provider: data.provider || '',
          })
          refreshQuota()
        } else {
          setError(data.error || 'فشل التحويل، حاول مجدداً')
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('AbortError') ? 'انتهت مهلة الطلب (90 ث) — جرّب وصفاً أبسط أو نموذجاً آخر' : msg)
    } finally {
      setLoading(false); setProgress('')
    }
  }, [tab, prompt, model, models, imageUrl, imagePreview, width, height, refreshQuota])

  // تجميع النماذج حسب المجموعة
  const groups    = GROUP_ORDER.filter(g => models.some(m => m.group === g))
  const displayed = activeGroup === 'all' ? models : models.filter(m => m.group === activeGroup)

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
        <p className="dms-header-sub">توليد وتحويل الصور بأحدث نماذج الذكاء الاصطناعي</p>
      </header>

      {/* ── شريط الحصة ── */}
      {quota && (
        <div className="dms-quota-bar">
          <div className="dms-quota-item">
            <span className="dms-quota-icon">⚡</span>
            <span>مجاني:</span>
            <div className="dms-quota-track">
              <div
                className="dms-quota-fill dms-quota-fill--fast"
                style={{ width: `${(quota.fast.remaining / quota.fast.limit) * 100}%` }}
              />
            </div>
            <span className="dms-quota-num">{quota.fast.remaining}/{quota.fast.limit}</span>
          </div>
          <div className="dms-quota-item">
            <span className="dms-quota-icon">✨</span>
            <span>مميز:</span>
            <div className="dms-quota-track">
              <div
                className="dms-quota-fill dms-quota-fill--premium"
                style={{ width: `${(quota.premium.remaining / quota.premium.limit) * 100}%` }}
              />
            </div>
            <span className="dms-quota-num">{quota.premium.remaining}/{quota.premium.limit}</span>
          </div>
          <span className="dms-quota-reset">يتجدد بعد {quota.resetInHours} ساعة</span>
        </div>
      )}

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

          {/* رفع صورة — img2img */}
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
                  ? 'مثال: قصبة الجزائر عند الغروب بألوان دافئة، فوتوريالستيك، 8K'
                  : 'مثال: نفس الصورة لكن بأسلوب أنيمي ياباني'
              }
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }}
            />
          </div>

          {/* اختيار النموذج — text2img فقط */}
          {tab === 'text2img' && (
            <div className="dms-section">
              <label className="dms-label">🧠 النموذج</label>

              {/* فلتر المجموعة */}
              <div className="dms-group-filter">
                <button
                  className={`dms-group-btn${activeGroup === 'all' ? ' active' : ''}`}
                  onClick={() => setActiveGroup('all')}
                >الكل</button>
                {groups.map(g => (
                  <button
                    key={g}
                    className={`dms-group-btn${activeGroup === g ? ' active' : ''}`}
                    onClick={() => setActiveGroup(g)}
                  >{g}</button>
                ))}
              </div>

              {/* قائمة النماذج */}
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
                      {m.badge && (
                        <span className="dms-model-badge dms-model-badge--tag">{m.badge}</span>
                      )}
                      <span
                        className={`dms-model-badge dms-model-badge--tier`}
                        style={{ background: TIER_COLOR[m.tier] }}
                      >
                        {m.tier === 'premium' ? '✨' : '⚡'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {selectedModel?.tier === 'premium' && (
                <div className="dms-premium-note">
                  ✨ نموذج مميز — يستهلك من حصة <strong>{quota?.premium.remaining ?? '?'}</strong> متبقية
                  {quota?.premium.remaining === 0 && (
                    <span style={{ color: '#ef4444', marginRight: 8 }}>⚠️ نفدت الحصة — اختر نموذجاً مجانياً</span>
                  )}
                </div>
              )}
            </div>
          )}

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
              <p className="dms-empty-title">الصورة ستظهر هنا</p>
              <p className="dms-empty-sub">
                {tab === 'text2img'
                  ? 'اكتب وصفاً واختر نموذجاً وانقر "ولّد الصورة"'
                  : 'ارفع صورة أضف وصف التعديل وانقر "حوّل الصورة"'}
              </p>
            </div>
          )}

          {loading && (
            <div className="dms-loading-anim">
              <div className="dms-loading-ring" />
              <p className="dms-loading-text">{progress || '⏳ جاري التوليد...'}</p>
              <p className="dms-loading-sub">قد يستغرق 10-60 ثانية حسب النموذج</p>
            </div>
          )}

          {result && (
            <div className="dms-result-card">
              {/* الصورة الحقيقية */}
              <div className="dms-result-img-wrap">
                {imgError ? (
                  <div className="dms-img-fallback">
                    <span>⚠️</span>
                    <p>تعذّر عرض الصورة مباشرةً</p>
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dms-action-btn dms-action-btn--dl"
                    >
                      🔗 افتح الصورة في تبويب جديد
                    </a>
                  </div>
                ) : (
                  <img
                    src={result.url}
                    alt={result.prompt}
                    className="dms-result-img"
                    loading="eager"
                    onLoad={() => setImgError(false)}
                    onError={() => setImgError(true)}
                  />
                )}
              </div>

              {/* معلومات النموذج */}
              <div className="dms-result-meta">
                <span className="dms-result-model">✨ {result.model}</span>
                <span className="dms-result-sep">·</span>
                <span className="dms-result-provider">{result.provider}</span>
              </div>

              {/* الوصف المترجم */}
              {result.translatedPrompt && (
                <div className="dms-translated-box">
                  <span className="dms-translated-title">🔤 تُرجم تلقائياً:</span>
                  <span className="dms-translated-text" dir="ltr">"{result.translatedPrompt}"</span>
                </div>
              )}

              {/* الإجراءات */}
              <div className="dms-result-actions">
                <a
                  href={result.url}
                  download={`dz-media-${Date.now()}.png`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dms-action-btn dms-action-btn--dl"
                >⬇ تحميل</a>
                <button
                  className="dms-action-btn dms-action-btn--use"
                  onClick={() => {
                    setImagePreview(result.url)
                    setImageUrl(result.url)
                    handleTabChange('img2img')
                  }}
                >🔄 img2img</button>
                <button
                  className="dms-action-btn"
                  onClick={handleGenerate}
                  disabled={loading}
                >🔄 جديد</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="dms-footer">
        <span className="dms-footer-text">AI DZ MEDIA 2026 ®</span>
        <span className="dms-footer-flag">🇩🇿</span>
      </footer>
    </div>
  )
}
