// DZ Voice API — Edge TTS Neural (Microsoft, مجاني بدون API Key)
// POST /api/voice/tts  → audio/mpeg
// GET  /api/voice/voices → قائمة الأصوات المتاحة
import express from 'express'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const router = express.Router()

// أصوات جزائرية حصرية + عربية + فرنسية + إنجليزية
// ar-DZ-IsmaelNeural = صوت رجل جزائري طبيعي ✅
// ar-DZ-AminaNeural  = صوت امرأة جزائرية طبيعية ✅
const VOICE_MAP = {
  ar: {
    female: 'ar-DZ-AminaNeural',
    male:   'ar-DZ-IsmaelNeural',
  },
  fr: {
    female: 'fr-FR-DeniseNeural',
    male:   'fr-FR-HenriNeural',
  },
  en: {
    female: 'en-US-JennyNeural',
    male:   'en-US-GuyNeural',
  },
}

// أصوات بديلة في حال فشل الأساسية
const FALLBACK_VOICE_MAP = {
  ar: {
    female: 'ar-SA-ZariyahNeural',
    male:   'ar-SA-HamedNeural',
  },
  fr: {
    female: 'fr-FR-VivienneNeural',
    male:   'fr-BE-GerardNeural',
  },
  en: {
    female: 'en-GB-SoniaNeural',
    male:   'en-GB-RyanNeural',
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

async function generateEdgeTTS(voice, text) {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const chunks = []
  await new Promise((resolve, reject) => {
    const stream = tts.toStream(text)
    stream.on('data',  chunk  => chunks.push(chunk))
    stream.on('end',   resolve)
    stream.on('error', reject)
  })
  const buf = Buffer.concat(chunks)
  if (!buf || buf.length < 100) throw new Error('empty audio buffer')
  return buf
}

// POST /api/voice/tts
router.post('/voice/tts', async (req, res) => {
  const { text, lang = 'ar', gender = 'female' } = req.body || {}
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text مطلوب' })
  }

  const clean   = text.trim().slice(0, 1000)
  const langKey = (lang.split('-')[0] || 'ar').toLowerCase()
  const voices  = VOICE_MAP[langKey]  || VOICE_MAP.ar
  const fallbacks = FALLBACK_VOICE_MAP[langKey] || FALLBACK_VOICE_MAP.ar
  const g       = (gender === 'male' || gender === 'female') ? gender : 'female'
  const voice   = voices[g]
  const cacheKey = `${voice}::${clean}`

  if (AUDIO_CACHE.has(cacheKey)) {
    const buf = AUDIO_CACHE.get(cacheKey)
    res.set('Content-Type', 'audio/mpeg')
    res.set('Cache-Control', 'public, max-age=600')
    res.set('X-Voice', voice)
    res.set('X-Cache', 'HIT')
    return res.send(buf)
  }

  let buf = null
  let usedVoice = voice

  // محاولة 1: الصوت الأساسي
  try {
    buf = await generateEdgeTTS(voice, clean)
  } catch (e1) {
    console.warn(`[voice-tts] Primary voice ${voice} failed: ${e1?.message} — trying fallback`)
    // محاولة 2: صوت بديل
    try {
      usedVoice = fallbacks[g]
      buf = await generateEdgeTTS(usedVoice, clean)
    } catch (e2) {
      console.error(`[voice-tts] Fallback voice ${usedVoice} also failed: ${e2?.message}`)
      return res.status(502).json({ error: 'Edge TTS فشل', details: e2?.message })
    }
  }

  cachePut(cacheKey, buf)

  res.set('Content-Type', 'audio/mpeg')
  res.set('Cache-Control', 'public, max-age=600')
  res.set('X-Voice', usedVoice)
  res.set('X-Cache', 'MISS')
  res.send(buf)
})

// GET /api/voice/voices
router.get('/voice/voices', (_req, res) => {
  res.json({
    voices: VOICE_MAP,
    engine: 'Microsoft Edge TTS Neural',
    free: true,
    note: 'ar-DZ-IsmaelNeural = صوت رجل جزائري طبيعي | ar-DZ-AminaNeural = صوت امرأة جزائرية',
  })
})

export { router }
