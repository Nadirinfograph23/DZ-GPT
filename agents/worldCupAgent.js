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
  sanitizeMatchesByTime,
} from '../lib/dz-sports-knowledge.js'

import {
  buildWC2026FullContext,
  buildWC2026QuickAnswer,
  buildTeamProfile,
  WC2026_KEY_FACTS,
  WC2026_GROUPS_INFO,
  WC2026_TEAM_PROFILES,
  WC2026_FAQ,
} from '../lib/wc2026-knowledge.js'

import {
  runWC2026TodayAgent,
  runWC2026StandingsAgent,
} from '../lib/sports-agent.js'

// ── Timeout helper ─────────────────────────────────────────────────────────
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise(r => setTimeout(() => r(null), ms))])

// ── تصحيح بيانات API بالنتائج الموثّقة محلياً ─────────────────────────────
// الأولوية: البيانات المحلية الموثّقة (verified:true) تُلغي أي بيانات API خاطئة
function applyVerifiedScores(matches = []) {
  const verified = WC2026_FULL_FIXTURES.filter(f => f.verified && f.statusType === 'finished')
  return matches.map(m => {
    const fix = verified.find(f =>
      (f.homeTeam === m.homeTeam || f.awayTeam === m.homeTeam) &&
      (f.homeTeam === m.awayTeam || f.awayTeam === m.awayTeam)
    )
    if (!fix) return m
    // نتأكد من اتجاه الفريق المضيف (الترتيب قد يختلف بين API والبيانات المحلية)
    if (fix.homeTeam === m.homeTeam) {
      return { ...m, homeScore: fix.homeScore, awayScore: fix.awayScore, statusType: 'finished', winner: fix.winner, _verified: true }
    } else {
      // الفريق المضيف في البيانات المحلية هو الفريق الضيف في API → نعكس
      return { ...m, homeScore: fix.awayScore, awayScore: fix.homeScore, statusType: 'finished', winner: fix.winner, _verified: true }
    }
  })
}

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

  // ── نتائج (RESULTS) — يجب أن يسبق FIXTURES لتفادي التعارض مع "نتائج مباريات" ──
  // يُطابق: "نتائج مباريات كأس العالم" / "نتائج كأس العالم" / "نتائج المونديال"
  if (/(?:نتيجة|نتائج)\s+(?:مباريات?|ماتشات?|اللقاءات?)\s+(?:ال)?(?:كأس\s*(?:ال)?عالم|مونديال|FIFA|فيفا)/i.test(q) ||
      /(?:نتيجة|نتائج)\s+(?:ال)?(?:كأس\s*(?:ال)?عالم|مونديال|FIFA|فيفا)/i.test(q) ||
      /(?:ما|ماهي|ايش|إيش|وش)\s+(?:نتيجة|نتائج)\s+(?:ال)?(?:كأس\s*(?:ال)?عالم|مونديال)/i.test(q)) return 'RESULTS'

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
        ? (() => {
            const d = new Date(m.status.utcTime)
            const h = d.getUTCHours(), mn = d.getUTCMinutes()
            return `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`
          })()
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
// ✅ يُطبّق sanitizeMatchesByTime — لا نتائج وهمية أبداً
function buildTodayResponseFromLocal(dateStr) {
  // buildWC2026TodayFixtures يُطبّق sanitizeMatchesByTime داخلياً
  // نُعيد تطبيقه احتياطاً لضمان عدم ظهور أي نتيجة مخترعة
  const matches = sanitizeMatchesByTime(buildWC2026TodayFixtures(dateStr))
  if (!matches?.length) return null

  const dateLabel = (() => {
    try {
      return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('ar-DZ', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Africa/Algiers',
      })
    } catch { return dateStr }
  })()

  const lines = [
    `## 🏆 كأس العالم FIFA 2026`,
    `### 📅 ${dateLabel}`,
    ``,
    `> 📡 _بيانات رسمية FIFA 2026 — جدول محدَّث_`,
    ``,
    `---`,
    ``,
  ]

  let hasPending = false

  for (const m of matches) {
    const f1 = WC_FLAGS[m.homeTeam] || '🏴'
    const f2 = WC_FLAGS[m.awayTeam] || '🏴'
    const [hh, mm_] = (m.startTime || '00:00').split(':')
    const dzH = String((parseInt(hh, 10) + 1) % 24).padStart(2, '0')

    let scoreDisplay, statusBadge, extraLine = ''

    if (m.statusType === 'finished' && m.homeScore !== null && m.awayScore !== null) {
      scoreDisplay = `**\`${m.homeScore} — ${m.awayScore}\`**`
      statusBadge  = `✅ انتهت`
    } else if (m.statusType === 'live') {
      scoreDisplay = `🔴 **\`مباشر\`**`
      statusBadge  = `🔴 جارية الآن`
    } else if (m.statusType === 'result-pending' || m._timePassed) {
      scoreDisplay = `\`⏳\``
      statusBadge  = `⚠️ نتيجة غير متوفرة`
      extraLine    = `> ⚠️ [FotMob](https://www.fotmob.com/leagues/77/matches/world-cup) | [FIFA](https://www.fifa.com/worldcup/matches)`
      hasPending   = true
    } else {
      scoreDisplay = `\`🆚\``
      statusBadge  = `📅 قادمة`
    }

    const venue  = m.venue ? `🏟️ ${m.venue}${m.city ? `, ${m.city}` : ''}` : '—'
    const timing = m.statusType === 'upcoming' ? `⏰ **${dzH}:${mm_}** DZ` : statusBadge

    lines.push(`### ${f1} **${m.homeTeam}** ${scoreDisplay} **${m.awayTeam}** ${f2}`)
    lines.push(``)
    lines.push(`| الحالة | المجموعة | الملعب | الوقت |`)
    lines.push(`|:---:|:---:|:---:|:---:|`)
    lines.push(`| ${statusBadge} | 🏷️ **${m.group || '—'}** | ${venue} | ${timing} |`)
    lines.push(``)
    if (extraLine) { lines.push(extraLine); lines.push(``) }
  }

  if (hasPending) {
    lines.push(`---`)
    lines.push(`> 🛡️ **تنبيه:** الوكيل لا يعرض أي نتيجة غير موثوقة. للنتائج الفعلية راجع المصادر أعلاه.`)
    lines.push(``)
  }

  lines.push(`---`)
  lines.push(`🔴 **متابعة مباشرة:** [FotMob](https://www.fotmob.com/leagues/77/matches/world-cup) · [365score](https://www.365scores.com/ar/football/world-cup-2026) · [FIFA](https://www.fifa.com/worldcup)`)

  return {
    userResponse: lines.join('\n'),
    matches,
    found: true,
    matchCount: matches.length,
    hasPendingResults: hasPending,
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

  // ── RESULTS — نتائج المباريات المنتهية (متعدد الأيام) ────────────────────
  if (wcType === 'RESULTS') {
    // 1. بيانات موثّقة محلياً (فورية — بدون شبكة) — الأسرع والأضمن
    const verifiedLocal = WC2026_FULL_FIXTURES.filter(f => f.verified && f.statusType === 'finished')

    // 2. جلب آخر 3 أيام من المصادر الحية (بالتوازي)
    const _dzOff = 3600000
    const _dToday = new Date(Date.now() + _dzOff).toISOString().slice(0, 10)
    const _dYest  = new Date(Date.now() + _dzOff - 86400000).toISOString().slice(0, 10)
    const _dD2ago = new Date(Date.now() + _dzOff - 172800000).toISOString().slice(0, 10)

    let liveFinished = []
    try {
      const [_r0, _r1, _r2] = await Promise.all([
        withTimeout(runWC2026TodayAgent(_dToday), 10000),
        withTimeout(runWC2026TodayAgent(_dYest),  10000),
        withTimeout(runWC2026TodayAgent(_dD2ago), 10000),
      ])
      liveFinished = [
        ...(_r0?.matches || []),
        ...(_r1?.matches || []),
        ...(_r2?.matches || []),
      ].filter(m => m.statusType === 'finished')
      // إزالة المكررات (نفس المباراة في عدة مصادر)
      const seen = new Set()
      liveFinished = liveFinished.filter(m => {
        const k = [m.homeTeam, m.awayTeam].sort().join('__')
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    } catch {}

    // 3. الأفضلية للبيانات الحية، ثم المحلية الموثّقة
    const finishedMatches = liveFinished.length > 0 ? liveFinished : verifiedLocal
    const srcLabel = liveFinished.length > 0
      ? 'بيانات مباشرة من FotMob/jdwel'
      : verifiedLocal.length > 0 ? 'بيانات موثّقة (365scores ✅)' : null

    if (finishedMatches.length > 0) {
      const lines = [
        `## 🏆 نتائج كأس العالم FIFA 2026`,
        ``,
        `> ✅ **${srcLabel}**`,
        ``,
        `---`,
        ``,
      ]
      for (const m of finishedMatches) {
        const f1 = WC_FLAGS[m.homeTeam] || '🏴'
        const f2 = WC_FLAGS[m.awayTeam] || '🏴'
        const grp = m.group ? `🏷️ **${m.group}**` : ''
        lines.push(`### ${f1} **${m.homeTeam}** **\`${m.homeScore} — ${m.awayScore}\`** **${m.awayTeam}** ${f2}`)
        if (grp) lines.push(`> ${grp} · ✅ انتهت`)
        lines.push(``)
      }
      lines.push(`---`)
      lines.push(`📊 **المصادر:** [FotMob](https://www.fotmob.com/ar/leagues/77/matches/world-cup) · [365score](https://www.365scores.com/ar/football/world-cup-2026) · [FIFA](https://www.fifa.com/worldcup)`)
      return {
        userResponse: lines.join('\n'),
        matches: finishedMatches,
        found: true,
        matchCount: finishedMatches.length,
        agent: 'world_cup_agent',
        source: liveFinished.length > 0 ? 'FotMob/jdwel' : 'WC2026_LOCAL_VERIFIED',
        confidence: 'high',
        wcType: 'RESULTS',
      }
    }

    // لا نتائج بعد — البطولة لم تشهد مباريات منتهية
    return {
      userResponse: [
        `## 🏆 نتائج كأس العالم FIFA 2026`,
        ``,
        `> ℹ️ **لا نتائج متاحة بعد** — البطولة انطلقت للتو، انتظر أول المباريات!`,
        ``,
        `🔗 [FotMob](https://www.fotmob.com/ar/leagues/77/matches/world-cup) | [365score](https://www.365scores.com/ar/football/world-cup-2026)`,
      ].join('\n'),
      found: false, matches: [],
      agent: 'world_cup_agent',
      source: 'WC2026_LOCAL',
      confidence: 'high',
      wcType: 'RESULTS',
    }
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
          `## 🏆 كأس العالم FIFA 2026`,
          `### 📅 ${dateLabel}`,
          ``,
          `> 📡 _بيانات مباشرة من FotMob — كأس العالم فقط_`,
          ``,
          `---`,
          ``,
        ]
        const sanitizedFotmob = sanitizeMatchesByTime(applyVerifiedScores(fotmobData.matches))
        for (const m of sanitizedFotmob) {
          const f1 = WC_FLAGS[m.homeTeam] || '🏴'
          const f2 = WC_FLAGS[m.awayTeam] || '🏴'
          let scoreDisplay, statusBadge
          if (m.statusType === 'result-pending' || m._timePassed) {
            scoreDisplay = `\`⏳\``; statusBadge = `⚠️ نتيجة غير متوفرة`
          } else if (m.homeScore !== null && m.awayScore !== null) {
            scoreDisplay = `**\`${m.homeScore} — ${m.awayScore}\`**`
            statusBadge  = m.statusType === 'live' ? `🔴 مباشر` : `✅ انتهت`
          } else if (m.statusType === 'live') {
            scoreDisplay = `🔴 **\`مباشر\`**`; statusBadge = `🔴 جارية الآن`
          } else {
            scoreDisplay = `\`🆚\``; statusBadge = `📅 قادمة`
          }
          const [hh, mn] = (m.startTime || '00:00').split(':')
          const dzH = m.startTime ? `${String((parseInt(hh)+1)%24).padStart(2,'0')}:${mn}` : ''
          const timing = m.statusType === 'upcoming' && dzH ? `⏰ **${dzH}** DZ` : statusBadge
          lines.push(`### ${f1} **${m.homeTeam}** ${scoreDisplay} **${m.awayTeam}** ${f2}`)
          lines.push(``)
          lines.push(`| الحالة | الوقت |`)
          lines.push(`|:---:|:---:|`)
          lines.push(`| ${statusBadge} | ${timing} |`)
          lines.push(``)
        }
        lines.push(`---`)
        lines.push(`🔴 **متابعة مباشرة:** [FotMob](https://www.fotmob.com/leagues/77/matches/world-cup) · [FIFA](https://www.fifa.com/worldcup)`)
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

  // ── GENERAL WC query — إجابة شاملة من قاعدة المعرفة المحلية ─────────────
  // أولاً: هل يسأل عن فريق محدد؟
  const teamKeys = Object.keys(WC2026_TEAM_PROFILES)
  const matchedTeam = teamKeys.find(k => query.includes(k))
  if (matchedTeam) {
    const profile = buildTeamProfile(matchedTeam)
    if (profile) {
      // أضف جدول المجموعة المرتبطة إذا أمكن
      const teamData = WC2026_TEAM_PROFILES[matchedTeam]
      const groupKey = teamData?.group
      const groupInfo = groupKey ? WC2026_GROUPS_INFO[groupKey] : null
      const groupBlock = groupInfo
        ? [``, `**${groupInfo.description}:**`, `> ${groupInfo.teams.join(' · ')}`].join('\n')
        : ''
      return {
        userResponse: [
          `## 🏆 كأس العالم FIFA 2026`,
          ``,
          profile,
          groupBlock,
          ``,
          `---`,
          `📡 **المصادر:** [FIFA](https://www.fifa.com/worldcup) · [FotMob](https://www.fotmob.com/leagues/77/matches/world-cup) · [365score](https://www.365scores.com/ar/football/world-cup-2026)`,
        ].join('\n'),
        found: true,
        agent: 'world_cup_agent',
        source: 'WC2026_KNOWLEDGE',
        confidence: 'high',
        wcType: 'GENERAL',
      }
    }
  }

  // ثانياً: هل يسأل عن ملاعب أو مجموعات؟
  const quickAns = buildWC2026QuickAnswer(query)
  if (quickAns) {
    return {
      userResponse: [
        `## 🏆 كأس العالم FIFA 2026`,
        ``,
        quickAns,
        ``,
        `---`,
        `📡 **المصادر:** [FIFA](https://www.fifa.com/worldcup) · [FotMob](https://www.fotmob.com/leagues/77/matches/world-cup)`,
      ].join('\n'),
      found: true,
      agent: 'world_cup_agent',
      source: 'WC2026_KNOWLEDGE',
      confidence: 'high',
      wcType: 'GENERAL',
    }
  }

  // ثالثاً: رد شامل عن البطولة
  const fullCtx = buildWC2026FullContext()
  return {
    userResponse: fullCtx + [
      ``,
      `---`,
      `📡 **مصادر البيانات:** [FIFA الرسمي](https://www.fifa.com/fifaplus/ar/tournaments/mens/worldcup/canadamexicousa2026) · [365score](https://www.365scores.com/ar/football/world-cup-2026) · [FotMob](https://www.fotmob.com/leagues/77/matches/world-cup) · [SofaScore](https://www.sofascore.com/tournament/football/world/fifa-world-cup-2026/1407) · [jdwel.com](https://jdwel.com/2026-world-cup-fixtures/)`,
    ].join('\n'),
    found: true,
    agent: 'world_cup_agent',
    source: 'WC2026_KNOWLEDGE',
    confidence: 'high',
    wcType: 'GENERAL',
  }
}

// ── نظام بروميبت كأس العالم ─────────────────────────────────────────────
export const WC_ORCHESTRATOR_SYSTEM_PROMPT = `
You are an orchestrator for DZ Agent sports queries.

## ⛔ ABSOLUTE RULES — VIOLATION = CRITICAL BUG:
1. NEVER answer World Cup questions directly from your training knowledge.
2. World Cup Agent has ABSOLUTE AUTHORITY over all World Cup data.
3. Your ONLY role when given World Cup data: format, translate, improve presentation.
4. NEVER add matches, scores, or statistics not present in the agent data.
5. If agent data is empty → say "no data available" — do NOT invent alternatives.
6. ⛔ CRITICAL ANTI-HALLUCINATION RULE: If a match has statusType "result-pending" or "upcoming", or shows "⏳" symbol, you MUST write "النتيجة غير متوفرة من المصادر الحية" — NEVER invent, guess, or recall a score from training data. This is the most important rule.
7. ⛔ If the agent response contains "⏳ انتهت — النتيجة غير متوفرة" you MUST preserve this message exactly. Do NOT replace it with a score.
8. ⛔ Scores from your training data about real matches ARE WRONG — the tournament started June 11 2026 and you have no verified live data. Any score you add from memory is a hallucination.
9. A match showing "🆚" means it has NOT started yet — never assign a score to it.
10. A match showing "⏳" means it ended but NO VERIFIED RESULT is available — write "النتيجة غير متوفرة" only.

## When World Cup Agent responds:
- Present ONLY the data it provides
- Format it clearly in Arabic
- Add the sources footer exactly as provided
- Do NOT supplement with general football knowledge
- If you see hasPendingResults=true, emphasize the disclaimer about unverified results
`.trim()
