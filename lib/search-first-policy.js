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
import { searchPersonWikipedia, searchPersonWikipediaLang, searchWikipedia, isPersonArticle, fetchWikipediaByTitle } from './wikipedia.js'
import { searchWithSearXNG } from './search-decision-tree.js'

// ─── جدول التحويل العربي → لاتيني (أسلوب جزائري) ─────────────────────────────
const _AR_TO_LATIN = {
  'ب':'b','ت':'t','ث':'th','ج':'dj','ح':'h','خ':'kh','د':'d','ذ':'dh',
  'ر':'r','ز':'z','س':'s','ش':'ch','ص':'s','ض':'d','ط':'t','ظ':'dh',
  'ع':'','غ':'gh','ف':'f','ق':'k','ك':'k','ل':'l','م':'m','ن':'n',
  'ه':'h','و':'ou','ي':'i','ى':'i','ة':'a','ا':'a','أ':'a','إ':'i',
  'آ':'a','ء':'','\u0651':'',
}
const _AR_FIRST_NAMES = {
  'ابراهيم':'Ibrahim','إبراهيم':'Ibrahim','محمد':'Mohamed','احمد':'Ahmed',
  'أحمد':'Ahmed','خالد':'Khaled','رياض':'Riyad','ياسين':'Yassine',
  'عمر':'Omar','يوسف':'Youcef','علي':'Ali','عبد الله':'Abdallah',
  'عبد الرحمن':'Abderrahmane','عبد الحميد':'Abdelhamid',
  'عبد المالك':'Abdelmalek','عبد العزيز':'Abdelaziz',
  'عبد الرحيم':'Abderrahim','عبد الكريم':'Abdelkrim',
  'عبد القادر':'Abdelkader','عبد المجيد':'Abdelmadjid',
  'حسان':'Hassan','حسن':'Hassan','حسين':'Hocine','بلقاسم':'Belkacem',
  'نبيل':'Nabil','كريم':'Karim','سليم':'Slim','مراد':'Mourad',
  'لخضر':'Lakhdar','فارس':'Fares','منير':'Mounir','أنيس':'Anis',
  'صلاح':'Salah','سفيان':'Sofiane','رمضان':'Ramdane','وليد':'Walid',
  'زين الدين':'Zinedine','زيدان':'Zidane','عيسى':'Issa','موسى':'Moussa',
  'ادم':'Adam','آدم':'Adam','نور الدين':'Noureddine','ملك':'Malik',
}
const _AR_LAST_NAMES = {
  'محرز':'Mahrez','مازا':'Maza','مازة':'Maza','مزة':'Maza',
  'تبون':'Tebboune','بوتفليقة':'Bouteflika','غوال':'Ghoul',
  'فيغولي':'Feghouli','بلايلي':'Belaili','سليماني':'Slimani',
  'بنعمر':'Benamar','مبولحي':'M\'Bolhi','زيدان':'Zidane',
  'بن يحيى':'Benyahia','بن زيمة':'Benzeema','أيت':'Ait','بن':'Ben',
  'بوعمامة':'Bouamama','قصص':'Kessas','بلهوشات':'Belhouchat',
  'بوكوش':'Bouokaz','دلاي':'Delaye','بن بادي':'Ben Badis',
}

/**
 * transliterateAlgerianName — تحويل الاسم العربي الجزائري إلى لاتيني للبحث
 * يُستخدم كـ fallback عند فشل البحث العربي في الويكيبيديا الإنجليزية/الفرنسية
 */
export function transliterateAlgerianName(arabicName) {
  if (!arabicName || typeof arabicName !== 'string') return null
  const words = arabicName.trim().split(/\s+/)
  const mapped = []

  for (const word of words) {
    if (_AR_FIRST_NAMES[word]) { mapped.push(_AR_FIRST_NAMES[word]); continue }
    if (_AR_LAST_NAMES[word])  { mapped.push(_AR_LAST_NAMES[word]);  continue }
    // حرف حرف
    let result = ''
    for (const ch of word) {
      const lat = _AR_TO_LATIN[ch]
      result += (lat !== undefined) ? lat : (/[\u0600-\u06FF]/.test(ch) ? '' : ch)
    }
    const cap = result ? result.charAt(0).toUpperCase() + result.slice(1) : ''
    if (cap) mapped.push(cap)
  }

  const latin = mapped.join(' ').replace(/\s+/g, ' ').trim()
  if (!latin || !/[a-zA-Z]{2}/.test(latin)) return null
  if (latin === arabicName) return null
  return latin
}

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
export function createPipelineLogger(tag = 'SearchFirst', onStep = null) {
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
      if (onStep) { try { onStep(n, name, data, elapsed) } catch {} }
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
  onStep = null,
} = {}) {
  const log = createPipelineLogger('SearchFirst', onStep)
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

    // FIX-C3: بحث Wikidata تسلسلي مع خروج مبكر — يمنع rate limiting من الطلبات المتوازية
    if (withWikidata) {
      for (const q of wdQueries) {
        wikidataResult = await searchWikidata(q, 'ar').catch(() => null)
        if (wikidataResult?.confidence >= 80) break
      }
      // fallback إنجليزي تسلسلي إذا فشل العربي
      if (!wikidataResult) {
        for (const q of [cleanQ, lastWord]) {
          wikidataResult = await searchWikidata(q, 'en').catch(() => null)
          if (wikidataResult?.confidence >= 75) break
        }
      }
    }

    // ── تحميل sitelinks الكاملة من Wikidata (ar/en/fr) ──────────────────────────
    // searchWikidata يُرجع {id, label, ...} بدون sitelinks — نجلبها الآن
    if (wikidataResult?.id) {
      try {
        const fullEntity = await fetchWikidataEntity(wikidataResult.id)
        if (fullEntity) {
          wikidataResult = {
            ...wikidataResult,
            wikipediaAr: fullEntity.wikipediaAr || wikidataResult.wikipediaAr || null,
            wikipediaEn: fullEntity.wikipediaEn || wikidataResult.wikipediaEn || null,
            wikipediaFr: fullEntity.wikipediaFr || null,
            labelEn:     fullEntity.labelEn || null,
            labelFr:     fullEntity.labelFr || null,
          }
        }
      } catch {}
    }

    // FIX-C5: استخدام Wikidata sitelinks لجلب Wikipedia بعنوان دقيق
    // الأولوية: عربي → إنجليزي → فرنسي
    if (wikidataResult?.wikipediaAr) {
      wikipediaResult = await fetchWikipediaByTitle(wikidataResult.wikipediaAr, 'ar').catch(() => null)
    }
    if (!wikipediaResult?.extract && wikidataResult?.wikipediaEn) {
      wikipediaResult = await fetchWikipediaByTitle(wikidataResult.wikipediaEn, 'en').catch(() => null)
    }
    if (!wikipediaResult?.extract && wikidataResult?.wikipediaFr) {
      wikipediaResult = await fetchWikipediaByTitle(wikidataResult.wikipediaFr, 'fr').catch(() => null)
    }

    // FIX-C2/C5 fallback: جلب مباشر بالاسم النظيف (عربي)
    if (!wikipediaResult?.extract) {
      wikipediaResult = await fetchWikipediaByTitle(cleanQ, 'ar').catch(() => null)
    }
    // fallback بـ searchPersonWikipedia (ar→fr→en بالنص العربي)
    if (!wikipediaResult?.extract) {
      wikipediaResult = await searchPersonWikipedia(cleanQ).catch(() => null)
    }
    if (!wikipediaResult?.extract && lastWord !== cleanQ) {
      wikipediaResult = await searchPersonWikipedia(lastWord).catch(() => null)
    }

    // ── Fallback متعدد اللغات بالاسم المُعرَّب (التحويل العربي→لاتيني) ────────
    // يُفعَّل عند: لا محتوى عربي OR مقالة stub (أقل من 300 حرف)
    // هذا يحل مشكلة: "ابراهيم مازا" → en.wikipedia.org/wiki/Ibrahim_Maza
    const _arExtractLen = wikipediaResult?.extract?.length || 0
    if (!wikipediaResult?.extract || _arExtractLen < 300) {
      const latinName = transliterateAlgerianName(cleanQ)
      const latinLast = lastWord !== cleanQ ? transliterateAlgerianName(lastWord) : null

      if (latinName) {
        // 1. الاسم الإنجليزي/الفرنسي من Wikidata labels
        const wdLabelEn = wikidataResult?.labelEn
        const wdLabelFr = wikidataResult?.labelFr

        // 2. جرّب ويكيبيديا إنجليزية بـ Wikidata label أو التحويل
        for (const enName of [...new Set([wdLabelEn, latinName, latinLast].filter(Boolean))]) {
          wikipediaResult = await searchPersonWikipediaLang(enName, ['en']).catch(() => null)
          if (wikipediaResult?.extract) break
        }
        // 3. جرّب ويكيبيديا فرنسية (الأفضل للمغاربة والجزائريين)
        if (!wikipediaResult?.extract) {
          for (const frName of [...new Set([wdLabelFr, latinName, latinLast].filter(Boolean))]) {
            wikipediaResult = await searchPersonWikipediaLang(frName, ['fr']).catch(() => null)
            if (wikipediaResult?.extract) break
          }
        }
        // 4. SearXNG بالاسم اللاتيني إذا لم تنجح ويكيبيديا
        if (!wikipediaResult?.extract && withSearXNG) {
          try {
            const enSearx = await searchWithSearXNG(
              `${latinName} Algeria player OR footballer OR politician OR singer`,
              { categories: 'general', language: 'en', maxResults: 6 }
            )
            if (enSearx?.length > 0) {
              const relevant = enSearx.filter(r => {
                const txt = `${r.title||''} ${r.snippet||''}`.toLowerCase()
                return latinName.toLowerCase().split(' ').some(w => w.length > 2 && txt.includes(w))
              })
              if (relevant.length > 0) {
                const enSearxContent = relevant.slice(0, 4)
                  .filter(r => r.snippet?.length > 30)
                  .map(r => `• **${r.title}**: ${r.snippet}`)
                  .join('\n')
                if (enSearxContent) {
                  wikipediaResult = {
                    extract: enSearxContent,
                    title: latinName,
                    lang: 'en',
                    source: 'searxng-en',
                  }
                }
              }
            }
          } catch {}
        }
      }
    }

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
    const latinTried = transliterateAlgerianName(cleanQ)
    const triedSources = [
      'Wikidata', 'ويكيبيديا العربية', 'ويكيبيديا الإنجليزية', 'ويكيبيديا الفرنسية',
      ...(latinTried ? [`تحويل اللاتيني (${latinTried})`] : []),
      ...(withSearXNG ? ['SearXNG (عربي + إنجليزي)'] : []),
    ].join(' · ')
    finalAnswer = {
      type: 'not_found',
      message: `⚠️ لم أجد معلومات موثوقة كافية للإجابة عن "${cleanQ}".\n\nبحثت في: ${triedSources}\n\n> 🛡️ مبدأ DZ Agent: لا تخمين، لا اختلاق — إجابة موثقة أفضل من إجابة سريعة.`,
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
    const wikiLang = wikipediaResult?.lang || 'ar'
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
      lang: wikiLang,
      needsTranslation: wikiLang !== 'ar',
    }
    answerModel = `${selectedSource}-verified${wikiLang !== 'ar' ? `-${wikiLang}` : ''}`
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
  const wikiLang  = result.lang || 'ar'
  const wikiLangLabel = wikiLang === 'fr' ? 'الفرنسية' : wikiLang === 'en' ? 'الإنجليزية' : 'العربية'
  const sourceLabel = {
    wikidata: 'Wikidata',
    wikipedia: `ويكيبيديا ${wikiLangLabel}`,
    searxng: 'SearXNG',
    'searxng-en': 'SearXNG (إنجليزي)',
    'wikidata+wikipedia': `Wikidata + ويكيبيديا ${wikiLangLabel}`,
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

  // ── تعليمة ترجمة للـ LLM عند وجود محتوى إنجليزي/فرنسي ─────────────────────
  const translateInstruction = result.needsTranslation
    ? `\n> 🌐 **تعليمة للذكاء الاصطناعي:** المحتوى التالي مأخوذ من ويكيبيديا ${wikiLangLabel} — يُرجى ترجمته وعرضه بالعربية الفصيحة في إجابتك النهائية، مع الحفاظ على جميع المعلومات والتواريخ والأرقام بدقة.\n`
    : ''

  const lines = [
    `## 📖 ${result.title}`,
    result.description ? `*${result.description}*` : '',
    ``,
    `> 🔒 *المعلومات التالية مستخرجة من مصادر موثوقة — لا إضافات، لا تخمينات.*`,
    translateInstruction,
    result.extract || '',
    ``,
    `---`,
    [
      result.url ? `📚 **المصدر:** [${sourceLabel}](${result.url})` : `📚 **المصدر:** ${sourceLabel}`,
      result.wikidata_url ? `| [Wikidata](${result.wikidata_url})` : '',
      `| 🎯 **الثقة:** ${confLabel} ${confidence}%`,
      `| ⏱️ ${elapsed}ms`,
      result.needsTranslation ? `| 🌐 مُترجم من ${wikiLangLabel}` : '',
    ].filter(Boolean).join(' '),
  ].filter(l => l !== '')

  return {
    content: lines.join('\n'),
    model: `${source}-verified${result.needsTranslation ? `-${wikiLang}` : ''}`,
    pipeline,
    needsTranslation: result.needsTranslation || false,
    sourceLang: wikiLang,
    _meta: { source, confidence, elapsed, contentLength: pipelineResult._raw?.contentLength || 0 },
  }
}
