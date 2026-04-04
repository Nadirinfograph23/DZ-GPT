import { useState, useEffect } from 'react'
import { Download, Share, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream
}

function isInStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
}

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    if (isInStandaloneMode()) return
    if (localStorage.getItem('pwa-banner-dismissed')) return

    const iosDevice = isIos()
    setIos(iosDevice)

    // Listen for Chrome/Android native install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setVisible(false))

    // Show banner after short delay for all users
    const timer = setTimeout(() => setVisible(true), 2500)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(timer)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setVisible(false)
      setDeferredPrompt(null)
    }
  }

  const handleDismiss = () => {
    setVisible(false)
    localStorage.setItem('pwa-banner-dismissed', '1')
  }

  if (!visible) return null

  return (
    <div className="pwa-banner">
      <div className="pwa-banner-icon">
        <img src="/pwa-192x192.png" alt="DZ GPT" width={44} height={44} />
      </div>

      <div className="pwa-banner-text">
        <span className="pwa-banner-title">تثبيت DZ GPT</span>
        <span className="pwa-banner-sub">
          {ios
            ? 'اضغط على  ثم "إضافة إلى الشاشة الرئيسية"'
            : 'أضف التطبيق إلى شاشتك الرئيسية'}
        </span>
      </div>

      {ios ? (
        <button className="pwa-install-btn pwa-install-btn--ios" onClick={handleDismiss}>
          <Share size={15} />
          <span>فهمت</span>
        </button>
      ) : (
        <button
          className="pwa-install-btn"
          onClick={deferredPrompt ? handleInstall : handleDismiss}
        >
          <Download size={15} />
          <span>{deferredPrompt ? 'تثبيت' : 'موافق'}</span>
        </button>
      )}

      <button className="pwa-dismiss-btn" onClick={handleDismiss} aria-label="إغلاق">
        <X size={18} />
      </button>
    </div>
  )
}
