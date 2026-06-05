/**
 * lib/search-first-policy.js
 * DZ Agent — Search First Policy (سياسة البحث أولاً)
 *
 * Core Principle:
 *   Search → Verify → Answer (هذا الترتيب دائماً — لا عكسه أبداً)
 *   LLM ≠ مصدر حقيقة
 *   LLM = أداة تحليل وتلخيص المعلومات المُتحقَّق منها فقط
 *
 * Pipeline Steps (5 خطوات إلزامية):
 *   1. Query Sent          — إرسال الاستعلام
 *   2. Wikipedia Results   — نتائج البحث في ويكيبيديا
 *   3. Selected Article    — المقالة المختارة
 *   4. Content Length      — طول المحتوى المُستخرَج
 *   5. Final Answer        — الإجابة النهائية
 */

import { searchWikidata, fetchWikidataEntity, generateNameVariants, normalizeArabicName } from './wikidata.js'
import { searchPersonWikipedia, searchWikipedia, isPersonArticle } from './wikipedia.js'
import { searchWithSearXNG } from './search-decision-tree.js'

// ─── المواضيع التي يجب البحث عنها إلزامياً قبل الإجابة ───────────────────────
const MANDATORY_SEARCH_PATTERNS = [
  // أشخاص
  /لاعب|مهاجم|حارس|مدافع|وسط|رياضي|مدرب|footballer|player|striker|goalkeeper|defender|midfielder|coach/i,
  /سياسي|وزير|رئيس|وزراء|برلمان|نائب|أمين|سفير|والي|مسؤول|مدير|politician|minister|president|senator|governor/i,
  /فنان|ممثل|مطرب|مغني|شاعر|كاتب|روائي|أديب|ملحن|مخرج|actor|singer|musician|artist|writer|director/i,
  /شخصية تاريخية|أمير|شيخ|باي|داي|خليفة|قائد|جنرال|historical|leader|general|commander/i,
  // أحداث وحقائق
  /حدث تاريخي|ثورة|معركة|استقلال|انقلاب|مؤتمر|اتفاقية|revolution|battle|independence|conference|treaty/i,
  // أماكن وتنظيمات
  /نادي|فريق|منتخب|أندية|club|team|national team/i,
  /منظمة|مؤسسة|حزب|جمعية|organization|institution|party|association/i,
  // أخبار وإحصائيات
  /نتيجة|إحصائية|ترتيب|دوري|بطولة|كأس|score|ranking|championship|league|tournament/i,
]

// ─── قائمة الكيانات الشخصية الجزائرية المعروفة للتعريف السريع ──────────────
const KNOWN_DZ_ENTITIES = {
  'رياض محرز': { type: 'footballer', hint: 'رياض محرز لاعب كرة قدم جزائري' },
  'محرز': { type: 'footballer', hint: 'رياض محرز لاعب كرة قدم جزائري' },
  'إبراهيم مازة': { type: 'footballer', hint: 'إبراهيم مازة لاعب كرة قدم جزائري' },
  'مازة': { type: 'footballer', hint: 'إبراهيم مازة لاعب كرة قدم جزائري' },
  'ياسين وليد': { type: 'person', hint: 'ياسين وليد شخصية جزائرية' },
  'عبد المجيد تبون': { type: 'president', hint: 'عبد المجيد تبون رئيس الجمهورية الجزائرية' },
  'تبون': { type: 'president', hint: 'عبد المجيد تبون رئيس الجزائر' },
}

/**
 * هل يجب البحث إلزامياً قبل الإجابة؟
 */
export function isMandatorySearchQuery(query) {
  if (!query || query.length < 3) return false
  return MANDATORY_SEARCH_PATTERNS.some(p => p.test(query))
}

/**
 * تنظيف الاستعلام — إزالة أدوات السؤال وإبقاء الاسم/الموضوع
 */
export function cleanSearchQuery(query) {
  return (query || '')
    .replace(/^(?:من\s+هو|من\s+هي|شكون\s+هو|شكون\s+هي|من\s+هم|حدثني\s+عن|أخبرني\s+عن|اخبرني\s+عن|معلومات\s+عن|ابحث\s+عن|بحث\s+عن|واش\s+تعرف\s+عن|كي\s+داير)\s+/i, '')
    .replace(/\?$/, '')
    .trim()
}

/**
 * Pipeline Step Logger — يطبع خطوات البحث بشكل واضح
 */
export function createPipelineLogger(tag = 'SearchFirst') {
  const steps = []
  const start = Date.now()

  return {
    step(n, name, data = null) {
      const elapsed = Date.now() - start
      const entry = { step: n, name, data, elapsed }
      steps.push(entry)
      const dataStr = data
        ? (typeof data === 'string' ? data.slice(0, 120) : JSON.stringify(data).slice(0, 120))
        : '—'
      console.log(`[${tag}] Step ${n}: ${name} — ${dataStr} (+${elapsed}ms)`)
      return entry
    },
    getSteps() { return steps },
    elapsed() { return Date.now() - start },
  }
}

/**
 * searchFirstPipeline — خط أنابيب البحث الكامل بالخطوات الخمس
 *
 * الخطوات:
 *   1. Query Sent          — تسجيل الاستعلام
 *   2. Wikipedia Results   — نتائج ويكيبيديا
 *   3. Selected Article    — المقالة المختارة
 *   4. Content Length      — طول المحتوى
 *   5. Final Answer        — بناء الإجابة
 *
 * @param {string} query - استعلام المستخدم
 * @param {object} opts
 *   @param {boolean} opts.verbose - طباعة تفاصيل كاملة
 *   @param {boolean} opts.withWikidata - تفعيل Wikidata (افتراضي: true)
 *   @param {boolean} opts.withSearXNG  - تفعيل SearXNG عند فشل الباقي (افتراضي: true)
 *
 * @returns {Promise<{
 *   pipeline: object[],
 *   result: object|null,
 *   source: string,
 *   confidence: number,
 *   elapsed: number,
 * }>}
 */
export async function searchFirstPipeline(query, {
  verbose = false,
  withWikidata = true,
  withSearXNG = true,
} = {}) {
  const log = createPipelineLogger('SearchFirst')
  const cleanQ = cleanSearchQuery(query)

  // ── Step 1: Query Sent ─────────────────────────────────────────────────────
  log.step(1, 'Query Sent', { original: query, cleaned: cleanQ })

  let wikidataResult = null
  let wikipediaResult = null
  let searxResult = null
  let confidence = 0
  let source = 'none'

  // ── Step 2: Wikipedia Search Results ──────────────────────────────────────
  const wikiSearchStart = Date.now()
  let wikiSearchResults = []

  try {
    // نجري بحثاً موازياً: Wikidata + Wikipedia في نفس الوقت
    // لـ Wikidata نجرّب أشكالاً متعددة للاسم (مهم للأسماء الطويلة كـ عبد المجيد تبون)
    const variants = withWikidata ? generateNameVariants(cleanQ) : []

    // بناء قائمة استعلامات Wikidata: الاسم الأصلي + أشكال بديلة + الكلمة الأخيرة (اسم العائلة)
    const lastWord = cleanQ.split(/\s+/).filter(w => w.length > 2).pop() || cleanQ
    const wdQueries = withWikidata
      ? [...new Set([cleanQ, ...variants.slice(0, 2), lastWord])].slice(0, 4)
      : []

    // جلب Wikidata بشكل متوازي — أسرع بكثير من المتسلسل
    if (withWikidata) {
      const wdSettled = await Promise.allSettled(
        wdQueries.map(q => searchWikidata(q, 'ar').catch(() => null))
      )
      const wdResults = wdSettled
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value)
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))

      wikidataResult = wdResults[0] || null

      // fallback: بحث إنجليزي موازٍ إذا لم نجد شيئاً بالعربية
      if (!wikidataResult) {
        try {
          const [enWd1, enWd2] = await Promise.allSettled([
            searchWikidata(cleanQ, 'en').catch(() => null),
            searchWikidata(lastWord, 'en').catch(() => null),
          ])
          const enR1 = enWd1.status === 'fulfilled' ? enWd1.value : null
          const enR2 = enWd2.status === 'fulfilled' ? enWd2.value : null
          wikidataResult = (enR1?.confidence || 0) >= (enR2?.confidence || 0) ? enR1 : enR2
        } catch { /* تجاهل */ }
      }
    }

    // Wikipedia موازية مع الاسم الأصلي + الكلمة الأخيرة كـ fallback
    const [wikiRes1, wikiRes2] = await Promise.allSettled([
      searchPersonWikipedia(cleanQ).catch(() => null),
      lastWord !== cleanQ
        ? searchPersonWikipedia(lastWord).catch(() => null)
        : Promise.resolve(null),
    ])
    const wp1 = wikiRes1.status === 'fulfilled' ? wikiRes1.value : null
    const wp2 = wikiRes2.status === 'fulfilled' ? wikiRes2.value : null
    // اختر أفضل نتيجة Wikipedia
    if (wp1?.extract) wikipediaResult = wp1
    else if (wp2?.extract) wikipediaResult = wp2

    wikiSearchResults = [
      wikidataResult ? { source: 'Wikidata', label: wikidataResult.label, confidence: wikidataResult.confidence } : null,
      wikipediaResult ? { source: 'Wikipedia', title: wikipediaResult.title, lang: wikipediaResult.lang } : null,
    ].filter(Boolean)

  } catch (err) {
    console.warn('[SearchFirst] Step 2 error:', err.message)
  }

  log.step(2, 'Wikipedia Search Results', {
    wikidata: wikidataResult ? `${wikidataResult.label} (${wikidataResult.confidence}%)` : 'لا نتيجة',
    wikipedia: wikipediaResult ? `${wikipediaResult.title} [${wikipediaResult.lang}]` : 'لا نتيجة',
    elapsed_ms: Date.now() - wikiSearchStart,
  })

  // ── Step 3: Selected Article ───────────────────────────────────────────────
  let selectedArticle = null
  let selectedSource = 'none'

  // اختيار الأفضل: Wikidata بثقة عالية → Wikipedia → SearXNG
  if (wikidataResult && wikidataResult.confidence >= 75) {
    selectedArticle = wikidataResult
    selectedSource = 'wikidata'
    confidence = wikidataResult.confidence
  } else if (wikipediaResult?.extract) {
    selectedArticle = wikipediaResult
    selectedSource = 'wikipedia'
    confidence = wikipediaResult.lang === 'ar' ? 85 : 75
  } else if (wikidataResult) {
    selectedArticle = wikidataResult
    selectedSource = 'wikidata'
    confidence = wikidataResult.confidence || 60
  }

  log.step(3, 'Selected Article', {
    source: selectedSource,
    title: selectedArticle?.title || selectedArticle?.label || 'لا شيء',
    confidence: `${confidence}%`,
  })

  // ── Step 4: Extracted Content Length ──────────────────────────────────────
  let extractedContent = null
  let contentLength = 0

  if (selectedSource === 'wikipedia' && wikipediaResult?.extract) {
    extractedContent = wikipediaResult.extract
    contentLength = extractedContent.length
  } else if (selectedSource === 'wikidata') {
    // محاولة جلب مقالة Wikipedia المرتبطة بـ Wikidata
    if (!wikipediaResult?.extract) {
      try {
        const wdExtra = await searchPersonWikipedia(cleanQ)
        if (wdExtra?.extract) {
          wikipediaResult = wdExtra
          extractedContent = wdExtra.extract
          contentLength = extractedContent.length
        }
      } catch { /* تجاهل */ }
    } else {
      extractedContent = wikipediaResult.extract
      contentLength = extractedContent.length
    }
    // إضافة وصف Wikidata
    if (!extractedContent && selectedArticle?.description) {
      extractedContent = selectedArticle.description
      contentLength = extractedContent.length
    }
  }

  // إذا لا يزال لا يوجد محتوى → SearXNG مع فلترة ذكية
  if (!extractedContent && withSearXNG) {
    try {
      const searxResults = await searchWithSearXNG(`${cleanQ} الجزائر سيرة ذاتية`, {
        categories: 'general',
        language: 'ar',
        maxResults: 8,
      })

      if (searxResults.length > 0) {
        // فلترة: نحتفظ فقط بنتائج تذكر الاسم في العنوان أو المقتطف
        const nameWords = cleanQ.split(/\s+/).filter(w => w.length > 2)
        const relevantResults = searxResults.filter(r => {
          const text = `${r.title || ''} ${r.snippet || ''}`.toLowerCase()
          return nameWords.some(w => text.includes(w.toLowerCase()))
        })

        const usableResults = relevantResults.length > 0 ? relevantResults : []

        if (usableResults.length > 0) {
          searxResult = usableResults
          extractedContent = usableResults
            .filter(r => r.snippet?.length > 30)
            .slice(0, 5)
            .map(r => `• **${r.title}**: ${r.snippet}`)
            .join('\n')
          contentLength = extractedContent.length
          if (!selectedArticle && contentLength > 50) {
            selectedSource = 'searxng'
            confidence = 60
          }
        }
      }
    } catch { /* تجاهل */ }
  }

  log.step(4, 'Extracted Content Length', {
    chars: contentLength,
    source: selectedSource,
    has_content: contentLength > 0,
  })

  // ── Step 5: Final Answer ───────────────────────────────────────────────────
  let finalAnswer = null
  let answerModel = 'search-first'

  if (!extractedContent && !selectedArticle) {
    finalAnswer = {
      type: 'not_found',
      message: `⚠️ لم أجد معلومات موثوقة كافية للإجابة عن "${cleanQ}".\n\nبحثت في: Wikidata · ويكيبيديا العربية · ويكيبيديا الإنجليزية${withSearXNG ? ' · SearXNG' : ''}\n\n> 🛡️ مبدأ DZ Agent: لا تخمين، لا اختلاق — إجابة موثقة أفضل من إجابة سريعة.`,
      confidence: 0,
    }
    answerModel = 'no-source'
  } else if (selectedSource === 'wikidata' && !extractedContent) {
    finalAnswer = {
      type: 'wikidata_only',
      title: selectedArticle.label,
      description: selectedArticle.description || '',
      url: selectedArticle.url,
      confidence,
    }
    answerModel = 'wikidata-direct'
  } else {
    finalAnswer = {
      type: 'full',
      title: wikipediaResult?.title || selectedArticle?.label || cleanQ,
      description: wikipediaResult?.description || selectedArticle?.description || '',
      extract: extractedContent,
      url: wikipediaResult?.url || selectedArticle?.url || null,
      thumbnail: wikipediaResult?.thumbnail || null,
      wikidata_url: wikidataResult?.url || null,
      confidence,
      source: selectedSource,
    }
    answerModel = `${selectedSource}-verified`
  }

  source = selectedSource

  log.step(5, 'Final Answer', {
    type: finalAnswer.type,
    title: finalAnswer.title || '—',
    confidence: `${confidence}%`,
    model: answerModel,
  })

  return {
    pipeline: log.getSteps(),
    result: finalAnswer,
    source,
    confidence,
    elapsed: log.elapsed(),
    _raw: {
      wikidata: wikidataResult,
      wikipedia: wikipediaResult,
      searxng: searxResult,
      extractedContent,
      contentLength,
    },
  }
}

/**
 * formatPipelineTrace — تنسيق خطوات البحث للعرض (debug/trace mode)
 */
export function formatPipelineTrace(pipelineSteps, query) {
  const lines = [
    `## 🔍 تتبع خط أنابيب البحث`,
    `**الاستعلام:** \`${query}\``,
    ``,
    `| الخطوة | الاسم | التفاصيل | الوقت |`,
    `|--------|-------|---------|-------|`,
  ]

  for (const step of pipelineSteps) {
    const details = step.data
      ? (typeof step.data === 'string' ? step.data : Object.entries(step.data).map(([k, v]) => `${k}: ${v}`).join(', '))
      : '—'
    lines.push(`| **${step.step}** | ${step.name} | ${details.slice(0, 100)} | +${step.elapsed}ms |`)
  }

  return lines.join('\n')
}

/**
 * buildSearchFirstResponse — بناء الإجابة النهائية من نتيجة pipeline
 */
export function buildSearchFirstResponse(pipelineResult, originalQuery) {
  const { result, pipeline, source, confidence, elapsed } = pipelineResult

  if (!result || result.type === 'not_found') {
    return {
      content: result?.message || `⚠️ لم أجد معلومات موثوقة عن "${originalQuery}".`,
      model: 'no-source',
      pipeline,
    }
  }

  const confLabel = confidence >= 95 ? '🟢' : confidence >= 80 ? '🟡' : confidence >= 60 ? '🟠' : '🔴'
  const sourceLabel = {
    wikidata: 'Wikidata',
    wikipedia: `ويكيبيديا ${result.lang === 'fr' ? 'الفرنسية' : result.lang === 'en' ? 'الإنجليزية' : 'العربية'}`,
    searxng: 'SearXNG',
    'wikidata+wikipedia': 'Wikidata + ويكيبيديا',
  }[source] || source

  if (result.type === 'wikidata_only') {
    const lines = [
      `## 📖 ${result.title}`,
      result.description ? `*${result.description}*` : '',
      ``,
      `> 🔒 *معلومات مستخرجة من Wikidata — مصدر موثوق.*`,
      ``,
      `---`,
      `📚 **المصدر:** [Wikidata](${result.url}) | 🎯 **الثقة:** ${confLabel} ${confidence}%`,
    ].filter(l => l !== '')
    return { content: lines.join('\n'), model: 'wikidata-direct', pipeline }
  }

  const lines = [
    `## 📖 ${result.title}`,
    result.description ? `*${result.description}*` : '',
    ``,
    `> 🔒 *المعلومات التالية مستخرجة من مصادر موثوقة — لا إضافات، لا تخمينات.*`,
    ``,
    result.extract || '',
    ``,
    `---`,
    [
      result.url ? `📚 **المصدر:** [${sourceLabel}](${result.url})` : `📚 **المصدر:** ${sourceLabel}`,
      result.wikidata_url ? `| [Wikidata](${result.wikidata_url})` : '',
      `| 🎯 **الثقة:** ${confLabel} ${confidence}%`,
      `| ⏱️ ${elapsed}ms`,
    ].filter(Boolean).join(' '),
  ].filter(l => l !== '')

  return {
    content: lines.join('\n'),
    model: `${source}-verified`,
    pipeline,
    _meta: { source, confidence, elapsed, contentLength: pipelineResult._raw?.contentLength || 0 },
  }
}
