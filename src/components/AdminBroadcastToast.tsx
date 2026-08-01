/**
 * AdminBroadcastToast — بانر إذاعة المشرف العالمي
 *
 * مُركَّب مباشرةً في main.tsx (خارج الصفحات) ليشمل كل زوار الموقع.
 * يستمع لـ SSE /api/notifications/stream ويعرض البانر فور وصول الرسالة.
 * تصميم: خلفية داكنة — خط أبيض — زر رابط اختياري — X للإغلاق الفوري.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Megaphone, ExternalLink, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface BroadcastMsg {
  id: string
  text: string
  from: string
  timestamp: number
  link?: string | null
  linkText?: string | null
}

const SEEN_KEY      = 'dz_bcast_seen_v1'
const PENDING_TS    = 'dz_pending_notif_ts'

function getSeenSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}
function markSeen(id: string) {
  try {
    const s = getSeenSet()
    s.add(id)
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-100)))
  } catch {}
}

export default function AdminBroadcastToast() {
  const [msg, setMsg]         = useState<BroadcastMsg | null>(null)
  const [visible, setVisible] = useState(false)
  const [animate, setAnimate] = useState(false)
  const navigate              = useNavigate()
  const dismissTimer          = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Show helper ──────────────────────────────────────────────────────── */
  const show = useCallback((data: BroadcastMsg) => {
    if (getSeenSet().has(data.id)) return
    markSeen(data.id)

    // إلغاء أي dismiss مؤجَّل
    if (dismissTimer.current) clearTimeout(dismissTimer.current)

    setMsg(data)
    setVisible(true)
    setAnimate(false)
    // إطار تالٍ لتشغيل الـ CSS transition
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)))
  }, [])

  /* ── Dismiss helper ───────────────────────────────────────────────────── */
  const dismiss = useCallback(() => {
    setAnimate(false)
    dismissTimer.current = setTimeout(() => {
      setVisible(false)
      setMsg(null)
    }, 350)
  }, [])

  /* ── Pending notifications on mount ──────────────────────────────────── */
  useEffect(() => {
    async function checkPending() {
      try {
        const res = await fetch('/api/pending-notifications', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const list: BroadcastMsg[] = data.notifications || []
        if (!list.length) return
        const lastTs = parseInt(localStorage.getItem(PENDING_TS) || '0', 10)
        const fresh  = list.filter(n => n.timestamp > lastTs && !getSeenSet().has(n.id))
        // أظهر الأحدث فقط (لا نكدّس بانرات)
        if (fresh.length) show(fresh[fresh.length - 1])
        const newest = list.reduce((m, n) => Math.max(m, n.timestamp), 0)
        if (newest > lastTs) localStorage.setItem(PENDING_TS, String(newest))
      } catch {}
    }
    checkPending()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── SSE stream ───────────────────────────────────────────────────────── */
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      es = new EventSource('/api/notifications/stream')

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'admin_broadcast' && data.id && data.text) {
            // تحديث timestamp المرجعي حتى لا يُعاد عرضه من الطابور
            try {
              const cur = parseInt(localStorage.getItem(PENDING_TS) || '0', 10)
              if (data.timestamp > cur) localStorage.setItem(PENDING_TS, String(data.timestamp))
            } catch {}
            show(data as BroadcastMsg)
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
    }
  }, [show])

  /* ── Link handler ─────────────────────────────────────────────────────── */
  const handleLink = (url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.origin === location.origin) {
        navigate(parsed.pathname + parsed.search)
        dismiss()
        return
      }
    } catch {}
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (!visible || !msg) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      dir="rtl"
      style={{
        position:       'fixed',
        top:            0,
        left:           0,
        right:          0,
        zIndex:         1000000,
        background:     'linear-gradient(90deg, #090e1a 0%, #0f172a 60%, #111827 100%)',
        borderBottom:   '1.5px solid rgba(52,211,153,0.35)',
        color:          '#ffffff',
        fontFamily:     "'Cairo', 'Segoe UI', sans-serif",
        padding:        '10px 14px',
        display:        'flex',
        alignItems:     'center',
        gap:            '10px',
        boxShadow:      '0 4px 28px rgba(0,0,0,0.65), 0 0 0 1px rgba(52,211,153,0.08) inset',
        transform:      animate ? 'translateY(0)' : 'translateY(-100%)',
        opacity:        animate ? 1 : 0,
        transition:     'transform 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease',
        minHeight:      44,
      }}
    >
      {/* ── Icon ── */}
      <span style={{ color: '#34d399', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <Megaphone size={16} />
      </span>

      {/* ── Badge ── */}
      <span style={{
        background:    'rgba(52,211,153,0.15)',
        border:        '1px solid rgba(52,211,153,0.3)',
        color:         '#34d399',
        fontSize:      10,
        fontWeight:    800,
        padding:       '2px 8px',
        borderRadius:  20,
        flexShrink:    0,
        whiteSpace:    'nowrap',
        letterSpacing: '0.02em',
      }}>
        إذاعة
      </span>

      {/* ── Divider ── */}
      <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />

      {/* ── Message text ── */}
      <span style={{
        flex:          1,
        fontSize:      13.5,
        fontWeight:    500,
        color:         '#f1f5f9',
        lineHeight:    1.45,
        overflow:      'hidden',
        textOverflow:  'ellipsis',
        whiteSpace:    'nowrap',
        minWidth:      0,
      }}>
        {msg.text}
      </span>

      {/* ── Link button ── */}
      {msg.link && (
        <button
          onClick={() => handleLink(msg.link!)}
          style={{
            background:    'rgba(52,211,153,0.12)',
            border:        '1px solid rgba(52,211,153,0.38)',
            color:         '#6ee7b7',
            padding:       '4px 14px',
            borderRadius:  20,
            cursor:        'pointer',
            fontSize:      12,
            fontWeight:    700,
            fontFamily:    'inherit',
            display:       'flex',
            alignItems:    'center',
            gap:           5,
            flexShrink:    0,
            whiteSpace:    'nowrap',
            transition:    'background 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.22)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.12)')}
        >
          {msg.linkText || 'انتقل'}
          <ArrowLeft size={11} />
          {(() => { try { return new URL(msg.link).origin !== location.origin } catch { return true } })() && (
            <ExternalLink size={10} style={{ marginRight: -2 }} />
          )}
        </button>
      )}

      {/* ── Sender ── */}
      <span style={{
        fontSize:   11,
        color:      '#475569',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        display:    'flex',
        alignItems: 'center',
        gap:        4,
      }}>
        <span style={{ color: '#334155' }}>من:</span>
        <span style={{ color: '#64748b', fontWeight: 600 }}>{msg.from}</span>
      </span>

      {/* ── Close ── */}
      <button
        onClick={dismiss}
        aria-label="إغلاق الإعلان"
        title="إغلاق"
        style={{
          background:  'transparent',
          border:      'none',
          color:       '#475569',
          cursor:      'pointer',
          padding:     '5px',
          borderRadius: 8,
          display:     'flex',
          alignItems:  'center',
          flexShrink:  0,
          transition:  'color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.background = 'transparent' }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
