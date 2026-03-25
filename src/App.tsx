import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, Sparkles, Plus, Trash2, Menu, X, MessageSquare, Copy, Check, RotateCcw, Settings, ExternalLink } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import './App.css'

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

interface ApiConfig {
  apiKey: string
  apiUrl: string
  provider: string
}

// ===== AI MODELS =====
const AI_MODELS = [
  { id: 'openai', name: 'ChatGPT 4o Mini', color: '#10a37f' },
  { id: 'openai-large', name: 'ChatGPT 5 Nano', color: '#6366f1' },
  { id: 'gemini', name: 'Gemini', color: '#4285f4' },
  { id: 'deepseek', name: 'DeepSeek', color: '#00d4aa' },
  { id: 'claude', name: 'Claude', color: '#d97706' },
  { id: 'mistral', name: 'xAI: Grok', color: '#8b5cf6' },
  { id: 'llama', name: 'Meta AI', color: '#0668E1' },
  { id: 'qwen', name: 'Qwen', color: '#7c3aed' },
]

// Model mapping for different providers
const GROQ_MODEL_MAP: Record<string, string> = {
  'openai': 'llama-3.3-70b-versatile',
  'openai-large': 'llama-3.1-8b-instant',
  'gemini': 'gemma2-9b-it',
  'deepseek': 'deepseek-r1-distill-llama-70b',
  'claude': 'llama-3.3-70b-versatile',
  'mistral': 'mixtral-8x7b-32768',
  'llama': 'llama-3.3-70b-versatile',
  'qwen': 'qwen-qwq-32b',
}

// ===== HELPERS =====
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

// ===== API =====
async function fetchAIResponse(
  messages: { role: string; content: string }[],
  modelId: string,
  config: ApiConfig | null,
  signal?: AbortSignal
): Promise<string> {
  // Try server-side API route first (works on Vercel with env vars)
  try {
    const serverResponse = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model: modelId }),
      signal,
    })

    if (serverResponse.ok) {
      const data = await serverResponse.json()
      return data.content
    }

    // If server returns 500 with "not configured" message, fall through to client-side
    const errorData = await serverResponse.json().catch(() => null)
    if (errorData?.error?.includes('not configured')) {
      // Fall through to client-side API
    } else if (serverResponse.status !== 404) {
      throw new Error(errorData?.error || `Server error: ${serverResponse.status}`)
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    // Server route not available, try client-side
  }

  // Client-side API call with user-provided key
  if (!config?.apiKey) {
    throw new Error('NO_API_KEY')
  }

  const actualModel = config.provider === 'groq'
    ? (GROQ_MODEL_MAP[modelId] || modelId)
    : modelId

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: actualModel,
      messages,
      max_tokens: 4096,
      temperature: 0.7,
    }),
    signal,
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => null)
    throw new Error(errData?.error?.message || `API error: ${response.status}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || 'No response generated.'
}

// ===== COMPONENT =====
function App() {
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
  const [showSettings, setShowSettings] = useState(false)
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    const saved = localStorage.getItem('dz-gpt-api-config')
    if (saved) {
      try { return JSON.parse(saved) } catch { /* ignore */ }
    }
    return { apiKey: '', apiUrl: 'https://api.groq.com/openai/v1/chat/completions', provider: 'groq' }
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const activeChat = chats.find(c => c.id === activeChatId) || null

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('dz-gpt-chats', JSON.stringify(chats))
  }, [chats])

  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem('dz-gpt-active-chat', activeChatId)
    }
  }, [activeChatId])

  // Persist API config
  useEffect(() => {
    localStorage.setItem('dz-gpt-api-config', JSON.stringify(apiConfig))
  }, [apiConfig])

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

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return

    let currentChatId = activeChatId
    let currentChats = chats

    if (!currentChatId) {
      const newChat: Chat = {
        id: generateId(),
        title: input.trim().substring(0, 60),
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
      content: input.trim(),
    }

    const updatedChats = currentChats.map(c => {
      if (c.id === currentChatId) {
        return {
          ...c,
          messages: [...c.messages, userMessage],
          title: c.messages.length === 0 ? input.trim().substring(0, 60) : c.title,
          modelId: selectedModel,
        }
      }
      return c
    })
    setChats(updatedChats)
    setInput('')
    setIsLoading(true)

    const chat = updatedChats.find(c => c.id === currentChatId)!
    const modelName = AI_MODELS.find(m => m.id === selectedModel)?.name || 'AI'
    const apiMessages = [
      { role: 'system', content: `You are ${modelName}, a helpful and knowledgeable AI assistant. Provide clear, accurate, and well-formatted responses. Use markdown formatting when appropriate.` },
      ...chat.messages.map(m => ({ role: m.role, content: m.content })),
    ]

    try {
      abortRef.current = new AbortController()
      const response = await fetchAIResponse(apiMessages, selectedModel, apiConfig, abortRef.current.signal)

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
      if (error instanceof Error && error.message === 'NO_API_KEY') {
        setShowSettings(true)
        setIsLoading(false)
        return
      }
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
  }, [input, isLoading, activeChatId, chats, selectedModel, apiConfig])

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
    const apiMessages = [
      { role: 'system', content: `You are ${modelName}, a helpful and knowledgeable AI assistant. Provide clear, accurate, and well-formatted responses. Use markdown formatting when appropriate.` },
      ...messagesWithoutLast.map(m => ({ role: m.role, content: m.content })),
    ]

    try {
      abortRef.current = new AbortController()
      const response = await fetchAIResponse(apiMessages, selectedModel, apiConfig, abortRef.current.signal)

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
      if (error instanceof Error && error.message === 'NO_API_KEY') {
        setShowSettings(true)
        setIsLoading(false)
        return
      }
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
  }, [activeChat, activeChatId, isLoading, selectedModel, apiConfig])

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
            <span className="logo-text">DZ GPT</span>
          </div>
          <button className="icon-btn" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <button className="new-chat-btn" onClick={createNewChat}>
          <Plus size={18} />
          <span>New Chat</span>
        </button>

        <div className="chat-list">
          {chats.map(chat => (
            <div
              key={chat.id}
              className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
              onClick={() => {
                setActiveChatId(chat.id)
                setSelectedModel(chat.modelId)
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
          {chats.length === 0 && (
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
              <span className="logo-text">DZ GPT</span>
            </div>
          </div>

          <div className="model-tabs-wrapper">
            <div className="model-tabs">
              {AI_MODELS.map(model => (
                <button
                  key={model.id}
                  className={`model-tab ${selectedModel === model.id ? 'active' : ''}`}
                  onClick={() => setSelectedModel(model.id)}
                  style={selectedModel === model.id ? { borderColor: model.color, color: model.color } : {}}
                >
                  {model.name}
                </button>
              ))}
            </div>
          </div>

          <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings">
            <Settings size={18} />
          </button>
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
              <div className="suggestions">
                {[
                  'Write me a short story about space exploration',
                  'Explain quantum computing in simple terms',
                  'Help me write a Python function to sort a list',
                  'What are the best practices for web development?',
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    className="suggestion-btn"
                    onClick={() => setInput(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
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
                    <div className="message-text">
                      {message.role === 'assistant' ? (
                        <ReactMarkdown>{message.content}</ReactMarkdown>
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
                  onClick={sendMessage}
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

      {/* Settings Modal */}
      {showSettings && (
        <>
          <div className="overlay" onClick={() => setShowSettings(false)} />
          <div className="settings-modal">
            <div className="settings-header">
              <h2>API Settings</h2>
              <button className="icon-btn" onClick={() => setShowSettings(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="settings-body">
              <p className="settings-info">
                Configure your AI API key to start chatting. Get a free API key from one of these providers:
              </p>
              <div className="provider-links">
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="provider-link">
                  <span>Groq (Free)</span>
                  <ExternalLink size={14} />
                </a>
                <a href="https://enter.pollinations.ai" target="_blank" rel="noopener noreferrer" className="provider-link">
                  <span>Pollinations</span>
                  <ExternalLink size={14} />
                </a>
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="provider-link">
                  <span>OpenRouter</span>
                  <ExternalLink size={14} />
                </a>
              </div>

              <label className="settings-label">Provider</label>
              <select
                className="settings-select"
                value={apiConfig.provider}
                onChange={(e) => {
                  const provider = e.target.value
                  const urls: Record<string, string> = {
                    'groq': 'https://api.groq.com/openai/v1/chat/completions',
                    'pollinations': 'https://gen.pollinations.ai/v1/chat/completions',
                    'openrouter': 'https://openrouter.ai/api/v1/chat/completions',
                  }
                  setApiConfig(prev => ({ ...prev, provider, apiUrl: urls[provider] || prev.apiUrl }))
                }}
              >
                <option value="groq">Groq (Recommended - Free)</option>
                <option value="pollinations">Pollinations</option>
                <option value="openrouter">OpenRouter</option>
              </select>

              <label className="settings-label">API Key</label>
              <input
                type="password"
                className="settings-input"
                placeholder="Enter your API key..."
                value={apiConfig.apiKey}
                onChange={(e) => setApiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
              />

              <label className="settings-label">API URL</label>
              <input
                type="text"
                className="settings-input"
                value={apiConfig.apiUrl}
                onChange={(e) => setApiConfig(prev => ({ ...prev, apiUrl: e.target.value }))}
              />

              <button
                className="settings-save-btn"
                onClick={() => setShowSettings(false)}
              >
                Save & Close
              </button>

              <p className="settings-note">
                For production deployment on Vercel, set the <code>AI_API_KEY</code> environment variable instead.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default App
