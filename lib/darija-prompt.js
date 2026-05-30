/**
 * DZ Darija Prompt Builder
 * يبني كتلة system-prompt غنية بالدارجة الجزائرية تُحقن في الـ AI
 * عند اكتشاف أن المستخدم يكتب بالدارجة أو الفرانكو-عربي.
 *
 * المصدر: data/dz_darija_corpus.json
 * المُخرج: نص يُضاف لـ system prompt — يتضمن:
 *   ① مفردات أساسية مصنّفة
 *   ② قواعد النفي (ما...ش) وراني/راك/راه
 *   ③ تعبيرات شائعة
 *   ④ أمثلة محادثة few-shot (7 أمثلة مختارة بحسب موضوع السؤال)
 *   ⑤ قواعد الرد الإلزامية
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
    console.log(`[DarijaPrompt] ✅ corpus loaded: ${_corpus?.vocabulary?.length} words, ${_corpus?.few_shot?.length} examples`)
  } catch (e) {
    console.warn('[DarijaPrompt] ⚠️ could not load corpus:', e.message)
    if (!_corpus) _corpus = { vocabulary: [], expressions: [], few_shot: [] }
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
 * خفيف جداً — لا يستدعي AI، فقط regex بسيط
 * يُستخدم لاختيار أمثلة few-shot ذات صلة بالموضوع
 */
function detectQueryTopic(msg) {
  if (!msg) return 'general'
  const m = msg.toLowerCase()
  if (/ذكاء اصطناعي|chatgpt|llm|ai\b|كمبيوتر|برمجة|كود|تطبيق|موقع|هاتف|تيليفون|ريزو|wifi|باغ|bug|سيرفر/.test(m)) return 'tech'
  if (/أكل|ماكلة|كسكسي|طبخ|شورية|خبز|مطعم|وصفة|بنين|شرب|قهوة|مقروط/.test(m)) return 'food'
  if (/شغل|خدمة|مرتب|فلوس|حساب|بريد|ccp|بنك|راتب|وظيفة|يوتيوب|يربح/.test(m)) return 'work'
  if (/قرا|جامعة|مدرسة|باك|دراسة|امتحان|أستاذ|ليسانس|ماستر|كلية|تعلم/.test(m)) return 'study'
  if (/طقس|برد|سخونة|مطر|صيف|شتا|ريح|درجة حرارة/.test(m)) return 'weather'
  if (/تاريخ|جزائر|ثورة|حضارة|مقام|شهيد|استقلال|ثقافة|عادات|موسيقى|ديوان/.test(m)) return 'culture'
  if (/ضايق|خايف|تعبان|وحيد|حزين|بكى|مشكلة نفسية|مساعدة|نصيحة/.test(m)) return 'emotional'
  if (/صحة|مريض|دكتور|دوا|سبيطار|عياق/.test(m)) return 'health'
  return 'general'
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────────

/**
 * buildDarijaPromptBlock(userMessage)
 *
 * يُعيد string يُضاف إلى system prompt عند اكتشاف الدارجة.
 * يشتمل على: مفردات + قواعد + few-shot examples.
 *
 * @param {string} userMessage — رسالة المستخدم الأخيرة
 * @returns {string}
 */
export function buildDarijaPromptBlock(userMessage = '') {
  const corpus = loadCorpus()
  const topic  = detectQueryTopic(userMessage)

  const lines = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '🇩🇿  DARJA TRAINING MODULE — DZ Agent',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'المستخدم يتكلم بالدارجة الجزائرية أو الفرانكو-عربي.',
    'اتبع هذا الدليل لتجيب بشكل طبيعي وأصيل كالجزائريين.',
    '',
  ]

  // ─── ① مفردات أساسية مصنّفة ───────────────────────────────────────────
  const vocab = corpus.vocabulary || []
  const byCategory = {}
  for (const w of vocab) {
    if (!byCategory[w.cat]) byCategory[w.cat] = []
    byCategory[w.cat].push(w)
  }

  // فئات بالأولوية — الأهم أولاً
  const PRIORITY_CATS = ['state','negation','question','discourse','verb','emotion','social','modal','connector','evaluation','quantity']
  const vocabBlock = []
  for (const cat of PRIORITY_CATS) {
    const words = byCategory[cat]
    if (!words?.length) continue
    const picked = words.slice(0, 7)   // 7 كلمات لكل فئة
    vocabBlock.push(`  [${cat}] ${picked.map(w => `${w.dz}=${w.ar}`).join(' | ')}`)
  }

  if (vocabBlock.length) {
    lines.push('📖 **مفردات الدارجة الجزائرية** (استخدمها بشكل طبيعي في ردودك):')
    lines.push(...vocabBlock)
    lines.push('')
  }

  // ─── ② قاعدة راني / راك / راه — جوهرية في الدارجة ──────────────────
  lines.push('🟡 **نظام "راني/راك/راه"** (فعل الحال الجزائري):')
  lines.push('  راني = أنا الآن | راك/راكي = أنت | راه/راها = هو/هي | رانا = نحن | راكم = أنتم | راهم = هم')
  lines.push('  أمثلة: "راني نخدم" (أنا أعمل) | "راك فرحان؟" (أنت سعيد؟) | "راهم يقراوا" (هم يدرسون)')
  lines.push('')

  // ─── ③ قاعدة النفي ما...ش ──────────────────────────────────────────────
  lines.push('🔴 **قاعدة النفي بالدارجة** (ما + فعل + ش):')
  lines.push('  ما عرفتش | ما فهمتش | ما جيتش | ما عنديش | مانيش | ماكانش | ما قدرتش | ما بغيتش | ما نعرفش | ماشي')
  lines.push('  مثال: "ما فهمتش" = لم أفهم | "ما عنديش وقت" = لا وقت لدي | "ماشي صحيح" = ليس صحيحاً')
  lines.push('')

  // ─── ④ تعبيرات شائعة (مختصرة) ────────────────────────────────────────
  const exprs = corpus.expressions || []
  const pickedExprs = sample(exprs, 12)
  if (pickedExprs.length) {
    lines.push('💬 **تعبيرات شائعة** (استعملها في سياقها الصحيح):')
    lines.push('  ' + pickedExprs.map(e => `"${e.dz}" = ${e.ar}`).join(' | '))
    lines.push('')
  }

  // ─── ⑤ أمثلة few-shot — القلب الحقيقي للتدريب ─────────────────────────
  const allExamples = corpus.few_shot || []
  const topicExamples  = allExamples.filter(e => e.ctx === topic)
  const generalExamples = allExamples.filter(e => e.ctx === 'general' || e.ctx === 'casual')
  const otherExamples  = allExamples.filter(e => e.ctx !== topic && e.ctx !== 'general' && e.ctx !== 'casual')

  // اختر 3 من الموضوع، 2 casual، 2 أخرى — مجموع 7
  const selected = [
    ...sample(topicExamples, 3),
    ...sample(generalExamples, 2),
    ...sample(otherExamples, 2),
  ].slice(0, 7)

  if (selected.length) {
    lines.push('📚 **أمثلة محادثات بالدارجة الجزائرية** — تعلّم الأسلوب من هذه الأمثلة:')
    lines.push('  ⚡ هذا هو أسلوبك المطلوب — طبيعي، قريب، مفيد، بالدارجة الجزائرية.')
    lines.push('')
    for (const ex of selected) {
      lines.push(`  👤 المستخدم: "${ex.user}"`)
      lines.push(`  🤖 DZ Agent:  "${ex.agent}"`)
      lines.push('')
    }
  }

  // ─── ⑥ قواعد الرد الإلزامية ───────────────────────────────────────────
  lines.push('📌 **قواعد الرد بالدارجة** (مُلزِمة):')
  lines.push('  ① رد بالدارجة الجزائرية الطبيعية — مزيج عربي+فرنسي مقبول ومتداول')
  lines.push('  ② استخدم: بزاف / ماكانش / راني / واش / كيفاش / علاه / مزيان / لاباس / صحيت / خويا')
  lines.push('  ③ المعلومة تبقى دقيقة وصحيحة — الدارجة في الأسلوب فقط وليس في المعلومات')
  lines.push('  ④ لا تترجم كل شيء للفصحى — تكلم كيما الجزائري العادي مع صاحبه')
  lines.push('  ⑤ كلمات تقنية (AI, code, app, Wi-Fi) تبقى كما هي — لا تعرّبها قسراً')
  lines.push('  ⑥ لا تبدأ كل جملة بـ "بالطبع" أو "بالفعل" — ابدأ بالدارجة مباشرة')
  lines.push('  ⑦ الإيموجي مقبول في السياق الودي — لا تفرط فيه ولا تمنعه كلياً')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  return lines.join('\n')
}

/**
 * getDarijaVocabContext()
 * يُعيد قائمة مفردات مختصرة جداً (للحقن السريع في prompts أخرى)
 */
export function getDarijaVocabContext() {
  const corpus = loadCorpus()
  const vocab = corpus.vocabulary || []
  const core = vocab
    .filter(w => ['state','negation','question','discourse','verb'].includes(w.cat))
    .slice(0, 60)
    .map(w => `${w.dz}=${w.ar}`)
  return core.join(' | ')
}

/** إعادة تحميل الـ corpus يدوياً (بعد تحديث الملف) */
export function reloadDarijaCorpus() {
  _corpus = null
  _loadedAt = 0
  return loadCorpus()
}
