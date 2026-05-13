/**
 * YouTube Insight Controller — DZ Agent v2
 * Handles: URL analysis (with real metadata + captions), keyword search, video discussion
 */

import { YouTube } from 'youtube-sr'

// ── Browser-like headers to avoid bot detection ───────────────────────────
const YT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'ar,en;q=0.9,fr;q=0.8',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

// ── Invidious fallback instances (for metadata only, not search) ──────────
const INVIDIOUS_INSTANCES = [
  'https://invidious.protokolla.fi',
  'https://invidious.materialio.us',
  'https://iv.ggtyler.dev',
]

// ── Format duration (seconds → human readable) ────────────────────────────
function fmtDuration(secs) {
  if (!secs || secs <= 0) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Extract YouTube video ID ───────────────────────────────────────────────
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

// ════════════════════════════════════════════════════════════════════════════
// scrapeYouTubePage — primary metadata + captions extraction
// Fetches the watch page HTML and extracts: title, description, channel,
// views, keywords, and captionTracks URLs — all from og/meta tags + JSON
// ════════════════════════════════════════════════════════════════════════════
async function scrapeYouTubePage(videoId) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 14000)
    const r = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: YT_HEADERS,
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!r.ok) return null
    const html = await r.text()
    if (!html || html.length < 5000) return null

    // ── og: meta tags (always present) ─────────────────────────────────
    const ogTitle   = html.match(/<meta property="og:title"\s+content="([^"]+)"/)?.[1] || ''
    const ogDesc    = html.match(/<meta property="og:description"\s+content="([^"]+)"/)?.[1] || ''

    // ── Channel name ───────────────────────────────────────────────────
    const channel   = html.match(/"ownerChannelName":"([^"]+)"/)?.[1]
      || html.match(/"author":"([^"]+)"/)?.[1]
      || html.match(/<link itemprop="name" content="([^"]+)">/)?.[1]
      || ''

    // ── Views ──────────────────────────────────────────────────────────
    const viewsRaw  = html.match(/"viewCount":"([^"]+)"/)?.[1]
      || html.match(/"views":{"simpleText":"([^"]+)"/)?.[1]
      || '0'
    const views = parseInt(viewsRaw.replace(/\D/g, ''), 10) || 0

    // ── Duration ───────────────────────────────────────────────────────
    const lengthStr = html.match(/"lengthSeconds":"([^"]+)"/)?.[1] || '0'
    const duration  = parseInt(lengthStr, 10) || 0

    // ── Published date ─────────────────────────────────────────────────
    const published = html.match(/"publishDate":"([^"]+)"/)?.[1]
      || html.match(/"uploadDate":"([^"]+)"/)?.[1]
      || ''

    // ── Keywords ───────────────────────────────────────────────────────
    const kwRaw = html.match(/<meta name="keywords" content="([^"]+)"/)?.[1] || ''
    const keywords  = kwRaw ? kwRaw.split(',').map(k => k.trim()).filter(Boolean).slice(0, 12) : []

    // ── Full description (shortDescription in player response) ─────────
    let description = ''
    try {
      const sdMatch = html.match(/"shortDescription":"((?:[^"\\]|\\[\s\S])*?)"/)
      if (sdMatch) {
        description = sdMatch[1]
          .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
          .slice(0, 2000)
      }
    } catch {}
    if (!description) description = ogDesc

    // ── Caption tracks ─────────────────────────────────────────────────
    let captionTracks = []
    try {
      const capMatch = html.match(/"captionTracks":\[(.*?)\]/)
      if (capMatch) {
        const tracks = JSON.parse('[' + capMatch[1] + ']')
        captionTracks = tracks
          .filter(t => t.baseUrl && t.languageCode)
          .map(t => ({ lang: t.languageCode, name: t.name?.simpleText || t.languageCode, url: t.baseUrl }))
      }
    } catch {}

    // ── Thumbnail ──────────────────────────────────────────────────────
    const thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`

    console.log(`[YouTube:scrape] ✅ ${videoId} — "${ogTitle.slice(0, 60)}" ch="${channel}" views=${views} caps=${captionTracks.length}`)

    return {
      id: videoId,
      title: ogTitle,
      description,
      author: channel,
      duration,
      views,
      published,
      thumbnail,
      keywords,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      captionTracks,
    }
  } catch (err) {
    console.warn(`[YouTube:scrape] Failed for ${videoId}:`, err.message)
    return null
  }
}

// ── Fetch captions from YouTube timedtext API via tracks extracted from page
async function fetchCaptionsFromTracks(tracks = []) {
  // Priority: ar → en (auto) → en → first available
  const priority = ['ar', 'en', 'fr']
  const sorted = [
    ...priority.flatMap(lang => tracks.filter(t => t.lang === lang || t.lang.startsWith(lang))),
    ...tracks.filter(t => !priority.some(p => t.lang === p || t.lang.startsWith(p))),
  ]

  for (const track of sorted.slice(0, 4)) {
    try {
      const ctrl = new AbortController()
      const tmt = setTimeout(() => ctrl.abort(), 8000)
      // Try JSON3 format first, then XML
      const url = track.url + '&fmt=json3'
      const r = await fetch(url, { headers: { 'User-Agent': YT_HEADERS['User-Agent'] }, signal: ctrl.signal })
      clearTimeout(tmt)
      if (!r.ok) continue
      const ct = r.headers.get('content-type') || ''
      if (!ct.includes('json') && !ct.includes('text')) continue
      const data = await r.json().catch(() => null)
      if (!data?.events) continue
      const text = data.events
        .filter(e => e.segs && Array.isArray(e.segs))
        .map(e => e.segs.map(s => s.utf8 || '').join(''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text.length > 100) {
        console.log(`[YouTube:captions] ✅ Got ${text.length} chars in "${track.lang}" for video`)
        return { text: text.slice(0, 3500), lang: track.lang, name: track.name }
      }
    } catch {}
  }
  return null
}

// ── Invidious fallback for metadata (when page scrape fails) ──────────────
async function fetchVideoMetaInvidious(videoId) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      const r = await fetch(
        `${base}/api/v1/videos/${encodeURIComponent(videoId)}?fields=title,description,author,lengthSeconds,viewCount,publishedText,thumbnails`,
        { signal: ctrl.signal, headers: { 'User-Agent': 'DZ-GPT/2.0', Accept: 'application/json' } }
      )
      clearTimeout(t)
      if (!r.ok) continue
      const ct = r.headers.get('content-type') || ''
      if (!ct.includes('json')) continue
      const d = await r.json()
      if (!d?.title) continue
      return {
        id: videoId,
        title: d.title || '',
        description: (d.description || '').slice(0, 2000),
        author: d.author || '',
        duration: d.lengthSeconds || 0,
        views: d.viewCount || 0,
        published: d.publishedText || '',
        thumbnail: d.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        keywords: [],
        url: `https://www.youtube.com/watch?v=${videoId}`,
        captionTracks: [],
      }
    } catch {}
  }
  return null
}

// ── Search via Invidious API (fallback for youtube-sr) ────────────────────
async function searchInvidious(query, limit = 8) {
  const encoded = encodeURIComponent(query)
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      const r = await fetch(`${base}/api/v1/search?q=${encoded}&type=video&page=1`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'DZ-GPT/2.0', Accept: 'application/json' },
      })
      clearTimeout(t)
      if (!r.ok) continue
      const ct = r.headers.get('content-type') || ''
      if (!ct.includes('json')) continue
      const data = await r.json()
      if (!Array.isArray(data) || !data.length) continue
      console.log(`[YouTube:Invidious] Search OK via ${base} — ${data.length} results`)
      return data.slice(0, limit).map(v => ({
        id: v.videoId || '',
        title: v.title || '',
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        duration: v.lengthSeconds ? Number(v.lengthSeconds) : 0,
        views: v.viewCount || 0,
        channel: v.author || '',
        description: (v.description || '').slice(0, 200),
      })).filter(v => v.id && v.title)
    } catch (e) {
      console.warn(`[YouTube:Invidious] ${base} failed:`, e.message)
    }
  }
  return []
}

// ── Search YouTube (youtube-sr primary → Invidious fallback) ──────────────
async function searchYouTube(query, limit = 8) {
  try {
    const raw = await YouTube.search(query, { limit, type: 'video', safeSearch: false })
    const mapped = (Array.isArray(raw) ? raw : []).map(v => ({
      id: v.id || '',
      title: v.title || '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnail: v.thumbnail?.url || v.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      duration: v.duration ? Math.floor(v.duration / 1000) : 0,
      views: v.views || 0,
      channel: v.channel?.name || v.author?.name || '',
      description: (v.description || '').slice(0, 200),
    })).filter(v => v.id && v.title)
    if (mapped.length) {
      console.log(`[YouTube:search] youtube-sr OK — ${mapped.length} results for "${query}"`)
      return mapped
    }
  } catch (err) {
    console.warn('[YouTube:search] youtube-sr failed:', err.message)
  }

  console.log(`[YouTube:search] Falling back to Invidious for "${query}"`)
  const inv = await searchInvidious(query, limit)
  if (inv.length) return inv

  console.error(`[YouTube:search] All methods failed for "${query}"`)
  return []
}

// ── Build rich AI analysis prompt ─────────────────────────────────────────
function buildAnalysisPrompt(video, captionData) {
  const hasCaptions = captionData && captionData.text && captionData.text.length > 50
  const hasDesc = video.description && video.description.length > 30
  const hasKeywords = video.keywords && video.keywords.length > 0

  const lines = [
    `أنت DZ Agent — محلّل فيديوهات خبير. مهمتك تقديم تحليل عميق ومفيد حقيقي.`,
    ``,
    `## بيانات الفيديو`,
    `- **العنوان:** ${video.title}`,
    video.author ? `- **القناة:** ${video.author}` : null,
    video.duration > 0 ? `- **المدة:** ${fmtDuration(video.duration)}` : null,
    video.views > 0 ? `- **المشاهدات:** ${Number(video.views).toLocaleString('ar-DZ')}` : null,
    video.published ? `- **التاريخ:** ${video.published}` : null,
    hasKeywords ? `- **الكلمات المفتاحية:** ${video.keywords.slice(0, 8).join(', ')}` : null,
    ``,
    hasDesc ? `## وصف الفيديو\n${video.description.slice(0, 1200)}` : null,
    hasCaptions ? `## نص مقتطف من الفيديو (${captionData.name || captionData.lang})\n${captionData.text.slice(0, 3000)}` : null,
    ``,
    `## مهمتك — التحليل العميق`,
    hasCaptions
      ? `لديك نص حقيقي مستخرج من الفيديو — استخدمه لتقديم تحليل دقيق وتفصيلي.`
      : `لا يوجد نص مرفق — لكن بناءً على العنوان والوصف والكلمات المفتاحية، قدّم تحليلاً موضوعياً عميقاً للمحتوى.`,
    ``,
    `قدّم الإجابة بهذا الهيكل بالضبط:`,
    ``,
    `### 🎬 ملخص الفيديو`,
    `(3-5 جمل تشرح المحتوى الفعلي — ليس فقط إعادة صياغة العنوان)`,
    ``,
    `### 💡 أبرز ما يحتويه الفيديو`,
    `- نقطة 1 (محددة وذات قيمة)`,
    `- نقطة 2`,
    `- نقطة 3`,
    `- نقطة 4 (إن وجد)`,
    ``,
    `### 🎯 من يستفيد من هذا الفيديو؟`,
    `(حدّد الجمهور المستهدف بدقة: مبتدئ / متوسط / متقدم، ومن هم)`,
    ``,
    `### ✅ نقاط القوة`,
    `(ما يجعل هذا الفيديو مفيداً أو مميزاً)`,
    ``,
    `### 📊 التقييم العام`,
    `(من 5 نجوم + جملة تقييمية واضحة)`,
    ``,
    !hasCaptions ? `> ℹ️ ملاحظة: التحليل مبني على العنوان والوصف والكلمات المفتاحية — لا يتوفر نص الفيديو الكامل.` : null,
    ``,
    `أجب بالعربية. ابدأ مباشرةً بالهيكل. لا مقدمات.`,
  ].filter(l => l !== null).join('\n')

  return lines
}

// ═══════════════════════════════════════════════════════════════════════════
// handleYouTubeInput — Entry point: URL analysis OR keyword search
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

    // ── 1. Get metadata: scrape YouTube page (primary) → Invidious (fallback) ──
    let video = await scrapeYouTubePage(videoId)
    if (!video) {
      console.log(`[YouTube Insight] Page scrape failed, trying Invidious for ${videoId}`)
      video = await fetchVideoMetaInvidious(videoId)
    }

    // Last resort: bare minimum from video ID
    if (!video) {
      video = {
        id: videoId, title: 'فيديو YouTube', description: '', author: '',
        duration: 0, views: 0, published: '', keywords: [],
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        captionTracks: [],
      }
    }

    // ── 2. Get captions from extracted tracks ────────────────────────────
    let captionData = null
    if (video.captionTracks && video.captionTracks.length > 0) {
      captionData = await fetchCaptionsFromTracks(video.captionTracks)
    }
    const captionNote = !captionData
      ? 'لا تتوفر ترجمة — التحليل مبني على العنوان والوصف والكلمات المفتاحية.'
      : null

    // ── 3. AI analysis ───────────────────────────────────────────────────
    let analysisText = ''
    if (aiGenerate) {
      try {
        const prompt = buildAnalysisPrompt(video, captionData)
        const result = await aiGenerate({
          messages: [{ role: 'user', content: prompt }],
          query: video.title,
          max_tokens: 1400,
        })
        analysisText = result?.content || ''
      } catch (err) {
        console.error('[YouTube Insight] AI analysis error:', err.message)
        analysisText = `### 🎬 ملخص الفيديو\n**${video.title}**${video.author ? ` — ${video.author}` : ''}\n\n${video.description?.slice(0, 500) || ''}`
      }
    } else {
      analysisText = `**${video.title}**${video.author ? ` — ${video.author}` : ''}\n\n${video.description?.slice(0, 500) || ''}`
    }

    const analysis = {
      summary: analysisText,
      title: video.title,
      channel: video.author,
      duration: fmtDuration(video.duration),
      views: video.views,
    }

    const suggestions = [
      `ما أهم نقطة تعلمتها من هذا الفيديو؟`,
      `هل هذا الفيديو مناسب للمبتدئين؟`,
      `قارن هذا الفيديو مع محتوى مشابه`,
      `ما الذي يميز هذا الفيديو عن غيره؟`,
    ]

    const message = [
      `🎬 **${video.title}**`,
      video.author ? `📺 ${video.author}` : null,
      [
        video.duration > 0 ? `⏱️ ${fmtDuration(video.duration)}` : null,
        video.views > 0 ? `👁️ ${Number(video.views).toLocaleString('ar-DZ')} مشاهدة` : null,
      ].filter(Boolean).join(' · ') || null,
      ``,
      analysisText,
      captionNote ? `\n> ℹ️ ${captionNote}` : null,
    ].filter(l => l !== null).join('\n')

    return {
      flow: 'url',
      message,
      video: { ...video, captionTracks: undefined },
      analysis,
      suggestions,
      captionText: captionData?.text || null,
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
      message: `🔍 لم أجد نتائج لـ **"${searchQuery}"** على YouTube. جرب كلمات أخرى.`,
      results: [],
      suggestions: [
        `ابحث عن "${searchQuery} شرح"`,
        `ابحث عن "${searchQuery} tutorial"`,
        `ابحث عن "${searchQuery} للمبتدئين"`,
      ],
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
    `أنت DZ Agent — خبير في تحليل ومناقشة محتوى الفيديوهات.`,
    ``,
    `## الفيديو قيد النقاش`,
    `- **العنوان:** ${title}`,
    channel ? `- **القناة:** ${channel}` : null,
    description ? `- **الوصف:** ${description.slice(0, 800)}` : null,
    captionText ? `## نص مقتطف من الفيديو\n${captionText.slice(0, 3000)}` : null,
    ``,
    `## قواعد الإجابة`,
    `- أجب على سؤال المستخدم بدقة استناداً لمحتوى الفيديو المتوفر`,
    `- إذا كان النص الكامل غير متاح، استنتج بذكاء من العنوان والوصف والسياق`,
    `- أجب بالعربية الجزائرية أو الفصحى المبسطة حسب أسلوب المستخدم`,
    `- كن مفيداً وملموساً — لا تكتفِ بالقول "لا أعرف"`,
  ].filter(Boolean).join('\n')

  const apiMessages = [
    { role: 'system', content: systemMsg },
    ...history.slice(-6),
    { role: 'user', content: question },
  ]

  let reply = ''
  try {
    const result = await aiGenerate({ messages: apiMessages, query: question, max_tokens: 900 })
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
