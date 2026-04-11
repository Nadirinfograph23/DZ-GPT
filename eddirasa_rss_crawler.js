import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as cheerio from 'cheerio'
import { XMLParser } from 'fast-xml-parser'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INDEX_PATH = path.resolve(__dirname, 'data', 'eddirasa_index.json')
const BASE_URL = 'https://eddirasa.com/'
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 DZ-GPT-Eddirasa-RSS-Crawler/1.0'
const DAY_MS = 24 * 60 * 60 * 1000

const BASE_FEEDS = [
  'https://eddirasa.com/feed/',
  'https://eddirasa.com/?feed=rss2',
]

const DEFAULT_INDEX = {
  level: '',
  year: '',
  subject: '',
  lessons: [],
  source: 'eddirasa',
  updated_at: '',
}

function cleanText(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function asArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function normalizeUrl(url = '', base = BASE_URL) {
  try {
    return new URL(String(url).trim(), base).toString().split('#')[0]
  } catch {
    return ''
  }
}

function isEddirasaUrl(url = '') {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return hostname === 'eddirasa.com' || hostname.endsWith('.eddirasa.com')
  } catch {
    return false
  }
}

function isPdfCandidate(text = '', url = '') {
  const value = `${text} ${url}`.toLowerCase()
  return /\.pdf($|[?#])/i.test(url) || value.includes('pdf') || value.includes('تحميل') || value.includes('download')
}

function uniqueBy(items, keyFn) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const key = keyFn(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function mergeSetCookie(cookieHeader = '', jar = new Map()) {
  if (!cookieHeader) return jar
  for (const part of cookieHeader.split(/,(?=\s*[^;,\s]+=)/)) {
    const first = part.split(';')[0]
    const index = first.indexOf('=')
    if (index > 0) jar.set(first.slice(0, index).trim(), first.slice(index + 1).trim())
  }
  return jar
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ')
}

async function fetchText(url, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8') {
  let currentUrl = url
  const jar = new Map()
  for (let redirectCount = 0; redirectCount < 8; redirectCount++) {
    const parsed = new URL(currentUrl)
    if (parsed.searchParams.has('__r')) jar.set('__r', parsed.searchParams.get('__r'))
    const headers = {
      'User-Agent': USER_AGENT,
      Accept: accept,
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    }
    if (jar.size) headers.Cookie = cookieHeader(jar)
    const response = await fetch(currentUrl, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    })
    mergeSetCookie(response.headers.get('set-cookie') || '', jar)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error(`HTTP ${response.status}`)
      currentUrl = normalizeUrl(location, currentUrl)
      continue
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  }
  throw new Error('redirect count exceeded')
}

async function discoverCategoryFeeds() {
  try {
    const html = await fetchText(BASE_URL)
    const $ = cheerio.load(html)
    const feeds = []
    $('a[href]').each((_, el) => {
      const href = normalizeUrl($(el).attr('href'))
      if (!href || !isEddirasaUrl(href)) return
      if (!/\/category\//i.test(href)) return
      const feedUrl = href.replace(/\/?$/, '/') + 'feed/'
      feeds.push(feedUrl)
    })
    return uniqueBy(feeds, v => v).slice(0, 30)
  } catch (error) {
    console.warn('[eddirasa_rss_crawler] category discovery failed:', error.message)
    return []
  }
}

export async function getRssFeedUrls() {
  const categoryFeeds = await discoverCategoryFeeds()
  return uniqueBy([...BASE_FEEDS, ...categoryFeeds], v => v)
}

function readXmlField(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') return value['#text'] || value['@_href'] || value.href || ''
  return ''
}

function readLink(item) {
  if (typeof item.link === 'string') return item.link
  if (Array.isArray(item.link)) {
    const alternate = item.link.find(link => link?.['@_rel'] === 'alternate') || item.link[0]
    return readXmlField(alternate)
  }
  return readXmlField(item.link || item.guid || item.id)
}

export function parseRssItems(xml, sourceUrl = '') {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: false,
    trimValues: true,
  })
  const parsed = parser.parse(xml)
  const channelItems = asArray(parsed?.rss?.channel?.item)
  const atomEntries = asArray(parsed?.feed?.entry)
  const items = channelItems.length ? channelItems : atomEntries
  return items.map(item => {
    const category = asArray(item.category)
      .map(cat => cleanText(readXmlField(cat)))
      .filter(Boolean)
      .join(', ')
    const title = cleanText(readXmlField(item.title))
    const link = normalizeUrl(readLink(item))
    const description = cleanText(readXmlField(item.description || item.summary || item['content:encoded'] || item.content))
    const publishDate = cleanText(readXmlField(item.pubDate || item.published || item.updated || item['dc:date']))
    return {
      title,
      link,
      description,
      publish_date: publishDate,
      category,
      source_feed: sourceUrl,
    }
  }).filter(item => item.title && item.link && isEddirasaUrl(item.link))
}

export async function fetchRssItems() {
  const feeds = await getRssFeedUrls()
  const allItems = []
  for (const feed of feeds) {
    try {
      const xml = await fetchText(feed, 'application/rss+xml,application/xml,text/xml,*/*')
      const parsed = parseRssItems(xml, feed)
      allItems.push(...parsed)
    } catch (error) {
      console.warn(`[eddirasa_rss_crawler] RSS failed for ${feed}:`, error.message)
    }
  }
  return uniqueBy(allItems, item => item.link)
}

function matchAny(text, patterns) {
  return patterns.some(pattern => pattern.test(text))
}

export function classifyEddirasaItem(item = {}) {
  const text = cleanText(`${item.title || ''} ${item.description || ''} ${item.category || ''} ${item.link || item.url || ''}`).toLowerCase()
  let level = ''
  let year = ''

  const yearRules = [
    { level: 'Primary', year: '1', patterns: [/الأولى ابتدائي|اولى ابتدائي|سنة أولى ابتدائي|1 ابتدائي|primary 1|1ap/i] },
    { level: 'Primary', year: '2', patterns: [/الثانية ابتدائي|ثانية ابتدائي|سنة ثانية ابتدائي|2 ابتدائي|primary 2|2ap/i] },
    { level: 'Primary', year: '3', patterns: [/الثالثة ابتدائي|ثالثة ابتدائي|سنة ثالثة ابتدائي|3 ابتدائي|primary 3|3ap/i] },
    { level: 'Primary', year: '4', patterns: [/الرابعة ابتدائي|رابعة ابتدائي|سنة رابعة ابتدائي|4 ابتدائي|primary 4|4ap/i] },
    { level: 'Primary', year: '5', patterns: [/الخامسة ابتدائي|خامسة ابتدائي|سنة خامسة ابتدائي|5 ابتدائي|primary 5|5ap/i] },
    { level: 'Middle', year: '1', patterns: [/الأولى متوسط|اولى متوسط|سنة أولى متوسط|1 متوسط|middle 1|1am/i] },
    { level: 'Middle', year: '2', patterns: [/الثانية متوسط|ثانية متوسط|سنة ثانية متوسط|2 متوسط|middle 2|2am/i] },
    { level: 'Middle', year: '3', patterns: [/الثالثة متوسط|ثالثة متوسط|سنة ثالثة متوسط|3 متوسط|middle 3|3am/i] },
    { level: 'Middle', year: '4', patterns: [/الرابعة متوسط|رابعة متوسط|سنة رابعة متوسط|4 متوسط|bem|بيام|middle 4|4am/i] },
    { level: 'Secondary', year: '1', patterns: [/الأولى ثانوي|اولى ثانوي|سنة أولى ثانوي|1 ثانوي|secondary 1|1as/i] },
    { level: 'Secondary', year: '2', patterns: [/الثانية ثانوي|ثانية ثانوي|سنة ثانية ثانوي|2 ثانوي|secondary 2|2as/i] },
    { level: 'Secondary', year: '3', patterns: [/الثالثة ثانوي|ثالثة ثانوي|سنة ثالثة ثانوي|3 ثانوي|bac|بكالوريا|secondary 3|3as/i] },
  ]
  const matchedYear = yearRules.find(rule => matchAny(text, rule.patterns))
  if (matchedYear) {
    level = matchedYear.level
    year = matchedYear.year
  } else if (/ابتدائي|primary/i.test(text)) {
    level = 'Primary'
  } else if (/متوسط|middle|bem|بيام/i.test(text)) {
    level = 'Middle'
  } else if (/ثانوي|secondary|bac|baccalaureate|بكالوريا/i.test(text)) {
    level = 'Secondary'
  }

  const subjectRules = [
    { subject: 'Math', patterns: [/رياضيات|جبر|هندسة|دوال|معادلات|math|mathematique|mathématique/i] },
    { subject: 'Physics', patterns: [/فيزياء|فيزيائية|كهرباء|ميكانيك|physique|physics/i] },
    { subject: 'Arabic', patterns: [/لغة عربية|العربية|نحو|صرف|إعراب|بلاغة|arabic|arabe/i] },
    { subject: 'French', patterns: [/فرنسية|فرنسي|français|francais|french/i] },
    { subject: 'English', patterns: [/إنجليزية|انجليزية|انجليزي|english|anglais/i] },
    { subject: 'Science', patterns: [/علوم طبيعية|علوم الطبيعة|علوم|طبيعة|حياة|science|svt|biology/i] },
    { subject: 'History', patterns: [/تاريخ|history|histoire/i] },
    { subject: 'Geography', patterns: [/جغرافيا|geography|géographie|geographie/i] },
  ]
  const subject = subjectRules.find(rule => matchAny(text, rule.patterns))?.subject || ''

  let type = 'lesson'
  if (/pdf|\.pdf|تحميل|download/i.test(text)) type = 'pdf'
  else if (/تمرين|تمارين|exercise|exercice|تطبيق/i.test(text)) type = 'exercise'
  else if (/فرض|اختبار|امتحان|بكالوريا|bem|exam|test|devoir|composition/i.test(text)) type = 'exam'
  else if (/درس|دروس|ملخص|شرح|lesson|cours|summary/i.test(text)) type = 'lesson'

  return { level, year, subject, type }
}

export function detectPdfLinksFromHtml(html = '', pageUrl = '') {
  const $ = cheerio.load(html)
  const pdfs = []
  $('a[href], button, .download, .wp-block-button__link').each((_, el) => {
    const node = $(el)
    const href = normalizeUrl(node.attr('href') || node.attr('data-href') || node.attr('data-url') || '', pageUrl)
    const title = cleanText(node.text() || node.attr('title') || node.attr('aria-label') || 'PDF')
    if (href && isPdfCandidate(title, href)) {
      pdfs.push({
        title: title || 'PDF',
        url: href,
        type: 'pdf',
      })
    }
  })
  return uniqueBy(pdfs, pdf => pdf.url)
}

export async function scrapeEddirasaArticle(url) {
  const safeUrl = normalizeUrl(url)
  if (!safeUrl || !isEddirasaUrl(safeUrl)) return null
  try {
    const html = await fetchText(safeUrl)
    const $ = cheerio.load(html)
    const headings = []
    $('h1,h2,h3').each((_, el) => {
      const text = cleanText($(el).text())
      if (text) headings.push({ tag: el.tagName.toLowerCase(), text })
    })
    const paragraphs = []
    $('article p, .entry-content p, main p, p').each((_, el) => {
      const text = cleanText($(el).text())
      if (text && text.length > 20) paragraphs.push(text)
    })
    const pdfs = detectPdfLinksFromHtml(html, safeUrl)
    return {
      url: safeUrl,
      h1: headings.filter(h => h.tag === 'h1').map(h => h.text),
      h2: headings.filter(h => h.tag === 'h2').map(h => h.text),
      h3: headings.filter(h => h.tag === 'h3').map(h => h.text),
      headings,
      paragraphs: uniqueBy(paragraphs, p => p).slice(0, 40),
      pdfs,
    }
  } catch (error) {
    console.warn(`[eddirasa_rss_crawler] scrape failed for ${safeUrl}:`, error.message)
    return null
  }
}

async function scrapeListingUrls() {
  try {
    const html = await fetchText(BASE_URL)
    const $ = cheerio.load(html)
    const links = []
    $('article a[href], h2 a[href], h3 a[href], .entry-title a[href], main a[href]').each((_, el) => {
      const url = normalizeUrl($(el).attr('href'))
      const title = cleanText($(el).text())
      if (!url || !title || !isEddirasaUrl(url)) return
      if (/\/category\/|\/tag\/|\/page\/|#|feed/i.test(url)) return
      links.push({ title, link: url, description: '', publish_date: '', category: '' })
    })
    return uniqueBy(links, item => item.link).slice(0, 30)
  } catch (error) {
    console.warn('[eddirasa_rss_crawler] listing scrape failed:', error.message)
    return []
  }
}

function buildLesson(item, scraped, updatedAt) {
  const classification = classifyEddirasaItem(item)
  const description = item.description || scraped?.paragraphs?.slice(0, 2).join(' ') || ''
  const pdfs = scraped?.pdfs || []
  const pdfFromItem = isPdfCandidate(item.title, item.link)
    ? [{ title: item.title || 'PDF', url: item.link, type: 'pdf' }]
    : []
  return {
    title: item.title || scraped?.h1?.[0] || 'محتوى تعليمي من eddirasa.com',
    url: item.link,
    description: cleanText(description).slice(0, 1200),
    publish_date: item.publish_date || '',
    category: item.category || '',
    level: classification.level,
    year: classification.year,
    subject: classification.subject,
    type: pdfFromItem.length ? 'pdf' : classification.type,
    h1: scraped?.h1 || [],
    h2: scraped?.h2 || [],
    h3: scraped?.h3 || [],
    paragraphs: scraped?.paragraphs || [],
    pdfs: uniqueBy([...pdfFromItem, ...pdfs], pdf => pdf.url),
    source: 'eddirasa',
    updated_at: updatedAt,
  }
}

export async function updateEddirasaIndex() {
  const updatedAt = new Date().toISOString()
  let items = await fetchRssItems()
  if (items.length < 5) {
    const scrapedLinks = await scrapeListingUrls()
    items = uniqueBy([...items, ...scrapedLinks], item => item.link)
  }

  const lessons = []
  for (const item of items.slice(0, 80)) {
    const scraped = await scrapeEddirasaArticle(item.link)
    lessons.push(buildLesson(item, scraped, updatedAt))
  }

  const index = {
    ...DEFAULT_INDEX,
    lessons: uniqueBy(lessons, lesson => lesson.url),
    updated_at: updatedAt,
  }

  await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true })
  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8')
  return index
}

export async function readEddirasaIndex({ refreshIfMissing = true, maxAgeMs = DAY_MS } = {}) {
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8')
    const index = JSON.parse(raw)
    const age = Date.now() - new Date(index.updated_at || 0).getTime()
    if (refreshIfMissing && (!Array.isArray(index.lessons) || !index.lessons.length || age > maxAgeMs)) {
      return updateEddirasaIndex()
    }
    return {
      ...DEFAULT_INDEX,
      ...index,
      lessons: Array.isArray(index.lessons) ? index.lessons : [],
    }
  } catch {
    return refreshIfMissing ? updateEddirasaIndex() : DEFAULT_INDEX
  }
}

export function filterLessons(index, filters = {}) {
  const level = cleanText(filters.level || '').toLowerCase()
  const year = cleanText(filters.year || '').toLowerCase()
  const subject = cleanText(filters.subject || '').toLowerCase()
  const query = cleanText(filters.query || '').toLowerCase()
  return (index.lessons || []).filter(lesson => {
    const matchesLevel = !level || String(lesson.level || '').toLowerCase() === level
    const matchesYear = !year || String(lesson.year || '').toLowerCase() === year
    const matchesSubject = !subject || String(lesson.subject || '').toLowerCase() === subject
    const haystack = `${lesson.title || ''} ${lesson.description || ''} ${lesson.category || ''} ${lesson.paragraphs?.join(' ') || ''}`.toLowerCase()
    const matchesQuery = !query || haystack.includes(query)
    return matchesLevel && matchesYear && matchesSubject && matchesQuery
  })
}

export function findLessonByTitle(index, title = '') {
  const needle = cleanText(title).toLowerCase()
  if (!needle) return null
  return (index.lessons || []).find(lesson => cleanText(lesson.title).toLowerCase() === needle)
    || (index.lessons || []).find(lesson => cleanText(lesson.title).toLowerCase().includes(needle))
    || null
}

export function createStaticEducationalFallback({ title = '', level = '', year = '', subject = '' } = {}) {
  const safeTitle = cleanText(title || subject || 'درس تعليمي')
  return {
    title: safeTitle,
    url: '',
    description: `شرح تعليمي مولّد حول: ${safeTitle}`,
    publish_date: '',
    category: '',
    level: cleanText(level),
    year: cleanText(year),
    subject: cleanText(subject),
    type: 'lesson',
    h1: [safeTitle],
    h2: ['شرح مبسط', 'أمثلة', 'تمارين', 'اختبار قصير'],
    h3: [],
    paragraphs: [
      `هذا شرح مبسط لدرس ${safeTitle}. ابدأ بفهم التعاريف الأساسية ثم انتقل إلى الأمثلة خطوة بخطوة.`,
      'مثال 1: حدّد الفكرة الرئيسية في السؤال، ثم استخرج المعطيات، وبعدها طبّق القاعدة المناسبة.',
      'مثال 2: قارن بين الحل الصحيح والحل الخاطئ لتثبيت الفكرة.',
      'تمرين 1: اكتب ملخصاً قصيراً للدرس في خمسة أسطر.',
      'تمرين 2: حل مسألة تطبيقية باستعمال القاعدة الأساسية في الدرس.',
      'تمرين 3: أنشئ سؤالاً مشابهاً ثم حاول حله دون مساعدة.',
      'اختبار قصير: أجب عن ثلاثة أسئلة: تعريف، تطبيق مباشر، ومسألة مركبة.',
    ],
    pdfs: [],
    source: 'ai-fallback',
    updated_at: new Date().toISOString(),
  }
}

export function lessonsToSearchResults(lessons = []) {
  return lessons.map(lesson => ({
    source: 'Eddirasa RSS Index',
    title: lesson.title,
    snippet: lesson.description || lesson.paragraphs?.slice(0, 2).join(' ') || '',
    url: lesson.url,
    date: lesson.publish_date || lesson.updated_at,
    pdfs: lesson.pdfs || [],
  }))
}
