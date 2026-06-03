/**
 * routes/quran.js
 * Quran search, tafsir context, and link-preview endpoints.
 * Extracted from server.js lines 2062–2188.
 *
 * GET /api/quran/search?q=&size=
 * GET /api/quran/context?surah=&ayah=
 * GET /api/link-preview?url=
 */
import { Router } from 'express'
import { sanitizeString } from '../lib/server-utils.js'

export function createQuranRouter() {
  const router = Router()

  // ── Quran full-text cache (loaded once from CDN) ─────────────────────────
  let _quranCache = null
  let _quranCacheLoading = false
  let _quranCacheCallbacks = []

  async function getQuranData() {
    if (_quranCache) return _quranCache
    if (_quranCacheLoading) {
      return new Promise((resolve, reject) => _quranCacheCallbacks.push({ resolve, reject }))
    }
    _quranCacheLoading = true
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 20000)
      const r = await fetch('https://cdn.jsdelivr.net/npm/quran-json@3.1.2/dist/quran.json', { signal: ctrl.signal })
      clearTimeout(t)
      if (!r.ok) throw new Error('CDN error ' + r.status)
      _quranCache = await r.json()
      _quranCacheCallbacks.forEach(cb => cb.resolve(_quranCache))
      _quranCacheCallbacks = []
      return _quranCache
    } catch (e) {
      _quranCacheLoading = false
      _quranCacheCallbacks.forEach(cb => cb.reject(e))
      _quranCacheCallbacks = []
      throw e
    }
  }

  // Normalize Arabic text for flexible search:
  // 1. Remove all tashkeel (diacritics)
  // 2. Normalize alef variants (أإآٱ) → ا
  // 3. Normalize teh marbuta ة → ه
  // 4. Remove tatweel ـ
  function normalizeArabic(s) {
    return s
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '')
      .replace(/\u0640/g, '')
      .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
      .replace(/\u0629/g, '\u0647')
  }

  // ── Quran keyword search — POST /api/quran/search (body: {query, limit}) ──
  router.post('/quran/search', async (req, res) => {
    const raw = req.body?.query || req.body?.q || ''
    const q = sanitizeString(String(raw).trim(), 200)
    if (!q || q.length < 2) {
      return res.status(400).json({ ok: false, error: 'كلمة البحث مطلوبة (حرفان على الأقل)' })
    }
    const limit = Math.min(parseInt(req.body?.limit || req.body?.size || 20, 10) || 20, 100)
    try {
      const quran = await getQuranData()
      const needle = normalizeArabic(q)
      const results = []
      for (const surah of quran) {
        for (const verse of surah.verses) {
          if (normalizeArabic(verse.text).includes(needle)) {
            results.push({ surah: surah.id, surahName: surah.name, ayah: verse.id, text: verse.text })
            if (results.length >= limit) break
          }
        }
        if (results.length >= limit) break
      }
      return res.json({ ok: true, query: q, total: results.length, results })
    } catch (e) {
      return res.json({ ok: true, query: q, total: 0, results: [], note: e.message })
    }
  })

  // ── Quran keyword search — GET /api/quran/search?q=&size= ────────────────
  router.get('/quran/search', async (req, res) => {
    const q = sanitizeString(String(req.query.q || '').trim(), 200)
    if (!q || q.length < 2) {
      return res.status(400).json({ ok: false, error: 'كلمة البحث مطلوبة (حرفان على الأقل)' })
    }

    try {
      const quran = await getQuranData()
      const needle = normalizeArabic(q)
      const surahMap = new Map()
      let total = 0

      for (const surah of quran) {
        for (const verse of surah.verses) {
          const strippedText = normalizeArabic(verse.text)
          if (!strippedText.includes(needle)) continue
          total++
          const sNum = surah.id
          const sName = surah.name || `سورة ${sNum}`
          const verseKey = `${sNum}:${verse.id}`
          if (!surahMap.has(sNum)) {
            surahMap.set(sNum, { surahNum: sNum, surahName: sName, count: 0, verses: [] })
          }
          const entry = surahMap.get(sNum)
          entry.count++
          entry.verses.push({ verseKey, text: verse.text })
        }
      }

      const surahGroups = Array.from(surahMap.values()).sort((a, b) => a.surahNum - b.surahNum)
      res.json({ ok: true, query: q, total, surahGroups })
    } catch (e) {
      res.json({ ok: true, query: q, total: 0, surahGroups: [], note: 'خطأ في البحث: ' + (e.message || 'unknown') })
    }
  })

  // ── Quran context — tafsir from 3 scholarly sources ──────────
  router.get('/quran/context', async (req, res) => {
    const surah = parseInt(req.query.surah, 10)
    const ayah  = parseInt(req.query.ayah,  10)
    if (!surah || !ayah || surah < 1 || surah > 114 || ayah < 1) {
      return res.status(400).json({ ok: false, error: 'surah (1-114) و ayah مطلوبان' })
    }

    const CDN = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir'
    const TAFSIRS = [
      { slug: 'ar-tafsir-ibn-kathir', label: 'ابن كثير' },
      { slug: 'ar-tafsir-muyassar',   label: 'التفسير الميسر' },
      { slug: 'ar-tafsir-al-saadi',   label: 'السعدي' },
    ]

    const fetched = await Promise.allSettled(
      TAFSIRS.map(async ({ slug, label }) => {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 6000)
        try {
          const r = await fetch(`${CDN}/${slug}/${surah}/${ayah}.json`, { signal: ctrl.signal })
          clearTimeout(timer)
          if (!r.ok) return null
          const d = await r.json()
          const text = (d.text || '').trim()
          return text ? { label, text: text.slice(0, 1200) } : null
        } catch {
          clearTimeout(timer)
          return null
        }
      })
    )

    const tafsirs = fetched.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)

    if (tafsirs.length === 0) {
      return res.json({ ok: true, surah, ayah, tafsirs: [], note: 'لم يُعثر على تفسير في قاعدة البيانات لهذه الآية.' })
    }
    res.json({ ok: true, surah, ayah, tafsirs })
  })

  // ── Link preview (OG metadata scraper) ───────────────────────
  router.get('/link-preview', async (req, res) => {
    const { url } = req.query
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return res.status(400).json({ error: 'invalid url' })
    }
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZBot/1.0)' },
        signal: ctrl.signal,
      })
      clearTimeout(t)
      const html = await r.text()
      const og = k => (
        html.match(new RegExp('<meta[^>]+property=["\']og:' + k + '["\'][^>]+content=["\']([^"\']{1,300})["\']', 'i')) ||
        html.match(new RegExp('<meta[^>]+content=["\']([^"\']{1,300})["\'][^>]+property=["\']og:' + k + '["\']', 'i')) ||
        []
      )[1] || ''
      const title = og('title') || (html.match(/<title[^>]*>([^<]{1,120})<\/title>/i) || [])[1] || ''
      const description = og('description') ||
        (html.match(/<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']{1,250})["\'][^>]*>/i) || [])[1] || ''
      const image = og('image')
      res.set('Cache-Control', 'public,max-age=3600').json({
        title: title.trim(), description: description.trim(), image, url,
      })
    } catch {
      res.json({ title: '', description: '', image: '', url })
    }
  })

  return router
}
