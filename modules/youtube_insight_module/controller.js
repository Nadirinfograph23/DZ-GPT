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
  'https://invidious.materialio.us',
  'https://invidious.protokolla.fi',
  'https://iv.ggtyler.dev',
  'https://invidious.privacyredirect.com',
  'https://invidious.lunar.icu',
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

// ── Clean thumbnail URL — strip expiring sqp/rs signed params ────────────
function cleanThumb(id, rawUrl) {
  // Always use the stable public hqdefault URL (no expiring sqp/rs params)
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

// ── Search YouTube (youtube-sr primary → Invidious fallback) ──────────────
async function searchYouTube(query, limit = 8) {
  try {
    const raw = await YouTube.search(query, { limit, type: 'video', safeSearch: false })
    const mapped = (Array.isArray(raw) ? raw : []).map(v => ({
      id: v.id || '',
      title: v.title || '',
      url: `https://www.youtube.com/watch?v=${v.id}`,
      thumbnail: cleanThumb(v.id, v.thumbnail?.url || v.thumbnails?.[0]?.url),
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

  console.log(`[YouTube:search] Trying Jina reader fallback for "${query}"`)
  const jinaResults = await searchYouTubeViaJina(query, limit)
  if (jinaResults.length) return jinaResults

  console.error(`[YouTube:search] All methods failed for "${query}"`)
  return []
}

// ── Jina reader fallback — scrapes YouTube search page via r.jina.ai ──────
async function searchYouTubeViaJina(query, limit = 8) {
  try {
    const encoded = encodeURIComponent(query)
    const jinaUrl = `https://r.jina.ai/https://www.youtube.com/results?search_query=${encoded}`
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 12000)
    const r = await fetch(jinaUrl, {
      signal: ctrl.signal,
      headers: { 'Accept': 'text/plain,text/markdown,*/*', 'User-Agent': 'DZ-GPT/2.0' },
    })
    clearTimeout(t)
    if (!r.ok) return []
    const md = await r.text()

    // Extract YouTube video IDs from markdown links: [title](https://www.youtube.com/watch?v=ID)
    const videoRe = /\[([^\]]+)\]\(https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})[^)]*\)/g
    const seen = new Set()
    const results = []
    let m
    while ((m = videoRe.exec(md)) !== null && results.length < limit) {
      const title = m[1].trim()
      const id = m[2]
      if (!id || seen.has(id) || title.length < 3) continue
      seen.add(id)
      results.push({
        id,
        title,
        url: `https://www.youtube.com/watch?v=${id}`,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        duration: 0,
        views: 0,
        channel: '',
        description: '',
      })
    }

    if (results.length) {
      console.log(`[YouTube:Jina] OK — ${results.length} results for "${query}"`)
      return results
    }
    return []
  } catch (err) {
    console.warn('[YouTube:Jina] Failed:', err.message)
    return []
  }
}

// ── Static fallback suggestions (used when AI is unavailable) ─────────────
function buildFallbackSuggestions(video) {
  const ctx = `${video.title || ''} ${video.description || ''} ${(video.keywords || []).join(' ')}`.toLowerCase()
  if (/react|vue|python|javascript|برمجة|كود|تطوير|programming/i.test(ctx))
    return [`ما التقنيات المذكورة في الفيديو؟`, `هل توجد طريقة أحدث لنفس الموضوع؟`, `حوّل خطوات الشرح إلى دليل تنفيذ`]
  if (/ذكاء اصطناعي|ai|machine learning|gpt|llm|نموذج/i.test(ctx))
    return [`ما النماذج المذكورة في الفيديو؟`, `قارن هذا الموضوع مع أحدث تطورات الذكاء الاصطناعي`, `ما أهم مفهوم تقني في الفيديو؟`]
  if (/تاريخ|حرب|معركة|ثورة|history|war|battle/i.test(ctx))
    return [`متى وقعت هذه الأحداث؟`, `ما أسباب هذا الحدث التاريخي؟`, `ما نتائج وتداعيات هذه الأحداث؟`]
  if (/صحة|تغذية|رياضة|تمرين|health|fitness|nutrition/i.test(ctx))
    return [`هل النصائح المذكورة علمياً صحيحة؟`, `ما خطة التطبيق العملي؟`, `ما المخاطر المحتملة غير المذكورة؟`]
  if (/اقتصاد|تداول|استثمار|trading|crypto|bitcoin/i.test(ctx))
    return [`ما الاستراتيجية الرئيسية في الفيديو؟`, `ما المخاطر التي لم يذكرها الفيديو؟`, `هل هذا مناسب للمبتدئين في الاستثمار؟`]
  return [`لخّص هذا الفيديو في 3 نقاط`, `ما أبرز المعلومات في هذا الفيديو؟`, `هل يمكنك التوسع في الموضوع الرئيسي؟`]
}

// ── Build AI-powered contextual suggestions from video title + description ──
async function buildAISuggestions(video, aiGenerate) {
  const title = (video.title || '').trim()
  const desc  = (video.description || '').slice(0, 600).trim()
  const kw    = (video.keywords || []).slice(0, 6).join(', ')

  if (!aiGenerate || !title) return buildFallbackSuggestions(video)

  const prompt = [
    `أنت مساعد يولّد أسئلة متابعة ذكية ومحددة بناءً على محتوى فيديو YouTube.`,
    ``,
    `## بيانات الفيديو`,
    `- العنوان: ${title}`,
    kw ? `- الكلمات المفتاحية: ${kw}` : null,
    desc ? `- الوصف: ${desc}` : null,
    ``,
    `## مهمتك`,
    `اقترح بالضبط 4 أسئلة قصيرة ومحددة يمكن للمستخدم أن يسألها عن **موضوع هذا الفيديو تحديداً**.`,
    `- الأسئلة يجب أن تكون مباشرة ومرتبطة فعلياً بمحتوى الفيديو (الأشخاص، الأحداث، المفاهيم، التواريخ، التقنيات المذكورة).`,
    `- لا تذكر عبارات عامة مثل "هل الفيديو مناسب للمبتدئين" أو "ما الجمهور المستهدف" أو "قارن مع محتوى مشابه".`,
    `- اكتب كل سؤال في سطر منفصل يبدأ بـ "-".`,
    `- الأسئلة بالعربية، قصيرة (لا تتجاوز 10 كلمات).`,
    `- مثال: إذا كان العنوان "الحرب على الخليج" فالأسئلة: متى اندلعت حرب الخليج؟ / من هي الأطراف المتنازعة؟ / ما أسباب الحرب؟ / ما نتائج حرب الخليج؟`,
    ``,
    `أجب فقط بالأسئلة الأربعة، لا إضافات.`,
  ].filter(Boolean).join('\n')

  try {
    const result = await Promise.race([
      aiGenerate({ messages: [{ role: 'user', content: prompt }], max_tokens: 200 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
    ])

    const raw = (result?.content || '').trim()
    const suggestions = raw
      .split('\n')
      .map(l => l.replace(/^[-–•*\d.)\s]+/, '').trim())
      .filter(l => l.length > 4 && l.length < 120)
      .slice(0, 4)

    if (suggestions.length >= 2) {
      console.log(`[YouTube Insight] AI suggestions generated: ${suggestions.length}`)
      return suggestions
    }
  } catch (err) {
    console.warn(`[YouTube Insight] AI suggestions failed (${err.message}), using fallback`)
  }

  return buildFallbackSuggestions(video)
}

// ── Build rich AI analysis prompt ─────────────────────────────────────────
function buildAnalysisPrompt(video, captionData) {
  const hasCaptions = captionData && captionData.text && captionData.text.length > 50
  const hasDesc = video.description && video.description.length > 30
  const hasKeywords = video.keywords && video.keywords.length > 0

  const noCaptionsInstruction = hasDesc
    ? `لا يوجد نص مُستخرج من الفيديو — لكن لديك العنوان والوصف والكلمات المفتاحية. استخدم هذه البيانات **إضافةً إلى معرفتك التدريبية الكاملة** عن هذا الموضوع لتقديم ملخص وافٍ ومفيد حقيقي — كأنك شاهدت الفيديو وتعرف محتواه جيداً.`
    : `لا يوجد وصف ولا نص مُستخرج — لديك فقط العنوان: "${video.title}". استنِد على معرفتك التدريبية الكاملة عن هذا الموضوع وقدّم ملخصاً تعليمياً مفيداً يشرح ما يتناوله هذا النوع من المحتوى عادةً، بناءً على العنوان.`

  const lines = [
    `أنت DZ Agent — محلّل فيديوهات خبير. مهمتك تقديم ملخص عميق ومفيد فعلاً للمستخدم.`,
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
    `## مهمتك`,
    hasCaptions
      ? `لديك نص حقيقي مستخرج من الفيديو — استخدمه لتقديم تحليل دقيق وتفصيلي.`
      : noCaptionsInstruction,
    ``,
    `قدّم الإجابة بهذا الهيكل:`,
    ``,
    `### 🎬 ملخص الفيديو`,
    hasCaptions
      ? `(3-5 جمل تشرح المحتوى الفعلي بناءً على النص المستخرج)`
      : `(اشرح بـ3-5 جمل ما يتناوله هذا الفيديو — استنِد على العنوان والوصف ومعرفتك بالموضوع، لا تكتفِ بإعادة صياغة العنوان)`,
    ``,
    `### 💡 أبرز ما يحتويه الفيديو`,
    `- نقطة محددة وذات قيمة`,
    `- نقطة ثانية`,
    `- نقطة ثالثة`,
    `- نقطة رابعة (إن وجد)`,
    ``,
    `### 🎯 من يستفيد من هذا الفيديو؟`,
    `(مبتدئ / متوسط / متقدم — ومن هم تحديداً)`,
    ``,
    `### ✅ لماذا يستحق المشاهدة؟`,
    `(جملة أو اثنتان تقنعان المستخدم بقيمة الفيديو)`,
    ``,
    `### 📊 التقييم`,
    `(★★★★☆ مثلاً + جملة تقييمية مختصرة)`,
    ``,
    !hasCaptions ? `> ℹ️ الملخص مبني على العنوان والوصف ومعرفة DZ Agent بهذا المجال.` : null,
    ``,
    `أجب بالعربية. ابدأ مباشرةً. لا مقدمات ولا تكرار للتعليمات.`,
  ].filter(l => l !== null).join('\n')

  return lines
}

// ═══════════════════════════════════════════════════════════════════════════
// handleYouTubeInput — Entry point: URL analysis OR keyword search
// ═══════════════════════════════════════════════════════════════════════════
export async function handleYouTubeInput(urlOrQuery, opts = {}) {
  const { aiGenerate, preloadedMeta, noSuggestions } = opts

  // ── URL Mode ─────────────────────────────────────────────────────────────
  if (isYtUrl(urlOrQuery)) {
    const videoId = extractVideoId(urlOrQuery)
    if (!videoId) {
      return { flow: 'url', message: '⚠️ لم أتمكن من استخراج معرّف الفيديو من الرابط.' }
    }

    console.log(`[YouTube Insight] URL mode — videoId: ${videoId} preloaded=${!!preloadedMeta?.title}`)

    // ── 1. Get metadata: scrape YouTube page (primary) → Invidious (fallback) ──
    let video = await scrapeYouTubePage(videoId)
    if (!video) {
      console.log(`[YouTube Insight] Page scrape failed, trying Invidious for ${videoId}`)
      video = await fetchVideoMetaInvidious(videoId)
    }

    // Last resort: use preloaded metadata from search results card (if available),
    // or fall back to bare minimum so we can still generate an AI summary from the title
    if (!video) {
      if (preloadedMeta?.title) {
        console.log(`[YouTube Insight] Using preloaded meta for ${videoId}: "${preloadedMeta.title}"`)
        video = {
          id: videoId,
          title: preloadedMeta.title,
          description: preloadedMeta.description || '',
          author: preloadedMeta.channel || '',
          duration: preloadedMeta.duration || 0,
          views: preloadedMeta.views || 0,
          published: '',
          keywords: [],
          thumbnail: preloadedMeta.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          captionTracks: [],
        }
      } else {
        video = {
          id: videoId, title: 'فيديو YouTube', description: '', author: '',
          duration: 0, views: 0, published: '', keywords: [],
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          captionTracks: [],
        }
      }
    } else if (preloadedMeta?.description && (!video.description || video.description.length < preloadedMeta.description.length)) {
      // Enrich scraped data with preloaded description if it's longer
      video.description = preloadedMeta.description
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

    const suggestions = noSuggestions ? [] : await buildAISuggestions(video, aiGenerate)

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
    .replace(/(?:ابحث\s+(?:عن|لي|لنا)|جيبلي|عطيني|شرحلي|شوفلي|حبيت\s+نشوف|بالفيديو|بالفيديوهات|فيديو\s+(?:عن|حول|بخصوص)|يوتيوب|يوتيب|على\s+يوتيوب)/gi, '')
    .replace(/^\s*(?:ابحث|جيب|شوف|عطي)\s+/gi, '')
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
    `أنت DZ AGENT 🤖🇩🇿 — محلّل فيديوهات ذكي ومتخصص. مهمتك مناقشة هذا الفيديو وتحليله بعمق حقيقي.`,
    ``,
    `## الفيديو قيد النقاش`,
    `- **العنوان:** ${title}`,
    channel ? `- **القناة:** ${channel}` : null,
    description ? `- **الوصف:**\n${description.slice(0, 1000)}` : null,
    captionText
      ? `\n## نص حقيقي مستخرج من الفيديو (captions)\n> استخدم هذا النص كمرجع أساسي — هو المحتوى الفعلي للفيديو\n${captionText.slice(0, 3500)}`
      : `\n> ℹ️ النص الكامل للفيديو غير متاح — استنتج من العنوان والوصف والسياق`,
    ``,
    `## قدراتك في هذه الجلسة`,
    `- الإجابة على أسئلة حول أي جزء من الفيديو`,
    `- شرح لحظات محددة (مثال: "ماذا يقصد في الدقيقة 05:20؟")`,
    `- استخراج الأوامر البرمجية والأكواد المذكورة`,
    `- تحويل شرح الفيديو إلى خطوات تنفيذ عملية`,
    `- تصحيح أخطاء صاحب الفيديو وتقديم بدائل أحدث`,
    `- مقارنة التقنيات المذكورة مع أفضل الممارسات الحالية`,
    `- اكتشاف الأدوات والمواقع والتقنيات المذكورة`,
    ``,
    `## قواعد الإجابة`,
    `- أجب على سؤال المستخدم بدقة استناداً للمحتوى الفعلي المتوفر`,
    `- ميّز دائماً بين ما هو من الفيديو مباشرة وما هو استنتاج`,
    `- أجب بالعربية الجزائرية أو الفصحى المبسطة حسب أسلوب المستخدم`,
    `- كن مفيداً وملموساً — لا تكتفِ بالقول "لا أعرف"`,
    `- إذا طُلب استخراج أكواد، اعرضها في code blocks بلغتها الصحيحة`,
    `- إذا طُلبت خطوات تنفيذ، اعرضها كقائمة مرقمة واضحة`,
    `❌ لا تخترع معلومات غير موجودة في الفيديو`,
    `❌ لا تنسخ الفيديو حرفياً — ركّز على الفهم والاستخراج`,
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

  const quickSuggestions = await buildAISuggestions(
    { title, description: description || '', keywords: [] },
    aiGenerate,
  )

  return { reply, quickSuggestions }
}
