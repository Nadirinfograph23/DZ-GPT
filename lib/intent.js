// DZ Agent — Intent Detection Engine v2.
// Smart Tool Routing — 12-category classification with strict mode isolation.
// CORE RULE: GitHub/coding mode NEVER activates for normal conversation requests.

// ═══════════════════════════════════════════════════════════════
// 12-CATEGORY INTENT SYSTEM
// ═══════════════════════════════════════════════════════════════

// PROGRAMMING_REQUEST — MUST have explicit coding/programming keyword
const EXPLICIT_CODE_KW = [
  // Arabic explicit
  'اكتب كود', 'اكتبلي كود', 'اكتب لي كود', 'برمجلي', 'برمج لي', 'برمج',
  'اعمل دالة', 'اعملي دالة', 'اصلح الكود', 'اصلح هذا الكود', 'عندي باغ', 'عندي خطأ في الكود',
  'اكتب سكريبت', 'اكتب script', 'شغّل الكود', 'نفّذ الكود', 'كيف أكتب', 'علمني كيف أبرمج',
  // HTML/CSS/JS code requests — كود مقتطف وليس موقع
  'كود html', 'كود css', 'كود javascript', 'كود js', 'كود php', 'كود python',
  'أنشئ كود html', 'انشئ كود html', 'اكتب كود html', 'اعمل كود html', 'دير كود html',
  'أنشئ كود css', 'اكتب كود css', 'اعمل كود css',
  'أنشئ كود javascript', 'اكتب كود javascript', 'اكتب كود js',
  'اكتب html', 'اكتب css', 'اكتب javascript',
  'html code', 'css code', 'javascript code', 'html snippet', 'css snippet',
  'write html', 'write css', 'write javascript', 'create html code', 'create css code',
  // Darija (دارجة جزائرية) — طلبات الكود
  'دير لي كود', 'دير لينا كود', 'دير لي html', 'دير لي css', 'دير لي javascript',
  'دير كود css', 'دير كود js', 'دير كود javascript', 'دير كود php', 'دير كود python',
  'بغيت كود html', 'بغيت كود css', 'بغيت كود javascript', 'بغيت كود js',
  'بغيت html code', 'بغيت css code', 'بغيت كود',
  'عطيني كود html', 'عطيني كود css', 'عطيني كود js', 'عطيني كود',
  'جيبلي كود html', 'جيبلي كود css', 'جيبلي كود js', 'جيبلي كود',
  'حتاج كود html', 'حتاج كود css', 'نحتاج كود', 'نبغي كود',
  'ولد لي كود html', 'ولد لي كود css', 'صنعلي كود', 'عملي كود',
  // Franco-Arab (فرانكو-عربي جزائري)
  'dir code html', 'dir code css', 'dir code js', 'dir li code', 'dir lina code',
  'bghit code html', 'bghit code css', 'bghit code js', 'bghit html code', 'bghit code',
  '3tini code html', '3tini code css', '3tini code js', '3tini code', '3tini html',
  'dir li html', 'dir li css', 'dir li script', 'dir li programme',
  'wld li code', 'sina code', '7tani code', 'catalogue code',
  'code html stp', 'code css stp', 'code js stp',
  // English explicit
  'write code', 'write me code', 'create a function', 'fix this code', 'fix the bug',
  'debug this', 'write a script', 'code this', 'implement this', 'program this',
  'refactor', 'add a feature', 'write an api', 'create an endpoint',
  // French explicit
  'écris le code', 'corrige le code', 'programme ça', 'crée une fonction',
]

const BUILDER_KW = [
  'ابني', 'إبني', 'انشئ موقع', 'أنشئ موقع', 'صمم موقع', 'صمم تطبيق',
  'ابدع', 'ولّد', 'انشئ لي موقع', 'انشئ لي تطبيق',
  'موقع ويب', 'موقع إلكتروني', 'لاندينج باج', 'بورتفوليو', 'متجر إلكتروني',
  'build a website', 'build a site', 'create a website', 'create a web app',
  'generate a website', 'scaffold', 'landing page', 'portfolio site',
  'react app', 'vite app', 'tailwind page', 'component library',
  'next.js app', 'nextjs app', 'créer un site', 'créer une application',
]

const MOBILE_APP_KW = [
  'تطبيق موبايل', 'تطبيق جوال', 'تطبيق أندرويد', 'تطبيق ios', 'react native',
  'flutter app', 'mobile app', 'android app', 'ios app', 'expo app',
  'application mobile', 'appli mobile',
]

// GITHUB_REPOSITORY_REQUEST — must be an ACTION on GitHub, not a mention
const GITHUB_ACTION_KW = [
  // Arabic explicit actions
  'أنشئ مستودع', 'انشئ مستودع', 'ارفع على github', 'ارفع الملفات', 'اعمل push',
  'اعمل commit', 'اعمل pull request', 'عدّل الملف في github', 'احذف من github',
  'افتح مستودع', 'شارك المستودع', 'اعمل fork', 'clone المستودع',
  // English explicit actions
  'create a repo', 'create repo', 'push to github', 'push the files', 'make a commit',
  'open a pull request', 'create pull request', 'delete repo', 'fork this repo',
  'add to github', 'update github repo', 'deploy to github', 'enable github pages',
  'create branch', 'merge branch', 'push changes',
]

// DEBUGGING_REQUEST — specific debugging
const DEBUG_KW = [
  'عندي باغ', 'عندي خطأ', 'هذا الكود ما يخدمش', 'كود ما يشتغلش',
  'الأريرور', 'stacktrace', 'stack trace', 'error message', 'عطاني ايرور',
  'why is this code', 'why does this fail', 'not working', 'throwing error',
  'exception', 'cannot read property', 'undefined is not', 'null reference',
  'syntax error', 'type error', 'runtime error', 'compile error',
]

// LEGAL_DOCUMENT_ANALYSIS
const LEGAL_KW = [
  'وثيقة', 'عقد', 'اتفاقية', 'مستند', 'شهادة', 'وكالة', 'تصريح', 'محضر',
  'عقد الإيجار', 'عقد عمل', 'الشروط والأحكام', 'قانوني', 'قانون', 'حكم',
  'document', 'contract', 'agreement', 'legal', 'terms', 'clause', 'certificate',
  'document juridique', 'contrat', 'accord', 'attestation',
  'حلل هذه الوثيقة', 'اشرح هذا العقد', 'فسر هذا المستند', 'ما معنى هذا',
]

// OCR_DOCUMENT_REQUEST — image/photo/PDF text extraction
const OCR_KW = [
  'استخرج النص', 'اقرأ الصورة', 'ما مكتوب في', 'اقرأ هذه الصورة',
  'استخرج من الصورة', 'حوّل الصورة', 'scan', 'ocr', 'اسكان',
  'extract text', 'read this image', 'what does this say', 'transcribe',
  'extraire le texte', 'lire cette image',
]

// NEWS_REQUEST
const NEWS_KW = [
  'أخبار', 'خبر', 'عاجل', 'تقرير', 'حدث', 'أحداث', 'بيان', 'مستجدات', 'آخر',
  'جديد', 'اليوم', 'الآن', 'هذه الأيام', 'اليومية', 'صحيفة', 'نشرة',
  'news', 'breaking', 'latest', 'today', 'recent', 'headline', 'press release',
  'actualité', 'nouvelles', 'aujourd', 'communiqué',
]

// SEARCH_REQUEST
const SEARCH_KW = [
  'ابحث', 'دور', 'فتش', 'وين', 'كيفاش', 'search', 'find', 'look up',
  'cherche', 'trouve', 'ابحث لي', 'جيبلي معلومات', 'عطيني معلومات عن',
]

// AI_REASONING — complex reasoning / analysis
const AI_REASONING_KW = [
  'اشرح', 'فسّر', 'حلّل', 'ما رأيك', 'قيّم', 'قارن', 'ناقش', 'فكّر',
  'explain', 'analyze', 'analyse', 'discuss', 'evaluate', 'compare', 'think about',
  'explique', 'analyse', 'discute', 'évalue',
]

// STRUCTURED (tables/rankings/prices)
const STRUCTURED_KW = [
  'قارن', 'مقارنة', 'ترتيب', 'جدول', 'قائمة', 'سعر', 'أسعار', 'إحصائيات',
  'احصاء', 'بيانات', 'top', 'أفضل', 'افضل', 'أحسن', 'احسن', 'أكبر', 'أعلى',
  'compare', 'vs', 'versus', 'table', 'ranking', 'list', 'price', 'prices',
  'stats', 'statistics', 'top 5', 'top 10', 'best ', 'cheapest', 'pricing',
]

const URGENT_KW = [
  'عاجل', 'مستعجل', 'الآن', 'الساعة', 'مباشر', 'مباشرة', 'فوراً', 'عاجلاً',
  'breaking', 'urgent', 'just in', 'live now', 'right now', 'immediately',
]

const SPORTS_KW = [
  'كرة', 'مباراة', 'مباريات', 'هدف', 'دوري', 'بطولة', 'كأس', 'فريق', 'لاعب',
  'football', 'soccer', 'match', 'goal', 'league', 'cup', 'team', 'player',
]

// TECH / AI NEWS — أخبار تقنية أو ذكاء اصطناعي
const TECH_KW = [
  'ذكاء اصطناعي', 'تقنية', 'تكنولوجيا', 'نماذج', 'نموذج', 'روبوت',
  'chatgpt', 'gemini', 'claude', 'openai', 'mistral', 'llm', 'gpt',
  'artificial intelligence', 'machine learning', 'deep learning',
  'tech', 'technology', 'startup', 'silicon', 'nvidia', 'meta ai',
  'intelligence artificielle', 'technologie', 'numérique',
]

const PROMPT_ENG_KW = [
  'برومبت', 'بروميبت', 'prompt', 'system prompt', 'اكتب برومبت', 'حسّن برومبت',
  'prompt for claude', 'prompt for gpt', 'prompt for cursor', 'prompt for devin',
  'generate prompt', 'optimize prompt', 'improve prompt', 'هندسة البرومبت',
  'multi-agent workflow', 'crewai prompt', 'langgraph', 'agent workflow',
  'اكتب لي بروميبت', 'اكتب برومبت', 'تحسين برومبت', 'برومبت للـ',
]

// MEDICAL_SYMPTOM — symptom analysis / health questions
const MEDICAL_SYMPTOM_KW = [
  'أعراض', 'عرض', 'مرض', 'وجع', 'ألم', 'حمى', 'دوار', 'غثيان', 'سعال', 'صداع',
  'طبيب', 'دكتور', 'مستشفى', 'عيادة', 'علاج', 'دواء', 'تشخيص', 'فحص طبي',
  'symptoms', 'disease', 'pain', 'fever', 'headache', 'nausea', 'cough', 'doctor',
  'hospital', 'clinic', 'treatment', 'medication', 'diagnosis', 'medical',
  'symptôme', 'maladie', 'douleur', 'fièvre', 'médecin', 'hôpital',
]

// JOB_SEARCH — Algerian job market
const JOB_SEARCH_KW = [
  'وظيفة', 'وظائف', 'عمل', 'توظيف', 'منصب عمل', 'مناصب', 'مسابقة توظيف',
  'بحث عن عمل', 'مناصب شاغرة', 'راتب', 'رواتب', 'سوق العمل', 'اقتصاد جزائر',
  'emploi', 'job', 'jobs', 'recrutement', 'offre emploi', 'salaire',
  'job search', 'hiring', 'vacancy', 'recruitment', 'career',
]

// DOCTOR_SEARCH — find a doctor in Algeria
const DOCTOR_SEARCH_KW = [
  'ابحث عن طبيب', 'دور طبيب', 'أين طبيب', 'طبيب متخصص', 'طبيب في',
  'find a doctor', 'find doctor', 'doctor near', 'specialist near',
  'trouver médecin', 'médecin spécialiste', 'trouver un docteur',
  'sahadoc', 'موعد مع طبيب', 'حجز موعد طبي',
]

// IMAGE_SEARCH_REQUEST — البحث عن صور حقيقية (≠ توليد صور بالذكاء الاصطناعي)
// المؤشرات: جيبلي صورة / ابحث عن صورة / find photo / search images...
const IMAGE_SEARCH_KW = [
  // عربية
  'ابحث عن صورة', 'ابحث على صورة', 'ابحث عن صور', 'ابحث على صور',
  'جيبلي صورة', 'جيبلي صور', 'جيبلي فوتو', 'أجلب صورة', 'اجلب صورة',
  'أريد صورة ل', 'اريد صورة ل', 'أريد صور ل', 'هاتلي صورة', 'هاتلي صور',
  'بحث عن صورة', 'دور صورة', 'دور على صورة',
  'أرني صورة', 'ارني صورة', 'أرني صور',
  'صور حقيقية', 'صور واقعية', 'صورة حقيقية', 'صورة واقعية',
  'أريد فوتو', 'اريد فوتو', 'جيب صورة', 'حوس على صورة',
  // إنجليزية
  'find a photo', 'find a picture', 'find an image', 'find photos', 'find pictures',
  'search for a photo', 'search for image', 'search images', 'search photos',
  'get me a photo', 'get me a picture', 'get me an image',
  'show me a photo', 'show me a picture', 'show me images', 'show me photos',
  'get photos of', 'get pictures of', 'real photo of', 'real picture of',
  'bring me photo', 'bring me pictures', 'fetch image', 'fetch photo',
  // فرنسية
  'trouve une photo', 'trouve des photos', 'trouve une image', 'cherche une image',
  'montre moi une photo', 'montre une image', 'donne moi une photo',
]

// مؤشرات التوليد (تمنع IMAGE_SEARCH حتى لو كانت كلمة "صورة" موجودة)
const IMAGE_GENERATION_KW = [
  'ولّد صورة', 'ولد صورة', 'أنشئ صورة', 'انشئ صورة', 'اصنع صورة',
  'ارسم لي', 'ارسم صورة', 'توليد صورة', 'إنشاء صورة',
  'generate image', 'generate a photo', 'create image', 'create a picture',
  'draw me', 'draw a ', 'make an image', 'make a picture', 'ai image', 'ai art',
  'imagine a', 'render a', 'image ai',
]

// ═══════════════════════════════════════════════════════════════
// STRICT MODE ISOLATION GUARD
// These topics NEVER activate GitHub/coding mode
// ═══════════════════════════════════════════════════════════════

const CONVERSATION_ONLY_PATTERNS = [
  // News topics
  /أخبار|خبر|عاجل|مستجدات|نشرة الأخبار/i,
  /news|breaking news|latest news|headlines/i,
  // Questions / explanations
  /اشرح لي|فسّر|ما هو|ما هي|كيف يعمل|لماذا|ما معنى/i,
  /explain|what is|what are|how does|why is|tell me about/i,
  /explique|qu'est-ce que|comment fonctionne/i,
  // History / culture / religion
  // ⚠️ تنبيه: "حديث" بحدود كلمة عربية لمنع تطابق "تحديث" (update) بشكل خاطئ
  /تاريخ|ثقافة|دين|إسلام|قرآن|(?<![\u0600-\u06FF])حديث(?![\u0600-\u06FF])|فقه|سيرة/i,
  /history|culture|religion|islam|quran/i,
  // Sports discussion (NOT sports coding)
  /نتائج المباريات|ترتيب الدوري|هدف|ملخص مباراة/i,
  /match result|league standing|football score/i,
  // Legal explanation (no document attached)
  /ما هو القانون|اشرح القانون|ما هي الغرامة|ما هي العقوبة/i,
  // Summary / translation
  /لخّص|ترجم|اختصر|ترجمة|تلخيص/i,
  /summarize|translate|summary|translation/i,
  // Medical / health — NEVER activate GitHub mode
  /أعراض|وجع|ألم|حمى|مرض|دواء|علاج|تشخيص|طبيب|دكتور|مستشفى|عيادة|صحة/i,
  /symptoms?|disease|pain|fever|medication|diagnosis|medical|doctor|hospital|clinic/i,
  /symptôme|maladie|douleur|fièvre|médecin|hôpital/i,
  // Job search — NEVER activate GitHub mode
  /وظيفة|وظائف|توظيف|منصب عمل|بحث عن عمل|راتب|سوق العمل/i,
  /\bemploi\b|offre d'emploi|recrutement|\bjob\b|\bjobs\b|salary|hiring/i,
]

function hasAny(text, list) {
  return list.some(k => text.includes(k))
}

function matchesAnyPattern(text, patterns) {
  return patterns.some(p => p.test(text))
}

export function detectQueryLanguage(text) {
  const t = (text || '').trim()
  if (/[\u0600-\u06FF]/.test(t)) return 'ar'
  if (/[éèàçâêîôûœ]/i.test(t) || /\b(le|la|les|un|une|des|est|pour|dans)\b/i.test(t)) return 'fr'
  return 'en'
}

/**
 * Smart 12-category intent classification.
 * CRITICAL: Programming categories only activate on EXPLICIT coding/GitHub requests.
 */
export function classifyIntent(rawQuery) {
  const query = String(rawQuery || '').toLowerCase()
  const lang = detectQueryLanguage(rawQuery)

  // --- STEP 1: Check strict conversation-only patterns first ---
  const isConversationOnly = matchesAnyPattern(rawQuery, CONVERSATION_ONLY_PATTERNS)

  // --- STEP 2: Check programming/tech categories (EXPLICIT ONLY) ---
  const isExplicitCode    = hasAny(query, EXPLICIT_CODE_KW)
  const isGithubAction    = hasAny(query, GITHUB_ACTION_KW) || /github\.com\/[a-z0-9_-]+\/[a-z0-9_-]+/i.test(rawQuery)
  const isBuilder         = hasAny(query, BUILDER_KW)
  const isMobileApp       = hasAny(query, MOBILE_APP_KW)
  const isDebugging       = hasAny(query, DEBUG_KW)
  const isPromptEng       = hasAny(query, PROMPT_ENG_KW)

  // --- STEP 3: Check document/analysis categories ---
  const isOCR             = hasAny(query, OCR_KW)
  const isLegal           = hasAny(query, LEGAL_KW)

  // --- STEP 4: Check information categories ---
  const isNews            = hasAny(query, NEWS_KW)
  const isSearch          = hasAny(query, SEARCH_KW)
  const isAIReasoning     = hasAny(query, AI_REASONING_KW)
  const isStructured      = hasAny(query, STRUCTURED_KW)

  const isUrgent          = hasAny(query, URGENT_KW)
  const isSports          = hasAny(query, SPORTS_KW)
  const isTech            = hasAny(query, TECH_KW)

  // --- STEP 4b: Check new Smart Context Isolation categories ---
  const isMedical         = hasAny(query, MEDICAL_SYMPTOM_KW)
  const isJobSearch       = hasAny(query, JOB_SEARCH_KW)
  const isDoctorSearch    = hasAny(query, DOCTOR_SEARCH_KW)

  // --- STEP 4c: Image intent — SEARCH vs GENERATION (strict separation) ---
  const isImageGeneration = hasAny(query, IMAGE_GENERATION_KW)
  const isImageSearch     = !isImageGeneration && hasAny(query, IMAGE_SEARCH_KW)

  // --- STEP 5: Category resolution with strict priority ---
  // If conversation-only patterns match, NEVER go to programming mode
  let category = 'NORMAL_CHAT'

  if (!isConversationOnly) {
    if (isPromptEng)        category = 'PROGRAMMING_REQUEST'
    else if (isGithubAction) category = 'GITHUB_REPOSITORY_REQUEST'
    else if (isBuilder)     category = 'WEB_DESIGN_REQUEST'
    else if (isMobileApp)   category = 'MOBILE_APP_REQUEST'
    else if (isDebugging)   category = 'DEBUGGING_REQUEST'
    else if (isExplicitCode) category = 'PROGRAMMING_REQUEST'
    else if (isOCR)         category = 'OCR_DOCUMENT_REQUEST'
    else if (isLegal)       category = 'LEGAL_DOCUMENT_ANALYSIS'
    else if (isImageSearch)  category = 'IMAGE_SEARCH_REQUEST'
    else if (isDoctorSearch) category = 'DOCTOR_SEARCH'
    else if (isMedical)     category = 'MEDICAL_SYMPTOM'
    else if (isJobSearch)   category = 'JOB_SEARCH'
    else if (isSearch)      category = 'SEARCH_REQUEST'
    else if (isStructured && (isNews || query.length > 25)) category = 'SEARCH_REQUEST'
    else if (isNews)        category = 'NEWS_REQUEST'
    else if (isAIReasoning) category = 'AI_REASONING'
    else if (isStructured)  category = 'SEARCH_REQUEST'
    else                    category = 'NORMAL_CHAT'
  } else {
    // Conversation-only: still allow news/search/medical/jobs/image-search sub-categories
    if (isImageSearch)      category = 'IMAGE_SEARCH_REQUEST'
    else if (isDoctorSearch) category = 'DOCTOR_SEARCH'
    else if (isMedical)     category = 'MEDICAL_SYMPTOM'
    else if (isJobSearch)   category = 'JOB_SEARCH'
    else if (isSearch)      category = 'SEARCH_REQUEST'
    else if (isNews)        category = 'NEWS_REQUEST'
    else if (isAIReasoning) category = 'AI_REASONING'
    else                    category = 'NORMAL_CHAT'
  }

  const isProgrammingMode = ['PROGRAMMING_REQUEST','GITHUB_REPOSITORY_REQUEST','WEB_DESIGN_REQUEST','MOBILE_APP_REQUEST','DEBUGGING_REQUEST'].includes(category)
  const liveMode = isUrgent || /(today|الآن|اليوم|now|just|aujourd)/i.test(query)

  return {
    category,
    isProgrammingMode,
    isConversationOnly,
    lang,
    flags: {
      isExplicitCode, isGithubAction, isBuilder, isMobileApp,
      isDebugging, isPromptEng, isOCR, isLegal,
      isNews, isSearch, isAIReasoning, isStructured,
      isUrgent, isSports, isTech,
      isMedical, isJobSearch, isDoctorSearch,
      isImageSearch, isImageGeneration,
    },
    liveMode,
    breakingNews: isUrgent && isNews,
  }
}

// Legacy export — preserved for backward compatibility
export function detectIntent(rawQuery) {
  const result = classifyIntent(rawQuery)
  const lang = result.lang
  const { isGithubAction, isBuilder, isNews, isStructured, isUrgent, isSports, isTech, isExplicitCode, isPromptEng } = result.flags

  let primary = 'general'
  if (isPromptEng)                              primary = 'prompt'
  else if (isBuilder)                           primary = 'builder'
  else if (isGithubAction)                      primary = 'github'
  else if (isStructured && (isNews || rawQuery?.length > 25)) primary = 'structured'
  else if (isNews)                              primary = 'news'
  else if (isStructured)                        primary = 'structured'

  return {
    primary,
    lang,
    flags: { isBuilder, isGithub: isGithubAction, isNews, isStructured, isUrgent, isSports, isTech, isCode: isExplicitCode, isPromptEng },
    liveMode: result.liveMode,
    breakingNews: result.breakingNews,
    // Extended fields
    category: result.category,
    isProgrammingMode: result.isProgrammingMode,
    isConversationOnly: result.isConversationOnly,
  }
}

// Lightweight query expansion: AR ↔ EN seed words for multi-source fetch.
export function expandQuery(query, lang) {
  const q = (query || '').trim()
  if (!q) return [q]
  const out = new Set([q])
  // Common bilingual swaps for higher recall.
  const swaps = [
    ['أخبار', 'news'], ['الجزائر', 'algeria'], ['كرة القدم', 'football'],
    ['اقتصاد', 'economy'], ['تقنية', 'technology'], ['ذكاء اصطناعي', 'artificial intelligence'],
    ['طقس', 'weather'], ['عاجل', 'breaking'],
  ]
  for (const [ar, en] of swaps) {
    if (q.includes(ar)) out.add(q.replaceAll(ar, en))
    if (q.toLowerCase().includes(en)) out.add(q.replace(new RegExp(en, 'gi'), ar))
  }
  // Prepend "Algeria" context for short global terms when language is AR
  if (lang === 'ar' && q.split(/\s+/).length <= 3 && !q.includes('الجزائر')) {
    out.add(`الجزائر ${q}`)
  }
  return Array.from(out).slice(0, 4)
}

// Optional natural-query enhancement for builder intent — guides downstream model.
export function enhanceBuilderQuery(query) {
  const q = String(query || '').toLowerCase()
  const wantsResponsive = /موقع|تطبيق|page|app|website/.test(q)
  const wantsModern     = /جميل|جذاب|premium|modern|sleek|elegant/.test(q)
  const tags = []
  if (wantsResponsive) tags.push('responsive')
  if (wantsModern)     tags.push('modern UI', 'rounded-2xl', 'shadow-soft')
  tags.push('React', 'Tailwind CSS', 'TypeScript', 'accessible (WCAG AA)')
  return `${query} → preferred stack: ${tags.join(', ')}`
}

/**
 * Maps a detectIntent() result → taskHint for the AI capability router.
 * FIX v2: نتحقق من النوع (code/sports/...) أولاً — الأولوية للنشاط لا للغة
 * taskHint values: 'realtime'|'multilingual'|'technical'|'retrieval'|'reasoning'|'translation'|'general'
 */
export function getTaskRoutingHint(intent) {
  if (!intent) return 'general'
  const { primary, lang, flags, category } = intent

  // ── 1. نوع النشاط أولاً (أعلى أولوية) ─────────────────────────────────────
  // Code / builder / GitHub → technical provider (DeepSeek → OpenAI → NVIDIA)
  if (primary === 'builder' || primary === 'github' || flags?.isCode || flags?.isProgramming) return 'technical'

  // Debugging → technical
  if (category === 'debug' || flags?.isDebug) return 'technical'

  // Sports / live scores → realtime provider (Cerebras → Groq — lowest latency)
  if (flags?.isSports || category === 'sports') return 'realtime'

  // Urgent breaking news → realtime
  if (flags?.isUrgent || intent.breakingNews) return 'realtime'

  // News / structured data → retrieval provider (Cohere → OpenAI)
  if (primary === 'news' || primary === 'structured' || category === 'news') return 'retrieval'

  // Legal / document analysis → retrieval (structured context grounding)
  if (category === 'legal' || flags?.isLegal) return 'retrieval'

  // Medical / health → retrieval (fact-grounded)
  if (flags?.isMedical || category === 'medical') return 'retrieval'

  // Search / research → reasoning (deep multi-step)
  if (intent.liveMode || category === 'research') return 'reasoning'

  // ── 2. Langue seulement si aucun type spécifique détecté ────────────────────
  // Arabic (darija / MSA) or French → multilingual provider (Gemini → HuggingFace)
  if (lang === 'ar' || lang === 'fr') return 'multilingual'

  return 'general'
}
