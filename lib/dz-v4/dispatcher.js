// DZ Agent V4 PRO — smart dispatcher.
// Decides which engine handles a request: code | image | chart.
// Strategy: cheap keyword scoring first (instant, free, no LLM call).
// Confidence < 0.45 → ask the LLM for a 1-word verdict. If LLM fails, default to "code".

const KEYWORDS = {
  ar: {
    image:  ['صورة', 'رسمة', 'لوحة', 'صور', 'فنية', 'بوستر', 'تصميم بصري', 'افتارا', 'افتار', 'painting'],
    chart:  ['مخطط', 'رسم بياني', 'إحصائيات', 'بيانات', 'مبيعات', 'نسبة', 'نسب', 'احصاء', 'إحصاء', 'دائري', 'أعمدة'],
    code:   ['موقع', 'صفحة', 'تطبيق', 'مشروع', 'API', 'سيرفر', 'خادم', 'كود', 'برنامج', 'خوارزمية', 'دالة'],
  },
  fr: {
    image:  ['image', 'illustration', 'photo', 'dessine', 'dessin', 'logo', 'affiche', 'peinture'],
    chart:  ['graphique', 'graph', 'diagramme', 'statistiques', 'données', 'pourcentage', 'camembert', 'barres', 'tableau de bord'],
    code:   ['site', 'page', 'app', 'application', 'projet', 'serveur', 'api', 'code', 'script', 'fonction'],
  },
  en: {
    image:  ['image', 'picture', 'photo', 'draw', 'drawing', 'logo', 'poster', 'illustrate', 'illustration', 'painting', 'render'],
    chart:  ['chart', 'graph', 'plot', 'visualize', 'visualisation', 'visualization', 'bar chart', 'line chart', 'pie', 'dashboard', 'statistics', 'metrics', 'data viz'],
    code:   ['website', 'web app', 'app', 'page', 'project', 'api', 'server', 'backend', 'frontend', 'code', 'build', 'generate', 'script', 'function'],
  },
}

export function classifyIntent(prompt) {
  const text = String(prompt || '').toLowerCase()
  if (!text) return { intent: 'code', confidence: 0, scores: { code: 0, image: 0, chart: 0 } }

  const scores = { code: 0, image: 0, chart: 0 }
  for (const lang of Object.keys(KEYWORDS)) {
    for (const intent of Object.keys(KEYWORDS[lang])) {
      for (const kw of KEYWORDS[lang][intent]) {
        if (text.includes(kw.toLowerCase())) scores[intent] += kw.length > 5 ? 2 : 1
      }
    }
  }

  // Heuristic boosts
  if (/\b(generate|draw|render|imagine)\s+(a|an|une|un|the)?\s*(image|photo|picture|logo|poster|صورة)/i.test(text)) scores.image += 3
  if (/\b(chart|graph|plot|bar|pie|line|dashboard|statistics|مخطط|graphique|diagramme)\b/i.test(text)) scores.chart += 2
  if (/\b(website|app|api|server|component|module|script|backend|frontend|موقع|تطبيق|مشروع|projet|application|site)\b/i.test(text)) scores.code += 2

  const total = scores.code + scores.image + scores.chart
  const winner = pickWinner(scores)
  const confidence = total === 0 ? 0 : scores[winner] / total
  return { intent: winner, confidence: round(confidence), scores }
}

export async function classifyWithLLM({ aiGenerate, prompt }) {
  const sys = `You are a single-word intent classifier for an AI agent. Read the user request and reply with ONLY ONE of these tokens, lowercase, no punctuation:
- code   (the user wants source code, a website, app, API, script, project)
- image  (the user wants an image, picture, logo, poster, illustration)
- chart  (the user wants a chart, graph, dashboard, data visualization)

Reply with EXACTLY one word from {code, image, chart}.`
  try {
    const raw = await aiGenerate({
      messages: [
        { role: 'system', content: sys },
        { role: 'user',   content: prompt },
      ],
      query: prompt,
      max_tokens: 4,
    })
    const text = (typeof raw === 'string' ? raw : raw?.content || '').toLowerCase()
    const m = text.match(/\b(code|image|chart)\b/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export async function dispatch({ aiGenerate, prompt }) {
  const cheap = classifyIntent(prompt)
  if (cheap.confidence >= 0.45 || !aiGenerate) return { ...cheap, source: 'keywords' }

  const llm = await classifyWithLLM({ aiGenerate, prompt })
  if (llm) return { intent: llm, confidence: 0.7, scores: cheap.scores, source: 'llm' }
  return { ...cheap, source: 'keywords-default' }
}

function pickWinner(scores) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1])
  // Tie-break: prefer code (most common request)
  if (entries[0][1] === entries[1][1]) return 'code'
  return entries[0][0]
}

function round(n) { return Math.round(n * 100) / 100 }
