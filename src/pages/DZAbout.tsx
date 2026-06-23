import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ExternalLink, Cpu, Wrench, Zap, Server, AlertTriangle, Info } from 'lucide-react'
import '../styles/dz-about.css'

const DEVELOPER = {
  name: 'Nadir Infograph',
  fullName: 'نذير حوامرية',
  avatar: 'https://i.postimg.cc/Y0zgGHqt/FB-IMG-1775858111445.jpg',
  city: 'عنابة 🇩🇿',
  role: 'مطوّر ذكاء اصطناعي — AI Engineer',
  facebook: 'https://www.facebook.com/share/1AM1jDkz8o/',
  instagram: 'https://www.instagram.com/nadir.infograph?igsh=ZmJsZGhheXB0emli',
  tiktok: 'https://www.tiktok.com/@nadirinfograph2?_r=1&_t=ZS-96pplHnvWo4',
  youtube: 'https://www.youtube.com/@Nadirinfograph',
  github: 'https://github.com/Nadirinfograph23',
  site: 'https://dz-gpt.vercel.app',
  tv: [
    { label: 'التلفزيون الجزائري الوطني', url: 'https://youtu.be/-DPOFfvRS-Q?si=TOkP1VFTApMcktJ7' },
    { label: 'قناة الجزائر الدولية AL24', url: 'https://m.youtube.com/watch?v=gAzvBi4N7ic' },
  ],
}

const AGENTS = [
  { emoji: '🔎', name: 'وكيل البحث الحي',    role: 'Live Search',      color: '#6366f1', desc: 'Google · RSS · crawl4ai' },
  { emoji: '📰', name: 'وكيل الأخبار',        role: 'News Agent',       color: '#f59e0b', desc: '20+ مصدر جزائري' },
  { emoji: '⚽', name: 'وكيل الرياضة',        role: 'Sports Agent',     color: '#10b981', desc: 'LFP · دوريات عالمية' },
  { emoji: '🌤️', name: 'وكيل الطقس',          role: 'Weather Agent',    color: '#06b6d4', desc: '58 ولاية + عالمي' },
  { emoji: '🗺️', name: 'وكيل الخرائط',        role: 'Maps Agent',       color: '#84cc16', desc: 'جغرافيا الجزائر' },
  { emoji: '🐙', name: 'وكيل GitHub',          role: 'GitHub Agent',     color: '#58a6ff', desc: 'commit · deploy · PR' },
  { emoji: '🌐', name: 'وكيل بناء المواقع',   role: 'Web Builder',      color: '#a855f7', desc: 'HTML/CSS/JS/React' },
  { emoji: '🧠', name: 'وكيل الذاكرة',        role: 'Memory Agent',     color: '#ec4899', desc: 'Long-Term Memory' },
  { emoji: '📖', name: 'وكيل القرآن',          role: 'Quran Agent',      color: '#0ea5e9', desc: '6236 آية · تفسير' },
  { emoji: '🏥', name: 'وكيل الصحة',           role: 'Health Agent',     color: '#ef4444', desc: 'CNAS · أطباء' },
  { emoji: '🎓', name: 'وكيل التعليم',         role: 'Education Agent',  color: '#f97316', desc: 'Eddirasa · بكالوريا' },
  { emoji: '⚖️', name: 'وكيل القانون',         role: 'Legal Agent',      color: '#8b5cf6', desc: 'عقود · OCR · قانون' },
  { emoji: '🎬', name: 'وكيل يوتيوب',          role: 'YouTube Agent',    color: '#dc2626', desc: 'تحليل · ملخص' },
  { emoji: '🗣️', name: 'وكيل الدارجة',         role: 'Darija Agent',     color: '#16a34a', desc: 'كل لهجات الجزائر' },
  { emoji: '💱', name: 'وكيل العملات',         role: 'Currency Agent',   color: '#eab308', desc: 'DZD · USD · EUR حي' },
  { emoji: '🔬', name: 'وكيل التحليل',         role: 'Analysis Agent',   color: '#64748b', desc: 'CoT · ReAct · ToT' },
]

const PROVIDERS = [
  { name: 'Groq Cloud',          models: ['llama-3.3-70b', 'mixtral-8x7b'], ctx: '32K', color: '#f97316', cost: 'مجاني', rel: 9 },
  { name: 'Google Gemini',       models: ['gemini-1.5-flash', 'gemini-2.0'], ctx: '1M', color: '#4285f4', cost: 'مجاني', rel: 8 },
  { name: 'Mistral AI',          models: ['mistral-large', 'mistral-small'], ctx: '32K', color: '#ff7000', cost: 'منخفض', rel: 8 },
  { name: 'NVIDIA NIM',          models: ['llama-3.1-70b', 'nemotron-70b'],  ctx: '128K', color: '#76b900', cost: 'مجاني', rel: 7 },
  { name: 'Cohere',              models: ['command-r-plus', 'command-r'],    ctx: '128K', color: '#39d353', cost: 'مجاني', rel: 7 },
  { name: 'OpenRouter',          models: ['claude-3.5-sonnet', 'gpt-4o'],    ctx: '200K', color: '#7c3aed', cost: 'متوسط', rel: 8 },
  { name: 'HuggingFace',         models: ['FLUX.1-schnell', 'SDXL'],         ctx: '8K',  color: '#ffd21e', cost: 'مجاني', rel: 6 },
]

const STATS = [
  { value: '16', label: 'وكيل متخصص', icon: <Cpu size={22} />, color: '#6366f1' },
  { value: '18', label: 'أداة مدمجة', icon: <Wrench size={22} />, color: '#10b981' },
  { value: '39', label: 'مهارة', icon: <Zap size={22} />, color: '#f59e0b' },
  { value: '7',  label: 'مزودو AI', icon: <Server size={22} />, color: '#ec4899' },
]

const LIMITATIONS = [
  'لا تنفيذ كود في بيئة sandbox داخل الشات',
  'لا وصول لملفاتك المحلية على جهازك',
  'لا ذاكرة دائمة بين الجلسات المختلفة',
  '⚠️ DeepSeek: رصيد فارغ حالياً',
  '⚠️ Google CSE: مقيّد — SearXNG fallback متاح',
  'لا إرسال رسائل بالنيابة عنك بدون إذن',
]

function openFacebook() {
  const web = DEVELOPER.facebook
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
  if (isMobile) {
    window.location.href = `fb://facewebmodal/f?href=${encodeURIComponent(web)}`
    setTimeout(() => window.open(web, '_blank', 'noopener'), 700)
  } else {
    window.open(web, '_blank', 'noopener,noreferrer')
  }
}

function Stars({ score }: { score: number }) {
  return (
    <span className="dza-stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`dza-star ${i < Math.round(score / 2) ? 'dza-star--on' : ''}`}>★</span>
      ))}
      <span className="dza-star-val">{score}/10</span>
    </span>
  )
}

export default function DZAbout() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'agents' | 'providers' | 'limits'>('agents')
  const [capabilities, setCapabilities] = useState<null | { timestamp: string }>(null)

  useEffect(() => {
    fetch('/api/capabilities', { headers: { 'User-Agent': 'DZAboutPage/1.0' } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.timestamp) setCapabilities(d) })
      .catch(() => {})
  }, [])

  return (
    <div className="dza-page" dir="rtl">

      {/* ── NAVBAR ── */}
      <header className="dza-nav">
        <button className="dza-back" onClick={() => navigate('/')} aria-label="رجوع">
          <ArrowRight size={18} />
          <span>الرئيسية</span>
        </button>
        <div className="dza-nav-title">
          <span className="dza-nav-logo">DZ Agent</span>
          <span className="dza-nav-badge">لوحة القدرات</span>
        </div>
        {capabilities && (
          <span className="dza-live-badge">
            <span className="dza-live-dot" />
            Live
          </span>
        )}
      </header>

      <main className="dza-main">

        {/* ── HERO ── */}
        <section className="dza-hero">
          <div className="dza-hero-glow" />
          <div className="dza-hero-icon">🤖</div>
          <h1 className="dza-hero-title">DZ Agent <span>قدراتي الكاملة</span></h1>
          <p className="dza-hero-sub">
            نظام متعدد الوكلاء — كل البيانات من السجل الحقيقي، لا hallucination
          </p>
        </section>

        {/* ── STATS GRID ── */}
        <section className="dza-stats">
          {STATS.map(s => (
            <div key={s.label} className="dza-stat-card" style={{ '--stat-color': s.color } as React.CSSProperties}>
              <div className="dza-stat-icon" style={{ color: s.color }}>{s.icon}</div>
              <div className="dza-stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="dza-stat-label">{s.label}</div>
            </div>
          ))}
        </section>

        {/* ── DEVELOPER CARD ── */}
        <section className="dza-dev-section">
          <h2 className="dza-section-title"><span>👨‍💻</span> المطوّر</h2>
          <div className="dza-dev-card">
            <button className="dza-dev-avatar-wrap" onClick={openFacebook} title="فتح صفحة المطور على فيسبوك">
              <img
                className="dza-dev-avatar"
                src={DEVELOPER.avatar}
                alt={DEVELOPER.fullName}
              />
              <span className="dza-dev-fb-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                </svg>
              </span>
            </button>

            <div className="dza-dev-info">
              <div className="dza-dev-name">{DEVELOPER.fullName}</div>
              <div className="dza-dev-en">{DEVELOPER.name}</div>
              <div className="dza-dev-city">{DEVELOPER.city} · {DEVELOPER.role}</div>

              <div className="dza-dev-tv">
                {DEVELOPER.tv.map(t => (
                  <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" className="dza-dev-tv-link">
                    🎬 {t.label}
                  </a>
                ))}
              </div>

              <div className="dza-dev-social">
                <a href={DEVELOPER.facebook} onClick={e => { e.preventDefault(); openFacebook() }} className="dza-social-btn dza-fb" title="Facebook">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                  فيسبوك
                </a>
                <a href={DEVELOPER.instagram} target="_blank" rel="noopener noreferrer" className="dza-social-btn dza-ig" title="Instagram">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                  انستغرام
                </a>
                <a href={DEVELOPER.youtube} target="_blank" rel="noopener noreferrer" className="dza-social-btn dza-yt" title="YouTube">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>
                  يوتيوب
                </a>
                <a href={DEVELOPER.github} target="_blank" rel="noopener noreferrer" className="dza-social-btn dza-gh" title="GitHub">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── TABS ── */}
        <section className="dza-tabs-section">
          <div className="dza-tabs">
            <button className={`dza-tab ${activeTab === 'agents' ? 'active' : ''}`} onClick={() => setActiveTab('agents')}>
              🧠 الوكلاء (16)
            </button>
            <button className={`dza-tab ${activeTab === 'providers' ? 'active' : ''}`} onClick={() => setActiveTab('providers')}>
              ⚡ المزودون (7)
            </button>
            <button className={`dza-tab ${activeTab === 'limits' ? 'active' : ''}`} onClick={() => setActiveTab('limits')}>
              🔒 الحدود
            </button>
          </div>

          {/* AGENTS TAB */}
          {activeTab === 'agents' && (
            <div className="dza-agents-grid">
              {AGENTS.map(a => (
                <div key={a.name} className="dza-agent-card" style={{ '--agent-color': a.color } as React.CSSProperties}>
                  <div className="dza-agent-emoji">{a.emoji}</div>
                  <div className="dza-agent-body">
                    <div className="dza-agent-name">{a.name}</div>
                    <div className="dza-agent-role" style={{ color: a.color }}>{a.role}</div>
                    <div className="dza-agent-desc">{a.desc}</div>
                  </div>
                  <div className="dza-agent-dot" style={{ background: a.color }} />
                </div>
              ))}
            </div>
          )}

          {/* PROVIDERS TAB */}
          {activeTab === 'providers' && (
            <div className="dza-providers-grid">
              {PROVIDERS.map(p => (
                <div key={p.name} className="dza-provider-card" style={{ '--prov-color': p.color } as React.CSSProperties}>
                  <div className="dza-prov-header">
                    <span className="dza-prov-dot" style={{ background: p.color }} />
                    <span className="dza-prov-name">{p.name}</span>
                    <span className="dza-prov-cost">{p.cost}</span>
                  </div>
                  <div className="dza-prov-models">
                    {p.models.map(m => <span key={m} className="dza-prov-model">{m}</span>)}
                  </div>
                  <div className="dza-prov-footer">
                    <span className="dza-prov-ctx">🗂 {p.ctx} tokens</span>
                    <Stars score={p.rel} />
                  </div>
                </div>
              ))}

              {/* Token Limits Box */}
              <div className="dza-tokens-box">
                <div className="dza-tokens-title"><Info size={15} /> حدود الـ Tokens</div>
                <div className="dza-tokens-grid">
                  <div><span>المدخلات</span><strong>32,768</strong></div>
                  <div><span>المخرجات</span><strong>8,192</strong></div>
                  <div><span>متوسط الرد</span><strong>~600</strong></div>
                  <div><span>تكلفة الأدوات</span><strong>~400</strong></div>
                </div>
                <div className="dza-fallback-chain">
                  <span>سلسلة Fallback:</span>
                  {['Groq', 'Gemini', 'Mistral', 'NVIDIA', 'Cohere', 'OpenRouter'].map((p, i, arr) => (
                    <span key={p}><span className="dza-chain-item">{p}</span>{i < arr.length - 1 && <span className="dza-chain-arrow">→</span>}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* LIMITS TAB */}
          {activeTab === 'limits' && (
            <div className="dza-limits-section">
              <div className="dza-limits-header">
                <AlertTriangle size={20} className="dza-limits-icon" />
                <span>شفافية كاملة — ما لا يمكن لـ DZ Agent فعله</span>
              </div>
              <ul className="dza-limits-list">
                {LIMITATIONS.map(l => (
                  <li key={l} className="dza-limit-item">
                    <span className="dza-limit-x">✗</span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>

              <div className="dza-api-box">
                <div className="dza-api-title">📡 API مباشر للمطورين</div>
                <div className="dza-api-endpoints">
                  <div className="dza-api-row">
                    <span className="dza-api-method">GET</span>
                    <a href="/api/capabilities" target="_blank" className="dza-api-path">/api/capabilities</a>
                    <span className="dza-api-desc">JSON كامل</span>
                  </div>
                  <div className="dza-api-row">
                    <span className="dza-api-method">GET</span>
                    <a href="/api/capabilities/report?mode=full" target="_blank" className="dza-api-path">/api/capabilities/report?mode=full</a>
                    <span className="dza-api-desc">تقرير Markdown</span>
                  </div>
                  <div className="dza-api-row">
                    <span className="dza-api-method">GET</span>
                    <a href="/api/version" target="_blank" className="dza-api-path">/api/version</a>
                    <span className="dza-api-desc">إصدار النظام</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── SKILLS CLOUD ── */}
        <section className="dza-skills-section">
          <h2 className="dza-section-title"><span>⚡</span> المهارات (39)</h2>
          <div className="dza-skills-cloud">
            {[
              '🔎 بحث حي','🌐 قراءة مواقع','💻 كود وبرمجة','🐙 GitHub Agent',
              '📰 أخبار الجزائر','🌍 أخبار عالمية','⚽ رياضة وLFP','💱 عملات DZD',
              '🌤️ طقس 58 ولاية','🕌 مواقيت الصلاة','📖 قرآن كريم','🧠 ذاكرة شخصية',
              '📄 سيرة ذاتية','📋 مخطط مشاريع','📑 وثائق تجارية','⚖️ تحليل قانوني',
              '💼 بحث وظيفي','✉️ رسائل تقدم','🏥 وكيل صحة','👨‍⚕️ بحث أطباء',
              '📊 إحصاءات جزائرية','🗣️ دارجة جزائرية','🔄 ترجمة 3 لغات','🖼️ توليد صور AI',
              '🌐 بناء مواقع','🚀 GitHub Pages','☁️ نشر Vercel','🎬 تحليل يوتيوب',
              '📷 OCR صور/PDF','🗺️ خرائط جزائرية','🎓 دروس Eddirasa','📝 توليد عقود',
              '📊 Business Plan','🏢 شركات الجزائر','🩺 CNAS/CHNAS',
              '🧩 multi-agent','🔗 WebSocket فوري','🛡️ circuit breaker','🎯 كاشف النوايا',
            ].map(s => (
              <span key={s} className="dza-skill-tag">{s}</span>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="dza-cta">
          <button className="dza-cta-btn" onClick={() => navigate('/dz-agent')}>
            <span>ابدأ المحادثة مع DZ Agent</span>
            <span className="dza-cta-arrow">←</span>
          </button>
          <a
            href="/api/capabilities"
            target="_blank"
            rel="noopener noreferrer"
            className="dza-cta-api"
          >
            <ExternalLink size={14} />
            API JSON
          </a>
        </section>

      </main>

      <footer className="dza-footer">
        <p>DZ Agent v5.0 · تطوير نذير حوامرية 2026 🇩🇿</p>
        {capabilities && (
          <p className="dza-footer-ts">
            آخر تحديث للسجل: {new Date(capabilities.timestamp).toLocaleString('ar-DZ')}
          </p>
        )}
      </footer>
    </div>
  )
}
