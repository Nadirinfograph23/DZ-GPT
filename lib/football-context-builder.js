/**
 * football-context-builder.js
 * بناء سياق كرة القدم بالجداول والأعلام لكل النماذج
 *
 * Sources (priority order):
 *   365score → Koora → FotMob → API-Football → SofaScore
 *
 * يُصدِّر:
 *   buildFootballContext(query, dateStr) → async → { type, content, source, fetchedAt } | null
 *   enrichQueryContextAsync(query, history) → async wrapper مع حقن بيانات كرة القدم
 */

import {
  getLiveMatches,
  getFixtures,
  getStandings,
  getPlayerIdentity,
  getAlgeriaMatches,
  get365ScoreMatches,
  get365ScoreStandings,
  getKooraMatches,
  isUnavailable,
  APIF_LEAGUES,
} from './sports-data-router.js'

// ─────────────────────────────────────────────────────────────
// أعلام الدول والدوريات (Emoji flags)
// ─────────────────────────────────────────────────────────────
export const COUNTRY_FLAGS = {
  'algeria': '🇩🇿', 'algérie': '🇩🇿', 'الجزائر': '🇩🇿', 'الجزائري': '🇩🇿',
  'england': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'إنجلترا': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'anglais': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'spain': '🇪🇸', 'إسبانيا': '🇪🇸', 'espagne': '🇪🇸',
  'germany': '🇩🇪', 'ألمانيا': '🇩🇪', 'allemagne': '🇩🇪',
  'italy': '🇮🇹', 'إيطاليا': '🇮🇹', 'italie': '🇮🇹',
  'france': '🇫🇷', 'فرنسا': '🇫🇷',
  'portugal': '🇵🇹', 'البرتغال': '🇵🇹',
  'netherlands': '🇳🇱', 'هولندا': '🇳🇱', 'pays-bas': '🇳🇱',
  'belgium': '🇧🇪', 'بلجيكا': '🇧🇪', 'belgique': '🇧🇪',
  'turkey': '🇹🇷', 'تركيا': '🇹🇷', 'turquie': '🇹🇷',
  'saudi arabia': '🇸🇦', 'السعودية': '🇸🇦', 'arabie saoudite': '🇸🇦',
  'morocco': '🇲🇦', 'المغرب': '🇲🇦', 'maroc': '🇲🇦',
  'egypt': '🇪🇬', 'مصر': '🇪🇬', 'égypte': '🇪🇬',
  'tunisia': '🇹🇳', 'تونس': '🇹🇳', 'tunisie': '🇹🇳',
  'senegal': '🇸🇳', 'السنغال': '🇸🇳', 'sénégal': '🇸🇳',
  'nigeria': '🇳🇬', 'نيجيريا': '🇳🇬',
  'ivory coast': '🇨🇮', 'ساحل العاج': '🇨🇮', 'côte d\'ivoire': '🇨🇮',
  'ghana': '🇬🇭', 'غانا': '🇬🇭',
  'cameroon': '🇨🇲', 'الكاميرون': '🇨🇲', 'cameroun': '🇨🇲',
  'mali': '🇲🇱', 'مالي': '🇲🇱',
  'brazil': '🇧🇷', 'البرازيل': '🇧🇷', 'brésil': '🇧🇷',
  'argentina': '🇦🇷', 'الأرجنتين': '🇦🇷',
  'uruguay': '🇺🇾', 'أوروغواي': '🇺🇾',
  'united states': '🇺🇸', 'usa': '🇺🇸',
  'japan': '🇯🇵', 'اليابان': '🇯🇵',
  'south korea': '🇰🇷', 'كوريا': '🇰🇷',
  'australia': '🇦🇺', 'أستراليا': '🇦🇺',
  'europe': '🇪🇺', 'أوروبا': '🇪🇺',
  'africa': '🌍', 'أفريقيا': '🌍',
  'world': '🌐', 'العالم': '🌐',
}

export const LEAGUE_FLAGS = {
  'الرابطة المحترفة': '🇩🇿', 'رابطة محترفة': '🇩🇿', 'lfp': '🇩🇿', 'ligue pro': '🇩🇿', 'algerian': '🇩🇿',
  'premier league': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'الدوري الإنجليزي': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'البريميرليغ': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'english premier': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'la liga': '🇪🇸', 'الدوري الإسباني': '🇪🇸', 'الليغا': '🇪🇸', 'laliga': '🇪🇸',
  'bundesliga': '🇩🇪', 'الدوري الألماني': '🇩🇪', 'البوندسليغا': '🇩🇪',
  'serie a': '🇮🇹', 'الدوري الإيطالي': '🇮🇹', 'السيريا': '🇮🇹',
  'ligue 1': '🇫🇷', 'الدوري الفرنسي': '🇫🇷', 'الليغ 1': '🇫🇷',
  'champions league': '🏆', 'دوري أبطال': '🏆', 'تشامبيونز': '🏆', 'دوري الأبطال': '🏆', 'ucl': '🏆',
  'europa league': '🌍', 'الدوري الأوروبي': '🌍', 'يوروبا ليغ': '🌍',
  'conference league': '🌿', 'الكونفرنس': '🌿',
  'world cup': '🌐', 'كأس العالم': '🌐', 'مونديال': '🌐', 'fifa': '🌐',
  'africa cup': '🌍', 'أمم أفريقيا': '🌍', 'كان': '🌍', 'afcon': '🌍',
  'euro': '🇪🇺', 'يورو': '🇪🇺', 'أمم أوروبا': '🇪🇺',
  'saudi': '🇸🇦', 'الدوري السعودي': '🇸🇦', 'روشن': '🇸🇦', 'roshn': '🇸🇦',
  'copa del rey': '🏆🇪🇸',
  'fa cup': '🏆🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'copa america': '🏆🌎',
  'nations league': '🌍', 'دوري الأمم': '🌍',
  'caf': '🌍', 'كاف': '🌍',
}

export function getLeagueFlag(league = '', country = '') {
  const q = (league + ' ' + country).toLowerCase()
  for (const [key, flag] of Object.entries(LEAGUE_FLAGS)) {
    if (q.includes(key.toLowerCase())) return flag
  }
  for (const [key, flag] of Object.entries(COUNTRY_FLAGS)) {
    if (q.includes(key.toLowerCase())) return flag
  }
  return '⚽'
}

export function getCountryFlag(country = '') {
  const c = country.toLowerCase()
  for (const [key, flag] of Object.entries(COUNTRY_FLAGS)) {
    if (c.includes(key.toLowerCase())) return flag
  }
  return '🏳'
}

// ─────────────────────────────────────────────────────────────
// تنسيق المباريات والجداول
// ─────────────────────────────────────────────────────────────
export function statusEmoji(statusType = '') {
  const s = statusType.toLowerCase()
  if (s === 'live' || s === 'inprogress') return '🔴 LIVE'
  if (s === 'finished' || s === 'ft')     return '✅'
  if (s === 'canceled' || s === 'postponed') return '❌'
  return '🕐'
}

export function formatScore(m) {
  if (m.homeScore !== null && m.homeScore !== undefined &&
      m.awayScore !== null && m.awayScore !== undefined) {
    return `${m.homeScore} - ${m.awayScore}`
  }
  return m.startTime ? `[${m.startTime}]` : 'vs'
}

export function formatMatchRow(m) {
  const flag = getLeagueFlag(m.league || m.competition || '', m.country || '')
  const st   = statusEmoji(m.statusType || m.status || '')
  const sc   = formatScore(m)
  const min  = m.minutePlayed ? ` ${m.minutePlayed}'` : ''
  const link = m.link ? ` → [365score/كووورة](${m.link})` : ''
  return `${st}${min} ${flag} **${m.homeTeam}** ${sc} **${m.awayTeam}**${link}`
}

export function formatStandingsTable(standings, leagueName = '', flag = '⚽') {
  if (!standings?.length) return ''
  const header = leagueName ? `\n${flag} **${leagueName}**\n` : '\n'
  const lines = [
    header,
    '| # | الفريق | ل | ف | ت | خ | ف | ض | الفارق | **ن** |',
    '|---|--------|---|---|---|---|---|---|--------|-------|',
  ]
  for (const r of standings.slice(0, 20)) {
    const rank  = r.rank || r.pos || ''
    const team  = r.team || r.name || ''
    const p     = r.played ?? r.mp ?? 0
    const w     = r.wins ?? r.won ?? r.w ?? 0
    const d     = r.draws ?? r.drawn ?? r.d ?? 0
    const l     = r.losses ?? r.lost ?? r.l ?? 0
    const gf    = r.gf ?? r.scored ?? r.goalsFor ?? 0
    const ga    = r.ga ?? r.received ?? r.goalsAgainst ?? 0
    const gd    = r.gd ?? r.goalsDiff ?? (gf - ga) ?? 0
    const pts   = r.points ?? r.pts ?? 0
    const gds   = gd >= 0 ? `+${gd}` : `${gd}`
    lines.push(`| ${rank} | ${team} | ${p} | ${w} | ${d} | ${l} | ${gf} | ${ga} | ${gds} | **${pts}** |`)
  }
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────
// كشف نوع استعلام كرة القدم
// ─────────────────────────────────────────────────────────────
export function detectFootballQueryType(query = '') {
  const q = query.toLowerCase()
  return {
    isLive:      /مباشر|مباشرة|live|الآن|حالياً|جاري|دقيقة/.test(q),
    isStandings: /ترتيب|جدول.*ترتيب|standings?|table|classement|points|نقاط/.test(q),
    isFixtures:  /رزنامة|جدول.*مباريات|schedule|fixture|برنامج|قادم|القادمة/.test(q),
    isPlayer:    /لاعب|اللاعب|player|joueur|احصاءات|stats|أهداف.*لاعب|هداف/.test(q) && !/مباراة|ماتش/.test(q),
    isTeam:      /فريق|الفريق|نادي|club|équipe/.test(q),
    isAlgeria:   /الجزائر|الخضر|المنتخب|فنك|fennec|dzfoot|الرابطة.*جزائر/.test(q),
    isAlgLeague: /الرابطة|lfp|ligue pro|دوري.*جزائ/.test(q),
    isChampions: /دوري.*أبطال|تشامبيونز|champions.*league|ucl/.test(q),
    isWorldCup:  /كأس.*العالم|مونديال|world.?cup|fifa/.test(q),
    isAfcon:     /أمم.*أفريقيا|كان|afcon|can/.test(q),
    isPL:        /بريميرليغ|premier.*league|الإنجليزي/.test(q),
    isLaLiga:    /الليغا|la.?liga|الإسباني/.test(q),
    isBundesliga:/البوندسليغا|bundesliga|الألماني/.test(q),
    isSerieA:    /السيريا|serie.?a|الإيطالي/.test(q),
    isLigue1:    /الليغ.*1|ligue.?1|الفرنسي/.test(q),
    isSaudi:     /السعودي|الدوري.*سعودي|روشن/.test(q),
  }
}

// ─────────────────────────────────────────────────────────────
// تحديد الدوريات المطلوبة بناءً على الاستعلام
// ─────────────────────────────────────────────────────────────
function resolveStandingsLeagues(qt) {
  const all = [
    { id: 197, name: 'الرابطة المحترفة الجزائرية', flag: '🇩🇿' },
    { id: 39,  name: 'الدوري الإنجليزي الممتاز',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 140, name: 'الدوري الإسباني',             flag: '🇪🇸' },
    { id: 78,  name: 'الدوري الألماني',             flag: '🇩🇪' },
    { id: 135, name: 'الدوري الإيطالي',             flag: '🇮🇹' },
    { id: 61,  name: 'الدوري الفرنسي',              flag: '🇫🇷' },
    { id: 2,   name: 'دوري أبطال أوروبا',           flag: '🏆' },
    { id: 307, name: 'الدوري السعودي (روشن)',        flag: '🇸🇦' },
  ]

  if (qt.isAlgLeague || qt.isAlgeria)  return all.filter(l => l.id === 197)
  if (qt.isChampions)                   return all.filter(l => l.id === 2)
  if (qt.isPL)                          return all.filter(l => l.id === 39)
  if (qt.isLaLiga)                      return all.filter(l => l.id === 140)
  if (qt.isBundesliga)                  return all.filter(l => l.id === 78)
  if (qt.isSerieA)                      return all.filter(l => l.id === 135)
  if (qt.isLigue1)                      return all.filter(l => l.id === 61)
  if (qt.isSaudi)                       return all.filter(l => l.id === 307)
  // عام: أهم 3 دوريات + الجزائر
  return all.filter(l => [39, 140, 78, 197].includes(l.id))
}

// ─────────────────────────────────────────────────────────────
// بناء سياق كرة القدم الكامل
// ─────────────────────────────────────────────────────────────

/**
 * buildFootballContext(query, dateStr)
 *
 * يُحلّل نوع الاستعلام ويجلب البيانات من 365score/Koora (أولوية)
 * ويُعيد كتلة نصية منسّقة بالجداول والأعلام.
 *
 * @param {string} query   - رسالة المستخدم
 * @param {string} dateStr - YYYY-MM-DD (اختياري — default: اليوم)
 * @returns {object|null}  - { type, content, source, fetchedAt } أو null
 */
export async function buildFootballContext(query = '', dateStr = null) {
  const today = dateStr || new Date().toISOString().slice(0, 10)
  const qt = detectFootballQueryType(query)
  const sections = []

  try {
    // ── ① مباريات اليوم / المباشرة ──────────────────────────────────────────
    const wantMatches = !qt.isStandings || qt.isLive || qt.isFixtures ||
      !/ترتيب|standings|classement/.test(query.toLowerCase())

    if (wantMatches) {
      // اختر المصدر الأنسب أولاً
      let matchData = null

      // 365score أولاً
      try {
        matchData = await get365ScoreMatches(today)
        if (isUnavailable(matchData)) matchData = null
      } catch (_) {}

      // koora إذا فشل 365score
      if (!matchData?.matches?.length) {
        try {
          matchData = await getKooraMatches(today)
          if (isUnavailable(matchData)) matchData = null
        } catch (_) {}
      }

      // الجزائر مباشرة إذا كان الطلب عن الجزائر
      if (qt.isAlgeria && !matchData?.matches?.length) {
        try {
          matchData = await getAlgeriaMatches(today)
          if (isUnavailable(matchData)) matchData = null
        } catch (_) {}
      }

      // getLiveMatches كـ fallback (يمر بالسلسلة كاملة)
      if (!matchData?.matches?.length) {
        try {
          matchData = await getLiveMatches(today)
          if (isUnavailable(matchData)) matchData = null
        } catch (_) {}
      }

      if (matchData?.matches?.length) {
        const matches = matchData.matches

        // تجميع بحسب الدوري
        const byLeague = {}
        for (const m of matches) {
          const lg = m.league || m.competition || m.competitionDisplayName || 'مباريات'
          if (!byLeague[lg]) byLeague[lg] = []
          byLeague[lg].push(m)
        }

        const lines = [`📅 **مباريات ${today}** — (${matchData.source})`]

        let leagueCount = 0
        for (const [lg, lgMatches] of Object.entries(byLeague)) {
          if (leagueCount >= 10) { lines.push('_...والمزيد_'); break }
          const flag = getLeagueFlag(lg, lgMatches[0]?.country || '')
          lines.push(`\n${flag} **${lg}**`)
          for (const m of lgMatches.slice(0, 8)) {
            lines.push('  ' + formatMatchRow(m))
          }
          leagueCount++
        }

        // إحصاء سريع
        const live = matches.filter(m => ['live','inprogress'].includes(m.statusType)).length
        const fin  = matches.filter(m => m.statusType === 'finished').length
        const upc  = matches.filter(m => m.statusType === 'upcoming').length
        lines.push(`\n_إجمالي: ${matches.length} مباراة — 🔴 مباشر: ${live} | ✅ انتهت: ${fin} | 🕐 قادمة: ${upc}_`)

        sections.push(lines.join('\n'))
      }
    }

    // ── ② ترتيب الدوريات ────────────────────────────────────────────────────
    if (qt.isStandings) {
      const leagues = resolveStandingsLeagues(qt)
      for (const lg of leagues) {
        try {
          // 365score أولاً
          let stData = await get365ScoreStandings(lg.id)
          if (isUnavailable(stData) || !stData?.standings?.length) {
            stData = await getStandings(lg.id)
          }
          if (stData?.standings?.length) {
            sections.push(formatStandingsTable(stData.standings, lg.name, lg.flag))
            sections.push(`_المصدر: ${stData.source}_\n`)
          }
        } catch (_) {}
      }
    }

    // ── ③ بيانات اللاعبين (هوية من Wikidata + Wikipedia) ────────────────────
    if (qt.isPlayer) {
      const playerMatch = query.match(/(?:لاعب|player)\s+([ا-ي\w\s]{3,30})/i)
      if (playerMatch) {
        try {
          const identity = await getPlayerIdentity(playerMatch[1].trim())
          if (identity && !isUnavailable(identity)) {
            const flag = getCountryFlag(identity.nationality || '')
            sections.push(
              `👤 **${identity.name}** ${flag}\n` +
              (identity.nationality ? `🌍 الجنسية: ${identity.nationality}\n` : '') +
              (identity.position    ? `🎽 المركز: ${identity.position}\n` : '') +
              (identity.dob         ? `📅 تاريخ الميلاد: ${identity.dob}\n` : '') +
              (identity.summary     ? `\n${identity.summary.slice(0, 300)}...\n` : '') +
              (identity.wikiUrl     ? `🔗 [ويكيبيديا](${identity.wikiUrl})` : '')
            )
          }
        } catch (_) {}
      }
    }

  } catch (err) {
    console.warn('[FootballCtx] build failed:', err.message)
  }

  if (!sections.length) return null

  const firstMatchData = sections[0] || ''
  const source = firstMatchData.includes('365score') ? '365score'
    : firstMatchData.includes('Koora') ? 'Koora'
    : 'multi-source'

  return {
    type:      'FOOTBALL_CONTEXT',
    content:   sections.join('\n\n'),
    source,
    fetchedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────
// دالة مساعدة للكشف السريع عن استعلامات كرة القدم
// ─────────────────────────────────────────────────────────────
const FOOTBALL_KEYWORDS = new Set([
  'مباراة','مباريات','نتيجة','نتائج','هدف','أهداف','ملعب',
  'بطولة','كأس','دوري','الدوري','الكرة','كرة القدم',
  'فريق','الفريق','فرق','لاعب','مدرب','ترتيب','جدول',
  'ماتش','ماتشات','رزنامة','تصفيات','تأهل',
  'football','soccer','match','score','goal','league','cup',
  'standings','fixtures','player','team','result',
  'البريميرليغ','الليغا','البوندسليغا','السيريا',
  'تشامبيونز','يورو','كان','مونديال','فيفا','يويفا',
  'الخضر','الفنك','الجزائر','منتخب',
  'ريال مدريد','برشلونة','ليفربول','مانشستر','بايرن',
  'كووورة','365score','sofascore','flashscore',
])

export function isFootballQuery(query = '') {
  const tokens = query.toLowerCase().split(/[\s,،.!?]+/)
  return tokens.some(t => FOOTBALL_KEYWORDS.has(t)) ||
    /كرة|فوتبول|matches|league|دوري.*أبطال|premier.*league|la.?liga|bundesliga|serie.?a|ligue.?1/i.test(query)
}
