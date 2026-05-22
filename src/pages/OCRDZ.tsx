import { useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Upload, Wand2, Loader2, CheckCircle, FileText, ImageIcon, Copy, Check, Download, X, MessageSquare } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import Tesseract from 'tesseract.js'
import '../styles/ocr-dz.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

// ===== LANGUAGE DETECTION =====
type OcrLang = { code: 'ar' | 'fr' | 'en'; label: string; flag: string }
function detectOCRLang(text: string): OcrLang | null {
  if (!text.trim()) return null
  const total = text.length
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length
  if (arabicChars / total > 0.15) return { code: 'ar', label: 'عربي', flag: '🇩🇿' }
  const frenchChars = (text.match(/[éèêëàâùûçœîïô]/gi) || []).length
  const frenchWords = (text.match(/\b(le|la|les|des|du|un|une|est|avec|dans|pour|que|qui)\b/gi) || []).length
  if (frenchChars / total > 0.02 || frenchWords >= 3) return { code: 'fr', label: 'Français', flag: '🇫🇷' }
  return { code: 'en', label: 'English', flag: '🇬🇧' }
}

// ===== AI CHAT ITEM =====
interface ChatItem {
  role: 'user' | 'assistant'
  content: string
}

export default function OCRDZ() {
  const navigate = useNavigate()

  const [ocrFile, setOcrFile]           = useState<File | null>(null)
  const [ocrRunning, setOcrRunning]     = useState(false)
  const [ocrCorrecting, setOcrCorrecting] = useState(false)
  const [ocrProgress, setOcrProgress]   = useState(0)
  const [ocrDisplayText, setOcrDisplayText] = useState('')
  const [pdfFileName, setPdfFileName]   = useState<string | null>(null)
  const [ocrCopied, setOcrCopied]       = useState(false)
  const [chatHistory, setChatHistory]   = useState<ChatItem[]>([])
  const [chatInput, setChatInput]       = useState('')
  const [chatLoading, setChatLoading]   = useState(false)
  const [activeTab, setActiveTab]       = useState<'ocr' | 'chat'>('ocr')
  const [correctLoading, setCorrectLoading] = useState(false)

  const ocrInputRef  = useRef<HTMLInputElement>(null)
  const chatEndRef   = useRef<HTMLDivElement>(null)

  const ocrLang = useMemo(() => detectOCRLang(ocrDisplayText), [ocrDisplayText])

  const wordCount = useMemo(() =>
    ocrDisplayText.trim().split(/\s+/).filter(Boolean).length, [ocrDisplayText])
  const charCount = ocrDisplayText.length
  const sentenceCount = useMemo(() =>
    ocrDisplayText.trim().split(/[.!?؟\n]+/).filter(Boolean).length, [ocrDisplayText])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setOcrFile(file)
    setOcrDisplayText('')
    setPdfFileName(null)
    setChatHistory([])
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
      setOcrDisplayText(rawText)
      setPdfFileName(ocrFile.name)

      // AI auto-correction
      let correctedText = rawText
      try {
        const r = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: `أنت متخصص في تنظيف النصوص المستخرجة عبر OCR. صحح الأخطاء الإملائية وأعد النص فقط بدون تعليقات.` },
              { role: 'user', content: `صحّح:\n\n${rawText.substring(0, 8000)}` }
            ],
            model: 'llama-70b'
          })
        })
        if (r.ok) {
          const d = await r.json()
          if (d.content) correctedText = d.content
        }
      } catch {}

      setOcrProgress(100)
      setOcrDisplayText(correctedText)
      setOcrFile(null)
    } catch (err) {
      console.error('[OCR]', err)
    } finally {
      setOcrRunning(false)
      setOcrCorrecting(false)
      setOcrProgress(0)
    }
  }, [ocrFile])

  const correctText = useCallback(async () => {
    if (!ocrDisplayText.trim() || correctLoading) return
    setCorrectLoading(true)
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: 'أنت متخصص في تصحيح النصوص. صحح وأرجع النص فقط.' },
            { role: 'user', content: `صحّح وحسّن:\n\n${ocrDisplayText.substring(0, 8000)}` }
          ],
          model: 'llama-70b'
        })
      })
      if (r.ok) {
        const d = await r.json()
        if (d.content) setOcrDisplayText(d.content)
      }
    } catch {}
    setCorrectLoading(false)
  }, [ocrDisplayText, correctLoading])

  const copyText = useCallback(async () => {
    if (!ocrDisplayText.trim() || ocrCopied) return
    try {
      await navigator.clipboard.writeText(ocrDisplayText)
    } catch {
      const el = document.getElementById('ocr-out') as HTMLTextAreaElement | null
      if (el) { el.select(); document.execCommand('copy') }
    }
    setOcrCopied(true)
    setTimeout(() => setOcrCopied(false), 2200)
  }, [ocrDisplayText, ocrCopied])

  const downloadText = useCallback(() => {
    if (!ocrDisplayText.trim()) return
    const base = pdfFileName ? pdfFileName.replace(/\.[^.]+$/, '') : 'ocr-text'
    const blob = new Blob([ocrDisplayText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${base}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }, [ocrDisplayText, pdfFileName])

  const sendChat = useCallback(async () => {
    const q = chatInput.trim()
    if (!q || chatLoading || !ocrDisplayText.trim()) return
    setChatInput('')
    const newHistory: ChatItem[] = [...chatHistory, { role: 'user', content: q }]
    setChatHistory(newHistory)
    setChatLoading(true)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: `أنت مساعد ذكي. النص المستخرج:\n\n${ocrDisplayText.substring(0, 6000)}` },
            ...newHistory.map(m => ({ role: m.role, content: m.content }))
          ],
          model: 'llama-70b'
        })
      })
      if (r.ok) {
        const d = await r.json()
        setChatHistory(h => [...h, { role: 'assistant', content: d.content || '...' }])
      }
    } catch {
      setChatHistory(h => [...h, { role: 'assistant', content: 'حدث خطأ، حاول مجدداً.' }])
    }
    setChatLoading(false)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }, [chatInput, chatLoading, ocrDisplayText, chatHistory])

  const resetAll = () => {
    setOcrFile(null)
    setOcrDisplayText('')
    setPdfFileName(null)
    setChatHistory([])
    setChatInput('')
    setActiveTab('ocr')
  }

  return (
    <div className="ocr-page" dir="rtl">
      {/* ===== HEADER ===== */}
      <header className="ocr-page-header">
        <button className="ocr-back-btn" onClick={() => navigate('/')} aria-label="رجوع">
          <ArrowRight size={18} />
          <span>رجوع</span>
        </button>
        <div className="ocr-page-title-group">
          <div className="ocr-page-icon-wrap">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
              <rect x="3" y="3" width="26" height="26" rx="4" stroke="currentColor" strokeWidth="2"/>
              <path d="M3 10h26M3 17h26M3 24h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
              <circle cx="25" cy="25" r="6" fill="#0a0a0f" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M23 25l1.5 1.5L27 23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="ocr-page-title">OCR DZ</span>
          <span className="ocr-page-badge">AI</span>
        </div>
        <div style={{ width: 80 }} />
      </header>

      {/* ===== BODY ===== */}
      <main className="ocr-page-body">

        {/* ===== NO FILE YET: UPLOAD ZONE ===== */}
        {!pdfFileName && !ocrRunning && !ocrCorrecting && !ocrFile && (
          <div className="ocr-upload-zone">
            <div className="ocr-upload-hero">
              <div className="ocr-upload-glow" />
              <div className="ocr-upload-icon-ring">
                <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40">
                  <rect x="6" y="6" width="36" height="36" rx="6" stroke="currentColor" strokeWidth="2.2"/>
                  <path d="M6 16h36M6 26h36M6 36h22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
                </svg>
              </div>
              <h2 className="ocr-upload-heading">استخراج النصوص بالذكاء الاصطناعي</h2>
              <p className="ocr-upload-sub">ارفع صورة أو ملف PDF ليتم استخراج النص وتصحيحه تلقائياً</p>
              <div className="ocr-feature-pills">
                <span>🔍 OCR دقيق</span>
                <span>✨ تصحيح بالـ AI</span>
                <span>💬 تحليل تفاعلي</span>
                <span>📥 تحميل .txt</span>
              </div>
            </div>
            <input
              ref={ocrInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              id="ocr-file-input"
            />
            <label htmlFor="ocr-file-input" className="ocr-upload-label">
              <Upload size={20} />
              <span>رفع ملف</span>
              <span className="ocr-upload-types">jpg · png · bmp · webp · tiff · pdf</span>
            </label>
          </div>
        )}

        {/* ===== FILE SELECTED — READY TO EXTRACT ===== */}
        {ocrFile && !ocrRunning && !ocrCorrecting && (
          <div className="ocr-file-preview">
            <div className="ocr-file-preview-icon">
              {ocrFile.type.startsWith('image/') ? <ImageIcon size={32} /> : <FileText size={32} />}
            </div>
            <div className="ocr-file-preview-info">
              <span className="ocr-file-preview-name">{ocrFile.name}</span>
              <span className="ocr-file-preview-size">{(ocrFile.size / 1024).toFixed(0)} KB</span>
            </div>
            <div className="ocr-file-preview-actions">
              <button className="ocr-extract-btn" onClick={runOCR}>
                <Wand2 size={16} />
                <span>استخراج النص</span>
              </button>
              <button className="ocr-cancel-btn" onClick={() => setOcrFile(null)}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ===== PROGRESS ===== */}
        {(ocrRunning || ocrCorrecting) && (
          <div className="ocr-progress-wrap">
            <Loader2 size={32} className="ocr-spin" />
            <p className="ocr-progress-label">
              {ocrRunning ? '🔍 جاري استخراج النص...' : '✨ جاري تصحيح النص بالذكاء الاصطناعي...'}
            </p>
            <div className="ocr-bar-track">
              <div className="ocr-bar-fill" style={{ width: `${ocrProgress}%` }} />
            </div>
            <span className="ocr-bar-pct">{ocrProgress}%</span>
          </div>
        )}

        {/* ===== RESULT ===== */}
        {pdfFileName && !ocrRunning && !ocrCorrecting && (
          <div className="ocr-result-wrap">
            {/* File info bar */}
            <div className="ocr-result-bar">
              <div className="ocr-result-bar-left">
                <CheckCircle size={16} className="ocr-result-check" />
                <span className="ocr-result-filename">{pdfFileName}</span>
              </div>
              <div className="ocr-result-bar-right">
                {ocrDisplayText && (
                  <div className="ocr-stats">
                    <span><strong>{wordCount.toLocaleString()}</strong> كلمة</span>
                    <span>·</span>
                    <span><strong>{charCount.toLocaleString()}</strong> حرف</span>
                    <span>·</span>
                    <span><strong>{sentenceCount.toLocaleString()}</strong> جملة</span>
                    {ocrLang && (
                      <span className={`ocr-lang-tag ocr-lang-${ocrLang.code}`}>
                        {ocrLang.flag} {ocrLang.label}
                      </span>
                    )}
                  </div>
                )}
                <button className="ocr-reset-btn" onClick={resetAll} title="ملف جديد">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Tab switcher */}
            <div className="ocr-tabs">
              <button
                className={`ocr-tab ${activeTab === 'ocr' ? 'active' : ''}`}
                onClick={() => setActiveTab('ocr')}
              >
                <FileText size={14} />
                النص المستخرج
              </button>
              <button
                className={`ocr-tab ${activeTab === 'chat' ? 'active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                <MessageSquare size={14} />
                محادثة النص
                {chatHistory.length > 0 && (
                  <span className="ocr-chat-badge">{Math.ceil(chatHistory.length / 2)}</span>
                )}
              </button>
            </div>

            {/* OCR TEXT TAB */}
            {activeTab === 'ocr' && (
              <div className="ocr-text-panel">
                <textarea
                  id="ocr-out"
                  className="ocr-textarea"
                  value={ocrDisplayText}
                  onChange={e => setOcrDisplayText(e.target.value)}
                  placeholder="سيظهر النص هنا..."
                  dir="auto"
                  spellCheck={false}
                />
                <div className="ocr-action-row">
                  <button
                    className="ocr-act-btn ocr-act-correct"
                    onClick={correctText}
                    disabled={!ocrDisplayText.trim() || correctLoading}
                  >
                    {correctLoading
                      ? <Loader2 size={14} className="ocr-spin-sm" />
                      : '✨'}
                    تصحيح
                  </button>
                  <button
                    className="ocr-act-btn ocr-act-chat"
                    onClick={() => setActiveTab('chat')}
                    disabled={!ocrDisplayText.trim()}
                  >
                    💬 محادثة
                  </button>
                  <button
                    className={`ocr-act-btn ocr-act-copy ${ocrCopied ? 'copied' : ''}`}
                    onClick={copyText}
                    disabled={!ocrDisplayText.trim()}
                  >
                    {ocrCopied ? <Check size={14} /> : <Copy size={14} />}
                    {ocrCopied ? 'تم!' : 'نسخ'}
                  </button>
                  <button
                    className="ocr-act-btn ocr-act-download"
                    onClick={downloadText}
                    disabled={!ocrDisplayText.trim()}
                  >
                    <Download size={14} />
                    .txt
                  </button>
                  <label htmlFor="ocr-file-input" className="ocr-act-btn ocr-act-new" title="ملف جديد">
                    <Upload size={14} />
                    ملف جديد
                  </label>
                  <input
                    ref={ocrInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="ocr-file-input"
                  />
                </div>
              </div>
            )}

            {/* CHAT TAB */}
            {activeTab === 'chat' && (
              <div className="ocr-chat-panel">
                <div className="ocr-chat-messages">
                  {chatHistory.length === 0 && (
                    <div className="ocr-chat-empty">
                      <MessageSquare size={28} opacity={0.3} />
                      <p>اطرح سؤالاً حول النص المستخرج</p>
                    </div>
                  )}
                  {chatHistory.map((m, i) => (
                    <div key={i} className={`ocr-chat-msg ocr-chat-msg--${m.role}`}>
                      <div className="ocr-chat-bubble">{m.content}</div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="ocr-chat-msg ocr-chat-msg--assistant">
                      <div className="ocr-chat-bubble ocr-chat-bubble--loading">
                        <span /><span /><span />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="ocr-chat-input-row">
                  <input
                    className="ocr-chat-input"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }}}
                    placeholder="اسأل عن النص..."
                    disabled={chatLoading}
                    dir="auto"
                  />
                  <button
                    className="ocr-chat-send"
                    onClick={sendChat}
                    disabled={!chatInput.trim() || chatLoading}
                  >
                    {chatLoading ? <Loader2 size={16} className="ocr-spin-sm" /> : '↑'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
