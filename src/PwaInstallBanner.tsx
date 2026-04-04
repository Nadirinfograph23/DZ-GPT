import { useState, useEffect } from 'react'
import { Download, X, Share, MoreVertical, Plus } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __pwaPrompt: BeforeInstallPromptEvent | null
  }
}

function isInstalled(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    )
  } catch {
    return false
  }
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent)
}

// ===== iOS GUIDE MODAL =====
function IosGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="pwa-guide-overlay" onClick={onClose}>
      <div className="pwa-guide-sheet" onClick={e => e.stopPropagation()}>
        <button className="pwa-guide-close" onClick={onClose}><X size={18} /></button>
        <div className="pwa-guide-header">
          <img src="/pwa-192x192.png" alt="DZ GPT" width={52} height={52} />
          <h3 className="pwa-guide-title">تثبيت DZ GPT على iPhone</h3>
          <p className="pwa-guide-note">يعمل فقط عبر متصفح Safari</p>
        </div>
        <div className="pwa-guide-steps">
          <div className="pwa-guide-step">
            <div className="pwa-guide-step-num">1</div>
            <div className="pwa-guide-step-body">
              <span className="pwa-guide-step-label">اضغط على أيقونة المشاركة</span>
              <div className="pwa-guide-step-icon">
                <Share size={20} />
                <span className="pwa-guide-step-hint">في شريط Safari السفلي</span>
              </div>
            </div>
          </div>
          <div className="pwa-guide-step">
            <div className="pwa-guide-step-num">2</div>
            <div className="pwa-guide-step-body">
              <span className="pwa-guide-step-label">اختر "أضف إلى الشاشة الرئيسية"</span>
              <div className="pwa-guide-step-icon">
                <Plus size={20} />
                <span className="pwa-guide-step-hint">ابحث عنها في قائمة المشاركة</span>
              </div>
            </div>
          </div>
          <div className="pwa-guide-step">
            <div className="pwa-guide-step-num">3</div>
            <div className="pwa-guide-step-body">
              <span className="pwa-guide-step-label">اضغط "إضافة" للتأكيد</span>
              <div className="pwa-guide-step-icon pwa-guide-step-icon--green">
                <Download size={20} />
                <span className="pwa-guide-step-hint">سيظهر التطبيق على الشاشة الرئيسية</span>
              </div>
            </div>
          </div>
        </div>
        <button className="pwa-guide-done" onClick={onClose}>فهمت، شكراً</button>
      </div>
    </div>
  )
}

// ===== ANDROID MANUAL GUIDE =====
function AndroidGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="pwa-guide-overlay" onClick={onClose}>
      <div className="pwa-guide-sheet" onClick={e => e.stopPropagation()}>
        <button className="pwa-guide-close" onClick={onClose}><X size={18} /></button>
        <div className="pwa-guide-header">
          <img src="/pwa-192x192.png" alt="DZ GPT" width={52} height={52} />
          <h3 className="pwa-guide-title">تثبيت DZ GPT على Android</h3>
          <p className="pwa-guide-note">عبر قائمة المتصفح</p>
        </div>
        <div className="pwa-guide-steps">
          <div className="pwa-guide-step">
            <div className="pwa-guide-step-num">1</div>
            <div className="pwa-guide-step-body">
              <span className="pwa-guide-step-label">اضغط على قائمة المتصفح</span>
              <div className="pwa-guide-step-icon">
                <MoreVertical size={20} />
                <span className="pwa-guide-step-hint">النقاط الثلاث في الأعلى</span>
              </div>
            </div>
          </div>
          <div className="pwa-guide-step">
            <div className="pwa-guide-step-num">2</div>
            <div className="pwa-guide-step-body">
              <span className="pwa-guide-step-label">اختر "إضافة إلى الشاشة الرئيسية"</span>
              <div className="pwa-guide-step-icon">
                <Plus size={20} />
                <span className="pwa-guide-step-hint">أو "Install App" في Chrome</span>
              </div>
            </div>
          </div>
          <div className="pwa-guide-step">
            <div className="pwa-guide-step-num">3</div>
            <div className="pwa-guide-step-body">
              <span className="pwa-guide-step-label">اضغط "تثبيت" للتأكيد</span>
              <div className="pwa-guide-step-icon pwa-guide-step-icon--green">
                <Download size={20} />
                <span className="pwa-guide-step-hint">سيظهر التطبيق على الشاشة الرئيسية</span>
              </div>
            </div>
          </div>
        </div>
        <button className="pwa-guide-done" onClick={onClose}>فهمت، شكراً</button>
      </div>
    </div>
  )
}

// ===== MAIN BANNER =====
export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (isInstalled()) return

    if (window.__pwaPrompt) {
      setDeferredPrompt(window.__pwaPrompt)
    }

    const handler = (e: Event) => {
      e.preventDefault()
      const prompt = e as BeforeInstallPromptEvent
      window.__pwaPrompt = prompt
      setDeferredPrompt(prompt)
    }
    window.addEventListener('beforeinstallprompt', handler)

    const onInstalled = () => {
      setInstalled(true)
      setShowGuide(false)
    }
    window.addEventListener('appinstalled', onInstalled)

    const timer = setTimeout(() => setVisible(true), 1000)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
      clearTimeout(timer)
    }
  }, [])

  if (installed || !visible) return null

  const ios = isIos()
  const android = isAndroid()
  const hasPrompt = !!deferredPrompt && !ios

  const handleInstall = async () => {
    if (!deferredPrompt) return
    setInstalling(true)
    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setInstalled(true)
      }
    } finally {
      setInstalling(false)
      setDeferredPrompt(null)
      window.__pwaPrompt = null
    }
  }

  const handleGuideBtn = () => setShowGuide(true)
  const handleDismiss = () => setVisible(false)

  return (
    <>
      <div className="pwa-banner">
        <div className="pwa-banner-icon">
          <img src="/pwa-192x192.png" alt="DZ GPT" width={44} height={44} />
        </div>

        <div className="pwa-banner-text">
          <span className="pwa-banner-title">تثبيت DZ GPT</span>
          <span className="pwa-banner-sub">
            {hasPrompt
              ? 'أضف التطبيق إلى شاشتك الرئيسية'
              : ios
                ? '🍎 Safari فقط ← مشاركة ← أضف للشاشة'
                : android
                  ? 'افتح قائمة المتصفح ← أضف للشاشة'
                  : 'أضف التطبيق إلى شاشتك الرئيسية'}
          </span>
        </div>

        {hasPrompt ? (
          <button
            className="pwa-install-btn"
            onClick={handleInstall}
            disabled={installing}
          >
            <Download size={15} />
            <span>{installing ? '...' : 'تثبيت'}</span>
          </button>
        ) : (
          <button
            className={`pwa-install-btn${ios ? ' pwa-install-btn--ios' : ' pwa-install-btn--guide'}`}
            onClick={handleGuideBtn}
          >
            <span>كيف؟</span>
          </button>
        )}

        <button className="pwa-dismiss-btn" onClick={handleDismiss} aria-label="إغلاق">
          <X size={18} />
        </button>
      </div>

      {showGuide && ios && <IosGuide onClose={() => setShowGuide(false)} />}
      {showGuide && !ios && <AndroidGuide onClose={() => setShowGuide(false)} />}
    </>
  )
}
