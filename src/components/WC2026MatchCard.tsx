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
}

const FLAG_CODES: Record<string, string> = {
  'الجزائر': 'dz', 'الأرجنتين': 'ar', 'النمسا': 'at', 'الأردن': 'jo',
  'المكسيك': 'mx', 'جنوب أفريقيا': 'za', 'كوريا الجنوبية': 'kr', 'جمهورية التشيك': 'cz',
  'كندا': 'ca', 'البوسنة والهرسك': 'ba', 'قطر': 'qa', 'سويسرا': 'ch',
  'البرازيل': 'br', 'المغرب': 'ma', 'هايتي': 'ht', 'اسكتلندا': 'gb-sct',
  'الولايات المتحدة': 'us', 'باراغواي': 'py', 'أستراليا': 'au', 'تركيا': 'tr',
  'ألمانيا': 'de', 'كوراساو': 'cw', 'ساحل العاج': 'ci', 'الإكوادور': 'ec',
  'هولندا': 'nl', 'اليابان': 'jp', 'السويد': 'se', 'تونس': 'tn',
  'بلجيكا': 'be', 'مصر': 'eg', 'إيران': 'ir', 'نيوزيلندا': 'nz',
  'إسبانيا': 'es', 'الرأس الأخضر': 'cv', 'السعودية': 'sa', 'أوروغواي': 'uy',
  'فرنسا': 'fr', 'السنغال': 'sn', 'العراق': 'iq', 'النرويج': 'no',
  'البرتغال': 'pt', 'الكونغو الديمقراطية': 'cd', 'أوزبكستان': 'uz', 'كولومبيا': 'co',
  'إنجلترا': 'gb-eng', 'كرواتيا': 'hr', 'غانا': 'gh', 'بنما': 'pa',
}

function getFlag(team: string) {
  const code = FLAG_CODES[team]
  if (!code) return null
  if (code.includes('-')) {
    return `https://flagcdn.com/w80/${code}.png`
  }
  return `https://flagcdn.com/w80/${code}.png`
}

function formatDate(dateStr?: string) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('ar-DZ', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Algiers',
    })
  } catch { return dateStr }
}

function StatusBadge({ status }: { status?: string }) {
  if (status === 'live') return (
    <span style={{ background: '#ef4444', color: '#fff', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
      🔴 مباشر
    </span>
  )
  if (status === 'finished') return (
    <span style={{ background: '#10b981', color: '#fff', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
      ✅ انتهت
    </span>
  )
  if (status === 'result-pending') return (
    <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
      ⏳ انتظار النتيجة
    </span>
  )
  return (
    <span style={{ background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: '1px solid rgba(99,102,241,0.4)' }}>
      📅 مقررة
    </span>
  )
}

function MatchCard({ match }: { match: MatchFix }) {
  const f1 = getFlag(match.homeTeam)
  const f2 = getFlag(match.awayTeam)
  const hasScore = match.homeScore !== null && match.homeScore !== undefined && match.awayScore !== null && match.awayScore !== undefined
  const isLive = match.statusType === 'live'

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      border: '1px solid rgba(99,102,241,0.25)',
      borderRadius: 16,
      padding: '16px 20px',
      margin: '8px 0',
      backdropFilter: 'blur(12px)',
      boxShadow: isLive
        ? '0 0 0 2px rgba(239,68,68,0.5), 0 8px 32px rgba(0,0,0,0.4)'
        : '0 8px 32px rgba(0,0,0,0.35)',
      direction: 'rtl',
      fontFamily: 'inherit',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {isLive && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #ef4444, transparent)',
          animation: 'wc-live-pulse 2s infinite',
        }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <StatusBadge status={match.statusType} />
        {match.round && (
          <span style={{ color: '#94a3b8', fontSize: 11 }}>{match.round}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          {f1 ? (
            <img src={f1} alt={match.homeTeam} width={56} height={42} style={{ borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.4)', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 56, height: 42, borderRadius: 6, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏴</div>
          )}
          <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13, textAlign: 'center', lineHeight: 1.3 }}>{match.homeTeam}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 80 }}>
          {hasScore ? (
            <div style={{
              background: 'rgba(15,23,42,0.8)',
              border: '1px solid rgba(99,102,241,0.4)',
              borderRadius: 10,
              padding: '6px 14px',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}>
              <span style={{ color: '#f8fafc', fontSize: 22, fontWeight: 800 }}>{match.homeScore}</span>
              <span style={{ color: '#475569', fontSize: 16, fontWeight: 400 }}>–</span>
              <span style={{ color: '#f8fafc', fontSize: 22, fontWeight: 800 }}>{match.awayScore}</span>
            </div>
          ) : (
            <div style={{
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 10,
              padding: '6px 14px',
              color: '#a5b4fc',
              fontSize: 15,
              fontWeight: 700,
            }}>
              {match.startTime || 'vs'}
            </div>
          )}
          {match.group && (
            <span style={{ color: '#64748b', fontSize: 11 }}>المجموعة {match.group}</span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          {f2 ? (
            <img src={f2} alt={match.awayTeam} width={56} height={42} style={{ borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.4)', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 56, height: 42, borderRadius: 6, background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🏴</div>
          )}
          <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13, textAlign: 'center', lineHeight: 1.3 }}>{match.awayTeam}</span>
        </div>
      </div>

      {(match.date || match.venue) && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          {match.date && (
            <span style={{ color: '#94a3b8', fontSize: 11 }}>📅 {formatDate(match.date)}</span>
          )}
          {match.venue && (
            <span style={{ color: '#94a3b8', fontSize: 11 }}>🏟️ {match.venue}{match.city ? `, ${match.city}` : ''}</span>
          )}
        </div>
      )}

      {match.kooraLink && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <a href={match.kooraLink} target="_blank" rel="noopener noreferrer"
            style={{ color: '#818cf8', fontSize: 11, textDecoration: 'none' }}>
            🔗 تفاصيل المباراة
          </a>
        </div>
      )}
    </div>
  )
}

interface WC2026MatchCardProps {
  matches: MatchFix[]
  title?: string
  autoRefresh?: boolean
  refreshInterval?: number
}

export default function WC2026MatchCard({ matches, title, autoRefresh = false, refreshInterval = 30000 }: WC2026MatchCardProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!autoRefresh) return
    const hasLive = matches.some(m => m.statusType === 'live')
    if (!hasLive) return
    const id = setInterval(() => setTick(t => t + 1), refreshInterval)
    return () => clearInterval(id)
  }, [matches, autoRefresh, refreshInterval])

  if (!matches || matches.length === 0) return null

  const grouped: Record<string, MatchFix[]> = {}
  for (const m of matches) {
    const g = m.group || 'other'
    if (!grouped[g]) grouped[g] = []
    grouped[g].push(m)
  }

  return (
    <div style={{ direction: 'rtl' }}>
      <style>{`
        @keyframes wc-live-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
      {title && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 12, padding: '8px 12px',
          background: 'linear-gradient(90deg, rgba(99,102,241,0.15), transparent)',
          borderRight: '3px solid #818cf8', borderRadius: '0 8px 8px 0',
        }}>
          <span style={{ fontSize: 18 }}>🏆</span>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 15 }}>{title}</span>
          {autoRefresh && matches.some(m => m.statusType === 'live') && (
            <span style={{ marginRight: 'auto', color: '#ef4444', fontSize: 11, animation: 'wc-live-pulse 2s infinite' }}>● تحديث تلقائي</span>
          )}
        </div>
      )}
      {Object.keys(grouped).length > 1
        ? Object.entries(grouped).sort().map(([grp, list]) => (
            <div key={grp}>
              {grp !== 'other' && (
                <div style={{ color: '#64748b', fontSize: 12, marginBottom: 6, marginTop: 10 }}>المجموعة {grp}</div>
              )}
              {list.map((m, i) => <MatchCard key={i} match={m} />)}
            </div>
          ))
        : matches.map((m, i) => <MatchCard key={i} match={m} />)
      }
    </div>
  )
}
