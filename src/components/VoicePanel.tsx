// VoicePanel v9.0 — WhisperLive (Groq Whisper) + Web Speech API fallback
// ─────────────────────────────────────────────────────────────────────────────
// المنطق:
//   1. اضغط الميكروفون → MediaRecorder يبدأ التسجيل
//   2. VAD (AnalyserNode) يراقب الصوت → بعد 2 ثانية صمت يوقف التسجيل
//   3. الصوت يُرسل لـ /api/voice/transcribe (Groq Whisper) → نص دقيق
//   4. احتياطي: Web Speech API إذا تعذّر الاتصال بالسيرفر
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, AlertTriangle, Loader2 } from 'lucide-react'

interface VoicePanelProps {
  onTranscript?: (text: string) => void
  onInterim?:    (text: string) => void
}

const BAR_COUNT      = 5
const SILENCE_DB     = 0.012  // RMS threshold للصمت
const SILENCE_MS     = 1800   // 1.8 ثانية صمت → إرسال تلقائي
const SAMPLE_INTERVAL = 80
const MAX_RECORD_MS  = 30_000

// ── VAD bars ──────────────────────────────────────────────────────────────────
function useVAD(active: boolean, onSilence?: () => void) {
  const [bars, setBars]    = useState<number[]>(Array(BAR_COUNT).fill(0))
  const rafRef             = useRef<number>(0)
  const smoothRef          = useRef<number[]>(Array(BAR_COUNT).fill(0))
  const ctxRef             = useRef<AudioContext | null>(null)
  const analyserRef        = useRef<AnalyserNode | null>(null)
  const streamRef          = useRef<MediaStream | null>(null)
  const silentMsRef        = useRef(0)
  const onSilenceCbRef     = useRef(onSilence)
  const rmsTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { onSilenceCbRef.current = onSilence }, [onSilence])

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current)
      if (rmsTimerRef.current) clearInterval(rmsTimerRef.current)
      rmsTimerRef.current = null
      silentMsRef.current = 0
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
        const stream  = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current  = stream
        const ctx          = new AudioContext()
        ctxRef.current     = ctx
        const source       = ctx.createMediaStreamSource(stream)
        const analyser     = ctx.createAnalyser()
        analyserRef.current = analyser
        analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.5
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

        // RMS silence detection
        const floatData = new Float32Array(analyser.fftSize)
        rmsTimerRef.current = setInterval(() => {
          if (cancelled || !analyserRef.current) return
          analyserRef.current.getFloatTimeDomainData(floatData)
          let sum = 0
          for (let i = 0; i < floatData.length; i++) sum += floatData[i] * floatData[i]
          const rms = Math.sqrt(sum / floatData.length)
          if (rms < SILENCE_DB) {
            silentMsRef.current += SAMPLE_INTERVAL
            if (silentMsRef.current >= SILENCE_MS) {
              silentMsRef.current = 0
              onSilenceCbRef.current?.()
            }
          } else {
            silentMsRef.current = 0
          }
        }, SAMPLE_INTERVAL)

      } catch {}
    }
    start()
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      if (rmsTimerRef.current) clearInterval(rmsTimerRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      ctxRef.current?.close().catch(() => {})
    }
  }, [active])

  return { bars }
}

// ── تحويل blob إلى base64 ────────────────────────────────────────────────────
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload  = () => res((reader.result as string).split(',')[1])
    reader.onerror = rej
    reader.readAsDataURL(blob)
  })
}

// ── Web Speech API fallback ──────────────────────────────────────────────────
function startWebSpeech(
  onResult: (t: string) => void,
  onEnd: () => void,
): (() => void) | null {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!Ctor) return null
  const rec = new Ctor()
  rec.lang = 'ar-DZ'; rec.continuous = false; rec.interimResults = true
  let acc = ''
  rec.onresult = (e: any) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) acc = (acc + ' ' + r[0].transcript).trim()
      else interim = r[0].transcript
    }
    onResult((acc + ' ' + interim).trim())
  }
  rec.onend = () => { if (acc.trim()) onResult(acc.trim()); onEnd() }
  rec.onerror = () => onEnd()
  try { rec.start() } catch { return null }
  return () => { try { rec.abort() } catch {} }
}

// ════════════════════════════════════════════════════════════════════════════
export default function VoicePanel({ onTranscript, onInterim }: VoicePanelProps) {
  const [state, setState]       = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [displayText, setDisplayText] = useState('')
  const [permError,  setPermError]    = useState<'denied' | 'no-device' | null>(null)

  const mediaRecRef  = useRef<MediaRecorder | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const maxTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef      = useRef<HTMLDivElement>(null)
  const cbRef        = useRef(onTranscript)
  const interimCbRef = useRef(onInterim)
  const wsAbortRef   = useRef<(() => void) | null>(null)
  const stoppingRef  = useRef(false)

  useEffect(() => { cbRef.current = onTranscript },  [onTranscript])
  useEffect(() => { interimCbRef.current = onInterim }, [onInterim])

  const listening     = state === 'recording'
  const transcribing  = state === 'transcribing'

  // ── إرسال للسيرفر (Groq Whisper) ─────────────────────────────────────────
  const transcribeChunks = useCallback(async (chunks: Blob[]) => {
    if (!chunks.length || stoppingRef.current) return
    const mimeType = chunks[0]?.type || 'audio/webm'
    const blob     = new Blob(chunks, { type: mimeType })
    if (blob.size < 1000) return

    setState('transcribing')
    setDisplayText('جاري التحويل...')

    try {
      const base64 = await blobToBase64(blob)
      const r      = await fetch('/api/voice/transcribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ audio: base64, mimeType, language: 'ar' }),
        signal:  AbortSignal.timeout(20_000),
      })
      if (r.ok) {
        const json = await r.json()
        const text = (json.text || '').trim()
        if (text) {
          setDisplayText(text)
          cbRef.current?.(text)
        }
      } else {
        // الـ server غير متاح → Web Speech API
        useFallbackWSA()
        return
      }
    } catch {
      useFallbackWSA()
      return
    }
    setState('idle')
    setDisplayText('')
  }, [])

  // ── Fallback إلى Web Speech API ───────────────────────────────────────────
  const useFallbackWSA = useCallback(() => {
    setState('recording')
    setDisplayText('')
    const abort = startWebSpeech(
      (t) => { setDisplayText(t); interimCbRef.current?.(t) },
      () => { setState('idle'); setDisplayText('') },
    )
    if (abort) wsAbortRef.current = abort
    else setState('idle')
  }, [])

  // ── إيقاف التسجيل ─────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (stoppingRef.current) return
    stoppingRef.current = true

    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null }

    const rec = mediaRecRef.current
    if (rec && rec.state !== 'inactive') {
      rec.onstop = async () => {
        stoppingRef.current = false
        await transcribeChunks([...chunksRef.current])
        chunksRef.current = []
      }
      rec.stop()
    } else {
      stoppingRef.current = false
    }
    mediaRecRef.current = null
  }, [transcribeChunks])

  // ── صمت مكتشف بالـ VAD ───────────────────────────────────────────────────
  const handleSilence = useCallback(() => {
    if (state === 'recording') stopRecording()
  }, [state, stopRecording])

  const { bars } = useVAD(listening, handleSilence)

  // ── بدء التسجيل ──────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setPermError(null)
    chunksRef.current  = []
    stoppingRef.current = false

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
        video: false,
      })
    } catch (err) {
      const name = (err as Error)?.name || ''
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') { setPermError('no-device'); return }
      setPermError('denied'); return
    }

    const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || ''

    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : {})
    rec.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data) }
    rec.start(250)
    mediaRecRef.current = rec
    setState('recording')
    setDisplayText('')

    // حد أقصى 30 ثانية
    maxTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS)
  }, [stopRecording])

  // ── زر الميكروفون ────────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    setPermError(null)
    if (state === 'recording') {
      stopRecording()
    } else if (state === 'idle') {
      // إذا كان MediaRecorder غير متاح → Web Speech مباشرة
      if (typeof MediaRecorder === 'undefined') { useFallbackWSA(); return }
      startRecording()
    }
  }, [state, stopRecording, startRecording, useFallbackWSA])

  // تنظيف عند الإغلاق
  useEffect(() => () => {
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      try { mediaRecRef.current.stop() } catch {}
    }
    wsAbortRef.current?.()
  }, [])

  useEffect(() => {
    if (!permError) return
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPermError(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [permError])

  // إذا لم يكن MediaRecorder و Web Speech API متاحَين → إخفاء
  const isSupported = (typeof window !== 'undefined') &&
    (typeof MediaRecorder !== 'undefined' ||
     !!(window as any).SpeechRecognition ||
     !!(window as any).webkitSpeechRecognition)

  if (!isSupported) return null

  let cls = 'dz-vp-trigger'
  if (listening)              cls += ' is-listening'
  if (transcribing)           cls += ' is-transcribing'
  if (permError === 'denied') cls += ' is-denied'

  const title = transcribing   ? 'جاري التحويل بـ Whisper...'
    : listening                ? 'يستمع... اضغط للإرسال'
    : permError === 'denied'   ? 'الميكروفون محجوب'
    : permError === 'no-device'? 'لا يوجد ميكروفون'
    :                            'اضغط وتحدث — إرسال تلقائي بعد 2 ثانية صمت'

  return (
    <div className="dz-vp-wrap" ref={wrapRef}>

      {/* حالة التسجيل */}
      {listening && (
        <span className="dz-voice-state" aria-live="polite">
          {displayText
            ? <span className="dz-voice-interim">"{displayText.length > 50 ? '…' + displayText.slice(-50) : displayText}"</span>
            : <span>🎤 يستمع...</span>}
        </span>
      )}

      {/* حالة التحويل */}
      {transcribing && (
        <span className="dz-voice-state" aria-live="polite">
          <span className="dz-voice-interim">⚡ Whisper يحوّل الصوت...</span>
        </span>
      )}

      {/* زر الميكروفون */}
      <button
        type="button"
        className={cls}
        title={title}
        onClick={handleClick}
        aria-label={title}
        disabled={transcribing}
      >
        {transcribing
          ? <Loader2 size={16} className="dz-spin" />
          : permError === 'denied'
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

      {/* رسائل الخطأ */}
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
