import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Megaphone, ExternalLink } from 'lucide-react'
import '../styles/site-announcement.css'

interface Announcement {
  id: string
  text: string
  link: string | null
  linkText: string | null
  timestamp: number
  from: string
}

const POLL_INTERVAL = 30_000  // 30s — احتياطي فقط، SSE هو المسار الأساسي

export default function SiteAnnouncement() {
  const [ann, setAnn]         = useState<Announcement | null>(null)
  const [visible, setVisible] = useState(false)
  const [entering, setEntering] = useState(false)
  const dismissedRef           = useRef<string | null>(null)
  const showTimerRef           = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate               = useNavigate()

  // Initialise dismissed list from sessionStorage
  useEffect(() => {
    dismissedRef.current = sessionStorage.getItem('dz_ann_dismissed') || null
  }, [])

  const showAnn = useCallback((a: Announcement) => {
    if (dismissedRef.current === a.id) return
    setAnn(prev => {
      if (!prev || prev.id !== a.id) {
        setTimeout(() => setEntering(true), 50)
      }
      return a
    })
    setVisible(true)
  }, [])

  const fetchAnn = useCallback(async () => {
    try {
      const res = await fetch('/api/site-announcement', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const a: Announcement | null = data.announcement
      if (!a) { setAnn(null); setVisible(false); return }
      showAnn(a)
    } catch {}
  }, [showAnn])

  // ── Polling احتياطي ────────────────────────────────────────────────────────
  useEffect(() => {
    fetchAnn()
    const id = setInterval(fetchAnn, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchAnn])

  // ── SSE: استقبال فوري مع تأخير 8 ثوانٍ ───────────────────────────────────
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      es = new EventSource('/api/notifications/stream')
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'admin_broadcast' && data.id && data.text) {
            const a: Announcement = {
              id:        data.id,
              text:      data.text,
              from:      data.from || 'المشرف',
              timestamp: data.timestamp || Date.now(),
              link:      data.link   || null,
              linkText:  data.linkText || null,
            }
            // تأخير 8 ثوانٍ ثم عرض (نفس نمط رسالة التحديث)
            if (showTimerRef.current) clearTimeout(showTimerRef.current)
            showTimerRef.current = setTimeout(() => showAnn(a), 8_000)
          }
        } catch {}
      }
      es.onerror = () => {
        es?.close()
        retryTimer = setTimeout(connect, 15_000)
      }
    }

    connect()
    return () => {
      es?.close()
      if (retryTimer) clearTimeout(retryTimer)
      if (showTimerRef.current) clearTimeout(showTimerRef.current)
    }
  }, [showAnn])

  const dismiss = () => {
    if (ann) {
      dismissedRef.current = ann.id
      sessionStorage.setItem('dz_ann_dismissed', ann.id)
    }
    setEntering(false)
    setTimeout(() => setVisible(false), 350)
  }

  const handleLink = (url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.origin === location.origin) {
        navigate(parsed.pathname + parsed.search)
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  // Extract URLs embedded in the text
  const urlRegex = /(https?:\/\/[^\s،,؟?!)"']+)/g
  const inlineUrls: string[] = []
  ann?.text.replace(urlRegex, u => { inlineUrls.push(u); return u })

  // Build link list: explicit link first, then inline URLs (deduplicated, max 3)
  const allLinks = [...new Set([
    ...(ann?.link ? [ann.link] : []),
    ...inlineUrls,
  ])].slice(0, 3)

  // Clean the display text (strip raw URLs — shown as buttons instead)
  const cleanText = ann?.text.replace(urlRegex, '').replace(/\s{2,}/g, ' ').trim() ?? ''

  if (!visible || !ann) return null

  return (
    <div
      className={`site-ann-root ${entering ? 'site-ann-in' : ''}`}
      role="alert"
      aria-live="polite"
      dir="rtl"
    >
      <div className="site-ann-bar">
        {/* Icon */}
        <span className="site-ann-icon" aria-hidden="true">
          <Megaphone size={17} />
        </span>

        {/* Content */}
        <div className="site-ann-body">
          <span className="site-ann-text">{cleanText || ann.text}</span>

          {allLinks.length > 0 && (
            <span className="site-ann-links">
              {allLinks.map((url, i) => {
                // Label: explicit linkText for first link, else hostname
                let label = i === 0 && ann.linkText ? ann.linkText : ''
                if (!label) {
                  try { label = new URL(url).hostname.replace(/^www\./, '') } catch { label = 'انتقل' }
                }
                const isExternal = (() => { try { return new URL(url).origin !== location.origin } catch { return true } })()
                return (
                  <button
                    key={i}
                    className="site-ann-link-btn"
                    onClick={() => handleLink(url)}
                    title={url}
                  >
                    {isExternal && <ExternalLink size={11} />}
                    {label}
                  </button>
                )
              })}
            </span>
          )}
        </div>

        {/* Sender */}
        <span className="site-ann-from" title="المرسل">
          {ann.from}
        </span>

        {/* Dismiss */}
        <button
          className="site-ann-close"
          onClick={dismiss}
          aria-label="إغلاق الإعلان"
          title="إغلاق"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
