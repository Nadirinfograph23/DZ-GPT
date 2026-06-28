/**
 * Multi-Intent Question Understanding Engine v1.2
 * ════════════════════════════════════════════════
 * يحلل الرسائل المعقدة ويكتشف الأسئلة والمهام المتعددة
 * قبل توليد الإجابة — يعمل كـ Middleware قبل LLM الرئيسي
 *
 * الأنواع المدعومة:
 *   SINGLE       — سؤال واحد
 *   MULTI        — عدة أسئلة مستقلة
 *   SEQUENTIAL   — خطوات متسلسلة
 *   COMPARISON   — مقارنة بين عناصر
 *   RESEARCH     — بحث شامل متعدد الجوانب
 *   CREATIVE     — إنشاء محتوى متعدد المراحل
 *   LIST_TASK    — قائمة مهام/طلبات
 */

// ═══════════════════════════════════════════════════════════════
// SECTION 1 — INTENT TYPE CONSTANTS
// ═══════════════════════════════════════════════════════════════

export const INTENT_TYPE = {
  SINGLE:     'SINGLE',
  MULTI:      'MULTI',
  SEQUENTIAL: 'SEQUENTIAL',
  COMPARISON: 'COMPARISON',
  RESEARCH:   'RESEARCH',
  CREATIVE:   'CREATIVE',
  LIST_TASK:  'LIST_TASK',
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2 — REGEX PATTERNS
// ═══════════════════════════════════════════════════════════════

// كلمات المقارنة (بدون g لأن .test() يُعاد استخدامه)
const COMPARISON_KW_RE = /(?:قارن|مقارن(?:ة)?|الفرق بين|ما الفرق|compare|comparison|vs\.?\s|versus|comparer|comparaison|comparar)/i

// كلمات البحث الشامل + "معلومات عن:" مع bullet points
const RESEARCH_KW_RE = /(?:ابحث عن|بحث شامل|دراسة|تحليل|تفصيل|research|analyze|analyse|étude approfondie|في تفصيل|بالتفصيل|بشكل مفصل|معلومات عن)/i

// كلمات الترتيب التسلسلي (step N:, ثم, ensuite...)
// \b word boundaries prevent matching inside longer words (e.g. "Depuis" contains "puis")
// premièrement/deuxièmement NOT included here — they're handled as ordinal LIST_TASK, not sequential
const SEQUENTIAL_INLINE_KW_RE = /(?:ثم\s|بعد ذلك|بعدها|\bthen\s|\bnext\s|\bensuite\b|\bpuis\b|\benfin\b|d'abord\b)/i

// عبارات "أجب بالترتيب" أو "الأسئلة التالية"
const ORDERED_INSTRUCTIONS_RE = /(?:أجب\s+(?:على|عن|بالترتيب)|جاوب\s+(?:على|عن)|اجب\s+(?:على|عن)|répondre\s+à|answer\s+(?:the\s+following|these)|الأسئلة\s+التالية|الأسئلة\s+الآتية)/i

// pattern لـ "step 1: step 2: step 3:" (English, Arabic)
const STEP_NUMBER_INLINE_RE = /(?:step\s*\d+\s*:|خطوة\s*\d+\s*:|مرحلة\s*\d+\s*:)/i

// ═══════════════════════════════════════════════════════════════
// SECTION 3 — HELPER: SPLIT BY ARABIC/LATIN "AND"
// ═══════════════════════════════════════════════════════════════

/**
 * يقسّم نصاً بـ "و" (عربي) أو "," أو "،" أو "/"
 * يدعم "iPhone وSamsung" (بدون مسافة بعد و) و"Paris Londres et Berlin"
 */
function splitByAnd(segment) {
  return segment
    // أضف مسافة قبل كل "وX" حيث X حرف مباشرة (بدون مسافة بعد و)
    .replace(/\sو(?=\S)/gu, ' و ')
    // قسّم على: "و" عربي, "et" فرنسي, "and" إنجليزي, "," , "،" , "/"
    .split(/\s+(?:و|et|and)\s+|[,،\/]\s*/gu)
    .map(s => s.trim())
    .filter(s => s.length >= 2)
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4 — TASK EXTRACTION: NUMBERED LIST
// ═══════════════════════════════════════════════════════════════

/**
 * يستخرج المهام المرقّمة بأشكال متعددة:
 * - "1- " "1. " "1) " "١- " "1: "
 * - "أولاً:" "ثانياً:" "premier:" "deuxième:"
 * - "أ-" "ب-" (حروف عربية)
 * - "step 1:" "خطوة 1:"
 */
function extractNumberedTasks(msg) {
  const tasks = []
  const seen = new Set()

  // Pattern A: أرقام (لاتينية أو هندية/عربية) مع فاصل (\. \- \) : ،)
  // يدعم: "1-" "1." "1)" "1:" "١-" "1،" + نص بعدها
  // يُستخرج كل شيء حتى رقم جديد أو نهاية السطر
  const numericRe = /(?:^|\n)\s*(?:[٠١٢٣٤٥٦٧٨٩\d]+\s*[-.)،,:]\s*)+([^\n]{3,})/gmu
  let m
  while ((m = numericRe.exec(msg)) !== null) {
    const t = m[1].trim().replace(/^\s*[-.)،,]\s*/, '')
    if (t.length >= 3 && !seen.has(t)) { seen.add(t); tasks.push(t) }
  }

  // Pattern B: أرقام متتالية في سطر واحد مفصولة بـ "2-" بلا سطر جديد
  // مثال: "1- من هو A 2- من هو B 3- من هو C"
  if (tasks.length < 2) {
    const inlineNumRe = /(?:^|\s)(?:[٠١٢٣٤٥٦٧٨٩\d]+\s*[-.)،:]\s*)([^٠١٢٣٤٥٦٧٨٩\d.)،]{3,}?)(?=\s*[٠١٢٣٤٥٦٧٨٩\d]+\s*[-.)،:]|$)/gmu
    while ((m = inlineNumRe.exec(msg)) !== null) {
      const t = m[1].trim()
      if (t.length >= 3 && !seen.has(t)) { seen.add(t); tasks.push(t) }
    }
  }

  // Pattern C: عبارات أولاً/ثانياً/ثالثاً... وkeywords ordinal
  const ordinalAr = /(?:^|\n)\s*(?:أولا[ًً]?|ثانيا[ًً]?|ثالثا[ًً]?|رابعا[ًً]?|خامسا[ًً]?|أول|ثاني|ثالث|رابع|خامس)\s*[:\-–]\s*(.{3,})/gimu
  while ((m = ordinalAr.exec(msg)) !== null) {
    const t = m[1].trim()
    if (t.length >= 3 && !seen.has(t)) { seen.add(t); tasks.push(t) }
  }

  // Pattern D: "premier:" "deuxième:" "troisième:" (French)
  // Note: "premièrement" has è not e — regex must account for both
  // Non-greedy capture (.+?) stops at next ordinal keyword or end of input
  const ordinalFr = /(?:^|\n|\.\s*|\?\s*)(?:premi[eè]r(?:ement)?|deuxi[eè]me(?:ment)?|troisi[eè]me(?:ment)?|quatri[eè]me(?:ment)?|cinqui[eè]me(?:ment)?)\s*[:\-–]\s*(.+?)(?=\s*(?:\.\s*|\?\s*)(?:premi[eè]r|deuxi[eè]me|troisi[eè]me|quatri[eè]me|cinqui[eè]me)|$)/gimu
  while ((m = ordinalFr.exec(msg)) !== null) {
    const t = m[1].trim()
    if (t.length >= 3 && !seen.has(t)) { seen.add(t); tasks.push(t) }
  }

  // Pattern E: حروف عربية أ- ب- ج-
  const arabicLetterRe = /(?:^|\n)\s*[أ-ي]\s*[-.)،:]\s*(.{3,})/gmu
  while ((m = arabicLetterRe.exec(msg)) !== null) {
    const t = m[1].trim()
    if (t.length >= 3 && !seen.has(t)) { seen.add(t); tasks.push(t) }
  }

  // Pattern F: "step 1: ... step 2: ..." inline
  if (tasks.length < 2 && STEP_NUMBER_INLINE_RE.test(msg)) {
    const stepRe = /(?:step\s*\d+\s*:|خطوة\s*\d+\s*:|مرحلة\s*\d+\s*:)\s*([^,،\n]{3,}?)(?=\s*(?:step\s*\d+|خطوة\s*\d+|مرحلة\s*\d+)\s*:|$)/giu
    while ((m = stepRe.exec(msg)) !== null) {
      const t = m[1].trim()
      if (t.length >= 3 && !seen.has(t)) { seen.add(t); tasks.push(t) }
    }
  }

  return tasks
}

// ═══════════════════════════════════════════════════════════════
// SECTION 5 — TASK EXTRACTION: COLON-LIST PATTERN
// ═══════════════════════════════════════════════════════════════

/**
 * يكتشف نمط: "سؤال واحد: عنصر1؟ عنصر2؟ عنصر3؟"
 * مثال: "كم عدد سكان: الجزائر؟ المغرب؟ تونس؟"
 *        "who is president of: Algeria, Tunisia, Morocco?"
 *        "ما عملة: الجزائر، تونس، المغرب؟"
 */
function extractColonListTasks(msg) {
  // النمط: prefix + ":" + قائمة عناصر مفصولة بـ ؟ أو ، أو , أو أو
  const colonMatch = msg.match(/^(.{5,60})\s*[:]\s*(.{3,})$/mu)
  if (!colonMatch) return []

  const prefix = colonMatch[1].trim()
  const listPart = colonMatch[2].trim()

  // قسّم القائمة على: "؟" أو "?" أو "،" أو "," أو "أو" مع إزالة أي نص فارغ
  const items = listPart
    .split(/[؟?،,]\s*/)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && !/^\s*$/.test(s))

  if (items.length >= 2) {
    // استرجع كل عنصر مرتبطاً بالبادئة (prefix)
    return items.map(item => `${prefix.replace(/^(?:ما|من|كم|هل|أين|متى|كيف)\s+/i, '')} ${item}`.trim())
  }

  return []
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6 — TASK EXTRACTION: INLINE QUESTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * يستخرج أسئلة متعددة مفصولة بعلامات استفهام أو شرطة مائلة داخل رسالة واحدة
 * مثال: "من هو رئيس أمريكا؟ ومن هو رئيس الجزائر؟"
 * مثال: "من هو رئيس أمريكا ؟ / من هو رئيس الجزائر / من هو رئيس تونس"
 * مثال: "من هو رئيس أمريكا / من هو رئيس الجزائر / من هو رئيس تونس بالترتيب"
 */
function extractInlineQuestions(msg) {
  // تطبيع: استبدل " / " (شرطة مائلة محاطة بمسافات) بـ "؟ " لتعمل كفاصل سؤال
  // آمن: روابط URL تحتوي "://" ولن تتأثر بهذا النمط
  const normalized = msg.replace(/\s+\/\s+/g, ' ؟ ')

  // فصل بـ ؟ أو ?
  const parts = normalized.split(/[؟?]+/).map(s => s.trim()).filter(s => s.length >= 5)
  if (parts.length < 2) return []

  // الكلمات التي تدل على أن الجزء سؤال مستقل
  const QUESTION_MARKERS = /(?:من|ما|كيف|أين|متى|لماذا|هل|كم|ماذا|what|who|how|when|where|why|which|qui|que|comment|quand|o[uù]|pourquoi|combien|رئيس|عاصمة|سكان|عملة|نظام|عدد|أكبر|أصغر|أفضل|اسم|تاريخ|سبب|معنى|أصل|عاصمة|عدد|مساحة|population|capitale|président|premier ministre|وزير|حاكم|ملك|أمير|مدير|رئيس)/i

  const questions = parts.filter(s => QUESTION_MARKERS.test(s))

  // إذا لم تنجح QUESTION_MARKERS — جرّب: كل قسم طوله >= 8 أحرف يُحسَب سؤالاً مستقلاً
  // (يحدث عند استخدام / بين عبارات قصيرة بدون كلمة استفهام واضحة)
  if (questions.length < 2 && parts.length >= 2) {
    const fallback = parts.filter(s => s.length >= 8)
    if (fallback.length >= 2) return fallback
  }

  return questions.length >= 2 ? questions : []
}

// ═══════════════════════════════════════════════════════════════
// SECTION 7 — COMPARISON EXTRACTION
// ═══════════════════════════════════════════════════════════════

/**
 * يستخرج عناصر المقارنة من رسالة المقارنة
 * Fix: يدعم "وX" بدون مسافة بعد و + "vs" pattern + "et" فرنسي
 */
function extractComparisonElements(msg) {
  // ╔══ Strategy 1: "vs" or "versus" ═════════════════════════════════════════
  const vsMatch = msg.match(/([A-Za-z\u0600-\u06FF][\w\s\u0600-\u06FF]*?)\s+vs\.?\s+([A-Za-z\u0600-\u06FF].{1,60})/i)
  if (vsMatch) {
    // يمكن أن يكون هناك أكثر من عنصرين: X vs Y vs Z
    const allElements = msg
      .replace(/(?:compare|مقارنة|قارن|مقارنة شاملة)\s*[:\s]*/gi, '')
      .split(/\s+vs\.?\s+/i)
      .map(s => s.trim().split(/\s+(?:for|in|من حيث|في|for\s+web|في\s+مجال)/i)[0].trim())
      .filter(s => s.length >= 2 && s.length <= 40)
    if (allElements.length >= 2) return allElements
  }

  // ╔══ Strategy 2: "comparaison entre X Y et Z" (French) ═══════════════════
  const frenchMatch = msg.match(/comparaison\s+entre\s+(.{3,})/i)
  if (frenchMatch) {
    const elems = frenchMatch[1]
      .split(/\s+(?:et|,)\s+/i)
      .map(s => s.trim().split(/\s+en\s+tant\s+que/i)[0].trim())
      .filter(s => s.length >= 2)
    if (elems.length >= 2) return elems
  }

  // ╔══ Strategy 3: Arabic "بين X وY وZ" pattern ═══════════════════════════
  // استخرج النص بعد "بين"
  const betweenMatch = msg.match(/بين\s+(.{3,150})(?:\s+(?:من حيث|في مجال|في ما يخص|في)|$)/iu)
  const segment = betweenMatch
    ? betweenMatch[1]
    : msg.replace(/^(?:قارن|مقارنة(?:\s+شاملة)?|الفرق|ما الفرق)\s*/iu, '')

  if (segment && segment.length >= 3) {
    // FIX: إضافة مسافة قبل كل "وX" بدون مسافة، ثم تقسيم
    const normalized = segment.replace(/\sو(?=\S)/gu, ' و ')
    const parts = splitByAnd(normalized)
      .map(s => {
        // أزل البادئات الزائدة
        return s.replace(/^(?:بين|الفرق|ما الفرق|في مجال|من حيث|في ما يخص)\s*/iu, '').trim()
      })
      .filter(s => s.length >= 2 && s.length <= 50 && !/^(?:من حيث|في ما|في مجال|بخصوص|لأغراض)/iu.test(s))
    if (parts.length >= 2) return parts
  }

  // ╔══ Strategy 4: "الفرق بين X والY والZ" — عدة كلمات مترابطة بـ "و" ══════
  const diffElements = msg.match(/(?:الفرق|مقارنة|قارن)\s+(?:بين\s+)?(.{3,}?)(?:\s+(?:من حيث|في|as|كـ?).*)?$/iu)
  if (diffElements) {
    const parts = splitByAnd(diffElements[1]).filter(s => s.length >= 2 && s.length <= 50)
    if (parts.length >= 2) return parts
  }

  return []
}

/**
 * يستخرج جوانب المقارنة (من حيث: السعر والأداء)
 */
function extractComparisonAspects(msg) {
  const aspectMatch = msg.match(/(?:من حيث|في ما يخص|بخصوص|regarding|en termes de|من ناحية|على صعيد)\s+([^؟?\n]{3,})/iu)
  if (!aspectMatch) return []
  return splitByAnd(aspectMatch[1]).filter(s => s.length >= 2 && s.length <= 30)
}

// ═══════════════════════════════════════════════════════════════
// SECTION 8 — MAIN ANALYSIS FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * الدالة الرئيسية لتحليل النوايا المتعددة
 * @param {string} message - رسالة المستخدم
 * @returns {MultiIntentAnalysis}
 */
export function analyzeMultiIntent(message) {
  if (!message || message.trim().length < 5) {
    return { intentType: INTENT_TYPE.SINGLE, tasks: [], isMulti: false, taskCount: 1 }
  }

  const msg = message.trim()

  // ── Guard: "A) B) C)" patterns — single question with options, NOT multi ─
  // يمنع false positive لأسئلة الاختيار من متعدد
  if (/^[A-Da-d]\)\s*\w/.test(msg) && !/\n/.test(msg.slice(0, 20))) {
    return { intentType: INTENT_TYPE.SINGLE, tasks: [msg], isMulti: false, taskCount: 1 }
  }

  // ── 1. كشف المهام المرقّمة (الأقوى — يُقدَّم على غيره) ─────────────────
  const numberedTasks = extractNumberedTasks(msg)
  if (numberedTasks.length >= 2) {
    // SEQUENTIAL فقط إذا كانت الكلمات التسلسلية داخل أحد البنود المرقّمة نفسها
    // (وليس في نص ختامي مضاف بعد القائمة مثل "ثم تطبيق على الحياة")
    // نفحص النصف الأخير من الرسالة: إذا كانت الكلمات التسلسلية في سطر غير مرقّم → LIST_TASK
    const firstTaskIdx = msg.search(/(?:^|\n)\s*[٠١٢٣٤٥٦٧٨٩\d]+\s*[-.)،:]/mu)
    const lastTaskContent = numberedTasks[numberedTasks.length - 1] || ''
    const trailingText = firstTaskIdx >= 0 ? msg.slice(firstTaskIdx + lastTaskContent.length + 5) : ''
    const seqInItems = SEQUENTIAL_INLINE_KW_RE.test(lastTaskContent) ||
      numberedTasks.slice(0, -1).some(t => SEQUENTIAL_INLINE_KW_RE.test(t))
    const seqInTrailingOnly = SEQUENTIAL_INLINE_KW_RE.test(trailingText) && !seqInItems
    const hasStepKw = SEQUENTIAL_INLINE_KW_RE.test(msg) && !ORDERED_INSTRUCTIONS_RE.test(msg) && !seqInTrailingOnly
    const intentType = hasStepKw ? INTENT_TYPE.SEQUENTIAL : INTENT_TYPE.LIST_TASK
    return {
      intentType,
      tasks: numberedTasks,
      isMulti: true,
      taskCount: numberedTasks.length,
      source: 'numbered_list',
    }
  }

  // ── 2. كشف المقارنة ────────────────────────────────────────────────────
  // إضافة دعم "أم" كفاصل مقارنة (ما أفضل: X أم Y أم Z)
  // وأيضاً: "ما أفضل" و"أيهم أفضل" كـ comparison trigger
  const HAS_AM_PREFERENCE = /(?:ما\s+أفضل|أيهم\s+أفضل|أيها\s+أفضل|best\s+of|laquelle|lequel)/i.test(msg) && /أم/.test(msg)
  if (COMPARISON_KW_RE.test(msg) || HAS_AM_PREFERENCE) {
    const elements = extractComparisonElements(msg)

    // عناصر "أم" للمقارنة: "ما أفضل: X أم Y أم Z"
    // ملاحظة: \b لا يعمل مع الحروف العربية — نستخدم \s بدلاً
    let finalElements = elements
    if (finalElements.length < 2 && /(?:^|\s)أم(?:\s|$)/u.test(msg)) {
      const amParts = msg.split(/\s+أم\s+/u).map(s => s.replace(/^.*?:\s*/u, '').trim()).filter(s => s.length >= 2)
      if (amParts.length >= 2) finalElements = amParts
    }

    if (finalElements.length >= 2) {
      // Guard: "الفرق بين X وY" بعنصرين فقط بدون كلمة "قارن"/"compare" صريحة → SINGLE
      // ملاحظة: لا نستخدم \b لأنه لا يعمل مع الحروف العربية في JavaScript
      const hasExplicitCompare = /(?:قارن|compare|comparer|comparaison|مقارنة\s*شاملة|مقارنة\s*بين)/i.test(msg)
      if (finalElements.length === 2 && !hasExplicitCompare) {
        // سؤال بسيط عن الفرق — سؤال واحد لا مقارنة متعددة
        return { intentType: INTENT_TYPE.SINGLE, tasks: [msg], isMulti: false, taskCount: 1, source: 'single' }
      }

      const aspects = extractComparisonAspects(msg)
      const tasks = finalElements.map(el => `جمع معلومات عن ${el}`)
      tasks.push(`إنشاء مقارنة شاملة بين ${finalElements.join(' و')}` + (aspects.length > 0 ? ` من حيث: ${aspects.join('، ')}` : ''))
      return {
        intentType: INTENT_TYPE.COMPARISON,
        tasks,
        elements: finalElements,
        aspects,
        isMulti: true,
        taskCount: finalElements.length + 1,
        source: 'comparison',
      }
    }
  }

  // ── 3. كشف نمط "سؤال: عنصر1، عنصر2، عنصر3؟" (colon-list) ──────────────
  const colonTasks = extractColonListTasks(msg)
  if (colonTasks.length >= 2) {
    // إذا كان النص يحوي كلمات تسلسلية → SEQUENTIAL
    const colonHasSeq = SEQUENTIAL_INLINE_KW_RE.test(msg)
    return {
      intentType: colonHasSeq ? INTENT_TYPE.SEQUENTIAL : INTENT_TYPE.MULTI,
      tasks: colonTasks,
      isMulti: true,
      taskCount: colonTasks.length,
      source: 'colon_list',
    }
  }

  // ── 4. كشف أسئلة متعددة بعلامات استفهام ───────────────────────────────
  const inlineQuestions = extractInlineQuestions(msg)
  if (inlineQuestions.length >= 2) {
    return {
      intentType: INTENT_TYPE.MULTI,
      tasks: inlineQuestions,
      isMulti: true,
      taskCount: inlineQuestions.length,
      source: 'question_marks',
    }
  }

  // ── 5. كشف نمط "ثم...ثم...ثم" التسلسلي ─────────────────────────────────
  if (SEQUENTIAL_INLINE_KW_RE.test(msg)) {
    const thenParts = msg
      .split(/\s+(?:ثم|بعد ذلك|بعدها|then|next|ensuite|puis)\s+/i)
      .map(s => s.trim())
      .filter(s => s.length >= 5)
    if (thenParts.length >= 2) {
      return {
        intentType: INTENT_TYPE.SEQUENTIAL,
        tasks: thenParts,
        isMulti: true,
        taskCount: thenParts.length,
        source: 'sequential_then',
      }
    }
  }

  // ── 6. كشف البحث الشامل متعدد النقاط (bullet points) ──────────────────
  if (RESEARCH_KW_RE.test(msg)) {
    const bulletRe = /(?:^|\n)\s*[-•*]\s*(.{5,})/gmu
    const bullets = []
    let bm
    while ((bm = bulletRe.exec(msg)) !== null) bullets.push(bm[1].trim())
    if (bullets.length >= 2) {
      return {
        intentType: INTENT_TYPE.RESEARCH,
        tasks: bullets,
        isMulti: true,
        taskCount: bullets.length,
        source: 'research_bullets',
      }
    }
  }

  // ── 7. سؤال واحد ─────────────────────────────────────────────────────────
  return {
    intentType: INTENT_TYPE.SINGLE,
    tasks: [msg],
    isMulti: false,
    taskCount: 1,
    source: 'single',
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 9 — SYSTEM PROMPT LAYER BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * يبني طبقة system prompt خاصة بالنوايا المتعددة
 * @param {MultiIntentAnalysis} analysis
 * @returns {string} — نص يُضاف لـ system prompt
 */
export function buildMultiIntentSystemLayer(analysis) {
  if (!analysis.isMulti || analysis.taskCount <= 1) return ''

  const { intentType, tasks, taskCount, elements, aspects } = analysis

  const taskList = tasks
    .map((t, i) => `  ${i + 1}. ${t}`)
    .join('\n')

  let header = ''
  let instructions = ''

  switch (intentType) {

    case INTENT_TYPE.MULTI:
    case INTENT_TYPE.LIST_TASK:
      header = `🔀 MULTI-INTENT MODE — كُشف ${taskCount} أسئلة/مهام مستقلة`
      instructions = `
⚡ قواعد المعالجة المتعددة (إلزامية — لا استثناءات):

📋 قائمة المهام المكتشفة (${taskCount} مهام):
${taskList}

✅ القواعد الإلزامية:
① أجب عن كل مهمة بالترتيب — لا تتجاوز أي مهمة مهما كانت
② رقّم إجاباتك: **1.** ثم **2.** ثم **3.** ... إلخ
③ لكل مهمة فقرة/قسم مستقل وافٍ
④ لا تدمج إجابات متعددة في جملة واحدة
⑤ في نهاية إجابتك تأكد: "✅ تم الإجابة على ${taskCount}/${taskCount} أسئلة"

❌ ممنوع: الإجابة عن مهمة واحدة فقط وتجاهل الباقي
❌ ممنوع: تجاهل أي سؤال بحجة التعقيد أو الطول`
      break

    case INTENT_TYPE.SEQUENTIAL:
      header = `🔢 SEQUENTIAL MODE — ${taskCount} خطوات متسلسلة`
      instructions = `
⚡ قواعد المعالجة التسلسلية (إلزامية):

📋 الخطوات المطلوبة بالترتيب:
${taskList}

✅ القواعد الإلزامية:
① نفّذ كل خطوة بالترتيب الدقيق المطلوب
② كل خطوة لها عنوان واضح: **الخطوة 1:** / **الخطوة 2:** ...
③ لا تنتقل لخطوة قبل إكمال السابقة
④ في النهاية: ملخص يؤكد إتمام ${taskCount} خطوات`
      break

    case INTENT_TYPE.COMPARISON:
      header = `⚖️ COMPARISON MODE — مقارنة بين ${(elements||[]).join(' و ')}`
      const aspectsStr = (aspects && aspects.length > 0)
        ? `من حيث: ${aspects.join('، ')}`
        : 'من جميع الجوانب'
      instructions = `
⚡ قواعد المقارنة الشاملة (إلزامية):

📋 عناصر المقارنة: ${(elements||[]).join(' | ')}
📊 جوانب المقارنة: ${aspectsStr}

✅ القواعد الإلزامية:
① جمّع معلومات عن كل عنصر: ${(elements||[]).map((e,i)=>`${i+1}. ${e}`).join(' | ')}
② أنشئ جدول مقارنة markdown كامل يشمل كل الجوانب
③ لا تتجاهل أي عنصر من عناصر المقارنة
④ في الخلاصة: أعطِ توصية واضحة مبنية على البيانات

❌ ممنوع: المقارنة بين عنصرين فقط عند وجود ثلاثة أو أكثر`
      break

    case INTENT_TYPE.RESEARCH:
      header = `🔬 RESEARCH MODE — بحث شامل في ${taskCount} محاور`
      instructions = `
⚡ قواعد البحث الشامل (إلزامية):

📋 المحاور المطلوبة (${taskCount}):
${taskList}

✅ القواعد الإلزامية:
① أجب عن كل محور بقسم مستقل ومفصّل
② عنوان كل قسم بـ ## أو ###
③ لا تختصر محوراً على حساب محور آخر
④ في النهاية: ملخص تنفيذي يجمع أبرز ما وجدت`
      break

    default:
      header = `🔀 MULTI-TASK MODE — ${taskCount} مهام`
      instructions = `
المهام المطلوبة:
${taskList}

أجب عن كل مهمة بشكل مستقل ومرتب بالأرقام.`
  }

  return `
━━━ 🧠 MULTI-INTENT ENGINE v1.2 ━━━
${header}
${instructions}

🔴 قاعدة التحقق النهائية قبل الإرسال:
   عدد المهام المطلوبة: ${taskCount}
   ✅ يجب أن تحتوي إجابتك على ${taskCount} أقسام/نقاط مرقّمة
   ❌ إذا أجبت عن أقل من ${taskCount} مهام → الإجابة ناقصة ومرفوضة
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
}

// ═══════════════════════════════════════════════════════════════
// SECTION 10 — COMPLETENESS VERIFICATION
// ═══════════════════════════════════════════════════════════════

/**
 * يتحقق من أن الإجابة غطّت كل المهام المطلوبة
 */
export function verifyCompleteness(answer, analysis) {
  if (!analysis.isMulti || analysis.taskCount <= 1) {
    return { passed: true, coveredCount: 1, totalCount: 1, missingTasks: [] }
  }

  if (!answer || answer.trim().length < 20) {
    return { passed: false, coveredCount: 0, totalCount: analysis.taskCount, missingTasks: analysis.tasks }
  }

  const answerLower = answer.toLowerCase()

  // عدد الأرقام المرقّمة في الإجابة
  const numberedSections = (answer.match(/(?:^|\n)\s*(?:\*{0,2})(?:\d+[\.\-\)]\s|\d+\s*[:\/])/gm) || []).length
  const hasEnoughNumbers = numberedSections >= Math.min(analysis.taskCount, 2)

  // فحص كل مهمة
  let coveredCount = 0
  const missingTasks = []

  for (const task of analysis.tasks) {
    const keywords = task
      .replace(/[؟?!\u060C\u061B]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !/^(?:من|ما|في|هل|كم|عن|إلى|على|أن|لا|لم|قد|مع|أو|و|عطيني|أجب|اجب|جمع|إنشاء|معلومات)/u.test(w))
      .slice(0, 3)

    if (keywords.length === 0) { coveredCount++; continue }

    const matched = keywords.filter(kw => answerLower.includes(kw.toLowerCase())).length
    if (matched >= Math.ceil(keywords.length / 2)) {
      coveredCount++
    } else {
      missingTasks.push(task)
    }
  }

  const coverageRatio = coveredCount / analysis.taskCount
  const passed = coverageRatio >= 0.8 || (hasEnoughNumbers && numberedSections >= analysis.taskCount)

  return {
    passed,
    coveredCount,
    totalCount: analysis.taskCount,
    numberedSections,
    missingTasks: passed ? [] : missingTasks,
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 11 — RETRY PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════

export function buildRetryInstruction(verification, analysis) {
  if (verification.passed) return ''
  const missing = verification.missingTasks.slice(0, 5)
  return `
⚠️ INCOMPLETE ANSWER — تنبيه: الإجابة ناقصة!
أجبت عن ${verification.coveredCount} من ${verification.totalCount} مهام فقط.
المهام الناقصة التي يجب إضافتها:
${missing.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}
أكمل الإجابة بإضافة هذه المهام الناقصة.`
}

// ═══════════════════════════════════════════════════════════════
// SECTION 12 — LOGGING
// ═══════════════════════════════════════════════════════════════

export function logMultiIntentAnalysis(analysis, verification = null) {
  if (!analysis.isMulti) {
    console.log(`[MultiIntent] 🔵 SINGLE intent — taskCount=1`)
    return
  }
  console.log(`[MultiIntent] 🟢 ${analysis.intentType} — tasks=${analysis.taskCount} | source=${analysis.source || '?'}`)
  if (analysis.tasks?.length > 0) {
    analysis.tasks.slice(0, 4).forEach((t, i) => {
      console.log(`  [MultiIntent]   Task ${i + 1}: "${t.slice(0, 60)}"`)
    })
    if (analysis.tasks.length > 4) console.log(`  [MultiIntent]   ... +${analysis.tasks.length - 4} more`)
  }
  if (verification) {
    const status = verification.passed ? '✅ PASSED' : '❌ FAILED'
    console.log(`[MultiIntent] ${status} | covered=${verification.coveredCount}/${verification.totalCount} | sections=${verification.numberedSections || 0}`)
    if (!verification.passed && verification.missingTasks?.length > 0) {
      console.warn(`[MultiIntent] ⚠️ Missing: ${verification.missingTasks.map(t => t.slice(0,30)).join(' | ')}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 13 — TEST SUITE (100 حالة)
// ═══════════════════════════════════════════════════════════════

export const TEST_SUITE = [
  { id: 1,  input: 'أجب بالترتيب: 1- من هو الرئيس الأمريكي الحالي؟ 2- من هو الرئيس الجزائري الحالي؟ 3- من هو الرئيس التونسي الحالي؟', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 2,  input: '1. من اخترع الهاتف؟\n2. من اخترع الإنترنت؟\n3. من اخترع المصباح؟', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 3,  input: '1- عاصمة الجزائر\n2- عاصمة تونس\n3- عاصمة المغرب\n4- عدد السكان\n5- العملة', expectedTasks: 5, expectedType: 'LIST_TASK' },
  { id: 4,  input: 'أجب على هذه الأسئلة:\n1. ما هو أكبر كوكب في المجموعة الشمسية؟\n2. ما هو أصغر كوكب؟\n3. كم كوكباً في المجموعة الشمسية؟', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 5,  input: 'أحتاج معلومات:\n١- متى استقلت الجزائر؟\n٢- من هو أول رئيس للجزائر؟\n٣- كم عدد ولايات الجزائر؟', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 6,  input: 'قدم لي:\nأولاً: تعريف الذكاء الاصطناعي\nثانياً: تاريخه\nثالثاً: تطبيقاته', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 7,  input: 'اشرح:\n1) ما هو التعلم الآلي\n2) ما هو التعلم العميق\n3) الفرق بينهما', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 8,  input: 'معلومات عن:\n- الجزائر العاصمة\n- وهران\n- قسنطينة', expectedTasks: 3, expectedType: 'RESEARCH' },
  { id: 9,  input: 'A) What is AI? B) What is ML? C) What is DL?', expectedTasks: 0, expectedType: 'SINGLE' },
  { id: 10, input: 'من هو الرئيس الأمريكي؟ ومن هو الرئيس الفرنسي؟ ومن هو الرئيس الجزائري؟', expectedTasks: 3, expectedType: 'MULTI' },
  { id: 11, input: 'هل الجزائر في أفريقيا؟ وكم عدد سكانها؟ وما هي عملتها؟', expectedTasks: 3, expectedType: 'MULTI' },
  { id: 12, input: '1- ما هي أكبر دولة في العالم؟\n2- ما هي أصغر دولة في العالم؟\n3- ما هي أكثر دولة اكتظاظاً بالسكان؟\n4- ما هي أكثر دولة مساحةً في أفريقيا؟', expectedTasks: 4, expectedType: 'LIST_TASK' },
  { id: 13, input: 'رتّب الإجابات:\n1. اختراع الطائرة\n2. اختراع السيارة\n3. اختراع الحاسوب\n4. اختراع الإنترنت\n5. اختراع الهاتف الذكي', expectedTasks: 5, expectedType: 'LIST_TASK' },
  { id: 14, input: '1-شرح نظرية النسبية\n2-من طرحها\n3-ما تأثيرها على الفيزياء الحديثة', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 15, input: 'سؤالي: 1- ما معنى HTTP؟ 2- ما معنى HTTPS؟ 3- ما الفرق؟', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 16, input: '١- ما هي لغة Python؟\n٢- ما هي لغة JavaScript؟\n٣- ما هي لغة Java؟\n٤- أيهم أفضل للمبتدئين؟', expectedTasks: 4, expectedType: 'LIST_TASK' },
  { id: 17, input: 'أجب بالترتيب:\n1. من هو أول رئيس وزراء للمملكة المتحدة؟\n2. من هو الرئيس الحالي للوزراء؟\n3. كم شخصاً شغل هذا المنصب؟', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 18, input: 'معلومات بالترتيب:\n1- الجاذبية الأرضية\n2- كتلة الأرض\n3- محيط الأرض\n4- قطر الأرض\n5- بُعد الأرض عن الشمس', expectedTasks: 5, expectedType: 'LIST_TASK' },
  { id: 19, input: 'أجب عن:\nأ- ما هو مناخ الجزائر؟\nب- ما هي أهم المحاصيل الزراعية؟\nج- ما هي الثروة الطبيعية الرئيسية؟', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 20, input: 'أعطني:\n1. عاصمة الجزائر\n2. عاصمة تونس\n3. عاصمة المغرب\n4. عاصمة ليبيا\n5. عاصمة موريتانيا\n6. عاصمة مالي', expectedTasks: 6, expectedType: 'LIST_TASK' },

  { id: 21, input: 'قارن بين iPhone وSamsung وXiaomi من حيث السعر والأداء والكاميرا', expectedTasks: 4, expectedType: 'COMPARISON' },
  { id: 22, input: 'ما الفرق بين ChatGPT وClaude وGemini من حيث السرعة والسعر والقدرات؟', expectedTasks: 4, expectedType: 'COMPARISON' },
  { id: 23, input: 'قارن بين Python وJavaScript في مجال الويب والذكاء الاصطناعي', expectedTasks: 3, expectedType: 'COMPARISON' },
  { id: 24, input: 'مقارنة بين الجزائر وتونس والمغرب من حيث السياحة والاقتصاد والتعليم', expectedTasks: 4, expectedType: 'COMPARISON' },
  { id: 25, input: 'compare React vs Vue vs Angular for web development', expectedTasks: 4, expectedType: 'COMPARISON' },
  { id: 26, input: 'الفرق بين الإسلام والمسيحية واليهودية كديانات إبراهيمية', expectedTasks: 4, expectedType: 'COMPARISON' },
  { id: 27, input: 'قارن بين مرسيدس وBMW وأودي', expectedTasks: 4, expectedType: 'COMPARISON' },
  { id: 28, input: 'comparaison entre Paris Londres et Berlin en tant que capitales européennes', expectedTasks: 4, expectedType: 'COMPARISON' },
  { id: 29, input: 'ما هو الفرق بين الدكتوراه والماجستير والليسانس؟', expectedTasks: 0, expectedType: 'COMPARISON' },
  { id: 30, input: 'قارن بين Windows وMacOS وLinux', expectedTasks: 4, expectedType: 'COMPARISON' },
  { id: 31, input: 'مقارنة شاملة: MySQL vs PostgreSQL vs MongoDB', expectedTasks: 4, expectedType: 'COMPARISON' },
  { id: 32, input: 'الفرق بين التعلم الآلي والتعلم العميق والذكاء الاصطناعي', expectedTasks: 4, expectedType: 'COMPARISON' },
  { id: 33, input: 'قارن بين العيش في الجزائر وفرنسا من حيث التكلفة والجودة', expectedTasks: 3, expectedType: 'COMPARISON' },
  { id: 34, input: 'vs bein sports vs dazn vs canal plus للمشتركين في الجزائر', expectedTasks: 0, expectedType: 'COMPARISON' },
  { id: 35, input: 'ما أفضل: Node.js أم Django أم Laravel للمشاريع الكبيرة؟', expectedTasks: 0, expectedType: 'COMPARISON' },

  { id: 36, input: 'اشرح الفيزياء، ثم أعطني أمثلة، ثم ضع اختباراً صغيراً', expectedTasks: 3, expectedType: 'SEQUENTIAL' },
  { id: 37, input: 'أولاً: شرح المشتقات في الرياضيات\nثانياً: أمثلة عليها\nثالثاً: تمارين', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 38, input: 'علمني البرمجة خطوة بخطوة:\n1. المتغيرات\n2. الحلقات\n3. الدوال\n4. الكائنات', expectedTasks: 4, expectedType: 'LIST_TASK' },
  { id: 39, input: 'كيف أتعلم العربية: first the alphabet, then words, then sentences', expectedTasks: 3, expectedType: 'SEQUENTIAL' },
  { id: 40, input: 'خطوات إنشاء موقع ويب:\n1- HTML\n2- CSS\n3- JavaScript\n4- النشر على الإنترنت', expectedTasks: 4, expectedType: 'LIST_TASK' },
  { id: 41, input: 'comment apprendre Python: d\'abord les bases, ensuite les fonctions, enfin les projets', expectedTasks: 3, expectedType: 'SEQUENTIAL' },
  { id: 42, input: 'step 1: setup node.js, step 2: create express app, step 3: add mongodb, step 4: deploy', expectedTasks: 4, expectedType: 'SEQUENTIAL' },
  { id: 43, input: 'اشرح تاريخ الجزائر ثم الحضارة الإسلامية ثم الاستعمار ثم الاستقلال', expectedTasks: 4, expectedType: 'SEQUENTIAL' },
  { id: 44, input: 'مراحل تطوير التطبيق:\n1. التصميم\n2. التطوير\n3. الاختبار\n4. النشر\n5. الصيانة', expectedTasks: 5, expectedType: 'LIST_TASK' },
  { id: 45, input: 'first explain what is RAM, then CPU, then GPU, then how they work together', expectedTasks: 4, expectedType: 'SEQUENTIAL' },
  { id: 46, input: 'مراحل الدراسة في الجزائر:\n1- الابتدائي\n2- المتوسط\n3- الثانوي\n4- الجامعي', expectedTasks: 4, expectedType: 'LIST_TASK' },
  { id: 47, input: 'اشرح ثم قدم أمثلة ثم اعطني تمريناً عن: الاستعارة في اللغة العربية', expectedTasks: 3, expectedType: 'SEQUENTIAL' },
  { id: 48, input: 'premièrement: qu\'est-ce que l\'IA? deuxièmement: ses applications. troisièmement: ses risques', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 49, input: 'I need to learn React:\n1. JSX basics\n2. Components\n3. State & Props\n4. Hooks\n5. Routing', expectedTasks: 5, expectedType: 'LIST_TASK' },
  { id: 50, input: 'علمني الشطرنج:\nأولاً: قواعد اللعبة\nثانياً: قيمة كل قطعة\nثالثاً: الحركات الخاصة\nرابعاً: استراتيجيات المبتدئين', expectedTasks: 4, expectedType: 'LIST_TASK' },

  { id: 51, input: 'أنشئ تطبيقاً:\n1- صمم الواجهة\n2- أنشئ قاعدة البيانات\n3- أضف تسجيل الدخول\n4- اختبر الأخطاء', expectedTasks: 4, expectedType: 'LIST_TASK' },
  { id: 52, input: 'write python code that:\n1. reads a CSV file\n2. filters rows\n3. calculates averages\n4. exports to JSON', expectedTasks: 4, expectedType: 'LIST_TASK' },
  { id: 53, input: 'أريد:\n1. دالة لجمع رقمين\n2. دالة لضربهما\n3. دالة للقسمة\n4. برنامج يستخدم الثلاث', expectedTasks: 4, expectedType: 'LIST_TASK' },
  { id: 54, input: 'help me:\n1. install Node.js\n2. create package.json\n3. install express\n4. create hello world route', expectedTasks: 4, expectedType: 'LIST_TASK' },
  { id: 55, input: 'build API:\n1. GET /users\n2. POST /users\n3. PUT /users/:id\n4. DELETE /users/:id', expectedTasks: 4, expectedType: 'LIST_TASK' },
  { id: 56, input: 'اكتب:\n1. كلاس Student\n2. كلاس Teacher\n3. كلاس School يجمعهم', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 57, input: 'مشاريع Python:\n1. آلة حاسبة\n2. لعبة تخمين الأرقام\n3. مدير كلمات المرور', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 58, input: 'tasks:\n1. setup git repo\n2. create branch\n3. make commits\n4. open pull request\n5. merge', expectedTasks: 5, expectedType: 'LIST_TASK' },
  { id: 59, input: 'docker guide:\n1. install docker\n2. create dockerfile\n3. build image\n4. run container\n5. docker compose', expectedTasks: 5, expectedType: 'LIST_TASK' },
  { id: 60, input: 'react app steps:\n1. create-react-app\n2. add tailwind\n3. create components\n4. add routing\n5. deploy to vercel', expectedTasks: 5, expectedType: 'LIST_TASK' },

  { id: 61, input: 'من هو رئيس أمريكا؟ رئيس فرنسا؟ رئيس الجزائر؟ رئيس مصر؟', expectedTasks: 4, expectedType: 'MULTI' },
  { id: 62, input: 'كم عدد سكان: الجزائر؟ المغرب؟ تونس؟ ليبيا؟ مصر؟', expectedTasks: 5, expectedType: 'MULTI' },
  { id: 63, input: 'متى استقلّت: الجزائر، تونس، المغرب، موريتانيا؟', expectedTasks: 4, expectedType: 'MULTI' },
  { id: 64, input: 'رأس الحكومة في: الجزائر؟ والمغرب؟ وتونس؟', expectedTasks: 3, expectedType: 'MULTI' },
  { id: 65, input: 'ما عملة: الجزائر، تونس، المغرب، موريتانيا، مالي؟', expectedTasks: 5, expectedType: 'MULTI' },
  { id: 66, input: 'qui est le président: de l\'Algérie, de la France, des USA?', expectedTasks: 3, expectedType: 'MULTI' },
  { id: 67, input: 'who is president of: Algeria, Tunisia, Morocco, Egypt?', expectedTasks: 4, expectedType: 'MULTI' },
  { id: 68, input: 'عاصمة كل دولة:\n1. الجزائر\n2. السودان\n3. نيجيريا\n4. إثيوبيا\n5. كينيا', expectedTasks: 5, expectedType: 'LIST_TASK' },
  { id: 69, input: 'أكبر مدينة في: الجزائر؟ المغرب؟ مصر؟ السعودية؟', expectedTasks: 4, expectedType: 'MULTI' },
  { id: 70, input: 'ما هو نظام الحكم في: الجزائر، المغرب، تونس؟', expectedTasks: 3, expectedType: 'MULTI' },

  { id: 71, input: 'عطيني: 1- شكون رئيس امريكا 2- شكون رئيس الجزاير 3- شكون رئيس تونس', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 72, input: 'bghit n3ref:\n1- capitale dzayer\n2- 3adad sokkan\n3- el 3omla mta3ha', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 73, input: '1-Qui c\'est le président algérien actuel?\n2-Depuis quand?\n3-C\'est quoi son parti?', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 74, input: 'dir liya:\n1. chekoun houwa l3arbi Mesut Özil\n2. fin ila3eb\n3. wa3lach ma3adsh yel3ab', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 75, input: '3tini m3loumat:\n1- Dzayer\n2- Tunes\n3- Meghrib\nen arabe stp', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 76, input: 'سوالي:\n١- شنو معنى debugging؟\n٢- كيفاش نلقاو les bugs؟\n٣- tools باش نصلحوهم؟', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 77, input: 'je veux savoir:\n1. c\'est quoi le machine learning\n2. comment ça marche\n3. exemples concrets', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 78, input: 'ask me:\n1. what is DZD\n2. current rate vs EUR\n3. where to exchange in Algiers', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 79, input: 'je veux:\npremier: savoir l\'heure de prière à Alger\ndeuxième: la qibla direction\ntroisième: les mosquées proches', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 80, input: 'hhelp me bro:\n1- what is API\n2- what is REST\n3- what is GraphQL\n4- which is better', expectedTasks: 4, expectedType: 'LIST_TASK' },

  { id: 81, input: 'عطيني قائمة:\n1-الجزائر\n2-تونس\n3-المغرب\n4-مصر\n5-ليبيا\n6-موريتانيا\n7-مالي\n8-النيجر\n9-تشاد\n10-السودان\nعاصمة كل دولة', expectedTasks: 10, expectedType: 'LIST_TASK' },
  { id: 82, input: 'list everything:\n1.HTML\n2.CSS\n3.JavaScript\n4.React\n5.Vue\n6.Angular\n7.Node.js\n8.Python\n9.Django\n10.Flask\n11.SQL\n12.MongoDB', expectedTasks: 12, expectedType: 'LIST_TASK' },
  { id: 83, input: 'قوانين نيوتن:\n1-الأول\n2-الثاني\n3-الثالث\nمع مثال لكل قانون ثم تطبيق على الحياة اليومية', expectedTasks: 3, expectedType: 'LIST_TASK' },
  { id: 84, input: 'الدول الأعضاء في الاتحاد المغاربي:\n1-الجزائر\n2-تونس\n3-المغرب\n4-ليبيا\n5-موريتانيا\nمع العاصمة والعملة وعدد السكان لكل دولة', expectedTasks: 5, expectedType: 'LIST_TASK' },
  { id: 85, input: 'programming languages:\n1-Python\n2-JavaScript\n3-Java\n4-C++\n5-C#\n6-Ruby\n7-Go\n8-Rust\n9-Swift\n10-Kotlin\nexplain use case for each', expectedTasks: 10, expectedType: 'LIST_TASK' },

  { id: 86,  input: 'من هو الرئيس الجزائري الحالي؟', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 87,  input: 'ما هو الذكاء الاصطناعي؟', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 88,  input: 'كيف أتعلم البرمجة؟', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 89,  input: 'what is the capital of Algeria?', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 90,  input: 'ما هو سعر الدولار اليوم؟', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 91,  input: 'قارن بين iPhone 15 وiPhone 16', expectedTasks: 3, expectedType: 'COMPARISON' },
  { id: 92,  input: 'مرحباً كيف حالك؟', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 93,  input: 'اكتب قصيدة عن الجزائر', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 94,  input: 'c\'est quoi la wilaya d\'Alger?', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 95,  input: 'شرح مبسط للكيمياء', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 96,  input: 'who invented the internet?', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 97,  input: 'ما هو الفرق بين الدنيا والآخرة؟', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 98,  input: 'اعطني وصفة لطبق الكسكس الجزائري', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 99,  input: 'شرح نظرية التطور لداروين', expectedTasks: 1, expectedType: 'SINGLE' },
  { id: 100, input: 'كيف يعمل محرك البحث Google؟', expectedTasks: 1, expectedType: 'SINGLE' },
]

export function runTestSuite() {
  let passed = 0
  let failed = 0
  const results = []

  for (const test of TEST_SUITE) {
    const analysis = analyzeMultiIntent(test.input)
    let ok = false

    if (test.expectedType === 'SINGLE') {
      ok = !analysis.isMulti
    } else if (test.expectedType === 'COMPARISON') {
      ok = analysis.intentType === INTENT_TYPE.COMPARISON
    } else if (test.expectedType === 'SEQUENTIAL') {
      ok = analysis.intentType === INTENT_TYPE.SEQUENTIAL || analysis.intentType === INTENT_TYPE.LIST_TASK
    } else {
      ok = analysis.intentType === test.expectedType
    }

    if (ok) passed++; else failed++

    results.push({
      id: test.id,
      ok,
      input: test.input.slice(0, 60),
      expected: `${test.expectedType}(${test.expectedTasks})`,
      got: `${analysis.intentType}(${analysis.taskCount})`,
    })
  }

  return { passed, failed, total: TEST_SUITE.length, results }
}
