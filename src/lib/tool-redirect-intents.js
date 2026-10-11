const CREATE_OR_DESIGN_RE = /(?:\b(?:create|generate|make|build|design|write|draft|prepare|créer|creer|crée|cree|créez|creez|générer|generer|génère|genere|générez|generez|rédige|redige|rédiger|rediger|rédigez|redigez|faire|fais|faites|préparer|preparer|prépare|prepare|concevoir|fabriquer|fabrique)\b|أنشئ|انشئ|إنشاء|انشاء|اصنع|صنع|اعمل|أعمل|جهز|جهّز|حضّر|حضر|اكتب|كتب\s*لي|صمم|صمّم|ولد|ولّد|توليد|دير(?:لي|لنا)?|صايب(?:لي|لنا)?|وجد(?:لي|لنا)?)/i
const WANT_RE = /(?:\b(?:i\s+want|i\s+need|want\s+me|je\s+veux|je\s+voudrais|j['’]ai\s+besoin|je\s+souhaite|j['’]aimerais)\b|أريد|اريد|بغيت|نحب|حاب|نحتاج)/i
const OPEN_TOOL_RE = /(?:\b(?:open|use|launch|go\s+to|take\s+me\s+to|navigate\s+to|ouvrir|ouvre|ouvrez|utiliser|utilise|utilisez|lancer|lance|lancez|accéder|acceder|accédez|accedez|aller\s+(?:à|a|sur)|emmène-moi|emmene-moi|amène-moi|amene-moi)\b|افتح|فتح|استعمل|استخدم|روح\s*(?:إلى|ل)?|اذهب\s*(?:إلى|ل)?|ودّيني|وديني|وجهني|وجّهني)/i
const CALCULATE_RE = /(?:\b(?:calculate|compute|estimate|calculer|calcule|calculez|estimer|estime|estimez)\b|احسب|أحسب|حساب|احسبلي|احسب\s+لي)/i
const SEARCH_RE = /(?:\b(?:search|find|look\s+for|chercher|cherche|cherchez|rechercher|recherche|recherchez|trouver|trouve|trouvez)\b|ابحث|بحث|دور|دوّر|لقالي|اعثر\s+على)/i
const ANALYZE_RE = /(?:\b(?:analyze|analyse|review|inspect|analyser|examiner|étudier|etudier|étudie|etudie)\b|حلل|حلّل|تحليل|افحص)/i
const CONVERT_RE = /(?:\b(?:convert|convertir|convertis|convertissez|transform|transformer|transforme|transformez|changer|changez|turn)\b|حوّل|حول|تحويل)/i
const UPLOAD_SHARE_RE = /(?:\b(?:upload|share|send|téléverser|televerser|téléverse|televerse|partage|partager|partagez|envoyer|déposer|deposer)\b|ارفع|أرفع|رفع|شارك|أرسل|ارسل)/i
const CAPTURE_RE = /(?:\b(?:capture|capturer|take|get|prendre\s+(?:une\s+)?capture|faire\s+une\s+capture)\b|التقط|خذ|صوّر|صور)/i
const IMAGE_CONTEXT_RE = /(?:\b(?:images?|photos?|pictures?|drawings?|illustrations?|artwork|wallpapers?|png|jpe?g|webp|draw|sketch|paint|illustrate|dessine|dessin|dessiner|croquis|illustration|illustrations|photo)\b|صورة|صور|صوره|الصورة|الصوره|صورلي|صوري|رسم\s*لي|ارسم|أرسم|ارسملي|ارسم\s+لي|تصميم\s*صورة)/i
const IMAGE_TOOL_TARGET_RE = /(?:\b(?:visual\s+ai|images?\s+tool|picture\s+tool|photo\s+tool|outil\s+(?:d['’]image|photo)|outil\s+de\s+création\s+d['’]images)\b|أداة\s*(?:الصور|الذكاء\s+البصري)|الذكاء\s+البصري)/i
const INFO_QUESTION_RE = /^\s*(?:(?:اشرح|شرح|عرّف|عرف|تعريف)(?:\s|$)|ما\s+(?:هو|هي|معنى|المقصود|الفرق)|ماهو(?:\s|$)|ماهي(?:\s|$)|ماذا(?:\s|$)|من(?:\s|$)|متى(?:\s|$)|أين(?:\s|$)|اين(?:\s|$)|كيف(?:\s|$)|لماذا(?:\s|$)|ليش(?:\s|$)|علاش(?:\s|$)|واش(?:\s|$)|وش(?:\s|$)|هل\s+(?:توجد|يوجد|هناك|يعني|هو|هي)|(?:what\s+(?:is|are|does|do|means?)\b|what'?s\b|how\s+(?:does|do|to|can\s+i|could\s+i)\b|why\b|where\b|who\b|when\b|which\b|explain\b|define\b|do\s+you\s+know\b|can\s+you\s+explain\b|qu['’]?est-ce\b|comment\s+(?:fonctionne|marche|utiliser|créer|creer|faire|calculer|convertir)\b|pourquoi\b|(?:quel|quelle|quels|quelles)(?:\s|$)|où(?:\s|$)|combien(?:\s|$)))/i
const WANT_INFO_RE = /(?:\b(?:i\s+want|i\s+need|je\s+veux|je\s+voudrais|je\s+souhaite|j['’]ai\s+besoin)\b|أريد|اريد|بغيت|نحب|حاب|نحتاج).{0,40}(?:\b(?:to\s+know|information|details|learn\s+about|savoir|comprendre|renseignements?)\b|معلومات|شرح|معرفة|نفهم|نعرف)/i

const QR_CREATE_RE = /(?:\b(?:create|generate|make|build|design|créer|crée|créez|creer|cree|générer|génère|générez|generer|genere|faire|fais|faites)\b|أنشئ|انشئ|إنشاء|انشاء|إنشأ|انشأ|اعمل|أعمل|عمل|اصنع|صنع|ولّد|ولد|توليد|دير|ندير|صمّم|صمم)/i
const PLAN_ACTION_RE = /(?:\b(?:plan|organize|planifier|planifie|planifiez|organiser|organise|organisez)\b|خطط|خطّط|نظم|نظّم)/i
const READ_ALOUD_RE = /(?:\b(?:read\s+(?:this\s+)?aloud|speak|voice|lire\s+(?:(?:ce\s+)?texte\s+)?(?:à|a)\s+voix\s+haute|lisez\s+(?:à|a)\s+voix\s+haute|lecture\s+(?:à|a)\s+voix\s+haute)\b|اقرأ|اقرا|انطق|حوّل\s+النص\s+إلى\s+صوت)/i
const ACTIONS = { create: CREATE_OR_DESIGN_RE, want: WANT_RE, open: OPEN_TOOL_RE, calculate: CALCULATE_RE, search: SEARCH_RE, analyze: ANALYZE_RE, convert: CONVERT_RE, uploadShare: UPLOAD_SHARE_RE, capture: CAPTURE_RE, qr: QR_CREATE_RE, plan: PLAN_ACTION_RE, readAloud: READ_ALOUD_RE }

const TOOL_SPECS = [
  { id: 'image', toolName: 'Visual AI — صور', toolIcon: '🖼️', toolDesc: 'بحث عن صور • بحث عكسي • تحليل AI • OCR من الصور', target: IMAGE_TOOL_TARGET_RE, actions: ['open'] },
  { id: 'cv', toolName: 'مولّد السيرة الذاتية', toolIcon: '📄', toolDesc: 'أنشئ سيرة ذاتية احترافية بالعربية أو الفرنسية في ثوانٍ', target: /(?:\bcv\b|\bresume\b|\brésumé\b|\bcurriculum\s+vitae\b|السيرة\s+الذاتية|سيرة\s+ذاتية|سي\s*في)/i, actions: ['create', 'want'] },
  { id: 'planner', toolName: 'مخطط المشاريع', toolIcon: '📋', toolDesc: 'حوّل فكرتك إلى خطة عمل تفصيلية مع مهام وجدول زمني', target: /(?:project\s+(?:plan|planner)|project\s+planning|plan\s+(?:a\s+)?project|plan\s+(?:de|du)\s+projet|planification\s+(?:d['’]un?\s+)?projet|planifi(?:er|e|ez)\s+(?:un\s+)?projet|خطة\s+(?:مشروع|المشروع)|مخطط\s*(?:المشروع|المشاريع))/i, actions: ['create', 'want', 'plan'] },
  { id: 'docs', toolName: 'وثائق تجارية', toolIcon: '📑', toolDesc: 'عقود عمل • مراسلات • عروض أسعار • محاضر اجتماعات', target: /(?:\b(?:contract|contrat|quotation|quote|devis|business\s+document|business\s+letter)\b|عقد(?:\s+(?:عمل|تجاري|إيجار))?|عرض\s+سعر|مراسلة\s+تجارية|وثائق?\s+تجارية)/i, actions: ['create', 'want'] },
  { id: 'jobs', toolName: 'بحث وظيفي', toolIcon: '💼', toolDesc: 'ابحث عن وظيفة في الجزائر واحصل على مساعدة في رسالة التقدم', target: /(?:\b(?:jobs?|employment|job\s+search|work\s+opportunities|emplois?|offre\s+d['’]emploi|recherche\s+d['’]emploi|postes?)\b|وظيف(?:ة|ات)|بحث\s+عن\s+عمل)/i, actions: ['search', 'want'] },
  { id: 'health', toolName: 'وكيل الصحة', toolIcon: '🏥', toolDesc: 'تحليل الأعراض • البحث عن طبيب • نصائح صحية للجزائر', target: /(?:\bhealth\s+(?:tool|agent)\b|\boutil\s+(?:de|du)\s+sant[eé]|assistant\s+(?:de\s+)?sant[eé]|أداة\s+الصحة|وكيل\s+الصحة|مساعد\s+الصحة)/i, actions: ['open'] },
  { id: 'ocr', toolName: 'قارئ الوثائق OCR', toolIcon: '📷', toolDesc: 'ارفع صورة واستخرج النص تلقائياً بـ Tesseract', target: /(?:\bocr\s+(?:tool|reader)\b|\blecteur\s+ocr\b|أداة\s*ocr|قارئ\s+الوثائق)/i, actions: ['open'] },
  { id: 'bizplan', toolName: 'خطة العمل Business Plan', toolIcon: '📊', toolDesc: 'خطة عمل كاملة لمشروعك في الجزائر مع أرقام حقيقية', target: /(?:\b(?:business\s+plan|plan\s+d['’]affaires|plan\s+d['’]entreprise)\b|\b[ée]tude\s+de\s+(?:faisabilit[eé]|march[eé])\b|خطة\s+عمل|دراسة\s+جدوى)/i, actions: ['create', 'want'] },
  { id: 'invoice', toolName: 'مولّد الفواتير', toolIcon: '🧾', toolDesc: 'فواتير جزائرية احترافية — TVA • HT • TTC — تحميل PDF', target: /(?:\binvoices?\b|\bfactures?\b|فاتور(?:ة|ات))/i, actions: ['create', 'want'] },
  { id: 'tax', toolName: 'مُحاسب الضرائب', toolIcon: '🧮', toolDesc: 'IRG (ضريبة الدخل) • IBS (ضريبة الشركات) — شرائح 2024', target: /(?:\btaxes?\b|\btax\b|\bimp[oô]ts?\b|\bIRG\b|\bIBS\b|ضرائب?|ضريبة)/i, actions: ['calculate'] },
  { id: 'zakat', toolName: 'حاسبة الزكاة الشاملة', toolIcon: '☪️', toolDesc: 'زكاة المال · الذهب · الفضة · التجارة · الزروع — بالدينار الجزائري', target: /(?:\bzakat\b|زكاة(?:\s+المال)?)/i, actions: ['calculate'] },
  { id: 'hashtag', toolName: 'مولّد الهاشتاغ', toolIcon: '#️⃣', toolDesc: 'هاشتاغات ذكية للجزائر — إنستغرام • تيك توك • X • لينكدإن', target: /(?:\bhashtags?\b|\bmots?[- ]di[eè]ses?\b|هاشتاغات?|هاشتاجات?)/i, actions: ['create', 'want'] },
  { id: 'excel', toolName: 'محرر Excel الذكي', toolIcon: '📊', toolDesc: 'جدول بيانات كامل + 30 دالة + مساعد AI للدوال — استيراد/تصدير XLSX', target: /(?:\bexcel\b|\bxlsx\b|\bspreadsheet\b|\btableur\b|\bfeuille\s+de\s+calcul\b|جدول\s+بيانات|ملف\s+إكسل|ملف\s+اكسل)/i, actions: ['create', 'want', 'open'] },
  { id: 'pension', toolName: 'حاسبة التقاعد CNAS', toolIcon: '🏦', toolDesc: 'احسب اشتراكاتك ومعاشك المتوقع — CNAS موظف · CASNOS مستقل', target: /(?:\bpension\b|\bretirement\b|\bretraite\b|\bCNAS\b|\bCASNOS\b|معاش|تقاعد)/i, actions: ['calculate'] },
  { id: 'qrcode', toolName: 'مولّد QR Code', toolIcon: '📲', toolDesc: 'أنشئ QR Code لأي نص أو رابط أو معلومات — تحميل فوري', target: /(?:\bqr(?:[\s-]*code)?\b|\bcode\s*qr\b|كود\s*(?:الـ\s*)?qr|qr\s*كود|رمز\s*(?:(?:الـ\s*)?qr|الاستجابة\s*السريعة))/i, actions: ['create', 'want', 'open', 'qr'], implicit: /\bqr(?:[\s-]*code)?\s*(?:for|of|pour)\b|\bqr\s*ل(?:ـ)?|كود\s*(?:الـ\s*)?qr\s+في\s+(?:جيبي|جيبك|جيبه|جيبها|الجيب)(?=\s|$|[،.!?؟])/i, message: 'لإنشاء رمز QR، استخدم أداة QR Code المخصصة في DZ Tools — إنشاء سريع ومجاني.', quickSuggestions: ['اعمل QR لرابط موقعي', 'QR لرقم هاتفي', 'QR لواتساب'] },
  { id: 'bizcard', toolName: 'بطاقة العمل', toolIcon: '🪪', toolDesc: 'صمّم بطاقة عمل احترافية بالعربية والفرنسية — تصدير PDF', target: /(?:\bbusiness\s+cards?\b|\bcartes?\s+de\s+visite\b|بطاقة\s+(?:عمل|أعمال))/i, actions: ['create'] },
  { id: 'dataanalysis', toolName: 'محلل البيانات', toolIcon: '📈', toolDesc: 'ارفع ملف Excel أو CSV — تحليل ذكي + رسوم بيانية + ملخص AI', target: /(?:\b(?:data|csv|excel)\s*(?:file|data|dataset|sheet)?\b|\bspreadsheet\b|\bdataset\b|\banalyse\s+(?:des?\s+)?donn[eé]es\b|\b(?:fichier\s+(?:csv|de\s+donn[eé]es)|donn[eé]es\s+csv)\b|بيانات|ملف\s+(?:csv|excel|إكسل|اكسل))/i, actions: ['analyze'] },
  { id: 'tts', toolName: 'تحويل نص إلى صوت', toolIcon: '🔊', toolDesc: 'حوّل أي نص إلى صوت طبيعي بأصوات عربية وفرنسية وإنجليزية — تحميل MP3', target: /(?:\b(?:text\s+to\s+speech|tts|speech\s+audio|voice\s+over|audio|read\s+(?:this\s+)?aloud|synth[eè]se\s+vocale|texte\s+en\s+parole|lire\s+(?:(?:ce\s+)?texte\s+)?(?:à|a)\s+voix\s+haute)\b|تحويل\s+(?:النص|نص)\s+إلى\s+صوت|نص\s+إلى\s+صوت|قراءة\s+بصوت)/i, actions: ['convert', 'create', 'readAloud'] },
  { id: 'screenshot', toolName: 'تصوير المواقع', toolIcon: '📸', toolDesc: 'التقط صورة كاملة لأي موقع — تنزيل PNG أو PDF — Desktop / Mobile', target: /(?:\b(?:website\s+)?screenshots?\b|\bweb\s+capture\b|\bcapture\s+d['’]écran\b|\bcapture\s+(?:de\s+)?site\s+(?:web|internet)\b|لقطة\s+شاشة|تصوير\s+(?:المواقع|موقع)|أداة\s+تصوير\s+المواقع)/i, actions: ['capture', 'open'] },
  { id: 'fileupload', toolName: 'رفع ومشاركة الملفات', toolIcon: '☁️', toolDesc: 'ارفع أي ملف (صورة · فيديو · PDF · ملف) واحصل على رابط مشاركة آمن — GoFile.io', target: /(?:\b(?:upload|share)\b.{0,40}\b(?:files?|pdf|document)\b|\bfile\s+sharing\b|\b(?:t[eé]l[eé]verser|partage|partager|partagez|envoyer)\b.{0,40}\b(?:fichier|document|pdf)\b|رفع\s+ملف|مشاركة\s+الملفات|شارك\s+ملف)/i, actions: ['uploadShare'] },
  { id: 'convert', toolName: 'محوِّل الصيغ', toolIcon: '🔄', toolDesc: 'حوِّل فيديو · صوت · صور بين جميع الصيغ — مباشرة في المتصفح بـ FFmpeg.wasm', target: /(?:\b(?:file\s+format|format\s+converter|convert\s+(?:a\s+)?file|convert\s+video|convert\s+audio)\b|\b(?:convert|convertir|convertis|convertissez|transformer|transforme|transformez)\b.{0,40}\b(?:file|document|docx|doc|pdf|xlsx|csv|mp4|mp3|wav|avi|mkv|fichier|format|vid[eé]o|audio)\b|تحويل\s+الصيغ|محول\s+الصيغ|صيغة\s+الملف)/i, actions: ['convert'] },
  { id: 'flights', toolName: 'رحلات الخطوط الجزائرية', toolIcon: '✈️', toolDesc: 'ابحث عن رحلات Air Algérie الداخلية والدولية بالمواعيد وأيام التشغيل', target: /(?:\b(?:flights?|air\s+algerie|air\s+algérie|vols?|billets?\s+d['’]avion)\b|رحلات?|طيران)/i, actions: ['search'] },
]

export function getToolRedirectIntent(text, options = {}) {
  const value = typeof text === 'string' ? text.trim() : ''
  if (!value || options.hasImageAttachment || INFO_QUESTION_RE.test(value) || WANT_INFO_RE.test(value)) return null

  const imageTool = TOOL_SPECS.find(spec => spec.id === 'image')
  const imageToolRequested = imageTool && imageTool.actions.some(action => ACTIONS[action].test(value)) && imageTool.target.test(value)
  if (!imageToolRequested && IMAGE_CONTEXT_RE.test(value)) return null
  if (imageToolRequested) return toRedirect(imageTool)

  const qr = TOOL_SPECS.find(spec => spec.id === 'qrcode')
  const qrRequested = qr && (qr.actions.some(action => ACTIONS[action].test(value)) && qr.target.test(value) || qr.implicit.test(value))
  if (qrRequested) return toRedirect(qr)

  for (const spec of TOOL_SPECS) {
    if (spec.id === 'qrcode') continue
    if (spec.actions.some(action => ACTIONS[action].test(value)) && spec.target.test(value)) return toRedirect(spec)
  }
  return null
}

function toRedirect(spec) {
  return {
    id: spec.id,
    toolName: spec.toolName,
    toolUrl: '/tools?tool=' + encodeURIComponent(spec.id),
    toolIcon: spec.toolIcon,
    toolDesc: spec.toolDesc,
    message: spec.message || ('لإتمام هذا الطلب، افتح أداة ' + spec.toolName + ' في DZ Tools.'),
    ...(spec.quickSuggestions ? { quickSuggestions: spec.quickSuggestions } : {}),
  }
}