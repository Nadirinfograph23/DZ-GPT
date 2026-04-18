import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Home, LogOut, Users, Bell, Trash2, Send, X, MessageCircle,
  Bot, Shield, ChevronRight, Loader2, AlertCircle,
  MoreVertical, Highlighter,
} from 'lucide-react'
import '../styles/dzchat.css'

interface ChatUser {
  id: string
  name: string
  gender: 'male' | 'female'
  isAdmin?: boolean
}

interface ChatMessage {
  id: string
  from: string
  fromId: string
  gender: 'male' | 'female' | 'bot'
  text: string
  timestamp: number
  isBot?: boolean
  botType?: 'agent' | 'gpt'
  isSystem?: boolean
  isHighlighted?: boolean
  isDM?: boolean
  dmTo?: string | null
  dmToName?: string | null
  isDeleted?: boolean
  triggeredBy?: string
}

interface LocalUser {
  name: string
  gender: 'male' | 'female'
  sessionId: string
  isAdmin: boolean
}

const MALE_ICON = '♂'
const FEMALE_ICON = '♀'
const ADMIN_NAME = 'Nadir Infograph | نذير حوامرية'

function genderIcon(gender: string) {
  if (gender === 'female') return <span className="dzc-gender dzc-gender--female">{FEMALE_ICON}</span>
  if (gender === 'bot') return <Bot size={13} className="dzc-gender dzc-gender--bot" />
  return <span className="dzc-gender dzc-gender--male">{MALE_ICON}</span>
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
}

export default function DZChat() {
  const navigate = useNavigate()

  const [localUser, setLocalUser] = useState<LocalUser | null>(null)
  const [entryName, setEntryName] = useState('')
  const [entryGender, setEntryGender] = useState<'male' | 'female' | ''>('')
  const [entryAdminMode, setEntryAdminMode] = useState(false)
  const [entryAdminSecret, setEntryAdminSecret] = useState('')
  const [entryError, setEntryError] = useState('')
  const [entryLoading, setEntryLoading] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [onlineUsers, setOnlineUsers] = useState<ChatUser[]>([])
  const [onlineCount, setOnlineCount] = useState(0)

  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)

  const [dmTarget, setDmTarget] = useState<ChatUser | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [windowFocused, setWindowFocused] = useState(true)

  const [msgMenu, setMsgMenu] = useState<{ msg: ChatMessage; x: number; y: number } | null>(null)
  const [userMenu, setUserMenu] = useState<{ user: ChatUser; x: number; y: number } | null>(null)
  const [aiTyping, setAiTyping] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const wsConnectedRef = useRef(false)
  const pollingRef = useRef<number | null>(null)
  const lastMsgTsRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    const onFocus = () => setWindowFocused(true)
    const onBlur = () => setWindowFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur) }
  }, [])

  useEffect(() => {
    if (!windowFocused && messages.length > 0) {
      const last = messages[messages.length - 1]
      if (!last.isSystem && last.fromId !== sessionIdRef.current) {
        setUnreadCount(c => c + 1)
      }
    }
    if (windowFocused) setUnreadCount(0)
  }, [messages, windowFocused])

  useEffect(() => {
    if (unreadCount > 0 && !windowFocused) {
      document.title = `(${unreadCount}) رسائل جديدة — DZ Chat`
    } else {
      document.title = 'DZ Chat — دردشة مجتمعية'
    }
    return () => { document.title = 'DZ GPT' }
  }, [unreadCount, windowFocused])

  const addMessages = useCallback((incoming: ChatMessage[]) => {
    setMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id))
      const fresh = incoming.filter(m => !existingIds.has(m.id))
      if (!fresh.length) return prev
      return [...prev, ...fresh]
    })
    const latest = incoming.reduce((max, m) => Math.max(max, m.timestamp), 0)
    if (latest > lastMsgTsRef.current) lastMsgTsRef.current = latest
    const hasBot = incoming.some(m => m.isBot)
    if (hasBot) setAiTyping(false)
  }, [])

  const handleServerEvent = useCallback((data: Record<string, unknown>) => {
    if (data.type === 'message') {
      const msg = data.msg as ChatMessage
      if (msg) {
        addMessages([msg])
        const lower = (msg.text || '').toLowerCase()
        if (msg.fromId !== sessionIdRef.current && (lower.startsWith('@dzgpt') || lower.startsWith('@dzagent'))) {
          setAiTyping(true)
        }
      }
    } else if (data.type === 'update') {
      const msg = data.msg as ChatMessage
      if (msg) setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m))
    } else if (data.type === 'delete') {
      const msgId = data.msgId as string
      if (msgId) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isDeleted: true } : m))
    } else if (data.type === 'users' || data.type === 'pong') {
      if (Array.isArray(data.users)) setOnlineUsers(data.users as ChatUser[])
      if (typeof data.count === 'number') setOnlineCount(data.count)
    } else if (data.type === 'blocked') {
      if (data.userId === sessionIdRef.current) {
        alert('تم حظرك من غرفة الدردشة.')
        handleLogout()
      }
    }
  }, [addMessages])

  const startPolling = useCallback(() => {
    if (pollingRef.current) return
    pollingRef.current = window.setInterval(async () => {
      if (!sessionIdRef.current) return
      try {
        const r = await fetch(`/api/chat-room/messages?since=${lastMsgTsRef.current}&sessionId=${sessionIdRef.current}`)
        if (!r.ok) return
        const d = await r.json()
        if (d.messages?.length) addMessages(d.messages)
        if (d.users) setOnlineUsers(d.users)
        if (typeof d.count === 'number') setOnlineCount(d.count)
      } catch {}
    }, 2500)
  }, [addMessages])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
  }, [])

  const connectWebSocket = useCallback((user: LocalUser, historyMessages: ChatMessage[]) => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/chat`)

    ws.onopen = () => {
      wsConnectedRef.current = true
      ws.send(JSON.stringify({
        type: 'join',
        name: user.name,
        gender: user.gender,
        adminSecret: user.isAdmin ? sessionStorage.getItem('dzc_admin_secret') || '' : '',
      }))
    }

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'welcome') {
          const histIds = new Set(historyMessages.map(m => m.id))
          const fresh = (data.messages || []).filter((m: ChatMessage) => !histIds.has(m.id))
          addMessages([...historyMessages, ...fresh])
          if (Array.isArray(data.users)) setOnlineUsers(data.users)
          stopPolling()
        } else {
          handleServerEvent(data)
        }
      } catch {}
    }

    ws.onerror = () => {
      wsConnectedRef.current = false
      startPolling()
    }

    ws.onclose = () => {
      wsConnectedRef.current = false
      if (sessionIdRef.current) startPolling()
    }

    wsRef.current = ws

    // Heartbeat every 20 seconds
    const heartbeat = setInterval(() => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }))
    }, 20000)

    return () => {
      clearInterval(heartbeat)
      ws.close()
    }
  }, [addMessages, handleServerEvent, startPolling, stopPolling])

  const handleEnterChat = async () => {
    if (!entryName.trim()) { setEntryError('يرجى إدخال اسمك.'); return }
    if (!entryGender) { setEntryError('يرجى اختيار الجنس.'); return }
    setEntryError('')
    setEntryLoading(true)
    try {
      const body: Record<string, string> = { name: entryName.trim(), gender: entryGender }
      if (entryAdminMode && entryAdminSecret) {
        body.adminSecret = entryAdminSecret
        sessionStorage.setItem('dzc_admin_secret', entryAdminSecret)
      }
      const r = await fetch('/api/chat-room/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) { setEntryError(d.error || 'فشل الدخول.'); return }
      const user: LocalUser = { name: entryName.trim(), gender: entryGender, sessionId: d.sessionId, isAdmin: !!d.isAdmin }
      sessionIdRef.current = d.sessionId
      setLocalUser(user)
      const history: ChatMessage[] = d.messages || []
      history.forEach(m => { if (m.timestamp > lastMsgTsRef.current) lastMsgTsRef.current = m.timestamp })
      setOnlineUsers(d.users || [])
      const welcomeMsg: ChatMessage = {
        id: 'welcome-' + Date.now(),
        from: 'System',
        fromId: 'system',
        gender: 'bot',
        text: 'مرحباً بك في DZ Chat! هذه دردشة عامة لمستخدمي DZ GPT. يمكنك استدعاء الذكاء الاصطناعي باستخدام @dzgpt أو @dzagent متبوعاً بسؤالك.',
        timestamp: Date.now(),
        isSystem: true,
      }
      connectWebSocket(user, [...history, welcomeMsg])
      startPolling()
    } catch {
      setEntryError('حدث خطأ في الاتصال، حاول مجدداً.')
    } finally {
      setEntryLoading(false)
    }
  }

  const handleLogout = useCallback(async () => {
    if (sessionIdRef.current) {
      try {
        await fetch('/api/chat-room/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        })
      } catch {}
    }
    wsRef.current?.close()
    stopPolling()
    sessionIdRef.current = null
    setLocalUser(null)
    setMessages([])
    setOnlineUsers([])
    setDmTarget(null)
  }, [stopPolling])

  useEffect(() => {
    return () => {
      wsRef.current?.close()
      stopPolling()
    }
  }, [stopPolling])

  const sendMessage = useCallback(async () => {
    const text = inputText.trim()
    if (!text || !sessionIdRef.current || sending) return
    setSending(true)
    setInputText('')
    try {
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({
          type: 'message',
          text,
          dmTo: dmTarget?.id || null,
          dmToName: dmTarget?.name || null,
        }))
      } else {
        const r = await fetch('/api/chat-room/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current, text, dmTo: dmTarget?.id, dmToName: dmTarget?.name }),
        })
        const d = await r.json()
        if (d.ok) {
          const myMsg: ChatMessage = {
            id: d.msgId || 'local-' + Date.now(),
            from: localUser!.name,
            fromId: sessionIdRef.current!,
            gender: localUser!.gender,
            text,
            timestamp: Date.now(),
            isDM: !!dmTarget,
            dmTo: dmTarget?.id,
            dmToName: dmTarget?.name,
          }
          addMessages([myMsg])
        }
      }
      const lower = text.toLowerCase()
      if (lower.startsWith('@dzgpt') || lower.startsWith('@dzagent')) setAiTyping(true)
    } catch {}
    finally { setSending(false); inputRef.current?.focus() }
  }, [inputText, sending, dmTarget, localUser, addMessages])

  const clearChat = () => setMessages([])

  const adminAction = async (action: string, targetId?: string, msgId?: string) => {
    if (!sessionIdRef.current) return
    try {
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'admin', action, targetId, msgId }))
      } else {
        await fetch('/api/chat-room/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current, action, targetId, msgId }),
        })
      }
    } catch {}
    setMsgMenu(null)
    setUserMenu(null)
  }

  useEffect(() => {
    if (messages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  if (!localUser) {
    return (
      <div className="dzc-root" onClick={() => { setMsgMenu(null); setUserMenu(null) }}>
        <div className="dzc-entry-overlay">
          <div className="dzc-entry-modal">
            <div className="dzc-entry-logo">
              <MessageCircle size={32} className="dzc-entry-logo-icon" />
              <span className="dzc-entry-logo-text">DZ Chat</span>
            </div>
            <p className="dzc-entry-subtitle">دردشة مجتمعية حية لمستخدمي DZ GPT</p>

            <div className="dzc-entry-field">
              <input
                className="dzc-entry-input"
                placeholder="أدخل اسمك..."
                value={entryName}
                onChange={e => setEntryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEnterChat()}
                maxLength={30}
                autoFocus
              />
            </div>

            <div className="dzc-entry-gender">
              <button
                className={`dzc-gender-btn ${entryGender === 'male' ? 'dzc-gender-btn--active' : ''}`}
                onClick={() => setEntryGender('male')}
              >
                <span className="dzc-gender-icon">♂</span>
                <span>ذكر</span>
              </button>
              <button
                className={`dzc-gender-btn ${entryGender === 'female' ? 'dzc-gender-btn--active dzc-gender-btn--female' : ''}`}
                onClick={() => setEntryGender('female')}
              >
                <span className="dzc-gender-icon dzc-gender-icon--female">♀</span>
                <span>أنثى</span>
              </button>
            </div>

            <div className="dzc-entry-admin-toggle">
              <button className="dzc-entry-admin-link" onClick={() => setEntryAdminMode(p => !p)}>
                <Shield size={12} /> {entryAdminMode ? 'إلغاء وضع المشرف' : 'دخول كمشرف'}
              </button>
            </div>
            {entryAdminMode && (
              <input
                className="dzc-entry-input dzc-entry-input--admin"
                placeholder="كلمة سر المشرف..."
                type="password"
                value={entryAdminSecret}
                onChange={e => setEntryAdminSecret(e.target.value)}
              />
            )}

            {entryError && <div className="dzc-entry-error"><AlertCircle size={13} /> {entryError}</div>}

            <button className="dzc-entry-btn" onClick={handleEnterChat} disabled={entryLoading}>
              {entryLoading ? <Loader2 size={16} className="dzc-spin" /> : <><MessageCircle size={16} /> دخول الدردشة</>}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const visibleMessages = messages.filter(m => {
    if (m.isDM) return m.fromId === sessionIdRef.current || m.dmTo === sessionIdRef.current
    return true
  })

  return (
    <div className="dzc-root" dir="rtl" onClick={() => { setMsgMenu(null); setUserMenu(null) }}>

      {/* ===== TOP NAV ===== */}
      <header className="dzc-nav">
        <div className="dzc-nav-left">
          <button className="dzc-nav-btn" onClick={() => navigate('/')} title="الرئيسية">
            <Home size={15} /> <span className="dzc-nav-label">الرئيسية</span>
          </button>
        </div>
        <div className="dzc-nav-center">
          <MessageCircle size={16} className="dzc-nav-icon" />
          <span className="dzc-nav-title">DZ Chat</span>
        </div>
        <div className="dzc-nav-right">
          <button className="dzc-nav-btn dzc-nav-btn--users" onClick={() => setSidebarOpen(p => !p)} title="المستخدمون">
            <Users size={15} />
            <span className="dzc-nav-badge">{onlineCount || onlineUsers.length}</span>
          </button>
          {unreadCount > 0 && (
            <button className="dzc-nav-btn dzc-nav-notif" title="رسائل غير مقروءة">
              <Bell size={15} />
              <span className="dzc-nav-badge dzc-nav-badge--notif">{unreadCount}</span>
            </button>
          )}
          <button className="dzc-nav-btn" onClick={clearChat} title="مسح الدردشة">
            <Trash2 size={15} />
          </button>
          <button className="dzc-nav-btn dzc-nav-btn--logout" onClick={handleLogout} title="خروج">
            <LogOut size={15} /> <span className="dzc-nav-label">خروج</span>
          </button>
        </div>
      </header>

      <div className="dzc-layout">

        {/* ===== SIDEBAR — ONLINE USERS ===== */}
        <aside className={`dzc-sidebar ${sidebarOpen ? 'dzc-sidebar--open' : ''}`}>
          <div className="dzc-sidebar-header">
            <span><Users size={14} /> المستخدمون الآن</span>
            <button className="dzc-sidebar-close" onClick={() => setSidebarOpen(false)}><X size={14} /></button>
          </div>
          <div className="dzc-sidebar-count">{onlineCount || onlineUsers.length} متصل</div>
          <div className="dzc-users-list">
            {onlineUsers.map(u => (
              <div
                key={u.id}
                className={`dzc-user-item ${u.id === sessionIdRef.current ? 'dzc-user-item--me' : ''}`}
                onClick={(e) => {
                  if (u.id === sessionIdRef.current) return
                  e.stopPropagation()
                  setUserMenu({ user: u, x: e.clientX, y: e.clientY })
                }}
              >
                {genderIcon(u.gender)}
                <span className="dzc-user-name">{u.name}</span>
                {u.id === sessionIdRef.current && <span className="dzc-user-me">(أنت)</span>}
                {u.isAdmin && <Shield size={11} className="dzc-user-admin-icon" />}
                {localUser.isAdmin && u.id !== sessionIdRef.current && (
                  <ChevronRight size={12} className="dzc-user-arrow" />
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* ===== MAIN CHAT AREA ===== */}
        <main className="dzc-main" onClick={() => setSidebarOpen(false)}>

          {/* DM banner */}
          {dmTarget && (
            <div className="dzc-dm-banner">
              <MessageCircle size={13} />
              رسالة خاصة إلى: <strong>{dmTarget.name}</strong>
              <button className="dzc-dm-cancel" onClick={() => setDmTarget(null)}><X size={12} /></button>
            </div>
          )}

          {/* Messages */}
          <div className="dzc-messages">
            {visibleMessages.map(msg => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className={`dzc-msg-system ${msg.isHighlighted ? 'dzc-msg-system--highlighted' : ''}`}>
                    {msg.isHighlighted
                      ? <><span className="dzc-highlight-name">{ADMIN_NAME}</span><br />{msg.text}</>
                      : msg.text
                    }
                  </div>
                )
              }
              if (msg.isDeleted) {
                return (
                  <div key={msg.id} className="dzc-msg-deleted">
                    <span>تم حذف هذه الرسالة</span>
                  </div>
                )
              }
              const isMe = msg.fromId === sessionIdRef.current
              return (
                <div
                  key={msg.id}
                  className={`dzc-msg ${isMe ? 'dzc-msg--me' : ''} ${msg.isBot ? 'dzc-msg--bot' : ''} ${msg.isHighlighted ? 'dzc-msg--highlighted' : ''} ${msg.isDM ? 'dzc-msg--dm' : ''}`}
                  onContextMenu={(e) => {
                    if (!localUser.isAdmin) return
                    e.preventDefault()
                    e.stopPropagation()
                    setMsgMenu({ msg, x: e.clientX, y: e.clientY })
                  }}
                >
                  <div className="dzc-msg-header">
                    {genderIcon(msg.gender)}
                    <span className={`dzc-msg-from ${msg.isBot ? 'dzc-msg-from--bot' : ''} ${isMe ? 'dzc-msg-from--me' : ''}`}>
                      {msg.isHighlighted ? ADMIN_NAME : msg.from}
                    </span>
                    {msg.isDM && <span className="dzc-msg-dm-label">رسالة خاصة</span>}
                    {msg.isBot && <span className={`dzc-msg-bot-label dzc-msg-bot-label--${msg.botType || 'gpt'}`}>{msg.botType === 'agent' ? 'DZ Agent' : 'DZ GPT'}</span>}
                    {msg.triggeredBy && <span className="dzc-msg-triggered">↩ {msg.triggeredBy}</span>}
                    <span className="dzc-msg-time">{formatTime(msg.timestamp)}</span>
                    {localUser.isAdmin && !msg.isBot && !msg.isSystem && (
                      <button className="dzc-msg-admin-btn" onClick={(e) => { e.stopPropagation(); setMsgMenu({ msg, x: e.clientX, y: e.clientY }) }}>
                        <MoreVertical size={12} />
                      </button>
                    )}
                  </div>
                  <div className="dzc-msg-text">{msg.text}</div>
                </div>
              )
            })}

            {aiTyping && (
              <div className="dzc-msg dzc-msg--bot dzc-msg-typing">
                <div className="dzc-msg-header">
                  <Bot size={13} className="dzc-gender dzc-gender--bot" />
                  <span className="dzc-msg-from dzc-msg-from--bot">DZ AI</span>
                </div>
                <div className="dzc-typing-dots"><span /><span /><span /></div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ===== INPUT AREA ===== */}
          <div className="dzc-input-bar">
            <input
              ref={inputRef}
              className="dzc-input"
              placeholder={dmTarget ? `رسالة خاصة لـ ${dmTarget.name}...` : 'اكتب رسالتك... أو @dzgpt / @dzagent لاستدعاء الذكاء الاصطناعي'}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
              disabled={sending}
              maxLength={1000}
            />
            <button
              className="dzc-send-btn"
              onClick={sendMessage}
              disabled={sending || !inputText.trim()}
            >
              {sending ? <Loader2 size={16} className="dzc-spin" /> : <Send size={16} />}
            </button>
          </div>
        </main>
      </div>

      {/* ===== SIDEBAR OVERLAY on mobile ===== */}
      {sidebarOpen && <div className="dzc-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ===== USER CONTEXT MENU ===== */}
      {userMenu && (
        <div
          className="dzc-context-menu"
          style={{ top: Math.min(userMenu.y, window.innerHeight - 140), left: Math.max(8, Math.min(userMenu.x, window.innerWidth - 200)) }}
          onClick={e => e.stopPropagation()}
        >
          <button className="dzc-context-item" onClick={() => { setDmTarget(userMenu.user); setSidebarOpen(false); setUserMenu(null); inputRef.current?.focus() }}>
            <MessageCircle size={13} /> رسالة خاصة
          </button>
          {localUser.isAdmin && (
            <button className="dzc-context-item dzc-context-item--danger" onClick={() => adminAction('block', userMenu.user.id)}>
              <Shield size={13} /> حظر المستخدم
            </button>
          )}
        </div>
      )}

      {/* ===== MESSAGE ADMIN CONTEXT MENU ===== */}
      {msgMenu && localUser.isAdmin && (
        <div
          className="dzc-context-menu"
          style={{ top: Math.min(msgMenu.y, window.innerHeight - 150), left: Math.max(8, Math.min(msgMenu.x, window.innerWidth - 210)) }}
          onClick={e => e.stopPropagation()}
        >
          <button className="dzc-context-item" onClick={() => adminAction('highlight', undefined, msgMenu.msg.id)}>
            <Highlighter size={13} /> تمييز الرسالة (إعلان)
          </button>
          <button className="dzc-context-item dzc-context-item--danger" onClick={() => adminAction('delete', undefined, msgMenu.msg.id)}>
            <Trash2 size={13} /> حذف الرسالة
          </button>
          {msgMenu.msg.fromId !== 'bot' && msgMenu.msg.fromId !== 'system' && (
            <button className="dzc-context-item dzc-context-item--danger" onClick={() => adminAction('block', msgMenu.msg.fromId)}>
              <Shield size={13} /> حظر المرسل
            </button>
          )}
        </div>
      )}
    </div>
  )
}
