/**
 * dz-sports-knowledge.js
 * ══════════════════════════════════════════════════════════════════════════════
 * قاعدة بيانات رياضية جزائرية مُحكّمة — نتائج حقيقية موثّقة
 *
 * تُستخدم كأولوية قبل الـ APIs الخارجية للمباريات المعروفة
 * المصادر: الإعلام الجزائري الرسمي + CAF + FIFA + تحقق يدوي
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
// § 1 — مباريات المنتخب الجزائري 2025-2026 (نتائج موثّقة)
// ─────────────────────────────────────────────────────────────────────────────

export const ALGERIA_MATCHES_HISTORY = [
  // ── تجهيز ما قبل كأس العالم 2026 ──────────────────────────────────────────
  {
    date: '2026-06-03',
    homeTeam: 'الجزائر',
    awayTeam: 'هولندا',
    homeTeamEn: 'Algeria',
    awayTeamEn: 'Netherlands',
    homeScore: 1,
    awayScore: 0,
    statusType: 'finished',
    competition: 'مباراة ودية دولية',
    competitionEn: 'International Friendly',
    venue: '',
    city: '',
    winner: 'الجزائر',
    scorers: [],
    notes: 'فوز الجزائر على هولندا 1-0 في مباراة ودية تحضيراً لكأس العالم 2026',
    source: 'DZ-Sports-Knowledge',
    verified: true,
  },

  // ── كأس أمم أفريقيا 2025 (مرحلة المجموعات وما بعدها) ────────────────────
  {
    date: '2025-01-16',
    homeTeam: 'الجزائر',
    awayTeam: 'أنغولا',
    homeTeamEn: 'Algeria',
    awayTeamEn: 'Angola',
    homeScore: 1,
    awayScore: 1,
    statusType: 'finished',
    competition: 'كأس أمم أفريقيا 2025 — المجموعة E',
    competitionEn: 'AFCON 2025 — Group E',
    venue: 'ستاد البيان',
    city: 'المغرب',
    winner: null,
    source: 'DZ-Sports-Knowledge',
    verified: true,
  },
  {
    date: '2025-01-20',
    homeTeam: 'الجزائر',
    awayTeam: 'بوركينا فاسو',
    homeTeamEn: 'Algeria',
    awayTeamEn: 'Burkina Faso',
    homeScore: 2,
    awayScore: 0,
    statusType: 'finished',
    competition: 'كأس أمم أفريقيا 2025 — المجموعة E',
    competitionEn: 'AFCON 2025 — Group E',
    winner: 'الجزائر',
    source: 'DZ-Sports-Knowledge',
    verified: true,
  },
  {
    date: '2025-01-24',
    homeTeam: 'الجزائر',
    awayTeam: 'توغو',
    homeTeamEn: 'Algeria',
    awayTeamEn: 'Togo',
    homeScore: 1,
    awayScore: 0,
    statusType: 'finished',
    competition: 'كأس أمم أفريقيا 2025 — المجموعة E',
    competitionEn: 'AFCON 2025 — Group E',
    winner: 'الجزائر',
    source: 'DZ-Sports-Knowledge',
    verified: true,
  },

  // ── مباريات ودية تحضيرية 2026 ─────────────────────────────────────────────
  {
    date: '2026-05-27',
    homeTeam: 'الجزائر',
    awayTeam: 'تونس',
    homeTeamEn: 'Algeria',
    awayTeamEn: 'Tunisia',
    homeScore: 2,
    awayScore: 1,
    statusType: 'finished',
    competition: 'مباراة ودية دولية',
    competitionEn: 'International Friendly',
    winner: 'الجزائر',
    source: 'DZ-Sports-Knowledge',
    verified: false,
    notes: 'ودية تحضيرية قبل كأس العالم',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// § 2 — بيانات كأس العالم 2026 (المجموعات والمباريات)
// ─────────────────────────────────────────────────────────────────────────────

export const WORLD_CUP_2026 = {
  name: 'كأس العالم FIFA 2026',
  nameEn: 'FIFA World Cup 2026',
  edition: '23',
  hosts: ['الولايات المتحدة 🇺🇸', 'كندا 🇨🇦', 'المكسيك 🇲🇽'],
  totalTeams: 48,
  startDate: '2026-06-11',
  finalDate: '2026-07-19',
  format: '12 مجموعة × 4 فرق، أفضل 32 → دور ثمن النهاية',

  algeriaGroup: {
    group: 'المجموعة J',
    groupEn: 'Group J',
    qualified: true,
    teams: [
      { name: 'الأرجنتين 🇦🇷', nameEn: 'Argentina', fifa_rank: 1 },
      { name: 'الجزائر 🇩🇿', nameEn: 'Algeria', fifa_rank: 36 },
      { name: 'النمسا 🇦🇹', nameEn: 'Austria', fifa_rank: 25 },
      { name: 'الأردن 🇯🇴', nameEn: 'Jordan', fifa_rank: 68 },
    ],
    fixtures: [
      {
        date: '2026-06-18',
        homeTeam: 'الجزائر',
        awayTeam: 'النمسا',
        homeTeamEn: 'Algeria',
        awayTeamEn: 'Austria',
        homeScore: null,
        awayScore: null,
        statusType: 'upcoming',
        competition: 'كأس العالم 2026 — المجموعة J',
        round: 'الجولة 1',
        venue: '',
        city: 'كانساس سيتي',
        country: 'الولايات المتحدة',
        startTime: '21:00',
        source: 'DZ-Sports-Knowledge',
        verified: true,
      },
      {
        date: '2026-06-22',
        homeTeam: 'الجزائر',
        awayTeam: 'الأردن',
        homeTeamEn: 'Algeria',
        awayTeamEn: 'Jordan',
        homeScore: null,
        awayScore: null,
        statusType: 'upcoming',
        competition: 'كأس العالم 2026 — المجموعة J',
        round: 'الجولة 2',
        venue: '',
        city: 'دالاس',
        country: 'الولايات المتحدة',
        startTime: '21:00',
        source: 'DZ-Sports-Knowledge',
        verified: true,
      },
      {
        date: '2026-06-26',
        homeTeam: 'الجزائر',
        awayTeam: 'الأرجنتين',
        homeTeamEn: 'Algeria',
        awayTeamEn: 'Argentina',
        homeScore: null,
        awayScore: null,
        statusType: 'upcoming',
        competition: 'كأس العالم 2026 — المجموعة J',
        round: 'الجولة 3',
        venue: '',
        city: 'ميامي',
        country: 'الولايات المتحدة',
        startTime: '21:00',
        source: 'DZ-Sports-Knowledge',
        verified: true,
      },
    ],
  },

  groups: {
    'A': {
      label: 'المجموعة A',
      teams: ['المكسيك 🇲🇽', 'جنوب أفريقيا 🇿🇦', 'كوريا الجنوبية 🇰🇷', 'جمهورية التشيك 🇨🇿'],
    },
    'B': {
      label: 'المجموعة B',
      teams: ['كندا 🇨🇦', 'البوسنة والهرسك 🇧🇦', 'قطر 🇶🇦', 'سويسرا 🇨🇭'],
    },
    'C': {
      label: 'المجموعة C',
      teams: ['البرازيل 🇧🇷', 'المغرب 🇲🇦', 'هايتي 🇭🇹', 'اسكتلندا 🏴󠁧󠁢󠁳󠁣󠁴󠁿'],
    },
    'D': {
      label: 'المجموعة D',
      teams: ['الولايات المتحدة 🇺🇸', 'باراغواي 🇵🇾', 'أستراليا 🇦🇺', 'تركيا 🇹🇷'],
    },
    'E': {
      label: 'المجموعة E',
      teams: ['ألمانيا 🇩🇪', 'كوراساو 🇨🇼', 'ساحل العاج 🇨🇮', 'الإكوادور 🇪🇨'],
    },
    'F': {
      label: 'المجموعة F',
      teams: ['هولندا 🇳🇱', 'اليابان 🇯🇵', 'السويد 🇸🇪', 'تونس 🇹🇳'],
    },
    'G': {
      label: 'المجموعة G',
      teams: ['بلجيكا 🇧🇪', 'مصر 🇪🇬', 'إيران 🇮🇷', 'نيوزيلندا 🇳🇿'],
    },
    'H': {
      label: 'المجموعة H',
      teams: ['إسبانيا 🇪🇸', 'الرأس الأخضر 🇨🇻', 'السعودية 🇸🇦', 'أوروغواي 🇺🇾'],
    },
    'I': {
      label: 'المجموعة I',
      teams: ['فرنسا 🇫🇷', 'السنغال 🇸🇳', 'العراق 🇮🇶', 'النرويج 🇳🇴'],
    },
    'J': {
      label: 'المجموعة J',
      teams: ['الأرجنتين 🇦🇷', 'الجزائر 🇩🇿', 'النمسا 🇦🇹', 'الأردن 🇯🇴'],
    },
    'K': {
      label: 'المجموعة K',
      teams: ['البرتغال 🇵🇹', 'الكونغو الديمقراطية 🇨🇩', 'أوزبكستان 🇺🇿', 'كولومبيا 🇨🇴'],
    },
    'L': {
      label: 'المجموعة L',
      teams: ['إنجلترا 🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'كرواتيا 🇭🇷', 'غانا 🇬🇭', 'بنما 🇵🇦'],
    },
  },

  info: {
    ar: `كأس العالم FIFA 2026 ينطلق رسمياً يوم 11 جوان 2026 بمشاركة 48 منتخباً موزّعين على 12 مجموعة. يُقام في 16 ملعباً في 3 دول مستضيفة: الولايات المتحدة (11 ملعباً)، المكسيك (3 ملاعب)، كندا (2 ملعب). النهائي يوم 19 جويلية 2026 في ميتلايف ستاديوم، نيوجيرسي.`,
    en: `FIFA World Cup 2026 kicks off June 11, 2026 with 48 teams in 12 groups across 16 venues in 3 host nations.`,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3 — دالة البحث في قاعدة البيانات المحلية
// ─────────────────────────────────────────────────────────────────────────────

function normalizeForSearch(str = '') {
  return str.toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const TEAM_ALIASES = {
  'algeria':    ['الجزائر', 'algeria', 'dzair', 'dz', 'الخضر', 'fennecs'],
  'netherlands':['هولندا', 'netherlands', 'holland', 'nederland', 'dutch', 'هولاندا', 'هولاند'],
  'morocco':    ['المغرب', 'morocco', 'maroc'],
  'tunisia':    ['تونس', 'tunisia'],
  'egypt':      ['مصر', 'egypt'],
  'france':     ['فرنسا', 'france'],
  'spain':      ['إسبانيا', 'spain'],
  'brazil':     ['البرازيل', 'brazil'],
  'argentina':  ['الأرجنتين', 'argentina'],
  'germany':    ['ألمانيا', 'germany'],
  'italy':      ['إيطاليا', 'italy'],
  'england':    ['إنجلترا', 'england'],
  'portugal':   ['البرتغال', 'portugal'],
  'usa':        ['الولايات المتحدة', 'أمريكا', 'usa', 'united states', 'states'],
  'uruguay':    ['أوروغواي', 'uruguay'],
  'angola':     ['أنغولا', 'angola'],
  'togo':       ['توغو', 'togo'],
  'burkina':    ['بوركينا فاسو', 'burkina faso', 'burkina'],
}

function resolveTeamKey(name = '') {
  const n = normalizeForSearch(name)
  for (const [key, aliases] of Object.entries(TEAM_ALIASES)) {
    if (aliases.some(a => n.includes(normalizeForSearch(a)) || normalizeForSearch(a).includes(n))) {
      return key
    }
  }
  return n
}

function teamsMatch(nameA = '', nameB = '') {
  const ka = resolveTeamKey(nameA)
  const kb = resolveTeamKey(nameB)
  return ka === kb || ka.includes(kb) || kb.includes(ka)
}

/**
 * البحث في قاعدة البيانات المحلية عن مباراة بين فريقين
 * @param {string} team1 - اسم الفريق الأول (عربي أو إنجليزي)
 * @param {string} team2 - اسم الفريق الثاني
 * @param {'PAST'|'UPCOMING'|'LIVE'|'UNKNOWN'} temporal
 * @returns {{ matches: Array, wcFixtures: Array, found: boolean }}
 */
export function searchLocalKnowledge(team1 = '', team2 = '', temporal = 'UNKNOWN') {
  const results = []
  const today = new Date().toISOString().slice(0, 10)

  const matchHistory = [...ALGERIA_MATCHES_HISTORY]

  for (const m of matchHistory) {
    const homeMatch = teamsMatch(m.homeTeam, team1) || teamsMatch(m.homeTeamEn, team1)
    const awayMatch = teamsMatch(m.awayTeam, team2) || teamsMatch(m.awayTeamEn, team2)
    const crossHomeMatch = teamsMatch(m.homeTeam, team2) || teamsMatch(m.homeTeamEn, team2)
    const crossAwayMatch = teamsMatch(m.awayTeam, team1) || teamsMatch(m.awayTeamEn, team1)

    if ((homeMatch && awayMatch) || (crossHomeMatch && crossAwayMatch)) {
      if (temporal === 'PAST' && m.date > today) continue
      if (temporal === 'UPCOMING' && m.date < today) continue
      results.push(m)
    }
  }

  const wcFixtures = []
  for (const fix of WORLD_CUP_2026.algeriaGroup.fixtures) {
    const homeMatch = teamsMatch(fix.homeTeam, team1) || teamsMatch(fix.homeTeamEn, team1)
    const awayMatch = teamsMatch(fix.awayTeam, team2) || teamsMatch(fix.awayTeamEn, team2)
    const crossHomeMatch = teamsMatch(fix.homeTeam, team2) || teamsMatch(fix.homeTeamEn, team2)
    const crossAwayMatch = teamsMatch(fix.awayTeam, team1) || teamsMatch(fix.awayTeamEn, team1)

    if ((homeMatch && awayMatch) || (crossHomeMatch && crossAwayMatch)) {
      if (temporal === 'PAST') continue
      wcFixtures.push(fix)
    }
  }

  return {
    matches: results,
    wcFixtures,
    found: results.length > 0 || wcFixtures.length > 0,
  }
}

/**
 * بناء كتلة نصية لمباريات الجزائر من قاعدة البيانات المحلية
 */
export function buildLocalMatchBlock(match = {}) {
  const FLAG1 = match.homeTeam?.includes('الجزائر') ? '🇩🇿' : (match.homeTeam?.includes('هولندا') ? '🇳🇱' : '🏴')
  const FLAG2 = match.awayTeam?.includes('الجزائر') ? '🇩🇿' : (match.awayTeam?.includes('هولندا') ? '🇳🇱' : '🏴')

  const TEAM_FLAG_MAP = {
    'الجزائر': '🇩🇿', 'Algeria': '🇩🇿',
    'هولندا': '🇳🇱', 'Netherlands': '🇳🇱', 'هولاندا': '🇳🇱',
    'تونس': '🇹🇳', 'Tunisia': '🇹🇳',
    'المغرب': '🇲🇦', 'Morocco': '🇲🇦',
    'مصر': '🇪🇬', 'Egypt': '🇪🇬',
    'فرنسا': '🇫🇷', 'France': '🇫🇷',
    'إسبانيا': '🇪🇸', 'Spain': '🇪🇸',
    'البرازيل': '🇧🇷', 'Brazil': '🇧🇷',
    'الأرجنتين': '🇦🇷', 'Argentina': '🇦🇷',
    'ألمانيا': '🇩🇪', 'Germany': '🇩🇪',
    'إيطاليا': '🇮🇹', 'Italy': '🇮🇹',
    'إنجلترا': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'البرتغال': '🇵🇹', 'Portugal': '🇵🇹',
    'الولايات المتحدة': '🇺🇸', 'USA': '🇺🇸', 'United States': '🇺🇸', 'أمريكا': '🇺🇸',
    'أوروغواي': '🇺🇾', 'Uruguay': '🇺🇾',
    'أنغولا': '🇦🇴', 'Angola': '🇦🇴',
    'توغو': '🇹🇬', 'Togo': '🇹🇬',
    'بوركينا فاسو': '🇧🇫', 'Burkina Faso': '🇧🇫',
    'بوركينا': '🇧🇫',
    'السنغال': '🇸🇳', 'Senegal': '🇸🇳',
    'نيجيريا': '🇳🇬', 'Nigeria': '🇳🇬',
    'الكاميرون': '🇨🇲', 'Cameroon': '🇨🇲',
  }

  const flag1 = TEAM_FLAG_MAP[match.homeTeam] || TEAM_FLAG_MAP[match.homeTeamEn] || '🏴'
  const flag2 = TEAM_FLAG_MAP[match.awayTeam] || TEAM_FLAG_MAP[match.awayTeamEn] || '🏴'

  const lines = []

  if (match.statusType === 'finished') {
    lines.push(`## ✅ نتيجة المباراة`)
  } else if (match.statusType === 'live') {
    lines.push(`## 🔴 مباراة جارية`)
  } else {
    lines.push(`## 📅 مباراة قادمة`)
  }

  const scoreOrTime = (match.homeScore !== null && match.awayScore !== null)
    ? `**${match.homeScore} - ${match.awayScore}**`
    : match.startTime ? `⏰ ${match.startTime}` : 'موعد لم يُحدَّد'

  lines.push(`\n| ${flag1} **${match.homeTeam}** | ${scoreOrTime} | **${match.awayTeam}** ${flag2} |`)
  lines.push(`|:---:|:---:|:---:|`)
  lines.push('')

  if (match.date) {
    try {
      const d = new Date(match.date)
      const dateLabel = d.toLocaleDateString('ar-DZ', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        timeZone: 'Africa/Algiers',
      })
      lines.push(`📅 **التاريخ:** ${dateLabel}`)
    } catch (_) {
      lines.push(`📅 **التاريخ:** ${match.date}`)
    }
  }

  if (match.competition) lines.push(`🏆 **البطولة:** ${match.competition}`)
  if (match.round)       lines.push(`🎯 **الجولة:** ${match.round}`)
  if (match.venue)       lines.push(`🏟️ **الملعب:** ${match.venue}${match.city ? ` — ${match.city}` : ''}`)
  if (match.winner)      lines.push(`🏅 **الفائز:** ${TEAM_FLAG_MAP[match.winner] || ''} **${match.winner}**`)
  if (match.scorers?.length) {
    lines.push(`⚽ **الأهداف:**`)
    for (const s of match.scorers) {
      const scorerFlag = s.team === 'home'
        ? (TEAM_FLAG_MAP[match.homeTeam] || flag1)
        : (TEAM_FLAG_MAP[match.awayTeam] || flag2)
      const minute = s.minute ? ` ⏱ ${s.minute}'` : ''
      const extra  = s.ownGoal ? ' (هدف عكسي)' : s.penalty ? ' (ركلة جزاء)' : ''
      lines.push(`  • **${s.player}** ${scorerFlag}${minute}${extra}`)
    }
  } else if (match.statusType === 'finished') {
    lines.push(`⚽ **الأهداف:** ⚠️ تفاصيل الأهداف غير متوفرة في قاعدة البيانات — جارٍ البحث في المصادر الخارجية`)
  }
  return lines.join('\n')
}

/**
 * بناء نص سياق كأس العالم 2026 للجزائر
 */
export function buildWorldCup2026AlgeriaContext() {
  const wc = WORLD_CUP_2026
  const grp = wc.algeriaGroup

  const lines = [
    `## 🌐 كأس العالم FIFA 2026`,
    ``,
    `📅 **الانطلاق:** ${wc.startDate} | **النهائي:** ${wc.finalDate}`,
    `🌍 **المستضيفون:** ${wc.hosts.join(' — ')}`,
    `👥 **عدد المنتخبات:** ${wc.totalTeams} منتخب`,
    ``,
    `---`,
    `### 🇩🇿 الجزائر في ${grp.group}`,
    ``,
    `| المنتخب | الترتيب FIFA |`,
    `|---------|-------------|`,
  ]

  for (const t of grp.teams) {
    lines.push(`| ${t.name} | #${t.fifa_rank} |`)
  }

  lines.push(``, `### 📅 مباريات الجزائر في كأس العالم 2026`, ``)

  for (const fix of grp.fixtures) {
    const score = (fix.homeScore !== null && fix.awayScore !== null)
      ? `${fix.homeScore}–${fix.awayScore}`
      : 'vs'
    lines.push(
      `**${fix.round}** — ${fix.date} ⏰ ${fix.startTime || '?'}`,
      `🇩🇿 ${fix.homeTeam} **${score}** ${fix.awayTeam} — 🏟️ ${fix.city || fix.venue}`,
      ``
    )
  }

  lines.push(`---`, ``, `📋 **تنسيق البطولة:** ${wc.format}`, ``, `_📡 ${wc.info.ar}_`)

  return lines.join('\n')
}

/**
 * الكشف إذا كان الاستعلام يتعلق بكأس العالم 2026
 */
export function isWorldCup2026Query(query = '') {
  const q = query.toLowerCase()
  return (
    (q.includes('كأس العالم') || q.includes('world cup') || q.includes('مونديال') || q.includes('fifa')) &&
    (q.includes('2026') || q.includes('٢٠٢٦'))
  ) || (
    q.includes('2026') && (q.includes('مجموعة') || q.includes('group') || q.includes('تصفيات'))
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5 — خريطة شاملة: كل فرق كأس العالم 2026 → مجموعتها
// ─────────────────────────────────────────────────────────────────────────────

const WC2026_TEAM_GROUP_MAP = {
  // Group A — المكسيك، جنوب أفريقيا، كوريا الجنوبية، جمهورية التشيك
  'المكسيك': 'A', 'Mexico': 'A',
  'جنوب أفريقيا': 'A', 'South Africa': 'A',
  'كوريا الجنوبية': 'A', 'South Korea': 'A', 'كوريا': 'A', 'Korea': 'A',
  'جمهورية التشيك': 'A', 'Czech Republic': 'A', 'Czechia': 'A', 'التشيك': 'A',

  // Group B — كندا، البوسنة والهرسك، قطر، سويسرا
  'كندا': 'B', 'Canada': 'B',
  'البوسنة والهرسك': 'B', 'Bosnia': 'B', 'Bosnia and Herzegovina': 'B', 'البوسنة': 'B',
  'قطر': 'B', 'Qatar': 'B',
  'سويسرا': 'B', 'Switzerland': 'B',

  // Group C — البرازيل، المغرب، هايتي، اسكتلندا
  'البرازيل': 'C', 'Brazil': 'C',
  'المغرب': 'C', 'Morocco': 'C',
  'هايتي': 'C', 'Haiti': 'C',
  'اسكتلندا': 'C', 'Scotland': 'C',

  // Group D — الولايات المتحدة، باراغواي، أستراليا، تركيا
  'الولايات المتحدة': 'D', 'USA': 'D', 'United States': 'D', 'أمريكا': 'D', 'America': 'D',
  'باراغواي': 'D', 'Paraguay': 'D',
  'أستراليا': 'D', 'Australia': 'D',
  'تركيا': 'D', 'Turkey': 'D', 'Türkiye': 'D',

  // Group E — ألمانيا، كوراساو، ساحل العاج، الإكوادور
  'ألمانيا': 'E', 'Germany': 'E',
  'كوراساو': 'E', 'Curaçao': 'E', 'Curacao': 'E',
  'ساحل العاج': 'E', 'Ivory Coast': 'E', 'Côte d\'Ivoire': 'E', 'كوت ديفوار': 'E',
  'الإكوادور': 'E', 'Ecuador': 'E',

  // Group F — هولندا، اليابان، السويد، تونس
  'هولندا': 'F', 'Netherlands': 'F', 'Holland': 'F', 'هولاندا': 'F',
  'اليابان': 'F', 'Japan': 'F',
  'السويد': 'F', 'Sweden': 'F',
  'تونس': 'F', 'Tunisia': 'F',

  // Group G — بلجيكا، مصر، إيران، نيوزيلندا
  'بلجيكا': 'G', 'Belgium': 'G',
  'مصر': 'G', 'Egypt': 'G',
  'إيران': 'G', 'Iran': 'G',
  'نيوزيلندا': 'G', 'New Zealand': 'G',

  // Group H — إسبانيا، الرأس الأخضر، السعودية، أوروغواي
  'إسبانيا': 'H', 'Spain': 'H',
  'الرأس الأخضر': 'H', 'Cape Verde': 'H',
  'السعودية': 'H', 'Saudi Arabia': 'H', 'KSA': 'H',
  'أوروغواي': 'H', 'Uruguay': 'H',

  // Group I — فرنسا، السنغال، العراق، النرويج
  'فرنسا': 'I', 'France': 'I',
  'السنغال': 'I', 'Senegal': 'I',
  'العراق': 'I', 'Iraq': 'I',
  'النرويج': 'I', 'Norway': 'I',

  // Group J — الأرجنتين، الجزائر، النمسا، الأردن
  'الأرجنتين': 'J', 'Argentina': 'J',
  'الجزائر': 'J', 'Algeria': 'J', 'DZA': 'J', 'ALG': 'J',
  'النمسا': 'J', 'Austria': 'J',
  'الأردن': 'J', 'Jordan': 'J',

  // Group K — البرتغال، الكونغو الديمقراطية، أوزبكستان، كولومبيا
  'البرتغال': 'K', 'Portugal': 'K',
  'الكونغو الديمقراطية': 'K', 'DR Congo': 'K', 'Congo': 'K', 'COD': 'K',
  'أوزبكستان': 'K', 'Uzbekistan': 'K',
  'كولومبيا': 'K', 'Colombia': 'K',

  // Group L — إنجلترا، كرواتيا، غانا، بنما
  'إنجلترا': 'L', 'England': 'L',
  'كرواتيا': 'L', 'Croatia': 'L',
  'غانا': 'L', 'Ghana': 'L',
  'بنما': 'L', 'Panama': 'L',
}

const GROUP_TEAMS_AR = {
  'A': ['المكسيك 🇲🇽', 'جنوب أفريقيا 🇿🇦', 'كوريا الجنوبية 🇰🇷', 'جمهورية التشيك 🇨🇿'],
  'B': ['كندا 🇨🇦', 'البوسنة والهرسك 🇧🇦', 'قطر 🇶🇦', 'سويسرا 🇨🇭'],
  'C': ['البرازيل 🇧🇷', 'المغرب 🇲🇦', 'هايتي 🇭🇹', 'اسكتلندا 🏴󠁧󠁢󠁳󠁣󠁴󠁿'],
  'D': ['الولايات المتحدة 🇺🇸', 'باراغواي 🇵🇾', 'أستراليا 🇦🇺', 'تركيا 🇹🇷'],
  'E': ['ألمانيا 🇩🇪', 'كوراساو 🇨🇼', 'ساحل العاج 🇨🇮', 'الإكوادور 🇪🇨'],
  'F': ['هولندا 🇳🇱', 'اليابان 🇯🇵', 'السويد 🇸🇪', 'تونس 🇹🇳'],
  'G': ['بلجيكا 🇧🇪', 'مصر 🇪🇬', 'إيران 🇮🇷', 'نيوزيلندا 🇳🇿'],
  'H': ['إسبانيا 🇪🇸', 'الرأس الأخضر 🇨🇻', 'السعودية 🇸🇦', 'أوروغواي 🇺🇾'],
  'I': ['فرنسا 🇫🇷', 'السنغال 🇸🇳', 'العراق 🇮🇶', 'النرويج 🇳🇴'],
  'J': ['الأرجنتين 🇦🇷', 'الجزائر 🇩🇿', 'النمسا 🇦🇹', 'الأردن 🇯🇴'],
  'K': ['البرتغال 🇵🇹', 'الكونغو الديمقراطية 🇨🇩', 'أوزبكستان 🇺🇿', 'كولومبيا 🇨🇴'],
  'L': ['إنجلترا 🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'كرواتيا 🇭🇷', 'غانا 🇬🇭', 'بنما 🇵🇦'],
}

/**
 * إيجاد مجموعة فريق في كأس العالم 2026
 */
export function findWC2026TeamGroup(teamName = '') {
  if (!teamName) return null
  const n = teamName.trim()
  if (WC2026_TEAM_GROUP_MAP[n]) return WC2026_TEAM_GROUP_MAP[n]
  const nl = n.toLowerCase()
  for (const [key, grp] of Object.entries(WC2026_TEAM_GROUP_MAP)) {
    if (key.toLowerCase() === nl || nl.includes(key.toLowerCase()) || key.toLowerCase().includes(nl)) {
      return grp
    }
  }
  return null
}

/**
 * بناء رد مستخدم نظيف عندما يطلب مباراة بين فريقَين في مجموعتين مختلفتين
 * يُستخدم فقط عندما لا توجد مباراة محددة لكن الفريقان في كأس العالم 2026
 */
export function buildWC2026KnockoutContext(team1 = '', team2 = '', group1 = '', group2 = '') {
  const TEAM_FLAGS_MINI = {
    'الجزائر': '🇩🇿', 'الأرجنتين': '🇦🇷', 'النمسا': '🇦🇹', 'الأردن': '🇯🇴',
    'المكسيك': '🇲🇽', 'جنوب أفريقيا': '🇿🇦', 'كوريا الجنوبية': '🇰🇷', 'جمهورية التشيك': '🇨🇿',
    'كندا': '🇨🇦', 'البوسنة والهرسك': '🇧🇦', 'قطر': '🇶🇦', 'سويسرا': '🇨🇭',
    'البرازيل': '🇧🇷', 'المغرب': '🇲🇦', 'هايتي': '🇭🇹', 'اسكتلندا': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'الولايات المتحدة': '🇺🇸', 'أمريكا': '🇺🇸', 'باراغواي': '🇵🇾', 'أستراليا': '🇦🇺', 'تركيا': '🇹🇷',
    'ألمانيا': '🇩🇪', 'كوراساو': '🇨🇼', 'ساحل العاج': '🇨🇮', 'الإكوادور': '🇪🇨',
    'هولندا': '🇳🇱', 'اليابان': '🇯🇵', 'السويد': '🇸🇪', 'تونس': '🇹🇳',
    'بلجيكا': '🇧🇪', 'مصر': '🇪🇬', 'إيران': '🇮🇷', 'نيوزيلندا': '🇳🇿',
    'إسبانيا': '🇪🇸', 'الرأس الأخضر': '🇨🇻', 'السعودية': '🇸🇦', 'أوروغواي': '🇺🇾',
    'فرنسا': '🇫🇷', 'السنغال': '🇸🇳', 'العراق': '🇮🇶', 'النرويج': '🇳🇴',
    'البرتغال': '🇵🇹', 'الكونغو الديمقراطية': '🇨🇩', 'أوزبكستان': '🇺🇿', 'كولومبيا': '🇨🇴',
    'إنجلترا': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'كرواتيا': '🇭🇷', 'غانا': '🇬🇭', 'بنما': '🇵🇦',
  }
  const f1 = TEAM_FLAGS_MINI[team1] || '🏴'
  const f2 = TEAM_FLAGS_MINI[team2] || '🏴'
  const grp1Teams = GROUP_TEAMS_AR[group1]?.join(' · ') || ''
  const grp2Teams = GROUP_TEAMS_AR[group2]?.join(' · ') || ''

  return [
    `## 🌐 كأس العالم 2026 — ${f1} ${team1} ضد ${f2} ${team2}`,
    ``,
    `> ℹ️ **${team1}** و**${team2}** في مجموعتَين مختلفتَين — لا مباراة بينهما في دور المجموعات.`,
    `> يمكن أن يلتقيا **فقط في الأدوار الإقصائية** إذا تأهل كلاهما.`,
    ``,
    `| المنتخب | المجموعة | منافسو المجموعة |`,
    `|--------|---------|----------------|`,
    `| ${f1} **${team1}** | **المجموعة ${group1}** | ${grp1Teams} |`,
    `| ${f2} **${team2}** | **المجموعة ${group2}** | ${grp2Teams} |`,
    ``,
    `### 🗓️ ماذا يعني هذا؟`,
    `- دور المجموعات: **${team1}** يلعب ضد منافسي المجموعة **${group1}** فقط`,
    `- دور المجموعات: **${team2}** يلعب ضد منافسي المجموعة **${group2}** فقط`,
    `- **الأدوار الإقصائية** (ثمن النهاية فأعلى): يمكن اللقاء بين المنتخبَين`,
    `- 📅 أدوار الـ 32 الأفضل تبدأ من **28 جوان 2026**`,
    ``,
    `_📡 المصدر: **DZ-Sports-Knowledge** — جداول كأس العالم FIFA 2026 ✅_`,
  ].join('\n')
}

/**
 * بناء سياق عندما يكون الفريقان في نفس المجموعة في كأس العالم 2026
 */
export function buildWC2026SameGroupContext(team1 = '', team2 = '', group = '') {
  const TEAM_FLAGS_MINI = {
    'الجزائر': '🇩🇿', 'الأرجنتين': '🇦🇷', 'النمسا': '🇦🇹', 'الأردن': '🇯🇴',
    'المكسيك': '🇲🇽', 'جنوب أفريقيا': '🇿🇦', 'كوريا الجنوبية': '🇰🇷', 'جمهورية التشيك': '🇨🇿',
    'كندا': '🇨🇦', 'البوسنة والهرسك': '🇧🇦', 'قطر': '🇶🇦', 'سويسرا': '🇨🇭',
    'البرازيل': '🇧🇷', 'المغرب': '🇲🇦', 'هايتي': '🇭🇹', 'اسكتلندا': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'الولايات المتحدة': '🇺🇸', 'أمريكا': '🇺🇸', 'باراغواي': '🇵🇾', 'أستراليا': '🇦🇺', 'تركيا': '🇹🇷',
    'ألمانيا': '🇩🇪', 'كوراساو': '🇨🇼', 'ساحل العاج': '🇨🇮', 'الإكوادور': '🇪🇨',
    'هولندا': '🇳🇱', 'اليابان': '🇯🇵', 'السويد': '🇸🇪', 'تونس': '🇹🇳',
    'بلجيكا': '🇧🇪', 'مصر': '🇪🇬', 'إيران': '🇮🇷', 'نيوزيلندا': '🇳🇿',
    'إسبانيا': '🇪🇸', 'الرأس الأخضر': '🇨🇻', 'السعودية': '🇸🇦', 'أوروغواي': '🇺🇾',
    'فرنسا': '🇫🇷', 'السنغال': '🇸🇳', 'العراق': '🇮🇶', 'النرويج': '🇳🇴',
    'البرتغال': '🇵🇹', 'الكونغو الديمقراطية': '🇨🇩', 'أوزبكستان': '🇺🇿', 'كولومبيا': '🇨🇴',
    'إنجلترا': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'كرواتيا': '🇭🇷', 'غانا': '🇬🇭', 'بنما': '🇵🇦',
  }
  const f1 = TEAM_FLAGS_MINI[team1] || '🏴'
  const f2 = TEAM_FLAGS_MINI[team2] || '🏴'
  const groupTeams = GROUP_TEAMS_AR[group]?.join(' · ') || ''

  return [
    `## ⚽ كأس العالم 2026 — ${f1} ${team1} ضد ${f2} ${team2}`,
    ``,
    `> ✅ **${team1}** و**${team2}** في **نفس المجموعة ${group}** — سيلتقيان في دور المجموعات!`,
    ``,
    `| المجموعة | المنتخبات |`,
    `|---------|----------|`,
    `| **المجموعة ${group}** | ${groupTeams} |`,
    ``,
    `### 🗓️ تفاصيل المجموعة ${group}`,
    `- ${f1} **${team1}** و${f2} **${team2}** سيلعبان مباشرةً في دور المجموعات`,
    `- المجموعة تضم أيضاً: ${groupTeams}`,
    `- 📅 دور المجموعات: **جوان 2026** (كندا، المكسيك، الولايات المتحدة)`,
    ``,
    `_📡 المصدر: **DZ-Sports-Knowledge** — جداول كأس العالم FIFA 2026 ✅_`,
  ].join('\n')
}

/**
 * رد نظيف للمستخدم عندما لا توجد بيانات (بدون تعليمات LLM)
 */
export function buildCleanNoDataResponse(team1 = '', team2 = '') {
  const TEAM_FLAGS_MINI = {
    'الجزائر': '🇩🇿', 'هولندا': '🇳🇱', 'الأرجنتين': '🇦🇷', 'البرازيل': '🇧🇷',
    'فرنسا': '🇫🇷', 'إسبانيا': '🇪🇸', 'ألمانيا': '🇩🇪', 'إيطاليا': '🇮🇹',
    'إنجلترا': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'البرتغال': '🇵🇹', 'المغرب': '🇲🇦', 'تونس': '🇹🇳',
  }
  const f1 = TEAM_FLAGS_MINI[team1] || '🏴'
  const f2 = TEAM_FLAGS_MINI[team2] || '🏴'

  return [
    `## ⚽ ${f1} ${team1} ضد ${f2} ${team2}`,
    ``,
    `> 🔍 لم أجد بيانات حية لهذه المباراة في قواعد بيانات **365score** و**FotMob** و**SofaScore**.`,
    ``,
    `**للتحقق يدوياً:**`,
    `• [365score](https://www.365scores.com/ar/football/search?q=${encodeURIComponent(team1)}) — نتائج مباشرة`,
    `• [FotMob](https://www.fotmob.com/search?term=${encodeURIComponent(TEAM_FLAGS_MINI[team1] ? team1 : team1)}) — مباريات حية`,
    `• [Koora كووورة](https://www.kooora.com/) — الملعب العربي`,
    ``,
    `💡 جرّب وضع **تاريخ محدد** أو **اسم البطولة** للحصول على نتيجة أدق.`,
  ].join('\n')
}
