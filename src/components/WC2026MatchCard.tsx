import { useEffect, useState } from 'react'

interface MatchFix {
  group?: string
  homeTeam: string
  awayTeam: string
  date?: string
  startTime?: string
  venue?: string
  city?: string
  country?: string
  statusType?: 'upcoming' | 'live' | 'finished' | 'result-pending'
  homeScore?: number | null
  awayScore?: number | null
  competition?: string
  round?: string
  kooraLink?: string
  source?: string
  _sources?: string[]
  goals?: Array<{ player: string; minute?: number; team: string; assist?: string }>
  yellowCards?: Array<{ player: string; minute?: number; team: string }>
  redCards?: Array<{ player: string; minute?: number; team: string }>
}

function dzHour(utcTime?: string): string {
  if (!utcTime) return ''
  try {
    const [h, m] = utcTime.split(':').map(Number)
    return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  } catch { return utcTime }
}

function fmtDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('ar-DZ', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Algiers',
    })
  } catch { return dateStr }
}

function fmtDateShort(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('ar-DZ', {
      day: 'numeric', month: 'long', timeZone: 'Africa/Algiers',
    })
  } catch { return dateStr }
}

function getCountdown(dateStr?: string, timeStr?: string): string {
  if (!dateStr) return ''
  try {
    const [h, m] = (timeStr || '21:00').split(':').map(Number)
    const target = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`)
    const diff = target.getTime() - Date.now()
    if (diff <= 0) return ''
    const days = Math.floor(diff / 86400000)
    const hrs  = Math.floor((diff % 86400000) / 3600000)
    const mins = Math.floor((diff % 3600000) / 60000)
    if (days > 0) return `بعد ${days} يوم و${hrs} ساعة`
    if (hrs > 0)  return `بعد ${hrs} ساعة و${mins} دقيقة`
    return `بعد ${mins} دقيقة`
  } catch { return '' }
}

const FLAG_CODES: Record<string, string> = {
  'الجزائر': 'dz', 'الأرجنتين': 'ar', 'النمسا': 'at', 'الأردن': 'jo',
  'المكسيك': 'mx', 'جنوب أفريقيا': 'za', 'كوريا الجنوبية': 'kr',
  'التشيك': 'cz', 'جمهورية التشيك': 'cz', 'كندا': 'ca',
  'البوسنة والهرسك': 'ba', 'قطر': 'qa', 'سويسرا': 'ch',
  'البرازيل': 'br', 'المغرب': 'ma', 'هايتي': 'ht', 'اسكتلندا': 'gb-sct',
  'الولايات المتحدة': 'us', 'أمريكا': 'us', 'باراغواي': 'py',
  'أستراليا': 'au', 'تركيا': 'tr', 'ألمانيا': 'de', 'كوراساو': 'cw',
  'ساحل العاج': 'ci', 'الإكوادور': 'ec', 'هولندا': 'nl', 'اليابان': 'jp',
  'السويد': 'se', 'تونس': 'tn', 'بلجيكا': 'be', 'مصر': 'eg',
  'إيران': 'ir', 'نيوزيلندا': 'nz', 'إسبانيا': 'es', 'الرأس الأخضر': 'cv',
  'السعودية': 'sa', 'أوروغواي': 'uy', 'فرنسا': 'fr', 'السنغال': 'sn',
  'العراق': 'iq', 'النرويج': 'no', 'البرتغال': 'pt', 'كولومبيا': 'co',
  'إنجلترا': 'gb-eng', 'كرواتيا': 'hr', 'غانا': 'gh', 'بنما': 'pa',
  'الكونغو الديمقراطية': 'cd', 'أوزبكستان': 'uz', 'بيرو': 'pe',
  'تشيلي': 'cl', 'فنزويلا': 've', 'كوستاريكا': 'cr', 'هندوراس': 'hn',
  'جامايكا': 'jm', 'الدنمارك': 'dk', 'فنلندا': 'fi', 'اليونان': 'gr',
  'رومانيا': 'ro', 'أوكرانيا': 'ua', 'المجر': 'hu', 'سلوفاكيا': 'sk',
  'سلوفينيا': 'si', 'ألبانيا': 'al', 'جورجيا': 'ge', 'بولندا': 'pl',
  'صربيا': 'rs', 'الجبل الأسود': 'me', 'مقدونيا الشمالية': 'mk',
  'نيجيريا': 'ng', 'الكاميرون': 'cm', 'مالي': 'ml', 'بوركينا فاسو': 'bf',
  'غينيا': 'gn', 'موزمبيق': 'mz', 'زامبيا': 'zm', 'أنغولا': 'ao',
  'تنزانيا': 'tz', 'أوغندا': 'ug', 'ليبيا': 'ly', 'تشاد': 'td',
  'إيطاليا': 'it', 'البحرين': 'bh', 'الإمارات': 'ae', 'الكويت': 'kw',
  'Algeria': 'dz', 'Argentina': 'ar', 'Austria': 'at', 'Jordan': 'jo',
  'Mexico': 'mx', 'South Africa': 'za', 'South Korea': 'kr',
  'Czech Republic': 'cz', 'Czechia': 'cz', 'Czech': 'cz', 'Canada': 'ca',
  'Bosnia and Herzegovina': 'ba', 'Bosnia': 'ba', 'Qatar': 'qa',
  'Switzerland': 'ch', 'Brazil': 'br', 'Morocco': 'ma', 'Haiti': 'ht',
  'Scotland': 'gb-sct', 'USA': 'us', 'United States': 'us', 'US': 'us',
  'Paraguay': 'py', 'Australia': 'au', 'Turkey': 'tr', 'Türkiye': 'tr',
  'Germany': 'de', 'Curacao': 'cw', 'Curaçao': 'cw',
  "Ivory Coast": 'ci', "Côte d'Ivoire": 'ci', 'Ecuador': 'ec',
  'Netherlands': 'nl', 'Japan': 'jp', 'Sweden': 'se', 'Tunisia': 'tn',
  'Belgium': 'be', 'Egypt': 'eg', 'Iran': 'ir', 'New Zealand': 'nz',
  'Spain': 'es', 'Cape Verde': 'cv', 'Saudi Arabia': 'sa', 'Uruguay': 'uy',
  'France': 'fr', 'Senegal': 'sn', 'Iraq': 'iq', 'Norway': 'no',
  'Portugal': 'pt', 'DR Congo': 'cd', 'Congo DR': 'cd',
  'Uzbekistan': 'uz', 'Colombia': 'co', 'England': 'gb-eng',
  'Croatia': 'hr', 'Ghana': 'gh', 'Panama': 'pa', 'Greece': 'gr',
  'Italy': 'it', 'Hungary': 'hu', 'Bahrain': 'bh', 'Serbia': 'rs',
  'Ukraine': 'ua', 'Denmark': 'dk', 'Romania': 'ro', 'Poland': 'pl',
  'Nigeria': 'ng', 'Cameroon': 'cm', 'Mali': 'ml', 'Angola': 'ao',
  'Venezuela': 've', 'Peru': 'pe', 'Costa Rica': 'cr', 'Honduras': 'hn',
  'Jamaica': 'jm', 'Chile': 'cl', 'Albania': 'al', 'Georgia': 'ge',
  'Slovakia': 'sk', 'Slovenia': 'si', 'Montenegro': 'me',
  'North Macedonia': 'mk', 'Burkina Faso': 'bf', 'Guinea': 'gn',
  'Mozambique': 'mz', 'Zambia': 'zm', 'Finland': 'fi',
  'UAE': 'ae', 'United Arab Emirates': 'ae', 'Kuwait': 'kw',
}

function getFlagUrl(team: string) {
  const code = FLAG_CODES[team]
  if (!code) return null
  return `https://flagcdn.com/w160/${code}.png`
}

function isAlgeria(name: string) {
  return name === 'الجزائر' || name === 'Algeria'
}

const STATUS_CFG = {
  live:             { gradient: 'linear-gradient(135deg,#dc2626 0%,#ef4444 100%)', label: '🔴 مباشر الآن', pulse: true },
  finished:         { gradient: 'linear-gradient(135deg,#065f46 0%,#059669 100%)', label: '✅ انتهت', pulse: false },
  'result-pending': { gradient: 'linear-gradient(135deg,#92400e 0%,#d97706 100%)', label: '⏳ قيد التحديث', pulse: false },
  upcoming:         { gradient: 'linear-gradient(135deg,#312e81 0%,#4f46e5 100%)', label: '📅 مقبلة', pulse: false },
}

function TeamFlag({ name, large = false }: { name: string; large?: boolean }) {
  const url = getFlagUrl(name)
  const dz  = isAlgeria(name)
  const w   = large ? 140 : 120
  const h   = large ? 98  : 82

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: 1 }}>
      <div style={{
        width: w,
        height: h,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: dz
          ? '0 0 0 3px #22c55e, 0 6px 28px rgba(34,197,94,0.35)'
          : '0 4px 24px rgba(0,0,0,0.6)',
        border: dz ? '2.5px solid rgba(34,197,94,0.7)' : '2px solid rgba(255,255,255,0.12)',
        flexShrink: 0,
        position: 'relative',
      }}>
        {url ? (
          <img
            src={url}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40,
          }}>🏴</div>
        )}
        {dz && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 3,
            background: 'linear-gradient(90deg, #16a34a, #22c55e, #16a34a)',
          }} />
        )}
      </div>
      <span style={{
        color: dz ? '#86efac' : '#e2e8f0',
        fontWeight: dz ? 900 : 700,
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 1.3,
        maxWidth: 130,
        letterSpacing: dz ? 0.3 : 0,
      }}>{name}</span>
    </div>
  )
}

function ScoreBox({ match }: { match: MatchFix }) {
  const hasScore = match.homeScore !== null && match.homeScore !== undefined
    && match.awayScore !== null && match.awayScore !== undefined
  const isLive = match.statusType === 'live'
  const countdown = (!hasScore && match.statusType === 'upcoming')
    ? getCountdown(match.date, match.startTime)
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 110 }}>
      {hasScore ? (
        <div style={{
          background: isLive ? 'rgba(239,68,68,0.15)' : 'rgba(15,23,42,0.8)',
          border: isLive ? '2px solid rgba(239,68,68,0.6)' : '2px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: isLive ? '0 0 32px rgba(239,68,68,0.25)' : '0 6px 24px rgba(0,0,0,0.5)',
        }}>
          <span style={{ color: '#f8fafc', fontSize: 44, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' as const }}>
            {match.homeScore}
          </span>
          <span style={{ color: '#374151', fontSize: 28, fontWeight: 300 }}>—</span>
          <span style={{ color: '#f8fafc', fontSize: 44, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' as const }}>
            {match.awayScore}
          </span>
        </div>
      ) : (
        <div style={{
          background: 'linear-gradient(160deg, rgba(79,70,229,0.15) 0%, rgba(99,102,241,0.08) 100%)',
          border: '2px solid rgba(99,102,241,0.4)',
          borderRadius: 16,
          padding: '12px 16px',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(99,102,241,0.15)',
        }}>
          {match.startTime ? (
            <>
              <div style={{ color: '#a5b4fc', fontSize: 32, fontWeight: 900, lineHeight: 1, letterSpacing: -0.5 }}>
                {dzHour(match.startTime)}
              </div>
              <div style={{ color: '#6366f1', fontSize: 10, fontWeight: 700, marginTop: 4, letterSpacing: 0.8 }}>
                توقيت الجزائر
              </div>
            </>
          ) : (
            <div style={{ color: '#64748b', fontSize: 20, fontWeight: 700 }}>VS</div>
          )}
        </div>
      )}

      {countdown && (
        <div style={{
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: 20,
          padding: '3px 12px',
          color: '#86efac',
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}>
          ⏳ {countdown}
        </div>
      )}

      {match.round && (
        <span style={{ color: '#475569', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>
          {match.round}
        </span>
      )}
    </div>
  )
}

function EventsRow({ goals, yellowCards, redCards }: Pick<MatchFix, 'goals' | 'yellowCards' | 'redCards'>) {
  const has = (goals?.length || 0) + (yellowCards?.length || 0) + (redCards?.length || 0) > 0
  if (!has) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      {(goals || []).map((g, i) => (
        <span key={i} style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.22)', borderRadius: 8, padding: '2px 10px', fontSize: 11, color: '#6ee7b7' }}>
          ⚽ {g.player}{g.minute ? ` ${g.minute}'` : ''}{g.assist ? ` ↗ ${g.assist}` : ''}
        </span>
      ))}
      {(yellowCards || []).map((c, i) => (
        <span key={`y${i}`} style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 8, padding: '2px 10px', fontSize: 11, color: '#fde047' }}>
          🟨 {c.player}{c.minute ? ` ${c.minute}'` : ''}
        </span>
      ))}
      {(redCards || []).map((c, i) => (
        <span key={`r${i}`} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '2px 10px', fontSize: 11, color: '#fca5a5' }}>
          🟥 {c.player}{c.minute ? ` ${c.minute}'` : ''}
        </span>
      ))}
    </div>
  )
}

function MatchCard({ match, accent = false }: { match: MatchFix; accent?: boolean }) {
  const isLive     = match.statusType === 'live'
  const isFinished = match.statusType === 'finished'
  const statusCfg  = STATUS_CFG[(match.statusType as keyof typeof STATUS_CFG) ?? 'upcoming'] ?? STATUS_CFG.upcoming
  const src        = match.source || (match._sources && match._sources[0]) || ''
  const algHome    = isAlgeria(match.homeTeam)
  const algAway    = isAlgeria(match.awayTeam)
  const hasAlgeria = algHome || algAway

  return (
    <div style={{
      background: 'linear-gradient(160deg, #0a0f1e 0%, #0d1526 60%, #0a1020 100%)',
      border: isLive
        ? '1.5px solid rgba(239,68,68,0.5)'
        : hasAlgeria
          ? '1.5px solid rgba(34,197,94,0.2)'
          : '1.5px solid rgba(255,255,255,0.07)',
      borderRadius: 20,
      padding: '0 0 16px',
      margin: '10px 0',
      overflow: 'hidden',
      boxShadow: isLive
        ? '0 0 0 1px rgba(239,68,68,0.15), 0 16px 48px rgba(0,0,0,0.6)'
        : '0 12px 40px rgba(0,0,0,0.55)',
      direction: 'rtl',
      position: 'relative',
    }}>

      <div style={{
        background: isLive
          ? 'linear-gradient(90deg, rgba(220,38,38,0.3) 0%, rgba(239,68,68,0.15) 50%, rgba(220,38,38,0.05) 100%)'
          : hasAlgeria
            ? 'linear-gradient(90deg, rgba(5,150,105,0.2) 0%, rgba(16,185,129,0.08) 50%, transparent 100%)'
            : 'linear-gradient(90deg, rgba(79,70,229,0.18) 0%, rgba(99,102,241,0.06) 100%)',
        padding: '10px 18px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: statusCfg.gradient,
          color: '#fff',
          padding: '3px 12px',
          borderRadius: 20,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.5,
          boxShadow: isLive ? '0 0 14px rgba(239,68,68,0.5)' : 'none',
          animation: isLive ? 'wcPulse 2s infinite' : 'none',
        }}>
          {statusCfg.label}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {match.competition && (
            <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, maxWidth: 180, textAlign: 'left' }}>
              {match.competition}
            </span>
          )}
          {src && (
            <span style={{
              color: '#10b981', fontSize: 10, fontWeight: 700,
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.18)',
              borderRadius: 20, padding: '2px 9px',
            }}>
              📡 {src}
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '18px 18px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <TeamFlag name={match.homeTeam} large />
        <ScoreBox match={match} />
        <TeamFlag name={match.awayTeam} large />
      </div>

      <EventsRow goals={match.goals} yellowCards={match.yellowCards} redCards={match.redCards} />

      {(match.date || match.venue || match.city) && (
        <div style={{
          marginTop: 14, padding: '10px 18px 0',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {match.date && (
            <span style={{ color: '#94a3b8', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#6366f1' }}>📅</span> {fmtDate(match.date)}
            </span>
          )}
          {(match.venue || match.city) && (
            <span style={{ color: '#94a3b8', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#0ea5e9' }}>🏟️</span>
              {match.venue}{match.city ? `, ${match.city}` : ''}
              {match.country && match.country !== match.city ? ` — ${match.country}` : ''}
            </span>
          )}
        </div>
      )}

      <div style={{ padding: '12px 18px 0', display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {match.kooraLink && (
          <a href={match.kooraLink} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            ⚽ كووورة
          </a>
        )}
        <a href="https://www.fotmob.com/ar/leagues/77/fixtures/world-cup" target="_blank" rel="noopener noreferrer" style={linkStyle}>
          📱 FotMob
        </a>
        {!isFinished && (
          <a href="https://www.fifa.com/worldcup" target="_blank" rel="noopener noreferrer" style={linkStyle}>
            🏆 FIFA
          </a>
        )}
      </div>
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  color: '#818cf8',
  fontSize: 11,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'rgba(99,102,241,0.08)',
  padding: '4px 14px',
  borderRadius: 20,
  border: '1px solid rgba(99,102,241,0.18)',
  fontWeight: 600,
  transition: 'background 0.15s',
}

function ScheduleRow({ match, idx }: { match: MatchFix; idx: number }) {
  const dz  = isAlgeria(match.homeTeam) || isAlgeria(match.awayTeam)
  const opp = isAlgeria(match.homeTeam) ? match.awayTeam : match.homeTeam
  const oppFlagUrl = getFlagUrl(opp)
  const isHome = isAlgeria(match.homeTeam)
  const hasScore = match.homeScore !== null && match.homeScore !== undefined
    && match.awayScore !== null && match.awayScore !== undefined
  const scoreStr = hasScore ? `${match.homeScore} – ${match.awayScore}` : dzHour(match.startTime)
  const won  = hasScore && ((isHome && (match.homeScore! > match.awayScore!)) || (!isHome && (match.awayScore! > match.homeScore!)))
  const lost = hasScore && ((isHome && (match.homeScore! < match.awayScore!)) || (!isHome && (match.awayScore! < match.homeScore!)))
  const draw = hasScore && match.homeScore === match.awayScore
  const resultColor = won ? '#22c55e' : lost ? '#ef4444' : draw ? '#f59e0b' : '#6366f1'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      background: dz ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)',
      borderRadius: 12,
      border: dz ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(255,255,255,0.04)',
      direction: 'rtl',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        background: 'rgba(99,102,241,0.15)',
        border: '1px solid rgba(99,102,241,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#818cf8', fontSize: 11, fontWeight: 800, flexShrink: 0,
      }}>
        {idx + 1}
      </div>

      <div style={{ flexShrink: 0 }}>
        {oppFlagUrl ? (
          <img src={oppFlagUrl} alt={opp} style={{ width: 36, height: 26, objectFit: 'cover', borderRadius: 5, display: 'block', border: '1px solid rgba(255,255,255,0.1)' }} />
        ) : (
          <span style={{ fontSize: 20 }}>🏴</span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {isHome ? `🇩🇿 الجزائر vs ${opp}` : `${opp} vs 🇩🇿 الجزائر`}
        </div>
        <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
          {match.round && <span style={{ marginLeft: 6 }}>{match.round}</span>}
          <span>{fmtDateShort(match.date)}</span>
          {match.venue && <span style={{ marginRight: 6 }}> · 🏟️ {match.venue}</span>}
        </div>
      </div>

      <div style={{
        flexShrink: 0,
        background: hasScore ? 'rgba(15,23,42,0.8)' : 'rgba(99,102,241,0.1)',
        border: `1.5px solid ${resultColor}33`,
        borderRadius: 10,
        padding: '5px 12px',
        textAlign: 'center',
        minWidth: 56,
      }}>
        <div style={{ color: resultColor, fontWeight: 900, fontSize: 15, lineHeight: 1 }}>
          {scoreStr}
        </div>
        {!hasScore && <div style={{ color: '#475569', fontSize: 9, marginTop: 2, fontWeight: 600 }}>الجزائر</div>}
      </div>
    </div>
  )
}

interface WC2026MatchCardProps {
  matches: MatchFix[]
  title?: string
  autoRefresh?: boolean
  refreshInterval?: number
  showSchedule?: boolean
  allFixtures?: MatchFix[]
}

export default function WC2026MatchCard({
  matches,
  title,
  autoRefresh = false,
  refreshInterval = 30000,
  showSchedule = false,
  allFixtures,
}: WC2026MatchCardProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!autoRefresh) return
    const hasLive = matches.some(m => m.statusType === 'live')
    if (!hasLive) return
    const id = setInterval(() => setTick(t => t + 1), refreshInterval)
    return () => clearInterval(id)
  }, [matches, autoRefresh, refreshInterval])

  if (!matches || matches.length === 0) return null

  const scheduleMatches = allFixtures || (showSchedule ? matches : null)

  return (
    <div style={{ direction: 'rtl', fontFamily: 'inherit' }}>
      <style>{`
        @keyframes wcPulse {
          0%,100% { box-shadow: 0 0 10px rgba(239,68,68,0.5); }
          50% { box-shadow: 0 0 22px rgba(239,68,68,0.85); }
        }
        @keyframes wcLiveLine {
          0% { transform: scaleX(0.3) translateX(-70%); opacity:0.4; }
          50% { transform: scaleX(1) translateX(0); opacity:1; }
          100% { transform: scaleX(0.3) translateX(70%); opacity:0.4; }
        }
      `}</style>

      {title && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 10, padding: '10px 16px',
          background: 'linear-gradient(90deg, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0.04) 70%, transparent 100%)',
          borderRight: '3px solid #10b981',
          borderRadius: '0 14px 14px 0',
        }}>
          <span style={{ fontSize: 22 }}>🏆</span>
          <div>
            <div style={{ color: '#d1fae5', fontWeight: 900, fontSize: 15 }}>{title}</div>
            <div style={{ color: '#6ee7b7', fontSize: 10, fontWeight: 600, marginTop: 1 }}>
              FIFA World Cup 2026 · المجموعة J
            </div>
          </div>
          {autoRefresh && matches.some(m => m.statusType === 'live') && (
            <span style={{ marginRight: 'auto', color: '#ef4444', fontSize: 11, fontWeight: 700, animation: 'wcPulse 2s infinite' }}>
              ● تحديث تلقائي
            </span>
          )}
        </div>
      )}

      {matches.map((m, i) => <MatchCard key={i} match={m} accent={isAlgeria(m.homeTeam) || isAlgeria(m.awayTeam)} />)}

      {scheduleMatches && scheduleMatches.length > 1 && (
        <div style={{
          marginTop: 6,
          background: 'linear-gradient(160deg, #080d1a 0%, #0b1220 100%)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 16 }}>📅</span>
            <span style={{ color: '#94a3b8', fontWeight: 800, fontSize: 13 }}>
              جدول مباريات 🇩🇿 الجزائر — كأس العالم 2026
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px 12px' }}>
            {scheduleMatches.map((m, i) => <ScheduleRow key={i} match={m} idx={i} />)}
          </div>

          <div style={{
            padding: '8px 16px 10px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            display: 'flex', gap: 8, justifyContent: 'center',
          }}>
            <a href="https://www.kooora.com/?wc2026" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>⚽ كووورة</a>
            <a href="https://jdwel.com/2026-world-cup-fixtures/" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>🗓️ جدول كامل</a>
            <a href="https://www.fotmob.com/ar/leagues/77/fixtures/world-cup" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>📱 FotMob</a>
          </div>
        </div>
      )}
    </div>
  )
}
