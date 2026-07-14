/**
 * lib/dz-definition-search.js
 * ═══════════════════════════════════════════════════════════════════════════════
 * DZ Agent — Knowledge / Definition Search
 * بحث المعرفة والتعاريف — Wikipedia AR/FR/EN + DDG Instant Answer
 *
 * يُشغَّل عندما يسأل المستخدم عن شيء لا يعرفه الـ LLM أو لا توجد به بيانات KB:
 *   "ما هو نظام الطيبات"
 *   "اشرح لي X"
 *   "تعريف X"
 *   "c'est quoi X"
 *   "what is X"
 *
 * ─── الفرق عن البحث الحي (realtime) ────────────────────────────────────────
 *  realtime  → RSS جزائرية + Google News (أخبار لحظية)
 *  knowledge → Wikipedia AR/FR/EN + DDG (معرفة موسوعية)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const WIKI_TIMEOUT = 14000
const DDG_TIMEOUT  = 8000

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION — كشف استعلامات التعريف/المعرفة
// ═══════════════════════════════════════════════════════════════════════════════

// أنماط تشير إلى طلب تعريف/شرح/معلومات عامة
const _DEF_PATTERNS = [
  // عربي — ما هو / ما هي / ما هم
  /^(?:ما\s+(?:هو|هي|هم|المقصود|المراد|يعني)\s+|ماذا\s+يعني\s+|ما\s+معنى\s+)/i,
  // عربي — اشرح / عرّف / تعريف / نبذة
  /^(?:اشرح\s+(?:لي\s+)?|عرّف\s+(?:لي\s+)?|تعريف\s+|نبذة\s+(?:عن\s+)?|معلومات\s+(?:عن\s+)?)/i,
  // عربي — أخبرني عن / حدثني عن
  /^(?:أخبرني\s+(?:عن|حول)\s+|حدثني\s+(?:عن|حول)\s+|أريد\s+(?:معرفة|معلومات)\s+(?:عن\s+)?)/i,
  // دارجة — كيفاش / واش هو / واش هي
  /^(?:كيفاش\s+(?:يشتغل|يعمل|هو|هي)\s+|واش\s+(?:هو|هي)\s+|شو\s+هو\s+|شو\s+هي\s+)/i,
  // فرنسي — c'est quoi / qu'est-ce que / expliquer / définition
  /^(?:c['']est\s+quoi\s+|qu['']est.ce\s+qu['']?(?:un|une|le|la|les|c['']est)?\s*|définition\s+(?:de\s+)?|expliquer?\s+|parler?\s+de\s+|info(?:s)?\s+sur\s+)/i,
  // إنجليزي — what is / define / explain / tell me about
  /^(?:what\s+(?:is|are|was|were)\s+(?:a\s+|the\s+|an\s+)?|define\s+|explain\s+|tell\s+me\s+about\s+|information\s+(?:about|on)\s+)/i,
]

// كلمات دلالة تعريفية في الجملة (حتى لو لم تكن في البداية)
const _DEF_MID_PATTERNS = [
  /(?:ما\s+هو|ما\s+هي|ما\s+المقصود|ما\s+يعني|ما\s+معنى)\s+/i,
  /\b(?:تعريف|شرح|نبذة|معلومات)\s+(?:عن|حول|ل)?\s+/i,
  /\b(?:definition|definition\s+of|explanation\s+of|about)\b/i,
]

// استثناءات — لا تُعدّ تعريفاً (تُعالَج بمسارات أخرى)
const _DEF_EXCLUSIONS = [
  /(?:آخر\s+أخبار|أخبار\s+اليوم|عاجل|breaking|dernières\s+nouvelles)/i,
  /(?:سعر\s+|صرف\s+|مباراة|نتيجة|طقس\s+اليوم)/i,
  /(?:من\s+(?:هو|هي)\s+(?:وزير|رئيس|ملك|أمير))/i,  // سؤال شخصية → مسار آخر
  /(?:آخر\s+أخبار|أحدث\s+تطورات)/i,
]

/**
 * isDefinitionQuery — هل هذا استعلام تعريف/معرفة؟
 * أشمل من isEntityDefinitionQuery: يغطي مواضيع عامة (نظم، مفاهيم، أماكن...)
 * @param {string} q
 * @returns {boolean}
 */
export function isDefinitionQuery(q = '') {
  if (!q || q.length < 4) return false
  const t = q.trim()

  // فحص الاستثناءات أولاً
  if (_DEF_EXCLUSIONS.some(rx => rx.test(t))) return false

  // فحص أنماط البداية
  if (_DEF_PATTERNS.some(rx => rx.test(t))) return true

  // فحص أنماط منتصف الجملة
  if (_DEF_MID_PATTERNS.some(rx => rx.test(t))) return true

  return false
}

/**
 * extractTopicFromQuery — استخراج الموضوع الرئيسي من السؤال
 * "ما هو نظام الطيبات" → "نظام الطيبات"
 * "explain machine learning" → "machine learning"
 */
export function extractTopicFromQuery(q = '') {
  return q
    // عربي
    .replace(/^(?:ما\s+(?:هو|هي|هم|المقصود\s+ب|المراد\s+ب|يعني)\s+)/i, '')
    .replace(/^(?:ماذا\s+يعني\s+|ما\s+معنى\s+)/i, '')
    .replace(/^(?:اشرح\s+(?:لي\s+)?|عرّف\s+(?:لي\s+)?|تعريف\s+)/i, '')
    .replace(/^(?:نبذة\s+(?:عن\s+)?|معلومات\s+(?:عن\s+)?)/i, '')
    .replace(/^(?:أخبرني\s+(?:عن|حول)\s+|حدثني\s+(?:عن|حول)\s+)/i, '')
    .replace(/^(?:أريد\s+(?:معرفة|معلومات)\s+(?:عن\s+)?)/i, '')
    .replace(/^(?:كيفاش\s+(?:يشتغل|يعمل|هو|هي)\s+|واش\s+(?:هو|هي)\s+)/i, '')
    // فرنسي
    .replace(/^(?:c['']est\s+quoi\s+|qu['']est.ce\s+qu['']?(?:un|une|le|la|les)?\s*)/i, '')
    .replace(/^(?:définition\s+(?:de\s+)?|expliquer?\s+|parler?\s+de\s+|info(?:s)?\s+sur\s+)/i, '')
    // إنجليزي
    .replace(/^(?:what\s+(?:is|are|was|were)\s+(?:a\s+|the\s+|an\s+)?)/i, '')
    .replace(/^(?:define\s+|explain\s+|tell\s+me\s+about\s+|information\s+(?:about|on)\s+)/i, '')
    // تنظيف
    .replace(/[؟?!]$/, '')
    .trim()
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIKIPEDIA SEARCH — AR → FR → EN
// ═══════════════════════════════════════════════════════════════════════════════

async function _wikiSearch(query, lang = 'ar') {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIKI_TIMEOUT)
  try {
    // OpenSearch
    const sUrl = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: 'opensearch', search: query, limit: '5',
      namespace: '0', format: 'json', origin: '*',
    })
    const sRes = await fetch(sUrl, { signal: ac.signal })
    clearTimeout(timer)
    if (!sRes.ok) return null
    const [, titles, , urls] = await sRes.json()
    if (!titles?.length) return null

    // جرّب أول 3 نتائج
    for (let i = 0; i < Math.min(3, titles.length); i++) {
      const title = titles[i]
      const url   = urls?.[i] || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`

      const eAc = new AbortController()
      const eTimer = setTimeout(() => eAc.abort(), WIKI_TIMEOUT)
      const eUrl = `https://${lang}.wikipedia.org/w/api.php?` + new URLSearchParams({
        action: 'query', prop: 'extracts|description',
        exintro: '1', explaintext: '1', exsentences: '10',
        titles: title, format: 'json', origin: '*', redirects: '1',
      })
      const eRes = await fetch(eUrl, { signal: eAc.signal })
      clearTimeout(eTimer)
      if (!eRes.ok) continue
      const eData = await eRes.json()
      const pages = Object.values(eData?.query?.pages || {})
      const page  = pages[0]
      if (!page || page.missing || !page.extract || page.extract.length < 60) continue

      return {
        title:       page.title,
        extract:     page.extract,
        description: page.description || '',
        url,
        lang,
      }
    }
    return null
  } catch {
    clearTimeout(timer)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DDG INSTANT ANSWER — DuckDuckGo Abstract API
// ═══════════════════════════════════════════════════════════════════════════════

async function _ddgInstant(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&skip_disambig=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DZ-GPT/4.0' },
      signal: AbortSignal.timeout(DDG_TIMEOUT),
    })
    if (!res.ok) return null
    const data = await res.json()
    const abstract = data?.AbstractText || ''
    const source   = data?.AbstractSource || ''
    const url_     = data?.AbstractURL || ''
    if (!abstract || abstract.length < 40) return null
    return { abstract, source, url: url_ }
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN — fetchDefinitionContext
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * fetchDefinitionContext — يجلب سياق تعريفي/موسوعي من Wikipedia + DDG
 * يُستخدم بدلاً من fetchRealtimeContext عندما يكون الاستعلام تعريفياً.
 *
 * @param {string} query - السؤال الكامل من المستخدم
 * @returns {Promise<string|null>} - سياق جاهز للحقن في system prompt
 */
export async function fetchDefinitionContext(query) {
  const topic = extractTopicFromQuery(query)
  if (!topic || topic.length < 2) return null

  console.log(`[KnowledgeSearch] 📚 topic="${topic}"`)

  // ── بحث متوازٍ: Wikipedia AR + EN + DDG ────────────────────────────────
  const [wikiAR, wikiEN, wikiAR2, ddg] = await Promise.allSettled([
    _wikiSearch(topic, 'ar'),
    _wikiSearch(topic, 'en'),
    _wikiSearch(topic + ' نظام', 'ar').catch(() => null),  // تجربة إضافية
    _ddgInstant(topic),
  ])

  // أيضاً جرّب بالفرنسية إذا بدا الاستعلام فرنسياً
  let wikiFR = null
  if (/[àâéèêëîïôùûüç]/i.test(query) || /^(?:c['']est|qu['']|définition|expliquer)/i.test(query)) {
    wikiFR = await _wikiSearch(topic, 'fr').catch(() => null)
  }

  const arResult  = wikiAR.status  === 'fulfilled' ? wikiAR.value  : null
  const enResult  = wikiEN.status  === 'fulfilled' ? wikiEN.value  : null
  const ar2Result = wikiAR2.status === 'fulfilled' ? wikiAR2.value : null
  const ddgResult = ddg.status     === 'fulfilled' ? ddg.value     : null

  // اختر أفضل نتيجة عربية
  const bestAR = (arResult?.extract?.length || 0) > (ar2Result?.extract?.length || 0)
    ? arResult : (ar2Result || arResult)

  const hasAny = bestAR || enResult || wikiFR || ddgResult
  if (!hasAny) {
    console.log(`[KnowledgeSearch] ✗ No results for "${topic}"`)
    return null
  }

  // ── بناء السياق ────────────────────────────────────────────────────────
  const lines = []
  lines.push(`\n\n---`)
  lines.push(`## 📚 معلومات موسوعية — ${topic}`)
  lines.push(`🔍 مصدر: Wikipedia + قاعدة المعرفة العامة`)
  lines.push(``)

  // 1. Wikipedia عربي (الأفضل)
  if (bestAR?.extract) {
    lines.push(`### 📖 من Wikipedia (عربي)`)
    lines.push(`**${bestAR.title}**`)
    if (bestAR.description) lines.push(`*${bestAR.description}*`)
    lines.push(``)
    lines.push(bestAR.extract.slice(0, 1200).trim())
    if (bestAR.extract.length > 1200) lines.push(`\n*[المقالة الكاملة: ${bestAR.url}]*`)
    lines.push(``)
  }

  // 2. DDG Instant (معلومة سريعة إضافية)
  if (ddgResult?.abstract && (!bestAR || ddgResult.abstract.length > 100)) {
    lines.push(`### ⚡ ملخص سريع (${ddgResult.source || 'DDG'})`)
    lines.push(ddgResult.abstract.slice(0, 500))
    lines.push(``)
  }

  // 3. Wikipedia إنجليزي (إضافي إذا كان عربي غير كافٍ)
  if (enResult?.extract && (!bestAR || bestAR.extract.length < 200)) {
    lines.push(`### 📖 From Wikipedia (English)`)
    lines.push(`**${enResult.title}**`)
    lines.push(enResult.extract.slice(0, 800).trim())
    lines.push(``)
  }

  // 4. Wikipedia فرنسي (إضافي)
  if (wikiFR?.extract && !bestAR) {
    lines.push(`### 📖 Depuis Wikipedia (Français)`)
    lines.push(`**${wikiFR.title}**`)
    lines.push(wikiFR.extract.slice(0, 600).trim())
    lines.push(``)
  }

  // 5. روابط المصادر
  lines.push(`---`)
  lines.push(`**📚 مصادر:**`)
  if (bestAR?.url)  lines.push(`- [Wikipedia العربية — ${bestAR.title}](${bestAR.url})`)
  if (enResult?.url && !bestAR) lines.push(`- [Wikipedia EN — ${enResult.title}](${enResult.url})`)
  if (wikiFR?.url)  lines.push(`- [Wikipedia FR — ${wikiFR.title}](${wikiFR.url})`)
  if (ddgResult?.url) lines.push(`- [${ddgResult.source}](${ddgResult.url})`)
  lines.push(``)
  lines.push(`> ⚠️ استخدم هذه المعلومات كسياق وأجب بلغة المستخدم مع الاستشهاد بالمصادر أعلاه.`)

  const context = lines.join('\n')
  console.log(`[KnowledgeSearch] ✅ context built (${context.length} chars) | AR=${!!bestAR} EN=${!!enResult} DDG=${!!ddgResult}`)
  return context
}

/**
 * fetchKnowledgeContext — نسخة خفيفة تبحث مباشرةً بالاستعلام الخام
 * للاستعلامات العامة التي لا تتطابق مع أنماط التعريف ولكن تحتاج Wikipedia
 */
export async function fetchKnowledgeContext(query) {
  const [wikiAR, wikiEN, ddg] = await Promise.allSettled([
    _wikiSearch(query, 'ar'),
    _wikiSearch(query, 'en'),
    _ddgInstant(query),
  ])
  const ar  = wikiAR.status === 'fulfilled' ? wikiAR.value : null
  const en  = wikiEN.status === 'fulfilled' ? wikiEN.value : null
  const ddgR = ddg.status   === 'fulfilled' ? ddg.value : null

  if (!ar && !en && !ddgR) return null

  const lines = [`\n\n---`, `## 📚 معلومات موسوعية`, ``]
  if (ar?.extract)   { lines.push(`### 📖 Wikipedia (عربي)\n**${ar.title}**\n${ar.extract.slice(0,1000)}\n`) }
  if (ddgR?.abstract){ lines.push(`### ⚡ ${ddgR.source}\n${ddgR.abstract.slice(0,400)}\n`) }
  if (en?.extract && !ar) { lines.push(`### 📖 Wikipedia (EN)\n**${en.title}**\n${en.extract.slice(0,700)}\n`) }
  if (ar?.url)  lines.push(`> 📚 [Wikipedia AR](${ar.url})`)
  if (en?.url && !ar) lines.push(`> 📚 [Wikipedia EN](${en.url})`)
  return lines.join('\n')
}
