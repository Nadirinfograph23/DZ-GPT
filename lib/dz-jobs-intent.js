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

// ── منظمات ومصادر رسمية للتعزيز ─────────────────────────────────────
const OFFICIAL_SOURCES = [
  'concours.mfp.gov.dz', 'mfp.gov.dz', 'anem.dz',
  'travail.gov.dz', 'education.gov.dz', 'mesrs.dz',
  'interieur.gov.dz', 'defense.gov.dz', 'sante.gov.dz',
  'dzjobs.dz', 'emploitic.com', 'emploipartner.dz',
  'dzmosabakat.com',
]

// ── Regex للكشف السريع ────────────────────────────────────────────────
const JOBS_PATTERN = new RegExp(
  '(' +
  JOBS_KEYWORDS_AR.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
  '|' +
  JOBS_KEYWORDS_FR.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
  '|' +
  JOBS_KEYWORDS_MIXED.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
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
  const wilaya = extractWilaya(msg)
  const specialty = extractSpecialty(msg)

  const queries = []

  // استعلام أساسي مبني على رسالة المستخدم
  const base = msg.length < 120 ? msg.trim() : msg.slice(0, 120).trim()
  queries.push(`${base} الجزائر ${new Date().getFullYear()}`)

  // استعلامات مخصصة حسب السياق
  if (wilaya) {
    queries.push(`مسابقة توظيف ولاية ${wilaya.ar} ${new Date().getFullYear()}`)
    queries.push(`concours recrutement wilaya ${wilaya.fr} ${new Date().getFullYear()}`)
  }

  if (specialty) {
    queries.push(`مسابقة توظيف تخصص ${specialty} الجزائر`)
  }

  // استعلامات المصادر الرسمية
  const isConcours = /مسابق|concours/i.test(msg)
  const isANEM    = /anem|وكالة.*تشغيل/i.test(msg)

  if (isConcours || (!isANEM && !wilaya)) {
    queries.push(`مسابقات توظيف الجزائر ${new Date().getFullYear()} site:mfp.gov.dz OR site:dzmosabakat.com OR site:emploitic.com`)
  }
  if (isANEM) {
    queries.push(`ANEM offre emploi Algérie ${new Date().getFullYear()}`)
  }

  // استعلام LinkedIn للشركات الخاصة
  if (/شركة|خاص|privé|linkedin/i.test(msg)) {
    queries.push(`offre emploi Algérie LinkedIn ${new Date().getFullYear()}`)
  }

  return [...new Set(queries)].slice(0, 4) // أقصى 4 استعلامات
}

// ── System Prompt Layer ───────────────────────────────────────────────
export const DZ_JOBS_SYSTEM_LAYER = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[DZ_JOBS_CONCOURS_INTENT — مفعّل — عزل تام عن بقية النظام]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
