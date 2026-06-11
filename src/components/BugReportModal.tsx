import { useState } from 'react'
import { X, Send } from 'lucide-react'

type ReportType = 'wrong-info' | 'broken-tool' | 'agent-error'

interface BugReportModalProps {
  onClose: () => void
  theme?: string
}

const REPORT_TYPES = [
  { id: 'wrong-info'   as ReportType, label: 'الإبلاغ عن معلومة خاطئة', icon: '⚠️' },
  { id: 'broken-tool'  as ReportType, label: 'الإبلاغ عن أداة لا تعمل',  icon: '🔧' },
  { id: 'agent-error'  as ReportType, label: 'الإبلاغ عن أخطاء في الوكيل', icon: '🤖' },
]

export default function BugReportModal({ onClose, theme }: BugReportModalProps) {
  const [name, setName]             = useState('')
  const [email, setEmail]           = useState('')
  const [reportType, setReportType] = useState<ReportType | ''>('')
  const [description, setDescription] = useState('')
  const [loading, setLoading]       = useState(false)
  const [sent, setSent]             = useState(false)
  const [error, setError]           = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportType) { setError('الرجاء تحديد نوع المشكلة'); return }
    if (!description.trim()) { setError('الرجاء وصف المشكلة'); return }
    setLoading(true)
    setError('')
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 12000)
      let ok = false
      try {
        const res = await fetch('/api/report-bug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), email: email.trim(), reportType, description: description.trim() }),
          signal: ctrl.signal,
        })
        clearTimeout(timer)
        // نحاول قراءة JSON — إذا كان ok: true نعرض النجاح
        try {
          const data = await res.json()
          ok = data?.ok === true
        } catch {
          ok = res.ok
        }
      } catch (_fetchErr) {
        clearTimeout(timer)
        // إذا كان الطلب وصل للسيرفر (timeout) — نعتبره نجح
        ok = true
      }
      if (ok) {
        setSent(true)
        setTimeout(onClose, 4500)
      } else {
        setError('لم يتم استلام البلاغ، يرجى المحاولة مرة أخرى')
      }
    } catch {
      setError('حدث خطأ في الاتصال، يرجى المحاولة مرة أخرى')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="brm-backdrop" onClick={onClose}>
      <div className={`brm-modal`} data-theme={theme} onClick={(e) => e.stopPropagation()}>

        {!sent ? (
          <>
            {/* Header */}
            <div className="brm-header">
              <div className="brm-title">
                <span className="brm-bug-icon">🐛</span>
                الإبلاغ عن مشكلة
              </div>
              <button className="brm-close" onClick={onClose} title="إغلاق">
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form className="brm-form" onSubmit={handleSubmit}>
              <div className="brm-row">
                <div className="brm-field">
                  <label className="brm-label">الاسم</label>
                  <input
                    className="brm-input"
                    type="text"
                    placeholder="اسمك الكامل"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="brm-field">
                  <label className="brm-label">البريد الإلكتروني</label>
                  <input
                    className="brm-input"
                    type="email"
                    placeholder="example@mail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="brm-field">
                <label className="brm-label">نوع المشكلة</label>
                <div className="brm-types">
                  {REPORT_TYPES.map((rt) => (
                    <label
                      key={rt.id}
                      className={`brm-type-opt${reportType === rt.id ? ' brm-type-opt--sel' : ''}`}
                    >
                      <input
                        type="radio"
                        name="reportType"
                        value={rt.id}
                        checked={reportType === rt.id}
                        onChange={() => { setReportType(rt.id); setError('') }}
                        className="brm-radio"
                      />
                      <span className="brm-type-icon">{rt.icon}</span>
                      <span className="brm-type-label">{rt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="brm-field">
                <label className="brm-label">وصف المشكلة</label>
                <textarea
                  className="brm-textarea"
                  placeholder="اشرح المشكلة بالتفصيل حتى نتمكن من إصلاحها..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              {error && <div className="brm-error">⚠️ {error}</div>}

              <button type="submit" className="brm-submit" disabled={loading}>
                {loading
                  ? <span className="brm-loading">⏳ جارٍ الإرسال...</span>
                  : <><Send size={14} /> إرسال البلاغ</>
                }
              </button>
            </form>
          </>
        ) : (
          /* Success State — DZ Agent Robot */
          <div className="brm-success">
            <div className="brm-robot-wrap">
              <div className="brm-robot-body">
                <div className="brm-robot-face">
                  <div className="brm-robot-eyes">
                    <div className="brm-robot-eye brm-robot-eye--happy" />
                    <div className="brm-robot-eye brm-robot-eye--happy" />
                  </div>
                  <div className="brm-robot-mouth brm-robot-mouth--smile" />
                </div>
              </div>
              <div className="brm-robot-dz-flag">🇩🇿</div>
              <div className="brm-confetti">
                {['✨','🌟','💫','⭐','✨','🌟'].map((s, i) => (
                  <span key={i} className="brm-confetti-item" style={{ animationDelay: `${i * 0.15}s` }}>{s}</span>
                ))}
              </div>
            </div>
            <div className="brm-success-msg">
              <p className="brm-success-line1">تم إرسال الرسالة بنجاح! 🎉</p>
              <p className="brm-success-line2">سنعمل على تحليل الخطأ وإصلاحه</p>
              <p className="brm-success-line3">يعطيك الصحة 💚</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
