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
  'tawdif', 'tawothif', 'annexe-dz', 'annexedz', 'jobs4dz',
  'ouedkniss emploi', 'wassit', 'wassitonline', 'fonction publique',
  'indeed algerie', 'linkedin algerie',
]

// ── منظمات ومصادر رسمية للتعزيز ─────────────────────────────────────
const OFFICIAL_SOURCES = [
  // مصادر حكومية رسمية
  'concours-fonction-publique.gov.dz', 'mfp.gov.dz', 'anem.dz',
  'wassitonline.anem.dz', 'travail.gov.dz', 'education.gov.dz',
  'mesrs.dz', 'interieur.gov.dz', 'defense.gov.dz', 'sante.gov.dz',
  // مواقع متخصصة موثوقة
  'emploitic.com', 'tawothifdz.com', 'jobs4dz.com',
  'annexe-dz.com', 'dzjob.net', 'ouedkniss.com',
  'dz.indeed.com', 'linkedin.com/jobs',
  // مصادر قديمة
  'dzjobs.dz', 'emploipartner.dz', 'dzmosabakat.com',
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
 * بناء استعلامات البحث المتخصصة للوظائف
 * @param {string} msg
 * @returns {string[]}
 */
export function buildJobsSearchQueries(msg) {
  const wilaya   = extractWilaya(msg)
  const specialty = extractSpecialty(msg)
  const year     = new Date().getFullYear()
  const queries  = []

  // استعلام أساسي مبني على رسالة المستخدم
  const base = msg.length < 120 ? msg.trim() : msg.slice(0, 120).trim()
  queries.push(`${base} الجزائر ${year}`)

  // تحديد نوع الطلب
  const isConcours  = /مسابق|concours/i.test(msg)
  const isANEM      = /anem|وكالة.*تشغيل|wassit|وسيط/i.test(msg)
  const isPrivate   = /شركة|خاص|privé|linkedin|emploitic|قطاع خاص/i.test(msg)
  const isEmploitic = /emploitic/i.test(msg)
  const isTawdif    = /tawdif|tawothif/i.test(msg)
  const isAnnexe    = /annexe|dzmosabakat|مسابقات جزائر/i.test(msg)

  // استعلامات مخصصة حسب الولاية
  if (wilaya) {
    queries.push(`مسابقة توظيف ولاية ${wilaya.ar} ${year} site:concours-fonction-publique.gov.dz OR site:annexe-dz.com OR site:tawothifdz.com`)
    queries.push(`offre emploi recrutement wilaya ${wilaya.fr} Algérie ${year}`)
  }

  // استعلام التخصص
  if (specialty) {
    queries.push(`مسابقة توظيف تخصص ${specialty} الجزائر ${year} site:concours-fonction-publique.gov.dz OR site:emploitic.com`)
  }

  // استعلام المصادر الرسمية للمسابقات
  if (isConcours || (!isANEM && !isPrivate && !wilaya)) {
    queries.push(`مسابقات توظيف الجزائر ${year} site:concours-fonction-publique.gov.dz OR site:annexe-dz.com OR site:tawothifdz.com OR site:jobs4dz.com`)
  }

  // ANEM / منصة وسيط
  if (isANEM) {
    queries.push(`ANEM offre emploi Algérie ${year} site:anem.dz OR site:wassitonline.anem.dz`)
  }

  // Emploitic للقطاع الخاص
  if (isPrivate || isEmploitic) {
    queries.push(`offre emploi Algérie ${year} site:emploitic.com OR site:dz.indeed.com OR site:ouedkniss.com`)
  }

  // Tawdif أو Annexe إن طُلبا صراحةً
  if (isTawdif || isAnnexe) {
    queries.push(`مسابقة توظيف الجزائر ${year} site:tawothifdz.com OR site:annexe-dz.com OR site:dzjob.net`)
  }

  // استعلام LinkedIn للشركات متعددة الجنسيات
  if (/linkedin|شركات دولية|متعددة الجنسيات/i.test(msg)) {
    queries.push(`offre emploi Algérie LinkedIn ${year}`)
  }

  // استعلام Indeed Algeria
  if (/indeed/i.test(msg)) {
    queries.push(`offre emploi Algérie Indeed ${year} site:dz.indeed.com`)
  }

  return [...new Set(queries)].slice(0, 5) // أقصى 5 استعلامات
}

/**
 * هل الطلب عن مسابقات؟ هل عن القطاع الخاص؟
 */
export function classifyJobQuery(msg) {
  return {
    isConcours: /مسابق|concours/i.test(msg),
    isPrivate:  /شركة|خاص|privé|linkedin|emploitic|قطاع خاص|indeed/i.test(msg),
    isANEM:     /anem|وكالة.*تشغيل|wassit|وسيط/i.test(msg),
  }
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
- اقترح المصادر التالية مرتبة حسب الأولوية:

🏛️ **مصادر رسمية حكومية:**
  • https://www.concours-fonction-publique.gov.dz — مسابقات الوظيف العمومي (الأهم)
  • https://www.anem.dz — الوكالة الوطنية للتشغيل
  • https://wassitonline.anem.dz — منصة وسيط (ANEM أونلاين)

💼 **مواقع توظيف موثوقة:**
  • https://www.emploitic.com — وظائف القطاع الخاص
  • https://tawothifdz.com — Tawdif DZ (مسابقات مجمّعة)
  • https://www.jobs4dz.com — Jobs4DZ
  • https://www.annexe-dz.com — Annexe DZ (مسابقات عمومية)
  • https://www.dzjob.net — DzJob
  • https://www.ouedkniss.com/emploi — Ouedkniss Emploi
  • https://dz.indeed.com — Indeed Algeria
  • https://www.linkedin.com/jobs/search/?location=Algeria — LinkedIn Jobs

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
const EMPTY_RESULTS_SOURCES = `🏛️ مصادر رسمية: https://www.concours-fonction-publique.gov.dz | https://www.anem.dz | https://wassitonline.anem.dz
💼 مواقع موثوقة: https://www.emploitic.com | https://tawothifdz.com | https://www.jobs4dz.com | https://www.annexe-dz.com | https://www.dzjob.net | https://www.ouedkniss.com/emploi | https://dz.indeed.com | https://www.linkedin.com/jobs`

export function formatJobsSearchContext(searchResults, originalMsg) {
  if (!searchResults || searchResults.length === 0) {
    return `[DZ_JOBS_SEARCH_RESULTS]\n⚠️ لم يُعثر على نتائج حية في هذه اللحظة.\nتصفح هذه المصادر مباشرة:\n${EMPTY_RESULTS_SOURCES}`
  }

  const lines = searchResults.map((r, i) => {
    const title    = (r.title || '').trim()
    const snippet  = r.snippet ? r.snippet.slice(0, 300) : ''
    const url      = r.url || ''
    const date     = r.date ? `📅 ${r.date}` : ''
    const official = r.isOfficial ? ' ✅ رسمي' : ''
    const src      = url ? `[${r.source || 'مصدر'}${official}](${url})` : (r.source || '')
    return `${i + 1}. **${title}**\n   ${snippet}\n   ${date} — ${src}`
  }).join('\n\n')

  return `[DZ_JOBS_SEARCH_RESULTS — بحث: "${originalMsg.slice(0, 80)}" | المصادر: ANEM + concours-fp + Emploitic + Tawdif + Annexe + Jobs4DZ + DzJob + Ouedkniss + Indeed + LinkedIn]\n\n${lines}\n\n> ⚠️ اعرض هذه النتائج كبطاقات منظّمة. لا تخترع معلومات غير موجودة أعلاه.`
}
