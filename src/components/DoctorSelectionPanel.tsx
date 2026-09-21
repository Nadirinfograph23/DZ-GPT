import { useMemo, useState } from 'react'
import { Check, MapPin, Search, Stethoscope } from 'lucide-react'

export interface DoctorSelectionOption {
  ar: string
  fr: string
  search?: string
}

export interface DoctorSelectionData {
  selected: {
    speciality: DoctorSelectionOption | null
    city: DoctorSelectionOption | null
  }
  missing: {
    speciality: boolean
    city: boolean
  }
  specialties: DoctorSelectionOption[]
  cities: DoctorSelectionOption[]
}

interface Props {
  data: DoctorSelectionData
  onSend: (message: string) => void
}

const specialtyIcon = (label: string) => {
  if (label.includes('أسنان')) return '🦷'
  if (label.includes('قلب')) return '🫀'
  if (label.includes('عظام')) return '🦴'
  if (label.includes('أطفال')) return '👶'
  if (label.includes('عيون')) return '👁️'
  if (label.includes('جلدية')) return '🌿'
  if (label.includes('نساء')) return '👩‍⚕️'
  return '🩺'
}

export default function DoctorSelectionPanel({ data, onSend }: Props) {
  const [speciality, setSpeciality] = useState<DoctorSelectionOption | null>(data.selected.speciality)
  const [city, setCity] = useState<DoctorSelectionOption | null>(data.selected.city)
  const selectedSpeciality = speciality || data.selected.speciality
  const selectedCity = city || data.selected.city

  const title = useMemo(() => {
    if (data.missing.speciality && data.missing.city) return 'اختر الاختصاص والولاية'
    if (data.missing.speciality) return `اختر اختصاص الطبيب في ${selectedCity?.ar || 'ولايتك'}`
    return `اختر ولاية طبيب ${selectedSpeciality?.ar || ''}`
  }, [data.missing.city, data.missing.speciality, selectedCity?.ar, selectedSpeciality?.ar])

  const chooseSpeciality = (option: DoctorSelectionOption) => {
    setSpeciality(option)
    if (selectedCity) {
      onSend(`طبيب ${option.ar} في ${selectedCity.ar}`)
    }
  }

  const chooseCity = (option: DoctorSelectionOption) => {
    setCity(option)
    if (selectedSpeciality) {
      onSend(`طبيب ${selectedSpeciality.ar} في ${option.ar}`)
    }
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    border: `1px solid ${active ? '#14b8a6' : 'rgba(148,163,184,.25)'}`,
    background: active ? 'rgba(20,184,166,.16)' : 'rgba(15,23,42,.65)',
    color: active ? '#99f6e4' : '#dbeafe',
    borderRadius: 10,
    padding: '9px 11px',
    minHeight: 40,
    cursor: 'pointer',
    fontSize: 13,
    textAlign: 'right',
    transition: 'all .18s ease',
  })

  return (
    <div
      dir="rtl"
      style={{
        marginTop: 12,
        padding: 16,
        borderRadius: 16,
        border: '1px solid rgba(45,212,191,.25)',
        background: 'linear-gradient(145deg, rgba(15,23,42,.96), rgba(13,41,56,.94))',
        color: '#e2e8f0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <Stethoscope size={18} color="#5eead4" />
        <strong style={{ fontSize: 16 }}>{title}</strong>
      </div>
      <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
        بعد اختيار الاثنين سيجلب DZ Agent جدول الأطباء بالاسم والاختصاص والهاتف والعنوان ورابط GPS.
      </div>

      {data.missing.speciality && (
        <section style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 13, color: '#cbd5e1' }}>
            {selectedSpeciality ? <Check size={14} color="#5eead4" /> : <Search size={14} />}
            <span>1. الاختصاص</span>
            {selectedSpeciality && <b style={{ color: '#5eead4' }}>{selectedSpeciality.ar}</b>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(125px,1fr))', gap: 7 }}>
            {data.specialties.map(option => (
              <button
                key={option.ar}
                type="button"
                onClick={() => chooseSpeciality(option)}
                style={chipStyle(selectedSpeciality?.ar === option.ar)}
              >
                {specialtyIcon(option.ar)} {option.ar}
              </button>
            ))}
          </div>
        </section>
      )}

      {data.missing.city && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 13, color: '#cbd5e1' }}>
            {selectedCity ? <Check size={14} color="#5eead4" /> : <MapPin size={14} />}
            <span>{data.missing.speciality ? '2. الولاية أو المكان' : 'الولاية أو المكان'}</span>
            {selectedCity && <b style={{ color: '#5eead4' }}>{selectedCity.ar}</b>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 7 }}>
            {data.cities.map(option => (
              <button
                key={option.ar}
                type="button"
                onClick={() => chooseCity(option)}
                style={chipStyle(selectedCity?.ar === option.ar)}
              >
                <MapPin size={12} style={{ verticalAlign: 'middle', marginLeft: 3 }} />
                {option.ar}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}