/**
 * Cloudflare Workers entry point — DZ AGENT
 * =========================================
 * Direct bridge: CF Workers Request → Express (Node.js) → CF Workers Response
 *
 * Why a custom bridge instead of @whatwg-node/server:
 *   @whatwg-node/server passes a WhatWG Request directly to Express as `req`.
 *   Express then tries `req.url = req.url.slice(1)` which throws
 *   "Cannot assign to read only property 'url'" on the native CF Request.
 *   This bridge creates a mutable Node-compatible request — avoiding the crash.
 */

import { Readable } from 'node:stream'

let expressApp = null

// Cloudflare Workers can cold-start before the Express news preloader has
// populated its in-memory cache. Keep a small, keyless RSS fallback here so a
// valid live-news request never degrades to "news unavailable" just because the
// Node compatibility bridge is still warming up.
const WORKER_NEWS_FEEDS = [
  {
    name: 'Google أخبار الجزائر',
    url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar',
  },
  { name: 'النهار', url: 'https://www.ennaharonline.com/feed/' },
  { name: 'الشروق أونلاين', url: 'https://www.echoroukonline.com/feed' },
  { name: 'البلاد', url: 'https://www.elbilad.net/feed' },
]

const WORKER_NEWS_QUERY_RE = /(?:أخبار|خبر|عاجل|اليوم|الآن|آخر|news|breaking|actualité|derni[eè]res)/i

const WORKER_DEVELOPER_RESPONSE = Object.freeze({
  content: `👨‍💻 **نذير حوامرية — Nadir Infograph** 🇩🇿

مطوّر ومهندس ذكاء اصطناعي جزائري متخصص، من **عنابة** 🇩🇿
منشئ ومطوّر **DZ Agent** و**DZ-GPT** — منصة الذكاء الاصطناعي الجزائرية الأولى.

### 🎯 المجالات
- Full-Stack AI Development
- Multi-Agent Systems & NLP
- تطوير تطبيقات الذكاء الاصطناعي الموجّهة للمحتوى الجزائري

### 📺 ظهورات تلفزيونية
- 🇩🇿 ضيف في **التلفزيون الوطني الجزائري** في حصة تقصي مع الدكتورة **عوماري فاطمة الزهراء**
  🎬 [شاهد الحلقة](https://youtu.be/-DPOFfvRS-Q?si=TOkP1VFTApMcktJ7)
- 🌍 ضيف في قناة **الجزائر الدولية AL24** حول الذكاء الاصطناعي
  🎬 [شاهد على يوتيوب](https://m.youtube.com/watch?v=gAzvBi4N7ic)

### 🌐 التواصل الاجتماعي
🔵 [فيسبوك](https://www.facebook.com/share/1AM1jDkz8o/) | 📸 [إنستغرام](https://www.instagram.com/nadir.infograph?igsh=ZmJsZGhheXB0emli) | 🎵 [تيكتوك](https://www.tiktok.com/@nadirinfograph2?_r=1&_t=ZS-96pplHnvWo4) | ▶️ [يوتيوب](https://www.youtube.com/@Nadirinfograph)

🌍 الموقع: [dzagent.app](https://dzagent.app/) | GitHub: [Nadirinfograph23](https://github.com/Nadirinfograph23)`,
  showDevCard: true,
  model: 'static-developer',
})

function normalizeWorkerQuery(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[؟?!.,،:;()[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const WORKER_DEVELOPER_PATTERNS = [
  'من هو مطورك', 'من مطورك', 'من صنعك', 'من برمجك', 'من انشاك', 'من طورك',
  'من هو المطور', 'من المطور', 'معلومات المطور', 'معلومات عن المطور',
  'معلومات على المطور', 'معلومات مطورك', 'اعطني معلومات المطور',
  'عطيني معلومات المطور', 'شكون خدمك', 'شكون لي خدمك', 'شكون اللي خدمك',
  'شكون دارك', 'شكون لي دارك', 'شكون اللي دارك', 'شكون بناك',
  'شكون لي بناك', 'شكون اللي بناك', 'شكون برمجك', 'شكون لي برمجك',
  'شكون اللي برمجك', 'شكون صاوبك', 'شكون اللي صاوبك', 'شكون خدم dz agent',
  'شكون دار dz agent', 'شكون صاوب dz agent',
  'who is your developer', 'who made you', 'who built you',
  'who created you', 'who programmed you', 'who designed you',
  'who owns this site', 'who is the owner', 'developer information',
  'qui est votre developpeur', 'qui vous a cree', 'qui vous a fait',
  'qui a developpe ce site', 'qui est le proprietaire', 'qui a fait ce site',
]

function isWorkerDeveloperQuestion(value) {
  const normalized = normalizeWorkerQuery(value)
  return WORKER_DEVELOPER_PATTERNS.some(pattern => normalized.includes(pattern))
}

function decodeXmlText(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim()
}

function parseWorkerRss(xml, source) {
  const items = []
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let match

  while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
    const block = match[1]
    const get = (tag) => {
      const found = block.match(new RegExp(
        `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
        'i',
      ))
      return found ? decodeXmlText(found[1]) : ''
    }
    const title = get('title')
    if (!title) continue
    const link = get('link') || (
      block.match(/<link[^>]+href=["']([^"']+)["']/i) || []
    )[1] || ''
    items.push({
      title,
      link,
      source,
      pubDate: get('pubDate') || get('dc:date') || get('updated') || '',
    })
  }

  return items
}



// ===== CHAT DIRECT (Worker-native, no server.js) =====
async function fetchChatDirect(request) {
  const requestUrl = new URL(request.url)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
  try {
    const payload = await request.json()
    const messages = Array.isArray(payload?.messages) ? payload.messages : []
    if (!messages.length) {
      return new Response(JSON.stringify({ error: 'messages required' }), {
        status: 400, headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
      })
    }

    const lastUser = [...messages].reverse().find(m => m?.role === 'user')?.content?.trim() || ''
    const lower = lastUser.toLowerCase()

    // Deterministic identity answer must run before all static guards and AI
    // fallbacks; otherwise the live Worker can answer with a generic sentence.
    if (isWorkerDeveloperQuestion(lastUser)) {
      return new Response(JSON.stringify(WORKER_DEVELOPER_RESPONSE), {
        headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    // Static guards
    if (/ما هي قدراتك|ما يمكنك|ماذا يمكنك/.test(lower)) {
      return new Response(JSON.stringify({ content: 'أنا DZ Agent — مساعد ذكي جزائري. أستطيع:\n- 💬 المحادثة والرد على الأسئلة\n- 🌤️ الطقس لجميع ولايات الجزائر\n- 🕌 مواقيت الصلاة\n- 📰 آخر الأخبار الجزائرية\n- 📺 تحميل فيديوهات يوتيوب\n- 📊 تحليل البيانات والرسوم\n- 🔍 البحث على الإنترنت\n- 📄 إنشاء وتعديل الملفات\n\nاطرح أي سؤال!', model: 'static-guard' }), {
        headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
      })
    }
    if (/من أنت/.test(lower)) {
      return new Response(JSON.stringify({ content: 'أنا DZ Agent، مساعد ذكي مصمم خصيصاً للمستخدمين الجزائريين. أعمل على توفير معلومات دقيقة وخدمات متنوعة.', model: 'static-guard' }), {
        headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    // Weather intent
    if (/طقس|حرارة|أمطار|جو.*اليوم|تساقط|رياح|weather/i.test(lower)) {
      const cityMatch = lastUser.match(/(?:في|عند|مدينة|ولاية)\s+([\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,})?)/)
      const city = cityMatch ? cityMatch[1].trim() : 'الجزائر'
      try {
        const weatherResult = await fetchWeatherDirect(new Request('https://dzagent.app/api/dz-agent/weather?city=' + encodeURIComponent(city)))
        const weatherData = await weatherResult.json()
        if (weatherData.status === 'ok') {
          const content = `## 🌤️ طقس ${weatherData.city}\n\n- **درجة الحرارة:** ${weatherData.temp}°C\n- **الشعور:** ${weatherData.feels_like}°C\n- **الحالة:** ${weatherData.condition}\n- **الرطوبة:** ${weatherData.humidity}%\n- **الرياح:** ${weatherData.wind} km/h\n\n> 📅 ${weatherData.fetchedAt ? new Date(weatherData.fetchedAt).toLocaleString('ar-DZ') : ''}`
          return new Response(JSON.stringify({ content, model: 'weather-api' }), {
            headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
          })
        }
      } catch (e) {
        console.warn('[Worker:Chat] Weather fetch failed:', e.message)
      }
    }

    // Prayer intent
    if (/صلاة|مواقيت|فجر|ظهر|عصر|مغرب|عشاء|أذان|prayer/i.test(lower)) {
      const cityMatch = lastUser.match(/(?:في|عند|مدينة|ولاية)\s+([\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,})?)/)
      const city = cityMatch ? cityMatch[1].trim() : 'الجزائر'
      try {
        const prayerResult = await fetchPrayerDirect(new Request('https://dzagent.app/api/dz-agent/prayer?city=' + encodeURIComponent(city)))
        const prayerData = await prayerResult.json()
        if (prayerData.status === 'ok') {
          const times = Object.entries(prayerData.times).map(([name, time]) => `- **${name}:** ${time}`).join('\n')
          const content = `## 🕌 مواقيت الصلاة في ${prayerData.city}\n\n${times}\n\n> 📅 ${prayerData.date} | 🌙 ${prayerData.hijri} ${prayerData.hijriMonth}`
          return new Response(JSON.stringify({ content, model: 'prayer-api' }), {
            headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
          })
        }
      } catch (e) {
        console.warn('[Worker:Chat] Prayer fetch failed:', e.message)
      }
    }

    // News intent
    if (/أخبار|خبر|مستجدات|عاجل|اليوم.*الجزائر|الجزائر.*اليوم|news/i.test(lower)) {
      try {
        const newsResult = await fetchNewsDirect(new Request('https://dzagent.app/api/dz-agent/news'))
        const newsData = await newsResult.json()
        if (newsData.items?.length) {
          const items = newsData.items.slice(0, 10).map(item => `- [${item.title}](${item.link}) — *${item.source}*`).join('\n')
          const content = `## 📰 آخر الأخبار الجزائرية\n\n${items}\n\n> ℹ️ المصدر: RSS مباشر`
          return new Response(JSON.stringify({ content, model: 'news-api' }), {
            headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
          })
        }
      } catch (e) {
        console.warn('[Worker:Chat] News fetch failed:', e.message)
      }
    }

    // ── AI PROVIDER FALLBACK CHAIN ──────────────────────────────────────
    // Try multiple free AI providers. Each one has a timeout and if it
    // fails we move to the next. The last resort is a keyword-based
    // Arabic helper so users never see a blank error.
    const systemPrompt = 'أنت DZ Agent — مساعد ذكي جزائري متعدد المهام. تحدث بالعربية الفصحى أو الجزائرية حسب سؤال المستخدم. أجب بشكل مفيد، دقيق، ومختصر.'
    const corsHeaders = {
      'content-type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    // 1) Pollinations text.pollinations.ai (verified working, free, no key)
    try {
      const polResp = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages
          ],
          seed: Math.floor(Math.random() * 999999),
          private: true,
        }),
        signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 30000); return ctrl.signal })()
      })
      if (polResp.ok) {
        const polData = await polResp.json()
        const reply = polData.choices?.[0]?.message?.content || polData.content || ''
        if (reply && reply.trim().length > 5) {
          return new Response(JSON.stringify({ content: reply.trim(), model: 'pollinations' }), { headers: corsHeaders })
        }
      } else {
        console.warn('[Worker:Chat] Pollinations status:', polResp.status)
      }
    } catch (e) {
      console.warn('[Worker:Chat] Pollinations failed:', e.message)
    }

    // 2) Pollinations gen endpoint (new API, key from env if available)
    try {
      const polKey = env.POLLINATIONS_API_KEY || env.POLLI_API_KEY || ''
      const polHeaders = { 'Content-Type': 'application/json' }
      if (polKey) polHeaders['Authorization'] = `Bearer ${polKey}`
      const polResp = await fetch('https://gen.pollinations.ai/openai/v1/chat/completions', {
        method: 'POST',
        headers: polHeaders,
        body: JSON.stringify({
          model: 'openai/gpt-4.1-nano',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          temperature: 0.7,
          max_tokens: 1024,
        }),
        signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 20000); return ctrl.signal })()
      })
      if (polResp.ok) {
        const polData = await polResp.json()
        const reply = polData.choices?.[0]?.message?.content || polData.content || ''
        if (reply && reply.trim().length > 5) {
          return new Response(JSON.stringify({ content: reply.trim(), model: 'pollinations-gen' }), { headers: corsHeaders })
        }
      }
    } catch (e) {
      console.warn('[Worker:Chat] Pollinations gen failed:', e.message)
    }

    // 3) Last resort: smart keyword-based Arabic helper
    const lastMsg = lastUser
    let smartReply = ''
    if (/مرحبا|السلام|أهلا|هاي|hey|hello/i.test(lastMsg)) {
      smartReply = 'مرحباً! 👋 أنا DZ Agent، مساعدك الذكي الجزائري. كيف يمكنني مساعدتك اليوم؟\n\nيمكنني:\n- 🌤️ إخبارك بالطقس في أي ولاية\n- 🕌 مواقيت الصلاة\n- 📰 آخر الأخبار\n- ❓ الإجابة على أسئلتك المتنوعة\n\nاطرح سؤالك!'
    } else if (/شكر|ممتاز|أحسنت|رائع/i.test(lastMsg)) {
      smartReply = 'العفو! 😊 سعيد بمساعدتك. هل تحتاج أي شيء آخر؟'
    } else if (/كم.*الساعة|الوقت|توق/i.test(lastMsg)) {
      smartReply = `الساعة الآن: ${new Date().toLocaleTimeString('ar-DZ', { timeZone: 'Africa/Algiers' })}\nالتاريخ: ${new Date().toLocaleDateString('ar-DZ', { timeZone: 'Africa/Algiers' })}`
    } else {
      smartReply = `شكراً على سؤالك! 🤔\n\nأنا DZ Agent — مساعد ذكي جزائري. حالياً خدمة الذكاء الاصطناعي غير متاحة مؤقتاً.\n\nيمكنني مساعدتك بـ:\n- 🌤️ **طقس** أي ولاية — اسأل مثل: "طقس الجزائر اليوم"\n- 🕌 **مواقيت الصلاة** — اسأل مثل: "مواقيت الصلاة في وهران"\n- 📰 **أخبار** — اسأل مثل: "آخر أخبار الجزائر"\n\nأو حاول مرة أخرى لاحقاً للحصول على رد ذكي.`
    }
    return new Response(JSON.stringify({ content: smartReply, model: 'smart-fallback' }), { headers: corsHeaders })
  } catch (err) {
    console.error('[Worker:Chat] Error:', err)
    return new Response(JSON.stringify({ error: 'Server error', message: err.message, stack: err.stack?.split("\\n").slice(0, 10).join("\\n") }), {
      status: 500, headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
}


// ===== NEWS DIRECT (Worker-native, no server.js) =====
const WORKER_NEWS_CACHE = { data: null, ts: 0 }
const WORKER_NEWS_TTL = 15 * 60 * 1000

const WORKER_NEWS_FEEDS_STANDALONE = [
  { name: 'Google أخبار الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: 'النهار', url: 'https://www.ennaharonline.com/feed/' },
  { name: 'الشروق أونلاين', url: 'https://www.echoroukonline.com/feed' },
  { name: 'البلاد', url: 'https://www.elbilad.net/feed' },
]

async function fetchNewsDirect(request) {
  const requestUrl = new URL(request.url)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
  const now = Date.now()
  if (WORKER_NEWS_CACHE.data && WORKER_NEWS_CACHE.ts > now - WORKER_NEWS_TTL) {
    return new Response(JSON.stringify(WORKER_NEWS_CACHE.data), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }

  try {
    const settled = await Promise.allSettled(
      WORKER_NEWS_FEEDS_STANDALONE.map(async (feed) => {
        const response = await fetch(feed.url, {
          headers: { 'Accept': 'application/rss+xml,application/xml,text/xml,*/*', 'User-Agent': 'DZ-Agent-Worker/1.0' },
          signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000); return ctrl.signal })()
        })
        if (!response.ok) return []
        const xml = await response.text()
        return parseWorkerRss(xml, feed.name)
      }),
    )

    const seen = new Set()
    const items = settled
      .flatMap(result => result.status === 'fulfilled' ? result.value : [])
      .filter(item => {
        const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => {
        const aTime = Date.parse(a.pubDate || '') || 0
        const bTime = Date.parse(b.pubDate || '') || 0
        return bTime - aTime
      })
      .slice(0, 20)

    const data = { items, generatedAt: new Date().toISOString() }
    WORKER_NEWS_CACHE.data = data
    WORKER_NEWS_CACHE.ts = now
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (err) {
    console.error('[Worker:News] Failed:', err.message)
    return new Response(JSON.stringify({ items: [], error: 'تعذّر جلب الأخبار', generatedAt: new Date().toISOString() }), {
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
}


// ===== NATIONAL TEAM NEWS DIRECT (Worker-native, no server.js) =====
const WORKER_NT_NEWS_CACHE = { items: [], ts: 0 }
const WORKER_NT_NEWS_TTL = 5 * 60 * 1000

const WORKER_NT_RSS_FEEDS = [
  { name: 'الهداف', url: 'https://www.elheddaf.com/feed' },
  { name: 'APS رياضة', url: 'https://www.aps.dz/ar/sport/feed' },
  { name: 'Sport DZ', url: 'https://www.sport-dz.com/feed/' },
  { name: 'Google الخضر', url: 'https://news.google.com/rss/search?q=%22%D8%A7%D9%84%D8%AE%D8%B6%D8%B1%22+%D9%83%D8%B1%D8%A9+%D9%82%D8%AF%D9%85&hl=ar&gl=DZ&ceid=DZ:ar&sort=date' },
  { name: 'Google محاربو الصحراء', url: 'https://news.google.com/rss/search?q=%22%D9%85%D8%AD%D8%A7%D8%B1%D8%A8%D9%88+%D8%A7%D9%84%D8%B5%D8%AD%D8%B1%D8%A7%D8%A1%22&hl=ar&gl=DZ&ceid=DZ:ar&sort=date' },
]



async function fetchNationalTeamNewsDirect(request) {
  const requestUrl = new URL(request.url)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
  const url = new URL(request.url)
  const bypassCache = requestUrl.searchParams.get('bypassCache') === '1'
  const now = Date.now()
  if (!bypassCache && WORKER_NT_NEWS_CACHE.ts && now - WORKER_NT_NEWS_CACHE.ts < WORKER_NT_NEWS_TTL) {
    return new Response(JSON.stringify({ items: WORKER_NT_NEWS_CACHE.items, fetchedAt: new Date().toISOString() }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }

  try {
    const settled = await Promise.allSettled(
      WORKER_NT_RSS_FEEDS.map(async (feed) => {
        const response = await fetch(feed.url, {
          headers: { 'Accept': 'application/rss+xml,application/xml,text/xml,*/*', 'User-Agent': 'DZ-Agent-Worker/1.0' },
          signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 10000); return ctrl.signal })()
        })
        if (!response.ok) return []
        const xml = await response.text()
        const parsed = parseWorkerRss(xml, feed.name)
        return parsed.map(item => ({ ...item, description: item.description || '' }))
      }),
    )

    const seen = new Set()
    const items = settled
      .flatMap(result => result.status === 'fulfilled' ? result.value : [])
      .filter(item => {
        const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim()
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => {
        const aTime = Date.parse(a.pubDate || '') || 0
        const bTime = Date.parse(b.pubDate || '') || 0
        return bTime - aTime
      })
      .slice(0, 20)

    WORKER_NT_NEWS_CACHE.items = items
    WORKER_NT_NEWS_CACHE.ts = now
    return new Response(JSON.stringify({ items, fetchedAt: new Date().toISOString() }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  } catch (err) {
    console.error('[Worker:NationalTeamNews] Failed:', err.message)
    return new Response(JSON.stringify({ items: [], error: 'تعذّر جلب الأخبار', fetchedAt: new Date().toISOString() }), {
      headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
}

// ===== WEATHER DIRECT (Worker-native, no server.js) =====
const WORKER_WEATHER_CACHE = { data: null, ts: 0 }
const WORKER_WEATHER_TTL = 10 * 60 * 1000 // 10 min

const WILAYA_COORDS = {
  'الجزائر': { lat: 36.7538, lon: 3.0588 },
  'وهران': { lat: 35.6969, lon: -0.6331 },
  'قسنطينة': { lat: 36.365, lon: 6.6147 },
  'عنابة': { lat: 36.9, lon: 7.7667 },
  'باتنة': { lat: 35.55, lon: 6.1667 },
  'بجاية': { lat: 36.75, lon: 5.0833 },
  'تلمسان': { lat: 34.8783, lon: -1.3167 },
  'تيزي وزو': { lat: 36.7167, lon: 4.05 },
  'سطيف': { lat: 36.1911, lon: 5.4136 },
  'سوق أهراس': { lat: 36.2833, lon: 7.95 },
}

const WILAYA_ALIASES = {
  'oran': 'وهران', 'constantine': 'قسنطينة', 'annaba': 'عنابة',
  'batna': 'باتنة', 'bejaia': 'بجاية', 'béjaïa': 'بجاية',
  'tlemcen': 'تلمسان', 'tizi ouzou': 'تيزي وزو', 'setif': 'سطيف',
  'skikda': 'سطيف', 'jijel': 'عنابة', 'algiers': 'الجزائر',
  'alger': 'الجزائر', 'adrar': 'الأغواط', 'biskra': 'بسكرة',
}

const AR_CONDITIONS = {
  0: 'سماء صافية', 1: 'صافية غالباً', 2: 'غيمة جزئية', 3: 'غائمة',
  45: 'ضباب', 48: 'ضباب مع صقيع',
  51: 'رذاذ خفيف', 53: 'رذاذ متوسط', 55: 'رذاذ كثيف',
  61: 'مطر خفيف', 63: 'مطر متوسط', 65: 'مطر غزير',
  71: 'ثلج خفيف', 73: 'ثلج متوسط', 75: 'ثلج غزير',
  80: 'زخات مطر خفيفة', 81: 'زخات مطر متوسطة', 82: 'زخات مطر غزيرة',
  95: 'عاصفة رعدية', 96: 'عاصفة رعدية مع برد', 99: 'عاصفة رعدية قوية',
}

function getWilayaCoords(city) {
  const lower = city.toLowerCase()
  const alias = WILAYA_ALIASES[lower] || WILAYA_ALIASES[lower.split(' ')[0]]
  if (alias && WILAYA_COORDS[alias]) return { ...WILAYA_COORDS[alias], label: alias }
  for (const [name, coords] of Object.entries(WILAYA_COORDS)) {
    if (lower.includes(name.toLowerCase()) || name.toLowerCase().includes(lower)) {
      return { ...coords, label: name }
    }
  }
  return { lat: 36.7538, lon: 3.0588, label: 'الجزائر العاصمة' }
}

async function fetchWeatherDirect(request) {
  const requestUrl = new URL(request.url)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
  const url = new URL(request.url)
  const city = String(requestUrl.searchParams.get('city') || 'Algiers').slice(0, 80)
  const lat = parseFloat(requestUrl.searchParams.get('lat'))
  const lon = parseFloat(requestUrl.searchParams.get('lon'))

  // Check cache first
  const cacheKey = (!isNaN(lat) && !isNaN(lon)) ? `${lat},${lon}` : city
  const now = Date.now()
  if (WORKER_WEATHER_CACHE.data && WORKER_WEATHER_CACHE.ts > now - WORKER_WEATHER_TTL && WORKER_WEATHER_CACHE.key === cacheKey) {
    const data = { ...WORKER_WEATHER_CACHE.data, city: coords.label || city }
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }

  let coords
  if (!isNaN(lat) && !isNaN(lon)) {
    coords = { lat, lon, label: 'موقعك الحالي' }
  } else {
    coords = getWilayaCoords(city)
  }

  try {
    // Primary: open-meteo (free, no key)
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto&forecast_days=1`
    const omResp = await fetch(omUrl, { headers: { 'User-Agent': 'DZ-Agent-Worker/1.0' }, signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000); return ctrl.signal })() })
    if (!omResp.ok) throw new Error(`open-meteo ${omResp.status}`)
    const omData = await omResp.json()
    const current = omData.current || {}
    const temp = current.temperature_2m ?? null
    const conditionCode = current.weather_code ?? null
    const condition = conditionCode !== null ? (AR_CONDITIONS[conditionCode] || `حالة ${conditionCode}`) : null
    const data = {
      city: coords.label || city,
      temp, feels_like: temp, temp_min: temp, temp_max: temp,
      condition, icon: conditionCode, humidity: current.relative_humidity_2m ?? null,
      wind: current.wind_speed_10m ?? null, visibility: null,
      source: 'open-meteo.com', fetchedAt: new Date().toISOString(), status: 'ok'
    }
    WORKER_WEATHER_CACHE.data = data
    WORKER_WEATHER_CACHE.ts = now
    WORKER_WEATHER_CACHE.key = cacheKey
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (err) {
    console.error('[Worker:Weather] Failed:', err.message)
    return new Response(JSON.stringify({
      city: coords.label || city, temp: null, feels_like: null, temp_min: null, temp_max: null,
      condition: null, icon: null, humidity: null, wind: null, visibility: null,
      error: 'تعذّر جلب الطقس حالياً', status: 'unavailable',
      fetchedAt: new Date().toISOString()
    }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }
}


// ===== PRAYER DIRECT (Worker-native, no server.js) =====
const WORKER_PRAYER_CACHE = { data: null, ts: 0 }
const WORKER_PRAYER_TTL = 60 * 60 * 1000 // 1 hour

const DZ_WILAYAS = [
  'الجزائر','وهران','قسنطينة','عنابة','باتنة','بجاية','تلمسان','تيزي وزو',
  'سطيف','سوق أهراس','البليدة','بومرداس','المسيلة','ميلة','أم البواقي','خنشلة',
  'الأغواط','البيض','ورقلة','غرداية','ت撒ات','إليزي','برج بوعريريج','بسكرة',
  'الوادي','تندوف','الجلفة','الأرزاوي','تيبازة','الشلف','تيارت','سيدي بلعباس',
  'معسكر','غليزان','تيسمسيلت',' Médéa','Blida','Boumerdès','Tipaza','Chlef',
]

async function fetchPrayerDirect(request) {
  const requestUrl = new URL(request.url)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
  const url = new URL(request.url)
  const city = String(requestUrl.searchParams.get('city') || 'Algiers').slice(0, 80)
  const lat = parseFloat(requestUrl.searchParams.get('lat'))
  const lon = parseFloat(requestUrl.searchParams.get('lon'))

  // Check cache first
  const cacheKey = (!isNaN(lat) && !isNaN(lon)) ? `${lat},${lon}` : city
  const now = Date.now()
  if (WORKER_PRAYER_CACHE.data && WORKER_PRAYER_CACHE.ts > now - WORKER_PRAYER_TTL && WORKER_PRAYER_CACHE.key === cacheKey) {
    const data = { ...WORKER_PRAYER_CACHE.data, city: coords.label || city }
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }

  let coords
  if (!isNaN(lat) && !isNaN(lon)) {
    coords = { lat, lon, label: 'موقعك الحالي' }
  } else {
    coords = getWilayaCoords(city)
  }

  try {
    // Use aladhan API (free, no key)
    const method = 2 // Islamic Society of North America
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const aladhanUrl = `https://api.aladhan.com/v1/timings/${date}?latitude=${coords.lat}&longitude=${coords.lon}&method=${method}&iso8601=true`
    const resp = await fetch(aladhanUrl, { headers: { 'User-Agent': 'DZ-Agent-Worker/1.0' }, signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 8000); return ctrl.signal })() })
    if (!resp.ok) throw new Error(`aladhan ${resp.status}`)
    const json = await resp.json()
    const timings = json.data?.timings || {}
    const hijri = json.data?.date?.hijri || {}
    const data = {
      city: coords.label || city,
      country: 'Algeria',
      source: 'aladhan.com',
      date: new Date().toLocaleDateString('ar-DZ'),
      hijri: hijri.date || '',
      hijriMonth: hijri.month?.ar || '',
      times: {
        'الفجر': timings['Fajr'] || '--',
        'الشروق': timings['Sunrise'] || '--',
        'الظهر': timings['Dhuhr'] || '--',
        'العصر': timings['Asr'] || '--',
        'المغرب': timings['Maghrib'] || '--',
        'العشاء': timings['Isha'] || '--',
      },
      status: 'ok'
    }
    WORKER_PRAYER_CACHE.data = data
    WORKER_PRAYER_CACHE.ts = now
    WORKER_PRAYER_CACHE.key = cacheKey
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  } catch (err) {
    console.error('[Worker:Prayer] Failed:', err.message)
    return new Response(JSON.stringify({
      city: coords.label || city, country: 'Algeria', source: 'unavailable',
      date: new Date().toLocaleDateString('ar-DZ'),
      times: { 'الفجر': '--', 'الشروق': '--', 'الظهر': '--', 'العصر': '--', 'المغرب': '--', 'العشاء': '--' },
      error: 'تعذّر جلب مواقيت الصلاة حالياً', status: 'unavailable'
    }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    })
  }
}

async function fetchWorkerNewsFallback(request) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return null
  }

  const messages = Array.isArray(payload?.messages) ? payload.messages : []
  const lastUserMessage = [...messages]
    .reverse()
    .find(message => message?.role === 'user' && typeof message.content === 'string')
    ?.content
    ?.trim() || ''

  const isAlgeriaNewsQuery = /الجزائر|الجزاير|algeria|alg[eé]rie/i.test(lastUserMessage)
  if (!isAlgeriaNewsQuery || !WORKER_NEWS_QUERY_RE.test(lastUserMessage)) return null

  const settled = await Promise.allSettled(
    WORKER_NEWS_FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: {
          Accept: 'application/rss+xml,application/xml,text/xml,*/*',
          'User-Agent': 'DZ-Agent-Worker/1.0 (+https://dzagent.app)',
        },
        signal: (() => { const ctrl = new AbortController(); const tid = setTimeout(() => ctrl.abort(), 6500); return ctrl.signal })(),
      })
      if (!response.ok) return []
      return parseWorkerRss(await response.text(), feed.name)
    }),
  )

  const seen = new Set()
  const items = settled
    .flatMap(result => result.status === 'fulfilled' ? result.value : [])
    .filter(item => {
      const key = item.title.toLowerCase().replace(/\s+/g, ' ').trim()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.pubDate || '') || 0
      const bTime = Date.parse(b.pubDate || '') || 0
      return bTime - aTime
    })
    .slice(0, 20)

  if (!items.length) return null

  const date = new Date().toLocaleDateString('ar-DZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const content = [
    `## 📰 آخر أخبار الجزائر — ${date}`,
    '',
    ...items.map(item => {
      const link = item.link ? ` [عرض الخبر](${item.link})` : ''
      return `- **${item.title}** — *${item.source}*${link}`
    }),
    '',
    '---',
    '> ℹ️ تم جلب العناوين مباشرة من RSS عبر Cloudflare Worker.',
  ].join('\n')

  return new Response(JSON.stringify({
    content,
    status: 'rss_worker_direct',
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * Copy CF Workers secrets/vars into process.env so server.js finds its keys.
 */
function injectEnv(env) {
  for (const [key, val] of Object.entries(env)) {
    if (typeof val === 'string' && !process.env[key]) {
      process.env[key] = val
    }
  }
  process.env.CF_PAGES  = '1'
  process.env.NODE_ENV  = 'production'
}

async function getApp(env) {
  if (expressApp) return expressApp
  injectEnv(env)
  const { app } = await import('../server.js')
  expressApp = app
  return expressApp
}

/**
 * Bridge a CF Workers Request into Express and collect the response.
 */
async function handleWithExpress(app, cfRequest) {
  const url = new URL(cfRequest.url)

  // Buffer request body
  let bodyBuf = null
  if (cfRequest.method !== 'GET' && cfRequest.method !== 'HEAD') {
    try { bodyBuf = Buffer.from(await cfRequest.arrayBuffer()) } catch {}
  }

  // Flatten headers into plain object
  const reqHeaders = {}
  cfRequest.headers.forEach((v, k) => { reqHeaders[k.toLowerCase()] = v })
  // Disable compression: CF Workers handles its own gzip/brotli.
  // Without this, Node's `compression` middleware would pipe through a
  // zlib Transform stream that our fake res can't handle correctly.
  reqHeaders['accept-encoding'] = 'identity'

  // Read JSON once at the Worker boundary. Express's body-parser expects a
  // native IncomingMessage and can otherwise wait indefinitely on a bridged
  // stream in the Workers runtime. Passing the parsed object and a zero body
  // length makes body-parser take its normal "no body left to read" path.
  let parsedBody
  const contentType = reqHeaders['content-type'] || ''
  if (bodyBuf?.length && /\bapplication\/json\b/i.test(contentType)) {
    try {
      parsedBody = JSON.parse(bodyBuf.toString('utf8'))
      reqHeaders['content-length'] = '0'
      delete reqHeaders['transfer-encoding']
    } catch {
      // Leave malformed JSON to Express so it returns its usual 400 response.
    }
  }

  // ── IncomingMessage-compatible request ───────────────────────────────────
  // body-parser relies on the request being a real Node readable stream. A
  // plain object with hand-written `on()`/`read()` methods can leave raw-body
  // waiting forever in Workers, which results in a 1101/hung request.
  const req = Readable.from(bodyBuf ? [bodyBuf] : [])
  Object.assign(req, {
    method:            cfRequest.method,
    url:               url.pathname + url.search,  // WRITABLE — no crash
    path:              url.pathname,
    headers:           reqHeaders,
    httpVersion:       '1.1',
    httpVersionMajor:  1,
    httpVersionMinor:  1,
    complete:          true,
    readable:          true,
    socket:    { remoteAddress: '127.0.0.1', encrypted: url.protocol === 'https:', destroy() {} },
    connection:{ remoteAddress: '127.0.0.1', encrypted: url.protocol === 'https:' },
    _body:     bodyBuf,
    body:              parsedBody,
  })

  // ── Fake ServerResponse (res) ─────────────────────────────────────────────
  return new Promise((resolve) => {
    const resHdrs = {}
    const chunks  = []
    let   sc      = 200
    let   settled = false

    function finish() {
      if (settled) return
      settled = true
      const body = chunks.length ? Buffer.concat(chunks) : null
      const cfHdrs = new Headers()
      for (const [k, v] of Object.entries(resHdrs)) {
        if (Array.isArray(v)) v.forEach(val => cfHdrs.append(k, String(val)))
        else cfHdrs.set(k, String(v))
      }
      resolve(new Response(body, { status: res.statusCode || sc, headers: cfHdrs }))
    }

    const res = {
      statusCode:          200,
      statusMessage:       'OK',
      writableEnded:       false,
      finished:            false,
      headersSent:         false,
      locals:              {},

      status(code)            { this.statusCode = code; return this },
      writeHead(code, mOrH, h){ this.statusCode = code; if (typeof mOrH==='object') Object.assign(resHdrs,mOrH); if(h) Object.assign(resHdrs,h); return this },
      setHeader(k,v)          { resHdrs[k.toLowerCase()] = v; return this },
      removeHeader(k)         { delete resHdrs[k.toLowerCase()] },
      getHeader(k)            { return resHdrs[k.toLowerCase()] },
      getHeaders()            { return { ...resHdrs } },
      hasHeader(k)            { return k.toLowerCase() in resHdrs },
      flushHeaders()          {},

      write(chunk, enc, cb) {
        if (chunk) {
          chunks.push(typeof chunk === 'string'
            ? Buffer.from(chunk, typeof enc === 'string' ? enc : 'utf8')
            : Buffer.from(chunk))
        }
        if (typeof enc === 'function') enc()
        if (typeof cb  === 'function') cb()
        return true
      },

      end(data, enc, cb) {
        if (data && data !== '') {
          if (typeof data === 'string')
            chunks.push(Buffer.from(data, typeof enc === 'string' ? enc : 'utf8'))
          else if (data)
            chunks.push(Buffer.from(data))
        }
        if (typeof data === 'function') data()
        if (typeof enc  === 'function') enc()
        if (typeof cb   === 'function') cb()
        this.writableEnded = this.finished = this.headersSent = true
        finish()
        return this
      },

      json(data)       { this.setHeader('content-type','application/json; charset=utf-8'); this.end(JSON.stringify(data)) },
      send(data)       { this.end(data ?? '') },
      sendStatus(code) { this.statusCode = code; this.end('') },
      type(t)          { this.setHeader('content-type', t.includes('/') ? t : `text/${t}`); return this },

      redirect(urlOrCode, maybeUrl) {
        const [code, loc] = typeof urlOrCode === 'number' ? [urlOrCode, maybeUrl] : [302, urlOrCode]
        this.statusCode = code
        this.setHeader('location', loc)
        this.end('')
      },

      // EventEmitter stubs (Express uses these)
      on()            { return this },
      once()          { return this },
      emit()          {},
      removeListener(){ return this },
      destroy()       {},
      writable:             true,
      writableHighWaterMark: 16384,
      writableLength:        0,
    }

    try {
      app(req, res, (err) => {
        if (err) {
          res.statusCode = 500
          resHdrs['content-type'] = 'application/json'
          chunks.length = 0
          chunks.push(Buffer.from(JSON.stringify({ error: 'Handler error', message: err?.message })))
        }
        finish()
      })
    } catch (err) {
      resolve(new Response(
        JSON.stringify({ error: 'Server error', message: err?.message, stack: err?.stack?.split("\\n").slice(0, 10).join("\\n") }),
        { status: 500, headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      } }
      ))
    }
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const isApiOrWebSocketPath =
      url.pathname === '/api' ||
      url.pathname.startsWith('/api/') ||
      url.pathname === '/ws' ||
      url.pathname.startsWith('/ws/')

    // ── Static assets → ASSETS binding (dist/) ────────────────────────────
    if (!isApiOrWebSocketPath) {
      if (env.ASSETS) {
        const asset = await env.ASSETS.fetch(request)
        // Keep the public brand correct even if an edge has a stale HTML
        // asset from before the rename. This only touches user-facing shell
        // metadata; routes, script URLs, and all application behavior remain
        // unchanged.
        if (
          asset.ok &&
          (url.pathname === '/' ||
            url.pathname === '/index.html' ||
            url.pathname === '/manifest.webmanifest')
        ) {
          const headers = new Headers(asset.headers)
          const body = (await asset.text()).replaceAll('DZ GPT', 'DZ AGENT')
          return new Response(body, { status: asset.status, headers })
        }

        // BrowserRouter needs the application shell for direct navigations and
        // refreshes such as /dz-agent. Only fall back for document-like
        // requests or extensionless paths: a missing .js/.css/image must stay
        // a real 404, and /api/* and /ws/* never enter this branch.
        const lastPathSegment = url.pathname.split('/').pop() || ''
        const acceptsHtml = (request.headers.get('accept') || '')
          .toLowerCase()
          .includes('text/html')
        const isDocumentRequest = request.method === 'GET' || request.method === 'HEAD'
        const isExtensionlessPath = !lastPathSegment.includes('.')

        if (isDocumentRequest && (acceptsHtml || isExtensionlessPath)) {
          const indexRequest = new Request(new URL('/index.html', request.url), {
            method: request.method,
            headers: request.headers,
          })
          const spaShell = await env.ASSETS.fetch(indexRequest)
          if (spaShell.ok) return spaShell
        }

        return asset
      }
      return new Response('Not Found', { status: 404 })
    }

    // ── API routes → Express ───────────────────────────────────────────────
    try {
      // Direct Worker-native routes (no server.js needed)
      if (url.pathname === '/api/dz-agent/weather' && request.method === 'GET') {
        return fetchWeatherDirect(request)
      }
      if (url.pathname === '/api/dz-agent/prayer' && request.method === 'GET') {
        return fetchPrayerDirect(request)
      }
      if (url.pathname === '/api/dz-agent-chat' && request.method === 'POST') {
        return fetchChatDirect(request)
      }
      if (url.pathname === '/api/dz-agent/news' && request.method === 'GET') {
        return fetchNewsDirect(request)
      }
      if (url.pathname === '/api/national-team/news' && request.method === 'GET') {
        return fetchNationalTeamNewsDirect(request)
      }

      // Preserve the body for a Worker-native fallback. The Express bridge
      // consumes the original stream before we can inspect its response.
      const newsRequest = (
        request.method === 'POST' &&
        url.pathname === '/api/dz-agent-chat'
      ) ? request.clone() : null
      // Serve the Algeria-news card before loading the Node compatibility
      // bridge. This makes the keyless news path independent of Express,
      // whose optional stream modules can fail during a Worker cold start.
      if (newsRequest) {
        const directNews = await fetchWorkerNewsFallback(newsRequest)
        if (directNews) return directNews
      }



      const app = await getApp(env)
      const response = await handleWithExpress(app, request)
      return response
    } catch (err) {
      console.error('[Worker] Fatal:', err?.message, '\n', err?.stack?.split('\n').slice(0,3).join('\n'))
      return new Response(
        JSON.stringify({ error: 'Server error', message: err?.message, stack: err?.stack?.split("\\n").slice(0, 10).join("\\n") }),
        { status: 500, headers: {
        'content-type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      } }
      )
    }
  },
}
