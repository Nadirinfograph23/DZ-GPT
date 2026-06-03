/**
 * DZ Darija Prompt Builder v3.0
 * يبني كتلة system-prompt غنية بالدارجة الجزائرية تُحقن في الـ AI
 *
 * المصدر: data/dz_darija_corpus.json (v3.0)
 * المُخرج: نص يُضاف لـ system prompt — يتضمن:
 *   ① قواعد بناء الجمل الأساسية (grammar_rules)
 *   ② تصريفات الأفعال (verb_conjugations)
 *   ③ أنماط الجمل (sentence_patterns)
 *   ④ الفرانكو-عربي (franco_arabic)
 *   ⑤ الفروق الإقليمية (regional_variants)
 *   ⑥ مفردات مصنّفة (vocabulary)
 *   ⑦ تعبيرات شائعة (expressions)
 *   ⑧ أمثلة محادثة few-shot (80 مثال مختار)
 *   ⑨ قواعد الرد الإلزامية
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CORPUS_PATH = join(__dirname, '../data/dz_darija_corpus.json')

// ── Cache ──────────────────────────────────────────────────────────────────
let _corpus = null
let _loadedAt = 0
const TTL = 20 * 60 * 1000   // إعادة تحميل كل 20 دقيقة

function loadCorpus() {
  const now = Date.now()
  if (_corpus && now - _loadedAt < TTL) return _corpus
  try {
    _corpus = JSON.parse(readFileSync(CORPUS_PATH, 'utf8'))
    _loadedAt = now
    const meta = _corpus?.meta || {}
    console.log(`[DarijaPrompt] ✅ corpus v${meta.version} loaded: ${meta.vocabulary_count} words, ${meta.few_shot_count} examples, ${meta.grammar_rules_count} rules, ${meta.sentence_patterns_count} patterns`)
  } catch (e) {
    console.warn('[DarijaPrompt] ⚠️ could not load corpus:', e.message)
    if (!_corpus) _corpus = { vocabulary: [], expressions: [], few_shot: [], grammar_rules: [], verb_conjugations: [], sentence_patterns: [], franco_arabic: [], regional_variants: [] }
  }
  return _corpus
}

// ── Helpers ────────────────────────────────────────────────────────────────
function sample(arr, n) {
  if (!arr?.length) return []
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}

/**
 * detectQueryTopic(msg)
 * خفيف جداً — لا يستدعي AI، فقط regex
 */
function detectQueryTopic(msg) {
  if (!msg) return 'general'
  const m = msg.toLowerCase()
  if (/ذكاء اصطناعي|chatgpt|llm|ai\b|كمبيوتر|برمجة|كود|تطبيق|موقع|هاتف|تيليفون|ريزو|wifi|باغ|bug|سيرفر|react|python|javascript|html|css/.test(m)) return 'tech'
  if (/أكل|ماكلة|كسكسي|طبخ|شورية|خبز|مطعم|وصفة|بنين|شرب|قهوة|مقروط|شكشوك/.test(m)) return 'food'
  if (/شغل|خدمة|مرتب|فلوس|حساب|بريد|ccp|بنك|راتب|وظيفة|يوتيوب|يربح|فريلانس/.test(m)) return 'work'
  if (/قرا|جامعة|مدرسة|باك|دراسة|امتحان|أستاذ|ليسانس|ماستر|كلية|تعلم|مذكرة/.test(m)) return 'study'
  if (/طقس|برد|سخونة|مطر|صيف|شتا|ريح|درجة حرارة/.test(m)) return 'weather'
  if (/تاريخ|جزائر|ثورة|حضارة|مقام|شهيد|استقلال|ثقافة|عادات|موسيقى|ولاية|مدينة|لهجة|دارجة/.test(m)) return 'culture'
  if (/ضايق|خايف|تعبان|وحيد|حزين|بكى|مشكلة نفسية|مساعدة|نصيحة|والدين|علاقة/.test(m)) return 'emotional'
  if (/صحة|مريض|دكتور|دوا|سبيطار|عياق|وجع|حمى/.test(m)) return 'health'
  if (/مرحبا|سلام|كيداير|لاباس|صباح|مساء|واش راك/.test(m)) return 'greeting'
  return 'general'
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────────

/**
 * buildDarijaPromptBlock(userMessage, options)
 * يُعيد string يُضاف إلى system prompt عند اكتشاف الدارجة.
 */
export function buildDarijaPromptBlock(userMessage = '', options = {}) {
  const corpus = loadCorpus()
  const topic  = detectQueryTopic(userMessage)
  const { compact = false } = options   // compact=true للردود السريعة

  const lines = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '🇩🇿  DARJA TRAINING MODULE v3.0 — DZ Agent',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'المستخدم يتكلم بالدارجة الجزائرية أو الفرانكو-عربي.',
    'اتبع هذا الدليل الشامل لتجيب بشكل طبيعي وأصيل كالجزائريين.',
    '',
  ]

  // ─── ① قواعد بناء الجمل — الأساس ──────────────────────────────────────
  const grammarRules = corpus.grammar_rules || []
  if (grammarRules.length) {
    lines.push('📐 **قواعد بناء الجمل بالدارجة الجزائرية** (أهم 6 قواعد):')
    const priorityRules = ['بناء الجملة الاسمية الحالية','النفي الجزائري الكامل','المستقبل بالدارجة','الملكية بالدارجة — نظام تاع','البنية المركبة — باش للسببية/الغرض','الشرط بالدارجة']
    const topRules = grammarRules.filter(r => priorityRules.some(p => r.rule?.includes(p.split('—')[0].trim())))
    const displayRules = topRules.length >= 4 ? topRules.slice(0, 6) : grammarRules.slice(0, 6)

    for (const rule of displayRules) {
      lines.push(`  🔹 **${rule.rule}**: ${rule.pattern}`)
      const exs = (rule.examples || []).slice(0, 2)
      for (const ex of exs) lines.push(`    → ${ex}`)
    }
    lines.push('')
  }

  // ─── ② تصريف الأفعال الأساسية ───────────────────────────────────────────
  const verbConjs = corpus.verb_conjugations || []
  if (!compact && verbConjs.length) {
    lines.push('🔀 **تصريف الأفعال الأساسية بالدارجة**:')
    // اختر 4 أفعال أساسية
    const coreVerbs = ['خدم (يعمل/يشتغل)', 'جا (يجيء)', 'قال (يتكلم/يقول)', 'بغى/حب (يريد/يحب)']
    const picked = verbConjs.filter(v => coreVerbs.some(c => v.verb === c)).slice(0, 4)
    for (const verb of picked) {
      const conj = verb.conjugations || {}
      const examples = (verb.examples || []).slice(0, 1)
      lines.push(`  [${verb.verb}]: أنا=${conj['أنا']||'?'} | أنت=${conj['أنت(م)']||conj['أنت']||'?'} | هو=${conj['هو']||'?'} | هم=${conj['هم']||'?'}`)
      if (verb.negation) {
        const neg = verb.negation
        const negEx = typeof neg === 'object' ? `أنا: ${neg['أنا']||''}` : neg
        lines.push(`    ✗ النفي: ${negEx}`)
      }
      if (examples.length) lines.push(`    مثال: ${examples[0]}`)
    }
    lines.push('')
  }

  // ─── ③ أنماط الجمل الشائعة ───────────────────────────────────────────────
  const sentPatterns = corpus.sentence_patterns || []
  if (sentPatterns.length) {
    lines.push('🧩 **أنماط بناء الجمل بالدارجة** (استخدمها في ردودك):')
    // اختر 5 أنماط متنوعة حسب السياق
    const relevantCats = topic === 'tech' ? ['الشرح والتوضيح','تسلسل الأفعال','التحذير والنصيحة'] :
                         topic === 'emotional' ? ['التشجيع والدعم','طلب المساعدة','الموافقة والرفض'] :
                         topic === 'greeting' ? ['السؤال عن الحال','الوداع والتمنيات','التعريف بالنفس'] :
                         ['التعبير عن الرأي','الموافقة والرفض','التعبير عن المفاجأة']

    const topPatterns = sentPatterns.filter(p => relevantCats.includes(p.category))
    const otherPatterns = sentPatterns.filter(p => !relevantCats.includes(p.category))
    const displayPatterns = [...topPatterns, ...sample(otherPatterns, 2)].slice(0, 5)

    for (const pat of displayPatterns) {
      lines.push(`  [${pat.category}]`)
      const examples = (pat.examples || []).slice(0, 2)
      for (const ex of examples) lines.push(`    → "${ex}"`)
    }
    lines.push('')
  }

  // ─── ④ الفرانكو-عربي — مهم جداً ──────────────────────────────────────────
  const francoList = corpus.franco_arabic || []
  if (francoList.length) {
    const pickedFranco = sample(francoList, 15)
    lines.push('🔤 **الفرانكو-عربي** — مزيج عربي/فرنسي المتداول جداً عند الجزائريين:')
    lines.push('  ' + pickedFranco.map(f => `${f.franco}=${f.darija}`).join(' | '))
    lines.push('')
  }

  // ─── ⑤ فروق إقليمية — لفهم كل المستخدمين ────────────────────────────────
  const regionalVars = corpus.regional_variants || []
  if (!compact && regionalVars.length) {
    lines.push('🗺️ **فروق إقليمية مهمة** (الجزائر متنوعة):')
    const keyVars = regionalVars.filter(r => ['كيفاش','بزاف','دابا','لاباس','المليون'].includes(r.word))
    for (const v of keyVars) {
      if (v.word === 'المليون') {
        lines.push(`  ⚠️ **المليون في الدارجة = 1,000 دينار (ليس مليون حقيقي!)** — مهم جداً عند ذكر الأسعار`)
      } else {
        lines.push(`  ${v.word}: العاصمة="${v.region_center}" | الغرب="${v.region_west}" | الشرق="${v.region_east}"`)
      }
    }
    lines.push('')
  }

  // ─── ⑥ مفردات أساسية مصنّفة ──────────────────────────────────────────────
  const vocab = corpus.vocabulary || []
  const byCategory = {}
  for (const w of vocab) {
    if (!byCategory[w.cat]) byCategory[w.cat] = []
    byCategory[w.cat].push(w)
  }

  const PRIORITY_CATS = ['state','negation','question','discourse','verb','emotion','social','modal','connector','evaluation','quantity','possession']
  const vocabBlock = []
  for (const cat of PRIORITY_CATS) {
    const words = byCategory[cat]
    if (!words?.length) continue
    const picked = words.slice(0, compact ? 5 : 8)
    vocabBlock.push(`  [${cat}] ${picked.map(w => `${w.dz}=${w.ar}`).join(' | ')}`)
  }

  if (vocabBlock.length) {
    lines.push('📖 **مفردات الدارجة الجزائرية** (استخدمها بشكل طبيعي):')
    lines.push(...vocabBlock)
    lines.push('')
  }

  // ─── ⑦ نظام راني/راك/راه — جوهري ──────────────────────────────────────
  lines.push('🟡 **نظام "راني/راك/راه"** — فعل الحال الجزائري:')
  lines.push('  راني=أنا الآن | راك=أنت | راكي=أنتِ | راه=هو | راها=هي | رانا=نحن | راكم=أنتم | راهم=هم')
  lines.push('  أمثلة: "راني نخدم" (أنا أعمل) | "راك تقرا؟" (أنت تدرس؟) | "راهم يلعبوا" (هم يلعبون)')
  lines.push('  للمستقبل: "غادي + فعل" — مثال: "غادي نروح غدوة" (سأذهب غداً)')
  lines.push('  للملكية: "تاعي/تاعك/تاعو" — مثال: "الكتاب تاعي" (كتابي)')
  lines.push('')

  // ─── ⑧ قاعدة النفي ما...ش ────────────────────────────────────────────────
  lines.push('🔴 **قاعدة النفي** (ما + فعل/اسم + ش):')
  lines.push('  ما نعرفش=لا أعرف | ما فهمتش=لم أفهم | ما عنديش=ليس عندي | مانيش=لستُ | ماكانش=لا يوجد')
  lines.push('  ما جيتش=لم أجئ | ما قدرتش=لم أستطع | ما بغيتش=لم أرد | ما زالش=لم ينتهِ بعد')
  lines.push('')

  // ─── ⑨ تعبيرات شائعة ────────────────────────────────────────────────────
  const exprs = corpus.expressions || []
  const pickedExprs = sample(exprs, compact ? 8 : 15)
  if (pickedExprs.length) {
    lines.push('💬 **تعبيرات شائعة** (استعملها في سياقها):')
    lines.push('  ' + pickedExprs.map(e => `"${e.dz}"=${e.ar}`).join(' | '))
    lines.push('')
  }

  // ─── ⑩ أمثلة few-shot — القلب الحقيقي للتدريب ─────────────────────────
  const allExamples = corpus.few_shot || []
  const topicExamples  = allExamples.filter(e => e.ctx === topic)
  const greetingExamples = allExamples.filter(e => e.ctx === 'greeting')
  const casualExamples = allExamples.filter(e => e.ctx === 'casual')
  const otherExamples  = allExamples.filter(e => !['greeting','casual'].includes(e.ctx) && e.ctx !== topic)

  // اختر: 4 من الموضوع، 2 تحية، 1 casual، 2 أخرى — مجموع 9
  const selected = [
    ...sample(topicExamples, 4),
    ...sample(greetingExamples, 2),
    ...sample(casualExamples, 1),
    ...sample(otherExamples, 2),
  ].filter((v, i, arr) => arr.findIndex(x => x.user === v.user) === i) // إزالة التكرار
   .slice(0, compact ? 5 : 9)

  if (selected.length) {
    lines.push('📚 **أمثلة محادثات حقيقية بالدارجة الجزائرية** — هذا هو أسلوبك:')
    lines.push('  ⚡ طبيعي، قريب، مفيد، بالدارجة الجزائرية الأصيلة.')
    lines.push('')
    for (const ex of selected) {
      lines.push(`  👤 المستخدم: "${ex.user}"`)
      lines.push(`  🤖 DZ Agent:  "${ex.agent}"`)
      lines.push('')
    }
  }

  // ─── ⑪ قواعد الرد الإلزامية ──────────────────────────────────────────────
  lines.push('📌 **قواعد الرد بالدارجة الجزائرية** (مُلزِمة — لا استثناء):')
  lines.push('  ① رد بالدارجة الجزائرية الطبيعية — مزيج عربي+فرنسي مقبول ومتداول')
  lines.push('  ② استخدم: بزاف/ياسر | ماكانش/ما...ش | راني/راك/راه | واش/كيفاش/علاه | مليح/لاباس | خويا/صاحبي')
  lines.push('  ③ المعلومة دقيقة وصحيحة — الدارجة في الأسلوب فقط')
  lines.push('  ④ لا تترجم كل شيء للفصحى — تكلم كيما الجزائري مع صاحبه')
  lines.push('  ⑤ كلمات تقنية (AI, code, app, Wi-Fi, React...) تبقى كما هي')
  lines.push('  ⑥ لا تبدأ بـ "بالطبع" أو "بالفعل" — ابدأ بالدارجة مباشرة')
  lines.push('  ⑦ الإيموجي مقبول في السياق الودي — لا تفرط فيه')
  lines.push('  ⑧ إذا سألك عن السعر بـ"مليون" — تذكر: مليون دارجة = 1,000 دينار')
  lines.push('  ⑨ استعمل أنماط الجمل المذكورة أعلاه — لا تتكلم بالفصحى المجردة')
  lines.push('  ⑩ ابنِ جملك بالدارجة: راني+فعل | ما+فعل+ش | غادي+فعل | الشيء+تاعي')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  return lines.join('\n')
}

/**
 * getDarijaVocabContext()
 * قائمة مفردات مختصرة جداً (للحقن السريع)
 */
export function getDarijaVocabContext() {
  const corpus = loadCorpus()
  const vocab = corpus.vocabulary || []
  const core = vocab
    .filter(w => ['state','negation','question','discourse','verb'].includes(w.cat))
    .slice(0, 70)
    .map(w => `${w.dz}=${w.ar}`)
  return core.join(' | ')
}

/**
 * getDarijaGrammarHints()
 * إعادة قائمة القواعد المختصرة (للحقن السريع في prompts أخرى)
 */
export function getDarijaGrammarHints() {
  const corpus = loadCorpus()
  const rules = corpus.grammar_rules || []
  return rules.slice(0, 5).map(r => `${r.rule}: ${r.pattern}`).join(' | ')
}

/**
 * getDarijaSentencePatterns(category)
 * إعادة أنماط جمل لفئة معينة
 */
export function getDarijaSentencePatterns(category = null) {
  const corpus = loadCorpus()
  const patterns = corpus.sentence_patterns || []
  if (category) return patterns.find(p => p.category === category) || null
  return patterns
}

/**
 * getFrancoArabicMap()
 * قاموس الفرانكو-عربي
 */
export function getFrancoArabicMap() {
  const corpus = loadCorpus()
  const francoList = corpus.franco_arabic || []
  const map = {}
  for (const item of francoList) map[item.franco] = item.darija
  return map
}

/** إعادة تحميل الـ corpus يدوياً */
export function reloadDarijaCorpus() {
  _corpus = null
  _loadedAt = 0
  return loadCorpus()
}
