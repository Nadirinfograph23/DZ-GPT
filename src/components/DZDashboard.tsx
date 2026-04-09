import { useState, useEffect, useRef } from 'react'
import { Newspaper, Trophy, Cloud, Wind, Droplets, ExternalLink, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import '../styles/dz-dashboard.css'

interface NewsItem {
  title: string
  link: string
  description: string
  pubDate: string
  source: string
  feedName: string
}

interface SportItem {
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
  sports: SportItem[]
  weather: WeatherItem[]
  fetchedAt: string
}

const PRAYER_ICONS: Record<string, string> = {
  'الفجر': '🌄', 'الشروق': '🌅', 'الظهر': '☀️', 'العصر': '🌤', 'المغرب': '🌇', 'العشاء': '🌙'
}

const CITY_AR: Record<string, string> = {
  Algiers: 'الجزائر', Oran: 'وهران', Constantine: 'قسنطينة',
  Annaba: 'عنابة', Bejaia: 'بجاية', Setif: 'سطيف', Tlemcen: 'تلمسان',
}

export default function DZDashboard({ onSend }: { onSend: (q: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [prayerData, setPrayerData] = useState<PrayerData | null>(null)
  const [prayerLoading, setPrayerLoading] = useState(true)
  const [prayerCity, setPrayerCity] = useState('Algiers')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

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

  const checkScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 10)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', checkScroll, { passive: true })
    checkScroll()
    return () => el.removeEventListener('scroll', checkScroll)
  }, [data, prayerData])

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' })
  }

  const weatherCityAr: Record<string, string> = {
    Algiers: 'الجزائر العاصمة', Oran: 'وهران', Constantine: 'قسنطينة', Annaba: 'عنابة',
  }

  return (
    <div className="dzd-strip-root" dir="rtl">
      {/* Header row */}
      <div className="dzd-strip-header">
        <span className="dzd-strip-title">📡 البث المباشر</span>
        <div className="dzd-strip-controls">
          <button className="dzd-nav-btn" onClick={() => { loadDashboard(); loadPrayer(prayerCity) }} title="تحديث">
            <RefreshCw size={13} className={loading || prayerLoading ? 'dzd-spin' : ''} />
          </button>
          <button className="dzd-nav-btn" onClick={() => scroll('right')} disabled={!canScrollRight}>
            <ChevronLeft size={16} />
          </button>
          <button className="dzd-nav-btn" onClick={() => scroll('left')} disabled={!canScrollLeft}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable strip */}
      <div className="dzd-strip-scroll" ref={scrollRef}>

        {/* ===== PRAYER TIMES SECTION ===== */}
        <div className="dzd-section">
          <div className="dzd-section-label">🕌 مواقيت الصلاة</div>
          {prayerLoading ? (
            <div className="dzd-card dzd-card--loading">
              <div className="dzd-loading-dots"><span /><span /><span /></div>
            </div>
          ) : prayerData ? (
            <>
              <div className="dzd-prayer-main-card">
                <div className="dzd-prayer-location">
                  📍 {CITY_AR[prayerData.city] || prayerData.city} — {prayerData.date}
                </div>
                <div className="dzd-prayer-row">
                  {Object.entries(prayerData.times).map(([name, time]) => (
                    <div key={name} className="dzd-prayer-slot">
                      <span className="dzd-prayer-slot-icon">{PRAYER_ICONS[name] || '🕐'}</span>
                      <span className="dzd-prayer-slot-name">{name}</span>
                      <span className="dzd-prayer-slot-time">{time}</span>
                    </div>
                  ))}
                </div>
                <div className="dzd-prayer-cities-row">
                  {Object.entries(CITY_AR).map(([en, ar]) => (
                    <button
                      key={en}
                      className={`dzd-city-chip ${prayerCity === en ? 'dzd-city-chip--active' : ''}`}
                      onClick={() => loadPrayer(en)}
                    >
                      {ar}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="dzd-card dzd-card--error">
              <span>تعذّر تحميل مواقيت الصلاة</span>
              <button onClick={() => loadPrayer(prayerCity)}>إعادة المحاولة</button>
            </div>
          )}
        </div>

        {/* ===== WEATHER SECTION ===== */}
        <div className="dzd-section">
          <div className="dzd-section-label"><Cloud size={13} /> الطقس</div>
          {loading ? (
            <div className="dzd-card dzd-card--loading">
              <div className="dzd-loading-dots"><span /><span /><span /></div>
            </div>
          ) : (data?.weather || []).map((item, i) => (
            <div key={i} className="dzd-weather-mini-card">
              <div className="dzd-wm-city">{weatherCityAr[item.city] || item.city}</div>
              {item.temp !== null ? (
                <>
                  <div className="dzd-wm-temp">
                    {item.icon && (
                      <img src={`https://openweathermap.org/img/wn/${item.icon}.png`} alt="" className="dzd-wm-icon" />
                    )}
                    <span>{item.temp}°C</span>
                  </div>
                  <div className="dzd-wm-cond">{item.condition}</div>
                  <div className="dzd-wm-meta">
                    {item.humidity !== undefined && <span><Droplets size={10} /> {item.humidity}%</span>}
                    {item.wind !== undefined && <span><Wind size={10} /> {item.wind} km/h</span>}
                  </div>
                </>
              ) : (
                <div className="dzd-wm-no-key">أضف OPENWEATHER_API_KEY</div>
              )}
            </div>
          ))}
        </div>

        {/* ===== NEWS SECTION ===== */}
        <div className="dzd-section">
          <div className="dzd-section-label"><Newspaper size={13} /> أخبار</div>
          {loading ? (
            <div className="dzd-card dzd-card--loading">
              <div className="dzd-loading-dots"><span /><span /><span /></div>
            </div>
          ) : (data?.news?.length === 0) ? (
            <div className="dzd-card dzd-card--empty">لا توجد أخبار</div>
          ) : (
            (data?.news || []).map((item, i) => (
              <div key={i} className="dzd-news-mini-card" onClick={() => onSend(`اخبار: ${item.title}`)}>
                <div className="dzd-nm-source">{item.feedName}</div>
                <div className="dzd-nm-title">{item.title}</div>
                {item.link && (
                  <a href={item.link} target="_blank" rel="noopener noreferrer"
                    className="dzd-nm-link" onClick={e => e.stopPropagation()}>
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
            ))
          )}
        </div>

        {/* ===== SPORTS SECTION ===== */}
        <div className="dzd-section">
          <div className="dzd-section-label"><Trophy size={13} /> رياضة</div>
          {loading ? (
            <div className="dzd-card dzd-card--loading">
              <div className="dzd-loading-dots"><span /><span /><span /></div>
            </div>
          ) : (data?.sports?.length === 0) ? (
            <div className="dzd-card dzd-card--empty">لا توجد أخبار رياضية</div>
          ) : (
            (data?.sports || []).map((item, i) => (
              <div key={i} className="dzd-news-mini-card dzd-news-mini-card--sport" onClick={() => onSend(`رياضة: ${item.title}`)}>
                <div className="dzd-nm-source">{item.feedName}</div>
                <div className="dzd-nm-title">{item.title}</div>
                {item.link && (
                  <a href={item.link} target="_blank" rel="noopener noreferrer"
                    className="dzd-nm-link" onClick={e => e.stopPropagation()}>
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}
