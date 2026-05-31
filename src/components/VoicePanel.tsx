// VoicePanel v8.0 — الاستماع المستمر بالعربية / الدارجة الجزائرية
// ─────────────────────────────────────────────────────────────────
// المنطق:
//   1. اضغط الميكروفون → يبدأ الاستماع (لغة: ar-DZ / ar)
//   2. يعرض النص أثناء الحديث في الحقل مباشرة (interim + final)
//   3. بعد 2 ثانية من الصمت → يُرسل النص تلقائياً
//   4. أو اضغط الزر مرة ثانية لإيقاف وإرسال فوري
// ─────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, AlertTriangle } from 'lucide-react'

interface ISpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart:  ((e: Event) => void) | null
  onend:    ((e: Event) => void) | null
  onerror:  ((e: SpeechRecognitionErrorEvent) => void) | null
  onresult: ((e: SpeechRecognitionEvent) => void) | null
}
interface SpeechRecognitionErrorEvent extends Event { error: string }
interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}
declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition
    webkitSpeechRecognition?: new () => ISpeechRecognition
  }
}

interface VoicePanelProps {
  onTranscript?: (text: string) => void
  onInterim?:    (text: string) => void
}

const SILENCE_DELAY = 2000  // 2 ثانية بعد آخر كلمة → إرسال تلقائي
const BAR_COUNT     = 5

// ── VAD (اكتشاف الصوت بالمايكروفون) ────────────────────────────────────────
function useVAD(active: boolean) {
  const [bars, setBars]   = useState<number[]>(Array(BAR_COUNT).fill(0))
  const rafRef            = useRef<number>(0)
  const smoothRef         = useRef<number[]>(Array(BAR_COUNT).fill(0))
  const ctxRef            = useRef<AudioContext | null>(null)
  const streamRef         = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current)
      const decay = setInterval(() => {
        smoothRef.current = smoothRef.current.map(v => { const n = v * 0.75; return n < 0.01 ? 0 : n })
        setBars([...smoothRef.current])
        if (smoothRef.current.every(v => v === 0)) clearInterval(decay)
      }, 40)
      return () => clearInterval(decay)
    }
    let cancelled = false
    async function start() {
      try {
        const stream  = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const ctx     = new AudioContext()
        ctxRef.current = ctx
        const source  = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 64; analyser.smoothingTimeConstant = 0.75
        source.connect(analyser)
        const freqData = new Uint8Array(analyser.frequencyBinCount)
        function tick() {
          if (cancelled) return
          analyser.getByteFrequencyData(freqData)
          const len = freqData.length
          const newBars = Array.from({ length: BAR_COUNT }, (_, i) => {
            const s = Math.floor((i / BAR_COUNT) * len)
            const e = Math.floor(((i + 1) / BAR_COUNT) * len)
            let sum = 0; for (let b = s; b < e; b++) sum += freqData[b]
            return Math.min(1, (sum / Math.max(1, e - s)) / 180)
          })
          smoothRef.current = smoothRef.current.map((old, i) => {
            const t = newBars[i]; return t > old ? old + (t - old) * 0.65 : old + (t - old) * 0.25
          })
          setBars([...smoothRef.current])
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch {}
    }
    start()
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      ctxRef.current?.close().catch(() => {})
    }
  }, [active])

  return { bars }
}

export default function VoicePanel({ onTranscript, onInterim }: VoicePanelProps) {
  const [listening,  setListening]  = useState(false)
  const [displayText, setDisplayText] = useState('')
  const [permError,  setPermError]  = useState<'denied' | 'no-device' | null>(null)
  const [countdown,  setCountdown]  = useState<number | null>(null)

  const recRef         = useRef<ISpeechRecognition | null>(null)
  const wrapRef        = useRef<HTMLDivElement>(null)
  const accRef         = useRef('')           // النص الكامل المتراكم
  const silenceRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cdIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const cbRef          = useRef(onTranscript)
  const interimCbRef   = useRef(onInterim)
  const isStoppingRef  = useRef(false)        // يمنع إعادة التشغيل بعد الإيقاف الإرادي

  useEffect(() => { cbRef.current = onTranscript })
  useEffect(() => { interimCbRef.current = onInterim })

  const { bars } = useVAD(listening)

  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  // ── إلغاء مؤقت الصمت ─────────────────────────────────────────────────────
  const clearSilence = useCallback(() => {
    if (silenceRef.current)    { clearTimeout(silenceRef.current);  silenceRef.current = null }
    if (cdIntervalRef.current) { clearInterval(cdIntervalRef.current); cdIntervalRef.current = null }
    setCountdown(null)
  }, [])

  // ── إيقاف + إرسال ─────────────────────────────────────────────────────────
  const stopAndSend = useCallback(() => {
    isStoppingRef.current = true
    clearSilence()
    try { recRef.current?.stop() } catch {}
    recRef.current = null
    setListening(false)
    setDisplayText('')

    const text = accRef.current.trim()
    accRef.current = ''
    isStoppingRef.current = false

    if (text) {
      cbRef.current?.(text)
    }
  }, [clearSilence])

  // ── بدء مؤقت الصمت (2 ثانية) ─────────────────────────────────────────────
  const startSilenceTimer = useCallback(() => {
    clearSilence()
    let remaining = 2
    setCountdown(remaining)
    cdIntervalRef.current = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(cdIntervalRef.current!)
        cdIntervalRef.current = null
        setCountdown(null)
      } else {
        setCountdown(remaining)
      }
    }, 1000)
    silenceRef.current = setTimeout(() => {
      stopAndSend()
    }, SILENCE_DELAY)
  }, [clearSilence, stopAndSend])

  // ── إيقاف كامل بدون إرسال ────────────────────────────────────────────────
  const stopNoSend = useCallback(() => {
    isStoppingRef.current = true
    clearSilence()
    try { recRef.current?.abort() } catch {}
    recRef.current = null
    accRef.current = ''
    setListening(false)
    setDisplayText('')
    setCountdown(null)
    setTimeout(() => { isStoppingRef.current = false }, 200)
  }, [clearSilence])

  useEffect(() => {
    if (!permError) return
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPermError(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [permError])

  useEffect(() => () => {
    clearSilence()
    try { recRef.current?.abort() } catch {}
  }, [clearSilence])

  // ── بدء الاستماع ─────────────────────────────────────────────────────────
  const startRec = useCallback(async () => {
    setPermError(null)
    accRef.current = ''
    isStoppingRef.current = false

    // طلب إذن الميكروفون
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      stream.getTracks().forEach(t => t.stop())
    } catch (err) {
      const name = (err as Error)?.name || ''
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') { setPermError('no-device'); return }
      setPermError('denied'); return
    }

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) return

    function createRec() {
      const rec = new Ctor!()

      // ── اللغة: الدارجة الجزائرية أولاً ────────────────────────────────
      // ar-DZ = الجزائر العربية | ar-SA كاحتياط
      rec.lang            = 'ar-DZ'
      rec.continuous      = false    // false + إعادة التشغيل اليدوية = أفضل دعم متصفح
      rec.interimResults  = true
      rec.maxAlternatives = 1

      rec.onstart = () => { setListening(true) }

      // ── onend: أعد التشغيل إذا لم يُوقَف إرادياً ────────────────────
      rec.onend = () => {
        if (!isStoppingRef.current && recRef.current === rec) {
          try {
            const newRec = createRec()
            recRef.current = newRec
            newRec.start()
          } catch {
            setListening(false)
          }
        }
      }

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return
        if (e.error === 'not-allowed')  { setPermError('denied');    stopNoSend(); return }
        if (e.error === 'audio-capture'){ setPermError('no-device'); stopNoSend(); return }
        // language-not-supported → حاول بـ ar
        if (e.error === 'language-not-supported') {
          try { rec.lang = 'ar'; rec.start() } catch {}
          return
        }
        console.warn('[VoicePanel] STT error:', e.error)
      }

      // ── onresult: تراكم النص + مؤقت الصمت ──────────────────────────
      rec.onresult = (e: SpeechRecognitionEvent) => {
        let interim = ''

        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res  = e.results[i]
          const text = res[0]?.transcript || ''
          if (res.isFinal) {
            accRef.current = (accRef.current + ' ' + text).trim()
          } else {
            interim = text
          }
        }

        // عرض النص المتراكم + الوسيط في حقل الإدخال
        const display = accRef.current
          ? interim ? `${accRef.current} ${interim}` : accRef.current
          : interim
        setDisplayText(display)
        interimCbRef.current?.(display)   // يُحدّث الحقل فوراً

        // إذا وصلت نتيجة نهائية → ابدأ مؤقت الصمت 2 ثانية
        if (accRef.current) startSilenceTimer()
      }

      return rec
    }

    const rec = createRec()
    recRef.current = rec
    try {
      rec.start()
    } catch (err) {
      console.error('[VoicePanel] start failed:', err)
      setListening(false)
      recRef.current = null
    }
  }, [startSilenceTimer, stopNoSend])

  // ── ضغط زر الميكروفون ────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    setPermError(null)
    if (listening) {
      // ضغط أثناء الاستماع → إرسال فوري
      stopAndSend()
    } else {
      startRec()
    }
  }, [listening, startRec, stopAndSend])

  if (!isSupported) return null

  let cls = 'dz-vp-trigger'
  if (listening)                cls += ' is-listening'
  if (permError === 'denied')   cls += ' is-denied'

  const hasText = accRef.current.trim().length > 0

  const title = listening
    ? hasText
      ? `إيقاف وإرسال — ${accRef.current.trim().slice(0, 40)}${accRef.current.length > 40 ? '…' : ''}`
      : 'يستمع... تحدث بالعربية أو الدارجة'
    : permError === 'denied'    ? 'الميكروفون محجوب — اضغط للتفاصيل'
    : permError === 'no-device' ? 'لا يوجد ميكروفون'
    :                              'اضغط وتحدث — الإرسال تلقائي بعد 2 ثانية صمت'

  return (
    <div className="dz-vp-wrap" ref={wrapRef}>

      {/* ── عرض النص الجاري سماعه ────────────────────────────────────────── */}
      {listening && displayText && (
        <span className="dz-voice-state" aria-live="polite">
          <span className="dz-voice-interim">
            "{displayText.length > 50 ? '…' + displayText.slice(-50) : displayText}"
          </span>
          {countdown !== null && (
            <span className="dz-voice-cd" title="إرسال تلقائي">⏱ {countdown}s</span>
          )}
        </span>
      )}
      {listening && !displayText && (
        <span className="dz-voice-state" aria-live="polite">🎤 يستمع...</span>
      )}

      {/* ── زر الميكروفون ────────────────────────────────────────────────── */}
      <button
        type="button"
        className={cls}
        title={title}
        onClick={handleClick}
        aria-label={title}
      >
        {permError === 'denied'
          ? <AlertTriangle size={16} />
          : listening
          ? <MicOff size={16} />
          : <Mic size={16} />}

        {listening && (
          <span className="dz-vad-bars" aria-hidden="true">
            {bars.map((h, i) => (
              <span
                key={i}
                className="dz-vad-bar"
                style={{ '--bar-h': Math.max(0.08, h) } as React.CSSProperties}
              />
            ))}
          </span>
        )}
      </button>

      {/* ── رسائل الخطأ ──────────────────────────────────────────────────── */}
      {permError && (
        <div className="dz-vp-perm-error" style={{ bottom: 'calc(100% + 8px)', insetInlineEnd: 0 }}>
          {permError === 'no-device' ? (
            <p>🎙 لا يوجد ميكروفون. تحقق من التوصيل.</p>
          ) : (
            <>
              <p>🔒 الميكروفون محجوب. لتفعيله:</p>
              <ol>
                <li>انقر 🔒 في شريط العنوان</li>
                <li>غيّر "الميكروفون" ← "سماح"</li>
                <li>أعد تحميل الصفحة</li>
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  )
}
