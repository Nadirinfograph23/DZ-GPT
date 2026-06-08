/**
 * dz-sports-archive.js — أرشيف رياضي شامل لـ DZ-GPT
 * ══════════════════════════════════════════════════════════════════════════════
 * يحتوي على:
 *   ① اللاعبون المشهورون + أنديتهم الحالية (محدّث 2026)
 *   ② تاريخ كأس العالم (كل الأبطال منذ 1930)
 *   ③ تاريخ كأس أمم أفريقيا (AFCON)
 *   ④ تاريخ دوري أبطال أوروبا
 *   ⑤ سجلّات الهداف للمنتخبات
 *   ⑥ دوال البحث السريع
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────────────────────
// § 1 — اللاعبون المشهورون (محدّث حتى 2026)
// ─────────────────────────────────────────────────────────────────────────────

export const FAMOUS_PLAYERS = {
  // ── نجوم عالميون ──────────────────────────────────────────────────────────
  'كريستيانو رونالدو': {
    fullName: 'كريستيانو رونالدو دوس سانتوس أفيرو',
    aliases: ['رونالدو', 'cr7', 'cristiano ronaldo', 'رونالدو كريستيانو'],
    nationality: 'البرتغال',
    flag: '🇵🇹',
    currentClub: 'النصر',
    currentClubEn: 'Al-Nassr',
    currentLeague: 'دوري روشن للمحترفين (السعودية)',
    position: 'مهاجم',
    dob: '5 فبراير 1985',
    transferHistory: [
      { season: '2021-22', from: 'يوفنتوس', to: 'مانشستر يونايتد', type: 'عودة' },
      { season: '2023', from: 'مانشستر يونايتد', to: 'النصر', type: 'انتقال حر', fee: '200 مليون يورو/سنة' },
    ],
    achievements: 'أكثر هداف في تاريخ كرة القدم الدولية (130+ هدف)',
    note: 'وقّع مع النصر السعودي في يناير 2023',
  },
  'ليونيل ميسي': {
    fullName: 'ليونيل أندريس ميسي',
    aliases: ['ميسي', 'messi', 'leo messi', 'الأرجنتيني'],
    nationality: 'الأرجنتين',
    flag: '🇦🇷',
    currentClub: 'إنتر ميامي',
    currentClubEn: 'Inter Miami CF',
    currentLeague: 'دوري MLS (الولايات المتحدة)',
    position: 'مهاجم / صانع ألعاب',
    dob: '24 يونيو 1987',
    transferHistory: [
      { season: '2021', from: 'برشلونة', to: 'باريس سان جيرمان', type: 'انتقال حر' },
      { season: '2023', from: 'باريس سان جيرمان', to: 'إنتر ميامي', type: 'انتقال' },
    ],
    achievements: 'بطل العالم 2022 مع الأرجنتين، 8 جوائز الكرة الذهبية',
    note: 'انتقل لإنتر ميامي في يوليو 2023',
  },
  'كيليان إمبابي': {
    fullName: 'كيليان مبابي لوتان',
    aliases: ['امبابي', 'إمبابي', 'مبابي', 'mbappe', 'mbappé', 'كيليان مبابي'],
    nationality: 'فرنسا',
    flag: '🇫🇷',
    currentClub: 'ريال مدريد',
    currentClubEn: 'Real Madrid',
    currentLeague: 'الدوري الإسباني لالیغا',
    position: 'مهاجم',
    dob: '20 ديسمبر 1998',
    transferHistory: [
      { season: '2022', from: 'باريس سان جيرمان', to: 'باريس سان جيرمان', type: 'تجديد' },
      { season: '2024', from: 'باريس سان جيرمان', to: 'ريال مدريد', type: 'انتقال حر', fee: 'مجاني' },
    ],
    achievements: 'بطل العالم 2018 مع فرنسا، أفضل هداف في تاريخ باريس سان جيرمان',
    note: 'انتقل لريال مدريد في صيف 2024 بعد انتهاء عقده مع باريس سان جيرمان',
  },
  'إرلينج هالاند': {
    fullName: 'إرلينج براوت هالاند',
    aliases: ['هالاند', 'haaland', 'ارلينج', 'هولاند'],
    nationality: 'النرويج',
    flag: '🇳🇴',
    currentClub: 'مانشستر سيتي',
    currentClubEn: 'Manchester City',
    currentLeague: 'الدوري الإنجليزي الممتاز',
    position: 'مهاجم',
    dob: '21 يوليو 2000',
    transferHistory: [
      { season: '2022', from: 'بوروسيا دورتموند', to: 'مانشستر سيتي', type: 'انتقال', fee: '51 مليون يورو' },
    ],
    achievements: 'أسرع لاعب يسجل 50 هدفاً في البريميرليغ، بطل إنجلترا وأبطال أوروبا',
    note: 'يلعب مع مانشستر سيتي منذ 2022',
  },
  'محمد صلاح': {
    fullName: 'محمد صلاح حامد محيي الدين غالي',
    aliases: ['صلاح', 'salah', 'mo salah', 'محمد صلاح'],
    nationality: 'مصر',
    flag: '🇪🇬',
    currentClub: 'ليفربول',
    currentClubEn: 'Liverpool',
    currentLeague: 'الدوري الإنجليزي الممتاز',
    position: 'جناح أيمن / مهاجم',
    dob: '15 يونيو 1992',
    transferHistory: [
      { season: '2017', from: 'روما', to: 'ليفربول', type: 'انتقال', fee: '42 مليون يورو' },
    ],
    achievements: 'أفضل هداف في تاريخ الكرة المصرية، بطل دوري الأبطال 2019',
    note: 'لا يزال يمثل ليفربول منذ 2017',
  },
  'فينيسيوس جونيور': {
    fullName: 'فينيسيوس جوزيه بايو أوليفيرا دي موراييس',
    aliases: ['فينيسيوس', 'vinicius', 'فينيشيوس', 'فيني'],
    nationality: 'البرازيل',
    flag: '🇧🇷',
    currentClub: 'ريال مدريد',
    currentClubEn: 'Real Madrid',
    currentLeague: 'الدوري الإسباني لالیغا',
    position: 'جناح أيسر',
    dob: '12 يوليو 2000',
    transferHistory: [
      { season: '2018', from: 'فلامينغو', to: 'ريال مدريد', type: 'انتقال' },
    ],
    achievements: 'حائز جائزة الكرة الذهبية 2024',
    note: 'يلعب مع ريال مدريد ويعتبر أفضل لاعب في العالم 2024',
  },
  'كيفن دي بروين': {
    fullName: 'كيفن دي بروين',
    aliases: ['دي بروين', 'de bruyne', 'kdb'],
    nationality: 'بلجيكا',
    flag: '🇧🇪',
    currentClub: 'مانشستر سيتي',
    currentClubEn: 'Manchester City',
    currentLeague: 'الدوري الإنجليزي الممتاز',
    position: 'وسط مبدع',
    dob: '28 يونيو 1991',
    transferHistory: [
      { season: '2015', from: 'فولفسبورغ', to: 'مانشستر سيتي', type: 'انتقال', fee: '74 مليون يورو' },
    ],
    achievements: 'أحد أفضل صانعي الألعاب في تاريخ الدوري الإنجليزي',
    note: 'ركيزة مانشستر سيتي',
  },
  'جود بيلينغهام': {
    fullName: 'جود فيكتور وليام بيلينغهام',
    aliases: ['بيلينغهام', 'bellingham', 'بيلنغهام'],
    nationality: 'إنجلترا',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    currentClub: 'ريال مدريد',
    currentClubEn: 'Real Madrid',
    currentLeague: 'الدوري الإسباني لالیغا',
    position: 'وسط هجومي',
    dob: '29 يونيو 2003',
    transferHistory: [
      { season: '2023', from: 'بوروسيا دورتموند', to: 'ريال مدريد', type: 'انتقال', fee: '103 مليون يورو' },
    ],
    achievements: 'أفضل شاب واعد في العالم',
    note: 'انتقل لريال مدريد صيف 2023',
  },
  'نيمار': {
    fullName: 'نيمار دا سيلفا سانتوس جونيور',
    aliases: ['neymar', 'نيمار جونيور'],
    nationality: 'البرازيل',
    flag: '🇧🇷',
    currentClub: 'سانتوس',
    currentClubEn: 'Santos FC',
    currentLeague: 'الدوري البرازيلي',
    position: 'جناح / مهاجم',
    dob: '5 فبراير 1992',
    transferHistory: [
      { season: '2023', from: 'باريس سان جيرمان', to: 'الهلال', type: 'انتقال', fee: '90 مليون يورو' },
      { season: '2025', from: 'الهلال', to: 'سانتوس', type: 'عودة' },
    ],
    achievements: 'أغلى انتقال في تاريخ كرة القدم (222م يورو 2017)',
    note: 'عاد لنادي سانتوس البرازيلي بعد فترة في الهلال السعودي',
  },
  'كريم بنزيمة': {
    fullName: 'كريم مصطفى بنزيمة',
    aliases: ['بنزيمة', 'benzema', 'كريم', 'karim benzema'],
    nationality: 'فرنسا',
    flag: '🇫🇷',
    currentClub: 'الاتحاد',
    currentClubEn: 'Al-Ittihad',
    currentLeague: 'دوري روشن للمحترفين (السعودية)',
    position: 'مهاجم',
    dob: '19 ديسمبر 1987',
    transferHistory: [
      { season: '2009', from: 'ليون', to: 'ريال مدريد', type: 'انتقال', fee: '35 مليون يورو' },
      { season: '2023', from: 'ريال مدريد', to: 'الاتحاد', type: 'انتقال حر' },
    ],
    achievements: 'كرة ذهبية 2022، بطل دوري الأبطال 5 مرات مع ريال مدريد',
    note: 'انتقل للاتحاد السعودي في يونيو 2023',
  },
  'رياض محرز': {
    fullName: 'رياض محرز',
    aliases: ['محرز', 'mahrez', 'ريو', 'riyad mahrez'],
    nationality: 'الجزائر',
    flag: '🇩🇿',
    currentClub: 'الريادة',
    currentClubEn: 'Al-Rayyan SC',
    currentLeague: 'دوري نجوم قطر (قطر)',
    position: 'جناح أيمن',
    dob: '21 فبراير 1991',
    transferHistory: [
      { season: '2015', from: 'ليستر سيتي', to: 'مانشستر سيتي', type: 'انتقال', fee: '60 مليون جنيه' },
      { season: '2023', from: 'مانشستر سيتي', to: 'الريادة', type: 'انتقال' },
    ],
    achievements: 'بطل أفريقيا 2019 مع الجزائر، بطل إنجلترا 4 مرات',
    note: 'أسطورة المنتخب الجزائري، انتقل لقطر في 2023',
  },
  'إسلام سليماني': {
    fullName: 'إسلام سليماني',
    aliases: ['سليماني', 'slimani', 'islam slimani'],
    nationality: 'الجزائر',
    flag: '🇩🇿',
    currentClub: 'متقاعد',
    currentClubEn: 'Retired',
    position: 'مهاجم',
    dob: '18 يونيو 1988',
    transferHistory: [],
    achievements: 'الهداف التاريخي للمنتخب الجزائري (42 هدفاً دولياً)',
    note: 'أنهى مسيرته الدولية بعد كأس أمم أفريقيا 2021',
  },
  'روبيرت ليفاندوفسكي': {
    fullName: 'روبيرت ليفاندوفسكي',
    aliases: ['ليفاندوفسكي', 'lewandowski', 'لوبير', 'رئيس'],
    nationality: 'بولندا',
    flag: '🇵🇱',
    currentClub: 'برشلونة',
    currentClubEn: 'FC Barcelona',
    currentLeague: 'الدوري الإسباني لالیغا',
    position: 'مهاجم',
    dob: '21 أغسطس 1988',
    transferHistory: [
      { season: '2022', from: 'بايرن ميونيخ', to: 'برشلونة', type: 'انتقال', fee: '45 مليون يورو' },
    ],
    achievements: 'هداف بايرن ميونيخ التاريخي',
    note: 'يمثل برشلونة منذ 2022',
  },
  'لوكا مودريتش': {
    fullName: 'لوكا مودريتش',
    aliases: ['مودريتش', 'modric', 'لوكا'],
    nationality: 'كرواتيا',
    flag: '🇭🇷',
    currentClub: 'لوس أنجلوس غالاكسي',
    currentClubEn: 'LA Galaxy',
    currentLeague: 'دوري MLS (الولايات المتحدة)',
    position: 'وسط',
    dob: '9 سبتمبر 1985',
    transferHistory: [
      { season: '2012', from: 'توتنهام', to: 'ريال مدريد', type: 'انتقال' },
      { season: '2024', from: 'ريال مدريد', to: 'لوس أنجلوس غالاكسي', type: 'انتقال حر' },
    ],
    achievements: 'كرة ذهبية 2018، 6 ألقاب دوري أبطال أوروبا مع ريال مدريد',
    note: 'غادر ريال مدريد في 2024 للعب في MLS',
  },
  'أنطوان غريزمان': {
    fullName: 'أنطوان غريزمان',
    aliases: ['غريزمان', 'griezmann'],
    nationality: 'فرنسا',
    flag: '🇫🇷',
    currentClub: 'أتلتيكو مدريد',
    currentClubEn: 'Atletico Madrid',
    currentLeague: 'الدوري الإسباني لالیغا',
    position: 'مهاجم / جناح',
    dob: '21 مارس 1991',
    transferHistory: [
      { season: '2019', from: 'أتلتيكو مدريد', to: 'برشلونة', type: 'انتقال', fee: '120 مليون يورو' },
      { season: '2021', from: 'برشلونة', to: 'أتلتيكو مدريد', type: 'إعارة ثم ضم' },
    ],
    achievements: 'بطل العالم 2018 مع فرنسا، هداف دوري الأمم الأوروبية',
    note: 'يلعب مع أتلتيكو مدريد',
  },
  'فيل فودن': {
    fullName: 'فيليب والتر فودن',
    aliases: ['فودن', 'foden'],
    nationality: 'إنجلترا',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    currentClub: 'مانشستر سيتي',
    currentClubEn: 'Manchester City',
    currentLeague: 'الدوري الإنجليزي الممتاز',
    position: 'وسط هجومي / جناح',
    dob: '28 مايو 2000',
    transferHistory: [],
    achievements: 'أفضل لاعب في الدوري الإنجليزي 2024',
    note: 'يلعب مع مانشستر سيتي',
  },
  'هاري كين': {
    fullName: 'هاري إدوارد كين',
    aliases: ['كين', 'kane', 'harry kane'],
    nationality: 'إنجلترا',
    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    currentClub: 'بايرن ميونيخ',
    currentClubEn: 'Bayern Munich',
    currentLeague: 'الدوري الألماني بوندسليغا',
    position: 'مهاجم',
    dob: '28 يوليو 1993',
    transferHistory: [
      { season: '2023', from: 'توتنهام هوتسبر', to: 'بايرن ميونيخ', type: 'انتقال', fee: '100 مليون يورو' },
    ],
    achievements: 'الهداف التاريخي لإنجلترا والدوري الإنجليزي',
    note: 'انتقل لبايرن ميونيخ في صيف 2023',
  },
  'بوبكر راضي': {
    fullName: 'بوبكر راضي',
    aliases: ['راضي', 'rais', 'رايس'],
    nationality: 'الجزائر',
    flag: '🇩🇿',
    currentClub: 'شيفيلد يونايتد',
    currentClubEn: 'Sheffield United',
    currentLeague: 'الدوري الإنجليزي الدرجة الأولى',
    position: 'مهاجم',
    dob: '19 مارس 2001',
    transferHistory: [],
    achievements: 'من أبرز الشبان الجزائريين في أوروبا',
    note: '',
  },
  'أدم أونا': {
    fullName: 'أدم عونة',
    aliases: ['أونا', 'ounas', 'adam ounas'],
    nationality: 'الجزائر',
    flag: '🇩🇿',
    currentClub: 'نيس',
    currentClubEn: 'OGC Nice',
    currentLeague: 'الدوري الفرنسي ليغ 1',
    position: 'جناح',
    dob: '11 نوفمبر 1996',
    transferHistory: [],
    achievements: 'الجناح السريع للخضر',
    note: '',
  },
  'ياسين براهيمي': {
    fullName: 'ياسين براهيمي',
    aliases: ['براهيمي', 'brahimi'],
    nationality: 'الجزائر',
    flag: '🇩🇿',
    currentClub: 'متقاعد',
    currentClubEn: 'Retired',
    position: 'جناح',
    dob: '16 فبراير 1990',
    transferHistory: [],
    achievements: 'قائد منتخب الجزائر سابقاً',
    note: 'اعتزل كرة القدم',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2 — تاريخ كأس العالم FIFA (1930–2026)
// ─────────────────────────────────────────────────────────────────────────────

export const WORLD_CUP_HISTORY = [
  { year: 2022, winner: 'الأرجنتين',       flag: '🇦🇷', runner: 'فرنسا',       host: 'قطر',          score: '3-3 (ركلات الجزاء 4-2)' },
  { year: 2018, winner: 'فرنسا',           flag: '🇫🇷', runner: 'كرواتيا',     host: 'روسيا',         score: '4-2' },
  { year: 2014, winner: 'ألمانيا',         flag: '🇩🇪', runner: 'الأرجنتين',   host: 'البرازيل',      score: '1-0 (وقت إضافي)' },
  { year: 2010, winner: 'إسبانيا',         flag: '🇪🇸', runner: 'هولندا',      host: 'جنوب أفريقيا',  score: '1-0 (وقت إضافي)' },
  { year: 2006, winner: 'إيطاليا',         flag: '🇮🇹', runner: 'فرنسا',       host: 'ألمانيا',       score: '1-1 (ركلات الجزاء 5-3)' },
  { year: 2002, winner: 'البرازيل',         flag: '🇧🇷', runner: 'ألمانيا',     host: 'كوريا/اليابان', score: '2-0' },
  { year: 1998, winner: 'فرنسا',           flag: '🇫🇷', runner: 'البرازيل',    host: 'فرنسا',         score: '3-0' },
  { year: 1994, winner: 'البرازيل',         flag: '🇧🇷', runner: 'إيطاليا',    host: 'الولايات المتحدة', score: '0-0 (ركلات الجزاء 3-2)' },
  { year: 1990, winner: 'ألمانيا الغربية', flag: '🇩🇪', runner: 'الأرجنتين',   host: 'إيطاليا',       score: '1-0' },
  { year: 1986, winner: 'الأرجنتين',       flag: '🇦🇷', runner: 'ألمانيا الغربية', host: 'المكسيك', score: '3-2' },
  { year: 1982, winner: 'إيطاليا',         flag: '🇮🇹', runner: 'ألمانيا الغربية', host: 'إسبانيا', score: '3-1' },
  { year: 1978, winner: 'الأرجنتين',       flag: '🇦🇷', runner: 'هولندا',      host: 'الأرجنتين',     score: '3-1 (وقت إضافي)' },
  { year: 1974, winner: 'ألمانيا الغربية', flag: '🇩🇪', runner: 'هولندا',      host: 'ألمانيا',       score: '2-1' },
  { year: 1970, winner: 'البرازيل',         flag: '🇧🇷', runner: 'إيطاليا',    host: 'المكسيك',       score: '4-1' },
  { year: 1966, winner: 'إنجلترا',         flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', runner: 'ألمانيا الغربية', host: 'إنجلترا', score: '4-2 (وقت إضافي)' },
  { year: 1962, winner: 'البرازيل',         flag: '🇧🇷', runner: 'تشيكوسلوفاكيا', host: 'تشيلي', score: '3-1' },
  { year: 1958, winner: 'البرازيل',         flag: '🇧🇷', runner: 'السويد',     host: 'السويد',        score: '5-2' },
  { year: 1954, winner: 'ألمانيا الغربية', flag: '🇩🇪', runner: 'المجر',       host: 'سويسرا',        score: '3-2' },
  { year: 1950, winner: 'أوروغواي',         flag: '🇺🇾', runner: 'البرازيل',   host: 'البرازيل',      score: '2-1 (نهائي مجموعات)' },
  { year: 1938, winner: 'إيطاليا',         flag: '🇮🇹', runner: 'المجر',       host: 'فرنسا',         score: '4-2' },
  { year: 1934, winner: 'إيطاليا',         flag: '🇮🇹', runner: 'تشيكوسلوفاكيا', host: 'إيطاليا', score: '2-1 (وقت إضافي)' },
  { year: 1930, winner: 'أوروغواي',         flag: '🇺🇾', runner: 'الأرجنتين',  host: 'أوروغواي',      score: '4-2' },
]

// ─────────────────────────────────────────────────────────────────────────────
// § 3 — تاريخ كأس أمم أفريقيا AFCON (1957–2023)
// ─────────────────────────────────────────────────────────────────────────────

export const AFCON_HISTORY = [
  { year: 2023, winner: 'ساحل العاج',  flag: '🇨🇮', runner: 'نيجيريا',      host: 'ساحل العاج',  score: '2-1' },
  { year: 2021, winner: 'السنغال',     flag: '🇸🇳', runner: 'مصر',          host: 'الكاميرون',   score: '0-0 (ركلات 4-2)' },
  { year: 2019, winner: 'الجزائر',     flag: '🇩🇿', runner: 'السنغال',      host: 'مصر',          score: '1-0', dzGoalscorer: 'بغداد بونجاح (دقيقة 2)' },
  { year: 2017, winner: 'الكاميرون',   flag: '🇨🇲', runner: 'مصر',          host: 'الغابون',      score: '2-1' },
  { year: 2015, winner: 'ساحل العاج',  flag: '🇨🇮', runner: 'غانا',         host: 'غينيا الاستوائية', score: '0-0 (ركلات 9-8)' },
  { year: 2013, winner: 'نيجيريا',     flag: '🇳🇬', runner: 'بوركينا فاسو', host: 'جنوب أفريقيا', score: '1-0' },
  { year: 2012, winner: 'زامبيا',      flag: '🇿🇲', runner: 'ساحل العاج',   host: 'الغابون/غينيا الاستوائية', score: '0-0 (ركلات 8-7)' },
  { year: 2010, winner: 'مصر',         flag: '🇪🇬', runner: 'غانا',         host: 'أنغولا',       score: '1-0' },
  { year: 2008, winner: 'مصر',         flag: '🇪🇬', runner: 'الكاميرون',    host: 'غانا',         score: '1-0' },
  { year: 2006, winner: 'مصر',         flag: '🇪🇬', runner: 'ساحل العاج',   host: 'مصر',          score: '0-0 (ركلات 4-2)' },
  { year: 2004, winner: 'تونس',        flag: '🇹🇳', runner: 'المغرب',       host: 'تونس',         score: '2-1' },
  { year: 2002, winner: 'الكاميرون',   flag: '🇨🇲', runner: 'السنغال',      host: 'مالي',         score: '0-0 (ركلات 3-2)' },
  { year: 2000, winner: 'الكاميرون',   flag: '🇨🇲', runner: 'نيجيريا',      host: 'غانا/نيجيريا', score: '2-2 (ركلات 4-3)' },
  { year: 1998, winner: 'مصر',         flag: '🇪🇬', runner: 'جنوب أفريقيا', host: 'بوركينا فاسو',  score: '2-0' },
  { year: 1996, winner: 'جنوب أفريقيا', flag: '🇿🇦', runner: 'تونس',       host: 'جنوب أفريقيا', score: '2-0' },
  { year: 1994, winner: 'نيجيريا',     flag: '🇳🇬', runner: 'زامبيا',       host: 'تونس',         score: '2-1' },
  { year: 1992, winner: 'ساحل العاج',  flag: '🇨🇮', runner: 'غانا',         host: 'السنغال',      score: '0-0 (ركلات 11-10)' },
  { year: 1990, winner: 'الجزائر',     flag: '🇩🇿', runner: 'نيجيريا',      host: 'الجزائر',      score: '1-0', dzGoalscorer: 'لخضر بلومي' },
  { year: 1988, winner: 'الكاميرون',   flag: '🇨🇲', runner: 'نيجيريا',      host: 'المغرب',       score: '1-0' },
  { year: 1986, winner: 'مصر',         flag: '🇪🇬', runner: 'الكاميرون',    host: 'مصر',          score: '0-0 (ركلات 5-4)' },
  { year: 1984, winner: 'الكاميرون',   flag: '🇨🇲', runner: 'نيجيريا',      host: 'ساحل العاج',   score: '3-1' },
  { year: 1982, winner: 'غانا',        flag: '🇬🇭', runner: 'ليبيا',        host: 'ليبيا',        score: '1-1 (ركلات 7-6)' },
  { year: 1980, winner: 'نيجيريا',     flag: '🇳🇬', runner: 'الجزائر',      host: 'نيجيريا',      score: '3-0' },
  { year: 1978, winner: 'غانا',        flag: '🇬🇭', runner: 'أوغندا',       host: 'غانا',         score: '2-0' },
  { year: 1976, winner: 'المغرب',      flag: '🇲🇦', runner: 'غينيا',        host: 'إثيوبيا',      score: 'نظام المجموعات' },
  { year: 1974, winner: 'زائير',       flag: '🇨🇩', runner: 'زامبيا',       host: 'مصر',          score: '2-2 (ركلات)' },
  { year: 1972, winner: 'الكونغو',     flag: '🇨🇬', runner: 'مالي',         host: 'الكاميرون',    score: '3-2' },
  { year: 1970, winner: 'السودان',     flag: '🇸🇩', runner: 'غانا',         host: 'السودان',      score: '1-0' },
  { year: 1968, winner: 'الكونغو',     flag: '🇨🇩', runner: 'غانا',         host: 'إثيوبيا',      score: '1-0' },
  { year: 1965, winner: 'غانا',        flag: '🇬🇭', runner: 'تونس',         host: 'تونس',         score: '3-2' },
  { year: 1963, winner: 'غانا',        flag: '🇬🇭', runner: 'السودان',      host: 'غانا',         score: '3-0' },
  { year: 1962, winner: 'إثيوبيا',    flag: '🇪🇹', runner: 'مصر',          host: 'إثيوبيا',      score: '4-2' },
  { year: 1959, winner: 'مصر',         flag: '🇪🇬', runner: 'السودان',      host: 'مصر',          score: '4-0' },
  { year: 1957, winner: 'مصر',         flag: '🇪🇬', runner: 'إثيوبيا',     host: 'السودان',      score: '4-0' },
]

// ─────────────────────────────────────────────────────────────────────────────
// § 4 — تاريخ دوري أبطال أوروبا (Champions League 1956–2024)
// ─────────────────────────────────────────────────────────────────────────────

export const UCL_HISTORY = [
  { year: 2024, winner: 'ريال مدريد',       flag: '🇪🇸', runner: 'بوروسيا دورتموند', score: '2-0' },
  { year: 2023, winner: 'مانشستر سيتي',    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', runner: 'إنتر ميلان',       score: '1-0' },
  { year: 2022, winner: 'ريال مدريد',       flag: '🇪🇸', runner: 'ليفربول',           score: '1-0' },
  { year: 2021, winner: 'تشيلسي',           flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', runner: 'مانشستر سيتي',    score: '1-0' },
  { year: 2020, winner: 'بايرن ميونيخ',    flag: '🇩🇪', runner: 'باريس سان جيرمان', score: '1-0' },
  { year: 2019, winner: 'ليفربول',          flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', runner: 'توتنهام',          score: '2-0' },
  { year: 2018, winner: 'ريال مدريد',       flag: '🇪🇸', runner: 'ليفربول',           score: '3-1' },
  { year: 2017, winner: 'ريال مدريد',       flag: '🇪🇸', runner: 'يوفنتوس',           score: '4-1' },
  { year: 2016, winner: 'ريال مدريد',       flag: '🇪🇸', runner: 'أتلتيكو مدريد',    score: '1-1 (ركلات 5-3)' },
  { year: 2015, winner: 'برشلونة',          flag: '🇪🇸', runner: 'يوفنتوس',           score: '3-1' },
  { year: 2014, winner: 'ريال مدريد',       flag: '🇪🇸', runner: 'أتلتيكو مدريد',    score: '4-1 (وقت إضافي)' },
  { year: 2013, winner: 'بايرن ميونيخ',    flag: '🇩🇪', runner: 'بوروسيا دورتموند', score: '2-1' },
  { year: 2012, winner: 'تشيلسي',           flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', runner: 'بايرن ميونيخ',    score: '1-1 (ركلات 4-3)' },
  { year: 2011, winner: 'برشلونة',          flag: '🇪🇸', runner: 'مانشستر يونايتد',  score: '3-1' },
  { year: 2010, winner: 'إنتر ميلان',       flag: '🇮🇹', runner: 'بايرن ميونيخ',    score: '2-0' },
  { year: 2009, winner: 'برشلونة',          flag: '🇪🇸', runner: 'مانشستر يونايتد',  score: '2-0' },
  { year: 2008, winner: 'مانشستر يونايتد', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', runner: 'تشيلسي',           score: '1-1 (ركلات 6-5)' },
]

// ─────────────────────────────────────────────────────────────────────────────
// § 5 — الهدافون التاريخيون للمنتخبات
// ─────────────────────────────────────────────────────────────────────────────

export const TOP_SCORERS = {
  'الجزائر':    { name: 'إسلام سليماني', goals: 42, active: false },
  'فرنسا':      { name: 'أوليفيه جيرو',  goals: 57, active: false },
  'البرتغال':   { name: 'كريستيانو رونالدو', goals: 135, active: true },
  'الأرجنتين':  { name: 'ليونيل ميسي',   goals: 109, active: false, note: 'أعلن اعتزاله بعد كأس العالم 2022' },
  'مصر':        { name: 'محمد صلاح',     goals: 81, active: true },
  'البرازيل':   { name: 'نيمار',          goals: 79, active: false, note: 'أحيل للاستراحة طويلة بسبب الإصابة' },
  'إنجلترا':    { name: 'هاري كين',       goals: 69, active: true },
  'ألمانيا':    { name: 'ميروسلاف كلوسه', goals: 71, active: false },
  'إسبانيا':    { name: 'داويد فييا',    goals: 59, active: false },
  'المغرب':     { name: 'بلعربي',         goals: 36, active: false },
  'تونس':       { name: 'ودان',           goals: 36, active: false },
  'السنغال':    { name: 'سيدي دياتا',    goals: 35, active: false },
  'نيجيريا':    { name: 'رشيدي ييكيني',  goals: 37, active: false },
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6 — ألقاب المنتخبات (ملخّص)
// ─────────────────────────────────────────────────────────────────────────────

export const TEAM_TROPHIES = {
  'الجزائر': {
    worldCup: [],
    afcon: [
      { year: 1990, host: 'الجزائر', final: 'الجزائر 1-0 نيجيريا', goalscorer: 'لخضر بلومي' },
      { year: 2019, host: 'مصر',     final: 'الجزائر 1-0 السنغال', goalscorer: 'بغداد بونجاح (دقيقة 2)' },
    ],
    arabCup: [{ year: 1964 }, { year: 1988 }],
    note: 'شاركت الجزائر في 5 نسخ من كأس العالم (1982، 1986، 2010، 2014، 2026)',
  },
  'فرنسا': {
    worldCup: [
      { year: 1998, host: 'فرنسا', final: 'فرنسا 3-0 البرازيل', scorers: 'زيدان (هدفان)، إيمانيول بيتي' },
      { year: 2018, host: 'روسيا', final: 'فرنسا 4-2 كرواتيا', scorers: 'مانجلا (عكسي)، غريزمان، بوغبا، امبابي' },
    ],
    euro: [{ year: 1984 }, { year: 2000 }],
    note: 'فازت فرنسا بكأس العالم مرتين: 1998 (بقيادة زيدان) و2018 (بقيادة ديشان)',
  },
  'البرازيل': {
    worldCup: [
      { year: 1958, host: 'السويد' }, { year: 1962, host: 'تشيلي' },
      { year: 1970, host: 'المكسيك' }, { year: 1994, host: 'الولايات المتحدة' },
      { year: 2002, host: 'كوريا/اليابان', final: 'البرازيل 2-0 ألمانيا', scorers: 'رونالدو (هدفان)' },
    ],
    note: 'البرازيل أكثر الأمم فوزاً بكأس العالم (5 مرات) — البلد الوحيد الذي شارك في كل نسخ',
  },
  'الأرجنتين': {
    worldCup: [
      { year: 1978, host: 'الأرجنتين' },
      { year: 1986, host: 'المكسيك', final: 'الأرجنتين 3-2 ألمانيا الغربية', scorers: 'مارادونا + بروشيني + بوروكيتا' },
      { year: 2022, host: 'قطر', final: 'الأرجنتين 3-3 فرنسا (ركلات 4-2)', scorers: 'ميسي (هدفان)، ماكالستر' },
    ],
    note: 'الأرجنتين تحتل المرتبة الثانية بثلاثة ألقاب (1978، 1986، 2022)',
  },
  'ألمانيا': {
    worldCup: [
      { year: 1954, host: 'سويسرا' }, { year: 1974, host: 'ألمانيا' },
      { year: 1990, host: 'إيطاليا' }, { year: 2014, host: 'البرازيل', scorers: 'ماريو غوتزه (و.إ.)' },
    ],
    euro: [{ year: 1972 }, { year: 1980 }, { year: 1996 }],
    note: 'ألمانيا فازت بكأس العالم 4 مرات (1954، 1974، 1990 بوصفها ألمانيا الغربية، و2014)',
  },
  'إيطاليا': {
    worldCup: [
      { year: 1934 }, { year: 1938 }, { year: 1982, scorers: 'باولو روسي' }, { year: 2006, host: 'ألمانيا' },
    ],
    euro: [{ year: 1968 }, { year: 2020 }],
    note: 'إيطاليا فازت بكأس العالم 4 مرات',
  },
  'إسبانيا': {
    worldCup: [{ year: 2010, host: 'جنوب أفريقيا', final: 'إسبانيا 1-0 هولندا', scorers: 'أندريس إنييستا' }],
    euro: [{ year: 1964 }, { year: 2008 }, { year: 2012 }, { year: 2024 }],
    note: 'إسبانيا فازت بكأس العالم مرة واحدة (2010) وبالبطولة الأوروبية 4 مرات',
  },
  'إنجلترا': {
    worldCup: [{ year: 1966, host: 'إنجلترا', final: 'إنجلترا 4-2 ألمانيا الغربية (و.إ.)', scorers: 'جيف هيرست (هاتريك)' }],
    note: 'إنجلترا فازت بكأس العالم مرة واحدة في 1966 على أرضها',
  },
  'المغرب': {
    worldCup: [],
    afcon: [{ year: 1976 }],
    note: 'وصل المغرب لنصف نهائي كأس العالم 2022 — أفضل نتيجة لمنتخب أفريقي',
  },
  'تونس': {
    worldCup: [],
    afcon: [{ year: 2004 }],
    note: 'تونس فازت بكأس أمم أفريقيا مرة واحدة (2004 في الدار البيضاء)',
  },
  'مصر': {
    worldCup: [],
    afcon: [
      { year: 1957 }, { year: 1959 }, { year: 1986 }, { year: 1998 },
      { year: 2006 }, { year: 2008 }, { year: 2010 },
    ],
    note: 'مصر أكثر دولة أفريقية فوزاً بكأس الأمم (7 مرات)',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// § 7 — دوال البحث
// ─────────────────────────────────────────────────────────────────────────────

/**
 * بحث عن معلومات لاعب بالاسم أو الكنية
 * @param {string} name — الاسم المُدخل
 * @returns {{ found: boolean, player: object|null, key: string }}
 */
export function searchPlayerInfo(name = '') {
  const q = name.trim().toLowerCase()
  if (!q) return { found: false, player: null, key: '' }

  for (const [key, player] of Object.entries(FAMOUS_PLAYERS)) {
    // مطابقة الاسم الرئيسي
    if (key.toLowerCase().includes(q) || q.includes(key.toLowerCase())) {
      return { found: true, player, key }
    }
    // مطابقة الأسماء المستعارة
    if (player.aliases?.some(a => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()))) {
      return { found: true, player, key }
    }
  }
  return { found: false, player: null, key: '' }
}

/**
 * بحث عن سجل الانتقالات وناديه الحالي
 */
export function getPlayerCurrentClub(name = '') {
  const result = searchPlayerInfo(name)
  if (!result.found) return null
  return {
    name: result.key,
    club: result.player.currentClub,
    league: result.player.currentLeague,
    flag: result.player.flag,
    note: result.player.note,
    transferHistory: result.player.transferHistory || [],
    achievements: result.player.achievements || '',
  }
}

/**
 * بحث في تاريخ كأس العالم
 * @param {string} teamName — اسم الفريق بالعربية
 * @returns {Array} قائمة النسخ التي فازت بها
 */
export function getWorldCupWins(teamName = '') {
  const q = teamName.trim().toLowerCase()
  const wins = WORLD_CUP_HISTORY.filter(w =>
    w.winner.toLowerCase().includes(q) || q.includes(w.winner.toLowerCase())
  )
  // معالجة خاصة: "ألمانيا" تشمل "ألمانيا الغربية" في السياق التاريخي
  if (!wins.length && (q.includes('ألمانيا') || q.includes('germany'))) {
    return WORLD_CUP_HISTORY.filter(w => w.winner.includes('ألمانيا'))
  }
  return wins
}

/**
 * الحصول على البطل الأخير لبطولة معينة
 */
export function getLastChampion(competition = 'worldcup') {
  const comp = competition.toLowerCase()
  if (comp.includes('world') || comp.includes('مونديال') || comp.includes('عالم')) {
    return WORLD_CUP_HISTORY[0]
  }
  if (comp.includes('afcon') || comp.includes('أفريقيا') || comp.includes('كان')) {
    return AFCON_HISTORY[0]
  }
  if (comp.includes('champion') || comp.includes('أبطال أوروبا') || comp.includes('champions league')) {
    return UCL_HISTORY[0]
  }
  return null
}

/**
 * بحث عن ألقاب فريق وطني في بطولة معينة
 */
export function getTeamTrophies(teamName = '', competition = '') {
  const q = teamName.trim().toLowerCase()
  const comp = competition.toLowerCase()

  // بحث في TEAM_TROPHIES
  for (const [key, data] of Object.entries(TEAM_TROPHIES)) {
    if (key.toLowerCase().includes(q) || q.includes(key.toLowerCase())) {
      if (comp.includes('عالم') || comp.includes('مونديال') || comp.includes('world')) {
        return { team: key, competition: 'كأس العالم', titles: data.worldCup || [], note: data.note }
      }
      if (comp.includes('أفريق') || comp.includes('كان') || comp.includes('afcon')) {
        return { team: key, competition: 'كأس أمم أفريقيا', titles: data.afcon || [], note: data.note }
      }
      if (comp.includes('أوروب') || comp.includes('يورو') || comp.includes('euro')) {
        return { team: key, competition: 'بطولة أوروبا', titles: data.euro || [], note: data.note }
      }
      return { team: key, competition: 'كل الألقاب', titles: [...(data.worldCup||[]),...(data.afcon||[]),(data.euro||[])], note: data.note }
    }
  }

  // بحث في WORLD_CUP_HISTORY للفوز
  const wcWins = getWorldCupWins(teamName)
  if (wcWins.length) {
    return {
      team: teamName,
      competition: 'كأس العالم',
      titles: wcWins.map(w => ({ year: w.year, host: w.host, score: w.score })),
      note: `${teamName} فازت بكأس العالم ${wcWins.length} مرة/مرات`,
    }
  }

  // بحث AFCON
  const afconWins = AFCON_HISTORY.filter(w =>
    w.winner.toLowerCase().includes(q) || q.includes(w.winner.toLowerCase())
  )
  if (afconWins.length) {
    return {
      team: teamName,
      competition: 'كأس أمم أفريقيا',
      titles: afconWins.map(w => ({ year: w.year, host: w.host, score: w.score })),
      note: `${teamName} فازت بكأس أمم أفريقيا ${afconWins.length} مرة/مرات`,
    }
  }

  return null
}

/**
 * بناء ردّ نصي لمعلومات اللاعب
 */
export function buildPlayerInfoBlock(playerKey, player) {
  const lines = [
    `━━━ ⚽ معلومات اللاعب: **${playerKey}** ${player.flag || ''} ━━━\n`,
    `👤 **الاسم الكامل:** ${player.fullName || playerKey}`,
    `🌍 **الجنسية:** ${player.nationality || '—'} ${player.flag || ''}`,
    `🏟️ **النادي الحالي:** ${player.currentClub || '—'}`,
    `🏆 **الدوري:** ${player.currentLeague || '—'}`,
    `🎽 **المركز:** ${player.position || '—'}`,
    player.dob ? `📅 **تاريخ الميلاد:** ${player.dob}` : '',
  ].filter(Boolean)

  if (player.transferHistory?.length) {
    lines.push(`\n### 🔄 سجل الانتقالات`)
    for (const t of player.transferHistory.slice(-4)) {
      const fee = t.fee ? ` (${t.fee})` : ''
      lines.push(`• **${t.season || '?'}:** ${t.from} ← **${t.to}**${fee} — ${t.type || ''}`)
    }
  }

  if (player.achievements) {
    lines.push(`\n🏅 **الإنجازات:** ${player.achievements}`)
  }
  if (player.note) {
    lines.push(`\n📌 **ملاحظة:** ${player.note}`)
  }

  return lines.join('\n')
}

/**
 * بناء ردّ نصي لكأس العالم (لمن فازت)
 */
export function buildWorldCupTrophyBlock(teamName, wins) {
  if (!wins.length) {
    return `⚠️ لم يُعثر على ألقاب كأس العالم لـ **${teamName}** في قاعدة البيانات.`
  }
  const lines = [
    `━━━ 🏆 **${teamName}** وكأس العالم ━━━\n`,
    `✅ **عدد الألقاب:** ${wins.length} لقب`,
    ``,
  ]
  for (const w of wins) {
    lines.push(`### ${w.flag} **${w.year}** — ${w.host}`)
    lines.push(`📊 النهائي: ${w.winner} **${w.score}** ${w.runner}`)
    lines.push(``)
  }
  // إضافة ملاحظة TEAM_TROPHIES إن وجدت
  const trophyData = Object.entries(TEAM_TROPHIES).find(([k]) =>
    k.toLowerCase().includes(teamName.toLowerCase()) || teamName.toLowerCase().includes(k.toLowerCase())
  )
  if (trophyData?.[1]?.note) {
    lines.push(`📌 ${trophyData[1].note}`)
  }
  return lines.join('\n')
}

/**
 * بناء ردّ نصي لكأس أمم أفريقيا
 */
export function buildAfconTrophyBlock(teamName, wins) {
  if (!wins.length) {
    return `⚠️ لم يُعثر على ألقاب كأس أمم أفريقيا لـ **${teamName}** في قاعدة البيانات.`
  }
  const lines = [
    `━━━ 🏆 **${teamName}** وكأس أمم أفريقيا ━━━\n`,
    `✅ **عدد الألقاب:** ${wins.length} لقب`,
    ``,
  ]
  for (const w of wins) {
    lines.push(`### ${w.flag} **${w.year}** — ${w.host}`)
    lines.push(`📊 النهائي: **${w.score}** أمام ${w.runner}`)
    if (w.dzGoalscorer) lines.push(`⚽ هداف النهائي: **${w.dzGoalscorer}**`)
    lines.push(``)
  }
  return lines.join('\n')
}
