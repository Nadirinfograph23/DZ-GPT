const SOURCE_HOME_PAGES = [
  ['الشروق', 'https://www.echoroukonline.com'],
  ['echoroukonline', 'https://www.echoroukonline.com'],
  ['النهار', 'https://www.ennaharonline.com'],
  ['ennaharonline', 'https://www.ennaharonline.com'],
  ['الخبر', 'https://www.elkhabar.com'],
  ['elkhabar', 'https://www.elkhabar.com'],
  ['البلاد', 'https://www.elbilad.net'],
  ['elbilad', 'https://www.elbilad.net'],
  ['وكالة الأنباء الجزائرية', 'https://www.aps.dz'],
  ['aps', 'https://www.aps.dz'],
  ['راديو الجزائر', 'https://news.radioalgerie.dz'],
  ['radioalgerie', 'https://news.radioalgerie.dz'],
  ['الهداف', 'https://www.elheddaf.com'],
  ['elheddaf', 'https://www.elheddaf.com'],
  ['tsa', 'https://www.tsa-algerie.com'],
  ['google', 'https://news.google.com'],
]

const ADVERTISING_MARKERS = /(?:محتوى\s+إعلاني|إعلان\s+(?:تجاري|ممول|مموّل|مدفوع)|محتوى\s+(?:ممول|مموّل)|برعاية|إشهار|\b(?:sponsored|advertisement|advertising|promoted|promotion|paid\s+partnership)\b)/iu
const ARABIC_SPONSORED_LABEL = /(?:^|[\s:：])مموّ?ل(?:$|[\s:：])/u
const LABELED_AD_PREFIX = /^\s*إعلان\s*[:：—–-]/u

export function isAdvertisementHeadline(title, source = '') {
  const headline = String(title ?? '').normalize('NFKC')
  const publisher = String(source ?? '').normalize('NFKC')
  return ADVERTISING_MARKERS.test(headline) || ARABIC_SPONSORED_LABEL.test(headline) || LABELED_AD_PREFIX.test(headline) || ADVERTISING_MARKERS.test(publisher) || ARABIC_SPONSORED_LABEL.test(publisher)
}
function decodeHeadlineEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, token) => {
    if (token[0] !== '#') return named[token.toLowerCase()] ?? match
    const codePoint = token[1].toLowerCase() === 'x'
      ? Number.parseInt(token.slice(2), 16)
      : Number.parseInt(token.slice(1), 10)
    return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : ' '
  })
}

function cleanHeadline(value) {
  return decodeHeadlineEntities(String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' '))
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/gi, '$1')
    .replace(/https?:\/\/[^\s)]+/gi, ' ')
    .replace(/\bwww\.[^\s)]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeMarkdownText(value) {
  return value.replace(/[\\\x60*_{}\[\]()#+.\-!|>~]/g, '\\$&')
}

function safeOrigin(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : ''
  } catch {
    return ''
  }
}

function sourceHomepage(source) {
  const normalized = String(source ?? '').toLowerCase()
  return SOURCE_HOME_PAGES.find(([label]) => normalized.includes(label.toLowerCase()))?.[1] || ''
}

export function buildNewsAnswer(items = [], limit = 10) {
  const requestedLimit = Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 10
  const maxItems = Math.max(1, Math.min(10, requestedLimit))
  const seen = new Set()
  const cleanItems = []
  for (const item of Array.isArray(items) ? items : []) {
    const title = cleanHeadline(item?.title || item?.headline || '')
    const key = title.toLowerCase().replace(/\s+/g, ' ')
    const source = String(item?.source || item?.feedName || item?.publisher || '').trim()
    if (!title || seen.has(key) || isAdvertisementHeadline(title, source)) continue
    seen.add(key)
    const articleOrigin = safeOrigin(item?.link || item?.url || '')
    const url = sourceHomepage(source) || articleOrigin
    const date = item?.pubDate || item?.published || item?.date
    cleanItems.push({ title, source, url, date: typeof date === 'string' ? date : undefined })
    if (cleanItems.length >= maxItems) break
  }
  const content = cleanItems.length
    ? '## 📰 آخر الأخبار الجزائرية\n\n' + cleanItems.map((item, index) => (index + 1) + '. ' + escapeMarkdownText(item.title)).join('\n')
    : 'لا تتوفر عناوين أخبار الآن.'
  return {
    content,
    newsItems: cleanItems.map(({ title, url, source, date }) => ({ title, url, source, date })),
  }
}
