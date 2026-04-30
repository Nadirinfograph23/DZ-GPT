// Thin React wrapper for the dz Voice Intelligence System (DVIS).
// Pure additive UI — sits next to the existing send button and never
// interferes with text-mode chat.
import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Settings2, Radio } from 'lucide-react'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — JS module without .d.ts
import { createDVIS } from '../../voice-system/controller.js'

type DvisState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'wake-listening'

interface Prefs {
  gender: 'male' | 'female'
  fastMode: boolean
  muted: boolean
  wakeWord: boolean
  continuous: boolean
  language: 'auto' | 'ar' | 'fr' | 'en'
}

interface VoicePanelProps {
  /** Called when a final transcript is captured — host can put it into the chat input. */
  onTranscript?: (text: string) => void
  /** Called when the AI reply text is received — host can show it in the chat. */
  onReply?: (text: string) => void
  /** Optional async hook so DVIS routes through the host's existing send pipeline. */
  registerHostProcessor?: (handler: (text: string) => Promise<string> | string) => void
}

export default function VoicePanel({ onTranscript, onReply }: VoicePanelProps) {
  const dvisRef = useRef<ReturnType<typeof createDVIS> | null>(null)
  const [state, setState] = useState<DvisState>('idle')
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [supported, setSupported] = useState({ stt: false, tts: false })

  useEffect(() => {
    const dvis = createDVIS({ baseUrl: '' })
    dvisRef.current = dvis
    setSupported({ stt: dvis.isSttSupported(), tts: dvis.isTtsSupported() })
    setPrefs(dvis.getPrefs())
    // Expose globally so the chat can request auto-speak for short replies
    // even when the user typed (didn't use voice input).
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
    const unPrefs = dvis.on('prefs', (p: Prefs) => setPrefs(p))
    dvis.preload()
    return () => {
      unState?.(); unTr?.(); unReply?.(); unPrefs?.()
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any).__dvis
      }
      dvis.destroy()
    }
  }, [onTranscript, onReply])

  if (!prefs) return null
  if (!supported.stt && !supported.tts) return null

  const updatePref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    dvisRef.current?.setPrefs({ [k]: v } as Partial<Prefs>)
  }

  const onMicClick = () => {
    if (!supported.stt) return
    dvisRef.current?.toggleListening()
  }

  const stateLabel: Record<DvisState, string> = {
    idle: '',
    listening: '🎤 يستمع...',
    thinking: '...يفكر',
    speaking: '🔊 يتحدث',
    'wake-listening': '👂 ينتظر "Hey DZ"',
  }

  const isMicActive = state === 'listening' || state === 'wake-listening'

  return (
    <div className="dz-voice-panel" data-state={state}>
      {state !== 'idle' && (
        <span className="dz-voice-state" aria-live="polite">{stateLabel[state]}</span>
      )}

      {supported.stt && (
        <button
          type="button"
          className={`dz-voice-btn ${isMicActive ? 'is-active' : ''}`}
          title={isMicActive ? 'إيقاف الاستماع' : 'تحدث إلى DZ Agent'}
          onClick={onMicClick}
          aria-label="voice input"
          aria-pressed={isMicActive}
        >
          {isMicActive ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
      )}

      {supported.tts && (
        <button
          type="button"
          className={`dz-voice-btn ${prefs.muted ? 'is-muted' : ''}`}
          title={prefs.muted ? 'تشغيل الصوت' : 'كتم الصوت'}
          onClick={() => updatePref('muted', !prefs.muted)}
          aria-label="mute"
          aria-pressed={prefs.muted}
        >
          {prefs.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      )}

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

      {showSettings && (
        <div className="dz-voice-settings" role="dialog">
          <div className="dz-voice-settings-row">
            <label>الصوت</label>
            <div className="dz-voice-toggle-group">
              <button
                type="button"
                className={prefs.gender === 'female' ? 'on' : ''}
                onClick={() => updatePref('gender', 'female')}
              >👩 أنثى</button>
              <button
                type="button"
                className={prefs.gender === 'male' ? 'on' : ''}
                onClick={() => updatePref('gender', 'male')}
              >👨 ذكر</button>
            </div>
          </div>

          <div className="dz-voice-settings-row">
            <label>اللغة</label>
            <select
              value={prefs.language}
              onChange={(e) => updatePref('language', e.target.value as Prefs['language'])}
            >
              <option value="auto">تلقائي 🌍</option>
              <option value="ar">العربية</option>
              <option value="fr">Français</option>
              <option value="en">English</option>
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

          <div className="dz-voice-settings-row">
            <label htmlFor="dz-pref-fast">⚡ وضع سريع</label>
            <input
              id="dz-pref-fast"
              type="checkbox"
              checked={prefs.fastMode}
              onChange={(e) => updatePref('fastMode', e.target.checked)}
            />
          </div>

          <div className="dz-voice-settings-foot">
            DVIS v{dvisRef.current?.version || '2.0.0'} — مجاني، يعمل في المتصفح.
          </div>
        </div>
      )}
    </div>
  )
}
