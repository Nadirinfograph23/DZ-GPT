/**
 * lib/dz-skills/skills.js
 * تعريف المهارات الموضوعاتية — triggers بدون \b (لا يعمل مع Unicode/عربي)
 */

export const SKILLS = [

  // ── 1. البرمجة والتطوير ──────────────────────────────────────────────────
  {
    id: 'programming',
    name: 'Programming',
    nameAr: 'مهارة البرمجة والتطوير',
    description: 'كتابة كود، تشخيص أخطاء، تطوير تطبيقات، API، قواعد بيانات',
    priority: 90,
    enabled: true,
    triggers: [
      /python|javascript|typescript|react|node\.js|nodejs|vue|angular|django|flask|fastapi|express/i,
      /api|sql|mysql|postgresql|mongodb|database|قاعدة بيانات|html|css|dockerfile|bash|shell/i,
      /bug|error|exception|خطأ|undefined|null pointer|syntax error|compile|debug|تصحيح/i,
      /npm|pip|yarn|cargo|maven|gradle|git\s|github|import\s|export\s|module|package/i,
      /backend|frontend|fullstack|server|endpoint|deployment|برمجة|كود|script/i,
      /(اكتب|أنشئ|ابني|صمم|حل|اصلح|write|create|build|fix).{0,30}(كود|code|تطبيق|app|موقع|script|function|api|bot|class)/i,
    ],
    aiHint: 'technical',
    systemPromptSnippet: '🖥️ SKILL:PROGRAMMING — أنت خبير برمجة. أعطِ كوداً كاملاً قابلاً للتشغيل. استخدم code blocks. اشرح الكود بإيجاز بعد كتابته.',
    tools: ['code_execute', 'web_search'],
    examples: [
      'أنشئ API بـ Python Flask مع قاعدة بيانات SQLite',
      'عندي bug في JavaScript: Cannot read properties of undefined',
      'اكتب script يحوّل ملف CSV لـ JSON',
    ],
  },

  // ── 2. الترجمة (قبل البحث — أولوية أعلى) ────────────────────────────────
  {
    id: 'translation',
    name: 'Translation',
    nameAr: 'مهارة الترجمة',
    description: 'ترجمة بين العربية والفرنسية والإنجليزية والدارجة',
    priority: 85,
    enabled: true,
    triggers: [
      /ترجم|translate|traduction|traduire|translation/i,
      /كيف (أقول|تقول|نقول).{0,30}(بالعربية|بالفرنسية|بالإنجليزية|بالدارجة|in english|in arabic|en français|en arabe)/i,
      /بالعربية|بالفرنسية|بالإنجليزية|بالدارجة|en arabe|en français|in english|in arabic/i,
    ],
    aiHint: 'multilingual',
    systemPromptSnippet: '🌐 SKILL:TRANSLATION — أعطِ الترجمة مباشرةً. إذا كانت الدارجة الجزائرية مطلوبة، استخدم تعابير دارجة حقيقية.',
    tools: [],
    examples: [
      'ترجم هذه الجملة للفرنسية: أريد العمل في مجال الذكاء الاصطناعي',
      'كيف أقول "Je suis fatigué" بالدارجة الجزائرية؟',
    ],
  },

  // ── 3. الصحة والطب ───────────────────────────────────────────────────────
  {
    id: 'medical',
    name: 'Medical',
    nameAr: 'مهارة الصحة والطب',
    description: 'أعراض، أمراض، أدوية، نصائح طبية',
    priority: 95,
    enabled: true,
    triggers: [
      /طبيب|دكتور|doctor|أعراض|symptom|مرض|disease|دواء|medicine|medication|علاج|treatment/i,
      /ألم|pain|وجع|health|مستشفى|hospital|صيدلية|pharmacy|عملية|operation/i,
      /سكري|diabetes|ضغط الدم|قلب|heart|سرطان|cancer|كورونا|covid|إنفلونزا|flu/i,
      /صداع|headache|حمى|fever|زكام|cold|كحة|cough|تعب|fatigue|دوخة|dizziness/i,
      /يخزني|يوجعني|تعبان|عيان|مريض|راني.{0,15}(تعبان|عيان|مريض)|عندي.{0,20}(ألم|وجع)/i,
      /جرعة|dose|paracetamol|ibuprofen|amoxicillin|doliprane|aspirin/i,
      /صحة.{0,5}(جيدة|سيئة|مشكلة|المريض|العامة)|الصحة العمومية|وزارة الصحة/i,
    ],
    aiHint: 'reasoning',
    systemPromptSnippet: '🏥 SKILL:MEDICAL — أجب بشكل علمي ومفهوم. أضف دائماً "استشر طبيباً" للحالات الجدية. لا تشخّص أمراضاً بشكل قاطع.',
    tools: ['web_search', 'medical_kb'],
    examples: [
      'ما الفرق بين أعراض الزكام والإنفلونزا؟',
      'ما جرعة Paracetamol للبالغين؟',
      'عندي ألم في صدري منذ البارح، واش ندير؟',
    ],
  },

  // ── 4. البحث والمعلومات ──────────────────────────────────────────────────
  {
    id: 'research',
    name: 'Research',
    nameAr: 'مهارة البحث والمعلومات',
    description: 'بحث على الويب، أسئلة معلوماتية، أخبار، تاريخ',
    priority: 70,
    enabled: true,
    triggers: [
      /ابحث|بحث عن|search for|find information|recherche/i,
      /من هو|من هي|ما هو|ما هي|ما هو|what is|who is|where is|أين|when was|متى/i,
      /أخبار|news|آخر أخبار|latest news|أحدث|جديد في/i,
      /تاريخ|history|متى تأسس|متى ولد|متى توفي|when did|when was born/i,
      /كم عدد|كم تبلغ|how many|how much|ما عدد|ما حجم|ما مساحة/i,
      /الرئيس|الحكومة|عاصمة|capital|رئيس وزراء|president|premier ministre/i,
    ],
    aiHint: 'retrieval',
    systemPromptSnippet: '🔍 SKILL:RESEARCH — استخدم البحث على الويب للمعلومات الحديثة. اذكر المصدر. لا تخمّن تواريخ أو إحصائيات.',
    tools: ['web_search', 'wikipedia'],
    examples: [
      'من هو الرئيس الحالي للولايات المتحدة؟',
      'ما هي آخر أخبار الجزائر اليوم؟',
      'متى تأسست جامعة الجزائر؟',
    ],
  },

  // ── 5. الكتابة الإبداعية ─────────────────────────────────────────────────
  {
    id: 'writing',
    name: 'Writing',
    nameAr: 'مهارة الكتابة والمحتوى',
    description: 'مقالات، رسائل، قصائد، خطابات، ملخصات',
    priority: 65,
    enabled: true,
    triggers: [
      /اكتب.{0,20}(رسالة|مقال|قصة|قصيدة|خطاب|تقرير|ملخص|essay|letter|article|story|poem|speech|report)/i,
      /write.{0,20}(letter|article|essay|story|poem|speech|report|email|message)/i,
      /سيرة ذاتية|cv|resume|portfolio|cover letter|motivation letter/i,
      /منشور|post|caption|تغريدة|tweet|إعلان|ad|محتوى سوشيال|content/i,
      /لخّص|ملخص|summarize|summary|اختصر|شرح|اشرح/i,
    ],
    aiHint: 'multilingual',
    systemPromptSnippet: '✍️ SKILL:WRITING — أنت كاتب محترف. التزم بالأسلوب المطلوب. أعطِ النص جاهزاً بدون مقدمات زائدة.',
    tools: [],
    examples: [
      'اكتب رسالة تقديم وظيفة',
      'اكتبلي منشور لإنستغرام عن رمضان',
    ],
  },

  // ── 6. تحليل البيانات ────────────────────────────────────────────────────
  {
    id: 'data_analysis',
    name: 'Data Analysis',
    nameAr: 'مهارة تحليل البيانات',
    description: 'جداول، إحصائيات، رسوم بيانية، تحليل CSV',
    priority: 92,
    enabled: true,
    triggers: [
      /ارسم.{0,20}(chart|graph|plot|بياني|diagram)|draw.{0,20}(chart|graph|plot)/i,
      /حلّل|تحليل|analyze|analyse|data analysis|statistical analysis/i,
      /إحصاء|statistics|متوسط|average|mean|median|انحراف معياري|standard deviation/i,
      /رسم بياني|visualization|dashboard|dataset|excel|spreadsheet/i,
      /histogram|scatter|bar chart|pie chart|line chart|heatmap/i,
      /مجموع|sum|أقصى|maximum|أدنى|minimum|correlation|regression/i,
    ],
    aiHint: 'technical',
    systemPromptSnippet: '📊 SKILL:DATA_ANALYSIS — قدّم الجداول بـ Markdown. إذا طلب رسماً بيانياً، اقترح كود Python/JS. اشرح النتائج ببساطة.',
    tools: ['code_execute'],
    examples: [
      'حلّل هذا الجدول وأعطني المتوسط والانحراف المعياري',
      'ارسم chart بـ Python لهذه البيانات',
    ],
  },

  // ── 7. الإبداع والوسائط ──────────────────────────────────────────────────
  {
    id: 'creative',
    name: 'Creative Media',
    nameAr: 'مهارة الإبداع والوسائط',
    description: 'توليد صور، فيديو، تصميم، محتوى إبداعي',
    priority: 75,
    enabled: true,
    triggers: [
      /ولّد صورة|generate image|create image|draw me|ارسم لي|imagine a|dall-e|midjourney/i,
      /stable diffusion|ai image|صورة بالذكاء|توليد صورة|إنشاء صورة/i,
      /logo|شعار|poster|بوستر|banner|بانر|thumbnail|تصميم|design.*visual/i,
      /فيديو.{0,20}(أنشئ|اصنع|ولّد)|generate video|create video|text to video/i,
    ],
    aiHint: 'technical',
    systemPromptSnippet: '🎨 SKILL:CREATIVE — صِف الصورة بدقة (أسلوب، ألوان، محتوى). إذا طلب فيديو، وضّح الخيارات المتاحة.',
    tools: ['image_generate', 'image_search'],
    examples: [
      'ولّد صورة جبال الأطلس عند الغروب',
      'صمم لوغو لمطعم جزائري',
    ],
  },

  // ── 8. الإنتاجية والتنظيم ────────────────────────────────────────────────
  {
    id: 'productivity',
    name: 'Productivity',
    nameAr: 'مهارة الإنتاجية والتنظيم',
    description: 'خطط، جداول، قوائم مهام، تنظيم وقت',
    priority: 60,
    enabled: true,
    triggers: [
      /خطة.{0,20}(أسبوعية|يومية|شهرية|عمل|مذاكرة|دراسة|رياضة)/i,
      /نظملي|رتبلي|ضعلي.{0,10}(خطة|جدول|برنامج)|ساعدني.{0,20}(أنظم|أرتب|أخطط)/i,
      /make a plan|create a schedule|organize my|time management|productivity tips/i,
      /to.?do list|task list|قائمة مهام|جدول أعمال|برنامج يومي|daily routine/i,
      /كيف أنظم|كيف أرتب|كيف أستغل وقتي|how to organize|how to manage time/i,
    ],
    aiHint: 'reasoning',
    systemPromptSnippet: '📅 SKILL:PRODUCTIVITY — قدّم الخطط كجداول Markdown أو قوائم مرقّمة. كن عملياً وقابلاً للتطبيق.',
    tools: [],
    examples: [
      'نظملي خطة أسبوعية للمذاكرة',
      'ضعلي جدول رياضة للمبتدئين',
      'كيف أنظم وقتي كطالب جامعي؟',
    ],
  },

  // ── 9. الدارجة الجزائرية (أولوية منخفضة — يلتقط ما تبقى) ──────────────
  {
    id: 'darija',
    name: 'Darija DZ',
    nameAr: 'مهارة الدارجة الجزائرية',
    description: 'محادثة بالدارجة، تعابير يومية، ثقافة جزائرية',
    priority: 40,
    enabled: true,
    triggers: [
      /واش راك|واش ديرك|كيداير|كيراك|لاباس|ماشي بأس|كيفاش|علاش|وين راك/i,
      /ياسر|بزاف|شوية|برك|هكاك|مليح|بهي|وايلو|ماعندكش|عندك|راني|راك/i,
      /يعطيك الصحة|يعطيك العافية|تحيا الجزائر|ربي يستر|بارك الله فيك|الله يعطيك/i,
      /خويا|عمي|حبيبي|صاحبي|ولد الحومة|بنت الحومة|شنو|شبك|علاش|وقتاش/i,
      /dzair|قسنطينة|وهران|عنابة|تيزي وزو|سطيف|تلمسان|بجاية|بليدة|مستغانم/i,
      /نروح|نجي|ندير|نشري|نكل|ناكل|نشرب|نحب|حب|كرهت|بغيت|ما بغيتش/i,
    ],
    aiHint: 'multilingual',
    systemPromptSnippet: '🇩🇿 SKILL:DARIJA — رد بالدارجة الجزائرية الحقيقية. استخدم تعابير يومية جزائرية. كن ودوداً وخفيف الظل.',
    tools: [],
    examples: [
      'واش راك؟',
      'كيفاش نروح من الجزائر لوهران؟',
      'يعطيك الصحة خويا',
    ],
  },
]
