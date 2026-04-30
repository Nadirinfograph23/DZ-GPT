// dz Voice Intelligence System — Text-to-Speech
// Primary engine: browser SpeechSynthesis API (free, offline, instant).
// Pluggable: a server-side Piper engine can register at runtime via setEngine().
// Cache: identical (text + voice + lang) → reuse the same Utterance config.

import { hasTTS, langTag, Emitter } from './utils.js'
import { VOICE_NAME_HINTS, DEFAULTS, TIMINGS } from './config.js'

// Split text into ≤maxChars chunks at sentence/clause boundaries so the
// browser's SpeechSynthesis can read long replies without truncation.
// Chrome cuts utterances around 200–250 chars / 15 s; chunking sidesteps that.
function splitForTTS(text, maxChars) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= maxChars) return [clean]
  // Sentence boundaries first (Latin + Arabic punctuation).
  const sentences = clean.split(/(?<=[.!?؟。…])\s+/)
  const chunks = []
  let buf = ''
  const push = (s) => { if (s.trim()) chunks.push(s.trim()) }
  for (const s of sentences) {
    if (s.length > maxChars) {
      // Sub-split very long sentences on commas / Arabic comma / semicolons.
      const parts = s.split(/(?<=[,،؛:])\s+/)
      let sub = ''
      for (const p of parts) {
        if (p.length > maxChars) {
          // Last resort: hard-wrap on whitespace at maxChars.
          if (sub) { push(sub); sub = '' }
          for (let i = 0; i < p.length; i += maxChars) push(p.slice(i, i + maxChars))
        } else if ((sub + ' ' + p).trim().length > maxChars) {
          push(sub); sub = p
        } else {
          sub = sub ? `${sub} ${p}` : p
        }
      }
      if (sub) { push(sub); sub = '' }
      continue
    }
    if ((buf + ' ' + s).trim().length > maxChars) { push(buf); buf = s }
    else buf = buf ? `${buf} ${s}` : s
  }
  if (buf) push(buf)
  return chunks
}

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
  // Serialization lock: prevents two TTS sessions from overlapping (each new
  // call cancels the previous one and waits its turn in this single-flight queue).
  let speakSeq = 0
  let keepAliveTimer = null

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

  function startKeepAlive() {
    if (!hasTTS() || keepAliveTimer) return
    // Chrome bug: SpeechSynthesis pauses itself after ~14 s of speaking.
    // Periodically poking pause()/resume() keeps it alive for long replies.
    keepAliveTimer = setInterval(() => {
      try {
        const synth = window.speechSynthesis
        if (synth.speaking && !synth.paused) {
          synth.pause()
          synth.resume()
        }
      } catch {}
    }, TIMINGS.ttsKeepAliveMs)
  }
  function stopKeepAlive() {
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null }
  }

  function cancel() {
    if (!hasTTS()) return
    speakSeq++ // invalidate any in-flight chunked session
    stopKeepAlive()
    try { window.speechSynthesis.cancel() } catch {}
  }

  function speakChunk(text, cfg, voices) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text)
      const v = voices.find(x => x.voiceURI === cfg.voiceURI)
      if (v) u.voice = v
      u.lang = cfg.lang
      u.rate = cfg.rate
      u.pitch = cfg.pitch
      u.onend = () => resolve({ ok: true })
      u.onerror = (e) => {
        // `interrupted` / `canceled` happen when we deliberately stop — not real errors.
        if (e.error === 'interrupted' || e.error === 'canceled') resolve({ ok: false, reason: e.error })
        else resolve({ ok: false, reason: e.error || 'tts-error' })
      }
      try { window.speechSynthesis.speak(u) } catch { resolve({ ok: false, reason: 'speak-failed' }) }
    })
  }

  async function speakBuiltin(text, { lang = 'en' } = {}) {
    if (!hasTTS()) throw new Error('SpeechSynthesis not supported')
    if (muted) return { skipped: true, reason: 'muted' }
    cancel()
    const mySeq = ++speakSeq
    const voices = await loadVoices()
    const voice = pickVoice(voices, lang, gender)
    const baseCfg = { voiceURI: voice?.voiceURI, lang: voice?.lang || langTag(lang), rate: 1.02, pitch: gender === 'female' ? 1.05 : 0.95 }
    const cacheKey = `${text}|${lang}|${gender}|${voice?.voiceURI || 'default'}`
    cachePut(cacheKey, baseCfg)

    const chunks = splitForTTS(text, TIMINGS.ttsMaxChunkChars)
    if (!chunks.length) return { skipped: true, reason: 'empty' }

    bus.emit('start', { text, lang })
    startKeepAlive()
    let lastResult = { ok: true }
    try {
      for (const chunk of chunks) {
        // If a new speak() superseded us, abort this session immediately.
        if (mySeq !== speakSeq || muted) { lastResult = { ok: false, reason: 'superseded' }; break }
        // eslint-disable-next-line no-await-in-loop
        const r = await speakChunk(chunk, baseCfg, voices)
        if (!r.ok && r.reason !== 'interrupted' && r.reason !== 'canceled') {
          lastResult = r
        }
        if (r.reason === 'interrupted' || r.reason === 'canceled') { lastResult = r; break }
      }
    } finally {
      if (mySeq === speakSeq) stopKeepAlive()
      bus.emit('end', { text, lang })
    }
    return { ok: lastResult.ok !== false, engine: 'speechSynthesis', chunks: chunks.length }
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
