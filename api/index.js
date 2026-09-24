// deploy-trigger: 20260924-youtube-intent-routing-fix
import { callAIRouter } from '../lib/ai-router/index.js'
import { lookupStaticFact } from '../lib/static-facts.js'

// Vercel serverless entry point — routes DZ Agent and the dedicated YouTube Insight API.
const DZ_SYSTEM_PROMPT = `أنت DZ Agent — مساعد ذكي جزائري متعدد المهام.
تحدث بالعربية الفصحى أو الجزائرية حسب سؤال المستخدم.
أجب بشكل مفيد، دقيق، ومختصر.`

async function youtubeAiGenerate({ messages, max_tokens }) {
  return callAIRouter(messages, {
    max_tokens: Math.min(Number(max_tokens) || 1400, 4096),
    taskHint: 'retrieval',
  })
}

async function handleYouTubeAnalyze(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const input = String(body.url || body.query || body.text || '').trim()
    if (!input) return res.status(400).json({ ok: false, error: 'url or query is required' })

    const { handleYouTubeInput } = await import('../modules/youtube_insight_module/controller.js')
    const yt = await handleYouTubeInput(input, {
      aiGenerate: youtubeAiGenerate,
      preloadedMeta: body.preloadedMeta || null,
      noSuggestions: !!body.noSuggestions,
    })

    return res.status(200).json({
      ok: true,
      content: yt?.message || '', model: 'youtube-insight', richType: 'youtube', youtubeFlow: yt?.flow,
      youtubeVideo: yt?.video ? { id: yt.video.id, url: yt.video.url, title: yt.video.title, channel: yt.video.author || yt.video.channel || '', duration: yt.video.duration || 0, views: yt.video.views || 0, thumbnail: yt.video.thumbnail || '', description: yt.video.description || '', captionText: yt.captionText || null } : undefined,
      youtubeResults: (yt?.results || []).map(v => ({ id: v.id, url: v.url, title: v.title, channel: v.channel || '', duration: v.duration || 0, views: v.views || 0, thumbnail: v.thumbnail || '' })),
      youtubeAnalysis: yt?.analysis ? { ok: true, summary: yt.analysis.summary || '', captionAvailable: !!yt.captionText } : undefined,
      youtubeSuggestions: yt?.suggestions || [], captionText: yt?.captionText || null, captionNote: yt?.captionNote || null,
    })
  } catch (e) {
    console.error('[YouTube Insight] analyze failed:', e)
    return res.status(502).json({ ok: false, error: e?.message || 'YouTube analysis failed' })
  }
}

async function handleYouTubeDiscuss(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const question = String(body.question || body.text || '').trim()
    if (!question) return res.status(400).json({ ok: false, error: 'question is required' })
    const { handleVideoDiscussion } = await import('../modules/youtube_insight_module/controller.js')
    const result = await handleVideoDiscussion(body.youtubeContext || body.video || body.context || {}, question, Array.isArray(body.history) ? body.history : [], youtubeAiGenerate)
    return res.status(200).json({ ok: true, ...result, model: 'youtube-insight' })
  } catch (e) {
    console.error('[YouTube Insight] discussion failed:', e)
    return res.status(502).json({ ok: false, error: e?.message || 'YouTube discussion failed' })
  }
}

async function handleChat(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end('')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const messages = Array.isArray(body.messages) ? body.messages : []
    if (!messages.length) return res.status(400).json({ error: 'messages required' })
    const lastUser = [...messages].reverse().find(m => m?.role === 'user')?.content?.trim() || ''
    const lower = lastUser.toLowerCase()
    const staticAnswer = lookupStaticFact(lastUser)
    if (staticAnswer) return res.status(200).json({ content: staticAnswer, model: 'static-fact', _static: true })

    if (/ما هي قدراتك|ما يمكنك|ماذا يمكنك/.test(lower)) return res.status(200).json({ content: 'أنا DZ Agent — مساعد ذكي جزائري. أستطيع:\n- 💬 المحادثة والرد على الأسئلة\n- 🌤️ الطقس لجميع ولايات الجزائر\n- 🕌 مواقيت الصلاة\n- 📰 آخر الأخبار الجزائرية\n- 📺 البحث وتحليل فيديوهات YouTube\n- 📊 تحليل البيانات والرسوم\n- 🔍 البحث على الإنترنت\n- 📄 إنشاء وتعديل الملفات\n\nاطرح أي سؤال!', model: 'static-guard' })
    if (/من أنت|من مطورك|من صانعك/.test(lower)) return res.status(200).json({ content: 'أنا DZ Agent، مساعد ذكي مصمم خصيصاً للمستخدمين الجزائريين. أعمل على توفير معلومات دقيقة وخدمات متنوعة.', model: 'static-guard' })

    // Dedicated YouTube intent routing.
    // IMPORTANT: tutorial/search intent such as "شرح أدوات الفوتوشوب" does not
    // contain the word YouTube or فيديو. It must still enter the YouTube flow.
    // Static/fixed answers are checked first, so this does not alter fixed answers.
    const youtubeIntent = /(?:youtube|youtu\.be|يوتيوب|يوتيب|فيديو|فيديوهات|بالفيديو|ابحث عن فيديو|حلّل الفيديو|حلل الفيديو|اشرح لي الفيديو|شرح\s+(?:.*(?:فيديو|دروس|درس|أدوات|برنامج|برامج|فوتوشوب|photoshop|excel|word|برمجة|تعلم|تعليم))|دروس\s+(?:.*)|tutorials?|how\s+to\s+.+|تعلم\s+(?:.*)|تعليم\s+(?:.*))/i.test(lastUser)
    if (youtubeIntent) {
      try {
        const { handleYouTubeInput } = await import('../modules/youtube_insight_module/controller.js')
        const yt = await handleYouTubeInput(lastUser, { aiGenerate: youtubeAiGenerate })
        return res.status(200).json({
          content: yt?.message || '', model: 'youtube-insight', richType: 'youtube', youtubeFlow: yt?.flow,
          youtubeVideo: yt?.video ? { id: yt.video.id, url: yt.video.url, title: yt.video.title, channel: yt.video.author || yt.video.channel || '', duration: yt.video.duration || 0, views: yt.video.views || 0, thumbnail: yt.video.thumbnail || '', description: yt.video.description || '', captionText: yt.captionText || null } : undefined,
          youtubeResults: (yt?.results || []).map(v => ({ id: v.id, url: v.url, title: v.title, channel: v.channel || '', duration: v.duration || 0, views: v.views || 0, thumbnail: v.thumbnail || '' })),
          youtubeAnalysis: yt?.analysis ? { ok: true, summary: yt.analysis.summary || '', captionAvailable: !!yt.captionText } : undefined,
          youtubeSuggestions: yt?.suggestions || [], captionText: yt?.captionText || null, captionNote: yt?.captionNote || null,
        })
      } catch (e) {
        console.warn('[YouTube Insight] dedicated route failed:', e?.message || e)
      }
    }

    const ai = await callAIRouter(messages, { max_tokens: 1400, taskHint: 'general' })
    return res.status(200).json({ content: ai?.content || ai?.choices?.[0]?.message?.content || 'تعذر الحصول على إجابة حالياً.', model: ai?.model || 'ai-router' })
  } catch (err) {
    console.error('[Chat] Error:', err)
    return res.status(500).json({ error: 'Server error', message: err.message })
  }
}

export default async function handler(req, res) {
  const path = req.url?.split('?')[0] || ''
  if (path.endsWith('/youtube-insight/analyze')) return handleYouTubeAnalyze(req, res)
  if (path.endsWith('/youtube-insight/discuss')) return handleYouTubeDiscuss(req, res)
  return handleChat(req, res)
}
