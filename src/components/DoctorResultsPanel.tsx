import { useState } from 'react'
import { Phone, MapPin, ExternalLink, Globe, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'

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
  nameScore?: number
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

function whatsappUrl(phone: string) {
  const d = phone.replace(/\D/g, '')
  let intl = ''
  if (d.length === 10 && d.startsWith('0')) intl = '213' + d.slice(1)
  else if (d.length === 9) intl = '213' + d
  else if (d.length === 12 && d.startsWith('213')) intl = d
  if (!intl) return null
  const isMobile = /^213(5|6|7)/.test(intl)
  if (!isMobile) return null
  return `https://wa.me/${intl}`
}

function cleanName(name: string) {
  if (/^(dr\.?\s|docteur\s|د\.?\s|الدكتور\s|الدكتوره\s|دكتور\s|دكتوره\s)/i.test(name.trim())) return name.trim()
  return `د. ${name.trim()}`
}

function matchLabel(score: number): { label: string; cls: string } | null {
  if (score >= 0.9) return { label: '✓ تطابق تام', cls: 'dr-match-badge--exact' }
  if (score >= 0.65) return { label: '✓ تطابق عالٍ', cls: 'dr-match-badge--high' }
  if (score >= 0.45) return { label: '~ قريب', cls: 'dr-match-badge--mid' }
  return { label: '? محتمل', cls: 'dr-match-badge--low' }
}

const SOURCE_LABELS: Record<string, string> = {
  sahadoc: 'Sahadoc', addalile: 'Addalile', 'pj-dz': 'PJ-DZ',
  'algerie-docto': 'Algerie-Docto', docteur360: 'Docteur360',
  sihhatech: 'Sihhatech', machrou3: 'Machrou3', beesiha: 'Beesiha',
}

function CopyPhoneBtn({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(phone).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <button
      className={`dr-copy-btn${copied ? ' dr-copy-btn--ok' : ''}`}
      onClick={handleCopy}
      title="نسخ الرقم"
      type="button"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  )
}

function DoctorCard({ doctor, specLabel, cityLabel, showScore }: {
  doctor: DoctorResult
  specLabel: string
  cityLabel: string
  showScore: boolean
}) {
  const displayName = cleanName(doctor.name)
  const gender = guessGender(doctor.name)
  const specAr = doctor.specialityAr || specLabel || ''
  const cityAr = doctor.cityAr || cityLabel || ''
  const addrAr = doctor.addressAr || doctor.address || ''
  const locationLabel = addrAr
    ? `${addrAr}، ${cityAr}`.replace(/^،\s*/, '').replace(/،\s*$/, '')
    : cityAr || 'الجزائر'
  const waUrl = doctor.phone ? whatsappUrl(doctor.phone) : null
  const score = doctor.nameScore ?? 0
  const match = showScore && score > 0 ? matchLabel(score) : null

  return (
    <div className="dr-card">
      <div className="dr-card-header">
        <span className="dr-card-avatar">{gender === 'f' ? '👩‍⚕️' : '👨‍⚕️'}</span>
        <div className="dr-card-name-block">
          <div className="dr-card-name-row">
            <span className="dr-card-name">{displayName}</span>
            {match && (
              <span className={`dr-match-badge ${match.cls}`}>{match.label}</span>
            )}
          </div>
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
          <div className="dr-card-phone-group">
            <a
              className="dr-card-row dr-card-row--phone"
              href={telUrl(doctor.phone)}
            >
              <Phone size={13} className="dr-card-row-icon" />
              <span className="dr-card-row-text">{formatPhone(doctor.phone)}</span>
            </a>
            <div className="dr-card-phone-actions">
              <CopyPhoneBtn phone={doctor.phone} />
              {waUrl && (
                <a
                  className="dr-wa-btn"
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="واتساب"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </a>
              )}
            </div>
          </div>
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
          {isNameSearch ? (
            <>
              <p>لم أجد طبيباً باسم <strong>"{meta.queryName || meta.speciality.ar}"</strong> في قواعد البيانات.</p>
              <p className="dr-panel-empty-tip">جرّب كتابة الاسم بشكل مختلف، أو ابحث بالتخصص والمدينة.</p>
            </>
          ) : (
            <>
              <p>لم أجد نتائج حالياً لهذا البحث.</p>
              <p className="dr-panel-empty-tip">جرّب ولاية مجاورة أو تخصصاً مرادفاً.</p>
            </>
          )}
        </div>
      )}

      {doctors.length > 0 && (
        <div className="dr-cards-grid">
          {doctors.map((doc, i) => (
            <DoctorCard
              key={i}
              doctor={doc}
              specLabel={isNameSearch ? '' : meta.speciality.ar}
              cityLabel={meta.city.ar}
              showScore={isNameSearch}
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
