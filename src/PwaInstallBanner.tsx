import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

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

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Already installed → never show
    if (isInstalled()) return

    // Pick up prompt captured before React mounted
    if (window.__pwaPrompt) {
      setDeferredPrompt(window.__pwaPrompt)
    }

    // Also listen for any future prompt (e.g. if page loads slowly)
    const handler = (e: Event) => {
      e.preventDefault()
      const prompt = e as BeforeInstallPromptEvent
      window.__pwaPrompt = prompt
      setDeferredPrompt(prompt)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Hide when user installs from outside
    const onInstalled = () => setInstalled(true)
    window.addEventListener('appinstalled', onInstalled)

    // Show banner after short delay so it doesn't clash with page load
    const timer = setTimeout(() => setVisible(true), 1200)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', onInstalled)
      clearTimeout(timer)
    }
  }, [])

  if (installed || !visible) return null

  const ios = isIos()

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setInstalled(true)
    }
    setDeferredPrompt(null)
    window.__pwaPrompt = null
  }

  const handleDismiss = () => setVisible(false)

  return (
    <div className="pwa-banner">
      <div className="pwa-banner-icon">
        <img src="/pwa-192x192.png" alt="DZ GPT" width={44} height={44} />
      </div>

      <div className="pwa-banner-text">
        <span className="pwa-banner-title">تثبيت DZ GPT</span>
        <span className="pwa-banner-sub">
          {ios
            ? '🍎 Safari ← مشاركة ← أضف للشاشة'
            : 'أضف التطبيق إلى شاشتك الرئيسية'}
        </span>
      </div>

      {deferredPrompt && !ios ? (
        <button className="pwa-install-btn" onClick={handleInstall}>
          <Download size={15} />
          <span>تثبيت</span>
        </button>
      ) : (
        <button className={`pwa-install-btn${ios ? ' pwa-install-btn--ios' : ''}`} onClick={handleDismiss}>
          <span>موافق</span>
        </button>
      )}

      <button className="pwa-dismiss-btn" onClick={handleDismiss} aria-label="إغلاق">
        <X size={18} />
      </button>
    </div>
  )
}
