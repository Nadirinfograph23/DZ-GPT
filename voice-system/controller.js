// dz Voice Intelligence System — Controller
// Orchestrates STT → Router → TTS, plus V2 features (wake-word, continuous mode).
// This is the single entry point the UI talks to.
//
// Usage:
//   import { createDVIS } from '/voice-system/controller.js'
//   const dvis = createDVIS()
//   dvis.on('state', (s) => …)         // 'idle'|'listening'|'thinking'|'speaking'|'wake-listening'
//   dvis.on('transcript', ({ text, isFinal }) => …)
//   dvis.on('reply', ({ text }) => …)
//   dvis.on('error', (e) => …)
//   dvis.toggleListening()
//   dvis.setPrefs({ gender: 'male', muted: false, wakeWord: true, continuous: true })

import { createSTT }        from './speechToText.js'
import { createTTS }        from './textToSpeech.js'
import { createWakeWord }   from './wakeWordEngine.js'
import { createVoiceRouter }from './voiceRouter.js'
import { Emitter, detectLang, loadPrefs, savePrefs, sleep } from './utils.js'
import { TIMINGS, DVIS_VERSION } from './config.js'

export function createDVIS({ baseUrl = '' } = {}) {
  const bus = new Emitter()
  const stt = createSTT()
  const tts = createTTS()
  const router = createVoiceRouter({ baseUrl })

  // Wake-word engine uses its own STT instance to avoid colliding with command-mode.
  const wakeStt = createSTT()
  const wake = createWakeWord({ stt: wakeStt })

  let prefs = loadPrefs()
  let state = 'idle'
  let followUpTimer = null
  let lastUserText = ''
  let lastReplyText = ''
  let abortCtl = null
  // Buffered transcript: accumulates final fragments while the user is still
  // speaking, then is sent as one message after a short silence window so we
  // never cut a sentence in the middle.
  let sttBuffer = ''
  let sttSilenceTimer = null

  function setState(s) {
    if (state === s) return
    state = s
    bus.emit('state', s)
  }

  function clearFollowUp() {
    if (followUpTimer) { clearTimeout(followUpTimer); followUpTimer = null }
  }

  function clearSilence() {
    if (sttSilenceTimer) { clearTimeout(sttSilenceTimer); sttSilenceTimer = null }
  }

  function flushBuffer() {
    clearSilence()
    const text = sttBuffer.trim()
    sttBuffer = ''
    if (!text) return
    // Stop the mic the moment we have a finalized utterance so it doesn't
    // keep listening while the AI is thinking / speaking. Without this, the
    // STT engine auto-restarts in `onend` and the microphone stays hot.
    try { stt.stop() } catch {}
    lastUserText = text
    handleUserText(text)
  }

  function applyPrefs() {
    tts.setGender(prefs.gender)
    tts.setMuted(prefs.muted)
  }
  applyPrefs()

  // ── STT wiring ─────────────────────────────────────────────────────────
  stt.on('result', ({ text, isFinal, lang }) => {
    bus.emit('transcript', { text, isFinal, lang })
    if (isFinal && text) {
      // Append to buffer (with a separating space if needed) and arm the
      // silence timer. Each new final fragment resets the timer so the user
      // can keep speaking as long as they want without being cut off.
      sttBuffer = sttBuffer ? `${sttBuffer} ${text}` : text
      clearSilence()
      sttSilenceTimer = setTimeout(flushBuffer, TIMINGS.sttSilenceMs)
    }
  })
  stt.on('error', (e) => bus.emit('error', e))
  stt.on('end',   () => {
    // If recognition really ended (manual stop) and we still have buffered
    // text, send it now instead of dropping it on the floor.
    if (sttBuffer.trim()) flushBuffer()
    if (state === 'listening') setState('idle')
  })

  // ── Wake-word wiring ───────────────────────────────────────────────────
  wake.on('wake', ({ phrase }) => {
    bus.emit('wake', { phrase })
    // Switch to active command listening immediately.
    setState('listening')
    const t = TIMINGS.responseTargetMs // arbitrary tiny gap
    setTimeout(() => stt.start({ lang: resolveLang(), continuous: true, interim: true }), 60)
  })

  function resolveLang() {
    // Arabic is the PRIMARY language for dz Agent's voice mode.
    // 'auto' means: start in Arabic, then follow whatever the user actually
    // speaks on subsequent turns (detectLang of last transcript).
    if (prefs.language && prefs.language !== 'auto') return prefs.language
    if (lastUserText) {
      const d = detectLang(lastUserText)
      // detectLang returns 'en' for empty/non-script text — only honour it
      // when we're certain it isn't a default fallback.
      return d
    }
    return 'ar'
  }

  // ── Core flow: user text → AI → speak → maybe re-listen ───────────────
  async function handleUserText(text) {
    clearFollowUp()
    setState('thinking')
    abortCtl?.abort?.()
    abortCtl = typeof AbortController !== 'undefined' ? new AbortController() : null

    const language = detectLang(text) || resolveLang()
    const t0 = performance.now?.() || Date.now()
    const { text: replyText, source } = await router.ask(text, { language, signal: abortCtl?.signal })
    lastReplyText = replyText
    bus.emit('reply', { text: replyText, source, language })

    if (replyText && !prefs.muted) {
      setState('speaking')
      // Voice replies are ALWAYS spoken in Arabic for dz Agent's voice mode,
      // regardless of the input language. Users explicitly requested AR voice.
      try { await tts.speak(replyText, { lang: 'ar' }) } catch (e) { bus.emit('error', e) }
    }
    const dt = (performance.now?.() || Date.now()) - t0
    if (dt > TIMINGS.responseTargetMs) console.debug('[dvis] slow round-trip', Math.round(dt), 'ms')

    setState('idle')

    // V2: continuous conversation — re-arm STT for follow-up.
    if (prefs.continuous && !prefs.muted) {
      followUpTimer = setTimeout(() => {
        // Auto-sleep after silence window.
        if (state === 'idle') bus.emit('auto-sleep')
      }, TIMINGS.followUpSilenceMs)
      try { stt.start({ lang: language, continuous: true, interim: true }); setState('listening') }
      catch {}
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return {
    version: DVIS_VERSION,
    on: bus.on.bind(bus),
    off: bus.off.bind(bus),

    getState: () => state,
    getPrefs: () => ({ ...prefs }),
    isSttSupported: stt.isSupported,
    isTtsSupported: tts.isSupported,
    listVoices: tts.listVoices,

    setPrefs(patch) {
      const prev = prefs
      prefs = { ...prefs, ...patch }
      savePrefs(prefs)
      applyPrefs()
      // React to wake-word toggle changes.
      if (prev.wakeWord !== prefs.wakeWord) {
        if (prefs.wakeWord) { setState('wake-listening'); wake.enable() }
        else { wake.disable(); if (state === 'wake-listening') setState('idle') }
      }
      bus.emit('prefs', { ...prefs })
    },

    async preload() {
      try { await tts.preload() } catch {}
    },

    startListening({ lang } = {}) {
      clearFollowUp()
      // Stop wake-word while we're actively listening for a command.
      if (prefs.wakeWord) wake.disable()
      try {
        stt.start({ lang: lang || resolveLang(), continuous: true, interim: true })
        setState('listening')
      } catch (e) { bus.emit('error', e) }
    },

    stopListening() {
      clearFollowUp()
      // Send anything still buffered before fully stopping.
      if (sttBuffer.trim()) flushBuffer()
      try { stt.stop() } catch {}
      setState('idle')
      // Re-arm wake word if it was on.
      if (prefs.wakeWord) { setState('wake-listening'); wake.enable() }
    },

    toggleListening() {
      if (state === 'listening') this.stopListening()
      else this.startListening()
    },

    cancelSpeech() {
      try { tts.cancel() } catch {}
      if (state === 'speaking') setState('idle')
    },

    // Speak arbitrary text (used by host to read AI replies coming from text mode too).
    // dz Agent voice mode is Arabic-only by product decision — force AR unless
    // the caller explicitly overrides via opts.lang.
    async speak(text, opts = {}) {
      const lang = opts.lang || 'ar'
      setState('speaking')
      try { await tts.speak(text, { lang }) } finally { setState('idle') }
    },

    // Auto-speak helper for text-mode chat: only speaks SHORT replies so the
    // assistant feels conversational without becoming a monologue.
    // Skips if: muted, currently speaking/listening, text too long, or already
    // contains code blocks / tables / long links.
    async speakIfShort(text, opts = {}) {
      if (prefs.muted) return { skipped: 'muted' }
      if (state === 'speaking' || state === 'listening') return { skipped: state }
      const raw = String(text || '').trim()
      if (!raw) return { skipped: 'empty' }
      const maxChars = opts.maxChars ?? 280
      const maxSentences = opts.maxSentences ?? 3
      // Strip markdown / code so we don't "read" syntax.
      const clean = raw
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]*`/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[#>*_~|]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!clean) return { skipped: 'no-speakable-text' }
      if (clean.length > maxChars) return { skipped: 'too-long', length: clean.length }
      const sentences = clean.split(/[.!?؟…]\s+/).filter(s => s.trim().length > 0)
      if (sentences.length > maxSentences) return { skipped: 'too-many-sentences', count: sentences.length }
      // Looks like a code dump — skip.
      if (/https?:\/\/\S{60,}/.test(clean)) return { skipped: 'long-url' }
      const lang = opts.lang || 'ar'
      setState('speaking')
      try { await tts.speak(clean, { lang }) } finally { setState('idle') }
      return { ok: true, length: clean.length, lang }
    },

    // Send arbitrary text to the agent and speak the reply (programmatic entry).
    async send(text) {
      lastUserText = text
      return handleUserText(text)
    },

    destroy() {
      clearFollowUp()
      clearSilence()
      sttBuffer = ''
      try { stt.abort() } catch {}
      try { wakeStt.abort() } catch {}
      try { tts.cancel() } catch {}
      wake.disable()
    },
  }
}
