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
  'صربيا': 'rs', 'النمسا': 'at', 'الجبل الأسود': 'me',
  'نيجيريا': 'ng', 'الكاميرون': 'cm', 'مالي': 'ml', 'بوركينا فاسو': 'bf',
  'غينيا': 'gn', 'موزمبيق': 'mz', 'زامبيا': 'zm', 'أنغولا': 'ao',
  'تنزانيا': 'tz', 'أوغندا': 'ug', 'ليبيا': 'ly', 'تشاد': 'td',
}

function getFlag(team: string) {
  const code = FLAG_CODES[team]
  if (!code) return null
  return `https://flagcdn.com/w160/${code}.png`
}

const STATUS_CONFIG = {
  live:           { bg: 'linear-gradient(135deg,#dc2626,#ef4444)', label: '🔴 مباشر', glow: 'rgba(239,68,68,0.6)' },
  finished:       { bg: 'linear-gradient(135deg,#059669,#10b981)', label: '✅ انتهت', glow: '' },
  'result-pending': { bg: 'linear-gradient(135deg,#d97706,#f59e0b)', label: '⏳ قريباً', glow: '' },
  upcoming:       { bg: 'linear-gradient(135deg,#4f46e5,#6366f1)', label: '📅 مقررة', glow: '' },
}

function StatusPill({ status }: { status?: string }) {
  const cfg = STATUS_CONFIG[(status as keyof typeof STATUS_CONFIG) ?? 'upcoming'] ?? STATUS_CONFIG.upcoming
  return (
    <span style={{
      background: cfg.bg,
      color: '#fff',
      padding: '3px 12px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 0.5,
      boxShadow: cfg.glow ? `0 0 12px ${cfg.glow}` : 'none',
      animation: status === 'live' ? 'dzPulse 2s infinite' : 'none',
    }}>
      {cfg.label}
    </span>
  )
}

function TeamBlock({ name, isHome, flag }: { name: string; isHome: boolean; flag: string | null }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minWidth: 0,
    }}>
      {flag ? (
        <div style={{
          width: 104,
          height: 78,
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          border: '2px solid rgba(255,255,255,0.12)',
          flexShrink: 0,
        }}>
          <img
            src={flag}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>
      ) : (
        <div style={{
          width: 104, height: 78, borderRadius: 10,
          background: 'rgba(255,255,255,0.06)',
          border: '2px dashed rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36,
        }}>🏴</div>
      )}
      <span style={{
        color: '#f8fafc',
        fontWeight: 800,
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 1.3,
        wordBreak: 'break-word',
        maxWidth: 110,
      }}>{name}</span>
    </div>
  )
}

function ScoreOrTime({ match }: { match: MatchFix }) {
  const hasScore = match.homeScore !== null && match.homeScore !== undefined
    && match.awayScore !== null && match.awayScore !== undefined
  const isLive = match.statusType === 'live'

  if (hasScore) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 100 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: isLive ? 'rgba(239,68,68,0.12)' : 'rgba(15,23,42,0.7)',
          border: isLive ? '2px solid rgba(239,68,68,0.5)' : '2px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          padding: '10px 18px',
          boxShadow: isLive ? '0 0 24px rgba(239,68,68,0.2)' : '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <span style={{ color: '#f8fafc', fontSize: 40, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' as const }}>
            {match.homeScore}
          </span>
          <span style={{ color: '#475569', fontSize: 24, fontWeight: 300, padding: '0 2px' }}>—</span>
          <span style={{ color: '#f8fafc', fontSize: 40, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums' as const }}>
            {match.awayScore}
          </span>
        </div>
        {match.group && (
          <span style={{ color: '#64748b', fontSize: 11, fontWeight: 600 }}>المجموعة {match.group}</span>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 100 }}>
      <div style={{
        background: 'rgba(99,102,241,0.1)',
        border: '2px solid rgba(99,102,241,0.35)',
        borderRadius: 14,
        padding: '10px 14px',
        textAlign: 'center',
      }}>
        {match.startTime ? (
          <>
            <div style={{ color: '#a5b4fc', fontSize: 30, fontWeight: 900, lineHeight: 1 }}>
              {dzHour(match.startTime)}
            </div>
            <div style={{ color: '#475569', fontSize: 10, fontWeight: 500, marginTop: 3 }}>توقيت الجزائر</div>
          </>
        ) : (
          <div style={{ color: '#64748b', fontSize: 18, fontWeight: 700 }}>vs</div>
        )}
      </div>
      {match.group && (
        <span style={{ color: '#64748b', fontSize: 11, fontWeight: 600 }}>المجموعة {match.group}</span>
      )}
    </div>
  )
}

function GoalsList({ goals, yellowCards, redCards }: Pick<MatchFix, 'goals' | 'yellowCards' | 'redCards'>) {
  const hasGoals = goals && goals.length > 0
  const hasCards = (yellowCards && yellowCards.length > 0) || (redCards && redCards.length > 0)
  if (!hasGoals && !hasCards) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 8 }}>
      {(goals || []).map((g, i) => (
        <span key={i} style={{
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: 8, padding: '2px 9px', fontSize: 11, color: '#6ee7b7',
        }}>
          ⚽ {g.player}{g.minute ? ` ${g.minute}'` : ''}{g.assist ? ` ↗️ ${g.assist}` : ''}
        </span>
      ))}
      {(yellowCards || []).map((c, i) => (
        <span key={`y${i}`} style={{
          background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)',
          borderRadius: 8, padding: '2px 9px', fontSize: 11, color: '#fde047',
        }}>
          🟨 {c.player}{c.minute ? ` ${c.minute}'` : ''}
        </span>
      ))}
      {(redCards || []).map((c, i) => (
        <span key={`r${i}`} style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, padding: '2px 9px', fontSize: 11, color: '#fca5a5',
        }}>
          🟥 {c.player}{c.minute ? ` ${c.minute}'` : ''}
        </span>
      ))}
    </div>
  )
}

function MatchCard({ match }: { match: MatchFix }) {
  const f1 = getFlag(match.homeTeam)
  const f2 = getFlag(match.awayTeam)
  const isLive = match.statusType === 'live'
  const src = match.source || (match._sources && match._sources[0]) || ''

  return (
    <div style={{
      background: 'linear-gradient(160deg, #0c1220 0%, #111827 50%, #0c1a2e 100%)',
      border: isLive ? '1.5px solid rgba(239,68,68,0.45)' : '1.5px solid rgba(255,255,255,0.08)',
      borderRadius: 20,
      padding: '18px 20px 14px',
      margin: '10px 0',
      boxShadow: isLive
        ? '0 0 0 1px rgba(239,68,68,0.2), 0 12px 40px rgba(0,0,0,0.55)'
        : '0 12px 40px rgba(0,0,0,0.45)',
      direction: 'rtl',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {isLive && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, transparent 0%, #ef4444 40%, #f97316 60%, transparent 100%)',
          animation: 'dzLiveLine 2.5s ease-in-out infinite',
        }} />
      )}

      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03,
        backgroundImage: 'url("https://upload.wikimedia.org/wikipedia/en/thumb/4/45/FIFA_World_Cup_2026_logo.svg/200px-FIFA_World_Cup_2026_logo.svg.png")',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: '60%',
        pointerEvents: 'none',
      }} />

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
      }}>
        <StatusPill status={match.statusType} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          {match.round && (
            <span style={{ color: '#475569', fontSize: 11, fontWeight: 600 }}>{match.round}</span>
          )}
        </div>
        {src && (
          <span style={{
            color: '#10b981', fontSize: 10, fontWeight: 700,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: 20, padding: '1px 8px',
          }}>
            📡 {src}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <TeamBlock name={match.homeTeam} isHome={true} flag={f1} />
        <ScoreOrTime match={match} />
        <TeamBlock name={match.awayTeam} isHome={false} flag={f2} />
      </div>

      <GoalsList goals={match.goals} yellowCards={match.yellowCards} redCards={match.redCards} />

      {(match.date || match.venue || match.city) && (
        <div style={{
          marginTop: 14, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center',
        }}>
          {match.date && (
            <span style={{ color: '#64748b', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#4f46e5' }}>📅</span> {fmtDate(match.date)}
            </span>
          )}
          {(match.venue || match.city) && (
            <span style={{ color: '#64748b', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#0891b2' }}>🏟️</span>
              {match.venue}{match.city ? `, ${match.city}` : ''}
              {match.country && match.country !== match.city ? ` — ${match.country}` : ''}
            </span>
          )}
        </div>
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        {match.kooraLink && (
          <a href={match.kooraLink} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            ⚽ كووورة
          </a>
        )}
        <a href="https://www.fotmob.com/ar/leagues/77/fixtures/world-cup" target="_blank" rel="noopener noreferrer" style={linkStyle}>
          📱 FotMob
        </a>
        <a href="https://www.fifa.com/worldcup" target="_blank" rel="noopener noreferrer" style={linkStyle}>
          🏆 FIFA
        </a>
      </div>
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  color: '#818cf8',
  fontSize: 11,
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'rgba(99,102,241,0.08)',
  padding: '3px 12px',
  borderRadius: 20,
  border: '1px solid rgba(99,102,241,0.18)',
  fontWeight: 600,
}

interface WC2026MatchCardProps {
  matches: MatchFix[]
  title?: string
  autoRefresh?: boolean
  refreshInterval?: number
}

export default function WC2026MatchCard({ matches, title, autoRefresh = false, refreshInterval = 30000 }: WC2026MatchCardProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!autoRefresh) return
    const hasLive = matches.some(m => m.statusType === 'live')
    if (!hasLive) return
    const id = setInterval(() => setTick(t => t + 1), refreshInterval)
    return () => clearInterval(id)
  }, [matches, autoRefresh, refreshInterval])

  if (!matches || matches.length === 0) return null

  const byDate: Record<string, MatchFix[]> = {}
  for (const m of matches) {
    const key = m.date || 'unknown'
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(m)
  }
  const multiDay = Object.keys(byDate).filter(k => k !== 'unknown').length > 1

  return (
    <div style={{ direction: 'rtl', fontFamily: 'inherit' }}>
      <style>{`
        @keyframes dzPulse {
          0%,100% { box-shadow: 0 0 12px rgba(239,68,68,0.6); }
          50% { box-shadow: 0 0 24px rgba(239,68,68,0.9); }
        }
        @keyframes dzLiveLine {
          0% { opacity:0.5; transform:scaleX(0.4) translateX(-60%); }
          50% { opacity:1; transform:scaleX(1) translateX(0%); }
          100% { opacity:0.5; transform:scaleX(0.4) translateX(60%); }
        }
      `}</style>

      {title && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 10, padding: '10px 16px',
          background: 'linear-gradient(90deg, rgba(99,102,241,0.18) 0%, rgba(99,102,241,0.04) 100%)',
          borderRight: '3px solid #6366f1',
          borderRadius: '0 12px 12px 0',
        }}>
          <span style={{ fontSize: 20 }}>🏆</span>
          <span style={{ color: '#e2e8f0', fontWeight: 800, fontSize: 15 }}>{title}</span>
          {autoRefresh && matches.some(m => m.statusType === 'live') && (
            <span style={{ marginRight: 'auto', color: '#ef4444', fontSize: 11, fontWeight: 700, animation: 'dzPulse 2s infinite' }}>
              ● تحديث تلقائي
            </span>
          )}
        </div>
      )}

      {multiDay
        ? Object.entries(byDate).sort().map(([date, list]) => (
            <div key={date}>
              {date !== 'unknown' && (
                <div style={{
                  color: '#6366f1', fontSize: 12, fontWeight: 700,
                  margin: '14px 0 6px', paddingRight: 4,
                  borderRight: '2px solid #4f46e5', paddingTop: 2, paddingBottom: 2,
                }}>
                  📅 {fmtDate(date)}
                </div>
              )}
              {list.map((m, i) => <MatchCard key={i} match={m} />)}
            </div>
          ))
        : matches.map((m, i) => <MatchCard key={i} match={m} />)
      }
    </div>
  )
}
