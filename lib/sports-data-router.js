/**
 * sports-data-router.js
 * نظام توجيه بيانات رياضية متعدد المصادر مع ترتيب الأولوية
 *
 * LIVE_MATCHES   : 365score → Koora → FotMob → API-Football → SofaScore
 * FIXTURES       : 365score → Koora → API-Football → FotMob
 * STANDINGS      : 365score → FotMob → API-Football → Koora (Algerian fallback)
 * PLAYER_STATS   : FotMob → SofaScore → FBref
 * PLAYER_IDENTITY: Wikidata → Arabic Wikipedia
 * TRANSFERS      : Transfermarkt → FotMob
 * ARABIC_L10N    : Koora → Wikidata Arabic → Arabic Wikipedia
 * FALLBACK       : football-data.org → Sportmonks
 *
 * STRICT RULE: If no live source responds → return { unavailable: true }
 * NEVER answer from LLM memory for live/current data.
 */

const UNAVAILABLE = Object.freeze({
  unavailable: true,
  message: '⚠️ بيانات كرة القدم المباشرة غير متاحة حالياً.\n⚠️ تعذّر التحقق من المعلومات الراهنة.',
  messageEn: '⚠️ Live football data unavailable.\n⚠️ Unable to verify current information.',
})

const DEFAULT_TIMEOUT = 10000

async function timedFetch(url, opts = {}) {
  const { timeout = DEFAULT_TIMEOUT, headers = {}, ...rest } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { headers, signal: controller.signal, ...rest })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

// ─────────────────────────────────────────────────────────────
// Cache helpers
// ─────────────────────────────────────────────────────────────
function makeSimpleCache(ttlMs) {
  const store = new Map()
  return {
    get(key) {
      const e = store.get(key)
      if (!e) return null
      if (Date.now() - e.ts > ttlMs) { store.delete(key); return null }
      return e.data
    },
    set(key, data) { store.set(key, { data, ts: Date.now() }) },
    del(key) { store.delete(key) },
  }
}

const CACHE = {
  liveMatches:    makeSimpleCache(3  * 60 * 1000),
  fixtures:       makeSimpleCache(10 * 60 * 1000),
  standings:      makeSimpleCache(15 * 60 * 1000),
  playerStats:    makeSimpleCache(30 * 60 * 1000),
  playerIdentity: makeSimpleCache(60 * 60 * 1000),
  transfers:      makeSimpleCache(60 * 60 * 1000),
  arabicNames:    makeSimpleCache(60 * 60 * 1000),
  algMatches:     makeSimpleCache(5  * 60 * 1000),
  matches365:     makeSimpleCache(3  * 60 * 1000),
  kooraDay:       makeSimpleCache(5  * 60 * 1000),
  standings365:   makeSimpleCache(15 * 60 * 1000),
}

// ─────────────────────────────────────────────────────────────
// FotMob – unofficial API (highest priority for live/results)
// ─────────────────────────────────────────────────────────────
const FOTMOB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'ar,en;q=0.9,fr;q=0.8',
  'Referer': 'https://www.fotmob.com/',
}

async function fetchFotmobDay(dateStr) {
  try {
    const d = (dateStr || new Date().toISOString().slice(0, 10)).replace(/-/g, '')
    const url = `https://www.fotmob.com/api/matches?date=${d}`
    const res = await timedFetch(url, { headers: FOTMOB_HEADERS, timeout: 12000 })
    if (!res.ok) return null
    const json = await res.json()
    const leagues = json?.leagues || []
    const all = []
    for (const lg of leagues) {
      const lgName = lg.name || lg.ccode || ''
      for (const m of (lg.matches || [])) {
        const status = m.status?.utcTime ? 'upcoming' :
          m.status?.finished ? 'finished' :
          m.status?.started  ? 'live' : 'upcoming'
        all.push({
          homeTeam:   m.home?.name  || m.home?.longName  || '',
          awayTeam:   m.away?.name  || m.away?.longName  || '',
          homeScore:  m.home?.score ?? null,
          awayScore:  m.away?.score ?? null,
          statusType: status,
          minutePlayed: m.status?.liveTime?.short || null,
          startTime:  m.status?.utcTime ? new Date(m.status.utcTime).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
          league:     lgName,
          leagueId:   lg.id,
          matchId:    m.id,
          link:       m.id ? `https://www.fotmob.com/matches/${m.id}` : 'https://www.fotmob.com',
          source:     'FotMob',
        })
      }
    }
    if (!all.length) return null
    return {
      matches: all,
      live:     all.filter(m => m.statusType === 'live'),
      finished: all.filter(m => m.statusType === 'finished'),
      upcoming: all.filter(m => m.statusType === 'upcoming'),
      total: all.length,
      source: 'FotMob',
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.warn('[SportRouter:FotMob] day fetch failed:', err.message)
    return null
  }
}

async function fetchFotmobLeague(leagueId, season) {
  try {
    const url = `https://www.fotmob.com/api/leagues?id=${leagueId}${season ? `&season=${season}` : ''}&tab=table`
    const res = await timedFetch(url, { headers: FOTMOB_HEADERS, timeout: 12000 })
    if (!res.ok) return null
    const json = await res.json()
    const table = json?.table?.[0]?.data?.table?.all || json?.standings?.rows || []
    if (!table.length) return null
    return table.map(r => ({
      rank:     r.idx   || r.pos || 0,
      team:     r.name  || '',
      played:   r.played || r.mp || 0,
      won:      r.wins  || r.w  || 0,
      drawn:    r.draws || r.d  || 0,
      lost:     r.losses|| r.l  || 0,
      gf:       r.scoresStr ? parseInt(r.scoresStr) : (r.gf || 0),
      ga:       r.scoresStr ? parseInt(r.scoresStr.split('-')[1]) : (r.ga || 0),
      gd:       r.goalConDiff || r.gd || 0,
      points:   r.pts   || r.p  || 0,
      source:   'FotMob',
    }))
  } catch (err) {
    console.warn('[SportRouter:FotMob] league fetch failed:', err.message)
    return null
  }
}

async function fetchFotmobPlayer(playerId) {
  try {
    const url = `https://www.fotmob.com/api/playerData?id=${playerId}`
    const res = await timedFetch(url, { headers: FOTMOB_HEADERS, timeout: 10000 })
    if (!res.ok) return null
    const d = await res.json()
    return {
      id:         playerId,
      name:       d.name || '',
      nationality:d.meta?.nationality || '',
      age:        d.meta?.age || '',
      position:   d.positionDescription?.primaryPosition?.label || '',
      club:       d.primaryTeam?.teamName || '',
      stats:      d.statsByHalf || d.stats || {},
      source:     'FotMob',
    }
  } catch (err) {
    console.warn('[SportRouter:FotMob] player fetch failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// API-Football (RapidAPI) – official, broadest coverage
// ─────────────────────────────────────────────────────────────
function apiFootballHeaders() {
  const key = process.env.RAPIDAPI_KEY || process.env.API_FOOTBALL_KEY
  if (!key) return null
  return { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com' }
}

const APIF_BASE = 'https://api-football-v1.p.rapidapi.com/v3'

// All major leagues + Algerian leagues
const APIF_LEAGUES = {
  2:   'دوري أبطال أوروبا',
  39:  'الدوري الإنجليزي الممتاز',
  140: 'الدوري الإسباني',
  135: 'الدوري الإيطالي',
  78:  'الدوري الألماني',
  61:  'الدوري الفرنسي',
  3:   'الدوري الأوروبي',
  848: 'الكونفرنس ليغ',
  // African
  12:  'أمم أفريقيا',
  20:  'دوري أبطال أفريقيا CAF',
  // Algerian
  197: 'الرابطة المحترفة الأولى – الجزائر',
  198: 'الرابطة المحترفة الثانية – الجزائر',
  // Arab
  307: 'الدوري السعودي',
  // World
  1:   'كأس العالم',
  // International
  4:   'بطولة أمم أوروبا',
}

async function fetchAPIFootballFixtures(dateStr) {
  const hdrs = apiFootballHeaders()
  if (!hdrs) return null
  try {
    const res = await timedFetch(`${APIF_BASE}/fixtures?date=${dateStr}`, { headers: hdrs, timeout: 12000 })
    if (!res.ok) return null
    const data = await res.json()
    const fixtures = data?.response || []
    if (!fixtures.length) return null

    const all = fixtures.map(f => {
      const status = f.fixture?.status?.short || ''
      const finished = ['FT','AET','PEN'].includes(status)
      const live = ['1H','2H','ET','HT','P','BT'].includes(status)
      const dt = f.fixture?.date ? new Date(f.fixture.date) : null
      return {
        homeTeam:   f.teams?.home?.name  || '',
        awayTeam:   f.teams?.away?.name  || '',
        homeLogo:   f.teams?.home?.logo  || '',
        awayLogo:   f.teams?.away?.logo  || '',
        homeScore:  (finished||live) ? (f.goals?.home ?? null) : null,
        awayScore:  (finished||live) ? (f.goals?.away ?? null) : null,
        statusType: finished ? 'finished' : live ? 'live' : 'upcoming',
        statusShort: status,
        minutePlayed: live ? (f.fixture?.status?.elapsed || '') : null,
        startTime:  dt ? dt.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
        league:     f.league?.name  || '',
        leagueId:   f.league?.id,
        leagueName: APIF_LEAGUES[f.league?.id] || f.league?.name || '',
        country:    f.league?.country || '',
        season:     f.league?.season,
        round:      f.league?.round || '',
        venue:      f.fixture?.venue?.name || '',
        fixtureId:  f.fixture?.id,
        link:       f.fixture?.id ? `https://www.api-football.com/fixture/${f.fixture.id}` : '',
        source:     'API-Football',
      }
    })

    return {
      matches: all,
      live:     all.filter(m => m.statusType === 'live'),
      finished: all.filter(m => m.statusType === 'finished'),
      upcoming: all.filter(m => m.statusType === 'upcoming'),
      total: all.length,
      source: 'API-Football',
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.warn('[SportRouter:API-Football] fixtures failed:', err.message)
    return null
  }
}

async function fetchAPIFootballStandings(leagueId, season) {
  const hdrs = apiFootballHeaders()
  if (!hdrs) return null
  const yr = season || new Date().getFullYear()
  try {
    const res = await timedFetch(`${APIF_BASE}/standings?league=${leagueId}&season=${yr}`, { headers: hdrs, timeout: 12000 })
    if (!res.ok) return null
    const data = await res.json()
    const raw = data?.response?.[0]?.league?.standings?.[0] || []
    if (!raw.length) return null
    return raw.map(r => ({
      rank:     r.rank,
      team:     r.team?.name || '',
      teamId:   r.team?.id,
      logo:     r.team?.logo || '',
      played:   r.all?.played || 0,
      won:      r.all?.win || 0,
      drawn:    r.all?.draw || 0,
      lost:     r.all?.lose || 0,
      gf:       r.all?.goals?.for || 0,
      ga:       r.all?.goals?.against || 0,
      gd:       r.goalsDiff || 0,
      points:   r.points || 0,
      form:     r.form || '',
      source:   'API-Football',
    }))
  } catch (err) {
    console.warn('[SportRouter:API-Football] standings failed:', err.message)
    return null
  }
}

async function fetchAPIFootballPlayer(playerId, season) {
  const hdrs = apiFootballHeaders()
  if (!hdrs) return null
  const yr = season || new Date().getFullYear()
  try {
    const res = await timedFetch(`${APIF_BASE}/players?id=${playerId}&season=${yr}`, { headers: hdrs, timeout: 12000 })
    if (!res.ok) return null
    const data = await res.json()
    const p = data?.response?.[0]
    if (!p) return null
    const info = p.player || {}
    const stats = p.statistics?.[0] || {}
    return {
      id:         playerId,
      name:       info.name || '',
      firstname:  info.firstname || '',
      lastname:   info.lastname || '',
      age:        info.age || '',
      nationality:info.nationality || '',
      height:     info.height || '',
      weight:     info.weight || '',
      photo:      info.photo || '',
      club:       stats.team?.name || '',
      position:   stats.games?.position || '',
      appearances:stats.games?.appearences || 0,
      goals:      stats.goals?.total || 0,
      assists:    stats.goals?.assists || 0,
      yellowCards:stats.cards?.yellow || 0,
      redCards:   stats.cards?.red || 0,
      rating:     stats.games?.rating || null,
      source:     'API-Football',
    }
  } catch (err) {
    console.warn('[SportRouter:API-Football] player failed:', err.message)
    return null
  }
}

async function fetchAPIFootballTransfers(playerId) {
  const hdrs = apiFootballHeaders()
  if (!hdrs) return null
  try {
    const res = await timedFetch(`${APIF_BASE}/transfers?player=${playerId}`, { headers: hdrs, timeout: 10000 })
    if (!res.ok) return null
    const data = await res.json()
    const transfers = data?.response?.[0]?.transfers || []
    return transfers.map(t => ({
      date:    t.date || '',
      type:    t.type || '',
      from:    t.teams?.out?.name || '',
      to:      t.teams?.in?.name  || '',
      source:  'API-Football',
    }))
  } catch (err) {
    console.warn('[SportRouter:API-Football] transfers failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// SofaScore – player ratings & advanced event data
// ─────────────────────────────────────────────────────────────
const SOFA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.sofascore.com/',
}

async function fetchSofaScoreDay(dateStr) {
  const d = dateStr || new Date().toISOString().slice(0, 10)
  try {
    const res = await timedFetch(
      `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${d}`,
      { headers: SOFA_HEADERS, timeout: 12000 }
    )
    if (!res.ok) return null
    const data = await res.json()
    const events = data?.events || []
    if (!events.length) return null
    const all = events.map(e => {
      const isLive = e.status?.type === 'inprogress'
      const isFinished = e.status?.type === 'finished'
      const startTs = e.startTimestamp ? new Date(e.startTimestamp * 1000) : null
      return {
        homeTeam:   e.homeTeam?.name || '',
        awayTeam:   e.awayTeam?.name || '',
        homeScore:  (isLive||isFinished) ? (e.homeScore?.current ?? null) : null,
        awayScore:  (isLive||isFinished) ? (e.awayScore?.current ?? null) : null,
        statusType: e.status?.type || 'upcoming',
        status:     e.status?.description || '',
        competition:e.tournament?.name || '',
        country:    e.tournament?.category?.country?.name || '',
        startTime:  startTs ? startTs.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
        date:       d,
        matchId:    e.id,
        link:       e.id ? `https://www.sofascore.com/event/${e.id}` : 'https://www.sofascore.com',
        source:     'SofaScore',
      }
    })
    return {
      matches: all,
      live:     all.filter(m => m.statusType === 'inprogress'),
      finished: all.filter(m => m.statusType === 'finished'),
      upcoming: all.filter(m => m.statusType !== 'inprogress' && m.statusType !== 'finished'),
      total: all.length,
      source: 'SofaScore',
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.warn('[SportRouter:SofaScore] day fetch failed:', err.message)
    return null
  }
}

async function fetchSofaScorePlayerStats(playerId) {
  try {
    const res = await timedFetch(
      `https://api.sofascore.com/api/v1/player/${playerId}/statistics/seasons`,
      { headers: SOFA_HEADERS, timeout: 10000 }
    )
    if (!res.ok) return null
    const data = await res.json()
    const seasons = data?.seasons || []
    return { playerId, seasons, source: 'SofaScore' }
  } catch (err) {
    console.warn('[SportRouter:SofaScore] player stats failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Wikidata – player identity (name in Arabic, nationality, DOB)
// ─────────────────────────────────────────────────────────────
async function fetchWikidataPlayer(playerName, lang = 'ar') {
  const cacheKey = `wikidata_${playerName}_${lang}`
  const cached = CACHE.playerIdentity.get(cacheKey)
  if (cached) return cached

  try {
    const sparql = `
      SELECT ?player ?playerLabel ?playerAltLabel ?dobLabel ?nationalityLabel ?positionLabel
      WHERE {
        ?player wdt:P106 wd:Q937857 .
        ?player rdfs:label ?name .
        FILTER(CONTAINS(LCASE(?name), "${playerName.toLowerCase()}"))
        OPTIONAL { ?player wdt:P569 ?dob }
        OPTIONAL { ?player wdt:P27  ?nationality }
        OPTIONAL { ?player wdt:P413 ?position }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en" }
      } LIMIT 5
    `
    const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(sparql)
    const res = await timedFetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'DZ-GPT/1.0' },
      timeout: 10000,
    })
    if (!res.ok) return null
    const data = await res.json()
    const bindings = data?.results?.bindings || []
    if (!bindings.length) return null
    const b = bindings[0]
    const result = {
      name:        b.playerLabel?.value || playerName,
      nameAlt:     b.playerAltLabel?.value || '',
      dob:         b.dobLabel?.value || '',
      nationality: b.nationalityLabel?.value || '',
      position:    b.positionLabel?.value || '',
      wikidataId:  b.player?.value?.split('/').pop() || '',
      source:      'Wikidata',
    }
    CACHE.playerIdentity.set(cacheKey, result)
    return result
  } catch (err) {
    console.warn('[SportRouter:Wikidata] player failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Wikipedia Arabic – player biography
// ─────────────────────────────────────────────────────────────
async function fetchWikipediaArabicPlayer(playerName) {
  const cacheKey = `wiki_ar_${playerName}`
  const cached = CACHE.playerIdentity.get(cacheKey)
  if (cached) return cached

  try {
    const url = `https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(playerName)}`
    const res = await timedFetch(url, {
      headers: { 'User-Agent': 'DZ-GPT/1.0' },
      timeout: 8000,
    })
    if (!res.ok) return null
    const data = await res.json()
    const result = {
      name:     data.title || playerName,
      summary:  data.extract || '',
      image:    data.thumbnail?.source || '',
      wikiUrl:  data.content_urls?.desktop?.page || '',
      source:   'Wikipedia AR',
    }
    CACHE.playerIdentity.set(cacheKey, result)
    return result
  } catch (err) {
    console.warn('[SportRouter:Wikipedia-AR] failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Transfermarkt – transfers & market values (scraping)
// ─────────────────────────────────────────────────────────────
async function fetchTransfermarktPlayer(playerName) {
  const cacheKey = `tm_${playerName}`
  const cached = CACHE.transfers.get(cacheKey)
  if (cached) return cached

  try {
    const searchUrl = `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(playerName)}`
    const res = await timedFetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept-Language': 'ar,en;q=0.9',
        'Referer': 'https://www.transfermarkt.com/',
      },
      timeout: 12000,
    })
    if (!res.ok) return null
    const html = await res.text()

    // Parse basic result from search HTML
    const nameM  = html.match(/<td class="hauptlink"><a[^>]+href="([^"]+)"[^>]*>([^<]+)</)
    const valueM = html.match(/class="rechts hauptlink">([^<]+)</)
    const clubM  = html.match(/class="zentriert"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/td>/)

    if (!nameM) return null

    const result = {
      name:        nameM[2]?.trim() || playerName,
      profileUrl:  `https://www.transfermarkt.com${nameM[1]}`,
      marketValue: valueM?.[1]?.trim() || 'N/A',
      club:        clubM?.[1]?.trim() || '',
      source:      'Transfermarkt',
    }
    CACHE.transfers.set(cacheKey, result)
    return result
  } catch (err) {
    console.warn('[SportRouter:Transfermarkt] failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Koora – Arabic names & localization
// ─────────────────────────────────────────────────────────────
async function fetchKooraArabicName(teamOrPlayer) {
  const cacheKey = `koora_${teamOrPlayer}`
  const cached = CACHE.arabicNames.get(cacheKey)
  if (cached) return cached

  try {
    const url = `https://www.kooora.com/?search=${encodeURIComponent(teamOrPlayer)}`
    const res = await timedFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ar',
        'Referer': 'https://www.kooora.com/',
      },
      timeout: 10000,
    })
    if (!res.ok) return null
    const html = await res.text()
    const titleM = html.match(/<a[^>]+class="[^"]*result[^"]*"[^>]*>([^<]+)</)
    if (!titleM) return null
    const result = { arabicName: titleM[1].trim(), source: 'Koora' }
    CACHE.arabicNames.set(cacheKey, result)
    return result
  } catch (err) {
    console.warn('[SportRouter:Koora] failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// FBref – advanced stats (xG, xA, progressive passes, etc.)
// ─────────────────────────────────────────────────────────────
async function fetchFBrefPlayerStats(playerName) {
  try {
    const searchUrl = `https://fbref.com/search/search.fcgi?search=${encodeURIComponent(playerName)}&pid=search`
    const res = await timedFetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DZ-GPT/1.0)',
        'Accept-Language': 'en',
        'Referer': 'https://fbref.com/',
      },
      timeout: 12000,
    })
    if (!res.ok) return null
    const html = await res.text()

    // Direct match: extract basic stats table
    const xgM    = html.match(/xG[^>]*>[^<]*<td[^>]*>([\d.]+)/)
    const xaM    = html.match(/xAG[^>]*>[^<]*<td[^>]*>([\d.]+)/)
    const goalsM = html.match(/Gls[^>]*>[^<]*<td[^>]*>(\d+)/)
    const appsM  = html.match(/MP[^>]*>[^<]*<td[^>]*>(\d+)/)

    if (!xgM && !goalsM) return null

    return {
      name:        playerName,
      xG:          xgM?.[1]  || null,
      xA:          xaM?.[1]  || null,
      goals:       goalsM?.[1] || null,
      appearances: appsM?.[1]  || null,
      source:      'FBref',
    }
  } catch (err) {
    console.warn('[SportRouter:FBref] failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// 365score – PRIORITY #1 — مباريات + نتائج + جداول (واجهة عربية)
// ─────────────────────────────────────────────────────────────
const SCORE365_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
  'Referer': 'https://www.365scores.com/ar/',
  'Origin': 'https://www.365scores.com',
}

// 365score competition IDs for key leagues
const SCORE365_COMPETITIONS = {
  197: 6477,   // Algerian LP1 → 365scores competition
  39:  390,    // Premier League
  140: 7064,   // La Liga
  78:  2076,   // Bundesliga
  135: 5931,   // Serie A
  61:  4,      // Ligue 1 France
  2:   572,    // Champions League
  3:   578,    // Europa League
  1:   5,      // FIFA World Cup
  12:  281,    // Africa Cup of Nations (CAN)
}

// Map 365scores status IDs
function map365Status(statusId) {
  if ([2, 3, 4].includes(statusId)) return 'live'      // 2=1H, 3=HT, 4=2H
  if (statusId === 5)               return 'finished'  // 5=FT
  if ([9, 10, 11].includes(statusId)) return 'canceled'
  return 'upcoming'
}

async function fetch365ScoreDay(dateStr) {
  const d = dateStr || new Date().toISOString().slice(0, 10)
  const cKey = `365_${d}`
  const cached = CACHE.matches365.get(cKey)
  if (cached) return cached

  // Build date param as YYYYMMDD
  const dateParam = d.replace(/-/g, '')
  const urls = [
    `https://webws.365scores.com/web/games/?appTypeId=5&langId=1&timezoneName=Africa%2FAlgiers&userCountryId=44&dates=${dateParam}`,
    `https://webws.365scores.com/web/games/?appTypeId=5&langId=1&timezoneName=Africa%2FAlgiers&userCountryId=44`,
  ]

  for (const url of urls) {
    try {
      const res = await timedFetch(url, { headers: SCORE365_HEADERS, timeout: 12000 })
      if (!res.ok) { console.log(`[SportRouter:365score] ${res.status} from ${url}`); continue }
      const json = await res.json()
      const games = json?.games || []
      if (!games.length) continue

      const all = games.map(g => {
        const statusType = map365Status(g.status?.id)
        const isLive = statusType === 'live'
        const isFinished = statusType === 'finished'
        const startTs = g.startTime ? new Date(g.startTime) : null
        return {
          homeTeam:     g.homeCompetitor?.name  || g.homeCompetitor?.shortName || '',
          awayTeam:     g.awayCompetitor?.name  || g.awayCompetitor?.shortName || '',
          homeLogo:     g.homeCompetitor?.imagePath ? `https://imagecache.365scores.com/image/upload/f_png,w_24,h_24/v4/competitors/${g.homeCompetitor.imagePath}` : '',
          awayLogo:     g.awayCompetitor?.imagePath ? `https://imagecache.365scores.com/image/upload/f_png,w_24,h_24/v4/competitors/${g.awayCompetitor.imagePath}` : '',
          homeScore:    (isLive || isFinished) ? (g.homeCompetitor?.score ?? null) : null,
          awayScore:    (isLive || isFinished) ? (g.awayCompetitor?.score ?? null) : null,
          statusType,
          statusName:   g.status?.name || '',
          minutePlayed: isLive ? (g.gameTimeDisplay || '') : null,
          startTime:    startTs ? startTs.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
          date:         d,
          league:       g.competitionDisplayName || g.competition?.displayName || '',
          leagueId:     g.competitionId,
          country:      g.homeCompetitor?.countryName || '',
          matchId:      g.id,
          link:         g.id ? `https://www.365scores.com/ar/football/match/${g.id}` : 'https://www.365scores.com/ar/',
          source:       '365score',
        }
      }).filter(m => m.homeTeam && m.awayTeam)

      if (!all.length) continue

      const result = {
        matches:  all,
        live:     all.filter(m => m.statusType === 'live'),
        finished: all.filter(m => m.statusType === 'finished'),
        upcoming: all.filter(m => m.statusType === 'upcoming'),
        total:    all.length,
        source:   '365score',
        fetchedAt: new Date().toISOString(),
      }
      CACHE.matches365.set(cKey, result)
      console.log(`[SportRouter:365score] ✓ ${all.length} matches (live:${result.live.length} fin:${result.finished.length})`)
      return result
    } catch (err) {
      console.warn('[SportRouter:365score] day fetch failed:', err.message)
    }
  }
  return null
}

async function fetch365ScoreStandings(leagueId = 197) {
  const compId = SCORE365_COMPETITIONS[leagueId] || leagueId
  const cKey = `365_st_${compId}`
  const cached = CACHE.standings365.get(cKey)
  if (cached) return cached

  try {
    const url = `https://webws.365scores.com/web/standings/?appTypeId=5&langId=1&competitionId=${compId}&timezone=Africa%2FAlgiers`
    const res = await timedFetch(url, { headers: SCORE365_HEADERS, timeout: 12000 })
    if (!res.ok) return null
    const json = await res.json()

    // standings structure: json.standings[0].standing[] with rows
    const rawRows = json?.standings?.[0]?.standing || []
    if (!rawRows.length) return null

    const rows = rawRows.map((r, i) => {
      const data = r.row?.data || r.data || r
      return {
        rank:   r.rank || (i + 1),
        team:   r.competitor?.name || r.name || data?.name || '',
        teamId: r.competitorId || r.competitor?.id,
        logo:   r.competitor?.imagePath ? `https://imagecache.365scores.com/image/upload/f_png,w_24,h_24/v4/competitors/${r.competitor.imagePath}` : '',
        played: r.gamesPlayed   ?? data?.gamesPlayed ?? 0,
        won:    r.wins          ?? data?.wins ?? 0,
        drawn:  r.ties          ?? data?.ties ?? 0,
        lost:   r.losses        ?? data?.losses ?? 0,
        gf:     r.scoredGoals   ?? 0,
        ga:     r.receivedGoals ?? 0,
        gd:     r.goalsDiff     ?? 0,
        points: r.points        ?? 0,
        form:   r.form          || '',
        source: '365score',
      }
    }).filter(r => r.team)

    if (!rows.length) return null

    const result = { standings: rows, leagueId, competitionId: compId, source: '365score', fetchedAt: new Date().toISOString() }
    CACHE.standings365.set(cKey, result)
    console.log(`[SportRouter:365score] ✓ standings ${rows.length} teams (comp:${compId})`)
    return result
  } catch (err) {
    console.warn('[SportRouter:365score] standings failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Koora (كووورة) – PRIORITY #2 — مباريات اليوم بالعربية
// ─────────────────────────────────────────────────────────────
const KOORA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Accept-Language': 'ar',
  'Referer': 'https://www.kooora.com/',
}

async function fetchKooraDay(dateStr) {
  const d = dateStr || new Date().toISOString().slice(0, 10)
  const cKey = `koora_day_${d}`
  const cached = CACHE.kooraDay.get(cKey)
  if (cached) return cached

  const urls = [
    'https://www.kooora.com/?g=1',   // today's live/matches tab
    'https://www.kooora.com/',        // home page with today's matches
  ]

  for (const url of urls) {
    try {
      const res = await timedFetch(url, { headers: KOORA_HEADERS, timeout: 14000 })
      if (!res.ok) continue
      const html = await res.text()

      // Extract match rows from koora HTML — matches appear in .matchsDiv or table rows with data-id
      const matches = []

      // Pattern 1: match blocks with data-matchid attribute
      const blockRe = /data-matchid=["'](\d+)["'][^>]*>([\s\S]*?)(?=data-matchid=|<\/div>\s*<\/div>)/gi
      let bm
      while ((bm = blockRe.exec(html)) !== null) {
        const block = bm[2]
        const teams = [...block.matchAll(/class="[^"]*(?:team|team-name|home|away)[^"]*"[^>]*>([^<]+)/gi)].map(m => m[1].trim()).filter(Boolean)
        const scores = [...block.matchAll(/class="[^"]*score[^"]*"[^>]*>([^<]+)/gi)].map(m => m[1].replace(/[^\d\-]/g, '').trim()).filter(Boolean)
        if (teams.length >= 2) {
          const sc = scores[0]?.split('-') || []
          matches.push({
            homeTeam:  teams[0],
            awayTeam:  teams[1],
            homeScore: sc[0] !== undefined && sc[0] !== '' ? parseInt(sc[0]) : null,
            awayScore: sc[1] !== undefined && sc[1] !== '' ? parseInt(sc[1]) : null,
            statusType: scores.length ? 'finished' : 'upcoming',
            matchId:   bm[1],
            source:    'Koora',
            link:      `https://www.kooora.com/?m=${bm[1]}`,
          })
        }
      }

      // Pattern 2: table rows with match data
      if (!matches.length) {
        const trRe = /<tr[^>]*class="[^"]*match[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi
        let tm
        while ((tm = trRe.exec(html)) !== null) {
          const row = tm[1]
          const teams = [...row.matchAll(/<td[^>]*class="[^"]*team[^"]*"[^>]*>([^<]+)/gi)].map(m => m[1].trim()).filter(Boolean)
          const scoreM = row.match(/(\d+)\s*-\s*(\d+)/)
          if (teams.length >= 2) {
            matches.push({
              homeTeam:  teams[0],
              awayTeam:  teams[1],
              homeScore: scoreM ? parseInt(scoreM[1]) : null,
              awayScore: scoreM ? parseInt(scoreM[2]) : null,
              statusType: scoreM ? 'finished' : 'upcoming',
              source:    'Koora',
              link:      url,
            })
          }
        }
      }

      // Pattern 3: JSON-LD or script data
      if (!matches.length) {
        const scriptM = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/)
        if (scriptM) {
          try {
            const state = JSON.parse(scriptM[1])
            const games = state?.games || state?.matches || []
            for (const g of games) {
              matches.push({
                homeTeam:  g.homeTeam?.name || g.home?.name || '',
                awayTeam:  g.awayTeam?.name || g.away?.name || '',
                homeScore: g.homeScore ?? g.score?.home ?? null,
                awayScore: g.awayScore ?? g.score?.away ?? null,
                statusType: g.status === 'finished' ? 'finished' : g.status === 'live' ? 'live' : 'upcoming',
                league:    g.league?.name || '',
                source:    'Koora',
                link:      url,
              })
            }
          } catch (_) {}
        }
      }

      if (matches.length > 0) {
        const result = {
          matches:  matches.filter(m => m.homeTeam && m.awayTeam),
          live:     matches.filter(m => m.statusType === 'live'),
          finished: matches.filter(m => m.statusType === 'finished'),
          upcoming: matches.filter(m => m.statusType === 'upcoming'),
          total:    matches.length,
          source:   'Koora',
          fetchedAt: new Date().toISOString(),
        }
        CACHE.kooraDay.set(cKey, result)
        console.log(`[SportRouter:Koora] ✓ ${matches.length} matches from day page`)
        return result
      }
    } catch (err) {
      console.warn('[SportRouter:Koora] day fetch failed:', err.message)
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// football-data.org – fallback (free tier, ~12 competitions)
// ─────────────────────────────────────────────────────────────
async function fetchFootballDataOrg(competitionCode = 'PL') {
  const key = process.env.FOOTBALL_DATA_ORG_KEY
  const headers = {
    'X-Auth-Token': key || '',
    'User-Agent': 'DZ-GPT/1.0',
  }
  try {
    const res = await timedFetch(
      `https://api.football-data.org/v4/competitions/${competitionCode}/matches?status=LIVE`,
      { headers, timeout: 10000 }
    )
    if (!res.ok) return null
    const data = await res.json()
    const matches = (data?.matches || []).map(m => ({
      homeTeam:   m.homeTeam?.name || '',
      awayTeam:   m.awayTeam?.name || '',
      homeScore:  m.score?.fullTime?.home ?? null,
      awayScore:  m.score?.fullTime?.away ?? null,
      statusType: m.status === 'IN_PLAY' ? 'live' : m.status === 'FINISHED' ? 'finished' : 'upcoming',
      startTime:  m.utcDate ? new Date(m.utcDate).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
      league:     data.competition?.name || competitionCode,
      source:     'football-data.org',
    }))
    if (!matches.length) return null
    return { matches, source: 'football-data.org', fetchedAt: new Date().toISOString() }
  } catch (err) {
    console.warn('[SportRouter:football-data.org] failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Algerian National Team – منتخب الجزائر
// ─────────────────────────────────────────────────────────────
async function fetchAlgeriaMatches(dateStr) {
  const cacheKey = `algeria_${dateStr || 'today'}`
  const cached = CACHE.algMatches.get(cacheKey)
  if (cached) return cached

  // Try API-Football first (team 3 = Algeria)
  const hdrs = apiFootballHeaders()
  if (hdrs) {
    try {
      const yr = new Date().getFullYear()
      const url = `${APIF_BASE}/fixtures?team=3&season=${yr}${dateStr ? `&from=${dateStr}&to=${dateStr}` : ''}`
      const res = await timedFetch(url, { headers: hdrs, timeout: 12000 })
      if (res.ok) {
        const data = await res.json()
        const fixtures = data?.response || []
        const matches = fixtures.map(f => {
          const status = f.fixture?.status?.short || ''
          const finished = ['FT','AET','PEN'].includes(status)
          const live = ['1H','2H','ET','HT'].includes(status)
          return {
            homeTeam:   f.teams?.home?.name || '',
            awayTeam:   f.teams?.away?.name || '',
            homeScore:  (finished||live) ? (f.goals?.home ?? null) : null,
            awayScore:  (finished||live) ? (f.goals?.away ?? null) : null,
            statusType: finished ? 'finished' : live ? 'live' : 'upcoming',
            startTime:  f.fixture?.date ? new Date(f.fixture.date).toLocaleTimeString('ar-DZ', { hour:'2-digit', minute:'2-digit', timeZone:'Africa/Algiers' }) : '',
            date:       f.fixture?.date?.slice(0, 10) || dateStr || '',
            competition:f.league?.name || '',
            venue:      f.fixture?.venue?.name || '',
            source:     'API-Football',
          }
        })
        if (matches.length) {
          const result = { matches, source: 'API-Football', fetchedAt: new Date().toISOString() }
          CACHE.algMatches.set(cacheKey, result)
          return result
        }
      }
    } catch (err) {
      console.warn('[SportRouter:Algeria] API-Football failed:', err.message)
    }
  }

  // Fallback: FotMob day — filter Algeria matches
  if (dateStr) {
    const day = await fetchFotmobDay(dateStr)
    if (day?.matches?.length) {
      const filtered = day.matches.filter(m =>
        m.homeTeam.includes('Algeria') || m.awayTeam.includes('Algeria') ||
        m.homeTeam.includes('الجزائر') || m.awayTeam.includes('الجزائر')
      )
      if (filtered.length) {
        const result = { matches: filtered, source: 'FotMob', fetchedAt: new Date().toISOString() }
        CACHE.algMatches.set(cacheKey, result)
        return result
      }
    }
  }

  return null
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API — Priority-routed functions
// ─────────────────────────────────────────────────────────────

/**
 * getLiveMatches
 * Priority: 365score → Koora → FotMob → API-Football → SofaScore → football-data.org
 * Returns UNAVAILABLE if all fail.
 */
export async function getLiveMatches(dateStr) {
  const d = dateStr || new Date().toISOString().slice(0, 10)
  const cKey = `live_${d}`
  const cached = CACHE.liveMatches.get(cKey)
  if (cached) return cached

  // 1. 365score — PRIORITY #1 (عربي، واسع، مجاني)
  let result = await fetch365ScoreDay(d)
  if (result?.matches?.length) {
    console.log(`[SportRouter] LIVE_MATCHES ✓ 365score (${result.total} matches)`)
    CACHE.liveMatches.set(cKey, result)
    return result
  }

  // 2. Koora — PRIORITY #2 (عربي، الجزائر وأفريقيا)
  result = await fetchKooraDay(d)
  if (result?.matches?.length) {
    console.log(`[SportRouter] LIVE_MATCHES ✓ Koora (${result.total} matches)`)
    CACHE.liveMatches.set(cKey, result)
    return result
  }

  // 3. FotMob
  result = await fetchFotmobDay(d)
  if (result?.matches?.length) {
    console.log(`[SportRouter] LIVE_MATCHES ✓ FotMob (${result.total} matches)`)
    CACHE.liveMatches.set(cKey, result)
    return result
  }

  // 4. API-Football
  result = await fetchAPIFootballFixtures(d)
  if (result?.matches?.length) {
    console.log(`[SportRouter] LIVE_MATCHES ✓ API-Football (${result.total} matches)`)
    CACHE.liveMatches.set(cKey, result)
    return result
  }

  // 5. SofaScore
  result = await fetchSofaScoreDay(d)
  if (result?.matches?.length) {
    console.log(`[SportRouter] LIVE_MATCHES ✓ SofaScore (${result.total} matches)`)
    CACHE.liveMatches.set(cKey, result)
    return result
  }

  // 6. football-data.org fallback (live only)
  result = await fetchFootballDataOrg('PL')
  if (result?.matches?.length) {
    console.log(`[SportRouter] LIVE_MATCHES ✓ football-data.org`)
    CACHE.liveMatches.set(cKey, result)
    return result
  }

  console.warn('[SportRouter] LIVE_MATCHES ✗ all sources failed')
  return UNAVAILABLE
}

/**
 * getFixtures
 * Priority: 365score → Koora → API-Football → FotMob
 */
export async function getFixtures(dateStr) {
  const d = dateStr || new Date().toISOString().slice(0, 10)
  const cKey = `fix_${d}`
  const cached = CACHE.fixtures.get(cKey)
  if (cached) return cached

  // 1. 365score — PRIORITY #1
  let result = await fetch365ScoreDay(d)
  if (result?.matches?.length) {
    console.log(`[SportRouter] FIXTURES ✓ 365score (${result.total})`)
    CACHE.fixtures.set(cKey, result)
    return result
  }

  // 2. Koora — PRIORITY #2
  result = await fetchKooraDay(d)
  if (result?.matches?.length) {
    console.log(`[SportRouter] FIXTURES ✓ Koora (${result.total})`)
    CACHE.fixtures.set(cKey, result)
    return result
  }

  // 3. API-Football
  result = await fetchAPIFootballFixtures(d)
  if (result?.matches?.length) {
    console.log(`[SportRouter] FIXTURES ✓ API-Football`)
    CACHE.fixtures.set(cKey, result)
    return result
  }

  // 4. FotMob
  result = await fetchFotmobDay(d)
  if (result?.matches?.length) {
    console.log(`[SportRouter] FIXTURES ✓ FotMob`)
    CACHE.fixtures.set(cKey, result)
    return result
  }

  console.warn('[SportRouter] FIXTURES ✗ all sources failed')
  return UNAVAILABLE
}

/**
 * getStandings
 * Priority: 365score → FotMob → API-Football → Koora (Algerian fallback)
 * leagueId: use APIF_LEAGUES ids (e.g. 197 = Algerian LP1, 39 = Premier League)
 */
export async function getStandings(leagueId = 197, season = null) {
  const cKey = `standings_${leagueId}_${season || 'current'}`
  const cached = CACHE.standings.get(cKey)
  if (cached) return cached

  // Map API-Football IDs to FotMob IDs for fallback
  const fotmobLeagueMap = {
    197: 568,  // Algerian LP1
    39:  47,   // Premier League
    140: 87,   // La Liga
    135: 55,   // Serie A
    78:  54,   // Bundesliga
    61:  53,   // Ligue 1
    2:   42,   // Champions League
  }

  // 1. 365score — PRIORITY #1
  let result = await fetch365ScoreStandings(leagueId)
  if (result?.standings?.length) {
    console.log(`[SportRouter] STANDINGS ✓ 365score (league ${leagueId}, ${result.standings.length} teams)`)
    CACHE.standings.set(cKey, result)
    return result
  }

  // 2. FotMob
  const fmId = fotmobLeagueMap[leagueId]
  if (fmId) {
    const fmRows = await fetchFotmobLeague(fmId, season)
    if (fmRows?.length) {
      console.log(`[SportRouter] STANDINGS ✓ FotMob (league ${fmId})`)
      const data = { standings: fmRows, leagueId, source: 'FotMob' }
      CACHE.standings.set(cKey, data)
      return data
    }
  }

  // 3. API-Football
  const apifRows = await fetchAPIFootballStandings(leagueId, season)
  if (apifRows?.length) {
    console.log(`[SportRouter] STANDINGS ✓ API-Football (league ${leagueId})`)
    const data = { standings: apifRows, leagueId, source: 'API-Football' }
    CACHE.standings.set(cKey, data)
    return data
  }

  console.warn(`[SportRouter] STANDINGS ✗ all sources failed (league ${leagueId})`)
  return UNAVAILABLE
}

/**
 * get365ScoreMatches — استدعاء مباشر لـ 365score (للنماذج التي تريد البيانات الخام)
 */
export async function get365ScoreMatches(dateStr) {
  const result = await fetch365ScoreDay(dateStr)
  if (!result) return UNAVAILABLE
  return result
}

/**
 * get365ScoreStandings — ترتيب الدوري من 365score مباشرة
 */
export async function get365ScoreStandings(leagueId = 197) {
  const result = await fetch365ScoreStandings(leagueId)
  if (!result) return UNAVAILABLE
  return result
}

/**
 * getKooraMatches — مباريات اليوم من كووورة مباشرة
 */
export async function getKooraMatches(dateStr) {
  const result = await fetchKooraDay(dateStr)
  if (!result) return UNAVAILABLE
  return result
}

// ─────────────────────────────────────────────────────────────
// 365score – Player/Team Search (PRIORITY #1 for player identity)
// ─────────────────────────────────────────────────────────────
async function fetch365ScorePlayer(playerName) {
  const cKey = `365player_${playerName}`
  const cached = CACHE.playerIdentity.get(cKey)
  if (cached) return cached

  try {
    const url = `https://webws.365scores.com/web/search/?lang=1&q=${encodeURIComponent(playerName)}&sportTypes=1`
    const res = await timedFetch(url, { headers: SCORE365_HEADERS, timeout: 10000 })
    if (!res.ok) return null
    const data = await res.json()

    const competitors = data?.competitors || data?.players || []
    if (!competitors.length) return null

    const p = competitors[0]
    const result = {
      name:        p.name || p.shortName || playerName,
      nationality: p.country?.name || p.nationalityName || '',
      club:        p.teamName || p.team?.name || '',
      position:    p.positionName || p.position || '',
      image:       p.imagePath ? `https://imagecache.365scores.com/image/upload/f_png,w_200,h_200/v4/competitors/${p.imagePath}` : '',
      profileUrl:  p.id ? `https://www.365scores.com/ar/football/player-${p.id}` : 'https://www.365scores.com/ar',
      source:      '365score',
    }
    CACHE.playerIdentity.set(cKey, result)
    console.log(`[SportRouter:365score] player found: ${result.name} (${result.club})`)
    return result
  } catch (err) {
    console.warn('[SportRouter:365score] player search failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// Koora – Player/Team Search (PRIORITY #2)
// ─────────────────────────────────────────────────────────────
async function fetchKooraPlayer(playerName) {
  const cKey = `kooraplayer_${playerName}`
  const cached = CACHE.playerIdentity.get(cKey)
  if (cached) return cached

  try {
    const url = `https://www.kooora.com/?search=${encodeURIComponent(playerName)}`
    const res = await timedFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ar',
        'Referer': 'https://www.kooora.com/',
      },
      timeout: 10000,
    })
    if (!res.ok) return null
    const html = await res.text()

    const playerLinkM = html.match(/href="[^"]*\?p=player&player=(\d+)"[^>]*>([^<]{3,50})</)
    const clubM       = html.match(/href="[^"]*\?team=(\d+)"[^>]*>([^<]{3,50})</)
    const posM        = html.match(/class="[^"]*position[^"]*"[^>]*>([^<]{3,30})</)

    if (!playerLinkM) return null

    const result = {
      name:       playerLinkM[2]?.trim() || playerName,
      club:       clubM?.[2]?.trim() || '',
      position:   posM?.[1]?.trim() || '',
      profileUrl: `https://www.kooora.com/?p=player&player=${playerLinkM[1]}`,
      source:     'Koora',
    }
    CACHE.playerIdentity.set(cKey, result)
    console.log(`[SportRouter:Koora] player found: ${result.name} (${result.club})`)
    return result
  } catch (err) {
    console.warn('[SportRouter:Koora] player search failed:', err.message)
    return null
  }
}

/**
 * getPlayerIdentity
 * Priority: 365score → Koora → Wikidata → Arabic Wikipedia
 * Returns bilingual identity info for any footballer worldwide.
 */
export async function getPlayerIdentity(playerName) {
  const cKey = `identity_${playerName}`
  const cached = CACHE.playerIdentity.get(cKey)
  if (cached) return cached

  // 1. 365score — PRIORITY #1 (مباريات + هوية + نادٍ حالي)
  const score365 = await fetch365ScorePlayer(playerName)
  if (score365?.name) {
    const result = { ...score365, sources: ['365score'] }
    CACHE.playerIdentity.set(cKey, result)
    console.log(`[SportRouter] PLAYER_IDENTITY ✓ 365score (${playerName})`)
    return result
  }

  // 2. Koora — PRIORITY #2 (عربية — معرّف النادي والمركز)
  const koora = await fetchKooraPlayer(playerName)

  // 3. Wikidata + Wikipedia AR في المقام الثالث
  const [wikidata, wikipedia] = await Promise.all([
    fetchWikidataPlayer(playerName),
    fetchWikipediaArabicPlayer(playerName),
  ])

  if (!koora && !wikidata && !wikipedia) {
    console.warn(`[SportRouter] PLAYER_IDENTITY ✗ all sources failed (${playerName})`)
    return UNAVAILABLE
  }

  const result = {
    ...(wikidata || {}),
    ...(koora ? { club: koora.club || wikidata?.club, position: koora.position || wikidata?.position, profileUrl: koora.profileUrl } : {}),
    ...(wikipedia ? { summary: wikipedia.summary, image: wikipedia.image, wikiUrl: wikipedia.wikiUrl } : {}),
    sources: [koora?.source, wikidata?.source, wikipedia?.source].filter(Boolean),
  }
  CACHE.playerIdentity.set(cKey, result)
  console.log(`[SportRouter] PLAYER_IDENTITY ✓ ${result.sources.join('+')} (${playerName})`)
  return result
}

/**
 * getPlayerStats
 * Priority: 365score → Koora → FotMob (by ID) → SofaScore → FBref
 */
export async function getPlayerStats(playerName, fotmobId = null, sofascoreId = null) {
  const cKey = `pstats_${playerName}`
  const cached = CACHE.playerStats.get(cKey)
  if (cached) return cached

  let result = null

  if (fotmobId) {
    result = await fetchFotmobPlayer(fotmobId)
    if (result) {
      console.log(`[SportRouter] PLAYER_STATS ✓ FotMob (${playerName})`)
      CACHE.playerStats.set(cKey, result)
      return result
    }
  }

  if (sofascoreId) {
    result = await fetchSofaScorePlayerStats(sofascoreId)
    if (result) {
      console.log(`[SportRouter] PLAYER_STATS ✓ SofaScore (${playerName})`)
      CACHE.playerStats.set(cKey, result)
      return result
    }
  }

  result = await fetchFBrefPlayerStats(playerName)
  if (result) {
    console.log(`[SportRouter] PLAYER_STATS ✓ FBref (${playerName})`)
    CACHE.playerStats.set(cKey, result)
    return result
  }

  console.warn(`[SportRouter] PLAYER_STATS ✗ all sources failed (${playerName})`)
  return UNAVAILABLE
}

/**
 * getTransfers
 * Priority: Transfermarkt → API-Football
 */
export async function getTransfers(playerName, apiFootballPlayerId = null) {
  const cKey = `transfers_${playerName}`
  const cached = CACHE.transfers.get(cKey)
  if (cached) return cached

  let result = await fetchTransfermarktPlayer(playerName)
  if (result && !result.unavailable) {
    console.log(`[SportRouter] TRANSFERS ✓ Transfermarkt (${playerName})`)
    CACHE.transfers.set(cKey, result)
    return result
  }

  if (apiFootballPlayerId) {
    const transfers = await fetchAPIFootballTransfers(apiFootballPlayerId)
    if (transfers?.length) {
      const data = { name: playerName, transfers, source: 'API-Football' }
      CACHE.transfers.set(cKey, data)
      return data
    }
  }

  console.warn(`[SportRouter] TRANSFERS ✗ all sources failed (${playerName})`)
  return UNAVAILABLE
}

/**
 * getArabicLocalization
 * Priority: Koora → Wikidata Arabic → Arabic Wikipedia
 */
export async function getArabicLocalization(name) {
  const cKey = `l10n_${name}`
  const cached = CACHE.arabicNames.get(cKey)
  if (cached) return cached

  let result = await fetchKooraArabicName(name)
  if (result?.arabicName) {
    console.log(`[SportRouter] ARABIC_L10N ✓ Koora (${name})`)
    CACHE.arabicNames.set(cKey, result)
    return result
  }

  const wd = await fetchWikidataPlayer(name, 'ar')
  if (wd?.name) {
    result = { arabicName: wd.name, source: 'Wikidata Arabic' }
    console.log(`[SportRouter] ARABIC_L10N ✓ Wikidata Arabic (${name})`)
    CACHE.arabicNames.set(cKey, result)
    return result
  }

  const wp = await fetchWikipediaArabicPlayer(name)
  if (wp?.name) {
    result = { arabicName: wp.name, source: 'Wikipedia AR' }
    console.log(`[SportRouter] ARABIC_L10N ✓ Wikipedia AR (${name})`)
    CACHE.arabicNames.set(cKey, result)
    return result
  }

  return UNAVAILABLE
}

/**
 * getAlgeriaMatches – منتخب الجزائر والفرق الجزائرية
 */
export async function getAlgeriaMatches(dateStr) {
  const result = await fetchAlgeriaMatches(dateStr)
  if (!result) return UNAVAILABLE
  return result
}

/**
 * isUnavailable – helper to check if result is the UNAVAILABLE sentinel
 */
export function isUnavailable(result) {
  return result?.unavailable === true
}

export { UNAVAILABLE, APIF_LEAGUES }
