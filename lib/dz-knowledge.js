/**
 * lib/dz-knowledge.js — قاعدة المعرفة الجزائرية الثابتة
 * Anti-Hallucination Knowledge Base for DZ Agent
 *
 * يُغطي:
 *   - رؤساء الجزائر (1962 → الآن)
 *   - رؤساء الحكومة الجزائريين
 *   - القادة الحاليون للعالم (2025-2026)
 *   - الولايات الجزائرية الـ58 الحقيقية
 *   - الأحداث الوهمية المعروفة
 *   - الأماكن الوهمية المعروفة
 *   - دوال البحث والتحقق
 */

// ══════════════════════════════════════════════════════════════════════════════
// رؤساء الجزائر (1962 → الآن) — بالترتيب الزمني
// ══════════════════════════════════════════════════════════════════════════════
export const DZ_PRESIDENTS = [
  {
    name: 'أحمد بن بلة',
    name_fr: 'Ahmed Ben Bella',
    startYear: 1962, endYear: 1965,
    startMs: Date.UTC(1962, 8, 15),  // 15 Sep 1962
    endMs:   Date.UTC(1965, 5, 19),  // 19 Jun 1965
    notes: 'أول رئيس للجزائر المستقلة، أُطيح به في انقلاب عسكري بقيادة بومدين'
  },
  {
    name: 'هواري بومدين',
    name_fr: 'Houari Boumédiène',
    startYear: 1965, endYear: 1978,
    startMs: Date.UTC(1965, 5, 19),
    endMs:   Date.UTC(1978, 11, 27), // 27 Dec 1978
    notes: 'رئيس مجلس الثورة ثم رئيس الجمهورية، توفي في منصبه'
  },
  {
    name: 'رابح بيطاط',
    name_fr: 'Rabah Bitat',
    startYear: 1978, endYear: 1979,
    startMs: Date.UTC(1978, 11, 27),
    endMs:   Date.UTC(1979, 1, 9),   // 9 Feb 1979
    notes: 'رئيس مؤقت بعد وفاة بومدين'
  },
  {
    name: 'الشاذلي بن جديد',
    name_fr: 'Chadli Bendjedid',
    startYear: 1979, endYear: 1992,
    startMs: Date.UTC(1979, 1, 9),
    endMs:   Date.UTC(1992, 0, 11),  // 11 Jan 1992
    notes: 'استقال في يناير 1992 إثر أزمة الانتخابات'
  },
  {
    name: 'محمد بوضياف',
    name_fr: 'Mohamed Boudiaf',
    startYear: 1992, endYear: 1992,
    startMs: Date.UTC(1992, 0, 16),
    endMs:   Date.UTC(1992, 5, 29),  // 29 Jun 1992
    notes: 'رئيس المجلس الأعلى للدولة، اغتيل في جوان 1992'
  },
  {
    name: 'علي كافي',
    name_fr: 'Ali Kafi',
    startYear: 1992, endYear: 1994,
    startMs: Date.UTC(1992, 6, 2),
    endMs:   Date.UTC(1994, 0, 31),
    notes: 'رئيس المجلس الأعلى للدولة'
  },
  {
    name: 'اليامين زروال',
    name_fr: 'Liamine Zéroual',
    startYear: 1994, endYear: 1999,
    startMs: Date.UTC(1994, 0, 31),
    endMs:   Date.UTC(1999, 3, 27),
    notes: 'انتُخب عام 1995، استقال قبل نهاية ولايته'
  },
  {
    name: 'عبد العزيز بوتفليقة',
    name_fr: 'Abdelaziz Bouteflika',
    startYear: 1999, endYear: 2019,
    startMs: Date.UTC(1999, 3, 27),
    endMs:   Date.UTC(2019, 3, 2),   // 2 Apr 2019
    notes: 'استقال في أبريل 2019 تحت ضغط الحراك الشعبي بعد 20 سنة في السلطة'
  },
  {
    name: 'عبد القادر بن صالح',
    name_fr: 'Abdelkader Bensalah',
    startYear: 2019, endYear: 2019,
    startMs: Date.UTC(2019, 3, 9),
    endMs:   Date.UTC(2019, 11, 19),
    notes: 'رئيس مؤقت لحين انتخاب الرئيس الجديد'
  },
  {
    name: 'عبد المجيد تبون',
    name_fr: 'Abdelmadjid Tebboune',
    startYear: 2019, endYear: null,
    startMs: Date.UTC(2019, 11, 19),
    endMs:   null,
    notes: 'الرئيس الحالي للجمهورية الجزائرية، انتُخب ديسمبر 2019، وأُعيد انتخابه سبتمبر 2024'
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// رؤساء الحكومة الجزائريين (وزراء أول) — مختصر للأحقاب الرئيسية
// ══════════════════════════════════════════════════════════════════════════════
export const DZ_PRIME_MINISTERS = [
  { name: 'أحمد بن بيتور',        startYear: 1999, endYear: 2000 },
  { name: 'علي بن فليس',           startYear: 2000, endYear: 2003 },
  { name: 'أحمد أويحيى',           startYear: 2003, endYear: 2006 },
  { name: 'عبد العزيز بلخادم',     startYear: 2006, endYear: 2008 },
  { name: 'أحمد أويحيى',           startYear: 2008, endYear: 2012 },
  { name: 'عبد المالك سلال',       startYear: 2012, endYear: 2017 },
  { name: 'أحمد أويحيى',           startYear: 2017, endYear: 2019 },
  { name: 'نور الدين بدوي',        startYear: 2019, endYear: 2019 },
  { name: 'عبد العزيز جراد',       startYear: 2019, endYear: 2021 },
  { name: 'أيمن بن عبد الرحمان',  startYear: 2021, endYear: null  },
]

// ══════════════════════════════════════════════════════════════════════════════
// وزراء الخارجية الجزائريين (آخر المعروفين)
// ══════════════════════════════════════════════════════════════════════════════
export const DZ_FOREIGN_MINISTERS = [
  { name: 'أحمد عطاف', startYear: 2021, endYear: null, notes: 'وزير الشؤون الخارجية الحالي (2026)' },
]

// ══════════════════════════════════════════════════════════════════════════════
// حقائق رياضية ثابتة — لمنع الهلوسة من بيانات التدريب القديمة
// ══════════════════════════════════════════════════════════════════════════════
export const DZ_SPORTS_STATIC_FACTS = {
  mahrez: {
    name: 'رياض محرز',
    name_fr: 'Riyad Mahrez',
    currentClub: 'القادسية',
    currentClub_fr: 'Al-Qadsiah',
    currentClubLeague: 'دوري روشن السعودي للمحترفين',
    leftManCity: 2023,
    notes: 'انتقل من مانشستر سيتي إلى نادي القادسية السعودي في صيف 2023. هو لا يلعب في مانشستر سيتي منذ 2023.',
  },
  // BUG-4 FIX: حقائق الأندية الجزائرية الثابتة — منع هلوسة الأندية الأجنبية
  algerian_clubs: {
    'شبيبة القبائل': {
      name_ar: 'شبيبة القبائل',
      name_fr: 'Jeunesse Sportive de Kabylie',
      abbr: 'JSK',
      founded: 1946,
      city: 'تيزي وزو',
      stadium: 'ملعب 1 نوفمبر 1954',
      titles_ligue1: 14,
      titles_can: 2, // دوري أبطال أفريقيا (CAF Champions League)
      colors: 'الأصفر والأخضر',
      notes: 'أكثر الأندية الجزائرية تتويجاً على المستوى القاري.',
    },
    'مولودية الجزائر': {
      name_ar: 'مولودية الجزائر',
      name_fr: 'Mouloudia Club d\'Alger',
      abbr: 'MCA',
      founded: 1921,
      city: 'الجزائر العاصمة',
      stadium: 'ملعب 5 جويلية 1962',
      titles_ligue1: 8,
      colors: 'الأحمر والأخضر',
      notes: 'أقدم نادٍ جزائري، تأسس عام 1921.',
    },
    'اتحاد العاصمة': {
      name_ar: 'اتحاد العاصمة',
      name_fr: 'Union Sportive de la Médina d\'Alger',
      abbr: 'USMA',
      founded: 1937,
      city: 'الجزائر العاصمة',
      stadium: 'ملعب عمر حمادي (بولوغين)',
      titles_ligue1: 10,
      colors: 'الأحمر والأسود',
    },
    'شباب بلوزداد': {
      name_ar: 'شباب بلوزداد',
      name_fr: 'Chabab de Belouizdad',
      abbr: 'CRB',
      founded: 1918,
      city: 'الجزائر العاصمة',
      stadium: 'ملعب 20 أغسطس 1955',
      titles_ligue1: 9,
      colors: 'الأحمر والأبيض',
      notes: 'أقدم نادٍ جزائري لا يزال نشطاً، تأسس عام 1918.',
    },
    'وفاق سطيف': {
      name_ar: 'وفاق سطيف',
      name_fr: 'Entente Sportive de Sétif',
      abbr: 'ESS',
      founded: 1958,
      city: 'سطيف',
      titles_ligue1: 8,
      titles_can: 2,
      colors: 'الأصفر والأسود',
    },
  },
}

// ══════════════════════════════════════════════════════════════════════════════
// قاعدة بيانات اللاعبين العالميين — موسم 2025/2026
// Anti-Hallucination: منع الخلط بين الأندية القديمة والحالية
// ══════════════════════════════════════════════════════════════════════════════
export const GLOBAL_PLAYERS_DB = [
  {
    nameAr: 'رياض محرز',
    nameFr: 'Riyad Mahrez',
    nationality: 'الجزائر 🇩🇿',
    position: 'جناح / مهاجم',
    currentClub: 'القادسية',
    currentClub_fr: 'Al-Qadsiah',
    league: 'دوري روشن السعودي للمحترفين 🇸🇦',
    since: 2023,
    previousClub: 'مانشستر سيتي',
    keywords: ['محرز', 'mahrez', 'riyad', 'ريا'],
    wrongClubes: ['مانشستر سيتي', 'أستون فيلا', 'ليستر', 'ليفربول', 'الأهلي', 'الهلال', 'النصر'],
    note: 'انتقل من مانشستر سيتي إلى القادسية السعودي في صيف 2023 — لم يعد في مانشستر سيتي منذ ذلك الحين',
  },
  {
    nameAr: 'محمد صلاح',
    nameFr: 'Mohamed Salah',
    nationality: 'مصر 🇪🇬',
    position: 'جناح / مهاجم',
    currentClub: 'ليفربول',
    currentClub_fr: 'Liverpool FC',
    league: 'الدوري الإنجليزي الممتاز 🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    since: 2017,
    previousClub: 'روما',
    keywords: ['صلاح', 'محمد صلاح', 'salah', 'mo salah', 'محمد سالح'],
    wrongClubes: ['ريال مدريد', 'برشلونة', 'تشيلسي', 'الهلال', 'النصر'],
    note: 'يواصل اللعب مع ليفربول — قائد الفريق وأفضل هداف الدوري الإنجليزي في مواسم متعددة',
  },
  {
    nameAr: 'كيليان مبابي',
    nameFr: 'Kylian Mbappé',
    nationality: 'فرنسا 🇫🇷',
    position: 'مهاجم / جناح',
    currentClub: 'ريال مدريد',
    currentClub_fr: 'Real Madrid CF',
    league: 'الدوري الإسباني (لا ليغا) 🇪🇸',
    since: 2024,
    previousClub: 'باريس سان جيرمان',
    keywords: ['مبابي', 'كيليان', 'mbappe', 'mbappé', 'كيليان مبابي'],
    wrongClubes: ['باريس سان جيرمان', 'PSG', 'ليفربول', 'مانشستر سيتي'],
    note: 'انتقل من PSG إلى ريال مدريد صيف 2024 مجاناً — الآن نجم ريال مدريد',
  },
  {
    nameAr: 'إرلينغ هالاند',
    nameFr: 'Erling Haaland',
    nationality: 'النرويج 🇳🇴',
    position: 'مهاجم',
    currentClub: 'مانشستر سيتي',
    currentClub_fr: 'Manchester City FC',
    league: 'الدوري الإنجليزي الممتاز 🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    since: 2022,
    previousClub: 'بوروسيا دورتموند',
    keywords: ['هالاند', 'إرلينغ', 'haaland', 'erling', 'هالند'],
    wrongClubes: ['دورتموند', 'ريال مدريد', 'برشلونة'],
    note: 'هالاند لا يزال في مانشستر سيتي — هداف خطير جداً في الدوري الإنجليزي',
  },
  {
    nameAr: 'كريم بنزيمة',
    nameFr: 'Karim Benzema',
    nationality: 'فرنسا 🇫🇷',
    position: 'مهاجم',
    currentClub: 'الاتحاد',
    currentClub_fr: 'Al-Ittihad Club',
    league: 'دوري روشن السعودي للمحترفين 🇸🇦',
    since: 2023,
    previousClub: 'ريال مدريد',
    keywords: ['بنزيمة', 'كريم', 'benzema', 'karim benzema', 'بنزيما'],
    wrongClubes: ['ريال مدريد', 'مانشستر سيتي', 'PSG', 'الهلال', 'النصر'],
    note: 'انتقل من ريال مدريد إلى الاتحاد السعودي صيف 2023 — فائز بجائزة Ballon dOr 2022',
  },
  {
    nameAr: 'كريستيانو رونالدو',
    nameFr: 'Cristiano Ronaldo',
    nationality: 'البرتغال 🇵🇹',
    position: 'مهاجم',
    currentClub: 'النصر',
    currentClub_fr: 'Al-Nassr FC',
    league: 'دوري روشن السعودي للمحترفين 🇸🇦',
    since: 2023,
    previousClub: 'مانشستر يونايتد',
    keywords: ['رونالدو', 'كريستيانو', 'ronaldo', 'cr7', 'cristiano'],
    wrongClubes: ['يوفنتوس', 'مانشستر يونايتد', 'ريال مدريد', 'PSG'],
    note: 'يلعب في النصر السعودي منذ يناير 2023 — قدّم أداءات قوية في الدوري السعودي',
  },
  {
    nameAr: 'نيمار جونيور',
    nameFr: 'Neymar Jr.',
    nationality: 'البرازيل 🇧🇷',
    position: 'مهاجم / جناح',
    currentClub: 'الهلال',
    currentClub_fr: 'Al-Hilal FC',
    league: 'دوري روشن السعودي للمحترفين 🇸🇦',
    since: 2023,
    previousClub: 'باريس سان جيرمان',
    keywords: ['نيمار', 'neymar', 'njr', 'نيمار جونيور'],
    wrongClubes: ['PSG', 'باريس سان جيرمان', 'برشلونة', 'سانتوس'],
    note: 'انتقل من PSG إلى الهلال السعودي صيف 2023 — عانى من إصابة طويلة لكنه في الهلال',
  },
  {
    nameAr: 'لامين يامال',
    nameFr: 'Lamine Yamal',
    nationality: 'إسبانيا 🇪🇸',
    position: 'جناح / مهاجم',
    currentClub: 'برشلونة',
    currentClub_fr: 'FC Barcelona',
    league: 'الدوري الإسباني (لا ليغا) 🇪🇸',
    since: 2024,
    previousClub: 'برشلونة (الأكاديمية)',
    keywords: ['يامال', 'لامين', 'yamal', 'lamine yamal', 'لامين يامال'],
    wrongClubes: ['ريال مدريد', 'مانشستر سيتي', 'PSG'],
    note: 'موهبة برشلونة الاستثنائية — أصغر لاعب يسجل في تاريخ يورو 2024',
  },
  {
    nameAr: 'جود بيلينغهام',
    nameFr: 'Jude Bellingham',
    nationality: 'إنجلترا 🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    position: 'وسط / مهاجم',
    currentClub: 'ريال مدريد',
    currentClub_fr: 'Real Madrid CF',
    league: 'الدوري الإسباني (لا ليغا) 🇪🇸',
    since: 2023,
    previousClub: 'بوروسيا دورتموند',
    keywords: ['بيلينغهام', 'جود', 'bellingham', 'jude bellingham', 'بيلنغهام'],
    wrongClubes: ['دورتموند', 'برشلونة', 'ليفربول', 'مانشستر سيتي'],
    note: 'انتقل من دورتموند إلى ريال مدريد صيف 2023 — نجم الريال الأبرز حالياً',
  },
  {
    nameAr: 'ياسين بونو',
    nameFr: 'Yassine Bounou (Bono)',
    nationality: 'المغرب 🇲🇦',
    position: 'حارس مرمى',
    currentClub: 'الهلال',
    currentClub_fr: 'Al-Hilal FC',
    league: 'دوري روشن السعودي للمحترفين 🇸🇦',
    since: 2023,
    previousClub: 'إشبيلية',
    keywords: ['بونو', 'ياسين', 'bono', 'bounou', 'ياسين بونو'],
    wrongClubes: ['إشبيلية', 'برشلونة', 'ريال مدريد'],
    note: 'بطل كأس العالم 2022 مع المغرب — انتقل من إشبيلية إلى الهلال السعودي صيف 2023',
  },
  {
    nameAr: 'إسلام سليماني',
    nameFr: 'Islam Slimani',
    nationality: 'الجزائر 🇩🇿',
    position: 'مهاجم',
    currentClub: 'متقاعد',
    currentClub_fr: 'Retired',
    league: 'متقاعد',
    since: 2024,
    previousClub: 'مولودية الجزائر',
    keywords: ['سليماني', 'إسلام', 'slimani', 'islam slimani', 'اسلام'],
    wrongClubes: ['ليستر', 'موناكو', 'ليون', 'أستون فيلا'],
    note: 'أعلن اعتزاله كرة القدم الاحترافية في 2024 — أفضل هداف في تاريخ المنتخب الجزائري',
  },
  {
    nameAr: 'بديع بن رحمة',
    nameFr: 'Badis Benrahma',
    nationality: 'الجزائر 🇩🇿',
    position: 'جناح / مهاجم',
    currentClub: 'ليون',
    currentClub_fr: 'Olympique Lyonnais',
    league: 'الدوري الفرنسي (ليغ 1) 🇫🇷',
    since: 2024,
    previousClub: 'وست هام يونايتد',
    keywords: ['بن رحمة', 'بنرحمة', 'benrahma', 'saïd benrahma', 'سعيد بن رحمة', 'بنراحمة'],
    wrongClubes: ['وست هام', 'برينتفورد', 'نيس'],
    note: 'انتقل من وست هام إلى ليون الفرنسي — لاعب دولي جزائري متميز',
  },
]

// البحث عن لاعب في قاعدة البيانات
export function findPlayerClub(query) {
  const lq = query.toLowerCase()
  for (const player of GLOBAL_PLAYERS_DB) {
    if (player.keywords.some(k => lq.includes(k.toLowerCase()))) {
      return player
    }
  }
  return null
}

// البحث السريع عن نادٍ جزائري بالاسم
export function findAlgerianClub(query) {
  const clubs = DZ_SPORTS_STATIC_FACTS.algerian_clubs
  for (const [key, club] of Object.entries(clubs)) {
    if (query.includes(key) || query.includes(club.abbr) ||
        (club.name_fr && query.toLowerCase().includes(club.name_fr.toLowerCase()))) {
      return club
    }
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// كيانات مستحيلة — الجزائر جمهورية / إفريقيا ليس لها رئيس موحد
// ══════════════════════════════════════════════════════════════════════════════
// قائمة الدول الجمهورية الكبرى التي لا يوجد فيها ملك
const _REPUBLIC_COUNTRIES_AR = [
  'أمريكا','الولايات المتحدة','فرنسا','ألمانيا','إيطاليا','البرتغال','اليونان',
  'كندا','أستراليا','البرازيل','الأرجنتين','المكسيك','الصين','روسيا','الهند',
  'سويسرا','النمسا','بولندا','فنلندا','السويد','النرويج','الدنمارك',
  'هولندا','بلجيكا','إيران','العراق','تونس','مصر','الجزائر','موريتانيا',
  'نيجيريا','كينيا','جنوب إفريقيا','تركيا','كوريا','اليابان',
].join('|')

const _REPUBLIC_KING_PATTERN = new RegExp(
  `(?:من\\s+هو\\s+|شكون\\s+(?:هو\\s+)?)?(?:ال)?ملك\\s+(?:ال)?(?:${_REPUBLIC_COUNTRIES_AR})`,
  'i'
)

// القارات — ليس لها عاصمة
const _CONTINENT_CAPITAL_PATTERN = /(?:عاصمة|capital\s+of)\s+(?:ال)?(?:إفريقيا|أفريقيا|أوروبا|آسيا|أمريكا\s*(?:الشمالية|الجنوبية|اللاتينية)?|أوقيانوسيا|أنتاركتيكا)/i

export const IMPOSSIBLE_DZ_ENTITIES = [
  {
    pattern: /(?:من\s+هو\s+|شكون\s+(?:هو\s+)?)?(?:ال)?ملك\s+(?:ال)?جزائر|(?:ال)?سلطان\s+(?:ال)?جزائر|(?:ال)?أمير\s+(?:ال)?جزائر/i,
    response: [
      `## 🇩🇿 الجزائر جمهورية — لا يوجد ملك`,
      ``,
      `**الجزائر لا يحكمها ملك أو سلطان أو أمير.**`,
      ``,
      `الجزائر **جمهورية ديمقراطية شعبية** منذ استقلالها عام 1962.`,
      `الرئيس الحالي هو **عبد المجيد تبون** (انتُخب عام 2019، وأُعيد انتخابه عام 2024).`,
      ``,
      `📚 **المصدر:** الدستور الجزائري — حقيقة دستورية ثابتة`,
    ].join('\n'),
  },
  {
    pattern: /(?:من\s+هو\s+|شكون\s+(?:هو\s+)?)?رئيس\s+(?:ال)?(?:إفريقيا|أفريقيا)(?:\s+(?:حاليا?|الحالي|الآن|درك|دروك))?/i,
    response: [
      `## ℹ️ لا يوجد "رئيس لإفريقيا"`,
      ``,
      `**إفريقيا قارة تضم 55 دولة مستقلة — لا توجد رئاسة موحدة للقارة.**`,
      ``,
      `ما يوجد هو **رئيس الاتحاد الأفريقي (AU)**، وهو منصب دوري يتولاه أحد رؤساء الدول الأعضاء لمدة سنة — وليس شخصاً يحكم إفريقيا كلها.`,
      ``,
      `> اسألني عن رئيس **دولة أفريقية** بعينها وسأجيبك.`,
    ].join('\n'),
  },
  {
    pattern: _REPUBLIC_KING_PATTERN,
    response: null, // سيُبنى ديناميكياً حسب الدولة
    dynamic: true,
    buildResponse: (text) => {
      const m = text.match(new RegExp(`ملك\\s+(?:ال)?(${_REPUBLIC_COUNTRIES_AR})`, 'i'))
      const country = m?.[1] || 'هذه الدولة'
      return [
        `## ℹ️ ${country} جمهورية — لا يوجد ملك`,
        ``,
        `**${country} دولة جمهورية يحكمها رئيس أو رئيس وزراء — لا يوجد فيها ملك.**`,
        ``,
        `> اسألني عن **رئيس** ${country} وسأجيبك.`,
      ].join('\n')
    },
  },
  {
    pattern: _CONTINENT_CAPITAL_PATTERN,
    response: null,
    dynamic: true,
    buildResponse: (text) => {
      const m = text.match(/(?:إفريقيا|أفريقيا|أوروبا|آسيا|أمريكا|أوقيانوسيا)/i)
      const continent = m?.[0] || 'هذه القارة'
      return [
        `## ℹ️ القارات ليس لها عاصمة`,
        ``,
        `**${continent} قارة وليست دولة — لا توجد "عاصمة لـ${continent}".**`,
        ``,
        `القارات تضم دولاً متعددة، كل منها عاصمتها الخاصة.`,
        ``,
        `> اسألني عن عاصمة **دولة** بعينها وسأجيبك.`,
      ].join('\n')
    },
  },
]

/**
 * هل يتعلق السؤال بكيان مستحيل؟
 * يُعيد { response } أو null
 */
export function isImpossibleDZEntity(text) {
  const match = IMPOSSIBLE_DZ_ENTITIES.find(e => e.pattern.test(text))
  if (!match) return null
  if (match.dynamic) return { response: match.buildResponse(text) }
  return match
}

// ══════════════════════════════════════════════════════════════════════════════
// كشف الولايات الوهمية — أي ولاية غير موجودة في الـ58 الرسمية
// ══════════════════════════════════════════════════════════════════════════════
export function isUnknownWilayaQuery(text) {
  const m = text.match(/(?:ولاية|في\s+ولاية|عن\s+ولاية|بولاية)\s+([\u0621-\u064A\s]{3,25})/i)
  if (!m) return null
  const raw = m[1].trim().replace(/[؟?!،,.\s]+$/, '')
  const clean = raw.replace(/^(ال)/, '')
  for (const real of REAL_DZ_WILAYAS) {
    if (real.includes(clean) || clean.includes(real)) return null
  }
  if (clean.length < 3) return null
  return raw
}

// ══════════════════════════════════════════════════════════════════════════════
// كشف الضمائر السياقية بالدارجة — "وين راه يلعب" بلا مرجع سابق
// ══════════════════════════════════════════════════════════════════════════════
export const DARIJA_CONTEXT_PRONOUN_PATTERNS = [
  /^(?:وين\s+راه?\s+يلعب|وين\s+يلعب\s+دوكا?|وين\s+راه?\s+يلعب\s+دوكا?)\s*[؟?]?\s*$/i,
  /^(?:شحال\s+عمره?|شحال\s+عندو|كم\s+عمره?)\s*[؟?]?\s*$/i,
  /^(?:شكون\s+هذا|من\s+هذا|من\s+هو\s+هذا)\s*[؟?]?\s*$/i,
  /^(?:علاه\s+راه?\s+مشهور|علاه\s+مشهور|لماذا\s+هو\s+مشهور)\s*[؟?]?\s*$/i,
  /^(?:فاش\s+يخدم|بماذا\s+يعمل|شنو\s+يخدم)\s*[؟?]?\s*$/i,
  /^(?:وين\s+جاية?|من\s+أين\s+(?:هو|هي)|منين\s+(?:جاي|جاية))\s*[؟?]?\s*$/i,
  /^(?:قداش\s+تبعد|كم\s+تبعد|قداش\s+بعيدة?)\s*[؟?]?\s*$/i,
  /^(?:كيفاش\s+نروح\s+(?:لها|له|ليها)|كيف\s+أذهب\s+إليها?)\s*[؟?]?\s*$/i,
]

export function isDarijaContextPronouns(text) {
  const t = text.trim()
  return DARIJA_CONTEXT_PRONOUN_PATTERNS.some(p => p.test(t))
}

// ══════════════════════════════════════════════════════════════════════════════
// قادة العالم الحاليون (2025-2026)
// ══════════════════════════════════════════════════════════════════════════════
export const WORLD_LEADERS_2026 = {
  'الأمم المتحدة': {
    ar: 'أنطونيو غوتيريش', fr: 'António Guterres',
    role_ar: 'الأمين العام للأمم المتحدة',
    since: 2017, notes: 'ولايته الثانية حتى 2026'
  },
  'الولايات المتحدة': {
    ar: 'دونالد ترامب', fr: 'Donald Trump',
    role_ar: 'الرئيس الـ47 للولايات المتحدة',
    since: 2025, notes: 'الولاية الثانية — تولى يناير 2025'
  },
  'فرنسا': {
    ar: 'إيمانويل ماكرون', fr: 'Emmanuel Macron',
    role_ar: 'رئيس الجمهورية الفرنسية',
    since: 2017, notes: 'في ولايته الثانية (2022-2027)'
  },
  'المغرب': {
    ar: 'الملك محمد السادس', fr: 'Mohammed VI',
    role_ar: 'ملك المغرب',
    since: 1999, notes: 'ملك المغرب منذ وفاة والده الملك الحسن الثاني'
  },
  'تونس': {
    ar: 'قيس سعيد', fr: 'Kaïs Saïed',
    role_ar: 'رئيس الجمهورية التونسية',
    since: 2019, notes: 'يتولى الحكم منذ 2019'
  },
  'مصر': {
    ar: 'عبد الفتاح السيسي', fr: 'Abdel Fattah el-Sissi',
    role_ar: 'رئيس جمهورية مصر العربية',
    since: 2014
  },
  'المملكة العربية السعودية': {
    ar: 'الملك سلمان بن عبد العزيز', fr: 'Salman ben Abdelaziz',
    role_ar: 'خادم الحرمين الشريفين ملك المملكة العربية السعودية',
    since: 2015
  },
  'تركيا': {
    ar: 'رجب طيب أردوغان', fr: 'Recep Tayyip Erdoğan',
    role_ar: 'رئيس الجمهورية التركية',
    since: 2014
  },
  'ألمانيا': {
    ar: 'فريدريش ميرتس', fr: 'Friedrich Merz',
    role_ar: 'المستشار الألماني',
    since: 2025
  },
  'المملكة المتحدة': {
    ar: 'كير ستارمر', fr: 'Keir Starmer',
    role_ar: 'رئيس وزراء المملكة المتحدة',
    since: 2024
  },
}

// رؤساء سابقون للعالم
export const WORLD_FORMER_LEADERS = {
  'فرنسا': [
    { ar: 'فرانسوا هولاند', endYear: 2017, notes: 'قبل ماكرون مباشرة' },
    { ar: 'نيكولا ساركوزي', startYear: 2007, endYear: 2012 },
    { ar: 'جاك شيراك', startYear: 1995, endYear: 2007 },
  ],
  'الولايات المتحدة': [
    { ar: 'جو بايدن', startYear: 2021, endYear: 2025, notes: 'قبل ترامب الثانية مباشرة' },
    { ar: 'دونالد ترامب', startYear: 2017, endYear: 2021, notes: 'الولاية الأولى' },
    { ar: 'باراك أوباما', startYear: 2009, endYear: 2017 },
    { ar: 'جورج بوش الابن', startYear: 2001, endYear: 2009 },
    { ar: 'بيل كلينتون', startYear: 1993, endYear: 2001 },
  ],
}

// ══════════════════════════════════════════════════════════════════════════════
// الولايات الجزائرية الـ58 الحقيقية
// ══════════════════════════════════════════════════════════════════════════════
export const REAL_DZ_WILAYAS = new Set([
  'أدرار', 'الشلف', 'الأغواط', 'أم البواقي', 'باتنة', 'بجاية', 'بسكرة', 'بشار',
  'البليدة', 'البويرة', 'تمنراست', 'تبسة', 'تلمسان', 'تيارت', 'تيزي وزو', 'الجزائر',
  'الجلفة', 'جيجل', 'سطيف', 'سعيدة', 'سكيكدة', 'سيدي بلعباس', 'عنابة', 'قالمة',
  'قسنطينة', 'المدية', 'مستغانم', 'المسيلة', 'معسكر', 'ورقلة', 'وهران', 'البيض',
  'إليزي', 'برج بوعريريج', 'بومرداس', 'الطارف', 'تندوف', 'تسمسيلت', 'الوادي',
  'خنشلة', 'سوق أهراس', 'تيبازة', 'ميلة', 'عين الدفلى', 'النعامة', 'عين تموشنت',
  'غرداية', 'غليزان',
  // الولايات الجديدة (2019)
  'تيميمون', 'برج باجي مختار', 'أولاد جلال', 'بني عباس', 'عين صالح',
  'عين قزام', 'تقرت', 'جانت', 'المغير', 'المنيعة',
])

// ══════════════════════════════════════════════════════════════════════════════
// أنماط الأحداث الوهمية المعروفة
// ══════════════════════════════════════════════════════════════════════════════
export const FICTIONAL_DZ_EVENT_PATTERNS = [
  /ثورة الجزائر الثانية/i,
  /حرب.{0,20}(البرتغال|المكسيك|كندا|البرازيل|الهند|اليابان|كوريا).{0,20}(الجزائر|جزائرية?)/i,
  /(الجزائر|جزائرية?).{0,20}حرب.{0,20}(البرتغال|المكسيك|كندا|البرازيل|الهند)/i,
  /معاهدة وهران.{0,30}(20\d{2}|1[89]\d{2})/i,
  /معاهدة.{0,20}(وهران|قسنطينة|الجزائر).{0,30}(كندا|البرازيل|المكسيك|اليابان)/i,
  /انقلاب الجزائر.{0,10}(202[2-9]|203\d)/i,
  /الجزائر.*ضد.*(البرازيل|الأرجنتين|ألمانيا|إيطاليا).*(نهائي|كأس العالم)/i,
  /(نهائي|كأس العالم).*(الجزائر.*البرازيل|البرازيل.*الجزائر)/i,
]

// أماكن وهمية متكررة
export const FICTIONAL_DZ_PLACES = [
  { pattern: /مدينة الزمرد/i, reason: 'لا توجد مدينة بهذا الاسم في الجزائر' },
  { pattern: /ولاية عين النور/i, reason: '"عين النور" ليست من بين الولايات الجزائرية الـ58' },
  { pattern: /مدينة الشروق العظمى/i, reason: '"الشروق العظمى" ليست مدينة — الشروق منطقة سكنية في الجزائر العاصمة' },
  { pattern: /مطار الأمير خالد الدولي/i, reason: 'لا يوجد مطار بهذا الاسم في الجزائر' },
  { pattern: /مطار الأمير (سعيد|ناصر|فارس) الدولي/i, reason: 'لا يوجد مطار جزائري بهذا الاسم' },
]

// ══════════════════════════════════════════════════════════════════════════════
// دوال البحث والتحقق
// ══════════════════════════════════════════════════════════════════════════════

/**
 * يعيد رئيس الجزائر في سنة معينة
 * @param {number} year
 * @returns {object|null} — رئيس أو { error: 'pre_independence' }
 */
export function getAlgeriaPresidentByYear(year) {
  const y = parseInt(year)
  if (isNaN(y)) return null
  if (y < 1962) return { error: 'pre_independence', year: y }
  const now = new Date().getFullYear()
  if (y > now) return { error: 'future', year: y }

  // إذا كانت السنة 1978، هواري بومدين مات في ديسمبر — نعيده هو (حكم معظم العام)
  const matches = DZ_PRESIDENTS.filter(p => {
    const startY = p.startYear
    const endY = p.endYear ?? (now + 1)
    return y >= startY && y < endY
  })

  if (matches.length === 0) return null
  // إذا كانت هناك رؤساء متعددون في نفس العام (تحول)، نعيد الأهم
  return matches[matches.length - 1]
}

/**
 * يعيد رئيس الحكومة في سنة معينة
 */
export function getAlgeriaPMByYear(year) {
  const y = parseInt(year)
  if (isNaN(y)) return null
  if (y < 1962) return { error: 'pre_independence', year: y }
  const now = new Date().getFullYear()
  if (y > now) return { error: 'future', year: y }

  const matches = DZ_PRIME_MINISTERS.filter(p => {
    const startY = p.startYear
    const endY = p.endYear ?? (now + 1)
    return y >= startY && y <= endY
  })
  return matches.length > 0 ? matches[matches.length - 1] : null
}

/**
 * يعيد الرئيس السابق (قبل شخص معين)
 */
export function getAlgeriaPredecessor(name) {
  const norm = (s) => s.replace(/\s+/g, ' ').trim()
  const idx = DZ_PRESIDENTS.findIndex(p =>
    norm(p.name).includes(norm(name)) || norm(name).includes(norm(p.name))
  )
  if (idx <= 0) return null
  return DZ_PRESIDENTS[idx - 1]
}

/**
 * هل السنة مستقبلية؟
 */
export function isFutureYear(year) {
  return parseInt(year) > new Date().getFullYear()
}

/**
 * هل الحدث المذكور وهمي؟
 */
export function isFictionalDZEvent(text) {
  return FICTIONAL_DZ_EVENT_PATTERNS.find(p => p.test(text)) || null
}

/**
 * هل المكان وهمي؟
 */
export function isFictionalDZPlace(text) {
  return FICTIONAL_DZ_PLACES.find(p => p.pattern.test(text)) || null
}

/**
 * هل الولاية المذكورة موجودة؟
 */
export function isDZWilayaReal(name) {
  const clean = name.replace(/^(ولاية\s+|في\s+|ب)/i, '').trim()
  return REAL_DZ_WILAYAS.has(clean)
}

/**
 * هل هو سؤال ما قبل الاستقلال؟
 */
export function isPreIndependenceQuery(text, year) {
  const y = parseInt(year)
  if (!isNaN(y) && y < 1962) return true
  // أنماط صريحة
  if (/قبل الاستقلال|قبل استقلال الجزائر|إبان الاستعمار|في عهد الاستعمار/i.test(text)) return true
  // سنة قبل 1830 مع ذكر الجزائر
  if (/\b(1[0-7]\d{2}|18[012]\d)\b/.test(text) && /الجزائر|جزائر/i.test(text)) return true
  return false
}

// ══════════════════════════════════════════════════════════════════════════════
// استخراج السنة من رسالة المستخدم
// ══════════════════════════════════════════════════════════════════════════════
export function extractYearFromMessage(msg) {
  // بحث عن أرقام 4 خانات
  const matches = msg.match(/\b(1[5-9]\d{2}|20[0-9]{2})\b/g)
  if (matches) return parseInt(matches[0])
  // تواريخ مكتوبة بالحروف مثل "سنة ألف وتسعمائة..."
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// كشف سؤال الرئيس حسب السنة
// ══════════════════════════════════════════════════════════════════════════════
export function detectPresidentYearQuery(msg) {
  const lq = msg.trim()

  // نمط: "من كان رئيس الجزائر سنة XXXX" / "شكون كان رئيس الجزائر في XXXX"
  const presidentYearRE = /(?:من\s+كان|شكون\s+كان|qui\s+était|quel\s+était)\s+(?:ال)?رئيس\s+(?:ال)?جزائر\s+(?:سنة|في\s+سنة|عام|في\s+عام|يوم)?\s*(\d{4})/i
  const m1 = lq.match(presidentYearRE)
  if (m1) return { type: 'president_year', year: parseInt(m1[1]) }

  // نمط: "رئيس الجزائر سنة 1985"
  const m2 = lq.match(/رئيس\s+(?:ال)?جزائر\s+(?:سنة|في|عام)?\s*(\d{4})/i)
  if (m2) return { type: 'president_year', year: parseInt(m2[1]) }

  // نمط: "من كان رئيس الجزائر قبل تبون"
  if (/(?:من\s+كان|شكون\s+كان)\s+رئيس\s+(?:ال)?جزائر\s+قبل\s+تبون/i.test(lq) ||
      /شكون\s+كان\s+(?:ال)?رئيس\s+قبل\s+تبون/i.test(lq)) {
    return { type: 'president_before', name: 'تبون' }
  }

  // نمط: "من كان رئيس الجزائر قبل عبد المجيد تبون"
  // نستخدم \u0621-\u064A لاستثناء علامات الترقيم العربية (؟ = U+061F)
  const m3 = lq.match(/(?:من\s+كان|شكون\s+كان)\s+رئيس.{0,20}قبل\s+([\u0621-\u064A\s]{3,30})/i)
  if (m3) {
    const _captured = m3[1].trim().replace(/[\s؟?!،,\.]+$/, '')
    if (_captured.length >= 3) return { type: 'president_before', name: _captured }
  }

  // نمط: "من كان رئيس الجزائر قبل بوتفليقة" (fallback صريح)
  if (/قبل\s+بوتفليقة/i.test(lq) && /رئيس/i.test(lq)) {
    return { type: 'president_before', name: 'بوتفليقة' }
  }

  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// كشف سؤال رئيس الحكومة حسب السنة
// ══════════════════════════════════════════════════════════════════════════════
export function detectPMYearQuery(msg) {
  const m = msg.match(/(?:من\s+كان|شكون\s+كان)\s+(?:ال)?وزير\s+الأول|رئيس\s+(?:ال)?حكومة.{0,30}(?:سنة|في|عام)\s*(\d{4})/i)
  if (m && m[1]) return { type: 'pm_year', year: parseInt(m[1]) }
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// ردود جاهزة للأسئلة الثابتة
// ══════════════════════════════════════════════════════════════════════════════

export function buildPresidentYearResponse(year) {
  const result = getAlgeriaPresidentByYear(year)
  if (!result) return null

  if (result.error === 'pre_independence') {
    return [
      `## ⚠️ تصحيح تاريخي`,
      ``,
      `**الجزائر لم تكن دولةً مستقلة عام ${year}.**`,
      ``,
      year >= 1830
        ? `كانت الجزائر في تلك الفترة تحت **الاحتلال الفرنسي** (1830–1962)، ولم يكن لها رئيس جمهورية.`
        : `كانت الجزائر في تلك الفترة إمّا تحت الحكم العثماني أو كيانات تقليدية سابقة.`,
      ``,
      `🗓️ **الاستقلال:** 5 يوليو 1962 — أول رئيس: **أحمد بن بلة** (سبتمبر 1962).`,
      `📚 **المصدر:** حقيقة تاريخية ثابتة`,
    ].join('\n')
  }

  if (result.error === 'future') {
    return `⚠️ **عام ${year} لم يأتِ بعد** — لا يمكنني الإجابة عن أحداث مستقبلية.`
  }

  const current = result.endYear === null
  const endNote = current
    ? `(لا يزال في منصبه حتى الآن)`
    : `(غادر السلطة عام ${result.endYear})`

  return [
    `## 🇩🇿 رئيس الجزائر عام ${year}`,
    ``,
    `**${result.name}** *(${result.name_fr})*`,
    ``,
    `🗓️ تولّى السلطة: **${result.startYear}** — انتهت ولايته: **${result.endYear ?? 'الآن'}** ${endNote}`,
    `📝 ${result.notes}`,
    ``,
  ].join('\n')
}

export function buildPresidentBeforeResponse(name) {
  const predecessor = getAlgeriaPredecessor(name)
  if (!predecessor) return null

  const current = predecessor.endYear === null
  return [
    `## 🇩🇿 الرئيس قبل ${name}`,
    ``,
    `**${predecessor.name}** *(${predecessor.name_fr})*`,
    ``,
    `🗓️ حكم من **${predecessor.startYear}** إلى **${predecessor.endYear ?? 'الآن'}**`,
    `📝 ${predecessor.notes}`,
    ``,
    `⚡ **المصدر:** قاعدة بيانات تاريخية ثابتة`,
  ].join('\n')
}

export function buildPMYearResponse(year) {
  const result = getAlgeriaPMByYear(year)
  if (!result) return null

  if (result.error === 'pre_independence') {
    return `⚠️ **تصحيح تاريخي:** الجزائر لم تكن دولةً مستقلة عام ${year} — لا وجود لرئيس حكومة جزائري في تلك الحقبة.`
  }

  return [
    `## 🇩🇿 رئيس الحكومة الجزائرية عام ${year}`,
    ``,
    `**${result.name}**`,
    ``,
    `🗓️ في منصبه من ${result.startYear} إلى ${result.endYear ?? 'الآن'}`,
    ``,
    `⚡ **المصدر:** قاعدة بيانات ثابتة`,
  ].join('\n')
}
