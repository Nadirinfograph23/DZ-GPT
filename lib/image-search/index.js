// DZ Agent — Image Search Engine v1.1
// بحث عن صور حقيقية (مجاني وغير محدود)
// Free & unlimited: Wikimedia Commons + Openverse + Pinterest + Bing + DuckDuckGo
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
  'صور نادرة': 'rare archive historical photos',
  'صور قديمة': 'old vintage historical photos',
  'صور أرشيفية': 'archive historical photos',
  'أرشيف': 'archive historical photos',
  'نادرة': 'rare',
  // ── شهداء وقادة الثورة الجزائرية ────────────────────────────────────────
  'الشهيد العربي بن مهيدي': 'Larbi Ben M\'hidi Algerian martyr FLN rare photos',
  'العربي بن مهيدي': 'Larbi Ben M\'hidi Algeria independence hero photos',
  'لعربي بن مهيدي': 'Larbi Ben M\'hidi Algeria martyr',
  'بن مهيدي': 'Larbi Ben M\'hidi Algeria FLN leader 1957',
  'مصطفى بن بولعيد': 'Mustapha Ben Boulaid Algeria Aures revolution martyr',
  'بن بولعيد': 'Ben Boulaid Algeria Aures independence',
  'عبان رمضان': 'Abane Ramdane Algeria FLN Soummam Congress',
  'عبان': 'Abane Ramdane Algeria FLN',
  'ديدوش مراد': 'Didouche Mourad Algeria martyr north Constantine',
  'ديدوش': 'Didouche Mourad Algeria revolution',
  'زيغود يوسف': 'Zighoud Youcef Algeria northeast revolution martyr',
  'زيغود': 'Zighoud Youcef Algeria',
  'علي عمار': 'Ali la Pointe Casbah Algiers Battle Algeria',
  'علي لابوانت': 'Ali la Pointe Casbah Algiers Battle Algeria',
  'لالة فاطمة': 'Lalla Fatma N\'Soumer Algeria Kabylie resistance',
  'فاطمة نسومر': 'Lalla Fatma N\'Soumer Algeria Kabylie resistance',
  'جميلة بوحيرد': 'Djamila Bouhired Algeria woman fighter FLN hero',
  'جميلة بوعزة': 'Djamila Bouazza Algeria woman resistance FLN',
  'زهرة ظريف': 'Zohra Drif Algeria woman FLN Battle Algiers',
  'حسيبة بن بوعلي': 'Hassiba Ben Bouali Algeria woman martyr Casbah',
  'محمد بوضياف': 'Mohamed Boudiaf Algeria president FLN founder rare photos',
  'بوضياف': 'Mohamed Boudiaf Algeria president',
  'هواري بومدين': 'Houari Boumediene Algeria president rare photos',
  'بومدين': 'Houari Boumediene Algeria president historical',
  'أحمد بن بلة': 'Ahmed Ben Bella Algeria first president FLN',
  'بن بلة': 'Ahmed Ben Bella Algeria president',
  'كريم بلقاسم': 'Krim Belkacem Algeria FLN leader Kabylie',
  'بلقاسم': 'Krim Belkacem Algeria FLN',
  'محمد شعلان': 'Mohamed Chaallal Algeria',
  'رابح بيطاط': 'Rabah Bitat Algeria FLN founder',
  'بيطاط': 'Rabah Bitat Algeria FLN',
  'حسين آيت أحمد': 'Hocine Ait Ahmed Algeria Kabylie FFS leader',
  'آيت أحمد': 'Hocine Ait Ahmed Algeria',
  'معركة الجزائر': 'Battle of Algiers 1956 1957 Casbah FLN photos',
  'معركة بن مهيدي': 'Battle Algiers Larbi Ben M\'hidi 1957',
  'مجزرة سطيف': 'Setif massacre 1945 Algeria French colonial',
  'مجزرة خراطة': 'Guelma Kherrata massacre 1945 Algeria',
  'مجزرة 8 مايو': 'May 8 1945 Algeria massacre Setif Guelma',
  'عملية الحشيش': 'Operation Harvest Algeria independence war',
  'اتفاقية إيفيان': 'Evian Accords 1962 Algeria independence',
  'مؤتمر الصومام': 'Soummam Congress 1956 Algeria FLN',
  // ── شهداء عامة ──────────────────────────────────────────────────────────
  'الشهيد': 'Algerian martyr independence',
  'الشهداء': 'Algerian martyrs independence war photos',
  'البطل': 'Algerian hero independence',
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

// تطبيع الهمزة لتحسين مطابقة الأنماط (إ/أ/آ → ا) — يحل مشكلة "إبحث" vs "ابحث"
function normalizeHamza(text) {
  return text.replace(/[إأآ]/g, 'ا')
}

// استخراج الموضوع الفعلي من طلب البحث (بإزالة عبارات البحث)
// v1.2: يتعامل مع "صور [صفة] عن/من/حول X" + تطبيع الهمزة
const SEARCH_PREFIXES_RE = /^(ابحث\s*(عن|على)\s*(صور?|فوتو)?|جيبلي\s*(صور?|فوتو)?|اجلب\s*(صور?|فوتو)?|هاتلي\s*(صور?|فوتو)?|ارني\s*(صور?|فوتو)?|بحث\s*(عن)?\s*(صور?)?|اريد\s*(صور?|فوتو)\s*ل?|دور\s*(على)?\s*(صور?)?|find\s*(a\s*)?(photo|picture|image|photos|pictures|images)\s*(of)?|search\s*(for)?\s*(a\s*)?(photo|picture|image|photos|pictures)?|get\s*(me\s*)?(a\s*)?(photo|picture|image|photos|pictures)\s*(of)?|show\s*(me\s*)?(a\s*)?(photo|picture|image|photos|pictures)\s*(of)?|bring\s*(me\s*)?(a?\s*)?(photo|picture)?|fetch\s*(image|photo|picture)|trouve\s*(une?\s*)?(photo|image)?|cherche\s*(une?\s*)?(photo|image)?|montre\s*(moi\s*)?(une?\s*)?(photo|image)?|صور\s*حقيقية|صورة\s*حقيقية|صور\s*واقعية|حوس\s*على\s*(صور?)?|صور\s*(نادرة|قديمة|تاريخية|ارشيفية|اصيلة|حقيقية|جميلة|مذهلة|رائعة|عجيبة|ملونة|ابيض\s*واسود)\s*(عن|من|حول|ل|لـ|تاع)?|صورة\s*(نادرة|قديمة|تاريخية|ارشيفية)\s*(عن|من|حول|ل)?)\s*/i

/**
 * استخراج الموضوع من الطلب وترجمته بدون AI
 * مثال: "جيبلي صورة مقام الشهيد" → "Maqam Echahid Algiers memorial"
 */
// إزالة لواحق "X بالصور" من نهاية الجملة
const SEARCH_SUFFIXES_RE = /\s*(بالصور|بصور|بالصورة|مع\s*الصور|مع\s*صور|وصور|وبالصور)\s*$/i

function extractAndTranslateStatic(rawQuery) {
  // v1.2: تطبيع الهمزة قبل الـ regex (إبحث → ابحث) لتجنب التفويت
  const normalizedQuery = normalizeHamza(rawQuery)
  const afterPrefix = normalizedQuery.replace(SEARCH_PREFIXES_RE, '').trim()
  // استخدام الموضوع من الاستعلام الأصلي (بنفس طول النص بعد التطبيع)
  const rawAfterPrefix = rawQuery.slice(rawQuery.length - afterPrefix.length).trim()
  const subject = (rawAfterPrefix || afterPrefix).replace(SEARCH_SUFFIXES_RE, '').trim()
  // تفعيل إذا تغيّرت الجملة بعد الحذف
  if (!subject || normalizeHamza(subject) === normalizedQuery.trim()) return null

  // ── إزالة حروف الجر/التعريف من بداية الموضوع (للشهيد X → X) ──────────────
  const subjectClean = subject
    .replace(/^(للشهيد|للبطل|للمجاهد|للقائد|لشهيد|لبطل|لمجاهد|للزعيم)\s+/i, '')
    .replace(/^لل?/, '') // يزيل "لل" أو "ل" في أول الكلمة
    .trim() || subject

  // بحث في القاموس الثابت (ترتيب: الأطول أولاً للأدق)
  let translated = subjectClean
  let matchedEntries = []
  const dictEntries = Object.entries(STATIC_DICT).sort((a, b) => b[0].length - a[0].length)
  for (const [ar, en] of dictEntries) {
    if (translated.includes(ar) && en) {
      translated = translated.replace(ar, en)
      matchedEntries.push(ar)
    }
  }

  const matched = matchedEntries.length > 0

  if (matched) {
    // تحقق: هل لا يزال هناك نص عربي مهم (اسم شخص مثلاً) لم يُترجم؟
    const arabicRemaining = (translated.match(/[\u0600-\u06FF\u0750-\u077F]{3,}/g) || [])
    if (arabicRemaining.length > 0) {
      // بقي نص عربي → لا نستخدم الترجمة الجزئية، نتركها للـ AI
      // لكن نعيد الموضوع المنظّف ليذهب للـ AI
      return { subject: subjectClean, english: null }
    }
    translated = translated.replace(/[\u0600-\u06FF\u0750-\u077F]+/g, ' ').replace(/\s+/g, ' ').trim()
  }

  return {
    subject: subjectClean,
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
      headers: { 'User-Agent': 'DZ-GPT-Agent/2.0 (https://dzagent.app)' },
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

// ─── Pinterest Search (AJAX endpoint — لا يحتاج Chrome أو API key) ───────────
/**
 * searchPinterest — يستخدم endpoint الداخلي لـ Pinterest (resource/BaseSearchResource)
 * يعمل بـ fetch مباشرة بدون متصفح.
 */
async function searchPinterest(query, limit = 8) {
  try {
    const data = JSON.stringify({
      options: { query, scope: 'pins', page_size: Math.min(limit * 2, 25) },
      context: {},
    })
    const params = new URLSearchParams({
      source_url: `/search/pins/?q=${encodeURIComponent(query)}`,
      data,
      _: String(Date.now()),
    })
    const res = await fetch(
      `https://www.pinterest.com/resource/BaseSearchResource/get/?${params}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest',
          'X-Pinterest-PWS-Handler': 'www/[locale=en]/search/pins.js',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`,
        },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (!res.ok) return []
    const json = await res.json()
    const results = json?.resource_response?.data?.results || []

    const seen = new Set()
    const images = []
    for (const pin of results) {
      if (images.length >= limit) break
      const imgs = pin?.images || {}
      const imgObj = imgs['736x'] || imgs['474x'] || imgs['236x']
      if (!imgObj?.url) continue
      if (seen.has(imgObj.url)) continue
      seen.add(imgObj.url)

      const rawTitle = (typeof pin.title === 'object' ? pin.title?.text : pin.title) || pin.alt_text || query
      images.push({
        url: imgObj.url,
        fullUrl: imgObj.url,
        title: String(rawTitle).replace(/<[^>]+>/g, '').slice(0, 120) || query,
        source: 'Pinterest',
        sourceUrl: pin.link
          ? `https://www.pinterest.com/pin/${pin.id || ''}/`
          : `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
        width: imgObj.width || 736,
        height: imgObj.height || 0,
        license: 'Pinterest',
        creator: pin.pinner?.full_name || '',
      })
    }
    console.log(`[ImageSearch:Pinterest] "${query.slice(0, 60)}" → ${images.length} results`)
    return images
  } catch (e) {
    console.warn('[ImageSearch:Pinterest]', e.message?.slice(0, 80))
    return []
  }
}

// ─── Bing Images (مجاني بدون مفتاح — أشمل وأسرع من Pinterest) ───────────────
async function searchBing(query, limit = 8) {
  try {
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(limit * 2, 30)),
      mmasync: '1',
      adlt: 'off',
      first: '1',
    })
    const res = await fetch(
      `https://www.bing.com/images/async?${params}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal: AbortSignal.timeout(9000),
      }
    )
    if (!res.ok) return []
    const html = await res.text()

    const images = []
    const seen = new Set()

    // استخراج بيانات الصور من JSON المضمّن في HTML
    const mediaUrlRe = /"murl":"(https?:[^"]+)"/g
    const thumbRe    = /"turl":"(https?:[^"]+)"/g
    const titleRe    = /"t":"([^"]+)"/g
    const hostRe     = /"purl":"(https?:[^"]+)"/g

    const thumbs  = []
    const titles  = []
    const hosts   = []
    let m

    while ((m = thumbRe.exec(html)) !== null)  thumbs.push(m[1])
    while ((m = titleRe.exec(html)) !== null)  titles.push(m[1].replace(/\\u[\da-f]{4}/gi, c => String.fromCharCode(parseInt(c.slice(2), 16))))
    while ((m = hostRe.exec(html)) !== null)   hosts.push(m[1])

    let idx = 0
    while ((m = mediaUrlRe.exec(html)) !== null && images.length < limit) {
      const imgUrl = m[1].replace(/\\u[\da-f]{4}/gi, c => String.fromCharCode(parseInt(c.slice(2), 16)))
      if (!imgUrl || seen.has(imgUrl) || /\.svg($|\?)/i.test(imgUrl)) { idx++; continue }
      seen.add(imgUrl)
      images.push({
        url: thumbs[idx] || imgUrl,
        fullUrl: imgUrl,
        title: (titles[idx] || query).slice(0, 120),
        source: 'Bing',
        sourceUrl: hosts[idx] || `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`,
        width: 0,
        height: 0,
        license: 'Web',
        creator: '',
      })
      idx++
    }
    console.log(`[ImageSearch:Bing] "${query.slice(0, 60)}" → ${images.length} results`)
    return images
  } catch (e) {
    console.warn('[ImageSearch:Bing]', e.message?.slice(0, 80))
    return []
  }
}

// ─── DuckDuckGo Images (مجاني بدون مفتاح — بحث حر بالويب) ──────────────────
async function searchDuckDuckGo(query, limit = 8) {
  try {
    // الخطوة 1: الحصول على رمز vqd
    const initRes = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!initRes.ok) return []
    const html = await initRes.text()
    const vqdMatch = html.match(/vqd=(['"]?)([^'"&\s]+)\1/) || html.match(/vqd%3D([^%&"'\s]+)/)
    const vqd = vqdMatch?.[2] || vqdMatch?.[1]
    if (!vqd) return []

    // الخطوة 2: جلب الصور
    const params = new URLSearchParams({ l: 'us-en', o: 'json', q: query, vqd, f: ',,,,,', p: '1' })
    const imgRes = await fetch(`https://duckduckgo.com/i.js?${params}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!imgRes.ok) return []
    const data = await imgRes.json()
    const results = (data.results || [])
      .filter(r => r.image && !r.image.includes('.svg'))
      .slice(0, limit)
      .map(r => ({
        url: r.thumbnail || r.image,
        fullUrl: r.image,
        title: (r.title || query).replace(/<[^>]+>/g, '').slice(0, 120),
        source: 'DuckDuckGo',
        sourceUrl: r.url || r.image,
        width: r.width || 0,
        height: r.height || 0,
        license: 'Web',
        creator: r.source || '',
      }))
    console.log(`[ImageSearch:DuckDuckGo] "${query.slice(0, 60)}" → ${results.length} results`)
    return results
  } catch (e) {
    console.warn('[ImageSearch:DuckDuckGo]', e.message?.slice(0, 80))
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
export async function searchImages({ query, aiGenerate, limit = 6, preferredSource = null }) {
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
      // تحقق: هل لا يزال هناك نص عربي مهم لم يُترجم (اسم شخص مثلاً)؟
      const arabicRemaining = (directMatch.match(/[\u0600-\u06FF\u0750-\u077F]{3,}/g) || [])
      if (arabicRemaining.length > 0) {
        // بقي عربي مهم → لا نستخدم الترجمة الجزئية، نرسل الطلب الأصلي للـ AI
        console.log(`[ImageSearch] Partial dict match, Arabic name remains → routing to AI: "${query.slice(0, 60)}"`)
        // searchQuery يبقى = query (أصلي) لتمريره للـ AI في الخطوة التالية
      } else {
        // حذف ما تبقى من عربية (أدوات، حروف جر) وتنظيف النص
        const cleaned = directMatch.replace(/[\u0600-\u06FF\u0750-\u077F]+/g, ' ').replace(/\s+/g, ' ').trim()
        if (cleaned && !/[\u0600-\u06FF]/.test(cleaned)) {
          searchQuery = cleaned
          translated = true
          console.log(`[ImageSearch] Direct dict: "${query.slice(0, 60)}" → "${searchQuery}"`)
        }
      }
    }
  }

  // الخطوة 2: إذا لا يزال بالعربية، نحاول بالـ AI (إن توفّر)
  if (/[\u0600-\u06FF]/.test(searchQuery)) {
    try {
      if (typeof aiGenerate === 'function') {
        // timeout 8s للترجمة — لا ننتظر أكثر
        const trPromise = translateForImage({ aiGenerate, prompt: searchQuery })
        const tr = await Promise.race([
          trPromise,
          new Promise((_, rej) => setTimeout(() => rej(new Error('translate timeout')), 8000)),
        ])
        if (tr.translated && tr.english && !/[\u0600-\u06FF]/.test(tr.english)) {
          searchQuery = tr.english
          translated = true
          console.log(`[ImageSearch] AI translate: "${query.slice(0, 60)}" → "${searchQuery.slice(0, 60)}"`)
        }
      }
    } catch (trErr) {
      console.warn('[ImageSearch] AI translate failed:', trErr.message?.slice(0, 60))
    }
  }

  // الخطوة 3 (جديدة): fallback ذكي — إذا لا يزال عربياً بعد كل المحاولات
  // نستخرج الكلمات المهمة ونضيف "Algeria" لضمان نتائج أفضل على Bing/DuckDuckGo
  if (/[\u0600-\u06FF]/.test(searchQuery)) {
    // إزالة كلمات البحث التي ليست اسم الشخص/الشيء (ابحث، صور، نادرة...)
    const noise = /(?:ابحث|بحث|عن|صور|صورة|نادرة|قديمة|تاريخية|أرشيفية|جيبلي|هاتلي|وريني|أريد|اريد)\s*/gi
    const stripped = searchQuery.replace(noise, '').trim()
    if (stripped.length > 2) {
      // أبقِ على النص العربي لكن أضف "Algeria site:commons.wikimedia.org OR site:pinterest.com"
      // هذا يُحسّن نتائج Bing على الأقل
      searchQuery = `${stripped} Algeria`
      console.log(`[ImageSearch] Smart fallback: "${query.slice(0, 60)}" → "${searchQuery}"`)
    }
  }

  // ── تحديد المصدر المفضّل تلقائياً إذا لم يُحدَّد ─────────────────────────
  let resolvedSource = preferredSource
  if (!resolvedSource) {
    const classification = classifyImageQuery(query)
    resolvedSource = classification.source
    console.log(`[ImageSearch] Auto-classified: source=${resolvedSource} category=${classification.category} confidence=${classification.confidence}%`)
  }

  // ── بحث متوازٍ في المصادر بترتيب يعتمد على resolvedSource ────────────────
  const [bingRes, ddgRes, pinterestRes, wikiRes, openRes] = await Promise.allSettled([
    searchBing(searchQuery, limit),
    searchDuckDuckGo(searchQuery, limit),
    searchPinterest(searchQuery, limit),
    searchWikimedia(searchQuery, limit),
    searchOpenverse(searchQuery, Math.ceil(limit / 2)),
  ])

  const bing      = bingRes.status      === 'fulfilled' ? bingRes.value      : []
  const ddg       = ddgRes.status       === 'fulfilled' ? ddgRes.value       : []
  const pinterest = pinterestRes.status === 'fulfilled' ? pinterestRes.value : []
  const wiki      = wikiRes.status      === 'fulfilled' ? wikiRes.value      : []
  const openverse = openRes.status      === 'fulfilled' ? openRes.value      : []

  // ── ترتيب المصادر بناءً على التصنيف الذكي ────────────────────────────────
  // Wikipedia أولاً للمحتوى الموسوعي، Pinterest أولاً للمحتوى الإبداعي
  let sources
  if (resolvedSource === 'wikipedia') {
    sources = [wiki, openverse, bing, ddg, pinterest]
    console.log(`[ImageSearch] Mode=WIKIPEDIA: prioritizing Wikimedia + Openverse`)
  } else if (resolvedSource === 'pinterest') {
    sources = [pinterest, bing, ddg, wiki, openverse]
    console.log(`[ImageSearch] Mode=PINTEREST: prioritizing Pinterest + Bing`)
  } else {
    sources = [bing, ddg, pinterest, wiki, openverse]
    console.log(`[ImageSearch] Mode=MIXED: all sources balanced`)
  }

  // دمج النتائج: Bing أولاً (أشمل) ثم DuckDuckGo ثم Pinterest ثم Wikimedia ثم Openverse
  let merged = []
  let i = 0
  while (merged.length < limit) {
    let added = false
    for (const src of sources) {
      if (src[i] && merged.length < limit) {
        merged.push(src[i])
        added = true
      }
    }
    if (!added) break
    i++
  }
  // إذا لم نصل للحد بالتناوب، أضف الباقي بالترتيب
  for (const src of sources) {
    for (const img of src) {
      if (merged.length >= limit) break
      if (!merged.includes(img)) merged.push(img)
    }
  }

  // ── إذا لم تظهر نتائج بالإنجليزية، نحاول بالطلب الأصلي ─────────────────
  if (merged.length === 0 && translated) {
    console.log(`[ImageSearch] Retry with original: "${query.slice(0, 60)}"`)
    const [ddgO, wikiO, openO, pinO] = await Promise.allSettled([
      searchDuckDuckGo(query, limit),
      searchWikimedia(query, limit),
      searchOpenverse(query, Math.ceil(limit / 2)),
      searchPinterest(query, limit),
    ])
    const dO = ddgO.status  === 'fulfilled' ? ddgO.value  : []
    const wO = wikiO.status === 'fulfilled' ? wikiO.value : []
    const oO = openO.status === 'fulfilled' ? openO.value : []
    const pO = pinO.status  === 'fulfilled' ? pinO.value  : []
    merged = [...dO, ...pO, ...wO, ...oO].slice(0, limit)
    if (merged.length > 0) translated = false
  }

  const result = {
    images: merged.slice(0, limit),
    query: searchQuery,
    originalQuery: query,
    translated,
    total: merged.length,
    preferredSource: resolvedSource,
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
  // تطبيع الهمزة قبل الفحص (إبحث → ابحث، أريد → اريد ...)
  const t = normalizeHamza(String(query || '')).toLowerCase()

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

  // Pinterest/Bing/platform keywords — دائماً بحث عن صور
  if (/(?:pinterest|بينتريست|بنتريست)/i.test(query)) return true
  if (/(?:صور|photos?|images?)\s*.{0,30}(?:pinterest|بينتريست|bing|google\s*images?)/i.test(query)) return true
  if (/(?:pinterest|بينتريست).{0,30}(?:صور|photos?|images?|ديكور|أزياء|موضة|وصفة|طبخ|تصميم)/i.test(query)) return true

  // ── v1.1: أنماط Regex للتعامل مع "صور + صفة + عن/من/حول" ─────────────────
  // المشكلة: "صور نادرة عن الثورة" لا تتطابق مع "صور عن" بسبب كلمة "نادرة" بينهما
  // الحل: regex يمرر أي عدد من الكلمات بين "صور" والموضوع
  const IMAGE_REGEX_PATTERNS = [
    // صور [صفة اختيارية] عن/من/حول/تاع X
    /صور\s+(?:نادرة|قديمة|تاريخية|أرشيفية|أصيلة|حقيقية|جميلة|مذهلة|رائعة|ملونة|أبيض|كلاسيكية|عتيقة|خمر|فنية|وثائقية|أصلية)?\s*(?:عن|من|حول|لـ?|تاع|ديال)\s+\S/i,
    // photos/images + adjective + of
    /(?:rare|old|vintage|historical|archive|ancient|antique|classic)\s+(?:photos?|images?|pictures?)\s+(?:of|about|from)\s+\S/i,
    /(?:photos?|images?|pictures?)\s+(?:of|about|from)\s+\S/i,
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
 * @returns {{ source: 'wikipedia'|'pinterest'|'mixed', category: string, confidence: number }}
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

  let source, category, confidence

  if (isRareHistorical) {
    // الصور النادرة: ابحث في كلا المصدرين — Pinterest فيه أرشيف تاريخي ضخم
    source = 'mixed'
    category = 'rare-historical'
    confidence = 85
  } else if (wikiScore > 0 && pinScore === 0) {
    source = 'wikipedia'
    category = 'encyclopedic'
    confidence = Math.min(95, 60 + wikiScore * 10)
  } else if (pinScore > 0 && wikiScore === 0) {
    source = 'pinterest'
    category = 'creative'
    confidence = Math.min(95, 60 + pinScore * 10)
  } else if (wikiScore > 0 && pinScore > 0) {
    source = 'mixed'
    category = 'mixed'
    confidence = 55
  } else {
    source = 'mixed'
    category = 'general'
    confidence = 40
  }

  return { source, category, confidence, wikiScore, pinScore, isRareHistorical }
}

// ─── تنسيق الرد بـ Markdown ──────────────────────────────────────────────────
/**
 * formatImageSearchResponse — بناء رد مرئي منسق بالـ Markdown
 */
// ─── Pinterest multi-query export (used by AI DZ img PRO) ────────────────────
export { searchPinterest }

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

  const SOURCE_ICON = {
    'DuckDuckGo':       '🦆',
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
