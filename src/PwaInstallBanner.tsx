import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (localStorage.getItem('pwa-banner-dismissed')) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setTimeout(() => setVisible(true), 2000)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstalled(true))

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setInstalled(true)
    }
    setVisible(false)
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setVisible(false)
    localStorage.setItem('pwa-banner-dismissed', '1')
  }

  if (!visible || installed) return null

  return (
    <div className="pwa-banner">
      <div className="pwa-banner-icon">
        <img src="/pwa-192x192.png" alt="DZ GPT" width={44} height={44} />
      </div>
      <div className="pwa-banner-text">
        <span className="pwa-banner-title">تثبيت DZ GPT</span>
        <span className="pwa-banner-sub">أضف التطبيق إلى شاشتك الرئيسية</span>
      </div>
      <button className="pwa-install-btn" onClick={handleInstall}>
        <Download size={16} />
        <span>تثبيت</span>
      </button>
      <button className="pwa-dismiss-btn" onClick={handleDismiss}>
        <X size={18} />
      </button>
    </div>
  )
}
