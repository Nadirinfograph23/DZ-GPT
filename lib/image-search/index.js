// DZ Agent — Image Search Engine v1.0
// بحث عن صور حقيقية (مجاني وغير محدود)
// Free & unlimited: Wikimedia Commons + Openverse
// هذا الموديول مخصص للبحث عن صور موجودة — وليس لتوليد صور جديدة بالذكاء الاصطناعي

import { translateForImage } from '../dz-v4/translate.js'

// ─── قاموس ترجمة ثابت — مواقع ومعالم جزائرية + مصطلحات عامة ─────────────────
// يعمل بدون مفاتيح AI — يضمن النتائج دائماً
const STATIC_DICT = {
  // معالم جزائرية مشهورة
  'مقام الشهيد': 'Maqam Echahid Algiers memorial',
  'مقام الشهداء': 'Maqam Echahid Algiers memorial',
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
  'كرة القدم': 'football soccer',
  'كروي': 'football soccer ball',
  'مباراة': 'football match game',
  'جماهير': 'football fans stadium',
  'مشجعين': 'football fans supporters',
  // دول وأماكن عامة
  'الجزائر': 'Algeria',
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

// استخراج الموضوع الفعلي من طلب البحث (بإزالة عبارات البحث)
const SEARCH_PREFIXES_RE = /^(ابحث\s*(عن|على)\s*(صور?|فوتو)?|جيبلي\s*(صور?|فوتو)?|أجلب\s*(صور?|فوتو)?|هاتلي\s*(صور?|فوتو)?|أرني\s*(صور?|فوتو)?|ارني\s*(صور?|فوتو)?|بحث\s*(عن)?\s*(صور?)?|أريد\s*(صور?|فوتو)\s*ل?|اريد\s*(صور?|فوتو)\s*ل?|دور\s*(على)?\s*(صور?)?|find\s*(a\s*)?(photo|picture|image|photos|pictures|images)\s*(of)?|search\s*(for)?\s*(a\s*)?(photo|picture|image|photos|pictures)?|get\s*(me\s*)?(a\s*)?(photo|picture|image|photos|pictures)\s*(of)?|show\s*(me\s*)?(a\s*)?(photo|picture|image|photos|pictures)\s*(of)?|bring\s*(me\s*)?(a?\s*)?(photo|picture)?|fetch\s*(image|photo|picture)|trouve\s*(une?\s*)?(photo|image)?|cherche\s*(une?\s*)?(photo|image)?|montre\s*(moi\s*)?(une?\s*)?(photo|image)?|صور\s*حقيقية|صورة\s*حقيقية|صور\s*واقعية|حوس\s*على\s*(صور?)?)\s*/i

/**
 * استخراج الموضوع من الطلب وترجمته بدون AI
 * مثال: "جيبلي صورة مقام الشهيد" → "Maqam Echahid Algiers memorial"
 */
function extractAndTranslateStatic(rawQuery) {
  // إزالة عبارات البحث من البداية
  const subject = rawQuery.replace(SEARCH_PREFIXES_RE, '').trim()
  if (!subject || subject === rawQuery.trim()) return null

  // بحث في القاموس الثابت
  let translated = subject
  let matched = false
  for (const [ar, en] of Object.entries(STATIC_DICT)) {
    if (subject.includes(ar) && en) {
      translated = translated.replace(ar, en)
      matched = true
    }
  }

  // إزالة كلمات عربية متبقية إذا وجد ترجمة جزئية
  if (matched) {
    translated = translated.replace(/[\u0600-\u06FF\u0750-\u077F]+/g, ' ').replace(/\s+/g, ' ').trim()
  }

  return {
    subject,
    english: matched && translated && !/[\u0600-\u06FF]/.test(translated) ? translated : null,
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
      page_size: String(limit),
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

// ─── الدالة الرئيسية للبحث عن الصور ──────────────────────────────────────────
/**
 * searchImages — ابحث عن صور حقيقية لأي موضوع.
 * @param {object} opts
 * @param {string} opts.query          - طلب المستخدم (عربي/فرنسي/إنجليزي)
 * @param {Function} opts.aiGenerate   - دالة الذكاء الاصطناعي للترجمة
 * @param {number}  [opts.limit=6]     - عدد الصور المطلوبة
 * @returns {Promise<{images, query, originalQuery, translated, total}>}
 */
export async function searchImages({ query, aiGenerate, limit = 6 }) {
  const cacheKey = query.toLowerCase().trim().slice(0, 200)
  if (CACHE.has(cacheKey)) {
    console.log(`[ImageSearch] Cache HIT: "${cacheKey.slice(0, 60)}"`)
    return CACHE.get(cacheKey)
  }

  // ── ترجمة الطلب إلى الإنجليزية لنتائج أدق ────────────────────────────────
  // الخطوة 1: استخراج الموضوع الفعلي + قاموس ثابت (مجاني، بدون AI، فوري)
  let searchQuery = query
  let translated = false

  const staticResult = extractAndTranslateStatic(query)
  if (staticResult?.english) {
    searchQuery = staticResult.english
    translated = true
    console.log(`[ImageSearch] Static translate: "${query.slice(0, 60)}" → "${searchQuery}"`)
  } else if (staticResult?.subject && staticResult.subject !== query) {
    // استخرجنا الموضوع لكن لم نجد ترجمة — نحاول بالـ AI
    searchQuery = staticResult.subject
  } else {
    // Fallback: بحث مباشر في القاموس على الطلب كاملاً (بدون بادئة مكتشفة)
    // مثال: "صور كأس العالم" → "FIFA World Cup 2026"
    let directMatch = query
    let directMatched = false
    // ترتيب: الأطول أولاً للأدق
    const dictEntries = Object.entries(STATIC_DICT).sort((a, b) => b[0].length - a[0].length)
    for (const [ar, en] of dictEntries) {
      if (directMatch.includes(ar) && en) {
        directMatch = directMatch.replace(ar, en)
        directMatched = true
      }
    }
    if (directMatched) {
      // حذف ما تبقى من عربية (كلمة "صور" وغيرها)
      const cleaned = directMatch.replace(/[\u0600-\u06FF\u0750-\u077F]+/g, ' ').replace(/\s+/g, ' ').trim()
      if (cleaned && !/[\u0600-\u06FF]/.test(cleaned)) {
        searchQuery = cleaned
        translated = true
        console.log(`[ImageSearch] Direct dict: "${query.slice(0, 60)}" → "${searchQuery}"`)
      }
    }
  }

  // الخطوة 2: إذا لا يزال بالعربية، نحاول بالـ AI (إن توفّر)
  if (/[\u0600-\u06FF]/.test(searchQuery)) {
    try {
      if (typeof aiGenerate === 'function') {
        const tr = await translateForImage({ aiGenerate, prompt: searchQuery })
        if (tr.translated && tr.english && !/[\u0600-\u06FF]/.test(tr.english)) {
          searchQuery = tr.english
          translated = true
          console.log(`[ImageSearch] AI translate: "${query.slice(0, 60)}" → "${searchQuery.slice(0, 60)}"`)
        }
      }
    } catch { /* نبقى مع ما لدينا */ }
  }

  // ── بحث متوازٍ في المصدرين ───────────────────────────────────────────────
  const [wikiRes, openRes] = await Promise.allSettled([
    searchWikimedia(searchQuery, limit),
    searchOpenverse(searchQuery, Math.ceil(limit / 2)),
  ])

  const wiki      = wikiRes.status === 'fulfilled' ? wikiRes.value : []
  const openverse = openRes.status === 'fulfilled'  ? openRes.value  : []

  // دمج النتائج: Wikimedia أولاً (جودة أعلى للمعالم)
  let merged = [...wiki]
  for (const img of openverse) {
    if (merged.length >= limit) break
    merged.push(img)
  }

  // ── إذا لم تظهر نتائج بالإنجليزية، نحاول بالطلب الأصلي ─────────────────
  if (merged.length === 0 && translated) {
    console.log(`[ImageSearch] Retry with original: "${query.slice(0, 60)}"`)
    const [wikiO, openO] = await Promise.allSettled([
      searchWikimedia(query, limit),
      searchOpenverse(query, Math.ceil(limit / 2)),
    ])
    const wO = wikiO.status === 'fulfilled' ? wikiO.value : []
    const oO = openO.status  === 'fulfilled' ? openO.value  : []
    merged = [...wO, ...oO].slice(0, limit)
    if (merged.length > 0) translated = false
  }

  const result = {
    images: merged.slice(0, limit),
    query: searchQuery,
    originalQuery: query,
    translated,
    total: merged.length,
  }

  if (merged.length > 0) cachePut(cacheKey, result)
  console.log(`[ImageSearch] "${query.slice(0, 60)}" → ${merged.length} results`)
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
    // دارجة جزائرية
    'جيب صورة', 'دير بحث على صورة', 'حوس على صورة', 'لقا صورة',
    'بغيت صورة', 'نبغي صورة', 'تصاور', 'صوّرلي',
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

  return SEARCH_SIGNALS.some(s => t.includes(s))
}

// ─── تنسيق الرد بـ Markdown ──────────────────────────────────────────────────
/**
 * formatImageSearchResponse — بناء رد مرئي منسق بالـ Markdown
 */
export function formatImageSearchResponse({ images, query, originalQuery, translated }) {
  if (!images || images.length === 0) {
    return [
      `🔍 **لم أجد صوراً مطابقة لـ:** "${originalQuery}"`,
      '',
      'قد يكون السبب:',
      '- الطلب دقيق جداً، جرّب كلمات أبسط',
      '- المعلم أو الموضوع غير موجود في قواعد الصور المجانية',
      '',
      `🔎 يمكنك البحث يدوياً على [Wikimedia Commons](https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(originalQuery)}&ns6=1)`,
    ].join('\n')
  }

  const lines = [
    `🖼️ **نتائج البحث عن:** "${originalQuery}"${translated ? `\n> *(بحث بالإنجليزية: ${query})*` : ''}`,
    '',
  ]

  images.forEach((img, i) => {
    lines.push(`### ${i + 1}. ${img.title}`)
    lines.push(`![${img.title}](${img.url})`)
    const parts = [`📁 ${img.source}`]
    if (img.creator) parts.push(`📷 ${img.creator.slice(0, 60)}`)
    if (img.license) parts.push(`⚖️ ${img.license}`)
    lines.push(`*${parts.join(' · ')}*`)
    lines.push(`[🔗 المصدر](${img.sourceUrl})`)
    lines.push('')
  })

  return lines.join('\n')
}
