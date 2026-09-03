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

// ═══════════════════════════════════════════════════════════════════════
// Browser-side RSS parser & free API fetchers
// These run directly in the browser to bypass broken Express/Worker bridge
// ═══════════════════════════════════════════════════════════════════════

function decodeXmlText(value = ''): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

function parseRssItems(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = []
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null
  while ((m = itemRegex.exec(xml)) !== null && items.length < 10) {
    const block = m[1]
    const get = (tag: string): string => {
      const found = block.match(
        new RegExp(
          `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
          'i',
        ),
      )
      return found ? decodeXmlText(found[1]) : ''
    }
    const title = get('title')
    if (!title) continue
    const link = get('link') ||
      (block.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || ''
    items.push({
      title,
      link,
      description: get('description'),
      pubDate: get('pubDate') || get('dc:date') || '',
      source: sourceName,
      feedName: sourceName,
    })
  }
  return items
}

const ALGERIA_NEWS_FEEDS = [
  { name: 'Google أخبار الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: 'Google الجزائر أخبار عامة', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: 'SkyNews Arabia', url: 'https://www.skynewsarabia.com/rss/feed' },
  { name: 'RT Arabic', url: 'https://arabic.rt.com/rss/' },
  { name: 'DW Arabic', url: 'https://rss.dw.com/xml/rss-ar-all' },
]

const TECH_NEWS_FEEDS = [
  { name: 'TechArabic', url: 'https://news.google.com/rss/search?q=%D8%AA%D9%82%D9%86%D9%8A%D8%A9+%D8%A7%D9%84%D8%B1%D8%A7%D8%A6%D8%B9&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: 'Google Tech', url: 'https://news.google.com/rss/search?q=technology+OR+%D8%A3%D8%AC%D9%87%D8%B2%D8%A9&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: 'Arabic Tech', url: 'https://news.google.com/rss/search?q=%D8%AA%D9%82%D9%86%D9%8A%D8%A7%D8%AA+%D8%A7%D9%84%D8%B1%D8%A7%D8%A6%D8%B9&hl=ar&gl=DZ&ceid=DZ:ar' },
]

const SPORTS_NEWS_FEEDS = [
  { name: '🏆 رياضة', url: 'https://news.google.com/rss/search?q=%D8%B1%D9%8A%D8%A7%D8%B6%D8%A9+%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: '⚽ الدوري', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AF%D9%88%D8%B1%D9%8A+%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A7%D9%84%D9%85%D8%AD%D8%AA%D8%B1%D9%81&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: '⚽ عربي', url: 'https://news.google.com/rss/search?q=%D9%83%D8%B1%D8%A9+%D8%A7%D9%84%D9%82%D8%AF%D9%85+%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A+%D8%A7%D9%84%D9%85%D8%AD%D8%AA%D8%B1%D9%81&hl=ar&gl=DZ&ceid=DZ:ar' },
]

async function fetchRssFeed(feed: { name: string; url: string }): Promise<NewsItem[]> {
  // Route all RSS fetches through a CORS proxy to avoid browser CORS blocks
  // on Algerian news sites that don't send Access-Control-Allow-Origin headers
  const CORS_PROXY = 'https://api.allorigins.win/raw?url='
  const proxyUrl = CORS_PROXY + encodeURIComponent(feed.url)
  const urls = [proxyUrl, feed.url] // try proxy first, then direct
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: { 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' },
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok) continue
      const xml = await resp.text()
      if (!xml || xml.length < 50) continue
      const items = parseRssItems(xml, feed.name)
      if (items.length > 0) return items
    } catch { /* try next URL */ }
  }
  return []
}

async function fetchAllRss(feeds: { name: string; url: string }[]): Promise<NewsItem[]> {
  const results = await Promise.allSettled(feeds.map(f => fetchRssFeed(f)))
  const seen = new Set<string>()
  return results
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(item => {
      const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0
      const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0
      return tb - ta
    })
    .slice(0, 30)
}

// ═══════════════════════════════════════════════════════════════════════
// Free currency API (fawazahmed0 — CORS-enabled, no key needed)
// ═══════════════════════════════════════════════════════════════════════

async function fetchCurrencyFree(): Promise<CurrencyData> {
  try {
    const resp = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json',
      { signal: AbortSignal.timeout(8000) }
    )
    if (!resp.ok) throw new Error(`Currency API: ${resp.status}`)
    const data = await resp.json()
    // fawazahmed0 returns rates as base=EUR, so we convert to base=DZD
    // Actually use DZD as base directly:
    const dzdResp = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/dzd.json',
      { signal: AbortSignal.timeout(8000) }
    )
    if (!dzdResp.ok) throw new Error(`Currency API DZD: ${dzdResp.status}`)
    const dzdData = await dzdResp.json()
    const rates: Record<string, number> = {}
    const targets = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'TND', 'MAD', 'EGP', 'QAR', 'KWD', 'CAD', 'CHF', 'CNY', 'TRY', 'JPY']
    for (const code of targets) {
      if (dzdData.dzd?.[code]) {
        // fawazahmed0 returns 1 DZD = X foreign, invert to get foreign = Y DZD
        rates[code] = dzdData.dzd[code]
      }
    }
    return {
      base: 'DZD',
      provider: 'fawazahmed0/currency-api',
      rates,
      status: 'live',
      last_update: dzdData.date || new Date().toISOString().split('T')[0],
    }
  } catch {
    return { base: 'DZD', provider: 'unavailable', rates: {}, status: 'unavailable' }
  }
}

async function fetchLfpFree(): Promise<{ matches: MatchItem[]; articles: { title: string; link: string; date?: string }[]; fetchedAt: string; source: string }> {
  try {
    // Try fetching LFP RSS or news
    const items = await fetchRssFeed({
      name: 'LFP',
      url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AF%D9%88%D8%B1%D9%8A+%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1%D9%8A+%D8%A7%D9%84%D9%85%D8%AD%D8%AA%D8%B1%D9%81+%D9%85%D8%A8%D8%A7%D8%B1%D9%8A%D8%A7%D8%AA&hl=ar&gl=DZ&ceid=DZ:ar',
    })
    return {
      matches: [],
      articles: items.slice(0, 5).map(item => ({
        title: item.title,
        link: item.link,
        date: item.pubDate,
      })),
      fetchedAt: new Date().toISOString(),
      source: 'Google News (LFP)',
    }
  } catch {
    return { matches: [], articles: [], fetchedAt: new Date().toISOString(), source: 'unavailable' }
  }
}

async function fetchStandingsFree(): Promise<{ standings: { rank: string; team: string; played: string; wins: string; draws: string; losses: string; points: string }[]; source: string; fetchedAt: string }> {
  // Standings data is very hard to get from free APIs
  // Return empty so the component shows its "retry" state
  return { standings: [], source: 'unavailable', fetchedAt: new Date().toISOString() }
}

async function fetchGlobalLeaguesFree(): Promise<{ leagues: { name: string; matches: { homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null; statusType: string; startTime: string; link: string }[] }[]; date: string; source: string } | null> {
  // Global leagues data needs specialized API
  return null
}

// ═══════════════════════════════════════════════════════════════════════
// Free Weather API (Open-Meteo — no key, CORS-enabled)
// ═══════════════════════════════════════════════════════════════════════

const WILAYA_COORDS: Record<string, { lat: number; lon: number }> = {
  'Adrar': { lat: 27.87, lon: -0.29 }, 'Chlef': { lat: 36.17, lon: 1.33 },
  'Laghouat': { lat: 33.80, lon: 2.88 }, 'Oum el Bouaghi': { lat: 35.87, lon: 7.11 },
  'Batna': { lat: 35.56, lon: 6.17 }, 'Bejaia': { lat: 36.75, lon: 5.08 },
  'Biskra': { lat: 34.85, lon: 5.73 }, 'Bechar': { lat: 31.62, lon: -2.22 },
  'Blida': { lat: 36.47, lon: 2.83 }, 'Bouira': { lat: 36.38, lon: 3.90 },
  'Tamanrasset': { lat: 22.79, lon: 5.52 }, 'Tebessa': { lat: 35.40, lon: 8.12 },
  'Tlemcen': { lat: 34.88, lon: -1.31 }, 'Tiaret': { lat: 35.37, lon: 1.32 },
  'Tizi Ouzou': { lat: 36.71, lon: 4.05 }, 'Algiers': { lat: 36.75, lon: 3.06 },
  'Djelfa': { lat: 34.67, lon: 3.25 }, 'Jijel': { lat: 36.82, lon: 5.77 },
  'Setif': { lat: 36.19, lon: 5.41 }, 'Saida': { lat: 34.83, lon: 0.15 },
  'Skikda': { lat: 36.88, lon: 6.91 }, 'Sidi bel Abbes': { lat: 35.19, lon: -0.63 },
  'Annaba': { lat: 36.90, lon: 7.77 }, 'Guelma': { lat: 36.46, lon: 7.43 },
  'Constantine': { lat: 36.37, lon: 6.61 }, 'Medea': { lat: 36.27, lon: 2.75 },
  'Mostaganem': { lat: 35.93, lon: 0.09 }, 'Msila': { lat: 35.70, lon: 4.54 },
  'Mascara': { lat: 35.40, lon: 0.14 }, 'Ouargla': { lat: 31.95, lon: 5.33 },
  'Oran': { lat: 35.69, lon: -0.63 }, 'El Bayadh': { lat: 33.68, lon: 1.02 },
  'Illizi': { lat: 26.50, lon: 8.47 }, 'Bordj Bou Arreridj': { lat: 36.07, lon: 4.76 },
  'Boumerdes': { lat: 36.75, lon: 3.47 }, 'El Tarf': { lat: 36.77, lon: 8.31 },
  'Tindouf': { lat: 27.67, lon: -8.14 }, 'Tissemsilt': { lat: 35.61, lon: 1.81 },
  'El Oued': { lat: 33.35, lon: 6.86 }, 'Khenchela': { lat: 35.44, lon: 7.14 },
  'Souk Ahras': { lat: 36.29, lon: 7.95 }, 'Tipaza': { lat: 36.59, lon: 2.45 },
  'Mila': { lat: 36.45, lon: 6.26 }, 'Ain Defla': { lat: 36.18, lon: 1.97 },
  'Naama': { lat: 33.27, lon: -0.31 }, 'Ain Temouchent': { lat: 35.30, lon: -1.14 },
  'Ghardaia': { lat: 32.49, lon: 3.67 }, 'Relizane': { lat: 35.74, lon: 0.56 },
  'Timimoun': { lat: 29.26, lon: 0.24 }, 'Bordj Badji Mokhtar': { lat: 21.33, lon: -0.95 },
  'Ouled Djellal': { lat: 34.42, lon: 5.07 }, 'Beni Abbes': { lat: 30.13, lon: -2.17 },
  'In Salah': { lat: 27.19, lon: 2.48 }, 'In Guezzam': { lat: 19.57, lon: 5.77 },
  'Touggourt': { lat: 33.10, lon: 6.06 }, 'Djanet': { lat: 24.55, lon: 9.48 },
  'El Meghaier': { lat: 33.95, lon: 5.93 }, 'El Meniaa': { lat: 30.58, lon: 2.87 },
}

const WMO_CODES: Record<number, string> = {
  0: 'صافي', 1: 'صافي غالباً', 2: 'غائم جزئياً', 3: 'غائم',
  45: 'ضباب', 48: 'ضباب متجمد',
  51: 'رذاذ خفيف', 53: 'رذاذ', 55: 'رذاذ كثيف',
  56: 'رذاذ متجمد', 57: 'رذاذ متجمد كثيف',
  61: 'مطر خفيف', 63: 'مطر', 65: 'مطر غزير',
  66: 'مطر متجمد', 67: 'مطر متجمد غزير',
  71: 'ثلج خفيف', 73: 'ثلج', 75: 'ثلج كثيف',
  77: 'حبيبات ثلج', 80: 'زخات مطر', 81: 'زخات مطر كثيفة', 82: 'عاصفة مطر',
  85: 'زخات ثلج', 86: 'زخات ثلج كثيفة',
  95: 'عاصفة رعدية', 96: 'عاصفة رعدية مع برد', 99: 'عاصفة رعدية مع برد كثيف',
}

async function fetchWeatherFree(city: string, coords?: { lat: number; lon: number }): Promise<WeatherData> {
  try {
    const c = coords || WILAYA_COORDS[city] || WILAYA_COORDS['Algiers']
    const resp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,visibility&daily=temperature_2m_max,temperature_2m_min&timezone=auto`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!resp.ok) throw new Error(`Open-Meteo: ${resp.status}`)
    const d = await resp.json()
    const cur = d.current
    return {
      city,
      temp: cur.temperature_2m ?? null,
      feels_like: cur.apparent_temperature ?? undefined,
      temp_min: d.daily?.temperature_2m_min?.[0] ?? undefined,
      temp_max: d.daily?.temperature_2m_max?.[0] ?? undefined,
      condition: WMO_CODES[cur.weather_code] || 'غير معروف',
      icon: null,
      humidity: cur.relative_humidity_2m ?? undefined,
      wind: cur.wind_speed_10m ?? undefined,
      visibility: cur.visibility ? Math.round(cur.visibility / 1000) : undefined,
    }
  } catch {
    return { city, temp: null, condition: null, icon: null }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Free Prayer API (Aladhan — no key, CORS-enabled)
// ═══════════════════════════════════════════════════════════════════════

const ALGERIA_CITY_COORDS: Record<string, { lat: number; lon: number }> = WILAYA_COORDS

async function fetchPrayerFree(city: string, coords?: { lat: number; lon: number }): Promise<PrayerData> {
  try {
    const c = coords || ALGERIA_CITY_COORDS[city] || ALGERIA_CITY_COORDS['Algiers']
    const resp = await fetch(
      `https://api.aladhan.com/v1/timings/${new Date().toISOString().split('T')[0]}?latitude=${c.lat}&longitude=${c.lon}&method=3`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!resp.ok) throw new Error(`Aladhan: ${resp.status}`)
    const d = await resp.json()
    const t = d.data?.timings || {}
    const dateStr = d.data?.date?.hijri || new Date().toLocaleDateString('ar-DZ')
    return {
      city,
      date: `${dateStr} — ${d.data?.date?.readable || ''}`,
      source: 'aladhan.com',
      times: {
        'الفجر': t.Fajr || '--',
        'الشروق': t.Sunrise || '--',
        'الظهر': t.Dhuhr || '--',
        'العصر': t.Asr || '--',
        'المغرب': t.Maghrib || '--',
        'العشاء': t.Isha || '--',
      },
    }
  } catch {
    return { city, date: '', source: 'unavailable', times: {} }
  }
}

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
    fetchedAt?: string | number
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

type DashboardContext = { priority: 'weather'; city: string }

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

  const [activeSection, setActiveSection] = useState<'prayer' | 'weather' | 'news' | 'sports' | 'standings' | 'global' | 'tech' | 'currency' | 'quran' | 'dollar'>('prayer')

  const saveCity = useCallback((city: string) => {
    try { localStorage.setItem(STORAGE_KEY, city) } catch {}
    setSelectedCity(city)
  }, [])

  const loadDashboard = async (opts: { force?: boolean } = {}) => {
    setLoading(true)
    try {
      // Fetch news, sports, tech, and LFP data directly from free RSS APIs
      // This bypasses the broken Express/Worker bridge for dashboard data
      const [newsItems, sportsItems, techItems, leagueData] = await Promise.allSettled([
        fetchAllRss(ALGERIA_NEWS_FEEDS),
        fetchAllRss(SPORTS_NEWS_FEEDS),
        fetchAllRss(TECH_NEWS_FEEDS),
        fetchLfpFree(),
      ])

      const news = newsItems.status === 'fulfilled' ? newsItems.value : []
      const sportsRaw = sportsItems.status === 'fulfilled' ? sportsItems.value : []
      const tech = techItems.status === 'fulfilled'
        ? techItems.value.map(item => ({
            ...item,
            category: 'تقنية',
            trending_score: 0,
          } as TechItem))
        : []
      const league = leagueData.status === 'fulfilled' ? leagueData.value : null

      // LFP sports news (if league had articles)
      const leagueNews = (league?.articles || []).slice(0, 3).map(item => ({
        title: item.title,
        link: item.link || 'https://lfp.dz',
        description: '',
        pubDate: item.date || '',
        source: '🏆 رابطة LFP',
        feedName: '🏆 رابطة LFP',
      }))

      setData({
        news,
        sports: leagueNews.length > 0 ? leagueNews : sportsRaw,
        tech,
        weather: [],
        lfp: league,
        fetchedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error('[DZDashboard] loadDashboard failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadWeather = useCallback(async (city: string, coords?: { lat: number; lon: number }) => {
    setWeatherLoading(true)
    try {
      // Fetch weather directly from free Open-Meteo API in browser
      // This bypasses the broken Express/Worker bridge for /api/dz-agent/weather
      const result = await fetchWeatherFree(city, coords)
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
      // Fetch prayer times directly from free Aladhan API in browser
      // This bypasses the broken Express/Worker bridge for /api/dz-agent/prayer
      const result = await fetchPrayerFree(city, coords)
      setPrayerData(result)
    } catch (err) {
      console.error('[DZDashboard] loadPrayer failed:', err)
      setPrayerData(null)
    } finally {
      setPrayerLoading(false)
    }
  }, [])

  const loadDollar = useCallback(async () => {
    setDollarLoading(true)
    try {
      // Try backend endpoint first
      try {
        const r = await fetch('/api/dz-dollar', { signal: AbortSignal.timeout(5000) })
        if (r.ok) {
          const d = await r.json()
          setDollarData(d)
          return
        }
      } catch { /* fall through */ }
      // Fallback: use currency API to get USD, EUR, GBP rates
      const curr = await fetchCurrencyFree()
      if (curr.rates?.USD || curr.rates?.EUR || curr.rates?.GBP) {
        setDollarData({
          usd: curr.rates.USD ? +(1 / curr.rates.USD).toFixed(2) : 0,
          eur: curr.rates.EUR ? +(1 / curr.rates.EUR).toFixed(2) : 0,
          gbp: curr.rates.GBP ? +(1 / curr.rates.GBP).toFixed(2) : 0,
          trend: '📊 الأسعار من فورا زهمد (السعر الرسمي)',
          updatedAt: new Date().toISOString(),
          source: 'fawazahmed0/currency-api',
        })
      }
    } catch { /* ignore */ }
    finally { setDollarLoading(false) }
  }, [])

  const loadCurrency = useCallback(async () => {
    setCurrencyLoading(true)
    try {
      // Fetch currency rates directly from free fawazahmed0 API
      // This bypasses the broken Express bridge for /api/currency/latest
      const result = await fetchCurrencyFree()
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
      // Try backend first, fall back to empty data
      try {
        const r = await fetch('/api/dz-agent/standings')
        if (r.ok) {
          const result = await r.json()
          if (result?.standings?.length) {
            setStandingsData(result)
            return
          }
        }
      } catch { /* fall through to free fetch */ }
      const result = await fetchStandingsFree()
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
      // Try backend first, fall back to free fetch
      try {
        const url = opts.force ? '/api/dz-agent/global-leagues?bypassCache=1' : '/api/dz-agent/global-leagues'
        const r = await fetch(url)
        if (r.ok) {
          const result = await r.json()
          if (result?.leagues?.length) {
            setGlobalLeagues(result)
            return
          }
        }
      } catch { /* fall through to free fetch */ }
      const result = await fetchGlobalLeaguesFree()
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
  }, [])

  const tabs: { key: typeof activeSection; label: string; icon: React.ReactNode; isNav?: boolean }[] = [
    { key: 'quran'    as const, label: 'القرآن',         icon: <BookOpen    size={12} />, isNav: true },
    { key: 'prayer'   as const, label: 'الصلاة',         icon: <Moon        size={12} /> },
    { key: 'weather'  as const, label: 'الطقس',          icon: <Cloud       size={12} /> },
    { key: 'news'     as const, label: 'الأخبار',        icon: <Newspaper   size={12} /> },
    { key: 'dollar'   as const, label: 'سوق الصرف',     icon: <DollarSign  size={12} /> },
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
                setActiveSection(tab.key)
              }}
            >
              <span className="dzd-tab-icon">{tab.icon}</span>
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
        <DoctorSearchCard onSend={onSend} onDoctorGpsReady={onDoctorGpsReady} />

      </div>
    </div>
  )
}
