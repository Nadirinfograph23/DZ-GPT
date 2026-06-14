import { useState, useRef, useEffect, useCallback } from 'react'
import { createWorker } from 'tesseract.js'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowRight, Copy, Check, Printer, Download, Search, Heart, FileText, ImageIcon, RotateCcw, ScanSearch, Upload, Calculator, QrCode, BarChart2 } from 'lucide-react'
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMiniPlayer } from '../context/MiniPlayerContext'
import DoctorResultsPanel, { DoctorResult, DirLink } from '../components/DoctorResultsPanel'
import SpreadsheetTool from '../components/SpreadsheetTool'
import '../styles/dz-tools.css'

const NO_AI_MSG = '⚠️ خدمة الذكاء الاصطناعي غير متاحة مؤقتاً. يرجى المحاولة لاحقاً أو التواصل مع الدعم.'

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

type ToolId = 'cv' | 'planner' | 'docs' | 'jobs' | 'health' | 'ocr' | 'bizplan' | 'image' | 'hashtag' | 'invoice' | 'tax' | 'pension' | 'qrcode' | 'bizcard' | 'darija' | 'zakat' | 'excel' | 'dataanalysis' | 'tts' | 'screenshot' | 'fileupload' | 'convert' | 'flights'

const TOOLS: { id: ToolId; icon: string; name: string; desc: string; badge?: string }[] = [
  { id: 'cv',      icon: '📄', name: 'مولّد السيرة الذاتية',   desc: 'أنشئ سيرة ذاتية احترافية بالعربية أو الفرنسية في ثوانٍ' },
  { id: 'planner', icon: '📋', name: 'مخطط المشاريع',           desc: 'حوّل فكرتك إلى خطة عمل تفصيلية مع مهام وجدول زمني' },
  { id: 'docs',    icon: '📑', name: 'وثائق تجارية',            desc: 'عقود عمل • مراسلات • عروض أسعار • محاضر اجتماعات' },
  { id: 'jobs',    icon: '💼', name: 'بحث وظيفي',              desc: 'ابحث عن وظيفة في الجزائر واحصل على مساعدة في رسالة التقدم' },
  { id: 'health',  icon: '🏥', name: 'وكيل الصحة',             desc: 'تحليل الأعراض • البحث عن طبيب • نصائح صحية للجزائر' },
  { id: 'image',   icon: '🖼️', name: 'Visual AI — صور',        desc: 'بحث عن صور • بحث عكسي • تحليل AI • OCR من الصور' },
  { id: 'ocr',          icon: '📷', name: 'قارئ الوثائق OCR',           desc: 'ارفع صورة واستخرج النص تلقائياً بـ Tesseract' },
  { id: 'bizplan',      icon: '📊', name: 'خطة العمل Business Plan',     desc: 'خطة عمل كاملة لمشروعك في الجزائر مع أرقام حقيقية' },
  { id: 'invoice',      icon: '🧾', name: 'مولّد الفواتير',               desc: 'فواتير جزائرية احترافية — TVA • HT • TTC — تحميل PDF' },
  { id: 'tax',          icon: '🧮', name: 'مُحاسب الضرائب',               desc: 'IRG (ضريبة الدخل) • IBS (ضريبة الشركات) — شرائح 2024' },
  { id: 'darija',       icon: '🗣️', name: 'مترجم الدارجة الجزائرية',      desc: 'عربي/فرنسي ↔ دارجة جزائرية — شرق · غرب · وسط · جنوب', badge: 'NEW' },
  { id: 'zakat',        icon: '☪️', name: 'حاسبة الزكاة الشاملة',         desc: 'زكاة المال · الذهب · الفضة · التجارة · الزروع — بالدينار الجزائري', badge: 'NEW' },
  { id: 'hashtag',      icon: '#️⃣', name: 'مولّد الهاشتاغ',               desc: 'هاشتاغات ذكية للجزائر — إنستغرام • تيك توك • X • لينكدإن', badge: 'NEW' },
  { id: 'excel',        icon: '📊', name: 'محرر Excel الذكي',             desc: 'جدول بيانات كامل + 30 دالة + مساعد AI للدوال — استيراد/تصدير XLSX', badge: 'NEW' },
  { id: 'pension',      icon: '🏦', name: 'حاسبة التقاعد CNAS',           desc: 'احسب اشتراكاتك ومعاشك المتوقع — CNAS موظف · CASNOS مستقل', badge: 'NEW' },
  { id: 'qrcode',       icon: '📲', name: 'مولّد QR Code',                 desc: 'أنشئ QR Code لأي نص أو رابط أو معلومات — تحميل فوري', badge: 'NEW' },
  { id: 'bizcard',      icon: '🪪', name: 'بطاقة العمل',                   desc: 'صمّم بطاقة عمل احترافية بالعربية والفرنسية — تصدير PDF', badge: 'NEW' },
  { id: 'dataanalysis', icon: '📈', name: 'محلل البيانات',                 desc: 'ارفع ملف Excel أو CSV — تحليل ذكي + رسوم بيانية + ملخص AI', badge: 'NEW' },
  { id: 'tts',          icon: '🔊', name: 'تحويل نص إلى صوت',              desc: 'حوّل أي نص إلى صوت طبيعي بأصوات عربية وفرنسية وإنجليزية — تحميل MP3', badge: 'NEW' },
  { id: 'screenshot',   icon: '📸', name: 'تصوير المواقع',                  desc: 'التقط صورة كاملة لأي موقع — تنزيل PNG أو PDF — Desktop / Mobile', badge: 'NEW' },
  { id: 'fileupload',   icon: '☁️', name: 'رفع ومشاركة الملفات',            desc: 'ارفع أي ملف (صورة · فيديو · PDF · ملف) واحصل على رابط مشاركة آمن — GoFile.io', badge: 'NEW' },
  { id: 'convert',      icon: '🔄', name: 'محوِّل الصيغ',                   desc: 'حوِّل فيديو · صوت · صور بين جميع الصيغ — مباشرة في المتصفح بـ FFmpeg.wasm', badge: 'NEW' },
  { id: 'flights',      icon: '✈️', name: 'رحلات الخطوط الجزائرية',         desc: 'ابحث عن رحلات Air Algérie الداخلية والدولية بالمواعيد وأيام التشغيل', badge: 'NEW' },
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
      if (data.status === 'no_api_key' || !data.content) { setResult(NO_AI_MSG); return }
      setResult(data.content)
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
      if (data.status === 'no_api_key' || !data.content) { setResult(NO_AI_MSG); return }
      setResult(data.content)
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
      if (data.status === 'no_api_key' || !data.content) { setResult(NO_AI_MSG); return }
      setResult(data.content)
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
      if (data.status === 'no_api_key' || !data.content) { setResult(NO_AI_MSG); return }
      setResult(data.content)
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
        if (data.status === 'no_api_key' || !data.content) { setResult(NO_AI_MSG); setLoading(false); return }
        setResult(data.content)
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
      if (data.status === 'no_api_key' || !data.content) { setResult(NO_AI_MSG); return }
      setResult(data.content)
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

// ─── Image Processing Tool ────────────────────────────────────────────────────



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
interface DarijaResult {
  translation: string
  transliteration?: string
  explanation?: string
  grammar_tip?: string
  examples?: {original:string; translated:string; region?:string}[]
  regional_alt?: string
  local_hits?: {dz:string; ar:string; fr?:string; type:string; ctx?:string}[]
  source?: string
}

function DarijaTool() {
  const [dir,      setDir]      = useState('ar2dz')
  const [region,   setRegion]   = useState('center')
  const [input,    setInput]    = useState('')
  const [result,   setResult]   = useState<DarijaResult|null>(null)
  const [loading,  setLoading]  = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [error,    setError]    = useState('')
  const [charCount,setCharCount]= useState(0)

  const QUICK: Record<string, string[]> = {
    ar2dz: ['كيف حالك؟','أريد أن آكل','هل أنت مشغول؟','أين تسكن؟','شكراً جزيلاً','إلى اللقاء','ما هو سعر هذا؟','أنا متعب جداً'],
    dz2ar: ['واش راك؟','بغيت ناكل','علاش ما جيتش؟','وين تسكن؟','يعيشك باباك','نروح وراك','بشحال هذا؟','راني مريض'],
    fr2dz: ['Comment tu vas?','Je veux manger','Où habites-tu?','Merci beaucoup','Au revoir','C\'est combien?','Je suis fatigué','Allons-y'],
    dz2fr: ['واش راك؟','بغيت ناكل','وين تسكن؟','يعيشك','نروح وراك','بشحال؟','راني مريض','هيا بينا'],
  }

  const translate = async () => {
    if (!input.trim()) return
    setLoading(true); setResult(null); setError('')
    try {
      const res = await fetch('/api/tools/darija-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input.trim(), direction: dir, region })
      })
      if (!res.ok) {
        const e = await res.json().catch(()=>({error:'خطأ في الاتصال'}))
        throw new Error(e.error || `HTTP ${res.status}`)
      }
      const data: DarijaResult = await res.json()
      setResult(data)
    } catch(e: any) {
      setError(e.message || '⚠️ خطأ في الاتصال، حاول مرة أخرى.')
    }
    setLoading(false)
  }

  const swap = () => {
    const pairs: Record<string,string> = { ar2dz:'dz2ar', dz2ar:'ar2dz', fr2dz:'dz2fr', dz2fr:'fr2dz' }
    const newDir = pairs[dir] || dir
    const prevTranslation = result?.translation || ''
    setDir(newDir)
    setInput(prevTranslation)
    setResult(null)
    setError('')
    setCharCount(prevTranslation.length)
  }

  const handleInput = (v: string) => {
    setInput(v)
    setCharCount(v.length)
    if (result) setResult(null)
    if (error) setError('')
  }

  const currentDir = DARIJA_DIRS.find(d=>d.id===dir)

  return (
    <div className="dzt-dj-wrap">
      <div className="dzt-tool-desc">
        <div className="dzt-tool-desc-icon">🗣️</div>
        <div>
          <div className="dzt-tool-desc-title">مترجم الدارجة الجزائرية</div>
          <div className="dzt-tool-desc-text">ترجمة ذكية مدعومة بقاعدة بيانات محلية + AI متخصص · يراعي اللهجات الإقليمية: الجزائر العاصمة · وهران · قسنطينة · الجنوب</div>
        </div>
      </div>

      {/* Direction selector */}
      <div className="dzt-dj-block">
        <label className="dzt-label">🔀 اتجاه الترجمة</label>
        <div className="dzt-dj-dirs">
          {DARIJA_DIRS.map(d=>(
            <button key={d.id} className={`dzt-dj-dir-btn${dir===d.id?' active':''}`}
              onClick={()=>{setDir(d.id);setResult(null);setError('')}}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Region selector */}
      <div className="dzt-dj-block">
        <label className="dzt-label">📍 المنطقة / اللهجة</label>
        <div className="dzt-dj-regions">
          {DARIJA_REGIONS.map(r=>(
            <button key={r.id} className={`dzt-dj-region${region===r.id?' active':''}`} onClick={()=>setRegion(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick chips */}
      <div className="dzt-dj-block">
        <label className="dzt-label">⚡ أمثلة سريعة</label>
        <div className="dzt-dj-quick">
          {(QUICK[dir]||[]).map(q=>(
            <button key={q} className="dzt-dj-quick-btn"
              onClick={()=>{handleInput(q)}}>
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input / Output panels */}
      <div className="dzt-dj-panels">
        {/* Input panel */}
        <div className="dzt-dj-panel">
          <div className="dzt-dj-panel-label">
            <span>{currentDir?.from}</span>
            <span className={`dzt-dj-charcount${charCount>450?' warn':''}`}>{charCount}/500</span>
          </div>
          <textarea
            className="dzt-dj-textarea"
            placeholder={dir.startsWith('fr') ? 'Écrivez votre texte ici...' : 'اكتب النص هنا...'}
            value={input}
            onChange={e=>handleInput(e.target.value)}
            maxLength={500}
            rows={4}
            onKeyDown={e=>e.key==='Enter'&&e.ctrlKey&&translate()}
          />
          {input.trim() && (
            <button className="dzt-dj-clear" onClick={()=>{handleInput('');setResult(null)}}>✕ مسح</button>
          )}
        </div>

        {/* Swap button */}
        <button className="dzt-dj-swap" onClick={swap} title="تبديل الاتجاه وعكس الترجمة">
          {loading ? <span className="dzt-dj-spin">◌</span> : '⇄'}
        </button>

        {/* Output panel */}
        <div className="dzt-dj-panel">
          <div className="dzt-dj-panel-label">
            <span>{currentDir?.to}</span>
            {result?.translation && (
              <button className={`dzt-dj-copy${copied?' done':''}`}
                onClick={()=>{navigator.clipboard.writeText(result.translation);setCopied(true);setTimeout(()=>setCopied(false),2000)}}>
                {copied ? '✅ تم' : '📋 نسخ'}
              </button>
            )}
          </div>
          <div className={`dzt-dj-output${loading?' loading':''}`}>
            {loading ? (
              <div className="dzt-dj-loading-anim">
                <div className="dzt-dj-dots"><span/><span/><span/></div>
                <p>AI يترجم مع مراعاة اللهجة...</p>
              </div>
            ) : error ? (
              <span className="dzt-dj-error">{error}</span>
            ) : result ? (
              <div className="dzt-dj-result-main">{result.translation}</div>
            ) : (
              <span className="dzt-dj-placeholder">ستظهر الترجمة هنا...</span>
            )}
          </div>
          {result?.transliteration && (
            <div className="dzt-dj-translit">🔤 {result.transliteration}</div>
          )}
        </div>
      </div>

      {/* Translate button */}
      <button className="dzt-btn dzt-dj-translate-btn" onClick={translate} disabled={loading||!input.trim()}>
        {loading ? '⏳ جاري الترجمة...' : '🗣️ ترجم الآن'}
        {!loading && <span className="dzt-dj-btn-hint">Ctrl+Enter</span>}
      </button>

      {/* Rich results */}
      {result && (
        <div className="dzt-dj-rich">

          {/* Explanation */}
          {result.explanation && (
            <div className="dzt-dj-card dzt-dj-card-explain">
              <div className="dzt-dj-card-title">💡 شرح وملاحظات</div>
              <p>{result.explanation}</p>
            </div>
          )}

          {/* Grammar tip */}
          {result.grammar_tip && (
            <div className="dzt-dj-card dzt-dj-card-grammar">
              <div className="dzt-dj-card-title">📐 ملاحظة نحوية</div>
              <p>{result.grammar_tip}</p>
            </div>
          )}

          {/* Regional alt */}
          {result.regional_alt && (
            <div className="dzt-dj-card dzt-dj-card-region">
              <div className="dzt-dj-card-title">🗺️ بديل إقليمي</div>
              <p>{result.regional_alt}</p>
            </div>
          )}

          {/* Examples */}
          {result.examples && result.examples.length > 0 && (
            <div className="dzt-dj-card dzt-dj-card-examples">
              <div className="dzt-dj-card-title">📚 أمثلة مماثلة</div>
              <div className="dzt-dj-ex-list">
                {result.examples.map((ex,i)=>(
                  <div key={i} className="dzt-dj-ex-row">
                    <div className="dzt-dj-ex-orig">
                      <span className="dzt-dj-ex-num">{i+1}</span>
                      {ex.original}
                    </div>
                    <span className="dzt-dj-ex-arrow">→</span>
                    <div className="dzt-dj-ex-trans">
                      {ex.translated}
                      {ex.region && <span className="dzt-dj-ex-reg">({ex.region})</span>}
                    </div>
                    <button className="dzt-dj-ex-use"
                      onClick={()=>{handleInput(ex.original);setResult(null)}}>
                      جرّب
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Local DB hits */}
          {result.local_hits && result.local_hits.length > 0 && (
            <div className="dzt-dj-card dzt-dj-card-db">
              <div className="dzt-dj-card-title">🗂️ من قاعدة البيانات المحلية</div>
              <div className="dzt-dj-db-grid">
                {result.local_hits.map((h,i)=>(
                  <div key={i} className="dzt-dj-db-item">
                    <span className="dzt-dj-db-dz">{h.dz}</span>
                    <span className="dzt-dj-db-sep">←</span>
                    <span className="dzt-dj-db-ar">{h.ar}</span>
                    {h.fr && <span className="dzt-dj-db-fr">/ {h.fr}</span>}
                    <span className={`dzt-dj-db-type dzt-dj-db-type-${h.type}`}>
                      {h.type==='expr'?'تعبير':h.type==='word'?'كلمة':'دارجة'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Source badge */}
          <div className="dzt-dj-source">
            {result.source==='local' ? '🗂️ مصدر: قاعدة البيانات المحلية' : '🤖 مصدر: AI + قاعدة البيانات'}
          </div>
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
          <div className="dzt-tool-desc-title">حاسبة الزكاة الشاملة — 2026</div>
          <div className="dzt-tool-desc-text">احسب زكاة المال والذهب والفضة والتجارة والزروع بالدينار الجزائري — بناءً على أسعار 2026 والنصاب الشرعي</div>
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


// ─── Hashtag Tool ─────────────────────────────────────────────────────────────
const HASHTAG_PLATFORMS = [
  { id: 'instagram', label: 'إنستغرام', icon: '📸', max: 30 },
  { id: 'tiktok',    label: 'تيك توك',  icon: '🎵', max: 20 },
  { id: 'twitter',   label: 'X / تويتر', icon: '✖️', max: 10 },
  { id: 'linkedin',  label: 'لينكدإن',  icon: '💼', max: 15 },
  { id: 'facebook',  label: 'فيسبوك',   icon: '👥', max: 20 },
]

const HASHTAG_CATS = [
  'عام', 'طعام ومطاعم', 'موضة وأزياء', 'تقنية', 'رياضة', 'سفر وسياحة',
  'تعليم', 'أعمال وريادة', 'صحة وجمال', 'ترفيه وفن', 'دين وقيم',
]

// Fallback client-side pool (used when no AI key)
const HT_POOL: Record<string, string[]> = {
  'عام':            ['#الجزائر','#Algeria','#DZ','#Algérie','#الجزائر_العاصمة','#جزائري','#dzair','#AlgeriaDZ','#Algerian','#algeria2025','#algerie','#جزائر','#جزائريون','#شباب_الجزائر','#DZArt','#بنات_الجزائر'],
  'طعام ومطاعم':   ['#طعام_جزائري','#cuisine_algérienne','#مطبخ_جزائري','#algerian_food','#طاجين','#كسكسي','#شرشم','#تمبالة','#مطاعم_الجزائر','#طبخ','#food','#foodie','#foodphotography','#الطبخ_الجزائري','#CuisineDZ','#homemade'],
  'موضة وأزياء':   ['#موضة_جزائرية','#fashion_dz','#قنادر','#خياطة_جزائرية','#أزياء','#style','#fashion','#ootd','#تقليدي','#حايك','#قفطان','#كراكو','#تراث_جزائري','#FashionDZ','#AlgerianFashion','#mode_algérienne'],
  'تقنية':          ['#تقنية','#tech_dz','#برمجة','#ذكاء_اصطناعي','#Algeria_Tech','#coding','#developer','#AI','#startup_dz','#التكنولوجيا','#مطور','#تطوير_تطبيقات','#webdev','#programming','#innovation','#DZtech'],
  'رياضة':          ['#رياضة_الجزائر','#sport_dz','#الخضر','#MCA','#CRB','#USMA','#JSK','#كرة_القدم_الجزائرية','#العنابي','#football_algérien','#handball_dz','#athletisme_dz','#SportDZ','#منتخب_الجزائر','#الدوري_الجزائري','#مباراة'],
  'سفر وسياحة':    ['#سياحة_جزائرية','#tourisme_algérie','#الصحراء_الجزائرية','#تيميمون','#جانت','#قسنطينة','#وهران','#تلمسان','#الجزائر_العاصمة','#القصبة','#travel','#algeria_travel','#الاهقار','#Sahara','#TourismeDZ','#AlgeriaTourism'],
  'تعليم':          ['#تعليم_جزائر','#éducation_dz','#باك_جزائر','#جامعة_الجزائر','#bac2025','#دروس_مجانية','#تعلم','#formation_dz','#étudiant_algérien','#USTHB','#طالب_جزائري','#education','#learn','#مذاكرة','#baccalauréat','#تطوير_الذات'],
  'أعمال وريادة':   ['#ريادة_أعمال_الجزائر','#startup_algérie','#entrepreneuriat_dz','#مقاول_جزائري','#ANSEJ','#CNAC','#investissement_dz','#أعمال','#entrepreneur','#business_dz','#PME_algérie','#freelance_dz','#مستقل','#تجارة_إلكترونية','#DZBusiness','#investir_algérie'],
  'صحة وجمال':     ['#صحة','#beauté_dz','#جمال_جزائري','#طب_طبيعي','#عشبة','#سنة_نبوية','#skincare','#حجامة','#عسل_جزائري','#صحة_وعافية','#beauty','#wellness','#soins_naturels','#حمية','#لياقة','#fitness_dz'],
  'ترفيه وفن':      ['#فن_جزائري','#موسيقى_جزائرية','#شعبي','#راي','#مالوف','#chaabi_algérien','#rai_music','#cinema_algérien','#فيلم_جزائري','#photography_dz','#art_dz','#dessin','#calligraphie','#humour_dz','#AlgerianArt','#creative_dz'],
  'دين وقيم':       ['#إسلام','#الجزائر_المسلمة','#قرآن_كريم','#حديث_شريف','#رمضان_الجزائر','#صلاة','#أخلاق','#دعاء','#تذكير','#إيمان','#quran','#islam_dz','#تفسير','#ذكر_الله','#مسجد','#هداية'],
}

function HashtagTool() {
  const [topic, setTopic]       = useState('')
  const [platform, setPlatform] = useState('instagram')
  const [category, setCategory] = useState('عام')
  const [lang, setLang]         = useState('ar')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [copied, setCopied]     = useState(false)
  const [copiedOne, setCopiedOne] = useState<string | null>(null)

  const plat = HASHTAG_PLATFORMS.find(p => p.id === platform)!

  const copyAll = () => {
    navigator.clipboard.writeText(hashtags.join(' '))
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const copyOne = (tag: string) => {
    navigator.clipboard.writeText(tag)
    setCopiedOne(tag); setTimeout(() => setCopiedOne(null), 1500)
  }

  const generate = async () => {
    setLoading(true); setError(''); setHashtags([])
    const langInstr = lang === 'ar' ? 'بالعربية والإنجليزية' : lang === 'fr' ? 'بالفرنسية والإنجليزية' : 'بالعربية والفرنسية والإنجليزية'
    const prompt = `[TOOL:HASHTAG_GENERATOR — أخرج الهاشتاغات فقط بدون أي تعليق أو مقدمة]

أنت خبير تسويق رقمي متخصص في المحتوى الجزائري على منصة ${plat.label}.
الموضوع: "${topic || category}"
الفئة: ${category}
المنصة: ${plat.label} (الحد الأقصى ${plat.max} هاشتاغ)
اللغة: ${langInstr}

اكتب قائمة من ${plat.max} هاشتاغ مناسبة للجمهور الجزائري — تبدأ كل واحدة بـ #.
اجعل الهاشتاغات متنوعة: عامة + خاصة بالموضوع + جزائرية محلية.
أخرج فقط الهاشتاغات في سطور منفصلة أو مفصولة بمسافات، بدون أي نص آخر.`

    try {
      const res = await fetch('/api/dz-agent-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], tool: 'hashtag' }),
      })
      const data = await res.json()
      if (data.status === 'no_api_key' || !data.content) {
        // Fallback: client-side generation from pool
        clientGenerate(); return
      }
      // Parse hashtags from AI response
      const raw = data.content as string
      const parsed = raw.match(/#[\p{L}\p{N}_]+/gu) || []
      if (parsed.length < 3) { clientGenerate(); return }
      setHashtags(parsed.slice(0, plat.max))
    } catch {
      clientGenerate()
    } finally {
      setLoading(false)
    }
  }

  const clientGenerate = () => {
    const pool = [...(HT_POOL[category] || HT_POOL['عام'])]
    // Add topic-based tags if topic given
    if (topic.trim()) {
      const slug = topic.trim().replace(/\s+/g, '_')
      pool.unshift(`#${slug}`, `#${slug}_الجزائر`, `#${slug}_DZ`)
    }
    // Shuffle and slice
    const shuffled = pool.sort(() => Math.random() - 0.5)
    setHashtags(shuffled.slice(0, plat.max))
    setLoading(false)
  }

  return (
    <div>
      <div className="dzt-tool-desc">
        <span className="dzt-tool-desc-icon">#️⃣</span>
        <div>
          <div className="dzt-tool-desc-title">مولّد الهاشتاغ الذكي</div>
          <div className="dzt-tool-desc-text">أنشئ هاشتاغات مخصصة للجمهور الجزائري على كل المنصات — انقر على أي هاشتاغ لنسخه فوراً.</div>
        </div>
      </div>

      <div className="dzt-form">
        {/* Platform selector */}
        <div className="dzt-field">
          <label className="dzt-label">المنصة</label>
          <div className="dzt-ht-platforms">
            {HASHTAG_PLATFORMS.map(p => (
              <button key={p.id}
                className={`dzt-ht-plat${platform === p.id ? ' active' : ''}`}
                onClick={() => setPlatform(p.id)}>
                <span>{p.icon}</span> {p.label}
                <span className="dzt-ht-plat-max">max {p.max}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="dzt-row">
          {/* Category */}
          <div className="dzt-field">
            <label className="dzt-label">الفئة</label>
            <select className="dzt-select" value={category} onChange={e => setCategory(e.target.value)}>
              {HASHTAG_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Language */}
          <div className="dzt-field">
            <label className="dzt-label">اللغة</label>
            <select className="dzt-select" value={lang} onChange={e => setLang(e.target.value)}>
              <option value="ar">🇩🇿 عربية</option>
              <option value="fr">🇫🇷 فرنسية</option>
              <option value="mix">🌐 متعدد</option>
            </select>
          </div>
        </div>

        {/* Topic input */}
        <div className="dzt-field">
          <label className="dzt-label">الموضوع / الكلمة المفتاحية <span style={{color:'#555',fontWeight:400}}>(اختياري)</span></label>
          <input
            className="dzt-input"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generate()}
            placeholder="مثال: مطعم وهران، فستان قنادر، سيارة كيا..."
          />
        </div>

        <button className="dzt-btn" onClick={generate} disabled={loading}>
          {loading
            ? <><span className="dzt-spinner" /> جاري التوليد...</>
            : <>#️⃣ توليد الهاشتاغات</>}
        </button>
      </div>

      {error && <div className="dzt-error">{error}</div>}

      {hashtags.length > 0 && (
        <div className="dzt-ht-result">
          <div className="dzt-ht-result-header">
            <span className="dzt-ht-result-count">{hashtags.length} هاشتاغ · {plat.icon} {plat.label}</span>
            <button className="dzt-result-btn" onClick={copyAll}>
              {copied ? <><Check size={12} /> تم النسخ</> : <><Copy size={12} /> نسخ الكل</>}
            </button>
          </div>
          <div className="dzt-ht-chips">
            {hashtags.map((tag, i) => (
              <button key={i} className={`dzt-ht-chip${copiedOne === tag ? ' copied' : ''}`}
                onClick={() => copyOne(tag)}
                title="انقر للنسخ">
                {copiedOne === tag ? <><Check size={11} /> تم</> : tag}
              </button>
            ))}
          </div>
          <div className="dzt-ht-rawbox">
            <div className="dzt-ht-rawbox-label">نص جاهز للنشر</div>
            <div className="dzt-ht-rawtext" dir="ltr">{hashtags.join(' ')}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TTS Tool — AI DZ voice ───────────────────────────────────────────────────

// Helper: guess gender from voice name
function _ttsGender(name: string): 'male' | 'female' | 'unknown' {
  const n = name.toLowerCase()
  if (/naayf|hamad|shakir|hatem|guy|henri|amine|ismael|david|paul|mark|james|jorge|remi|ali|omar|youssef|male|man\b/.test(n)) return 'male'
  if (/hoda|zariyah|amina|nawal|dena|jenny|denise|sonia|female|woman|girl|leila|salma|fatima/.test(n)) return 'female'
  return 'unknown'
}

function TTSTool() {
  const [text, setText]           = useState('')
  // voiceId: 'srv:ar' | 'srv:fr' | 'srv:en' | 'sys:<voice.name>'
  const [voiceId, setVoiceId]     = useState('srv:ar')
  const [rate, setRate]           = useState(1.0)
  const [loading, setLoading]     = useState(false)
  const [audioUrl, setAudioUrl]   = useState<string | null>(null)
  const [error, setError]         = useState('')
  const [playing, setPlaying]     = useState(false)
  const [sysVoices, setSysVoices] = useState<SpeechSynthesisVoice[]>([])
  const audioRef  = useRef<HTMLAudioElement | null>(null)
  const uttRef    = useRef<SpeechSynthesisUtterance | null>(null)

  const charCount = text.length
  const maxChars  = 3000
  const isSysVoice = voiceId.startsWith('sys:')

  // Load browser voices
  useEffect(() => {
    const load = () => {
      const all = window.speechSynthesis?.getVoices() ?? []
      const filtered = all.filter(v =>
        v.lang.startsWith('ar') || v.lang.startsWith('fr') || v.lang.startsWith('en')
      )
      setSysVoices(filtered)
    }
    load()
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = load
    return () => { if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = null }
  }, [])

  // Cleanup Web Speech on unmount
  useEffect(() => () => { window.speechSynthesis?.cancel() }, [])

  const selectedSysVoice = sysVoices.find(v => v.name === voiceId.slice(4))

  // Map voiceId → actual voice ID sent to server
  const _SRV_VOICE_ID_MAP: Record<string, string> = {
    'srv:ar':       'ar-EG-ShakirNeural',
    'srv:ar-fus':   'ar-SA-ZariyahNeural',
    'srv:fr-f':     'fr-FR-DeniseNeural',
    'srv:fr-m':     'fr-FR-HenriNeural',
    'srv:en-f':     'en-US-JennyNeural',
    'srv:en-m':     'en-US-GuyNeural',
    'srv:en-gb-f':  'en-GB-SoniaNeural',
    'srv:en-gb-m':  'en-GB-RyanNeural',
  }
  const srvVoiceId = _SRV_VOICE_ID_MAP[voiceId] ?? 'ar-EG-ShakirNeural'

  // Play via Web Speech API
  const playSys = () => {
    if (!text.trim() || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text.trim())
    if (selectedSysVoice) utt.voice = selectedSysVoice
    utt.rate = rate
    uttRef.current = utt
    utt.onstart  = () => setPlaying(true)
    utt.onend    = () => setPlaying(false)
    utt.onerror  = () => setPlaying(false)
    setPlaying(false)
    window.speechSynthesis.speak(utt)
  }

  const stopSys = () => { window.speechSynthesis?.cancel(); setPlaying(false) }

  // Generate via server (Google TTS)
  const generateSrv = async () => {
    if (!text.trim() || loading) return
    setLoading(true); setError('')
    setPlaying(false)
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null) }
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), voice: srvVoiceId }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `خطأ ${res.status}`)
      }
      const blob = await res.blob()
      setAudioUrl(URL.createObjectURL(blob))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'حدث خطأ أثناء توليد الصوت')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = () => isSysVoice ? playSys() : generateSrv()

  const download = () => {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = `ai-dz-voice-${Date.now()}.mp3`
    a.click()
  }

  const togglePlaySrv = () => {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play(); setPlaying(true) }
  }

  const rateOptions = [
    { value: 0.5,  label: 'بطيء جداً' },
    { value: 0.75, label: 'بطيء' },
    { value: 1.0,  label: 'عادي' },
    { value: 1.25, label: 'سريع' },
    { value: 1.5,  label: 'سريع جداً' },
  ]

  // Grouped system voices
  const sysAr = sysVoices.filter(v => v.lang.startsWith('ar'))
  const sysFr = sysVoices.filter(v => v.lang.startsWith('fr'))
  const sysEn = sysVoices.filter(v => v.lang.startsWith('en'))

  const voiceLabel = (v: SpeechSynthesisVoice) => {
    const g = _ttsGender(v.name)
    const icon = g === 'male' ? '👨' : g === 'female' ? '👩' : '🎙️'
    return `${icon} ${v.name}`
  }

  return (
    <div>
      <div className="dzt-tool-desc">
        <span className="dzt-tool-desc-icon">🔊</span>
        <div>
          <div className="dzt-tool-desc-title">تحويل نص إلى صوت — AI DZ voice</div>
          <div className="dzt-tool-desc-text">
            أصوات عربية ذكر وأنثى حقيقية من متصفحك + تحميل MP3 — يدعم العربية، الفرنسية، الإنجليزية
          </div>
        </div>
      </div>

      <div className="dzt-form">
        {/* Voice selector */}
        <div className="dzt-field">
          <label className="dzt-label">الصوت</label>
          <select className="dzt-select" value={voiceId} onChange={e => { setVoiceId(e.target.value); setAudioUrl(null); stopSys() }}>

            {/* Server voices — Kokoro (EN/FR) + Google TTS (AR) */}
            <optgroup label="🇩🇿 عربية — Google TTS + تحميل MP3">
              <option value="srv:ar">🇩🇿 عربية جزائرية</option>
              <option value="srv:ar-fus">🇸🇦 عربية فصحى</option>
            </optgroup>
            <optgroup label="🐸 Kokoro AI — فرنسية + تحميل MP3">
              <option value="srv:fr-f">🇫🇷 👩 فرنسية أنثى — ff_siwis</option>
              <option value="srv:fr-m">🇫🇷 👨 فرنسية ذكر — fm_gaston</option>
            </optgroup>
            <optgroup label="🐸 Kokoro AI — إنجليزية أمريكية + تحميل MP3">
              <option value="srv:en-f">🇺🇸 👩 أنثى أمريكية — af_heart</option>
              <option value="srv:en-m">🇺🇸 👨 ذكر أمريكي — am_adam</option>
            </optgroup>
            <optgroup label="🐸 Kokoro AI — إنجليزية بريطانية + تحميل MP3">
              <option value="srv:en-gb-f">🇬🇧 👩 أنثى بريطانية — bf_emma</option>
              <option value="srv:en-gb-m">🇬🇧 👨 ذكر بريطاني — bm_george</option>
            </optgroup>

            {/* Browser voices — real male/female */}
            {sysAr.length > 0 && (
              <optgroup label="🎙️ متصفحك — أصوات ذكر وأنثى حقيقية (عربية)">
                {sysAr.map(v => (
                  <option key={v.name} value={`sys:${v.name}`}>{voiceLabel(v)}</option>
                ))}
              </optgroup>
            )}
            {sysFr.length > 0 && (
              <optgroup label="🎙️ متصفحك — فرنسية">
                {sysFr.map(v => (
                  <option key={v.name} value={`sys:${v.name}`}>{voiceLabel(v)}</option>
                ))}
              </optgroup>
            )}
            {sysEn.length > 0 && (
              <optgroup label="🎙️ متصفحك — إنجليزية">
                {sysEn.map(v => (
                  <option key={v.name} value={`sys:${v.name}`}>{voiceLabel(v)}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        {/* Mode hint */}
        <div style={{ fontSize: 12, color: '#8aad90', marginTop: -6, direction: 'rtl' }}>
          {isSysVoice
            ? `🎙️ صوت المتصفح — ${_ttsGender(selectedSysVoice?.name ?? '') === 'male' ? '👨 ذكر حقيقي' : _ttsGender(selectedSysVoice?.name ?? '') === 'female' ? '👩 أنثى حقيقية' : 'صوت المتصفح'}`
            : voiceId.startsWith('srv:ar')
              ? '🇩🇿 Google TTS — عربية · يدعم التحميل MP3'
              : '🐸 Kokoro AI (hexgrad/Kokoro-82M) — جودة عالية · يدعم التحميل MP3'
          }
        </div>

        {/* Rate */}
        <div className="dzt-field">
          <label className="dzt-label">السرعة</label>
          <select className="dzt-select" value={rate} onChange={e => setRate(Number(e.target.value))}>
            {rateOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {/* Text input */}
        <div className="dzt-field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label className="dzt-label" style={{ margin: 0 }}>النص المراد تحويله</label>
            <span style={{ fontSize: 12, color: charCount > maxChars ? '#ff4444' : '#666' }}>
              {charCount} / {maxChars}
            </span>
          </div>
          <textarea
            className="dzt-textarea"
            value={text}
            onChange={e => setText(e.target.value.slice(0, maxChars))}
            placeholder="اكتب أو الصق النص هنا... (يدعم العربية، الفرنسية، الإنجليزية)"
            style={{ minHeight: 140, direction: 'rtl' }}
          />
        </div>

        <button
          className="dzt-btn"
          onClick={handleGenerate}
          disabled={!text.trim() || loading || charCount > maxChars}
        >
          {loading
            ? <><span className="dzt-spinner" /> جاري توليد الصوت...</>
            : isSysVoice
              ? <>{playing ? '⏸ إيقاف' : '🔊 تشغيل الآن'}</>
              : <>🔊 تحويل إلى صوت</>
          }
        </button>
      </div>

      {error && (
        <div className="dzt-error" style={{ marginTop: 12 }}>⚠️ {error}</div>
      )}

      {/* Web Speech playing indicator */}
      {isSysVoice && playing && (
        <div style={{
          marginTop: 16,
          background: 'linear-gradient(135deg, #0d1f0f 0%, #1a3320 100%)',
          border: '1px solid #2a5a35',
          borderRadius: 14,
          padding: '16px 20px',
          direction: 'rtl',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 28, animation: 'pulse 1s infinite' }}>🔊</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#c8ff00', fontWeight: 700, fontSize: 14 }}>
              {_ttsGender(selectedSysVoice?.name ?? '') === 'male' ? '👨 صوت ذكر — يتحدث الآن' : '👩 صوت أنثى — يتحدث الآن'}
            </div>
            <div style={{ color: '#8aad90', fontSize: 12 }}>{selectedSysVoice?.name}</div>
          </div>
          <button className="dzt-result-btn" onClick={stopSys} style={{ padding: '8px 16px' }}>⏹ إيقاف</button>
        </div>
      )}

      {/* Server audio player */}
      {audioUrl && (
        <div style={{
          marginTop: 20,
          background: 'linear-gradient(135deg, #0d1f0f 0%, #1a3320 100%)',
          border: '1px solid #2a5a35',
          borderRadius: 14,
          padding: '20px 24px',
          direction: 'rtl',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 22 }}>🔊</span>
            <div>
              <div style={{ color: '#c8ff00', fontWeight: 700, fontSize: 15 }}>الصوت جاهز — AI DZ voice</div>
              <div style={{ color: '#8aad90', fontSize: 12 }}>
                {rateOptions.find(r => r.value === rate)?.label} · جاهز للتشغيل والتحميل
              </div>
            </div>
          </div>

          <audio
            key={audioUrl}
            ref={audioRef}
            src={audioUrl}
            controls
            autoPlay
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            style={{ width: '100%', borderRadius: 8, marginBottom: 14, accentColor: '#c8ff00' }}
          />

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="dzt-result-btn"
              onClick={togglePlaySrv}
              style={{ flex: 1, minWidth: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {playing ? '⏸ إيقاف' : '▶️ تشغيل'}
            </button>
            <button
              className="dzt-btn"
              onClick={download}
              style={{ flex: 1, minWidth: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 18px', fontSize: 14 }}
            >
              <Download size={15} /> تحميل MP3
            </button>
            <button
              className="dzt-result-btn"
              onClick={generateSrv}
              disabled={loading}
              style={{ flex: 1, minWidth: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              🔄 إعادة التوليد
            </button>
          </div>
        </div>
      )}

      {/* Info box */}
      <div style={{
        marginTop: 20,
        background: 'rgba(200,255,0,0.04)',
        border: '1px solid rgba(200,255,0,0.12)',
        borderRadius: 10,
        padding: '12px 16px',
        fontSize: 12,
        color: '#8aad90',
        direction: 'rtl',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 16 }}>💡</span>
        <div>
          <strong style={{ color: '#c8ff00' }}>AI DZ voice</strong> — يستخدم أصواتاً نورونية طبيعية تدعم اللهجة الجزائرية.
          الحد الأقصى 3000 حرف لكل تحويل. الصوت يُنزّل بصيغة MP3 عالية الجودة.
        </div>
      </div>
    </div>
  )
}

// ─── Screenshot Tool ──────────────────────────────────────────────────────────
function ScreenshotTool() {
  const [url, setUrl] = useState('')
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')
  const [darkMode, setDarkMode] = useState(false)
  const [fullPage, setFullPage] = useState(true)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    screenshot: string
    title: string
    url: string
    width: number | null
    height: number | null
  } | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const [history, setHistory] = useState<{ url: string; title: string; screenshot: string; ts: number }[]>([])
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const startProgress = () => {
    setProgress(5)
    let p = 5
    progressRef.current = setInterval(() => {
      p = Math.min(p + (Math.random() * 4 + 1), 88)
      setProgress(p)
    }, 600)
  }

  const stopProgress = (final = 100) => {
    if (progressRef.current) clearInterval(progressRef.current)
    setProgress(final)
    setTimeout(() => setProgress(0), 800)
  }

  const capture = async () => {
    const q = url.trim()
    if (!q) { setError('أدخل رابط الموقع أولاً'); return }
    setError('')
    setResult(null)
    setLoading(true)
    startProgress()

    try {
      const res = await fetch('/api/tools/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: q, viewport, darkMode, fullPage }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'فشل التصوير')
      setResult(data)
      setHistory(prev => [
        { url: data.url, title: data.title || data.url, screenshot: data.screenshot, ts: Date.now() },
        ...prev.slice(0, 4),
      ])
      stopProgress(100)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'فشل التصوير')
      stopProgress(0)
    } finally {
      setLoading(false)
    }
  }

  const downloadPng = () => {
    if (!result) return
    const a = document.createElement('a')
    a.href = result.screenshot
    a.download = `screenshot-${new URL(result.url).hostname}-${Date.now()}.png`
    a.click()
  }

  const downloadPdf = () => {
    if (!result) return
    const host = (() => { try { return new URL(result.url).hostname } catch { return 'screenshot' } })()
    const win = window.open('', '_blank')
    if (!win) return
    const now = new Date().toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' })
    win.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${result.title || host}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#fff;font-family:Cairo,Tajawal,sans-serif;direction:rtl}
  .hd{background:linear-gradient(135deg,#0a1a05 0%,#1a3d10 100%);color:#fff;padding:16px 28px;display:flex;align-items:center;justify-content:space-between}
  .hd-brand{font-size:12px;opacity:.7}
  .hd-title{font-size:16px;font-weight:800;color:#c8ff00;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hd-date{font-size:11px;opacity:.6}
  .body{padding:16px 28px}
  .meta{font-size:12px;color:#555;margin-bottom:12px;direction:ltr}
  img{width:100%;height:auto;border-radius:8px;border:1px solid #e0e0e0;box-shadow:0 2px 12px rgba(0,0,0,.1)}
  .ft{border-top:1px solid #e8e8e8;padding:10px 28px;font-size:10px;color:#999;display:flex;justify-content:space-between;margin-top:16px}
  @media print{
    @page{margin:0;size:A4 portrait}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .hd{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
</style>
</head>
<body>
  <div class="hd">
    <div class="hd-brand">🇩🇿 DZ-GPT · dz-gpt.vercel.app</div>
    <div class="hd-title">${result.title || host}</div>
    <div class="hd-date">${now}</div>
  </div>
  <div class="body">
    <div class="meta">${result.url}</div>
    <img src="${result.screenshot}" alt="screenshot"/>
  </div>
  <div class="ft">
    <span>🇩🇿 DZ-GPT — أداة تصوير المواقع</span>
    <span>${now}</span>
  </div>
</body>
</html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 700)
  }

  const copyUrl = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.url)
  }

  const EXAMPLE_URLS = ['https://www.google.com', 'https://github.com', 'https://wikipedia.org', 'https://bbc.com']

  return (
    <div style={{ padding: '12px 0', direction: 'rtl', maxWidth: 860, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg,#0d1f08 0%,#1a3d10 60%,#0d2a08 100%)', borderRadius: 16, padding: '20px 24px', marginBottom: 20, border: '1px solid #2a4a20', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(ellipse at 80% 50%, rgba(200,255,0,0.06) 0%,transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(200,255,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: '1px solid rgba(200,255,0,0.25)', flexShrink: 0 }}>📸</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#c8ff00', lineHeight: 1.2 }}>أداة تصوير المواقع</div>
            <div style={{ fontSize: 12, color: '#7a9a60', marginTop: 3 }}>التقط صورة كاملة لأي موقع — تنزيل PNG أو PDF — Desktop / Mobile</div>
          </div>
        </div>
      </div>

      {/* ── URL Input ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#0d1f08', border: '1.5px solid #2a4020', borderRadius: 14, padding: '18px 20px', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#7a9a60', marginBottom: 8, fontWeight: 600 }}>رابط الموقع</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && capture()}
            placeholder="https://example.com"
            disabled={loading}
            style={{ flex: 1, background: '#060f04', border: '1px solid #2a4020', borderRadius: 10, padding: '11px 14px', color: '#d0e8c0', fontSize: 14, outline: 'none', direction: 'ltr', fontFamily: 'monospace' }}
          />
          <button
            onClick={capture}
            disabled={loading || !url.trim()}
            style={{ background: loading ? '#1a2a10' : '#c8ff00', color: '#0a0e04', border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 13, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', minWidth: 110, justifyContent: 'center', transition: 'all 0.2s' }}
          >
            {loading ? <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> جاري...</> : '📸 التقاط'}
          </button>
        </div>

        {/* Example URLs */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {EXAMPLE_URLS.map(ex => (
            <button key={ex} onClick={() => setUrl(ex)} style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid #2a4020', borderRadius: 6, padding: '3px 9px', fontSize: 11, color: '#7a9a60', cursor: 'pointer', direction: 'ltr', fontFamily: 'monospace', transition: 'all 0.15s' }}>
              {ex.replace('https://', '')}
            </button>
          ))}
        </div>
      </div>

      {/* ── Options ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* Viewport */}
        <div style={{ background: '#0d1f08', border: '1px solid #2a4020', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#7a9a60', marginLeft: 4 }}>الجهاز</span>
          {(['desktop', 'mobile'] as const).map(v => (
            <button key={v} onClick={() => setViewport(v)} style={{ background: viewport === v ? '#c8ff00' : 'transparent', color: viewport === v ? '#0a0e04' : '#7a9a60', border: `1px solid ${viewport === v ? '#c8ff00' : '#2a4020'}`, borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
              {v === 'desktop' ? '🖥️ Desktop' : '📱 Mobile'}
            </button>
          ))}
        </div>
        {/* Dark mode */}
        <button onClick={() => setDarkMode(d => !d)} style={{ background: darkMode ? '#1a2a10' : '#0d1f08', border: `1px solid ${darkMode ? '#c8ff00' : '#2a4020'}`, borderRadius: 10, padding: '10px 16px', fontSize: 12, color: darkMode ? '#c8ff00' : '#7a9a60', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}>
          {darkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
        </button>
        {/* Full page */}
        <button onClick={() => setFullPage(f => !f)} style={{ background: fullPage ? '#1a2a10' : '#0d1f08', border: `1px solid ${fullPage ? '#c8ff00' : '#2a4020'}`, borderRadius: 10, padding: '10px 16px', fontSize: 12, color: fullPage ? '#c8ff00' : '#7a9a60', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s' }}>
          {fullPage ? '📜 صفحة كاملة' : '🖼️ Viewport فقط'}
        </button>
      </div>

      {/* ── Progress Bar ───────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ background: '#0d1f08', border: '1px solid #2a4020', borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: '#c8ff00', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ animation: 'spin 1.2s linear infinite', display: 'inline-block', fontSize: 18 }}>⟳</span>
              جاري التصوير...
            </span>
            <span style={{ fontSize: 12, color: '#7a9a60' }}>{Math.round(progress)}%</span>
          </div>
          <div style={{ background: '#1a2a10', borderRadius: 8, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #4a9a20, #c8ff00)', borderRadius: 8, transition: 'width 0.5s ease', boxShadow: '0 0 8px rgba(200,255,0,0.4)' }} />
          </div>
          <div style={{ fontSize: 11, color: '#4a6a30', marginTop: 8, textAlign: 'center' }}>
            {progress < 30 ? 'فتح الصفحة...' : progress < 60 ? 'تحميل المحتوى...' : progress < 85 ? 'التقاط الصورة...' : 'معالجة الصورة...'}
          </div>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: 12, padding: '14px 18px', marginBottom: 14, color: '#ff8888', fontSize: 13, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <strong>فشل التصوير:</strong> {error}
            <div style={{ fontSize: 11, color: '#aa5555', marginTop: 4 }}>تأكد من صحة الرابط. بعض المواقع تحجب الروبوتات.</div>
          </div>
        </div>
      )}

      {/* ── Result Preview ─────────────────────────────────────────────────── */}
      {result && (
        <div style={{ background: '#0d1f08', border: '1.5px solid #2a5020', borderRadius: 16, overflow: 'hidden', marginBottom: 14 }}>
          {/* Meta bar */}
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #1a3010', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#c8ff00' }}>{result.title || 'بدون عنوان'}</div>
              <div style={{ fontSize: 11, color: '#4a6a30', direction: 'ltr', marginTop: 2 }}>{result.url}</div>
              {(result.width || result.height) && (
                <div style={{ fontSize: 10, color: '#3a5a28', marginTop: 2 }}>
                  {result.width && result.height ? `${result.width}×${result.height}px` : `عرض ${result.width}px`} · {viewport === 'mobile' ? '📱 Mobile' : '🖥️ Desktop'} · {darkMode ? '🌙 Dark' : '☀️ Light'}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setZoomed(z => !z)} style={{ background: '#1a3010', border: '1px solid #2a5020', borderRadius: 8, padding: '6px 12px', color: '#7aaa50', fontSize: 12, cursor: 'pointer' }}>{zoomed ? '🔍 تصغير' : '🔍 تكبير'}</button>
              <button onClick={copyUrl} style={{ background: '#1a3010', border: '1px solid #2a5020', borderRadius: 8, padding: '6px 12px', color: '#7aaa50', fontSize: 12, cursor: 'pointer' }}>🔗 نسخ الرابط</button>
              <button onClick={downloadPng} style={{ background: '#1a3010', border: '1px solid #2a5020', borderRadius: 8, padding: '6px 12px', color: '#7aaa50', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>⬇️ PNG</button>
              <button onClick={downloadPdf} style={{ background: '#c8ff00', border: 'none', borderRadius: 8, padding: '6px 14px', color: '#0a0e04', fontSize: 12, cursor: 'pointer', fontWeight: 800 }}>📄 PDF</button>
            </div>
          </div>

          {/* Screenshot image */}
          <div style={{ overflow: 'auto', maxHeight: zoomed ? 'none' : 420, cursor: zoomed ? 'zoom-out' : 'zoom-in', background: '#060f04' }} onClick={() => setZoomed(z => !z)}>
            <img
              ref={imgRef}
              src={result.screenshot}
              alt="screenshot"
              style={{ width: zoomed ? 'auto' : '100%', maxWidth: '100%', display: 'block', imageRendering: 'crisp-edges' }}
            />
          </div>

          {/* Download actions */}
          <div style={{ padding: '14px 18px', borderTop: '1px solid #1a3010', display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={downloadPng} style={{ flex: 1, minWidth: 140, background: '#1a3010', border: '1.5px solid #2a5020', borderRadius: 10, padding: '10px 16px', color: '#c8ff00', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              🖼️ تنزيل كـ PNG
            </button>
            <button onClick={downloadPdf} style={{ flex: 1, minWidth: 140, background: '#c8ff00', border: 'none', borderRadius: 10, padding: '10px 16px', color: '#0a0e04', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              📄 تنزيل كـ PDF
            </button>
          </div>
        </div>
      )}

      {/* ── History ────────────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div style={{ background: '#0a1a07', border: '1px solid #1e3515', borderRadius: 14, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#5a8a40', marginBottom: 10 }}>📂 السجل الأخير</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map((h, i) => (
              <button key={i} onClick={() => setUrl(h.url)} style={{ background: '#0d1f08', border: '1px solid #2a4020', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'right', direction: 'rtl' }}>
                <img src={h.screenshot} alt="" style={{ width: 48, height: 30, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, color: '#9acc70', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title || h.url}</div>
                  <div style={{ fontSize: 10, color: '#3a5a28', direction: 'ltr', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.url}</div>
                </div>
                <span style={{ fontSize: 10, color: '#3a5a28', flexShrink: 0 }}>{new Date(h.ts).toLocaleTimeString('ar')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Info box ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(200,255,0,0.04)', border: '1px solid rgba(200,255,0,0.12)', borderRadius: 10, fontSize: 12, color: '#5a8a40', direction: 'rtl', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 16 }}>💡</span>
        <div>
          <strong style={{ color: '#c8ff00' }}>تصوير المواقع الذكي</strong> — يستخدم محرك Chromium متقدم مع انتظار تحميل كامل للشبكة.
          يدعم الصفحات الطويلة جداً. بعض المواقع قد تحجب التصوير الآلي. مدة التصوير: 10-30 ثانية.
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ─── File Upload Tool (GoFile.io) ─────────────────────────────────────────────
interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  downloadPage: string
  uploadedAt: Date
}

function FileUploadTool() {
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [error, setError]         = useState('')
  const [history, setHistory]     = useState<UploadedFile[]>([])
  const [copied, setCopied]       = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    setProgress(0)
    setError('')
    try {
      // 1. Get best GoFile server
      const serverRes = await fetch('https://api.gofile.io/servers')
      const serverData = await serverRes.json()
      if (serverData.status !== 'ok') throw new Error('فشل في الحصول على سيرفر GoFile')
      const server = serverData.data.servers[0]?.name
      if (!server) throw new Error('لا يوجد سيرفر متاح')

      // 2. Upload with progress
      const formData = new FormData()
      formData.append('file', file)

      const result = await new Promise<UploadedFile>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 90))
        }
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText)
            if (data.status !== 'ok') { reject(new Error(data.message || 'فشل الرفع')); return }
            setProgress(100)
            resolve({
              id: data.data.fileId || data.data.id,
              name: file.name,
              size: file.size,
              type: file.type || 'application/octet-stream',
              downloadPage: data.data.downloadPage,
              uploadedAt: new Date(),
            })
          } catch { reject(new Error('رد غير صالح من السيرفر')) }
        }
        xhr.onerror = () => reject(new Error('خطأ في الشبكة — تأكد من اتصالك'))
        xhr.open('POST', `https://${server}.gofile.io/contents/uploadfile`)
        xhr.send(formData)
      })

      setHistory(prev => [result, ...prev].slice(0, 10))
    } catch (err: any) {
      setError(err.message || 'خطأ غير معروف')
    } finally {
      setUploading(false)
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    uploadFile(files[0])
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const copyLink = async (link: string) => {
    try { await navigator.clipboard.writeText(link) } catch { const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta) }
    setCopied(link); setTimeout(() => setCopied(null), 2500)
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return '🖼️'
    if (type.startsWith('video/')) return '🎬'
    if (type.startsWith('audio/')) return '🎵'
    if (type.includes('pdf')) return '📄'
    if (type.includes('zip') || type.includes('rar') || type.includes('7z')) return '🗜️'
    if (type.includes('word') || type.includes('document')) return '📝'
    if (type.includes('sheet') || type.includes('excel')) return '📊'
    return '📁'
  }

  const S = {
    wrap:      { fontFamily: "'Cairo','Tajawal',sans-serif", direction: 'rtl' as const, color: '#c8d8b8' },
    title:     { fontSize: 22, fontWeight: 800, color: '#c8ff00', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 },
    sub:       { fontSize: 13, color: '#6a9a50', marginBottom: 20 },
    dropzone:  (active: boolean) => ({
      border: `2px dashed ${active ? '#c8ff00' : '#2a5020'}`,
      borderRadius: 18, padding: '40px 24px', textAlign: 'center' as const,
      background: active ? 'rgba(200,255,0,0.06)' : '#0d1f08',
      cursor: 'pointer', transition: 'all .2s', marginBottom: 16,
      transform: active ? 'scale(1.01)' : 'scale(1)',
    }),
    dropIcon:  { fontSize: 52, marginBottom: 10 },
    dropText:  { fontSize: 15, fontWeight: 700, color: '#a0d080', marginBottom: 4 },
    dropSub:   { fontSize: 12, color: '#4a7a30' },
    btn:       { background: '#c8ff00', border: 'none', borderRadius: 10, padding: '10px 24px', color: '#0a0e04', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, fontFamily: "'Cairo',sans-serif" },
    progress:  { background: '#1a2a10', borderRadius: 8, height: 10, overflow: 'hidden', marginBottom: 8 },
    bar:       (p: number) => ({ width: `${p}%`, height: '100%', background: 'linear-gradient(90deg,#4a9a20,#c8ff00)', borderRadius: 8, transition: 'width .4s ease', boxShadow: '0 0 8px rgba(200,255,0,.4)' }),
    errBox:    { background: 'rgba(255,68,68,.08)', border: '1px solid rgba(255,68,68,.3)', borderRadius: 12, padding: '12px 16px', color: '#ff8888', fontSize: 13, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-start' },
    card:      { background: '#0d1f08', border: '1.5px solid #2a5020', borderRadius: 16, padding: '16px 18px', marginBottom: 10 },
    cardHead:  { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
    cardIcon:  { fontSize: 30, flexShrink: 0 },
    cardName:  { fontSize: 14, fontWeight: 700, color: '#a0d080', wordBreak: 'break-all' as const },
    cardMeta:  { fontSize: 11, color: '#4a7a30', marginTop: 2 },
    linkBox:   { background: '#060f04', border: '1px solid #1e3515', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
    linkText:  { flex: 1, fontSize: 12, color: '#7acc50', direction: 'ltr' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
    copyBtn:   (isCopied: boolean) => ({ background: isCopied ? '#4a9a20' : '#1a3010', border: '1px solid #2a5020', borderRadius: 8, padding: '6px 12px', color: isCopied ? '#c8ff00' : '#7aaa50', fontSize: 12, cursor: 'pointer', flexShrink: 0, fontWeight: 700, transition: 'all .2s', whiteSpace: 'nowrap' as const }),
    openBtn:   { background: 'none', border: '1px solid #2a5020', borderRadius: 8, padding: '6px 12px', color: '#5aaa30', fontSize: 12, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 },
    histTitle: { fontSize: 12, fontWeight: 700, color: '#5a8a40', marginBottom: 10 },
    infoBox:   { marginTop: 14, padding: '12px 16px', background: 'rgba(200,255,0,.04)', border: '1px solid rgba(200,255,0,.12)', borderRadius: 10, fontSize: 12, color: '#5a8a40', display: 'flex', gap: 10, alignItems: 'flex-start' },
  }

  return (
    <div style={S.wrap}>
      <div style={S.title}>☁️ رفع ومشاركة الملفات</div>
      <div style={S.sub}>ارفع أي ملف واحصل على رابط مشاركة آمن — يدعم الصور · الفيديوهات · PDF · أي نوع · حتى 25 GB</div>

      {/* ── Drop Zone ──────────────────────────────────────────────────── */}
      <div
        style={S.dropzone(dragging || uploading)}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={e => handleFiles(e.target.files)} />
        <div style={S.dropIcon}>{uploading ? '⬆️' : dragging ? '📂' : '☁️'}</div>
        {uploading ? (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#c8ff00', marginBottom: 14 }}>جاري الرفع... {progress}%</div>
            <div style={S.progress}><div style={S.bar(progress)} /></div>
            <div style={{ fontSize: 11, color: '#4a7a30', marginTop: 6 }}>
              {progress < 30 ? 'جاري الاتصال بـ GoFile.io...' : progress < 90 ? 'جاري نقل الملف...' : 'جاري المعالجة...'}
            </div>
          </div>
        ) : (
          <>
            <div style={S.dropText}>{dragging ? 'أفلت الملف هنا' : 'اسحب الملف هنا أو اضغط للاختيار'}</div>
            <div style={S.dropSub}>يدعم جميع أنواع الملفات · صور · فيديو · PDF · ZIP · وغيرها</div>
            <button style={S.btn} onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>
              <Upload size={15} /> اختر ملف
            </button>
          </>
        )}
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div style={S.errBox}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div><strong>فشل الرفع:</strong> {error}<div style={{ fontSize: 11, color: '#aa5555', marginTop: 4 }}>تحقق من اتصالك وحاول مرة أخرى.</div></div>
        </div>
      )}

      {/* ── Uploaded Files History ────────────────────────────────────────── */}
      {history.length > 0 && (
        <div>
          <div style={S.histTitle}>📂 الملفات المرفوعة ({history.length})</div>
          {history.map((f) => (
            <div key={f.id} style={S.card}>
              <div style={S.cardHead}>
                <span style={S.cardIcon}>{getFileIcon(f.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={S.cardName}>{f.name}</div>
                  <div style={S.cardMeta}>{formatSize(f.size)} · {f.uploadedAt.toLocaleTimeString('ar-DZ')}</div>
                </div>
                <span style={{ background: '#1a3a10', color: '#6acc40', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>✅ مرفوع</span>
              </div>

              {/* Share link */}
              <div style={S.linkBox}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>🔗</span>
                <span style={S.linkText}>{f.downloadPage}</span>
                <button style={S.copyBtn(copied === f.downloadPage)} onClick={() => copyLink(f.downloadPage)}>
                  {copied === f.downloadPage ? '✓ تم النسخ' : 'نسخ الرابط'}
                </button>
                <a href={f.downloadPage} target="_blank" rel="noopener noreferrer" style={S.openBtn}>
                  فتح ↗
                </a>
              </div>

              {/* Action row */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                <button
                  style={{ flex: 1, minWidth: 130, background: '#0a1a07', border: '1px solid #2a4020', borderRadius: 10, padding: '9px 14px', color: '#c8ff00', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                  onClick={() => copyLink(f.downloadPage)}
                >
                  {copied === f.downloadPage ? <Check size={13} /> : <Copy size={13} />}
                  {copied === f.downloadPage ? 'تم النسخ!' : 'نسخ رابط التحميل'}
                </button>
                <a
                  href={f.downloadPage} target="_blank" rel="noopener noreferrer"
                  style={{ flex: 1, minWidth: 130, background: '#c8ff00', border: 'none', borderRadius: 10, padding: '9px 14px', color: '#0a0e04', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, textDecoration: 'none' }}
                >
                  <Download size={13} /> فتح صفحة التحميل
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Info box ─────────────────────────────────────────────────────── */}
      <div style={S.infoBox}>
        <span style={{ fontSize: 16 }}>💡</span>
        <div>
          <strong style={{ color: '#c8ff00' }}>GoFile.io</strong> — خدمة رفع ملفات مجانية بدون تسجيل.
          الروابط تبقى متاحة لمدة <strong style={{ color: '#c8ff00' }}>10 أيام</strong> بعد آخر تحميل.
          لا يُشارَك الرابط تلقائياً — أنت من يختار من يراه.
          <div style={{ marginTop: 6, color: '#3a6a20' }}>⚠️ لا ترفع ملفات شخصية حساسة على خوادم خارجية.</div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ─── File Converter Tool (FFmpeg.wasm + Document Conversion) ──────────────────
const CONV_IMAGE_EXTS = ['jpg','png','webp','bmp','gif']
const CONV_AUDIO_EXTS = ['mp3','wav','ogg','aac','flac','m4a','opus']
const CONV_VIDEO_EXTS = ['mp4','webm','avi','mov','mkv','gif']
const CONV_DOC_EXTS   = ['txt','pdf','docx','doc','rtf']
const CONV_FMT_LABELS: Record<string,string> = {
  mp4:'MP4',webm:'WebM',avi:'AVI',mov:'MOV',mkv:'MKV',gif:'GIF',
  mp3:'MP3',wav:'WAV',ogg:'OGG',aac:'AAC',flac:'FLAC',m4a:'M4A',opus:'OPUS',
  jpg:'JPG',png:'PNG',webp:'WebP',bmp:'BMP',
  txt:'TXT',pdf:'PDF',docx:'DOCX',doc:'DOC',rtf:'RTF',
}
const CONV_DOC_OUTPUTS: Record<string,string[]> = {
  txt:  ['pdf','docx','rtf'],
  pdf:  ['txt'],
  docx: ['txt','pdf'],
  doc:  ['txt','pdf'],
  rtf:  ['txt','pdf'],
}
function convGetExt(name: string) { return name.split('.').pop()?.toLowerCase() || '' }
function convGetType(ext: string): 'image'|'audio'|'video'|'document'|'other' {
  if (CONV_IMAGE_EXTS.includes(ext)) return 'image'
  if (CONV_AUDIO_EXTS.includes(ext)) return 'audio'
  if (CONV_VIDEO_EXTS.includes(ext)) return 'video'
  if (CONV_DOC_EXTS.includes(ext))  return 'document'
  return 'other'
}
function convGetOutputFmts(inputExt: string): string[] {
  const t = convGetType(inputExt)
  if (t === 'image')    return CONV_IMAGE_EXTS.filter(e => e !== inputExt)
  if (t === 'audio')    return CONV_AUDIO_EXTS.filter(e => e !== inputExt)
  if (t === 'video')    return CONV_VIDEO_EXTS.filter(e => e !== inputExt)
  if (t === 'document') return (CONV_DOC_OUTPUTS[inputExt] || [])
  return []
}

// ── تحميل مكتبات الوثائق من CDN ──────────────────────────────────────────────
async function loadMammoth(): Promise<any> {
  if ((window as any).mammoth) return (window as any).mammoth
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js'
    s.onload = () => resolve((window as any).mammoth)
    s.onerror = () => reject(new Error('فشل تحميل مكتبة mammoth'))
    document.head.appendChild(s)
  })
}
async function loadPdfjsLib(): Promise<any> {
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'
    s.onload = () => {
      const lib = (window as any).pdfjsLib
      lib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
      resolve(lib)
    }
    s.onerror = () => reject(new Error('فشل تحميل مكتبة pdfjs'))
    document.head.appendChild(s)
  })
}

// ── تحويل TXT → DOCX (هيكل XML مضغوط) ──────────────────────────────────────
async function txtToDocx(text: string): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const escaped = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const paragraphs = escaped.split(/\r?\n/).map(line =>
    `<w:p><w:r><w:t xml:space="preserve">${line || ' '}</w:t></w:r></w:p>`
  ).join('')
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${paragraphs}<w:sectPr/></w:body>
</w:document>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  zip.file('_rels/.rels', rels)
  zip.file('word/document.xml', docXml)
  zip.file('word/_rels/document.xml.rels', wordRels)
  zip.file('[Content_Types].xml', contentTypes)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }) as Promise<Blob>
}

// ── تحويل نص → PDF عبر طباعة المتصفح ─────────────────────────────────────────
function textToPdfViaprint(text: string, filename: string): void {
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
    <meta charset="UTF-8"><title>${filename}</title>
    <style>body{font-family:'Cairo','Tajawal',Arial,sans-serif;font-size:13pt;line-height:1.8;padding:40px;white-space:pre-wrap;direction:rtl}</style>
    </head><body>${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</body></html>`
  const w = window.open('','_blank')
  if (!w) { alert('يرجى السماح بالنوافذ المنبثقة لتصدير PDF'); return }
  w.document.write(html)
  w.document.close()
  w.onload = () => { w.focus(); w.print() }
}

// ── تحويل نص → RTF ────────────────────────────────────────────────────────────
function txtToRtf(text: string): Blob {
  const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\n\\f0\\fs24\\sl360\\slmult1 ${
    text.split(/\r?\n/).map(l =>
      l.replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}') + '\\par\n'
    ).join('')
  }}`
  return new Blob([rtf], { type: 'application/rtf' })
}

function FileConverterTool() {
  const [file, setFile]             = useState<File | null>(null)
  const [outputExt, setOutputExt]   = useState('')
  const [converting, setConverting] = useState(false)
  const [progress, setProgress]     = useState(0)
  const [downloadUrl, setDownloadUrl] = useState('')
  const [outputName, setOutputName] = useState('')
  const [error, setError]           = useState('')
  const [dragging, setDragging]     = useState(false)
  const [ffStatus, setFfStatus]     = useState<'idle'|'loading'|'ready'|'error'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ffRef        = useRef<any>(null)

  const inputExt    = file ? convGetExt(file.name) : ''
  const inputType   = convGetType(inputExt)
  const outputFmts  = convGetOutputFmts(inputExt)

  const ensureFFmpeg = async () => {
    if (ffRef.current) return ffRef.current
    setFfStatus('loading')
    if (!(window as any).createFFmpeg) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js'
        s.onload  = () => resolve()
        s.onerror = () => reject(new Error('فشل تحميل FFmpeg من الشبكة'))
        document.head.appendChild(s)
      })
    }
    const ff = (window as any).createFFmpeg({
      log: false,
      corePath: 'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js',
    })
    await ff.load()
    ffRef.current = ff
    setFfStatus('ready')
    return ff
  }

  const convertImageViaCanvas = (src: File, ext: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(src)
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth; c.height = img.naturalHeight
        const ctx = c.getContext('2d')!
        if (ext === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height) }
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        const mimes: Record<string,string> = { jpg:'image/jpeg', png:'image/png', webp:'image/webp', bmp:'image/bmp', gif:'image/gif' }
        c.toBlob(blob => {
          if (!blob) { reject(new Error('فشل التحويل')); return }
          resolve(URL.createObjectURL(blob))
        }, mimes[ext] || 'image/png', 0.92)
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذّر تحميل الصورة')) }
      img.src = url
    })

  const handleConvert = async () => {
    if (!file || !outputExt) return
    setConverting(true); setProgress(0); setError(''); setDownloadUrl('')
    const base = file.name.includes('.') ? file.name.slice(0, file.name.lastIndexOf('.')) : file.name
    const outName = `${base}.${outputExt}`
    setOutputName(outName)
    try {
      if (inputType === 'image') {
        setProgress(40)
        const url = await convertImageViaCanvas(file, outputExt)
        setProgress(100); setDownloadUrl(url)

      } else if (inputType === 'document') {
        setProgress(15)
        // ── استخراج النص الخام من الملف المصدر ────────────────────────────
        let rawText = ''

        if (inputExt === 'txt' || inputExt === 'rtf') {
          rawText = await new Promise<string>((res, rej) => {
            const fr = new FileReader()
            fr.onload = () => {
              let t = fr.result as string
              if (inputExt === 'rtf') {
                // إزالة رموز RTF الأساسية
                t = t.replace(/\{\\[^{}]+\}|\\[a-z]+\d*\s?|[{}]/g, ' ').replace(/\s+/g,' ').trim()
              }
              res(t)
            }
            fr.onerror = rej
            fr.readAsText(file, 'utf-8')
          })
        } else if (inputExt === 'pdf') {
          setProgress(25)
          const pdfjs = await loadPdfjsLib()
          const buf   = await file.arrayBuffer()
          const pdf   = await pdfjs.getDocument({ data: buf }).promise
          const pages: string[] = []
          for (let i = 1; i <= pdf.numPages; i++) {
            const page    = await pdf.getPage(i)
            const content = await page.getTextContent()
            pages.push(content.items.map((it: any) => it.str).join(' '))
            setProgress(25 + Math.round((i / pdf.numPages) * 50))
          }
          rawText = pages.join('\n\n')
        } else if (inputExt === 'docx' || inputExt === 'doc') {
          setProgress(25)
          const mammoth = await loadMammoth()
          const buf     = await file.arrayBuffer()
          const result  = await mammoth.extractRawText({ arrayBuffer: buf })
          rawText = result.value
          setProgress(70)
        }

        setProgress(80)

        // ── توليد الملف بالصيغة المطلوبة ──────────────────────────────────
        if (outputExt === 'txt') {
          const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8' })
          setDownloadUrl(URL.createObjectURL(blob))
        } else if (outputExt === 'rtf') {
          setDownloadUrl(URL.createObjectURL(txtToRtf(rawText)))
        } else if (outputExt === 'docx') {
          const blob = await txtToDocx(rawText)
          setDownloadUrl(URL.createObjectURL(blob))
        } else if (outputExt === 'pdf') {
          // PDF عبر طباعة المتصفح — نفتح نافذة ويطبع المستخدم إلى PDF
          textToPdfViaprint(rawText, outName)
          setDownloadUrl('__print__')
        }
        setProgress(100)

      } else {
        const ff = await ensureFFmpeg()
        ff.setProgress(({ ratio }: { ratio: number }) => setProgress(Math.max(5, Math.round(ratio * 100))))
        const inName = `in.${inputExt}`
        const outNameFf = `out.${outputExt}`
        const buf = await file.arrayBuffer()
        ff.FS('writeFile', inName, new Uint8Array(buf))
        const args: string[] = ['-i', inName]
        if (outputExt === 'mp3')  args.push('-q:a', '2')
        else if (outputExt === 'aac')  args.push('-b:a', '192k')
        else if (outputExt === 'opus') args.push('-b:a', '128k')
        else if (outputExt === 'gif')  args.push('-vf', 'fps=12,scale=480:-1:flags=lanczos', '-loop', '0')
        else if (outputExt === 'webm') args.push('-c:v', 'libvpx', '-crf', '10', '-b:v', '1M', '-c:a', 'libvorbis')
        else if (outputExt === 'mp4')  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', '-b:a', '128k')
        args.push(outNameFf)
        await ff.run(...args)
        const data = ff.FS('readFile', outNameFf)
        setDownloadUrl(URL.createObjectURL(new Blob([data.buffer])))
        try { ff.FS('unlink', inName); ff.FS('unlink', outNameFf) } catch {}
        setProgress(100)
      }
    } catch (e: any) {
      setError(e.message || 'خطأ في التحويل — تأكد من صحة الملف وحجمه')
    } finally { setConverting(false) }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return
    setFile(files[0]); setOutputExt(''); setDownloadUrl(''); setError(''); setProgress(0)
    const ext = convGetExt(files[0].name)
    const type = convGetType(ext)
    if ((type === 'audio' || type === 'video') && ffStatus === 'idle') {
      ensureFFmpeg().catch(() => setFfStatus('error'))
    }
  }

  const fmtSize = (b: number) => b < 1e6 ? `${(b/1024).toFixed(1)} KB` : `${(b/1e6).toFixed(1)} MB`
  const typeIcon: Record<string,string> = { image:'🖼️', audio:'🎵', video:'🎬', document:'📄', other:'📁' }
  const typeLabel: Record<string,string> = { image:'صورة', audio:'صوت', video:'فيديو', document:'مستند', other:'ملف' }

  const S = {
    wrap:  { fontFamily:"'Cairo','Tajawal',sans-serif", direction:'rtl' as const, color:'#c8d8b8' },
    title: { fontSize:22, fontWeight:800, color:'#c8ff00', marginBottom:6, display:'flex', alignItems:'center', gap:10 },
    sub:   { fontSize:13, color:'#6a9a50', marginBottom:20 },
    drop:  (on: boolean) => ({
      border:`2px dashed ${on ? '#c8ff00' : '#2a5020'}`, borderRadius:18, padding:'36px 24px',
      textAlign:'center' as const, background: on ? 'rgba(200,255,0,0.06)' : '#0d1f08',
      cursor:'pointer', transition:'all .2s', marginBottom:16, transform: on ? 'scale(1.01)' : 'scale(1)',
    }),
    card:  { background:'#0d2010', borderRadius:14, padding:'14px 18px', marginBottom:16, display:'flex', alignItems:'center', gap:12, border:'1px solid #1a4015' },
    badge: { background:'#0f2a0a', borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:700, color:'#a0d080', border:'1px solid #1a5010' },
    grid:  { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(76px,1fr))', gap:8, marginBottom:16 },
    fmt:   (on: boolean) => ({
      background: on ? '#c8ff00' : '#0d1f08', color: on ? '#0a0e04' : '#8ab870',
      border:`1.5px solid ${on ? '#c8ff00' : '#1a4015'}`, borderRadius:10, padding:'9px 4px',
      fontWeight:800, fontSize:13, cursor:'pointer', fontFamily:"'Cairo',sans-serif",
      textAlign:'center' as const, transition:'all .15s',
    }),
    convBtn: (dis: boolean) => ({
      background: dis ? '#1a3010' : '#c8ff00', border:'none', borderRadius:12, padding:'13px 32px',
      color: dis ? '#3a5a28' : '#0a0e04', fontWeight:900, fontSize:16, cursor: dis ? 'not-allowed' : 'pointer',
      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
      fontFamily:"'Cairo',sans-serif", transition:'all .2s', width:'100%',
    }),
    bar:   { height:10, background:'#0d2010', borderRadius:8, overflow:'hidden', margin:'12px 0' },
    fill:  (p: number) => ({ height:'100%', width:`${p}%`, background:'linear-gradient(90deg,#6aff00,#c8ff00)', borderRadius:8, transition:'width .3s' }),
    dlBtn: { background:'linear-gradient(135deg,#c8ff00,#a0d000)', border:'none', borderRadius:12, padding:'13px 32px', color:'#0a0e04', fontWeight:900, fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontFamily:"'Cairo',sans-serif", width:'100%', textDecoration:'none' },
    err:   { background:'#2a0808', border:'1px solid #5a1010', borderRadius:10, padding:'10px 14px', color:'#ff8080', fontSize:13, marginTop:10 },
    hint:  (c?: string) => ({ fontSize:12, color: c || '#4a7a30', marginTop:4 }),
    reset: { background:'none', border:'1px solid #1a4015', borderRadius:8, color:'#6a9a50', cursor:'pointer', padding:'8px 16px', marginTop:10, width:'100%', fontFamily:"'Cairo',sans-serif", fontSize:13 },
  }

  return (
    <div style={S.wrap}>
      <div style={S.title}>🔄 محوِّل الصيغ</div>
      <div style={S.sub}>حوِّل الفيديو والصوت والصور والمستندات — مباشرة في المتصفح بدون رفع لأي سيرفر</div>

      {/* منطقة السحب والإفلات */}
      <div
        style={S.drop(dragging)}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => fileInputRef.current?.click()}
      >
        <div style={{ fontSize:48, marginBottom:8 }}>{file ? typeIcon[inputType] : '📂'}</div>
        <div style={{ fontSize:15, fontWeight:700, color:'#a0d080', marginBottom:4 }}>
          {file ? file.name : 'اسحب ملفك هنا أو اضغط لاختياره'}
        </div>
        <div style={{ fontSize:12, color:'#4a7a30' }}>
          {file ? fmtSize(file.size) : 'فيديو · صوت · صور · مستندات (PDF، DOCX، TXT…)'}
        </div>
        <input ref={fileInputRef} type="file" style={{ display:'none' }}
          accept="video/*,audio/*,image/*,.mkv,.avi,.flac,.ogg,.opus,.m4a,.txt,.pdf,.docx,.doc,.rtf"
          onChange={e => handleFiles(e.target.files)} />
      </div>

      {/* بطاقة الملف المختار */}
      {file && (
        <div style={S.card}>
          <span style={{ fontSize:32 }}>{typeIcon[inputType]}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:14, color:'#c8d8b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</div>
            <div style={{ fontSize:12, color:'#4a7a30', marginTop:2 }}>{fmtSize(file.size)} · {inputExt.toUpperCase()}</div>
          </div>
          <span style={S.badge}>{typeIcon[inputType]} {typeLabel[inputType]}</span>
          <button onClick={e => { e.stopPropagation(); setFile(null); setOutputExt(''); setDownloadUrl(''); setError('') }}
            style={{ background:'none', border:'none', color:'#5a8a40', cursor:'pointer', fontSize:18, padding:4 }}>✕</button>
        </div>
      )}

      {/* اختيار صيغة الإخراج */}
      {file && outputFmts.length > 0 && (
        <>
          <div style={{ fontSize:13, fontWeight:700, color:'#8ab870', marginBottom:10 }}>اختر الصيغة المطلوبة:</div>
          <div style={S.grid}>
            {outputFmts.map(ext => (
              <button key={ext} style={S.fmt(outputExt === ext)} onClick={() => setOutputExt(ext)}>
                {CONV_FMT_LABELS[ext] || ext.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}

      {file && !outputFmts.length && (
        <div style={S.err}>⚠️ هذا النوع من الملفات غير مدعوم — يُرجى اختيار ملف فيديو أو صوت أو صورة أو مستند (PDF/DOCX/TXT/RTF).</div>
      )}

      {/* حالة محرك FFmpeg */}
      {ffStatus === 'loading' && <div style={S.hint()}>⏳ جاري تحميل محرك FFmpeg.wasm... قد يأخذ بضع ثوانٍ</div>}
      {ffStatus === 'ready'   && <div style={S.hint('#6aff00')}>✅ محرك FFmpeg جاهز للتحويل</div>}
      {ffStatus === 'error'   && <div style={S.hint('#ff8080')}>⚠️ تعذّر تحميل FFmpeg — تحويل الصور فقط متاح</div>}

      {/* زر التحويل */}
      {file && outputExt && !downloadUrl && (
        <>
          <button style={S.convBtn(converting || !outputExt)} disabled={converting || !outputExt} onClick={handleConvert}>
            {converting
              ? `⏳ جاري التحويل... ${progress}%`
              : `🔄 تحويل إلى ${(CONV_FMT_LABELS[outputExt] || outputExt).toUpperCase()}`}
          </button>
          {converting && <div style={S.bar}><div style={S.fill(progress)} /></div>}
        </>
      )}

      {/* زر التحميل بعد النجاح */}
      {downloadUrl && downloadUrl !== '__print__' && (
        <div style={{ marginTop:12 }}>
          <a href={downloadUrl} download={outputName} style={S.dlBtn as React.CSSProperties}>
            ⬇️ تحميل الملف المحوَّل — {outputName}
          </a>
          <div style={{ ...S.hint('#6aff00'), textAlign:'center' as const, marginTop:6 }}>✅ تم التحويل بنجاح!</div>
          <button style={S.reset} onClick={() => { setFile(null); setOutputExt(''); setDownloadUrl(''); setError(''); setProgress(0) }}>
            + تحويل ملف آخر
          </button>
        </div>
      )}
      {downloadUrl === '__print__' && (
        <div style={{ marginTop:12 }}>
          <div style={{ background:'#0d2010', border:'1px solid #2a5020', borderRadius:12, padding:'14px 18px', color:'#c8d8b8', fontSize:13 }}>
            📄 <strong>تصدير إلى PDF:</strong> تم فتح نافذة الطباعة — اختر <strong>"حفظ كـ PDF"</strong> من قائمة الطابعات.
          </div>
          <button style={S.reset} onClick={() => { setFile(null); setOutputExt(''); setDownloadUrl(''); setError(''); setProgress(0) }}>
            + تحويل ملف آخر
          </button>
        </div>
      )}

      {/* خطأ */}
      {error && <div style={S.err}>❌ {error}</div>}

      {/* الصيغ المدعومة */}
      <div style={{ marginTop:24, borderTop:'1px solid #1a3010', paddingTop:16 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#4a7a30', marginBottom:8 }}>الصيغ المدعومة:</div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {([
            ['🖼️ صور',     'JPG · PNG · WebP · BMP · GIF'],
            ['🎵 صوت',     'MP3 · WAV · OGG · AAC · FLAC · M4A'],
            ['🎬 فيديو',   'MP4 · WebM · AVI · MOV · MKV · GIF'],
            ['📄 مستندات', 'PDF · DOCX · DOC · TXT · RTF'],
          ] as [string,string][]).map(([lbl, fmts]) => (
            <div key={lbl} style={{ background:'#0a1a06', borderRadius:8, padding:'8px 12px', fontSize:11, color:'#6a9a50' }}>
              <div style={{ fontWeight:700, marginBottom:2 }}>{lbl}</div>
              <div>{fmts}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Flight Search Tool (Air Algérie) ─────────────────────────────────────────
const DOMESTIC_AIRPORTS_LIST = [
  { code:'ALG', name:'الجزائر العاصمة — هواري بومدين' },
  { code:'ORN', name:'وهران — أحمد بن بلة' },
  { code:'CZL', name:'قسنطينة — محمد بوضياف' },
  { code:'AAE', name:'عنابة — رابح بيطاط' },
  { code:'TMR', name:'تمنراست — أقنار' },
  { code:'GHA', name:'غرداية — نومرات' },
  { code:'OGX', name:'ورقلة — عين البيضاء' },
  { code:'BJA', name:'بجاية — سعيد محمدي' },
  { code:'QSF', name:'سطيف — العين أرناط' },
  { code:'TLM', name:'تلمسان — زناتة' },
  { code:'BLJ', name:'باتنة — مصطفى بن بولعيد' },
  { code:'BSK', name:'بسكرة — محمد خيضر' },
  { code:'TID', name:'تيارت — بوشقيف' },
  { code:'ELU', name:'الوادي — قمار' },
  { code:'ADB', name:'أدرار' },
  { code:'CBH', name:'بشار — بودغن بن علي لطفي' },
  { code:'DJG', name:'جانت — تيسكة' },
  { code:'INZ', name:'عين صالح' },
  { code:'VVZ', name:'إيليزي — تاخمالت' },
  { code:'HME', name:'حاسي مسعود — وادي إيراو' },
  { code:'IAM', name:'عين أميناس — زرزايتين' },
  { code:'GJL', name:'جيجل — فرحات عباس' },
  { code:'TEE', name:'تبسة' },
  { code:'EBH', name:'البيض' },
  { code:'MZW', name:'المشرية' },
  { code:'TFR', name:'تيندوف' },
  { code:'BMW', name:'بوردج باجي مختار' },
]

const INTL_AIRPORTS_LIST = [
  { code:'CDG', name:'باريس شارل ديغول 🇫🇷' },
  { code:'ORY', name:'باريس أورلي 🇫🇷' },
  { code:'LYS', name:'ليون 🇫🇷' },
  { code:'MRS', name:'مرسيليا 🇫🇷' },
  { code:'NCE', name:'نيس 🇫🇷' },
  { code:'BOD', name:'بوردو 🇫🇷' },
  { code:'TLS', name:'تولوز 🇫🇷' },
  { code:'NTE', name:'نانت 🇫🇷' },
  { code:'SXB', name:'ستراسبورغ 🇫🇷' },
  { code:'BRU', name:'بروكسل 🇧🇪' },
  { code:'AMS', name:'أمستردام 🇳🇱' },
  { code:'LHR', name:'لندن هيثرو 🇬🇧' },
  { code:'LGW', name:'لندن غاتويك 🇬🇧' },
  { code:'BCN', name:'برشلونة 🇪🇸' },
  { code:'MAD', name:'مدريد 🇪🇸' },
  { code:'FCO', name:'روما فيوميتشينو 🇮🇹' },
  { code:'MXP', name:'ميلانو مالبنسا 🇮🇹' },
  { code:'FRA', name:'فرانكفورت 🇩🇪' },
  { code:'GVA', name:'جنيف 🇨🇭' },
  { code:'ZRH', name:'زيوريخ 🇨🇭' },
  { code:'VIE', name:'فيينا 🇦🇹' },
  { code:'IST', name:'إسطنبول 🇹🇷' },
  { code:'SVO', name:'موسكو 🇷🇺' },
  { code:'TUN', name:'تونس قرطاج 🇹🇳' },
  { code:'CMN', name:'الدار البيضاء 🇲🇦' },
  { code:'CAI', name:'القاهرة 🇪🇬' },
  { code:'TIP', name:'طرابلس 🇱🇾' },
  { code:'DKR', name:'داكار 🇸🇳' },
  { code:'NKC', name:'نواكشوط 🇲🇷' },
  { code:'BKO', name:'باماكو 🇲🇱' },
  { code:'NIM', name:'نيامي 🇳🇪' },
  { code:'NDJ', name:'نجامينا 🇹🇩' },
  { code:'COO', name:'كوتونو 🇧🇯' },
  { code:'ABJ', name:'أبيدجان 🇨🇮' },
  { code:'LOS', name:'لاغوس 🇳🇬' },
  { code:'ADD', name:'أديس أبابا 🇪🇹' },
  { code:'NBO', name:'نيروبي 🇰🇪' },
  { code:'JNB', name:'جوهانسبرغ 🇿🇦' },
  { code:'JED', name:'جدة 🇸🇦' },
  { code:'RUH', name:'الرياض 🇸🇦' },
  { code:'DXB', name:'دبي 🇦🇪' },
  { code:'AUH', name:'أبوظبي 🇦🇪' },
  { code:'DOH', name:'الدوحة 🇶🇦' },
  { code:'BEY', name:'بيروت 🇱🇧' },
  { code:'AMM', name:'عمّان 🇯🇴' },
  { code:'KWI', name:'الكويت 🇰🇼' },
  { code:'MCT', name:'مسقط 🇴🇲' },
  { code:'YUL', name:'مونتريال 🇨🇦' },
  { code:'JFK', name:'نيويورك JFK 🇺🇸' },
]

type FlightType = 'domestic' | 'international'

interface Flight {
  from: string; to: string; fn: string
  dep: string; arr: string; duration: string
  daysLabel: string; status: string; class: string; note?: string
}

function FlightSearchTool() {
  const [flightType, setFlightType] = useState<FlightType>('domestic')
  const [fromCode, setFromCode]     = useState('')
  const [toCode, setToCode]         = useState('')
  const [date, setDate]             = useState(() => new Date().toISOString().split('T')[0])
  const [loading, setLoading]       = useState(false)
  const [results, setResults]       = useState<Flight[] | null>(null)
  const [error, setError]           = useState('')
  const [searched, setSearched]     = useState(false)
  const [fromName, setFromName]     = useState('')
  const [toName, setToName]         = useState('')

  const airports = flightType === 'domestic' ? DOMESTIC_AIRPORTS_LIST : INTL_AIRPORTS_LIST

  // compute available "to" airports (same list minus "from")
  const toAirports = airports.filter(a => a.code !== fromCode)

  const handleSearch = async () => {
    if (!fromCode) { setError('اختر مطار المغادرة'); return }
    setLoading(true); setError(''); setResults(null); setSearched(false)
    try {
      const res = await fetch('/api/flights/air-algerie/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromCode, to: toCode, type: flightType, date }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'خطأ في البحث')
      setResults(data.flights)
      setFromName(data.from?.name || fromCode)
      setToName(data.to?.name || toCode || 'جميع الوجهات')
      setSearched(true)
    } catch (e: any) {
      setError(e.message || 'خطأ في الاتصال')
    } finally {
      setLoading(false)
    }
  }

  const resetType = (t: FlightType) => {
    setFlightType(t)
    setFromCode('')
    setToCode('')
    setResults(null)
    setSearched(false)
    setError('')
  }

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('ar-DZ', { weekday:'long', year:'numeric', month:'long', day:'numeric' })

  return (
    <div className="dzt-fl-wrap">
      {/* ── Air Algérie Logo Header ── */}
      <div className="dzt-fl-brand">
        <div className="dzt-fl-logo">
          <svg viewBox="0 0 60 60" className="dzt-fl-logo-svg" xmlns="http://www.w3.org/2000/svg">
            <circle cx="30" cy="30" r="30" fill="#006233"/>
            <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle" fontSize="28" fill="white">✈</text>
          </svg>
          <div>
            <div className="dzt-fl-logo-name">Air Algérie</div>
            <div className="dzt-fl-logo-sub">الخطوط الجوية الجزائرية</div>
          </div>
        </div>
        <a href="https://www.airalgerie.dz" target="_blank" rel="noopener noreferrer" className="dzt-fl-book-btn">
          ✈ احجز الآن
        </a>
      </div>

      {/* ── Type Tabs ── */}
      <div className="dzt-fl-type-tabs">
        <button
          className={`dzt-fl-type-tab${flightType === 'domestic' ? ' active' : ''}`}
          onClick={() => resetType('domestic')}
        >🇩🇿 رحلات داخلية</button>
        <button
          className={`dzt-fl-type-tab${flightType === 'international' ? ' active' : ''}`}
          onClick={() => resetType('international')}
        >🌍 رحلات دولية</button>
      </div>

      {/* ── Search Form ── */}
      <div className="dzt-fl-form">
        <div className="dzt-fl-form-row">
          <div className="dzt-fl-field">
            <label className="dzt-fl-label">✈ من (مطار المغادرة)</label>
            <select
              className="dzt-fl-select"
              value={fromCode}
              onChange={e => { setFromCode(e.target.value); setToCode(''); setResults(null); setSearched(false) }}
            >
              <option value="">اختر المطار...</option>
              {airports.map(a => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
            </select>
          </div>

          <div className="dzt-fl-swap">
            <button
              className="dzt-fl-swap-btn"
              title="تبديل المطارين"
              onClick={() => { const t = fromCode; setFromCode(toCode); setToCode(t); setResults(null); setSearched(false) }}
            >⇄</button>
          </div>

          <div className="dzt-fl-field">
            <label className="dzt-fl-label">🛬 إلى (وجهة الوصول)</label>
            <select
              className="dzt-fl-select"
              value={toCode}
              onChange={e => { setToCode(e.target.value); setResults(null); setSearched(false) }}
            >
              <option value="">جميع الوجهات</option>
              {toAirports.map(a => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
            </select>
          </div>

          <div className="dzt-fl-field dzt-fl-field--date">
            <label className="dzt-fl-label">📅 تاريخ السفر</label>
            <input
              type="date"
              className="dzt-fl-input-date"
              value={date}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => { setDate(e.target.value); setResults(null); setSearched(false) }}
            />
          </div>
        </div>

        <button className="dzt-fl-search-btn" onClick={handleSearch} disabled={loading || !fromCode}>
          {loading ? <span className="dzt-fl-spinner">⏳</span> : '🔍 ابحث عن الرحلات'}
        </button>

        {error && <div className="dzt-fl-error">⚠️ {error}</div>}
      </div>

      {/* ── Results ── */}
      {searched && results !== null && (
        <div className="dzt-fl-results">
          <div className="dzt-fl-results-header">
            <div className="dzt-fl-results-title">
              <span className="dzt-fl-results-route">{fromName} → {toName}</span>
              <span className="dzt-fl-results-date">{dateLabel}</span>
            </div>
            <div className="dzt-fl-results-count">
              {results.length > 0
                ? <><strong>{results.length}</strong> رحلة متاحة</>
                : 'لا توجد رحلات في هذا اليوم'}
            </div>
          </div>

          {results.length === 0 ? (
            <div className="dzt-fl-empty">
              <div className="dzt-fl-empty-icon">✈️</div>
              <div className="dzt-fl-empty-msg">لا توجد رحلات في يوم {dateLabel}</div>
              <div className="dzt-fl-empty-hint">جرّب تاريخاً آخر أو اختر "جميع الوجهات" لعرض كل الرحلات</div>
              <a href="https://www.airalgerie.dz" target="_blank" rel="noopener noreferrer" className="dzt-fl-book-btn dzt-fl-book-btn--sm">
                🌐 تحقق على الموقع الرسمي
              </a>
            </div>
          ) : (
            <div className="dzt-fl-cards">
              {results.map((f, i) => (
                <div key={i} className="dzt-fl-card">
                  <div className="dzt-fl-card-top">
                    <div className="dzt-fl-card-fn">
                      <span className="dzt-fl-fn-badge">{f.fn}</span>
                      {f.note && <span className="dzt-fl-seasonal">{f.note}</span>}
                    </div>
                    <div className="dzt-fl-card-status">{f.status}</div>
                  </div>

                  <div className="dzt-fl-card-times">
                    <div className="dzt-fl-time-col">
                      <div className="dzt-fl-time">{f.dep}</div>
                      <div className="dzt-fl-airport-code">{f.from}</div>
                    </div>
                    <div className="dzt-fl-duration-col">
                      <div className="dzt-fl-duration-line">
                        <div className="dzt-fl-duration-bar">
                          <div className="dzt-fl-duration-plane">✈</div>
                        </div>
                      </div>
                      <div className="dzt-fl-duration-label">{f.duration}</div>
                    </div>
                    <div className="dzt-fl-time-col dzt-fl-time-col--arr">
                      <div className="dzt-fl-time">{f.arr}</div>
                      <div className="dzt-fl-airport-code">{f.to}</div>
                    </div>
                  </div>

                  <div className="dzt-fl-card-bottom">
                    <span className="dzt-fl-days">🗓 {f.daysLabel}</span>
                    <span className="dzt-fl-class">💺 {f.class}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="dzt-fl-disclaimer">
            <span>📋 المعلومات مبنية على جداول Air Algérie 2024/2025</span>
            <a href="https://www.airalgerie.dz" target="_blank" rel="noopener noreferrer">تحقق من الموقع الرسمي ←</a>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main DZTools Page ────────────────────────────────────────────────────────
const VALID_TOOL_IDS: ToolId[] = ['cv','planner','docs','jobs','health','ocr','bizplan','image','hashtag','invoice','tax','pension','qrcode','bizcard','darija','zakat','excel','dataanalysis','tts','screenshot','fileupload','convert','flights']

function getToolFromSearch(search: string): ToolId | null {
  try {
    const t = new URLSearchParams(search).get('tool') as ToolId | null
    if (t && VALID_TOOL_IDS.includes(t)) return t
  } catch {}
  return null
}

export default function DZTools() {
  const navigate = useNavigate()
  const location = useLocation()

  // Deep-link support: /tools?tool=cv opens CV tool directly
  const [active, setActive] = useState<ToolId>(() => getToolFromSearch(window.location.search) ?? 'cv')

  // React to in-app navigation (e.g. from DZ Agent tool-redirect button)
  useEffect(() => {
    const t = getToolFromSearch(location.search)
    if (t) setActive(t)
  }, [location.search])

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
        {active === 'ocr'          && <OCRTool />}
        {active === 'bizplan'      && <BizPlanTool />}
        {active === 'invoice'      && <InvoiceTool />}
        {active === 'tax'          && <TaxTool />}
        {active === 'darija'       && <DarijaTool />}
        {active === 'zakat'        && <ZakatTool />}
        {active === 'hashtag'      && <HashtagTool />}
        {active === 'excel'        && <SpreadsheetTool />}
        {active === 'pension'      && <PensionTool />}
        {active === 'qrcode'       && <QRCodeTool />}
        {active === 'bizcard'      && <BizCardTool />}
        {active === 'dataanalysis' && <DataAnalysisTool />}
        {active === 'tts'          && <TTSTool />}
        {active === 'screenshot'   && <ScreenshotTool />}
        {active === 'fileupload'   && <FileUploadTool />}
        {active === 'convert'      && <FileConverterTool />}
        {active === 'flights'      && <FlightSearchTool />}
      </div>
    </div>
  )
}
