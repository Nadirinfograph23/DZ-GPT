import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import '../styles/dz-robot.css'

interface HolidayInfo {
  name: string
  emoji: string
  isRamadan: boolean
}

interface DZRobotProps {
  holiday?: HolidayInfo | null
  onHide?: () => void
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

export default function DZRobot({ holiday, onHide }: DZRobotProps) {
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
  const hasUserDragged = useRef(false)
  const lastPos = useRef({ x: 0, y: 0, t: 0 })
  const velocity = useRef({ vx: 0, vy: 0 })
  const angryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Initial position — center the robot on first load and keep it in view on resize
  useEffect(() => {
    const setInitialPos = () => {
      const compactRobot = window.innerWidth <= 480
      const robotWidth = compactRobot ? 60 : 72
      const robotHeight = compactRobot ? 75 : 90
      const widgetHeight = robotHeight + (compactRobot ? 15 : 16)
      setPos(current => {
        const bounds = robotRef.current?.getBoundingClientRect()
        const width = bounds?.width ?? robotWidth
        const height = bounds?.height ?? widgetHeight
        if (current.x < 0 || current.y < 0 || !hasUserDragged.current) {
          return {
            x: Math.max(8, (window.innerWidth - width) / 2),
            y: Math.max(8, (window.innerHeight - height) / 2),
          }
        }
        return {
          x: Math.max(8, Math.min(current.x, window.innerWidth - width - 8)),
          y: Math.max(8, Math.min(current.y, window.innerHeight - height - 8)),
        }
      })
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
    hasUserDragged.current = true
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
    const bounds = robotRef.current?.getBoundingClientRect()
    const maxX = window.innerWidth - (bounds?.width ?? 72) - 8
    const maxY = window.innerHeight - (bounds?.height ?? 106) - 8
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
      onHide?.()
    }, 750)
  }, [onHide])

  // Don't render until position is known
  if (pos.x === -1) return null

  const messages = isAngry ? MESSAGES_ANGRY : MESSAGES_NORMAL
  const compactRobot = window.innerWidth <= 480
  const robotWidth = compactRobot ? 60 : 72
  const robotHeight = compactRobot ? 75 : 90
  const svgRect = robotRef.current?.querySelector<SVGSVGElement>('.dzr-svg')?.getBoundingClientRect()
  const centerX = pos.x + (svgRect?.width ?? robotWidth) / 2
  const centerY = pos.y + (svgRect?.height ?? robotHeight) / 2
  const bubbleMaxWidth = Math.min(260, Math.max(120, window.innerWidth - 20))
  const bubbleCenterX = Math.max(
    bubbleMaxWidth / 2 + 10,
    Math.min(pos.x + robotWidth / 2, window.innerWidth - bubbleMaxWidth / 2 - 10),
  )
  const bubbleTailX = Math.max(12, Math.min(bubbleMaxWidth - 12, pos.x + robotWidth / 2 - bubbleCenterX + bubbleMaxWidth / 2))
  const widgetHeight = robotHeight + (compactRobot ? 15 : 16)
  const showBubbleBelow = pos.y < 80

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
        onMouseDown={e => {
          if ((e.target as HTMLElement).closest('button')) return
          e.preventDefault()
          startDrag(e.clientX, e.clientY)
        }}
        onTouchStart={e => { if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY) }}
        onMouseEnter={() => { if (!isAngry && !isExploding) { setShowMsg(true); setIsHappy(true) } }}
        onMouseLeave={() => { if (!isDragging && !isAngry) setIsHappy(false) }}
      >


        <svg
          className={[
            'dzr-svg',
            isDragging ? 'dzr-svg--held'  : '',
            isAngry    ? 'dzr-svg--angry' : '',
            isHoliday  ? 'dzr-svg--holiday' : '',
          ].filter(Boolean).join(' ')}
          viewBox="0 0 80 70"
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

          <line x1="40" y1="8" x2="40" y2="16" stroke="url(#rg1)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="40" cy="6" r="4" fill="url(#rg1)" filter="url(#rglow)" className="dzr-antenna-ball" />

          {/* Holiday hat */}
          {isHoliday && (
            <>
              <polygon points="40,0 30,12 50,12" fill="#FF6B6B" stroke="#FFD700" strokeWidth="1" />
              <rect x="29" y="12" width="22" height="3" rx="1.5" fill="#FFD700" />
              <circle cx="40" cy="1" r="2.5" fill="#FFD700" />
            </>
          )}

          <rect x="10" y="16" width="60" height="46" rx="18" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.5" />

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

          {/* Compact side pods keep the design readable as a floating head */}
          <rect x="4" y="31" width="8" height="16" rx="4" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.2" />
          <rect x="68" y="31" width="8" height="16" rx="4" fill="url(#rg2)" stroke="url(#rg1)" strokeWidth="1.2" />

        </svg>

        <div className={`dzr-label${isAngry ? ' dzr-label--angry' : ''}${isHoliday ? ' dzr-label--holiday' : ''}`}>
          {isHoliday ? holiday?.emoji || '🎊' : 'DZ Agent'}
        </div>

        <button
          className="dzr-hide-btn"
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
          onClick={handleHide}
          title="إخفاء الروبوت"
          aria-label="إخفاء الروبوت"
        >
          ×
        </button>
      </div>

      {showMsg && !isExploding && createPortal(
          <div
            className={[
              'dzr-bubble',
              isAngry   ? 'dzr-bubble--angry'   : '',
              isHoliday ? 'dzr-bubble--holiday' : '',
              showBubbleBelow ? 'dzr-bubble--below' : '',
            ].filter(Boolean).join(' ')}
            dir="rtl"
            style={{
              left: bubbleCenterX,
              right: 'auto',
              top: showBubbleBelow ? pos.y + widgetHeight + 8 : 'auto',
              bottom: showBubbleBelow ? 'auto' : window.innerHeight - pos.y + 8,
              transform: 'translateX(-50%)',
              '--bubble-tail-x': `${bubbleTailX}px`,
            } as React.CSSProperties}
          >
            <span className="dzr-message">{currentMsg}</span>
            <button
              className="dzr-bubble-close"
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setShowMsg(false) }}
            >×</button>
          </div>,
        document.body,
      )}
    </>
  )
}
