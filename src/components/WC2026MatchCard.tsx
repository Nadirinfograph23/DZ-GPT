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

const TEAM_ALIASES: Record<string, string> = {
  'أمريكا': 'الولايات المتحدة', 'الولايات المتحده': 'الولايات المتحدة',
  'الامارات': 'الإمارات', 'امارات': 'الإمارات',
  'كوريا': 'كوريا الجنوبية', 'كوريا الجنوبيه': 'كوريا الجنوبية',
  'المغرب': 'المغرب', 'بوسنة': 'البوسنة والهرسك',
  'USA': 'الولايات المتحدة', 'US': 'الولايات المتحدة',
  'KSA': 'السعودية', 'Saudi Arabia': 'السعودية',
  'Algeria': 'الجزائر', 'Argentina': 'الأرجنتين',
  'Austria': 'النمسا', 'Jordan': 'الأردن',
}

function normalizeTeam(t: string): string {
  return TEAM_ALIASES[t] || t.trim().replace(/^ال/, 'ال').replace(/ه$/, 'ة')
}

function deduplicateMatches(matches: MatchFix[]): MatchFix[] {
  const seen = new Set<string>()
  return matches.filter(m => {
    const h = normalizeTeam(m.homeTeam)
    const a = normalizeTeam(m.awayTeam)
    // Also try reversed order (different sources may swap home/away)
    const key1 = `${h}|${a}|${m.date || ''}`
    const key2 = `${a}|${h}|${m.date || ''}`
    if (seen.has(key1) || seen.has(key2)) return false
    seen.add(key1)
    return true
  })
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

function getFlagUrl(team: string): string | null {
  const code = FLAG_CODES[team]
  return code ? `https://flagcdn.com/w80/${code}.png` : null
}

function isAlgeria(t: string) { return /جزائر|Algeria/i.test(t) }

// ─── Countdown Timer ──────────────────────────────────────────────────────────
function CountdownTimer({ dateStr, timeStr }: { dateStr?: string; timeStr?: string }) {
  const [parts, setParts] = useState(() => getCountdownParts(dateStr, timeStr))
  useEffect(() => {
    if (!parts) return
    const id = setInterval(() => setParts(getCountdownParts(dateStr, timeStr)), 1000)
    return () => clearInterval(id)
  }, [dateStr, timeStr])
  if (!parts) return null
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '14px 0 4px' }}>
      {[{ v: parts.days, l: 'يوم' }, { v: parts.hrs, l: 'ساعة' }, { v: parts.mins, l: 'دقيقة' }, { v: parts.secs, l: 'ثانية' }].map(({ v, l }) => (
        <div key={l} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: 'rgba(6,6,20,0.7)', border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 10, padding: '7px 11px', minWidth: 48,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#a5b4fc', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {String(v).padStart(2, '0')}
          </span>
          <span style={{ fontSize: 9, color: '#475569', fontWeight: 700, marginTop: 3, letterSpacing: 0.5 }}>{l}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Mini Flag Image ──────────────────────────────────────────────────────────
function MiniFlag({ name, size = 36 }: { name: string; size?: number }) {
  const url = getFlagUrl(name)
  const dz = isAlgeria(name)
  const h = Math.round(size * 0.7)
  return url ? (
    <img src={url} alt={name} style={{
      width: size, height: h, objectFit: 'cover', borderRadius: 5, display: 'block', flexShrink: 0,
      border: dz ? '1.5px solid rgba(34,197,94,0.6)' : '1px solid rgba(255,255,255,0.12)',
      boxShadow: dz ? '0 0 8px rgba(34,197,94,0.35)' : '0 2px 8px rgba(0,0,0,0.4)',
    }} />
  ) : <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>🏴</span>
}

// ─── Large Team Block (for single-match card) ─────────────────────────────────
function TeamBlock({ name }: { name: string }) {
  const url = getFlagUrl(name)
  const dz = isAlgeria(name)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
      <div style={{
        width: 100, height: 70, borderRadius: 10, overflow: 'hidden', position: 'relative', flexShrink: 0,
        boxShadow: dz
          ? '0 0 0 2.5px #22c55e, 0 8px 32px rgba(34,197,94,0.4), 0 2px 12px rgba(0,0,0,0.6)'
          : '0 6px 28px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(255,255,255,0.1)',
      }}>
        {url ? (
          <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="eager" />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36 }}>🏴</div>
        )}
        {dz && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #16a34a, #22c55e, #4ade80, #22c55e, #16a34a)' }} />}
      </div>
      <span style={{
        color: dz ? '#86efac' : '#e2e8f0', fontWeight: dz ? 900 : 700, fontSize: 14,
        textAlign: 'center', lineHeight: 1.3, maxWidth: 110,
        textShadow: dz ? '0 0 12px rgba(34,197,94,0.5)' : 'none',
      }}>{name}</span>
    </div>
  )
}

// ─── Score/VS Box ─────────────────────────────────────────────────────────────
function ScoreBox({ match }: { match: MatchFix }) {
  const isLive     = match.statusType === 'live'
  const isFinished = match.statusType === 'finished'
  const showScore  = (isFinished || isLive) && match.homeScore !== null && match.homeScore !== undefined

  if (showScore) {
    const algHome = isAlgeria(match.homeTeam)
    const dzScore = algHome ? match.homeScore : match.awayScore
    const opScore = algHome ? match.awayScore : match.homeScore
    const won = dzScore! > opScore!; const lost = dzScore! < opScore!
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 90, flexShrink: 0 }}>
        <div style={{
          background: 'rgba(5,5,18,0.9)',
          border: `2px solid ${won ? 'rgba(34,197,94,0.5)' : lost ? 'rgba(239,68,68,0.5)' : 'rgba(251,191,36,0.5)'}`,
          borderRadius: 14, padding: '8px 20px', textAlign: 'center',
          boxShadow: won ? '0 0 20px rgba(34,197,94,0.2)' : lost ? '0 0 20px rgba(239,68,68,0.2)' : 'none',
        }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: won ? '#4ade80' : lost ? '#f87171' : '#fbbf24', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 80, flexShrink: 0 }}>
      <div style={{ background: 'rgba(5,5,18,0.8)', border: '1.5px solid rgba(99,102,241,0.3)', borderRadius: 14, padding: '8px 18px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#818cf8', lineHeight: 1 }}>VS</div>
        {match.startTime && (
          <div style={{ color: '#6366f1', fontSize: 11, fontWeight: 800, marginTop: 4, letterSpacing: 0.5 }}>⏰ {dzHour(match.startTime)}</div>
        )}
      </div>
    </div>
  )
}

// ─── Single Match Full Card ───────────────────────────────────────────────────
function MatchCard({ match }: { match: MatchFix }) {
  const isLive     = match.statusType === 'live'
  const isFinished = match.statusType === 'finished'
  const hasAlgeria = isAlgeria(match.homeTeam) || isAlgeria(match.awayTeam)
  const isUpcoming = !isLive && !isFinished
  const src        = match.source || (match._sources && match._sources[0]) || ''

  const STATUS_LABEL: Record<string, string> = {
    live: '🔴 مباشر', finished: '✅ انتهت',
    'result-pending': '⏳ جاري التحديث', upcoming: '📅 قادمة',
  }
  const STATUS_BG: Record<string, string> = {
    live: 'linear-gradient(135deg,#7f1d1d,#dc2626)',
    finished: 'linear-gradient(135deg,#065f46,#059669)',
    'result-pending': 'linear-gradient(135deg,#92400e,#d97706)',
    upcoming: 'linear-gradient(135deg,#1e1b4b,#4338ca)',
  }
  const status = match.statusType || 'upcoming'

  return (
    <div style={{
      background: hasAlgeria
        ? 'linear-gradient(160deg,#03080f 0%,#040d18 40%,#060f1e 70%,#03080f 100%)'
        : 'linear-gradient(160deg,#070c18 0%,#0a1022 60%,#07091a 100%)',
      border: isLive ? '1.5px solid rgba(239,68,68,0.55)'
        : hasAlgeria ? '1.5px solid rgba(34,197,94,0.28)'
        : '1.5px solid rgba(99,102,241,0.2)',
      borderRadius: 20, margin: '8px 0', overflow: 'hidden',
      boxShadow: hasAlgeria
        ? '0 0 0 1px rgba(34,197,94,0.06),0 20px 60px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.03)'
        : '0 16px 50px rgba(0,0,0,0.65),inset 0 1px 0 rgba(255,255,255,0.03)',
      direction: 'rtl', position: 'relative',
    }}>
      {hasAlgeria && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(ellipse at 50% 0%,rgba(34,197,94,0.06) 0%,transparent 65%)', pointerEvents: 'none' }} />
      )}

      {/* Header */}
      <div style={{
        background: isLive ? 'linear-gradient(90deg,rgba(220,38,38,0.25),rgba(239,68,68,0.1) 60%,transparent)'
          : hasAlgeria ? 'linear-gradient(90deg,rgba(5,150,105,0.18),rgba(16,185,129,0.06) 60%,transparent)'
          : 'linear-gradient(90deg,rgba(67,56,202,0.18),rgba(99,102,241,0.06) 60%,transparent)',
        padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: STATUS_BG[status] || STATUS_BG.upcoming,
            color: '#fff', padding: '3px 12px', borderRadius: 20, fontSize: 10, fontWeight: 800,
            boxShadow: isLive ? '0 0 16px rgba(239,68,68,0.6)' : 'none',
            animation: isLive ? 'wcPulse 2s infinite' : 'none',
          }}>{STATUS_LABEL[status] || '📅 قادمة'}</span>
          {match.round && (
            <span style={{ color: '#64748b', fontSize: 10, fontWeight: 700, background: 'rgba(255,255,255,0.04)', padding: '2px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)' }}>{match.round}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {match.competition && <span style={{ color: '#475569', fontSize: 10 }}>{match.competition}</span>}
          {src && <span style={{ color: '#10b981', fontSize: 9, fontWeight: 700, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 20, padding: '2px 8px' }}>📡 {src}</span>}
        </div>
      </div>

      {/* Teams + Score */}
      <div style={{ padding: '22px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <TeamBlock name={match.homeTeam} />
        <ScoreBox match={match} />
        <TeamBlock name={match.awayTeam} />
      </div>

      {isUpcoming && <CountdownTimer dateStr={match.date} timeStr={match.startTime} />}

      {/* Events */}
      {(match.goals?.length || match.yellowCards?.length || match.redCards?.length) ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '6px 16px 0', justifyContent: 'center' }}>
          {(match.goals || []).map((g, i) => <span key={`g${i}`} style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 8, padding: '2px 10px', fontSize: 11, color: '#fde68a' }}>⚽ {g.player}{g.minute ? ` ${g.minute}'` : ''}</span>)}
          {(match.yellowCards || []).map((c, i) => <span key={`y${i}`} style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 8, padding: '2px 10px', fontSize: 11, color: '#fef08a' }}>🟨 {c.player}{c.minute ? ` ${c.minute}'` : ''}</span>)}
          {(match.redCards || []).map((c, i) => <span key={`r${i}`} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '2px 10px', fontSize: 11, color: '#fca5a5' }}>🟥 {c.player}{c.minute ? ` ${c.minute}'` : ''}</span>)}
        </div>
      ) : null}

      {/* Date / Venue */}
      {(match.date || match.venue || match.city) && (
        <div style={{ marginTop: 14, padding: '10px 18px 0', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {match.date && <span style={{ color: '#64748b', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ color: '#6366f1' }}>📅</span><span style={{ color: '#94a3b8', fontWeight: 600 }}>{fmtDate(match.date)}</span></span>}
          {(match.venue || match.city) && <span style={{ color: '#64748b', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ color: '#0ea5e9' }}>🏟️</span><span style={{ color: '#94a3b8' }}>{match.venue}{match.city ? `, ${match.city}` : ''}{match.country && match.country !== match.city ? ` — ${match.country}` : ''}</span></span>}
        </div>
      )}

      {/* Links */}
      <div style={{ padding: '12px 18px 4px', display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {match.kooraLink && <a href={match.kooraLink} target="_blank" rel="noopener noreferrer" style={linkStyle}>⚽ كووورة</a>}
        <a href="https://www.fotmob.com/ar/leagues/77/fixtures/world-cup" target="_blank" rel="noopener noreferrer" style={linkStyle}>📱 FotMob</a>
        {!isFinished && <a href="https://www.fifa.com/worldcup" target="_blank" rel="noopener noreferrer" style={linkStyle}>🏆 FIFA</a>}
      </div>
    </div>
  )
}

// ─── Score Center Row (compact multi-match) ───────────────────────────────────
function ScoreCenterRow({ match }: { match: MatchFix }) {
  const isLive     = match.statusType === 'live'
  const isFinished = match.statusType === 'finished'
  const hasScore   = (isLive || isFinished) && match.homeScore !== null && match.homeScore !== undefined
  const algHome = isAlgeria(match.homeTeam)
  const algAway = isAlgeria(match.awayTeam)
  const hasAlg = algHome || algAway

  let scoreColor = '#818cf8'
  if (hasScore) {
    const dzScore = algHome ? match.homeScore : match.awayScore
    const opScore = algHome ? match.awayScore : match.homeScore
    if (dzScore !== null && opScore !== null && dzScore !== undefined && opScore !== undefined) {
      scoreColor = dzScore > opScore ? '#22c55e' : dzScore < opScore ? '#f87171' : '#fbbf24'
    } else {
      scoreColor = '#e2e8f0'
    }
  }

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8,
      padding: '12px 16px',
      background: hasAlg
        ? 'linear-gradient(90deg,rgba(16,185,129,0.08) 0%,rgba(16,185,129,0.03) 50%,rgba(16,185,129,0.08) 100%)'
        : 'rgba(255,255,255,0.02)',
      borderRadius: 12,
      border: hasAlg ? '1px solid rgba(34,197,94,0.18)' : '1px solid rgba(255,255,255,0.05)',
      direction: 'rtl',
      transition: 'background 0.15s',
    }}>
      {/* Home team */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
        <span style={{ color: isAlgeria(match.homeTeam) ? '#86efac' : '#e2e8f0', fontWeight: isAlgeria(match.homeTeam) ? 800 : 600, fontSize: 13, textAlign: 'right' }}>
          {match.homeTeam}
        </span>
        <MiniFlag name={match.homeTeam} size={38} />
      </div>

      {/* Score / Time */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 70 }}>
        {hasScore ? (
          <div style={{
            background: 'rgba(5,5,18,0.9)', border: `1.5px solid ${scoreColor}44`,
            borderRadius: 10, padding: '5px 12px', textAlign: 'center',
            boxShadow: `0 0 12px ${scoreColor}22`,
          }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: scoreColor, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}>
              {match.homeScore} – {match.awayScore}
            </span>
            <div style={{ fontSize: 8, color: isLive ? '#ef4444' : '#475569', fontWeight: 700, letterSpacing: 1, marginTop: 2 }}>
              {isLive ? '🔴 LIVE' : 'FT'}
            </div>
          </div>
        ) : (
          <div style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 10, padding: '5px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#6366f1' }}>
              {match.startTime ? dzHour(match.startTime) : 'TBD'}
            </div>
            {match.date && <div style={{ fontSize: 8, color: '#475569', fontWeight: 600, marginTop: 1 }}>{fmtDateShort(match.date)}</div>}
          </div>
        )}
      </div>

      {/* Away team */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }}>
        <MiniFlag name={match.awayTeam} size={38} />
        <span style={{ color: isAlgeria(match.awayTeam) ? '#86efac' : '#e2e8f0', fontWeight: isAlgeria(match.awayTeam) ? 800 : 600, fontSize: 13, textAlign: 'left' }}>
          {match.awayTeam}
        </span>
      </div>
    </div>
  )
}

// ─── Score Center (multi-match dashboard) ────────────────────────────────────
function ScoreCenter({ matches, title }: { matches: MatchFix[]; title?: string }) {
  const deduped  = deduplicateMatches(matches)
  const live     = deduped.filter(m => m.statusType === 'live')
  const finished = deduped.filter(m => m.statusType === 'finished')
  const upcoming = deduped.filter(m => m.statusType === 'upcoming' || !m.statusType)

  const today = new Date().toLocaleDateString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Algiers' })
  const hasAlgeria = deduped.some(m => isAlgeria(m.homeTeam) || isAlgeria(m.awayTeam))

  return (
    <div style={{
      background: 'linear-gradient(160deg,#060b17 0%,#090e1e 100%)',
      border: hasAlgeria ? '1.5px solid rgba(34,197,94,0.2)' : '1.5px solid rgba(99,102,241,0.2)',
      borderRadius: 20, overflow: 'hidden', margin: '8px 0',
      boxShadow: '0 20px 60px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.03)',
      direction: 'rtl',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        background: hasAlgeria
          ? 'linear-gradient(90deg,rgba(5,150,105,0.2) 0%,rgba(16,185,129,0.06) 60%,transparent)'
          : 'linear-gradient(90deg,rgba(67,56,202,0.2) 0%,rgba(99,102,241,0.06) 60%,transparent)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.5))' }}>🏆</span>
          <div>
            <div style={{ color: '#d1fae5', fontWeight: 900, fontSize: 14 }}>{title || 'كأس العالم FIFA 2026'}</div>
            <div style={{ color: '#6ee7b7', fontSize: 10, fontWeight: 600, marginTop: 2 }}>{today}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {live.length > 0 && <span style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', fontSize: 10, fontWeight: 800, borderRadius: 20, padding: '2px 10px', animation: 'wcPulse 2s infinite' }}>🔴 {live.length} مباشر</span>}
          {finished.length > 0 && <span style={{ background: 'rgba(5,150,105,0.15)', border: '1px solid rgba(16,185,129,0.25)', color: '#6ee7b7', fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 10px' }}>✅ {finished.length} انتهت</span>}
          {upcoming.length > 0 && <span style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 10px' }}>📅 {upcoming.length} قادمة</span>}
        </div>
      </div>

      <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Live section */}
        {live.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px 4px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.8)', animation: 'wcPulse 1.5s infinite' }} />
              <span style={{ color: '#fca5a5', fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>مباشر الآن</span>
            </div>
            {live.map((m, i) => <ScoreCenterRow key={`l${i}`} match={m} />)}
          </>
        )}

        {/* Finished section */}
        {finished.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: live.length ? '10px 4px 4px' : '6px 4px 4px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
              <span style={{ color: '#6ee7b7', fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>نتائج انتهت</span>
            </div>
            {finished.map((m, i) => <ScoreCenterRow key={`f${i}`} match={m} />)}
          </>
        )}

        {/* Upcoming section */}
        {upcoming.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: (live.length + finished.length) > 0 ? '10px 4px 4px' : '6px 4px 4px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} />
              <span style={{ color: '#a5b4fc', fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>مباريات قادمة</span>
            </div>
            {upcoming.map((m, i) => <ScoreCenterRow key={`u${i}`} match={m} />)}
          </>
        )}
      </div>

      {/* Footer links */}
      <div style={{ padding: '8px 16px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 6, justifyContent: 'center' }}>
        <a href="https://jdwel.com/2026-world-cup-fixtures/" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>🗓️ jdwel</a>
        <a href="https://www.fotmob.com/ar/leagues/77/fixtures/world-cup" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>📱 FotMob</a>
        <a href="https://www.fifa.com/worldcup" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>🏆 FIFA</a>
      </div>
    </div>
  )
}

// ─── Schedule Row (Algeria fixtures list) ─────────────────────────────────────
function ScheduleRow({ match, idx }: { match: MatchFix; idx: number }) {
  const opp     = isAlgeria(match.homeTeam) ? match.awayTeam : match.homeTeam
  const isHome  = isAlgeria(match.homeTeam)
  const hasScore= match.homeScore !== null && match.homeScore !== undefined && match.awayScore !== null && match.awayScore !== undefined
  const scoreStr= hasScore ? `${match.homeScore} – ${match.awayScore}` : dzHour(match.startTime)
  const won     = hasScore && ((isHome && match.homeScore! > match.awayScore!) || (!isHome && match.awayScore! > match.homeScore!))
  const lost    = hasScore && ((isHome && match.homeScore! < match.awayScore!) || (!isHome && match.awayScore! < match.homeScore!))
  const draw    = hasScore && match.homeScore === match.awayScore
  const rc      = won ? '#22c55e' : lost ? '#ef4444' : draw ? '#f59e0b' : '#6366f1'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      background: 'rgba(16,185,129,0.06)', borderRadius: 12,
      border: '1px solid rgba(34,197,94,0.15)', direction: 'rtl',
    }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
        {idx + 1}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <MiniFlag name="الجزائر" size={30} />
        <MiniFlag name={opp} size={30} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#d1fae5', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {isHome ? `🇩🇿 الجزائر ضد ${opp}` : `${opp} ضد 🇩🇿 الجزائر`}
        </div>
        <div style={{ color: '#475569', fontSize: 10, marginTop: 2, display: 'flex', gap: 6 }}>
          {match.round && <span style={{ color: '#6366f1' }}>{match.round}</span>}
          <span>{fmtDateShort(match.date)}</span>
          {match.venue && <span>🏟️ {match.venue}</span>}
        </div>
      </div>
      <div style={{ flexShrink: 0, background: 'rgba(6,6,20,0.8)', border: `1.5px solid ${rc}44`, borderRadius: 10, padding: '5px 12px', textAlign: 'center', minWidth: 56, boxShadow: `0 0 10px ${rc}18` }}>
        <div style={{ color: rc, fontWeight: 900, fontSize: 14, lineHeight: 1 }}>{scoreStr}</div>
        {!hasScore && <div style={{ color: '#334155', fontSize: 9, marginTop: 2, fontWeight: 700 }}>توقيت الجزائر</div>}
      </div>
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  color: '#818cf8', fontSize: 11, textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center', gap: 4,
  background: 'rgba(99,102,241,0.08)', padding: '4px 14px',
  borderRadius: 20, border: '1px solid rgba(99,102,241,0.18)', fontWeight: 600,
}

// ─── Main Export ──────────────────────────────────────────────────────────────
interface WC2026MatchCardProps {
  matches: MatchFix[]
  title?: string
  autoRefresh?: boolean
  refreshInterval?: number
  showSchedule?: boolean
  allFixtures?: MatchFix[]
  compact?: boolean
}

export default function WC2026MatchCard({ matches, title, autoRefresh = false, refreshInterval = 30000, showSchedule = false, allFixtures, compact = false }: WC2026MatchCardProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => setTick(t => t + 1), refreshInterval)
    return () => clearInterval(id)
  }, [autoRefresh, refreshInterval])

  if (!matches || matches.length === 0) return null

  const scheduleMatches = allFixtures || (showSchedule ? matches : null)
  // compact=true forces ScoreCenter layout even for single match (for narrow sidebars)
  const isMulti = matches.length > 1 || compact

  return (
    <div style={{ direction: 'rtl', fontFamily: 'inherit', maxWidth: compact ? '100%' : 540 }}>
      <style>{`
        @keyframes wcPulse { 0%,100% { box-shadow:0 0 8px rgba(239,68,68,0.45); } 50% { box-shadow:0 0 20px rgba(239,68,68,0.85); } }
        @keyframes wcGlow  { 0%,100% { opacity:.6; } 50% { opacity:1; } }
      `}</style>

      {/* Title bar — only for single-match mode */}
      {title && !isMulti && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, padding: '12px 18px',
          background: 'linear-gradient(90deg,rgba(16,185,129,0.18) 0%,rgba(16,185,129,0.05) 60%,transparent)',
          borderRight: '3px solid #10b981', borderRadius: '0 14px 14px 0', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(ellipse at 0% 50%,rgba(16,185,129,0.1) 0%,transparent 60%)', pointerEvents: 'none' }} />
          <span style={{ fontSize: 24, filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.6))' }}>🏆</span>
          <div>
            <div style={{ color: '#d1fae5', fontWeight: 900, fontSize: 15, lineHeight: 1.2 }}>{title}</div>
            <div style={{ color: '#6ee7b7', fontSize: 10, fontWeight: 700, marginTop: 3, letterSpacing: 0.5 }}>
              FIFA World Cup 2026 · USA · CAN · MEX · المجموعة J
            </div>
          </div>
          {autoRefresh && matches.some(m => m.statusType === 'live') && (
            <span style={{ marginRight: 'auto', color: '#ef4444', fontSize: 11, fontWeight: 800, animation: 'wcGlow 1.5s infinite' }}>● تحديث مباشر</span>
          )}
        </div>
      )}

      {/* Multi-match → Score Center, Single → Full Card */}
      {isMulti
        ? <ScoreCenter matches={matches} title={title} />
        : <MatchCard match={matches[0]} />
      }

      {/* Algeria schedule below single-match card */}
      {!isMulti && scheduleMatches && scheduleMatches.length > 1 && (
        <div style={{
          marginTop: 8, background: 'linear-gradient(160deg,#060b17 0%,#090e1e 100%)',
          border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}>
          <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10, background: 'linear-gradient(90deg,rgba(99,102,241,0.12) 0%,transparent 80%)' }}>
            <span style={{ fontSize: 18 }}>📅</span>
            <span style={{ color: '#c7d2fe', fontWeight: 900, fontSize: 13 }}>جدول مباريات 🇩🇿 الجزائر — كأس العالم 2026</span>
            <span style={{ marginRight: 'auto', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', color: '#818cf8', borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700 }}>المجموعة J</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px 12px' }}>
            {deduplicateMatches(scheduleMatches).map((m, i) => <ScheduleRow key={i} match={m} idx={i} />)}
          </div>
          <div style={{ padding: '8px 16px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 6, justifyContent: 'center' }}>
            <a href="https://www.kooora.com/?wc2026" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>⚽ كووورة</a>
            <a href="https://jdwel.com/2026-world-cup-fixtures/" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>🗓️ الجدول الكامل</a>
            <a href="https://www.fotmob.com/ar/leagues/77/fixtures/world-cup" target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, fontSize: 10 }}>📱 FotMob</a>
          </div>
        </div>
      )}
    </div>
  )
}
