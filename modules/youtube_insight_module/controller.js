/**
 * YouTube Insight Controller — DZ Agent
 * Handles: URL analysis, keyword search, video discussion
 */

import YouTube from 'youtube-sr'

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://iv.ggtyler.dev',
  'https://invidious.materialio.us',
  'https://invidious.protokolla.fi',
]

// ── Fetch video metadata from Invidious (fallback chain) ──────────────────
async function fetchVideoMeta(videoId) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      const r = await fetch(
        `${base}/api/v1/videos/${encodeURIComponent(videoId)}?fields=title,description,author,lengthSeconds,viewCount,publishedText,thumbnails`,
        { signal: ctrl.signal, headers: { 'User-Agent': 'DZ-GPT/2.0' } }
      )
      clearTimeout(t)
      if (!r.ok) continue
      const d = await r.json()
      return {
        id: videoId,
        title: d.title || '',
        description: (d.description || '').slice(0, 1500),
        author: d.author || '',
        duration: d.lengthSeconds || 0,
        views: d.viewCount || 0,
        published: d.publishedText || '',
        thumbnail: d.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      }
    } catch {}
  }
  return null
}

// ── Fetch captions via Invidious ──────────────────────────────────────────
async function fetchCaptions(videoId, lang = 'ar') {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 6000)
      const r = await fetch(
        `${base}/api/v1/captions/${encodeURIComponent(videoId)}?label=${lang}`,
        { signal: ctrl.signal, headers: { 'User-Agent': 'DZ-GPT/2.0' } }
      )
      clearTimeout(t)
      if (!r.ok) continue
      const text = await r.text()
      const cleaned = text
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ').trim()
      if (cleaned.length > 80) return cleaned.slice(0, 3000)
    } catch {}
  }
  return null
}

// ── Format duration ────────────────────────────────────────────────────────
function fmtDuration(secs) {
  if (!secs) return ''
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m >= 60) return `${Math.floor(m / 60)}س ${m % 60}د`
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Extract YouTube video ID from URL ─────────────────────────────────────
function extractVideoId(u) {
  try {
    const url = new URL(u)
    if (/youtu\.be$/i.test(url.hostname)) return url.pathname.slice(1).split('/')[0] || null
    if (url.pathname === '/watch') return url.searchParams.get('v')
    const m = url.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/)
    if (m) return m[2]
    return url.searchParams.get('v')
  } catch { return null }
}

// ── Is a valid YouTube URL ─────────────────────────────────────────────────
function isYtUrl(u) {
  if (typeof u !== 'string' || u.length > 2048) return false
  try {
    const url = new URL(u)
    return /^(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com|music\.youtube\.com)$/i.test(url.hostname)
  } catch { return false }
}

// ── Search YouTube for videos ──────────────────────────────────────────────
async function searchYouTube(query, limit = 8) {
  try {
    const raw = await YouTube.search(query, { limit, type: 'video', safeSearch: false })
    return (Array.isArray(raw) ? raw : []).map(v => ({
      id: v.id || '',
      title: v.title || '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnail: v.thumbnail?.url || v.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      duration: v.duration ? fmtDuration(Math.floor(v.duration / 1000)) : '',
      views: v.views || 0,
      channel: v.channel?.name || v.author?.name || '',
      description: (v.description || '').slice(0, 200),
    })).filter(v => v.id && v.title)
  } catch (err) {
    console.error('[YouTube:search] Error:', err.message)
    return []
  }
}

// ── Build analysis prompt from video data ─────────────────────────────────
function buildAnalysisPrompt(video, captions) {
  const parts = [
    `أنت DZ Agent — محلّل فيديو ذكي ومتخصص.`,
    ``,
    `## بيانات الفيديو`,
    `- **العنوان:** ${video.title}`,
    `- **القناة:** ${video.author}`,
    `- **المدة:** ${fmtDuration(video.duration)}`,
    `- **المشاهدات:** ${video.views?.toLocaleString()}`,
    `- **التاريخ:** ${video.published}`,
    ``,
    video.description ? `## وصف الفيديو\n${video.description.slice(0, 600)}` : '',
    captions ? `## نص مستخرج من الترجمة\n${captions.slice(0, 2000)}` : '',
    ``,
    `## مهمتك`,
    `قدّم تحليلاً شاملاً وذكياً للفيديو بهذا الهيكل بالضبط:`,
    ``,
    `### 🎬 ملخص الفيديو`,
    `(3-5 جمل تلخص محتوى الفيديو بدقة)`,
    ``,
    `### 💡 أهم النقاط`,
    `- نقطة 1`,
    `- نقطة 2`,
    `- نقطة 3`,
    ``,
    `### 🎯 الجمهور المستهدف`,
    `(من يستفيد من هذا الفيديو؟)`,
    ``,
    `### 📊 التقييم`,
    `(جودة المحتوى، الوضوح، الفائدة — بصيغة مختصرة)`,
    ``,
    `أجب بالعربية. لا تضف مقدمات. ابدأ مباشرةً بالهيكل.`,
  ].filter(Boolean).join('\n')
  return parts
}

// ═══════════════════════════════════════════════════════════════════════════
// handleYouTubeInput — Entry point for URL analysis or keyword search
// ═══════════════════════════════════════════════════════════════════════════
export async function handleYouTubeInput(urlOrQuery, opts = {}) {
  const { aiGenerate } = opts

  // ── URL Mode ─────────────────────────────────────────────────────────────
  if (isYtUrl(urlOrQuery)) {
    const videoId = extractVideoId(urlOrQuery)
    if (!videoId) {
      return { flow: 'url', message: '⚠️ لم أتمكن من استخراج معرّف الفيديو من الرابط.' }
    }

    console.log(`[YouTube Insight] URL mode — videoId: ${videoId}`)

    // 1. Fetch metadata
    let video = null
    try { video = await fetchVideoMeta(videoId) } catch {}

    // Fallback metadata from youtube-sr
    if (!video) {
      try {
        const sr = await YouTube.getVideo(`https://www.youtube.com/watch?v=${videoId}`)
        if (sr) {
          video = {
            id: videoId,
            title: sr.title || 'فيديو YouTube',
            description: (sr.description || '').slice(0, 1000),
            author: sr.channel?.name || sr.author?.name || '',
            duration: sr.duration ? Math.floor(sr.duration / 1000) : 0,
            views: sr.views || 0,
            published: '',
            thumbnail: sr.thumbnail?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${videoId}`,
          }
        }
      } catch {}
    }

    if (!video) {
      video = {
        id: videoId,
        title: 'فيديو YouTube',
        description: '',
        author: '',
        duration: 0,
        views: 0,
        published: '',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      }
    }

    // 2. Try captions (try Arabic first, then English)
    let captionText = null
    let captionNote = null
    try {
      captionText = await fetchCaptions(videoId, 'ar')
        || await fetchCaptions(videoId, 'en')
        || await fetchCaptions(videoId, '')
    } catch {}
    if (!captionText) {
      captionNote = 'لا تتوفر ترجمة — التحليل مبني على العنوان والوصف.'
    }

    // 3. AI analysis
    let analysisText = ''
    let analysis = null
    if (aiGenerate) {
      try {
        const prompt = buildAnalysisPrompt(video, captionText)
        const result = await aiGenerate({
          messages: [{ role: 'user', content: prompt }],
          query: video.title,
          max_tokens: 1200,
        })
        analysisText = result?.content || ''
      } catch (err) {
        console.error('[YouTube Insight] AI analysis error:', err.message)
        analysisText = `### 🎬 ملخص الفيديو\nتحليل الفيديو: **${video.title}**${video.author ? ` — بواسطة **${video.author}**` : ''}.${video.description ? `\n\n${video.description.slice(0, 400)}` : ''}`
      }
    } else {
      analysisText = `**${video.title}**${video.author ? ` — ${video.author}` : ''}\n\n${video.description?.slice(0, 500) || ''}`
    }

    analysis = {
      summary: analysisText,
      title: video.title,
      channel: video.author,
      duration: fmtDuration(video.duration),
      views: video.views,
    }

    const suggestions = [
      `اشرح لي أهم نقطة في هذا الفيديو`,
      `هل هذا الفيديو مناسب للمبتدئين؟`,
      `ابحث عن فيديوهات مشابهة لـ "${video.title?.slice(0, 40)}"`,
      `ما رأيك في جودة المحتوى؟`,
    ]

    const message = [
      `🎬 **${video.title}**`,
      video.author ? `📺 ${video.author}` : null,
      [fmtDuration(video.duration) ? `⏱️ ${fmtDuration(video.duration)}` : null, video.views ? `👁️ ${Number(video.views).toLocaleString()} مشاهدة` : null].filter(Boolean).join(' · ') || null,
      ``,
      analysisText,
      captionNote ? `\n> ℹ️ ${captionNote}` : null,
    ].filter(l => l !== null).join('\n')

    return {
      flow: 'url',
      message,
      video,
      analysis,
      suggestions,
      captionText,
      captionNote,
    }
  }

  // ── Search Mode ──────────────────────────────────────────────────────────
  const searchQuery = urlOrQuery
    .replace(/(?:ابحث\s+(?:عن|لي)|جيبلي|عطيني|شرحلي|بالفيديو|فيديو\s+عن|يوتيوب|يوتيب)/gi, '')
    .replace(/\s+/g, ' ').trim()
    || urlOrQuery

  console.log(`[YouTube Insight] Search mode — query: "${searchQuery}"`)
  const results = await searchYouTube(searchQuery, 8)

  if (!results.length) {
    return {
      flow: 'search',
      message: `🔍 لم أجد نتائج لـ **"${searchQuery}"** على YouTube. جرب كلمات مختلفة.`,
      results: [],
      suggestions: [`ابحث عن "${searchQuery} شرح"`, `ابحث عن "${searchQuery} tutorial"`],
    }
  }

  const suggestions = [
    `شرح لي الفيديو الأول`,
    `حلّل الفيديو الثاني`,
    `أي فيديو تنصحني به؟`,
    `ابحث عن "${searchQuery} للمبتدئين"`,
  ]

  return {
    flow: 'search',
    message: `🔍 وجدت **${results.length} فيديوهات** عن **"${searchQuery}"** — اختر فيديو لتحليله:`,
    results,
    suggestions,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// handleVideoDiscussion — Answer questions about an active video
// ═══════════════════════════════════════════════════════════════════════════
export async function handleVideoDiscussion(youtubeContext, question, history = [], aiGenerate) {
  const { id: videoId, title = '', channel = '', description = '', captionText = '' } = youtubeContext || {}

  if (!videoId) {
    return { reply: '⚠️ لا يوجد فيديو نشط للنقاش. أرسل رابط YouTube أولاً.', quickSuggestions: [] }
  }

  console.log(`[YouTube Discussion] videoId=${videoId} question="${question?.slice(0, 60)}"`)

  const systemMsg = [
    `أنت DZ Agent — خبير في تحليل ومناقشة الفيديوهات.`,
    ``,
    `## الفيديو النشط`,
    `- **العنوان:** ${title}`,
    channel ? `- **القناة:** ${channel}` : null,
    description ? `- **الوصف:** ${description.slice(0, 500)}` : null,
    captionText ? `- **نص مستخرج من الفيديو:**\n${captionText.slice(0, 2000)}` : null,
    ``,
    `## قواعد الإجابة`,
    `- أجب على سؤال المستخدم بدقة بناءً على محتوى الفيديو`,
    `- إذا لم تجد الإجابة في المحتوى المتوفر، قل ذلك بصدق`,
    `- أجب بالعربية بأسلوب واضح ومباشر`,
    `- لا تفترض معلومات غير موجودة في بيانات الفيديو`,
  ].filter(Boolean).join('\n')

  const apiMessages = [
    { role: 'system', content: systemMsg },
    ...history.slice(-6),
    { role: 'user', content: question },
  ]

  let reply = ''
  try {
    const result = await aiGenerate({ messages: apiMessages, query: question, max_tokens: 800 })
    reply = result?.content || 'لم أتمكن من الإجابة على سؤالك.'
  } catch (err) {
    console.error('[YouTube Discussion] AI error:', err.message)
    reply = '⚠️ حدث خطأ أثناء معالجة سؤالك. يرجى المحاولة مرة أخرى.'
  }

  const quickSuggestions = [
    `ما هي أهم نقطة في الفيديو؟`,
    `هل هذا الموضوع مناسب للمبتدئين؟`,
    `لخّص الفيديو في 3 نقاط`,
    `ما رأيك في جودة الشرح؟`,
  ]

  return { reply, quickSuggestions }
}
