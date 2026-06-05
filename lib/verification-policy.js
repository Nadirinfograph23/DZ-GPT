/**
 * lib/verification-policy.js
 * DZ Agent — Public Figures & Historical Events Verification Policy
 *
 * سياسة التحقق الإلزامية للشخصيات العامة والأحداث التاريخية
 *
 * ترتيب المصادر الموثوقة:
 *   1. Wikidata       — أولوية قصوى
 *   2. Wikipedia AR   — الثاني
 *   3. Wikipedia EN   — الثالث
 *   4. DBpedia        — الرابع
 *   5. بحث حي        — الأخير
 *
 * نظام الثقة:
 *   ≥ 95% → أجب مباشرةً
 *   80-94% → أجب مع ذكر عدم اليقين
 *   60-79% → اطلب توضيحاً
 *   < 60%  → ارفض التخمين
 */

import { searchWikidata, generateNameVariants, normalizeArabicName } from './wikidata.js'
import { searchPersonWikipedia } from './wikipedia.js'

// ─── كشف الأحداث التاريخية ────────────────────────────────────────────────────
const HISTORICAL_EVENT_PATTERNS = [
  /(?:حرب|معركة|ثورة|انقلاب|اتفاقية|مؤتمر|احتجاج|انتفاضة|مظاهرة|حادثة|كارثة|زلزال|فيضان)\s+\S+/i,
  /(?:war|battle|revolution|coup|treaty|conference|protest|uprising|incident|disaster|earthquake)\s+\S+/i,
  /(?:guerre|bataille|révolution|coup|traité|conférence|manifestation|soulèvement)\s+\S+/i,
  /(?:متى|كان|وقع|جرى|حدث|تأسس|استقل|انتهى|بدأ)\s+.{5,}/i,
  /(?:تاريخ|في سنة|عام\s+\d{3,4}|سنة\s+\d{3,4}|\d{4}م|هجري)/i,
]

// ─── كشف الاستعلامات الرياضية التي تحتاج تحققاً ──────────────────────────────
const SPORTS_VERIFICATION_PATTERNS = [
  /(?:يلعب في|ناد[يه]|ينتمي إلى|انتقل|تعاقد|رحل|وقّع مع|نقل|عارية)/i,
  /(?:plays? for|club|team|signed|transferred|contract|loan)/i,
  /(?:المنتخب الوطني|تشكيلة|استدعاء|صعود|هبوط|الموسم الحالي)/i,
  /(?:national team|squad|call-up|promotion|relegation|current season)/i,
  /(?:برنامج|جدول|مواعيد|مباريات قادمة|رزنامة)/i,
]

// ─── أنماط الأشخاص الغامضين — يحتاجون توضيحاً ───────────────────────────────
const AMBIGUOUS_ENTITY_PATTERNS = [
  { pattern: /^ياسين\s*$/i,         question: 'هل تقصد:', options: ['محمود ياسين', 'ياسين بونو', 'ياسين عدلي', 'ياسين براهيمي', 'شخصية أخرى؟'] },
  { pattern: /^محمد\s*$/i,           question: 'هل تقصد:', options: ['محمد صلاح', 'محمد علي', 'محمد الخامس', 'شخصية أخرى؟'] },
  { pattern: /^محرز\s*$/i,           question: 'هل تقصد رياض محرز لاعب كرة القدم؟', options: ['نعم، رياض محرز', 'لا، أعني شخصاً آخر'] },
  { pattern: /^الرئيس السابق\s*$/i,  question: 'رئيس أي دولة؟', options: ['الجزائر', 'مصر', 'تونس', 'المغرب', 'دولة أخرى'] },
  { pattern: /^الأهلي\s*$/i,         question: 'هل تقصد:', options: ['الأهلي المصري', 'الأهلي السعودي', 'الأهلي الجزائري', 'نادٍ آخر'] },
  { pattern: /^الاتحاد\s*$/i,        question: 'هل تقصد:', options: ['اتحاد جدة السعودي', 'اتحاد العاصمة الجزائري', 'نادٍ آخر'] },
  { pattern: /^المدرب\s*$/i,         question: 'مدرب أي فريق؟', options: ['المنتخب الجزائري', 'فريق محلي', 'فريق أوروبي'] },
  { pattern: /^اللاعب\s*$/i,         question: 'أي لاعب؟', options: ['حدد الاسم أو الفريق'] },
  { pattern: /^الفريق\s*$/i,         question: 'أي فريق؟', options: ['حدد اسم الفريق أو البطولة'] },
]

/**
 * كشف هل الاستعلام عن حدث تاريخي
 */
export function isHistoricalEventQuery(message) {
  if (!message || message.length < 5) return false
  return HISTORICAL_EVENT_PATTERNS.some(p => p.test(message))
}

/**
 * كشف هل الاستعلام يحتاج تحققاً رياضياً
 */
export function needsSportsVerification(message) {
  if (!message || message.length < 5) return false
  return SPORTS_VERIFICATION_PATTERNS.some(p => p.test(message))
}

/**
 * كشف الكيانات الغامضة — تحتاج توضيحاً قبل الإجابة
 */
export function detectAmbiguousEntity(message) {
  const msg = (message || '').trim()
  if (!msg || msg.length < 2) return null

  for (const entry of AMBIGUOUS_ENTITY_PATTERNS) {
    if (entry.pattern.test(msg)) {
      return {
        needsClarification: true,
        question: entry.question,
        options: entry.options,
      }
    }
  }
  return null
}

/**
 * تطبيق نظام الثقة — يُحدد نوع الإجابة المطلوبة
 *
 * ≥ 95% → 'direct'       — أجب مباشرةً
 * 80-94% → 'uncertain'   — أجب مع إشارة عدم اليقين
 * 60-79% → 'clarify'     — اطلب توضيحاً
 * < 60%  → 'refuse'      — ارفض التخمين
 */
export function applyConfidenceSystem(confidence) {
  if (confidence >= 95) return { action: 'direct',   label: '🟢', pct: confidence }
  if (confidence >= 80) return { action: 'uncertain', label: '🟡', pct: confidence }
  if (confidence >= 60) return { action: 'clarify',  label: '🟠', pct: confidence }
  return { action: 'refuse', label: '🔴', pct: confidence }
}

/**
 * البحث في Wikidata أولاً ثم Wikipedia — سلسلة التحقق الكاملة
 * يُرجع:  { found, result, source, confidence, action }
 */
export async function runVerificationChain(query) {
  const variants = generateNameVariants(query)
  let bestResult = null
  let bestConfidence = 0

  // ── 1. Wikidata — الأولوية القصوى ────────────────────────────────────────
  for (const variant of variants.slice(0, 3)) {
    try {
      const wdResult = await searchWikidata(variant, 'ar')
      if (wdResult && wdResult.confidence > bestConfidence) {
        bestResult = { ...wdResult, source: 'wikidata' }
        bestConfidence = wdResult.confidence
        if (bestConfidence >= 95) break
      }
    } catch { /* fail silently */ }
  }

  // ── 2. Wikipedia AR — إذا Wikidata لم يعطِ ثقة كافية ────────────────────
  if (bestConfidence < 80) {
    try {
      const wikiAR = await searchPersonWikipedia(query)
      if (wikiAR?.extract) {
        const conf = wikiAR.lang === 'ar' ? 85 : 75
        if (conf > bestConfidence) {
          bestResult = { ...wikiAR, source: 'wikipedia-ar', confidence: conf }
          bestConfidence = conf
        }
      }
    } catch { /* fail silently */ }
  }

  // ── 3. Wikipedia EN — fallback إضافي ─────────────────────────────────────
  if (bestConfidence < 70) {
    try {
      const wikiEN = await searchPersonWikipedia(normalizeArabicName(query))
      if (wikiEN?.extract) {
        const conf = 72
        if (conf > bestConfidence) {
          bestResult = { ...wikiEN, source: 'wikipedia-en', confidence: conf }
          bestConfidence = conf
        }
      }
    } catch { /* fail silently */ }
  }

  const confidenceSystem = applyConfidenceSystem(bestConfidence)

  return {
    found: !!bestResult && bestConfidence >= 60,
    result: bestResult,
    source: bestResult?.source || null,
    confidence: bestConfidence,
    action: confidenceSystem.action,
    label: confidenceSystem.label,
  }
}

/**
 * بناء رسالة الرفض الموحدة عند عدم وجود مصدر موثوق
 */
export function buildNoSourceResponse(query) {
  return [
    `⚠️ لم أجد معلومات موثوقة كافية للإجابة على هذا السؤال.`,
    ``,
    `بحثت في: **Wikidata** · **ويكيبيديا العربية** · **ويكيبيديا الإنجليزية**`,
    ``,
    `لم تُؤكد أي من هذه المصادر المعلومة المطلوبة عن: **${query}**`,
    ``,
    `🔍 يمكنك البحث مباشرة على:`,
    `- [ويكيبيديا العربية](https://ar.wikipedia.org/w/index.php?search=${encodeURIComponent(query)})`,
    `- [Wikidata](https://www.wikidata.org/w/index.php?search=${encodeURIComponent(query)})`,
    `- [DBpedia](https://dbpedia.org/search/?query=${encodeURIComponent(query)}&format=html)`,
    ``,
    `> 🛡️ مبدأ DZ Agent: إجابة موثقة أفضل من إجابة سريعة — لا تخمين، لا اختلاق.`,
  ].join('\n')
}

/**
 * بناء رسالة طلب التوضيح عند الغموض
 */
export function buildClarificationResponse(ambiguity) {
  const lines = [
    `🤔 **${ambiguity.question}**`,
    ``,
    ...ambiguity.options.map((opt, i) => `**${i + 1}.** ${opt}`),
    ``,
    `> اكتب رقماً أو أضف تفاصيل أكثر للمتابعة.`,
  ]
  return lines.join('\n')
}

/**
 * بناء تحذير عدم اليقين عند الثقة المتوسطة (80-94%)
 */
export function buildUncertaintyWarning(confidence, source) {
  const sourceLabel = {
    'wikidata': 'Wikidata',
    'wikipedia-ar': 'ويكيبيديا العربية',
    'wikipedia-en': 'ويكيبيديا الإنجليزية',
    'dbpedia': 'DBpedia',
  }[source] || 'مصادر متاحة'

  return `\n\n> ⚠️ **درجة الثقة: ${confidence}%** — المعلومات مستخرجة من ${sourceLabel}. قد تكون بعض التفاصيل الحساسة (النادي الحالي، المنصب، الإحصائيات الأخيرة) غير محدّثة. تحقق من المصدر الأصلي للتأكيد.`
}

/**
 * بناء تحذير التحقق الرياضي
 */
export function buildSportsVerificationBlock() {
  return [
    ``,
    `> ⏰ **تحذير التحقق الرياضي:** المعلومات التالية تحتاج تحققاً من مصادر حية:`,
    `> - 🏟️ النادي الحالي للاعب → [Transfermarkt](https://www.transfermarkt.com) | [SofaScore](https://www.sofascore.com)`,
    `> - 🌍 المنتخب الوطني والاستدعاءات → [FAF](https://faf.dz) | [FIFA](https://fifa.com)`,
    `> - 📅 مواعيد المباريات والنتائج → [LiveScore](https://www.livescore.com) | [FlashScore](https://www.flashscore.com)`,
    `> - 📊 إحصائيات الموسم الحالي → [FBref](https://fbref.com) | [WhoScored](https://whoscored.com)`,
  ].join('\n')
}
