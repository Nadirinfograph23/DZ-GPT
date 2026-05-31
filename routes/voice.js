// DZ Voice API — Edge TTS Neural (Microsoft, مجاني بدون API Key)
// POST /api/voice/tts  → audio/mpeg
// GET  /api/voice/voices → قائمة الأصوات المتاحة
import express from 'express'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const router = express.Router()

// أصوات جزائرية حصرية + عربية + فرنسية + إنجليزية
const VOICE_MAP = {
  ar: {
    female: 'ar-DZ-AminaNeural',   // 🇩🇿 جزائرية أنثى
    male:   'ar-DZ-IsmaelNeural',  // 🇩🇿 جزائري ذكر
  },
  fr: {
    female: 'fr-DZ-AminaNeural',   // 🇩🇿 فرنسية جزائرية أنثى
    male:   'fr-DZ-IsmaelNeural',  // 🇩🇿 فرنسية جزائرية ذكر
  },
  en: {
    female: 'en-US-JennyNeural',
    male:   'en-US-GuyNeural',
  },
}

// Cache بسيط للـ audio (مفتاح: text+voice، حجم max 50 مقطع)
const AUDIO_CACHE = new Map()
const CACHE_MAX   = 50

function cachePut(key, buf) {
  if (AUDIO_CACHE.size >= CACHE_MAX) {
    const first = AUDIO_CACHE.keys().next().value
    if (first) AUDIO_CACHE.delete(first)
  }
  AUDIO_CACHE.set(key, buf)
}

// POST /api/voice/tts
router.post('/voice/tts', async (req, res) => {
  const { text, lang = 'ar', gender = 'female' } = req.body || {}
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text مطلوب' })
  }

  const clean  = text.trim().slice(0, 1000)
  const langKey = (lang.split('-')[0] || 'ar').toLowerCase()
  const voices  = VOICE_MAP[langKey] || VOICE_MAP.ar
  const voice   = voices[gender] || voices.female
  const cacheKey = `${voice}::${clean}`

  // إرجاع من الـ cache إذا موجود
  if (AUDIO_CACHE.has(cacheKey)) {
    const buf = AUDIO_CACHE.get(cacheKey)
    res.set('Content-Type', 'audio/mpeg')
    res.set('Cache-Control', 'public, max-age=600')
    res.set('X-Voice', voice)
    res.set('X-Cache', 'HIT')
    return res.send(buf)
  }

  try {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

    const chunks = []
    await new Promise((resolve, reject) => {
      const stream = tts.toStream(clean)
      stream.on('data',  chunk  => chunks.push(chunk))
      stream.on('end',   resolve)
      stream.on('error', reject)
    })

    const buf = Buffer.concat(chunks)
    cachePut(cacheKey, buf)

    res.set('Content-Type', 'audio/mpeg')
    res.set('Cache-Control', 'public, max-age=600')
    res.set('X-Voice', voice)
    res.set('X-Cache', 'MISS')
    res.send(buf)

  } catch (err) {
    console.error('[voice-tts] Edge TTS error:', err?.message || err)
    res.status(502).json({ error: 'Edge TTS فشل', details: err?.message })
  }
})

// GET /api/voice/voices
router.get('/voice/voices', (_req, res) => {
  res.json({ voices: VOICE_MAP, engine: 'Microsoft Edge TTS Neural', free: true })
})

export { router }
