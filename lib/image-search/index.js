// DZ Agent — Image Search Engine v1.1
// بحث عن صور حقيقية (مجاني وغير محدود)
// Free, keyless providers: Pinterest + Openverse + Wikimedia Commons
// هذا الموديول مخصص للبحث عن صور موجودة — وليس لتوليد صور جديدة بالذكاء الاصطناعي
// v1.1: إصلاح كشف "صور + صفة + عن" (نادرة/قديمة/تاريخية...) + فلترة النتائج + دعم Pinterest للتاريخ

import { translateForImage } from '../dz-v4/translate.js'

// ─── قاموس ترجمة ثابت — مواقع ومعالم جزائرية + مصطلحات عامة ─────────────────
// يعمل بدون مفاتيح AI — يضمن النتائج دائماً
const STATIC_DICT = {
  // ── الثورة الجزائرية والتاريخ ─────────────────────────────────────────────
  'الثورة الجزائرية': 'Algerian War of Independence 1954 1962 rare photos',
  'ثورة نوفمبر': 'Algerian Revolution November 1954 historical photos',
  'جيش التحرير الوطني': 'ALN Algerian National Liberation Army soldiers',
  'مجاهدين': 'Algerian mujahideen fighters independence war',
  'مجاهد': 'Algerian mujahid independence fighter photo',
  'الاستعمار الفرنسي': 'French colonialism Algeria colonial era',
  'استعمار فرنسا': 'French colonial Algeria historical archive',
  'الاستقلال الجزائري': 'Algerian independence 1962 celebration',
  'يوم الاستقلال': 'Algeria independence day 1962',
  'مجاهدة': 'Algerian women fighters independence war',
  'جبهة التحرير': 'FLN Front Liberation Nationale Algeria',
  'حرب الجزائر': 'Algerian War rare historical photos',
  'صور نادرة': 'rare archive photos Algeria historical',
  'صور قديمة': 'old vintage historical photos Algeria',
  'صور أرشيفية': 'archive historical photos Algeria',
  'أرشيف': 'archive historical photos Algeria',
  'نادرة': 'rare historical photos',
  // معالم جزائرية مشهورة
  'مقام الشهيد': 'Maqam Echahid Algiers memorial',
  'مقام الشهداء': 'Maqam Echahid Algiers memorial',
  'مسجد الفرقان': 'Al Furqan Mosque',
  'جامع الجزائر': 'Grand Mosque Algiers',
  'المسجد الأعظم': 'Grand Mosque Algiers',
  'جامع الجزائر الكبير': 'Grand Mosque Algiers',
  'قسنطينة': 'Constantine Algeria',
  'وهران': 'Oran Algeria',
  'عنابة': 'Annaba Algeria',
  'الجزائر العاصمة': 'Algiers capital Algeria',
  'تلمسان': 'Tlemcen Algeria',
  'بجاية': 'Bejaia Algeria',
  'سطيف': 'Setif Algeria',
  'تيبازة': 'Tipaza Algeria ruins',
  'جرجرة': 'Djurdjura mountains Algeria',
  'الهقار': 'Hoggar mountains Algeria',
  'تاسيلي ناجر': 'Tassili n\'Ajjer Algeria',
  'تيميمون': 'Timimoun Algeria',
  'غرداية': 'Ghardaia Algeria',
  'البويرة': 'Bouira Algeria',
  'باتنة': 'Batna Algeria',
  'الأغواط': 'Laghouat Algeria',
  'بسكرة': 'Biskra Algeria',
  'قصر الشلالة': 'Tiaret Algeria waterfall',
  'شلالات الأروى': 'Aïn Sefra Algeria',
  'شلالات': 'waterfall Algeria',
  'صحراء': 'Sahara desert Algeria',
  'رمال': 'Sahara sand dunes Algeria',
  'قبائل': 'Kabyle Algeria Berber',
  'جبال': 'mountains Algeria',
  'ميناء': 'port harbor Algeria',
  'قصبة': 'Casbah Algiers',
  'القصبة': 'Casbah Algiers UNESCO',
  'المنطقة الصناعية': 'industry Algeria',
  // مصطلحات عامة عربية
  'صورة': '',
  'صور': '',
  'فوتو': '',
  'لقطة': '',
  'مشهد': 'landscape',
  'طبيعة': 'nature landscape',
  'جبل': 'mountain',
  'بحر': 'sea ocean',
  'شاطئ': 'beach',
  'غابة': 'forest',
  'مدينة': 'city',
  'قرية': 'village',
  'سوق': 'market bazaar',
  'مسجد': 'mosque',
  'كنيسة': 'church',
  'قلعة': 'castle fortress',
  'متحف': 'museum',
  'حديقة': 'garden park',
  'منتزه': 'park',
  'نهر': 'river',
  'بحيرة': 'lake',
  'شلال': 'waterfall',
  'واحة': 'oasis',
  'خيمة': 'tent nomad',
  'جمل': 'camel',
  'خيل': 'horse',
  'تقليدي': 'traditional',
  'تراث': 'heritage traditional',
  'أزقة': 'alley medina',
  'دارجة': 'Algerian dialect',
  'فنون': 'art',
  'موسيقى': 'music',
  'رقص': 'dance traditional',
  // ── كأس العالم 2026 ────────────────────────────────────────────────────────
  'كأس العالم': 'FIFA World Cup 2026',
  'كاس العالم': 'FIFA World Cup 2026',
  'مونديال': 'FIFA World Cup 2026',
  'مونديال 2026': 'FIFA World Cup 2026',
  'كأس العالم 2026': 'FIFA World Cup 2026',
  'كاس العالم 2026': 'FIFA World Cup 2026',
  'الكأس الذهبية': 'FIFA World Cup trophy',
  'كأس الفيفا': 'FIFA World Cup trophy',
  'كأس ذهبي': 'FIFA World Cup trophy golden',
  'ملاعب كأس العالم': 'FIFA World Cup 2026 stadiums',
  'ملاعب المونديال': 'FIFA World Cup 2026 stadiums USA Canada Mexico',
  'الميتلايف': 'MetLife Stadium New York FIFA World Cup',
  'ميتلايف': 'MetLife Stadium New Jersey FIFA',
  'سوفي ستاد': 'SoFi Stadium Los Angeles FIFA',
  'ملعب دالاس': 'AT&T Stadium Dallas FIFA World Cup',
  'ملعب مكسيكو': 'Estadio Azteca Mexico City FIFA World Cup',
  'أزتيك': 'Estadio Azteca Mexico',
  'ملعب لوس أنجلوس': 'SoFi Stadium Los Angeles FIFA',
  'ملعب نيويورك': 'MetLife Stadium New York FIFA',
  'كأس العالم الملاعب': 'FIFA World Cup 2026 stadiums',
  // منتخبات
  'منتخب الأرجنتين': 'Argentina national football team World Cup 2026',
  'الأرجنتين كرة القدم': 'Argentina football team Messi',
  'ميسي': 'Lionel Messi Argentina World Cup',
  'مبابي': 'Kylian Mbappe France football',
  'رونالدو': 'Cristiano Ronaldo Portugal football',
  'نيمار': 'Neymar Brazil football',
  'منتخب فرنسا': 'France national football team World Cup',
  'منتخب البرازيل': 'Brazil national football team World Cup',
  'منتخب إسبانيا': 'Spain national football team World Cup',
  'منتخب إنجلترا': 'England national football team World Cup',
  'منتخب ألمانيا': 'Germany national football team World Cup',
  'منتخب البرتغال': 'Portugal national football team World Cup',
  'منتخب المغرب': 'Morocco national football team World Cup 2026',
  'منتخب السنغال': 'Senegal national football team World Cup',
  'منتخب الجزائر': 'Algeria national football team football',
  'منتخب أمريكا': 'USA national football team soccer World Cup 2026',
  'منتخب المكسيك': 'Mexico national football team World Cup',
  'منتخب كندا': 'Canada national football team World Cup 2026',
  'منتخب هولندا': 'Netherlands national football team World Cup',
  'منتخب بلجيكا': 'Belgium national football team football',
  'رياض محرز': 'Riyad Mahrez Algeria footballer',
  'كرة القدم': 'football soccer',
  'كروي': 'football soccer ball',
  'مباراة': 'football match game',
  'جماهير': 'football fans stadium',
  'مشجعين': 'football fans supporters',
  // دول وأماكن عامة
  'الجزائر': 'Algeria',
  'لبنان': 'Lebanon',
  'فرنسا': 'France',
  'مصر': 'Egypt',
  'المغرب': 'Morocco',
  'تونس': 'Tunisia',
  'أمريكا': 'United States USA',
  'كندا': 'Canada',
  'المكسيك': 'Mexico',
  'البرازيل': 'Brazil',
  'الأرجنتين': 'Argentina',
  'إسبانيا': 'Spain',
  'ألمانيا': 'Germany',
  'إنجلترا': 'England',
  'البرتغال': 'Portugal',
}

// Strip request wording but preserve the subject. In particular, never delete
// unmatched Arabic words after a partial translation: they may be proper names.
const IMAGE_TOPIC_PREFIX_RE = /^(?:ابحث\s*(?:لي\s*)?(?:عن|على)?\s*(?:صور|صورة|فوتو|تصاور)?|أبحث\s*(?:لي\s*)?(?:عن|على)?\s*(?:صور|صورة|فوتو|تصاور)?|بحث\s*(?:عن)?\s*(?:صور|صورة|فوتو)?|حوس\s*(?:لي\s*)?(?:على|عن)?\s*(?:صور|صورة)?|دور\s*(?:لي\s*)?(?:على|عن)?\s*(?:صور|صورة)?|(?:جيبلي|هاتلي|أجلب|اجلب|جيب|هات|وريني|ورّيني|ورني|أرني|ارني|أروني|اروني|شوفلي|شوف\s*لي)\s*(?:(?:صور|صورة|فوتو|تصاور)\s*)?|(?:أريد|اريد|أرغب|ارغب)\s+(?:أن|ان)\s+(?:أرى|ارى|نشوف|نرى)\s*|(?:أريد|اريد|بغيت|نبغي|حاب)\s+(?:صور|صورة|فوتو)\s*|(?:find|search\s+for|get\s+me|bring\s+me|fetch|show\s+me|let\s+me\s+see)\s+(?:(?:a|an|some)\s+)?(?:(?:photos?|pictures?|images?)\s*(?:(?:of|about|from)\s*)?)?|(?:trouve|cherche)\s+(?:moi\s+)?(?:(?:une?|des)\s+)?(?:(?:photos?|images?)\s*(?:(?:de|du|des|d['’])\s*)?)?|(?:montre(?:z)?[\s-]+moi|fais[\s-]+voir)\s+(?:(?:une?|des|le|la|les)\s+)?(?:(?:photos?|images?)\s*(?:(?:de|du|des|d['’])\s*)?)?|(?:photos?|images?|pictures?)\s+(?:(?:of|about|from|de|du|des|d['’])\s+)?|(?:صور|صورة|تصاور|فوتو)\s*(?:(?:عن|من|حول|تاع|ديال)\s*)?)/i
const IMAGE_TOPIC_SUFFIX_RE = /\s*(?:بالصور|بصور|بالصورة|مع\s*الصور|مع\s*صور|وصور|وبالصور|in\s+photos?|in\s+pictures?|with\s+photos?|en\s+photos?|avec\s+des?\s+photos?)\s*$/i
const STATIC_DICT_ENTRIES = Object.entries(STATIC_DICT).sort((a, b) => b[0].length - a[0].length)

export function extractImageSearchSubject(rawQuery) {
  const query = String(rawQuery || '').normalize('NFKC').trim()
  if (!query) return ''
  let subject = query
    .replace(IMAGE_TOPIC_PREFIX_RE, '')
    .replace(IMAGE_TOPIC_SUFFIX_RE, '')
    .replace(/^[\s"'“”«»]+|[\s"'“”«»]+$/g, '')
    .replace(/[\s,،:;!?؟.]+$/g, '')
    .trim()

  const isKnownTopic = candidate => {
    const normalizedCandidate = normalizeImageText(candidate)
    return STATIC_DICT_ENTRIES.some(([key]) => {
      const normalizedKey = normalizeImageText(key)
      return normalizedCandidate.startsWith(normalizedKey) || normalizedKey.startsWith(normalizedCandidate)
    })
  }
  const isCommonNoun = candidate => /^(?:مدينة|مسجد|جامع|ولاية|بلدة|منطقة|شخص|لاعب|فريق|صحراء|جبل|بحر|غابة|الجزائر|عنابة)/u.test(candidate)

  if (/^لل(?=[\u0600-\u06FF])/u.test(subject)) {
    const withoutOneLam = subject.slice(1)
    const withoutTwoLams = subject.slice(2)
    if (isKnownTopic(withoutOneLam) || isCommonNoun(withoutOneLam)) subject = withoutOneLam
    else subject = withoutTwoLams
  } else {
    const lamPrefix = subject.match(/^ل\s*(?=[\u0600-\u06FF])/u)
    if (lamPrefix) {
      const withoutLam = subject.slice(lamPrefix[0].length)
      if (isKnownTopic(withoutLam) || isCommonNoun(withoutLam)) subject = withoutLam
    }
  }
  return subject || query
}

function extractAndTranslateStatic(rawQuery) {
  const subject = extractImageSearchSubject(rawQuery)
  if (!subject) return null

  let translated = subject
  let matched = false
  for (const [ar, en] of STATIC_DICT_ENTRIES) {
    if (subject.includes(ar) && en) {
      translated = translated.replace(ar, en)
      matched = true
    }
  }

  if (matched) {
    translated = translated
      .replace(/(^|\s)(?:في|من|عن|حول|و|تاع|ديال)(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return {
    subject,
    english: matched && translated && !/[\u0600-\u06FF\u0750-\u077F]/.test(translated) ? translated : null,
  }
}

const CACHE = new Map()
const CACHE_MAX = 150
const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php'
const OPENVERSE_API  = 'https://api.openverse.org/v1/images/'

// ─── Cache helpers ────────────────────────────────────────────────────────────
function cachePut(key, val) {
  if (CACHE.size >= CACHE_MAX) {
    const first = CACHE.keys().next().value
    if (first) CACHE.delete(first)
  }
  CACHE.set(key, val)
}

// ─── Wikimedia Commons (مجاني 100% بدون مفتاح) ───────────────────────────────
async function searchWikimedia(query, limit = 8) {
  try {
    const searchParams = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srnamespace: '6',   // File namespace فقط
      format: 'json',
      srlimit: String(Math.min(limit * 2, 20)),
      origin: '*',
    })
    const searchRes = await fetch(`${WIKIMEDIA_API}?${searchParams}`, {
      headers: { 'User-Agent': 'DZ-GPT-Agent/2.0 (https://dzagent.app/; image search)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(9000),
    })
    if (!searchRes.ok) return []
    const searchData = await searchRes.json()

    const hits = (searchData.query?.search || []).filter(h =>
      /\.(jpe?g|png|webp|gif)$/i.test(h.title)
    )
    if (!hits.length) return []

    // جلب معلومات الصور الكاملة
    const titleList = hits.slice(0, limit).map(h => h.title).join('|')
    const infoParams = new URLSearchParams({
      action: 'query',
      titles: titleList,
      prop: 'imageinfo',
      iiprop: 'url|size|extmetadata|mime',
      iiurlwidth: '700',
      format: 'json',
      origin: '*',
    })
    const infoRes = await fetch(`${WIKIMEDIA_API}?${infoParams}`, {
      headers: { 'User-Agent': 'DZ-GPT-Agent/2.0 (https://dzagent.app/; image search)', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(9000),
    })
    if (!infoRes.ok) return []
    const infoData = await infoRes.json()
    const pages = Object.values(infoData.query?.pages || {})

    return pages
      .filter(p => {
        const info = p.imageinfo?.[0]
        if (!info?.url) return false
        const mime = info.mime || ''
        return mime.startsWith('image/') && !mime.includes('svg')
      })
      .map(p => {
        const info = p.imageinfo[0]
        const meta = info.extmetadata || {}
        const rawTitle = p.title.replace(/^File:/i, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ')
        return {
          url: info.thumburl || info.url,
          fullUrl: info.url,
          title: (meta.ObjectName?.value || rawTitle).slice(0, 120),
          source: 'Wikimedia Commons',
          sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
          width: info.thumbwidth || info.width || 0,
          height: info.thumbheight || info.height || 0,
          license: meta.LicenseShortName?.value || 'Creative Commons',
          creator: meta.Artist?.value?.replace(/<[^>]+>/g, '') || '',
        }
      })
      .filter(img => img.width >= 80)
      .slice(0, limit)
  } catch (e) {
    console.warn('[ImageSearch:Wikimedia]', e.message?.slice(0, 80))
    return []
  }
}

// ─── Openverse — Creative Commons (مجاني بدون مفتاح) ─────────────────────────
async function searchOpenverse(query, limit = 6) {
  try {
    const params = new URLSearchParams({
      q: query,
      page_size: String(Math.min(20, Math.max(1, limit))),
      license_type: 'commercial',
      mature: 'false',
    })
    const res = await fetch(`${OPENVERSE_API}?${params}`, {
      headers: { 'User-Agent': 'DZ-GPT-Agent/2.0 (https://dz-gpt.vercel.app)' },
      signal: AbortSignal.timeout(9000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || [])
      .filter(img => img.url && !img.url.includes('.svg'))
      .map(img => ({
        url: img.thumbnail || img.url,
        fullUrl: img.url,
        title: (img.title || query).slice(0, 120),
        source: 'Openverse',
        sourceUrl: img.foreign_landing_url || img.url,
        width: img.width || 0,
        height: img.height || 0,
        license: img.license ? `CC ${img.license.toUpperCase()}${img.license_version ? ' ' + img.license_version : ''}` : 'CC',
        creator: img.creator || '',
      }))
  } catch (e) {
    console.warn('[ImageSearch:Openverse]', e.message?.slice(0, 80))
    return []
  }
}

// ─── Pinterest Search ────────────────────────────────────────────────────────
/**
 * Search-page warm-up and resource request are informed by the MIT pinscrape project.
 * https://github.com/iamatulsingh/pinscrape
 * Cookies are request-scoped only; none are hard-coded or persisted.
 */
async function searchPinterest(query, limit = 8) {
  const cleanQuery = String(query || '').trim().slice(0, 200)
  if (!cleanQuery) return []
  try {
    const encodedQuery = encodeURIComponent(cleanQuery)
    const sourceUrl = '/search/pins/?q=' + encodedQuery + '&rs=typed'
    const pageUrl = 'https://www.pinterest.com' + sourceUrl
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.pinterest.com/',
    }
    const warmup = await fetch(pageUrl, { headers: { ...headers, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }, signal: AbortSignal.timeout(5000) })
    if (!warmup.ok) return []
    const cookieLines = typeof warmup.headers.getSetCookie === 'function' ? warmup.headers.getSetCookie() : [warmup.headers.get('set-cookie') || '']
    const cookieHeader = cookieLines.flatMap(value => String(value).split(/,(?=\s*[^;,=\s]+=)/)).map(value => value.split(';', 1)[0].trim()).filter(value => /^[A-Za-z0-9_-]+=/.test(value)).join('; ')
    const options = {
      applied_unified_filters: null, appliedProductFilters: '---', article: null,
      auto_correction_disabled: false, corpus: null, customized_rerank_type: null,
      domains: null, filters: null, journey_depth: null,
      page_size: String(Math.min(Math.max(limit * 2, limit), 25)),
      price_max: null, price_min: null, query_pin_sigs: null, query: encodedQuery,
      redux_normalize_feed: true, request_params: null, rs: 'typed', scope: 'pins',
      selected_one_bar_modules: null, source_id: null, source_module_id: null,
      seoDrawerEnabled: false, source_url: encodeURIComponent(sourceUrl),
      top_pin_id: null, top_pin_ids: null,
    }
    const params = new URLSearchParams({ source_url: sourceUrl, data: JSON.stringify({ options, context: {} }), _: String(Date.now()) })
    const requestHeaders = { ...headers, 'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest', 'X-Pinterest-Appstate': 'active', 'X-Pinterest-PWS-Handler': 'www/search/[scope].js', 'X-Pinterest-Source-Url': sourceUrl, 'Referer': pageUrl }
    if (cookieHeader) requestHeaders.Cookie = cookieHeader
    const res = await fetch('https://www.pinterest.com/resource/BaseSearchResource/get/?' + params.toString(), { headers: requestHeaders, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const json = await res.json()
    const results = json?.resource_response?.data?.results || []
    const seen = new Set()
    const images = []
    for (const pin of results) {
      if (images.length >= limit) break
      const imgs = pin?.images || {}
      const imgObj = imgs.orig || imgs['736x'] || imgs['474x'] || imgs['236x']
      if (!imgObj?.url || !/^https:\/\/i\.pinimg\.com\//i.test(imgObj.url) || seen.has(imgObj.url)) continue
      seen.add(imgObj.url)
      const rawTitle = (typeof pin.title === 'object' ? pin.title?.text : pin.title) || pin.alt_text || cleanQuery
      images.push({ url: imgObj.url, fullUrl: imgObj.url, title: String(rawTitle).replace(/<[^>]+>/g, '').slice(0, 120) || cleanQuery, source: 'Pinterest', sourceUrl: pin.id ? 'https://www.pinterest.com/pin/' + encodeURIComponent(pin.id) + '/' : 'https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(cleanQuery), width: imgObj.width || 0, height: imgObj.height || 0, license: 'Pinterest', creator: pin.pinner?.full_name || '' })
    }
    return images
  } catch (e) {
    console.warn('[ImageSearch:Pinterest]', e.message?.slice(0, 100))
    return []
  }
}

// ─── الدالة الرئيسية للبحث عن الصور ──────────────────────────────────────────
/**
 * searchImages — ابحث عن صور حقيقية لأي موضوع.
 * @param {object} opts
 * @param {string} opts.query          - طلب المستخدم (عربي/فرنسي/إنجليزي)
 * @param {Function} opts.aiGenerate   - دالة الذكاء الاصطناعي للترجمة
 * @param {number}  [opts.limit=6]     - عدد الصور المطلوبة
 * @returns {Promise<{images, query, originalQuery, translated, total}>}
 */
const IMAGE_RESULT_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'for', 'in', 'on', 'at', 'to', 'from',
  'de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et', 'sur', 'avec',
  'صور', 'صورة', 'عن', 'من', 'في', 'حول', 'ال', 'و',
])

function normalizeImageText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ى]/g, 'ي')
    .replace(/[ة]/g, 'ه')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getImageRelevanceScore(image, query, sourceOrder) {
  const queryText = normalizeImageText(query)
  const title = normalizeImageText(`${image.title || ''} ${image.creator || ''}`)
  const tokens = [...new Set(queryText.split(' ').filter(token => token.length > 1 && !IMAGE_RESULT_STOPWORDS.has(token)))]
  const matched = tokens.filter(token => title.includes(token))
  const phraseBonus = queryText && title.includes(queryText) ? 30 : 0
  const coverageBonus = tokens.length ? (matched.length / tokens.length) * 20 : 0
  const providerIndex = Math.max(0, sourceOrder.indexOf(image.source))
  const providerBonus = Math.max(0, sourceOrder.length - providerIndex) / 10
  return phraseBonus + coverageBonus + matched.length + providerBonus
}

function canonicalImageUrl(value) {
  try {
    const url = new URL(String(value || ''))
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    url.search = ''
    url.hash = ''
    if (url.hostname.toLowerCase() === 'i.pinimg.com') {
      url.pathname = url.pathname.replace(/^\/(?:originals?|(?:\d{2,4}x(?:\d{2,4})?))\//i, '/')
    }
    return `${url.hostname.toLowerCase()}${url.pathname.toLowerCase()}`
  } catch {
    return ''
  }
}

function dedupeAndRankImages(images, query, sourceOrder) {
  const seen = new Set()
  const ranked = images
    .map((image, index) => ({ image, index, score: getImageRelevanceScore(image, query, sourceOrder) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const result = []
  for (const { image } of ranked) {
    const keys = [canonicalImageUrl(image.fullUrl), canonicalImageUrl(image.url)].filter(Boolean)
    if (image.source === 'Pinterest') {
      const pinId = String(image.sourceUrl || '').match(/pinterest\.com\/pin\/([^/?#]+)/i)?.[1]
      if (pinId) keys.push(`pinterest-pin:${pinId}`)
    }
    if (keys.some(key => seen.has(key))) continue
    for (const key of keys) seen.add(key)
    result.push(image)
  }
  return result
}

export async function searchImages({ query, aiGenerate, limit = 6, preferredSource = null }) {
  const originalQuery = String(query || '').trim()
  const classification = classifyImageQuery(originalQuery)
  const sourceHint = String(preferredSource || '').toLowerCase()
  const normalizedHint = sourceHint === 'wikimedia' ? 'wikipedia' : sourceHint
  const resolvedSource = ['pinterest', 'wikipedia', 'mixed'].includes(normalizedHint) ? normalizedHint : classification.source
  const resultLimit = Math.min(24, Math.max(1, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 6))
  const cacheKey = resolvedSource + '::' + originalQuery.toLowerCase().slice(0, 200)
  if (CACHE.has(cacheKey)) {
    console.log(`[ImageSearch] Cache HIT: "${cacheKey.slice(0, 60)}"`)
    return CACHE.get(cacheKey)
  }

  const topicQuery = extractImageSearchSubject(originalQuery) || originalQuery
  const staticResult = extractAndTranslateStatic(originalQuery)
  let searchQuery = staticResult?.english || staticResult?.subject || topicQuery
  let translated = !!staticResult?.english && normalizeImageText(staticResult.english) !== normalizeImageText(staticResult.subject)

  if (/[\u0600-\u06FF\u0750-\u077F]/.test(searchQuery)) {
    try {
      if (typeof aiGenerate === 'function') {
        const tr = await translateForImage({ aiGenerate, prompt: searchQuery })
        if (tr.translated && tr.english && !/[\u0600-\u06FF\u0750-\u077F]/.test(tr.english)) {
          searchQuery = tr.english
          translated = true
          console.log(`[ImageSearch] AI translate: "${topicQuery.slice(0, 60)}" → "${searchQuery.slice(0, 60)}"`)
        }
      }
    } catch { /* نبقى مع ما لدينا */ }
  }

  console.log('[ImageSearch] Resolved source=' + resolvedSource + ' category=' + classification.category + ' confidence=' + classification.confidence + '%')
  let providerQuery = searchQuery
  let candidates = []

  if (resolvedSource === 'wikipedia') {
    candidates = await searchWikimedia(providerQuery, resultLimit)
    if (!candidates.length) {
      const [openverse, pinterest] = await Promise.allSettled([
        searchOpenverse(providerQuery, resultLimit),
        searchPinterest(providerQuery, resultLimit),
      ])
      candidates = [
        ...(openverse.status === 'fulfilled' ? openverse.value : []),
        ...(pinterest.status === 'fulfilled' ? pinterest.value : []),
      ]
    }
  } else if (resolvedSource === 'mixed') {
    const [pinterest, openverse, wikimedia] = await Promise.allSettled([
      searchPinterest(providerQuery, resultLimit),
      searchOpenverse(providerQuery, resultLimit),
      searchWikimedia(providerQuery, resultLimit),
    ])
    candidates = [
      ...(pinterest.status === 'fulfilled' ? pinterest.value : []),
      ...(openverse.status === 'fulfilled' ? openverse.value : []),
      ...(wikimedia.status === 'fulfilled' ? wikimedia.value : []),
    ]
  } else {
    candidates = await searchPinterest(providerQuery, resultLimit)
    if (!candidates.length && providerQuery !== topicQuery) {
      candidates = await searchPinterest(topicQuery, resultLimit)
      if (candidates.length) {
        providerQuery = topicQuery
        translated = false
      }
    }

    // Pinterest is the primary provider. Openverse and Wikimedia are silent,
    // keyless fallbacks when Pinterest is blocked or returns no usable pins.
    if (!candidates.length) {
      const [openverse, wikimedia] = await Promise.allSettled([
        searchOpenverse(providerQuery, resultLimit),
        searchWikimedia(providerQuery, resultLimit),
      ])
      candidates = [
        ...(openverse.status === 'fulfilled' ? openverse.value : []),
        ...(wikimedia.status === 'fulfilled' ? wikimedia.value : []),
      ]
    }
  }

  if (!candidates.length && providerQuery !== topicQuery) {
    providerQuery = topicQuery
    translated = false
    if (resolvedSource === 'wikipedia') {
      candidates = await searchWikimedia(providerQuery, resultLimit)
      if (!candidates.length) {
        const [openverse, pinterest] = await Promise.allSettled([
          searchOpenverse(providerQuery, resultLimit),
          searchPinterest(providerQuery, resultLimit),
        ])
        candidates = [
          ...(openverse.status === 'fulfilled' ? openverse.value : []),
          ...(pinterest.status === 'fulfilled' ? pinterest.value : []),
        ]
      }
    } else if (resolvedSource === 'mixed') {
      const [pinterest, openverse, wikimedia] = await Promise.allSettled([
        searchPinterest(providerQuery, resultLimit),
        searchOpenverse(providerQuery, resultLimit),
        searchWikimedia(providerQuery, resultLimit),
      ])
      candidates = [
        ...(pinterest.status === 'fulfilled' ? pinterest.value : []),
        ...(openverse.status === 'fulfilled' ? openverse.value : []),
        ...(wikimedia.status === 'fulfilled' ? wikimedia.value : []),
      ]
    } else {
      const pinterest = await searchPinterest(providerQuery, resultLimit)
      if (pinterest.length) {
        candidates = pinterest
      } else {
        const [openverse, wikimedia] = await Promise.allSettled([
          searchOpenverse(providerQuery, resultLimit),
          searchWikimedia(providerQuery, resultLimit),
        ])
        candidates = [
          ...(openverse.status === 'fulfilled' ? openverse.value : []),
          ...(wikimedia.status === 'fulfilled' ? wikimedia.value : []),
        ]
      }
    }
  }

  const sourceOrder = resolvedSource === 'wikipedia'
    ? ['Wikimedia Commons', 'Openverse', 'Pinterest']
    : ['Pinterest', 'Openverse', 'Wikimedia Commons']
  const images = dedupeAndRankImages(candidates, providerQuery, sourceOrder).slice(0, resultLimit)
  const result = {
    images,
    query: providerQuery,
    originalQuery,
    translated,
    total: images.length,
    preferredSource: resolvedSource,
  }

  if (images.length > 0) cachePut(cacheKey, result)
  console.log(`[ImageSearch] "${originalQuery.slice(0, 60)}" → ${images.length} results (${images.map(image => image.source).join(', ') || 'none'})`)
  return result
}

// ─── كاشف نوع الطلب: بحث عن صورة أم توليد؟ ──────────────────────────────────
/**
 * isImageSearchQuery — هل يطلب المستخدم البحث عن صورة حقيقية (لا توليداً)؟
 * القاعدة: إذا وُجد مؤشر توليد → false بالضرورة.
 *           إذا وُجد مؤشر بحث ولا توليد → true.
 */
export function isImageSearchQuery(query) {
  const t = String(query || '').toLowerCase()

  // مؤشرات التوليد (الأولوية القصوى — تلغي البحث)
  const GENERATION_SIGNALS = [
    'ولّد صورة', 'ولد صورة', 'أنشئ صورة', 'انشئ صورة', 'اصنع صورة', 'صنع صورة',
    'ارسم لي', 'ارسم صورة', 'ارسم لنا', 'ارسم لي صورة',
    'generate image', 'generate a photo', 'generate a picture',
    'create image', 'create a picture', 'create an image', 'create an illustration',
    'draw me', 'draw a ', 'draw an ', 'make an image', 'make a picture', 'make an illustration',
    'ai image', 'ai art', 'ai-generated', 'ai photo',
    'صورة مولّدة', 'صورة بالذكاء', 'توليد صورة', 'إنشاء صورة', 'إنشاء لوحة',
    'image ai', 'illustration ai', 'imagine a', 'imagine an', 'render a', 'render an',
  ]

  if (GENERATION_SIGNALS.some(s => t.includes(s))) return false

  const DIRECT_VISUAL_REQUESTS = [
    /^(?:وريني|ورّيني|ورني|أرني|ارني|أروني|اروني|شوفلي|شوف\s+لي)\s+(?!(?:الكود|الشفرة|النص|الجدول|البيانات|الملف|الصفحة|الموقع|الخريطة)(?:\s|$))\S/i,
    /^(?:أريد|اريد|أرغب|ارغب)\s+(?:أن|ان)\s+(?:أرى|ارى|نشوف|نرى)\s+\S/i,
    /^(?:show\s+me|let\s+me\s+see)\s+(?!(?:how|what|who|where|when|why)\b)(?!(?:the\s+)?(?:code|script|steps|instructions|answer|result|data|table|website|url|text|file|document)\b)\S/i,
    /^(?:montre[\s-]+moi|montrez[\s-]+moi|fais[\s-]+voir)\s+(?!(?:comment|pourquoi|quand|ou|quoi)\b)(?!(?:(?:le|la|les|un|une)\s+)?(?:code|texte|tableau|fichier|page|site|resultat)\b)\S/i,
  ]
  if (DIRECT_VISUAL_REQUESTS.some(re => re.test(String(query || '').trim()))) return true

  // مؤشرات البحث عن صورة حقيقية
  const SEARCH_SIGNALS = [
    // عربية
    'ابحث عن صورة', 'ابحث على صورة', 'ابحث عن صور', 'ابحث على صور',
    'جيبلي صورة', 'جيبلي صور', 'جيبلي فوتو', 'أجلب صورة', 'اجلب صورة',
    'أريد صورة', 'اريد صورة', 'أريد صور', 'اريد صور',
    'هاتلي صورة', 'هاتلي صور', 'هات صورة', 'هات صور',
    'وين نلقى صورة', 'فين صورة', 'فين صور',
    'بحث عن صورة', 'بحث عن صور',
    'دور صورة', 'دور على صورة', 'دور على صور', 'دور صور',
    'أبحث عن صورة', 'أبحث عن صور',
    'أرني صورة', 'أرني صور', 'أرني فوتو', 'ارني صورة',
    'صور حقيقية', 'صور واقعية', 'صورة حقيقية', 'صورة واقعية',
    'أريد صورة حقيقية', 'أريد فوتو', 'اريد فوتو',
    'جيبلي فوتو', 'فوتو لـ', 'فوتو تاع',
    'أرني فوتو', 'صورة من الواقع',
    // ── نمط "X بالصور" — الأكثر شيوعاً في العربية الجزائرية ──────────────
    // مثال: "كأس العالم بالصور", "الجزائر بالصور", "الصحراء بالصور"
    'بالصور', 'بصور', 'بالصورة',
    'مع صور', 'مع الصور',
    'صور عن', 'صور من', 'صور لـ', 'صور ل',
    'نشوف صور', 'أشوف صور', 'اشوف صور', 'نشوفوا صور',
    'عرض صور', 'اعرض صور', 'وصور', 'ومع صور',
    'صور كأس', 'صور الجزائر', 'صور فريق',
    // دارجة جزائرية
    'جيب صورة', 'دير بحث على صورة', 'حوس على صورة', 'لقا صورة',
    'بغيت صورة', 'نبغي صورة', 'تصاور', 'صوّرلي',
    'بغيت نشوف صور', 'نبغي نشوف صور', 'حابب نشوف صور',
    // إنجليزية
    'find a photo', 'find a picture', 'find an image', 'find photos', 'find pictures', 'find images',
    'search for a photo', 'search for image', 'search images', 'search photos', 'search pictures',
    'get me a photo', 'get me a picture', 'get me an image', 'get me photos', 'get me pictures',
    'show me a photo', 'show me a picture', 'show me images', 'show me photos', 'show me pictures',
    'get photos of', 'get pictures of', 'get images of', 'bring me photos', 'bring me pictures',
    'fetch image', 'fetch photo', 'fetch picture', 'bring me photo', 'bring me a picture',
    'real photo of', 'real picture of', 'real image of', 'actual photo', 'actual picture',
    'photo of', 'picture of', 'image of', // أخيراً (أقل خصوصية)
    // فرنسية
    'trouve une photo', 'trouve des photos', 'trouve une image', 'trouve des images',
    'cherche une image', 'cherche des images', 'cherche une photo', 'cherche des photos',
    'montre moi une photo', 'montre une image', 'donne moi une photo', 'montre moi des images',
    'apporte moi une photo',
  ]

  // An explicit Pinterest request is still an image-search request.
  if (/(?:pinterest|بينتريست|بنتريست)/i.test(query)) return true
  if (/(?:pinterest|بينتريست).{0,30}(?:صور|photos?|images?|ديكور|أزياء|موضة|وصفة|طبخ|تصميم)/i.test(query)) return true

  // ── v1.1: أنماط Regex للتعامل مع "صور + صفة + عن/من/حول" ─────────────────
  // المشكلة: "صور نادرة عن الثورة" لا تتطابق مع "صور عن" بسبب كلمة "نادرة" بينهما
  // الحل: regex يمرر أي عدد من الكلمات بين "صور" والموضوع
  const IMAGE_REGEX_PATTERNS = [
    // صور [صفة اختيارية] عن/من/حول/تاع X
    /صور\s+(?:نادرة|قديمة|تاريخية|أرشيفية|أصيلة|حقيقية|جميلة|مذهلة|رائعة|ملونة|أبيض|كلاسيكية|عتيقة|خمر|فنية|وثائقية|أصلية)?\s*(?:عن|من|حول|لـ?|تاع|ديال)\s+\S/i,
    // photos/images + adjective + of
    /(?:rare|old|vintage|historical|archive|ancient|antique|classic)\s+(?:photos?|images?|pictures?)\s+(?:of|about|from)\s+\S/i,
    /(?:photos?|images?|pictures?)\s+(?:of|about|from|de|du|des|d['’])\s+\S/i,
    // صور + اسم (بدون حرف جر) — حين تكون "صور X" دون "صور عن X"
    /^صور\s+(?:ال\S+|\S{4,})/i,
    // صورة + صفة + عن
    /صورة\s+(?:نادرة|قديمة|تاريخية|أرشيفية)\s+(?:عن|من|حول)/i,
    // photos rares de / images rares de
    /(?:photos?|images?)\s+(?:rares?|anciennes?|historiques?|d'archives?)\s+(?:de|du|des|d')\s+\S/i,
  ]

  if (IMAGE_REGEX_PATTERNS.some(re => re.test(query))) return true

  return SEARCH_SIGNALS.some(s => t.includes(s))
}

// ─── مُصنِّف ذكي: Wikipedia أم Pinterest؟ ────────────────────────────────────
/**
 * classifyImageQuery — يحلل طلب الصورة ويختار المصدر الأمثل بشكل ذكي.
 *
 * القواعد:
 *  - تاريخ / علم / شخصيات / موسوعي → Wikipedia / Wikimedia
 *  - تصميم / ديكور / موضة / إلهام / إبداع → Pinterest
 *  - مزيج أو غامض → mixed (كلا المصدرين)
 *
 * @param {string} query - طلب المستخدم
 * @returns {{ source: 'pinterest', category: string, confidence: number }}
 */
export function classifyImageQuery(query) {
  const t = String(query || '').toLowerCase()

  // ── إشارات Wikipedia / موسوعي ─────────────────────────────────────────────
  const WIKI_SIGNALS = [
    // تاريخ
    'تاريخ', 'ثورة', 'حرب', 'معركة', 'استقلال', 'استعمار', 'عصور', 'حضارة', 'قديم', 'أثري',
    'historical', 'history', 'ancient', 'war', 'revolution', 'civilization', 'heritage',
    'historique', 'guerre', 'révolution',
    // علم وطبيعة
    'كوكب', 'نجم', 'مجرة', 'فضاء', 'حيوان', 'نبات', 'تشريح', 'علمي', 'بيولوجيا', 'فيزياء',
    'planet', 'galaxy', 'science', 'biology', 'anatomy', 'nature', 'animal', 'species',
    // شخصيات موسوعية
    'رئيس', 'ملك', 'رائد', 'فيلسوف', 'عالم', 'مخترع', 'شاعر',
    'president', 'king', 'philosopher', 'scientist', 'inventor', 'leader',
    // جغرافيا وأماكن
    'خريطة', 'جغرافيا', 'جبل', 'نهر', 'بحيرة', 'صحراء', 'غابة', 'مدينة تاريخية',
    'map', 'geography', 'mountain', 'river', 'desert', 'forest',
    // الجزائر تاريخ وثقافة
    'الثورة الجزائرية', 'مجاهد', 'ثورة نوفمبر', 'استعمار فرنسا', 'جيش التحرير',
    'قصبة الجزائر', 'تيمقاد', 'تيبازة', 'جميلة', 'مقام الشهيد',
    // رياضة موسوعية
    'كأس العالم', 'أولمبياد', 'تاريخ الرياضة', 'world cup history', 'olympics',
  ]

  // ── إشارات Pinterest / إبداعي ─────────────────────────────────────────────
  const PIN_SIGNALS = [
    // ديكور وتصميم
    'ديكور', 'تصميم داخلي', 'غرفة', 'مطبخ', 'حمام', 'صالون', 'أثاث', 'فيلا', 'شقة', 'منزل',
    'decor', 'interior design', 'room', 'furniture', 'kitchen', 'living room', 'bedroom', 'bathroom',
    'villa', 'apartment', 'house design', 'home design',
    'décoration', 'intérieur', 'salon', 'chambre', 'cuisine',
    // موضة وأزياء
    'موضة', 'أزياء', 'ملابس', 'إطلالة', 'ستايل', 'تنسيق', 'لوك', 'فستان', 'عباية',
    'fashion', 'style', 'outfit', 'clothing', 'dress', 'look', 'trend', 'wear',
    'mode', 'tenue', 'robe', 'style vestimentaire',
    // فن وإبداع
    'فن', 'لوحة', 'رسم', 'جرافيك', 'ملصق', 'خلفية', 'والبيبر', 'أيقونة', 'شعار',
    'art', 'painting', 'drawing', 'graphic', 'poster', 'wallpaper', 'icon', 'logo',
    'artwork', 'illustration', 'digital art',
    // هندسة معمارية وعمران
    'عمارة', 'معمار', 'واجهة', 'فيلا حديثة', 'منزل حديث', 'مبنى', 'تصميم معماري',
    'architecture', 'facade', 'modern house', 'building design',
    // إلهام وأفكار
    'أفكار', 'إلهام', 'وحي', 'مقترحات', 'inspiration', 'ideas', 'creative', 'concept',
    'idées', 'inspiration', 'créatif',
    // جمال وعناية
    'مكياج', 'شعر', 'تسريحة', 'جمال', 'عناية', 'بشرة', 'nail', 'ظافر',
    'makeup', 'hairstyle', 'beauty', 'skincare', 'hair', 'nails',
    // طعام وطبخ (جماليات)
    'وصفة', 'تزيين', 'كيك', 'حلويات', 'تصوير الطعام',
    'recipe presentation', 'food photography', 'cake design', 'dessert',
    // منتجات وتسوق
    'منتج', 'إكسسوار', 'حقيبة', 'ساعة', 'مجوهرات',
    'product', 'accessory', 'bag', 'watch', 'jewelry',
  ]

  const wikiScore = WIKI_SIGNALS.filter(s => t.includes(s)).length
  const pinScore  = PIN_SIGNALS.filter(s => t.includes(s)).length

  // ── v1.1: الصور النادرة/الأرشيفية → mixed دائماً (Pinterest + Wikimedia) ──
  // Pinterest يحتوي على أرشيف ضخم من الصور التاريخية النادرة بالإضافة لـ Wikimedia
  const RARE_HISTORICAL_RE = /(?:نادر|نادرة|أرشيف|أرشيفي|أرشيفية|قديم|قديمة|عتيق|عتيقة|خمر|vintage|rare|archive|old photos?|historical photos?|photos? rares?|anciennes?)/i
  const isRareHistorical = RARE_HISTORICAL_RE.test(query)

  let category, confidence

  // Pinterest is the default provider; classification remains useful metadata.
  if (isRareHistorical) {
    category = 'rare-historical'
    confidence = 85
  } else if (wikiScore > 0 && pinScore === 0) {
    category = 'encyclopedic'
    confidence = Math.min(95, 60 + wikiScore * 10)
  } else if (pinScore > 0 && wikiScore === 0) {
    category = 'creative'
    confidence = Math.min(95, 60 + pinScore * 10)
  } else if (wikiScore > 0 && pinScore > 0) {
    category = 'mixed'
    confidence = 55
  } else {
    category = 'general'
    confidence = 40
  }

  return { source: 'pinterest', category, confidence, wikiScore, pinScore, isRareHistorical }
}

// ─── تنسيق الرد بـ Markdown ──────────────────────────────────────────────────
/**
 * formatImageSearchResponse — بناء رد مرئي منسق بالـ Markdown
 */
// ─── Pinterest multi-query export (used by AI DZ img PRO) ────────────────────
export { searchPinterest }

export function formatImageSearchResponse({ images, query, originalQuery, translated, preferredSource }) {
  if (!images || images.length === 0) {
    const queryText = originalQuery || query || ''
    const pinterestRequested = preferredSource === 'pinterest' || classifyImageQuery(queryText).source === 'pinterest'
    const manualSearch = pinterestRequested
      ? '🔎 جرّب البحث مباشرة على [Pinterest](https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(queryText) + ')'
      : '🔎 يمكنك البحث يدوياً على [Wikimedia Commons](https://commons.wikimedia.org/w/index.php?search=' + encodeURIComponent(queryText) + '&ns6=1)'
    return [
      '🔍 **لم أجد صوراً مطابقة لـ:** "' + queryText + '"',
      '',
      'قد يكون السبب:',
      '- الطلب دقيق جداً، جرّب كلمات أبسط',
      '- المصدر المختار لم يُرجع نتائج متاحة الآن',
      '',
      manualSearch,
    ].join('\n')
  }

  const lines = [
    `🖼️ **نتائج البحث عن:** "${originalQuery}"${translated ? `\n> *(بحث بالإنجليزية: ${query})*` : ''}`,
    '',
  ]

  const SOURCE_ICON = {
    'Pinterest':        '📌',
    'Wikimedia Commons':'🌐',
    'Openverse':        '🔓',
  }

  images.forEach((img, i) => {
    lines.push(`### ${i + 1}. ${img.title}`)
    lines.push(`![${img.title}](${img.url})`)
    const icon = SOURCE_ICON[img.source] || '📁'
    const parts = [`${icon} ${img.source}`]
    if (img.creator) parts.push(`📷 ${img.creator.slice(0, 60)}`)
    if (img.license && img.license !== 'Pinterest') parts.push(`⚖️ ${img.license}`)
    lines.push(`*${parts.join(' · ')}*`)
    lines.push(`[🔗 المصدر](${img.sourceUrl})`)
    lines.push('')
  })

  return lines.join('\n')
}
