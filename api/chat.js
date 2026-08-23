// Vercel Serverless Function — Chat (standalone, no server.js)
// /api/dz-agent-chat

const AI_API_KEY = process.env.AI_API_KEY || process.env.GROQ_API_KEY || ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || ''
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''

const DZ_SYSTEM_PROMPT = `أنت DZ Agent — مساعد ذكي جزائري متعدد المهام.
تحدث بالعربية الفصحى أو الجزائرية حسب سؤال المستخدم.
أجب بشكل مفيد، دقيق، ومختصر.`

async function callPollinations(messages) {
  const resp = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [{ role: 'system', content: DZ_SYSTEM_PROMPT }, ...messages],
      seed: Math.floor(Math.random() * 999999),
      private: true,
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!resp.ok) throw new Error(`pollinations ${resp.status}`)
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || data.content || ''
}

async function callGroq(messages) {
  if (!AI_API_KEY) throw new Error('no groq key')
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: DZ_SYSTEM_PROMPT }, ...messages],
      max_tokens: 2048,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!resp.ok) throw new Error(`groq ${resp.status}`)
  const data = await resp.json()
  return data.choices?.[0]?.message?.content || ''
}

async function callGemini(messages) {
  if (!GEMINI_API_KEY) throw new Error('no gemini key')
  const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.4, maxOutputTokens: 2048 } }),
    signal: AbortSignal.timeout(30000),
  })
  if (!resp.ok) throw new Error(`gemini ${resp.status}`)
  const data = await resp.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const messages = Array.isArray(body.messages) ? body.messages : []
    if (!messages.length) return res.status(400).json({ error: 'messages required' })

    const lastUser = [...messages].reverse().find(m => m?.role === 'user')?.content?.trim() || ''
    const lower = lastUser.toLowerCase()

    // Static guards
    if (/ما هي قدراتك|ما يمكنك|ماذا يمكنك/.test(lower)) {
      return res.status(200).json({ content: 'أنا DZ Agent — مساعد ذكي جزائري. أستطيع:\n- 💬 المحادثة والرد على الأسئلة\n- 🌤️ الطقس لجميع ولايات الجزائر\n- 🕌 مواقيت الصلاة\n- 📰 آخر الأخبار الجزائرية\n- 📺 تحميل فيديوهات يوتيوب\n- 📊 تحليل البيانات والرسوم\n- 🔍 البحث على الإنترنت\n- 📄 إنشاء وتعديل الملفات\n\nاطرح أي سؤال!', model: 'static-guard' })
    }
    if (/من أنت|من مطورك|من صانعك/.test(lower)) {
      return res.status(200).json({ content: 'أنا DZ Agent، مساعد ذكي مصمم خصيصاً للمستخدمين الجزائريين. أعمل على توفير معلومات دقيقة وخدمات متنوعة.', model: 'static-guard' })
    }

    // Try AI providers in order
    let reply = ''
    const providers = []
    if (AI_API_KEY) providers.push(() => callGroq(messages))
    if (GEMINI_API_KEY) providers.push(() => callGemini(messages))
    providers.push(() => callPollinations(messages))

    for (const provider of providers) {
      try {
        reply = await provider()
        if (reply && reply.trim().length > 5) break
      } catch (e) {
        console.warn('[Chat] Provider failed:', e.message)
      }
    }

    if (!reply) {
      return res.status(200).json({ content: 'عذراً، لم أتمكن من الحصول على رد الآن. يرجى المحاولة مرة أخرى.', model: 'fallback' })
    }

    return res.status(200).json({ content: reply, model: 'dz-agent' })
  } catch (err) {
    console.error('[Chat] Error:', err)
    return res.status(500).json({ error: 'Server error', message: err.message })
  }
}
