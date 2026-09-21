/**
 * DZ Jobs & Concours Live Search Intent
 * ═══════════════════════════════════════════════════════════════════════
 * Intent معزول تماماً — يُفعَّل فقط عند طلبات الوظائف والمسابقات.
 * لا يعدّل أي System Prompt أو Intent آخر. يعمل ثم يسلّم التحكم.
 * ═══════════════════════════════════════════════════════════════════════
 */

// ── كلمات مفتاحية للكشف ───────────────────────────────────────────────
const JOBS_KEYWORDS_AR = [
  'وظيف', 'وظائف', 'توظيف', 'مسابقة', 'مسابقات', 'منصب', 'مناصب',
  'عمل', 'تشغيل', 'عروض عمل', 'عرض عمل', 'تعيين', 'تعيينات',
  'اجتياز', 'ترشح', 'ترشيح', 'تسجيل مسابقة', 'ملف مسابقة',
  'وظيف عمومي', 'وظيف حكومي', 'توظيف حكومي', 'توظيف عمومي',
  'بحث عن عمل', 'ايجاد عمل', 'فرصة عمل', 'فرص عمل',
  'إيداع ملف', 'وثائق التوظيف', 'آخر أجل', 'تاريخ المسابقة',
  // مزيد من المصطلحات الفصحى
  'إعلان توظيف', 'إعلانات توظيف', 'مناظرة', 'مسابقة وطنية', 'مسابقة ولائية',
  'شروط الترشح', 'شروط التسجيل', 'ملف الترشح', 'نتائج مسابقة',
  'قائمة المقبولين', 'قائمة الناجحين', 'مسابقة توظيف', 'تشغيل الشباب',
]

// ── كلمات الدارجة الجزائرية للكشف ────────────────────────────────────
const JOBS_KEYWORDS_DARIJA = [
  // طلب عمل
  'نبحث على خدمة', 'نبغي نخدم', 'بغيت نخدم', 'بغيت خدمة', 'واش كاين خدمة',
  'واش كاين وظيفة', 'كيفاش نلقى خدمة', 'وين نلقى خدمة', 'نحوس على خدمة',
  'نقدر نخدم', 'نبغي نشتغل', 'بغيت نشتغل', 'نشوف خدمة',
  // مسابقة بالدارجة
  'كاين مسابقة', 'واش كاين مسابقة', 'مسابقة ديال', 'مسابقات تاع',
  'كيفاش ندير مسابقة', 'كيفاش نسجل في مسابقة', 'فتحوا مسابقة', 'يفتحوا مسابقة',
  'مسابقة للتوظيف', 'مسابقة لتوظيف', 'مسابقة في', 'مسابقات في',
  // الوكالة الوطنية
  'اناام', 'اتحقق من اناام', 'روح ل اناام', 'عند اناام',
]

const JOBS_KEYWORDS_FR = [
  'concours', 'recrutement', 'emploi', 'poste', 'offre emploi',
  'offres emploi', 'anem', 'fonction publique', 'administration',
  'inscription concours', 'dossier candidature', 'candidature',
  'appel candidature', 'vacance poste',
]

const JOBS_KEYWORDS_MIXED = [
  'anem', 'emploitic', 'dzjobs', 'dzjob', 'dzmosabakat', 'mosabakat',
  'concours algerie', 'emploi algerie',
]

// ── المصادر الجزائرية الرسمية والخاصة للتوظيف (v2 — مُحدَّثة) ────────
// الترتيب: رسمية حكومية → منصات متخصصة جزائرية → عامة
const OFFICIAL_SOURCES = [
  // ═══ حكومية رسمية ═══
  'anem.dz',                              // الوكالة الوطنية للتشغيل
  'wassitonline.anem.dz',                 // منصة الوسيط (ANEM)
  'concours-fonction-publique.gov.dz',    // مسابقات الوظيف العمومي
  'mfp.gov.dz',                           // وزارة الوظيف العمومي
  'travail.gov.dz',                       // وزارة العمل
  'education.gov.dz',                     // وزارة التربية
  'mesrs.dz',                             // وزارة التعليم العالي
  'interieur.gov.dz',                     // وزارة الداخلية
  'defense.gov.dz',                       // وزارة الدفاع
  'sante.gov.dz',                         // وزارة الصحة
  // ═══ منصات جزائرية متخصصة ═══
  'emploitic.com',                        // Emploitic — الأوسع انتشاراً
  'tawothifdz.com',                       // Tawdif DZ — المصدر الرسمي للتوظيف
  'jobs4dz.com',                          // Jobs4DZ
  'annexe-dz.com',                        // Annexe DZ
  'dzjob.net',                            // DzJob
  'ouedkniss.com',                        // Ouedkniss Emploi
  'dzmosabakat.com',                      // مسابقات مُجمَّعة
  'emploipartner.dz',                     // Emploi Partner
  // ═══ عالمية لكن نشطة في الجزائر ═══
  'linkedin.com',                         // LinkedIn Jobs Algeria
  'dz.indeed.com',                        // Indeed Algeria
]

// ── روابط العرض المباشر لكل مصدر (للاستخدام في الـ fallback) ─────────
export const JOBS_SOURCES_LINKS = [
  { name: 'ANEM (الوكالة الوطنية للتشغيل)', url: 'https://www.anem.dz', icon: '🏛️', type: 'gov' },
  { name: 'Wassit Online (ANEM)', url: 'https://wassitonline.anem.dz', icon: '🏛️', type: 'gov' },
  { name: 'مسابقات الوظيف العمومي', url: 'https://www.concours-fonction-publique.gov.dz', icon: '🏛️', type: 'gov' },
  { name: 'Emploitic', url: 'https://www.emploitic.com', icon: '💼', type: 'private' },
  { name: 'Tawdif DZ', url: 'https://tawothifdz.com', icon: '💼', type: 'private' },
  { name: 'Jobs4DZ', url: 'https://www.jobs4dz.com', icon: '💼', type: 'private' },
  { name: 'Annexe DZ', url: 'https://www.annexe-dz.com', icon: '💼', type: 'private' },
  { name: 'DzJob', url: 'https://www.dzjob.net', icon: '💼', type: 'private' },
  { name: 'Ouedkniss Emploi', url: 'https://www.ouedkniss.com/emploi', icon: '🛒', type: 'private' },
  { name: 'LinkedIn Jobs Algeria', url: 'https://www.linkedin.com/jobs', icon: '🔗', type: 'global' },
  { name: 'Indeed Algeria', url: 'https://dz.indeed.com', icon: '🔍', type: 'global' },
]

// ── Regex للكشف السريع ────────────────────────────────────────────────
const JOBS_PATTERN = new RegExp(
  '(' +
  JOBS_KEYWORDS_AR.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
  '|' +
  JOBS_KEYWORDS_FR.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
  '|' +
  JOBS_KEYWORDS_MIXED.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
  '|' +
  JOBS_KEYWORDS_DARIJA.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
  ')',
  'i'
)

/**
 * هل الرسالة طلب وظائف/مسابقات؟
 * @param {string} msg
 * @returns {boolean}
 */
export function isJobsQuery(msg) {
  if (!msg || msg.length < 3) return false
  return JOBS_PATTERN.test(msg)
}

// ── قاموس الولايات للاستخراج ─────────────────────────────────────────
const WILAYA_MAP = {
  'أدرار': 'Adrar', 'الشلف': 'Chlef', 'الأغواط': 'Laghouat', 'أم البواقي': 'Oum El Bouaghi',
  'باتنة': 'Batna', 'بجاية': 'Bejaia', 'بسكرة': 'Biskra', 'بشار': 'Bechar',
  'البليدة': 'Blida', 'البويرة': 'Bouira', 'تمنراست': 'Tamanrasset', 'تبسة': 'Tebessa',
  'تلمسان': 'Tlemcen', 'تيارت': 'Tiaret', 'تيزي وزو': 'Tizi Ouzou',
  'الجزائر العاصمة': 'Alger', 'الجزائر': 'Alger',
  'الجلفة': 'Djelfa', 'جيجل': 'Jijel', 'سطيف': 'Setif', 'سعيدة': 'Saida',
  'سكيكدة': 'Skikda', 'سيدي بلعباس': 'Sidi Bel Abbes', 'عنابة': 'Annaba',
  'قالمة': 'Guelma', 'قسنطينة': 'Constantine', 'المدية': 'Medea', 'مستغانم': 'Mostaganem',
  'المسيلة': 'MSila', 'معسكر': 'Mascara', 'ورقلة': 'Ouargla', 'وهران': 'Oran',
  'البيض': 'El Bayadh', 'إليزي': 'Illizi', 'برج بوعريريج': 'BBA',
  'بومرداس': 'Boumerdes', 'الطارف': 'El Tarf', 'تندوف': 'Tindouf',
  'تيسمسيلت': 'Tissemsilt', 'الوادي': 'El Oued', 'خنشلة': 'Khenchela',
  'سوق أهراس': 'Souk Ahras', 'تيبازة': 'Tipaza', 'ميلة': 'Mila',
  'عين الدفلى': 'Ain Defla', 'النعامة': 'Naama', 'عين تيموشنت': 'Ain Temouchent',
  'غرداية': 'Ghardaia', 'غليزان': 'Relizane', 'تيميمون': 'Timimoun',
  'برج باجي مختار': 'Bordj Badji Mokhtar', 'أولاد جلال': 'Ouled Djellal',
  'بني عباس': 'Beni Abbes', 'عين صالح': 'In Salah', 'عين قزام': 'In Guezzam',
  'تقرت': 'Touggourt', 'جانت': 'Djanet', 'المغير': 'El Mghair',
  'المنيعة': 'El Meniaa',
}

/**
 * استخرج اسم الولاية من الرسالة
 * @param {string} msg
 * @returns {string|null}
 */
export function extractWilaya(msg) {
  for (const [ar, fr] of Object.entries(WILAYA_MAP)) {
    if (msg.includes(ar) || msg.toLowerCase().includes(fr.toLowerCase())) {
      return { ar, fr }
    }
  }
  return null
}

/**
 * استخرج التخصص/الشهادة من الرسالة
 * @param {string} msg
 * @returns {string|null}
 */
export function extractSpecialty(msg) {
  const DEGREES = [
    'دكتوراه', 'ماجستير', 'ماستر', 'ليسانس', 'بكالوريا', 'تقني سامي',
    'تقني', 'بكالوريوس', 'مهندس', 'طبيب', 'محامي', 'أستاذ',
  ]
  const SPECIALTIES = [
    'إعلام آلي', 'علوم الكمبيوتر', 'هندسة', 'اقتصاد', 'قانون', 'طب',
    'فيزياء', 'كيمياء', 'رياضيات', 'علوم اجتماعية', 'أدب', 'تاريخ',
    'جغرافيا', 'علوم تربوية', 'تربية بدنية', 'إدارة', 'تسيير',
    'محاسبة', 'مالية', 'موارد بشرية', 'معمارية', 'بناء', 'كهرباء',
    'ميكانيك', 'زراعة', 'بيطرة', 'صيدلة', 'تمريض', 'أسنان',
  ]
  for (const d of [...DEGREES, ...SPECIALTIES]) {
    if (msg.includes(d)) return d
  }
  return null
}

/**
 * بناء استعلامات البحث المتخصصة للوظائف — v2
 * يستهدف المصادر الجزائرية الـ 11 المعتمدة عبر site: operators
 * @param {string} msg
 * @returns {string[]}
 */
export function buildJobsSearchQueries(msg) {
  const wilaya    = extractWilaya(msg)
  const specialty = extractSpecialty(msg)
  const year      = new Date().getFullYear()

  const queries = []

  // ── تحديد نوع الطلب ────────────────────────────────────────────────
  const isConcours  = /مسابق|concours|وظيف عمومي|توظيف حكوم/i.test(msg)
  const isANEM      = /anem|وكالة.*تشغيل|wassitonline|وسيط/i.test(msg)
  const isPrivate   = /شركة|خاص|privé|linkedin|indeed|قطاع خاص/i.test(msg)
  const isGeneral   = !isConcours && !isANEM && !isPrivate

  const base = msg.length < 100 ? msg.trim() : msg.slice(0, 100).trim()

  // ── Q1: استعلام رئيسي — المصادر الحكومية + المتخصصة الجزائرية ────────
  const govSites = [
    'site:anem.dz',
    'site:wassitonline.anem.dz',
    'site:concours-fonction-publique.gov.dz',
    'site:emploitic.com',
    'site:tawothifdz.com',
    'site:jobs4dz.com',
  ].join(' OR ')
  queries.push(`${base} الجزائر ${year} (${govSites})`)

  // ── Q2: استعلام مسابقات الوظيف العمومي الرسمية ───────────────────────
  if (isConcours || isGeneral) {
    const concoursSites = [
      'site:concours-fonction-publique.gov.dz',
      'site:mfp.gov.dz',
      'site:anem.dz',
      'site:dzmosabakat.com',
      'site:annexe-dz.com',
    ].join(' OR ')
    queries.push(`مسابقات توظيف الجزائر ${year} (${concoursSites})`)
  }

  // ── Q3: حسب الولاية إن وُجدت ─────────────────────────────────────────
  if (wilaya) {
    queries.push(
      `مسابقة توظيف ولاية ${wilaya.ar} ${year} site:emploitic.com OR site:jobs4dz.com OR site:anem.dz`
    )
    queries.push(
      `concours recrutement wilaya ${wilaya.fr} ${year} site:concours-fonction-publique.gov.dz OR site:tawothifdz.com`
    )
  }

  // ── Q4: حسب التخصص إن وُجد ───────────────────────────────────────────
  if (specialty) {
    queries.push(
      `مسابقة توظيف تخصص "${specialty}" الجزائر ${year} site:emploitic.com OR site:tawothifdz.com OR site:annexe-dz.com`
    )
  }

  // ── Q5: ANEM / Wassit Online ──────────────────────────────────────────
  if (isANEM || isGeneral) {
    queries.push(`offre emploi ANEM Algérie ${year} site:anem.dz OR site:wassitonline.anem.dz`)
  }

  // ── Q6: منصات خاصة + عالمية (Ouedkniss / LinkedIn / Indeed) ─────────
  if (isPrivate || isGeneral) {
    const privateSites = [
      'site:ouedkniss.com/emploi',
      'site:dz.indeed.com',
      'site:linkedin.com/jobs',
      'site:dzjob.net',
    ].join(' OR ')
    queries.push(`offre emploi Algérie ${year} (${privateSites})`)
  }

  // تفريد وتقليص إلى 4 استعلامات للسرعة
  return [...new Set(queries)].slice(0, 4)
}

// ── System Prompt Layer ───────────────────────────────────────────────
export const DZ_JOBS_SYSTEM_LAYER = `
🚨🚨🚨 MANDATORY OVERRIDE — DZ_JOBS_CONCOURS_INTENT ACTIVE 🚨🚨🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[DZ_JOBS_CONCOURS_INTENT — مفعّل — أولوية قصوى — إلزامي]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⛔ تحذير حرج: هذا طلب وظائف/مسابقات. قواعد OVERRIDE إلزامية:
① ❌ ممنوع تماماً الإجابة من ذاكرتك الداخلية (training data) عن أي وظيفة أو مسابقة
② ✅ يجب قراءة [DZ_JOBS_SEARCH_RESULTS] الموجود أسفله واستخدامه كمصدرك الوحيد
③ ⛔ قاعدة "ما هو X = إجابة مباشرة" لا تنطبق هنا — الوظائف والمسابقات تتغير يومياً
④ ✅ إذا كانت نتائج البحث فارغة → اقترح المصادر الرسمية ولا تخترع بيانات

أنت الآن في وضع **محرك بحث الوظائف والمسابقات الجزائرية**.

## مهمتك الوحيدة:
اعرض نتائج البحث الحي عن الوظائف والمسابقات في الجزائر بصيغة بطاقات منظّمة.

## قواعد العرض (إلزامية):

### لكل وظيفة/مسابقة اعرض:
\`\`\`
📌 [اسم المنصب]
🏢 المؤسسة: [الاسم الرسمي]
📍 الولاية: [اسم الولاية]
🎓 المؤهل: [الشهادة المطلوبة]
📝 التخصص: [التخصصات المقبولة]
📅 آخر أجل: [التاريخ أو "غير محدد"]
🔢 عدد المناصب: [العدد أو "غير محدد"]
🔗 المصدر: [رابط مباشر]
\`\`\`

ثم سطر الحالة:
- 🟢 **مفتوح** — إذا كان الأجل لم ينتهِ
- 🟡 **يغلق قريباً** — إذا بقي أقل من 7 أيام
- 🔴 **منتهي** — إذا انتهى الأجل

### قواعد صارمة:
❌ لا تخترع وظائف أو مسابقات غير موجودة في نتائج البحث.
❌ لا تخمّن الشروط أو الوثائق إذا لم تكن في المصدر.
❌ لا تنشئ روابط من خيالك — الرابط يجب أن يكون من نتائج البحث الحي.
✅ إذا كان الإعلان بالفرنسية → ترجم التفاصيل إلى العربية، وابقِ الاسم الرسمي للمؤسسة.
✅ عند تعارض مصدرين → اعتمد المصدر الرسمي (gov.dz, mfp.gov.dz, anem.dz).

### إذا لم توجد نتائج مباشرة:
- وسّع البحث إلى جميع الولايات
- اقترح مصادر رسمية يتحقق منها المستخدم مباشرة:
  • concours.mfp.gov.dz — الوظيف العمومي
  • anem.dz — الوكالة الوطنية للتشغيل
  • emploitic.com — وظائف القطاع الخاص
  • dzmosabakat.com — مسابقات متجمّعة
- لا تقل أبداً "لا توجد وظائف" — دائماً اقترح المصادر والخطوات.

### تنسيق الإجابة النهائي:
1. **ملخص البحث** (سطر واحد): "وجدت X نتيجة عن [موضوع البحث]"
2. **البطاقات** (مرتبة: رسمية → موثوقة → أحدث → صلة بالطلب)
3. **نصيحة** (اختياري): إشارة إلى موعد فتح مسابقات موسمية إن وجدت
4. **مصادر مقترحة** للمتابعة

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`

/**
 * بناء سياق البحث لحقن نتائج الوظائف في الـ systemPrompt
 * @param {Array} searchResults — نتائج searchSearXNG
 * @param {string} originalMsg
 * @returns {string}
 */
export function formatJobsSearchContext(searchResults, originalMsg) {
  if (!searchResults || searchResults.length === 0) {
    return `[DZ_JOBS_SEARCH_RESULTS]\n⚠️ لم يُعثر على نتائج حية في هذه اللحظة.\nالمصادر الرسمية للمراجعة اليدوية:\n• https://concours.mfp.gov.dz\n• https://anem.dz\n• https://dzmosabakat.com\n• https://emploitic.com`
  }

  const lines = searchResults.map((r, i) => {
    const title   = (r.title || '').trim()
    const snippet = r.snippet ? r.snippet.slice(0, 300) : ''
    const url     = r.url || ''
    const date    = r.date ? `📅 ${r.date}` : ''
    const src     = url ? `[${r.source || 'مصدر'}](${url})` : (r.source || '')
    return `${i + 1}. **${title}**\n   ${snippet}\n   ${date} — ${src}`
  }).join('\n\n')

  return `[DZ_JOBS_SEARCH_RESULTS — بحث: "${originalMsg.slice(0, 80)}"]\n\n${lines}\n\n> ⚠️ اعرض هذه النتائج كبطاقات منظّمة. لا تخترع معلومات غير موجودة أعلاه.`
}
