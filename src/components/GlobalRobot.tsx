import { useState, useEffect } from 'react'
import DZRobot from './DZRobot'
import '../styles/global-robot.css'

// ── Algerian national holidays (month, day) ──────────────────────────────────
const DZ_NATIONAL_HOLIDAYS: { month: number; day: number; name: string; emoji: string }[] = [
  { month: 1,  day: 1,  name: 'رأس السنة الميلادية',      emoji: '🎆' },
  { month: 3,  day: 8,  name: 'يوم المرأة العالمي',        emoji: '🌸' },
  { month: 4,  day: 22, name: 'يوم الطالب الجزائري',      emoji: '🎓' },
  { month: 5,  day: 1,  name: 'عيد العمال',               emoji: '⚒️' },
  { month: 5,  day: 8,  name: 'يوم النصر 1945',           emoji: '✊' },
  { month: 6,  day: 19, name: 'يوم الانسحاب الفرنسي',     emoji: '🇩🇿' },
  { month: 7,  day: 5,  name: 'عيد الاستقلال الجزائري 🇩🇿', emoji: '🎊' },
  { month: 8,  day: 20, name: 'يوم المجاهد',              emoji: '🏅' },
  { month: 11, day: 1,  name: 'يوم الثورة المباركة 🇩🇿',   emoji: '🔥' },
  { month: 12, day: 11, name: 'يوم الانتفاضة',            emoji: '✊' },
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

// Check if we're in Ramadan (Hijri month 9)
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

  // Check Algerian national holiday
  const natHol = DZ_NATIONAL_HOLIDAYS.find(h => h.month === gMonth && h.day === gDay)
  if (natHol) return { name: natHol.name, emoji: natHol.emoji, isRamadan: false }

  // Check Islamic holidays
  const hijri = getHijriDate()
  if (hijri) {
    if (hijri.month === 9) {
      // Ramadan
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
  const [showRobot, setShowRobot] = useState(
    () => localStorage.getItem('dz-robot-hidden') !== '1'
  )
  const [holiday] = useState<HolidayInfo | null>(() => detectHoliday())

  useEffect(() => {
    const handler = () => {
      setShowRobot(localStorage.getItem('dz-robot-hidden') !== '1')
    }
    window.addEventListener('dz-robot-toggle', handler)
    return () => window.removeEventListener('dz-robot-toggle', handler)
  }, [])

  const handleShow = () => {
    localStorage.removeItem('dz-robot-hidden')
    setShowRobot(true)
  }

  if (showRobot) return <DZRobot holiday={holiday} />

  return (
    <button
      className="gr-restore-btn"
      onClick={handleShow}
      title="إظهار الروبوت"
      aria-label="إظهار الروبوت"
    >
      🤖
    </button>
  )
}
