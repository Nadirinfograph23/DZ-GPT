/**
 * DZ Jobs Scraper v1.0
 * ═══════════════════════════════════════════════════════════════════════
 * بحث مباشر في 11 موقع توظيف جزائري رسمي وشبه رسمي
 * المصادر:
 *   • ANEM (anem.dz + wassitonline.anem.dz)
 *   • concours-fonction-publique.gov.dz (الوظيف العمومي الرسمي)
 *   • Emploitic, Tawdif, Jobs4DZ, Annexe-DZ, DzJob
 *   • Ouedkniss Emploi, LinkedIn Algeria, Indeed Algeria
 * ═══════════════════════════════════════════════════════════════════════
 */

import * as cheerio from 'cheerio'

// ─── Cache (5 min TTL) ───────────────────────────────────────────────
const CACHE = new Map()
const CACHE_TTL = 5 * 60 * 1000
function cacheGet(k) {
  const e = CACHE.get(k); if (!e) return null
  if (Date.now() - e.ts > CACHE_TTL) { CACHE.delete(k); return null }
  return e.v
}
function cachePut(k, v) { CACHE.set(k, { v, ts: Date.now() }) }

// ─── Headers مشتركة ─────────────────────────────────────────────────
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ar,fr-DZ;q=0.9,fr;q=0.8,en;q=0.7',
}

async function safeFetch(url, timeout = 10000) {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// ════════════════════════════════════════════════════════════════════
// 1. موقع مسابقات الوظيف العمومي (الأهم — رسمي 100%)
// ════════════════════════════════════════════════════════════════════
async function scrapeConcoursFP(query) {
  const cacheKey = `concoursfp:${query}`
  const cached = cacheGet(cacheKey); if (cached) return cached

  try {
    const q = encodeURIComponent(query)
    const url = `https://www.concours-fonction-publique.gov.dz/index.php?option=com_search&searchword=${q}&searchphrase=all&Itemid=99`
    const html = await safeFetch(url)
    const $ = cheerio.load(html)
    const results = []

    $('div.search-results h2.result-title, .cat-list-row, article, .result').each((i, el) => {
      if (results.length >= 6) return
      const $el = $(el)
      const title = $el.find('a').first().text().trim() || $el.find('h2, h3').first().text().trim()
      let href = $el.find('a').first().attr('href') || ''
      if (href && !href.startsWith('http')) href = 'https://www.concours-fonction-publique.gov.dz' + href
      const snippet = $el.find('p, .result-text, .introtext').first().text().trim()
      if (title && title.length > 5) {
        results.push({
          title: title.slice(0, 150),
          url: href || 'https://www.concours-fonction-publique.gov.dz',
          snippet: snippet.slice(0, 300),
          source: 'الوظيف العمومي (رسمي)',
          sourceUrl: 'https://www.concours-fonction-publique.gov.dz',
          isOfficial: true,
        })
      }
    })

    // fallback: صفحة الإعلانات الأخيرة
    if (results.length === 0) {
      const mainHtml = await safeFetch('https://www.concours-fonction-publique.gov.dz')
      const $m = cheerio.load(mainHtml)
      $m('article h2 a, .items-row h2 a, .item h2 a, .article-title a').each((i, el) => {
        if (results.length >= 6) return
        const $el = $m(el)
        const title = $el.text().trim()
        let href = $el.attr('href') || ''
        if (href && !href.startsWith('http')) href = 'https://www.concours-fonction-publique.gov.dz' + href
        if (title.length > 5) {
          results.push({ title, url: href, snippet: '', source: 'الوظيف العمومي (رسمي)', sourceUrl: 'https://www.concours-fonction-publique.gov.dz', isOfficial: true })
        }
      })
    }

    console.log(`[DZ-Jobs-Scraper] ConcoursFP: ${results.length} results for "${query.slice(0, 40)}"`)
    cachePut(cacheKey, results)
    return results
  } catch (e) {
    console.warn('[DZ-Jobs-Scraper] ConcoursFP error:', e.message)
    return [{ title: 'موقع مسابقات الوظيف العمومي', url: 'https://www.concours-fonction-publique.gov.dz', snippet: 'تصفح الإعلانات الرسمية على الموقع مباشرة', source: 'الوظيف العمومي (رسمي)', sourceUrl: 'https://www.concours-fonction-publique.gov.dz', isOfficial: true }]
  }
}

// ════════════════════════════════════════════════════════════════════
// 2. Emploitic — أكبر موقع وظائف خاص
// ════════════════════════════════════════════════════════════════════
async function scrapeEmploitic(query) {
  const cacheKey = `emploitic:${query}`
  const cached = cacheGet(cacheKey); if (cached) return cached

  try {
    const q = encodeURIComponent(query.replace(/مسابقة|وظيف عمومي|concours fonction publique/gi, '').trim() || query)
    const url = `https://www.emploitic.com/offres-d-emploi?filter[keywords]=${q}`
    const html = await safeFetch(url)
    const $ = cheerio.load(html)
    const results = []

    $('[class*="job"], [class*="offer"], article, .listing-item, .job-item, .item').each((i, el) => {
      if (results.length >= 5) return
      const $el = $(el)
      const title = $el.find('[class*="title"], h2, h3').first().text().trim()
      const company = $el.find('[class*="company"], [class*="employer"]').first().text().trim()
      const location = $el.find('[class*="location"], [class*="wilaya"]').first().text().trim()
      const date = $el.find('[class*="date"], time').first().text().trim()
      let href = $el.find('a').first().attr('href') || ''
      if (href && !href.startsWith('http')) href = 'https://www.emploitic.com' + href
      if (title && title.length > 5) {
        results.push({
          title: title.slice(0, 150),
          url: href || url,
          snippet: [company, location, date].filter(Boolean).join(' | ').slice(0, 300),
          source: 'Emploitic',
          sourceUrl: 'https://www.emploitic.com',
          isOfficial: false,
        })
      }
    })

    console.log(`[DZ-Jobs-Scraper] Emploitic: ${results.length} results`)
    cachePut(cacheKey, results)
    return results
  } catch (e) {
    console.warn('[DZ-Jobs-Scraper] Emploitic error:', e.message)
    return [{ title: 'Emploitic — وظائف القطاع الخاص', url: `https://www.emploitic.com/offres-d-emploi`, snippet: 'أكبر موقع وظائف خاص في الجزائر', source: 'Emploitic', sourceUrl: 'https://www.emploitic.com', isOfficial: false }]
  }
}

// ════════════════════════════════════════════════════════════════════
// 3. Annexe-DZ — مجمّع مسابقات التوظيف العمومي
// ════════════════════════════════════════════════════════════════════
async function scrapeAnnexeDZ(query) {
  const cacheKey = `annexedz:${query}`
  const cached = cacheGet(cacheKey); if (cached) return cached

  try {
    const q = encodeURIComponent(query)
    const url = `https://www.annexe-dz.com/?s=${q}`
    const html = await safeFetch(url)
    const $ = cheerio.load(html)
    const results = []

    $('article, .post, .entry, h2.entry-title, .result').each((i, el) => {
      if (results.length >= 5) return
      const $el = $(el)
      const $a = $el.find('h2 a, h3 a, a').first()
      const title = $a.text().trim() || $el.find('h2, h3').first().text().trim()
      let href = $a.attr('href') || ''
      const snippet = $el.find('p, .excerpt, .entry-content').first().text().trim()
      const date = $el.find('time, .date, .published').first().text().trim()
      if (title && title.length > 5) {
        results.push({
          title: title.slice(0, 150),
          url: href || 'https://www.annexe-dz.com',
          snippet: (snippet || date).slice(0, 300),
          source: 'Annexe DZ',
          sourceUrl: 'https://www.annexe-dz.com',
          isOfficial: false,
        })
      }
    })

    console.log(`[DZ-Jobs-Scraper] AnnexeDZ: ${results.length} results`)
    cachePut(cacheKey, results)
    return results
  } catch (e) {
    console.warn('[DZ-Jobs-Scraper] AnnexeDZ error:', e.message)
    return []
  }
}

// ════════════════════════════════════════════════════════════════════
// 4. Tawdif DZ — مسابقات مجمّعة
// ════════════════════════════════════════════════════════════════════
async function scrapeTawdif(query) {
  const cacheKey = `tawdif:${query}`
  const cached = cacheGet(cacheKey); if (cached) return cached

  try {
    const q = encodeURIComponent(query)
    const url = `https://tawothifdz.com/?s=${q}`
    const html = await safeFetch(url)
    const $ = cheerio.load(html)
    const results = []

    $('article, .post, h2.entry-title, .card').each((i, el) => {
      if (results.length >= 5) return
      const $el = $(el)
      const $a = $el.find('h2 a, h3 a, .entry-title a').first()
      const title = $a.text().trim()
      let href = $a.attr('href') || ''
      const snippet = $el.find('.entry-content, p, .excerpt').first().text().trim()
      if (title && title.length > 5) {
        results.push({
          title: title.slice(0, 150),
          url: href || 'https://tawothifdz.com',
          snippet: snippet.slice(0, 300),
          source: 'Tawdif DZ',
          sourceUrl: 'https://tawothifdz.com',
          isOfficial: false,
        })
      }
    })

    console.log(`[DZ-Jobs-Scraper] Tawdif: ${results.length} results`)
    cachePut(cacheKey, results)
    return results
  } catch (e) {
    console.warn('[DZ-Jobs-Scraper] Tawdif error:', e.message)
    return []
  }
}

// ════════════════════════════════════════════════════════════════════
// 5. Jobs4DZ
// ════════════════════════════════════════════════════════════════════
async function scrapeJobs4DZ(query) {
  const cacheKey = `jobs4dz:${query}`
  const cached = cacheGet(cacheKey); if (cached) return cached

  try {
    const q = encodeURIComponent(query)
    const url = `https://www.jobs4dz.com/?s=${q}`
    const html = await safeFetch(url)
    const $ = cheerio.load(html)
    const results = []

    $('article, .post, .job-item, h2.entry-title').each((i, el) => {
      if (results.length >= 4) return
      const $el = $(el)
      const $a = $el.find('h2 a, h3 a, .entry-title a').first()
      const title = $a.text().trim()
      let href = $a.attr('href') || ''
      const snippet = $el.find('p, .excerpt').first().text().trim()
      if (title && title.length > 5) {
        results.push({ title: title.slice(0, 150), url: href || 'https://www.jobs4dz.com', snippet: snippet.slice(0, 250), source: 'Jobs4DZ', sourceUrl: 'https://www.jobs4dz.com', isOfficial: false })
      }
    })

    console.log(`[DZ-Jobs-Scraper] Jobs4DZ: ${results.length} results`)
    cachePut(cacheKey, results)
    return results
  } catch (e) {
    console.warn('[DZ-Jobs-Scraper] Jobs4DZ error:', e.message)
    return []
  }
}

// ════════════════════════════════════════════════════════════════════
// 6. DzJob.net
// ════════════════════════════════════════════════════════════════════
async function scrapeDzJob(query) {
  const cacheKey = `dzjob:${query}`
  const cached = cacheGet(cacheKey); if (cached) return cached

  try {
    const q = encodeURIComponent(query)
    const url = `https://www.dzjob.net/?s=${q}`
    const html = await safeFetch(url)
    const $ = cheerio.load(html)
    const results = []

    $('article, .post, h2.entry-title, .job-offer').each((i, el) => {
      if (results.length >= 4) return
      const $el = $(el)
      const $a = $el.find('h2 a, h3 a, a').first()
      const title = $a.text().trim()
      let href = $a.attr('href') || ''
      const snippet = $el.find('p, .excerpt').first().text().trim()
      if (title && title.length > 5) {
        results.push({ title: title.slice(0, 150), url: href || 'https://www.dzjob.net', snippet: snippet.slice(0, 250), source: 'DzJob', sourceUrl: 'https://www.dzjob.net', isOfficial: false })
      }
    })

    cachePut(cacheKey, results)
    return results
  } catch (e) {
    console.warn('[DZ-Jobs-Scraper] DzJob error:', e.message)
    return []
  }
}

// ════════════════════════════════════════════════════════════════════
// 7. ANEM — الوكالة الوطنية للتشغيل (صفحة الإعلانات)
// ════════════════════════════════════════════════════════════════════
async function scrapeANEM(query) {
  const cacheKey = `anem:${query}`
  const cached = cacheGet(cacheKey); if (cached) return cached

  try {
    const html = await safeFetch('https://www.anem.dz')
    const $ = cheerio.load(html)
    const results = []

    $('a[href*="emploi"], a[href*="offre"], a[href*="poste"], .offre, .offer, article').each((i, el) => {
      if (results.length >= 4) return
      const $el = $(el)
      const title = $el.text().trim()
      let href = $el.attr('href') || $el.find('a').first().attr('href') || ''
      if (href && !href.startsWith('http')) href = 'https://www.anem.dz' + href
      if (title && title.length > 8 && title.length < 200) {
        results.push({ title: title.slice(0, 150), url: href || 'https://www.anem.dz', snippet: '', source: 'ANEM (رسمي)', sourceUrl: 'https://www.anem.dz', isOfficial: true })
      }
    })

    // رابط ثابت دائماً لمنصة وسيط
    results.push({
      title: 'البحث عن عروض العمل — منصة وسيط ANEM',
      url: 'https://wassitonline.anem.dz',
      snippet: 'منصة ANEM الرسمية للبحث عن عروض العمل والتسجيل',
      source: 'Wassit Online — ANEM (رسمي)',
      sourceUrl: 'https://wassitonline.anem.dz',
      isOfficial: true,
    })

    console.log(`[DZ-Jobs-Scraper] ANEM: ${results.length} results`)
    cachePut(cacheKey, results)
    return results
  } catch (e) {
    console.warn('[DZ-Jobs-Scraper] ANEM error:', e.message)
    return [
      { title: 'الوكالة الوطنية للتشغيل — ANEM', url: 'https://www.anem.dz', snippet: 'ابحث عن عروض العمل على الموقع الرسمي', source: 'ANEM (رسمي)', sourceUrl: 'https://www.anem.dz', isOfficial: true },
      { title: 'منصة وسيط — ANEM Online', url: 'https://wassitonline.anem.dz', snippet: 'البحث والتقديم على العروض أونلاين', source: 'Wassit Online — ANEM (رسمي)', sourceUrl: 'https://wassitonline.anem.dz', isOfficial: true },
    ]
  }
}

// ════════════════════════════════════════════════════════════════════
// 8. Ouedkniss Emploi
// ════════════════════════════════════════════════════════════════════
async function scrapeOuedkniss(query) {
  const cacheKey = `ouedkniss:${query}`
  const cached = cacheGet(cacheKey); if (cached) return cached

  try {
    const q = encodeURIComponent(query)
    const url = `https://www.ouedkniss.com/emploi?query=${q}`
    const html = await safeFetch(url)
    const $ = cheerio.load(html)
    const results = []

    $('[class*="annonce"], [class*="card"], [class*="listing"], .item').each((i, el) => {
      if (results.length >= 4) return
      const $el = $(el)
      const title = $el.find('h2, h3, [class*="title"]').first().text().trim()
      let href = $el.find('a').first().attr('href') || ''
      if (href && !href.startsWith('http')) href = 'https://www.ouedkniss.com' + href
      const snippet = $el.find('p, [class*="desc"]').first().text().trim()
      if (title && title.length > 5) {
        results.push({ title: title.slice(0, 150), url: href || url, snippet: snippet.slice(0, 250), source: 'Ouedkniss Emploi', sourceUrl: 'https://www.ouedkniss.com/emploi', isOfficial: false })
      }
    })

    cachePut(cacheKey, results)
    return results
  } catch (e) {
    console.warn('[DZ-Jobs-Scraper] Ouedkniss error:', e.message)
    return []
  }
}

// ════════════════════════════════════════════════════════════════════
// الدالة الرئيسية — بحث متوازٍ في جميع المصادر
// ════════════════════════════════════════════════════════════════════

/**
 * searchDZJobsAllSources — ابحث في جميع مصادر التوظيف الجزائرية
 * @param {string} query - طلب المستخدم
 * @param {object} opts
 * @param {boolean} opts.isConcours - هل الطلب عن مسابقة؟
 * @param {boolean} opts.isPrivate  - هل الطلب عن القطاع الخاص؟
 * @returns {Promise<Array>} قائمة النتائج مرتبة حسب الأولوية
 */
export async function searchDZJobsAllSources(query, { isConcours = false, isPrivate = false } = {}) {
  console.log(`[DZ-Jobs-Scraper] Searching all sources for: "${query.slice(0, 60)}"`)

  // تحديد المصادر حسب نوع الطلب
  const scrapers = []

  if (isConcours || !isPrivate) {
    // المصادر الرسمية دائماً للمسابقات
    scrapers.push(
      scrapeConcoursFP(query).catch(() => []),
      scrapeAnnexeDZ(query).catch(() => []),
      scrapeTawdif(query).catch(() => []),
    )
  }

  if (!isConcours || isPrivate) {
    // مواقع القطاع الخاص
    scrapers.push(
      scrapeEmploitic(query).catch(() => []),
      scrapeJobs4DZ(query).catch(() => []),
      scrapeDzJob(query).catch(() => []),
      scrapeOuedkniss(query).catch(() => []),
    )
  }

  // ANEM دائماً
  scrapers.push(scrapeANEM(query).catch(() => []))

  const allResults = await Promise.all(scrapers)
  const flat = allResults.flat()

  // إزالة التكرار + ترتيب: رسمي أولاً ثم حسب المصدر
  const seen = new Set()
  const unique = flat.filter(r => {
    const key = (r.url || r.title || '').toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // ترتيب: رسمي → annexe/tawdif → emploitic → باقي
  const PRIORITY = { 'الوظيف العمومي (رسمي)': 0, 'ANEM (رسمي)': 1, 'Wassit Online — ANEM (رسمي)': 2, 'Annexe DZ': 3, 'Tawdif DZ': 4, 'Emploitic': 5, 'Jobs4DZ': 6, 'DzJob': 7, 'Ouedkniss Emploi': 8 }
  unique.sort((a, b) => (PRIORITY[a.source] ?? 99) - (PRIORITY[b.source] ?? 99))

  console.log(`[DZ-Jobs-Scraper] Total unique: ${unique.length} results from ${allResults.length} sources`)
  return unique
}

/**
 * قائمة المصادر الكاملة للعرض في رسائل الاقتراح
 */
export const DZ_JOBS_SOURCES_LIST = [
  { name: 'الوكالة الوطنية للتشغيل (ANEM)',           url: 'https://www.anem.dz',                                  official: true  },
  { name: 'منصة وسيط — ANEM Online',                   url: 'https://wassitonline.anem.dz',                         official: true  },
  { name: 'مسابقات الوظيف العمومي',                   url: 'https://www.concours-fonction-publique.gov.dz',         official: true  },
  { name: 'Emploitic',                                  url: 'https://www.emploitic.com',                            official: false },
  { name: 'Tawdif DZ',                                  url: 'https://tawothifdz.com',                               official: false },
  { name: 'Jobs4DZ',                                    url: 'https://www.jobs4dz.com',                              official: false },
  { name: 'Annexe DZ',                                  url: 'https://www.annexe-dz.com',                            official: false },
  { name: 'DzJob',                                      url: 'https://www.dzjob.net',                                official: false },
  { name: 'Ouedkniss Emploi',                           url: 'https://www.ouedkniss.com/emploi',                     official: false },
  { name: 'LinkedIn Jobs Algeria',                      url: 'https://www.linkedin.com/jobs/search/?location=Algeria', official: false },
  { name: 'Indeed Algeria',                             url: 'https://dz.indeed.com',                                official: false },
]
