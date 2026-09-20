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
const EXTENDED_CORPUS_PATH = join(__dirname, '../data/dz_darija_extended.json')

// ── Cache ──────────────────────────────────────────────────────────────────
let _corpus = null
let _loadedAt = 0
const TTL = 20 * 60 * 1000   // إعادة تحميل كل 20 دقيقة

function loadExtendedCorpus() {
  try { return JSON.parse(readFileSync(EXTENDED_CORPUS_PATH, 'utf8')) }
  catch (e) { console.warn('[DarijaPrompt] extended corpus unavailable:', e.message); return { variants: [], tech: [], phrases: [], arabizi: [], examples: [] } }
}

function normalizeDarijaText(text = '') {
  return String(text).toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ًٌٍَُِّْـ]/g, '').replace(/[\u200e\u200f]/g, '').replace(/[^a-z0-9ء-ي0-9]+/gi, ' ').trim()
}

function relevantExtended(entries = [], query = '', limit = 12) {
  const q = normalizeDarijaText(query); if (!q) return entries.slice(0, limit)
  const tokens = q.split(/\s+/).filter(t => t.length > 1)
  return [...entries].map((entry,index) => {
    const text = normalizeDarijaText(Array.isArray(entry) ? entry.join(' ') : JSON.stringify(entry))
    const score = tokens.reduce((s,t) => s + (text.includes(t) ? 2 : 0), 0)
    return { entry, score, index }
  }).sort((a,b) => b.score-a.score || a.index-b.index).slice(0,limit).map(x => x.entry)
}

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

// ── Retrieval helpers — استرجاع ذكي من corpus الكبير ───────────────────────
function normalizeDarijaText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[؟?!.,،؛:()[\]{}"'«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreCorpusEntry(entry, query) {
  const q = normalizeDarijaText(query)
  if (!q) return 0
  const hay = normalizeDarijaText([
    entry?.dz, entry?.ar, entry?.word, entry?.meaning_ar,
    entry?.franco, entry?.darija, entry?.category, entry?.cat,
    ...(entry?.usage || []), ...(entry?.examples || [])
  ].filter(Boolean).join(' '))
  if (!hay) return 0
  const tokens = q.split(' ').filter(t => t.length >= 2)
  let score = 0
  for (const token of tokens) {
    if (hay.includes(token)) score += token.length >= 4 ? 3 : 1
  }
  return score
}

function relevantEntries(entries, query, limit = 20) {
  if (!Array.isArray(entries) || !entries.length) return []
  const scored = entries
    .map((entry, index) => ({ entry, index, score: scoreCorpusEntry(entry, query) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const relevant = scored.slice(0, limit).map(x => x.entry)
  if (relevant.length >= Math.min(8, limit)) return relevant
  return [...relevant, ...entries.slice(0, Math.max(0, limit - relevant.length))]
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────────

/**
 * buildDarijaPromptBlock(userMessage, options)
 * يُعيد string يُضاف إلى system prompt عند اكتشاف الدارجة.
 */
export function buildDarijaPromptBlock(userMessage = '', options = {}) {
  const corpus = loadCorpus()
  const extended = loadExtendedCorpus()
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
  const pickedExprs = relevantEntries(exprs, userMessage, compact ? 14 : 28)
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

  // اختر أمثلة مرتبطة بالسؤال أولاً، ثم أمثلة اجتماعية/عفوية للتنوع.
  const relevantExamples = relevantEntries(allExamples, userMessage, compact ? 12 : 24)
  // اختر: أمثلة مرتبطة + تحية + casual + أمثلة أخرى
  const selected = [
    ...sample(relevantExamples, compact ? 5 : 10),
    ...sample(topicExamples, compact ? 2 : 5),
    ...sample(greetingExamples, 1),
    ...sample(casualExamples, 1),
    ...sample(otherExamples, compact ? 1 : 3),
  ].filter((v, i, arr) => arr.findIndex(x => x.user === v.user) === i)
   .slice(0, compact ? 8 : 18)

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

  // ─── ⑩.5 طبقة Darija Extended — retrieval حسب رسالة المستخدم
  const extTech = relevantExtended(extended.tech || [], userMessage, compact ? 5 : 10)
  const extPhrases = relevantExtended(extended.phrases || [], userMessage, compact ? 6 : 12)
  const extArabizi = relevantExtended(extended.arabizi || [], userMessage, compact ? 8 : 16)
  const extExamples = relevantExtended(extended.examples || [], userMessage, compact ? 3 : 6)
  if (extTech.length || extPhrases.length || extArabizi.length) {
    lines.push('🇩🇿 **DARJA EXTENDED RETRIEVAL — فهم الكلام الجزائري المختلط**:')
    if (extTech.length) lines.push('  [تقني] ' + extTech.map(x => x[0] + ' → ' + (x[2] || x[1])).join(' | '))
    if (extPhrases.length) lines.push('  [تعبيرات] ' + extPhrases.map(x => x[0] + ' → ' + x[1]).join(' | '))
    if (extArabizi.length) lines.push('  [Arabizi] ' + extArabizi.map(x => x[0] + '=' + x[1]).join(' | '))
    lines.push('  **مهم:** افهم Arabizi والاختصارات والأخطاء الإملائية والكود-سويتشينغ بدون اعتبارها لغة مختلفة.')
    lines.push('')
  }
  if (extExamples.length) {
    lines.push('  [أمثلة سياقية مختارة]')
    for (const ex of extExamples) lines.push('    👤 ' + ex[1] + '\n    🤖 ' + ex[2])
    lines.push('')
  }

// ─── ⑪ قواعد الرد الإلزامية ──────────────────────────────────────────────
  lines.push('🧠 **قاعدة فهم الدارجة العميق:**')
  lines.push('  افهم الاختصارات والأخطاء الإملائية والفرانكو حتى لو كانت الكلمة مكتوبة بأكثر من شكل: واش/وش، علاش/علاه، كيفاش/كفاش، وين/فين، شكون/شكوناه، درك/دروك، قاع/كامل، بزاف/ياسر، ماكانش/ما كاش، كاش/كاين، هاذ/هذا، هذي/هادِي، تاع/نتاع/متاع.')
  lines.push('  افهم حذف الحركات والحروف في الكتابة السريعة: راني/رانيي، راك/راك، واش راك/وش راك، ما نعرفش/مانعرفش، ما عنديش/ماعنديش، ما نيش/مانيش.')
  lines.push('  افهم المزج الطبيعي مع الفرنسية والإنجليزية: "واش رايك فالapp؟"، "دير update"، "ما خدمليش le wifi"، "بعثلي le lien"، "نحتاج un truc بسيط".')
  lines.push('  لا تعتبر اختلاف المنطقة خطأ: قد يقول الجزائري وين/فين، بزاف/ياسر، درك/دروك، واش/وش، شحال/قداش حسب المنطقة والسياق.')
  lines.push('')
  lines.push('📌 **قواعد الرد بالدارجة الجزائرية** (مُلزِمة — لا استثناء):')
  lines.push('  ① رد بالدارجة الجزائرية الطبيعية — مزيج عربي+فرنسي مقبول ومتداول، مع الحفاظ على وضوح المعلومة')
  lines.push('  ② استخدم: بزاف/ياسر | ماكانش/ما...ش | راني/راك/راه | واش/كيفاش/علاه | مليح/لاباس | خويا/صاحبي')
  lines.push('  ③ المعلومة دقيقة وصحيحة — الدارجة في الأسلوب فقط')
  lines.push('  ④ لا تترجم كل شيء للفصحى — تكلم كيما الجزائري مع صاحبه')
  lines.push('  ⑤ كلمات تقنية (AI, code, app, Wi-Fi, React...) تبقى كما هي')
  lines.push('  ⑥ لا تبدأ بـ "بالطبع" أو "بالفعل" — ابدأ بالدارجة مباشرة')
  lines.push('  ⑦ الإيموجي مقبول في السياق الودي — لا تفرط فيه')
  lines.push('  ⑧ إذا سألك عن السعر بـ"مليون" — تذكر: مليون دارجة = 1,000 دينار')
  lines.push('  ⑨ استعمل أنماط الجمل المذكورة أعلاه — لا تتكلم بالفصحى المجردة إذا كان المستخدم يتكلم بالدارجة')
  lines.push('  ⑨-ب لا تقلّد خطأ المستخدم حرفياً؛ صحّح الفهم داخلياً ورد بكتابة جزائرية مفهومة وطبيعية')
  lines.push('  ⑨-ج افهم الدارجة في الأسئلة التقنية، الإدارية، اليومية، الفكاهية، والتعبير غير المباشر — وليس فقط التحية والترجمة')
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

// ══════════════════════════════════════════════════════════════════════════════
// DIALECT COLORING BLOCK — لجميع المستخدمين (MSA + دارجة + فرنسية)
// يُحقن في system prompt لجميع أنواع المستخدمين
// يُشجّع AI على استخدام كلمة أو اثنتين من الدارجة مع تعريفها بالعربية
// ══════════════════════════════════════════════════════════════════════════════

const DICT_PATH = join(__dirname, '../data/dz_dialect.json')
let _dictCache = null
let _dictLoadedAt = 0

function loadDZDict() {
  const now = Date.now()
  if (_dictCache && now - _dictLoadedAt < TTL) return _dictCache
  try {
    _dictCache = JSON.parse(readFileSync(DICT_PATH, 'utf8'))
    _dictLoadedAt = now
    console.log(`[DarijaColoring] ✅ dz_dialect.json: ${_dictCache.words?.length || 0} words`)
  } catch (e) {
    console.warn('[DarijaColoring] ⚠️ could not load dz_dialect.json:', e.message)
    if (!_dictCache) _dictCache = { words: [] }
  }
  return _dictCache
}

/**
 * getDarijaColoringBlock(userMessage, count)
 *
 * يُعيد كتلة تُحقن في system prompt لجميع المستخدمين (ليس فقط الدارجة).
 * تُشجّع AI على استخدام 1-2 كلمات دارجة جزائرية بشكل طبيعي في ردوده،
 * مع ذكر معناها بالعربية مباشرةً: مثال "بزاف (أي: كثيراً)"
 */
export function getDarijaColoringBlock(userMessage = '', count = 4) {
  try {
    const dict = loadDZDict()
    const allWords = dict.words || []
    if (!allWords.length) return ''

    const topic = detectQueryTopic(userMessage)

    // فئات نستبعدها — أدوات نحوية بحتة لا تُثري الأسلوب
    const EXCLUDE_CATS = [
      'pronoun', 'determiner', 'preposition', 'connective',
      'filler', 'demonstrative', 'question', 'modal', 'discourse',
      'comparison', 'awareness', 'dz_agent',
    ]

    // فئات مفضّلة حسب الموضوع
    const TOPIC_CATS = {
      tech:      ['tech', 'adverb', 'evaluation', 'quantity', 'verb'],
      food:      ['adjective', 'evaluation', 'quantity', 'expression', 'exclamation', 'noun'],
      work:      ['evaluation', 'quantity', 'state', 'adverb', 'verb', 'noun'],
      study:     ['evaluation', 'adverb', 'quantity', 'state', 'verb'],
      weather:   ['state', 'adjective', 'quantity', 'adverb', 'exclamation'],
      culture:   ['expression', 'greeting', 'wish', 'noun', 'evaluation', 'place'],
      emotional: ['state', 'expression', 'gratitude', 'exclamation', 'wish'],
      health:    ['state', 'adverb', 'evaluation', 'noun'],
      greeting:  ['greeting', 'gratitude', 'wish', 'expression', 'affirmation'],
      general:   ['evaluation', 'quantity', 'adverb', 'state', 'expression', 'adjective', 'exclamation'],
    }

    const preferredCats = TOPIC_CATS[topic] || TOPIC_CATS.general

    // كلمات صالحة: يجب أن يكون لها معنى عربي واضح مختلف عن الكلمة نفسها
    const valid = allWords.filter(w =>
      w.word &&
      w.meaning_ar &&
      w.meaning_ar.trim().length >= 2 &&
      w.meaning_ar.trim() !== w.word.trim() &&
      !EXCLUDE_CATS.includes(w.category)
    )

    // أولوية: الفئات المناسبة للموضوع
    const preferred = valid.filter(w => preferredCats.includes(w.category))
    const fallback  = valid.filter(w => !preferredCats.includes(w.category))

    const picked = [
      ...sample(preferred, Math.min(count, preferred.length)),
      ...sample(fallback,  Math.max(0, count - preferred.length)),
    ].slice(0, count)

    if (!picked.length) return ''

    const wordList = picked.map(w => {
      const ex = w.usage?.[0] ? ` — مثال: "${w.usage[0]}"` : ''
      return `  • ${w.word} (أي: ${w.meaning_ar})${ex}`
    }).join('\n')

    return [
      '🌟 لمسة لغوية جزائرية — اختياري لا إلزامي:',
      '   يمكنك أحياناً توظيف كلمة واحدة أو اثنتين من هذه الكلمات الدارجة بشكل طبيعي في ردودك،',
      '   مع ذكر معناها فوراً بين قوسين — مثال: "هذا مليح بزاف (أي: كثيراً)"',
      wordList,
      '  📌 لا تحشو الكلمات ولا تكثر منها — كلمة واحدة كافية إذا جاءت طبيعية في السياق.',
    ].join('\n')
  } catch (e) {
    console.warn('[DarijaColoring] error:', e.message)
    return ''
  }
}
