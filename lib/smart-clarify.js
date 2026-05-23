// DZ Agent — Smart Intent Clarification System v1.0
// ════════════════════════════════════════════════════════════════════
// GOLDEN RULE: Only ask for clarification when GENUINELY ambiguous.
// NEVER over-ask. If intent is 90%+ clear → execute directly.
// ════════════════════════════════════════════════════════════════════

// ── Patterns that are ALWAYS clear → NEVER intercept ─────────────────
const ALWAYS_CLEAR = [
  // YouTube / Video search — NEVER ask for clarification, route directly
  /فيديو|فيديوهات|يوتيوب|يوتيب|بالفيديو|كليب|كليبات|اغنية|أغنية|أغاني|اغاني|موسيقى|نشيد|أنشودة|مقطع/i,
  /youtube|tutorial|video\s*clip|music\s*video|song\s+by/i,
  // News / current events
  /أخبار|خبر|عاجل|مستجدات|نشرة/i,
  /news|breaking|latest|headlines/i,
  // Exchange rates / prices
  /سعر الدولار|سعر اليورو|سعر الصرف|صرف العملة/i,
  /dollar.*price|euro.*rate|exchange rate/i,
  // Explain / describe
  /اشرح|فسّر|ما هو|ما هي|كيف يعمل|لماذا|ما معنى|عرّف/i,
  /explain|what is|what are|how does|why is|tell me about|define/i,
  /explique|qu'est-ce que|comment fonctionne/i,
  // Identity questions
  /من هو|من هي|who is/i,
  // Weather
  /الطقس|طقس|weather|météo/i,
  // Image search (not build)
  /ابحث عن صور|بحث عن صور|image search|صور عن|صور من/i,
  // Translate / summarize
  /ترجم|ترجمة|translation|translate|لخّص|summarize|summary/i,
  // Medical / health (conversation only)
  /أعراض|وجع|ألم|حمى|مرض|دواء|علاج|تشخيص|طبيب|دكتور|صحة/i,
  /symptoms|pain|fever|medication|doctor|hospital/i,
  // Jobs / employment
  /وظيفة|وظائف|توظيف|راتب|سوق العمل/i,
  /\bjob\b|\bjobs\b|emploi|salaire/i,
  // Religion / culture / history
  /قرآن|حديث|إسلام|فقه|سيرة|دين|تاريخ/i,
  // Greetings / small talk
  /مرحبا|أهلاً|شكراً|شكرا|صباح|مساء|كيف حالك|وين|كيفاش/i,
  /hello|hi\b|thanks|bonjour|merci|bonsoir/i,
  // Quran / AI Quran tool
  /سورة|آية|جزء|ربع|قرآن/i,
  // Already contains a URL — has enough context
]

// ── Ambiguous request categories ──────────────────────────────────────
const AMBIGUOUS_CASES = [
  // ── 1. Build website — type unclear ──────────────────────────────────
  {
    id: 'build_website_vague',
    minConfidence: 0,
    maxConfidence: 55,
    patterns: [
      /^(أنشئ|انشئ|ابني|اعمل|صمم|ولّد|ولد)\s+(كود\s+)?(موقع|ويب|web|site)\s*$/i,
      /^(create|make|build|generate)\s+(a\s+)?(website|web\s*app|site)\s*$/i,
      /^انشئ\s+موقع\s*$/i,
      /^صمم\s+موقع\s*$/i,
      /^اعمل\s+موقع\s*$/i,
    ],
    question: 'ما نوع الموقع الذي تريده؟',
    options: [
      { n: 1, emoji: '🌐', label: 'صفحة HTML/CSS بسيطة' },
      { n: 2, emoji: '⚛️', label: 'مشروع React / Next.js' },
      { n: 3, emoji: '🚀', label: 'مشروع كامل على GitHub' },
      { n: 4, emoji: '🎨', label: 'صفحة هبوط Landing Page' },
      { n: 5, emoji: '🛒', label: 'متجر إلكتروني E-commerce' },
      { n: 6, emoji: '📱', label: 'تطبيق ويب Full Stack' },
    ],
  },

  // ── 2. Build app — type unclear ───────────────────────────────────────
  {
    id: 'build_app_vague',
    minConfidence: 0,
    maxConfidence: 45,
    patterns: [
      /^(أنشئ|انشئ|اعمل|ابني|صمم)\s+(تطبيق|app)\s*$/i,
      /^(أريد|ابغى|بغيت|نحب)\s+(تطبيق|app)\s*$/i,
      /^(make|create|build)\s+(an?\s+)?(app|application)\s*$/i,
    ],
    question: 'ما نوع التطبيق الذي تقصده؟',
    options: [
      { n: 1, emoji: '🤖', label: 'تطبيق Android' },
      { n: 2, emoji: '🍎', label: 'تطبيق iOS' },
      { n: 3, emoji: '🌐', label: 'تطبيق ويب Web App' },
      { n: 4, emoji: '💻', label: 'تطبيق سطح المكتب Desktop' },
      { n: 5, emoji: '📱', label: 'Flutter أو React Native' },
    ],
  },

  // ── 3. "موقع مطعم/محل" — website OR map location ──────────────────────
  {
    id: 'location_or_website',
    minConfidence: 0,
    maxConfidence: 50,
    patterns: [
      /^موقع\s+(مطعم|محل|متجر|فندق|مقهى|كافيه|دكان|بوتيك|صيدلية)(\s+في\s+\w+)?\s*$/i,
      /^(دور|ابحث)\s+على\s+(مطعم|محل|فندق|صيدلية)(\s+في\s+\w+)?\s*$/i,
    ],
    question: 'هل تقصد:',
    options: [
      { n: 1, emoji: '🌐', label: 'موقع ويب لهذا النشاط' },
      { n: 2, emoji: '📍', label: 'العنوان والموقع على الخريطة' },
      { n: 3, emoji: '⭐', label: 'أفضل الخيارات في المنطقة' },
      { n: 4, emoji: '🛠️', label: 'تصميم موقع إلكتروني له' },
    ],
  },

  // ── 4. "ارفع" / "deploy" without clear target ─────────────────────────
  {
    id: 'deploy_vague',
    minConfidence: 0,
    maxConfidence: 40,
    patterns: [
      /^(ارفع|انشر|deploy|publish)\s*(الموقع|المشروع|الكود|الملفات)?\s*$/i,
      /^(نشر|ارفع)\s+على\s+الإنترنت\s*$/i,
    ],
    question: 'أين تريد النشر؟',
    options: [
      { n: 1, emoji: '🐙', label: 'GitHub Repository' },
      { n: 2, emoji: '▲',  label: 'Vercel' },
      { n: 3, emoji: '📄', label: 'GitHub Pages (مجاناً)' },
      { n: 4, emoji: '🔥', label: 'Firebase / Netlify' },
    ],
  },

  // ── 5. "اكتب كود" alone — language/purpose unclear ─────────────────────
  {
    id: 'code_vague',
    minConfidence: 0,
    maxConfidence: 40,
    patterns: [
      /^(اكتب|اعمل|انشئ|ولّد|ولد)\s+كود\s*$/i,
      /^(write|create|generate)\s+(some\s+)?code\s*$/i,
    ],
    question: 'ما نوع الكود المطلوب؟',
    options: [
      { n: 1, emoji: '⚛️', label: 'JavaScript / React' },
      { n: 2, emoji: '🐍', label: 'Python' },
      { n: 3, emoji: '🎨', label: 'HTML / CSS' },
      { n: 4, emoji: '🗄️', label: 'SQL / قاعدة بيانات' },
      { n: 5, emoji: '🔧', label: 'API / Backend Node.js' },
    ],
  },

  // ── 6. "حلل الملف / الوثيقة" — analysis type unclear ──────────────────
  {
    id: 'analyze_doc_vague',
    minConfidence: 0,
    maxConfidence: 45,
    patterns: [
      /^(حلل|حلّل|تحليل)\s+(الملف|هذا الملف|الوثيقة|هذه الوثيقة|المستند)\s*$/i,
      /^(analyze|analyse)\s+(this\s+)?(file|document)\s*$/i,
    ],
    question: 'ما نوع التحليل المطلوب؟',
    options: [
      { n: 1, emoji: '⚖️', label: 'تحليل قانوني' },
      { n: 2, emoji: '💰', label: 'تحليل مالي ومحاسبي' },
      { n: 3, emoji: '🔧', label: 'تحليل تقني' },
      { n: 4, emoji: '📝', label: 'استخراج نص OCR' },
      { n: 5, emoji: '📋', label: 'تلخيص المحتوى' },
    ],
  },

  // ── 7. Open / go to GitHub — purpose unclear ──────────────────────────
  {
    id: 'github_vague',
    minConfidence: 0,
    maxConfidence: 35,
    patterns: [
      /^(افتح|اذهب إلى|اذهب الى|فتح)\s+(إلى\s+)?github\s*$/i,
      /^(open|go to)\s+github\s*$/i,
    ],
    question: 'ماذا تريد على GitHub؟',
    options: [
      { n: 1, emoji: '📁', label: 'أنشئ مستودع جديد' },
      { n: 2, emoji: '📤', label: 'ارفع ملفات لمستودع' },
      { n: 3, emoji: '🌐', label: 'انشر على GitHub Pages' },
      { n: 4, emoji: '🔍', label: 'ابحث عن مستودع' },
      { n: 5, emoji: '📝', label: 'عدّل ملفاً في مستودع' },
    ],
  },

  // ── 8. "أريد AI" — very vague ────────────────────────────────────────
  {
    id: 'ai_vague',
    minConfidence: 0,
    maxConfidence: 30,
    patterns: [
      /^(أريد|ابغى|بغيت|نحب)\s+(ai|ذكاء اصطناعي|نموذج)\s*$/i,
      /^(اعمل|انشئ)\s+(ai|نموذج ذكاء|chatbot)\s*$/i,
    ],
    question: 'ماذا تريد بخصوص الذكاء الاصطناعي؟',
    options: [
      { n: 1, emoji: '💬', label: 'Chatbot / مساعد محادثة' },
      { n: 2, emoji: '🖼️', label: 'توليد الصور AI Image' },
      { n: 3, emoji: '📝', label: 'توليد النصوص والمحتوى' },
      { n: 4, emoji: '🔍', label: 'تحليل البيانات بالذكاء الاصطناعي' },
      { n: 5, emoji: '🤖', label: 'وكيل AI Agent ذاتي' },
    ],
  },

  // ── 9. "اشرح / حلل" + word that could be code OR concept ──────────────
  {
    id: 'explain_or_implement',
    minConfidence: 0,
    maxConfidence: 50,
    patterns: [
      /^(اشرح|حلّل)\s+(api|authentication|oauth|jwt|websocket|graphql|rest)\s*$/i,
      /^(explain|analyze)\s+(api|authentication|oauth|jwt|websocket|graphql|rest)\s*$/i,
    ],
    question: 'هل تريد:',
    options: [
      { n: 1, emoji: '📚', label: 'شرح المفهوم (نظري)' },
      { n: 2, emoji: '💻', label: 'كود تطبيقي (عملي)' },
      { n: 3, emoji: '🔬', label: 'شرح + كود معاً' },
    ],
  },
]

// ── Helpers ────────────────────────────────────────────────────────────
function containsUrl(text) {
  return /https?:\/\/[^\s]+/.test(text)
}

// ── Main detection function ────────────────────────────────────────────
/**
 * Detect if a message is ambiguous and needs clarification.
 * Returns { needsClarification, caseId, question, options } or { needsClarification: false }
 */
export function detectAmbiguity(message) {
  const msg = String(message || '').trim()

  // Too short or empty
  if (!msg || msg.length < 3) return { needsClarification: false }

  // Contains URL — has enough context, skip
  if (containsUrl(msg)) return { needsClarification: false }

  // Very long message (>100 chars) likely has enough context already
  if (msg.length > 100) return { needsClarification: false }

  // Check if this is always-clear — skip ambiguity check
  const isAlwaysClear = ALWAYS_CLEAR.some(p => p.test(msg))
  if (isAlwaysClear) return { needsClarification: false }

  // Check each ambiguous case
  for (const cas of AMBIGUOUS_CASES) {
    const matched = cas.patterns.some(p => p.test(msg))
    if (matched) {
      return {
        needsClarification: true,
        caseId: cas.id,
        question: cas.question,
        options: cas.options,
        confidence: cas.maxConfidence,
      }
    }
  }

  return { needsClarification: false }
}

// ── Format a clarification response (Markdown) ────────────────────────
export function formatClarification(question, options) {
  const lines = [
    `🤔 **${question}**\n`,
    ...options.map(o => `**${o.n}.** ${o.emoji} ${o.label}`),
    '',
    '> اختر رقماً أو اكتب ما تريده بمزيد من التفاصيل.',
  ]
  return lines.join('\n')
}
