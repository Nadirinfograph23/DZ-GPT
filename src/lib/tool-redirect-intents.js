const CREATE_OR_DESIGN_RE = /(?:\b(?:create|generate|make|build|design|write|draft|prepare|créer|creer|crée|cree|créez|creez|générer|generer|génère|genere|générez|generez|rédige|redige|rédiger|rediger|rédigez|redigez|faire|fais|faites|préparer|preparer|prépare|prepare|concevoir|fabriquer|fabrique|ndir|dirli|sawb(?:li)?|sayi(?:li)?|wajedli)\b|أنشئ|انشئ|إنشأ|انشأ|إنشاء|انشاء|اصنع|صنع|اعمل|أعمل|جهز|جهّز|حضّر|حضر|اكتب|كتب\s*لي|صمم|صمّم|ولد|ولّد|توليد|دير(?:لي|لنا)?|صايب(?:لي|لنا)?|وجد(?:لي|لنا)?|ندير)/i
const WANT_RE = /(?:\b(?:i\s+want|i\s+need|want\s+me|je\s+veux|je\s+voudrais|j['’]ai\s+besoin|je\s+souhaite|j['’]aimerais|nheb|bghit|hab)\b|أريد|اريد|بغيت|نحب|حاب|نحتاج)/i
const OPEN_TOOL_RE = /(?:\b(?:open|use|launch|go\s+to|take\s+me\s+to|navigate\s+to|ouvrir|ouvre|ouvrez|utiliser|utilise|utilisez|lancer|lance|lancez|accéder|acceder|accédez|accedez|aller\s+(?:à|a|sur)|emmène-moi|emmene-moi|amène-moi|amene-moi)\b|افتح|فتح|استعمل|استخدم|روح\s*(?:إلى|ل)?|اذهب\s*(?:إلى|ل)?|ودّيني|وديني|وجهني|وجّهني)/i
const CALCULATE_RE = /(?:\b(?:calculate|compute|estimate|calculer|calcule|calculez|estimer|estime|estimez|7seb|7eseb)\b|احسب|أحسب|حساب|احسبلي|احسب\s+لي)/i
const SEARCH_RE = /(?:\b(?:search|find|look\s+for|chercher|cherche|cherchez|rechercher|recherche|recherchez|trouver|trouve|trouvez)\b|ابحث|بحث|دور|دوّر|لقالي|اعثر\s+على)/i
const ANALYZE_RE = /(?:\b(?:analyze|analyse|review|inspect|analyser|examiner|étudier|etudier|étudie|etudie)\b|حلل|حلّل|تحليل|افحص)/i
const CONVERT_RE = /(?:\b(?:convert|converti|convertir|convertis|convertissez|transform|transformer|transforme|transformez|changer|changez|turn|7awel)\b|حوّل|حول|تحويل)/i
const UPLOAD_SHARE_RE = /(?:\b(?:upload|share|send|téléverser|televerser|téléverse|televerse|partage|partager|partagez|envoyer|déposer|deposer)\b|ارفع|أرفع|رفع|شارك|أرسل|ارسل)/i
const CAPTURE_RE = /(?:\b(?:capture|capturer|take|get|prendre\s+(?:une\s+)?capture|faire\s+une\s+capture)\b|التقط|خذ|صوّر|صور)/i
const EXTRACT_RE = /(?:\b(?:extract|read|recognize|scan|extraire|extrait|lire|reconna[iî]tre|num[eé]riser)\b|استخرج|استخراج|اقرأ|اقرا|تعرف\s+على|مسح)/i
const EDIT_RE = /(?:\b(?:edit|remove|erase|enhance|upscale|retouch|modify|éditer|editer|supprimer|améliorer|ameliorer|retoucher|modifier)\b|عدّل|عدل|احذف|أزل|ازل|حسّن|حسن|حسّنلي)/i
const IMAGE_CONTEXT_RE = /(?:\b(?:images?|photos?|pictures?|drawings?|illustrations?|artwork|wallpapers?|png|jpe?g|webp|draw|sketch|paint|illustrate|dessine|dessin|dessiner|croquis|illustration|illustrations|photo)\b|صورة|صور|صوره|الصورة|الصوره|صورلي|صوري|رسم\s*لي|ارسم|أرسم|ارسملي|ارسم\s+لي|تصميم\s*صورة)/i
const INFO_QUESTION_RE = /^\s*(?:(?:اشرح|شرح|عرّف|عرف|تعريف)(?:\s|$)|ما\s+(?:هو|هي|معنى|المقصود|الفرق)|ماهو(?:\s|$)|ماهي(?:\s|$)|ماذا(?:\s|$)|من(?:\s|$)|متى(?:\s|$)|أين(?:\s|$)|اين(?:\s|$)|كيف(?:\s|$)|لماذا(?:\s|$)|ليش(?:\s|$)|علاش(?:\s|$)|واش(?:\s|$)|وش(?:\s|$)|هل\s+(?:توجد|يوجد|هناك|يعني|هو|هي)|(?:what\s+(?:is|are|does|do|means?)\b|what'?s\b|how\s+(?:does|do|to|can\s+i|could\s+i)\b|why\b|where\b|who\b|when\b|which\b|explain\b|define\b|do\s+you\s+know\b|can\s+you\s+explain\b|qu['’]?est-ce\b|comment\s+(?:fonctionne|marche|utiliser|créer|creer|faire|calculer|convertir)\b|pourquoi\b|(?:quel|quelle|quels|quelles)(?:\s|$)|où(?:\s|$)|combien(?:\s|$)))/i
const FACT_QUESTION_RE = /^\s*(?:ما\s+(?:هو|هي|معنى|المقصود|الفرق)|ماهو(?:\s|$)|ماهي(?:\s|$)|what\s+(?:is|are|does|do|means?)\b|what'?s\b|qu['’]?est-ce\b|what\s+tools?\b)/i
const WANT_INFO_RE = /(?:\b(?:i\s+want|i\s+need|je\s+veux|je\s+voudrais|je\s+souhaite|j['’]ai\s+besoin)\b|أريد|اريد|بغيت|نحب|حاب|نحتاج).{0,40}(?:\b(?:to\s+know|information|details|learn\s+about|savoir|comprendre|renseignements?)\b|معلومات|شرح|معرفة|نفهم|نعرف)/i

const QR_CREATE_RE = /(?:\b(?:create|generate|make|build|design|créer|crée|créez|creer|cree|générer|génère|générez|generer|genere|faire|fais|faites)\b|أنشئ|انشئ|إنشاء|انشاء|إنشأ|انشأ|اعمل|أعمل|عمل|اصنع|صنع|ولّد|ولد|توليد|دير|ندير|صمّم|صمم)/i
const PLAN_ACTION_RE = /(?:\b(?:plan|organize|planifier|planifie|planifiez|organiser|organise|organisez)\b|خطط|خطّط|نظم|نظّم)/i
const READ_ALOUD_RE = /(?:\b(?:read\s+(?:this\s+)?aloud|speak|voice|lire\s+(?:(?:ce\s+)?texte\s+)?(?:à|a)\s+voix\s+haute|lisez\s+(?:à|a)\s+voix\s+haute|lecture\s+(?:à|a)\s+voix\s+haute)\b|اقرأ|اقرا|انطق|حوّل\s+النص\s+إلى\s+صوت)/i
const ACTIONS = { create: CREATE_OR_DESIGN_RE, want: WANT_RE, open: OPEN_TOOL_RE, calculate: CALCULATE_RE, search: SEARCH_RE, analyze: ANALYZE_RE, convert: CONVERT_RE, uploadShare: UPLOAD_SHARE_RE, capture: CAPTURE_RE, extract: EXTRACT_RE, edit: EDIT_RE, qr: QR_CREATE_RE, plan: PLAN_ACTION_RE, readAloud: READ_ALOUD_RE }

const TOOL_LABELS = {
  image:       { ar: 'أداة الصور الذكية', dz: 'أداة الصور', fr: 'l’outil d’images IA', en: 'AI image tool' },
  cv:          { ar: 'أداة إنشاء السيرة الذاتية', dz: 'أداة السيرة الذاتية', fr: 'l’outil de création de CV', en: 'CV creator' },
  planner:     { ar: 'مخطط المشاريع', dz: 'مخطط المشاريع', fr: 'le planificateur de projets', en: 'project planner' },
  docs:        { ar: 'أداة الوثائق التجارية', dz: 'أداة الوثائق التجارية', fr: 'l’outil de documents professionnels', en: 'business documents tool' },
  jobs:        { ar: 'أداة البحث عن عمل', dz: 'أداة البحث على الخدمة', fr: 'l’outil de recherche d’emploi', en: 'job search tool' },
  health:      { ar: 'أداة الصحة والأطباء', dz: 'أداة الصحة والطب', fr: 'l’outil santé', en: 'health tool' },
  ocr:         { ar: 'قارئ الوثائق OCR', dz: 'قارئ الوثائق OCR', fr: 'le lecteur de documents OCR', en: 'OCR document reader' },
  bizplan:     { ar: 'مولّد خطة العمل', dz: 'مولّد خطة المشروع', fr: 'le générateur de business plan', en: 'business plan generator' },
  invoice:     { ar: 'أداة إنشاء الفواتير', dz: 'أداة الفواتير', fr: 'l’outil de création de factures', en: 'invoice generator' },
  tax:         { ar: 'حاسبة الضرائب', dz: 'حاسبة الضرائب', fr: 'le calculateur d’impôts', en: 'tax calculator' },
  zakat:       { ar: 'حاسبة الزكاة', dz: 'حاسبة الزكاة', fr: 'le calculateur de zakat', en: 'zakat calculator' },
  hashtag:     { ar: 'مولّد الهاشتاغات', dz: 'مولّد الهاشتاغات', fr: 'le générateur de hashtags', en: 'hashtag generator' },
  excel:       { ar: 'محرر جداول Excel', dz: 'محرر جداول Excel', fr: 'le tableur Excel', en: 'Excel spreadsheet editor' },
  pension:     { ar: 'حاسبة التقاعد', dz: 'حاسبة التقاعد', fr: 'le calculateur de retraite', en: 'pension calculator' },
  qrcode:      { ar: 'أداة إنشاء QR Code', dz: 'أداة QR Code', fr: 'le générateur de QR Code', en: 'QR code generator' },
  bizcard:     { ar: 'أداة تصميم بطاقة العمل', dz: 'أداة بطاقة العمل', fr: 'l’outil de création de cartes de visite', en: 'business card creator' },
  dataanalysis:{ ar: 'أداة تحليل البيانات', dz: 'أداة تحليل البيانات', fr: 'l’outil d’analyse de données', en: 'data analysis tool' },
  tts:         { ar: 'أداة تحويل النص إلى صوت', dz: 'أداة تحويل النص لصوت', fr: 'l’outil de synthèse vocale', en: 'text-to-speech tool' },
  screenshot:  { ar: 'أداة تصوير المواقع', dz: 'أداة تصوير المواقع', fr: 'l’outil de capture de sites web', en: 'website screenshot tool' },
  fileupload:  { ar: 'أداة رفع ومشاركة الملفات', dz: 'أداة رفع ومشاركة الملفات', fr: 'l’outil de partage de fichiers', en: 'file sharing tool' },
  convert:     { ar: 'محوّل الصيغ', dz: 'محوّل الصيغ', fr: 'le convertisseur de fichiers', en: 'file converter' },
  flights:     { ar: 'أداة البحث عن الرحلات', dz: 'أداة البحث على الرحلات', fr: 'l’outil de recherche de vols', en: 'flight search tool' },
}

const DARIJA_RE = /(?:كيفاش|واش|نحب|بغيت|حاب|ندير|ديرلي|صايب|وجدلي|تاع|على الخدمة|\b(?:nheb|bghit|hab|ndir|dir|dirli|sawb(?:li)?|wajedli|7seb|7eseb|ta3i?)\b)/i
const FRENCH_RE = /\b(?:je|j['’]ai|vous|mon|ma|mes|le|la|les|un|une|des|avec|pour|crée|créer|génère|générer|cherche|chercher|calcule|calculer|ouvre|ouvrir|outil|facture|emploi|données|vols|extraire|extrait|rédige|rédiger|planifie|faire|fais|convertir|convertis|partage|partager|fichier|devis)\b/i

function detectLanguage(text) {
  if (DARIJA_RE.test(text)) return 'dz'
  if (/[\u0600-\u06ff]/.test(text)) return 'ar'
  if (FRENCH_RE.test(text)) return 'fr'
  return 'en'
}

function isToolAction(actionList, text) {
  return actionList.some(action => ACTIONS[action]?.test(text))
}

const TOOL_SPECS = [
  { id: 'image', toolName: 'Visual AI — صور', toolIcon: '🖼️', toolDesc: 'بحث عن صور • بحث عكسي • تحليل AI • OCR من الصور', target: /(?:\b(?:visual\s+ai|images?\s+tool|picture\s+tool|photo\s+tool|image\s+generator|image\s+search|photo\s+editor|outil\s+(?:d['’]images?|photo)|recherche\s+d['’]images|générateur\s+d['’]images)\b|أداة\s*(?:الصور|الذكاء\s+البصري)|الذكاء\s+البصري|استوديو\s+الصور)/i, actions: ['open', 'search', 'analyze', 'edit', 'want'] },
  { id: 'cv', toolName: 'مولّد السيرة الذاتية', toolIcon: '📄', toolDesc: 'أنشئ سيرة ذاتية احترافية بالعربية أو الفرنسية في ثوانٍ', target: /(?:\bcv\b|\bresume\b|\brésumé(?=$|[^\p{L}\p{N}_])|\bcurriculum\s+vitae\b|السيرة\s+الذاتية|سيرة\s+ذاتية|سي\s*في)/iu, actions: ['create', 'want', 'open'] },
  { id: 'planner', toolName: 'مخطط المشاريع', toolIcon: '📋', toolDesc: 'حوّل فكرتك إلى خطة عمل تفصيلية مع مهام وجدول زمني', target: /(?:project\s+(?:plan|planner)|project\s+planning|plan\s+(?:a\s+)?project|plan\s+(?:de|du)\s+projet|planification\s+(?:d['’]un?\s+)?projet|planifi(?:er|e|ez)\s+(?:un\s+)?projet|خطة\s+(?:مشروع|المشروع)|مخطط\s*(?:المشروع|المشاريع)|\bkhouta\s+projet\b)/i, actions: ['create', 'want', 'plan'] },
  { id: 'docs', toolName: 'وثائق تجارية', toolIcon: '📑', toolDesc: 'عقود عمل • مراسلات • عروض أسعار • محاضر اجتماعات', target: /(?:\b(?:contract|contrat|quotation|quote|devis|business\s+document|business\s+letter|3aqd)\b|عقد(?:\s+(?:عمل|تجاري|إيجار))?|عرض\s+سعر|مراسلة\s+تجارية|وثائق?\s+تجارية)/i, actions: ['create', 'want'] },
  { id: 'jobs', toolName: 'بحث وظيفي', toolIcon: '💼', toolDesc: 'ابحث عن وظيفة في الجزائر واحصل على مساعدة في رسالة التقدم', target: /(?:\b(?:jobs?|employment|job\s+search|work\s+opportunities|emplois?|offre\s+d['’]emploi|recherche\s+d['’]emploi|postes?|work|job|khedma|5edma)\b|وظيف(?:ة|ات)|بحث\s+عن\s+عمل|خدمة|عمل)/i, actions: ['search', 'want', 'open'] },
  { id: 'health', toolName: 'وكيل الصحة', toolIcon: '🏥', toolDesc: 'تحليل الأعراض • البحث عن طبيب • نصائح صحية للجزائر', target: /(?:\b(?:health\s+(?:tool|agent|assistant)|doctor(?:s)?|physician|clinic|medical\s+search|healthcare)\b|\boutil\s+(?:de|du)\s+sant[eé]|\b(?:m[eé]decin|docteur|h[oô]pital|sant[eé])\b|assistant\s+(?:de\s+)?sant[eé]|أداة\s+الصحة|وكيل\s+الصحة|مساعد\s+الصحة|طبيب|أطباء|طبيب(?:ة)?|مستشفى|عيادة|الصحة)/i, actions: ['open', 'search', 'analyze', 'want'] },
  { id: 'ocr', toolName: 'قارئ الوثائق OCR', toolIcon: '📷', toolDesc: 'ارفع صورة واستخرج النص تلقائياً بـ Tesseract', target: /(?:\b(?:ocr(?:\s+(?:tool|reader))?|text\s+recognition|document\s+scanner)\b|\blecteur\s+ocr\b|\b(?:extraire|extraction)\s+(?:le\s+)?texte\b|أداة\s*ocr|قارئ\s+الوثائق|استخراج\s+النص|استخرج\s+النص|قراءة\s+النص\s+من)/i, actions: ['open', 'extract', 'analyze', 'want'] },
  { id: 'bizplan', toolName: 'خطة العمل Business Plan', toolIcon: '📊', toolDesc: 'خطة عمل كاملة لمشروعك في الجزائر مع أرقام حقيقية', target: /(?:\b(?:business\s+plan|plan\s+d['’]affaires|plan\s+d['’]entreprise)\b|\b[ée]tude\s+de\s+(?:faisabilit[eé]|march[eé])\b|خطة\s+عمل|دراسة\s+جدوى)/i, actions: ['create', 'want'] },
  { id: 'invoice', toolName: 'مولّد الفواتير', toolIcon: '🧾', toolDesc: 'فواتير جزائرية احترافية — TVA • HT • TTC — تحميل PDF', target: /(?:\binvoices?\b|\bfactures?\b|فاتور(?:ة|ات))/i, actions: ['create', 'want'] },
  { id: 'tax', toolName: 'مُحاسب الضرائب', toolIcon: '🧮', toolDesc: 'IRG (ضريبة الدخل) • IBS (ضريبة الشركات) — شرائح 2024', target: /(?:\btaxes?\b|\btax\b|\bimp[oô]ts?\b|\bIRG\b|\bIBS\b|ضرائب?|ضريبة)/i, actions: ['calculate', 'open', 'want'] },
  { id: 'zakat', toolName: 'حاسبة الزكاة الشاملة', toolIcon: '☪️', toolDesc: 'زكاة المال · الذهب · الفضة · التجارة · الزروع — بالدينار الجزائري', target: /(?:\bzakat\b|زكاة(?:\s+المال)?)/i, actions: ['calculate', 'open', 'want'] },
  { id: 'hashtag', toolName: 'مولّد الهاشتاغ', toolIcon: '#️⃣', toolDesc: 'هاشتاغات ذكية للجزائر — إنستغرام • تيك توك • X • لينكدإن', target: /(?:\bhashtags?\b|\bmots?[- ]di[eè]ses?\b|هاشتاغات?|هاشتاجات?)/i, actions: ['create', 'want'] },
  { id: 'excel', toolName: 'محرر Excel الذكي', toolIcon: '📊', toolDesc: 'جدول بيانات كامل + 30 دالة + مساعد AI للدوال — استيراد/تصدير XLSX', target: /(?:\bexcel\b|\bxlsx\b|\bspreadsheet\b|\btableur\b|\bfeuille\s+de\s+calcul\b|جدول\s+بيانات|ملف\s+إكسل|ملف\s+اكسل)/i, actions: ['create', 'want', 'open'] },
  { id: 'pension', toolName: 'حاسبة التقاعد CNAS', toolIcon: '🏦', toolDesc: 'احسب اشتراكاتك ومعاشك المتوقع — CNAS موظف · CASNOS مستقل', target: /(?:\bpension\b|\bretirement\b|\bretraite\b|\bCNAS\b|\bCASNOS\b|معاش|تقاعد)/i, actions: ['calculate', 'open', 'want'] },
  { id: 'qrcode', toolName: 'مولّد QR Code', toolIcon: '📲', toolDesc: 'أنشئ QR Code لأي نص أو رابط أو معلومات — تحميل فوري', target: /(?:\bqr(?:[\s-]*code)?\b|\bcode\s*qr\b|كود\s*(?:الـ\s*)?qr|qr\s*كود|رمز\s*(?:(?:الـ\s*)?qr|الاستجابة\s*السريعة))/i, actions: ['create', 'want', 'open', 'qr'], implicit: /\bqr(?:[\s-]*code)?\s*(?:for|of|pour)\b|\bqr\s*ل(?:ـ)?|كود\s*(?:الـ\s*)?qr\s+في\s+(?:جيبي|جيبك|جيبه|جيبها|الجيب)(?=\s|$|[،.!?؟])/i, message: 'لإنشاء رمز QR، استخدم أداة QR Code المخصصة في DZ Tools — إنشاء سريع ومجاني.', quickSuggestions: ['اعمل QR لرابط موقعي', 'QR لرقم هاتفي', 'QR لواتساب'] },
  { id: 'bizcard', toolName: 'بطاقة العمل', toolIcon: '🪪', toolDesc: 'صمّم بطاقة عمل احترافية بالعربية والفرنسية — تصدير PDF', target: /(?:\bbusiness\s+cards?\b|\bcartes?\s+(?:de\s+)?visite\b|بطاقة\s+(?:عمل|أعمال))/i, actions: ['create', 'want'] },
  { id: 'dataanalysis', toolName: 'محلل البيانات', toolIcon: '📈', toolDesc: 'ارفع ملف Excel أو CSV — تحليل ذكي + رسوم بيانية + ملخص AI', target: /(?:\b(?:data|csv|excel)\s*(?:file|data|dataset|sheet)?\b|\bspreadsheet\b|\bdataset\b|\banalyse\s+(?:des?\s+)?donn[eé]es\b|\b(?:fichier\s+(?:csv|de\s+donn[eé]es)|donn[eé]es\s+csv)\b|بيانات|ملف\s+(?:csv|excel|إكسل|اكسل))/i, actions: ['analyze', 'open'] },
  { id: 'tts', toolName: 'تحويل نص إلى صوت', toolIcon: '🔊', toolDesc: 'حوّل أي نص إلى صوت طبيعي بأصوات عربية وفرنسية وإنجليزية — تحميل MP3', target: /(?:\b(?:text\s+to\s+speech|tts|speech\s+audio|voice\s+over|audio|read\s+(?:this\s+)?aloud|synth[eè]se\s+vocale|texte\s+en\s+parole|texte?\s+(?:to|en|l['’])\s*(?:audio|parole|speech)|lire\s+(?:(?:ce\s+)?texte\s+)?(?:à|a)\s+voix\s+haute)\b|تحويل\s+(?:النص|نص)\s+إلى\s+صوت|نص\s+إلى\s+صوت|قراءة\s+بصوت)/i, actions: ['convert', 'create', 'readAloud', 'want'] },
  { id: 'screenshot', toolName: 'تصوير المواقع', toolIcon: '📸', toolDesc: 'التقط صورة كاملة لأي موقع — تنزيل PNG أو PDF — Desktop / Mobile', target: /(?:\b(?:website\s+)?screenshots?\b|\bweb\s+capture\b|\bcapture\s+d['’]écran\b|\bcapture\s+(?:de\s+)?site\s+(?:web|internet)\b|لقطة\s+شاشة|تصوير\s+(?:المواقع|موقع)|أداة\s+تصوير\s+المواقع)/i, actions: ['capture', 'open'] },
  { id: 'fileupload', toolName: 'رفع ومشاركة الملفات', toolIcon: '☁️', toolDesc: 'ارفع أي ملف (صورة · فيديو · PDF · ملف) واحصل على رابط مشاركة آمن — GoFile.io', target: /(?:\b(?:upload|share)\b.{0,40}\b(?:files?|pdf|document)\b|\bfile\s+sharing\b|\b(?:t[eé]l[eé]verser|partage|partager|partagez|envoyer)\b.{0,40}\b(?:fichier|document|pdf)\b|رفع\s+ملف|مشاركة\s+الملفات|شارك\s+ملف|رفع\s+الملفات|مشاركة\s+ملف)/i, actions: ['uploadShare', 'open'] },
  { id: 'convert', toolName: 'محوِّل الصيغ', toolIcon: '🔄', toolDesc: 'حوِّل فيديو · صوت · صور بين جميع الصيغ — مباشرة في المتصفح بـ FFmpeg.wasm', target: /(?:\b(?:file\s+format|format\s+converter|convert\s+(?:a\s+)?file|convert\s+video|convert\s+audio)\b|\b(?:convert|convertir|converti|convertis|convertissez|transformer|transforme|transformez)\b.{0,40}\b(?:file|document|docx|doc|pdf|xlsx|csv|mp4|mp3|wav|avi|mkv|fichier|format|vid[eé]o|audio)\b|تحويل\s+الصيغ|محول\s+الصيغ|صيغة\s+الملف|(?:حوّل|حول|تحويل).{0,30}(?:ملف|pdf|word|docx|mp3|mp4|صيغة))/i, actions: ['convert', 'open', 'want'] },
  { id: 'flights', toolName: 'رحلات الخطوط الجزائرية', toolIcon: '✈️', toolDesc: 'ابحث عن رحلات Air Algérie الداخلية والدولية بالمواعيد وأيام التشغيل', target: /(?:\b(?:flights?|air\s+algerie|air\s+algérie|vols?|billets?\s+d['’]avion)\b|رحلات?|طيران)/i, actions: ['search', 'want', 'open'] },
]

export const TOOL_REDIRECT_TOOL_IDS = Object.freeze(TOOL_SPECS.map(spec => spec.id))

export function getToolRedirectIntent(text, options = {}) {
  const value = typeof text === 'string' ? text.trim() : ''
  if (!value || options.hasImageAttachment || WANT_INFO_RE.test(value) || FACT_QUESTION_RE.test(value)) return null

  const qr = TOOL_SPECS.find(spec => spec.id === 'qrcode')
  const qrRequested = qr && (qr.actions.some(action => ACTIONS[action].test(value)) && qr.target.test(value) || qr.implicit.test(value))
  if (qrRequested && !INFO_QUESTION_RE.test(value)) return toRedirect(qr, detectLanguage(value))

  // OCR has a distinct, working tool on the tools page. Match an explicit
  // extraction/OCR request before the general image-context safeguard.
  const ocr = TOOL_SPECS.find(spec => spec.id === 'ocr')
  if (ocr && isToolAction(ocr.actions, value) && ocr.target.test(value) && !INFO_QUESTION_RE.test(value)) {
    return toRedirect(ocr, detectLanguage(value))
  }

  const imageTool = TOOL_SPECS.find(spec => spec.id === 'image')
  if (imageTool && isToolAction(imageTool.actions, value) && imageTool.target.test(value) && !INFO_QUESTION_RE.test(value)) {
    return toRedirect(imageTool, detectLanguage(value))
  }
  if (IMAGE_CONTEXT_RE.test(value)) return null

  for (const spec of TOOL_SPECS) {
    if (spec.id === 'qrcode' || spec.id === 'ocr' || spec.id === 'image') continue
    if (!isToolAction(spec.actions, value) || !spec.target.test(value)) continue
    // Questions asking for information about a tool stay with the normal
    // assistant. Explicit task verbs ("create", "calculate", "search", etc.)
    // remain actionable even when phrased as "how do I...?".
    const hasTaskAction = spec.actions.some(action =>
      action !== 'open' && ACTIONS[action]?.test(value)
    )
    if (INFO_QUESTION_RE.test(value) && !hasTaskAction) return null
    return toRedirect(spec, detectLanguage(value))
  }
  return null
}

function toRedirect(spec, language = 'ar') {
  const localizedName = TOOL_LABELS[spec.id]?.[language] || TOOL_LABELS[spec.id]?.en || spec.toolName
  const buttonLabel = spec.id === 'qrcode' && (language === 'ar' || language === 'dz')
    ? 'فتح الأداة ←'
    : ({
    ar: `افتح ${localizedName}`,
    dz: `حلّ ${localizedName}`,
    fr: `Ouvrir ${localizedName}`,
    en: `Open ${localizedName}`,
  })[language]
  const message = spec.id === 'qrcode' && language === 'ar'
    ? spec.message
    : ({
      ar: `يمكنك استخدام ${localizedName} في DZ Agent.`,
      dz: `تقدر تستعمل ${localizedName} في DZ Agent.`,
      fr: `Vous pouvez utiliser ${localizedName} dans DZ Agent.`,
      en: `You can use DZ Agent’s ${localizedName}.`,
    })[language]
  return {
    id: spec.id,
    toolName: spec.id === 'qrcode' && (language === 'ar' || language === 'dz') ? spec.toolName : localizedName,
    toolUrl: '/tools?tool=' + encodeURIComponent(spec.id),
    toolIcon: spec.toolIcon,
    toolDesc: language === 'ar' || language === 'dz'
      ? spec.toolDesc
      : language === 'fr'
        ? 'Disponible directement dans DZ Agent.'
        : 'Available directly in DZ Agent.',
    message,
    buttonLabel,
    ...(spec.quickSuggestions ? { quickSuggestions: spec.quickSuggestions } : {}),
  }
}