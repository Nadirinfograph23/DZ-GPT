// DZ Voice Panel v3.0 — Compact single-button + floating menu
// زر واحد في الـ input bar يفتح قائمة عائمة بكل أدوات الصوت
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Mic, MicOff, Volume2, VolumeX, Settings2, Radio,
  Zap, AlertTriangle, ExternalLink, ChevronDown,
} from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — JS module without .d.ts
import { createDVIS } from '../../voice-system/controller.js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — JS module without .d.ts
import { checkMicPermission, requestMicPermission } from '../../voice-system/speechToText.js'

type DvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'wake-listening'
type MicStatus = 'unknown' | 'granted' | 'denied' | 'no-device' | 'requesting'

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

function isInsideIframe(): boolean {
  try { return window.self !== window.top } catch { return true }
}

export default function VoicePanel({ onTranscript, onReply }: VoicePanelProps) {
  const dvisRef           = useRef<ReturnType<typeof createDVIS> | null>(null)
  const panelRef          = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<DvisState>('idle')
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [open, setOpen]   = useState(false)          // قائمة مفتوحة؟
  const [showSettings, setShowSettings] = useState(false)
  const [sttOk, setSttOk]   = useState(false)
  const [edgeOk, setEdgeOk] = useState(false)
  const [micStatus, setMicStatus] = useState<MicStatus>('unknown')
  const [permError, setPermError] = useState<string | null>(null)

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

    const unState = dvis.on('state', (s: DvisState) => setState(s))
    const unTr    = dvis.on('transcript', ({ text, isFinal }: { text: string; isFinal: boolean }) => {
      if (isFinal && onTranscript) onTranscript(text)
    })
    const unReply = dvis.on('reply', ({ text }: { text: string }) => {
      if (onReply) onReply(text)
    })
    const unPrefs = dvis.on('prefs', (p: Prefs) => setPrefs(p))
    dvis.preload()

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

  // ── إغلاق القائمة عند النقر خارجها ──────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowSettings(false)
        setPermError(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const updatePref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    dvisRef.current?.setPrefs({ [k]: v } as Partial<Prefs>)
  }

  // ── تفعيل الميكروفون مع فحص الصلاحية ─────────────────────────────────────
  const handleMicToggle = useCallback(async () => {
    setPermError(null)

    if (isInsideIframe()) {
      setPermError('iframe')
      return
    }
    if (micStatus === 'denied') {
      setPermError('denied')
      return
    }
    if (micStatus === 'unknown') {
      setMicStatus('requesting')
      const result = await requestMicPermission()
      if (result.granted) {
        setMicStatus('granted')
        dvisRef.current?.toggleListening()
      } else if (result.noDevice) {
        setMicStatus('no-device')
        setPermError('no-device')
      } else {
        setMicStatus('denied')
        setPermError('denied')
      }
      return
    }
    dvisRef.current?.toggleListening()
  }, [sttOk, micStatus])

  // ── نقر الزر الرئيسي ──────────────────────────────────────────────────────
  const handleMainClick = () => {
    // إذا يستمع أو يتحدث → أوقفه مباشرة بدون فتح القائمة
    if (state === 'listening' || state === 'wake-listening') {
      dvisRef.current?.toggleListening()
      return
    }
    setOpen(v => !v)
    if (open) { setShowSettings(false); setPermError(null) }
  }

  if (!prefs) return null
  if (!sttOk && !edgeOk) return null

  const isMicActive = state === 'listening' || state === 'wake-listening'
  const isSpeaking  = state === 'speaking'

  // ── أيقونة + لون الزر الرئيسي ─────────────────────────────────────────────
  let mainIcon = <Mic size={16} />
  let mainClass = 'dz-vp-trigger'
  if (micStatus === 'denied') { mainIcon = <AlertTriangle size={16} />; mainClass += ' is-denied' }
  else if (isMicActive)       { mainIcon = <MicOff size={16} />;        mainClass += ' is-listening' }
  else if (isSpeaking)        { mainIcon = <Volume2 size={16} />;       mainClass += ' is-speaking' }
  else if (prefs.muted)       { mainIcon = <VolumeX size={16} />;       mainClass += ' is-muted' }
  if (open)                   { mainClass += ' is-open' }

  const stateText: Partial<Record<DvisState, string>> = {
    listening:        '🎤 يستمع...',
    thinking:         '⏳ يفكر...',
    speaking:         '🔊 يتحدث...',
    'wake-listening': '👂 ينتظر "Hey DZ"',
  }

  return (
    <div className="dz-vp-wrap" ref={panelRef}>

      {/* ── الزر الرئيسي الوحيد ── */}
      <button
        type="button"
        className={mainClass}
        title={
          isMicActive ? 'إيقاف الاستماع (انقر)'
          : isSpeaking ? 'يتحدث الآن...'
          : micStatus === 'denied' ? 'الميكروفون محجوب — انقر للمساعدة'
          : 'أدوات الصوت'
        }
        onClick={handleMainClick}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {mainIcon}
        {!isMicActive && !isSpeaking && (
          <ChevronDown size={10} className={`dz-vp-chevron ${open ? 'is-open' : ''}`} />
        )}
        {edgeOk && !isMicActive && !isSpeaking && (
          <span className="dz-vp-dot" title="Edge TTS Neural نشط" />
        )}
      </button>

      {/* ── مؤشر الحالة فوق الزر (يظهر فقط عند النشاط) ── */}
      {state !== 'idle' && stateText[state] && (
        <span className="dz-voice-state" aria-live="polite">{stateText[state]}</span>
      )}

      {/* ── القائمة العائمة ── */}
      {open && (
        <div className="dz-vp-menu" role="dialog" aria-label="أدوات الصوت">

          {/* ─ عنوان القائمة ─ */}
          <div className="dz-vp-menu-header">
            <Zap size={11} />
            <span>أدوات الصوت</span>
            {edgeOk && <span className="dz-vp-menu-badge">Edge Neural</span>}
          </div>

          {/* ─ صف أزرار الأدوات ─ */}
          <div className="dz-vp-menu-row">

            {/* الميكروفون */}
            {sttOk && (
              <button
                type="button"
                className={`dz-vp-menu-btn ${isMicActive ? 'is-active' : ''} ${micStatus === 'denied' ? 'is-warn' : ''}`}
                onClick={handleMicToggle}
                title={isMicActive ? 'إيقاف الاستماع' : 'بدء الاستماع'}
              >
                {micStatus === 'denied' ? <AlertTriangle size={15} /> : isMicActive ? <MicOff size={15} /> : <Mic size={15} />}
                <span>{isMicActive ? 'إيقاف' : 'مايك'}</span>
              </button>
            )}

            {/* كتم/تشغيل الصوت */}
            <button
              type="button"
              className={`dz-vp-menu-btn ${prefs.muted ? 'is-muted' : ''} ${isSpeaking ? 'is-speaking' : ''}`}
              onClick={() => updatePref('muted', !prefs.muted)}
              title={prefs.muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            >
              {prefs.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              <span>{prefs.muted ? 'صامت' : 'صوت'}</span>
            </button>

            {/* الإعدادات */}
            <button
              type="button"
              className={`dz-vp-menu-btn ${showSettings ? 'is-active' : ''}`}
              onClick={() => setShowSettings(s => !s)}
              title="إعدادات الصوت"
            >
              <Settings2 size={15} />
              <span>إعداد</span>
            </button>

          </div>

          {/* ─ رسالة خطأ الصلاحية ─ */}
          {permError && (
            <div className="dz-vp-perm-error">
              {permError === 'iframe' ? (
                <>
                  <p>🔒 المتصفح يمنع الميكروفون داخل الـ preview.</p>
                  <button
                    className="dz-vp-perm-link"
                    onClick={() => window.open(window.location.href, '_blank')}
                  >
                    <ExternalLink size={11} /> فتح في نافذة جديدة
                  </button>
                </>
              ) : permError === 'no-device' ? (
                <p>🎙 لم يُعثر على ميكروفون. تحقق من التوصيل.</p>
              ) : (
                <>
                  <p>🔒 الميكروفون محجوب. لتفعيله:</p>
                  <ol>
                    <li>انقر 🔒 في شريط العنوان</li>
                    <li>غيّر "الميكروفون" → "سماح"</li>
                    <li>أعد تحميل الصفحة</li>
                  </ol>
                </>
              )}
            </div>
          )}

          {/* ─ لوحة الإعدادات (قابلة للطي) ─ */}
          {showSettings && (
            <div className="dz-vp-settings">

              <div className="dz-vp-settings-row">
                <span>الصوت</span>
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

              <div className="dz-vp-settings-row">
                <span>اللغة</span>
                <select
                  value={prefs.language}
                  onChange={e => updatePref('language', e.target.value as Prefs['language'])}
                >
                  <option value="auto">تلقائي 🌍</option>
                  <option value="ar">العربية الجزائرية 🇩🇿</option>
                  <option value="fr">Français DZ 🇩🇿</option>
                  <option value="en">English 🇬🇧</option>
                </select>
              </div>

              <div className="dz-vp-settings-row">
                <label htmlFor="dz-pref-cont">محادثة مستمرة</label>
                <input
                  id="dz-pref-cont"
                  type="checkbox"
                  checked={prefs.continuous}
                  onChange={e => updatePref('continuous', e.target.checked)}
                />
              </div>

              <div className="dz-vp-settings-row">
                <label htmlFor="dz-pref-wake">
                  <Radio size={11} style={{ verticalAlign: 'middle', marginInlineEnd: 3 }} />
                  "Hey DZ"
                </label>
                <input
                  id="dz-pref-wake"
                  type="checkbox"
                  checked={prefs.wakeWord}
                  onChange={e => updatePref('wakeWord', e.target.checked)}
                />
              </div>

            </div>
          )}

        </div>
      )}
    </div>
  )
}
