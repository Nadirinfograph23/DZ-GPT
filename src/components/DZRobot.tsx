import { useState, useRef, useEffect, useCallback } from 'react'
import '../styles/dz-robot.css'

interface HolidayInfo {
  name: string
  emoji: string
  isRamadan: boolean
}

interface DZRobotProps {
  holiday?: HolidayInfo | null
}

const MESSAGES_NORMAL = [
  'مرحباً! أنا DZ Agent 🤖',
  'كيف يمكنني مساعدتك اليوم؟',
  'جربني في DZ AGENT!',
  'أنا هنا لخدمتك 💚',
  'تكلم معي بالدارجة!',
  'اختر أداة وابدأ! 🚀',
  'صنعت في الجزائر 🇩🇿',
  'بحث حي · كود · قرآن · خرائط',
]

const MESSAGES_ANGRY = [
  'جاي تقرا و لا تلعب؟ 😒',
  'راك كبير.. 🤷',
  'أحشم... 🙄',
  'يخي لاباس..؟',
  'يرحم باباك.. 🤔',
  'بلعقل la pièce راهي غالية..',
  'ذرك نحصلك لنذير..... 😅',
]

const PARTICLES = [
  { angle: 0,   color: '#c8ff00', size: 9,  shape: 'rect' },
  { angle: 40,  color: '#00d4aa', size: 7,  shape: 'circle' },
  { angle: 80,  color: '#ff4444', size: 10, shape: 'rect' },
  { angle: 120, color: '#c8ff00', size: 6,  shape: 'circle' },
  { angle: 160, color: '#ffffff', size: 8,  shape: 'rect' },
  { angle: 200, color: '#00d4aa', size: 11, shape: 'circle' },
  { angle: 240, color: '#ff9900', size: 7,  shape: 'rect' },
  { angle: 280, color: '#c8ff00', size: 9,  shape: 'circle' },
  { angle: 320, color: '#ff4444', size: 6,  shape: 'rect' },
  { angle: 350, color: '#ffffff', size: 8,  shape: 'circle' },
  { angle: 60,  color: '#ff9900', size: 12, shape: 'rect' },
  { angle: 300, color: '#00d4aa', size: 7,  shape: 'circle' },
]

const HOLIDAY_PARTICLES = [
  { angle: 0,   color: '#FFD700', size: 10, shape: 'circle' },
  { angle: 30,  color: '#FF6B6B', size: 8,  shape: 'rect' },
  { angle: 60,  color: '#4ECDC4', size: 9,  shape: 'circle' },
  { angle: 90,  color: '#FFD700', size: 7,  shape: 'rect' },
  { angle: 120, color: '#45B7D1', size: 11, shape: 'circle' },
  { angle: 150, color: '#FF6B6B', size: 8,  shape: 'rect' },
  { angle: 180, color: '#FFD700', size: 9,  shape: 'circle' },
  { angle: 210, color: '#4ECDC4', size: 7,  shape: 'rect' },
  { angle: 240, color: '#FF6B6B', size: 10, shape: 'circle' },
  { angle: 270, color: '#FFD700', size: 8,  shape: 'rect' },
  { angle: 300, color: '#45B7D1', size: 9,  shape: 'circle' },
  { angle: 330, color: '#4ECDC4', size: 7,  shape: 'rect' },
]

export default function DZRobot({ holiday }: DZRobotProps) {
  const [pos, setPos] = useState({ x: -1, y: -1 })
  const [isDragging, setIsDragging] = useState(false)
  const [isHappy, setIsHappy] = useState(false)
  const [isAngry, setIsAngry] = useState(false)
  const [isExploding, setIsExploding] = useState(false)
  const [isHolidayCelebrating, setIsHolidayCelebrating] = useState(false)
  const [msgIdx, setMsgIdx] = useState(0)
  const [showMsg, setShowMsg] = useState(true)
  const [blink, setBlink] = useState(false)
  const [wobble, setWobble] = useState(false)
  const [holidayShown, setHolidayShown] = useState(false)
  const robotRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0, t: 0 })
  const velocity = useRef({ vx: 0, vy: 0 })
  const angryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initial position
  useEffect(() => {
    const setInitialPos = () => {
      setPos({ x: window.innerWidth - 110, y: window.innerHeight - 210 })
    }
    setInitialPos()
    window.addEventListener('resize', setInitialPos)
    return () => window.removeEventListener('resize', setInitialPos)
  }, [])

  // Holiday celebration on mount — show after 1.5s
  useEffect(() => {
    if (!holiday || holidayShown) return
    const timer = setTimeout(() => {
      setIsHolidayCelebrating(true)
      setShowMsg(true)
      setHolidayShown(true)
      // Stop celebrating after 6 seconds
      setTimeout(() => setIsHolidayCelebrating(false), 6000)
    }, 1500)
    return () => clearTimeout(timer)
  }, [holiday, holidayShown])

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
      if (!isAngry && !isHolidayCelebrating) {
        setMsgIdx(i => (i + 1) % MESSAGES_NORMAL.length)
      }
    }, 4000)
    return () => clearInterval(id)
  }, [isAngry, isHolidayCelebrating])

  const triggerAngry = useCallback(() => {
    setIsAngry(true)
    setIsHappy(false)
    setMsgIdx(Math.floor(Math.random() * MESSAGES_ANGRY.length))
    setShowMsg(true)
    if (angryTimer.current) clearTimeout(angryTimer.current)
    angryTimer.current = setTimeout(() => {
      setIsAngry(false)
      setMsgIdx(0)
    }, 3500)
  }, [])

  const startDrag = useCallback((clientX: number, clientY: number) => {
    if (!robotRef.current || isExploding) return
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
  }, [isExploding])

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
    if (speed > 1.2) triggerAngry()
  }, [triggerAngry])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY)
    const onMouseUp = () => endDrag()
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging.current) return
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

  const handleHide = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsExploding(true)
    setShowMsg(false)
    setTimeout(() => {
      localStorage.setItem('dz-robot-hidden', '1')
      window.dispatchEvent(new Event('dz-robot-toggle'))
    }, 750)
  }, [])

  // Don't render until position is known
  if (pos.x === -1) return null

  const messages = isAngry ? MESSAGES_ANGRY : MESSAGES_NORMAL
  const centerX = pos.x + 40
  const centerY = pos.y + 50

  // Holiday color scheme
  const isHoliday = isHolidayCelebrating
  const eyeColor = isHoliday ? '#FFD700' : isAngry ? '#ff4444' : '#c8ff00'
  const bodyGradStart = isHoliday ? '#FFD700' : isAngry ? '#ff4444' : '#c8ff00'
  const bodyGradEnd   = isHoliday ? '#ff6b6b' : isAngry ? '#ff0000' : '#00d4aa'
  const bgGradStart   = isHoliday ? '#2a1a00' : isAngry ? '#2a0a0a' : '#1a2a1a'
  const bgGradEnd     = isHoliday ? '#1a0800' : isAngry ? '#1a0000' : '#0a1a0a'

  const currentMsg = isHolidayCelebrating && holiday
    ? `${holiday.emoji} ${holiday.name} — كل عام وأنتم بخير 💚`
    : messages[msgIdx]

  const celebrationParticles = isHoliday ? HOLIDAY_PARTICLES : PARTICLES

  return (
    <>
      {/* Explosion / celebration particles */}
      {(isExploding || isHolidayCelebrating) && celebrationParticles.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180
        const dist = isHoliday ? 60 + Math.random() * 50 : 80 + Math.random() * 60
        const dx = Math.cos(rad) * dist
        const dy = Math.sin(rad) * dist
        return (
          <div
            key={i}
            className={isHoliday ? 'dzr-holiday-particle' : 'dzr-particle'}
            style={{
              left: centerX,
              top: centerY,
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: p.shape === 'circle' ? '50%' : '2px',
              '--dx': `${dx}px`,
              '--dy': `${dy}px`,
              animationDelay: `${i * (isHoliday ? 150 : 20)}ms`,
              animationIterationCount: isHoliday ? 'infinite' : '1',
            } as React.CSSProperties}
          />
        )
      })}

      <div
        ref={robotRef}
        className={[
          'dzr-root',
          isDragging   ? 'dzr-root--dragging'  : '',
          wobble       ? 'dzr-root--wobble'     : '',
          isAngry      ? 'dzr-root--angry'      : '',
          isExploding  ? 'dzr-root--exploding'  : '',
          isHoliday    ? 'dzr-root--holiday'    : '',
        ].filter(Boolean).join(' ')}
        style={{ left: pos.x, top: pos.y }}
        onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY) }}
        onTouchStart={e => { if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY) }}
        onMouseEnter={() => { if (!isAngry && !isExploding) { setShowMsg(true); setIsHappy(true) } }}
        onMouseLeave={() => { if (!isDragging && !isAngry) setIsHappy(false) }}
      >
        {showMsg && !isExploding && (
          <div
            className={[
              'dzr-bubble',
              isAngry   ? 'dzr-bubble--angry'   : '',
              isHoliday ? 'dzr-bubble--holiday' : '',
            ].filter(Boolean).join(' ')}
            dir="rtl"
          >
            <span>{currentMsg}</span>
            <button
              className="dzr-bubble-close"
              onClick={e => { e.stopPropagation(); setShowMsg(false) }}
            >×</button>
          </div>
        )}

        <svg
          className={[
            'dzr-svg',
            isDragging ? 'dzr-svg--held'  : '',
            isAngry    ? 'dzr-svg--angry' : '',
            isHoliday  ? 'dzr-svg--holiday' : '',
          ].filter(Boolean).join(' ')}
          viewBox="0 0 80 100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="rg1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={bodyGradStart} />
              <stop offset="100%" stopColor={bodyGradEnd} />
            </linearGradient>
            <linearGradient id="rg2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={bgGradStart} />
              <stop offset="100%" stopColor={bgGradEnd} />
            </linearGradient>
            <filter id="rglow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <line x1="40" y1="6" x2="40" y2="18" stroke="url(#rg1)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="40" cy="4" r="4" fill="url(#rg1)" filter="url(#rglow)" className="dzr-antenna-ball" />

          {/* Holiday hat */}
          {isHoliday && (
            <>
              <polygon points="40,0 30,12 50,12" fill="#FF6B6B" stroke="#FFD700" strokeWidth="1" />
              <rect x="29" y="12" width="22" height="3" rx="1.5" fill="#FFD700" />
              <circle cx="40" cy="1" r="2.5" fill="#FFD700" />
            </>
          )}

          <rect x="14" y="18" width="52" height="40" rx="12" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.5" />

          <circle cx="28" cy="35" r="8" fill={isAngry ? '#2a0000' : isHoliday ? '#1a0800' : '#0d1f0d'} stroke="url(#rg1)" strokeWidth="1.5" />
          <circle cx="52" cy="35" r="8" fill={isAngry ? '#2a0000' : isHoliday ? '#1a0800' : '#0d1f0d'} stroke="url(#rg1)" strokeWidth="1.5" />

          {isAngry && (
            <>
              <line x1="21" y1="27" x2="33" y2="30" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="47" y1="30" x2="59" y2="27" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round" />
            </>
          )}

          {blink ? (
            <>
              <rect x="22" y="33" width="12" height="3" rx="1.5" fill={eyeColor} />
              <rect x="46" y="33" width="12" height="3" rx="1.5" fill={eyeColor} />
            </>
          ) : (
            <>
              <circle cx="28" cy="35" r={isHappy || isHoliday ? 5 : 4} fill="url(#rg1)" className="dzr-eye" />
              <circle cx="52" cy="35" r={isHappy || isHoliday ? 5 : 4} fill="url(#rg1)" className="dzr-eye" />
              <circle cx="30" cy="33" r="1.5" fill="white" opacity="0.7" />
              <circle cx="54" cy="33" r="1.5" fill="white" opacity="0.7" />
            </>
          )}

          {isAngry ? (
            <path d="M27 55 Q40 49 53 55" stroke="#ff4444" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          ) : (isHappy || isHoliday) ? (
            <path d="M27 50 Q40 58 53 50" stroke="url(#rg1)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          ) : (
            <path d="M28 52 Q40 56 52 52" stroke="url(#rg1)" strokeWidth="2" strokeLinecap="round" fill="none" />
          )}

          <rect x="16" y="60" width="48" height="30" rx="8" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.5" />
          <rect x="26" y="66" width="28" height="5" rx="2.5" fill="url(#rg1)" opacity="0.6" />
          <rect x="29" y="75" width="22" height="4" rx="2" fill="url(#rg1)" opacity="0.4" />

          {/* Holiday badge on body */}
          {isHoliday && (
            <text x="40" y="82" textAnchor="middle" fontSize="8" fill="#FFD700">🎊</text>
          )}

          <rect x="6"  y="62" width="10" height="20" rx="5" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.2"
            className={isDragging ? 'dzr-arm-r' : isAngry ? 'dzr-arm-angry-r' : ''} />
          <rect x="64" y="62" width="10" height="20" rx="5" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.2"
            className={isDragging ? 'dzr-arm-l' : isAngry ? 'dzr-arm-angry-l' : ''} />

          <circle cx="21" cy="62" r="3" fill="url(#rg1)" opacity="0.5" filter="url(#rglow)" className="dzr-chest-led" />
          <circle cx="59" cy="62" r="3" fill="url(#rg1)" opacity="0.5" filter="url(#rglow)" className="dzr-chest-led" />
        </svg>

        <div className={`dzr-label${isAngry ? ' dzr-label--angry' : ''}${isHoliday ? ' dzr-label--holiday' : ''}`}>
          {isHoliday ? holiday?.emoji || '🎊' : 'DZ Agent'}
        </div>

        <button
          className="dzr-hide-btn"
          onClick={handleHide}
          title="إخفاء الروبوت"
          aria-label="إخفاء الروبوت"
        >
          ×
        </button>
      </div>
    </>
  )
}
