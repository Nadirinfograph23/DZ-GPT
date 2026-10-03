// Vercel Serverless Function — Prayer (worker-native fallback)
// /api/dz-agent/prayer?city=...&lat=...&lon=...

const WORKER_PRAYER_CACHE = { data: null, ts: 0 }
const WORKER_PRAYER_TTL = 60 * 60 * 1000

const WILAYA_COORDS = {
  'الجزائر': { lat: 36.7538, lon: 3.0588 },
  'وهران': { lat: 35.6969, lon: -0.6331 },
  'قسنطينة': { lat: 36.365, lon: 6.6147 },
  'عنابة': { lat: 36.9, lon: 7.7667 },
  'باتنة': { lat: 35.55, lon: 6.1667 },
  'بجاية': { lat: 36.75, lon: 5.0833 },
  'تلمسان': { lat: 34.8783, lon: -1.3167 },
  'تيزي وزو': { lat: 36.7167, lon: 4.05 },
  'سطيف': { lat: 36.1911, lon: 5.4136 },
  'سوق أهراس': { lat: 36.2833, lon: 7.95 },
}

const WILAYA_ALIASES = {
  'oran': 'وهران', 'constantine': 'قسنطينة', 'annaba': 'عنابة',
  'batna': 'باتنة', 'bejaia': 'بجاية', 'béjaïa': 'بجاية',
  'tlemcen': 'تلمسان', 'tizi ouzou': 'تيزي وزو', 'setif': 'سطيف',
  'skikda': 'سطيف', 'jijel': 'عنابة', 'algiers': 'الجزائر',
  'alger': 'الجزائر', 'adrar': 'الأغواط', 'biskra': 'بسكرة',
}

function formatAladhanDate(gregorian) {
  const year = Number(gregorian?.year)
  const month = Number(gregorian?.month?.number)
  const day = Number(gregorian?.day)
  if (!year || !month || month > 12 || !day) return formatLocalDate()
  return new Intl.DateTimeFormat('ar-DZ', {
    calendar: 'gregory', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function formatLocalDate() {
  return new Intl.DateTimeFormat('ar-DZ', {
    calendar: 'gregory', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Algiers'
  }).format(new Date())
}

function getWilayaCoords(city) {
  const lower = city.toLowerCase()
  const alias = WILAYA_ALIASES[lower] || WILAYA_ALIASES[lower.split(' ')[0]]
  if (alias && WILAYA_COORDS[alias]) return { ...WILAYA_COORDS[alias], label: alias }
  for (const [name, coords] of Object.entries(WILAYA_COORDS)) {
    if (lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)) {
      return { ...coords, label: name }
    }
  }
  return { lat: 36.7538, lon: 3.0588, label: 'الجزائر العاصمة' }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { city, lat, lon } = req.query
  const cityStr = String(city || 'Algiers').slice(0, 80)
  const latNum = parseFloat(lat)
  const lonNum = parseFloat(lon)

  let coords
  if (!isNaN(latNum) && !isNaN(lonNum)) {
    coords = { lat: latNum, lon: lonNum, label: 'موقعك الحالي' }
  } else {
    coords = getWilayaCoords(cityStr)
  }

  const cacheDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Algiers'
  }).format(new Date())
  const cacheKey = `${coords.lat},${coords.lon}:${cacheDate}`
  const now = Date.now()
  if (WORKER_PRAYER_CACHE.data && WORKER_PRAYER_CACHE.ts > now - WORKER_PRAYER_TTL && WORKER_PRAYER_CACHE.key === cacheKey) {
    return res.status(200).json({ ...WORKER_PRAYER_CACHE.data, city: coords.label || cityStr })
  }

  try {
    const method = 2
    const aladhanUrl = `https://api.aladhan.com/v1/timings?latitude=${coords.lat}&longitude=${coords.lon}&method=${method}&iso8601=true`
    const resp = await fetch(aladhanUrl, { headers: { 'User-Agent': 'DZ-Agent-Vercel/1.0' }, signal: AbortSignal.timeout(8000) })
    if (!resp.ok) throw new Error(`aladhan ${resp.status}`)
    const json = await resp.json()
    const timings = json.data?.timings || {}
    const hijri = json.data?.date?.hijri || {}
    const timeZone = json.data?.meta?.timezone || 'Africa/Algiers'
    const data = {
      city: coords.label || cityStr,
      country: 'Algeria',
      source: 'aladhan.com',
      date: formatAladhanDate(json.data?.date?.gregorian),
      timeZone,
      hijri: hijri.date || '',
      hijriMonth: hijri.month?.ar || '',
      times: {
        'الفجر': timings['Fajr'] || '--',
        'الشروق': timings['Sunrise'] || '--',
        'الظهر': timings['Dhuhr'] || '--',
        'العصر': timings['Asr'] || '--',
        'المغرب': timings['Maghrib'] || '--',
        'العشاء': timings['Isha'] || '--',
      },
      status: 'ok'
    }
    WORKER_PRAYER_CACHE.data = data
    WORKER_PRAYER_CACHE.ts = now
    WORKER_PRAYER_CACHE.key = cacheKey
    return res.status(200).json(data)
  } catch (err) {
    console.error('[Vercel:Prayer] Failed:', err.message)
    return res.status(200).json({
      city: coords.label || cityStr, country: 'Algeria', source: 'unavailable',
      date: formatLocalDate(),
      timeZone: 'Africa/Algiers',
      times: { 'الفجر': '--', 'الشروق': '--', 'الظهر': '--', 'العصر': '--', 'المغرب': '--', 'العشاء': '--' },
      error: 'تعذّر جلب مواقيت الصلاة حالياً', status: 'unavailable'
    })
  }
}
