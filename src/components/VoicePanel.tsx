// VoicePanel v6.0 — Direct Web Speech API (Zero Abstraction Layer)
// ─────────────────────────────────────────────────────────────────
// بعد 5 محاولات فاشلة مع DVIS + controller + STT:
// هذا الكومبوننت يتحدث مع Web Speech API مباشرة — لا وسيط، لا event bus، لا DVIS.
// recognition.onresult → onTranscript()  ← نقطة اتصال واحدة لا تنكسر.
// ─────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, AlertTriangle } from 'lucide-react'

// ── نوع لـ SpeechRecognition (بدون @types) ────────────────────────────────
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
  onTranscript?:  (text: string) => void
  onReply?:       (text: string) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerHostProcessor?: (handler: (text: string) => Promise<string> | string) => void
}

// ── VAD: تصوير مستوى الصوت (اختياري — للبصريات فقط) ──────────────────────
const BAR_COUNT = 5

function useVAD(active: boolean) {
  const [bars, setBars]     = useState<number[]>(Array(BAR_COUNT).fill(0))
  const rafRef              = useRef<number>(0)
  const smoothRef           = useRef<number[]>(Array(BAR_COUNT).fill(0))
  const ctxRef              = useRef<AudioContext | null>(null)
  const streamRef           = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current)
      const decay = setInterval(() => {
        smoothRef.current = smoothRef.current.map(v => {
          const n = v * 0.75
          return n < 0.01 ? 0 : n
        })
        setBars([...smoothRef.current])
        if (smoothRef.current.every(v => v === 0)) clearInterval(decay)
      }, 40)
      return () => clearInterval(decay)
    }

    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const ctx      = new AudioContext()
        ctxRef.current = ctx
        const source   = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 64
        analyser.smoothingTimeConstant = 0.75
        source.connect(analyser)
        const freqData = new Uint8Array(analyser.frequencyBinCount)

        function tick() {
          if (cancelled) return
          analyser.getByteFrequencyData(freqData)
          const len     = freqData.length
          const newBars = Array.from({ length: BAR_COUNT }, (_, i) => {
            const s = Math.floor((i / BAR_COUNT) * len)
            const e = Math.floor(((i + 1) / BAR_COUNT) * len)
            let sum = 0
            for (let b = s; b < e; b++) sum += freqData[b]
            return Math.min(1, (sum / Math.max(1, e - s)) / 180)
          })
          smoothRef.current = smoothRef.current.map((old, i) => {
            const t = newBars[i]
            return t > old ? old + (t - old) * 0.65 : old + (t - old) * 0.25
          })
          setBars([...smoothRef.current])
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch { /* صلاحية مرفوضة — نتجاهل VAD */ }
    }

    start()
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      ctxRef.current?.close().catch(() => {})
    }
  }, [active])

  return { bars, isVoiceActive: Math.max(...bars) > 0.04 }
}

// ════════════════════════════════════════════════════════════════════════════
export default function VoicePanel({ onTranscript }: VoicePanelProps) {

  const [listening,   setListening]   = useState(false)
  const [interimText, setInterimText] = useState('')  // نص وسيط للعرض داخل الزر
  const [permError,   setPermError]   = useState<'iframe'|'denied'|'no-device'|null>(null)
  const recRef   = useRef<ISpeechRecognition | null>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const cbRef    = useRef(onTranscript)
  useEffect(() => { cbRef.current = onTranscript })

  const { bars, isVoiceActive } = useVAD(listening)

  // ── هل المتصفح يدعم Web Speech API؟ ──────────────────────────────────────
  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  // ── إغلاق رسالة الخطأ بالنقر خارجها ─────────────────────────────────────
  useEffect(() => {
    if (!permError) return
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPermError(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [permError])

  // ── إيقاف عند تدمير الكومبوننت ──────────────────────────────────────────
  useEffect(() => () => {
    try { recRef.current?.abort() } catch {}
    recRef.current = null
  }, [])

  // ── وقف التسجيل ──────────────────────────────────────────────────────────
  const stopRec = useCallback(() => {
    try { recRef.current?.stop() } catch {}
    recRef.current = null
    setListening(false)
    setInterimText('')
  }, [])

  // ── بدء التسجيل — Web Speech API مباشرة ──────────────────────────────────
  const startRec = useCallback(async () => {
    setPermError(null)

    // ① هل نحن داخل iframe؟
    try { if (window.self !== window.top) { setPermError('iframe'); return } }
    catch { setPermError('iframe'); return }

    // ② طلب إذن الميكروفون صراحةً
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      stream.getTracks().forEach(t => t.stop())
    } catch (err) {
      const name = (err as Error)?.name || ''
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setPermError('no-device'); return
      }
      setPermError('denied'); return
    }

    // ③ إنشاء Recognition ─────────────────────────────────────────────────
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) return
    const rec = new Ctor()

    rec.lang            = 'ar-SA'   // ar-SA: أوسع دعم في Google ASR — يفهم الدارجة
    rec.continuous      = false     // نهاية تلقائية بعد كل جملة → أبسط وأموثوق
    rec.interimResults  = true      // نتائج مؤقتة للتعقب البصري
    rec.maxAlternatives = 1

    // ④ onstart ─────────────────────────────────────────────────────────────
    rec.onstart = () => setListening(true)

    // ⑤ onend ───────────────────────────────────────────────────────────────
    rec.onend = () => {
      setListening(false)
      setInterimText('')
      recRef.current = null
    }

    // ⑥ onerror ─────────────────────────────────────────────────────────────
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setListening(false)
      setInterimText('')
      recRef.current = null
      if (e.error === 'aborted' || e.error === 'no-speech') return
      if (e.error === 'not-allowed') { setPermError('denied'); return }
      if (e.error === 'audio-capture') { setPermError('no-device'); return }
      console.warn('[VoicePanel] STT error:', e.error)
    }

    // ⑦ onresult — نقطة الاتصال الوحيدة مع الـ parent ──────────────────────
    // ⚠️ القاعدة الذهبية: نستدعي cbRef.current (= onTranscript) مرة واحدة فقط
    //    عند النتيجة النهائية (isFinal=true).
    //    النتائج المؤقتة تُعرض فقط بصرياً داخل الكومبوننت (interimText state).
    //    هذا يمنع إرسال رسائل متعددة للنتائج الوسيطة.
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let finalText  = ''
      let interim    = ''

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res  = e.results[i]
        const text = res[0]?.transcript || ''
        if (res.isFinal) finalText += text
        else             interim   += text
      }

      // عرض النص الوسيط بصرياً فقط (لا يُرسل للـ parent)
      if (interim) setInterimText(interim.trim())

      // عند اكتمال الجملة → استدعاء onTranscript مرة واحدة فقط
      if (finalText.trim()) {
        setInterimText('')
        cbRef.current?.(finalText.trim())   // ← هذا السطر الوحيد الذي يُخبر الـ parent
        try { rec.stop() } catch {}
      }
    }

    // ⑧ ابدأ ──────────────────────────────────────────────────────────────
    recRef.current = rec
    try {
      rec.start()
    } catch (err) {
      console.error('[VoicePanel] rec.start() failed:', err)
      setListening(false)
      recRef.current = null
    }
  }, [])

  // ── نقر الزر ─────────────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    setPermError(null)
    if (listening) {
      stopRec()
    } else {
      startRec()
    }
  }, [listening, startRec, stopRec])

  if (!isSupported) return null

  // ── CSS Classes ───────────────────────────────────────────────────────────
  let cls = 'dz-vp-trigger'
  if (listening)                 cls += ' is-listening'
  if (permError === 'denied')    cls += ' is-denied'

  const title = listening          ? 'إيقاف الاستماع'
    : permError === 'denied'       ? 'الميكروفون محجوب — انقر للتفاصيل'
    : permError === 'no-device'    ? 'لا يوجد ميكروفون'
    :                                'تحدّث بالعربية أو الدارجة'

  return (
    <div className="dz-vp-wrap" ref={wrapRef}>

      {/* ── مؤشر الحالة + النص الوسيط ──────────────────────────────────────── */}
      {listening && (
        <span className="dz-voice-state" aria-live="polite">
          {interimText
            ? <span className="dz-voice-interim">"{interimText}"</span>
            : isVoiceActive ? '🎤 يسمعك...' : '🎤 يستمع...'}
        </span>
      )}

      {/* ── زر الميكروفون ─────────────────────────────────────────────────── */}
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

        {/* موجات VAD — تظهر فقط أثناء الاستماع */}
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

      {/* ── رسائل الخطأ ─────────────────────────────────────────────────── */}
      {permError && (
        <div className="dz-vp-perm-error" style={{ bottom: 'calc(100% + 8px)', insetInlineEnd: 0 }}>
          {permError === 'iframe' ? (
            <>
              <p>🔒 المتصفح يمنع الميكروفون في الـ preview.</p>
              <button
                className="dz-vp-perm-link"
                onClick={() => window.open(window.location.href, '_blank')}
              >↗ فتح في نافذة جديدة</button>
            </>
          ) : permError === 'no-device' ? (
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
