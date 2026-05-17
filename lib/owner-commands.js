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
  try   { return JSON.parse(readFileSync(TRAINING_PATH, 'utf-8')) }
  catch { return { behaviors: [], facts: [], qa_pairs: [], persona: {}, commands_log: [], version: 1 } }
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

export function detectOwnerCommand(msg) {
  if (CLEAR_TRAINING_PATTERNS.some(p => p.test(msg))) return 'clear_training'
  if (LIST_TRAINING_PATTERNS.some(p =>  p.test(msg))) return 'list_training'
  if (LIST_FEEDS_PATTERNS.some(p =>    p.test(msg))) return 'list_feeds'
  if (ADD_FEED_PATTERNS.some(p =>      p.test(msg))) return 'add_feed'
  if (REMOVE_FEED_PATTERNS.some(p =>   p.test(msg))) return 'remove_feed'
  if (TRAIN_QA_PATTERNS.some(p =>      p.test(msg))) return 'train_qa'
  if (TRAIN_FACT_PATTERNS.some(p =>    p.test(msg))) return 'train_fact'
  if (TRAIN_BEHAVIOR_PATTERNS.some(p => p.test(msg))) return 'train_behavior'
  return null
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

  // ── LIST TRAINING ─────────────────────────────────────────────────────────
  if (cmd === 'list_training') {
    const lines = ['## 🧠 بيانات التدريب الحالية للوكيل\n']

    // Feeds
    lines.push(`### 📰 مصادر الأخبار المضافة (${cfg.feeds.length})`)
    if (cfg.feeds.length) {
      cfg.feeds.forEach((f, i) => lines.push(`${i+1}. **${f.name}** — \`${f.url}\``))
    } else {
      lines.push('_لا توجد مصادر مضافة_')
    }

    // Facts
    lines.push(`\n### 📝 المعلومات المحفوظة (${training.facts.length})`)
    if (training.facts.length) {
      training.facts.forEach((f, i) => lines.push(`${i+1}. ${f.text}`))
    } else {
      lines.push('_لا توجد معلومات محفوظة_')
    }

    // Q&A
    lines.push(`\n### ❓ أسئلة وأجوبة مُدرَّبة (${training.qa_pairs.length})`)
    if (training.qa_pairs.length) {
      training.qa_pairs.forEach((q, i) => lines.push(`${i+1}. **س:** ${q.question}\n   **ج:** ${q.answer}`))
    } else {
      lines.push('_لا توجد أسئلة مدرَّبة_')
    }

    // Behaviors
    lines.push(`\n### 📋 قواعد السلوك العامة (${training.behaviors.length})`)
    if (training.behaviors.length) {
      training.behaviors.forEach((b, i) => lines.push(`${i+1}. ${b.rule}`))
    } else {
      lines.push('_لا توجد قواعد سلوك_')
    }

    return { success: true, config: cfg, message: lines.join('\n') }
  }

  // ── CLEAR TRAINING ────────────────────────────────────────────────────────
  if (cmd === 'clear_training') {
    const hasConfirm = /تأكيد|confirm/i.test(msg)
    if (!hasConfirm) {
      return {
        success: false,
        message: '⚠️ **تحذير!** هذا سيمسح كل بيانات التدريب (المعلومات، الأسئلة، السلوك).\n\nللتأكيد:\n> امسح كل التدريب تأكيد',
      }
    }
    const empty = { behaviors: [], facts: [], qa_pairs: [], persona: {}, commands_log: training.commands_log, version: 1 }
    saveTrainingData(empty)
    return { success: true, message: '✅ تم مسح جميع بيانات التدريب. الوكيل عاد للوضع الافتراضي.' }
  }

  return { success: false, message: '⚠️ أمر غير معروف.' }
}

// ══════════════════════════════════════════════════════════════════════════════
// TRAINING CONTEXT INJECTION — حقن التدريب في السياق
// ══════════════════════════════════════════════════════════════════════════════
export function getTrainingContext() {
  try {
    const t = loadTrainingData()
    const lines = []

    if (t.behaviors.length) {
      lines.push('━━━ قواعد دائمة من المالك (إلزامية) ━━━')
      t.behaviors.forEach(b => lines.push(`• ${b.rule}`))
    }

    if (t.facts.length) {
      lines.push('━━━ معلومات مُدرَّبة (استخدمها في ردودك) ━━━')
      t.facts.forEach(f => lines.push(`• ${f.text}`))
    }

    if (t.qa_pairs.length) {
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
