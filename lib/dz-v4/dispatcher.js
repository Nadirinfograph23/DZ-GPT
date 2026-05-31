// DZ Agent V4 PRO — smart dispatcher.
// Decides which engine handles a request: code | image | chart | map.
// Strategy: cheap keyword scoring first (instant, free, no LLM call).
// Confidence < 0.45 → ask the LLM for a 1-word verdict. If LLM fails, default to "code".
//
// CONTEXT AWARENESS: Distinguishes between:
//   - "موقع ويب" (website) → code intent (web builder)
//   - "موقع خريطة" (map website) → map intent (Leaflet.js builder)
//   - "خريطة" alone → map intent (interactive map)

const MAP_WEBSITE_SIGNALS = [
  'موقع خريطة', 'موقع مع خريطة', 'موقع خرائط', 'صفحة خريطة', 'خريطة تفاعلية كموقع',
  'اصنع موقع خريطة', 'أنشئ موقع خريطة', 'ابني موقع خريطة', 'موقع بخريطة',
  'map website', 'map site', 'website with map', 'site with map', 'map web app',
  'interactive map website', 'leaflet website', 'mapping website', 'map application',
  'site avec carte', 'site cartographique', 'application carte',
]

// مؤشرات بحث الصور الحقيقية (تميّزها عن توليد الصور)
const IMAGE_SEARCH_SIGNALS = [
  'ابحث عن صورة', 'ابحث على صورة', 'جيبلي صورة', 'جيبلي صور', 'أجلب صورة',
  'أريد صورة ل', 'هاتلي صورة', 'بحث عن صورة', 'دور صورة', 'أرني صورة',
  'صور حقيقية', 'صور واقعية', 'أريد فوتو', 'جيب صورة', 'حوس على صورة',
  'find a photo', 'find a picture', 'find an image', 'find photos',
  'search for a photo', 'search for image', 'search images',
  'get me a photo', 'get me a picture', 'show me a photo', 'show me a picture',
  'show me images', 'show me photos', 'get photos of', 'get pictures of',
  'real photo of', 'real picture of', 'bring me photo', 'fetch image',
  'trouve une photo', 'trouve des photos', 'cherche une image', 'montre moi une photo',
]

// مؤشرات توليد الصور بالذكاء الاصطناعي
const IMAGE_GENERATION_SIGNALS = [
  'ولّد صورة', 'ولد صورة', 'أنشئ صورة', 'انشئ صورة', 'اصنع صورة',
  'ارسم لي', 'ارسم صورة', 'توليد صورة', 'إنشاء صورة',
  'generate image', 'generate a photo', 'create image', 'create a picture',
  'draw me', 'draw a ', 'make an image', 'make a picture', 'ai image', 'ai art',
  'imagine a', 'render a',
]

// مؤشرات صورة إلى صورة (img2img)
const IMG2IMG_SIGNALS = [
  'حوّل الصورة', 'حول الصورة', 'عدّل الصورة', 'غيّر الصورة', 'بدّل الصورة',
  'نفس الصورة لكن', 'نفس الصورة بس', 'نفس الصورة مع',
  'صورة إلى صورة', 'صورة لصورة', 'img2img', 'image to image',
  'transform image', 'edit this image', 'modify image', 'change the style',
  'même image mais', 'transformer image',
]

// مؤشرات توليد الفيديو
const VIDEO_GENERATION_SIGNALS = [
  'ولّد فيديو', 'ولد فيديو', 'أنشئ فيديو', 'انشئ فيديو', 'اصنع فيديو', 'اعمل فيديو',
  'توليد فيديو', 'إنشاء فيديو', 'فيديو من نص', 'نص إلى فيديو', 'نص لفيديو',
  'generate video', 'create video', 'make a video', 'text to video', 'text-to-video',
  'générer vidéo', 'créer vidéo', 'vidéo depuis texte',
  'صورة إلى فيديو', 'صورة لفيديو', 'حرّك الصورة', 'حرك الصورة', 'حوّل لفيديو',
  'image to video', 'img2video', 'animate image', 'animate this',
]

const KEYWORDS = {
  ar: {
    image:  ['رسمة', 'لوحة', 'فنية', 'بوستر', 'تصميم بصري', 'افتارا', 'افتار', 'painting',
             'ولّد صورة', 'ولد صورة', 'أنشئ صورة', 'ارسم لي', 'توليد صورة'],
    chart:  ['مخطط', 'رسم بياني', 'إحصائيات', 'بيانات', 'مبيعات', 'نسبة', 'نسب', 'احصاء', 'إحصاء', 'دائري', 'أعمدة'],
    map:    ['خريطة', 'خرائط', 'تتبع موقع', 'جغرافي', 'leaflet', 'openstreetmap', 'تطبيق خريطة'],
    code:   ['موقع', 'صفحة', 'تطبيق', 'مشروع', 'API', 'سيرفر', 'خادم', 'كود', 'برنامج', 'خوارزمية', 'دالة'],
  },
  fr: {
    image:  ['image', 'illustration', 'photo', 'dessine', 'dessin', 'logo', 'affiche', 'peinture'],
    chart:  ['graphique', 'graph', 'diagramme', 'statistiques', 'données', 'pourcentage', 'camembert', 'barres', 'tableau de bord'],
    map:    ['carte', 'cartographique', 'leaflet', 'openstreetmap', 'géographique', 'géolocalisation'],
    code:   ['site', 'page', 'app', 'application', 'projet', 'serveur', 'api', 'code', 'script', 'fonction'],
  },
  en: {
    image:  ['image', 'picture', 'photo', 'draw', 'drawing', 'logo', 'poster', 'illustrate', 'illustration', 'painting', 'render'],
    chart:  ['chart', 'graph', 'plot', 'visualize', 'visualisation', 'visualization', 'bar chart', 'line chart', 'pie', 'dashboard', 'statistics', 'metrics', 'data viz'],
    map:    ['map', 'maps', 'leaflet', 'openstreetmap', 'geolocation', 'geo', 'mapping', 'location map', 'interactive map'],
    code:   ['website', 'web app', 'app', 'page', 'project', 'api', 'server', 'backend', 'frontend', 'code', 'build', 'generate', 'script', 'function'],
  },
}

export function classifyIntent(prompt) {
  const text = String(prompt || '').toLowerCase()
  if (!text) return { intent: 'code', confidence: 0, scores: { code: 0, image: 0, chart: 0, map: 0 } }

  // أولوية قصوى: فيديو من صورة
  const hasImg2VideoSignal = VIDEO_GENERATION_SIGNALS.some(s => text.includes(s.toLowerCase()))
    && (text.includes('صورة') || text.includes('image') || text.includes('photo') || text.includes('img'))
    && (text.includes('فيديو') || text.includes('video') || text.includes('animate'))
  if (hasImg2VideoSignal) {
    return { intent: 'img2video', confidence: 0.92, scores: { code: 0, image: 0, chart: 0, map: 0, video: 3, img2video: 4 }, source: 'img2video-signal' }
  }

  // أولوية عالية: توليد فيديو من نص
  const hasVideoGenSignal = VIDEO_GENERATION_SIGNALS.some(s => text.includes(s.toLowerCase()))
  if (hasVideoGenSignal) {
    return { intent: 'video', confidence: 0.92, scores: { code: 0, image: 0, chart: 0, map: 0, video: 4 }, source: 'video-signal' }
  }

  // أولوية عالية: صورة إلى صورة
  const hasImg2ImgSignal = IMG2IMG_SIGNALS.some(s => text.includes(s.toLowerCase()))
  if (hasImg2ImgSignal) {
    return { intent: 'img2img', confidence: 0.90, scores: { code: 0, image: 0, chart: 0, map: 0, img2img: 3 }, source: 'img2img-signal' }
  }

  // أولاً: كشف بحث الصور (أولوية قصوى قبل توليد الصور)
  const hasImageSearchSignal = IMAGE_SEARCH_SIGNALS.some(s => text.includes(s.toLowerCase()))
  const hasImageGenSignal    = IMAGE_GENERATION_SIGNALS.some(s => text.includes(s.toLowerCase()))
  if (hasImageSearchSignal && !hasImageGenSignal) {
    return { intent: 'image-search', confidence: 0.95, scores: { code: 0, 'image-search': 3, image: 0, chart: 0, map: 0 }, source: 'image-search-signal' }
  }

  // Check for explicit map website signals first (high confidence)
  if (MAP_WEBSITE_SIGNALS.some(s => text.includes(s.toLowerCase()))) {
    return { intent: 'map', confidence: 0.9, scores: { code: 0, image: 0, chart: 0, map: 3 }, source: 'map-website-signal' }
  }

  const scores = { code: 0, image: 0, chart: 0, map: 0 }
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
  if (/\b(map|maps|carte|خريطة|leaflet|openstreetmap|geo|mapping)\b/i.test(text)) scores.map += 2

  // Context disambiguation: "موقع" alone → website, but "موقع خريطة" → map website
  // If 'map' keywords appear alongside 'website' keywords, map wins
  if (scores.map > 0 && scores.code > 0) {
    const hasWebKeyword = /\b(website|site|موقع ويب|landing page|صفحة ويب)\b/i.test(text)
    const hasMapWebsite = /\b(map website|موقع خريطة|site avec carte)\b/i.test(text)
    if (hasMapWebsite) scores.map += 3
    else if (hasWebKeyword && !hasMapWebsite) scores.code += 2
  }

  const total = scores.code + scores.image + scores.chart + scores.map
  const winner = pickWinner(scores)
  const confidence = total === 0 ? 0 : scores[winner] / total
  return { intent: winner, confidence: round(confidence), scores }
}

export async function classifyWithLLM({ aiGenerate, prompt }) {
  const sys = `You are a single-word intent classifier for an AI agent. Read the user request and reply with ONLY ONE of these tokens, lowercase, no punctuation:
- code   (the user wants source code, a website, app, API, script, project)
- image  (the user wants an image, picture, logo, poster, illustration)
- chart  (the user wants a chart, graph, dashboard, data visualization)
- map    (the user wants an interactive map, map website, or location-based web app using Leaflet/OpenStreetMap)

IMPORTANT: If the user says "موقع خريطة" or "map website" or "site with map", reply with "map".
If the user says "موقع" or "website" without map context, reply with "code".

Reply with EXACTLY one word from {code, image, chart, map}.`
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
    const m = text.match(/\b(code|image|chart|map)\b/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export async function dispatch({ aiGenerate, prompt }) {
  const cheap = classifyIntent(prompt)
  if (cheap.confidence >= 0.45 || !aiGenerate) return { ...cheap, source: cheap.source || 'keywords' }

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
