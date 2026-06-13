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

function getCountdownParts(dateStr?: string, timeStr?: string): { days: number; hrs: number; mins: number; secs: number } | null {
  if (!dateStr) return null
  try {
    const [h, m] = (timeStr || '21:00').split(':').map(Number)
    const target = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`)
    const diff = target.getTime() - Date.now()
    if (diff <= 0) return null
    return {
      days: Math.floor(diff / 86400000),
      hrs:  Math.floor((diff % 86400000) / 3600000),
      mins: Math.floor((diff % 3600000) / 60000),
      secs: Math.floor((diff % 60000) / 1000),
    }
  } catch { return null }
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

function isAlgeria(t: string) {
  return /جزائر|Algeria/i.test(t)
}

function CountdownTimer({ dateStr, timeStr }: { dateStr?: string; timeStr?: string }) {
  const [parts, setParts] = useState(() => getCountdownParts(dateStr, timeStr))
  useEffect(() => {
    if (!parts) return
    const id = setInterval(() => setParts(getCountdownParts(dateStr, timeStr)), 1000)
    return () => clearInterval(id)
  }, [dateStr, timeStr])
  if (!parts) return null
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '14px 0 4px' }}>
      {[
        { v: parts.days, l: 'يوم' },
        { v: parts.hrs,  l: 'ساعة' },
        { v: parts.mins, l: 'دقيقة' },
        { v: parts.secs, l: 'ثانية' },
      ].map(({ v, l }) => (
        <div key={l} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: 'rgba(6,6,20,0.7)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 10,
          padding: '8px 12px',
          minWidth: 52,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: '#a5b4fc', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {String(v).padStart(2, '0')}
          </span>
          <span style={{ fontSize: 9, color: '#475569', fontWeight: 700, marginTop: 3, letterSpacing: 0.5 }}>{l}</span>
        </div>
      ))}
    </div>
  )
}

function TeamBlock({ name, isMain = false }: { name: string; isMain?: boolean }) {
  const url = getFlagUrl(name)
  const dz = isAlgeria(name)
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      flex: 1, minWidth: 0,
    }}>
      <div style={{
        width: 100, height: 70,
        borderRadius: 10,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: dz
          ? '0 0 0 2.5px #22c55e, 0 8px 32px rgba(34,197,94,0.4), 0 2px 12px rgba(0,0,0,0.6)'
          : '0 6px 28px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}>
        {url ? (
          <img
            src={url} alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            loading="eager"
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36,
          }}>🏴</div>
        )}
        {dz && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 3,
            background: 'linear-gradient(90deg, #16a34a, #22c55e, #4ade80, #22c55e, #16a34a)',
          }} />
        )}
      </div>
      <span style={{
        color: dz ? '#86efac' : '#e2e8f0',
        fontWeight: dz ? 900 : 700,
        fontSize: isMain ? 14 : 13,
        textAlign: 'center',
        lineHeight: 1.3,
        maxWidth: 110,
        letterSpacing: dz ? 0.4 : 0,
        textShadow: dz ? '0 0 12px rgba(34,197,94,0.5)' : 'none',
      }}>{name}</span>
    </div>
  )
}

function ScoreBox({ match }: { match: MatchFix }) {
  const isLive     = match.statusType === 'live'
  const isFinished = match.statusType === 'finished'
  const hasScore   = isFinished || isLive
  const showScore  = hasScore && match.homeScore !== null && match.homeScore !== undefined

  if (showScore) {
    const algHome = isAlgeria(match.homeTeam)
    const dzScore = algHome ? match.homeScore : match.awayScore
    const opScore = algHome ? match.awayScore : match.homeScore
    const won  = dzScore! > opScore!
    const lost = dzScore! < opScore!

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        minWidth: 90, flexShrink: 0,
      }}>
        <div style={{
          background: 'rgba(5,5,18,0.9)',
          border: `2px solid ${won ? 'rgba(34,197,94,0.5)' : lost ? 'rgba(239,68,68,0.5)' : 'rgba(251,191,36,0.5)'}`,
          borderRadius: 14,
          padding: '8px 20px',
          textAlign: 'center',
          boxShadow: won ? '0 0 20px rgba(34,197,94,0.2)' : lost ? '0 0 20px rgba(239,68,68,0.2)' : 'none',
        }}>
          <div style={{
            fontSize: 30,
            fontWeight: 900,
            color: won ? '#4ade80' : lost ? '#f87171' : '#fbbf24',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {match.homeScore} – {match.awayScore}
          </div>
          <div style={{ color: '#475569', fontSize: 9, fontWeight: 700, marginTop: 4, letterSpacing: 1 }}>
            {isLive ? '🔴 LIVE' : 'FT'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      minWidth: 80, flexShrink: 0,
    }}>
      <div style={{
        background: 'rgba(5,5,18,0.8)',
        border: '1.5px solid rgba(99,102,241,0.3)',
        borderRadius: 14,
        padding: '8px 18px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#818cf8', lineHeight: 1 }}>VS</div>
        {match.startTime && (
          <div style={{ color: '#6366f1', fontSize: 11, fontWeight: 800, marginTop: 4, letterSpacing: 0.5 }}>
            ⏰ {dzHour(match.startTime)}
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_CFG = {
  live:             { gradient: 'linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)', label: '🔴 مباشر', pulse: true },
  finished:         { gradient: 'linear-gradient(135deg,#065f46 0%,#059669 100%)', label: '✅ انتهت', pulse: false },
  'result-pending': { gradient: 'linear-gradient(135deg,#92400e 0%,#d97706 100%)', label: '⏳ جاري التحديث', pulse: false },
  upcoming:         { gradient: 'linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%)', label: '📅 مقبلة', pulse: false },
}

function MatchCard({ match }: { match: MatchFix }) {
  const isLive     = match.statusType === 'live'
  const isFinished = match.statusType === 'finished'
  const statusCfg  = STATUS_CFG[(match.statusType as keyof typeof STATUS_CFG) ?? 'upcoming'] ?? STATUS_CFG.upcoming
  const algHome    = isAlgeria(match.homeTeam)
  const algAway    = isAlgeria(match.awayTeam)
  const hasAlgeria = algHome || algAway
  const src        = match.source || (match._sources && match._sources[0]) || ''
  const isUpcoming = match.statusType === 'upcoming' || !match.statusType

  return (
    <div style={{
      background: hasAlgeria
        ? 'linear-gradient(160deg, #03080f 0%, #040d18 40%, #060f1e 70%, #03080f 100%)'
        : 'linear-gradient(160deg, #070c18 0%, #0a1022 60%, #07091a 100%)',
      border: isLive
        ? '1.5px solid rgba(239,68,68,0.55)'
        : hasAlgeria
          ? '1.5px solid rgba(34,197,94,0.28)'
          : '1.5px solid rgba(99,102,241,0.2)',
      borderRadius: 20,
      margin: '8px 0',
      overflow: 'hidden',
      boxShadow: hasAlgeria
        ? '0 0 0 1px rgba(34,197,94,0.06), 0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.03)'
        : '0 16px 50px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.03)',
      direction: 'rtl',
      position: 'relative',
    }}>
      {hasAlgeria && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'radial-gradient(ellipse at 50% 0%, rgba(34,197,94,0.06) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
      )}

      <div style={{
        background: isLive
          ? 'linear-gradient(90deg, rgba(220,38,38,0.25) 0%, rgba(239,68,68,0.1) 60%, transparent 100%)'
          : hasAlgeria
            ? 'linear-gradient(90deg, rgba(5,150,105,0.18) 0%, rgba(16,185,129,0.06) 60%, transparent 100%)'
            : 'linear-gradient(90deg, rgba(67,56,202,0.18) 0%, rgba(99,102,241,0.06) 60%, transparent 100%)',
        padding: '10px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: statusCfg.gradient,
            color: '#fff',
            padding: '3px 12px',
            borderRadius: 20,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: 0.4,
            boxShadow: isLive ? '0 0 16px rgba(239,68,68,0.6)' : 'none',
            animation: isLive ? 'wcPulse 2s infinite' : 'none',
          }}>
            {statusCfg.label}
          </span>
          {match.round && (
            <span style={{
              color: '#64748b', fontSize: 10, fontWeight: 700,
              background: 'rgba(255,255,255,0.04)',
              padding: '2px 10px', borderRadius: 20,
              border: '1px solid rgba(255,255,255,0.06)',
            }}>{match.round}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {match.competition && (
            <span style={{ color: '#475569', fontSize: 10, fontWeight: 600 }}>
              {match.competition}
            </span>
          )}
          {src && (
            <span style={{
              color: '#10b981', fontSize: 9, fontWeight: 700,
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.15)',
              borderRadius: 20, padding: '2px 8px',
            }}>📡 {src}</span>
          )}
        </div>
      </div>

      <div style={{ padding: '22px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <TeamBlock name={match.homeTeam} isMain />
        <ScoreBox match={match} />
        <TeamBlock name={match.awayTeam} isMain />
      </div>

      {isUpcoming && (
        <CountdownTimer dateStr={match.date} timeStr={match.startTime} />
      )}

      {(match.goals || match.yellowCards || match.redCards) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '6px 16px 0', justifyContent: 'center' }}>
          {(match.goals || []).map((g, i) => (
            <span key={`g${i}`} style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 8, padding: '2px 10px', fontSize: 11, color: '#fde68a' }}>
              ⚽ {g.player}{g.minute ? ` ${g.minute}'` : ''}
            </span>
          ))}
          {(match.yellowCards || []).map((c, i) => (
            <span key={`y${i}`} style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 8, padding: '2px 10px', fontSize: 11, color: '#fef08a' }}>
              🟨 {c.player}{c.minute ? ` ${c.minute}'` : ''}
            </span>
          ))}
          {(match.redCards || []).map((c, i) => (
            <span key={`r${i}`} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '2px 10px', fontSize: 11, color: '#fca5a5' }}>
              🟥 {c.player}{c.minute ? ` ${c.minute}'` : ''}
            </span>
          ))}
        </div>
      )}

      {(match.date || match.venue || match.city) && (
        <div style={{
          marginTop: 14, padding: '10px 18px 0',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {match.date && (
            <span style={{ color: '#64748b', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#6366f1' }}>📅</span>
              <span style={{ color: '#94a3b8', fontWeight: 600 }}>{fmtDate(match.date)}</span>
            </span>
          )}
          {(match.venue || match.city) && (
            <span style={{ color: '#64748b', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#0ea5e9' }}>🏟️</span>
              <span style={{ color: '#94a3b8' }}>
                {match.venue}{match.city ? `, ${match.city}` : ''}
                {match.country && match.country !== match.city ? ` — ${match.country}` : ''}
              </span>
            </span>
          )}
        </div>
      )}

      <div style={{ padding: '12px 18px 4px', display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
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
  const dz = isAlgeria(match.homeTeam) || isAlgeria(match.awayTeam)
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
      gap: 10,
      padding: '10px 14px',
      background: dz ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.02)',
      borderRadius: 12,
      border: dz ? '1px solid rgba(34,197,94,0.18)' : '1px solid rgba(255,255,255,0.05)',
      direction: 'rtl',
      transition: 'background 0.15s',
    }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: 'rgba(99,102,241,0.12)',
        border: '1px solid rgba(99,102,241,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#818cf8', fontSize: 11, fontWeight: 800, flexShrink: 0,
      }}>
        {idx + 1}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <img src="https://flagcdn.com/w40/dz.png" alt="الجزائر" style={{ width: 30, height: 20, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(34,197,94,0.3)' }} />
        {oppFlagUrl ? (
          <img src={oppFlagUrl} alt={opp} style={{ width: 30, height: 20, objectFit: 'cover', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }} />
        ) : (
          <span style={{ fontSize: 18 }}>🏴</span>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: dz ? '#d1fae5' : '#e2e8f0', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {isHome ? `🇩🇿 الجزائر ضد ${opp}` : `${opp} ضد 🇩🇿 الجزائر`}
        </div>
        <div style={{ color: '#475569', fontSize: 10, marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {match.round && <span style={{ color: '#6366f1' }}>{match.round}</span>}
          <span>{fmtDateShort(match.date)}</span>
          {match.venue && <span>🏟️ {match.venue}</span>}
        </div>
      </div>

      <div style={{
        flexShrink: 0,
        background: 'rgba(6,6,20,0.8)',
        border: `1.5px solid ${resultColor}44`,
        borderRadius: 10,
        padding: '5px 12px',
        textAlign: 'center',
        minWidth: 56,
        boxShadow: `0 0 10px ${resultColor}18`,
      }}>
        <div style={{ color: resultColor, fontWeight: 900, fontSize: 14, lineHeight: 1 }}>
          {scoreStr}
        </div>
        {!hasScore && <div style={{ color: '#334155', fontSize: 9, marginTop: 2, fontWeight: 700 }}>توقيت الجزائر</div>}
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
    <div style={{ direction: 'rtl', fontFamily: 'inherit', maxWidth: 520 }}>
      <style>{`
        @keyframes wcPulse {
          0%,100% { box-shadow: 0 0 8px rgba(239,68,68,0.45); }
          50% { box-shadow: 0 0 20px rgba(239,68,68,0.85); }
        }
        @keyframes wcGlow {
          0%,100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>

      {title && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 10, padding: '12px 18px',
          background: 'linear-gradient(90deg, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0.05) 60%, transparent 100%)',
          borderRight: '3px solid #10b981',
          borderRadius: '0 14px 14px 0',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'radial-gradient(ellipse at 0% 50%, rgba(16,185,129,0.1) 0%, transparent 60%)',
            pointerEvents: 'none',
          }} />
          <span style={{ fontSize: 24, filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.6))' }}>🏆</span>
          <div>
            <div style={{ color: '#d1fae5', fontWeight: 900, fontSize: 15, lineHeight: 1.2 }}>{title}</div>
            <div style={{ color: '#6ee7b7', fontSize: 10, fontWeight: 700, marginTop: 3, letterSpacing: 0.5 }}>
              FIFA World Cup 2026 · USA · CAN · MEX · المجموعة J
            </div>
          </div>
          {autoRefresh && matches.some(m => m.statusType === 'live') && (
            <span style={{
              marginRight: 'auto', color: '#ef4444', fontSize: 11, fontWeight: 800,
              animation: 'wcGlow 1.5s infinite',
            }}>
              ● تحديث مباشر
            </span>
          )}
        </div>
      )}

      {matches.map((m, i) => <MatchCard key={i} match={m} />)}

      {scheduleMatches && scheduleMatches.length > 1 && (
        <div style={{
          marginTop: 8,
          background: 'linear-gradient(160deg, #060b17 0%, #090e1e 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}>
          <div style={{
            padding: '12px 16px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'linear-gradient(90deg, rgba(99,102,241,0.12) 0%, transparent 80%)',
          }}>
            <span style={{ fontSize: 18 }}>📅</span>
            <span style={{ color: '#c7d2fe', fontWeight: 900, fontSize: 13 }}>
              جدول مباريات 🇩🇿 الجزائر — كأس العالم 2026
            </span>
            <span style={{
              marginRight: 'auto',
              background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)',
              color: '#818cf8', borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700,
            }}>المجموعة J</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px 12px' }}>
            {scheduleMatches.map((m, i) => <ScheduleRow key={i} match={m} idx={i} />)}
          </div>

          <div style={{
            padding: '8px 16px 12px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            display: 'flex', gap: 6, justifyContent: 'center',
          }}>
            <a href="https://www.kooora.com/?wc2026" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>⚽ كووورة</a>
            <a href="https://jdwel.com/2026-world-cup-fixtures/" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>🗓️ الجدول الكامل</a>
            <a href="https://www.fotmob.com/ar/leagues/77/fixtures/world-cup" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>📱 FotMob</a>
          </div>
        </div>
      )}
    </div>
  )
}
