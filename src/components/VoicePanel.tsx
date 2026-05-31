// DZ Voice Panel v2.2 — Edge TTS Neural + STT + Permission Guard
// صوت طبيعي جزائري: ar-DZ-AminaNeural / ar-DZ-IsmaelNeural
import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Settings2, Radio, Zap, AlertTriangle, ExternalLink } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — JS module without .d.ts
import { createDVIS } from '../../voice-system/controller.js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — JS module without .d.ts
import { checkMicPermission, requestMicPermission } from '../../voice-system/speechToText.js'

type DvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'wake-listening'
type MicStatus = 'unknown' | 'granted' | 'denied' | 'no-device' | 'iframe-blocked' | 'requesting'

interface Prefs {
  gender:     'male' | 'female'
  fastMode:   boolean
  muted:      boolean
  wakeWord:   boolean
  continuous: boolean
  language:   'auto' | 'ar' | 'fr' | 'en'
}

interface VoicePanelProps {
  onTranscript?:         (text: string) => void
  onReply?:              (text: string) => void
  registerHostProcessor?:(handler: (text: string) => Promise<string> | string) => void
}

// فحص: هل الصفحة داخل iframe (مثل Replit preview)؟
function isInsideIframe(): boolean {
  try { return window.self !== window.top } catch { return true }
}

export default function VoicePanel({ onTranscript, onReply }: VoicePanelProps) {
  const dvisRef             = useRef<ReturnType<typeof createDVIS> | null>(null)
  const [state, setState]   = useState<DvisState>('idle')
  const [prefs, setPrefs]   = useState<Prefs | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [sttOk, setSttOk]   = useState(false)
  const [edgeOk, setEdgeOk] = useState(false)
  const [micStatus, setMicStatus] = useState<MicStatus>('unknown')
  const [showPermGuide, setShowPermGuide] = useState(false)

  // ── تهيئة DVIS ────────────────────────────────────────────────────────────
  useEffect(() => {
    const dvis = createDVIS({ baseUrl: '' })
    dvisRef.current = dvis
    setSttOk(dvis.isSttSupported())
    setPrefs(dvis.getPrefs())

    fetch('/api/voice/voices', { signal: AbortSignal.timeout(3000) })
      .then(r => r.ok && setEdgeOk(true))
      .catch(() => {})

    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__dvis = dvis
    }

    const unState = dvis.on('state',      (s: DvisState) => setState(s))
    const unTr    = dvis.on('transcript', ({ text, isFinal }: { text: string; isFinal: boolean }) => {
      if (isFinal && onTranscript) onTranscript(text)
    })
    const unReply = dvis.on('reply',      ({ text }: { text: string }) => {
      if (onReply) onReply(text)
    })
    const unPrefs = dvis.on('prefs',      (p: Prefs) => setPrefs(p))
    dvis.preload()

    // فحص حالة صلاحية الميكروفون عند التحميل
    checkMicPermission().then((status: string) => {
      if (status === 'denied') setMicStatus('denied')
      else if (status === 'granted') setMicStatus('granted')
      else setMicStatus('unknown')
    })

    return () => {
      unState?.(); unTr?.(); unReply?.(); unPrefs?.()
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__dvis
      }
      dvis.destroy()
    }
  }, [onTranscript, onReply])

  const updatePref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    dvisRef.current?.setPrefs({ [k]: v } as Partial<Prefs>)
  }

  // ── نقر زر الميكروفون مع فحص الصلاحية ───────────────────────────────────
  const onMicClick = useCallback(async () => {
    if (!sttOk) return

    // إذا داخل iframe → وجّه المستخدم لفتح النافذة مباشرة
    if (isInsideIframe()) {
      setShowPermGuide(true)
      return
    }

    // إذا محجوب سابقاً → أظهر الدليل
    if (micStatus === 'denied') {
      setShowPermGuide(true)
      return
    }

    // إذا لم نطلب بعد → اطلب الإذن أولاً
    if (micStatus === 'unknown') {
      setMicStatus('requesting')
      const result = await requestMicPermission()
      if (result.granted) {
        setMicStatus('granted')
        dvisRef.current?.toggleListening()
      } else if (result.noDevice) {
        setMicStatus('no-device')
        setShowPermGuide(true)
      } else {
        setMicStatus('denied')
        setShowPermGuide(true)
      }
      return
    }

    dvisRef.current?.toggleListening()
  }, [sttOk, micStatus])

  if (!prefs) return null
  if (!sttOk && !edgeOk) return null

  const isMicActive = state === 'listening' || state === 'wake-listening'
  const isSpeaking  = state === 'speaking'

  const stateLabel: Record<DvisState, string> = {
    idle:             '',
    listening:        '🎤 يستمع...',
    thinking:         '...يفكر',
    speaking:         '🔊 يتحدث',
    'wake-listening': '👂 ينتظر "Hey DZ"',
  }

  // رسالة الدليل حسب السبب
  const permGuideMsg = isInsideIframe()
    ? {
        title: '🔒 الميكروفون يحتاج نافذة مستقلة',
        body: 'المتصفح يمنع الميكروفون داخل الـ preview. افتح التطبيق في نافذة جديدة:',
        btn: 'فتح في نافذة جديدة',
        action: () => window.open(window.location.href, '_blank'),
      }
    : micStatus === 'no-device'
    ? {
        title: '🎙 لم يُعثر على ميكروفون',
        body: 'تأكد أن الميكروفون موصول وأن المتصفح يراه.',
        btn: null,
        action: null,
      }
    : {
        title: '🔒 إذن الميكروفون مرفوض',
        body: 'المتصفح حجب الميكروفون. لإعادة التفعيل:',
        steps: [
          'انقر على أيقونة القفل 🔒 في شريط العنوان',
          'غيّر "الميكروفون" إلى "سماح"',
          'أعد تحميل الصفحة',
        ],
        btn: null,
        action: null,
      }

  return (
    <div className="dz-voice-panel" data-state={state}>

      {/* مؤشر الحالة */}
      {state !== 'idle' && (
        <span className="dz-voice-state" aria-live="polite">{stateLabel[state]}</span>
      )}

      {/* شارة الصوت الطبيعي */}
      {edgeOk && (
        <span className="dz-voice-badge" title="صوت جزائري طبيعي — Microsoft Edge Neural">
          <Zap size={10} />
          <span>طبيعي</span>
        </span>
      )}

      {/* زر الميكروفون */}
      {sttOk && (
        <button
          type="button"
          className={`dz-voice-btn ${isMicActive ? 'is-active' : ''} ${micStatus === 'denied' ? 'is-denied' : ''}`}
          title={
            micStatus === 'denied' ? 'الميكروفون محجوب — انقر للمساعدة'
            : isMicActive ? 'إيقاف الاستماع'
            : 'تحدث إلى DZ Agent'
          }
          onClick={onMicClick}
          aria-label="voice input"
          aria-pressed={isMicActive}
        >
          {micStatus === 'denied'
            ? <AlertTriangle size={18} />
            : isMicActive ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
      )}

      {/* زر إيقاف/تشغيل الصوت */}
      <button
        type="button"
        className={`dz-voice-btn ${prefs.muted ? 'is-muted' : ''} ${isSpeaking ? 'is-speaking' : ''}`}
        title={prefs.muted ? 'تشغيل الصوت' : 'كتم الصوت'}
        onClick={() => updatePref('muted', !prefs.muted)}
        aria-label="mute"
        aria-pressed={prefs.muted}
      >
        {prefs.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {/* إعدادات */}
      <button
        type="button"
        className={`dz-voice-btn ${showSettings ? 'is-open' : ''}`}
        title="إعدادات الصوت"
        onClick={() => setShowSettings(s => !s)}
        aria-label="voice settings"
        aria-expanded={showSettings}
      >
        <Settings2 size={18} />
      </button>

      {/* دليل الصلاحية */}
      {showPermGuide && (
        <div className="dz-perm-guide" role="dialog" aria-label="إرشادات الصلاحية">
          <button
            className="dz-perm-guide-close"
            onClick={() => setShowPermGuide(false)}
            aria-label="إغلاق"
          >×</button>
          <div className="dz-perm-guide-title">
            <AlertTriangle size={14} />
            {permGuideMsg.title}
          </div>
          <p className="dz-perm-guide-body">{permGuideMsg.body}</p>
          {'steps' in permGuideMsg && permGuideMsg.steps && (
            <ol className="dz-perm-guide-steps">
              {permGuideMsg.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
          {permGuideMsg.btn && permGuideMsg.action && (
            <button
              className="dz-perm-guide-btn"
              onClick={permGuideMsg.action}
            >
              <ExternalLink size={13} />
              {permGuideMsg.btn}
            </button>
          )}
        </div>
      )}

      {showSettings && (
        <div className="dz-voice-settings" role="dialog">

          <div className="dz-voice-settings-row">
            <label>الصوت</label>
            <div className="dz-voice-toggle-group">
              <button
                type="button"
                className={prefs.gender === 'female' ? 'on' : ''}
                onClick={() => updatePref('gender', 'female')}
              >👩 أمينة</button>
              <button
                type="button"
                className={prefs.gender === 'male' ? 'on' : ''}
                onClick={() => updatePref('gender', 'male')}
              >👨 إسماعيل</button>
            </div>
          </div>

          <div className="dz-voice-settings-row">
            <label>اللغة</label>
            <select
              value={prefs.language}
              onChange={(e) => updatePref('language', e.target.value as Prefs['language'])}
            >
              <option value="auto">تلقائي 🌍</option>
              <option value="ar">العربية الجزائرية 🇩🇿</option>
              <option value="fr">Français DZ 🇩🇿</option>
              <option value="en">English 🇬🇧</option>
            </select>
          </div>

          <div className="dz-voice-settings-row">
            <label htmlFor="dz-pref-continuous">محادثة مستمرة</label>
            <input
              id="dz-pref-continuous"
              type="checkbox"
              checked={prefs.continuous}
              onChange={(e) => updatePref('continuous', e.target.checked)}
            />
          </div>

          <div className="dz-voice-settings-row">
            <label htmlFor="dz-pref-wake">
              <Radio size={12} style={{ verticalAlign: 'middle', marginInlineEnd: 4 }} />
              "Hey DZ"
            </label>
            <input
              id="dz-pref-wake"
              type="checkbox"
              checked={prefs.wakeWord}
              onChange={(e) => updatePref('wakeWord', e.target.checked)}
            />
          </div>

          <div className="dz-voice-settings-foot">
            DVIS v{dvisRef.current?.version || '2.2.0'} —{' '}
            {edgeOk
              ? <span style={{ color: '#22c55e' }}>🎙 صوت جزائري طبيعي (Edge Neural)</span>
              : <span style={{ color: '#f59e0b' }}>⚠ صوت المتصفح (fallback)</span>
            }
          </div>
        </div>
      )}
    </div>
  )
}
