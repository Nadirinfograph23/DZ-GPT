import { monitor } from './monitor.js'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
]

let _uaIndex = Math.floor(Math.random() * USER_AGENTS.length)
export function randomUserAgent() {
  _uaIndex = (_uaIndex + 1) % USER_AGENTS.length
  return USER_AGENTS[_uaIndex]
}

export function antiBotArgs(opts = {}) {
  const ua = opts.ua || randomUserAgent()
  const client = opts.client || 'android,ios,web'
  return [
    '--extractor-args', `youtube:player_client=${client}`,
    '--user-agent', ua,
    '--geo-bypass',
    '--no-check-certificate',
    '--retries', String(opts.retries || 4),
    '--fragment-retries', String(opts.fragmentRetries || 4),
    '--socket-timeout', String(opts.socketTimeout || 25),
    '--sleep-requests', '0.5',
    '--min-sleep-interval', '1',
    '--max-sleep-interval', '3',
  ]
}

export async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

export async function withExponentialBackoff(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts || 3
  const baseDelay = opts.baseDelay || 1000
  const label = opts.label || 'op'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      const isLast = attempt === maxAttempts
      const isRateLimit = isRateLimitError(err)
      const isBotBlock = isBotBlockError(err)

      if (isLast) throw err

      const delay = isRateLimit
        ? baseDelay * Math.pow(3, attempt - 1) + Math.random() * 1000
        : baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500

      monitor.warn(`[antiBot:backoff] ${label} attempt ${attempt} failed (${err.message.slice(0, 80)}), retrying in ${Math.round(delay)}ms`)
      await sleep(delay)

      if (isRateLimit) await sleep(2000)
      if (isBotBlock) await sleep(3000)
    }
  }
}

export function isRateLimitError(err) {
  const m = String(err?.message || '').toLowerCase()
  return m.includes('429') || m.includes('too many requests') || m.includes('rate limit')
}

export function isBotBlockError(err) {
  const m = String(err?.message || '').toLowerCase()
  return m.includes('sign in to confirm') || m.includes('not a bot') || m.includes('403') || m.includes('forbidden')
}

export function isSignatureError(err) {
  const m = String(err?.message || '').toLowerCase()
  return m.includes('signature') || m.includes('nsig') || m.includes('decipher') || m.includes('js player')
}

export function friendlyError(rawError) {
  const m = String(rawError?.message || rawError || '').toLowerCase()
  if (m.includes('429') || m.includes('too many requests')) return 'يوتيوب رفض الطلب مؤقتاً بسبب كثرة الطلبات، جاري إعادة المحاولة...'
  if (m.includes('sign in to confirm') || m.includes('not a bot')) return 'يوتيوب يحجب خادم النشر مؤقتاً. حاول مجدداً بعد دقيقة أو زوّدنا بـ YOUTUBE_COOKIES.'
  if (m.includes('403') || m.includes('forbidden')) return 'رُفض الوصول من قِبل يوتيوب مؤقتاً، جاري إعادة المحاولة بطريقة مختلفة...'
  if (m.includes('private')) return 'هذا الفيديو خاص ولا يمكن تحميله'
  if (m.includes('unavailable') || m.includes('not exist') || m.includes('removed')) return 'هذا الفيديو محذوف أو غير متاح'
  if (m.includes('age') || m.includes('age-restricted')) return 'هذا الفيديو يتطلب تسجيل دخول (محتوى مقيد بالعمر)'
  if (m.includes('region') || m.includes('country') || m.includes('geo')) return 'هذا الفيديو محظور في منطقة الخادم'
  if (m.includes('live') || m.includes('stream')) return 'البث المباشر لا يدعم التحميل حالياً'
  if (m.includes('premiere')) return 'العرض المجدول لم يُنشر بعد'
  if (m.includes('signature') || m.includes('decipher')) return 'انتهت صلاحية التوقيع، جاري إعادة الاستخراج...'
  return null
}
