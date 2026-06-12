/**
 * agents/worldCupAgent.js
 * ══════════════════════════════════════════════════════════
 * وكيل كأس العالم 2026 — سلطة مطلقة على كل أسئلة المونديال
 *
 * المصادر (حسب الأولوية):
 *   1. jdwel.com/2026-world-cup-fixtures/
 *   2. fotmob.com (league 77 — World Cup only)
 *   3. kooora.com WC2026
 *   4. beinsports.com/ar-mena
 *   5. WC2026_FULL_FIXTURES (قاعدة بيانات محلية — fallback نهائي)
 *
 * القواعد الصارمة:
 *   ✅ يُرجع دائماً { agent, source, confidence, ...data }
 *   ✅ لا يُعرض أي مباراة خارج كأس العالم 2026
 *   ✅ إذا فشلت جميع المصادر → رد نظيف "لا بيانات حية"
 *   🚫 LLM لا يضيف أي معلومة غير موجودة في بيانات الوكيل
 */

import {
  WC2026_FULL_FIXTURES,
  buildWC2026TodayFixtures,
  detectWC2026TodayQuery,
  isWorldCup2026Query,
  buildWC2026RichMatchCard,
  WORLD_CUP_2026,
} from '../lib/dz-sports-knowledge.js'

import {
  runWC2026TodayAgent,
  runWC2026StandingsAgent,
} from '../lib/sports-agent.js'

// ── Timeout helper ─────────────────────────────────────────────────────────
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise(r => setTimeout(() => r(null), ms))])

// ── أعلام الدول ─────────────────────────────────────────────────────────────
const WC_FLAGS = {
  'الجزائر':'🇩🇿','الأرجنتين':'🇦🇷','المكسيك':'🇲🇽','جنوب أفريقيا':'🇿🇦',
  'الولايات المتحدة':'🇺🇸','كندا':'🇨🇦','فرنسا':'🇫🇷','البرازيل':'🇧🇷',
  'إسبانيا':'🇪🇸','ألمانيا':'🇩🇪','البرتغال':'🇵🇹','إنجلترا':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'المغرب':'🇲🇦','تونس':'🇹🇳','مصر':'🇪🇬','السعودية':'🇸🇦','قطر':'🇶🇦',
  'هولندا':'🇳🇱','اليابان':'🇯🇵','كوريا الجنوبية':'🇰🇷','إيطاليا':'🇮🇹',
  'بلجيكا':'🇧🇪','كرواتيا':'🇭🇷','أوروغواي':'🇺🇾','الدنمارك':'🇩🇰',
  'السويد':'🇸🇪','أستراليا':'🇦🇺','تركيا':'🇹🇷','نيجيريا':'🇳🇬',
  'السنغال':'🇸🇳','كولومبيا':'🇨🇴','الإكوادور':'🇪🇨','بولندا':'🇵🇱',
  'سويسرا':'🇨🇭','اسكتلندا':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','النمسا':'🇦🇹','الأردن':'🇯🇴',
  'جمهورية التشيك':'🇨🇿',
}

// ── كشف نوع استعلام كأس العالم ────────────────────────────────────────────
export function classifyWCQuery(query = '') {
  const q = query.toLowerCase()
  const hasWC = /كأس\s*العالم|مونديال|world\s*cup|fifa|فيفا/i.test(q)
  if (!hasWC) return null

  if (/اليوم|الليلة|الآن|النهار|هاذ\s+النهار|هذا\s+اليوم/i.test(q) ||
      /(?:ماتشات|مباريات|نتائج)\s+(?:اليوم|الليلة)/i.test(q) ||
      /(?:اليوم|الليلة).*(?:مباريات|ماتشات)/i.test(q)) return 'TODAY'

  if (/الغد|غدا?|بكر[اة]/i.test(q)) return 'TOMORROW'

  if (/ترتيب|جدول\s+المجموعة|نقاط|صدارة|مجموعة\s+[a-lA-L]/i.test(q) ||
      /نقاط\s+الجزائر|مجموعة\s+الجزائر/i.test(q)) return 'STANDINGS'

  if (/هداف|أفضل\s+هداف|ترتيب\s+الهداف|من\s+(?:تصدر|يتصدر)/i.test(q)) return 'SCORERS'

  if (/تشكيل|تشكيلة|التشكيل\s+الأساسي|الأساسي/i.test(q)) return 'LINEUP'

  if (/(?:مباراة|متى)\s+(?:الجزائر|جزائر)|(?:الجزائر|جزائر)\s+(?:مباراة|ضد|vs)/i.test(q)) return 'ALGERIA_MATCH'

  if (/مباريات|برنامج|جدول|رزنامة|fixture|schedule/i.test(q)) return 'FIXTURES'

  return 'GENERAL'
}

// ── FotMob WC2026 only (league ID = 77) ────────────────────────────────────
async function fetchFotMobWC2026(dateStr) {
  try {
    const d = (dateStr || new Date().toISOString().slice(0, 10)).replace(/-/g, '')
    const res = await fetch(`https://www.fotmob.com/api/matches?date=${d}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.fotmob.com/',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const wc = (json?.leagues || []).find(l =>
      l.id === 77 ||
      /world.cup|كأس.العالم|coupe.du.monde/i.test(l.name || '')
    )
    if (!wc) return null
    const matches = (wc.matches || []).map(m => ({
      homeTeam: m.home?.name || '',
      awayTeam: m.away?.name || '',
      homeScore: m.home?.score ?? null,
      awayScore: m.away?.score ?? null,
      statusType: m.status?.finished ? 'finished' : m.status?.started ? 'live' : 'upcoming',
      startTime: m.status?.utcTime
        ? new Date(m.status.utcTime).toLocaleTimeString('ar-DZ', { hour:'2-digit', minute:'2-digit', timeZone:'Africa/Algiers' })
        : '',
      competition: 'كأس العالم FIFA 2026',
      league: 'World Cup 2026',
      source: 'FotMob',
      matchId: m.id,
    }))
    return matches.length ? { matches, source: 'FotMob', leagueName: wc.name } : null
  } catch {
    return null
  }
}

// ── Jdwel WC2026 fixtures ─────────────────────────────────────────────────
async function fetchJdwelWC2026Fixtures(dateStr) {
  try {
    const res = await fetch('https://jdwel.com/2026-world-cup-fixtures/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ar,en;q=0.9',
        'Referer': 'https://jdwel.com/',
      },
      signal: AbortSignal.timeout(14000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const matches = []
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let row
    while ((row = rowRe.exec(html)) !== null) {
      const cells = []
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
      let cell
      while ((cell = cellRe.exec(row[1])) !== null) {
        cells.push(cell[1].replace(/<[^>]+>/g, '').trim())
      }
      if (cells.length >= 3) {
        const dateCell = cells[0] || ''
        const match = cells[1] || ''
        const time  = cells[2] || ''
        const vs = match.split(/\s+vs\.?\s+/i)
        if (vs.length === 2) {
          matches.push({
            homeTeam: vs[0].trim(),
            awayTeam: vs[1].trim(),
            date: dateCell,
            startTime: time,
            competition: 'كأس العالم FIFA 2026',
            source: 'jdwel.com',
            statusType: 'upcoming',
          })
        }
      }
    }
    if (!matches.length) return null
    const today = dateStr || new Date().toISOString().slice(0, 10)
    const todayMatches = matches.filter(m =>
      m.date && (m.date.includes(today) || today.includes(m.date.slice(0,7)))
    )
    return {
      matches: todayMatches.length ? todayMatches : matches.slice(0, 10),
      source: 'jdwel.com',
    }
  } catch {
    return null
  }
}

// ── بناء رد اليوم من البيانات المحلية ────────────────────────────────────
function buildTodayResponseFromLocal(dateStr) {
  const matches = buildWC2026TodayFixtures(dateStr)
  if (!matches?.length) return null

  const dateLabel = (() => {
    try {
      return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('ar-DZ', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Africa/Algiers',
      })
    } catch { return dateStr }
  })()

  const lines = [
    `## ⚽ مباريات كأس العالم 2026 — ${dateLabel}`,
    ``,
    `> 📡 _الجدول الرسمي FIFA 2026 — يُحدَّث فور الإعلان الرسمي_`,
    ``,
  ]

  for (const m of matches) {
    const f1 = WC_FLAGS[m.homeTeam] || '🏴'
    const f2 = WC_FLAGS[m.awayTeam] || '🏴'
    const [hh, mm] = (m.startTime || '00:00').split(':')
    const dzH = String((parseInt(hh, 10) + 1) % 24).padStart(2, '0')
    const scoreStr = (m.homeScore !== null && m.awayScore !== null)
      ? `**${m.homeScore} – ${m.awayScore}**`
      : `🆚`
    lines.push(`### ${f1} **${m.homeTeam}** ${scoreStr} **${m.awayTeam}** ${f2}`)
    lines.push(`🕒 **${dzH}:${mm}** (توقيت الجزائر) | 🏟️ ${m.venue}, ${m.city}`)
    lines.push(`🏷️ المجموعة **${m.group}** — ${m.round}`)
    lines.push(``)
  }
  lines.push(`🔴 **متابعة حية:** [FotMob](https://www.fotmob.com/leagues/77/matches/world-cup) | [365score](https://www.365scores.com/ar/football/world-cup-2026) | [FIFA](https://www.fifa.com/worldcup)`)

  return {
    userResponse: lines.join('\n'),
    matches,
    found: true,
    matchCount: matches.length,
    source: 'WC2026_LOCAL',
    agent: 'world_cup_agent',
    confidence: 'high',
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// الدالة الرئيسية — runWorldCupAgent
// ═══════════════════════════════════════════════════════════════════════════
export async function runWorldCupAgent(query, messages = [], options = {}) {
  const wcType = classifyWCQuery(query)
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const dateStr = wcType === 'TOMORROW' ? tomorrow : today

  // ── STANDINGS ───────────────────────────────────────────────────────────
  if (wcType === 'STANDINGS') {
    try {
      const res = await withTimeout(runWC2026StandingsAgent(query), 18000)
      if (res?.userResponse) {
        return {
          ...res,
          agent: 'world_cup_agent',
          source: res.liveSource || 'SofaScore/FotMob',
          confidence: 'high',
          wcType: 'STANDINGS',
        }
      }
    } catch {}
  }

  // ── TODAY / TOMORROW ─────────────────────────────────────────────────────
  if (['TODAY', 'TOMORROW', 'FIXTURES', 'GENERAL', 'ALGERIA_MATCH', null].includes(wcType) ||
      wcType === null) {

    // 1. runWC2026TodayAgent (FotMob + local)
    try {
      const res = await withTimeout(runWC2026TodayAgent(dateStr), 15000)
      if (res?.userResponse) {
        const patched = wcType === 'TOMORROW'
          ? res.userResponse.replace(/اليوم/g, 'الغد')
          : res.userResponse
        return {
          ...res,
          userResponse: patched,
          agent: 'world_cup_agent',
          source: res.sources?.join('/') || 'FotMob',
          confidence: 'high',
          wcType,
        }
      }
    } catch {}

    // 2. FotMob direct (WC league 77 only)
    try {
      const fotmobData = await withTimeout(fetchFotMobWC2026(dateStr), 12000)
      if (fotmobData?.matches?.length) {
        const dateLabel = (() => {
          try {
            return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('ar-DZ', {
              weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Africa/Algiers',
            })
          } catch { return dateStr }
        })()
        const lines = [
          `## ⚽ مباريات كأس العالم 2026 — ${dateLabel}`,
          ``,
          `> 📡 _بيانات مباشرة من FotMob — كأس العالم فقط_`,
          ``,
        ]
        for (const m of fotmobData.matches) {
          const f1 = WC_FLAGS[m.homeTeam] || '🏴'
          const f2 = WC_FLAGS[m.awayTeam] || '🏴'
          const scoreStr = (m.homeScore !== null && m.awayScore !== null)
            ? `**${m.homeScore} – ${m.awayScore}**`
            : m.statusType === 'live' ? `🔴 **مباشر**` : `🆚`
          lines.push(`### ${f1} **${m.homeTeam}** ${scoreStr} **${m.awayTeam}** ${f2}`)
          if (m.startTime) lines.push(`🕒 **${m.startTime}** (توقيت الجزائر)`)
          lines.push(``)
        }
        lines.push(`🔴 [المتابعة الحية على FotMob](https://www.fotmob.com/leagues/77/matches/world-cup)`)
        return {
          userResponse: lines.join('\n'),
          matches: fotmobData.matches,
          found: true,
          matchCount: fotmobData.matches.length,
          agent: 'world_cup_agent',
          source: 'FotMob',
          confidence: 'high',
          wcType,
        }
      }
    } catch {}

    // 3. Jdwel.com
    try {
      const jdwelData = await withTimeout(fetchJdwelWC2026Fixtures(dateStr), 14000)
      if (jdwelData?.matches?.length) {
        const lines = [
          `## ⚽ مباريات كأس العالم 2026`,
          ``,
          `> 📡 _المصدر: jdwel.com — الجدول الرسمي لكأس العالم 2026_`,
          ``,
        ]
        for (const m of jdwelData.matches) {
          const f1 = WC_FLAGS[m.homeTeam] || '🏴'
          const f2 = WC_FLAGS[m.awayTeam] || '🏴'
          lines.push(`### ${f1} **${m.homeTeam}** 🆚 **${m.awayTeam}** ${f2}`)
          if (m.startTime) lines.push(`🕒 ${m.startTime} | 📅 ${m.date}`)
          lines.push(``)
        }
        lines.push(`🔗 [الجدول الكامل على jdwel.com](https://jdwel.com/2026-world-cup-fixtures/)`)
        return {
          userResponse: lines.join('\n'),
          matches: jdwelData.matches,
          found: true,
          matchCount: jdwelData.matches.length,
          agent: 'world_cup_agent',
          source: 'jdwel.com',
          confidence: 'medium',
          wcType,
        }
      }
    } catch {}

    // 4. Local WC2026_FULL_FIXTURES
    const localRes = buildTodayResponseFromLocal(dateStr)
    if (localRes) return { ...localRes, wcType }

    // لا مباريات اليوم
    const noMatchLabel = wcType === 'TOMORROW' ? 'الغد' : 'اليوم'
    return {
      userResponse: [
        `## ⚽ كأس العالم 2026 — لا مباريات ${noMatchLabel}`,
        ``,
        `📅 لا توجد مباريات مجدولة في **${dateStr}** وفق الجدول الرسمي.`,
        ``,
        `🗓️ [الجدول الكامل](https://www.fifa.com/worldcup/matches) | [FotMob](https://www.fotmob.com/leagues/77/matches/world-cup)`,
      ].join('\n'),
      found: false,
      matches: [],
      agent: 'world_cup_agent',
      source: 'WC2026_LOCAL',
      confidence: 'high',
      wcType,
    }
  }

  // ── GENERAL WC query not specifically handled ────────────────────────────
  return {
    userResponse: [
      `## 🏆 كأس العالم FIFA 2026`,
      ``,
      `> 🔒 هذا الرد من وكيل كأس العالم المتخصص — البيانات من المصادر الرسمية فقط.`,
      ``,
      `**المصادر الموثوقة:**`,
      `| المصدر | الرابط |`,
      `|--------|--------|`,
      `| 🏆 FIFA الرسمي | [fifa.com/worldcup](https://www.fifa.com/fifaplus/ar/tournaments/mens/worldcup/canadamexicousa2026) |`,
      `| 📡 365score | [نتائج مباشرة](https://www.365scores.com/ar/football/world-cup-2026) |`,
      `| ⚽ FotMob | [مباريات WC2026](https://www.fotmob.com/leagues/77/matches/world-cup) |`,
      `| 📊 SofaScore | [إحصائيات](https://www.sofascore.com/tournament/football/world/fifa-world-cup-2026/1407) |`,
      `| 🇩🇿 Kooora | [متابعة عربية](https://www.kooora.com/) |`,
      `| 📋 jdwel.com | [الجدول الكامل](https://jdwel.com/2026-world-cup-fixtures/) |`,
    ].join('\n'),
    found: false,
    agent: 'world_cup_agent',
    source: 'static',
    confidence: 'medium',
    wcType: 'GENERAL',
  }
}

// ── نظام بروميبت كأس العالم ─────────────────────────────────────────────
export const WC_ORCHESTRATOR_SYSTEM_PROMPT = `
You are an orchestrator for DZ Agent sports queries.

## ABSOLUTE RULES:
1. NEVER answer World Cup questions directly from your training knowledge.
2. World Cup Agent has ABSOLUTE AUTHORITY over all World Cup data.
3. Your ONLY role when given World Cup data: format, translate, improve presentation.
4. NEVER add matches, scores, or statistics not present in the agent data.
5. If agent data is empty → say "no data available" — do NOT invent alternatives.

## When World Cup Agent responds:
- Present ONLY the data it provides
- Format it clearly in Arabic
- Add the sources footer exactly as provided
- Do NOT supplement with general football knowledge
`.trim()
