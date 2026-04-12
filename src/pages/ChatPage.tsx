import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Home, Plus, Trash2, MessageSquare, Menu, Sparkles, X } from 'lucide-react'
import DZChatBox from '../components/DZChatBox'
import '../styles/dz-agent.css'

type Lang = 'ar' | 'en' | 'fr'

interface DZChat {
  id: string
  title: string
  createdAt: number
}

const LANGUAGES: { id: Lang; label: string; flag: string }[] = [
  { id: 'ar', label: 'العربية', flag: '🇩🇿' },
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'fr', label: 'Français', flag: '🇫🇷' },
]

const LABELS: Record<Lang, { newChat: string; noChats: string; title: string }> = {
  ar: { newChat: 'محادثة جديدة', noChats: 'لا توجد محادثات بعد', title: 'AI-DZ CHAT' },
  en: { newChat: 'New Chat', noChats: 'No conversations yet', title: 'AI-DZ CHAT' },
  fr: { newChat: 'Nouvelle conversation', noChats: 'Aucune conversation', title: 'AI-DZ CHAT' },
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

const GENDER_ICON: Record<string, string> = {
  male: '👨',
  female: '👩',
}

export default function ChatPage() {
  const navigate = useNavigate()

  const [username, setUsername] = useState<string>('')
  const [gender, setGender] = useState<string>('')

  useEffect(() => {
    document.title = 'AI-DZ CHAT'
    const storedName = localStorage.getItem('username')
    const storedId = localStorage.getItem('userId')
    if (!storedName || !storedId) {
      navigate('/dz-agent')
      return
    }
    setUsername(storedName)
    setGender(localStorage.getItem('gender') || '')
    return () => { document.title = 'DZ GPT' }
  }, [navigate])

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
              <div className="dza-sidebar-logo-name">AI-DZ CHAT</div>
              <div className="dza-sidebar-logo-sub">BY NADIR HOUAMRIA</div>
            </div>
          </div>
          <button className="dza-sidebar-close" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* User info */}
        {username && (
          <div className="dza-user-info">
            <span className="dza-user-avatar">
              {gender ? GENDER_ICON[gender] : '🧑'}
            </span>
            <div className="dza-user-details">
              <span className="dza-user-name">{username}</span>
              <span className="dza-user-role">ضيف</span>
            </div>
          </div>
        )}

        {/* Language selector */}
        <div className="dza-lang-selector">
          {LANGUAGES.map(lang => (
            <button
              key={lang.id}
              className={`dza-lang-btn ${language === lang.id ? 'dza-lang-btn--active' : ''}`}
              onClick={() => setLanguage(lang.id)}
              title={lang.label}
            >
              <span className="dza-lang-flag">{lang.flag}</span>
              <span className="dza-lang-label">{lang.label}</span>
            </button>
          ))}
        </div>

        {/* New chat button */}
        <button className="dza-new-chat-btn" onClick={createNewChat}>
          <Plus size={16} />
          <span>{labels.newChat}</span>
        </button>

        {/* Chat list */}
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

      {/* Overlay for mobile */}
      {sidebarOpen && <div className="dza-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ===== MAIN CONTENT ===== */}
      <div className="dza-main">
        {/* Header */}
        <header className="dz-agent-header">
          <button className="dza-menu-btn" onClick={() => setSidebarOpen(true)} title="Menu">
            <Menu size={18} />
          </button>
          <div className="dza-top-nav">
            <button className="dz-back-btn dz-back-btn--labeled" onClick={() => navigate('/')} title="HOME">
              <Home size={16} />
              <span className="dz-back-btn-label">HOME</span>
            </button>
            <button className="dz-back-btn dz-back-btn--labeled" onClick={() => navigate('/dz-agent')} title="DZ Agent">
              <Bot size={16} />
              <span className="dz-back-btn-label">DZ Agent</span>
            </button>
          </div>
          <div className="dz-agent-logo">
            <div className="dz-agent-logo-icon">
              <Bot size={20} />
              <Sparkles size={12} className="dz-agent-logo-spark" />
            </div>
            <div className="dz-agent-logo-text">
              <span className="dz-agent-name">AI-DZ CHAT</span>
              <span className="dz-agent-tagline">BY NADIR HOUAMRIA</span>
            </div>
          </div>
          {username && (
            <div className="dza-header-user">
              <span className="dza-header-user-icon">
                {gender ? GENDER_ICON[gender] : '🧑'}
              </span>
              <div className="dza-header-user-info">
                <span className="dza-header-username">{username}</span>
                <span className="dza-header-role">ضيف</span>
              </div>
            </div>
          )}
          <div className="dz-agent-badge">FREE · AI</div>
        </header>

        {/* Chat area */}
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
