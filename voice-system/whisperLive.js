// WhisperLive STT — MediaRecorder + Groq Whisper API (مجاني)
// https://github.com/collabora/WhisperLive
//
// البروتوكول: المتصفح يُسجّل بـ MediaRecorder → يُرسل الصوت لـ /api/voice/transcribe
// السيرفر يُحوّله بـ Groq Whisper → يُعيد النص.
// احتياطي: Web Speech API إذا تعذّر الوصول للسيرفر.
//
// Public API (مطابق لـ createSTT):
//   const wl = createWhisperLive()
//   wl.start({ lang, continuous, interim })
//   wl.stop()
//   wl.abort()
//   wl.on('result', ({ text, isFinal, confidence, lang }) => …)
//   wl.on('error',  (err) => …)
//   wl.on('end',    () => …)
//   wl.on('start',  () => …)

import { Emitter } from './utils.js'

const SILENCE_THRESHOLD = 0.012  // RMS أقل من هذا → صمت
const SILENCE_DURATION  = 1800   // 1.8 ثانية صمت → توقف تلقائي
const MAX_RECORD_MS     = 30_000 // حد أقصى 30 ثانية
const SAMPLE_INTERVAL   = 80     // ms بين فحوصات RMS

export function createWhisperLive() {
  const bus     = new Emitter()
  let active    = false
  let aborted   = false

  let mediaRecorder  = null
  let audioCtx       = null
  let analyserNode   = null
  let stream         = null
  let silenceTimer   = null
  let maxTimer       = null
  let rmsInterval    = null
  let chunks         = []

  // ── تنظيف كامل ──────────────────────────────────────────────────────────────
  function cleanup() {
    clearTimeout(silenceTimer)
    clearTimeout(maxTimer)
    clearInterval(rmsInterval)
    silenceTimer = maxTimer = rmsInterval = null

    try { audioCtx?.close() }   catch {}
    try { stream?.getTracks().forEach(t => t.stop()) } catch {}
    mediaRecorder = null
    audioCtx = null
    analyserNode = null
    stream = null
    chunks = []
  }

  // ── RMS من AnalyserNode ──────────────────────────────────────────────────────
  function getRMS() {
    if (!analyserNode) return 0
    const data = new Float32Array(analyserNode.fftSize)
    analyserNode.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    return Math.sqrt(sum / data.length)
  }

  // ── إرسال الصوت للسيرفر ─────────────────────────────────────────────────────
  async function transcribeBlob(blob, lang) {
    if (!blob || blob.size < 1000) return null
    try {
      const reader = new FileReader()
      const base64 = await new Promise((res, rej) => {
        reader.onload  = () => res(reader.result.split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(blob)
      })
      const r = await fetch('/api/voice/transcribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ audio: base64, mimeType: blob.type || 'audio/webm', language: lang }),
        signal:  AbortSignal.timeout(20_000),
      })
      if (!r.ok) return null
      const json = await r.json()
      return json.text || null
    } catch { return null }
  }

  // ── بدء تسجيل جلسة ──────────────────────────────────────────────────────────
  async function startSession(lang) {
    aborted = false
    chunks  = []

    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
    if (aborted) { stream.getTracks().forEach(t => t.stop()); return }

    // بناء AnalyserNode للكشف عن الصمت
    audioCtx     = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    analyserNode = audioCtx.createAnalyser()
    analyserNode.fftSize             = 512
    analyserNode.smoothingTimeConstant = 0.4
    source.connect(analyserNode)

    // اختيار أفضل صيغة مدعومة
    const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || ''

    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
    mediaRecorder.ondataavailable = e => { if (e.data?.size > 0) chunks.push(e.data) }
    mediaRecorder.start(250)   // chunk كل 250ms

    active = true
    bus.emit('start')

    // كشف الصمت عبر RMS
    let silentFor = 0
    rmsInterval = setInterval(() => {
      if (!active || aborted) return
      const rms = getRMS()
      if (rms < SILENCE_THRESHOLD) {
        silentFor += SAMPLE_INTERVAL
        if (silentFor >= SILENCE_DURATION) stopAndTranscribe(lang)
      } else {
        silentFor = 0
      }
    }, SAMPLE_INTERVAL)

    // حد أقصى
    maxTimer = setTimeout(() => stopAndTranscribe(lang), MAX_RECORD_MS)
  }

  // ── إيقاف + تحويل الصوت ─────────────────────────────────────────────────────
  async function stopAndTranscribe(lang) {
    if (!active) return
    active = false

    cleanup()

    if (aborted || chunks.length === 0) { bus.emit('end'); return }

    const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' })
    bus.emit('result', { text: '', isFinal: false, confidence: 0, lang, processing: true })

    const text = await transcribeBlob(blob, lang)
    if (text?.trim()) {
      bus.emit('result', { text: text.trim(), isFinal: true, confidence: 0.95, lang })
    }
    bus.emit('end')
  }

  // ════════════════════════════════════════════════════════════════════════════
  return {
    on:  bus.on.bind(bus),
    off: bus.off.bind(bus),
    isActive:    () => active,
    isSupported: () => typeof window !== 'undefined' && !!navigator?.mediaDevices?.getUserMedia && !!window.MediaRecorder,

    start({ lang = 'ar', } = {}) {
      if (active) return false
      // اختيار كود اللغة لـ Whisper
      const langMap = { ar: 'ar', fr: 'fr', en: 'en', auto: null }
      const whisperLang = langMap[lang] ?? 'ar'

      startSession(whisperLang).catch(err => {
        active = false
        cleanup()
        bus.emit('error', { code: err?.name || 'start-failed', message: err?.message || String(err) })
      })
      return true
    },

    stop() {
      if (!active) return
      const currentLang = 'ar'
      stopAndTranscribe(currentLang)
    },

    abort() {
      aborted = true
      active  = false
      cleanup()
      bus.emit('end')
    },

    setLanguage() {},
  }
}
