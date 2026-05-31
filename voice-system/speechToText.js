// dz Voice Intelligence System — Speech-to-Text
// Wraps the browser Web Speech API. Supports AR/FR/EN with auto-language fallback.
//
// Public API:
//   const stt = createSTT(opts)
//   stt.start({ lang, continuous, interim })
//   stt.stop()
//   stt.on('result', ({ text, isFinal, confidence, lang }) => …)
//   stt.on('error', (err) => …)
//   stt.on('end', () => …)

import { hasSTT, langTag, Emitter, sleep } from './utils.js'
import { TIMINGS } from './config.js'

// ── فحص صلاحية الميكروفون قبل البدء ──────────────────────────────────────
export async function checkMicPermission() {
  if (!navigator.permissions) return 'prompt'
  try {
    const res = await navigator.permissions.query({ name: 'microphone' })
    return res.state // 'granted' | 'denied' | 'prompt'
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

export function createSTT() {
  const bus = new Emitter()
  let recognition = null
  let active = false
  let manualStop = false
  let retries = 0
  let currentLang = 'auto'

  function build(lang) {
    if (!hasSTT()) throw new Error('Web Speech API not supported in this browser')
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    const r = new Ctor()
    r.continuous = false       // ← false: يستمع لجملة واحدة كاملة ثم يتوقف
    r.interimResults = true
    r.maxAlternatives = 1
    r.lang = lang === 'auto' ? langTag('ar') : langTag(lang)
    return r
  }

  function attach(r) {
    r.onresult = (e) => {
      let interim = '', final = '', conf = 0
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const t = res[0].transcript
        if (res.isFinal) { final += t; conf = res[0].confidence || 0 }
        else interim += t
      }
      if (interim) bus.emit('result', { text: interim.trim(), isFinal: false, confidence: 0, lang: currentLang })
      if (final) {
        bus.emit('result', { text: final.trim(), isFinal: true, confidence: conf, lang: currentLang })
        // إيقاف فوري بعد النتيجة النهائية — يضمن تشغيل onend دائماً
        setTimeout(() => { try { r.stop() } catch {} }, 80)
      }
    }

    r.onerror = async (e) => {
      const code = e.error || 'unknown'
      // `aborted` يحدث عند الإيقاف المتعمد — صامت
      if (code === 'aborted') return
      // `no-speech` طبيعي — لا نُظهره للمستخدم
      if (code === 'no-speech') {
        bus.emit('end')
        active = false
        return
      }
      // network errors → retry
      if (code === 'network' && !manualStop && retries < TIMINGS.sttMaxRetries) {
        retries++
        await sleep(250)
        try { r.start() } catch {}
        return
      }
      bus.emit('error', { code, message: e.message || code })
    }

    r.onend = () => {
      // ← لا إعادة تشغيل تلقائية هنا أبداً
      // نُبلّغ فقط بالانتهاء، والـ controller يتكفل بإرسال الكلام
      active = false
      bus.emit('end')
    }

    r.onstart = () => {
      active = true
      retries = 0
      bus.emit('start')
    }
  }

  return {
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    isSupported: hasSTT,
    isActive: () => active,

    start({ lang = 'auto', continuous = false, interim = true } = {}) {
      if (active) return
      manualStop = false
      currentLang = lang
      try { recognition?.abort?.() } catch {}
      recognition = build(lang)
      recognition.continuous = continuous   // false = جملة واحدة ثم توقف
      recognition.interimResults = interim
      attach(recognition)
      try { recognition.start() } catch (e) {
        bus.emit('error', { code: 'start-failed', message: e.message })
      }
    },

    stop() {
      manualStop = true
      try { recognition?.stop?.() } catch {}
      active = false
    },

    abort() {
      manualStop = true
      try { recognition?.abort?.() } catch {}
      active = false
    },

    setLanguage(lang) {
      currentLang = lang
      if (active) {
        this.stop()
        setTimeout(() => this.start({ lang }), 80)
      }
    },
  }
}
