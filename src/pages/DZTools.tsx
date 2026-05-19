import { useState, useRef, useEffect, useCallback } from 'react'
import SpreadsheetTool from '../components/SpreadsheetTool'
import { createWorker } from 'tesseract.js'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Copy, Check, Printer, Download, Search, Heart, FileText, Upload, BarChart2, QrCode, Calculator } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
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

type ToolId = 'cv' | 'planner' | 'docs' | 'jobs' | 'health' | 'ocr' | 'bizplan' | 'invoice' | 'tax' | 'pension' | 'qrcode' | 'bizcard' | 'dataanalysis' | 'excel' | 'hashtag' | 'darija' | 'zakat'

const TOOLS: { id: ToolId; icon: string; name: string; desc: string; badge?: string }[] = [
  { id: 'cv',           icon: '📄', name: 'مولّد السيرة الذاتية',   desc: 'أنشئ سيرة ذاتية احترافية بالعربية أو الفرنسية في ثوانٍ' },
  { id: 'planner',      icon: '📋', name: 'مخطط المشاريع',           desc: 'حوّل فكرتك إلى خطة عمل تفصيلية مع مهام وجدول زمني' },
  { id: 'docs',         icon: '📑', name: 'وثائق تجارية',            desc: 'عقود عمل • مراسلات • عروض أسعار • محاضر اجتماعات' },
  { id: 'jobs',         icon: '💼', name: 'بحث وظيفي',              desc: 'ابحث عن وظيفة في الجزائر واحصل على مساعدة في رسالة التقدم' },
  { id: 'health',       icon: '🏥', name: 'وكيل الصحة',             desc: 'تحليل الأعراض • البحث عن طبيب • نصائح صحية للجزائر' },
  { id: 'invoice',      icon: '🧾', name: 'مولّد الفواتير',          desc: 'فواتير جزائرية احترافية — TVA • HT • TTC — تحميل PDF' },
  { id: 'tax',          icon: '🧮', name: 'مُحاسب الضرائب',          desc: 'IRG (ضريبة الدخل) • IBS (ضريبة الشركات) — شرائح 2024' },
  { id: 'darija',       icon: '🗣️', name: 'مترجم الدارجة الجزائرية',  desc: 'عربي/فرنسي ↔ دارجة جزائرية — شرق · غرب · وسط · جنوب — بالذكاء الاصطناعي', badge: 'NEW' },
  { id: 'zakat',        icon: '☪️', name: 'حاسبة الزكاة الشاملة',     desc: 'زكاة المال · الذهب · الفضة · التجارة · الزروع — بالدينار الجزائري 2025', badge: 'NEW' },
  { id: 'hashtag',      icon: '#️⃣', name: 'مولّد الهاشتاغات AI',      desc: 'اكتب موضوعك → AI يولد أفضل الهاشتاغات لكل منصة مصنّفة حسب الشعبية', badge: 'NEW' },
  { id: 'excel',        icon: '📊', name: 'محرر Excel الذكي',         desc: 'جدول بيانات كامل + 30 دالة + مساعد AI للدوال — استيراد/تصدير XLSX', badge: 'NEW' },
  { id: 'pension',      icon: '🏦', name: 'حاسبة التقاعد CNAS',      desc: 'احسب اشتراكاتك ومعاشك المتوقع — CNAS موظف · CASNOS مستقل', badge: 'NEW' },
  { id: 'qrcode',       icon: '📲', name: 'مولّد QR Code',           desc: 'أنشئ QR Code احترافي لأي نص أو رابط أو معلومات — تحميل فوري', badge: 'NEW' },
  { id: 'bizcard',      icon: '🪪', name: 'بطاقة العمل',             desc: 'صمّم بطاقة عمل احترافية بالعربية والفرنسية — تصدير PDF', badge: 'NEW' },
  { id: 'dataanalysis', icon: '📈', name: 'محلل البيانات',           desc: 'ارفع ملف Excel أو CSV — تحليل ذكي + رسوم بيانية + ملخص AI', badge: 'NEW' },
  { id: 'ocr',          icon: '📷', name: 'قارئ الوثائق OCR',       desc: 'ارفع صورة واستخرج النص تلقائياً بـ Tesseract' },
  { id: 'bizplan',      icon: '📊', name: 'خطة العمل Business Plan', desc: 'خطة عمل كاملة لمشروعك في الجزائر مع أرقام حقيقية' },
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
        ? `[TOOL:CV_GENERATOR — لا مقدمات — لا شرح — لا تعليقات — ابدأ مباشرةً بالسيرة الذاتية — السيرة الذاتية فقط]

أنشئ سيرة ذاتية احترافية بالعربية بتنسيق Markdown منظم مع عناوين واضحة، باستخدام هذه المعلومات فقط:

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

قاعدة صارمة: ابدأ مباشرةً بـ # اسم الشخص — لا تكتب أي جملة تمهيدية أو شرح قبل السيرة الذاتية.`
        : `[TOOL:CV_GENERATOR — NO PREAMBLE — NO EXPLANATION — START DIRECTLY WITH THE CV — CV CONTENT ONLY]

Créez un CV professionnel en français au format Markdown structuré, en utilisant uniquement ces informations:

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

Règle stricte: commencez directement par # Nom — aucune phrase d'introduction ni explication avant le CV.`

      const res = await fetch('/api/dz-agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], tool: 'cv' }),
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

## 5. علامات الخطر — راجع الطبيب فوراً إذا ظهرت:
قائمة مختصرة بالأعراض التحذيرية التي تستدعي التدخل العاجل.

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
          <div className="dzt-tool-desc-title">قارئ الوثائق — DZ OCR</div>
          <div className="dzt-tool-desc-text">ارفع صورة وثيقة ليستخرج DZ OCR النص محلياً بدون إرسال الصورة للخادم. يدعم العربية والفرنسية والإنجليزية.</div>
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
      {loading && <div className="dzt-loading"><div className="dzt-spinner" />DZ OCR يقرأ الوثيقة...</div>}
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

// ─── Invoice Tool ─────────────────────────────────────────────────────────────
type InvoiceItem = { id: number; desc: string; qty: string; price: string; tva: string }

const TVA_RATES = [
  { label: 'TVA 19% (عادي)', value: '19' },
  { label: 'TVA 9% (مخفض)', value: '9' },
  { label: 'معفى 0%',       value: '0'  },
]

let _invoiceItemId = 1

function newItem(): InvoiceItem {
  return { id: _invoiceItemId++, desc: '', qty: '1', price: '', tva: '19' }
}

function fmt(n: number) {
  return n.toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DA'
}

function InvoiceTool() {
  const [company, setCompany] = useState({ name: '', address: '', nif: '', nis: '', rc: '', phone: '', email: '' })
  const [client,  setClient]  = useState({ name: '', address: '', nif: '' })
  const [meta,    setMeta]    = useState({ num: '', date: new Date().toISOString().slice(0,10), due: '', note: '' })
  const [items,   setItems]   = useState<InvoiceItem[]>([newItem()])
  const printRef = useRef<HTMLDivElement>(null)

  const setC = (k: string, v: string) => setCompany(p => ({ ...p, [k]: v }))
  const setL = (k: string, v: string) => setClient(p => ({ ...p, [k]: v }))
  const setM = (k: string, v: string) => setMeta(p => ({ ...p, [k]: v }))

  const updateItem = (id: number, k: keyof InvoiceItem, v: string) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, [k]: v } : it))
  const addItem    = () => setItems(prev => [...prev, newItem()])
  const removeItem = (id: number) => setItems(prev => prev.length > 1 ? prev.filter(it => it.id !== id) : prev)

  // ── Calculations ──────────────────────────────────────────────────────────
  const rows = items.map(it => {
    const qty   = parseFloat(it.qty)  || 0
    const price = parseFloat(it.price) || 0
    const tva   = parseFloat(it.tva)  || 0
    const ht    = qty * price
    const tvaAmt = ht * tva / 100
    return { ...it, ht, tvaAmt, ttc: ht + tvaAmt }
  })

  const totalHT  = rows.reduce((s, r) => s + r.ht, 0)
  const totalTVA = rows.reduce((s, r) => s + r.tvaAmt, 0)
  const totalTTC = totalHT + totalTVA

  // Group TVA lines
  const tvaGroups: Record<string, number> = {}
  rows.forEach(r => {
    const k = r.tva + '%'
    tvaGroups[k] = (tvaGroups[k] || 0) + r.tvaAmt
  })

  // ── PDF Print ─────────────────────────────────────────────────────────────
  const printPDF = () => {
    const win = window.open('', '_blank')
    if (!win) return
    const itemRows = rows.map(r => `
      <tr>
        <td>${r.desc || '—'}</td>
        <td class="num">${parseFloat(r.qty)||0}</td>
        <td class="num">${parseFloat(r.price)||0}</td>
        <td class="num">${r.tva}%</td>
        <td class="num">${r.ht.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</td>
        <td class="num">${r.tvaAmt.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</td>
        <td class="num"><strong>${r.ttc.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</strong></td>
      </tr>`).join('')

    const tvaLines = Object.entries(tvaGroups)
      .filter(([,v]) => v > 0)
      .map(([k,v]) => `<tr><td>TVA ${k}</td><td class="num">${v.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</td></tr>`).join('')

    win.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><title>فاتورة ${meta.num}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;direction:rtl;font-size:13px;color:#111;background:#fff;padding:0}
.header{background:linear-gradient(135deg,#0a3d1f,#1a6b3c);color:#fff;padding:24px 40px;display:flex;justify-content:space-between;align-items:flex-start}
.brand{font-size:22px;font-weight:800;letter-spacing:-.5px}
.brand-sub{font-size:11px;opacity:.75;margin-top:4px}
.inv-badge{background:rgba(255,255,255,.15);border-radius:8px;padding:10px 18px;text-align:center}
.inv-badge .num{font-size:18px;font-weight:800;color:#c8ff00}
.inv-badge .label{font-size:10px;opacity:.7}
.body{padding:28px 40px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px}
.party{background:#f9fafb;border-radius:10px;padding:14px 18px;border:1px solid #e5e7eb}
.party-title{font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.party-name{font-size:15px;font-weight:700;color:#111;margin-bottom:6px}
.party-detail{font-size:12px;color:#555;line-height:1.7}
.meta{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
.meta-item{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 14px;font-size:12px}
.meta-item strong{display:block;font-size:10px;color:#16a34a;font-weight:700;margin-bottom:2px}
table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12.5px}
thead tr{background:#0a3d1f;color:#fff}
th{padding:10px 12px;text-align:right;font-weight:700;font-size:11px}
td{padding:9px 12px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
tr:nth-child(even) td{background:#f9fafb}
.num{text-align:center}
.totals{display:flex;justify-content:flex-start;flex-direction:column;align-items:flex-end;gap:4px}
.total-row{display:flex;gap:32px;justify-content:flex-end;font-size:13px;padding:4px 0}
.total-row.ht{color:#555}
.total-row.tva{color:#2563eb}
.total-row.ttc{font-size:17px;font-weight:800;color:#0a3d1f;border-top:2px solid #c8ff00;padding-top:10px;margin-top:6px}
.total-label{width:160px;text-align:right}
.total-val{width:150px;text-align:left;font-weight:600}
.note{margin-top:20px;padding:12px 18px;background:#fafff5;border-radius:8px;border:1px solid #d1fae5;font-size:12px;color:#555}
.footer{border-top:1px solid #e5e7eb;padding:12px 40px;font-size:10.5px;color:#9ca3af;text-align:center;margin-top:24px}
@media print{body{padding:0}@page{margin:0}}
</style></head>
<body>
<div class="header">
  <div>
    <div class="brand">${company.name || 'اسم الشركة'}</div>
    <div class="brand-sub">${company.address || ''}</div>
    ${company.nif?`<div class="brand-sub">NIF: ${company.nif}</div>`:''}
    ${company.nis?`<div class="brand-sub">NIS: ${company.nis}</div>`:''}
    ${company.rc ?`<div class="brand-sub">RC: ${company.rc}</div>`:''}
    ${company.phone?`<div class="brand-sub">📞 ${company.phone}</div>`:''}
  </div>
  <div class="inv-badge">
    <div class="label">FACTURE N°</div>
    <div class="num">${meta.num || '---'}</div>
    <div class="label">Date: ${meta.date}</div>
    ${meta.due?`<div class="label">Échéance: ${meta.due}</div>`:''}
  </div>
</div>
<div class="body">
  <div class="parties">
    <div class="party">
      <div class="party-title">FOURNISSEUR</div>
      <div class="party-name">${company.name||'—'}</div>
      <div class="party-detail">${company.address||''}<br>${company.email||''}</div>
    </div>
    <div class="party">
      <div class="party-title">CLIENT</div>
      <div class="party-name">${client.name||'—'}</div>
      <div class="party-detail">${client.address||''}${client.nif?`<br>NIF: ${client.nif}`:''}</div>
    </div>
  </div>
  <table>
    <thead><tr>
      <th style="width:35%">الوصف</th>
      <th class="num" style="width:8%">الكمية</th>
      <th class="num" style="width:14%">سعر الوحدة (DA)</th>
      <th class="num" style="width:8%">TVA</th>
      <th class="num" style="width:12%">المجموع HT</th>
      <th class="num" style="width:12%">مبلغ TVA</th>
      <th class="num" style="width:11%">المجموع TTC</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="totals">
    <div class="total-row ht"><span class="total-label">المجموع HT</span><span class="total-val">${totalHT.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</span></div>
    ${tvaLines}
    <div class="total-row ttc"><span class="total-label">الإجمالي TTC</span><span class="total-val">${totalTTC.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</span></div>
  </div>
  ${meta.note?`<div class="note"><strong>ملاحظات:</strong> ${meta.note}</div>`:''}
</div>
<div class="footer">DZ Tools — مولّد الفواتير الجزائري | dz-gpt.vercel.app</div>
</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 700)
  }

  const inputCls = 'dzt-inv-input'

  return (
    <div className="dzt-invoice-wrap">
      {/* ── Company ───────────────────────────────────────────────── */}
      <div className="dzt-inv-section">
        <div className="dzt-inv-section-title">🏢 معلومات الشركة / المورّد</div>
        <div className="dzt-inv-grid2">
          <input className={inputCls} placeholder="اسم الشركة *" value={company.name}    onChange={e=>setC('name',e.target.value)} />
          <input className={inputCls} placeholder="رقم الهاتف"   value={company.phone}   onChange={e=>setC('phone',e.target.value)} />
          <input className={inputCls} placeholder="العنوان"       value={company.address} onChange={e=>setC('address',e.target.value)} />
          <input className={inputCls} placeholder="البريد الإلكتروني" value={company.email} onChange={e=>setC('email',e.target.value)} />
          <input className={inputCls} placeholder="NIF"           value={company.nif}     onChange={e=>setC('nif',e.target.value)} />
          <input className={inputCls} placeholder="NIS"           value={company.nis}     onChange={e=>setC('nis',e.target.value)} />
          <input className={inputCls} placeholder="RC"            value={company.rc}      onChange={e=>setC('rc',e.target.value)} />
        </div>
      </div>

      {/* ── Client ────────────────────────────────────────────────── */}
      <div className="dzt-inv-section">
        <div className="dzt-inv-section-title">👤 معلومات العميل</div>
        <div className="dzt-inv-grid2">
          <input className={inputCls} placeholder="اسم العميل *" value={client.name}    onChange={e=>setL('name',e.target.value)} />
          <input className={inputCls} placeholder="NIF العميل"   value={client.nif}     onChange={e=>setL('nif',e.target.value)} />
          <input className={inputCls} placeholder="عنوان العميل" value={client.address} onChange={e=>setL('address',e.target.value)} style={{gridColumn:'span 2'}} />
        </div>
      </div>

      {/* ── Meta ──────────────────────────────────────────────────── */}
      <div className="dzt-inv-section">
        <div className="dzt-inv-section-title">📋 بيانات الفاتورة</div>
        <div className="dzt-inv-grid3">
          <div><label className="dzt-inv-label">رقم الفاتورة</label><input className={inputCls} placeholder="001" value={meta.num} onChange={e=>setM('num',e.target.value)} /></div>
          <div><label className="dzt-inv-label">تاريخ الإصدار</label><input className={inputCls} type="date" value={meta.date} onChange={e=>setM('date',e.target.value)} /></div>
          <div><label className="dzt-inv-label">تاريخ الاستحقاق</label><input className={inputCls} type="date" value={meta.due} onChange={e=>setM('due',e.target.value)} /></div>
        </div>
      </div>

      {/* ── Items ─────────────────────────────────────────────────── */}
      <div className="dzt-inv-section">
        <div className="dzt-inv-section-title">🛒 المنتجات / الخدمات</div>
        <div className="dzt-inv-items-header">
          <span style={{flex:'2 1 180px'}}>الوصف</span>
          <span style={{flex:'0 0 80px',textAlign:'center'}}>الكمية</span>
          <span style={{flex:'0 0 120px',textAlign:'center'}}>سعر الوحدة (DA)</span>
          <span style={{flex:'0 0 110px',textAlign:'center'}}>TVA</span>
          <span style={{flex:'0 0 120px',textAlign:'center'}}>المجموع HT</span>
          <span style={{width:32}}></span>
        </div>
        {items.map(it => {
          const qty   = parseFloat(it.qty)   || 0
          const price = parseFloat(it.price)  || 0
          const ht    = qty * price
          return (
            <div key={it.id} className="dzt-inv-item-row">
              <input className={inputCls} placeholder="وصف المنتج أو الخدمة" value={it.desc} onChange={e=>updateItem(it.id,'desc',e.target.value)} style={{flex:'2 1 180px'}} />
              <input className={inputCls} type="number" min="0" placeholder="1" value={it.qty} onChange={e=>updateItem(it.id,'qty',e.target.value)} style={{flex:'0 0 80px',textAlign:'center'}} />
              <input className={inputCls} type="number" min="0" placeholder="0.00" value={it.price} onChange={e=>updateItem(it.id,'price',e.target.value)} style={{flex:'0 0 120px',textAlign:'center'}} />
              <select className={inputCls} value={it.tva} onChange={e=>updateItem(it.id,'tva',e.target.value)} style={{flex:'0 0 110px'}}>
                {TVA_RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <div className="dzt-inv-line-total" style={{flex:'0 0 120px'}}>
                {fmt(ht)}
              </div>
              <button className="dzt-inv-del-btn" onClick={()=>removeItem(it.id)} title="حذف">✕</button>
            </div>
          )
        })}
        <button className="dzt-inv-add-btn" onClick={addItem}>＋ إضافة منتج</button>
      </div>

      {/* ── Totals ────────────────────────────────────────────────── */}
      <div className="dzt-inv-totals-box">
        <div className="dzt-inv-total-row">
          <span>المجموع HT</span>
          <span>{fmt(totalHT)}</span>
        </div>
        {Object.entries(tvaGroups).filter(([,v])=>v>0).map(([k,v]) => (
          <div key={k} className="dzt-inv-total-row dzt-inv-total-tva">
            <span>TVA {k}</span>
            <span>{fmt(v)}</span>
          </div>
        ))}
        <div className="dzt-inv-total-row dzt-inv-total-ttc">
          <span>الإجمالي TTC</span>
          <span>{fmt(totalTTC)}</span>
        </div>
      </div>

      {/* ── Note ──────────────────────────────────────────────────── */}
      <div className="dzt-inv-section">
        <div className="dzt-inv-section-title">📝 ملاحظات (اختياري)</div>
        <textarea className={inputCls} rows={2} placeholder="شروط الدفع، ملاحظات إضافية..." value={meta.note} onChange={e=>setM('note',e.target.value)} style={{width:'100%',resize:'vertical'}} />
      </div>

      {/* ── Actions ───────────────────────────────────────────────── */}
      <div className="dzt-result-actions" style={{marginTop:8}}>
        <button className="dzt-btn" onClick={printPDF}>
          <Download size={14} /> تحميل الفاتورة PDF
        </button>
      </div>

      <div ref={printRef} style={{display:'none'}} />
    </div>
  )
}

// ─── Tax Calculator Tool ───────────────────────────────────────────────────────
const IRG_BRACKETS = [
  { min: 0,         max: 240_000,   rate: 0  },
  { min: 240_000,   max: 480_000,   rate: 23 },
  { min: 480_000,   max: 960_000,   rate: 27 },
  { min: 960_000,   max: 1_920_000, rate: 30 },
  { min: 1_920_000, max: 3_840_000, rate: 33 },
  { min: 3_840_000, max: Infinity,  rate: 35 },
]

const IBS_RATES = [
  { label: 'نشاط إنتاجي / فلاحي / سياحي (19%)', value: 19 },
  { label: 'نشاط مختلط (23%)',                     value: 23 },
  { label: 'نشاط تجاري / خدماتي / بناء (26%)',     value: 26 },
]

function calcIRG(annualIncome: number) {
  let tax = 0
  const breakdown: { label: string; base: number; rate: number; amount: number }[] = []
  for (const b of IRG_BRACKETS) {
    if (annualIncome <= b.min) break
    const taxable = Math.min(annualIncome, b.max) - b.min
    const amount  = taxable * b.rate / 100
    tax += amount
    breakdown.push({
      label: b.max === Infinity ? `أكثر من ${(b.min/1000).toFixed(0)}k DA` : `${(b.min/1000).toFixed(0)}k – ${(b.max/1000).toFixed(0)}k DA`,
      base: taxable, rate: b.rate, amount,
    })
  }
  return { tax, breakdown }
}

function TaxTool() {
  const [mode, setMode] = useState<'irg'|'ibs'>('irg')

  // IRG state
  const [period,    setPeriod]    = useState<'monthly'|'annual'>('monthly')
  const [salary,    setSalary]    = useState('')
  const [irgResult, setIrgResult] = useState<null|{ gross:number; tax:number; net:number; effectiveRate:number; breakdown: {label:string;base:number;rate:number;amount:number}[] }>(null)

  // IBS state
  const [profit,     setProfit]     = useState('')
  const [ibsRate,    setIbsRate]    = useState(19)
  const [ibsResult,  setIbsResult]  = useState<null|{ profit:number; taxAmt:number; net:number }>(null)

  const calcIrgAction = () => {
    const monthly = parseFloat(salary) || 0
    const annual  = period === 'monthly' ? monthly * 12 : monthly
    if (!annual) return
    const { tax, breakdown } = calcIRG(annual)
    const annualNet = annual - tax
    setIrgResult({ gross: annual, tax, net: annualNet, effectiveRate: annual > 0 ? tax/annual*100 : 0, breakdown })
  }

  const calcIbsAction = () => {
    const p = parseFloat(profit) || 0
    if (!p) return
    const taxAmt = p * ibsRate / 100
    setIbsResult({ profit: p, taxAmt, net: p - taxAmt })
  }

  const printIRG = () => {
    if (!irgResult) return
    const rows = irgResult.breakdown.map(b => `
      <tr>
        <td>${b.label}</td>
        <td class="n">${b.rate}%</td>
        <td class="n">${b.base.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</td>
        <td class="n"><strong>${b.amount.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</strong></td>
      </tr>`).join('')
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><title>حساب IRG</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Cairo',sans-serif;direction:rtl;font-size:13px;color:#111;padding:32px 44px}
h1{font-size:20px;color:#0a3d1f;border-bottom:3px solid #c8ff00;padding-bottom:8px;margin-bottom:24px}
.cards{display:flex;gap:16px;margin-bottom:28px;flex-wrap:wrap}
.card{flex:1;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:14px 18px}
.card-label{font-size:11px;color:#16a34a;font-weight:700;margin-bottom:4px}
.card-val{font-size:18px;font-weight:800;color:#0a3d1f}
.card.tax .card-val{color:#dc2626}.card.tax{background:#fff5f5;border-color:#fecaca}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
thead tr{background:#0a3d1f;color:#fff}
th{padding:10px 14px;text-align:right;font-size:12px}
td{padding:9px 14px;border-bottom:1px solid #f3f4f6}
.n{text-align:center}
tr:nth-child(even) td{background:#f9fafb}
footer{margin-top:28px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:12px}
</style></head><body>
<h1>🧾 حساب IRG — ضريبة الدخل الإجمالي</h1>
<div class="cards">
  <div class="card"><div class="card-label">الدخل السنوي الخام</div><div class="card-val">${irgResult.gross.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</div></div>
  <div class="card tax"><div class="card-label">IRG المستحق</div><div class="card-val">${irgResult.tax.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</div></div>
  <div class="card"><div class="card-label">الصافي السنوي</div><div class="card-val">${irgResult.net.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</div></div>
  <div class="card"><div class="card-label">معدل الضريبة الفعلي</div><div class="card-val">${irgResult.effectiveRate.toFixed(2)}%</div></div>
</div>
<table>
  <thead><tr><th>الشريحة</th><th class="n">المعدل</th><th class="n">الوعاء الضريبي</th><th class="n">مبلغ الضريبة</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p style="font-size:11px;color:#777">* حسب قانون المالية الجزائري — شرائح IRG 2024. للاستشارة الضريبية المعتمدة راجع خبيراً محاسبياً.</p>
<footer>DZ Tools — مُحاسب الضرائب | dz-gpt.vercel.app</footer>
</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 700)
  }

  const printIBS = () => {
    if (!ibsResult) return
    const win = window.open('', '_blank')
    if (!win) return
    const rateLabel = IBS_RATES.find(r=>r.value===ibsRate)?.label || `${ibsRate}%`
    win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl">
<head><meta charset="UTF-8"><title>حساب IBS</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Cairo',sans-serif;direction:rtl;font-size:13px;color:#111;padding:32px 44px}
h1{font-size:20px;color:#0a3d1f;border-bottom:3px solid #c8ff00;padding-bottom:8px;margin-bottom:24px}
.cards{display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap}
.card{flex:1;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:14px 18px}
.card-label{font-size:11px;color:#16a34a;font-weight:700;margin-bottom:4px}
.card-val{font-size:18px;font-weight:800;color:#0a3d1f}
.card.tax .card-val{color:#dc2626}.card.tax{background:#fff5f5;border-color:#fecaca}
.note{font-size:12px;color:#777;margin-top:16px;padding:12px;background:#fafff5;border-radius:8px;border:1px solid #d1fae5}
footer{margin-top:28px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:12px}
</style></head><body>
<h1>🏢 حساب IBS — ضريبة أرباح الشركات</h1>
<div class="cards">
  <div class="card"><div class="card-label">الربح الخاضع للضريبة</div><div class="card-val">${ibsResult.profit.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</div></div>
  <div class="card"><div class="card-label">معدل IBS المطبق</div><div class="card-val">${ibsRate}%</div></div>
  <div class="card tax"><div class="card-label">مبلغ IBS المستحق</div><div class="card-val">${ibsResult.taxAmt.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</div></div>
  <div class="card"><div class="card-label">صافي الربح بعد الضريبة</div><div class="card-val">${ibsResult.net.toLocaleString('fr-DZ',{minimumFractionDigits:2})} DA</div></div>
</div>
<div class="note">نوع النشاط: ${rateLabel}<br>* حسب قانون المالية الجزائري. للاستشارة المعتمدة راجع خبيراً محاسبياً معتمداً.</div>
<footer>DZ Tools — مُحاسب الضرائب | dz-gpt.vercel.app</footer>
</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 700)
  }

  return (
    <div className="dzt-tax-wrap">
      {/* ── Mode Tabs ─────────────────────────────────────────────── */}
      <div className="dzt-tax-mode-tabs">
        <button className={`dzt-tax-mode-btn${mode==='irg'?' active':''}`} onClick={()=>setMode('irg')}>
          👤 IRG — ضريبة الدخل
        </button>
        <button className={`dzt-tax-mode-btn${mode==='ibs'?' active':''}`} onClick={()=>setMode('ibs')}>
          🏢 IBS — ضريبة الشركات
        </button>
      </div>

      {mode === 'irg' && (
        <div className="dzt-tax-panel">
          <div className="dzt-inv-section-title">حساب IRG — الضريبة على الدخل الإجمالي</div>
          <p className="dzt-tax-desc">شرائح IRG 2024 — حسب قانون المالية الجزائري</p>

          <div className="dzt-tax-period-row">
            <button className={`dzt-tax-period-btn${period==='monthly'?' active':''}`} onClick={()=>setPeriod('monthly')}>شهري</button>
            <button className={`dzt-tax-period-btn${period==='annual'?' active':''}`}  onClick={()=>setPeriod('annual')}>سنوي</button>
          </div>

          <div className="dzt-tax-input-row">
            <input
              className="dzt-inv-input"
              type="number"
              min="0"
              placeholder={period==='monthly' ? 'الراتب الشهري الخام (DA)' : 'الدخل السنوي الخام (DA)'}
              value={salary}
              onChange={e=>{ setSalary(e.target.value); setIrgResult(null) }}
            />
            <button className="dzt-btn" style={{whiteSpace:'nowrap'}} onClick={calcIrgAction}>
              احسب IRG
            </button>
          </div>

          {/* Brackets table */}
          <div className="dzt-tax-brackets">
            <div className="dzt-tax-bracket-title">شرائح IRG 2024</div>
            {IRG_BRACKETS.map((b, i) => (
              <div key={i} className="dzt-tax-bracket-row">
                <span className="dzt-tax-bracket-range">
                  {b.max === Infinity ? `> ${(b.min/1000).toFixed(0)}k` : `${(b.min/1000).toFixed(0)}k – ${(b.max/1000).toFixed(0)}k`} DA/سنة
                </span>
                <span className="dzt-tax-bracket-rate" style={{color: b.rate===0?'#22c55e': b.rate<27?'#f59e0b':'#ef4444'}}>
                  {b.rate}%
                </span>
              </div>
            ))}
          </div>

          {irgResult && (
            <div className="dzt-tax-result">
              <div className="dzt-tax-cards">
                <div className="dzt-tax-card">
                  <div className="dzt-tax-card-label">الدخل السنوي</div>
                  <div className="dzt-tax-card-val">{fmt(irgResult.gross)}</div>
                  <div className="dzt-tax-card-sub">{fmt(irgResult.gross/12)} / شهر</div>
                </div>
                <div className="dzt-tax-card dzt-tax-card-red">
                  <div className="dzt-tax-card-label">IRG المستحق</div>
                  <div className="dzt-tax-card-val">{fmt(irgResult.tax)}</div>
                  <div className="dzt-tax-card-sub">{fmt(irgResult.tax/12)} / شهر</div>
                </div>
                <div className="dzt-tax-card dzt-tax-card-green">
                  <div className="dzt-tax-card-label">صافي الدخل</div>
                  <div className="dzt-tax-card-val">{fmt(irgResult.net)}</div>
                  <div className="dzt-tax-card-sub">{fmt(irgResult.net/12)} / شهر</div>
                </div>
                <div className="dzt-tax-card">
                  <div className="dzt-tax-card-label">معدل الضريبة</div>
                  <div className="dzt-tax-card-val" style={{fontSize:22}}>{irgResult.effectiveRate.toFixed(2)}%</div>
                </div>
              </div>
              <div className="dzt-tax-breakdown-title">تفصيل الحساب بالشرائح</div>
              {irgResult.breakdown.filter(b=>b.rate>0||b.base>0).map((b,i) => (
                <div key={i} className="dzt-tax-breakdown-row">
                  <span className="dzt-tbr-range">{b.label}</span>
                  <span className="dzt-tbr-rate">{b.rate}%</span>
                  <span className="dzt-tbr-base">{fmt(b.base)}</span>
                  <span className="dzt-tbr-amt">{fmt(b.amount)}</span>
                </div>
              ))}
              <div className="dzt-result-actions" style={{marginTop:12}}>
                <button className="dzt-btn" onClick={printIRG}><Download size={14}/> تحميل PDF</button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'ibs' && (
        <div className="dzt-tax-panel">
          <div className="dzt-inv-section-title">حساب IBS — الضريبة على أرباح الشركات</div>
          <p className="dzt-tax-desc">معدلات IBS 2024 حسب نوع النشاط</p>

          <div className="dzt-tax-ibs-rates">
            {IBS_RATES.map(r => (
              <button key={r.value} className={`dzt-tax-ibs-btn${ibsRate===r.value?' active':''}`} onClick={()=>{ setIbsRate(r.value); setIbsResult(null) }}>
                <span className="dzt-tax-ibs-rate">{r.value}%</span>
                <span className="dzt-tax-ibs-label">{r.label.replace(/\s*\(\d+%\)$/,'')}</span>
              </button>
            ))}
          </div>

          <div className="dzt-tax-input-row">
            <input
              className="dzt-inv-input"
              type="number"
              min="0"
              placeholder="الربح الصافي الخاضع للضريبة (DA)"
              value={profit}
              onChange={e=>{ setProfit(e.target.value); setIbsResult(null) }}
            />
            <button className="dzt-btn" style={{whiteSpace:'nowrap'}} onClick={calcIbsAction}>
              احسب IBS
            </button>
          </div>

          {ibsResult && (
            <div className="dzt-tax-result">
              <div className="dzt-tax-cards">
                <div className="dzt-tax-card">
                  <div className="dzt-tax-card-label">الربح الخاضع</div>
                  <div className="dzt-tax-card-val">{fmt(ibsResult.profit)}</div>
                </div>
                <div className="dzt-tax-card">
                  <div className="dzt-tax-card-label">معدل IBS</div>
                  <div className="dzt-tax-card-val" style={{fontSize:22}}>{ibsRate}%</div>
                </div>
                <div className="dzt-tax-card dzt-tax-card-red">
                  <div className="dzt-tax-card-label">IBS المستحق</div>
                  <div className="dzt-tax-card-val">{fmt(ibsResult.taxAmt)}</div>
                </div>
                <div className="dzt-tax-card dzt-tax-card-green">
                  <div className="dzt-tax-card-label">صافي الربح</div>
                  <div className="dzt-tax-card-val">{fmt(ibsResult.net)}</div>
                </div>
              </div>
              <div className="dzt-result-actions" style={{marginTop:12}}>
                <button className="dzt-btn" onClick={printIBS}><Download size={14}/> تحميل PDF</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pension / CNAS / CASNOS Tool ─────────────────────────────────────────────
function PensionTool() {
  const [type, setType]   = useState<'cnas'|'casnos'>('cnas')
  const [gender, setGender] = useState<'m'|'f'>('m')
  const [salary, setSalary] = useState('')
  const [years, setYears]   = useState('')
  const [age, setAge]       = useState('')
  const [result, setResult] = useState<null|{
    contrib: number; employerContrib?: number; totalMonthly: number;
    pension: number; retireAge: number; yearsLeft: number; rate: number;
  }>(null)

  const fmt = (n: number) => Math.round(n).toLocaleString('fr-DZ') + ' DA'

  const calc = () => {
    const s = parseFloat(salary) || 0
    const y = parseFloat(years)  || 0
    const a = parseFloat(age)    || 0
    if (!s || !y || !a) return

    const retireAge = gender === 'm' ? 60 : 55
    const yearsLeft = Math.max(0, retireAge - a)

    if (type === 'cnas') {
      const contrib         = s * 0.09
      const employerContrib = s * 0.26
      const totalMonthly    = contrib + employerContrib
      const rate            = Math.min(y * 2.5, 80) / 100
      const pension         = s * rate
      setResult({ contrib, employerContrib, totalMonthly, pension, retireAge, yearsLeft, rate: rate * 100 })
    } else {
      const annualIncome = s * 12
      const contrib      = (annualIncome * 0.15) / 12
      const rate         = Math.min(y * 2.5, 80) / 100
      const pension      = s * rate
      setResult({ contrib, totalMonthly: contrib, pension, retireAge, yearsLeft, rate: rate * 100 })
    }
  }

  const printResult = () => {
    if (!result) return
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<title>حاسبة التقاعد CNAS</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap" rel="stylesheet">
<style>body{font-family:'Cairo',sans-serif;direction:rtl;padding:40px;background:#fff;color:#111}
h1{color:#0a3d1f;border-bottom:3px solid #c8ff00;padding-bottom:8px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}
.card{background:#f6fbf7;border:1px solid #c8e6c9;border-radius:12px;padding:16px}
.label{font-size:12px;color:#666;margin-bottom:4px}
.val{font-size:22px;font-weight:800;color:#0a3d1f}
.val.red{color:#d32f2f}.val.blue{color:#1565c0}
.footer{margin-top:32px;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:12px}
</style></head><body>
<h1>🏦 تقرير حاسبة التقاعد — ${type === 'cnas' ? 'CNAS موظف' : 'CASNOS مستقل'}</h1>
<div class="grid">
  ${type === 'cnas' ? `<div class="card"><div class="label">اشتراك الموظف (9%)</div><div class="val blue">${fmt(result.contrib)}</div></div>
  <div class="card"><div class="label">اشتراك صاحب العمل (26%)</div><div class="val blue">${fmt(result.employerContrib||0)}</div></div>` :
  `<div class="card"><div class="label">الاشتراك الشهري (15%)</div><div class="val blue">${fmt(result.contrib)}</div></div>`}
  <div class="card"><div class="label">نسبة المعاش</div><div class="val">${result.rate.toFixed(1)}%</div></div>
  <div class="card" style="background:#e8f5e9"><div class="label">المعاش الشهري المتوقع</div><div class="val">${fmt(result.pension)}</div></div>
  <div class="card"><div class="label">سن التقاعد القانوني</div><div class="val">${result.retireAge} سنة</div></div>
  <div class="card"><div class="label">السنوات المتبقية</div><div class="val red">${result.yearsLeft} سنة</div></div>
</div>
<div class="footer">🇩🇿 DZ Tools — dz-gpt.vercel.app | المعطيات وفق قانون CNAS/CASNOS الجزائري 2024</div>
</body></html>`)
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 600)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div className="dzt-tool-desc">
        <div className="dzt-tool-desc-icon">🏦</div>
        <div>
          <div className="dzt-tool-desc-title">حاسبة التقاعد والضمان الاجتماعي</div>
          <div className="dzt-tool-desc-text">احسب اشتراكاتك الشهرية ومعاشك المتوقع — CNAS للموظفين · CASNOS للمستقلين — وفق شرائح 2024</div>
        </div>
      </div>

      <div className="dzt-pension-type-row">
        {(['cnas','casnos'] as const).map(t => (
          <button key={t} className={`dzt-pension-type-btn${type===t?' active':''}`} onClick={()=>{ setType(t); setResult(null) }}>
            <span style={{fontSize:22}}>{t==='cnas'?'🏢':'🧑‍💼'}</span>
            <span style={{fontWeight:800}}>{t==='cnas'?'CNAS':'CASNOS'}</span>
            <span style={{fontSize:12,opacity:.7}}>{t==='cnas'?'موظف / أجير':'مستقل / حر'}</span>
          </button>
        ))}
      </div>

      <div className="dzt-pension-grid">
        <div className="dzt-field">
          <label className="dzt-label">الجنس</label>
          <select className="dzt-select" value={gender} onChange={e=>{ setGender(e.target.value as 'm'|'f'); setResult(null) }}>
            <option value="m">ذكر (تقاعد عند 60)</option>
            <option value="f">أنثى (تقاعد عند 55)</option>
          </select>
        </div>
        <div className="dzt-field">
          <label className="dzt-label">العمر الحالي (سنة)</label>
          <input className="dzt-input" type="number" min="18" max="70" placeholder="مثال: 35" value={age} onChange={e=>{ setAge(e.target.value); setResult(null) }} />
        </div>
        <div className="dzt-field">
          <label className="dzt-label">{type==='cnas'?'الراتب الإجمالي الشهري (DA)':'الدخل الشهري الإجمالي (DA)'}</label>
          <input className="dzt-input" type="number" min="0" placeholder="مثال: 85000" value={salary} onChange={e=>{ setSalary(e.target.value); setResult(null) }} />
        </div>
        <div className="dzt-field">
          <label className="dzt-label">سنوات العمل / الاشتراك</label>
          <input className="dzt-input" type="number" min="0" max="40" placeholder="مثال: 15" value={years} onChange={e=>{ setYears(e.target.value); setResult(null) }} />
        </div>
      </div>

      <div className="dzt-pension-info-box">
        {type==='cnas'
          ? <><strong>CNAS — موظف:</strong> اشتراك الموظف <strong>9%</strong> + صاحب العمل <strong>26%</strong> من الراتب الإجمالي · المعاش = <strong>2.5% × سنوات العمل × الراتب</strong> (سقف 80%)</>
          : <><strong>CASNOS — مستقل:</strong> اشتراك <strong>15%</strong> من الدخل السنوي · المعاش = <strong>2.5% × سنوات الاشتراك × الدخل</strong> (سقف 80%)</>
        }
      </div>

      <button className="dzt-btn" onClick={calc} disabled={!salary||!years||!age}>
        <Calculator size={16}/> احسب
      </button>

      {result && (
        <div className="dzt-pension-result">
          <div className="dzt-tax-cards" style={{gridTemplateColumns:'repeat(2,1fr)'}}>
            <div className="dzt-tax-card">
              <div className="dzt-tax-card-label">اشتراكك الشهري</div>
              <div className="dzt-tax-card-val" style={{color:'#60a5fa'}}>{fmt(result.contrib)}</div>
              <div className="dzt-tax-card-sub">{type==='cnas'?'9% من راتبك':'15% من دخلك'}</div>
            </div>
            {type==='cnas' && (
              <div className="dzt-tax-card">
                <div className="dzt-tax-card-label">اشتراك صاحب العمل</div>
                <div className="dzt-tax-card-val" style={{color:'#a78bfa'}}>{fmt(result.employerContrib||0)}</div>
                <div className="dzt-tax-card-sub">26% من راتبك</div>
              </div>
            )}
            <div className="dzt-tax-card">
              <div className="dzt-tax-card-label">نسبة المعاش</div>
              <div className="dzt-tax-card-val">{result.rate.toFixed(1)}%</div>
              <div className="dzt-tax-card-sub">2.5% × {years} سنة</div>
            </div>
            <div className="dzt-tax-card dzt-tax-card-green">
              <div className="dzt-tax-card-label">المعاش الشهري المتوقع</div>
              <div className="dzt-tax-card-val">{fmt(result.pension)}</div>
            </div>
            <div className="dzt-tax-card">
              <div className="dzt-tax-card-label">سن التقاعد القانوني</div>
              <div className="dzt-tax-card-val">{result.retireAge} سنة</div>
            </div>
            <div className={`dzt-tax-card${result.yearsLeft>0?' dzt-tax-card-red':' dzt-tax-card-green'}`}>
              <div className="dzt-tax-card-label">{result.yearsLeft>0?'السنوات المتبقية':'أنت أهل للتقاعد!'}</div>
              <div className="dzt-tax-card-val">{result.yearsLeft>0?`${result.yearsLeft} سنة`:'✓ الآن'}</div>
            </div>
          </div>
          <div className="dzt-result-actions" style={{marginTop:12}}>
            <button className="dzt-btn" onClick={printResult}><Download size={14}/> تحميل PDF</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── QR Code Generator Tool ────────────────────────────────────────────────────
function QRCodeTool() {
  const [text, setText]     = useState('')
  const [size, setSize]     = useState('300')
  const [color, setColor]   = useState('000000')
  const [bgColor, setBgColor] = useState('ffffff')
  const [qrUrl, setQrUrl]   = useState('')
  const [copied, setCopied] = useState(false)

  const generate = () => {
    if (!text.trim()) return
    const encoded = encodeURIComponent(text.trim())
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&color=${color}&bgcolor=${bgColor}&margin=10&format=png`
    setQrUrl(url)
  }

  const download = async () => {
    if (!qrUrl) return
    try {
      const res  = await fetch(qrUrl)
      const blob = await res.blob()
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = 'qrcode-dz.png'
      a.click()
    } catch { alert('تعذّر التحميل، حاول مرة أخرى') }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(text).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000) })
  }

  const PRESETS = [
    { label:'رابط موقع', value:'https://dz-gpt.vercel.app' },
    { label:'واتساب',    value:'https://wa.me/213XXXXXXXXX' },
    { label:'إيميل',     value:'mailto:contact@example.com' },
    { label:'هاتف',      value:'tel:+213XXXXXXXXX' },
    { label:'نص حر',    value:'مرحباً بكم في DZ-GPT 🇩🇿' },
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div className="dzt-tool-desc">
        <div className="dzt-tool-desc-icon">📲</div>
        <div>
          <div className="dzt-tool-desc-title">مولّد QR Code الاحترافي</div>
          <div className="dzt-tool-desc-text">أنشئ QR Code لأي رابط، رقم هاتف، واتساب، إيميل أو نص — تخصيص الألوان والحجم — تحميل PNG فوري</div>
        </div>
      </div>

      <div className="dzt-field">
        <label className="dzt-label">نوع المحتوى (اختر أو اكتب)</label>
        <div className="dzt-qr-presets">
          {PRESETS.map(p => (
            <button key={p.label} className="dzt-qr-preset-btn" onClick={()=>{ setText(p.value); setQrUrl('') }}>{p.label}</button>
          ))}
        </div>
      </div>

      <div className="dzt-field">
        <label className="dzt-label">المحتوى (رابط، نص، رقم...)</label>
        <textarea
          className="dzt-textarea"
          placeholder="https://dz-gpt.vercel.app أو أي نص أو رقم هاتف..."
          value={text}
          onChange={e=>{ setText(e.target.value); setQrUrl('') }}
          rows={3}
        />
      </div>

      <div className="dzt-qr-options">
        <div className="dzt-field">
          <label className="dzt-label">الحجم</label>
          <select className="dzt-select" value={size} onChange={e=>{ setSize(e.target.value); setQrUrl('') }}>
            <option value="150">صغير (150×150)</option>
            <option value="300">متوسط (300×300)</option>
            <option value="500">كبير (500×500)</option>
            <option value="800">عالي الدقة (800×800)</option>
          </select>
        </div>
        <div className="dzt-field">
          <label className="dzt-label">لون الـ QR</label>
          <div className="dzt-qr-color-row">
            <input type="color" value={`#${color}`} onChange={e=>{ setColor(e.target.value.replace('#','')); setQrUrl('') }} className="dzt-qr-color-picker" />
            <span className="dzt-qr-color-hex">#{color}</span>
          </div>
        </div>
        <div className="dzt-field">
          <label className="dzt-label">لون الخلفية</label>
          <div className="dzt-qr-color-row">
            <input type="color" value={`#${bgColor}`} onChange={e=>{ setBgColor(e.target.value.replace('#','')); setQrUrl('') }} className="dzt-qr-color-picker" />
            <span className="dzt-qr-color-hex">#{bgColor}</span>
          </div>
        </div>
      </div>

      <button className="dzt-btn" onClick={generate} disabled={!text.trim()}>
        <QrCode size={16}/> توليد QR Code
      </button>

      {qrUrl && (
        <div className="dzt-qr-result">
          <div className="dzt-qr-preview-wrap">
            <img src={qrUrl} alt="QR Code" className="dzt-qr-img" />
          </div>
          <div className="dzt-qr-content-preview">
            <span className="dzt-qr-content-label">المحتوى:</span>
            <span className="dzt-qr-content-val">{text.length > 60 ? text.slice(0,60)+'…' : text}</span>
          </div>
          <div className="dzt-result-actions" style={{justifyContent:'center',gap:12}}>
            <button className="dzt-btn" onClick={download} style={{flex:1}}>
              <Download size={14}/> تحميل PNG
            </button>
            <button className="dzt-result-btn" onClick={copyLink} style={{flex:1}}>
              {copied ? <Check size={14}/> : <Copy size={14}/>}
              {copied ? 'تم النسخ' : 'نسخ النص'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Business Card Tool ────────────────────────────────────────────────────────
const BC_THEMES = [
  { id:'dark',    label:'داكن',    bg:'#0a0a0a', text:'#fff',     accent:'#c8ff00', sub:'#aaa' },
  { id:'green',   label:'أخضر',   bg:'#0a3d1f', text:'#fff',     accent:'#c8ff00', sub:'#a3d9a5' },
  { id:'blue',    label:'أزرق',   bg:'#0d1b4b', text:'#fff',     accent:'#60a5fa', sub:'#93c5fd' },
  { id:'white',   label:'أبيض',   bg:'#ffffff', text:'#111',     accent:'#0a3d1f', sub:'#555' },
  { id:'gold',    label:'ذهبي',   bg:'#1a1100', text:'#ffe082',  accent:'#ffd600', sub:'#c8a000' },
]

function BizCardTool() {
  const [lang, setLang]   = useState<'ar'|'fr'>('ar')
  const [theme, setTheme] = useState(BC_THEMES[0])
  const [form, setForm]   = useState({
    name:'', title:'', company:'', phone:'', email:'', website:'', address:'', logo:'', photo:''
  })
  const cardRef  = useRef<HTMLDivElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const set = (k:string, v:string) => setForm(f=>({...f,[k]:v}))

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => set('photo', ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const printCard = () => {
    const el = cardRef.current
    if (!el) return
    const w = window.open('', '_blank')
    if (!w) return
    const dir = lang === 'ar' ? 'rtl' : 'ltr'
    w.document.write(`<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head><meta charset="UTF-8">
<title>بطاقة العمل — ${form.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#f0f0f0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:${lang==='ar'?"'Cairo'":'Inter'},sans-serif}
.card{width:90mm;height:55mm;background:${theme.bg};color:${theme.text};border-radius:4mm;padding:7mm 8mm;display:flex;flex-direction:column;justify-content:space-between;direction:${dir};position:relative;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.25)}
.accent-line{position:absolute;top:0;${lang==='ar'?'right':'left'}:0;width:3mm;height:100%;background:${theme.accent}}
.photo-circle{position:absolute;top:5mm;${lang==='ar'?'left':'right'}:5mm;width:14mm;height:14mm;border-radius:50%;overflow:hidden;border:1.2mm solid ${theme.accent};box-shadow:0 0 4mm rgba(0,0,0,0.4)}
.photo-circle img{width:100%;height:100%;object-fit:cover;display:block}
.name{font-size:16pt;font-weight:800;color:${theme.text};margin-${lang==='ar'?'right':'left'}:4mm}
.title{font-size:9pt;color:${theme.accent};font-weight:600;margin:1mm 0 0 0;margin-${lang==='ar'?'right':'left'}:4mm}
.company{font-size:8pt;color:${theme.sub};margin-${lang==='ar'?'right':'left'}:4mm}
.contacts{display:flex;flex-direction:column;gap:1.5mm;margin-${lang==='ar'?'right':'left'}:4mm}
.contact-row{font-size:7.5pt;color:${theme.sub};display:flex;align-items:center;gap:2mm}
.brand{position:absolute;bottom:4mm;${lang==='ar'?'left':'right'}:5mm;font-size:6pt;color:${theme.accent};opacity:.5}
@media print{body{background:none}@page{margin:0;size:90mm 55mm}}
</style></head><body>
<div class="card">
  <div class="accent-line"></div>
  ${form.photo ? `<div class="photo-circle"><img src="${form.photo}" /></div>` : ''}
  <div>
    <div class="name">${form.name||'الاسم الكامل'}</div>
    <div class="title">${form.title||'المنصب'}</div>
    ${form.company?`<div class="company">${form.company}</div>`:''}
  </div>
  <div class="contacts">
    ${form.phone?`<div class="contact-row">📞 ${form.phone}</div>`:''}
    ${form.email?`<div class="contact-row">✉️ ${form.email}</div>`:''}
    ${form.website?`<div class="contact-row">🌐 ${form.website}</div>`:''}
    ${form.address?`<div class="contact-row">📍 ${form.address}</div>`:''}
  </div>
  <div class="brand">DZ-GPT</div>
</div>
</body></html>`)
    w.document.close()
    setTimeout(()=>{ w.focus(); w.print() }, 600)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div className="dzt-tool-desc">
        <div className="dzt-tool-desc-icon">🪪</div>
        <div>
          <div className="dzt-tool-desc-title">مولّد بطاقة العمل الاحترافية</div>
          <div className="dzt-tool-desc-text">صمّم بطاقة عمل احترافية بالعربية أو الفرنسية مع معاينة مباشرة — تصدير PDF جاهز للطباعة (90mm × 55mm)</div>
        </div>
      </div>

      <div className="dzt-row">
        <div className="dzt-field">
          <label className="dzt-label">اللغة</label>
          <select className="dzt-select" value={lang} onChange={e=>setLang(e.target.value as 'ar'|'fr')}>
            <option value="ar">العربية (RTL)</option>
            <option value="fr">Français (LTR)</option>
          </select>
        </div>
        <div className="dzt-field">
          <label className="dzt-label">النمط / الثيم</label>
          <div className="dzt-bc-themes">
            {BC_THEMES.map(t=>(
              <button key={t.id} className={`dzt-bc-theme-btn${theme.id===t.id?' active':''}`}
                style={{background:t.bg,color:t.text,borderColor:theme.id===t.id?t.accent:'transparent'}}
                onClick={()=>setTheme(t)}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Photo upload */}
      <div className="dzt-bc-photo-section">
        <input ref={photoRef} type="file" accept="image/*" style={{display:'none'}} onChange={handlePhoto} />
        <div className="dzt-bc-photo-upload-area" onClick={()=>photoRef.current?.click()}>
          {form.photo ? (
            <div className="dzt-bc-photo-preview-wrap">
              <img src={form.photo} alt="صورة البطاقة" className="dzt-bc-photo-thumb" />
              <div className="dzt-bc-photo-preview-label">
                <span>✅ تم رفع الصورة</span>
                <button className="dzt-bc-photo-remove" onClick={e=>{ e.stopPropagation(); set('photo','') }}>✕ حذف</button>
              </div>
            </div>
          ) : (
            <div className="dzt-bc-photo-placeholder">
              <div className="dzt-bc-photo-circle-empty">👤</div>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:'#c8ff00'}}>رفع صورة شخصية دائرية</div>
                <div style={{fontSize:11,color:'#666',marginTop:3}}>JPG · PNG · WebP — تظهر في المعاينة والتصدير</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="dzt-inv-grid2">
        <input className="dzt-inv-input" placeholder="الاسم الكامل *" value={form.name} onChange={e=>set('name',e.target.value)} />
        <input className="dzt-inv-input" placeholder="المنصب / الوظيفة *" value={form.title} onChange={e=>set('title',e.target.value)} />
        <input className="dzt-inv-input" placeholder="اسم الشركة / المؤسسة" value={form.company} onChange={e=>set('company',e.target.value)} />
        <input className="dzt-inv-input" placeholder="رقم الهاتف" value={form.phone} onChange={e=>set('phone',e.target.value)} />
        <input className="dzt-inv-input" placeholder="البريد الإلكتروني" value={form.email} onChange={e=>set('email',e.target.value)} />
        <input className="dzt-inv-input" placeholder="الموقع الإلكتروني" value={form.website} onChange={e=>set('website',e.target.value)} />
        <input className="dzt-inv-input" placeholder="العنوان / المدينة" value={form.address} onChange={e=>set('address',e.target.value)} style={{gridColumn:'span 2'}} />
      </div>

      {/* Live Preview */}
      <div className="dzt-bc-preview-wrap">
        <div className="dzt-bc-preview-label">معاينة مباشرة</div>
        <div className="dzt-bc-card-outer">
          <div
            ref={cardRef}
            className="dzt-bc-card"
            style={{background:theme.bg, color:theme.text, direction:lang==='ar'?'rtl':'ltr', fontFamily:lang==='ar'?'Cairo, sans-serif':'Inter, sans-serif'}}
          >
            <div className="dzt-bc-accent" style={{background:theme.accent, [lang==='ar'?'right':'left']:0}} />
            {/* Circular photo */}
            {form.photo && (
              <div className="dzt-bc-photo-circle" style={{
                borderColor: theme.accent,
                [lang==='ar' ? 'left' : 'right']: 14
              }}>
                <img src={form.photo} alt="" />
              </div>
            )}
            <div className="dzt-bc-top">
              <div className="dzt-bc-name" style={{color:theme.text}}>{form.name||'الاسم الكامل'}</div>
              <div className="dzt-bc-title" style={{color:theme.accent}}>{form.title||'المنصب'}</div>
              {form.company && <div className="dzt-bc-company" style={{color:theme.sub}}>{form.company}</div>}
            </div>
            <div className="dzt-bc-contacts">
              {form.phone   && <div className="dzt-bc-contact" style={{color:theme.sub}}>📞 {form.phone}</div>}
              {form.email   && <div className="dzt-bc-contact" style={{color:theme.sub}}>✉️ {form.email}</div>}
              {form.website && <div className="dzt-bc-contact" style={{color:theme.sub}}>🌐 {form.website}</div>}
              {form.address && <div className="dzt-bc-contact" style={{color:theme.sub}}>📍 {form.address}</div>}
            </div>
            <div className="dzt-bc-brand" style={{color:theme.accent}}>DZ-GPT</div>
          </div>
        </div>
      </div>

      <button className="dzt-btn" onClick={printCard} disabled={!form.name}>
        <Download size={16}/> تصدير PDF (90×55mm)
      </button>
    </div>
  )
}

// ─── Darija Translator Tool ───────────────────────────────────────────────────
const DARIJA_DIRS = [
  { id: 'ar2dz', label: 'عربي فصيح  →  دارجة', from: 'العربية الفصحى', to: 'الدارجة الجزائرية' },
  { id: 'dz2ar', label: 'دارجة  →  عربي فصيح', from: 'الدارجة الجزائرية', to: 'العربية الفصحى' },
  { id: 'fr2dz', label: 'Français  →  دارجة',   from: 'الفرنسية', to: 'الدارجة الجزائرية' },
  { id: 'dz2fr', label: 'دارجة  →  Français',   from: 'الدارجة الجزائرية', to: 'الفرنسية' },
]
const DARIJA_REGIONS = [
  { id: 'center', label: '🏙️ الجزائر العاصمة / الوسط' },
  { id: 'west',   label: '🌅 وهران / تلمسان (الغرب)' },
  { id: 'east',   label: '🏔️ قسنطينة / عنابة (الشرق)' },
  { id: 'south',  label: '🏜️ الجنوب (تمنراست / ورقلة)' },
]
function DarijaTool() {
  const [dir,      setDir]      = useState('ar2dz')
  const [region,   setRegion]   = useState('center')
  const [input,    setInput]    = useState('')
  const [output,   setOutput]   = useState('')
  const [loading,  setLoading]  = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [examples, setExamples] = useState<{original:string;darija:string;note:string}[]>([])

  const QUICK: Record<string, string[]> = {
    ar2dz: ['كيف حالك؟','أريد أن آكل','هل أنت مشغول؟','أين تسكن؟','شكراً جزيلاً','إلى اللقاء','ما هو سعر هذا؟','أنا تعبان'],
    dz2ar: ['واش راك؟','بغيت ناكل','علاش ما جيتش؟','وين تسكن؟','يعيشك باباك','نروح وراك','بشحال هذا؟','أنا مريض'],
    fr2dz: ['Comment tu vas?','Je veux manger','Où habites-tu?','Merci beaucoup','Au revoir','C\'est combien?','Je suis fatigué','Allons-y'],
    dz2fr: ['واش راك؟','بغيت ناكل','وين تسكن؟','يعيشك','نروح وراك','بشحال؟','أنا مريض','هيا بينا'],
  }

  const regionLabels: Record<string,string> = { center:'الجزائر العاصمة', west:'وهران والغرب', east:'قسنطينة والشرق', south:'الجنوب الجزائري' }

  const translate = async () => {
    if (!input.trim()) return
    setLoading(true); setOutput(''); setExamples([])
    const d = DARIJA_DIRS.find(x=>x.id===dir)!
    const reg = regionLabels[region]
    const prompt = `أنت خبير في اللهجة الجزائرية الدارجة ومتمكن من جميع اللهجات الجزائرية الإقليمية.

المهمة: ترجم النص التالي من ${d.from} إلى ${d.to} — مع مراعاة لهجة منطقة: ${reg}

النص: "${input}"

أعطني:
1. **الترجمة الرئيسية** (كبيرة وواضحة):
[ضع الترجمة هنا فقط]

2. **شرح مختصر** (إذا كانت هناك تعابير خاصة):
[شرح التعابير الصعبة]

3. **أمثلة مماثلة** (3 أمثلة بنفس الأسلوب اللهجوي):
- مثال 1: [أصل] | [ترجمة]
- مثال 2: [أصل] | [ترجمة]  
- مثال 3: [أصل] | [ترجمة]

ملاحظة: استخدم الكتابة العربية للدارجة، ويمكن إضافة كلمات فرنسية مدرجة إذا كانت شائعة في المنطقة.`

    try {
      const res  = await fetch('/api/dz-agent-chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ messages:[{role:'user',content:prompt}] })
      })
      const data = await res.json()
      const text = data.content || ''
      // Extract main translation
      const mainMatch = text.match(/\*\*الترجمة الرئيسية\*\*[^\n]*\n+([\s\S]*?)(?=\n\n|\*\*شرح|$)/i)
      setOutput(mainMatch ? mainMatch[1].trim() : text.split('\n').find((l:string)=>l.trim()&&!l.startsWith('#')&&!l.startsWith('*')) || text)
      // Extract examples
      const exMatches = [...text.matchAll(/مثال \d+:\s*([^|]+)\|([^\n]+)/g)]
      setExamples(exMatches.slice(0,3).map(m=>({ original:m[1].trim(), darija:m[2].trim(), note:'' })))
    } catch { setOutput('⚠️ خطأ في الاتصال، حاول مرة أخرى.') }
    setLoading(false)
  }

  const swap = () => {
    const pairs: Record<string,string> = { ar2dz:'dz2ar', dz2ar:'ar2dz', fr2dz:'dz2fr', dz2fr:'fr2dz' }
    setDir(pairs[dir]||dir); setInput(output); setOutput(''); setExamples([])
  }

  return (
    <div className="dzt-dj-wrap">
      <div className="dzt-tool-desc">
        <div className="dzt-tool-desc-icon">🗣️</div>
        <div>
          <div className="dzt-tool-desc-title">مترجم الدارجة الجزائرية</div>
          <div className="dzt-tool-desc-text">ترجمة ذكية بين العربية الفصحى والفرنسية والدارجة الجزائرية — مع مراعاة اللهجات الإقليمية: الجزائر العاصمة · وهران · قسنطينة · الجنوب</div>
        </div>
      </div>

      {/* Direction */}
      <div className="dzt-dj-block">
        <label className="dzt-label">اتجاه الترجمة</label>
        <div className="dzt-dj-dirs">
          {DARIJA_DIRS.map(d=>(
            <button key={d.id} className={`dzt-dj-dir-btn${dir===d.id?' active':''}`} onClick={()=>{setDir(d.id);setOutput('');setExamples([])}}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Region */}
      <div className="dzt-dj-block">
        <label className="dzt-label">المنطقة / اللهجة</label>
        <div className="dzt-dj-regions">
          {DARIJA_REGIONS.map(r=>(
            <button key={r.id} className={`dzt-dj-region${region===r.id?' active':''}`} onClick={()=>setRegion(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick examples */}
      <div className="dzt-dj-block">
        <label className="dzt-label">أمثلة سريعة</label>
        <div className="dzt-dj-quick">
          {(QUICK[dir]||[]).map(q=>(
            <button key={q} className="dzt-dj-quick-btn" onClick={()=>{setInput(q);setOutput('');setExamples([])}}>
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input / Output */}
      <div className="dzt-dj-panels">
        <div className="dzt-dj-panel">
          <div className="dzt-dj-panel-label">{DARIJA_DIRS.find(d2=>d2.id===dir)?.from}</div>
          <textarea className="dzt-dj-textarea" placeholder="اكتب النص هنا..." value={input}
            onChange={e=>setInput(e.target.value)} rows={4}
            onKeyDown={e=>e.key==='Enter'&&e.ctrlKey&&translate()} />
        </div>

        <button className="dzt-dj-swap" onClick={swap} title="تبديل الاتجاه">⇄</button>

        <div className="dzt-dj-panel">
          <div className="dzt-dj-panel-label">{DARIJA_DIRS.find(d2=>d2.id===dir)?.to}
            {output && <button className={`dzt-dj-copy${copied?' done':''}`}
              onClick={()=>{navigator.clipboard.writeText(output);setCopied(true);setTimeout(()=>setCopied(false),2000)}}>
              {copied?'✅':'📋'}
            </button>}
          </div>
          <div className={`dzt-dj-output${loading?' loading':''}`}>
            {loading ? <span className="dzt-dj-loading-txt">⏳ AI يترجم...</span>
                     : output || <span style={{color:'#333'}}>ستظهر الترجمة هنا...</span>}
          </div>
        </div>
      </div>

      <button className="dzt-btn" onClick={translate} disabled={loading||!input.trim()}
        style={{fontSize:14,padding:'12px 24px'}}>
        {loading?'⏳ جاري الترجمة...':'🗣️ ترجم الآن'}
      </button>

      {/* Examples */}
      {examples.length>0 && (
        <div className="dzt-dj-examples">
          <div className="dzt-dj-ex-title">📚 أمثلة مماثلة</div>
          {examples.map((ex,i)=>(
            <div key={i} className="dzt-dj-ex-row">
              <span className="dzt-dj-ex-orig">{ex.original}</span>
              <span className="dzt-dj-ex-arrow">→</span>
              <span className="dzt-dj-ex-trans">{ex.darija}</span>
              <button className="dzt-dj-ex-use" onClick={()=>{setInput(ex.original);setOutput('');setExamples([])}}>جرب</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Zakat Calculator Tool ────────────────────────────────────────────────────
type ZakatTab = 'mal' | 'gold' | 'silver' | 'trade' | 'crops'
const ZAKAT_TABS: {id:ZakatTab;icon:string;label:string}[] = [
  { id:'mal',    icon:'💵', label:'زكاة المال' },
  { id:'gold',   icon:'🥇', label:'زكاة الذهب' },
  { id:'silver', icon:'🥈', label:'زكاة الفضة' },
  { id:'trade',  icon:'🛒', label:'زكاة التجارة' },
  { id:'crops',  icon:'🌾', label:'زكاة الزروع' },
]
function ZakatTool() {
  const [tab,        setTab]       = useState<ZakatTab>('mal')
  const [goldPrice,  setGoldPrice] = useState(9200)   // DZD per gram (18k avg 2025)
  const [silverPrice,setSilverPrice] = useState(95)   // DZD per gram
  // Mal
  const [savings,    setSavings]   = useState('')
  const [debts,      setDebts]     = useState('')
  // Gold
  const [goldGrams,  setGoldGrams] = useState('')
  const [goldKarat,  setGoldKarat] = useState(21)
  // Silver
  const [silverGrams,setSilverGrams]=useState('')
  // Trade
  const [inventory,  setInventory] = useState('')
  const [receivables,setReceivables]=useState('')
  const [tradeDebts, setTradeDebts]=useState('')
  // Crops
  const [cropsKg,    setCropsKg]   = useState('')
  const [cropsPrice, setCropsPrice]=useState('')
  const [irrigated,  setIrrigated] = useState(false)
  const [copied,     setCopied]    = useState(false)

  // Nisab calculations
  const nisabGold   = 85 * goldPrice                       // 85g gold in DZD
  const nisabSilver = 595 * silverPrice                    // 595g silver in DZD
  const nisabCrops  = 653                                  // 653 kg

  // Results
  const calcMal = () => {
    const net = (parseFloat(savings)||0) - (parseFloat(debts)||0)
    if (net < nisabGold) return null
    return { base: net, zakat: net * 0.025, nisab: nisabGold, eligible: true }
  }
  const calcGold = () => {
    const grams = parseFloat(goldGrams)||0
    const purity = goldKarat/24
    const pureGrams = grams * purity
    const value = pureGrams * goldPrice
    const nisab85 = 85 * goldPrice
    if (pureGrams < 85) return { grams, pureGrams, value, nisab: nisab85, eligible: false, zakat: 0 }
    return { grams, pureGrams, value, nisab: nisab85, eligible: true, zakat: value * 0.025 }
  }
  const calcSilver = () => {
    const grams = parseFloat(silverGrams)||0
    const value = grams * silverPrice
    const nisab595 = 595 * silverPrice
    if (grams < 595) return { grams, value, nisab: nisab595, eligible: false, zakat: 0 }
    return { grams, value, nisab: nisab595, eligible: true, zakat: value * 0.025 }
  }
  const calcTrade = () => {
    const net = (parseFloat(inventory)||0) + (parseFloat(receivables)||0) - (parseFloat(tradeDebts)||0)
    if (net < nisabGold) return null
    return { net, zakat: net * 0.025, nisab: nisabGold, eligible: true }
  }
  const calcCrops = () => {
    const kg = parseFloat(cropsKg)||0
    const price = parseFloat(cropsPrice)||0
    const value = kg * price
    const rate = irrigated ? 0.05 : 0.10
    if (kg < nisabCrops) return { kg, value, rate, nisab: nisabCrops, eligible: false, zakat: 0 }
    return { kg, value, rate, nisab: nisabCrops, eligible: true, zakat: value * rate }
  }

  const fmt = (n:number) => n.toLocaleString('fr-DZ',{maximumFractionDigits:0}) + ' دج'

  const ResultBox = ({eligible,zakat,note}:{eligible:boolean;zakat:number;note?:string}) => (
    <div className={`dzt-zk-result${eligible?' eligible':' not-eligible'}`}>
      {eligible ? (
        <>
          <div className="dzt-zk-result-label">✅ تجب عليك الزكاة</div>
          <div className="dzt-zk-result-amount">{fmt(zakat)}</div>
          <div className="dzt-zk-result-sub">مبلغ الزكاة الواجبة (ربع العشر 2.5%)</div>
        </>
      ) : (
        <>
          <div className="dzt-zk-result-label">🔵 لا تجب عليك الزكاة</div>
          <div className="dzt-zk-result-sub">النصاب لم يكتمل بعد</div>
        </>
      )}
      {note && <div className="dzt-zk-result-note">ℹ️ {note}</div>}
    </div>
  )

  return (
    <div className="dzt-zk-wrap">
      <div className="dzt-tool-desc">
        <div className="dzt-tool-desc-icon">☪️</div>
        <div>
          <div className="dzt-tool-desc-title">حاسبة الزكاة الشاملة — 2025</div>
          <div className="dzt-tool-desc-text">احسب زكاة المال والذهب والفضة والتجارة والزروع بالدينار الجزائري — بناءً على أسعار 2025 والنصاب الشرعي</div>
        </div>
      </div>

      {/* Gold/Silver prices */}
      <div className="dzt-zk-prices">
        <div className="dzt-zk-price-field">
          <label className="dzt-label">سعر الذهب (دج/غرام 18 قيراط)</label>
          <input type="number" className="dzt-inv-input" value={goldPrice}
            onChange={e=>setGoldPrice(+e.target.value)} placeholder="9200" />
          <div className="dzt-zk-hint">النصاب = 85غ × {goldPrice.toLocaleString()} = <strong>{fmt(nisabGold)}</strong></div>
        </div>
        <div className="dzt-zk-price-field">
          <label className="dzt-label">سعر الفضة (دج/غرام)</label>
          <input type="number" className="dzt-inv-input" value={silverPrice}
            onChange={e=>setSilverPrice(+e.target.value)} placeholder="95" />
          <div className="dzt-zk-hint">النصاب = 595غ × {silverPrice} = <strong>{fmt(nisabSilver)}</strong></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="dzt-zk-tabs">
        {ZAKAT_TABS.map(t=>(
          <button key={t.id} className={`dzt-zk-tab${tab===t.id?' active':''}`} onClick={()=>setTab(t.id)}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="dzt-zk-body">

        {tab==='mal' && (() => {
          const r = calcMal()
          return (
            <div className="dzt-zk-form">
              <div className="dzt-zk-info">💡 زكاة المال تجب إذا بلغ المال النصاب (≈ {fmt(nisabGold)}) وحال عليه الحول (سنة هجرية كاملة)</div>
              <label className="dzt-label">المدخرات والأموال السائلة (دج)</label>
              <input type="number" className="dzt-inv-input" placeholder="مثال: 500000" value={savings} onChange={e=>setSavings(e.target.value)} />
              <label className="dzt-label">الديون المستحقة عليك (دج)</label>
              <input type="number" className="dzt-inv-input" placeholder="مثال: 50000 أو 0" value={debts} onChange={e=>setDebts(e.target.value)} />
              {savings && <ResultBox eligible={!!r} zakat={r?.zakat||0} note={r?`الوعاء الزكوي: ${fmt(r.base)}`:`النصاب المطلوب: ${fmt(nisabGold)}`} />}
            </div>
          )
        })()}

        {tab==='gold' && (() => {
          const r = calcGold()
          return (
            <div className="dzt-zk-form">
              <div className="dzt-zk-info">💡 نصاب الذهب = 85 غراماً من الذهب الخالص (24 قيراط) — أي ما يعادل ≈ {fmt(85*goldPrice)} بالأسعار الحالية</div>
              <label className="dzt-label">وزن الذهب (غرام)</label>
              <input type="number" className="dzt-inv-input" placeholder="مثال: 120" value={goldGrams} onChange={e=>setGoldGrams(e.target.value)} />
              <label className="dzt-label">عيار الذهب</label>
              <div className="dzt-ht-pills" style={{marginBottom:8}}>
                {[18,21,22,24].map(k=>(
                  <button key={k} className={`dzt-ht-pill${goldKarat===k?' active':''}`} onClick={()=>setGoldKarat(k)}>{k} قيراط</button>
                ))}
              </div>
              {goldGrams && <ResultBox eligible={r.eligible} zakat={r.zakat}
                note={`الذهب الخالص: ${r.pureGrams.toFixed(1)}غ — القيمة: ${fmt(r.value)}`} />}
            </div>
          )
        })()}

        {tab==='silver' && (() => {
          const r = calcSilver()
          return (
            <div className="dzt-zk-form">
              <div className="dzt-zk-info">💡 نصاب الفضة = 595 غراماً — أي ما يعادل ≈ {fmt(nisabSilver)} بالأسعار الحالية (الفضة أقل من الذهب فنصابها يُستخدم لمن فيه رفق بالفقراء)</div>
              <label className="dzt-label">وزن الفضة (غرام)</label>
              <input type="number" className="dzt-inv-input" placeholder="مثال: 700" value={silverGrams} onChange={e=>setSilverGrams(e.target.value)} />
              {silverGrams && <ResultBox eligible={r.eligible} zakat={r.zakat}
                note={`القيمة: ${fmt(r.value)} — النصاب: ${fmt(r.nisab)}`} />}
            </div>
          )
        })()}

        {tab==='trade' && (() => {
          const r = calcTrade()
          return (
            <div className="dzt-zk-form">
              <div className="dzt-zk-info">💡 زكاة عروض التجارة = (البضاعة + الذمم المدينة − الديون) × 2.5% — إذا بلغ المجموع النصاب</div>
              <label className="dzt-label">قيمة المخزون / البضاعة (دج)</label>
              <input type="number" className="dzt-inv-input" placeholder="مثال: 2000000" value={inventory} onChange={e=>setInventory(e.target.value)} />
              <label className="dzt-label">الذمم المدينة (ديون الغير لك) (دج)</label>
              <input type="number" className="dzt-inv-input" placeholder="مثال: 300000 أو 0" value={receivables} onChange={e=>setReceivables(e.target.value)} />
              <label className="dzt-label">الديون المستحقة عليك (دج)</label>
              <input type="number" className="dzt-inv-input" placeholder="مثال: 100000 أو 0" value={tradeDebts} onChange={e=>setTradeDebts(e.target.value)} />
              {inventory && <ResultBox eligible={!!r} zakat={r?.zakat||0} note={r?`الوعاء: ${fmt(r.net)}`:`النصاب المطلوب: ${fmt(nisabGold)}`} />}
            </div>
          )
        })()}

        {tab==='crops' && (() => {
          const r = calcCrops()
          return (
            <div className="dzt-zk-form">
              <div className="dzt-zk-info">💡 نصاب الزروع = 653 كغ — المعدل: 10% للأرض المسقية بالمطر · 5% للأرض المروية بالري الاصطناعي</div>
              <label className="dzt-label">كمية المحصول (كيلوغرام)</label>
              <input type="number" className="dzt-inv-input" placeholder="مثال: 1000" value={cropsKg} onChange={e=>setCropsKg(e.target.value)} />
              <label className="dzt-label">سعر الكيلو (دج)</label>
              <input type="number" className="dzt-inv-input" placeholder="مثال: 80" value={cropsPrice} onChange={e=>setCropsPrice(e.target.value)} />
              <div className="dzt-dj-dirs" style={{marginTop:4}}>
                <button className={`dzt-dj-dir-btn${!irrigated?' active':''}`} onClick={()=>setIrrigated(false)}>
                  🌧️ بعلي (مطر) — العشر 10%
                </button>
                <button className={`dzt-dj-dir-btn${irrigated?' active':''}`} onClick={()=>setIrrigated(true)}>
                  🚿 مروي (ري اصطناعي) — نصف العشر 5%
                </button>
              </div>
              {cropsKg && cropsPrice && <ResultBox eligible={r.eligible} zakat={r.zakat}
                note={`المحصول: ${(parseFloat(cropsKg)||0).toLocaleString()} كغ — القيمة: ${fmt(r.value)} — المعدل: ${r.rate*100}%`} />}
            </div>
          )
        })()}

      </div>

      {/* Summary */}
      <div className="dzt-zk-summary">
        <div className="dzt-zk-summary-title">📊 ملخص شرعي مهم</div>
        <div className="dzt-zk-summary-items">
          <div className="dzt-zk-summary-item">⏱️ <strong>الحول</strong>: يجب أن يمر على المال سنة هجرية كاملة</div>
          <div className="dzt-zk-summary-item">🕌 <strong>النية</strong>: تجب النية عند إخراج الزكاة</div>
          <div className="dzt-zk-summary-item">📅 <strong>التوقيت</strong>: رمضان أفضل وقت لإخراجها ولكن تُخرج حين الوجوب</div>
          <div className="dzt-zk-summary-item">🤲 <strong>المستحقون</strong>: الفقراء · المساكين · ابن السبيل · في سبيل الله · المؤلفة قلوبهم</div>
          <div className="dzt-zk-summary-item">⚠️ <strong>تنبيه</strong>: الأسعار تقريبية — راجع عالماً معتمداً للتثبت</div>
        </div>
      </div>
    </div>
  )
}

// ─── Hashtag Generator Tool ────────────────────────────────────────────────────
const HT_PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: '📸' },
  { id: 'twitter',   label: 'X / Twitter', icon: '✖️' },
  { id: 'tiktok',    label: 'TikTok',   icon: '🎵' },
  { id: 'linkedin',  label: 'LinkedIn', icon: '💼' },
  { id: 'facebook',  label: 'Facebook', icon: '👥' },
  { id: 'youtube',   label: 'YouTube',  icon: '▶️' },
]
const HT_LANGS = [
  { id: 'ar',    label: 'العربية' },
  { id: 'fr',    label: 'Français' },
  { id: 'en',    label: 'English' },
  { id: 'dz',    label: '🇩🇿 دارجة' },
  { id: 'mixed', label: 'مختلط' },
]
const HT_CATS = [
  { id: 'general',       label: 'عام' },
  { id: 'entertainment', label: 'ترفيه' },
  { id: 'education',     label: 'تعليم' },
  { id: 'business',      label: 'أعمال' },
  { id: 'tech',          label: 'تقنية' },
  { id: 'sport',         label: 'رياضة' },
  { id: 'religion',      label: 'ديني' },
  { id: 'travel',        label: 'سفر' },
  { id: 'food',          label: 'طعام' },
  { id: 'fashion',       label: 'موضة' },
]

interface HtResult { popular: string[]; medium: string[]; niche: string[] }

function HashtagTool() {
  const [topic,    setTopic]    = useState('')
  const [platform, setPlatform] = useState('instagram')
  const [lang,     setLang]     = useState('ar')
  const [count,    setCount]    = useState(20)
  const [category, setCategory] = useState('general')
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<HtResult | null>(null)
  const [copied,   setCopied]   = useState(false)
  const [copiedTag, setCopiedTag] = useState<string | null>(null)

  const generate = async () => {
    if (!topic.trim()) return
    setLoading(true); setResult(null)
    const pl = HT_PLATFORMS.find(p => p.id === platform)?.label || platform
    const la = HT_LANGS.find(l => l.id === lang)?.label || lang
    const ca = HT_CATS.find(c => c.id === category)?.label || category
    const popular = Math.round(count * 0.3)
    const medium  = Math.round(count * 0.4)
    const niche   = count - popular - medium

    const prompt = `أنت خبير تسويق رقمي وإدارة مواقع التواصل الاجتماعي في الجزائر والعالم العربي.

المهمة: ولّد ${count} هاشتاغ لـ ${pl} حول: "${topic}"
اللغة: ${la} | الفئة: ${ca}

اتبع هذا التنسيق بدقة تامة — ضع الهاشتاغات مباشرة بعد كل عنوان:

🔥 شائعة (${popular}):
[${popular} هاشتاغات ذات حجم بحث عالي جداً]

📈 متوسطة (${medium}):
[${medium} هاشتاغات حجم بحث متوسط، استهداف أدق]

🎯 نيش (${niche}):
[${niche} هاشتاغات متخصصة، منافسة أقل، جمهور مستهدف]

قواعد: كل هاشتاغ يبدأ بـ # بدون مسافة داخلية — لا تكرار — أضف هاشتاغات جزائرية/مغاربية عند الاقتضاء`

    try {
      const res  = await fetch('/api/dz-agent-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
      })
      const data = await res.json()
      const text = data.content || ''
      const parseGroup = (start: string, stop: string): string[] => {
        const s = text.indexOf(start)
        const e = stop ? text.indexOf(stop, s + 1) : text.length
        if (s === -1) return []
        const section = text.slice(s, e === -1 ? undefined : e)
        return section.match(/#[\w\u0600-\u06FF\u0750-\u077F\u200C_]+/g) || []
      }
      setResult({
        popular: parseGroup('🔥', '📈'),
        medium:  parseGroup('📈', '🎯'),
        niche:   parseGroup('🎯', '\n\n\n'),
      })
    } catch { setResult({ popular: [], medium: [], niche: [] }) }
    setLoading(false)
  }

  const copyTag = (tag: string) => {
    navigator.clipboard.writeText(tag)
    setCopiedTag(tag); setTimeout(() => setCopiedTag(null), 1400)
  }
  const copyGroup = (tags: string[]) => navigator.clipboard.writeText(tags.join(' '))
  const allTags   = result ? [...result.popular, ...result.medium, ...result.niche] : []
  const copyAll   = () => {
    navigator.clipboard.writeText(allTags.join(' '))
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const PLATFORM_TIPS: Record<string, string> = {
    instagram: '📸 Instagram: استخدم 20–30 هاشتاغ — ضعها في التعليق الأول لمظهر أنظف في الكابشن',
    twitter:   '✖️ X / Twitter: 2–3 هاشتاغات فقط تحقق أفضل engagement — اختر الأكثر صلة',
    tiktok:    '🎵 TikTok: 5–10 هاشتاغات — أضف #fyp و#viral دائماً لزيادة الانتشار',
    linkedin:  '💼 LinkedIn: 3–5 هاشتاغات مهنية — اختر الأدق تخصصاً لجمهورك',
    facebook:  '👥 Facebook: 3–5 هاشتاغات — تأثيرها في البحث محدود لكن مفيد للتصنيف',
    youtube:   '▶️ YouTube: 3–5 في العنوان + 5–10 في الوصف — تجنب Keyword Stuffing',
  }

  return (
    <div className="dzt-ht-wrap">
      <div className="dzt-tool-desc">
        <div className="dzt-tool-desc-icon">#️⃣</div>
        <div>
          <div className="dzt-tool-desc-title">مولّد الهاشتاغات بالذكاء الاصطناعي</div>
          <div className="dzt-tool-desc-text">اكتب موضوع مختصر ← AI يحلل ويولد أفضل الهاشتاغات مصنّفة حسب الشعبية — جاهزة للنسخ والاستخدام الفوري</div>
        </div>
      </div>

      {/* Platform selector */}
      <div className="dzt-ht-block">
        <label className="dzt-label">المنصة</label>
        <div className="dzt-ht-platforms">
          {HT_PLATFORMS.map(p => (
            <button key={p.id}
              className={`dzt-ht-platform${platform === p.id ? ' active' : ''}`}
              onClick={() => setPlatform(p.id)}>
              <span className="dzt-ht-platform-icon">{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Topic */}
      <div className="dzt-ht-block">
        <label className="dzt-label">الموضوع *</label>
        <textarea
          className="dzt-ht-textarea"
          placeholder="مثال: وصفة الكسكسي الجزائري الأصيل... أو: الذكاء الاصطناعي في التعليم... أو: السياحة في الجنوب الجزائري..."
          value={topic}
          onChange={e => setTopic(e.target.value)}
          rows={3}
          onKeyDown={e => e.key === 'Enter' && e.ctrlKey && generate()}
        />
        <div style={{fontSize:11,color:'#444',textAlign:'right',marginTop:4}}>Ctrl+Enter للتوليد السريع</div>
      </div>

      {/* Controls row */}
      <div className="dzt-ht-controls">
        <div className="dzt-ht-ctrl">
          <label className="dzt-label">اللغة</label>
          <div className="dzt-ht-pills">
            {HT_LANGS.map(l => (
              <button key={l.id} className={`dzt-ht-pill${lang === l.id ? ' active' : ''}`} onClick={() => setLang(l.id)}>{l.label}</button>
            ))}
          </div>
        </div>
        <div className="dzt-ht-ctrl">
          <label className="dzt-label">الفئة</label>
          <div className="dzt-ht-pills">
            {HT_CATS.map(c => (
              <button key={c.id} className={`dzt-ht-pill${category === c.id ? ' active' : ''}`} onClick={() => setCategory(c.id)}>{c.label}</button>
            ))}
          </div>
        </div>
        <div className="dzt-ht-ctrl">
          <label className="dzt-label">العدد</label>
          <div className="dzt-ht-pills">
            {[10, 20, 30].map(n => (
              <button key={n} className={`dzt-ht-pill${count === n ? ' active' : ''}`} onClick={() => setCount(n)}>{n} هاشتاغ</button>
            ))}
          </div>
        </div>
      </div>

      <button className="dzt-btn" onClick={generate} disabled={loading || !topic.trim()}
        style={{fontSize:15,padding:'14px 28px',borderRadius:12}}>
        {loading ? '⏳ AI يحلل الموضوع...' : `✨ ولّد ${count} هاشتاغ لـ ${HT_PLATFORMS.find(p=>p.id===platform)?.label}`}
      </button>

      {/* Loading */}
      {loading && (
        <div className="dzt-ht-loading">
          <div className="dzt-ht-spinner"/>
          <span>AI يختار أفضل الهاشتاغات الشائعة والمتخصصة...</span>
        </div>
      )}

      {/* Results */}
      {result && allTags.length > 0 && (
        <div className="dzt-ht-results">
          <div className="dzt-ht-results-bar">
            <span className="dzt-ht-count-badge">{allTags.length} هاشتاغ جاهز</span>
            <button className={`dzt-ht-copy-all${copied ? ' done' : ''}`} onClick={copyAll}>
              {copied ? '✅ تم النسخ!' : '📋 نسخ الكل'}
            </button>
          </div>

          {[
            { key: 'popular', emoji: '🔥', label: 'شائعة',  desc: 'بحث عالي جداً',  color: '#ff6b35', tags: result.popular },
            { key: 'medium',  emoji: '📈', label: 'متوسطة', desc: 'استهداف جيد',     color: '#60a5fa', tags: result.medium },
            { key: 'niche',   emoji: '🎯', label: 'نيش',    desc: 'منافسة أقل — أفضل وصول', color: '#c8ff00', tags: result.niche },
          ].map(g => g.tags.length > 0 && (
            <div key={g.key} className="dzt-ht-group">
              <div className="dzt-ht-group-head">
                <span className="dzt-ht-group-title" style={{color: g.color}}>{g.emoji} {g.label}</span>
                <span className="dzt-ht-group-desc">{g.desc} · {g.tags.length} هاشتاغ</span>
                <button className="dzt-ht-copy-grp" onClick={() => copyGroup(g.tags)}>نسخ المجموعة</button>
              </div>
              <div className="dzt-ht-chips">
                {g.tags.map((tag, i) => (
                  <button key={i} className={`dzt-ht-chip${copiedTag === tag ? ' copied' : ''}`}
                    style={{'--chip-color': g.color} as React.CSSProperties}
                    onClick={() => copyTag(tag)} title="انقر للنسخ">
                    {copiedTag === tag ? '✅' : tag}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Platform tip */}
          <div className="dzt-ht-tip">
            💡 {PLATFORM_TIPS[platform]}
          </div>

          {/* Ready-to-paste */}
          <div className="dzt-ht-paste">
            <div className="dzt-ht-paste-head">
              <span>📋 جاهز للصق المباشر</span>
              <button className={`dzt-ht-copy-all${copied?' done':''}`} onClick={copyAll}>
                {copied ? '✅ تم!' : 'نسخ'}
              </button>
            </div>
            <div className="dzt-ht-paste-body" dir="ltr">{allTags.join(' ')}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Data Analysis Tool (CSV / Excel) ─────────────────────────────────────────
interface DataRow { [key: string]: string | number }

function DataAnalysisTool() {
  const [rows, setRows]       = useState<DataRow[]>([])
  const [cols, setCols]       = useState<string[]>([])
  const [filename, setFilename] = useState('')
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState('')
  const [chartCol, setChartCol] = useState('')
  const [error, setError]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const numCols = cols.filter(c => rows.some(r => !isNaN(parseFloat(String(r[c])))))

  const parseFile = useCallback(async (file: File) => {
    setLoading(true); setError(''); setRows([]); setCols([]); setSummary(''); setChartCol('')
    setFilename(file.name)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase()
      let parsed: DataRow[] = []
      let headers: string[] = []

      if (ext === 'csv') {
        const text = await file.text()
        const Papa = (await import('papaparse')).default
        const result = Papa.parse<DataRow>(text, { header: true, skipEmptyLines: true, dynamicTyping: true })
        parsed  = result.data
        headers = result.meta.fields || []
      } else {
        const buffer = await file.arrayBuffer()
        const XLSX   = await import('xlsx')
        const wb     = XLSX.read(buffer, { type: 'array' })
        const ws     = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][]
        if (data.length < 2) throw new Error('الملف فارغ')
        headers = (data[0] as string[]).map(String)
        parsed  = data.slice(1).map(row => {
          const r = row as (string | number)[]
          const obj: DataRow = {}
          headers.forEach((h, i) => { obj[h] = r[i] ?? '' })
          return obj
        })
      }
      setCols(headers)
      setRows(parsed.slice(0, 500))
      const firstNum = headers.find(c => parsed.some(r => !isNaN(parseFloat(String(r[c])))))
      if (firstNum) setChartCol(firstNum)
    } catch (e) {
      setError('تعذّر قراءة الملف. تأكد أنه CSV أو Excel صحيح.')
    }
    setLoading(false)
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }

  const getStats = (col: string) => {
    const vals = rows.map(r => parseFloat(String(r[col]))).filter(v => !isNaN(v))
    if (!vals.length) return null
    const sum = vals.reduce((a,b)=>a+b,0)
    const min = Math.min(...vals), max = Math.max(...vals)
    const avg = sum / vals.length
    const sorted = [...vals].sort((a,b)=>a-b)
    const median = sorted[Math.floor(sorted.length/2)]
    return { sum, min, max, avg, median, count: vals.length }
  }

  const aiSummary = async () => {
    if (!rows.length) return
    setLoading(true)
    try {
      const sample = rows.slice(0,20)
      const statsStr = numCols.map(c => {
        const s = getStats(c); if (!s) return ''
        return `${c}: المجموع=${s.sum.toFixed(0)}, المتوسط=${s.avg.toFixed(2)}, الأدنى=${s.min}, الأعلى=${s.max}`
      }).filter(Boolean).join('\n')
      const prompt = `أنت محلل بيانات. لديك ملف "${filename}" يحتوي على ${rows.length} صف و ${cols.length} عمود.
الأعمدة: ${cols.join('، ')}
إحصائيات الأعمدة العددية:
${statsStr}
عينة من البيانات (أول 5 صفوف):
${JSON.stringify(sample.slice(0,5), null, 2)}

اكتب ملخصاً تحليلياً باللغة العربية في 5-8 جمل: ماذا تخبرنا هذه البيانات؟ أبرز الأنماط، القيم المثيرة للاهتمام، وأي ملاحظات مهمة.`
      const res  = await fetch('/api/dz-agent-chat', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ messages:[{role:'user',content:prompt}], tool:'data-analysis' }) })
      const data = await res.json()
      setSummary(data.content || '')
    } catch { setSummary('⚠️ تعذّر توليد الملخص. حاول مرة أخرى.') }
    setLoading(false)
  }

  const chartData = chartCol
    ? rows.slice(0,20).map((r,i)=>({ name: String(r[cols[0]]||i+1).slice(0,15), value: parseFloat(String(r[chartCol]))||0 }))
    : []

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div className="dzt-tool-desc">
        <div className="dzt-tool-desc-icon">📈</div>
        <div>
          <div className="dzt-tool-desc-title">محلل البيانات — Excel / CSV</div>
          <div className="dzt-tool-desc-text">ارفع ملف Excel أو CSV واحصل على جدول، إحصائيات تلقائية، رسوم بيانية وملخص AI فوري</div>
        </div>
      </div>

      <div
        className="dzt-data-dropzone"
        onDrop={onDrop}
        onDragOver={e=>e.preventDefault()}
        onClick={()=>fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}} onChange={e=>{ if(e.target.files?.[0]) parseFile(e.target.files[0]) }} />
        <Upload size={32} style={{color:'#c8ff00',marginBottom:8}} />
        <div style={{fontWeight:700,color:'#fff'}}>اسحب الملف هنا أو انقر للاختيار</div>
        <div style={{fontSize:12,color:'#666',marginTop:4}}>CSV · Excel (.xlsx / .xls) — حتى 500 صف</div>
      </div>

      {loading && <div className="dzt-spinner" style={{margin:'12px auto'}} />}
      {error   && <div style={{color:'#f87171',background:'rgba(239,68,68,.08)',borderRadius:10,padding:'12px 16px',fontSize:14}}>{error}</div>}

      {rows.length > 0 && (
        <>
          <div className="dzt-data-meta">
            <span>📁 {filename}</span>
            <span>🗂️ {rows.length} صف</span>
            <span>📊 {cols.length} عمود</span>
            <span>🔢 {numCols.length} عمود رقمي</span>
          </div>

          {/* Stats Cards */}
          {numCols.length > 0 && (
            <div className="dzt-data-stats-grid">
              {numCols.slice(0,4).map(c => {
                const s = getStats(c); if (!s) return null
                return (
                  <div key={c} className="dzt-data-stat-card">
                    <div className="dzt-data-stat-col">{c}</div>
                    <div className="dzt-data-stat-row"><span>المجموع</span><strong>{s.sum.toLocaleString('fr-DZ')}</strong></div>
                    <div className="dzt-data-stat-row"><span>المتوسط</span><strong>{s.avg.toFixed(2)}</strong></div>
                    <div className="dzt-data-stat-row"><span>الأدنى</span><strong style={{color:'#f87171'}}>{s.min}</strong></div>
                    <div className="dzt-data-stat-row"><span>الأعلى</span><strong style={{color:'#4ade80'}}>{s.max}</strong></div>
                    <div className="dzt-data-stat-row"><span>الوسيط</span><strong>{s.median}</strong></div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Chart */}
          {numCols.length > 0 && (
            <div className="dzt-data-chart-section">
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12,flexWrap:'wrap'}}>
                <div style={{fontWeight:700,color:'#ccc',fontSize:14}}>📊 رسم بياني للعمود:</div>
                <select className="dzt-select" style={{flex:1,maxWidth:260}} value={chartCol} onChange={e=>setChartCol(e.target.value)}>
                  {numCols.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{top:4,right:4,left:4,bottom:24}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="name" tick={{fill:'#888',fontSize:11}} angle={-30} textAnchor="end" />
                  <YAxis tick={{fill:'#888',fontSize:11}} />
                  <Tooltip contentStyle={{background:'#111',border:'1px solid #222',borderRadius:8,color:'#fff'}} />
                  <Bar dataKey="value" fill="#c8ff00" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* AI Summary */}
          <div className="dzt-result-actions" style={{marginTop:4}}>
            <button className="dzt-btn" onClick={aiSummary} disabled={loading}>
              <BarChart2 size={15}/> ملخص AI للبيانات
            </button>
          </div>
          {summary && (
            <div className="dzt-result">
              <div className="dzt-result-header">
                <span>🤖 ملخص AI</span>
              </div>
              <div className="dzt-result-body" style={{padding:'16px 20px'}}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Table preview */}
          <div className="dzt-data-table-wrap">
            <div className="dzt-data-table-label">جدول البيانات (أول 50 صف)</div>
            <div style={{overflowX:'auto'}}>
              <table className="dzt-data-table">
                <thead>
                  <tr>{cols.map(c=><th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0,50).map((r,i)=>(
                    <tr key={i}>{cols.map(c=><td key={c}>{String(r[c]??'')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
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
        {active === 'darija'       && <DarijaTool />}
        {active === 'zakat'        && <ZakatTool />}
        {active === 'hashtag'      && <HashtagTool />}
        {active === 'excel'        && <SpreadsheetTool />}
        {active === 'cv'           && <CVTool />}
        {active === 'planner'      && <PlannerTool />}
        {active === 'docs'         && <BizDocsTool />}
        {active === 'jobs'         && <JobSearchTool />}
        {active === 'health'       && <HealthTool />}
        {active === 'invoice'      && <InvoiceTool />}
        {active === 'tax'          && <TaxTool />}
        {active === 'pension'      && <PensionTool />}
        {active === 'qrcode'       && <QRCodeTool />}
        {active === 'bizcard'      && <BizCardTool />}
        {active === 'dataanalysis' && <DataAnalysisTool />}
        {active === 'ocr'          && <OCRTool />}
        {active === 'bizplan'      && <BizPlanTool />}
      </div>
    </div>
  )
}
