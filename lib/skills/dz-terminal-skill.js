// lib/skills/dz-terminal-skill.js
// DZ-Terminal-Skill — Command Parser
// يحوّل الأوامر الطبيعية (عربي/فرنسي/إنجليزي/دارجة) إلى عمليات GitHub + Vercel حقيقية

// ── خريطة الأوامر ─────────────────────────────────────────────────────────
const COMMAND_PATTERNS = [
  // تحليل مستودع
  { action: 'analyze_repo',    patterns: [/حلل?\s+مستودع|analyze\s+repo|analyse\s+repo|فهم\s+مستودع|اقرأ\s+مستودع|inspect\s+repo/i] },

  // إنشاء فرع
  { action: 'create_branch',   patterns: [/أنشئ?\s+فرع|انشئ?\s+فرع|create\s+branch|فرع\s+جديد|branch\s+new|checkout\s+-b/i] },

  // إنشاء / كتابة ملف
  { action: 'create_file',     patterns: [/أنشئ?\s+ملف|انشئ?\s+ملف|اكتب?\s+ملف|create\s+file|new\s+file|add\s+file|أضف?\s+ملف/i] },

  // قراءة ملف
  { action: 'read_file',       patterns: [/اقرأ?\s+ملف|افتح?\s+ملف|read\s+file|show\s+file|اعرض?\s+ملف|أرني?\s+ملف/i] },

  // حذف ملف
  { action: 'delete_file',     patterns: [/احذف?\s+ملف|delete\s+file|remove\s+file|rm\s+file/i] },

  // قائمة ملفات
  { action: 'list_files',      patterns: [/قائمة\s+ملفات|اعرض?\s+ملفات|list\s+files|ls\s+repo|show\s+files|ما\s+الملفات/i] },

  // Pull Request
  { action: 'create_pr',       patterns: [/أنشئ?\s+pr|pull\s+request|فتح\s+pr|create\s+pr|open\s+pr|merge\s+request/i] },

  // نشر على GitHub Pages
  { action: 'deploy_pages',    patterns: [/github\s*pages|انشر?\s*على\s*github|نشر\s*github|deploy.*github|pages.*github/i] },

  // مزامنة Vercel
  { action: 'sync_vercel',     patterns: [/نشر?\s+vercel|deploy\s+vercel|مزامنة\s+vercel|sync\s+vercel|ابنِ?\s+vercel|build.*vercel/i] },

  // مزامنة GitHub + Vercel معاً
  { action: 'full_sync',       patterns: [/زامن?\s+github|مزامنة\s+كاملة|full\s+sync|نشر?\s+كامل|deploy\s+all|push.*deploy/i] },

  // إصلاح أخطاء البناء
  { action: 'fix_build',       patterns: [/أصلح?\s+build|fix\s+build|إصلاح\s+بناء|repair\s+build|build.*error|خطأ\s+build/i] },

  // تثبيت dependencies
  { action: 'install_deps',    patterns: [/ثبّت?\s+|npm\s+install|pip\s+install|yarn\s+add|install\s+dep|تثبيت/i] },

  // تحليل أخطاء
  { action: 'debug',           patterns: [/حلل?\s+خطأ|debug|تصحيح|اكتشف?\s+مشكلة|ما\s+الخطأ|لماذا\s+يفشل|why.*fail/i] },

  // حالة المشروع
  { action: 'status',          patterns: [/حالة\s+المشروع|project\s+status|health\s+check|ما\s+حالة|check\s+status/i] },
]

// ── تصنيف أمر المستخدم ────────────────────────────────────────────────────
export function classifyCommand(text) {
  const cleaned = text.trim()
  for (const { action, patterns } of COMMAND_PATTERNS) {
    if (patterns.some(p => p.test(cleaned))) return { action, raw: cleaned }
  }
  return { action: 'general_query', raw: cleaned }
}

// ── استخراج معاملات الأمر ──────────────────────────────────────────────────
export function extractCommandParams(text, action) {
  const params = {}

  // استخراج owner/repo من رابط GitHub
  const repoLinkMatch = text.match(/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/i)
  if (repoLinkMatch) {
    params.owner = repoLinkMatch[1]
    params.repo  = repoLinkMatch[2].replace(/\.git$/, '')
  }

  // استخراج owner/repo بصيغة owner/repo
  const repoSlugMatch = text.match(/\b([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)\b/)
  if (repoSlugMatch && !params.owner) {
    params.owner = repoSlugMatch[1]
    params.repo  = repoSlugMatch[2]
  }

  // استخراج اسم الفرع
  const branchMatch = text.match(/(?:branch|فرع)[:\s]+([a-zA-Z0-9_/-]+)/i)
    || text.match(/\b(feature\/[a-zA-Z0-9_-]+|fix\/[a-zA-Z0-9_-]+|hotfix\/[a-zA-Z0-9_-]+)/i)
  if (branchMatch) params.branch = branchMatch[1]

  // استخراج مسار ملف
  const filePathMatch = text.match(/(?:file|ملف|path)[:\s]+([^\s,،]+\.[a-zA-Z0-9]+)/i)
    || text.match(/\b([a-zA-Z0-9_/-]+\.(js|ts|jsx|tsx|py|html|css|json|md|yaml|yml|txt|sh))\b/i)
  if (filePathMatch) params.filePath = filePathMatch[1]

  // استخراج اسم ملف بدون مسار
  const fileNameMatch = text.match(/(?:أنشئ|اكتب|افتح|create|write|read)\s+([a-zA-Z0-9_-]+\.[a-zA-Z]{2,5})/i)
  if (fileNameMatch && !params.filePath) params.filePath = fileNameMatch[1]

  // استخراج عنوان PR
  const prTitleMatch = text.match(/(?:title|عنوان)[:\s]+"([^"]+)"/i)
    || text.match(/(?:title|عنوان)[:\s]+(.+?)(?:\n|$)/i)
  if (prTitleMatch) params.prTitle = prTitleMatch[1].trim()

  // استخراج اسم الباقة للتثبيت
  const pkgMatch = text.match(/(?:ثبّت|install|add)\s+([a-zA-Z0-9@/_-]+)/i)
  if (pkgMatch) params.packageName = pkgMatch[1]

  return params
}

// ── بناء prompt للـ AI بناءً على الأمر + السياق ─────────────────────────────
export function buildExecutionPrompt(action, params, repoAnalysis = null) {
  const repoCtx = repoAnalysis
    ? `\n**المستودع:** ${repoAnalysis.fullName} | Stack: ${repoAnalysis.stack.join(', ')} | ${repoAnalysis.totalFiles} ملف`
    : ''

  const prompts = {
    analyze_repo: `حلّل مستودع GitHub هذا وأعطِ تقريراً تقنياً شاملاً يشمل: نوع المشروع، التقنيات المستخدمة، الملفات الأساسية، المشاكل المحتملة، واقتراحات التحسين.${repoCtx}`,
    create_file: `أنشئ ملف ${params.filePath || 'index.js'} بمحتوى مناسب لنوع المشروع.${repoCtx}`,
    fix_build: `حلّل أخطاء البناء التالية واقترح إصلاحات دقيقة وقابلة للتطبيق فوراً:${repoCtx}`,
    debug: `حلّل الخطأ التالي وأعطِ السبب الجذري والحل خطوة بخطوة:${repoCtx}`,
    general_query: `أجب على هذا الطلب المتعلق بـ GitHub أو البرمجة:${repoCtx}`,
  }

  return prompts[action] || prompts.general_query
}

// ── تحويل أمر npm/pip إلى تعليمات قابلة للتنفيذ ─────────────────────────
export function buildInstallInstructions(packageName, stack = []) {
  const isPython = stack.some(s => ['Python', 'Django', 'Flask', 'FastAPI'].includes(s))
  const isBun = stack.includes('Bun')

  if (isPython) return { manager: 'pip', command: `pip install ${packageName}`, file: 'requirements.txt' }
  if (isBun) return { manager: 'bun', command: `bun add ${packageName}`, file: 'package.json' }
  return { manager: 'npm', command: `npm install ${packageName}`, file: 'package.json' }
}
