import { useState, useEffect } from 'react'
import { Newspaper, Trophy, Cloud, Wind, Droplets, ExternalLink, RefreshCw, MapPin, Thermometer } from 'lucide-react'
import '../styles/dz-dashboard.css'

interface NewsItem {
  title: string
  link: string
  description: string
  pubDate: string
  source: string
  feedName: string
}

interface WeatherItem {
  city: string
  temp: number | null
  condition: string | null
  icon: string | null
  humidity?: number
  wind?: number
  error?: string
}

interface PrayerData {
  city: string
  date: string
  source: string
  times: Record<string, string>
}

interface DashboardData {
  news: NewsItem[]
  sports: NewsItem[]
  weather: WeatherItem[]
  fetchedAt: string
}

const PRAYER_ICONS: Record<string, string> = {
  'الفجر': '🌄', 'الشروق': '🌅', 'الظهر': '☀️', 'العصر': '🌤️', 'المغرب': '🌇', 'العشاء': '🌙',
}

const PRAYER_COLORS: Record<string, string> = {
  'الفجر': '#818cf8', 'الشروق': '#fb923c', 'الظهر': '#facc15', 'العصر': '#34d399', 'المغرب': '#f472b6', 'العشاء': '#a78bfa',
}

const CITIES: { en: string; ar: string }[] = [
  { en: 'Algiers', ar: 'الجزائر' },
  { en: 'Oran', ar: 'وهران' },
  { en: 'Constantine', ar: 'قسنطينة' },
  { en: 'Annaba', ar: 'عنابة' },
  { en: 'Bejaia', ar: 'بجاية' },
  { en: 'Setif', ar: 'سطيف' },
  { en: 'Tlemcen', ar: 'تلمسان' },
]

const WEATHER_CITIES: Record<string, string> = {
  Algiers: 'الجزائر العاصمة', Oran: 'وهران', Constantine: 'قسنطينة', Annaba: 'عنابة',
}

function getWeatherBg(icon: string | null) {
  if (!icon) return 'from-slate-800 to-slate-900'
  if (icon.startsWith('01')) return 'weather-sunny'
  if (icon.startsWith('02') || icon.startsWith('03') || icon.startsWith('04')) return 'weather-cloudy'
  if (icon.startsWith('09') || icon.startsWith('10')) return 'weather-rainy'
  if (icon.startsWith('13')) return 'weather-snowy'
  return 'weather-default'
}

function formatPubDate(dateStr: string) {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000)
    if (diff < 1) return 'الآن'
    if (diff < 60) return `منذ ${diff} د`
    if (diff < 1440) return `منذ ${Math.floor(diff / 60)} س`
    return `منذ ${Math.floor(diff / 1440)} ي`
  } catch { return '' }
}

export default function DZDashboard({ onSend }: { onSend: (q: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [prayerData, setPrayerData] = useState<PrayerData | null>(null)
  const [prayerLoading, setPrayerLoading] = useState(true)
  const [prayerCity, setPrayerCity] = useState('Algiers')
  const [activeSection, setActiveSection] = useState<'prayer' | 'weather' | 'news' | 'sports'>('prayer')

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/dz-agent/dashboard')
      if (r.ok) setData(await r.json())
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  const loadPrayer = async (city = 'Algiers') => {
    setPrayerLoading(true)
    setPrayerCity(city)
    try {
      const r = await fetch(`/api/dz-agent/prayer?city=${encodeURIComponent(city)}`)
      if (r.ok) setPrayerData(await r.json())
      else setPrayerData(null)
    } catch { setPrayerData(null) }
    finally { setPrayerLoading(false) }
  }

  useEffect(() => {
    loadDashboard()
    loadPrayer('Algiers')
  }, [])

  const tabs = [
    { key: 'prayer' as const, label: 'مواقيت الصلاة', icon: '🕌' },
    { key: 'weather' as const, label: 'الطقس', icon: '🌤️' },
    { key: 'news' as const, label: 'الأخبار', icon: '📰' },
    { key: 'sports' as const, label: 'الرياضة', icon: '⚽' },
  ]

  return (
    <div className="dzd-root" dir="rtl">
      {/* Top bar */}
      <div className="dzd-topbar">
        <div className="dzd-topbar-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`dzd-tab ${activeSection === tab.key ? 'dzd-tab--active' : ''}`}
              onClick={() => setActiveSection(tab.key)}
            >
              <span className="dzd-tab-icon">{tab.icon}</span>
              <span className="dzd-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
        <button
          className="dzd-refresh-btn"
          onClick={() => { loadDashboard(); loadPrayer(prayerCity) }}
          title="تحديث"
        >
          <RefreshCw size={13} className={(loading || prayerLoading) ? 'dzd-spin' : ''} />
        </button>
      </div>

      {/* Panel content */}
      <div className="dzd-panel">

        {/* ===== PRAYER ===== */}
        {activeSection === 'prayer' && (
          <div className="dzd-prayer-panel">
            {prayerLoading ? (
              <div className="dzd-skeleton-grid">
                {[...Array(6)].map((_, i) => <div key={i} className="dzd-skeleton" />)}
              </div>
            ) : prayerData ? (
              <>
                <div className="dzd-prayer-header">
                  <span className="dzd-prayer-date">
                    <MapPin size={11} /> {CITIES.find(c => c.en === prayerCity)?.ar || prayerCity} — {prayerData.date}
                  </span>
                </div>
                <div className="dzd-prayer-grid">
                  {Object.entries(prayerData.times).map(([name, time]) => (
                    <div
                      key={name}
                      className="dzd-prayer-card"
                      style={{ '--p-color': PRAYER_COLORS[name] || '#a78bfa' } as React.CSSProperties}
                    >
                      <span className="dzd-prayer-card-icon">{PRAYER_ICONS[name] || '🕐'}</span>
                      <span className="dzd-prayer-card-name">{name}</span>
                      <span className="dzd-prayer-card-time">{time}</span>
                    </div>
                  ))}
                </div>
                <div className="dzd-city-row">
                  {CITIES.map(c => (
                    <button
                      key={c.en}
                      className={`dzd-city-btn ${prayerCity === c.en ? 'dzd-city-btn--active' : ''}`}
                      onClick={() => loadPrayer(c.en)}
                    >
                      {c.ar}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="dzd-error-state">
                <span>⚠️ تعذّر تحميل مواقيت الصلاة</span>
                <button className="dzd-retry-btn" onClick={() => loadPrayer(prayerCity)}>إعادة المحاولة</button>
              </div>
            )}
          </div>
        )}

        {/* ===== WEATHER ===== */}
        {activeSection === 'weather' && (
          <div className="dzd-weather-panel">
            {loading ? (
              <div className="dzd-skeleton-grid">
                {[...Array(4)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--tall" />)}
              </div>
            ) : (
              <div className="dzd-weather-grid">
                {(data?.weather || []).map((item, i) => (
                  <div key={i} className={`dzd-weather-card ${getWeatherBg(item.icon)}`}>
                    <div className="dzd-wc-city">
                      <MapPin size={10} />
                      {WEATHER_CITIES[item.city] || item.city}
                    </div>
                    {item.temp !== null ? (
                      <>
                        <div className="dzd-wc-main">
                          {item.icon && (
                            <img
                              src={`https://openweathermap.org/img/wn/${item.icon}@2x.png`}
                              alt=""
                              className="dzd-wc-icon"
                            />
                          )}
                          <span className="dzd-wc-temp">{item.temp}°</span>
                        </div>
                        <div className="dzd-wc-cond">{item.condition}</div>
                        <div className="dzd-wc-meta">
                          {item.humidity !== undefined && (
                            <span><Droplets size={10} /> {item.humidity}%</span>
                          )}
                          {item.wind !== undefined && (
                            <span><Wind size={10} /> {item.wind} km/h</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="dzd-wc-nokey">
                        <Thermometer size={18} />
                        <span>أضف OPENWEATHER_API_KEY</span>
                      </div>
                    )}
                  </div>
                ))}
                {(data?.weather || []).length === 0 && !loading && (
                  <div className="dzd-empty-state">لا تتوفر بيانات الطقس</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== NEWS ===== */}
        {activeSection === 'news' && (
          <div className="dzd-news-panel">
            {loading ? (
              <div className="dzd-news-list">
                {[...Array(5)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--news" />)}
              </div>
            ) : (data?.news?.length === 0) ? (
              <div className="dzd-empty-state">لا توجد أخبار متاحة</div>
            ) : (
              <div className="dzd-news-list">
                {(data?.news || []).map((item, i) => (
                  <div
                    key={i}
                    className="dzd-news-card"
                    onClick={() => onSend(`اخبار: ${item.title}`)}
                  >
                    <div className="dzd-news-card-left">
                      <span className="dzd-news-source">
                        <Newspaper size={9} /> {item.feedName}
                      </span>
                      <span className="dzd-news-time">{formatPubDate(item.pubDate)}</span>
                    </div>
                    <div className="dzd-news-card-body">
                      <p className="dzd-news-title">{item.title}</p>
                    </div>
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dzd-news-link"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== SPORTS ===== */}
        {activeSection === 'sports' && (
          <div className="dzd-news-panel">
            {loading ? (
              <div className="dzd-news-list">
                {[...Array(5)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--news" />)}
              </div>
            ) : (data?.sports?.length === 0) ? (
              <div className="dzd-empty-state">لا توجد أخبار رياضية</div>
            ) : (
              <div className="dzd-news-list">
                {(data?.sports || []).map((item, i) => (
                  <div
                    key={i}
                    className="dzd-news-card dzd-news-card--sport"
                    onClick={() => onSend(`رياضة: ${item.title}`)}
                  >
                    <div className="dzd-news-card-left">
                      <span className="dzd-news-source dzd-news-source--sport">
                        <Trophy size={9} /> {item.feedName}
                      </span>
                      <span className="dzd-news-time">{formatPubDate(item.pubDate)}</span>
                    </div>
                    <div className="dzd-news-card-body">
                      <p className="dzd-news-title">{item.title}</p>
                    </div>
                    {item.link && (
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dzd-news-link"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
