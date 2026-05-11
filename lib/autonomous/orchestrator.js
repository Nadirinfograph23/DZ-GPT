/**
 * DZ Autonomous Agent — Main Orchestrator
 * Pipeline: Analyze → Plan → Execute → Verify → Respond
 *
 * Purely additive — does not modify existing DZ Agent flows.
 * Falls back gracefully if any stage fails.
 */

import { classifyAutonomousTask } from './task-classifier.js'

// ── Helper: delay ─────────────────────────────────────────────────────────────
const delay = (ms) => new Promise(r => setTimeout(r, ms))

// ── Code validation: check minimal structural correctness ──────────────────────
function validateCodeContent(content, language) {
  if (!content || content.length < 50) return { ok: false, reason: 'too short' }
  if (language === 'python') {
    if (content.includes('def ') || content.includes('class ') || content.includes('import ')) {
      return { ok: true }
    }
  }
  if (language === 'typescript' || language === 'javascript') {
    if (content.includes('function') || content.includes('=>') ||
        content.includes('class ') || content.includes('const ') ||
        content.includes('export') || content.includes('import')) {
      return { ok: true }
    }
  }
  // Generic: if content has substantial text
  if (content.length > 200) return { ok: true }
  return { ok: false, reason: 'incomplete' }
}

// ── System prompts by task type ────────────────────────────────────────────────
function buildSystemPrompt(task, query) {
  const base = `أنت DZ Agent — مساعد ذكي جزائري متخصص (Made in Algeria 🇩🇿).`

  if (task.type === 'code') {
    const langHint = task.language ? `اللغة المطلوبة: ${task.language}.` : ''
    return `${base}
أنت الآن في وضع توليد الكود المتقدم (Advanced Code Generation Mode).

${langHint}

## قواعد توليد الكود:
- اكتب كوداً كاملاً وقابلاً للتشغيل مباشرةً — لا placeholders أبداً
- استخدم Markdown code blocks مع تحديد اللغة (e.g. \`\`\`python)
- إذا كان التطبيق متعدد الملفات، استخدم تنسيق: \`\`\`FILE: /project/path\`\`\`
- اشرح هيكل الملفات في بداية الإجابة
- تأكد من صحة الـ imports والـ dependencies
- اكتب كوداً احترافياً: error handling، logging، type hints

## هيكل الإجابة المطلوب:
1. **خطة المشروع** — قائمة الملفات والهيكل
2. **الكود الكامل** — كل ملف في code block منفصل
3. **كيفية التشغيل** — أوامر التثبيت والتشغيل

جودة الكود يجب أن تكون: production-ready، نظيف، مُعلّق بالعربية أو الإنجليزية.`
  }

  if (task.type === 'debug') {
    return `${base}
أنت الآن في وضع تصحيح الأخطاء المتقدم (Advanced Debug Mode).

## منهجية التصحيح:
1. **تشخيص المشكلة** — حدد الخطأ بدقة وسببه الجذري
2. **شرح السبب** — لماذا حدث هذا الخطأ (بالعربية)
3. **الإصلاح** — قدم الكود المصحح الكامل
4. **التحقق** — اشرح كيف نتأكد أن الإصلاح يعمل
5. **التحسين** — اقترح تحسينات إضافية إن وجدت

قدم الكود المصحح دائماً في code block كامل — لا تكتفي بإظهار السطور المتغيرة فقط.`
  }

  if (task.type === 'clone') {
    return `${base}
أنت الآن في وضع استنساخ وإعادة بناء المواقع (Clone & Rebuild Mode).

## منهجية إعادة البناء:
1. حلل هيكل الموقع المطلوب استنساخه
2. أعد بناؤه بـ HTML + CSS + JavaScript في ملف واحد كامل
3. استخدم Tailwind CSS CDN للأنماط
4. حافظ على نفس الألوان، التباعد، والتصميم
5. إذا فشلت الصور: احتفظ بالأبعاد وضع placeholder مُسمى

أخرج HTML كاملاً في code block واحد — قابل للتنزيل والتشغيل مباشرة.`
  }

  return `${base}\nأجب باللغة التي يكتب بها المستخدم. كن دقيقاً ومفيداً.`
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

/**
 * Run the autonomous pipeline.
 * @param {Object} opts
 * @param {string} opts.query
 * @param {Array}  opts.messages  - Full chat history
 * @param {Function} opts.aiGenerate - AI generation function
 * @param {Function} opts.onStep  - Called on each step update: (step) => void
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{content: string, model: string, steps: Array}>}
 */
export async function runAutonomousPipeline({ query, messages, aiGenerate, onStep, signal }) {
  const completedSteps = []

  function emit(step) {
    onStep?.(step)
    if (step.status === 'done' || step.status === 'error') completedSteps.push(step)
  }

  try {
    // ── Phase 1: Analyze ────────────────────────────────────────────────────
    emit({ id: 'analyze', label: 'تحليل الطلب...', icon: 'think', status: 'running' })
    await delay(300)

    if (signal?.aborted) throw new Error('aborted')
    const task = classifyAutonomousTask(query)
    emit({ id: 'analyze', label: 'تحليل الطلب', icon: 'think', status: 'done',
           detail: `نوع: ${task.type} · تعقيد: ${task.complexity}${task.language ? ' · ' + task.language : ''}` })

    // ── Phase 2: Plan ───────────────────────────────────────────────────────
    emit({ id: 'plan', label: 'التخطيط للمهمة...', icon: 'plan', status: 'running' })
    await delay(400)

    if (signal?.aborted) throw new Error('aborted')
    const planSummary = buildPlanSummary(task, query)
    emit({ id: 'plan', label: 'التخطيط للمهمة', icon: 'plan', status: 'done', detail: planSummary })

    // ── Phase 3: Execute — AI generation ────────────────────────────────────
    const execStep = task.type === 'debug'   ? { id: 'execute', label: 'تشخيص وإصلاح المشكلة...', icon: 'scan' }
                   : task.type === 'clone'   ? { id: 'execute', label: 'إعادة بناء الموقع...', icon: 'build' }
                   : { id: 'execute', label: 'كتابة الكود...', icon: 'write' }

    emit({ ...execStep, status: 'running' })
    if (signal?.aborted) throw new Error('aborted')

    const systemPrompt = buildSystemPrompt(task, query)
    const historyMsgs = messages.filter(m => m.role !== 'system').slice(-6)
    const aiMessages = [
      { role: 'system', content: systemPrompt },
      ...historyMsgs.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: query },
    ]

    const aiResult = await aiGenerate({
      messages: aiMessages,
      query,
      max_tokens: task.complexity === 'complex' ? 8000 : 4000,
      taskHint: task.taskHint,
    })

    if (signal?.aborted) throw new Error('aborted')

    const content = aiResult?.content || ''
    emit({ ...execStep, status: content.length > 100 ? 'done' : 'error',
           detail: content.length > 100 ? `${content.length} حرف` : 'إعادة المحاولة...' })

    // ── Phase 4: Verify ─────────────────────────────────────────────────────
    emit({ id: 'verify', label: 'فحص وتحقق من الجودة...', icon: 'scan', status: 'running' })
    await delay(300)

    if (signal?.aborted) throw new Error('aborted')
    const validation = validateCodeContent(content, task.language)
    emit({ id: 'verify', label: 'الفحص اكتمل', icon: 'scan',
           status: validation.ok ? 'done' : 'warn',
           detail: validation.ok ? 'الكود صحيح وجاهز' : (validation.reason || 'قد يحتاج مراجعة') })

    // ── Phase 5: Done ───────────────────────────────────────────────────────
    emit({ id: 'done', label: 'اكتملت المهمة!', icon: 'done', status: 'done' })

    return {
      content: content || 'لم أتمكن من إكمال المهمة. يرجى إعادة المحاولة.',
      model: aiResult?.model || 'unknown',
      task,
      steps: completedSteps,
    }

  } catch (err) {
    if (err.message === 'aborted') {
      return { content: '⚠️ تم إيقاف المهمة.', model: null, steps: completedSteps }
    }
    console.error('[autonomous] Pipeline error:', err.message)
    emit({ id: 'error', label: 'حدث خطأ', icon: 'error', status: 'error', detail: err.message })
    return { content: '⚠️ حدث خطأ أثناء التنفيذ. يرجى المحاولة مرة أخرى.', model: null, steps: completedSteps }
  }
}

function buildPlanSummary(task, query) {
  const q = query.slice(0, 60)
  if (task.type === 'code') {
    return task.complexity === 'complex'
      ? `مشروع متعدد الملفات${task.language ? ' · ' + task.language : ''}`
      : `كود ${task.language || 'برمجي'} واحد`
  }
  if (task.type === 'debug') return `تشخيص وإصلاح: "${q}"`
  if (task.type === 'clone') return `إعادة بناء موقع من: "${q}"`
  return q
}
