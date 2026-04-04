import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isInstalled(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
  } catch {
    return false
  }
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setDismissed(true))
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Hide if already installed OR user dismissed this session
  if (isInstalled() || dismissed) return null

  const ios = isIos()

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDismissed(true)
    setDeferredPrompt(null)
  }

  return (
    <div className="pwa-banner">
      <div className="pwa-banner-icon">
        <img src="/pwa-192x192.png" alt="DZ GPT" width={44} height={44} />
      </div>

      <div className="pwa-banner-text">
        <span className="pwa-banner-title">تثبيت DZ GPT</span>
        <span className="pwa-banner-sub">
          {ios
            ? '🍎 افتح في Safari ← اضغط مشاركة ← أضف للشاشة'
            : 'أضف التطبيق إلى شاشتك الرئيسية'}
        </span>
      </div>

      {deferredPrompt ? (
        <button className="pwa-install-btn" onClick={handleInstall}>
          <Download size={15} />
          <span>تثبيت</span>
        </button>
      ) : (
        <button className="pwa-install-btn" onClick={() => setDismissed(true)}>
          <span>موافق</span>
        </button>
      )}

      <button className="pwa-dismiss-btn" onClick={() => setDismissed(true)} aria-label="إغلاق">
        <X size={18} />
      </button>
    </div>
  )
}
