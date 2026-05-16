import { useState, useRef, useEffect, useCallback } from 'react'
import { createWorker } from 'tesseract.js'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Copy, Check, Printer, Download, Search, Heart, FileText, ImageIcon, RotateCcw, ScanSearch, Upload } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMiniPlayer } from '../context/MiniPlayerContext'
import DoctorResultsPanel, { DoctorResult, DirLink } from '../components/DoctorResultsPanel'
import '../styles/dz-tools.css'

// ─── Shared PDF Generator (browser print-to-PDF — zero dependencies) ──────────
function generatePDF(
  ref: React.RefObject<HTMLDivElement>,
  filename: string,
  isRtl = true,
  title?: string,
) {
  if (!ref.current) return

  // Strip any elements that should not appear in PDF (disclaimers, buttons, UI chrome)
  const clone = ref.current.cloneNode(true) as HTMLElement
  clone.querySelectorAll(
    '.dzt-health-disclaimer,.dzt-result-actions,.dzt-result-btn,.dzt-btn,.dzt-spinner,button,input,select,textarea,[data-no-print]'
  ).forEach(el => el.remove())
  const bodyHtml = clone.innerHTML

  const win = window.open('', '_blank')
  if (!win) return
  const dir = isRtl ? 'rtl' : 'ltr'
  const lang = isRtl ? 'ar' : 'fr'
  const fontUrl = isRtl
    ? 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Tajawal:wght@400;500;700&display=swap'
    : 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
  const fontFamily = isRtl ? "'Cairo','Tajawal'" : "'Inter','Segoe UI'"
  const docTitle = title || filename.replace('.pdf', '')
  const now = new Date().toLocaleDateString(isRtl ? 'ar-DZ' : 'fr-DZ', { year: 'numeric', month: 'long', day: 'numeric' })

  win.document.write(`<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8">
<title>${docTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="${fontUrl}" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{
    font-family:${fontFamily},system-ui,sans-serif;
    direction:${dir};
    background:#fff;
    color:#111;
    font-size:13.5px;
    line-height:1.9;
    padding:0;
  }
  /* ── Page header ── */
  .pdf-header{
    background:linear-gradient(135deg,#0a3d1f 0%,#1a6b3c 100%);
    color:#fff;
    padding:22px 44px 18px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
  }
  .pdf-header-brand{font-size:11px;opacity:.75;white-space:nowrap}
  .pdf-header-title{font-size:18px;font-weight:800;letter-spacing:-.3px}
  .pdf-header-date{font-size:11px;opacity:.75;white-space:nowrap;text-align:${isRtl?'left':'right'}}
  /* ── Content ── */
  .pdf-body{padding:32px 44px 44px}
  h1{font-size:20px;color:#0a3d1f;border-bottom:2.5px solid #c8ff00;padding-bottom:7px;margin:22px 0 13px}
  h2{font-size:16px;color:#0d5c2e;border-bottom:1px solid #d4edda;padding-bottom:5px;margin:18px 0 9px;font-weight:700}
  h3{font-size:14px;color:#1a7a2f;margin:14px 0 6px;font-weight:700}
  h4{font-size:13px;color:#333;margin:10px 0 4px;font-weight:600}
  p{margin:5px 0 7px}
  strong{color:#0d4a20;font-weight:700}
  em{font-style:italic;color:#555}
  ul,ol{padding-${isRtl?'right':'left'}:24px;margin:6px 0 10px}
  li{margin:4px 0}
  li>p{margin:0}
  table{width:100%;border-collapse:collapse;margin:12px 0;font-size:12.5px}
  thead tr{background:#e8f5e9}
  th{color:#0a3d1f;padding:8px 11px;text-align:${isRtl?'right':'left'};font-weight:700;border:1px solid #c5e0c8;font-size:12px}
  td{padding:7px 11px;border:1px solid #e0e8e2;vertical-align:top}
  tr:nth-child(even) td{background:#f6fbf7}
  code{background:#f0f5f1;padding:2px 7px;border-radius:4px;font-size:11.5px;font-family:'Courier New',monospace;color:#1a5c2e}
  pre{background:#f4f8f5;padding:14px 18px;border-radius:7px;font-size:12px;margin:10px 0;border:1px solid #d8e8dc;overflow:hidden;white-space:pre-wrap;word-break:break-word}
  blockquote{border-${isRtl?'right':'left'}:4px solid #c8ff00;padding:6px 16px;margin:10px 0;color:#444;background:#fafff5;border-radius:0 6px 6px 0}
  hr{border:none;border-top:1.5px solid #e4ede6;margin:18px 0}
  a{color:#0a5c28}
  /* ── Footer ── */
  .pdf-footer{
    border-top:1px solid #e4ede6;
    padding:10px 44px;
    font-size:10.5px;
    color:#888;
    display:flex;
    justify-content:space-between;
    margin-top:24px;
  }
  /* ── Print ── */
  @media print{
    .pdf-header{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @page{margin:0;size:A4 portrait}
    html,body{height:auto}
  }
</style>
</head>
<body>
<div class="pdf-header">
  <div class="pdf-header-brand">🇩🇿 DZ-GPT · dz-gpt.vercel.app</div>
  <div class="pdf-header-title">${docTitle}</div>
  <div class="pdf-header-date">${now}</div>
</div>
<div class="pdf-body">${bodyHtml}</div>
<div class="pdf-footer">
  <span>🇩🇿 DZ-GPT — مُنشأ بواسطة الذكاء الاصطناعي</span>
  <span>${now}</span>
</div>
</body>
</html>`)
  win.document.close()
  setTimeout(() => { win.focus(); win.print() }, 800)
}

type ToolId = 'cv' | 'planner' | 'docs' | 'jobs' | 'health' | 'ocr' | 'bizplan' | 'image'

const TOOLS: { id: ToolId; icon: string; name: string; desc: string; badge?: string }[] = [
  { id: 'cv',      icon: '📄', name: 'مولّد السيرة الذاتية',   desc: 'أنشئ سيرة ذاتية احترافية بالعربية أو الفرنسية في ثوانٍ' },
  { id: 'planner', icon: '📋', name: 'مخطط المشاريع',           desc: 'حوّل فكرتك إلى خطة عمل تفصيلية مع مهام وجدول زمني' },
  { id: 'docs',    icon: '📑', name: 'وثائق تجارية',            desc: 'عقود عمل • مراسلات • عروض أسعار • محاضر اجتماعات' },
  { id: 'jobs',    icon: '💼', name: 'بحث وظيفي',              desc: 'ابحث عن وظيفة في الجزائر واحصل على مساعدة في رسالة التقدم' },
  { id: 'health',  icon: '🏥', name: 'وكيل الصحة',             desc: 'تحليل الأعراض • البحث عن طبيب • نصائح صحية للجزائر' },
  { id: 'image',   icon: '🖼️', name: 'Visual AI — صور',        desc: 'بحث عن صور • بحث عكسي • تحليل AI • OCR من الصور', badge: 'NEW' },
  { id: 'ocr',     icon: '📷', name: 'قارئ الوثائق OCR',       desc: 'ارفع صورة واستخرج النص تلقائياً بـ Tesseract' },
  { id: 'bizplan', icon: '📊', name: 'خطة العمل Business Plan', desc: 'خطة عمل كاملة لمشروعك في الجزائر مع أرقام حقيقية' },
]

// ─── CV Tool ──────────────────────────────────────────────────────────────────
function CVTool() {
  const [form, setForm] = useState({
    name: '', title: '', phone: '', email: '', city: '',
    summary: '', experience: '', education: '', skills: '', languages: '',
    outputLang: 'ar',
  })
  const [result, setResult]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [copied, setCopied]     = useState(false)
  const [photo, setPhoto]       = useState<string>('')
  const [photoDrag, setPhotoDrag] = useState(false)

  const photoInputRef  = useRef<HTMLInputElement>(null)
  const resultBodyRef  = useRef<HTMLDivElement>(null)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handlePhotoFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = ev => setPhoto(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const generate = async () => {
    if (!form.name.trim()) return
    setLoading(true)
    setResult('')
    try {
      const prompt = form.outputLang === 'ar'
        ? `أنشئ سيرة ذاتية احترافية بالعربية للشخص التالي. استخدم تنسيق Markdown منظم مع عناوين واضحة:\n
الاسم: ${form.name}
المنصب المطلوب: ${form.title}
الهاتف: ${form.phone || 'غير محدد'}
البريد الإلكتروني: ${form.email || 'غير محدد'}
المدينة: ${form.city || 'الجزائر'}
ملخص شخصي: ${form.summary || 'شخص متحمس وطموح'}
الخبرات المهنية: ${form.experience || 'لا توجد خبرات سابقة'}
التعليم: ${form.education || 'غير محدد'}
المهارات: ${form.skills || 'غير محدد'}
اللغات: ${form.languages || 'العربية'}

اجعل السيرة الذاتية احترافية، منظمة، جاهزة للإرسال لأصحاب العمل.`
        : `Créez un CV professionnel en français pour cette personne. Utilisez le format Markdown structuré:\n
Nom: ${form.name}
Poste souhaité: ${form.title}
Téléphone: ${form.phone || 'Non précisé'}
Email: ${form.email || 'Non précisé'}
Ville: ${form.city || 'Alger'}
Résumé: ${form.summary || 'Personne motivée et ambitieuse'}
Expériences: ${form.experience || 'Pas d\'expérience antérieure'}
Formation: ${form.education || 'Non précisé'}
Compétences: ${form.skills || 'Non précisé'}
Langues: ${form.languages || 'Arabe'}

Rendez le CV professionnel, structuré, prêt pour les employeurs.`

      const res = await fetch('/api/dz-agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      })
      const data = await res.json()
      setResult(data.content || '⚠️ لم يتمكن الوكيل من إنشاء السيرة الذاتية.')
    } catch { setResult('⚠️ خطأ في الاتصال. يرجى المحاولة مرة أخرى.') }
    finally { setLoading(false) }
  }

  const copyResult = () => {
    navigator.clipboard.writeText(result).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const downloadMd = () => {
    const blob = new Blob([result], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `cv-${form.name.replace(/\s+/g,'-') || 'dz'}.md`; a.click()
  }

  const printCV = () => {
    const bodyHtml = resultBodyRef.current?.innerHTML || ''
    const isRtl = form.outputLang === 'ar'
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html>
<html lang="${isRtl ? 'ar' : 'fr'}" dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${isRtl ? 'السيرة الذاتية' : 'Curriculum Vitae'} — ${form.name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ${isRtl ? "'Cairo'" : "'Inter'"}, system-ui, sans-serif;
    direction: ${isRtl ? 'rtl' : 'ltr'};
    background: #fff;
    color: #1a1a1a;
    font-size: 13px;
    line-height: 1.7;
    padding: 32px 40px;
  }
  .cv-header {
    display: flex;
    align-items: center;
    gap: 24px;
    padding-bottom: 20px;
    border-bottom: 3px solid #c8ff00;
    margin-bottom: 24px;
    flex-direction: ${isRtl ? 'row' : 'row'};
  }
  .cv-photo-wrap {
    flex-shrink: 0;
  }
  .cv-photo {
    width: 110px;
    height: 110px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid #c8ff00;
    display: block;
  }
  .cv-photo-placeholder {
    width: 110px;
    height: 110px;
    border-radius: 50%;
    background: linear-gradient(135deg, #1a1a2e, #0f3460);
    border: 3px solid #c8ff00;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40px;
  }
  .cv-name-block { flex: 1; }
  .cv-name { font-size: 26px; font-weight: 800; color: #0a0a0a; margin-bottom: 4px; }
  .cv-title { font-size: 15px; color: #555; font-weight: 600; margin-bottom: 8px; }
  .cv-contacts { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: #666; }
  .cv-contact { display: flex; align-items: center; gap: 4px; }
  .cv-body h1, .cv-body h2 { color: #0a0a0a; border-bottom: 2px solid #e5e5e5; padding-bottom: 4px; margin: 18px 0 8px; font-size: 15px; font-weight: 800; }
  .cv-body h3 { font-size: 13px; font-weight: 700; margin: 12px 0 4px; color: #222; }
  .cv-body p { margin-bottom: 6px; color: #333; }
  .cv-body ul { padding-${isRtl ? 'right' : 'left'}: 18px; margin-bottom: 8px; }
  .cv-body li { margin-bottom: 3px; color: #333; }
  .cv-body strong { color: #0a0a0a; font-weight: 700; }
  .cv-body hr { border: none; border-top: 1px solid #eee; margin: 12px 0; }
  @media print {
    body { padding: 20px 24px; }
    .cv-header { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="cv-header">
  <div class="cv-photo-wrap">
    ${photo
      ? `<img src="${photo}" class="cv-photo" alt="${form.name}" />`
      : `<div class="cv-photo-placeholder">👤</div>`
    }
  </div>
  <div class="cv-name-block">
    <div class="cv-name">${form.name || ''}</div>
    ${form.title ? `<div class="cv-title">${form.title}</div>` : ''}
    <div class="cv-contacts">
      ${form.phone  ? `<span class="cv-contact">📞 ${form.phone}</span>` : ''}
      ${form.email  ? `<span class="cv-contact">✉️ ${form.email}</span>` : ''}
      ${form.city   ? `<span class="cv-contact">📍 ${form.city}</span>` : ''}
    </div>
  </div>
</div>
<div class="cv-body">
  ${bodyHtml}
</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`)
    win.document.close()
  }

  return (
    <div>
      <div className="dzt-tool-desc">
        <span className="dzt-tool-desc-icon">📄</span>
        <div>
          <div className="dzt-tool-desc-title">مولّد السيرة الذاتية الذكي</div>
          <div className="dzt-tool-desc-text">أدخل معلوماتك وسيُنشئ DZ Agent سيرة ذاتية احترافية جاهزة للتحميل أو الطباعة مباشرة.</div>
        </div>
      </div>

      {/* ── Photo Upload ── */}
      <div className="dzt-photo-section">
        <div className="dzt-photo-label">
          <span>🖼️ الصورة الشخصية</span>
          <span className="dzt-photo-hint">اختياري — تظهر في نسخة الطباعة</span>
        </div>
        <div
          className={`dzt-photo-drop ${photoDrag ? 'dzt-photo-drop--drag' : ''} ${photo ? 'dzt-photo-drop--has' : ''}`}
          onClick={() => photoInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setPhotoDrag(true) }}
          onDragLeave={() => setPhotoDrag(false)}
          onDrop={e => {
            e.preventDefault(); setPhotoDrag(false)
            const file = e.dataTransfer.files?.[0]
            if (file) handlePhotoFile(file)
          }}
        >
          {photo ? (
            <div className="dzt-photo-preview-wrap">
              <img src={photo} alt="صورة شخصية" className="dzt-photo-preview" />
              <div className="dzt-photo-overlay">
                <span>تغيير الصورة</span>
              </div>
              <button
                className="dzt-photo-remove"
                onClick={e => { e.stopPropagation(); setPhoto('') }}
                title="حذف الصورة"
              >✕</button>
            </div>
          ) : (
            <div className="dzt-photo-empty">
              <span className="dzt-photo-empty-icon">📷</span>
              <span className="dzt-photo-empty-text">اضغط لرفع صورة أو اسحبها هنا</span>
              <span className="dzt-photo-empty-sub">JPG, PNG, WEBP — من الهاتف أو الحاسوب</span>
            </div>
          )}
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f) }}
        />
      </div>

      <div className="dzt-form">
        <div className="dzt-row">
          <div className="dzt-field">
            <label className="dzt-label">الاسم الكامل *</label>
            <input className="dzt-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="محمد بن علي" />
          </div>
          <div className="dzt-field">
            <label className="dzt-label">المنصب المطلوب</label>
            <input className="dzt-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="مطور ويب / مهندس برمجيات..." />
          </div>
        </div>
        <div className="dzt-row">
          <div className="dzt-field">
            <label className="dzt-label">الهاتف</label>
            <input className="dzt-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+213 ..." />
          </div>
          <div className="dzt-field">
            <label className="dzt-label">البريد الإلكتروني</label>
            <input className="dzt-input" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
          </div>
        </div>
        <div className="dzt-row">
          <div className="dzt-field">
            <label className="dzt-label">المدينة</label>
            <input className="dzt-input" value={form.city} onChange={e => set('city', e.target.value)} placeholder="الجزائر / وهران / قسنطينة..." />
          </div>
          <div className="dzt-field">
            <label className="dzt-label">لغة المخرج</label>
            <select className="dzt-select" value={form.outputLang} onChange={e => set('outputLang', e.target.value)}>
              <option value="ar">🇩🇿 العربية</option>
              <option value="fr">🇫🇷 الفرنسية</option>
            </select>
          </div>
        </div>
        <div className="dzt-field">
          <label className="dzt-label">ملخص شخصي</label>
          <textarea className="dzt-textarea" value={form.summary} onChange={e => set('summary', e.target.value)} placeholder="صف نفسك بإيجاز — طموحاتك وشخصيتك المهنية..." />
        </div>
        <div className="dzt-field">
          <label className="dzt-label">الخبرات المهنية</label>
          <textarea className="dzt-textarea" value={form.experience} onChange={e => set('experience', e.target.value)} placeholder="اكتب خبراتك مع الشركات والفترات الزمنية..." style={{ minHeight: 80 }} />
        </div>
        <div className="dzt-row">
          <div className="dzt-field">
            <label className="dzt-label">المؤهل التعليمي</label>
            <textarea className="dzt-textarea" value={form.education} onChange={e => set('education', e.target.value)} placeholder="الشهادة — الجامعة — السنة..." style={{ minHeight: 60 }} />
          </div>
          <div className="dzt-field">
            <label className="dzt-label">المهارات التقنية</label>
            <textarea className="dzt-textarea" value={form.skills} onChange={e => set('skills', e.target.value)} placeholder="Python, React, Excel, فوتوشوب..." style={{ minHeight: 60 }} />
          </div>
        </div>
        <div className="dzt-field">
          <label className="dzt-label">اللغات</label>
          <input className="dzt-input" value={form.languages} onChange={e => set('languages', e.target.value)} placeholder="العربية (لغة أم)، الفرنسية (جيد)، الإنجليزية (متوسط)..." />
        </div>

        <button className="dzt-btn" onClick={generate} disabled={!form.name.trim() || loading}>
          {loading ? <><span className="dzt-spinner" style={{ display: 'inline-block' }} /> جاري الإنشاء...</> : '✨ إنشاء السيرة الذاتية'}
        </button>
      </div>

      {loading && (
        <div className="dzt-loading">
          <div className="dzt-spinner" />
          DZ Agent يُنشئ سيرتك الذاتية...
        </div>
      )}

      {result && (
        <div className="dzt-result">
          <div className="dzt-result-header">
            <span className="dzt-result-title">📄 السيرة الذاتية جاهزة</span>
            <div className="dzt-result-actions">
              <button className="dzt-result-btn" onClick={copyResult}>
                {copied ? <><Check size={12} /> تم</> : <><Copy size={12} /> نسخ</>}
              </button>
              <button className="dzt-result-btn" onClick={downloadMd}>
                <Download size={12} /> تحميل MD
              </button>
              <button className="dzt-result-btn dzt-result-btn--print" onClick={printCV}>
                <Printer size={12} /> طباعة
              </button>
              <button className="dzt-result-btn dzt-pdf-btn" onClick={printCV}>
                📥 PDF
              </button>
            </div>
          </div>
          {/* Photo preview in result */}
          {photo && (
            <div className="dzt-result-photo-bar">
              <img src={photo} alt="الصورة الشخصية" className="dzt-result-photo" />
              <div className="dzt-result-photo-info">
                <span className="dzt-result-photo-name">{form.name}</span>
                <span className="dzt-result-photo-title">{form.title}</span>
              </div>
            </div>
          )}
          <div className="dzt-result-body" ref={resultBodyRef}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Project Planner Tool ─────────────────────────────────────────────────────
function PlannerTool() {
  const [form, setForm] = useState({ title: '', description: '', duration: '30', team: '1', type: 'web' })
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const pdfRef = useRef<HTMLDivElement>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const generate = async () => {
    if (!form.title.trim()) return
    setLoading(true); setResult('')
    const typeLabels: Record<string, string> = {
      web:      'مشروع برمجي / نظام رقمي',
      mobile:   'مشروع للهواتف الذكية',
      business: 'مشروع تجاري',
      research: 'مشروع بحثي',
      other:    'مشروع متنوع',
    }
    const prompt = `[TOOL:PROJECT_PLANNER — لا تُنشئ كوداً ولا مواقع — خطة إدارة مشاريع فقط]

أنت مدير مشاريع محترف. أنشئ خطة مشروع تفصيلية بالعربية بتنسيق Markdown. أَخرِج الخطة مباشرةً دون أي مقدمة أو خاتمة.

# خطة مشروع: ${form.title}

اشمل هذه الأقسام بالترتيب:
1. **ملخص المشروع**
2. **الأهداف الرئيسية** (3-5 أهداف قابلة للقياس)
3. **المراحل والمهام** (مع تقدير الوقت لكل مرحلة)
4. **الجدول الزمني** (جدول واضح بالأسابيع/الأشهر)
5. **الموارد المطلوبة** (بشرية + تقنية + مالية)
6. **مؤشرات النجاح KPIs**
7. **المخاطر والحلول**

المعلومات:
- الاسم: ${form.title}
- النوع: ${typeLabels[form.type] || form.type}
- الوصف: ${form.description || 'مشروع طموح'}
- المدة: ${form.duration} يوم
- الفريق: ${form.team} شخص`
    try {
      const res = await fetch('/api/dz-agent-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], tool: 'planner' })
      })
      const data = await res.json()
      setResult(data.content || '⚠️ فشل في إنشاء الخطة.')
    } catch { setResult('⚠️ خطأ في الاتصال.') }
    finally { setLoading(false) }
  }

  const downloadMd = () => {
    const blob = new Blob([result], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `plan-${form.title.replace(/\s+/g,'-') || 'project'}.md`; a.click()
  }

  return (
    <div>
      <div className="dzt-tool-desc">
        <span className="dzt-tool-desc-icon">📋</span>
        <div>
          <div className="dzt-tool-desc-title">مخطط المشاريع الذكي</div>
          <div className="dzt-tool-desc-text">صف مشروعك وسيُنشئ DZ Agent خطة عمل كاملة مع مراحل ومهام وجدول زمني واضح.</div>
        </div>
      </div>

      <div className="dzt-form">
        <div className="dzt-field">
          <label className="dzt-label">اسم المشروع *</label>
          <input className="dzt-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="منصة تجارة إلكترونية / تطبيق توصيل / موقع..." />
        </div>
        <div className="dzt-field">
          <label className="dzt-label">وصف المشروع</label>
          <textarea className="dzt-textarea" value={form.description} onChange={e => set('description', e.target.value)} placeholder="اشرح فكرة مشروعك — ما هو، لمن، ما الهدف منه..." />
        </div>
        <div className="dzt-row">
          <div className="dzt-field">
            <label className="dzt-label">نوع المشروع</label>
            <select className="dzt-select" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="web">🌐 تطبيق ويب</option>
              <option value="mobile">📱 تطبيق موبايل</option>
              <option value="business">💼 مشروع تجاري</option>
              <option value="research">🔬 مشروع بحثي</option>
              <option value="other">🔧 أخرى</option>
            </select>
          </div>
          <div className="dzt-field">
            <label className="dzt-label">المدة (أيام)</label>
            <input className="dzt-input" type="number" min="7" max="365" value={form.duration} onChange={e => set('duration', e.target.value)} />
          </div>
        </div>
        <div className="dzt-field">
          <label className="dzt-label">حجم الفريق</label>
          <select className="dzt-select" value={form.team} onChange={e => set('team', e.target.value)}>
            <option value="1">👤 شخص واحد (Solo)</option>
            <option value="2">👥 2-3 أشخاص</option>
            <option value="5">👥 4-7 أشخاص</option>
            <option value="10">🏢 8+ أشخاص</option>
          </select>
        </div>
        <button className="dzt-btn" onClick={generate} disabled={!form.title.trim() || loading}>
          {loading ? <><span className="dzt-spinner" /> جاري الإنشاء...</> : '🗺️ إنشاء خطة المشروع'}
        </button>
      </div>

      {loading && <div className="dzt-loading"><div className="dzt-spinner" />DZ Agent يُخطط مشروعك...</div>}

      {result && (
        <div className="dzt-result">
          <div className="dzt-result-header">
            <span className="dzt-result-title">📋 خطة المشروع جاهزة</span>
            <div className="dzt-result-actions">
              <button className="dzt-result-btn" onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                {copied ? <><Check size={12} /> تم</> : <><Copy size={12} /> نسخ</>}
              </button>
              <button className="dzt-result-btn" onClick={downloadMd}><Download size={12} /> تحميل MD</button>
              <button className="dzt-result-btn" onClick={() => window.print()}><Printer size={12} /> طباعة</button>
              <button className="dzt-result-btn dzt-pdf-btn" onClick={() => generatePDF(pdfRef, `plan-${form.title.replace(/\s+/g,'-')}.pdf`, true, `خطة مشروع: ${form.title}`)}>📥 PDF</button>
            </div>
          </div>
          <div className="dzt-result-body" ref={pdfRef}><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></div>
        </div>
      )}
    </div>
  )
}

// ─── Business Documents Tool ──────────────────────────────────────────────────
function BizDocsTool() {
  const [docType, setDocType] = useState('employment')
  const [form, setForm] = useState({
    employer: '', employee: '', position: '', salary: '', duration: '', start: '',
    city: '', subject: '', body: '', client: '', service: '', price: '',
    meeting: '', attendees: '', decisions: '', company: '', workerName: '', startDate: '',
  })
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const pdfRef = useRef<HTMLDivElement>(null)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const DOC_TYPES = [
    { id: 'employment', icon: '💼', label: 'عقد عمل (CDI/CDD)' },
    { id: 'letter',     icon: '✉️', label: 'مراسلة رسمية' },
    { id: 'devis',      icon: '💰', label: 'عرض أسعار (Devis)' },
    { id: 'pv',         icon: '📝', label: 'محضر اجتماع (PV)' },
    { id: 'attestation',icon: '🏅', label: 'شهادة عمل' },
  ]

  const generate = async () => {
    setLoading(true); setResult('')
    let prompt = ''
    if (docType === 'employment') {
      prompt = `أنت خبير قانوني جزائري. أنشئ عقد عمل كامل ومفصل وفق القانون الجزائري (قانون العمل 90-11) بالمعلومات التالية:
- صاحب العمل: ${form.employer || 'شركة ...'}
- العامل: ${form.employee || 'السيد/السيدة ...'}
- المنصب: ${form.position || '...'}
- الراتب: ${form.salary || '...'} دج/شهر
- مدة العقد: ${form.duration || 'غير محدد (CDI)'}
- تاريخ البداية: ${form.start || new Date().toLocaleDateString('ar-DZ')}
- مدينة الإبرام: ${form.city || 'الجزائر'}

أنشئ العقد باللغة العربية الفصحى مع كل البنود القانونية الكاملة: الأطراف، المنصب والمهام، الراتب والمزايا، الدوام، الإجازات، بنود الإنهاء، السرية، الفصل في النزاعات.`
    } else if (docType === 'letter') {
      prompt = `أنت خبير إداري جزائري. أنشئ مراسلة رسمية احترافية:
- الموضوع: ${form.subject || 'موضوع المراسلة'}
- المرسل: ${form.employer || 'المرسل'}
- المرسل إليه: ${form.client || 'المرسل إليه'}
- المدينة: ${form.city || 'الجزائر'}
- مضمون الرسالة: ${form.body || 'يرجى ذكر المضمون'}
أنشئ المراسلة بشكل احترافي رسمي مع كل العناصر الإدارية الجزائرية (التاريخ، المرجع، التحية، الخاتمة، التوقيع).`
    } else if (docType === 'devis') {
      prompt = `أنت خبير تجاري جزائري. أنشئ عرض أسعار (Devis) احترافي:
- اسم الشركة/المزود: ${form.employer || 'الشركة'}
- اسم العميل: ${form.client || 'العميل'}
- الخدمة/المنتج: ${form.service || 'وصف الخدمة'}
- السعر الإجمالي: ${form.price || '...'} دج
- المدينة: ${form.city || 'الجزائر'}
- التاريخ: ${new Date().toLocaleDateString('ar-DZ')}
أنشئ عرض أسعار منظماً باللغتين العربية والفرنسية مع: جدول الخدمات، الشروط، طرق الدفع، صلاحية العرض، بيانات الاتصال.`
    } else if (docType === 'pv') {
      prompt = `أنت خبير إداري جزائري. أنشئ محضر اجتماع (Procès-Verbal) رسمي:
- موضوع الاجتماع: ${form.meeting || 'موضوع الاجتماع'}
- الحاضرون: ${form.attendees || 'أسماء الحاضرين'}
- المقررات والنقاط المناقشة: ${form.decisions || 'نقاط الاجتماع'}
- المدينة: ${form.city || 'الجزائر'}
- التاريخ: ${new Date().toLocaleDateString('ar-DZ')}
أنشئ محضراً رسمياً كاملاً بالعربية مع: الديباجة، قائمة الحاضرين، جدول الأعمال، المداولات، المقررات، الخاتمة، التوقيعات.`
    } else if (docType === 'attestation') {
      prompt = `أنت خبير إداري جزائري. أنشئ شهادة عمل رسمية:
- اسم الشركة: ${form.company || form.employer || 'الشركة'}
- اسم الموظف: ${form.workerName || form.employee || 'الموظف'}
- المنصب: ${form.position || 'المنصب'}
- تاريخ الالتحاق: ${form.startDate || form.start || '...'}
- المدينة: ${form.city || 'الجزائر'}
أنشئ شهادة عمل رسمية كاملة باللغة العربية تُثبت أن الموظف يعمل لدى الشركة، مع كل البيانات الرسمية والصياغة الإدارية الجزائرية المعتمدة.`
    }

    try {
      const res = await fetch('/api/dz-agent-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], tool: 'docs' })
      })
      const data = await res.json()
      setResult(data.content || '⚠️ فشل إنشاء الوثيقة.')
    } catch { setResult('⚠️ خطأ في الاتصال.') }
    finally { setLoading(false) }
  }

  const printDoc = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>وثيقة تجارية</title><style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
      body{font-family:'Cairo',sans-serif;max-width:800px;margin:40px auto;padding:40px;color:#111;direction:rtl;line-height:1.8}
      h1,h2,h3{color:#1a3c5e} pre{white-space:pre-wrap}
    </style></head><body><pre>${result.replace(/</g,'&lt;')}</pre></body></html>`)
    w.document.close(); w.print()
  }

  const currentType = DOC_TYPES.find(d => d.id === docType)

  return (
    <div>
      <div className="dzt-tool-desc">
        <span className="dzt-tool-desc-icon">📑</span>
        <div>
          <div className="dzt-tool-desc-title">مولّد الوثائق التجارية</div>
          <div className="dzt-tool-desc-text">أنشئ وثائق تجارية احترافية وفق القانون الجزائري في ثوانٍ.</div>
        </div>
      </div>

      <div className="dzt-form">
        <div className="dzt-field">
          <label className="dzt-label">نوع الوثيقة</label>
          <div className="dzt-doc-types">
            {DOC_TYPES.map(d => (
              <button key={d.id} className={`dzt-doc-type-btn${docType === d.id ? ' active' : ''}`} onClick={() => { setDocType(d.id); setResult('') }}>
                <span>{d.icon}</span><span>{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        {docType === 'employment' && (<>
          <div className="dzt-row">
            <div className="dzt-field"><label className="dzt-label">صاحب العمل / الشركة</label><input className="dzt-input" value={form.employer} onChange={e=>set('employer',e.target.value)} placeholder="اسم الشركة أو صاحب العمل"/></div>
            <div className="dzt-field"><label className="dzt-label">اسم العامل</label><input className="dzt-input" value={form.employee} onChange={e=>set('employee',e.target.value)} placeholder="الاسم الكامل للعامل"/></div>
          </div>
          <div className="dzt-row">
            <div className="dzt-field"><label className="dzt-label">المنصب الوظيفي</label><input className="dzt-input" value={form.position} onChange={e=>set('position',e.target.value)} placeholder="مطوّر • محاسب • مهندس..."/></div>
            <div className="dzt-field"><label className="dzt-label">الراتب الشهري (دج)</label><input className="dzt-input" value={form.salary} onChange={e=>set('salary',e.target.value)} placeholder="50000"/></div>
          </div>
          <div className="dzt-row">
            <div className="dzt-field"><label className="dzt-label">مدة العقد</label><select className="dzt-select" value={form.duration} onChange={e=>set('duration',e.target.value)}><option value="">غير محدد CDI</option><option value="6 أشهر">6 أشهر CDD</option><option value="سنة">سنة CDD</option><option value="سنتين">سنتين CDD</option></select></div>
            <div className="dzt-field"><label className="dzt-label">تاريخ البداية</label><input className="dzt-input" type="date" value={form.start} onChange={e=>set('start',e.target.value)}/></div>
          </div>
          <div className="dzt-field"><label className="dzt-label">مدينة الإبرام</label><input className="dzt-input" value={form.city} onChange={e=>set('city',e.target.value)} placeholder="الجزائر العاصمة"/></div>
        </>)}

        {docType === 'letter' && (<>
          <div className="dzt-row">
            <div className="dzt-field"><label className="dzt-label">المرسل</label><input className="dzt-input" value={form.employer} onChange={e=>set('employer',e.target.value)} placeholder="اسم المرسل أو الشركة"/></div>
            <div className="dzt-field"><label className="dzt-label">المرسل إليه</label><input className="dzt-input" value={form.client} onChange={e=>set('client',e.target.value)} placeholder="الجهة المرسل إليها"/></div>
          </div>
          <div className="dzt-field"><label className="dzt-label">الموضوع</label><input className="dzt-input" value={form.subject} onChange={e=>set('subject',e.target.value)} placeholder="موضوع المراسلة"/></div>
          <div className="dzt-field"><label className="dzt-label">مضمون الرسالة</label><textarea className="dzt-textarea" value={form.body} onChange={e=>set('body',e.target.value)} placeholder="اشرح ما تريد قوله في الرسالة..."/></div>
          <div className="dzt-field"><label className="dzt-label">المدينة</label><input className="dzt-input" value={form.city} onChange={e=>set('city',e.target.value)} placeholder="الجزائر"/></div>
        </>)}

        {docType === 'devis' && (<>
          <div className="dzt-row">
            <div className="dzt-field"><label className="dzt-label">الشركة / المزود</label><input className="dzt-input" value={form.employer} onChange={e=>set('employer',e.target.value)} placeholder="اسم شركتك"/></div>
            <div className="dzt-field"><label className="dzt-label">اسم العميل</label><input className="dzt-input" value={form.client} onChange={e=>set('client',e.target.value)} placeholder="اسم العميل"/></div>
          </div>
          <div className="dzt-field"><label className="dzt-label">الخدمة / المنتج</label><textarea className="dzt-textarea" style={{minHeight:80}} value={form.service} onChange={e=>set('service',e.target.value)} placeholder="صف الخدمة أو المنتج بالتفصيل..."/></div>
          <div className="dzt-row">
            <div className="dzt-field"><label className="dzt-label">السعر الإجمالي (دج)</label><input className="dzt-input" value={form.price} onChange={e=>set('price',e.target.value)} placeholder="150000"/></div>
            <div className="dzt-field"><label className="dzt-label">المدينة</label><input className="dzt-input" value={form.city} onChange={e=>set('city',e.target.value)} placeholder="الجزائر"/></div>
          </div>
        </>)}

        {docType === 'pv' && (<>
          <div className="dzt-field"><label className="dzt-label">موضوع الاجتماع</label><input className="dzt-input" value={form.meeting} onChange={e=>set('meeting',e.target.value)} placeholder="اجتماع مجلس الإدارة / اجتماع فريق العمل..."/></div>
          <div className="dzt-field"><label className="dzt-label">الحاضرون</label><textarea className="dzt-textarea" style={{minHeight:80}} value={form.attendees} onChange={e=>set('attendees',e.target.value)} placeholder="أسماء وصفات الحاضرين..."/></div>
          <div className="dzt-field"><label className="dzt-label">النقاط المناقشة والمقررات</label><textarea className="dzt-textarea" value={form.decisions} onChange={e=>set('decisions',e.target.value)} placeholder="ما تم مناقشته وما تم الاتفاق عليه..."/></div>
          <div className="dzt-field"><label className="dzt-label">المدينة</label><input className="dzt-input" value={form.city} onChange={e=>set('city',e.target.value)} placeholder="الجزائر"/></div>
        </>)}

        {docType === 'attestation' && (<>
          <div className="dzt-row">
            <div className="dzt-field"><label className="dzt-label">اسم الشركة</label><input className="dzt-input" value={form.company} onChange={e=>set('company',e.target.value)} placeholder="اسم الشركة"/></div>
            <div className="dzt-field"><label className="dzt-label">اسم الموظف</label><input className="dzt-input" value={form.workerName} onChange={e=>set('workerName',e.target.value)} placeholder="الاسم الكامل"/></div>
          </div>
          <div className="dzt-row">
            <div className="dzt-field"><label className="dzt-label">المنصب</label><input className="dzt-input" value={form.position} onChange={e=>set('position',e.target.value)} placeholder="المنصب الوظيفي"/></div>
            <div className="dzt-field"><label className="dzt-label">تاريخ الالتحاق</label><input className="dzt-input" type="date" value={form.startDate} onChange={e=>set('startDate',e.target.value)}/></div>
          </div>
          <div className="dzt-field"><label className="dzt-label">المدينة</label><input className="dzt-input" value={form.city} onChange={e=>set('city',e.target.value)} placeholder="الجزائر"/></div>
        </>)}

        <button className="dzt-btn" onClick={generate} disabled={loading}>
          {loading ? <><span className="dzt-spinner"/> جاري الإنشاء...</> : `${currentType?.icon} إنشاء ${currentType?.label}`}
        </button>
      </div>

      {loading && <div className="dzt-loading"><div className="dzt-spinner"/>DZ Agent يُنشئ الوثيقة...</div>}

      {result && (
        <div className="dzt-result">
          <div className="dzt-result-header">
            <span className="dzt-result-title">📑 الوثيقة الجاهزة</span>
            <div className="dzt-result-actions">
              <button className="dzt-result-btn" onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(()=>setCopied(false),2000) }}>
                {copied ? <><Check size={12}/> تم</> : <><Copy size={12}/> نسخ</>}
              </button>
              <button className="dzt-result-btn dzt-result-btn--print" onClick={printDoc}><Printer size={12}/> طباعة</button>
              <button className="dzt-result-btn dzt-pdf-btn" onClick={() => generatePDF(pdfRef, `doc-${docType}-dz.pdf`, true, currentType?.label)}>📥 PDF</button>
            </div>
          </div>
          <div className="dzt-result-body" ref={pdfRef}><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></div>
        </div>
      )}
    </div>
  )
}

// ─── Job Search Tool ───────────────────────────────────────────────────────────
function JobSearchTool() {
  const [form, setForm] = useState({ domain: '', city: 'الجزائر', level: 'any', lang: 'ar', coverMode: false, coverFor: '' })
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<'search' | 'cover'>('search')
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const CITIES = ['الجزائر','وهران','قسنطينة','عنابة','سطيف','باتنة','تلمسان','بجاية','بليدة','تيزي وزو','ورقلة','مستغانم','سكيكدة','المدية','برج بوعريريج']
  const LEVELS = [{ v:'any', l:'أي مستوى' }, { v:'junior', l:'مبتدئ (Junior)' }, { v:'mid', l:'متوسط (3-5 سنوات)' }, { v:'senior', l:'خبير (Senior)' }, { v:'intern', l:'متربص (Stage)' }]

  const search = async () => {
    setLoading(true); setResult('')
    const levelLabel = LEVELS.find(l=>l.v===form.level)?.l || ''
    const prompt = mode === 'search'
      ? `[TOOL:JOB_SEARCH — وكيل توظيف جزائري — لا مقدمات — ابدأ مباشرةً]

أنت وكيل توظيف متخصص في الجزائر. أُريد وظائف لمجال: **${form.domain}** في **${form.city}** — المستوى: ${levelLabel}.

## 1. عروض نموذجية للمنصب
قدّم 5-7 عروض عمل نموذجية واقعية بهذا التنسيق الدقيق لكل عرض:
| المنصب | الشركة | المدينة | الراتب (دج) | موقع البحث |
|--------|--------|---------|-------------|------------|
الشركات يجب أن تكون جزائرية حقيقية في قطاع **${form.domain}**.
موقع البحث: اختر الأنسب من المواقع المدرجة أدناه فقط.

## 2. أنسب المواقع المتخصصة لهذا المجال
رتّب هذه المواقع من الأنسب للأقل لمجال **${form.domain}**، مع شرح سبب الاختيار:
- **EmploiTimes.dz** — emploitimes.dz
- **CVya.dz** — cvya.dz
- **SogJob** — sogjob.com
- **AtlasDZ** — atlasdz.site
- **LinkedIn Jobs Algeria** — linkedin.com/jobs
- **Indeed Algérie** — dz.indeed.com
- **Bayt.com** — bayt.com/ar/algeria/jobs
- **Tanqeeb** — algeria.tanqeeb.com
- **Emploi-Partner** — emploi-partner.com
- **Ouedkniss Emploi** — ouedkniss.com/emploi
- **ANEM Wassit** — wassitonline.anem.dz

## 3. جدول الرواتب
رواتب تقريبية لمجال **${form.domain}** في **${form.city}** حسب المستوى (دج/شهر).

## 4. أبرز الشركات الجزائرية الناشطة
5 شركات جزائرية في قطاع ${form.domain} مع نشاطها.

## 5. نصائح التقدم
أهم 3 نصائح للتقدم بنجاح في ${form.city}.`
      : `[TOOL:COVER_LETTER — رسالة تقدم احترافية — لا مقدمات]

أنت خبير في كتابة وثائق التوظيف للسوق الجزائري. أَخرِج الرسالة مباشرةً بدون أي جملة تمهيدية.

اكتب رسالة تقدم (Lettre de Motivation) احترافية باللغة ${form.lang === 'fr' ? 'الفرنسية' : 'العربية'}:
- الوظيفة: ${form.coverFor || form.domain || 'الوظيفة المستهدفة'}
- المدينة: ${form.city}
- المستوى: ${levelLabel}

الرسالة يجب أن تتضمن: افتتاحية قوية، عرض المهارات المرتبطة بالمنصب، الحماس للمنصب، خاتمة بطلب مقابلة. أسلوب رسمي يناسب الشركات الجزائرية.`

    try {
      const res = await fetch('/api/dz-agent-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], tool: 'jobs' })
      })
      const data = await res.json()
      setResult(data.content || '⚠️ فشل البحث.')
    } catch { setResult('⚠️ خطأ في الاتصال.') }
    finally { setLoading(false) }
  }

  const JOB_BOARDS = [
    { name: 'EmploiTimes', url: 'https://www.emploitimes.dz', icon: '🇩🇿' },
    { name: 'CVya.dz', url: 'https://cvya.dz', icon: '📋' },
    { name: 'SogJob', url: 'https://www.sogjob.com', icon: '🔍' },
    { name: 'AtlasDZ', url: 'https://www.atlasdz.site', icon: '🗺️' },
    { name: 'LinkedIn', url: 'https://www.linkedin.com/jobs', icon: '💼' },
    { name: 'Indeed DZ', url: 'https://dz.indeed.com', icon: '🌐' },
    { name: 'Bayt.com', url: 'https://www.bayt.com/ar/algeria/jobs', icon: '🏢' },
    { name: 'Tanqeeb', url: 'https://algeria.tanqeeb.com/ar', icon: '🔎' },
    { name: 'Emploi-Partner', url: 'https://www.emploi-partner.com', icon: '🤝' },
    { name: 'Ouedkniss', url: 'https://www.ouedkniss.com/emploi', icon: '📌' },
    { name: 'ANEM Wassit', url: 'https://wassitonline.anem.dz', icon: '🏛️' },
  ]

  return (
    <div>
      <div className="dzt-tool-desc">
        <span className="dzt-tool-desc-icon">💼</span>
        <div>
          <div className="dzt-tool-desc-title">وكيل البحث الوظيفي الجزائري</div>
          <div className="dzt-tool-desc-text">ابحث عن وظيفة في الجزائر، واحصل على رسالة تقدم احترافية وجميع موارد البحث.</div>
        </div>
      </div>

      <div className="dzt-job-boards">
        {JOB_BOARDS.map(b => (
          <a key={b.name} href={b.url} target="_blank" rel="noopener noreferrer" className="dzt-job-board-btn">
            <span>{b.icon}</span><span>{b.name}</span>
          </a>
        ))}
      </div>

      <div className="dzt-mode-tabs">
        <button className={`dzt-mode-tab${mode==='search'?' active':''}`} onClick={()=>setMode('search')}><Search size={13}/> بحث وظيفي</button>
        <button className={`dzt-mode-tab${mode==='cover'?' active':''}`} onClick={()=>setMode('cover')}><FileText size={13}/> رسالة تقدم</button>
      </div>

      <div className="dzt-form">
        <div className="dzt-row">
          <div className="dzt-field">
            <label className="dzt-label">{mode==='search' ? 'التخصص / المجال' : 'الوظيفة المستهدفة'}</label>
            <input className="dzt-input" value={form.domain} onChange={e=>set('domain',e.target.value)} placeholder="مطوّر ويب • محاسب • مهندس مدني..."/>
          </div>
          <div className="dzt-field">
            <label className="dzt-label">المدينة</label>
            <select className="dzt-select" value={form.city} onChange={e=>set('city',e.target.value)}>
              {CITIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="dzt-row">
          <div className="dzt-field">
            <label className="dzt-label">مستوى الخبرة</label>
            <select className="dzt-select" value={form.level} onChange={e=>set('level',e.target.value)}>
              {LEVELS.map(l=><option key={l.v} value={l.v}>{l.l}</option>)}
            </select>
          </div>
          {mode==='cover' && (
            <div className="dzt-field">
              <label className="dzt-label">لغة الرسالة</label>
              <select className="dzt-select" value={form.lang} onChange={e=>set('lang',e.target.value)}>
                <option value="ar">🇩🇿 العربية</option>
                <option value="fr">🇫🇷 الفرنسية</option>
              </select>
            </div>
          )}
        </div>
        {mode==='cover' && (
          <div className="dzt-field">
            <label className="dzt-label">اسم الوظيفة / الشركة (اختياري)</label>
            <input className="dzt-input" value={form.coverFor} onChange={e=>set('coverFor',e.target.value)} placeholder="مطوّر React لدى شركة TechDZ..."/>
          </div>
        )}
        <button className="dzt-btn" onClick={search} disabled={!form.domain.trim() || loading}>
          {loading ? <><span className="dzt-spinner"/> جاري البحث...</> : mode==='search' ? <><Search size={15}/> بحث الآن</> : <><FileText size={15}/> إنشاء الرسالة</>}
        </button>
      </div>

      {loading && <div className="dzt-loading"><div className="dzt-spinner"/>DZ Agent يبحث في المواقع الوظيفية...</div>}

      {result && (
        <div className="dzt-result">
          <div className="dzt-result-header">
            <span className="dzt-result-title">{mode==='search' ? '🔍 نتائج البحث الوظيفي' : '✉️ رسالة التقدم'}</span>
            <div className="dzt-result-actions">
              <button className="dzt-result-btn" onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(()=>setCopied(false),2000) }}>
                {copied ? <><Check size={12}/> تم</> : <><Copy size={12}/> نسخ</>}
              </button>
              <button className="dzt-result-btn" onClick={() => window.print()}><Printer size={12}/> طباعة</button>
            </div>
          </div>
          <div className="dzt-result-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></div>
        </div>
      )}
    </div>
  )
}

// ─── Health Agent Tool ─────────────────────────────────────────────────────────
function HealthTool() {
  const [mode, setMode] = useState<'symptoms' | 'doctor'>('symptoms')
  const [symptoms, setSymptoms] = useState('')
  const [age, setAge] = useState('')
  const [gender, setGender] = useState('male')
  const [city, setCity] = useState('الجزائر')
  const [specialty, setSpecialty] = useState('')
  const [result, setResult] = useState('')
  const [doctorData, setDoctorData] = useState<{ doctors: DoctorResult[]; dirs: DirLink[]; meta: { speciality: { ar: string; fr: string }; city: { ar: string; fr: string }; cached?: boolean } } | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const SPECIALTIES = ['طب عام','قلب وأوعية','عيون','أسنان','جلدية','أطفال','نساء وتوليد','عظام','مسالك بولية','جهاز هضمي','أعصاب','نفسية','أنف وأذن وحنجرة','رئة وتنفس','كلى','سكري وغدد','أورام','روماتولوجيا','أشعة وتصوير','تغذية ورجيم']
  const CITIES = ['الجزائر','وهران','قسنطينة','عنابة','سطيف','باتنة','تلمسان','بجاية','بليدة','تيزي وزو','ورقلة','مستغانم','المدية','برج بوعريريج','سيدي بلعباس','قالمة','جيجل','سكيكدة','البويرة','الأغواط']

  // SahaDoc specialty URL slugs mapping
  const SAHADOC_SLUGS: Record<string, string> = {
    'طب عام':           'medecin-generaliste',
    'قلب وأوعية':       'cardiologue',
    'عيون':             'ophtalmologue',
    'أسنان':            'dentiste',
    'جلدية':            'dermatologue',
    'أطفال':            'pediatre',
    'نساء وتوليد':      'gynecologue',
    'عظام':             'orthopediste',
    'مسالك بولية':      'urologue',
    'جهاز هضمي':        'gastro-enterologue',
    'أعصاب':            'neurologue',
    'نفسية':            'psychiatre',
    'أنف وأذن وحنجرة':  'orl-oto-rhino-laryngologiste',
    'رئة وتنفس':        'pneumologue',
    'كلى':              'nephrologue',
    'سكري وغدد':        'endocrinologue',
    'أورام':            'oncologue',
    'روماتولوجيا':      'rhumatologue',
    'أشعة وتصوير':      'radiologue',
    'تغذية ورجيم':      'nutritionniste',
  }

  const SAHADOC_CITIES: Record<string, string> = {
    'الجزائر':    'alger',
    'وهران':      'oran',
    'قسنطينة':    'constantine',
    'عنابة':      'annaba',
    'سطيف':       'setif',
    'باتنة':      'batna',
    'تلمسان':     'tlemcen',
    'بجاية':      'bejaia',
    'بليدة':      'blida',
    'تيزي وزو':   'tizi-ouzou',
    'ورقلة':      'ouargla',
    'مستغانم':    'mostaganem',
    'المدية':     'medea',
    'برج بوعريريج':'bordj-bou-arreridj',
    'سيدي بلعباس': 'sidi-bel-abbes',
    'قالمة':      'guelma',
    'جيجل':       'jijel',
    'سكيكدة':     'skikda',
    'البويرة':    'bouira',
    'الأغواط':    'laghouat',
  }

  const getSahadocUrl = () => {
    const slug = specialty ? SAHADOC_SLUGS[specialty] : null
    const citySlug = SAHADOC_CITIES[city]
    if (slug && citySlug) return `https://www.sahadoc.net/ar/docteur/s-${slug}/v-${citySlug}/`
    if (slug)             return `https://www.sahadoc.net/ar/docteur/s-${slug}/`
    return 'https://www.sahadoc.net/ar/docteur/'
  }

  const analyze = async () => {
    setLoading(true); setResult(''); setDoctorData(null)

    if (mode === 'symptoms') {
      // Always send symptoms to AI in Arabic regardless of input language
      // The AI is instructed to respond in Arabic
      const prompt = `[TOOL:SYMPTOM_ANALYZER — تحليل أعراض طبي — لا مقدمات — ابدأ مباشرةً بالعربية]

أنت طبيب مساعد ذكي مدرَّب على مصادر طبية معتمدة دولية وجزائرية. المريض: ${gender==='male'?'ذكر':'أنثى'}، العمر: ${age||'غير محدد'} سنة.

**الأعراض المُدخلة:** ${symptoms}

⚠️ مهم: مهما كانت لغة الأعراض أعلاه (عربية، فرنسية، إنجليزية، دارجة)، يجب أن يكون ردّك كله بالعربية الفصحى الواضحة.

التزم بهذه الأعراض فقط — لا تضف أعراضاً أخرى.

## 1. التشخيص التفريقي
2-4 حالات محتملة مرتّبة من الأعلى احتمالاً:
| الحالة | الاسم الطبي | الارتباط بالأعراض | الاحتمالية |
|--------|------------|-----------------|-----------|

## 2. درجة الاستعجال
🔴 طارئ / 🟡 موعد خلال 48 ساعة / 🟢 يمكن الانتظار أسبوع — مع مبرّر محدد.

## 3. التخصص الطبي الأنسب
الطبيب المناسب مع السبب، وما هي الفحوصات الأولية المتوقعة.

## 4. الإجراءات الفورية في المنزل
3-4 خطوات عملية يمكن تطبيقها الآن.

## 5. علامات التدهور — توجّه للطوارئ فوراً إذا ظهرت:
قائمة مختصرة بالأعراض التحذيرية.

## 6. مصادر طبية موثوقة للاطلاع (بالعربية)
اذكر روابط مفيدة من: WebMD عربي | Mayo Clinic | Vidal.fr | ada.com | my.clevelandclinic.org/health

⚠️ هذا تقييم استرشادي مبني على معلومات طبية موثوقة — لا يُغني عن استشارة الطبيب.`

      try {
        const res = await fetch('/api/dz-agent-chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], tool: 'health' })
        })
        const data = await res.json()
        setResult(data.content || '⚠️ فشل التحليل.')
      } catch { setResult('⚠️ خطأ في الاتصال.') }
      finally { setLoading(false) }

    } else {
      // Doctor search — use real doctor search API
      const SPECIALTY_FR: Record<string, string> = {
        'طب عام': 'medecin-generaliste', 'قلب وأوعية': 'cardiologue',
        'عيون': 'ophtalmologue', 'أسنان': 'dentiste', 'جلدية': 'dermatologue',
        'أطفال': 'pediatre', 'نساء وتوليد': 'gynecologue', 'عظام': 'orthopediste',
        'مسالك بولية': 'urologue', 'جهاز هضمي': 'gastro-enterologue',
        'أعصاب': 'neurologue', 'نفسية': 'psychiatre',
        'أنف وأذن وحنجرة': 'orl-oto-rhino-laryngologiste', 'رئة وتنفس': 'pneumologue',
        'كلى': 'nephrologue', 'سكري وغدد': 'endocrinologue', 'أورام': 'oncologue',
        'روماتولوجيا': 'rhumatologue', 'أشعة وتصوير': 'radiologue', 'تغذية ورجيم': 'nutritionniste',
      }
      const CITY_FR: Record<string, string> = {
        'الجزائر': 'alger', 'وهران': 'oran', 'قسنطينة': 'constantine',
        'عنابة': 'annaba', 'سطيف': 'setif', 'باتنة': 'batna',
        'تلمسان': 'tlemcen', 'بجاية': 'bejaia', 'بليدة': 'blida',
        'تيزي وزو': 'tizi-ouzou', 'ورقلة': 'ouargla', 'مستغانم': 'mostaganem',
        'المدية': 'medea', 'برج بوعريريج': 'bordj-bou-arreridj',
        'سيدي بلعباس': 'sidi-bel-abbes', 'قالمة': 'guelma',
        'جيجل': 'jijel', 'سكيكدة': 'skikda', 'البويرة': 'bouira', 'الأغواط': 'laghouat',
      }
      const specFr = SPECIALTY_FR[specialty] || 'medecin-generaliste'
      const cityFr = CITY_FR[city] || 'alger'
      const query = `طبيب ${specialty || 'طب عام'} في ${city}`

      try {
        const res = await fetch('/api/dz-agent/doctor-search', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, speciality: specFr, city: cityFr })
        })
        const data = await res.json()
        if (data.results && Array.isArray(data.results)) {
          const realDocs = data.results.filter((r: DoctorResult & { directoryLink?: boolean }) => !r.directoryLink)
          const dirs = data.results.filter((r: DoctorResult & { directoryLink?: boolean }) => r.directoryLink)
          setDoctorData({
            doctors: realDocs,
            dirs,
            meta: {
              speciality: { ar: specialty || 'طب عام', fr: specFr },
              city: { ar: city, fr: cityFr },
              cached: !!data.cached,
            }
          })
          if (realDocs.length === 0) {
            setResult('لم يتم العثور على أطباء في قاعدة البيانات لهذا التخصص والمدينة. جرّب ولاية أخرى أو تخصصاً مختلفاً.')
          }
        } else if (data.content) {
          setResult(data.content)
        } else {
          setResult('⚠️ لم يتم العثور على نتائج.')
        }
      } catch { setResult('⚠️ خطأ في الاتصال بخادم البحث.') }
      finally { setLoading(false) }
    }
  }

  const HEALTH_TIPS = [
    { icon: '🏃', tip: 'نشاط بدني يومي' },
    { icon: '💧', tip: '8 أكواب ماء' },
    { icon: '🍎', tip: 'غذاء متوازن' },
    { icon: '😴', tip: '7-8 ساعات نوم' },
    { icon: '🚭', tip: 'تجنب التدخين' },
    { icon: '🩺', tip: 'فحص دوري سنوي' },
  ]

  return (
    <div>
      <div className="dzt-tool-desc">
        <span className="dzt-tool-desc-icon">🏥</span>
        <div>
          <div className="dzt-tool-desc-title">وكيل الصحة الجزائري</div>
          <div className="dzt-tool-desc-text">تحليل الأعراض والبحث عن طبيب حسب ولايتك مع إرشادات صحية مخصصة.</div>
        </div>
      </div>

      <div className="dzt-health-tips">
        {HEALTH_TIPS.map(h => (
          <div key={h.tip} className="dzt-health-tip">
            <span>{h.icon}</span><span>{h.tip}</span>
          </div>
        ))}
      </div>

      <div className="dzt-mode-tabs">
        <button className={`dzt-mode-tab${mode==='symptoms'?' active':''}`} onClick={()=>setMode('symptoms')}><Heart size={13}/> تحليل الأعراض</button>
        <button className={`dzt-mode-tab${mode==='doctor'?' active':''}`} onClick={()=>setMode('doctor')}><Search size={13}/> ابحث عن طبيب</button>
      </div>

      <div className="dzt-form">
        {mode === 'symptoms' ? (<>
          <div className="dzt-row">
            <div className="dzt-field">
              <label className="dzt-label">الجنس</label>
              <select className="dzt-select" value={gender} onChange={e=>setGender(e.target.value)}>
                <option value="male">👨 ذكر</option>
                <option value="female">👩 أنثى</option>
              </select>
            </div>
            <div className="dzt-field">
              <label className="dzt-label">العمر (سنة)</label>
              <input className="dzt-input" type="number" min="1" max="120" value={age} onChange={e=>setAge(e.target.value)} placeholder="العمر"/>
            </div>
          </div>
          <div className="dzt-field">
            <label className="dzt-label">الأعراض التي تعاني منها *</label>
            <textarea className="dzt-textarea" value={symptoms} onChange={e=>setSymptoms(e.target.value)} placeholder="صف أعراضك بالتفصيل: منذ متى؟ أين تؤلمك؟ شدة الألم؟ أي أعراض أخرى مصاحبة؟" style={{minHeight:120}}/>
          </div>

          {/* Symptom Checkers — International Medical Sources */}
          <div className="dzt-symptom-checkers-label">🌍 أدوات تحليل الأعراض العالمية — للاستئناس:</div>
          <div className="dzt-symptom-checkers">
            <a href="https://symptoms.webmd.com" target="_blank" rel="noopener noreferrer" className="dzt-checker-btn">
              <span>🔬</span><span>WebMD</span>
            </a>
            <a href="https://www.mayoclinic.org/symptom-checker/select-symptom/itt-20009075" target="_blank" rel="noopener noreferrer" className="dzt-checker-btn">
              <span>🏛️</span><span>Mayo Clinic</span>
            </a>
            <a href="https://ada.com" target="_blank" rel="noopener noreferrer" className="dzt-checker-btn">
              <span>🤖</span><span>Ada Health</span>
            </a>
            <a href="https://www.buoyhealth.com" target="_blank" rel="noopener noreferrer" className="dzt-checker-btn">
              <span>💊</span><span>Buoy Health</span>
            </a>
            <a href="https://symptomate.com" target="_blank" rel="noopener noreferrer" className="dzt-checker-btn">
              <span>🩻</span><span>Symptomate</span>
            </a>
            <a href="https://www.babylonhealth.com/symptom-checker" target="_blank" rel="noopener noreferrer" className="dzt-checker-btn">
              <span>🌿</span><span>Babylon</span>
            </a>
            <a href="https://www.mediktor.com" target="_blank" rel="noopener noreferrer" className="dzt-checker-btn">
              <span>🧬</span><span>Mediktor</span>
            </a>
            <a href="https://your.md" target="_blank" rel="noopener noreferrer" className="dzt-checker-btn">
              <span>📋</span><span>Your.MD</span>
            </a>
            <a href="https://symptomchecker.isabelhealthcare.com" target="_blank" rel="noopener noreferrer" className="dzt-checker-btn">
              <span>🔍</span><span>Isabel</span>
            </a>
            <a href="https://my.clevelandclinic.org/health/symptoms" target="_blank" rel="noopener noreferrer" className="dzt-checker-btn">
              <span>🏥</span><span>Cleveland Clinic</span>
            </a>
          </div>

          <div className="dzt-health-emergency">
            ⚠️ في حالة طوارئ: اتصل بـ <strong>021 23 50 50</strong> (SAMU) أو توجه لأقرب مستعجلات
          </div>
          <button className="dzt-btn" onClick={analyze} disabled={!symptoms.trim() || loading}>
            {loading ? <><span className="dzt-spinner"/> جاري التحليل...</> : <><Heart size={15}/> تحليل الأعراض بالذكاء الاصطناعي</>}
          </button>
        </>) : (<>
          <div className="dzt-row">
            <div className="dzt-field">
              <label className="dzt-label">التخصص الطبي</label>
              <select className="dzt-select" value={specialty} onChange={e=>setSpecialty(e.target.value)}>
                <option value="">اختر التخصص</option>
                {SPECIALTIES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="dzt-field">
              <label className="dzt-label">الولاية / المدينة</label>
              <select className="dzt-select" value={city} onChange={e=>setCity(e.target.value)}>
                {CITIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {/* SahaDoc direct link — updates reactively with specialty + city */}
          <a
            href={getSahadocUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="dzt-sahadoc-btn"
          >
            <span className="dzt-sahadoc-icon">🩺</span>
            <span className="dzt-sahadoc-text">
              <strong>ابحث على SahaDoc</strong>
              <small>{specialty ? `${specialty} — ${city}` : `جميع الأطباء — ${city}`}</small>
            </span>
            <span className="dzt-sahadoc-arrow">↗</span>
          </a>

          <div className="dzt-health-links">
            <a href="https://www.sahadoc.net/ar/docteur/" target="_blank" rel="noopener noreferrer" className="dzt-job-board-btn">🩺 SahaDoc</a>
            <a href="https://www.cnas.dz" target="_blank" rel="noopener noreferrer" className="dzt-job-board-btn">🏛️ CNAS.dz</a>
            <a href="https://www.sante.gov.dz" target="_blank" rel="noopener noreferrer" className="dzt-job-board-btn">🏥 وزارة الصحة</a>
            <a href="https://www.casnos.com.dz" target="_blank" rel="noopener noreferrer" className="dzt-job-board-btn">📋 CASNOS</a>
          </div>
          <button className="dzt-btn" onClick={analyze} disabled={!specialty || loading}>
            {loading ? <><span className="dzt-spinner"/> جاري البحث...</> : <><Search size={15}/> ابحث الآن</>}
          </button>
        </>)}
      </div>

      {loading && <div className="dzt-loading"><div className="dzt-spinner"/>DZ Agent يبحث...</div>}

      {/* Doctor results panel */}
      {doctorData && !loading && (
        <DoctorResultsPanel
          doctors={doctorData.doctors}
          dirs={doctorData.dirs}
          meta={doctorData.meta}
        />
      )}

      {/* Symptom analysis result (always Arabic) */}
      {result && (
        <div className="dzt-result">
          <div className="dzt-result-header">
            <span className="dzt-result-title">{mode==='symptoms' ? '🩺 التقييم الصحي' : '👨‍⚕️ نتيجة البحث'}</span>
            <div className="dzt-result-actions">
              <button className="dzt-result-btn" onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(()=>setCopied(false),2000) }}>
                {copied ? <><Check size={12}/> تم</> : <><Copy size={12}/> نسخ</>}
              </button>
            </div>
          </div>
          <div className="dzt-result-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></div>
          {mode==='symptoms' && <div className="dzt-health-disclaimer">⚠️ هذا تقييم استرشادي فقط وليس تشخيصاً طبياً. استشر طبيبك دائماً.</div>}
        </div>
      )}
    </div>
  )
}


// ─── OCR Tool (Tesseract.js) ───────────────────────────────────────────────────
function OCRTool() {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [fileName, setFileName]   = useState('')
  const [mode, setMode]           = useState<'extract' | 'analyze'>('analyze')
  const [lang, setLang]           = useState('ara+fra+eng')
  const [ocrText, setOcrText]     = useState('')
  const [analysis, setAnalysis]   = useState('')
  const [progress, setProgress]   = useState(0)
  const [loading, setLoading]     = useState(false)
  const [copied, setCopied]       = useState(false)
  const [drag, setDrag]           = useState(false)
  const pdfRef  = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { return () => { if (imagePreview) URL.revokeObjectURL(imagePreview) } }, [imagePreview])

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    setImageFile(file)
    setFileName(file.name)
    setImagePreview(URL.createObjectURL(file))
    setOcrText(''); setAnalysis(''); setProgress(0)
  }

  const extract = async () => {
    if (!imageFile) return
    setLoading(true); setOcrText(''); setAnalysis(''); setProgress(0)
    try {
      const worker = await createWorker(lang, 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100))
        },
      })
      const { data } = await worker.recognize(imageFile)
      await worker.terminate()
      const extracted = data.text?.trim() || ''
      setOcrText(extracted)
      setProgress(100)

      if (mode === 'analyze' && extracted) {
        const aiRes = await fetch('/api/dz-agent-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content:
              `[TOOL:OCR_ANALYZER — تحليل وثيقة — لا مقدمات]\n\nحلّل النص التالي المستخرج من وثيقة ممسوحة ضوئياً وأَخرِج التحليل مباشرةً:\n\n"""\n${extracted.slice(0, 4000)}\n"""\n\n## نوع الوثيقة\n## الأطراف والتواريخ\n## البنود الأساسية\n## نقاط مهمة تستوجب الانتباه`
            }],
            tool: 'ocr',
          }),
        })
        const aiData = await aiRes.json()
        setAnalysis(aiData.content || '')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ غير معروف'
      setOcrText(`⚠️ فشل استخراج النص: ${msg}`)
    } finally { setLoading(false) }
  }

  const displayResult = mode === 'analyze' && analysis
    ? `## النص المستخرج\n\`\`\`\n${ocrText}\n\`\`\`\n\n---\n\n## التحليل\n${analysis}`
    : ocrText

  return (
    <div>
      <div className="dzt-tool-desc">
        <span className="dzt-tool-desc-icon">📷</span>
        <div>
          <div className="dzt-tool-desc-title">قارئ الوثائق — Tesseract OCR</div>
          <div className="dzt-tool-desc-text">ارفع صورة وثيقة ليستخرج Tesseract النص محلياً بدون إرسال الصورة للخادم. يدعم العربية والفرنسية والإنجليزية.</div>
        </div>
      </div>
      <div className="dzt-form">
        <div className="dzt-row">
          <div className="dzt-field">
            <label className="dzt-label">وضع المعالجة</label>
            <select className="dzt-select" value={mode} onChange={e => setMode(e.target.value as 'extract' | 'analyze')}>
              <option value="analyze">🔬 استخراج + تحليل ذكي</option>
              <option value="extract">📋 استخراج النص فقط</option>
            </select>
          </div>
          <div className="dzt-field">
            <label className="dzt-label">لغة الوثيقة</label>
            <select className="dzt-select" value={lang} onChange={e => setLang(e.target.value)}>
              <option value="ara+fra+eng">🌐 عربية + فرنسية + إنجليزية</option>
              <option value="ara">🇩🇿 عربية فقط</option>
              <option value="fra">🇫🇷 فرنسية فقط</option>
              <option value="eng">🇬🇧 إنجليزية فقط</option>
            </select>
          </div>
        </div>
        <div
          className="dzt-field"
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
        >
          <label className="dzt-label">رفع الصورة</label>
          <input ref={fileRef} type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} style={{ display: 'none' }} />
          <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${drag ? '#c8ff00' : '#333'}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: drag ? '#1a1a1a' : 'transparent', transition: 'all .2s' }}>
            {imagePreview ? (
              <div>
                <div style={{ fontSize: 13, color: '#c8ff00', marginBottom: 8 }}>✅ {fileName}</div>
                <img src={imagePreview} alt="preview" style={{ maxHeight: 160, maxWidth: '100%', borderRadius: 8, border: '1px solid #333' }} />
              </div>
            ) : (
              <div style={{ color: '#666' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
                <div style={{ fontSize: 13 }}>اسحب الصورة هنا أو انقر للاختيار</div>
                <div style={{ fontSize: 11, marginTop: 4, color: '#444' }}>JPG • PNG • WEBP • BMP</div>
              </div>
            )}
          </div>
        </div>
        {loading && progress > 0 && (
          <div style={{ margin: '8px 0' }}>
            <div style={{ fontSize: 12, color: '#c8ff00', marginBottom: 4 }}>جاري القراءة... {progress}%</div>
            <div style={{ background: '#222', borderRadius: 6, height: 6, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#c8ff00', transition: 'width .3s' }} />
            </div>
          </div>
        )}
        <button className="dzt-btn" onClick={extract} disabled={!imageFile || loading}>
          {loading ? <><span className="dzt-spinner" /> جاري الاستخراج...</> : '📷 استخراج النص'}
        </button>
      </div>
      {loading && <div className="dzt-loading"><div className="dzt-spinner" />Tesseract يقرأ الوثيقة...</div>}
      {ocrText && (
        <div className="dzt-result">
          <div className="dzt-result-header">
            <span className="dzt-result-title">📷 نتيجة OCR</span>
            <div className="dzt-result-actions">
              <button className="dzt-result-btn" onClick={() => { navigator.clipboard.writeText(displayResult); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                {copied ? <><Check size={12} /> تم</> : <><Copy size={12} /> نسخ</>}
              </button>
              <button className="dzt-result-btn dzt-pdf-btn" onClick={() => generatePDF(pdfRef, `ocr-result-dz.pdf`)}>📥 PDF</button>
            </div>
          </div>
          <div className="dzt-result-body" ref={pdfRef}><ReactMarkdown remarkPlugins={[remarkGfm]}>{displayResult}</ReactMarkdown></div>
        </div>
      )}
    </div>
  )
}


// ─── Business Plan Tool ────────────────────────────────────────────────────────
function BizPlanTool() {
  const [form, setForm] = useState({ projectName: '', sector: '', city: '', budget: '', target: '', description: '', lang: 'ar' })
  const pdfRef = useRef<HTMLDivElement>(null)
  const [result, setResult]   = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied]   = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const SECTORS = ['تجارة عامة','مطعم / كافيه','تقنية معلومات','خدمات','بناء وعقار','زراعة','صناعة','تعليم / تكوين','صحة','سياحة','تجارة إلكترونية','طاقة متجددة','نقل وشحن','أخرى']

  const generate = async () => {
    if (!form.projectName.trim() || !form.sector) return
    setLoading(true); setResult('')
    const langInstr = form.lang === 'ar' ? 'بالعربية الفصحى' : 'en français professionnel'
    const prompt = `[TOOL:BUSINESS_PLAN — وثيقة خطة عمل رسمية — لا مقدمات ولا تعليقات]

أنت خبير اقتصادي جزائري متخصص في دراسات الجدوى. أَخرِج خطة العمل مباشرةً بتنسيق Markdown ${langInstr}، دون أي جملة تمهيدية أو خاتمة.

# خطة عمل: ${form.projectName}

| البيان | التفاصيل |
|--------|---------|
| القطاع | ${form.sector} |
| المدينة | ${form.city || 'الجزائر العاصمة'} |
| رأس المال | ${form.budget || 'غير محدد'} دج |
| الفئة المستهدفة | ${form.target || 'غير محددة'} |
| الفكرة | ${form.description || 'غير محدد'} |

الأقسام المطلوبة:
1. **الملخص التنفيذي** — الفكرة، القيمة المضافة، الميزة التنافسية
2. **تحليل السوق الجزائرية** — حجم السوق، المنافسون، تحليل SWOT
3. **الهيكل القانوني** — EURL/SARL/SNC + خطوات التسجيل + التكلفة
4. **خطة التشغيل** — الموقع، التجهيزات، العمالة، الموردون
5. **الخطة المالية** — جدول تكاليف الانطلاق، توقعات 3 سنوات، نقطة التعادل
6. **استراتيجية التسويق** — القنوات، التسعير، الترويج
7. **جدول التنفيذ** (12 شهراً)
8. **مصادر التمويل** — ANSEJ، CNAC، ANADE، بنوك جزائرية

استخدم أرقاماً واقعية من السوق الجزائرية. أَخرِج الخطة مباشرةً.`

    try {
      const res = await fetch('/api/dz-agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], tool: 'bizplan' }),
      })
      const data = await res.json()
      setResult(data.content || '⚠️ فشل توليد خطة العمل.')
    } catch { setResult('⚠️ خطأ في الاتصال.') }
    finally { setLoading(false) }
  }

  return (
    <div>
      <div className="dzt-tool-desc">
        <span className="dzt-tool-desc-icon">📊</span>
        <div>
          <div className="dzt-tool-desc-title">مولّد خطة العمل — Business Plan</div>
          <div className="dzt-tool-desc-text">أنشئ خطة عمل كاملة لمشروعك في الجزائر مع تحليل SWOT، الخطة المالية، مصادر التمويل (ANSEJ/CNAC)، وجدول التنفيذ.</div>
        </div>
      </div>
      <div className="dzt-form">
        <div className="dzt-row">
          <div className="dzt-field">
            <label className="dzt-label">اسم المشروع *</label>
            <input className="dzt-input" value={form.projectName} onChange={e => set('projectName', e.target.value)} placeholder="مثال: كافيه الجزائر الجديد" />
          </div>
          <div className="dzt-field">
            <label className="dzt-label">القطاع *</label>
            <select className="dzt-select" value={form.sector} onChange={e => set('sector', e.target.value)}>
              <option value="">اختر القطاع</option>
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="dzt-row">
          <div className="dzt-field">
            <label className="dzt-label">المدينة / الولاية</label>
            <input className="dzt-input" value={form.city} onChange={e => set('city', e.target.value)} placeholder="الجزائر، وهران، قسنطينة..." />
          </div>
          <div className="dzt-field">
            <label className="dzt-label">رأس المال (دج)</label>
            <input className="dzt-input" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="مثال: 2,000,000" />
          </div>
        </div>
        <div className="dzt-field">
          <label className="dzt-label">الفئة المستهدفة</label>
          <input className="dzt-input" value={form.target} onChange={e => set('target', e.target.value)} placeholder="شباب 18-35، موظفون، عائلات..." />
        </div>
        <div className="dzt-field">
          <label className="dzt-label">وصف الفكرة</label>
          <textarea className="dzt-textarea" value={form.description} onChange={e => set('description', e.target.value)} placeholder="اشرح فكرة مشروعك بإيجاز..." style={{ minHeight: 80 }} />
        </div>
        <div className="dzt-field">
          <label className="dzt-label">لغة الخطة</label>
          <select className="dzt-select" value={form.lang} onChange={e => set('lang', e.target.value)}>
            <option value="ar">🇩🇿 عربية</option>
            <option value="fr">🇫🇷 فرنسية</option>
          </select>
        </div>
        <button className="dzt-btn" onClick={generate} disabled={!form.projectName.trim() || !form.sector || loading}>
          {loading ? <><span className="dzt-spinner" /> جاري إعداد خطة العمل...</> : '📊 توليد خطة العمل'}
        </button>
      </div>
      {loading && <div className="dzt-loading"><div className="dzt-spinner" />DZ Agent يُعدّ خطة عملك...</div>}
      {result && (
        <div className="dzt-result">
          <div className="dzt-result-header">
            <span className="dzt-result-title">📊 خطة العمل</span>
            <div className="dzt-result-actions">
              <button className="dzt-result-btn" onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                {copied ? <><Check size={12} /> تم</> : <><Copy size={12} /> نسخ</>}
              </button>
              <button className="dzt-result-btn" onClick={() => window.print()}><Printer size={12} /> طباعة</button>
              <button className="dzt-result-btn" onClick={() => { const b = new Blob([result], { type: 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `bizplan-${form.projectName.replace(/\s+/g,'-')}.txt`; a.click() }}><Download size={12} /> نص</button>
              <button className="dzt-result-btn dzt-pdf-btn" onClick={() => generatePDF(pdfRef, `bizplan-${form.projectName.replace(/\s+/g,'-')}.pdf`, form.lang === 'ar', `خطة عمل: ${form.projectName}`)}>📥 PDF</button>
            </div>
          </div>
          <div className="dzt-result-body" ref={pdfRef}><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></div>
        </div>
      )}
    </div>
  )
}

// ─── Image Search & Visual AI Tool ────────────────────────────────────────────
type ImageSearchResult = {
  id: string; title: string; url: string; thumbnail: string
  source: string; license: string; creator: string; detail_url: string
  width: number; height: number
}
type ReverseLink = { name: string; url: string; icon: string; color: string }
type AnalyzeMode = 'analyze' | 'ocr' | 'caption' | 'objects'
type ImageInput = { type: 'url'; value: string } | { type: 'base64'; value: string; mimeType: string }

function ImageTool() {
  const [mode, setMode] = useState<'search' | 'reverse' | 'analyze'>('search')

  const [query, setQuery]               = useState('')
  const [searchResults, setSearchResults] = useState<ImageSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchTotal, setSearchTotal]   = useState(0)
  const [searchError, setSearchError]   = useState('')

  const [reverseUrl, setReverseUrl]     = useState('')
  const [reverseBase64, setReverseBase64] = useState<{ data: string; mime: string } | null>(null)
  const [reverseLinks, setReverseLinks] = useState<ReverseLink[]>([])
  const [reverseLoading, setReverseLoading] = useState(false)
  const [reverseError, setReverseError] = useState('')
  const reverseFileRef = useRef<HTMLInputElement>(null)

  const [analyzeMode, setAnalyzeMode]   = useState<AnalyzeMode>('analyze')
  const [analyzeInput, setAnalyzeInput] = useState<ImageInput | null>(null)
  const [analyzeResult, setAnalyzeResult] = useState('')
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [copied, setCopied]             = useState(false)

  const analyzeFileRef = useRef<HTMLInputElement>(null)

  const handleImageFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = e => setAnalyzeInput({ type: 'base64', value: e.target?.result as string, mimeType: file.type })
    reader.readAsDataURL(file)
  }, [])

  const handleReverseFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setReverseBase64({ data: dataUrl, mime: file.type })
      setReverseUrl('')
      setReverseLinks([])
      setReverseError('')
    }
    reader.readAsDataURL(file)
  }, [])

  const search = useCallback(async () => {
    if (!query.trim()) return
    setSearchLoading(true); setSearchResults([]); setSearchError('')
    try {
      const res = await fetch(`/api/tools/image-search?q=${encodeURIComponent(query.trim())}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSearchResults(data.results || [])
      setSearchTotal(data.total || 0)
      if ((data.results || []).length === 0) setSearchError('لم تُوجد نتائج. جرّب كلمات مختلفة.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ'
      setSearchError(`⚠️ فشل البحث: ${msg}`)
      setSearchResults([])
    }
    finally { setSearchLoading(false) }
  }, [query])

  const doReverse = useCallback(async () => {
    const hasUrl = reverseUrl.trim()
    const hasFile = !!reverseBase64
    if (!hasUrl && !hasFile) return
    setReverseLoading(true); setReverseLinks([]); setReverseError('')
    try {
      if (hasFile && reverseBase64) {
        // Upload file: send base64 to image-analyze endpoint to get a hosted URL
        // For reverse search, we use the dataURL directly by uploading to a temp endpoint
        // Instead: generate reverse links using a data URI trick via image-analyze
        // Best approach: upload to server, get a temp URL back, then generate reverse links
        const uploadRes = await fetch('/api/tools/reverse-image-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: reverseBase64.data, mimeType: reverseBase64.mime }),
        })
        if (!uploadRes.ok) throw new Error(`HTTP ${uploadRes.status}`)
        const uploadData = await uploadRes.json()
        if (uploadData.error) throw new Error(uploadData.error)
        setReverseLinks(uploadData.links || [])
      } else {
        const res = await fetch(`/api/tools/reverse-image?url=${encodeURIComponent(reverseUrl.trim())}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setReverseLinks(data.links || [])
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ'
      setReverseError(`⚠️ فشل البحث العكسي: ${msg}`)
    }
    finally { setReverseLoading(false) }
  }, [reverseUrl, reverseBase64])

  const analyzeImage = useCallback(async () => {
    if (!analyzeInput) return
    setAnalyzeLoading(true); setAnalyzeResult(''); setAnalyzeError('')
    try {
      const body: Record<string, string> = { mode: analyzeMode }
      if (analyzeInput.type === 'base64') {
        body.imageBase64 = analyzeInput.value
        body.mimeType = analyzeInput.mimeType
      } else {
        body.imageUrl = analyzeInput.value
      }
      const res = await fetch('/api/tools/image-analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnalyzeResult(data.content || '⚠️ فشل التحليل.')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ في الاتصال'
      setAnalyzeError(`⚠️ ${msg}`)
    }
    finally { setAnalyzeLoading(false) }
  }, [analyzeInput, analyzeMode])

  const ANALYZE_MODES: { v: AnalyzeMode; l: string; d: string; icon: string }[] = [
    { v: 'analyze', l: 'تحليل كامل',    d: 'وصف شامل لكل عناصر الصورة',     icon: '🔬' },
    { v: 'ocr',     l: 'استخراج نص',   d: 'OCR — قراءة النصوص من الصورة',  icon: '📝' },
    { v: 'caption', l: 'وصف مختصر',    d: 'Caption — جملة وصفية موجزة',    icon: '💬' },
    { v: 'objects', l: 'كشف العناصر',  d: 'Object Detection — تحديد الأشياء', icon: '🎯' },
  ]

  return (
    <div>
      <div className="dzt-tool-desc">
        <span className="dzt-tool-desc-icon">🖼️</span>
        <div>
          <div className="dzt-tool-desc-title">Visual AI — البحث والتحليل البصري</div>
          <div className="dzt-tool-desc-text">ابحث عن الصور مجاناً • بحث عكسي (Google Lens / Yandex / TinEye) • تحليل الصور بـ Gemini Vision • OCR ذكي</div>
        </div>
      </div>

      <div className="dzt-mode-tabs">
        <button className={`dzt-mode-tab${mode === 'search'  ? ' active' : ''}`} onClick={() => setMode('search')}>
          <Search size={13} /> بحث عن صور
        </button>
        <button className={`dzt-mode-tab${mode === 'reverse' ? ' active' : ''}`} onClick={() => setMode('reverse')}>
          <RotateCcw size={13} /> بحث عكسي
        </button>
        <button className={`dzt-mode-tab${mode === 'analyze' ? ' active' : ''}`} onClick={() => setMode('analyze')}>
          <ScanSearch size={13} /> تحليل AI
        </button>
      </div>

      {/* ── Text Image Search ── */}
      {mode === 'search' && (
        <div>
          <div className="dzt-img-search-bar">
            <input
              className="dzt-input dzt-img-query-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="ابحث عن صور... مثال: علم الجزائر، شروق الشمس، مدينة وهران..."
              dir="rtl"
            />
            <button className="dzt-btn dzt-img-search-btn" onClick={search} disabled={!query.trim() || searchLoading}>
              {searchLoading ? <span className="dzt-spinner" /> : <Search size={14} />}
              {searchLoading ? 'جاري...' : 'بحث'}
            </button>
          </div>
          <div className="dzt-img-source-note">
            🌐 الصور من <strong>Openverse</strong> — مكتبة مفتوحة المصدر بترخيص Creative Commons
          </div>
          {searchLoading && <div className="dzt-loading"><div className="dzt-spinner" />جاري البحث في مكتبة الصور...</div>}
          {searchError && <div className="dzt-img-empty">{searchError}</div>}
          {!searchLoading && searchResults.length > 0 && (
            <div>
              <div className="dzt-img-results-header">
                <span>🖼️ {searchResults.length} صورة من {searchTotal.toLocaleString('ar-DZ')} نتيجة</span>
              </div>
              <div className="dzt-img-grid">
                {searchResults.map(img => (
                  <div key={img.id} className="dzt-img-card">
                    <div className="dzt-img-card-inner">
                      <img src={img.thumbnail} alt={img.title} loading="lazy" className="dzt-img-thumb"
                        onError={e => { (e.target as HTMLImageElement).src = img.url }} />
                      <div className="dzt-img-card-overlay">
                        <div className="dzt-img-card-title">{img.title}</div>
                        {(img.creator || img.license) && (
                          <div className="dzt-img-card-meta">
                            {img.creator && <span>{img.creator}</span>}
                            <span className="dzt-img-license">{img.license}</span>
                          </div>
                        )}
                        <div className="dzt-img-card-actions">
                          <a href={img.url} target="_blank" rel="noopener noreferrer" className="dzt-img-action-btn">⬆️ فتح</a>
                          <button className="dzt-img-action-btn" onClick={() => navigator.clipboard.writeText(img.url)}>🔗 نسخ</button>
                          <a href={img.url} download className="dzt-img-action-btn">⬇️ تحميل</a>
                          <button className="dzt-img-action-btn" onClick={() => { setMode('reverse'); setReverseUrl(img.url); setReverseBase64(null); setReverseLinks([]) }}>
                            🔍 عكسي
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Reverse Image Search ── */}
      {mode === 'reverse' && (
        <div>
          <div className="dzt-img-reverse-desc">
            ابحث عن مصدر صورة، تحقق من أصالتها، أو اعثر على صور مشابهة. يمكنك إدخال رابط <strong>أو رفع صورة مباشرة</strong>.
          </div>

          {/* URL input row */}
          <div className="dzt-img-search-bar" style={{ marginBottom: 8 }}>
            <input
              className="dzt-input dzt-img-query-input"
              value={reverseUrl}
              onChange={e => { setReverseUrl(e.target.value); setReverseBase64(null); setReverseLinks([]); setReverseError('') }}
              onKeyDown={e => e.key === 'Enter' && doReverse()}
              placeholder="الصق رابط الصورة... https://example.com/photo.jpg"
              dir="ltr"
            />
            <button className="dzt-btn dzt-img-search-btn" onClick={doReverse}
              disabled={(!reverseUrl.trim() && !reverseBase64) || reverseLoading}>
              {reverseLoading ? <span className="dzt-spinner" /> : <RotateCcw size={14} />}
              {reverseLoading ? 'جاري...' : 'بحث عكسي'}
            </button>
          </div>

          {/* Upload button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ color: '#888', fontSize: 13 }}>أو</span>
            <button className="dzt-btn dzt-img-upload-btn" onClick={() => reverseFileRef.current?.click()}>
              <Upload size={13} /> ارفع صورة للبحث العكسي
            </button>
            <input ref={reverseFileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleReverseFile(f) }} />
            {reverseBase64 && (
              <button className="dzt-img-clear-btn" onClick={() => { setReverseBase64(null); setReverseLinks([]); setReverseError('') }}>✕ إزالة</button>
            )}
          </div>

          {/* Preview */}
          {(reverseUrl.trim() || reverseBase64) && (
            <div className="dzt-img-reverse-preview">
              <img
                src={reverseBase64 ? reverseBase64.data : reverseUrl}
                alt="preview" className="dzt-img-reverse-thumb"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}

          {reverseError && <div className="dzt-img-empty">{reverseError}</div>}

          {reverseLinks.length > 0 && (
            <div className="dzt-img-reverse-links">
              <div className="dzt-img-reverse-title">ابحث عن هذه الصورة في:</div>
              <div className="dzt-img-reverse-grid">
                {reverseLinks.map(link => (
                  <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="dzt-img-reverse-link" style={{ '--lc': link.color } as React.CSSProperties}>
                    <span className="dzt-img-reverse-link-icon">{link.icon}</span>
                    <span className="dzt-img-reverse-link-name">{link.name}</span>
                    <span className="dzt-img-reverse-link-arrow">→</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {!reverseLinks.length && !reverseLoading && !reverseError && (
            <div className="dzt-img-reverse-tips">
              <div className="dzt-img-tips-title">💡 كيف تستخدم البحث العكسي؟</div>
              <ul className="dzt-img-tips-list">
                <li>الصق رابط صورة أو ارفع صورة من جهازك</li>
                <li>سيُولَّد روابط مباشرة لكل محرك بحث</li>
                <li>انقر على أي رابط للبحث فوراً</li>
                <li>مفيد للتحقق من مصدر الصورة ومعرفة هل هي مزيفة</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── AI Image Analysis ── */}
      {mode === 'analyze' && (
        <div>
          <div className="dzt-img-analyze-modes">
            {ANALYZE_MODES.map(m => (
              <button
                key={m.v}
                className={`dzt-img-analyze-mode${analyzeMode === m.v ? ' active' : ''}`}
                onClick={() => { setAnalyzeMode(m.v); setAnalyzeResult('') }}
              >
                <span className="dzt-img-analyze-mode-icon">{m.icon}</span>
                <span className="dzt-img-analyze-mode-label">{m.l}</span>
                <span className="dzt-img-analyze-mode-desc">{m.d}</span>
              </button>
            ))}
          </div>

          <div className="dzt-img-analyze-input">
            <div className="dzt-img-analyze-input-title">الصورة المراد تحليلها:</div>
            <div className="dzt-img-analyze-input-row">
              <input
                className="dzt-input"
                placeholder="الصق رابط الصورة... https://..."
                value={analyzeInput?.type === 'url' ? analyzeInput.value : ''}
                onChange={e => { setAnalyzeInput({ type: 'url', value: e.target.value }); setAnalyzeResult('') }}
                dir="ltr"
              />
              <span className="dzt-img-or">أو</span>
              <button className="dzt-btn dzt-img-upload-btn" onClick={() => analyzeFileRef.current?.click()}>
                <ImageIcon size={13} /> ارفع صورة
              </button>
              <input
                ref={analyzeFileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { handleImageFile(f); setAnalyzeResult('') } }}
              />
            </div>
            {analyzeInput && (
              <div className="dzt-img-analyze-preview">
                <img
                  src={analyzeInput.value}
                  alt="preview"
                  className="dzt-img-analyze-preview-img"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <button className="dzt-img-clear-btn" onClick={() => { setAnalyzeInput(null); setAnalyzeResult('') }}>✕</button>
              </div>
            )}
          </div>

          <button className="dzt-btn" onClick={analyzeImage} disabled={!analyzeInput || analyzeLoading}>
            {analyzeLoading ? <><span className="dzt-spinner" /> جاري التحليل...</> : <><ScanSearch size={14} /> تحليل بالذكاء الاصطناعي</>}
          </button>

          {analyzeLoading && (
            <div className="dzt-loading"><div className="dzt-spinner" />Gemini Vision يحلل الصورة...</div>
          )}
          {analyzeError && <div className="dzt-img-empty">{analyzeError}</div>}
          {analyzeResult && (
            <div className="dzt-result">
              <div className="dzt-result-header">
                <span className="dzt-result-title">🧠 نتيجة التحليل</span>
                <div className="dzt-result-actions">
                  <button className="dzt-result-btn" onClick={() => { navigator.clipboard.writeText(analyzeResult); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                    {copied ? <><Check size={12} /> تم</> : <><Copy size={12} /> نسخ</>}
                  </button>
                </div>
              </div>
              <div className="dzt-result-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{analyzeResult}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main DZTools Page ────────────────────────────────────────────────────────
export default function DZTools() {
  const navigate = useNavigate()
  const [active, setActive] = useState<ToolId>('cv')
  const { track } = useMiniPlayer()
  const miniPlayerActive = !!track

  const contentPb = miniPlayerActive ? 140 : 80

  return (
    <div className="dzt-layout">
      <div className="dzt-header">
        <button className="dzt-back" onClick={() => navigate('/dz-agent')}>
          <ArrowRight size={18} />
        </button>
        <div className="dzt-brand">
          <div className="dzt-brand-name">🛠️ DZ Tools</div>
          <div className="dzt-brand-sub">مدعم بـ 16 وكيل · 39 مهارة متخصصة</div>
        </div>
      </div>

      <div className="dzt-tabs">
        {TOOLS.map(t => (
          <button
            key={t.id}
            className={`dzt-tab${active === t.id ? ' active' : ''}`}
            onClick={() => setActive(t.id)}
            style={{ position: 'relative' }}
          >
            <span className="dzt-tab-icon">{t.icon}</span>
            {t.name}
            {t.badge && (
              <span style={{ position: 'absolute', top: -6, right: -4, background: '#c8ff00', color: '#000', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8, lineHeight: 1.4 }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="dzt-content" style={{ paddingBottom: contentPb }}>
        {active === 'cv'      && <CVTool />}
        {active === 'planner' && <PlannerTool />}
        {active === 'docs'    && <BizDocsTool />}
        {active === 'jobs'    && <JobSearchTool />}
        {active === 'health'  && <HealthTool />}
        {active === 'image'   && <ImageTool />}
        {active === 'ocr'     && <OCRTool />}
        {active === 'bizplan' && <BizPlanTool />}
      </div>
    </div>
  )
}
