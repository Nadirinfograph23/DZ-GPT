// DZ Voice API — Edge TTS Neural + WhisperLive (Groq Whisper)
// POST /api/voice/tts               → audio/mpeg
// GET  /api/voice/voices            → قائمة الأصوات
// POST /api/voice/transcribe        → { text } — WhisperLive عبر Groq
// GET  /api/voice/whisper-status    → { available }

import express   from 'express'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const router = express.Router()

// ── خريطة الأصوات ────────────────────────────────────────────────────────────
const VOICE_MAP = {
  ar: { female: 'ar-DZ-AminaNeural',  male: 'ar-DZ-IsmaelNeural' },
  fr: { female: 'fr-FR-DeniseNeural', male: 'fr-FR-HenriNeural'  },
  en: { female: 'en-US-JennyNeural',  male: 'en-US-GuyNeural'    },
}
const FALLBACK_VOICE_MAP = {
  ar: { female: 'ar-SA-ZariyahNeural', male: 'ar-SA-HamedNeural'  },
  fr: { female: 'fr-FR-VivienneNeural',male: 'fr-BE-GerardNeural' },
  en: { female: 'en-GB-SoniaNeural',   male: 'en-GB-RyanNeural'   },
}

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

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/voice/tts
// ══════════════════════════════════════════════════════════════════════════════
router.post('/voice/tts', async (req, res) => {
  const { text, lang = 'ar', gender = 'male' } = req.body || {}
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text مطلوب' })
  }

  const clean     = text.trim().slice(0, 1000)
  const langKey   = (lang.split('-')[0] || 'ar').toLowerCase()
  const voices    = VOICE_MAP[langKey]    || VOICE_MAP.ar
  const fallbacks = FALLBACK_VOICE_MAP[langKey] || FALLBACK_VOICE_MAP.ar
  const g         = (gender === 'male' || gender === 'female') ? gender : 'male'
  const voice     = voices[g]
  const cacheKey  = `${voice}::${clean}`

  if (AUDIO_CACHE.has(cacheKey)) {
    const buf = AUDIO_CACHE.get(cacheKey)
    res.set('Content-Type', 'audio/mpeg')
    res.set('Cache-Control', 'public, max-age=600')
    res.set('X-Voice', voice); res.set('X-Cache', 'HIT')
    return res.send(buf)
  }

  let buf = null, usedVoice = voice
  try {
    buf = await generateEdgeTTS(voice, clean)
  } catch (e1) {
    console.warn(`[voice-tts] Primary ${voice} failed: ${e1?.message}`)
    try { usedVoice = fallbacks[g]; buf = await generateEdgeTTS(usedVoice, clean) }
    catch (e2) { return res.status(502).json({ error: 'Edge TTS فشل', details: e2?.message }) }
  }

  cachePut(cacheKey, buf)
  res.set('Content-Type', 'audio/mpeg')
  res.set('Cache-Control', 'public, max-age=600')
  res.set('X-Voice', usedVoice); res.set('X-Cache', 'MISS')
  res.send(buf)
})

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/voice/transcribe  — WhisperLive عبر Groq
// Body: { audio: base64, mimeType: 'audio/webm', language: 'ar' }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/voice/transcribe', async (req, res) => {
  const { audio, mimeType = 'audio/webm', language = 'ar' } = req.body || {}

  if (!audio || typeof audio !== 'string') {
    return res.status(400).json({ error: 'audio (base64) مطلوب' })
  }

  // مفتاح Groq
  const groqKey = process.env.AI_API_KEY || process.env.GROQ_API_KEY || ''
  if (!groqKey) {
    return res.status(503).json({ error: 'AI_API_KEY غير مُعيَّن — Whisper غير متاح' })
  }

  try {
    const audioBuf = Buffer.from(audio, 'base64')
    if (audioBuf.length < 1000) {
      return res.status(400).json({ error: 'الصوت قصير جداً' })
    }

    // تحديد امتداد الملف من mimeType
    const extMap = {
      'audio/webm':       'webm',
      'audio/ogg':        'ogg',
      'audio/mp4':        'mp4',
      'audio/mpeg':       'mp3',
      'audio/wav':        'wav',
      'audio/x-wav':      'wav',
      'audio/flac':       'flac',
    }
    const base = mimeType.split(';')[0].trim()
    const ext  = extMap[base] || 'webm'
    const filename = `audio.${ext}`

    // بناء FormData لـ Groq Whisper API
    const blob     = new Blob([audioBuf], { type: base })
    const formData = new FormData()
    formData.append('file',  blob, filename)
    formData.append('model', 'whisper-large-v3-turbo')
    if (language && language !== 'auto') {
      formData.append('language', language)
    }
    formData.append('response_format', 'json')

    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method:  'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body:    formData,
      signal:  AbortSignal.timeout(20_000),
    })

    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      console.warn(`[Whisper] Groq error ${r.status}: ${errText}`)
      return res.status(502).json({ error: `Groq Whisper فشل: ${r.status}` })
    }

    const json = await r.json()
    const text = (json.text || '').trim()

    console.log(`[Whisper] ✅ "${text.slice(0, 60)}" (${audioBuf.length.toLocaleString()} bytes, lang=${language})`)
    return res.json({ text, language, model: 'whisper-large-v3-turbo', bytes: audioBuf.length })

  } catch (err) {
    console.error('[Whisper] خطأ:', err.message)
    return res.status(500).json({ error: err.message || 'خطأ داخلي' })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/voice/whisper-status  — التحقق من توفر Whisper
// ══════════════════════════════════════════════════════════════════════════════
router.get('/voice/whisper-status', (_req, res) => {
  const available = !!(process.env.AI_API_KEY || process.env.GROQ_API_KEY)
  res.json({ available, engine: 'groq/whisper-large-v3-turbo', free: true })
})

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/voice/voices
// ══════════════════════════════════════════════════════════════════════════════
router.get('/voice/voices', (_req, res) => {
  res.json({
    voices:  VOICE_MAP,
    engine:  'Microsoft Edge TTS Neural',
    whisper: 'groq/whisper-large-v3-turbo',
    free:    true,
    note:    'ar-DZ-IsmaelNeural = صوت رجل جزائري | ar-DZ-AminaNeural = صوت امرأة جزائرية',
  })
})

export { router }
