// DZ Voice Panel v5.0 — زر مايك + VAD موجات متحركة حقيقية
// Web Audio API → AnalyserNode → 5 أشرطة تتحرك بمستوى الصوت الفعلي
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { Mic, MicOff, Volume2, AlertTriangle } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — JS module without .d.ts
import { createDVIS } from '../../voice-system/controller.js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — JS module without .d.ts
import { checkMicPermission, requestMicPermission } from '../../voice-system/speechToText.js'

type DvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'wake-listening'
type MicStatus = 'unknown' | 'granted' | 'denied' | 'no-device' | 'requesting'

interface VoicePanelProps {
  onTranscript?:  (text: string) => void
  onReply?:       (text: string) => void
  registerHostProcessor?: (handler: (text: string) => Promise<string> | string) => void
}

// ── عدد أشرطة الموجة ─────────────────────────────────────────────────────────
const BAR_COUNT = 5

function isInsideIframe(): boolean {
  try { return window.self !== window.top } catch { return true }
}

// ── Hook: VAD — Voice Activity Detector ──────────────────────────────────────
// يقرأ مستوى الصوت من الميكروفون بـ requestAnimationFrame
// يُعيد مصفوفة heights (0→1) لكل شريط + علامة isVoiceActive
function useVAD(active: boolean) {
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(0))
  const rafRef        = useRef<number>(0)
  const analyserRef   = useRef<AnalyserNode | null>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const ctxRef        = useRef<AudioContext | null>(null)
  const smoothRef     = useRef<number[]>(Array(BAR_COUNT).fill(0))

  useEffect(() => {
    if (!active) {
      // تلاشي تدريجي بدل القطع المفاجئ
      cancelAnimationFrame(rafRef.current)
      const decay = setInterval(() => {
        smoothRef.current = smoothRef.current.map(v => {
          const next = v * 0.75
          return next < 0.01 ? 0 : next
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
        const ctx = new (window.AudioContext || (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        ctxRef.current = ctx
        const source   = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 64          // خفيف جداً على الأداء
        analyser.smoothingTimeConstant = 0.75
        source.connect(analyser)
        analyserRef.current = analyser

        const freqData = new Uint8Array(analyser.frequencyBinCount)

        function tick() {
          if (cancelled) return
          analyser.getByteFrequencyData(freqData)

          // نأخذ BAR_COUNT مناطق من طيف الصوت (bass → treble)
          const binCount = freqData.length
          const newBars  = Array.from({ length: BAR_COUNT }, (_, i) => {
            const start = Math.floor((i / BAR_COUNT) * binCount)
            const end   = Math.floor(((i + 1) / BAR_COUNT) * binCount)
            let sum = 0
            for (let b = start; b < end; b++) sum += freqData[b]
            const avg = sum / Math.max(1, end - start)
            return Math.min(1, avg / 180)  // 180 = حد الصوت العالي
          })

          // تمهيد: up سريع (0.65) — down بطيء (0.25)
          smoothRef.current = smoothRef.current.map((old, i) => {
            const target = newBars[i]
            return target > old ? old + (target - old) * 0.65 : old + (target - old) * 0.25
          })
          setBars([...smoothRef.current])
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch {
        // الصلاحية رُفضت أو لا يوجد جهاز — نتجاهل
      }
    }

    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      ctxRef.current?.close().catch(() => {})
      analyserRef.current = null
      streamRef.current   = null
      ctxRef.current      = null
    }
  }, [active])

  const maxVol     = Math.max(...bars)
  const isVoiceActive = maxVol > 0.04  // عتبة الصوت

  return { bars, isVoiceActive }
}

// ═════════════════════════════════════════════════════════════════════════════
export default function VoicePanel({ onTranscript, onReply }: VoicePanelProps) {
  const dvisRef    = useRef<ReturnType<typeof createDVIS> | null>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const [state, setState]         = useState<DvisState>('idle')
  const [sttOk, setSttOk]         = useState(false)
  const [edgeOk, setEdgeOk]       = useState(false)
  const [micStatus, setMicStatus] = useState<MicStatus>('unknown')
  const [permError, setPermError] = useState<string | null>(null)

  // نحفظ الـ callbacks في refs حتى لا يُعاد إنشاء DVIS عند كل render
  const onTranscriptRef = useRef(onTranscript)
  const onReplyRef      = useRef(onReply)
  useLayoutEffect(() => {
    onTranscriptRef.current = onTranscript
    onReplyRef.current      = onReply
  })

  const isListening = state === 'listening' || state === 'wake-listening'
  const isSpeaking  = state === 'speaking'

  // ── VAD: فعّال فقط أثناء الاستماع ────────────────────────────────────────
  const { bars, isVoiceActive } = useVAD(isListening)

  // ── تهيئة DVIS ────────────────────────────────────────────────────────────
  useEffect(() => {
    const dvis = createDVIS({ baseUrl: '' })
    dvisRef.current = dvis
    dvis.setPrefs({ gender: 'male', language: 'ar', muted: false })
    setSttOk(dvis.isSttSupported())

    fetch('/api/voice/voices', { signal: AbortSignal.timeout(3000) })
      .then(r => r.ok && setEdgeOk(true))
      .catch(() => {})

    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__dvis = dvis
    }

    const unState = dvis.on('state', (s: DvisState) => setState(s))
    const unTr    = dvis.on('transcript', ({ text, isFinal }: { text: string; isFinal: boolean }) => {
      if (isFinal && onTranscriptRef.current) onTranscriptRef.current(text)
    })
    const unReply = dvis.on('reply', ({ text }: { text: string }) => {
      if (onReplyRef.current) onReplyRef.current(text)
    })
    dvis.preload()

    checkMicPermission().then((status: string) => {
      if (status === 'denied')  setMicStatus('denied')
      else if (status === 'granted') setMicStatus('granted')
      else setMicStatus('unknown')
    })

    return () => {
      unState?.(); unTr?.(); unReply?.()
      setState('idle')   // إعادة ضبط الواجهة عند تدمير DVIS
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__dvis
      }
      dvis.destroy()
    }
  }, [])  // DVIS يُنشأ مرة واحدة فقط — الـ callbacks محفوظة في refs

  // ── إغلاق رسالة الخطأ عند النقر خارجها ──────────────────────────────────
  useEffect(() => {
    if (!permError) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPermError(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [permError])

  // ── نقر زر الميكروفون ─────────────────────────────────────────────────────
  const handleMicClick = useCallback(async () => {
    setPermError(null)
    if (state === 'speaking')                          { dvisRef.current?.cancelSpeech(); return }
    if (state === 'listening' || state === 'wake-listening') { dvisRef.current?.stopListening(); return }
    if (isInsideIframe())                              { setPermError('iframe'); return }
    if (micStatus === 'denied')                        { setPermError('denied'); return }

    if (micStatus === 'unknown') {
      setMicStatus('requesting')
      const result = await requestMicPermission()
      if (result.granted) {
        setMicStatus('granted')
        dvisRef.current?.startListening()
      } else if (result.noDevice) {
        setMicStatus('no-device'); setPermError('no-device')
      } else {
        setMicStatus('denied'); setPermError('denied')
      }
      return
    }

    dvisRef.current?.startListening()
  }, [state, micStatus])

  if (!sttOk && !edgeOk) return null

  // ── أيقونة + CSS class ────────────────────────────────────────────────────
  let icon: React.ReactNode = <Mic size={16} />
  let cls  = 'dz-vp-trigger'

  if (micStatus === 'denied')  { icon = <AlertTriangle size={16} />; cls += ' is-denied' }
  else if (isListening)        { icon = <MicOff size={16} />;        cls += ' is-listening' }
  else if (isSpeaking)         { icon = <Volume2 size={16} />;       cls += ' is-speaking' }

  const title =
    isListening          ? 'إيقاف الاستماع'
    : isSpeaking         ? 'إيقاف الكلام'
    : micStatus === 'denied'    ? 'الميكروفون محجوب'
    : micStatus === 'no-device' ? 'لا يوجد ميكروفون'
    : 'تحدّث بالعربية أو الدارجة'

  return (
    <div className="dz-vp-wrap" ref={wrapRef}>

      {/* ── مؤشر الحالة النصي ─────────────────────────────────────────────── */}
      {(isListening || isSpeaking) && (
        <span className="dz-voice-state" aria-live="polite">
          {isListening
            ? (isVoiceActive ? '🎤 يسمعك...' : '🎤 يستمع...')
            : '🔊 يتحدث...'}
        </span>
      )}

      {/* ── الزر الرئيسي ─────────────────────────────────────────────────── */}
      <button
        type="button"
        className={cls}
        title={title}
        onClick={handleMicClick}
        aria-label={title}
      >
        {icon}

        {/* ── موجات VAD — تظهر فقط أثناء الاستماع ─────────────────────── */}
        {isListening && (
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

        {/* ── نقطة Edge Neural (فقط عند الراحة) ───────────────────────── */}
        {edgeOk && !isListening && !isSpeaking && (
          <span className="dz-vp-dot" title="إسماعيل — صوت رجل جزائري طبيعي" />
        )}
      </button>

      {/* ── رسالة خطأ الصلاحية ─────────────────────────────────────────── */}
      {permError && (
        <div className="dz-vp-perm-error" style={{ bottom: 'calc(100% + 8px)', insetInlineEnd: 0 }}>
          {permError === 'iframe' ? (
            <>
              <p>🔒 المتصفح يمنع الميكروفون في الـ preview.</p>
              <button className="dz-vp-perm-link" onClick={() => window.open(window.location.href, '_blank')}>
                ↗ فتح في نافذة جديدة
              </button>
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
