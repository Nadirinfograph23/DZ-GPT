import { useState, useRef, useEffect, useCallback } from 'react'
import '../styles/dz-robot.css'

const MESSAGES_NORMAL = [
  'مرحباً! أنا DZ Agent 🤖',
  'كيف يمكنني مساعدتك اليوم؟',
  'جربني في DZ AGENT!',
  'أنا هنا لخدمتك 💚',
  'تكلم معي بالدارجة!',
  'اختر أداة وابدأ! 🚀',
]

const MESSAGES_ANGRY = [
  'واش دارك بيا?! 😠',
  'رمتني بقوة! 😤',
  'هدّي شوية! 😡',
  'هذا مش لعب! 😾',
]

export default function DZRobot() {
  const [pos, setPos] = useState({ x: -1, y: -1 })
  const [isDragging, setIsDragging] = useState(false)
  const [isHappy, setIsHappy] = useState(false)
  const [isAngry, setIsAngry] = useState(false)
  const [msgIdx, setMsgIdx] = useState(0)
  const [showMsg, setShowMsg] = useState(true)
  const [blink, setBlink] = useState(false)
  const [wobble, setWobble] = useState(false)
  const robotRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0, t: 0 })
  const velocity = useRef({ vx: 0, vy: 0 })
  const angryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPos({ x: window.innerWidth - 110, y: window.innerHeight - 210 })
    }
  }, [])

  // Blink
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true)
      setTimeout(() => setBlink(false), 180)
    }, 3200)
    return () => clearInterval(id)
  }, [])

  // Message cycle
  useEffect(() => {
    const id = setInterval(() => {
      if (!isAngry) setMsgIdx(i => (i + 1) % MESSAGES_NORMAL.length)
    }, 4000)
    return () => clearInterval(id)
  }, [isAngry])

  const triggerAngry = useCallback(() => {
    setIsAngry(true)
    setIsHappy(false)
    setMsgIdx(Math.floor(Math.random() * MESSAGES_ANGRY.length))
    setShowMsg(true)
    if (angryTimer.current) clearTimeout(angryTimer.current)
    angryTimer.current = setTimeout(() => {
      setIsAngry(false)
      setMsgIdx(0)
    }, 3000)
  }, [])

  const startDrag = useCallback((clientX: number, clientY: number) => {
    if (!robotRef.current) return
    const rect = robotRef.current.getBoundingClientRect()
    dragOffset.current = { x: clientX - rect.left, y: clientY - rect.top }
    dragging.current = true
    lastPos.current = { x: clientX, y: clientY, t: Date.now() }
    velocity.current = { vx: 0, vy: 0 }
    setIsDragging(true)
    setIsHappy(true)
    setIsAngry(false)
    setWobble(true)
    setTimeout(() => setWobble(false), 500)
  }, [])

  const moveDrag = useCallback((clientX: number, clientY: number) => {
    if (!dragging.current) return
    const now = Date.now()
    const dt = now - lastPos.current.t
    if (dt > 0) {
      velocity.current = {
        vx: (clientX - lastPos.current.x) / dt,
        vy: (clientY - lastPos.current.y) / dt,
      }
    }
    lastPos.current = { x: clientX, y: clientY, t: now }

    const nx = clientX - dragOffset.current.x
    const ny = clientY - dragOffset.current.y
    const maxX = window.innerWidth - 90
    const maxY = window.innerHeight - 130
    setPos({
      x: Math.max(0, Math.min(nx, maxX)),
      y: Math.max(0, Math.min(ny, maxY)),
    })
  }, [])

  const endDrag = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    setIsDragging(false)
    setIsHappy(false)

    const { vx, vy } = velocity.current
    const speed = Math.sqrt(vx * vx + vy * vy)
    if (speed > 1.2) {
      triggerAngry()
    }
  }, [triggerAngry])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY)
    const onMouseUp = () => endDrag()
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return   // only block scroll when actually dragging the robot
      e.preventDefault()
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

  const messages = isAngry ? MESSAGES_ANGRY : MESSAGES_NORMAL

  const handleHide = (e: React.MouseEvent) => {
    e.stopPropagation()
    localStorage.setItem('dz-robot-hidden', '1')
    window.dispatchEvent(new Event('dz-robot-toggle'))
  }

  return (
    <div
      ref={robotRef}
      className={[
        'dzr-root',
        isDragging ? 'dzr-root--dragging' : '',
        wobble ? 'dzr-root--wobble' : '',
        isAngry ? 'dzr-root--angry' : '',
      ].filter(Boolean).join(' ')}
      style={{ left: pos.x, top: pos.y }}
      onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY) }}
      onTouchStart={e => { if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY) }}
      onMouseEnter={() => { if (!isAngry) { setShowMsg(true); setIsHappy(true) } }}
      onMouseLeave={() => { if (!isDragging && !isAngry) setIsHappy(false) }}
    >
      {showMsg && (
        <div className={`dzr-bubble${isAngry ? ' dzr-bubble--angry' : ''}`} dir="rtl">
          <span>{messages[msgIdx]}</span>
          <button className="dzr-bubble-close" onClick={e => { e.stopPropagation(); setShowMsg(false) }}>×</button>
        </div>
      )}

      <svg
        className={[
          'dzr-svg',
          isDragging ? 'dzr-svg--held' : '',
          isAngry ? 'dzr-svg--angry' : '',
        ].filter(Boolean).join(' ')}
        viewBox="0 0 80 100"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="rg1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={isAngry ? '#ff4444' : '#c8ff00'} />
            <stop offset="100%" stopColor={isAngry ? '#ff0000' : '#00d4aa'} />
          </linearGradient>
          <linearGradient id="rg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isAngry ? '#2a0a0a' : '#1a2a1a'} />
            <stop offset="100%" stopColor={isAngry ? '#1a0000' : '#0a1a0a'} />
          </linearGradient>
          <filter id="rglow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Antenna */}
        <line x1="40" y1="6" x2="40" y2="18" stroke="url(#rg1)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="40" cy="4" r="4" fill="url(#rg1)" filter="url(#rglow)" className="dzr-antenna-ball" />

        {/* Head */}
        <rect x="14" y="18" width="52" height="40" rx="12" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.5" />

        {/* Eye sockets */}
        <circle cx="28" cy="35" r="8" fill={isAngry ? '#2a0000' : '#0d1f0d'} stroke="url(#rg1)" strokeWidth="1.5" />
        <circle cx="52" cy="35" r="8" fill={isAngry ? '#2a0000' : '#0d1f0d'} stroke="url(#rg1)" strokeWidth="1.5" />

        {/* Angry eyebrows */}
        {isAngry && (
          <>
            <line x1="21" y1="27" x2="33" y2="30" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="47" y1="30" x2="59" y2="27" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round" />
          </>
        )}

        {/* Eyes */}
        {blink ? (
          <>
            <rect x="22" y="33" width="12" height="3" rx="1.5" fill={isAngry ? '#ff4444' : '#c8ff00'} />
            <rect x="46" y="33" width="12" height="3" rx="1.5" fill={isAngry ? '#ff4444' : '#c8ff00'} />
          </>
        ) : (
          <>
            <circle cx="28" cy="35" r={isHappy ? 5 : 4} fill="url(#rg1)" className="dzr-eye" />
            <circle cx="52" cy="35" r={isHappy ? 5 : 4} fill="url(#rg1)" className="dzr-eye" />
            <circle cx="30" cy="33" r="1.5" fill="white" opacity="0.7" />
            <circle cx="54" cy="33" r="1.5" fill="white" opacity="0.7" />
          </>
        )}

        {/* Mouth */}
        {isAngry ? (
          <path d="M27 55 Q40 49 53 55" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        ) : isHappy ? (
          <path d="M27 50 Q40 58 53 50" stroke="url(#rg1)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M28 52 Q40 56 52 52" stroke="url(#rg1)" strokeWidth="2" strokeLinecap="round" fill="none" />
        )}

        {/* Body */}
        <rect x="16" y="60" width="48" height="30" rx="8" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.5" />
        <rect x="26" y="66" width="28" height="5" rx="2.5" fill="url(#rg1)" opacity="0.6" />
        <rect x="29" y="75" width="22" height="4" rx="2" fill="url(#rg1)" opacity="0.4" />

        {/* Arms */}
        <rect x="6" y="62" width="10" height="20" rx="5" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.2"
          className={isDragging ? 'dzr-arm-r' : isAngry ? 'dzr-arm-angry-r' : ''} />
        <rect x="64" y="62" width="10" height="20" rx="5" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.2"
          className={isDragging ? 'dzr-arm-l' : isAngry ? 'dzr-arm-angry-l' : ''} />

        {/* Chest LEDs */}
        <circle cx="21" cy="62" r="3" fill="url(#rg1)" opacity="0.5" filter="url(#rglow)" className="dzr-chest-led" />
        <circle cx="59" cy="62" r="3" fill="url(#rg1)" opacity="0.5" filter="url(#rglow)" className="dzr-chest-led" />
      </svg>

      <div className={`dzr-label${isAngry ? ' dzr-label--angry' : ''}`}>DZ Agent</div>

      <button
        className="dzr-hide-btn"
        onClick={handleHide}
        title="إخفاء الروبوت"
        aria-label="إخفاء الروبوت"
      >
        ×
      </button>
    </div>
  )
}
