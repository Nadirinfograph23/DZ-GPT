// DZ Agent — Research vs Execution Mode Engine v1.0
// ════════════════════════════════════════════════════════════════
// يحدد هل الطلب معلوماتي (Research) أم تنفيذي (Execution)
// ويُطبّق Confirmation Gate قبل أي عملية حساسة
// ════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// MODE OVERRIDE KEYWORDS
// ──────────────────────────────────────────────────────────────
const FORCE_RESEARCH_KW = [
  'وضع البحث', 'وضع بحث', 'research mode', 'mode recherche',
  'معلومات فقط', 'ابحث فقط', 'لا تنفذ', 'لا تعمل شيء',
  'فقط أخبرني', 'فقط معلومات', 'just tell me', 'info only',
  'no execution', 'dont execute', 'information only',
]

const FORCE_EXECUTION_KW = [
  'وضع التنفيذ', 'وضع تنفيذ', 'execution mode', 'mode execution',
  'نفذ الآن', 'نفذه الآن', 'execute now', 'do it now', 'ابدأ التنفيذ',
]

// ──────────────────────────────────────────────────────────────
// INTENT A: معلوماتي / بحث / مقارنة
// ──────────────────────────────────────────────────────────────
const RESEARCH_INTENT_KW = [
  // عربية — أسئلة استفهامية
  'هل يوجد', 'هل توجد', 'هل هناك', 'هل كاين', 'واش كاين', 'واش موجود',
  'ما هو أفضل', 'ما أفضل', 'ايهما أفضل', 'أيهما أفضل', 'أي مكتبة', 'أي أداة',
  'أي مستودع', 'افضل مستودع', 'أفضل مستودع', 'أفضل أداة', 'أفضل مكتبة',
  'مقارنة بين', 'قارن بين', 'الفرق بين', 'ما الفرق', 'ما هي الفروق',
  'اقترح لي', 'اعطني قائمة', 'أعطني قائمة', 'اعطني خيارات', 'أعطني خيارات',
  'ما هي خيارات', 'ما هو', 'ما هي', 'شرح لي', 'اشرح لي', 'عرّف لي',
  'كيف يعمل', 'كيف تعمل', 'ما هي مزايا', 'ما هي عيوب', 'مزايا وعيوب',
  'هل مجاني', 'هل مجانية', 'هل تدعم', 'هل يدعم', 'هل يدعم',
  'ابحث عن', 'دور على', 'فتش على', 'جيبلي معلومات', 'أخبرني عن',
  'ما هي أفضل', 'مستودعات مجانية', 'مستودعات للـ', 'أدوات للـ',
  'كيف أختار', 'كيف نختار', 'أفضل طريقة للـ',
  // دارجة جزائرية
  'واش كاين', 'واش فيه', 'ابحث لي', 'عطيني معلومات', 'قولي على',
  'كيفاش', 'منين نبدأ', 'انصحني', 'قارن لي', 'كيفاش نعرف',
  // إنجليزية
  'is there', 'are there', 'what is the best', 'what are the best',
  'best repo', 'best library', 'best tool', 'best framework', 'best option',
  'free repo', 'free library', 'open source', 'compare', 'comparison',
  'what is', 'what are', 'how does', 'how do', 'explain', 'tell me about',
  'recommend', 'suggest', 'which is better', 'pros and cons',
  'difference between', ' vs ', 'versus', 'alternative to', 'alternatives for',
  'any good repo', 'any free', 'show me options', 'list of',
  // فرنسية
  'est-ce qu', 'quel est le meilleur', 'quelle est la meilleure',
  'recommande', 'comparer', 'différence entre', 'qu\'est-ce que',
  'meilleur dépôt', 'meilleure bibliothèque', 'est-il gratuit',
]

// ──────────────────────────────────────────────────────────────
// INTENT C/D: تنفيذي صريح — أفعال التنفيذ
// ──────────────────────────────────────────────────────────────
const EXECUTION_VERBS = [
  // عربية — أفعال تنفيذ صريحة
  'نفذ', 'نفّذ', 'ثبّت', 'ثبت', 'ادمج', 'دمج', 'دمّج',
  'أنشئ المشروع', 'انشئ المشروع', 'شغّل', 'شغل',
  'عدّل الكود', 'عدل الكود', 'أضف للمشروع', 'اضف للمشروع',
  'ركّب', 'ركب', 'حمّل للمشروع', 'حمل للمشروع',
  'استنسخ', 'أضف هذا المستودع', 'اضف هذا المستودع',
  'أضف هذه المكتبة', 'اضف هذه المكتبة', 'أضف هذه الأداة',
  'أنشئ ملف', 'انشئ ملف', 'اكتب للمشروع', 'عدّل الملف', 'عدل الملف',
  'امسح الملف', 'احذف الملف', 'غيّر الملف', 'حدّث الملف',
  'أنشئ مستودع', 'انشئ مستودع جديد', 'اصنع مشروع', 'افعل هذا',
  'طبّق هذا', 'طبق هذا', 'نزّل للمشروع', 'ادرج في المشروع',
  'أدخل في المشروع', 'ألصق في المشروع', 'أضف هذا الكود',
  // دارجة جزائرية
  'دير لي', 'ركّب لي', 'ثبّت لي', 'دمجلي', 'شغّل لي',
  'حمّل لي', 'نزّل لي', 'صنعلي', 'حطلي', 'ادمجلي',
  // إنجليزية — أفعال تنفيذ
  'execute this', 'install this', 'merge this', 'create this project',
  'run this', 'deploy this', 'build this', 'clone this', 'clone the repo',
  'add this to', 'add this library', 'add this tool', 'integrate this',
  'implement this', 'apply this', 'push to github', 'commit and push',
  'create a new file', 'write to', 'delete this file', 'remove this file',
  'update this file', 'modify this file', 'create a new project',
  // فرنسية
  'exécute', 'installe ce', 'fusionne ce', 'crée ce projet',
  'lance ce', 'déploie ce', 'clone ce', 'télécharge ce',
  'ajoute ça au projet', 'intègre ce',
]

// أفعال تنفيذ المشروع القائم (intent D)
const PROJECT_EXECUTION_KW = [
  'أضف لمشروعي', 'اضف لمشروعي', 'أضف للمشروع الحالي',
  'ادمج في مشروعي', 'دمّج في مشروعي', 'ادخل في مشروعي',
  'اجعل المشروع يدعم', 'أجعل المشروع يدعم', 'عدّل مشروعي',
  'اضفه على مشروعي', 'أضفه على مشروعي',
  'add to my project', 'add to the current project', 'integrate into my project',
  'merge into my project', 'put this in my project', 'add this feature to my project',
  'implement in my project', 'add it to the project',
]

// ──────────────────────────────────────────────────────────────
// QUESTION QUALIFIERS — يجعلون جملة التنفيذ سؤالاً بحثياً
// مثال: "هل يمكن دمج X" = بحث، ليس تنفيذاً
// ──────────────────────────────────────────────────────────────
const QUESTION_QUALIFIERS = [
  'هل يمكن', 'هل يمكنني', 'هل يجب', 'هل يجوز', 'هل يصح',
  'كيف يمكن', 'كيف يمكنني', 'كيف أستطيع', 'كيف ادمج',
  'هل يوجد طريقة', 'هل هناك طريقة', 'ما هي طريقة',
  'هل من الممكن', 'هل بالإمكان', 'هل يتسنى',
  'can i', 'can we', 'how can i', 'how can we', 'how do i', 'how to',
  'is it possible', 'what is the way', 'any way to',
  'est-il possible', 'comment puis-je', 'comment peut-on',
  'واش يمكن', 'كيفاش يمكن',
]

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
function hasAny(text, list) {
  const t = text.toLowerCase()
  return list.some(k => t.includes(k.toLowerCase()))
}

function hasAnyExact(text, list) {
  const t = ` ${text.toLowerCase()} `
  return list.some(k => t.includes(` ${k.toLowerCase()} `) || t.includes(k.toLowerCase()))
}

// ──────────────────────────────────────────────────────────────
// MAIN: detectAgentMode
// ──────────────────────────────────────────────────────────────
/**
 * كشف وضع الوكيل (بحث / تنفيذ) من نص الطلب
 *
 * @param {string}   rawQuery    — الطلب الأصلي
 * @param {Array}    messages    — سياق المحادثة
 * @param {string}   clientMode  — الوضع المُرسَل من العميل: 'auto'|'research'|'execution'
 * @param {boolean}  confirmed   — هل أكد المستخدم تنفيذ العملية؟
 * @returns {{
 *   mode: string,
 *   intentType: string,
 *   isResearchQuery: boolean,
 *   isExecutionQuery: boolean,
 *   shouldBlockExecution: boolean,
 *   needsConfirmation: boolean,
 *   actionSummary: object|null,
 *   forcedMode: string|null,
 *   researchModeInstruction: string,
 * }}
 */
export function detectAgentMode(rawQuery, messages = [], clientMode = 'auto', confirmed = false) {
  const q = String(rawQuery || '').trim()

  // ── 1. كشف تبديل الوضع في الرسالة ────────────────────────────────────────
  const hasForceResearch  = hasAny(q, FORCE_RESEARCH_KW)
  const hasForceExecution = hasAny(q, FORCE_EXECUTION_KW)

  let effectiveMode = clientMode || 'auto'
  if (hasForceResearch)  effectiveMode = 'research'
  else if (hasForceExecution) effectiveMode = 'execution'

  // ── 2. كشف مؤهلات الاستفهام (تجعل الجملة بحثية حتى لو فيها فعل تنفيذ) ──
  const hasQuestionQualifier = hasAny(q, QUESTION_QUALIFIERS)

  // ── 3. كشف الإشارات ───────────────────────────────────────────────────────
  const isResearchSignal    = hasAny(q, RESEARCH_INTENT_KW)
  const isExecutionVerb     = !hasQuestionQualifier && hasAny(q, EXECUTION_VERBS)
  const isProjectExecution  = !hasQuestionQualifier && hasAny(q, PROJECT_EXECUTION_KW)

  // ── 4. تصنيف النية ────────────────────────────────────────────────────────
  // A = معلوماتي/بحثي | B = تحليل تقني | C = تنفيذ برمجي | D = تعديل مشروع
  let intentType = 'A'
  if (isProjectExecution)                     intentType = 'D'
  else if (isExecutionVerb)                   intentType = 'C'
  else if (isResearchSignal || hasQuestionQualifier) intentType = 'A'
  else                                         intentType = 'B'

  const isResearchQuery  = intentType === 'A' || intentType === 'B' || hasQuestionQualifier
  const isExecutionQuery = (intentType === 'C' || intentType === 'D') && !hasQuestionQualifier

  // ── 5. هل نحجب التنفيذ؟ ──────────────────────────────────────────────────
  // نحجب إذا: المستخدم في وضع البحث + الطلب تنفيذي
  const shouldBlockExecution = effectiveMode === 'research' && isExecutionQuery

  // ── 6. هل نحتاج تأكيداً؟ ──────────────────────────────────────────────────
  // نحتاج تأكيداً إذا: الطلب تنفيذي + غير مؤكد + لم يُختَر وضع التنفيذ صراحةً
  const needsConfirmation = isExecutionQuery
    && !confirmed
    && effectiveMode !== 'execution'
    && !shouldBlockExecution

  // ── 7. ملخص العملية للـ Confirmation Gate ─────────────────────────────────
  const actionSummary = needsConfirmation ? buildActionSummary(q, intentType) : null

  // ── 8. تعليمات وضع البحث للنموذج ──────────────────────────────────────────
  const researchModeInstruction = effectiveMode === 'research'
    ? buildResearchInstruction()
    : ''

  return {
    mode: effectiveMode,
    intentType,
    isResearchQuery,
    isExecutionQuery,
    shouldBlockExecution,
    needsConfirmation,
    actionSummary,
    forcedMode: hasForceResearch ? 'research' : (hasForceExecution ? 'execution' : null),
    researchModeInstruction,
  }
}

// ──────────────────────────────────────────────────────────────
// buildActionSummary — ملخص العملية للـ Confirmation Gate
// ──────────────────────────────────────────────────────────────
function buildActionSummary(query, intentType) {
  const qLow = query.toLowerCase()

  const isClone    = /clone|استنسخ|نسخ.*مستودع/i.test(query)
  const isInstall  = /install|ثبّت|ثبت|ركّب|ركب/i.test(query)
  const isMerge    = /merge|ادمج|دمج|دمّج|ادمجلي/i.test(query)
  const isDeploy   = /deploy|انشر|نشر/i.test(query)
  const isCreate   = /create.*project|أنشئ.*مشروع|انشئ.*مشروع|صنعلي|اصنع/i.test(query)
  const isDelete   = /delete|remove|احذف|امسح/i.test(query)
  const isEdit     = /edit|modify|عدّل|عدل|غيّر|غير|بدّل/i.test(query)
  const isPush     = /push|ارفع.*github|commit.*push/i.test(query)
  const isRun      = /\brun\b|شغّل|تشغيل|شغل/i.test(query)
  const isDownload = /download|نزّل|نزل|حمّل|حمل/i.test(query)
  const isAddLib   = /أضف.*مكتبة|اضف.*مكتبة|أضف.*أداة|اضف.*أداة|أضف.*لمشروع|add.*library|add.*tool|add.*to.*project/i.test(query)

  let actionLabel     = 'تنفيذ طلب برمجي'
  let actionIcon      = '⚡'
  let whatWillHappen  = 'سيتم تنفيذ العملية البرمجية المطلوبة'
  let whyNote         = 'يمكن أن يؤثر على ملفات ومكونات المشروع'
  let changedResources = ['ملفات المشروع']

  if (isMerge || isAddLib) {
    actionLabel      = 'دمج / إضافة مستودع للمشروع'
    actionIcon       = '🔀'
    whatWillHappen   = 'سيتم استنساخ المستودع الخارجي وإضافة ملفاته إلى مشروعك'
    whyNote          = 'قد يؤثر على الملفات الحالية ويعدّل هيكل المشروع'
    changedResources = ['ملفات المشروع الحالية', 'package.json', 'هيكل المجلدات']
  } else if (isClone || isDownload) {
    actionLabel      = 'استنساخ / تنزيل مستودع'
    actionIcon       = '📥'
    whatWillHappen   = 'سيتم تنزيل واستنساخ المستودع المطلوب'
    whyNote          = 'يستهلك مساحة تخزين ويضيف ملفات جديدة'
    changedResources = ['مجلد المشروع', 'ملفات المستودع الجديدة']
  } else if (isInstall) {
    actionLabel      = 'تثبيت حزمة / مكتبة'
    actionIcon       = '📦'
    whatWillHappen   = 'سيتم تثبيت الحزمة وإضافتها للمشروع'
    whyNote          = 'يعدّل package.json ويضيف ملفات جديدة'
    changedResources = ['package.json', 'node_modules/']
  } else if (isDeploy) {
    actionLabel      = 'نشر المشروع'
    actionIcon       = '🚀'
    whatWillHappen   = 'سيتم نشر المشروع وجعله متاحاً للعموم'
    whyNote          = '⚠️ ستؤثر على المستخدمين فوراً'
    changedResources = ['البيئة الإنتاجية', 'الموقع المنشور']
  } else if (isCreate) {
    actionLabel      = 'إنشاء مشروع / ملف جديد'
    actionIcon       = '✨'
    whatWillHappen   = 'سيتم إنشاء مشروع أو ملف جديد في البيئة الحالية'
    whyNote          = 'يضيف ملفات جديدة للمشروع'
    changedResources = ['ملفات المشروع']
  } else if (isDelete) {
    actionLabel      = 'حذف ملف أو مورد'
    actionIcon       = '🗑️'
    whatWillHappen   = 'سيتم حذف الملف أو المورد المحدد'
    whyNote          = '⚠️ الحذف نهائي — لا يمكن التراجع'
    changedResources = ['الملف المحذوف']
  } else if (isEdit) {
    actionLabel      = 'تعديل ملف في المشروع'
    actionIcon       = '✏️'
    whatWillHappen   = 'سيتم تعديل الملف المحدد في مشروعك'
    whyNote          = 'يغيّر محتوى الملف الحالي'
    changedResources = ['الملف المعدّل']
  } else if (isPush) {
    actionLabel      = 'رفع التغييرات على GitHub'
    actionIcon       = '⬆️'
    whatWillHappen   = 'سيتم رفع commit جديد على GitHub'
    whyNote          = 'يُعدّل تاريخ المستودع على GitHub'
    changedResources = ['المستودع على GitHub', 'سجل الـ commits']
  } else if (isRun) {
    actionLabel      = 'تشغيل أوامر في بيئة المشروع'
    actionIcon       = '▶️'
    whatWillHappen   = 'سيتم تشغيل أوامر في بيئة المشروع الحالية'
    whyNote          = 'الأوامر تعمل على بيئة المشروع الحقيقية'
    changedResources = ['بيئة تشغيل المشروع']
  }

  return {
    actionLabel,
    actionIcon,
    intentType,
    whatWillHappen,
    whyNote,
    changedResources,
    originalQuery: query.slice(0, 120),
  }
}

// ──────────────────────────────────────────────────────────────
// buildResearchInstruction — تعليمات وضع البحث للنموذج
// ──────────────────────────────────────────────────────────────
function buildResearchInstruction() {
  return `
[وضع البحث نشط — Research Mode]
أنت الآن في وضع البحث والمعلومات فقط. القواعد الإلزامية:
1. أجب بمعلومات، شروحات، ومقارنات فقط.
2. لا تنفّذ أي أوامر ولا تعدّل أي ملفات.
3. لا تستنسخ مستودعات ولا تثبّت حزماً ولا تدمج كوداً.
4. قدّم الخيارات والمستودعات كقائمة منظمة مع المميزات والمتطلبات والروابط.
5. إذا أراد المستخدم التنفيذ، أخبره بتغيير الوضع إلى "وضع التنفيذ ⚡" أولاً.
`.trim()
}

// ──────────────────────────────────────────────────────────────
// buildResearchBlockedResponse — رد الحجب في وضع البحث
// ──────────────────────────────────────────────────────────────
export function buildResearchBlockedResponse(query, actionSummary) {
  const icon   = actionSummary?.actionIcon || '⚡'
  const label  = actionSummary?.actionLabel || 'تنفيذ برمجي'
  const what   = actionSummary?.whatWillHappen || 'تنفيذ العملية'

  return `## 🔍 وضع البحث نشط — لا يمكن التنفيذ

> أنت حالياً في **وضع البحث** الذي يقدم معلومات وتحليلات فقط.

**طلبك:** "${query.slice(0, 80)}${query.length > 80 ? '...' : ''}"

**نوع الطلب المكتشف:** ${icon} **${label}**

---

### للمتابعة، لديك خياران:

**1. 💬 الحصول على معلومات بحثية (الوضع الحالي)**
إذا كنت تريد معرفة المزيد عن هذا الموضوع، اسألني وسأقدم لك:
- قائمة بأفضل الخيارات مع المميزات والعيوب
- متطلبات التثبيت والاستخدام
- روابط التوثيق الرسمية

**2. ⚡ تنفيذ العملية فعلياً**
اضغط على زر **⚡ تنفيذ** في شريط الأدوات أو اكتب:
> **"وضع التنفيذ"** ثم كرّر طلبك

---
*💡 تلميح: الوضع الحالي "بحث 🔍" — غيّره لـ "تنفيذ ⚡" للسماح بالعمليات البرمجية*`
}
