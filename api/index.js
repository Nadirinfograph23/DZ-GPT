// deploy-trigger: 20260615-squad-fix
import { callAIRouter } from '../lib/ai-router/index.js'
import { lookupStaticFact } from '../lib/static-facts.js'

// Vercel serverless entry point — routes /api/dz-agent-chat to standalone handler
// and falls back to server.js for other routes.

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// Standalone chat handler (no server.js needed)
const DZ_SYSTEM_PROMPT = `أنت DZ Agent — مساعد ذكي جزائري متعدد المهام.
تحدث بالعربية الفصحى أو الجزائرية حسب سؤال المستخدم.
أجب بشكل مفيد، دقيق، ومختصر.`

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

    // Dedicated YouTube path: never let video requests fall through to generic AI.
    if (/(?:youtube|youtu\\.be|يوتيوب|يوتيب|فيديو|فيديوهات|بالفيديو|ابحث عن فيديو|حلّل الفيديو|حلل الفيديو|اشرح لي الفيديو)/i.test(lastUser)) {
      try {
        const { handleYouTubeInput } = await import('../modules/youtube_insight_module/controller.js')
        const yt = await handleYouTubeInput(lastUser, {
          aiGenerate: async ({ messages, max_tokens }) => callAIRouter(messages, { max_tokens: Math.min(Number(max_tokens) || 1400, 4096), taskHint: 'retrieval' }),
        })
        return res.status(200).json({
          content: yt?.message || '',
          model: 'youtube-insight',
          richType: 'youtube',
          youtubeFlow: yt?.flow,
          youtubeVideo: yt?.video ? {
            id: yt.video.id, url: yt.video.url, title: yt.video.title,
            channel: yt.video.author || yt.video.channel || '',
            duration: yt.video.duration || 0, views: yt.video.views || 0,
            thumbnail: yt.video.thumbnail || '', description: yt.video.description || '',
            captionText: yt.captionText || null,
          } : undefined,
          youtubeResults: (yt?.results || []).map(v => ({
            id: v.id, url: v.url, title: v.title, channel: v.channel || '',
            duration: v.duration || 0, views: v.views || 0, thumbnail: v.thumbnail || '',
          })),
          youtubeAnalysis: yt?.analysis ? { ok: true, summary: yt.analysis.summary || '', captionAvailable: !!yt.captionText } : undefined,
          youtubeSuggestions: yt?.suggestions || [],
          captionText: yt?.captionText || null,
          captionNote: yt?.captionNote || null,
        })
      } catch (e) {
        console.warn('[YouTube Insight] dedicated route failed:', e?.message || e)
      }
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

export default async function handler(req, res) {
  const url = new URL(req.url || `http://localhost${req.url}`)
  
  // Route /api/dz-agent-chat to standalone handler
  if (req.method === 'POST' && url.pathname === '/api/dz-agent-chat') {
    return handleChat(req, res)
  }
  
  // Fallback to server.js for all other routes
  let app
  try {
    const { app: importedApp } = await import('../server.js')
    app = importedApp
  } catch (err) {
    console.error('[Vercel] server.js import FAILED:', err?.message)
    app = (_req, res) => {
      res.status(500).json({
        error: 'Server startup failed',
        message: err?.message,
        stack: err?.stack?.split('\n').slice(0, 15),
      })
    }
  }
  return app(req, res)
}
