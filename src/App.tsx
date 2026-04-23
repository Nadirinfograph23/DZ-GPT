import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Send, Bot, Sparkles, Plus, Trash2, Menu, X, MessageSquare, Copy, Check, RotateCcw, ChevronDown, FileText, Upload, X as XIcon, CheckCircle, Search, ShieldCheck, ImageIcon, Loader2, Wand2, MessageCircle, BookOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as pdfjsLib from 'pdfjs-dist'
import Tesseract from 'tesseract.js'
import PwaInstallBanner from './PwaInstallBanner'
import './App.css'
import './styles/dz-agent.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

// ===== FACEBOOK ICON =====
function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

// ===== TYPES =====
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface Chat {
  id: string
  title: string
  messages: Message[]
  modelId: string
}

// ===== AI MODELS =====
const AI_MODELS = [
  { id: 'chatgpt', name: 'ChatGPT', color: '#10a37f' },
  { id: 'llama-70b', name: 'LLaMA 3.3 70B', color: '#0668E1' },
  { id: 'llama-8b', name: 'LLaMA 3.1 8B', color: '#3b82f6' },
  { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', color: '#00d4aa' },
  { id: 'gpt-oss-20b', name: 'GPT-OSS 20B', color: '#4285f4' },
  { id: 'llama-4-scout', name: 'LLaMA 4 Scout', color: '#8b5cf6' },
  { id: 'qwen', name: 'Qwen3 32B', color: '#7c3aed' },
  { id: 'compound', name: 'Compound', color: '#10a37f' },
  { id: 'compound-mini', name: 'Compound Mini', color: '#d97706' },
  { id: 'deepseek-pdf', name: 'DeepSeek PDF', color: '#4d6bfe' },
  { id: 'ocr-dz', name: 'OCR DZ', color: '#00b050' },
  { id: 'dz-agent', name: 'DZ Agent', color: '#c8ff00', free: true },
]

// ===== LANGUAGE CONFIG =====
type Lang = 'ar' | 'en' | 'fr'
const LANGUAGES: { id: Lang; label: string; flag: string }[] = [
  { id: 'ar', label: 'العربية', flag: '🇩🇿' },
  { id: 'en', label: 'English', flag: '🇬🇧' },
  { id: 'fr', label: 'Français', flag: '🇫🇷' },
]

const SUGGESTIONS: Record<Lang, string[]> = {
  ar: [
    'اكتب لي قصة قصيرة عن استكشاف الفضاء',
    'اشرح لي الحوسبة الكمية بمصطلحات بسيطة',
    'ساعدني في كتابة دالة Python لفرز قائمة',
    'ما هي أفضل ممارسات تطوير الويب؟',
  ],
  en: [
    'Write me a short story about space exploration',
    'Explain quantum computing in simple terms',
    'Help me write a Python function to sort a list',
    'What are the best practices for web development?',
  ],
  fr: [
    'Écris-moi une courte histoire sur l\'exploration spatiale',
    'Explique l\'informatique quantique en termes simples',
    'Aide-moi à écrire une fonction Python pour trier une liste',
    'Quelles sont les meilleures pratiques pour le développement web ?',
  ],
}

// ===== HELPERS =====
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

// ===== API =====
async function fetchAIResponse(
  messages: { role: string; content: string }[],
  modelId: string,
  signal?: AbortSignal
): Promise<string> {
  const isDZAgent = modelId === 'dz-agent'
  const endpoint = isDZAgent ? '/api/dz-agent-chat' : '/api/chat'
  const body = isDZAgent
    ? JSON.stringify({ messages: messages.filter(m => m.role !== 'system') })
    : JSON.stringify({ messages, model: modelId })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => null)
    throw new Error(errData?.error || `Server error: ${response.status}`)
  }

  const data = await response.json()
  return data.content || 'No response generated.'
}

// ===== CODE BLOCK =====
function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const language = className?.replace('language-', '') || ''
  const codeText = String(children).replace(/\n$/, '')

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{language || 'code'}</span>
        <button className="code-copy-btn" onClick={handleCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
}

// ===== PRIVACY TOAST =====
function PrivacyToast() {
  const [visible, setVisible] = useState(false)
  const [hiding, setHiding] = useState(false)

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 2200)
    const hide = setTimeout(() => startHide(), 8000)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [])

  const startHide = () => {
    setHiding(true)
    setTimeout(() => setVisible(false), 400)
  }

  if (!visible) return null

  return (
    <div className={`privacy-toast${hiding ? ' privacy-toast--hiding' : ''}`}>
      <ShieldCheck size={18} className="privacy-toast-icon" />
      <p className="privacy-toast-text">
        محادثاتك محفوظة <strong>محليًا على جهازك فقط</strong> — لا يتم رفعها إلى أي خادم. يمكنك حذفها في أي وقت.
      </p>
      <button className="privacy-toast-close" onClick={startHide} aria-label="إغلاق">
        <X size={14} />
      </button>
    </div>
  )
}

// ===== COMPONENT =====
function App() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [chats, setChats] = useState<Chat[]>(() => {
    const saved = localStorage.getItem('dz-gpt-chats')
    if (saved) {
      try { return JSON.parse(saved) } catch { return [] }
    }
    return []
  })
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    return localStorage.getItem('dz-gpt-active-chat') || null
  })
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].id)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showMobileModelMenu, setShowMobileModelMenu] = useState(false)
  const [navDropdownOpen, setNavDropdownOpen] = useState(false)
  const [language, setLanguage] = useState<Lang>(() => {
    return (localStorage.getItem('dz-gpt-lang') as Lang) || 'ar'
  })
  const [pdfText, setPdfText] = useState<string | null>(null)
  const [pdfFileName, setPdfFileName] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfImageOnly, setPdfImageOnly] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const [ocrFile, setOcrFile] = useState<File | null>(null)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrCorrecting, setOcrCorrecting] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const ocrInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const activeChat = chats.find(c => c.id === activeChatId) || null
  const filteredChats = chats.filter(c => c.modelId === selectedModel)
  const isPdfModel = selectedModel === 'deepseek-pdf' || selectedModel === 'ocr-dz'

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('dz-gpt-chats', JSON.stringify(chats))
  }, [chats])

  useEffect(() => {
    localStorage.setItem('dz-gpt-lang', language)
  }, [language])

  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem('dz-gpt-active-chat', activeChatId)
    }
  }, [activeChatId])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeChat?.messages, isLoading])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + 'px'
    }
  }, [input])

  // Handle DeepSeek PDF transfer from DZ Agent
  useEffect(() => {
    const modelParam = searchParams.get('model')
    if (modelParam === 'deepseek-pdf') {
      setSelectedModel('deepseek-pdf')
      try {
        const raw = sessionStorage.getItem('dz-transfer-deepseek')
        if (raw) {
          const { url, title } = JSON.parse(raw)
          sessionStorage.removeItem('dz-transfer-deepseek')
          if (url) {
            setInput(`أرجو تحليل هذا الملف:\n📄 ${title || url}\n🔗 ${url}`)
          }
        }
      } catch {}
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // PDF extraction
  const handlePdfUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) return

    setPdfLoading(true)
    setPdfFileName(file.name)
    setPdfImageOnly(false)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const textParts: string[] = []

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
        if (pageText.trim()) {
          textParts.push(pageText)
        }
      }

      const extracted = textParts.join('\n\n')
      setPdfText(extracted || null)
      if (!extracted) {
        setPdfFileName(null)
        setPdfImageOnly(true)
      }
    } catch {
      setPdfText(null)
      setPdfFileName(null)
    } finally {
      setPdfLoading(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }, [])

  const removePdf = useCallback(() => {
    setPdfText(null)
    setPdfFileName(null)
    setPdfImageOnly(false)
  }, [])

  const handleOCRFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setOcrFile(file)
    setPdfText(null)
    setPdfFileName(null)
    if (ocrInputRef.current) ocrInputRef.current.value = ''
  }, [])

  const runOCR = useCallback(async () => {
    if (!ocrFile) return
    setOcrRunning(true)
    setOcrProgress(0)
    try {
      let rawText = ''
      const isPDF = ocrFile.type === 'application/pdf' || ocrFile.name.toLowerCase().endsWith('.pdf')

      if (isPDF) {
        const arrayBuffer = await ocrFile.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        const pageCount = Math.min(pdf.numPages, 15)
        const texts: string[] = []
        for (let i = 1; i <= pageCount; i++) {
          setOcrProgress(Math.round(((i - 1) / pageCount) * 70))
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 2.0 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport, canvas }).promise
          const result = await Tesseract.recognize(canvas, 'ara+eng+fra', { logger: () => {} })
          if (result.data.text.trim()) texts.push(result.data.text.trim())
          canvas.remove()
        }
        rawText = texts.join('\n\n---\n\n')
      } else {
        setOcrProgress(30)
        const result = await Tesseract.recognize(ocrFile, 'ara+eng+fra', { logger: () => {} })
        rawText = result.data.text
        setOcrProgress(70)
      }

      setOcrRunning(false)
      setOcrCorrecting(true)
      setOcrProgress(80)

      const correctionMessages = [
        {
          role: 'system',
          content: `أنت متخصص في تنظيف النصوص المستخرجة عبر OCR. مهامك:
1. تصحيح الأخطاء الإملائية الناجمة عن OCR
2. تحسين الصياغة وتنظيف النص
3. الحفاظ على المعنى الأصلي بدقة
4. إزالة الأحرف الغريبة والرموز غير المنطقية
5. ترتيب الفقرات بشكل منطقي
أرجع النص المصحح فقط بدون أي تعليقات إضافية.`
        },
        {
          role: 'user',
          content: `صحّح وحسّن النص التالي المستخرج بواسطة OCR:\n\n${rawText.substring(0, 8000)}`
        }
      ]

      let correctedText = rawText
      try {
        const r = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: correctionMessages, model: 'llama-70b' })
        })
        if (r.ok) {
          const d = await r.json()
          if (d.content) correctedText = d.content
        }
      } catch (err) {
        console.warn('[OCR] AI correction failed, using raw text:', err)
      }

      setOcrProgress(100)
      setPdfText(correctedText)
      setPdfFileName(ocrFile.name)
      setOcrFile(null)
      console.log('[OCR] Done. Characters extracted:', correctedText.length)
    } catch (err) {
      console.error('[OCR] Error:', err)
    } finally {
      setOcrRunning(false)
      setOcrCorrecting(false)
      setOcrProgress(0)
    }
  }, [ocrFile])

  const createNewChat = useCallback(() => {
    const newChat: Chat = {
      id: generateId(),
      title: 'New Chat',
      messages: [],
      modelId: selectedModel,
    }
    setChats(prev => [newChat, ...prev])
    setActiveChatId(newChat.id)
    setSidebarOpen(false)
    setInput('')
  }, [selectedModel])

  const deleteChat = useCallback((chatId: string) => {
    setChats(prev => prev.filter(c => c.id !== chatId))
    if (activeChatId === chatId) {
      setActiveChatId(null)
    }
  }, [activeChatId])

  const copyMessage = useCallback((messageId: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(messageId)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const sendMessage = useCallback(async (overrideText?: string, options?: { forceNewChat?: boolean }) => {
    const text = (overrideText ?? input).trim()
    if (!text || isLoading) return

    let currentChatId = activeChatId
    let currentChats = chats

    if (options?.forceNewChat || !currentChatId) {
      const newChat: Chat = {
        id: generateId(),
        title: text.substring(0, 60),
        messages: [],
        modelId: selectedModel,
      }
      currentChats = [newChat, ...currentChats]
      currentChatId = newChat.id
      setChats(currentChats)
      setActiveChatId(currentChatId)
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: text,
    }

    const updatedChats = currentChats.map(c => {
      if (c.id === currentChatId) {
        return {
          ...c,
          messages: [...c.messages, userMessage],
          title: c.messages.length === 0 ? text.substring(0, 60) : c.title,
        }
      }
      return c
    })
    setChats(updatedChats)
    setInput('')
    setIsLoading(true)

    const chat = updatedChats.find(c => c.id === currentChatId)!
    const modelName = AI_MODELS.find(m => m.id === selectedModel)?.name || 'AI'

    let systemPrompt = `You are ${modelName}, a helpful and knowledgeable AI assistant. Provide clear, accurate, and well-formatted responses. Use markdown formatting when appropriate.`
    if (isPdfModel && pdfText) {
      const truncated = pdfText.substring(0, 12000)
      systemPrompt = [
        'You are a helpful AI assistant that answers questions about documents.',
        '',
        'Instructions:',
        '- If the user greets you (hi, hello), respond warmly and invite them to ask about the document.',
        '- If the user thanks you, acknowledge it briefly and offer further help.',
        '- If the user asks a question related to the document, answer it thoroughly using the provided context.',
        '- If the user asks something unrelated to the document, politely explain you can only answer questions about the document content.',
        '',
        'IMPORTANT: Respond naturally and conversationally. Do NOT include labels like "Classification:", "Intent:", or "Category:" in your response. Just provide the answer directly.',
        '',
        `Document Content:\n${truncated}`,
      ].join('\n')
    }

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...chat.messages.map(m => ({ role: m.role, content: m.content })),
    ]

    try {
      abortRef.current = new AbortController()
      const response = await fetchAIResponse(apiMessages, selectedModel, abortRef.current.signal)

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response,
      }

      setChats(prev => prev.map(c => {
        if (c.id === currentChatId) {
          return { ...c, messages: [...c.messages, assistantMessage] }
        }
        return c
      }))
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: 'Sorry, an error occurred while generating a response. Please try again.',
      }
      setChats(prev => prev.map(c => {
        if (c.id === currentChatId) {
          return { ...c, messages: [...c.messages, errorMessage] }
        }
        return c
      }))
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [input, isLoading, activeChatId, chats, selectedModel, isPdfModel, pdfText, setInput])

  const regenerate = useCallback(async () => {
    if (!activeChat || activeChat.messages.length < 2 || isLoading) return

    const messagesWithoutLast = activeChat.messages.slice(0, -1)
    setChats(prev => prev.map(c => {
      if (c.id === activeChatId) {
        return { ...c, messages: messagesWithoutLast }
      }
      return c
    }))

    setIsLoading(true)
    const modelName = AI_MODELS.find(m => m.id === selectedModel)?.name || 'AI'

    let systemPrompt = `You are ${modelName}, a helpful and knowledgeable AI assistant. Provide clear, accurate, and well-formatted responses. Use markdown formatting when appropriate.`
    if (isPdfModel && pdfText) {
      const truncated = pdfText.substring(0, 12000)
      systemPrompt = [
        'You are a helpful AI assistant that answers questions about documents.',
        '',
        'Instructions:',
        '- If the user greets you (hi, hello), respond warmly and invite them to ask about the document.',
        '- If the user thanks you, acknowledge it briefly and offer further help.',
        '- If the user asks a question related to the document, answer it thoroughly using the provided context.',
        '- If the user asks something unrelated to the document, politely explain you can only answer questions about the document content.',
        '',
        'IMPORTANT: Respond naturally and conversationally. Do NOT include labels like "Classification:", "Intent:", or "Category:" in your response. Just provide the answer directly.',
        '',
        `Document Content:\n${truncated}`,
      ].join('\n')
    }

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messagesWithoutLast.map(m => ({ role: m.role, content: m.content })),
    ]

    try {
      abortRef.current = new AbortController()
      const response = await fetchAIResponse(apiMessages, selectedModel, abortRef.current.signal)

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response,
      }

      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          return { ...c, messages: [...messagesWithoutLast, assistantMessage] }
        }
        return c
      }))
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return
      const errorMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: 'Sorry, an error occurred. Please try again.',
      }
      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          return { ...c, messages: [...messagesWithoutLast, errorMessage] }
        }
        return c
      }))
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [activeChat, activeChatId, isLoading, selectedModel, isPdfModel, pdfText])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const stopGeneration = () => {
    abortRef.current?.abort()
    setIsLoading(false)
  }

  const currentModel = AI_MODELS.find(m => m.id === selectedModel)!

  return (
    <div className="app">
      {/* ===== SIDEBAR ===== */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <Sparkles size={22} className="logo-icon" />
            <div className="logo-text-group">
              <span className="logo-text">DZ GPT</span>
              <span className="logo-subtitle">BY NADIR HOUAMRIA</span>
            </div>
          </div>
          <button className="icon-btn" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {/* Language Selector */}
        <div className="lang-selector">
          {LANGUAGES.map(lang => (
            <button
              key={lang.id}
              className={`lang-btn ${language === lang.id ? 'active' : ''}`}
              onClick={() => setLanguage(lang.id)}
              title={lang.label}
            >
              <span className="lang-flag">{lang.flag}</span>
              <span className="lang-label">{lang.label}</span>
            </button>
          ))}
        </div>

        {/* Navigation Dropdown */}
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
              <button className="sidebar-nav-item" onClick={() => { navigate('/dz-agent'); setSidebarOpen(false); setNavDropdownOpen(false) }}>
                <Bot size={14} />
                <span>DZ Agent</span>
              </button>
              <button className="sidebar-nav-item" onClick={() => { navigate('/quran'); setSidebarOpen(false); setNavDropdownOpen(false) }}>
                <BookOpen size={14} />
                <span>القرآن الكريم</span>
              </button>
              <button className="sidebar-nav-item" onClick={() => { navigate('/dzchat'); setSidebarOpen(false); setNavDropdownOpen(false) }}>
                <MessageCircle size={14} />
                <span>DZ CHAT</span>
              </button>
            </div>
          )}
        </div>

        <button className="new-chat-btn" onClick={createNewChat}>
          <Plus size={18} />
          <span>New Chat</span>
        </button>

        <div className="chat-list">
          {filteredChats.map(chat => (
            <div
              key={chat.id}
              className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
              onClick={() => {
                setActiveChatId(chat.id)
                setSidebarOpen(false)
              }}
            >
              <MessageSquare size={16} />
              <span className="chat-item-title">{chat.title}</span>
              <button
                className="delete-btn"
                onClick={(e) => { e.stopPropagation(); deleteChat(chat.id) }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {filteredChats.length === 0 && (
            <div style={{ padding: '20px 12px', color: '#444', fontSize: '13px', textAlign: 'center' }}>
              No conversations yet
            </div>
          )}
        </div>
      </div>

      {/* ===== MAIN ===== */}
      <div className="main">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="logo mobile-logo">
              <Sparkles size={20} className="logo-icon" />
              <div className="logo-text-group">
                <span className="logo-text">DZ GPT</span>
                <span className="logo-subtitle">BY NADIR HOUAMRIA</span>
              </div>
            </div>
          </div>

          <div className="model-tabs-wrapper">
            <div className="model-tabs">
              {AI_MODELS.map(model => {
                const isDZAgent = model.id === 'dz-agent'
                return (
                  <button
                    key={model.id}
                    className={`model-tab ${selectedModel === model.id ? 'active' : ''} ${isDZAgent ? 'dz-agent-model-tab' : ''}`}
                    onClick={() => {
                      if (model.id === 'dz-agent') {
                        navigate('/dz-agent')
                        return
                      }
                      setSelectedModel(model.id)
                      const modelChats = chats.filter(c => c.modelId === model.id)
                      if (modelChats.length > 0) {
                        setActiveChatId(modelChats[0].id)
                      } else {
                        setActiveChatId(null)
                      }
                    }}
                    style={selectedModel === model.id ? { borderColor: model.color, color: model.color } : {}}
                  >
                    {isDZAgent && <span className="dz-free-blink">Free</span>}
                    {model.name}
                  </button>
                )
              })}
              <button
                className="model-tab quran-nav-tab"
                onClick={() => navigate('/quran')}
                title="القرآن الكريم"
              >
                📖 القرآن
              </button>
            </div>
          </div>

          {/* Facebook link */}
          <a
            href="https://www.facebook.com/nadir.infograph23"
            className="facebook-btn"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
              if (isMobile) {
                e.preventDefault()
                window.location.href = 'fb://facewebmodal/f?href=https://www.facebook.com/nadir.infograph23'
                setTimeout(() => {
                  window.open('https://www.facebook.com/nadir.infograph23', '_blank')
                }, 500)
              }
            }}
          >
            <FacebookIcon size={20} />
          </a>

          {/* Mobile model dropdown */}
          <div className="mobile-model-dropdown">
            <button
              className="mobile-model-toggle"
              onClick={() => setShowMobileModelMenu(!showMobileModelMenu)}
              style={{ borderColor: currentModel.color }}
            >
              <span className="mobile-model-dot" style={{ background: currentModel.color }} />
              <span>{currentModel.name}</span>
              <ChevronDown size={14} className={`dropdown-chevron ${showMobileModelMenu ? 'open' : ''}`} />
            </button>
            {showMobileModelMenu && (
              <div className="mobile-model-menu">
                {AI_MODELS.map(model => (
                  <button
                    key={model.id}
                    className={`mobile-model-option ${selectedModel === model.id ? 'active' : ''} ${model.id === 'dz-agent' ? 'dz-agent-mobile-option' : ''}`}
                    onClick={() => {
                      if (model.id === 'dz-agent') {
                        setShowMobileModelMenu(false)
                        navigate('/dz-agent')
                        return
                      }
                      setSelectedModel(model.id)
                      setShowMobileModelMenu(false)
                      const modelChats = chats.filter(c => c.modelId === model.id)
                      if (modelChats.length > 0) {
                        setActiveChatId(modelChats[0].id)
                      } else {
                        setActiveChatId(null)
                      }
                    }}
                  >
                    {model.id === 'dz-agent'
                      ? <span className="dz-free-blink" style={{ fontSize: '10px' }}>Free</span>
                      : <span className="input-model-dot" style={{ background: model.color }} />
                    }
                    <span>{model.name}</span>
                  </button>
                ))}
                <button
                  className="mobile-model-option"
                  onClick={() => { setShowMobileModelMenu(false); navigate('/quran') }}
                >
                  <span>📖</span>
                  <span>القرآن الكريم</span>
                </button>
              </div>
            )}
          </div>

        </header>

        {/* Chat Area */}
        <div className="chat-area">
          {!activeChat || activeChat.messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">
                <Sparkles size={44} />
              </div>
              <h1 className="welcome-title">DZ GPT</h1>
              <p className="welcome-subtitle">
                AI Chat powered by {currentModel.name}
              </p>

              {selectedModel === 'ocr-dz' && (
                <div className="pdf-upload-section ocr-dz-section">
                  <input
                    ref={ocrInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleOCRFileSelect}
                    style={{ display: 'none' }}
                    id="ocr-upload"
                  />
                  {pdfFileName ? (
                    <div className="pdf-upload-success">
                      <div className="pdf-success-icon" style={{ color: '#00b050' }}>
                        <CheckCircle size={32} />
                      </div>
                      <div className="pdf-success-text">✨ تم استخراج النص وتصحيحه بالذكاء الاصطناعي</div>
                      <div className="pdf-file-badge">
                        <FileText size={18} />
                        <span className="pdf-file-name">{pdfFileName}</span>
                        <button className="pdf-remove-btn" onClick={removePdf}>
                          <XIcon size={14} />
                        </button>
                      </div>
                      <div className="pdf-search-hint">
                        <MessageCircle size={16} />
                        <span>يمكنك الآن طرح أسئلة حول النص المستخرج أو تحليله</span>
                      </div>
                    </div>
                  ) : ocrRunning || ocrCorrecting ? (
                    <div className="ocr-progress-box">
                      <Loader2 size={28} className="ocr-spin-icon" />
                      <div className="ocr-progress-label">
                        {ocrRunning ? '🔍 جاري استخراج النص بـ Tesseract OCR...' : '✨ جاري تصحيح النص بالذكاء الاصطناعي...'}
                      </div>
                      <div className="ocr-progress-bar-wrap">
                        <div className="ocr-progress-bar" style={{ width: `${ocrProgress}%` }} />
                      </div>
                      <div className="ocr-progress-pct">{ocrProgress}%</div>
                    </div>
                  ) : ocrFile ? (
                    <div className="ocr-file-ready">
                      <div className="ocr-file-icon">
                        {ocrFile.type.startsWith('image/') ? <ImageIcon size={28} /> : <FileText size={28} />}
                      </div>
                      <div className="ocr-file-name">{ocrFile.name}</div>
                      <div className="ocr-file-size">{(ocrFile.size / 1024).toFixed(0)} KB</div>
                      <button className="ocr-extract-btn" onClick={runOCR}>
                        <Wand2 size={16} />
                        <span>Extract Text</span>
                      </button>
                      <button className="ocr-cancel-btn" onClick={() => setOcrFile(null)}>
                        <XIcon size={14} /> إلغاء
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="ocr-upload" className="pdf-upload-btn ocr-upload-btn">
                      <Upload size={20} />
                      <span>رفع صورة أو ملف PDF</span>
                      <span className="pdf-upload-hint">
                        يدعم: jpg, png, bmp, webp, tiff, pdf
                      </span>
                      <span className="ocr-features-row">
                        <span>🔍 OCR</span>
                        <span>✨ AI تصحيح</span>
                        <span>💬 تحليل ذكي</span>
                      </span>
                    </label>
                  )}
                </div>
              )}

              {selectedModel === 'deepseek-pdf' && (
                <div className="pdf-upload-section">
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handlePdfUpload}
                    style={{ display: 'none' }}
                    id="pdf-upload"
                  />
                  {pdfFileName ? (
                    <div className="pdf-upload-success">
                      <div className="pdf-success-icon">
                        <CheckCircle size={32} />
                      </div>
                      <div className="pdf-success-text">تم رفع الملف بنجاح</div>
                      <div className="pdf-file-badge">
                        <FileText size={18} />
                        <span className="pdf-file-name">{pdfFileName}</span>
                        <button className="pdf-remove-btn" onClick={removePdf}>
                          <XIcon size={14} />
                        </button>
                      </div>
                      <div className="pdf-search-hint">
                        <Search size={16} />
                        <span>يمكنك الآن طرح أسئلة أو البحث عن معلومات في هذا الملف</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <label htmlFor="pdf-upload" className="pdf-upload-btn">
                        {pdfLoading ? (
                          <>
                            <div className="pdf-spinner" />
                            <span>Extracting text...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={20} />
                            <span>Upload PDF</span>
                            <span className="pdf-upload-hint">Upload a PDF document to ask questions about it</span>
                          </>
                        )}
                      </label>
                      {pdfImageOnly && !pdfLoading && (
                        <div className="pdf-image-only-warning">
                          <div className="pdf-warning-line">⚠️ الملف غير مدعوم</div>
                          <div className="pdf-warning-line">هذا النوع من الملفات عبارة عن صور فقط</div>
                          <div className="pdf-warning-line pdf-warning-tip">✔ جرّب: تحديد النص داخل الملف</div>
                          <div className="pdf-warning-line pdf-warning-error">
                            ❌ إذا لم تستطع، استخدم{' '}
                            <button
                              className="ocr-switch-btn"
                              onClick={() => {
                                setSelectedModel('ocr-dz')
                                const modelChats = chats.filter(c => c.modelId === 'ocr-dz')
                                setActiveChatId(modelChats.length > 0 ? modelChats[0].id : null)
                                setPdfImageOnly(false)
                              }}
                            >
                              OCR DZ ←
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {selectedModel === 'ocr-dz' ? (
                <div className="ocr-description-card">
                  OCR DZ هي أداة ذكية تقوم بالتعرف على النصوص من الصور وملفات PDF، ثم استخراجها، تحليلها، تصحيحها، وإتاحة إمكانية مناقشتها بشكل تفاعلي.
                </div>
              ) : (
                <div className="suggestions">
                  {SUGGESTIONS[language].map((suggestion, i) => (
                    <button
                      key={i}
                      className="suggestion-btn"
                      onClick={() => sendMessage(suggestion, { forceNewChat: true })}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="messages">
              {activeChat.messages.map((message) => (
                <div key={message.id} className={`message ${message.role}`}>
                  <div className="message-avatar">
                    {message.role === 'user' ? (
                      <div className="avatar user-avatar">U</div>
                    ) : (
                      <div className="avatar bot-avatar" style={{ background: currentModel.color }}>
                        <Bot size={16} />
                      </div>
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-sender">
                        {message.role === 'user' ? 'You' : currentModel.name}
                      </span>
                    </div>
                    <div
                      className="message-text"
                      dir={/[\u0600-\u06FF]/.test(message.content) && (message.content.match(/[\u0600-\u06FF]/g) || []).length / message.content.replace(/\s/g,'').length > 0.3 ? 'rtl' : 'ltr'}
                      style={/[\u0600-\u06FF]/.test(message.content) && (message.content.match(/[\u0600-\u06FF]/g) || []).length / message.content.replace(/\s/g,'').length > 0.3 ? { textAlign: 'right' } : {}}
                    >
                      {message.role === 'assistant' ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code({ className, children, ...props }) {
                              const isBlock = className?.startsWith('language-')
                              if (isBlock) {
                                return <CodeBlock className={className}>{children}</CodeBlock>
                              }
                              return <code className={className} {...props}>{children}</code>
                            },
                            pre({ children }) {
                              return <>{children}</>
                            },
                          }}
                        >{message.content}</ReactMarkdown>
                      ) : (
                        message.content
                      )}
                    </div>
                    {message.role === 'assistant' && (
                      <div className="message-actions">
                        <button
                          className="action-btn"
                          onClick={() => copyMessage(message.id, message.content)}
                        >
                          {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                          {copiedId === message.id ? 'Copied' : 'Copy'}
                        </button>
                        {message.id === activeChat.messages[activeChat.messages.length - 1]?.id && (
                          <button className="action-btn" onClick={regenerate}>
                            <RotateCcw size={14} />
                            Regenerate
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="message assistant">
                  <div className="message-avatar">
                    <div className="avatar bot-avatar" style={{ background: currentModel.color }}>
                      <Bot size={16} />
                    </div>
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-sender">{currentModel.name}</span>
                    </div>
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="input-area">
          {isPdfModel && pdfFileName && activeChat && activeChat.messages.length > 0 && (
            <div className="pdf-active-badge">
              <FileText size={14} />
              <span>{pdfFileName}</span>
              <button className="pdf-remove-btn-small" onClick={removePdf}>
                <XIcon size={12} />
              </button>
            </div>
          )}
          <div className="input-model-row">
            <div className="input-model-dropdown">
              <button
                className="input-model-btn"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                style={{ borderColor: currentModel.color }}
              >
                <span className="input-model-dot" style={{ background: currentModel.color }} />
                <span>{currentModel.name}</span>
                <ChevronDown size={14} className={`dropdown-chevron ${showModelDropdown ? 'open' : ''}`} />
              </button>
              {showModelDropdown && (
                <div className="input-model-menu">
                  {AI_MODELS.map(model => (
                    <button
                      key={model.id}
                      className={`input-model-option ${selectedModel === model.id ? 'active' : ''} ${model.id === 'dz-agent' ? 'dz-agent-input-option' : ''}`}
                      onClick={() => {
                        if (model.id === 'dz-agent') {
                          setShowModelDropdown(false)
                          navigate('/dz-agent')
                          return
                        }
                        setSelectedModel(model.id)
                        setShowModelDropdown(false)
                        const modelChats = chats.filter(c => c.modelId === model.id)
                        if (modelChats.length > 0) {
                          setActiveChatId(modelChats[0].id)
                        } else {
                          setActiveChatId(null)
                        }
                      }}
                    >
                      {model.id === 'dz-agent'
                        ? <span className="dz-free-blink" style={{ fontSize: '10px' }}>Free</span>
                        : <span className="input-model-dot" style={{ background: model.color }} />
                      }
                      <span>{model.name}</span>
                    </button>
                  ))}
                  <button
                    className="input-model-option"
                    onClick={() => { setShowModelDropdown(false); navigate('/quran') }}
                  >
                    <span>📖</span>
                    <span>القرآن الكريم</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="input-container">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${currentModel.name}...`}
              rows={1}
              className="chat-input"
            />
            <div className="input-actions">
              {isLoading ? (
                <button className="stop-btn" onClick={stopGeneration}>
                  Stop
                </button>
              ) : (
                <button
                  className="send-btn"
                  onClick={() => sendMessage()}
                  disabled={!input.trim()}
                  style={input.trim() ? { background: currentModel.color } : undefined}
                >
                  <Send size={18} />
                </button>
              )}
            </div>
          </div>
          <p className="disclaimer">
            {currentModel.name} can make mistakes. Check important info.
          </p>
        </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      {/* PWA Install Banner */}
      <PwaInstallBanner />

      {/* Privacy Toast */}
      <PrivacyToast />

    </div>
  )
}

export default App
