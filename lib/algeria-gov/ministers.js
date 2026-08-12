/**
 * lib/algeria-gov/ministers.js
 * نظام التحقق التلقائي من الوزراء والرؤساء الجزائريين
 * Sources: premier-ministre.gov.dz → el-mouradia.dz → fallback static
 * Cache: 24h TTL
 */

const MINISTERS_CACHE = { data: null, fetchedAt: 0 }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

// ─── المصادر الرسمية ──────────────────────────────────────────────────────────
const SOURCES = [
  {
    name: 'premier-ministre.gov.dz',
    url: 'https://www.premier-ministre.gov.dz/ar/gouvernement/membres-du-gouvernement',
    priority: 1,
  },
  {
    name: 'el-mouradia.dz',
    url: 'https://www.el-mouradia.dz/ar/algerie/gouvernement/membres-du-gouvernement',
    priority: 2,
  },
  {
    name: 'algerie.dz',
    url: 'https://www.algerie.dz/ar/gouvernement',
    priority: 3,
  },
]

// ─── رؤساء الجزائر (كاملون) ──────────────────────────────────────────────────
export const ALGERIA_PRESIDENTS = [
  {
    role: 'رئيس الجمهورية',
    name: 'عبد المجيد تبون',
    ministry: 'رئاسة الجمهورية',
    since: 'ديسمبر 2019',
    born: '1945، ندرومة، تلمسان',
    note: 'رئيس الجمهورية الجزائرية الحالي — انتُخب 12 ديسمبر 2019، أُعيد انتخابه سبتمبر 2024',
    source: 'static',
  },
  {
    role: 'رئيس جمهورية (سابق)',
    name: 'عبد العزيز بوتفليقة',
    ministry: 'رئاسة الجمهورية',
    since: '1999–2019',
    born: '1937، وجدة (المغرب) — توفي 17 سبتمبر 2021',
    note: 'استقال بسبب احتجاجات الحراك الشعبي في أبريل 2019. أطول رئيس في تاريخ الجزائر (20 سنة).',
    source: 'static',
  },
  {
    role: 'رئيس دولة مؤقت (سابق)',
    name: 'عبد القادر بن صالح',
    ministry: 'رئاسة الجمهورية',
    since: 'أبريل–ديسمبر 2019',
    born: '1937، عين الصفراء، النعامة — توفي 23 سبتمبر 2021',
    note: 'رئيس مجلس الأمة — تولّى الرئاسة المؤقتة بعد استقالة بوتفليقة.',
    source: 'static',
  },
  {
    role: 'رئيس دولة (سابق)',
    name: 'اليامين زروال',
    ministry: 'رئاسة الجمهورية',
    since: '1994–1999',
    born: '1941، باتنة — توفي 28 مارس 2026، الجزائر',
    note: 'أول رئيس منتخب بالتعددية الحزبية. استقال قبل انتهاء ولايته.',
    source: 'static',
  },
  {
    role: 'رئيس المجلس الأعلى للدولة (سابق)',
    name: 'علي كافي',
    ministry: 'رئاسة الجمهورية',
    since: '1992–1994',
    born: '1928، سكيكدة — توفي 7 أبريل 2013',
    note: 'خلف محمد بوضياف بعد اغتياله. قائد تاريخي في الثورة.',
    source: 'static',
  },
  {
    role: 'رئيس المجلس الأعلى للدولة (سابق — اغتيل)',
    name: 'محمد بوضياف',
    ministry: 'رئاسة الجمهورية',
    since: 'يناير–يونيو 1992',
    born: '23 يونيو 1919، المسيلة — اغتيل 29 يونيو 1992، عنابة',
    note: 'أحد مؤسسي جبهة التحرير الوطني — اغتيل في قسنطينة بعد 6 أشهر من توليه السلطة.',
    source: 'static',
  },
  {
    role: 'رئيس جمهورية (سابق)',
    name: 'الشاذلي بن جديد',
    ministry: 'رئاسة الجمهورية',
    since: '1979–1992',
    born: '14 أبريل 1929، سبيت، عنابة — توفي 8 أكتوبر 2012',
    note: 'قاد إصلاحات التعددية السياسية في 1989. استقال في يناير 1992 بعد انتخابات متنازع عليها.',
    source: 'static',
  },
  {
    role: 'رئيس دولة مؤقت (سابق)',
    name: 'رابح بيطاط',
    ministry: 'رئاسة الجمهورية',
    since: 'ديسمبر 1978–فبراير 1979',
    born: '19 ديسمبر 1925، عين الكبيرة، سطيف — توفي 10 أبريل 2000',
    note: 'رئيس مجلس الشعب الوطني — تولّى الرئاسة المؤقتة بعد وفاة بومدين.',
    source: 'static',
  },
  {
    role: 'رئيس مجلس الثورة والجمهورية (سابق)',
    name: 'هواري بومدين',
    ministry: 'رئاسة الجمهورية',
    since: '1965–1978',
    born: '23 أغسطس 1932، هلياوبة، قالمة — توفي 27 ديسمبر 1978، الجزائر',
    note: 'قاد انقلاباً على بن بلة في 1965. معمار الجزائر الحديثة — تأميم المحروقات 1971.',
    source: 'static',
  },
  {
    role: 'رئيس جمهورية أول (سابق)',
    name: 'أحمد بن بلة',
    ministry: 'رئاسة الجمهورية',
    since: '1963–1965',
    born: '25 ديسمبر 1916، مغنية — توفي 11 أبريل 2012، الجزائر',
    note: 'أول رئيس للجزائر المستقلة. أطيح به بانقلاب بومدين في 1965.',
    source: 'static',
  },
]

// ─── الوزراء الأوائل (رؤساء الحكومة) ────────────────────────────────────────
export const ALGERIA_PRIME_MINISTERS = [
  {
    role: 'وزير أول',
    name: 'سيفي غريب',
    ministry: 'رئاسة الحكومة',
    since: 'أغسطس 2025',
    born: '1973، تبسة',
    note: 'الوزير الأول الحالي منذ 28 أغسطس 2025. خلف نذير العرباوي. دكتوراه في الكيمياء الفيزيائية. كان وزيراً للصناعة (نوفمبر 2024 – أغسطس 2025).',
    source: 'static',
  },
  {
    role: 'وزير أول (سابق)',
    name: 'نذير العرباوي',
    ministry: 'رئاسة الحكومة',
    since: 'نوفمبر 2023 – أغسطس 2025',
    note: 'أُقيل 28 أغسطس 2025. خلف أيمن بن عبد الرحمن.',
    source: 'static',
  },
  {
    role: 'وزير أول (سابق)',
    name: 'أيمن بن عبد الرحمن',
    ministry: 'رئاسة الحكومة',
    since: '2021–2023',
    source: 'static',
  },
  {
    role: 'وزير أول (سابق)',
    name: 'عبد العزيز جراد',
    ministry: 'رئاسة الحكومة',
    since: '2020–2021',
    source: 'static',
  },
  {
    role: 'وزير أول (سابق)',
    name: 'نور الدين بدوي',
    ministry: 'رئاسة الحكومة',
    since: '2017–2019',
    source: 'static',
  },
  {
    role: 'وزير أول (سابق)',
    name: 'عبد المالك سلال',
    ministry: 'رئاسة الحكومة',
    since: '2012–2017',
    source: 'static',
  },
]

// ─── أعضاء حكومة سيفي غريب (سبتمبر 2025 – الآن) ─────────────────────────────
// المصدر: Wikidata + Wikipedia (مُحدَّث يونيو 2026)
export const KNOWN_CURRENT_MINISTERS = [
  // القطاع السيادي
  { role: 'وزير الخارجية والجالية الوطنية بالخارج', name: 'أحمد عطاف', ministry: 'الخارجية', since: '2021', source: 'static' },
  { role: 'وزير الداخلية والجماعات المحلية والتهيئة العمرانية', name: 'إبراهيم مراد', ministry: 'الداخلية', since: '2023', source: 'static' },
  { role: 'وزير العدل حافظ الأختام', name: 'لطفي بوجمعة', ministry: 'العدل', since: '2025', source: 'static' },
  { role: 'وزير المالية', name: 'لعزيز فايد', ministry: 'المالية', since: '2022', source: 'static' },
  // القطاع الاقتصادي
  { role: 'وزير الطاقة والمناجم', name: 'محمد عرقاب', ministry: 'الطاقة', since: '2021', source: 'static' },
  { role: 'وزير التجارة وترقية الصادرات', name: 'الطيب ضيف', ministry: 'التجارة', since: '2023', source: 'static' },
  { role: 'وزير الفلاحة والتنمية الريفية', name: 'ياسين وليد', ministry: 'الفلاحة', since: 'سبتمبر 2025', born: '13 جوان 1993، معسكر', note: 'شغل سابقاً: وزير منتدب (الاقتصاد المعرفي 2020–2022)، وزير الاقتصاد المعرفي (2022–2024)، وزير التكوين والتعليم المهنيين (نوف 2024–أغسطس 2025)', source: 'static' },
  { role: 'وزير الموارد المائية والأمن المائي', name: 'طاهر قردان', ministry: 'الموارد المائية', since: '2023', source: 'static' },
  { role: 'وزير السياحة والصناعة التقليدية', name: 'موسى بن لعزيز', ministry: 'السياحة', since: '2023', source: 'static' },
  // البنية التحتية والسكن
  { role: 'وزير الأشغال العمومية والبنية التحتية', name: 'لخضر رخروخ', ministry: 'الأشغال العمومية', since: '2019', source: 'static' },
  { role: 'وزير الإسكان والعمران والمدينة', name: 'محمد طارق بلعريبي', ministry: 'الإسكان', since: '2021', source: 'static' },
  { role: 'وزير النقل', name: 'سعيد سعيود', ministry: 'النقل', since: '2025', source: 'static' },
  // القطاع الاجتماعي
  { role: 'وزير الصحة', name: 'عبد الحق سايحي', ministry: 'الصحة', since: '2020', source: 'static' },
  { role: 'وزير التربية الوطنية', name: 'عبد الحكيم بلعيد', ministry: 'التربية', since: '2022', source: 'static' },
  { role: 'وزير التعليم العالي والبحث العلمي', name: 'كمال بداري', ministry: 'التعليم العالي', since: '2022', source: 'static' },
  { role: 'وزير التكوين والتعليم المهنيين', name: 'ياسين وليد (2024–2025)', ministry: 'التكوين المهني', since: 'نوف 2024', note: 'ياسين وليد شغل هذا المنصب نوفمبر 2024 – أغسطس 2025 ثم انتقل للفلاحة. المنصب الحالي في حكومة غريب قيد التحقق.', source: 'static' },
  { role: 'وزير الشباب والرياضة', name: 'عبد الرشيد ترار', ministry: 'الشباب والرياضة', since: '2023', source: 'static' },
  { role: 'وزير العمل والتشغيل والضمان الاجتماعي', name: 'فيصل بن طالب', ministry: 'العمل', since: '2023', source: 'static' },
  { role: 'وزير الشؤون الاجتماعية', name: 'كريمة بلعريبي', ministry: 'الشؤون الاجتماعية', since: '2021', source: 'static' },
  // الثقافة والاتصال
  { role: 'وزير الثقافة والفنون', name: 'صورية مولوجي', ministry: 'الثقافة', since: '2025', source: 'static' },
  { role: 'وزير الاتصالات', name: 'زهير بوعمامة', ministry: 'الاتصال', since: 'سبتمبر 2025', source: 'static' },
  // البيئة والدين
  { role: 'وزير البيئة والطاقات المتجددة', name: 'يوسف شاهد', ministry: 'البيئة', since: '2023', source: 'static' },
  { role: 'وزير الشؤون الدينية والأوقاف', name: 'يحيى بويا', ministry: 'الشؤون الدينية', since: '2023', source: 'static' },
  { role: 'وزير البريد والمواصلات السلكية واللاسلكية', name: 'كمال بلجود', ministry: 'البريد', since: '2023', source: 'static' },
  // وزراء سابقون (حكومة العرباوي 2023–2025) — للمرجعية التاريخية
  { role: 'وزير أول (سابق — حكومة العرباوي)', name: 'نذير العرباوي', ministry: 'رئاسة الحكومة', since: '2023–2025', source: 'static' },
  { role: 'وزير العدل (سابق — حكومة العرباوي)', name: 'عمر بلحاج', ministry: 'العدل', since: '2023–2025', source: 'static' },
  { role: 'وزير الفلاحة (سابق — حكومة العرباوي)', name: 'يوسف شرفة', ministry: 'الفلاحة', since: '2023–2025', source: 'static' },
  { role: 'وزير النقل (سابق — حكومة العرباوي)', name: 'صالح أمار', ministry: 'النقل', since: '2023–2025', source: 'static' },
  { role: 'وزير الثقافة (سابق — حكومة العرباوي)', name: 'زينب بن دودة', ministry: 'الثقافة', since: '2020–2025', source: 'static' },
  { role: 'وزير الاتصال (سابق — حكومة العرباوي)', name: 'محمد لعقاب', ministry: 'الاتصال', since: '2020–2025', source: 'static' },
  { role: 'وزير الصناعة ثم وزير أول (سابق بالمنصبين)', name: 'سيفي غريب', ministry: 'رئاسة الحكومة', since: 'نوف 2024–أغسطس 2025 (صناعة)، أغسطس 2025– (وزير أول)', note: 'وزير الصناعة نوف 2024، ثم وزير أول منذ 28 أغسطس 2025', source: 'static' },
  { role: 'وزير التكوين المهني (سابق — حكومة العرباوي الأولى)', name: 'يحيى بوبكر', ministry: 'التكوين المهني', since: '2023–2024', source: 'static' },
  { role: 'وزير الاقتصاد المعرفي والمؤسسات الناشئة (سابق)', name: 'ياسين وليد', ministry: 'الاقتصاد المعرفي', since: '2020–2024', note: 'انتقل لوزارة التكوين والتعليم المهنيين نوفمبر 2024، ثم للفلاحة سبتمبر 2025', source: 'static' },
]

// ─── القائمة الثابتة الموحدة (رؤساء + وزراء) ────────────────────────────────
const KNOWN_STATIC = [
  ...ALGERIA_PRESIDENTS,
  ...ALGERIA_PRIME_MINISTERS,
  ...KNOWN_CURRENT_MINISTERS,
]

// ─── قاموس البحث السريع (الاسم → البيانات) ───────────────────────────────────
// القاعدة: أول إدخال يُحفَظ (الأحدث يأتي أولاً في KNOWN_STATIC — حالي قبل تاريخي)
const GOV_NAME_INDEX = new Map()
for (const person of KNOWN_STATIC) {
  const key = person.name.replace(/\s+/g, ' ').trim()
  // لا نُطغي إدخالاً موجوداً — الأول (الحالي) يُحفَظ
  if (!GOV_NAME_INDEX.has(key)) GOV_NAME_INDEX.set(key, person)
  // مفتاح بدون "ال" في بداية الكلمات
  const keyNorm = key.replace(/^ال|(?<=\s)ال/g, '')
  if (!GOV_NAME_INDEX.has(keyNorm)) GOV_NAME_INDEX.set(keyNorm, person)
}

// ─── أنماط استخراج الوزراء من HTML ────────────────────────────────────────
const MINISTER_PATTERNS = [
  /<(?:h[2-4]|div|p)[^>]*class="[^"]*(?:minister|ministre|wazir|titre|nom|name|role|poste|fonction)[^"]*"[^>]*>([\s\S]{5,200}?)<\/(?:h[2-4]|div|p)>/gi,
  /<tr[^>]*>[\s\S]*?<td[^>]*>([\u0600-\u06FF][^<]{5,80})<\/td>[\s\S]*?<td[^>]*>([\u0600-\u06FF][^<]{10,100})<\/td>/gi,
  /"name"\s*:\s*"([\u0600-\u06FF][^"]{5,60})"\s*,\s*"jobTitle"\s*:\s*"([^"]{10,100})"/g,
]

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractMinistersFromHtml(html, sourceName) {
  const ministers = []
  const seen = new Set()

  const blockRe = /<(?:article|li|div)[^>]*>([\s\S]{30,600}?)<\/(?:article|li|div)>/gi
  let block
  while ((block = blockRe.exec(html)) !== null) {
    const inner = block[1]
    const arabicWords = (inner.match(/[\u0600-\u06FF]{3,}/g) || [])
    if (arabicWords.length < 4) continue

    const text = stripHtml(inner)

    const roleMatch = text.match(
      /((?:وزير(?:ة)?|كاتب(?:ة)?\s+الدولة|رئيس\s+(?:مجلس|الحكومة|الوزراء|الجمهورية|الديوان)|مدير\s+عام|أمين\s+عام|والي|سفير)[\u0600-\u06FF\s،,()]{5,120})/
    )
    if (!roleMatch) continue

    const role = roleMatch[1].trim().replace(/\s+/g, ' ')

    const nameMatch = text.match(
      /(?:^|[\n\r|،,])\s*([\u0600-\u06FF]{2,15}(?:\s+[\u0600-\u06FF]{2,15}){1,4})\s*(?:$|[\n\r|،,])/m
    )
    if (!nameMatch) continue

    const name = nameMatch[1].trim()
    if (name.length < 8 || /^(?:وزير|رئيس|مدير|كاتب|السيد|السيدة)/.test(name)) continue

    const key = `${name}-${role}`.slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)

    ministers.push({
      name,
      role: role.slice(0, 120),
      ministry: role.replace(/^وزير(?:ة)?\s+/i, '').trim().slice(0, 80),
      source: sourceName,
    })
    if (ministers.length >= 50) break
  }

  return ministers
}

async function fetchFromSource(source) {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10000)
    const res = await fetch(source.url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DZ-GPT-Bot/2.0; +https://dzagent.app)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const html = await res.text()
    const ministers = extractMinistersFromHtml(html, source.name)
    if (ministers.length > 0) {
      console.log(`[AlgGov] ✅ ${source.name}: extracted ${ministers.length} ministers`)
      return { ministers, source: source.name, url: source.url }
    }
    return null
  } catch (err) {
    console.warn(`[AlgGov] ⚠️ ${source.name} failed: ${err.message}`)
    return null
  }
}

async function fetchMinistersFromNews() {
  try {
    const query = encodeURIComponent('وزراء الحكومة الجزائرية 2024 2025 تعيين')
    const url = `https://news.google.com/rss/search?q=${query}&hl=ar&gl=DZ&ceid=DZ:ar`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'DZ-GPT-Bot/2.0' },
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const xml = await res.text()
    const items = []
    const itemRe = /<item>([\s\S]*?)<\/item>/g
    let m
    while ((m = itemRe.exec(xml)) !== null && items.length < 10) {
      const titleMatch = m[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)
      const linkMatch = m[1].match(/<link>(.*?)<\/link>/)
      if (titleMatch) {
        items.push({
          title: titleMatch[1].trim(),
          link: linkMatch ? linkMatch[1].trim() : '',
        })
      }
    }
    if (items.length > 0) {
      console.log(`[AlgGov] 📰 News fallback: ${items.length} items about ministers`)
      return { newsItems: items, source: 'Google News RSS', url }
    }
    return null
  } catch (err) {
    console.warn(`[AlgGov] News fallback failed: ${err.message}`)
    return null
  }
}

// ─── الدالة الرئيسية: جلب بيانات الوزراء ─────────────────────────────────────
export async function fetchAlgeriaMinistersData() {
  const now = Date.now()

  if (MINISTERS_CACHE.data && (now - MINISTERS_CACHE.fetchedAt) < CACHE_TTL_MS) {
    const ageMin = Math.floor((now - MINISTERS_CACHE.fetchedAt) / 60000)
    console.log(`[AlgGov] ♻️ Cache hit — age: ${ageMin}min`)
    return { ...MINISTERS_CACHE.data, cached: true, cacheAgeMin: ageMin }
  }

  console.log('[AlgGov] 🔍 Fetching ministers from official sources...')

  for (const source of SOURCES) {
    const result = await fetchFromSource(source)
    if (result && result.ministers.length >= 5) {
      // دمج النتائج المجلوبة مع البيانات الثابتة
      const merged = [...KNOWN_STATIC, ...result.ministers.filter(m =>
        !KNOWN_STATIC.some(k => k.name === m.name)
      )]
      const data = {
        ministers: merged,
        source: result.source,
        sourceUrl: result.url,
        fetchedAt: new Date().toISOString(),
        newsItems: null,
        status: 'scraped',
      }
      MINISTERS_CACHE.data = data
      MINISTERS_CACHE.fetchedAt = now
      return data
    }
  }

  console.log('[AlgGov] ⚠️ All official sources failed — trying news fallback')
  const newsResult = await fetchMinistersFromNews()
  if (newsResult) {
    const data = {
      ministers: KNOWN_STATIC,
      source: `static+news (${newsResult.source})`,
      sourceUrl: newsResult.url,
      fetchedAt: new Date().toISOString(),
      newsItems: newsResult.newsItems,
      status: 'static_with_news',
    }
    MINISTERS_CACHE.data = data
    MINISTERS_CACHE.fetchedAt = now
    return data
  }

  console.log('[AlgGov] 🔒 Using comprehensive static fallback')
  return {
    ministers: KNOWN_STATIC,
    source: 'static (بيانات موثوقة)',
    sourceUrl: 'https://www.premier-ministre.gov.dz',
    fetchedAt: new Date().toISOString(),
    newsItems: null,
    status: 'static_fallback',
  }
}

// ─── بناء نص السياق للـ system prompt ─────────────────────────────────────────
export function buildMinistersContext(data, query = '') {
  // ── دائماً نستخدم البيانات الثابتة كـ fallback حتى لو فشل الجلب المباشر ──
  const effectiveMinisters = data?.ministers?.length ? data.ministers : KNOWN_STATIC

  const presidents = effectiveMinisters.filter(m =>
    m.role.includes('رئيس الجمهورية') || m.role.includes('رئيس دولة') ||
    m.role.includes('رئيس مجلس الثورة') || m.role.includes('رئيس جمهورية')
  )
  // إضافة الرؤساء من قائمة ALGERIA_PRESIDENTS إذا لم تكن ضمن effectiveMinisters
  const allPresidents = presidents.length ? presidents : ALGERIA_PRESIDENTS.filter(m =>
    m.role.includes('رئيس') || m.role.includes('مجلس')
  )

  const primes = effectiveMinisters.filter(m => m.role.includes('وزير أول'))
  const ministers = effectiveMinisters.filter(m =>
    m.role.startsWith('وزير') && !m.role.includes('وزير أول') && !m.role.includes('وزير الجمهورية')
  )

  const sourceInfo = data?.source
    ? `> 📡 المصدر: **[${data.source}](${data.sourceUrl || '#'})** — ${data.fetchedAt ? data.fetchedAt.slice(0, 10) : 'بيانات ثابتة'}${data.cached ? ` *(cache — ${data.cacheAgeMin}د)*` : ''}`
    : `> 📡 المصدر: **بيانات ثابتة موثوقة** — قاعدة بيانات DZ AGENT`

  const isPresidentQuery = /(?:رئيس\s*(?:الجمهورية|السابق|الحالي|الأول|الثاني|الثالث)|رؤساء\s*الجزائر|الرئيس\s*السابق|الرئيس\s*الحالي|من\s*رأس\s*الجزائر|قائمة\s*رؤساء)/i.test(query)
  const isFormerPresident = /(?:السابق|قبل\s*تبون|من\s*كان|رؤساء)/i.test(query) && !/(?:الحالي|تبون\b)/i.test(query)

  const lines = [
    `## 🏛️ الحكومة الجزائرية — بيانات موثوقة`,
    sourceInfo,
    `> ⚠️ **قاعدة ذهبية**: استخدم هذه البيانات حصراً — لا تخترع اسماً أو منصباً غير موجود هنا.`,
    '',
  ]

  // ── عرض خاص لاستعلامات "الرئيس السابق" أو قائمة الرؤساء ─────────────────
  if (isPresidentQuery || isFormerPresident || allPresidents.length) {
    if (isFormerPresident) {
      lines.push(`### 🔎 الرئيس السابق المباشر لتبون — **عبد العزيز بوتفليقة**`)
      lines.push(`| المنصب | الاسم | الفترة | ملاحظة |`)
      lines.push(`|--------|-------|--------|--------|`)
      lines.push(`| رئيس جمهورية (سابق) | **عبد العزيز بوتفليقة** | 1999–2019 | استقال بسبب الحراك الشعبي، توفي 17 سبتمبر 2021 |`)
      lines.push(``)
    }
    lines.push(`### رؤساء الجزائر (كاملون — من 1962 حتى الآن)`)
    lines.push('| المنصب | الاسم | الفترة | ملاحظة |')
    lines.push('|--------|-------|--------|--------|')
    for (const p of allPresidents) {
      lines.push(`| ${p.role} | **${p.name}** | ${p.since || ''} | ${p.note ? p.note.slice(0, 80) : ''} |`)
    }
    lines.push('')
  } else {
    lines.push(`### رئاسة الجمهورية`)
    lines.push('| المنصب | الاسم | الفترة |')
    lines.push('|--------|-------|--------|')
    for (const p of allPresidents) {
      lines.push(`| ${p.role} | **${p.name}** | ${p.since || ''} |`)
    }
    lines.push('')
  }

  lines.push(`### الوزراء الأوائل`)
  lines.push('| المنصب | الاسم | الفترة |')
  lines.push('|--------|-------|--------|')
  for (const p of primes) {
    lines.push(`| ${p.role} | **${p.name}** | ${p.since || ''} |`)
  }

  if (ministers.length > 0) {
    lines.push('', `### أعضاء الحكومة الحالية (حكومة سيفي غريب — منذ سبتمبر 2025)`)
    lines.push('| الوزارة | الوزير |')
    lines.push('|---------|--------|')
    for (const m of ministers) {
      lines.push(`| ${m.role} | **${m.name}** |`)
    }
  }

  if (data?.newsItems?.length > 0) {
    lines.push('', `### 📰 آخر أخبار التعيينات`)
    for (const item of data.newsItems.slice(0, 5)) {
      lines.push(`• ${item.title}${item.link ? ` — [رابط](${item.link})` : ''}`)
    }
  }

  return lines.join('\n')
}

// ─── البحث عن شخص في قاعدة الحكومة ──────────────────────────────────────────
export function findGovPerson(name) {
  if (!name) return null
  const normalized = name.replace(/\s+/g, ' ').trim()
  // البحث المباشر
  if (GOV_NAME_INDEX.has(normalized)) return GOV_NAME_INDEX.get(normalized)
  // البحث الجزئي
  for (const [key, person] of GOV_NAME_INDEX) {
    if (key.includes(normalized) || normalized.includes(key)) return person
  }
  // البحث بالاسم الأخير
  const parts = normalized.split(' ')
  if (parts.length >= 2) {
    const lastName = parts[parts.length - 1]
    for (const [key, person] of GOV_NAME_INDEX) {
      if (key.endsWith(lastName) || key.includes(lastName)) return person
    }
  }
  return null
}

// ─── كشف استعلامات الوزراء والرؤساء ──────────────────────────────────────────
export function isMinisterQuery(message) {
  if (!message || message.length < 3) return false

  // ── 1. كلمات مفتاحية حكومية ─────────────────────────────────────────────
  if (/(?:وزير|وزراء|الوزارة|الحكومة\s*الجزائرية|من\s+هو\s+وزير|من\s+هي\s+وزيرة|رئيس\s+الحكومة|الوزير\s+الأول|أعضاء\s+الحكومة|تشكيل\s+الحكومة|الوزير\s+(?:المكلف|المنتدب)|كاتب\s+الدولة|ديوان\s+رئاسة|شكون\s+(?:هو\s+)?وزير|واش\s+(?:هو\s+)?وزير|وزير\s+ال[\u0600-\u06FF]+|ministre|gouvernement\s+alg[eé]rien)/i.test(message)) return true

  // ── 2. استعلامات الرئاسة ─────────────────────────────────────────────────
  if (/(?:رئيس\s+الجمهورية|رؤساء\s+الجزائر|الرئيس\s+(?:الجزائري|السابق|الحالي|تبون|بوتفليقة|بومدين|بن\s*بلة|زروال|كافي|بوضياف|بن\s*جديد|بيطاط)|presidents?\s+(?:of\s+)?alg[eé]rie|président\s+(?:de\s+l')?algérie)/i.test(message)) return true

  // ── 3. أسماء الرئيس الحالي وأشهر المسؤولين ──────────────────────────────
  if (/(?:تبون|عبد\s*المجيد\s*تبون|بوتفليقة|بومدين|هواري\s*بومدين|بن\s*بلة|أحمد\s*بن\s*بلة|اليامين\s*زروال|بوضياف|محمد\s*بوضياف|نذير\s*العرباوي|العرباوي)/i.test(message)) return true

  // ── 4. أسماء الوزراء الحاليين ────────────────────────────────────────────
  const knownMinisterNames = [
    'ياسين وليد', 'أحمد عطاف', 'إبراهيم مراد', 'عمر بلحاج', 'لعزيز فايد',
    'محمد عرقاب', 'علي عون', 'الطيب ضيف', 'يوسف شرفة', 'طاهر قردان',
    'موسى بن لعزيز', 'لخضر رخروخ', 'محمد طارق بلعريبي', 'صالح أمار',
    'عبد الحق سايحي', 'عبد الحكيم بلعيد', 'كمال بداري', 'يحيى بوبكر',
    'عبد الرشيد ترار', 'فيصل بن طالب', 'كريمة بلعريبي', 'زينب بن دودة',
    'محمد لعقاب', 'يوسف شاهد', 'يحيى بويا', 'كمال بلجود',
  ]
  const msgNorm = message.replace(/\s+/g, ' ').trim()
  for (const name of knownMinisterNames) {
    if (msgNorm.includes(name) || name.includes(msgNorm)) return true
  }

  // ── 5. بحث جزئي بالاسم الأخير للوزراء ───────────────────────────────────
  const lastNameOnlyPatterns = [
    'عطاف', 'مراد', 'بلحاج', 'فايد', 'عرقاب', 'عون', 'شرفة', 'قردان',
    'رخروخ', 'بلعريبي', 'سايحي', 'بلعيد', 'بداري', 'ترار', 'لعقاب', 'شاهد',
  ]
  for (const lastName of lastNameOnlyPatterns) {
    if (msgNorm.includes(lastName)) return true
  }

  return false
}
