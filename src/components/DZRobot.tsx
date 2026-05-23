import { useState, useRef, useEffect, useCallback } from 'react'
import '../styles/dz-robot.css'

const MESSAGES = [
  'مرحباً! أنا DZ Agent 🤖',
  'كيف يمكنني مساعدتك اليوم؟',
  'جربني في DZ AGENT!',
  'أنا هنا لخدمتك 💚',
  'تكلم معي بالدارجة!',
  'اختر أداة وابدأ! 🚀',
]

export default function DZRobot() {
  const [pos, setPos] = useState({ x: -1, y: -1 })
  const [isDragging, setIsDragging] = useState(false)
  const [isHappy, setIsHappy] = useState(false)
  const [msgIdx, setMsgIdx] = useState(0)
  const [showMsg, setShowMsg] = useState(true)
  const [blink, setBlink] = useState(false)
  const [wobble, setWobble] = useState(false)
  const robotRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPos({ x: window.innerWidth - 100, y: window.innerHeight - 200 })
    }
  }, [])

  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlink(true)
      setTimeout(() => setBlink(false), 180)
    }, 3200)
    return () => clearInterval(blinkInterval)
  }, [])

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setMsgIdx(i => (i + 1) % MESSAGES.length)
    }, 4000)
    return () => clearInterval(msgInterval)
  }, [])

  const startDrag = useCallback((clientX: number, clientY: number) => {
    if (!robotRef.current) return
    const rect = robotRef.current.getBoundingClientRect()
    dragOffset.current = { x: clientX - rect.left, y: clientY - rect.top }
    dragging.current = true
    setIsDragging(true)
    setIsHappy(true)
    setWobble(true)
    setTimeout(() => setWobble(false), 500)
  }, [])

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    if (!dragging.current) return
    const nx = clientX - dragOffset.current.x
    const ny = clientY - dragOffset.current.y
    const maxX = window.innerWidth - 80
    const maxY = window.innerHeight - 120
    setPos({
      x: Math.max(0, Math.min(nx, maxX)),
      y: Math.max(0, Math.min(ny, maxY)),
    })
  }, [])

  const endDrag = useCallback(() => {
    dragging.current = false
    setIsDragging(false)
    setIsHappy(false)
  }, [])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY)
    const onMouseUp = () => endDrag()
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) moveDrag(e.touches[0].clientX, e.touches[0].clientY)
    }
    const onTouchEnd = () => endDrag()
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [moveDrag, endDrag])

  if (pos.x === -1) return null

  return (
    <div
      ref={robotRef}
      className={`dzr-root${isDragging ? ' dzr-root--dragging' : ''}${wobble ? ' dzr-root--wobble' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={e => startDrag(e.clientX, e.clientY)}
      onTouchStart={e => { if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY) }}
      onMouseEnter={() => { setShowMsg(true); setIsHappy(true) }}
      onMouseLeave={() => { if (!isDragging) setIsHappy(false) }}
    >
      {showMsg && (
        <div className="dzr-bubble" dir="rtl">
          <span>{MESSAGES[msgIdx]}</span>
          <button className="dzr-bubble-close" onClick={e => { e.stopPropagation(); setShowMsg(false) }}>×</button>
        </div>
      )}

      <svg className={`dzr-svg${isDragging ? ' dzr-svg--held' : ''}`} viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="rg1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c8ff00" />
            <stop offset="100%" stopColor="#00d4aa" />
          </linearGradient>
          <linearGradient id="rg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a2a1a" />
            <stop offset="100%" stopColor="#0a1a0a" />
          </linearGradient>
          <filter id="rglow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <line x1="40" y1="6" x2="40" y2="18" stroke="url(#rg1)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="40" cy="4" r="4" fill="url(#rg1)" filter="url(#rglow)" className="dzr-antenna-ball" />

        <rect x="14" y="18" width="52" height="40" rx="12" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.5" />

        <circle cx="28" cy="35" r="8" fill="#0d1f0d" stroke="url(#rg1)" strokeWidth="1.5" />
        <circle cx="52" cy="35" r="8" fill="#0d1f0d" stroke="url(#rg1)" strokeWidth="1.5" />

        {blink ? (
          <>
            <rect x="22" y="33" width="12" height="3" rx="1.5" fill="#c8ff00" />
            <rect x="46" y="33" width="12" height="3" rx="1.5" fill="#c8ff00" />
          </>
        ) : (
          <>
            <circle cx="28" cy="35" r={isHappy ? 5 : 4} fill="url(#rg1)" className="dzr-eye" />
            <circle cx="52" cy="35" r={isHappy ? 5 : 4} fill="url(#rg1)" className="dzr-eye" />
            <circle cx="30" cy="33" r="1.5" fill="white" opacity="0.7" />
            <circle cx="54" cy="33" r="1.5" fill="white" opacity="0.7" />
          </>
        )}

        {isHappy ? (
          <path d="M27 50 Q40 58 53 50" stroke="url(#rg1)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M28 52 Q40 56 52 52" stroke="url(#rg1)" strokeWidth="2" strokeLinecap="round" fill="none" />
        )}

        <rect x="16" y="60" width="48" height="30" rx="8" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.5" />
        <rect x="26" y="66" width="28" height="5" rx="2.5" fill="url(#rg1)" opacity="0.6" />
        <rect x="29" y="75" width="22" height="4" rx="2" fill="url(#rg1)" opacity="0.4" />

        <rect x="6" y="62" width="10" height="20" rx="5" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.2" className={isDragging ? 'dzr-arm-r' : ''} />
        <rect x="64" y="62" width="10" height="20" rx="5" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.2" className={isDragging ? 'dzr-arm-l' : ''} />

        <circle cx="21" cy="62" r="3" fill="url(#rg1)" opacity="0.5" filter="url(#rglow)" className="dzr-chest-led" />
        <circle cx="59" cy="62" r="3" fill="url(#rg1)" opacity="0.5" filter="url(#rglow)" className="dzr-chest-led" />
      </svg>

      <div className="dzr-label">DZ Agent</div>
    </div>
  )
}
