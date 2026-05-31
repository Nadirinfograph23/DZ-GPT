// dz Voice Intelligence System — Speech-to-Text v4.0
// يستخدم WhisperLive (Groq Whisper) كأساس + Web Speech API كاحتياط
//
// Public API:
//   const stt = createSTT()
//   stt.start({ lang, continuous, interim })  → true | false
//   stt.stop()
//   stt.abort()
//   stt.on('result', ({ text, isFinal, confidence, lang }) => …)
//   stt.on('error',  (err) => …)
//   stt.on('end',    () => …)
//   stt.on('start',  () => …)

import { hasSTT, langTag, Emitter, sleep } from './utils.js'
import { TIMINGS } from './config.js'
import { createWhisperLive } from './whisperLive.js'

// ── فحص صلاحية الميكروفون قبل البدء ──────────────────────────────────────
export async function checkMicPermission() {
  if (!navigator.permissions) return 'prompt'
  try {
    const res = await navigator.permissions.query({ name: 'microphone' })
    return res.state
  } catch {
    return 'prompt'
  }
}

// ── طلب الإذن الصريح عبر getUserMedia ────────────────────────────────────
export async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    stream.getTracks().forEach(t => t.stop())
    return { granted: true }
  } catch (err) {
    const code = err?.name || 'unknown'
    if (code === 'NotAllowedError' || code === 'PermissionDeniedError') return { granted: false, denied: true }
    if (code === 'NotFoundError') return { granted: false, noDevice: true }
    return { granted: false, error: code }
  }
}

// ── التحقق من توفر خادم Whisper ───────────────────────────────────────────
let _whisperAvailable = null
async function checkWhisperAvailable() {
  if (_whisperAvailable !== null) return _whisperAvailable
  try {
    const r = await fetch('/api/voice/whisper-status', { signal: AbortSignal.timeout(3000) })
    _whisperAvailable = r.ok && (await r.json()).available === true
  } catch {
    _whisperAvailable = false
  }
  return _whisperAvailable
}

// ── بناء STT بـ Web Speech API (احتياطي) ──────────────────────────────────
function createWebSpeechSTT() {
  const bus        = new Emitter()
  let recognition  = null
  let active       = false
  let manualStop   = false
  let retries      = 0
  let currentLang  = 'auto'
  let sessionId    = 0

  function resolveLangTag(lang) {
    if (!lang || lang === 'auto') return 'ar-SA'
    const map = { ar: 'ar-SA', fr: 'fr-FR', en: 'en-US' }
    return map[lang] || langTag(lang) || 'ar-SA'
  }

  function build(lang) {
    if (!hasSTT()) throw new Error('Web Speech API غير مدعوم في هذا المتصفح')
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    const r    = new Ctor()
    r.continuous      = false
    r.interimResults  = true
    r.maxAlternatives = 1
    r.lang = resolveLangTag(lang)
    return r
  }

  function attach(r, sid) {
    let silenceTimer = null
    function guard(fn) {
      return (...args) => { if (sessionId !== sid) return; fn(...args) }
    }
    function clearSilence() {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null }
    }

    r.onresult = guard((e) => {
      clearSilence()
      let interim = '', final = '', conf = 0
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const t   = res[0].transcript
        if (res.isFinal) { final += t; conf = res[0].confidence || 0 }
        else              interim += t
      }
      if (interim) bus.emit('result', { text: interim.trim(), isFinal: false, confidence: 0, lang: currentLang })
      if (final) {
        bus.emit('result', { text: final.trim(), isFinal: true, confidence: conf, lang: currentLang })
        setTimeout(() => { try { r.stop() } catch {} }, 80)
      }
    })

    r.onspeechend  = guard(() => { clearSilence(); silenceTimer = setTimeout(() => { try { r.stop() } catch {} }, 700) })
    r.onspeechstart = guard(() => clearSilence())
    r.onsoundend   = guard(() => { if (!silenceTimer) silenceTimer = setTimeout(() => { try { r.stop() } catch {} }, 1000) })
    r.onsoundstart = guard(() => clearSilence())

    r.onerror = guard(async (e) => {
      clearSilence()
      const code = e.error || 'unknown'
      if (code === 'aborted') return
      if (code === 'no-speech') { active = false; bus.emit('end'); return }
      if (code === 'language-not-supported') {
        active = false; sessionId++
        const newSid = sessionId
        recognition = build('ar'); recognition.lang = 'ar-SA'
        attach(recognition, newSid)
        try { recognition.start(); active = true } catch {}
        return
      }
      if (code === 'network' && !manualStop && retries < TIMINGS.sttMaxRetries) {
        retries++; await sleep(500)
        try { r.start() } catch {}
        return
      }
      active = false
      bus.emit('error', { code, message: e.message || code })
    })

    r.onend   = guard(() => { clearSilence(); active = false; bus.emit('end') })
    r.onstart = guard(() => { active = true; retries = 0; bus.emit('start') })
  }

  return {
    on:  bus.on.bind(bus),
    off: bus.off.bind(bus),
    isSupported: hasSTT,
    isActive:    () => active,
    start({ lang = 'auto', continuous = false, interim = true } = {}) {
      sessionId++
      const sid = sessionId
      try { recognition?.abort?.() } catch {}
      active = false; manualStop = false; retries = 0; currentLang = lang
      try {
        recognition = build(lang)
        recognition.continuous = continuous
        recognition.interimResults = interim
        attach(recognition, sid)
        recognition.start()
        return true
      } catch (e) {
        active = false
        bus.emit('error', { code: 'start-failed', message: e.message })
        return false
      }
    },
    stop()  { manualStop = true; try { recognition?.stop?.() } catch {}; active = false },
    abort() { sessionId++; manualStop = true; try { recognition?.abort?.() } catch {}; active = false },
    setLanguage(lang) {
      currentLang = lang
      if (active) { this.stop(); setTimeout(() => this.start({ lang }), 80) }
    },
  }
}

// ── الدالة الرئيسية: تُعيد WhisperLive إذا توفّر، وإلا Web Speech API ────
export function createSTT() {
  // ابدأ بـ WhisperLive مباشرة (يُعيد fallback تلقائياً عند الفشل)
  const wl  = createWhisperLive()
  const wsa = hasSTT() ? createWebSpeechSTT() : null

  const bus      = new Emitter()
  let active     = false
  let useWhisper = true   // يبدأ بـ Whisper ويرجع لـ WSA إذا فشل

  // ── تفويض الأحداث ─────────────────────────────────────────────────────────
  function delegate(stt) {
    stt.on('start',  (...a) => { active = true;  bus.emit('start', ...a) })
    stt.on('end',    (...a) => { active = false; bus.emit('end',   ...a) })
    stt.on('result', (...a) => bus.emit('result', ...a))
    stt.on('error',  (err)  => {
      // إذا فشل Whisper → جرّب Web Speech API
      if (useWhisper && wsa && (err.code === 'start-failed' || err.code === 'NotAllowedError' || err.code === 'network')) {
        console.warn('[STT] Whisper فشل، نرجع لـ Web Speech API:', err.message)
        useWhisper = false
        return
      }
      bus.emit('error', err)
    })
  }

  delegate(wl)
  if (wsa) delegate(wsa)

  return {
    on:  bus.on.bind(bus),
    off: bus.off.bind(bus),
    isSupported: () => wl.isSupported() || hasSTT(),
    isActive:    () => active,

    start(opts = {}) {
      if (wl.isSupported()) {
        useWhisper = true
        return wl.start(opts)
      }
      if (wsa) return wsa.start(opts)
      bus.emit('error', { code: 'not-supported', message: 'لا يوجد محرك STT متاح' })
      return false
    },

    stop() {
      if (useWhisper && wl.isActive()) { wl.stop(); return }
      if (wsa?.isActive()) wsa.stop()
    },

    abort() {
      wl.abort()
      wsa?.abort()
      active = false
    },

    setLanguage(lang) {
      if (useWhisper) wl.setLanguage?.(lang)
      else wsa?.setLanguage?.(lang)
    },
  }
}
