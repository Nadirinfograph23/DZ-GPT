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

// المصدر: كووورة (kooora.com) — بيانات موثّقة ✅ | آخر تحديث: 11 يونيو 2026
export const ALGERIA_MATCHES_HISTORY = [

  // ── ودية تحضيرية لكأس العالم 2026 ─────────────────────────────────────────
  {
    date: '2026-06-11',
    homeTeam: 'بوليفيا', awayTeam: 'الجزائر',
    homeTeamEn: 'Bolivia', awayTeamEn: 'Algeria',
    homeScore: null, awayScore: null,
    statusType: 'upcoming',
    competition: 'المباريات الودية', competitionEn: 'International Friendly',
    winner: null, source: 'kooora.com', verified: true,
    note: 'آخر مباراة ودية تحضيرية قبل كأس العالم 2026',
    kooraLink: 'https://www.kooora.com/%D9%83%D8%B1%D8%A9-%D8%A7%D9%84%D9%82%D8%AF%D9%85/%D9%85%D8%A8%D8%A7%D8%B1%D8%A7%D8%A9/%D8%A8%D9%88%D9%84%D9%8A%D9%81%D9%8A%D8%A7-vs-%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D9%8A%D8%A6%D8%B1/E74oztbu3zFh-5V-Y9nDa',
  },
  {
    date: '2026-06-03',
    homeTeam: 'هولندا', awayTeam: 'الجزائر',
    homeTeamEn: 'Netherlands', awayTeamEn: 'Algeria',
    homeScore: 0, awayScore: 1,
    statusType: 'finished',
    competition: 'المباريات الودية', competitionEn: 'International Friendly',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },
  {
    date: '2026-03-31',
    homeTeam: 'الجزائر', awayTeam: 'أوروغواي',
    homeTeamEn: 'Algeria', awayTeamEn: 'Uruguay',
    homeScore: 0, awayScore: 0,
    statusType: 'finished',
    competition: 'المباريات الودية', competitionEn: 'International Friendly',
    winner: null, source: 'kooora.com', verified: true,
  },
  {
    date: '2026-03-27',
    homeTeam: 'الجزائر', awayTeam: 'جواتيمالا',
    homeTeamEn: 'Algeria', awayTeamEn: 'Guatemala',
    homeScore: 7, awayScore: 0,
    statusType: 'finished',
    competition: 'المباريات الودية', competitionEn: 'International Friendly',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },

  // ── كأس أمم إفريقيا 2025 (المرحلة النهائية — ديسمبر 2025 / يناير 2026) ───
  {
    date: '2026-01-10',
    homeTeam: 'الجزائر', awayTeam: 'نيجيريا',
    homeTeamEn: 'Algeria', awayTeamEn: 'Nigeria',
    homeScore: 0, awayScore: 2,
    statusType: 'finished',
    competition: 'كأس أمم إفريقيا 2025', competitionEn: 'AFCON 2025',
    winner: 'نيجيريا', source: 'kooora.com', verified: true,
  },
  {
    date: '2026-01-06',
    homeTeam: 'الجزائر', awayTeam: 'الكونغو الديمقراطية',
    homeTeamEn: 'Algeria', awayTeamEn: 'DR Congo',
    homeScore: 1, awayScore: 0,
    statusType: 'finished',
    competition: 'كأس أمم إفريقيا 2025', competitionEn: 'AFCON 2025',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },
  {
    date: '2025-12-31',
    homeTeam: 'غينيا الاستوائية', awayTeam: 'الجزائر',
    homeTeamEn: 'Equatorial Guinea', awayTeamEn: 'Algeria',
    homeScore: 1, awayScore: 3,
    statusType: 'finished',
    competition: 'كأس أمم إفريقيا 2025', competitionEn: 'AFCON 2025',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },
  {
    date: '2025-12-28',
    homeTeam: 'الجزائر', awayTeam: 'بوركينا فاسو',
    homeTeamEn: 'Algeria', awayTeamEn: 'Burkina Faso',
    homeScore: 1, awayScore: 0,
    statusType: 'finished',
    competition: 'كأس أمم إفريقيا 2025', competitionEn: 'AFCON 2025',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },
  {
    date: '2025-12-24',
    homeTeam: 'الجزائر', awayTeam: 'السودان',
    homeTeamEn: 'Algeria', awayTeamEn: 'Sudan',
    homeScore: 3, awayScore: 0,
    statusType: 'finished',
    competition: 'كأس أمم إفريقيا 2025', competitionEn: 'AFCON 2025',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },

  // ── كأس العرب 2025 ────────────────────────────────────────────────────────
  {
    date: '2025-12-12',
    homeTeam: 'الجزائر', awayTeam: 'الإمارات العربية المتحدة',
    homeTeamEn: 'Algeria', awayTeamEn: 'UAE',
    homeScore: 1, awayScore: 1,
    statusType: 'finished',
    competition: 'كأس العرب 2025', competitionEn: 'Arab Cup 2025',
    winner: null, source: 'kooora.com', verified: true,
  },
  {
    date: '2025-12-09',
    homeTeam: 'الجزائر', awayTeam: 'العراق',
    homeTeamEn: 'Algeria', awayTeamEn: 'Iraq',
    homeScore: 2, awayScore: 0,
    statusType: 'finished',
    competition: 'كأس العرب 2025', competitionEn: 'Arab Cup 2025',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },
  {
    date: '2025-12-06',
    homeTeam: 'البحرين', awayTeam: 'الجزائر',
    homeTeamEn: 'Bahrain', awayTeamEn: 'Algeria',
    homeScore: 1, awayScore: 5,
    statusType: 'finished',
    competition: 'كأس العرب 2025', competitionEn: 'Arab Cup 2025',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },
  {
    date: '2025-12-03',
    homeTeam: 'الجزائر', awayTeam: 'السودان',
    homeTeamEn: 'Algeria', awayTeamEn: 'Sudan',
    homeScore: 0, awayScore: 0,
    statusType: 'finished',
    competition: 'كأس العرب 2025', competitionEn: 'Arab Cup 2025',
    winner: null, source: 'kooora.com', verified: true,
  },

  // ── تصفيات كأس العالم 2026 (المجموعة الأفريقية) ─────────────────────────
  {
    date: '2025-10-14',
    homeTeam: 'الجزائر', awayTeam: 'أوغندا',
    homeTeamEn: 'Algeria', awayTeamEn: 'Uganda',
    homeScore: 2, awayScore: 1,
    statusType: 'finished',
    competition: 'تصفيات كأس العالم 2026', competitionEn: 'WC 2026 Qualifiers',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },
  {
    date: '2025-10-09',
    homeTeam: 'الصومال', awayTeam: 'الجزائر',
    homeTeamEn: 'Somalia', awayTeamEn: 'Algeria',
    homeScore: 0, awayScore: 3,
    statusType: 'finished',
    competition: 'تصفيات كأس العالم 2026', competitionEn: 'WC 2026 Qualifiers',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },
  {
    date: '2025-09-08',
    homeTeam: 'غينيا', awayTeam: 'الجزائر',
    homeTeamEn: 'Guinea', awayTeamEn: 'Algeria',
    homeScore: 0, awayScore: 0,
    statusType: 'finished',
    competition: 'تصفيات كأس العالم 2026', competitionEn: 'WC 2026 Qualifiers',
    winner: null, source: 'kooora.com', verified: true,
  },
  {
    date: '2025-09-04',
    homeTeam: 'الجزائر', awayTeam: 'بوتسوانا',
    homeTeamEn: 'Algeria', awayTeamEn: 'Botswana',
    homeScore: 3, awayScore: 1,
    statusType: 'finished',
    competition: 'تصفيات كأس العالم 2026', competitionEn: 'WC 2026 Qualifiers',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },

  // ── أمم إفريقيا للمحليين 2025 ────────────────────────────────────────────
  {
    date: '2025-08-23',
    homeTeam: 'السودان', awayTeam: 'الجزائر',
    homeTeamEn: 'Sudan', awayTeamEn: 'Algeria',
    homeScore: 1, awayScore: 1,
    statusType: 'finished',
    competition: 'أمم إفريقيا للمحليين 2025', competitionEn: 'CHAN 2025',
    winner: null, source: 'kooora.com', verified: true,
  },
  {
    date: '2025-08-18',
    homeTeam: 'الجزائر', awayTeam: 'النيجر',
    homeTeamEn: 'Algeria', awayTeamEn: 'Niger',
    homeScore: 0, awayScore: 0,
    statusType: 'finished',
    competition: 'أمم إفريقيا للمحليين 2025', competitionEn: 'CHAN 2025',
    winner: null, source: 'kooora.com', verified: true,
  },
  {
    date: '2025-08-15',
    homeTeam: 'غينيا', awayTeam: 'الجزائر',
    homeTeamEn: 'Guinea', awayTeamEn: 'Algeria',
    homeScore: 1, awayScore: 1,
    statusType: 'finished',
    competition: 'أمم إفريقيا للمحليين 2025', competitionEn: 'CHAN 2025',
    winner: null, source: 'kooora.com', verified: true,
  },
  {
    date: '2025-08-08',
    homeTeam: 'الجزائر', awayTeam: 'جنوب أفريقيا',
    homeTeamEn: 'Algeria', awayTeamEn: 'South Africa',
    homeScore: 1, awayScore: 1,
    statusType: 'finished',
    competition: 'أمم إفريقيا للمحليين 2025', competitionEn: 'CHAN 2025',
    winner: null, source: 'kooora.com', verified: true,
  },
  {
    date: '2025-08-04',
    homeTeam: 'أوغندا', awayTeam: 'الجزائر',
    homeTeamEn: 'Uganda', awayTeamEn: 'Algeria',
    homeScore: 0, awayScore: 3,
    statusType: 'finished',
    competition: 'أمم إفريقيا للمحليين 2025', competitionEn: 'CHAN 2025',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },

  // ── تصفيات أمم إفريقيا ───────────────────────────────────────────────────
  {
    date: '2025-05-09',
    homeTeam: 'الجزائر', awayTeam: 'جامبيا',
    homeTeamEn: 'Algeria', awayTeamEn: 'Gambia',
    homeScore: 3, awayScore: 0,
    statusType: 'finished',
    competition: 'تصفيات أمم إفريقيا', competitionEn: 'AFCON Qualifiers',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },
  {
    date: '2025-05-03',
    homeTeam: 'جامبيا', awayTeam: 'الجزائر',
    homeTeamEn: 'Gambia', awayTeamEn: 'Algeria',
    homeScore: 0, awayScore: 0,
    statusType: 'finished',
    competition: 'تصفيات أمم إفريقيا', competitionEn: 'AFCON Qualifiers',
    winner: null, source: 'kooora.com', verified: true,
  },
  {
    date: '2025-03-25',
    homeTeam: 'الجزائر', awayTeam: 'موزمبيق',
    homeTeamEn: 'Algeria', awayTeamEn: 'Mozambique',
    homeScore: 5, awayScore: 1,
    statusType: 'finished',
    competition: 'تصفيات كأس العالم 2026', competitionEn: 'WC 2026 Qualifiers',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
  },
  {
    date: '2025-03-21',
    homeTeam: 'بوتسوانا', awayTeam: 'الجزائر',
    homeTeamEn: 'Botswana', awayTeamEn: 'Algeria',
    homeScore: 1, awayScore: 3,
    statusType: 'finished',
    competition: 'تصفيات كأس العالم 2026', competitionEn: 'WC 2026 Qualifiers',
    winner: 'الجزائر', source: 'kooora.com', verified: true,
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
        date: '2026-06-17',
        homeTeam: 'الأرجنتين',
        awayTeam: 'الجزائر',
        homeTeamEn: 'Argentina',
        awayTeamEn: 'Algeria',
        homeScore: null,
        awayScore: null,
        statusType: 'upcoming',
        competition: 'كأس العالم 2026 — المجموعة J',
        round: 'الجولة 1',
        venue: 'MetLife Stadium',
        city: 'East Rutherford، نيوجيرسي',
        country: 'الولايات المتحدة',
        startTime: '02:00',
        source: 'jdwel.com',
        verified: true,
        kooraLink: 'https://www.kooora.com/%D9%83%D8%B1%D8%A9-%D8%A7%D9%84%D9%82%D8%AF%D9%85/%D9%85%D8%A8%D8%A7%D8%B1%D8%A7%D8%A9/%D8%A7%D9%84%D8%A7%D9%94%D8%B1%D8%AC%D9%86%D8%AA%D9%8A%D9%86-vs-%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D9%8A%D9%94%D8%B1/eLLPhVHmYZ6Oa8ybtUDu6',
      },
      {
        date: '2026-06-21',
        homeTeam: 'الجزائر',
        awayTeam: 'النمسا',
        homeTeamEn: 'Algeria',
        awayTeamEn: 'Austria',
        homeScore: null,
        awayScore: null,
        statusType: 'upcoming',
        competition: 'كأس العالم 2026 — المجموعة J',
        round: 'الجولة 2',
        venue: 'Arrowhead Stadium',
        city: 'كانساس سيتي',
        country: 'الولايات المتحدة',
        startTime: '03:00',
        source: 'jdwel.com',
        verified: true,
      },
      {
        date: '2026-06-25',
        homeTeam: 'الأردن',
        awayTeam: 'الجزائر',
        homeTeamEn: 'Jordan',
        awayTeamEn: 'Algeria',
        homeScore: null,
        awayScore: null,
        statusType: 'upcoming',
        competition: 'كأس العالم 2026 — المجموعة J',
        round: 'الجولة 3',
        venue: 'AT&T Stadium',
        city: 'دالاس',
        country: 'الولايات المتحدة',
        startTime: '04:00',
        source: 'jdwel.com',
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
  'uruguay':    ['أوروغواي', 'أوروجواي', 'الأوروغواي', 'الأوروجواي', 'أورغواي', 'الأورغواي', 'أورجواي', 'الأورجواي', 'أرغواي', 'اورغواي', 'اوروغواي', 'uruguay', 'uruguai'],
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
    // أفريقيا وسط
    'الجزائر': '🇩🇿', 'Algeria': '🇩🇿',
    'تونس': '🇹🇳', 'Tunisia': '🇹🇳',
    'المغرب': '🇲🇦', 'Morocco': '🇲🇦',
    'مصر': '🇪🇬', 'Egypt': '🇪🇬',
    'السنغال': '🇸🇳', 'Senegal': '🇸🇳',
    'نيجيريا': '🇳🇬', 'Nigeria': '🇳🇬',
    'الكاميرون': '🇨🇲', 'Cameroon': '🇨🇲',
    'غانا': '🇬🇭', 'Ghana': '🇬🇭',
    'ساحل العاج': '🇨🇮', 'Ivory Coast': '🇨🇮',
    'جنوب أفريقيا': '🇿🇦', 'South Africa': '🇿🇦',
    'أنغولا': '🇦🇴', 'Angola': '🇦🇴',
    'توغو': '🇹🇬', 'Togo': '🇹🇬',
    'بوركينا فاسو': '🇧🇫', 'Burkina Faso': '🇧🇫', 'بوركينا': '🇧🇫',
    'الكونغو الديمقراطية': '🇨🇩', 'DR Congo': '🇨🇩', 'Congo': '🇨🇩',
    'هايتي': '🇭🇹', 'Haiti': '🇭🇹',
    // أوروبا
    'فرنسا': '🇫🇷', 'France': '🇫🇷',
    'إسبانيا': '🇪🇸', 'Spain': '🇪🇸',
    'ألمانيا': '🇩🇪', 'Germany': '🇩🇪',
    'إيطاليا': '🇮🇹', 'Italy': '🇮🇹',
    'إنجلترا': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'البرتغال': '🇵🇹', 'Portugal': '🇵🇹',
    'هولندا': '🇳🇱', 'Netherlands': '🇳🇱', 'هولاندا': '🇳🇱',
    'بلجيكا': '🇧🇪', 'Belgium': '🇧🇪',
    'النمسا': '🇦🇹', 'Austria': '🇦🇹',
    'سويسرا': '🇨🇭', 'Switzerland': '🇨🇭',
    'كرواتيا': '🇭🇷', 'Croatia': '🇭🇷',
    'السويد': '🇸🇪', 'Sweden': '🇸🇪',
    'النرويج': '🇳🇴', 'Norway': '🇳🇴',
    'الدنمارك': '🇩🇰', 'Denmark': '🇩🇰',
    'بولندا': '🇵🇱', 'Poland': '🇵🇱',
    'جمهورية التشيك': '🇨🇿', 'Czech Republic': '🇨🇿', 'التشيك': '🇨🇿',
    'البوسنة والهرسك': '🇧🇦', 'Bosnia': '🇧🇦', 'البوسنة': '🇧🇦',
    'اسكتلندا': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'أوكرانيا': '🇺🇦', 'Ukraine': '🇺🇦',
    'رومانيا': '🇷🇴', 'Romania': '🇷🇴',
    'صربيا': '🇷🇸', 'Serbia': '🇷🇸',
    'كوراساو': '🇨🇼', 'Curacao': '🇨🇼',
    // آسيا والشرق الأوسط
    'الأردن': '🇯🇴', 'Jordan': '🇯🇴',
    'السعودية': '🇸🇦', 'Saudi Arabia': '🇸🇦',
    'العراق': '🇮🇶', 'Iraq': '🇮🇶',
    'إيران': '🇮🇷', 'Iran': '🇮🇷',
    'قطر': '🇶🇦', 'Qatar': '🇶🇦',
    'اليابان': '🇯🇵', 'Japan': '🇯🇵',
    'كوريا الجنوبية': '🇰🇷', 'South Korea': '🇰🇷', 'كوريا': '🇰🇷',
    'أستراليا': '🇦🇺', 'Australia': '🇦🇺',
    'أوزبكستان': '🇺🇿', 'Uzbekistan': '🇺🇿',
    'تركيا': '🇹🇷', 'Turkey': '🇹🇷',
    // أمريكا
    'الأرجنتين': '🇦🇷', 'Argentina': '🇦🇷',
    'البرازيل': '🇧🇷', 'Brazil': '🇧🇷',
    'الولايات المتحدة': '🇺🇸', 'USA': '🇺🇸', 'United States': '🇺🇸', 'أمريكا': '🇺🇸',
    'المكسيك': '🇲🇽', 'Mexico': '🇲🇽',
    'كندا': '🇨🇦', 'Canada': '🇨🇦',
    'أوروغواي': '🇺🇾', 'Uruguay': '🇺🇾',
    'كولومبيا': '🇨🇴', 'Colombia': '🇨🇴',
    'باراغواي': '🇵🇾', 'Paraguay': '🇵🇾',
    'الإكوادور': '🇪🇨', 'Ecuador': '🇪🇨',
    'بنما': '🇵🇦', 'Panama': '🇵🇦',
    'الرأس الأخضر': '🇨🇻', 'Cape Verde': '🇨🇻',
    'نيوزيلندا': '🇳🇿', 'New Zealand': '🇳🇿',
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

  // ─── RTL FIX: ألصق نتيجة كل فريق باسمه لتجنب القراءة المعكوسة في واجهة عربية ───
  // في RTL أعمدة الجدول تُعكس بصرياً → "هولندا | 1-0 | الجزائر" يُقرأ كـ "هولندا 1 - 0 الجزائر"
  // الحل: | الجزائر 1 | — | 0 هولندا | → في RTL يُقرأ صحيحاً: "الجزائر 1 — 0 هولندا"
  if (match.homeScore !== null && match.homeScore !== undefined &&
      match.awayScore !== null && match.awayScore !== undefined) {
    lines.push(`\n| ${flag1} **${match.homeTeam} ${match.homeScore}** | ✖ | **${match.awayScore} ${match.awayTeam}** ${flag2} |`)
  } else {
    const timeStr = match.startTime ? `⏰ ${match.startTime}` : 'موعد لم يُحدَّد'
    lines.push(`\n| ${flag1} **${match.homeTeam}** | ${timeStr} | **${match.awayTeam}** ${flag2} |`)
  }
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
  // كأس العالم + سنة 2026
  if (
    (q.includes('كأس العالم') || q.includes('world cup') || q.includes('مونديال') || q.includes('fifa')) &&
    (q.includes('2026') || q.includes('٢٠٢٦'))
  ) return true
  // 2026 + مجموعة / تصفيات
  if (q.includes('2026') && (q.includes('مجموعة') || q.includes('group') || q.includes('تصفيات'))) return true
  // كأس العالم / مونديال + مباريات اليوم (بدون اشتراط السنة — البطولة جارية الآن 2026)
  if (
    (q.includes('كأس العالم') || q.includes('مونديال') || q.includes('world cup') || q.includes('fifa')) &&
    (q.includes('اليوم') || q.includes('الليلة') || q.includes('مباريات') || q.includes('نتائج') || q.includes('برنامج') || q.includes('رزنامة') || q.includes('ترتيب'))
  ) return true
  return false
}

/**
 * كشف استعلامات "مباريات كأس العالم اليوم" بدقة عالية
 * يُستخدم في الـ early handler قبل أي معالجة أخرى
 */
export function detectWC2026TodayQuery(query = '') {
  const WC_KW = /كأس\s*العالم|المونديال|مونديال|world\s*cup|FIFA|فيفا\s*2026|WC\s*2026/i
  const TODAY_KW = /اليوم|الليلة|الآن|هاذ\s+اليوم|هذا\s+اليوم|النهار|هاذ\s+النهار|الساعة\s+كم|امتى\s+تبدأ|وقت\s+المباراة/i
  const MATCH_KW = /مباراة|مباريات|مباريا|ماتش|ماتشات|مقابلة|مقابلات|كورة/i
  if (WC_KW.test(query) && TODAY_KW.test(query)) return true
  // أنماط الدارجة الجزائرية
  if (/(?:واش|كاين|فيه|فاش)\s+.*(?:ماتش|مقابلة|كورة).*(?:مونديال|كأس\s+العالم)/i.test(query)) return true
  if (/(?:مونديال|كأس\s+العالم).*(?:واش|كاين|فيه|النهار|اليوم)/i.test(query)) return true
  // أسئلة "من يلعب / شكون يلعب"
  if (/(?:شكون|من|من\s+هو).*(?:يلعب|يلعبو|يواجه).*(?:مونديال|كأس\s+العالم)/i.test(query)) return true
  if (/(?:مباريات|مباراة|نتائج|برنامج|جدول).*(?:كأس\s+العالم|مونديال|FIFA).*(?:اليوم|الليلة|الآن)/i.test(query)) return true
  if (/(?:كأس\s+العالم|مونديال|FIFA).*(?:مباريات|مباراة|نتائج|برنامج|جدول).*(?:اليوم|الليلة)/i.test(query)) return true
  // ── كشف موسم كأس العالم 2026 (11 يونيو – 19 يوليو 2026) ──────────────────
  // خلال البطولة، "مباراة اليوم" / "ماتش اليوم" = كأس العالم تلقائياً
  const _now = Date.now()
  const WC_SEASON_START = 1781136000000 // 2026-06-11T00:00:00Z
  const WC_SEASON_END   = 1784591999000 // 2026-07-20T23:59:59Z
  if (_now >= WC_SEASON_START && _now <= WC_SEASON_END) {
    if (TODAY_KW.test(query) && MATCH_KW.test(query)) return true
    if (/(?:من\s+يلعب|شكون\s+يلعب|شكون\s+راه\s+يلعب|من\s+ضد\s+من)/i.test(query) && TODAY_KW.test(query)) return true
    if (/(?:مباراة|ماتش)\s+(?:اليوم|الليلة|النهار)/i.test(query)) return true
    if (/(?:اليوم|الليلة|النهار)\s+(?:في|فيه|كاين|واش)\s+.*(?:مباراة|ماتش|كورة)/i.test(query)) return true
  }
  return false
}

/**
 * بناء سياق شامل لكأس العالم 2026 لـ LLM — جميع الفرق، المجموعات، المباريات القادمة
 */
export function buildWC2026FullContext() {
  const lines = [
    `# 🏆 كأس العالم FIFA 2026 — السياق الكامل`,
    ``,
    `📅 **التواريخ:** 11 يونيو – 19 يوليو 2026`,
    `🌍 **المضيفون:** الولايات المتحدة 🇺🇸 | كندا 🇨🇦 | المكسيك 🇲🇽`,
    `👥 **الفرق:** 48 منتخباً في 12 مجموعة`,
    ``,
    `## 📋 جدول المباريات الكامل (دور المجموعات)`,
    ``,
  ]
  const byDate = {}
  for (const f of WC2026_FULL_FIXTURES) {
    if (!byDate[f.date]) byDate[f.date] = []
    byDate[f.date].push(f)
  }
  for (const date of Object.keys(byDate).sort()) {
    const label = (() => {
      try { return new Date(date + 'T12:00:00Z').toLocaleDateString('ar-DZ', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Africa/Algiers' }) }
      catch { return date }
    })()
    lines.push(`### 📅 ${label} (${date})`)
    for (const f of byDate[date]) {
      const f1 = WC2026_FLAGS[f.homeTeam] || '🏴'
      const f2 = WC2026_FLAGS[f.awayTeam] || '🏴'
      const score = (f.homeScore !== null && f.awayScore !== null) ? `${f.homeScore}–${f.awayScore}` : f.startTime || 'vs'
      lines.push(`- ${f1} **${f.homeTeam}** ${score} **${f.awayTeam}** ${f2} | ${f.venue}, ${f.city} | المجموعة ${f.group}`)
    }
    lines.push(``)
  }
  lines.push(``)
  lines.push(`> ⚠️ **تعليمات LLM الصارمة:** أنت مُنسِّق فقط. استخدم البيانات أعلاه حصراً. لا تخترع نتائج أو مواعيد أو أسماء غير موجودة في البيانات المقدمة.`)
  return lines.join('\n')
}

/**
 * بناء بطاقة مباراة غنية لكأس العالم 2026 بعلامات الدول الكبيرة
 */
// ── أيقونات مصادر البيانات (نص بديل فقط — لا روابط في هذا الملف) ──────────
const _WC_SRC_ICONS = {
  fifa:    '🏆',
  live:    '⚽',
  stats:   '📊',
  general: '🌐',
  local:   '🗂️',
}

/**
 * buildWC2026RichMatchCard — يبني ويدجت احترافي للمباراة حسب المواصفة الرسمية
 * 🚫 ممنوع تمامًا: اختراع أي نتيجة، موعد، لاعب، أو حدث غير موجود في fix
 * ✅ إذا لم تتوفر بيانات → يُوضَّح ذلك صراحةً
 */
export function buildWC2026RichMatchCard(fix = {}) {
  // ── حماية: رفض البيانات غير المكتملة ──────────────────────────────────────
  if (!fix.homeTeam || !fix.awayTeam) {
    return `> ⚠️ **لا توجد بيانات مؤكدة لهذه المباراة حالياً من المصدر الرسمي.**`
  }

  const f1 = WC2026_FLAGS[fix.homeTeam] || '🏴'
  const f2 = WC2026_FLAGS[fix.awayTeam] || '🏴'
  const hasScore = fix.homeScore !== null && fix.homeScore !== undefined &&
                   fix.awayScore !== null && fix.awayScore !== undefined

  // ── حالة المباراة ────────────────────────────────────────────────────────────
  const statusBadge = fix.statusType === 'finished'
    ? '✅ انتهت'
    : fix.statusType === 'live'
      ? '🔴 **مباشر الآن**'
      : fix.statusType === 'result-pending'
        ? '⏳ انتظار النتيجة'
        : '📅 مقررة'

  const dateStr = (() => {
    try {
      return new Date(fix.date + 'T12:00:00Z').toLocaleDateString('ar-DZ', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Algiers',
      })
    } catch { return fix.date || '' }
  })()

  // ── تحديد أيقونات المصادر بناءً على مصدر البيانات ──────────────────────────
  const srcIcons = (() => {
    const src = (fix._source || '').toLowerCase()
    const icons = []
    if (/fifa/.test(src) || !fix._source) icons.push(_WC_SRC_ICONS.fifa)
    if (/fotmob|kooora|jdwel|livescore/.test(src)) icons.push(_WC_SRC_ICONS.live)
    if (/365|sofascore|stats/.test(src)) icons.push(_WC_SRC_ICONS.stats)
    if (!icons.length) icons.push(_WC_SRC_ICONS.local, _WC_SRC_ICONS.fifa)
    return icons.join(' ')
  })()

  const nowStr = new Date().toLocaleTimeString('ar-DZ', {
    timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit',
  })

  // ── ويدجت المباراة الرئيسي ───────────────────────────────────────────────────
  const lines = [
    `---`,
    `🟦 **MATCH WIDGET**`,
    ``,
    `🏆 **${fix.competition || 'FIFA World Cup 2026'}**`,
    `📍 **${fix.round || 'دور المجموعات'}**${fix.group ? ` — المجموعة **${fix.group}**` : ''}`,
  ]

  if (fix.startTime) {
    lines.push(`⏰ **الموعد:** ${fix.startTime} (بتوقيت الجزائر)`)
  }
  if (fix.venue || fix.city) {
    lines.push(`🏟️ **الملعب:** ${fix.venue || ''}${fix.city ? ` — ${fix.city}` : ''}${fix.country ? `, ${fix.country}` : ''}`)
  }

  lines.push(``)

  // ── السطر الرئيسي: الفريقان والنتيجة ───────────────────────────────────────
  if (hasScore) {
    lines.push(`${f1} **${fix.homeTeam}**   \`${fix.homeScore}\`  —  \`${fix.awayScore}\`   **${fix.awayTeam}** ${f2}`)
  } else {
    lines.push(`${f1} **${fix.homeTeam}**  ——  **${fix.awayTeam}** ${f2}`)
  }

  lines.push(`📊 **الحالة:** ${statusBadge}`)

  // ── الأحداث (أهداف، بطاقات، تبديلات) — فقط إذا توفرت بيانات فعلية ──────────
  const goals   = Array.isArray(fix.goals)   ? fix.goals   : []
  const cards   = Array.isArray(fix.cards)   ? fix.cards   : []
  const subs    = Array.isArray(fix.subs)    ? fix.subs    : []

  if (goals.length || cards.length || subs.length) {
    lines.push(``)
    lines.push(`📌 **الأحداث:**`)
    for (const g of goals) {
      lines.push(`- ⚽ هدف: **${g.player || '؟'}** (${g.minute || '?'}') — ${g.team || ''}${g.assist ? ` ← تمريرة: ${g.assist}` : ''}`)
    }
    for (const c of cards) {
      const cardIcon = c.type === 'red' ? '🟥' : '🟨'
      lines.push(`- ${cardIcon} بطاقة: **${c.player || '؟'}** (${c.minute || '?'}') — ${c.team || ''}`)
    }
    for (const s of subs) {
      lines.push(`- 🔁 تبديل: **${s.in || '؟'}** ← **${s.out || '؟'}** (${s.minute || '?'}')`)
    }
  }

  // ── الإحصائيات — فقط إذا توفرت بيانات فعلية ──────────────────────────────
  const stats = fix.stats || null
  if (stats) {
    lines.push(``)
    lines.push(`📊 **الإحصائيات:**`)
    if (stats.possession) lines.push(`- الاستحواذ: ${stats.possession[0]}% — ${stats.possession[1]}%`)
    if (stats.shots)      lines.push(`- التسديدات: ${stats.shots[0]} — ${stats.shots[1]}`)
    if (stats.corners)    lines.push(`- الأركان: ${stats.corners[0]} — ${stats.corners[1]}`)
    if (stats.fouls)      lines.push(`- الأخطاء: ${stats.fouls[0]} — ${stats.fouls[1]}`)
  }

  // ── التذييل: المصدر + وقت التحديث ─────────────────────────────────────────
  lines.push(``)
  lines.push(`🔗 **المصدر:** ${srcIcons}`)
  lines.push(`⏱ **آخر تحديث:** ${dateStr}${fix.startTime ? ' · ' + fix.startTime : ''} — ${nowStr} ج`)
  lines.push(`---`)

  if (fix.kooraLink) {
    lines.push(`> 🔗 [تفاصيل المباراة على Kooora](${fix.kooraLink})`)
  }

  return lines.join('\n')
}

/**
 * جدول دور المجموعات الكامل لكأس العالم 2026
 * المصدر: FIFA الرسمي — يشمل 48 منتخباً في 12 مجموعة
 * الجولة الأولى: 11 يونيو – 3 يوليو 2026
 */
export const WC2026_FULL_FIXTURES = [
  // ── المجموعة A: المكسيك، جنوب أفريقيا، كوريا الجنوبية، جمهورية التشيك ──
  { group: 'A', homeTeam:'المكسيك',          awayTeam:'جنوب أفريقيا',       date:'2026-06-12', startTime:'00:00', venue:'Estadio Azteca',               city:'Mexico City',   country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'A', homeTeam:'كوريا الجنوبية',   awayTeam:'جمهورية التشيك',     date:'2026-06-12', startTime:'23:00', venue:'BC Place',                     city:'Vancouver',     country:'كندا',         statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'A', homeTeam:'المكسيك',          awayTeam:'كوريا الجنوبية',     date:'2026-06-15', startTime:'22:00', venue:'AT&T Stadium',                  city:'Dallas',        country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'A', homeTeam:'جمهورية التشيك',   awayTeam:'جنوب أفريقيا',       date:'2026-06-15', startTime:'19:00', venue:'Mercedes-Benz Stadium',         city:'Atlanta',       country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'A', homeTeam:'جمهورية التشيك',   awayTeam:'المكسيك',             date:'2026-06-19', startTime:'02:00', venue:'Estadio Azteca',               city:'Mexico City',   country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'A', homeTeam:'جنوب أفريقيا',     awayTeam:'كوريا الجنوبية',     date:'2026-06-19', startTime:'02:00', venue:'Lumen Field',                  city:'Seattle',       country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },

  // ── المجموعة B: كندا، البوسنة والهرسك، قطر، سويسرا ──
  { group: 'B', homeTeam:'كندا',              awayTeam:'البوسنة والهرسك',    date:'2026-06-13', startTime:'02:00', venue:'BC Place',                     city:'Vancouver',     country:'كندا',         statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'B', homeTeam:'قطر',               awayTeam:'سويسرا',             date:'2026-06-12', startTime:'22:00', venue:'SoFi Stadium',                  city:'Los Angeles',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'B', homeTeam:'كندا',              awayTeam:'قطر',                 date:'2026-06-16', startTime:'22:00', venue:'Commonwealth Stadium',          city:'Edmonton',      country:'كندا',         statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'B', homeTeam:'سويسرا',            awayTeam:'البوسنة والهرسك',    date:'2026-06-16', startTime:'19:00', venue:'Lumen Field',                  city:'Seattle',       country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'B', homeTeam:'سويسرا',            awayTeam:'كندا',                date:'2026-06-20', startTime:'22:00', venue:'BC Place',                     city:'Vancouver',     country:'كندا',         statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'B', homeTeam:'البوسنة والهرسك',   awayTeam:'قطر',                date:'2026-06-20', startTime:'22:00', venue:'Lumen Field',                  city:'Seattle',       country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },

  // ── المجموعة C: البرازيل، المغرب، هايتي، اسكتلندا ──
  { group: 'C', homeTeam:'البرازيل',          awayTeam:'المغرب',             date:'2026-06-13', startTime:'22:00', venue:'SoFi Stadium',                  city:'Los Angeles',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'C', homeTeam:'هايتي',             awayTeam:'اسكتلندا',           date:'2026-06-13', startTime:'19:00', venue:'Estadio BBVA',                  city:'Monterrey',     country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'C', homeTeam:'البرازيل',          awayTeam:'هايتي',              date:'2026-06-17', startTime:'22:00', venue:'AT&T Stadium',                  city:'Dallas',        country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'C', homeTeam:'اسكتلندا',          awayTeam:'المغرب',             date:'2026-06-17', startTime:'19:00', venue:'Hard Rock Stadium',             city:'Miami',         country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'C', homeTeam:'اسكتلندا',          awayTeam:'البرازيل',           date:'2026-06-21', startTime:'22:00', venue:'SoFi Stadium',                  city:'Los Angeles',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'C', homeTeam:'المغرب',            awayTeam:'هايتي',              date:'2026-06-21', startTime:'22:00', venue:'Mercedes-Benz Stadium',         city:'Atlanta',       country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },

  // ── المجموعة D: الولايات المتحدة، باراغواي، أستراليا، تركيا ──
  { group: 'D', homeTeam:'الولايات المتحدة', awayTeam:'باراغواي',           date:'2026-06-12', startTime:'19:00', venue:'MetLife Stadium',               city:'New York',      country:'الولايات المتحدة', statusType:'finished', homeScore:4, awayScore:1, winner:'الولايات المتحدة', competition:'كأس العالم FIFA 2026', round:'الجولة 1', verified:true, source:'365scores.com' },
  { group: 'D', homeTeam:'أستراليا',          awayTeam:'تركيا',              date:'2026-06-13', startTime:'02:00', venue:'Estadio Azteca',               city:'Mexico City',   country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'D', homeTeam:'الولايات المتحدة', awayTeam:'أستراليا',           date:'2026-06-16', startTime:'22:00', venue:'SoFi Stadium',                  city:'Los Angeles',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'D', homeTeam:'تركيا',             awayTeam:'باراغواي',          date:'2026-06-16', startTime:'19:00', venue:'Arrowhead Stadium',             city:'Kansas City',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'D', homeTeam:'تركيا',             awayTeam:'الولايات المتحدة',  date:'2026-06-20', startTime:'19:00', venue:'MetLife Stadium',               city:'New York',      country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'D', homeTeam:'باراغواي',          awayTeam:'أستراليا',          date:'2026-06-20', startTime:'19:00', venue:'Gillette Stadium',              city:'Boston',        country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },

  // ── المجموعة E: ألمانيا، كوراساو، ساحل العاج، الإكوادور ──
  { group: 'E', homeTeam:'ألمانيا',           awayTeam:'كوراساو',            date:'2026-06-14', startTime:'22:00', venue:'MetLife Stadium',               city:'New York',      country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'E', homeTeam:'ساحل العاج',        awayTeam:'الإكوادور',          date:'2026-06-14', startTime:'02:00', venue:'Estadio Guadalajara',           city:'Guadalajara',   country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'E', homeTeam:'ألمانيا',           awayTeam:'ساحل العاج',         date:'2026-06-18', startTime:'22:00', venue:'Lumen Field',                  city:'Seattle',       country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'E', homeTeam:'الإكوادور',         awayTeam:'كوراساو',            date:'2026-06-18', startTime:'19:00', venue:'Arrowhead Stadium',             city:'Kansas City',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'E', homeTeam:'الإكوادور',         awayTeam:'ألمانيا',            date:'2026-06-22', startTime:'22:00', venue:'AT&T Stadium',                  city:'Dallas',        country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'E', homeTeam:'كوراساو',           awayTeam:'ساحل العاج',         date:'2026-06-22', startTime:'22:00', venue:'Mercedes-Benz Stadium',         city:'Atlanta',       country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },

  // ── المجموعة F: هولندا، اليابان، السويد، تونس ──
  { group: 'F', homeTeam:'هولندا',            awayTeam:'اليابان',            date:'2026-06-14', startTime:'19:00', venue:'Gillette Stadium',              city:'Boston',        country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'F', homeTeam:'السويد',            awayTeam:'تونس',               date:'2026-06-14', startTime:'19:00', venue:'SoFi Stadium',                  city:'Los Angeles',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'F', homeTeam:'هولندا',            awayTeam:'السويد',             date:'2026-06-18', startTime:'19:00', venue:'Lincoln Financial Field',       city:'Philadelphia',  country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'F', homeTeam:'تونس',              awayTeam:'اليابان',            date:'2026-06-18', startTime:'02:00', venue:'Estadio Guadalajara',           city:'Guadalajara',   country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'F', homeTeam:'تونس',              awayTeam:'هولندا',             date:'2026-06-22', startTime:'19:00', venue:'Arrowhead Stadium',             city:'Kansas City',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'F', homeTeam:'اليابان',           awayTeam:'السويد',             date:'2026-06-22', startTime:'19:00', venue:'Lumen Field',                  city:'Seattle',       country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },

  // ── المجموعة G: بلجيكا، مصر، إيران، نيوزيلندا ──
  { group: 'G', homeTeam:'بلجيكا',            awayTeam:'مصر',                date:'2026-06-15', startTime:'02:00', venue:'Estadio BBVA',                  city:'Monterrey',     country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'G', homeTeam:'إيران',             awayTeam:'نيوزيلندا',          date:'2026-06-15', startTime:'19:00', venue:'Lincoln Financial Field',       city:'Philadelphia',  country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'G', homeTeam:'بلجيكا',            awayTeam:'إيران',              date:'2026-06-19', startTime:'19:00', venue:'Gillette Stadium',              city:'Boston',        country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'G', homeTeam:'نيوزيلندا',         awayTeam:'مصر',                date:'2026-06-19', startTime:'02:00', venue:'Estadio Guadalajara',           city:'Guadalajara',   country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'G', homeTeam:'نيوزيلندا',         awayTeam:'بلجيكا',             date:'2026-06-23', startTime:'19:00', venue:'MetLife Stadium',               city:'New York',      country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'G', homeTeam:'مصر',               awayTeam:'إيران',              date:'2026-06-23', startTime:'19:00', venue:'Hard Rock Stadium',             city:'Miami',         country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },

  // ── المجموعة H: إسبانيا، الرأس الأخضر، السعودية، أوروغواي ──
  { group: 'H', homeTeam:'إسبانيا',           awayTeam:'الرأس الأخضر',       date:'2026-06-15', startTime:'22:00', venue:'Hard Rock Stadium',             city:'Miami',         country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'H', homeTeam:'السعودية',           awayTeam:'أوروغواي',           date:'2026-06-16', startTime:'02:00', venue:'Estadio Azteca',               city:'Mexico City',   country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'H', homeTeam:'إسبانيا',           awayTeam:'السعودية',           date:'2026-06-20', startTime:'22:00', venue:'SoFi Stadium',                  city:'Los Angeles',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'H', homeTeam:'أوروغواي',          awayTeam:'الرأس الأخضر',       date:'2026-06-20', startTime:'19:00', venue:'Hard Rock Stadium',             city:'Miami',         country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'H', homeTeam:'أوروغواي',          awayTeam:'إسبانيا',            date:'2026-06-24', startTime:'22:00', venue:'MetLife Stadium',               city:'New York',      country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'H', homeTeam:'الرأس الأخضر',      awayTeam:'السعودية',           date:'2026-06-24', startTime:'22:00', venue:'Gillette Stadium',              city:'Boston',        country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },

  // ── المجموعة I: فرنسا، السنغال، العراق، النرويج ──
  { group: 'I', homeTeam:'فرنسا',             awayTeam:'السنغال',            date:'2026-06-16', startTime:'22:00', venue:'Lincoln Financial Field',       city:'Philadelphia',  country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'I', homeTeam:'العراق',             awayTeam:'النرويج',            date:'2026-06-16', startTime:'19:00', venue:'BC Place',                     city:'Vancouver',     country:'كندا',         statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'I', homeTeam:'فرنسا',             awayTeam:'العراق',             date:'2026-06-20', startTime:'02:00', venue:'Estadio BBVA',                  city:'Monterrey',     country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'I', homeTeam:'النرويج',            awayTeam:'السنغال',            date:'2026-06-20', startTime:'22:00', venue:'Gillette Stadium',              city:'Boston',        country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'I', homeTeam:'النرويج',            awayTeam:'فرنسا',              date:'2026-06-24', startTime:'19:00', venue:'Lincoln Financial Field',       city:'Philadelphia',  country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'I', homeTeam:'السنغال',           awayTeam:'العراق',             date:'2026-06-24', startTime:'19:00', venue:'BC Place',                     city:'Vancouver',     country:'كندا',         statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },

  // ── المجموعة J: الأرجنتين، الجزائر، النمسا، الأردن ──
  { group: 'J', homeTeam:'الأرجنتين',         awayTeam:'الجزائر',            date:'2026-06-17', startTime:'02:00', venue:'MetLife Stadium',               city:'East Rutherford', country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'J', homeTeam:'النمسا',            awayTeam:'الأردن',             date:'2026-06-17', startTime:'19:00', venue:'Arrowhead Stadium',             city:'Kansas City',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'J', homeTeam:'الجزائر',           awayTeam:'النمسا',             date:'2026-06-21', startTime:'03:00', venue:'Arrowhead Stadium',             city:'Kansas City',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'J', homeTeam:'الأردن',            awayTeam:'الأرجنتين',          date:'2026-06-21', startTime:'19:00', venue:'Hard Rock Stadium',             city:'Miami',         country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'J', homeTeam:'الأردن',            awayTeam:'الجزائر',            date:'2026-06-25', startTime:'04:00', venue:'AT&T Stadium',                  city:'Dallas',        country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'J', homeTeam:'الأرجنتين',         awayTeam:'النمسا',             date:'2026-06-25', startTime:'22:00', venue:'Lincoln Financial Field',       city:'Philadelphia',  country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },

  // ── المجموعة K: البرتغال، الكونغو الديمقراطية، أوزبكستان، كولومبيا ──
  { group: 'K', homeTeam:'البرتغال',          awayTeam:'الكونغو الديمقراطية', date:'2026-06-13', startTime:'22:00', venue:'Arrowhead Stadium',            city:'Kansas City',   country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'K', homeTeam:'أوزبكستان',         awayTeam:'كولومبيا',           date:'2026-06-13', startTime:'19:00', venue:'Commonwealth Stadium',          city:'Edmonton',      country:'كندا',         statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'K', homeTeam:'البرتغال',          awayTeam:'أوزبكستان',          date:'2026-06-17', startTime:'19:00', venue:'Lincoln Financial Field',       city:'Philadelphia',  country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'K', homeTeam:'كولومبيا',          awayTeam:'الكونغو الديمقراطية', date:'2026-06-17', startTime:'22:00', venue:'AT&T Stadium',                 city:'Dallas',        country:'الولايات المتحدة', statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'K', homeTeam:'كولومبيا',          awayTeam:'البرتغال',           date:'2026-06-21', startTime:'02:00', venue:'Estadio Guadalajara',           city:'Guadalajara',   country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'K', homeTeam:'الكونغو الديمقراطية', awayTeam:'أوزبكستان',        date:'2026-06-21', startTime:'02:00', venue:'Estadio BBVA',                 city:'Monterrey',     country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },

  // ── المجموعة L: إنجلترا، كرواتيا، غانا، بنما ──
  { group: 'L', homeTeam:'إنجلترا',           awayTeam:'كرواتيا',            date:'2026-06-13', startTime:'02:00', venue:'Commonwealth Stadium',          city:'Edmonton',      country:'كندا',         statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'L', homeTeam:'غانا',              awayTeam:'بنما',               date:'2026-06-14', startTime:'02:00', venue:'Estadio Guadalajara',           city:'Guadalajara',   country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 1' },
  { group: 'L', homeTeam:'إنجلترا',           awayTeam:'غانا',               date:'2026-06-18', startTime:'02:00', venue:'Estadio BBVA',                  city:'Monterrey',     country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'L', homeTeam:'بنما',              awayTeam:'كرواتيا',            date:'2026-06-18', startTime:'22:00', venue:'BC Place',                     city:'Vancouver',     country:'كندا',         statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 2' },
  { group: 'L', homeTeam:'بنما',              awayTeam:'إنجلترا',            date:'2026-06-22', startTime:'02:00', venue:'Estadio Azteca',               city:'Mexico City',   country:'المكسيك',      statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
  { group: 'L', homeTeam:'كرواتيا',           awayTeam:'غانا',               date:'2026-06-22', startTime:'02:00', venue:'Commonwealth Stadium',          city:'Edmonton',      country:'كندا',         statusType:'upcoming', competition:'كأس العالم FIFA 2026', round:'الجولة 3' },
]

// ─────────────────────────────────────────────────────────────────────────────
// § 4b — حارس الوقت: منع الهلوسة — لا نتائج لمباريات لم تنته رسمياً من المصادر
// ─────────────────────────────────────────────────────────────────────────────

/**
 * القاعدة الجذرية لمنع الهلوسة:
 * إذا كانت المباراة "upcoming" لكن وقتها تجاوز 2 ساعة من الآن →
 * تُحوَّل إلى "result-pending" مع حذف أي نتيجة.
 * 🚫 لا يُسمح أبداً بعرض نتيجة غير موثوقة من مصدر رسمي.
 */
export function sanitizeMatchByTime(match = {}) {
  if (!match || match.statusType !== 'upcoming') return match
  if (!match.date || !match.startTime) return match
  try {
    const [hh, mm] = (match.startTime || '00:00').split(':').map(Number)
    const matchEndUtc = new Date(
      `${match.date}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00Z`
    ).getTime() + 2 * 60 * 60 * 1000
    if (matchEndUtc < Date.now()) {
      return {
        ...match,
        statusType: 'result-pending',
        homeScore: null,
        awayScore: null,
        _timePassed: true,
      }
    }
  } catch {}
  return match
}

export function sanitizeMatchesByTime(matches = []) {
  return matches.map(sanitizeMatchByTime)
}

/**
 * جلب مباريات كأس العالم 2026 من البيانات المحلية لتاريخ محدد
 * يُرجع مصفوفة من المباريات المجدولة في ذلك التاريخ (جميع المجموعات)
 * ✅ يُطبّق sanitizeMatchByTime تلقائياً — لا نتائج وهمية
 */
export function buildWC2026TodayFixtures(dateStr = '') {
  const date = dateStr || new Date().toISOString().split('T')[0]
  // أولاً: البحث في الجدول الكامل لكل المجموعات
  const allMatches = WC2026_FULL_FIXTURES.filter(f => f.date === date)
  if (allMatches.length > 0) return sanitizeMatchesByTime(allMatches)
  // احتياطياً: مباريات الجزائر فقط
  return sanitizeMatchesByTime(WORLD_CUP_2026.algeriaGroup.fixtures.filter(f => f.date === date))
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

// ─────────────────────────────────────────────────────────────────────────────
// § 8 — جدول مجموعة كأس العالم 2026 (بيانات هيكلية للعرض المرئي)
// ─────────────────────────────────────────────────────────────────────────────

const WC2026_GROUP_FIXTURES = {
  'J': WORLD_CUP_2026.algeriaGroup.fixtures,
}

// ─────────────────────────────────────────────────────────────────────────────
// § 9 — ترتيب مجموعات كأس العالم 2026
// ─────────────────────────────────────────────────────────────────────────────

/**
 * كاشف استعلامات ترتيب كأس العالم 2026
 */
export function detectWC2026StandingsQuery(query = '') {
  const q = query
  if (/(?:ترتيب|جدول|صدارة|أول)\s+(?:المجموعة|مجموعة)/i.test(q)) return true
  if (/(?:ترتيب|جدول|صدارة)\s+(?:كأس\s*العالم|المونديال|مونديال)/i.test(q)) return true
  if (/(?:كم\s+نقطة|نقاط|نقط)\s+(?:الجزائر|المنتخب|الخضر)/i.test(q)) return true
  if (/مجموعة\s+(?:الجزائر|الخضر|المنتخب\s+الجزائري)/i.test(q)) return true
  if (/ترتيب\s+الجزائر.*(?:كأس|مونديال|2026)/i.test(q)) return true
  if (/(?:من\s+يتصدر|يتصدر\s+المجموعة|صدارة\s+المجموعة)/i.test(q)) return true
  if (/(?:المجموعة|مجموعة|group)\s+[A-La-l]\b/i.test(q) &&
      /(?:كأس\s*العالم|مونديال|2026|ترتيب|صدارة|نقط|نقاط)/i.test(q)) return true
  if (/standings|group\s+table|group\s+standings/i.test(q)) return true
  return false
}

/**
 * بناء جدول ترتيب مجموعة كأس العالم 2026
 * @param {string} groupLetter - حرف المجموعة A-L
 * @param {Array|null} liveRows - بيانات حية { team, played, win, draw, loss, gf, ga, pts }
 * @returns {string} نص markdown
 */
export function buildWC2026StandingsTable(groupLetter = 'J', liveRows = null) {
  const letter = groupLetter.toUpperCase().trim()
  const rawTeams = GROUP_TEAMS_AR[letter]
  if (!rawTeams) return null

  const localRows = rawTeams.map(entry => {
    const parts = entry.trim().split(' ')
    const flag = parts[parts.length - 1]
    const name = parts.slice(0, -1).join(' ')
    return { team: name, flag, played: 0, win: 0, draw: 0, loss: 0, gf: 0, ga: 0, gd: 0, pts: 0 }
  })

  const isLive = !!(liveRows && liveRows.length > 0)
  let rows = localRows

  if (isLive) {
    rows = localRows.map(r => {
      const live = liveRows.find(lr => {
        const ln = (lr.team || '').toLowerCase()
        const rn = r.team.toLowerCase()
        return ln === rn || ln.includes(rn) || rn.includes(ln)
      })
      if (!live) return r
      const gd = (live.gf || 0) - (live.ga || 0)
      return { ...r, played: live.played || 0, win: live.win || 0, draw: live.draw || 0, loss: live.loss || 0, gf: live.gf || 0, ga: live.ga || 0, gd, pts: live.pts || 0 }
    })
    rows.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      if (b.gd !== a.gd) return b.gd - a.gd
      return b.gf - a.gf
    })
  }

  const now = new Date().toLocaleTimeString('ar-DZ', { timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit' })
  const sourceNote = isLive
    ? `> 📡 *بيانات حية — آخر تحديث: ${now} (توقيت الجزائر)*`
    : `> 📋 *جميع الفرق لم تلعب بعد في هذه المجموعة — الجدول الأولي*`

  const lines = [
    `## 🏆 ترتيب المجموعة ${letter} — كأس العالم FIFA 2026`,
    ``,
    sourceNote,
    ``,
    `| # | المنتخب | ل | ف | ت | خ | لـه | عليه | +/- | نق |`,
    `|:-:|:-------|:-:|:-:|:-:|:-:|:---:|:----:|:---:|:--:|`,
  ]

  rows.forEach((r, i) => {
    const pos = i + 1
    const posStr = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `${pos}`
    const isAlgeria = r.team.includes('الجزائر')
    const hl = isAlgeria ? '**' : ''
    const gdStr = r.gd > 0 ? `+${r.gd}` : `${r.gd}`
    const ptsStr = isAlgeria ? `🟢 **${r.pts}**` : `**${r.pts}**`
    lines.push(`| ${posStr} | ${r.flag} ${hl}${r.team}${hl} | ${r.played} | ${r.win} | ${r.draw} | ${r.loss} | ${r.gf} | ${r.ga} | ${gdStr} | ${ptsStr} |`)
  })

  lines.push(``)
  lines.push(`> **ل**=فوز · **ف**=لعب · **ت**=تعادل · **خ**=خسارة · **لـه**=أهداف لـه · **عليه**=أهداف عليه · **+/-**=الفارق · **نق**=نقاط`)

  if (letter === 'J') {
    lines.push(``)
    lines.push(`### 📅 مباريات 🇩🇿 الجزائر في المجموعة J`)
    lines.push(`| التاريخ | المباراة | الملعب | المدينة |`)
    lines.push(`|--------|---------|-------|--------|`)
    for (const fix of WORLD_CUP_2026.algeriaGroup.fixtures) {
      const d = new Date(fix.date + 'T12:00:00')
      const dateLabel = d.toLocaleDateString('ar-DZ', {
        weekday: 'short', month: 'long', day: 'numeric', timeZone: 'America/New_York',
      })
      const f1 = WC2026_FLAGS[fix.homeTeam] || '🏴'
      const f2 = WC2026_FLAGS[fix.awayTeam] || '🏴'
      const score = (fix.homeScore !== null && fix.homeScore !== undefined)
        ? `**${fix.homeScore}–${fix.awayScore}**`
        : `⏰ ${fix.startTime || '؟'}`
      lines.push(`| ${dateLabel} | ${f1} ${fix.homeTeam} ${score} ${fix.awayTeam} ${f2} | ${fix.venue || ''} | ${fix.city || ''} |`)
    }
  }

  lines.push(``)
  lines.push(`_📡 المصدر: **DZ-Sports-Knowledge**${isLive ? ' + SofaScore (حي ✅)' : ' — بيانات أولية قبل انطلاق البطولة'}_`)

  return lines.join('\n')
}

const WC2026_FLAGS = {
  'المكسيك': '🇲🇽', 'جنوب أفريقيا': '🇿🇦', 'كوريا الجنوبية': '🇰🇷', 'جمهورية التشيك': '🇨🇿',
  'كندا': '🇨🇦', 'البوسنة والهرسك': '🇧🇦', 'قطر': '🇶🇦', 'سويسرا': '🇨🇭',
  'البرازيل': '🇧🇷', 'المغرب': '🇲🇦', 'هايتي': '🇭🇹', 'اسكتلندا': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'الولايات المتحدة': '🇺🇸', 'أمريكا': '🇺🇸', 'باراغواي': '🇵🇾', 'أستراليا': '🇦🇺', 'تركيا': '🇹🇷',
  'ألمانيا': '🇩🇪', 'كوراساو': '🇨🇼', 'ساحل العاج': '🇨🇮', 'الإكوادور': '🇪🇨',
  'هولندا': '🇳🇱', 'اليابان': '🇯🇵', 'السويد': '🇸🇪', 'تونس': '🇹🇳',
  'بلجيكا': '🇧🇪', 'مصر': '🇪🇬', 'إيران': '🇮🇷', 'نيوزيلندا': '🇳🇿',
  'إسبانيا': '🇪🇸', 'الرأس الأخضر': '🇨🇻', 'السعودية': '🇸🇦', 'أوروغواي': '🇺🇾',
  'فرنسا': '🇫🇷', 'السنغال': '🇸🇳', 'العراق': '🇮🇶', 'النرويج': '🇳🇴',
  'الأرجنتين': '🇦🇷', 'الجزائر': '🇩🇿', 'النمسا': '🇦🇹', 'الأردن': '🇯🇴',
  'البرتغال': '🇵🇹', 'الكونغو الديمقراطية': '🇨🇩', 'أوزبكستان': '🇺🇿', 'كولومبيا': '🇨🇴',
  'إنجلترا': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'كرواتيا': '🇭🇷', 'غانا': '🇬🇭', 'بنما': '🇵🇦',
}

/**
 * يبني بيانات هيكلية لجدول مجموعة كأس العالم 2026
 * @param {string} groupLetter - حرف المجموعة (A-L) أو اسم فريق
 * @returns {{ groupLetter, groupLabel, teams, fixtures, fifaRankings } | null}
 */
export function buildWC2026GroupTableData(groupLetter = '') {
  const letter = groupLetter.toUpperCase().trim()
  if (!GROUP_TEAMS_AR[letter]) return null

  const rawTeams = GROUP_TEAMS_AR[letter]
  // للمجموعة J فقط لدينا بيانات FIFA rank تفصيلية
  const fifaRankMap = letter === 'J'
    ? Object.fromEntries(WORLD_CUP_2026.algeriaGroup.teams.map(t => {
        const n = t.name.replace(/\s*🇩🇿.*|🇦🇷.*|🇦🇹.*|🇯🇴.*/g, '').trim()
        return [n, t.fifa_rank]
      }))
    : {}

  const teams = rawTeams.map(t => {
    const parts = t.split(' ')
    const flag = parts[parts.length - 1]
    const name = parts.slice(0, -1).join(' ')
    return { name, flag, fifa_rank: fifaRankMap[name] || null }
  })

  const fixtures = WC2026_GROUP_FIXTURES[letter] || null

  return {
    groupLetter: letter,
    groupLabel: `المجموعة ${letter}`,
    groupLabelEn: `Group ${letter}`,
    teams,
    fixtures,
    flagsMap: WC2026_FLAGS,
    source: 'DZ-Sports-Knowledge',
    competition: 'كأس العالم FIFA 2026',
  }
}

/**
 * استخرج حرف المجموعة من الاستعلام (A-L أو اسم فريق أو "مجموعة الجزائر")
 */
export function extractWC2026GroupFromQuery(query = '') {
  const q = query.trim()
  // حرف المجموعة مباشرة: "المجموعة J" / "group J"
  const letterMatch = q.match(/(?:المجموعة|مجموعة|group)\s+([A-La-l])\b/i)
  if (letterMatch) return letterMatch[1].toUpperCase()
  // اسم فريق
  const found = findWC2026TeamGroup(q)
  if (found) return found
  // مسح كل أسماء الفرق في الاستعلام
  for (const [teamName, grp] of Object.entries(WC2026_TEAM_GROUP_MAP)) {
    if (q.includes(teamName)) return grp
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// § findWC2026FixtureBetweenTeams — إيجاد مباراة مباشرة بين فريقَين في WC2026
// ══════════════════════════════════════════════════════════════════════════════

/**
 * يبحث في WC2026_FULL_FIXTURES عن مباراة مجدولة بين فريقَين
 * يستخدم مطابقة مرنة (fuzzy) لأسماء الفرق
 * @param {string} team1
 * @param {string} team2
 * @returns {object|null} fixture object or null
 */
export function findWC2026FixtureBetweenTeams(team1 = '', team2 = '') {
  if (!team1 || !team2) return null
  const norm = t => t.trim().toLowerCase()
  const n1 = norm(team1)
  const n2 = norm(team2)
  for (const fix of WC2026_FULL_FIXTURES) {
    const nh = norm(fix.homeTeam)
    const na = norm(fix.awayTeam)
    const m12 = (nh === n1 || nh.includes(n1) || n1.includes(nh)) &&
                (na === n2 || na.includes(n2) || n2.includes(na))
    const m21 = (nh === n2 || nh.includes(n2) || n2.includes(nh)) &&
                (na === n1 || na.includes(n1) || n1.includes(na))
    if (m12 || m21) return fix
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// § buildWC2026MatchVsResponse — رد شامل لـ "فريق1 ضد فريق2" في WC2026
// ══════════════════════════════════════════════════════════════════════════════

/**
 * يبني رداً احترافياً شاملاً لاستعلام "فريق1 ضد فريق2" في سياق كأس العالم 2026
 * - إذا كان الفريقان في نفس المجموعة ولهما مباراة مجدولة → يُظهر تفاصيل المباراة الكاملة
 * - إذا كانا في مجموعتين مختلفتين → يشرح سيناريو الأدوار الإقصائية
 * - إذا لم يكن أحدهما في WC2026 → يُعيد null (للاستعلامات الأخرى)
 * @param {string} team1
 * @param {string} team2
 * @returns {string|null}
 */
export function buildWC2026MatchVsResponse(team1 = '', team2 = '') {
  const g1 = findWC2026TeamGroup(team1)
  const g2 = findWC2026TeamGroup(team2)
  if (!g1 || !g2) return null // أحد الفريقين ليس في WC2026

  const f1 = WC2026_FLAGS[team1] || '🏴'
  const f2 = WC2026_FLAGS[team2] || '🏴'

  // ── البحث عن مباراة مباشرة بينهما ────────────────────────────────────────
  const fixture = findWC2026FixtureBetweenTeams(team1, team2)

  if (fixture) {
    // تحديد الوضع الحالي للمباراة
    const now = new Date()
    const matchStart = new Date(fixture.date + 'T' + fixture.startTime + ':00+01:00')
    const matchEnd   = new Date(matchStart.getTime() + 110 * 60 * 1000)
    const isPast     = now > matchEnd
    const isLive     = !isPast && now >= matchStart
    const statusBadge = isPast ? '✅ انتهت' : isLive ? '🔴 جارية الآن' : '🕒 لم تُلعب بعد'

    // تحويل التاريخ لتنسيق عربي
    const dateLabel = (() => {
      try {
        return new Date(fixture.date + 'T12:00:00Z').toLocaleDateString('ar-DZ', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          timeZone: 'Africa/Algiers',
        })
      } catch { return fixture.date }
    })()
    // التوقيت مخزّن بتوقيت الجزائر مباشرة — لا تحويل
    const dztLabel = `${fixture.startTime} (بتوقيت الجزائر)`

    const groupTeams = GROUP_TEAMS_AR[g1]?.join(' · ') || ''

    return [
      `## ⚽ ${f1} ${fixture.homeTeam} 🆚 ${f2} ${fixture.awayTeam}`,
      `### كأس العالم FIFA 2026 — المجموعة ${g1}`,
      ``,
      `| 📅 التاريخ | ⏰ التوقيت | 🏟️ الملعب | 📍 المدينة |`,
      `|-----------|----------|----------|----------|`,
      `| **${dateLabel}** | **${dztLabel}** | ${fixture.venue} | ${fixture.city}، ${fixture.country} |`,
      ``,
      `| 🏆 البطولة | 📋 الجولة | 📊 الحالة |`,
      `|-----------|----------|---------|`,
      `| ${fixture.competition} | ${fixture.round} | **${statusBadge}** |`,
      ``,
      `---`,
      `### 🗂️ المجموعة ${g1} — المنتخبات الأربعة`,
      `> ${groupTeams}`,
      ``,
      `> 📡 **المصدر**: DZ-Sports-Knowledge v2.0 — بيانات FIFA كأس العالم 2026 الرسمية ✅`,
      `> _لا توجد نتيجة نهائية — المباراة ${isPast ? 'انتهت' : 'لم تُلعب بعد'}. للمتابعة الحية: [FotMob](https://www.fotmob.com) | [365scores](https://www.365scores.com/ar/football)_`,
    ].join('\n')
  }

  // ── الفريقان في مجموعتين مختلفتين ─────────────────────────────────────────
  return buildWC2026KnockoutContext(team1, team2, g1, g2)
}

/**
 * يكتشف إذا كان الاستعلام يتعلق بمباراة بين فريقَين وكلاهما مشاركان في WC2026
 * @param {string} query
 * @returns {{ team1: string, team2: string, response: string } | null}
 */
export function detectAndBuildWC2026MatchVs(query = '') {
  if (!query) return null
  // استخرج أسماء الفرق من الاستعلام بمطابقة WC2026_TEAM_GROUP_MAP
  const foundTeams = []
  const q = query.trim()
  for (const teamName of Object.keys(WC2026_TEAM_GROUP_MAP)) {
    // فقط أسماء عربية (تفادي مفاتيح الـ English المكررة)
    if (/[\u0600-\u06FF]/.test(teamName) && q.includes(teamName)) {
      if (!foundTeams.includes(teamName)) foundTeams.push(teamName)
    }
  }
  if (foundTeams.length < 2) return null
  // خذ أول فريقَين مذكورَين في الاستعلام
  const t1 = foundTeams[0]
  const t2 = foundTeams[1]
  const response = buildWC2026MatchVsResponse(t1, t2)
  if (!response) return null
  return { team1: t1, team2: t2, response }
}
