import { useEffect, useRef } from 'react'
import '../styles/dz-animated-logo.css'

/* ═══════════════════════════════════════════════════════════════════
   DZ Animated Logo — دورة واحدة ثم يستقر
   0 → 3.5s  : لوغو دائري DZ متوهج + جسيمات
   3.5 → 5.5s : تحوّل الدائرة → علم كبير
   5.5 → 8s  : العلم الجزائري الكامل
   8 → 10s   : العلم يتصغّر ويتحوّل → روبوت + علم صغير يرفرف
   10s+       : الروبوت ثابت، العلم الصغير يرفرف إلى الأبد
═══════════════════════════════════════════════════════════════════ */

const NUM_PARTICLES = 12
const NUM_SPARKS    = 6

/* ── نقاط النجمة الخماسية: مركز (328, 200) ── */
function starPoints(cx: number, cy: number, R: number, r: number) {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const rad    = (i * Math.PI) / 5 - Math.PI / 2
    const radius = i % 2 === 0 ? R : r
    pts.push(`${(cx + Math.cos(rad) * radius).toFixed(1)},${(cy + Math.sin(rad) * radius).toFixed(1)}`)
  }
  return pts.join(' ')
}

/* ── محتوى SVG للعلم (يُعاد استخدامه للعلم الكبير والصغير) ── */
function AlgeriaFlag({ id }: { id: string }) {
  return (
    <>
      <defs>
        <filter id={`gr-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id={`fc-${id}`}>
          <rect x="0" y="0" width="600" height="400" rx="10" />
        </clipPath>
      </defs>
      <g clipPath={`url(#fc-${id})`}>
        <rect x="0"   y="0" width="300" height="400" fill="#006233" />
        <rect x="300" y="0" width="300" height="400" fill="#FFFFFF" />
        <g filter={`url(#gr-${id})`} className="dzl-flag-emblem">
          {/* الهلال */}
          <path
            d="M268 200 m0-84 a84 84 0 1 0 0 168 a84 84 0 1 0 0-168 Z
               M300 200 m0-68 a68 68 0 1 1 0 136 a68 68 0 1 1 0-136 Z"
            fill="#D21034" fillRule="evenodd"
          />
          {/* النجمة */}
          <polygon points={starPoints(328, 200, 38, 16)} fill="#D21034" />
        </g>
      </g>
    </>
  )
}

export default function DZAnimatedLogo() {
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const particles = wrapRef.current?.querySelectorAll('.dzl-particle')
    particles?.forEach((p, i) => {
      const el = p as HTMLElement
      el.style.setProperty('--angle', `${(i / NUM_PARTICLES) * 360}deg`)
      el.style.setProperty('--delay',  `${(i * 0.18).toFixed(2)}s`)
      el.style.setProperty('--size',   `${3 + Math.random() * 3}px`)
      el.style.setProperty('--r',      `${58 + Math.random() * 8}px`)
    })
    const sparks = wrapRef.current?.querySelectorAll('.dzl-spark')
    sparks?.forEach((s, i) => {
      const el = s as HTMLElement
      el.style.setProperty('--spark-angle', `${i * 60 + 30}deg`)
      el.style.setProperty('--spark-delay', `${(i * 0.3).toFixed(2)}s`)
    })
  }, [])

  return (
    <div className="dzl-wrapper" ref={wrapRef} aria-label="DZ Agent Logo">

      {/* ── وهج خلفي ── */}
      <div className="dzl-glow-bg" />

      {/* ── جسيمات دائرية ── */}
      <div className="dzl-particles">
        {Array.from({ length: NUM_PARTICLES }).map((_, i) => (
          <div key={i} className="dzl-particle" />
        ))}
      </div>

      {/* ── شرارات خارجية ── */}
      <div className="dzl-sparks">
        {Array.from({ length: NUM_SPARKS }).map((_, i) => (
          <div key={i} className="dzl-spark" />
        ))}
      </div>

      <div className="dzl-stage">

        {/* ══ مرحلة 1: لوغو الدائرة DZ ══ */}
        <div className="dzl-circle-logo">
          <div className="dzl-ring dzl-ring-1" />
          <div className="dzl-ring dzl-ring-2" />
          <div className="dzl-ring dzl-ring-3" />
          <div className="dzl-core">
            <span className="dzl-dz-text">DZ</span>
          </div>
        </div>

        {/* ══ مرحلة 2-3: العلم الكبير ══ */}
        <div className="dzl-flag-wrap">
          <div className="dzl-flag-glow" />
          <svg className="dzl-flag-svg" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
            <AlgeriaFlag id="big" />
            <rect x="1" y="1" width="598" height="398" rx="10" fill="none"
              stroke="url(#flag-border-grad-big)" strokeWidth="2.5"
              className="dzl-flag-border"
            />
            <defs>
              <linearGradient id="flag-border-grad-big" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="#00ff88" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#00cc66" stopOpacity="0.8" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* ══ الحالة النهائية: روبوت + علم صغير يرفرف ══ */}
        <div className="dzl-final-state">

          {/* العلم الصغير فوق الرأس */}
          <div className="dzl-small-flag-area">
            {/* العمود */}
            <div className="dzl-pole" />
            {/* العلم المرفرف */}
            <svg className="dzl-small-flag-svg" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
              <AlgeriaFlag id="small" />
            </svg>
          </div>

          {/* الروبوت */}
          <div className="dzl-robot-wrap">
            <svg className="dzl-robot-svg" viewBox="0 0 80 80" fill="none"
                 xmlns="http://www.w3.org/2000/svg">

              {/* هوائي */}
              <line x1="40" y1="2" x2="40" y2="13"
                stroke="#00ff88" strokeWidth="2" strokeLinecap="round" />
              <circle cx="40" cy="2" r="2.5" fill="#00ff88" className="dzl-ant-tip" />

              {/* الرأس */}
              <rect x="12" y="13" width="56" height="34" rx="9"
                fill="#0a2e1a" stroke="#00cc66" strokeWidth="1.5" />

              {/* العيون — خلفية */}
              <circle cx="27" cy="30" r="6.5" fill="#001208" />
              <circle cx="53" cy="30" r="6.5" fill="#001208" />
              {/* العيون — توهج */}
              <circle cx="27" cy="30" r="3.8" fill="#00ff88" className="dzl-eye" />
              <circle cx="53" cy="30" r="3.8" fill="#00ff88" className="dzl-eye" />
              {/* بريق العيون */}
              <circle cx="28.8" cy="28.2" r="1.2" fill="white" opacity="0.9" />
              <circle cx="54.8" cy="28.2" r="1.2" fill="white" opacity="0.9" />

              {/* الفم / مكبر الصوت */}
              <rect x="21" y="38" width="38" height="5.5" rx="2.8" fill="#001208" />
              <line x1="29" y1="38" x2="29" y2="43.5" stroke="#00aa44" strokeWidth="0.8" />
              <line x1="37" y1="38" x2="37" y2="43.5" stroke="#00aa44" strokeWidth="0.8" />
              <line x1="45" y1="38" x2="45" y2="43.5" stroke="#00aa44" strokeWidth="0.8" />
              <line x1="53" y1="38" x2="53" y2="43.5" stroke="#00aa44" strokeWidth="0.8" />

              {/* رقبة */}
              <rect x="32" y="47" width="16" height="5" rx="2.5" fill="#071f12" />

              {/* الجسم */}
              <rect x="14" y="52" width="52" height="24" rx="7"
                fill="#0a2e1a" stroke="#00cc66" strokeWidth="1.5" />

              {/* نص DZ على الجسم */}
              <text x="40" y="68" textAnchor="middle"
                fill="#00ff88" fontSize="11" fontWeight="900"
                fontFamily="Cairo, sans-serif" letterSpacing="1.5">DZ</text>

              {/* نقاط حالة على الجسم */}
              <circle cx="20" cy="60" r="2.2" fill="#00cc44" className="dzl-status-dot" />
              <circle cx="60" cy="60" r="2.2" fill="#00cc44" className="dzl-status-dot" />

              {/* الذراعان */}
              <rect x="2"  y="53" width="11" height="9" rx="4.5"
                fill="#0a2e1a" stroke="#00cc66" strokeWidth="1.5" />
              <rect x="67" y="53" width="11" height="9" rx="4.5"
                fill="#0a2e1a" stroke="#00cc66" strokeWidth="1.5" />
            </svg>

            {/* وهج الروبوت */}
            <div className="dzl-robot-glow" />
          </div>
        </div>

      </div>{/* dzl-stage */}
    </div>
  )
}
