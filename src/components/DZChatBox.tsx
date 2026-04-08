import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Bot, Copy, Check, RotateCcw, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

// ===== TYPES =====
interface DZMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// ===== HELPERS =====
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

// ===== CODE BLOCK =====
function DZCodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const language = className?.replace('language-', '') || ''
  const codeText = String(children).replace(/\n$/, '')

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="dz-code-block">
      <div className="dz-code-block-header">
        <span className="dz-code-lang">{language || 'code'}</span>
        <button className="dz-code-copy-btn" onClick={handleCopy}>
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code className={className}>{children}</code></pre>
    </div>
  )
}

// ===== TYPING EFFECT =====
function TypingEffect({ text, onDone }: { text: string; onDone: () => void }) {
  const [displayed, setDisplayed] = useState('')
  const indexRef = useRef(0)

  useEffect(() => {
    indexRef.current = 0
    setDisplayed('')
    const interval = setInterval(() => {
      indexRef.current++
      setDisplayed(text.slice(0, indexRef.current))
      if (indexRef.current >= text.length) {
        clearInterval(interval)
        onDone()
      }
    }, 8)
    return () => clearInterval(interval)
  }, [text, onDone])

  return <span>{displayed}</span>
}

// ===== MAIN COMPONENT =====
export default function DZChatBox() {
  const [messages, setMessages] = useState<DZMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [typingId, setTypingId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + 'px'
    }
  }, [input])

  const copyMessage = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return

    const userMessage: DZMessage = {
      id: generateId(),
      role: 'user',
      content: input.trim(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      abortRef.current = new AbortController()
      const response = await fetch('/api/dz-agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.error || `Server error: ${response.status}`)
      }

      const data = await response.json()
      const assistantId = generateId()
      const assistantMessage: DZMessage = {
        id: assistantId,
        role: 'assistant',
        content: data.content || 'No response generated.',
      }
      setMessages(prev => [...prev, assistantMessage])
      setTypingId(assistantId)
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return
      const errMsg: DZMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'Sorry, an error occurred. Please try again.',
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [input, isLoading, messages])

  const regenerate = useCallback(async () => {
    if (messages.length < 2 || isLoading) return

    const messagesWithoutLast = messages.slice(0, -1)
    setMessages(messagesWithoutLast)
    setIsLoading(true)

    try {
      abortRef.current = new AbortController()
      const response = await fetch('/api/dz-agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesWithoutLast.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) throw new Error('Server error')

      const data = await response.json()
      const assistantId = generateId()
      const assistantMessage: DZMessage = {
        id: assistantId,
        role: 'assistant',
        content: data.content || 'No response generated.',
      }
      setMessages([...messagesWithoutLast, assistantMessage])
      setTypingId(assistantId)
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return
      setMessages([...messagesWithoutLast, {
        id: generateId(),
        role: 'assistant',
        content: 'Sorry, an error occurred. Please try again.',
      }])
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [messages, isLoading])

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

  const clearChat = () => {
    abortRef.current?.abort()
    setMessages([])
    setIsLoading(false)
    setTypingId(null)
  }

  return (
    <div className="dz-chatbox">
      {/* Messages */}
      <div className="dz-messages">
        {messages.length === 0 && (
          <div className="dz-welcome">
            <div className="dz-welcome-icon">
              <Bot size={40} />
            </div>
            <h2 className="dz-welcome-title">DZ Agent</h2>
            <p className="dz-welcome-sub">مساعد ذكاء اصطناعي متعدد اللغات · Multilingual AI Assistant</p>
            <div className="dz-suggestions">
              {[
                'من هو مطورك؟',
                'Who is your developer?',
                'Qui est votre développeur?',
                'What can you help me with?',
              ].map((s, i) => (
                <button key={i} className="dz-suggestion-btn" onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`dz-message dz-message--${msg.role}`}>
            <div className="dz-message-avatar">
              {msg.role === 'user' ? (
                <div className="dz-avatar dz-avatar--user">U</div>
              ) : (
                <div className="dz-avatar dz-avatar--bot">
                  <Sparkles size={15} />
                </div>
              )}
            </div>
            <div className="dz-message-body">
              <div className="dz-message-sender">
                {msg.role === 'user' ? 'You' : 'DZ Agent'}
              </div>
              <div className="dz-message-text">
                {msg.role === 'assistant' ? (
                  typingId === msg.id ? (
                    <TypingEffect text={msg.content} onDone={() => setTypingId(null)} />
                  ) : (
                    <ReactMarkdown
                      components={{
                        code({ className, children, ...props }) {
                          const isBlock = className?.startsWith('language-')
                          if (isBlock) return <DZCodeBlock className={className}>{children}</DZCodeBlock>
                          return <code className={className} {...props}>{children}</code>
                        },
                        pre({ children }) { return <>{children}</> },
                      }}
                    >{msg.content}</ReactMarkdown>
                  )
                ) : (
                  msg.content
                )}
              </div>
              {msg.role === 'assistant' && (
                <div className="dz-message-actions">
                  <button className="dz-action-btn" onClick={() => copyMessage(msg.id, msg.content)}>
                    {copiedId === msg.id ? <Check size={13} /> : <Copy size={13} />}
                    {copiedId === msg.id ? 'Copied' : 'Copy'}
                  </button>
                  {msg.id === messages[messages.length - 1]?.id && (
                    <button className="dz-action-btn" onClick={regenerate}>
                      <RotateCcw size={13} />
                      Regenerate
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="dz-message dz-message--assistant">
            <div className="dz-message-avatar">
              <div className="dz-avatar dz-avatar--bot">
                <Sparkles size={15} />
              </div>
            </div>
            <div className="dz-message-body">
              <div className="dz-message-sender">DZ Agent</div>
              <div className="dz-typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="dz-input-area">
        {messages.length > 0 && (
          <button className="dz-clear-btn" onClick={clearChat} title="Clear chat">
            Clear chat
          </button>
        )}
        <div className="dz-input-container">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message DZ Agent..."
            rows={1}
            className="dz-chat-input"
          />
          <div className="dz-input-actions">
            {isLoading ? (
              <button className="dz-stop-btn" onClick={stopGeneration}>Stop</button>
            ) : (
              <button
                className="dz-send-btn"
                onClick={sendMessage}
                disabled={!input.trim()}
              >
                <Send size={18} />
              </button>
            )}
          </div>
        </div>
        <p className="dz-disclaimer">DZ Agent can make mistakes. Check important info.</p>
      </div>
    </div>
  )
}
