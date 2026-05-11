import { useState } from 'react'
import { Phone, MapPin, ExternalLink, Globe, ChevronDown, ChevronUp } from 'lucide-react'

export interface DoctorResult {
  name: string
  speciality?: string
  specialityAr?: string
  city?: string
  cityAr?: string
  address?: string
  addressAr?: string
  phone?: string
  profileUrl?: string
  sources?: string[]
  directoryLink?: boolean
  distanceKm?: number
  lat?: number
  lng?: number
}

export interface DirLink {
  name?: string
  profileUrl?: string
  sources?: string[]
}

interface DoctorSearchMeta {
  speciality: { ar: string; fr: string }
  city: { ar: string; fr: string }
  hasGps?: boolean
  cached?: boolean
  byName?: boolean
  queryName?: string
}

interface Props {
  doctors: DoctorResult[]
  dirs?: DirLink[]
  meta: DoctorSearchMeta
}

const SPEC_EMOJI: Record<string, string> = {
  'أسنان': '🦷', 'قلب': '🫀', 'عظام': '🦴', 'أطفال': '👶',
  'عيون': '👁️', 'جلدية': '🌿', 'نفسي': '🧠', 'نساء': '👩‍⚕️',
  'توليد': '👩‍⚕️', 'أعصاب': '🧬', 'مسالك': '💧', 'هضمي': '🩺',
  'رئة': '🫁', 'أورام': '🩺', 'كلى': '🩺', 'جراح': '🔪', 'عام': '🩺',
}

function getSpecEmoji(spec: string) {
  for (const [k, v] of Object.entries(SPEC_EMOJI)) {
    if (spec.includes(k)) return v
  }
  return '🩺'
}

function guessGender(name: string) {
  if (/(?:سمية|فاطمة|نور|مريم|أمينة|سارة|إيمان|خديجة|هدى|نادية|ليلى|سناء|أسماء|زينب|حنان|رشيدة|بشرى|لطيفة|جميلة|حورية|نجوى)/i.test(name)) return 'f'
  if (/(?:Sonia|Samia|Fatima|Sara|Nora|Maria|Leila|Nadia|Amina|Rania|Meriem|Asma|Khadija|Houda|Dalila|Nassima|Djamila|Hanane|Nawel|Souad|Farida|Malika)\b/i.test(name)) return 'f'
  if (/a$/i.test((name.trim().split(' ').pop() || ''))) return 'f'
  return 'm'
}

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return d.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4')
  return phone
}

function mapsUrl(name: string, city: string, lat?: number, lng?: number) {
  if (lat && lng) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  const q = encodeURIComponent([name, city, 'Algérie'].filter(Boolean).join(', '))
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}

function telUrl(phone: string) {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10 && d.startsWith('0')) return `tel:+213${d.slice(1)}`
  if (d.length === 9 && !d.startsWith('0') && !d.startsWith('2')) return `tel:+213${d}`
  if (d.length === 12 && d.startsWith('213')) return `tel:+${d}`
  return `tel:${phone}`
}

function cleanName(name: string) {
  if (/^(dr\.?\s|docteur\s|د\.?\s|الدكتور\s|الدكتوره\s|دكتور\s|دكتوره\s)/i.test(name.trim())) return name.trim()
  return `د. ${name.trim()}`
}

const SOURCE_LABELS: Record<string, string> = {
  sahadoc: 'Sahadoc', addalile: 'Addalile', 'pj-dz': 'PJ-DZ',
  'algerie-docto': 'Algerie-Docto', docteur360: 'Docteur360',
  sihhatech: 'Sihhatech', machrou3: 'Machrou3', beesiha: 'Beesiha',
}

function DoctorCard({ doctor, specLabel, cityLabel }: {
  doctor: DoctorResult
  specLabel: string
  cityLabel: string
}) {
  const displayName = cleanName(doctor.name)
  const gender = guessGender(doctor.name)
  const specAr = doctor.specialityAr || specLabel || ''
  const cityAr = doctor.cityAr || cityLabel || ''
  const addrAr = doctor.addressAr || doctor.address || ''
  const locationLabel = addrAr
    ? `${addrAr}، ${cityAr}`.replace(/^،\s*/, '').replace(/،\s*$/, '')
    : cityAr || 'الجزائر'

  return (
    <div className="dr-card">
      <div className="dr-card-header">
        <span className="dr-card-avatar">{gender === 'f' ? '👩‍⚕️' : '👨‍⚕️'}</span>
        <div className="dr-card-name-block">
          <span className="dr-card-name">{displayName}</span>
          {specAr && (
            <span className="dr-card-spec-badge">
              {getSpecEmoji(specAr)} {specAr}
            </span>
          )}
        </div>
      </div>

      <div className="dr-card-rows">
        {(addrAr || cityAr) && (
          <a
            className="dr-card-row dr-card-row--link"
            href={mapsUrl(displayName, cityAr, doctor.lat, doctor.lng)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapPin size={13} className="dr-card-row-icon" />
            <span className="dr-card-row-text">
              {locationLabel}
              {typeof doctor.distanceKm === 'number' && (
                <em className="dr-card-distance"> (~{doctor.distanceKm} كم)</em>
              )}
            </span>
            <ExternalLink size={10} className="dr-card-row-ext" />
          </a>
        )}

        {doctor.phone ? (
          <a
            className="dr-card-row dr-card-row--phone"
            href={telUrl(doctor.phone)}
          >
            <Phone size={13} className="dr-card-row-icon" />
            <span className="dr-card-row-text">{formatPhone(doctor.phone)}</span>
          </a>
        ) : (
          <div className="dr-card-row dr-card-row--muted">
            <Phone size={13} className="dr-card-row-icon" />
            <span className="dr-card-row-text">غير متوفر</span>
          </div>
        )}

        {doctor.profileUrl && !doctor.directoryLink && (
          <a
            className="dr-card-row dr-card-row--link"
            href={doctor.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Globe size={13} className="dr-card-row-icon" />
            <span className="dr-card-row-text">صفحة الطبيب</span>
            <ExternalLink size={10} className="dr-card-row-ext" />
          </a>
        )}
      </div>

      {doctor.sources && doctor.sources.length > 0 && (
        <div className="dr-card-sources">
          {doctor.sources.map(s => (
            <span key={s} className="dr-source-badge">{SOURCE_LABELS[s] || s}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DoctorResultsPanel({ doctors, dirs = [], meta }: Props) {
  const [showDirs, setShowDirs] = useState(false)
  const isNameSearch = !!meta.byName
  const specEmoji = isNameSearch ? '🔎' : getSpecEmoji(meta.speciality.ar)
  const withPhone = doctors.filter(d => d.phone).length
  const withAddr = doctors.filter(d => d.address || d.addressAr || d.city || d.cityAr).length

  return (
    <div className="dr-panel" dir="rtl">
      <div className="dr-panel-header">
        <div className="dr-panel-title">
          <span className="dr-panel-emoji">{specEmoji}</span>
          {isNameSearch ? (
            <span className="dr-panel-label">
              نتائج البحث عن:&nbsp;
              <span className="dr-panel-query-name">{meta.queryName || meta.speciality.ar}</span>
            </span>
          ) : (
            <span className="dr-panel-label">
              {meta.speciality.ar}
              {meta.city.ar && <span className="dr-panel-city"> في {meta.city.ar}</span>}
            </span>
          )}
          {meta.cached && <span className="dr-panel-cached">⚡ من الذاكرة</span>}
        </div>

        {doctors.length > 0 && (
          <div className="dr-panel-stats">
            <span className="dr-stat dr-stat--count">{doctors.length} نتيجة</span>
            {withPhone > 0 && <span className="dr-stat dr-stat--phone">📞 {withPhone} رقم</span>}
            {withAddr > 0 && <span className="dr-stat dr-stat--addr">📍 {withAddr} عنوان</span>}
            {meta.hasGps && <span className="dr-stat dr-stat--gps">📡 مرتب حسب القرب</span>}
          </div>
        )}
      </div>

      {doctors.length === 0 && dirs.length === 0 && (
        <div className="dr-panel-empty">
          <span className="dr-panel-empty-icon">🔍</span>
          <p>لم أجد نتائج حالياً لهذا البحث.</p>
          <p className="dr-panel-empty-tip">جرّب ولاية مجاورة أو تخصصاً مرادفاً.</p>
        </div>
      )}

      {doctors.length > 0 && (
        <div className="dr-cards-grid">
          {doctors.map((doc, i) => (
            <DoctorCard
              key={i}
              doctor={doc}
              specLabel={meta.speciality.ar}
              cityLabel={meta.city.ar}
            />
          ))}
        </div>
      )}

      {dirs.length > 0 && (
        <div className="dr-dirs">
          <button
            className="dr-dirs-toggle"
            onClick={() => setShowDirs(v => !v)}
          >
            {showDirs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showDirs ? 'إخفاء' : 'بحث مباشر في'} {dirs.length} موقع طبي
          </button>
          {showDirs && (
            <div className="dr-dirs-list">
              {dirs.map((d, i) => (
                <a
                  key={i}
                  className="dr-dir-link"
                  href={d.profileUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Globe size={12} />
                  {d.name || d.sources?.[0] || 'دليل طبي'}
                  <ExternalLink size={10} />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="dr-panel-footer">
        اضغط 📍 للخريطة · اضغط 📞 للاتصال المباشر
        {!meta.hasGps && <span> · أرسل موقعك لترتيب النتائج حسب القرب</span>}
      </div>
    </div>
  )
}
