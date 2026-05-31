// DZ Voice Panel v4.0 — زر مايك واحد فقط، بدون إعدادات
// صوت رجل جزائري طبيعي: ar-DZ-IsmaelNeural (Microsoft Edge TTS)
import { useEffect, useRef, useState, useCallback } from 'react'
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

function isInsideIframe(): boolean {
  try { return window.self !== window.top } catch { return true }
}

export default function VoicePanel({ onTranscript, onReply }: VoicePanelProps) {
  const dvisRef  = useRef<ReturnType<typeof createDVIS> | null>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const [state, setState]       = useState<DvisState>('idle')
  const [sttOk, setSttOk]       = useState(false)
  const [edgeOk, setEdgeOk]     = useState(false)
  const [micStatus, setMicStatus] = useState<MicStatus>('unknown')
  const [permError, setPermError] = useState<string | null>(null)

  // ── تهيئة DVIS — صوت ذكر ثابت ────────────────────────────────────────────
  useEffect(() => {
    const dvis = createDVIS({ baseUrl: '' })
    dvisRef.current = dvis

    // إجبار صوت الرجل الجزائري دائماً — ar-DZ-IsmaelNeural
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
    const unTr = dvis.on('transcript', ({ text, isFinal }: { text: string; isFinal: boolean }) => {
      if (isFinal && onTranscript) onTranscript(text)
    })
    const unReply = dvis.on('reply', ({ text }: { text: string }) => {
      if (onReply) onReply(text)
    })
    dvis.preload()

    checkMicPermission().then((status: string) => {
      if (status === 'denied') setMicStatus('denied')
      else if (status === 'granted') setMicStatus('granted')
      else setMicStatus('unknown')
    })

    return () => {
      unState?.(); unTr?.(); unReply?.()
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__dvis
      }
      dvis.destroy()
    }
  }, [onTranscript, onReply])

  // ── إغلاق رسالة الخطأ عند النقر خارجها ──────────────────────────────────
  useEffect(() => {
    if (!permError) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPermError(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [permError])

  // ── تفعيل الميكروفون مع فحص الصلاحية ─────────────────────────────────────
  const handleMicClick = useCallback(async () => {
    setPermError(null)

    // إذا يتحدث الآن → أوقف الكلام
    if (state === 'speaking') {
      dvisRef.current?.cancelSpeech()
      return
    }

    // إذا يستمع → أوقف الاستماع
    if (state === 'listening' || state === 'wake-listening') {
      dvisRef.current?.stopListening()
      return
    }

    // فحص iframe
    if (isInsideIframe()) {
      setPermError('iframe')
      return
    }

    // فحص رُفض الإذن
    if (micStatus === 'denied') {
      setPermError('denied')
      return
    }

    // طلب الإذن إذا لم يُمنح بعد
    if (micStatus === 'unknown') {
      setMicStatus('requesting')
      const result = await requestMicPermission()
      if (result.granted) {
        setMicStatus('granted')
        dvisRef.current?.startListening()
      } else if (result.noDevice) {
        setMicStatus('no-device')
        setPermError('no-device')
      } else {
        setMicStatus('denied')
        setPermError('denied')
      }
      return
    }

    // بدء الاستماع
    dvisRef.current?.startListening()
  }, [state, micStatus])

  // لا نُظهر المكوّن إذا لا يوجد دعم لـ STT أو Edge TTS
  if (!sttOk && !edgeOk) return null

  const isListening = state === 'listening' || state === 'wake-listening'
  const isSpeaking  = state === 'speaking'

  // ── أيقونة + CSS class ────────────────────────────────────────────────────
  let icon = <Mic size={16} />
  let cls  = 'dz-vp-trigger'

  if (micStatus === 'denied')  { icon = <AlertTriangle size={16} />; cls += ' is-denied' }
  else if (isListening)        { icon = <MicOff size={16} />;        cls += ' is-listening' }
  else if (isSpeaking)         { icon = <Volume2 size={16} />;       cls += ' is-speaking' }

  // ── عنوان الزر ───────────────────────────────────────────────────────────
  const title =
    isListening        ? 'إيقاف الاستماع'
    : isSpeaking       ? 'إيقاف الكلام'
    : micStatus === 'denied'  ? 'الميكروفون محجوب'
    : micStatus === 'no-device' ? 'لا يوجد ميكروفون'
    : 'تحدّث بالعربية أو الدارجة'

  return (
    <div className="dz-vp-wrap" ref={wrapRef}>

      {/* ── مؤشر الحالة فوق الزر ── */}
      {(isListening || isSpeaking) && (
        <span className="dz-voice-state" aria-live="polite">
          {isListening ? '🎤 يستمع...' : '🔊 يتحدث...'}
        </span>
      )}

      {/* ── الزر الوحيد ── */}
      <button
        type="button"
        className={cls}
        title={title}
        onClick={handleMicClick}
        aria-label={title}
      >
        {icon}
        {edgeOk && !isListening && !isSpeaking && (
          <span className="dz-vp-dot" title="إسماعيل — صوت رجل جزائري طبيعي" />
        )}
      </button>

      {/* ── رسالة خطأ الصلاحية ── */}
      {permError && (
        <div className="dz-vp-perm-error" style={{ bottom: 'calc(100% + 8px)', insetInlineEnd: 0 }}>
          {permError === 'iframe' ? (
            <>
              <p>🔒 المتصفح يمنع الميكروفون في الـ preview.</p>
              <button
                className="dz-vp-perm-link"
                onClick={() => window.open(window.location.href, '_blank')}
              >
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
