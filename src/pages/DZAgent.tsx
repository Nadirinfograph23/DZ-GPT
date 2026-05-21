import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Bot, Plus, Trash2, MessageSquare, Menu, X, RefreshCw, ChevronDown, BookOpen, MessageCircle, Video, Volume2, Download } from 'lucide-react'
import DZChatBox from '../components/DZChatBox'
import '../styles/dz-agent.css'
import '../styles/dzc-youtube.css'

type Lang = 'ar' | 'en' | 'fr'

interface DZChat {
  id: string
  title: string
  createdAt: number
}

const LANGUAGES: { id: Lang; label: string; flag: string; code: string }[] = [
  { id: 'ar', label: 'العربية', flag: '🇩🇿', code: 'AR' },
  { id: 'en', label: 'English', flag: '🇬🇧', code: 'EN' },
  { id: 'fr', label: 'Français', flag: '🇫🇷', code: 'FR' },
]

const LABELS: Record<Lang, { newChat: string; noChats: string; title: string }> = {
  ar: { newChat: 'محادثة جديدة', noChats: 'لا توجد محادثات بعد', title: 'DZ Agent' },
  en: { newChat: 'New Chat', noChats: 'No conversations yet', title: 'DZ Agent' },
  fr: { newChat: 'Nouvelle conversation', noChats: 'Aucune conversation', title: 'DZ Agent' },
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

export default function DZAgent() {
  const navigate = useNavigate()

  const [chats, setChats] = useState<DZChat[]>(() => {
    try {
      const saved = localStorage.getItem('dz-agent-chats')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    return localStorage.getItem('dz-agent-active') || null
  })

  const [language, setLanguage] = useState<Lang>(() => {
    return (localStorage.getItem('dz-agent-lang') as Lang) || 'ar'
  })

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [navDropdownOpen, setNavDropdownOpen] = useState(false)
  const [ttsOpen, setTtsOpen] = useState(false)
  const [ttsText, setTtsText] = useState('')
  const [ttsVoice, setTtsVoice] = useState('ar-DZ-AminaNeural')
  const [ttsRate, setTtsRate] = useState('+0%')
  const [ttsLoading, setTtsLoading] = useState(false)
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null)
  const [ttsError, setTtsError] = useState('')
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    localStorage.setItem('dz-agent-chats', JSON.stringify(chats))
  }, [chats])

  useEffect(() => {
    if (activeChatId) localStorage.setItem('dz-agent-active', activeChatId)
    else localStorage.removeItem('dz-agent-active')
  }, [activeChatId])

  useEffect(() => {
    localStorage.setItem('dz-agent-lang', language)
  }, [language])

  const createNewChat = useCallback(() => {
    const chat: DZChat = { id: generateId(), title: LABELS[language].newChat, createdAt: Date.now() }
    setChats(prev => [chat, ...prev])
    setActiveChatId(chat.id)
    setSidebarOpen(false)
  }, [language])

  const deleteChat = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setChats(prev => prev.filter(c => c.id !== id))
    try { localStorage.removeItem(`dz-agent-msgs-${id}`) } catch {}
    if (activeChatId === id) setActiveChatId(null)
  }, [activeChatId])

  const handleTitleChange = useCallback((chatId: string, title: string) => {
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c))
  }, [])

  const labels = LABELS[language]

  const ttsGenerate = useCallback(async () => {
    if (!ttsText.trim() || ttsLoading) return
    setTtsLoading(true)
    setTtsError('')
    if (ttsAudioUrl) { URL.revokeObjectURL(ttsAudioUrl); setTtsAudioUrl(null) }
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ttsText.trim(), voice: ttsVoice, rate: ttsRate, pitch: '+0Hz' }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `خطأ ${res.status}`)
      }
      const blob = await res.blob()
      setTtsAudioUrl(URL.createObjectURL(blob))
    } catch (e: unknown) {
      setTtsError(e instanceof Error ? e.message : 'حدث خطأ')
    } finally {
      setTtsLoading(false)
    }
  }, [ttsText, ttsVoice, ttsRate, ttsLoading, ttsAudioUrl])

  const ttsDownload = () => {
    if (!ttsAudioUrl) return
    const a = document.createElement('a'); a.href = ttsAudioUrl
    a.download = `ai-dz-voice-${Date.now()}.mp3`; a.click()
  }

  return (
    <div className="dza-layout">
      {/* ===== SIDEBAR ===== */}
      <div className={`dza-sidebar ${sidebarOpen ? 'dza-sidebar--open' : ''}`}>
        <div className="dza-sidebar-header">
          <div className="dza-sidebar-logo">
            <div className="dza-sidebar-logo-icon">
              <Bot size={18} />
              <Sparkles size={10} className="dza-sidebar-spark" />
            </div>
            <div>
              <div className="dza-sidebar-logo-name">DZ Agent</div>
              <div className="dza-sidebar-logo-sub">BY NADIR HOUAMRIA</div>
            </div>
          </div>
          <button className="dza-sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="dza-lang-selector dza-lang-selector--row">
          {LANGUAGES.map(lang => (
            <button
              key={lang.id}
              className={`dza-lang-btn dza-lang-btn--compact ${language === lang.id ? 'dza-lang-btn--active' : ''}`}
              onClick={() => setLanguage(lang.id)}
              title={lang.label}
            >
              <span className="dza-lang-flag">{lang.flag}</span>
              <span className="dza-lang-code">{lang.code}</span>
            </button>
          ))}
        </div>

        {/* Navigation Dropdown — excludes current page (DZ Agent) */}
        <div className="sidebar-nav-dropdown">
          <button
            className="sidebar-nav-trigger"
            onClick={() => setNavDropdownOpen(p => !p)}
          >
            <span>التنقل</span>
            <ChevronDown size={14} className={`sidebar-nav-chevron ${navDropdownOpen ? 'sidebar-nav-chevron--open' : ''}`} />
          </button>
          {navDropdownOpen && (
            <div className="sidebar-nav-menu">
              <button className="sidebar-nav-item" onClick={() => { navigate('/quran'); setSidebarOpen(false); setNavDropdownOpen(false) }}>
                <BookOpen size={14} />
                <span>القرآن الكريم</span>
              </button>
              <button className="sidebar-nav-item" onClick={() => { navigate('/dzchat'); setSidebarOpen(false); setNavDropdownOpen(false) }}>
                <MessageCircle size={14} />
                <span>DZ CHAT</span>
              </button>
              <button className="sidebar-nav-item" onClick={() => { navigate('/dz-tube'); setSidebarOpen(false); setNavDropdownOpen(false) }}>
                <Video size={14} />
                <span>DZ Tube</span>
              </button>
            </div>
          )}
        </div>

        {/* TTS Panel */}
        <div className="sidebar-nav-dropdown">
          <button
            className="sidebar-nav-trigger"
            onClick={() => setTtsOpen(p => !p)}
            style={{ gap: 8 }}
          >
            <Volume2 size={14} />
            <span>تحويل نص إلى صوت</span>
            <ChevronDown size={14} className={`sidebar-nav-chevron ${ttsOpen ? 'sidebar-nav-chevron--open' : ''}`} style={{ marginRight: 'auto' }} />
          </button>
          {ttsOpen && (
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, direction: 'rtl' }}>
              <select
                value={ttsVoice}
                onChange={e => setTtsVoice(e.target.value)}
                style={{ background: '#0d1f0f', border: '1px solid #2a5a35', color: '#e0ffe0', borderRadius: 7, padding: '6px 8px', fontSize: 12, width: '100%' }}
              >
                <optgroup label="🇩🇿 جزائرية"><option value="ar-DZ-AminaNeural">أمينة — عربية جزائرية</option><option value="ar-DZ-IsmaelNeural">إسماعيل — عربية جزائرية</option></optgroup>
                <optgroup label="🇸🇦 فصحى"><option value="ar-SA-ZariyahNeural">زارية — فصحى</option><option value="ar-SA-HamedNeural">حامد — فصحى</option></optgroup>
                <optgroup label="🇫🇷 فرنسية"><option value="fr-FR-DeniseNeural">دينيز — فرنسية</option><option value="fr-DZ-AmineNeural">أمين — فرنسية جزائرية</option></optgroup>
                <optgroup label="🇺🇸 إنجليزية"><option value="en-US-JennyNeural">جيني — إنجليزية</option></optgroup>
              </select>
              <select
                value={ttsRate}
                onChange={e => setTtsRate(e.target.value)}
                style={{ background: '#0d1f0f', border: '1px solid #2a5a35', color: '#e0ffe0', borderRadius: 7, padding: '6px 8px', fontSize: 12, width: '100%' }}
              >
                <option value="-25%">🐢 بطيء</option>
                <option value="+0%">▶ عادي</option>
                <option value="+25%">⚡ سريع</option>
              </select>
              <textarea
                value={ttsText}
                onChange={e => setTtsText(e.target.value.slice(0, 3000))}
                placeholder="اكتب النص هنا..."
                rows={4}
                style={{ background: '#0d1f0f', border: '1px solid #2a5a35', color: '#e0ffe0', borderRadius: 7, padding: '8px 10px', fontSize: 12, resize: 'vertical', fontFamily: 'inherit', direction: 'auto' }}
              />
              {ttsError && <div style={{ color: '#ff6b6b', fontSize: 11 }}>⚠️ {ttsError}</div>}
              <button
                onClick={ttsGenerate}
                disabled={!ttsText.trim() || ttsLoading}
                style={{ background: ttsLoading || !ttsText.trim() ? '#1a3320' : 'linear-gradient(135deg,#c8ff00,#8fd000)', color: ttsLoading || !ttsText.trim() ? '#4a7a55' : '#000', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: ttsLoading || !ttsText.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Volume2 size={14} />
                {ttsLoading ? 'جاري التوليد...' : 'تحويل إلى صوت'}
              </button>
              {ttsAudioUrl && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <audio ref={ttsAudioRef} src={ttsAudioUrl} controls style={{ width: '100%', borderRadius: 6, accentColor: '#c8ff00' }} />
                  <button
                    onClick={ttsDownload}
                    style={{ background: '#1a3320', border: '1px solid #2a5a35', color: '#c8ff00', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                  >
                    <Download size={13} /> تحميل MP3
                  </button>
                  <div style={{ fontSize: 10, color: '#4a7a55', textAlign: 'center' }}>AI DZ voice</div>
                </div>
              )}
            </div>
          )}
        </div>

        <button className="dza-new-chat-btn" onClick={createNewChat}>
          <Plus size={16} />
          <span>{labels.newChat}</span>
        </button>

        <div className="dza-chat-list">
          {chats.length === 0 ? (
            <div className="dza-chat-list-empty">{labels.noChats}</div>
          ) : (
            chats.map(chat => (
              <div
                key={chat.id}
                className={`dza-chat-item ${chat.id === activeChatId ? 'dza-chat-item--active' : ''}`}
                onClick={() => { setActiveChatId(chat.id); setSidebarOpen(false) }}
              >
                <MessageSquare size={14} className="dza-chat-item-icon" />
                <span className="dza-chat-item-title">{chat.title}</span>
                <button
                  className="dza-chat-item-del"
                  onClick={(e) => deleteChat(chat.id, e)}
                  title="حذف"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>

      </div>

      {sidebarOpen && <div className="dza-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ===== MAIN CONTENT ===== */}
      <div className="dza-main">
        <header className="dz-agent-header">
          <div className="dz-agent-header-left">
            <button className="dz-home-btn" onClick={() => navigate('/')} title="Home">
              HOME
            </button>
            <button className="dz-refresh-chat-btn" onClick={createNewChat} title={labels.newChat}>
              <RefreshCw size={18} />
            </button>
            <button className="dza-menu-btn" onClick={() => setSidebarOpen(true)} title="Menu">
              <Menu size={18} />
            </button>
          </div>
          <div className="dz-agent-logo">
            <div className="dz-agent-logo-icon">
              <Bot size={20} />
              <Sparkles size={12} className="dz-agent-logo-spark" />
            </div>
            <div className="dz-agent-logo-text">
              <span className="dz-agent-name">DZ Agent</span>
              <span className="dz-agent-tagline">BY NADIR HOUAMRIA</span>
            </div>
          </div>
          <div className="dz-agent-badge">FREE · AI</div>
        </header>

        <div className="dz-agent-body">
          <DZChatBox
            key={activeChatId || 'no-chat'}
            chatId={activeChatId}
            language={language}
            onTitleChange={activeChatId ? (title) => handleTitleChange(activeChatId, title) : undefined}
          />
        </div>
      </div>
    </div>
  )
}
