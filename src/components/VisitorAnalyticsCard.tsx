import { useEffect, useState, useCallback } from 'react'

interface WilayaStat { name: string; count: number }
interface CountryStat { code: string; count: number }
interface ComparisonStat { pct: number; direction: 'up' | 'down' }

interface VisitorAnalyticsData {
  period: string
  totalVisits: number
  uniqueVisitors: number
  newVisitors: number
  returningVisitors: number
  activeVisitors: number
  wilayas: WilayaStat[]
  countries: CountryStat[]
  comparison: ComparisonStat | null
}

const PERIOD_LABELS: Record<string, string> = {
  today: 'اليوم',
  yesterday: 'أمس',
  week: 'هذا الأسبوع',
  last7days: 'آخر 7 أيام',
  month: 'هذا الشهر',
  last30days: 'آخر 30 يوم',
  last90days: 'آخر 90 يوم',
}

const COUNTRY_NAMES: Record<string, string> = {
  DZ: '🇩🇿 الجزائر', FR: '🇫🇷 فرنسا', CA: '🇨🇦 كندا', DE: '🇩🇪 ألمانيا',
  US: '🇺🇸 الولايات المتحدة', GB: '🇬🇧 بريطانيا', MA: '🇲🇦 المغرب',
  TN: '🇹🇳 تونس', TR: '🇹🇷 تركيا', SA: '🇸🇦 السعودية', AE: '🇦🇪 الإمارات',
  QA: '🇶🇦 قطر', EG: '🇪🇬 مصر', LY: '🇱🇾 ليبيا', MR: '🇲🇷 موريتانيا',
  BE: '🇧🇪 بلجيكا', NL: '🇳🇱 هولندا', CH: '🇨🇭 سويسرا', ES: '🇪🇸 إسبانيا',
  IT: '🇮🇹 إيطاليا', PT: '🇵🇹 البرتغال', SE: '🇸🇪 السويد', NO: '🇳🇴 النرويج',
}

const PERIODS = ['today', 'yesterday', 'week', 'last7days', 'month', 'last30days', 'last90days']

export default function VisitorAnalyticsCard({ initialPeriod = 'today' }: { initialPeriod?: string }) {
  const [period, setPeriod] = useState(initialPeriod)
  const [data, setData] = useState<VisitorAnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (p: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/analytics/visitors?period=${p}`)
      if (!res.ok) throw new Error('فشل جلب البيانات')
      const json = await res.json() as VisitorAnalyticsData
      setData(json)
    } catch (e) {
      setError('تعذّر تحميل إحصائيات الزوار')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData(period) }, [period, fetchData])

  const maxWilaya = data?.wilayas?.[0]?.count || 1
  const maxCountry = data?.countries?.[0]?.count || 1

  return (
    <div className="va-card" dir="rtl">
      {/* Header */}
      <div className="va-header">
        <div className="va-header__title">
          <span className="va-header__icon">👥</span>
          <div>
            <div className="va-header__main">إحصائيات الزوار</div>
            <div className="va-header__sub">DZ AGENT — بيانات حقيقية</div>
          </div>
        </div>
        {data?.activeVisitors !== undefined && (
          <div className="va-active">
            <span className="va-active__dot" />
            <span>{data.activeVisitors} متصل الآن</span>
          </div>
        )}
      </div>

      {/* Period selector */}
      <div className="va-periods">
        {PERIODS.map(p => (
          <button
            key={p}
            className={`va-period-btn${period === p ? ' va-period-btn--active' : ''}`}
            onClick={() => setPeriod(p)}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {loading && (
        <div className="va-loading">
          <div className="va-loading__spinner" />
          <span>جاري تحميل البيانات...</span>
        </div>
      )}

      {error && (
        <div className="va-error">⚠️ {error}</div>
      )}

      {!loading && !error && data && (
        <>
          {/* Main stats grid */}
          <div className="va-stats-grid">
            <div className="va-stat va-stat--primary">
              <div className="va-stat__value">{data.totalVisits.toLocaleString('ar-DZ')}</div>
              <div className="va-stat__label">إجمالي الزيارات</div>
            </div>
            <div className="va-stat">
              <div className="va-stat__value">{data.uniqueVisitors.toLocaleString('ar-DZ')}</div>
              <div className="va-stat__label">الزوار الفريدون</div>
            </div>
            <div className="va-stat va-stat--new">
              <div className="va-stat__value">{data.newVisitors.toLocaleString('ar-DZ')}</div>
              <div className="va-stat__label">🆕 جدد</div>
            </div>
            <div className="va-stat va-stat--returning">
              <div className="va-stat__value">{data.returningVisitors.toLocaleString('ar-DZ')}</div>
              <div className="va-stat__label">🔄 عائدون</div>
            </div>
          </div>

          {/* Comparison */}
          {data.comparison && (
            <div className={`va-comparison va-comparison--${data.comparison.direction}`}>
              <span className="va-comparison__icon">
                {data.comparison.direction === 'up' ? '📈' : '📉'}
              </span>
              <span>
                {data.comparison.direction === 'up' ? '+' : ''}{data.comparison.pct}%
                مقارنة بالفترة السابقة
              </span>
            </div>
          )}

          {/* Algerian Wilayas */}
          {data.wilayas.length > 0 && (
            <div className="va-section">
              <div className="va-section__title">🇩🇿 الولايات الجزائرية</div>
              <div className="va-bars">
                {data.wilayas.slice(0, 8).map((w, i) => (
                  <div key={i} className="va-bar-row">
                    <div className="va-bar-row__label">{w.name}</div>
                    <div className="va-bar-row__track">
                      <div
                        className="va-bar-row__fill"
                        style={{ width: `${Math.round((w.count / maxWilaya) * 100)}%` }}
                      />
                    </div>
                    <div className="va-bar-row__count">{w.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Foreign countries */}
          {data.countries.filter(c => c.code !== 'DZ').length > 0 && (
            <div className="va-section">
              <div className="va-section__title">🌍 الدول الأخرى</div>
              <div className="va-countries">
                {data.countries.filter(c => c.code !== 'DZ').slice(0, 8).map((c, i) => (
                  <div key={i} className="va-country-row">
                    <div className="va-country-row__track">
                      <div
                        className="va-country-row__fill"
                        style={{ width: `${Math.round((c.count / maxCountry) * 100)}%` }}
                      />
                    </div>
                    <div className="va-country-row__name">{COUNTRY_NAMES[c.code] || `🌐 ${c.code}`}</div>
                    <div className="va-country-row__count">{c.count}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="va-footer">
            <span>🔒 البيانات مجمّعة — لا تُخزّن عناوين IP</span>
          </div>
        </>
      )}

      {!loading && !error && data && data.totalVisits === 0 && (
        <div className="va-empty">
          <div className="va-empty__icon">📊</div>
          <div>لا توجد بيانات زوار لهذه الفترة بعد</div>
          <div className="va-empty__sub">سيبدأ التتبع مع أول زيارة للموقع</div>
        </div>
      )}

      <style>{`
        .va-card {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          border: 1px solid rgba(99,102,241,0.3);
          border-radius: 16px;
          padding: 20px;
          font-family: 'Segoe UI', Tahoma, sans-serif;
          color: #e2e8f0;
          width: 100%;
          max-width: 560px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .va-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .va-header__title { display: flex; align-items: center; gap: 12px; }
        .va-header__icon { font-size: 28px; }
        .va-header__main { font-size: 1.1rem; font-weight: 700; color: #f8fafc; }
        .va-header__sub { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
        .va-active {
          display: flex; align-items: center; gap: 6px;
          background: rgba(34,197,94,0.15);
          border: 1px solid rgba(34,197,94,0.3);
          border-radius: 20px;
          padding: 4px 10px;
          font-size: 0.78rem;
          color: #4ade80;
        }
        .va-active__dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #4ade80;
          animation: va-pulse 1.5s infinite;
        }
        @keyframes va-pulse {
          0%,100% { opacity:1; } 50% { opacity:0.4; }
        }
        .va-periods {
          display: flex; flex-wrap: wrap; gap: 6px;
          margin-bottom: 16px;
        }
        .va-period-btn {
          padding: 5px 12px;
          border-radius: 20px;
          border: 1px solid rgba(99,102,241,0.3);
          background: rgba(99,102,241,0.1);
          color: #94a3b8;
          font-size: 0.76rem;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .va-period-btn:hover { background: rgba(99,102,241,0.2); color: #e2e8f0; }
        .va-period-btn--active {
          background: rgba(99,102,241,0.5);
          border-color: #6366f1;
          color: #f8fafc;
          font-weight: 600;
        }
        .va-loading {
          display: flex; align-items: center; gap: 10px;
          color: #94a3b8; padding: 20px 0; justify-content: center;
        }
        .va-loading__spinner {
          width: 20px; height: 20px;
          border: 2px solid rgba(99,102,241,0.3);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: va-spin 0.8s linear infinite;
        }
        @keyframes va-spin { to { transform: rotate(360deg); } }
        .va-error {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px;
          padding: 10px 14px;
          color: #fca5a5;
          font-size: 0.85rem;
          margin: 8px 0;
        }
        .va-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-bottom: 14px;
        }
        .va-stat {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          padding: 12px 14px;
          text-align: center;
        }
        .va-stat--primary {
          background: rgba(99,102,241,0.15);
          border-color: rgba(99,102,241,0.3);
        }
        .va-stat--new {
          background: rgba(34,197,94,0.1);
          border-color: rgba(34,197,94,0.2);
        }
        .va-stat--returning {
          background: rgba(245,158,11,0.1);
          border-color: rgba(245,158,11,0.2);
        }
        .va-stat__value {
          font-size: 1.6rem;
          font-weight: 800;
          color: #f8fafc;
          line-height: 1;
          margin-bottom: 4px;
          font-variant-numeric: tabular-nums;
        }
        .va-stat__label {
          font-size: 0.72rem;
          color: #94a3b8;
          font-weight: 500;
        }
        .va-comparison {
          display: flex; align-items: center; gap: 8px;
          border-radius: 8px; padding: 8px 12px;
          font-size: 0.82rem; font-weight: 600;
          margin-bottom: 14px;
        }
        .va-comparison--up {
          background: rgba(34,197,94,0.12);
          border: 1px solid rgba(34,197,94,0.25);
          color: #4ade80;
        }
        .va-comparison--down {
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.25);
          color: #f87171;
        }
        .va-comparison__icon { font-size: 1rem; }
        .va-section { margin-bottom: 14px; }
        .va-section__title {
          font-size: 0.8rem; font-weight: 700;
          color: #94a3b8; text-transform: uppercase;
          letter-spacing: 0.05em; margin-bottom: 10px;
        }
        .va-bars, .va-countries { display: flex; flex-direction: column; gap: 7px; }
        .va-bar-row, .va-country-row {
          display: flex; align-items: center; gap: 8px;
        }
        .va-bar-row__label {
          min-width: 80px; font-size: 0.82rem; color: #cbd5e1;
          text-align: right;
        }
        .va-bar-row__track, .va-country-row__track {
          flex: 1; height: 8px;
          background: rgba(255,255,255,0.08);
          border-radius: 4px; overflow: hidden;
        }
        .va-bar-row__fill {
          height: 100%;
          background: linear-gradient(90deg, #6366f1, #818cf8);
          border-radius: 4px;
          transition: width 0.6s ease;
          min-width: 4px;
        }
        .va-country-row__fill {
          height: 100%;
          background: linear-gradient(90deg, #0ea5e9, #38bdf8);
          border-radius: 4px;
          transition: width 0.6s ease;
          min-width: 4px;
        }
        .va-bar-row__count, .va-country-row__count {
          min-width: 32px; text-align: left;
          font-size: 0.78rem; color: #64748b;
          font-variant-numeric: tabular-nums;
        }
        .va-country-row__name {
          min-width: 110px; font-size: 0.82rem; color: #cbd5e1;
          text-align: right;
        }
        .va-empty {
          text-align: center; padding: 24px 0;
          color: #64748b;
        }
        .va-empty__icon { font-size: 2.5rem; margin-bottom: 8px; }
        .va-empty__sub { font-size: 0.78rem; margin-top: 4px; color: #475569; }
        .va-footer {
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.06);
          font-size: 0.72rem; color: #475569;
          text-align: center;
        }
        @media (max-width: 480px) {
          .va-card { padding: 14px; }
          .va-stats-grid { grid-template-columns: repeat(2, 1fr); }
          .va-stat__value { font-size: 1.3rem; }
          .va-bar-row__label { min-width: 60px; font-size: 0.75rem; }
          .va-country-row__name { min-width: 80px; font-size: 0.75rem; }
        }
      `}</style>
    </div>
  )
}
