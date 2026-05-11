/**
 * DZ Autonomous Agent — Task Classifier
 * Classifies queries into task types and determines execution plan structure.
 * Purely additive — no existing code modified.
 */

// ── Task patterns ─────────────────────────────────────────────────────────────

const CODE_PATTERNS = [
  /أنش[ئئ]\s+(تطبيق|برنامج|كود|نظام|أداة|سكريبت|api|backend|frontend)/i,
  /اكتب\s+(كود|برنامج|تطبيق|سكريبت|فنكشن|function|class|component)/i,
  /create\s+(app|application|script|program|component|class|function|api|backend|frontend)/i,
  /build\s+(app|application|website|web app|api|backend|service)/i,
  /اعمل\s+(تطبيق|موقع|برنامج|نظام|كود|api)/i,
  /دير\s+(تطبيق|موقع|برنامج|نظام)/i,
  /generate\s+(code|app|component|function|class|script)/i,
  /implement\s+(a|an|the)?\s*(feature|function|class|module|api|system)/i,
  /multi.?file|ملفات\s+متعددة|multiple\s+files/i,
  /react\s+(app|component|page)|vue\s+app|angular\s+app|next\.?js/i,
  /full.?stack|fullstack|backend\s+\+\s+frontend/i,
  /(python|javascript|typescript|node\.?js|express|django|fastapi|flask|spring|laravel)\s+(app|project|script|api|backend|service|server)/i,
  /create\s+a?\s*(python|javascript|node|react|vue|django|fastapi|flask)/i,
  /build\s+a?\s*(python|javascript|node|react|vue|django|fastapi|flask)/i,
]

const DEBUG_PATTERNS = [
  /اصلح|إصلاح|fix\s+(the|this|my|bug|error|issue)/i,
  /debug|debugging|تصحيح\s+الكود|خطأ\s+في\s+الكود/i,
  /why\s+(is|does|won't|doesn't|isn't)|لماذا\s+(لا\s+يعمل|يعطي\s+خطأ)/i,
  /error.*code|code.*error|bug.*fix|fix.*bug/i,
  /not\s+working|لا\s+يعمل|مش\s+يخدم|broken|مكسور/i,
  /exception|traceback|stack\s+trace|error\s+message/i,
  /refactor|تحسين\s+الكود|optimize|تحسين\s+الأداء/i,
  /code\s+review|مراجعة\s+الكود|audit/i,
]

const CLONE_PATTERNS = [
  /استنسخ|clone\s+(website|site|page)|copy\s+(website|site|design)/i,
  /انسخ\s+(موقع|تصميم)|نسخ\s+(موقع|صفحة)/i,
  /rebuild\s+(website|site|page|ui)|replicate\s+(site|design)/i,
  /recreate.*(website|ui|design|page)/i,
]

const RESEARCH_PATTERNS = [
  /ابحث\s+عن|search\s+for|find\s+information/i,
  /اشرح|explain|شرح|define|definition/i,
  /ما\s+هو|ما\s+هي|what\s+is|what\s+are|how\s+does/i,
  /مقارنة|compare|comparison|الفرق\s+بين|difference\s+between/i,
]

// ── Task type detection ───────────────────────────────────────────────────────

export function classifyAutonomousTask(query) {
  const q = String(query || '').trim()
  if (!q) return buildTaskResult('general', 'simple', q)

  if (CLONE_PATTERNS.some(p => p.test(q))) return buildTaskResult('clone', 'complex', q)
  if (CODE_PATTERNS.some(p => p.test(q)))  return buildTaskResult('code', detectComplexity(q), q)
  if (DEBUG_PATTERNS.some(p => p.test(q))) return buildTaskResult('debug', 'moderate', q)
  if (RESEARCH_PATTERNS.some(p => p.test(q))) return buildTaskResult('research', 'simple', q)

  return buildTaskResult('general', 'simple', q)
}

function detectComplexity(query) {
  const q = query.toLowerCase()
  const complexKeywords = ['full-stack','fullstack','multi-file','ملفات متعددة','backend','database',
    'authentication','auth','api','react app','complete','كامل','متكامل','system','نظام']
  const simpleKeywords = ['function','فنكشن','snippet','مثال','example','one file','ملف واحد']
  if (complexKeywords.some(k => q.includes(k))) return 'complex'
  if (simpleKeywords.some(k => q.includes(k))) return 'simple'
  return 'moderate'
}

function buildTaskResult(type, complexity, query) {
  return {
    type,
    complexity,
    taskHint: getTaskHint(type),
    steps: buildSteps(type, complexity),
    language: detectProgrammingLanguage(query),
  }
}

function getTaskHint(type) {
  const map = {
    code:     'technical',
    debug:    'technical',
    clone:    'technical',
    research: 'reasoning',
    general:  'general',
  }
  return map[type] || 'general'
}

function buildSteps(type, complexity) {
  const base = [
    { id: 'analyze', label: 'تحليل الطلب',       icon: 'think',   phase: 'analysis'  },
    { id: 'plan',    label: 'التخطيط للمهمة',     icon: 'plan',    phase: 'planning'  },
  ]
  const codeSteps = [
    { id: 'write',   label: 'كتابة الكود',         icon: 'write',   phase: 'execution' },
    { id: 'verify',  label: 'فحص وتحقق',           icon: 'scan',    phase: 'verify'    },
    { id: 'done',    label: 'إتمام المهمة',         icon: 'done',    phase: 'complete'  },
  ]
  const debugSteps = [
    { id: 'inspect', label: 'فحص الكود',           icon: 'scan',    phase: 'execution' },
    { id: 'fix',     label: 'إصلاح المشكلة',        icon: 'write',   phase: 'execution' },
    { id: 'test',    label: 'التحقق من الإصلاح',    icon: 'test',    phase: 'verify'    },
    { id: 'done',    label: 'اكتمل الإصلاح',        icon: 'done',    phase: 'complete'  },
  ]
  const cloneSteps = [
    { id: 'extract', label: 'تحليل هيكل الموقع',   icon: 'scan',    phase: 'analysis'  },
    { id: 'rebuild', label: 'إعادة بناء المكونات',  icon: 'write',   phase: 'execution' },
    { id: 'style',   label: 'تطبيق الأنماط',        icon: 'build',   phase: 'execution' },
    { id: 'done',    label: 'اكتمل الاستنساخ',      icon: 'done',    phase: 'complete'  },
  ]
  const researchSteps = [
    { id: 'search',  label: 'البحث في المصادر',    icon: 'search',  phase: 'execution' },
    { id: 'analyze', label: 'تحليل النتائج',       icon: 'think',   phase: 'analysis'  },
    { id: 'done',    label: 'إعداد الإجابة',       icon: 'done',    phase: 'complete'  },
  ]

  if (type === 'code')     return [...base, ...codeSteps]
  if (type === 'debug')    return [...base.slice(0,1), ...debugSteps]
  if (type === 'clone')    return [...base, ...cloneSteps]
  if (type === 'research') return [...base.slice(0,1), ...researchSteps]
  return [...base, { id: 'done', label: 'إعداد الإجابة', icon: 'done', phase: 'complete' }]
}

function detectProgrammingLanguage(query) {
  const q = query.toLowerCase()
  if (/python|django|fastapi|flask/.test(q))        return 'python'
  if (/typescript|\.tsx?|react|next\.js|vite/.test(q)) return 'typescript'
  if (/javascript|node\.?js|express|vue|svelte/.test(q)) return 'javascript'
  if (/rust|cargo/.test(q))                         return 'rust'
  if (/go|golang/.test(q))                          return 'go'
  if (/java|spring/.test(q))                        return 'java'
  if (/c#|\.net|aspnet/.test(q))                    return 'csharp'
  if (/php|laravel/.test(q))                        return 'php'
  return null
}

// ── Is this query worth autonomous pipeline? ─────────────────────────────────

export function shouldUseAutonomousPipeline(query) {
  const task = classifyAutonomousTask(query)
  // Only activate for non-trivial tasks
  if (task.type === 'general' && task.complexity === 'simple') return false
  if (task.type === 'research') return false
  return task.type !== 'general'
}
