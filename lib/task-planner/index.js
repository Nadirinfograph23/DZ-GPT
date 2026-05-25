/**
 * lib/task-planner/index.js
 * Smart Task Planner — generates a 4-5 step execution plan from a complex query
 * using the AI router before actual execution begins.
 */

import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.AI_API_KEY || '' })

const SYSTEM_PROMPT = `أنت مخطّط مهام ذكاء اصطناعي متخصص في تحليل الطلبات المعقدة وتقسيمها لخطوات تنفيذية.

عندما يطلب المستخدم مشروعاً أو مهمة معقدة، قم بتحليلها وأنشئ خطة من 4 إلى 5 خطوات واضحة.

أجب دائماً بـ JSON فقط — لا نص إضافي، لا شرح خارج JSON.

مثال:
{
  "title": "إنشاء موقع Portfolio احترافي",
  "summary": "مشروع كامل: صفحة HTML/CSS/JS + رفع على GitHub Pages",
  "estimated_time": "2-3 دقائق",
  "complexity": "medium",
  "steps": [
    {
      "id": 1,
      "icon": "🔍",
      "title": "تحليل المتطلبات",
      "description": "فهم نمط التصميم، الأقسام المطلوبة، والبيانات الشخصية",
      "category": "analysis"
    },
    {
      "id": 2,
      "icon": "🎨",
      "title": "تصميم الهيكل",
      "description": "إنشاء HTML مع sections: Hero, Skills, Projects, Contact",
      "category": "build"
    },
    {
      "id": 3,
      "icon": "⚡",
      "title": "كتابة الكود",
      "description": "HTML5 + CSS3 animations + JavaScript للتفاعل",
      "category": "code"
    },
    {
      "id": 4,
      "icon": "📤",
      "title": "الرفع على GitHub",
      "description": "إنشاء المستودع، رفع الملفات، تفعيل GitHub Pages",
      "category": "deploy"
    },
    {
      "id": 5,
      "icon": "✅",
      "title": "التحقق والتسليم",
      "description": "اختبار الرابط المباشر وتقديم النتيجة النهائية",
      "category": "verify"
    }
  ]
}`

const CATEGORY_COLORS = {
  analysis: '#60a5fa',
  build:    '#a78bfa',
  code:     '#34d399',
  deploy:   '#fbbf24',
  verify:   '#86efac',
  test:     '#f472b6',
  research: '#fb923c',
  default:  '#9ca3af',
}

/**
 * Detects if a query is "complex" enough to warrant a plan preview.
 * Returns true for multi-step, full-project, or "complete" requests.
 */
export function detectComplexQuery(query) {
  const q = query.toLowerCase()

  // Hard exclusions — simple ops that don't need a plan
  if (q.length < 30) return false
  if (/^(ما|ماذا|كيف|متى|أين|من|هل|what|how|when|where|who|why|اشرح|explain)\b/.test(q)) return false
  if (/طقس|أخبار|صلاة|أذان|نتائج|كورة|يوتيوب|youtube/i.test(q)) return false

  // Complex triggers — "complete/full" + build keywords
  if (/كامل|متكامل|من\s+الصفر|احترافي|شامل|complete|full.?stack|from\s+scratch/i.test(q) &&
      /أنش[ئئ]|اصنع|ابني|صمم|اعمل|دير|create|build|make|develop/i.test(q)) return true

  // Multi-step implied — "then/and/also/also"
  const multiStep = (q.match(/ثم|و\s+بعد|أيضاً|كذلك|then|also|and\s+then|followed\s+by/g) || []).length
  if (multiStep >= 2 && /أنش[ئئ]|اصنع|ابني|create|build/i.test(q)) return true

  // Large project keywords
  if (/portfolio|landing\s+page|dashboard|e-commerce|ecommerce|متجر\s+إلكتروني|لوحة\s+تحكم|موقع\s+كامل/i.test(q)) return true

  // Multi-file / multi-component signals
  if (/ملفات\s+متعددة|multiple\s+files|multi.?file|مكونات\s+متعددة|several\s+components/i.test(q)) return true

  // Full backend+frontend stack
  if (/(backend|frontend|واجهة|خلفية).*(و|مع).*(backend|frontend|واجهة|خلفية)/i.test(q)) return true
  if (/api\s+\+|قاعدة\s+بيانات.*مع|database.*with.*frontend|auth.*and.*dashboard/i.test(q)) return true

  // Word count heuristic — long queries with build intent
  const wordCount = q.split(/\s+/).length
  if (wordCount >= 12 && /أنش[ئئ]|اصنع|ابني|صمم|create|build|develop|implement/i.test(q)) return true

  return false
}

/**
 * Generates a structured task plan using Groq.
 * Returns { title, summary, estimated_time, complexity, steps[] }
 */
export async function generateTaskPlan(query, signal) {
  const resp = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `المهمة: ${query}` },
    ],
    max_tokens: 700,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    ...(signal ? {} : {}),
  }, { signal })

  const raw = resp.choices?.[0]?.message?.content?.trim() || '{}'
  try {
    const plan = JSON.parse(raw)
    // Attach colors to steps
    if (Array.isArray(plan.steps)) {
      plan.steps = plan.steps.map(s => ({
        ...s,
        color: CATEGORY_COLORS[s.category] || CATEGORY_COLORS.default,
      }))
    }
    return plan
  } catch {
    // Fallback plan if parsing fails
    return {
      title: 'تنفيذ المهمة',
      summary: query.slice(0, 80),
      estimated_time: '1-3 دقائق',
      complexity: 'medium',
      steps: [
        { id: 1, icon: '🔍', title: 'تحليل المتطلبات', description: 'فهم المهمة وتحديد الأهداف', category: 'analysis', color: CATEGORY_COLORS.analysis },
        { id: 2, icon: '⚡', title: 'التنفيذ', description: 'بناء الحل المطلوب', category: 'code', color: CATEGORY_COLORS.code },
        { id: 3, icon: '📤', title: 'النشر', description: 'رفع النتائج وتسليمها', category: 'deploy', color: CATEGORY_COLORS.deploy },
        { id: 4, icon: '✅', title: 'التحقق', description: 'مراجعة النتيجة النهائية', category: 'verify', color: CATEGORY_COLORS.verify },
      ],
    }
  }
}
