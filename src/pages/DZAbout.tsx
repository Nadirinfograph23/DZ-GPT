import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ExternalLink, Cpu, Wrench, Zap, Server, AlertTriangle, Info } from 'lucide-react'
import '../styles/dz-about.css'

const DEVELOPER = {
  name: 'Nadir Infograph',
  fullName: 'نذير حوامرية',
  avatar: 'https://i.postimg.cc/Y0zgGHqt/FB-IMG-1775858111445.jpg',
  city: 'عنابة 🇩🇿',
  role: 'مطوّر ذكاء اصطناعي — AI Engineer',
  facebook: 'https://www.facebook.com/share/1AM1jDkz8o/',
  instagram: 'https://www.instagram.com/nadir.infograph?igsh=ZmJsZGhheXB0emli',
  tiktok: 'https://www.tiktok.com/@nadirinfograph2?_r=1&_t=ZS-96pplHnvWo4',
  youtube: 'https://www.youtube.com/@Nadirinfograph',
  github: 'https://github.com/Nadirinfograph23',
  site: 'https://dz-gpt.vercel.app',
  tv: [
    { label: 'التلفزيون الجزائري الوطني', url: 'https://youtu.be/-DPOFfvRS-Q?si=TOkP1VFTApMcktJ7' },
    { label: 'قناة الجزائر الدولية AL24', url: 'https://m.youtube.com/watch?v=gAzvBi4N7ic' },
  ],
}

const AGENTS = [
  {
    emoji: '🔎', name: 'وكيل البحث الحي', role: 'Live Search Agent', color: '#6366f1',
    desc: 'يبحث على الإنترنت في الوقت الفعلي عبر Google وRSS وcrawl4ai، ويعطيك نتائج محدّثة بدل المعلومات القديمة.',
  },
  {
    emoji: '📰', name: 'وكيل الأخبار', role: 'News Agent', color: '#f59e0b',
    desc: 'يجمع الأخبار من أكثر من 20 مصدراً جزائرياً ودولياً، ويصنّفها حسب الموضوع ويلخّصها فور نشرها.',
  },
  {
    emoji: '⚽', name: 'وكيل الرياضة', role: 'Sports Agent', color: '#10b981',
    desc: 'يتابع مباريات الرابطة الجزائرية (LFP) والدوريات العالمية، ويقدّم النتائج والترتيب والأهداف لحظةً بلحظة.',
  },
  {
    emoji: '🌤️', name: 'وكيل الطقس', role: 'Weather Agent', color: '#06b6d4',
    desc: 'يوفّر بيانات الطقس الحية لجميع الـ 58 ولاية الجزائرية وأي مدينة في العالم، مع توقعات 7 أيام.',
  },
  {
    emoji: '🗺️', name: 'وكيل الخرائط', role: 'Maps Agent', color: '#84cc16',
    desc: 'يتعامل مع الجغرافيا الجزائرية التفصيلية: ولايات، بلديات، مواقع، مسافات، وأدلّة الأماكن.',
  },
  {
    emoji: '🐙', name: 'وكيل GitHub', role: 'GitHub Agent', color: '#58a6ff',
    desc: 'يُنشئ المستودعات ويُجري الـ commit والـ push ويفتح Pull Requests وينشر المواقع على GitHub Pages وVercel تلقائياً.',
  },
  {
    emoji: '🌐', name: 'وكيل بناء المواقع', role: 'Web Builder Agent', color: '#a855f7',
    desc: 'يُنشئ مواقع ويب كاملة بـ HTML/CSS/JS/React من وصف نصي فقط، مع نشر فوري على الإنترنت.',
  },
  {
    emoji: '🧠', name: 'وكيل الذاكرة', role: 'Memory Agent', color: '#ec4899',
    desc: 'يحتفظ بالمعلومات الشخصية التي تشاركها معه (اسمك، تفضيلاتك، مشاريعك) ليُخصّص ردوده في كل جلسة.',
  },
  {
    emoji: '📖', name: 'وكيل القرآن', role: 'Quran Agent', color: '#0ea5e9',
    desc: 'يبحث في 6236 آية قرآنية، ويُقدّم التفسير بالتفصيل، ومواقيت الصلاة، والاستماع للتلاوات الصوتية.',
  },
  {
    emoji: '🏥', name: 'وكيل الصحة', role: 'Health Agent', color: '#ef4444',
    desc: 'يُساعدك في البحث عن أطباء وعيادات، ويشرح حقوقك في CNAS/CHNAS، ويقدّم معلومات صحية موثوقة.',
  },
  {
    emoji: '🎓', name: 'وكيل التعليم', role: 'Education Agent', color: '#f97316',
    desc: 'يُغطّي منهج الدراسة الجزائري من ابتدائي إلى جامعي، ويربطك بمنصة Eddirasa ويُساعد في التحضير للبكالوريا.',
  },
  {
    emoji: '⚖️', name: 'وكيل القانون', role: 'Legal Agent', color: '#8b5cf6',
    desc: 'يُنشئ العقود القانونية الجزائرية، ويُحلّل الوثائق الرسمية بالـ OCR، ويُجيب على الأسئلة التشريعية.',
  },
  {
    emoji: '🎬', name: 'وكيل يوتيوب', role: 'YouTube Agent', color: '#dc2626',
    desc: 'يستخرج ملخّص أي فيديو يوتيوب، يُحوّل التعليقات إلى تحليل، ويُجيب عن أسئلتك حول محتواه.',
  },
  {
    emoji: '🗣️', name: 'وكيل الدارجة', role: 'Darija Agent', color: '#16a34a',
    desc: 'يفهم ويتحدّث جميع لهجات الدارجة الجزائرية بطلاقة، من القبائلية إلى الشاوية والتارقية والصحراوية.',
  },
  {
    emoji: '💱', name: 'وكيل العملات', role: 'Currency Agent', color: '#eab308',
    desc: 'يُقدّم أسعار صرف الدينار الجزائري (DZD) مقابل اليورو والدولار وجميع العملات الكبرى في الوقت الحقيقي.',
  },
  {
    emoji: '🔬', name: 'وكيل التحليل', role: 'Analysis Agent', color: '#64748b',
    desc: 'يُطبّق تقنيات التفكير المتقدم (CoT، ReAct، ToT) لتحليل المسائل المعقدة وإعطاء إجابات عميقة ومبرّرة.',
  },
]

const TOOLS = [
  { emoji: '🔍', name: 'بحث Google الحي',    color: '#6366f1', desc: 'يُجري بحثاً مباشراً على Google ويُعيد النتائج الأحدث مع المصادر.' },
  { emoji: '🌐', name: 'قارئ المواقع',        color: '#0ea5e9', desc: 'يفتح أي رابط ويستخرج محتواه النصي الكامل لمعالجته والإجابة عنه.' },
  { emoji: '💻', name: 'مولّد الكود',          color: '#10b981', desc: 'يكتب كوداً برمجياً نظيفاً بلغات متعددة مع شرح كل سطر.' },
  { emoji: '🐙', name: 'GitHub API',           color: '#58a6ff', desc: 'يدير المستودعات: إنشاء، commit، push، branch، pull request.' },
  { emoji: '🖼️', name: 'توليد الصور AI',       color: '#a855f7', desc: 'يُنشئ صوراً واقعية أو فنية من نص، عبر FLUX.1 وPollinations وStability.' },
  { emoji: '📷', name: 'OCR — قراءة الصور',    color: '#f59e0b', desc: 'يستخرج النصوص من صور الهوية والوثائق والـ PDF بدقة عالية.' },
  { emoji: '🌤️', name: 'طقس OpenWeather',      color: '#06b6d4', desc: 'يُحضر بيانات الطقس الحية لأي مدينة أو ولاية جزائرية مع التوقعات.' },
  { emoji: '💱', name: 'تحويل العملات',         color: '#eab308', desc: 'يُحوّل بين الدينار الجزائري وجميع العملات بأسعار لحظية.' },
  { emoji: '🎬', name: 'تحليل يوتيوب',          color: '#dc2626', desc: 'يستخرج النص والملخّص والنقاط الرئيسية من أي فيديو يوتيوب.' },
  { emoji: '📖', name: 'قرآن API',              color: '#16a34a', desc: 'يصل إلى 6236 آية مع التفسير الصوتي ومواقيت الصلاة لـ 58 ولاية.' },
  { emoji: '🧠', name: 'الذاكرة الشخصية',       color: '#ec4899', desc: 'يحفظ تفضيلاتك ومعلوماتك لتجربة محادثة مُخصّصة في كل جلسة.' },
  { emoji: '📰', name: 'رادار الأخبار',          color: '#f97316', desc: 'يجمع الأخبار من 20+ مصدراً عبر RSS/scraping ويُصنّفها تلقائياً.' },
  { emoji: '📊', name: 'محرر Excel/CSV',         color: '#22c55e', desc: 'يُنشئ جداول البيانات ويعالجها ويُنسّقها ويولّد الرسوم البيانية.' },
  { emoji: '🌐', name: 'Web Builder',            color: '#8b5cf6', desc: 'يُنشئ مواقع HTML/CSS/JS/React كاملة وينشرها على GitHub Pages.' },
  { emoji: '📄', name: 'تحليل PDF',              color: '#94a3b8', desc: 'يقرأ ملفات PDF ويلخّصها ويُجيب عن أسئلتك حول محتواها.' },
  { emoji: '🗣️', name: 'محرك الدارجة',           color: '#16a34a', desc: 'يُحلّل اللهجة الجزائرية ويُترجمها إلى فصحى وفرنسية وإنجليزية.' },
  { emoji: '🗺️', name: 'خرائط الجزائر',          color: '#84cc16', desc: 'يُوفّر بيانات جغرافية تفصيلية لجميع الولايات والبلديات والأماكن.' },
  { emoji: '🛡️', name: 'Circuit Breaker',        color: '#64748b', desc: 'يُراقب صحة جميع المزودين ويُحوّل تلقائياً عند أي عطل لضمان الاستمرارية.' },
]

const SKILLS = [
  { emoji: '🔎', name: 'بحث الإنترنت الحي',      desc: 'البحث في الوقت الفعلي بدل الاعتماد على البيانات القديمة' },
  { emoji: '📰', name: 'أخبار الجزائر',            desc: 'تجميع وتلخيص الأخبار من أكثر من 20 مصدراً جزائرياً' },
  { emoji: '🌍', name: 'أخبار دولية',              desc: 'متابعة الأحداث العالمية وتقديمها بالعربية والفرنسية' },
  { emoji: '⚽', name: 'رياضة وLFP',              desc: 'نتائج مباريات الدوري الجزائري والدوريات العالمية حياً' },
  { emoji: '💱', name: 'عملات DZD حية',            desc: 'سعر الدينار الجزائري مقابل اليورو والدولار والعملات الكبرى' },
  { emoji: '🌤️', name: 'طقس 58 ولاية',            desc: 'حالة الطقس والتوقعات لجميع الولايات الجزائرية' },
  { emoji: '🕌', name: 'مواقيت الصلاة',            desc: 'أوقات الصلاة الدقيقة لكل بلدية جزائرية' },
  { emoji: '📖', name: 'قرآن كريم',                desc: 'بحث، تفسير، وتلاوة صوتية لكل آيات المصحف' },
  { emoji: '🧠', name: 'ذاكرة شخصية',              desc: 'تخزين معلوماتك وتفضيلاتك لتجربة مُخصّصة' },
  { emoji: '📄', name: 'كتابة السيرة الذاتية',      desc: 'توليد CV احترافي من معلوماتك بعدة تنسيقات' },
  { emoji: '📋', name: 'مخطط المشاريع',             desc: 'إنشاء خطط عمل تفصيلية لأي مشروع' },
  { emoji: '📑', name: 'وثائق تجارية',              desc: 'صياغة العروض التجارية وتقارير الأعمال' },
  { emoji: '⚖️', name: 'تحليل قانوني',              desc: 'شرح القوانين الجزائرية وصياغة العقود' },
  { emoji: '💼', name: 'بحث وظيفي',                desc: 'البحث عن فرص العمل وتحليل متطلباتها' },
  { emoji: '✉️', name: 'رسائل تقدم للوظائف',       desc: 'كتابة خطابات تقديم احترافية مُخصّصة' },
  { emoji: '🏥', name: 'دعم صحي',                  desc: 'معلومات طبية وإرشادات CNAS والبحث عن أطباء' },
  { emoji: '👨‍⚕️', name: 'بحث أطباء',                desc: 'إيجاد أطباء متخصصين حسب المنطقة والتخصص' },
  { emoji: '📊', name: 'إحصاءات جزائرية',           desc: 'بيانات رسمية عن الاقتصاد والسكان والتنمية' },
  { emoji: '🗣️', name: 'دارجة جزائرية',             desc: 'فهم وكتابة جميع لهجات الجزائر بطلاقة' },
  { emoji: '🔄', name: 'ترجمة 3 لغات',             desc: 'الترجمة الدقيقة بين العربية والفرنسية والإنجليزية' },
  { emoji: '🖼️', name: 'توليد صور AI',              desc: 'إنشاء صور واقعية وفنية من وصف نصي فقط' },
  { emoji: '🌐', name: 'بناء المواقع',              desc: 'توليد مواقع HTML/CSS/JS/React كاملة ونشرها' },
  { emoji: '🚀', name: 'GitHub Pages',              desc: 'نشر المشاريع مجاناً على GitHub Pages' },
  { emoji: '☁️', name: 'نشر Vercel',                desc: 'النشر التلقائي على Vercel مع رابط مباشر' },
  { emoji: '🎬', name: 'تحليل يوتيوب',              desc: 'استخراج ملخّص ونقاط رئيسية من أي فيديو' },
  { emoji: '📷', name: 'OCR صور وPDF',              desc: 'قراءة النصوص من الوثائق الممسوحة ضوئياً' },
  { emoji: '🎓', name: 'دروس Eddirasa',             desc: 'الوصول إلى المقررات والدروس التعليمية الجزائرية' },
  { emoji: '📝', name: 'توليد العقود',              desc: 'إنشاء عقود إيجار وعمل وشراكة جاهزة للتوقيع' },
  { emoji: '📊', name: 'Business Plan',             desc: 'خطة عمل كاملة مع دراسة السوق والتوقعات المالية' },
  { emoji: '🏢', name: 'شركات الجزائر',             desc: 'معلومات عن المؤسسات والمنظمات الجزائرية' },
  { emoji: '🩺', name: 'CNAS / CHNAS',              desc: 'شرح الحقوق والخدمات الصحية والتأمينية الجزائرية' },
  { emoji: '🧩', name: 'تنسيق متعدد الوكلاء',       desc: 'تشغيل عدة وكلاء معاً لحل المهام المعقدة' },
  { emoji: '🔗', name: 'WebSocket الفوري',           desc: 'استجابات فورية عبر اتصال مستمر بدون انتظار' },
  { emoji: '🛡️', name: 'Circuit Breaker',           desc: 'التحويل التلقائي للمزوّد الاحتياطي عند أي عطل' },
  { emoji: '🎯', name: 'كاشف النوايا',               desc: 'يفهم قصدك بدقة حتى لو الجملة غير مكتملة أو بالدارجة' },
  { emoji: '🌐', name: 'قراءة المواقع',              desc: 'تصفح واستخراج محتوى أي موقع إلكتروني تلقائياً' },
  { emoji: '💻', name: 'كود وبرمجة',                desc: 'كتابة كود نظيف وتصحيح الأخطاء بعدة لغات برمجية' },
  { emoji: '🗺️', name: 'خرائط جزائرية',             desc: 'بيانات جغرافية تفصيلية لكل بلدية وولاية ومنطقة' },
  { emoji: '📊', name: 'Excel وجداول البيانات',      desc: 'معالجة البيانات وإنشاء الرسوم البيانية والتقارير' },
]

const PROVIDERS = [
  {
    name: 'Groq Cloud', models: ['llama-3.3-70b', 'mixtral-8x7b'], ctx: '32K',
    color: '#f97316', cost: 'مجاني', rel: 9,
    desc: 'أسرع مزوّد في المنصة — يُعطي ردوداً في أقل من ثانية بفضل معالجات LPU المتخصصة.',
  },
  {
    name: 'Google Gemini', models: ['gemini-1.5-flash', 'gemini-2.0-flash'], ctx: '1M',
    color: '#4285f4', cost: 'مجاني', rel: 8,
    desc: 'نافذة سياق مليون token — الأنسب للوثائق الطويلة والملفات الضخمة.',
  },
  {
    name: 'Mistral AI', models: ['mistral-large', 'mistral-small'], ctx: '32K',
    color: '#ff7000', cost: 'منخفض', rel: 8,
    desc: 'نموذج فرنسي-أوروبي ممتاز للمحتوى باللغتين الفرنسية والعربية.',
  },
  {
    name: 'NVIDIA NIM', models: ['llama-3.1-70b', 'nemotron-70b'], ctx: '128K',
    color: '#76b900', cost: 'مجاني', rel: 7,
    desc: 'نماذج مُحسَّنة على بنية NVIDIA — قوية في المهام التحليلية والعلمية.',
  },
  {
    name: 'Cohere', models: ['command-r-plus', 'command-r'], ctx: '128K',
    color: '#39d353', cost: 'مجاني', rel: 7,
    desc: 'متخصّص في البحث المعزّز (RAG) واسترجاع المعلومات من قواعد البيانات.',
  },
  {
    name: 'OpenRouter', models: ['claude-3.5-sonnet', 'gpt-4o'], ctx: '200K',
    color: '#7c3aed', cost: 'متوسط', rel: 8,
    desc: 'بوابة موحّدة لأقوى النماذج: Claude من Anthropic وGPT-4o من OpenAI.',
  },
  {
    name: 'HuggingFace', models: ['FLUX.1-schnell', 'SDXL'], ctx: 'صور',
    color: '#ffd21e', cost: 'مجاني', rel: 6,
    desc: 'مُخصّص لتوليد الصور AI — FLUX.1 وStable Diffusion XL متاحان مجاناً.',
  },
]

const STATS = [
  { value: '16', label: 'وكيل متخصص', icon: <Cpu size={22} />, color: '#6366f1' },
  { value: '18', label: 'أداة مدمجة',  icon: <Wrench size={22} />, color: '#10b981' },
  { value: '39', label: 'مهارة',        icon: <Zap size={22} />, color: '#f59e0b' },
  { value: '7',  label: 'مزودو AI',     icon: <Server size={22} />, color: '#ec4899' },
]

const LIMITATIONS = [
  'لا تنفيذ كود في بيئة sandbox داخل الشات',
  'لا وصول لملفاتك المحلية على جهازك',
  'لا ذاكرة دائمة بين الجلسات المختلفة',
  '⚠️ DeepSeek: رصيد فارغ حالياً',
  '⚠️ Google CSE: مقيّد — SearXNG fallback متاح',
  'لا إرسال رسائل بالنيابة عنك بدون إذن',
]

function openFacebook() {
  const web = DEVELOPER.facebook
  const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
  if (isMobile) {
    window.location.href = `fb://facewebmodal/f?href=${encodeURIComponent(web)}`
    setTimeout(() => window.open(web, '_blank', 'noopener'), 700)
  } else {
    window.open(web, '_blank', 'noopener,noreferrer')
  }
}

function Stars({ score }: { score: number }) {
  return (
    <span className="dza-stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={`dza-star ${i < Math.round(score / 2) ? 'dza-star--on' : ''}`}>★</span>
      ))}
      <span className="dza-star-val">{score}/10</span>
    </span>
  )
}

type Tab = 'agents' | 'tools' | 'skills' | 'providers' | 'limits'

export default function DZAbout() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('agents')
  const [capabilities, setCapabilities] = useState<null | { timestamp: string }>(null)

  useEffect(() => {
    fetch('/api/capabilities', { headers: { 'User-Agent': 'DZAboutPage/1.0' } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.timestamp) setCapabilities(d) })
      .catch(() => {})
  }, [])

  return (
    <div className="dza-page" dir="rtl">

      {/* ── NAVBAR ── */}
      <header className="dza-nav">
        <button className="dza-back" onClick={() => navigate('/')} aria-label="رجوع">
          <ArrowRight size={18} />
          <span>الرئيسية</span>
        </button>
        <div className="dza-nav-title">
          <span className="dza-nav-logo">DZ Agent</span>
          <span className="dza-nav-badge">لوحة القدرات</span>
        </div>
        {capabilities && (
          <span className="dza-live-badge">
            <span className="dza-live-dot" />
            Live
          </span>
        )}
      </header>

      <main className="dza-main">

        {/* ── HERO ── */}
        <section className="dza-hero">
          <div className="dza-hero-glow" />
          <div className="dza-hero-icon">🤖</div>
          <h1 className="dza-hero-title">DZ Agent <span>قدراتي الكاملة</span></h1>
          <p className="dza-hero-sub">نظام متعدد الوكلاء مُطوَّر خصيصاً للمستخدم الجزائري</p>
        </section>

        {/* ── STATS GRID ── */}
        <section className="dza-stats">
          {STATS.map(s => (
            <div key={s.label} className="dza-stat-card" style={{ '--stat-color': s.color } as React.CSSProperties}>
              <div className="dza-stat-icon" style={{ color: s.color }}>{s.icon}</div>
              <div className="dza-stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="dza-stat-label">{s.label}</div>
            </div>
          ))}
        </section>

        {/* ── DEVELOPER CARD ── */}
        <section className="dza-dev-section">
          <h2 className="dza-section-title"><span>👨‍💻</span> المطوّر</h2>
          <div className="dza-dev-card">
            <button className="dza-dev-avatar-wrap" onClick={openFacebook} title="فتح صفحة المطور على فيسبوك">
              <img className="dza-dev-avatar" src={DEVELOPER.avatar} alt={DEVELOPER.fullName} />
              <span className="dza-dev-fb-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                </svg>
              </span>
            </button>

            <div className="dza-dev-info">
              <div className="dza-dev-name">{DEVELOPER.fullName}</div>
              <div className="dza-dev-en">{DEVELOPER.name}</div>
              <div className="dza-dev-city">{DEVELOPER.city} · {DEVELOPER.role}</div>
              <div className="dza-dev-tv">
                {DEVELOPER.tv.map(t => (
                  <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" className="dza-dev-tv-link">
                    🎬 {t.label}
                  </a>
                ))}
              </div>
              <div className="dza-dev-social">
                <a href={DEVELOPER.facebook} onClick={e => { e.preventDefault(); openFacebook() }} className="dza-social-btn dza-fb">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
                  فيسبوك
                </a>
                <a href={DEVELOPER.instagram} target="_blank" rel="noopener noreferrer" className="dza-social-btn dza-ig">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
                  انستغرام
                </a>
                <a href={DEVELOPER.youtube} target="_blank" rel="noopener noreferrer" className="dza-social-btn dza-yt">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>
                  يوتيوب
                </a>
                <a href={DEVELOPER.github} target="_blank" rel="noopener noreferrer" className="dza-social-btn dza-gh">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── TABS ── */}
        <section className="dza-tabs-section">
          <div className="dza-tabs-wrap">
            <div className="dza-tabs">
              {([
                { key: 'agents',    label: '🧠 الوكلاء',   count: 16 },
                { key: 'tools',     label: '🔧 الأدوات',    count: 18 },
                { key: 'skills',    label: '⚡ المهارات',   count: 39 },
                { key: 'providers', label: '☁️ المزودون',   count: 7  },
                { key: 'limits',    label: '🔒 الحدود',     count: null },
              ] as { key: Tab; label: string; count: number | null }[]).map(t => (
                <button
                  key={t.key}
                  className={`dza-tab ${activeTab === t.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}{t.count ? ` (${t.count})` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* ── AGENTS TAB ── */}
          {activeTab === 'agents' && (
            <div className="dza-list">
              {AGENTS.map(a => (
                <div key={a.name} className="dza-list-card" style={{ '--card-color': a.color } as React.CSSProperties}>
                  <div className="dza-list-emoji">{a.emoji}</div>
                  <div className="dza-list-body">
                    <div className="dza-list-name">{a.name}</div>
                    <div className="dza-list-role" style={{ color: a.color }}>{a.role}</div>
                    <div className="dza-list-desc">{a.desc}</div>
                  </div>
                  <div className="dza-list-dot" style={{ background: a.color }} />
                </div>
              ))}
            </div>
          )}

          {/* ── TOOLS TAB ── */}
          {activeTab === 'tools' && (
            <div className="dza-list">
              {TOOLS.map(t => (
                <div key={t.name} className="dza-list-card" style={{ '--card-color': t.color } as React.CSSProperties}>
                  <div className="dza-list-emoji">{t.emoji}</div>
                  <div className="dza-list-body">
                    <div className="dza-list-name">{t.name}</div>
                    <div className="dza-list-desc">{t.desc}</div>
                  </div>
                  <div className="dza-list-dot" style={{ background: t.color }} />
                </div>
              ))}
            </div>
          )}

          {/* ── SKILLS TAB ── */}
          {activeTab === 'skills' && (
            <div className="dza-list">
              {SKILLS.map(s => (
                <div key={s.name} className="dza-list-card dza-list-card--skill">
                  <div className="dza-list-emoji">{s.emoji}</div>
                  <div className="dza-list-body">
                    <div className="dza-list-name">{s.name}</div>
                    <div className="dza-list-desc">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── PROVIDERS TAB ── */}
          {activeTab === 'providers' && (
            <div className="dza-prov-list">
              {PROVIDERS.map(p => (
                <div key={p.name} className="dza-prov-card2" style={{ '--prov-color': p.color } as React.CSSProperties}>
                  <div className="dza-prov2-header">
                    <span className="dza-prov-dot" style={{ background: p.color }} />
                    <span className="dza-prov-name">{p.name}</span>
                    <span className="dza-prov-cost">{p.cost}</span>
                    <Stars score={p.rel} />
                  </div>
                  <div className="dza-prov2-desc">{p.desc}</div>
                  <div className="dza-prov2-footer">
                    <div className="dza-prov-models">
                      {p.models.map(m => <span key={m} className="dza-prov-model">{m}</span>)}
                    </div>
                    <span className="dza-prov-ctx">🗂 {p.ctx} tokens</span>
                  </div>
                </div>
              ))}

              <div className="dza-tokens-box">
                <div className="dza-tokens-title"><Info size={15} /> حدود الـ Tokens والسلاسل</div>
                <div className="dza-tokens-grid">
                  <div><span>المدخلات</span><strong>32,768</strong></div>
                  <div><span>المخرجات</span><strong>8,192</strong></div>
                  <div><span>متوسط الرد</span><strong>~600</strong></div>
                  <div><span>تكلفة الأدوات</span><strong>~400</strong></div>
                </div>
                <div className="dza-fallback-chain">
                  <span>سلسلة Fallback:</span>
                  {['Groq', 'Gemini', 'Mistral', 'NVIDIA', 'Cohere', 'OpenRouter'].map((p, i, arr) => (
                    <span key={p}>
                      <span className="dza-chain-item">{p}</span>
                      {i < arr.length - 1 && <span className="dza-chain-arrow">→</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── LIMITS TAB ── */}
          {activeTab === 'limits' && (
            <div className="dza-limits-section">
              <div className="dza-limits-header">
                <AlertTriangle size={20} className="dza-limits-icon" />
                <span>شفافية كاملة — ما لا يمكن لـ DZ Agent فعله</span>
              </div>
              <ul className="dza-limits-list">
                {LIMITATIONS.map(l => (
                  <li key={l} className="dza-limit-item">
                    <span className="dza-limit-x">✗</span>
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
              <div className="dza-api-box">
                <div className="dza-api-title">📡 API مباشر للمطورين</div>
                <div className="dza-api-endpoints">
                  <div className="dza-api-row">
                    <span className="dza-api-method">GET</span>
                    <a href="/api/capabilities" target="_blank" className="dza-api-path">/api/capabilities</a>
                    <span className="dza-api-desc">JSON كامل</span>
                  </div>
                  <div className="dza-api-row">
                    <span className="dza-api-method">GET</span>
                    <a href="/api/capabilities/report?mode=full" target="_blank" className="dza-api-path">/api/capabilities/report</a>
                    <span className="dza-api-desc">تقرير Markdown</span>
                  </div>
                  <div className="dza-api-row">
                    <span className="dza-api-method">GET</span>
                    <a href="/api/version" target="_blank" className="dza-api-path">/api/version</a>
                    <span className="dza-api-desc">إصدار النظام</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── CTA ── */}
        <section className="dza-cta">
          <button className="dza-cta-btn" onClick={() => navigate('/dz-agent')}>
            <span>ابدأ المحادثة مع DZ Agent</span>
            <span className="dza-cta-arrow">←</span>
          </button>
          <a href="/api/capabilities" target="_blank" rel="noopener noreferrer" className="dza-cta-api">
            <ExternalLink size={14} />
            API JSON
          </a>
        </section>

      </main>

      <footer className="dza-footer">
        <p>DZ Agent v5.0 · تطوير نذير حوامرية 2026 🇩🇿</p>
        {capabilities && (
          <p className="dza-footer-ts">آخر تحديث: {new Date(capabilities.timestamp).toLocaleString('ar-DZ')}</p>
        )}
      </footer>
    </div>
  )
}
