import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Radio } from 'lucide-react'

interface BreakingItem {
  title: string
  link: string
  source: string
  pubDate?: string
}

export default function BreakingNewsBanner() {
  const [items, setItems]       = useState<BreakingItem[]>([])
  const [visible, setVisible]   = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [tickerIdx, setTickerIdx] = useState(0)
  const esRef   = useRef<EventSource | null>(null)
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
    function connect() {
      const es = new EventSource('/api/breaking-news/stream')
      esRef.current = es

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.type === 'breaking_news' && Array.isArray(data.items) && data.items.length > 0) {
            showBanner(data.items)
          }
        } catch {}
      }

      es.onerror = () => {
        es.close()
        // إعادة الاتصال بعد 30 ثانية
        setTimeout(connect, 30_000)
      }
    }

    connect()

    return () => {
      esRef.current?.close()
      if (timerRef.current)  clearTimeout(timerRef.current)
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
        background: 'linear-gradient(90deg, #b91c1c 0%, #dc2626 40%, #7f1d1d 100%)',
        color:      '#fff',
        display:    'flex',
        alignItems: 'center',
        gap:        12,
        padding:    '10px 16px',
        boxShadow:  '0 3px 16px rgba(180,0,0,.5)',
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

      {/* أيقونة البث */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
        <span className="bz-dot" style={{ color:'#fca5a5', display:'flex' }}>
          <Radio size={16} />
        </span>
        <span style={{ background:'#fca5a5', color:'#7f1d1d', fontSize:11, fontWeight:800, padding:'2px 7px', borderRadius:4, letterSpacing:1, flexShrink:0 }}>
          عاجل
        </span>
      </div>

      {/* مؤشر تعدد الأخبار */}
      {items.length > 1 && (
        <span style={{ fontSize:11, color:'#fca5a5', flexShrink:0, fontWeight:600 }}>
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
        <span style={{ fontSize:11, color:'#fca5a5', marginTop:2, display:'block' }}>
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
