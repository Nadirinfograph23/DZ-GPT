import { useState, useRef, useEffect, useCallback } from 'react'
import {
  FileSpreadsheet, Send, Loader2, Sparkles, ChevronDown,
  ChevronRight, Download, Trash2, CheckCircle2, AlertCircle,
  LayoutTemplate, Bot
} from 'lucide-react'
import '../styles/dz-excel.css'

interface AiMessage {
  role: 'user' | 'assistant'
  text: string
  action?: string
}

interface Template {
  id: string
  label: string
  icon: string
  desc: string
}

const TEMPLATES: Template[] = [
  { id: 'inventory',  label: 'تسيير المخزون',        icon: '📦', desc: 'منتجات، كميات، أسعار الشراء والبيع' },
  { id: 'invoice',    label: 'فاتورة بيع',             icon: '🧾', desc: 'فاتورة مع رقم، تاريخ، زبون وإجمالي' },
  { id: 'payroll',    label: 'كشف الرواتب',            icon: '💰', desc: 'موظفون، راتب أساسي، علاوات، صافي' },
  { id: 'hr',         label: 'الموارد البشرية',        icon: '👥', desc: 'ملف الموظفين والوظائف والمعلومات' },
  { id: 'leave',      label: 'إدارة العطل',            icon: '🏖️', desc: 'طلبات العطل وأرصدة كل موظف' },
  { id: 'tasks',      label: 'تكليف بمهمة',           icon: '📋', desc: 'مهام، مسؤولون، مواعيد نهائية' },
  { id: 'grades',     label: 'كشف النقاط',            icon: '📝', desc: 'طلاب، مواد، درجات، معدل' },
  { id: 'customers',  label: 'قائمة الزبائن',         icon: '🤝', desc: 'بيانات الزبائن والمعاملات' },
  { id: 'budget',     label: 'ميزانية المشروع',        icon: '📊', desc: 'بنود الإيرادات والمصروفات' },
  { id: 'schedule',   label: 'جدول أعمال أسبوعي',    icon: '🗓️', desc: 'توزيع المهام على أيام الأسبوع' },
]

export default function DZExcel() {
  const iframeRef  = useRef<HTMLIFrameElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  const [ready,      setReady]      = useState(false)
  const [messages,   setMessages]   = useState<AiMessage[]>([{
    role: 'assistant',
    text: 'مرحباً! أنا مساعدك في DZ Excel 📊\n\nيمكنني:\n• إنشاء قوالب جاهزة (مخزون، فواتير، رواتب...)\n• كتابة معادلات Excel\n• تشغيل Macros لتعبئة البيانات تلقائياً\n• تحليل جدولك الحالي\n\nاختر قالباً أو اكتب طلبك!',
  }])
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [sideOpen,   setSideOpen]   = useState(true)
  const [activeTab,  setActiveTab]  = useState<'ai'|'templates'>('ai')
  const [macroLog,   setMacroLog]   = useState<string[]>([])
  const [showLog,    setShowLog]    = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)

  // ── Listen for messages from iframe ──
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data
      if (!msg) return
      if (msg.type === 'ready') setReady(true)
      if (msg.type === 'macroResult') {
        if (msg.ok) {
          setMacroLog(p => [...p, `✅ Macro نُفِّذ بنجاح`])
          setLastAction('macro_ok')
        } else {
          setMacroLog(p => [...p, `❌ خطأ في Macro: ${msg.error}`])
          setLastAction('macro_err')
        }
        setShowLog(true)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // ── Scroll chat to bottom ──
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message to iframe ──
  const postToSheet = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*')
  }, [])

  // ── Load template ──
  const loadTemplate = async (tpl: Template) => {
    setMessages(p => [...p, { role: 'user', text: `قالب: ${tpl.label}` }])
    setLoading(true)
    try {
      const res = await fetch('/api/dz-excel/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `أنشئ قالب ${tpl.label}: ${tpl.desc}`, type: tpl.id }),
      })
      const d = await res.json()
      handleAiResponse(d)
    } catch {
      setMessages(p => [...p, { role: 'assistant', text: 'حدث خطأ في الاتصال بالخادم.' }])
    } finally {
      setLoading(false)
    }
  }

  // ── Handle AI response ──
  const handleAiResponse = (d: {
    action?: string; message?: string; rows?: unknown[][];
    headers?: string[]; macro?: string; templateName?: string
  }) => {
    const action = d.action || 'answer'
    setLastAction(action)

    if ((action === 'template' || action === 'data') && d.rows) {
      postToSheet({ action: 'loadData', rows: d.rows, headers: d.headers })
      const name = d.templateName || 'البيانات'
      setMessages(p => [...p, {
        role: 'assistant',
        text: `✅ تم تحميل قالب **${name}** في الجدول — يمكنك التعديل مباشرة!\n\n${d.message || ''}`,
        action,
      }])
    } else if (action === 'macro' && d.macro) {
      const macroCode = d.macro
      setMacroLog(p => [...p, `▶ تشغيل macro:\n${macroCode.slice(0, 120)}...`])
      postToSheet({ action: 'runMacro', code: macroCode })
      setMessages(p => [...p, {
        role: 'assistant',
        text: `⚡ تم تشغيل الـ Macro!\n\n${d.message || ''}`,
        action,
      }])
    } else {
      setMessages(p => [...p, {
        role: 'assistant',
        text: d.message || 'تم.',
        action,
      }])
    }
  }

  // ── Send AI message ──
  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    setMessages(p => [...p, { role: 'user', text }])
    setInput('')
    setLoading(true)
    try {
      // Get current sheet data for context
      postToSheet({ action: 'getData' })
      await new Promise(r => setTimeout(r, 300)) // brief wait for response

      const res = await fetch('/api/dz-excel/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const d = await res.json()
      handleAiResponse(d)
    } catch {
      setMessages(p => [...p, { role: 'assistant', text: 'حدث خطأ في الاتصال.' }])
    } finally {
      setLoading(false)
    }
  }

  const exportSheet = () => {
    postToSheet({ action: 'export' })
    iframeRef.current?.contentWindow?.document
      .getElementById('btn-export')?.dispatchEvent(new MouseEvent('click'))
  }

  return (
    <div className="dzxl-layout">

      {/* ── TOP BAR ── */}
      <header className="dzxl-topbar">
        <div className="dzxl-topbar-left">
          <FileSpreadsheet size={20} className="dzxl-topbar-icon" />
          <span className="dzxl-topbar-title">DZ Excel</span>
          <span className="dzxl-topbar-sub">محرر جداول بيانات ذكي</span>
          {ready && <span className="dzxl-ready-dot" title="جاهز" />}
        </div>
        <div className="dzxl-topbar-actions">
          <button className="dzxl-tb-btn" onClick={exportSheet} title="تصدير Excel">
            <Download size={14} /> تصدير
          </button>
          <button
            className={`dzxl-tb-btn ${sideOpen ? 'active' : ''}`}
            onClick={() => setSideOpen(p => !p)}
            title="المساعد الذكي"
          >
            <Bot size={14} /> المساعد
          </button>
        </div>
      </header>

      {/* ── WORKSPACE ── */}
      <div className="dzxl-workspace">

        {/* ── SPREADSHEET IFRAME ── */}
        <div className="dzxl-sheet-area">
          {!ready && (
            <div className="dzxl-loading">
              <Loader2 size={28} className="dzxl-spin" />
              <span>جارٍ تحميل المحرر...</span>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src="/excel-editor.html"
            className="dzxl-iframe"
            title="DZ Excel Editor"
            style={{ opacity: ready ? 1 : 0 }}
          />
        </div>

        {/* ── SIDE PANEL ── */}
        {sideOpen && (
          <aside className="dzxl-side">

            {/* Tabs */}
            <div className="dzxl-tabs">
              <button
                className={`dzxl-tab ${activeTab === 'ai' ? 'active' : ''}`}
                onClick={() => setActiveTab('ai')}
              >
                <Sparkles size={13} /> المساعد
              </button>
              <button
                className={`dzxl-tab ${activeTab === 'templates' ? 'active' : ''}`}
                onClick={() => setActiveTab('templates')}
              >
                <LayoutTemplate size={13} /> القوالب
              </button>
            </div>

            {/* ── AI TAB ── */}
            {activeTab === 'ai' && (
              <>
                <div className="dzxl-chat">
                  {messages.map((m, i) => (
                    <div key={i} className={`dzxl-msg dzxl-msg--${m.role}`}>
                      {m.role === 'assistant' && (
                        <div className="dzxl-msg-avatar">
                          <Bot size={13} />
                        </div>
                      )}
                      <div className="dzxl-msg-bubble">
                        {m.text.split('\n').map((line, j) => (
                          <span key={j}>
                            {line.startsWith('•') ? <span className="dzxl-bullet">{line}</span> : line}
                            {j < m.text.split('\n').length - 1 && <br />}
                          </span>
                        ))}
                        {m.action === 'template' && (
                          <div className="dzxl-msg-tag">📋 قالب مُحمَّل</div>
                        )}
                        {m.action === 'macro' && (
                          <div className="dzxl-msg-tag" style={{ color: '#f9e2af' }}>⚡ Macro</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="dzxl-msg dzxl-msg--assistant">
                      <div className="dzxl-msg-avatar"><Bot size={13} /></div>
                      <div className="dzxl-msg-bubble dzxl-typing">
                        <span /><span /><span />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Macro log */}
                {macroLog.length > 0 && (
                  <div className="dzxl-log">
                    <button
                      className="dzxl-log-toggle"
                      onClick={() => setShowLog(p => !p)}
                    >
                      {showLog ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      سجل العمليات ({macroLog.length})
                      {lastAction === 'macro_ok' && <CheckCircle2 size={11} style={{ color: '#a6e3a1' }} />}
                      {lastAction === 'macro_err' && <AlertCircle size={11} style={{ color: '#f38ba8' }} />}
                    </button>
                    {showLog && (
                      <div className="dzxl-log-body">
                        {macroLog.slice(-5).map((l, i) => (
                          <div key={i} className="dzxl-log-line">{l}</div>
                        ))}
                        <button
                          className="dzxl-log-clear"
                          onClick={() => { setMacroLog([]); setShowLog(false); setLastAction(null); }}
                        >
                          <Trash2 size={10} /> مسح
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Chat input */}
                <div className="dzxl-input-wrap">
                  <textarea
                    ref={inputRef}
                    className="dzxl-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                    }}
                    placeholder={'مثال: أضف عمود الإجمالي = الكمية × السعر\nمثال: أنشئ فاتورة للزبون أحمد\nمثال: ما هي دالة حساب المعدل؟'}
                    rows={3}
                    disabled={loading}
                  />
                  <button
                    className="dzxl-send-btn"
                    onClick={sendMessage}
                    disabled={!input.trim() || loading}
                  >
                    {loading ? <Loader2 size={15} className="dzxl-spin" /> : <Send size={15} />}
                  </button>
                </div>
                <div className="dzxl-hint">Enter للإرسال · Shift+Enter لسطر جديد</div>
              </>
            )}

            {/* ── TEMPLATES TAB ── */}
            {activeTab === 'templates' && (
              <div className="dzxl-templates">
                <div className="dzxl-templates-title">
                  اختر قالباً جاهزاً ليتم تحميله في الجدول
                </div>
                {TEMPLATES.map(tpl => (
                  <button
                    key={tpl.id}
                    className="dzxl-tpl-btn"
                    onClick={() => { loadTemplate(tpl); setActiveTab('ai'); }}
                    disabled={loading}
                  >
                    <span className="dzxl-tpl-icon">{tpl.icon}</span>
                    <div className="dzxl-tpl-info">
                      <div className="dzxl-tpl-name">{tpl.label}</div>
                      <div className="dzxl-tpl-desc">{tpl.desc}</div>
                    </div>
                    <ChevronRight size={13} className="dzxl-tpl-arr" />
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
