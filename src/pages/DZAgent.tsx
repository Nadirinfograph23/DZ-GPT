import { useState, useCallback, useEffect, useRef } from 'react'
import { Sparkles, Bot, Plus, Trash2, MessageSquare, Menu, X, RefreshCw, Github, CheckCircle2, LogIn, Key, Eye, EyeOff, Save, Zap } from 'lucide-react'
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

const MAX_KEYS = 6

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

function loadStoredKeys(): string[] {
  try {
    const saved = localStorage.getItem('dz-groq-keys')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return Array(MAX_KEYS).fill('')
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

  // ===== GROQ KEYS STATE =====
  const [groqKeys, setGroqKeys] = useState<string[]>(loadStoredKeys)
  const [showKeys, setShowKeys] = useState<boolean[]>(Array(MAX_KEYS).fill(false))
  const [keysExpanded, setKeysExpanded] = useState(false)
  const [keysSaving, setKeysSaving] = useState(false)
  const [keysSaved, setKeysSaved] = useState(false)
  const [keysStatus, setKeysStatus] = useState<{ total: number; env: number; runtime: number } | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/dz-agent/github/agent-status')
      .then(r => r.json())
      .then(d => setGithubStatus(d))
      .catch(() => setGithubStatus({ ok: false }))
  }, [])

  // Load key status from server on mount
  useEffect(() => {
    fetch('/api/admin/groq-keys')
      .then(r => r.json())
      .then(d => setKeysStatus({ total: d.total, env: d.env, runtime: d.runtime }))
      .catch(() => {})
  }, [])

  // Sync stored keys to server on mount
  useEffect(() => {
    const stored = loadStoredKeys().filter(k => k.trim().length > 0)
    if (stored.length > 0) {
      fetch('/api/admin/groq-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: stored }),
      })
        .then(r => r.json())
        .then(d => setKeysStatus(prev => prev ? { ...prev, runtime: d.added, total: d.total } : { total: d.total, env: 0, runtime: d.added }))
        .catch(() => {})
    }
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

  const handleKeyChange = useCallback((idx: number, val: string) => {
    setGroqKeys(prev => {
      const next = [...prev]
      next[idx] = val
      return next
    })
    setKeysSaved(false)
  }, [])

  const toggleShowKey = useCallback((idx: number) => {
    setShowKeys(prev => {
      const next = [...prev]
      next[idx] = !next[idx]
      return next
    })
  }, [])

  const saveGroqKeys = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setKeysSaving(true)
    const valid = groqKeys.filter(k => k.trim().length > 0)
    try {
      localStorage.setItem('dz-groq-keys', JSON.stringify(groqKeys))
      const res = await fetch('/api/admin/groq-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: valid }),
      })
      const data = await res.json()
      if (data.ok) {
        setKeysStatus(prev => prev ? { ...prev, runtime: data.added, total: data.total } : { total: data.total, env: 0, runtime: data.added })
        setKeysSaved(true)
        saveTimerRef.current = setTimeout(() => setKeysSaved(false), 3000)
      }
    } catch {}
    setKeysSaving(false)
  }, [groqKeys])

  const labels = LABELS[language]
  const activeKeyCount = groqKeys.filter(k => k.trim().length > 0).length
  const totalKeys = keysStatus?.total ?? 0

  return (
    <div className="dza-layout" data-theme={theme}>
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

        {/* ===== GROQ KEYS PANEL ===== */}
        <div className="dza-groq-section">
          <button
            className="dza-groq-header"
            onClick={() => setKeysExpanded(e => !e)}
          >
            <div className="dza-groq-header-left">
              <Key size={13} className="dza-groq-icon" />
              <span className="dza-groq-title">مفاتيح Groq</span>
              {totalKeys > 0 && (
                <span className="dza-groq-count-badge">
                  <Zap size={9} />
                  {totalKeys}
                </span>
              )}
            </div>
            <span className={`dza-groq-chevron ${keysExpanded ? 'dza-groq-chevron--open' : ''}`}>▾</span>
          </button>

          {keysExpanded && (
            <div className="dza-groq-body">
              <p className="dza-groq-hint">
                أضف مفاتيح Groq مجانية من{' '}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">
                  console.groq.com
                </a>{' '}
                للتدوير التلقائي وتجنب حدود الطلبات.
              </p>

              <div className="dza-groq-fields">
                {Array.from({ length: MAX_KEYS }, (_, i) => (
                  <div key={i} className="dza-groq-field-row">
                    <span className="dza-groq-field-label">
                      {groqKeys[i]?.trim() ? (
                        <span className="dza-groq-dot dza-groq-dot--active" title="مفتاح نشط" />
                      ) : (
                        <span className="dza-groq-dot" title="فارغ" />
                      )}
                      K{i + 1}
                    </span>
                    <div className="dza-groq-input-wrap">
                      <input
                        type={showKeys[i] ? 'text' : 'password'}
                        className="dza-groq-input"
                        value={groqKeys[i] || ''}
                        onChange={e => handleKeyChange(i, e.target.value)}
                        placeholder={`gsk_...`}
                        spellCheck={false}
                        autoComplete="off"
                        dir="ltr"
                      />
                      <button
                        className="dza-groq-eye-btn"
                        onClick={() => toggleShowKey(i)}
                        title={showKeys[i] ? 'إخفاء' : 'إظهار'}
                        type="button"
                      >
                        {showKeys[i] ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="dza-groq-footer">
                {keysStatus && (
                  <span className="dza-groq-status">
                    🔑 {keysStatus.env} بيئة · ✨ {keysStatus.runtime} واجهة · المجموع: <strong>{keysStatus.total}</strong>
                  </span>
                )}
                <button
                  className={`dza-groq-save-btn ${keysSaved ? 'dza-groq-save-btn--saved' : ''}`}
                  onClick={saveGroqKeys}
                  disabled={keysSaving}
                >
                  {keysSaving ? (
                    <span className="dza-groq-saving-dot" />
                  ) : keysSaved ? (
                    <><CheckCircle2 size={12} /> تم الحفظ</>
                  ) : (
                    <><Save size={12} /> حفظ وتفعيل</>
                  )}
                </button>
              </div>

              {activeKeyCount > 0 && (
                <div className="dza-groq-active-bar">
                  {Array.from({ length: MAX_KEYS }, (_, i) => (
                    <div
                      key={i}
                      className={`dza-groq-bar-seg ${groqKeys[i]?.trim() ? 'dza-groq-bar-seg--on' : ''}`}
                      title={groqKeys[i]?.trim() ? `K${i+1}: نشط` : `K${i+1}: فارغ`}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
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
          <div className="dz-agent-badge">
            {totalKeys > 0 ? `${totalKeys} 🔑` : 'FREE'} · AI
          </div>
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
