import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, X, MessageSquare } from 'lucide-react'
import PwaInstallBanner from '../PwaInstallBanner'
import DZOnboarding from '../components/DZOnboarding'
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
    gradient: 'linear-gradient(145deg, #3b6fd4 0%, #5b4fd4 100%)',
    bgGlow: 'rgba(91,79,212,0.12)',
    icon: (
      // Brain / AI circuit
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 10c-4.418 0-8 3.582-8 8 0 2.09.8 3.99 2.1 5.42C8.8 24.87 8 26.85 8 29c0 4.97 4.03 9 9 9h14c4.97 0 9-4.03 9-9 0-2.15-.8-4.13-2.1-5.58A7.965 7.965 0 0 0 40 18c0-4.418-3.582-8-8-8-1.8 0-3.47.595-4.82 1.595A7.963 7.963 0 0 0 24 11c-.75 0-1.48.1-2.18.285A7.96 7.96 0 0 0 16 10z" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinejoin="round"/>
        <circle cx="17" cy="22" r="2" fill="rgba(255,255,255,0.85)"/>
        <circle cx="24" cy="20" r="2" fill="rgba(255,255,255,0.85)"/>
        <circle cx="31" cy="22" r="2" fill="rgba(255,255,255,0.85)"/>
        <path d="M17 22v6M24 20v8M31 22v6" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M17 28h14" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'dz-tools',
    label: 'DZ TOOLS',
    sublabel: 'أدوات ذكية متعددة',
    path: '/tools',
    gradient: 'linear-gradient(145deg, #c2751a 0%, #b84a1f 100%)',
    bgGlow: 'rgba(194,117,26,0.12)',
    icon: (
      // Wrench + sparkle
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 6c-4.418 0-8 3.582-8 8 0 .88.14 1.73.4 2.52L8 33a2 2 0 0 0 0 2.83l4.24 4.24a2 2 0 0 0 2.83 0l16.48-16.48c.79.26 1.63.4 2.51.4 4.42 0 8-3.58 8-8a8 8 0 0 0-1.3-4.38l-4.72 4.72-3.54-3.54 4.72-4.72A7.966 7.966 0 0 0 32 6z" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinejoin="round"/>
        <circle cx="11.5" cy="36.5" r="2" fill="rgba(255,255,255,0.7)"/>
      </svg>
    ),
  },
  {
    id: 'quran',
    label: 'القرآن الكريم',
    sublabel: 'بحث وتفسير آيات',
    path: '/quran',
    gradient: 'linear-gradient(145deg, #0d7a5a 0%, #0a6672 100%)',
    bgGlow: 'rgba(13,122,90,0.12)',
    icon: (
      // Open book with crescent
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 10C20 10 14 12 10 14v24c4-2 10-4 14-4s10 2 14 4V14c-4-2-10-4-14-4z" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinejoin="round"/>
        <line x1="24" y1="10" x2="24" y2="34" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M14 19c2.5-1 5.5-1.5 8-1.5" stroke="rgba(255,255,255,0.65)" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M14 24c2.5-1 5.5-1.5 8-1.5" stroke="rgba(255,255,255,0.65)" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M34 19c-2.5-1-5.5-1.5-8-1.5" stroke="rgba(255,255,255,0.65)" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M34 24c-2.5-1-5.5-1.5-8-1.5" stroke="rgba(255,255,255,0.65)" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M38 8a4 4 0 1 1-5.66 5.66A5 5 0 1 0 38 8z" fill="rgba(255,255,255,0.8)"/>
        <circle cx="39" cy="6" r="1.2" fill="rgba(255,255,255,0.75)"/>
      </svg>
    ),
  },
  {
    id: 'web-builder',
    label: 'WEB BUILDER',
    sublabel: 'أنشئ موقعك بالـ AI',
    path: '/web-builder',
    gradient: 'linear-gradient(145deg, #5b35b8 0%, #8b2fa8 100%)',
    bgGlow: 'rgba(91,53,184,0.12)',
    icon: (
      // Browser + code tags
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="9" width="38" height="30" rx="3.5" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2"/>
        <path d="M5 16h38" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8"/>
        <circle cx="11" cy="12.5" r="1.8" fill="rgba(255,255,255,0.7)"/>
        <circle cx="17" cy="12.5" r="1.8" fill="rgba(255,255,255,0.5)"/>
        <circle cx="23" cy="12.5" r="1.8" fill="rgba(255,255,255,0.35)"/>
        <path d="M16 27l-5 3.5 5 3.5" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M32 27l5 3.5-5 3.5" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M26 24l-4 11" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'dz-tube',
    label: 'DZ TUBE',
    sublabel: 'تحليل فيديوهات YouTube',
    path: '/dz-tube',
    gradient: 'linear-gradient(145deg, #c0281c 0%, #c45318 100%)',
    bgGlow: 'rgba(192,40,28,0.12)',
    icon: (
      // Play circle with sparkles
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="17" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2"/>
        <path d="M20 17.5l12 6.5-12 6.5V17.5z" fill="rgba(255,255,255,0.9)"/>
        <circle cx="38" cy="10" r="1.5" fill="rgba(255,255,255,0.6)"/>
        <circle cx="42" cy="14" r="1" fill="rgba(255,255,255,0.4)"/>
        <circle cx="34" cy="7" r="1" fill="rgba(255,255,255,0.4)"/>
      </svg>
    ),
  },
  {
    id: 'ocr-dz',
    label: 'OCR DZ',
    sublabel: 'استخراج النصوص',
    path: '/ocr-dz',
    gradient: 'linear-gradient(145deg, #0e6f8a 0%, #0b5e70 100%)',
    bgGlow: 'rgba(14,111,138,0.12)',
    icon: (
      // Camera scan
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 17V12a3 3 0 0 1 3-3h5M36 9h5a3 3 0 0 1 3 3v5M44 31v5a3 3 0 0 1-3 3h-5M12 39H7a3 3 0 0 1-3-3v-5" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinecap="round"/>
        <rect x="14" y="14" width="20" height="20" rx="2.5" stroke="rgba(255,255,255,0.7)" strokeWidth="1.8"/>
        <path d="M19 24h10M19 28h6" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round"/>
        <path d="M19 20h4" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'excel',
    label: 'DZ EXCEL',
    sublabel: 'محرر جداول ذكي + AI',
    path: '/excel',
    gradient: 'linear-gradient(145deg, #1a7a3c 0%, #157a2e 100%)',
    bgGlow: 'rgba(26,122,60,0.12)',
    icon: (
      // Spreadsheet with chart bar
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="7" width="36" height="34" rx="3.5" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2"/>
        <path d="M6 17h36" stroke="rgba(255,255,255,0.45)" strokeWidth="1.6"/>
        <path d="M18 7v34" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4"/>
        <rect x="11" y="28" width="5" height="7" rx="1" fill="rgba(255,255,255,0.8)"/>
        <rect x="20" y="23" width="5" height="12" rx="1" fill="rgba(255,255,255,0.65)"/>
        <rect x="29" y="20" width="5" height="15" rx="1" fill="rgba(255,255,255,0.5)"/>
        <path d="M10 12h6M20 12h12" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'github-agent',
    label: 'DZ GITHUB',
    sublabel: 'بناء ونشر المستودعات',
    path: '/github-agent',
    gradient: 'linear-gradient(145deg, #2d3748 0%, #1a2332 100%)',
    bgGlow: 'rgba(45,55,72,0.2)',
    icon: (
      // GitHub octocat
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 4C12.954 4 4 12.954 4 24c0 8.836 5.73 16.327 13.678 18.971.999.184 1.364-.434 1.364-.964 0-.474-.018-2.04-.026-3.712-5.56 1.208-6.733-2.35-6.733-2.35-.909-2.31-2.218-2.925-2.218-2.925-1.813-1.238.137-1.213.137-1.213 2.004.14 3.059 2.059 3.059 2.059 1.78 3.05 4.672 2.17 5.812 1.659.18-1.29.696-2.171 1.267-2.669-4.438-.504-9.1-2.219-9.1-9.876 0-2.181.779-3.965 2.058-5.363-.207-.505-.892-2.538.194-5.29 0 0 1.678-.537 5.496 2.05A19.14 19.14 0 0 1 24 13.5c1.7.008 3.412.23 5.008.674 3.814-2.587 5.49-2.05 5.49-2.05 1.088 2.752.403 4.785.197 5.29 1.28 1.398 2.056 3.182 2.056 5.363 0 7.674-4.67 9.366-9.12 9.86.717.617 1.357 1.834 1.357 3.698 0 2.67-.024 4.822-.024 5.477 0 .534.36 1.157 1.374.962C38.276 40.322 44 32.833 44 24 44 12.954 35.046 4 24 4z" fill="rgba(255,255,255,0.9)"/>
      </svg>
    ),
  },
  {
    id: 'le3ba',
    label: 'DZ LE3BA',
    sublabel: 'ألعاب لغوية عربية',
    path: '/le3ba',
    gradient: 'linear-gradient(145deg, #9d2551 0%, #7c2091 100%)',
    bgGlow: 'rgba(157,37,81,0.12)',
    icon: (
      // Game controller
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 24c0-6.627 5.373-12 12-12h12c6.627 0 12 5.373 12 12 0 5.523-3.75 9.643-7.95 10.882-1.63.48-3.46-.04-4.76-1.09L28 33H20l-1.29 1.292c-1.3 1.05-3.13 1.57-4.76 1.09C9.75 33.642 6 29.522 6 24z" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinejoin="round"/>
        <path d="M18 22v4M16 24h4" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="30" cy="22" r="1.8" fill="rgba(255,255,255,0.85)"/>
        <circle cx="34" cy="26" r="1.8" fill="rgba(255,255,255,0.6)"/>
        <circle cx="26" cy="26" r="1.8" fill="rgba(255,255,255,0.6)"/>
      </svg>
    ),
  },
  {
    id: 'radio',
    label: 'DZ RADIO',
    sublabel: 'إذاعات جزائرية مباشرة',
    path: '/radio',
    gradient: 'linear-gradient(145deg, #1453a0 0%, #3a3e9c 100%)',
    bgGlow: 'rgba(20,83,160,0.12)',
    icon: (
      // Radio waves + music note
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 28c0-7.732 6.268-14 14-14s14 6.268 14 14" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round"/>
        <path d="M16 28c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="24" cy="28" r="3.5" fill="rgba(255,255,255,0.9)"/>
        <rect x="10" y="32" width="28" height="10" rx="3" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8"/>
        <circle cx="17" cy="37" r="2" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5"/>
        <path d="M25 36h8M25 39h5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'dz-media',
    label: 'DZ MEDIA',
    sublabel: 'نص/صورة → صورة/فيديو',
    path: '/media',
    gradient: 'linear-gradient(145deg, #7b2d8b 0%, #4a2a9a 100%)',
    bgGlow: 'rgba(123,45,139,0.12)',
    icon: (
      // Magic wand + stars
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 38L28 20" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M28 20l2-8 2 4 4 2-8 2z" fill="rgba(255,255,255,0.85)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinejoin="round"/>
        <circle cx="38" cy="14" r="1.5" fill="rgba(255,255,255,0.7)"/>
        <circle cx="34" cy="8"  r="1.2" fill="rgba(255,255,255,0.55)"/>
        <circle cx="42" cy="20" r="1.2" fill="rgba(255,255,255,0.55)"/>
        <path d="M14 26l1.5-3 1.5 3-3 0zM20 32l1-2 1 2-2 0z" fill="rgba(255,255,255,0.45)"/>
        <rect x="5" y="36" width="10" height="6" rx="1.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
        <path d="M8 39l3 1.5-3 1.5V39z" fill="rgba(255,255,255,0.55)"/>
      </svg>
    ),
  },
  {
    id: 'my-projects',
    label: 'مشاريعي',
    sublabel: 'مشاريع Web Builder المحفوظة',
    path: '/my-projects',
    gradient: 'linear-gradient(145deg, #2563a8 0%, #1e4a8a 100%)',
    bgGlow: 'rgba(37,99,168,0.12)',
    icon: (
      // Folder with star
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 14a3 3 0 0 1 3-3h10l4 4h16a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V14z" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinejoin="round"/>
        <path d="M24 22l1.5 3 3.5.5-2.5 2.5.6 3.5L24 30l-2.6 1.5.6-3.5L19.5 25.5l3.5-.5L24 22z" fill="rgba(255,255,255,0.85)"/>
      </svg>
    ),
  },
  {
    id: 'about-dz',
    label: 'عن DZ Agent',
    sublabel: 'لوحة القدرات والوكلاء',
    path: '/about',
    gradient: 'linear-gradient(145deg, #374151 0%, #1f2937 100%)',
    bgGlow: 'rgba(55,65,81,0.18)',
    icon: (
      // Info shield
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 6l16 6v10c0 9-7 16.8-16 19C15 38.8 8 31 8 22V12l16-6z" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinejoin="round"/>
        <circle cx="24" cy="20" r="2" fill="rgba(255,255,255,0.85)"/>
        <path d="M24 24v8" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'certificate',
    label: 'Certificate',
    sublabel: 'شهادة DZ Agent',
    path: 'https://dzagent.app/dz-agent-certificate.html',
    external: true,
    gradient: 'linear-gradient(145deg, #a06420 0%, #8c4e12 100%)',
    bgGlow: 'rgba(160,100,32,0.12)',
    icon: (
      // Ribbon medal
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="20" r="12" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2"/>
        <path d="M24 14l1.8 3.6 4 .6-2.9 2.8.68 3.98L24 23l-3.58 1.98.68-3.98-2.9-2.8 4-.6L24 14z" fill="rgba(255,255,255,0.85)"/>
        <path d="M18 30l-4 12 10-5 10 5-4-12" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinejoin="round"/>
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
                    <stop stopColor="#60a5fa" />
                    <stop offset="1" stopColor="#a78bfa" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="dz-home-logo-text">DZ AGENT</span>
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

            {/* ميدالية الجزائر الذهبية — شهادة DZ Agent */}
            <a
              href="https://dzagent.app/dz-agent-certificate.html"
              target="_blank"
              rel="noopener noreferrer"
              title="🥇 شهادة DZ Agent الجزائرية"
              className="dz-home-medal-badge"
            >
              🇩🇿
            </a>

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
        <h1 className="dz-home-hero-title">مرحباً بك في <span>DZ AGENT</span></h1>
        <p className="dz-home-hero-sub">منصة الذكاء الاصطناعي الجزائرية — اختر الأداة المناسبة لك</p>
      </section>

      {/* ===== ICONS GRID ===== */}
      <main className="dz-home-grid-wrap">
        <div className="dz-home-grid">
          {SECTIONS.map((section, idx) => (
            <button
              key={section.id}
              className="dz-home-card"
              onClick={() => section.external ? window.open(section.path, '_blank') : navigate(section.path)}
              style={{ '--card-glow': section.bgGlow, '--card-idx': idx } as React.CSSProperties}
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

      {/* ===== PWA + PRIVACY TOAST + ONBOARDING ===== */}
      <PwaInstallBanner />
      <PrivacyToast />
      <DZOnboarding />

      {/* Robot is now managed globally via GlobalRobot in main.tsx */}
    </div>
  )
}
