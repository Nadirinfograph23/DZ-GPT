// dz Voice Intelligence System — Speech-to-Text v3.0 (radical rewrite)
// إصلاح جذري: نظام sessionId يُلغي أحداث الجلسات القديمة تلقائياً
// وهو ما كان يُسبب "يسمع ولا يكتب" — onend من جلسة سابقة يُعطّل الجلسة الجديدة.
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

// ── الدالة الأساسية ────────────────────────────────────────────────────────
export function createSTT() {
  const bus        = new Emitter()
  let recognition  = null
  let active       = false
  let manualStop   = false
  let retries      = 0
  let currentLang  = 'auto'

  // ► sessionId — المفتاح الجذري للإصلاح
  // كل استدعاء لـ start() يُنشئ sessionId جديداً.
  // أي حدث (onend/onerror/onresult) من جلسة قديمة (id !== sessionId) يُهمَل تلقائياً.
  let sessionId = 0

  // ── بناء نموذج Recognition جديد ───────────────────────────────────────
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

  // ── تحديد لغة الإدخال بشكل موثوق ─────────────────────────────────────
  // ar-SA: دعم أوسع في Google ASR من ar-DZ مع نفس جودة الفهم
  function resolveLangTag(lang) {
    if (!lang || lang === 'auto') return 'ar-SA'
    const map = {
      ar:  'ar-SA',    // عربية — ar-SA أوسع دعماً في Google ASR
      fr:  'fr-FR',    // فرنسية
      en:  'en-US',    // إنجليزية
    }
    return map[lang] || langTag(lang) || 'ar-SA'
  }

  // ── ربط المستمعين بحماية sessionId ────────────────────────────────────
  function attach(r, sid) {
    let silenceTimer = null

    // guard: يُلف كل handler — إذا تغيّر sessionId يُهمَل الحدث تلقائياً
    function guard(fn) {
      return (...args) => {
        if (sessionId !== sid) return   // جلسة قديمة — تجاهل
        fn(...args)
      }
    }

    function clearSilence() {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null }
    }

    // ── نتيجة الإدخال الصوتي ──────────────────────────────────────────
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
        // أوقف التسجيل بعد 80ms لضمان إرسال onend دائماً
        setTimeout(() => { try { r.stop() } catch {} }, 80)
      }
    })

    // ── توقف المستخدم عن الكلام ─────────────────────────────────────
    r.onspeechend = guard(() => {
      clearSilence()
      // 700ms بعد التوقف → أوقف التسجيل للحصول على النتيجة النهائية
      silenceTimer = setTimeout(() => { try { r.stop() } catch {} }, 700)
    })

    r.onspeechstart = guard(() => clearSilence())

    // احتياط إذا لم يُطلَق onspeechend
    r.onsoundend = guard(() => {
      if (!silenceTimer) {
        silenceTimer = setTimeout(() => { try { r.stop() } catch {} }, 1000)
      }
    })

    r.onsoundstart = guard(() => clearSilence())

    // ── أخطاء التسجيل ──────────────────────────────────────────────
    r.onerror = guard(async (e) => {
      clearSilence()
      const code = e.error || 'unknown'

      // 'aborted' يحدث عند abort() المتعمد — لا نُبلّغ عنه
      if (code === 'aborted') return

      // 'no-speech' طبيعي — لا نُظهر خطأ، فقط نُنهي الجلسة
      if (code === 'no-speech') {
        active = false
        bus.emit('end')
        return
      }

      // 'language-not-supported' — أعد المحاولة بـ ar-SA
      if (code === 'language-not-supported') {
        console.warn(`[STT] لغة غير مدعومة: ${r.lang} — إعادة المحاولة بـ ar-SA`)
        active = false
        // أعد البناء بلغة أكثر دعماً
        sessionId++
        const newSid = sessionId
        recognition = build('ar')
        recognition.lang = 'ar-SA'
        attach(recognition, newSid)
        try { recognition.start(); active = true } catch {}
        return
      }

      // خطأ شبكة — إعادة المحاولة حتى 3 مرات
      if (code === 'network' && !manualStop && retries < TIMINGS.sttMaxRetries) {
        retries++
        await sleep(500)
        try { r.start() } catch {}
        return
      }

      active = false
      bus.emit('error', { code, message: e.message || code })
    })

    // ── انتهاء جلسة التسجيل ─────────────────────────────────────────
    r.onend = guard(() => {
      clearSilence()
      active = false
      bus.emit('end')
    })

    // ── بدء التسجيل بنجاح ───────────────────────────────────────────
    r.onstart = guard(() => {
      active  = true
      retries = 0
      bus.emit('start')
    })
  }

  // ══════════════════════════════════════════════════════════════════
  return {
    on:  bus.on.bind(bus),
    off: bus.off.bind(bus),
    isSupported: hasSTT,
    isActive:    () => active,

    // ── بدء جلسة تسجيل جديدة ─────────────────────────────────────
    start({ lang = 'auto', continuous = false, interim = true } = {}) {
      // ► أهم سطر: زيادة sessionId يُبطل كل أحداث الجلسة السابقة
      sessionId++
      const sid = sessionId

      // ألغِ الجلسة السابقة إن وجدت (أحداثها ستُهمَل بفضل sessionId)
      try { recognition?.abort?.() } catch {}

      active      = false
      manualStop  = false
      retries     = 0
      currentLang = lang

      try {
        recognition = build(lang)
        recognition.continuous     = continuous
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

    // ── إيقاف ناعم — ينتظر النتيجة النهائية ──────────────────────
    stop() {
      manualStop = true
      try { recognition?.stop?.() } catch {}
      active = false
    },

    // ── إلغاء فوري ────────────────────────────────────────────────
    abort() {
      sessionId++   // ← أبطل الجلسة الحالية أيضاً
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
