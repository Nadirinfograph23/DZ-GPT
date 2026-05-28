import { useState, useCallback, useEffect, useRef } from 'react'
import { Sparkles, Bot, Plus, Trash2, MessageSquare, Menu, X, RefreshCw, Github, CheckCircle2, LogIn, MessageCircle } from 'lucide-react'
import DZChatBox from '../components/DZChatBox'
import '../styles/dz-agent.css'
import '../styles/dzc-youtube.css'

type Lang = 'ar' | 'en' | 'fr'

const THEMES = [
  { id: 'teal',   label: 'أخضر',    bg: 'linear-gradient(135deg,#10a37f,#0d9268)' },
  { id: 'gray',   label: 'رمادي',   bg: 'linear-gradient(135deg,#94a3b8,#64748b)' },
  { id: 'indigo', label: 'بنفسجي',  bg: 'linear-gradient(135deg,#818cf8,#6366f1)' },
  { id: 'rose',   label: 'وردي',    bg: 'linear-gradient(135deg,#fb7185,#f43f5e)' },
  { id: 'amber',  label: 'ذهبي',    bg: 'linear-gradient(135deg,#fbbf24,#f59e0b)' },
  { id: 'sky',    label: 'سماوي',   bg: 'linear-gradient(135deg,#38bdf8,#0ea5e9)' },
] as const
type Theme = typeof THEMES[number]['id']

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

function getLastUserMessageFromChat(chatId: string): string {
  try {
    const raw = localStorage.getItem(`dz-agent-msgs-${chatId}`)
    if (!raw) return ''
    const msgs: { role: string; content: string }[] = JSON.parse(raw)
    const userMsgs = msgs.filter(m => m.role === 'user')
    if (!userMsgs.length) return ''
    const last = userMsgs[userMsgs.length - 1].content || ''
    return last.slice(0, 80).replace(/\n/g, ' ').trim()
  } catch { return '' }
}

export default function DZAgent() {
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

  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('dza-theme') as Theme) || 'teal'
  })

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [githubStatus, setGithubStatus] = useState<{ ok: boolean; login?: string; avatar?: string } | null>(null)

  // ── Continue conversation dialog ──────────────────────────────────────────
  const [continueDialog, setContinueDialog] = useState<{ show: boolean; topic: string; chatTitle: string } | null>(null)
  const dialogShownRef = useRef(false)

  useEffect(() => {
    if (dialogShownRef.current) return
    if (!activeChatId) return
    const savedChats: DZChat[] = (() => {
      try { return JSON.parse(localStorage.getItem('dz-agent-chats') || '[]') } catch { return [] }
    })()
    const activeChat = savedChats.find(c => c.id === activeChatId)
    if (!activeChat) return
    const lastMsg = getLastUserMessageFromChat(activeChatId)
    if (!lastMsg) return
    dialogShownRef.current = true
    setContinueDialog({ show: true, topic: lastMsg, chatTitle: activeChat.title })
  }, [activeChatId])

  const dismissDialog = useCallback(() => setContinueDialog(null), [])

  const handleNewFromDialog = useCallback(() => {
    setContinueDialog(null)
    const chat: DZChat = { id: generateId(), title: LABELS[language].newChat, createdAt: Date.now() }
    setChats(prev => [chat, ...prev])
    setActiveChatId(chat.id)
    setSidebarOpen(false)
  }, [language])

  useEffect(() => {
    fetch('/api/dz-agent/github/agent-status')
      .then(r => r.json())
      .then(d => setGithubStatus(d))
      .catch(() => setGithubStatus({ ok: false }))
  }, [])

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

  useEffect(() => {
    localStorage.setItem('dza-theme', theme)
  }, [theme])

  const createNewChat = useCallback(() => {
    const chat: DZChat = { id: generateId(), title: LABELS[language].newChat, createdAt: Date.now() }
    setChats(prev => [chat, ...prev])
    setActiveChatId(chat.id)
    setSidebarOpen(false)
    setContinueDialog(null)
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
    <div className="dza-layout" data-theme={theme}>

      {/* ===== CONTINUE TOAST ===== */}
      {continueDialog?.show && (
        <div className="dza-continue-toast" dir="rtl" role="dialog" aria-label="متابعة المحادثة">
          <div className="dza-continue-toast__header">
            <div className="dza-continue-toast__icon">
              <MessageCircle size={15} />
            </div>
            <span className="dza-continue-toast__title">متابعة المحادثة؟</span>
            <button className="dza-continue-toast__close" onClick={dismissDialog} aria-label="إغلاق">
              <X size={13} />
            </button>
          </div>
          <p className="dza-continue-toast__topic">"{continueDialog.topic}"</p>
          <div className="dza-continue-toast__actions">
            <button className="dza-continue-toast__btn dza-continue-toast__btn--yes" onClick={dismissDialog}>
              <span>✅</span> استكمل المحادثة
            </button>
            <button className="dza-continue-toast__btn dza-continue-toast__btn--no" onClick={handleNewFromDialog}>
              <span>✨</span> محادثة جديدة
            </button>
          </div>
        </div>
      )}

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

        {/* ===== THEME PICKER ===== */}
        <div className="dza-theme-section">
          <span className="dza-theme-section-label">الثيمات</span>
          <div className="dza-theme-grid">
            {THEMES.map(t => (
              <button
                key={t.id}
                className={`dza-theme-swatch${theme === t.id ? ' dza-theme-swatch--active' : ''}`}
                onClick={() => setTheme(t.id)}
                title={t.label}
              >
                <div className="dza-theme-color" style={{ background: t.bg }} />
                <span className="dza-theme-name">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ===== GITHUB OAUTH ===== */}
        <div className="dza-github-section">
          {githubStatus?.ok ? (
            <div className="dza-github-connected">
              {githubStatus.avatar && (
                <img src={githubStatus.avatar} alt="avatar" className="dza-github-avatar" />
              )}
              <div className="dza-github-info">
                <div className="dza-github-label">
                  <CheckCircle2 size={12} className="dza-github-check" />
                  متصل بـ GitHub
                </div>
                <div className="dza-github-login">@{githubStatus.login}</div>
              </div>
            </div>
          ) : (
            <a
              href="/api/auth/github"
              className="dza-github-connect-btn"
              title="اتصل بـ GitHub عبر OAuth"
            >
              <Github size={15} />
              <span>اتصل بـ GitHub</span>
              <LogIn size={13} className="dza-github-arrow" />
            </a>
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
            <button className="dza-menu-btn" onClick={() => setSidebarOpen(true)} title="Menu">
              <Menu size={18} />
            </button>
            <button className="dz-refresh-chat-btn" onClick={createNewChat} title={labels.newChat}>
              <RefreshCw size={18} />
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
          <div className="dz-agent-badge">AI</div>
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
