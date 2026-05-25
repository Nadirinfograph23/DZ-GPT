/**
 * lib/task-planner/index.js
 * Smart Task Planner — generates a 4-5 step execution plan from a complex query.
 * Uses direct fetch to Groq API (same pattern as claude-react.js).
 */

const GROQ_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile']

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

async function callGroq(messages, model = 'llama-3.3-70b-versatile') {
  const keys = [
    process.env.AI_API_KEY,
    process.env.AI_API_KEY_2,
    process.env.GROQ_API_KEY,
  ].filter(Boolean)

  if (!keys.length) throw new Error('No Groq API key available')

  const key = keys[Math.floor(Math.random() * keys.length)]

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 700,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  })

  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText)
    throw new Error(`Groq ${resp.status}: ${err.slice(0, 200)}`)
  }

  return resp.json()
}

/**
 * Detects if a query is "complex" enough to warrant a plan preview.
 */
export function detectComplexQuery(query) {
  const q = query.toLowerCase()

  if (q.length < 30) return false
  if (/^(ما|ماذا|كيف|متى|أين|من|هل|what|how|when|where|who|why|اشرح|explain)\b/.test(q)) return false
  if (/طقس|أخبار|صلاة|أذان|نتائج|كورة|يوتيوب|youtube|فيديو/i.test(q)) return false

  if (/كامل|متكامل|من\s+الصفر|احترافي|شامل|complete|full.?stack|from\s+scratch/i.test(q) &&
      /أنش[ئئ]|اصنع|ابني|صمم|اعمل|دير|create|build|make|develop/i.test(q)) return true

  const multiStep = (q.match(/ثم|و\s+بعد|أيضاً|كذلك|then|also|and\s+then|followed\s+by/g) || []).length
  if (multiStep >= 2 && /أنش[ئئ]|اصنع|ابني|create|build/i.test(q)) return true

  if (/portfolio|landing\s+page|dashboard|e-commerce|ecommerce|متجر\s+إلكتروني|لوحة\s+تحكم|موقع\s+كامل/i.test(q)) return true
  if (/ملفات\s+متعددة|multiple\s+files|multi.?file|مكونات\s+متعددة/i.test(q)) return true
  if (/(backend|frontend|واجهة|خلفية).*(و|مع).*(backend|frontend|واجهة|خلفية)/i.test(q)) return true

  const wordCount = q.split(/\s+/).length
  if (wordCount >= 14 && /أنش[ئئ]|اصنع|ابني|صمم|create|build|develop|implement/i.test(q)) return true

  return false
}

/**
 * Generates a structured task plan using Groq.
 * Returns { title, summary, estimated_time, complexity, steps[] }
 */
export async function generateTaskPlan(query) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `المهمة: ${query}` },
  ]

  let lastErr
  for (const model of GROQ_MODELS) {
    try {
      const resp = await callGroq(messages, model)
      const raw = resp.choices?.[0]?.message?.content?.trim() || '{}'
      const plan = JSON.parse(raw)

      if (Array.isArray(plan.steps)) {
        plan.steps = plan.steps.map(s => ({
          ...s,
          color: CATEGORY_COLORS[s.category] || CATEGORY_COLORS.default,
        }))
      }
      return plan
    } catch (err) {
      lastErr = err
      console.warn(`[task-planner] ${model} failed: ${err.message}`)
    }
  }

  // Fallback plan
  console.error('[task-planner] All models failed, using fallback plan:', lastErr?.message)
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
