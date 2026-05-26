import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import DZRobot from './DZRobot'
import '../styles/global-robot.css'

// ── Algerian national holidays (month, day) ──────────────────────────────────
const DZ_NATIONAL_HOLIDAYS: { month: number; day: number; name: string; emoji: string }[] = [
  { month: 1,  day: 1,  name: 'رأس السنة الميلادية',       emoji: '🎆' },
  { month: 3,  day: 8,  name: 'يوم المرأة العالمي',         emoji: '🌸' },
  { month: 4,  day: 22, name: 'يوم الطالب الجزائري',       emoji: '🎓' },
  { month: 5,  day: 1,  name: 'عيد العمال',                emoji: '⚒️' },
  { month: 5,  day: 8,  name: 'يوم النصر 1945',            emoji: '✊' },
  { month: 6,  day: 19, name: 'يوم الانسحاب الفرنسي',      emoji: '🇩🇿' },
  { month: 7,  day: 5,  name: 'عيد الاستقلال الجزائري 🇩🇿', emoji: '🎊' },
  { month: 8,  day: 20, name: 'يوم المجاهد',               emoji: '🏅' },
  { month: 11, day: 1,  name: 'يوم الثورة المباركة 🇩🇿',    emoji: '🔥' },
  { month: 12, day: 11, name: 'يوم الانتفاضة',             emoji: '✊' },
]

// ── Islamic holidays by Hijri month/day ──────────────────────────────────────
const ISLAMIC_HOLIDAYS: { month: number; day: number; name: string; emoji: string }[] = [
  { month: 1,  day: 1,  name: 'رأس السنة الهجرية',        emoji: '🌙' },
  { month: 1,  day: 10, name: 'يوم عاشوراء',              emoji: '🤲' },
  { month: 3,  day: 12, name: 'المولد النبوي الشريف ﷺ',   emoji: '💚' },
  { month: 9,  day: 1,  name: 'أول رمضان المبارك',        emoji: '🌙' },
  { month: 9,  day: 27, name: 'ليلة القدر المباركة',       emoji: '⭐' },
  { month: 10, day: 1,  name: 'عيد الفطر المبارك',        emoji: '🎉' },
  { month: 12, day: 9,  name: 'يوم عرفة المبارك',         emoji: '🤲' },
  { month: 12, day: 10, name: 'عيد الأضحى المبارك',       emoji: '🐑' },
  { month: 12, day: 11, name: 'أيام التشريق',             emoji: '🌟' },
  { month: 12, day: 12, name: 'أيام التشريق',             emoji: '🌟' },
]

interface HijriDate { year: number; month: number; day: number }

function getHijriDate(): HijriDate | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic', {
      day: 'numeric', month: 'numeric', year: 'numeric',
    })
    const parts = fmt.formatToParts(new Date())
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0')
    return { year: get('year'), month: get('month'), day: get('day') }
  } catch { return null }
}

interface HolidayInfo {
  name: string
  emoji: string
  isRamadan: boolean
}

function detectHoliday(): HolidayInfo | null {
  const now = new Date()
  const gMonth = now.getMonth() + 1
  const gDay   = now.getDate()

  const natHol = DZ_NATIONAL_HOLIDAYS.find(h => h.month === gMonth && h.day === gDay)
  if (natHol) return { name: natHol.name, emoji: natHol.emoji, isRamadan: false }

  const hijri = getHijriDate()
  if (hijri) {
    if (hijri.month === 9) {
      const ramadanMsg = ISLAMIC_HOLIDAYS.find(h => h.month === 9 && h.day === hijri.day)
      if (ramadanMsg) return { ...ramadanMsg, isRamadan: false }
      return { name: 'رمضان المبارك — كل عام وأنتم بخير 🌙', emoji: '🌙', isRamadan: true }
    }
    const islamicHol = ISLAMIC_HOLIDAYS.find(h => h.month === hijri.month && h.day === hijri.day)
    if (islamicHol) return { name: islamicHol.name, emoji: islamicHol.emoji, isRamadan: false }
  }

  return null
}

export default function GlobalRobot() {
  const { pathname } = useLocation()

  // Only show on the homepage
  const isHome = pathname === '/'

  // Reset visibility every time the user enters the homepage
  const [showRobot, setShowRobot] = useState(true)
  const [holiday] = useState<HolidayInfo | null>(() => detectHoliday())

  useEffect(() => {
    if (isHome) {
      // Always reset to visible when landing on the homepage
      setShowRobot(true)
    }
  }, [isHome])

  if (!isHome) return null

  if (!showRobot) return (
    <button
      className="gr-restore-btn"
      onClick={() => setShowRobot(true)}
      title="إظهار الروبوت"
      aria-label="إظهار الروبوت"
    >
      🤖
    </button>
  )

  return (
    <DZRobot
      holiday={holiday}
      onHide={() => setShowRobot(false)}
    />
  )
}
