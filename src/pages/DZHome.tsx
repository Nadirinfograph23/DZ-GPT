import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, X, MessageSquare } from 'lucide-react'
import PwaInstallBanner from '../PwaInstallBanner'
import '../styles/dz-home.css'

const FB_URL  = 'https://www.facebook.com/nadir.infograph23'
const FB_APP  = `fb://facewebmodal/f?href=${FB_URL}`

function openFacebook() {
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
  if (isMobile) {
    window.location.href = FB_APP
    setTimeout(() => window.open(FB_URL, '_blank'), 600)
  } else {
    window.open(FB_URL, '_blank')
  }
}

function FbIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

// ===== PRIVACY TOAST =====
function PrivacyToast() {
  const [visible, setVisible] = useState(false)
  const [hiding, setHiding] = useState(false)

  useEffect(() => {
    const alreadySeen = sessionStorage.getItem('dz-privacy-seen')
    if (alreadySeen) return
    const show = setTimeout(() => setVisible(true), 1800)
    const hide = setTimeout(() => startHide(), 8000)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [])

  const startHide = () => {
    setHiding(true)
    sessionStorage.setItem('dz-privacy-seen', '1')
    setTimeout(() => setVisible(false), 400)
  }

  if (!visible) return null

  return (
    <div className={`privacy-toast${hiding ? ' privacy-toast--hiding' : ''}`}>
      <ShieldCheck size={18} className="privacy-toast-icon" />
      <p className="privacy-toast-text">
        محادثاتك محفوظة <strong>محليًا على جهازك فقط</strong> — لا يتم رفعها إلى أي خادم. يمكنك حذفها في أي وقت.
      </p>
      <button className="privacy-toast-close" onClick={startHide} aria-label="إغلاق">
        <X size={14} />
      </button>
    </div>
  )
}

// ===== ICON DEFINITIONS (بدون DZ CHAT — انتقلت للـ navbar) =====
const SECTIONS = [
  {
    id: 'dz-agent',
    label: 'DZ AGENT',
    sublabel: 'وكيل الذكاء الاصطناعي',
    path: '/dz-agent',
    gradient: 'linear-gradient(135deg, #c8ff00 0%, #7aff00 100%)',
    bgGlow: 'rgba(200,255,0,0.18)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="18" r="10" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="24" cy="18" r="4" fill="currentColor" opacity="0.7" />
        <path d="M10 38c0-7.732 6.268-14 14-14s14 6.268 14 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="36" cy="12" r="3" fill="currentColor" opacity="0.5" />
        <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'dz-tools',
    label: 'DZ TOOLS',
    sublabel: 'أدوات ذكية متعددة',
    path: '/tools',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
    bgGlow: 'rgba(245,158,11,0.18)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="8" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="2.5" />
        <rect x="27" y="8" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="2.5" />
        <rect x="8" y="27" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="2.5" />
        <rect x="27" y="27" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    ),
  },
  {
    id: 'quran',
    label: 'القرآن الكريم',
    sublabel: 'بحث وتفسير آيات',
    path: '/quran',
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
    bgGlow: 'rgba(6,182,212,0.18)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 8h24a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2.5" />
        <path d="M17 16h14M17 22h14M17 28h9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M10 38h28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="24" cy="6" r="2" fill="currentColor" opacity="0.6" />
      </svg>
    ),
  },
  {
    id: 'web-builder',
    label: 'WEB BUILDER',
    sublabel: 'أنشئ موقعك بالـ AI',
    path: '/web-builder',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
    bgGlow: 'rgba(139,92,246,0.18)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="10" width="36" height="28" rx="3" stroke="currentColor" strokeWidth="2.5" />
        <path d="M6 17h36" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="12" cy="13.5" r="1.5" fill="currentColor" opacity="0.7" />
        <circle cx="18" cy="13.5" r="1.5" fill="currentColor" opacity="0.7" />
        <circle cx="24" cy="13.5" r="1.5" fill="currentColor" opacity="0.7" />
        <path d="M15 27l-5 4 5 4M33 27l5 4-5 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M27 24l-6 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'dz-tube',
    label: 'DZ TUBE',
    sublabel: 'تحليل فيديوهات YouTube',
    path: '/dz-tube',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
    bgGlow: 'rgba(239,68,68,0.18)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="11" width="40" height="26" rx="5" stroke="currentColor" strokeWidth="2.5" />
        <path d="M20 17l12 7-12 7V17z" fill="currentColor" opacity="0.8" />
      </svg>
    ),
  },
  {
    id: 'ocr-dz',
    label: 'OCR DZ',
    sublabel: 'استخراج النصوص',
    path: '/ocr-dz',
    gradient: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
    bgGlow: 'rgba(16,185,129,0.18)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="8" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="2.5" />
        <path d="M8 16h32M8 24h32M8 32h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
        <circle cx="37" cy="37" r="7" fill="#0a0a0f" stroke="currentColor" strokeWidth="2" />
        <path d="M34 37l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'le3ba',
    label: 'DZ LE3BA',
    sublabel: 'ألعاب لغوية عربية',
    path: '/le3ba',
    gradient: 'linear-gradient(135deg, #f43f5e 0%, #a855f7 100%)',
    bgGlow: 'rgba(244,63,94,0.18)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="6" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="2.5" />
        <rect x="26" y="6" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="2.5" />
        <rect x="6" y="26" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="2.5" />
        <rect x="26" y="26" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="2.5" />
        <text x="9" y="20" fontSize="12" fontWeight="bold" fill="currentColor" opacity="0.9">ك</text>
        <text x="29" y="20" fontSize="12" fontWeight="bold" fill="currentColor" opacity="0.9">ل</text>
        <text x="9" y="40" fontSize="12" fontWeight="bold" fill="currentColor" opacity="0.9">م</text>
        <text x="29" y="40" fontSize="12" fontWeight="bold" fill="currentColor" opacity="0.9">ة</text>
      </svg>
    ),
  },
  {
    id: 'excel',
    label: 'DZ EXCEL',
    sublabel: 'محرر جداول ذكي + AI',
    path: '/excel',
    gradient: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
    bgGlow: 'rgba(22,163,74,0.18)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="6" width="36" height="36" rx="4" stroke="currentColor" strokeWidth="2.5"/>
        <line x1="6" y1="18" x2="42" y2="18" stroke="currentColor" strokeWidth="2"/>
        <line x1="6" y1="30" x2="42" y2="30" stroke="currentColor" strokeWidth="2"/>
        <line x1="18" y1="6" x2="18" y2="42" stroke="currentColor" strokeWidth="2"/>
        <path d="M10 24l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
        <text x="22" y="28" fontSize="9" fontWeight="bold" fill="currentColor" opacity="0.9">Σ</text>
        <text x="32" y="28" fontSize="7" fill="currentColor" opacity="0.7">AI</text>
      </svg>
    ),
  },
  {
    id: 'github-agent',
    label: 'DZ GITHUB',
    sublabel: 'بناء ونشر المستودعات',
    path: '/github-agent',
    gradient: 'linear-gradient(135deg, #58a6ff 0%, #3fb950 100%)',
    bgGlow: 'rgba(88,166,255,0.18)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 4C12.954 4 4 12.954 4 24c0 8.836 5.73 16.327 13.678 18.971.999.184 1.364-.434 1.364-.964 0-.474-.018-2.04-.026-3.712-5.56 1.208-6.733-2.35-6.733-2.35-.909-2.31-2.218-2.925-2.218-2.925-1.813-1.238.137-1.213.137-1.213 2.004.14 3.059 2.059 3.059 2.059 1.78 3.05 4.672 2.17 5.812 1.659.18-1.29.696-2.171 1.267-2.669-4.438-.504-9.1-2.219-9.1-9.876 0-2.181.779-3.965 2.058-5.363-.207-.505-.892-2.538.194-5.29 0 0 1.678-.537 5.496 2.05A19.14 19.14 0 0 1 24 13.5c1.7.008 3.412.23 5.008.674 3.814-2.587 5.49-2.05 5.49-2.05 1.088 2.752.403 4.785.197 5.29 1.28 1.398 2.056 3.182 2.056 5.363 0 7.674-4.67 9.366-9.12 9.86.717.617 1.357 1.834 1.357 3.698 0 2.67-.024 4.822-.024 5.477 0 .534.36 1.157 1.374.962C38.276 40.322 44 32.833 44 24 44 12.954 35.046 4 24 4z" fill="currentColor" opacity="0.9" />
      </svg>
    ),
  },
]

export default function DZHome() {
  const navigate = useNavigate()

  return (
    <div className="dz-home" dir="rtl">
      {/* ===== NAVBAR ===== */}
      <header className="dz-home-nav">
        <div className="dz-home-nav-inner">
          <div className="dz-home-logo">
            <div className="dz-home-logo-icon">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="15" stroke="url(#lg1)" strokeWidth="2" />
                <path d="M9 16a7 7 0 0 1 14 0" stroke="url(#lg1)" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="16" cy="16" r="3" fill="url(#lg1)" />
                <defs>
                  <linearGradient id="lg1" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#c8ff00" />
                    <stop offset="1" stopColor="#00d4aa" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="dz-home-logo-text">DZ GPT</span>
          </div>

          {/* ── حقوق الـ nav: شارة + أيقونات ── */}
          <div className="dz-home-nav-right">
            <div className="dz-home-nav-badge">🇩🇿 الجزائر</div>

            {/* زر فيسبوك */}
            <button
              className="dz-home-fb-btn"
              onClick={openFacebook}
              aria-label="Facebook"
              title="صفحة المطور على فيسبوك"
            >
              <FbIcon />
            </button>

            {/* زر DZ CHAT مع إشعار متحرك */}
            <button
              className="dz-home-chat-btn"
              onClick={() => navigate('/dzchat')}
              aria-label="DZ CHAT"
              title="DZ CHAT"
            >
              <MessageSquare size={20} />
              <span className="dz-home-chat-badge">
                <span className="dz-home-chat-badge-ring" />
                1
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="dz-home-hero">
        <h1 className="dz-home-hero-title">مرحباً بك في <span>DZ GPT</span></h1>
        <p className="dz-home-hero-sub">منصة الذكاء الاصطناعي الجزائرية — اختر الأداة المناسبة لك</p>
      </section>

      {/* ===== ICONS GRID ===== */}
      <main className="dz-home-grid-wrap">
        <div className="dz-home-grid">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              className="dz-home-card"
              onClick={() => navigate(section.path)}
              style={{ '--card-glow': section.bgGlow } as React.CSSProperties}
              aria-label={section.label}
            >
              <div
                className="dz-home-card-icon"
                style={{ background: section.gradient }}
              >
                {section.icon}
              </div>
              <span className="dz-home-card-label">{section.label}</span>
              <span className="dz-home-card-sub">{section.sublabel}</span>
            </button>
          ))}
        </div>
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="dz-home-footer">
        <p className="dz-home-copy">تطوير : نذير حوامرية 2026 🇩🇿</p>
      </footer>

      {/* ===== PWA + PRIVACY TOAST ===== */}
      <PwaInstallBanner />
      <PrivacyToast />

      {/* Robot is now managed globally via GlobalRobot in main.tsx */}
    </div>
  )
}
