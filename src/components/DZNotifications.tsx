import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, X, ExternalLink, TrendingUp, TrendingDown, Newspaper, AlertTriangle, CheckCircle2, BellOff } from 'lucide-react'
import '../styles/dz-notifications.css'

export interface DZNotif {
  id: string
  type: 'breaking' | 'currency_up' | 'currency_down' | 'info' | 'task'
  title: string
  body: string
  link?: string
  source?: string
  time: number
  read: boolean
}

interface Props {
  theme?: string
}

function playAlertTone(type: 'breaking' | 'currency') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (type === 'breaking') {
      const freqs = [880, 660, 880]
      let t = ctx.currentTime + 0.05
      freqs.forEach((f) => {
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'square'; o.frequency.value = f
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.18, t + 0.02)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
        o.start(t); o.stop(t + 0.14)
        t += 0.16
      })
    } else {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.type = 'sine'; o.frequency.setValueAtTime(523, ctx.currentTime + 0.05)
      o.frequency.linearRampToValueAtTime(659, ctx.currentTime + 0.2)
      g.gain.setValueAtTime(0, ctx.currentTime + 0.05)
      g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.07)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      o.start(ctx.currentTime + 0.05); o.stop(ctx.currentTime + 0.35)
    }
  } catch {}
}

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', SAR: '🇸🇦', AED: '🇦🇪'
}

export default function DZNotifications({ theme }: Props) {
  const [notifs, setNotifs]       = useState<DZNotif[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [toast, setToast]         = useState<DZNotif | null>(null)
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default')
  const toastTimer                = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevRates                 = useRef<Record<string, number>>({})
  const seenLinks                 = useRef<Set<string>>(new Set())
  const panelRef                  = useRef<HTMLDivElement>(null)

  // ── Sync browser notification permission state ───────────────────────────────
  useEffect(() => {
    if ('Notification' in window) setNotifPerm(Notification.permission)
  }, [])

  // ── Request browser notification permission ──────────────────────────────────
  async function requestNotifPerm() {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifPerm(perm)
  }

  // ── Send browser push (only when tab is hidden) ──────────────────────────────
  const browserPush = useCallback((title: string, body: string) => {
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') return
    if (!document.hidden) return          // tab is visible — in-app toast is enough

    // استخدم SW registration إذا كان متاحاً — أكثر موثوقية وأشمل دعماً
    const swReg = (window as any).__swRegistration as ServiceWorkerRegistration | undefined
    if (swReg?.showNotification) {
      swReg.showNotification(title, {
        body,
        icon:    '/pwa-192x192.png',
        badge:   '/pwa-192x192.png',
        tag:     'dz-task',
        dir:     'rtl',
        lang:    'ar',
        vibrate: [200, 100, 200],
      } as NotificationOptions).catch(() => {})
      return
    }
    // fallback: Notification API المباشر
    try {
      new Notification(title, {
        body,
        icon: '/pwa-192x192.png',
        tag:  'dz-task',
        dir:  'rtl',
        lang: 'ar',
      } as NotificationOptions)
    } catch {}
  }, [])

  const addNotif = useCallback((n: Omit<DZNotif, 'id' | 'time' | 'read'>) => {
    const notif: DZNotif = { ...n, id: genId(), time: Date.now(), read: false }
    setNotifs(prev => [notif, ...prev].slice(0, 50))
    setToast(notif)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 7000)
    if (n.type === 'task') {
      playAlertTone('breaking')
    } else {
      playAlertTone(n.type === 'breaking' ? 'breaking' : 'currency')
    }
  }, [])

  // ── Listen: V5 task-complete custom event ────────────────────────────────────
  useEffect(() => {
    function onTaskComplete(e: Event) {
      const { title, body } = (e as CustomEvent).detail as { title: string; body: string }
      addNotif({ type: 'task', title, body })
      browserPush(title, body)
    }
    window.addEventListener('dz:task-complete', onTaskComplete)
    return () => window.removeEventListener('dz:task-complete', onTaskComplete)
  }, [addNotif, browserPush])

  // ── SSE: Breaking News ──────────────────────────────────────────────────────
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      es = new EventSource('/api/breaking-news/stream')
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'breaking_news' && Array.isArray(data.items)) {
            data.items.forEach((item: any) => {
              if (!item?.title) return
              const key = item.link || item.title
              if (seenLinks.current.has(key)) return
              seenLinks.current.add(key)
              addNotif({
                type: 'breaking',
                title: '🔴 خبر عاجل',
                body: item.title,
                link: item.link,
                source: item.source,
              })
            })
          }
        } catch {}
      }
      es.onerror = () => {
        es?.close()
        retryTimer = setTimeout(connect, 30000)
      }
    }

    connect()
    return () => { es?.close(); if (retryTimer) clearTimeout(retryTimer) }
  }, [addNotif])

  // ── Poll: Currency Rate Changes ─────────────────────────────────────────────
  useEffect(() => {
    const THRESHOLD = 0.012 // 1.2% change triggers alert
    const TRACKED   = ['USD', 'EUR', 'GBP', 'SAR', 'AED']

    async function checkRates() {
      try {
        const res = await fetch('/api/currency/latest')
        if (!res.ok) return
        const data = await res.json()
        const rates: Record<string, number> = data.rates || {}
        const prev = prevRates.current

        TRACKED.forEach(code => {
          const cur = rates[code]
          const old = prev[code]
          if (!cur || !old) return
          const delta = (cur - old) / old
          if (Math.abs(delta) < THRESHOLD) return
          const pct   = (delta * 100).toFixed(2)
          const dir   = delta > 0 ? 'currency_up' : 'currency_down'
          const arrow = delta > 0 ? '📈' : '📉'
          const flag  = CURRENCY_SYMBOLS[code] || ''
          addNotif({
            type: dir,
            title: `${arrow} تغيّر سعر ${flag} ${code}`,
            body: `سعر ${code} تغيّر بـ ${pct}% — 1 ${code} = ${(1 / cur).toFixed(2)} دج`,
          })
        })
        prevRates.current = rates
      } catch {}
    }

    checkRates()
    const interval = setInterval(checkRates, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [addNotif])

  // ── Close panel on outside click ────────────────────────────────────────────
  useEffect(() => {
    if (!panelOpen) return
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [panelOpen])

  const unread = notifs.filter(n => !n.read).length

  function markAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  function dismiss(id: string) {
    setNotifs(prev => prev.filter(n => n.id !== id))
  }

  function openPanel() {
    setPanelOpen(p => !p)
    if (!panelOpen) markAllRead()
  }

  function typeIcon(type: DZNotif['type']) {
    switch (type) {
      case 'breaking':      return <Newspaper    size={14} className="dzn-icon dzn-icon--breaking" />
      case 'currency_up':   return <TrendingUp   size={14} className="dzn-icon dzn-icon--up" />
      case 'currency_down': return <TrendingDown size={14} className="dzn-icon dzn-icon--down" />
      case 'task':          return <CheckCircle2 size={14} className="dzn-icon dzn-icon--task" />
      default:              return <AlertTriangle size={14} className="dzn-icon dzn-icon--info" />
    }
  }

  function timeAgo(ts: number) {
    const diff = (Date.now() - ts) / 1000
    if (diff < 60)   return 'الآن'
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`
    return `منذ ${Math.floor(diff / 86400)} ي`
  }

  return (
    <div className="dzn-root" data-theme={theme}>
      {/* Bell button */}
      <button
        className={`dzn-bell-btn${unread > 0 ? ' dzn-bell-btn--active' : ''}`}
        onClick={openPanel}
        title={`الإشعارات${unread > 0 ? ` (${unread} جديد)` : ''}`}
      >
        <Bell size={18} className={unread > 0 ? 'dzn-bell-ring' : ''} />
        {unread > 0 && (
          <span className="dzn-badge">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {/* Toast popup */}
      {toast && (
        <div
          className={`dzn-toast dzn-toast--${toast.type}`}
          onClick={() => { setToast(null); if (toast.link) window.open(toast.link, '_blank') }}
        >
          <div className="dzn-toast-header">
            {typeIcon(toast.type)}
            <span className="dzn-toast-title">{toast.title}</span>
            <button className="dzn-toast-close" onClick={e => { e.stopPropagation(); setToast(null) }}>
              <X size={12} />
            </button>
          </div>
          <p className="dzn-toast-body">{toast.body}</p>
          {toast.source && <span className="dzn-toast-source">{toast.source}</span>}
          <div className="dzn-toast-bar" />
        </div>
      )}

      {/* Panel */}
      {panelOpen && (
        <div className="dzn-panel" ref={panelRef}>
          <div className="dzn-panel-header">
            <span className="dzn-panel-title">
              <Bell size={15} /> الإشعارات
              {unread > 0 && <span className="dzn-panel-count">{unread}</span>}
            </span>
            <div className="dzn-panel-actions">
              {notifs.length > 0 && (
                <button className="dzn-panel-clear" onClick={() => setNotifs([])}>مسح الكل</button>
              )}
              <button className="dzn-panel-close" onClick={() => setPanelOpen(false)}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Browser notification permission banner */}
          {'Notification' in window && notifPerm === 'default' && (
            <div className="dzn-perm-banner">
              <Bell size={13} />
              <span>فعّل إشعارات المتصفح لتلقي تنبيهات حتى عند التبديل للتبويب الآخر</span>
              <button className="dzn-perm-btn" onClick={requestNotifPerm}>تفعيل</button>
            </div>
          )}
          {'Notification' in window && notifPerm === 'denied' && (
            <div className="dzn-perm-banner dzn-perm-banner--denied" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BellOff size={13} />
                <strong>الإشعارات محظورة في هذا المتصفح</strong>
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--dzn-denied-text, #f87171)', paddingRight: 4 }}>
                {(() => {
                  const ua = navigator.userAgent
                  if (/Firefox/i.test(ua)) return (
                    <ol style={{ margin: 0, paddingRight: 16 }}>
                      <li>انقر على أيقونة 🔒 في شريط العنوان</li>
                      <li>اختر <b>إذونات الموقع</b></li>
                      <li>ابحث عن <b>إرسال الإشعارات</b> → اضبطها على <b>السماح</b></li>
                      <li>أعد تحميل الصفحة</li>
                    </ol>
                  )
                  if (/Edg/i.test(ua)) return (
                    <ol style={{ margin: 0, paddingRight: 16 }}>
                      <li>انقر على 🔒 في شريط العنوان</li>
                      <li>اختر <b>الأذونات لهذا الموقع</b></li>
                      <li>اضبط <b>الإشعارات</b> على <b>السماح</b></li>
                      <li>أعد تحميل الصفحة</li>
                    </ol>
                  )
                  if (/OPR|Opera/i.test(ua)) return (
                    <ol style={{ margin: 0, paddingRight: 16 }}>
                      <li>انقر على أيقونة القفل 🔒 في شريط العنوان</li>
                      <li>اختر <b>إعدادات الموقع</b></li>
                      <li>اضبط <b>الإشعارات</b> على <b>السماح</b></li>
                    </ol>
                  )
                  // Chrome (default)
                  return (
                    <ol style={{ margin: 0, paddingRight: 16 }}>
                      <li>انقر على أيقونة 🔒 يسار شريط العنوان</li>
                      <li>اختر <b>إعدادات الموقع</b></li>
                      <li>ابحث عن <b>الإشعارات</b> → اضبطها على <b>السماح</b></li>
                      <li>أعد تحميل الصفحة</li>
                    </ol>
                  )
                })()}
              </div>
            </div>
          )}
          {'Notification' in window && notifPerm === 'granted' && (
            <div className="dzn-perm-banner dzn-perm-banner--ok">
              <CheckCircle2 size={13} />
              <span>إشعارات المتصفح مفعّلة ✓</span>
            </div>
          )}

          <div className="dzn-panel-list">
            {notifs.length === 0 ? (
              <div className="dzn-panel-empty">
                <Bell size={32} />
                <p>لا توجد إشعارات بعد</p>
                <small>سيتم إشعارك بالأخبار العاجلة وتغيرات الصرف</small>
              </div>
            ) : notifs.map(n => (
              <div
                key={n.id}
                className={`dzn-item dzn-item--${n.type}${n.read ? '' : ' dzn-item--unread'}`}
              >
                <div className="dzn-item-icon">{typeIcon(n.type)}</div>
                <div className="dzn-item-body">
                  <div className="dzn-item-title">{n.title}</div>
                  <div className="dzn-item-text">{n.body}</div>
                  <div className="dzn-item-meta">
                    <span className="dzn-item-time">{timeAgo(n.time)}</span>
                    {n.source && <span className="dzn-item-source">{n.source}</span>}
                    {n.link && (
                      <a href={n.link} target="_blank" rel="noreferrer" className="dzn-item-link">
                        <ExternalLink size={11} /> فتح
                      </a>
                    )}
                  </div>
                </div>
                <button className="dzn-item-dismiss" onClick={() => dismiss(n.id)} title="حذف">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
