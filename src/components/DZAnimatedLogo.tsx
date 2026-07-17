import { useEffect, useRef } from 'react'
import '../styles/dz-animated-logo.css'

/* ═══════════════════════════════════════════════════════════════════
   DZ Animated Logo
   مراحل الحركة (دورة 9 ثانية):
   0 → 3.5s  : لوغو دائري متوهج مع جسيمات الذكاء الاصطناعي
   3.5 → 5.5s : تحوّل — الدائرة تمتد لتصبح مستطيل العلم
   5.5 → 8s  : العلم الجزائري الكامل (أخضر + أبيض + هلال + نجمة)
   8 → 9s    : تقلّص العلم عودةً للدائرة ← يتكرر
═══════════════════════════════════════════════════════════════════ */

const NUM_PARTICLES = 12
const NUM_SPARKS = 6

export default function DZAnimatedLogo() {
  const svgRef = useRef<SVGSVGElement>(null)

  /* ── تحريك جسيمات الدائرة بـ JS للحصول على توهج عشوائي ── */
  useEffect(() => {
    const particles = svgRef.current?.querySelectorAll('.dzl-particle')
    if (!particles) return
    particles.forEach((p, i) => {
      const angle = (i / NUM_PARTICLES) * 360
      ;(p as SVGElement).style.setProperty('--angle', `${angle}deg`)
      ;(p as SVGElement).style.setProperty('--delay', `${(i * 0.18).toFixed(2)}s`)
      ;(p as SVGElement).style.setProperty('--size', `${3 + Math.random() * 3}px`)
      ;(p as SVGElement).style.setProperty('--r', `${58 + Math.random() * 8}px`)
    })
    const sparks = svgRef.current?.querySelectorAll('.dzl-spark')
    sparks?.forEach((s, i) => {
      ;(s as SVGElement).style.setProperty('--spark-angle', `${i * 60 + 30}deg`)
      ;(s as SVGElement).style.setProperty('--spark-delay', `${(i * 0.3).toFixed(2)}s`)
    })
  }, [])

  return (
    <div className="dzl-wrapper" aria-label="DZ Agent Logo">
      {/* ── طبقة وهج خلفي ── */}
      <div className="dzl-glow-bg" />

      {/* ── الجسيمات الدائرية ── */}
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

      {/* ── المحتوى الرئيسي: اللوغو + العلم ── */}
      <div className="dzl-stage">

        {/* ── لوغو الدائرة (ظاهر في مرحلة logo) ── */}
        <div className="dzl-circle-logo">
          {/* حلقات نبض الذكاء الاصطناعي */}
          <div className="dzl-ring dzl-ring-1" />
          <div className="dzl-ring dzl-ring-2" />
          <div className="dzl-ring dzl-ring-3" />
          {/* الدائرة الرئيسية */}
          <div className="dzl-core">
            {/* هلال صغير في الوسط */}
            <svg className="dzl-core-svg" viewBox="0 0 80 80" fill="none">
              {/* النجمة */}
              <polygon
                className="dzl-core-star"
                points="40,10 43.5,30 63,28 48,40 54,60 40,48 26,60 32,40 17,28 36.5,30"
                fill="#D21034"
                opacity="0.9"
              />
              {/* هلال */}
              <path
                className="dzl-core-crescent"
                d="M40 18 A22 22 0 1 1 40 62 A15 15 0 1 0 40 18 Z"
                fill="none"
                stroke="#D21034"
                strokeWidth="0"
              />
            </svg>
            {/* نص DZ */}
            <span className="dzl-dz-text">DZ</span>
          </div>
        </div>

        {/* ── العلم الجزائري (ظاهر في مرحلة flag) ── */}
        <div className="dzl-flag-wrap">
          <div className="dzl-flag-glow" />
          <svg
            ref={svgRef}
            className="dzl-flag-svg"
            viewBox="0 0 600 400"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* ── تعريف الفلاتر ── */}
            <defs>
              {/* وهج أخضر */}
              <filter id="glow-green" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* وهج أحمر للهلال */}
              <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* تدرج لوهج الحافة */}
              <linearGradient id="flag-border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00ff88" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#ffffff" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#00cc66" stopOpacity="0.8" />
              </linearGradient>
              {/* clip path للعلم */}
              <clipPath id="flag-clip">
                <rect x="0" y="0" width="600" height="400" rx="12" />
              </clipPath>
            </defs>

            <g clipPath="url(#flag-clip)">
              {/* ── نصف أخضر (يسار) ── */}
              <rect x="0" y="0" width="300" height="400" fill="#006233" />
              {/* ── نصف أبيض (يمين) ── */}
              <rect x="300" y="0" width="300" height="400" fill="#FFFFFF" />

              {/* ── خط وهج فاصل ── */}
              <line
                x1="300" y1="0" x2="300" y2="400"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="2"
              />

              {/* ── الهلال والنجمة ── */}
              <g filter="url(#glow-red)" className="dzl-flag-emblem">
                {/* الهلال: دائرة خارجية - دائرة داخلية = هلال */}
                <path
                  d="M 268 200
                     m -88 0
                     a 88 88 0 1 0 176 0
                     a 88 88 0 1 0 -176 0
                     M 268 200
                     m -68 -22
                     a 72 72 0 1 1 136 0
                     a 72 72 0 1 1 -136 0"
                  fill="none"
                />
                {/* هلال احمر صحيح */}
                <circle cx="268" cy="200" r="88" fill="#D21034" />
                <circle cx="305" cy="200" r="74" fill="#FFFFFF" />
                {/* الجزء الأبيض يُخفي الجانب الأيمن من الدائرة الكبيرة — لكن نريد اللون الصحيح */}
                {/* نُعيد رسم الخلفية فوقه */}
                <rect x="300" y="112" width="80" height="176" fill="#FFFFFF" />
                <rect x="0" y="112" width="300" height="176" fill="#006233" />
                {/* الهلال الصحيح: دائرة كبيرة ناقص دائرة داخلية منزاحة */}
                <path
                  className="dzl-crescent-path"
                  d={`M 268 200
                     m 0 -84
                     a 84 84 0 1 0 0 168
                     a 84 84 0 1 0 0 -168
                     Z
                     M 300 200
                     m 0 -68
                     a 68 68 0 1 1 0 136
                     a 68 68 0 1 1 0 -136
                     Z`}
                  fill="#D21034"
                  fillRule="evenodd"
                />

                {/* النجمة ذات الخمس رؤوس */}
                <polygon
                  className="dzl-star-path"
                  points={
                    /* نحسب نقاط النجمة: مركز (328, 200)، R_خارجي=38، R_داخلي=16 */
                    (() => {
                      const cx = 328, cy = 200, R = 38, r = 16, n = 5
                      const pts: string[] = []
                      for (let i = 0; i < n * 2; i++) {
                        const rad = (i * Math.PI) / n - Math.PI / 2
                        const radius = i % 2 === 0 ? R : r
                        pts.push(`${(cx + Math.cos(rad) * radius).toFixed(1)},${(cy + Math.sin(rad) * radius).toFixed(1)}`)
                      }
                      return pts.join(' ')
                    })()
                  }
                  fill="#D21034"
                />
              </g>
            </g>

            {/* ── إطار وهج العلم ── */}
            <rect
              x="1" y="1" width="598" height="398" rx="12"
              fill="none"
              stroke="url(#flag-border-grad)"
              strokeWidth="2.5"
              className="dzl-flag-border"
            />
          </svg>

          {/* نجوم لامعة فوق العلم */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="dzl-flag-star"
              style={{
                '--fs-x': `${10 + i * 12}%`,
                '--fs-y': `${15 + (i % 3) * 30}%`,
                '--fs-delay': `${i * 0.2}s`,
              } as React.CSSProperties}
            />
          ))}
        </div>

      </div>{/* dzl-stage */}
    </div>
  )
}
