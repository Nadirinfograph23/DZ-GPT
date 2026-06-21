/**
 * DZ Darija Behavioral Engine v1.0
 *
 * يفهم السلوك والقصد خلف الكلمات — لا يعتمد على الحفظ فقط
 *
 * الميزات:
 *   ① كشف التعابير الاجتماعية والرد الطبيعي (يعطيك الصحة → بلا مزية)
 *   ② كشف الكلمات غير المفهومة → بحث ويب تلقائي → تحليل → رد
 *   ③ تخزين التعابير المكتشفة في قاعدة البيانات
 *   ④ بناء system prompt سلوكي تفاعلي
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LEARNED_PATH = join(__dirname, '../data/dz_learned.json')

// ══════════════════════════════════════════════════════════════════════════════
// ① التعابير الاجتماعية — مع الردود الطبيعية الجزائرية
// ══════════════════════════════════════════════════════════════════════════════

export const SOCIAL_EXPRESSIONS = {
  // ─── شكر ───────────────────────────────────────────────────────────────────
  'يعطيك الصحة':     { meaning: 'شكراً جزيلاً',        response: 'بلا مزية — راني هنا خدمتك واجب 🤝',          category: 'thanks' },
  'يعطيك صحة':       { meaning: 'شكراً',               response: 'بلا مزية والله 🤝',                           category: 'thanks' },
  'ربي يعطيك الصحة': { meaning: 'شكراً + دعاء',        response: 'بلا مزية — ربي يحفظك ويسعدك 🤍',             category: 'thanks' },
  'يسلمو':           { meaning: 'شكراً / يسلم',        response: 'والله يسلمك — يسعدني كنت مفيد 🙏',            category: 'thanks' },
  'يسلم':            { meaning: 'شكراً / يسلمك',       response: 'يسلمك ربي خويا 🤍',                          category: 'thanks' },
  'مرسي بزاف':       { meaning: 'شكراً جداً (فر.)',    response: 'ولا يهمك — دايما هنا نعاونك 🙂',              category: 'thanks' },
  'مرسي':            { meaning: 'شكراً (فرنسية)',      response: 'ولا يهمك — أي وقت تحتاج أنا هنا 😊',         category: 'thanks' },
  'بارك الله فيك':   { meaning: 'جزاك الله خيراً',     response: 'وفيك بارك الله أخي 🤍',                       category: 'thanks' },
  'الله يخليك':      { meaning: 'دعاء + شكر',          response: 'آمين — ويخليك أنت كذلك 🤍',                  category: 'thanks' },
  'الله يجازيك':     { meaning: 'الله يكافئك',         response: 'آمين — ويجازيك أنت بالخير 🙏',               category: 'thanks' },
  'نشكرك':           { meaning: 'شكراً',               response: 'بلا مزية — هكذا يكون الحال خويا 🤝',          category: 'thanks' },
  'شكرا بزاف':       { meaning: 'شكراً كثيراً',        response: 'بلا مزية — يسعدني كنت مفيد 😊',              category: 'thanks' },
  'ألف شكر':         { meaning: 'ألف شكر',             response: 'بلا مزية والله — راني فرحان خدمتك 🤝',        category: 'thanks' },

  // ─── تحية ───────────────────────────────────────────────────────────────────
  'كيداير':          { meaning: 'كيف حالك',            response: 'لاباس بخير والحمد لله 😊 — واش نقدر نعاونك؟', category: 'greeting' },
  'كي داير':         { meaning: 'كيف حالك',            response: 'لاباس — وأنت كيداير؟ واش عندك؟',             category: 'greeting' },
  'واش راك':         { meaning: 'كيف حالك',            response: 'راني بخير — واش نقدر نعاونك اليوم؟ 😊',      category: 'greeting' },
  'لاباس عليك':      { meaning: 'كيف الحال',           response: 'لاباس والحمد لله — وعليك؟',                  category: 'greeting' },
  'نهارك سعيد':      { meaning: 'يوم سعيد',            response: 'ونهارك مبارك إن شاء الله 🌟',                 category: 'greeting' },
  'صباح النور':      { meaning: 'صباح الخير',          response: 'صباح الياسمين — واش راك؟ 🌸',                category: 'greeting' },
  'مساء النور':      { meaning: 'مساء الخير',          response: 'مساء النور والخير عليك 🌙',                   category: 'greeting' },

  // ─── تحول الموضوع — تعابير الدردشة اليومية (topic-shift expressions) ────────
  'واش الدعوة':      { meaning: 'كيف الحال — عبارة دردشة يومية',  response: 'الدعوة هانية والبط يعوم 😜 — واش عندك جديد؟',   category: 'casual_shift', isTopicShift: true },
  'وش الدعوة':       { meaning: 'كيف الحال (لهجة غرب)',           response: 'الدعوة مليحة — والبط يعوم 😄 كيفاش نعاونك؟',   category: 'casual_shift', isTopicShift: true },
  'الدعوة':          { meaning: 'كيف الأمور — في سياق الدردشة',   response: 'الدعوة هانية 😊 — واش عندك؟',                   category: 'casual_shift', isTopicShift: true },
  'واش الحوايج':     { meaning: 'كيف الأمور (تعبير شعبي)',        response: 'الحوايج مليحة والحمد لله 😊 — وعندك؟',          category: 'casual_shift', isTopicShift: true },
  'واش جديد':        { meaning: 'ما الجديد؟',                    response: 'جديد مليح — أنا راني خدّام نتعلم كل يوم 😄 وأنت؟', category: 'casual_shift', isTopicShift: true },
  'وش جديد':         { meaning: 'ما الجديد؟',                    response: 'جديد خير إن شاء الله 🌟 — وعندك؟',              category: 'casual_shift', isTopicShift: true },
  'واش الأخبار':     { meaning: 'ما الأخبار — دردشة',            response: 'الأخبار خير والحمد لله 😊 — كيفاش نعاونك؟',      category: 'casual_shift', isTopicShift: true },
  'وش الأخبار':      { meaning: 'ما الأخبار',                    response: 'أخبار خير إن شاء الله 🙂 — واش عندك؟',           category: 'casual_shift', isTopicShift: true },
  'شلونك':           { meaning: 'كيف حالك (قريبة من المشرقية)',   response: 'شلوني مليح الحمد لله 😊 — وأنت كيداير؟',        category: 'casual_shift', isTopicShift: true },
  'كيرانك':          { meaning: 'كيف أحوالك',                    response: 'راني بخير يسعدني — وأنت؟ واش نقدر نعاونك؟',      category: 'casual_shift', isTopicShift: true },
  'كي راك':          { meaning: 'كيف حالك',                      response: 'لاباس بخير — وأنت كي راك؟ 😊',                  category: 'casual_shift', isTopicShift: true },
  'بخير':            { meaning: 'بخير — رد على كيف الحال',        response: 'الحمد لله — يسعدني هذا 🤍 كيفاش نعاونك؟',       category: 'casual_shift', isTopicShift: true },

  // ─── وداع ───────────────────────────────────────────────────────────────────
  'سلامة':           { meaning: 'مع السلامة',          response: 'الله يسلمك — رجع متى بغيت أنا هنا 🤍',        category: 'farewell' },
  'بسلامة':          { meaning: 'مع السلامة',          response: 'الله يسلمك — نتلقاو 🙂',                     category: 'farewell' },
  'تصبح على خير':    { meaning: 'تصبح على خير',        response: 'وأنت من أهل الخير — ليلة مباركة 🌙',          category: 'farewell' },
  'الله يوفقك':      { meaning: 'بالتوفيق',            response: 'وإياك إن شاء الله 🙏',                       category: 'farewell' },
  'يسعدك':           { meaning: 'يسعدك',              response: 'ويسعدك أنت ويسعد قلبك 🌟',                   category: 'farewell' },

  // ─── مدح ───────────────────────────────────────────────────────────────────
  'مليح بزاف':      { meaning: 'ممتاز جداً',          response: 'يسعدني هذا — دايما هنا نعاونك 🙏',            category: 'praise' },
  'زوين':            { meaning: 'جميل / رائع',         response: 'يسعد قلبك — شكراً 😊',                      category: 'praise' },
  'قرايتي':          { meaning: 'ذكي / متعلم',         response: 'يسعدني سماع هذا خويا 😄',                    category: 'praise' },
  'مليح بزاف':       { meaning: 'جيد جداً',            response: 'الحمد لله — يسعدني كنت مفيد',                category: 'praise' },
  'برافو عليك':      { meaning: 'أحسنت (فرنسية)',      response: 'شكراً خويا — دايما في الخدمة 💪',            category: 'praise' },
  'عيشك':            { meaning: 'عاش / أحسنت',         response: 'وعيشك أنت — يسعدني كنت مفيد 💚',             category: 'praise' },

  // ─── موافقة + استحسان ──────────────────────────────────────────────────────
  'واه واه':          { meaning: 'نعم نعم / إيجاب',    response: 'هيه — خبرني كيف أعاونك أكثر 😊',             category: 'agreement' },
  'صح صح':           { meaning: 'صحيح صحيح',          response: 'الحمد لله — واش تحب نكمل؟',                  category: 'agreement' },
  'عندك الحق':       { meaning: 'أنت محق',             response: 'يسعدني — واش عندك أسئلة أخرى؟',             category: 'agreement' },

  // ─── دعاء + دعم ─────────────────────────────────────────────────────────────
  'ربي يسهل':        { meaning: 'الله يسهل',           response: 'آمين — ربي يسهل عليك ويوفقك 🤍',             category: 'support' },
  'ربي يعاونك':      { meaning: 'الله يعينك',          response: 'آمين — ويعاونك أنت كذلك 🙏',                 category: 'support' },
  'الله يعاونك':     { meaning: 'الله يعينك',          response: 'آمين يارب — ويعاونك أنت 🙏',                 category: 'support' },

  // ─── تحية صباح/مساء ─────────────────────────────────────────────────────────
  'صباح الخير':      { meaning: 'صباح الخير',          response: 'صباح النور والسرور ☀️ — واش نقدر نعاونك؟',   category: 'greeting' },
  'مساء الخير':      { meaning: 'مساء الخير',          response: 'مساء الفل والياسمين 🌙 — كيفاش نخدموا معاً؟', category: 'greeting' },
  'صباح النور':      { meaning: 'صباح الخير',          response: 'صباح النور والسرور والبهجة ☀️',              category: 'greeting' },

  // ─── هوية وقدرات DZ Agent ────────────────────────────────────────────────────
  'واش يسموك':       { meaning: 'ما اسمك؟',            response: 'أنا DZ Agent، خدام الرجال سيدهم 🦾🤖',       category: 'identity' },
  'شنو اسمك':        { meaning: 'ما اسمك؟',            response: 'أنا DZ Agent — صنع في الجزائر 🇩🇿🤖',        category: 'identity' },
  'منين راك':        { meaning: 'من أين أنت؟',         response: 'من عالم الذكاء الاصطناعي، بلا فيزا بلا باسبور 🌍😆', category: 'identity' },
  'ومنين راك':       { meaning: 'ومن أين أنت؟',        response: 'من عالم الذكاء الاصطناعي، بلا فيزا بلا باسبور 🌍😆', category: 'identity' },
  'واش تقدر تدير':   { meaning: 'ما قدراتك؟',          response: 'نترجم، نكتب، نبرمج، ونعاونك فالدراسة والخدمة 🤓', category: 'identity' },
  'تقدر تدير النيفو': { meaning: 'هل يمكنك رفع مستواي؟', response: 'النيفو عليك، وأنا نعاونك توصلو 🚀',         category: 'identity' },

  // ─── من صنعك / من طورك — بالدارجة الجزائرية ──────────────────────────────
  'شكون خدمك':       { meaning: 'من أنشأك؟',           response: 'خدمني نذير حوامرية (Nadir Houamria) 🇩🇿 — مطور جزائري مشهور بـ Nadir Infograph. منصتي: DZ-GPT 🚀', category: 'identity' },
  'شكون طورك':       { meaning: 'من طوّرك؟',           response: 'طوّرني نذير حوامرية (Nadir Infograph) 🇩🇿 — منصة DZ-GPT المصنوعة في الجزائر 💚', category: 'identity' },
  'شكون صنعك':       { meaning: 'من صنعك؟',            response: 'صنعني نذير حوامرية — Nadir Houamria 🇩🇿 مطور جزائري، منصة DZ-GPT على dz-gpt.vercel.app', category: 'identity' },
  'شكون برمجك':      { meaning: 'من برمجك؟',           response: 'برمجني نذير حوامرية (Nadir Infograph) 🇩🇿 — المطور الجزائري وراء منصة DZ-GPT 🤖', category: 'identity' },
  'مؤسس dz agent':   { meaning: 'من أسّس DZ Agent؟',   response: 'مؤسس DZ Agent هو نذير حوامرية (Nadir Houamria) 🇩🇿 — Nadir Infograph. منصة DZ-GPT على dz-gpt.vercel.app', category: 'identity' },
  'مؤسس dz gpt':     { meaning: 'من أسّس DZ GPT؟',     response: 'مؤسس DZ-GPT هو نذير حوامرية (Nadir Houamria) 🇩🇿 — مطور جزائري، Nadir Infograph. الموقع: dz-gpt.vercel.app', category: 'identity' },
  'من خدمك':         { meaning: 'من أنشأك؟',           response: 'خدمني نذير حوامرية (Nadir Houamria) — Nadir Infograph 🇩🇿، المطور الجزائري وراء DZ-GPT 🚀', category: 'identity' },
  'من طورك':         { meaning: 'من طوّرك؟',           response: 'طوّرني نذير حوامرية — Nadir Infograph 🇩🇿، منصة DZ-GPT — dz-gpt.vercel.app', category: 'identity' },
  'من صنعك':         { meaning: 'من صنعك؟',            response: 'صنعني نذير حوامرية (Nadir Houamria) 🇩🇿 — مطور جزائري، Nadir Infograph، منصة DZ-GPT', category: 'identity' },
  'خدمك شكون':       { meaning: 'من أنشأك؟',           response: 'خدمني نذير حوامرية (Nadir Infograph) 🇩🇿 — المطور وراء DZ-GPT، الموقع: dz-gpt.vercel.app', category: 'identity' },
  'صنعك شكون':       { meaning: 'من صنعك؟',            response: 'صنعني نذير حوامرية — Nadir Houamria 🇩🇿، Nadir Infograph، منصة DZ-GPT', category: 'identity' },

  // ─── استعداد للمساعدة ────────────────────────────────────────────────────────
  'نقدر نسقسيك':     { meaning: 'هل يمكنني أن أسألك؟', response: 'سقسي كيما تحب، الباب محلول 🚪',              category: 'casual_shift', isTopicShift: true },
  'راك فايق':        { meaning: 'هل أنت مستيقظ / جاهز؟', response: 'فايق ومركز 24/24 ⚡',                     category: 'casual_shift', isTopicShift: true },
  'حتى الأسئلة الصعيبة': { meaning: 'حتى الأسئلة الصعبة؟', response: 'هات ما عندك، ونشوفو واش نقدر ندير 💪', category: 'casual_shift', isTopicShift: true },
  'شحال الساعة':     { meaning: 'كم الساعة؟',          response: 'قولي البلاد ونقولك الوقت ⏰',                 category: 'casual_shift', isTopicShift: true },

  // ─── مشاعر وترفيه ────────────────────────────────────────────────────────────
  'راني زهقان':      { meaning: 'أنا ممل / أشعر بالملل', response: 'نهدرولك شوية ولا نجيبلك معلومة عجيبة؟ 😄',  category: 'emotional' },
  'زهقان':           { meaning: 'ملل',                  response: 'نهدرولك شوية ولا نجيبلك معلومة تعجبك؟ 😄',    category: 'emotional' },
  'جيب معلومة':      { meaning: 'أعطني معلومة',         response: 'قلب الأخطبوط فيه 3 قلوب 🐙 — وعيونه 9! واش تبغي تعرف أكثر؟', category: 'casual_shift', isTopicShift: true },
  'عندك نكتة':       { meaning: 'هل عندك نكتة؟',        response: 'واحد قال للذكاء الاصطناعي: تعرف تطبخ؟ قالو: نعرف غير نطيب الأجوبة 😂🤖', category: 'casual_shift', isTopicShift: true },

  // ─── وطنية جزائرية ──────────────────────────────────────────────────────────
  'واش رأيك فالجزائر': { meaning: 'ما رأيك في الجزائر؟', response: 'بلاد المليون ونص مليون شهيد، وبلاد الكرم والرجلة 🇩🇿❤️', category: 'culture' },
  'تحيا الجزائر':    { meaning: 'تحيا الجزائر',         response: 'تحيا الجزائر 🇩🇿🔥 — ورانا ندوّروا عليها باش تبان في عالم الذكاء الاصطناعي!', category: 'culture' },
  'الجزائر':         { meaning: 'ذكر الجزائر',          response: 'بلادي وبلادك 🇩🇿 — واش عندك سؤال عن الجزائر؟', category: 'culture' },

  // ─── برمجة وتقنية خفيفة ──────────────────────────────────────────────────────
  'راني غالط فالكود': { meaning: 'عندي خطأ في الكود',   response: 'ابعث الكود ونشوف وين راه المشكل 👨‍💻',         category: 'tech' },
  'راه يخرج error':  { meaning: 'يظهر خطأ في البرنامج', response: 'Error بلا كود كيما طبيب بلا مريض 😆 — ابعثلي الكود! 💻', category: 'tech' },
  'عندي باغ':        { meaning: 'عندي bug في الكود',    response: 'ابعث الكود والـ Error — ونشوفو معاً 🔍',       category: 'tech' },

  // ─── ترجمة ────────────────────────────────────────────────────────────────────
  'كيفاش نقولو شكرا بالإنجليزية': { meaning: 'كيف نقول شكراً بالإنجليزية؟', response: 'يقولو: Thank you ✅ — أو Thanks, Many thanks, I appreciate it', category: 'translation' },
  'كيفاش نقولو عفوا بالإنجليزية': { meaning: 'كيف نقول عفواً بالإنجليزية؟', response: "يقولو: You're welcome 👍 — أو No problem, Don't mention it, Of course!", category: 'translation' },

  // ─── سياق المهام والعمل — task_context ───────────────────────────────────────
  // ردود DZ Agent على تعابير العمل والتفاعل التقني بالدارجة الجزائرية
  'راني حابس':         { meaning: 'أنا محتار / عالق',   response: 'وين راه المشكل بالضبط؟',                                  category: 'task_context' },
  'ران حابس':          { meaning: 'عالق / واقف',        response: 'وين راه المشكل بالضبط؟',                                  category: 'task_context' },
  'عندي فكرة':         { meaning: 'لدي فكرة',           response: 'احكيها ونطوروها. 💡',                                      category: 'task_context' },
  'عندي فكرا':         { meaning: 'لدي فكرة (لهجة)',    response: 'احكيها ونطوروها. 💡',                                      category: 'task_context' },
  'راك متأكد':         { meaning: 'هل أنت متأكد؟',      response: 'بنسبة كبيرة، بصح ديما خير تراجع المصادر المهمة. 🔍',     category: 'task_context' },
  'واش متأكد':         { meaning: 'هل أنت متأكد؟',      response: 'بنسبة كبيرة، بصح ديما خير تراجع المصادر المهمة. 🔍',     category: 'task_context' },
  'هذا صعيب':          { meaning: 'هذا صعب',            response: 'نقسموه مراحل ويولي أسهل. 🪜',                             category: 'task_context' },
  'هذي صعيبة':         { meaning: 'هذه صعبة',           response: 'نقسموها مراحل وتولي أسهل. 🪜',                            category: 'task_context' },
  'صعيب بزاف':         { meaning: 'صعب جداً',           response: 'نقسموه مراحل ويولي أسهل. 🪜',                             category: 'task_context' },
  'ما عنديش وقت':      { meaning: 'ليس لدي وقت',        response: 'نعطيك الخلاصة مباشرة. ⚡',                                category: 'task_context' },
  'ما عنديش وقتة':     { meaning: 'ليس لدي وقت',        response: 'نعطيك الخلاصة مباشرة. ⚡',                                category: 'task_context' },
  'ما عنديش وقت بزاف': { meaning: 'وقتي محدود',         response: 'نعطيك الخلاصة مباشرة. ⚡',                                category: 'task_context' },
  'فهمت':              { meaning: 'فهمت / استوعبت',     response: 'ممتاز، نكملو؟ 🚀',                                        category: 'task_context' },
  'فهمتها':            { meaning: 'فهمتها',             response: 'ممتاز، نكملو؟ 🚀',                                        category: 'task_context' },
  'عاود شرحها':        { meaning: 'أعد الشرح',          response: 'أكيد، بطريقة أبسط هاذ المرة. 🔄',                         category: 'task_context' },
  'عاود شرح':          { meaning: 'أعد الشرح',          response: 'أكيد، بطريقة أبسط هاذ المرة. 🔄',                         category: 'task_context' },
  'عاودها':            { meaning: 'أعدها / كرّرها',     response: 'أكيد، بطريقة أبسط هاذ المرة. 🔄',                         category: 'task_context' },
  'عطيني أسرع طريقة':  { meaning: 'أعطني أسرع طريقة',  response: 'هذي هي الطريقة المختصرة: ⚡',                             category: 'task_context' },
  'عطيني الأسرع':      { meaning: 'الطريقة الأسرع',     response: 'هذي هي الطريقة المختصرة: ⚡',                             category: 'task_context' },
  'عندك اقتراح':       { meaning: 'هل لديك اقتراح؟',   response: 'عندي أكثر من اقتراح، حسب واش تحتاج. 💬',                 category: 'task_context' },
  'عندك اقتراحات':     { meaning: 'هل لديك اقتراحات؟', response: 'عندي أكثر من اقتراح، حسب واش تحتاج. 💬',                 category: 'task_context' },
  'كمل':               { meaning: 'أكمل / تابع',        response: 'نكمل من النقطة لي وقفنا فيها. 📌',                        category: 'task_context' },
  'كملها':             { meaning: 'أكملها',             response: 'نكمل من النقطة لي وقفنا فيها. 📌',                        category: 'task_context' },
  'زيد كمل':           { meaning: 'أكمل / استمر',       response: 'نكمل من النقطة لي وقفنا فيها. 📌',                        category: 'task_context' },
}

// ══════════════════════════════════════════════════════════════════════════════
// ② كشف التعبير الاجتماعي
// ══════════════════════════════════════════════════════════════════════════════

/**
 * detectSocialExpression(msg)
 * يكشف إذا كانت الرسالة تعبيراً اجتماعياً معروفاً
 * @returns { expression, meaning, response, category } | null
 */
export function detectSocialExpression(msg) {
  if (!msg) return null
  const normalized = msg.trim()
    .replace(/[!.،؟?✓✗]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()

  // تعابير اجتماعية عادةً قصيرة أو جزء من رسالة قصيرة
  for (const [expr, info] of Object.entries(SOCIAL_EXPRESSIONS)) {
    if (normalized.includes(expr.toLowerCase())) {
      return { expression: expr, ...info }
    }
  }

  // كشف أنماط إضافية بـ regex
  if (/^شكر(ا|اً|ك|كم)/.test(normalized) && normalized.length < 40) {
    return { expression: 'شكرا', meaning: 'شكراً', response: 'بلا مزية — يسعدني كنت مفيد 🤝', category: 'thanks' }
  }
  if (/^(سلام|السلام عليكم|مرحبا|أهلا|هلا)\b/.test(normalized) && normalized.length < 30) {
    return { expression: normalized, meaning: 'تحية', response: 'وعليكم السلام ورحمة الله — كيداير؟ واش نقدر نعاونك؟ 😊', category: 'greeting' }
  }
  // كشف "لاباس" المنفردة كرد على كيف الحال
  if (/^لاباس/.test(normalized) && normalized.length < 25) {
    return { expression: 'لاباس', meaning: 'بخير', response: 'الحمد لله 🤍 — كيفاش نعاونك؟', category: 'casual_shift', isTopicShift: true }
  }
  // كشف تحول الموضوع عبر "بالمناسبة" / "على فكرة"
  if (/^(بالمناسبة|على فكرة|بالعلاقة|حاجة أخرى|سؤال آخر|غير الموضوع|بدّل الموضوع)/.test(normalized)) {
    return { expression: normalized.split(' ').slice(0,3).join(' '), meaning: 'تغيير موضوع', response: null, category: 'casual_shift', isTopicShift: true }
  }

  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// ③ كشف الكلمات الدارجة غير المفهومة
// ══════════════════════════════════════════════════════════════════════════════

const KNOWN_DARIJA_WORDS = new Set([
  'واش','كيفاش','علاش','علاه','فين','وين','شكون','شحال','قداه','بكام','فوقاش',
  'بزاف','ياسر','مليح','خايب','مليح','يلا','درك','دروك','ضرك','برك','بصح',
  'خلاص','معليش','ماشي','راني','راك','راه','راها','رانا','تنجم','نجم','يخمم',
  'كلش','قاع','هادا','هادي','زعفان','فرحان','تاني','ديجا','واه','هيه','صاح',
  'غادي','باش','عندي','عندك','عنده','نتا','نتي','هوما','حنا','تاعي','تاعك',
  'تاعو','تاعها','تاعنا','لاباس','مانيش','ماكانش','وايلو','بصاح','كيما',
  'داروها','درها','درني','وليدي','صاحبي','خويا','يا خويا','آه','لا','واه',
  'هيه','مكانش','ما...ش','ولا','بلا','برشة','بزربة','درك','ضرك','دروك',
  'مرحبا','سلام','بسلامة','سلامة','يسلم','يسلمو','مرسي','شكرا','عيشك',
])

/**
 * extractUnknownWords(msg)
 * يستخرج الكلمات الدارجة التي قد تكون غير مفهومة للنموذج
 */
export function extractUnknownWords(msg) {
  if (!msg || msg.length > 300) return []
  const words = msg.trim().split(/\s+/)
  const unknown = []
  for (const word of words) {
    const clean = word.replace(/[^\u0600-\u06FFa-zA-Z]/g, '').toLowerCase()
    if (clean.length < 4) continue
    if (KNOWN_DARIJA_WORDS.has(clean)) continue
    if (/^[\u0600-\u06FF]{4,}$/.test(clean) && !isCommonArabicWord(clean)) {
      unknown.push(clean)
    }
  }
  return [...new Set(unknown)].slice(0, 3)
}

function isCommonArabicWord(word) {
  return /^(الله|ربي|واحد|اثنين|ثلاثة|كيف|لماذا|ماذا|هذا|هذه|ذلك|تلك|هناك|هنا|أنا|أنت|هو|هي|نحن|أنتم|هم|من|ما|لا|نعم|كان|يكون|قال|يقول|كل|بعض|ثم|لكن|أو|إذا|عند|بعد|قبل|في|على|إلى|عن|مع|بين|بلا|بدون|كذلك|أيضا|فقط|جداً|جدا|حتى|منذ|خلال|حول|تحت|فوق|أمام|خلف|يمين|يسار|قليل|كثير|بعيد|قريب|كبير|صغير|جديد|قديم|أول|آخر|يوم|ليلة|صباح|مساء|ساعة|شهر|سنة|رجل|امرأة|ولد|بنت|أب|أم|أخ|أخت|بيت|شارع|مدينة|بلد|عمل|خبر|سؤال|جواب|كلمة|جملة|شيء|وقت|مكان|ذهب|جاء|أخذ|أعطى|دخل|خرج|جلس|قام|نام|أكل|شرب|قرأ|كتب|تكلم|سمع|رأى|يريد|يمكن|يجب|ينبغي|يعني|مثل|طبعا|بالتأكيد|حسنا|أهلا|مرحبا|صحيح|خطأ|مهم|جميل|رائع|ممتاز|عظيم|كلمة|سؤال|جواب|مشكلة|حل|فكرة|معلومة|معلومات|مستخدم|برنامج|تطبيق|موقع|إنترنت|هاتف|حاسوب|شبكة)$/.test(word)
}

// ══════════════════════════════════════════════════════════════════════════════
// ④ البحث عن معنى كلمة دارجة عبر الإنترنت
// ══════════════════════════════════════════════════════════════════════════════

/**
 * searchDarijaWordMeaning(word)
 * يبحث في الإنترنت عن معنى الكلمة الدارجة عبر DuckDuckGo + SearXNG
 */
export async function searchDarijaWordMeaning(word) {
  const query = `معنى "${word}" دارجة جزائرية`
  const results = []

  // DuckDuckGo Instant Answers API (مجاني بدون مفتاح)
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const r = await fetch(ddgUrl, {
      headers: { 'User-Agent': 'DZ-GPT-Agent/1.0 (+https://dz-gpt.vercel.app)' },
      signal: AbortSignal.timeout(5000),
    })
    if (r.ok) {
      const data = await r.json()
      if (data.AbstractText) results.push(data.AbstractText.slice(0, 300))
      if (data.Answer) results.push(data.Answer)
      const related = (data.RelatedTopics || []).slice(0, 2).map(t => t.Text || '').filter(Boolean)
      results.push(...related)
    }
  } catch { /* continue to fallback */ }

  // SearXNG fallback — multiple instances للموثوقية
  if (results.length === 0) {
    const searxInstances = [
      `https://searx.be/search?q=${encodeURIComponent(query)}&format=json&language=ar`,
      `https://search.mdosch.de/search?q=${encodeURIComponent(query)}&format=json&language=ar`,
    ]
    for (const url of searxInstances) {
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': 'DZ-GPT-Agent/1.0' },
          signal: AbortSignal.timeout(6000),
        })
        if (!r.ok) continue
        const data = await r.json()
        const items = (data.results || []).slice(0, 3)
        for (const item of items) {
          if (item.content) results.push(item.content.slice(0, 200))
        }
        if (results.length > 0) break
      } catch { continue }
    }
  }

  return results.filter(Boolean).join(' — ').slice(0, 400) || null
}

// ══════════════════════════════════════════════════════════════════════════════
// ⑤ تخزين + استرجاع التعابير المكتشفة
// ══════════════════════════════════════════════════════════════════════════════

/**
 * learnDarijaExpression(word, context, meaning, source)
 * يحفظ التعبير المكتشف في قاعدة البيانات
 */
export function learnDarijaExpression(word, context = '', meaning = '', source = 'web_search') {
  try {
    let db = { meta: { version: '1.0.0', description: 'Learned Algerian Darija expressions' }, learned: [] }
    if (existsSync(LEARNED_PATH)) {
      db = JSON.parse(readFileSync(LEARNED_PATH, 'utf8'))
    }

    const existing = db.learned.find(e => e.word === word)
    if (existing) {
      existing.seen_count = (existing.seen_count || 0) + 1
      existing.last_seen = new Date().toISOString()
      if (meaning && !existing.guessed_meaning) existing.guessed_meaning = meaning
    } else {
      db.learned.push({
        word,
        context: context?.slice(0, 100) || '',
        guessed_meaning: meaning || '',
        source,
        seen_count: 1,
        learned_at: new Date().toISOString(),
        last_seen: new Date().toISOString(),
      })
    }

    writeFileSync(LEARNED_PATH, JSON.stringify(db, null, 2), 'utf8')
    return true
  } catch { return false }
}

/**
 * getLearned(word)
 * يسترجع تعبيراً مخزّناً مسبقاً
 */
export function getLearned(word) {
  try {
    if (!existsSync(LEARNED_PATH)) return null
    const db = JSON.parse(readFileSync(LEARNED_PATH, 'utf8'))
    return db.learned.find(e => e.word === word) || null
  } catch { return null }
}

// ══════════════════════════════════════════════════════════════════════════════
// ⑥ بناء system prompt سلوكي تفاعلي
// ══════════════════════════════════════════════════════════════════════════════

/**
 * buildSocialBehaviorPrompt(socialExpr, unknownWords, webMeanings)
 * يبني كتلة system prompt للسلوك الاجتماعي التفاعلي بالدارجة
 */
export function buildSocialBehaviorPrompt(socialExpr = null, unknownWords = [], webMeanings = {}) {
  const lines = [
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '🤝  DZ BEHAVIORAL LAYER — الفهم السلوكي التفاعلي',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '📌 **أنت تفهم القصد والسلوك — لا تعتمد على الحفظ فقط.**',
    '',
  ]

  if (socialExpr) {
    if (socialExpr.isTopicShift) {
      lines.push('🔄 **تحوّل في الموضوع كُشف:**')
      lines.push(`  المستخدم غيّر الموضوع فجأة إلى دردشة يومية: "${socialExpr.expression}"`)
      lines.push(`  🎯 **ردّ بـ:** "${socialExpr.response || 'واش عندك؟ 😊'}"`)
      lines.push('  ⚠️ **مهم جداً:** لا تربط هذا الرد بموضوع المحادثة السابقة أبداً.')
      lines.push('  ⚠️ تجاهل السياق السابق كلياً — هذا سؤال جديد منفصل تماماً.')
      lines.push('  ⚠️ الرد يجب أن يكون قصيراً وطبيعياً بالدارجة الجزائرية فقط.')
      lines.push('')
    } else {
      lines.push('⚡ **تعبير اجتماعي مكتشف:**')
      lines.push(`  المستخدم قال: "${socialExpr.expression}" = ${socialExpr.meaning}`)
      lines.push(`  🎯 **ردّ بـ:** "${socialExpr.response}"`)
      lines.push('  هذا هو الرد الطبيعي الجزائري الأصيل — استخدمه مباشرة أو بصيغة مشابهة.')
      lines.push('  ⚠️ لا تقل "شكراً على شكرك" أو "على الرحب" أو "بكل سرور" — هذا غير جزائري.')
      lines.push('  ⚠️ الرد الصحيح على "يعطيك الصحة" = "بلا مزية" وليس "شكراً".')
      lines.push('')
    }
  }

  if (unknownWords.length > 0) {
    lines.push('🔍 **كلمات دارجة تم البحث عنها في الإنترنت:**')
    for (const word of unknownWords) {
      const meaning = webMeanings[word]
      if (meaning) {
        lines.push(`  "${word}" ← ${meaning.slice(0, 150)}`)
      } else {
        lines.push(`  "${word}" ← معنى غير محدد — اطلب توضيحاً بلطف: "سامحني ما فهمتش كلمة [${word}] — شحال تقصد؟"`)
      }
    }
    lines.push('')
  }

  lines.push('📐 **قواعد الفهم السلوكي** (مُلزِمة بدون استثناء):')
  lines.push('  ① "يعطيك الصحة" / "يعطيك صحة" → ردّ بـ "بلا مزية"')
  lines.push('  ② "يسلمو" / "يسلم" → ردّ بـ "والله يسلمك"')
  lines.push('  ③ "بارك الله فيك" → ردّ بـ "وفيك بارك الله"')
  lines.push('  ④ "مرسي" / "شكرا" / "نشكرك" → ردّ بـ "بلا مزية" أو "ولا يهمك"')
  lines.push('  ⑤ "عيشك" → ردّ بـ "وعيشك أنت"')
  lines.push('  ⑥ كلمة دارجة مجهولة → لا تخمّن — اسأل: "سامحني ما فهمتش — شحال تقصد بـ [كلمة]؟"')
  lines.push('  ⑦ بعد التوضيح → سجّل المعنى داخلياً لاستخدامه في المستقبل')
  lines.push('  ⑧ "كيداير" / "واش راك" → ردّ بـ "لاباس بخير" + اسأل عن الحاجة')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  return lines.join('\n')
}
