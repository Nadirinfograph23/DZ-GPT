// dz Voice Intelligence System — Edge TTS Engine (Server-side Neural)
// يستدعي /api/voice/tts في الخادم ويشغّل الصوت عبر Web Audio API
// أصوات جزائرية طبيعية: ar-DZ-AminaNeural / ar-DZ-IsmaelNeural

let audioCtx = null
let currentSource = null

function getAudioCtx() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

function stopCurrent() {
  if (currentSource) {
    try { currentSource.stop(0) } catch {}
    currentSource = null
  }
}

async function fetchAndPlay(text, lang, gender, signal) {
  const res = await fetch('/api/voice/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang, gender }),
    signal,
  })
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`)
  const arrayBuf = await res.arrayBuffer()
  const ctx = getAudioCtx()
  if (ctx.state === 'suspended') await ctx.resume()
  const decoded = await ctx.decodeAudioData(arrayBuf)
  return new Promise((resolve, reject) => {
    stopCurrent()
    const src = ctx.createBufferSource()
    src.buffer = decoded
    src.connect(ctx.destination)
    src.onended = () => { currentSource = null; resolve({ ok: true }) }
    src.onerror = (e) => { currentSource = null; reject(e) }
    currentSource = src
    src.start(0)
  })
}

// النص الطويل: نقسّمه على الجمل حتى لا يتأخر الصوت
function splitText(text, maxChars = 300) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= maxChars) return [clean]
  const parts = clean.split(/(?<=[.!?؟،,\n])\s+/)
  const chunks = []
  let buf = ''
  for (const p of parts) {
    if ((buf + ' ' + p).trim().length > maxChars) {
      if (buf) chunks.push(buf.trim())
      buf = p
    } else {
      buf = buf ? `${buf} ${p}` : p
    }
  }
  if (buf) chunks.push(buf.trim())
  return chunks.filter(Boolean)
}

// الـ engine المُصدَّر — نفس interface المطلوب من textToSpeech.js
export const edgeTtsEngine = {
  name: 'EdgeTTS-Neural',

  async speak(text, { lang = 'ar', gender = 'female', muted = false } = {}) {
    if (muted) return { skipped: true, reason: 'muted' }
    const trimmed = String(text || '').trim()
    if (!trimmed) return { skipped: true, reason: 'empty' }
    const abortCtl = new AbortController()
    this._abort = () => { abortCtl.abort(); stopCurrent() }
    const langKey = (lang.split('-')[0] || 'ar').toLowerCase()
    const chunks = splitText(trimmed)
    try {
      for (const chunk of chunks) {
        if (abortCtl.signal.aborted) break
        await fetchAndPlay(chunk, langKey, gender, abortCtl.signal)
      }
      return { ok: true, engine: 'EdgeTTS', chunks: chunks.length }
    } catch (e) {
      if (e?.name === 'AbortError') return { ok: false, reason: 'canceled' }
      throw e
    }
  },

  cancel() {
    if (typeof this._abort === 'function') { this._abort(); this._abort = null }
    stopCurrent()
  },

  // فحص: هل الخادم يدعم Edge TTS؟ (يُستدعى مرة واحدة عند البدء)
  async probe() {
    try {
      const r = await fetch('/api/voice/voices', { signal: AbortSignal.timeout(3000) })
      return r.ok
    } catch { return false }
  },
}
