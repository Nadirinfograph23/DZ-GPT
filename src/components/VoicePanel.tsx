// VoicePanel v7.0 — Continuous Listen + Manual Stop → Send
// ─────────────────────────────────────────────────────────────────
// المنطق الجديد:
//   1. اضغط الميكروفون → يبدأ الاستماع المستمر (continuous=true)
//   2. النص يتراكم في accumulatedRef ويُعرض مباشرة (onInterim)
//   3. اضغط "إيقاف وإرسال" → يُرسل كل ما تم سماعه دفعة واحدة (onTranscript)
// ─────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, AlertTriangle, SendHorizonal } from 'lucide-react'

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
  onTranscript?: (text: string) => void   // يُستدعى مرة واحدة عند الإيقاف — يرسل النص
  onInterim?:    (text: string) => void   // يُستدعى أثناء الاستماع — يعرض النص في الحقل
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerHostProcessor?: (handler: (text: string) => Promise<string> | string) => void
}

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

export default function VoicePanel({ onTranscript, onInterim }: VoicePanelProps) {

  const [listening,    setListening]    = useState(false)
  const [interimText,  setInterimText]  = useState('')
  const [permError,    setPermError]    = useState<'denied'|'no-device'|null>(null)

  const recRef         = useRef<ISpeechRecognition | null>(null)
  const wrapRef        = useRef<HTMLDivElement>(null)
  const accumulatedRef = useRef<string>('')       // النص الكامل المتراكم
  const cbRef          = useRef(onTranscript)
  const interimCbRef   = useRef(onInterim)
  useEffect(() => { cbRef.current = onTranscript })
  useEffect(() => { interimCbRef.current = onInterim })

  const { bars, isVoiceActive } = useVAD(listening)

  const isSupported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => {
    if (!permError) return
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPermError(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [permError])

  useEffect(() => () => {
    try { recRef.current?.abort() } catch {}
    recRef.current = null
  }, [])

  // ── إيقاف + إرسال ما تم سماعه ───────────────────────────────────────────
  const stopRec = useCallback(() => {
    try { recRef.current?.stop() } catch {}
    recRef.current = null
    setListening(false)
    setInterimText('')

    const text = accumulatedRef.current.trim()
    accumulatedRef.current = ''

    if (text) {
      cbRef.current?.(text)       // ← يرسل النص الكامل للـ parent مرة واحدة
    }
  }, [])

  // ── بدء الاستماع المستمر ──────────────────────────────────────────────────
  const startRec = useCallback(async () => {
    setPermError(null)
    accumulatedRef.current = ''

    // ① طلب إذن الميكروفون
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

    // ② إنشاء Recognition
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Ctor) return
    const rec = new Ctor()

    rec.lang            = 'ar-SA'
    rec.continuous      = true    // استماع مستمر حتى يضغط المستخدم إيقاف
    rec.interimResults  = true
    rec.maxAlternatives = 1

    rec.onstart = () => setListening(true)

    // ③ onend — أعد التشغيل إذا كان المستخدم لم يوقفه بنفسه (حماية من الانقطاع)
    rec.onend = () => {
      if (recRef.current === rec) {
        // لم يُوقَف يدوياً → أعد التشغيل تلقائياً
        try { rec.start() } catch {
          setListening(false)
          setInterimText('')
          recRef.current = null
        }
      }
    }

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return
      if (e.error === 'not-allowed') { setPermError('denied'); recRef.current = null; setListening(false); return }
      if (e.error === 'audio-capture') { setPermError('no-device'); recRef.current = null; setListening(false); return }
      console.warn('[VoicePanel] STT error:', e.error)
    }

    // ④ onresult — تراكم النص وعرضه مباشرة (لا إرسال)
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res  = e.results[i]
        const text = res[0]?.transcript || ''
        if (res.isFinal) {
          accumulatedRef.current = (accumulatedRef.current + ' ' + text).trim()
          // عرض النص المتراكم في حقل الإدخال مباشرة (بدون إرسال)
          interimCbRef.current?.(accumulatedRef.current)
        } else {
          interim = text
        }
      }

      // عرض النص الوسيط + المتراكم للمستخدم
      const display = accumulatedRef.current
        ? `${accumulatedRef.current} ${interim}`.trim()
        : interim
      setInterimText(display)
    }

    recRef.current = rec
    try {
      rec.start()
    } catch (err) {
      console.error('[VoicePanel] rec.start() failed:', err)
      setListening(false)
      recRef.current = null
    }
  }, [])

  const handleClick = useCallback(() => {
    setPermError(null)
    if (listening) stopRec()
    else           startRec()
  }, [listening, startRec, stopRec])

  if (!isSupported) return null

  const hasAccumulated = accumulatedRef.current.trim().length > 0

  let cls = 'dz-vp-trigger'
  if (listening)               cls += ' is-listening'
  if (permError === 'denied')  cls += ' is-denied'
  if (hasAccumulated)          cls += ' has-text'

  const title = listening
    ? (hasAccumulated ? 'إيقاف وإرسال' : 'إيقاف الاستماع')
    : permError === 'denied'    ? 'الميكروفون محجوب'
    : permError === 'no-device' ? 'لا يوجد ميكروفون'
    :                              'تحدّث بالعربية أو الدارجة'

  return (
    <div className="dz-vp-wrap" ref={wrapRef}>

      {/* ── عرض النص المتراكم ─────────────────────────────────────────────── */}
      {listening && interimText && (
        <span className="dz-voice-state" aria-live="polite">
          <span className="dz-voice-interim">"{interimText.slice(-60)}{interimText.length > 60 ? '…' : ''}"</span>
        </span>
      )}
      {listening && !interimText && (
        <span className="dz-voice-state" aria-live="polite">
          {isVoiceActive ? '🎤 يسمعك...' : '🎤 يستمع...'}
        </span>
      )}

      {/* ── زر الميكروفون / إيقاف وإرسال ──────────────────────────────────── */}
      <button
        type="button"
        className={cls}
        title={title}
        onClick={handleClick}
        aria-label={title}
      >
        {permError === 'denied'
          ? <AlertTriangle size={16} />
          : listening && hasAccumulated
          ? <SendHorizonal size={16} />
          : listening
          ? <MicOff size={16} />
          : <Mic size={16} />}

        {listening && !hasAccumulated && (
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
