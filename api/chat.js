import { callAIRouter } from '../lib/ai-router/index.js'
import { lookupStaticFact } from '../lib/static-facts.js'

// Vercel Serverless Function — Chat (standalone, no server.js)
// /api/dz-agent-chat
const DZ_SYSTEM_PROMPT = `أنت DZ Agent — مساعد ذكي جزائري متعدد المهام.
تحدث بالعربية الفصحى أو الجزائرية حسب سؤال المستخدم.
أجب بشكل مفيد، دقيق، ومختصر.`

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

    const staticAnswer = lookupStaticFact(lastUser)
    if (staticAnswer) {
      return res.status(200).json({ content: staticAnswer, model: 'static-fact', _static: true })
    }

    // Static guards
    if (/ما هي قدراتك|ما يمكنك|ماذا يمكنك/.test(lower)) {
      return res.status(200).json({ content: 'أنا DZ Agent — مساعد ذكي جزائري. أستطيع:\n- 💬 المحادثة والرد على الأسئلة\n- 🌤️ الطقس لجميع ولايات الجزائر\n- 🕌 مواقيت الصلاة\n- 📰 آخر الأخبار الجزائرية\n- 📺 تحميل فيديوهات يوتيوب\n- 📊 تحليل البيانات والرسوم\n- 🔍 البحث على الإنترنت\n- 📄 إنشاء وتعديل الملفات\n\nاطرح أي سؤال!', model: 'static-guard' })
    }
    if (/من أنت|من مطورك|من صانعك/.test(lower)) {
      return res.status(200).json({ content: 'أنا DZ Agent، مساعد ذكي مصمم خصيصاً للمستخدمين الجزائريين. أعمل على توفير معلومات دقيقة وخدمات متنوعة.', model: 'static-guard' })
    }

    const result = await callAIRouter(
      [{ role: 'system', content: DZ_SYSTEM_PROMPT }, ...messages],
      { max_tokens: 2048, taskHint: 'multilingual' },
    )
    return res.status(200).json({
      content: result?.content || 'عذراً، لم أتمكن من الحصول على رد الآن. يرجى المحاولة مرة أخرى.',
      model: result?.model || 'fallback',
      provider: result?.provider || undefined,
    })
  } catch (err) {
    console.error('[Chat] Error:', err)
    return res.status(500).json({ error: 'Server error', message: err.message })
  }
}
