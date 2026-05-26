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

  // ── Quran keyword search with tafsir injection (RAG) ─────────
  router.get('/quran/search', async (req, res) => {
    const q = sanitizeString(String(req.query.q || '').trim(), 200)
    if (!q || q.length < 2) {
      return res.status(400).json({ ok: false, error: 'كلمة البحث مطلوبة (حرفان على الأقل)' })
    }

    const CDN = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir'
    const size = Math.min(parseInt(req.query.size, 10) || 5, 10)

    try {
      const searchCtrl = new AbortController()
      const searchTimer = setTimeout(() => searchCtrl.abort(), 8000)
      const searchRes = await fetch(
        `https://api.quran.com/api/v4/search?q=${encodeURIComponent(q)}&size=${size}&language=ar`,
        { signal: searchCtrl.signal }
      )
      clearTimeout(searchTimer)

      if (!searchRes.ok) {
        return res.json({ ok: true, query: q, results: [], note: 'تعذر الوصول إلى قاعدة بيانات القرآن الكريم' })
      }

      const searchData = await searchRes.json()
      const rawResults = searchData.search?.results || []
      if (!rawResults.length) return res.json({ ok: true, query: q, results: [], total: 0 })

      const withTafsir = await Promise.allSettled(
        rawResults.slice(0, 3).map(async (r) => {
          const [surah, ayah] = (r.verse_key || '').split(':').map(Number)
          let tafsir = ''
          if (surah && ayah) {
            try {
              const ctrl = new AbortController()
              const t = setTimeout(() => ctrl.abort(), 5000)
              const tf = await fetch(`${CDN}/ar-tafsir-ibn-kathir/${surah}/${ayah}.json`, { signal: ctrl.signal })
              clearTimeout(t)
              if (tf.ok) {
                const td = await tf.json()
                tafsir = (td.text || '').slice(0, 600)
              }
            } catch {}
          }
          return { verse_key: r.verse_key, surah, ayah, text: r.text || '', tafsir: tafsir || null }
        })
      )

      const results = [
        ...withTafsir.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean),
        ...rawResults.slice(3).map(r => {
          const [surah, ayah] = (r.verse_key || '').split(':').map(Number)
          return { verse_key: r.verse_key, surah, ayah, text: r.text || '', tafsir: null }
        }),
      ]

      res.json({ ok: true, query: q, total: searchData.search?.total_results || results.length, results })
    } catch (e) {
      res.json({ ok: true, query: q, results: [], note: 'خطأ في البحث: ' + e.message })
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
