import { useState, useEffect } from 'react'
import { Newspaper, Trophy, Cloud, Wind, Droplets, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react'
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

interface DashboardData {
  news: NewsItem[]
  sports: SportItem[]
  weather: WeatherItem[]
  fetchedAt: string
}

function WeatherCard({ item }: { item: WeatherItem }) {
  const cityAr: Record<string, string> = {
    Algiers: 'الجزائر العاصمة',
    Oran: 'وهران',
    Constantine: 'قسنطينة',
  }
  const displayCity = cityAr[item.city] || item.city

  return (
    <div className="dzd-weather-card">
      <div className="dzd-weather-city">{displayCity}</div>
      {item.temp !== null ? (
        <>
          <div className="dzd-weather-temp">
            {item.icon && (
              <img
                src={`https://openweathermap.org/img/wn/${item.icon}.png`}
                alt={item.condition || ''}
                className="dzd-weather-icon"
              />
            )}
            <span className="dzd-weather-deg">{item.temp}°C</span>
          </div>
          <div className="dzd-weather-cond">{item.condition}</div>
          <div className="dzd-weather-meta">
            {item.humidity !== undefined && (
              <span><Droplets size={11} /> {item.humidity}%</span>
            )}
            {item.wind !== undefined && (
              <span><Wind size={11} /> {item.wind} km/h</span>
            )}
          </div>
        </>
      ) : (
        <div className="dzd-weather-unavail">—</div>
      )}
    </div>
  )
}

function NewsCard({ item, onClick }: { item: NewsItem; onClick: (q: string) => void }) {
  return (
    <div className="dzd-news-card" onClick={() => onClick(`اخبار: ${item.title}`)}>
      <div className="dzd-news-source">{item.feedName}</div>
      <div className="dzd-news-title">{item.title}</div>
      {item.description && (
        <div className="dzd-news-desc">{item.description.slice(0, 100)}{item.description.length > 100 ? '…' : ''}</div>
      )}
      <div className="dzd-news-footer">
        {item.pubDate && <span className="dzd-news-date">{new Date(item.pubDate).toLocaleDateString('ar-DZ')}</span>}
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
    </div>
  )
}

function SportCard({ item, onClick }: { item: SportItem; onClick: (q: string) => void }) {
  return (
    <div className="dzd-sport-card" onClick={() => onClick(`رياضة: ${item.title}`)}>
      <div className="dzd-sport-source">{item.feedName}</div>
      <div className="dzd-sport-title">{item.title}</div>
      {item.description && (
        <div className="dzd-sport-desc">{item.description.slice(0, 90)}{item.description.length > 90 ? '…' : ''}</div>
      )}
      <div className="dzd-sport-footer">
        {item.pubDate && <span className="dzd-sport-date">{new Date(item.pubDate).toLocaleDateString('ar-DZ')}</span>}
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="dzd-sport-link"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  )
}

export default function DZDashboard({ onSend }: { onSend: (q: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'news' | 'sports' | 'weather'>('news')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/dz-agent/dashboard')
      if (!r.ok) throw new Error('فشل تحميل البيانات')
      const d = await r.json()
      setData(d)
    } catch {
      setError('تعذّر تحميل البيانات الحية. تحقق من الاتصال.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const fetchedTime = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="dzd-root" dir="rtl">
      <div className="dzd-header">
        <div className="dzd-tabs">
          <button
            className={`dzd-tab ${tab === 'news' ? 'dzd-tab--active' : ''}`}
            onClick={() => setTab('news')}
          >
            <Newspaper size={14} />
            أخبار
            {data?.news?.length ? <span className="dzd-tab-count">{data.news.length}</span> : null}
          </button>
          <button
            className={`dzd-tab ${tab === 'sports' ? 'dzd-tab--active' : ''}`}
            onClick={() => setTab('sports')}
          >
            <Trophy size={14} />
            رياضة
            {data?.sports?.length ? <span className="dzd-tab-count">{data.sports.length}</span> : null}
          </button>
          <button
            className={`dzd-tab ${tab === 'weather' ? 'dzd-tab--active' : ''}`}
            onClick={() => setTab('weather')}
          >
            <Cloud size={14} />
            طقس
          </button>
        </div>
        <button className={`dzd-refresh ${loading ? 'dzd-refresh--spin' : ''}`} onClick={load} title="تحديث">
          <RefreshCw size={13} />
        </button>
        {fetchedTime && <span className="dzd-fetched">آخر تحديث {fetchedTime}</span>}
      </div>

      <div className="dzd-body">
        {loading && (
          <div className="dzd-loading">
            <div className="dzd-loading-dots"><span /><span /><span /></div>
            <p>جارٍ تحميل البيانات الحية...</p>
          </div>
        )}

        {error && !loading && (
          <div className="dzd-error">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={load}>إعادة المحاولة</button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {tab === 'news' && (
              <div className="dzd-grid">
                {data.news.length === 0 ? (
                  <div className="dzd-empty">لا توجد أخبار حالياً</div>
                ) : (
                  data.news.map((item, i) => (
                    <NewsCard key={i} item={item} onClick={onSend} />
                  ))
                )}
              </div>
            )}

            {tab === 'sports' && (
              <div className="dzd-grid">
                {data.sports.length === 0 ? (
                  <div className="dzd-empty">لا توجد نتائج رياضية حالياً</div>
                ) : (
                  data.sports.map((item, i) => (
                    <SportCard key={i} item={item} onClick={onSend} />
                  ))
                )}
              </div>
            )}

            {tab === 'weather' && (
              <div className="dzd-weather-grid">
                {data.weather.map((item, i) => (
                  <WeatherCard key={i} item={item} />
                ))}
                {data.weather.every(w => w.temp === null) && (
                  <div className="dzd-weather-note">
                    أضف مفتاح <code>OPENWEATHER_API_KEY</code> في إعدادات المشروع لتفعيل بيانات الطقس الحية
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
