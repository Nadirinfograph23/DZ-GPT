/**
 * lib/static-facts.js — Static Knowledge Fast-Path
 *
 * يُجيب فوراً (<1ms) على الأسئلة ذات الإجابات الثابتة
 * بدون أي استدعاء لـ LLM.
 *
 * الفئات المغطاة:
 *   - عواصم الدول (عربي + فرنسي + إنجليزي)
 *   - حقائق جزائرية: جغرافيا، تاريخ، ولايات، رياضة، ثقافة، دارجة
 *   - الإسلام والقرآن
 *   - تقنية ومعلوماتية
 *   - صحة وجسم بشري
 *   - رياضيات وثوابت علمية
 *
 * الاستخدام:
 *   import { lookupStaticFact } from './lib/static-facts.js'
 *   const answer = lookupStaticFact(userMessage)
 *   if (answer) return res.json({ content: answer, _static: true })
 */

// ══════════════════════════════════════════════════════════════════════════════
// CAPITALS TABLE — {country aliases} → capital
// ══════════════════════════════════════════════════════════════════════════════
const CAPITALS = [
  // Africa
  { names: ['الجزائر','djazair','algeria','algérie'], capital: 'الجزائر العاصمة', capital_fr: 'Alger' },
  { names: ['المغرب','maroc','morocco'], capital: 'الرباط', capital_fr: 'Rabat' },
  { names: ['تونس','tunisie','tunisia'], capital: 'تونس العاصمة', capital_fr: 'Tunis' },
  { names: ['ليبيا','libye','libya'], capital: 'طرابلس', capital_fr: 'Tripoli' },
  { names: ['مصر','egypte','egypt'], capital: 'القاهرة', capital_fr: 'Le Caire' },
  { names: ['موريتانيا','mauritanie','mauritania'], capital: 'نواكشوط', capital_fr: 'Nouakchott' },
  { names: ['السودان','soudan','sudan'], capital: 'الخرطوم', capital_fr: 'Khartoum' },
  { names: ['إثيوبيا','éthiopie','ethiopia'], capital: 'أديس أبابا', capital_fr: 'Addis-Abeba' },
  { names: ['نيجيريا','nigéria','nigeria'], capital: 'أبوجا', capital_fr: 'Abuja' },
  { names: ['غانا','ghana'], capital: 'أكرا', capital_fr: 'Accra' },
  { names: ['السنغال','sénégal','senegal'], capital: 'داكار', capital_fr: 'Dakar' },
  { names: ['كوت ديفوار','côte d\'ivoire','ivory coast'], capital: 'أبيدجان / ياموسوكرو', capital_fr: 'Abidjan / Yamoussoukro' },
  { names: ['الكاميرون','cameroun','cameroon'], capital: 'ياوندي', capital_fr: 'Yaoundé' },
  { names: ['مالي','mali'], capital: 'باماكو', capital_fr: 'Bamako' },
  { names: ['بوركينا فاسو','burkina faso'], capital: 'واغادوغو', capital_fr: 'Ouagadougou' },
  { names: ['النيجر','niger'], capital: 'نيامي', capital_fr: 'Niamey' },
  { names: ['تشاد','tchad','chad'], capital: 'نجامينا', capital_fr: 'N\'Djamena' },
  { names: ['جنوب أفريقيا','afrique du sud','south africa'], capital: 'بريتوريا', capital_fr: 'Pretoria' },
  { names: ['كينيا','kenya'], capital: 'نيروبي', capital_fr: 'Nairobi' },
  { names: ['تنزانيا','tanzanie','tanzania'], capital: 'دودوما', capital_fr: 'Dodoma' },
  { names: ['أنغولا','angola'], capital: 'لواندا', capital_fr: 'Luanda' },
  { names: ['موزمبيق','mozambique'], capital: 'مابوتو', capital_fr: 'Maputo' },
  { names: ['زيمبابوي','zimbabwe'], capital: 'هراري', capital_fr: 'Harare' },
  // Europe
  { names: ['فرنسا','france'], capital: 'باريس', capital_fr: 'Paris' },
  { names: ['إسبانيا','espagne','spain'], capital: 'مدريد', capital_fr: 'Madrid' },
  { names: ['إيطاليا','italie','italy'], capital: 'روما', capital_fr: 'Rome' },
  { names: ['ألمانيا','allemagne','germany'], capital: 'برلين', capital_fr: 'Berlin' },
  { names: ['المملكة المتحدة','إنجلترا','royaume-uni','united kingdom','england','uk'], capital: 'لندن', capital_fr: 'Londres' },
  { names: ['البرتغال','portugal'], capital: 'لشبونة', capital_fr: 'Lisbonne' },
  { names: ['هولندا','pays-bas','netherlands'], capital: 'أمستردام', capital_fr: 'Amsterdam' },
  { names: ['بلجيكا','belgique','belgium'], capital: 'بروكسل', capital_fr: 'Bruxelles' },
  { names: ['سويسرا','suisse','switzerland'], capital: 'برن', capital_fr: 'Berne' },
  { names: ['النمسا','autriche','austria'], capital: 'فيينا', capital_fr: 'Vienne' },
  { names: ['بولندا','pologne','poland'], capital: 'وارسو', capital_fr: 'Varsovie' },
  { names: ['السويد','suède','sweden'], capital: 'ستوكهولم', capital_fr: 'Stockholm' },
  { names: ['النرويج','norvège','norway'], capital: 'أوسلو', capital_fr: 'Oslo' },
  { names: ['الدنمارك','danemark','denmark'], capital: 'كوبنهاغن', capital_fr: 'Copenhague' },
  { names: ['فنلندا','finlande','finland'], capital: 'هلسنكي', capital_fr: 'Helsinki' },
  { names: ['اليونان','grèce','greece'], capital: 'أثينا', capital_fr: 'Athènes' },
  { names: ['تركيا','turquie','turkey'], capital: 'أنقرة', capital_fr: 'Ankara' },
  { names: ['روسيا','russie','russia'], capital: 'موسكو', capital_fr: 'Moscou' },
  { names: ['أوكرانيا','ukraine'], capital: 'كييف', capital_fr: 'Kyiv' },
  { names: ['رومانيا','roumanie','romania'], capital: 'بوخارست', capital_fr: 'Bucarest' },
  { names: ['المجر','hongrie','hungary'], capital: 'بودابست', capital_fr: 'Budapest' },
  { names: ['التشيك','رجيكيا','tchéquie','czech republic'], capital: 'براغ', capital_fr: 'Prague' },
  // Middle East & Asia
  { names: ['المملكة العربية السعودية','سعودية','arabie saoudite','saudi arabia'], capital: 'الرياض', capital_fr: 'Riyad' },
  { names: ['الإمارات','الامارات','émirats arabes unis','uae'], capital: 'أبوظبي', capital_fr: 'Abou Dhabi' },
  { names: ['قطر','qatar'], capital: 'الدوحة', capital_fr: 'Doha' },
  { names: ['الكويت','koweït','kuwait'], capital: 'الكويت العاصمة', capital_fr: 'Koweït' },
  { names: ['البحرين','bahreïn','bahrain'], capital: 'المنامة', capital_fr: 'Manama' },
  { names: ['عُمان','oman'], capital: 'مسقط', capital_fr: 'Mascate' },
  { names: ['اليمن','yémen','yemen'], capital: 'صنعاء', capital_fr: 'Sanaa' },
  { names: ['العراق','irak','iraq'], capital: 'بغداد', capital_fr: 'Bagdad' },
  { names: ['سوريا','syrie','syria'], capital: 'دمشق', capital_fr: 'Damas' },
  { names: ['لبنان','liban','lebanon'], capital: 'بيروت', capital_fr: 'Beyrouth' },
  { names: ['الأردن','jordanie','jordan'], capital: 'عمّان', capital_fr: 'Amman' },
  { names: ['فلسطين','palestine'], capital: 'القدس', capital_fr: 'Jérusalem' },
  { names: ['إيران','iran'], capital: 'طهران', capital_fr: 'Téhéran' },
  { names: ['أفغانستان','afghanistan'], capital: 'كابول', capital_fr: 'Kaboul' },
  { names: ['باكستان','pakistan'], capital: 'إسلام آباد', capital_fr: 'Islamabad' },
  { names: ['الهند','inde','india'], capital: 'نيودلهي', capital_fr: 'New Delhi' },
  { names: ['الصين','chine','china'], capital: 'بكين', capital_fr: 'Pékin' },
  { names: ['اليابان','japon','japan'], capital: 'طوكيو', capital_fr: 'Tokyo' },
  { names: ['كوريا الجنوبية','corée du sud','south korea'], capital: 'سيول', capital_fr: 'Séoul' },
  { names: ['إندونيسيا','indonésie','indonesia'], capital: 'جاكرتا', capital_fr: 'Jakarta' },
  { names: ['ماليزيا','malaisie','malaysia'], capital: 'كوالالمبور', capital_fr: 'Kuala Lumpur' },
  { names: ['تايلاند','thaïlande','thailand'], capital: 'بانكوك', capital_fr: 'Bangkok' },
  { names: ['فيتنام','vietnam'], capital: 'هانوي', capital_fr: 'Hanoï' },
  // Americas
  { names: ['الولايات المتحدة','أمريكا','états-unis','usa','united states'], capital: 'واشنطن العاصمة', capital_fr: 'Washington D.C.' },
  { names: ['كندا','canada'], capital: 'أوتاوا', capital_fr: 'Ottawa' },
  { names: ['المكسيك','mexique','mexico'], capital: 'مكسيكو سيتي', capital_fr: 'Mexico' },
  { names: ['البرازيل','brésil','brazil'], capital: 'برازيليا', capital_fr: 'Brasilia' },
  { names: ['الأرجنتين','argentine','argentina'], capital: 'بوينس آيرس', capital_fr: 'Buenos Aires' },
  { names: ['كولومبيا','colombie','colombia'], capital: 'بوغوتا', capital_fr: 'Bogotá' },
  { names: ['تشيلي','chili','chile'], capital: 'سانتياغو', capital_fr: 'Santiago' },
  { names: ['بيرو','pérou','peru'], capital: 'ليما', capital_fr: 'Lima' },
  // Oceania
  { names: ['أستراليا','australie','australia'], capital: 'كانبرا', capital_fr: 'Canberra' },
  { names: ['نيوزيلندا','nouvelle-zélande','new zealand'], capital: 'ويلينغتون', capital_fr: 'Wellington' },
]

// ══════════════════════════════════════════════════════════════════════════════
// ALGERIA FACTS
// ══════════════════════════════════════════════════════════════════════════════
const DZ_FACTS = [
  // ── الجغرافيا والإحصاء ──────────────────────────────────────────────────
  {
    patterns: [/كم.*ولاية|عدد.*ولايات|ولايات.*الجزائر|combien.*wilaya|how many.*wilaya/i],
    answer: '🇩🇿 الجزائر تتكون من **58 ولاية** (بعد التقسيم الإداري الأخير 2022).',
  },
  {
    patterns: [/مساحة.*الجزائر|الجزائر.*مساحتها|superficie.*algérie|area.*algeria/i],
    answer: '🇩🇿 مساحة الجزائر **2,381,741 كم²** — أكبر دولة في أفريقيا وفي العالم العربي.',
  },
  {
    patterns: [/عدد سكان الجزائر|عدد.*السكان.*الجزائر|population.*algérie|algeria.*population/i],
    answer: '🇩🇿 عدد سكان الجزائر يتجاوز **46 مليون نسمة** (تقدير 2025).',
  },
  {
    patterns: [/عاصمة الجزائر|عاصمة.*دولة الجزائر/i],
    answer: '🇩🇿 عاصمة الجزائر هي **الجزائر العاصمة** (Alger).',
  },
  {
    patterns: [/أكبر.*دولة.*أفريقيا|أكبر.*دولة.*عربي|plus grande.*afrique/i],
    answer: '🇩🇿 **الجزائر** هي أكبر دولة في أفريقيا وفي العالم العربي بمساحة 2,381,741 كم².',
  },
  {
    patterns: [/أكبر.*مدينة.*الجزائر|plus grande.*ville.*algérie/i],
    answer: '🇩🇿 أكبر مدينة في الجزائر هي **الجزائر العاصمة**، تليها **وهران** ثم **قسنطينة**.',
  },
  {
    patterns: [/أعلى.*جبل.*الجزائر|جبل.*تاهات|plus haut.*sommet.*algérie/i],
    answer: '⛰️ أعلى قمة في الجزائر هي **جبل تاهات** بارتفاع **2,908 متر** في الهقار (تمنراست).',
  },
  {
    patterns: [/أطول.*نهر.*الجزائر|نهر.*شلف|fleuve.*algérie/i],
    answer: '🌊 أطول نهر في الجزائر هو **نهر الشلف** بطول حوالي **700 كم**.',
  },
  {
    patterns: [/صحراء.*الجزائر|مساحة.*صحراء|algérie.*sahara/i],
    answer: '🏜️ تُغطي الصحراء الكبرى أكثر من **85%** من مساحة الجزائر — أي حوالي 2 مليون كم².',
  },
  {
    patterns: [/عدد.*بلديات.*الجزائر|كم.*بلدية/i],
    answer: '🇩🇿 الجزائر تحتوي على **1,541 بلدية** و**58 ولاية**.',
  },
  // ── التاريخ ──────────────────────────────────────────────────────────────
  {
    patterns: [/استقلال الجزائر|تاريخ الاستقلال|متى.*استقل.*الجزائر|متى.*كان.*استقلال|independence.*algérie|5.*juillet|5.*يوليو.*1962/i],
    answer: '🇩🇿 حصلت الجزائر على استقلالها في **5 يوليو 1962** بعد ثورة تحرير امتدت من **1954 إلى 1962**.',
  },
  {
    patterns: [/ثورة.*نوفمبر|1.*نوفمبر.*1954|أول.*نوفمبر|فاتح نوفمبر/i],
    answer: '🇩🇿 اندلعت **ثورة التحرير الجزائرية** في **1 نوفمبر 1954** — وهو يوم وطني يُحتفل به كـ"يوم الثورة".',
  },
  {
    patterns: [/من هو.*بن بلة|أول.*رئيس.*الجزائر|من.*أول.*رئيس|premier.*président.*algérie/i],
    answer: '🇩🇿 **أحمد بن بلة** هو أول رئيس للجزائر المستقلة (1963–1965).',
  },
  {
    patterns: [/رئيس.*الجزائر.*الحالي|من.*يحكم.*الجزائر|président.*algérie.*actuel/i],
    answer: '🇩🇿 الرئيس الحالي للجزائر هو **عبد المجيد تبون** (منتخب منذ ديسمبر 2019، وأُعيد انتخابه 2024).',
  },
  {
    patterns: [/متى.*احتُل.*الجزائر|الاستعمار.*الفرنسي|france.*algérie.*colonisation/i],
    answer: '🇩🇿 احتلت فرنسا الجزائر في **5 يوليو 1830** واستمر الاحتلال **132 سنة** حتى 1962.',
  },
  // ── اللغة والثقافة ───────────────────────────────────────────────────────
  {
    patterns: [/لغة.*الجزائر|لغة رسمية.*الجزائر|langue.*algérie|اللغة.*رسمية/i],
    answer: '🇩🇿 اللغتان الرسميتان هما **العربية** و**الأمازيغية (تمازيغت)**. وتُستخدم الفرنسية على نطاق واسع اجتماعياً وإدارياً.',
  },
  {
    patterns: [/دين(?!ار).*الجزائر|الدين.*رسمي.*الجزائر|religion.*algérie/i],
    answer: '🕌 الدين الرسمي للجزائر هو **الإسلام**، والغالبية العظمى من السكان مسلمون سنة.',
  },
  {
    patterns: [/عملة الجزائر|عملة.*جزائرية|monnaie.*algérie|دينار جزائري/i],
    answer: '💰 عملة الجزائر هي **الدينار الجزائري (DZD)** — رمزه دج.',
  },
  {
    patterns: [/العيد.*الوطني.*الجزائر|يوم.*وطني.*الجزائر|fête nationale.*algérie/i],
    answer: '🇩🇿 الأعياد الوطنية الجزائرية:\n• **1 نوفمبر** — يوم الثورة\n• **5 يوليو** — يوم الاستقلال\n• **19 مارس** — يوم النصر',
  },
  // ── الاقتصاد والطاقة ─────────────────────────────────────────────────────
  {
    patterns: [/نفط.*الجزائر|بترول.*الجزائر|pétrole.*algérie|sonatrach/i],
    answer: '⛽ **سوناطراك** هي الشركة الوطنية للمحروقات في الجزائر — من أكبر شركات النفط في أفريقيا.',
  },
  {
    patterns: [/اقتصاد.*الجزائر|ناتج.*محلي.*الجزائر|PIB.*algérie|GDP.*algeria/i],
    answer: '📈 الناتج المحلي الإجمالي للجزائر يتجاوز **230 مليار دولار** (2024)، واقتصادها يعتمد أساساً على المحروقات.',
  },
  // ── التعليم والجامعات ────────────────────────────────────────────────────
  {
    patterns: [/أقدم.*جامعة.*الجزائر|جامعة.*قسنطينة|جامعة.*وهران|université.*algérie/i],
    answer: '🎓 أقدم جامعة في الجزائر هي **جامعة الجزائر 1 (بن يوسف بن خدة)** — تأسست عام **1909**.',
  },
  {
    patterns: [/عدد.*جامعات.*الجزائر|كم.*جامعة.*الجزائر|combien.*universités.*algérie/i],
    answer: '🎓 تمتلك الجزائر أكثر من **100 مؤسسة جامعية** (جامعات، مدارس عليا، مراكز جامعية).',
  },
  // ── الرياضة ──────────────────────────────────────────────────────────────
  {
    patterns: [/كأس.*العالم.*الجزائر|مونديال.*الجزائر|coupe du monde.*algérie/i],
    answer: '⚽ شاركت الجزائر في **5 نسخ من كأس العالم**: 1982، 1986، 2010، 2014، و**2026** (الحالية).\nأفضل نتيجة: **ربع النهائي 2014** في البرازيل.',
  },
  {
    // BUG-5 FIX: أضفنا أنماطاً إضافية لالتقاط "كم مرة فاز الجزائر" و"منتخب الجزائر AFCON"
    patterns: [
      /كأس.*أمم.*(?:أفريقيا|إفريقيا).*(?:الجزائر|الوطني|منتخب)/i,
      /(?:الجزائر|منتخب.*الجزائري|المنتخب.*الجزائري).*(?:فاز|ربح|تتوج|حمل|كأس).*(?:أمم.*(?:أفريقيا|إفريقيا)|CAN|AFCON)/i,
      /كم.*مرة.*(?:فاز|ربح|تتوج|حمل).*(?:الجزائر|المنتخب.*الجزائري)/i,
      /(?:الجزائر|منتخب.*الجزائر).*(?:بطل|أبطال|champion).*(?:أفريق|إفريق)/i,
      /CAN.*الجزائر|algérie.*CAN|AFCON.*algérie|algérie.*AFCON/i,
    ],
    answer: '🏆 فاز المنتخب الجزائري بـ**كأس أمم أفريقيا (CAN/AFCON)** مرتين:\n• **1990** — استُضيفت في الجزائر\n• **2019** — استُضيفت في مصر',
  },
  {
    patterns: [/رياح.*الجنوب|الخماسين|الشهيلي|sirocco/i],
    answer: '💨 **السيروكو (الشهيلي)** هو الريح الحارة الجافة القادمة من الصحراء — يُسمى محلياً "ريح الجنوب" وقد ترتفع درجات الحرارة معه إلى 45°م.',
  },
  {
    patterns: [/رقم هاتف.*الجزائر|مفتاح.*دولي.*الجزائر|indicatif.*algérie|country code.*algeria/i],
    answer: '📞 الرمز الدولي للجزائر هو **+213**.',
  },
  {
    patterns: [/نشيد.*وطني.*الجزائر|قسما|hymne.*algérie/i],
    answer: '🎵 النشيد الوطني الجزائري هو **"قسماً"** — كلماته للشاعر مفدي زكريا، لُحّن عام 1956.',
  },
  // ── الولايات الكبرى ──────────────────────────────────────────────────────
  {
    patterns: [/أكبر.*ولاية.*مساحة|ولاية.*تمنراست|plus grande.*wilaya/i],
    answer: '🗺️ **ولاية تمنراست** هي أكبر ولاية في الجزائر مساحةً (~557,000 كم²).',
  },
  {
    patterns: [/أكبر.*ولاية.*سكاناً|ولاية.*أكثر.*سكاناً|wilaya.*plus.*peuplée/i],
    answer: '🏙️ **ولاية الجزائر (العاصمة)** هي الأكثر سكاناً (~4 مليون نسمة)، تليها **تيزي وزو** و**بجاية**.',
  },
  {
    patterns: [/ولاية.*قسنطينة|constantine.*wilaya/i],
    answer: '🌉 **قسنطينة** (ولاية 25) تُعرف بـ"مدينة الجسور المعلّقة" — من أقدم المدن الجزائرية.',
  },
  {
    patterns: [/ولاية.*وهران|oran.*wilaya/i],
    answer: '🎭 **وهران** (ولاية 31) ثاني أكبر مدينة جزائرية — عاصمة الغرب، مشهورة بالموسيقى الراي.',
  },
  {
    patterns: [/ولاية.*تيزي وزو|ولاية.*تيزيوزو|tizi ouzou/i],
    answer: '🏔️ **تيزي وزو** (ولاية 15) عاصمة منطقة القبائل الكبرى — مشهورة بجبال جرجرة وثقافتها الأمازيغية.',
  },
  {
    patterns: [/ولاية.*بجاية|béjaïa|bgayet/i],
    answer: '🌊 **بجاية** (ولاية 6) مدينة ساحلية أمازيغية — يُنسب إليها انتقال **الأرقام الهندية-العربية** إلى أوروبا عبر العالم الفيبوناتشي.',
  },
  // ── الإسلام والقرآن ──────────────────────────────────────────────────────
  {
    patterns: [/أركان.*الإسلام|كم.*ركن.*إسلام|pillars.*islam/i],
    answer: '🕌 **أركان الإسلام الخمسة**:\n1. الشهادتان\n2. الصلاة (5 مرات يومياً)\n3. الزكاة\n4. صوم رمضان\n5. الحج',
  },
  {
    patterns: [/عدد.*سور.*القرآن|كم.*سورة.*القرآن|combien.*sourates/i],
    answer: '📖 القرآن الكريم يحتوي على **114 سورة** و**6,236 آية**.',
  },
  {
    patterns: [/أطول.*سورة.*القرآن|longest.*surah/i],
    answer: '📖 أطول سورة في القرآن الكريم هي **سورة البقرة** (286 آية).',
  },
  {
    patterns: [/أقصر.*سورة.*القرآن|shortest.*surah/i],
    answer: '📖 أقصر سورة في القرآن الكريم هي **سورة الكوثر** (3 آيات).',
  },
  {
    patterns: [/أجزاء.*القرآن|كم.*جزء.*قرآن/i],
    answer: '📖 القرآن الكريم مقسّم إلى **30 جزءاً** و**60 حزباً** و**240 ربعاً**.',
  },
  // ── تقنية ومعلوماتية ─────────────────────────────────────────────────────
  {
    patterns: [/ما.*هو.*الذكاء الاصطناعي|تعريف.*AI|définition.*intelligence artificielle/i],
    answer: '🤖 **الذكاء الاصطناعي (AI)** هو علم يهدف إلى بناء أنظمة حاسوبية قادرة على محاكاة القدرات البشرية كالتعلم والتفكير والحل المشكلات.',
  },
  {
    patterns: [/ما.*هو.*ChatGPT|شات.*جي.*بي.*تي|chatgpt.*ما/i],
    answer: '🤖 **ChatGPT** هو نموذج لغوي كبير (LLM) طوّرته شركة **OpenAI** — قادر على المحادثة، كتابة الكود، التلخيص والترجمة.',
  },
  {
    patterns: [/ما.*هو.*Python|بايثون.*لغة|python.*c'est quoi/i],
    answer: '💻 **Python** لغة برمجة عالية المستوى، مفسَّرة، سهلة التعلم — تُستخدم في الذكاء الاصطناعي، تحليل البيانات، تطوير الويب والأتمتة.',
  },
  {
    patterns: [/ما.*هو.*JavaScript|جافاسكريبت.*لغة|javascript.*c'est quoi/i],
    answer: '💻 **JavaScript** لغة برمجة أساسية للويب — تُشغَّل في المتصفح وعلى الخادم (Node.js)، ضرورية لتطوير المواقع التفاعلية.',
  },
  {
    patterns: [/ما.*هو.*HTML|تعريف.*HTML/i],
    answer: '💻 **HTML (HyperText Markup Language)** هو لغة الترميز الأساسية لبناء صفحات الويب — يُعرّف هيكل الصفحة ومحتواها.',
  },
  {
    patterns: [/ما.*هو.*CSS|تعريف.*CSS/i],
    answer: '💻 **CSS (Cascading Style Sheets)** لغة تنسيق تتحكم في شكل وتخطيط صفحات HTML — الألوان، الخطوط، التخطيط.',
  },
  {
    patterns: [/ما.*هو.*API|تعريف.*API|api c'est quoi/i],
    answer: '🔌 **API (Application Programming Interface)** واجهة برمجية تسمح لتطبيقين بالتواصل وتبادل البيانات — كـ API الطقس الذي يُعطيك درجة الحرارة.',
  },
  {
    patterns: [/ما.*هو.*GitHub|غيتهاب.*ما هو/i],
    answer: '💻 **GitHub** منصة لاستضافة ومشاركة الكود البرمجي باستخدام نظام التحكم بالإصدارات **Git** — تستخدمها ملايين المطورين عالمياً.',
  },
  // ── الصحة والجسم البشري ──────────────────────────────────────────────────
  {
    patterns: [/كم.*عظمة.*جسم|عدد عظام الجسم|combien.*os.*corps/i],
    answer: '🦴 جسم الإنسان البالغ يحتوي على **206 عظمة** (المولود يولد بـ270-300 عظمة تتلاحم مع النمو).',
  },
  {
    patterns: [/كم.*أسنان.*إنسان|عدد الأسنان|combien.*dents/i],
    answer: '🦷 الإنسان البالغ لديه **32 سناً** (بما فيها أسنان العقل الأربعة).',
  },
  {
    patterns: [/كم.*لتر.*دم|حجم الدم|volume.*sang/i],
    answer: '🩸 جسم الإنسان البالغ يحتوي على **4.5 إلى 5.5 لترات** من الدم في المتوسط.',
  },
  {
    patterns: [/ضربات.*القلب.*الطبيعية|معدل.*نبضات|fréquence cardiaque normale/i],
    answer: '❤️ معدل نبضات القلب الطبيعي للبالغ: **60–100 نبضة في الدقيقة** أثناء الراحة.',
  },
  // ── جغرافيا دول الجوار ───────────────────────────────────────────────────
  {
    patterns: [/دول.*تحدّ.*الجزائر|حدود.*الجزائر|pays.*frontaliers.*algérie/i],
    answer: '🗺️ الجزائر تتشارك حدوداً مع **7 دول**:\nتونس • ليبيا • النيجر • مالي • موريتانيا • المغرب • الصحراء الغربية (المغرب)',
  },
  {
    patterns: [/منافذ.*بحرية.*الجزائر|ساحل.*الجزائر|côte.*algérie|البحر.*المتوسط.*الجزائر/i],
    answer: '🌊 يبلغ طول الساحل الجزائري على **البحر الأبيض المتوسط** حوالي **1,200 كم**.',
  },
  // ── الطقس والمناخ ────────────────────────────────────────────────────────
  {
    patterns: [/مناخ.*الجزائر|طقس.*الجزائر.*عام|climat.*algérie/i],
    answer: '☀️ مناخ الجزائر متنوع:\n• **الشمال**: متوسطي (صيف حار جاف، شتاء معتدل ممطر)\n• **الجنوب**: صحراوي جاف (حرارة شديدة صيفاً، برد ليلي شتاءً)',
  },
  // ── الفن والموسيقى ───────────────────────────────────────────────────────
  {
    patterns: [/موسيقى.*راي|rai.*algérie|شاب.*خالد|cheb khaled/i],
    answer: '🎵 **موسيقى الراي** نوع موسيقي جزائري أصيل من **وهران** — أشهر أعلامه: **شاب خالد، شاب مامي، شاب حسني**. مُدرجة في التراث الإنساني لليونسكو 2022.',
  },
  {
    patterns: [/موسيقى.*قبايل|موسيقى.*أمازيغ|musique kabyle/i],
    answer: '🎵 **الموسيقى القبائلية** من أعرق الموروثات الجزائرية — أشهر أعلامها: **إيدير، لونيس آيت منقلات، عزيزة، تاكفاريناس**.',
  },
  {
    patterns: [/رحيمة.*ما هي|قصبة.*الجزائر|casbah.*algérie/i],
    answer: '🏛️ **قصبة الجزائر** موقع تراث عالمي لليونسكو منذ **1992** — مدينة عتيقة في قلب الجزائر العاصمة.',
  },
  // ── أسئلة الدارجة الشائعة ───────────────────────────────────────────────
  {
    patterns: [/واش.*راك|كيفاش|كيف حالك بالجزائري|كيف الحال.*دارجة/i],
    answer: '😊 "**واش راك؟**" أو "**كيفاش راك؟**" = كيف حالك بالدارجة الجزائرية — الرد الشائع: "**لاباس، نتي/نتا؟**" (بخير، وأنت؟)',
  },
  {
    patterns: [/^لاباس$|^لاباس\s*[!؟?]*$|^لا\s*باس$|لاباس\s+والحمد/i],
    answer: '😊 الحمد لله! كيفاش نعاونك اليوم؟',
  },
  {
    patterns: [/^بخير$|^بخير\s*[!؟?]*$/i],
    answer: '😊 الله يخليك! واش عندك؟',
  },
  {
    patterns: [/معنى.*بزاف|bezzaf.*معنى/i],
    answer: '💬 **بزّاف** (bezzaf) = كثيراً / جداً بالدارجة الجزائرية — مثال: "شكراً بزّاف" = شكراً جزيلاً.',
  },
  {
    patterns: [/معنى.*يزي|yezi.*معنى/i],
    answer: '💬 **يزي** (yezi) = كفى / يكفي / توقف بالدارجة الجزائرية.',
  },
  {
    patterns: [/معنى.*هكا|haka.*معنى|هاكا.*دارجة/i],
    answer: '💬 **هاكا** (haka) = هكذا / هكذا هو الأمر بالدارجة الجزائرية.',
  },
  // ── المطور — Developer Facts ──────────────────────────────────────────────
  {
    patterns: [
      /نذير\s*حوامرية|حوامرية\s*نذير|nadir\s*infograph|nadir\s*houamria|nadir\s*hawamria|infograph\s*nadir|من هو نذير|qui est nadir|who is nadir/i,
    ],
    answer: `👨‍💻 **نذير حوامرية — Nadir Infograph** 🇩🇿

مطوّر ومهندس ذكاء اصطناعي جزائري من **عنابة**، منشئ **DZ Agent** و**DZ-GPT** — منصة الذكاء الاصطناعي الجزائرية الأولى.

🎯 **تخصصاته:** Full-Stack AI Development · Multi-Agent Systems · NLP · الدارجة الجزائرية

📺 **ظهور تلفزيوني:** ضيف في **التلفزيون الوطني الجزائري** مع الدكتورة **عوماري فاطمة الزهراء** حول الذكاء الاصطناعي
🎬 [شاهد الحلقة](https://youtu.be/-DPOFfvRS-Q?si=TOkP1VFTApMcktJ7)

🌐 **تواصل معه:**
🔵 [فيسبوك](https://www.facebook.com/nadir.infograph23) | 📸 [إنستغرام](https://www.instagram.com/nadir.infograph?igsh=ZmJsZGhheXB0emli) | 🎵 [تيكتوك](https://www.tiktok.com/@nadirinfograph2) | ▶️ [يوتيوب](https://www.youtube.com/@Nadirinfograph)

🏅 [شاهد شهادة Replit الرسمية](https://dz-gpt.vercel.app/dz-agent-certificate.html)`,
  },
  {
    patterns: [/nadir.*tele|نذير.*تلفزيون|nadir.*tv|ظهر.*تلفزيون.*nadir|حصة.*ذكاء اصطناعي.*nadir|nadir.*algerie.*tv|al24.*nadir|nadir.*al24/i],
    answer: `📺 **نذير حوامرية — ظهورات تلفزيونية** 🇩🇿

**1. التلفزيون الوطني الجزائري:**
ضيف في حصة تقصي مع الدكتورة **عوماري فاطمة الزهراء** حول **الذكاء الاصطناعي**
🎬 [شاهد الحلقة على يوتيوب](https://youtu.be/-DPOFfvRS-Q?si=TOkP1VFTApMcktJ7)
📘 [شاهد على فيسبوك](https://www.facebook.com/share/1AM1jDkz8o/)

**2. قناة الجزائر الدولية AL24:**
ضيف حول موضوع **الذكاء الاصطناعي**
🎬 [شاهد على يوتيوب](https://m.youtube.com/watch?v=gAzvBi4N7ic)`,
  },
  {
    patterns: [/dz.?gpt.*من.*صنع|من.*صنع.*dz.?gpt|who.*made.*dz.?gpt|qui.*créé.*dz.?gpt|مطور.*dz.?gpt/i],
    answer: `🤖 **DZ-GPT** صنعه **نذير حوامرية (Nadir Infograph)** 🇩🇿 — مطوّر ومهندس ذكاء اصطناعي جزائري من عنابة.

🌍 الموقع: [dz-gpt.vercel.app](https://dz-gpt.vercel.app)
🔵 [تواصل مع المطور على فيسبوك](https://www.facebook.com/share/1AM1jDkz8o/)`,
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// MATH & UNIVERSAL CONSTANTS
// ══════════════════════════════════════════════════════════════════════════════
const MATH_FACTS = [
  {
    patterns: [/كم.*يوم.*أسبوع|عدد أيام الأسبوع|combien.*jours.*semaine|days.*week/i],
    answer: 'أيام الأسبوع **7 أيام**: الأحد، الاثنين، الثلاثاء، الأربعاء، الخميس، الجمعة، السبت.',
  },
  {
    patterns: [/كم.*شهر.*سنة|عدد أشهر السنة|combien.*mois/i],
    answer: 'أشهر السنة **12 شهراً**: يناير، فبراير، مارس، أبريل، مايو، يونيو، يوليو، أغسطس، سبتمبر، أكتوبر، نوفمبر، ديسمبر.',
  },
  {
    patterns: [/قيمة.*بي|ما هي.*pi|ما.*قيمة pi|رقم.*باي|valeur.*pi|value.*pi/i],
    answer: '**π (Pi) ≈ 3.14159265358979**\nالقيمة الدقيقة: نسبة محيط الدائرة إلى قطرها، عدد غير نسبي يمتد إلى ما لا نهاية.',
  },
  {
    patterns: [/كم.*ساعة.*يوم|عدد ساعات اليوم|combien.*heures.*jour/i],
    answer: 'اليوم يحتوي على **24 ساعة** = 1440 دقيقة = 86400 ثانية.',
  },
  {
    patterns: [/كم.*دقيقة.*ساعة|عدد دقائق الساعة/i],
    answer: 'الساعة تحتوي على **60 دقيقة** = 3600 ثانية.',
  },
  {
    patterns: [/كم.*ثانية.*دقيقة/i],
    answer: 'الدقيقة تحتوي على **60 ثانية**.',
  },
  {
    patterns: [/كم.*سنة.*قرن|عدد سنوات القرن|combien.*années.*siècle/i],
    answer: 'القرن = **100 سنة**.',
  },
  {
    patterns: [/كم.*يوم.*شهر.*فبراير.*سنة.*كبيسة|فبراير.*كبيسة/i],
    answer: 'في السنة الكبيسة، شهر فبراير يحتوي على **29 يوماً** (بدلاً من 28).',
  },
  {
    patterns: [/كم.*يوم.*سنة|عدد أيام السنة|combien.*jours.*année/i],
    answer: 'السنة العادية = **365 يوماً** | السنة الكبيسة = **366 يوماً** (كل 4 سنوات).',
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// GENERAL STATIC FACTS
// ══════════════════════════════════════════════════════════════════════════════
const GENERAL_FACTS = [
  {
    patterns: [/أكبر.*قارة|largest.*continent|plus grand.*continent/i],
    answer: '🌏 **آسيا** هي أكبر قارة في العالم (44,579,000 كم²).',
  },
  {
    patterns: [/أصغر.*قارة|smallest.*continent/i],
    answer: '🌏 **أستراليا** (أوقيانوسيا) هي أصغر قارة في العالم.',
  },
  {
    patterns: [/أطول.*نهر|longest.*river/i],
    answer: '🌊 **النيل** هو أطول نهر في العالم بطول يتجاوز 6,650 كم.',
  },
  {
    patterns: [/أعلى.*جبل|أطول.*جبل|highest.*mountain|mount everest/i],
    answer: '⛰️ **جبل إيفرست** هو أعلى قمة في العالم بارتفاع **8,848.86 متر** فوق مستوى البحر.',
  },
  {
    patterns: [/أكبر.*محيط|largest.*ocean/i],
    answer: '🌊 **المحيط الهادئ (الباسيفيك)** هو أكبر محيط في العالم.',
  },
  {
    patterns: [/أكبر.*دولة.*العالم|largest.*country.*world/i],
    answer: '🌍 **روسيا** هي أكبر دولة في العالم بمساحة 17,098,242 كم².',
  },
  {
    patterns: [/عدد.*دول.*العالم|كم.*دولة.*العالم|combien.*pays.*monde/i],
    answer: '🌍 يوجد **195 دولة** معترف بها في العالم (193 عضو في الأمم المتحدة + دولتان مراقبتان).',
  },
  {
    patterns: [/عدد.*قارات|كم.*قارة|combien.*continents/i],
    answer: '🌍 الأرض تحتوي على **7 قارات**: آسيا، أفريقيا، أمريكا الشمالية، أمريكا الجنوبية، أنتاركتيكا، أوروبا، أستراليا.',
  },
  {
    patterns: [/عدد.*دول.*عربية|كم.*دولة.*عربية|combien.*pays.*arabes/i],
    answer: '🌍 **22 دولة عربية** أعضاء في جامعة الدول العربية.',
  },
  {
    patterns: [/سرعة الضوء|vitesse.*lumière|speed.*light/i],
    answer: '💡 سرعة الضوء في الفراغ = **299,792,458 م/ث** (حوالي 300,000 كم/ث).',
  },
  {
    patterns: [/ما.*هو.*DNA|ما.*DNA|definition.*dna|ADN c'est quoi/i],
    answer: '🔬 **DNA (حمض الديوكسيريبونيوكليك)** هو الحمض النووي الذي يحمل المعلومات الوراثية للكائنات الحية.',
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// CAPITAL QUERY PATTERNS
// ══════════════════════════════════════════════════════════════════════════════
// "عاصمة فرنسا" / "ما هي عاصمة فرنسا" / "capitale de la france" / "capital of france"
const CAPITAL_QUERY_RE = /(?:ما\s+هي\s+|ما\s+|اين\s+|أين\s+)?(?:عاصمة|عاصمت)\s+(.{2,40}?)(?:\?|؟|$)/i
const CAPITAL_QUERY_FR = /(?:quelle\s+est\s+la\s+)?capitale\s+(?:de\s+(?:la\s+|l['']|du\s+|des\s+)?)?(.{2,35}?)(?:\?|$)/i
const CAPITAL_QUERY_EN = /(?:what\s+is\s+the\s+)?capital\s+(?:of\s+|city\s+of\s+)?(.{2,35}?)(?:\?|$)/i

function _matchCapital(query) {
  const q = query.trim()
  let countryName = null

  const arM = q.match(CAPITAL_QUERY_RE)
  const frM = q.match(CAPITAL_QUERY_FR)
  const enM = q.match(CAPITAL_QUERY_EN)

  if (arM) countryName = arM[1].trim()
  else if (frM) countryName = frM[1].trim()
  else if (enM) countryName = enM[1].trim()

  if (!countryName) return null

  const cn = countryName.toLowerCase().replace(/[؟?!.،,]/g, '').trim()

  for (const entry of CAPITALS) {
    if (entry.names.some(n => cn.includes(n) || n.includes(cn))) {
      // Detect language of query to respond in kind
      const isAr = /[\u0600-\u06FF]/.test(query)
      const isFr = /capitale|quelle|est/i.test(query)
      if (isAr) {
        return `🏙️ عاصمة **${entry.names[0]}** هي **${entry.capital}** (${entry.capital_fr}).`
      } else if (isFr) {
        return `🏙️ La capitale de **${countryName}** est **${entry.capital_fr}**.`
      } else {
        return `🏙️ The capital of **${countryName}** is **${entry.capital_fr}** (${entry.capital}).`
      }
    }
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * lookupStaticFact(query) → string | null
 *
 * Returns an instant answer for fixed-knowledge queries.
 * Returns null if the query needs LLM inference.
 */
export function lookupStaticFact(query) {
  if (!query || query.length < 3) return null

  const q = query.trim()

  // 1. Capital lookup
  const capital = _matchCapital(q)
  if (capital) return capital

  // 2. Algeria facts
  for (const fact of DZ_FACTS) {
    if (fact.patterns.some(p => p.test(q))) return fact.answer
  }

  // 3. Math & universal constants
  for (const fact of MATH_FACTS) {
    if (fact.patterns.some(p => p.test(q))) return fact.answer
  }

  // 4. General world facts
  for (const fact of GENERAL_FACTS) {
    if (fact.patterns.some(p => p.test(q))) return fact.answer
  }

  return null
}

/**
 * isStaticQuery(query) → boolean
 * Quick check before calling lookupStaticFact
 */
export function isStaticQuery(query) {
  return !!(
    CAPITAL_QUERY_RE.test(query) ||
    CAPITAL_QUERY_FR.test(query) ||
    CAPITAL_QUERY_EN.test(query) ||
    [...DZ_FACTS, ...MATH_FACTS, ...GENERAL_FACTS].some(f => f.patterns.some(p => p.test(query)))
  )
}
