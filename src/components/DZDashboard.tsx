import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Newspaper, Trophy, Wind, Droplets, ExternalLink, RefreshCw,
  MapPin, Thermometer, Cpu, TrendingUp, Navigation, Eye,
  BookOpen, Moon, Sunrise, Sun, CloudSun, Sunset, CloudMoon,
  Cloud, Globe, DollarSign, ArrowLeftRight, BarChart2,
  CalendarDays, CheckCircle2, Radio, Layers, Clock,
} from 'lucide-react'
import '../styles/dz-dashboard.css'
import { withRetry } from '../utils/dzMemory'
import WC2026MatchCard from './WC2026MatchCard'

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


const PRAYER_ICON_CMP: Record<string, React.ReactNode> = {
  'الفجر':   <Moon    size={16} />,
  'الشروق':  <Sunrise size={16} />,
  'الظهر':   <Sun     size={16} />,
  'العصر':   <CloudSun size={16} />,
  'المغرب':  <Sunset  size={16} />,
  'العشاء':  <CloudMoon size={16} />,
}
const PRAYER_COLORS: Record<string, string> = {
  'الفجر':  '#818cf8',
  'الشروق': '#a5b4fc',
  'الظهر':  '#c7d2fe',
  'العصر':  '#818cf8',
  'المغرب': '#a5b4fc',
  'العشاء': '#6366f1',
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

type DashboardContext = { priority: 'weather'; city: string; cityAr?: string }

type ModalStep = 'ask' | 'loading' | 'denied' | 'error'

function DoctorSearchCard({ onSend, onDoctorGpsReady }: {
  onSend: (q: string, context?: DashboardContext) => void
  onDoctorGpsReady?: (lat: number, lon: number, city: string) => void
}) {
  const [showPopup, setShowPopup] = useState(false)
  const [modalStep, setModalStep] = useState<ModalStep>('ask')
  const [loadingMsg, setLoadingMsg] = useState('')

  const openPopup = () => {
    setModalStep('ask')
    setLoadingMsg('')
    setShowPopup(true)
  }

  const closePopup = () => {
    setShowPopup(false)
    setModalStep('ask')
    setLoadingMsg('')
  }

  const handleManual = () => {
    closePopup()
    onSend('أريد طبيب')
  }

  const handleUseGps = () => {
    if (!('geolocation' in navigator)) {
      closePopup()
      onSend('أريد طبيب')
      return
    }
    // Switch to loading immediately so user sees the state change
    setModalStep('loading')
    setLoadingMsg('في انتظار إذن GPS من المتصفح...')

    // Call getCurrentPosition directly (not wrapped in async/await)
    // so the browser recognises this as a direct user-gesture and
    // shows the native "Allow location?" permission prompt.
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        setLoadingMsg('جاري تحديد اسم المدينة...')
        let city = ''
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ar&zoom=10`,
            { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) }
          )
          if (r.ok) {
            const j = await r.json()
            const a = j.address || {}
            city = a.city || a.town || a.village || a.municipality || a.county || a.state || ''
          }
        } catch { /* reverse-geocode failure is non-fatal */ }
        closePopup()
        if (onDoctorGpsReady) {
          onDoctorGpsReady(latitude, longitude, city)
        } else {
          const gpsTag = ` [GPS:${latitude.toFixed(5)},${longitude.toFixed(5)}]`
          if (city) onSend(`أريد طبيب في ${city}${gpsTag}`)
          else onSend(`أريد طبيب${gpsTag}`)
        }
      },
      (err) => {
        if (err.code === 1) {
          setModalStep('denied')
          setLoadingMsg('')
        } else {
          setModalStep('error')
          setLoadingMsg('تعذّر تحديد الموقع. تحقق من اتصالك أو أذونات الموقع.')
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  const renderModalBody = () => {
    if (modalStep === 'loading') {
      return (
        <>
          <div className="dzd-doctor-modal-icon">📡</div>
          <h3 className="dzd-doctor-modal-title">جاري تفعيل GPS</h3>
          <div className="dzd-gps-spinner" />
          <p className="dzd-doctor-modal-text" style={{ marginTop: '14px' }}>
            {loadingMsg}
            <br />
            <span style={{ fontSize: '12px', opacity: .72 }}>
              اسمح للمتصفح بالوصول إلى موقعك عند ظهور الطلب
            </span>
          </p>
        </>
      )
    }
    if (modalStep === 'denied') {
      return (
        <>
          <div className="dzd-doctor-modal-icon">🚫</div>
          <h3 className="dzd-doctor-modal-title">تم رفض إذن GPS</h3>
          <p className="dzd-doctor-modal-text">
            لم يُسمح بالوصول إلى موقعك. يمكنك البحث يدوياً عن طبيب بدون موقع.
          </p>
          <div className="dzd-doctor-modal-actions">
            <button type="button" className="dzd-doctor-modal-btn dzd-doctor-modal-btn--secondary" onClick={handleManual}>
              🔍 أبحث يدوياً
            </button>
            <button type="button" className="dzd-doctor-modal-btn dzd-doctor-modal-btn--ghost" onClick={closePopup}>
              إلغاء
            </button>
          </div>
        </>
      )
    }
    if (modalStep === 'error') {
      return (
        <>
          <div className="dzd-doctor-modal-icon">⚠️</div>
          <h3 className="dzd-doctor-modal-title">خطأ في تحديد الموقع</h3>
          <p className="dzd-doctor-modal-text">{loadingMsg}</p>
          <div className="dzd-doctor-modal-actions">
            <button type="button" className="dzd-doctor-modal-btn dzd-doctor-modal-btn--primary" onClick={handleUseGps}>
              🔄 إعادة المحاولة
            </button>
            <button type="button" className="dzd-doctor-modal-btn dzd-doctor-modal-btn--secondary" onClick={handleManual}>
              🔍 أبحث يدوياً
            </button>
          </div>
        </>
      )
    }
    // default: 'ask'
    return (
      <>
        <div className="dzd-doctor-modal-icon">📍</div>
        <h3 id="dzd-doctor-modal-title" className="dzd-doctor-modal-title">تحديد الموقع</h3>
        <p className="dzd-doctor-modal-text">
          هل تريد من DZ Agent تحديد موقعك لمعرفة الأطباء الأقرب إليك؟
        </p>
        <div className="dzd-doctor-modal-actions">
          <button type="button" className="dzd-doctor-modal-btn dzd-doctor-modal-btn--primary" onClick={handleUseGps}>
            📍 نعم، حدد موقعي
          </button>
          <button type="button" className="dzd-doctor-modal-btn dzd-doctor-modal-btn--secondary" onClick={handleManual}>
            🔍 سأبحث يدوياً
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="dzd-section dzd-section--doctor">
      <button
        type="button"
        className="dzd-doctor-card"
        onClick={openPopup}
        disabled={showPopup}
        aria-label="ابحث عن طبيب قريب منك"
      >
        <span className="dzd-doctor-icon">🔎</span>
        <span className="dzd-doctor-text">
          <span className="dzd-doctor-title">نحوس على طبيب؟</span>
          <span className="dzd-doctor-sub">GPS اختياري — للبحث قرب موقعك</span>
        </span>
        <span className="dzd-doctor-arrow">›</span>
      </button>

      {showPopup && (
        <div
          className="dzd-doctor-modal-backdrop"
          onClick={modalStep === 'ask' ? closePopup : undefined}
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
            {renderModalBody()}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DZDashboard({ onSend, onDoctorGpsReady }: {
  onSend: (q: string, context?: DashboardContext) => void
  onDoctorGpsReady?: (lat: number, lon: number, city: string) => void
}) {
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

  const [standingsData, setStandingsData] = useState<{ standings: { rank: string; team: string; played: string; wins: string; draws: string; losses: string; points: string }[]; source: string; fetchedAt: string } | null>(null)
  const [standingsLoading, setStandingsLoading] = useState(false)

  const [globalLeagues, setGlobalLeagues] = useState<{ leagues: { name: string; matches: { homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null; statusType: string; startTime: string; link: string }[] }[]; date: string; source: string } | null>(null)
  const [globalLoading, setGlobalLoading] = useState(false)

  // Welcome toast
  const [welcomeCity, setWelcomeCity] = useState<string | null>(null)
  const [welcomeVisible, setWelcomeVisible] = useState(false)

  const [dollarData, setDollarData] = useState<{ usd: number; eur: number; gbp: number; trend: string; updatedAt: string; source: string } | null>(null)
  const [dollarLoading, setDollarLoading] = useState(false)

  const [activeSection, setActiveSection] = useState<'prayer' | 'weather' | 'news' | 'sports' | 'standings' | 'global' | 'tech' | 'currency' | 'quran' | 'dollar' | 'national' | 'wc2026'>('prayer')

  // WC2026 scoreboard — يُخفى تلقائياً بعد 19 يوليو 2026
  const WC2026_END = new Date('2026-07-20T00:00:00Z')
  const wc2026Active = new Date() < WC2026_END
  const [wc2026Matches, setWc2026Matches] = useState<any[]>([])
  const [wc2026Loading, setWc2026Loading] = useState(false)
  const [wc2026Date, setWc2026Date] = useState<string>('')
  const [wc2026IsNext, setWc2026IsNext] = useState(false)
  // نتائج البارحة
  const [wc2026Yesterday, setWc2026Yesterday] = useState<any[]>([])
  const [wc2026YesterdayDate, setWc2026YesterdayDate] = useState<string>('')
  const [wc2026YesterdayLoading, setWc2026YesterdayLoading] = useState(false)
  const [wc2026YesterdayOpen, setWc2026YesterdayOpen] = useState(false)
  const [nationalTeamNews, setNationalTeamNews] = useState<NewsItem[]>([])
  const [nationalLoading, setNationalLoading]   = useState(false)
  const [nationalBadge, setNationalBadge]       = useState(false)

  const saveCity = useCallback((city: string) => {
    try { localStorage.setItem(STORAGE_KEY, city) } catch {}
    setSelectedCity(city)
  }, [])

  const loadNationalTeamNews = useCallback(async (opts: { force?: boolean } = {}) => {
    setNationalLoading(true)
    try {
      const url = opts.force ? '/api/national-team/news?bypassCache=1' : '/api/national-team/news'
      const r = await fetch(url)
      if (!r.ok) throw new Error(`National team API error: ${r.status}`)
      const d = await r.json()
      setNationalTeamNews(d.items || [])
    } catch (err) {
      console.error('[DZDashboard] loadNationalTeamNews failed:', err)
    } finally {
      setNationalLoading(false)
    }
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

  const loadWeather = useCallback(async (city: string, coords?: { lat: number; lon: number }) => {
    setWeatherLoading(true)
    try {
      const url = coords
        ? `/api/dz-agent/weather?lat=${coords.lat}&lon=${coords.lon}`
        : `/api/dz-agent/weather?city=${encodeURIComponent(city)}`
      const result = await withRetry(async () => {
        const r = await fetch(url)
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

  const loadPrayer = useCallback(async (city: string, coords?: { lat: number; lon: number }) => {
    setPrayerLoading(true)
    try {
      const url = coords
        ? `/api/dz-agent/prayer?lat=${coords.lat}&lon=${coords.lon}`
        : `/api/dz-agent/prayer?city=${encodeURIComponent(city)}`
      const result = await withRetry(async () => {
        const r = await fetch(url)
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

  const loadWC2026 = useCallback(async () => {
    if (!wc2026Active) return
    setWc2026Loading(true)
    try {
      const r = await fetch('/api/wc2026/today')
      if (r.ok) {
        const d = await r.json()
        if (d.active) {
          setWc2026Matches(d.matches || [])
          setWc2026Date(d.date || '')
          setWc2026IsNext(!!d.isNextDay)
        }
      }
    } catch { /* ignore */ }
    finally { setWc2026Loading(false) }
  }, [wc2026Active])

  const loadWC2026Yesterday = useCallback(async () => {
    if (!wc2026Active) return
    setWc2026YesterdayLoading(true)
    try {
      const r = await fetch('/api/wc2026/yesterday')
      if (r.ok) {
        const d = await r.json()
        if (d.active) {
          setWc2026Yesterday(d.matches || [])
          setWc2026YesterdayDate(d.date || '')
        }
      }
    } catch { /* ignore */ }
    finally { setWc2026YesterdayLoading(false) }
  }, [wc2026Active])

  const loadDollar = useCallback(async () => {
    setDollarLoading(true)
    try {
      const r = await fetch('/api/dz-dollar')
      if (r.ok) {
        const d = await r.json()
        setDollarData(d)
      }
    } catch { /* ignore */ }
    finally { setDollarLoading(false) }
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

  // Detect location via browser Geolocation API → backend nearest-wilaya (no external API)
  const detectLocation = useCallback(async () => {
    setGeoLoading(true)
    setGeoError(null)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 5 * 60 * 1000,
        })
      )
      const { latitude: lat, longitude: lon } = position.coords
      const coords = { lat, lon }

      // 1. Ask our backend for the nearest wilaya (pure math, no external API)
      let nearestEn = 'Algiers'
      let nearestAr = 'الجزائر'
      try {
        const geoR = await fetch(`/api/dz-agent/reverse-geocode?lat=${lat}&lon=${lon}`)
        if (geoR.ok) {
          const geoData = await geoR.json()
          if (geoData.en) { nearestEn = geoData.en; nearestAr = geoData.ar }
        }
      } catch { /* silently use default */ }

      // 2. Load prayer & weather directly with GPS coords (most accurate)
      loadPrayer(nearestEn, coords)
      loadWeather(nearestEn, coords)

      // 3. Update selected city for display & persist
      saveCity(nearestEn)
      setWelcomeCity(nearestAr)
      setWelcomeVisible(true)
      setTimeout(() => setWelcomeVisible(false), 4000)
    } catch (err: unknown) {
      if (err instanceof GeolocationPositionError && err.code === 1) {
        setGeoError('لم يتم السماح بالوصول للموقع — فعّل الـ GPS من إعدادات المتصفح')
      } else if (err instanceof GeolocationPositionError && err.code === 3) {
        setGeoError('انتهت مهلة GPS — حاول مرة أخرى')
      } else {
        setGeoError('تعذّر تحديد الموقع')
      }
    } finally {
      setGeoLoading(false)
    }
  }, [loadPrayer, loadWeather, saveCity])

  useEffect(() => {
    loadDashboard()
    loadPrayer(selectedCity)
    loadWeather(selectedCity)
    loadCurrency()
    loadStandings()
    loadGlobalLeagues()
    loadDollar()
    loadNationalTeamNews()
    loadWC2026()
    loadWC2026Yesterday()
  }, [])

  // SSE: listen for national_team_news events from the server
  useEffect(() => {
    let es: EventSource | null = null
    function connect() {
      es = new EventSource('/api/breaking-news/stream')
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          if (d.type === 'national_team_news' && Array.isArray(d.items) && d.items.length > 0) {
            setNationalTeamNews(prev => {
              const existing = new Set(prev.map(x => x.title))
              const fresh = d.items.filter((x: NewsItem) => !existing.has(x.title))
              if (fresh.length === 0) return prev
              return [...fresh, ...prev].slice(0, 15)
            })
            setNationalBadge(true)
          }
        } catch {}
      }
      es.onerror = () => { es?.close(); setTimeout(connect, 30_000) }
    }
    connect()
    return () => { es?.close() }
  }, [])

  const tabs: { key: typeof activeSection; label: string; icon: React.ReactNode; isNav?: boolean }[] = [
    { key: 'quran'    as const, label: 'القرآن',         icon: <BookOpen    size={12} />, isNav: true },
    { key: 'prayer'   as const, label: 'الصلاة',         icon: <Moon        size={12} /> },
    { key: 'weather'  as const, label: 'الطقس',          icon: <Cloud       size={12} /> },
    ...(wc2026Active ? [{ key: 'wc2026' as const, label: '🏆 كأس العالم', icon: <Trophy size={12} /> }] : []),
    { key: 'news'     as const, label: 'الأخبار',        icon: <Newspaper   size={12} /> },
    { key: 'dollar'   as const, label: 'سوق الصرف',     icon: <DollarSign  size={12} /> },
    { key: 'national' as const, label: 'المنتخب 🇩🇿',     icon: <Radio       size={12} /> },
    { key: 'sports'   as const, label: 'الدوري',         icon: <Trophy      size={12} /> },
    { key: 'standings'as const, label: 'الترتيب',        icon: <BarChart2   size={12} /> },
    { key: 'global'   as const, label: 'عالمي',          icon: <Globe       size={12} /> },
    { key: 'tech'     as const, label: 'تقنية',          icon: <Cpu         size={12} /> },
    { key: 'currency' as const, label: 'الصرف',          icon: <ArrowLeftRight size={12} /> },
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
              data-tab={tab.key}
              className={`dzd-tab ${activeSection === tab.key ? 'dzd-tab--active' : ''} ${tab.key === 'quran' ? 'dzd-tab--quran' : ''}`}
              onClick={() => {
                if (tab.key === 'quran') {
                  navigate('/aiquran')
                  return
                }
                if (tab.key === 'national') setNationalBadge(false)
                setActiveSection(tab.key)
              }}
            >
              <span className="dzd-tab-icon" style={{ position: 'relative' }}>
                {tab.icon}
                {tab.key === 'national' && nationalBadge && (
                  <span style={{ position:'absolute', top:-3, right:-3, width:7, height:7, background:'#22c55e', borderRadius:'50%', border:'1px solid var(--dzd-bg)' }} />
                )}
              </span>
              <span className="dzd-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
        <button
          className="dzd-refresh-btn"
          onClick={() => { loadDashboard({ force: true }); loadPrayer(selectedCity); loadWeather(selectedCity); loadCurrency(); loadStandings(); loadGlobalLeagues({ force: true }); loadDollar() }}
          title="تحديث"
        >
          <RefreshCw size={13} className={(loading || prayerLoading || weatherLoading || currencyLoading || standingsLoading || globalLoading) ? 'dzd-spin' : ''} />
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
                      <span className="dzd-prayer-card-icon">{PRAYER_ICON_CMP[name] || <Clock size={16} />}</span>
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
                onClick={() => onSend(`حالة الطقس في ${getArName(selectedCity)} اليوم`, { priority: 'weather', city: selectedCity, cityAr: getArName(selectedCity) })}
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
                <div className="dzd-loop-wrap">
                  <div className="dzd-loop">
                    <div className="dzd-loop-ring" />
                    <div className="dzd-loop-dot dzd-loop-dot--1" />
                    <div className="dzd-loop-dot dzd-loop-dot--2" />
                    <div className="dzd-loop-dot dzd-loop-dot--3" />
                  </div>
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
                  <div key={i} className="dzd-news-card" onClick={() => onSend(`لخّص لي هذا الخبر وأعطني أبرز تفاصيله:\n"${item.title}"`)}>
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
            <div className="dzd-sports-header-bar">
              <button className="dzd-sports-action-btn" onClick={() => onSend('ما هو ترتيب الدوري الجزائري المحترف؟')}>
                <BarChart2 size={13} /> الترتيب
              </button>
              <button className="dzd-sports-action-btn" onClick={() => onSend('ما هي مباريات الدوري الجزائري القادمة؟')}>
                <CalendarDays size={13} /> القادمة
              </button>
              <button className="dzd-sports-action-btn" onClick={() => onSend('ما هي نتائج مباريات الدوري الجزائري الأخيرة؟')}>
                <CheckCircle2 size={13} /> النتائج
              </button>
            </div>
            {loading ? (
              <div className="dzd-match-list">
                {[...Array(4)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--match" />)}
              </div>
            ) : (visibleMatches.length === 0 && data?.sports?.length === 0) ? (
              <div className="dzd-empty-state">
                <p>لا توجد مبارايات حاليا</p>
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
                      <div key={i} className="dzd-news-card dzd-news-card--sport" onClick={() => onSend(`أعطني ملخصاً عن هذا الخبر الرياضي:\n"${item.title}"`)}>
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
              <span style={{ display:'flex', alignItems:'center', gap:'6px', color:'var(--dzd-accent)', fontWeight:700 }}><BarChart2 size={13} /> ترتيب الدوري الجزائري المحترف</span>
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
              <span style={{ display:'flex', alignItems:'center', gap:'6px', color:'var(--dzd-accent)', fontWeight:700 }}><Globe size={13} /> الدوريات العالمية — {globalLeagues?.date || new Date().toLocaleDateString('ar-DZ')}</span>
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
            <div className="dzd-league-filter-bar">
              {['بريميرليغ', 'ليغا', 'تشامبيونز ليغ', 'بوندسليغا', 'سيريا إيه'].map(league => (
                <button key={league} className="dzd-league-filter-btn" onClick={() => onSend(`مباريات ${league} اليوم`)}>
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
                    <div className="dzd-league-title">
                      <Layers size={12} /> {league.name}
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
                          <div className="dzd-live-badge"><Radio size={9} /> جارية الآن</div>
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

        {/* ===== DOLLAR BLACK MARKET ===== */}
        {activeSection === 'dollar' && (
          <div className="dzd-dollar-panel">
            <div className="dzd-dollar-header">
              <span className="dzd-dollar-title"><DollarSign size={15} /> سوق الصرف — الدينار الجزائري</span>
              <button className="dzd-retry-btn" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={loadDollar} disabled={dollarLoading}>
                <RefreshCw size={10} className={dollarLoading ? 'dzd-spin' : ''} />
                {dollarLoading ? 'جاري...' : 'تحديث'}
              </button>
            </div>

            {dollarLoading ? (
              <div className="dzd-dollar-grid">
                {[...Array(3)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--currency" />)}
              </div>
            ) : dollarData ? (
              <>
                <div className="dzd-dollar-grid">
                  {[
                    { code: 'USD', label: 'دولار أمريكي', icon: '🇺🇸', rate: dollarData.usd },
                    { code: 'EUR', label: 'يورو', icon: '🇪🇺', rate: dollarData.eur },
                    { code: 'GBP', label: 'جنيه إسترليني', icon: '🇬🇧', rate: dollarData.gbp },
                  ].map(c => (
                    <div key={c.code} className="dzd-dollar-card" onClick={() => onSend(`سعر ${c.code} مقابل الدينار في السوق الموازية`)}>
                      <div className="dzd-dollar-card-flag">{c.icon}</div>
                      <div className="dzd-dollar-card-code">{c.code}</div>
                      <div className="dzd-dollar-card-name">{c.label}</div>
                      <div className="dzd-dollar-card-rate">{c.rate ? `${c.rate} دج` : '—'}</div>
                      <div className="dzd-dollar-card-sub">1 {c.code}</div>
                    </div>
                  ))}
                </div>
                <div className="dzd-dollar-trend">
                  <span>{dollarData.trend || '📊 البيانات محدّثة'}</span>
                </div>
                <div className="dzd-dollar-updated">
                  المصدر: {dollarData.source || 'حساب تقديري'} — {dollarData.updatedAt ? new Date(dollarData.updatedAt).toLocaleTimeString('ar-DZ') : ''}
                </div>
              </>
            ) : (
              <div className="dzd-dollar-fallback">
                <div className="dzd-dollar-disclaimer">
                  📊 أسعار السوق تتغير يومياً. اسأل DZ Agent للحصول على آخر الأسعار.
                </div>
                <div className="dzd-dollar-questions">
                  {['كم سعر الدولار اليوم بالدينار؟', 'ما سعر صرف اليورو في السوق الموازية؟', 'تحليل تطور سعر الدولار هذا الشهر'].map(q => (
                    <button key={q} className="dzd-retry-btn" style={{ fontSize: 11, margin: '3px', padding: '5px 10px' }} onClick={() => onSend(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="dzd-dollar-info">
              <div className="dzd-dollar-info-title"><TrendingUp size={13} /> أسئلة شائعة</div>
              <div className="dzd-dollar-qa-list">
                {[
                  'كم سعر الدولار الأسود اليوم؟',
                  'مقارنة سعر الصرف الرسمي والموازي',
                  'هل سيرتفع سعر الدولار قريباً؟',
                  'أفضل طريقة لتحويل الأموال للجزائر',
                  'سعر درهم الإمارات مقابل الدينار',
                ].map(q => (
                  <button key={q} className="dzd-dollar-qa-btn" onClick={() => onSend(q)}>
                    <TrendingUp size={11} /> {q}
                  </button>
                ))}
              </div>
            </div>
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
                <div className="dzd-loop-wrap">
                  <div className="dzd-loop">
                    <div className="dzd-loop-ring" />
                    <div className="dzd-loop-dot dzd-loop-dot--1" />
                    <div className="dzd-loop-dot dzd-loop-dot--2" />
                    <div className="dzd-loop-dot dzd-loop-dot--3" />
                  </div>
                </div>
                {[...Array(5)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--news" />)}
              </div>
            ) : (!data?.tech || data.tech.length === 0) ? (
              <div className="dzd-empty-state">لا توجد أخبار تقنية</div>
            ) : (
              <div className="dzd-news-list">
                {(data.tech).map((item, i) => (
                  <div key={i} className="dzd-news-card dzd-news-card--tech" onClick={() => onSend(`أعطني ملخصاً عن هذا الخبر التقني:\n"${item.title}"`)}>
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

        {/* ===== NATIONAL TEAM — المنتخب الجزائري ===== */}
        {activeSection === 'national' && (
          <div className="dzd-news-panel">

            {/* ── رأس البطاقة ──────────────────────────────────────── */}
            <div style={{ direction:'rtl', marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <span style={{ fontSize:15, fontWeight:800, color:'#22c55e', display:'flex', alignItems:'center', gap:6 }}>
                    🇩🇿 المنتخب الجزائري
                  </span>
                  <span style={{ fontSize:10, color:'#6b8f71', letterSpacing:'0.04em' }}>
                    الخضر · محاربو الصحراء · الفريق الوطني
                  </span>
                </div>
                <button
                  className="dzd-retry-btn"
                  style={{ fontSize:'10px', padding:'3px 10px', display:'inline-flex', alignItems:'center', gap:'4px' }}
                  onClick={() => loadNationalTeamNews({ force: true })}
                  disabled={nationalLoading}
                  title="تحديث أخبار المنتخب"
                >
                  <RefreshCw size={11} className={nationalLoading ? 'dzd-spin' : ''} />
                  {nationalLoading ? 'جاري…' : 'تحديث'}
                </button>
              </div>

              {/* ── أزرار البرومبتات السريعة ─────────────────────── */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:4 }}>
                {[
                  { label:'⚽ أخبار الخضر',           prompt:'أعطني آخر أخبار الخضر المنتخب الجزائري اليوم' },
                  { label:'🏜️ محاربو الصحراء',        prompt:'آخر أخبار محاربو الصحراء المنتخب الجزائري' },
                  { label:'🌍 الفريق الوطني',          prompt:'أخبار الفريق الوطني الجزائري اليوم' },
                  { label:'📅 المباراة القادمة',        prompt:'ما هي المباراة القادمة للمنتخب الجزائري؟ الموعد والمنافس' },
                  { label:'📊 تصفيات كأس العالم',       prompt:'ما هو وضع المنتخب الجزائري في تصفيات كأس العالم؟ النتائج والترتيب' },
                  { label:'🏆 آخر نتائج المنتخب',       prompt:'آخر نتائج مباريات المنتخب الجزائري هذا الشهر' },
                  { label:'👥 قائمة المنتخب',           prompt:'قائمة المنتخب الجزائري الأخيرة — من تم استدعاؤه؟' },
                  { label:'⭐ أبرز لاعبي الخضر',        prompt:'من هم أبرز لاعبي المنتخب الجزائري حالياً؟' },
                ].map(({ label, prompt }) => (
                  <button
                    key={label}
                    onClick={() => onSend(prompt)}
                    style={{
                      background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.22)',
                      borderRadius:20, padding:'5px 12px', fontSize:11, fontWeight:600,
                      color:'#4ade80', cursor:'pointer', fontFamily:'inherit', direction:'rtl',
                      transition:'all .18s', whiteSpace:'nowrap',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(34,197,94,0.18)'; (e.currentTarget as HTMLButtonElement).style.borderColor='rgba(34,197,94,0.5)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(34,197,94,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor='rgba(34,197,94,0.22)' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── قائمة الأخبار ─────────────────────────────────── */}
            {nationalLoading ? (
              <div className="dzd-news-list">
                {[...Array(6)].map((_, i) => <div key={i} className="dzd-skeleton dzd-skeleton--news" />)}
              </div>
            ) : nationalTeamNews.length === 0 ? (
              <div className="dzd-empty-state">
                <span className="dzd-empty-icon">🇩🇿</span>
                <p>لا توجد أخبار حالياً</p>
                <button className="dzd-retry-btn" onClick={() => loadNationalTeamNews({ force: true })}>
                  <RefreshCw size={12} /> إعادة المحاولة
                </button>
                <div style={{ marginTop:10, display:'flex', flexWrap:'wrap', gap:5, justifyContent:'center' }}>
                  {['أخبار الخضر اليوم','المباراة القادمة للمنتخب','قائمة المنتخب الجزائري'].map(q => (
                    <button key={q} className="dzd-retry-btn" style={{ fontSize:'10px' }} onClick={() => onSend(q)}>{q}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="dzd-news-list">
                {nationalTeamNews.map((item, i) => (
                  <div
                    key={i}
                    className="dzd-news-card dzd-news-card--national"
                    onClick={() => onSend(`أعطني ملخصاً وتحليلاً لهذا الخبر الرياضي:\n"${item.title}"\nالمصدر: ${item.feedName || 'أخبار المنتخب'}`)}
                  >
                    <div className="dzd-news-card-left">
                      <span className="dzd-news-source dzd-news-source--national">
                        <Radio size={9} /> {item.feedName || 'المنتخب 🇩🇿'}
                      </span>
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
                <div style={{ textAlign:'center', paddingTop:8 }}>
                  <button
                    className="dzd-retry-btn"
                    style={{ fontSize:'10px', display:'inline-flex', alignItems:'center', gap:4 }}
                    onClick={() => onSend('أعطني ملخصاً شاملاً لآخر أخبار المنتخب الجزائري اليوم من جميع المصادر')}
                  >
                    📋 ملخص شامل لأخبار المنتخب
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== WC2026 SCOREBOARD ===== */}
        {activeSection === 'wc2026' && wc2026Active && (
          <div style={{ padding: '8px 4px', direction: 'rtl' }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 12, padding: '10px 14px',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.12) 100%)',
              borderRadius: 14, border: '1px solid rgba(99,102,241,0.25)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>🏆</span>
                <div>
                  <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13 }}>كأس العالم FIFA 2026</div>
                  {wc2026Date && (
                    <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                      {wc2026IsNext ? '📅 مباريات القادمة' : '📅 مباريات اليوم'} — {new Date(wc2026Date + 'T12:00:00Z').toLocaleDateString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Algiers' })}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={loadWC2026}
                disabled={wc2026Loading}
                style={{
                  background: 'transparent', border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 8, padding: '4px 8px', color: '#a5b4fc',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                }}
              >
                <RefreshCw size={11} className={wc2026Loading ? 'dzd-spin' : ''} />
                تحديث
              </button>
            </div>

            {/* Matches */}
            {wc2026Loading ? (
              <div className="dzd-skeleton-grid">
                {[...Array(3)].map((_, i) => <div key={i} className="dzd-skeleton" style={{ height: 120, borderRadius: 16, marginBottom: 8 }} />)}
              </div>
            ) : wc2026Matches.length > 0 ? (
              <WC2026MatchCard
                matches={wc2026Matches}
                autoRefresh={true}
                refreshInterval={60000}
                compact={true}
              />
            ) : (
              <div className="dzd-empty-state">
                <span className="dzd-empty-icon">⚽</span>
                <p>لا توجد مباريات متاحة حالياً</p>
                <button className="dzd-retry-btn" onClick={loadWC2026}>
                  <RefreshCw size={12} /> إعادة المحاولة
                </button>
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
                  {['مباريات اليوم في كأس العالم 2026', 'جدول مباريات كأس العالم', 'المنتخب الجزائري كأس العالم'].map(q => (
                    <button key={q} className="dzd-retry-btn" style={{ fontSize: 10 }} onClick={() => onSend(q)}>{q}</button>
                  ))}
                </div>
              </div>
            )}

            {/* ── نتائج البارحة — accordion ────────────────────────── */}
            {wc2026Yesterday.length > 0 && (
              <div style={{ marginTop: 10, direction: 'rtl' }}>
                {/* زر فتح/إغلاق */}
                <button
                  onClick={() => {
                    setWc2026YesterdayOpen(o => !o)
                    if (!wc2026YesterdayOpen && wc2026Yesterday.length === 0) loadWC2026Yesterday()
                  }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: wc2026YesterdayOpen ? '10px 10px 0 0' : 10,
                    padding: '7px 12px', cursor: 'pointer', color: '#94a3b8',
                    fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13 }}>📅</span>
                    نتائج البارحة
                    {wc2026YesterdayDate && (
                      <span style={{ color: '#475569', fontSize: 9.5, marginRight: 4 }}>
                        — {new Date(wc2026YesterdayDate + 'T12:00:00Z').toLocaleDateString('ar-DZ', {
                          weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Algiers',
                        })}
                      </span>
                    )}
                    <span style={{
                      background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.3)',
                      color: '#a5b4fc', borderRadius: 20, padding: '0 6px', fontSize: 9, fontWeight: 700,
                    }}>
                      {wc2026Yesterday.length}
                    </span>
                  </span>
                  <span style={{ fontSize: 12, transition: 'transform 0.2s', transform: wc2026YesterdayOpen ? 'rotate(180deg)' : 'none' }}>
                    ▾
                  </span>
                </button>

                {/* محتوى الأكورديون */}
                {wc2026YesterdayOpen && (
                  <div style={{
                    background: 'rgba(5,5,18,0.6)', border: '1px solid rgba(255,255,255,0.07)',
                    borderTop: 'none', borderRadius: '0 0 10px 10px',
                    padding: '7px 8px 8px',
                  }}>
                    {wc2026YesterdayLoading ? (
                      <div style={{ textAlign: 'center', color: '#475569', fontSize: 10, padding: '8px 0' }}>
                        ⏳ جاري التحميل...
                      </div>
                    ) : (
                      <WC2026MatchCard
                        matches={wc2026Yesterday}
                        autoRefresh={false}
                        compact={true}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Footer links */}
            <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                { label: '🌐 FIFA الرسمي', url: 'https://www.fifa.com/worldcup' },
                { label: '📊 FotMob', url: 'https://www.fotmob.com/tournaments/77/overview/world-cup' },
                { label: '📱 kooora', url: 'https://www.kooora.com/?wc2026' },
              ].map(l => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: '#818cf8', fontSize: 11, textDecoration: 'none', padding: '3px 10px', borderRadius: 8, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* DOCTOR SEARCH ENTRY ── pinned at bottom of dashboard */}
        <DoctorSearchCard onSend={onSend} onDoctorGpsReady={onDoctorGpsReady} />

      </div>
    </div>
  )
}
