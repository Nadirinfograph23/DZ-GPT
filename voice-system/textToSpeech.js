// dz Voice Intelligence System — Text-to-Speech
// Primary engine: browser SpeechSynthesis API (free, offline, instant).
// Pluggable: a server-side Piper engine can register at runtime via setEngine().
// Cache: identical (text + voice + lang) → reuse the same Utterance config.

import { hasTTS, langTag, Emitter, sleep } from './utils.js'
import { VOICE_NAME_HINTS, DEFAULTS } from './config.js'

// Pluggable engine. `null` → use the built-in SpeechSynthesis engine.
let externalEngine = null
export function setEngine(engine) { externalEngine = engine }

// Utterance config cache — keyed by `text|lang|gender`.
const UTTER_CACHE = new Map()
const CACHE_MAX = 64

function cachePut(key, val) {
  if (UTTER_CACHE.size >= CACHE_MAX) {
    const first = UTTER_CACHE.keys().next().value
    if (first) UTTER_CACHE.delete(first)
  }
  UTTER_CACHE.set(key, val)
}

// Lazy voice loading — Chrome populates voices async.
let voicesPromise = null
function loadVoices() {
  if (!hasTTS()) return Promise.resolve([])
  if (voicesPromise) return voicesPromise
  voicesPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis
    const ready = synth.getVoices()
    if (ready && ready.length) return resolve(ready)
    synth.onvoiceschanged = () => resolve(synth.getVoices())
    setTimeout(() => resolve(synth.getVoices() || []), 1500)
  })
  return voicesPromise
}

function pickVoice(voices, lang, gender) {
  const tag = langTag(lang)
  const langPrefix = tag.split('-')[0]
  const matches = voices.filter(v => v.lang?.toLowerCase().startsWith(langPrefix))
  if (!matches.length) return voices[0] || null
  const hints = VOICE_NAME_HINTS[gender] || []
  const byHint = matches.find(v => hints.some(h => v.name?.toLowerCase().includes(h)))
  if (byHint) return byHint
  // Fallback heuristic: many systems ship "Microsoft Zira" (female) and "Microsoft David" (male).
  if (gender === 'female') {
    const fem = matches.find(v => /female|woman|f$|zira|samantha|victoria|amelie/i.test(v.name || ''))
    if (fem) return fem
  }
  return matches[0]
}

export function createTTS({ defaultGender = DEFAULTS.gender } = {}) {
  const bus = new Emitter()
  let muted = false
  let gender = defaultGender
  let warmedUp = false

  // Warm up SpeechSynthesis so the very first utterance has no perceptible delay.
  async function preload() {
    if (warmedUp || !hasTTS()) return
    warmedUp = true
    try { await loadVoices() } catch {}
    try {
      // Silent warm-up utterance — volume 0, very short.
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0; u.rate = 2
      window.speechSynthesis.speak(u)
    } catch {}
  }

  function cancel() {
    if (!hasTTS()) return
    try { window.speechSynthesis.cancel() } catch {}
  }

  async function speakBuiltin(text, { lang = 'en' } = {}) {
    if (!hasTTS()) throw new Error('SpeechSynthesis not supported')
    if (muted) return { skipped: true, reason: 'muted' }
    cancel()
    const voices = await loadVoices()
    const voice = pickVoice(voices, lang, gender)
    const key = `${text}|${lang}|${gender}|${voice?.voiceURI || 'default'}`
    let cfg = UTTER_CACHE.get(key)
    if (!cfg) {
      cfg = { voiceURI: voice?.voiceURI, lang: voice?.lang || langTag(lang), rate: 1.02, pitch: gender === 'female' ? 1.05 : 0.95 }
      cachePut(key, cfg)
    }
    return new Promise((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(text)
      const v = voices.find(x => x.voiceURI === cfg.voiceURI)
      if (v) u.voice = v
      u.lang = cfg.lang
      u.rate = cfg.rate
      u.pitch = cfg.pitch
      u.onstart = () => bus.emit('start', { text, lang })
      u.onend   = () => { bus.emit('end', { text, lang }); resolve({ ok: true, engine: 'speechSynthesis' }) }
      u.onerror = (e) => {
        bus.emit('error', { code: e.error || 'tts-error', message: e.error })
        // `interrupted` happens when we cancel mid-speech for a new utterance — not a real error.
        if (e.error === 'interrupted' || e.error === 'canceled') resolve({ ok: false, reason: e.error })
        else reject(new Error(e.error || 'tts-error'))
      }
      try { window.speechSynthesis.speak(u) } catch (err) { reject(err) }
    })
  }

  async function speak(text, { lang = 'en' } = {}) {
    const trimmed = String(text || '').trim()
    if (!trimmed) return { skipped: true, reason: 'empty' }
    // External engine (e.g. Piper via WASM) takes priority if registered.
    if (externalEngine && typeof externalEngine.speak === 'function') {
      try { return await externalEngine.speak(trimmed, { lang, gender, muted }) }
      catch (e) { console.warn('[dvis-tts] external engine failed, falling back:', e.message) }
    }
    return speakBuiltin(trimmed, { lang })
  }

  return {
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),
    isSupported: () => hasTTS() || Boolean(externalEngine),
    setGender(g) { gender = (g === 'male' || g === 'female') ? g : gender },
    getGender: () => gender,
    setMuted(m) { muted = Boolean(m); if (muted) cancel() },
    isMuted: () => muted,
    listVoices: loadVoices,
    preload,
    speak,
    cancel,
    speaking: () => hasTTS() && window.speechSynthesis.speaking,
  }
}
