/**
 * DZ Intent Classifier v1.0
 * ════════════════════════════════════════════════════════════════════
 * ثلاث وظائف جوهرية:
 *  1. resolveContextualQuery  — يحلّ الضمائر والإحالات السياقية في المحادثة متعددة الدور
 *  2. detectDZSportsAmbiguity — يكشف أسئلة رياضية مبهمة بدون كيان محدد
 *  3. detectDZPoliticsAmbiguity — يكشف أسئلة سياسية مبهمة بدون كيان محدد
 *
 * القاعدة الذهبية:
 *  ① لا يلمس هذا الملف أي fast-path ثابت (owner, static-facts, anti-hallucination)
 *  ② يُستدعى فقط بعد كل الحراسات الثابتة وقبل isRealtimeQuery / AI call
 *  ③ عند الشك → اسأل، ولا تخمّن
 * ════════════════════════════════════════════════════════════════════
 */

// ══════════════════════════════════════════════════════════════════════
// § 1 — Context-Aware Pronoun Resolution (إصلاح تتبع السياق)
// ══════════════════════════════════════════════════════════════════════

// أنماط الضمائر والإحالات التي تُشير للرسالة السابقة
const PRONOUN_PATTERNS = [
  /^(كم|ما|من|ماذا|أين|متى|كيف|لماذا)\s+(عمره|سنه|وزنه|عمرها|سنها|وزنها)\s*[؟?]?\s*$/i,
  /^(كم|ما|من)\s+(هو|هي|هم|هن)\s*[؟?]?\s*$/i,
  /^(ومن|وكم|وأين|ومتى|وكيف)\s+/i,
  /^(و)?(قبله|قبلها|بعده|بعدها|خلفه|خلفها)\s*[؟?]?\s*$/i,
  /^(واش|شنو|كيفاش)\s+(هو|هي|هو؟|راه|راها)\s*[؟?]?\s*$/i,
  /^(هو|هي|هم|هما)\s+(من|ما|أين)\s*[؟?]?\s*$/i,
  /^(شكون|شكوني|شكوين)\s+(هو|هي)\s*[؟?]?\s*$/i,
  /^(وين|فين)\s+(هو|هي|راه|راها)\s*(الآن|درك|دروك)?\s*[؟?]?\s*$/i,
  /^(كم|شحال)\s+(عمره|عمرها|عندو|عندها|عنده|عندها)\s*[؟?]?\s*$/i,
  /^(أخبار|آخر\s+أخبار|جديد|الجديد)\s+(عنه|عنها|عنهم)\s*[؟?]?\s*$/i,
  /^(أخبر|حكيلي|قولي)\s+(عنه|عنها|عنهم|عن\s+ذلك)\s*[؟?]?\s*$/i,
  /^(نفس|نفس\s+ال)\s+(الشخص|اللاعب|الرئيس|الوزير|الفريق)\s*[؟?]?\s*$/i,
  /^(ومتى|ولماذا|وكيف|ولماذا|وأين|وكم)\b/i,
  // فرانكو-عربي
  /^(wach|wesh)\s+(huwa|hiya|rah|raha|jdid)\s*[؟?]?\s*$/i,
  /^(w|ou)\s+(avant|après|quel|quelle)\b/i,
]

// مؤشرات الكيان الرئيسي في رسالة المساعد
const ENTITY_EXTRACTION_PATTERNS = [
  // اسم رئيس / وزير / مسؤول
  /(?:رئيس|وزير|والي|أمين|مدير|مسؤول)\s+(?:الجمهورية\s+)?([^\s،,\n]{4,30}(?:\s+[^\s،,\n]{2,20}){0,3})/g,
  // "هو X" أو "هي X"
  /(?:هو|هي)\s+([A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s]{3,40})/g,
  // "اسمه X" أو "اسمها X"
  /(?:اسمه|اسمها|يُعرَّف بـ?|يُعرف باسم)\s+([^\s،,\n]{3,40})/g,
  // "لاعب X" أو "الفريق X"
  /(?:لاعب|لاعبة|الفريق|المنتخب)\s+([^\s،,\n]{2,30}(?:\s+[^\s،,\n]{2,20}){0,2})/g,
  // اسم عَلَم بارز (عربي: 3+ أحرف، لا يبدأ بـ ال)
  /\*{1,2}([A-Za-z\u0621-\u064A][A-Za-z\u0621-\u064A\s]{3,35})\*{1,2}/g,
]

/**
 * isFollowUpQuery(msg)
 * هل الرسالة إحالة إلى موضوع سابق؟
 */
export function isFollowUpQuery(msg) {
  if (!msg) return false
  const clean = msg.trim()
  // قصيرة جداً (< 50 حرفاً) + تحتوي ضمير إحالة
  if (clean.length > 80) return false
  return PRONOUN_PATTERNS.some(p => p.test(clean))
}

/**
 * resolveContextualQuery(lastMsg, messages)
 * يُعيد نسخة "المعززة" من السؤال باستخدام سياق المحادثة.
 * مثال: "كم عمره؟" في سياق "تبون" → "كم عمر عبد المجيد تبون؟"
 *
 * @param {string} lastMsg - آخر رسالة المستخدم
 * @param {Array}  messages - كامل سجل المحادثة [{role,content}]
 * @returns {{ resolved: string, entity: string|null, wasResolved: boolean }}
 */
export function resolveContextualQuery(lastMsg, messages) {
  if (!isFollowUpQuery(lastMsg)) {
    return { resolved: lastMsg, entity: null, wasResolved: false }
  }

  // استخرج الكيان من آخر رسالة مساعد + آخر رسالة مستخدم سابقة
  const contextMessages = (messages || [])
    .slice(0, -1)
    .filter(m => m.role === 'assistant' || m.role === 'user')
    .slice(-6)
    .reverse()

  let foundEntity = null

  for (const m of contextMessages) {
    const content = typeof m.content === 'string' ? m.content : ''
    if (!content) continue

    for (const pattern of ENTITY_EXTRACTION_PATTERNS) {
      pattern.lastIndex = 0
      const match = pattern.exec(content)
      if (match?.[1]) {
        const candidate = match[1].trim().replace(/[،.,;!؟?]+$/, '')
        if (candidate.length >= 3 && candidate.length <= 60) {
          foundEntity = candidate
          break
        }
      }
    }
    if (foundEntity) break
  }

  if (!foundEntity) {
    return { resolved: lastMsg, entity: null, wasResolved: false }
  }

  // دمج الكيان مع السؤال
  const resolved = `${lastMsg.replace(/[؟?]+$/, '').trim()} — بخصوص ${foundEntity}؟`
  console.log(`[ContextResolver] "${lastMsg}" → "${resolved}"`)
  return { resolved, entity: foundEntity, wasResolved: true }
}

// ══════════════════════════════════════════════════════════════════════
// § 2 — DZ Sports Ambiguity Detection (أسئلة رياضية مبهمة)
// ══════════════════════════════════════════════════════════════════════

// مُحدِّدات الكيان الرياضي: إذا وُجد كيان في الرسالة → ليست مبهمة
const SPORTS_ENTITY_PRESENT = [
  /(?:المنتخب|فريق|نادي|جمعية)\s+[^\s،,\n]{3,}/i,
  /(?:الجزائر|تونس|المغرب|مصر|فرنسا|اسبانيا|ألمانيا|إنجلترا|البرتغال|البرازيل|الأرجنتين)/i,
  /(?:الأبطال|دوري الأبطال|Champions League|Ligue 1|Ligue 2|الدوري الإنجليزي|LaLiga|البنديسليغا)/i,
  /(?:لشبونة|مدريد|برشلونة|باريس|ليون|مارسيليا|ميلان|روما|ليفربول|مانشستر)/i,
  /بطولة\s+[^\s،,\n]{3,}/i,
  /كأس\s+[^\s،,\n]{3,}/i,
]

// الأسئلة الرياضية المبهمة (بدون كيان)
const SPORTS_AMBIGUOUS_PATTERNS = [
  // الهداف بدون تحديد
  { re: /^(?:من\s+هو\s+|شكون\s+هو\s+|من\s+|شكون\s+)?هداف\s+(?:البطولة|الدوري|الموسم|الفريق|المنتخب)?\s*[؟?]?\s*$/i, id: 'sports_top_scorer_vague' },
  // من ربح بدون مباراة
  { re: /^(?:شكون|من)\s+ربح\s*[؟?]?\s*$/i, id: 'sports_winner_vague' },
  { re: /^(?:شكون|من)\s+(?:فاز|كسب|هزم)\s*[؟?]?\s*$/i, id: 'sports_winner_vague' },
  // نتيجة الماتش بدون تحديد
  { re: /^(?:شحال|ما هي\s+)?نتيجة\s+(?:الماتش|المباراة|اللقاء)\s*[؟?]?\s*$/i, id: 'sports_result_vague' },
  { re: /^واش\s+صار\s+(?:الماتش|في\s+الماتش|مع\s+الفريق)?\s*[؟?]?\s*$/i, id: 'sports_result_vague' },
  // الترتيب بدون تحديد
  { re: /^(?:الترتيب|ترتيب\s+(?:الفرق|الدوري|البطولة))\s*[؟?]?\s*$/i, id: 'sports_standings_vague' },
  // الماتش الجاي بدون تحديد
  { re: /^(?:الماتش|المباراة|اللقاء)\s+(?:الجاي|القادم|المقبل|الجاية)\s*[؟?]?\s*$/i, id: 'sports_next_match_vague' },
  { re: /^(?:متى|وقتاه|فوقاش)\s+(?:الماتش|المباراة|اللقاء)\s*[؟?]?\s*$/i, id: 'sports_next_match_vague' },
  // شحال بقا (بدون كيان)
  { re: /^(?:شحال|كم)\s+(?:بقا?|يبقى|باقي)\s*[؟?]?\s*$/i, id: 'sports_time_remaining_vague' },
  // كاين ماتشات اليوم (بدون كيان)
  { re: /^(?:كاين|فيه|واش\s+فيه)\s+(?:ماتشات|مباريات)\s+(?:اليوم|غدوة|الليلة)?\s*[؟?]?\s*$/i, id: 'sports_schedule_vague' },
]

const SPORTS_CLARIFICATION_MAP = {
  sports_top_scorer_vague: {
    question: 'هداف أي بطولة أو فريق تقصد؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'الدوري الجزائري المحترف (Ligue Pro)' },
      { n: 2, emoji: '⚽', label: 'دوري أبطال أوروبا (Champions League)' },
      { n: 3, emoji: '🌍', label: 'المنتخب الجزائري (قائمة الأهداف)' },
      { n: 4, emoji: '🌐', label: 'بطولة أخرى — حدّدها' },
    ],
  },
  sports_winner_vague: {
    question: 'شكون ربح في أي مباراة أو بطولة؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'آخر مباراة للمنتخب الجزائري' },
      { n: 2, emoji: '🏆', label: 'مباراة بعينها — حدّد الفريقين' },
      { n: 3, emoji: '📅', label: 'نتائج مباريات اليوم' },
    ],
  },
  sports_result_vague: {
    question: 'نتيجة أي مباراة تريد معرفتها؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'آخر مباراة للمنتخب الجزائري' },
      { n: 2, emoji: '🏆', label: 'مباراة محددة — أذكر الفريقين والتاريخ' },
      { n: 3, emoji: '📊', label: 'نتائج اليوم من مختلف البطولات' },
    ],
  },
  sports_standings_vague: {
    question: 'ترتيب أي دوري أو بطولة تقصد؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'الدوري الجزائري المحترف' },
      { n: 2, emoji: '⚽', label: 'دوري أبطال أوروبا' },
      { n: 3, emoji: '🇫🇷', label: 'الدوري الفرنسي Ligue 1' },
      { n: 4, emoji: '🌐', label: 'بطولة أخرى — حدّدها' },
    ],
  },
  sports_next_match_vague: {
    question: 'ماتش أي فريق أو منتخب؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'المنتخب الجزائري' },
      { n: 2, emoji: '⚽', label: 'فريق بعينه — حدّد اسمه' },
      { n: 3, emoji: '📅', label: 'برنامج مباريات اليوم كاملاً' },
    ],
  },
  sports_time_remaining_vague: {
    question: 'شحال بقا لأي حدث رياضي؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'الوقت الباقي لمباراة المنتخب الجزائري' },
      { n: 2, emoji: '🏆', label: 'الوقت الباقي لنهائي بطولة محددة' },
      { n: 3, emoji: '⏱️', label: 'حدث رياضي آخر — حدّده' },
    ],
  },
  sports_schedule_vague: {
    question: 'ماتشات أي دوري أو منتخب اليوم؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'مباريات الدوري الجزائري' },
      { n: 2, emoji: '⚽', label: 'مباريات البطولات الأوروبية' },
      { n: 3, emoji: '🌍', label: 'كل المباريات اليوم' },
    ],
  },
}

/**
 * detectDZSportsAmbiguity(msg)
 * يُعيد { needsClarification, question, options } أو null
 */
export function detectDZSportsAmbiguity(msg) {
  if (!msg || msg.length > 80) return null

  const hasEntity = SPORTS_ENTITY_PRESENT.some(p => p.test(msg))
  if (hasEntity) return null

  for (const { re, id } of SPORTS_AMBIGUOUS_PATTERNS) {
    if (re.test(msg.trim())) {
      const cfg = SPORTS_CLARIFICATION_MAP[id]
      if (cfg) {
        return {
          needsClarification: true,
          caseId: id,
          question: cfg.question,
          options: cfg.options,
        }
      }
    }
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════
// § 3 — DZ Politics Ambiguity Detection (أسئلة سياسية مبهمة)
// ══════════════════════════════════════════════════════════════════════

// أسئلة سياسية مبهمة — بدون تحديد دولة أو شخص
const POLITICS_AMBIGUOUS_PATTERNS = [
  // الرئيس السابق بدون دولة
  { re: /^(?:من\s+هو\s+|شكون\s+هو\s+)?(?:الرئيس|رئيس\s+الجمهورية)\s+السابق\s*[؟?]?\s*$/i, id: 'politics_prev_president' },
  // الوزير الحالي بدون وزارة
  { re: /^(?:من\s+هو\s+|شكون\s+هو\s+)?الوزير\s+(?:الحالي|الجديد|الجاي)\s*[؟?]?\s*$/i, id: 'politics_minister_vague' },
  { re: /^(?:من\s+هو\s+|شكون\s+هو\s+)?وزير\s+(?:الداخلية|الخارجية|التعليم|المالية|الصحة)\s*[؟?]?\s*$/i, id: 'politics_minister_which_country' },
  // آخر انتخابات / نتائج الانتخابات
  { re: /^(?:نتائج|نتيجة)\s+(?:الانتخابات|الاستفتاء)\s*[؟?]?\s*$/i, id: 'politics_election_results_vague' },
  { re: /^(?:شكون|من)\s+(?:فاز|كسب|ربح)\s+(?:في\s+)?(?:الانتخابات|الاستفتاء)\s*[؟?]?\s*$/i, id: 'politics_election_winner_vague' },
  // آخر مقابلة / خطاب بدون شخص
  { re: /^(?:آخر|أخر)\s+(?:مقابلة|خطاب|تصريح|لقاء\s+إعلامي)\s*[؟?]?\s*$/i, id: 'politics_last_speech_vague' },
  // وين راه / أين هو (الرئيس / الوزير) بدون اسم
  { re: /^(?:وين|أين|فين)\s+(?:راه|هو|هي)\s+(?:الرئيس|الوزير|المسؤول)\s*[؟?]?\s*$/i, id: 'politics_whereabouts_vague' },
]

const POLITICS_CLARIFICATION_MAP = {
  politics_prev_president: {
    question: 'رئيس أي دولة السابق تقصد؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'الجزائر — عبد العزيز بوتفليقة (1999-2019)' },
      { n: 2, emoji: '🇫🇷', label: 'فرنسا — حدّد العهد الذي تقصد' },
      { n: 3, emoji: '🇺🇸', label: 'الولايات المتحدة — حدّد الرئيس' },
      { n: 4, emoji: '🌍', label: 'دولة أخرى — حدّدها' },
    ],
  },
  politics_minister_vague: {
    question: 'وزير أي دولة تقصد؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'وزير جزائري — حدّد الوزارة' },
      { n: 2, emoji: '🌍', label: 'وزير في دولة أخرى — حدّدها' },
    ],
  },
  politics_minister_which_country: {
    question: 'وزير أي دولة تقصد؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'الجزائر' },
      { n: 2, emoji: '🇫🇷', label: 'فرنسا' },
      { n: 3, emoji: '🇹🇳', label: 'تونس' },
      { n: 4, emoji: '🌍', label: 'دولة أخرى — حدّدها' },
    ],
  },
  politics_election_results_vague: {
    question: 'نتائج انتخابات أي دولة وأي سنة؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'الانتخابات الجزائرية الأخيرة' },
      { n: 2, emoji: '🌍', label: 'انتخابات دولة أخرى — حدّدها' },
    ],
  },
  politics_election_winner_vague: {
    question: 'انتخابات أي دولة؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'الانتخابات الجزائرية' },
      { n: 2, emoji: '🌍', label: 'دولة أخرى — حدّدها' },
    ],
  },
  politics_last_speech_vague: {
    question: 'آخر مقابلة أو خطاب لمن بالضبط؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'الرئيس تبون' },
      { n: 2, emoji: '🌍', label: 'مسؤول آخر — حدّد اسمه' },
    ],
  },
  politics_whereabouts_vague: {
    question: 'تقصد أين هو مسؤول بعينه؟',
    options: [
      { n: 1, emoji: '🇩🇿', label: 'الرئيس تبون' },
      { n: 2, emoji: '🌍', label: 'مسؤول آخر — حدّد اسمه' },
    ],
  },
}

/**
 * detectDZPoliticsAmbiguity(msg)
 * يُعيد { needsClarification, question, options } أو null
 */
export function detectDZPoliticsAmbiguity(msg) {
  if (!msg || msg.length > 80) return null

  for (const { re, id } of POLITICS_AMBIGUOUS_PATTERNS) {
    if (re.test(msg.trim())) {
      const cfg = POLITICS_CLARIFICATION_MAP[id]
      if (cfg) {
        return {
          needsClarification: true,
          caseId: id,
          question: cfg.question,
          options: cfg.options,
        }
      }
    }
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════
// § 4 — Combined DZ Ambiguity Check (الفاحص الجامع)
// ══════════════════════════════════════════════════════════════════════

/**
 * detectDZAmbiguity(msg)
 * يجمع الفحصين: رياضي + سياسي
 * @returns {{ needsClarification, caseId, question, options } | null}
 */
export function detectDZAmbiguity(msg) {
  const sports = detectDZSportsAmbiguity(msg)
  if (sports) return sports

  const politics = detectDZPoliticsAmbiguity(msg)
  if (politics) return politics

  return null
}

// ══════════════════════════════════════════════════════════════════════
// § 5 — Darija Intent Quick Map (تصنيف سريع بالدارجة)
// ══════════════════════════════════════════════════════════════════════

const DARIJA_INTENT_MAP = [
  { re: /واش\s+صرا\s+(البارح|اليوم|درك|هذا\s+النهار)/i,      type: 'NEWS',          label: 'أخبار عاجلة' },
  { re: /شحال\s+بقا\s+(للماتش|للمباراة|للنهائي)/i,           type: 'SPORTS_TIME',   label: 'وقت باقي' },
  { re: /(كاين|فيه)\s+(ماتشات|مباريات)\s+(اليوم|الليلة)/i,   type: 'SPORTS_SCHED',  label: 'برنامج المباريات' },
  { re: /هداف\s+(البطولة|الدوري|الموسم)/i,                    type: 'SPORTS_STATS',  label: 'إحصاء الهداف' },
  { re: /سعر\s+(الدولار|اليورو|الدينار|الذهب|القهوة)\s+(درك|اليوم|الآن)/i, type: 'PRICES', label: 'أسعار' },
  { re: /واش\s+(صح|صحيح|حقيقي|حقيقة)\s+أن/i,                 type: 'FACT_CHECK',    label: 'تحقق من حقيقة' },
  { re: /شنو\s+(?:هو|هي|راه|راها)\s+/i,                       type: 'DEFINITION',    label: 'تعريف' },
  { re: /كيفاش\s+(?:نعمل|ندير|نعمل|يمكن|نقدر)/i,              type: 'HOW_TO',        label: 'كيفية التنفيذ' },
  { re: /(جيبلي|عطيني|ابعثلي|ابحثلي)\s+(صورة|فيديو|رابط)/i,  type: 'MEDIA_REQUEST', label: 'طلب وسائط' },
  { re: /ترجم\s+(هذا|هذه|الكلمة|الجملة)/i,                    type: 'TRANSLATE',     label: 'ترجمة' },
]

/**
 * mapDarijaIntent(msg)
 * تصنيف سريع بالدارجة (لا يُستبدل intent.js، يُعزّزه)
 * @returns {{ type: string, label: string } | null}
 */
export function mapDarijaIntent(msg) {
  if (!msg) return null
  for (const { re, type, label } of DARIJA_INTENT_MAP) {
    if (re.test(msg)) return { type, label }
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════
// § 6 — Format Clarification Response (تنسيق رسالة طلب التوضيح)
// ══════════════════════════════════════════════════════════════════════

/**
 * formatDZClarification(question, options)
 * يُرجع نص Markdown لطلب توضيح بأسلوب DZ Agent
 */
export function formatDZClarification(question, options) {
  const lines = [
    `🤔 **${question}**\n`,
    ...(options || []).map(o => `**${o.n}.** ${o.emoji || '▪️'} ${o.label}`),
    '',
    '> اختر رقماً أو اكتب ما تريده بمزيد من التفاصيل.',
  ]
  return lines.join('\n')
}
