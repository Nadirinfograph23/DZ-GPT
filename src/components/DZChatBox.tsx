import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react'
import { createPortal } from 'react-dom'
import DZToast, { type Toast } from './DZToast'
import { useNavigate } from 'react-router-dom'
import {
  Send, Bot, Copy, Check, RotateCcw, Sparkles, Github,
  FolderOpen, FileText, ChevronRight, ChevronDown, AlertCircle,
  CheckCircle2, XCircle, GitCommit, GitPullRequest,
  RefreshCw, Terminal, Zap,
  ShieldAlert, Bug, Gauge, Lightbulb, GitBranch, ScanSearch, Wrench, Info,
  BookOpen, Pencil, Star, Activity, GitMerge, Search, Lock,
  BarChart2, Users, ExternalLink, MessageSquare, Tag, Clock,
  Download, ArrowRight, Loader2, Brain, MapPin, Monitor, Layers,
  Globe, ThumbsUp, ThumbsDown, Hammer, Trash2, X, Volume2, Square,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import WC2026MatchCard from './WC2026MatchCard'
import { DZMDTable } from './tables/DZSmartTable'
import DZDashboard from './DZDashboard'
import DoctorResultsPanel, { type DoctorResult, type DirLink } from './DoctorResultsPanel'
import { DeveloperCard } from './DeveloperCard'
import VoicePanel from './VoicePanel'
import AgentStepsPanel from './AgentStepsPanel'
import type { AgentStep } from './AgentStepsPanel'
import SearchStepsPanel from './SearchStepsPanel'
import GitHubReActPanel from './GitHubReActPanel'
import type { ReActStep } from './GitHubReActPanel'
import SmartRepoSuggestion from './SmartRepoSuggestion'
import GitHubLoadingIndicator from './GitHubLoadingIndicator'
import TaskPlanPanel from './TaskPlanPanel'
import type { TaskPlan } from './TaskPlanPanel'
import { trackFeatureUsage, withRetry } from '../utils/dzMemory'
import AgentModeBar, { type AgentModeState } from './AgentModeBar'

// ===== RATING PERSISTENCE =====
// ===== THINKING TRACE TYPES =====
interface ThinkingTraceRole {
  id: string
  emoji: string
  name: string
  nameAr: string
  color: string
  output: string
}

// ===== PRESENTATION VIEWER =====
function PresentationViewer({
  title, subtitle, color, slides,
}: {
  title: string
  subtitle?: string
  color: string
  slides: Array<{ title: string; bullets: string[]; icon: string; note?: string }>
}) {
  const [current, setCurrent] = useState(0)
  const total = slides.length
  const slide = slides[current] || slides[0]
  if (!slide) return null
  return (
    <div className="dz-pres" style={{ '--pres-color': color } as React.CSSProperties}>
      <div className="dz-pres__header">
        <span className="dz-pres__title-main">{title}</span>
        {subtitle && <span className="dz-pres__subtitle">{subtitle}</span>}
        <span className="dz-pres__count">{current + 1} / {total}</span>
      </div>
      <div className="dz-pres__slide">
        <div className="dz-pres__slide-icon">{slide.icon}</div>
        <h3 className="dz-pres__slide-title">{slide.title}</h3>
        <ul className="dz-pres__bullets">
          {slide.bullets.map((b, i) => (
            <li key={i} className="dz-pres__bullet">
              <span className="dz-pres__bullet-dot" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {slide.note && (
          <div className="dz-pres__note">💡 {slide.note}</div>
        )}
      </div>
      <div className="dz-pres__nav">
        <button
          className="dz-pres__nav-btn"
          onClick={() => setCurrent(c => Math.max(0, c - 1))}
          disabled={current === 0}
        >‹ السابق</button>
        <div className="dz-pres__dots">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`dz-pres__dot ${i === current ? 'dz-pres__dot--active' : ''}`}
              onClick={() => setCurrent(i)}
            />
          ))}
        </div>
        <button
          className="dz-pres__nav-btn"
          onClick={() => setCurrent(c => Math.min(total - 1, c + 1))}
          disabled={current === total - 1}
        >التالي ›</button>
      </div>
    </div>
  )
}

// ===== THINKING TRACE PANEL =====
function ThinkingTracePanel({ roles }: { roles: ThinkingTraceRole[] }) {
  const [open, setOpen] = useState(false)
  const filled = roles.filter(r => r.output && r.output !== '—')
  if (!filled.length) return null
  return (
    <div className="dz-thinking-trace">
      <button className="dz-thinking-trace__toggle" onClick={() => setOpen(o => !o)}>
        <span className="dz-thinking-trace__icon">🧠</span>
        <span className="dz-thinking-trace__label">
          {open ? 'إخفاء مراحل التفكير' : `عرض مراحل التفكير (${filled.length} خطوة)`}
        </span>
        <span className="dz-thinking-trace__chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="dz-thinking-trace__steps">
          {roles.map((role, i) => (
            <div
              key={role.id}
              className="dz-thinking-trace__step"
              style={{ '--step-color': role.color, '--step-delay': `${i * 0.07}s` } as React.CSSProperties}
            >
              <span className="dz-thinking-trace__step-emoji">{role.emoji}</span>
              <div className="dz-thinking-trace__step-body">
                <span className="dz-thinking-trace__step-name">{role.nameAr}</span>
                <span className="dz-thinking-trace__step-output" dir="auto">
                  {role.output || '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== NAVIGATION SUGGESTION CARD =====
const DZ_PAGES: Record<string, { icon: string; color: string }> = {
  '/quran':       { icon: '📖', color: '#10a37f' },
  '/tools':       { icon: '🔧', color: '#6366f1' },
  '/web-builder': { icon: '🌐', color: '#0ea5e9' },
  '/dz-tube':     { icon: '🎬', color: '#ef4444' },
  '/dzchat':      { icon: '💬', color: '#f59e0b' },
  '/agent':       { icon: '🤖', color: '#8b5cf6' },
  '/stats':       { icon: '📊', color: '#14b8a6' },
  '/ocr-dz':      { icon: '🔍', color: '#f97316' },
  '/le3ba':       { icon: '🎮', color: '#ec4899' },
  '/':            { icon: '🏠', color: '#64748b' },
}

function NavigationSuggestionCard({
  path, title, description, onYes, onDismiss
}: {
  path: string; title: string; description: string;
  onYes: () => void; onDismiss: () => void;
}) {
  const meta = DZ_PAGES[path] || { icon: '🔗', color: '#10a37f' }
  return (
    <div className="dz-nav-suggestion" dir="rtl">
      <div className="dz-nav-suggestion__header">
        <span className="dz-nav-suggestion__badge">اقتراح تنقل</span>
      </div>
      <div className="dz-nav-suggestion__body">
        <div className="dz-nav-suggestion__icon" style={{ background: `${meta.color}22`, color: meta.color }}>
          {meta.icon}
        </div>
        <div className="dz-nav-suggestion__info">
          <div className="dz-nav-suggestion__title">{title}</div>
          <div className="dz-nav-suggestion__desc">{description}</div>
          <div className="dz-nav-suggestion__path">{path}</div>
        </div>
      </div>
      <div className="dz-nav-suggestion__actions">
        <button className="dz-nav-yes" onClick={onYes} style={{ background: meta.color }}>
          ✅ نعم، خذني هناك
        </button>
        <button className="dz-nav-no" onClick={onDismiss}>
          ❌ لا، شكراً
        </button>
      </div>
    </div>
  )
}

// Parse [NAVIGATE::/path::Title::Description] from AI response content
function parseNavSuggestion(content: string): { path: string; title: string; description: string } | null {
  const match = content.match(/\[NAVIGATE::([^:]+)::([^:]+)::([^\]]+)\]/)
  if (!match) return null
  return { path: match[1].trim(), title: match[2].trim(), description: match[3].trim() }
}

function stripNavSuggestion(content: string): string {
  return content.replace(/\[NAVIGATE::[^\]]+\]/g, '').trim()
}

const RATINGS_KEY = 'dz-msg-ratings'
type RatingVote = 'up' | 'down'
type RatingsStore = Record<string, RatingVote>

function loadRatings(): RatingsStore {
  try { return JSON.parse(localStorage.getItem(RATINGS_KEY) || '{}') } catch { return {} }
}
function persistRating(msgId: string, vote: RatingVote): RatingsStore {
  const store = loadRatings()
  if (store[msgId] === vote) {
    delete store[msgId]
  } else {
    store[msgId] = vote
  }
  try { localStorage.setItem(RATINGS_KEY, JSON.stringify(store)) } catch {}
  return store
}

// ===== PROJECT CONTEXT (session-only, not persisted cross-session) =====
const PROJECT_CTX_KEY = 'dz-project-ctx'

interface ProjectContext {
  stack: string
  lang: string
  files: string[]
  lastAction: string
}


function loadProjectContext(): ProjectContext {
  try { return { stack: '', lang: '', files: [], lastAction: '', ...JSON.parse(sessionStorage.getItem(PROJECT_CTX_KEY) || '{}') } } catch { return { stack: '', lang: '', files: [], lastAction: '' } }
}
function saveProjectContext(patch: Partial<ProjectContext> & { addFile?: string }) {
  try {
    const cur = loadProjectContext()
    const updated: ProjectContext = { ...cur, ...patch }
    if (patch.addFile) updated.files = [...new Set([patch.addFile, ...cur.files])].slice(0, 8)
    delete (updated as unknown as Record<string, unknown>).addFile
    sessionStorage.setItem(PROJECT_CTX_KEY, JSON.stringify(updated))
  } catch {}
}

function extractCodeBlock(text: string): { code: string; lang: string } | null {
  const m = text.match(/```(python|py|javascript|js|typescript|ts)\s*\n([\s\S]*?)```/i)
  if (!m) return null
  const rawLang = m[1].toLowerCase()
  const lang = (rawLang === 'py' || rawLang === 'python') ? 'python'
             : (rawLang === 'typescript' || rawLang === 'ts') ? 'typescript'
             : 'javascript'
  const code = m[2].trim()
  if (!code || code.length < 5) return null
  return { code, lang }
}

function detectCodeLanguage(text: string): string {
  const t = text.toLowerCase()
  if (/typescript|\.tsx|\.ts\b|interface |type /.test(t)) return 'TypeScript'
  if (/\bpython\b|\.py\b|def |import os|pip install|requirements\.txt/.test(t)) return 'Python'
  if (/\bphp\b|\.php|laravel|composer|<\?php/.test(t)) return 'PHP'
  if (/react|jsx|next\.js|nextjs|vite/.test(t)) return 'React'
  if (/\bcss\b|scss|styled-components|tailwind/.test(t)) return 'CSS'
  if (/<!doctype|<html|\.html/.test(t)) return 'HTML'
  if (/\bsql\b|select .* from|create table|sqlite/.test(t)) return 'SQL'
  if (/\bjavascript\b|\.js\b|node\.js|express/.test(t)) return 'JavaScript'
  if (/docker|dockerfile|nginx|bash|shell script/.test(t)) return 'DevOps'
  return ''
}

function detectProjectStack(text: string): string {
  const t = text.toLowerCase()
  if (/next\.js|nextjs/.test(t)) return 'Next.js'
  if (/laravel/.test(t)) return 'Laravel/PHP'
  if (/django/.test(t)) return 'Django'
  if (/fastapi/.test(t)) return 'FastAPI'
  if (/flask/.test(t)) return 'Flask'
  if (/react|vite/.test(t)) return 'React'
  if (/nestjs/.test(t)) return 'NestJS'
  if (/express/.test(t)) return 'Express/Node'
  if (/wordpress/.test(t)) return 'WordPress'
  return ''
}

function extractFileNames(text: string): string[] {
  const matches = text.match(/\b[\w\-.]+\.(tsx?|jsx?|py|php|css|scss|html|sql|json|yaml|yml|md|sh)\b/g) || []
  return [...new Set(matches)].slice(0, 5)
}


// ===== CLIENT-SIDE SUGGESTIONS (Feature I) =====
function generateClientSuggestions(content: string, query: string, ctx?: { isWC2026?: boolean; isSports?: boolean }): string[] {
  const t = (content + ' ' + query).toLowerCase()
  // WC2026 / منتخب جزائر — يأتي أولاً لأنه الأكثر تخصصاً
  if (ctx?.isWC2026 || /كأس\s*العالم|مونديال|wc\s*2026|المجموعة\s*[jج]|الأرجنتين.*جزائر|النمسا.*جزائر|الأردن.*جزائر|متى\s*ستلعب|المباراة\s*القادمة|جدول\s*مباريات\s*الجزائر|نتيجة\s*الجزائر/i.test(t))
    return ['مباريات كأس العالم اليوم', 'نتائج كأس العالم 2026', 'ترتيب مجموعة الجزائر في كأس العالم', 'متى تلعب الجزائر القادمة؟']
  if (ctx?.isSports || /منتخب\s*الجزائري|الخضر|محارب.*صحراء|نتائج\s*الجزائر|مباريات\s*الجزائر/i.test(t))
    return ['مباريات كأس العالم اليوم', 'جدول مباريات الجزائر', 'نتائج كأس العالم 2026', 'من في مجموعة الجزائر؟']
  if (t.includes('كود') || t.includes('python') || t.includes('javascript') || t.includes('برمجة') || t.includes('دالة') || t.includes('function') || t.includes('class') || t.includes('react'))
    return ['اشرح الكود بالتفصيل', 'حسّن هذا الكود وأضف تعليقات', 'اكتب اختبارات لهذا الكود']
  if (t.includes('أخبار') || t.includes('خبر') || t.includes('اليوم') || t.includes('عاجل'))
    return ['عرض المزيد من الأخبار', 'أخبار الاقتصاد الجزائري', 'ما أبرز الأحداث الدولية اليوم؟']
  if (t.includes('رياضة') || t.includes('مباراة') || t.includes('كرة') || t.includes('دوري') || t.includes('هدف'))
    return ['نتائج مباريات اليوم', 'مباريات كأس العالم اليوم', 'جدول ترتيب الدوري']
  if (t.includes('طقس') || t.includes('جو') || t.includes('حرارة') || t.includes('weather'))
    return ['طقس وهران ومدن أخرى', 'توقعات الأسبوع القادم', 'هل سيكون الجو مناسباً للسفر؟']
  if (t.includes('عملة') || t.includes('دولار') || t.includes('يورو') || t.includes('دينار') || t.includes('صرف'))
    return ['سعر اليورو مقابل الدينار', 'تاريخ سعر الصرف الأسبوعي', 'أين أفضل مكان للصرافة؟']
  if (t.includes('github') || t.includes('مستودع') || t.includes('repo') || t.includes('commit'))
    return ['عرض مستودعاتي على GitHub', 'إنشاء مستودع جديد', 'اشرح لي أفضل ممارسات Git']
  if (t.includes('قرآن') || t.includes('آية') || t.includes('سورة') || t.includes('تفسير'))
    return ['تفسير الآية التالية', 'آيات عن الصبر والشكر', 'اذهب لصفحة القرآن الكريم']
  if (t.includes('موقع') || t.includes('html') || t.includes('landing') || t.includes('صفحة'))
    return ['أضف قسم تواصل للموقع', 'اجعل الموقع متجاوباً مع الجوال', 'غيّر الألوان والخطوط']
  if (t.includes('سير') || t.includes('cv') || t.includes('resume') || t.includes('وظيفة'))
    return ['انتقل لمولد السيرة الذاتية', 'كيف أُحسّن سيرتي الذاتية؟', 'أسئلة المقابلات الشائعة']
  if (t.includes('صورة') || t.includes('ارسم') || t.includes('رسم') || t.includes('image') || t.includes('draw'))
    return ['ارسم نسخة مختلفة', 'غيّر الأسلوب لأنيمي', 'غيّر الأسلوب لواقعي ثلاثي الأبعاد']
  if (t.includes('قانون') || t.includes('عقد') || t.includes('قضاء') || t.includes('محامي'))
    return ['ما شروط هذا العقد؟', 'اشرح مصطلح قانوني', 'انتقل لأداة قانونية']
  if (t.includes('صح') || t.includes('طب') || t.includes('مرض') || t.includes('دواء') || t.includes('doctor'))
    return ['البحث عن طبيب قريب', 'ما أعراض هذا المرض؟', 'ما البديل الطبيعي لهذا الدواء؟']
  if (t.includes('excel') || t.includes('جدول') || t.includes('بيانات') || t.includes('إكسل'))
    return ['انتقل لـ DZ Excel', 'كيف أعمل جدول محوري؟', 'اشرح دالة VLOOKUP']
  return ['أخبرني المزيد عن هذا', 'اشرح لي بشكل مبسط', 'أعطني أمثلة عملية']
}

// ===== TYPES =====
type RichType =
  | 'text'
  | 'repos'
  | 'repos-suggest'
  | 'files'
  | 'file-content'
  | 'approval'
  | 'action-log'
  | 'code-analysis'
  | 'repo-selected'
  | 'branches'
  | 'issues'
  | 'pulls'
  | 'stats'
  | 'website'
  | 'map'
  | 'execution'
  | 'youtube'
  | 'web-reader'
  | 'github-profile'
  | 'doctor-results'
  | 'task-plan'
  | 'github-react'
  | 'github-agent'
  | 'image'
  | 'imageGrid'
  | 'qr'
  | 'books'
  | 'presentation'
  | 'tool-redirect'
  | 'find-input'
  | 'smart-repo-suggestion'
  | 'match-card'

type CodeActionType = 'fix_code' | 'explain_error' | 'improve_code' | 'apply_repo_fix' | 'rescan_repo'

type ThinkingStepType = 'read' | 'analyze' | 'write' | 'scan' | 'list' | 'search' | 'commit' | 'pr' | 'deploy'

interface ThinkingStep {
  type: ThinkingStepType
  label: string
}

// ── Smart Loading Phases — مراحل التحميل الذكية حسب نوع السؤال ────────────
const _DZ_PHASES: Record<string, string[]> = {
  news:     ['🔍 جاري البحث في المصادر الجزائرية...', '📰 تحليل المقالات والعناوين...', '📡 التحقق من أحدث المستجدات...', '✍️ صياغة ملخص الأخبار...'],
  currency: ['💱 جاري جلب أسعار الصرف...', '🏦 مقارنة الأسواق الرسمية والموازية...', '📊 تنسيق البيانات المالية...', '✅ إعداد الجدول...'],
  sports:   ['⚽ البحث عن المباريات...', '📡 الاتصال بالمصادر الرياضية...', '🏟️ مراجعة البيانات المباشرة...', '📋 إعداد النتائج...'],
  weather:  ['🌤️ جاري جلب بيانات الطقس...', '🌡️ تحليل درجات الحرارة...', '💨 رياح وتساقط الأمطار...', '📍 تحديد المدينة المطلوبة...'],
  prayer:   ['🕌 جاري حساب مواقيت الصلاة...', '📍 تحديد المنطقة الجغرافية...', '🌙 مراجعة التقويم الهجري...'],
  code:     ['💻 تحليل المشكلة...', '🔍 البحث عن الحل الأمثل...', '🛠️ بناء الحل...', '✅ مراجعة النتيجة...'],
  history:  ['📚 البحث في مصادر تاريخ الجزائر...', '🏛️ تحليل الأحداث والوثائق...', '✍️ صياغة الإجابة...'],
  quran:    ['📖 جاري البحث في القرآن الكريم...', '🌙 تحليل الآيات والتفسير...', '✍️ إعداد الإجابة...'],
  github:   ['🔗 الاتصال بـ GitHub...', '📂 قراءة المستودع...', '🤖 تحليل الكود...', '✍️ إعداد الخطة...'],
  general:  ['🧠.. راني نخمم أصبر شوية', '🔍 البحث عن المعلومات...', '💡 معالجة البيانات...', '✍️ صياغة الإجابة...'],
}
function _detectPhaseCategory(msg: string): keyof typeof _DZ_PHASES {
  const t = msg.toLowerCase()
  if (/أخبار|خبر|مستجدات|عاجل|اليوم.*الجزائر|الجزائر.*اليوم/.test(t)) return 'news'
  if (/سعر|صرف|دولار|يورو|دينار|عملة|ثمن.*دولار|قداش.*دولار|صرف.*اليوم/.test(t)) return 'currency'
  if (/مباراة|مباريات|كرة|دوري|فريق|ماتش|نتيجة.*مبار|ترتيب.*دوري/.test(t)) return 'sports'
  if (/طقس|حرارة|أمطار|جو.*اليوم|تساقط|رياح/.test(t)) return 'weather'
  if (/صلاة|مواقيت|فجر|ظهر|عصر|مغرب|عشاء|أذان/.test(t)) return 'prayer'
  if (/كود|برمجة|خطأ|bug|error|python|javascript|typescript|html|sql|function|class/.test(t)) return 'code'
  if (/تاريخ|استعمار|ثورة|مجاهد|تحرير/.test(t)) return 'history'
  if (/قرآن|آية|سورة|تلاوة|ذكر|حديث|شريعة/.test(t)) return 'quran'
  if (/github|مستودع|repo|كود.*push|pull request|commit/.test(t)) return 'github'
  return 'general'
}
function SmartLoadingPhases({ msg, step }: { msg: string; step: ThinkingStep | null }) {
  const category = useMemo(() => _detectPhaseCategory(msg), [msg])
  const phases = (_DZ_PHASES[category] || _DZ_PHASES.general) as string[]
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    if (step) return
    const t = setInterval(() => {
      setVisible(false)
      setTimeout(() => { setIdx(i => (i + 1) % phases.length); setVisible(true) }, 280)
    }, 2200)
    return () => clearInterval(t)
  }, [phases.length, step])
  const label = step?.label ?? phases[idx]
  return (
    <div className="dz-thinking-step">
      <div className="dz-loading-loop">
        <div className="dz-loop-ring" />
        <div className="dz-loop-dot dz-loop-dot--1" />
        <div className="dz-loop-dot dz-loop-dot--2" />
        <div className="dz-loop-dot dz-loop-dot--3" />
      </div>
      <span className="dz-phase-label" style={{ opacity: visible ? 1 : 0 }}>{label}</span>
    </div>
  )
}

interface BranchItem {
  name: string
  protected: boolean
  sha: string
}

interface IssueItem {
  number: number
  title: string
  state: string
  user: string
  labels: string[]
  created_at: string
  updated_at: string
  html_url: string
  comments: number
}

interface PullItem {
  number: number
  title: string
  state: string
  user: string
  head: string
  base: string
  created_at: string
  updated_at: string
  html_url: string
  draft: boolean
}

interface RepoStats {
  name: string
  stars: number
  forks: number
  watchers: number
  open_issues: number
  size: number
  language: string
  languages: Record<string, number>
  contributors: { login: string; contributions: number }[]
  created_at: string
  updated_at: string
  default_branch: string
}

interface CodeIssue {
  id: string
  line: number | null
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: string
  issue: string
  root_cause: string
  fix: string
  fix_code: string | null
  actions: CodeActionType[]
}

interface CodeImprovement {
  id: string
  title: string
  description: string
  actions: CodeActionType[]
}

interface CodeAnalysisData {
  summary: string
  language: string
  lines: number
  score: number
  issues: CodeIssue[]
  improvements: CodeImprovement[]
  test_suggestions: string[]
  has_repo: boolean
}

interface RepoItem {
  name: string
  full_name: string
  description: string | null
  language: string | null
  private: boolean
  default_branch: string
  html_url: string
}

interface SuggestedRepo {
  full_name: string
  description: string
  stars: number
  language: string
  category: string
  icon: string
  html_url: string
}

interface FileItem {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
}

interface PendingAction {
  type: 'commit' | 'pr'
  repo: string
  path?: string
  content?: string
  message?: string
  branch?: string
  title?: string
  body?: string
  base?: string
}

interface YouTubeVideoData {
  id: string
  url: string
  title: string
  channel: string
  duration: number
  views: number
  thumbnail: string
  publishDate?: string
  tags?: string[]
  description?: string
  captionText?: string
}

interface YouTubeResult {
  id: string
  url: string
  title: string
  channel: string
  duration: number
  views: number
  thumbnail: string
}

interface YouTubeAnalysis {
  ok: boolean
  summary?: string
  keyIdeas?: string[]
  category?: string
  language?: string
  conversationStarters?: string[]
  taskSuggestions?: string[]
  openingMessage?: string
  captionAvailable?: boolean
}

interface DZMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  richType?: RichType
  repos?: RepoItem[]
  files?: FileItem[]
  fileContent?: { path: string; content: string; repo: string }
  codeAnalysis?: { data: CodeAnalysisData; filePath: string; fileContent: string; repo: string }
  pendingAction?: PendingAction
  actionLog?: ActionLogEntry[]
  isError?: boolean
  isStreaming?: boolean
  showDevCard?: boolean
  selectedRepo?: RepoItem
  branches?: BranchItem[]
  issues?: IssueItem[]
  pulls?: PullItem[]
  stats?: RepoStats
  htmlCode?: string
  cssCode?: string
  jsCode?: string
  mapHtml?: string
  mapMeta?: Record<string, unknown>
  webBuilderMeta?: { type: string; style: string; title: string; description: string; icon: string }
  suggestedRepos?: SuggestedRepo[]
  hasMoreNews?: boolean
  newsQuery?: string
  newsItems?: { title: string; url: string; date?: string; source?: string; snippet?: string }[]
  executionLang?: string
  executionCode?: string
  webReaderIntent?: 'build' | 'reader' | 'update' | 'extract'
  zipDownloadUrl?: string
  youtubeVideo?: YouTubeVideoData
  youtubeResults?: YouTubeResult[]
  youtubeFlow?: 'url' | 'search'
  youtubeAnalysis?: YouTubeAnalysis
  youtubeSuggestions?: string[]
  quickSuggestions?: string[]
  captionNote?: string
  captionText?: string
  webReaderSiteInfo?: { url: string; title: string; domain: string; description: string; headings: string[] }
  githubProfile?: {
    login: string; name: string; avatar: string; url: string; repos: number;
    bio?: string | null; company?: string | null; location?: string | null;
    followers?: number; following?: number; joinYear?: string | number;
  } | null
  model?: string
  doctors?: DoctorResult[]
  dirs?: DirLink[]
  doctorMeta?: { speciality: { ar: string; fr: string }; city: { ar: string; fr: string }; hasGps?: boolean; cached?: boolean; byName?: boolean; queryName?: string }
  dua?: string
  thinkingTrace?: ThinkingTraceRole[]
  reactSteps?: import('./GitHubReActPanel').ReActStep[]
  // GitHub Agent
  ghAgentRepo?: string
  ghAgentAnalysis?: string
  ghAgentPlan?: string
  ghAgentExecution?: string
  ghAgentGitOutput?: { branch: string; commit: string; prTitle: string; prBody: string }
  ghAgentFiles?: { path: string; lines: number }[]
  ghAgentFileContents?: { path: string; content: string }[]
  ghAgentExecutionReport?: {
    branch: string; filesCommitted: string[]; prUrl: string; errors: string[]
    vercelTriggered: boolean; vercelDeployId?: string | null
  } | null
  navigateSuggestion?: { path: string; title: string; description: string }
  ghAgentAutoExecute?: boolean
  ghAgentRawText?: string
  smartRepoSuggestions?: Array<{ url: string; name: string; owner: string; category: string; descAr: string; install: { type: string; pkg: string }; starterFiles: Record<string, string>; score?: number }>
  taskPlan?: TaskPlan
  taskPlanQuery?: string
  claudeMode?: boolean
  responseTime?: number
  imageUrl?: string
  imagePrompt?: string
  imageModel?: string
  imageStyle?: string
  imageGrid?: string[]
  imageGridFull?: Array<{ url: string; fullUrl?: string; title: string; source?: string; sourceUrl?: string; creator?: string }>
  videoUrl?: string
  videoPrompt?: string
  videoModel?: string
  qrData?: string
  qrTitle?: string
  books?: Array<{
    key: string; title: string; authors: string[];
    year: number | null; cover: string | null;
    pages: number | null; subjects: string[]; url: string | null;
  }>
  booksQuery?: string
  booksTotal?: number
  androidBuildMeta?: {
    appName: string
    packageName: string
    repoUrl: string
    actionsUrl: string
    releasesUrl: string
    filesCount: number
    status: 'building' | 'done' | 'error'
    error?: string
  }
  slides?: Array<{ title: string; bullets: string[]; icon: string; note?: string }>
  presentationTitle?: string
  presentationSubtitle?: string
  presentationColor?: string
  toolRedirect?: {
    toolName: string
    toolUrl: string
    toolIcon: string
    toolDesc: string
    message: string
    smartMessage?: string
    id?: string
    stations?: Array<{ name: string; icon: string }>
  }
  actionButtons?: Array<{ label: string; cmd: string }>
  findRepo?: string
  matchVsMeta?: { team1: string; team2: string; temporal: string; date?: string | null; time?: string | null; competition?: string | null; venue?: string | null; city?: string | null; round?: string | null; kooraLink?: string | null; homeScore?: number | null; awayScore?: number | null }
  wc2026?: {
    group?: string
    nextMatch?: Record<string, unknown>
    fixtures?: Array<Record<string, unknown>>
    [key: string]: unknown
  }
  _sportsAgent?: boolean
  _nationalTeam?: boolean
  matches?: Array<Record<string, unknown>>
  wcGroupData?: {
    groupLetter: string
    groupLabel: string
    groupLabelEn: string
    teams: Array<{ name: string; flag: string; fifa_rank: number | null }>
    fixtures: Array<{
      date: string; homeTeam: string; awayTeam: string
      homeTeamEn?: string; awayTeamEn?: string
      homeScore: number | null; awayScore: number | null
      statusType: string; round: string; city?: string; venue?: string
      startTime?: string; kooraLink?: string
    }> | null
    competition: string
    source: string
  }
}

interface ActionLogEntry {
  timestamp: string
  type: string
  description: string
  status: 'success' | 'error' | 'pending'
  repo?: string
}

// ===== HELPERS =====
function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// ===== SMART STUDY CARD (Auto-index from eddirasa.com) =====

interface EddirasaIndexItem {
  title: string
  url: string
  snippet: string
  isPdf: boolean
  term?: string
}

const STUDY_CYCLES = [
  { id: 'primary',   label: 'ابتدائي', years: ['Primary 1','Primary 2','Primary 3','Primary 4','Primary 5'] },
  { id: 'middle',    label: 'متوسط',   years: ['Middle 1','Middle 2','Middle 3','Middle 4 (BEM)'] },
  { id: 'secondary', label: 'ثانوي',   years: ['Secondary 1','Secondary 2','Secondary 3 (Baccalaureate)'] },
]

const CYCLE_YEAR_LABELS: Record<string, string[]> = {
  primary:   ['1 ابتدائي','2 ابتدائي','3 ابتدائي','4 ابتدائي','5 ابتدائي'],
  middle:    ['1 متوسط','2 متوسط','3 متوسط','4 متوسط (BEM)'],
  secondary: ['1 ثانوي','2 ثانوي','3 ثانوي (بكالوريا)'],
}

const STUDY_SUBJECTS_AR = [
  { id: 'Math',               label: 'رياضيات' },
  { id: 'Physics',            label: 'فيزياء' },
  { id: 'Arabic',             label: 'عربية' },
  { id: 'French',             label: 'فرنسية' },
  { id: 'English',            label: 'إنجليزية' },
  { id: 'Science',            label: 'علوم' },
  { id: 'History / Geography',label: 'تاريخ/جغرافيا' },
  { id: 'Islamic',            label: 'إسلامية' },
  { id: 'Philosophy',         label: 'فلسفة' },
]

const CYCLE_ID_TO_LEVEL: Record<string, string> = {
  primary: 'Primary',
  middle: 'Middle',
  secondary: 'Secondary',
}

const TERM_LABELS: Record<string, string> = {
  '': 'كل الفصول',
  '1': 'الفصل 1',
  '2': 'الفصل 2',
  '3': 'الفصل 3',
}

function SmartStudyCard({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void
  disabled: boolean
}) {
  const navigate = useNavigate()
  const [cycle, setCycle] = useState('middle')
  const [yearIndex, setYearIndex] = useState(3)
  const [subject, setSubject] = useState('Math')
  const [term, setTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalResults, setTotalResults] = useState(0)
  const [indexItems, setIndexItems] = useState<EddirasaIndexItem[]>([])
  const [indexLoading, setIndexLoading] = useState(false)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentCycle = STUDY_CYCLES.find(c => c.id === cycle)!
  const currentLevel = currentCycle.years[Math.min(yearIndex, currentCycle.years.length - 1)]
  const levelBase = CYCLE_ID_TO_LEVEL[cycle] || cycle
  const yearNum = String(yearIndex + 1)
  const subjectLabel = STUDY_SUBJECTS_AR.find(s => s.id === subject)?.label || subject

  const fetchIndex = useCallback(async (
    lvl: string, yr: string, subj: string, trm: string, pg: number
  ) => {
    setIndexLoading(true)
    setIndexError(null)
    setHasFetched(false)
    try {
      const res = await fetch('/api/dz-agent/education/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: lvl, year: yr, subject: subj, term: trm, page: pg }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'فشل في جلب الفهرس')
      setIndexItems(Array.isArray(data.items) ? data.items : [])
      setTotalResults(data.total ?? 0)
      setTotalPages(data.totalPages ?? 1)
      setCurrentPage(data.page ?? 1)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ غير معروف'
      setIndexError(msg)
      setIndexItems([])
      setTotalResults(0)
      setTotalPages(1)
    } finally {
      setIndexLoading(false)
      setHasFetched(true)
    }
  }, [])

  useEffect(() => {
    setCurrentPage(1)
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current)
    fetchTimerRef.current = setTimeout(() => fetchIndex(levelBase, yearNum, subject, term, 1), 700)
    return () => { if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current) }
  }, [cycle, yearIndex, subject, term, fetchIndex])

  const goToPage = (pg: number) => {
    setCurrentPage(pg)
    fetchIndex(levelBase, yearNum, subject, term, pg)
  }

  const handleSolve = (item: EddirasaIndexItem) => {
    const termInfo = item.term ? ` — الفصل ${item.term}` : ''
    onSend(`حل هذا التمرين خطوة بخطوة.\n📚 المستوى: ${currentLevel}${termInfo} — المادة: ${subjectLabel}\n📌 العنوان: ${item.title}\n🔗 المصدر: ${item.url}${item.snippet ? `\n\nالمحتوى: ${item.snippet}` : ''}`)
  }

  const handleExplain = (item: EddirasaIndexItem) => {
    const termInfo = item.term ? ` — الفصل ${item.term}` : ''
    onSend(`اشرح هذا الدرس ببساطة مع أمثلة وتمارين تدريبية.\n📚 المستوى: ${currentLevel}${termInfo} — المادة: ${subjectLabel}\n📌 العنوان: ${item.title}\n🔗 المصدر: ${item.url}${item.snippet ? `\n\nالمحتوى: ${item.snippet}` : ''}`)
  }

  const handleDeepSeekPdf = (item: EddirasaIndexItem) => {
    try { sessionStorage.setItem('dz-transfer-deepseek', JSON.stringify({ url: item.url, title: item.title })) } catch {}
    navigate('/?model=deepseek-pdf')
  }

  const changeCycle = (id: string) => {
    setCycle(id)
    setYearIndex(0)
    setTerm('')
    setCurrentPage(1)
    setIndexItems([])
    setHasFetched(false)
  }

  return (
    <div className="dz-smart-study">
      <div className="dz-smart-study-head">
        <div className="dz-smart-study-icon"><BookOpen size={18} /></div>
        <div>
          <div className="dz-smart-study-title">المركز التعليمي — eddirasa.com</div>
          <div className="dz-smart-study-sub">اختر الطور والسنة والمادة لعرض المحتوى المطابق فقط</div>
        </div>
      </div>

      {/* Cycle (طور) tabs */}
      <div className="dz-cycle-tabs">
        {STUDY_CYCLES.map(c => (
          <button
            key={c.id}
            className={`dz-cycle-tab ${cycle === c.id ? 'dz-cycle-tab--active' : ''}`}
            onClick={() => changeCycle(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Year (سنة) pills */}
      <div className="dz-smart-section-label">السنة الدراسية</div>
      <div className="dz-year-pills">
        {currentCycle.years.map((y, i) => (
          <button
            key={y}
            className={`dz-year-pill ${yearIndex === i ? 'dz-year-pill--active' : ''}`}
            onClick={() => { setYearIndex(i); setCurrentPage(1) }}
          >
            {CYCLE_YEAR_LABELS[cycle]?.[i] || y}
          </button>
        ))}
      </div>

      {/* Subject (مادة) pills */}
      <div className="dz-smart-section-label">المادة</div>
      <div className="dz-subject-pills">
        {STUDY_SUBJECTS_AR.map(s => (
          <button
            key={s.id}
            className={`dz-subject-pill ${subject === s.id ? 'dz-subject-pill--active' : ''}`}
            onClick={() => { setSubject(s.id); setCurrentPage(1) }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Term (فصل) pills */}
      <div className="dz-smart-section-label">الفصل الدراسي</div>
      <div className="dz-term-pills">
        {Object.entries(TERM_LABELS).map(([key, label]) => (
          <button
            key={key}
            className={`dz-term-pill ${term === key ? 'dz-term-pill--active' : ''}`}
            onClick={() => { setTerm(key); setCurrentPage(1) }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Index results */}
      <div className="dz-index-section">
        {indexLoading && (
          <div className="dz-index-loading">
            <Loader2 size={15} className="dz-spin" />
            <span>جلب النتائج المطابقة من eddirasa.com...</span>
          </div>
        )}
        {indexError && !indexLoading && (
          <div className="dz-index-error">
            <AlertCircle size={13} />
            <span>{indexError}</span>
          </div>
        )}
        {!indexLoading && !indexError && hasFetched && indexItems.length === 0 && (
          <div className="dz-index-empty">
            <p>لم يتم العثور على محتوى مطابق لهذا الاختيار من eddirasa.com.</p>
            <span>يمكنك الكتابة مباشرةً في خانة الدردشة أدناه.</span>
          </div>
        )}
        {!indexLoading && indexItems.length > 0 && (
          <div className="dz-index-list">
            <div className="dz-index-list-header">
              <BookOpen size={12} />
              <span>
                {totalResults} نتيجة — {currentLevel} · {subjectLabel}
                {term ? ` · الفصل ${term}` : ''}
                {totalPages > 1 ? ` (صفحة ${currentPage} من ${totalPages})` : ''}
              </span>
            </div>
            {indexItems.map((item, i) => (
              <div key={i} className={`dz-index-item ${item.isPdf ? 'dz-index-item--pdf' : ''}`}>
                <a
                  className="dz-index-item-title"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.isPdf && <span className="dz-pdf-tag">PDF</span>}
                  {item.term && <span className="dz-term-tag">ف{item.term}</span>}
                  <span>{item.title}</span>
                  <ExternalLink size={10} className="dz-ext-icon" />
                </a>
                {item.snippet && <p className="dz-index-item-snippet">{item.snippet}</p>}
                <div className="dz-idx-actions">
                  <button className="dz-idx-btn dz-idx-btn--solve" onClick={() => handleSolve(item)} disabled={disabled}>
                    <Brain size={11} /> حل مع AI
                  </button>
                  <button className="dz-idx-btn dz-idx-btn--explain" onClick={() => handleExplain(item)} disabled={disabled}>
                    <BookOpen size={11} /> شرح
                  </button>
                  <button className="dz-idx-btn dz-idx-btn--open" onClick={() => window.open(item.url,'_blank','noopener,noreferrer')}>
                    <ExternalLink size={11} /> فتح
                  </button>
                  {item.isPdf && (
                    <>
                      <button className="dz-idx-btn dz-idx-btn--pdf" onClick={() => window.open(item.url,'_blank','noopener,noreferrer')}>
                        <Download size={11} /> تحميل PDF
                      </button>
                      <button className="dz-idx-btn dz-idx-btn--deepseek" onClick={() => handleDeepSeekPdf(item)}>
                        <ArrowRight size={11} /> DeepSeek PDF
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="dz-pagination">
                <button
                  className="dz-page-btn"
                  disabled={currentPage <= 1 || indexLoading}
                  onClick={() => goToPage(currentPage - 1)}
                >
                  ‹ السابق
                </button>
                <span className="dz-page-info">{currentPage} / {totalPages}</span>
                <button
                  className="dz-page-btn"
                  disabled={currentPage >= totalPages || indexLoading}
                  onClick={() => goToPage(currentPage + 1)}
                >
                  التالي ›
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="dz-smart-hint">
        💬 يمكنك أيضاً الكتابة مباشرةً في خانة الدردشة دون الحاجة لاختيار مستوى
      </div>
    </div>
  )
}

// ===== CODE ANALYSIS PANEL =====
const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string; icon: React.ReactNode }> = {
  critical: { color: '#f87171', bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.25)', label: 'حرج', icon: <ShieldAlert size={12} /> },
  high:     { color: '#fb923c', bg: 'rgba(251,146,60,0.07)',  border: 'rgba(251,146,60,0.25)',  label: 'عالي', icon: <Bug size={12} /> },
  medium:   { color: '#facc15', bg: 'rgba(250,204,21,0.07)',  border: 'rgba(250,204,21,0.25)',  label: 'متوسط', icon: <AlertCircle size={12} /> },
  low:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.07)',  border: 'rgba(96,165,250,0.25)',  label: 'منخفض', icon: <Gauge size={12} /> },
  info:     { color: '#a78bfa', bg: 'rgba(167,139,250,0.07)', border: 'rgba(167,139,250,0.25)', label: 'معلومة', icon: <Info size={12} /> },
}

const ACTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  fix_code:       { label: 'إصلاح', icon: <Wrench size={11} />, cls: 'ca-btn ca-btn--fix' },
  explain_error:  { label: 'شرح', icon: <Info size={11} />, cls: 'ca-btn ca-btn--explain' },
  improve_code:   { label: 'تحسين', icon: <Lightbulb size={11} />, cls: 'ca-btn ca-btn--improve' },
  apply_repo_fix: { label: 'Diff', icon: <GitBranch size={11} />, cls: 'ca-btn ca-btn--diff' },
  rescan_repo:    { label: 'إعادة الفحص', icon: <ScanSearch size={11} />, cls: 'ca-btn ca-btn--rescan' },
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#4ade80' : score >= 60 ? '#facc15' : score >= 40 ? '#fb923c' : '#f87171'
  const r = 22, circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  return (
    <div className="ca-score-ring">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#1a1a1a" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 28 28)" style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <span className="ca-score-num" style={{ color }}>{score}</span>
    </div>
  )
}

function CodeAnalysisPanel({
  data, filePath, onAction
}: {
  data: CodeAnalysisData
  filePath: string
  fileContent: string
  repo: string
  onAction: (action: CodeActionType, issue?: CodeIssue | CodeImprovement) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const critCount = data.issues.filter(i => i.severity === 'critical' || i.severity === 'high').length
  const medCount  = data.issues.filter(i => i.severity === 'medium').length

  return (
    <div className="ca-root">
      {/* Header */}
      <div className="ca-header">
        <div className="ca-header-left">
          <span className="ca-file-name">{filePath.split('/').pop()}</span>
          <span className="ca-lang-badge">{data.language}</span>
          <span className="ca-lines">{data.lines} سطر</span>
        </div>
        <ScoreRing score={data.score} />
      </div>

      {/* Summary */}
      <p className="ca-summary">{data.summary}</p>

      {/* Stats */}
      <div className="ca-stats">
        <div className="ca-stat ca-stat--red">
          <ShieldAlert size={13} /><span>{critCount} حرج/عالي</span>
        </div>
        <div className="ca-stat ca-stat--yellow">
          <Bug size={13} /><span>{medCount} متوسط</span>
        </div>
        <div className="ca-stat ca-stat--blue">
          <Lightbulb size={13} /><span>{data.improvements.length} تحسينات</span>
        </div>
        <button className="ca-stat ca-stat--rescan" onClick={() => onAction('rescan_repo')}>
          <ScanSearch size={12} /> إعادة الفحص
        </button>
      </div>

      {/* Issues */}
      {data.issues.length > 0 && (
        <div className="ca-section">
          <div className="ca-section-title"><Bug size={13} /> المشاكل المكتشفة ({data.issues.length})</div>
          <div className="ca-issues-list">
            {data.issues.map(issue => {
              const sev = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.info
              const isOpen = expanded.has(issue.id)
              return (
                <div key={issue.id} className="ca-issue" style={{ '--sev-color': sev.color, '--sev-bg': sev.bg, '--sev-border': sev.border } as React.CSSProperties}>
                  <button className="ca-issue-header" onClick={() => toggle(issue.id)}>
                    <span className="ca-sev-badge" style={{ color: sev.color, background: sev.bg, border: `1px solid ${sev.border}` }}>
                      {sev.icon} {sev.label}
                    </span>
                    {issue.line && <span className="ca-line-num">L{issue.line}</span>}
                    <span className="ca-issue-title">{issue.issue}</span>
                    <ChevronDown size={13} className={`ca-chevron ${isOpen ? 'ca-chevron--open' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="ca-issue-body">
                      <div className="ca-detail"><span className="ca-detail-label">السبب:</span> {issue.root_cause}</div>
                      <div className="ca-detail"><span className="ca-detail-label">الإصلاح:</span> {issue.fix}</div>
                      {issue.fix_code && (
                        <pre className="ca-code-snippet"><code>{issue.fix_code}</code></pre>
                      )}
                      <div className="ca-action-row">
                        {(issue.actions || []).map(act => {
                          const cfg = ACTION_CONFIG[act]
                          if (!cfg) return null
                          return (
                            <button key={act} className={cfg.cls} onClick={() => onAction(act, issue)}>
                              {cfg.icon} {cfg.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Improvements */}
      {data.improvements.length > 0 && (
        <div className="ca-section">
          <div className="ca-section-title"><Lightbulb size={13} /> اقتراحات التحسين</div>
          <div className="ca-issues-list">
            {data.improvements.map(imp => (
              <div key={imp.id} className="ca-issue ca-issue--improve">
                <button className="ca-issue-header" onClick={() => toggle(imp.id)}>
                  <span className="ca-sev-badge ca-sev-badge--green"><Lightbulb size={11} /> تحسين</span>
                  <span className="ca-issue-title">{imp.title}</span>
                  <ChevronDown size={13} className={`ca-chevron ${expanded.has(imp.id) ? 'ca-chevron--open' : ''}`} />
                </button>
                {expanded.has(imp.id) && (
                  <div className="ca-issue-body">
                    <div className="ca-detail">{imp.description}</div>
                    <div className="ca-action-row">
                      {(imp.actions || []).map(act => {
                        const cfg = ACTION_CONFIG[act]
                        if (!cfg) return null
                        return (
                          <button key={act} className={cfg.cls} onClick={() => onAction(act, imp)}>
                            {cfg.icon} {cfg.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tests */}
      {data.test_suggestions.length > 0 && (
        <div className="ca-section">
          <div className="ca-section-title"><Terminal size={13} /> اقتراحات الاختبار</div>
          <ul className="ca-tests-list">
            {data.test_suggestions.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}

      {data.issues.length === 0 && data.improvements.length === 0 && (
        <div className="ca-clean"><CheckCircle2 size={18} /> الكود نظيف — لا مشاكل مكتشفة</div>
      )}
    </div>
  )
}

// ===== CODE BLOCK =====
// ── Web Reader Intent Badge ────────────────────────────────────────────────
function WebReaderIntentBadge({ intent }: { intent: 'build' | 'reader' | 'update' | 'extract' }) {
  const config = {
    build:   { icon: <Hammer size={12} />,   label: 'Build Mode',   color: '#22c55e', bg: '#052e16' },
    reader:  { icon: <Monitor size={12} />,  label: 'Reader Mode',  color: '#38bdf8', bg: '#082f49' },
    update:  { icon: <Layers size={12} />,   label: 'Update Mode',  color: '#f59e0b', bg: '#1c1008' },
    extract: { icon: <FileText size={12} />, label: 'Extract HTML', color: '#a855f7', bg: '#2e1065' },
  }[intent]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      color: config.color, background: config.bg, border: `1px solid ${config.color}40`,
      marginBottom: 6,
    }}>
      {config.icon} 🌐 {config.label}
    </span>
  )
}

function DZCodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const language = className?.replace('language-', '') || ''
  const codeText = String(children).replace(/\n$/, '')
  const isHtml = language === 'html' || language === 'htm' ||
    (codeText.includes('<html') && codeText.includes('</html>'))

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const ext = language || 'txt'
    const mime = language === 'html' ? 'text/html' : language === 'css' ? 'text/css' :
      language === 'js' || language === 'javascript' ? 'text/javascript' :
      language === 'python' || language === 'py' ? 'text/x-python' : 'text/plain'
    const blob = new Blob([codeText], { type: mime })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dz-agent-code.${ext}`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(a.href)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2500)
  }

  return (
    <div className="dz-code-block">
      <div className="dz-code-block-header">
        <span className="dz-code-lang">{language || 'code'}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {isHtml && (
            <button className="dz-code-copy-btn" onClick={() => setShowPreview(p => !p)} title="معاينة في الإطار">
              <Monitor size={13} />
              {showPreview ? 'إخفاء' : 'معاينة'}
            </button>
          )}
          <button className="dz-code-copy-btn" onClick={handleDownload} title="تحميل الملف">
            {downloaded ? <Check size={13} /> : <Download size={13} />}
            {downloaded ? 'تم' : 'تحميل'}
          </button>
          <button className="dz-code-copy-btn" onClick={handleCopy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre><code className={className}>{children}</code></pre>
      {isHtml && showPreview && (
        <div style={{ marginTop: 8, borderRadius: 8, overflow: 'hidden', border: '1px solid #2a2a3e' }}>
          <WebsitePreview htmlCode={codeText} />
        </div>
      )}
    </div>
  )
}

// ===== CLONE PROGRESS PANEL =====

interface CloneProgressState {
  stage: string
  pct: number
  label: string
  url: string
  tech?: string[]
  sections?: string[]
}

// Map backend SSE stages → 4 visual steps
const STAGE_TO_VISUAL: Record<string, number> = {
  fetch: 0, extract: 1, generate: 2, repair: 2, download: 2, done: 3,
}

const CLONE_STAGES = [
  {
    id: 'fetch',
    visual: 0,
    icon: '🧠',
    iconAnim: 'brain',
    labelAr: 'يفكر',
    subAr: 'تحليل الطلب وتجهيز الخطة...',
    thinkLabel: 'راني نخمم، أصبر...',
  },
  {
    id: 'extract',
    visual: 1,
    icon: '🔎',
    iconAnim: 'scan',
    labelAr: 'معاينة وفحص',
    subAr: 'فحص الألوان، الخطوط، الهيكل، الصور...',
    thinkLabel: 'جارٍ فحص الموقع...',
  },
  {
    id: 'generate',
    visual: 2,
    icon: '✍️',
    iconAnim: 'write',
    labelAr: 'يكتب الكود',
    subAr: 'الذكاء الاصطناعي يبني الاستنساخ...',
    thinkLabel: 'جارٍ كتابة الكود...',
  },
  {
    id: 'done',
    visual: 3,
    icon: '✅',
    iconAnim: 'done',
    labelAr: 'تم الاستنساخ',
    subAr: 'الموقع المستنسخ جاهز!',
    thinkLabel: 'اكتمل!',
  },
]

function CloneProgressPanel({ progress }: { progress: CloneProgressState }) {
  const visualIdx = STAGE_TO_VISUAL[progress.stage] ?? 0
  const VISUAL_STAGES = [CLONE_STAGES[0], CLONE_STAGES[1], CLONE_STAGES[2], CLONE_STAGES[3]]
  const activeStage = VISUAL_STAGES[visualIdx]
  let domain = progress.url
  try { domain = new URL(progress.url).hostname } catch {}

  return (
    <div className="dz-clone-progress">
      {/* Animated background glow */}
      <div className="dz-clone-progress__glow" />

      {/* Header */}
      <div className="dz-clone-progress__header">
        <div className="dz-clone-progress__logo">
          <span className="dz-clone-progress__logo-icon">🧬</span>
          <div>
            <span className="dz-clone-progress__title">محرك الاستنساخ V2</span>
            <span className="dz-clone-progress__domain">{domain}</span>
          </div>
        </div>
        <span className="dz-clone-progress__pct">{progress.pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="dz-clone-progress__bar-track">
        <div
          className="dz-clone-progress__bar-fill"
          style={{ width: `${Math.max(3, progress.pct)}%` }}
        />
      </div>

      {/* 4-stage visual pipeline */}
      <div className="dz-clone-progress__stages">
        {VISUAL_STAGES.map((s, i) => {
          const isDone    = i < visualIdx
          const isCurrent = i === visualIdx
          const isPending = i > visualIdx
          return (
            <div
              key={s.id}
              className={`dz-clone-stage${isDone ? ' dz-clone-stage--done' : ''}${isCurrent ? ' dz-clone-stage--active' : ''}${isPending ? ' dz-clone-stage--pending' : ''}`}
            >
              <div className={`dz-clone-stage__icon dz-clone-stage__icon--${s.iconAnim}${isCurrent ? ' is-active' : ''}`}>
                {isDone ? '✅' : s.icon}
              </div>
              <div className="dz-clone-stage__text">
                <span className="dz-clone-stage__label">{s.labelAr}</span>
                {isCurrent && <span className="dz-clone-stage__think">{s.subAr}</span>}
              </div>
              {isCurrent && (
                <div className="dz-clone-stage__dots">
                  <span /><span /><span />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Tech / Sections chips */}
      {(progress.tech?.length || progress.sections?.length) ? (
        <div className="dz-clone-progress__chips">
          {progress.tech?.slice(0, 5).map(t => (
            <span key={t} className="dz-clone-chip dz-clone-chip--tech">🔬 {t}</span>
          ))}
          {progress.sections?.slice(0, 4).map(s => (
            <span key={s} className="dz-clone-chip dz-clone-chip--section">📐 {s}</span>
          ))}
        </div>
      ) : null}

      {/* Status footer */}
      <div className="dz-clone-progress__status">
        <Loader2 size={11} className="dz-spin" style={{ opacity: 0.5 }} />
        <span>{progress.label || activeStage.thinkLabel}</span>
      </div>
    </div>
  )
}

// ===== WEB READER DETECT PANEL =====

function WebReaderPanel({
  siteInfo,
  onAnalyze,
  onExtract,
  onAdvancedClone,
  onOpenInBuilder,
  isAdvancedLoading,
}: {
  siteInfo: { url: string; title: string; domain: string; description: string; headings: string[] }
  onAnalyze: () => void
  onExtract: () => void
  onAdvancedClone: (section?: string) => void
  onOpenInBuilder: () => void
  isAdvancedLoading: boolean
}) {
  const [showSections, setShowSections] = useState(false)

  return (
    <div className="dzc-wr-panel">
      <div className="dzc-wr-site-row">
        <span className="dzc-wr-site-globe">🌐</span>
        <div className="dzc-wr-site-meta">
          <div className="dzc-wr-site-title">{siteInfo.title || siteInfo.domain}</div>
          <div className="dzc-wr-site-domain">{siteInfo.domain}</div>
        </div>
        <a href={siteInfo.url} target="_blank" rel="noopener noreferrer" className="dzc-wr-site-link">↗</a>
      </div>
      {siteInfo.description && (
        <p className="dzc-wr-desc">
          {siteInfo.description.slice(0, 180)}{siteInfo.description.length > 180 ? '…' : ''}
        </p>
      )}
      {siteInfo.headings.length > 0 && (
        <div className="dzc-wr-headings">
          {siteInfo.headings.map((h, i) => (
            <span key={i} className="dzc-wr-heading-tag">{h.slice(0, 55)}</span>
          ))}
        </div>
      )}
      <hr className="dzc-wr-divider" />
      <p className="dzc-wr-hint">اختر ما تريد فعله بهذا الموقع:</p>
      <div className="dzc-wr-actions dzc-wr-actions--3">
        <button className="dzc-wr-btn dzc-wr-btn--analyze" onClick={onAnalyze}>
          <span className="dzc-wr-btn-icon">🔍</span>
          <div className="dzc-wr-btn-text">
            <span className="dzc-wr-btn-title">تحليل معمّق</span>
            <span className="dzc-wr-btn-desc">تحليل شامل للمحتوى والهيكل والجمهور</span>
          </div>
        </button>
        <button className="dzc-wr-btn dzc-wr-btn--builder" onClick={onOpenInBuilder}>
          <span className="dzc-wr-btn-icon">🏗️</span>
          <div className="dzc-wr-btn-text">
            <span className="dzc-wr-btn-title">استنساخ في Web Builder</span>
            <span className="dzc-wr-btn-desc">فتح محرر المواقع مع الاستنساخ التلقائي</span>
          </div>
        </button>
        <button className="dzc-wr-btn dzc-wr-btn--extract" onClick={onExtract}>
          <span className="dzc-wr-btn-icon">📋</span>
          <div className="dzc-wr-btn-text">
            <span className="dzc-wr-btn-title">استخراج المحتوى</span>
            <span className="dzc-wr-btn-desc">عناوين، نصوص، وروابط منظمة</span>
          </div>
        </button>
      </div>

      {/* ── Advanced Clone Engine V2 ── */}
      <div className="dzc-wr-advanced-block">
        <div className="dzc-wr-advanced-header">
          <span className="dzc-wr-advanced-badge">🧬 V2</span>
          <span className="dzc-wr-advanced-title">Ultra Website Cloning System</span>
          <span className="dzc-wr-advanced-sub">
            استنساخ شبه مثالي — كشف Stack تقني · جلب متعدد الاستراتيجيات · دقة 90–98% · إصلاح تلقائي
          </span>
        </div>
        <div className="dzc-wr-v2-features">
          <span className="dzc-wr-v2-chip">🔬 كشف Framework</span>
          <span className="dzc-wr-v2-chip">🌐 3 مصادر جلب</span>
          <span className="dzc-wr-v2-chip">📡 تقدم لحظي</span>
          <span className="dzc-wr-v2-chip">🔧 إصلاح تلقائي</span>
        </div>
        <div className="dzc-wr-advanced-actions">
          <button
            className="dzc-wr-btn dzc-wr-btn--advanced"
            onClick={() => onAdvancedClone('full')}
            disabled={isAdvancedLoading}
          >
            {isAdvancedLoading
              ? <><Loader2 size={14} className="dz-spin" /><div className="dzc-wr-btn-text"><span className="dzc-wr-btn-title">جارٍ الاستنساخ...</span><span className="dzc-wr-btn-desc">تحليل الموقع وبناء الاستنساخ</span></div></>
              : <><span className="dzc-wr-btn-icon">🎯</span><div className="dzc-wr-btn-text"><span className="dzc-wr-btn-title">استنساخ V2 (كامل)</span><span className="dzc-wr-btn-desc">دقة شبه مثالية — DOM + CSS + Stack + ألوان</span></div></>
            }
          </button>
          <button
            className="dzc-wr-btn dzc-wr-btn--sections-toggle"
            onClick={() => setShowSections(p => !p)}
            disabled={isAdvancedLoading}
          >
            <span className="dzc-wr-btn-icon">🧩</span>
            <div className="dzc-wr-btn-text">
              <span className="dzc-wr-btn-title">استنساخ قسم محدد</span>
              <span className="dzc-wr-btn-desc">{showSections ? 'إخفاء الأقسام ↑' : 'Navbar / Hero / Footer / Features ↓'}</span>
            </div>
          </button>
        </div>
        {showSections && (
          <div className="dzc-wr-section-pills">
            {[
              { id: 'navbar',       icon: '🔲', label: 'Navbar فقط' },
              { id: 'hero',         icon: '🚀', label: 'Hero فقط' },
              { id: 'features',     icon: '✨', label: 'الميزات' },
              { id: 'pricing',      icon: '💰', label: 'الأسعار' },
              { id: 'testimonials', icon: '⭐', label: 'الآراء' },
              { id: 'footer',       icon: '🔻', label: 'Footer فقط' },
            ].map(s => (
              <button
                key={s.id}
                className="dzc-wr-section-pill"
                onClick={() => { onAdvancedClone(s.id); setShowSections(false) }}
                disabled={isAdvancedLoading}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ===== WEBSITE PREVIEW =====
type WPViewport = 'mobile' | 'tablet' | 'desktop'
const WP_VIEWPORTS: { id: WPViewport; label: string; icon: string; width: string }[] = [
  { id: 'mobile',  label: 'موبايل',  icon: '📱', width: '375px'  },
  { id: 'tablet',  label: 'تابلت',   icon: '📟', width: '768px'  },
  { id: 'desktop', label: 'سطح مكتب', icon: '🖥️', width: '100%' },
]

// ── WebsitePreview template blocks ──────────────────────────────────────────
const WP_TEMPLATES = [
  { id: 'navbar',       icon: '🔲', labelAr: 'شريط تنقل',   prompt: 'أضف شريط تنقل احترافي متجاوب مع شعار وروابط وزر CTA' },
  { id: 'hero',         icon: '🚀', labelAr: 'قسم البطل',    prompt: 'أضف قسم hero مذهل بعنوان رئيسي وعنوان فرعي وأزرار وعنصر بصري متحرك' },
  { id: 'features',     icon: '✨', labelAr: 'الميزات',      prompt: 'أضف قسم ميزات/خدمات بشبكة من 6 بطاقات مع أيقونات وتأثير hover' },
  { id: 'pricing',      icon: '💰', labelAr: 'الأسعار',      prompt: 'أضف جدول أسعار بثلاث خطط مع تمييز الخطة الموصى بها' },
  { id: 'testimonials', icon: '💬', labelAr: 'الشهادات',     prompt: 'أضف قسم شهادات/مراجعات ببطاقات صور ونجوم تقييم' },
  { id: 'stats',        icon: '📊', labelAr: 'الإحصائيات',   prompt: 'أضف قسم إحصائيات مع أنيميشن عد تصاعدي وأيقونات' },
  { id: 'contact',      icon: '📬', labelAr: 'نموذج التواصل', prompt: 'أضف نموذج تواصل متكامل مع التحقق من البيانات' },
  { id: 'footer',       icon: '🔻', labelAr: 'التذييل',      prompt: 'أضف تذييل شامل مع شعار وأعمدة روابط وأيقونات سوشيال' },
]

// ── Client-side CSS/JS extraction (fallback if server didn't extract) ────────
function clientExtractCss(html: string): string {
  const blocks: string[] = []
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) blocks.push(m[1].trim())
  return blocks.join('\n\n').trim()
}
function clientExtractJs(html: string): string {
  const blocks: string[] = []
  const re = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const c = m[1].trim()
    if (c.length > 10) blocks.push(c)
  }
  return blocks.join('\n\n').trim()
}
function buildHtmlShellClient(html: string, _css: string, _js: string): string {
  let result = html
  result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '<link rel="stylesheet" href="style.css">')
  result = result.replace(/<script(?![^>]*\bsrc\b)[^>]*>[\s\S]*?<\/script>/gi, '<script src="script.js"></script>')
  return result
}

// ── Code Execution Preview Component (Programming Section ONLY) ──────────────
function CodeExecutionPreview({ code, lang }: { code: string; lang: string }) {
  const [view, setView] = useState<'output' | 'code'>('output')
  const [running, setRunning] = useState(false)
  const [hasRun, setHasRun] = useState(false)
  const [copied, setCopied] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const runCode = useCallback(() => {
    setRunning(true)
    setHasRun(true)

    if (lang === 'python') {
      // Python execution via Pyodide in sandboxed iframe
      const pyHtml = `<!DOCTYPE html><html><head><script src="https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js"><\/script></head><body>
<pre id="out" style="font-family:monospace;font-size:14px;color:#e0e0e0;background:#1a1a2e;padding:16px;margin:0;min-height:200px;white-space:pre-wrap;"></pre>
<script>
const out = document.getElementById('out');
const logs = [];
async function main() {
  try {
    out.textContent = '⏳ جاري تحميل Python...\\n';
    const pyodide = await loadPyodide();
    out.textContent = '▶ جاري التنفيذ...\\n\\n';
    pyodide.setStdout({ batched: (text) => { logs.push(text); out.textContent += text + '\\n'; } });
    pyodide.setStderr({ batched: (text) => { logs.push('⚠️ ' + text); out.textContent += '⚠️ ' + text + '\\n'; } });
    await pyodide.runPythonAsync(${JSON.stringify(code)});
    if (logs.length === 0) out.textContent += '\\n✅ تم التنفيذ بنجاح (بدون مخرجات)';
    else out.textContent += '\\n✅ انتهى التنفيذ';
    window.parent.postMessage({ type: 'exec-done', logs }, '*');
  } catch (e) {
    out.textContent += '\\n❌ خطأ: ' + e.message;
    window.parent.postMessage({ type: 'exec-error', error: e.message }, '*');
  }
}
main();
<\/script></body></html>`
      if (iframeRef.current) {
        iframeRef.current.srcdoc = pyHtml
      }
    } else if (lang === 'typescript') {
      // TypeScript execution via Babel Standalone (transpile TS → JS in iframe)
      const tsHtml = `<!DOCTYPE html><html><head>
<script src="https://unpkg.com/@babel/standalone@7.24.7/babel.min.js"><\/script>
</head><body>
<pre id="out" style="font-family:monospace;font-size:14px;color:#e0e0e0;background:#1a1a2e;padding:16px;margin:0;min-height:200px;white-space:pre-wrap;"></pre>
<script>
const out = document.getElementById('out');
const logs = [];
console.log  = (...args) => { const t = args.map(a => typeof a === 'object' ? JSON.stringify(a,null,2) : String(a)).join(' '); logs.push(t); out.textContent += t + '\\n'; };
console.error = (...args) => { const t = '❌ ' + args.join(' '); logs.push(t); out.textContent += t + '\\n'; };
console.warn  = (...args) => { const t = '⚠️ ' + args.join(' '); logs.push(t); out.textContent += t + '\\n'; };
try {
  out.textContent = '⏳ جاري ترجمة TypeScript...\\n';
  const compiled = Babel.transform(${JSON.stringify(code)}, {
    presets: [['typescript', { allExtensions: true }]],
    filename: 'code.ts'
  }).code;
  out.textContent = '▶ جاري التنفيذ...\\n\\n';
  eval(compiled);
  if (logs.length === 0) out.textContent += '\\n✅ تم التنفيذ بنجاح (بدون مخرجات)';
  else out.textContent += '\\n✅ انتهى التنفيذ';
  window.parent.postMessage({ type: 'exec-done', logs }, '*');
} catch (e) {
  out.textContent += '\\n❌ خطأ: ' + e.message;
  window.parent.postMessage({ type: 'exec-error', error: e.message }, '*');
}
<\/script></body></html>`
      if (iframeRef.current) {
        iframeRef.current.srcdoc = tsHtml
      }
    } else {
      // JavaScript execution via sandboxed iframe
      const jsHtml = `<!DOCTYPE html><html><head></head><body>
<pre id="out" style="font-family:monospace;font-size:14px;color:#e0e0e0;background:#1a1a2e;padding:16px;margin:0;min-height:200px;white-space:pre-wrap;"></pre>
<script>
const out = document.getElementById('out');
const logs = [];
const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;
console.log = (...args) => { const t = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '); logs.push(t); out.textContent += t + '\\n'; };
console.error = (...args) => { const t = '❌ ' + args.join(' '); logs.push(t); out.textContent += t + '\\n'; };
console.warn = (...args) => { const t = '⚠️ ' + args.join(' '); logs.push(t); out.textContent += t + '\\n'; };
try {
  out.textContent = '▶ جاري التنفيذ...\\n\\n';
  ${code}
  if (logs.length === 0) out.textContent += '\\n✅ تم التنفيذ بنجاح (بدون مخرجات)';
  else out.textContent += '\\n✅ انتهى التنفيذ';
  window.parent.postMessage({ type: 'exec-done', logs }, '*');
} catch (e) {
  out.textContent += '\\n❌ خطأ: ' + e.message;
  window.parent.postMessage({ type: 'exec-error', error: e.message }, '*');
}
<\/script></body></html>`
      if (iframeRef.current) {
        iframeRef.current.srcdoc = jsHtml
      }
    }

    // Listen for completion
    const handler = (e: MessageEvent) => {
      // Validate origin — only accept messages from same origin or sandboxed iframes (origin='null')
      const allowedOrigin = window.location.origin
      if (e.origin !== allowedOrigin && e.origin !== 'null' && e.origin !== '') return
      if (e.data?.type === 'exec-done') {
        setRunning(false)
        window.removeEventListener('message', handler)
      } else if (e.data?.type === 'exec-error') {
        setRunning(false)
        window.removeEventListener('message', handler)
      }
    }
    window.addEventListener('message', handler)

    // Timeout after 30s
    setTimeout(() => {
      setRunning(false)
      window.removeEventListener('message', handler)
    }, 30000)
  }, [code, lang])

  // Auto-run on mount
  useEffect(() => {
    if (!hasRun) runCode()
  }, [runCode, hasRun])

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getSmartFilename = useCallback(() => {
    const ext = lang === 'python' ? 'py' : lang === 'typescript' ? 'ts' : 'js'
    // Try to extract a meaningful name from function/class/variable definitions
    const fnMatch = code.match(/^(?:def|async def)\s+(\w+)/m)
    const classMatch = code.match(/^class\s+(\w+)/m)
    const varMatch = code.match(/^(?:const|let|var|function)\s+(\w+)/m)
    const name = fnMatch?.[1] || classMatch?.[1] || varMatch?.[1]
    if (name && name.length > 1 && name.length < 30) {
      const safe = lang === 'python'
        ? name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')
        : name
      return `${safe}.${ext}`
    }
    return `dz-agent-code.${ext}`
  }, [code, lang])

  const handleDownload = () => {
    const filename = getSmartFilename()
    const blob = new Blob([code], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2500)
  }

  const langLabel = lang === 'python' ? '🐍 Python' : lang === 'typescript' ? '🔷 TypeScript' : '⚡ JavaScript'
  const fileExt   = lang === 'python' ? '.py' : lang === 'typescript' ? '.ts' : '.js'

  return (
    <div className="dz-exec-root">
      <div className="dz-exec-header">
        <span className="dz-exec-lang">{langLabel}</span>
        <div className="dz-exec-tabs">
          <button className={`dz-exec-tab${view === 'output' ? ' dz-exec-tab--active' : ''}`} onClick={() => setView('output')}>
            ▶ المخرجات
          </button>
          <button className={`dz-exec-tab${view === 'code' ? ' dz-exec-tab--active' : ''}`} onClick={() => setView('code')}>
            {'</>'} الكود
          </button>
        </div>
        <div className="dz-exec-actions">
          <button className="dz-exec-btn" onClick={runCode} disabled={running} title="إعادة التشغيل">
            {running ? '⏳' : '▶'} {running ? 'جارٍ...' : 'تشغيل'}
          </button>
          <button className="dz-exec-btn" onClick={handleCopy} title="نسخ الكود">
            {copied ? '✓ تم' : '📋 نسخ'}
          </button>
          <button
            className="dz-exec-btn dz-exec-btn--save"
            onClick={handleDownload}
            title={`حفظ الملف كـ ${getSmartFilename()}`}
          >
            {downloaded ? '✓ محفوظ' : `💾 حفظ${fileExt}`}
          </button>
        </div>
      </div>
      <div className="dz-exec-body">
        {view === 'output' ? (
          <iframe
            ref={iframeRef}
            className="dz-exec-iframe"
            sandbox="allow-scripts allow-same-origin"
            title="Code Execution Output"
          />
        ) : (
          <pre className="dz-exec-code"><code>{code}</code></pre>
        )}
      </div>
    </div>
  )
}

type WPCodeTab = 'html' | 'css' | 'js'

// ── BlobIframe: renders HTML via blob URL to avoid CSP srcDoc issues ──────────
function BlobIframe({
  html,
  className,
  style,
}: {
  html: string
  className?: string
  style?: React.CSSProperties
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [html])
  if (!blobUrl) return null
  return (
    <iframe
      src={blobUrl}
      className={className}
      style={style}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
      title="Website Live Preview"
    />
  )
}

function WebsitePreview({
  htmlCode,
  cssCode: cssCodeProp = '',
  jsCode:  jsCodeProp  = '',
  onInsertPrompt,
  webBuilderMeta,
  webReaderIntent: _webReaderIntent,
}: {
  htmlCode: string
  cssCode?: string
  jsCode?: string
  onInsertPrompt?: (p: string) => void
  webBuilderMeta?: { type: string; style: string; title: string; description: string; icon: string }
  webReaderIntent?: 'build' | 'reader' | 'update' | 'extract'
}) {
  const [view, setView]               = useState<'preview' | 'code'>('preview')
  const [codeTab, setCodeTab]         = useState<WPCodeTab>('html')
  const [viewport, setViewport]       = useState<WPViewport>('desktop')
  const [copied, setCopied]           = useState(false)
  const [downloaded, setDownloaded]   = useState(false)
  const [zipping, setZipping]         = useState(false)
  const [zipped, setZipped]           = useState(false)
  const [fullscreen, setFullscreen]   = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)

  const cssCode = cssCodeProp || clientExtractCss(htmlCode)
  const jsCode  = jsCodeProp  || clientExtractJs(htmlCode)
  const sizeKb  = Math.round(new Blob([htmlCode]).size / 1024)

  const [editedHtml, setEditedHtml] = useState(htmlCode)
  const [editedCss,  setEditedCss]  = useState(cssCode)
  const [editedJs,   setEditedJs]   = useState(jsCode)
  const [previewSrc, setPreviewSrc] = useState(htmlCode)
  const [editApplied, setEditApplied] = useState(false)

  const activeRaw = codeTab === 'html' ? editedHtml : codeTab === 'css' ? editedCss : editedJs
  const setActiveRaw = (v: string) => {
    if (codeTab === 'html') setEditedHtml(v)
    else if (codeTab === 'css') setEditedCss(v)
    else setEditedJs(v)
  }
  const activeCode = activeRaw

  const applyEdits = () => {
    let src = editedHtml
    const styleTag  = `<style>${editedCss}</style>`
    const scriptTag = `<script>${editedJs}</script>`
    src = src.replace(/<style[^>]*>[\s\S]*?<\/style>/i, styleTag)
    src = src.replace(/<script(?![^>]*\bsrc\b)[^>]*>[\s\S]*?<\/script>/i, scriptTag)
    setPreviewSrc(src)
    setEditApplied(true)
    setTimeout(() => setEditApplied(false), 2000)
    setView('preview')
  }

  const handleSaveProject = async () => {
    setSaving(true)
    try {
      const r = await fetch('/api/wb/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: webBuilderMeta?.title || 'مشروع بدون عنوان',
          html: previewSrc,
          css: editedCss,
          js: editedJs,
          type: webBuilderMeta?.type || 'landing',
          icon: webBuilderMeta?.icon || '🌐',
        }),
      })
      if (r.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch {}
    finally { setSaving(false) }
  }

  const handleDownloadHtml = () => {
    const blob = new Blob([previewSrc], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'dz-agent-site.html'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2500)
  }

  const handleDownloadZip = async () => {
    setZipping(true)
    try {
      const JSZip = (await import('jszip')).default
      const zip   = new JSZip()
      const shell = buildHtmlShellClient(editedHtml, editedCss, editedJs)
      zip.file('index.html', shell)
      zip.file('style.css',  editedCss)
      zip.file('script.js',  editedJs)
      const blob = await zip.generateAsync({ type: 'blob' })
      const a    = document.createElement('a')
      a.href     = URL.createObjectURL(blob)
      a.download = 'dz-agent-site.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
      setZipped(true)
      setTimeout(() => setZipped(false), 2500)
    } catch {
      alert('فشل تحميل ZIP. يرجى المحاولة مجدداً.')
    } finally {
      setZipping(false)
    }
  }


  const frameWidth = WP_VIEWPORTS.find(v => v.id === viewport)?.width ?? '100%'

  // Lock body scroll + ESC key when fullscreen
  useEffect(() => {
    if (!fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [fullscreen])

  const panel = (
    <div className={`dz-wp-root${fullscreen ? ' dz-wp-root--fs' : ''}`}>

      {/* ── Project card header ── */}
      {webBuilderMeta && (
        <div className={`dz-wb-project-card dz-wb-project-card--${webBuilderMeta.type}`}>
          <div className="dz-wb-project-card-left">
            <div className="dz-wb-project-icon">{webBuilderMeta.icon}</div>
            <div className="dz-wb-project-info">
              <div className="dz-wb-project-title">{webBuilderMeta.title}</div>
              <div className="dz-wb-project-desc">{webBuilderMeta.description}</div>
            </div>
          </div>
          <div className="dz-wb-project-card-right">
            <span className="dz-wb-style-badge">{
              webBuilderMeta.style === 'premium' ? '⭐ احترافي' :
              webBuilderMeta.style === 'minimal'  ? '🔲 بسيط' :
              webBuilderMeta.style === 'creative' ? '🎨 إبداعي' :
              webBuilderMeta.style === 'dark'     ? '🌑 داكن' :
              '✨ عصري'
            }</span>
            <span className="dz-wb-size-badge">{sizeKb} KB</span>
          </div>
        </div>
      )}

      {/* ── Top toolbar ── */}
      <div className="dz-wp-toolbar">
        <div className="dz-wp-tabs">
          <button
            className={`dz-wp-tab${view === 'preview' ? ' dz-wp-tab--active' : ''}`}
            onClick={() => setView('preview')}
          >
            👁 معاينة مباشرة
          </button>
          <button
            className={`dz-wp-tab${view === 'code' ? ' dz-wp-tab--active' : ''}`}
            onClick={() => setView('code')}
          >
            {'</>'} الكود
          </button>
        </div>
        <div className="dz-wp-actions">
          <span className="dz-wp-size">{sizeKb} KB</span>
          <button className="dz-wp-btn" onClick={() => { navigator.clipboard.writeText(htmlCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }} title="نسخ كامل HTML">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'تم ✓' : 'Copy HTML'}
          </button>
          <button
            className={`dz-wp-btn dz-wp-btn--dl${downloaded ? ' dz-wp-btn--ok' : ''}`}
            onClick={handleDownloadHtml}
            title="تحميل ملف HTML واحد"
          >
            {downloaded ? <Check size={13} /> : <Download size={13} />}
            {downloaded ? 'تم ✓' : '.html'}
          </button>
          <button
            className={`dz-wp-btn dz-wp-btn--zip${zipped ? ' dz-wp-btn--ok' : ''}`}
            onClick={handleDownloadZip}
            disabled={zipping}
            title="تحميل ZIP (HTML + CSS + JS منفصلة)"
          >
            {zipping ? '⏳' : zipped ? <Check size={13} /> : '🗜'}
            {zipping ? 'جارٍ...' : zipped ? 'تم ✓' : 'ZIP'}
          </button>
          <button
            className={`dz-wp-btn dz-wp-btn--save${saved ? ' dz-wp-btn--ok' : ''}`}
            onClick={handleSaveProject}
            disabled={saving}
            title="حفظ المشروع في السيرفر"
          >
            {saving ? '⏳' : saved ? <Check size={13} /> : '💾'}
            {saving ? 'جارٍ...' : saved ? 'محفوظ ✓' : 'حفظ'}
          </button>
          {onInsertPrompt && (
            <button
              className={`dz-wp-btn dz-wp-btn--tpl${showTemplates ? ' dz-wp-btn--active' : ''}`}
              onClick={() => setShowTemplates(s => !s)}
              title="إضافة قسم جديد"
            >
              🧩 قوالب
            </button>
          )}
          <button
            className={`dz-wp-btn dz-wp-btn--fs${fullscreen ? ' dz-wp-btn--fs-active' : ''}`}
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? 'خروج من ملء الشاشة (ESC)' : 'ملء الشاشة'}
          >
            {fullscreen ? '⊠' : '⊡'}
          </button>
        </div>
      </div>

      {/* ── Template picker ── */}
      {showTemplates && onInsertPrompt && (
        <div className="dz-wp-tpl-bar">
          <span className="dz-wp-tpl-label">أضف قسماً:</span>
          {WP_TEMPLATES.map(t => (
            <button
              key={t.id}
              className="dz-wp-tpl-btn"
              title={t.prompt}
              onClick={() => {
                onInsertPrompt(t.prompt)
                setShowTemplates(false)
              }}
            >
              {t.icon} {t.labelAr}
            </button>
          ))}
        </div>
      )}

      {/* ── Viewport selector (only in preview mode) ── */}
      {view === 'preview' && (
        <div className="dz-wp-viewport-bar">
          {WP_VIEWPORTS.map(vp => (
            <button
              key={vp.id}
              className={`dz-wp-vp-btn${viewport === vp.id ? ' dz-wp-vp-btn--active' : ''}`}
              onClick={() => setViewport(vp.id)}
              title={vp.label}
            >
              {vp.icon} {vp.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Code tab selector (only in code mode) ── */}
      {view === 'code' && (
        <div className="dz-wp-codetab-bar">
          {(['html', 'css', 'js'] as WPCodeTab[]).map(tab => (
            <button
              key={tab}
              className={`dz-wp-codetab${codeTab === tab ? ' dz-wp-codetab--active' : ''}`}
              onClick={() => setCodeTab(tab)}
            >
              {tab === 'html' ? '🌐 HTML' : tab === 'css' ? '🎨 CSS' : '⚡ JS'}
              {tab === 'css' && cssCode.length > 0 && (
                <span className="dz-wp-codetab-badge">{Math.round(cssCode.length / 1024 * 10) / 10}k</span>
              )}
              {tab === 'js' && jsCode.length > 0 && (
                <span className="dz-wp-codetab-badge">{Math.round(jsCode.length / 1024 * 10) / 10}k</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Content area ── */}
      {view === 'preview' ? (
        <div className="dz-wp-frame-wrap">
          <div className="dz-wp-browser-bar">
            <span className="dz-wp-dot dz-wp-dot--r" />
            <span className="dz-wp-dot dz-wp-dot--y" />
            <span className="dz-wp-dot dz-wp-dot--g" />
            <span className="dz-wp-url">dz-agent-site.html</span>
            {fullscreen && (
              <button className="dz-wp-esc-hint" onClick={() => setFullscreen(false)}>
                ESC / ✕ إغلاق
              </button>
            )}
          </div>
          <div className="dz-wp-frame-scroller">
            <BlobIframe
              html={previewSrc}
              className="dz-wp-frame"
              style={{ width: frameWidth, maxWidth: '100%', margin: '0 auto', display: 'block' }}
            />
          </div>
        </div>
      ) : (
        <div className="dz-wp-code-wrap">
          {activeCode !== undefined ? (
            <>
              <textarea
                className="dz-wp-editor"
                value={activeCode}
                onChange={e => setActiveRaw(e.target.value)}
                spellCheck={false}
                dir="ltr"
                placeholder={`اكتب كود ${codeTab.toUpperCase()} هنا...`}
              />
              <div className="dz-wp-editor-bar">
                <span className="dz-wp-editor-hint">✏️ يمكنك تعديل الكود مباشرة</span>
                <button
                  className={`dz-wp-btn dz-wp-btn--apply${editApplied ? ' dz-wp-btn--ok' : ''}`}
                  onClick={applyEdits}
                  title="تطبيق التعديلات ومعاينة النتيجة"
                >
                  {editApplied ? '✓ تم التطبيق' : '▶ تطبيق ومعاينة'}
                </button>
              </div>
            </>
          ) : (
            <div className="dz-wp-empty-tab">لا يوجد كود {codeTab.toUpperCase()} مستخرج</div>
          )}
        </div>
      )}
    </div>
  )

  // Portal: renders outside any stacking context so position:fixed works correctly
  return fullscreen ? createPortal(panel, document.body) : panel
}

// ===== YOUTUBE HELPERS =====
function fmtDuration(secs: number): string {
  if (!secs || secs <= 0) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
function fmtViews(n: number): string {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M مشاهدة`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K مشاهدة`
  return `${n} مشاهدة`
}

// ===== YOUTUBE PANEL COMPONENT =====
function YouTubePanel({
  video,
  results,
  flow,
  analysis,
  suggestions,
  captionNote,
  captionText,
  onAsk,
  onDiscuss,
}: {
  video?: YouTubeVideoData
  results?: YouTubeResult[]
  flow?: 'url' | 'search'
  analysis?: YouTubeAnalysis
  suggestions?: string[]
  captionNote?: string
  captionText?: string
  onAsk?: (q: string) => void
  onDiscuss?: (video: YouTubeResult) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(
    flow === 'url' && video?.id ? video.id : null,
  )
  const [selectedVideo, setSelectedVideo] = useState<YouTubeResult | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)

  if (flow === 'url' && video) {
    const embedId = activeId || video.id
    return (
      <div className="dzc-yt">
        {/* iframe embed */}
        <div className="dzc-yt-embed-wrap">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${embedId}?rel=0&modestbranding=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        {/* Meta */}
        <div className="dzc-yt-meta">
          <div className="dzc-yt-now-badge">
            <span className="dzc-yt-live-dot" />
            الآن يُعرض
          </div>
          <h3 className="dzc-yt-title">{video.title}</h3>
          <div className="dzc-yt-info">
            {video.channel && <span>📺 {video.channel}</span>}
            {video.duration > 0 && <span>⏱ {fmtDuration(video.duration)}</span>}
            {video.views > 0 && <span>👁 {fmtViews(video.views)}</span>}
          </div>
        </div>

        {/* AI Analysis */}
        {analysis && (analysis.summary || (analysis.keyIdeas && analysis.keyIdeas.length > 0)) && (
          <div className="dzc-yt-analysis">
            <div className="dzc-yt-analysis-header">🤖 تحليل DZ Agent</div>
            {analysis.summary && <p className="dzc-yt-summary">{analysis.summary}</p>}
            {analysis.keyIdeas && analysis.keyIdeas.length > 0 && (
              <ul className="dzc-yt-key-ideas">
                {analysis.keyIdeas.map((idea, i) => <li key={i}>{idea}</li>)}
              </ul>
            )}
            {(analysis.category || analysis.language) && (
              <div className="dzc-yt-tags">
                {analysis.category && <span className="dzc-yt-tag">📂 {analysis.category}</span>}
                {analysis.language && <span className="dzc-yt-tag">🌐 {analysis.language}</span>}
              </div>
            )}
          </div>
        )}

        {/* Caption warning */}
        {captionNote && <p className="dzc-yt-caption-note">{captionNote}</p>}

        {/* Transcript viewer */}
        {captionText && (
          <div className="dzc-yt-transcript-wrap">
            <button
              className="dzc-yt-transcript-toggle"
              onClick={() => setShowTranscript(v => !v)}
            >
              <span className="dzc-yt-transcript-icon">📄</span>
              <span>نص الفيديو (النسخة النصية)</span>
              <span className={`dzc-yt-transcript-chevron${showTranscript ? ' open' : ''}`}>▾</span>
            </button>
            {showTranscript && (
              <div className="dzc-yt-transcript-body">
                <pre className="dzc-yt-transcript-text">{captionText}</pre>
              </div>
            )}
          </div>
        )}

        {/* Suggestion strip */}
        {suggestions && suggestions.length > 0 && (
          <div className="dzc-yt-suggestions">
            {suggestions.map((s, i) => (
              <button key={i} className="dzc-yt-sugg-btn" onClick={() => onAsk?.(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (flow === 'search' && (!results || results.length === 0)) {
    const _q = encodeURIComponent(
      typeof video?.title === 'string' ? video.title : ''
    )
    return (
      <div className="dzc-yt">
        <div className="dzc-yt-results-hdr">
          <span>🔍 YouTube</span>
        </div>
        <p style={{ padding: '12px 16px', color: 'var(--dzc-text-muted, #888)', fontSize: '0.9rem' }}>
          لم يتم العثور على نتائج مباشرة.
        </p>
        <a
          href={`https://www.youtube.com/results?search_query=${_q}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'block', padding: '10px 16px', color: '#e05', fontWeight: 600 }}
        >
          ابحث مباشرة على YouTube ↗
        </a>
        {suggestions && suggestions.length > 0 && (
          <div className="dzc-yt-suggestions">
            {suggestions.map((s, i) => (
              <button key={i} className="dzc-yt-suggest-btn" onClick={() => onAsk?.(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (flow === 'search' && results && results.length > 0) {
    const ORDINAL_LABELS = ['الأول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن']

    const selectVideo = (r: YouTubeResult) => {
      setActiveId(r.id)
      setSelectedVideo(r)
    }

    return (
      <div className="dzc-yt">
        {/* Results header */}
        <div className="dzc-yt-results-hdr">
          <span>🔍 نتائج YouTube</span>
          <span className="dzc-yt-results-count">{results.length} نتيجة</span>
        </div>

        {/* Smart-select hint */}
        <p className="dzc-yt-select-hint">
          {selectedVideo ? 'اختر إجراءً أسفله، أو انقر على فيديو آخر' : 'انقر على فيديو لاختياره'}
        </p>

        {/* Results grid */}
        <div className="dzc-yt-grid">
          {results.map((r, idx) => (
            <button
              key={r.id}
              className={`dzc-yt-card${activeId === r.id ? ' active' : ''}`}
              onClick={() => selectVideo(r)}
            >
              {/* Numbered index badge */}
              <span className="dzc-yt-card-index">{idx + 1}</span>

              <div className="dzc-yt-card-thumb-wrap">
                <img
                  src={`https://i.ytimg.com/vi/${r.id}/hqdefault.jpg`}
                  alt={r.title}
                  className="dzc-yt-card-thumb"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                {r.duration > 0 && (
                  <span className="dzc-yt-card-dur">{fmtDuration(r.duration)}</span>
                )}
                <div className="dzc-yt-card-play">
                  <div className="dzc-yt-play-circle">▶ اختر</div>
                </div>
              </div>
              <div className="dzc-yt-card-body">
                <p className="dzc-yt-card-title">{r.title}</p>
                <p className="dzc-yt-card-meta">{r.channel}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Quick-pick ordinal buttons */}
        <div className="dzc-yt-quickpick">
          {results.slice(0, 8).map((r, idx) => (
            <button
              key={r.id}
              className={`dzc-yt-qp-btn${activeId === r.id ? ' active' : ''}`}
              onClick={() => selectVideo(r)}
              title={r.title}
            >
              {idx + 1}️⃣ {ORDINAL_LABELS[idx] || `رقم ${idx + 1}`}
            </button>
          ))}
        </div>

        {/* Embed preview of selected video — shown below results */}
        {activeId && (
          <div className="dzc-yt-embed-wrap">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${activeId}?rel=0`}
              title="YouTube Player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {/* Action panel — shown when a video is selected */}
        {selectedVideo && (
          <div className="dzc-yt-action-panel">
            <p className="dzc-yt-action-title">
              <span className="dzc-yt-action-icon">🎬</span>
              {selectedVideo.title.length > 55 ? selectedVideo.title.slice(0, 55) + '…' : selectedVideo.title}
            </p>
            <div className="dzc-yt-action-btns">
              <button
                className="dzc-yt-action-btn dzc-yt-action-btn--discuss"
                onClick={() => onDiscuss?.(selectedVideo)}
              >
                🔎🧠 تحليل و مناقشة الفيديو
              </button>
            </div>
          </div>
        )}

        {/* Suggestion strip */}
        {suggestions && suggestions.length > 0 && (
          <div className="dzc-yt-suggestions">
            {suggestions.map((s, i) => (
              <button key={i} className="dzc-yt-sugg-btn" onClick={() => onAsk?.(s)}>{s}</button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
}

// ===== TABLE SCROLL WRAPPER — fixes iOS RTL horizontal scroll snap-back =====
// Uses a non-passive touchmove listener to stop the parent from stealing the
// touch event when the user is scrolling the table horizontally.

function TableScrollWrapper({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let startX = 0, startY = 0, isH = false

    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      isH = false
    }
    const onMove = (e: TouchEvent) => {
      const dx = Math.abs(e.touches[0].clientX - startX)
      const dy = Math.abs(e.touches[0].clientY - startY)
      if (!isH && dy > dx * 1.2) return     // mainly vertical → let parent scroll
      isH = true
      e.stopPropagation()                   // stop parent from stealing the touch
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove',  onMove,  { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove',  onMove)
    }
  }, [])

  return (
    <div className="v5-md-table-scroll" ref={ref}>
      {children}
    </div>
  )
}

// ===== TYPING EFFECT =====

function TypingEffect({ text, onDone }: { text: string; onDone: () => void }) {
  const [displayed, setDisplayed] = useState('')
  const indexRef  = useRef(0)
  // Keep a stable ref to onDone so it never causes the effect to reset
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    indexRef.current = 0
    setDisplayed('')
    // Type ~4 chars per tick at 8ms → smooth and fast for any response length
    const STEP = 4
    const interval = setInterval(() => {
      indexRef.current = Math.min(indexRef.current + STEP, text.length)
      setDisplayed(text.slice(0, indexRef.current))
      if (indexRef.current >= text.length) {
        clearInterval(interval)
        onDoneRef.current()
      }
    }, 8)
    return () => clearInterval(interval)
  }, [text]) // ← onDone intentionally omitted: stored in ref above

  return <span>{displayed}</span>
}

// ===== REPOS LIST =====
// ===== REPOS SUGGEST PANEL — DZ GitHub Recommender =====
const REPO_CATEGORIES = [
  { id: 'all',     label: 'الكل',         icon: '🌐' },
  { id: 'web',     label: 'ويب',           icon: '🌍' },
  { id: 'ai',      label: 'ذكاء اصطناعي', icon: '🤖' },
  { id: 'arabic',  label: 'عربي / 🇩🇿',   icon: '🇩🇿' },
  { id: 'backend', label: 'خلفية',         icon: '⚙️' },
  { id: 'mobile',  label: 'موبايل',        icon: '📱' },
  { id: 'data',    label: 'بيانات',        icon: '📊' },
  { id: 'tools',   label: 'أدوات',         icon: '🔧' },
  { id: 'live',    label: 'نتائج حية',     icon: '🔴' },
]

function ReposSuggestPanel({ repos }: { repos: SuggestedRepo[] }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? repos : repos.filter(r => r.category === filter)
  const available = REPO_CATEGORIES.filter(c => c.id === 'all' || repos.some(r => r.category === c.id))
  const fmtStars = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n)

  return (
    <div className="dz-repos-suggest">
      <div className="dz-repos-suggest-header">
        <span>🔍 مستودعات GitHub مقترحة</span>
        <span className="dz-repos-suggest-count">{filtered.length} مستودع</span>
      </div>
      <div className="dz-repos-suggest-cats">
        {available.map(c => (
          <button
            key={c.id}
            className={`dz-rsc-cat ${filter === c.id ? 'dz-rsc-cat--active' : ''}`}
            onClick={() => setFilter(c.id)}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>
      <div className="dz-repos-suggest-grid">
        {filtered.map(repo => (
          <a
            key={repo.full_name}
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="dz-rsc-card"
          >
            <div className="dz-rsc-top">
              <span className="dz-rsc-icon">{repo.icon}</span>
              <span className="dz-rsc-name">{repo.full_name}</span>
              <span className="dz-rsc-stars">⭐ {fmtStars(repo.stars)}</span>
            </div>
            <p className="dz-rsc-desc">{repo.description}</p>
            <div className="dz-rsc-footer">
              {repo.language && repo.language !== 'N/A' && (
                <span className="dz-rsc-lang">{repo.language}</span>
              )}
              <span className="dz-rsc-link">فتح ↗</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}

function ReposList({
  repos,
  onSelect,
  onExport,
}: {
  repos: RepoItem[]
  onSelect: (repo: RepoItem) => void
  onExport: (selected: RepoItem[]) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleRepo = (fullName: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(fullName)) next.delete(fullName)
      else next.add(fullName)
      return next
    })
  }

  const selectedRepos = repos.filter(r => selected.has(r.full_name))

  return (
    <div className="gh-repos-list">
      <div className="gh-section-title">
        <Github size={14} />
        <span>Repositories ({repos.length})</span>
        {selected.size > 0 && (
          <button
            className="gh-export-btn"
            onClick={() => onExport(selectedRepos)}
          >
            <FolderOpen size={12} />
            تصدير ({selected.size}) إلى DZ Agent
          </button>
        )}
      </div>
      {repos.map(repo => (
        <div
          key={repo.full_name}
          className={`gh-repo-item gh-repo-item--selectable ${selected.has(repo.full_name) ? 'gh-repo-item--selected' : ''}`}
        >
          <label className="gh-repo-checkbox-label">
            <input
              type="checkbox"
              className="gh-repo-checkbox"
              checked={selected.has(repo.full_name)}
              onChange={() => toggleRepo(repo.full_name)}
            />
            <div className="gh-repo-info" onClick={() => onSelect(repo)}>
              <div className="gh-repo-main">
                <FolderOpen size={14} className="gh-repo-icon" />
                <span className="gh-repo-name">{repo.name}</span>
                {repo.private && <span className="gh-badge gh-badge--private">Private</span>}
              </div>
              {repo.description && (
                <p className="gh-repo-desc">{repo.description}</p>
              )}
              <div className="gh-repo-meta">
                {repo.language && <span className="gh-lang">{repo.language}</span>}
                <span className="gh-branch">
                  <ChevronRight size={10} />
                  {repo.default_branch}
                </span>
              </div>
            </div>
          </label>
        </div>
      ))}
    </div>
  )
}

// ===== FILES LIST =====
function FilesList({
  files,
  currentPath,
  onSelectFile,
  onSelectDir,
  repo: repoName,
}: {
  files: FileItem[]
  repo: string
  currentPath: string
  onSelectFile: (file: FileItem) => void
  onSelectDir: (dir: FileItem) => void
}) {
  return (
    <div className="gh-files-list">
      <div className="gh-section-title">
        <FolderOpen size={14} />
        <span>{repoName}{currentPath ? ` / ${currentPath}` : ''}</span>
      </div>
      {files.map(file => (
        <button
          key={file.path}
          className={`gh-file-item ${file.type === 'dir' ? 'gh-file-item--dir' : ''}`}
          onClick={() => file.type === 'dir' ? onSelectDir(file) : onSelectFile(file)}
        >
          {file.type === 'dir' ? (
            <ChevronDown size={13} className="gh-file-icon" />
          ) : (
            <FileText size={13} className="gh-file-icon" />
          )}
          <span className="gh-file-name">{file.name}</span>
          {file.size !== undefined && file.type === 'file' && (
            <span className="gh-file-size">{formatSize(file.size)}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ===== FILE CONTENT VIEW =====
function FileContentView({
  path,
  content,
  repo: _repo,
  onAnalyze,
  onEdit,
}: {
  path: string
  content: string
  repo: string
  onAnalyze: () => void
  onEdit: () => void
}) {
  const [copied, setCopied] = useState(false)
  const lines = content.split('\n').length
  const ext = path.split('.').pop() || ''

  return (
    <div className="gh-file-content">
      <div className="gh-file-header">
        <div className="gh-file-header-left">
          <FileText size={14} />
          <span className="gh-file-path">{path}</span>
          <span className="gh-badge">{lines} lines</span>
        </div>
        <div className="gh-file-header-right">
          <button className="gh-action-btn" onClick={onAnalyze}>
            <Zap size={13} />
            Analyze
          </button>
          <button className="gh-action-btn" onClick={onEdit}>
            <GitCommit size={13} />
            Edit & Commit
          </button>
          <button
            className="gh-action-btn"
            onClick={() => {
              navigator.clipboard.writeText(content)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="gh-file-code">
        <pre><code className={`language-${ext}`}>{content}</code></pre>
      </div>
    </div>
  )
}

// ===== GITHUB AGENT RESULT PANEL =====
interface GHAgentExecutionReport {
  branch: string
  filesCommitted: string[]
  prUrl: string
  errors: string[]
  vercelTriggered: boolean
  vercelDeployId?: string | null
}
interface GHAgentGitOutput { branch: string; commit: string; prTitle: string; prBody: string }
interface GHAgentFile { path: string; lines: number }

function GitHubAgentResultPanel({
  repo, analysis, plan, gitOutput, files, executionReport, autoExecute, onExecute,
}: {
  repo: string
  analysis?: string
  plan?: string
  gitOutput?: GHAgentGitOutput
  files?: GHAgentFile[]
  executionReport?: GHAgentExecutionReport | null
  autoExecute?: boolean
  onExecute?: () => void
}) {
  const [tab, setTab] = useState<'analysis' | 'plan' | 'files' | 'result'>('analysis')
  const repoUrl = `https://github.com/${repo}`

  return (
    <div className="gh-agent-panel">
      {/* Header */}
      <div className="gh-agent-header">
        <div className="gh-agent-header-left">
          <Github size={15} />
          <span className="gh-agent-repo-name">{repo}</span>
          <a href={repoUrl} target="_blank" rel="noreferrer" className="gh-agent-repo-link">
            <ExternalLink size={11} />
          </a>
        </div>
        <span className="gh-agent-badge">DZ GitHub Agent</span>
      </div>

      {/* Tabs */}
      <div className="gh-agent-tabs">
        {(['analysis', 'plan', 'files', 'result'] as const).map(t => (
          <button
            key={t}
            className={`gh-agent-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'analysis' && <><Search size={11} /> Analysis</>}
            {t === 'plan'     && <><Brain size={11} /> Plan</>}
            {t === 'files'    && <><FileText size={11} /> Files ({files?.length ?? 0})</>}
            {t === 'result'   && <><GitPullRequest size={11} /> Git Output</>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="gh-agent-body">
        {tab === 'analysis' && (
          <div className="gh-agent-section">
            <div className="gh-agent-section-icon"><Search size={13} /></div>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis || '(لا يوجد تحليل)'}</ReactMarkdown>
          </div>
        )}
        {tab === 'plan' && (
          <div className="gh-agent-section">
            <div className="gh-agent-section-icon"><Brain size={13} /></div>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan || '(لا يوجد خطة)'}</ReactMarkdown>
          </div>
        )}
        {tab === 'files' && (
          <div className="gh-agent-files-list">
            {files && files.length > 0 ? files.map((f, i) => (
              <div key={i} className="gh-agent-file-row">
                <FileText size={13} className="gh-agent-file-icon" />
                <span className="gh-agent-file-path">{f.path}</span>
                <span className="gh-agent-file-lines">{f.lines} lines</span>
              </div>
            )) : <p className="gh-agent-empty">لا توجد ملفات للتعديل في هذه الجلسة.</p>}
          </div>
        )}
        {tab === 'result' && (
          <div className="gh-agent-git-output">
            {gitOutput?.branch && (
              <div className="gh-agent-git-row">
                <GitBranch size={13} />
                <span className="gh-agent-git-label">Branch:</span>
                <code className="gh-agent-git-val">{gitOutput.branch}</code>
              </div>
            )}
            {gitOutput?.commit && (
              <div className="gh-agent-git-row">
                <GitCommit size={13} />
                <span className="gh-agent-git-label">Commit:</span>
                <code className="gh-agent-git-val">{gitOutput.commit}</code>
              </div>
            )}
            {gitOutput?.prTitle && (
              <div className="gh-agent-git-row">
                <GitPullRequest size={13} />
                <span className="gh-agent-git-label">PR:</span>
                <code className="gh-agent-git-val">{gitOutput.prTitle}</code>
              </div>
            )}
            {/* Execution report */}
            {executionReport && (
              <div className="gh-agent-exec-report">
                <div className="gh-agent-exec-title">
                  <Activity size={13} /> تقرير التنفيذ
                </div>
                {executionReport.filesCommitted.length > 0 && (
                  <div className="gh-agent-exec-success">
                    <CheckCircle2 size={13} />
                    <span>تم رفع {executionReport.filesCommitted.length} ملف</span>
                  </div>
                )}
                {executionReport.prUrl && (
                  <a href={executionReport.prUrl} target="_blank" rel="noreferrer" className="gh-agent-pr-link">
                    <GitPullRequest size={13} /> فتح Pull Request
                  </a>
                )}
                {executionReport.vercelTriggered && (
                  <div className="gh-agent-vercel-badge">
                    <Zap size={12} /> Vercel Deployment triggered
                    {executionReport.vercelDeployId && <span> — {executionReport.vercelDeployId.slice(0, 14)}…</span>}
                  </div>
                )}
                {executionReport.errors.length > 0 && (
                  <div className="gh-agent-exec-errors">
                    {executionReport.errors.map((e, i) => (
                      <div key={i} className="gh-agent-exec-error"><XCircle size={12} /> {e}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Execute button when not already executed */}
            {!autoExecute && !executionReport && files && files.length > 0 && onExecute && (
              <button className="gh-agent-execute-btn" onClick={onExecute}>
                <Zap size={13} /> تنفيذ على GitHub (Branch + Commit + PR)
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ===== APPROVAL DIALOG =====
function ApprovalDialog({
  action,
  onApprove,
  onCancel,
}: {
  action: PendingAction
  onApprove: () => void
  onCancel: () => void
}) {
  return (
    <div className="gh-approval">
      <div className="gh-approval-header">
        <AlertCircle size={16} className="gh-approval-icon" />
        <span>Approval Required</span>
      </div>
      <div className="gh-approval-body">
        {action.type === 'commit' ? (
          <>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Action:</span>
              <span className="gh-approval-value">
                <GitCommit size={13} /> Commit to repository
              </span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Repo:</span>
              <span className="gh-approval-value">{action.repo}</span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">File:</span>
              <span className="gh-approval-value">{action.path}</span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Branch:</span>
              <span className="gh-approval-value">{action.branch}</span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Message:</span>
              <span className="gh-approval-value">{action.message}</span>
            </div>
            {action.content && (
              <div className="gh-approval-preview">
                <div className="gh-approval-preview-title">New content preview:</div>
                <pre className="gh-approval-code">{action.content.slice(0, 500)}{action.content.length > 500 ? '\n...(truncated)' : ''}</pre>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Action:</span>
              <span className="gh-approval-value">
                <GitPullRequest size={13} /> Create Pull Request
              </span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Repo:</span>
              <span className="gh-approval-value">{action.repo}</span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Title:</span>
              <span className="gh-approval-value">{action.title}</span>
            </div>
            <div className="gh-approval-row">
              <span className="gh-approval-label">Branch:</span>
              <span className="gh-approval-value">{action.branch} → {action.base}</span>
            </div>
          </>
        )}
      </div>
      <div className="gh-approval-actions">
        <button className="gh-approve-btn" onClick={onApprove}>
          <CheckCircle2 size={15} />
          Approve & Execute
        </button>
        <button className="gh-cancel-btn" onClick={onCancel}>
          <XCircle size={15} />
          Cancel
        </button>
      </div>
    </div>
  )
}

// ===== ACTION LOG =====
function ActionLogPanel({ entries }: { entries: ActionLogEntry[] }) {
  return (
    <div className="gh-action-log">
      <div className="gh-section-title">
        <Terminal size={14} />
        <span>Action Log</span>
      </div>
      {entries.length === 0 ? (
        <p className="gh-log-empty">No actions yet.</p>
      ) : (
        entries.map((e, i) => (
          <div key={i} className={`gh-log-entry gh-log-entry--${e.status}`}>
            <div className="gh-log-top">
              {e.status === 'success' ? <CheckCircle2 size={12} /> : e.status === 'error' ? <XCircle size={12} /> : <RefreshCw size={12} />}
              <span className="gh-log-type">{e.type}</span>
              <span className="gh-log-time">{e.timestamp}</span>
            </div>
            <p className="gh-log-desc">{e.description}</p>
            {e.repo && <span className="gh-log-repo">{e.repo}</span>}
          </div>
        ))
      )}
    </div>
  )
}

// ===== REPO ACTION PANEL =====
const REPO_ACTIONS: { id: string; Icon: React.ElementType; label: string; desc: string; color: string; badge?: string }[] = [
  { id: 'analyze-project', Icon: Brain,         label: 'تحليل ذكي',        desc: 'قراءة المشروع كاملاً + AI', color: '#a78bfa', badge: 'AI' },
  { id: 'generate-push',   Icon: Zap,           label: 'توليد + Push',     desc: 'كود AI ← GitHub Pages',    color: '#4ade80', badge: 'AI' },
  { id: 'improve-design',  Icon: Layers,        label: 'تحسين التصميم',    desc: 'تحديث CSS/Theme احترافي',   color: '#f472b6', badge: 'AI' },
  { id: 'deploy-pages',    Icon: Globe,         label: 'نشر github.io',    desc: 'نشر عبر GitHub Pages',      color: '#38bdf8' },
  { id: 'scan',            Icon: ScanSearch,    label: 'فحص شامل',         desc: 'تحليل شامل للمستودع',       color: '#60a5fa' },
  { id: 'bugs',            Icon: Bug,           label: 'إيجاد الأخطاء',    desc: 'كشف الأخطاء والثغرات',      color: '#f87171' },
  { id: 'security',        Icon: ShieldAlert,   label: 'فحص أمني',         desc: 'ثغرات أمنية وحماية',        color: '#fb923c' },
  { id: 'suggest',         Icon: Lightbulb,     label: 'اقتراحات',         desc: 'تحسينات الكود والأداء',     color: '#fbbf24' },
  { id: 'fix',             Icon: Wrench,        label: 'إصلاح تلقائي',     desc: 'إصلاح وCommit مباشر',       color: '#34d399' },
  { id: 'files',           Icon: FolderOpen,    label: 'الملفات',          desc: 'تصفح ملفات المستودع',       color: '#94a3b8' },
  { id: 'branches',        Icon: GitBranch,     label: 'الفروع',           desc: 'إدارة فروع المستودع',       color: '#c084fc' },
  { id: 'issues',          Icon: AlertCircle,   label: 'المشاكل',          desc: 'Issues المفتوحة',            color: '#fb923c' },
  { id: 'pulls',           Icon: GitPullRequest,label: 'Pull Requests',    desc: 'طلبات الدمج النشطة',        color: '#38bdf8' },
  { id: 'commit',          Icon: GitCommit,     label: 'Commit',           desc: 'حفظ تعديل مباشر',           color: '#06b6d4' },
  { id: 'pr',              Icon: GitMerge,      label: 'إنشاء PR',         desc: 'Pull Request جديد',          color: '#f97316' },
  { id: 'stats',           Icon: BarChart2,     label: 'إحصائيات',         desc: 'إحصائيات ومساهمون',         color: '#a78bfa' },
]

function RepoActionPanel({
  repo,
  onAction,
}: {
  repo: RepoItem
  onAction: (action: string, repo: RepoItem) => void
}) {
  const aiActions = REPO_ACTIONS.filter(a => a.badge === 'AI')
  const regularActions = REPO_ACTIONS.filter(a => !a.badge)
  return (
    <div className="rap-root">
      <div className="rap-header">
        <div className="rap-repo-info">
          <FolderOpen size={15} />
          <span className="rap-repo-name">{repo.name}</span>
          {repo.private && <span className="gh-badge gh-badge--private">Private</span>}
          {repo.language && <span className="rap-lang">{repo.language}</span>}
        </div>
        <a href={repo.html_url} target="_blank" rel="noreferrer" className="rap-gh-link">
          <Github size={13} /> GitHub
        </a>
      </div>
      {repo.description && <p className="rap-desc">{repo.description}</p>}

      {/* AI-Powered Actions — highlighted section */}
      <div className="rap-section-label">
        <Brain size={12} style={{ color: '#a78bfa' }} />
        <span>إجراءات الذكاء الاصطناعي</span>
      </div>
      <div className="rap-grid rap-grid--ai">
        {aiActions.map(a => (
          <button
            key={a.id}
            className="rap-btn rap-btn--ai"
            style={{ '--rap-color': a.color } as React.CSSProperties}
            onClick={() => onAction(a.id, repo)}
            title={a.desc}
          >
            <span className="rap-btn-icon" style={{ color: a.color }}>
              <a.Icon size={18} />
            </span>
            <span className="rap-btn-label">{a.label}</span>
            <span className="rap-btn-desc">{a.desc}</span>
            <span className="rap-badge-ai">AI</span>
          </button>
        ))}
      </div>

      {/* Standard GitHub Actions */}
      <div className="rap-section-label">
        <Github size={12} style={{ color: '#94a3b8' }} />
        <span>إجراءات GitHub</span>
      </div>
      <div className="rap-grid">
        {regularActions.map(a => (
          <button
            key={a.id}
            className="rap-btn"
            style={{ '--rap-color': a.color } as React.CSSProperties}
            onClick={() => onAction(a.id, repo)}
            title={a.desc}
          >
            <span className="rap-btn-icon" style={{ color: a.color }}>
              <a.Icon size={18} />
            </span>
            <span className="rap-btn-label">{a.label}</span>
            <span className="rap-btn-desc">{a.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ===== GPS NEARBY CARD =====
interface NearbyResult {
  osmId?: number
  name: string
  nameAr?: string
  nameFr?: string
  lat: number
  lng: number
  distanceM: number
  distanceLabel: string
  phone?: string
  opening?: string
  gmapsDir: string
  gmapsPlace: string
}

const RADIUS_OPTIONS = [
  { value: 500,  label: '500م' },
  { value: 1000, label: '1 كم' },
  { value: 3000, label: '3 كم' },
  { value: 5000, label: '5 كم' },
] as const
type RadiusValue = typeof RADIUS_OPTIONS[number]['value']

function GpsNearbyCard({ meta }: { meta: Record<string, unknown> }) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle')
  const [resolvedMeta, setResolvedMeta] = useState<Record<string, unknown> | null>(null)
  const [nearbyResults, setNearbyResults] = useState<NearbyResult[]>([])
  const [errMsg, setErrMsg] = useState('')
  const [radius, setRadius] = useState<RadiusValue>(3000)
  const s = (v: unknown) => String(v ?? '')

  const poiKey    = s(meta.poiKey)
  const poiIcon   = s(meta.poiIcon) || '📍'
  const poiNameAr = s(meta.poiNameAr) || 'مرفق'

  const handleGps = () => {
    if (!navigator.geolocation) {
      setErrMsg('المتصفح لا يدعم خدمة تحديد الموقع. جرّب Chrome أو Firefox.')
      setPhase('error')
      return
    }
    // فحص: هل داخل iframe؟ (Replit preview)
    const inIframe = (() => { try { return window.self !== window.top } catch { return true } })()
    if (inIframe) {
      setErrMsg('📍 خدمة الموقع محجوبة داخل الـ preview. افتح التطبيق في نافذة جديدة من شريط العنوان.')
      setPhase('error')
      return
    }
    setPhase('loading')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6))
        const lng = parseFloat(pos.coords.longitude.toFixed(6))
        try {
          const r = await fetch('/api/dz-maps/nearby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng, poiKey: poiKey || null, radius }),
          })
          const data = await r.json()
          if (data.mapMeta) {
            setResolvedMeta(data.mapMeta)
            setNearbyResults(Array.isArray(data.results) ? data.results : [])
            setPhase('ready')
          } else {
            setErrMsg(data.error || 'لم يتمكن من تحميل الخريطة')
            setPhase('error')
          }
        } catch {
          setErrMsg('فشل الاتصال بالخادم. تحقق من اتصالك.')
          setPhase('error')
        }
      },
      (err) => {
        if (err.code === 1) {
          // PERMISSION_DENIED
          setErrMsg('🔒 تم رفض إذن الموقع. افتح إعدادات المتصفح ← الخصوصية ← الموقع ← اسمح لهذا الموقع، ثم أعد المحاولة.')
        } else if (err.code === 2) {
          // POSITION_UNAVAILABLE
          setErrMsg('📡 تعذّر تحديد الموقع. تأكد من تفعيل GPS في جهازك أو اتصالك بالإنترنت.')
        } else {
          // TIMEOUT
          setErrMsg('⏱ انتهت مهلة تحديد الموقع. تأكد من GPS وأعد المحاولة.')
        }
        setPhase('error')
      },
      { timeout: 10000, enableHighAccuracy: true, maximumAge: 30000 }
    )
  }

  if (phase === 'ready' && resolvedMeta) {
    return (
      <div className="dz-nearby-resolved">
        <MapPreview mapHtml="" mapMeta={resolvedMeta} />

        {nearbyResults.length > 0 && (
          <div className="dz-nearby-results">
            <div className="dz-nearby-results-header">
              <span>{poiIcon}</span>
              <strong>أقرب {poiNameAr} — {nearbyResults.length} نتيجة</strong>
            </div>
            <div className="dz-nearby-list">
              {nearbyResults.map((r, i) => (
                <div key={r.osmId ?? i} className="dz-nearby-item">
                  <div className="dz-nearby-item-rank">#{i + 1}</div>
                  <div className="dz-nearby-item-body">
                    <div className="dz-nearby-item-name">
                      {r.nameAr || r.name}
                      {r.nameAr && r.nameFr && r.nameAr !== r.nameFr && (
                        <span className="dz-nearby-item-name-fr"> ({r.nameFr})</span>
                      )}
                    </div>
                    <div className="dz-nearby-item-meta">
                      <span className="dz-nearby-dist-badge">{r.distanceLabel}</span>
                      {r.phone && <span className="dz-nearby-phone">📞 {r.phone}</span>}
                      {r.opening && <span className="dz-nearby-opening">🕐 {r.opening}</span>}
                    </div>
                  </div>
                  <div className="dz-nearby-item-actions">
                    <a
                      href={r.gmapsDir}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dz-nearby-action-btn dz-nearby-action-btn--nav"
                    >
                      🚗 مسار
                    </a>
                    <a
                      href={r.gmapsPlace}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dz-nearby-action-btn dz-nearby-action-btn--info"
                    >
                      <ExternalLink size={11} /> تفاصيل
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <div className="dz-nearby-results-footer">
              بيانات حقيقية من OpenStreetMap · ضمن {nearbyResults[nearbyResults.length - 1]?.distanceLabel || '3 كم'}
            </div>
          </div>
        )}

        {nearbyResults.length === 0 && (
          <div className="dz-nearby-empty">
            ℹ️ لم يتم العثور على {poiNameAr} في قاعدة بيانات OSM ضمن 3 كم. جرّب
            {' '}
            <a href={(resolvedMeta.gmapsLink as string) || '#'} target="_blank" rel="noopener noreferrer">
              البحث في Google Maps
            </a>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dz-gps-nearby-card">
      <div className="dz-gps-nearby-header">
        <span className="dz-gps-nearby-poi-icon">{poiIcon}</span>
        <div className="dz-gps-nearby-info">
          <strong>{poiKey ? `أقرب ${poiNameAr} منك` : 'البحث القريب منك'}</strong>
          <span>شارك موقعك لعرض الخريطة والنتائج القريبة</span>
        </div>
      </div>
      {phase === 'error' && (
        <div className="dz-gps-nearby-error">⚠️ {errMsg}</div>
      )}
      <div className="dz-radius-selector">
        <span className="dz-radius-label">نطاق البحث:</span>
        <div className="dz-radius-pills">
          {RADIUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`dz-radius-pill${radius === opt.value ? ' dz-radius-pill--active' : ''}`}
              onClick={() => setRadius(opt.value)}
              disabled={phase === 'loading'}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button
        className={`dz-gps-nearby-btn${phase === 'loading' ? ' dz-gps-nearby-btn--loading' : ''}`}
        onClick={handleGps}
        disabled={phase === 'loading'}
        type="button"
      >
        {phase === 'loading'
          ? <><Loader2 size={15} className="dz-spin-icon" /> جارٍ البحث في المنطقة...</>
          : <><MapPin size={15} /> 📍 تفعيل GPS وعرض أقرب {poiNameAr}</>
        }
      </button>
      <div className="dz-gps-nearby-hint">
        سيُطلب منك الإذن مرة واحدة فقط • لا يتم حفظ موقعك • بيانات OpenStreetMap
      </div>
    </div>
  )
}

// ===== MAP PREVIEW =====
// ===== MAP POI SUGGESTION CHIPS =====
const _MAP_POI_CHIPS = [
  { key: 'mosque',      icon: '🕌', label: 'مساجد'       },
  { key: 'hospital',    icon: '🏥', label: 'مستشفيات'    },
  { key: 'pharmacy',    icon: '💊', label: 'صيدليات'     },
  { key: 'restaurant',  icon: '🍽️', label: 'مطاعم'      },
  { key: 'bank',        icon: '🏦', label: 'بنوك'         },
  { key: 'post_office', icon: '📮', label: 'مكاتب بريد'  },
  { key: 'fuel',        icon: '⛽', label: 'وقود'         },
  { key: 'school',      icon: '🏫', label: 'مدارس'        },
  { key: 'hotel',       icon: '🏨', label: 'فنادق'        },
]

function MapPoiSuggestionsBar({
  city, currentPoi, onSend,
}: { city: string; currentPoi: string; onSend: (msg: string) => void }) {
  const chips = _MAP_POI_CHIPS.filter(c => c.key !== currentPoi).slice(0, 5)
  if (!city || !chips.length) return null
  return (
    <div className="dz-map-poi-suggestions">
      <span className="dz-map-poi-suggestions-label">
        <MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />
        ابحث في {city}:
      </span>
      <div className="dz-map-poi-suggestions-row">
        {chips.map(c => (
          <button
            key={c.key}
            className="dz-map-poi-btn"
            onClick={() => onSend(`${c.label} في ${city}`)}
          >
            <span className="dz-map-poi-btn-icon">{c.icon}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function MapPreview({ mapHtml, mapMeta }: { mapHtml: string; mapMeta?: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(true)
  const meta = mapMeta || {}
  const s = (v: unknown) => String(v ?? '')

  const isRoute = meta.type === 'route'
  const isPoi   = meta.type === 'poi'

  const title = isRoute
    ? `🗺️ مسار: ${s(meta.from)} → ${s(meta.to)}`
    : isPoi
      ? `${s(meta.poiIcon) || '📍'} ${s(meta.poiNameAr) || 'خريطة'} في ${s(meta.locationName) || 'الجزائر'}`
      : `📍 ${s(meta.locationName) || 'الجزائر'}`

  // Google Maps embed URL (primary) or legacy Leaflet HTML
  const gmapsUrl = meta.gmapsUrl ? String(meta.gmapsUrl) : null

  // External links
  const locationFr  = s(meta.locationFr || meta.locationName || '')
  const fromLat = meta.fromLat ? Number(meta.fromLat) : null
  const fromLng = meta.fromLng ? Number(meta.fromLng) : null
  const toLat   = meta.toLat   ? Number(meta.toLat)   : null
  const toLng   = meta.toLng   ? Number(meta.toLng)   : null

  const gmapsOpen   = isPoi
    ? (meta.specificName && locationFr
        ? `https://www.google.com/maps/search/${encodeURIComponent(s(meta.specificName) + ' ' + locationFr + ' Algeria')}`
        : `https://www.google.com/maps/search/${encodeURIComponent(s(meta.poiNameAr) + ' ' + locationFr + ' Algeria')}`)
    : isRoute
      ? (fromLat && fromLng && toLat && toLng
          ? `https://www.google.com/maps/dir/${fromLat},${fromLng}/${toLat},${toLng}`
          : `https://www.google.com/maps/dir/${encodeURIComponent(s(meta.fromFr) + ' Algeria')}/${encodeURIComponent(s(meta.toFr) + ' Algeria')}`)
      : `https://www.google.com/maps/search/${encodeURIComponent(locationFr + ' Algeria')}`

  const lat = meta.lat ? Number(meta.lat) : null
  const lng = meta.lng ? Number(meta.lng) : null
  const osmOpen = lat && lng
    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`
    : `https://www.openstreetmap.org`

  return (
    <div className="dz-map-card">
      <div className="dz-map-card-header" onClick={() => setExpanded(e => !e)}>
        <div className="dz-map-card-title">
          <MapPin size={14} style={{ color: '#00ff90', flexShrink: 0 }} />
          <span>{title}</span>
          {isRoute && !!meta.distanceKm && (
            <span className="dz-map-badge dz-map-badge--orange">📏 {s(meta.distanceKm)} كم</span>
          )}
          {isRoute && !!meta.durationMin && (
            <span className="dz-map-badge dz-map-badge--subtle">⏱️ {s(meta.durationMin)} د</span>
          )}
        </div>
        <div className="dz-map-card-controls">
          <span className="dz-map-badge dz-map-badge--subtle">Google Maps</span>
          <span className="dz-map-collapse-btn">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="dz-map-iframe-wrap">
          {gmapsUrl ? (
            <iframe
              src={gmapsUrl}
              width="100%"
              height="380"
              style={{ border: 'none', display: 'block' }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              title={title}
            />
          ) : mapHtml && mapHtml.length > 50 ? (
            <iframe
              srcDoc={mapHtml}
              style={{ width: '100%', height: '380px', border: 'none', display: 'block' }}
              sandbox="allow-scripts allow-same-origin"
              title={title}
            />
          ) : null}
        </div>
      )}

      <div className="dz-map-card-actions">
        <a className="dz-map-action-btn dz-map-action-btn--gmaps" href={gmapsOpen} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
          <MapPin size={11} /> فتح في Google Maps
        </a>
        {!isRoute && (lat && lng || locationFr) && (
          <a
            className="dz-map-action-btn dz-map-action-btn--route"
            href={
              meta.specificName && locationFr
                ? `https://www.google.com/maps/dir//${encodeURIComponent(String(meta.specificName) + ' ' + locationFr + ' Algeria')}`
                : meta.poiNameAr && locationFr
                  ? `https://www.google.com/maps/dir//${encodeURIComponent(String(meta.poiNameAr) + ' ' + locationFr + ' Algeria')}`
                  : lat && lng
                    ? `https://www.google.com/maps/dir//${lat},${lng}`
                    : `https://www.google.com/maps/dir//${encodeURIComponent(locationFr + ' Algeria')}`
            }
            target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          >
            🚗 إنشاء مسار
          </a>
        )}
        <a className="dz-map-action-btn dz-map-action-btn--osm" href={osmOpen} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
          🗺️ OpenStreetMap
        </a>
      </div>
      <div className="dz-map-card-footer">
        Google Maps Embed · © <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · مجاني 🇩🇿
      </div>
    </div>
  )
}

// ===== BRANCHES PANEL =====
function BranchesPanel({ branches, repo }: { branches: BranchItem[]; repo: string }) {
  return (
    <div className="gh-list-panel">
      <div className="gh-list-header">
        <GitBranch size={14} />
        <span>الفروع ({branches.length}) — {repo.split('/')[1]}</span>
      </div>
      {branches.map(b => (
        <div key={b.name} className="gh-branch-item">
          <div className="gh-branch-left">
            <GitBranch size={12} className="gh-branch-icon" />
            <span className="gh-branch-name">{b.name}</span>
            {b.protected && (
              <span className="gh-badge gh-badge--protected"><Lock size={9} /> محمي</span>
            )}
          </div>
          <span className="gh-branch-sha">{b.sha}</span>
        </div>
      ))}
    </div>
  )
}

// ===== ISSUES PANEL =====
function IssuesPanel({ issues, repo }: { issues: IssueItem[]; repo: string }) {
  const formatDate = (d: string) => new Date(d).toLocaleDateString('ar-DZ', { month: 'short', day: 'numeric' })
  return (
    <div className="gh-list-panel">
      <div className="gh-list-header">
        <AlertCircle size={14} />
        <span>المشاكل المفتوحة ({issues.length}) — {repo.split('/')[1]}</span>
      </div>
      {issues.length === 0 ? (
        <div className="gh-list-empty"><CheckCircle2 size={14} /> لا توجد مشاكل مفتوحة</div>
      ) : issues.map(issue => (
        <div key={issue.number} className="gh-issue-item">
          <div className="gh-issue-top">
            <span className="gh-issue-num">#{issue.number}</span>
            <span className="gh-issue-title">{issue.title}</span>
            <a href={issue.html_url} target="_blank" rel="noreferrer" className="gh-item-link">
              <ExternalLink size={11} />
            </a>
          </div>
          <div className="gh-issue-meta">
            <span className="gh-issue-user"><Users size={10} /> {issue.user}</span>
            <span className="gh-issue-date"><Clock size={10} /> {formatDate(issue.updated_at)}</span>
            {issue.comments > 0 && <span className="gh-issue-comments"><MessageSquare size={10} /> {issue.comments}</span>}
            {issue.labels.map(l => <span key={l} className="gh-label"><Tag size={9} /> {l}</span>)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== PULLS PANEL =====
function PullsPanel({ pulls, repo }: { pulls: PullItem[]; repo: string }) {
  const formatDate = (d: string) => new Date(d).toLocaleDateString('ar-DZ', { month: 'short', day: 'numeric' })
  return (
    <div className="gh-list-panel">
      <div className="gh-list-header">
        <GitPullRequest size={14} />
        <span>Pull Requests ({pulls.length}) — {repo.split('/')[1]}</span>
      </div>
      {pulls.length === 0 ? (
        <div className="gh-list-empty"><CheckCircle2 size={14} /> لا توجد Pull Requests مفتوحة</div>
      ) : pulls.map(pr => (
        <div key={pr.number} className={`gh-pr-item ${pr.draft ? 'gh-pr-item--draft' : ''}`}>
          <div className="gh-issue-top">
            <span className="gh-issue-num">#{pr.number}</span>
            {pr.draft && <span className="gh-badge gh-badge--draft">Draft</span>}
            <span className="gh-issue-title">{pr.title}</span>
            <a href={pr.html_url} target="_blank" rel="noreferrer" className="gh-item-link">
              <ExternalLink size={11} />
            </a>
          </div>
          <div className="gh-issue-meta">
            <span className="gh-issue-user"><Users size={10} /> {pr.user}</span>
            <span className="gh-pr-branch"><GitBranch size={10} /> {pr.head} → {pr.base}</span>
            <span className="gh-issue-date"><Clock size={10} /> {formatDate(pr.updated_at)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== STATS PANEL =====
function StatsPanel({ stats }: { stats: RepoStats }) {
  const totalBytes = Object.values(stats.languages).reduce((a, b) => a + b, 0) || 1
  const formatSize = (kb: number) => kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`
  const formatDate = (d: string) => new Date(d).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'short', day: 'numeric' })
  return (
    <div className="gh-stats-panel">
      <div className="gh-list-header">
        <BarChart2 size={14} />
        <span>إحصائيات — {stats.name}</span>
      </div>
      <div className="gh-stats-grid">
        <div className="gh-stat-card">
          <Star size={14} className="gh-stat-icon" style={{ color: '#fbbf24' }} />
          <span className="gh-stat-value">{stats.stars?.toLocaleString()}</span>
          <span className="gh-stat-label">نجمة</span>
        </div>
        <div className="gh-stat-card">
          <GitBranch size={14} className="gh-stat-icon" style={{ color: '#c084fc' }} />
          <span className="gh-stat-value">{stats.forks?.toLocaleString()}</span>
          <span className="gh-stat-label">Fork</span>
        </div>
        <div className="gh-stat-card">
          <AlertCircle size={14} className="gh-stat-icon" style={{ color: '#fb923c' }} />
          <span className="gh-stat-value">{stats.open_issues?.toLocaleString()}</span>
          <span className="gh-stat-label">مشكلة</span>
        </div>
        <div className="gh-stat-card">
          <Activity size={14} className="gh-stat-icon" style={{ color: '#4ade80' }} />
          <span className="gh-stat-value">{formatSize(stats.size)}</span>
          <span className="gh-stat-label">الحجم</span>
        </div>
      </div>
      {Object.keys(stats.languages).length > 0 && (
        <div className="gh-stats-langs">
          <div className="gh-stats-section-title"><Search size={12} /> اللغات</div>
          <div className="gh-langs-bar">
            {Object.entries(stats.languages).slice(0, 6).map(([lang, bytes]) => (
              <div
                key={lang}
                className="gh-lang-segment"
                style={{ width: `${(bytes / totalBytes) * 100}%` }}
                title={`${lang}: ${((bytes / totalBytes) * 100).toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="gh-langs-legend">
            {Object.entries(stats.languages).slice(0, 6).map(([lang, bytes]) => (
              <span key={lang} className="gh-lang-item">
                {lang} <span className="gh-lang-pct">{((bytes / totalBytes) * 100).toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {stats.contributors?.length > 0 && (
        <div className="gh-stats-contribs">
          <div className="gh-stats-section-title"><Users size={12} /> المساهمون</div>
          {stats.contributors.map(c => (
            <div key={c.login} className="gh-contrib-item">
              <span className="gh-contrib-name">{c.login}</span>
              <span className="gh-contrib-count">{c.contributions} مساهمة</span>
            </div>
          ))}
        </div>
      )}
      <div className="gh-stats-dates">
        <span><Clock size={10} /> أُنشئ: {formatDate(stats.created_at)}</span>
        <span><RefreshCw size={10} /> آخر تحديث: {formatDate(stats.updated_at)}</span>
        <span><GitBranch size={10} /> الفرع الرئيسي: {stats.default_branch}</span>
      </div>
    </div>
  )
}




// ===== MAIN COMPONENT =====
interface DZChatBoxProps {
  chatId?: string | null
  language?: 'ar' | 'en' | 'fr'
  onTitleChange?: (title: string) => void
  onAgentModeChange?: (state: AgentModeState) => void
  cerebrasKey?: string
}

type DashboardContext = { priority: 'weather'; city: string; cityAr?: string }

// ===== FIND INPUT CARD =====
function FindInputCard({ repo, onSearch }: { repo: string; onSearch: (pattern: string) => void }) {
  const [pattern, setPattern] = useState('')
  const repoName = repo.split('/')[1] || repo
  return (
    <div className="dzc-find-card">
      <div className="dzc-find-title">
        <Search size={14} />
        <span>بحث عن ملف في <code>{repoName}</code></span>
      </div>
      <div className="dzc-find-row">
        <input
          className="dzc-find-input"
          placeholder="مثال: App.tsx أو *.config.js أو README"
          value={pattern}
          onChange={e => setPattern(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && pattern.trim()) onSearch(pattern.trim()) }}
          dir="ltr"
          autoFocus
        />
        <button
          className="dzc-find-search-btn"
          disabled={!pattern.trim()}
          onClick={() => { if (pattern.trim()) onSearch(pattern.trim()) }}
        >
          <Search size={13} />
          <span>بحث</span>
        </button>
      </div>
      <p className="dzc-find-hint">أدخل اسم ملف أو امتداده مثل <code>*.tsx</code> — يبحث في كل مجلدات المستودع</p>
    </div>
  )
}

function FindDialog({ repo, onSearch, onClose }: { repo: string; onSearch: (pattern: string) => void; onClose: () => void }) {
  const [pattern, setPattern] = useState('')
  const repoName = repo ? (repo.split('/')[1] || repo) : ''
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSearch = () => {
    const p = pattern.trim()
    if (p) onSearch(p)
  }

  return (
    <div className="dzc-find-dialog-overlay" onClick={onClose}>
      <div className="dzc-find-dialog" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="dzc-find-dialog-header">
          <div className="dzc-find-dialog-title">
            <Search size={16} />
            <span>بحث عن ملف{repoName ? <> في <code>{repoName}</code></> : ''}</span>
          </div>
          <button className="dzc-find-dialog-close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="dzc-find-dialog-body">
          <input
            ref={inputRef}
            className="dzc-find-dialog-input"
            placeholder="اسم الملف أو النمط — مثال: App.tsx أو *.config.js"
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
            dir="ltr"
          />
          <button
            className="dzc-find-dialog-btn"
            disabled={!pattern.trim()}
            onClick={handleSearch}
          >
            <Search size={14} />
            <span>بحث</span>
          </button>
        </div>
        <p className="dzc-find-dialog-hint">
          يمكنك استخدام <code>*</code> كبطاقة بدل — مثل <code>*.tsx</code> أو <code>*.config.js</code>
        </p>
      </div>
    </div>
  )
}

const QUICK_ACTIONS = [
  { icon: '💻', label: 'اكتب كود',      desc: 'Python · JavaScript · أي لغة',  color: '#10a37f', cmd: 'اكتب لي كود Python يحسب متتالية فيبوناتشي' },
  { icon: '🌤️', label: 'الطقس الآن',   desc: 'الجزائر والمدن',                color: '#38bdf8', cmd: 'ما طقس الجزائر العاصمة الآن؟' },
  { icon: '📰', label: 'آخر الأخبار',   desc: 'جزائر · عرب · عالم',           color: '#f59e0b', cmd: 'أخبرني بآخر أخبار الجزائر اليوم' },
  { icon: '🌐', label: 'أنشئ موقعاً',  desc: 'HTML · CSS · تصميم احترافي',   color: '#a78bfa', cmd: 'أنشئ لي صفحة ويب احترافية باللغة العربية' },
  { icon: '⚽', label: 'مباريات اليوم', desc: 'دوري جزائري · LFP',            color: '#4ade80', cmd: 'ترتيب الدوري الجزائري المحترف LFP وجدول الفرق' },
  { icon: '💱', label: 'سعر الصرف',    desc: 'دولار · يورو · دينار',          color: '#fbbf24', cmd: 'سعر الدولار واليورو مقابل الدينار الجزائري اليوم' },
  { icon: '🐙', label: 'GitHub',        desc: 'مستودعات · كود · نشر',         color: '#94a3b8', cmd: 'اعرض مستودعاتي على GitHub' },
  { icon: '🤖', label: 'ذكاء اصطناعي', desc: 'ChatGPT · Gemini · نماذج',     color: '#fb923c', cmd: 'ما هي أبرز أخبار الذكاء الاصطناعي هذا الأسبوع؟' },
  { icon: '🎬', label: 'إشرح بالفيديو', desc: 'فيديوهات تعليمية · فوتوشوب',  color: '#e879f9', cmd: 'بالفيديو شرح أدوات الفوتوشوب' },
  { icon: '🖼️', label: 'ولد صورة',     desc: 'صور بالذكاء الاصطناعي · 4K',   color: '#f43f5e', cmd: 'أنشئ صورة\nلسيارة سوداء فاخرة تسير في شوارع العاصمة الجزائرية الحديثة، لقطة سينمائية واقعية للغاية في وضح النهار، أشعة شمس طبيعية مشرقة تنعكس على هيكل السيارة الأسود اللامع، تفاصيل دقيقة جداً لسيارة Audi مع انعكاسات واقعية على الزجاج والطلاء، شوارع الجزائر العاصمة مليئة بالحياة، أشخاص يتحركون بشكل طبيعي، محلات تجارية جزائرية ولافتات عربية وفرنسية واقعية، سيارات أخرى متوقفة ومارة بشكل عفوي، أرصفة حضرية نظيفة، أجواء متوسطية دافئة، تصوير احترافي بعدسة سينمائية، عمق ميدان طبيعي، ظلال وإضاءة فيزيائية واقعية، تفاصيل عالية جداً للمدينة والوجوه والملابس، جودة Ultra Realistic، photorealistic، cinematic lighting، realistic reflections، dynamic urban life، highly detailed، 8K، HDR، natural colors، realistic street photography style، بدون تشوهات، بدون عناصر كرتونية، مظهر فيلم سينمائي احترافي جداً' },
  { icon: '📄', label: 'سيرة ذاتية',   desc: 'CV احترافي · جاهز للتحميل',    color: '#06b6d4', cmd: 'إنشأ سيرة ذاتية' },
  { icon: '⬛', label: 'كود QR',        desc: 'رمز QR مخصص · سريع',           color: '#8b5cf6', cmd: 'إنشأ كود QR خاص بي' },
]

const TICKER_ITEMS = [
  '🏥 ابحث عن طبيب أو صيدلية قريبة',
  '🕌 أقرب مسجد وأوقات الصلاة فوراً',
  '🎬 ابحث بالفيديو واحصل على ملخص فوري',
  '🌐 ابنِ موقعاً كاملاً بجملة واحدة',
  '💻 اكتب وصحّح الكود بكل اللغات',
  '⚽ تابع الدوري الجزائري لحظةً بلحظة',
  '💱 سعر الصرف الجزائري في الوقت الفعلي',
  '🗣️ ترجمة الدارجة الجزائرية بدقة',
  '🚀 ارفع مشروعك على GitHub مباشرةً',
  '📖 ابحث في القرآن الكريم واستمع إليه',
  '🗺️ ابحث عن أي مكان في الجزائر',
  '📊 أنشئ تقارير وإحصاءات احترافية',
  '🎓 ابحث في موضوعات التعليم والدراسة',
  '📰 آخر الأخبار الجزائرية والعربية',
  '🤖 DZ Agent — مساعدك الجزائري 24/7',
  '🖼️ ولّد صوراً احترافية بالذكاء الاصطناعي',
  '🎙️ تحدّث بصوتك واحصل على ردود فورية',
  '📂 حلّل Excel وCSV وPDF في ثوانٍ',
  '🔍 بحث حي على الإنترنت بنتائج دقيقة',
  '✍️ اكتب مقالات ورسائل احترافية',
  '📱 صمّم تطبيقات جوال بالوصف فقط',
  '🧮 حلّ المسائل الرياضية والفيزيائية',
  '🌍 ترجمة عربية ↔ فرنسية ↔ إنجليزية',
  '🎨 صمّم واجهات ويب بالذكاء الاصطناعي',
  '📋 استخرج النصوص من الصور وPDF',
  '🔒 راجع الكود أمنياً واكتشف الثغرات',
  '📡 طقس كل ولايات الجزائر فورياً',
  '🎵 استمع للراديو الجزائري مباشرة',
  '🏗️ أنشئ قواعد بيانات ونماذج جاهزة',
  '💡 أفكار إبداعية لمشاريعك فوراً',
]

// ── TickerText: مكوّن معزول تماماً عن إعادات رسم DZChatBox
// السبب: عند وضع الوكيل تحدث إعادات رسم متكررة جداً (streaming/actionLog/messages)
// وكانت تُلغي setTimeout قبل أن ينفّذ فيتجمّد النص. React.memo يمنع أي تأثير خارجي.
const TickerText = memo(function TickerText() {
  const [twText,  setTwText]  = useState('')
  const [twIdx,   setTwIdx]   = useState(0)
  const [twPhase, setTwPhase] = useState<'typing' | 'pausing' | 'deleting'>('typing')

  useEffect(() => {
    const FULL         = TICKER_ITEMS[twIdx]
    const TYPE_SPEED   = 38
    const DELETE_SPEED = 22
    const PAUSE_MS     = 2400

    if (twPhase === 'typing') {
      if (twText.length < FULL.length) {
        const t = setTimeout(() => setTwText(FULL.slice(0, twText.length + 1)), TYPE_SPEED)
        return () => clearTimeout(t)
      } else {
        const t = setTimeout(() => setTwPhase('pausing'), PAUSE_MS)
        return () => clearTimeout(t)
      }
    }
    if (twPhase === 'pausing') {
      setTwPhase('deleting')
      return
    }
    if (twPhase === 'deleting') {
      if (twText.length > 0) {
        const t = setTimeout(() => setTwText(prev => prev.slice(0, -1)), DELETE_SPEED)
        return () => clearTimeout(t)
      } else {
        setTwIdx(prev => (prev + 1) % TICKER_ITEMS.length)
        setTwPhase('typing')
      }
    }
  }, [twText, twIdx, twPhase])

  return (
    <div className="dz-ticker-wrap" aria-hidden="true">
      <span className="dz-ticker-item">
        {twText}
        <span className={`dz-tw-cursor${twPhase === 'pausing' ? ' dz-tw-cursor--blink' : ''}`}>|</span>
      </span>
    </div>
  )
})

export default function DZChatBox({ chatId, language = 'ar', onTitleChange, onAgentModeChange, cerebrasKey }: DZChatBoxProps) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<DZMessage[]>(() => {
    if (!chatId) return []
    try {
      const saved = localStorage.getItem(`dz-agent-msgs-${chatId}`)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [showFindDialog, setShowFindDialog] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isAdvancedCloneLoading, setIsAdvancedCloneLoading] = useState(false)
  const [cloneProgress, setCloneProgress] = useState<CloneProgressState | null>(null)
  const [renderKey] = useState(0)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [typingId, setTypingId] = useState<string | null>(null)
  const [ttsState, setTtsState] = useState<{ id: string; status: 'loading' | 'playing' } | null>(null)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const [thinkingStep, setThinkingStep] = useState<ThinkingStep | null>(null)
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([])
  const [agentTaskType, setAgentTaskType] = useState<string | null>(null)
  const [liveReActSteps, setLiveReActSteps] = useState<ReActStep[]>([])
  const [isGithubReActLoading, setIsGithubReActLoading] = useState(false)
  const [isClaudeMode, setIsClaudeMode] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [cmdHistory, setCmdHistory] = useState<string[]>([])
  const historyIdxRef = useRef<number>(-1)
  const [showAgentBar, setShowAgentBar] = useState(true)
  const [agentHintGlow, setAgentHintGlow] = useState(false)
  const [_isGeneratingPlan, setIsGeneratingPlan] = useState(false)
  const [githubToken, setGithubToken] = useState<string>('')
  const [serverGithubConnected, setServerGithubConnected] = useState(false)
  const [oauthEnabled, setOauthEnabled] = useState(false)
  const [githubUser, setGithubUser] = useState<{
    login: string; name: string; avatar: string; url: string; repos: number;
    bio?: string | null; company?: string | null; location?: string | null;
    followers?: number; following?: number; joinYear?: string | number;
  } | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([])
  const [showLog, setShowLog] = useState(false)
  const [articlePopupUrl, setArticlePopupUrl] = useState<string | null>(null)
  const [currentRepo, setCurrentRepo] = useState<string>('')
  const [imgRegenLoading, setImgRegenLoading] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{
    images: Array<{ url: string; fullUrl?: string; title: string; source?: string; sourceUrl?: string; creator?: string }>
    idx: number
    prompt?: string
  } | null>(null)

  // ── Lightbox keyboard navigation ──────────────────────────────────────────
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setLightbox(null); return }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setLightbox(prev => prev ? { ...prev, idx: (prev.idx + 1) % prev.images.length } : null)
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setLightbox(prev => prev ? { ...prev, idx: (prev.idx - 1 + prev.images.length) % prev.images.length } : null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox])
  const [searchStepsQuery, setSearchStepsQuery] = useState<string | null>(null)
  const [searchStepsMode, setSearchStepsMode] = useState<'person' | 'weather' | 'sports' | 'news'>('person')
  const [currentPath, setCurrentPath] = useState<string>('')
  // DZ GitHub Agent mode
  const [ghAgentRepo, setGhAgentRepo] = useState<string>('')
  const [ghAgentAutoExecute, setGhAgentAutoExecute] = useState(false)
  const [showGhAgentInput, setShowGhAgentInput] = useState(false)
  // Web Reader bar
  const [showWebReaderBar, setShowWebReaderBar] = useState(false)
  const [webReaderUrl, setWebReaderUrl] = useState('')

  // ===== HYBRID AGENT MODE =====
  const [agentMode, setAgentMode] = useState<AgentModeState>(() => ({
    active: false, githubToken: '', selectedRepo: '', autoConfirm: false,
  }))
  // Pending confirmation dialog for destructive actions
  const [pendingAgentCmd, setPendingAgentCmd] = useState<{
    cmd: string; args: string; label: string; resolve: (ok: boolean) => void
  } | null>(null)
  const [dismissedNavSuggestions, setDismissedNavSuggestions] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastSendRef = useRef<number>(0)  // debounce: prevent duplicate sends
  const streamingMsgIdRef = useRef<string | null>(null)  // tracks the in-progress SSE message
  const pendingDoctorGpsRef = useRef<{ lat: number; lon: number; city: string } | null>(null)
  const planApprovalRef = useRef<{
    msgId: string
    resolve: (approved: boolean) => void
    query: string
    outboundMessages: Array<{role: string; content: string}>
    signal: AbortSignal
    executor: (q: string, m: Array<{role: string; content: string}>, s: AbortSignal) => Promise<void>
  } | null>(null)
  const [ratings, setRatings] = useState<RatingsStore>(loadRatings)
  const [activeYouTubeVideo, setActiveYouTubeVideo] = useState<YouTubeVideoData | null>(null)
  // Ref mirrors the state so sendMessage() always reads the latest value synchronously
  // (React setState is async — calling sendMessage() right after setActiveYouTubeVideo()
  //  would still read the old state value without this ref)
  const activeYouTubeVideoRef = useRef<YouTubeVideoData | null>(null)
  // Smart Video Selection — stores last search results so they can be sent as candidates
  const youtubeCandidatesRef = useRef<YouTubeResult[]>([])
  // Project Memory — stores dz-agent.md content fetched from the selected repo
  const projectMemoryRef = useRef<string>('')
  const [projectMemoryLoaded, setProjectMemoryLoaded] = useState<string>('')  // repo name when loaded

  // ===== PROJECT MEMORY: auto-fetch dz-agent.md when repo is selected =====
  useEffect(() => {
    const repo = agentMode.selectedRepo
    if (!repo) { projectMemoryRef.current = ''; setProjectMemoryLoaded(''); return }
    // Already loaded for this repo
    if (projectMemoryLoaded === repo) return
    const tok = agentMode.githubToken || githubToken
    const params = new URLSearchParams({ repo, branch: 'main', ...(tok ? { token: tok } : {}) })
    fetch(`/api/dz-agent/github/project-memory?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.exists && d.content) {
          projectMemoryRef.current = d.content
          setProjectMemoryLoaded(repo)
        } else {
          projectMemoryRef.current = ''
          setProjectMemoryLoaded('')
        }
      })
      .catch(() => { projectMemoryRef.current = ''; setProjectMemoryLoaded('') })
  }, [agentMode.selectedRepo, agentMode.githubToken, githubToken, projectMemoryLoaded])

  // ===== SYNC agentMode token → githubToken so all API calls work =====
  useEffect(() => {
    if (agentMode.githubToken && agentMode.githubToken !== githubToken) {
      saveToken(agentMode.githubToken)
    }
  }, [agentMode.githubToken])

  // ===== NOTIFY PARENT OF AGENT MODE CHANGES =====
  useEffect(() => { onAgentModeChange?.(agentMode) }, [agentMode, onAgentModeChange])



  // ===== WORKSPACE ACTIVATION: show welcome/resume message in chat =====
  const prevActivatedRepoRef = useRef<string>('')
  useEffect(() => {
    if (!agentMode.active || !agentMode.selectedRepo) return
    if (prevActivatedRepoRef.current === agentMode.selectedRepo) return
    prevActivatedRepoRef.current = agentMode.selectedRepo

    // Sync currentRepo immediately
    setCurrentRepo(agentMode.selectedRepo)

    const repo = agentMode.selectedRepo
    const repoName = repo.split('/')[1] || repo
    const repoUrl = `https://github.com/${repo}`

    // Wait 900ms for project memory fetch to settle, then show welcome message
    const tid = setTimeout(() => {
      if (projectMemoryRef.current) {
        // Resume session — memory loaded
        const memPreview = projectMemoryRef.current
          .split('\n')
          .filter(l => l.startsWith('- **') || l.startsWith('- [x]') || l.startsWith('- [ ]'))
          .slice(0, 6)
          .join('\n')
        addAssistantMessage({
          content: `📋 **استئناف العمل — [\`${repoName}\`](${repoUrl})**\n\nوجدت سجل جلسة سابقة في \`dz-agent.md\`:\n\n${memPreview || projectMemoryRef.current.slice(0, 400)}\n\n> **الوكيل جاهز للاستكمال من حيث توقفنا.** أخبرني ماذا تريد فعله.`,
          richType: 'text',
        })
      } else {
        // Fresh workspace — no memory yet
        addAssistantMessage({
          content: `🚀 **الوكيل نشط — مستودع العمل: [\`${repoName}\`](${repoUrl})**\n\nلا يوجد سجل عمل سابق في هذا المستودع.\n\nسيُنشئ الوكيل ملف \`dz-agent.md\` تلقائياً بعد أول عملية — يُخزّن فيه:\n- 📌 هيكل المشروع\n- ✅ المهام المنجزة\n- 🔲 المهام المتبقية\n- 📎 الملفات الأساسية\n\n> **ابدأ بإخباري ماذا تريد بناءه أو تعديله.**`,
          richType: 'text',
        })
      }
    }, 900)
    return () => clearTimeout(tid)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentMode.active, agentMode.selectedRepo])

  const sendRating = useCallback((msgId: string, vote: RatingVote, query: string) => {
    const updated = persistRating(msgId, vote)
    setRatings(updated)
    const actualVote = updated[msgId]
    if (actualVote) {
      fetch('/api/dz-agent/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: msgId, vote: actualVote, query }),
      }).catch(() => {})
    }
  }, [])

  // Handle OAuth callback from URL hash & auth errors from URL params
  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#gh_oauth=')) {
      const token = hash.replace('#gh_oauth=', '')
      if (token) {
        setGithubToken(token)
        localStorage.removeItem('dz-agent-gh-token')
        try { window.dispatchEvent(new Event('dz-agent-gh-token-change')) } catch {}
        // Sync OAuth token into agentMode so AgentModeBar can use it immediately
        setAgentMode(prev => ({ ...prev, githubToken: token }))
        window.history.replaceState(null, '', '/dz-agent')
        // Auto-fetch user info and repos after OAuth connect
        fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0' }
        }).then(r => r.json()).then(u => {
          setGithubUser({ login: u.login, name: u.name || u.login, avatar: u.avatar_url, url: u.html_url, repos: u.public_repos })
        }).catch(() => {})
      }
    }
    const params = new URLSearchParams(window.location.search)
    const err = params.get('auth_error')
    if (err) {
      const errMsg = err === 'denied'
        ? 'رفضت الإذن على GitHub.'
        : err === 'csrf'
        ? 'فشل التحقق الأمني (CSRF). حاول مجدداً.'
        : err === 'config'
        ? 'GitHub OAuth غير مُهيَّأ على الخادم.'
        : 'فشل الاتصال بـ GitHub. حاول مجدداً.'
      setAuthError(errMsg)
      window.history.replaceState(null, '', '/dz-agent')
    }
    localStorage.removeItem('dz-agent-gh-token')
  }, [])


  // Check server GitHub connection on mount
  useEffect(() => {
    fetch('/api/dz-agent/github/status')
      .then(r => r.json())
      .then(d => {
        if (d.connected) setServerGithubConnected(true)
        if (d.oauthEnabled) setOauthEnabled(true)
        if (d.user) setGithubUser(d.user)
      })
      .catch(() => {})
  }, [])


  // Save messages to localStorage when they change
  useEffect(() => {
    if (!chatId) return
    try {
      localStorage.setItem(`dz-agent-msgs-${chatId}`, JSON.stringify(messages))
    } catch {}
    // Update chat title from first user message
    const firstUser = messages.find(m => m.role === 'user')
    if (firstUser && onTitleChange) {
      const title = firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? '...' : '')
      onTitleChange(title)
    }
  }, [messages, chatId, onTitleChange])

  // Auto-scroll — only when messages update (streaming content), NOT when loading ends
  const _prevMsgLenRef = useRef(0)
  useEffect(() => {
    const newLen = messages.length
    const grew = newLen > _prevMsgLenRef.current
    _prevMsgLenRef.current = newLen
    if (newLen === 0) return
    // Scroll only while actively loading/streaming OR when a new message is appended
    if (isLoading || grew) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 180) + 'px'
    }
  }, [input])

  const addToLog = useCallback((entry: Omit<ActionLogEntry, 'timestamp'>) => {
    setActionLog(prev => [{
      ...entry,
      timestamp: new Date().toLocaleTimeString(),
    }, ...prev])
  }, [])

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-2), { ...t, id }])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const saveToken = useCallback((t: string) => {
    setGithubToken(t)
    localStorage.removeItem('dz-agent-gh-token')
    try { window.dispatchEvent(new Event('dz-agent-gh-token-change')) } catch {}
  }, [])

  const copyMessage = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const TTS_VOICE_BY_LANG: Record<string, string> = {
    ar: 'ar-EG-ShakirNeural',
    fr: 'fr-FR-RemyMultilingualNeural',
    en: 'fr-FR-RemyMultilingualNeural',
  }

  const speakMessage = useCallback(async (msgId: string, text: string) => {
    if (ttsState?.id === msgId && ttsState.status === 'playing') {
      ttsAudioRef.current?.pause()
      if (ttsAudioRef.current?.src) URL.revokeObjectURL(ttsAudioRef.current.src)
      ttsAudioRef.current = null
      setTtsState(null)
      return
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause()
      try { URL.revokeObjectURL(ttsAudioRef.current.src) } catch {}
      ttsAudioRef.current = null
    }
    setTtsState({ id: msgId, status: 'loading' })
    try {
      const voice = TTS_VOICE_BY_LANG[language || 'ar'] || 'ar-EG-ShakirNeural'
      const resp = await fetch('/api/tts/edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, lang: language || 'ar' }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'TTS failed' }))
        throw new Error(err.error || `HTTP ${resp.status}`)
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      ttsAudioRef.current = audio
      audio.onended = () => {
        try { URL.revokeObjectURL(url) } catch {}
        ttsAudioRef.current = null
        setTtsState(null)
      }
      audio.onerror = () => {
        try { URL.revokeObjectURL(url) } catch {}
        ttsAudioRef.current = null
        setTtsState(null)
      }
      await audio.play()
      setTtsState({ id: msgId, status: 'playing' })
    } catch {
      setTtsState(null)
    }
  }, [ttsState, language])

  const addAssistantMessage = useCallback((msg: Omit<DZMessage, 'id' | 'role'>) => {
    const id = generateId()
    // Parse navigation suggestion from content
    let finalMsg = { ...msg }
    if (msg.content && (msg.richType === 'text' || !msg.richType)) {
      const navSugg = parseNavSuggestion(msg.content)
      if (navSugg) {
        finalMsg = { ...finalMsg, content: stripNavSuggestion(msg.content), navigateSuggestion: navSugg }
      }
    }
    setMessages(prev => [...prev, { ...finalMsg, id, role: 'assistant' }])
    if (msg.richType === 'youtube' && msg.youtubeFlow === 'url' && msg.youtubeVideo) {
      const enrichedVideo: YouTubeVideoData = {
        ...msg.youtubeVideo,
        captionText: msg.captionText || undefined,
      }
      setActiveYouTubeVideo(enrichedVideo)
      activeYouTubeVideoRef.current = enrichedVideo
      // Clear candidates once a video is selected and analyzed
      youtubeCandidatesRef.current = []
    }
    // Smart Video Selection — cache search candidates for ordinal resolution
    if (msg.richType === 'youtube' && msg.youtubeFlow === 'search' && Array.isArray(msg.youtubeResults) && msg.youtubeResults.length > 0) {
      youtubeCandidatesRef.current = msg.youtubeResults
    }
    if (msg.richType === 'text' || !msg.richType) setTypingId(id)
    return id
  }, [])

  // ===== DOCTOR GPS READY — inject assistant question then wait for specialty =====
  const handleDoctorGpsReady = useCallback((lat: number, lon: number, city: string) => {
    pendingDoctorGpsRef.current = { lat, lon, city }
    const locationLabel = city || 'موقعك'
    addAssistantMessage({
      content: `أنت الآن في **${locationLabel}** 📍\nما اختصاص الطبيب الذي تريد أن تبحث عنه؟`,
      richType: 'text',
    })
  }, [addAssistantMessage])

  // ===== GITHUB AUTH ERROR MESSAGE (دارجة) =====
  const GH_AUTH_ERR = '⚠️ فشل الاتصال بـ GitHub. تحقق من صلاحيات التوكن أو أعد الاتصال من زر **وكيل** في الأسفل.'

  // ===== GITHUB ACTIONS =====
  const fetchRepos = useCallback(async () => {
    if (!githubToken && !serverGithubConnected) {
      addAssistantMessage({
        content: '😎 لتحت اختار **وكيل** وسجّل الدخول إلى GitHub',
        richType: 'text',
      })
      return
    }
    setIsLoading(true)
    setThinkingStep({ type: 'list', label: 'جلب المستودعات من GitHub...' })
    addToLog({ type: 'list-repos', description: 'Listing GitHub repositories', status: 'pending' })
    try {
      const res = await fetch('/api/dz-agent/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch repos')
      const repoCount = Array.isArray(data.repos) ? data.repos.length : 0
      if (repoCount === 0) {
        addAssistantMessage({
          content: 'لم أعثر على أي مستودعات مرتبطة بهذا الحساب. تأكد أن صلاحيات التوكن تشمل **repo** و **read:user**، أو أنشئ مستودعاً جديداً على GitHub أولاً.',
          richType: 'text',
        })
      } else {
        addAssistantMessage({
          content: `✅ تم العثور على **${repoCount}** مستودعاً — اختر واحداً للبدء:`,
          richType: 'repos',
          repos: data.repos,
        })
      }
      addToLog({ type: 'list-repos', description: `Listed ${repoCount} repositories`, status: 'success' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `Failed to fetch repositories: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'list-repos', description: `Error: ${msg}`, status: 'error' })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const fetchFiles = useCallback(async (repo: string, path = '', branch?: string, passedToken?: string) => {
    const effectiveTok = passedToken || githubToken
    if (!effectiveTok && !serverGithubConnected) {
      addAssistantMessage({ content: '🔐 يجب الاتصال بـ GitHub أولاً — انقر على زر **وكيل** في الأسفل ثم "اتصل بـ GitHub".', richType: 'text', isError: true })
      return
    }
    // Strip leading/trailing slashes to avoid GitHub API 404
    const cleanPath = path.replace(/^\/+|\/+$/g, '')
    setIsLoading(true)
    setThinkingStep({ type: 'read', label: `قراءة الملفات في ${repo.split('/')[1] || repo}${cleanPath ? '/' + cleanPath : ''}...` })
    addToLog({ type: 'list-files', description: `Browsing ${repo}${cleanPath ? '/' + cleanPath : ''}`, status: 'pending', repo })
    try {
      const res = await fetch('/api/dz-agent/github/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: effectiveTok, repo, path: cleanPath, ...(branch ? { branch } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch files')
      setCurrentRepo(repo)
      setCurrentPath(cleanPath)
      if (data.empty || !data.files || data.files.length === 0) {
        const treePath = cleanPath || ''
        addAssistantMessage({
          content: `📂 المجلد \`${cleanPath || '/'}\` في **${repo}** لا يحتوي على ملفات مباشرة.\n\n> للتأكد، يمكنك عرض الشجرة الكاملة للمجلد باستخدام الأمر \`/tree${treePath ? ' ' + treePath : ''}\``,
          richType: 'text',
          actionButtons: [{ label: '🌳 عرض ملفات المجلد', cmd: `/tree${treePath ? ' ' + treePath : ''}` }],
        })
      } else {
        addAssistantMessage({ content: `Files in ${repo}${cleanPath ? '/' + cleanPath : '/'}:`, richType: 'files', files: data.files })
      }
      addToLog({ type: 'list-files', description: `Listed ${(data.files || []).length} files in ${repo}`, status: 'success', repo })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `❌ فشل جلب الملفات: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'list-files', description: `Error: ${msg}`, status: 'error' })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, serverGithubConnected, addToLog, addAssistantMessage])

  const fetchFileContent = useCallback(async (repo: string, path: string, passedToken?: string) => {
    const effectiveTok = passedToken || githubToken
    if (!effectiveTok && !serverGithubConnected) {
      addAssistantMessage({ content: '🔐 يجب الاتصال بـ GitHub أولاً — انقر على زر **وكيل** في الأسفل ثم "اتصل بـ GitHub".', richType: 'text', isError: true })
      return
    }
    setIsLoading(true)
    setThinkingStep({ type: 'read', label: `قراءة الملف: ${path.split('/').pop()}...` })
    addToLog({ type: 'read-file', description: `Reading ${path} from ${repo}`, status: 'pending', repo })
    try {
      const res = await fetch('/api/dz-agent/github/file-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: effectiveTok, repo, path }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to read file')
      addAssistantMessage({ content: `Content of ${path}:`, richType: 'file-content', fileContent: { path, content: data.content, repo } })
      addToLog({ type: 'read-file', description: `Read ${path} (${data.content.split('\n').length} lines)`, status: 'success', repo })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `❌ فشل قراءة الملف: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'read-file', description: `Error reading ${path}: ${msg}`, status: 'error' })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, serverGithubConnected, addToLog, addAssistantMessage])

  const analyzeCode = useCallback(async (repo: string, path: string, content: string) => {
    setIsLoading(true)
    setThinkingStep({ type: 'analyze', label: `تحليل الكود في ${path.split('/').pop()}...` })
    addToLog({ type: 'analyze-code', description: `Analyzing ${path}`, status: 'pending', repo })
    try {
      const res = await fetch('/api/dz-agent/github/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, path, content }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')

      if (data.structured && data.analysis && typeof data.analysis === 'object') {
        addAssistantMessage({
          content: `تحليل: ${path}`,
          richType: 'code-analysis',
          codeAnalysis: { data: data.analysis as CodeAnalysisData, filePath: path, fileContent: content, repo },
        })
      } else {
        addAssistantMessage({ content: typeof data.analysis === 'string' ? data.analysis : JSON.stringify(data.analysis, null, 2), richType: 'text' })
      }
      addToLog({ type: 'analyze-code', description: `Analysis complete for ${path}`, status: 'success', repo })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `Analysis failed: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'analyze-code', description: `Error: ${msg}`, status: 'error' })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [addToLog, addAssistantMessage])

  const executeCodeAction = useCallback(async (
    action: CodeActionType,
    filePath: string,
    fileContent: string,
    repo: string,
    issue?: CodeIssue | CodeImprovement
  ) => {
    setIsLoading(true)
    const stepMap: Record<string, ThinkingStep> = {
      fix_code:       { type: 'write', label: 'إصلاح الكود...' },
      explain_error:  { type: 'analyze', label: 'شرح الخطأ...' },
      improve_code:   { type: 'write', label: 'تحسين الكود...' },
      apply_repo_fix: { type: 'analyze', label: 'إعداد Git Diff...' },
      rescan_repo:    { type: 'scan', label: 'إعادة الفحص...' },
    }
    setThinkingStep(stepMap[action] || { type: 'analyze', label: 'معالجة...' })
    const actionLabels: Record<string, string> = {
      fix_code: `إصلاح: ${(issue as CodeIssue)?.issue || ''}`,
      explain_error: `شرح الخطأ: ${(issue as CodeIssue)?.issue || ''}`,
      improve_code: `تحسين: ${(issue as CodeImprovement)?.title || (issue as CodeIssue)?.issue || filePath}`,
      apply_repo_fix: `Git Diff لـ: ${(issue as CodeIssue)?.issue || ''}`,
      rescan_repo: `إعادة فحص: ${filePath}`,
    }
    addToLog({ type: 'code-action', description: actionLabels[action] || action, status: 'pending', repo })
    try {
      const res = await fetch('/api/dz-agent/github/code-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, issue, filePath, fileContent, repo, language: '' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')

      if (data.structured && data.action === 'rescan_repo' && typeof data.content === 'object') {
        addAssistantMessage({
          content: `إعادة فحص: ${filePath}`,
          richType: 'code-analysis',
          codeAnalysis: { data: data.content as CodeAnalysisData, filePath, fileContent, repo },
        })
      } else {
        const prefix: Record<string, string> = {
          fix_code: '🔧 **الكود المُصلح:**\n\n',
          explain_error: '📖 **شرح الخطأ:**\n\n',
          improve_code: '✨ **الكود المُحسّن:**\n\n',
          apply_repo_fix: '📋 **Git Diff:**\n\n',
          rescan_repo: '🔄 **نتائج الفحص المحدّثة:**\n\n',
        }
        addAssistantMessage({ content: (prefix[action] || '') + data.content, richType: 'text' })
      }
      addToLog({ type: 'code-action', description: actionLabels[action], status: 'success', repo })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل الإجراء: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'code-action', description: `Error: ${msg}`, status: 'error', repo })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [addToLog, addAssistantMessage])

  const prepareEdit = useCallback((fileContent: { path: string; content: string; repo: string }) => {
    setInput(`Edit file "${fileContent.path}" in ${fileContent.repo} and fix any issues or improve the code.`)
    textareaRef.current?.focus()
  }, [])

  const handleExportRepos = useCallback((repos: RepoItem[]) => {
    if (repos.length === 0) return
    const firstRepo = repos[0]
    setCurrentRepo(firstRepo.full_name)
    addAssistantMessage({
      content: repos.length > 1
        ? `✅ تم اختيار **${repos.length}** مستودعات — النشط الآن: **${firstRepo.name}** — اختر إجراءً:`
        : `✅ تم اختيار **${firstRepo.name}** — اختر إجراءً:`,
      richType: 'repo-selected',
      selectedRepo: firstRepo,
    })
  }, [addAssistantMessage])

  const selectRepo = useCallback((repo: RepoItem) => {
    setCurrentRepo(repo.full_name)
    addAssistantMessage({
      content: `تم اختيار **${repo.name}** — اختر إجراءً:`,
      richType: 'repo-selected',
      selectedRepo: repo,
    })
  }, [addAssistantMessage])

  const fetchBranches = useCallback(async (repo: RepoItem) => {
    setIsLoading(true)
    setThinkingStep({ type: 'list', label: `جلب فروع ${repo.name}...` })
    addToLog({ type: 'list-branches', description: `Listing branches for ${repo.name}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch branches')
      addAssistantMessage({ content: `الفروع في ${repo.name}:`, richType: 'branches', branches: data.branches, selectedRepo: repo })
      addToLog({ type: 'list-branches', description: `Listed ${data.branches.length} branches`, status: 'success', repo: repo.full_name })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل جلب الفروع: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'list-branches', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const fetchIssues = useCallback(async (repo: RepoItem) => {
    setIsLoading(true)
    setThinkingStep({ type: 'list', label: `جلب مشاكل ${repo.name}...` })
    addToLog({ type: 'list-issues', description: `Listing issues for ${repo.name}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch issues')
      addAssistantMessage({ content: `المشاكل في ${repo.name}:`, richType: 'issues', issues: data.issues, selectedRepo: repo })
      addToLog({ type: 'list-issues', description: `Listed ${data.issues.length} issues`, status: 'success', repo: repo.full_name })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل جلب المشاكل: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'list-issues', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const fetchPulls = useCallback(async (repo: RepoItem) => {
    setIsLoading(true)
    setThinkingStep({ type: 'list', label: `جلب Pull Requests لـ ${repo.name}...` })
    addToLog({ type: 'list-pulls', description: `Listing PRs for ${repo.name}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/pulls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch PRs')
      addAssistantMessage({ content: `Pull Requests في ${repo.name}:`, richType: 'pulls', pulls: data.pulls, selectedRepo: repo })
      addToLog({ type: 'list-pulls', description: `Listed ${data.pulls.length} PRs`, status: 'success', repo: repo.full_name })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل جلب PRs: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'list-pulls', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const fetchStats = useCallback(async (repo: RepoItem) => {
    setIsLoading(true)
    setThinkingStep({ type: 'analyze', label: `جلب إحصائيات ${repo.name}...` })
    addToLog({ type: 'repo-stats', description: `Fetching stats for ${repo.name}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch stats')
      addAssistantMessage({ content: `إحصائيات ${repo.name}:`, richType: 'stats', stats: data, selectedRepo: repo })
      addToLog({ type: 'repo-stats', description: `Stats fetched for ${repo.name}`, status: 'success', repo: repo.full_name })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل جلب الإحصائيات: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'repo-stats', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const scanRepo = useCallback(async (repo: RepoItem, focus?: string) => {
    setIsLoading(true)
    const stepLabel = focus === 'bugs' ? 'البحث عن الأخطاء...' : focus === 'security' ? 'الفحص الأمني...' : focus === 'suggest' ? 'توليد الاقتراحات...' : focus === 'fix' ? 'إعداد الإصلاحات...' : 'الفحص الشامل...'
    setThinkingStep({ type: focus === 'security' ? 'scan' : focus === 'fix' ? 'write' : 'analyze', label: stepLabel })
    addToLog({ type: 'repo-scan', description: `Scanning ${repo.name}${focus ? ` (${focus})` : ''}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/repo-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name, focus }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      const scannedList = data.filesScanned?.map((f: string) => `\`${f}\``).join(' · ') || ''
      addAssistantMessage({
        content: `## 🔍 تقرير المستودع: \`${repo.name}\`\n**الملفات المفحوصة:** ${scannedList}\n\n${data.analysis}`,
        richType: 'text',
      })
      addToLog({ type: 'repo-scan', description: `Scan complete — ${data.filesScanned?.length || 0} files`, status: 'success', repo: repo.full_name })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `فشل الفحص: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'repo-scan', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  // ── AI: Analyze Project ───────────────────────────────────────────────────
  const analyzeProject = useCallback(async (repo: RepoItem) => {
    setIsLoading(true)
    setThinkingStep({ type: 'analyze', label: 'قراءة المشروع وتحليله بالذكاء الاصطناعي...' })
    addToLog({ type: 'repo-scan', description: `AI analyzing ${repo.name}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/analyze-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name, branch: 'main' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      const techInfo = data.meta?.techStack?.length ? `\n> **Stack:** ${data.meta.techStack.join(' · ')}` : ''
      const fileInfo = data.meta?.fileCount ? ` | 📄 ${data.meta.fileCount} ملف` : ''
      addAssistantMessage({
        content: `## 🔬 تحليل مشروع: \`${repo.name}\`${fileInfo}${techInfo}\n\n${data.analysis}`,
        richType: 'text',
      })
      addToLog({ type: 'repo-scan', description: `Analysis complete — ${data.meta?.fileCount || 0} files`, status: 'success', repo: repo.full_name })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `❌ فشل تحليل المشروع: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'repo-scan', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  // ── AI: Generate and Push ─────────────────────────────────────────────────
  const generateAndPush = useCallback(async (repo: RepoItem, description: string) => {
    setIsLoading(true)
    setThinkingStep({ type: 'write', label: 'توليد الكود بالذكاء الاصطناعي...' })
    addToLog({ type: 'commit', description: `Generating: ${description.slice(0, 60)}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/generate-and-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: githubToken,
          repo: repo.full_name,
          description,
        }),
      })
      const data = await res.json()
      if (!res.ok && !data.generated) throw new Error(data.error || 'Generation failed')

      if (!data.pushed) {
        addAssistantMessage({
          content: `## ⚡ كود مولَّد لـ \`${repo.name}\`\n\n${data.message || ''}\n\n${data.generated}`,
          richType: 'text',
        })
      } else {
        const filesStr = data.files?.map((f: string) => `- \`${f}\``).join('\n') || ''
        const prLink = data.pr?.url ? `\n\n### 🔗 Pull Request\n[#${data.pr.number} ${data.pr.title}](${data.pr.url})` : ''
        addAssistantMessage({
          content: `## ✅ تم توليد الكود ورفعه لـ \`${repo.name}\`\n\n**الفرع:** \`${data.branch}\`\n\n**الملفات المرفوعة:**\n${filesStr}${prLink}\n\n---\n\n${data.generated}`,
          richType: 'text',
        })
        addToLog({ type: 'commit', description: `Pushed ${data.files?.length || 0} files — PR ${data.pr?.number || 'N/A'}`, status: 'success', repo: repo.full_name })
        addToast({ type: 'commit', title: `تم الرفع ✓ — ${repo.name}`, desc: `${data.files?.length || 0} ملف${data.pr?.url ? ' · PR مفتوح' : ''}`, link: data.pr?.url, linkLabel: data.pr?.url ? `PR #${data.pr.number}` : undefined })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `❌ فشل توليد الكود: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'commit', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  // ── AI: Improve Design ────────────────────────────────────────────────────
  const improveDesign = useCallback(async (repo: RepoItem, style = 'modern dark') => {
    setIsLoading(true)
    setThinkingStep({ type: 'write', label: 'تحليل وتحسين التصميم بالذكاء الاصطناعي...' })
    addToLog({ type: 'commit', description: `Improving UI design — ${repo.name}`, status: 'pending', repo: repo.full_name })
    try {
      const res = await fetch('/api/dz-agent/github/improve-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, repo: repo.full_name, style }),
      })
      const data = await res.json()
      if (!data.success && data.message) {
        addAssistantMessage({ content: `⚠️ ${data.message}`, richType: 'text' })
        return
      }
      if (!res.ok) throw new Error(data.error || 'Design improvement failed')
      const prLink = data.pr?.url ? `\n\n### 🔗 Pull Request\n[#${data.pr.number} عرض التغييرات](${data.pr.url})` : ''
      const pushStatus = data.pushed ? `✅ تم رفع ${data.files?.length || 0} ملف` : '⚠️ تعذّر الرفع التلقائي — راجع الكود أدناه'
      addAssistantMessage({
        content: `## 🎨 تحسين تصميم \`${repo.name}\`\n\n${pushStatus}${prLink}\n\n${data.improved}`,
        richType: 'text',
      })
      addToLog({ type: 'commit', description: `Design improved — ${data.files?.length || 0} files`, status: 'success', repo: repo.full_name })
      addToast({ type: 'push', title: `تم تحسين التصميم 🎨 — ${repo.name}`, desc: `${data.files?.length || 0} ملف مُحدَّث`, link: data.pr?.url, linkLabel: data.pr?.url ? `PR #${data.pr.number}` : undefined })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `❌ فشل تحسين التصميم: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'commit', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  // ── Deploy to GitHub Pages ────────────────────────────────────────────────
  const deployToGitHubPages = useCallback(async (repo: RepoItem) => {
    setIsLoading(true)
    setThinkingStep({ type: 'deploy', label: 'نشر المشروع على GitHub Pages...' })
    addToLog({ type: 'deploy', description: `Deploying ${repo.name} to GitHub Pages`, status: 'pending', repo: repo.full_name })
    const [owner, repoName] = repo.full_name.split('/')
    try {
      const res = await fetch('/api/dz-agent/github/pages/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: githubToken, owner, repo: repoName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'GitHub Pages deploy failed')
      const siteUrl = data.siteUrl || `https://${owner}.github.io/${repoName}`
      addAssistantMessage({
        content: `## 🌐 تم بدء النشر على GitHub Pages\n\n**المستودع:** \`${repo.name}\`\n**رابط الموقع:** [${siteUrl}](${siteUrl})\n**الحالة:** جاري البناء... (يستغرق 1-2 دقيقة)\n\n> الرابط سيصبح نشطاً بعد اكتمال بناء GitHub Actions.`,
        richType: 'text',
      })
      addToLog({ type: 'deploy', description: `GitHub Pages deploy triggered — ${siteUrl}`, status: 'success', repo: repo.full_name })
      addToast({ type: 'deploy', title: `تم بدء النشر — ${repo.name}`, desc: 'يستغرق 1-2 دقيقة', link: siteUrl, linkLabel: siteUrl })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      addAssistantMessage({ content: `❌ فشل النشر على GitHub Pages: ${msg}`, richType: 'text', isError: true })
      addToLog({ type: 'deploy', description: `Error: ${msg}`, status: 'error', repo: repo.full_name })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [githubToken, addToLog, addAssistantMessage])

  const handleRepoAction = useCallback(async (action: string, repo: RepoItem) => {
    setCurrentRepo(repo.full_name)
    switch (action) {
      case 'analyze-project':
        await analyzeProject(repo)
        break
      case 'generate-push': {
        // Prompt user for description inline
        const desc = window.prompt(`صف الميزة أو الكود الذي تريد توليده لـ ${repo.name}:`)
        if (desc?.trim()) await generateAndPush(repo, desc.trim())
        break
      }
      case 'improve-design': {
        const style = window.prompt('أسلوب التصميم المطلوب (مثال: modern dark / minimal / glassmorphism):', 'modern dark')
        await improveDesign(repo, style || 'modern dark')
        break
      }
      case 'deploy-pages':
        await deployToGitHubPages(repo)
        break
      case 'scan':
        await scanRepo(repo)
        break
      case 'bugs':
        await scanRepo(repo, 'bugs')
        break
      case 'security':
        await scanRepo(repo, 'security')
        break
      case 'suggest':
        await scanRepo(repo, 'suggest')
        break
      case 'fix':
        await scanRepo(repo, 'fix')
        break
      case 'report':
        await scanRepo(repo, 'report')
        break
      case 'files':
        await fetchFiles(repo.full_name)
        break
      case 'branches':
        await fetchBranches(repo)
        break
      case 'issues':
        await fetchIssues(repo)
        break
      case 'pulls':
        await fetchPulls(repo)
        break
      case 'stats':
        await fetchStats(repo)
        break
      case 'pr':
        setInput(`أنشئ Pull Request جديد في مستودع ${repo.name} — صف التغييرات المطلوبة والفرع المصدر`)
        textareaRef.current?.focus()
        break
      case 'commit':
        setInput(`قم بعمل Commit في مستودع ${repo.name} — صف التعديل الذي تريد حفظه`)
        textareaRef.current?.focus()
        break
    }
  }, [analyzeProject, generateAndPush, improveDesign, deployToGitHubPages, scanRepo, fetchFiles, fetchBranches, fetchIssues, fetchPulls, fetchStats])

  const executeApprovedAction = useCallback(async (action: PendingAction, msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, pendingAction: undefined, content: 'Action approved. Executing...' } : m))
    setIsLoading(true)

    if (action.type === 'commit') {
      addToLog({ type: 'commit', description: `Committing ${action.path} to ${action.repo}`, status: 'pending', repo: action.repo })
      try {
        const res = await fetch('/api/dz-agent/github/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: githubToken, ...action }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Commit failed')
        addAssistantMessage({ content: `Commit successful!\n\n**File:** ${action.path}\n**Repo:** ${action.repo}\n**Branch:** ${action.branch}\n**Message:** ${action.message}\n\n[View on GitHub](${data.html_url})`, richType: 'text' })
        addToLog({ type: 'commit', description: `Committed ${action.path} — "${action.message}"`, status: 'success', repo: action.repo })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        addAssistantMessage({ content: `Commit failed: ${msg}`, richType: 'text', isError: true })
        addToLog({ type: 'commit', description: `Commit error: ${msg}`, status: 'error', repo: action.repo })
      }
    } else if (action.type === 'pr') {
      addToLog({ type: 'create-pr', description: `Creating PR in ${action.repo}`, status: 'pending', repo: action.repo })
      try {
        const res = await fetch('/api/dz-agent/github/pr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: githubToken, ...action }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'PR creation failed')
        addAssistantMessage({ content: `Pull Request created!\n\n**Title:** ${action.title}\n**Repo:** ${action.repo}\n**Branch:** ${action.branch} → ${action.base}\n\n[View PR](${data.html_url})`, richType: 'text' })
        addToLog({ type: 'create-pr', description: `Created PR: "${action.title}"`, status: 'success', repo: action.repo })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        addAssistantMessage({ content: `PR creation failed: ${msg}`, richType: 'text', isError: true })
        addToLog({ type: 'create-pr', description: `PR error: ${msg}`, status: 'error', repo: action.repo })
      }
    }

    setIsLoading(false)
  }, [githubToken, addToLog, addAssistantMessage])

  // ===== ADVANCED CLONE ENGINE V2 (SSE streaming with progress stages) =====
  const handleAdvancedClone = useCallback(async (url: string, section?: string) => {
    if (isAdvancedCloneLoading) return
    setIsAdvancedCloneLoading(true)

    const sectionLabel = section && section !== 'full' ? ` — قسم: ${section}` : ''

    // Init progress panel (replaces old text loading message)
    setCloneProgress({ stage: 'fetch', pct: 5, label: 'راني نخمم، جارٍ جلب الموقع...', url })

    const STAGE_LABELS: Record<string, string> = {
      fetch:    'راني نخمم، جارٍ جلب الموقع...',
      extract:  'جارٍ قراءة التصميم والألوان...',
      generate: 'الذكاء الاصطناعي يبني الاستنساخ...',
      repair:   'جارٍ تحرير وإصلاح الكود...',
      download: 'جارٍ جلب الأصول الحقيقية...',
      done:     'اكتمل!',
    }

    try {
      // Use SSE streaming endpoint for real-time progress
      const res = await fetch('/api/dz-agent/clone-v2/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, section: section || 'full' }),
      })

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalData: Record<string, unknown> | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) continue
          if (!line.startsWith('data: ')) continue
          try {
            const parsed = JSON.parse(line.slice(6))

            if (parsed.stage) {
              // Progress update — feed the CloneProgressPanel
              setCloneProgress({
                stage: parsed.stage,
                pct: parsed.pct || 0,
                label: STAGE_LABELS[parsed.stage] || parsed.message || parsed.stage,
                url,
                tech: parsed.tech || [],
                sections: parsed.sections || [],
              })
            } else if (parsed.ok !== undefined) {
              // Final result
              finalData = parsed
            } else if (parsed.error) {
              // Error event
              setCloneProgress(null)
              addAssistantMessage({
                content: `⚠️ ${parsed.error}`,
                richType: 'text',
                isError: true,
              })
              return
            }
          } catch {
            // skip malformed SSE line
          }
        }
      }

      // Flash done stage briefly
      setCloneProgress(prev => prev ? { ...prev, stage: 'done', pct: 100, label: 'اكتمل!' } : null)
      await new Promise(r => setTimeout(r, 600))
      setCloneProgress(null)

      if (!finalData) throw new Error('No result received')

      if (!finalData.ok) {
        addAssistantMessage({
          content: `⚠️ ${finalData.error || 'فشل الاستنساخ. جرّب الاستنساخ السريع بدلاً من ذلك.'}`,
          richType: 'text',
          isError: true,
        })
        return
      }

      const data = finalData as Record<string, unknown>
      const dlMeta = data.download as { zipDownloadUrl?: string; zipSessionId?: string; stats?: Record<string, unknown> } | null
      if (data.isWebsite && typeof data.htmlCode === 'string' && data.htmlCode.length > 100) {
        trackFeatureUsage('advanced-clone-v2')
        addAssistantMessage({
          content: (data.content as string) || `✅ تم الاستنساخ المتقدم V2${sectionLabel}!`,
          richType: 'website',
          htmlCode: data.htmlCode as string,
          cssCode: (data.cssCode as string) || '',
          jsCode:  (data.jsCode  as string) || '',
          webBuilderMeta: data.webBuilderMeta as { type: string; style: string; title: string; description: string; icon: string } | undefined,
          webReaderIntent: 'build',
          zipDownloadUrl: dlMeta?.zipDownloadUrl || undefined,
        })
      } else {
        addAssistantMessage({
          content: (data.error as string) || '⚠️ لم يتمكن المحرك من توليد الكود.',
          richType: 'text',
          isError: true,
        })
      }
    } catch (err) {
      // SSE failed — fallback to old clone-advanced endpoint
      setCloneProgress({ stage: 'fetch', pct: 10, label: 'وضع احتياطي — جارٍ الاستنساخ...', url })
      try {
        const fallbackRes = await fetch('/api/dz-agent/clone-advanced', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, section: section || 'full' }),
        })
        const fallbackData = await fallbackRes.json()
        setCloneProgress(null)

        if (fallbackData.ok && fallbackData.htmlCode) {
          trackFeatureUsage('advanced-clone')
          addAssistantMessage({
            content: fallbackData.content || `✅ تم الاستنساخ${sectionLabel}!`,
            richType: 'website',
            htmlCode: fallbackData.htmlCode,
            cssCode: fallbackData.cssCode || '',
            jsCode:  fallbackData.jsCode  || '',
            webBuilderMeta: fallbackData.webBuilderMeta,
            webReaderIntent: 'build',
          })
        } else {
          addAssistantMessage({
            content: `⚠️ ${fallbackData.error || 'فشل الاستنساخ. يرجى المحاولة مرة أخرى.'}`,
            richType: 'text',
            isError: true,
          })
        }
      } catch {
        setCloneProgress(null)
        addAssistantMessage({
          content: '⚠️ خطأ في الشبكة أثناء الاستنساخ. يرجى المحاولة مرة أخرى.',
          richType: 'text',
          isError: true,
        })
      }
    } finally {
      setIsAdvancedCloneLoading(false)
    }
  }, [isAdvancedCloneLoading, addAssistantMessage, setMessages])

  // ===== AUTONOMOUS QUERY DETECTION =====
  const detectAutonomousQuery = useCallback((query: string): boolean => {
    const q = query.toLowerCase()
    // Website builder already handles these separately — don't intercept
    if (/أنش[ئئ]\s+موقع|صمم\s+صفحة|landing\s+page|portfolio\s+site|صفحة\s+ويب/i.test(q)) return false
    if (/استنسخ|clone\s+website|انسخ\s+الموقع/i.test(q)) return false
    // Don't intercept YouTube, map, weather, news queries
    if (/فيديو|يوتيوب|خريطة|طقس|أخبار|صلاة|أذان/i.test(q)) return false
    // Trigger autonomous for coding / app building
    if (/أنش[ئئ]\s+(تطبيق|برنامج|نظام|أداة|سكريبت|api|كومبوننت)/i.test(q)) return true
    if (/اكتب\s+(كود|برنامج|تطبيق|سكريبت|نظام|فنكشن)/i.test(q)) return true
    if (/(اعمل|دير)\s+(تطبيق|برنامج|نظام)/i.test(q)) return true
    if (/create\s+(app|application|script|full.?stack|backend|api|component|program)/i.test(q)) return true
    if (/build\s+(app|application|web\s+app|api|backend|frontend|service)/i.test(q)) return true
    if (/implement\s+(a|an|the)?\s*(feature|system|module|api)/i.test(q)) return true
    if (/اصلح\s+(الكود|البرنامج|الخطأ)|fix\s+(the\s+)?(code|bug|error)/i.test(q)) return true
    if (/debug|تصحيح\s+الكود|code\s+review|refactor/i.test(q)) return true
    if (/multi.?file|full.?stack|ملفات\s+متعددة/i.test(q)) return true
    if (/(react|vue|angular|next\.?js|python|django|fastapi|express|node)\s+(app|project|application|api)/i.test(q)) return true
    return false
  }, [])

  // ===== SMART TASK PLANNER =====
  const detectComplexQuery = useCallback((query: string): boolean => {
    const q = query.toLowerCase()
    if (q.length < 30) return false
    if (/^(ما|ماذا|كيف|متى|أين|من|هل|what|how|when|where|who|why|اشرح|explain)\b/.test(q)) return false
    if (/طقس|أخبار|صلاة|أذان|نتائج|كورة|يوتيوب|youtube|فيديو/i.test(q)) return false
    if (/كامل|متكامل|من\s+الصفر|احترافي|شامل|complete|full.?stack|from\s+scratch/i.test(q) &&
        /أنش[ئئ]|اصنع|ابني|صمم|اعمل|دير|create|build|make|develop/i.test(q)) return true
    const multiStep = (q.match(/ثم|و\s+بعد|أيضاً|كذلك|then|also|and\s+then|followed\s+by/g) || []).length
    if (multiStep >= 2 && /أنش[ئئ]|اصنع|ابني|create|build/i.test(q)) return true
    if (/portfolio|landing\s+page|dashboard|e-commerce|ecommerce|متجر\s+إلكتروني|لوحة\s+تحكم|موقع\s+كامل/i.test(q)) return true
    if (/ملفات\s+متعددة|multiple\s+files|multi.?file|مكونات\s+متعددة/i.test(q)) return true
    if (/(backend|frontend|واجهة|خلفية).*(و|مع).*(backend|frontend|واجهة|خلفية)/i.test(q)) return true
    const wordCount = q.split(/\s+/).length
    if (wordCount >= 14 && /أنش[ئئ]|اصنع|ابني|صمم|create|build|develop|implement/i.test(q)) return true
    return false
  }, [])

  const generateAndShowPlan = useCallback(async (
    query: string,
    outboundMessages: Array<{role: string; content: string}>,
    signal: AbortSignal,
    executor: (query: string, msgs: Array<{role: string; content: string}>, signal: AbortSignal) => Promise<void>
  ): Promise<boolean> => {
    setIsGeneratingPlan(true)

    // Add a "generating plan" placeholder in chat
    const planMsgId = generateId()
    setMessages(prev => [...prev, {
      id: planMsgId,
      role: 'assistant' as const,
      content: '',
      richType: 'task-plan' as const,
      taskPlan: undefined,
      taskPlanQuery: query,
    }])

    try {
      const resp = await fetch('/api/dz-agent/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal,
      })
      if (!resp.ok) throw new Error(`Plan API: ${resp.status}`)
      const data = await resp.json()
      const plan: TaskPlan = data.plan

      // Replace placeholder with the real plan
      setMessages(prev => prev.map(m =>
        m.id === planMsgId
          ? { ...m, taskPlan: plan, taskPlanQuery: query }
          : m
      ))
      setIsGeneratingPlan(false)

      // Wait for user approval — stored in a promise that resolves on approval/cancel
      return await new Promise<boolean>((resolve) => {
        // Store resolver so TaskPlanPanel can call it
        planApprovalRef.current = {
          msgId: planMsgId,
          resolve,
          query,
          outboundMessages,
          signal,
          executor,
        }
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setIsGeneratingPlan(false)
        setMessages(prev => prev.filter(m => m.id !== planMsgId))
        return false
      }
      // Plan generation failed — just proceed without plan
      setIsGeneratingPlan(false)
      setMessages(prev => prev.filter(m => m.id !== planMsgId))
      console.warn('[task-planner] Plan generation failed, proceeding directly:', (err as Error).message)
      return true // still execute the task
    }
  }, [])

  // ===== AUTONOMOUS SSE RUNNER =====
  const runAutonomousSSE = useCallback(async (
    query: string,
    outboundMessages: Array<{role: string; content: string}>,
    signal: AbortSignal,
  ): Promise<void> => {
    setAgentSteps([{ id: 'start', label: 'بدء التشغيل...', icon: 'think', status: 'running' }])

    let finalContent = ''
    let finalModel: string | null = null
    let finalTaskType: string | null = null

    try {
      const response = await fetch('/api/dz-agent/autonomous/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ query, messages: outboundMessages }),
        signal,
      })

      if (!response.ok || !response.body) {
        throw new Error(`SSE error: ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const event = JSON.parse(raw)
            if (event.type === 'step' && event.step) {
              setAgentSteps(prev => {
                const idx = prev.findIndex(s => s.id === event.step.id)
                if (idx >= 0) {
                  const next = [...prev]
                  next[idx] = { ...next[idx], ...event.step }
                  return next
                }
                return [...prev.filter(s => s.id !== 'start'), event.step]
              })
            } else if (event.type === 'done') {
              finalContent = event.content || ''
              finalModel = event.model || null
              finalTaskType = event.task?.type || null
            }
          } catch { /* ignore malformed events */ }
        }
      }
    } catch (err) {
      if ((err as Error).message === 'aborted' || signal.aborted) {
        setAgentSteps(prev => [...prev.filter(s => s.status !== 'running'), {
          id: 'aborted', label: 'تم الإيقاف', icon: 'error', status: 'error',
        }])
        return
      }
      // SSE failed — fall back silently to normal fetch
      setAgentSteps([])
      throw err
    }

    if (!finalContent) {
      setAgentSteps(prev => [...prev.filter(s => s.status !== 'running'), {
        id: 'error', label: 'لم يتم استلام رد', icon: 'error', status: 'error',
      }])
      finalContent = '⚠️ لم يتمكن DZ Agent من إكمال المهمة. يرجى إعادة المحاولة.'
    }

    setAgentTaskType(finalTaskType)

    addAssistantMessage({
      content: finalContent,
      richType: 'text',
      model: finalModel || undefined,
    })
  }, [addAssistantMessage])

  // ===== V5 REACT LOOP RUNNER — خلف الكواليس دعم DZ Agent الرئيسي =====
  // يستخدم ReAct loop حقيقي مع 20+ أداة GitHub — يعمل تلقائياً للمهام المركبة
  const runV5SSE = useCallback(async (
    _query: string,
    outboundMessages: Array<{role: string; content: string}>,
    signal: AbortSignal,
  ): Promise<boolean> => {
    setAgentSteps([{ id: 'v5-init', label: '🔬 تحليل المهمة...', icon: 'think', status: 'running' }])
    let resultContent = ''
    let resultModel: string | null = null
    let stepCounter = 0

    try {
      const response = await fetch('/api/dz-agent-v5/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          messages: outboundMessages,
          stream: true,
          github_token: githubToken || undefined,
        }),
        signal,
      })
      if (!response.ok || !response.body) return false

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''

        for (const block of blocks) {
          const lines = block.split('\n')
          let evName = ''
          let dataStr = ''
          for (const ln of lines) {
            if (ln.startsWith('event: ')) evName = ln.slice(7).trim()
            else if (ln.startsWith('data: ')) dataStr = ln.slice(6).trim()
          }
          if (!dataStr) continue
          try {
            const data = JSON.parse(dataStr) as Record<string, unknown>
            if (evName === 'step') {
              stepCounter++
              const { type, message, tool, args } = data as { type?: string; message?: string; tool?: string; args?: Record<string, unknown> }
              if (type === 'thinking') {
                setAgentSteps(prev => {
                  const done_ = prev.map(s => s.status === 'running' ? { ...s, status: 'done' as const } : s)
                  return [...done_, { id: `v5-think-${stepCounter}`, label: message || 'تحليل...', icon: 'think' as const, status: 'running' as const }]
                })
              } else if (type === 'action') {
                setAgentSteps(prev => {
                  const done_ = prev.map(s => s.status === 'running' ? { ...s, status: 'done' as const } : s)
                  return [...done_, {
                    id: `v5-action-${stepCounter}`,
                    label: tool ? `${tool}` : 'تنفيذ',
                    icon: 'build' as const,
                    status: 'running' as const,
                    detail: args ? JSON.stringify(args).slice(0, 80) : undefined,
                  }]
                })
              } else if (type === 'observation') {
                setAgentSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'done' as const } : s))
              } else if (type === 'error') {
                setAgentSteps(prev => {
                  const done_ = prev.map(s => s.status === 'running' ? { ...s, status: 'warn' as const } : s)
                  return [...done_, { id: `v5-warn-${stepCounter}`, label: (message as string) || 'تحذير', icon: 'warn' as const, status: 'warn' as const }]
                })
              }
            } else if (evName === 'done') {
              resultContent = (data.content as string) || ''
              resultModel = (data.model as string) || null
              setAgentSteps(prev => [
                ...prev.map(s => ({ ...s, status: 'done' as const })),
                { id: 'v5-complete', label: 'اكتملت المهمة ✓', icon: 'done' as const, status: 'done' as const },
              ])
              // Notify other components (DZNotifications) + browser push if tab hidden
              const summary = resultContent
                .replace(/```[\s\S]*?```/g, '')
                .replace(/#{1,6}\s/g, '')
                .trim()
                .slice(0, 130)
              window.dispatchEvent(new CustomEvent('dz:task-complete', {
                detail: {
                  title: '✅ اكتملت المهمة',
                  body: summary || 'تم إنجاز المهمة بنجاح',
                  model: resultModel,
                }
              }))
            } else if (evName === 'error') {
              setAgentSteps(prev => [...prev.filter(s => s.status !== 'running'), {
                id: 'v5-fatal', label: (data.message as string) || 'خطأ', icon: 'error' as const, status: 'error' as const,
              }])
            }
          } catch { /* ignore malformed */ }
        }
      }

      if (!resultContent) return false
      addAssistantMessage({ content: resultContent, richType: 'text', model: resultModel ?? undefined })
      return true
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false
      console.warn('[DZChatBox:V5] SSE failed, will fall back:', (err as Error).message)
      setAgentSteps([])
      return false
    }
  }, [githubToken, addAssistantMessage])

  // ===== CLAUDE MODE SSE RUNNER (free-claude-code approach) =====
  const runClaudeReActSSE = useCallback(async (
    query: string,
    outboundMessages: Array<{role: string; content: string}>,
    signal: AbortSignal,
  ): Promise<void> => {
    setIsGithubReActLoading(true)
    setIsClaudeMode(true)
    setLiveReActSteps([{ type: 'start', message: '🤖 Claude Mode — جاري التهيئة...' }])

    let finalContent = ''
    let finalSteps: ReActStep[] = []

    try {
      const response = await fetch('/api/dz-agent/github/claude/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          query,
          messages: outboundMessages,
          githubToken: githubToken || undefined,
          repo: agentMode.selectedRepo || currentRepo || undefined,
          projectMemory: projectMemoryRef.current ? projectMemoryRef.current.slice(0, 1500) : undefined,
        }),
        signal,
      })

      if (!response.ok || !response.body) throw new Error(`Claude SSE error: ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const event = JSON.parse(raw)
            if (event.type === 'step' && event.step) {
              setLiveReActSteps(prev => [...prev, event.step as ReActStep])
            } else if (event.type === 'done') {
              finalContent = event.content || ''
              finalSteps = (event.steps as ReActStep[]) || []
              if (event.liveUrl) {
                finalSteps = [...finalSteps, { type: 'done', content: event.content || '', liveUrl: event.liveUrl } as ReActStep]
              }
            } else if (event.type === 'error') {
              finalContent = `⚠️ خطأ في Claude Mode: ${event.message}`
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setIsGithubReActLoading(false); setIsClaudeMode(false); setLiveReActSteps([])
        return
      }
      finalContent = '⚠️ تعذّر الاتصال بـ Claude Mode. يرجى المحاولة مرة أخرى.'
    }

    setIsGithubReActLoading(false)
    setIsClaudeMode(false)
    setLiveReActSteps([])
    trackFeatureUsage('claude-react')
    addAssistantMessage({
      content: finalContent || '✅ اكتملت عمليات GitHub (Claude Mode)',
      richType: 'github-react',
      reactSteps: finalSteps,
      claudeMode: true,
    })
    if (!finalContent?.startsWith('⚠️')) {
      addToast({ type: 'commit', title: 'اكتملت عمليات GitHub ✓', desc: 'Claude Mode' })
    }
  }, [githubToken, addAssistantMessage, addToast])

  // ===== GITHUB REACT SSE RUNNER =====
  const runGithubReActSSE = useCallback(async (
    query: string,
    outboundMessages: Array<{role: string; content: string}>,
    signal: AbortSignal,
  ): Promise<void> => {
    setIsGithubReActLoading(true)
    setLiveReActSteps([{ type: 'start', message: 'جاري الاتصال بـ GitHub...' }])

    let finalContent = ''
    let finalSteps: ReActStep[] = []

    try {
      const response = await fetch('/api/dz-agent/github/react/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          query,
          messages: outboundMessages,
          githubToken: githubToken || undefined,
          repo: agentMode.selectedRepo || currentRepo || undefined,
          projectMemory: projectMemoryRef.current ? projectMemoryRef.current.slice(0, 1500) : undefined,
        }),
        signal,
      })

      if (!response.ok || !response.body) throw new Error(`SSE error: ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const event = JSON.parse(raw)
            if (event.type === 'step' && event.step) {
              setLiveReActSteps(prev => [...prev, event.step as ReActStep])
            } else if (event.type === 'done') {
              finalContent = event.content || ''
              finalSteps = (event.steps as ReActStep[]) || []
              // Attach liveUrl to the done step so the panel can show it
              if (event.liveUrl) {
                finalSteps = [...finalSteps, { type: 'done', content: event.content || '', liveUrl: event.liveUrl } as ReActStep]
              }
            } else if (event.type === 'error') {
              finalContent = `⚠️ خطأ في GitHub Agent: ${event.message}`
            }
          } catch { /* ignore malformed events */ }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setIsGithubReActLoading(false)
        setLiveReActSteps([])
        return
      }
      finalContent = `⚠️ تعذّر الاتصال بـ GitHub Agent. يرجى المحاولة مرة أخرى.`
    }

    setIsGithubReActLoading(false)
    setLiveReActSteps([])
    trackFeatureUsage('github-react')
    addAssistantMessage({
      content: finalContent || '✅ اكتملت عمليات GitHub',
      richType: 'github-react',
      reactSteps: finalSteps,
    })
    if (!finalContent?.startsWith('⚠️')) {
      addToast({ type: 'commit', title: 'اكتملت عمليات GitHub ✓', desc: 'DZ GitHub Agent' })
    }
  }, [githubToken, addAssistantMessage, addToast])

  // ===== HYBRID AGENT: confirm destructive action =====
  const confirmAgentAction = useCallback((cmd: string, args: string, label: string): Promise<boolean> => {
    return new Promise(resolve => {
      setPendingAgentCmd({ cmd, args, label, resolve })
    })
  }, [])

  // ===== HYBRID AGENT: execute slash command =====
  const executeSlashCommand = useCallback(async (cmd: string, args: string) => {
    const repo = agentMode.selectedRepo
    const tok  = agentMode.githubToken || githubToken

    if (!tok && !serverGithubConnected) {
      addAssistantMessage({ content: '😎 لتحت اختار **وكيل** وسجّل الدخول إلى GitHub', richType: 'text', isError: true })
      return
    }

    setIsLoading(true)

    try {
      // /ls — list files
      if (cmd === '/ls' || cmd === '/list') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const path = args.trim() || ''
        setThinkingStep({ type: 'list', label: `عرض ملفات ${repo}${path ? '/' + path : ''}...` })
        await fetchFiles(repo, path, undefined, tok)
        return
      }

      // /read — read file content
      if (cmd === '/read') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const path = args.trim()
        if (!path) { addAssistantMessage({ content: '⚠️ صيغة: `/read <مسار الملف>` — مثال: `/read src/App.tsx`', richType: 'text', isError: true }); return }
        setThinkingStep({ type: 'read', label: `قراءة ${path}...` })
        await fetchFileContent(repo, path, tok)
        return
      }

      // /scan — scan repo for issues
      if (cmd === '/scan') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const focus = args.trim() || undefined
        setThinkingStep({ type: 'scan', label: `فحص ${repo}...` })
        await scanRepo({ name: repo.split('/')[1] || repo, full_name: repo, description: null, language: null, private: false, default_branch: 'main', html_url: `https://github.com/${repo}` }, focus as 'bugs' | 'security' | 'suggest' | 'fix' | 'report' | undefined)
        return
      }

      // /suggest — suggestions
      if (cmd === '/suggest') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        setThinkingStep({ type: 'analyze', label: `جلب اقتراحات لـ ${repo}...` })
        await scanRepo({ name: repo.split('/')[1] || repo, full_name: repo, description: null, language: null, private: false, default_branch: 'main', html_url: `https://github.com/${repo}` }, 'suggest')
        return
      }

      // /deploy — deploy to GitHub Pages
      if (cmd === '/deploy') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const needConfirm = !agentMode.autoConfirm
        if (needConfirm) {
          const ok = await confirmAgentAction(cmd, repo, `نشر \`${repo}\` على GitHub Pages`)
          if (!ok) { addAssistantMessage({ content: 'تم إلغاء النشر.', richType: 'text' }); return }
        }
        setThinkingStep({ type: 'deploy', label: `نشر ${repo} على GitHub Pages...` })
        await deployToGitHubPages({ name: repo.split('/')[1] || repo, full_name: repo, description: null, language: null, private: false, default_branch: 'main', html_url: `https://github.com/${repo}` })
        return
      }

      // /smart-import — استيراد مستودع ذكي وتوليد ملفات Starter
      if (cmd === '/smart-import') {
        const repoName = args.trim()
        if (!repoName) {
          addAssistantMessage({ content: '⚠️ صيغة: `/smart-import <اسم المستودع>` — مثال: `/smart-import yt-dlp`', richType: 'text', isError: true })
          return
        }
        setThinkingStep({ type: 'write', label: `استيراد ${repoName}...` })
        try {
          const res = await fetch('/api/dz-agent/smart-repos/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoName, currentRepo: repo || '', token: tok || '' }),
          })
          const data = await res.json()
          if (data.success) {
            addAssistantMessage({
              content: data.message || `✅ تم استيراد **${repoName}**`,
              richType: 'text',
            })
          } else {
            addAssistantMessage({ content: `⚠️ ${data.error || 'حدث خطأ'}`, richType: 'text', isError: true })
          }
        } catch {
          addAssistantMessage({ content: '⚠️ حدث خطأ أثناء الاستيراد.', richType: 'text', isError: true })
        }
        return
      }

      // /repos — suggest GitHub repos by category or query
      if (cmd === '/repos') {
        const query = args.trim()
        setThinkingStep({ type: 'search', label: `جلب مستودعات GitHub${query ? ` لـ "${query}"` : ''}...` })
        try {
          const res = await fetch('/api/dz-agent/github/repos-suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query || 'all', token: tok }),
          })
          const data = await res.json()
          if (data.repos && data.repos.length > 0) {
            addAssistantMessage({
              content: `🔍 **مستودعات GitHub مقترحة**${query ? ` لـ "${query}"` : ''} — ${data.repos.length} مستودع:`,
              richType: 'repos-suggest',
              suggestedRepos: data.repos,
            })
          } else {
            addAssistantMessage({ content: `لم أجد مستودعات. جرّب: \`/repos web\` أو \`/repos ai\` أو \`/repos arabic\``, richType: 'text' })
          }
        } catch (err: unknown) {
          void err
          addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true })
        }
        return
      }

      // /diff — show diff (informational — route to AI with context)
      if (cmd === '/diff') {
        const diffArgs = args.trim() || 'main'
        addAssistantMessage({ content: `📊 **Git Diff** — \`${repo || 'لم يُحدد مستودع'}\`\n\nالوكيل يحلل الفرق بين: \`${diffArgs}\`\n\n> استخدم \`/scan\` لتحليل الكود مباشرة.`, richType: 'text' })
        return
      }

      // /edit — AI edit (destructive → confirmation)
      if (cmd === '/edit') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const parts = args.trim().split(/\s+/)
        const filePath = parts[0] || ''
        const instruction = parts.slice(1).join(' ')
        if (!filePath) { addAssistantMessage({ content: '⚠️ صيغة: `/edit <مسار> <تعليمات>` — مثال: `/edit server.js أضف route /ping`', richType: 'text', isError: true }); return }

        const needConfirm = !agentMode.autoConfirm
        if (needConfirm) {
          const ok = await confirmAgentAction(cmd, `${repo}/${filePath}`, `تعديل \`${filePath}\` في \`${repo}\`${instruction ? ` — "${instruction}"` : ''}`)
          if (!ok) { addAssistantMessage({ content: 'تم إلغاء التعديل.', richType: 'text' }); return }
        }

        setThinkingStep({ type: 'write', label: `تعديل ${filePath}...` })
        addToLog({ type: 'code-action', description: `Edit ${filePath}: ${instruction}`, status: 'pending', repo })

        try {
          const res = await fetch('/api/dz-agent/github/smart-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok, repo, path: filePath, instruction: instruction || 'تحسين الكود', message: `agent: edit ${filePath}` }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Edit failed')
          addAssistantMessage({ content: `✅ **تم تعديل الملف**: \`${filePath}\`\n\n**الكوميت:** \`${data.sha?.slice(0,8) || 'N/A'}\`\n\n[عرض على GitHub](https://github.com/${repo}/blob/main/${filePath})`, richType: 'text' })
          addToLog({ type: 'code-action', description: `Edited ${filePath} — ${data.sha?.slice(0,8)}`, status: 'success', repo })
        } catch (err) {
          const msg = (err as Error).message
          addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true })
          addToLog({ type: 'code-action', description: `Edit error: ${msg}`, status: 'error', repo })
        }
        return
      }

      // /commit — commit a message (destructive → confirmation)
      if (cmd === '/commit') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const message = args.replace(/^["']|["']$/g, '').trim() || 'chore: تحديث'

        const needConfirm = !agentMode.autoConfirm
        if (needConfirm) {
          const ok = await confirmAgentAction(cmd, repo, `كوميت في \`${repo}\` — "${message}"`)
          if (!ok) { addAssistantMessage({ content: 'تم إلغاء الكوميت.', richType: 'text' }); return }
        }

        setThinkingStep({ type: 'commit', label: `حفظ التغييرات في ${repo}...` })
        addToLog({ type: 'commit', description: `Commit: "${message}"`, status: 'pending', repo })

        try {
          const res = await fetch('/api/dz-agent/github/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok, repo, message, branch: 'main', path: 'README.md', content: btoa(`# ${repo.split('/')[1]}\n\n> ${message}\n`) }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Commit failed')
          addAssistantMessage({ content: `✅ **تم الكوميت**: "${message}"\n\n**SHA:** \`${(data.sha || data.commit?.sha || 'N/A').toString().slice(0,10)}\`\n\n[عرض على GitHub](https://github.com/${repo})`, richType: 'text' })
          addToLog({ type: 'commit', description: `Committed: "${message}"`, status: 'success', repo })
        } catch (err) {
          const msg = (err as Error).message
          addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true })
          addToLog({ type: 'commit', description: `Commit error: ${msg}`, status: 'error', repo })
        }
        return
      }

      // /pr — create pull request (destructive → confirmation)
      if (cmd === '/pr') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const title = args.replace(/^["']|["']$/g, '').trim() || 'feat: تحديث جديد'

        const needConfirm = !agentMode.autoConfirm
        if (needConfirm) {
          const ok = await confirmAgentAction(cmd, repo, `إنشاء Pull Request في \`${repo}\` — "${title}"`)
          if (!ok) { addAssistantMessage({ content: 'تم إلغاء إنشاء PR.', richType: 'text' }); return }
        }

        setThinkingStep({ type: 'pr', label: `إنشاء PR في ${repo}...` })
        addToLog({ type: 'create-pr', description: `PR: "${title}"`, status: 'pending', repo })

        try {
          const res = await fetch('/api/dz-agent/github/pr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok, repo, title, body: `PR أُنشئ بواسطة DZ Agent Hybrid Mode`, branch: 'feature/dz-agent', base: 'main' }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'PR creation failed')
          addAssistantMessage({ content: `✅ **Pull Request مُنشأ**: "${title}"\n\n[عرض PR](${data.html_url})`, richType: 'text' })
          addToLog({ type: 'create-pr', description: `PR created: "${title}"`, status: 'success', repo })
        } catch (err) {
          const msg = (err as Error).message
          addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true })
          addToLog({ type: 'create-pr', description: `PR error: ${msg}`, status: 'error', repo })
        }
        return
      }

      // /memory — view, save, refresh or clear the project memory (dz-agent.md)
      if (cmd === '/memory') {
        const sub = args.trim().split(/\s+/)[0]?.toLowerCase() || 'show'
        const noteText = args.trim().startsWith(sub) ? args.trim().slice(sub.length).trim() : args.trim()

        if (sub === 'clear') {
          projectMemoryRef.current = ''
          setProjectMemoryLoaded('')
          addAssistantMessage({ content: '🗑️ **ذاكرة المشروع مُفرَّغة** من الجلسة الحالية — ستُعاد قراءتها تلقائياً عند اختيار الـ repo مجدداً.', richType: 'text' })
          return
        }

        if (sub === 'refresh') {
          if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
          setProjectMemoryLoaded('')
          projectMemoryRef.current = ''
          setThinkingStep({ type: 'read', label: `تحميل dz-agent.md من ${repo}...` })
          try {
            const params = new URLSearchParams({ repo, branch: 'main', token: tok })
            const r = await fetch(`/api/dz-agent/github/project-memory?${params}`)
            const d = await r.json()
            if (d.exists && d.content) {
              projectMemoryRef.current = d.content
              setProjectMemoryLoaded(repo)
              addAssistantMessage({
                content: `✅ **تم تحديث الذاكرة** من \`${repo}/dz-agent.md\`\n\n\`\`\`markdown\n${d.content.slice(0, 1800)}\n\`\`\``,
                richType: 'text',
                quickSuggestions: ['/memory save', '/memory clear'],
              })
            } else {
              addAssistantMessage({
                content: `📭 لا يوجد ملف \`dz-agent.md\` في \`${repo}\` بعد.\n\nاستخدم \`/memory save\` لإنشائه الآن.`,
                richType: 'text',
                quickSuggestions: ['/memory save'],
              })
            }
          } catch (e) {
            addAssistantMessage({ content: `❌ خطأ في التحميل: ${(e as Error).message}`, richType: 'text', isError: true })
          }
          return
        }

        if (sub === 'save') {
          if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
          setThinkingStep({ type: 'commit', label: `حفظ ذاكرة المشروع في ${repo}...` })
          const projCtx = loadProjectContext()
          try {
            const res = await fetch('/api/dz-agent/github/project-memory', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                repo,
                branch: 'main',
                token: tok,
                context: {
                  mainLang:    projCtx.lang    || '',
                  projectType: projCtx.stack   || '',
                  keyFiles:    projCtx.files   || [],
                  lastTask:    projCtx.lastAction || '',
                  notes:       noteText || '',
                },
              }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Save failed')
            addAssistantMessage({
              content: `✅ **تم حفظ ذاكرة المشروع** في \`${repo}/dz-agent.md\`\n\n**Commit:** \`${String(data.commit || 'N/A').slice(0, 10)}\`\n\n> ستُحمَّل تلقائياً في الجلسة القادمة عند اختيار هذا المستودع.`,
              richType: 'text',
              quickSuggestions: ['/memory refresh', '/memory clear'],
            })
            setProjectMemoryLoaded('')  // trigger re-fetch on next interaction
          } catch (err) {
            addAssistantMessage({ content: `❌ فشل الحفظ: ${(err as Error).message}`, richType: 'text', isError: true })
          }
          return
        }

        // Default: /memory (show cached content)
        if (projectMemoryRef.current) {
          addAssistantMessage({
            content: `📋 **ذاكرة المشروع المحمّلة** — \`${repo || 'غير محدد'}\`\n\n\`\`\`markdown\n${projectMemoryRef.current.slice(0, 2000)}\n\`\`\`\n\n> **أوامر:** \`/memory save [ملاحظات]\` لتحديثها · \`/memory refresh\` لإعادة تحميلها · \`/memory clear\` لمسحها`,
            richType: 'text',
            quickSuggestions: ['/memory save', '/memory refresh', '/memory clear'],
          })
        } else {
          addAssistantMessage({
            content: repo
              ? `📭 **لا توجد ذاكرة محمّلة** للمستودع \`${repo}\`\n\nملف \`dz-agent.md\` غير موجود أو لم يُنشأ بعد.\n\n> استخدم \`/memory save\` لإنشائه الآن — يُحفَظ في جذر المستودع ويُحمَّل تلقائياً في كل جلسة.`
              : `⚠️ حدد مستودعاً في شريط الوكيل أولاً، ثم استخدم \`/memory\`.`,
            richType: 'text',
            quickSuggestions: repo ? ['/memory save', '/memory refresh'] : [],
          })
        }
        return
      }

      // ── /grep — بحث نصي داخل ملفات المستودع ─────────────────────
      if (cmd === '/grep') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const parts = args.trim().split(/\s+/)
        const query = parts[0] || ''
        const searchPath = parts.slice(1).join(' ') || ''
        if (!query) { addAssistantMessage({ content: '⚠️ صيغة: `/grep <نص> [مسار]` — مثال: `/grep useState src/`', richType: 'text', isError: true }); return }
        setThinkingStep({ type: 'read', label: `بحث عن "${query}"${searchPath ? ` في ${searchPath}` : ''}...` })
        try {
          const tok2 = agentMode.githubToken || githubToken
          const res = await fetch('/api/dz-agent/github/grep', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok2, repo, query, path: searchPath }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Grep failed')
          if (!data.results || data.results.length === 0) {
            addAssistantMessage({ content: `🔍 **لم يُعثر على** \`${query}\` في ${data.files_searched || 0} ملف${searchPath ? ` (${searchPath})` : ''}.`, richType: 'text' })
          } else {
            const lines = data.results.map((r: { path: string; matches: Array<{ line: number; text: string }> }) =>
              `**📄 \`${r.path}\`** — ${r.matches.length} تطابق\n` +
              r.matches.map((m: { line: number; text: string }) => `  \`L${m.line}\` ${m.text}`).join('\n')
            ).join('\n\n')
            addAssistantMessage({
              content: `🔍 **نتائج البحث عن \`${query}\`** — ${data.results.length} ملف من ${data.files_searched} مفحوص:\n\n${lines}`,
              richType: 'text',
              quickSuggestions: [`/read ${data.results[0]?.path || ''}`, `/grep ${query} src/`, `/find ${query}`],
            })
          }
        } catch (err) {
          addAssistantMessage({ content: `❌ فشل البحث: ${(err as Error).message}`, richType: 'text', isError: true })
        }
        return
      }

      // ── /find — بحث عن ملف بالاسم ──────────────────────────────
      if (cmd === '/find') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const pattern = args.trim()
        if (!pattern) {
          addAssistantMessage({ content: 'ابحث عن ملف في المستودع:', richType: 'find-input', findRepo: repo })
          setIsLoading(false)
          return
        }
        setThinkingStep({ type: 'search', label: `بحث عن ملفات "${pattern}"...` })
        try {
          const tok2 = agentMode.githubToken || githubToken
          const res = await fetch('/api/dz-agent/github/find-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok2, repo, pattern }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Find failed')
          if (!data.matches || data.matches.length === 0) {
            addAssistantMessage({ content: `🔎 **لم يُعثر على ملفات** بنمط \`${pattern}\` في \`${repo}\`.`, richType: 'text' })
          } else {
            const list = data.matches.map((m: { path: string; size: number }) =>
              `\`${m.path}\` ${m.size ? `_(${(m.size / 1024).toFixed(1)} KB)_` : ''}`
            ).join('\n')
            addAssistantMessage({
              content: `🔎 **${data.count} ملف** بنمط \`${pattern}\` في \`${repo}\`:\n\n${list}`,
              richType: 'text',
              quickSuggestions: data.matches.slice(0, 3).map((m: { path: string }) => `/read ${m.path}`),
            })
          }
        } catch (err) {
          addAssistantMessage({ content: `❌ فشل البحث: ${(err as Error).message}`, richType: 'text', isError: true })
        }
        return
      }

      // ── /history — تاريخ الـ commits ────────────────────────────
      if (cmd === '/history') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const parts = args.trim().split(/\s+/)
        const n = parseInt(parts[0]) || 15
        const branch = parts[1] || ''
        setThinkingStep({ type: 'read', label: `جلب آخر ${n} commits...` })
        try {
          const tok2 = agentMode.githubToken || githubToken
          const res = await fetch('/api/dz-agent/github/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok2, repo, per_page: n, branch }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'History failed')
          if (!data.commits || data.commits.length === 0) {
            addAssistantMessage({ content: `📭 لا توجد commits في \`${repo}\`.`, richType: 'text' })
          } else {
            const list = data.commits.map((c: { sha: string; message: string; author: string; date: string; url: string }, i: number) => {
              const d = c.date ? new Date(c.date).toLocaleDateString('ar-DZ', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
              return `${i + 1}. \`${c.sha}\` **${c.message}**\n   👤 ${c.author || 'unknown'} · 📅 ${d}`
            }).join('\n\n')
            addAssistantMessage({
              content: `📜 **آخر ${data.commits.length} commits** في \`${repo}\`${branch ? ` (${branch})` : ''}:\n\n${list}\n\n[عرض على GitHub](https://github.com/${repo}/commits)`,
              richType: 'text',
              quickSuggestions: [`/diff ${data.commits[data.commits.length-1]?.sha || 'HEAD~5'} ${data.commits[0]?.sha || 'HEAD'}`, `/history ${n * 2}`],
            })
          }
        } catch (err) {
          addAssistantMessage({ content: `❌ فشل جلب التاريخ: ${(err as Error).message}`, richType: 'text', isError: true })
        }
        return
      }

      // ── /tree — شجرة مرئية للمستودع ─────────────────────────────
      if (cmd === '/tree') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const treePath = args.trim()
        setThinkingStep({ type: 'list', label: `بناء شجرة ${treePath || 'المستودع'}...` })
        try {
          const tok2 = agentMode.githubToken || githubToken
          const res = await fetch('/api/dz-agent/github/tree', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok2, repo, path: treePath }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Tree failed')
          const items: Array<{ path: string; type: string }> = data.items || []
          const prefix = treePath ? treePath.replace(/\/$/, '') + '/' : ''
          const buildTree = (items: Array<{ path: string; type: string }>, prefix: string): string => {
            const seen = new Set<string>()
            const lines: string[] = []
            items.forEach(item => {
              const rel = item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.path
              const parts = rel.split('/')
              const depth = parts.length - 1
              const name = parts[parts.length - 1]
              const indent = '  '.repeat(depth)
              const icon = item.type === 'tree' ? '📁' : '📄'
              const key = parts.slice(0, depth).join('/')
              if (!seen.has(key) && depth > 0) { seen.add(key) }
              lines.push(`${indent}${icon} ${name}`)
            })
            return lines.slice(0, 150).join('\n')
          }
          addAssistantMessage({
            content: `🌳 **شجرة** \`${repo}${treePath ? '/' + treePath : ''}\` — ${items.length} عنصر:\n\n\`\`\`\n${buildTree(items, prefix)}\n\`\`\``,
            richType: 'text',
            quickSuggestions: [`/ls ${treePath}`, `/grep TODO ${treePath}`, '/scan'],
          })
        } catch (err) {
          void err
          addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true })
        }
        return
      }

      // ── /diff — فرق حقيقي بين فرعين ─────────────────────────────
      if (cmd === '/diff') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const diffArgs = args.trim()
        const parts = diffArgs.replace(/\.{2,3}/, ' ').split(/\s+/)
        if (parts.length < 2) {
          addAssistantMessage({ content: '⚠️ صيغة: `/diff <base> <head>` — مثال: `/diff main feature/login`', richType: 'text', isError: true })
          return
        }
        const [base, head] = parts
        setThinkingStep({ type: 'analyze', label: `مقارنة ${base}...${head}` })
        try {
          const tok2 = agentMode.githubToken || githubToken
          const res = await fetch('/api/dz-agent/github/real-diff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok2, repo, base, head }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Diff failed')
          const statusEmoji: Record<string, string> = { ahead: '⬆️', behind: '⬇️', diverged: '↔️', identical: '🟰' }
          const fileLines = (data.files || []).slice(0, 10).map((f: { filename: string; status: string; additions: number; deletions: number; patch: string }) => {
            const statusMap: Record<string, string> = { added: '🟢', removed: '🔴', modified: '🟡', renamed: '🔵' }
            const s = statusMap[f.status] || '⚪'
            return `${s} \`${f.filename}\` +${f.additions} -${f.deletions}${f.patch ? `\n\`\`\`diff\n${f.patch.slice(0, 300)}\n\`\`\`` : ''}`
          }).join('\n\n')
          addAssistantMessage({
            content: `📊 **Git Diff** \`${repo}\`: \`${base}\` ← \`${head}\`\n\n${statusEmoji[data.status] || '🔍'} **${data.status}** · ⬆️ ${data.ahead_by} commits أمام · ⬇️ ${data.behind_by} commits خلف\n\n**الملفات المتغيرة (${(data.files || []).length}):**\n\n${fileLines || '_لا تغييرات_'}`,
            richType: 'text',
            quickSuggestions: [`/history 10`, `/pr "${head} → ${base}"`, '/scan'],
          })
        } catch (err) {
          void err
          addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true })
        }
        return
      }

      // ── /issues — إدارة GitHub Issues ────────────────────────────
      if (cmd === '/issues') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const sub = args.trim().split(/\s+/)[0]?.toLowerCase() || ''
        const rest = args.trim().replace(/^\S+\s*/, '').trim()
        const tok2 = agentMode.githubToken || githubToken

        if (sub === 'new' || sub === 'create') {
          if (!rest) { addAssistantMessage({ content: '⚠️ صيغة: `/issues new <عنوان المشكلة>`', richType: 'text', isError: true }); return }
          const ok = !agentMode.autoConfirm ? await confirmAgentAction(cmd, repo, `إنشاء issue: "${rest}"`) : true
          if (!ok) { addAssistantMessage({ content: 'تم إلغاء إنشاء الـ issue.', richType: 'text' }); return }
          setThinkingStep({ type: 'write', label: `إنشاء issue: "${rest}"...` })
          try {
            const res = await fetch('/api/dz-agent/github/issues-manage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: tok2, repo, action: 'create', title: rest }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed')
            addAssistantMessage({ content: `✅ **Issue #${data.number} مُنشأة**: "${data.title}"\n\n[عرض على GitHub](${data.html_url})`, richType: 'text', quickSuggestions: ['/issues', `/issues close ${data.number}`] })
          } catch (err) { void err; addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true }) }
          return
        }

        if (sub === 'close') {
          const num = parseInt(rest)
          if (!num) { addAssistantMessage({ content: '⚠️ صيغة: `/issues close <رقم>`', richType: 'text', isError: true }); return }
          const ok = !agentMode.autoConfirm ? await confirmAgentAction(cmd, repo, `إغلاق issue #${num}`) : true
          if (!ok) { addAssistantMessage({ content: 'تم إلغاء الإغلاق.', richType: 'text' }); return }
          setThinkingStep({ type: 'write', label: `إغلاق issue #${num}...` })
          try {
            const res = await fetch('/api/dz-agent/github/issues-manage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: tok2, repo, action: 'close', issue_number: num }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed')
            addAssistantMessage({ content: `✅ **Issue #${data.number} مغلقة**\n\n[عرض على GitHub](${data.html_url})`, richType: 'text', quickSuggestions: ['/issues', '/issues closed'] })
          } catch (err) { void err; addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true }) }
          return
        }

        // Default: list issues
        const stateArg = sub === 'closed' ? 'closed' : sub === 'all' ? 'all' : 'open'
        setThinkingStep({ type: 'read', label: `جلب ${stateArg === 'open' ? 'المشاكل المفتوحة' : 'المشاكل'}...` })
        try {
          const res = await fetch('/api/dz-agent/github/issues-manage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok2, repo, action: 'list', state: stateArg }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed')
          if (!data.issues || data.issues.length === 0) {
            addAssistantMessage({ content: `📭 **لا توجد issues ${stateArg === 'open' ? 'مفتوحة' : stateArg === 'closed' ? 'مغلقة' : ''}** في \`${repo}\`.`, richType: 'text', quickSuggestions: ['/issues new أضف ميزة جديدة', '/issues all'] })
          } else {
            const list = data.issues.map((i: { number: number; title: string; state: string; user: string; labels: string[]; comments: number; html_url: string }) =>
              `**#${i.number}** ${i.state === 'open' ? '🟢' : '🔴'} ${i.title?.slice(0, 80)}\n   👤 ${i.user} · 💬 ${i.comments} · ${i.labels?.length ? i.labels.join(', ') : '_بدون label_'}`
            ).join('\n\n')
            addAssistantMessage({
              content: `🐛 **${data.count} Issues** في \`${repo}\` (${stateArg}):\n\n${list}\n\n[عرض كل Issues على GitHub](https://github.com/${repo}/issues)`,
              richType: 'text',
              quickSuggestions: ['/issues new مشكلة جديدة', '/issues closed', `/issues close ${data.issues[0]?.number}`],
            })
          }
        } catch (err) { void err; addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true }) }
        return
      }

      // ── /actions — حالة GitHub Actions ──────────────────────────
      if (cmd === '/actions') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        setThinkingStep({ type: 'analyze', label: `جلب حالة GitHub Actions...` })
        try {
          const tok2 = agentMode.githubToken || githubToken
          const res = await fetch('/api/dz-agent/github/actions-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok2, repo, per_page: 8 }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Actions failed')
          if (!data.runs || data.runs.length === 0) {
            addAssistantMessage({ content: `📭 لا توجد GitHub Actions في \`${repo}\`.`, richType: 'text' })
          } else {
            const conclusionMap: Record<string, string> = { success: '✅', failure: '❌', cancelled: '⚫', skipped: '⏭️', timed_out: '⏰', action_required: '⚠️' }
            const statusMap: Record<string, string> = { completed: '🏁', in_progress: '⏳', queued: '🔄', waiting: '⏱️' }
            const list = data.runs.map((r: { id: number; name: string; status: string; conclusion: string; branch: string; sha: string; created_at: string; html_url: string }) => {
              const icon = r.conclusion ? (conclusionMap[r.conclusion] || '❓') : (statusMap[r.status] || '❓')
              const d = r.created_at ? new Date(r.created_at).toLocaleDateString('ar-DZ') : ''
              return `${icon} **${r.name}** · \`${r.branch}\` · \`${r.sha || ''}\`\n   📅 ${d} · [عرض](${r.html_url})`
            }).join('\n\n')
            addAssistantMessage({
              content: `⚙️ **GitHub Actions** — \`${repo}\` (${data.runs.length} runs):\n\n${list}\n\n[عرض كل Actions](https://github.com/${repo}/actions)`,
              richType: 'text',
              quickSuggestions: ['/history 10', '/diff main HEAD~1', '/scan'],
            })
          }
        } catch (err) {
          void err
          addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true })
        }
        return
      }

      // ── /release — إنشاء GitHub Release ──────────────────────────
      if (cmd === '/release') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const parts = args.trim().split(/\s+/)
        const tag = parts[0] || ''
        const releaseName = parts.slice(1).join(' ')
        if (!tag) { addAssistantMessage({ content: '⚠️ صيغة: `/release <tag> [وصف]` — مثال: `/release v1.2.0 ميزات جديدة`', richType: 'text', isError: true }); return }
        const ok = !agentMode.autoConfirm ? await confirmAgentAction(cmd, repo, `إنشاء Release \`${tag}\` في \`${repo}\``) : true
        if (!ok) { addAssistantMessage({ content: 'تم إلغاء إنشاء الـ release.', richType: 'text' }); return }
        setThinkingStep({ type: 'deploy', label: `إنشاء release ${tag}...` })
        try {
          const tok2 = agentMode.githubToken || githubToken
          const res = await fetch('/api/dz-agent/github/create-release', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok2, repo, tag, name: releaseName || tag, body: releaseName ? `## ${releaseName}\n\nنُشر بواسطة DZ Agent` : '' }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Release failed')
          addAssistantMessage({
            content: `🚀 **Release \`${data.tag}\` مُنشأ**: ${data.name}\n\n[عرض على GitHub](${data.html_url})`,
            richType: 'text',
            quickSuggestions: ['/history 5', '/actions'],
          })
          addToLog({ type: 'deploy', description: `Release ${data.tag} created`, status: 'success', repo })
        } catch (err) {
          void err
          addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true })
        }
        return
      }

      // ── /delete — حذف ملف ────────────────────────────────────────
      if (cmd === '/delete' || cmd === '/rm') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const filePath = args.trim()
        if (!filePath) { addAssistantMessage({ content: '⚠️ صيغة: `/delete <مسار الملف>` — مثال: `/delete src/old-component.tsx`', richType: 'text', isError: true }); return }
        const ok = await confirmAgentAction(cmd, `${repo}/${filePath}`, `🗑️ حذف \`${filePath}\` من \`${repo}\` — **لا يمكن التراجع!**`)
        if (!ok) { addAssistantMessage({ content: 'تم إلغاء الحذف.', richType: 'text' }); return }
        setThinkingStep({ type: 'write', label: `حذف ${filePath}...` })
        try {
          const tok2 = agentMode.githubToken || githubToken
          const res = await fetch('/api/dz-agent/github/delete-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok2, repo, path: filePath, message: `🗑️ delete: ${filePath}` }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Delete failed')
          addAssistantMessage({
            content: `🗑️ **تم حذف** \`${filePath}\`\n\n**Commit:** \`${data.commit || 'N/A'}\`\n\n[عرض المستودع](https://github.com/${repo})`,
            richType: 'text',
            quickSuggestions: ['/ls', '/history 5'],
          })
          addToLog({ type: 'code-action', description: `Deleted ${filePath}`, status: 'success', repo })
        } catch (err) {
          void err
          addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true })
        }
        return
      }

      // ── /review — مراجعة AI لـ Pull Request ─────────────────────
      if (cmd === '/review') {
        if (!repo) { addAssistantMessage({ content: '⚠️ حدد مستودعاً في شريط الوكيل أولاً.', richType: 'text', isError: true }); return }
        const prNum = parseInt(args.trim())
        if (!prNum) { addAssistantMessage({ content: '⚠️ صيغة: `/review <رقم PR>` — مثال: `/review 7`', richType: 'text', isError: true }); return }
        setThinkingStep({ type: 'analyze', label: `قراءة PR #${prNum}...` })
        try {
          const tok2 = agentMode.githubToken || githubToken
          const res = await fetch('/api/dz-agent/github/review-pr', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: tok2, repo, pull_number: prNum }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Review failed')
          const filesSum = (data.files || []).map((f: { filename: string; status: string; additions: number; deletions: number }) =>
            `• \`${f.filename}\` — ${f.status} +${f.additions} -${f.deletions}`
          ).join('\n')
          const patchContext = (data.files || []).slice(0, 3).map((f: { filename: string; patch: string }) =>
            f.patch ? `**\`${f.filename}\`:**\n\`\`\`diff\n${f.patch.slice(0, 400)}\n\`\`\`` : ''
          ).filter(Boolean).join('\n\n')
          addAssistantMessage({
            content: `🔍 **PR #${data.number}**: ${data.title}\n**${data.head}** → **${data.base}** · ${data.state === 'open' ? '🟢 مفتوح' : '🟣 مغلق'}\n\n**الملفات المتغيرة (${data.files?.length || 0}):**\n${filesSum}\n\n${patchContext}\n\n> للمراجعة الكاملة: [عرض PR على GitHub](${data.html_url})`,
            richType: 'text',
            quickSuggestions: [`/diff ${data.base} ${data.head}`, '/issues', '/scan'],
          })
        } catch (err) {
          void err
          addAssistantMessage({ content: GH_AUTH_ERR, richType: 'text', isError: true })
        }
        return
      }

      // unknown command
      addAssistantMessage({
        content: `⚠️ **أمر غير معروف**: \`${cmd}\`\n\nالأوامر المتاحة:\n\`/read\` \`/edit\` \`/ls\` \`/tree\` \`/grep\` \`/find\` \`/history\` \`/diff\` \`/delete\`\n\`/issues\` \`/actions\` \`/release\` \`/review\` \`/commit\` \`/pr\` \`/scan\` \`/suggest\` \`/deploy\` \`/repos\` \`/memory\``,
        richType: 'text',
        isError: true,
      })
    } finally {
      setIsLoading(false)
      setThinkingStep(null)
    }
  }, [agentMode, githubToken, addAssistantMessage, addToLog, fetchFiles, fetchFileContent, scanRepo, deployToGitHubPages, confirmAgentAction, setThinkingStep])

  // ===== IMAGE DETECTION (zero-token, Pollinations) =====
  // ── Feature 2: regenerate image with different style ──────────────────────
  const IMAGE_STYLES = [
    { label: 'واقعي',     model: 'flux-realism', emoji: '📷' },
    { label: 'أنيمي',     model: 'flux-anime',   emoji: '🎌' },
    { label: 'ثلاثي الأبعاد', model: 'flux-3d', emoji: '🧊' },
    { label: 'خيالي',     model: 'turbo',        emoji: '✨' },
    { label: 'افتراضي',   model: 'flux',         emoji: '🎨' },
  ] as const

  // ── Match card: map team name → country flag emoji ──────────────────────
  const getTeamFlag = (name: string): string => {
    const n = name.toLowerCase().trim()
    const FLAGS: Record<string, string> = {
      'الجزائر': '🇩🇿', 'algeria': '🇩🇿', 'algérie': '🇩🇿', 'dz': '🇩🇿',
      'المغرب': '🇲🇦', 'morocco': '🇲🇦', 'maroc': '🇲🇦',
      'تونس': '🇹🇳', 'tunisia': '🇹🇳', 'tunisie': '🇹🇳',
      'مصر': '🇪🇬', 'egypt': '🇪🇬', 'égypte': '🇪🇬',
      'ليبيا': '🇱🇾', 'libya': '🇱🇾',
      'موريتانيا': '🇲🇷', 'mauritania': '🇲🇷', 'mauritanie': '🇲🇷',
      'السنغال': '🇸🇳', 'senegal': '🇸🇳', 'sénégal': '🇸🇳',
      'نيجيريا': '🇳🇬', 'nigeria': '🇳🇬',
      'الكاميرون': '🇨🇲', 'cameroon': '🇨🇲', 'cameroun': '🇨🇲',
      'غانا': '🇬🇭', 'ghana': '🇬🇭',
      'كوت ديفوار': '🇨🇮', 'ivory coast': '🇨🇮', "côte d'ivoire": '🇨🇮',
      'مالي': '🇲🇱', 'mali': '🇲🇱',
      'بوركينا فاسو': '🇧🇫', 'burkina faso': '🇧🇫',
      'النيجر': '🇳🇪', 'niger': '🇳🇪',
      'إثيوبيا': '🇪🇹', 'ethiopia': '🇪🇹',
      'كينيا': '🇰🇪', 'kenya': '🇰🇪',
      'أفريقيا الجنوبية': '🇿🇦', 'south africa': '🇿🇦',
      'الكونغو': '🇨🇩', 'congo': '🇨🇩',
      'أنغولا': '🇦🇴', 'angola': '🇦🇴',
      'غينيا': '🇬🇳', 'guinea': '🇬🇳',
      'الرأس الأخضر': '🇨🇻', 'cape verde': '🇨🇻', 'cabo verde': '🇨🇻',
      'زامبيا': '🇿🇲', 'zambia': '🇿🇲',
      'زيمبابوي': '🇿🇼', 'zimbabwe': '🇿🇼',
      'رواندا': '🇷🇼', 'rwanda': '🇷🇼',
      'أوغندا': '🇺🇬', 'uganda': '🇺🇬',
      'السودان': '🇸🇩', 'sudan': '🇸🇩',
      'الصومال': '🇸🇴', 'somalia': '🇸🇴',
      'فرنسا': '🇫🇷', 'france': '🇫🇷',
      'إسبانيا': '🇪🇸', 'spain': '🇪🇸', 'españa': '🇪🇸',
      'ألمانيا': '🇩🇪', 'germany': '🇩🇪', 'allemagne': '🇩🇪',
      'إيطاليا': '🇮🇹', 'italy': '🇮🇹', 'italie': '🇮🇹',
      'البرتغال': '🇵🇹', 'portugal': '🇵🇹',
      'إنجلترا': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'england': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      'بريطانيا': '🇬🇧', 'united kingdom': '🇬🇧', 'britain': '🇬🇧', 'uk': '🇬🇧',
      'اسكتلندا': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
      'ويلز': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
      'بلجيكا': '🇧🇪', 'belgium': '🇧🇪', 'belgique': '🇧🇪',
      'هولندا': '🇳🇱', 'netherlands': '🇳🇱', 'holland': '🇳🇱',
      'بولندا': '🇵🇱', 'poland': '🇵🇱',
      'كرواتيا': '🇭🇷', 'croatia': '🇭🇷',
      'سويسرا': '🇨🇭', 'switzerland': '🇨🇭', 'suisse': '🇨🇭',
      'أوكرانيا': '🇺🇦', 'ukraine': '🇺🇦',
      'الدنمارك': '🇩🇰', 'denmark': '🇩🇰',
      'السويد': '🇸🇪', 'sweden': '🇸🇪',
      'النرويج': '🇳🇴', 'norway': '🇳🇴',
      'اليونان': '🇬🇷', 'greece': '🇬🇷', 'grèce': '🇬🇷',
      'تركيا': '🇹🇷', 'turkey': '🇹🇷', 'türkiye': '🇹🇷',
      'رومانيا': '🇷🇴', 'romania': '🇷🇴',
      'المجر': '🇭🇺', 'hungary': '🇭🇺',
      'النمسا': '🇦🇹', 'austria': '🇦🇹',
      'صربيا': '🇷🇸', 'serbia': '🇷🇸',
      'روسيا': '🇷🇺', 'russia': '🇷🇺',
      'أيرلندا': '🇮🇪', 'ireland': '🇮🇪',
      'فنلندا': '🇫🇮', 'finland': '🇫🇮',
      'ألبانيا': '🇦🇱', 'albania': '🇦🇱',
      'البرازيل': '🇧🇷', 'brazil': '🇧🇷', 'brésil': '🇧🇷',
      'الأرجنتين': '🇦🇷', 'argentina': '🇦🇷',
      'أوروغواي': '🇺🇾', 'uruguay': '🇺🇾',
      'بوليفيا': '🇧🇴', 'bolivia': '🇧🇴',
      'تشيلي': '🇨🇱', 'chile': '🇨🇱',
      'كولومبيا': '🇨🇴', 'colombia': '🇨🇴',
      'بيرو': '🇵🇪', 'peru': '🇵🇪',
      'المكسيك': '🇲🇽', 'mexico': '🇲🇽',
      'الولايات المتحدة': '🇺🇸', 'usa': '🇺🇸', 'united states': '🇺🇸', 'us': '🇺🇸',
      'كندا': '🇨🇦', 'canada': '🇨🇦',
      'باراغواي': '🇵🇾', 'paraguay': '🇵🇾',
      'فنزويلا': '🇻🇪', 'venezuela': '🇻🇪',
      'الإكوادور': '🇪🇨', 'ecuador': '🇪🇨',
      'كوستاريكا': '🇨🇷', 'costa rica': '🇨🇷',
      'السعودية': '🇸🇦', 'saudi': '🇸🇦', 'saudi arabia': '🇸🇦',
      'الإمارات': '🇦🇪', 'uae': '🇦🇪', 'emirates': '🇦🇪',
      'قطر': '🇶🇦', 'qatar': '🇶🇦',
      'الكويت': '🇰🇼', 'kuwait': '🇰🇼',
      'البحرين': '🇧🇭', 'bahrain': '🇧🇭',
      'عُمان': '🇴🇲', 'oman': '🇴🇲',
      'العراق': '🇮🇶', 'iraq': '🇮🇶',
      'سوريا': '🇸🇾', 'syria': '🇸🇾',
      'لبنان': '🇱🇧', 'lebanon': '🇱🇧',
      'الأردن': '🇯🇴', 'jordan': '🇯🇴',
      'فلسطين': '🇵🇸', 'palestine': '🇵🇸',
      'إيران': '🇮🇷', 'iran': '🇮🇷',
      'اليابان': '🇯🇵', 'japan': '🇯🇵',
      'كوريا الجنوبية': '🇰🇷', 'south korea': '🇰🇷', 'كوريا': '🇰🇷', 'korea': '🇰🇷',
      'الصين': '🇨🇳', 'china': '🇨🇳',
      'أستراليا': '🇦🇺', 'australia': '🇦🇺',
      'نيوزيلندا': '🇳🇿', 'new zealand': '🇳🇿',
      'الهند': '🇮🇳', 'india': '🇮🇳',
      'إندونيسيا': '🇮🇩', 'indonesia': '🇮🇩',
      'تايلاند': '🇹🇭', 'thailand': '🇹🇭',
      'فيتنام': '🇻🇳', 'vietnam': '🇻🇳',
      'باكستان': '🇵🇰', 'pakistan': '🇵🇰',
      'كازاخستان': '🇰🇿', 'kazakhstan': '🇰🇿',
    }
    if (FLAGS[n]) return FLAGS[n]
    for (const [k, v] of Object.entries(FLAGS)) {
      if (n.includes(k) || k.includes(n)) return v
    }
    return '🏳'
  }

  const regenerateImageWithStyle = useCallback(async (
    msgId: string, prompt: string, model: string
  ) => {
    if (imgRegenLoading) return
    setImgRegenLoading(msgId)
    try {
      const res = await fetch('/api/tools/img-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model }),
      })
      const data = await res.json() as { imageUrl?: string; imageBase64?: string; model?: string; error?: string }
      if (data.imageUrl || data.imageBase64) {
        setMessages(prev => prev.map(m =>
          m.id === msgId
            ? { ...m, imageUrl: data.imageUrl || data.imageBase64, imageModel: data.model || model.toUpperCase(), imageStyle: model }
            : m
        ))
      }
    } catch {}
    setImgRegenLoading(null)
  }, [imgRegenLoading])

  // ─── Android APK Builder ─────────────────────────────────────────────────
  const ANDROID_RE = /(?:تطبيق\s*(?:أندرويد|اندرويد|android)|apk|ملف\s*apk|تنزيل\s*تطبيق|تطبيق\s*(?:جوال|موبايل|للهاتف|للموبايل)|(?:اصنع|أنشئ|انشئ|ابني|اعمل|دير|صمم|بني|صنعلي|اصنعلي)\s+تطبيق|build\s+android|create\s+android\s+app|android\s+app|generate\s+apk|build\s+apk|make\s+apk|mobile\s+app)/i

  const buildAndroidApp = async (task: string) => {
    const botId = generateId()
    setMessages(prev => [...prev, {
      id: botId, role: 'assistant', content: '', richType: 'text',
      androidBuildMeta: { appName: task.slice(0, 40), packageName: '', repoUrl: '', actionsUrl: '', releasesUrl: '', filesCount: 0, status: 'building' },
    }])
    setIsLoading(true)

    const updateMeta = (patch: Partial<NonNullable<DZMessage['androidBuildMeta']>>) => {
      setMessages(prev => prev.map(m => m.id === botId
        ? { ...m, androidBuildMeta: { ...m.androidBuildMeta!, ...patch } }
        : m
      ))
    }
    const appendContent = (text: string) => {
      setMessages(prev => prev.map(m => m.id === botId ? { ...m, content: m.content + text } : m))
    }

    try {
      const resp = await fetch('/api/dz-agent/android/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, appName: task.slice(0, 40) }),
      })
      const reader = resp.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.replace(/^data:\s*/, '').trim()
          if (!line) continue
          try {
            const ev = JSON.parse(line)
            if (ev.type === 'step') {
              appendContent(`\n**${ev.step === 'web' ? '🌐' : ev.step === 'android' ? '🤖' : ev.step === 'push' ? '📦' : '✅'} ${ev.detail || ev.step}**`)
            } else if (ev.type === 'detail') {
              appendContent(`\n${ev.text}`)
            } else if (ev.type === 'result' && ev.data) {
              updateMeta({ ...ev.data, status: 'done' })
              appendContent(`\n\n✅ **تم بناء مشروع أندرويد بنجاح!** سيبدأ GitHub Actions بناء APK تلقائياً.`)
            } else if (ev.type === 'error') {
              updateMeta({ status: 'error', error: ev.message })
              appendContent(`\n\n❌ ${ev.message}`)
            }
          } catch {}
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ غير معروف'
      updateMeta({ status: 'error', error: msg })
      appendContent(`\n\n❌ ${msg}`)
    }
    setIsLoading(false)
  }
  // ─────────────────────────────────────────────────────────────────────────

  const IMAGE_REQUEST_RE = /(?:ارسم|أرسم|رسم\s*لي|رسملي|أرسملي|ارسملي|صورة\s*عن|صورلي|صورة\s*ل(?:ـ|ي)?|اصنع\s*صورة|أنشئ\s*صورة|انشئ\s*صورة|إنشاء\s*صورة|إنشأ\s*صورة|انشأ\s*صورة|جيبلي\s*صورة|اعمل\s*صورة|دير\s*(?:لي\s*)?صورة|ولد\s*صورة|توليد\s*صورة|أعطني\s*صورة|اعطني\s*صورة|أنتج\s*صورة|انتج\s*صورة|صمم\s*(?:لي\s*)?صورة|اصنع\s*لي\s*صورة|بعثلي\s*صورة|حقق\s*صورة|generate\s*(?:an?\s*)?image|create\s*(?:an?\s*)?image|draw\s*(?:me\s*)?(?:a\s*)?|make\s*(?:an?\s*)?image|sketch\s*(?:me\s*)?|imagine\s*(?:a\s*)?|dessine(?:\s*moi)?|cr[ée]+\s*une?\s*image|g[ée]n[eè]re?\s*une?\s*image|fais\s*une?\s*image)/i

  function extractImagePrompt(text: string): string {
    const cleaned = text
      .replace(/(?:ارسم|أرسم|رسم\s*لي|رسملي|أرسملي|ارسملي|صورة\s*عن|صورلي|صورة\s*ل(?:ـ|ي)?\s*|اصنع\s*صورة|أنشئ\s*صورة|انشئ\s*صورة|إنشاء\s*صورة|إنشأ\s*صورة|انشأ\s*صورة|جيبلي\s*صورة|اعمل\s*صورة|دير\s*(?:لي\s*)?صورة|ولد\s*صورة|توليد\s*صورة|أعطني\s*صورة|اعطني\s*صورة|أنتج\s*صورة|انتج\s*صورة|صمم\s*(?:لي\s*)?صورة|اصنع\s*لي\s*صورة|بعثلي\s*صورة|حقق\s*صورة|generate\s*(?:an?\s*)?image(?:\s*of)?|create\s*(?:an?\s*)?image(?:\s*of)?|draw\s*(?:me\s*)?(?:a\s*)?|make\s*(?:an?\s*)?image(?:\s*of)?|sketch\s*(?:me\s*)?(?:a\s*)?|imagine\s*(?:a\s*)?|dessine(?:\s*moi)?\s*(?:un[e]?\s*)?|cr[ée]+\s*une?\s*image\s*(?:de\s*|d')?|g[ée]n[eè]re?\s*une?\s*image\s*(?:de\s*|d')?|fais\s*une?\s*image\s*(?:de\s*|d')?)/ig, '')
      .trim()
    return cleaned || text.trim()
  }

  // ===== SEND MESSAGE =====
  const sendMessage = useCallback(async (overrideInput?: string, dashboardContext?: DashboardContext) => {
    let text = (overrideInput ?? input).trim()
    if (!text || isLoading) return

    // If a doctor-GPS session is pending, enrich the specialty query with GPS coords
    if (pendingDoctorGpsRef.current && !text.includes('[GPS:')) {
      const { lat, lon, city } = pendingDoctorGpsRef.current
      const gpsTag = `[GPS:${lat.toFixed(5)},${lon.toFixed(5)}]`
      const cityPart = city ? `في ${city} ` : ''
      text = `أريد طبيب ${text} ${cityPart}${gpsTag}`
      pendingDoctorGpsRef.current = null
    }

    // ── Auto GPS injection — للاستفسارات التي تحتاج الموقع الجغرافي ─────────
    // يُحقَن تلقائياً [GPS:lat,lng] إذا كان السؤال عن خدمة محلية قريبة
    if (!text.includes('[GPS:') && navigator.geolocation) {
      const _locationQuery = /(?:أقرب|قريب(?:ة)?|وين\s+نلقى|وين\s+كاين|أين\s+(?:يوجد|أجد|نجد)|دلني\s+عل[ىا]|دلّني|ابحث\s+عن|عندي\s+نبغي\s+طبيب|نبغي\s+طبيب|راني\s+عيان|راني\s+مريض|عندي\s+وجع|عياني|في\s+ولايتي|في\s+منطقتي)\s*(?:طبيب|دكتور|صيدلية|مستشفى|سبيطار|مسجد|جامع|بريد|بنك|بنك\s+الجزائر|إدارة|بلدية|ولاية|مطعم|سوق|حلاق|بقالة|بقال|ميكانيسيان|محطة\s+وقود|وقود|محطة|عيادة|مركز\s+صحي)?|(?:طبيب|دكتور|صيدلية|مستشفى|سبيطار|عيادة|مركز\s+صحي)\s*(?:قريب|في\s+(?:المنطقة|ولايتي|مدينتي|حيّي|حومتي)|عندنا)/i
      if (_locationQuery.test(text)) {
        try {
          const _pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5000,
              maximumAge: 300_000,
              enableHighAccuracy: false,
            })
          })
          const _gpsTag = `[GPS:${_pos.coords.latitude.toFixed(5)},${_pos.coords.longitude.toFixed(5)}]`
          text = `${text} ${_gpsTag}`
        } catch {
          // GPS unavailable — continue without location enrichment
        }
      }
    }

    // Debounce: prevent duplicate sends within 400ms
    const now = Date.now()
    if (now - lastSendRef.current < 400) return
    lastSendRef.current = now

    // ── Hybrid Agent Mode: intercept slash commands ──────────────────────────
    if (agentMode.active && text.startsWith('/')) {
      const spaceIdx = text.indexOf(' ')
      const cmd  = spaceIdx > -1 ? text.slice(0, spaceIdx).toLowerCase() : text.toLowerCase()
      const args = spaceIdx > -1 ? text.slice(spaceIdx + 1) : ''
      setMessages(prev => [...prev, { id: generateId(), role: 'user' as const, content: text, richType: 'text' as const }])
      setInput('')
      await executeSlashCommand(cmd, args)
      return
    }

    // ── Hybrid Agent Mode: NL → slash command conversion ─────────────────────
    // إذا كان وضع الوكيل نشطاً، نكشف على الطلبات الطبيعية ونحوّلها لأوامر
    if (agentMode.active && agentMode.selectedRepo) {
      const t = text.trim()
      const runCmd = async (cmd: string, args: string) => {
        setMessages(prev => [...prev, { id: generateId(), role: 'user' as const, content: text, richType: 'text' as const }])
        setInput('')
        await executeSlashCommand(cmd, args)
      }

      // /grep — ابحث عن نص في ملفات المستودع
      const grepM = t.match(/^(?:ابحث|بحث|grep|search|جد|اجد|ابحث\s*عن)\s+(?:عن\s+)?["']?([^"'\s]+)["']?\s+(?:في|in|داخل|ضمن)\s+(.+)/i)
      if (grepM) { await runCmd('/grep', `${grepM[1].trim()} ${grepM[2].trim()}`); return }
      const grepM2 = t.match(/^(?:ابحث|بحث|grep|search)\s+(?:عن\s+)?["']([^"']+)["']\s+(?:في|in|داخل)?\s*(.+)?/i)
      if (grepM2 && !t.match(/مستودع|repo|ملف\s*محدد/i)) { await runCmd('/grep', `${grepM2[1].trim()} ${grepM2[2]?.trim() || ''}`); return }

      // /find — ابحث عن ملف بالاسم أو النوع
      const findM = t.match(/^(?:أين|اين|جد\s+ملف|find\s+file|ابحث\s+عن\s+ملف|أين\s+(?:يوجد|ملف))\s+(.+)/i)
      if (findM) { await runCmd('/find', findM[1].trim()); return }
      const findM2 = t.match(/^(?:ابحث|find)\s+(?:عن\s+)?(\S+\.\w+)\s*$/i)
      if (findM2) { await runCmd('/find', findM2[1].trim()); return }

      // /history — تاريخ الـ commits
      if (/(?:تاريخ|سجل|history|commits?\s+log|كوميتات|التزامات)\s*(?:المشروع|المستودع|الـ)?/i.test(t)) {
        const numM = t.match(/(\d+)\s*(?:commits?|كوميت|آخر)?/i)
        await runCmd('/history', numM ? numM[1] : '15'); return
      }

      // /tree — شجرة الملفات
      if (/(?:شجرة|tree|هيكل|بنية)\s*(?:الملفات?|المستودع|المجلد|المشروع|الـ)?/i.test(t)) {
        const pM = t.match(/(?:شجرة|tree|هيكل|بنية)\s+(\S+)/i)
        await runCmd('/tree', pM ? pM[1] : ''); return
      }

      // /issues list
      if (/(?:اعرض|عرض|أرني|قائمة|list|عندي)\s*(?:المشاكل|الـ\s*issues?|الأخطاء|bugs?)\s*(?:المفتوح(?:ة|ة)?)?/i.test(t)) {
        await runCmd('/issues', ''); return
      }
      // /issues new
      const issueNewM = t.match(/(?:أنشئ|انشئ|اضف|أضف|افتح|اعمل|create|open|add|new)\s+(?:مشكلة|issue|bug|خطأ|بلاغ)\s*(?:جديد(?:ة)?)?\s*[:\-–]?\s*(.+)/i)
      if (issueNewM) { await runCmd('/issues', `new ${issueNewM[1].trim()}`); return }
      // /issues close
      const issueCloseM = t.match(/(?:أغلق|اغلق|close|إغلاق|غلّق)\s+(?:issue|المشكلة|بلاغ)?\s*#?\s*(\d+)/i)
      if (issueCloseM) { await runCmd('/issues', `close ${issueCloseM[1]}`); return }

      // /actions — GitHub Actions
      if (/(?:حالة|status|نتائج|نتيجة)\s*(?:الـ\s*)?(?:actions?|ci|cd|workflows?|pipeline)|github\s*actions?/i.test(t)) {
        await runCmd('/actions', ''); return
      }

      // /diff — فرق بين فرعين
      const diffM = t.match(/(?:الفرق|diff|مقارنة|compare)\s+(?:بين\s+)?(\S+)\s+(?:و|and|\.{2,3})\s*(\S+)/i)
      if (diffM) { await runCmd('/diff', `${diffM[1]} ${diffM[2]}`); return }

      // /release — إنشاء إصدار
      const releaseM = t.match(/(?:أنشئ|انشئ|اعمل|create|make)\s+(?:إصدار|release|version|نسخة)\s+(?:جديد(?:ة)?)?\s*(v?[\d.]+)/i)
      if (releaseM) { await runCmd('/release', releaseM[1]); return }

      // /delete — حذف ملف
      const deleteM = t.match(/(?:احذف|حذف|امسح|مسح|delete|remove)\s+(?:ملف\s+)?(\S+(?:\.\w+|\/))/i)
      if (deleteM) { await runCmd('/delete', deleteM[1].trim()); return }

      // /review — مراجعة PR
      const reviewM = t.match(/(?:راجع|مراجعة|review|افحص|review)\s+(?:الـ\s*)?(?:PR|pull\s*request)\s*#?\s*(\d+)/i)
      if (reviewM) { await runCmd('/review', reviewM[1]); return }
    }

    // ── Hybrid Agent Mode: natural language with repo context ────────────────
    // If agent mode is active + repo selected, inject context into the message
    const agentCtxInject = (agentMode.active && agentMode.selectedRepo)
      ? `\n\n[وضع الوكيل — المستودع: ${agentMode.selectedRepo}]`
      : ''

    // ── Android APK Builder intent detection ─────────────────────────────────
    if (ANDROID_RE.test(text)) {
      setMessages(prev => [...prev, { id: generateId(), role: 'user', content: text, richType: 'text' }])
      setInput('')
      await buildAndroidApp(text)
      return
    }

    const userMessage: DZMessage = { id: generateId(), role: 'user', content: text, richType: 'text' }
    const outboundMessages = [...messages, userMessage].map((m, index, arr) => ({
      role: m.role,
      content: dashboardContext?.priority === 'weather' && index === arr.length - 1
        ? `${m.content}\ncontext: weather_priority`
        : m.content,
    }))

    // Inject project file/stack context + agent context (session-only, no cross-session memory)
    const projectMemCtx = projectMemoryRef.current
      ? `\n\n[ذاكرة المشروع من dz-agent.md]\n${projectMemoryRef.current.slice(0, 2000)}\n[/ذاكرة المشروع]`
      : ''
    if ((projectMemCtx || agentCtxInject) && outboundMessages.length > 0) {
      const last = outboundMessages[outboundMessages.length - 1]
      if (last.role === 'user') {
        outboundMessages[outboundMessages.length - 1] = {
          ...last,
          content: last.content + projectMemCtx + agentCtxInject,
        }
      }
    }
    // Update session-only project context (not persisted cross-session)
    const _detectedLang  = detectCodeLanguage(text)
    const _detectedStack = detectProjectStack(text)
    const _detectedFiles = extractFileNames(text)
    if (_detectedLang || _detectedStack || _detectedFiles.length) {
      saveProjectContext({
        ...(_detectedLang  ? { lang: _detectedLang }   : {}),
        ...(_detectedStack ? { stack: _detectedStack } : {}),
        lastAction: text.slice(0, 80),
      })
      _detectedFiles.forEach(f => saveProjectContext({ addFile: f }))
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setAgentSteps([])
    setAgentTaskType(null)

    // ── كشف نوع الاستعلام لتفعيل لوحة البحث المرئية ──────────────────────────
    const _t = text.replace(/[؟?]$/,'').trim()

    // كشف الطقس
    const _isWeatherQ =
      /^(?:طقس|جو\s|حرارة|حالة\s+الجو|الطقس|weather|météo|quel\s+temps)/i.test(_t) ||
      /(?:طقس|درجة\s+الحرارة|أمطار|رياح|رطوبة)\s+(?:في|ب|at|in|à)\s+[\u0600-\u06FFa-z]/i.test(_t)

    // كشف الرياضة والمباريات
    const _isSportsQ =
      /^(?:نتائج|ترتيب|دوري|مباريات|هداف|أهداف|بطولة|فريق\s|منتخب\s|كرة\s+القدم|football|ligue\s+pro|liga|league\s|standing|results\s|score\s)/i.test(_t) ||
      /(?:نتائج|مباريات|ترتيب|جدول)\s+(?:دوري|لكرة|المسابقة|الدوري|الرابطة)/i.test(_t)

    // كشف الأشخاص
    const _sfpClean = _t
      .replace(/^(?:من\s+(?:هو|هي|هم)\s+|شكون\s+(?:هو|هي)\s+|(?:حدثني|أخبرني|اخبرني|معلومات|قصة|سيرة)\s+عن\s+|who\s+is\s+|tell\s+me\s+about\s+|qui\s+est\s+)/i, '')
      .trim()
    const _isPersonQ = !_isWeatherQ && !_isSportsQ && (
      /^(?:من\s+(?:هو|هي|هم)|شكون\s+(?:هو|هي)|(?:حدثني|أخبرني|اخبرني|معلومات|قصة|سيرة)\s+عن|who\s+is|tell\s+me\s+about|qui\s+est)/i.test(_t) ||
      (/^[\u0600-\u06FF][\u0600-\u06FF\s]{4,50}$/.test(_t) &&
       !/^(?:كيف|ما\s|هل\s|اعمل|اكتب|ابن|افعل|جيب|شرح|ترجم|صور|ارسم)/i.test(_t) &&
       _t.split(/\s+/).length >= 2 && _t.split(/\s+/).length <= 4)
    )

    // كشف الأخبار
    const _isNewsQ = !_isWeatherQ && !_isSportsQ && !_isPersonQ && (
      /أخبار|خبر|مستجدات|عاجل|آخر\s+الأحداث|أحدث\s+الأخبار/.test(_t) ||
      /اليوم.*الجزائر|الجزائر.*اليوم|الجزائر.*اليوم/.test(_t)
    )

    if (_isWeatherQ) {
      setSearchStepsMode('weather')
      setSearchStepsQuery(_t)
    } else if (_isSportsQ) {
      setSearchStepsMode('sports')
      setSearchStepsQuery(_t)
    } else if (_isPersonQ) {
      setSearchStepsMode('person')
      setSearchStepsQuery(_sfpClean)
    } else if (_isNewsQ) {
      setSearchStepsMode('news')
      setSearchStepsQuery(_t)
    } else {
      setSearchStepsQuery(null)
    }

    // ── Client-side match-vs detection (X ضد Y) ──────────────────────────────
    const _vsMatchClient = text.match(
      /([\u0600-\u06FFa-zA-Z][\u0600-\u06FFa-zA-Z\s]{0,20}?)\s+(?:ضد|vs\.?)\s+([\u0600-\u06FFa-zA-Z][\u0600-\u06FFa-zA-Z\s]{0,20})/iu
    )
    const _clientMatchVs = _vsMatchClient ? {
      team1: _vsMatchClient[1].trim(),
      team2: _vsMatchClient[2].trim().replace(/[؟?!،,].*$/, '').trim(),
      temporal: /(?:لعبت|انتهت|نتيجة|نتائج|فاز|ربح|هزم|أمس|البارح|في\s+\d{4}|الماضي)/i.test(text) ? 'PAST' :
                /(?:الآن|مباشر|مباشرة|جارية|الشوط|درك)/i.test(text) ? 'LIVE' :
                /(?:ستلعب|القادمة|غداً|بعد\s+غد|موعد|الأسبوع\s+القادم)/i.test(text) ? 'UPCOMING' : 'UNKNOWN',
    } : null

    try {
      abortRef.current = new AbortController()
      const signal = abortRef.current.signal

      // ── Image Web Search — شبكة 9 صور حقيقية من الإنترنت ──────────────────────
      const IMAGE_FETCH_RE = /(?:^|\s)(?:صور\s*(?:ل[لـ]?|الـ|لـ|عن|من|حول)|صورة\s*(?:ل[لـ]?|الـ|لـ|عن|من)|أعطني\s*صور|اعطني\s*صور|أرني\s*صور|ارني\s*صور|وريني\s*صور|عارضلي\s*صور|ابحث\s*عن\s*صور|بحث\s*عن\s*صور|جيبلي\s*صور|fetch\s*images?(?:\s*of)?|show\s*me\s*(?:some\s*)?images?(?:\s*of)?|search\s*(?:for\s*)?images?(?:\s*of)?)\s*\S/i
      if (IMAGE_FETCH_RE.test(text) && !IMAGE_REQUEST_RE.test(text) && !dashboardContext) {
        const subject = text
          .replace(/^(?:أعطني|اعطني|أرني|ارني|وريني|عارضلي|جيبلي)\s*صور(?:ة)?\s*(?:ل[لـ]?|الـ|لـ|عن|من|حول)?\s*/i, '')
          .replace(/^(?:ابحث|بحث)\s*عن\s*صور\s*/i, '')
          .replace(/^(?:صور|صورة)\s*(?:ل[لـ]?|الـ|لـ|عن|من|حول)\s*/i, '')
          .replace(/^(?:fetch\s*images?\s*of|show\s*me\s*(?:some\s*)?images?\s*of|search\s*(?:for\s*)?images?\s*of)\s*/i, '')
          .trim() || text.trim()
        const loadingId = generateId()
        setMessages(prev => [...prev, {
          id: loadingId, role: 'assistant' as const,
          content: `🔍 جاري البحث عن صور "${subject}"...`,
          richType: 'text' as const, isStreaming: true,
        }])
        try {
          const imgFetchRes = await fetch(`/api/tools/image-search?q=${encodeURIComponent(subject)}`, { signal })
          const imgFetchData = await imgFetchRes.json() as { results?: Array<{ url: string; title: string; thumbnail?: string; source?: string; sourceUrl?: string; creator?: string }> }
          setMessages(prev => prev.filter(m => m.id !== loadingId))
          const results = imgFetchData.results || []
          if (results.length > 0) {
            const fullImgs = results.slice(0, 9).map(r => ({
              url: r.thumbnail || r.url,
              fullUrl: r.url,
              title: r.title || subject,
              source: r.source,
              sourceUrl: r.sourceUrl,
              creator: r.creator,
            })).filter(r => r.url)
            addAssistantMessage({
              content: `🔍 **${results.length} صورة لـ "${subject}"** — اضغط للمعاينة`,
              richType: 'imageGrid' as const,
              imageGrid: fullImgs.map(i => i.url),
              imageGridFull: fullImgs,
              imagePrompt: subject,
              imageModel: 'بحث الويب',
              imageStyle: 'web',
              quickSuggestions: [`صور أخرى لـ ${subject}`, `ارسم ${subject} بالذكاء الاصطناعي`, `معلومات عن ${subject}`],
            })
          } else {
            addAssistantMessage({
              content: `⚠️ لم أجد صوراً لـ "${subject}" على الإنترنت.\nيمكنك توليد صورة بالذكاء الاصطناعي بدلاً من ذلك.`,
              richType: 'text' as const,
              quickSuggestions: [`ارسم ${subject}`, `توليد صورة ${subject}`, `إنشاء صورة ${subject}`],
            })
          }
        } catch {
          setMessages(prev => prev.filter(m => m.id !== loadingId))
          addAssistantMessage({ content: '⚠️ تعذّر البحث عن الصورة. تحقق من الاتصال.', richType: 'text', isError: true })
        }
        setIsLoading(false)
        return
      }

      // ── Image Generation — Multi-provider: HF FLUX → Stable Horde async ───────────
      if (IMAGE_REQUEST_RE.test(text) && !dashboardContext) {
        const prompt = extractImagePrompt(text)
        const shortTopic = prompt.slice(0, 40) + (prompt.length > 40 ? '…' : '')
        const loadingId = generateId()
        setMessages(prev => [...prev, {
          id: loadingId, role: 'assistant' as const,
          content: `🎨 جاري توليد صورة: **${shortTopic}**\n_ترجمة البرومبت وإرساله لـ Pollinations AI..._`,
          richType: 'text' as const, isStreaming: true,
        }])

        const showImgResult = (imageUrl: string, imageModel: string) => {
          setMessages(prev => prev.filter(m => m.id !== loadingId))
          addAssistantMessage({
            content: `🎨 **صورة AI:** ${prompt}`,
            richType: 'image' as const,
            imageUrl,
            imagePrompt: prompt,
            imageModel,
            imageStyle: 'pollinations',
            quickSuggestions: [
              `🔄 نسخة جديدة من "${shortTopic}"`,
              '🎌 أسلوب أنيمي',
              '📷 واقعي احترافي',
              '🧊 ثلاثي الأبعاد',
              '✨ نسخة مستقبلية',
              'أضف تفاصيل أكثر',
            ],
          })
          setIsLoading(false)
        }

        const showImgError = (msg: string) => {
          setMessages(prev => prev.map(m => m.id === loadingId ? {
            ...m, isStreaming: false,
            content: `⚠️ **تعذّر توليد الصورة**\n${msg}\n\n_جرّب مجدداً أو اكتب "أعد المحاولة"_`,
          } : m))
          setIsLoading(false)
        }

        try {
          const imgRes = await fetch('/api/tools/img-gen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model: 'flux-realism', width: 1024, height: 1024 }),
          })
          const imgData = await imgRes.json() as {
            imageUrl?: string; imageBase64?: string; model?: string
            jobId?: string; provider?: string; status?: string
            englishPrompt?: string; error?: string
          }

          // ── Case 1: got image directly (HF base64) ──
          if (imgData.imageBase64) {
            showImgResult(imgData.imageBase64, imgData.model || 'Stable Diffusion')
            return
          }

          // ── Case 1b: Pollinations / direct URL ──
          if (imgData.imageUrl) {
            showImgResult(imgData.imageUrl, imgData.model || 'Pollinations AI')
            return
          }

          // ── Case 2: Stable Horde async — poll until done ──
          if (imgData.jobId && imgData.provider === 'stable-horde-async') {
            const jobId = imgData.jobId
            let pollCount = 0
            const MAX_POLLS = 30  // 30 × 5s = 150s max
            const poll = async (): Promise<void> => {
              if (pollCount++ > MAX_POLLS) {
                showImgError('استغرق التوليد وقتاً طويلاً — حاول مجدداً لاحقاً')
                return
              }
              try {
                const st = await fetch(`/api/tools/img-gen/status/${jobId}`)
                const sd = await st.json() as { done: boolean; imageBase64?: string; waitTime?: number; queuePos?: number; faulted?: boolean; error?: string }
                if (sd.faulted || sd.error) {
                  showImgError(sd.error || 'فشل التوليد')
                  return
                }
                if (sd.done && sd.imageBase64) {
                  showImgResult(sd.imageBase64, 'Stable Diffusion AI')
                  return
                }
                // Update progress message
                const waitSec = sd.waitTime || 0
                const qPos = sd.queuePos || 0
                const waitMin = waitSec > 60 ? `${Math.ceil(waitSec/60)} دقيقة` : `${waitSec} ثانية`
                setMessages(prev => prev.map(m => m.id === loadingId ? {
                  ...m,
                  content: `🎨 جاري توليد صورة: **${shortTopic}**\n⏳ _انتظار ~ ${waitMin}${qPos > 0 ? ` · ${qPos} طلب قبلك` : ''}_`,
                } : m))
                setTimeout(poll, 5000)
              } catch {
                setTimeout(poll, 6000)
              }
            }
            setTimeout(poll, 5000)
            return
          }

          // ── Case 3: error ──
          showImgError(imgData.error || 'جميع المزودين غير متاحين مؤقتاً — حاول بعد دقيقة')
        } catch (e) {
          showImgError('خطأ في الاتصال — تحقق من الإنترنت وأعد المحاولة')
        }
        return
      }

      // ── QR Code → redirect to DZTools QR generator ───────────────────────────
      const QR_RE = /(?:اعمل|أنشئ|انشئ|ولد|اصنع|create|generate|make|faire)\s*(?:كود\s*)?qr|qr\s*code\s*(?:ل|لـ|of|pour|for)|رمز\s*(?:الـ\s*)?qr|qr\s*كود/i
      if (QR_RE.test(text)) {
        addAssistantMessage({
          content: 'لإنشاء رمز QR، استخدم أداة QR Code المخصصة في DZ Tools — إنشاء سريع ومجاني.',
          richType: 'tool-redirect',
          toolRedirect: {
            toolName: 'مولّد QR Code',
            toolUrl: '/tools?tool=qrcode',
            toolIcon: '📲',
            toolDesc: 'أنشئ QR Code فورياً من أي رابط أو نص أو بيانات تواصل — تحميل PNG مجاناً بدون انتظار.',
            message: 'لإنشاء رمز QR، استخدم أداة QR Code المخصصة في DZ Tools.',
          },
          quickSuggestions: ['اعمل QR لرابط موقعي', 'QR لرقم هاتفي', 'QR لواتساب'],
        })
        setIsLoading(false)
        return
      }

      // ── Code-request guard — prevent book/other handlers hijacking code requests ──
      const CODE_REQUEST_RE = /(?:اكتب|اكتبي|اشرح|ابني|انشئ|أنشئ|اعمل|اصنع|جيبلي|هاتلي|ولد|أعطني|اعطني|write|create|make|generate|show|give)\s*(?:لي\s*)?(?:كود|برنامج|سكريبت|دالة|فانكشن|كلاس|خوارزمية|كلاس|code|script|function|class|algorithm|program)|(?:python|javascript|js|typescript|ts|بايثون|جافاسكريبت)\s*(?:code|كود|برنامج|سكريبت|دالة)?|(?:كود|برنامج|سكريبت)\s*(?:python|javascript|js|typescript|بايثون|جافا)|```(?:python|javascript|js|ts)/i
      const isCodeRequest = CODE_REQUEST_RE.test(text)

      // ── Open Library Book Search (free — openlibrary.org) ─────────────────────
      // Fix: require "كتب" to appear as standalone word (not inside "اكتب" etc.)
      const BOOK_RE = /(?:ابحث|أعطني|اعطني|جيبلي|هات|اقترح|اقتراح|بحث)\s*(?:عن\s*)?(?:كتب|كتاب|روايات|رواية|مؤلفات)|(?<![ا-ي])(?:كتب|كتاب|روايات)\s*(?:عن|ب|في)|(?:book|books|novel|novels)\s*(?:about|by|on)|(?:find|search|show)\s*books/i
      if (BOOK_RE.test(text) && !isCodeRequest) {
        const loadingId = generateId()
        setMessages(prev => [...prev, {
          id: loadingId, role: 'assistant' as const, content: '📖 جاري البحث في مكتبة Open Library...', richType: 'text' as const, isStreaming: true,
        }])
        try {
          const booksRes = await fetch(`/api/tools/books?q=${encodeURIComponent(text)}&limit=8`, { signal: abortRef.current!.signal })
          const booksData = await booksRes.json() as { books: DZMessage['books']; total: number; error?: string }
          setMessages(prev => prev.filter(m => m.id !== loadingId))
          if (booksData.books && booksData.books.length > 0) {
            addAssistantMessage({
              content: `📚 **وجدت ${booksData.books.length} كتاباً** من أصل ${booksData.total?.toLocaleString() ?? '?'} نتيجة`,
              richType: 'books',
              books: booksData.books,
              booksQuery: text,
              booksTotal: booksData.total,
              quickSuggestions: ['اقترح كتباً مشابهة', 'كتب عربية في نفس المجال', 'أفضل 5 كتب في هذا الموضوع'],
            })
          } else {
            addAssistantMessage({ content: '📭 لم أجد نتائج — جرّب كلمة بحث مختلفة.', richType: 'text' })
          }
        } catch {
          setMessages(prev => prev.filter(m => m.id !== loadingId))
          addAssistantMessage({ content: '⚠️ تعذّر الوصول إلى مكتبة الكتب.', richType: 'text', isError: true })
        }
        setIsLoading(false)
        return
      }

      // ── Presentation Generator (AI-powered, free models) ──────────────────────
      const PRES_RE = /(?:اعمل|أنشئ|انشئ|اصنع|ولد|جهّز|جهز|أعطني|اعطني|create|generate|make|faire|cr[ée]e)\s*(?:عرض|بريزنتيشن|شرائح|سلايدات|بوربوينت|slides?|presentation|powerpoint|diaporama)|(?:عرض|شرائح)\s*(?:تقديمي|عن|حول|powerpoint|ppt)|(?:ppt|powerpoint)\s*(?:عن|ل|about)/i
      if (PRES_RE.test(text)) {
        const topic = text.replace(PRES_RE, '').replace(/^[\s:لـل،,]+|[\s:،,]+$/g, '').trim() || text.trim()
        const loadingId = generateId()
        setMessages(prev => [...prev, {
          id: loadingId, role: 'assistant' as const, content: '📊 جاري إعداد العرض التقديمي...', richType: 'text' as const, isStreaming: true,
        }])
        try {
          const presRes = await fetch('/api/tools/presentation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, lang: language, slideCount: 6 }),
            signal: abortRef.current!.signal,
          })
          const presData = await presRes.json() as {
            title?: string; subtitle?: string; color?: string;
            slides?: DZMessage['slides']; error?: string
          }
          setMessages(prev => prev.filter(m => m.id !== loadingId))
          if (presData.slides && presData.slides.length > 0) {
            addAssistantMessage({
              content: `📊 **${presData.title || topic}** — ${presData.slides.length} شرائح جاهزة`,
              richType: 'presentation',
              slides: presData.slides,
              presentationTitle: presData.title || topic,
              presentationSubtitle: presData.subtitle,
              presentationColor: presData.color || '#7c6eff',
              quickSuggestions: ['أضف شريحة ملخص', 'اعمل عرضاً أطول', 'ترجم العرض للإنجليزية'],
            })
          } else {
            addAssistantMessage({ content: `⚠️ ${presData.error || 'تعذّر إنشاء العرض — حاول مجدداً.'}`, richType: 'text', isError: true })
          }
        } catch {
          setMessages(prev => prev.filter(m => m.id !== loadingId))
          addAssistantMessage({ content: '⚠️ انقطع الاتصال أثناء إعداد العرض.', richType: 'text', isError: true })
        }
        setIsLoading(false)
        return
      }

      // ── DZ GitHub Agent mode — any GitHub URL or explicit repo in ghAgentRepo ──
      const ghUrlMatch = text.match(/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i)
      const activeGhRepo = ghAgentRepo.trim() || (ghUrlMatch ? ghUrlMatch[1].replace(/\.git$/, '') : '')
      if (activeGhRepo) {
        console.log('[DZChatBox] → DZ GitHub Agent mode, repo:', activeGhRepo)
        trackFeatureUsage('github-agent')
        const ghAgentReq = await fetch('/api/dz-github-agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            repoUrl: activeGhRepo,
            githubToken: githubToken || undefined,
            autoExecute: ghAgentAutoExecute,
          }),
          signal,
        })
        const ghAgentData = await ghAgentReq.json().catch(() => ({})) as Record<string, unknown>
        if (ghAgentData.richType === 'github-agent') {
          addAssistantMessage({
            content: `✅ DZ GitHub Agent — \`${activeGhRepo}\``,
            richType: 'github-agent',
            ghAgentRepo: (ghAgentData.repo as string) || activeGhRepo,
            ghAgentAnalysis: ghAgentData.analysis as string | undefined,
            ghAgentPlan: ghAgentData.plan as string | undefined,
            ghAgentExecution: ghAgentData.execution as string | undefined,
            ghAgentGitOutput: ghAgentData.gitOutput as GHAgentGitOutput | undefined,
            ghAgentFiles: ghAgentData.files as GHAgentFile[] | undefined,
            ghAgentFileContents: ghAgentData.fileContents as { path: string; content: string }[] | undefined,
            ghAgentExecutionReport: ghAgentData.executionReport as GHAgentExecutionReport | null,
            ghAgentAutoExecute: ghAgentAutoExecute,
          })
          return
        }
        // Fallback to text if something went wrong
        addAssistantMessage({ content: (ghAgentData.content as string) || (ghAgentData.error as string) || '⚠️ خطأ في DZ GitHub Agent', richType: 'text' })
        return
      }

      // ── Autonomous pipeline (Devin/Cursor style) ─────────────────────────
      if (detectAutonomousQuery(text) && !dashboardContext) {
        // Smart Task Planner — show plan first for complex multi-step requests
        if (detectComplexQuery(text)) {
          const approved = await generateAndShowPlan(text, outboundMessages, signal, runAutonomousSSE)
          if (!approved) return
        }
        // V5 ReAct loop — محرك أقوى بـ 20+ أداة GitHub، يُجرَّب أولاً دائماً
        // إذا أعاد false (فشل أو لا توكن) → يُكمل بالـ autonomous الاعتيادي
        try {
          const v5Ok = await runV5SSE(text, outboundMessages, signal)
          if (v5Ok) return
        } catch (v5Err) {
          console.warn('[DZChatBox] V5 fallback to autonomous:', (v5Err as Error).message)
          setAgentSteps([])
        }
        try {
          await runAutonomousSSE(text, outboundMessages, signal)
          return
        } catch (sseErr) {
          // SSE failed — fall through to regular fetch
          setAgentSteps([])
          console.warn('[DZChatBox] Autonomous SSE failed, falling back:', (sseErr as Error).message)
        }
      }

      // ── GitHub dashboard quick-action shortcuts (bypass AI routing) ─────────
      // These buttons trigger direct GitHub UI actions, not AI text
      const _ghDirectListRepos = 'اعرض مستودعاتي على GitHub'
      const _ghDirectAnalyze   = 'حلل الكود في مستودعي وأعطني تقريراً عن الأخبار والتحسينات'
      const _ghDirectAnalyze2  = 'حلل الكود في مستودعي وأعطني تقريراً عن الأخطاء والتحسينات'
      const _ghDirectCreate    = 'أنشئ مستودع جديد على GitHub'

      const _isGhDirect = text === _ghDirectListRepos
        || text === _ghDirectAnalyze
        || text === _ghDirectAnalyze2
        || text === _ghDirectCreate

      if (_isGhDirect) {
        setIsLoading(false)
        // Guard: token required for all GitHub direct actions
        if (!githubToken) {
          addAssistantMessage({
            content: '😎 لتحت اختار **وكيل** وسجّل الدخول إلى GitHub',
            richType: 'text',
          })
          return
        }

        if (text === _ghDirectListRepos) {
          // Open interactive repo picker directly — no AI involved
          await fetchRepos()
          return
        }

        if (text === _ghDirectAnalyze || text === _ghDirectAnalyze2) {
          if (!currentRepo) {
            addAssistantMessage({
              content: '🔬 **تحليل الكود**\n\nاختر أولاً المستودع الذي تريد تحليله:',
              richType: 'text',
            })
            await fetchRepos()
          } else {
            await scanRepo({
              name: currentRepo.split('/')[1] || currentRepo,
              full_name: currentRepo,
              description: null,
              language: null,
              private: false,
              default_branch: 'main',
              html_url: `https://github.com/${currentRepo}`,
            })
          }
          return
        }

        if (text === _ghDirectCreate) {
          // Show repo picker to pick base, then guide to create
          addAssistantMessage({
            content: '🆕 **إنشاء مستودع جديد**\n\nاختر مستودعاً موجوداً كمرجع (اختياري) أو أخبرني باسم المستودع الجديد مباشرةً:',
            richType: 'text',
          })
          await fetchRepos()
          return
        }
      }

      // ── GitHub ReAct SSE pipeline ─────────────────────────────────────────
      // Matches same patterns as shouldUseReActLoop() on the server side
      const isGithubReActQuery = !activeGhRepo && (
        (agentMode.active && !!agentMode.selectedRepo) ||
        (/\bgithub\b/i.test(text) && /\b(create|push|add|delete|update|list|show|read|deploy|merge|clone|fork|commit|انشئ|ارفع|احذف|عدل|اعرض|نشر|رفع)\b/i.test(text)) ||
        /أنش[ئئيى]\s*(مستودع|ريبو|repo|repository|فرع|branch|pull)/i.test(text) ||
        /اعرض|عطيني.*مستودع|شوفلي.*مستودع/i.test(text) ||
        /مستودع.*جديد|مستودع.*github/i.test(text) ||
        /commit.*push|push.*commit/i.test(text) ||
        /list\s*(my\s*)?(repos|repositories|files|branches)/i.test(text) ||
        /create\s*(a\s*)?(new\s*)?(repo|repository|branch|pr|pull\s*request)/i.test(text) ||
        /enable\s*(github\s*)?pages/i.test(text) ||
        /show\s*(me\s*)?my\s*(repos|repositories|github)/i.test(text) ||
        /ارفع.*ملف|رفع.*github|احذف.*فرع/i.test(text)
      )
      if (isGithubReActQuery) {
        try {
          // Claude Mode (free-claude-code approach) — uses native function calling
          await runClaudeReActSSE(text, outboundMessages, signal)
          return
        } catch (sseErr) {
          console.warn('[DZChatBox] Claude Mode failed, falling back to standard ReAct:', (sseErr as Error).message)
          setIsGithubReActLoading(false)
          setIsClaudeMode(false)
          setLiveReActSteps([])
          try {
            await runGithubReActSSE(text, outboundMessages, signal)
            return
          } catch (fallbackErr) {
            console.warn('[DZChatBox] Standard ReAct also failed:', (fallbackErr as Error).message)
            setIsGithubReActLoading(false)
            setLiveReActSteps([])
          }
        }
      }

      // ── Thinking Trace — fire in parallel (non-blocking) ──────────────────
      // Skip thinking trace for direct-action operations that have their own UI
      const _isYouTubeDirectOp = /(?:يوتيوب|يوتيب|youtube\.com|youtu\.be)/i.test(text) ||
        (/(?:فيديو|كليب|اغنية|أغنية|موسيقى|نشيد|أنشودة|مقطع|شاهد|video|music|clip|song)/i.test(text) &&
          !/(?:ابني|اصنع|أنشئ|انشئ|صمم|اعمل|create|build|make|design)\s+(?:موقع|صفحة|سايت|site|page)/i.test(text))
      const _isMapDirectOp = /(?:^|\s)(?:خريطة|خرائط|اتجاه|طريق إلى|route|map\b|navigate)/i.test(text) ||
        /(?:مطعم|مستشفى|صيدلية|مدرسة|مسجد|بنك|فندق|محطة)\s+(?:في|ب|قريب|بالقرب)/i.test(text)
      const _isWebsiteCreateOp = /(?:انشئ|أنشئ|اصنع|ابني|اعمل|أعمل|دير|create|build|make|generate)\s+(?:موقع|صفحة|سايت|ويب|site|web|html|landing)/i.test(text)
      const _isWebsiteCloneOp = /https?:\/\/[^\s]{5,}/i.test(text) &&
        /(?:استنسخ|استنساخ|clone|كلون|اعمل نسخة|انسخ الموقع|copy.*site|انسخ)/i.test(text)

      const isComplexQuery = text.length >= 20 &&
        !/^(مرحبا|سلام|شكرا|hello|hi|thanks|ok|okay|نعم|لا|yes|no)\b/i.test(text.trim()) &&
        !_isYouTubeDirectOp && !_isMapDirectOp && !_isWebsiteCreateOp && !_isWebsiteCloneOp
      let thinkingTraceRoles: ThinkingTraceRole[] | null = null
      const thinkingTracePromise = isComplexQuery
        ? (async () => {
            try {
              const sse = await fetch('/api/dz-agent/thinking-trace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: text, messages: outboundMessages.slice(-4) }),
                signal,
              })
              if (!sse.ok) return
              const ct = sse.headers.get('content-type') || ''
              // JSON fast-path (trivial)
              if (ct.includes('application/json')) {
                const j = await sse.json().catch(() => null)
                if (j?.roles) thinkingTraceRoles = j.roles as ThinkingTraceRole[]
                return
              }
              // SSE stream
              const reader = sse.body?.getReader()
              if (!reader) return
              const roles: ThinkingTraceRole[] = []
              const dec = new TextDecoder()
              let buf = ''
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += dec.decode(value, { stream: true })
                const parts = buf.split('\n\n')
                buf = parts.pop() || ''
                for (const chunk of parts) {
                  const lines = chunk.split('\n')
                  const evLine = lines.find(l => l.startsWith('event:'))
                  const dataLine = lines.find(l => l.startsWith('data:'))
                  if (!evLine || !dataLine) continue
                  const ev = evLine.replace('event:', '').trim()
                  const parsed = JSON.parse(dataLine.replace('data:', '').trim())
                  if (ev === 'init') roles.push(...(parsed.roles as ThinkingTraceRole[]).map(r => ({ ...r, output: '' })))
                  if (ev === 'role') {
                    const idx = roles.findIndex(r => r.id === parsed.id)
                    if (idx >= 0) roles[idx] = { ...roles[idx], output: parsed.output }
                  }
                  if (ev === 'done') { thinkingTraceRoles = [...roles]; break }
                }
              }
            } catch { /* thinking trace is optional — silently ignore */ }
          })()
        : Promise.resolve()

      // ── Streaming fast-path (Vercel AI SDK) ──────────────────────────────
      // يُجرّب endpoint البث أولاً — المستخدم يرى أول كلمة خلال ~300ms.
      // إذا أعاد Server "redirect:full" (بيانات حية) → يُكمل بالـ endpoint الكامل.
      const _streamResult = await (async (): Promise<string | null> => {
        const tempId = generateId()
        streamingMsgIdRef.current = tempId
        setMessages(prev => [...prev, {
          id: tempId,
          role: 'assistant' as const,
          content: '',
          richType: 'text' as const,
          isStreaming: true,
        }])
        try {
          const streamRes = await fetch('/api/dz-agent-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({ messages: outboundMessages }),
            signal,
          })
          if (!streamRes.ok || !streamRes.body) throw new Error(`stream-http:${streamRes.status}`)
          const reader = streamRes.body.getReader()
          const dec = new TextDecoder()
          let accumulated = ''
          let shouldRedirect = false
          outer: while (true) {
            const { done, value } = await reader.read()
            if (done) break
            for (const line of dec.decode(value, { stream: true }).split('\n')) {
              if (!line.startsWith('data: ')) continue
              const raw = line.slice(6).trim()
              if (raw === '[DONE]') break outer
              try {
                const parsed = JSON.parse(raw)
                if (parsed.redirect === 'full' || parsed.error) { shouldRedirect = true; break outer }
                if (parsed.token) {
                  accumulated += parsed.token
                  setMessages(prev => prev.map(m =>
                    m.id === tempId ? { ...m, content: accumulated } : m
                  ))
                }
              } catch { /* ignore malformed SSE lines */ }
            }
          }
          if (shouldRedirect || !accumulated.trim()) {
            setMessages(prev => prev.filter(m => m.id !== tempId))
            streamingMsgIdRef.current = null
            return null
          }
          setMessages(prev => prev.map(m =>
            m.id === tempId ? { ...m, isStreaming: false } : m
          ))
          streamingMsgIdRef.current = null
          return accumulated
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            console.warn('[DZChatBox] stream fast-path failed:', (err as Error).message)
          }
          setMessages(prev => prev.filter(m => m.id !== tempId))
          streamingMsgIdRef.current = null
          return null
        }
      })()

      if (_streamResult) {
        await thinkingTracePromise.catch(() => {})
        if (thinkingTraceRoles) {
          setMessages(prev => {
            const lastAsst = [...prev].reverse().find(m => m.role === 'assistant')
            if (!lastAsst) return prev
            return prev.map(m =>
              m.id === lastAsst.id ? { ...m, thinkingTrace: thinkingTraceRoles! } : m
            )
          })
        }
        return
      }

      // Helper to perform one DZ Agent fetch attempt — fully awaits json() inside
      const fetchAgentResponse = async (): Promise<Record<string, unknown>> => {
        return await withRetry(async () => {
          const req = await fetch('/api/dz-agent-chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store, no-cache',
              'Pragma': 'no-cache',
            },
            cache: 'no-store',
            body: JSON.stringify({
              messages: outboundMessages,
              githubToken: githubToken || undefined,
              currentRepo: currentRepo || undefined,
              agentActive: agentMode.active || undefined,
              dashboardContext,
              youtubeContext: activeYouTubeVideoRef.current || undefined,
              youtubeCandidates: youtubeCandidatesRef.current.length > 0 ? youtubeCandidatesRef.current : undefined,
              cerebrasKey: cerebrasKey || undefined,
            }),
            signal,
          })
          if (!req.ok) {
            const errData = await req.json().catch(() => null)
            throw new Error(errData?.error || `Server error: ${req.status}`)
          }
          const parsed = await req.json()
          if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON response')
          return parsed as Record<string, unknown>
        }, 2, 1000)
      }

      // Run thinking trace and main fetch truly in parallel on first attempt
      // On retries: skip trace wait and fetch directly
      let data: Record<string, unknown> = {}
      let attempts = 0
      const _fetchT0 = Date.now()
      while (attempts < 3) {
        if (attempts === 0) {
          // Parallel: main response + thinking trace simultaneously
          const [fetchResult] = await Promise.all([
            fetchAgentResponse(),
            thinkingTracePromise.catch(() => {}),
          ])
          data = fetchResult
        } else {
          data = await fetchAgentResponse()
        }
        console.log('[DZChatBox] API response (attempt', attempts + 1, '):', data)
        if (data.action || data.pendingAction || data.richType || (typeof data.content === 'string' && data.content.trim() !== '')) {
          break
        }
        attempts++
        if (attempts < 3) {
          console.warn('[DZChatBox] Empty response, retrying... attempt', attempts + 1)
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      // Ensure content is never blank (skip for structured rich responses)
      if (!data.richType && (!data.content || (typeof data.content === 'string' && data.content.trim() === ''))) {
        data.content = '⚠️ DZ Agent لم يتمكن من توليد رد. يرجى المحاولة مرة أخرى.'
      }

      // ── Tool Redirect — show navigation card when a dedicated tool exists ──
      if (data._toolRedirect && typeof data._toolRedirect === 'object') {
        const tr = data._toolRedirect as { toolName: string; toolUrl: string; toolIcon: string; toolDesc: string; message: string; smartMessage?: string }
        addAssistantMessage({
          content: tr.smartMessage || tr.message,
          richType: 'tool-redirect',
          toolRedirect: tr,
        })
        return
      }

      if (data.action === 'list-repos') {
        trackFeatureUsage('github-repos')
        // Guard: if no token yet, show connect prompt instead of the cryptic fetchRepos error
        if (!githubToken && !serverGithubConnected) {
          addAssistantMessage({
            content: '😎 لتحت اختار **وكيل** وسجّل الدخول إلى GitHub',
            richType: 'text',
          })
          return
        }
        await fetchRepos()
        return
      }
      if (data.action === 'list-files' && data.repo) {
        trackFeatureUsage('github-files')
        await fetchFiles(data.repo as string, (data.path as string) || '')
        return
      }
      if (data.action === 'read-file' && data.repo && data.path) {
        trackFeatureUsage('github-read-file')
        await fetchFileContent(data.repo as string, data.path as string)
        return
      }

      // Build a synthetic RepoItem from a "owner/name" string when needed
      const buildRepoItem = (full: string): RepoItem => ({
        name: full.split('/')[1] || full,
        full_name: full,
        description: null,
        language: null,
        private: false,
        default_branch: 'main',
        html_url: `https://github.com/${full}`,
      })

      if (data.action === 'scan-repo' && data.repo) {
        trackFeatureUsage('github-scan')
        const focus = (data.focus as string) || undefined
        await scanRepo(buildRepoItem(data.repo as string), focus)
        return
      }
      if (data.action === 'list-branches' && data.repo) {
        trackFeatureUsage('github-branches')
        await fetchBranches(buildRepoItem(data.repo as string))
        return
      }
      if (data.action === 'list-issues' && data.repo) {
        trackFeatureUsage('github-issues')
        await fetchIssues(buildRepoItem(data.repo as string))
        return
      }
      if (data.action === 'list-pulls' && data.repo) {
        trackFeatureUsage('github-pulls')
        await fetchPulls(buildRepoItem(data.repo as string))
        return
      }
      if (data.action === 'repo-stats' && data.repo) {
        trackFeatureUsage('github-stats')
        await fetchStats(buildRepoItem(data.repo as string))
        return
      }

      // ── New AI Coding Actions (triggered via chat text) ──────────────────
      if (data.action === 'analyze-project' && data.repo) {
        trackFeatureUsage('github-analyze')
        addAssistantMessage({ content: (data.content as string) || '🔬 جاري التحليل...', richType: 'text' })
        await analyzeProject(buildRepoItem(data.repo as string))
        return
      }
      if (data.action === 'generate-and-push' && data.repo) {
        trackFeatureUsage('github-generate')
        const desc = (data.description as string) || ''
        addAssistantMessage({ content: (data.content as string) || '⚡ جاري التوليد...', richType: 'text' })
        if (desc) {
          await generateAndPush(buildRepoItem(data.repo as string), desc)
        } else {
          addAssistantMessage({ content: '⚡ صف الميزة التي تريد إنشاءها بوضوح، مثلاً: "أضف صفحة تسجيل دخول بـ React"', richType: 'text' })
        }
        return
      }
      if (data.action === 'improve-design' && data.repo) {
        trackFeatureUsage('github-design')
        addAssistantMessage({ content: (data.content as string) || '🎨 جاري التحسين...', richType: 'text' })
        await improveDesign(buildRepoItem(data.repo as string))
        return
      }
      if (data.action === 'deploy-pages' && data.repo) {
        trackFeatureUsage('github-deploy')
        addAssistantMessage({ content: (data.content as string) || '🌐 جاري النشر على GitHub Pages...', richType: 'text' })
        await deployToGitHubPages(buildRepoItem(data.repo as string))
        return
      }

      // ── GitHub whoami — update user state & show profile card ────────────
      if (data.githubAction === 'whoami' && data.githubUser) {
        const gu = data.githubUser as typeof githubUser
        if (gu) {
          setGithubUser(gu)
          try { sessionStorage.setItem('dz-agent-gh-user', JSON.stringify(gu)) } catch {}
        }
        addAssistantMessage({
          content: (data.content as string) || `👤 بروفايل @${gu?.login}`,
          richType: 'github-profile',
          githubProfile: gu,
        })
        return
      }
      // ── GitHub repo created — show success content ────────────────────────
      if (data.githubAction === 'repo-created') {
        if (data.githubUser) {
          setGithubUser(prev => prev
            ? { ...prev, login: data.githubUser as string }
            : { login: data.githubUser as string, name: data.githubUser as string, avatar: '', url: `https://github.com/${data.githubUser}`, repos: 0 }
          )
        }
        addAssistantMessage({ content: data.content as string, richType: 'text' })
        return
      }

      // ── GitHub ReAct Loop response ─────────────────────────────────────────
      if (data.mode === 'github-react') {
        trackFeatureUsage('github-react')
        setIsGithubReActLoading(false)
        setLiveReActSteps([])
        addAssistantMessage({
          content: (data.content as string) || '✅ اكتملت عمليات GitHub',
          richType: 'github-react',
          reactSteps: (data.steps as ReActStep[]) || [],
        })
        return
      }

      if (data.pendingAction) {
        addAssistantMessage({
          content: (data.content as string) || 'يرجى مراجعة هذا الإجراء والموافقة عليه:',
          richType: 'approval',
          pendingAction: data.pendingAction as PendingAction,
        })
      } else if (data.isMap && ((data.mapMeta as Record<string, unknown>)?.gmapsUrl || (typeof data.mapHtml === 'string' && data.mapHtml.length > 100))) {
        trackFeatureUsage('dz-maps')
        addAssistantMessage({
          content: (data.content as string) || '🗺️ الخريطة جاهزة',
          richType: 'map',
          mapHtml: data.mapHtml as string,
          mapMeta: (data.mapMeta as Record<string, unknown>) || {},
        })
      } else if (data.isExecution && typeof data.executionCode === 'string' && data.executionCode.length > 5) {
        trackFeatureUsage('code-execution')
        addAssistantMessage({
          content: (data.content as string) || '✅ تم إنشاء الكود بنجاح!',
          richType: 'execution',
          executionLang: (data.executionLang as string) || 'javascript',
          executionCode: data.executionCode as string,
        })
      } else if (data.isYouTube) {
        trackFeatureUsage('youtube-insight')
        addAssistantMessage({
          content: (data.content as string) || '🎬 YouTube',
          richType: 'youtube',
          youtubeFlow: (data.youtubeFlow as 'url' | 'search') || 'search',
          youtubeVideo: data.youtubeVideo as YouTubeVideoData | undefined,
          youtubeResults: data.youtubeResults as YouTubeResult[] | undefined,
          youtubeAnalysis: data.youtubeAnalysis as YouTubeAnalysis | undefined,
          youtubeSuggestions: (data.youtubeSuggestions as string[]) || [],
          captionNote: data.captionNote as string | undefined,
          captionText: data.captionText as string | undefined,
        })
      } else if (data.isWebReader && data.webSiteInfo) {
        trackFeatureUsage('web-reader')
        addAssistantMessage({
          content: (data.content as string) || '🌐 تم اكتشاف الموقع',
          richType: 'web-reader',
          webReaderSiteInfo: data.webSiteInfo as { url: string; title: string; domain: string; description: string; headings: string[] },
        })
      } else if (data.richType === 'doctor-results' && Array.isArray(data.doctors)) {
        trackFeatureUsage('doctor-search')
        addAssistantMessage({
          content: '',
          richType: 'doctor-results',
          doctors: data.doctors as DoctorResult[],
          dirs: (data.dirs as DirLink[]) || [],
          dua: (data.dua as string) || 'ربي يجيب الشفاء 🤍\nاللهم اشفي مرضانا ومرضى المسلمين أجمعين يا رب العالمين.',
          doctorMeta: {
            speciality: (data.speciality as { ar: string; fr: string }) || { ar: 'الأطباء', fr: '' },
            city: (data.city as { ar: string; fr: string }) || { ar: '', fr: '' },
            hasGps: !!data.hasGps,
            cached: !!data.cached,
            byName: !!data.byName,
            queryName: (data.queryName as string) || undefined,
          },
        })
      } else if ((data._imageSearch || data.mode === 'image-search') && Array.isArray(data.images) && (data.images as unknown[]).length > 0) {
        const fullImgs = (data.images as Array<{ url: string; fullUrl?: string; title: string; source?: string; sourceUrl?: string; creator?: string }>).slice(0, 12)
        addAssistantMessage({
          content: (data.content as string) || `🔍 **${fullImgs.length} صورة** — اضغط للمعاينة`,
          richType: 'imageGrid',
          imageGrid: fullImgs.map(i => i.url),
          imageGridFull: fullImgs,
          imagePrompt: text,
          imageModel: 'بحث الصور',
          imageStyle: 'web',
          quickSuggestions: [`صور أخرى لـ ${text.slice(0, 30)}`, `ارسم ${text.slice(0, 30)} بالذكاء الاصطناعي`],
        })
      } else if (data.isWebsite && typeof data.htmlCode === 'string' && data.htmlCode.length > 100) {
        trackFeatureUsage('website-builder')
        addAssistantMessage({
          content: (data.content as string) || '✅ تم إنشاء موقعك!',
          richType: 'website',
          htmlCode: data.htmlCode as string,
          cssCode: (data.cssCode as string) || '',
          jsCode:  (data.jsCode  as string) || '',
          webBuilderMeta: data.webBuilderMeta as { type: string; style: string; title: string; description: string; icon: string } | undefined,
          webReaderIntent: data.webReaderIntent as 'build' | 'reader' | 'update' | 'extract' | undefined,
        })
      } else {
        const responseContent = (data.content as string) || '⚠️ DZ Agent لم يتمكن من توليد رد. يرجى المحاولة مرة أخرى.'
        const serverSuggestions = Array.isArray(data.quickSuggestions) && (data.quickSuggestions as string[]).length > 0
          ? (data.quickSuggestions as string[])
          : undefined
        const _sugCtx = {
          isWC2026: !!(data.wc2026) || /كأس\s*العالم|مونديال|wc\s*2026|المجموعة\s*[jج]|متى\s*ستلعب|جدول\s*مباريات\s*الجزائر|نتيجة\s*الجزائر/i.test(text),
          isSports: !!(data._sportsAgent) || /منتخب\s*الجزائري|الخضر|المنتخب\s*الوطني|مباريات\s*الجزائر/i.test(text),
        }
        const autoSuggestions = serverSuggestions || generateClientSuggestions(responseContent, text, _sugCtx)
        const codeExtract = extractCodeBlock(responseContent)
        addAssistantMessage({
          content: responseContent,
          richType: 'text',
          showDevCard: !!data.showDevCard,
          hasMoreNews: !!data.hasMoreNews,
          newsQuery: data.newsQuery as string | undefined,
          newsItems: Array.isArray(data.newsItems) ? data.newsItems as { title: string; url: string; date?: string; source?: string; snippet?: string }[] : undefined,
          webReaderIntent: data.webReaderIntent as 'build' | 'reader' | 'update' | 'extract' | undefined,
          quickSuggestions: autoSuggestions,
          thinkingTrace: thinkingTraceRoles ?? undefined,
          model: typeof data.model === 'string' ? data.model : (typeof data.fallbackModel === 'string' ? data.fallbackModel : undefined),
          responseTime: Math.round(Date.now() - _fetchT0),
          executionCode: codeExtract?.code,
          executionLang: codeExtract?.lang,
          matchVsMeta: (data.matchVsData as { team1: string; team2: string; temporal: string; date?: string | null; time?: string | null; competition?: string | null; venue?: string | null; city?: string | null; round?: string | null; kooraLink?: string | null; homeScore?: number | null; awayScore?: number | null } | undefined) || _clientMatchVs || undefined,
          wcGroupData: data.wcGroupData as DZMessage['wcGroupData'] | undefined,
          wc2026: data.wc2026 as DZMessage['wc2026'] | undefined,
          _sportsAgent: !!(data._sportsAgent),
          _nationalTeam: !!(data._nationalTeam),
          matches: Array.isArray(data.matches) ? data.matches as Array<Record<string, unknown>> : undefined,
        })

        // Smart Repo Suggestion — if agent mode active and message describes a project
        if (agentMode.active && /أريد|أبني|أنشئ|أصنع|أطور|اعمل|ابني|انشئ|بناء|إنشاء|مشروع|موقع|تطبيق|برنامج|build|create|make/i.test(text)) {
          fetch('/api/dz-agent/smart-repos/suggest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text }),
          }).then(r => r.json()).then(d => {
            if (d.repos && d.repos.length > 0) {
              addAssistantMessage({
                content: `💡 **DZ Agent يقترح** — بناءً على مشروعك، هذه المستودعات قد تفيدك:`,
                richType: 'smart-repo-suggestion',
                smartRepoSuggestions: d.repos,
              })
            }
          }).catch(() => {})
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('[DZChatBox] sendMessage error:', err)
      addAssistantMessage({ content: '⚠️ خطأ في الشبكة. يرجى المحاولة مرة أخرى.', richType: 'text', isError: true })
    } finally {
      setIsLoading(false)
      setAgentSteps([])
      setAgentTaskType(null)
      setIsGithubReActLoading(false)
      setLiveReActSteps([])
      abortRef.current = null
    }
  }, [input, isLoading, messages, githubToken, currentRepo, activeYouTubeVideo, fetchRepos, fetchFiles, fetchFileContent, scanRepo, fetchBranches, fetchIssues, fetchPulls, fetchStats, addAssistantMessage, detectAutonomousQuery, detectComplexQuery, generateAndShowPlan, runV5SSE, runAutonomousSSE, runGithubReActSSE, runClaudeReActSSE])

  // Feature C — Export conversation as Markdown
  const exportAsMarkdown = useCallback(() => {
    if (messages.length === 0) return
    const dateStr = new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const rows = messages.map(m => {
      const isUser = m.role === 'user'
      return `<div class="msg ${isUser ? 'msg-user' : 'msg-bot'}">
        <div class="msg-header">${isUser ? '👤 أنت' : '🤖 DZ Agent'}</div>
        <div class="msg-body">${escHtml(m.content || '').replace(/\n/g, '<br>')}</div>
      </div>`
    }).join('<div class="sep"></div>')

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>محادثة DZ Agent — ${dateStr}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Cairo',Tahoma,Arial,sans-serif;direction:rtl;text-align:right;background:#fff;color:#111;padding:36px 40px;line-height:1.75;font-size:14px}
  .cover{margin-bottom:28px;padding-bottom:18px;border-bottom:3px solid #111}
  .cover h1{font-size:24px;font-weight:900;margin-bottom:6px}
  .cover .meta{font-size:12px;color:#777}
  .msg{margin-bottom:6px;page-break-inside:avoid}
  .msg-header{font-size:11px;font-weight:700;margin-bottom:6px;color:#888;letter-spacing:.03em}
  .msg-user .msg-header{color:#1d4ed8}
  .msg-bot .msg-header{color:#15803d}
  .msg-body{background:#f8f8f8;border-radius:10px;padding:12px 16px;font-size:13.5px;white-space:pre-wrap;word-break:break-word;border-right:3px solid #ddd;direction:rtl;text-align:right}
  .msg-user .msg-body{border-right-color:#1d4ed8;background:#eff6ff}
  .msg-bot .msg-body{border-right-color:#15803d;background:#f0fdf4}
  .sep{border:none;border-top:1px solid #eee;margin:12px 0}
  @media print{body{padding:20px}@page{margin:1.5cm}}</style>
</head>
<body>
<div class="cover">
  <h1>🤖 محادثة DZ Agent</h1>
  <p class="meta">📅 ${dateStr} &nbsp;·&nbsp; 💬 ${messages.length} رسالة</p>
</div>
${rows}
</body>
</html>`

    const win = window.open('', '_blank', 'width=860,height=720,scrollbars=yes')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.onload = () => setTimeout(() => { try { win.print() } catch {} }, 400)
  }, [messages])

  const regenerate = useCallback(async () => {
    if (messages.length < 2 || isLoading) return
    const withoutLast = messages.slice(0, -1)
    setMessages(withoutLast)
    setIsLoading(true)
    try {
      abortRef.current = new AbortController()
      const signal = abortRef.current.signal

      // Auto-retry up to 3 times on empty response
      let content = ''
      let attempts = 0
      while (attempts < 3) {
        const res = await fetch('/api/dz-agent-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache',
            'Pragma': 'no-cache',
          },
          cache: 'no-store',
          body: JSON.stringify({
            messages: withoutLast.map(m => ({ role: m.role, content: m.content })),
            githubToken: githubToken || undefined,
            cerebrasKey: cerebrasKey || undefined,
            isRetry: true,
            retrySeed: Math.floor(Math.random() * 999999),
          }),
          signal,
        })
        if (!res.ok) throw new Error(`Server error: ${res.status}`)
        const data = await res.json()
        console.log('[DZChatBox] regenerate response (attempt', attempts + 1, '):', data)
        content = typeof data.content === 'string' ? data.content.trim() : ''
        if (content) break
        attempts++
        if (attempts < 3) await new Promise(resolve => setTimeout(resolve, 1000))
      }

      addAssistantMessage({
        content: content || '⚠️ DZ Agent لم يتمكن من توليد رد. يرجى المحاولة مرة أخرى.',
        richType: 'text',
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('[DZChatBox] regenerate error:', err)
      addAssistantMessage({ content: '⚠️ خطأ في الشبكة. يرجى المحاولة مرة أخرى.', richType: 'text', isError: true })
    } finally {
      setIsLoading(false)
      abortRef.current = null
    }
  }, [messages, isLoading, githubToken, addAssistantMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim()) {
        setCmdHistory(prev => [input.trim(), ...prev.slice(0, 49)])
        historyIdxRef.current = -1
      }
      sendMessage()
      return
    }
    if (e.key === 'ArrowUp' && !input.trim()) {
      e.preventDefault()
      if (cmdHistory.length === 0) return
      const newIdx = Math.min(historyIdxRef.current + 1, cmdHistory.length - 1)
      historyIdxRef.current = newIdx
      setInput(cmdHistory[newIdx])
      return
    }
    if (e.key === 'ArrowDown' && historyIdxRef.current >= 0) {
      e.preventDefault()
      if (historyIdxRef.current <= 0) { historyIdxRef.current = -1; setInput(''); return }
      const newIdx = historyIdxRef.current - 1
      historyIdxRef.current = newIdx
      setInput(cmdHistory[newIdx])
    }
  }

  const clearChat = () => {
    abortRef.current?.abort()
    setMessages([])
    setIsLoading(false)
    setTypingId(null)
    setActiveYouTubeVideo(null)
  }

  const isGithubConnected = serverGithubConnected || !!githubToken

  // ===== RENDER =====
  return (
    <div className="dz-chatbox" dir="rtl">
      {/* Compact icon-only toolbar */}
      <div className="dz-gh-bar">
        {/* Agent bar toggle button */}
        <button
          className={`gh-log-toggle dz-agent-bar-toggle ${showAgentBar ? 'active' : ''} ${agentHintGlow ? 'dz-agent-bar-toggle--glow' : ''}`}
          onClick={() => { setShowAgentBar(v => !v); setAgentHintGlow(false) }}
          title={showAgentBar ? 'إخفاء شريط الوكيل' : 'إظهار شريط الوكيل'}
          style={{ position: 'relative' }}
        >
          <Bot size={13} />
          {/* Badge — يظهر فقط عندما يكون الشريط مخفياً والوكيل شغّال */}
          {!showAgentBar && isLoading && (
            <span
              key="loading-badge"
              className="dz-bot-badge"
              title="الوكيل يعالج طلبك…"
            >
              {isGithubReActLoading ? 'GH' : '●'}
            </span>
          )}
          {!showAgentBar && !isLoading && toasts.length > 0 && (
            <span
              key="toast-badge"
              className="dz-bot-badge dz-bot-badge--dot"
              title={`${toasts.length} إشعار`}
            />
          )}
        </button>

        {/* Typewriter ticker — مكوّن معزول لا يتأثر بإعادات رسم الوكيل */}
        <TickerText />

        <div className="dz-toolbar-spacer" />

        <div className="dz-toolbar-actions">
          {agentMode.active && agentMode.selectedRepo && (
            <>
              <button className="gh-log-toggle dz-agent-quick-btn" onClick={() => setShowFindDialog(true)} title="بحث عن ملف في المستودع">
                <Search size={13} />
              </button>
              <button className="gh-log-toggle dz-agent-quick-btn" onClick={() => sendMessage('/scan')} title="فحص الكود عن أخطاء">
                <ScanSearch size={13} />
              </button>
              <div className="dz-toolbar-sep" />
            </>
          )}
          {messages.length > 0 && (
            <button className="gh-log-toggle" onClick={exportAsMarkdown} title="تصدير المحادثة PDF">
              <Download size={13} />
            </button>
          )}
          <button className="gh-log-toggle" onClick={() => window.open('/quran', '_blank')} title="القرآن الكريم">
            <BookOpen size={13} />
          </button>
          <button className="gh-log-toggle" onClick={() => window.open('/stats', '_blank')} title="إحصاءاتك">
            <BarChart2 size={13} />
          </button>
          <button className="gh-log-toggle gh-tools-btn" onClick={() => window.open('/tools', '_blank')} title="أدوات ذكية">
            <Wrench size={13} />
          </button>
          <button className={`gh-log-toggle ${showLog ? 'active' : ''}`} onClick={() => setShowLog(!showLog)} title="سجل الإجراءات">
            <Terminal size={13} />
            {actionLog.length > 0 && <span className="dz-log-badge">{actionLog.length}</span>}
          </button>
          {/* Clear button — far right */}
          {messages.length > 0 && (
            <>
              <div className="dz-toolbar-sep" />
              <button className="gh-log-toggle dz-toolbar-clear-btn" onClick={clearChat} title="مسح المحادثة">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Auth error */}
      {authError && (
        <div className="dz-auth-error">
          <span>⚠️ {authError}</span>
          <button onClick={() => setAuthError(null)}>×</button>
        </div>
      )}

      {/* Action Log Panel */}
      {showLog && <ActionLogPanel entries={actionLog} />}

      {/* Welcome Screen OR Messages — mutually exclusive to avoid flex space split */}
      {messages.length === 0 && !isLoading && !showLog ? (
        <div className="dz-welcome">
          <div className="dz-welcome-icon">
            <Bot size={40} />
          </div>
          <h2 className="dz-welcome-title">DZ Agent</h2>
          <p className="dz-welcome-sub">
            أول نموذج ذكاء اصطناعي و وكيل جزائري
          </p>

          {/* Live Dashboard Cards — top position, under logo */}
          <div className="dz-dashboard-wrapper">
            <DZDashboard onSend={(q, context) => sendMessage(q, context)} onDoctorGpsReady={handleDoctorGpsReady} />
          </div>

          {false ? (
            <SmartStudyCard
              onSend={(text) => sendMessage(text)}
              disabled={isLoading}
            />
          ) : null}

          {!isGithubConnected && (
            <div className="dz-github-note">
              <Github size={14} className="dz-github-note-icon" />
              <span>
                ربط GitHub <strong>اختياري</strong> — مطلوب فقط إذا أردت تصحيح كود في مشروعك، إنشاء مشروع جديد، أو الحصول على مساعدة في بناء مشروع.
              </span>
              {oauthEnabled && (
                <a href="/api/auth/github" className="dz-github-note-btn">
                  <Github size={12} /> ربط الآن
                </a>
              )}
            </div>
          )}

          <div className="dz-quick-actions">
            {QUICK_ACTIONS.map((a, i) => (
              <button
                key={i}
                className="dz-qa-btn"
                onClick={() => sendMessage(a.cmd)}
                style={{ '--qa-color': a.color, '--qa-color-bg': a.color + '14', '--qa-color-border': a.color + '30' } as React.CSSProperties}
              >
                <span className="dz-qa-icon-wrap">
                  <span className="dz-qa-icon">{a.icon}</span>
                </span>
                <span className="dz-qa-text">
                  <span className="dz-qa-label">{a.label}</span>
                  <span className="dz-qa-desc">{a.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
      /* Messages */
      <div className="dz-messages" data-render-key={renderKey}>
        {messages.map((msg) => (
          <div key={msg.id} className={`dz-message dz-message--${msg.role}`}>
            <div className="dz-message-avatar">
              {msg.role === 'user' ? (
                <div className="dz-avatar dz-avatar--user">U</div>
              ) : (
                <div className={`dz-avatar dz-avatar--bot ${msg.isError ? 'dz-avatar--error' : ''}`}>
                  <Sparkles size={15} />
                </div>
              )}
            </div>
            <div className="dz-message-body">
              <div className="dz-message-sender">
                {msg.role === 'user' ? 'You' : 'DZ Agent'}
              </div>
              <div className={`dz-message-text ${msg.isError ? 'dz-message-text--error' : ''}`} dir="rtl">
                {msg.role === 'assistant' && msg.thinkingTrace && msg.thinkingTrace.length > 0 && (
                  <ThinkingTracePanel roles={msg.thinkingTrace} />
                )}
                {msg.role === 'assistant' ? (
                  msg.isStreaming ? (
                    <span className="dz-stream-text">
                      {msg.content}
                      <span className="dz-stream-cursor">▊</span>
                    </span>
                  ) : typingId === msg.id && msg.richType === 'text' ? (
                    <TypingEffect text={msg.content} onDone={() => setTypingId(null)} />
                  ) : (
                    <>
                      {msg.webReaderIntent && (
                        <div style={{ marginBottom: 6 }}>
                          <WebReaderIntentBadge intent={msg.webReaderIntent} />
                        </div>
                      )}
                      {(msg as any).wc2026?.nextMatch && (() => {
                        const _allFix: any[] = Array.isArray((msg as any).wc2026?.fixtures) && (msg as any).wc2026.fixtures.length > 0
                          ? (msg as any).wc2026.fixtures
                          : [(msg as any).wc2026.nextMatch]
                        const _nextOnly = _allFix.filter((f: any) => f.statusType === 'upcoming' || f.statusType === 'live')
                        const _mainMatch = _nextOnly[0] || _allFix[0]
                        return (
                          <WC2026MatchCard
                            matches={[_mainMatch]}
                            title={`⚽ المباراة القادمة — المجموعة ${(msg as any).wc2026.group || 'J'}`}
                            allFixtures={_allFix}
                            autoRefresh={true}
                            refreshInterval={60000}
                          />
                        )
                      })()}
                      {(msg as any)._sportsAgent && Array.isArray((msg as any).matches) && (msg as any).matches.length > 0 && !(msg as any).wc2026?.nextMatch && (() => {
                        // Deduplicate with team name normalization (e.g. "أمريكا" = "الولايات المتحدة")
                        const _aliases: Record<string,string> = { 'أمريكا':'الولايات المتحدة','الولايات المتحده':'الولايات المتحدة','USA':'الولايات المتحدة','US':'الولايات المتحدة','كوريا':'كوريا الجنوبية' }
                        const _norm = (t: string) => _aliases[t] || t.trim()
                        const _seen = new Set<string>()
                        const _deduped = ((msg as any).matches as any[]).filter((m: any) => {
                          const h = _norm(m.homeTeam); const a = _norm(m.awayTeam); const d = m.date || ''
                          const k1 = `${h}|${a}|${d}`; const k2 = `${a}|${h}|${d}`
                          if (_seen.has(k1) || _seen.has(k2)) return false
                          _seen.add(k1); return true
                        })
                        return (
                          <WC2026MatchCard
                            matches={_deduped}
                            title="⚽ كأس العالم FIFA 2026"
                            autoRefresh={_deduped.some((m: any) => m.statusType === 'live' || m.statusType === 'upcoming')}
                            allFixtures={_deduped}
                          />
                        )
                      })()}
                      {/* Algeria vs X in WC context — use full fixture data */}
                      {(msg as any)._sportsAgent && (msg as any).wc2026 && !(msg as any).wc2026?.nextMatch && !(Array.isArray((msg as any).matches) && (msg as any).matches.length > 0) && msg.matchVsMeta && (() => {
                        const mv = msg.matchVsMeta!
                        const _isAlgVs = /جزائر|Algeria/i.test(mv.team1 + mv.team2)
                        if (!_isAlgVs) return null
                        // Hardcoded WC2026 Algeria fixtures for client-side lookup
                        const _algFix: any[] = [
                          { homeTeam: 'الأرجنتين', awayTeam: 'الجزائر', date: '2026-06-17', startTime: '01:00', venue: 'MetLife Stadium', city: 'East Rutherford', country: 'الولايات المتحدة', statusType: 'upcoming', competition: 'كأس العالم 2026 — المجموعة J', round: 'الجولة 1' },
                          { homeTeam: 'الجزائر', awayTeam: 'النمسا', date: '2026-06-21', startTime: '02:00', venue: 'Arrowhead Stadium', city: 'كانساس سيتي', country: 'الولايات المتحدة', statusType: 'upcoming', competition: 'كأس العالم 2026 — المجموعة J', round: 'الجولة 2' },
                          { homeTeam: 'الأردن', awayTeam: 'الجزائر', date: '2026-06-25', startTime: '03:00', venue: 'AT&T Stadium', city: 'دالاس', country: 'الولايات المتحدة', statusType: 'upcoming', competition: 'كأس العالم 2026 — المجموعة J', round: 'الجولة 3' },
                        ]
                        const t1 = mv.team1.replace(/^ال/, ''); const t2 = mv.team2.replace(/^ال/, '')
                        const _found = _algFix.find(f =>
                          (f.homeTeam.includes(t1) || f.homeTeam.includes(t2) || f.awayTeam.includes(t1) || f.awayTeam.includes(t2)) ||
                          (f.homeTeam === mv.team1 || f.homeTeam === mv.team2 || f.awayTeam === mv.team1 || f.awayTeam === mv.team2)
                        ) || _algFix[0]
                        return (
                          <WC2026MatchCard
                            matches={[_found]}
                            title="⚽ المباراة القادمة — المجموعة J"
                            allFixtures={_algFix}
                          />
                        )
                      })()}
                      {msg.content && !((msg as any)._sportsAgent && Array.isArray((msg as any).matches) && (msg as any).matches.length > 0) && !((msg as any).wc2026?.nextMatch) && !((msg as any)._sportsAgent && (msg as any).wc2026 && msg.matchVsMeta && /جزائر|Algeria/i.test((msg.matchVsMeta.team1 || '') + (msg.matchVsMeta.team2 || ''))) && (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p({ children }) { return <p dir="rtl">{children}</p> },
                            li({ children, ...props }) { return <li dir="rtl" {...props}>{children}</li> },
                            h1({ children }) { return <h1 dir="rtl">{children}</h1> },
                            h2({ children }) { return <h2 dir="rtl">{children}</h2> },
                            h3({ children }) { return <h3 dir="rtl">{children}</h3> },
                            h4({ children }) { return <h4 dir="rtl">{children}</h4> },
                            blockquote({ children }) { return <blockquote dir="rtl">{children}</blockquote> },
                            code({ className, children, ...props }) {
                              const isBlock = className?.startsWith('language-')
                              if (isBlock) return <DZCodeBlock className={className}>{children}</DZCodeBlock>
                              return <code className={className} dir="ltr" {...props}>{children}</code>
                            },
                            pre({ children }) { return <>{children}</> },
                            a({ href, children, ...props }) {
                              const label = typeof children === 'string' ? children : (Array.isArray(children) ? children.join('') : '')
                              const isReadMore = /اقرأ المزيد/i.test(label)
                              if (isReadMore && href) {
                                return (
                                  <button
                                    className="dz-read-more-btn"
                                    onClick={() => setArticlePopupUrl(href)}
                                  >
                                    📰 اقرأ المزيد
                                  </button>
                                )
                              }
                              const childArr = Array.isArray(children) ? children : [children]
                              const firstChild = childArr[0]
                              const isFaviconImg = firstChild && typeof firstChild === 'object' && (firstChild as React.ReactElement)?.type === 'img'
                                && ((firstChild as React.ReactElement)?.props?.src || '').includes('google.com/s2/favicons')
                              if (isFaviconImg) {
                                const imgEl = firstChild as React.ReactElement
                                const src = imgEl.props?.src || ''
                                let domain = ''
                                try { domain = new URL(src).searchParams.get('domain') || '' } catch (_) {}
                                const label = imgEl.props?.alt || domain
                                return (
                                  <a href={href} target="_blank" rel="noopener noreferrer" className="dz-src-chip">
                                    <img src={src} alt={label} className="dz-src-favicon" />
                                    <span className="dz-src-name">{label}</span>
                                  </a>
                                )
                              }
                              return (
                                <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                                  {children}
                                </a>
                              )
                            },
                            table({ children }) {
                              return (
                                <TableScrollWrapper>
                                  <DZMDTable>{children}</DZMDTable>
                                </TableScrollWrapper>
                              )
                            },
                            thead({ children }) { return <thead>{children}</thead> },
                            tbody({ children }) { return <tbody>{children}</tbody> },
                            tr({ children }) { return <tr>{children}</tr> },
                            th({ children }) { return <th dir="auto">{children}</th> },
                            td({ children }) { return <td dir="auto">{children}</td> },
                          }}
                        >{msg.content}</ReactMarkdown>
                      )}
                      {msg.richType === 'text' && msg.executionCode && (
                        <CodeExecutionPreview code={msg.executionCode} lang={msg.executionLang || 'python'} />
                      )}
                      {msg.model && msg.responseTime && msg.responseTime > 0 && (
                        <div className="dz-msg-meta">
                          <span className="dz-response-time">
                            {msg.responseTime < 1000
                              ? `${msg.responseTime}ms`
                              : `${(msg.responseTime / 1000).toFixed(1)}s`}
                          </span>
                        </div>
                      )}
                      {msg.hasMoreNews && msg.newsQuery && (
                        <button
                          className="dz-load-more-news-btn"
                          onClick={() => sendMessage(`عرض المزيد من الأخبار حول: ${msg.newsQuery}`)}
                        >
                          📰 عرض المزيد من الأخبار
                        </button>
                      )}
                      {msg.navigateSuggestion && !dismissedNavSuggestions.has(msg.id) && (
                        <NavigationSuggestionCard
                          path={msg.navigateSuggestion.path}
                          title={msg.navigateSuggestion.title}
                          description={msg.navigateSuggestion.description}
                          onYes={() => navigate(msg.navigateSuggestion!.path)}
                          onDismiss={() => setDismissedNavSuggestions(prev => new Set([...prev, msg.id]))}
                        />
                      )}
                      {msg.showDevCard && <DeveloperCard />}
                      {msg.richType === 'repos' && msg.repos && (
                        <ReposList
                          repos={msg.repos}
                          onSelect={selectRepo}
                          onExport={handleExportRepos}
                        />
                      )}
                      {msg.richType === 'repos-suggest' && msg.suggestedRepos && (
                        <ReposSuggestPanel repos={msg.suggestedRepos} />
                      )}
                      {msg.richType === 'smart-repo-suggestion' && msg.smartRepoSuggestions && msg.smartRepoSuggestions.length > 0 && (
                        <SmartRepoSuggestion
                          repos={msg.smartRepoSuggestions}
                          currentRepo={agentMode.selectedRepo || currentRepo || undefined}
                          githubToken={agentMode.githubToken || githubToken || undefined}
                          onImportDone={(_repoName, message) => {
                            addAssistantMessage({ content: message, richType: 'text' })
                            addToast({ type: 'import', title: `تم استيراد ${_repoName} ✓`, desc: 'المستودع جاهز للاستخدام' })
                          }}
                        />
                      )}
                      {msg.richType === 'repo-selected' && msg.selectedRepo && (
                        <RepoActionPanel
                          repo={msg.selectedRepo}
                          onAction={handleRepoAction}
                        />
                      )}
                      {msg.richType === 'files' && msg.files && (
                        <FilesList
                          files={msg.files}
                          repo={currentRepo}
                          currentPath={currentPath}
                          onSelectFile={(f) => fetchFileContent(currentRepo, f.path)}
                          onSelectDir={(d) => fetchFiles(currentRepo, d.path)}
                        />
                      )}
                      {msg.richType === 'file-content' && msg.fileContent && (
                        <FileContentView
                          path={msg.fileContent.path}
                          content={msg.fileContent.content}
                          repo={msg.fileContent.repo}
                          onAnalyze={() => analyzeCode(msg.fileContent!.repo, msg.fileContent!.path, msg.fileContent!.content)}
                          onEdit={() => prepareEdit(msg.fileContent!)}
                        />
                      )}
                      {msg.richType === 'code-analysis' && msg.codeAnalysis && (
                        <CodeAnalysisPanel
                          data={msg.codeAnalysis.data}
                          filePath={msg.codeAnalysis.filePath}
                          fileContent={msg.codeAnalysis.fileContent}
                          repo={msg.codeAnalysis.repo}
                          onAction={(action, issue) => executeCodeAction(
                            action,
                            msg.codeAnalysis!.filePath,
                            msg.codeAnalysis!.fileContent,
                            msg.codeAnalysis!.repo,
                            issue
                          )}
                        />
                      )}
                      {msg.richType === 'branches' && msg.branches && msg.selectedRepo && (
                        <BranchesPanel branches={msg.branches} repo={msg.selectedRepo.full_name} />
                      )}
                      {msg.richType === 'issues' && msg.issues && msg.selectedRepo && (
                        <IssuesPanel issues={msg.issues} repo={msg.selectedRepo.full_name} />
                      )}
                      {msg.richType === 'pulls' && msg.pulls && msg.selectedRepo && (
                        <PullsPanel pulls={msg.pulls} repo={msg.selectedRepo.full_name} />
                      )}
                      {msg.richType === 'stats' && msg.stats && (
                        <StatsPanel stats={msg.stats} />
                      )}
                      {msg.richType === 'doctor-results' && msg.doctorMeta && (
                        <>
                          <DoctorResultsPanel
                            doctors={msg.doctors || []}
                            dirs={msg.dirs || []}
                            meta={msg.doctorMeta}
                          />
                          {msg.dua && (
                            <div style={{ marginTop: '12px', padding: '10px 14px', background: 'linear-gradient(135deg,#e8f5e9,#f1f8e9)', borderRadius: '10px', borderRight: '3px solid #66bb6a', textAlign: 'right', direction: 'rtl', color: '#2e7d32', fontSize: '0.92rem', lineHeight: '1.7', whiteSpace: 'pre-line' }}>
                              {msg.dua}
                            </div>
                          )}
                        </>
                      )}
                      {msg.richType === 'map' && (msg.mapHtml || msg.mapMeta) && (
                        (msg.mapMeta as Record<string, unknown>)?.needsGps
                          ? <GpsNearbyCard meta={msg.mapMeta as Record<string, unknown>} />
                          : <MapPreview mapHtml={msg.mapHtml || ''} mapMeta={msg.mapMeta} />
                      )}
                      {msg.richType === 'map' && msg.mapMeta &&
                        !(msg.mapMeta as Record<string, unknown>)?.needsGps &&
                        (msg.mapMeta as Record<string, unknown>)?.type !== 'route' &&
                        !!(msg.mapMeta as Record<string, unknown>)?.locationName && (
                          <MapPoiSuggestionsBar
                            city={String((msg.mapMeta as Record<string, unknown>).locationName)}
                            currentPoi={String((msg.mapMeta as Record<string, unknown>).poiKey || '')}
                            onSend={sendMessage}
                          />
                        )
                      }
                      {msg.richType === 'execution' && msg.executionCode && (
                        <CodeExecutionPreview
                          code={msg.executionCode}
                          lang={msg.executionLang || 'javascript'}
                        />
                      )}
                      {msg.richType === 'website' && msg.htmlCode && (
                        <>
                          <WebsitePreview
                            htmlCode={msg.htmlCode}
                            cssCode={msg.cssCode}
                            jsCode={msg.jsCode}
                            onInsertPrompt={p => setInput(p)}
                            webBuilderMeta={msg.webBuilderMeta}
                            webReaderIntent={msg.webReaderIntent}
                          />
                          {msg.zipDownloadUrl && (
                            <a
                              href={msg.zipDownloadUrl}
                              download
                              className="dz-clone-zip-btn"
                              title="تحميل ZIP بالأصول الحقيقية (CSS/JS/صور)"
                            >
                              <Download size={13} />
                              تحميل ZIP — أصول حقيقية
                              <span className="dz-clone-zip-badge">V2</span>
                            </a>
                          )}
                        </>
                      )}
                      {msg.androidBuildMeta && (
                        <div className="dz-android-card">
                          <div className="dz-android-card__header">
                            <span className="dz-android-card__icon">🤖</span>
                            <div>
                              <div className="dz-android-card__title">
                                {msg.androidBuildMeta.status === 'building' ? '⏳ جاري بناء تطبيق أندرويد...' : msg.androidBuildMeta.status === 'error' ? '❌ فشل البناء' : `📱 ${msg.androidBuildMeta.appName}`}
                              </div>
                              {msg.androidBuildMeta.packageName && (
                                <div className="dz-android-card__pkg">{msg.androidBuildMeta.packageName}</div>
                              )}
                            </div>
                            {msg.androidBuildMeta.status === 'building' && (
                              <div className="dz-android-card__spinner" />
                            )}
                          </div>
                          {msg.androidBuildMeta.status === 'done' && msg.androidBuildMeta.repoUrl && (
                            <div className="dz-android-card__body">
                              <div className="dz-android-card__info">
                                <span>📁 {msg.androidBuildMeta.filesCount} ملف مرفوع</span>
                                <span>⚙️ GitHub Actions يبني APK الآن</span>
                              </div>
                              <div className="dz-android-card__actions">
                                <a href={msg.androidBuildMeta.releasesUrl} target="_blank" rel="noopener noreferrer" className="dz-android-btn dz-android-btn--primary">
                                  ⬇️ تحميل APK
                                </a>
                                <a href={msg.androidBuildMeta.actionsUrl} target="_blank" rel="noopener noreferrer" className="dz-android-btn dz-android-btn--secondary">
                                  ⚙️ متابعة البناء
                                </a>
                                <a href={msg.androidBuildMeta.repoUrl} target="_blank" rel="noopener noreferrer" className="dz-android-btn dz-android-btn--ghost">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                                  GitHub
                                </a>
                              </div>
                              <div className="dz-android-card__note">
                                ⚠️ سيستغرق البناء 5-10 دقائق — انقر "تحميل APK" بعد انتهاء Actions
                              </div>
                            </div>
                          )}
                          {msg.androidBuildMeta.status === 'error' && msg.androidBuildMeta.error && (
                            <div className="dz-android-card__error">{msg.androidBuildMeta.error}</div>
                          )}
                        </div>
                      )}
                      {msg.richType === 'web-reader' && msg.webReaderSiteInfo && (
                        <WebReaderPanel
                          siteInfo={msg.webReaderSiteInfo}
                          onAnalyze={() => sendMessage(`حلل هذا الموقع وأعطني تحليلاً شاملاً للمحتوى والأقسام والهدف والجمهور المستهدف: ${msg.webReaderSiteInfo!.url}`)}
                          onExtract={() => sendMessage(`استخرج كل محتوى هذا الموقع وقدمه بشكل منظم ومنسق: العناوين الرئيسية، الفقرات المهمة، والروابط الأساسية — اجعله قابلاً للنسخ والاستخدام: ${msg.webReaderSiteInfo!.url}`)}
                          onAdvancedClone={(section) => handleAdvancedClone(msg.webReaderSiteInfo!.url, section)}
                          onOpenInBuilder={() => { window.location.href = `/web-builder?clone=${encodeURIComponent(msg.webReaderSiteInfo!.url)}` }}
                          isAdvancedLoading={isAdvancedCloneLoading}
                        />
                      )}
                      {msg.richType === 'youtube' && (msg.youtubeVideo || msg.youtubeResults) && (
                        <YouTubePanel
                          video={msg.youtubeVideo}
                          results={msg.youtubeResults}
                          flow={msg.youtubeFlow}
                          analysis={msg.youtubeAnalysis}
                          suggestions={msg.youtubeSuggestions}
                          captionNote={msg.captionNote}
                          captionText={msg.captionText}
                          onAsk={(q) => sendMessage(q)}
                          onDiscuss={(ytResult) => {
                            const videoData: YouTubeVideoData = {
                              id: ytResult.id,
                              url: ytResult.url,
                              title: ytResult.title,
                              channel: ytResult.channel,
                              duration: ytResult.duration,
                              views: ytResult.views,
                              thumbnail: ytResult.thumbnail,
                            }
                            // Update ref BEFORE sendMessage so the request carries youtubeContext
                            // (setState is async — ref ensures sendMessage reads the latest value)
                            activeYouTubeVideoRef.current = videoData
                            setActiveYouTubeVideo(videoData)
                            sendMessage(`ناقش معي موضوع هذا الفيديو: "${ytResult.title}"`)
                          }}
                        />
                      )}
                      {msg.richType === 'imageGrid' && msg.imageGrid && msg.imageGrid.length > 0 && (
                        <div className="dz-image-grid">
                          {msg.imageGrid.map((url, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="dz-image-grid__item"
                              title={msg.imageGridFull?.[idx]?.title || `${msg.imagePrompt} — صورة ${idx + 1}`}
                              onClick={() => setLightbox({
                                images: msg.imageGridFull || msg.imageGrid!.map(u => ({ url: u, title: msg.imagePrompt || 'صورة', fullUrl: u })),
                                idx,
                                prompt: msg.imagePrompt,
                              })}
                            >
                              <img
                                src={url}
                                alt={msg.imageGridFull?.[idx]?.title || `${msg.imagePrompt || 'صورة'} ${idx + 1}`}
                                className="dz-image-grid__img"
                                loading="lazy"
                                onError={(e) => { (e.target as HTMLImageElement).closest('.dz-image-grid__item')?.remove() }}
                              />
                              <div className="dz-image-grid__overlay">
                                <span>🔍 معاينة</span>
                              </div>
                            </button>
                          ))}
                          <div className="dz-image-grid__footer">
                            <span>
                              {msg.imageGridFull
                                ? [...new Set(msg.imageGridFull.map(i => i.source).filter(Boolean))].join(' · ') || '🌐 بحث الويب'
                                : '🌐 بحث الويب'
                              } · {msg.imageGrid.length} صورة
                            </span>
                            <button
                              className="dz-image-grid__gen-btn"
                              onClick={() => sendMessage(`ارسم ${msg.imagePrompt}`)}
                              title="توليد بالذكاء الاصطناعي"
                            >
                              🎨 توليد AI
                            </button>
                          </div>
                        </div>
                      )}

                      {msg.richType === 'image' && msg.imageUrl && (
                        <div className="dz-image-card">
                          {imgRegenLoading === msg.id && (
                            <div className="dz-image-card__regen-overlay">
                              <div className="dz-image-card__regen-spinner" />
                              <span>جارٍ التوليد…</span>
                            </div>
                          )}
                          <img
                            src={msg.imageUrl}
                            alt={msg.imagePrompt || 'صورة مولّدة'}
                            className={`dz-image-card__img${imgRegenLoading === msg.id ? ' dz-image-card__img--loading' : ''}`}
                            loading="lazy"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement
                              img.style.display = 'none'
                              const errDiv = document.createElement('div')
                              errDiv.style.cssText = 'padding:20px;text-align:center;color:#f87171;background:rgba(239,68,68,0.1);border-radius:12px;font-size:14px;margin:8px 0;'
                              errDiv.innerHTML = '⚠️ تعذّر تحميل الصورة — اضغط <b>🔄 نسخة جديدة</b> للمحاولة مجدداً'
                              img.parentNode?.insertBefore(errDiv, img)
                            }}
                          />
                          {/* Feature 2: Style picker */}
                          <div className="dz-image-style-picker">
                            {IMAGE_STYLES.map(s => (
                              <button
                                key={s.model}
                                className={`dz-image-style-btn${msg.imageStyle === s.model ? ' dz-image-style-btn--active' : ''}`}
                                onClick={() => msg.imagePrompt && regenerateImageWithStyle(msg.id, msg.imagePrompt, s.model)}
                                disabled={!!imgRegenLoading}
                                title={s.label}
                              >
                                {s.emoji} {s.label}
                              </button>
                            ))}
                          </div>
                          <div className="dz-image-card__footer">
                            <span className="dz-image-card__model">✨ {msg.imageModel || 'FLUX'}</span>
                            <div className="dz-image-card__actions">
                              <a
                                href={msg.imageUrl}
                                download={`dz-image-${Date.now()}.jpg`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="dz-image-card__btn"
                                title="تحميل الصورة"
                              >
                                ⬇ تحميل
                              </a>
                              <button
                                className="dz-image-card__btn"
                                onClick={() => sendMessage(`ارسم ${msg.imagePrompt}`)}
                                title="توليد نسخة جديدة"
                              >
                                🔄 نسخة جديدة
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      {msg.richType === 'image' && msg.videoUrl && (
                        <div className="dz-video-card">
                          <video
                            src={msg.videoUrl}
                            className="dz-video-card__video"
                            controls
                            autoPlay
                            loop
                            playsInline
                          />
                          <div className="dz-video-card__footer">
                            <span className="dz-video-card__model">🎬 {msg.videoModel || 'AI Video'}</span>
                            <div className="dz-video-card__actions">
                              <a href={msg.videoUrl} download={`dz-video-${Date.now()}.mp4`} target="_blank" rel="noopener noreferrer" className="dz-image-card__btn">⬇ تحميل</a>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── Match Card with country flags ─────────────────── */}
                      {msg.matchVsMeta && (() => {
                        const mv = msg.matchVsMeta!
                        const isWC = (mv.competition || '').includes('كأس العالم')
                        const isLive = mv.temporal === 'LIVE'
                        const isPast = mv.temporal === 'PAST'
                        const isUpcoming = mv.temporal === 'UPCOMING' || (!isLive && !isPast)
                        const accentColor = isLive ? '#ef4444' : isWC ? '#f59e0b' : '#6366f1'
                        const accentGlow = isLive ? 'rgba(239,68,68,0.35)' : isWC ? 'rgba(245,158,11,0.25)' : 'rgba(99,102,241,0.25)'
                        const badgeBg = isLive ? 'rgba(239,68,68,0.9)' : isPast ? 'rgba(107,114,128,0.9)' : isWC ? 'rgba(245,158,11,0.9)' : 'rgba(16,185,129,0.9)'
                        return (
                          <div style={{
                            background: 'linear-gradient(160deg, #0a0f1e 0%, #0f1f35 50%, #0a0f1e 100%)',
                            border: `1px solid ${accentColor}55`,
                            borderRadius: '20px',
                            padding: '0',
                            margin: '12px 0',
                            textAlign: 'center',
                            direction: 'ltr',
                            boxShadow: `0 0 0 1px ${accentColor}22, 0 8px 32px rgba(0,0,0,0.6), 0 0 60px ${accentGlow}`,
                            position: 'relative',
                            overflow: 'hidden',
                          }}>
                            {/* Top banner */}
                            <div style={{
                              background: `linear-gradient(90deg, ${accentColor}22, ${accentColor}44, ${accentColor}22)`,
                              borderBottom: `1px solid ${accentColor}33`,
                              padding: '8px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              direction: 'rtl',
                            }}>
                              <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 600 }}>
                                {mv.competition || '⚽ مباراة دولية'}
                              </span>
                              <span style={{
                                fontSize: '11px', fontWeight: 800, padding: '2px 10px',
                                borderRadius: '20px', background: badgeBg, color: '#fff',
                                letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px',
                              }}>
                                {isLive ? '🔴 مباشر' : isPast ? '⏪ انتهت' : '📅 قادمة'}
                              </span>
                            </div>

                            {/* Teams row */}
                            <div style={{ padding: '20px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                              {/* Team 1 */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: 1 }}>
                                <span style={{ fontSize: '72px', lineHeight: 1, filter: `drop-shadow(0 4px 12px ${accentColor}44)` }}>
                                  {getTeamFlag(mv.team1)}
                                </span>
                                <span style={{ color: '#f1f5f9', fontWeight: 800, fontSize: '14px', direction: 'rtl', textAlign: 'center', lineHeight: '1.2', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                                  {mv.team1}
                                </span>
                              </div>

                              {/* VS / Score divider */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '70px' }}>
                                {(mv.homeScore !== null && mv.homeScore !== undefined && mv.awayScore !== null && mv.awayScore !== undefined) ? (
                                  <>
                                    <span style={{
                                      fontSize: '32px', fontWeight: 900, color: '#fff',
                                      letterSpacing: '2px', textShadow: `0 0 24px ${accentColor}, 0 2px 8px rgba(0,0,0,0.8)`,
                                      background: `linear-gradient(135deg, ${accentColor}33, ${accentColor}55)`,
                                      border: `1px solid ${accentColor}66`,
                                      borderRadius: '12px',
                                      padding: '4px 12px',
                                      lineHeight: 1.2,
                                    }}>{mv.homeScore} — {mv.awayScore}</span>
                                    <span style={{ fontSize: '10px', color: accentColor, fontWeight: 700, letterSpacing: '1px', marginTop: '2px' }}>
                                      {isPast ? '⏪ النهائية' : isLive ? '🔴 مباشر' : ''}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span style={{
                                      fontSize: '26px', fontWeight: 900, color: accentColor,
                                      letterSpacing: '3px', textShadow: `0 0 20px ${accentColor}`,
                                    }}>VS</span>
                                    <span style={{ width: '50px', height: '2px', background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`, borderRadius: '2px', display: 'block' }} />
                                  </>
                                )}
                              </div>

                              {/* Team 2 */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: 1 }}>
                                <span style={{ fontSize: '72px', lineHeight: 1, filter: `drop-shadow(0 4px 12px ${accentColor}44)` }}>
                                  {getTeamFlag(mv.team2)}
                                </span>
                                <span style={{ color: '#f1f5f9', fontWeight: 800, fontSize: '14px', direction: 'rtl', textAlign: 'center', lineHeight: '1.2', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                                  {mv.team2}
                                </span>
                              </div>
                            </div>

                            {/* Date / Time row */}
                            {(mv.date || mv.time || mv.city) && (
                              <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap', direction: 'rtl' }}>
                                {mv.date && (
                                  <span style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    📅 {mv.date}
                                  </span>
                                )}
                                {mv.time && (
                                  <span style={{ fontSize: '12px', color: accentColor, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    ⏰ {mv.time}
                                  </span>
                                )}
                                {mv.city && (
                                  <span style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    🏟️ {mv.city}
                                  </span>
                                )}
                                {mv.round && (
                                  <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    🎯 {mv.round}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Footer */}
                            <div style={{ padding: '8px 16px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', direction: 'rtl' }}>
                              {mv.kooraLink ? (
                                <a href={mv.kooraLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: accentColor, textDecoration: 'none', fontWeight: 600 }}>
                                  🔗 تفاصيل على Kooora
                                </a>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#475569' }}>⚽ DZ Agent · {isWC ? 'كأس العالم 2026' : 'تحليل رياضي'}</span>
                              )}
                            </div>
                          </div>
                        )
                      })()}

                      {/* ── WC 2026 Group Table ─────────────────────────────── */}
                      {msg.wcGroupData && (() => {
                        const gd = msg.wcGroupData!
                        const today = new Date().toISOString().slice(0, 10)
                        const isAlgeria = gd.groupLetter === 'J'
                        return (
                          <div style={{
                            margin: '10px 0',
                            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                            border: '1px solid rgba(245,158,11,0.35)',
                            borderRadius: '14px',
                            overflow: 'hidden',
                            fontFamily: "'Segoe UI', system-ui, sans-serif",
                            direction: 'rtl',
                          }}>
                            {/* Header */}
                            <div style={{
                              background: 'linear-gradient(90deg, #92400e 0%, #b45309 40%, #d97706 100%)',
                              padding: '10px 14px',
                              display: 'flex', alignItems: 'center', gap: '8px',
                            }}>
                              <span style={{ fontSize: '22px' }}>🏆</span>
                              <div>
                                <div style={{ color: '#fef3c7', fontWeight: 700, fontSize: '14px', lineHeight: 1.2 }}>
                                  كأس العالم FIFA 2026
                                </div>
                                <div style={{ color: '#fcd34d', fontWeight: 800, fontSize: '16px' }}>
                                  {gd.groupLabel} — {gd.groupLabelEn}
                                </div>
                              </div>
                              {isAlgeria && (
                                <div style={{ marginRight: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '4px 10px', fontSize: '12px', color: '#6ee7b7', fontWeight: 600 }}>
                                  🇩🇿 الجزائر مشاركة ✅
                                </div>
                              )}
                            </div>

                            {/* Teams grid */}
                            <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
                              {gd.teams.map((team, ti) => {
                                const isAlg = team.name === 'الجزائر'
                                return (
                                  <div key={ti} style={{
                                    background: isAlg
                                      ? 'linear-gradient(135deg, rgba(6,78,59,0.7) 0%, rgba(6,95,70,0.4) 100%)'
                                      : 'rgba(255,255,255,0.05)',
                                    border: isAlg ? '1px solid rgba(16,185,129,0.6)' : '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '10px',
                                    padding: '10px 6px',
                                    textAlign: 'center',
                                  }}>
                                    <div style={{ fontSize: '36px', lineHeight: 1, marginBottom: '6px' }}>{team.flag}</div>
                                    <div style={{
                                      color: isAlg ? '#6ee7b7' : '#e2e8f0',
                                      fontWeight: isAlg ? 700 : 500,
                                      fontSize: '12px', lineHeight: 1.3,
                                    }}>{team.name}</div>
                                    {team.fifa_rank && (
                                      <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '3px' }}>
                                        FIFA #{team.fifa_rank}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>

                            {/* Fixtures */}
                            {gd.fixtures && gd.fixtures.length > 0 && (
                              <div style={{ padding: '0 12px 12px' }}>
                                <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 600, marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                  📅 مباريات المجموعة
                                </div>
                                {gd.fixtures.map((fix, fi) => {
                                  const isLive = fix.statusType === 'live'
                                  const isDone = fix.statusType === 'finished' || (fix.homeScore !== null && fix.awayScore !== null)
                                  const isPast = fix.date < today && !isLive
                                  const hasAlg = fix.homeTeam === 'الجزائر' || fix.awayTeam === 'الجزائر'
                                  const score = isDone
                                    ? `${fix.homeScore} - ${fix.awayScore}`
                                    : fix.startTime || '—'
                                  const statusBadge = isLive
                                    ? { text: '🔴 مباشر', color: '#ef4444' }
                                    : isDone
                                    ? { text: '✅ انتهت', color: '#10b981' }
                                    : { text: '🕐 قادمة', color: '#6366f1' }

                                  return (
                                    <div key={fi} style={{
                                      display: 'flex', alignItems: 'center', gap: '8px',
                                      padding: '7px 10px', marginBottom: '4px',
                                      background: hasAlg
                                        ? 'rgba(6,78,59,0.3)'
                                        : 'rgba(255,255,255,0.03)',
                                      border: hasAlg
                                        ? '1px solid rgba(16,185,129,0.3)'
                                        : '1px solid rgba(255,255,255,0.06)',
                                      borderRadius: '8px',
                                    }}>
                                      <span style={{ color: '#64748b', fontSize: '10px', minWidth: '60px', textAlign: 'center' }}>
                                        {fix.date?.slice(5) || ''}
                                      </span>
                                      <span style={{ flex: 1, color: '#e2e8f0', fontSize: '12px', textAlign: 'center', fontWeight: hasAlg ? 700 : 400 }}>
                                        {fix.homeTeam} <span style={{ color: isDone ? '#f59e0b' : '#475569', fontWeight: 800, margin: '0 4px' }}>{score}</span> {fix.awayTeam}
                                      </span>
                                      <span style={{ color: statusBadge.color, fontSize: '10px', minWidth: '52px', textAlign: 'left' }}>
                                        {statusBadge.text}
                                      </span>
                                      {fix.city && (
                                        <span style={{ color: '#475569', fontSize: '10px' }}>📍{fix.city}</span>
                                      )}
                                      {fix.kooraLink && (
                                        <a href={fix.kooraLink} target="_blank" rel="noopener noreferrer" style={{ color: '#f59e0b', fontSize: '10px', textDecoration: 'none' }}>🔗</a>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Footer */}
                            <div style={{ padding: '6px 14px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ color: '#475569', fontSize: '10px' }}>📡 {gd.source}</span>
                              <span style={{ color: '#475569', fontSize: '10px' }}>🌍 USA · Canada · Mexico — جوان/جويلية 2026</span>
                            </div>
                          </div>
                        )
                      })()}

                      {msg.richType === 'qr' && msg.qrData && (
                        <div className="dz-qr-card">
                          <div className="dz-qr-card__header">
                            <span className="dz-qr-card__icon">📋</span>
                            <span className="dz-qr-card__label">QR Code</span>
                          </div>
                          <div className="dz-qr-card__body">
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(msg.qrData)}&size=260x260&format=png&margin=10`}
                              alt="QR Code"
                              className="dz-qr-card__img"
                              onError={(e) => { (e.target as HTMLImageElement).src = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(msg.qrData!)}&size=200x200` }}
                            />
                          </div>
                          <div className="dz-qr-card__data">{msg.qrTitle}</div>
                          <div className="dz-qr-card__actions">
                            <a
                              href={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(msg.qrData)}&size=500x500&format=png`}
                              download="qr-code.png"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="dz-qr-card__btn"
                            >⬇ تحميل PNG</a>
                            <button
                              className="dz-qr-card__btn"
                              onClick={() => navigator.clipboard?.writeText(msg.qrData!)}
                            >📋 نسخ النص</button>
                          </div>
                        </div>
                      )}

                      {msg.richType === 'books' && Array.isArray(msg.books) && msg.books.length > 0 && (
                        <div className="dz-books-card">
                          <div className="dz-books-card__header">
                            <span>📚</span>
                            <span>{msg.books.length} كتاب</span>
                            {msg.booksTotal && msg.booksTotal > msg.books.length && (
                              <span className="dz-books-card__total">من {msg.booksTotal.toLocaleString()} نتيجة</span>
                            )}
                          </div>
                          <div className="dz-books-card__grid">
                            {msg.books.map((book, i) => (
                              <a
                                key={book.key || i}
                                href={book.url || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="dz-book-item"
                              >
                                <div className="dz-book-item__cover">
                                  {book.cover
                                    ? <img src={book.cover} alt={book.title} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; ((e.target as HTMLImageElement).nextSibling as HTMLElement).style.display='flex' }} />
                                    : null}
                                  <div className="dz-book-item__cover-placeholder" style={{ display: book.cover ? 'none' : 'flex' }}>📖</div>
                                </div>
                                <div className="dz-book-item__info">
                                  <span className="dz-book-item__title">{book.title}</span>
                                  {book.authors.length > 0 && (
                                    <span className="dz-book-item__author">{book.authors[0]}</span>
                                  )}
                                  <div className="dz-book-item__meta">
                                    {book.year && <span>📅 {book.year}</span>}
                                    {book.pages && <span>📄 {book.pages} ص</span>}
                                  </div>
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {msg.richType === 'presentation' && Array.isArray(msg.slides) && msg.slides.length > 0 && (
                        <PresentationViewer
                          title={msg.presentationTitle || ''}
                          subtitle={msg.presentationSubtitle}
                          color={msg.presentationColor || '#7c6eff'}
                          slides={msg.slides}
                        />
                      )}

                      {msg.richType === 'tool-redirect' && msg.toolRedirect && (
                        msg.toolRedirect.id === 'radio' ? (
                          /* ── بطاقة الراديو المخصصة ── */
                          <div className="dz-radio-card">
                            <div className="dz-radio-card__waves">
                              <span /><span /><span /><span /><span />
                            </div>
                            <div className="dz-radio-card__top">
                              <span className="dz-radio-card__emoji">📻</span>
                              <div className="dz-radio-card__titles">
                                <div className="dz-radio-card__name">DZ Radio</div>
                                <div className="dz-radio-card__sub">بث مباشر · 200+ محطة جزائرية</div>
                              </div>
                              <span className="dz-radio-card__live-dot"><span />مباشر</span>
                            </div>
                            {msg.toolRedirect.stations && msg.toolRedirect.stations.length > 0 && (
                              <div className="dz-radio-card__stations">
                                {msg.toolRedirect.stations.map((s, i) => (
                                  <span key={i} className="dz-radio-card__station-chip">
                                    {s.icon} {s.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            <button
                              className="dz-radio-card__btn"
                              onClick={(e) => { e.stopPropagation(); window.location.href = msg.toolRedirect!.toolUrl }}
                            >
                              <span className="dz-radio-card__btn-icon">▶</span>
                              استمع الآن
                            </button>
                          </div>
                        ) : (
                          /* ── البطاقة العامة للأدوات الأخرى ── */
                          <div className="dz-tool-redirect-card">
                            <div className="dz-tool-redirect-card__icon">{msg.toolRedirect.toolIcon}</div>
                            <div className="dz-tool-redirect-card__body">
                              <div className="dz-tool-redirect-card__name">{msg.toolRedirect.toolName}</div>
                              <div className="dz-tool-redirect-card__desc">{msg.toolRedirect.toolDesc}</div>
                            </div>
                            <button
                              className="dz-tool-redirect-card__btn"
                              onClick={(e) => { e.stopPropagation(); window.location.href = msg.toolRedirect!.toolUrl }}
                            >
                              فتح الأداة ←
                            </button>
                          </div>
                        )
                      )}

                      {msg.richType === 'github-profile' && msg.githubProfile && (
                        <div style={{
                          background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
                          border: '1px solid #30363d',
                          borderRadius: '12px',
                          padding: '20px',
                          marginTop: '12px',
                          display: 'flex',
                          gap: '16px',
                          alignItems: 'flex-start',
                          maxWidth: '480px',
                          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                        }}>
                          <img
                            src={msg.githubProfile.avatar}
                            alt={msg.githubProfile.login}
                            style={{ width: 80, height: 80, borderRadius: '50%', border: '2px solid #30363d', flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ color: '#e6edf3', fontWeight: 700, fontSize: '1.05rem' }}>{msg.githubProfile.name}</span>
                              <span style={{ color: '#8b949e', fontSize: '0.85rem' }}>@{msg.githubProfile.login}</span>
                            </div>
                            {msg.githubProfile.bio && (
                              <p style={{ color: '#8b949e', fontSize: '0.85rem', margin: '4px 0 8px', lineHeight: 1.4 }}>{msg.githubProfile.bio}</p>
                            )}
                            <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
                              {[
                                { label: 'مستودع', value: msg.githubProfile.repos, icon: '📦' },
                                { label: 'متابع', value: msg.githubProfile.followers, icon: '👥' },
                                { label: 'متابَع', value: msg.githubProfile.following, icon: '👤' },
                              ].map(s => (
                                <div key={s.label} style={{ textAlign: 'center' }}>
                                  <div style={{ color: '#e6edf3', fontWeight: 700, fontSize: '1rem' }}>{s.value ?? '—'}</div>
                                  <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>{s.icon} {s.label}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                              {msg.githubProfile.company && (
                                <span style={{ background: '#21262d', color: '#8b949e', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem' }}>🏢 {msg.githubProfile.company}</span>
                              )}
                              {msg.githubProfile.location && (
                                <span style={{ background: '#21262d', color: '#8b949e', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem' }}>📍 {msg.githubProfile.location}</span>
                              )}
                              {msg.githubProfile.joinYear && (
                                <span style={{ background: '#21262d', color: '#8b949e', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem' }}>🗓️ منذ {msg.githubProfile.joinYear}</span>
                              )}
                            </div>
                            <a
                              href={msg.githubProfile.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#238636', color: '#fff', borderRadius: 8, padding: '6px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                              افتح البروفايل
                            </a>
                          </div>
                        </div>
                      )}
                      {msg.richType === 'github-react' && msg.reactSteps && msg.reactSteps.length > 0 && (
                        <GitHubReActPanel steps={msg.reactSteps} isLive={false} />
                      )}
                      {msg.richType === 'github-agent' && msg.ghAgentRepo && (
                        <GitHubAgentResultPanel
                          repo={msg.ghAgentRepo}
                          analysis={msg.ghAgentAnalysis}
                          plan={msg.ghAgentPlan}
                          gitOutput={msg.ghAgentGitOutput}
                          files={msg.ghAgentFiles}
                          executionReport={msg.ghAgentExecutionReport}
                          autoExecute={msg.ghAgentAutoExecute}
                          onExecute={async () => {
                            if (!msg.ghAgentFileContents?.length) return
                            try {
                              const execRes = await fetch('/api/dz-github-agent/chat', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  message: '(auto-execute)',
                                  repoUrl: msg.ghAgentRepo,
                                  githubToken: githubToken || undefined,
                                  autoExecute: true,
                                }),
                              })
                              const execData = await execRes.json() as Record<string, unknown>
                              setMessages(prev => prev.map(m =>
                                m.id === msg.id
                                  ? { ...m, ghAgentExecutionReport: execData.executionReport as GHAgentExecutionReport, ghAgentAutoExecute: true }
                                  : m
                              ))
                            } catch {}
                          }}
                        />
                      )}
                      {msg.richType === 'task-plan' && (
                        msg.taskPlan ? (
                          <TaskPlanPanel
                            plan={msg.taskPlan}
                            query={msg.taskPlanQuery || ''}
                            onApprove={() => {
                              const ref = planApprovalRef.current
                              if (ref && ref.msgId === msg.id) {
                                planApprovalRef.current = null
                                // Remove the plan card from messages
                                setMessages(prev => prev.filter(m => m.id !== msg.id))
                                ref.resolve(true)
                              }
                            }}
                            onCancel={() => {
                              const ref = planApprovalRef.current
                              if (ref && ref.msgId === msg.id) {
                                planApprovalRef.current = null
                                setMessages(prev => prev.filter(m => m.id !== msg.id))
                                ref.resolve(false)
                              }
                            }}
                          />
                        ) : (
                          <div className="tpp-generating">
                            <div className="tpp-gen-spinner" />
                            <span>جاري تحليل المهمة وبناء الخطة...</span>
                          </div>
                        )
                      )}
                      {msg.richType === 'approval' && msg.pendingAction && (
                        <ApprovalDialog
                          action={msg.pendingAction}
                          onApprove={() => executeApprovedAction(msg.pendingAction!, msg.id)}
                          onCancel={() => {
                            setMessages(prev => prev.map(m =>
                              m.id === msg.id ? { ...m, pendingAction: undefined, content: 'تم إلغاء الإجراء من قِبل المستخدم.' } : m
                            ))
                            addToLog({ type: msg.pendingAction!.type, description: 'تم الإلغاء', status: 'error', repo: msg.pendingAction!.repo })
                          }}
                        />
                      )}
                      {msg.newsItems && msg.newsItems.length > 0 && (() => {
                        const _getDomain = (url: string): string => {
                          try { return new URL(url).hostname.replace('www.', '') } catch { return '' }
                        }
                        const _getLabel = (item: { url: string; source?: string; title?: string }): string => {
                          if (item.source) return item.source
                          const d = _getDomain(item.url)
                          if (!d) return item.title?.slice(0, 25) || 'مصدر'
                          return d.split('.')[0]
                        }
                        const _getFaviconUrl = (url: string, domain: string): string => {
                          if (!url && !domain) return ''
                          const d = domain || _getDomain(url)
                          return `https://www.google.com/s2/favicons?domain=${d}&sz=16`
                        }
                        const _isSports = (msg as any)._sportsAgent || (msg as any).wc2026
                        const _headerLabel = _isSports ? 'المصادر' : 'نتائج البحث'
                        return (
                          <div className="dzc-sources-bar">
                            <span className="dzc-sources-label">{_headerLabel}</span>
                            <div className="dzc-sources-list">
                              {msg.newsItems!.map((item, i) => {
                                const domain = _getDomain(item.url)
                                const label  = _getLabel(item)
                                const faviconUrl = _getFaviconUrl(item.url, domain)
                                return (
                                  <a
                                    key={i}
                                    href={item.url || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="dzc-source-chip"
                                    title={item.title || label}
                                    aria-label={item.title || label}
                                  >
                                    {faviconUrl && (
                                      <img
                                        src={faviconUrl}
                                        alt=""
                                        className="dzc-source-favicon"
                                        width={14}
                                        height={14}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                        loading="lazy"
                                      />
                                    )}
                                    <span className="dzc-source-name">{label}</span>
                                  </a>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                      {msg.quickSuggestions && msg.quickSuggestions.length > 0 && (
                        <div className="dzc-quick-suggestions">
                          <span className="dzc-qs-label">💡 اقتراحات:</span>
                          <div className="dzc-qs-chips">
                            {msg.quickSuggestions.map((s, i) => (
                              <button
                                key={i}
                                className="dzc-qs-chip"
                                onClick={() => sendMessage(s)}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )
                ) : (
                  msg.content
                )}
              </div>
              {msg.richType === 'find-input' && msg.findRepo && (
                <FindInputCard
                  repo={msg.findRepo}
                  onSearch={pattern => sendMessage(`/find ${pattern}`)}
                />
              )}
              {msg.actionButtons && msg.actionButtons.length > 0 && (
                <div className="dzc-action-btns-row">
                  {msg.actionButtons.map((ab, i) => (
                    <button
                      key={i}
                      className="dzc-action-cmd-btn"
                      onClick={() => sendMessage(ab.cmd)}
                    >
                      {ab.label}
                    </button>
                  ))}
                </div>
              )}
              {msg.role === 'assistant' && !msg.pendingAction && (
                <div className="dz-message-actions">
                  {msg.content && (
                    <button className="dz-action-btn" onClick={() => copyMessage(msg.id, msg.content)}>
                      {copiedId === msg.id ? <Check size={13} /> : <Copy size={13} />}
                      {copiedId === msg.id ? 'تم النسخ' : 'نسخ'}
                    </button>
                  )}
                  {msg.content && msg.richType !== 'image' && (
                    <button
                      className={`dz-action-btn dz-action-btn--speak${ttsState?.id === msg.id ? ' dz-action-btn--speak-active' : ''}`}
                      onClick={() => speakMessage(msg.id, msg.content)}
                      title={ttsState?.id === msg.id && ttsState.status === 'playing' ? 'إيقاف الصوت' : 'استمع بصوت عالٍ'}
                      disabled={ttsState !== null && ttsState.id !== msg.id && ttsState.status === 'loading'}
                    >
                      {ttsState?.id === msg.id && ttsState.status === 'loading' ? (
                        <Loader2 size={13} className="dz-tts-spin" />
                      ) : ttsState?.id === msg.id && ttsState.status === 'playing' ? (
                        <Square size={13} />
                      ) : (
                        <Volume2 size={13} />
                      )}
                      {ttsState?.id === msg.id && ttsState.status === 'loading' ? '...' :
                       ttsState?.id === msg.id && ttsState.status === 'playing' ? 'إيقاف' : 'استمع'}
                    </button>
                  )}
                  {msg.id === messages[messages.length - 1]?.id && msg.richType === 'text' && (
                    <button className="dz-action-btn" onClick={regenerate}>
                      <RotateCcw size={13} />
                      إعادة المحاولة
                    </button>
                  )}
                  <button
                    className={`dz-action-btn dz-action-btn--up${ratings[msg.id] === 'up' ? ' dz-action-btn--rated' : ''}`}
                    title="إجابة جيدة"
                    onClick={() => sendRating(msg.id, 'up', messages.find(m => m.role === 'user' && messages.indexOf(m) < messages.indexOf(msg))?.content || '')}
                  >
                    <ThumbsUp size={13} />
                  </button>
                  <button
                    className={`dz-action-btn dz-action-btn--down${ratings[msg.id] === 'down' ? ' dz-action-btn--rated' : ''}`}
                    title="إجابة سيئة"
                    onClick={() => sendRating(msg.id, 'down', messages.find(m => m.role === 'user' && messages.indexOf(m) < messages.indexOf(msg))?.content || '')}
                  >
                    <ThumbsDown size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="dz-message dz-message--assistant">
            <div className="dz-message-avatar">
              <div className={`dz-avatar dz-avatar--bot dz-avatar--thinking${agentSteps.length > 0 ? ' dz-avatar--autonomous' : ''}`}>
                {isGithubReActLoading ? <GitBranch size={15} /> :
                 agentSteps.length > 0 ? <Brain size={15} /> :
                 thinkingStep?.type === 'read'    ? <BookOpen size={15} /> :
                 thinkingStep?.type === 'analyze' ? <Zap size={15} /> :
                 thinkingStep?.type === 'write'   ? <Pencil size={15} /> :
                 thinkingStep?.type === 'scan'    ? <ShieldAlert size={15} /> :
                 thinkingStep?.type === 'commit'  ? <GitCommit size={15} /> :
                 thinkingStep?.type === 'pr'      ? <GitPullRequest size={15} /> :
                 thinkingStep?.type === 'search'  ? <Search size={15} /> :
                 thinkingStep?.type === 'list'    ? <FolderOpen size={15} /> :
                 <Sparkles size={15} />}
              </div>
            </div>
            <div className="dz-message-body">
              <div className="dz-message-sender">
                DZ Agent
                {agentSteps.length > 0 && (
                  <span className="dz-autonomous-badge">⚡ Autonomous</span>
                )}
                {isGithubReActLoading && (
                  <span className="dz-github-react-badge">
                    {isClaudeMode ? '🤖 Claude Mode' : '⚙️ GitHub ReAct'}
                  </span>
                )}
              </div>
              {isGithubReActLoading ? (
                liveReActSteps.length > 0
                  ? <GitHubReActPanel steps={liveReActSteps} isLive={true} claudeMode={isClaudeMode} />
                  : <GitHubLoadingIndicator />
              ) : agentSteps.length > 0 ? (
                <AgentStepsPanel
                  steps={agentSteps}
                  taskType={agentTaskType || undefined}
                />
              ) : searchStepsQuery ? (
                <>
                  <SearchStepsPanel
                    query={searchStepsQuery}
                    mode={searchStepsMode}
                    onDone={() => setSearchStepsQuery(null)}
                  />
                  <SmartLoadingPhases
                    msg={[...messages].reverse().find(m => m.role === 'user')?.content || ''}
                    step={null}
                  />
                </>
              ) : (
                <SmartLoadingPhases
                  msg={[...messages].reverse().find(m => m.role === 'user')?.content || ''}
                  step={thinkingStep}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Clone Engine V2 Progress Bubble ── */}
        {isAdvancedCloneLoading && cloneProgress && (
          <div className="dz-message dz-message--assistant">
            <div className="dz-message-avatar">
              <div className="dz-avatar dz-avatar--bot dz-avatar--thinking dz-avatar--clone">
                <Brain size={15} />
              </div>
            </div>
            <div className="dz-message-body">
              <div className="dz-message-sender">
                DZ Agent
                <span className="dz-clone-badge-inline">🧬 Clone V2</span>
              </div>
              <CloneProgressPanel progress={cloneProgress} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      )}


      {/* Input */}
      <div className="dz-input-area">

        {/* ===== HYBRID AGENT MODE BAR ===== */}
        {showAgentBar && <AgentModeBar
          state={agentMode}
          onChange={s => {
            setAgentMode(s)
            if (s.githubToken) {
              try { sessionStorage.setItem('dz-agent-gh-token', s.githubToken) } catch {}
            }
          }}
          githubUser={githubUser ? { login: githubUser.login, avatar: githubUser.avatar } : null}
          clientGithubToken={githubToken}
          onClose={() => {
            setShowAgentBar(false)
            setAgentHintGlow(true)
            addToast({
              type: 'info',
              title: 'تقدر ترجع شريط الوكيل Dz Agent',
              desc: 'كليكي على أيقونة الروبوت 🤖 ⬆️',
              duration: 8000,
            })
            setTimeout(() => setAgentHintGlow(false), 8000)
          }}
          onCommandSelect={cmd => {
            if (cmd.startsWith('/find')) {
              setShowFindDialog(true)
              return
            }
            setInput(cmd)
            setTimeout(() => textareaRef.current?.focus(), 50)
          }}
        />}

        {/* ===== PROJECT MEMORY BADGE ===== */}
        {projectMemoryLoaded && (
          <div className="dz-project-memory-badge">
            <Brain size={11} />
            <span>ذاكرة المشروع محمّلة: <strong>{projectMemoryLoaded.split('/')[1] || projectMemoryLoaded}</strong></span>
          </div>
        )}

        {/* ===== RUNNING TASKS PANEL ===== */}
        {agentMode.active && actionLog.length > 0 && (
          <div className="dz-tasks-panel">
            <span className="dz-tasks-label">📋 المهام</span>
            <div className="dz-tasks-list">
              {[...actionLog].reverse().slice(0, 3).map((entry, i) => (
                <div key={i} className={`dz-task-item dz-task-item--${entry.status}`}>
                  <span className="dz-task-dot" />
                  <span className="dz-task-desc">{entry.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== AGENT CONFIRMATION DIALOG ===== */}
        {pendingAgentCmd && (
          <div className={`amb-confirm-wrap${pendingAgentCmd.cmd === '/delete' || pendingAgentCmd.cmd === '/rm' ? ' amb-confirm-wrap--danger' : ''}`}>
            <div className="amb-confirm-title">
              <span>{pendingAgentCmd.cmd === '/delete' || pendingAgentCmd.cmd === '/rm' ? '🗑️' : pendingAgentCmd.cmd === '/edit' ? '✏️' : '⚠️'}</span>
              {pendingAgentCmd.cmd === '/delete' || pendingAgentCmd.cmd === '/rm' ? 'تحذير: حذف دائم' : 'تأكيد الإجراء'}
            </div>
            <div className="amb-confirm-cmd-badge">{pendingAgentCmd.cmd}</div>
            <div className="amb-confirm-detail">
              {pendingAgentCmd.label}
            </div>
            {(pendingAgentCmd.cmd === '/delete' || pendingAgentCmd.cmd === '/rm') && (
              <div className="amb-confirm-danger-note">⚠️ هذا الإجراء لا يمكن التراجع عنه</div>
            )}
            <div className="amb-confirm-btns">
              <button
                className="amb-confirm-yes"
                onClick={() => { pendingAgentCmd.resolve(true); setPendingAgentCmd(null) }}
              >
                ✅ تأكيد
              </button>
              <button
                className="amb-confirm-no"
                onClick={() => { pendingAgentCmd.resolve(false); setPendingAgentCmd(null) }}
              >
                ✕ إلغاء
              </button>
            </div>
          </div>
        )}

        {/* DZ GitHub Agent — repo bar */}
        {showGhAgentInput && (
          <div className="gh-agent-repo-bar">
            <Github size={13} className="gh-agent-repo-bar-icon" />
            <input
              className="gh-agent-repo-input"
              placeholder="owner/repo أو https://github.com/owner/repo"
              value={ghAgentRepo}
              onChange={e => setGhAgentRepo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && input.trim()) sendMessage() }}
            />
            <label className="gh-agent-auto-label">
              <input
                type="checkbox"
                checked={ghAgentAutoExecute}
                onChange={e => setGhAgentAutoExecute(e.target.checked)}
              />
              <span>Auto Execute</span>
            </label>
            <button className="gh-agent-repo-bar-clear" onClick={() => { setGhAgentRepo(''); setShowGhAgentInput(false) }}>✕</button>
          </div>
        )}

        {/* Web Reader bar */}
        {showWebReaderBar && (
          <div className="web-reader-bar">
            <Globe size={13} className="web-reader-bar-icon" />
            <input
              className="web-reader-url-input"
              placeholder="الصق رابط الصفحة لتحليلها... https://example.com"
              value={webReaderUrl}
              autoFocus
              onChange={e => setWebReaderUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && webReaderUrl.trim()) {
                  const url = webReaderUrl.trim()
                  setWebReaderUrl('')
                  setShowWebReaderBar(false)
                  sendMessage(url)
                }
                if (e.key === 'Escape') { setShowWebReaderBar(false); setWebReaderUrl('') }
              }}
            />
            <button
              className="web-reader-send-btn"
              disabled={!webReaderUrl.trim()}
              title="تحليل الصفحة"
              onClick={() => {
                const url = webReaderUrl.trim()
                if (!url) return
                setWebReaderUrl('')
                setShowWebReaderBar(false)
                sendMessage(url)
              }}
            >
              <Send size={12} />
            </button>
            <button className="web-reader-bar-clear" onClick={() => { setShowWebReaderBar(false); setWebReaderUrl('') }}>✕</button>
          </div>
        )}
        {activeYouTubeVideo && (
          <div className="dzc-yt-ctx-bar">
            <span className="dzc-yt-ctx-icon">🎬</span>
            <span className="dzc-yt-ctx-label">
              نقاش حول: <strong>{activeYouTubeVideo.title.slice(0, 50)}{activeYouTubeVideo.title.length > 50 ? '…' : ''}</strong>
            </span>
            <button
              className="dzc-yt-ctx-close"
              title="إنهاء وضع النقاش"
              onClick={() => setActiveYouTubeVideo(null)}
            >✕</button>
          </div>
        )}
        <div className="dz-input-container">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isGithubConnected
              ? (language === 'fr' ? 'Écrivez votre message... (GitHub connecté ✓)' : language === 'en' ? 'Type your message... (GitHub connected ✓)' : 'أكتب رسالتك... (GitHub متصل ✓)')
              : (language === 'fr' ? 'Écrivez votre message à DZ Agent...' : language === 'en' ? 'Type your message to DZ Agent...' : 'أكتب رسالتك لـ DZ Agent...')
            }
            rows={1}
            className="dz-chat-input"
          />
          <div className="dz-input-actions">
            <button
              className={`web-reader-toggle-btn ${showWebReaderBar ? 'active' : ''}`}
              title="قراءة وتحليل صفحة ويب"
              onClick={() => { setShowWebReaderBar(v => !v); setWebReaderUrl('') }}
            >
              <Globe size={15} />
            </button>
            <VoicePanel
              onInterim={(t) => setInput(t)}
              onTranscript={(t) => {
                setInput(t)
                setTimeout(() => sendMessage(t), 50)
              }}
            />
            {isLoading ? (
              <button className="dz-stop-btn" onClick={() => { abortRef.current?.abort(); setIsLoading(false) }}>إيقاف</button>
            ) : (
              <button className="dz-send-btn" onClick={() => sendMessage()} disabled={!input.trim()}>
                <Send size={18} />
              </button>
            )}
          </div>
        </div>
        <p className="dz-disclaimer">قد يُخطئ DZ Agent. راجع دائماً قبل الموافقة على إجراءات GitHub.</p>
      </div>

      {/* ===== FLOATING FIND DIALOG ===== */}
      {showFindDialog && createPortal(
        <FindDialog
          repo={agentMode.selectedRepo}
          onSearch={pattern => {
            setShowFindDialog(false)
            sendMessage(`/find ${pattern}`)
          }}
          onClose={() => setShowFindDialog(false)}
        />,
        document.body
      )}

      <DZToast toasts={toasts} onDismiss={dismissToast} />

      {/* ===== ARTICLE POPUP MODAL ===== */}
      {articlePopupUrl && createPortal(
        <div className="dz-article-popup-overlay" onClick={() => setArticlePopupUrl(null)}>
          <div className="dz-article-popup-container" onClick={e => e.stopPropagation()}>
            <div className="dz-article-popup-header">
              <span className="dz-article-popup-title">📰 قراءة المقال</span>
              <button className="dz-article-popup-close" onClick={() => setArticlePopupUrl(null)}>✕</button>
            </div>
            <div className="dz-article-popup-fallback">
              <p>يتعذر عرض بعض المواقع داخل الإطار — <a href={articlePopupUrl} target="_blank" rel="noopener noreferrer">افتح في تبويب جديد ↗</a></p>
            </div>
            <iframe
              src={articlePopupUrl}
              className="dz-article-popup-iframe"
              title="article-preview"
              sandbox="allow-scripts allow-same-origin allow-popups"
              loading="lazy"
            />
          </div>
        </div>,
        document.body
      )}

      {/* ── Image Lightbox ─────────────────────────────────────────────────── */}
      {lightbox && (() => {
        const img = lightbox.images[lightbox.idx]
        const total = lightbox.images.length
        const hasPrev = total > 1
        const hasNext = total > 1
        const downloadUrl = img.fullUrl || img.url
        const SOURCE_ICON: Record<string, string> = { Pinterest: '📌', 'Wikimedia Commons': '🌐', Openverse: '🔓' }

        return createPortal(
          <div
            className="dz-lightbox__backdrop"
            onClick={e => { if (e.target === e.currentTarget) setLightbox(null) }}
            role="dialog"
            aria-modal="true"
            aria-label="معاينة الصورة"
          >
            <div className="dz-lightbox__box">
              {/* Header */}
              <div className="dz-lightbox__header">
                <span className="dz-lightbox__counter">{lightbox.idx + 1} / {total}</span>
                <span className="dz-lightbox__title" title={img.title}>{img.title}</span>
                <button className="dz-lightbox__close" onClick={() => setLightbox(null)} aria-label="إغلاق">✕</button>
              </div>

              {/* Image area */}
              <div className="dz-lightbox__img-wrap">
                {hasPrev && (
                  <button
                    className="dz-lightbox__nav dz-lightbox__nav--prev"
                    onClick={() => setLightbox(prev => prev ? { ...prev, idx: (prev.idx - 1 + total) % total } : null)}
                    aria-label="السابق"
                  >‹</button>
                )}
                <img
                  key={img.url}
                  src={img.fullUrl || img.url}
                  alt={img.title}
                  className="dz-lightbox__img"
                  onError={e => { (e.target as HTMLImageElement).src = img.url }}
                />
                {hasNext && (
                  <button
                    className="dz-lightbox__nav dz-lightbox__nav--next"
                    onClick={() => setLightbox(prev => prev ? { ...prev, idx: (prev.idx + 1) % total } : null)}
                    aria-label="التالي"
                  >›</button>
                )}
              </div>

              {/* Footer: source info + download */}
              <div className="dz-lightbox__footer">
                <div className="dz-lightbox__meta">
                  {img.source && (
                    <span className="dz-lightbox__source">
                      {SOURCE_ICON[img.source] || '📁'} {img.source}
                    </span>
                  )}
                  {img.creator && <span className="dz-lightbox__creator">📷 {img.creator.slice(0, 50)}</span>}
                </div>
                <div className="dz-lightbox__actions">
                  {img.sourceUrl && (
                    <a
                      href={img.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dz-lightbox__btn dz-lightbox__btn--source"
                    >🔗 المصدر</a>
                  )}
                  <a
                    href={downloadUrl}
                    download={`${(img.title || lightbox.prompt || 'image').slice(0, 40).replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, '_')}.jpg`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dz-lightbox__btn dz-lightbox__btn--download"
                  >⬇️ تحميل</a>
                </div>
              </div>

              {/* Thumbnail strip */}
              {total > 1 && (
                <div className="dz-lightbox__strip">
                  {lightbox.images.map((im, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`dz-lightbox__thumb${i === lightbox.idx ? ' dz-lightbox__thumb--active' : ''}`}
                      onClick={() => setLightbox(prev => prev ? { ...prev, idx: i } : null)}
                    >
                      <img src={im.url} alt={im.title} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      })()}
    </div>
  )
}
