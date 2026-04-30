// dz Voice Intelligence System — Wake Word Engine (V2)
// Lightweight, free, no external models. Uses a low-power SpeechRecognition
// stream and matches phonetic-ish substrings against the WAKE_WORDS list.
//
// Public API:
//   const ww = createWakeWord({ stt })
//   ww.enable()  // starts listening in background
//   ww.disable()
//   ww.on('wake', ({ phrase }) => …)
//
// The wake-word engine *shares the same STT instance* — when it detects a wake
// phrase it stops itself and emits 'wake' so the controller can switch the
// STT into "command" mode.

import { Emitter, normalize } from './utils.js'
import { WAKE_WORDS } from './config.js'

export function createWakeWord({ stt }) {
  if (!stt) throw new Error('createWakeWord: stt instance is required')
  const bus = new Emitter()
  let enabled = false
  let unsubResult = null
  let unsubEnd = null
  const wakeSet = WAKE_WORDS.map(normalize)

  function matches(text) {
    const n = normalize(text)
    return wakeSet.find(w => n.includes(w))
  }

  function start() {
    // Use AR by default — it covers Arabic wake words and the engine usually
    // still transcribes English words like "hey dz" reasonably.
    stt.start({ lang: 'ar', continuous: true, interim: true })
  }

  return {
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    isEnabled: () => enabled,

    enable() {
      if (enabled) return
      enabled = true
      unsubResult = stt.on('result', ({ text }) => {
        if (!enabled) return
        const hit = matches(text)
        if (hit) {
          enabled = false
          try { stt.stop() } catch {}
          bus.emit('wake', { phrase: hit, transcript: text })
        }
      })
      unsubEnd = stt.on('end', () => {
        // Auto-restart wake listener on browser-side timeouts.
        if (enabled) setTimeout(start, 300)
      })
      start()
    },

    disable() {
      enabled = false
      try { unsubResult?.() } catch {}
      try { unsubEnd?.() } catch {}
      try { stt.stop() } catch {}
    },

    customizePhrases(phrases) {
      if (!Array.isArray(phrases)) return
      wakeSet.length = 0
      for (const p of phrases) wakeSet.push(normalize(p))
    },
  }
}
