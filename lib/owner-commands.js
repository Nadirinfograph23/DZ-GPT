/**
 * DZ Agent — Owner Command & Training System
 * يتيح للمالك الموثَّق تدريب الوكيل في وقت التشغيل بلغة طبيعية.
 *
 * أنواع الأوامر:
 *   add_feed        — إضافة مصدر أخبار (RSS + breaking)
 *   remove_feed     — حذف مصدر أخبار
 *   list_feeds      — عرض مصادر الأخبار المضافة
 *   train_fact      — تعليم الوكيل معلومة/حقيقة
 *   train_qa        — تعليمه إجابة معيّنة لسؤال معيّن
 *   train_behavior  — تعليمه سلوكاً عاماً (قاعدة دائمة)
 *   list_training   — عرض كل ما تمّ تدريبه
 *   clear_training  — مسح التدريب (بتأكيد)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname }     from 'path'
import { fileURLToPath }     from 'url'

const __dirname     = dirname(fileURLToPath(import.meta.url))
const DATA_DIR      = join(__dirname, '../data')
const CONFIG_PATH   = join(DATA_DIR, 'owner_config.json')
const TRAINING_PATH = join(DATA_DIR, 'agent_training.json')
const REPO_OWNER    = (process.env.GITHUB_REPO_OWNER || 'Nadirinfograph23').toLowerCase()

// ── Ensure data dir ───────────────────────────────────────────────────────────
try { if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true }) } catch {}

// ══════════════════════════════════════════════════════════════════════════════
// LOAD / SAVE
// ══════════════════════════════════════════════════════════════════════════════
export function loadOwnerConfig() {
  try   { return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) }
  catch { return { feeds: [], commands_log: [], version: 1 } }
}

export function saveOwnerConfig(config) {
  try { writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8') }
  catch (e) { console.error('[OwnerCmd] Failed to save config:', e.message) }
}

export function loadTrainingData() {
  try {
    const d = JSON.parse(readFileSync(TRAINING_PATH, 'utf-8'))
    // Ensure new fields exist (backward-compatible migration)
    if (!d.corrections)  d.corrections  = []
    if (!d.definitions)  d.definitions  = []
    if (!d.sources)      d.sources      = []
    return d
  } catch {
    return { behaviors: [], facts: [], qa_pairs: [], corrections: [], definitions: [], sources: [], persona: {}, commands_log: [], version: 1 }
  }
}

export function saveTrainingData(data) {
  try { writeFileSync(TRAINING_PATH, JSON.stringify(data, null, 2), 'utf-8') }
  catch (e) { console.error('[OwnerTraining] Failed to save training:', e.message) }
}

// ══════════════════════════════════════════════════════════════════════════════
// OWNER VERIFICATION (GitHub API)
// ══════════════════════════════════════════════════════════════════════════════
const _ownerCache = new Map()

export async function verifyOwnerToken(token) {
  if (!token) return false
  if (_ownerCache.has(token)) return _ownerCache.get(token)
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `token ${token}`,
        'User-Agent':  'DZ-Agent/2.0',
        Accept:        'application/vnd.github.v3+json',
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) { _ownerCache.set(token, false); return false }
    const user    = await res.json()
    const isOwner = user.login?.toLowerCase() === REPO_OWNER
    _ownerCache.set(token, isOwner)
    setTimeout(() => _ownerCache.delete(token), 10 * 60 * 1000)
    return isOwner
  } catch {
    return false
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMAND DETECTION — أنماط اللغة الطبيعية
// ══════════════════════════════════════════════════════════════════════════════

// ── إضافة مصدر أخبار ──────────────────────────────────────────────────────────
const ADD_FEED_PATTERNS = [
  // "سجل هذا الموقع ضمن مصدر أخبار الجزائر: URL"
  /(?:سجّ?ل|ثبّ?ت|ادرج|أدرج)\s+(?:هذا\s+)?(?:الموقع|المصدر|الرابط)\s+(?:ضمن|في|كـ?)?[^::\n]*[:\-–]\s*(https?:\/\/\S+)/i,
  // "أضف/اضف لمصادر الأخبار: URL"
  /(?:أضف|اضف)\s+(?:لـ?)?(?:مصادر|مصدر)\s+[^::\n]*[:\-–]?\s*(https?:\/\/\S+)/i,
  // "أضف/اضف هذا الموقع/المصدر: URL"
  /(?:أضف|اضف)\s+(?:هذا\s+)?(?:الموقع|المصدر|موقع)\s*[:\-–]?\s*(https?:\/\/\S+)/i,
  // "أضف مصدر أخبار جزائر: URL"
  /(?:أضف|اضف)\s+(?:مصدر|موقع)\s+[أa]خبار[^::\n]*[:\-–]?\s*(https?:\/\/\S+)/i,
  // "علّم الوكيل هذا المصدر: URL"
  /(?:علّ?م|أضف\s+للوكيل)\s+[^::\n]*مصدر[^::\n]*[:\-–]\s*(https?:\/\/\S+)/i,
  // "add news source: URL"
  /add\s+(?:news\s+)?source\s*[:\-]?\s*(https?:\/\/\S+)/i,
  // مجرد URL وحده مع كلمة "مصدر" أو "أخبار" في نفس الرسالة (fallback)
  /(?:مصدر|أخبار|خبر|feed|rss)[^::\n]*\n?\s*(https?:\/\/\S+)/i,
]

// ── حذف مصدر أخبار ───────────────────────────────────────────────────────────
const REMOVE_FEED_PATTERNS = [
  /(?:احذف|حذف|ازل|أزل|امسح|مسح|ألغِ|الغ)\s+(?:مصدر\s+)?(?:أخبار\s+)?[:\-–]?\s*(https?:\/\/\S+)/i,
  /remove\s+(?:news\s+)?source\s*[:\-]?\s*(https?:\/\/\S+)/i,
]

// ── عرض مصادر الأخبار ────────────────────────────────────────────────────────
const LIST_FEEDS_PATTERNS = [
  /(?:اعرض|عرض|قائمة|list|اظهر|أظهر)\s+(?:مصادر|مصدر)\s+(?:الأخبار|المضافة|الجزائرية)/i,
  /(?:ما|ماهي|ما هي)\s+(?:مصادر|مصدر)\s+(?:الأخبار|المضافة)/i,
  /show\s+(?:news\s+)?sources/i,
]

// ── تعليم معلومة/حقيقة ───────────────────────────────────────────────────────
const TRAIN_FACT_PATTERNS = [
  /(?:تعلّ?م|خزّ?ن|احفظ|اعرف|تذكّ?ر)\s+(?:هذه\s+المعلومة|هذه الحقيقة|هذا|أن|أنّ|ان|انّ)[:\-–]?\s*(.{10,300})/i,
  /(?:معلومة\s+(?:جديدة|مهمة)|حقيقة)[:\-–]\s*(.{10,300})/i,
  /learn\s+(?:this\s+fact|that)[:\-]?\s*(.{10,300})/i,
  /(?:save|remember|store)\s+(?:this\s+)?(?:fact|info)[:\-]?\s*(.{10,300})/i,
]

// ── تعليم سؤال وجواب ─────────────────────────────────────────────────────────
const TRAIN_QA_PATTERNS = [
  /(?:عندما\s+يسأل|إذا\s+سأل)[^::\n،]+(?:عن\s+)?[«"]?([^»":\n]{3,80})[»"]?\s*[،,]?\s*(?:أجب|رد)[:\-–]?\s*(.{5,400})/i,
  /(?:سؤال|س)[:\-–]\s*([^\n]{5,120})\s*\n+(?:جواب|ج|إجابة)[:\-–]\s*(.{5,400})/i,
  /(?:question|q)[:\-]\s*([^\n]{5,120})\s*\n+(?:answer|a)[:\-]\s*(.{5,400})/i,
  /(?:أضف\s+)?(?:إجابة|جواب|رد)\s+(?:على\s+)?(?:سؤال\s+)?[«"]?([^»":\n]{5,80})[»"]?[:\-–]\s*(.{5,400})/i,
]

// ── تعليم سلوك عام ───────────────────────────────────────────────────────────
const TRAIN_BEHAVIOR_PATTERNS = [
  /(?:دائماً|دائما|ابداً\s+ما|في\s+كل\s+مرة)\s+(?:أجب|رد|استخدم|تصرف|أضف)[^:\n]*[:\-–]?\s*(.{10,300})/i,
  /(?:قاعدة\s+عامة|سلوك\s+عام|سلوك\s+دائم|تعليمات\s+دائمة)[:\-–]\s*(.{10,300})/i,
  /(?:behavior|rule|always|general rule)[:\-]\s*(.{10,300})/i,
]

// ── عرض التدريب ──────────────────────────────────────────────────────────────
const LIST_TRAINING_PATTERNS = [
  /(?:اعرض|عرض|قائمة|اظهر|أظهر)\s+(?:كل\s+)?(?:التدريب|المعلومات|البيانات)\s+(?:المدرَّبة|المحفوظة|المخزنة)/i,
  /show\s+(?:all\s+)?training(?:\s+data)?/i,
  /(?:ما\s+ذا\s+تعرف|ماذا\s+تعرف|ما\s+تعلمته|ما\s+علمتك)/i,
]

// ── مسح التدريب ──────────────────────────────────────────────────────────────
const CLEAR_TRAINING_PATTERNS = [
  /(?:امسح|احذف|ألغِ\s+|الغ\s+)(?:كل\s+)?(?:التدريب|المعلومات\s+المحفوظة|البيانات\s+المدرَّبة)\s*(?:\(تأكيد\)|تأكيد|confirm)?/i,
  /clear\s+(?:all\s+)?training(?:\s+confirm)?/i,
]

// ── اختصارات حفظ التصحيح (دون محتوى صريح — المالك يشير لسياق سابق) ───────────
const SAVE_CORRECTION_SHORTCUT = [
  /^(?:احفظ|إحفظ|خزّن|خزن|تذكّر|تذكر|سجّل|سجل)\s+(?:التصحيح|هذا التصحيح|التصحيحات|هذه التصحيحات)\s*$/i,
  /^(?:save|keep|store)\s+(?:the\s+)?(?:correction|fix)\s*$/i,
  /^(?:احفظ|إحفظ)\s+(?:هذا|هذه|ذلك)\s*$/i,
]

// ── تصحيحات (الصواب / خطأ / ليس X بل Y) ─────────────────────────────────────
const CORRECTION_PATTERNS = [
  // "الصواب هو X" / "الصحيح هو X"
  /(?:الصواب|الصحيح)\s+(?:هو|هي|أن|انّ|أنّ)\s+(.{5,300})/i,
  // "هذا خطأ، الصواب: X"
  /(?:هذا|هذه)\s+خطأ[،,]?\s*(?:الصواب|الصحيح|والصحيح)[:\-–]?\s*(.{5,300})/i,
  // "صحح: X" أو "تصحيح: X" — مع أو بدون نقطتين
  /(?:صحّ?ح|تصحيح)[:\-–]\s*(.{5,300})/i,
  // "X صحح و احفظ الإجابة الصحيحة" — الجملة قبل "صحح" هي المعلومة الصحيحة
  /^(.{5,200})\s+صحّ?ح\s+(?:واحفظ|و\s*احفظ|و\s*إحفظ|واحفظها)\s+(?:الإجابة\s+)?الصحيح(?:ة)?/im,
  // "صحح و احفظ الإجابة الصحيحة: X" — المعلومة بعد الأمر
  /^صحّ?ح\s+(?:واحفظ|و\s*احفظ|و\s*إحفظ)\s+(?:الإجابة\s+)?الصحيح(?:ة)?[:\-–]?\s*(.{5,300})/i,
  // "احفظ الإجابة الصحيحة: X" / "احفظ الجواب الصحيح: X"
  /(?:احفظ|إحفظ)\s+(?:الإجابة|الجواب|المعلومة)\s+الصحيح(?:ة)?[:\-–]?\s*(.{5,300})/i,
  // "ليس X بل Y" / "X ليست Y بل Z"
  /(?:ليس|ليست|لا يجوز قول)\s+[^\n،,]+(?:بل|وإنما|إنما|بل هو|بل هي)\s+(.{5,300})/i,
  // "في الحقيقة X" / "في الواقع X"
  /(?:في\s+الحقيقة|في\s+الواقع|الحقيقة\s+هي|الحقيقة\s+أن)\s+(.{5,300})/i,
  // "correction: X" / "fix: X"
  /(?:correction|fix\s+this)[:\-–]\s*(.{5,300})/i,
]

// ── تعريفات جديدة (X هو Y / X تعني Y) ───────────────────────────────────────
const DEFINITION_PATTERNS = [
  // "X هو/هي Y" حيث X كلمة أو عبارة قصيرة
  /^([^.\n]{2,40})\s+(?:هو|هي|هم|هن|هما)\s+(.{5,250})[.؟!]?$/im,
  // "X تعني / تعنى Y"
  /([^.\n]{2,40})\s+(?:تعني?|يعني?)\s+(.{5,250})/i,
  // "تعريف X: Y" / "معنى X: Y"
  /(?:تعريف|معنى|معنى كلمة)\s+([^:\n]{2,40})[:\-–]\s*(.{5,250})/i,
  // "X = Y" (مصطلح تقني)
  /^([A-Za-z\u0600-\u06FF][^\n=]{1,40})\s*=\s*(.{5,250})$/im,
  // "definition of X: Y"
  /definition\s+of\s+([^:\n]{2,40})[:\-–]\s*(.{5,250})/i,
]

// ── مصادر مرجعية يشاركها المالك ───────────────────────────────────────────────
const OWNER_SOURCE_PATTERNS = [
  // "مرجع: URL" / "مصدر موثوق: URL"
  /(?:مرجع|مصدر\s+موثوق|مصدر\s+مهم|مصدر\s+علمي|وثيقة|رابط\s+مهم)[:\-–]?\s*(https?:\/\/\S+)/i,
  // "راجع: URL" / "اعتمد هذا: URL"
  /(?:راجع|يمكن\s+مراجعة|اعتمد|استخدم)\s+(?:هذا\s+)?(?:المصدر|الرابط|الموقع)?[:\-–]?\s*(https?:\/\/\S+)/i,
  // "reference: URL"
  /(?:reference|source|see\s+also)[:\-–]?\s*(https?:\/\/\S+)/i,
]

export function detectOwnerCommand(msg) {
  const trimmed = (msg || '').trim()
  if (CLEAR_TRAINING_PATTERNS.some(p => p.test(trimmed)))   return 'clear_training'
  if (LIST_TRAINING_PATTERNS.some(p =>  p.test(trimmed)))   return 'list_training'
  if (LIST_FEEDS_PATTERNS.some(p =>     p.test(trimmed)))   return 'list_feeds'
  if (ADD_FEED_PATTERNS.some(p =>       p.test(trimmed)))   return 'add_feed'
  if (REMOVE_FEED_PATTERNS.some(p =>    p.test(trimmed)))   return 'remove_feed'
  // ── اختصار حفظ التصحيح — يجب فحصه قبل CORRECTION_PATTERNS ─────────────────
  if (SAVE_CORRECTION_SHORTCUT.some(p => p.test(trimmed))) return 'save_correction_shortcut'
  if (TRAIN_QA_PATTERNS.some(p =>       p.test(trimmed)))   return 'train_qa'
  if (TRAIN_FACT_PATTERNS.some(p =>     p.test(trimmed)))   return 'train_fact'
  if (TRAIN_BEHAVIOR_PATTERNS.some(p => p.test(trimmed)))   return 'train_behavior'
  if (CORRECTION_PATTERNS.some(p =>     p.test(trimmed)))   return 'train_correction'
  if (DEFINITION_PATTERNS.some(p =>     p.test(trimmed)))   return 'train_definition'
  if (OWNER_SOURCE_PATTERNS.some(p =>   p.test(trimmed)))   return 'train_source'
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// IMPLICIT OWNER LEARNING — اكتشاف تلقائي حتى بدون أوامر صريحة
// يُشغَّل على كل رسالة من المالك المتصل بـ GitHub
// ══════════════════════════════════════════════════════════════════════════════
export function processImplicitOwnerLearning(msg) {
  const timestamp = new Date().toISOString()
  const training  = loadTrainingData()
  const saved     = []

  // ── 1. تصحيحات ──────────────────────────────────────────────────────────────
  for (const p of CORRECTION_PATTERNS) {
    const m = msg.match(p)
    if (m?.[1]) {
      const correct = m[1].trim()
      // استخراج "الخاطئ" إذا وُجد (ليس X بل Y)
      const wrongMatch = msg.match(/(?:ليس|ليست|لا\s+يجوز\s+قول)\s+([^بوإ\n،,]{3,60})(?:بل|وإنما|إنما)/)
      const wrong = wrongMatch?.[1]?.trim() || ''

      const isDup = training.corrections.some(c => c.correct === correct)
      if (!isDup) {
        training.corrections.push({ wrong, correct, raw: msg.slice(0, 200), addedAt: timestamp })
        training.commands_log.push({ cmd: 'auto_correction', correct, wrong, timestamp })
        saved.push({ type: 'correction', correct, wrong })
      }
      break
    }
  }

  // ── 2. تعريفات ──────────────────────────────────────────────────────────────
  for (const p of DEFINITION_PATTERNS) {
    const m = msg.match(p)
    if (m?.[1] && m?.[2]) {
      const term       = m[1].trim()
      const definition = m[2].trim()
      const isDup = training.definitions.some(d => d.term.toLowerCase() === term.toLowerCase())
      if (!isDup && definition.length >= 5) {
        training.definitions.push({ term, definition, addedAt: timestamp })
        training.commands_log.push({ cmd: 'auto_definition', term, definition, timestamp })
        saved.push({ type: 'definition', term, definition })
      }
      break
    }
  }

  // ── 3. مصادر مرجعية ─────────────────────────────────────────────────────────
  for (const p of OWNER_SOURCE_PATTERNS) {
    const m = msg.match(p)
    if (m?.[1]) {
      const url  = m[1].trim()
      const name = guessSourceName(url)
      // وصف المصدر: النص قبل الرابط (حتى 80 حرف)
      const desc = msg.replace(url, '').replace(/[:\-–]/g, '').trim().slice(0, 80)
      const isDup = training.sources.some(s => s.url === url)
      if (!isDup) {
        training.sources.push({ name, url, description: desc, addedAt: timestamp })
        training.commands_log.push({ cmd: 'auto_source', url, name, timestamp })
        saved.push({ type: 'source', name, url })
      }
      break
    }
  }

  if (saved.length > 0) {
    saveTrainingData(training)
    console.log(`[OwnerLearning] ✅ auto-saved: ${JSON.stringify(saved)}`)
  }

  return saved  // [] if nothing learned
}

// ══════════════════════════════════════════════════════════════════════════════
// PENDING CORRECTION BUFFER — تصحيح معلَّق تلقائي من سياق المحادثة
// ══════════════════════════════════════════════════════════════════════════════

// أنماط الرفض والخلاف مع الإجابة السابقة
const DISAGREE_PATTERNS = [
  /^(?:لا[,،]?\s*|كلا[,،]?\s*)(?:هذا|هذه|ذلك|هاذ)?\s*(?:غلط|خطأ|مش صحيح|ماشي صحيح|مش زين|مش مليح|ماشي مليح|مش مليح|خاطئ|مغلوط)/i,
  /^(?:لا[,،]?\s*|لأ[,،]?\s*)(?:الصحيح|الصواب|والصحيح|والصواب)\s+(?:هو|هي|أن|انّ)/i,
  /^(?:غلط|خطأ|ماشي صحيح|مش صحيح)[,،]?\s+(?:الصحيح|الصواب|المفروض|يلزم|لازم)/i,
  /^(?:صحّح|حسّن|عدّل)[,،]?\s+(?:الإجابة|الجواب|ردك|ردّك)/i,
  /^(?:هذه?|هاذ(?:ي|ا)?)\s+(?:الإجابة|المعلومة|المعلومات)\s+(?:خاطئة?|غلط|مش صحيح)/i,
  /^(?:في الحقيقة|في الواقع|على الحقيقة)[,،]?\s+(?:الصحيح|الأمر|الموضوع|هو|هي)/i,
]

// أنماط استخراج الصواب من رسالة التصحيح المعلّق
const PENDING_CORRECT_EXTRACT = [
  /(?:الصحيح|الصواب|المفروض|الجواب الصحيح|الصح)[:\s]+(.{5,400})/i,
  /(?:بل|وإنما|إنما|بالعكس)\s+(.{5,400})/i,
  /(?:الحقيقة|في الواقع)[:\s]+(.{5,400})/i,
  /(?:والصح|والصواب)[:\s]+(.{5,400})/i,
]

// أنماط كشف التصحيح الموسّعة — صارمة لتمييز التصحيح الحقيقي عن الرد العادي
const EXTENDED_DISAGREE_PATTERNS = [
  ...DISAGREE_PATTERNS,
  // "خطأ نحن في الصيف" — يشترط وجود محتوى واقعي (≥4 حروف) بعد كلمة الرفض
  /^(?:غلط|خطأ)[,،\s]+.{4,}/i,
  // "لا، الصحيح..." / "لأ، الصواب..." / "لا، نحن في..." — يشترط متابعة بكلمة تصحيحية
  /^(?:لا|لأ)[,،\s]+(?:الصحيح|الصواب|نحن|نحنا|إحنا|في\s+الحقيقة|المفروض|راهنا|حنا)/i,
  // "مش هكذا، ..." أو "ماشي هكا، ..."
  /^(?:مش|ماشي)\s+(?:هكذا|هكا|صح|صحيح)[,،\s]+.{3,}/i,
  // تصحيح مباشر للفصل أو المكان أو الوقت
  /^(?:نحن|نحنا|إحنا|احنا|راهنا|حنا)\s+في\s+(?:الصيف|الشتاء|الربيع|الخريف|عام|سنة|شهر|فصل)/i,
  // "المعلومة الصحيحة هي..." أو "الصحيح أن..."
  /^(?:المعلومة\s+الصحيحة|الصحيح\s+(?:أن|هو|هي|أنّ))\s+.{3,}/i,
]

/**
 * autoSaveOwnerCorrection
 * يُكتشف تلقائياً عندما يختلف المالك مع رد الوكيل السابق.
 * يحفظ التصحيح **فوراً** بدون انتظار تأكيد في data/agent_training.json.
 *
 * @param {string} currentMsg      — رسالة المالك الحالية
 * @param {string} lastAgentText   — آخر رد صادر من الوكيل
 * @returns {{ correct: string, wrong: string } | null}
 */
export function autoSaveOwnerCorrection(currentMsg, lastAgentText = '') {
  if (!currentMsg || currentMsg.length < 3) return null

  const trimmed = currentMsg.trim()

  // هل الرسالة تتضمن تصحيحاً؟
  const isDisagreement = EXTENDED_DISAGREE_PATTERNS.some(p => p.test(trimmed))
  if (!isDisagreement) return null

  // استخراج الصواب من الرسالة
  let correct = ''
  for (const p of PENDING_CORRECT_EXTRACT) {
    const m = trimmed.match(p)
    if (m?.[1]) { correct = m[1].trim().replace(/\n.*/s, '').slice(0, 400); break }
  }

  // إذا لم نجد نمطاً صريحاً — الرسالة كلها هي التصحيح بعد حذف كلمات الرفض
  if (!correct) {
    correct = trimmed
      .replace(/^(?:لا|لأ|كلا)[,،]?\s*/i, '')
      .replace(/^(?:غلط|خطأ|ماشي صحيح|مش صحيح|مش|ماشي)[,،\s]*/i, '')
      .trim()
  }

  if (!correct || correct.length < 3) return null

  const snippet    = (lastAgentText || '').slice(0, 200).trim()
  const timestamp  = new Date().toISOString()
  const training   = loadTrainingData()

  // تجنب التكرار
  const isDup = training.corrections.some(c => c.correct === correct)
  if (isDup) return { correct, wrong: snippet, isDup: true }

  // حذف أي تصحيح معلَّق سابق
  training.corrections = training.corrections.filter(c => !c._pending)

  // حفظ فوري بدون _pending — هذا الآن قرار رسمي من المالك
  training.corrections.push({
    wrong:     snippet,
    correct,
    raw:       trimmed.slice(0, 200),
    autoSaved: true,
    source:    'owner_verified',
    addedAt:   timestamp,
  })
  training.commands_log.push({ cmd: 'auto_correction', correct, wrong: snippet, timestamp })
  saveTrainingData(training)

  console.log(`[AutoCorrection] ✅ owner correction saved immediately: "${correct}"`)
  return { correct, wrong: snippet }
}

/**
 * detectAndStorePendingCorrection (kept for backward-compat with save_correction_shortcut flow)
 * الآن يُستدعى فقط لتصحيح الـ _pending القديمة عبر "احفظ التصحيح".
 */
export function detectAndStorePendingCorrection(currentMsg, lastAgentText = '') {
  return autoSaveOwnerCorrection(currentMsg, lastAgentText)
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function extractUrl(msg) {
  const m = msg.match(/https?:\/\/[^\s<>"،,\u060C\u061B]+/)
  return m ? m[0].replace(/[.,;!?،؛]+$/, '') : null
}

function guessSourceName(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    const parts    = hostname.split('.')
    // تحويل اسم النطاق إلى عنوان مقروء
    const base = parts.length >= 2 ? parts[0] : hostname
    return base.charAt(0).toUpperCase() + base.slice(1)
  } catch { return url }
}

function buildRssUrl(url) {
  const base = url.replace(/\/+$/, '')
  const isRss = /feed|rss|atom|\.xml/i.test(url)
  return isRss ? url : `${base}/feed`
}

function extractQaPair(msg) {
  for (const p of TRAIN_QA_PATTERNS) {
    const m = msg.match(p)
    if (m?.[1] && m?.[2]) return { question: m[1].trim(), answer: m[2].trim() }
  }
  return null
}

function extractFact(msg) {
  for (const p of TRAIN_FACT_PATTERNS) {
    const m = msg.match(p)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

function extractBehavior(msg) {
  for (const p of TRAIN_BEHAVIOR_PATTERNS) {
    const m = msg.match(p)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

// ══════════════════════════════════════════════════════════════════════════════
// PROCESS OWNER COMMAND
// ══════════════════════════════════════════════════════════════════════════════
export function processOwnerCommand(msg, config) {
  const cmd       = detectOwnerCommand(msg)
  const cfg       = { ...config, feeds: [...(config.feeds || [])], commands_log: [...(config.commands_log || [])] }
  const timestamp = new Date().toISOString()
  const training  = loadTrainingData()

  // ── ADD FEED ──────────────────────────────────────────────────────────────
  if (cmd === 'add_feed') {
    const url = extractUrl(msg)
    if (!url) {
      return { success: false, message: '⚠️ لم أجد رابطاً صحيحاً في الأمر.\n\nمثال:\n> سجّل هذا الموقع ضمن مصادر أخبار الجزائر: https://www.elbilad.net/feed' }
    }

    let urlHost = ''
    try { urlHost = new URL(url).hostname } catch {}

    if (cfg.feeds.some(f => {
      try { return new URL(f.url).hostname === urlHost } catch { return f.url === url }
    })) {
      return { success: false, message: `ℹ️ هذا المصدر موجود بالفعل في القائمة.\n\n🔗 ${url}` }
    }

    const rssUrl = buildRssUrl(url)
    const name   = guessSourceName(url)

    const newFeed = {
      name,
      url:      rssUrl,
      siteUrl:  url,
      tier:     1,
      type:     'news',
      lang:     'ar',
      trust:    0.80,
      addedBy:  'owner',
      addedAt:  timestamp,
    }

    cfg.feeds.push(newFeed)
    cfg.commands_log.push({ cmd: 'add_feed', url, rssUrl, name, timestamp })

    return {
      success: true,
      config:  cfg,
      feed:    newFeed,
      message: `✅ **تم تسجيل المصدر وحفظه بنجاح!**\n\n📰 **الاسم:** ${name}\n🔗 **RSS:** \`${rssUrl}\`\n🌐 **الموقع:** ${url}\n\n> 📡 المصدر مُضاف الآن في ثلاثة أماكن:\n> • قائمة أخبار RSS العامة (فوري)\n> • نظام الأخبار العاجلة (فوري)\n> • ملف الإعدادات الدائمة ✅\n\nسيُدرَج في نتائج الأخبار الآن لجميع المستخدمين.`,
    }
  }

  // ── REMOVE FEED ──────────────────────────────────────────────────────────
  if (cmd === 'remove_feed') {
    const url = extractUrl(msg)
    if (!url) return { success: false, message: '⚠️ لم أجد رابطاً صحيحاً.\n\nمثال: احذف مصدر: https://www.example.com/feed' }

    let hostname = ''
    try { hostname = new URL(url).hostname } catch {}

    const before = cfg.feeds.length
    cfg.feeds = cfg.feeds.filter(f => {
      try { return new URL(f.url).hostname !== hostname }
      catch { return !f.url.includes(url) }
    })

    if (cfg.feeds.length === before) {
      return { success: false, message: `ℹ️ لم أجد هذا المصدر في القائمة.\n\n🔗 ${url}` }
    }

    cfg.commands_log.push({ cmd: 'remove_feed', url, timestamp })
    return {
      success: true,
      config:  cfg,
      message: `✅ **تم حذف المصدر بنجاح!**\n\n🗑️ تمت إزالة **${hostname || url}** من جميع قوائم المصادر وحُفظ التغيير.`,
    }
  }

  // ── LIST FEEDS ────────────────────────────────────────────────────────────
  if (cmd === 'list_feeds') {
    if (!cfg.feeds.length) {
      return { success: true, config: cfg, message: 'ℹ️ لا توجد مصادر أخبار مضافة حتى الآن.\n\nللإضافة:\n> سجّل هذا الموقع ضمن مصادر أخبار الجزائر: https://example.com/feed' }
    }
    const list = cfg.feeds.map((f, i) =>
      `${i + 1}. **${f.name}** — \`${f.url}\`${f.addedAt ? ` *(${new Date(f.addedAt).toLocaleDateString('ar-DZ')})*` : ''}`
    ).join('\n')
    return { success: true, config: cfg, message: `📋 **مصادر الأخبار المضافة (${cfg.feeds.length}):**\n\n${list}` }
  }

  // ── TRAIN FACT ────────────────────────────────────────────────────────────
  if (cmd === 'train_fact') {
    const fact = extractFact(msg)
    if (!fact) return { success: false, message: '⚠️ لم أفهم المعلومة. مثال:\n> تعلم هذه المعلومة: رقم الطوارئ الجزائري هو 1021' }

    if (training.facts.some(f => f.text === fact)) {
      return { success: false, message: 'ℹ️ هذه المعلومة محفوظة مسبقاً.' }
    }

    training.facts.push({ text: fact, addedAt: timestamp })
    training.commands_log.push({ cmd: 'train_fact', fact, timestamp })
    saveTrainingData(training)

    return {
      success:  true,
      training: true,
      message: `✅ **تم حفظ المعلومة بنجاح!**\n\n📝 **المعلومة المحفوظة:**\n> ${fact}\n\nسأستخدم هذه المعلومة في ردودي من الآن فصاعداً.`,
    }
  }

  // ── TRAIN Q&A ─────────────────────────────────────────────────────────────
  if (cmd === 'train_qa') {
    const pair = extractQaPair(msg)
    if (!pair) return { success: false, message: '⚠️ لم أستطع استخراج السؤال والجواب.\n\nمثال:\n> عندما يسأل أحد عن ساعات العمل، أجب: المكتب مفتوح من 8ص إلى 4م' }

    if (training.qa_pairs.some(q => q.question === pair.question)) {
      return { success: false, message: `ℹ️ هذا السؤال موجود بالفعل.\n\n❓ ${pair.question}` }
    }

    training.qa_pairs.push({ ...pair, addedAt: timestamp })
    training.commands_log.push({ cmd: 'train_qa', ...pair, timestamp })
    saveTrainingData(training)

    return {
      success:  true,
      training: true,
      message: `✅ **تم تدريب الوكيل على هذا السؤال!**\n\n❓ **السؤال:** ${pair.question}\n💬 **الإجابة:** ${pair.answer}\n\nمن الآن، سأستخدم هذه الإجابة تلقائياً.`,
    }
  }

  // ── TRAIN BEHAVIOR ────────────────────────────────────────────────────────
  if (cmd === 'train_behavior') {
    const behavior = extractBehavior(msg)
    if (!behavior) return { success: false, message: '⚠️ لم أستطع استخراج السلوك.\n\nمثال:\n> قاعدة عامة: دائماً أضف "إن شاء الله" في نهاية كل رد' }

    if (training.behaviors.some(b => b.rule === behavior)) {
      return { success: false, message: 'ℹ️ هذا السلوك محفوظ مسبقاً.' }
    }

    training.behaviors.push({ rule: behavior, addedAt: timestamp })
    training.commands_log.push({ cmd: 'train_behavior', rule: behavior, timestamp })
    saveTrainingData(training)

    return {
      success:  true,
      training: true,
      message: `✅ **تم حفظ السلوك الجديد!**\n\n📋 **القاعدة:**\n> ${behavior}\n\nسأطبّق هذا السلوك في جميع ردودي من الآن.`,
    }
  }

  // ── SAVE CORRECTION SHORTCUT — المالك يطلب حفظ تصحيح من السياق السابق ────────
  if (cmd === 'save_correction_shortcut') {
    const recent = training.corrections.slice(-3)
    const pending = training.corrections.filter(c => c._pending)
    if (pending.length > 0) {
      pending.forEach(c => { delete c._pending })
      saveTrainingData(training)
      return {
        success: true, training: true,
        message: `✅ **تم حفظ التصحيح المعلَّق!**\n\n${pending.map(c => `${c.wrong ? `❌ **الخاطئ:** ${c.wrong}\n` : ''}✔️ **الصواب:** ${c.correct}`).join('\n\n')}\n\nسأعتمد هذا في جميع ردودي القادمة.`,
      }
    }
    if (recent.length > 0) {
      const last = recent[recent.length - 1]
      return {
        success: true,
        message: `ℹ️ **آخر تصحيح محفوظ:**\n\n${last.wrong ? `❌ **الخاطئ:** ${last.wrong}\n` : ''}✔️ **الصواب:** ${last.correct}\n\n> إذا أردت تصحيحاً جديداً، اكتب مثلاً:\n> **الصحيح هو:** [نص التصحيح]`,
      }
    }
    return {
      success: false,
      message: '⚠️ **لا يوجد تصحيح في انتظار الحفظ.**\n\nلحفظ تصحيح جديد، اكتب مثلاً:\n> **الصواب هو:** الجزائر تضم 58 ولاية\n\nأو:\n> **هذا خطأ، الصواب:** ...',
    }
  }

  // ── TRAIN CORRECTION (explicit) ───────────────────────────────────────────
  if (cmd === 'train_correction') {
    for (const p of CORRECTION_PATTERNS) {
      const m = msg.match(p)
      if (m?.[1]) {
        const correct = m[1].trim()
        const wrongM  = msg.match(/(?:ليس|ليست|لا\s+يجوز\s+قول)\s+([^بوإ\n،,]{3,60})(?:بل|وإنما|إنما)/)
        const wrong   = wrongM?.[1]?.trim() || ''
        if (training.corrections.some(c => c.correct === correct)) {
          return { success: false, message: 'ℹ️ هذا التصحيح محفوظ مسبقاً.' }
        }
        training.corrections.push({ wrong, correct, raw: msg.slice(0, 200), addedAt: timestamp })
        training.commands_log.push({ cmd: 'train_correction', correct, wrong, timestamp })
        saveTrainingData(training)
        return {
          success: true, training: true,
          message: `✅ **تم حفظ التصحيح!**\n\n${wrong ? `❌ **الخاطئ:** ${wrong}\n` : ''}✔️ **الصواب:** ${correct}\n\nسأعتمد هذا في جميع ردودي القادمة بأولوية عالية.`,
        }
      }
    }
    return { success: false, message: '⚠️ لم أستطع استخراج التصحيح. مثال:\n> الصواب هو: الجزائر عاصمتها الجزائر العاصمة' }
  }

  // ── TRAIN DEFINITION (explicit) ───────────────────────────────────────────
  if (cmd === 'train_definition') {
    for (const p of DEFINITION_PATTERNS) {
      const m = msg.match(p)
      if (m?.[1] && m?.[2]) {
        const term       = m[1].trim()
        const definition = m[2].trim()
        if (training.definitions.some(d => d.term.toLowerCase() === term.toLowerCase())) {
          return { success: false, message: `ℹ️ تعريف **${term}** موجود مسبقاً.` }
        }
        training.definitions.push({ term, definition, addedAt: timestamp })
        training.commands_log.push({ cmd: 'train_definition', term, definition, timestamp })
        saveTrainingData(training)
        return {
          success: true, training: true,
          message: `✅ **تم حفظ التعريف!**\n\n📖 **${term}:** ${definition}\n\nسأستخدم هذا التعريف دائماً في ردودي.`,
        }
      }
    }
    return { success: false, message: '⚠️ لم أستطع استخراج التعريف. مثال:\n> DZ-GPT هو منصة ذكاء اصطناعي جزائرية' }
  }

  // ── TRAIN SOURCE (explicit) ────────────────────────────────────────────────
  if (cmd === 'train_source') {
    const urlM = msg.match(/https?:\/\/[^\s<>"،,\u060C\u061B]+/)
    if (!urlM) return { success: false, message: '⚠️ لم أجد رابطاً. مثال:\n> مرجع: https://www.aps.dz' }
    const url  = urlM[0].replace(/[.,;!?]+$/, '')
    const name = guessSourceName(url)
    const desc = msg.replace(url, '').replace(/[:\-–]/g, '').trim().slice(0, 80)
    if (training.sources.some(s => s.url === url)) {
      return { success: false, message: `ℹ️ المصدر **${name}** موجود مسبقاً.` }
    }
    training.sources.push({ name, url, description: desc, addedAt: timestamp })
    training.commands_log.push({ cmd: 'train_source', url, name, timestamp })
    saveTrainingData(training)
    return {
      success: true, training: true,
      message: `✅ **تم حفظ المصدر المرجعي!**\n\n📚 **${name}:** [${url}](${url})\n\nسأذكر هذا المصدر عند الإجابة على الأسئلة ذات الصلة.`,
    }
  }

  // ── LIST TRAINING ─────────────────────────────────────────────────────────
  if (cmd === 'list_training') {
    const lines = ['## 🧠 بيانات التدريب الحالية للوكيل\n']

    if (training.corrections?.length) {
      lines.push(`### ✔️ التصحيحات المحفوظة (${training.corrections.length})`)
      training.corrections.forEach((c, i) => lines.push(`${i+1}. ${c.wrong ? `~~${c.wrong}~~ → ` : ''}**${c.correct}**`))
    }

    if (training.definitions?.length) {
      lines.push(`\n### 📖 التعريفات المحفوظة (${training.definitions.length})`)
      training.definitions.forEach((d, i) => lines.push(`${i+1}. **${d.term}:** ${d.definition}`))
    }

    if (training.sources?.length) {
      lines.push(`\n### 📚 المصادر المرجعية (${training.sources.length})`)
      training.sources.forEach((s, i) => lines.push(`${i+1}. **${s.name}** — [${s.url}](${s.url})`))
    }

    lines.push(`\n### 📰 مصادر الأخبار المضافة (${cfg.feeds.length})`)
    if (cfg.feeds.length) cfg.feeds.forEach((f, i) => lines.push(`${i+1}. **${f.name}** — \`${f.url}\``))
    else lines.push('_لا توجد مصادر مضافة_')

    lines.push(`\n### 📝 المعلومات المحفوظة (${training.facts.length})`)
    if (training.facts.length) training.facts.forEach((f, i) => lines.push(`${i+1}. ${f.text}`))
    else lines.push('_لا توجد معلومات محفوظة_')

    lines.push(`\n### ❓ أسئلة وأجوبة مُدرَّبة (${training.qa_pairs.length})`)
    if (training.qa_pairs.length) training.qa_pairs.forEach((q, i) => lines.push(`${i+1}. **س:** ${q.question}\n   **ج:** ${q.answer}`))
    else lines.push('_لا توجد أسئلة مدرَّبة_')

    lines.push(`\n### 📋 قواعد السلوك العامة (${training.behaviors.length})`)
    if (training.behaviors.length) training.behaviors.forEach((b, i) => lines.push(`${i+1}. ${b.rule}`))
    else lines.push('_لا توجد قواعد سلوك_')

    return { success: true, config: cfg, message: lines.join('\n') }
  }

  // ── CLEAR TRAINING ────────────────────────────────────────────────────────
  if (cmd === 'clear_training') {
    const hasConfirm = /تأكيد|confirm/i.test(msg)
    if (!hasConfirm) {
      return {
        success: false,
        message: '⚠️ **تحذير!** هذا سيمسح كل بيانات التدريب (التصحيحات، التعريفات، المصادر، المعلومات، الأسئلة، السلوك).\n\nللتأكيد:\n> امسح كل التدريب تأكيد',
      }
    }
    const empty = { behaviors: [], facts: [], qa_pairs: [], corrections: [], definitions: [], sources: [], persona: {}, commands_log: training.commands_log, version: 1 }
    saveTrainingData(empty)
    return { success: true, message: '✅ تم مسح جميع بيانات التدريب. الوكيل عاد للوضع الافتراضي.' }
  }

  return { success: false, message: '⚠️ أمر غير معروف.' }
}

// ══════════════════════════════════════════════════════════════════════════════
// TRAINING CONTEXT INJECTION — حقن التدريب في السياق بالأولوية الصحيحة
// ══════════════════════════════════════════════════════════════════════════════
export function getTrainingContext() {
  try {
    const t = loadTrainingData()
    const lines = []

    // ① تصحيحات — أعلى أولوية (تُلغي أي معلومة سابقة خاطئة)
    if (t.corrections?.length) {
      lines.push('⚠️━━━ تصحيحات إلزامية من المالك — اعتمدها فوراً وابتعد عن الخاطئ ━━━⚠️')
      t.corrections.forEach(c => {
        if (c.wrong) lines.push(`• ❌ لا تقل: "${c.wrong}" | ✔️ الصواب: "${c.correct}"`)
        else         lines.push(`• ✔️ الصواب: "${c.correct}"`)
      })
    }

    // ② تعريفات — استخدمها دائماً عند ذكر المصطلح
    if (t.definitions?.length) {
      lines.push('━━━ تعريفات مُعتمَدة من المالك (استخدمها دائماً) ━━━')
      t.definitions.forEach(d => lines.push(`• **${d.term}**: ${d.definition}`))
    }

    // ③ مصادر مرجعية — اذكرها عند الإجابة عن الموضوعات ذات الصلة
    if (t.sources?.length) {
      lines.push('━━━ مصادر مرجعية موثوقة (اذكرها عند الصلة) ━━━')
      t.sources.forEach(s => lines.push(`• ${s.name}: ${s.url}${s.description ? ` — ${s.description}` : ''}`))
    }

    // ④ قواعد السلوك
    if (t.behaviors?.length) {
      lines.push('━━━ قواعد دائمة من المالك (إلزامية) ━━━')
      t.behaviors.forEach(b => lines.push(`• ${b.rule}`))
    }

    // ⑤ معلومات وحقائق
    if (t.facts?.length) {
      lines.push('━━━ معلومات مُدرَّبة (استخدمها في ردودك) ━━━')
      t.facts.forEach(f => lines.push(`• ${f.text}`))
    }

    // ⑥ أسئلة وأجوبة
    if (t.qa_pairs?.length) {
      lines.push('━━━ أسئلة وأجوبة مُدرَّبة (استخدمها مباشرة إذا طُرح السؤال) ━━━')
      t.qa_pairs.forEach(q => lines.push(`❓ ${q.question}\n💬 ${q.answer}`))
    }

    return lines.length ? lines.join('\n') : ''
  } catch {
    return ''
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EXTRA FEEDS (for RSS injection at startup)
// ══════════════════════════════════════════════════════════════════════════════
export function getExtraFeeds(config) {
  return (config.feeds || []).map(f => ({
    name:   f.name,
    url:    f.url,
    _owner: true,
  }))
}
