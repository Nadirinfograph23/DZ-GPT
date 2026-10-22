import { useState, useEffect, useRef, useCallback } from 'react'
import { Newspaper, X } from 'lucide-react'

function safeNewsUrl(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''
  } catch {
    return ''
  }
}

interface BreakingItem {
  title: string
  link: string
  source: string
  pubDate?: string
}

export default function BreakingNewsBanner() {
  const [items, setItems]           = useState<BreakingItem[]>([])
  const seenNewsRef = useRef(new Set<string>())
  const [visible, setVisible]       = useState(false)
  const [dismissed, setDismissed]   = useState(false)
  const [tickerIdx, setTickerIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const dismiss = useCallback(() => {
    setVisible(false)
    setDismissed(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (tickerRef.current) clearInterval(tickerRef.current)
  }, [])

  const showBanner = useCallback((newItems: BreakingItem[]) => {
    setItems(newItems)
    setTickerIdx(0)
    setDismissed(false)
    setVisible(true)

    // تقليب العناوين كل 6 ثوانٍ إذا كان هناك أكثر من خبر
    if (tickerRef.current) clearInterval(tickerRef.current)
    if (newItems.length > 1) {
      tickerRef.current = setInterval(() => {
        setTickerIdx(i => (i + 1) % newItems.length)
      }, 6000)
    }

    // إخفاء تلقائي بعد 45 ثانية
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 45_000)
  }, [])

  useEffect(() => {
    let disposed = false
    let activeController: AbortController | null = null

    async function fetchLatestNews() {
      activeController?.abort()
      const controller = new AbortController()
      activeController = controller
      const timeout = window.setTimeout(() => controller.abort(), 10_000)
      try {
        const response = await fetch('/api/dz-agent/news?limit=8', {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (!response.ok) return
        const payload = await response.json()
        if (disposed) return

        const feedItems = Array.isArray(payload?.items) ? payload.items : []
        const seen = seenNewsRef.current
        const fresh: BreakingItem[] = []

        for (const item of feedItems) {
          const title = typeof item?.title === 'string' ? item.title.trim() : ''
          const key = title.toLowerCase().replace(/\s+/g, ' ')
          if (!title || seen.has(key)) continue
          seen.add(key)
          const pubDate = typeof item.pubDate === 'string' && Number.isFinite(Date.parse(item.pubDate))
            ? item.pubDate
            : undefined
          fresh.push({
            title,
            link: safeNewsUrl(item.link || item.url),
            source: String(item.source || item.feedName || 'مصدر RSS'),
            pubDate,
          })
        }

        while (seen.size > 100) {
          const oldest = seen.values().next().value
          if (!oldest) break
          seen.delete(oldest)
        }

        if (fresh.length) showBanner(fresh.slice(0, 8))
      } catch {
        // RSS fetch failures are transient; retry on the next polling interval.
      } finally {
        window.clearTimeout(timeout)
      }
    }

    void fetchLatestNews()
    const interval = window.setInterval(() => { void fetchLatestNews() }, 5 * 60 * 1000)
    return () => {
      disposed = true
      activeController?.abort()
      window.clearInterval(interval)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (tickerRef.current) clearInterval(tickerRef.current)
    }
  }, [showBanner])

  if (!visible || dismissed || items.length === 0) return null

  const current = items[tickerIdx] ?? items[0]

  return (
    <div
      dir="rtl"
      style={{
        position:   'fixed',
        top:        0,
        left:       0,
        right:      0,
        zIndex:     99999,
        background: 'linear-gradient(90deg, #1e3a8a 0%, #2563eb 45%, #1e40af 100%)',
        color:      '#fff',
        display:    'flex',
        alignItems: 'center',
        gap:        12,
        padding:    '10px 16px',
        boxShadow:  '0 3px 16px rgba(37,99,235,.38)',
        fontFamily: 'inherit',
        animation:  'bzSlideDown .35s ease',
      }}
    >
      <style>{`
        @keyframes bzSlideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes bzPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: .4; }
        }
        .bz-dot { animation: bzPulse 1.1s ease-in-out infinite; }
      `}</style>

      {/* أيقونة الأخبار */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
        <span className="bz-dot" style={{ color:'#bfdbfe', display:'flex' }}>
          <Newspaper size={16} />
        </span>
        <span style={{
          background: '#dbeafe',
          color:      '#1e3a8a',
          fontSize:11, fontWeight:800, padding:'2px 7px', borderRadius:4, letterSpacing:1, flexShrink:0
        }}>
          📰 أخبار الجزائر
        </span>
      </div>

      {/* مؤشر تعدد الأخبار */}
      {items.length > 1 && (
        <span style={{ fontSize:11, color:'#dbeafe', flexShrink:0, fontWeight:600 }}>
          {tickerIdx + 1}/{items.length}
        </span>
      )}

      {/* العنوان + المصدر */}
      <div style={{ flex:1, minWidth:0 }}>
        {current.link ? (
          <a
            href={current.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color:'#fff', textDecoration:'none', fontWeight:700, fontSize:14, lineHeight:1.4, display:'block' }}
          >
            {current.title}
          </a>
        ) : (
          <span style={{ fontWeight:700, fontSize:14, lineHeight:1.4, display:'block' }}>
            {current.title}
          </span>
        )}
        <span style={{ fontSize:11, color:'#dbeafe', marginTop:2, display:'block' }}>
          📡 {current.source}
          {current.pubDate ? ` · ${new Date(current.pubDate).toLocaleTimeString('ar-DZ', { hour:'2-digit', minute:'2-digit' })}` : ''}
        </span>
      </div>

      {/* أزرار التنقل بين الأخبار */}
      {items.length > 1 && (
        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
          <button
            onClick={() => setTickerIdx(i => (i - 1 + items.length) % items.length)}
            style={{ background:'rgba(255,255,255,.15)', border:'none', color:'#fff', borderRadius:4, width:24, height:24, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}
          >‹</button>
          <button
            onClick={() => setTickerIdx(i => (i + 1) % items.length)}
            style={{ background:'rgba(255,255,255,.15)', border:'none', color:'#fff', borderRadius:4, width:24, height:24, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}
          >›</button>
        </div>
      )}

      {/* زر الإغلاق */}
      <button
        onClick={dismiss}
        aria-label="إغلاق"
        style={{ background:'rgba(255,255,255,.15)', border:'none', color:'#fff', borderRadius:4, width:26, height:26, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
