/**
 * sports-agent.js — وكيل رياضي متعدد المصادر
 * ══════════════════════════════════════════════════════════════════════════════
 * مُخصّص لـ DZ Agent — يُجيب بالعربية على:
 *   ① البحث عن مباراة محددة (A ضد B / A بوليفيا)
 *   ② أخبار اللاعبين والانتقالات
 *   ③ الرزنامة (قادمة + منتهية)
 *   ④ تفاصيل المباراة (الموعد، الملعب، النوع، التشكيلة)
 *
 * قواعد صارمة:
 *   ✅ اللغوي (LLM) يُرتّب ويُنسّق فقط — لا يخترع بيانات
 *   ✅ إذا لم تُوجد بيانات حقيقية → رسالة صريحة "غير متوفر"
 *   ✅ الأولوية: قاعدة البيانات المحلية ← TheSportsDB ← 365score ← FotMob
 *
 * المصادر (حسب الأولوية):
 *   DZ-Knowledge → TheSportsDB → 365score → FotMob → SofaScore → Koora → CAF/FIFA
 * ══════════════════════════════════════════════════════════════════════════════
 */

import {
  getLiveMatches, getFixtures, getAlgeriaMatches,
  get365ScoreMatches, getKooraMatches, getPlayerIdentity,
  getTransfers, isUnavailable,
} from './sports-data-router.js'

import {
  getLeagueFlag, getCountryFlag, formatMatchRow,
  formatStandingsTable, detectFootballQueryType,
} from './football-context-builder.js'

import {
  searchLocalKnowledge, buildLocalMatchBlock,
  buildWorldCup2026AlgeriaContext, isWorldCup2026Query,
  WORLD_CUP_2026,
} from './dz-sports-knowledge.js'

// ══════════════════════════════════════════════════════════════════════════════
// § 1 — ثوابت وخرائط
// ══════════════════════════════════════════════════════════════════════════════

const AGENT_TIMEOUT = 18000

const DEFAULT_TIMEOUT = 12000

async function timedFetch(url, opts = {}) {
  const { timeout = DEFAULT_TIMEOUT, ...rest } = opts
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const r = await fetch(url, { signal: ctrl.signal, ...rest })
    clearTimeout(t)
    return r
  } catch (e) { clearTimeout(t); throw e }
}

// أعلام الدول للعرض
export const TEAM_FLAGS = {
  'الجزائر': '🇩🇿', 'Algeria': '🇩🇿', 'DZA': '🇩🇿',
  'المغرب': '🇲🇦', 'Morocco': '🇲🇦',
  'تونس': '🇹🇳', 'Tunisia': '🇹🇳',
  'مصر': '🇪🇬', 'Egypt': '🇪🇬',
  'ليبيا': '🇱🇾', 'Libya': '🇱🇾',
  'موريتانيا': '🇲🇷', 'Mauritania': '🇲🇷',
  'السنغال': '🇸🇳', 'Senegal': '🇸🇳',
  'نيجيريا': '🇳🇬', 'Nigeria': '🇳🇬',
  'الكاميرون': '🇨🇲', 'Cameroon': '🇨🇲',
  'غانا': '🇬🇭', 'Ghana': '🇬🇭',
  'كوت ديفوار': '🇨🇮', 'ساحل العاج': '🇨🇮', 'Ivory Coast': '🇨🇮',
  'مالي': '🇲🇱', 'Mali': '🇲🇱',
  'بوركينا فاسو': '🇧🇫', 'Burkina': '🇧🇫',
  'جنوب أفريقيا': '🇿🇦', 'South Africa': '🇿🇦',
  'إثيوبيا': '🇪🇹', 'Ethiopia': '🇪🇹',
  'فرنسا': '🇫🇷', 'France': '🇫🇷',
  'إسبانيا': '🇪🇸', 'Spain': '🇪🇸',
  'ألمانيا': '🇩🇪', 'Germany': '🇩🇪',
  'إيطاليا': '🇮🇹', 'Italy': '🇮🇹',
  'إنجلترا': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'البرتغال': '🇵🇹', 'Portugal': '🇵🇹',
  'هولندا': '🇳🇱', 'Netherlands': '🇳🇱',
  'بلجيكا': '🇧🇪', 'Belgium': '🇧🇪',
  'تركيا': '🇹🇷', 'Turkey': '🇹🇷',
  'كرواتيا': '🇭🇷', 'Croatia': '🇭🇷',
  'السويد': '🇸🇪', 'Sweden': '🇸🇪',
  'الدنمارك': '🇩🇰', 'Denmark': '🇩🇰',
  'سويسرا': '🇨🇭', 'Switzerland': '🇨🇭',
  'البرازيل': '🇧🇷', 'Brazil': '🇧🇷',
  'الأرجنتين': '🇦🇷', 'Argentina': '🇦🇷',
  'أوروغواي': '🇺🇾', 'Uruguay': '🇺🇾',
  'كولومبيا': '🇨🇴', 'Colombia': '🇨🇴',
  'تشيلي': '🇨🇱', 'Chile': '🇨🇱',
  'بيرو': '🇵🇪', 'Peru': '🇵🇪',
  'المكسيك': '🇲🇽', 'Mexico': '🇲🇽',
  'كندا': '🇨🇦', 'Canada': '🇨🇦',
  'الولايات المتحدة': '🇺🇸', 'أمريكا': '🇺🇸', 'USA': '🇺🇸', 'United States': '🇺🇸',
  'قطر': '🇶🇦', 'Qatar': '🇶🇦',
  'السعودية': '🇸🇦', 'Saudi Arabia': '🇸🇦',
  'الإمارات': '🇦🇪', 'UAE': '🇦🇪',
  'العراق': '🇮🇶', 'Iraq': '🇮🇶',
  'سوريا': '🇸🇾', 'Syria': '🇸🇾',
  'الأردن': '🇯🇴', 'Jordan': '🇯🇴',
  'إيران': '🇮🇷', 'Iran': '🇮🇷',
  'أستراليا': '🇦🇺', 'Australia': '🇦🇺',
  'اليابان': '🇯🇵', 'Japan': '🇯🇵',
  'كوريا': '🇰🇷', 'South Korea': '🇰🇷',
  'بوليفيا': '🇧🇴', 'Bolivia': '🇧🇴',
  'الإكوادور': '🇪🇨', 'Ecuador': '🇪🇨',
  'باراغواي': '🇵🇾', 'Paraguay': '🇵🇾',
  'فنزويلا': '🇻🇪', 'Venezuela': '🇻🇪',
  'بوليفيا': '🇧🇴', 'Bolivia': '🇧🇴',
  'كوستاريكا': '🇨🇷', 'Costa Rica': '🇨🇷',
  'بنما': '🇵🇦', 'Panama': '🇵🇦',
  'جامايكا': '🇯🇲', 'Jamaica': '🇯🇲',
  'الكويت': '🇰🇼', 'Kuwait': '🇰🇼',
  'البحرين': '🇧🇭', 'Bahrain': '🇧🇭',
  'عُمان': '🇴🇲', 'Oman': '🇴🇲',
  'اليمن': '🇾🇪', 'Yemen': '🇾🇪',
  'لبنان': '🇱🇧', 'Lebanon': '🇱🇧',
  'فلسطين': '🇵🇸', 'Palestine': '🇵🇸',
}

// خريطة الترجمة: عربي → إنجليزي (للبحث في APIs)
const TEAM_AR_TO_EN = {
  'الجزائر': 'Algeria',
  'المغرب': 'Morocco',
  'تونس': 'Tunisia',
  'مصر': 'Egypt',
  'ليبيا': 'Libya',
  'السنغال': 'Senegal',
  'نيجيريا': 'Nigeria',
  'الكاميرون': 'Cameroon',
  'غانا': 'Ghana',
  'ساحل العاج': 'Ivory Coast',
  'كوت ديفوار': 'Ivory Coast',
  'مالي': 'Mali',
  'فرنسا': 'France',
  'إسبانيا': 'Spain',
  'ألمانيا': 'Germany',
  'إيطاليا': 'Italy',
  'إنجلترا': 'England',
  'البرتغال': 'Portugal',
  'هولندا': 'Netherlands',
  'بلجيكا': 'Belgium',
  'تركيا': 'Turkey',
  'البرازيل': 'Brazil',
  'الأرجنتين': 'Argentina',
  'أوروغواي': 'Uruguay',
  'كولومبيا': 'Colombia',
  'تشيلي': 'Chile',
  'المكسيك': 'Mexico',
  'كندا': 'Canada',
  'الولايات المتحدة': 'USA',
  'أمريكا': 'USA',
  'قطر': 'Qatar',
  'السعودية': 'Saudi Arabia',
  'الإمارات': 'UAE',
  'العراق': 'Iraq',
  'أستراليا': 'Australia',
  'اليابان': 'Japan',
  'كوريا': 'South Korea',
  'بوليفيا': 'Bolivia',
  'الإكوادور': 'Ecuador',
  'كوستاريكا': 'Costa Rica',
  'الكويت': 'Kuwait',
  'البحرين': 'Bahrain',
  'عُمان': 'Oman',
  'فلسطين': 'Palestine',
}

// أنواع المباريات
const MATCH_TYPE_LABELS = {
  'friendly': '🤝 ودية',
  'World Cup': '🌐 كأس العالم',
  'AFCON': '🌍 كأس أمم أفريقيا',
  'Qualifiers': '🎯 تصفيات',
  'Nations League': '🌍 دوري الأمم',
  'UEFA Nations League': '🇪🇺 دوري الأمم الأوروبية',
  'Copa America': '🏆 كوبا أمريكا',
  'Euro': '🇪🇺 يورو',
  'Olympics': '🏅 أولمبياد',
  'U23': '🔷 تحت 23',
  'U21': '🔷 تحت 21',
  'U20': '🔷 تحت 20',
  'U17': '🔷 تحت 17',
}

function getMatchTypeLabel(competition = '') {
  const c = competition.toLowerCase()
  if (c.includes('friendly') || c.includes('international friendl') || c.includes('ودية') || c.includes('وديّة') || c.includes('amical') || c.includes('test match')) return '🤝 مباراة ودية'
  if (c.includes('world cup') || c.includes('كأس العالم') || c.includes('مونديال') || c.includes('fifa')) return '🌐 تصفيات/كأس العالم'
  if (c.includes('afcon') || c.includes('أمم أفريقيا') || c.includes('كان') || c.includes('caf')) return '🌍 كأس أمم أفريقيا'
  if (c.includes('qualifier') || c.includes('تصفيات') || c.includes('qualifying')) return '🎯 تصفيات'
  if (c.includes('nations league') || c.includes('دوري الأمم')) return '🌍 دوري الأمم'
  if (c.includes('copa america')) return '🏆 كوبا أمريكا'
  if (c.includes('euro') || c.includes('يورو')) return '🇪🇺 بطولة أوروبا'
  if (c.includes('olympic') || c.includes('أولمبياد')) return '🏅 أولمبياد'
  if (c.includes('u-23') || c.includes('u23') || c.includes('تحت 23')) return '🔷 تحت 23'
  if (c.includes('u-21') || c.includes('u21') || c.includes('تحت 21')) return '🔷 تحت 21'
  if (c.includes('u-20') || c.includes('u20')) return '🔷 تحت 20'
  if (c.includes('u-17') || c.includes('u17')) return '🔷 تحت 17'
  return '⚽ مباراة دولية'
}

// ══════════════════════════════════════════════════════════════════════════════
// § 2 — كاشف نوع الاستعلام الرياضي
// ══════════════════════════════════════════════════════════════════════════════

/**
 * تصنيف شامل لنوع الاستعلام الرياضي
 */
export function classifySportsQuery(query = '') {
  const q = query.trim()
  const ql = q.toLowerCase()

  // نمط "A ضد B" أو "A vs B"
  const vsMatch = q.match(
    /([\u0600-\u06FFa-zA-Z][^\s،,\-–()[\]؟?]{1,25})\s+(?:ضد|vs\.?|contre)\s+([\u0600-\u06FFa-zA-Z][^\s،,\-–()[\]؟?]{1,25})/iu
  )
  if (vsMatch) {
    return {
      type: 'MATCH_SEARCH',
      team1: vsMatch[1].trim(),
      team2: vsMatch[2].trim(),
      temporal: detectTemporalContext(q),
    }
  }

  // نمط منتخبان بجوار بعض (الجزائر بوليفيا)
  const teams = Object.keys(TEAM_AR_TO_EN)
  for (const t1 of teams) {
    for (const t2 of teams) {
      if (t1 === t2) continue
      if (q.includes(t1) && q.includes(t2)) {
        return {
          type: 'MATCH_SEARCH',
          team1: t1,
          team2: t2,
          temporal: detectTemporalContext(q),
        }
      }
    }
  }

  // انتقالات وصفقات
  if (/انتقل|انتقال|صفقة|تعاقد|ضم|اشترى|بيع|عرض.*شراء|رحل|غادر|وقّع|عقد|transfert|mercato/i.test(q)) {
    return { type: 'TRANSFER_NEWS', query: q }
  }

  // أخبار لاعب
  if (/لاعب|player|إصابة|عاد.*ملاعب|عاد.*اللعب|إيقاف|تعليق|عقوبة|إنجاز|هدف.*لاعب|تشكيلة/i.test(q)) {
    return { type: 'PLAYER_INFO', query: q }
  }

  // رزنامة / جدول مباريات
  if (/رزنامة|جدول.*مباريات|fixture|schedule|برنامج.*مباريات|متى.*مباراة|موعد.*مباراة/i.test(q)) {
    return { type: 'FIXTURE_SCHEDULE', query: q }
  }

  // أخبار رياضية عامة
  if (/خبر|أخبار|عاجل|مستجد|رياضة|كرة|football|soccer/i.test(q)) {
    return { type: 'SPORTS_NEWS', query: q }
  }

  return { type: 'GENERAL_SPORTS', query: q }
}

function detectTemporalContext(msg = '') {
  const LIVE_KW     = /(?:الآن|مباشر|مباشرة|جارية|هذه\s+اللحظة|الشوط|live\s*now|en\s+direct)/i
  const PAST_KW     = /(?:لعبت|انتهت|انتهى|نتيجة|فاز|ربح|هزم|كانت?|أمس|البارح|الأسبوع\s+الماضي|الشهر\s+الماضي|في\s+\d{4}|آخر\s+مباراة|قديمة|سابقة|أرشيف)/i
  const UPCOMING_KW = /(?:ستلعب|القادمة?|غداً?|بعد\s+غد|الأسبوع\s+القادم|موعد|متى\s+ست|برنامج|مرتقبة?|مقرر)/i
  if (LIVE_KW.test(msg))     return 'LIVE'
  if (PAST_KW.test(msg))     return 'PAST'
  if (UPCOMING_KW.test(msg)) return 'UPCOMING'
  return 'UNKNOWN'
}

// ══════════════════════════════════════════════════════════════════════════════
// § 2b — TheSportsDB — مصدر رئيسي لمباريات المنتخبات الوطنية (مجاني، موثوق)
// ══════════════════════════════════════════════════════════════════════════════

// خريطة: اسم الفريق العربي → TheSportsDB team ID
export const NATIONAL_TEAM_IDS = {
  'الجزائر':           '134516',
  'المغرب':            '134514',
  'تونس':              '134518',
  'مصر':               '134509',
  'ليبيا':             '134513',
  'موريتانيا':         '136188',
  'السنغال':           '134517',
  'نيجيريا':           '134516',
  'الكاميرون':         '134504',
  'غانا':              '134508',
  'ساحل العاج':        '134505',
  'كوت ديفوار':        '134505',
  'مالي':              '155726',
  'جنوب أفريقيا':      '134519',
  'فرنسا':             '134842',
  'إسبانيا':           '133629',
  'ألمانيا':           '133600',
  'إيطاليا':           '134842',
  'إنجلترا':           '133604',
  'البرتغال':          '134625',
  'هولندا':            '134612',
  'بلجيكا':            '134581',
  'تركيا':             '134653',
  'كرواتيا':           '134592',
  'السويد':            '134647',
  'الدنمارك':          '134593',
  'سويسرا':            '134648',
  'البرازيل':          '136375',
  'الأرجنتين':         '136375',
  'أوروغواي':          '136474',
  'كولومبيا':          '136413',
  'تشيلي':             '136406',
  'بيرو':              '136451',
  'المكسيك':           '136442',
  'كندا':              '134872',
  'الولايات المتحدة':  '135029',
  'أمريكا':            '135029',
  'قطر':               '134903',
  'السعودية':          '134907',
  'الإمارات':          '134908',
  'العراق':            '134895',
  'إيران':             '134896',
  'أستراليا':          '134777',
  'اليابان':           '134858',
  'كوريا':             '134859',
  'بوليفيا':           '136470',
  'الإكوادور':         '136419',
  'باراغواي':          '136449',
  'فنزويلا':           '136475',
  'كوستاريكا':         '135012',
  'الكويت':            '134898',
  'البحرين':           '134889',
  'عُمان':             '134902',
  'فلسطين':            '134903',
  'بوركينا فاسو':      '155694',
  'بوركينا':           '155694',
}

// ترجمة أسماء الفرق إلى إنجليزي لـ TheSportsDB
const TSDB_EN_NAMES = {
  'الجزائر': 'Algeria',
  'المغرب': 'Morocco',
  'تونس': 'Tunisia',
  'مصر': 'Egypt',
  'بوليفيا': 'Bolivia',
  'السنغال': 'Senegal',
  'فرنسا': 'France',
  'إسبانيا': 'Spain',
  'البرازيل': 'Brazil',
  'الأرجنتين': 'Argentina',
  'ألمانيا': 'Germany',
  'إيطاليا': 'Italy',
  'إنجلترا': 'England',
}

/**
 * جلب مباريات منتخب وطني من TheSportsDB (الأحداث القادمة والماضية)
 */
async function fetchTheSportsDBFixtures(teamId, type = 'next') {
  if (!teamId) return []
  try {
    const endpoint = type === 'next'
      ? `https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=${teamId}`
      : `https://www.thesportsdb.com/api/v1/json/3/eventslast.php?id=${teamId}`

    const res = await timedFetch(endpoint, {
      headers: { 'User-Agent': 'DZ-GPT-SportsAgent/2.0' },
      timeout: 10000,
    })
    if (!res.ok) return []
    const data = await res.json()
    const events = data?.events || []

    return events.map(e => {
      // تحديد حالة المباراة
      const now = Date.now()
      const matchTs = e.dateEvent && e.strTime
        ? new Date(`${e.dateEvent}T${e.strTime}Z`).getTime()
        : e.dateEvent ? new Date(e.dateEvent).getTime() : 0

      let statusType = 'upcoming'
      if (type === 'last' || (matchTs && matchTs < now - 3600000)) statusType = 'finished'

      return {
        homeTeam: e.strHomeTeam || '',
        awayTeam: e.strAwayTeam || '',
        homeScore: e.intHomeScore != null && e.intHomeScore !== '' ? parseInt(e.intHomeScore) : null,
        awayScore: e.intAwayScore != null && e.intAwayScore !== '' ? parseInt(e.intAwayScore) : null,
        statusType,
        date: e.dateEvent || '',
        startTime: e.strTime ? e.strTime.slice(0, 5) : '',
        league: e.strLeague || '',
        competition: e.strLeague || '',
        venue: e.strVenue || '',
        city: e.strCity || '',
        country: e.strCountry || '',
        matchId: e.idEvent || '',
        link: e.idEvent
          ? `https://www.thesportsdb.com/event/${e.idEvent}`
          : 'https://www.thesportsdb.com',
        source: 'TheSportsDB',
        thumbnailUrl: e.strThumb || '',
        round: e.intRound ? `الجولة ${e.intRound}` : '',
      }
    })
  } catch (e) {
    console.warn('[TheSportsDB] fetch error:', e.message)
    return []
  }
}

/**
 * البحث عن مباراة بين فريقين في TheSportsDB
 * يجلب مباريات كلا الفريقين (القادمة + السابقة) ويجد التقاطع
 */
async function searchTheSportsDBMatch(team1 = '', team2 = '') {
  const id1 = NATIONAL_TEAM_IDS[team1] || NATIONAL_TEAM_IDS[
    Object.keys(NATIONAL_TEAM_IDS).find(k =>
      team1.includes(k) || k.includes(team1) ||
      (TSDB_EN_NAMES[k] || '').toLowerCase().includes(team1.toLowerCase()))
  ]
  const id2 = NATIONAL_TEAM_IDS[team2] || NATIONAL_TEAM_IDS[
    Object.keys(NATIONAL_TEAM_IDS).find(k =>
      team2.includes(k) || k.includes(team2) ||
      (TSDB_EN_NAMES[k] || '').toLowerCase().includes(team2.toLowerCase()))
  ]

  if (!id1 && !id2) return []

  const promises = []
  if (id1) {
    promises.push(fetchTheSportsDBFixtures(id1, 'next'))
    promises.push(fetchTheSportsDBFixtures(id1, 'last'))
  }
  if (id2 && id2 !== id1) {
    promises.push(fetchTheSportsDBFixtures(id2, 'next'))
    promises.push(fetchTheSportsDBFixtures(id2, 'last'))
  }

  const results = await Promise.allSettled(promises)
  const allMatches = results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)

  // البحث عن المباراة المشتركة
  const terms1 = normalizeTeamSearch(team1)
  const terms2 = normalizeTeamSearch(team2)

  // أضف أسماء إنجليزية للبحث
  const en1 = TSDB_EN_NAMES[team1] || TEAM_AR_TO_EN[team1] || team1
  const en2 = TSDB_EN_NAMES[team2] || TEAM_AR_TO_EN[team2] || team2
  if (en1) terms1.push(en1.toLowerCase())
  if (en2) terms2.push(en2.toLowerCase())

  return allMatches.filter(m => {
    const h = (m.homeTeam || '').toLowerCase()
    const a = (m.awayTeam || '').toLowerCase()
    return (terms1.some(t => h.includes(t) || t.includes(h.split(' ')[0])) &&
            terms2.some(t => a.includes(t) || t.includes(a.split(' ')[0]))) ||
           (terms2.some(t => h.includes(t) || t.includes(h.split(' ')[0])) &&
            terms1.some(t => a.includes(t) || t.includes(a.split(' ')[0])))
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// § 3 — جلب مباريات FotMob بتواريخ متعددة (مُحسَّن)
// ══════════════════════════════════════════════════════════════════════════════

const FOTMOB_HDR = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'ar,en;q=0.9',
  'Referer': 'https://www.fotmob.com/',
}

const SOFA_HDR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://www.sofascore.com/',
}

const SCORE365_HDR = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
  'Referer': 'https://www.365scores.com/ar/',
  'Origin': 'https://www.365scores.com',
}

// جلب مباريات FotMob ليوم محدد
async function fetchFotmobForDate(dateStr) {
  try {
    const d = dateStr.replace(/-/g, '')
    const url = `https://www.fotmob.com/api/matches?date=${d}`
    const res = await timedFetch(url, { headers: FOTMOB_HDR, timeout: 10000 })
    if (!res.ok) return []
    const json = await res.json()
    const all = []
    for (const lg of (json?.leagues || [])) {
      for (const m of (lg.matches || [])) {
        const status = m.status?.finished ? 'finished' : m.status?.started ? 'live' : 'upcoming'
        const startTs = m.status?.utcTime ? new Date(m.status.utcTime) : null
        all.push({
          homeTeam: m.home?.name || m.home?.longName || '',
          awayTeam: m.away?.name || m.away?.longName || '',
          homeScore: m.home?.score ?? null,
          awayScore: m.away?.score ?? null,
          statusType: status,
          startTime: startTs ? startTs.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
          date: dateStr,
          league: lg.name || '',
          leagueId: lg.id,
          matchId: m.id,
          link: m.id ? `https://www.fotmob.com/matches/${m.id}` : 'https://www.fotmob.com',
          source: 'FotMob',
        })
      }
    }
    return all
  } catch (_) { return [] }
}

// جلب مباريات 365score ليوم محدد
async function fetch365ForDate(dateStr) {
  try {
    const dateParam = dateStr.replace(/-/g, '')
    const url = `https://webws.365scores.com/web/games/?appTypeId=5&langId=1&timezoneName=Africa%2FAlgiers&userCountryId=44&dates=${dateParam}`
    const res = await timedFetch(url, { headers: SCORE365_HDR, timeout: 10000 })
    if (!res.ok) return []
    const json = await res.json()
    const games = json?.games || []
    return games.map(g => {
      const statusId = g.status?.id
      const statusType = [2,3,4].includes(statusId) ? 'live' : statusId === 5 ? 'finished' : 'upcoming'
      const startTs = g.startTime ? new Date(g.startTime) : null
      return {
        homeTeam: g.homeCompetitor?.name || g.homeCompetitor?.shortName || '',
        awayTeam: g.awayCompetitor?.name || g.awayCompetitor?.shortName || '',
        homeScore: (statusType === 'live' || statusType === 'finished') ? (g.homeCompetitor?.score ?? null) : null,
        awayScore: (statusType === 'live' || statusType === 'finished') ? (g.awayCompetitor?.score ?? null) : null,
        statusType,
        startTime: startTs ? startTs.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
        date: dateStr,
        league: g.competitionDisplayName || '',
        leagueId: g.competitionId,
        venue: g.venue?.name || '',
        matchId: g.id,
        link: g.id ? `https://www.365scores.com/ar/football/match/${g.id}` : 'https://www.365scores.com/ar/',
        source: '365score',
      }
    }).filter(m => m.homeTeam && m.awayTeam)
  } catch (_) { return [] }
}

// جلب مباريات SofaScore ليوم محدد
async function fetchSofaForDate(dateStr) {
  try {
    const res = await timedFetch(
      `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${dateStr}`,
      { headers: SOFA_HDR, timeout: 10000 }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data?.events || []).map(e => {
      const startTs = e.startTimestamp ? new Date(e.startTimestamp * 1000) : null
      const isLive = e.status?.type === 'inprogress'
      const isFinished = e.status?.type === 'finished'
      return {
        homeTeam: e.homeTeam?.name || '',
        awayTeam: e.awayTeam?.name || '',
        homeScore: (isLive || isFinished) ? (e.homeScore?.current ?? null) : null,
        awayScore: (isLive || isFinished) ? (e.awayScore?.current ?? null) : null,
        statusType: e.status?.type || 'upcoming',
        startTime: startTs ? startTs.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
        date: dateStr,
        league: e.tournament?.name || '',
        country: e.tournament?.category?.country?.name || '',
        venue: e.venue?.city?.name || '',
        matchId: e.id,
        link: e.id ? `https://www.sofascore.com/event/${e.id}` : 'https://www.sofascore.com',
        source: 'SofaScore',
      }
    })
  } catch (_) { return [] }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 4 — جلب تفاصيل مباراة من FotMob (التشكيلة والملعب)
// ══════════════════════════════════════════════════════════════════════════════

async function fetchFotmobMatchDetails(matchId) {
  if (!matchId) return null
  try {
    const res = await timedFetch(
      `https://www.fotmob.com/api/matchDetails?matchId=${matchId}`,
      { headers: FOTMOB_HDR, timeout: 10000 }
    )
    if (!res.ok) return null
    const d = await res.json()
    const general = d?.general || {}
    const content  = d?.content || {}

    const homeLineup = content?.lineup?.homeTeam?.players || []
    const awayLineup = content?.lineup?.awayTeam?.players || []

    const extractSquad = (players) => players
      .flat()
      .filter(p => p?.name)
      .map(p => ({ name: p.name, position: p.positionBowId || '' }))
      .slice(0, 11)

    return {
      matchId,
      venue: general.venue?.name || '',
      city: general.venue?.city || '',
      competition: general.leagueName || '',
      round: general.roundName || '',
      homeSquad: extractSquad(homeLineup),
      awaySquad: extractSquad(awayLineup),
      referee: content?.matchFacts?.referee?.text || '',
      attendance: content?.matchFacts?.attendance?.text || '',
      source: 'FotMob',
    }
  } catch (_) { return null }
}

// جلب تفاصيل مباراة من SofaScore
async function fetchSofaMatchDetails(matchId) {
  if (!matchId) return null
  try {
    const [detailRes, lineupRes] = await Promise.allSettled([
      timedFetch(`https://api.sofascore.com/api/v1/event/${matchId}`, { headers: SOFA_HDR, timeout: 8000 }),
      timedFetch(`https://api.sofascore.com/api/v1/event/${matchId}/lineups`, { headers: SOFA_HDR, timeout: 8000 }),
    ])

    const detail = detailRes.status === 'fulfilled' && detailRes.value.ok
      ? await detailRes.value.json() : null
    const lineup = lineupRes.status === 'fulfilled' && lineupRes.value.ok
      ? await lineupRes.value.json() : null

    const e = detail?.event || {}
    const homeLineup = lineup?.home?.players || []
    const awayLineup = lineup?.away?.players || []

    const extractSquad = (players) => players
      .filter(p => p?.player?.name)
      .map(p => ({ name: p.player.name, position: p.player.position || '' }))
      .slice(0, 11)

    return {
      matchId,
      venue: e.venue?.city?.name || '',
      competition: e.tournament?.name || '',
      homeSquad: extractSquad(homeLineup),
      awaySquad: extractSquad(awayLineup),
      source: 'SofaScore',
    }
  } catch (_) { return null }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 5 — جلب أخبار CAF/FIFA عبر RSS
// ══════════════════════════════════════════════════════════════════════════════

async function fetchSportsNewsRSS(teamA = '', teamB = '') {
  const feeds = [
    { url: 'https://www.cafonline.com/feed/', name: 'CAF' },
    { url: 'https://www.fifa.com/en/news.rss', name: 'FIFA' },
    { url: 'https://www.alhaddaf.com/feed/', name: 'الهداف' },
  ]

  const queries = [teamA, teamB].filter(Boolean).map(t => t.toLowerCase())
  const results = []

  await Promise.allSettled(feeds.map(async feed => {
    try {
      const res = await timedFetch(feed.url, {
        headers: { 'User-Agent': 'DZ-GPT/1.0', 'Accept': 'application/rss+xml,text/xml,*/*' },
        timeout: 8000,
      })
      if (!res.ok) return
      const xml = await res.text()
      const items = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/gi) || []
      for (const item of items.slice(0, 20)) {
        const titleM = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)
        const linkM  = item.match(/<link>(https?:\/\/[^\s<]+)<\/link>/i)
        const dateM  = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)
        if (!titleM) continue
        const title = titleM[1].replace(/<[^>]+>/g, '').trim()
        const relevant = !queries.length || queries.some(q => title.toLowerCase().includes(q))
        if (relevant) {
          results.push({
            title,
            link: linkM?.[1] || feed.url,
            date: dateM?.[1]?.trim() || '',
            source: feed.name,
          })
        }
      }
    } catch (_) {}
  }))

  return results.slice(0, 8)
}

// ══════════════════════════════════════════════════════════════════════════════
// § 6 — دالة المطابقة بين اسم الفريق والمباريات
// ══════════════════════════════════════════════════════════════════════════════

function normalizeTeamSearch(name = '') {
  const n = name.toLowerCase().trim()
  // ترجمة عربي → إنجليزي
  const en = TEAM_AR_TO_EN[name] || TEAM_AR_TO_EN[
    Object.keys(TEAM_AR_TO_EN).find(k => n.includes(k.toLowerCase()) || k.toLowerCase().includes(n))
  ] || name
  return [n, en.toLowerCase(), name]
}

function matchesTeam(matchName = '', searchTerms = []) {
  const mn = matchName.toLowerCase()
  return searchTerms.some(term => {
    const t = term.toLowerCase()
    return mn.includes(t) || t.includes(mn) ||
      (mn.length > 4 && t.length > 4 && (mn.startsWith(t.slice(0, 4)) || t.startsWith(mn.slice(0, 4))))
  })
}

function findMatchInList(matches = [], team1 = '', team2 = '') {
  const terms1 = normalizeTeamSearch(team1)
  const terms2 = normalizeTeamSearch(team2)
  return matches.filter(m => {
    const h = m.homeTeam || m.home || ''
    const a = m.awayTeam || m.away || ''
    return (matchesTeam(h, terms1) && matchesTeam(a, terms2)) ||
           (matchesTeam(h, terms2) && matchesTeam(a, terms1))
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// § 7 — البحث عن مباراة محددة عبر نطاق زمني واسع
// ══════════════════════════════════════════════════════════════════════════════

/**
 * searchMatchAcrossDates(team1, team2, options)
 *
 * استراتيجية البحث (بالأولوية):
 *   1. TheSportsDB — مباريات المنتخبات الوطنية (الأفضل للوديات والتصفيات)
 *   2. 365score + FotMob — بحث يومي على نطاق زمني واسع
 *
 * يُعيد مصفوفة مرتبة: القادمة أولاً ← الحية ← المنتهية
 */
export async function searchMatchAcrossDates(team1 = '', team2 = '', options = {}) {
  const { temporal = 'UNKNOWN', maxPastDays = 60, maxFutureDays = 120 } = options

  const found = []

  // ══ المرحلة 1: TheSportsDB (الأسرع والأموثوق للمنتخبات) ══════════════════
  try {
    const tsdbMatches = await searchTheSportsDBMatch(team1, team2)
    for (const m of tsdbMatches) {
      if (!found.some(f => f.date === m.date && f.homeTeam === m.homeTeam)) {
        found.push(m)
      }
    }
    if (found.length > 0) {
      console.log(`[SportsAgent:TSDB] ✅ Found ${found.length} matches via TheSportsDB`)
      return sortMatchResults(found)
    }
  } catch (e) {
    console.warn('[SportsAgent:TSDB] failed:', e.message)
  }

  // ══ المرحلة 2: بحث يومي في 365score + FotMob ══════════════════════════════
  const today = new Date()
  const dateList = []

  if (temporal === 'UPCOMING') {
    for (let i = 0; i <= maxFutureDays; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i)
      dateList.push({ str: d.toISOString().slice(0, 10), type: 'future' })
    }
  } else if (temporal === 'PAST') {
    for (let i = 1; i <= maxPastDays; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      dateList.push({ str: d.toISOString().slice(0, 10), type: 'past' })
    }
  } else {
    for (let i = 0; i <= 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i)
      dateList.push({ str: d.toISOString().slice(0, 10), type: 'future' })
    }
    for (let i = 1; i <= 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      dateList.push({ str: d.toISOString().slice(0, 10), type: 'past' })
    }
  }

  const coreRange = dateList.slice(0, 15)
  const extendedRange = dateList.slice(15)

  const corePromises = coreRange.flatMap(({ str }) => [
    fetch365ForDate(str).then(ms => ({ date: str, matches: ms })),
    fetchFotmobForDate(str).then(ms => ({ date: str, matches: ms })),
  ])

  const coreResults = await Promise.allSettled(corePromises)
  for (const r of coreResults) {
    if (r.status !== 'fulfilled') continue
    const relevant = findMatchInList(r.value.matches, team1, team2)
    for (const m of relevant) {
      if (!found.some(f => f.date === r.value.date && f.homeTeam === m.homeTeam)) {
        found.push({ ...m, date: r.value.date })
      }
    }
  }

  if (found.length > 0) return sortMatchResults(found)

  const batchSize = 5
  for (let i = 0; i < Math.min(extendedRange.length, 45); i += batchSize) {
    const batch = extendedRange.slice(i, i + batchSize)
    const batchPromises = batch.flatMap(({ str }) => [
      fetch365ForDate(str).then(ms => ({ date: str, matches: ms })),
      fetchFotmobForDate(str).then(ms => ({ date: str, matches: ms })),
    ])
    const results = await Promise.allSettled(batchPromises)
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      const relevant = findMatchInList(r.value.matches, team1, team2)
      for (const m of relevant) {
        if (!found.some(f => f.date === r.value.date && f.homeTeam === m.homeTeam)) {
          found.push({ ...m, date: r.value.date })
        }
      }
    }
    if (found.length > 0) break
  }

  return sortMatchResults(found)
}

function sortMatchResults(matches = []) {
  const now = Date.now()
  const order = { live: 0, upcoming: 1, finished: 2 }
  return matches.sort((a, b) => {
    const orderDiff = (order[a.statusType] ?? 3) - (order[b.statusType] ?? 3)
    if (orderDiff !== 0) return orderDiff
    const da = a.date ? new Date(a.date).getTime() : now
    const db = b.date ? new Date(b.date).getTime() : now
    if (a.statusType === 'upcoming') return da - db
    return db - da
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// § 8 — بناء سياق المباراة المُفصَّل (نص منسق للـ LLM)
// ══════════════════════════════════════════════════════════════════════════════

function getTeamFlag(name = '') {
  const n = name.trim()
  if (TEAM_FLAGS[n]) return TEAM_FLAGS[n]
  for (const [key, flag] of Object.entries(TEAM_FLAGS)) {
    if (n.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(n.toLowerCase())) {
      return flag
    }
  }
  return getCountryFlag(n) || '🏴'
}

function formatDateArabic(dateStr = '') {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ar-DZ', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Africa/Algiers',
    })
  } catch (_) { return dateStr }
}

/**
 * buildMatchDetailedBlock(match, details?)
 * يبني كتلة نصية شاملة لمباراة محددة مع الأعلام والجداول
 */
export function buildMatchDetailedBlock(match = {}, details = null) {
  const flag1 = getTeamFlag(match.homeTeam || '')
  const flag2 = getTeamFlag(match.awayTeam || '')
  const competition = match.league || match.competition || ''
  const matchType = getMatchTypeLabel(competition)
  const dateLabel = formatDateArabic(match.date)

  const lines = []

  // ── رأس المباراة ──────────────────────────────────────────
  if (match.statusType === 'live') {
    lines.push(`## 🔴 مباراة مباشرة`)
  } else if (match.statusType === 'finished') {
    lines.push(`## ✅ نتيجة المباراة`)
  } else {
    lines.push(`## 📅 مباراة قادمة`)
  }

  // ── الفريقان والنتيجة/الموعد ──────────────────────────────
  const scoreOrTime = (match.homeScore !== null && match.homeScore !== undefined &&
                       match.awayScore !== null && match.awayScore !== undefined)
    ? `**${match.homeScore} - ${match.awayScore}**`
    : match.startTime ? `⏰ ${match.startTime}` : 'موعد لم يُحدَّد'

  lines.push(`\n| ${flag1} **${match.homeTeam}** | ${scoreOrTime} | **${match.awayTeam}** ${flag2} |`)
  lines.push(`|:---:|:---:|:---:|`)
  lines.push('')

  // ── تفاصيل المباراة ───────────────────────────────────────
  const detailLines = []
  if (dateLabel)           detailLines.push(`📅 **التاريخ:** ${dateLabel}`)
  if (match.startTime && match.statusType !== 'finished')
                            detailLines.push(`⏰ **الموعد:** ${match.startTime} (توقيت الجزائر)`)
  if (competition)         detailLines.push(`🏆 **البطولة:** ${competition}`)
  if (matchType)           detailLines.push(`🎯 **النوع:** ${matchType}`)

  const venue = details?.venue || match.venue || ''
  const city  = details?.city  || match.city  || ''
  if (venue)               detailLines.push(`🏟️ **الملعب:** ${venue}${city ? ` (${city})` : ''}`)
  if (details?.referee)    detailLines.push(`👨‍⚖️ **الحكم:** ${details.referee}`)
  if (details?.attendance)  detailLines.push(`👥 **الحضور:** ${details.attendance}`)
  if (match.link)          detailLines.push(`🔗 **المصدر:** [${match.source}](${match.link})`)

  lines.push(...detailLines)

  // ── التشكيلة (إذا متوفرة) ────────────────────────────────
  if (details?.homeSquad?.length || details?.awaySquad?.length) {
    lines.push(`\n### 👕 التشكيلة`)
    lines.push(`| ${flag1} ${match.homeTeam} | ${flag2} ${match.awayTeam} |`)
    lines.push(`|---|---|`)
    const maxLen = Math.max(details.homeSquad?.length || 0, details.awaySquad?.length || 0)
    for (let i = 0; i < maxLen; i++) {
      const hp = details.homeSquad?.[i]?.name || ''
      const ap = details.awaySquad?.[i]?.name || ''
      lines.push(`| ${hp} | ${ap} |`)
    }
  }

  lines.push(`\n_📡 البيانات من: **${match.source}**_`)

  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════════════
// § 9 — الوكيل الرياضي الرئيسي
// ══════════════════════════════════════════════════════════════════════════════

/**
 * runSportsAgent(query, history?)
 *
 * نقطة الدخول الرئيسية للوكيل الرياضي.
 *
 * يُعيد:
 * {
 *   found: boolean,
 *   type: 'MATCH_SEARCH' | 'PLAYER_INFO' | 'TRANSFER_NEWS' | 'SPORTS_NEWS' | ...,
 *   context: string,           // كتلة نصية منسقة للـ LLM
 *   matches?: [...],           // المباريات المُكتشفة
 *   details?: {...},           // تفاصيل المباراة
 *   sources: string[],
 *   fetchedAt: string,
 * }
 */
export async function runSportsAgent(query = '', history = []) {
  const classification = classifySportsQuery(query)
  const fetchedAt = new Date().toISOString()

  console.log(`[SportsAgent] 🏆 Query: "${query.slice(0, 80)}" → type=${classification.type}`)

  // ── 🌐 كأس العالم 2026 — أولوية قصوى ─────────────────────────────────────
  if (isWorldCup2026Query(query)) {
    console.log(`[SportsAgent] 🌐 World Cup 2026 query detected`)
    const wcContext = buildWorldCup2026AlgeriaContext()

    // إذا كان السؤال عن مباراة محددة في كأس العالم
    if (classification.type === 'MATCH_SEARCH') {
      const { team1, team2 } = classification
      const local = searchLocalKnowledge(team1, team2, 'UPCOMING')

      if (local.wcFixtures.length > 0) {
        const contextLines = [
          `━━━ 🌐 كأس العالم 2026 — مباريات الجزائر ━━━\n`,
        ]
        for (const fix of local.wcFixtures) {
          contextLines.push(buildLocalMatchBlock(fix))
          contextLines.push('')
        }
        contextLines.push(`\n---\n`)
        contextLines.push(wcContext)
        return {
          found: true, type: 'WORLD_CUP_2026', team1, team2,
          context: contextLines.join('\n'),
          sources: ['DZ-Sports-Knowledge', 'FIFA'],
          fetchedAt,
        }
      }

      // المجموعة والرزنامة الكاملة
      return {
        found: true, type: 'WORLD_CUP_2026',
        context: wcContext,
        sources: ['DZ-Sports-Knowledge', 'FIFA'],
        fetchedAt,
      }
    }

    return {
      found: true, type: 'WORLD_CUP_2026',
      context: wcContext,
      sources: ['DZ-Sports-Knowledge', 'FIFA'],
      fetchedAt,
    }
  }

  // ── ① بحث عن مباراة محددة ──────────────────────────────────────────────
  if (classification.type === 'MATCH_SEARCH') {
    const { team1, team2, temporal } = classification
    console.log(`[SportsAgent] 🆚 ${team1} ضد ${team2} | temporal=${temporal}`)

    // ══ المرحلة 0: قاعدة البيانات المحلية أولاً (فورية، موثوقة) ══════════
    const localResult = searchLocalKnowledge(team1, team2, temporal)
    if (localResult.found) {
      console.log(`[SportsAgent:LOCAL] ✅ Found ${localResult.matches.length} matches in local DB`)
      const contextLines = [
        `━━━ ⚽ بيانات الوكيل الرياضي (قاعدة البيانات الجزائرية) ━━━`,
        `📡 المصدر: **DZ-Sports-Knowledge** (بيانات موثّقة ✅)`,
        ``,
      ]

      for (const m of localResult.matches.slice(0, 3)) {
        contextLines.push(buildLocalMatchBlock(m))
        contextLines.push('')
      }

      if (localResult.wcFixtures.length > 0) {
        contextLines.push(`### 📅 مباريات كأس العالم 2026 ذات الصلة`)
        for (const fix of localResult.wcFixtures) {
          contextLines.push(buildLocalMatchBlock(fix))
          contextLines.push('')
        }
      }

      contextLines.push(`\n✅ **البيانات محقّقة من قاعدة البيانات الجزائرية الرسمية.**`)

      return {
        found: true, type: 'MATCH_SEARCH', team1, team2, temporal,
        matches: localResult.matches,
        context: contextLines.join('\n'),
        sources: ['DZ-Sports-Knowledge'],
        fetchedAt,
      }
    }

    // ══ المرحلة 1-2: البحث الخارجي ════════════════════════════════════════
    const [matches, newsItems] = await Promise.allSettled([
      searchMatchAcrossDates(team1, team2, { temporal }),
      fetchSportsNewsRSS(team1, team2),
    ])

    const foundMatches = matches.status === 'fulfilled' ? matches.value : []
    const newsResults  = newsItems.status === 'fulfilled' ? newsItems.value : []

    if (!foundMatches.length) {
      return {
        found: false,
        type: 'MATCH_SEARCH',
        team1, team2, temporal,
        context: buildNoMatchContext(team1, team2, newsResults),
        sources: ['365score', 'FotMob', 'SofaScore'],
        fetchedAt,
      }
    }

    // جلب تفاصيل أول مباراة مُعثور عليها
    let details = null
    const firstMatch = foundMatches[0]
    if (firstMatch.matchId && firstMatch.source === 'FotMob') {
      details = await fetchFotmobMatchDetails(firstMatch.matchId).catch(() => null)
    } else if (firstMatch.matchId && firstMatch.source === 'SofaScore') {
      details = await fetchSofaMatchDetails(firstMatch.matchId).catch(() => null)
    }

    const contextLines = []
    contextLines.push(`━━━ ⚽ بيانات الوكيل الرياضي ━━━`)
    contextLines.push(`📡 المصادر: **365score** ← **FotMob** ← **SofaScore**`)
    contextLines.push(``)

    for (const m of foundMatches.slice(0, 3)) {
      const det = m === firstMatch ? details : null
      contextLines.push(buildMatchDetailedBlock(m, det))
      contextLines.push('')
    }

    if (newsResults.length > 0) {
      contextLines.push(`### 📰 أحدث الأخبار ذات الصلة`)
      for (const n of newsResults.slice(0, 4)) {
        contextLines.push(`• **${n.title}** — [${n.source}](${n.link})${n.date ? ` | ${n.date}` : ''}`)
      }
    }

    contextLines.push(`\n⚠️ **قاعدة صارمة للنموذج:** اعرض البيانات أعلاه فقط. لا تخترع نتائج أو أهدافاً أو تواريخ من ذاكرتك.`)

    const sources = [...new Set(foundMatches.map(m => m.source))]

    return {
      found: true,
      type: 'MATCH_SEARCH',
      team1, team2, temporal,
      matches: foundMatches,
      details,
      context: contextLines.join('\n'),
      sources,
      fetchedAt,
    }
  }

  // ── ② أخبار انتقالات ──────────────────────────────────────────────────────
  if (classification.type === 'TRANSFER_NEWS') {
    const playerMatch = query.match(
      /(?:انتقل|صفقة|تعاقد|ضم|اشترى|بيع|رحل|غادر|وقّع)\s*(?:مع|إلى|من)?\s*([\u0600-\u06FF\s]{3,25})/i
    )
    const playerName = playerMatch?.[1]?.trim() || ''

    if (playerName) {
      const [identity, transfers] = await Promise.allSettled([
        getPlayerIdentity(playerName),
        getTransfers(playerName),
      ])
      const pid = identity.status === 'fulfilled' && !isUnavailable(identity.value) ? identity.value : null
      const trn = transfers.status === 'fulfilled' && !isUnavailable(transfers.value) ? transfers.value : null
      const newsResults = await fetchSportsNewsRSS(playerName, '').catch(() => [])

      const lines = [`━━━ ⚽ معلومات انتقال: **${playerName}** ━━━\n`]
      if (pid) {
        const flag = getTeamFlag(pid.nationality || '')
        lines.push(`👤 **${pid.name}** ${flag}`)
        if (pid.club) lines.push(`🏟️ النادي الحالي: ${pid.club}`)
        if (pid.position) lines.push(`🎽 المركز: ${pid.position}`)
        if (trn?.marketValue) lines.push(`💰 القيمة السوقية: ${trn.marketValue}`)
        if (trn?.profileUrl) lines.push(`🔗 [Transfermarkt](${trn.profileUrl})`)
      }
      if (trn?.transfers?.length) {
        lines.push(`\n### 📋 سجل الانتقالات`)
        for (const t of trn.transfers.slice(0, 5)) {
          lines.push(`• ${t.date || '?'}: من ${t.from || '?'} إلى **${t.to || '?'}** (${t.type || 'انتقال'})`)
        }
      }
      if (newsResults.length > 0) {
        lines.push(`\n### 📰 أحدث الأخبار`)
        for (const n of newsResults.slice(0, 3)) {
          lines.push(`• **${n.title}** — [${n.source}](${n.link})`)
        }
      }
      if (!pid && !trn && !newsResults.length) {
        lines.push(`⚠️ لم يُعثر على بيانات لـ "${playerName}". حاول كتابة الاسم كاملاً.`)
      }
      lines.push(`\n⚠️ **قاعدة:** اعرض فقط ما وجدته في البيانات أعلاه. لا تخترع قيماً.`)

      return {
        found: !!(pid || trn || newsResults.length),
        type: 'TRANSFER_NEWS',
        playerName,
        context: lines.join('\n'),
        sources: ['Transfermarkt', '365score', 'Koora'],
        fetchedAt,
      }
    }
  }

  // ── ③ معلومات لاعب ──────────────────────────────────────────────────────
  if (classification.type === 'PLAYER_INFO') {
    const playerMatch = query.match(
      /(?:لاعب|player|إصابة|فريق)\s+([\u0600-\u06FF\s]{3,30})/i
    ) || query.match(/([\u0600-\u06FF]{3,}\s+[\u0600-\u06FF]{3,})/)

    const playerName = playerMatch?.[1]?.trim() || ''
    if (playerName) {
      const [identity, news] = await Promise.allSettled([
        getPlayerIdentity(playerName),
        fetchSportsNewsRSS(playerName, ''),
      ])
      const pid = identity.status === 'fulfilled' && !isUnavailable(identity.value) ? identity.value : null
      const newsResults = news.status === 'fulfilled' ? news.value : []

      const lines = [`━━━ ⚽ معلومات اللاعب: **${playerName}** ━━━\n`]
      if (pid) {
        const flag = getTeamFlag(pid.nationality || '')
        lines.push(`👤 **${pid.name}** ${flag}`)
        if (pid.nationality) lines.push(`🌍 الجنسية: ${pid.nationality}`)
        if (pid.club) lines.push(`🏟️ النادي الحالي: ${pid.club}`)
        if (pid.position) lines.push(`🎽 المركز: ${pid.position}`)
        if (pid.dob) lines.push(`📅 تاريخ الميلاد: ${pid.dob}`)
        if (pid.summary) lines.push(`\n📖 ${pid.summary.slice(0, 400)}...`)
        if (pid.wikiUrl) lines.push(`🔗 [ويكيبيديا](${pid.wikiUrl})`)
      }
      if (newsResults.length > 0) {
        lines.push(`\n### 📰 أحدث الأخبار`)
        for (const n of newsResults.slice(0, 4)) {
          lines.push(`• **${n.title}** — [${n.source}](${n.link})`)
        }
      }
      if (!pid && !newsResults.length) {
        lines.push(`⚠️ لم يُعثر على بيانات كافية لـ "${playerName}" من المصادر الحية.`)
      }
      lines.push(`\n⚠️ **قاعدة:** اعرض فقط البيانات الموثّقة أعلاه. لا تُكمل من ذاكرة النموذج.`)

      return {
        found: !!(pid || newsResults.length),
        type: 'PLAYER_INFO',
        playerName,
        context: lines.join('\n'),
        sources: ['365score', 'Koora', 'Wikidata', 'Wikipedia AR'],
        fetchedAt,
      }
    }
  }

  // ── ④ أخبار رياضية عامة ───────────────────────────────────────────────
  const newsResults = await fetchSportsNewsRSS('', '').catch(() => [])
  const lines = [`━━━ 📰 آخر الأخبار الرياضية ━━━\n`]
  if (newsResults.length > 0) {
    for (const n of newsResults.slice(0, 6)) {
      lines.push(`• **${n.title}** — [${n.source}](${n.link})${n.date ? ` | ${n.date}` : ''}`)
    }
  } else {
    lines.push(`⚠️ تعذّر جلب الأخبار الرياضية من المصادر الخارجية حالياً.`)
  }
  lines.push(`\n⚠️ **قاعدة:** اعرض الأخبار الموثّقة فقط. لا تضيف تحليلات من ذاكرة النموذج.`)

  return {
    found: newsResults.length > 0,
    type: 'SPORTS_NEWS',
    context: lines.join('\n'),
    sources: ['CAF', 'FIFA', 'الهداف'],
    fetchedAt,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// § 10 — رسالة "لا يوجد بيانات" مع أخبار بديلة
// ══════════════════════════════════════════════════════════════════════════════

function buildNoMatchContext(team1 = '', team2 = '', newsItems = []) {
  const flag1 = getTeamFlag(team1)
  const flag2 = getTeamFlag(team2)
  const lines = [
    `━━━ ⚽ بحث عن مباراة: ${flag1} **${team1}** ضد ${flag2} **${team2}** ━━━\n`,
    `> ⚠️ لم يُعثر على هذه المباراة في قواعد بيانات **365score** أو **FotMob** أو **SofaScore**`,
    `> في النطاق الزمني: الـ 60 يوماً الماضية + الـ 90 يوماً القادمة.\n`,
  ]

  if (newsItems.length > 0) {
    lines.push(`### 📰 أخبار ذات صلة بـ "${team1}" و"${team2}"`)
    for (const n of newsItems.slice(0, 4)) {
      lines.push(`• **${n.title}** — [${n.source}](${n.link})`)
    }
    lines.push('')
  }

  lines.push(`### 🔍 روابط مرجعية للتحقق اليدوي`)
  const t1En = TEAM_AR_TO_EN[team1] || team1
  const t2En = TEAM_AR_TO_EN[team2] || team2
  lines.push(`• [365score — البحث عن المباراة](https://www.365scores.com/ar/football/search?q=${encodeURIComponent(team1)})`)
  lines.push(`• [FotMob — ${team1}](https://www.fotmob.com/search?term=${encodeURIComponent(t1En)})`)
  lines.push(`• [Koora](https://www.kooora.com/?search=${encodeURIComponent(team1)})`)
  lines.push(`• [CAF Online](https://www.cafonline.com/)`)
  lines.push('')
  lines.push(`⚠️ **قاعدة صارمة:** لا تذكر نتيجة أو تاريخ من ذاكرتك — البيانات الحية فقط مُعتمَدة.`)

  return lines.join('\n')
}

// ══════════════════════════════════════════════════════════════════════════════
// § 11 — تحديد ما إذا كان الاستعلام رياضياً
// ══════════════════════════════════════════════════════════════════════════════

const SPORTS_KEYWORDS = new Set([
  'مباراة','مباريات','ماتش','ماتشات','نتيجة','نتائج','رزنامة','برنامج',
  'هدف','أهداف','لاعب','مدرب','فريق','نادي','دوري','بطولة','كأس',
  'تصفيات','انتقال','صفقة','تشكيلة','ملعب','مباشر','live','score',
  'fixture','match','player','transfer','football','soccer','رياضة',
  'ضد','vs','كووورة','كرة','koora','fotmob','sofascore',
  'الخضر','الفنك','منتخب','أمم أفريقيا','كان','مونديال','يورو',
  'تشامبيونز','ليغ','لاليغا','بريميرليغ','بوندسليغا','سيريا',
])

export function isSportsAgentQuery(query = '') {
  const tokens = query.toLowerCase().split(/[\s,،.!؟?]+/)
  if (tokens.some(t => SPORTS_KEYWORDS.has(t))) return true

  // نمط "X ضد Y" أو "X vs Y"
  if (/[\u0600-\u06FF\w]{2,}\s+(?:ضد|vs\.?)\s+[\u0600-\u06FF\w]{2,}/i.test(query)) return true

  // اسمان وطنيان بجوار بعض
  const teams = Object.keys(TEAM_AR_TO_EN)
  let count = 0
  for (const t of teams) {
    if (query.includes(t)) { count++; if (count >= 2) return true }
  }

  return false
}
