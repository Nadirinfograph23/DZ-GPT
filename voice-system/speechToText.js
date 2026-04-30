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
    r.continuous = true
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
      if (final)   bus.emit('result', { text: final.trim(),   isFinal: true,  confidence: conf, lang: currentLang })
    }
    r.onerror = async (e) => {
      const code = e.error || 'unknown'
      // `aborted` happens on intentional stop — silent.
      if (code === 'aborted') return
      // `no-speech` is normal during pauses; let onend auto-restart instead of
      // surfacing it as an error to the UI.
      if (code === 'no-speech' && !manualStop) return
      // Other transient errors → retry up to TIMINGS.sttMaxRetries.
      if (code === 'network' && !manualStop && retries < TIMINGS.sttMaxRetries) {
        retries++
        await sleep(250)
        try { r.start() } catch {}
        return
      }
      bus.emit('error', { code, message: e.message || code })
    }
    r.onend = () => {
      active = false
      // Web Speech (especially on Chrome) stops on its own after short silence
      // even when `continuous = true`. If the user hasn't manually stopped, we
      // immediately restart so the mic keeps listening for full sentences and
      // long pauses don't end the session prematurely.
      if (!manualStop) {
        try {
          r.start()
          return
        } catch {
          // InvalidStateError → wait a tick and retry once.
          setTimeout(() => {
            if (!manualStop) {
              try { r.start(); return } catch {}
            }
            bus.emit('end')
          }, 120)
          return
        }
      }
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

    start({ lang = 'auto', continuous = true, interim = true } = {}) {
      if (active) return
      manualStop = false
      currentLang = lang
      try { recognition?.abort?.() } catch {}
      recognition = build(lang)
      recognition.continuous = continuous
      recognition.interimResults = interim
      attach(recognition)
      try { recognition.start() } catch (e) {
        // Chrome throws InvalidStateError if start is called twice quickly.
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
        // Restart with new language on next tick.
        this.stop()
        setTimeout(() => this.start({ lang }), 80)
      }
    },
  }
}
