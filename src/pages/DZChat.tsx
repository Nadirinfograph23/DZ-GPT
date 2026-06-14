import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Home, LogOut, Users, Bell, Trash2, Send, X, MessageCircle,
  Bot, Shield, ChevronRight, Loader2, AlertCircle,
  MoreVertical, Highlighter, Copy, Check, BadgeCheck, Pin, PinOff,
  VolumeX, Clock, Megaphone, CornerUpLeft, User, MapPin, ExternalLink,
  Search, Hash, CheckCheck, Globe, Lock, Eye, EyeOff,
} from 'lucide-react'
import '../styles/dzchat.css'
import { DeveloperCard } from '../components/DeveloperCard'

// RTL-aware table scroll wrapper: JS scrolls to rightmost position on mount
// so the first Arabic column (rightmost in RTL) is immediately visible.
// Shows a "← اسحب" hint for 1.6s on overflowing tables, hides on first scroll.
function DZCTableScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [showHint, setShowHint] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    requestAnimationFrame(() => {
      if (el.scrollWidth > el.clientWidth) {
        el.scrollLeft = el.scrollWidth - el.clientWidth
        setShowHint(true)
        setTimeout(() => setShowHint(false), 1600)
      }
    })
    const onScroll = () => setShowHint(false)
    el.addEventListener('scroll', onScroll, { passive: true })
    let startX = 0, startY = 0, isH: boolean | null = null
    const onStart = (e: TouchEvent) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; isH = null }
    const onMove = (e: TouchEvent) => {
      const dx = Math.abs(e.touches[0].clientX - startX)
      const dy = Math.abs(e.touches[0].clientY - startY)
      if (isH === null && (dx > 4 || dy > 4)) isH = dx > dy
      if (!isH) return
      e.stopPropagation()
      const atLeft  = el.scrollLeft <= 0
      const atRight = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1
      if ((atLeft && e.touches[0].clientX > startX) || (atRight && e.touches[0].clientX < startX)) return
      e.preventDefault()
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove',  onMove,  { passive: false })
    return () => {
      el.removeEventListener('scroll',     onScroll)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove',  onMove)
    }
  }, [])
  return (
    <div className="dzc-table-scroll" ref={ref}>
      {children}
      {showHint && (
        <div className="dz-table-swipe-hint" aria-hidden="true">← اسحب</div>
      )}
    </div>
  )
}

interface ChatUser {
  id: string
  name: string
  gender: 'male' | 'female'
  isAdmin?: boolean
  profileId?: string | null
  avatar?: string | null
  status?: 'online' | 'busy' | 'away'
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
  showDevCard?: boolean
  redirectUrl?: string
  redirectLabel?: string
  isSystem?: boolean
  isHighlighted?: boolean
  isAdmin?: boolean
  isDM?: boolean
  dmTo?: string | null
  dmToName?: string | null
  isDeleted?: boolean
  triggeredBy?: string
  localDeleted?: boolean
  isMarkdown?: boolean
  isLiveScore?: boolean
  isBreaking?: boolean
  isBroadcast?: boolean
  reactions?: Record<string, string[]>
  replyTo?: { id: string; from: string; text: string }
  fromProfileId?: string | null
  fromAvatar?: string | null
  room?: string
  readBy?: string[]
}

interface LocalUser {
  name: string
  gender: 'male' | 'female'
  sessionId: string
  isAdmin: boolean
  profileId?: string | null
  avatar?: string | null
}

function playDMSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55)

    const freqs = [880, 1108, 1318]
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.07)
      osc.connect(gain)
      osc.start(ctx.currentTime + i * 0.07)
      osc.stop(ctx.currentTime + 0.55)
    })
    setTimeout(() => ctx.close(), 700)
  } catch { }
}

interface ProfileData {
  profileId?: string
  userId: string
  name: string
  gender: 'male' | 'female'
  city?: string
  facebook?: string
  instagram?: string
  tiktok?: string
  avatar?: string | null
  loading?: boolean
}

interface PinnedMessage {
  id: string
  text: string
  from: string
  timestamp: number
}

const MALE_ICON = '♂'
const FEMALE_ICON = '♀'
const ADMIN_NAME = 'Nadir Infograph | نذير حوامرية'
const AT_SUGGESTIONS = ['@dzagent']

function genderIcon(gender: string) {
  if (gender === 'female') return <span className="dzc-gender dzc-gender--female">{FEMALE_ICON}</span>
  if (gender === 'bot') return <Bot size={13} className="dzc-gender dzc-gender--bot" />
  return <span className="dzc-gender dzc-gender--male">{MALE_ICON}</span>
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
}

const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]{8,}/gi

function linkifyText(text: string) {
  const parts = text.split(/(https?:\/\/[^\s<>"{}|\\^`[\]]{8,})/gi)
  return parts.map((part, i) =>
    /^https?:\/\//i.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="dzc-inline-link" onClick={e => e.stopPropagation()}>{part}</a>
      : part
  )
}

function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<{ title: string; description: string; image: string } | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [url])
  if (loading) return <div className="dzc-link-preview dzc-link-preview--loading"><Globe size={12} /> جاري التحميل...</div>
  if (!data || (!data.title && !data.description)) return null
  const domain = (() => { try { return new URL(url).hostname } catch { return url.slice(0, 30) } })()
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="dzc-link-preview" onClick={e => e.stopPropagation()}>
      {data.image && <img src={data.image} className="dzc-link-preview-img" alt="" onError={e => (e.currentTarget.style.display = 'none')} />}
      <div className="dzc-link-preview-body">
        {data.title && <span className="dzc-link-preview-title">{data.title.slice(0, 80)}</span>}
        {data.description && <span className="dzc-link-preview-desc">{data.description.slice(0, 120)}</span>}
        <span className="dzc-link-preview-domain"><Globe size={10} /> {domain}</span>
      </div>
    </a>
  )
}

export default function DZChat() {
  const navigate = useNavigate()

  const [localUser, setLocalUser] = useState<LocalUser | null>(null)
  const [entryName, setEntryName] = useState('')
  const [entryGender, setEntryGender] = useState<'male' | 'female' | ''>('')
  const [entryError, setEntryError] = useState('')
  const [entryLoading, setEntryLoading] = useState(false)
  const [entryPassword, setEntryPassword] = useState('')
  const [entryShowPw, setEntryShowPw] = useState(false)
  const [entrySaveProfile, setEntrySaveProfile] = useState(false)
  const [entryIsAdmin, setEntryIsAdmin] = useState(false)

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

  // @ mention suggestion state
  const [atDropdown, setAtDropdown] = useState(false)
  const [atSuggestions, setAtSuggestions] = useState<string[]>([])

  const [pinnedMessage, setPinnedMessage] = useState<PinnedMessage | null>(null)
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false)

  const [isMuted, setIsMuted] = useState(false)
  const [muteUntil, setMuteUntil] = useState(0)
  const [muteRemainSec, setMuteRemainSec] = useState(0)

  // Reply state
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null)

  // Profile popup state
  const [viewProfile, setViewProfile] = useState<ProfileData | null>(null)
  const [profileEditMode, setProfileEditMode] = useState(false)
  const [editCity, setEditCity] = useState('')
  const [editFacebook, setEditFacebook] = useState('')
  const [editInstagram, setEditInstagram] = useState('')
  const [editTiktok, setEditTiktok] = useState('')
  const [editAvatar, setEditAvatar] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Typing indicator state: userId → name
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map())
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const lastTypingSentRef = useRef<number>(0)

  // Broadcast modal state
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [broadcastText, setBroadcastText] = useState('')
  const [broadcastSending, setBroadcastSending] = useState(false)

  // Copy feedback state per message
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  // Rooms
  const [currentRoom, setCurrentRoom] = useState('عام')
  const currentRoomRef = useRef('عام')
  // My status
  const [myStatus, setMyStatus] = useState<'online' | 'busy' | 'away'>('online')

  const wsRef = useRef<WebSocket | null>(null)
  const wsConnectedRef = useRef(false)
  const pollingRef = useRef<number | null>(null)
  const lastMsgTsRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sessionIdRef = useRef<string | null>(null)

  // Load saved profile + avatar on mount (single effect, per-user key)
  const savedAvatarRef = useRef<string | null>(null)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dzchat-saved-profile')
      if (saved) {
        const { name, gender } = JSON.parse(saved)
        if (name) {
          setEntryName(name)
          setEntrySaveProfile(true)
          // load avatar for this specific user
          const avatarKey = 'dzchat-av-' + name.trim().toLowerCase()
          const av = localStorage.getItem(avatarKey)
          if (av && av.startsWith('data:image')) savedAvatarRef.current = av
          // load saved password (lightly obfuscated)
          try {
            const rawPw = localStorage.getItem('dzchat-pw-' + name.trim().toLowerCase())
            if (rawPw) setEntryPassword(atob(rawPw))
          } catch {}
        }
        if (gender === 'male' || gender === 'female') setEntryGender(gender)
      }
    } catch {}
  }, [])

  useEffect(() => {
    const onFocus = () => setWindowFocused(true)
    const onBlur = () => setWindowFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur) }
  }, [])

  useEffect(() => {
    if (!isMuted || muteUntil === 0) { setMuteRemainSec(0); return }
    const tick = () => {
      const rem = Math.ceil(Math.max(0, muteUntil - Date.now()) / 1000)
      setMuteRemainSec(rem)
      if (rem <= 0) { setIsMuted(false); setMuteUntil(0) }
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [isMuted, muteUntil])

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
        if (msg.fromId !== sessionIdRef.current && lower.startsWith('@dzagent')) {
          setAiTyping(true)
        }
        if (
          msg.isDM &&
          msg.fromId !== sessionIdRef.current &&
          (msg.dmTo === sessionIdRef.current || !msg.dmTo)
        ) {
          playDMSound()
        }
      }
    } else if (data.type === 'profileUpdate') {
      const { userId, avatar } = data as { userId: string; avatar?: string | null }
      if (userId) {
        setOnlineUsers(prev => prev.map(u => u.id === userId ? { ...u, avatar: avatar || null } : u))
        // Also update fromAvatar in all existing messages from this user
        setMessages(prev => prev.map(m =>
          m.fromId === userId ? { ...m, fromAvatar: avatar || null } : m
        ))
      }
    } else if (data.type === 'update') {
      const msg = data.msg as ChatMessage
      if (msg) setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m))
    } else if (data.type === 'delete') {
      const msgId = data.msgId as string
      if (msgId) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isDeleted: true } : m))
    } else if (data.type === 'pinUpdate') {
      setPinnedMessage((data.pinnedMessage as PinnedMessage | null) || null)
      setPinnedCollapsed(false)
    } else if (data.type === 'users' || data.type === 'pong') {
      if (Array.isArray(data.users)) setOnlineUsers(data.users as ChatUser[])
      if (typeof data.count === 'number') setOnlineCount(data.count)
    } else if (data.type === 'muted') {
      const until = data.until as number
      if (until && Date.now() < until) {
        setMuteUntil(until)
        setIsMuted(true)
      }
    } else if (data.type === 'muteUpdate') {
      const userId = data.userId as string
      const until = data.until as number
      if (userId === sessionIdRef.current) {
        if (until && until > Date.now()) {
          setMuteUntil(until)
          setIsMuted(true)
        } else {
          setIsMuted(false)
          setMuteUntil(0)
        }
      }
    } else if (data.type === 'typing') {
      const { userId, name } = data as { userId: string; name: string }
      if (userId && name && userId !== sessionIdRef.current) {
        setTypingUsers(prev => { const m = new Map(prev); m.set(userId, name); return m })
        const existing = typingTimersRef.current.get(userId)
        if (existing) clearTimeout(existing)
        const timer = setTimeout(() => {
          setTypingUsers(prev => { const m = new Map(prev); m.delete(userId); return m })
          typingTimersRef.current.delete(userId)
        }, 3000)
        typingTimersRef.current.set(userId, timer)
      }
    } else if (data.type === 'reaction') {
      const { msgId, reactions } = data as { msgId: string; reactions: Record<string, string[]> }
      if (msgId) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions } : m))
    } else if (data.type === 'blocked') {
      if (data.userId === sessionIdRef.current) {
        alert('تم حظرك من غرفة الدردشة.')
        handleLogout()
      }
    } else if (data.type === 'readReceipt') {
      const { msgId, readBy } = data as { msgId: string; readBy: string[] }
      if (msgId) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, readBy } : m))
    } else if (data.type === 'liveScoreUpdate') {
      const { msgId, text } = data as { msgId: string; text: string }
      if (msgId && text) {
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, text, timestamp: Date.now() } : m
        ))
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
      const savedSecret = user.isAdmin ? (sessionStorage.getItem('dzc_admin_secret') || '') : ''
      ws.send(JSON.stringify({
        type: 'join',
        name: user.name,
        gender: user.gender,
        sessionId: user.sessionId,
        adminSecret: savedSecret,
        status: 'online',
        room: currentRoomRef.current,
        profile: user.avatar ? { avatar: user.avatar } : undefined,
      }))
    }

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'welcome') {
          // Sync session id — server may reuse HTTP session id or issue a new WS one
          if (data.sessionId) sessionIdRef.current = data.sessionId as string
          // Re-confirm admin status from server
          if (data.isAdmin) setLocalUser(prev => prev ? { ...prev, isAdmin: true } : prev)
          const histIds = new Set(historyMessages.map(m => m.id))
          const fresh = (data.messages || []).filter((m: ChatMessage) => !histIds.has(m.id))
          addMessages([...historyMessages, ...fresh])
          if (Array.isArray(data.users)) setOnlineUsers(data.users)
          if (data.pinnedMessage) setPinnedMessage(data.pinnedMessage as PinnedMessage)
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
      setTimeout(() => {
        if (!wsConnectedRef.current && sessionIdRef.current && localUser) {
          connectWebSocket(localUser, [])
        }
      }, 4000)
    }

    wsRef.current = ws

    const heartbeat = setInterval(() => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }))
    }, 20000)

    return () => {
      clearInterval(heartbeat)
      ws.close()
    }
  }, [addMessages, handleServerEvent, startPolling, stopPolling])

  const ADMIN_SECRET = 'openit1979##'

  const handleEnterChat = async () => {
    if (!entryName.trim()) { setEntryError('يرجى إدخال اسمك.'); return }
    if (!entryGender) { setEntryError('يرجى اختيار الجنس.'); return }
    setEntryError('')
    setEntryLoading(true)
    try {
      const trimmedName = entryName.trim()
      const pw = entryPassword.trim()
      if (pw.length < 4) {
        setEntryError('كلمة المرور يجب أن تكون 4 أحرف على الأقل.')
        setEntryLoading(false)
        return
      }

      // Validate admin password client-side
      if (entryIsAdmin && pw !== ADMIN_SECRET) {
        setEntryError('كلمة مرور المشرف غير صحيحة.')
        setEntryLoading(false)
        return
      }

      const body: Record<string, string> = { name: trimmedName, gender: entryGender }

      // Only send adminSecret when admin checkbox is checked — server grants admin ONLY via adminSecret
      body.profilePassword = pw
      if (entryIsAdmin) {
        body.adminSecret = pw
        sessionStorage.setItem('dzc_admin_secret', pw)
      } else {
        body.adminSecret = ''
        sessionStorage.removeItem('dzc_admin_secret')
      }

      // Always save avatar to localStorage (persists even after logout)
      const pwKey = 'dzchat-pw-' + trimmedName.toLowerCase()
      if (entrySaveProfile) {
        localStorage.setItem('dzchat-saved-profile', JSON.stringify({ name: trimmedName, gender: entryGender }))
        try { localStorage.setItem(pwKey, btoa(pw)) } catch {}
      } else {
        localStorage.removeItem('dzchat-saved-profile')
        localStorage.removeItem(pwKey)
        // Note: avatar is intentionally kept (never removed on logout)
      }

      // Attach saved avatar for all users
      if (savedAvatarRef.current) {
        body.avatar = savedAvatarRef.current
      }

      const r = await fetch('/api/chat-room/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      // Safe JSON parse — server may return HTML on 4xx/5xx
      let d: Record<string, unknown> = {}
      try { d = await r.json() } catch { /* non-JSON response, d stays {} */ }

      if (!r.ok) {
        setEntryError((d.error as string) || `فشل الدخول — رمز الخطأ: ${r.status}`)
        return
      }

      if (!d.sessionId) {
        setEntryError('فشل الدخول: لم يُستلم معرّف الجلسة.')
        return
      }

      const sessionId = d.sessionId as string
      const isAdmin = !!(d.isAdmin)
      const history: ChatMessage[] = (d.messages as ChatMessage[]) || []
      history.forEach(m => { if (m.timestamp > lastMsgTsRef.current) lastMsgTsRef.current = m.timestamp })

      const welcomeMsg: ChatMessage = {
        id: 'welcome-' + Date.now(),
        from: 'System',
        fromId: 'system',
        gender: 'bot',
        text: 'مرحباً بك في DZ Chat! هذه دردشة عامة لمستخدمي DZ GPT. يمكنك استدعاء الذكاء الاصطناعي باستخدام @dzagent متبوعاً بسؤالك.',
        timestamp: Date.now(),
        isSystem: true,
      }

      const user: LocalUser = {
        name: entryName.trim(),
        gender: entryGender,
        sessionId,
        isAdmin,
        profileId: (d.profileId as string) || null,
        avatar: (d.avatar as string) || savedAvatarRef.current || null,
      }

      // Set session ref and transition to chat UI first (avoids React hook order errors)
      sessionIdRef.current = sessionId
      setLocalUser(user)
      setOnlineUsers((d.users as ChatUser[]) || [])
      addMessages([...history, welcomeMsg])

      // Start connections after state is committed
      connectWebSocket(user, [...history, welcomeMsg])
      startPolling()
    } catch (err) {
      console.error('[DZChat] Login error:', err)
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
    // Avatar stays in localStorage — do NOT remove it so it persists after re-login
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

  // Handle @ mention input logic
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputText(val)

    // Send typing event via WS (debounced: max once per 2s)
    if (val.trim() && wsRef.current?.readyState === 1) {
      const now = Date.now()
      if (now - lastTypingSentRef.current > 2000) {
        lastTypingSentRef.current = now
        wsRef.current.send(JSON.stringify({ type: 'typing' }))
      }
    }

    // Detect @ mention
    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)
    const atMatch = textBefore.match(/@(\w*)$/)
    if (atMatch) {
      const query = atMatch[1].toLowerCase()
      const filtered = AT_SUGGESTIONS.filter(s => s.slice(1).startsWith(query))
      setAtSuggestions(filtered)
      setAtDropdown(filtered.length > 0)
    } else {
      setAtDropdown(false)
      setAtSuggestions([])
    }
  }

  const handleAtSelect = (suggestion: string) => {
    const input = inputRef.current
    if (!input) return
    const cursor = input.selectionStart ?? inputText.length
    const before = inputText.slice(0, cursor)
    const after = inputText.slice(cursor)
    const replaced = before.replace(/@\w*$/, suggestion + ' ')
    setInputText(replaced + after)
    setAtDropdown(false)
    setTimeout(() => {
      input.focus()
      const pos = replaced.length
      input.setSelectionRange(pos, pos)
    }, 0)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (atDropdown) {
      if (e.key === 'Escape') { e.preventDefault(); setAtDropdown(false); return }
      if (e.key === 'Enter' && atSuggestions.length > 0) {
        e.preventDefault()
        handleAtSelect(atSuggestions[0])
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const scrollToMsg = (msgId: string) => {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('dzc-msg--highlight-flash')
      setTimeout(() => el.classList.remove('dzc-msg--highlight-flash'), 1200)
    }
  }

  const sendMessage = useCallback(async () => {
    const text = inputText.trim()
    if (!text || !sessionIdRef.current || sending) return
    setSending(true)
    setInputText('')
    setAtDropdown(false)
    const replySnap = replyTarget ? { id: replyTarget.id, from: replyTarget.isHighlighted ? 'المشرف' : replyTarget.from, text: replyTarget.text } : null
    setReplyTarget(null)
    try {
      const isDmSend = !!dmTarget
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({
          type: 'message',
          text,
          dmTo: dmTarget?.id || null,
          dmToName: dmTarget?.name || null,
          replyTo: replySnap || undefined,
          room: dmTarget ? undefined : currentRoomRef.current,
        }))
        if (isDmSend) setDmTarget(null)
      } else {
        const lower = text.toLowerCase()
        const isAiCall = lower.startsWith('@dzagent')
        if (isAiCall) setAiTyping(true)
        const r = await fetch('/api/chat-room/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current, text, dmTo: dmTarget?.id, dmToName: dmTarget?.name, replyTo: replySnap }),
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
            isDM: isDmSend,
            dmTo: dmTarget?.id,
            dmToName: dmTarget?.name,
            replyTo: replySnap ?? undefined,
          }
          const toAdd: ChatMessage[] = [myMsg]
          if (d.botMsg) {
            toAdd.push(d.botMsg as ChatMessage)
            setAiTyping(false)
          }
          addMessages(toAdd)
          if (isDmSend) setDmTarget(null)
        } else if (isAiCall) {
          setAiTyping(false)
        }
      }
      const lower2 = text.toLowerCase()
      if (lower2.startsWith('@dzagent') && wsRef.current?.readyState === 1) setAiTyping(true)
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

  const adminMute = async (targetId: string, durationMs: number) => {
    if (!sessionIdRef.current) return
    try {
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'admin', action: 'mute', targetId, durationMs }))
      } else {
        await fetch('/api/chat-room/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current, action: 'mute', targetId, durationMs }),
        })
      }
    } catch {}
    setMsgMenu(null)
    setUserMenu(null)
  }

  const adminUnmute = async (targetId: string) => {
    if (!sessionIdRef.current) return
    try {
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'admin', action: 'unmute', targetId }))
      } else {
        await fetch('/api/chat-room/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current, action: 'unmute', targetId }),
        })
      }
    } catch {}
    setMsgMenu(null)
    setUserMenu(null)
  }

  const REACT_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🔥']

  const handleReact = async (msgId: string, emoji: string) => {
    if (!sessionIdRef.current) return
    try {
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'react', msgId, emoji }))
      } else {
        await fetch('/api/chat-room/react', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current, msgId, emoji }),
        })
      }
    } catch {}
  }

  const adminBroadcast = async () => {
    const text = broadcastText.trim()
    if (!text || !sessionIdRef.current) return
    setBroadcastSending(true)
    try {
      if (wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: 'admin', action: 'broadcast', text }))
      } else {
        await fetch('/api/chat-room/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current, action: 'broadcast', text }),
        })
      }
      setBroadcastText('')
      setShowBroadcast(false)
    } catch {}
    setBroadcastSending(false)
  }

  function formatMuteRemain(sec: number): string {
    if (sec >= 3600) return `${Math.floor(sec / 3600)}س ${Math.floor((sec % 3600) / 60)}د`
    if (sec >= 60) return `${Math.floor(sec / 60)}د ${sec % 60}ث`
    return `${sec}ث`
  }

  // Copy bot message to clipboard
  const handleCopyMsg = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.text)
      setCopiedId(msg.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {}
  }

  // Delete bot message locally
  const handleDeleteBotMsg = (msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, localDeleted: true } : m))
  }

  // Open profile popup
  const openProfile = async (opts: { profileId?: string | null; userId: string; name: string; gender: 'male' | 'female'; avatar?: string | null }) => {
    setProfileEditMode(false)
    setViewProfile({ profileId: opts.profileId || undefined, userId: opts.userId, name: opts.name, gender: opts.gender, avatar: opts.avatar || null, loading: false })
  }

  // Handle avatar file selection
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 200000) { alert('الصورة كبيرة جداً. الحد الأقصى 200KB'); return }
    const reader = new FileReader()
    reader.onload = ev => setEditAvatar(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  // Save profile fields
  const saveProfileFields = async () => {
    if (!sessionIdRef.current) return
    setEditSaving(true)
    try {
      const r = await fetch('/api/chat-room/profile/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, city: editCity, facebook: editFacebook, instagram: editInstagram, tiktok: editTiktok, avatar: editAvatar }),
      })
      if (r.ok) {
        const d = await r.json()
        const newAvatar = d.avatar || editAvatar || null
        setViewProfile(prev => prev ? { ...prev, ...d.profile, avatar: newAvatar, loading: false } : null)
        setLocalUser(prev => prev ? { ...prev, avatar: newAvatar } : null)
        // Persist avatar in per-user localStorage key (survives logout)
        try {
          const uName = localUser?.name || ''
          const avKey = 'dzchat-av-' + uName.toLowerCase()
          if (newAvatar) {
            localStorage.setItem(avKey, newAvatar)
            savedAvatarRef.current = newAvatar
          } else {
            localStorage.removeItem(avKey)
            savedAvatarRef.current = null
          }
        } catch {}
        // Update fromAvatar in all own messages immediately
        const myId = sessionIdRef.current
        setMessages(prev => prev.map(m =>
          m.fromId === myId ? { ...m, fromAvatar: newAvatar } : m
        ))
        setProfileEditMode(false)
      }
    } catch {}
    setEditSaving(false)
  }

  // Open DM from a message sender click
  const handleMsgSenderClick = (e: React.MouseEvent, msg: ChatMessage) => {
    if (msg.isBot || msg.isSystem || msg.fromId === sessionIdRef.current) return
    e.stopPropagation()
    openProfile({ profileId: msg.fromProfileId, userId: msg.fromId, name: msg.from, gender: msg.gender as 'male' | 'female', avatar: msg.fromAvatar })
  }

  useEffect(() => {
    if (messages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Close dropdown when clicking outside
  const handleRootClick = () => {
    setMsgMenu(null)
    setUserMenu(null)
    setAtDropdown(false)
  }

  useEffect(() => { currentRoomRef.current = currentRoom }, [currentRoom])

  // Auto-mark DMs as read when window is focused
  useEffect(() => {
    if (!windowFocused || !sessionIdRef.current) return
    const sid = sessionIdRef.current
    messages.forEach(m => {
      if (m.isDM && m.fromId !== sid && m.dmTo === sid && !(m.readBy || []).includes(sid)) {
        if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: 'msgRead', msgId: m.id }))
      }
    })
  }, [messages, windowFocused])

  const visibleMessages = messages.filter(m => {
    if (m.localDeleted) return false
    if (m.isDM) return m.fromId === sessionIdRef.current || m.dmTo === sessionIdRef.current
    if (m.isSystem || m.isBroadcast) return true
    if (m.room && m.room !== currentRoom) return false
    if (!m.room && currentRoom !== 'عام') return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (m.text || '').toLowerCase().includes(q) || (m.from || '').toLowerCase().includes(q)
    }
    return true
  })

  if (!localUser) {
    return (
      <div className="dzc-root" onClick={handleRootClick}>
        <div className="dzc-entry-overlay">
          <div className="dzc-entry-modal">
            <button className="dzc-entry-close" onClick={() => navigate('/')} title="العودة للرئيسية">
              <Home size={14} />
              <span>الرئيسية</span>
            </button>
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

            {/* Password — for all users */}
            <div className="dzc-entry-field dzc-entry-pw-field">
              <div className="dzc-entry-pw-label">
                <Lock size={13} /> كلمة المرور
              </div>
              <div className="dzc-entry-pw-wrap">
                <input
                  className="dzc-entry-input dzc-entry-input--pw"
                  placeholder="أدخل كلمة مرورك..."
                  type={entryShowPw ? 'text' : 'password'}
                  value={entryPassword}
                  onChange={e => setEntryPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEnterChat()}
                  maxLength={60}
                />
                <button
                  type="button"
                  className="dzc-entry-pw-eye"
                  onClick={() => setEntryShowPw(p => !p)}
                  title={entryShowPw ? 'إخفاء' : 'إظهار'}
                >
                  {entryShowPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <label className="dzc-entry-save-toggle">
                <input type="checkbox" checked={entrySaveProfile} onChange={e => setEntrySaveProfile(e.target.checked)} />
                <span>تذكرني في هذا الجهاز</span>
              </label>
            </div>

            {/* Admin selector */}
            <label className="dzc-entry-admin-toggle">
              <input
                type="checkbox"
                checked={entryIsAdmin}
                onChange={e => setEntryIsAdmin(e.target.checked)}
              />
              <Shield size={13} className="dzc-entry-admin-icon" />
              <span>تسجيل دخول كمشرف</span>
            </label>

            {entryError && <div className="dzc-entry-error"><AlertCircle size={13} /> {entryError}</div>}

            <button className="dzc-entry-btn" onClick={handleEnterChat} disabled={entryLoading}>
              {entryLoading ? <Loader2 size={16} className="dzc-spin" /> : <><MessageCircle size={16} /> دخول الدردشة</>}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dzc-root" dir="rtl" onClick={handleRootClick}>

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
          {localUser?.isAdmin && (
            <button className="dzc-nav-btn dzc-nav-btn--broadcast" onClick={() => setShowBroadcast(true)} title="إذاعة رسالة للجميع">
              <Megaphone size={15} />
            </button>
          )}
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
          {localUser?.profileId && (
            <button className="dzc-nav-btn dzc-nav-btn--profile" title="بروفايلي"
              onClick={() => openProfile({ profileId: localUser.profileId, userId: localUser.sessionId, name: localUser.name, gender: localUser.gender })}>
              <User size={15} />
            </button>
          )}
          <button className="dzc-nav-btn" onClick={() => setShowSearch(p => !p)} title="بحث في الرسائل">
            <Search size={15} />
          </button>
          <button className="dzc-nav-btn dzc-nav-btn--logout" onClick={handleLogout} title="خروج">
            <LogOut size={15} /> <span className="dzc-nav-label">خروج</span>
          </button>
        </div>
      </header>

      {/* ===== SEARCH BAR ===== */}
      {showSearch && (
        <div className="dzc-search-bar">
          <Search size={14} className="dzc-search-icon" />
          <input
            className="dzc-search-input"
            type="text"
            placeholder={`ابحث في #${currentRoom}...`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            dir="rtl"
            autoFocus
          />
          {searchQuery && (
            <button className="dzc-search-clear" onClick={() => setSearchQuery('')} title="مسح"><X size={13} /></button>
          )}
          <button className="dzc-search-close" onClick={() => { setShowSearch(false); setSearchQuery('') }} title="إغلاق البحث"><X size={14} /></button>
        </div>
      )}

      <div className="dzc-layout">

        {/* ===== SIDEBAR — ONLINE USERS ===== */}
        <aside className={`dzc-sidebar ${sidebarOpen ? 'dzc-sidebar--open' : ''}`}>
          <div className="dzc-sidebar-header">
            <span><Users size={14} /> المستخدمون الآن</span>
            <button className="dzc-sidebar-close" onClick={() => setSidebarOpen(false)}><X size={14} /></button>
          </div>
          <div className="dzc-sidebar-count">{onlineCount || onlineUsers.length} متصل</div>

          {/* Status picker for self */}
          <div className="dzc-my-status-row">
            {(['online', 'busy', 'away'] as const).map(s => (
              <button
                key={s}
                className={`dzc-status-btn ${myStatus === s ? 'dzc-status-btn--active' : ''}`}
                onClick={() => {
                  setMyStatus(s)
                  if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: 'setStatus', status: s }))
                }}
              >
                <span className={`dzc-status-dot dzc-status-dot--${s}`} />
                {s === 'online' ? 'متصل' : s === 'busy' ? 'مشغول' : 'غائب'}
              </button>
            ))}
          </div>

          <div className="dzc-users-list">
            {onlineUsers.map(u => (
              <div
                key={u.id}
                className={`dzc-user-item ${u.id === sessionIdRef.current ? 'dzc-user-item--me' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  openProfile({ profileId: u.profileId, userId: u.id, name: u.name, gender: u.gender, avatar: u.avatar })
                }}
              >
                {u.avatar
                  ? <img src={u.avatar} className="dzc-user-avatar-img" alt="" />
                  : genderIcon(u.gender)
                }
                <span className={`dzc-user-name${u.isAdmin ? ' dzc-user-name--admin' : ''}`}>{u.name}</span>
                {u.isAdmin && <BadgeCheck size={13} className="dzc-user-verified-badge" aria-label="مشرف موثق" />}
                {u.id === sessionIdRef.current && <span className="dzc-user-me">(أنت)</span>}
                <span className={`dzc-status-dot dzc-status-dot--${u.id === sessionIdRef.current ? myStatus : (u.status || 'online')}`} title={u.status === 'busy' ? 'مشغول' : u.status === 'away' ? 'غائب' : 'متصل'} />
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

          {/* Pinned message bar */}
          {pinnedMessage && !pinnedCollapsed && (
            <div className="dzc-pinned-bar" onClick={() => setPinnedCollapsed(true)}>
              <Pin size={12} className="dzc-pinned-icon" />
              <div className="dzc-pinned-content">
                <span className="dzc-pinned-from">{pinnedMessage.from}</span>
                <span className="dzc-pinned-text">{pinnedMessage.text}</span>
              </div>
              {localUser.isAdmin && (
                <button
                  className="dzc-pinned-unpin"
                  title="إلغاء التثبيت"
                  onClick={(e) => { e.stopPropagation(); adminAction('unpin') }}
                >
                  <PinOff size={11} />
                </button>
              )}
              <button className="dzc-pinned-collapse" title="طي" onClick={(e) => { e.stopPropagation(); setPinnedCollapsed(true) }}>
                <X size={11} />
              </button>
            </div>
          )}
          {pinnedMessage && pinnedCollapsed && (
            <button className="dzc-pinned-pill" onClick={() => setPinnedCollapsed(false)}>
              <Pin size={10} /> رسالة مثبتة
            </button>
          )}

          {/* ===== ROOM TABS ===== */}
          <div className="dzc-rooms">
            {(['عام', 'تقنية', 'ترفيه', 'دعم'] as const).map(room => (
              <button
                key={room}
                className={`dzc-room-tab ${currentRoom === room ? 'dzc-room-tab--active' : ''}`}
                onClick={() => {
                  setCurrentRoom(room)
                  if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: 'setRoom', room }))
                }}
              >
                <Hash size={11} /> {room}
              </button>
            ))}
            {searchQuery && (
              <span className="dzc-rooms-search-hint">
                <Search size={10} /> نتائج "{searchQuery}"
              </span>
            )}
          </div>

          {/* Messages */}
          <div className="dzc-messages">
            {visibleMessages.map(msg => {
              if (msg.isBroadcast) {
                return (
                  <div key={msg.id} className="dzc-broadcast-msg">
                    <div className="dzc-broadcast-msg-header">
                      <Megaphone size={15} className="dzc-broadcast-msg-icon" />
                      <span className="dzc-broadcast-msg-label">إذاعة من المشرف</span>
                      <span className="dzc-broadcast-msg-time">{formatTime(msg.timestamp)}</span>
                    </div>
                    <p className="dzc-broadcast-msg-text">{msg.text}</p>
                  </div>
                )
              }
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
                  data-msg-id={msg.id}
                  className={`dzc-msg ${isMe ? 'dzc-msg--me' : ''} ${msg.isBot ? 'dzc-msg--bot' : ''} ${msg.isHighlighted ? 'dzc-msg--highlighted' : ''} ${((msg.isAdmin || (isMe && localUser?.isAdmin)) && !msg.isHighlighted) ? 'dzc-msg--admin-msg' : ''} ${msg.isDM ? 'dzc-msg--dm' : ''} ${msg.isBreaking ? 'dzc-msg--breaking' : ''}`}
                  onContextMenu={(e) => {
                    if (!localUser.isAdmin) return
                    e.preventDefault()
                    e.stopPropagation()
                    setMsgMenu({ msg, x: e.clientX, y: e.clientY })
                  }}
                >
                  {/* Reply quote preview */}
                  {msg.replyTo && (
                    <button className="dzc-reply-quote" onClick={e => { e.stopPropagation(); scrollToMsg(msg.replyTo!.id) }}>
                      <CornerUpLeft size={11} className="dzc-reply-quote-icon" />
                      <span className="dzc-reply-quote-from">{msg.replyTo.from}</span>
                      <span className="dzc-reply-quote-text">{msg.replyTo.text.slice(0, 80)}{msg.replyTo.text.length > 80 ? '…' : ''}</span>
                    </button>
                  )}
                  <div className="dzc-msg-header">
                    {msg.fromAvatar
                      ? <img src={msg.fromAvatar} className="dzc-msg-avatar" alt="" onClick={(e) => handleMsgSenderClick(e, msg)} />
                      : genderIcon(msg.gender)
                    }
                    <span
                      className={`dzc-msg-from ${msg.isBot ? 'dzc-msg-from--bot' : ''} ${isMe ? 'dzc-msg-from--me' : ''} ${(msg.isAdmin || msg.isHighlighted || (isMe && localUser?.isAdmin)) ? 'dzc-msg-from--admin-sender' : ''} ${!msg.isBot && !isMe ? 'dzc-msg-from--clickable' : ''}`}
                      onClick={(e) => handleMsgSenderClick(e, msg)}
                      title={!msg.isBot && !isMe ? 'إرسال رسالة خاصة' : undefined}
                    >
                      {msg.isHighlighted ? ADMIN_NAME : msg.from}
                    </span>
                    {(msg.isAdmin || msg.isHighlighted || (isMe && localUser?.isAdmin)) && (
                      <span className="dzc-admin-badge-wrap" title="مشرف موثق">
                        <BadgeCheck size={16} className="dzc-admin-verified-badge" />
                        <span className="dzc-admin-label">مشرف</span>
                      </span>
                    )}
                    {msg.isDM && <span className="dzc-msg-dm-label">رسالة خاصة</span>}
                    {msg.isBot && <span className="dzc-msg-bot-label dzc-msg-bot-label--agent">DZ Agent</span>}
                    {msg.isLiveScore && <span className="dzc-live-badge">🔴 مباشر</span>}
                    {msg.triggeredBy && <span className="dzc-msg-triggered">↩ {msg.triggeredBy}</span>}
                    <span className="dzc-msg-time">{formatTime(msg.timestamp)}</span>
                    {/* Bot message actions: copy + delete */}
                    {msg.isBot && (
                      <div className="dzc-bot-actions">
                        <button
                          className="dzc-bot-action-btn"
                          title="نسخ الرسالة"
                          onClick={(e) => { e.stopPropagation(); handleCopyMsg(msg) }}
                        >
                          {copiedId === msg.id ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                        <button
                          className="dzc-bot-action-btn dzc-bot-action-btn--danger"
                          title="حذف الرسالة"
                          onClick={(e) => { e.stopPropagation(); handleDeleteBotMsg(msg.id) }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                    {/* Reply button — visible on hover, inside header */}
                    {!msg.isSystem && !msg.isDeleted && (
                      <button
                        className="dzc-reply-btn"
                        title="رد على هذه الرسالة"
                        onClick={e => { e.stopPropagation(); setReplyTarget(msg); inputRef.current?.focus() }}
                      >
                        <CornerUpLeft size={13} />
                      </button>
                    )}
                    {localUser.isAdmin && !msg.isBot && !msg.isSystem && (
                      <button className="dzc-msg-admin-btn" onClick={(e) => { e.stopPropagation(); setMsgMenu({ msg, x: e.clientX, y: e.clientY }) }}>
                        <MoreVertical size={12} />
                      </button>
                    )}
                  </div>
                  {(msg.isBot && (msg.isMarkdown || msg.botType === 'agent'))
                    ? (
                      <div className="dzc-msg-markdown">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            a: ({ href, children }) => (
                              <a href={href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{children}</a>
                            ),
                            table: ({ children }) => (
                              <DZCTableScroll>
                                <table>{children}</table>
                              </DZCTableScroll>
                            ),
                            thead: ({ children }) => <thead>{children}</thead>,
                            tbody: ({ children }) => <tbody>{children}</tbody>,
                            tr:    ({ children }) => <tr>{children}</tr>,
                            th:    ({ children }) => <th dir="auto">{children}</th>,
                            td:    ({ children }) => <td dir="auto">{children}</td>,
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    )
                    : <div className="dzc-msg-text">{linkifyText(msg.text)}</div>
                  }
                  {msg.isBot && msg.showDevCard && <DeveloperCard />}
                  {msg.isBot && msg.redirectUrl && (
                    <a
                      href={msg.redirectUrl}
                      className="dzc-redirect-btn"
                      onClick={e => { e.preventDefault(); window.location.href = msg.redirectUrl! }}
                    >
                      <ExternalLink size={13} />
                      {msg.redirectLabel || 'انتقل إلى DZ Agent'}
                    </a>
                  )}
                  {/* Read receipt for own DMs */}
                  {isMe && msg.isDM && (
                    <span className={`dzc-read-receipt${(msg.readBy || []).length > 0 ? ' dzc-read-receipt--read' : ''}`} title={(msg.readBy || []).length > 0 ? 'تم القراءة' : 'تم الإرسال'}>
                      <CheckCheck size={12} />
                    </span>
                  )}
                  {/* Link preview */}
                  {(() => {
                    const urls = msg.text.match(URL_RE)
                    return urls?.length ? <LinkPreview url={urls[0]} /> : null
                  })()}
                  {/* Emoji reaction picker — appears on hover */}
                  <div className="dzc-emoji-picker">
                    {REACT_EMOJIS.map(emoji => (
                      <button key={emoji} className="dzc-emoji-btn" onClick={e => { e.stopPropagation(); handleReact(msg.id, emoji) }}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                  {/* Reaction pills */}
                  {msg.reactions && Object.keys(msg.reactions).some(k => msg.reactions![k].length > 0) && (
                    <div className="dzc-reactions">
                      {Object.entries(msg.reactions).filter(([, ids]) => ids.length > 0).map(([emoji, ids]) => (
                        <button
                          key={emoji}
                          className={`dzc-reaction-pill${ids.includes(sessionIdRef.current || '') ? ' dzc-reaction-pill--mine' : ''}`}
                          onClick={e => { e.stopPropagation(); handleReact(msg.id, emoji) }}
                        >
                          {emoji}<span>{ids.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
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

          {/* ===== TYPING INDICATOR ===== */}
          {typingUsers.size > 0 && (() => {
            const names = [...typingUsers.values()]
            const label = names.length === 1
              ? `${names[0]} يكتب...`
              : names.length === 2
              ? `${names[0]} و ${names[1]} يكتبان...`
              : `${names[0]} و ${names.length - 1} آخرون يكتبون...`
            return (
              <div className="dzc-typing-bar">
                <span className="dzc-typing-bar-dots">
                  <span /><span /><span />
                </span>
                <span className="dzc-typing-bar-label">{label}</span>
              </div>
            )
          })()}

          {/* placeholder so the real messages div ends here */}
          <div className="dzc-typing-bar-placeholder" />

          {/* ===== INPUT AREA ===== */}
          <div className="dzc-input-wrap">
            {/* Reply preview bar */}
            {replyTarget && (
              <div className="dzc-reply-bar">
                <CornerUpLeft size={13} className="dzc-reply-bar-icon" />
                <div className="dzc-reply-bar-content">
                  <span className="dzc-reply-bar-from">{replyTarget.isHighlighted ? 'المشرف' : replyTarget.from}</span>
                  <span className="dzc-reply-bar-text">{replyTarget.text.slice(0, 100)}{replyTarget.text.length > 100 ? '…' : ''}</span>
                </div>
                <button className="dzc-reply-bar-cancel" onClick={() => setReplyTarget(null)} title="إلغاء الرد">
                  <X size={13} />
                </button>
              </div>
            )}
            {/* Muted banner */}
            {isMuted && (
              <div className="dzc-muted-bar">
                <VolumeX size={14} className="dzc-muted-icon" />
                <span>أنت مكتوم مؤقتاً — ينتهي خلال</span>
                <span className="dzc-muted-countdown">
                  <Clock size={11} /> {formatMuteRemain(muteRemainSec)}
                </span>
              </div>
            )}
            {/* @ mention hint banner */}
            {!isMuted && (
              <div className="dzc-at-hint-bar">
                💡 اكتب <strong>@dzagent</strong> للبحث الذكي المباشر مع الذكاء الاصطناعي
              </div>
            )}
            {/* @ mention dropdown */}
            {atDropdown && atSuggestions.length > 0 && (
              <div className="dzc-at-dropdown" onClick={e => e.stopPropagation()}>
                {atSuggestions.map(s => (
                  <button
                    key={s}
                    className="dzc-at-item"
                    onMouseDown={(e) => { e.preventDefault(); handleAtSelect(s) }}
                  >
                    <Bot size={13} className="dzc-at-icon" />
                    <span className="dzc-at-name">{s}</span>
                    <span className="dzc-at-desc">وكيل ذكي مع بحث مباشر</span>
                  </button>
                ))}
              </div>
            )}
            <div className="dzc-input-bar">
              <input
                ref={inputRef}
                className={`dzc-input${isMuted ? ' dzc-input--muted' : ''}`}
                placeholder={isMuted ? `🔇 أنت مكتوم — ينتهي الكتم خلال ${formatMuteRemain(muteRemainSec)}` : dmTarget ? `رسالة خاصة لـ ${dmTarget.name}...` : 'اكتب رسالتك... أو @dzagent لاستدعاء الذكاء الاصطناعي'}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                disabled={sending || isMuted}
                maxLength={1000}
                autoComplete="off"
              />
              <button
                className="dzc-send-btn"
                onClick={sendMessage}
                disabled={sending || !inputText.trim() || isMuted}
              >
                {sending ? <Loader2 size={16} className="dzc-spin" /> : isMuted ? <VolumeX size={16} /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* ===== BROADCAST MODAL ===== */}
      {showBroadcast && (
        <div className="dzc-broadcast-overlay" onClick={() => { setShowBroadcast(false); setBroadcastText('') }}>
          <div className="dzc-broadcast-modal" onClick={e => e.stopPropagation()}>
            <div className="dzc-broadcast-modal-header">
              <Megaphone size={18} className="dzc-broadcast-modal-icon" />
              <span>إذاعة رسالة للجميع</span>
              <button className="dzc-broadcast-modal-close" onClick={() => { setShowBroadcast(false); setBroadcastText('') }}>
                <X size={14} />
              </button>
            </div>
            <p className="dzc-broadcast-modal-hint">ستظهر رسالتك كإعلان بارز لجميع المستخدمين في الدردشة.</p>
            <textarea
              className="dzc-broadcast-textarea"
              placeholder="اكتب إعلانك هنا..."
              value={broadcastText}
              onChange={e => setBroadcastText(e.target.value)}
              maxLength={300}
              rows={4}
              autoFocus
            />
            <div className="dzc-broadcast-modal-footer">
              <span className="dzc-broadcast-char-count">{broadcastText.length}/300</span>
              <button
                className="dzc-broadcast-send-btn"
                onClick={adminBroadcast}
                disabled={!broadcastText.trim() || broadcastSending}
              >
                {broadcastSending ? <Loader2 size={14} className="dzc-spin" /> : <Megaphone size={14} />}
                إرسال الإذاعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PROFILE POPUP ===== */}
      {viewProfile && (
        <div className="dzc-profile-overlay" onClick={() => { setViewProfile(null); setProfileEditMode(false) }}>
          <div className="dzc-profile-card" onClick={e => e.stopPropagation()}>
            <button className="dzc-profile-close" onClick={() => { setViewProfile(null); setProfileEditMode(false) }}>
              <X size={15} />
            </button>

            {/* Avatar */}
            {viewProfile.avatar
              ? <img src={viewProfile.avatar} className="dzc-profile-avatar-img" alt="" />
              : <div className={`dzc-profile-avatar dzc-profile-avatar--${viewProfile.gender}`}>
                  {viewProfile.gender === 'female' ? '♀' : '♂'}
                </div>
            }

            {/* Name */}
            <div className="dzc-profile-name">{viewProfile.name}</div>
            {viewProfile.userId === sessionIdRef.current && <div className="dzc-profile-you-badge">أنت</div>}

            {!profileEditMode ? (
              <>
                {viewProfile.loading ? (
                  <div className="dzc-profile-loading"><Loader2 size={18} className="dzc-spin" /></div>
                ) : (
                  <div className="dzc-profile-fields">
                    {!viewProfile.profileId && (
                      <p className="dzc-profile-no-data">لم يُنشئ هذا المستخدم بروفايلاً بعد</p>
                    )}
                    {viewProfile.profileId && !viewProfile.city && !viewProfile.facebook && !viewProfile.instagram && !viewProfile.tiktok && viewProfile.userId !== sessionIdRef.current && (
                      <p className="dzc-profile-no-data">لم يُضف معلومات بعد</p>
                    )}
                    {viewProfile.city && (
                      <div className="dzc-profile-field">
                        <MapPin size={13} className="dzc-profile-field-icon" />
                        <span>{viewProfile.city}</span>
                      </div>
                    )}
                    {viewProfile.facebook && (
                      <a className="dzc-profile-field dzc-profile-field--link"
                        href={viewProfile.facebook.startsWith('http') ? viewProfile.facebook : `https://facebook.com/${viewProfile.facebook}`}
                        target="_blank" rel="noopener noreferrer">
                        <span className="dzc-profile-social-icon dzc-profile-social-icon--fb">f</span>
                        <span>{viewProfile.facebook}</span>
                        <ExternalLink size={10} />
                      </a>
                    )}
                    {viewProfile.instagram && (
                      <a className="dzc-profile-field dzc-profile-field--link"
                        href={`https://instagram.com/${viewProfile.instagram.replace('@','')}`}
                        target="_blank" rel="noopener noreferrer">
                        <span className="dzc-profile-social-icon dzc-profile-social-icon--ig">📷</span>
                        <span>@{viewProfile.instagram.replace('@','')}</span>
                        <ExternalLink size={10} />
                      </a>
                    )}
                    {viewProfile.tiktok && (
                      <a className="dzc-profile-field dzc-profile-field--link"
                        href={`https://tiktok.com/@${viewProfile.tiktok.replace('@','')}`}
                        target="_blank" rel="noopener noreferrer">
                        <span className="dzc-profile-social-icon dzc-profile-social-icon--tt">🎵</span>
                        <span>@{viewProfile.tiktok.replace('@','')}</span>
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="dzc-profile-actions">
                  {viewProfile.userId !== sessionIdRef.current && (
                    <button className="dzc-profile-dm-btn" onClick={() => {
                      const u = onlineUsers.find(u => u.id === viewProfile.userId)
                      if (u) setDmTarget(u)
                      setViewProfile(null)
                      setTimeout(() => inputRef.current?.focus(), 50)
                    }}>
                      <MessageCircle size={14} /> رسالة خاصة
                    </button>
                  )}
                  {viewProfile.userId === sessionIdRef.current && (
                    <button className="dzc-profile-edit-btn" onClick={() => {
                      setEditCity(viewProfile.city || '')
                      setEditFacebook(viewProfile.facebook || '')
                      setEditInstagram(viewProfile.instagram || '')
                      setEditTiktok(viewProfile.tiktok || '')
                      setEditAvatar(viewProfile.avatar || localUser?.avatar || null)
                      setProfileEditMode(true)
                    }}>
                      ✏️ تعديل بروفايلي
                    </button>
                  )}
                </div>

                {/* Admin actions */}
                {localUser?.isAdmin && viewProfile.userId !== sessionIdRef.current && (
                  <div className="dzc-profile-admin-section">
                    <div className="dzc-profile-admin-label"><Shield size={11} /> إجراءات المشرف</div>
                    <div className="dzc-profile-mute-row">
                      {[10, 20, 30, 45, 60].map(min => (
                        <button key={min} className="dzc-profile-mute-btn"
                          onClick={() => { adminMute(viewProfile.userId, min * 60 * 1000); setViewProfile(null) }}>
                          {min < 60 ? `${min}د` : 'ساعة'}
                        </button>
                      ))}
                    </div>
                    <button className="dzc-profile-block-btn"
                      onClick={() => { adminAction('block', viewProfile.userId); setViewProfile(null) }}>
                      <Shield size={12} /> حظر نهائي
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* Edit mode */
              <div className="dzc-profile-edit-form">
                {/* Avatar upload */}
                <div className="dzc-avatar-upload-wrap">
                  {editAvatar
                    ? <img src={editAvatar} className="dzc-avatar-preview" alt="صورتي" />
                    : <div className={`dzc-avatar-placeholder dzc-avatar-placeholder--${viewProfile.gender}`}>{viewProfile.gender === 'female' ? '♀' : '♂'}</div>
                  }
                  <div className="dzc-avatar-upload-actions">
                    <button className="dzc-avatar-upload-btn" type="button" onClick={() => avatarInputRef.current?.click()}>
                      📷 {editAvatar ? 'تغيير الصورة' : 'إضافة صورة'}
                    </button>
                    {editAvatar && (
                      <button className="dzc-avatar-remove-btn" type="button" onClick={() => setEditAvatar(null)}>
                        <X size={12} /> حذف
                      </button>
                    )}
                  </div>
                  <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
                  <p className="dzc-avatar-hint">تظهر صورتك دائرية في الدردشة. الحد الأقصى 200KB.</p>
                </div>
                <div className="dzc-profile-edit-field">
                  <label><MapPin size={11} /> المدينة / العنوان</label>
                  <input className="dzc-profile-edit-input" placeholder="مثال: الجزائر العاصمة" value={editCity} onChange={e => setEditCity(e.target.value)} maxLength={100} />
                </div>
                <div className="dzc-profile-edit-field">
                  <label><span className="dzc-profile-social-icon dzc-profile-social-icon--fb">f</span> Facebook</label>
                  <input className="dzc-profile-edit-input" placeholder="رابط أو اسم المستخدم" value={editFacebook} onChange={e => setEditFacebook(e.target.value)} maxLength={200} />
                </div>
                <div className="dzc-profile-edit-field">
                  <label><span className="dzc-profile-social-icon dzc-profile-social-icon--ig">📷</span> Instagram</label>
                  <input className="dzc-profile-edit-input" placeholder="@username" value={editInstagram} onChange={e => setEditInstagram(e.target.value)} maxLength={100} />
                </div>
                <div className="dzc-profile-edit-field">
                  <label><span className="dzc-profile-social-icon dzc-profile-social-icon--tt">🎵</span> TikTok</label>
                  <input className="dzc-profile-edit-input" placeholder="@username" value={editTiktok} onChange={e => setEditTiktok(e.target.value)} maxLength={100} />
                </div>
                <div className="dzc-profile-edit-actions">
                  <button className="dzc-profile-edit-cancel" onClick={() => setProfileEditMode(false)}>إلغاء</button>
                  <button className="dzc-profile-save-btn" onClick={saveProfileFields} disabled={editSaving}>
                    {editSaving ? <Loader2 size={14} className="dzc-spin" /> : '💾'} حفظ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== SIDEBAR OVERLAY on mobile ===== */}
      {sidebarOpen && <div className="dzc-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ===== USER CONTEXT MENU ===== */}
      {userMenu && (
        <div
          className="dzc-context-menu"
          style={{ top: Math.min(userMenu.y, window.innerHeight - 220), left: Math.max(8, Math.min(userMenu.x, window.innerWidth - 220)) }}
          onClick={e => e.stopPropagation()}
        >
          <button className="dzc-context-item" onClick={() => { setDmTarget(userMenu.user); setSidebarOpen(false); setUserMenu(null); inputRef.current?.focus() }}>
            <MessageCircle size={13} /> إرسال رسالة خاصة
          </button>
          {localUser.isAdmin && (
            <>
              <div className="dzc-context-separator" />
              <div className="dzc-context-label"><VolumeX size={11} /> حظر مؤقت</div>
              <button className="dzc-context-item dzc-context-item--mute" onClick={() => adminMute(userMenu.user.id, 10 * 60 * 1000)}>
                <Clock size={13} /> 10 دقائق
              </button>
              <button className="dzc-context-item dzc-context-item--mute" onClick={() => adminMute(userMenu.user.id, 20 * 60 * 1000)}>
                <Clock size={13} /> 20 دقيقة
              </button>
              <button className="dzc-context-item dzc-context-item--mute" onClick={() => adminMute(userMenu.user.id, 30 * 60 * 1000)}>
                <Clock size={13} /> 30 دقيقة
              </button>
              <button className="dzc-context-item dzc-context-item--mute" onClick={() => adminMute(userMenu.user.id, 45 * 60 * 1000)}>
                <Clock size={13} /> 45 دقيقة
              </button>
              <button className="dzc-context-item dzc-context-item--mute" onClick={() => adminMute(userMenu.user.id, 60 * 60 * 1000)}>
                <Clock size={13} /> ساعة كاملة
              </button>
              <button className="dzc-context-item dzc-context-item--mute-off" onClick={() => adminUnmute(userMenu.user.id)}>
                <VolumeX size={13} /> رفع الحظر
              </button>
              <div className="dzc-context-separator" />
              <button className="dzc-context-item dzc-context-item--danger" onClick={() => adminAction('block', userMenu.user.id)}>
                <Shield size={13} /> حظر المستخدم
              </button>
            </>
          )}
        </div>
      )}

      {/* ===== MESSAGE ADMIN CONTEXT MENU ===== */}
      {msgMenu && localUser.isAdmin && (
        <div
          className="dzc-context-menu"
          style={{ top: Math.min(msgMenu.y, window.innerHeight - 180), left: Math.max(8, Math.min(msgMenu.x, window.innerWidth - 210)) }}
          onClick={e => e.stopPropagation()}
        >
          <button className="dzc-context-item" onClick={() => adminAction('highlight', undefined, msgMenu.msg.id)}>
            <Highlighter size={13} /> تمييز الرسالة (إعلان)
          </button>
          <button className="dzc-context-item dzc-context-item--pin" onClick={() => adminAction('pin', undefined, msgMenu.msg.id)}>
            <Pin size={13} /> تثبيت الرسالة
          </button>
          {pinnedMessage && (
            <button className="dzc-context-item dzc-context-item--pin" onClick={() => adminAction('unpin')}>
              <PinOff size={13} /> إلغاء التثبيت
            </button>
          )}
          <button className="dzc-context-item dzc-context-item--danger" onClick={() => adminAction('delete', undefined, msgMenu.msg.id)}>
            <Trash2 size={13} /> حذف الرسالة
          </button>
          {msgMenu.msg.fromId !== 'bot' && msgMenu.msg.fromId !== 'system' && (
            <>
              <div className="dzc-context-separator" />
              <div className="dzc-context-label"><VolumeX size={11} /> حظر المرسل مؤقتاً</div>
              <button className="dzc-context-item dzc-context-item--mute" onClick={() => adminMute(msgMenu.msg.fromId, 10 * 60 * 1000)}>
                <Clock size={13} /> 10 دقائق
              </button>
              <button className="dzc-context-item dzc-context-item--mute" onClick={() => adminMute(msgMenu.msg.fromId, 20 * 60 * 1000)}>
                <Clock size={13} /> 20 دقيقة
              </button>
              <button className="dzc-context-item dzc-context-item--mute" onClick={() => adminMute(msgMenu.msg.fromId, 30 * 60 * 1000)}>
                <Clock size={13} /> 30 دقيقة
              </button>
              <button className="dzc-context-item dzc-context-item--mute" onClick={() => adminMute(msgMenu.msg.fromId, 45 * 60 * 1000)}>
                <Clock size={13} /> 45 دقيقة
              </button>
              <button className="dzc-context-item dzc-context-item--mute" onClick={() => adminMute(msgMenu.msg.fromId, 60 * 60 * 1000)}>
                <Clock size={13} /> ساعة كاملة
              </button>
              <button className="dzc-context-item dzc-context-item--mute-off" onClick={() => adminUnmute(msgMenu.msg.fromId)}>
                <VolumeX size={13} /> رفع الحظر
              </button>
              <div className="dzc-context-separator" />
              <button className="dzc-context-item dzc-context-item--danger" onClick={() => adminAction('block', msgMenu.msg.fromId)}>
                <Shield size={13} /> حظر المرسل
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
