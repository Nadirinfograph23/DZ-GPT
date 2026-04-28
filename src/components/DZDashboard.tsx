import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Newspaper, Trophy, Wind, Droplets, ExternalLink, RefreshCw,
  MapPin, Thermometer, Cpu, TrendingUp, Navigation, Eye,
  GitBranch, Cloud, BookOpen,
} from 'lucide-react'
import '../styles/dz-dashboard.css'
import { withRetry } from '../utils/dzMemory'

interface NewsItem {
  title: string
  link: string
  description: string
  pubDate: string
  source: string
  feedName: string
}

interface TechItem extends NewsItem {
  category: string
  trending_score: number
}

interface WeatherData {
  city: string
  temp: number | null
  feels_like?: number
  temp_min?: number
  temp_max?: number
  condition: string | null
  icon: string | null
  humidity?: number
  wind?: number
  visibility?: number | null
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
  tech: TechItem[]
  weather: WeatherData[]
  lfp?: {
    matches: MatchItem[]
    articles: { title: string; link: string; date?: string }[]
    fetchedAt?: number
    source?: string
  } | null
  fetchedAt: string
}

interface MatchItem {
  round?: string
  home: string
  away: string
  homeScore?: string | number
  awayScore?: string | number
  played?: boolean
  date?: string
  time?: string
  link?: string
}

interface CurrencyData {
  base: string
  provider: string
  rates: Record<string, number>
  status: 'live' | 'stale' | string
  last_update?: string
}

interface SyncStatusData {
  status: 'synced' | 'out_of_sync' | 'unknown'
  branch: string
  repository: string
  github?: {
    commitSha: string | null
    shortSha: string | null
  }
  vercel?: {
    commitSha: string | null
    shortSha: string | null
    deploymentUrl: string | null
    state: string
    source: string
  }
  checkedAt: string
  error?: string
}

const PRAYER_ICONS: Record<string, string> = {
  'الفجر': '🌄', 'الشروق': '🌅', 'الظهر': '☀️', 'العصر': '🌤️', 'المغرب': '🌇', 'العشاء': '🌙',
}
const PRAYER_COLORS: Record<string, string> = {
  'الفجر': '#818cf8', 'الشروق': '#fb923c', 'الظهر': '#facc15', 'العصر': '#34d399', 'المغرب': '#f472b6', 'العشاء': '#a78bfa',
}

// 58 Wilayas of Algeria — { en: API name, ar: display name }
const WILAYAS = [
  { en: 'Adrar', ar: 'أدرار' },
  { en: 'Chlef', ar: 'الشلف' },
  { en: 'Laghouat', ar: 'الأغواط' },
  { en: 'Oum el Bouaghi', ar: 'أم البواقي' },
  { en: 'Batna', ar: 'باتنة' },
  { en: 'Bejaia', ar: 'بجاية' },
  { en: 'Biskra', ar: 'بسكرة' },
  { en: 'Bechar', ar: 'بشار' },
  { en: 'Blida', ar: 'البليدة' },
  { en: 'Bouira', ar: 'البويرة' },
  { en: 'Tamanrasset', ar: 'تمنراست' },
  { en: 'Tebessa', ar: 'تبسة' },
  { en: 'Tlemcen', ar: 'تلمسان' },
  { en: 'Tiaret', ar: 'تيارت' },
  { en: 'Tizi Ouzou', ar: 'تيزي وزو' },
  { en: 'Algiers', ar: 'الجزائر' },
  { en: 'Djelfa', ar: 'الجلفة' },
  { en: 'Jijel', ar: 'جيجل' },
  { en: 'Setif', ar: 'سطيف' },
  { en: 'Saida', ar: 'سعيدة' },
  { en: 'Skikda', ar: 'سكيكدة' },
  { en: 'Sidi bel Abbes', ar: 'سيدي بلعباس' },
  { en: 'Annaba', ar: 'عنابة' },
  { en: 'Guelma', ar: 'قالمة' },
  { en: 'Constantine', ar: 'قسنطينة' },
  { en: 'Medea', ar: 'المدية' },
  { en: 'Mostaganem', ar: 'مستغانم' },
  { en: 'Msila', ar: 'المسيلة' },
  { en: 'Mascara', ar: 'معسكر' },
  { en: 'Ouargla', ar: 'ورقلة' },
  { en: 'Oran', ar: 'وهران' },
  { en: 'El Bayadh', ar: 'البيض' },
  { en: 'Illizi', ar: 'إليزي' },
  { en: 'Bordj Bou Arreridj', ar: 'برج بوعريريج' },
  { en: 'Boumerdes', ar: 'بومرداس' },
  { en: 'El Tarf', ar: 'الطارف' },
  { en: 'Tindouf', ar: 'تندوف' },
  { en: 'Tissemsilt', ar: 'تيسمسيلت' },
  { en: 'El Oued', ar: 'الوادي' },
  { en: 'Khenchela', ar: 'خنشلة' },
  { en: 'Souk Ahras', ar: 'سوق أهراس' },
  { en: 'Tipaza', ar: 'تيبازة' },
  { en: 'Mila', ar: 'ميلة' },
  { en: 'Ain Defla', ar: 'عين الدفلى' },
  { en: 'Naama', ar: 'النعامة' },
  { en: 'Ain Temouchent', ar: 'عين تموشنت' },
  { en: 'Ghardaia', ar: 'غرداية' },
  { en: 'Relizane', ar: 'غليزان' },
  { en: 'Timimoun', ar: 'تيميمون' },
  { en: 'Bordj Badji Mokhtar', ar: 'برج باجي مختار' },
  { en: 'Ouled Djellal', ar: 'أولاد جلال' },
  { en: 'Beni Abbes', ar: 'بني عباس' },
  { en: 'In Salah', ar: 'عين صالح' },
  { en: 'In Guezzam', ar: 'عين قزام' },
  { en: 'Touggourt', ar: 'تقرت' },
  { en: 'Djanet', ar: 'جانت' },
  { en: 'El Meghaier', ar: 'المغير' },
  { en: 'El Meniaa', ar: 'المنيعة' },
]

const STORAGE_KEY = 'dz-agent-selected-city'

const CURRENCY_NAMES: Record<string, string> = {
  USD: 'دولار أمريكي',
  EUR: 'يورو',
  GBP: 'جنيه إسترليني',
  SAR: 'ريال سعودي',
  AED: 'درهم إماراتي',
  TND: 'دينار تونسي',
  MAD: 'درهم مغربي',
  EGP: 'جنيه مصري',
  QAR: 'ريال قطري',
  KWD: 'دينار كويتي',
  CAD: 'دولار كندي',
  CHF: 'فرنك سويسري',
  CNY: 'يوان صيني',
  TRY: 'ليرة تركية',
  JPY: 'ين ياباني',
}

function getWeatherBg(icon: string | null) {
  if (!icon) return 'weather-default'
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

function getArName(enName: string) {
  return WILAYAS.find(w => w.en === enName)?.ar || enName
}

type DashboardContext = { priority: 'weather'; city: string }

function DoctorSearchCard({ onSend }: { onSend: (q: string, context?: DashboardContext) => void }) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [showPopup, setShowPopup] = useState(false)

  const openPopup = () => {
    if (busy) return
    setShowPopup(true)
  }

  const closePopup = () => setShowPopup(false)

  const handleManual = () => {
    closePopup()
    onSend('أريد طبيب')
  }

  const handleUseGps = async () => {
    closePopup()
    if (!('geolocation' in navigator)) {
      onSend('أريد طبيب')
      return
    }
    setBusy(true)
    setStatus('جاري طلب تفعيل GPS...')
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5 * 60 * 1000,
        })
      })
      const { latitude, longitude } = pos.coords
      setStatus('جاري تحديد الولاية...')
      let city = ''
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ar&zoom=10`,
          { headers: { 'Accept': 'application/json' } }
        )
        if (r.ok) {
          const j = await r.json()
          const a = j.address || {}
          city = a.city || a.town || a.village || a.municipality || a.county || a.state || ''
        }
      } catch { /* reverse-geocode failure — ignore */ }

      const gpsTag = ` [GPS:${latitude.toFixed(5)},${longitude.toFixed(5)}]`
      if (city) onSend(`أريد طبيب في ${city}${gpsTag}`)
      else onSend(`أريد طبيب${gpsTag}`)
    } catch (err: any) {
      const denied = err && (err.code === 1 || /denied|permission/i.test(String(err.message || '')))
      if (denied) setStatus('لم يتم تفعيل GPS — سنكمل بدون موقعك')
      onSend('أريد طبيب')
    } finally {
      setBusy(false)
      setTimeout(() => setStatus(''), 2500)
    }
  }

  return (
    <div className="dzd-section dzd-section--doctor">
      <button
        type="button"
        className="dzd-doctor-card"
        onClick={openPopup}
        disabled={busy}
        aria-label="ابحث عن طبيب قريب منك"
      >
        <span className="dzd-doctor-icon">{busy ? '📡' : '🔎'}</span>
        <span className="dzd-doctor-text">
          <span className="dzd-doctor-title">نحوس على طبيب؟</span>
          <span className="dzd-doctor-sub">
            {status || 'GPS اختياري — للبحث قرب موقعك'}
          </span>
        </span>
        <span className="dzd-doctor-arrow">›</span>
      </button>

      {showPopup && (
        <div
          className="dzd-doctor-modal-backdrop"
          onClick={closePopup}
          role="presentation"
        >
          <div
            className="dzd-doctor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dzd-doctor-modal-title"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="dzd-doctor-modal-icon">📍</div>
            <h3 id="dzd-doctor-modal-title" className="dzd-doctor-modal-title">
              تحديد الموقع
            </h3>
            <p className="dzd-doctor-modal-text">
              هل تريد من DZ Agent تحديد موقعك لمعرفة الأطباء الأقرب إليك؟
            </p>
            <div className="dzd-doctor-modal-actions">
              <button
                type="button"
                className="dzd-doctor-modal-btn dzd-doctor-modal-btn--primary"
                onClick={handleUseGps}
              >
                ✅ نعم
              </button>
              <button
                type="button"
                className="dzd-doctor-modal-btn dzd-doctor-modal-btn--secondary"
                onClick={handleManual}
              >
                ❌ سأبحث يدوياً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DZDashboard({ onSend }: { onSend: (q: string, context?: DashboardContext) => void }) {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  // Shared city (persisted)
  const [selectedCity, setSelectedCity] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'Algiers' } catch { return 'Algiers' }
  })

  // Per-city weather
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // Prayer
  const [prayerData, setPrayerData] = useState<PrayerData | null>(null)
  const [prayerLoading, setPrayerLoading] = useState(true)

  // Geolocation
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  // Wilaya picker visibility
  const [showPicker, setShowPicker] = useState(false)

  const [currencyData, setCurrencyData] = useState<CurrencyData | null>(null)
  const [currencyLoading, setCurrencyLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)

  const [standingsData, setStandingsData] = useState<{ standings: { rank: string; team: string; played: string; wins: string; draws: string; losses: string; points: string }[]; source: string; fetchedAt: string } | null>(null)
  const [standingsLoading, setStandingsLoading] = useState(false)

  const [globalLeagues, setGlobalLeagues] = useState<{ leagues: { name: string; matches: { homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null; statusType: string; startTime: string; link: string }[] }[]; date: string; source: string } | null>(null)
  const [globalLoading, setGlobalLoading] = useState(false)

  // Welcome toast
  const [welcomeCity, setWelcomeCity] = useState<string | null>(null)
  const [welcomeVisible, setWelcomeVisible] = useState(false)

  const [activeSection, setActiveSection] = useState<'prayer' | 'weather' | 'news' | 'sports' | 'standings' | 'global' | 'tech' | 'currency' | 'sync' | 'quran'>('prayer')

  const saveCity = useCallback((city: string) => {
    try { localStorage.setItem(STORAGE_KEY, city) } catch {}
    setSelectedCity(city)
  }, [])

  const loadDashboard = async (opts: { force?: boolean } = {}) => {
    setLoading(true)
    try {
      const url = opts.force ? '/api/dz-agent/dashboard?bypassCache=1' : '/api/dz-agent/dashboard'
      const result = await withRetry(async () => {
        const r = await fetch(url)
        if (!r.ok) throw new Error(`Dashboard API error: ${r.status}`)
        return r.json()
      }, 1)
      setData(result)
    } catch (err) {
      console.error('[DZDashboard] loadDashboard failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadWeather = useCallback(async (city: string) => {
    setWeatherLoading(true)
    try {
      const result = await withRetry(async () => {
        const r = await fetch(`/api/dz-agent/weather?city=${encodeURIComponent(city)}`)
        if (!r.ok) throw new Error(`Weather API error: ${r.status}`)
        return r.json()
      }, 1)
      setWeatherData(result)
    } catch (err) {
      console.error('[DZDashboard] loadWeather failed:', err)
      setWeatherData(null)
    } finally {
      setWeatherLoading(false)
    }
  }, [])

  const loadPrayer = useCallback(async (city: string) => {
    setPrayerLoading(true)
    try {
      const result = await withRetry(async () => {
        const r = await fetch(`/api/dz-agent/prayer?city=${encodeURIComponent(city)}`)
        if (!r.ok) throw new Error(`Prayer API error: ${r.status}`)
        return r.json()
      }, 1)
      setPrayerData(result)
    } catch (err) {
      console.error('[DZDashboard] loadPrayer failed:', err)
      setPrayerData(null)
    } finally {
      setPrayerLoading(false)
    }
  }, [])

  const loadCurrency = useCallback(async () => {
    setCurrencyLoading(true)
    try {
      const result = await withRetry(async () => {
        const r = await fetch('/api/currency/latest')
        if (!r.ok) throw new Error(`Currency API error: ${r.status}`)
        return r.json()
      }, 1)
      setCurrencyData(result)
    } catch (err) {
      console.error('[DZDashboard] loadCurrency failed:', err)
      setCurrencyData(null)
    } finally {
      setCurrencyLoading(false)
    }
  }, [])

  const loadSyncStatus = useCallback(async () => {
    setSyncLoading(true)
    try {
      const result = await withRetry(async () => {
        const r = await fetch('/api/dz-agent/sync-status')
        if (!r.ok) throw new Error(`Sync API error: ${r.status}`)
        return r.json()
      }, 1)
      setSyncStatus(result)
    } catch (err) {
      console.error('[DZDashboard] loadSyncStatus failed:', err)
      setSyncStatus(null)
    } finally {
      setSyncLoading(false)
    }
  }, [])

  const loadStandings = useCallback(async () => {
    setStandingsLoading(true)
    try {
      const result = await withRetry(async () => {
        const r = await fetch('/api/dz-agent/standings')
        if (!r.ok) throw new Error(`Standings API error: ${r.status}`)
        return r.json()
      }, 2)
      setStandingsData(result)
    } catch (err) {
      console.error('[DZDashboard] loadStandings failed:', err)
      setStandingsData(null)
    } finally {
      setStandingsLoading(false)
    }
  }, [])

  const loadGlobalLeagues = useCallback(async (opts: { force?: boolean } = {}) => {
    setGlobalLoading(true)
    try {
      const url = opts.force ? '/api/dz-agent/global-leagues?bypassCache=1' : '/api/dz-agent/global-leagues'
      const result = await withRetry(async () => {
        const r = await fetch(url)
        if (!r.ok) throw new Error(`Global leagues API error: ${r.status}`)
        return r.json()
      }, 2)
      setGlobalLeagues(result)
    } catch (err) {
      console.error('[DZDashboard] loadGlobalLeagues failed:', err)
      setGlobalLeagues(null)
    } finally {
      setGlobalLoading(false)
    }
  }, [])

  const changeCity = useCallback((city: string) => {
    saveCity(city)
    setShowPicker(false)
    loadWeather(city)
    loadPrayer(city)
    // Show welcome toast
    const arName = WILAYAS.find(w => w.en === city)?.ar || city
    setWelcomeCity(arName)
    setWelcomeVisible(true)
    setTimeout(() => setWelcomeVisible(false), 4000)
  }, [saveCity, loadWeather, loadPrayer])

  // Detect location via browser Geolocation API → Nominatim reverse geocode
  const detectLocation = useCallback(async () => {
    setGeoLoading(true)
    setGeoError(null)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
      )
      const { latitude, longitude } = position.coords
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`,
        { headers: { 'User-Agent': 'DZ-GPT/1.0' } }
      )
      if (!r.ok) throw new Error('Nominatim error')
      const geo = await r.json()
      const stateName = geo.address?.state || geo.address?.county || geo.address?.city || ''

      // Match to closest wilaya
      const lower = stateName.toLowerCase()
      const match = WILAYAS.find(w =>
        lower.includes(w.en.toLowerCase().split(' ')[0]) ||
        (w.ar && stateName.includes(w.ar.split(' ')[0]))
      ) || WILAYAS.find(w => w.en === 'Algiers')

      if (match) changeCity(match.en)
      else setGeoError('لم يتم التعرف على ولايتك — اختر يدوياً')
    } catch (err: unknown) {
      if (err instanceof GeolocationPositionError && err.code === 1) {
        setGeoError('لم يتم السماح بالوصول للموقع')
      } else {
        setGeoError('تعذّر تحديد الموقع')
      }
    } finally {
      setGeoLoading(false)
    }
  }, [changeCity])

  useEffect(() => {
    loadDashboard()
    loadPrayer(selectedCity)
    loadWeather(selectedCity)
    loadCurrency()
    loadSyncStatus()
    loadStandings()
    loadGlobalLeagues()
  }, [])

  const tabs = [
    { key: 'quran' as const, label: 'القرآن الكريم', icon: '📖', isNav: true },
    { key: 'prayer' as const, label: 'مواقيت الصلاة', icon: '🕌' },
    { key: 'weather' as const, label: 'الطقس', icon: '🌤️' },
    { key: 'news' as const, label: 'الأخبار', icon: '📰' },
    { key: 'sports' as const, label: 'الدوري الجزائري', icon: '⚽' },
    { key: 'standings' as const, label: 'الترتيب', icon: '🏆' },
    { key: 'global' as const, label: 'الدوريات العالمية', icon: '🌍' },
    { key: 'tech' as const, label: 'الأخبار التقنية', icon: '💻' },
    { key: 'currency' as const, label: 'أسعار الصرف', icon: '💱' },
    { key: 'sync' as const, label: 'التزامن', icon: '🔄' },
  ]

  const matches = data?.lfp?.matches || []
  const upcomingMatches = matches.filter(match => !match.played).slice(0, 8)
  const playedMatches = matches.filter(match => match.played).slice(0, 8)
  const visibleMatches = [...upcomingMatches, ...playedMatches].slice(0, 10)
  const priorityCurrencies = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'TND', 'MAD', 'CAD']

  // City selector bar (shared between prayer & weather)
  const CityBar = () => (
    <div className="dzd-city-bar">
      <div className="dzd-city-bar-top">
        <button
          className={`dzd-geo-btn ${geoLoading ? 'dzd-geo-btn--loading' : ''}`}
          onClick={detectLocation}
          disabled={geoLoading}
          title="تحديد موقعي تلقائياً"
        >
          <Navigation size={11} className={geoLoading ? 'dzd-spin' : ''} />
          {geoLoading ? 'جاري...' : 'موقعي'}
        </button>
        <button
          className="dzd-picker-toggle"
          onClick={() => setShowPicker(p => !p)}
        >
          <MapPin size={10} /> {getArName(selectedCity)}
          <span className="dzd-picker-arrow">{showPicker ? '▲' : '▼'}</span>
        </button>
      </div>
      {geoError && <div className="dzd-geo-error">{geoError}</div>}
      {showPicker && (
        <div className="dzd-wilaya-grid">
          {WILAYAS.map(w => (
            <button
              key={w.en}
              className={`dzd-wilaya-btn ${selectedCity === w.en ? 'dzd-wilaya-btn--active' : ''}`}
              onClick={() => changeCity(w.en)}
            >
              {w.ar}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="dzd-root" dir="rtl">
      {/* Welcome toast */}
      {welcomeCity && (
        <div className={`dzd-welcome-toast ${welcomeVisible ? 'dzd-welcome-toast--show' : 'dzd-welcome-toast--hide'}`}>
          <span className="dzd-welcome-toast-avatar">🤖</span>
          <span className="dzd-welcome-toast-text">
            <strong>DZ Agent:</strong> أهلا بناس {welcomeCity} 🇩🇿
          </span>
        </div>
      )}

      {/* Top bar */}
      <div className="dzd-topbar">
        <div className="dzd-topbar-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`dzd-tab ${activeSection === tab.key ? 'dzd-tab--active' : ''} ${tab.key === 'quran' ? 'dzd-tab--quran' : ''}`}
              onClick={() => {
                if (tab.key === 'quran') {
                  navigate('/aiquran')
                  return
                }
                setActiveSection(tab.key)
              }}
            >
              <span className="dzd-tab-icon">{tab.icon}</span>
              <span className="dzd-tab-label">{tab.label}</span>
              {tab.key === 'quran' && <BookOpen size={10} className="dzd-tab-quran-icon" />}
            </button>
          ))}
        </div>
        <button
          className="dzd-refresh-btn"
          onClick={() => { loadDashboard({ force: true }); loadPrayer(selectedCity); loadWeather(selectedCity); loadCurrency(); loadSyncStatus(); loadStandings(); loadGlobalLeagues({ force: true }) }}
          title="تحديث"
        >
          <RefreshCw size={13} className={(loading || prayerLoading || weatherLoading || currencyLoading || syncLoading || standingsLoading || globalLoading) ? 'dzd-spin' : ''} />
        </button>
      </div>

      {/* Panel content */}
      <div className="dzd-panel">

        {/* ===== PRAYER ===== */}
        {activeSection === 'prayer' && (
          <div className="dzd-prayer-panel">
            <CityBar />
            {prayerLoading ? (
              <div className="dzd-skeleton-grid">
                {[...Array(6)].map((_, i) => <div key={i} className="dzd-skeleton" />)}
              </div>
            ) : prayerData ? (
              <>
                <div className="dzd-prayer-header">
                  <span className="dzd-prayer-date">
                    <MapPin size={11} /> {getArName(selectedCity)} — {prayerData.date}
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
              </>
            ) : (
              <div className="dzd-error-state">
                <span>⚠️ تعذّر تحميل مواقيت الصلاة</span>
                <button className="dzd-retry-btn" onClick={() => loadPrayer(selectedCity)}>إعادة المحاولة</button>
              </div>
            )}
          </div>
        )}

        {activeSection === 'sync' && (
          <div className="dzd-sync-panel">
            {syncLoading ? (
              <div className="dzd-skeleton-grid">
                {[...Array(3)].map((_, i) => <div key={i} className="dzd-skeleton" />)}
              </div>
            ) : syncStatus ? (
              <div className={`dzd-sync-card dzd-sync-card--${syncStatus.status}`}>
                <div className="dzd-sync-header">
                  <span className="dzd-sync-badge">
                    {syncStatus.status === 'synced' ? 'متزامن' : syncStatus.status === 'out_of_sync' ? 'غير متزامن' : 'غير معروف'}
                  </span>
                  <button className="dzd-sync-refresh" onClick={loadSyncStatus}>
                    <RefreshCw size={12} /> فحص الآن
                  </button>
                </div>
                <div className="dzd-sync-summary">
                  {syncStatus.status === 'synced'
                    ? 'GitHub و Vercel يعملان على نفس النسخة.'
                    : syncStatus.status === 'out_of_sync'
                      ? 'يوجد اختلاف بين آخر commit في GitHub والنسخة المنشورة على Vercel.'
                      : syncStatus.error || 'تعذّر تأكيد التزامن حالياً.'}
                </div>
                <div className="dzd-sync-grid">
                  <div className="dzd-sync-item">
                    <GitBranch size={16} />
                    <div>
                      <span className="dzd-sync-label">GitHub</span>
                      <strong>{syncStatus.github?.shortSha || 'غير متاح'}</strong>
                      <small>{syncStatus.branch}</small>
                    </div>
                  </div>
                  <div className="dzd-sync-item">
                    <Cloud size={16} />
                    <div>
                      <span className="dzd-sync-label">Vercel</span>
                      <strong>{syncStatus.vercel?.shortSha || 'غير متاح'}</strong>
                      <small>{syncStatus.vercel?.state || 'UNKNOWN'}</small>
                    </div>
                  </div>
                </div>
                <div className="dzd-sync-footer">
                  <span>{syncStatus.repository}</span>
                  <span>{new Date(syncStatus.checkedAt).toLocaleString('ar-DZ')}</span>
                </div>
              </div>
            ) : (
              <div className="dzd-empty">
                <p>تعذّر تحميل حالة التزامن.</p>
                <button className="dzd-sync-refresh" onClick={loadSyncStatus}>
                  <RefreshCw size={12} /> إعادة المحاولة
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== WEATHER ===== */}
        {activeSection === 'weather' && (
          <div className="dzd-weather-panel">
            <CityBar />
            {weatherLoading ? (
              <div className="dzd-skeleton-grid">
                <div className="dzd-skeleton dzd-skeleton--weather-main" />
              </div>
            ) : weatherData && weatherData.temp !== null ? (
              <div
                className={`dzd-weather-main-card ${getWeatherBg(weatherData.icon)}`}
                onClick={() => onSend(`حالة الطقس في ${getArName(selectedCity)} اليوم`, { priority: 'weather', city: selectedCity })}
              >
                <div className="dzd-wmc-header">
                  <div className="dzd-wmc-city">
                    <MapPin size={12} /> {getArName(selectedCity)}
                  </div>
                  {weatherData.icon && (
                    <img
                      src={`https://openweathermap.org/img/wn/${weatherData.icon}@2x.png`}
                      alt=""
                      className="dzd-wmc-icon"
                    />
                  )}
                </div>
                <div className="dzd-wmc-temp-row">
                  <span className="dzd-wmc-temp">{weatherData.temp}°</span>
                  <div className="dzd-wmc-temp-range">
                    <span className="dzd-wmc-temp-max">▲ {weatherData.temp_max}°</span>
                    <span className="dzd-wmc-temp-min">▼ {weatherData.temp_min}°</span>
                  </div>
                </div>
                <div className="dzd-wmc-cond">{weatherData.condition}</div>
                <div className="dzd-wmc-feels">يبدو كـ {weatherData.feels_like}°</div>
                <div className="dzd-wmc-meta">
                  {weatherData.humidity !== undefined && (
                    <span className="dzd-wmc-meta-item">
                      <Droplets size={11} /> {weatherData.humidity}%
                    </span>
                  )}
                  {weatherData.wind !== undefined && (
                    <span className="dzd-wmc-meta-item">
                      <Wind size={11} /> {weatherData.wind} km/h
                    </span>
                  )}
                  {weatherData.visibility !== null && weatherData.visibility !== undefined && (
                    <span className="dzd-wmc-meta-item">
                      <Eye size={11} /> {weatherData.visibility} km
                    </span>
                  )}
                </div>
              </div>
            ) : weatherData?.error?.includes('OPENWEATHER_API_KEY') ? (
              <div className="dzd-wc-nokey">
                <Thermometer size={20} />
                <span>أضف OPENWEATHER_API_KEY لعرض الطقس</span>
              </div>
            ) : (
              <div className="dzd-error-state">
                <span>⚠️ تعذّر تحميل بيانات الطقس</span>
                <button className="dzd-retry-btn" onClick={() => loadWeather(selectedCity)}>إعادة المحاولة</button>
              </div>
            )}
          </div>
        )}

        {/* ===== NEWS ===== */}
        {activeSection === 'news' && (
          <div className="dzd-news-panel">
            {loading ? (
              <div className="dzd-news-list">
                <div className="dzd-news-loading-hint">
                  <span className="dzd-spin-icon">⏳</span> جاري تحميل أبرز عناوين الصحف...
                </div>
                {[...Array(5)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--news" />)}
              </div>
            ) : (!data?.news || data.news.length === 0) ? (
              <div className="dzd-empty-state-news">
                <span className="dzd-empty-icon">📰</span>
                <p>تعذّر تحميل عناوين الصحف حالياً</p>
                <p className="dzd-empty-sub">تحقق من اتصالك أو حاول مجدداً</p>
                <button
                  className="dzd-retry-btn"
                  onClick={() => { loadDashboard({ force: true }) }}
                >
                  <RefreshCw size={12} /> إعادة المحاولة
                </button>
              </div>
            ) : (
              <div className="dzd-news-list">
                {(data.news).map((item, i) => (
                  <div key={i} className="dzd-news-card" onClick={() => onSend(`اخبار: ${item.title}`)}>
                    <div className="dzd-news-card-left">
                      <span className="dzd-news-source"><Newspaper size={9} /> {item.feedName}</span>
                      <span className="dzd-news-time">{formatPubDate(item.pubDate)}</span>
                    </div>
                    <div className="dzd-news-card-body">
                      <p className="dzd-news-title">{item.title}</p>
                    </div>
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="dzd-news-link" onClick={e => e.stopPropagation()}>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== SPORTS — الدوري الجزائري ===== */}
        {activeSection === 'sports' && (
          <div className="dzd-sports-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 6px', fontSize: '11px', color: '#a0a0b0' }}>
              <span>⚽ الدوري الجزائري — المصدر: lfp.dz/ar/calendar</span>
              <button
                className="dzd-retry-btn"
                style={{ fontSize: '10px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                onClick={() => loadDashboard({ force: true })}
                disabled={loading}
                title="تحديث سريع من lfp.dz (يتجاوز ذاكرة التخزين المؤقت)"
              >
                <RefreshCw size={11} className={loading ? 'dzd-spin' : ''} />
                {loading ? 'جاري التحديث…' : 'تحديث سريع'}
              </button>
            </div>
            <div className="dzd-sports-header" style={{ display: 'flex', gap: '8px', marginBottom: '8px', padding: '0 4px' }}>
              <button className="dzd-retry-btn" style={{ flex: 1 }} onClick={() => onSend('ما هو ترتيب الدوري الجزائري المحترف؟')}>
                🏆 الترتيب
              </button>
              <button className="dzd-retry-btn" style={{ flex: 1 }} onClick={() => onSend('ما هي مباريات الدوري الجزائري القادمة؟')}>
                📅 المباريات القادمة
              </button>
              <button className="dzd-retry-btn" style={{ flex: 1 }} onClick={() => onSend('ما هي نتائج مباريات الدوري الجزائري الأخيرة؟')}>
                ✅ النتائج
              </button>
            </div>
            {loading ? (
              <div className="dzd-match-list">
                {[...Array(4)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--match" />)}
              </div>
            ) : (visibleMatches.length === 0 && data?.sports?.length === 0) ? (
              <div className="dzd-empty-state">
                <p>لا توجد بيانات حالياً</p>
                <button className="dzd-retry-btn" onClick={() => loadDashboard({ force: true })}>إعادة المحاولة</button>
              </div>
            ) : (
              <>
                {visibleMatches.length > 0 && (
                  <div className="dzd-match-list">
                    {visibleMatches.map((match, i) => (
                      <div key={`${match.home}-${match.away}-${i}`} className={`dzd-match-card ${match.played ? 'dzd-match-card--played' : ''}`} onClick={() => onSend(`الدوري الجزائري: ${match.home} ضد ${match.away}`)}>
                        <div className="dzd-match-meta">
                          <span><Trophy size={10} /> {match.round || 'الرابطة المحترفة'}</span>
                          <span>{match.played ? 'نتيجة' : 'قادمة'}</span>
                        </div>
                        <div className="dzd-match-teams">
                          <span>{match.home}</span>
                          <strong>
                            {match.played
                              ? `${match.homeScore ?? '-'} - ${match.awayScore ?? '-'}`
                              : 'VS'}
                          </strong>
                          <span>{match.away}</span>
                        </div>
                        {(match.date || match.time || match.link) && (
                          <div className="dzd-match-footer">
                            <span>{[match.date, match.time].filter(Boolean).join(' · ') || 'LFP'}</span>
                            {match.link && (
                              <a href={match.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                                <ExternalLink size={11} />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {(data?.sports || []).length > 0 && (
                  <div className="dzd-news-list dzd-sports-news-list">
                    {(data?.sports || []).slice(0, 5).map((item, i) => (
                      <div key={i} className="dzd-news-card dzd-news-card--sport" onClick={() => onSend(`رياضة: ${item.title}`)}>
                        <div className="dzd-news-card-left">
                          <span className="dzd-news-source dzd-news-source--sport"><Trophy size={9} /> {item.feedName}</span>
                          <span className="dzd-news-time">{formatPubDate(item.pubDate)}</span>
                        </div>
                        <div className="dzd-news-card-body">
                          <p className="dzd-news-title">{item.title}</p>
                        </div>
                        {item.link && (
                          <a href={item.link} target="_blank" rel="noopener noreferrer" className="dzd-news-link" onClick={e => e.stopPropagation()}>
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ===== STANDINGS — جدول الترتيب ===== */}
        {activeSection === 'standings' && (
          <div className="dzd-sports-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 8px', fontSize: '11px', color: '#a0a0b0', gap: '8px', flexWrap: 'wrap' }}>
              <span>🏆 ترتيب الدوري الجزائري المحترف</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                {standingsData?.source && <span style={{ fontSize: '10px' }}>المصدر: {standingsData.source}</span>}
                <button
                  className="dzd-retry-btn"
                  style={{ fontSize: '10px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  onClick={loadStandings}
                  disabled={standingsLoading}
                  title="تحديث سريع"
                >
                  <RefreshCw size={11} className={standingsLoading ? 'dzd-spin' : ''} />
                  {standingsLoading ? 'جاري…' : 'تحديث'}
                </button>
              </span>
            </div>
            {standingsLoading ? (
              <div className="dzd-match-list">
                {[...Array(6)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--match" />)}
              </div>
            ) : standingsData?.standings && standingsData.standings.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', direction: 'rtl' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', color: '#a0a0b0' }}>
                      <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>#</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>الفريق</th>
                      <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>ل</th>
                      <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>ف</th>
                      <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>ت</th>
                      <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600 }}>خ</th>
                      <th style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, color: '#34d399' }}>ن</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standingsData.standings.slice(0, 20).map((row, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                        onClick={() => onSend(`أخبار ${row.team} في الدوري الجزائري`)}
                      >
                        <td style={{ padding: '6px 4px', textAlign: 'center', color: i < 3 ? '#34d399' : i >= (standingsData.standings.length - 3) ? '#f87171' : '#a0a0b0', fontWeight: 700 }}>{row.rank || i + 1}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{row.team}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'center', color: '#a0a0b0' }}>{row.played}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'center', color: '#34d399' }}>{row.wins}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'center', color: '#facc15' }}>{row.draws}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'center', color: '#f87171' }}>{row.losses}</td>
                        <td style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 700, color: '#34d399' }}>{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="dzd-empty-state">
                <p>جاري جلب جدول الترتيب...</p>
                <button className="dzd-retry-btn" onClick={loadStandings}>إعادة المحاولة</button>
              </div>
            )}
          </div>
        )}

        {/* ===== GLOBAL LEAGUES — الدوريات العالمية ===== */}
        {activeSection === 'global' && (
          <div className="dzd-sports-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 4px 8px', fontSize: '11px', color: '#a0a0b0', gap: '8px', flexWrap: 'wrap' }}>
              <span>🌍 الدوريات العالمية — {globalLeagues?.date || new Date().toLocaleDateString('ar-DZ')}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                {globalLeagues?.source && <span style={{ fontSize: '10px' }}>المصدر: {globalLeagues.source}</span>}
                <button
                  className="dzd-retry-btn"
                  style={{ fontSize: '10px', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => loadGlobalLeagues({ force: true })}
                  disabled={globalLoading}
                  title="تحديث سريع من jdwel.com (يتجاوز ذاكرة التخزين المؤقت)"
                >
                  <RefreshCw size={11} className={globalLoading ? 'dzd-spin' : ''} />
                  {globalLoading ? 'جاري…' : 'تحديث'}
                </button>
              </span>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
              {['بريميرليغ', 'ليغا', 'تشامبيونز ليغ', 'بوندسليغا', 'سيريا إيه'].map(league => (
                <button key={league} className="dzd-retry-btn" style={{ fontSize: '11px', padding: '3px 8px' }} onClick={() => onSend(`مباريات ${league} اليوم`)}>
                  {league}
                </button>
              ))}
            </div>
            {globalLoading ? (
              <div className="dzd-match-list">
                {[...Array(5)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--match" />)}
              </div>
            ) : globalLeagues?.leagues && globalLeagues.leagues.length > 0 ? (
              <div className="dzd-match-list">
                {globalLeagues.leagues.map((league, li) => (
                  <div key={li} style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#a78bfa', padding: '4px 0', borderBottom: '1px solid rgba(167,139,250,0.2)', marginBottom: '6px' }}>
                      🏟️ {league.name}
                    </div>
                    {league.matches.map((match, mi) => (
                      <div
                        key={mi}
                        className={`dzd-match-card ${match.statusType === 'finished' ? 'dzd-match-card--played' : ''}`}
                        onClick={() => onSend(`${match.homeTeam} ضد ${match.awayTeam} ${league.name}`)}
                        style={{ marginBottom: '4px' }}
                      >
                        <div className="dzd-match-teams" style={{ fontSize: '12px' }}>
                          <span>{match.homeTeam}</span>
                          <strong style={{ color: match.statusType === 'inprogress' ? '#f87171' : undefined }}>
                            {match.statusType === 'notstarted'
                              ? (match.startTime || 'VS')
                              : `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`}
                          </strong>
                          <span>{match.awayTeam}</span>
                        </div>
                        {match.statusType === 'inprogress' && (
                          <div style={{ textAlign: 'center', fontSize: '10px', color: '#f87171', marginTop: '2px' }}>🔴 جارية الآن</div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="dzd-empty-state">
                <p>لا توجد مباريات متاحة حالياً</p>
                <button className="dzd-retry-btn" onClick={() => loadGlobalLeagues({ force: true })}>إعادة المحاولة</button>
                <p style={{ fontSize: '11px', color: '#a0a0b0', marginTop: '8px' }}>اسأل DZ Agent عن أي دوري:</p>
                {['بريميرليغ اليوم', 'ليغا اليوم', 'دوري أبطال أوروبا'].map(q => (
                  <button key={q} className="dzd-retry-btn" style={{ margin: '2px', fontSize: '11px' }} onClick={() => onSend(q)}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'currency' && (
          <div className="dzd-currency-panel">
            {currencyLoading ? (
              <div className="dzd-currency-grid">
                {[...Array(8)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--currency" />)}
              </div>
            ) : currencyData?.rates ? (
              <>
                <div className="dzd-currency-head">
                  <span>{currencyData.status === 'live' ? 'مباشر' : 'بيانات محفوظة'}</span>
                  <small>{currencyData.provider}</small>
                </div>
                <div className="dzd-currency-grid">
                  {priorityCurrencies.filter(code => currencyData.rates[code]).map(code => {
                    const rate = currencyData.rates[code]
                    const dzdPerCurrency = rate > 0 ? (1 / rate).toFixed(2) : '-'
                    return (
                      <div key={code} className="dzd-currency-card" onClick={() => onSend(`سعر ${code} مقابل الدينار الجزائري`)}>
                        <div className="dzd-currency-code">{code}</div>
                        <div className="dzd-currency-name">{CURRENCY_NAMES[code] || code}</div>
                        <div className="dzd-currency-rate">1 {code} = {dzdPerCurrency} دج</div>
                        <div className="dzd-currency-sub">1 دج = {rate} {code}</div>
                      </div>
                    )
                  })}
                </div>
                {currencyData.last_update && (
                  <div className="dzd-currency-updated">
                    آخر تحديث: {new Date(currencyData.last_update).toLocaleString('ar-DZ')}
                  </div>
                )}
              </>
            ) : (
              <div className="dzd-error-state">
                <span>⚠️ تعذّر تحميل أسعار الصرف</span>
                <button className="dzd-retry-btn" onClick={loadCurrency}>إعادة المحاولة</button>
              </div>
            )}
          </div>
        )}

        {/* ===== TECH ===== */}
        {activeSection === 'tech' && (
          <div className="dzd-news-panel">
            {loading ? (
              <div className="dzd-news-list">
                {[...Array(5)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--news" />)}
              </div>
            ) : (!data?.tech || data.tech.length === 0) ? (
              <div className="dzd-empty-state">لا توجد أخبار تقنية</div>
            ) : (
              <div className="dzd-news-list">
                {(data.tech).map((item, i) => (
                  <div key={i} className="dzd-news-card dzd-news-card--tech" onClick={() => onSend(`تقنية: ${item.title}`)}>
                    <div className="dzd-news-card-left">
                      <span className="dzd-news-source dzd-news-source--tech"><Cpu size={9} /> {item.feedName}</span>
                      <span className="dzd-news-time">{formatPubDate(item.pubDate)}</span>
                    </div>
                    <div className="dzd-news-card-body">
                      <div className="dzd-tech-badges">
                        <span className="dzd-tech-category">{item.category}</span>
                        {item.trending_score >= 70 && (
                          <span className="dzd-tech-trending"><TrendingUp size={9} /> {item.trending_score}</span>
                        )}
                      </div>
                      <p className="dzd-news-title">{item.title}</p>
                    </div>
                    {item.link && (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="dzd-news-link dzd-news-link--tech" onClick={e => e.stopPropagation()}>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DOCTOR SEARCH ENTRY ── pinned at bottom of dashboard */}
        <DoctorSearchCard onSend={onSend} />

      </div>
    </div>
  )
}
