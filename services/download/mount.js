// Download V2 service — reliable YouTube download transport.
//
// The old DZ Tube route depended on @distube/ytdl-core, which is archived and
// no longer maintained. YouTube.js (youtubei.js) is the actively maintained
// InnerTube client used here to resolve current YouTube player formats and
// stream the resulting media from the server instead of exposing expiring
// googlevideo URLs to the browser.
import express from 'express'
import { Readable } from 'node:stream'
import { Innertube, UniversalCache } from 'youtubei.js'

let youtubePromise = null

function getYouTube() {
  if (!youtubePromise) {
    youtubePromise = Innertube.create({ cache: new UniversalCache(false) })
      .catch(err => {
        youtubePromise = null
        throw err
      })
  }
  return youtubePromise
}

function extractVideoId(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'youtu.be') return url.pathname.slice(1).split('/')[0]
    if (host.endsWith('youtube.com')) {
      const v = url.searchParams.get('v')
      if (v) return v
      const match = url.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/)
      if (match) return match[1]
    }
  } catch {}
  const direct = String(value || '').match(/^[\w-]{11}$/)
  return direct?.[0] || null
}

function safeFilename(title) {
  return String(title || 'video')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'video'
}

function thumbnailFromInfo(info) {
  const thumbs = info?.basic_info?.thumbnail
  if (Array.isArray(thumbs) && thumbs.length) return thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || null
  return typeof thumbs === 'string' ? thumbs : null
}

function getFormatOptions(format, quality) {
  if (format === 'mp3' || format === 'audio' || format === 'm4a') {
    // YouTube's native AAC/MP4 audio stream is M4A. MP3 is not a native
    // YouTube format and converting it on a serverless function would add a
    // fragile FFmpeg dependency. We therefore return the lossless/native M4A
    // stream even when the legacy UI asks for mp3; the response filename and
    // MIME type make the actual file type explicit to the browser.
    return { format: 'mp4', type: 'audio', quality: 'best', codec: 'mp4a' }
  }
  return { format: 'mp4', type: 'video+audio', quality: quality && quality !== 'auto' ? `${quality}p` : 'best' }
}

function contentTypeFor(format) {
  return format === 'mp3' || format === 'audio' || format === 'm4a' ? 'audio/mp4' : 'video/mp4'
}

function extensionFor(format) {
  return format === 'mp3' || format === 'audio' || format === 'm4a' ? 'm4a' : 'mp4'
}

export function mountDownloadV2(app) {
  const router = express.Router()

  // Keep the existing /api/dz-tube/download URL so the existing DZ Tube UI
  // needs no client-side migration. This router is mounted before the legacy
  // DZ Tube routes in server.js, so it becomes the authoritative downloader.
  const handleDownload = async (req, res) => {
    try {
      const input = req.method === 'POST' ? (req.body || {}) : req.query
      const url = String(input.url || '').trim()
      const format = String(input.format || 'mp4').toLowerCase()
      const quality = String(input.quality || 'best').trim()
      const videoId = extractVideoId(url)

      if (!videoId) return res.status(400).json({ error: 'رابط YouTube غير صالح' })
      if (!['mp4', 'mp3', 'm4a', 'audio'].includes(format)) {
        return res.status(400).json({ error: 'الصيغة غير مدعومة' })
      }

      const youtube = await getYouTube()
      const info = await youtube.getInfo(videoId)
      const title = safeFilename(info.basic_info?.title)
      const options = getFormatOptions(format, quality)

      let selected
      try {
        selected = info.chooseFormat(options)
      } catch (firstError) {
        // Some videos no longer expose the requested progressive quality.
        // Fall back to the best compatible progressive MP4 rather than fail.
        if (format === 'mp4') {
          selected = info.chooseFormat({ format: 'mp4', type: 'video+audio', quality: 'best' })
        } else {
          throw firstError
        }
      }

      const streamUrl = await selected.decipher(youtube.session.player)
      if (!streamUrl) throw new Error('تعذر الحصول على رابط البث الحالي')

      const upstream = await fetch(streamUrl, {
        headers: {
          // YouTube stream URLs are sensitive to request headers; keep the
          // request close to the normal browser media request shape.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
          Accept: '*/*',
        },
        redirect: 'follow',
      })

      if (!upstream.ok || !upstream.body) {
        throw new Error(`مصدر YouTube رفض البث (${upstream.status})`)
      }

      const ext = extensionFor(format)
      const suffix = format === 'mp4' && quality && quality !== 'best' ? `_${quality}p` : ''
      const filename = `${title}${suffix}.${ext}`

      res.statusCode = 200
      res.setHeader('Content-Type', contentTypeFor(format))
      res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      const length = upstream.headers.get('content-length')
      if (length) res.setHeader('Content-Length', length)

      Readable.fromWeb(upstream.body).on('error', err => {
        if (!res.headersSent) res.status(502).json({ error: err?.message || 'فشل البث' })
        else res.destroy(err)
      }).pipe(res)
    } catch (err) {
      console.error('[DZ Tube] download failed:', err?.stack || err?.message || err)
      if (!res.headersSent) {
        res.status(502).json({
          error: 'فشل تحميل الفيديو حالياً. أعد المحاولة بعد لحظات.',
          detail: process.env.NODE_ENV === 'development' ? String(err?.message || err) : undefined,
        })
      } else {
        res.destroy(err)
      }
    }
  }

  router.get('/download', handleDownload)
  router.post('/download', handleDownload)

  // Also provide a current-format info endpoint so the quality selector is
  // backed by the same extractor as the actual download path.
  router.post('/info', async (req, res) => {
    try {
      const videoId = extractVideoId(String(req.body?.url || '').trim())
      if (!videoId) return res.status(400).json({ error: 'رابط YouTube غير صالح' })
      const youtube = await getYouTube()
      const info = await youtube.getInfo(videoId)
      const formats = [
        ...(info.streaming_data?.formats || []),
        ...(info.streaming_data?.adaptive_formats || []),
      ]
      const downloadableHeights = [...new Set(
        formats
          .filter(f => f.has_video && String(f.mime_type || '').startsWith('video/mp4'))
          .map(f => Number(f.height))
          .filter(Number.isFinite)
      )].sort((a, b) => a - b)

      res.json({
        title: info.basic_info?.title || 'YouTube video',
        thumbnail: thumbnailFromInfo(info),
        duration: Number(info.basic_info?.duration || 0),
        uploader: info.basic_info?.author || info.basic_info?.channel || '',
        view_count: Number(info.basic_info?.view_count || 0),
        downloadableHeights,
      })
    } catch (err) {
      console.error('[DZ Tube] info failed:', err?.stack || err?.message || err)
      res.status(502).json({ error: 'تعذر جلب معلومات الفيديو حالياً' })
    }
  })

  app.use('/api/dz-tube', router)
  app.use('/api/download-v2', router)
}
