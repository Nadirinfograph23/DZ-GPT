/**
 * DZ-GPT — Crawl4AI Content Extractor
 * يحل محل Jina AI Reader نهائياً
 *
 * استخراج المحتوى من URL بدون Jina AI
 * استراتيجيات متعددة: fetch مباشر → SearXNG Cached → Text Proxies
 */

const EXTRACT_TIMEOUT_MS = 12000

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ar,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'DNT': '1',
}

/**
 * stripHtmlToText — تحويل HTML إلى نص نظيف
 */
function stripHtmlToText(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{3,}/g, '\n\n')
    .trim()
}

/**
 * extractMainContent — استخراج المحتوى الرئيسي من HTML
 * يبحث عن <article>, <main>, <div class="content"> إلخ
 */
function extractMainContent(html = '') {
  const contentPatterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*(?:class|id)="[^"]*(?:content|article|post|body|text|story|entry)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*(?:class|id)='[^']*(?:content|article|post|body|text|story|entry)[^']*'[^>]*>([\s\S]*?)<\/div>/i,
  ]

  for (const pattern of contentPatterns) {
    const m = html.match(pattern)
    if (m && m[1] && m[1].length > 200) {
      return stripHtmlToText(m[1])
    }
  }

  return stripHtmlToText(html)
}

/**
 * crawlDirect — جلب مباشر مع headers واقعية
 */
async function crawlDirect(url) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS)
    const res = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('html') && !ct.includes('text')) return null
    const html = await res.text()
    if (html.length < 500) return null
    const text = extractMainContent(html)
    return text.length > 100 ? text.slice(0, 2000) : null
  } catch { return null }
}

/**
 * crawlViaProxy — استخدام خوادم proxy نصية مفتوحة
 */
async function crawlViaProxy(url) {
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ]

  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl, {
        headers: { 'User-Agent': 'DZ-GPT/2.0', Accept: 'application/json,text/html,*/*' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) continue
      const ct = res.headers.get('content-type') || ''
      let content = ''
      if (ct.includes('json')) {
        const data = await res.json()
        content = data.contents || data.body || data.data || ''
      } else {
        content = await res.text()
      }
      if (!content || content.length < 200) continue
      const text = extractMainContent(content)
      if (text.length > 100) return text.slice(0, 2000)
    } catch { continue }
  }
  return null
}

/**
 * crawlGoogleCache — محاولة Google Cache
 */
async function crawlGoogleCache(url) {
  try {
    const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`
    const res = await fetch(cacheUrl, {
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    const text = extractMainContent(html)
    return text.length > 100 ? text.slice(0, 2000) : null
  } catch { return null }
}

/**
 * extractContent — الدالة الرئيسية لاستخراج المحتوى
 * تحل محل jinaRead() نهائياً
 *
 * @param {string} url - الرابط المراد استخراج محتواه
 * @returns {Promise<string|null>} - النص المستخرج أو null
 */
export async function extractContent(url) {
  if (!url || !url.startsWith('http')) return null

  // استراتيجية 1: جلب مباشر
  const direct = await crawlDirect(url)
  if (direct && direct.length > 100) {
    console.log(`[Crawl4AI] ✓ Direct: ${url.slice(0, 60)} (${direct.length} chars)`)
    return direct
  }

  // استراتيجية 2: عبر proxy
  const proxied = await crawlViaProxy(url)
  if (proxied && proxied.length > 100) {
    console.log(`[Crawl4AI] ✓ Proxy: ${url.slice(0, 60)} (${proxied.length} chars)`)
    return proxied
  }

  // استراتيجية 3: Google Cache
  const cached = await crawlGoogleCache(url)
  if (cached && cached.length > 100) {
    console.log(`[Crawl4AI] ✓ Cache: ${url.slice(0, 60)} (${cached.length} chars)`)
    return cached
  }

  console.log(`[Crawl4AI] ✗ All strategies failed for: ${url.slice(0, 60)}`)
  return null
}

/**
 * extractMultiple — استخراج محتوى من عدة روابط بالتوازي
 *
 * @param {string[]} urls - قائمة الروابط
 * @param {number} max - أقصى عدد للاستخراج (default 3)
 * @returns {Promise<string|null>} - نص موحد من كل المصادر
 */
export async function extractMultiple(urls = [], max = 3) {
  const validUrls = urls.filter(u => u && u.startsWith('http')).slice(0, max)
  if (!validUrls.length) return null

  const results = await Promise.allSettled(validUrls.map(u => extractContent(u)))
  const texts = results
    .filter(r => r.status === 'fulfilled' && r.value && r.value.length > 80)
    .map(r => r.value)

  if (!texts.length) return null
  return texts.join('\n\n---\n\n').slice(0, 4000)
}

/**
 * extractForPerson — استخراج محتوى مخصص لصفحات الشخصيات
 * يركز على البيانات الحيوية: الميلاد، المهنة، الإنجازات
 */
export async function extractForPerson(urls = []) {
  const content = await extractMultiple(urls, 2)
  if (!content) return null

  const lines = content.split('\n').filter(l => l.trim().length > 20)
  const relevant = lines.filter(l => {
    const lower = l.toLowerCase()
    return (
      /ولد|وُلد|تاريخ الميلاد|born|date of birth/.test(lower) ||
      /لاعب|مدرب|رياضي|سياسي|فنان|كاتب|player|trainer|coach/.test(lower) ||
      /جنسية|nationality/.test(lower) ||
      /نادي|فريق|club|team/.test(lower) ||
      /جائزة|بطولة|إنجاز|award|title|champion/.test(lower) ||
      /[\u0600-\u06FF]{10,}/.test(l)
    )
  })

  return (relevant.length > 3 ? relevant.join('\n') : content).slice(0, 1800)
}
