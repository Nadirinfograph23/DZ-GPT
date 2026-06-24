/**
 * lib/agent-build-engine.js — v1.0
 * Multi-Task Build Engine for DZ Agent Programming Mode
 *
 * بدل طلب LLM واحد ضخم → خطوات متسلسلة متخصصة:
 *   Website : Blueprint → HTML → CSS → JS → Assembly
 *   App/API : Spec     → Core → Integration → Validate
 *   General : Analyze  → Implement → Polish
 *
 * كل خطوة تأخذ نتيجة الخطوة السابقة كسياق → جودة أعلى + أخطاء أقل.
 */

// ── Task type detection ───────────────────────────────────────────────────────

const COMPLEX_WEBSITE_RE = /(?:portfolio|landing|dashboard|متجر|مدونة|blog|e-commerce|ecommerce|لوحة تحكم|موقع شركة|corporate|agency|resto|restaurant|مطعم|صفحة هبوط|صفحة رئيسية|عدة أقسام|multi.?section|fullpage|full.?page|احترافي|professional|كامل|complete|من الصفر|from scratch)/i
const COMPLEX_APP_RE     = /(?:تطبيق|application|app|برنامج|واجهة|API|backend|frontend|full.?stack|react|vue|angular|node|express|flask|django)/i
const SIMPLE_BUILD_RE    = /(?:زر|button|كارد|card|navbar|قائمة بسيطة|simple form|نموذج بسيط|كود بسيط|snippet)/i

/**
 * هل هذا طلب بناء معقد يستحق تقسيم المهام؟
 * @param {string} msg
 * @param {'website'|'code'|'general'} taskHint
 * @returns {boolean}
 */
export function isComplexBuildTask(msg, taskHint = 'general') {
  if (!msg || msg.length < 20) return false
  if (SIMPLE_BUILD_RE.test(msg)) return false

  const isWebsite = taskHint === 'website' || taskHint === 'html' || taskHint === 'web-builder'
  if (isWebsite && COMPLEX_WEBSITE_RE.test(msg)) return true
  if (isWebsite && msg.length > 60) return true

  const isApp = taskHint === 'code' || taskHint === 'technical'
  if (isApp && COMPLEX_APP_RE.test(msg)) return true
  if (isApp && msg.length > 80) return true

  return false
}

// ── Pipeline definitions ──────────────────────────────────────────────────────

/**
 * خطوات بناء الموقع (5 خطوات متسلسلة)
 */
const WEBSITE_PIPELINE = [
  {
    id:   'blueprint',
    icon: '🔍',
    name: 'تحليل المتطلبات',
    systemPrompt: `أنت مهندس ويب خبير. مهمتك تحليل طلب المستخدم وإنشاء مخطط تفصيلي للموقع.

أرجع JSON فقط بهذا الشكل (لا نص خارج JSON):
{
  "title": "اسم الموقع",
  "type": "نوع الموقع (portfolio/landing/dashboard/...)",
  "lang": "ar أو en أو fr",
  "dir": "rtl أو ltr",
  "colorPrimary": "#6366f1",
  "colorAccent": "#a855f7",
  "colorBg": "#0a0a0f",
  "sections": ["hero", "about", "services", "portfolio", "contact"],
  "features": ["animations", "responsive", "dark mode", "particles"],
  "fonts": "Inter, Cairo, Poppins",
  "style": "glassmorphism | neumorphism | minimal | gradient",
  "hasForm": true,
  "hasDarkMode": false,
  "pageCount": 1,
  "techStack": ["HTML5", "CSS3", "JavaScript", "Tailwind", "AOS"],
  "imageStyle": "abstract gradient backgrounds"
}`,
    userTemplate: (msg) => `طلب المستخدم: "${msg}"\n\nحلّل الطلب وأنشئ المخطط الكامل.`,
    maxTokens: 800,
  },
  {
    id:   'html',
    icon: '🏗️',
    name: 'بناء هيكل HTML',
    systemPrompt: `أنت مهندس HTML خبير. بناءً على المخطط المعطى، أنشئ هيكل HTML الكامل.

قواعد صارمة:
- أكتب هيكل HTML5 كامل مع <html>, <head>, <body>
- أضف كل الأقسام (sections) من المخطط
- استخدم semantic HTML (header, main, section, footer)
- أضف IDs واضحة لكل قسم
- ضع placeholders للـ CSS والـ JS: <style>/* STYLE_PLACEHOLDER */</style> و <script>/* SCRIPT_PLACEHOLDER */</script>
- لا تكتب CSS أو JS داخل الـ HTML — فقط الهيكل
- أضف Tailwind CDN و Font Awesome و AOS في <head>
- أرجع HTML فقط — لا شرح، لا markdown`,
    userTemplate: (msg, prev) => {
      const blueprint = prev?.blueprint || {}
      return `المخطط:\n${JSON.stringify(blueprint, null, 2)}\n\nطلب المستخدم: "${msg}"\n\nأنشئ هيكل HTML الكامل مع placeholder للـ style و script.`
    },
    maxTokens: 3000,
  },
  {
    id:   'css',
    icon: '🎨',
    name: 'تصميم CSS',
    systemPrompt: `أنت مصمم CSS خبير متخصص في 2026 Silicon Valley aesthetic.

مهمتك: كتابة كود CSS كامل ومتكامل للموقع.

قواعد صارمة:
- استخدم CSS variables في :root
- أضف animations (keyframes, transitions, AOS triggers)
- أجعله fully responsive (mobile-first)
- glassmorphism / gradient text / bento grid حسب المخطط
- hover effects على كل element تفاعلي
- أرجع CSS خام فقط (لا <style> tags، لا شرح) — CSS code only`,
    userTemplate: (msg, prev) => {
      const blueprint = prev?.blueprint || {}
      const htmlSnippet = (prev?.html || '').slice(0, 2000)
      return `المخطط:\n${JSON.stringify(blueprint, null, 2)}\n\nهيكل HTML (مقتطف):\n${htmlSnippet}\n\nأكتب CSS كامل ومتكامل لهذا الموقع.`
    },
    maxTokens: 3500,
  },
  {
    id:   'js',
    icon: '⚡',
    name: 'برمجة JavaScript',
    systemPrompt: `أنت مطور JavaScript خبير.

مهمتك: كتابة JavaScript كامل للموقع.

قواعد صارمة:
- أضف AOS.init() للـ scroll animations
- أضف navbar sticky + mobile hamburger menu
- أضف smooth scrolling بين الأقسام
- إذا كان هناك form: أضف validation + success message
- أضف loading screen / preloader
- أضف back-to-top button
- استخدم vanilla JS فقط (لا jQuery)
- أرجع JS خام فقط (لا <script> tags، لا شرح) — JS code only`,
    userTemplate: (msg, prev) => {
      const blueprint = prev?.blueprint || {}
      const sections  = blueprint.sections || []
      const hasForm   = blueprint.hasForm   || false
      return `المخطط:\n${JSON.stringify(blueprint, null, 2)}\n\nالأقسام: ${sections.join(', ')}\nهل يوجد form: ${hasForm}\n\nأكتب JavaScript كامل ومتكامل.`
    },
    maxTokens: 2000,
  },
  {
    id:   'assembly',
    icon: '🔧',
    name: 'تجميع وإصلاح',
    systemPrompt: `أنت مهندس full-stack خبير مهمته دمج HTML + CSS + JS في ملف واحد كامل وإصلاح أي أخطاء.

قواعد صارمة:
1. أدمج الـ CSS داخل <style> في <head>
2. أدمج الـ JS داخل <script> قبل </body>
3. احذف الـ placeholders (/* STYLE_PLACEHOLDER */ و /* SCRIPT_PLACEHOLDER */)
4. تأكد أن كل الـ IDs في HTML مستخدمة في CSS/JS
5. أضف زر التحميل في الـ body:
<button onclick="(function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([document.documentElement.outerHTML],{type:'text/html'}));a.download='dz-agent-site.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href)})()" style="position:fixed;bottom:24px;right:24px;z-index:9999;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;border:none;padding:14px 22px;border-radius:14px;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 8px 32px rgba(99,102,241,.5);">⬇️ تحميل</button>
6. تأكد أن الكود يبدأ بـ <!DOCTYPE html> وينتهي بـ </html>
7. أرجع HTML كامل فقط — لا شرح، لا markdown فقط الكود`,
    userTemplate: (_msg, prev) => {
      const html = prev?.html  || ''
      const css  = prev?.css   || ''
      const js   = prev?.js    || ''
      return `HTML الهيكل:\n${html}\n\n====CSS====\n${css}\n\n====JS====\n${js}\n\nادمج الكل في ملف HTML واحد مكتمل ومصحح.`
    },
    maxTokens: 9000,
  },
]

/**
 * خطوات بناء التطبيق / الكود البرمجي
 */
const CODE_PIPELINE = [
  {
    id:   'spec',
    icon: '📋',
    name: 'تحديد المتطلبات',
    systemPrompt: `أنت مهندس برمجيات خبير. حلّل الطلب وحدد:
- اللغة/الإطار المناسب
- البنية المعمارية (architecture)
- الوحدات والدوال المطلوبة
- الـ data structures المحتاجة
- نقاط الإخفاق المحتملة وكيفية معالجتها

أرجع JSON فقط:
{
  "language": "Python/JavaScript/...",
  "framework": "Express/FastAPI/...",
  "modules": ["auth", "database", "api"],
  "functions": ["createUser", "getProducts", "..."],
  "dataStructures": ["User{id,name,email}", "..."],
  "errorHandling": ["try/catch", "validation", "..."],
  "complexity": "simple|medium|complex",
  "estimatedLines": 200
}`,
    userTemplate: (msg) => `الطلب: "${msg}"\n\nحدد المتطلبات الكاملة.`,
    maxTokens: 600,
  },
  {
    id:   'core',
    icon: '⚙️',
    name: 'التنفيذ الأساسي',
    systemPrompt: `أنت مطور برمجيات خبير. نفّذ الكود الأساسي بناءً على المواصفات.

قواعد:
- اكتب كود نظيف وقابل للقراءة
- أضف تعليقات قصيرة للمنطق المعقد
- تعامل مع الحالات الحدية
- استخدم أفضل الممارسات للغة المحددة
- اكتب الكود الحقيقي — لا placeholders`,
    userTemplate: (msg, prev) => {
      const spec = prev?.spec || {}
      return `المواصفات:\n${JSON.stringify(spec, null, 2)}\n\nالطلب: "${msg}"\n\nنفّذ الكود الأساسي كاملاً.`
    },
    maxTokens: 4000,
  },
  {
    id:   'polish',
    icon: '✨',
    name: 'إتمام وتحسين',
    systemPrompt: `أنت مراجع كود خبير. راجع الكود المعطى وحسّنه:

1. أضف error handling لكل الحالات
2. أضف input validation
3. تأكد من صحة المنطق
4. أصلح أي bugs أو مشاكل واضحة
5. أضف تعليقات للدوال المعقدة
6. أعد الكود الكامل المحسّن فقط — لا شرح خارج الكود`,
    userTemplate: (_msg, prev) => {
      const core = prev?.core || ''
      return `الكود المبدئي:\n${core}\n\nراجعه وحسّنه وأعد النسخة النهائية الكاملة.`
    },
    maxTokens: 5000,
  },
]

// ── Pipeline executor ─────────────────────────────────────────────────────────

/**
 * نفّذ pipeline متسلسل مع context passing بين الخطوات
 * @param {Array}    pipeline   - مصفوفة خطوات
 * @param {string}   userMsg    - طلب المستخدم الأصلي
 * @param {Function} aiGenerate - دالة safeGenerateAI
 * @param {Function} onStep     - callback عند كل خطوة (optional) → ({ step, status, result })
 * @returns {Object} نتائج كل خطوة { blueprint, html, css, js, assembly } أو { spec, core, polish }
 */
export async function executeBuildPipeline(pipeline, userMsg, aiGenerate, onStep = null) {
  const results = {}
  const startTime = Date.now()

  console.log(`[AgentBuildEngine] Starting pipeline (${pipeline.length} steps) for: "${userMsg.slice(0, 60)}"`)

  for (const step of pipeline) {
    const stepStart = Date.now()
    if (onStep) onStep({ step: step.id, icon: step.icon, name: step.name, status: 'running' })

    try {
      const userContent = step.userTemplate(userMsg, results)
      const messages = [
        { role: 'system', content: step.systemPrompt },
        { role: 'user',   content: userContent },
      ]

      const taskHint = step.id === 'blueprint' || step.id === 'spec' ? 'reasoning'
        : step.id === 'css'      ? 'code'
        : step.id === 'js'       ? 'code'
        : step.id === 'assembly' ? 'website'
        : step.id === 'html'     ? 'website'
        : step.id === 'core'     ? 'code'
        : step.id === 'polish'   ? 'code'
        : 'code'

      const result = await aiGenerate({
        messages,
        query: `build:${step.id}:${userMsg.slice(0, 40)}`,
        max_tokens: step.maxTokens,
        taskHint,
      })

      const content = result?.content || ''
      const stepMs  = Date.now() - stepStart

      // Parse JSON steps
      let parsed = content
      if (step.id === 'blueprint' || step.id === 'spec') {
        try {
          const jsonMatch = content.match(/\{[\s\S]+\}/)
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
          if (!parsed || typeof parsed !== 'object') parsed = {}
        } catch {
          console.warn(`[AgentBuildEngine] ${step.id}: JSON parse failed — using empty object`)
          parsed = {}
        }
      }

      results[step.id] = parsed
      console.log(`[AgentBuildEngine] ✅ ${step.icon} ${step.name} done in ${stepMs}ms (${content.length}chars)`)

      if (onStep) onStep({ step: step.id, icon: step.icon, name: step.name, status: 'done', durationMs: stepMs })

    } catch (err) {
      console.error(`[AgentBuildEngine] ❌ ${step.name} failed:`, err.message)
      results[step.id] = step.id === 'blueprint' || step.id === 'spec' ? {} : ''
      if (onStep) onStep({ step: step.id, icon: step.icon, name: step.name, status: 'error', error: err.message })
    }
  }

  const totalMs = Date.now() - startTime
  console.log(`[AgentBuildEngine] Pipeline complete in ${totalMs}ms`)
  return results
}

// ── Website builder entry point ───────────────────────────────────────────────

/**
 * بناء موقع بالطريقة المتعددة الخطوات
 * @param {string}   userMsg     - طلب المستخدم
 * @param {Function} aiGenerate  - safeGenerateAI
 * @param {Function} onStep      - callback للـ UI progress
 * @returns {{ htmlCode, cssCode, jsCode, blueprint, success }}
 */
export async function buildWebsiteMultiTask(userMsg, aiGenerate, onStep = null) {
  const results = await executeBuildPipeline(WEBSITE_PIPELINE, userMsg, aiGenerate, onStep)

  const assembledHtml = results.assembly || ''
  const htmlCode = extractCleanHtml(assembledHtml)
  const cssCode  = extractCssFromHtml(htmlCode)
  const jsCode   = extractJsFromHtml(htmlCode)

  const success = htmlCode.length > 500 && /<html/i.test(htmlCode)

  return {
    htmlCode:  htmlCode  || assembledHtml,
    cssCode:   cssCode   || '',
    jsCode:    jsCode    || '',
    blueprint: results.blueprint || {},
    success,
    steps:     results,
  }
}

/**
 * بناء كود/تطبيق بالطريقة المتعددة الخطوات
 * @param {string}   userMsg
 * @param {Function} aiGenerate
 * @param {Function} onStep
 * @returns {{ code, spec, success }}
 */
export async function buildCodeMultiTask(userMsg, aiGenerate, onStep = null) {
  const results = await executeBuildPipeline(CODE_PIPELINE, userMsg, aiGenerate, onStep)

  const finalCode = results.polish || results.core || ''
  const success   = finalCode.length > 50

  return {
    code:    finalCode,
    spec:    results.spec || {},
    success,
    steps:   results,
  }
}

// ── HTML utility helpers ──────────────────────────────────────────────────────

function extractCleanHtml(raw) {
  if (!raw) return ''
  // Remove markdown fences
  let html = raw.replace(/^```(?:html)?\n?/i, '').replace(/\n?```$/i, '').trim()
  // Find DOCTYPE/html start
  const doctypeIdx = html.search(/<!DOCTYPE\s+html/i)
  if (doctypeIdx > 0) html = html.slice(doctypeIdx)
  // If no doctype but has <html
  const htmlIdx = html.search(/<html/i)
  if (htmlIdx > 0 && doctypeIdx < 0) html = html.slice(htmlIdx)
  return html.trim()
}

function extractCssFromHtml(html) {
  if (!html) return ''
  const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
  return match ? match[1].trim() : ''
}

function extractJsFromHtml(html) {
  if (!html) return ''
  const matches = []
  const re = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const src = m[1].trim()
    if (src.length > 10) matches.push(src)
  }
  return matches.join('\n\n')
}

// ── Exports summary ───────────────────────────────────────────────────────────

export const AgentBuildEngine = {
  isComplexBuildTask,
  buildWebsiteMultiTask,
  buildCodeMultiTask,
  executeBuildPipeline,
  WEBSITE_PIPELINE,
  CODE_PIPELINE,
}
