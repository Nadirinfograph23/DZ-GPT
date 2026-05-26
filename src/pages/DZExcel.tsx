import { useState, useRef, useEffect, useCallback } from 'react'
import {
  FileSpreadsheet, Send, Loader2, Sparkles, ChevronDown,
  ChevronRight, Download, Trash2, CheckCircle2, AlertCircle,
  LayoutTemplate, Bot, List, X, ChevronUp, Upload, FileUp,
} from 'lucide-react'
import '../styles/dz-excel.css'

interface AiMessage {
  role: 'user' | 'assistant'
  text: string
  action?: string
  importInfo?: ImportInfo
}

interface ImportInfo {
  name: string
  rows: number
  cols: number
  headers: string[]
  sheets: string[]
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

const AI_FUNCTIONS = [
  {
    cat: '📐 معادلات Excel',
    items: [
      { label: 'SUM — مجموع نطاق',         p: 'أضف معادلة SUM في آخر صف لحساب مجموع كل عمود رقمي' },
      { label: 'AVERAGE — المتوسط',         p: 'أضف صف المتوسطات أسفل الجدول باستخدام AVERAGE' },
      { label: 'IF — شرط منطقي',            p: 'أضف عمود الحالة: إذا كانت القيمة ≥ 50 اكتب "ناجح" وإلا "راسب"' },
      { label: 'COUNTIF — عدّ شرطي',        p: 'أضف عمود يعدّ تكرار كل قيمة في الجدول باستخدام COUNTIF' },
      { label: 'SUMIF — مجموع شرطي',        p: 'احسب مجموع المبيعات لكل فئة على حدة باستخدام SUMIF' },
      { label: 'MAX / MIN — أعلى وأدنى',   p: 'أضف صفاً يظهر أعلى وأدنى قيمة في كل عمود رقمي' },
      { label: 'ROUND — تقريب',             p: 'قرّب كل الأعداد العشرية في الجدول إلى منزلتين باستخدام ROUND' },
      { label: 'معادلة مخصصة...',           p: 'أضف المعادلة التالية: ' },
    ],
  },
  {
    cat: '📋 إنشاء الجداول',
    items: [
      { label: 'جدول مخزون',               p: 'أنشئ جدول مخزون: رمز المنتج، الاسم، الكمية، سعر الشراء، سعر البيع، الربح' },
      { label: 'فاتورة بيع',               p: 'أنشئ فاتورة بيع احترافية: رقم الفاتورة، التاريخ، الزبون، البنود، الكميات، الأسعار، الإجمالي' },
      { label: 'كشف رواتب',               p: 'أنشئ كشف رواتب: الاسم، الوظيفة، الراتب الأساسي، العلاوات، الخصومات، الصافي' },
      { label: 'كشف نقاط الطلاب',        p: 'أنشئ جدول نقاط: أسماء الطلاب، المواد، الدرجات، المعدل، الترتيب' },
      { label: 'ميزانية مشروع',           p: 'أنشئ ميزانية مشروع: البنود، التكلفة المتوقعة، الفعلية، الفرق، النسبة المئوية' },
      { label: 'جدول متابعة المهام',      p: 'أنشئ جدول مهام: المهمة، المسؤول، تاريخ البدء، الموعد النهائي، الحالة، الأولوية' },
      { label: 'قائمة الزبائن',           p: 'أنشئ جدول زبائن: الاسم، الهاتف، البريد، العنوان، تاريخ آخر تعامل، إجمالي المشتريات' },
    ],
  },
  {
    cat: '🎨 التنسيق والتلوين',
    items: [
      { label: 'لوّن رأس الجدول',             p: 'لوّن صف الرأس باللون الأزرق الداكن مع نص أبيض عريض ومُوسَّط' },
      { label: 'تناوب ألوان الصفوف (Zebra)',  p: 'طبّق تنسيق zebra: صفوف فردية بيضاء وزوجية رمادية فاتحة' },
      { label: 'تلوين شرطي حسب القيمة',      p: 'لوّن الخلايا تلقائياً: أحمر إذا < 0، أخضر إذا > 0، أصفر إذا = 0' },
      { label: 'تمييز أعلى قيمة',             p: 'ميّز الصف ذا أعلى قيمة إجمالية باللون الذهبي والخط العريض' },
      { label: 'تنسيق أعمدة الأسعار',         p: 'نسّق كل أعمدة المبالغ: فاصلة آلاف، منزلتان عشريتان، رمز DA' },
      { label: 'حدود واضحة للجدول',           p: 'أضف حدوداً واضحة لكل الخلايا وضبط عرض الأعمدة تلقائياً' },
    ],
  },
  {
    cat: '⚡ Macros وإجراءات',
    items: [
      { label: 'ترتيب تصاعدي',               p: 'رتّب الجدول تصاعدياً حسب العمود الأول بـ Macro' },
      { label: 'إضافة صف الإجماليات',        p: 'أضف صف الإجماليات في آخر الجدول: مجموع كل عمود رقمي' },
      { label: 'حذف الصفوف المكررة',         p: 'احذف تلقائياً الصفوف المكررة بناءً على قيمة العمود الأول' },
      { label: 'تعبئة تسلسل أرقام',          p: 'عبّئ عمود الرقم التسلسلي من 1 حتى آخر صف بيانات' },
      { label: 'حذف الصفوف الفارغة',         p: 'احذف كل الصفوف الفارغة أو شبه الفارغة من الجدول' },
      { label: 'إعادة حساب كل المعادلات',   p: 'أعد حساب وتحديث كل المعادلات والإجماليات في الجدول' },
    ],
  },
  {
    cat: '✅ عناصر تفاعلية',
    items: [
      { label: 'خانات تأشير Checkbox',        p: 'أضف عمود خانات تأشير في بداية الجدول لتحديد الصفوف' },
      { label: 'قائمة منسدلة Dropdown',       p: 'أضف قائمة منسدلة في عمود الحالة: "قيد التنفيذ" | "مكتمل" | "ملغي" | "معلق"' },
      { label: 'زر Macro وظيفي',             p: 'أضف زر "🔄 تحديث الإجماليات" يعيد حساب كل الأعمدة الرقمية عند الضغط' },
      { label: 'تفعيل الفلتر التلقائي',       p: 'فعّل الفلتر التلقائي لكل أعمدة الجدول لتمكين التصفية والبحث' },
      { label: 'مؤشر تقدم بالألوان',         p: 'أضف عمود مؤشر تقدم ملوّن: أحمر 0-33%، أصفر 34-66%، أخضر 67-100%' },
    ],
  },
  {
    cat: '📊 المخططات البيانية',
    items: [
      { label: 'مخطط أعمدة',                p: 'أنشئ مخطط أعمدة يقارن بين أعمدة الجدول الرئيسية' },
      { label: 'مخطط خطي',                  p: 'أنشئ مخطط خطي يظهر تطور القيم والاتجاهات عبر الزمن' },
      { label: 'مخطط دائري',                p: 'أنشئ مخطط دائري يظهر توزيع الفئات بالنسب المئوية' },
      { label: 'مخطط شريطي أفقي',           p: 'أنشئ مخطط شريطي أفقي لمقارنة الأداء بين العناصر' },
    ],
  },
]

export default function DZExcel() {
  const iframeRef  = useRef<HTMLIFrameElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const fnPanelRef = useRef<HTMLDivElement>(null)

  const [ready,          setReady]          = useState(false)
  const [messages,       setMessages]       = useState<AiMessage[]>([{
    role: 'assistant',
    text: 'مرحباً! أنا مساعدك في DZ Excel 📊\n\nيمكنني:\n• إنشاء قوالب جاهزة (مخزون، فواتير، رواتب...)\n• كتابة معادلات Excel (SUM، IF، COUNTIF...)\n• تشغيل Macros لتعبئة البيانات تلقائياً\n• إنشاء مخططات بيانية ملوّنة\n• تنسيق الجداول وإضافة عناصر تفاعلية\n\nاضغط زر ⚡ دوال الوكيل لاستعراض كل القدرات!',
  }])
  const [input,          setInput]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [sideOpen,       setSideOpen]       = useState(true)
  const [activeTab,      setActiveTab]      = useState<'ai'|'templates'>('ai')
  const [macroLog,       setMacroLog]       = useState<string[]>([])
  const [showLog,        setShowLog]        = useState(false)
  const [lastAction,     setLastAction]     = useState<string | null>(null)
  const [showFunctions,  setShowFunctions]  = useState(false)
  const [activeFnCat,    setActiveFnCat]    = useState(0)
  const [miniPlayerActive, setMiniPlayerActive] = useState(false)

  // ── Detect mini player ──
  useEffect(() => {
    const check = () => setMiniPlayerActive(document.body.classList.contains('dz-mini-active'))
    const observer = new MutationObserver(check)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    check()
    return () => observer.disconnect()
  }, [])

  // ── Close functions panel on outside click ──
  useEffect(() => {
    if (!showFunctions) return
    const handler = (e: MouseEvent) => {
      if (fnPanelRef.current && !fnPanelRef.current.contains(e.target as Node)) {
        setShowFunctions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFunctions])

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
      if (msg.type === 'chartCreated') {
        setMacroLog(p => [...p, `📊 مخطط "${msg.title || msg.chartType}" جاهز`])
        setLastAction('macro_ok')
        setShowLog(true)
      }
      if (msg.type === 'fileImported') {
        const info: ImportInfo = {
          name: msg.name || 'ملف',
          rows: msg.rows || 0,
          cols: msg.cols || 0,
          headers: msg.headers || [],
          sheets: msg.sheets || [],
        }
        setActiveTab('ai')
        setSideOpen(true)
        setMessages(p => [...p, {
          role: 'assistant',
          text: `✅ تم استيراد **${info.name}** بنجاح!\n\n📊 ${info.rows} صف × ${info.cols} عمود`,
          action: 'import',
          importInfo: info,
        }])
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
    headers?: string[]; macro?: string; templateName?: string;
    theme?: string; autoChart?: object;
    chartType?: string; labels?: unknown[]; datasets?: unknown[]; title?: string;
  }) => {
    const action = d.action || 'answer'
    setLastAction(action)

    if ((action === 'template' || action === 'data') && d.rows) {
      postToSheet({
        action: 'loadData',
        rows: d.rows,
        headers: d.headers,
        theme: d.theme || 'blue',
        autoChart: d.autoChart || null,
      })
      const name = d.templateName || 'البيانات'
      setMessages(p => [...p, {
        role: 'assistant',
        text: `✅ تم تحميل قالب **${name}** في الجدول بتنسيق احترافي!\n\n${d.message || ''}`,
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
    } else if (action === 'chart') {
      postToSheet({
        action: 'createChart',
        chartType: d.chartType || 'bar',
        labels: d.labels || [],
        datasets: d.datasets || [],
        title: d.title || 'مخطط',
      })
      setMessages(p => [...p, {
        role: 'assistant',
        text: `📊 تم إنشاء المخطط!\n\n${d.message || ''}`,
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
      postToSheet({ action: 'getData' })
      await new Promise(r => setTimeout(r, 300))

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

  const triggerImport = () => {
    iframeRef.current?.contentWindow?.document
      .getElementById('btn-import')?.dispatchEvent(new MouseEvent('click'))
  }

  const sendImportAnalysis = (prompt: string) => {
    setInput(prompt)
    setActiveTab('ai')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const pickFnItem = (prompt: string) => {
    setInput(prompt)
    setShowFunctions(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className={`dzxl-layout${miniPlayerActive ? ' dzxl-mini-active' : ''}`}>

      {/* ── TOP BAR ── */}
      <header className="dzxl-topbar">
        <div className="dzxl-topbar-left">
          <FileSpreadsheet size={20} className="dzxl-topbar-icon" />
          <span className="dzxl-topbar-title">DZ Excel</span>
          <span className="dzxl-topbar-sub">محرر جداول بيانات ذكي</span>
          {ready && <span className="dzxl-ready-dot" title="جاهز" />}
        </div>
        <div className="dzxl-topbar-actions">
          <button className="dzxl-tb-btn dzxl-tb-btn--import" onClick={triggerImport} title="استيراد ملف Excel أو CSV">
            <Upload size={14} /> استيراد
          </button>
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
                        {m.action === 'import' && m.importInfo && (
                          <div className="dzxl-import-card">
                            <div className="dzxl-import-card-header">
                              <FileUp size={14} className="dzxl-import-card-icon" />
                              <span className="dzxl-import-card-name">{m.importInfo.name}</span>
                            </div>
                            {m.importInfo.headers.length > 0 && (
                              <div className="dzxl-import-card-headers">
                                {m.importInfo.headers.slice(0, 6).map((h, hi) => (
                                  <span key={hi} className="dzxl-import-card-header-chip">{h}</span>
                                ))}
                                {m.importInfo.headers.length > 6 && (
                                  <span className="dzxl-import-card-header-chip dzxl-import-card-header-chip--more">
                                    +{m.importInfo.headers.length - 6}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="dzxl-import-card-label">ماذا تريد أن أفعل بهذا الملف؟</div>
                            <div className="dzxl-import-quick-btns">
                              {[
                                { icon: '📊', label: 'تحليل البيانات', p: 'حلّل البيانات الموجودة في الجدول وأعطني ملخصاً إحصائياً' },
                                { icon: '🔢', label: 'إضافة المعادلات', p: 'أضف معادلات SUM وAVERAGE وMAX وMIN لكل عمود رقمي' },
                                { icon: '📈', label: 'إنشاء مخطط', p: 'أنشئ مخططاً بيانياً يمثل البيانات الموجودة في الجدول' },
                                { icon: '🎨', label: 'تنسيق احترافي', p: 'نسّق الجدول بتنسيق احترافي ملون مع تمييز الرأس' },
                                { icon: '🔍', label: 'كشف مشاكل', p: 'ابحث عن الخلايا الفارغة أو القيم الشاذة أو الأخطاء في الجدول' },
                              ].map((btn, bi) => (
                                <button
                                  key={bi}
                                  className="dzxl-import-quick-btn"
                                  onClick={() => sendImportAnalysis(btn.p)}
                                >
                                  <span>{btn.icon}</span> {btn.label}
                                </button>
                              ))}
                            </div>
                          </div>
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

                {/* ── AI FUNCTIONS PANEL ── */}
                {showFunctions && (
                  <div className="dzxl-fn-panel" ref={fnPanelRef}>
                    <div className="dzxl-fn-header">
                      <span className="dzxl-fn-title">⚡ دوال وقدرات الوكيل</span>
                      <button className="dzxl-fn-close" onClick={() => setShowFunctions(false)}>
                        <X size={13} />
                      </button>
                    </div>
                    {/* Category tabs */}
                    <div className="dzxl-fn-cats">
                      {AI_FUNCTIONS.map((g, i) => (
                        <button
                          key={i}
                          className={`dzxl-fn-cat-btn ${activeFnCat === i ? 'active' : ''}`}
                          onClick={() => setActiveFnCat(i)}
                        >
                          {g.cat.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                    {/* Items */}
                    <div className="dzxl-fn-items">
                      <div className="dzxl-fn-cat-label">{AI_FUNCTIONS[activeFnCat].cat}</div>
                      {AI_FUNCTIONS[activeFnCat].items.map((item, j) => (
                        <button
                          key={j}
                          className="dzxl-fn-item"
                          onClick={() => pickFnItem(item.p)}
                        >
                          <span className="dzxl-fn-item-label">{item.label}</span>
                          <ChevronRight size={11} className="dzxl-fn-item-arr" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Toolbar row — functions button */}
                <div className="dzxl-toolbar">
                  <button
                    className={`dzxl-fn-toggle-btn ${showFunctions ? 'active' : ''}`}
                    onClick={() => setShowFunctions(p => !p)}
                    title="دوال وقدرات الوكيل"
                  >
                    <List size={13} />
                    <span>دوال الوكيل</span>
                    {showFunctions ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
                  </button>
                </div>

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
                    placeholder={'مثال: أضف عمود الإجمالي = الكمية × السعر\nمثال: أنشئ فاتورة للزبون أحمد'}
                    rows={2}
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
