/**
 * YouTube Insight Module — Controller
 * Orchestrates extractor + analyzer.
 * Exports the single entry point: handleYouTubeInput(input, options)
 */

import { detectInput, searchVideos, fetchVideoData } from './extractor.js'
import { analyzeVideo, discussVideo } from './analyzer.js'

/**
 * Detect whether a string looks YouTube-related (URL or explicit query).
 * Useful for callers that want to auto-route input to this module.
 * @param {string} input
 * @returns {boolean}
 */
export function isYouTubeInput(input) {
  const s = String(input || '').toLowerCase()
  const detected = detectInput(s)
  if (detected.type === 'url') return true
  // Treat explicit search intent as YouTube-related
  const ytKeywords = ['youtube', 'يوتيوب', 'يوتيب', 'فيديو', 'video', 'vidéo']
  return ytKeywords.some(kw => s.includes(kw))
}

/**
 * Main entry point for the YouTube Insight Module.
 *
 * Handles two flows:
 *   A) YouTube URL  → extract video data → AI analysis → opening message
 *   B) Search query → return top results (user picks one, then call again with URL)
 *
 * @param {string}   input      — YouTube URL or search query
 * @param {Object}   options
 * @param {Function} options.aiGenerate  — injected AI generator (required for analysis)
 * @returns {Promise<Object>}
 */
export async function handleYouTubeInput(input, options = {}) {
  const { aiGenerate } = options
  const detection = detectInput(String(input || '').trim())

  // ── Flow A: YouTube URL ───────────────────────────────────────────────────
  if (detection.type === 'url' && detection.videoId) {
    let videoData
    try {
      videoData = await fetchVideoData(detection.videoId)
    } catch (err) {
      return {
        ok: false,
        flow: 'url',
        videoId: detection.videoId,
        error: `تعذر جلب بيانات الفيديو: ${err.message}`,
        message: '⚠️ تعذر جلب معلومات هذا الفيديو. تحقق من الرابط أو حاول مرة أخرى.',
      }
    }

    // Only fail hard if we have absolutely nothing — no title, description, or captions
    if (!videoData.title && !videoData.description && !videoData.captions) {
      return {
        ok: false,
        flow: 'url',
        videoId: detection.videoId,
        error: 'empty_video_data',
        message: '⚠️ لم يتمكن DZ Agent من جلب بيانات هذا الفيديو. قد يكون محمياً أو تعذّر الوصول إليه. جرّب رابطاً آخر.',
      }
    }

    // If yt-dlp failed but we have captions, use a safe fallback title
    if (!videoData.title && videoData.captions) {
      videoData.title = 'فيديو YouTube'
    }

    // Run AI analysis if we have an aiGenerate function
    let analysis = null
    if (typeof aiGenerate === 'function') {
      try {
        analysis = await analyzeVideo(videoData, aiGenerate)
      } catch (err) {
        console.warn('[YouTubeInsight:Controller] analyzeVideo error:', err.message)
      }
    }

    return {
      ok: true,
      flow: 'url',
      videoId: detection.videoId,
      video: {
        id: videoData.id,
        url: videoData.url,
        title: videoData.title,
        channel: videoData.channel,
        duration: videoData.duration,
        views: videoData.views,
        thumbnail: videoData.thumbnail,
        publishDate: videoData.publishDate,
        tags: videoData.tags,
      },
      captionAvailable: !!videoData.captions,
      captionText: videoData.captions
        ? videoData.captions.slice(0, 6000)
        : null,
      captionNote: videoData.captions
        ? null
        : '⚠️ الترجمة النصية غير متوفرة — التحليل مبني على العنوان والوصف فقط.',
      analysis,
      message: analysis?.openingMessage || buildDefaultOpening(videoData),
      suggestions: analysis?.conversationStarters || defaultSuggestions(),
    }
  }

  // ── Flow B: Search query ──────────────────────────────────────────────────
  const results = await searchVideos(detection.query, 8)

  if (results.length === 0) {
    return {
      ok: false,
      flow: 'search',
      query: detection.query,
      results: [],
      message: `🔍 لم أجد نتائج لـ "${detection.query}" على YouTube. حاول بكلمات مفتاحية مختلفة.`,
    }
  }

  return {
    ok: true,
    flow: 'search',
    query: detection.query,
    results,
    message: `🔍 وجدت ${results.length} نتائج لـ "${detection.query}". اختر فيديو لتحليله:`,
    suggestions: ['أرسل رابط الفيديو الذي تريد تحليله', 'أو اسألني عن أي من النتائج'],
  }
}

/**
 * Continue a discussion about a previously analyzed video.
 * @param {Object}   videoData   — raw video data from fetchVideoData()
 * @param {string}   userMessage
 * @param {Array}    history     — previous { role, content } pairs
 * @param {Function} aiGenerate
 * @returns {Promise<Object>}
 */
export async function handleVideoDiscussion(videoData, userMessage, history, aiGenerate) {
  if (typeof aiGenerate !== 'function') {
    return { ok: false, reply: 'خدمة الذكاء الاصطناعي غير متوفرة حالياً.' }
  }
  return discussVideo(videoData, userMessage, history, aiGenerate)
}

function buildDefaultOpening(videoData) {
  const title = videoData.title || 'هذا الفيديو'
  return `🎬 تم تحليل **"${title}"** بنجاح!\n\nكيف يمكنني مساعدتك؟`
}

function defaultSuggestions() {
  return [
    'هل تريد النقاط الرئيسية من هذا الفيديو؟',
    'هل تريد تحويل المحتوى إلى مهام قابلة للتنفيذ؟',
    'هل تريد أفكار مشاريع مستوحاة من هذا الفيديو؟',
  ]
}
