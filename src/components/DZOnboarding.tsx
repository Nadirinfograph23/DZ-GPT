import { useState, useEffect } from 'react'
import { X, Sparkles, Globe, BookOpen, Wrench, BarChart2, ChevronRight } from 'lucide-react'
import '../styles/dz-onboarding.css'

const STEPS = [
  {
    icon: <Sparkles size={32} />,
    color: '#10a37f',
    title: 'مرحباً بك في DZ AGENT 🇩🇿',
    desc: 'أول منصة ذكاء اصطناعي جزائرية — تفهم الدارجة والعربية والفرنسية.',
    hint: 'اسألني أي شيء بلغتك المفضلة',
  },
  {
    icon: <Globe size={32} />,
    color: '#8b5cf6',
    title: 'بنّاء المواقع بالـ AI',
    desc: 'أنشئ موقعاً احترافياً كاملاً في ثوانٍ — ثم احفظه أو حمّله مباشرة.',
    hint: 'جرب: "اصنع لي موقع لمطعم جزائري"',
  },
  {
    icon: <BarChart2 size={32} />,
    color: '#f59e0b',
    title: 'أخبار الجزائر المباشرة',
    desc: 'آخر الأخبار من الشروق والنهار والخبر وTSA وغيرها — محدّثة بشكل مستمر.',
    hint: 'جرب: "ما آخر أخبار الجزائر اليوم؟"',
  },
  {
    icon: <BookOpen size={32} />,
    color: '#06b6d4',
    title: 'القرآن الكريم + الأدوات',
    desc: 'بحث وتفسير الآيات، مخطط سيرة ذاتية، استخراج النصوص من الصور، وأكثر.',
    hint: 'اختر أي أداة من الصفحة الرئيسية',
  },
  {
    icon: <Wrench size={32} />,
    color: '#ef4444',
    title: 'أنت جاهز! ابدأ الآن',
    desc: 'لا تتردد — اكتب سؤالك أو طلبك وسيساعدك DZ Agent فوراً.',
    hint: '← اضغط "ابدأ الآن" للانطلاق',
  },
]

export default function DZOnboarding() {
  const [visible, setVisible] = useState(false)
  const [hiding, setHiding]   = useState(false)
  const [step, setStep]       = useState(0)

  useEffect(() => {
    const seen = localStorage.getItem('dz-onboarding-v2')
    if (seen) return
    const t = setTimeout(() => setVisible(true), 1200)
    return () => clearTimeout(t)
  }, [])

  const close = () => {
    setHiding(true)
    localStorage.setItem('dz-onboarding-v2', '1')
    setTimeout(() => setVisible(false), 350)
  }

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else close()
  }

  const prev = () => { if (step > 0) setStep(s => s - 1) }

  if (!visible) return null

  const current = STEPS[step]
  const isLast  = step === STEPS.length - 1

  return (
    <div className={`dz-ob-backdrop${hiding ? ' dz-ob-backdrop--hide' : ''}`} onClick={close}>
      <div className={`dz-ob-modal${hiding ? ' dz-ob-modal--hide' : ''}`} onClick={e => e.stopPropagation()}>

        <button className="dz-ob-close" onClick={close} aria-label="إغلاق">
          <X size={16} />
        </button>

        <div className="dz-ob-progress">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`dz-ob-dot${i === step ? ' dz-ob-dot--active' : i < step ? ' dz-ob-dot--done' : ''}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        <div className="dz-ob-icon" style={{ color: current.color, borderColor: current.color + '33' }}>
          {current.icon}
        </div>

        <h2 className="dz-ob-title">{current.title}</h2>
        <p className="dz-ob-desc">{current.desc}</p>
        <div className="dz-ob-hint">{current.hint}</div>

        <div className="dz-ob-footer">
          {step > 0 && (
            <button className="dz-ob-btn dz-ob-btn--back" onClick={prev}>
              ← السابق
            </button>
          )}
          <button
            className="dz-ob-btn dz-ob-btn--next"
            style={{ background: current.color }}
            onClick={next}
          >
            {isLast ? 'ابدأ الآن 🚀' : <>التالي <ChevronRight size={14} /></>}
          </button>
        </div>

        <button className="dz-ob-skip" onClick={close}>تخطى</button>
      </div>
    </div>
  )
}
