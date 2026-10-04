const CREATE_OR_DESIGN_RE = /(?:\b(?:create|generate|make|build|design|write|draft|prepare|créer|creer|générer|generer|rédige|redige|faire)\b|أنشئ|انشئ|إنشاء|انشاء|اصنع|صنع|اعمل|أعمل|جهز|جهّز|حضّر|حضر|اكتب|كتب\s*لي|صمم|صمّم|ولد|ولّد|توليد)/i
const WANT_RE = /(?:\b(?:i\s+want|i\s+need|want\s+me|je\s+veux|je\s+voudrais|j'ai\s+besoin)\b|أريد|اريد|بغيت|نحب|حاب|نحتاج)/i
const OPEN_TOOL_RE = /(?:\b(?:open|use|launch|go\s+to|take\s+me\s+to|navigate\s+to|ouvrir|ouvre|utiliser|utilise|aller\s+à)\b|افتح|فتح|استعمل|استخدم|روح\s*(?:إلى|ل)?|اذهب\s*(?:إلى|ل)?|ودّيني|وديني|وجهني|وجّهني)/i
const CALCULATE_RE = /(?:\b(?:calculate|compute|estimate|calculer|estimer)\b|احسب|أحسب|حساب|احسبلي|احسب\s+لي)/i
const SEARCH_RE = /(?:\b(?:search|find|look\s+for|chercher|rechercher)\b|ابحث|بحث|دور|دوّر|لقالي|اعثر\s+على)/i
const ANALYZE_RE = /(?:\b(?:analyze|analyse|review|inspect)\b|حلل|حلّل|تحليل|افحص)/i
const CONVERT_RE = /(?:\b(?:convert|transform|turn)\b|حوّل|حول|تحويل)/i
const UPLOAD_SHARE_RE = /(?:\b(?:upload|share|send)\b|ارفع|أرفع|رفع|شارك|أرسل|ارسل)/i
const CAPTURE_RE = /(?:\b(?:capture|take|get)\b|التقط|خذ|صوّر|صور)/i
const IMAGE_CONTEXT_RE = /(?:\b(?:images?|photos?|pictures?|drawings?|illustrations?|artwork|wallpapers?|png|jpe?g|webp|draw|sketch|paint|illustrate|dessine)\b|صورة|صور|صوره|الصورة|الصوره|صورلي|صوري|رسم\s*لي|ارسم|أرسم|ارسملي|ارسم\s+لي|تصميم\s*صورة)/i
const INFO_QUESTION_RE = /^\s*(?:ما\s+(?:هو|هي|معنى|المقصود|الفرق)|ماهو(?:\s|$)|ماهي(?:\s|$)|ماذا(?:\s|$)|من(?:\s|$)|متى(?:\s|$)|أين(?:\s|$)|اين(?:\s|$)|كيف(?:\s|$)|لماذا(?:\s|$)|ليش(?:\s|$)|علاش(?:\s|$)|واش(?:\s|$)|وش(?:\s|$)|هل\s+(?:توجد|يوجد|هناك|يعني|هو|هي)|what\s+(?:is|are|does|do|means?)\b|what'?s\b|how\s+(?:does|do|to|can\s+i|could\s+i)\b|why\b|where\b|who\b|when\b|which\b|explain\b|define\b|do\s+you\s+know\b|can\s+you\s+explain\b|qu['’]?est-ce\b|comment\s+(?:fonctionne|marche|utiliser)\b|pourquoi\b)/i
const WANT_INFO_RE = /(?:\b(?:i\s+want|i\s+need|je\s+veux|j'ai\s+besoin)\b|أريد|اريد|بغيت|نحب|حاب|نحتاج).{0,40}(?:\b(?:to\s+know|information|details|learn\s+about)\b|معلومات|شرح|معرفة|نفهم|نعرف|savoir|comprendre)/i

const QR_CREATE_RE = /(?:\b(?:create|generate|make|build|design|créer|crée|creer|cree|générer|generer|génère|genere|faire)\b|أنشئ|انشئ|إنشاء|انشاء|اعمل|أعمل|عمل|اصنع|صنع|ولّد|ولد|توليد|دير|ندير|صمّم|صمم)/i
const PLAN_ACTION_RE = /(?:\b(?:plan|organize)\b|خطط|خطّط|نظم|نظّم)/i
const READ_ALOUD_RE = /(?:\b(?:read\s+(?:this\s+)?aloud|speak|voice)\b|اقرأ|اقرا|انطق|حوّل\s+النص\s+إلى\s+صوت)/i
const ACTIONS = { create: CREATE_OR_DESIGN_RE, want: WANT_RE, open: OPEN_TOOL_RE, calculate: CALCULATE_RE, search: SEARCH_RE, analyze: ANALYZE_RE, convert: CONVERT_RE, uploadShare: UPLOAD_SHARE_RE, capture: CAPTURE_RE, qr: QR_CREATE_RE, plan: PLAN_ACTION_RE, readAloud: READ_ALOUD_RE }

const TOOL_SPECS = [
  { id: 'cv', toolName: 'مولّد السيرة الذاتية', toolIcon: '📄', toolDesc: 'أنشئ سيرة ذاتية احترافية بالعربية أو الفرنسية في ثوانٍ', target: /(?:\bcv\b|\bresume\b|\brésumé\b|\bcurriculum\s+vitae\b|السيرة\s+الذاتية|سيرة\s+ذاتية|سي\s*في)/i, actions: ['create', 'want'] },
  { id: 'planner', toolName: 'مخطط المشاريع', toolIcon: '📋', toolDesc: 'حوّل فكرتك إلى خطة عمل تفصيلية مع مهام وجدول زمني', target: /(?:project\s+(?:plan|planner)|project\s+planning|plan\s+(?:a\s+)?project|خطة\s+(?:مشروع|المشروع)|مخطط\s*(?:المشروع|المشاريع))/i, actions: ['create', 'want', 'plan'] },
  { id: 'docs', toolName: 'وثائق تجارية', toolIcon: '📑', toolDesc: 'عقود عمل • مراسلات • عروض أسعار • محاضر اجتماعات', target: /(?:\b(?:contract|contrat|quotation|quote|devis|business\s+document|business\s+letter)\b|عقد(?:\s+(?:عمل|تجاري|إيجار))?|عرض\s+سعر|مراسلة\s+تجارية|وثائق?\s+تجارية)/i, actions: ['create', 'want'] },
  { id: 'jobs', toolName: 'بحث وظيفي', toolIcon: '💼', toolDesc: 'ابحث عن وظيفة في الجزائر واحصل على مساعدة في رسالة التقدم', target: /(?:\b(?:jobs?|employment|job\s+search|work\s+opportunities)\b|وظيف(?:ة|ات)|بحث\s+عن\s+عمل)/i, actions: ['search', 'want'] },
  { id: 'health', toolName: 'وكيل الصحة', toolIcon: '🏥', toolDesc: 'تحليل الأعراض • البحث عن طبيب • نصائح صحية للجزائر', target: /(?:\bhealth\s+(?:tool|agent)\b|أداة\s+الصحة|وكيل\s+الصحة|مساعد\s+الصحة)/i, actions: ['open'] },
  { id: 'ocr', toolName: 'قارئ الوثائق OCR', toolIcon: '📷', toolDesc: 'ارفع صورة واستخرج النص تلقائياً بـ Tesseract', target: /(?:\bocr\s+(?:tool|reader)\b|أداة\s*ocr|قارئ\s+الوثائق)/i, actions: ['open'] },
  { id: 'bizplan', toolName: 'خطة العمل Business Plan', toolIcon: '📊', toolDesc: 'خطة عمل كاملة لمشروعك في الجزائر مع أرقام حقيقية', target: /(?:\bbusiness\s+plan\b|خطة\s+عمل|دراسة\s+جدوى)/i, actions: ['create', 'want'] },
  { id: 'invoice', toolName: 'مولّد الفواتير', toolIcon: '🧾', toolDesc: 'فواتير جزائرية احترافية — TVA • HT • TTC — تحميل PDF', target: /(?:\binvoices?\b|\bfactures?\b|فاتور(?:ة|ات))/i, actions: ['create', 'want'] },
  { id: 'tax', toolName: 'مُحاسب الضرائب', toolIcon: '🧮', toolDesc: 'IRG (ضريبة الدخل) • IBS (ضريبة الشركات) — شرائح 2024', target: /(?:\btaxes?\b|\btax\b|\bimp[oô]ts?\b|\bIRG\b|\bIBS\b|ضرائب?|ضريبة)/i, actions: ['calculate'] },
  { id: 'zakat', toolName: 'حاسبة الزكاة الشاملة', toolIcon: '☪️', toolDesc: 'زكاة المال · الذهب · الفضة · التجارة · الزروع — بالدينار الجزائري', target: /(?:\bzakat\b|زكاة(?:\s+المال)?)/i, actions: ['calculate'] },
  { id: 'hashtag', toolName: 'مولّد الهاشتاغ', toolIcon: '#️⃣', toolDesc: 'هاشتاغات ذكية للجزائر — إنستغرام • تيك توك • X • لينكدإن', target: /(?:\bhashtags?\b|هاشتاغات?|هاشتاجات?)/i, actions: ['create', 'want'] },
  { id: 'excel', toolName: 'محرر Excel الذكي', toolIcon: '📊', toolDesc: 'جدول بيانات كامل + 30 دالة + مساعد AI للدوال — استيراد/تصدير XLSX', target: /(?:\bexcel\b|\bxlsx\b|\bspreadsheet\b|جدول\s+بيانات|ملف\s+إكسل|ملف\s+اكسل)/i, actions: ['create', 'want', 'open'] },
  { id: 'pension', toolName: 'حاسبة التقاعد CNAS', toolIcon: '🏦', toolDesc: 'احسب اشتراكاتك ومعاشك المتوقع — CNAS موظف · CASNOS مستقل', target: /(?:\bpension\b|\bretirement\b|\bCNAS\b|\bCASNOS\b|معاش|تقاعد)/i, actions: ['calculate'] },
  { id: 'qrcode', toolName: 'مولّد QR Code', toolIcon: '📲', toolDesc: 'أنشئ QR Code لأي نص أو رابط أو معلومات — تحميل فوري', target: /(?:\bqr(?:[\s-]*code)?\b|\bcode\s*qr\b|كود\s*(?:الـ\s*)?qr|qr\s*كود|رمز\s*(?:(?:الـ\s*)?qr|الاستجابة\s*السريعة))/i, actions: ['create', 'want', 'open', 'qr'], implicit: /\bqr(?:[\s-]*code)?\s*(?:for|of|pour)\b|\bqr\s*ل(?:ـ)?/i, message: 'لإنشاء رمز QR، استخدم أداة QR Code المخصصة في DZ Tools — إنشاء سريع ومجاني.', quickSuggestions: ['اعمل QR لرابط موقعي', 'QR لرقم هاتفي', 'QR لواتساب'] },
  { id: 'bizcard', toolName: 'بطاقة العمل', toolIcon: '🪪', toolDesc: 'صمّم بطاقة عمل احترافية بالعربية والفرنسية — تصدير PDF', target: /(?:\bbusiness\s+cards?\b|\bcartes?\s+de\s+visite\b|بطاقة\s+(?:عمل|أعمال))/i, actions: ['create'] },
  { id: 'dataanalysis', toolName: 'محلل البيانات', toolIcon: '📈', toolDesc: 'ارفع ملف Excel أو CSV — تحليل ذكي + رسوم بيانية + ملخص AI', target: /(?:\b(?:data|csv|excel)\s*(?:file|data|dataset|sheet)?\b|\bspreadsheet\b|\bdataset\b|بيانات|ملف\s+(?:csv|excel|إكسل|اكسل))/i, actions: ['analyze'] },
  { id: 'tts', toolName: 'تحويل نص إلى صوت', toolIcon: '🔊', toolDesc: 'حوّل أي نص إلى صوت طبيعي بأصوات عربية وفرنسية وإنجليزية — تحميل MP3', target: /(?:\b(?:text\s+to\s+speech|tts|speech\s+audio|voice\s+over|audio|read\s+(?:this\s+)?aloud)\b|تحويل\s+(?:النص|نص)\s+إلى\s+صوت|نص\s+إلى\s+صوت|قراءة\s+بصوت)/i, actions: ['convert', 'create', 'readAloud'] },
  { id: 'screenshot', toolName: 'تصوير المواقع', toolIcon: '📸', toolDesc: 'التقط صورة كاملة لأي موقع — تنزيل PNG أو PDF — Desktop / Mobile', target: /(?:\b(?:website\s+)?screenshots?\b|\bweb\s+capture\b|لقطة\s+شاشة|تصوير\s+(?:المواقع|موقع)|أداة\s+تصوير\s+المواقع)/i, actions: ['capture', 'open'] },
  { id: 'fileupload', toolName: 'رفع ومشاركة الملفات', toolIcon: '☁️', toolDesc: 'ارفع أي ملف (صورة · فيديو · PDF · ملف) واحصل على رابط مشاركة آمن — GoFile.io', target: /(?:\b(?:upload|share)\b.{0,40}\b(?:files?|pdf|document)\b|\bfile\s+sharing\b|رفع\s+ملف|مشاركة\s+الملفات|شارك\s+ملف)/i, actions: ['uploadShare'] },
  { id: 'convert', toolName: 'محوِّل الصيغ', toolIcon: '🔄', toolDesc: 'حوِّل فيديو · صوت · صور بين جميع الصيغ — مباشرة في المتصفح بـ FFmpeg.wasm', target: /(?:\b(?:file\s+format|format\s+converter|convert\s+(?:a\s+)?file|convert\s+video|convert\s+audio)\b|\bconvert\b.{0,40}\b(?:file|document|docx|doc|pdf|xlsx|csv|mp4|mp3|wav|avi|mkv)\b|تحويل\s+الصيغ|محول\s+الصيغ|صيغة\s+الملف)/i, actions: ['convert'] },
  { id: 'flights', toolName: 'رحلات الخطوط الجزائرية', toolIcon: '✈️', toolDesc: 'ابحث عن رحلات Air Algérie الداخلية والدولية بالمواعيد وأيام التشغيل', target: /(?:\b(?:flights?|air\s+algerie|air\s+algérie)\b|رحلات?|طيران)/i, actions: ['search'] },
]

export function getToolRedirectIntent(text, options = {}) {
  const value = typeof text === 'string' ? text.trim() : ''
  if (!value || options.hasImageAttachment || IMAGE_CONTEXT_RE.test(value) || INFO_QUESTION_RE.test(value) || WANT_INFO_RE.test(value)) return null

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