/**
 * lib/static-facts.js — Static Knowledge Fast-Path
 *
 * يُجيب فوراً (<1ms) على الأسئلة ذات الإجابات الثابتة
 * بدون أي استدعاء لـ LLM.
 *
 * الفئات المغطاة:
 *   - عواصم الدول (عربي + فرنسي + إنجليزي)
 *   - حقائق جزائرية (ولايات، مساحة، سكان...)
 *   - رياضيات أساسية
 *   - تعريفات عامة ثابتة
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
    answer: '🇩🇿 عدد سكان الجزائر يتجاوز **45 مليون نسمة** (تقدير 2024).',
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
    patterns: [/استقلال الجزائر|تاريخ الاستقلال|independence.*algérie/i],
    answer: '🇩🇿 حصلت الجزائر على استقلالها في **5 يوليو 1962**.',
  },
  {
    patterns: [/لغة.*الجزائر|لغة رسمية.*الجزائر|langue.*algérie/i],
    answer: '🇩🇿 اللغة الرسمية في الجزائر هي **العربية** والأمازيغية (تمازيغت)، وتُستخدم الفرنسية على نطاق واسع.',
  },
  {
    patterns: [/عملة الجزائر|عملة.*جزائرية|monnaie.*algérie|dinar/i],
    answer: '🇩🇿 عملة الجزائر هي **الدينار الجزائري (DZD)**.',
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
