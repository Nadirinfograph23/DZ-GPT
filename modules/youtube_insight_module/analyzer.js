/**
 * YouTube Insight Module — Analyzer
 * Sends video data to the AI (Groq via injected aiGenerate) and returns:
 *   - summary, keyIdeas, category, conversationStarters, taskSuggestions
 */

import { buildVideoContext } from './extractor.js'

// Topic categories the AI will assign
const CATEGORIES = [
  'تقنية وبرمجة', 'ذكاء اصطناعي', 'تعليم وعلوم', 'أعمال وريادة', 'صحة ولياقة',
  'سياسة وأخبار', 'ترفيه وفكاهة', 'رياضة', 'دين وروحانية', 'موسيقى وفن',
  'سفر وثقافة', 'طبخ وطعام', 'تاريخ وحضارة', 'اقتصاد ومال', 'محتوى جزائري',
  'Technology & Coding', 'AI & Machine Learning', 'Education', 'Business',
  'Health & Fitness', 'Entertainment', 'Sports', 'Other',
]

const SYSTEM_PROMPT = `أنت مساعد ذكاء اصطناعي متخصص في تحليل محتوى الفيديوهات على YouTube.
تعمل داخل DZ Agent — نظام ذكاء اصطناعي جزائري متقدم.

عند تلقيك بيانات فيديو، قم بما يلي بدقة:
1. لخّص محتوى الفيديو بأسلوب واضح وبسيط
2. استخرج الأفكار الرئيسية (3-7 نقاط)
3. حدّد فئة الموضوع
4. اقترح أسئلة للنقاش مع المستخدم
5. اقترح ما يمكن تحويله إلى مهام أو مشاريع

اجب دائماً بصيغة JSON صالحة بالهيكل المحدد. لا تضف أي نص خارج JSON.`

const ANALYSIS_SCHEMA = `{
  "summary": "ملخص المحتوى بـ 2-4 جمل",
  "keyIdeas": ["فكرة 1", "فكرة 2", "فكرة 3"],
  "category": "فئة الموضوع",
  "language": "لغة الفيديو الأساسية (ar/fr/en/other)",
  "sentiment": "positive|neutral|informative|mixed",
  "conversationStarters": [
    "سؤال أو اقتراح للمستخدم 1",
    "سؤال أو اقتراح للمستخدم 2",
    "سؤال أو اقتراح للمستخدم 3"
  ],
  "taskSuggestions": [
    "مهمة أو مشروع يمكن استخلاصه 1",
    "مهمة أو مشروع يمكن استخلاصه 2"
  ],
  "openingMessage": "رسالة ترحيب محادثية تبدأ النقاش مع المستخدم حول الفيديو"
}`

/**
 * Analyze a video using the injected AI generator.
 * @param {Object} videoData   — from extractor.fetchVideoData()
 * @param {Function} aiGenerate — injected from server.js (same interface as safeGenerateAI)
 * @returns {Promise<Object>}
 */
export async function analyzeVideo(videoData, aiGenerate) {
  const context = buildVideoContext(videoData)

  let captionNote
  if (videoData.captions && videoData.title && videoData.title !== 'فيديو YouTube') {
    captionNote = '✅ النص الكامل للفيديو متوفر — استخدمه كمصدر رئيسي للتحليل.'
  } else if (videoData.captions) {
    captionNote = '✅ النص الكامل للفيديو متوفر — استخدمه كمصدر رئيسي للتحليل (بيانات العنوان غير مكتملة).'
  } else {
    captionNote = '⚠️ لا تتوفر ترجمة نصية — التحليل مبني على العنوان والوصف فقط.'
  }

  const userMessage = `بيانات الفيديو:
${context}

${captionNote}

أعطني التحليل الكامل بصيغة JSON بالهيكل التالي:
${ANALYSIS_SCHEMA}`

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]

  let raw = null
  try {
    const result = await aiGenerate({
      messages,
      query: videoData.title || 'youtube video analysis',
      max_tokens: 1500,
    })
    raw = result?.content || null
  } catch (err) {
    console.warn('[YouTubeInsight:Analyzer] aiGenerate error:', err.message)
  }

  if (raw) {
    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
      const parsed = JSON.parse(cleaned)
      return {
        ok: true,
        summary: parsed.summary || '',
        keyIdeas: Array.isArray(parsed.keyIdeas) ? parsed.keyIdeas : [],
        category: parsed.category || 'غير محدد',
        language: parsed.language || 'ar',
        sentiment: parsed.sentiment || 'neutral',
        conversationStarters: Array.isArray(parsed.conversationStarters) ? parsed.conversationStarters : [],
        taskSuggestions: Array.isArray(parsed.taskSuggestions) ? parsed.taskSuggestions : [],
        openingMessage: parsed.openingMessage || buildFallbackOpening(videoData),
        captionAvailable: !!videoData.captions,
      }
    } catch {
      // JSON parse failed — extract what we can from plain text
      return buildFallbackAnalysis(videoData, raw)
    }
  }

  return buildFallbackAnalysis(videoData, null)
}

/**
 * Continue a discussion about a video with the user.
 * @param {Object} videoData
 * @param {string} userMessage
 * @param {Array}  history       — previous { role, content } pairs
 * @param {Function} aiGenerate
 * @returns {Promise<Object>}
 */
export async function discussVideo(videoData, userMessage, history, aiGenerate) {
  const context = buildVideoContext(videoData)

  let sourceNote
  if (videoData.captions && videoData.title && videoData.title !== 'فيديو YouTube') {
    sourceNote = '\n\nالنص الكامل للفيديو متوفر — استنِد إليه أساساً في إجاباتك.'
  } else if (videoData.captions) {
    sourceNote = '\n\nالنص الكامل للفيديو متوفر لكن بيانات العنوان غير مكتملة — استخدم النص كمصدر رئيسي.'
  } else {
    sourceNote = '\n\n(ملاحظة: لا تتوفر ترجمة نصية، أجب بناءً على العنوان والوصف المتاح)'
  }

  const systemPrompt = `أنت مساعد محادثة داخل DZ Agent تتحدث عن هذا الفيديو على YouTube:
${context}${sourceNote}

تصرف كمحلل محتوى ذكي. أجب بلغة المستخدم (عربية، دارجة جزائرية، فرنسية، أو إنجليزية).
كن محادثياً، موجزاً، ومفيداً. إذا طُلب منك مهام أو أفكار مشاريع، قدّمها في نقاط واضحة.`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...((history || []).slice(-10)),
    { role: 'user', content: userMessage },
  ]

  try {
    const result = await aiGenerate({
      messages,
      query: userMessage,
      max_tokens: 1200,
    })
    return {
      ok: true,
      reply: result?.content || 'لم أتمكن من توليد رد. يرجى المحاولة مرة أخرى.',
    }
  } catch (err) {
    console.warn('[YouTubeInsight:Analyzer] discussVideo error:', err.message)
    return { ok: false, reply: 'حدث خطأ أثناء المعالجة. يرجى المحاولة مرة أخرى.' }
  }
}

function buildFallbackOpening(videoData) {
  const title = videoData.title || 'هذا الفيديو'
  return `لقد حللت "${title}" 🎬 — هل تريد معرفة النقاط الرئيسية، أم تحويل المحتوى إلى مهام ومشاريع؟`
}

function buildFallbackAnalysis(videoData, rawText) {
  return {
    ok: true,
    summary: rawText
      ? rawText.slice(0, 500)
      : `الفيديو بعنوان "${videoData.title || 'غير معروف'}" — ${videoData.captions ? 'تمت معالجة النص الكامل.' : 'لا تتوفر ترجمة نصية، جرى التحليل على أساس الوصف.'}`,
    keyIdeas: [],
    category: 'غير محدد',
    language: 'ar',
    sentiment: 'neutral',
    conversationStarters: [
      'هل تريد النقاط الرئيسية من هذا الفيديو؟',
      'هل تريد تحويل محتوى الفيديو إلى مهام قابلة للتنفيذ؟',
      'هل تريد اقتراح أفكار مشاريع بناءً على هذا الفيديو؟',
    ],
    taskSuggestions: [],
    openingMessage: buildFallbackOpening(videoData),
    captionAvailable: !!videoData.captions,
  }
}
