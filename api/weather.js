// Vercel Serverless Function — Weather (worker-native fallback)
// /api/dz-agent/weather?city=...&lat=...&lon=...

const WORKER_WEATHER_CACHE = { data: null, ts: 0 }
const WORKER_WEATHER_TTL = 10 * 60 * 1000

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

const AR_CONDITIONS = {
  0: 'سماء صافية', 1: 'صافية غالباً', 2: 'غيمة جزئية', 3: 'غائمة',
  45: 'ضباب', 48: 'ضباب مع صقيع',
  51: 'رذاذ خفيف', 53: 'رذاذ متوسط', 55: 'رذاذ كثيف',
  61: 'مطر خفيف', 63: 'مطر متوسط', 65: 'مطر غزير',
  71: 'ثلج خفيف', 73: 'ثلج متوسط', 75: 'ثلج غزير',
  80: 'زخات مطر خفيفة', 81: 'زخات مطر متوسطة', 82: 'زخات مطر غزيرة',
  95: 'عاصفة رعدية', 96: 'عاصفة رعدية مع برد', 99: 'عاصفة رعدية قوية',
}

function getWilayaCoords(city) {
  const lower = city.toLowerCase()
  for (const [name, coords] of Object.entries(WILAYA_COORDS)) {
    if (lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)) {
      return { ...coords, label: name }
    }
  }
  return { lat: 36.7538, lon: 3.0588, label: 'الجزائر العاصمة' }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { city, lat, lon } = req.query
  const cityStr = String(city || 'Algiers').slice(0, 80)
  const latNum = parseFloat(lat)
  const lonNum = parseFloat(lon)

  const cacheKey = (!isNaN(latNum) && !isNaN(lonNum)) ? `${latNum},${lonNum}` : cityStr
  const now = Date.now()
  if (WORKER_WEATHER_CACHE.data && WORKER_WEATHER_CACHE.ts > now - WORKER_WEATHER_TTL && WORKER_WEATHER_CACHE.key === cacheKey) {
    return res.status(200).json({ ...WORKER_WEATHER_CACHE.data, city: coords.label || cityStr })
  }

  let coords
  if (!isNaN(latNum) && !isNaN(lonNum)) {
    coords = { lat: latNum, lon: lonNum, label: 'موقعك الحالي' }
  } else {
    coords = getWilayaCoords(cityStr)
  }

  try {
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto&forecast_days=1`
    const omResp = await fetch(omUrl, { headers: { 'User-Agent': 'DZ-Agent-Vercel/1.0' }, signal: AbortSignal.timeout(8000) })
    if (!omResp.ok) throw new Error(`open-meteo ${omResp.status}`)
    const omData = await omResp.json()
    const current = omData.current || {}
    const temp = current.temperature_2m ?? null
    const conditionCode = current.weather_code ?? null
    const condition = conditionCode !== null ? (AR_CONDITIONS[conditionCode] || `حالة ${conditionCode}`) : null
    const data = {
      city: coords.label || cityStr,
      temp, feels_like: temp, temp_min: temp, temp_max: temp,
      condition, icon: conditionCode, humidity: current.relative_humidity_2m ?? null,
      wind: current.wind_speed_10m ?? null, visibility: null,
      source: 'open-meteo.com', fetchedAt: new Date().toISOString(), status: 'ok'
    }
    WORKER_WEATHER_CACHE.data = data
    WORKER_WEATHER_CACHE.ts = now
    WORKER_WEATHER_CACHE.key = cacheKey
    return res.status(200).json(data)
  } catch (err) {
    console.error('[Vercel:Weather] Failed:', err.message)
    return res.status(200).json({
      city: coords.label || cityStr, temp: null, feels_like: null, temp_min: null, temp_max: null,
      condition: null, icon: null, humidity: null, wind: null, visibility: null,
      error: 'تعذّر جلب الطقس حالياً', status: 'unavailable',
      fetchedAt: new Date().toISOString()
    })
  }
}
