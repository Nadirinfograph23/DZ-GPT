import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import '../styles/dz-web-builder.css'

// ── Types ─────────────────────────────────────────────────────────────────────
interface BuildResult {
  htmlCode: string
  message: string
  meta?: { type?: string; style?: string; title?: string; icon?: string }
}

interface SiteType {
  id: string
  icon: string
  label: string
  labelAr: string
  hint: string
}

interface StylePreset {
  id: string
  label: string
  labelAr: string
  colors: string[]
}

// ── Data ──────────────────────────────────────────────────────────────────────
const SITE_TYPES: SiteType[] = [
  { id: 'landing',    icon: '🚀', label: 'Landing Page',  labelAr: 'صفحة هبوط',    hint: 'Hero + Features + Pricing + CTA' },
  { id: 'dashboard',  icon: '📊', label: 'Dashboard',     labelAr: 'لوحة تحكم',    hint: 'Dark Sidebar + KPI Cards + Charts' },
  { id: 'portfolio',  icon: '🎨', label: 'Portfolio',     labelAr: 'بورتفوليو',    hint: 'Split Hero + Projects + Skills' },
  { id: 'ecommerce',  icon: '🛍️', label: 'E-Commerce',    labelAr: 'متجر إلكتروني', hint: 'Product Grid + Cart + Filters' },
  { id: 'saas',       icon: '⚡', label: 'SaaS App',      labelAr: 'تطبيق SaaS',   hint: 'Gradient Hero + Bento Features' },
  { id: 'blog',       icon: '📝', label: 'Blog',          labelAr: 'مدونة',         hint: 'Editorial Cards + Categories' },
  { id: 'restaurant', icon: '🍽️', label: 'Restaurant',   labelAr: 'مطعم',          hint: 'Cinematic Hero + Menu + Booking' },
  { id: 'agency',     icon: '🏢', label: 'Agency',        labelAr: 'وكالة',         hint: 'Bold Type + Work Grid + Team' },
  { id: 'ai',         icon: '🤖', label: 'AI Platform',   labelAr: 'منصة AI',       hint: 'Dark Glass + Streaming Chat UI' },
  { id: 'education',  icon: '🎓', label: 'Education',     labelAr: 'تعليم',         hint: 'Course Cards + Progress + FAQ' },
]

const STYLE_PRESETS: StylePreset[] = [
  { id: 'glassmorphism', label: 'Glassmorphism', labelAr: 'زجاجي',      colors: ['#6366f1','#8b5cf6','#06b6d4'] },
  { id: 'minimal',       label: 'Minimal',       labelAr: 'مينيمال',    colors: ['#f5f5f5','#222','#555'] },
  { id: 'neon',          label: 'Neon Dark',     labelAr: 'نيون',        colors: ['#00ff88','#ff0080','#0d0d0d'] },
  { id: 'gradient',      label: 'Gradient',      labelAr: 'تدرجات',     colors: ['#f97316','#ec4899','#8b5cf6'] },
  { id: 'corporate',     label: 'Corporate',     labelAr: 'كوربوريت',   colors: ['#1e40af','#0ea5e9','#f8fafc'] },
  { id: 'luxury',        label: 'Luxury Gold',   labelAr: 'فاخر ذهبي',  colors: ['#d4af37','#1a1a1a','#fff'] },
]

const TECH_FEATURES = [
  { id: 'tailwind',  label: 'Tailwind CSS' },
  { id: 'animation', label: 'Animations' },
  { id: 'darkmode',  label: 'Dark Mode Toggle' },
  { id: 'rtl',       label: 'RTL Arabic' },
  { id: 'charts',    label: 'Chart.js' },
  { id: 'forms',     label: 'Forms + Validation' },
  { id: 'aos',       label: 'Scroll Animations' },
  { id: 'icons',     label: 'Font Awesome' },
]

const EXAMPLES = [
  { icon: '🚀', text: 'موقع SaaS احترافي لأداة AI مع Hero متحرك وصفحة تسعير وشهادات عملاء' },
  { icon: '📊', text: 'لوحة تحكم تحليلية داكنة مع KPI cards وCharts ونظام sidebar متحرك' },
  { icon: '🎨', text: 'Portfolio مصمم جرافيك إبداعي مع معرض أعمال تفاعلي وتأثيرات hover' },
  { icon: '🛍️', text: 'متجر إلكتروني لمنتجات عصرية مع شبكة منتجات وسلة تسوق وفلترة' },
  { icon: '🤖', text: 'منصة AI chatbot بتصميم glassmorphism وواجهة محادثة متحركة' },
  { icon: '🏢', text: 'موقع وكالة تسويق إبداعية مع Bold typography وعرض أعمال cinematic' },
]

// ── Component ─────────────────────────────────────────────────────────────────
export default function DZWebBuilder() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [prompt, setPrompt]               = useState('')
  const [siteType, setSiteType]           = useState('landing')
  const [stylePreset, setStylePreset]     = useState('glassmorphism')
  const [techFeatures, setTechFeatures]   = useState<string[]>(['tailwind','animation','icons'])
  const [loading, setLoading]             = useState(false)
  const [result, setResult]               = useState<BuildResult | null>(null)
  const [activeTab, setActiveTab]         = useState<'preview'|'code'>('preview')
  const [statusText, setStatusText]       = useState('')
  const [errorMsg, setErrorMsg]           = useState('')
  const [cloneUrl, setCloneUrl]           = useState('')
  const [showCloneBar, setShowCloneBar]   = useState(false)
  const [cloneInputVal, setCloneInputVal] = useState('')
  const cloneInputRef = useRef<HTMLInputElement>(null)

  const iframeRef = useRef<HTMLIFrameElement>(null)

  // ── Open/close clone bar ───────────────────────────────────────────────────
  const openCloneBar = () => {
    setShowCloneBar(true)
    setTimeout(() => cloneInputRef.current?.focus(), 80)
  }

  const closeCloneBar = () => {
    setShowCloneBar(false)
    setCloneInputVal('')
  }

  const submitClone = () => {
    const url = cloneInputVal.trim()
    if (!url) return
    closeCloneBar()
    setCloneUrl(url)
    triggerCloneFromUrl(url)
  }

  const handleCloneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') submitClone()
    if (e.key === 'Escape') closeCloneBar()
  }

  // ── Auto-clone from URL param (?clone=https://...) ────────────────────────
  useEffect(() => {
    const urlToClone = searchParams.get('clone')
    if (urlToClone) {
      setCloneUrl(urlToClone)
      setPrompt(`استنسخ هذا الموقع بدقة عالية وأعد بناءه: ${urlToClone}`)
      // Auto-trigger clone after state settles
      setTimeout(() => {
        triggerCloneFromUrl(urlToClone)
      }, 300)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const triggerCloneFromUrl = useCallback(async (url: string) => {
    setLoading(true)
    setErrorMsg('')
    setResult(null)
    setStatusText('🌐 يقرأ محتوى الموقع…')

    const steps = [
      '🔍 يحلل هيكل الصفحة…',
      '🎨 يُنشئ CSS مطابق…',
      '⚡ يكتب JavaScript…',
      '🔧 يُطبق التصميم…',
      '✅ يتحقق من الجودة…',
    ]
    let si = 0
    const stInt = setInterval(() => {
      if (si < steps.length) setStatusText(steps[si++])
    }, 1800)

    try {
      const cloneMsg = `ابني نسخة احترافية ومتجاوبة من هذا الموقع باستخدام HTML + CSS + JS مع تصميم حديث وجذاب مستوحى من نفس الأسلوب: ${url}`
      const res = await fetch('/api/dz-agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cloneMsg,
          conversationId: `wb-clone-${Date.now()}`,
          lang: 'ar',
        }),
      })

      clearInterval(stInt)
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()

      if (data.isWebsite && data.htmlCode) {
        setResult({
          htmlCode: data.htmlCode,
          message:  data.content || `✅ تم استنساخ الموقع بنجاح!`,
          meta:     data.webBuilderMeta,
        })
        setActiveTab('preview')
        setStatusText('✅ تم الاستنساخ!')
        setTimeout(() => {
          if (iframeRef.current) {
            const doc = iframeRef.current.contentDocument
            if (doc) { doc.open(); doc.write(data.htmlCode); doc.close() }
          }
        }, 100)
      } else {
        setErrorMsg(data.content || 'لم يتم توليد الموقع. يرجى المحاولة مجدداً.')
      }
    } catch (err: unknown) {
      clearInterval(stInt)
      setErrorMsg(`خطأ: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [iframeRef])

  const toggleFeature = (id: string) => {
    setTechFeatures(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    )
  }

  const buildSitePrompt = useCallback((): string => {
    const type  = SITE_TYPES.find(t => t.id === siteType)
    const style = STYLE_PRESETS.find(s => s.id === stylePreset)
    const feats = techFeatures.map(f => TECH_FEATURES.find(t => t.id === f)?.label).filter(Boolean).join(', ')

    return `أنشئ موقع ويب احترافي من النوع "${type?.label}" (${type?.hint}).
النمط المرئي: ${style?.label} — استخدم ألوان ${style?.colors.join(', ')}.
الميزات التقنية المطلوبة: ${feats || 'Tailwind CSS, Animations'}.
${prompt ? `متطلبات إضافية: ${prompt}` : ''}
اجعله production-ready بجودة عالمية (Vercel / Stripe / Linear مستوى).`
  }, [prompt, siteType, stylePreset, techFeatures])

  const generate = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    setResult(null)
    setStatusText('يحلل المتطلبات…')

    const steps = [
      'يصمم هيكل الصفحة…',
      'يُنشئ CSS المتقدم…',
      'يكتب JavaScript التفاعلي…',
      'يُطبق الـ Animations…',
      'يتحقق من الجودة…',
    ]
    let si = 0
    const stInt = setInterval(() => {
      if (si < steps.length) setStatusText(steps[si++])
    }, 1800)

    try {
      const res = await fetch('/api/dz-agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: buildSitePrompt(),
          conversationId: `wb-${Date.now()}`,
          lang: 'ar',
        }),
      })

      clearInterval(stInt)

      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const data = await res.json()

      if (data.isWebsite && data.htmlCode) {
        setResult({
          htmlCode: data.htmlCode,
          message:  data.content || '✅ تم إنشاء الموقع بنجاح!',
          meta:     data.webBuilderMeta,
        })
        setActiveTab('preview')
        setStatusText('✅ اكتمل البناء!')
        // Inject into iframe
        setTimeout(() => {
          if (iframeRef.current) {
            const doc = iframeRef.current.contentDocument
            if (doc) {
              doc.open()
              doc.write(data.htmlCode)
              doc.close()
            }
          }
        }, 100)
      } else {
        setErrorMsg(data.content || 'لم يتم توليد موقع. حاول صياغة الطلب بشكل أوضح.')
      }
    } catch (err: unknown) {
      clearInterval(stInt)
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(`خطأ: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [buildSitePrompt])

  const downloadHtml = () => {
    if (!result?.htmlCode) return
    const blob = new Blob([result.htmlCode], { type: 'text/html;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dz-website-${Date.now()}.html`
    a.click()
  }

  const copyCode = () => {
    if (!result?.htmlCode) return
    navigator.clipboard.writeText(result.htmlCode).catch(() => {})
  }

  const refreshPreview = () => {
    if (!result?.htmlCode || !iframeRef.current) return
    const doc = iframeRef.current.contentDocument
    if (doc) {
      doc.open(); doc.write(result.htmlCode); doc.close()
    }
  }

  return (
    <div className="dzwb">

      {/* ── Header ── */}
      <header className="dzwb-header">
        <button className="dzwb-back" onClick={() => navigate('/dz-agent')}>
          ← DZ Agent
        </button>

        <div className="dzwb-logo-wrap">
          <div className="dzwb-logo">🌐</div>
          <div>
            <h1 className="dzwb-title">DZ Web Builder</h1>
            <p className="dzwb-subtitle">AI Web Architect — Modern Premium Sites</p>
          </div>
        </div>

        <div className="dzwb-header-badges">
          <span className="dzwb-badge dzwb-badge--green">Tailwind</span>
          <span className="dzwb-badge dzwb-badge--purple">shadcn/ui</span>
          <span className="dzwb-badge dzwb-badge--blue">Framer Motion</span>
          <span className="dzwb-badge dzwb-badge--amber">Aceternity</span>
        </div>

        <div className="dzwb-header-actions">
          <button
            className={`dzwb-action-btn dzwb-action-btn--clone ${showCloneBar ? 'dzwb-action-btn--clone-active' : ''}`}
            onClick={showCloneBar ? closeCloneBar : openCloneBar}
            title="استنسخ أي موقع من رابطه"
          >
            🔗 <span className="dzwb-clone-btn-text">استنسخ موقعاً</span>
          </button>
          {result && (
            <>
              <button className="dzwb-action-btn" onClick={copyCode} title="نسخ الكود">
                📋 نسخ
              </button>
              <button className="dzwb-action-btn dzwb-action-btn--primary" onClick={downloadHtml}>
                ⬇ تحميل HTML
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Clone Bar ── */}
      {showCloneBar && (
        <div className="dzwb-clone-bar">
          <span className="dzwb-clone-bar-icon">🔗</span>
          <input
            ref={cloneInputRef}
            className="dzwb-clone-input"
            type="url"
            placeholder="https://stripe.com أو أي موقع تريد استنساخه…"
            value={cloneInputVal}
            onChange={e => setCloneInputVal(e.target.value)}
            onKeyDown={handleCloneKeyDown}
            dir="ltr"
          />
          <button
            className="dzwb-clone-submit"
            onClick={submitClone}
            disabled={!cloneInputVal.trim() || loading}
          >
            ⚡ استنسخ الآن
          </button>
          <button className="dzwb-clone-close" onClick={closeCloneBar} title="إغلاق">✕</button>
        </div>
      )}

      {/* ── Clone URL Banner ── */}
      {cloneUrl && (
        <div style={{ background:'rgba(138,43,226,0.12)', borderBottom:'1px solid rgba(138,43,226,0.3)', padding:'8px 20px', display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'#c4b5fd' }}>
          <span>🔗</span>
          <span>جارٍ استنساخ:</span>
          <a href={cloneUrl} target="_blank" rel="noopener noreferrer" style={{ color:'#a78bfa', textDecoration:'underline', maxWidth:'400px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cloneUrl}</a>
        </div>
      )}

      {/* ── Body ── */}
      <div className={`dzwb-body${!result && !loading && !errorMsg ? ' dzwb-body--idle' : ''}`}>

        {/* ── Left Panel: Config ── */}
        <aside className="dzwb-sidebar">
          <div className="dzwb-sidebar-inner">

            {/* Site Type */}
            <section className="dzwb-section">
              <h3 className="dzwb-section-title">
                <span>نوع الموقع</span>
                <span className="dzwb-section-hint">Site Type</span>
              </h3>
              <div className="dzwb-type-grid">
                {SITE_TYPES.map(t => (
                  <button
                    key={t.id}
                    className={`dzwb-type-btn ${siteType === t.id ? 'dzwb-type-btn--active' : ''}`}
                    onClick={() => setSiteType(t.id)}
                    title={t.hint}
                  >
                    <span className="dzwb-type-icon">{t.icon}</span>
                    <span className="dzwb-type-label">{t.labelAr}</span>
                  </button>
                ))}
              </div>
              {siteType && (
                <p className="dzwb-type-hint-text">
                  {SITE_TYPES.find(t => t.id === siteType)?.hint}
                </p>
              )}
            </section>

            {/* Style Preset */}
            <section className="dzwb-section">
              <h3 className="dzwb-section-title">
                <span>النمط المرئي</span>
                <span className="dzwb-section-hint">Visual Style</span>
              </h3>
              <div className="dzwb-style-grid">
                {STYLE_PRESETS.map(s => (
                  <button
                    key={s.id}
                    className={`dzwb-style-btn ${stylePreset === s.id ? 'dzwb-style-btn--active' : ''}`}
                    onClick={() => setStylePreset(s.id)}
                  >
                    <span className="dzwb-style-dots">
                      {s.colors.map((c, i) => (
                        <span key={i} className="dzwb-dot" style={{ background: c }} />
                      ))}
                    </span>
                    <span>{s.labelAr}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* Tech Features */}
            <section className="dzwb-section">
              <h3 className="dzwb-section-title">
                <span>الميزات التقنية</span>
                <span className="dzwb-section-hint">Tech Features</span>
              </h3>
              <div className="dzwb-tech-wrap">
                {TECH_FEATURES.map(f => (
                  <button
                    key={f.id}
                    className={`dzwb-tech-chip ${techFeatures.includes(f.id) ? 'dzwb-tech-chip--on' : ''}`}
                    onClick={() => toggleFeature(f.id)}
                  >
                    {techFeatures.includes(f.id) ? '✓ ' : ''}{f.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Prompt */}
            <section className="dzwb-section dzwb-section--grow">
              <h3 className="dzwb-section-title">
                <span>وصف إضافي</span>
                <span className="dzwb-section-hint">Your Vision</span>
              </h3>
              <textarea
                className="dzwb-prompt"
                placeholder="صف رؤيتك بدقة… مثال: موقع لشركة تسويق ذكاء اصطناعي، باللغتين العربية والإنجليزية، مع خاصية dark/light mode…"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={5}
                dir="auto"
              />

              {/* Quick examples */}
              <div className="dzwb-examples">
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={i}
                    className="dzwb-example-btn"
                    onClick={() => setPrompt(ex.text)}
                    title={ex.text}
                  >
                    {ex.icon} {ex.text.slice(0, 45)}…
                  </button>
                ))}
              </div>
            </section>

            {/* Generate */}
            <button
              className={`dzwb-generate ${loading ? 'dzwb-generate--loading' : ''}`}
              onClick={generate}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="dzwb-spinner" />
                  <span>{statusText || 'يبني الموقع…'}</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>ابنِ الموقع الآن</span>
                </>
              )}
            </button>
          </div>
        </aside>

        {/* ── Right Panel: Preview ── */}
        <main className="dzwb-preview-panel">

          {/* Tabs */}
          {result && (
            <div className="dzwb-tabs">
              <button
                className={`dzwb-tab ${activeTab === 'preview' ? 'dzwb-tab--active' : ''}`}
                onClick={() => setActiveTab('preview')}
              >🌐 معاينة مباشرة</button>
              <button
                className={`dzwb-tab ${activeTab === 'code' ? 'dzwb-tab--active' : ''}`}
                onClick={() => setActiveTab('code')}
              >💻 كود HTML</button>
              <button className="dzwb-tab-refresh" onClick={refreshPreview} title="تحديث المعاينة">↺</button>
              <div className="dzwb-tabs-meta">
                {result.meta?.icon} {result.meta?.title || 'موقع جاهز'}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="dzwb-preview-body">

            {/* Idle placeholder */}
            {!loading && !result && !errorMsg && (
              <div className="dzwb-idle">
                <div className="dzwb-idle-icon">🌐</div>
                <p className="dzwb-idle-title">المعاينة ستظهر هنا</p>
                <p className="dzwb-idle-sub">اختر نوع الموقع والنمط المرئي ثم اضغط «ابنِ الموقع الآن»</p>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="dzwb-building">
                <div className="dzwb-building-ring">
                  <div className="dzwb-building-ring-inner" />
                </div>
                <div className="dzwb-building-steps">
                  <p className="dzwb-building-status">{statusText}</p>
                  <div className="dzwb-building-bar">
                    <div className="dzwb-building-bar-fill" />
                  </div>
                </div>
                <p className="dzwb-building-hint">
                  يتم توليد موقع بمستوى Vercel / Linear / Stripe…
                </p>
              </div>
            )}

            {/* Error */}
            {errorMsg && !loading && (
              <div className="dzwb-error">
                <span>⚠️</span>
                <p>{errorMsg}</p>
                <button className="dzwb-error-retry" onClick={generate}>إعادة المحاولة</button>
              </div>
            )}

            {/* Preview iframe */}
            {result && activeTab === 'preview' && (
              <iframe
                ref={iframeRef}
                className="dzwb-iframe"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                title="Website Preview"
              />
            )}

            {/* Code view */}
            {result && activeTab === 'code' && (
              <div className="dzwb-code-wrap">
                <div className="dzwb-code-header">
                  <span className="dzwb-code-lang">HTML • CSS • JavaScript</span>
                  <button className="dzwb-code-copy" onClick={copyCode}>📋 نسخ الكود</button>
                </div>
                <pre className="dzwb-code"><code>{result.htmlCode}</code></pre>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
