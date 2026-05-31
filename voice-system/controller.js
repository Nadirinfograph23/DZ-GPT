// dz Voice Intelligence System — Controller v2.1
// Orchestrates STT → Router → TTS (Edge Neural أولاً، browser fallback)
// Entry point for VoicePanel and DZChatBox.

import { createSTT }         from './speechToText.js'
import { createTTS, setEngine } from './textToSpeech.js'
import { createWakeWord }    from './wakeWordEngine.js'
import { createVoiceRouter } from './voiceRouter.js'
import { edgeTtsEngine }     from './edgeTtsEngine.js'
import { Emitter, detectLang, loadPrefs, savePrefs } from './utils.js'
import { TIMINGS, DVIS_VERSION, DEFAULTS } from './config.js'

// تسجيل Edge TTS كـ engine رئيسي (مجاني، طبيعي، جزائري)
// إذا فشل (offline)، textToSpeech.js يرجع تلقائياً لـ SpeechSynthesis
async function registerEdgeEngine() {
  try {
    const ok = await edgeTtsEngine.probe()
    if (ok) {
      setEngine(edgeTtsEngine)
      console.info('[dvis] Edge TTS Neural: نشط ✅ (ar-DZ-AminaNeural/IsmaelNeural)')
    } else {
      console.warn('[dvis] Edge TTS غير متاح — استخدام SpeechSynthesis كـ fallback')
    }
  } catch {
    console.warn('[dvis] Edge TTS probe فشل — fallback لـ browser TTS')
  }
}
registerEdgeEngine()

export function createDVIS({ baseUrl = '' } = {}) {
  const bus    = new Emitter()
  const stt    = createSTT()
  const tts    = createTTS()
  const router = createVoiceRouter({ baseUrl })

  const wakeStt = createSTT()
  const wake    = createWakeWord({ stt: wakeStt })

  let prefs           = loadPrefs()
  let state           = 'idle'
  let followUpTimer   = null
  let lastUserText    = ''
  let lastReplyText   = ''
  let abortCtl        = null
  let sttBuffer       = ''
  let sttSilenceTimer = null
  let sttMaxTimer     = null   // ← حدّ أقصى للاستماع

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

  function clearMaxTimer() {
    if (sttMaxTimer) { clearTimeout(sttMaxTimer); sttMaxTimer = null }
  }

  function startMaxTimer() {
    clearMaxTimer()
    sttMaxTimer = setTimeout(() => {
      if (state === 'listening') {
        if (sttBuffer.trim()) flushBuffer()
        else {
          try { stt.stop() } catch {}
          setState('idle')
        }
        bus.emit('max-listen-reached')
      }
    }, TIMINGS.sttMaxListenMs)
  }

  function flushBuffer() {
    clearSilence()
    const text = sttBuffer.trim()
    sttBuffer = ''
    if (!text) return
    try { stt.stop() } catch {}
    lastUserText = text
    handleUserText(text)
  }

  function applyPrefs() {
    tts.setGender(prefs.gender)
    tts.setMuted(prefs.muted)
  }
  applyPrefs()

  stt.on('result', ({ text, isFinal, lang }) => {
    bus.emit('transcript', { text, isFinal, lang })
    if (isFinal && text) {
      sttBuffer = sttBuffer ? `${sttBuffer} ${text}` : text
      clearSilence()
      sttSilenceTimer = setTimeout(flushBuffer, TIMINGS.sttSilenceMs)
    }
  })
  stt.on('error', (e) => bus.emit('error', e))
  stt.on('end',   () => {
    if (sttBuffer.trim()) flushBuffer()
    if (state === 'listening') setState('idle')
  })

  wake.on('wake', ({ phrase }) => {
    bus.emit('wake', { phrase })
    setState('listening')
    setTimeout(() => stt.start({ lang: resolveLang(), continuous: true, interim: true }), 60)
  })

  function resolveLang() {
    if (prefs.language && prefs.language !== 'auto') return prefs.language
    if (lastUserText) return detectLang(lastUserText)
    return 'ar'
  }

  async function handleUserText(text) {
    clearFollowUp()
    setState('thinking')
    abortCtl?.abort?.()
    abortCtl = typeof AbortController !== 'undefined' ? new AbortController() : null

    const language = detectLang(text) || resolveLang()
    const { text: replyText, source } = await router.ask(text, { language, signal: abortCtl?.signal })
    lastReplyText = replyText
    bus.emit('reply', { text: replyText, source, language })

    if (replyText && !prefs.muted) {
      setState('speaking')
      try {
        await tts.speak(replyText, { lang: language || 'ar' })
      } catch (e) { bus.emit('error', e) }
    }

    setState('idle')

    if (prefs.continuous && !prefs.muted) {
      followUpTimer = setTimeout(() => {
        if (state === 'idle') bus.emit('auto-sleep')
      }, TIMINGS.followUpSilenceMs)
      try {
        stt.start({ lang: language, continuous: true, interim: true })
        setState('listening')
      } catch {}
    }
  }

  return {
    version: DVIS_VERSION,
    on:  bus.on.bind(bus),
    off: bus.off.bind(bus),

    getState:       () => state,
    getPrefs:       () => ({ ...prefs }),
    isSttSupported: stt.isSupported,
    isTtsSupported: () => true, // دائماً true — Edge TTS يعمل حتى بدون browser TTS
    listVoices:     tts.listVoices,

    setPrefs(patch) {
      const prev = prefs
      prefs = { ...prefs, ...patch }
      savePrefs(prefs)
      applyPrefs()
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
      if (prefs.wakeWord) wake.disable()
      try {
        stt.start({ lang: lang || resolveLang(), continuous: true, interim: true })
        setState('listening')
        startMaxTimer()
      } catch (e) { bus.emit('error', e) }
    },

    stopListening() {
      clearFollowUp()
      clearMaxTimer()
      if (sttBuffer.trim()) flushBuffer()
      try { stt.stop() } catch {}
      setState('idle')
      if (prefs.wakeWord) { setState('wake-listening'); wake.enable() }
    },

    toggleListening() {
      if (state === 'listening') this.stopListening()
      else this.startListening()
    },

    cancelSpeech() {
      try { tts.cancel() } catch {}
      try { edgeTtsEngine.cancel() } catch {}
      if (state === 'speaking') setState('idle')
    },

    async speak(text, opts = {}) {
      const lang = opts.lang || resolveLang() || 'ar'
      setState('speaking')
      try { await tts.speak(text, { lang }) } finally { setState('idle') }
    },

    async speakIfShort(text, opts = {}) {
      if (prefs.muted) return { skipped: 'muted' }
      if (state === 'speaking' || state === 'listening') return { skipped: state }
      const raw = String(text || '').trim()
      if (!raw) return { skipped: 'empty' }
      const maxChars = opts.maxChars ?? 320
      const maxSentences = opts.maxSentences ?? 4
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
      if (sentences.length > maxSentences) return { skipped: 'too-many-sentences' }
      if (/https?:\/\/\S{60,}/.test(clean)) return { skipped: 'long-url' }
      const lang = opts.lang || resolveLang() || 'ar'
      setState('speaking')
      try { await tts.speak(clean, { lang }) } finally { setState('idle') }
      return { ok: true, length: clean.length, lang }
    },

    async send(text) {
      lastUserText = text
      return handleUserText(text)
    },

    destroy() {
      clearFollowUp()
      clearSilence()
      clearMaxTimer()
      sttBuffer = ''
      try { stt.abort() } catch {}
      try { wakeStt.abort() } catch {}
      try { tts.cancel() } catch {}
      try { edgeTtsEngine.cancel() } catch {}
      wake.disable()
    },
  }
}
