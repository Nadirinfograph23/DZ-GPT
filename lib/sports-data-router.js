/**
 * sports-data-router.js
 * نظام توجيه بيانات رياضية متعدد المصادر مع ترتيب الأولوية
 *
 * LIVE_MATCHES   : FotMob → SofaScore → Koora → 365score → API-Football
 * FIXTURES       : FotMob → SofaScore → 365score → Koora → API-Football
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
// Kooora Algeria Team Page – صفحة مباريات المنتخب الجزائري
// URL: https://www.kooora.com/كرة-القدم/فريق/الجزائر/مباريات/cbx8lz7loz866tsoawwrpxyl9
// ─────────────────────────────────────────────────────────────
const KOOORA_ALGERIA_URL = 'https://www.kooora.com/%D9%83%D8%B1%D8%A9-%D8%A7%D9%84%D9%82%D8%AF%D9%85/%D9%81%D8%B1%D9%8A%D9%82/%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D9%8A%D8%A4%D8%B1/%D9%85%D8%A8%D8%A7%D8%B1%D9%8A%D8%A7%D8%AA/cbx8lz7loz866tsoawwrpxyl9'
const KOOORA_ALGERIA_CACHE = makeSimpleCache(8 * 60 * 1000) // 8 دقائق

async function fetchKooraAlgeriaTeamPage() {
  const cKey = 'kooora_algeria_team'
  const cached = KOOORA_ALGERIA_CACHE.get(cKey)
  if (cached) return cached

  try {
    const res = await timedFetch(KOOORA_ALGERIA_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'ar,en;q=0.8',
        'Referer': 'https://www.kooora.com/',
      },
      timeout: 15000,
    })
    if (!res.ok) {
      console.warn(`[KooraAlgeria] HTTP ${res.status}`)
      return null
    }
    const html = await res.text()
    const matches = []

    // ── Pattern 1: match rows with data-matchid ──────────────────────────
    const matchIdRe = /data-matchid=["'](\d+)["'][^>]*>([\s\S]{0,800}?)(?=data-matchid=|$)/gi
    let m1
    while ((m1 = matchIdRe.exec(html)) !== null) {
      const block = m1[2]
      const matchId = m1[1]

      // استخراج أسماء الفرق
      const teamNames = [...block.matchAll(/class="[^"]*(?:team-name|teamName|team_name|home-name|away-name)[^"]*"[^>]*>\s*([^<]{2,40})\s*<\/[a-z]+>/gi)]
        .map(t => t[1].trim()).filter(Boolean)

      // استخراج النتيجة
      const scoreM = block.match(/(\d+)\s*[-–]\s*(\d+)/)

      // استخراج التاريخ
      const dateM = block.match(/(\d{4}[-/]\d{2}[-/]\d{2})|(\d{2}[-/]\d{2}[-/]\d{4})/)

      // استخراج البطولة
      const compM = block.match(/class="[^"]*(?:competition|league|tournament)[^"]*"[^>]*>\s*([^<]{2,60})\s*<\/[a-z]+>/i)

      if (teamNames.length >= 2) {
        const home = teamNames[0]
        const away = teamNames[1]
        const isAlgeriaHome = home.includes('الجزائر') || home.toLowerCase().includes('algeria')
        const isAlgeriaAway = away.includes('الجزائر') || away.toLowerCase().includes('algeria')
        if (isAlgeriaHome || isAlgeriaAway) {
          matches.push({
            homeTeam: home,
            awayTeam: away,
            homeScore: scoreM ? parseInt(scoreM[1]) : null,
            awayScore: scoreM ? parseInt(scoreM[2]) : null,
            statusType: scoreM ? 'finished' : 'upcoming',
            date: dateM ? dateM[0].replace(/\//g, '-') : '',
            competition: compM?.[1]?.trim() || '',
            matchId,
            link: `https://www.kooora.com/?m=${matchId}`,
            source: 'Kooora-Algeria',
          })
        }
      }
    }

    // ── Pattern 2: JSON-LD يحتوي على بيانات المباريات ────────────────────
    if (matches.length === 0) {
      const jsonLdM = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || []
      for (const script of jsonLdM) {
        try {
          const inner = script.replace(/<script[^>]*>/, '').replace(/<\/script>/, '')
          const data = JSON.parse(inner)
          const events = Array.isArray(data) ? data : data['@graph'] || [data]
          for (const ev of events) {
            if (ev['@type'] === 'SportsEvent' || ev.homeTeam || ev.awayTeam) {
              const home = ev.homeTeam?.name || ev.homeTeam || ''
              const away = ev.awayTeam?.name || ev.awayTeam || ''
              const result = ev.result || {}
              if (home.includes('الجزائر') || away.includes('الجزائر') ||
                  home.toLowerCase().includes('algeria') || away.toLowerCase().includes('algeria')) {
                // تأكد من أن الرابط مطلق (ليس نسبياً)
                let evLink = ev.url || KOOORA_ALGERIA_URL
                if (evLink && evLink.startsWith('/')) {
                  evLink = 'https://www.kooora.com' + evLink
                }
                matches.push({
                  homeTeam: home,
                  awayTeam: away,
                  homeScore: result.homeScore ?? null,
                  awayScore: result.awayScore ?? null,
                  statusType: result.homeScore !== undefined ? 'finished' : 'upcoming',
                  date: ev.startDate?.slice(0, 10) || '',
                  competition: ev.superEvent?.name || ev.sport || 'كرة القدم',
                  link: evLink,
                  source: 'Kooora-Algeria',
                })
              }
            }
          }
        } catch (_) {}
      }
    }

    // ── Pattern 3: بحث بالنص العام عن نتائج ──────────────────────────────
    if (matches.length === 0) {
      // بحث عن صفوف مباريات عامة تحتوي نتائج مثل "الجزائر 2-0 فرنسا"
      const generalRe = /([\u0600-\u06FF\w\s]{2,30})\s+(\d+)\s*[-–]\s*(\d+)\s+([\u0600-\u06FF\w\s]{2,30})/g
      let gm
      while ((gm = generalRe.exec(html)) !== null) {
        const home = gm[1].trim()
        const away = gm[4].trim()
        if ((home.includes('الجزائر') || away.includes('الجزائر')) &&
            !home.includes('class') && !away.includes('class')) {
          matches.push({
            homeTeam: home,
            awayTeam: away,
            homeScore: parseInt(gm[2]),
            awayScore: parseInt(gm[3]),
            statusType: 'finished',
            date: '',
            competition: '',
            link: KOOORA_ALGERIA_URL,
            source: 'Kooora-Algeria',
          })
        }
      }
    }

    if (matches.length === 0) {
      console.warn('[KooraAlgeria] No matches extracted from team page')
      return null
    }

    const result = {
      matches,
      finished: matches.filter(m => m.statusType === 'finished'),
      upcoming: matches.filter(m => m.statusType === 'upcoming'),
      live: matches.filter(m => m.statusType === 'live'),
      total: matches.length,
      source: 'Kooora-Algeria',
      fetchedAt: new Date().toISOString(),
      pageUrl: KOOORA_ALGERIA_URL,
    }
    KOOORA_ALGERIA_CACHE.set(cKey, result)
    console.log(`[KooraAlgeria] ✅ Scraped ${matches.length} Algeria matches from team page`)
    return result
  } catch (err) {
    console.warn('[KooraAlgeria] Team page fetch failed:', err.message)
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

  // Fallback: Kooora Algeria team page (مصدر غني بالنتائج القديمة والجديدة)
  const kooraAlg = await fetchKooraAlgeriaTeamPage()
  if (kooraAlg?.matches?.length) {
    const filtered = dateStr
      ? kooraAlg.matches.filter(m => m.date && m.date.startsWith(dateStr))
      : kooraAlg.matches
    if (filtered.length) {
      const result = { matches: filtered, source: 'Kooora-Algeria', fetchedAt: new Date().toISOString() }
      CACHE.algMatches.set(cacheKey, result)
      return result
    }
    // حتى لو لا يوجد تصفية بالتاريخ، نُعيد كل المباريات كـ source خام
    const result = { ...kooraAlg }
    CACHE.algMatches.set(cacheKey, result)
    return result
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
 * getAlgeriaTeamMatches – جلب كل مباريات المنتخب الجزائري من صفحة كووورة المخصصة
 * المصدر: kooora.com/كرة-القدم/فريق/الجزائر/مباريات
 * يحتوي على: النتائج القديمة والجديدة + التشكيلة + التهديف + البطاقات
 */
export async function getAlgeriaTeamMatches() {
  const result = await fetchKooraAlgeriaTeamPage()
  if (!result) return UNAVAILABLE
  return result
}

/**
 * searchAlgeriaMatchByOpponent – البحث عن مباراة الجزائر ضد فريق محدد من صفحة كووورة
 * @param {string} opponentAr - اسم الفريق المنافس بالعربية
 * @param {string} opponentEn - اسم الفريق المنافس بالإنجليزية
 */
export async function searchAlgeriaMatchByOpponent(opponentAr = '', opponentEn = '') {
  const data = await fetchKooraAlgeriaTeamPage()
  if (!data?.matches?.length) return UNAVAILABLE

  const oAr = opponentAr.toLowerCase().trim()
  const oEn = opponentEn.toLowerCase().trim()

  const found = data.matches.filter(m => {
    const home = (m.homeTeam || '').toLowerCase()
    const away = (m.awayTeam || '').toLowerCase()
    const opponent = home.includes('الجزائر') || home.includes('algeria') ? away : home
    return (oAr && (opponent.includes(oAr) || oAr.includes(opponent.slice(0, 4)))) ||
           (oEn && (opponent.includes(oEn) || oEn.includes(opponent.slice(0, 4))))
  })

  if (!found.length) return UNAVAILABLE
  return {
    matches: found,
    finished: found.filter(m => m.statusType === 'finished'),
    upcoming: found.filter(m => m.statusType === 'upcoming'),
    total: found.length,
    source: 'Kooora-Algeria',
    fetchedAt: new Date().toISOString(),
    pageUrl: KOOORA_ALGERIA_URL,
  }
}

/**
 * isUnavailable – helper to check if result is the UNAVAILABLE sentinel
 */
export function isUnavailable(result) {
  return result?.unavailable === true
}

// ─────────────────────────────────────────────────────────────
// WC 2026 — 365scores competition ID: 5930
// يجلب مباريات كأس العالم 2026 بتاريخ محدد أو اليوم
// ─────────────────────────────────────────────────────────────
const _WC2026_365_CACHE = makeSimpleCache(5 * 60 * 1000)

// ── قائمة كل المنتخبات المشاركة في كأس العالم 2026 (عربي + إنجليزي) ──────────
const WC2026_VALID_TEAMS = new Set([
  // Group A
  'المكسيك','Mexico','جنوب أفريقيا','South Africa',
  'كوريا الجنوبية','South Korea','Korea Republic','كوريا','Korea',
  'جمهورية التشيك','Czech Republic','Czechia','التشيك',
  // Group B
  'كندا','Canada','البوسنة والهرسك','Bosnia and Herzegovina','Bosnia','البوسنة',
  'قطر','Qatar','سويسرا','Switzerland',
  // Group C
  'البرازيل','Brazil','المغرب','Morocco',
  'هايتي','Haiti','اسكتلندا','Scotland',
  // Group D
  'الولايات المتحدة','USA','United States','أمريكا','America',
  'باراغواي','Paraguay','أستراليا','Australia',
  'تركيا','Turkey','Türkiye',
  // Group E
  'ألمانيا','Germany','كوراساو','Curaçao','Curacao',
  'ساحل العاج','Ivory Coast',"Côte d'Ivoire",'كوت ديفوار',
  'الإكوادور','Ecuador',
  // Group F
  'هولندا','Netherlands','Holland','هولاندا',
  'اليابان','Japan','السويد','Sweden','تونس','Tunisia',
  // Group G
  'بلجيكا','Belgium','مصر','Egypt','إيران','Iran','نيوزيلندا','New Zealand',
  // Group H
  'إسبانيا','Spain','الرأس الأخضر','Cape Verde',
  'السعودية','Saudi Arabia','KSA','أوروغواي','Uruguay',
  // Group I
  'فرنسا','France','السنغال','Senegal','العراق','Iraq','النرويج','Norway',
  // Group J
  'الأرجنتين','Argentina','الجزائر','Algeria',
  'النمسا','Austria','الأردن','Jordan',
  // Group K
  'البرتغال','Portugal','الكونغو الديمقراطية','DR Congo','Congo DR',
  'أوزبكستان','Uzbekistan','كولومبيا','Colombia',
  // Group L
  'إنجلترا','England','كرواتيا','Croatia',
  'غانا','Ghana','بنما','Panama',
])

function isWC2026Team(name = '') {
  if (!name) return false
  if (WC2026_VALID_TEAMS.has(name)) return true
  const low = name.toLowerCase()
  for (const t of WC2026_VALID_TEAMS) {
    if (t.toLowerCase() === low || low.includes(t.toLowerCase()) || t.toLowerCase().includes(low)) return true
  }
  return false
}

export async function fetchWC2026Fixtures365(dateStr = '') {
  const d = dateStr || new Date().toISOString().slice(0, 10)
  const cKey = `wc2026_365_${d}`
  const cached = _WC2026_365_CACHE.get(cKey)
  if (cached) return cached

  const WC_COMP_ID = 5930
  const dateParam = d.replace(/-/g, '')
  const urls = [
    `https://webws.365scores.com/web/games/?appTypeId=5&langId=1&timezoneName=Africa%2FAlgiers&userCountryId=44&competitionIds=${WC_COMP_ID}&dates=${dateParam}`,
    `https://webws.365scores.com/web/games/?appTypeId=5&langId=1&timezoneName=Africa%2FAlgiers&competitionIds=${WC_COMP_ID}&dates=${dateParam}`,
    `https://webws.365scores.com/web/games/?appTypeId=5&langId=1&competitionIds=${WC_COMP_ID}`,
  ]

  for (const url of urls) {
    try {
      const res = await timedFetch(url, { headers: SCORE365_HEADERS, timeout: 12000 })
      if (!res.ok) continue
      const json = await res.json()
      const games = json?.games || []
      if (!games.length) continue

      const matches = games.map(g => {
        const statusType = map365Status(g.status?.id)
        const isLive = statusType === 'live'
        const isFinished = statusType === 'finished'
        const startTs = g.startTime ? new Date(g.startTime) : null
        const gameDate = startTs ? startTs.toISOString().slice(0, 10) : d
        return {
          homeTeam:    g.homeCompetitor?.name  || g.homeCompetitor?.shortName || '',
          awayTeam:    g.awayCompetitor?.name  || g.awayCompetitor?.shortName || '',
          homeScore:   (isLive || isFinished) ? (g.homeCompetitor?.score ?? null) : null,
          awayScore:   (isLive || isFinished) ? (g.awayCompetitor?.score ?? null) : null,
          statusType,
          startTime:   startTs ? startTs.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
          date:        gameDate,
          competition: g.competitionDisplayName || g.competition?.displayName || 'كأس العالم FIFA 2026',
          round:       g.stageName || (g.roundNum ? `الجولة ${g.roundNum}` : 'دور المجموعات'),
          matchId:     g.id,
          link:        g.id ? `https://www.365scores.com/ar/football/match/${g.id}` : 'https://www.365scores.com/ar/football/league/fifa-world-cup-5930',
          source:      '365score',
        }
      }).filter(m => m.homeTeam && m.awayTeam)

      // ── فلترة حسب التاريخ ────────────────────────────────────────────────
      const byDate = dateStr ? matches.filter(m => m.date === d) : matches

      // ── فلترة صارمة: فقط فرق كأس العالم 2026 الرسمية الـ48 ──────────────
      // يمنع دخول مباريات Basketball/NHL/Tennis/etc بسبب خلل في competition ID
      const filtered = byDate.filter(m => isWC2026Team(m.homeTeam) && isWC2026Team(m.awayTeam))

      if (!filtered.length) {
        console.log(`[WC2026:365score] ⚠️ URL returned ${byDate.length} matches but 0 passed WC team filter — skipping`)
        continue
      }

      const result = {
        matches:  filtered,
        live:     filtered.filter(m => m.statusType === 'live'),
        finished: filtered.filter(m => m.statusType === 'finished'),
        upcoming: filtered.filter(m => m.statusType === 'upcoming'),
        total:    filtered.length,
        source:   '365score',
        competitionId: WC_COMP_ID,
        fetchedAt: new Date().toISOString(),
      }
      _WC2026_365_CACHE.set(cKey, result)
      console.log(`[WC2026:365score] ✓ ${filtered.length} WC matches (date=${d}, live=${result.live.length}, done=${result.finished.length})`)
      return result
    } catch (err) {
      console.warn('[WC2026:365score] failed:', err.message)
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// WC 2026 — Kooora dedicated page
// https://www.kooora.com/كرة-القدم/مسابقة/كأس-العالم/مباريات/70excpe1synn9kadnbppahdn7
// ─────────────────────────────────────────────────────────────
const _KOORA_WC2026_CACHE = makeSimpleCache(8 * 60 * 1000)
export const KOORA_WC2026_URL = 'https://www.kooora.com/%D9%83%D8%B1%D8%A9-%D8%A7%D9%84%D9%82%D8%AF%D9%85/%D9%85%D8%B3%D8%A7%D8%A8%D9%82%D8%A9/%D9%83%D8%A7%D9%94%D8%B3-%D8%A7%D9%84%D8%B9%D8%A7%D9%84%D9%85/%D9%85%D8%A8%D8%A7%D8%B1%D9%8A%D8%A7%D8%AA/70excpe1synn9kadnbppahdn7'

export async function fetchKooraWC2026(dateStr = '') {
  // Kooora is fully JS-rendered — jina.ai only returns nav menus, no match data.
  // Kept as a no-op so the footer link still appears; actual data comes from jdwel/FotMob.
  console.log('[WC2026:Kooora] skipped — JS-rendered page, no parseable data via jina.ai')
  return null
}

// ─────────────────────────────────────────────────────────────
// WC 2026 — jdwel.com fixtures page
// https://jdwel.com/2026-world-cup-fixtures/
// ─────────────────────────────────────────────────────────────
const _JDWEL_WC2026_CACHE = makeSimpleCache(8 * 60 * 1000)
export const JDWEL_WC2026_URL = 'https://jdwel.com/2026-world-cup-fixtures/'

export async function fetchJdwelWC2026(dateStr = '') {
  const d = dateStr || new Date().toISOString().slice(0, 10)
  const cKey = `jdwel_wc2026_${d}`
  const cached = _JDWEL_WC2026_CACHE.get(cKey)
  if (cached) return cached

  // jdwel markdown format from jina.ai:
  // *   انتهت  كوريا الجنوبية![Image 6: كوريا الجنوبية](url)  2 - 1 2026-06-12 05:00  ![Image 7: التشيك](url) التشيك
  // *   لم تبدأ  كندا![Image 8: كندا](url)  0 - 0 2026-06-12 22:00  ![Image 9: البوسنة والهرسك](url) البوسنة والهرسك
  // Status words: انتهت | مباشر | لم تبدأ
  // The away team name is in the alt text of the LAST image: ![Image N: TEAM_NAME]

  const JDWEL_MATCH_RE = /\*\s+(انتهت|مباشر|لم تبدأ)\s+([\u0600-\u06FFa-zA-Z][^!\n]{1,35}?)!\[Image\s+\d+:[^\]]*\]\([^\)]+\)\s+(\d+)\s*-\s*(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})[\s\d]*!\[Image\s+\d+:\s*([^\]]+)\]/g

  try {
    const res = await timedFetch(`https://r.jina.ai/${JDWEL_WC2026_URL}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/124',
        'Accept': 'text/plain,text/markdown,*/*',
        'Accept-Language': 'ar,en;q=0.9',
      },
      timeout: 15000,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    if (!text || text.length < 300) throw new Error('empty response')

    const matches = []
    let m
    JDWEL_MATCH_RE.lastIndex = 0
    while ((m = JDWEL_MATCH_RE.exec(text)) !== null) {
      const statusWord = m[1]          // انتهت | مباشر | لم تبدأ
      const homeTeam   = m[2].replace(/[*_`#\s]+$/, '').trim()
      const homeScore  = parseInt(m[3])
      const awayScore  = parseInt(m[4])
      const matchDate  = m[5]          // YYYY-MM-DD
      const matchTime  = m[6]          // HH:MM (UTC)
      const awayTeam   = m[7].trim()   // from image alt text

      if (!homeTeam || !awayTeam || homeTeam.length < 2 || awayTeam.length < 2) continue
      // فلترة حسب التاريخ المطلوب
      if (dateStr && matchDate !== d) continue

      let statusType = 'upcoming'
      if (statusWord === 'انتهت') statusType = 'finished'
      else if (statusWord === 'مباشر') statusType = 'live'

      // تحويل الوقت من UTC إلى توقيت الجزائر (UTC+1)
      let startTime = ''
      try {
        const [hh, mm] = matchTime.split(':').map(Number)
        const algHour = (hh + 1) % 24
        startTime = `${String(algHour).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
      } catch (_) { startTime = matchTime }

      matches.push({
        homeTeam,
        awayTeam,
        homeScore: statusType === 'upcoming' ? null : homeScore,
        awayScore: statusType === 'upcoming' ? null : awayScore,
        statusType,
        startTime,
        date: matchDate,
        competition: 'كأس العالم FIFA 2026',
        source: 'jdwel',
        link: JDWEL_WC2026_URL,
      })
    }

    if (!matches.length) {
      console.log('[WC2026:jdwel] no matches found in jina.ai response')
      return null
    }

    const result = {
      matches,
      live:     matches.filter(x => x.statusType === 'live'),
      finished: matches.filter(x => x.statusType === 'finished'),
      upcoming: matches.filter(x => x.statusType === 'upcoming'),
      total:    matches.length,
      source:   'jdwel',
      fetchedAt: new Date().toISOString(),
    }
    _JDWEL_WC2026_CACHE.set(cKey, result)
    console.log(`[WC2026:jdwel] ✓ ${matches.length} matches (${result.finished.length} finished, ${result.upcoming.length} upcoming, ${result.live.length} live)`)
    return result
  } catch (err) {
    console.warn('[WC2026:jdwel] failed:', err.message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────
// WC 2026 — beIN Sports نتائج مباشرة
// https://www.beinsports.com/ar-mena/نتائج-مباشرة-page_scores
// ─────────────────────────────────────────────────────────────
const _BEIN_WC2026_CACHE = makeSimpleCache(3 * 60 * 1000)
export const BEIN_WC2026_URL = 'https://www.beinsports.com/ar-mena/%D9%86%D8%AA%D8%A7%D8%A6%D8%AC-%D9%85%D8%A8%D8%A7%D8%B4%D8%B1%D8%A9-page_scores'

export async function fetchBeinSportsWC2026(_dateStr = '') {
  // beIN Sports is blocked by jina.ai (DDoS protection) — kept as reference link only.
  // Data comes from jdwel + FotMob scraper.
  console.log('[WC2026:beIN] skipped — blocked by jina.ai DDoS protection')
  return null
}

// ─────────────────────────────────────────────────────────────
// WC 2026 — FotMob WC2026 data (JSON API أولاً → jina.ai احتياطي)
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// WC 2026 — ESPN API (مصدر رئيسي — يعمل بدون حجب)
// https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard
// ─────────────────────────────────────────────────────────────
const _ESPN_WC2026_CACHE = makeSimpleCache(3 * 60 * 1000)

const ESPN_TEAM_EN_TO_AR = {
  'Algeria':'الجزائر','Argentina':'الأرجنتين','Austria':'النمسا','Jordan':'الأردن',
  'Mexico':'المكسيك','South Africa':'جنوب أفريقيا','South Korea':'كوريا الجنوبية',
  'Czech Republic':'جمهورية التشيك','Czechia':'جمهورية التشيك','Czechia':'التشيك',
  'Canada':'كندا','Bosnia-Herzegovina':'البوسنة والهرسك','Bosnia and Herzegovina':'البوسنة والهرسك',
  'Qatar':'قطر','Switzerland':'سويسرا','Brazil':'البرازيل','Morocco':'المغرب',
  'Haiti':'هايتي','Scotland':'اسكتلندا','USA':'الولايات المتحدة','United States':'الولايات المتحدة',
  'Paraguay':'باراغواي','Australia':'أستراليا','Türkiye':'تركيا','Turkey':'تركيا',
  'Germany':'ألمانيا','Curacao':'كوراساو','Curaçao':'كوراساو',
  'Ivory Coast':'ساحل العاج','Ecuador':'الإكوادور','Netherlands':'هولندا','Japan':'اليابان',
  'Sweden':'السويد','Tunisia':'تونس','Belgium':'بلجيكا','Egypt':'مصر',
  'Iran':'إيران','New Zealand':'نيوزيلندا','Spain':'إسبانيا',
  'Cape Verde':'الرأس الأخضر','Saudi Arabia':'السعودية','Uruguay':'أوروغواي',
  'France':'فرنسا','Senegal':'السنغال','Iraq':'العراق','Norway':'النرويج',
  'Portugal':'البرتغال','DR Congo':'الكونغو الديمقراطية','Congo DR':'الكونغو الديمقراطية',
  'Uzbekistan':'أوزبكستان','Colombia':'كولومبيا','England':'إنجلترا',
  'Croatia':'كرواتيا','Ghana':'غانا','Panama':'بنما',
}

function espnTranslateTeam(name = '') {
  if (!name) return name
  if (ESPN_TEAM_EN_TO_AR[name]) return ESPN_TEAM_EN_TO_AR[name]
  for (const [en, ar] of Object.entries(ESPN_TEAM_EN_TO_AR)) {
    if (name.toLowerCase() === en.toLowerCase()) return ar
  }
  return name
}

/**
 * جلب مباريات WC2026 من ESPN API (المصدر الوحيد العامل — FotMob محجوب 451)
 * يدعم التاريخ المطلوب + يوم قبله/بعده لتصحيح فوارق المناطق الزمنية
 */
export async function fetchESPNWC2026(dateStr = '') {
  const targetDate = dateStr || new Date(Date.now() + 3600000).toISOString().slice(0, 10)
  const cKey = `espn_wc2026_${targetDate}`
  const cached = _ESPN_WC2026_CACHE.get(cKey)
  if (cached) return cached

  // نجلب التاريخ المطلوب + يوم قبله لتغطية فوارق UTC بين الجزائر وأمريكا
  const prevDate = new Date(new Date(targetDate + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10)
  const datesToFetch = [...new Set([prevDate, targetDate])]

  const allMatches = []
  for (const d of datesToFetch) {
    try {
      const dFmt = d.replace(/-/g, '')
      const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=${dFmt}`
      const res = await timedFetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/125' },
        timeout: 10000,
      })
      if (!res.ok) continue
      const data = await res.json()
      for (const e of (data.events || [])) {
        const comp = e.competitions?.[0]
        if (!comp) continue
        const comps = comp.competitors || []
        const home = comps.find(c => c.homeAway === 'home')
        const away = comps.find(c => c.homeAway === 'away')
        if (!home || !away) continue
        const statusName = comp.status?.type?.name || ''
        const isFinished = statusName === 'STATUS_FULL_TIME' || statusName === 'STATUS_FINAL' || statusName === 'STATUS_FT'
        const isLive = statusName?.includes('IN_PROGRESS') || statusName?.includes('LIVE') || statusName?.includes('HALF')
        const statusType = isFinished ? 'finished' : isLive ? 'live' : 'upcoming'
        const homeScore = (isFinished || isLive) && home.score != null ? parseInt(home.score) : null
        const awayScore = (isFinished || isLive) && away.score != null ? parseInt(away.score) : null
        // الوقت: نحوّل UTC إلى توقيت الجزائر (UTC+1)
        let startTime = ''
        const gameDate = comp.date || e.date
        if (gameDate) {
          try {
            const matchUTC = new Date(gameDate)
            const algHour = (matchUTC.getUTCHours() + 1) % 24
            const algMin  = matchUTC.getUTCMinutes()
            startTime = `${String(algHour).padStart(2,'0')}:${String(algMin).padStart(2,'0')}`
          } catch (_) {}
        }
        allMatches.push({
          homeTeam:  espnTranslateTeam(home.team?.displayName || home.team?.name || ''),
          awayTeam:  espnTranslateTeam(away.team?.displayName || away.team?.name || ''),
          homeScore, awayScore, statusType, startTime,
          date: targetDate,
          competition: 'كأس العالم FIFA 2026',
          source: 'ESPN',
          espnStatus: statusName,
        })
      }
    } catch (err) {
      console.warn(`[WC2026:ESPN] error for ${d}:`, err.message)
    }
  }

  if (!allMatches.length) {
    console.log(`[WC2026:ESPN] no matches found for ${targetDate}`)
    return null
  }

  const result = {
    matches: allMatches,
    live:     allMatches.filter(m => m.statusType === 'live'),
    finished: allMatches.filter(m => m.statusType === 'finished'),
    upcoming: allMatches.filter(m => m.statusType === 'upcoming'),
    total: allMatches.length,
    source: 'ESPN',
    fetchedAt: new Date().toISOString(),
  }
  _ESPN_WC2026_CACHE.set(cKey, result)
  console.log(`[WC2026:ESPN] ✓ ${allMatches.length} matches (${result.finished.length} FT, ${result.live.length} live, ${result.upcoming.length} upcoming) for ${targetDate}`)
  return result
}

const _FOTMOB_SCRAPER_CACHE = makeSimpleCache(4 * 60 * 1000)
export const FOTMOB_WC2026_URL = 'https://www.fotmob.com/ar/leagues/77/fixtures/world-cup?group=by-date'

// ── جدول ترجمة شامل: إنجليزي → عربي لكل فرق كأس العالم ──────────────────
const TEAM_EN_TO_AR = {
  'Algeria':'الجزائر','Argentina':'الأرجنتين','Austria':'النمسا','Jordan':'الأردن',
  'Mexico':'المكسيك','South Africa':'جنوب أفريقيا','South Korea':'كوريا الجنوبية',
  'Czech Republic':'جمهورية التشيك','Czechia':'التشيك','Czech':'التشيك',
  'Canada':'كندا','Bosnia and Herzegovina':'البوسنة والهرسك','Bosnia':'البوسنة والهرسك',
  'Qatar':'قطر','Switzerland':'سويسرا','Brazil':'البرازيل','Morocco':'المغرب',
  'Haiti':'هايتي','Scotland':'اسكتلندا','USA':'الولايات المتحدة',
  'United States':'الولايات المتحدة','US':'الولايات المتحدة',
  'Paraguay':'باراغواي','Australia':'أستراليا','Turkey':'تركيا','Türkiye':'تركيا',
  'Germany':'ألمانيا','Curacao':'كوراساو','Curaçao':'كوراساو',
  "Ivory Coast":'ساحل العاج',"Côte d\'Ivoire":'ساحل العاج',
  'Ecuador':'الإكوادور','Netherlands':'هولندا','Japan':'اليابان',
  'Sweden':'السويد','Tunisia':'تونس','Belgium':'بلجيكا','Egypt':'مصر',
  'Iran':'إيران','New Zealand':'نيوزيلندا','Spain':'إسبانيا',
  'Cape Verde':'الرأس الأخضر','Saudi Arabia':'السعودية','Uruguay':'أوروغواي',
  'France':'فرنسا','Senegal':'السنغال','Iraq':'العراق','Norway':'النرويج',
  'Portugal':'البرتغال','DR Congo':'الكونغو الديمقراطية','Congo DR':'الكونغو الديمقراطية',
  'Uzbekistan':'أوزبكستان','Colombia':'كولومبيا','England':'إنجلترا',
  'Croatia':'كرواتيا','Ghana':'غانا','Panama':'بنما','Greece':'اليونان',
  'Italy':'إيطاليا','Hungary':'المجر','Bahrain':'البحرين','Serbia':'صربيا',
  'Ukraine':'أوكرانيا','Denmark':'الدنمارك','Romania':'رومانيا','Poland':'بولندا',
  'Nigeria':'نيجيريا','Cameroon':'الكاميرون','Mali':'مالي','Angola':'أنغولا',
  'Venezuela':'فنزويلا','Peru':'بيرو','Costa Rica':'كوستاريكا',
  'Honduras':'هندوراس','Jamaica':'جامايكا','Chile':'تشيلي','Albania':'ألبانيا',
  'Georgia':'جورجيا','Slovakia':'سلوفاكيا','Slovenia':'سلوفينيا',
  'Montenegro':'الجبل الأسود','North Macedonia':'مقدونيا الشمالية',
  'Mozambique':'موزمبيق','Zambia':'زامبيا','Tanzania':'تنزانيا',
  'Burkina Faso':'بوركينا فاسو','Guinea':'غينيا','Kuwait':'الكويت',
  'UAE':'الإمارات','United Arab Emirates':'الإمارات','Oman':'عمان',
  'Lebanon':'لبنان','Syria':'سوريا','Finland':'فنلندا','Albania':'ألبانيا',
  'Kazakhstan':'كازاخستان','Belarus':'بيلاروسيا','Estonia':'إستونيا',
  'Lithuania':'ليتوانيا','Latvia':'لاتفيا',
}

function translateTeam(name = '') {
  if (!name) return name
  if (TEAM_EN_TO_AR[name]) return TEAM_EN_TO_AR[name]
  const lower = name.toLowerCase()
  for (const [en, ar] of Object.entries(TEAM_EN_TO_AR)) {
    if (lower === en.toLowerCase()) return ar
  }
  return name
}

/**
 * جلب مباريات WC2026 لتاريخ محدد
 * المصدر الأول: FotMob JSON API (موثوق، يعمل لأي تاريخ)
 * المصدر الثاني: jina.ai scraper (احتياطي فقط)
 */
export async function fetchFotmobWC2026Scraper(dateStr = '') {
  const d = dateStr || new Date(Date.now() + 3600000).toISOString().slice(0, 10)
  const cKey = `fotmob_wc2026_v3_${d}`
  const cached = _FOTMOB_SCRAPER_CACHE.get(cKey)
  if (cached) return cached

  // ── المصدر الصفري: ESPN API (الوحيد العامل — FotMob محجوب 451) ──────────
  try {
    const espnRes = await fetchESPNWC2026(d)
    if (espnRes?.matches?.length) {
      _FOTMOB_SCRAPER_CACHE.set(cKey, espnRes)
      return espnRes
    }
  } catch (espnErr) {
    console.warn(`[WC2026:ESPN] failed for ${d}:`, espnErr.message)
  }

  // ── المصدر الأول: FotMob JSON API (محجوب في الغالب — 451) ────────────────
  try {
    const dayData = await fetchFotmobDay(d)
    if (dayData?.matches?.length) {
      const WC_IDS = new Set([77, 599, 9946, 231])
      const WC_RE  = /world\s*cup|كأس\s*العالم|fifa\s*world|مونديال/i
      const wcRaw  = dayData.matches.filter(m =>
        WC_IDS.has(Number(m.leagueId)) || WC_RE.test(m.league || '')
      )
      if (wcRaw.length) {
        const wcMatches = wcRaw.map(m => ({
          ...m,
          homeTeam: translateTeam(m.homeTeam),
          awayTeam: translateTeam(m.awayTeam),
          date: d,
          competition: 'كأس العالم FIFA 2026',
          source: 'FotMob',
        }))
        const result = {
          matches: wcMatches,
          live:     wcMatches.filter(x => x.statusType === 'live'),
          finished: wcMatches.filter(x => x.statusType === 'finished'),
          upcoming: wcMatches.filter(x => x.statusType === 'upcoming'),
          total:    wcMatches.length,
          source:   'FotMob',
          fetchedAt: new Date().toISOString(),
        }
        _FOTMOB_SCRAPER_CACHE.set(cKey, result)
        console.log(`[WC2026:FotMob-api] ✓ ${wcMatches.length} matches (${result.finished.length} FT, ${result.upcoming.length} upcoming, ${result.live.length} live) on ${d}`)
        return result
      }
    }
  } catch (apiErr) {
    console.warn(`[WC2026:FotMob-api] JSON API failed on ${d}:`, apiErr.message)
  }

  // ── المصدر الثاني: jina.ai scraper (احتياطي) ─────────────────────────────
  try {
    const _dzYesterday = new Date(Date.now() + 3600000 - 86400000).toISOString().slice(0, 10)
    const isYest = d === _dzYesterday

    const res = await timedFetch(`https://r.jina.ai/${FOTMOB_WC2026_URL}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/124',
        'Accept': 'text/plain,text/markdown,*/*', 'Accept-Language': 'ar,en;q=0.9',
        'X-Return-Format': 'markdown' },
      timeout: 15000,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    if (!text || text.length < 300) throw new Error('empty response')

    let section
    if (isYest) {
      const m = text.match(/###\s+(?:الأمس|أمس|البارحة|Yesterday)\s*\n([\s\S]*?)(?=###\s|\n---|\n##\s|$)/)
      section = m ? m[1] : text
    } else {
      const m = text.match(/###\s+(?:اليوم|Today)\s*\n([\s\S]*?)(?=###\s|\n---|\n##\s|$)/)
      section = m ? m[1] : text
    }

    const matches = []
    let fm
    const FINISHED_RE = /\[([^\[!\]]{2,35}?)\s*!\[[^\]]*\]\([^\)]+\)\s+FT\s+(\d+)\s*-\s*(\d+)\s+FT\s+([^\[!\]]{2,35}?)\s*!\[[^\]]*\]\([^\)]+\)\]\((https:\/\/www\.fotmob\.com\/ar\/matches\/[^\)]+)\)/g
    FINISHED_RE.lastIndex = 0
    while ((fm = FINISHED_RE.exec(section)) !== null) {
      const h = fm[1].trim(), a = fm[4].trim()
      if (!h || !a || h.length < 2 || a.length < 2) continue
      matches.push({ homeTeam:h, awayTeam:a, homeScore:parseInt(fm[2]), awayScore:parseInt(fm[3]),
        statusType:'finished', startTime:'', date:d,
        competition:'كأس العالم FIFA 2026', source:'FotMob', link:fm[5] })
    }
    const UPCOMING_RE = /\[([^\[!\]]{2,35}?)\s*!\[[^\]]*\]\([^\)]+\)\s+(\d+:\d+[صم]?)\s+([^\[!\]]{2,35}?)\s*!\[[^\]]*\]\([^\)]+\)\]\((https:\/\/www\.fotmob\.com\/ar\/matches\/[^\)]+)\)/g
    UPCOMING_RE.lastIndex = 0
    while ((fm = UPCOMING_RE.exec(section)) !== null) {
      const h = fm[1].trim(), a = fm[3].trim()
      if (!h || !a || h.length < 2 || a.length < 2) continue
      if (matches.some(x => x.homeTeam.toLowerCase() === h.toLowerCase() || x.awayTeam.toLowerCase() === a.toLowerCase())) continue
      // تحويل التوقيت العربي (10:00م → 22:00) إلى 24h UTC
      const rawT = fm[2] || ''
      const tMatch = rawT.match(/^(\d{1,2}):(\d{2})\s*([صم])?/)
      let normTime = rawT
      if (tMatch) {
        let th = parseInt(tMatch[1], 10), tm = parseInt(tMatch[2], 10)
        if (tMatch[3] === 'م' && th < 12) th += 12
        else if (tMatch[3] === 'ص' && th === 12) th = 0
        normTime = `${String(th).padStart(2,'0')}:${String(tm).padStart(2,'0')}`
      }
      matches.push({ homeTeam:h, awayTeam:a, homeScore:null, awayScore:null,
        statusType:'upcoming', startTime:normTime, date:d,
        competition:'كأس العالم FIFA 2026', source:'FotMob', link:fm[4] })
    }
    const LIVE_RE = /\[([^\[!\]]{2,35}?)\s*!\[[^\]]*\]\([^\)]+\)\s+(?:LIVE|مباشر)\s+(\d+)\s*-\s*(\d+)\s+([^\[!\]]{2,35}?)\s*!\[[^\]]*\]\([^\)]+\)\]\((https:\/\/www\.fotmob\.com\/ar\/matches\/[^\)]+)\)/g
    LIVE_RE.lastIndex = 0
    while ((fm = LIVE_RE.exec(section)) !== null) {
      const h = fm[1].trim(), a = fm[4].trim()
      if (!h || !a) continue
      matches.push({ homeTeam:h, awayTeam:a, homeScore:parseInt(fm[2]), awayScore:parseInt(fm[3]),
        statusType:'live', startTime:'', date:d,
        competition:'كأس العالم FIFA 2026', source:'FotMob', link:fm[5] })
    }

    if (!matches.length) {
      console.log(`[WC2026:FotMob-scraper] no matches in jina.ai response for ${d}`)
      return null
    }
    const result = { matches,
      live:matches.filter(x=>x.statusType==='live'),
      finished:matches.filter(x=>x.statusType==='finished'),
      upcoming:matches.filter(x=>x.statusType==='upcoming'),
      total:matches.length, source:'FotMob', fetchedAt:new Date().toISOString() }
    _FOTMOB_SCRAPER_CACHE.set(cKey, result)
    console.log(`[WC2026:FotMob-scraper] ✓ ${matches.length} via jina.ai fallback on ${d}`)
    return result
  } catch (err) {
    console.warn('[WC2026:FotMob] both sources failed:', err.message)
    return null
  }
}

// ─── ESPN Match Details — أهداف + بطاقات + إحصائيات مباراة محددة ──────────────
const _ESPN_DETAILS_CACHE = makeSimpleCache(30 * 60 * 1000)

export async function fetchESPNMatchDetails(eventId) {
  const cKey = `espn_detail_${eventId}`
  const cached = _ESPN_DETAILS_CACHE.get(cKey)
  if (cached) return cached
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${eventId}`
    const r = await timedFetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/125' },
      timeout: 8000,
    })
    if (!r.ok) return null
    const data = await r.json()
    const keyEvents = data.keyEvents || []

    // ── الأهداف ────────────────────────────────────────────────────────────────
    const goals = []
    for (const ev of keyEvents) {
      if (!ev.scoringPlay) continue
      let player = (ev.shortText || '').replace(/\s+(Goal|Own Goal|Penalty|Header|goal[-\s]header|Buts!|gol).*/i, '').trim()
      const minute = ev.clock?.displayValue || ''
      const teamName = ev.team?.displayName || ''
      const isOG = (ev.type?.type || '').includes('own') || (ev.shortText || '').toLowerCase().includes('own goal')
      goals.push({ player, minute, team: teamName, isOwnGoal: isOG })
    }

    // ── البطاقات الصفراء ──────────────────────────────────────────────────────
    const yellowCards = []
    for (const ev of keyEvents) {
      if (ev.type?.type !== 'yellow-card') continue
      const player = (ev.shortText || '').replace(/\s+Yellow Card.*/i, '').trim()
      yellowCards.push({ player, minute: ev.clock?.displayValue || '', team: ev.team?.displayName || '' })
    }

    // ── البطاقات الحمراء ──────────────────────────────────────────────────────
    const redCards = []
    for (const ev of keyEvents) {
      if (ev.type?.type !== 'red-card') continue
      const player = (ev.shortText || '').replace(/\s+Red Card.*/i, '').trim()
      redCards.push({ player, minute: ev.clock?.displayValue || '', team: ev.team?.displayName || '' })
    }

    // ── الإحصائيات ────────────────────────────────────────────────────────────
    const header = data.header?.competitions?.[0]
    const homeCompetitor = (header?.competitors || []).find(c => c.homeAway === 'home')
    const awayCompetitor = (header?.competitors || []).find(c => c.homeAway === 'away')
    const homeESPN = homeCompetitor?.team?.displayName || ''
    const awayESPN = awayCompetitor?.team?.displayName || ''

    const teamsStats = data.boxscore?.teams || []
    const findStats = (name) => teamsStats.find(t => t.team?.displayName === name)?.statistics || []

    function extractStats(statArr) {
      const obj = {}
      for (const s of statArr) obj[s.label] = s.displayValue
      return {
        possession: obj['Possession'] || obj['Ball Possession'] || null,
        shots: obj['SHOTS'] || obj['Shots'] || null,
        shotsOnTarget: obj['Shots on Target'] || null,
        corners: obj['Corner Kicks'] || null,
        saves: obj['Saves'] || null,
        fouls: obj['Fouls'] || null,
        yellowCards: obj['Yellow Cards'] || null,
        redCards: obj['Red Cards'] || null,
      }
    }

    const allStatsArr = teamsStats.map(t => ({ name: t.team?.displayName, stats: extractStats(t.statistics || []) }))
    const homeStats = findStats(homeESPN).length ? extractStats(findStats(homeESPN)) : (allStatsArr[0]?.stats || {})
    const awayStats = findStats(awayESPN).length ? extractStats(findStats(awayESPN)) : (allStatsArr[1]?.stats || {})

    const result = { goals, yellowCards, redCards, stats: { home: homeStats, away: awayStats }, espnHomeTeam: homeESPN, espnAwayTeam: awayESPN }
    _ESPN_DETAILS_CACHE.set(cKey, result)
    console.log(`[ESPN:Details] ✓ event=${eventId} goals=${goals.length} yellows=${yellowCards.length} reds=${redCards.length}`)
    return result
  } catch (err) {
    console.warn(`[ESPN:Details] error event=${eventId}:`, err.message)
    return null
  }
}

export { UNAVAILABLE, APIF_LEAGUES }