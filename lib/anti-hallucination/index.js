/**
 * lib/anti-hallucination/index.js
 * ════════════════════════════════════════════════════════════════════════════
 * HAL — Hallucination Assessment Layer v2
 * نظام ضد الهلوسة الموحّد لـ DZ Agent
 *
 * 5 طبقات متسلسلة:
 *   L1  classifyQueryRisk()   — تصنيف درجة الخطر (HIGH / MEDIUM / LOW)
 *   L2  buildGrounding()      — جلب الحقائق الموثّقة من المصادر الموثوقة
 *   L3  hardenMessages()      — حقن القواعد الصارمة + الحقائق المثبّتة
 *   L4  validateOutput()      — التحقق من مخرجات الـ LLM ضد المصادر
 *   L5  enrichResponse()      — إضافة درجة الثقة والتحذيرات والمراجع
 *
 * نقاط التكامل:
 *   halGuard(query, messages, generateFn, opts) → { content, halMeta }
 *   injectHALSystemPrompt(messages)             → messages[] (L3 سريع)
 * ════════════════════════════════════════════════════════════════════════════
 */

// ── استيراد المصادر الموجودة ──────────────────────────────────────────────
import {
  applyConfidenceSystem,
  buildNoSourceResponse,
  isHistoricalEventQuery,
  needsSportsVerification,
  buildSportsVerificationBlock,
  buildUncertaintyWarning,
} from '../verification-policy.js'

import { buildCitations, attachInlineCitations, exportCitations, stripBibliography } from '../citations.js'

import {
  getAlgeriaPresidentByYear,
  getAlgeriaPMByYear,
  isImpossibleDZEntity,
  isUnknownWilayaQuery,
  DZ_PRESIDENTS,
} from '../dz-knowledge.js'

// ════════════════════════════════════════════════════════════════════════════
// ██  L1 — QUERY RISK CLASSIFIER
// ════════════════════════════════════════════════════════════════════════════

export const RISK = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' })

/**
 * أنماط تُشير إلى حقائق قابلة للتحقق — خطر هلوسة عالٍ
 * LLMs أكثر ما يُخطئون فيه: أرقام، تواريخ، أشخاص، مناصب، إحصاءات
 */
const HIGH_RISK_PATTERNS = [
  // أشخاص وسير ذاتية
  /(?:ولد|تاريخ ميلاد|مكان ميلاد|born|birthdate|naissance|né\s*à|né\s*le)/i,
  /(?:توفي|وفاة|مات|died|décédé|mort\s*le)/i,
  /(?:عمر|يبلغ من العمر|age[sd]?\s*\d)/i,
  // مناصب ووظائف
  /(?:يشغل|يتولى|منصب|وزير|رئيس|مدير|أمين|عضو|نائب|سفير)/i,
  /(?:minister|president|director|ambassador|secretary)/i,
  // رياضة — الأكثر عرضة للهلوسة
  /(?:يلعب في|ناد[يه]|ينتمي إلى|انتقل إلى|تعاقد مع|أُعير|صفقة)/i,
  /(?:plays?\s+for|signed?\s+(?:with|for)|transferred?\s+to|loan[ed]*\s+to)/i,
  /(?:المنتخب الوطني|تشكيلة|استدعاء|تصفيات)/i,
  // أرقام وإحصاءات
  /(?:رقم قياسي|إحصاء|إحصائية|statistics|record|ranking|ترتيب)/i,
  /(?:\d+\s*(?:هدف|مباراة|لقب|ميدالية|سنة|شهر|مليار|مليون|ألف))/i,
  /(?:كم عدد|كم مرة|كم هدف|how many|combien)/i,
  // تواريخ وأحداث تاريخية
  /(?:متى|في أي سنة|في عام|في سنة|since|year|année)/i,
  /(?:أسّس|تأسّس|أُنشئ|أُعلن|انتهت|بدأت|founded|established|created)/i,
  // أماكن جغرافية
  /(?:عاصمة|تقع في|يقع في|يتبع|located in|capital of|ville de)/i,
  // قانونية ورسمية
  /(?:قانون|مرسوم|قرار رقم|مادة\s+\d+|decree|law\s+n°|article\s+\d+)/i,
  // الجزائر تحديداً
  /(?:ولاية|بلدية|دائرة|wilaya|commune)/i,
]

/**
 * أنماط تُشير إلى مهام إبداعية / تحريرية — خطر هلوسة منخفض
 * (الـ LLM مُطلق اليد — لا حقائق حساسة)
 */
const LOW_RISK_PATTERNS = [
  /(?:اكتب|انشئ|ولّد|صمّم|ابتكر|write|create|generate|design|invent)/i,
  /(?:ترجم|لخّص|اشرح|explain|translate|summarize|describe)/i,
  /(?:رأيك|رأي|قم بـ|اقترح|انصحني|suggest|recommend|advise)/i,
  /(?:أنشئ لي|اعمل لي|ساعدني في كتابة|help me write)/i,
  /(?:قصيدة|قصة|خطبة|شعر|poem|story|essay|speech)/i,
  /(?:برمجة|كود|سكريبت|code|script|function|class)/i,
  /(?:مرحبا|صباح|مساء|كيف حالك|شكراً|hello|hi|thanks)/i,
]

/**
 * L1 — تصنيف درجة خطر الهلوسة في الاستعلام
 * @param {string} query
 * @returns {{ risk: 'HIGH'|'MEDIUM'|'LOW', triggers: string[] }}
 */
export function classifyQueryRisk(query = '') {
  if (!query) return { risk: RISK.LOW, triggers: [] }
  const q = query.trim()

  // أولاً: فحص الأنماط منخفضة الخطر
  if (LOW_RISK_PATTERNS.some(p => p.test(q))) {
    return { risk: RISK.LOW, triggers: ['creative-or-instructional'] }
  }

  // ثانياً: فحص الأنماط عالية الخطر
  const triggers = HIGH_RISK_PATTERNS
    .filter(p => p.test(q))
    .map(p => p.source.slice(0, 40))

  if (triggers.length > 0) {
    return { risk: RISK.HIGH, triggers }
  }

  // الأحداث التاريخية من verification-policy
  if (isHistoricalEventQuery(q)) {
    return { risk: RISK.HIGH, triggers: ['historical-event'] }
  }

  // الرياضة
  if (needsSportsVerification(q)) {
    return { risk: RISK.HIGH, triggers: ['sports-verification'] }
  }

  return { risk: RISK.MEDIUM, triggers: [] }
}

// ════════════════════════════════════════════════════════════════════════════
// ██  L2 — GROUNDING ENGINE
// ════════════════════════════════════════════════════════════════════════════

/**
 * L2 — جلب الحقائق الموثّقة من المصادر الموجودة
 *
 * المصادر بالترتيب:
 *   1. حقائق SPARQL الممرّرة من handler (أعلى ثقة)
 *   2. dz-knowledge — رؤساء الجزائر، الولايات، الأحداث الوهمية
 *   3. معطيات Wikipedia المُمرّرة (extract)
 *   4. نتائج SearXNG المُمرّرة
 *
 * @param {string} query — الاستعلام الأصلي
 * @param {{ facts?, sourceText?, sources?, wikidataId? }} existingContext — حقائق جُمعت مسبقاً
 * @returns {GroundingContext}
 */
export function buildGrounding(query = '', existingContext = {}) {
  const ctx = {
    query,
    facts: {},          // حقائق مُثبّتة — مرجع ذهبي
    sourceText: '',     // نص الحقيقة من المصدر
    sources: [],        // قائمة المصادر للاستشهاد
    confidence: 0,      // 0-100
    dzKnowledge: null,  // معرفة جزائرية محلية
    impossible: null,   // كيان وهمي معروف
  }

  // ── استخدام الحقائق الممرّرة من الـ handler ─────────────────────────────
  if (existingContext.facts && typeof existingContext.facts === 'object') {
    Object.assign(ctx.facts, existingContext.facts)
    ctx.confidence = Math.max(ctx.confidence, 90) // Wikidata SPARQL = ثقة عالية
  }

  if (existingContext.sourceText) {
    ctx.sourceText = existingContext.sourceText
    ctx.confidence = Math.max(ctx.confidence, 80)
  }

  if (Array.isArray(existingContext.sources)) {
    ctx.sources = existingContext.sources
  }

  // ── فحص dz-knowledge — قاعدة المعرفة الجزائرية الثابتة ─────────────────
  // رؤساء الجزائر — بحث بالاسم
  const normQ = query.replace(/\s+/g, ' ').trim().toLowerCase()
  const dzPres = DZ_PRESIDENTS.find(p =>
    normQ.includes(p.name.toLowerCase()) ||
    normQ.includes((p.name_fr || '').toLowerCase())
  )
  if (dzPres) {
    ctx.dzKnowledge = { type: 'president', data: dzPres }
    ctx.facts.name = dzPres.name
    ctx.facts.name_fr = dzPres.name_fr
    ctx.facts.startYear = String(dzPres.startYear)
    ctx.facts.endYear = dzPres.endYear ? String(dzPres.endYear) : 'الآن'
    ctx.confidence = Math.max(ctx.confidence, 95)
  }

  // استعلام سنة → جلب الرئيس/رئيس الحكومة
  const yearMatch = query.match(/\b(19\d{2}|20[012]\d)\b/)
  if (yearMatch && !dzPres) {
    const yr = parseInt(yearMatch[1])
    const presYear = getAlgeriaPresidentByYear(yr)
    if (presYear && !presYear.error) {
      ctx.dzKnowledge = ctx.dzKnowledge || { type: 'president_year', data: presYear }
      ctx.facts.name = presYear.name
      ctx.facts.startYear = String(presYear.startYear)
      ctx.facts.endYear = presYear.endYear ? String(presYear.endYear) : 'الآن'
      ctx.confidence = Math.max(ctx.confidence, 95)
    }
  }

  // الولايات الجزائرية الوهمية
  const unknownWilaya = isUnknownWilayaQuery(query)
  if (unknownWilaya) {
    ctx.dzKnowledge = { type: 'unknown_wilaya', data: unknownWilaya }
    ctx.impossible = `ولاية "${unknownWilaya}" غير موجودة في الجزائر`
    ctx.confidence = 0
  }

  // فحص الكيانات الوهمية
  const impossible = isImpossibleDZEntity(query)
  if (impossible) {
    ctx.impossible = impossible.response || impossible.correction || JSON.stringify(impossible)
    ctx.confidence = 0
  }

  return ctx
}

// ════════════════════════════════════════════════════════════════════════════
// ██  L3 — PROMPT HARDENER
// ════════════════════════════════════════════════════════════════════════════

/**
 * نظام HAL الأساسي — يُحقن في جميع استدعاءات LLM
 *
 * هذه القواعد إلزامية لكل إجابة بصرف النظر عن نوع الاستعلام
 */
export const HAL_CORE_RULES = `
╔══════════════════════════════════════════════════════════════╗
║  HAL — قواعد ضد الهلوسة — إلزامية بدون استثناء             ║
╚══════════════════════════════════════════════════════════════╝

▸ قاعدة الصدق (T1): لا تُقدّم أي معلومة لم تجدها حرفياً في السياق المُعطى.
▸ قاعدة الغياب (T2): إذا لم تجد المعلومة في المصدر → اكتب بدقة: "غير موجود في المصدر".
▸ قاعدة الأرقام (T3): الأرقام والتواريخ والإحصائيات من المصدر الممرّر فقط — لا من معرفتك الداخلية.
▸ قاعدة الأولوية (T4): عند تعارض المصدر الممرّر مع معرفتك الداخلية → المصدر له أولوية 100%.
▸ قاعدة الشك (T5): عند أدنى شك في صحة معلومة → أشر إلى عدم اليقين. لا تختلق.
▸ قاعدة النسب (T6): كل حقيقة يجب أن تُنسب إلى مصدرها (ويكيبيديا / Wikidata / الخبر...).
▸ قاعدة الرفض (T7): إذا طُلب منك تأكيد معلومة كاذبة → ارفض بوضوح، وصحّح من المصدر.
`.trim()

/**
 * بناء كتلة الحقائق المُثبّتة للحقن في الـ prompt
 * @param {GroundingContext} groundingCtx
 * @returns {string}
 */
function buildLockedFactsBlock(groundingCtx) {
  const entries = Object.entries(groundingCtx.facts || {}).filter(([_, v]) => v)
  if (entries.length === 0) return ''

  const labels = {
    birthDate:    'تاريخ الميلاد',
    birthPlace:   'مكان الميلاد',
    nationality:  'الجنسية',
    currentTeam:  'النادي / الفريق الحالي',
    occupation:   'المهنة / المنصب',
    name:         'الاسم الرسمي',
    name_fr:      'الاسم بالفرنسية',
    startYear:    'بداية الفترة',
    endYear:      'نهاية الفترة',
    deathDate:    'تاريخ الوفاة',
    deathPlace:   'مكان الوفاة',
    awards:       'الجوائز والألقاب',
  }

  const lines = entries.map(([k, v]) => `  ▸ ${labels[k] || k}: ${v}`)

  return `
╔══════════════════════════════════════════════════════╗
║  حقائق مُثبّتة من Wikidata SPARQL — لا تُعدّلها    ║
╚══════════════════════════════════════════════════════╝
${lines.join('\n')}

⚠️  إذا رأيت في النص المُترجَم أو المُعالَج أي تعارض مع هذه الحقائق، 
    استخدم الحقيقة المُثبّتة أعلاه وأشر إلى التصحيح.
`.trim()
}

/**
 * حقن prompt_system المصدر في رسائل المحادثة
 * @param {Array} messages — مصفوفة الرسائل [{ role, content }]
 * @param {string} injection — النص المراد حقنه
 * @returns {Array}
 */
function prependToSystemMessage(messages, injection) {
  if (!Array.isArray(messages) || !injection) return messages
  const idx = messages.findIndex(m => m.role === 'system')
  if (idx >= 0) {
    return messages.map((m, i) =>
      i === idx
        ? { ...m, content: `${injection}\n\n${m.content}` }
        : m
    )
  }
  // لا يوجد system message → أنشئ واحداً
  return [{ role: 'system', content: injection }, ...messages]
}

/**
 * L3 — حقن القواعد الصارمة + الحقائق المثبّتة في رسائل المحادثة
 *
 * يُطبَّق على جميع الاستعلامات (LOW/MEDIUM/HIGH)
 * HIGH risk: يُضاف أيضاً كتلة الحقائق المثبّتة
 *
 * @param {Array} messages
 * @param {GroundingContext} groundingCtx
 * @param {'HIGH'|'MEDIUM'|'LOW'} riskLevel
 * @returns {Array}
 */
export function hardenMessages(messages, groundingCtx = {}, riskLevel = RISK.MEDIUM) {
  let hardened = Array.isArray(messages) ? [...messages] : []

  // جميع الاستعلامات تحصل على قواعد HAL الأساسية
  hardened = prependToSystemMessage(hardened, HAL_CORE_RULES)

  // الاستعلامات عالية الخطر تحصل أيضاً على الحقائق المثبّتة
  if (riskLevel === RISK.HIGH) {
    const lockedFacts = buildLockedFactsBlock(groundingCtx)
    if (lockedFacts) {
      hardened = prependToSystemMessage(hardened, lockedFacts)
    }

    // إضافة السياق النصي من المصدر إذا كان متاحاً
    if (groundingCtx.sourceText && groundingCtx.sourceText.length > 50) {
      const contextBlock = `
[سياق موثوق من المصدر — استخدمه للإجابة]
${groundingCtx.sourceText.slice(0, 3000)}
[/سياق]
`.trim()
      hardened = prependToSystemMessage(hardened, contextBlock)
    }
  }

  return hardened
}

/**
 * نسخة سريعة من L3 — للحقن في safeGenerateAI مباشرة
 * تُحقن قواعد HAL الأساسية فقط بدون بحث إضافي
 */
export function injectHALSystemPrompt(messages) {
  return prependToSystemMessage(messages, HAL_CORE_RULES)
}

// ════════════════════════════════════════════════════════════════════════════
// ██  L4 — OUTPUT VALIDATOR
// ════════════════════════════════════════════════════════════════════════════

/**
 * استخراج الادعاءات القابلة للتحقق من النص
 * — تواريخ، أرقام، أسماء أماكن، كيانات
 */
function extractClaims(text = '') {
  const claims = { dates: [], numbers: [], cities: [], teams: [], names: [] }
  if (!text) return claims

  // تواريخ (YYYY أو DD/MM/YYYY أو YYYY-MM-DD)
  claims.dates = [...text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b|\bعام\s+(\d{4})\b|\bسنة\s+(\d{4})\b/g)]
    .map(m => m[0])

  // أرقام مهمة (> 2 رقم وليست سنة وليست ترتيب قائمة)
  claims.numbers = [...text.matchAll(/\b(\d{3,})\b/g)]
    .map(m => m[1])
    .filter(n => !/^(19|20)\d{2}$/.test(n)) // استثناء السنوات
    .slice(0, 20)

  // مدن جزائرية وعالمية شائعة
  const cityPatterns = /\b(الجزائر|وهران|قسنطينة|عنابة|سطيف|تلمسان|باتنة|بجاية|بسكرة|تيزي وزو|باريس|مدريد|لندن|روما|مانشستر|ليون|ميلان|ليفربول|برشلونة|Munich|Paris|London|Madrid|Rome|Barcelona|Manchester|Liverpool|Milan)\b/gi
  claims.cities = [...new Set([...text.matchAll(cityPatterns)].map(m => m[0].toLowerCase()))]

  // أندية رياضية شائعة
  const teamPatterns = /\b(ريال مدريد|برشلونة|مانشستر|ليفربول|يوفنتوس|PSG|المنتخب الوطني|الخضر|اتحاد الجزائر|مولودية|الشباب|Real Madrid|Barcelona|Manchester|Liverpool|Juventus|Arsenal|Chelsea|Bayern)\b/gi
  claims.teams = [...new Set([...text.matchAll(teamPatterns)].map(m => m[0]))]

  return claims
}

/**
 * حساب التداخل الدلالي (token overlap) بين النص والمصدر
 * مستوحى من lib/dz-v2/validator.js → relevance()
 */
function semanticOverlap(text, source) {
  if (!text || !source) return 0
  const tokenize = (s) => new Set(
    String(s).toLowerCase()
      .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 3)
  )
  const tTokens = tokenize(text)
  const sTokens = tokenize(source)
  if (!tTokens.size || !sTokens.size) return 0
  let hits = 0
  for (const t of tTokens) if (sTokens.has(t)) hits++
  return hits / Math.max(tTokens.size, 1)
}

/**
 * L4 — التحقق من مخرجات الـ LLM ضد الحقائق المثبّتة
 *
 * @param {string} output — نص الإجابة من الـ LLM
 * @param {GroundingContext} groundingCtx
 * @param {string} query
 * @returns {{ trustScore, mismatches, issues, reliable, overlap }}
 */
export function validateOutput(output = '', groundingCtx = {}, query = '') {
  const result = {
    trustScore: 100,
    mismatches: [],
    issues: [],
    reliable: true,
    overlap: 0,
  }

  if (!output) return { ...result, trustScore: 0, reliable: false }

  const lower = output.toLowerCase()

  // ── A. التحقق من الحقائق المثبّتة ──────────────────────────────────────
  const facts = groundingCtx.facts || {}

  // 1. تاريخ الميلاد
  if (facts.birthDate) {
    const year = facts.birthDate.slice(0, 4)
    const bdDates = output.match(/\b(19|20)\d{2}\b/g) || []
    if (bdDates.length > 0 && !bdDates.includes(year)) {
      const wrongYears = bdDates.filter(y => y !== year && Math.abs(+y - +year) > 2)
      if (wrongYears.length > 0) {
        result.mismatches.push({
          field: 'تاريخ الميلاد',
          expected: facts.birthDate,
          found: wrongYears[0],
          severity: 'HIGH',
        })
        result.trustScore -= 25
      }
    }
  }

  // 2. مكان الميلاد
  if (facts.birthPlace) {
    const birthCore = facts.birthPlace.split(/[,،]/)[0].trim().toLowerCase()
    const KNOWN_CITIES = [
      'وهران', 'oran', 'الجزائر', 'algiers', 'alger',
      'قسنطينة', 'constantine', 'عنابة', 'annaba',
      'تلمسان', 'tlemcen', 'سطيف', 'setif',
      'باريس', 'paris', 'لندن', 'london', 'مدريد', 'madrid',
      'روما', 'rome', 'مانشستر', 'manchester', 'ليون', 'lyon',
    ]
    for (const city of KNOWN_CITIES) {
      if (city === birthCore) continue
      if (lower.includes(city)) {
        // هل السياق يتحدث عن الميلاد؟
        const idx = lower.indexOf(city)
        const ctx = lower.slice(Math.max(0, idx - 40), idx + 40)
        if (/ولد|نشأ|مواليد|born|naissance|né|birthplace/i.test(ctx)) {
          result.mismatches.push({
            field: 'مكان الميلاد',
            expected: facts.birthPlace,
            found: city,
            severity: 'HIGH',
          })
          result.trustScore -= 20
          break
        }
      }
    }
  }

  // 3. النادي / الفريق الحالي
  if (facts.currentTeam) {
    const teamCore = facts.currentTeam.split(/\s+/).filter(w => w.length > 3)[0]?.toLowerCase()
    if (teamCore && !lower.includes(teamCore)) {
      // هل النص يذكر فريقاً آخر في سياق "يلعب في"؟
      const playingCtx = lower.match(/(?:يلعب في|ناد[يه]|plays? for|club|team)[^.،.]{0,60}/g) || []
      if (playingCtx.length > 0) {
        result.mismatches.push({
          field: 'النادي الحالي',
          expected: facts.currentTeam,
          found: playingCtx[0].slice(0, 50),
          severity: 'MEDIUM',
        })
        result.trustScore -= 15
      }
    }
  }

  // ── B. فحص الكيانات الوهمية الجزائرية ──────────────────────────────────
  if (groundingCtx.impossible) {
    result.issues.push({
      type: 'impossible_entity',
      message: `❌ الكيان الموصوف غير موجود: ${groundingCtx.impossible}`,
      severity: 'CRITICAL',
    })
    result.trustScore -= 50
  }

  // ── C. فحص الرؤساء الجزائريين ──────────────────────────────────────────
  if (groundingCtx.dzKnowledge?.type === 'president') {
    const pres = groundingCtx.dzKnowledge.data
    if (pres.startYear && !output.includes(String(pres.startYear))) {
      // لا خصم — فقط تحقق
    }
  }

  // ── D. فحص التداخل الدلالي مع المصدر ──────────────────────────────────
  if (groundingCtx.sourceText && groundingCtx.sourceText.length > 100) {
    result.overlap = semanticOverlap(output, groundingCtx.sourceText)
    // إذا كان التداخل منخفضاً جداً، يعني الـ LLM انحرف عن المصدر
    if (result.overlap < 0.05 && output.length > 200) {
      result.issues.push({
        type: 'low_source_overlap',
        message: `تداخل منخفض مع المصدر (${(result.overlap * 100).toFixed(1)}%)`,
        severity: 'MEDIUM',
      })
      result.trustScore -= 10
    }
  }

  // ── E. فحص Hallucination Markers شائعة ─────────────────────────────────
  const HALLUCINATION_MARKERS = [
    /وفقاً لمصادر موثوقة/i,      // LLM يختلق مصادر
    /بحسب تقارير/i,
    /كما أفادت المصادر/i,
    /يُقال إن|يُعتقد أن/i,
    /من المرجح أن|من المحتمل أن/i,
    /approximately|roughly|about|around\s+\d/i,
    /\[citation needed\]/i,
    /\[مصدر مطلوب\]/i,
  ]
  const markers = HALLUCINATION_MARKERS.filter(p => p.test(output))
  if (markers.length > 0) {
    result.issues.push({
      type: 'uncertainty_language',
      message: `النص يحتوي على لغة عدم اليقين (${markers.length} حالة)`,
      severity: 'LOW',
    })
    result.trustScore -= markers.length * 3
  }

  // ── F. فحص العبارات التي تُشير إلى "معرفة داخلية" ─────────────────────
  const INTERNAL_KNOWLEDGE_MARKERS = [
    /من معرفتي|حسب معرفتي|as far as I know|to my knowledge/i,
    /إلى حدّ علمي|في حدود ما أعلم/i,
    /قد لا تكون المعلومات محدّثة/i,
    /last updated|my training data/i,
  ]
  if (INTERNAL_KNOWLEDGE_MARKERS.some(p => p.test(output))) {
    result.issues.push({
      type: 'internal_knowledge_admitted',
      message: 'الـ LLM يعترف باستخدام معرفته الداخلية',
      severity: 'MEDIUM',
    })
    result.trustScore -= 15
  }

  // تطبيق الحد الأدنى والأقصى
  result.trustScore = Math.max(0, Math.min(100, result.trustScore))
  result.reliable = result.trustScore >= 70 && result.mismatches.length === 0

  return result
}

// ════════════════════════════════════════════════════════════════════════════
// ██  L5 — TRUST ENRICHER
// ════════════════════════════════════════════════════════════════════════════

/**
 * بناء شارة الثقة
 */
function buildTrustBadge(trustScore, mismatches = []) {
  if (trustScore >= 90) return `🟢 **موثوق** (${trustScore}%)`
  if (trustScore >= 70) return `🟡 **موثوق جزئياً** (${trustScore}%)`
  if (trustScore >= 50) return `🟠 **يحتاج تحقق** (${trustScore}%)`
  return `🔴 **منخفض الثقة** (${trustScore}%)`
}

/**
 * بناء كتلة Source Mismatch التحذيرية
 */
function buildMismatchBlock(mismatches, groundingCtx) {
  if (!mismatches || mismatches.length === 0) return ''

  const lines = [
    '',
    '---',
    '## ⚠️ Source Mismatch Detected — تعارض مع المصدر',
    '',
    'النص أعلاه قد يحتوي على معلومات تتعارض مع المصادر الموثّقة:',
    '',
  ]

  for (const mm of mismatches) {
    lines.push(`| الحقل | المصدر الموثوق | ما وجدناه في النص |`)
    lines.push(`|-------|---------------|-------------------|`)
    lines.push(`| **${mm.field}** | \`${mm.expected}\` | \`${mm.found || 'غير واضح'}\` |`)
    lines.push('')
  }

  lines.push('> 🔒 **المرجع الذهبي:** Wikidata SPARQL — أعلى مصدر ثقة في النظام.')
  lines.push('> ⚡ استخدم القيم المُثبّتة في الجدول أعلاه.')

  return lines.join('\n')
}

/**
 * بناء لوحة الحقائق SPARQL الموثّقة
 */
function buildFactsPanel(groundingCtx, wikidataId) {
  const facts = groundingCtx.facts || {}
  if (Object.keys(facts).length === 0 && !groundingCtx.dzKnowledge) return ''

  const parts = []
  if (facts.birthDate)   parts.push(`📅 **تاريخ الميلاد:** ${facts.birthDate}`)
  if (facts.birthPlace)  parts.push(`📍 **مكان الميلاد:** ${facts.birthPlace}`)
  if (facts.nationality) parts.push(`🏳️ **الجنسية:** ${facts.nationality}`)
  if (facts.currentTeam) parts.push(`⚽ **النادي/المنصب:** ${facts.currentTeam}`)
  if (facts.occupation)  parts.push(`💼 **المهنة:** ${facts.occupation}`)
  if (facts.startYear)   parts.push(`📆 **من:** ${facts.startYear}`)
  if (facts.endYear)     parts.push(`📆 **إلى:** ${facts.endYear}`)

  if (parts.length === 0) return ''

  const source = wikidataId
    ? `[Wikidata:${wikidataId}](https://www.wikidata.org/wiki/${wikidataId})`
    : 'Wikidata SPARQL'

  return `\n\n---\n### 🔬 حقائق ${source} (محققة)\n${parts.join(' · ')}`
}

/**
 * L5 — تحسين الإجابة بإضافة درجة الثقة والتحذيرات والمراجع
 *
 * @param {string} output — نص الإجابة الأصلية
 * @param {ValidationResult} validation — نتيجة L4
 * @param {GroundingContext} groundingCtx — سياق الحقائق من L2
 * @param {{ wikidataId?, showBadge?, addCitations?, sportsWarning? }} opts
 * @returns {string}
 */
export function enrichResponse(output = '', validation = {}, groundingCtx = {}, opts = {}) {
  let enriched = stripBibliography(output)
  if (!enriched) return output

  const {
    wikidataId = null,
    showBadge = true,
    addCitations = true,
    sportsWarning = false,
  } = opts

  // ── 1. حقن المصادر المُرقَّمة inline ─────────────────────────────────
  if (addCitations && Array.isArray(groundingCtx.sources) && groundingCtx.sources.length > 0) {
    const registry = buildCitations(groundingCtx.sources)
    if (registry.length > 0) {
      enriched = attachInlineCitations(enriched, registry)
    }
  }

  // ── 2. كتلة Source Mismatch (أعلى الإضافات) ───────────────────────────
  if (validation.mismatches && validation.mismatches.length > 0) {
    enriched += buildMismatchBlock(validation.mismatches, groundingCtx)
  }

  // ── 3. لوحة الحقائق الموثّقة ──────────────────────────────────────────
  enriched += buildFactsPanel(groundingCtx, wikidataId)

  // ── 4. تحذير الرياضة ──────────────────────────────────────────────────
  if (sportsWarning) {
    enriched += buildSportsVerificationBlock()
  }

  // ── 5. شارة الثقة ─────────────────────────────────────────────────────
  if (showBadge) {
    const badge = buildTrustBadge(validation.trustScore ?? 100, validation.mismatches)
    const sourceSummary = groundingCtx.sources?.length > 0
      ? ` · ${groundingCtx.sources.length} مصدر`
      : ''
    enriched += `\n\n---\n> ${badge}${sourceSummary}`
  }

  // ── 6. تحذير عدم اليقين عند الثقة المتوسطة ────────────────────────────
  if ((validation.trustScore ?? 100) < 80 && (validation.trustScore ?? 100) >= 50 && groundingCtx.confidence) {
    enriched += buildUncertaintyWarning(groundingCtx.confidence, groundingCtx.primarySource)
  }

  return enriched
}

// ════════════════════════════════════════════════════════════════════════════
// ██  FULL PIPELINE — halGuard()
// ════════════════════════════════════════════════════════════════════════════

/**
 * halGuard — تشغيل كامل Pipeline ضد الهلوسة
 *
 * يُنسّق جميع الطبقات الخمس في استدعاء واحد:
 *   L1 → تصنيف الخطر
 *   L2 → بناء سياق الحقائق
 *   L3 → تصليب الـ prompt
 *   generate() → استدعاء الـ LLM
 *   L4 → التحقق من المخرجات
 *   L5 → إثراء الإجابة
 *
 * @param {string} query — الاستعلام الأصلي
 * @param {Array} messages — رسائل المحادثة
 * @param {Function} generateFn — async(messages) → { content, model }
 * @param {{ existingContext?, wikidataId?, sportsWarning?, showBadge? }} opts
 * @returns {Promise<{ content: string, model: string, halMeta: object }>}
 */
export async function halGuard(query, messages, generateFn, opts = {}) {
  const t0 = Date.now()

  // L1 — تصنيف الخطر
  const { risk, triggers } = classifyQueryRisk(query)

  // L2 — بناء سياق الحقائق
  const groundingCtx = buildGrounding(query, opts.existingContext || {})

  // L3 — تصليب الـ prompt
  const hardenedMessages = hardenMessages(messages, groundingCtx, risk)

  // استدعاء الـ LLM بالـ prompt المُصلَّب
  let rawResult
  try {
    rawResult = await generateFn(hardenedMessages)
  } catch (err) {
    console.error('[HAL] generateFn threw:', err.message)
    rawResult = { content: null, model: null }
  }

  const rawContent = rawResult?.content || null

  // إذا لم يكن هناك مخرج — إرجاع No Source response عند خطر عالٍ
  if (!rawContent) {
    if (risk === RISK.HIGH && groundingCtx.confidence < 60) {
      return {
        content: buildNoSourceResponse(query),
        model: 'anti-hallucination:no-source',
        halMeta: { risk, trustScore: 0, mismatches: [], issues: [], ms: Date.now() - t0 },
      }
    }
    return { content: null, model: null, halMeta: { risk, trustScore: 0, ms: Date.now() - t0 } }
  }

  // L4 — التحقق من المخرجات
  const validation = validateOutput(rawContent, groundingCtx, query)

  // إذا كانت الثقة صفر (كيان وهمي) → رفض الإجابة
  if (groundingCtx.impossible) {
    return {
      content: buildNoSourceResponse(query),
      model: 'anti-hallucination:impossible-entity',
      halMeta: { risk, ...validation, ms: Date.now() - t0 },
    }
  }

  // L5 — إثراء الإجابة
  const enriched = enrichResponse(rawContent, validation, groundingCtx, {
    wikidataId: opts.wikidataId,
    showBadge: opts.showBadge !== false,
    addCitations: true,
    sportsWarning: opts.sportsWarning || needsSportsVerification(query),
  })

  const halMeta = {
    risk,
    triggers,
    trustScore: validation.trustScore,
    mismatches: validation.mismatches,
    issues: validation.issues,
    overlap: validation.overlap,
    groundingConfidence: groundingCtx.confidence,
    sources: groundingCtx.sources?.length || 0,
    ms: Date.now() - t0,
  }

  console.log(
    `[HAL] risk=${risk} trust=${validation.trustScore}% mismatches=${validation.mismatches.length} ` +
    `overlap=${(validation.overlap * 100).toFixed(1)}% ms=${halMeta.ms}`
  )

  return {
    content: enriched,
    model: rawResult.model,
    halMeta,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ██  UTILITY — استيراد سهل لـ server.js
// ════════════════════════════════════════════════════════════════════════════

/**
 * تقييم سريع لدرجة الثقة — لعرضها في metadata الاستجابة
 * @param {number} score 0-100
 * @returns {{ label, emoji, action }}
 */
export function quickTrustEval(score) {
  return applyConfidenceSystem(score)
}

export { buildCitations, attachInlineCitations, exportCitations } from '../citations.js'
