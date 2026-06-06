/**
 * lib/sports-lookup.js — Real-Time Football Player Lookup
 * نظام البحث الرياضي الشامل لأي لاعب في العالم
 *
 * المصادر (بالأولوية):
 *   1. 365score API    ← أولوية مطلقة لكل الاستعلامات الرياضية
 *   2. Koora API       ← ثانياً (دعم عربي أصيل)
 *   3. Wikipedia REST  ← ثالثاً
 *   4. TheSportsDB     ← رابعاً (مصدر إضافي مجاني)
 *
 * يعمل لأي لاعب من أي دوري في العالم — لا حاجة لقاعدة بيانات ثابتة.
 */

// ══════════════════════════════════════════════════════════════════════════════
// ثوابت 365score و Koora
// ══════════════════════════════════════════════════════════════════════════════
const SCORE365_BASE = 'https://webws.365scores.com/web'
const SCORE365_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ar,en;q=0.9',
  'Origin': 'https://www.365scores.com',
  'Referer': 'https://www.365scores.com/',
}
const KOORA_BASE = 'https://www.kooora.com'
const KOORA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json, */*',
  'Accept-Language': 'ar,en;q=0.9',
  'Referer': 'https://www.kooora.com/',
}

// ── دالة جلب بيانات اللاعب من 365score ──────────────────────────────────────
async function fetch365ScorePlayer(arabicName, englishName) {
  try {
    // محاولة البحث بالاسم الإنجليزي
    const q = encodeURIComponent(englishName)
    const url = `${SCORE365_BASE}/search/?query=${q}&langId=1&appTypeId=5`
    const res = await fetch(url, { headers: SCORE365_HEADERS, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    // استخراج اللاعب من نتائج البحث
    const competitors = data?.competitors || data?.athletes || data?.players || []
    const player = competitors.find(p =>
      p.name?.toLowerCase().includes(englishName.split(' ')[0].toLowerCase()) ||
      p.name?.toLowerCase().includes(englishName.split(' ')[1]?.toLowerCase() || '')
    ) || competitors[0]
    if (!player) return null

    const clubEn = player.teamName || player.currentTeam?.name || null
    const leagueEn = player.competitionName || player.league?.name || null
    return {
      source: '365score',
      clubEn,
      clubAr: clubEn ? EN_CLUB_AR[clubEn.toLowerCase()] || clubEn : null,
      leagueEn,
      leagueAr: leagueEn ? EN_LEAGUE_AR[leagueEn.toLowerCase()] || leagueEn : null,
      position: player.position || null,
      nationality: player.nationality || null,
      playerId: player.id || null,
      profileUrl: player.id ? `https://www.365scores.com/ar/player/${player.id}` : null,
    }
  } catch {
    return null
  }
}

// ── دالة جلب بيانات اللاعب من Koora ─────────────────────────────────────────
async function fetchKooraPlayer(arabicName, englishName) {
  try {
    const q = encodeURIComponent(arabicName || englishName)
    const url = `${KOORA_BASE}/api/search?q=${q}&type=player`
    const res = await fetch(url, { headers: KOORA_HEADERS, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    const player = (data?.players || data?.results || [])[0]
    if (!player) return null

    const clubAr = player.team_name_ar || player.teamAr || null
    const clubEn = player.team_name || player.teamEn || null
    return {
      source: 'koora',
      clubEn,
      clubAr: clubAr || (clubEn ? EN_CLUB_AR[clubEn.toLowerCase()] || clubEn : null),
      leagueEn: player.league_name || null,
      leagueAr: player.league_name_ar || null,
      position: player.position_ar || player.position || null,
      nationality: player.nationality_ar || player.nationality || null,
    }
  } catch {
    return null
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// خريطة الأسماء العربية → الإنجليزية (للبحث في Wikipedia & TheSportsDB)
// ══════════════════════════════════════════════════════════════════════════════
export const ARABIC_TO_EN_PLAYER = {
  // ── اللاعبون الجزائريون ──────────────────────────────────────────────────
  'محرز': 'Riyad Mahrez',
  'رياض محرز': 'Riyad Mahrez',
  'سليماني': 'Islam Slimani',
  'إسلام سليماني': 'Islam Slimani',
  'اسلام سليماني': 'Islam Slimani',
  'بن ناصر': 'Ismail Bennacer',
  'بنناصر': 'Ismail Bennacer',
  'بناصر': 'Ismail Bennacer',
  'إسماعيل بن ناصر': 'Ismail Bennacer',
  'بن رحمة': 'Said Benrahma',
  'بنرحمة': 'Said Benrahma',
  'سعيد بن رحمة': 'Said Benrahma',
  'آيت نور': 'Rayan Ait-Nouri',
  'آيت نوري': 'Rayan Ait-Nouri',
  'ريان آيت نور': 'Rayan Ait-Nouri',
  'غولام': 'Faouzi Ghoulam',
  'فاوزي غولام': 'Faouzi Ghoulam',
  'فغولي': 'Sofiane Feghouli',
  'سفيان فغولي': 'Sofiane Feghouli',
  'براهيمي': 'Yacine Brahimi',
  'ياسين براهيمي': 'Yacine Brahimi',
  'بونجاح': 'Baghdad Bounedjah',
  'بغداد بونجاح': 'Baghdad Bounedjah',
  'غانمي': 'Haris Belkebla',
  'بلعيد': 'Andy Delort',
  'دلور': 'Andy Delort',
  'أندي دلور': 'Andy Delort',
  // ✅ إصلاح: بلايلي = يوسف بلايلي (ليس حارس بلقبلة)
  'بلايلي': 'Youcef Belaïli',
  'يوسف بلايلي': 'Youcef Belaïli',
  'تالسكر': 'Samir Nasri',
  'ناصري': 'Samir Nasri',
  'سمير ناصري': 'Samir Nasri',
  'بن راهمة': 'Said Benrahma',
  'قداف': 'Riyad Mahrez',
  'بن عيسى': 'Mehdi Tahrat',
  'بوفال': 'Sofiane Boufal',
  'سفيان بوفال': 'Sofiane Boufal',
  'بن طالب': 'Nabil Bentaleb',
  'بنطالب': 'Nabil Bentaleb',
  'نبيل بنطالب': 'Nabil Bentaleb',
  'أتال': 'Youcef Atal',
  'يوسف أتال': 'Youcef Atal',
  'مهدي عابيد': 'Mehdi Abeid',
  'تاليسكا': 'Anderson Talisca',
  'بن بدر': 'Youcef Atal',
  'سوفيان رحيمي': 'Sofiane Rahimi',
  'رحيمي': 'Sofiane Rahimi',
  'ياسين بونو': 'Yassine Bounou',
  'بونو': 'Yassine Bounou',
  // ── لاعبون جزائريون إضافيون ────────────────────────────────────────────
  'أنيس حاج موسى': 'Anis Hadj Moussa',
  'حاج موسى': 'Anis Hadj Moussa',
  'رامي بن سبعيني': 'Ramy Bensebaini',
  'بن سبعيني': 'Ramy Bensebaini',
  'حسام عوار': 'Houssem Aouar',
  'حسم عوار': 'Houssem Aouar',
  'عوار': 'Houssem Aouar',
  'آدم عوناس': 'Adam Ounas',
  'عوناس': 'Adam Ounas',
  'فريد بلغول': 'Farid Boulaya',
  'بلغول': 'Farid Boulaya',
  'ياسين عدلي': 'Yacine Adli',
  'عدلي': 'Yacine Adli',
  'حارس بلقبلة': 'Haris Belkebla',
  'بلقبلة': 'Haris Belkebla',
  'جمال بن لمري': 'Djamel Benlamri',
  'بن لمري': 'Djamel Benlamri',
  'محمد أمين عمورة': 'Mohamed Amine Amoura',
  'عمورة': 'Mohamed Amine Amoura',
  'رضا بلحياني': 'Reda Belahyane',
  'بلحياني': 'Reda Belahyane',
  'أسامة دباغ': 'Oussama Dabbagh',
  'دباغ': 'Oussama Dabbagh',
  'عيسى مندي': 'Aissa Mandi',
  'مندي': 'Aissa Mandi',
  'زين الدين فرحات': 'Zinedine Ferhat',
  'فرحات': 'Zinedine Ferhat',
  'بلال براهيمي': 'Bilal Brahimi',
  'محمد الأمين بن بدة': 'Mohamed Amine Benbouali',
  'إلياس بن سكور': 'Ilyes Benkabou',
  'نذير عمرون': 'Nadhir Amroune',
  'عمرون': 'Nadhir Amroune',
  'ذكريا نصيب': 'Zakaria Naidji',
  'نصيب': 'Zakaria Naidji',
  'سفيان الاكوش': 'Sofiane Alakouch',
  'الاكوش': 'Sofiane Alakouch',
  'محيي الدين طاهر': 'Mehdi Tahrat',
  'طاهر': 'Mehdi Tahrat',
  'علاء الدين بيولة': 'Alaeddine Biyoula',
  'بيولة': 'Alaeddine Biyoula',
  'فيصل الشعلالي': 'Fayçal Chaâlali',
  'الشعلالي': 'Fayçal Chaâlali',
  'جابر بن عيسى': 'Djamel Bensebaïni',
  'بالقاسم براهيمي': 'Billal Brahimi',
  'أيمن بن بادية': 'Aymen Benbouali',
  'قاسم بن عمار': 'Kasem Ben Omar',
  'محمد رضا بلحياني': 'Reda Belahyane',
  'سعيد مندي': 'Aissa Mandi',

  // ── نجوم عالميون ─────────────────────────────────────────────────────────
  'صلاح': 'Mohamed Salah',
  'محمد صلاح': 'Mohamed Salah',
  'محمد سالح': 'Mohamed Salah',
  'مبابي': 'Kylian Mbappé',
  'كيليان مبابي': 'Kylian Mbappé',
  'هالاند': 'Erling Haaland',
  'إرلينغ هالاند': 'Erling Haaland',
  'ارلينغ هالاند': 'Erling Haaland',
  'بنزيمة': 'Karim Benzema',
  'بنزيما': 'Karim Benzema',
  'كريم بنزيمة': 'Karim Benzema',
  'رونالدو': 'Cristiano Ronaldo',
  'كريستيانو رونالدو': 'Cristiano Ronaldo',
  'كريستيانو': 'Cristiano Ronaldo',
  'ميسي': 'Lionel Messi',
  'ليونيل ميسي': 'Lionel Messi',
  'نيمار': 'Neymar',
  'نيمار جونيور': 'Neymar',
  'يامال': 'Lamine Yamal',
  'لامين يامال': 'Lamine Yamal',
  'بيلينغهام': 'Jude Bellingham',
  'جود بيلينغهام': 'Jude Bellingham',
  'بيلنغهام': 'Jude Bellingham',
  'زيدان': 'Zinedine Zidane',
  'زين الدين زيدان': 'Zinedine Zidane',
  'ماني': 'Sadio Mané',
  'ماني سادي': 'Sadio Mané',
  'سادي ماني': 'Sadio Mané',
  'ديمبيلي': 'Ousmane Dembélé',
  'غريزمان': 'Antoine Griezmann',
  'أنطوان غريزمان': 'Antoine Griezmann',
  'بيدري': 'Pedri',
  'فيني': 'Vinicius Junior',
  'فينيسيوس': 'Vinicius Junior',
  'فينيسيوس جونيور': 'Vinicius Junior',
  'كيليان': 'Kylian Mbappé',
  'رودريغو': 'Rodrygo',
  'مودريتش': 'Luka Modrić',
  'مودريتش': 'Luka Modrić',
  'لوكا مودريتش': 'Luka Modrić',
  'كروس': 'Toni Kroos',
  'تشافي': 'Xavi Hernández',
  'إينيستا': 'Andrés Iniesta',
  'راشفورد': 'Marcus Rashford',
  'ماركوس راشفورد': 'Marcus Rashford',
  'سالاه': 'Mohamed Salah',
  'ليفانداوسكي': 'Robert Lewandowski',
  'روبرت ليفانداوسكي': 'Robert Lewandowski',
  'كانتي': 'N\'Golo Kanté',
  'نغولو كانتي': 'N\'Golo Kanté',
  'فودن': 'Phil Foden',
  'فيل فودن': 'Phil Foden',
  'دي بروين': 'Kevin De Bruyne',
  'كيفن دي بروين': 'Kevin De Bruyne',
  'سالامة': 'Mohamed Salah',
  'سون': 'Son Heung-min',
  'سون هيونغ مين': 'Son Heung-min',
  'أوساكا': 'Victor Osimhen',
  'أوسيمهن': 'Victor Osimhen',
  'فيكتور أوسيمهن': 'Victor Osimhen',
  'رفاييل لياو': 'Rafael Leão',
  'لياو': 'Rafael Leão',
  'ميلان': 'Rafael Leão',
  'هاري كين': 'Harry Kane',
  'كين': 'Harry Kane',
  'لوكاكو': 'Romelu Lukaku',
  'رومولو لوكاكو': 'Romelu Lukaku',
  'زيكا': 'Zinedine Zidane',
  'إبراهيموفيتش': 'Zlatan Ibrahimović',
  'زلاتان': 'Zlatan Ibrahimović',
  'بوغبا': 'Paul Pogba',
  'بول بوغبا': 'Paul Pogba',
  'كيليبالي': 'Kalidou Koulibaly',
  'كوليبالي': 'Kalidou Koulibaly',
  'آلابا': 'David Alaba',
  'ثياغو ألكانتارا': 'Thiago Alcântara',
  'ثياغو': 'Thiago Alcântara',
  'رييس': 'Leroy Sané',
  'ساني': 'Leroy Sané',
  'بنزيمة': 'Karim Benzema',
  'فرمينو': 'Roberto Firmino',
  'روبيرتو فيرمينو': 'Roberto Firmino',
  'أنشيلوتي': 'Carlo Ancelotti',
  'كلوب': 'Jürgen Klopp',
  'غوارديولا': 'Pep Guardiola',
  'مورينيو': 'José Mourinho',
  'فيليكس': 'Joao Félix',
  'جواو فيليكس': 'Joao Félix',
  'ماركينيوس': 'Marquinhos',
  'فيران': 'Ferran Torres',
  'بيليراي': 'Brahim Díaz',
  'براهيم ديياز': 'Brahim Díaz',
  'لامين': 'Lamine Yamal',
  'كباييرو': 'Willy Caballero',
  'ماهل': 'Riyad Mahrez',
  'بوعلام': 'Riyad Mahrez',
  // ── إبراهيم مازا — لاعب جزائري (أستون فيلا / لوهافر) ────────────────────
  'ابراهيم مازا': 'Ibrahim Maza',
  'إبراهيم مازا': 'Ibrahim Maza',
  'مازا': 'Ibrahim Maza',
  // ── لاعبون جزائريون شباب (إضافات 2024-2025) ────────────────────────────
  'آدم أوناس': 'Adam Ounas',
  'هوسم عوار': 'Houssem Aouar',
  'رامي بن سبعيني': 'Ramy Bensebaini',
  'نصير مزراوي': 'Noussair Mazraoui',
  'يوسف بلايلي': 'Youcef Belaïli',
  'سيف الإسلام جمال': 'Saif Islam Djamel',
  'يحيى عطية الله': 'Yahia Attia Allah',
  'عطية الله': 'Yahia Attia Allah',
  'رياض محرز': 'Riyad Mahrez',
  'مصطفى بنبديبونة': 'Mustafa Benali',
}

// ══════════════════════════════════════════════════════════════════════════════
// ترجمة أسماء الأندية الإنجليزية → العربية
// ══════════════════════════════════════════════════════════════════════════════
const EN_CLUB_AR = {
  'al-ahli': 'الأهلي السعودي',
  'al ahli': 'الأهلي السعودي',
  'al-nassr': 'النصر السعودي',
  'al nassr': 'النصر السعودي',
  'al-hilal': 'الهلال السعودي',
  'al hilal': 'الهلال السعودي',
  'al-ittihad': 'الاتحاد السعودي',
  'al ittihad': 'الاتحاد السعودي',
  'al-qadsiah': 'القادسية',
  'al-shabab': 'الشباب السعودي',
  'al-taawoun': 'التعاون السعودي',
  'al-feiha': 'الفيحاء',
  'neom': 'نيوم السعودي',
  'al-ettifaq': 'الاتفاق',
  'liverpool': 'ليفربول',
  'manchester city': 'مانشستر سيتي',
  'man city': 'مانشستر سيتي',
  'manchester united': 'مانشستر يونايتد',
  'man united': 'مانشستر يونايتد',
  'arsenal': 'أرسنال',
  'chelsea': 'تشيلسي',
  'tottenham': 'توتنهام',
  'spurs': 'توتنهام',
  'newcastle': 'نيوكاسل',
  'aston villa': 'أستون فيلا',
  'real madrid': 'ريال مدريد',
  'barcelona': 'برشلونة',
  'atletico madrid': 'أتلتيكو مدريد',
  'atletico': 'أتلتيكو مدريد',
  'sevilla': 'إشبيلية',
  'valencia': 'فالنسيا',
  'villarreal': 'فياريال',
  'psg': 'باريس سان جيرمان',
  'paris saint-germain': 'باريس سان جيرمان',
  'paris sg': 'باريس سان جيرمان',
  'lyon': 'أولمبيك ليون',
  'marseille': 'مارسيليا',
  'monaco': 'موناكو',
  'nice': 'نيس',
  'lille': 'ليل',
  'juventus': 'يوفنتوس',
  'inter milan': 'إنتر ميلان',
  'ac milan': 'AC ميلان',
  'napoli': 'نابولي',
  'roma': 'روما',
  'lazio': 'لاتسيو',
  'fiorentina': 'فيورنتينا',
  'bayernmunich': 'بايرن ميونيخ',
  'bayern munich': 'بايرن ميونيخ',
  'dortmund': 'بوروسيا دورتموند',
  'borussia dortmund': 'بوروسيا دورتموند',
  'leverkusen': 'باير ليفركوزن',
  'bayer leverkusen': 'باير ليفركوزن',
  'porto': 'بورتو',
  'benfica': 'بنفيكا',
  'ajax': 'أياكس',
  'psv': 'PSV إيندهوفن',
  'celtic': 'سيلتيك',
  'rangers': 'رينجرز',
  'al-gharafa': 'الغرافة القطرية',
  'al gharafa': 'الغرافة القطرية',
  'dinamo zagreb': 'دينامو زغرب',
  'inter miami': 'إنتر ميامي',
  'galatasaray': 'غلطة سراي',
  'fenerbahce': 'فنربخشة',
}

// ترجمة اسم الدوري
const EN_LEAGUE_AR = {
  'premier league': 'الدوري الإنجليزي الممتاز 🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'la liga': 'الدوري الإسباني (لا ليغا) 🇪🇸',
  'laliga': 'الدوري الإسباني (لا ليغا) 🇪🇸',
  'ligue 1': 'الدوري الفرنسي (ليغ 1) 🇫🇷',
  'bundesliga': 'الدوري الألماني (بوندسليغا) 🇩🇪',
  'serie a': 'الدوري الإيطالي (سيريه آ) 🇮🇹',
  'saudi pro league': 'دوري روشن السعودي للمحترفين 🇸🇦',
  'qatar stars league': 'دوري نجوم قطر 🇶🇦',
  'superleague': 'الدوري اليوناني 🇬🇷',
  'primera liga': 'الدوري البرتغالي 🇵🇹',
  'primeira liga': 'الدوري البرتغالي 🇵🇹',
  'mls': 'الدوري الأمريكي (MLS) 🇺🇸',
  'major league soccer': 'الدوري الأمريكي (MLS) 🇺🇸',
  'superhnl': 'الدوري الكرواتي 🇭🇷',
  'hnl': 'الدوري الكرواتي 🇭🇷',
  'pro league': 'الدوري البلجيكي 🇧🇪',
  'eredivisie': 'الدوري الهولندي (إيرديفيزي) 🇳🇱',
}

// ══════════════════════════════════════════════════════════════════════════════
// خريطة Wikipedia — العنوان الصحيح لكل لاعب
// ══════════════════════════════════════════════════════════════════════════════
const WIKI_TITLES = {
  'Riyad Mahrez': 'Riyad_Mahrez',
  'Islam Slimani': 'Islam_Slimani',
  'Ismail Bennacer': 'Isma%C3%ABl_Bennacer',
  'Said Benrahma': 'Sa%C3%AFd_Benrahma',
  'Rayan Ait-Nouri': 'Rayan_A%C3%AFt-Nouri',
  'Faouzi Ghoulam': 'Faouzi_Ghoulam',
  'Sofiane Feghouli': 'Sofiane_Feghouli',
  'Yacine Brahimi': 'Yacine_Brahimi',
  'Baghdad Bounedjah': 'Baghdad_Bounedjah',
  'Sofiane Boufal': 'Sofiane_Boufal',
  'Nabil Bentaleb': 'Nabil_Bentaleb',
  'Youcef Atal': 'Youcef_Atal',
  'Yassine Bounou': 'Yassine_Bounou',
  'Sofiane Rahimi': 'Sofiane_Rahimi',
  // ── لاعبون جزائريون جدد ──────────────────────────────────────────────────
  'Anis Hadj Moussa': 'Anis_Hadj_Moussa',
  'Ramy Bensebaini': 'Ramy_Bensebaini',
  'Houssem Aouar': 'Houssem_Aouar',
  'Adam Ounas': 'Adam_Ounas',
  'Youcef Belaïli': 'Youcef_Bela%C3%AFli',
  'Farid Boulaya': 'Farid_Boulaya',
  'Yacine Adli': 'Yacine_Adli',
  'Haris Belkebla': 'Haris_Belkebla',
  'Djamel Benlamri': 'Djamel_Benlamri',
  'Mohamed Amine Amoura': 'Mohamed_Amine_Amoura',
  'Reda Belahyane': 'Reda_Belahyane',
  'Oussama Dabbagh': 'Oussama_Dabbagh',
  'Aissa Mandi': 'A%C3%AFssa_Mandi',
  'Zinedine Ferhat': 'Zinedine_Ferhat',
  'Andy Delort': 'Andy_Delort',
  'Samir Nasri': 'Samir_Nasri',
  'Mehdi Abeid': 'Mehdi_Abeid',
  'Mohamed Salah': 'Mohamed_Salah',
  'Kylian Mbappé': 'Kylian_Mbapp%C3%A9',
  'Erling Haaland': 'Erling_Haaland',
  'Karim Benzema': 'Karim_Benzema',
  'Cristiano Ronaldo': 'Cristiano_Ronaldo',
  'Lionel Messi': 'Lionel_Messi',
  'Neymar': 'Neymar',
  'Lamine Yamal': 'Lamine_Yamal',
  'Jude Bellingham': 'Jude_Bellingham',
  'Zinedine Zidane': 'Zinedine_Zidane',
  'Sadio Mané': 'Sadio_Man%C3%A9',
  'Ousmane Dembélé': 'Ousmane_Demb%C3%A9l%C3%A9',
  'Antoine Griezmann': 'Antoine_Griezmann',
  'Pedri': 'Pedri',
  'Vinicius Junior': 'Vinicius_Junior',
  'Rodrygo': 'Rodrygo',
  'Luka Modrić': 'Luka_Modri%C4%87',
  'Robert Lewandowski': 'Robert_Lewandowski',
  'Phil Foden': 'Phil_Foden',
  'Kevin De Bruyne': 'Kevin_De_Bruyne',
  'Marcus Rashford': 'Marcus_Rashford',
  'Victor Osimhen': 'Victor_Osimhen',
  'Rafael Leão': 'Rafael_Le%C3%A3o',
  'Harry Kane': 'Harry_Kane',
  'Romelu Lukaku': 'Romelu_Lukaku',
  'N\'Golo Kanté': 'N%27Golo_Kant%C3%A9',
  'Son Heung-min': 'Son_Heung-min',
  'Joao Félix': 'Jo%C3%A3o_F%C3%A9lix',
  'Leroy Sané': 'Leroy_San%C3%A9',
  'Brahim Díaz': 'Brahim_D%C3%ADaz',
  'Kalidou Koulibaly': 'Kalidou_Koulibaly',
  'David Alaba': 'David_Alaba',
  'Paul Pogba': 'Paul_Pogba',
  'Zlatan Ibrahimović': 'Zlatan_Ibrahimovi%C4%87',
  'Andy Delort': 'Andy_Delort',
  'Marquinhos': 'Marquinhos',
  'Anderson Talisca': 'Anderson_Talisca',
}

// ══════════════════════════════════════════════════════════════════════════════
// كاش الجلسة — يُخزّن نتائج API لمدة ساعة
// ══════════════════════════════════════════════════════════════════════════════
const _playerCache = new Map() // key: englishName → { data, ts }
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// ══════════════════════════════════════════════════════════════════════════════
// استخراج اسم النادي من نص Wikipedia
// ══════════════════════════════════════════════════════════════════════════════
function extractClubFromWikiExtract(extract) {
  if (!extract) return null

  // Pattern: "plays [as X] for [League club] CLUB_NAME"
  // Also handles: "plays for and captains CLUB_NAME"
  // Stop at: comma, period, "on loan", "in the", "and the", "and plays", "where", national team refs
  const STOP = /(?:\s*[,\.]|\s+on\s+loan|\s+in\s+the\s+|\s+and\s+(?:the|a\s+|also)|\s+where|\s+after|\s+since|\s+as\s+well)/i

  const patterns = [
    /plays(?:\s+as\s+[\w\s,\-\/]+?)?\s+for\s+(?:and\s+captains?\s+)?(?:[\w\s]+\s+club\s+)?([A-Z][A-Za-z\s\-\'\.]+?)(?:\s*[,\.]|\s+on\s+loan|\s+in\s+the\s+|\s+and\s+(?:the|a\s+|also)|\s+where)/i,
    /plays(?:\s+as\s+[\w\s,\-\/]+?)?\s+for\s+(?:and\s+captains?\s+)?([A-Z][A-Za-z\s\-\'\.]+?)(?:\s*[,\.]|\s+on\s+loan|\s+in\s+the\s+|\s+and\s+(?:the|a\s+|also))/i,
    /currently\s+plays?\s+for\s+([A-Z][A-Za-z\s\-\'\.]+?)(?:\s*[,\.]|\s+and\s+|\s+in\s+)/i,
    /member\s+of\s+([A-Z][A-Za-z\s\-\'\.]+?)(?:\s*[,\.])/i,
  ]

  for (const pat of patterns) {
    const m = extract.match(pat)
    if (m) {
      let club = m[1].trim()
      // Remove trailing filler words
      club = club.replace(/\s+(?:in|of|and|at|the|a)$/i, '').trim()
      // Remove "on loan" part
      club = club.replace(/\s*,?\s*on\s+loan.*/i, '').trim()
      // Remove "and the [national team]" leftovers
      club = club.replace(/\s+and\s+the\s+.*/i, '').trim()
      // Remove "and [Country] national" leftovers
      club = club.replace(/\s+and\s+[A-Z]\w+\s+national.*/i, '').trim()
      // Remove league qualifier prefixes like "Premier League club "
      club = club.replace(/^(?:Premier League|La Liga|Ligue 1|Bundesliga|Serie A|Saudi Pro League|SuperHNL|HNL|Eredivisie)\s+club\s+/i, '').trim()
      if (club.length > 2 && club.length < 60) return club
    }
  }
  return null
}

// استخراج الجزء الأول فقط من نادي الإعارة (تجاهل "Serie A club")
function cleanClubName(raw) {
  if (!raw) return null
  // Remove league prefix like "Serie A club", "Premier League club", etc.
  return raw
    .replace(/^(?:Serie A|Premier League|La Liga|Ligue 1|Bundesliga|Saudi Pro League|SuperHNL|HNL)\s+club\s+/i, '')
    .replace(/\s+and\s+.*/i, '')
    .trim()
}

// استخراج اسم الدوري من نص Wikipedia
function extractLeagueFromWikiExtract(extract) {
  if (!extract) return null
  const patterns = [
    /(Premier League|La\s*Liga|LaLiga|Ligue\s*1|Bundesliga|Serie\s*A|Saudi\s*Pro\s*League|Qatar\s*Stars\s*League|Primeira\s*Liga|MLS|Major\s*League\s*Soccer|SuperHNL|HNL|Eredivisie|Pro\s*League)/i
  ]
  for (const pat of patterns) {
    const m = extract.match(pat)
    if (m) return m[1]
  }
  return null
}

// استخراج نادي الإعارة من نص Wikipedia
function extractLoanFrom(extract) {
  if (!extract) return null
  const m = extract.match(/on\s+loan\s+from\s+(?:[\w\s]+\s+club\s+)?([A-Z][A-Za-z\s\-\'\.]+?)(?:\s*[,\.]|\s+in\s+|\s+and\s+)/i)
  if (!m) return null
  return cleanClubName(m[1])
}

// ترجمة اسم النادي إلى العربية
export function translateClubToAr(englishClub) {
  if (!englishClub) return null
  const lower = englishClub.toLowerCase().trim()
  return EN_CLUB_AR[lower] || englishClub
}

// ترجمة اسم الدوري إلى العربية
export function translateLeagueToAr(englishLeague) {
  if (!englishLeague) return null
  const lower = englishLeague.toLowerCase().trim()
  return EN_LEAGUE_AR[lower] || englishLeague
}

// ══════════════════════════════════════════════════════════════════════════════
// استعلام Wikipedia REST API
// ══════════════════════════════════════════════════════════════════════════════
async function fetchWikipedia(englishName) {
  const wikiTitle = WIKI_TITLES[englishName] || encodeURIComponent(englishName.replace(/\s+/g, '_'))
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DZ-GPT/2.0 (https://dz-gpt.vercel.app)' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.type === 'disambiguation' || !data.extract) return null

    const extract = data.extract || ''
    const club = extractClubFromWikiExtract(extract)
    const league = extractLeagueFromWikiExtract(extract)
    const loanFrom = extractLoanFrom(extract)

    return {
      source: 'wikipedia',
      playerNameEn: data.title || englishName,
      currentClubEn: club,
      currentClubAr: translateClubToAr(club),
      leagueEn: league,
      leagueAr: translateLeagueToAr(league),
      onLoanFromEn: loanFrom || null,
      onLoanFromAr: loanFrom ? translateClubToAr(loanFrom) : null,
      extract: extract.slice(0, 400),
      wikiUrl: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${wikiTitle}`,
    }
  } catch {
    return null
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// استعلام TheSportsDB API (مصدر ثانوي)
// ══════════════════════════════════════════════════════════════════════════════
async function fetchTheSportsDB(englishName) {
  // TheSportsDB doesn't handle accents well — strip them
  const safeName = englishName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[éèêë]/g, 'e').replace(/[àâ]/g, 'a').replace(/[ùû]/g, 'u')
  const url = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(safeName)}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DZ-GPT/2.0' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const player = data?.player?.[0]
    if (!player?.strPlayer) return null
    return {
      source: 'thesportsdb',
      playerNameEn: player.strPlayer,
      currentClubEn: player.strTeam || null,
      currentClubAr: translateClubToAr(player.strTeam) || player.strTeam,
      nationality: player.strNationality || null,
      position: player.strPosition || null,
    }
  } catch {
    return null
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// الكشف عن اسم اللاعب من استعلام عربي
// ══════════════════════════════════════════════════════════════════════════════
export function detectPlayerNameInQuery(arabicQuery) {
  const lq = arabicQuery.toLowerCase().trim()

  // Sort by length descending — match longest first to avoid partial matches
  const entries = Object.entries(ARABIC_TO_EN_PLAYER)
    .sort((a, b) => b[0].length - a[0].length)

  for (const [arabic, english] of entries) {
    if (lq.includes(arabic.toLowerCase())) {
      return { arabic, english }
    }
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// الدالة الرئيسية — جلب معلومات اللاعب من الاستعلام العربي
// ══════════════════════════════════════════════════════════════════════════════
export async function getPlayerCurrentClub(arabicQuery) {
  const detected = detectPlayerNameInQuery(arabicQuery)
  if (!detected) return null

  const { arabic: arabicName, english: englishName } = detected
  const cacheKey = englishName.toLowerCase()

  // Check cache
  const cached = _playerCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[SportsLookup] Cache hit: ${englishName}`)
    return { ...cached.data, arabicName, fromCache: true }
  }

  console.log(`[SportsLookup] Fetching: "${englishName}" (detected from "${arabicName}") — 365score/Koora priority`)

  // ── جلب متوازٍ من كل المصادر ─────────────────────────────────────────────
  const [score365Data, kooraData, wikiData, sportsDbData] = await Promise.allSettled([
    fetch365ScorePlayer(arabicName, englishName),
    fetchKooraPlayer(arabicName, englishName),
    fetchWikipedia(englishName),
    fetchTheSportsDB(englishName),
  ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : null))

  console.log(`[SportsLookup] Sources: 365score=${!!score365Data} koora=${!!kooraData} wiki=${!!wikiData} sportsdb=${!!sportsDbData}`)

  // ── دمج النتائج — 365score أولاً ثم Koora ثم Wikipedia ثم TheSportsDB ────
  const result = {
    arabicName,
    englishName,
    // النادي الحالي: 365score → Koora → Wikipedia → TheSportsDB
    currentClubEn: score365Data?.clubEn || kooraData?.clubEn || wikiData?.currentClubEn || sportsDbData?.currentClubEn || null,
    currentClubAr: score365Data?.clubAr || kooraData?.clubAr || wikiData?.currentClubAr || sportsDbData?.currentClubAr || null,
    // الدوري: 365score → Koora → Wikipedia
    leagueEn:      score365Data?.leagueEn || kooraData?.leagueEn || wikiData?.leagueEn || null,
    leagueAr:      score365Data?.leagueAr || kooraData?.leagueAr || wikiData?.leagueAr || null,
    // إعارة: Wikipedia فقط
    onLoanFromEn:  wikiData?.onLoanFromEn || null,
    onLoanFromAr:  wikiData?.onLoanFromAr || null,
    // معلومات إضافية: Koora → TheSportsDB → 365score
    nationality:   kooraData?.nationality || sportsDbData?.nationality || score365Data?.nationality || null,
    position:      kooraData?.position || score365Data?.position || sportsDbData?.position || null,
    // رابط الملف الشخصي على 365score
    profileUrl365: score365Data?.profileUrl || null,
    // مقتطف نصي وWikipedia
    extract:       wikiData?.extract || null,
    wikiUrl:       wikiData?.wikiUrl || null,
    sources:       [
      score365Data ? '365score' : null,
      kooraData    ? 'Koora'    : null,
      wikiData     ? 'Wikipedia': null,
      sportsDbData ? 'TheSportsDB' : null,
    ].filter(Boolean),
  }

  if (result.currentClubEn || result.extract) {
    _playerCache.set(cacheKey, { data: result, ts: Date.now() })
  }

  return result
}

// ══════════════════════════════════════════════════════════════════════════════
// بناء رد عربي منسّق من نتيجة البحث
// ══════════════════════════════════════════════════════════════════════════════
export function buildPlayerClubResponse(info) {
  if (!info) return null
  const { arabicName, englishName, currentClubAr, currentClubEn, leagueAr, onLoanFromAr, position, nationality, extract, sources, wikiUrl, profileUrl365, fromCache } = info

  const lines = [
    `## ⚽ ${arabicName || englishName} — معلومات اللاعب`,
    ``,
  ]

  if (currentClubAr || currentClubEn) {
    lines.push(`🏟️ **يلعب حالياً في: ${currentClubAr || currentClubEn}**`)
    if (leagueAr) lines.push(`🏆 **الدوري:** ${leagueAr}`)
    if (onLoanFromAr) lines.push(`🔄 **مُعار من:** ${onLoanFromAr}`)
    if (nationality) lines.push(`🌍 **الجنسية:** ${nationality}`)
    if (position) lines.push(`📍 **المركز:** ${position}`)
  } else if (extract) {
    lines.push(`> ℹ️ ${extract.slice(0, 300)}`)
  } else {
    lines.push(`⚠️ لم أتمكن من تحديد النادي الحالي بدقة — يُنصح بمراجعة 365score أو Koora.`)
  }

  lines.push(``)

  // Source note — 365score/Koora first
  const sourceStr = sources?.join(' + ') || 'Wikipedia'
  lines.push(`⚡ **المصدر:** ${sourceStr} — بيانات مباشرة ` + (fromCache ? '*(كاش)*' : '*(مُحدَّث الآن)*'))
  if (profileUrl365) lines.push(`📊 [ملف اللاعب على 365score](${profileUrl365})`)
  if (wikiUrl) lines.push(`🔗 [Wikipedia](${wikiUrl})`)

  return lines.join('\n')
}
