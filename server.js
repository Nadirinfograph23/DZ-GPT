import express from 'express'
import { fileURLToPath } from 'url'
import path from 'path'
import crypto from 'crypto'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { readFile } from 'fs/promises'
import { WebSocketServer } from 'ws'
import {
  createStaticEducationalFallback,
  filterLessons,
  findLessonByTitle,
  lessonsToSearchResults,
  readEddirasaIndex,
  updateEddirasaIndex,
} from './eddirasa_rss_crawler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === 'production'
const PORT = 5000

const app = express()
const distDir = path.resolve(__dirname, 'dist')
const indexHtmlPath = path.resolve(distDir, 'index.html')

// ===== SECURITY HEADERS =====
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: isProd
        ? ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com']
        : ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://www.youtube.com', 'https://s.ytimg.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https://openweathermap.org', 'https://avatars.githubusercontent.com', 'https://i.ytimg.com', 'https://*.ytimg.com'],
      connectSrc: isProd
        ? ["'self'", 'https://api.quran.com', 'https://*.googlevideo.com', 'https://manifest.googlevideo.com', 'https://*.youtube.com']
        : ["'self'", 'ws:', 'wss:', 'https://api.quran.com', 'https://*.googlevideo.com', 'https://manifest.googlevideo.com', 'https://*.youtube.com'],
      mediaSrc: ["'self'", 'https://verses.quran.com', 'https://download.quranicaudio.com', 'https://audio.qurancdn.com', 'https:', 'blob:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      childSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
      frameAncestors: isProd
        ? ["'none'"]
        : ["'self'", 'https://replit.com', 'https://*.replit.com', 'https://*.replit.dev'],
    },
  },
  crossOriginEmbedderPolicy: false,
}))

// ===== CORS =====
const allowedOrigins = isProd
  ? [
      process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '',
      process.env.REPLIT_DOMAINS
        ? process.env.REPLIT_DOMAINS.split(',').map(d => `https://${d.trim()}`).filter(Boolean)
        : [],
      process.env.ALLOWED_ORIGIN || '',
    ].flat().filter(Boolean)
  : true
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
}))

// ===== NO-CACHE IN DEVELOPMENT =====
if (!isProd) {
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/rss')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    }
    next()
  })
}

// ===== BODY SIZE LIMIT =====
app.use(express.json({ limit: '1mb' }))

// ===== RATE LIMITERS =====
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'طلبات كثيرة جداً. يرجى الانتظار دقيقة ثم المحاولة مجدداً.' },
})

const githubLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please wait a minute.' },
})

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait.' },
})

const deployLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Deploy rate limit exceeded. Please wait.' },
})

app.use('/api/chat', aiLimiter)
app.use('/api/dz-agent-chat', aiLimiter)
app.use('/api/dz-agent/github', githubLimiter)
app.use('/api/dz-agent-search', searchLimiter)
app.use('/api/dz-agent/search', searchLimiter)
app.use('/api/dz-agent/education/search', searchLimiter)
app.use('/api/dz-agent/education/index', searchLimiter)
app.use('/api/update-index', searchLimiter)
app.use('/api/lessons', searchLimiter)
app.use('/api/lesson', searchLimiter)
app.use('/api/dz-agent/deploy', deployLimiter)
app.use('/api/dz-agent/doctor-search', searchLimiter)

// ===== INPUT SANITIZER =====
function sanitizeString(str, maxLen = 10000) {
  if (typeof str !== 'string') return ''
  return str.slice(0, maxLen).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

function isValidGithubPath(p) {
  if (typeof p !== 'string') return false
  if (p.includes('..') || p.includes('//') || p.startsWith('/')) return false
  return /^[a-zA-Z0-9._\-/\s]+$/.test(p)
}

function isValidGithubRepo(repo) {
  if (typeof repo !== 'string') return false
  return /^[a-zA-Z0-9._\-]+\/[a-zA-Z0-9._\-]+$/.test(repo)
}

// ===== UNIFIED DEVELOPER / OWNER QUESTION DETECTION =====
const DEVELOPER_RESPONSE = Object.freeze({
  content: 'المطور هو: **نذير حوامرية - Nadir Infograph** 🇩🇿\nخبير في مجال الذكاء الاصطناعي',
  showDevCard: true,
})

const DEVELOPER_QUESTION_PATTERNS = [
  // Arabic — developer
  'من هو مطورك', 'من مطورك', 'من صنعك', 'من برمجك', 'من أنشأك', 'من طورك',
  'من طور dz', 'من صمم', 'من هو مطور', 'مطور dz', 'مطور الوكيل', 'مطور الموقع',
  'من برمج هذا', 'من صنع هذا', 'من طور هذا',
  'من مطور', 'مطور التطبيق', 'مطور البرنامج', 'مطور هذا التطبيق',
  'من صاحب التطبيق', 'صاحب التطبيق', 'مالك التطبيق', 'من مالك التطبيق',
  'التطبيق ملك من', 'هذا التطبيق ملك من', 'الموقع ملك من', 'هذا الموقع ملك من',
  'من صنع هذا التطبيق', 'من برمج التطبيق', 'من طور التطبيق', 'من أنشأ التطبيق',
  'من صنع التطبيق', 'من عمل التطبيق',
  // Variants with definite article ال
  'من هو المطور', 'هو المطور', 'من المطور', 'صاحبك من', 'مطورك من',
  // Arabic dialect (Algerian/Maghrebi) — شكون
  'شكون خدمك', 'شكون برمجك', 'شكون صنعك', 'شكون عملك', 'شكون درك',
  'شكون صاوبك', 'شكون مطورك', 'شكون دار', 'شكون هو مطور', 'شكون صاحب',
  'شكون مالك', 'شكون خدم', 'شكون برمج',
  'شكون عمل التطبيق', 'شكون دار التطبيق', 'شكون صاوب التطبيق',
  'شكون مطور التطبيق', 'شكون صاحب التطبيق', 'شكون مالك التطبيق',
  'التطبيق تاع شكون', 'الموقع تاع شكون', 'هذا التطبيق تاع شكون',
  // Arabic — owner
  'من صاحب الموقع', 'من صاحب هذا الموقع', 'من مالك الموقع', 'من مالك هذا الموقع',
  'صاحب الموقع', 'مالك الموقع', 'صاحب هذا الموقع', 'مالك هذا الموقع',
  'من يملك الموقع', 'من يملك هذا الموقع',
  // English
  'who is your developer', 'who made you', 'who created you', 'who built you',
  'who programmed you', 'who designed you', 'who is dz agent developer',
  'who owns this site', 'who is the owner', 'owner of this site', 'owner of this website',
  'who developed this', 'who built this site',
  // French
  'qui est votre développeur', 'qui vous a créé', "qui t'a créé", 'qui ta crée',
  'qui vous a fait', 'qui a développé', 'qui est le propriétaire',
  'propriétaire du site', 'qui a fait ce site',
]

function normalizeQuery(message) {
  return String(message || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[؟?!.,،:;()\[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isDeveloperOrOwnerQuestion(message) {
  if (typeof message !== 'string' || !message) return false
  return DEVELOPER_QUESTION_PATTERNS.some(p => normalizeQuery(message).includes(p))
}

// ===== UNIFIED CAPABILITIES QUESTION DETECTION =====
const CAPABILITIES_RESPONSE = Object.freeze({
  content: [
    '🤖 **إمكانياتي كمساعد ذكي — DZ Agent** 🇩🇿',
    '',
    '🔎 **بحث ذكي**: محرك بحث Google-First مع تقييم المصادر والثقة (Reuters, BBC, APS, Aljazeera...).',
    '📰 **أخبار حية**: متابعة آخر الأخبار الجزائرية والعالمية عبر RSS.',
    '⚽ **رياضة**: نتائج LFP والدوريات الكبرى ومباشر المباريات.',
    '🌤️ **طقس**: حالة الطقس لأي مدينة جزائرية أو عالمية.',
    '🕌 **مواقيت الصلاة**: حسب موقعك.',
    '📖 **قرآن كريم**: قراءة وتلاوات مع الترجمة.',
    '🎓 **تعليم**: ملخصات ودروس من Eddirasa لكل المستويات.',
    '💱 **عملات**: تحويل وأسعار مباشرة (DZD وغيرها).',
    '💻 **برمجة + GitHub**: تحليل المستودعات، تعديل الملفات، commit، PR، deploy على Vercel.',
    '🖼️ **OCR**: قراءة النصوص من الصور والـ PDF.',
    '💬 **محادثة بالعربية، الإنجليزية، الفرنسية، واللهجة الجزائرية**.',
    '',
    'كيف يمكنني مساعدتك اليوم؟ 🚀',
  ].join('\n'),
})

const CAPABILITIES_QUESTION_PATTERNS = [
  // Arabic — Standard
  'ما هي إمكانياتك', 'ما إمكانياتك', 'ما هي امكانياتك', 'ما امكانياتك',
  'ماذا تستطيع', 'ماذا تقدر', 'ماذا يمكنك', 'ماذا بإمكانك',
  'ما الذي تستطيع', 'ما الذي تقدر', 'ما الذي يمكنك',
  'ماذا تفعل', 'ماذا تعمل', 'ما وظيفتك', 'ما هي وظيفتك',
  'ما هي قدراتك', 'ما قدراتك', 'ما هي مميزاتك', 'ما مميزاتك',
  'كيف تساعدني', 'كيف يمكنك مساعدتي', 'كيف تقدر تساعدني',
  'ما هي خدماتك', 'ما خدماتك',
  // Arabic dialect (Algerian/Maghrebi) — شكون / واش
  'شكون قادر تدير', 'شكون تقدر تدير', 'شكون قادر دير', 'شكون تقدر دير',
  'واش تقدر تدير', 'واش تقدر دير', 'واش تدير', 'واش تعرف دير',
  'واش تعرف', 'واش تنجم تدير', 'تنجم تدير', 'تقدر تساعدني',
  'كيفاش تساعدني', 'كيفاش تخدم', 'كيفاش تنجم تساعدني',
  'واش هي إمكانياتك', 'واش هي امكانياتك', 'واش قدراتك',
  // English
  'what can you do', 'what are you able to do', 'what are your capabilities',
  'what are your features', 'how can you help me', 'how can you help',
  'what do you do', 'what is your function', 'what are your skills',
  'help me', 'show me what you can do',
  // French
  'que peux-tu faire', 'que pouvez-vous faire', 'quelles sont tes capacités',
  'quelles sont vos capacités', 'comment peux-tu m\'aider', 'comment pouvez-vous m\'aider',
  'que sais-tu faire', 'tes fonctionnalités', 'vos fonctionnalités',
  'à quoi sers-tu', 'a quoi sers tu',
]

// ===== DOCTOR SEARCH INTENT DETECTION =====
const DOCTOR_TRIGGER_PATTERNS = [
  // Arabic / Darija
  'طبيب', 'دكتور', 'دكاترة', 'أطباء', 'طبيبة', 'نحوس على طبيب', 'نقلب على طبيب',
  'حاب طبيب', 'ابغي طبيب', 'أبحث عن طبيب', 'بحث عن طبيب', 'عيادة', 'كشف طبي',
  'موعد طبيب', 'موعد عند طبيب',
  // French
  'médecin', 'medecin', 'docteur', 'cabinet médical', 'cherche médecin', 'cherche docteur',
  'rendez-vous médecin',
  // Specialty keywords (act as triggers too)
  'cardiologue', 'dentiste', 'pédiatre', 'pediatre', 'gynécologue', 'gynecologue',
  'ophtalmologue', 'dermatologue', 'généraliste', 'generaliste', 'orl', 'psychiatre',
  'rhumatologue', 'urologue', 'neurologue', 'chirurgien',
]

const SPECIALITIES = [
  // [canonical_ar, canonical_fr, ...aliases]
  { ar: 'عظام',     fr: 'orthopédiste',  search: 'orthopédiste',   aliases: ['عظام', 'العظام', 'orthopédiste', 'orthopediste', 'orthopedic'] },
  { ar: 'قلب',      fr: 'cardiologue',   search: 'cardiologue',    aliases: ['قلب', 'القلب', 'أمراض القلب', 'cardiologue', 'cardio'] },
  { ar: 'أسنان',    fr: 'dentiste',      search: 'dentiste',       aliases: ['أسنان', 'الأسنان', 'سنان', 'dentiste', 'dentist'] },
  { ar: 'عيون',     fr: 'ophtalmologue', search: 'ophtalmologue',  aliases: ['عيون', 'العيون', 'بصر', 'ophtalmologue', 'ophtalmo'] },
  { ar: 'جلدية',    fr: 'dermatologue',  search: 'dermatologue',   aliases: ['جلدية', 'الجلدية', 'جلد', 'dermatologue', 'dermato'] },
  { ar: 'نساء وتوليد', fr: 'gynécologue', search: 'gynécologue',    aliases: ['نساء', 'توليد', 'نسائية', 'gynécologue', 'gynecologue', 'gyneco'] },
  { ar: 'أطفال',    fr: 'pédiatre',      search: 'pédiatre',       aliases: ['أطفال', 'الأطفال', 'طب الأطفال', 'pédiatre', 'pediatre'] },
  { ar: 'أنف وأذن وحنجرة', fr: 'ORL',    search: 'ORL',            aliases: ['أنف', 'أذن', 'حنجرة', 'orl'] },
  { ar: 'نفسي',     fr: 'psychiatre',    search: 'psychiatre',     aliases: ['نفسي', 'النفسي', 'نفسية', 'psychiatre', 'psy'] },
  { ar: 'باطني',    fr: 'généraliste',   search: 'généraliste',    aliases: ['باطني', 'الباطني', 'باطنية', 'généraliste', 'generaliste'] },
  { ar: 'عام',      fr: 'généraliste',   search: 'médecin généraliste', aliases: ['عام', 'طبيب عام', 'généraliste', 'generaliste', 'medecin generaliste'] },
  { ar: 'مفاصل',    fr: 'rhumatologue',  search: 'rhumatologue',   aliases: ['مفاصل', 'روماتيزم', 'rhumatologue'] },
  { ar: 'مسالك',    fr: 'urologue',      search: 'urologue',       aliases: ['مسالك', 'بولية', 'urologue'] },
  { ar: 'أعصاب',    fr: 'neurologue',    search: 'neurologue',     aliases: ['أعصاب', 'الأعصاب', 'neurologue', 'neuro'] },
  { ar: 'جراحة',    fr: 'chirurgien',    search: 'chirurgien',     aliases: ['جراحة', 'جراح', 'chirurgien'] },
]

const DOCTOR_CITIES = [
  { ar: 'أدرار', fr: 'Adrar' }, { ar: 'الشلف', fr: 'Chlef' }, { ar: 'الأغواط', fr: 'Laghouat' },
  { ar: 'أم البواقي', fr: 'Oum El Bouaghi' }, { ar: 'باتنة', fr: 'Batna' }, { ar: 'بجاية', fr: 'Bejaia' },
  { ar: 'بسكرة', fr: 'Biskra' }, { ar: 'بشار', fr: 'Bechar' }, { ar: 'البليدة', fr: 'Blida' },
  { ar: 'البويرة', fr: 'Bouira' }, { ar: 'تمنراست', fr: 'Tamanrasset' }, { ar: 'تبسة', fr: 'Tebessa' },
  { ar: 'تلمسان', fr: 'Tlemcen' }, { ar: 'تيارت', fr: 'Tiaret' }, { ar: 'تيزي وزو', fr: 'Tizi Ouzou' },
  { ar: 'الجزائر', fr: 'Alger' }, { ar: 'الجلفة', fr: 'Djelfa' }, { ar: 'جيجل', fr: 'Jijel' },
  { ar: 'سطيف', fr: 'Setif' }, { ar: 'سعيدة', fr: 'Saida' }, { ar: 'سكيكدة', fr: 'Skikda' },
  { ar: 'سيدي بلعباس', fr: 'Sidi Bel Abbes' }, { ar: 'عنابة', fr: 'Annaba' }, { ar: 'قالمة', fr: 'Guelma' },
  { ar: 'قسنطينة', fr: 'Constantine' }, { ar: 'المدية', fr: 'Medea' }, { ar: 'مستغانم', fr: 'Mostaganem' },
  { ar: 'المسيلة', fr: 'Msila' }, { ar: 'معسكر', fr: 'Mascara' }, { ar: 'ورقلة', fr: 'Ouargla' },
  { ar: 'وهران', fr: 'Oran' }, { ar: 'البيض', fr: 'El Bayadh' }, { ar: 'إليزي', fr: 'Illizi' },
  { ar: 'برج بوعريريج', fr: 'Bordj Bou Arreridj' }, { ar: 'بومرداس', fr: 'Boumerdes' },
  { ar: 'الطارف', fr: 'El Tarf' }, { ar: 'تندوف', fr: 'Tindouf' }, { ar: 'تيسمسيلت', fr: 'Tissemsilt' },
  { ar: 'الوادي', fr: 'El Oued' }, { ar: 'خنشلة', fr: 'Khenchela' }, { ar: 'سوق أهراس', fr: 'Souk Ahras' },
  { ar: 'تيبازة', fr: 'Tipaza' }, { ar: 'ميلة', fr: 'Mila' }, { ar: 'عين الدفلى', fr: 'Ain Defla' },
  { ar: 'النعامة', fr: 'Naama' }, { ar: 'عين تموشنت', fr: 'Ain Temouchent' }, { ar: 'غرداية', fr: 'Ghardaia' },
  { ar: 'غليزان', fr: 'Relizane' },
]

function detectDoctorIntent(message) {
  if (!message || typeof message !== 'string') return { isDoctorQuery: false }
  const norm = normalizeQuery(message)
  const isDoctorQuery = DOCTOR_TRIGGER_PATTERNS.some(p => norm.includes(p.toLowerCase()))
  if (!isDoctorQuery) return { isDoctorQuery: false }

  let speciality = null
  for (const sp of SPECIALITIES) {
    if (sp.aliases.some(a => norm.includes(a.toLowerCase()))) { speciality = sp; break }
  }
  let city = null
  for (const c of DOCTOR_CITIES) {
    if (norm.includes(c.ar.toLowerCase()) || norm.includes(c.fr.toLowerCase())) { city = c; break }
  }
  return { isDoctorQuery: true, speciality, city }
}

// ===== DOCTOR SEARCH — multi-source aggregator (pj-dz, addalile, sahadoc, docteur360, algerie-docto, sihhatech, machrou3) =====
import {
  searchDoctors as multiSearchDoctors,
  searchDoctorsByName as multiSearchDoctorsByName,
  formatResults as formatDoctorMulti,
  EMERGENCY_INFO,
} from './lib/doctorSearch.js'

// ===== DZ LANGUAGE LAYER (additive: normalization, intent hint, moderation, learning) =====
import {
  normalizeDarija,
  detectStyle as detectDzStyle,
  detectLightIntent,
  moderateMessage,
  recordPendingLearning,
} from './lib/dzLanguage.js'

const DOCTOR_SOURCE_COUNT = 8

function formatDoctorResults(results, speciality, city, opts = {}) {
  const specLabel = speciality?.ar || speciality?.fr || 'الأطباء'
  const cityLabel = city?.ar || city?.fr || ''
  return formatDoctorMulti(results, specLabel, cityLabel, { sourceCount: DOCTOR_SOURCE_COUNT, ...opts })
}

// ===== EMERGENCY INTENT (Algeria) =====
const EMERGENCY_PATTERNS = [
  // Arabic / Darija
  'حالة طارئة', 'حالة طارءة', 'طارئة', 'الطوارئ', 'طوارئ',
  'رقم الإسعاف', 'الاسعاف', 'الإسعاف', 'سعاف',
  'الحماية المدنية', 'حماية مدنية', 'بروتيكسيون',
  'الشرطة', 'شرطة', 'بوليس',
  'الدرك الوطني', 'الدرك', 'جندارمة',
  // French
  'urgence', 'urgences', 'protection civile', 'pompiers',
  'samu', 'ambulance', 'gendarmerie', 'numero police', 'numéro police',
]
function isEmergencyQuery(message) {
  if (!message || typeof message !== 'string') return false
  const norm = normalizeQuery(message)
  return EMERGENCY_PATTERNS.some(p => norm.includes(p.toLowerCase()))
}

// ===== DOCTOR NAME SEARCH detection =====
// Triggers when a user types "Dr X", "Docteur X", "دكتور X", "د. X" etc.,
// without a known specialty keyword. Returns the extracted name (or '').
const NAME_PREFIXES_RE = /(?:^|[\s,،])(?:dr\.?|docteur|د\.?|الدكتور|الدكتوره|دكتور|دكتوره)\s+([\p{L}\p{M}'’\- ]{2,80})/iu
function extractDoctorName(message) {
  if (!message || typeof message !== 'string') return ''
  const m = message.match(NAME_PREFIXES_RE)
  if (!m) return ''
  // Trim trailing tokens that look like cities/specialties to keep the pure name.
  let name = m[1].trim().replace(/\s+/g, ' ')
  // Cap to first 5 tokens to avoid pulling in extra context
  name = name.split(' ').slice(0, 5).join(' ')
  return name
}
function detectDoctorNameIntent(message) {
  if (!message || typeof message !== 'string') return { isNameQuery: false }
  const intent = detectDoctorIntent(message)
  // If a specialty was clearly detected, prefer specialty-search flow.
  if (intent.speciality) return { isNameQuery: false }
  const name = extractDoctorName(message)
  if (!name) return { isNameQuery: false }
  // Reject if "name" is actually a specialty alias.
  const normName = name.toLowerCase()
  for (const sp of SPECIALITIES) {
    if (sp.aliases.some(a => normName === a.toLowerCase())) return { isNameQuery: false }
  }
  return { isNameQuery: true, name }
}

function isCapabilitiesQuestion(message) {
  if (typeof message !== 'string' || !message) return false
  const normalized = normalizeQuery(message)
  // Avoid false positives on developer questions
  if (DEVELOPER_QUESTION_PATTERNS.some(p => normalized.includes(p))) return false
  return CAPABILITIES_QUESTION_PATTERNS.some(p => normalized.includes(p))
}

function normalizeChatMessages(messages) {
  if (!Array.isArray(messages)) return null
  return messages
    .slice(-24)
    .map(message => {
      const role = message?.role === 'assistant' ? 'assistant' : 'user'
      const content = sanitizeString(message?.content || '', 6000).trim()
      return content ? { role, content } : null
    })
    .filter(Boolean)
}

function hasDeployAuthorization(req) {
  const expected = process.env.DEPLOY_ADMIN_TOKEN
  if (!expected) return false
  const headerToken = req.get('x-deploy-token') || ''
  const bearerToken = (req.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const provided = headerToken || bearerToken
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer)
}

// ===== GROQ SMART KEY ROTATION SYSTEM =====
const KEY_COOLDOWN_MS = 60 * 1000        // 60s cooldown after rate-limit
const KEY_ERROR_COOLDOWN_MS = 30 * 1000  // 30s cooldown after generic error
const KEY_MAX_ERRORS = 3                  // disable key after 3 consecutive errors

const keyStats = new Map() // key -> { requests, errors, lastError, cooldownUntil, totalMs, avgMs }

function getGroqKeys() {
  const keys = []
  for (let i = 1; i <= 10; i++) {
    const k = i === 1 ? process.env.AI_API_KEY : process.env[`AI_API_KEY_${i}`]
    if (k) keys.push(k)
  }
  return keys
}

function getKeyStats(key) {
  if (!keyStats.has(key)) {
    keyStats.set(key, { requests: 0, errors: 0, consecutiveErrors: 0, lastError: 0, cooldownUntil: 0, totalMs: 0, avgMs: 0 })
  }
  return keyStats.get(key)
}

function isKeyCoolingDown(key) {
  const s = getKeyStats(key)
  return Date.now() < s.cooldownUntil
}

function setCooldown(key, ms, reason) {
  const s = getKeyStats(key)
  s.cooldownUntil = Date.now() + ms
  s.lastError = Date.now()
  console.warn(`[Groq:Rotation] Key #${getGroqKeys().indexOf(key) + 1} cooled down for ${ms / 1000}s — ${reason}`)
}

function recordSuccess(key, elapsedMs) {
  const s = getKeyStats(key)
  s.requests++
  s.consecutiveErrors = 0
  s.totalMs += elapsedMs
  s.avgMs = Math.round(s.totalMs / s.requests)
}

function recordError(key, reason) {
  const s = getKeyStats(key)
  s.errors++
  s.consecutiveErrors++
}

// Smart key selector: skip cooled-down keys, prefer least-used + fastest
function getOrderedKeys() {
  const all = getGroqKeys()
  const now = Date.now()
  const available = all.filter(k => !isKeyCoolingDown(k))
  if (available.length === 0) {
    // All cooled down — pick the one whose cooldown expires soonest
    const sorted = [...all].sort((a, b) => getKeyStats(a).cooldownUntil - getKeyStats(b).cooldownUntil)
    console.warn('[Groq:Rotation] All keys cooled down — using soonest-available key')
    return sorted
  }
  // Sort available keys: least requests first, then fastest avg response
  available.sort((a, b) => {
    const sa = getKeyStats(a), sb = getKeyStats(b)
    if (sa.requests !== sb.requests) return sa.requests - sb.requests
    if (sa.avgMs && sb.avgMs) return sa.avgMs - sb.avgMs
    return 0
  })
  // Append cooled-down keys as last resort
  const cooled = all.filter(k => isKeyCoolingDown(k))
    .sort((a, b) => getKeyStats(a).cooldownUntil - getKeyStats(b).cooldownUntil)
  return [...available, ...cooled]
}

function logKeyStats() {
  const all = getGroqKeys()
  const now = Date.now()
  const stats = all.map((k, i) => {
    const s = getKeyStats(k)
    const cd = s.cooldownUntil > now ? `CD:${Math.ceil((s.cooldownUntil - now) / 1000)}s` : 'OK'
    return `K${i + 1}[${cd} req:${s.requests} err:${s.errors} avg:${s.avgMs}ms]`
  }).join(' ')
  console.log(`[Groq:Stats] ${stats}`)
}

async function callGroqWithFallback({ model, messages, max_tokens = 4096, temperature = 0.7 }) {
  const allKeys = getGroqKeys()
  if (allKeys.length === 0) return { content: null, error: 'API key not configured.' }

  const orderedKeys = getOrderedKeys()

  for (const key of orderedKeys) {
    const keyIndex = allKeys.indexOf(key) + 1
    const t0 = Date.now()
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages, max_tokens, temperature, stream: false }),
      })
      const data = await r.json()

      // Rate limit → cooldown + try next
      if (r.status === 429 || data.error?.code === 'rate_limit_exceeded') {
        recordError(key, 'rate_limit')
        setCooldown(key, KEY_COOLDOWN_MS, 'rate limit')
        continue
      }

      // Invalid / expired key → long cooldown
      if (r.status === 401 || data.error?.code === 'invalid_api_key') {
        recordError(key, 'invalid_key')
        setCooldown(key, 24 * 60 * 60 * 1000, 'invalid key')
        continue
      }

      // Quota exceeded → long cooldown
      if (data.error?.code === 'insufficient_quota' || r.status === 402) {
        recordError(key, 'quota_exceeded')
        setCooldown(key, 6 * 60 * 60 * 1000, 'quota exceeded')
        continue
      }

      // Other server error → short cooldown
      if (!r.ok) {
        recordError(key, `http_${r.status}`)
        const s = getKeyStats(key)
        if (s.consecutiveErrors >= KEY_MAX_ERRORS) {
          setCooldown(key, KEY_ERROR_COOLDOWN_MS * s.consecutiveErrors, `${s.consecutiveErrors} consecutive errors`)
        }
        return { content: null, error: data.error?.message || `Groq error ${r.status}` }
      }

      // Success
      let content = data.choices?.[0]?.message?.content || null
      if (content) {
        const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        if (cleaned) content = cleaned
      }
      const elapsed = Date.now() - t0
      recordSuccess(key, elapsed)
      console.log(`[Groq:Rotation] K${keyIndex} ✓ ${elapsed}ms | model:${model}`)
      if (Math.random() < 0.1) logKeyStats() // log stats 10% of the time
      return { content }

    } catch (err) {
      recordError(key, 'network')
      const s = getKeyStats(key)
      if (s.consecutiveErrors >= KEY_MAX_ERRORS) {
        setCooldown(key, KEY_ERROR_COOLDOWN_MS, `network error: ${err.message}`)
      } else {
        console.warn(`[Groq:Rotation] K${keyIndex} network error, trying next: ${err.message}`)
      }
      continue
    }
  }

  logKeyStats()
  return { content: null, error: 'All API keys exhausted or rate-limited. Please try again later.' }
}

// ===== KEY STATS API =====
app.get('/api/groq-key-stats', (_req, res) => {
  const all = getGroqKeys()
  const now = Date.now()
  const stats = all.map((k, i) => {
    const s = getKeyStats(k)
    return {
      index: i + 1,
      status: s.cooldownUntil > now ? 'cooldown' : 'active',
      cooldownSecondsLeft: s.cooldownUntil > now ? Math.ceil((s.cooldownUntil - now) / 1000) : 0,
      requests: s.requests,
      errors: s.errors,
      avgResponseMs: s.avgMs,
    }
  })
  res.json({ total: all.length, active: stats.filter(s => s.status === 'active').length, keys: stats })
})

// ===== API ROUTE =====
app.post('/api/chat', async (req, res) => {
  const { model } = req.body

  // Sanitize and normalize incoming messages (XSS/control-char protection)
  const messages = normalizeChatMessages(req.body?.messages)
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages payload.' })
  }

  // Unified developer/owner intent — same canonical answer as DZ Agent
  const lastUserMsg = [...messages].reverse().find(m => m?.role === 'user')?.content || ''
  if (isDeveloperOrOwnerQuestion(lastUserMsg)) {
    return res.status(200).json(DEVELOPER_RESPONSE)
  }
  if (isCapabilitiesQuestion(lastUserMsg)) {
    return res.status(200).json(CAPABILITIES_RESPONSE)
  }

  if (getGroqKeys().length === 0) {
    return res.status(500).json({ error: 'API key not configured.' })
  }

  const groqModelMap = {
    'chatgpt': 'llama-3.3-70b-versatile',
    'llama-70b': 'llama-3.3-70b-versatile',
    'llama-8b': 'llama-3.1-8b-instant',
    'gpt-oss-120b': 'openai/gpt-oss-120b',
    'gpt-oss-20b': 'openai/gpt-oss-20b',
    'llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen': 'qwen/qwen3-32b',
    'compound': 'groq/compound',
    'compound-mini': 'groq/compound-mini',
    'deepseek-pdf': 'llama-3.3-70b-versatile',
    'ocr-dz': 'llama-3.3-70b-versatile',
  }

  const actualModel = groqModelMap[model] || model

  try {
    const { content, error } = await callGroqWithFallback({ model: actualModel, messages })
    if (!content) return res.status(500).json({ error: error || 'No response generated.' })
    return res.status(200).json({ content })
  } catch (error) {
    console.error('Chat API error:', error)
    return res.status(500).json({ error: 'Failed to generate response. Please try again.' })
  }
})

// ===== DZ AGENT — RETRIEVAL ENGINE (Google-First) =====

// ── Trust domains scoring ────────────────────────────────────────────────────
const TRUSTED_DOMAINS = {
  'reuters.com': 95, 'bbc.com': 92, 'bbc.co.uk': 92,
  'aljazeera.net': 88, 'aljazeera.com': 88,
  'aps.dz': 90, 'echoroukonline.com': 80, 'ennaharonline.com': 78,
  'elbilad.net': 75, 'elkhabar.com': 78, 'djazairess.com': 80,
  'goal.com': 82, 'sofascore.com': 85, 'lfp.dz': 88,
  'sport360.com': 78, 'kooora.com': 75,
  'wikipedia.org': 70, 'wikidata.org': 65,
  'google.com': 80, 'news.google.com': 80,
  'eddirasa.com': 92,
  'owasp.org': 96, 'developer.mozilla.org': 94, 'nodejs.org': 93,
  'react.dev': 92, 'vite.dev': 90, 'expressjs.com': 90,
  'docs.github.com': 92, 'npmjs.com': 82, 'github.com': 78,
  'vercel.com': 90, 'cloudflare.com': 88,
}

function getTrustScore(url = '') {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    for (const [domain, score] of Object.entries(TRUSTED_DOMAINS)) {
      if (hostname.endsWith(domain)) return score
    }
  } catch {}
  return 50
}

function getRecencyScore(dateStr) {
  if (!dateStr) return 0
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return 0
    const ageMs = Date.now() - date.getTime()
    const ageH = ageMs / 3600000
    if (ageH < 6) return 100
    if (ageH < 24) return 90
    if (ageH < 48) return 80
    if (ageH < 168) return 65
    if (ageH < 720) return 45
    if (ageH < 8760) return 25
    return 10
  } catch { return 0 }
}

function getRelevanceScore(result, query) {
  const q = query.toLowerCase()
  const words = q.split(/\s+/).filter(w => w.length > 2)
  const text = ((result.title || '') + ' ' + (result.snippet || '')).toLowerCase()
  const matches = words.filter(w => text.includes(w)).length
  return words.length > 0 ? Math.round((matches / words.length) * 100) : 50
}

function getSnippetScore(snippet = '', query = '') {
  if (!snippet) return 0
  const q = query.toLowerCase()
  const words = q.split(/\s+/).filter(w => w.length > 2)
  const snip = snippet.toLowerCase()
  const matches = words.filter(w => snip.includes(w)).length
  return words.length > 0 ? Math.round((matches / words.length) * 100) : 30
}

function scoreResult(result, query) {
  const freshness  = getRecencyScore(result.date || result.pubDate || result.publishedDate)
  const trust      = getTrustScore(result.url || result.link || '')
  const relevance  = getRelevanceScore(result, query)
  const snippetS   = getSnippetScore(result.snippet || result.description || '', query)
  return Math.round(freshness * 0.45 + trust * 0.25 + relevance * 0.20 + snippetS * 0.10)
}

// ── Detect query intent ───────────────────────────────────────────────────────
function detectQueryIntent(msg) {
  const lower = msg.toLowerCase()
  const isArabic = /[\u0600-\u06FF]/.test(msg)

  const INTENTS = {
    sports:   ['كرة','مباراة','مباريات','نتيجة','نتائج','هدف','أهداف','فريق','دوري','بطولة','كأس','منتخب','رياضة','football','soccer','sport','match','score','goal','team','league','cup','fifa','ligue'],
    economy:  ['اقتصاد','سعر','بورصة','عملة','تضخم','دولار','يورو','ميزانية','استثمار','economy','price','stock','currency','inflation','dollar','budget','invest','finance','bourse'],
    politics: ['سياسة','حكومة','وزير','برلمان','رئيس','انتخاب','دبلوماسية','أمم','نزاع','politics','government','minister','parliament','president','election','diplomatic','conflict','war'],
    tech:     ['تقنية','تكنولوجيا','ذكاء','برمجة','تطبيق','هاكر','أمن','tech','technology','ai','software','app','cyber','security','startup','code','programming'],
    news:     ['أخبار','خبر','اليوم','الآن','آخر','جديد','عاجل','حدث','news','latest','today','breaking','recent','actualité'],
  }

  const detected = []
  for (const [intent, kws] of Object.entries(INTENTS)) {
    if (kws.some(k => lower.includes(k))) detected.push(intent)
  }

  const temporalMarkers = ['اليوم','الآن','آخر','جديد','2025','2026','حالياً','latest','today','now','recent','current','this week','cette semaine','maintenant']
  const isTemporal = temporalMarkers.some(m => lower.includes(m)) || /\b(20[2-9]\d)\b/.test(msg)

  return { primary: detected[0] || 'general', all: detected, isTemporal, isArabic }
}

// ── Build 3 optimized queries (CSE · RSS · Global fallback) ──────────────────
function buildOptimizedQueries(query, intent) {
  const year = new Date().getFullYear()
  const isArabic = /[\u0600-\u06FF]/.test(query)

  const suffixMap = {
    sports:   isArabic ? `كرة القدم نتائج ${year}` : `football results ${year}`,
    economy:  isArabic ? `اقتصاد ${year}` : `economy ${year}`,
    politics: isArabic ? `سياسة ${year}` : `politics ${year}`,
    tech:     isArabic ? `تكنولوجيا ${year}` : `technology ${year}`,
    news:     isArabic ? `أخبار ${year}` : `news ${year}`,
    general:  `${year}`,
  }

  const suffix = suffixMap[intent.primary] || suffixMap.general
  const cseQuery  = `${query} ${suffix}`

  const rssLang = isArabic ? 'ar' : 'en'
  const rssHL   = isArabic ? 'ar&gl=DZ&ceid=DZ:ar' : 'en&gl=US&ceid=US:en'
  const rssQuery = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' ' + year)}&hl=${rssHL}`

  const enMap = { sports: 'sport football match result', economy: 'economy finance', politics: 'politics government', tech: 'technology AI', news: 'news', general: '' }
  const enSuffix = enMap[intent.primary] || ''
  const isAlgeria = /جزائر|algérie|algeria/i.test(query)
  const enQuery = isAlgeria ? `Algeria ${enSuffix} ${year}`.trim() : `${query} ${enSuffix} ${year}`.trim()

  return { cseQuery, rssQuery, enQuery, lang: rssLang }
}

// ── Google Custom Search Engine (PRIMARY) ────────────────────────────────────
async function searchGoogleCSE(query) {
  const apiKey = process.env.GOOGLE_API_KEY
  const cx     = process.env.GOOGLE_CSE_ID || '12e6f922595f64d35'
  if (!apiKey) return []

  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=8&dateRestrict=m6&sort=date`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) { console.warn('[CSE] Error:', r.status); return [] }
    const data = await r.json()
    return (data.items || []).map(item => ({
      source: 'Google CSE',
      title: item.title || '',
      snippet: item.snippet || '',
      url: item.link || '',
      date: item.pagemap?.metatags?.[0]?.['article:published_time'] || item.pagemap?.metatags?.[0]?.['og:updated_time'] || '',
    }))
  } catch (err) { console.warn('[CSE] Fetch error:', err.message); return [] }
}

function stripHtml(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function detectEducationIntent(msg = '') {
  const lower = msg.toLowerCase()
  const keywords = [
    'درس','دروس','تمرين','تمارين','حل','حلول','تعلم','اشرح','شرح','مراجعة','اختبار','فرض','واجب','بكالوريا','بيام','ابتدائي','متوسط','ثانوي',
    'math','physics','arabic','french','english','science','history','geography','lesson','exercise','learn','explain','homework','bem','bac',
    'mathématiques','physique','arabe','français','anglais','sciences','histoire','géographie','exercice','cours'
  ]
  return keywords.some(k => lower.includes(k))
}

function detectEducationSubject(msg = '') {
  const lower = msg.toLowerCase()
  const subjects = [
    { id: 'math', label: 'Math', patterns: ['رياضيات','رياضة','جبر','هندسة','دالة','معادلة','math','mathematique','mathématique'] },
    { id: 'physics', label: 'Physics', patterns: ['فيزياء','كهرباء','ميكانيك','ضوء','physics','physique'] },
    { id: 'arabic', label: 'Arabic', patterns: ['عربية','لغة عربية','نحو','إعراب','بلاغة','arabic','arabe'] },
    { id: 'french', label: 'French', patterns: ['فرنسية','فرنسي','french','français','francais'] },
    { id: 'english', label: 'English', patterns: ['انجليزية','إنجليزية','english','anglais'] },
    { id: 'science', label: 'Science', patterns: ['علوم','طبيعة','حياة','biology','science','svt'] },
    { id: 'history-geography', label: 'History / Geography', patterns: ['تاريخ','جغرافيا','history','geography','histoire','géographie'] },
  ]
  return subjects.find(s => s.patterns.some(p => lower.includes(p))) || null
}

function detectAcademicLevel(msg = '') {
  const lower = msg.toLowerCase()
  const rules = [
    { level: 'Primary 1', patterns: ['أولى ابتدائي','سنة أولى ابتدائي','1 ابتدائي','primary 1'] },
    { level: 'Primary 2', patterns: ['ثانية ابتدائي','سنة ثانية ابتدائي','2 ابتدائي','primary 2'] },
    { level: 'Primary 3', patterns: ['ثالثة ابتدائي','سنة ثالثة ابتدائي','3 ابتدائي','primary 3'] },
    { level: 'Primary 4', patterns: ['رابعة ابتدائي','سنة رابعة ابتدائي','4 ابتدائي','primary 4'] },
    { level: 'Primary 5', patterns: ['خامسة ابتدائي','سنة خامسة ابتدائي','5 ابتدائي','primary 5'] },
    { level: 'Middle 1', patterns: ['أولى متوسط','سنة أولى متوسط','1 متوسط','middle 1'] },
    { level: 'Middle 2', patterns: ['ثانية متوسط','سنة ثانية متوسط','2 متوسط','middle 2'] },
    { level: 'Middle 3', patterns: ['ثالثة متوسط','سنة ثالثة متوسط','3 متوسط','middle 3'] },
    { level: 'Middle 4 (BEM)', patterns: ['رابعة متوسط','سنة رابعة متوسط','4 متوسط','بيام','bem','middle 4'] },
    { level: 'Secondary 1', patterns: ['أولى ثانوي','سنة أولى ثانوي','1 ثانوي','secondary 1'] },
    { level: 'Secondary 2', patterns: ['ثانية ثانوي','سنة ثانية ثانوي','2 ثانوي','secondary 2'] },
    { level: 'Secondary 3 (Baccalaureate)', patterns: ['ثالثة ثانوي','سنة ثالثة ثانوي','3 ثانوي','بكالوريا','bac','baccalaureate','secondary 3'] },
  ]
  return rules.find(r => r.patterns.some(p => lower.includes(p)))?.level || null
}

function buildEddirasaQuery({ query, subject, level }) {
  const parts = [query, subject, level, 'site:eddirasa.com'].filter(Boolean)
  return parts.join(' ')
}

async function fetchEddirasaPage(url) {
  if (!url || !/^https?:\/\/([^/]+\.)?eddirasa\.com\//i.test(url)) return ''
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'DZ-GPT-Agent/1.0 (+https://dz-gpt.vercel.app)', 'Accept': 'text/html,*/*' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return ''
    const html = await r.text()
    return stripHtml(html).slice(0, 2200)
  } catch (err) {
    console.warn('[Eddirasa] Fetch error:', err.message)
    return ''
  }
}

async function searchEddirasaEducation({ query, subject, level }) {
  const searchQuery = buildEddirasaQuery({ query, subject, level })
  let results = await searchGoogleCSE(searchQuery)
  results = results
    .filter(r => {
      try {
        return /(^|\.)eddirasa\.com/i.test(new URL(r.url || 'https://eddirasa.com').hostname.replace('www.', ''))
      } catch {
        return false
      }
    })
    .slice(0, 5)

  if (results.length === 0) {
    try {
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`
      const r = await fetch(url, { headers: { 'User-Agent': 'DZ-GPT-Agent/1.0' }, signal: AbortSignal.timeout(7000) })
      if (r.ok) {
        const html = await r.text()
        const linkMatches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
        results = linkMatches.map(m => {
          const raw = m[1].replace(/&amp;/g, '&')
          let finalUrl = raw
          try {
            const parsed = new URL(raw, 'https://duckduckgo.com')
            finalUrl = parsed.searchParams.get('uddg') || raw
          } catch {}
          return { source: 'Eddirasa', title: stripHtml(m[2]), snippet: '', url: finalUrl, date: '' }
        }).filter(r => /^https?:\/\/([^/]+\.)?eddirasa\.com\//i.test(r.url)).slice(0, 5)
      }
    } catch (err) {
      console.warn('[Eddirasa] Fallback search error:', err.message)
    }
  }

  const enriched = []
  for (const result of results) {
    const extracted = await fetchEddirasaPage(result.url)
    enriched.push({ ...result, extracted })
  }
  return { query: searchQuery, results: enriched }
}

function buildEducationContext({ query, subject, level, search }) {
  const subjectLine = subject || detectEducationSubject(query)?.label || 'غير محددة'
  const levelLine = level || detectAcademicLevel(query) || 'غير محدد'
  if (!search?.results?.length) {
    return `السؤال التعليمي: ${query}\nالمادة: ${subjectLine}\nالمستوى: ${levelLine}\nالمصدر الأول: eddirasa.com\nالحالة: لم يتم العثور على نتيجة مطابقة من eddirasa.com في البحث المتاح. استخدم المعرفة التعليمية كخطة بديلة مع توضيح أن المصدر غير متوفر.`
  }
  const lines = search.results.map((r, i) => {
    const body = r.extracted || r.snippet || ''
    return `${i + 1}. ${r.title}\nالرابط: ${r.url}\nالمقتطف المستخرج: ${body.slice(0, 1200)}`
  }).join('\n\n')
  return `السؤال التعليمي: ${query}\nالمادة: ${subjectLine}\nالمستوى: ${levelLine}\nالمصدر الأول: eddirasa.com\nاستعلام البحث: ${search.query}\n\n${lines}`
}

app.post('/api/dz-agent/education/search', async (req, res) => {
  const query = sanitizeString(req.body.query || '', 500)
  const subject = sanitizeString(req.body.subject || '', 80)
  const level = sanitizeString(req.body.level || '', 80)
  if (!query) return res.status(400).json({ error: 'Query required.' })
  try {
    const index = await readEddirasaIndex()
    let indexedLessons = filterLessons(index, { subject, level, query }).slice(0, 8)
    if (indexedLessons.length === 0 && (subject || level)) {
      indexedLessons = filterLessons(index, { subject, level }).slice(0, 8)
    }
    if (indexedLessons.length > 0) {
      const results = lessonsToSearchResults(indexedLessons)
      const content = buildEducationContext({
        query,
        subject,
        level,
        search: { query: `eddirasa_rss_crawler:${query}`, results },
      })
      return res.status(200).json({ content, results, query: `eddirasa_rss_crawler:${query}` })
    }
    const search = await searchEddirasaEducation({ query, subject, level })
    const content = buildEducationContext({ query, subject, level, search })
    return res.status(200).json({ content, results: search.results, query: search.query })
  } catch (err) {
    console.error('[Eddirasa] Search endpoint error:', err.message)
    return res.status(500).json({ error: 'Failed to search eddirasa.' })
  }
})

app.post('/api/dz-agent/education/index', async (req, res) => {
  const subject = sanitizeString(req.body.subject || '', 80)
  const level = sanitizeString(req.body.level || '', 80)
  if (!subject || !level) return res.status(400).json({ error: 'Subject and level required.' })
  try {
    const index = await readEddirasaIndex()
    const indexedLessons = filterLessons(index, { subject, level }).slice(0, 20)
    if (indexedLessons.length > 0) {
      const items = indexedLessons.map(lesson => ({
        title: lesson.title || 'محتوى من eddirasa.com',
        url: lesson.url || '',
        snippet: (lesson.description || lesson.paragraphs?.join(' ') || '').slice(0, 200).trim(),
        isPdf: lesson.type === 'pdf' || (lesson.pdfs || []).length > 0 || /\.pdf($|\?|#)/i.test(lesson.url || ''),
        pdfs: lesson.pdfs || [],
      })).filter(r => r.url)
      return res.status(200).json({ items, level, subject, total: items.length, source: 'eddirasa_rss_crawler' })
    }
    const genericQuery = 'دروس تمارين فروض ملخص'
    const search = await searchEddirasaEducation({ query: genericQuery, subject, level })
    const items = (search.results || []).map(r => ({
      title: r.title || 'محتوى من eddirasa.com',
      url: r.url || '',
      snippet: (r.snippet || r.extracted || '').slice(0, 200).trim(),
      isPdf: /\.pdf($|\?|#)/i.test(r.url || ''),
    })).filter(r => r.url)
    return res.status(200).json({ items, level, subject, total: items.length })
  } catch (err) {
    console.error('[Eddirasa] Index endpoint error:', err.message)
    return res.status(500).json({ error: 'فشل في جلب الفهرس من eddirasa.com' })
  }
})

async function buildAiEducationalFallback({ title = '', level = '', year = '', subject = '' }) {
  const fallback = createStaticEducationalFallback({ title, level, year, subject })
  if (getGroqKeys().length === 0) return fallback
  const prompt = `أنشئ محتوى تعليمياً منظماً باللغة العربية حول: ${title || subject || 'درس تعليمي'}.
المستوى: ${level || 'غير محدد'}
السنة: ${year || 'غير محددة'}
المادة: ${subject || 'غير محددة'}

أرجع شرح الدرس، أمثلة، 3 تمارين، واختباراً قصيراً.`
  try {
    const { content } = await callGroqWithFallback({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
    })
    if (content) {
      fallback.description = content.slice(0, 1200)
      fallback.paragraphs = content.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).slice(0, 20)
      fallback.source = 'ai-fallback'
      fallback.updated_at = new Date().toISOString()
    }
  } catch (error) {
    console.warn('[Eddirasa] AI fallback failed:', error.message)
  }
  return fallback
}

app.post('/api/update-index', async (_req, res) => {
  try {
    const index = await updateEddirasaIndex()
    return res.status(200).json({ ok: true, total: index.lessons.length, index })
  } catch (err) {
    console.error('[Eddirasa] Update index endpoint error:', err.message)
    const fallback = createStaticEducationalFallback({ title: 'فهرس تعليمي احتياطي من DZ Agent' })
    return res.status(200).json({
      ok: false,
      warning: 'RSS/scraping sources were unavailable; returned usable fallback content.',
      index: { level: '', year: '', subject: '', lessons: [fallback], source: 'ai-fallback', updated_at: fallback.updated_at },
    })
  }
})

app.get('/api/lessons', async (req, res) => {
  const level = sanitizeString(req.query.level || '', 80)
  const year = sanitizeString(req.query.year || '', 20)
  const subject = sanitizeString(req.query.subject || '', 80)
  try {
    const index = await readEddirasaIndex()
    const lessons = filterLessons(index, { level, year, subject })
    if (lessons.length > 0 || (!level && !year && !subject)) {
      return res.status(200).json({ ...index, lessons })
    }
    const fallback = await buildAiEducationalFallback({ title: `${subject} ${level} ${year}`.trim(), level, year, subject })
    return res.status(200).json({ level, year, subject, lessons: [fallback], source: 'ai-fallback', updated_at: fallback.updated_at })
  } catch (err) {
    console.error('[Eddirasa] Lessons endpoint error:', err.message)
    const fallback = await buildAiEducationalFallback({ title: `${subject} ${level} ${year}`.trim(), level, year, subject })
    return res.status(200).json({ level, year, subject, lessons: [fallback], source: 'ai-fallback', updated_at: fallback.updated_at })
  }
})

app.get('/api/lesson', async (req, res) => {
  const title = sanitizeString(req.query.title || '', 300)
  const level = sanitizeString(req.query.level || '', 80)
  const year = sanitizeString(req.query.year || '', 20)
  const subject = sanitizeString(req.query.subject || '', 80)
  try {
    const index = await readEddirasaIndex()
    const lesson = findLessonByTitle(index, title)
    if (lesson) return res.status(200).json(lesson)
    const fallback = await buildAiEducationalFallback({ title, level, year, subject })
    return res.status(200).json(fallback)
  } catch (err) {
    console.error('[Eddirasa] Lesson endpoint error:', err.message)
    const fallback = await buildAiEducationalFallback({ title, level, year, subject })
    return res.status(200).json(fallback)
  }
})

// ── Google News RSS targeted search (SECONDARY) ──────────────────────────────
async function searchGoogleNewsRSS(rssUrl) {
  try {
    const r = await fetch(rssUrl, {
      headers: { 'User-Agent': 'DZ-GPT-Agent/1.0 (+https://dz-gpt.vercel.app)', 'Accept': 'application/rss+xml,*/*' },
      signal: AbortSignal.timeout(9000),
    })
    if (!r.ok) return []
    const xml = await r.text()
    const items = parseRSS(xml, 'Google News RSS')
    return items.slice(0, 12).map(item => ({
      source: item.source || 'Google News',
      title: item.title || '',
      snippet: item.description || '',
      url: item.link || '',
      date: item.pubDate || '',
    }))
  } catch (err) { console.warn('[GN-RSS Search] Error:', err.message); return [] }
}

// ── Fallback: DuckDuckGo Instant Answer ──────────────────────────────────────
async function searchDDGInstant(query) {
  try {
    const r = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) }
    )
    if (!r.ok) return []
    const ddg = await r.json()
    if (ddg.AbstractText) {
      return [{ source: 'DuckDuckGo', title: ddg.Heading || query, snippet: ddg.AbstractText.slice(0, 400), url: ddg.AbstractURL || '' }]
    }
    if (ddg.RelatedTopics?.length > 0) {
      return ddg.RelatedTopics.slice(0, 3).filter(t => t.Text).map(t => ({
        source: 'DuckDuckGo', title: t.Text.split(' - ')[0] || query, snippet: t.Text.slice(0, 300), url: t.FirstURL || ''
      }))
    }
    return []
  } catch { return [] }
}

// ── Wikipedia fallback for factual/general queries ────────────────────────────
async function searchWikipedia(query) {
  const isArabic = /[\u0600-\u06FF]/.test(query)
  const lang = isArabic ? 'ar' : 'en'
  const headers = { 'User-Agent': 'DZ-GPT/1.0 (https://dz-gpt.vercel.app)' }
  try {
    const r = await fetch(
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=2`,
      { headers, signal: AbortSignal.timeout(5000) }
    )
    if (!r.ok) return []
    const d = await r.json()
    return (d?.query?.search || []).slice(0, 2).map(p => ({
      source: 'Wikipedia',
      title: p.title,
      snippet: p.snippet.replace(/<[^>]*>/g, '').slice(0, 400),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
      date: '',
    }))
  } catch { return [] }
}

// ── Main retrieval API endpoint ───────────────────────────────────────────────
app.post('/api/dz-agent-search', async (req, res) => {
  const { query } = req.body
  if (!query) return res.status(400).json({ error: 'Query required.' })

  const startTime = Date.now()
  const intent = detectQueryIntent(query)
  const { cseQuery, rssQuery, enQuery } = buildOptimizedQueries(query, intent)

  console.log(`[DZ Retrieval] query="${query}" intent=${intent.primary} temporal=${intent.isTemporal}`)

  // Step 1: Google CSE (primary)
  const cseResults = await searchGoogleCSE(cseQuery)

  // Step 2: Google News RSS (real-time)
  const rssResults = await searchGoogleNewsRSS(rssQuery)

  // Step 3: Fallback if CSE+RSS insufficient
  let fallbackResults = []
  if (cseResults.length + rssResults.length < 4) {
    const [ddg, wiki] = await Promise.allSettled([
      searchDDGInstant(enQuery),
      intent.primary === 'general' ? searchWikipedia(query) : Promise.resolve([]),
    ])
    fallbackResults = [
      ...(ddg.status === 'fulfilled' ? ddg.value : []),
      ...(wiki.status === 'fulfilled' ? wiki.value : []),
    ]
  }

  // Merge + deduplicate by URL
  const all = [...cseResults, ...rssResults, ...fallbackResults]
  const seen = new Set()
  const deduped = all.filter(r => {
    const key = (r.url || r.link || '').split('?')[0]
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Score every result
  const scored = deduped.map(r => ({
    ...r,
    _score: scoreResult(r, query),
    _trust: getTrustScore(r.url || r.link || ''),
    _fresh: getRecencyScore(r.date || r.pubDate || ''),
  })).sort((a, b) => b._score - a._score).slice(0, 10)

  const hasMandatorySearch = intent.isTemporal || ['news','sports','economy','politics'].includes(intent.primary)
  const noResults = scored.length === 0

  console.log(`[DZ Retrieval] ${scored.length} results | CSE=${cseResults.length} RSS=${rssResults.length} FB=${fallbackResults.length} | ${Date.now()-startTime}ms`)

  return res.status(200).json({
    results: scored,
    meta: {
      intent: intent.primary,
      isTemporal: intent.isTemporal,
      mandatorySearch: hasMandatorySearch,
      noResults,
      sources: {
        cse: cseResults.length,
        rss: rssResults.length,
        fallback: fallbackResults.length,
      },
      queries: { cseQuery, rssQuery, enQuery },
    },
  })
})

// ===== RSS FEED SYSTEM FOR DZ AGENT =====
const RSS_CACHE = new Map()
const RSS_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

const RSS_FEEDS = {
  national: [
    { name: 'APS وكالة الأنباء', url: 'https://www.aps.dz/ar/feed' },
    { name: 'الشروق أونلاين', url: 'https://www.echoroukonline.com/feed' },
    { name: 'النهار', url: 'https://www.ennaharonline.com/feed/' },
    { name: 'الخبر', url: 'https://www.elkhabar.com/rss' },
    { name: 'البلاد', url: 'https://www.elbilad.net/feed/' },
    { name: 'الجزيرة', url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9' },
    { name: 'BBC عربي', url: 'http://feeds.bbci.co.uk/arabic/rss.xml' },
    { name: 'جزايرس', url: 'https://www.djazairess.com/rss' },
  ],
  sports: [
    { name: 'سبورت 360', url: 'https://arabic.sport360.com/feed/' },
    { name: 'الجزيرة الرياضة', url: 'https://www.aljazeera.net/aljazeerarss/a5a4f016-e494-4734-9d83-b1f26bfd8091/c65de6d9-3b39-4b75-a0ce-1b0e8f8e0db6' },
    { name: 'كووورة', url: 'https://www.kooora.com/?feed=rss' },
    { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
    { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
    { name: 'APS رياضة', url: 'https://www.aps.dz/ar/sport/feed' },
  ],
}

// ===== FOOTBALL INTELLIGENCE SYSTEM =====
const FOOTBALL_CACHE = new Map()
const FOOTBALL_CACHE_TTL = 5 * 60 * 1000 // 5 min for live match data

const INTL_FOOTBALL_FEEDS = [
  { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
  { name: 'الجزيرة الرياضة', url: 'https://www.aljazeera.net/aljazeerarss/a5a4f016-e494-4734-9d83-b1f26bfd8091/c65de6d9-3b39-4b75-a0ce-1b0e8f8e0db6' },
  { name: 'سبورت 360', url: 'https://arabic.sport360.com/feed/' },
  { name: 'كووورة', url: 'https://www.kooora.com/?feed=rss' },
  { name: 'APS رياضة', url: 'https://www.aps.dz/ar/sport/feed' },
]

async function fetchSofaScoreFootball(dateStr) {
  const today = dateStr || new Date().toISOString().split('T')[0]
  const cacheKey = `sofascore_${today}`
  const cached = FOOTBALL_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < FOOTBALL_CACHE_TTL) return cached.data

  const sfHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8,fr;q=0.7',
    'Referer': 'https://www.sofascore.com/',
    'Origin': 'https://www.sofascore.com',
    'Cache-Control': 'no-cache',
  }

  const endpoints = [
    `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${today}`,
    `https://api.sofascore.com/api/v1/sport/football/events/live`,
  ]

  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: sfHeaders, signal: AbortSignal.timeout(10000) })
      if (!r.ok) { console.log(`[SofaScore] ${url} → ${r.status}`); continue }
      const d = await r.json()
      const events = d.events || []
      if (!events.length) continue

      const matches = events.slice(0, 30).map(e => {
        const isLive = e.status?.type === 'inprogress'
        const isFinished = e.status?.type === 'finished'
        const startTs = e.startTimestamp ? new Date(e.startTimestamp * 1000) : null
        return {
          homeTeam: e.homeTeam?.name || '',
          awayTeam: e.awayTeam?.name || '',
          homeScore: (isLive || isFinished) ? (e.homeScore?.current ?? null) : null,
          awayScore: (isLive || isFinished) ? (e.awayScore?.current ?? null) : null,
          status: e.status?.description || '',
          statusType: e.status?.type || '',
          competition: e.tournament?.name || '',
          country: e.tournament?.category?.country?.name || e.tournament?.category?.name || '',
          startTime: startTs ? startTs.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
          date: startTs ? startTs.toLocaleDateString('ar-DZ', { timeZone: 'Africa/Algiers' }) : today,
          id: e.id,
          source: 'SofaScore',
          link: e.id ? `https://www.sofascore.com/event/${e.id}` : 'https://www.sofascore.com',
        }
      })

      const data = { matches, fetchedAt: Date.now(), date: today, apiSource: url }
      FOOTBALL_CACHE.set(cacheKey, { data, ts: Date.now() })
      console.log(`[SofaScore] Fetched ${matches.length} matches from ${url}`)
      return data
    } catch (err) {
      console.error('[SofaScore] Error:', err.message)
    }
  }
  return null
}

function detectFootballQuery(msg) {
  const lower = msg.toLowerCase()
  const keywords = [
    // Arabic — general
    'مباراة', 'مباريات', 'نتيجة', 'نتائج', 'هدف', 'أهداف', 'بطولة', 'ملعب', 'تصفيات',
    'كرة القدم', 'الكرة', 'لاعب', 'مدرب', 'فريق', 'فرق', 'كأس', 'رياضة كرة',
    // Arabic — competitions
    'دوري أبطال', 'دوري الأبطال', 'تشامبيونز ليغ', 'يورو', 'كأس العالم', 'مونديال',
    'الدوري الإسباني', 'الليغا', 'الدوري الإنجليزي', 'البريميرليغ', 'بريميرليق',
    'الدوري الألماني', 'البوندسليغا', 'الدوري الإيطالي', 'السيريا', 'الدوري الفرنسي',
    'أمم أفريقيا', 'كان', 'أمم أوروبا', 'كاف', 'فيفا', 'يويفا',
    // Arabic — teams
    'ريال مدريد', 'برشلونة', 'بايرن', 'ليفربول', 'مانشستر', 'باريس سان جيرمان', 'يوفنتوس',
    'المنتخب الجزائري', 'منتخب الجزائر', 'الخضر', 'المنتخب الوطني', 'الفنك',
    // English
    'football', 'soccer', 'match result', 'match score', 'goal', 'league table', 'standings',
    'champions league', 'premier league', 'la liga', 'bundesliga', 'serie a', 'ligue 1',
    'world cup', 'euros', 'euro 2024', 'afcon', 'copa america', 'nations league',
    'real madrid', 'barcelona', 'liverpool', 'manchester', 'arsenal', 'chelsea', 'psg',
    'algeria', 'fennecs', 'sofascore', 'flashscore', 'live score', 'livescore',
    // French
    'résultat', 'ligue des champions', 'équipe nationale', 'coupe du monde', 'les verts',
  ]
  return keywords.some(k => lower.includes(k))
}

function buildFootballContext(sfData, rssFeeds, dateStr) {
  const date = dateStr || new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  let ctx = `\n\n--- ⚽ بيانات كرة القدم المباشرة — ${date} ---\n`

  if (sfData?.matches?.length) {
    const live = sfData.matches.filter(m => m.statusType === 'inprogress')
    const finished = sfData.matches.filter(m => m.statusType === 'finished')
    const upcoming = sfData.matches.filter(m => m.statusType === 'notstarted')

    if (live.length > 0) {
      ctx += `\n🔴 **مباريات جارية الآن (SofaScore):**\n`
      for (const m of live.slice(0, 10)) {
        ctx += `• ${m.homeTeam} **${m.homeScore ?? 0} - ${m.awayScore ?? 0}** ${m.awayTeam}`
        if (m.competition) ctx += ` | ${m.competition}`
        if (m.country) ctx += ` (${m.country})`
        ctx += ` — ${m.link}\n`
      }
    }

    if (finished.length > 0) {
      ctx += `\n✅ **نتائج المباريات (SofaScore):**\n`
      for (const m of finished.slice(0, 15)) {
        ctx += `• ${m.homeTeam} **${m.homeScore} - ${m.awayScore}** ${m.awayTeam}`
        if (m.competition) ctx += ` | ${m.competition}`
        if (m.country) ctx += ` (${m.country})`
        ctx += ` — ${m.link}\n`
      }
    }

    if (upcoming.length > 0) {
      ctx += `\n📅 **مباريات قادمة (SofaScore):**\n`
      for (const m of upcoming.slice(0, 10)) {
        ctx += `• ${m.homeTeam} vs ${m.awayTeam}`
        if (m.startTime) ctx += ` — ${m.startTime}`
        if (m.competition) ctx += ` | ${m.competition}`
        if (m.country) ctx += ` (${m.country})`
        ctx += ` — ${m.link}\n`
      }
    }
    ctx += `*(المصدر: SofaScore — ${new Date(sfData.fetchedAt).toLocaleTimeString('ar-DZ')})*\n`
  }

  if (rssFeeds?.length) {
    ctx += `\n📰 **أخبار كرة القدم (RSS):**\n`
    for (const feed of rssFeeds) {
      if (!feed?.items?.length) continue
      ctx += `\n**${feed.name}:**\n`
      for (const item of feed.items.slice(0, 3)) {
        ctx += `• ${item.title}`
        if (item.link) ctx += ` — ${item.link}`
        ctx += '\n'
      }
    }
  }

  ctx += '\n---\n'
  ctx += '> ⚠️ دائماً تحقق من المصدر الرسمي للنتائج الدقيقة.\n'
  return ctx
}

// Hardcoded tag regexes — avoids dynamic RegExp (ReDoS risk)
const RSS_TAG_REGEXES = {
  title:       /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i,
  description: /<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i,
  link:        /<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i,
  pubDate:     /<pubDate[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i,
  'dc:date':   /<dc:date[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/dc:date>/i,
}

function parseRSS(xml, sourceName) {
  const items = []
  const decode = (s) => s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"').replace(/&#\d+;/g,'').trim()

  // Try RSS <item> blocks first
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const getTag = (tag) => {
      const rx = RSS_TAG_REGEXES[tag]
      if (!rx) return ''
      const r = block.match(rx)
      if (!r) return ''
      return decode(r[1])
    }
    const rawLink = block.match(/<link>\s*(https?:\/\/[^\s<]+)/i)?.[1]
      || block.match(/<link[^>]+href=["'](https?:\/\/[^"']+)["']/i)?.[1]
      || getTag('link') || ''
    const title = getTag('title')
    if (!title) continue
    items.push({
      title,
      link: rawLink,
      description: getTag('description').slice(0, 250),
      pubDate: getTag('pubDate') || getTag('dc:date') || '',
      source: sourceName,
    })
  }

  // Fallback: try Atom <entry> blocks
  if (items.length === 0) {
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi
    while ((match = entryRegex.exec(xml)) !== null) {
      const block = match[1]
      const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      const title = titleMatch ? decode(titleMatch[1]) : ''
      if (!title) continue
      const linkMatch = block.match(/<link[^>]+href=["'](https?:\/\/[^"']+)["']/i)
        || block.match(/<link>(https?:\/\/[^\s<]+)<\/link>/i)
      const link = linkMatch ? linkMatch[1] : ''
      const summaryMatch = block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)
        || block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)
      const desc = summaryMatch ? decode(summaryMatch[1]).slice(0, 250) : ''
      const pubMatch = block.match(/<published>([\s\S]*?)<\/published>/i)
        || block.match(/<updated>([\s\S]*?)<\/updated>/i)
      const pubDate = pubMatch ? decode(pubMatch[1]) : ''
      items.push({ title, link, description: desc, pubDate, source: sourceName })
    }
  }

  return items.slice(0, 8)
}

async function fetchRSSFeed(feed) {
  const cached = RSS_CACHE.get(feed.url)
  if (cached && Date.now() - cached.ts < RSS_CACHE_TTL) return cached.data

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const resp = await fetch(feed.url, {
      headers: { 'User-Agent': 'DZ-GPT-Agent/1.0 (+https://dz-gpt.vercel.app)', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!resp.ok) return null
    const xml = await resp.text()
    const items = parseRSS(xml, feed.name)
    const result = { name: feed.name, items, fetchedAt: new Date().toISOString() }
    RSS_CACHE.set(feed.url, { data: result, ts: Date.now() })
    return result
  } catch (err) {
    console.error('[RSS] feed fetch failed:', feed.name, err.message)
    return null
  }
}

async function fetchMultipleFeeds(feeds) {
  const results = await Promise.allSettled(feeds.map(f => fetchRSSFeed(f)))
  return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean)
}

function detectLFPQuery(msg) {
  const lower = msg.toLowerCase()
  const lfpKw = [
    'الدوري الجزائري', 'الرابطة المحترفة', 'رابطة كرة القدم', 'lfp', 'lp1', 'ligue pro',
    'dz league', 'الجولة', 'نتائج الدوري', 'ترتيب الدوري', 'نتائج المباريات الجزائرية',
    'مباريات اليوم الجزائر', 'الفريق الجزائري', 'شباب الجزائر', 'مولودية الجزائر',
    'مولودية وهران', 'شبيبة القبائل', 'اتحاد العاصمة', 'نصر حسين داي', 'بلوزداد',
    'وفاق سطيف', 'شباب بلوزداد', 'جمعية الشلف', 'أهلي برج', 'أهلي شلف',
  ]
  return lfpKw.some(k => lower.includes(k))
}

function detectNewsQuery(msg) {
  const lower = msg.toLowerCase()
  const sportsKw = [
    'كرة','مباراة','مباريات','نتيجة','نتائج','هدف','أهداف','فريق','دوري','بطولة','كأس','مونديال',
    'ملعب','لاعب','تصفيات','رياضة','رياضي','المنتخب','الرابطة','football','soccer','sport','sports',
    'match','score','goal','team','league','cup','fifa','kooora','كووورة',
  ]
  const newsKw = [
    'أخبار','خبر','اليوم','الآن','آخر','جديد','تقرير','حدث','أحداث','عاجل','بيان',
    'news','latest','today','breaking','recent','actualité','nouvelles','aujourd','حوادث',
    'الجزائر','سياسة','اقتصاد','صحة','تعليم','برلمان','حكومة','وزير',
  ]
  const isSports = sportsKw.some(k => lower.includes(k))
  const isNews = newsKw.some(k => lower.includes(k))
  if (isSports && isNews) return 'both'
  if (isSports) return 'sports'
  if (isNews) return 'news'
  return null
}

function buildRSSContext(feedResults, queryType) {
  if (!feedResults.length) return ''
  const date = new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const label = queryType === 'sports' ? '⚽ نتائج وأخبار رياضية' : '📰 أخبار'
  let ctx = `\n\n--- ${label} — ${date} ---\n`
  for (const feed of feedResults) {
    if (!feed.items?.length) continue
    ctx += `\n**${feed.name}:**\n`
    for (const item of feed.items.slice(0, 4)) {
      ctx += `• ${item.title}`
      if (item.link) ctx += ` — ${item.link}`
      if (item.description) ctx += `\n  ${item.description}`
      ctx += '\n'
    }
  }
  ctx += '\n---\n'
  return ctx
}

// Endpoint: manual RSS fetch (for direct use)
app.get('/api/dz-agent/rss/:type', async (req, res) => {
  const type = req.params.type === 'sports' ? 'sports' : 'national'
  const feeds = RSS_FEEDS[type]
  const results = await fetchMultipleFeeds(feeds)
  res.json({ type, results, count: results.reduce((s, r) => s + (r?.items?.length || 0), 0) })
})

// ===== DZ AGENT DASHBOARD — Live Cards =====
const DASHBOARD_CACHE = { data: null, ts: 0 }
const DASHBOARD_TTL = 10 * 60 * 1000 // 10 min

const NEWS_FEEDS_DASHBOARD = [
  { name: 'APS', url: 'https://www.aps.dz/ar/feed' },
  { name: 'الشروق', url: 'https://www.echoroukonline.com/feed' },
  { name: 'النهار', url: 'https://www.ennaharonline.com/feed/' },
  { name: 'الخبر', url: 'https://www.elkhabar.com/rss' },
  { name: 'البلاد', url: 'https://www.elbilad.net/feed/' },
  { name: 'جزايرس', url: 'https://www.djazairess.com/rss' },
  { name: 'الجزيرة', url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9' },
  { name: 'BBC عربي', url: 'https://feeds.bbci.co.uk/arabic/rss.xml' },
  { name: 'Google أخبار الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: 'Google سياسة الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%B3%D9%8A%D8%A7%D8%B3%D8%A9&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: 'Google اقتصاد الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF&hl=ar&gl=DZ&ceid=DZ:ar' },
]
const SPORTS_FEEDS_DASHBOARD = [
  { name: 'سبورت 360', url: 'https://arabic.sport360.com/feed/' },
  { name: 'الجزيرة الرياضة', url: 'https://www.aljazeera.net/aljazeerarss/a5a4f016-e494-4734-9d83-b1f26bfd8091/c65de6d9-3b39-4b75-a0ce-1b0e8f8e0db6' },
  { name: 'كووورة', url: 'https://www.kooora.com/?feed=rss' },
  { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
]

// ===== TECH INTELLIGENCE MODULE — RSS FEEDS =====
const TECH_FEEDS_DASHBOARD = [
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
  { name: 'Ars Technica', url: 'https://arstechnica.com/feed/' },
  { name: 'DEV.to', url: 'https://dev.to/feed' },
  { name: 'Stack Overflow Blog', url: 'https://stackoverflow.blog/feed/' },
  { name: 'Google News Tech', url: 'https://news.google.com/rss/search?q=technology+AI&hl=en' },
]

const TECH_CATEGORY_KEYWORDS = {
  'AI 🤖': ['ai', 'artificial intelligence', 'machine learning', 'gpt', 'llm', 'neural', 'model', 'openai', 'gemini', 'claude', 'deepseek', 'llama'],
  'Cybersecurity 🔐': ['security', 'hack', 'breach', 'vulnerability', 'cyber', 'malware', 'ransomware', 'phishing', 'exploit', 'cve'],
  'Startups 🚀': ['startup', 'raise', 'funding', 'series a', 'series b', 'venture', 'vc', 'valuation', 'acquisition', 'ipo'],
  'Big Tech 🏢': ['google', 'apple', 'microsoft', 'meta', 'amazon', 'nvidia', 'tesla', 'samsung', 'intel', 'qualcomm'],
}

function classifyTechArticle(title = '', desc = '') {
  const text = (title + ' ' + desc).toLowerCase()
  for (const [cat, keywords] of Object.entries(TECH_CATEGORY_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return cat
  }
  return 'Software 💻'
}

function computeTrendingScore(item, allItems) {
  let score = 40
  const titleWords = item.title.toLowerCase().split(/\s+/).filter(w => w.length > 4)
  const matches = allItems.filter(other =>
    other !== item && titleWords.some(w => other.title.toLowerCase().includes(w))
  )
  score += Math.min(matches.length * 8, 30)
  if (item.pubDate) {
    const ageMs = Date.now() - new Date(item.pubDate).getTime()
    const ageH = ageMs / 3600000
    if (ageH < 6) score += 30
    else if (ageH < 24) score += 20
    else if (ageH < 72) score += 10
  }
  const credibleSources = ['techcrunch', 'verge', 'wired', 'arstechnica']
  if (credibleSources.some(s => (item.feedName || '').toLowerCase().includes(s) || (item.source || '').toLowerCase().includes(s))) {
    score += 15
  }
  return Math.min(score, 100)
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  GN-RSS MODULE — Google News RSS Intelligence Layer             ║
// ║  ADD-ON ONLY — Does NOT modify any existing system             ║
// ╚══════════════════════════════════════════════════════════════════╝

const GN_RSS_CACHE = new Map()
const GN_RSS_TTL = 10 * 60 * 1000 // 10 minutes (Hybrid Mode default)

// ── Multilingual feed registry ──────────────────────────────────────────────
const GN_RSS_FEEDS = {
  ar: [
    { name: 'Google أخبار الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar' },
    { name: 'Google سياسة الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%B3%D9%8A%D8%A7%D8%B3%D8%A9&hl=ar&gl=DZ&ceid=DZ:ar' },
    { name: 'Google اقتصاد الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF&hl=ar&gl=DZ&ceid=DZ:ar' },
    { name: 'Google رياضة الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%B1%D9%8A%D8%A7%D8%B6%D8%A9&hl=ar&gl=DZ&ceid=DZ:ar' },
  ],
  fr: [
    { name: 'Google Algérie', url: 'https://news.google.com/rss/search?q=Alg%C3%A9rie&hl=fr&gl=DZ&ceid=DZ:fr' },
    { name: 'Google Algérie actualités', url: 'https://news.google.com/rss/search?q=Alg%C3%A9rie+actualit%C3%A9s&hl=fr&gl=DZ&ceid=DZ:fr' },
  ],
  en: [
    { name: 'Google Algeria News', url: 'https://news.google.com/rss/search?q=Algeria&hl=en&gl=DZ&ceid=DZ:en' },
    { name: 'Google World News', url: 'https://news.google.com/rss/search?q=world+news&hl=en&gl=US&ceid=US:en' },
    { name: 'Google Economy', url: 'https://news.google.com/rss/search?q=economy&hl=en&gl=US&ceid=US:en' },
    { name: 'Google Technology AI', url: 'https://news.google.com/rss/search?q=technology+AI&hl=en&gl=US&ceid=US:en' },
  ],
}

// ── GN-RSS category keywords ─────────────────────────────────────────────────
const GN_CATEGORIES = {
  'سياسة 🏛️':   ['سياسة', 'حكومة', 'وزير', 'برلمان', 'رئيس', 'انتخاب', 'دبلوماسية', 'politics', 'government', 'minister', 'parliament', 'president', 'election', 'politique', 'gouvernement'],
  'اقتصاد 💰':  ['اقتصاد', 'مالية', 'استثمار', 'تضخم', 'نمو', 'ميزانية', 'بورصة', 'economy', 'finance', 'investment', 'inflation', 'gdp', 'budget', 'économie', 'investissement'],
  'رياضة ⚽':   ['رياضة', 'مباراة', 'كرة', 'دوري', 'بطولة', 'لاعب', 'sport', 'football', 'match', 'league', 'tournament', 'player', 'score', 'goal', 'sport', 'foot'],
  'تكنولوجيا 💻': ['تكنولوجيا', 'تقنية', 'ذكاء اصطناعي', 'برمجة', 'tech', 'technology', 'ai', 'software', 'cybersecurity', 'startup', 'digital', 'technologie', 'numérique'],
  'صحة 🏥':    ['صحة', 'طب', 'مرض', 'علاج', 'مستشفى', 'لقاح', 'health', 'medical', 'disease', 'treatment', 'hospital', 'vaccine', 'santé', 'médecine'],
  'دولي 🌍':   ['دولي', 'عالمي', 'أمم متحدة', 'international', 'world', 'global', 'united nations', 'nato', 'international', 'mondial'],
}

// ── Detect query language ─────────────────────────────────────────────────────
function detectQueryLanguage(text) {
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'
  if (/[àâçéèêëîïôùûüœæ]/i.test(text) || /\b(algérie|actualités|économie|politique)\b/i.test(text)) return 'fr'
  return 'en'
}

// ── Classify GN article into category ────────────────────────────────────────
function classifyGNArticle(title = '', source = '') {
  const text = (title + ' ' + source).toLowerCase()
  for (const [cat, kws] of Object.entries(GN_CATEGORIES)) {
    if (kws.some(k => text.includes(k))) return cat
  }
  return 'محلي 🇩🇿'
}

// ── Fetch + parse GN-RSS feeds (uses shared fetchRSSFeed with GN cache key) ──
async function fetchGNRSSArticles(feeds) {
  const cacheKey = feeds.map(f => f.url).join('|')
  const cached = GN_RSS_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < GN_RSS_TTL) {
    console.log(`[GN-RSS] Cache hit: ${cached.data.length} articles`)
    return cached.data
  }

  // Parallel fetch (LIVE mode for fresh data)
  const settled = await Promise.allSettled(
    feeds.map(async (feed) => {
      try {
        const r = await fetch(feed.url, {
          headers: { 'User-Agent': 'DZ-GPT-Agent/1.0 (+https://dz-gpt.vercel.app)', 'Accept': 'application/rss+xml,application/xml,text/xml,*/*' },
          signal: AbortSignal.timeout(8000),
        })
        if (!r.ok) return []
        const xml = await r.text()
        const items = parseRSS(xml, feed.name)
        return items.map(item => ({ ...item, gnSource: feed.name, language: feed.url.includes('hl=ar') ? 'ar' : feed.url.includes('hl=fr') ? 'fr' : 'en' }))
      } catch { return [] }
    })
  )

  const raw = settled.flatMap(s => s.status === 'fulfilled' ? s.value : [])
  const articles = deduplicateGNArticles(raw)
    .map(item => ({ ...item, category: classifyGNArticle(item.title, item.source) }))
    .sort((a, b) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime())
    .slice(0, 30)

  GN_RSS_CACHE.set(cacheKey, { data: articles, ts: Date.now() })
  console.log(`[GN-RSS] Fetched ${articles.length} articles from ${feeds.length} feeds`)
  return articles
}

// ── Deduplication (title similarity + URL match) ──────────────────────────────
function deduplicateGNArticles(articles) {
  const seen = new Set()
  const result = []
  for (const art of articles) {
    if (!art.title) continue
    // Normalize: lowercase, strip punctuation, keep first 60 chars as fingerprint
    const fingerprint = art.title.toLowerCase().replace(/[^\u0600-\u06FFa-z0-9\s]/g, '').trim().slice(0, 60)
    const urlKey = art.link ? art.link.split('?')[0] : ''
    if (seen.has(fingerprint) || (urlKey && seen.has(urlKey))) continue
    seen.add(fingerprint)
    if (urlKey) seen.add(urlKey)
    result.push(art)
  }
  return result
}

// ── Build GN-RSS context string for AI system prompt ─────────────────────────
function buildGNRSSContext(articles, label = '🌐 Google News RSS') {
  if (!articles.length) return ''
  const date = new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  let ctx = `\n\n--- ${label} — ${date} ---\n`

  // Group by category
  const byCategory = {}
  for (const art of articles) {
    const cat = art.category || 'عام'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(art)
  }

  for (const [cat, items] of Object.entries(byCategory)) {
    ctx += `\n**${cat}:**\n`
    for (const item of items.slice(0, 4)) {
      ctx += `• ${item.title}`
      if (item.source) ctx += ` [${item.source}]`
      if (item.link) ctx += ` — ${item.link}`
      if (item.pubDate) {
        try { ctx += ` (${new Date(item.pubDate).toLocaleDateString('ar-DZ')})` } catch {}
      }
      ctx += '\n'
    }
  }
  ctx += '\n---\n'
  ctx += '> مصدر: Google News RSS — بيانات آنية مصنّفة تلقائياً.\n'
  return ctx
}

// ── Background refresh helper (for Hybrid Mode) ───────────────────────────────
function refreshGNRSSInBackground(feeds) {
  const cacheKey = feeds.map(f => f.url).join('|')
  const cached = GN_RSS_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts > GN_RSS_TTL * 0.7) {
    // Refresh silently if cache is 70%+ expired
    fetchGNRSSArticles(feeds).catch(() => {})
  }
}

async function fetchWeatherAlgiers() {
  const WEATHER_CITIES = ['Algiers', 'Oran', 'Constantine', 'Annaba']
  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) {
    return WEATHER_CITIES.map(city => ({ city, temp: null, condition: null, icon: null, error: 'No API key' }))
  }
  const results = await Promise.allSettled(
    WEATHER_CITIES.map(async (city) => {
      const r = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=ar`,
        { signal: AbortSignal.timeout(6000) }
      )
      if (!r.ok) return { city, temp: null, condition: null, icon: null }
      const d = await r.json()
      return {
        city,
        temp: Math.round(d.main?.temp ?? null),
        condition: d.weather?.[0]?.description || null,
        icon: d.weather?.[0]?.icon || null,
        humidity: d.main?.humidity,
        wind: Math.round(d.wind?.speed ?? 0),
      }
    })
  )
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { city: WEATHER_CITIES[i], temp: null, condition: null, icon: null }
  )
}

app.get('/api/dz-agent/dashboard', async (_req, res) => {
  if (DASHBOARD_CACHE.data && Date.now() - DASHBOARD_CACHE.ts < DASHBOARD_TTL) {
    return res.json(DASHBOARD_CACHE.data)
  }

  const [newsFeeds, sportsFeeds, techFeeds, weather, lfpResult, gnRssResult] = await Promise.allSettled([
    fetchMultipleFeeds(NEWS_FEEDS_DASHBOARD),
    fetchMultipleFeeds(SPORTS_FEEDS_DASHBOARD),
    fetchMultipleFeeds(TECH_FEEDS_DASHBOARD),
    fetchWeatherAlgiers(),
    fetchLFPData(),
    // GN-RSS: fetch Arabic Algeria feeds for dashboard augmentation
    fetchGNRSSArticles(GN_RSS_FEEDS.ar),
  ])

  const existingNews = (newsFeeds.status === 'fulfilled' ? newsFeeds.value : [])
    .flatMap(f => (f?.items || []).map(item => ({ ...item, feedName: f.name })))

  // Merge GN-RSS articles with existing news (GN-RSS first for freshness, then deduplicate)
  const gnDashboardArticles = (gnRssResult.status === 'fulfilled' ? gnRssResult.value : [])
    .map(item => ({ ...item, feedName: item.gnSource || 'Google News' }))

  const allNews = deduplicateGNArticles([...gnDashboardArticles, ...existingNews])
    .slice(0, 18)

  const allSports = (sportsFeeds.status === 'fulfilled' ? sportsFeeds.value : [])
    .flatMap(f => (f?.items || []).map(item => ({ ...item, feedName: f.name })))
    .slice(0, 6)

  // Prepend LFP matches/articles to sports
  const lfpData = lfpResult.status === 'fulfilled' ? lfpResult.value : null
  const lfpSportsItems = []
  if (lfpData) {
    const played = lfpData.matches.filter(m => m.played)
    for (const m of played) {
      lfpSportsItems.push({
        title: `${m.home} ${m.homeScore} - ${m.awayScore} ${m.away}`,
        description: m.round || '',
        link: m.link || 'https://lfp.dz',
        pubDate: '',
        source: 'lfp.dz',
        feedName: '🏆 الدوري الجزائري',
      })
    }
    for (const a of (lfpData.articles || []).slice(0, 3)) {
      lfpSportsItems.push({
        title: a.title,
        description: '',
        link: a.link || 'https://lfp.dz',
        pubDate: a.date || '',
        source: 'lfp.dz',
        feedName: '🏆 رابطة LFP',
      })
    }
  }

  const weatherData = weather.status === 'fulfilled' ? weather.value : []

  // ── Tech Intelligence: classify + score + sort ────────────────────────────
  const rawTech = (techFeeds.status === 'fulfilled' ? techFeeds.value : [])
    .flatMap(f => (f?.items || []).map(item => ({ ...item, feedName: f.name })))

  const allTech = rawTech
    .filter((item, idx, arr) => arr.findIndex(x => x.title === item.title) === idx)
    .map(item => ({
      ...item,
      category: classifyTechArticle(item.title, item.description),
      trending_score: computeTrendingScore(item, rawTech),
    }))
    .sort((a, b) => b.trending_score - a.trending_score || new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 15)

  const data = {
    news: allNews,
    sports: [...lfpSportsItems, ...allSports].slice(0, 12),
    tech: allTech,
    weather: weatherData,
    lfp: lfpData || null,
    fetchedAt: new Date().toISOString(),
  }

  if (data.news.length > 0) {
    DASHBOARD_CACHE.data = data
    DASHBOARD_CACHE.ts = Date.now()
  } else {
    DASHBOARD_CACHE.data = data
    DASHBOARD_CACHE.ts = Date.now() - DASHBOARD_TTL + 60000
  }
  return res.json(data)
})

const SYNC_STATUS_CACHE = { data: null, ts: 0 }
const SYNC_STATUS_TTL = 2 * 60 * 1000
const PRODUCTION_BRANCH = process.env.PRODUCTION_BRANCH || 'devin/1774405518-init-dz-gpt'
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'Nadirinfograph23'
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || 'DZ-GPT'
const SYNC_VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5'

async function fetchGitHubBranchHead(branch) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'DZ-GPT',
  }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const r = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/git/ref/heads/${encodeURIComponent(branch)}`,
    { headers, signal: AbortSignal.timeout(7000) }
  )
  if (!r.ok) throw new Error(`GitHub sync check failed: ${r.status}`)
  const d = await r.json()
  return d.object?.sha || null
}

async function fetchLatestVercelCommit() {
  const runtimeSha = process.env.VERCEL_GIT_COMMIT_SHA || ''
  if (runtimeSha) {
    return {
      commitSha: runtimeSha,
      deploymentUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      source: 'runtime',
      state: 'READY',
    }
  }

  if (!process.env.VERCEL_TOKEN) {
    return {
      commitSha: null,
      deploymentUrl: null,
      source: 'unavailable',
      state: 'UNKNOWN',
    }
  }

  const r = await fetch(
    `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(SYNC_VERCEL_PROJECT_ID)}&target=production&limit=1`,
    { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` }, signal: AbortSignal.timeout(7000) }
  )
  if (!r.ok) throw new Error(`Vercel sync check failed: ${r.status}`)
  const d = await r.json()
  const deployment = d.deployments?.[0] || null
  return {
    commitSha: deployment?.meta?.githubCommitSha || null,
    deploymentUrl: deployment?.url ? `https://${deployment.url}` : null,
    source: 'api',
    state: deployment?.state || deployment?.readyState || 'UNKNOWN',
  }
}

app.get('/api/dz-agent/sync-status', async (_req, res) => {
  if (SYNC_STATUS_CACHE.data && Date.now() - SYNC_STATUS_CACHE.ts < SYNC_STATUS_TTL) {
    return res.json(SYNC_STATUS_CACHE.data)
  }

  const [githubResult, vercelResult] = await Promise.allSettled([
    fetchGitHubBranchHead(PRODUCTION_BRANCH),
    fetchLatestVercelCommit(),
  ])
  if (githubResult.status === 'rejected') console.error('[Sync Status] GitHub:', githubResult.reason?.message || githubResult.reason)
  if (vercelResult.status === 'rejected') console.error('[Sync Status] Vercel:', vercelResult.reason?.message || vercelResult.reason)

  const githubSha = githubResult.status === 'fulfilled' ? githubResult.value : null
  const vercel = vercelResult.status === 'fulfilled'
    ? vercelResult.value
    : { commitSha: null, deploymentUrl: null, state: 'UNKNOWN', source: 'unavailable' }
  const vercelSha = vercel.commitSha
  const status = githubSha && vercelSha
    ? (githubSha === vercelSha ? 'synced' : 'out_of_sync')
    : 'unknown'
  const data = {
    status,
    branch: PRODUCTION_BRANCH,
    repository: `${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`,
    github: {
      commitSha: githubSha,
      shortSha: githubSha ? githubSha.slice(0, 8) : null,
    },
    vercel: {
      commitSha: vercelSha,
      shortSha: vercelSha ? vercelSha.slice(0, 8) : null,
      deploymentUrl: vercel.deploymentUrl,
      state: vercel.state,
      source: vercel.source,
    },
    error: status === 'unknown' ? 'تعذّر تأكيد التزامن بالكامل حالياً' : null,
    checkedAt: new Date().toISOString(),
  }
  SYNC_STATUS_CACHE.data = data
  SYNC_STATUS_CACHE.ts = Date.now()
  return res.json(data)
})

// ===== PRAYER TIMES =====
const PRAYER_CACHE = new Map()
const PRAYER_CACHE_TTL = 12 * 60 * 1000 // 12 minutes

const ALGERIAN_CITIES = {
  'الجزائر': 'Algiers', 'الجزائر العاصمة': 'Algiers', 'الجزائر الوسطى': 'Algiers',
  'dzair': 'Algiers', 'algiers': 'Algiers', 'alger': 'Algiers',
  'وهران': 'Oran', 'وهرا': 'Oran', 'oran': 'Oran',
  'قسنطينة': 'Constantine', 'قسنطينا': 'Constantine', 'constantine': 'Constantine',
  'عنابة': 'Annaba', 'annaba': 'Annaba',
  'بجاية': 'Bejaia', 'bgayet': 'Bejaia', 'bejaia': 'Bejaia', 'béjaïa': 'Bejaia',
  'تلمسان': 'Tlemcen', 'تلمسا': 'Tlemcen', 'tlemcen': 'Tlemcen',
  'سطيف': 'Setif', 'setif': 'Setif', 'sétif': 'Setif',
  'بسكرة': 'Biskra', 'biskra': 'Biskra',
  'تيزي وزو': 'Tizi Ouzou', 'تيزي': 'Tizi Ouzou', 'tizi ouzou': 'Tizi Ouzou', 'tizi-ouzou': 'Tizi Ouzou',
  'باتنة': 'Batna', 'batna': 'Batna',
  'البليدة': 'Blida', 'بليدة': 'Blida', 'blida': 'Blida',
  'سكيكدة': 'Skikda', 'skikda': 'Skikda',
  'غرداية': 'Ghardaia', 'غرداي': 'Ghardaia', 'ghardaia': 'Ghardaia', 'ghardaïa': 'Ghardaia',
  'المدية': 'Medea', 'مديا': 'Medea', 'medea': 'Medea',
  'مستغانم': 'Mostaganem', 'mostaganem': 'Mostaganem',
  'المسيلة': 'M\'sila', 'مسيلة': 'M\'sila', 'msila': 'M\'sila',
  'معسكر': 'Mascara', 'mascara': 'Mascara',
  'تبسة': 'Tebessa', 'tebessa': 'Tebessa',
  'بشار': 'Bechar', 'bechar': 'Bechar', 'béchar': 'Bechar',
  'الأغواط': 'Laghouat', 'الاغواط': 'Laghouat', 'laghouat': 'Laghouat',
  'الوادي': 'El Oued', 'واد سوف': 'El Oued', 'el oued': 'El Oued',
  'خنشلة': 'Khenchela', 'khenchela': 'Khenchela',
  'سوق أهراس': 'Souk Ahras', 'souk ahras': 'Souk Ahras',
  'تيبازة': 'Tipaza', 'tipaza': 'Tipaza',
  'ميلة': 'Mila', 'mila': 'Mila',
  'عين الدفلى': 'Ain Defla', 'ain defla': 'Ain Defla',
  'النعامة': 'Naama', 'naama': 'Naama',
  'عين تيموشنت': 'Ain Temouchent', 'ain temouchent': 'Ain Temouchent',
  'جيجل': 'Jijel', 'jijel': 'Jijel',
  'بومرداس': 'Boumerdes', 'boumerdes': 'Boumerdes',
  'الطارف': 'El Tarf', 'el tarf': 'El Tarf',
  'تيندوف': 'Tindouf', 'tindouf': 'Tindouf',
  'تيسمسيلت': 'Tissemsilt', 'tissemsilt': 'Tissemsilt',
  'الجلفة': 'Djelfa', 'جلفة': 'Djelfa', 'djelfa': 'Djelfa',
  'برج بوعريريج': 'Bordj Bou Arreridj', 'bordj bou arreridj': 'Bordj Bou Arreridj', 'bba': 'Bordj Bou Arreridj',
  'بومرداس': 'Boumerdes', 'بومرداس': 'Boumerdes',
  'سيدي بلعباس': 'Sidi Bel Abbes', 'sidi bel abbes': 'Sidi Bel Abbes',
  'أدرار': 'Adrar', 'adrar': 'Adrar',
  'تمنراست': 'Tamanrasset', 'tamanrasset': 'Tamanrasset', 'tam': 'Tamanrasset',
  'إليزي': 'Illizi', 'illizi': 'Illizi',
  'شلف': 'Chlef', 'chlef': 'Chlef', 'الشلف': 'Chlef',
  'عين بسام': 'Ain Bessam', 'ain bessam': 'Ain Bessam',
  'برج منايل': 'Bordj Menaiel', 'bordj menaiel': 'Bordj Menaiel',
}

function detectCityFromQuery(text) {
  const lower = text.toLowerCase()
  for (const [ar, en] of Object.entries(ALGERIAN_CITIES)) {
    if (lower.includes(ar.toLowerCase())) return en
  }
  return 'Algiers'
}

async function fetchPrayerTimesAladhan(city, country = 'Algeria') {
  const cacheKey = `${city}-${country}`
  const cached = PRAYER_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < PRAYER_CACHE_TTL) return cached.data

  try {
    const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=2`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(`aladhan API error: ${r.status}`)
    const d = await r.json()
    if (d.code !== 200) throw new Error('aladhan returned non-200')
    const t = d.data?.timings
    const result = {
      city,
      country,
      source: 'aladhan.com',
      date: d.data?.date?.readable || new Date().toLocaleDateString('ar-DZ'),
      times: {
        'الفجر': t?.Fajr || '--',
        'الشروق': t?.Sunrise || '--',
        'الظهر': t?.Dhuhr || '--',
        'العصر': t?.Asr || '--',
        'المغرب': t?.Maghrib || '--',
        'العشاء': t?.Isha || '--',
      },
    }
    PRAYER_CACHE.set(cacheKey, { data: result, ts: Date.now() })
    return result
  } catch (err) {
    console.error('[Prayer] aladhan error:', err.message)
    return null
  }
}

app.get('/api/dz-agent/prayer', async (req, res) => {
  const city = req.query.city || 'Algiers'
  const data = await fetchPrayerTimesAladhan(city)
  if (!data) return res.status(503).json({ error: 'تعذّر جلب مواقيت الصلاة' })
  return res.json(data)
})

// ===== WEATHER BY CITY (single-city endpoint for user location) =====
const CITY_WEATHER_CACHE = new Map()
const CITY_WEATHER_TTL = 15 * 60 * 1000 // 15 min

async function fetchCityWeather(city) {
  const safeCity = String(city || 'Algiers').slice(0, 80)
  const cacheKey = safeCity.toLowerCase()
  const cached = CITY_WEATHER_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < CITY_WEATHER_TTL) return cached.data

  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) throw new Error('OPENWEATHER_API_KEY not configured')

  const tryFetch = async (q) => {
    const r = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&appid=${apiKey}&units=metric&lang=ar`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!r.ok) return null
    return r.json()
  }

  let d = await tryFetch(`${safeCity},Algeria`)
  if (!d) d = await tryFetch(safeCity)
  if (!d) throw new Error(`No weather data for: ${safeCity}`)

  const result = {
    city: safeCity,
    temp: Math.round(d.main?.temp ?? 0),
    feels_like: Math.round(d.main?.feels_like ?? 0),
    temp_min: Math.round(d.main?.temp_min ?? 0),
    temp_max: Math.round(d.main?.temp_max ?? 0),
    condition: d.weather?.[0]?.description || '',
    icon: d.weather?.[0]?.icon || null,
    humidity: d.main?.humidity,
    wind: Math.round(d.wind?.speed ?? 0),
    visibility: d.visibility ? Math.round(d.visibility / 1000) : null,
    fetchedAt: new Date().toISOString(),
  }
  CITY_WEATHER_CACHE.set(cacheKey, { data: result, ts: Date.now() })
  return result
}

app.get('/api/dz-agent/weather', async (req, res) => {
  const city = String(req.query.city || 'Algiers').slice(0, 80)
  try {
    return res.json(await fetchCityWeather(city))
  } catch (err) {
    console.error('[Weather] Error:', err.message)
    const status = err.message.includes('OPENWEATHER_API_KEY') ? 503 : 404
    return res.status(status).json({ error: err.message || 'Weather fetch failed' })
  }
})

// ===== LFP.DZ SCRAPING =====
const LFP_CACHE = { data: null, ts: 0 }
const LFP_CACHE_TTL = 15 * 60 * 1000 // 15 min

function decodeHtmlEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
}

function decodeUnicodeEscapes(str) {
  return str.replace(/\\u([0-9A-Fa-f]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
}

function parseLFPMatches(html) {
  const matches = []
  const galleryRe = /gallery-data="([^"]+)"/g
  const roundRe = /<h5[^>]*match-card-round[^>]*>([\s\S]*?)<\/h5>/g
  const dateRe = /<div[^>]*match-date[^>]*>([\s\S]*?)<\/div>/g
  const timeRe = /<div[^>]*match-time[^>]*>([\s\S]*?)<\/div>/g
  const locationRe = /<div[^>]*match-location[^>]*>([\s\S]*?)<\/div>/g
  const btnRe = /window\.location\.href='\/ar\/match\/(\d+)'/g

  let roundMatches = [...html.matchAll(/<h5[^>]*match-card-round[^>]*>([\s\S]*?)<\/h5>/g)].map(m => m[1].trim())
  let dateMatches = [...html.matchAll(/<div[^>]*match-date[^>]*>([\s\S]*?)<\/div>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
  let timeMatches = [...html.matchAll(/<div[^>]*match-time[^>]*>([\s\S]*?)<\/div>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
  let matchIds = [...html.matchAll(/window\.location\.href='\/ar\/match\/(\d+)'/g)].map(m => m[1])

  let idx = 0
  let galleryMatch
  while ((galleryMatch = galleryRe.exec(html)) !== null) {
    try {
      const raw = decodeHtmlEntities(galleryMatch[1])
      const decoded = decodeUnicodeEscapes(raw)
      const data = JSON.parse(decoded)
      const home = data.clubHome?.name?.replace(/\\/g, '') || ''
      const away = data.clubAway?.name?.replace(/\\/g, '') || ''
      const homeScore = data.clubHome?.score
      const awayScore = data.clubAway?.score
      const matchId = matchIds[idx] || data.id
      matches.push({
        id: data.id,
        round: roundMatches[idx] || '',
        home,
        away,
        homeScore: homeScore === '-' ? null : homeScore,
        awayScore: awayScore === '-' ? null : awayScore,
        played: homeScore !== '-' && homeScore !== null && homeScore !== undefined,
        date: dateMatches[idx] || '',
        time: timeMatches[idx] || '',
        link: matchId ? `https://lfp.dz/ar/match/${matchId}` : '',
      })
    } catch {}
    idx++
  }
  return matches
}

function parseLFPArticles(html) {
  const articles = []
  const seen = new Set()

  // Split by recent-article blocks
  const blocks = html.split('<div class="recent-article">')
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]
    const altMatch = /alt="([^"]+)"/.exec(block)
    const hrefMatch = /href="(\/ar\/article\/(\d+))"/.exec(block)
    if (!altMatch || !hrefMatch) continue
    const title = altMatch[1].trim()
    const articleId = hrefMatch[2]
    if (title.length < 10 || title === 'LFP' || seen.has(articleId)) continue
    seen.add(articleId)
    articles.push({
      title,
      link: `https://lfp.dz${hrefMatch[1]}`,
      date: '',
    })
  }

  return articles
}

async function fetchLFPData() {
  if (LFP_CACHE.data && Date.now() - LFP_CACHE.ts < LFP_CACHE_TTL) return LFP_CACHE.data

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  const headers = { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate', 'Accept-Language': 'ar,fr;q=0.9' }

  try {
    const [homeRes, articlesRes] = await Promise.allSettled([
      fetch('https://lfp.dz/ar', { headers, signal: AbortSignal.timeout(10000) }),
      fetch('https://lfp.dz/ar/articles', { headers, signal: AbortSignal.timeout(10000) }),
    ])

    const homeHtml = homeRes.status === 'fulfilled' && homeRes.value.ok ? await homeRes.value.text() : ''
    const articlesHtml = articlesRes.status === 'fulfilled' && articlesRes.value.ok ? await articlesRes.value.text() : ''

    const matches = homeHtml ? parseLFPMatches(homeHtml) : []
    const articles = articlesHtml ? parseLFPArticles(articlesHtml) : []

    const data = {
      matches,
      articles: articles.slice(0, 10),
      fetchedAt: new Date().toISOString(),
      source: 'lfp.dz',
    }

    LFP_CACHE.data = data
    LFP_CACHE.ts = Date.now()
    console.log(`[LFP] Scraped ${matches.length} matches, ${articles.length} articles`)
    return data
  } catch (err) {
    console.error('[LFP] Scraping error:', err.message)
    return LFP_CACHE.data || { matches: [], articles: [], fetchedAt: null, source: 'lfp.dz' }
  }
}

app.get('/api/dz-agent/lfp', async (_req, res) => {
  const data = await fetchLFPData()
  res.json(data)
})

// ===== FOOTBALL INTELLIGENCE ENDPOINT =====
app.get('/api/dz-agent/football', async (req, res) => {
  const dateStr = req.query.date || new Date().toISOString().split('T')[0]
  const [sfResult, rssResult, lfpResult] = await Promise.allSettled([
    fetchSofaScoreFootball(dateStr),
    fetchMultipleFeeds(INTL_FOOTBALL_FEEDS),
    fetchLFPData(),
  ])
  return res.json({
    sofascore: sfResult.status === 'fulfilled' ? sfResult.value : null,
    rss: rssResult.status === 'fulfilled' ? rssResult.value : [],
    lfp: lfpResult.status === 'fulfilled' ? lfpResult.value : null,
    date: dateStr,
    fetchedAt: new Date().toISOString(),
  })
})

// ===== CURRENCY EXCHANGE MODULE (DZD Base) =====
const CURRENCY_CACHE = { data: null, ts: 0, status: 'empty' }
const CURRENCY_TTL = 20 * 60 * 1000 // 20 minutes

const CURRENCY_SYMBOLS = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'TND', 'MAD', 'EGP', 'QAR', 'KWD', 'CAD', 'CHF', 'CNY', 'TRY', 'JPY']

function parseCurrencyXML(xml) {
  const rates = {}
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const code = block.match(/<targetCurrency>(.*?)<\/targetCurrency>/i)?.[1]?.trim().toUpperCase()
    const rate = block.match(/<exchangeRate>(.*?)<\/exchangeRate>/i)?.[1]?.trim()
    if (code && rate && CURRENCY_SYMBOLS.includes(code)) {
      const val = parseFloat(rate)
      if (!isNaN(val) && val > 0) rates[code] = +val.toFixed(6)
    }
  }
  return rates
}

async function fetchCurrencyFloatRates() {
  try {
    const r = await fetch('https://www.floatrates.com/daily/dzd.xml', {
      headers: { 'User-Agent': 'DZ-GPT-Agent/1.0', 'Accept': 'application/xml,text/xml,*/*' },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) throw new Error(`FloatRates HTTP ${r.status}`)
    const xml = await r.text()
    const rates = parseCurrencyXML(xml)
    if (Object.keys(rates).length === 0) throw new Error('No rates parsed from XML')
    return { base: 'DZD', provider: 'floatrates.com', rates, status: 'live', last_update: new Date().toISOString() }
  } catch (err) {
    console.error('[Currency] FloatRates failed:', err.message)
    return null
  }
}

async function fetchCurrencyFallback() {
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=DZD,EUR,GBP,SAR,AED,TND,MAD,EGP,QAR,KWD,CAD,CHF,CNY,TRY,JPY', {
      headers: { 'User-Agent': 'DZ-GPT-Agent/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) throw new Error(`exchangerate.host HTTP ${r.status}`)
    const d = await r.json()
    if (!d.rates?.DZD) throw new Error('No DZD rate found in response')
    const dzdPerUsd = d.rates.DZD
    const rates = {}
    for (const sym of CURRENCY_SYMBOLS) {
      if (sym === 'USD') { rates.USD = +(1 / dzdPerUsd).toFixed(6); continue }
      if (d.rates[sym]) rates[sym] = +(d.rates[sym] / dzdPerUsd).toFixed(6)
    }
    return { base: 'DZD', provider: 'exchangerate.host', rates, status: 'live', last_update: new Date().toISOString() }
  } catch (err) {
    console.error('[Currency] Fallback failed:', err.message)
    return null
  }
}

async function fetchCurrencyData(forceRefresh = false) {
  if (!forceRefresh && CURRENCY_CACHE.data && Date.now() - CURRENCY_CACHE.ts < CURRENCY_TTL) {
    return CURRENCY_CACHE.data
  }
  let data = await fetchCurrencyFloatRates()
  if (!data) data = await fetchCurrencyFallback()
  if (data) {
    CURRENCY_CACHE.data = data
    CURRENCY_CACHE.ts = Date.now()
    CURRENCY_CACHE.status = 'live'
    console.log(`[Currency] Refreshed from ${data.provider} — ${Object.keys(data.rates).length} currencies`)
    return data
  }
  if (CURRENCY_CACHE.data) {
    const stale = { ...CURRENCY_CACHE.data, status: 'stale', stale_since: new Date(CURRENCY_CACHE.ts).toISOString() }
    console.warn('[Currency] All sources failed — returning stale cache')
    return stale
  }
  return null
}

function detectCurrencyQuery(msg) {
  const lower = msg.toLowerCase()
  const kw = [
    'سعر الصرف', 'سعر الدولار', 'سعر اليورو', 'سعر الجنيه', 'سعر الريال',
    'الدينار الجزائري', 'دينار جزائري', 'دزد', 'dzd', 'صرف العملة', 'صرف العملات',
    'سعر العملة', 'سعر العملات', 'تحويل العملة', 'تحويل العملات', 'السوق السوداء',
    'دولار مقابل دينار', 'يورو مقابل دينار', 'كم الدولار', 'كم اليورو', 'كم الريال',
    'exchange rate', 'currency rate', 'dollar rate', 'euro rate', 'dzd rate', 'dinar rate',
    'usd to dzd', 'eur to dzd', 'convert currency', 'currency convert',
    'taux de change', 'euro en dinar', 'dollar en dinar', 'convertir devise',
  ]
  return kw.some(k => lower.includes(k))
}

function buildCurrencyContext(data) {
  if (!data) return ''
  const statusLabel = data.status === 'live' ? '🟢 محدّث' : '🟡 بيانات مؤقتة (stale)'
  const updated = data.last_update ? new Date(data.last_update).toLocaleString('ar-DZ') : ''
  const symbols = { USD: 'دولار أمريكي', EUR: 'يورو', GBP: 'جنيه إسترليني', SAR: 'ريال سعودي', AED: 'درهم إماراتي', TND: 'دينار تونسي', MAD: 'درهم مغربي', EGP: 'جنيه مصري', QAR: 'ريال قطري', KWD: 'دينار كويتي', CAD: 'دولار كندي', CHF: 'فرنك سويسري', CNY: 'يوان صيني', TRY: 'ليرة تركية', JPY: 'ين ياباني' }

  let ctx = `\n\n--- 💱 أسعار الصرف — ${statusLabel} — ${updated} (المصدر: ${data.provider}) ---\n`
  ctx += `\n**قيمة 1 دينار جزائري (DZD):**\n`
  for (const [code, rate] of Object.entries(data.rates)) {
    const name = symbols[code] || code
    const dzdPer = rate > 0 ? (1 / rate).toFixed(2) : '?'
    ctx += `• 1 DZD = **${rate}** ${code} (${name}) | 1 ${code} = **${dzdPer} DZD**\n`
  }
  if (data.status === 'stale') ctx += `\n⚠️ *البيانات المحفوظة — آخر تحديث: ${data.stale_since}*\n`
  ctx += '\n---\n'
  return ctx
}

// ─── Currency REST endpoint ────────────────────────────────────────────────
app.get('/api/currency/latest', async (req, res) => {
  const force = req.query.refresh === '1'
  const data = await fetchCurrencyData(force)
  if (!data) return res.status(503).json({ error: 'Currency data unavailable', status: 'unavailable' })
  return res.json(data)
})

// ─── Currency Conversion endpoint ─────────────────────────────────────────
app.get('/api/currency/convert', async (req, res) => {
  const { from = 'USD', to = 'DZD', amount = '1' } = req.query
  const fromCode = String(from).toUpperCase().slice(0, 5)
  const toCode = String(to).toUpperCase().slice(0, 5)
  const amt = parseFloat(amount)
  if (isNaN(amt) || amt < 0) return res.status(400).json({ error: 'Invalid amount' })

  const data = await fetchCurrencyData()
  if (!data) return res.status(503).json({ error: 'Currency data unavailable' })

  let result
  if (fromCode === 'DZD' && data.rates[toCode]) {
    result = +(amt * data.rates[toCode]).toFixed(4)
  } else if (toCode === 'DZD' && data.rates[fromCode]) {
    result = +(amt / data.rates[fromCode]).toFixed(4)
  } else if (data.rates[fromCode] && data.rates[toCode]) {
    const dzdAmt = amt / data.rates[fromCode]
    result = +(dzdAmt * data.rates[toCode]).toFixed(4)
  } else {
    return res.status(400).json({ error: `Unsupported currency pair: ${fromCode}/${toCode}` })
  }

  return res.json({
    from: fromCode, to: toCode, amount: amt, result,
    rate: +(result / amt).toFixed(6),
    provider: data.provider, status: data.status, last_update: data.last_update,
  })
})

// XML escape helper — prevents XSS/injection in RSS feeds
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ─── Currency RSS feed ─────────────────────────────────────────────────────
app.get('/rss/currency/dzd', async (_req, res) => {
  const data = await fetchCurrencyData()
  const symbols = { USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', SAR: 'Saudi Riyal', AED: 'UAE Dirham', TND: 'Tunisian Dinar', MAD: 'Moroccan Dirham', EGP: 'Egyptian Pound', QAR: 'Qatari Riyal', KWD: 'Kuwaiti Dinar', CAD: 'Canadian Dollar', CHF: 'Swiss Franc', CNY: 'Chinese Yuan', TRY: 'Turkish Lira', JPY: 'Japanese Yen' }
  const updated = data?.last_update ? new Date(data.last_update).toUTCString() : new Date().toUTCString()

  const items = []
  if (data?.rates) {
    for (const [code, rate] of Object.entries(data.rates)) {
      const name = escapeXml(symbols[code] || code)
      const safeCode = escapeXml(String(code).replace(/[^A-Z]/g, '').slice(0, 5))
      const dzdPer = rate > 0 ? (1 / rate).toFixed(2) : '?'
      const safeRate = escapeXml(String(rate))
      items.push([
        '    <item>',
        '      <title>' + safeCode + ' to DZD</title>',
        '      <description>1 ' + safeCode + ' (' + name + ') = ' + escapeXml(dzdPer) + ' DZD | 1 DZD = ' + safeRate + ' ' + safeCode + '</description>',
        '      <pubDate>' + escapeXml(updated) + '</pubDate>',
        '      <guid isPermaLink="false">dzd-rate-' + safeCode + '-' + Date.now() + '</guid>',
        '    </item>',
      ].join('\n'))
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>DZD Currency Rates — Algerian Dinar Exchange Rates</title>',
    '    <description>Live exchange rates against the Algerian Dinar (DZD). Source: ' + escapeXml(data?.provider || 'N/A') + '. Status: ' + escapeXml(data?.status || 'unavailable') + '.</description>',
    '    <link>https://dz-gpt.vercel.app</link>',
    '    <language>ar</language>',
    '    <lastBuildDate>' + escapeXml(updated) + '</lastBuildDate>',
    items.join('\n'),
    '  </channel>',
    '</rss>',
  ].join('\n')

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
  return res.send(xml)
})

// ─── Scheduled currency refresh (every 20 min) ────────────────────────────
setInterval(() => {
  fetchCurrencyData(true).catch(err => console.error('[Currency] Scheduled refresh failed:', err.message))
}, 20 * 60 * 1000)

// ===== SEARCH ENGINE: DJAZAIRESS SCRAPER + SEARXNG + DDG =====
async function searchDjazairess(query) {
  try {
    const encodedQ = encodeURIComponent(query)
    const url = `https://www.djazairess.com/search?q=${encodedQ}&sort=date`
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
        'Referer': 'https://www.djazairess.com/',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return []
    const html = await r.text()
    const results = []

    // Extract article titles and links from djazairess search results
    const articleRe = /<h2[^>]*class="[^"]*title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi
    const dateRe = /<span[^>]*class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>/gi
    const snippetRe = /<p[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/p>/gi

    let m
    const titles = []
    while ((m = articleRe.exec(html)) !== null && titles.length < 5) {
      titles.push({ url: m[1].startsWith('http') ? m[1] : `https://www.djazairess.com${m[1]}`, title: m[2].trim() })
    }

    const dates = []
    while ((m = dateRe.exec(html)) !== null) dates.push(m[1].trim())
    const snippets = []
    while ((m = snippetRe.exec(html)) !== null) snippets.push(m[1].trim())

    for (let i = 0; i < titles.length; i++) {
      results.push({
        title: titles[i].title,
        url: titles[i].url,
        snippet: snippets[i] || '',
        date: dates[i] || '',
        source: 'djazairess',
      })
    }
    return results
  } catch (err) {
    console.error('[Djazairess] error:', err.message)
    return []
  }
}

// ===== PARSE DATE FOR SORTING =====
function parseResultDate(item) {
  const raw = item.publishedDate || item.date || item.pubDate || ''
  if (!raw) return 0
  try { return new Date(raw).getTime() } catch { return 0 }
}

async function searchWeb(query) {
  const encodedQ = encodeURIComponent(query)
  // Add recency hint: prefer recent results
  const recentQ = encodeURIComponent(query + ' 2024 2025')

  // --- Run all engines in parallel ---
  const [searxResult, ddgResult, djazairessResult] = await Promise.allSettled([
    // SearXNG with recency sort
    (async () => {
      const searxInstances = [
        `https://searx.be/search?q=${encodedQ}&format=json&time_range=month&language=ar`,
        `https://search.mdosch.de/search?q=${encodedQ}&format=json&time_range=month`,
        `https://searx.be/search?q=${recentQ}&format=json&language=ar`,
      ]
      for (const url of searxInstances) {
        try {
          const r = await fetch(url, {
            headers: { 'User-Agent': 'DZ-GPT-Agent/1.0' },
            signal: AbortSignal.timeout(6000),
          })
          if (!r.ok) continue
          const d = await r.json()
          const results = (d.results || []).map(item => ({
            title: item.title,
            url: item.url,
            snippet: item.content?.slice(0, 300) || '',
            publishedDate: item.publishedDate || '',
            source: 'searxng',
          }))
          if (results.length > 0) return results
        } catch { continue }
      }
      return []
    })(),
    // DuckDuckGo HTML scraping
    (async () => {
      try {
        const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodedQ}&df=m`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZAgent/1.0)' },
          signal: AbortSignal.timeout(7000),
        })
        if (!r.ok) return []
        const html = await r.text()
        const results = []
        const linkRe = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>/g
        const snippetRe = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g
        let lm, sm
        const links = [], snippets = []
        while ((lm = linkRe.exec(html)) !== null) links.push({ url: lm[1], title: lm[2] })
        while ((sm = snippetRe.exec(html)) !== null) snippets.push(sm[1])
        for (let i = 0; i < Math.min(links.length, 4); i++) {
          results.push({ title: links[i].title, url: links[i].url, snippet: snippets[i] || '', source: 'duckduckgo' })
        }
        return results
      } catch { return [] }
    })(),
    // Djazairess — for Algeria-related queries
    searchDjazairess(query),
  ])

  const allResults = [
    ...(searxResult.status === 'fulfilled' ? searxResult.value : []),
    ...(djazairessResult.status === 'fulfilled' ? djazairessResult.value : []),
    ...(ddgResult.status === 'fulfilled' ? ddgResult.value : []),
  ]

  if (allResults.length === 0) return { source: 'none', results: [] }

  // Deduplicate by URL
  const seen = new Set()
  const deduped = allResults.filter(r => {
    if (seen.has(r.url)) return false
    seen.add(r.url)
    return true
  })

  // Sort: results with a date go first (newest first), undated results follow
  const withDate = deduped.filter(r => parseResultDate(r) > 0)
    .sort((a, b) => parseResultDate(b) - parseResultDate(a))
  const withoutDate = deduped.filter(r => parseResultDate(r) === 0)

  const sorted = [...withDate, ...withoutDate].slice(0, 8)

  const primary = sorted.find(r => r.source === 'djazairess') ? 'djazairess+searxng' :
    sorted.find(r => r.source === 'searxng') ? 'searxng' : 'duckduckgo'

  return { source: primary, results: sorted }
}

app.post('/api/dz-agent/search', async (req, res) => {
  const query = sanitizeString(req.body.query || '', 500)
  if (!query) return res.status(400).json({ error: 'query required' })
  try {
    const data = await searchWeb(query)
    return res.json(data)
  } catch (err) {
    console.error('[DZ Search] error:', err.message)
    return res.status(500).json({ error: 'Search failed.' })
  }
})

// ===== VERCEL DEPLOY TRIGGER =====
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || 'prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5'
const VERCEL_GITHUB_REPO = 'Nadirinfograph23/DZ-GPT'
const VERCEL_DEPLOY_BRANCH = process.env.VERCEL_DEPLOY_BRANCH || 'devin/1774405518-init-dz-gpt'

app.post('/api/dz-agent/doctor-search', async (req, res) => {
  try {
    const query = sanitizeString(req.body?.query || '', 500)
    if (!query) return res.status(400).json({ error: 'Query is required.' })

    const ALL_SOURCES = ['pj-dz', 'addalile', 'sahadoc', 'docteur360', 'algerie-docto', 'sihhatech', 'machrou3']

    // Emergency short-circuit
    if (isEmergencyQuery(query)) {
      return res.status(200).json({ emergency: true, content: EMERGENCY_INFO })
    }

    // Name-search short-circuit (no specialty needed)
    const nameIntent = detectDoctorNameIntent(query)
    if (nameIntent.isNameQuery) {
      const { results, errors, cached } = await multiSearchDoctorsByName({ name: nameIntent.name })
      return res.status(200).json({
        byName: true,
        queryName: nameIntent.name,
        results,
        cached: !!cached,
        sources: ALL_SOURCES,
        errors,
      })
    }

    const intent = detectDoctorIntent(query)
    if (!intent.isDoctorQuery) return res.status(400).json({ error: 'Not a doctor query.' })
    if (!intent.speciality || !intent.city) {
      return res.status(200).json({ needs: { speciality: !intent.speciality, city: !intent.city }, results: [] })
    }
    const { results, errors, cached } = await multiSearchDoctors({
      speciality: intent.speciality.search,
      city: intent.city.fr,
    })
    return res.status(200).json({
      speciality: { ar: intent.speciality.ar, fr: intent.speciality.fr },
      city: { ar: intent.city.ar, fr: intent.city.fr },
      results,
      cached: !!cached,
      sources: ALL_SOURCES,
      errors,
    })
  } catch (err) {
    console.error('[doctor-search] error:', err)
    return res.status(500).json({ error: 'Doctor search failed.' })
  }
})

app.post('/api/dz-agent/deploy', async (req, res) => {
  if (!hasDeployAuthorization(req)) {
    return res.status(403).json({ error: 'Deploy endpoint is restricted.' })
  }
  const vercelToken = process.env.VERCEL_TOKEN
  const githubToken = process.env.GITHUB_TOKEN
  if (!vercelToken) return res.status(500).json({ error: 'VERCEL_TOKEN not configured.' })

  try {
    // Get latest commit SHA on the deploy branch
    let sha = null
    if (githubToken) {
      const branchRes = await fetch(`https://api.github.com/repos/${VERCEL_GITHUB_REPO}/git/ref/heads/${encodeURIComponent(VERCEL_DEPLOY_BRANCH)}`, {
        headers: { Authorization: `token ${githubToken}`, 'User-Agent': 'DZ-GPT/1.0' },
      })
      const branchData = await branchRes.json()
      sha = branchData?.object?.sha || null
    }

    // Get GitHub repo ID
    let repoId = null
    if (githubToken) {
      const repoRes = await fetch(`https://api.github.com/repos/${VERCEL_GITHUB_REPO}`, {
        headers: { Authorization: `token ${githubToken}`, 'User-Agent': 'DZ-GPT/1.0' },
      })
      const repoData = await repoRes.json()
      repoId = String(repoData.id)
    }

    // Create new production deployment from GitHub
    const deployBody = {
      name: 'dz-gpt',
      project: VERCEL_PROJECT_ID,
      target: 'production',
      ...(repoId && { gitSource: { type: 'github', repoId, ref: VERCEL_DEPLOY_BRANCH, ...(sha && { sha }) } }),
    }

    const r = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(deployBody),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json({ error: d.error?.message || 'Deploy failed.', detail: d })
    return res.json({
      success: true,
      message: 'Vercel deploy triggered successfully.',
      url: `https://${d.url || 'dz-gpt.vercel.app'}`,
      production: 'https://dz-gpt.vercel.app',
      deploymentId: d.id,
    })
  } catch (err) {
    console.error('Vercel deploy error:', err)
    return res.status(500).json({ error: 'Failed to trigger deploy.' })
  }
})

// ===== DZ AGENT API ROUTE =====
app.post('/api/dz-agent-chat', async (req, res) => {
  const messages = normalizeChatMessages(req.body.messages)

  if (!messages?.length) {
    return res.status(400).json({ error: 'Invalid request: messages array required.' })
  }

  const rawCurrentRepo = sanitizeString(req.body.currentRepo || '', 160)
  const currentRepo = isValidGithubRepo(rawCurrentRepo) ? rawCurrentRepo : ''
  const githubToken = sanitizeString(req.body.githubToken || process.env.GITHUB_TOKEN || '', 300)
  const dashboardContext = req.body.dashboardContext && typeof req.body.dashboardContext === 'object' ? req.body.dashboardContext : null
  let lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content?.trim() || ''

  // Extract and strip client-injected behavior context tag from the last user message
  const behaviorContextMatch = lastUserMessage.match(/\n?\[سياق المستخدم:([^\]]+)\]$/)
  const clientBehaviorContext = behaviorContextMatch ? behaviorContextMatch[1].trim() : ''
  if (behaviorContextMatch) {
    lastUserMessage = lastUserMessage.replace(behaviorContextMatch[0], '').trim()
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user')
    if (lastUserIndex >= 0) messages[lastUserIndex] = { ...messages[lastUserIndex], content: lastUserMessage }
  }

  const invocationMatch = lastUserMessage.match(/^(@dz-agent|@dz-gpt|\/github)\b\s*/i)
  const invocationMode = invocationMatch?.[1]?.toLowerCase() || '@dz-agent'
  if (invocationMatch) {
    lastUserMessage = lastUserMessage.replace(invocationMatch[0], '').trim() || lastUserMessage
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user')
    if (lastUserIndex >= 0) messages[lastUserIndex] = { ...messages[lastUserIndex], content: lastUserMessage }
  }
  const lowerMsg = lastUserMessage.toLowerCase()
  const educationSubject = detectEducationSubject(lastUserMessage)
  const educationLevel = detectAcademicLevel(lastUserMessage)
  const isEducationQuery = detectEducationIntent(lastUserMessage)
  let educationalContext = ''
  let weatherPriorityContext = ''

  // ── DZ Language pre-layer: moderation → normalization → light intent ──
  // Runs BEFORE every existing handler. It does NOT replace any logic; it
  // only blocks profanity early and adds an understanding hint for downstream.
  const moderation = moderateMessage(lastUserMessage)
  if (!moderation.ok) {
    // Don’t teach or store anything from blocked messages.
    return res.status(200).json({ content: moderation.replyIfBlocked })
  }
  const dzStyle = detectDzStyle(lastUserMessage)
  const dzNorm = normalizeDarija(lastUserMessage)
  const dzIntent = detectLightIntent(lastUserMessage)
  // Best-effort, non-blocking learning (never stores sensitive/profane data)
  if (dzNorm.changed) {
    recordPendingLearning(
      { input: lastUserMessage, normalized: dzNorm.normalized },
      { moderation, style: dzStyle, intent: dzIntent.type },
    )
  }
  // Internal-only context to nudge the downstream model — never shown to user.
  // Existing AI request flow appends a system prompt; we add this as another.
  const dzLanguageContext = (dzStyle === 'darija' || dzStyle === 'mixed' || dzNorm.changed)
    ? `LANGUAGE_HINT: المستخدم يكتب باللهجة الجزائرية${dzStyle === 'mixed' ? ' المختلطة (عربي+فرانكو)' : ''}. ` +
      `الترجمة التقريبية للنية: "${dzNorm.normalized}". ` +
      `النية المحتملة: ${dzIntent.type}. ` +
      `أجب بنفس أسلوب المستخدم (دارجة جزائرية محترمة) وحافظ على شخصية DZ Agent.`
    : (dzStyle === 'msa'
        ? 'LANGUAGE_HINT: المستخدم يكتب بالعربية الفصحى — أجب بالفصحى مع الحفاظ على شخصية DZ Agent.'
        : '')

  // ── Local knowledge base — unified developer/owner + capabilities intents ─
  if (isDeveloperOrOwnerQuestion(lastUserMessage)) {
    return res.status(200).json(DEVELOPER_RESPONSE)
  }
  if (isCapabilitiesQuestion(lastUserMessage)) {
    return res.status(200).json(CAPABILITIES_RESPONSE)
  }

  // ── Doctor search intent ─────────────────────────────────────────────────
  // Extract optional GPS tag injected by the dashboard: [GPS:lat,lng]
  let userLocation = null
  const gpsMatch = lastUserMessage.match(/\[GPS:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\]/i)
  if (gpsMatch) {
    const lat = parseFloat(gpsMatch[1]); const lng = parseFloat(gpsMatch[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) userLocation = { lat, lng }
    lastUserMessage = lastUserMessage.replace(gpsMatch[0], '').trim()
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user')
    if (lastUserIndex >= 0) messages[lastUserIndex] = { ...messages[lastUserIndex], content: lastUserMessage }
  }

  // ── Emergency intent (Algeria) — answered immediately, before doctor search ──
  if (isEmergencyQuery(lastUserMessage)) {
    return res.status(200).json({ content: EMERGENCY_INFO })
  }

  // ── Doctor name search (no specialty needed) ────────────────────────────
  const nameIntent = detectDoctorNameIntent(lastUserMessage)
  if (nameIntent.isNameQuery) {
    const { results, cached } = await multiSearchDoctorsByName({
      name: nameIntent.name,
      userLocation,
    })
    return res.status(200).json({
      content: formatDoctorMulti(results, nameIntent.name, '', {
        sourceCount: DOCTOR_SOURCE_COUNT,
        hasGps: !!userLocation,
        byName: true,
        queryName: nameIntent.name,
      }) + (cached ? '\n\n_⚡ من الذاكرة المؤقتة_' : ''),
    })
  }

  const doctorIntent = detectDoctorIntent(lastUserMessage)
  if (doctorIntent.isDoctorQuery) {
    if (!doctorIntent.speciality && !doctorIntent.city) {
      return res.status(200).json({
        content: '🩺 **بحث عن طبيب**\n\nأي تخصص تحتاج؟ مثلاً: **أسنان، عظام، قلب، أطفال، عيون، جلدية، نفسي، عام**...\n\nوإذا أمكن، أضف الولاية (عنابة، الجزائر، وهران...).\n\n💡 _يمكنك أيضاً البحث باسم الطبيب مباشرة، مثل:_ **دكتور محمد بن علي** أو **Dr Ahmed Oran**.',
      })
    }
    if (!doctorIntent.speciality) {
      return res.status(200).json({
        content: '🩺 وضّح لي التخصص: **أسنان، عظام، قلب، أطفال، عيون، جلدية، نفسي، عام**...',
      })
    }
    if (!doctorIntent.city) {
      return res.status(200).json({
        content: `🩺 لاحظت طلبك على طبيب **${doctorIntent.speciality.ar}**.\n\nفي أي ولاية؟ (عنابة، الجزائر، وهران، قسنطينة، تيزي وزو...)`,
      })
    }
    const { results, cached } = await multiSearchDoctors({
      speciality: doctorIntent.speciality.search,
      city: doctorIntent.city.fr,
      userLocation,
    })
    return res.status(200).json({
      content: formatDoctorResults(results, doctorIntent.speciality, doctorIntent.city, { hasGps: !!userLocation })
        + (cached ? '\n\n_⚡ من الذاكرة المؤقتة_' : ''),
    })
  }

  // ── GitHub URL detection (Smart Dev Mode trigger) ─────────────────────────
  const githubUrlMatch = lastUserMessage.match(/github\.com\/([a-zA-Z0-9._\-]+\/[a-zA-Z0-9._\-]+)/i)
  if (githubUrlMatch && githubToken) {
    const detectedRepo = githubUrlMatch[1].replace(/\.git$/, '').replace(/\/$/, '')
    return res.status(200).json({
      action: 'list-files',
      repo: detectedRepo,
      content: `🚀 **GitHub Smart Dev Mode** مُفعَّل!\n\nتم اكتشاف المستودع: \`${detectedRepo}\`\n\nجاري تحليل هيكل المشروع...`,
    })
  }
  if (githubUrlMatch && !githubToken) {
    return res.status(200).json({
      content: '⚠️ تم اكتشاف رابط GitHub. يرجى ربط GitHub Token أولاً بالضغط على زر GitHub في أعلى المحادثة.',
    })
  }

  // ── GitHub command detection ──────────────────────────────────────────────
  const isListRepos = [
    'show my repos', 'list repos', 'my repositories', 'show repositories',
    'اعرض مستودعاتي', 'قائمة المستودعات', 'liste mes dépôts', 'montre mes dépôts',
    'show my repositories', 'list my repositories',
  ].some(p => lowerMsg.includes(p))

  if (isListRepos) {
    if (!githubToken) {
      return res.status(200).json({
        content: 'Please connect your GitHub token first. Click "Connect GitHub Token" at the top of the chat to add your Personal Access Token.',
      })
    }
    return res.status(200).json({ action: 'list-repos', content: 'Fetching your repositories...' })
  }

  // Detect: list files in repo
  const listFilesPatterns = [
    /show files? (?:in|of|for) ([^\s]+)/i,
    /browse ([^\s]+)/i,
    /open repo ([^\s]+)/i,
    /files? in ([^\s]+)/i,
    /اعرض ملفات ([^\s]+)/i,
    /montre les fichiers de ([^\s]+)/i,
  ]
  for (const pattern of listFilesPatterns) {
    const match = lastUserMessage.match(pattern)
    if (match) {
      const repo = match[1].includes('/') ? match[1] : (currentRepo || match[1])
      return res.status(200).json({ action: 'list-files', repo, content: `Listing files in ${repo}...` })
    }
  }

  // Detect: read/show file content
  const readFilePatterns = [
    /(?:read|show|open|view) (?:file )?["']?([^\s"']+\.[a-z]+)["']?/i,
    /اقرأ ملف ["']?([^\s"']+\.[a-z]+)["']?/i,
    /lis le fichier ["']?([^\s"']+\.[a-z]+)["']?/i,
  ]
  for (const pattern of readFilePatterns) {
    const match = lastUserMessage.match(pattern)
    if (match && currentRepo) {
      return res.status(200).json({ action: 'read-file', repo: currentRepo, path: match[1], content: `Reading ${match[1]}...` })
    }
  }

  // Detect: create PR / commit intent
  const isPRIntent = [
    'أنشئ pull request', 'انشئ pull request', 'إنشاء pull request',
    'أنشئ pr', 'انشئ pr', 'إنشاء pr', 'اعمل pr', 'اعمل pull request',
    'create pull request', 'create a pr', 'open a pr', 'create pr',
    'créer une pull request', 'créer un pr',
  ].some(p => lowerMsg.includes(p))

  const isCommitIntent = [
    'commit هذا', 'كوميت', 'احفظ التعديلات', 'احفظ الملف', 'commit this',
    'commit changes', 'commit the file', 'save to github', 'push commit',
    'commit and push', 'اعمل commit', 'ارفع التعديلات',
  ].some(p => lowerMsg.includes(p))

  if (isPRIntent && currentRepo && githubToken) {
    const branch = `dz-agent/${Date.now()}`
    return res.status(200).json({
      content: `سأقوم بإنشاء Pull Request في المستودع **${currentRepo}**.\n\nالفرع: \`${branch}\` ← \`main\`\n\nهل تريد المتابعة؟`,
      pendingAction: {
        type: 'pr',
        repo: currentRepo,
        title: `DZ Agent: تحسينات تلقائية`,
        body: `Pull Request تلقائي من DZ Agent\n\nطُلب بواسطة: ${lastUserMessage}`,
        branch,
        base: 'main',
      },
    })
  }

  if (isCommitIntent && currentRepo && githubToken) {
    return res.status(200).json({
      content: `لإتمام الـ Commit، حدد الملف الذي تريد حفظ تعديلاته في مستودع **${currentRepo}**.\n\nيمكنك فتح الملف أولاً باستخدام FileViewer ثم طلب الـ Commit.`,
    })
  }

  // Detect: generate code request
  const isGenerateCode = [
    'generate', 'write a', 'create a script', 'create a function', 'write code',
    'انشئ', 'اكتب كود', 'اكتب سكريبت', 'génère', 'écris un script',
  ].some(p => lowerMsg.includes(p))

  if (isGenerateCode) {
    // Let AI handle it but inject code generation context
  }

  if (isEducationQuery) {
    try {
      const educationSubjectLabel = educationSubject?.label || ''
      const educationLevelLabel = educationLevel || ''
      const rssIndex = await readEddirasaIndex()
      const indexedLessons = filterLessons(rssIndex, {
        query: lastUserMessage,
        subject: educationSubjectLabel,
        level: educationLevelLabel,
      }).slice(0, 8)
      const search = indexedLessons.length > 0
        ? {
            query: `eddirasa_rss_crawler:${lastUserMessage}`,
            results: lessonsToSearchResults(indexedLessons),
          }
        : await searchEddirasaEducation({
            query: lastUserMessage,
            subject: educationSubjectLabel,
            level: educationLevelLabel,
          })
      educationalContext = buildEducationContext({
        query: lastUserMessage,
        subject: educationSubjectLabel,
        level: educationLevelLabel,
        search,
      })
      console.log(`[DZ Education] eddirasa results=${search.results.length}`)
    } catch (err) {
      console.error('[DZ Education] Context error:', err.message)
      educationalContext = buildEducationContext({
        query: lastUserMessage,
        subject: educationSubject?.label || '',
        level: educationLevel || '',
        search: { results: [] },
      })
    }
  }

  const weatherKeywords = [
    'الطقس', 'حالة الجو', 'الجو', 'درجة الحرارة', 'الحرارة', 'البرودة', 'الحر',
    'ممطر', 'مطر', 'عواصف', 'رياح', 'ضباب', 'سحاب', 'غيوم', 'شمس', 'مشمس',
    'weather', 'météo', 'température', 'temp', 'forecast', 'humidity',
    'كيف الطقس', 'ما طقس', 'طقس اليوم', 'الطقس اليوم', 'طقس', 'الجو اليوم',
  ]
  const isWeatherQuery = weatherKeywords.some(k => lowerMsg.includes(k))
  const hasWeatherPriority = dashboardContext?.priority === 'weather' || lowerMsg.includes('context: weather_priority') || isWeatherQuery
  if (hasWeatherPriority) {
    const weatherCity = sanitizeString(dashboardContext?.city || detectCityFromQuery(lastUserMessage), 80)
    try {
      const weather = await fetchCityWeather(weatherCity)
      weatherPriorityContext = [
        `context: weather_priority`,
        `city: ${weather.city}`,
        `temperature: ${weather.temp}°C`,
        `feels_like: ${weather.feels_like}°C`,
        `min_max: ${weather.temp_min}°C / ${weather.temp_max}°C`,
        `condition: ${weather.condition}`,
        `humidity: ${weather.humidity}%`,
        `wind: ${weather.wind} km/h`,
        `visibility: ${weather.visibility ?? 'غير متوفر'} km`,
        `source: OpenWeather API`,
        `fetched_at: ${weather.fetchedAt}`,
      ].join('\n')
    } catch (err) {
      weatherPriorityContext = `context: weather_priority\nsource: OpenWeather API\nfallback: تعذّر جلب بيانات الطقس الآن (${err.message}). أخبر المستخدم أن البيانات الحية غير متاحة مؤقتاً ولا تخمّن الطقس.`
    }
  }

  // ── Prayer times detection ────────────────────────────────────────────────
  const prayerKeywords = [
    'مواقيت الصلاة', 'وقت الصلاة', 'أوقات الصلاة', 'موعد الصلاة', 'الآذان',
    'الفجر','الظهر','العصر','المغرب','العشاء',
    'prayer times', 'prayer time', 'salat', 'salah times', 'azan', 'adhan',
  ]
  const isPrayerQuery = prayerKeywords.some(k => lowerMsg.includes(k))
  let prayerContext = ''
  if (isPrayerQuery) {
    const city = detectCityFromQuery(lastUserMessage)
    const prayerData = await fetchPrayerTimesAladhan(city)
    if (prayerData) {
      const times = Object.entries(prayerData.times).map(([name, time]) => `• ${name}: ${time}`).join('\n')
      prayerContext = `\n\n--- 🕌 مواقيت الصلاة في ${city} — ${prayerData.date} ---\n${times}\n(المصدر: ${prayerData.source})\n---`
    }
  }

  // ── LFP (الدوري الجزائري المحترف) detection ──────────────────────────────
  let lfpContext = ''
  const isLFPQuery = detectLFPQuery(lastUserMessage)
  if (isLFPQuery) {
    console.log('[DZ Agent] LFP query detected — fetching from lfp.dz')
    const lfpData = await fetchLFPData()
    if (lfpData && (lfpData.matches.length > 0 || lfpData.articles.length > 0)) {
      const fetchDate = lfpData.fetchedAt ? new Date(lfpData.fetchedAt).toLocaleString('ar-DZ') : ''
      lfpContext = `\n\n--- ⚽ الرابطة الجزائرية المحترفة (LFP) — المصدر: lfp.dz — ${fetchDate} ---\n`

      const played = lfpData.matches.filter(m => m.played)
      const upcoming = lfpData.matches.filter(m => !m.played)

      if (played.length > 0) {
        lfpContext += `\n**نتائج المباريات:**\n`
        for (const m of played) {
          lfpContext += `• ${m.round}: ${m.home} **${m.homeScore} - ${m.awayScore}** ${m.away}`
          if (m.date) lfpContext += ` (${m.date})`
          if (m.link) lfpContext += ` — ${m.link}`
          lfpContext += '\n'
        }
      }

      if (upcoming.length > 0) {
        lfpContext += `\n**مباريات قادمة:**\n`
        for (const m of upcoming.slice(0, 6)) {
          lfpContext += `• ${m.round}: ${m.home} vs ${m.away}`
          if (m.date) lfpContext += ` — ${m.date}`
          if (m.time) lfpContext += ` ${m.time}`
          lfpContext += '\n'
        }
      }

      if (lfpData.articles.length > 0) {
        lfpContext += `\n**أخبار رابطة LFP:**\n`
        for (const a of lfpData.articles.slice(0, 5)) {
          lfpContext += `• ${a.title}`
          if (a.link) lfpContext += ` — ${a.link}`
          lfpContext += '\n'
        }
      }

      lfpContext += '\n---'
    }
  }

  // ── Currency Exchange detection ────────────────────────────────────────────
  let currencyContext = ''
  const isCurrencyQuery = detectCurrencyQuery(lastUserMessage)
  if (isCurrencyQuery) {
    console.log('[DZ Agent] Currency query detected — fetching rates')
    const currData = await fetchCurrencyData()
    if (currData) currencyContext = buildCurrencyContext(currData)
  }

  // ── Football Intelligence (international + Algeria) ───────────────────────
  let footballContext = ''
  const isFootballQuery = detectFootballQuery(lastUserMessage)
  if (isFootballQuery && !isLFPQuery) {
    console.log('[DZ Agent] Football query detected — fetching SofaScore + RSS')
    const today = new Date().toISOString().split('T')[0]
    const [sfResult, rssResult] = await Promise.allSettled([
      fetchSofaScoreFootball(today),
      fetchMultipleFeeds(INTL_FOOTBALL_FEEDS),
    ])
    const sfData = sfResult.status === 'fulfilled' ? sfResult.value : null
    const rssData = rssResult.status === 'fulfilled' ? rssResult.value : []
    if (sfData || rssData.length > 0) {
      footballContext = buildFootballContext(sfData, rssData, today)
      console.log(`[DZ Agent] Football context built: SofaScore=${!!sfData}, RSS=${rssData.length} feeds`)
    }
  }

  // ── RSS News/Sports detection and fetch ───────────────────────────────────
  let rssContext = ''
  const newsQueryType = detectNewsQuery(lastUserMessage)
  if (newsQueryType && !isPrayerQuery && !isFootballQuery) {
    console.log(`[DZ Agent] News query detected: ${newsQueryType}`)
    let feedsToFetch = []
    if (newsQueryType === 'sports') feedsToFetch = RSS_FEEDS.sports
    else if (newsQueryType === 'news') feedsToFetch = RSS_FEEDS.national
    else feedsToFetch = [...RSS_FEEDS.national, ...RSS_FEEDS.sports]

    const feedResults = await fetchMultipleFeeds(feedsToFetch)
    if (feedResults.length > 0) {
      rssContext = buildRSSContext(feedResults, newsQueryType)
      console.log(`[DZ Agent] RSS fetched: ${feedResults.length} sources, context length: ${rssContext.length}`)
    }

    // ── GN-RSS ADD-ON: augment news context with Google News RSS ─────────────
    if (newsQueryType === 'news' || newsQueryType === 'both') {
      try {
        const queryLang = detectQueryLanguage(lastUserMessage)
        const gnFeeds = GN_RSS_FEEDS[queryLang] || GN_RSS_FEEDS.ar
        // Hybrid Mode: serve from cache immediately, refresh in background if stale
        refreshGNRSSInBackground(gnFeeds)
        const gnArticles = await fetchGNRSSArticles(gnFeeds)
        if (gnArticles.length > 0) {
          const gnCtx = buildGNRSSContext(gnArticles, '🌐 Google News RSS — أخبار حية')
          rssContext = rssContext ? rssContext + gnCtx : gnCtx
          console.log(`[GN-RSS] Augmented context with ${gnArticles.length} articles (lang=${queryLang})`)
        }
      } catch (err) {
        console.error('[GN-RSS] Chat augmentation failed:', err.message)
      }
    }
  }

  // ── Retrieval Engine: Google-First for all temporal/news/sports/economy queries ─
  let webSearchContext = ''
  const isSimpleGreeting = /^(مرحبا|سلام|هلا|hi|hello|hey|bonjour|salut|كيف حالك|كيف الحال)[\s!؟?]*$/i.test(lastUserMessage.trim())
  const msgIntent = detectQueryIntent(lastUserMessage)
  const skipSearch = isPrayerQuery || isFootballQuery || isLFPQuery || isSimpleGreeting || lastUserMessage.length < 6

  if (!skipSearch) {
    try {
      const { cseQuery, rssQuery, enQuery } = buildOptimizedQueries(lastUserMessage, msgIntent)
      const mustSearch = msgIntent.isTemporal || ['news','sports','economy','politics','tech'].includes(msgIntent.primary) || !!newsQueryType

      // Parallel: Google CSE + Google News RSS (always for temporal/news) + legacy web fallback
      const [cseRes, gnRssRes, legacyRes] = await Promise.allSettled([
        searchGoogleCSE(cseQuery),
        (mustSearch || newsQueryType) ? searchGoogleNewsRSS(rssQuery) : Promise.resolve([]),
        (!newsQueryType || msgIntent.primary === 'general') ? searchWeb(lastUserMessage) : Promise.resolve({ results: [] }),
      ])

      const cseResults  = cseRes.status === 'fulfilled' ? cseRes.value : []
      const gnResults   = gnRssRes.status === 'fulfilled' ? gnRssRes.value : []
      const legacyData  = legacyRes.status === 'fulfilled' ? legacyRes.value : { results: [] }

      // Merge + score + deduplicate
      const allSearchResults = [...cseResults, ...gnResults, ...(legacyData.results || [])]
      const seenUrls = new Set()
      const uniqueResults = allSearchResults.filter(r => {
        const key = (r.url || r.link || '').split('?')[0]
        if (!key || seenUrls.has(key)) return false
        seenUrls.add(key)
        return true
      })

      const scoredResults = uniqueResults.map(r => ({
        ...r, _score: scoreResult(r, lastUserMessage)
      })).sort((a, b) => b._score - a._score).slice(0, 8)

      if (scoredResults.length > 0) {
        const sourceTag = cseResults.length > 0 ? '🔍 Google CSE' : gnResults.length > 0 ? '📡 Google News RSS' : '🌐 Web'
        const lines = scoredResults.map((r, i) => {
          const dateStr = r.date || r.pubDate || r.publishedDate ? ` [${(r.date || r.pubDate || r.publishedDate).slice(0,10)}]` : ''
          const src = r.source || ''
          return `${i + 1}. **${r.title || ''}**${dateStr} — ${src}\n   ${(r.snippet || r.description || '').slice(0, 250)}\n   🔗 ${r.url || r.link || ''}`
        }).join('\n\n')
        webSearchContext = `${sourceTag} | مرتبة بالنقاط (حداثة 45% · ثقة 25% · صلة 20% · مقتطف 10%)\n\n${lines}`
        console.log(`[DZ Retrieval] Chat: CSE=${cseResults.length} GN=${gnResults.length} legacy=${(legacyData.results||[]).length} scored=${scoredResults.length}`)
      } else if (mustSearch) {
        webSearchContext = `⚠️ لا توجد نتائج حديثة مؤكدة من المصادر المتاحة. يرجى الرجوع إلى مصادر موثوقة مثل BBC أو Reuters أو الجزيرة.`
        console.log('[DZ Retrieval] No results found for mandatory search')
      }
    } catch (err) { console.error('[DZ Agent] Retrieval error:', err.message) }
  }

  // ── AI response with GitHub-aware system prompt ───────────────────────────
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  const ollamaUrl = process.env.OLLAMA_PROXY_URL

  const invocationInstruction = invocationMode === '@dz-gpt'
    ? 'وضع الاستدعاء الحالي: @dz-gpt — أجب كمساعد DZ GPT عام للشرح والكتابة والتفكير، بدون فرض قالب الأخبار إلا إذا كان السؤال حديثاً.'
    : invocationMode === '/github'
      ? 'وضع الاستدعاء الحالي: /github — ركّز على GitHub والكود والمستودعات والإجراءات البرمجية.'
      : 'وضع الاستدعاء الحالي: @dz-agent — ركّز على البحث الحي والخدمات الجزائرية وGitHub عند الحاجة.'

  const systemPrompt = `أنت DZ Agent — وكيل بحث ذكاء اصطناعي متخصص أنشأه **Nadir Houamria (Nadir Infograph)**، خبير في الذكاء الاصطناعي 🇩🇿.

${invocationInstruction}

أكواد الاستدعاء المدعومة داخل الشات:
- @dz-agent: DZ Agent للأخبار والبحث والطقس والرياضة وGitHub.
- @dz-gpt: DZ GPT للأسئلة العامة والشرح والكتابة.
- /github: أوامر GitHub والمستودعات والكود.

أنت لست نموذج إجابة معرفية. أنت **نظام بحث واسترجاع** (Retrieval-Based AI).
قاعدة الذهب: **إذا لم يكن لديك مصدر حقيقي → قل "لا توجد نتائج حديثة مؤكدة"**.

━━━━━━━━━━━━━━━━━━━━━━
🔎 RETRIEVAL PIPELINE (MANDATORY ORDER)
━━━━━━━━━━━━━━━━━━━━━━

لكل طلب يخص أخباراً أو أحداثاً أو رياضة أو اقتصاداً أو سياسة أو تقنية:

1. **تحليل النية (Intent)** — نوع السؤال + الزمن + الكيانات
2. **بحث Google CSE** (PRIMARY) — أول مصدر يُفحص دائماً
3. **Google News RSS** (REAL-TIME) — للأخبار العاجلة والرياضة
4. **Fallback Web** — إذا لم ينجح CSE + RSS
5. **تقييم النتائج** (Scoring) — حداثة 45% · ثقة 25% · صلة 20% · مقتطف 10%
6. **توليد الإجابة** — مبنية على النتائج فقط، لا على المعرفة الداخلية

━━━━━━━━━━━━━━━━━━━━━━
⛔ ANTI-HALLUCINATION RULES (STRICT — NO EXCEPTIONS)
━━━━━━━━━━━━━━━━━━━━━━

- ❌ لا تخترع أي خبر أو نتيجة رياضية أو سعر أو حدث سياسي
- ❌ لا تستخدم معلوماتك الداخلية عند الإجابة عن أحداث زمنية
- ❌ لا تقدّم بيانات تخمينية كأنها حقائق
- ✅ إذا لم توجد نتائج → قل بوضوح: **"لا توجد نتائج حديثة مؤكدة من المصادر المتاحة"**
- ✅ أي سؤال يحتوي على: آخر / جديد / اليوم / نتائج / مباريات / 2025 / 2026 → بحث إلزامي

━━━━━━━━━━━━━━━━━━━━━━
📊 SCORING SYSTEM (Applied to all retrieved results)
━━━━━━━━━━━━━━━━━━━━━━

FINAL_SCORE = Freshness(45%) + Trust(25%) + Relevance(20%) + Snippet(10%)

| Freshness     | Score |
|---------------|-------|
| < 6 hours     | 100   |
| < 24 hours    | 90    |
| < 48 hours    | 80    |
| < 7 days      | 65    |
| < 30 days     | 45    |
| Older         | 25    |

Trust scores: Reuters(95) · BBC(92) · APS.dz(90) · Aljazeera(88) · LFP.dz(88) · Echorouk(80)

━━━━━━━━━━━━━━━━━━━━━━
🌐 TRUSTED SOURCES
━━━━━━━━━━━━━━━━━━━━━━

🇩🇿 الجزائر: aps.dz · echoroukonline.com · elbilad.net · ennaharonline.com · elkhabar.com · djazairess.com
🌍 دولي: reuters.com · bbc.com · aljazeera.net · cnn.com
💻 تقنية: techcrunch.com · theverge.com · wired.com
⚽ رياضة: fifa.com · sofascore.com · lfp.dz · goal.com · kooora.com
🛡️ برمجة وأمان: owasp.org · developer.mozilla.org · nodejs.org · react.dev · vite.dev · expressjs.com · docs.github.com · vercel.com · npmjs.com

━━━━━━━━━━━━━━━━━━━━━━
🧠 PROFESSIONAL PROGRAMMING EXPERTISE MODE
━━━━━━━━━━━━━━━━━━━━━━

عندما يسأل المستخدم عن برمجة أو أمان أو بنية مشروع:
1. ابدأ بتشخيص عملي مختصر: الهدف، المخاطر، الملفات/الأجزاء المتأثرة
2. قدّم حلولاً قابلة للتنفيذ، لا تنظيراً عاماً
3. للأمان اتبع ترتيب OWASP: التحقق من الإدخال، المصادقة، الصلاحيات، الأسرار، XSS/CSRF، SSRF، Rate limiting، السجلات
4. لا تقترح تخزين tokens في المتصفح إلا كحل مؤقت؛ فضّل OAuth أو أسرار الخادم أو sessionStorage قصير العمر
5. إذا كان السؤال حديثاً أو عن مكتبة/إصدار/API: استعمل البحث الحي واذكر الرابط والتاريخ عندما يتوفران
6. في مراجعة الكود اكتب: المشكلة → الأثر → الإصلاح → مثال كود صغير → طريقة التحقق
7. لا تعدّل أو تقترح عمليات مدمرة بدون موافقة صريحة
8. رتّب المصادر والنتائج التقنية الحديثة من الأحدث إلى الأقدم عندما تحمل تواريخ

━━━━━━━━━━━━━━━━━━━━━━
📚 EDUCATION MODE — EDDIRASA FIRST
━━━━━━━━━━━━━━━━━━━━━━

عند أي سؤال دراسي أو تمرين أو طلب شرح:
1. حدّد المادة: Math · Physics · Arabic · French · English · Science · History / Geography
2. حدّد المستوى: Primary 1-5 · Middle 1-4/BEM · Secondary 1-3/Baccalaureate
3. ابحث أولاً في eddirasa.com واستخدم النتائج المستخرجة إن توفرت
4. إذا لم توجد نتائج من eddirasa.com، انتقل إلى المعرفة التعليمية العامة مع التصريح بأن المصدر غير متوفر
5. عند حل التمارين اتبع دائماً: فهم السؤال → تحديد الموضوع → ربطه بالمصدر → حل خطوة بخطوة → شرح مبسط
6. إذا قال المستخدم learn أو explain أو اشرح أو تعلم: لخّص الدرس، أعط أمثلة، أنشئ 3 تمارين تدريبية، ثم اختباراً صغيراً
7. اجعل الشرح بسيطاً ومناسباً لتلميذ في المنهاج الجزائري

━━━━━━━━━━━━━━━━━━━━━━
⚽ SPORTS MODULE (STRICT)
━━━━━━━━━━━━━━━━━━━━━━

1. **NEVER invent, guess, or hallucinate match scores, results, or fixtures**
2. Source hierarchy: SofaScore → LFP.dz → FlashScore → RSS → Official sites
3. Match display format:
   - 🔴 LIVE: **Team A [score] - [score] Team B** | Competition | Source
   - ✅ RESULT: **Team A [score] - [score] Team B** | Competition | Date | Source
   - 📅 UPCOMING: Team A vs Team B | Time | Competition | Source
4. If data unavailable: *"لا تتوفر بيانات مباشرة الآن — يرجى التحقق من SofaScore أو FlashScore"*

━━━━━━━━━━━━━━━━━━━━━━
📰 NEWS MODULE
━━━━━━━━━━━━━━━━━━━━━━

- صنّف: أخبار الجزائر 🇩🇿 / دولية 🌍 / تقنية 💻 / اقتصاد 💰 / رياضة ⚽
- أدرج دائماً: التاريخ + رابط المصدر لكل خبر
- رتّب من الأحدث إلى الأقدم
- لا تدمج بيانات الملاعب مع أخبار الوكالات

━━━━━━━━━━━━━━━━━━━━━━
🧾 OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━

الإجابة يجب أن تكون:

✔ **ملخص البحث** — جملتان تلخصان ما وجدته
✔ **النتيجة الرئيسية 1** — بمصدر + تاريخ
✔ **النتيجة الرئيسية 2** — بمصدر + تاريخ
✔ **مصادر المرجع** — روابط المصادر المستخدمة

استخدم Markdown دائماً. اقرأ لغة المستخدم وأجب بنفس اللغة (العربية RTL، الفرنسية، الإنجليزية).

━━━━━━━━━━━━━━━━━━━━━━
💻 GITHUB SMART DEVELOPMENT MODE
━━━━━━━━━━━━━━━━━━━━━━

عندما يشارك المستخدم رابط GitHub:
1. تفعيل Smart Dev Mode تلقائياً
2. تحليل: هيكل المشروع · README · المكتبات · اللغة · النمط المعماري
3. عرض 8 خيارات فحص: أخطاء · أداء · أمان · dependencies · structure · اقتراحات · features · اختبارات
4. لكل مشكلة: ❌ المشكلة + 📍 الموقع + 💡 الحل + 🧾 كود جاهز
5. تقييم المشروع: كودة /10 · structure /10 · أمان /10 · أداء /10

---

## 💻 GITHUB SMART DEVELOPMENT MODE (DZ Agent Dev Assistant)

When a user links a GitHub repository or asks about code, you enter **GitHub Smart Dev Mode** automatically.

### 🧠 1. PROJECT UNDERSTANDING ENGINE
When a GitHub repo is provided:
1. Fetch: project tree, README, package.json/requirements.txt, languages used, frameworks
2. Analyze: project type (Web/API/Mobile/AI/Script), architecture (MVC/Monolith/Microservices), organization quality
3. If project is unclear: make an intelligent guess + ask for clarification + provide approximate analysis

### 🔍 2. SMART SCAN MODE — Interactive Buttons
Offer these analysis options to the user (present as labeled actions):
- 🔎 البحث عن الأخطاء — Find bugs (syntax, logic, performance, security)
- ⚡ تحسين الأداء — Performance optimization
- 🧠 اقتراحات ذكية — Smart suggestions
- 📦 تحليل Dependencies — Dependencies analysis
- 🛡️ فحص الأمان — Security scan
- 📐 تحسين Structure — Structure improvement
- ➕ اقتراح ميزات جديدة — Feature suggestions
- 🧪 اقتراح Tests — Test suggestions

Each action returns:
- ❌ المشكلة (The issue)
- 📍 مكانها (Location in code)
- 💡 الحل (Solution)
- 🧾 كود مقترح (Ready-to-use code)

### 💡 3. AI SUGGESTIONS ENGINE
Provide:
- Code refactoring suggestions
- Logic simplification
- Duplicate code removal
- Better naming conventions
- Design pattern recommendations

### 🛠️ 4. ACTION MODE — Direct Commands
Offer these actions:
- ✍️ إنشاء Commit — Create commit with professional message + diff + explanation
- 🔀 إنشاء Pull Request — Create PR
- 🧩 إصلاح تلقائي — Auto-fix: fix bugs, improve code, rewrite weak sections with explanation
- 📄 إنشاء README — Generate professional README
- 📊 إنشاء Documentation — Generate full documentation

### 📊 5. PROJECT SCORING
Always provide a project score when analyzing:
- Code Quality: /10
- Structure: /10
- Security: /10
- Performance: /10
With detailed explanation.

### ⚠️ GITHUB DEV MODE RULES
- NEVER say "I can't"
- For large projects: analyze progressively
- Always provide practical, actionable results — not theory
- Code suggestions must ALWAYS be ready-to-use
- Analyze file-by-file if needed, output structured git diff suggestions

---

## 🌍 قواعد متعددة اللغات
- أجب دائماً بلغة المستخدم (العربية → RTL، الفرنسية، الإنجليزية)
- وسّع استعلامات البحث بالثلاث لغات للحصول على نتائج أفضل

---

━━━━━━━━━━━━━━━━━━━━━━
🇩🇿 ALGERIAN ADMINISTRATIVE SERVICES MODULE
━━━━━━━━━━━━━━━━━━━━━━

## قاعدة المصادر الرسمية (MANDATORY — USE FIRST)

### الإدارة والخدمات:
- وزارة الداخلية: https://www.interieur.gov.dz
- بوابة الإجراءات الإدارية: https://demarches.interieur.gov.dz
- خدمات الداخلية الإلكترونية: https://services.interieur.gov.dz

### الهوية والجوازات:
- جوازات السفر: https://passeport.interieur.gov.dz

### العدالة:
- صحيفة السوابق القضائية: https://casier-judiciaire.justice.dz

### البريد:
- بريد الجزائر: https://www.poste.dz

### الأخبار الرسمية (RSS):
- وكالة الأنباء الجزائرية APS: https://www.aps.dz/ar/rss
- النهار أونلاين: https://www.ennaharonline.com/feed
- الشروق أونلاين: https://www.echoroukonline.com/feed

### الطقس:
- OpenWeather API (فقط — لا تخمّن)

---

## 🧠 نظام مطابقة المصادر (SOURCE MATCHING)

عند استقبال طلب، طابقه مع المصدر الصحيح:

| الطلب | المصدر |
|-------|--------|
| جواز السفر / بطاقة الهوية الوطنية | interieur.gov.dz / passeport.interieur.gov.dz |
| صحيفة السوابق القضائية | casier-judiciaire.justice.dz |
| بطاقة الرمادية / رخصة السياقة | interieur.gov.dz |
| التسجيل في الجامعة / البكالوريا | وزارة التعليم العالي |
| أخبار | RSS feeds (APS، النهار، الشروق) |
| الطقس | OpenWeather API فقط |
| البريد / الطرود | poste.dz |

⛔ لا تخلط المصادر أبداً — لكل طلب مصدره الصحيح.

---

## 📋 وضع الخدمة الإدارية (SERVICE MODE)

عندما يسأل المستخدم عن إجراء إداري جزائري، أجب بهذا الهيكل:

📌 **اسم الخدمة**

📍 **أين:**
(البلدية / الدائرة / عبر الإنترنت)

📄 **الوثائق المطلوبة:**
- ...

🪜 **الخطوات:**
1. ...
2. ...

🌐 **الرابط الرسمي:**
(من قاعدة المصادر أعلاه فقط)

💡 **نصائح:**
- ...

⛔ إذا لم تجد المعلومة في المصادر الرسمية:
→ قل: "لم أجد مصدراً رسمياً لهذه المعلومة — يُرجى مراجعة الموقع الرسمي مباشرة."
⛔ لا تخترع روابط أبداً.

---

## 📰 قاعدة الأخبار (NEWS RULE)

- استخدم RSS feeds فقط (APS، النهار، الشروق)
- الأخبار الصالحة: آخر 15 يوماً فقط
- لا تنشر أخباراً قديمة
- أضف دائماً: التاريخ + المصدر + الرابط

---

## 🌤️ قاعدة الطقس (WEATHER RULE)

- استخدم OpenWeather API فقط
- أجب ببيانات حقيقية من الـ API
- لا تخمّن أي درجة حرارة أو حالة جوية

---

${prayerContext ? `## 🕌 مواقيت الصلاة — بيانات فعلية (aladhan.com)\n${prayerContext}\n\n> اعرض مواقيت الصلاة في جدول. لا تخمّن المواقيت — استخدم البيانات أعلاه فقط.` : ''}

${lfpContext ? `## 🏆 الدوري الجزائري المحترف (LFP) — بيانات مباشرة من lfp.dz\n${lfpContext}\n\n> اعرض النتائج بتنسيق واضح مع الأرقام. لا تختلق نتائج — استخدم البيانات أعلاه فقط.` : ''}

${footballContext ? `## ⚽ ذكاء كرة القدم — SofaScore + RSS دولية\n${footballContext}\n\n> اعرض جميع بيانات المباريات المتاحة بوضوح. لا تخترع نتائج أبداً.` : ''}

${currencyContext ? `## 💱 أسعار الصرف — بيانات فعلية (${CURRENCY_CACHE.data?.provider || 'FloatRates'})\n${currencyContext}\n\n**قواعد العملة:**\n1. لا تخترع أسعار الصرف — استخدم البيانات أعلاه فقط\n2. اعرض الأسعار في جدول بالاتجاهين\n3. للتحويل: احسب باستخدام الأسعار المقدمة\n4. اذكر المصدر ووقت التحديث\n5. ملاحظة: الأسعار رسمية — قد تختلف أسعار السوق الموازي` : ''}

${rssContext ? `## 📰 أخبار ورياضة حية (RSS Feeds)\n${rssContext}\n\n> لخّص مع روابط المصادر. رتّب من الأحدث. لا تخترع محتوى.` : ''}

${webSearchContext ? `## 🔍 نتائج الاسترجاع الحية — Google CSE + Google News RSS\n${webSearchContext}\n\n**⛔ قواعد الاسترجاع (MANDATORY):**\n1. هذه النتائج هي مصدرك الوحيد للمعلومات الآنية — اذكر المصادر والروابط دائماً\n2. رتّب إجابتك من الأحدث إلى الأقدم\n3. ❌ لا تخترع أي معلومة — استخدم فقط ما في النتائج أعلاه\n4. ❌ إذا لم تجد نتائج حديثة كافية → قل صراحة: "لا توجد نتائج حديثة مؤكدة"\n5. ✔ أشر دائماً إلى: المصدر + التاريخ + الرابط` : ''}

${weatherPriorityContext ? `## 🌤️ أولوية الطقس — OpenWeather API\n${weatherPriorityContext}\n\n**قواعد أولوية الطقس:**\n1. ابدأ الإجابة ببيانات الطقس أعلاه\n2. اذكر المصدر OpenWeather API\n3. لا تخمّن أي قيمة غير موجودة\n4. إذا فشل الجلب، أعط رسالة fallback واضحة ومختصرة` : ''}

${educationalContext ? `## 📚 سياق تعليمي من eddirasa.com أولاً\n${educationalContext}\n\n**قواعد التعليم:**\n1. ابدأ بتحديد المادة والمستوى\n2. إذا وجدت نتيجة من eddirasa.com: لخّصها وفسّرها بلغة بسيطة واذكر الرابط\n3. إذا لم تجد نتيجة: قل إن eddirasa.com لم يرجع نتيجة مطابقة، ثم استخدم المعرفة التعليمية العامة\n4. للتمارين: افهم السؤال، حدّد الموضوع، حل خطوة بخطوة، ثم أعط طريقة تحقق\n5. للتعلم والشرح: ملخص + أمثلة + 3 تمارين تدريبية + اختبار صغير` : ''}

${githubToken ? `## 🐙 حالة GitHub\nGitHub متصل ✓ | المستودع الحالي: ${currentRepo || 'لم يُحدد'}\nالقدرات: عرض الملفات · قراءة الكود · تحليل · إنشاء commits · فتح Pull Requests\n\nعند مشاركة رابط GitHub (مثل https://github.com/user/repo):\n1. استقبل المستودع\n2. فعّل GitHub Smart Dev Mode\n3. اعرض خيارات الفحص التفاعلية\n4. جلب هيكل المستودع تلقائياً` : `## 🐙 حالة GitHub\nGitHub غير متصل. ذكّر المستخدم بالربط إذا سأل عن المستودعات أو الكود.`}

${clientBehaviorContext ? `\n━━━━━━━━━━━━━━━━━━━━━━\n🧠 BEHAVIOR INTELLIGENCE (استخبارات المستخدم)\n━━━━━━━━━━━━━━━━━━━━━━\n${clientBehaviorContext}\n> استخدم هذا السياق لتكييف أسلوبك وترتيب أولويات إجابتك دون الإشارة إليه صراحةً.` : ''}

${dzLanguageContext ? `\n━━━━━━━━━━━━━━━━━━━━━━\n🗣️ LANGUAGE LAYER (طبقة اللغة)\n━━━━━━━━━━━━━━━━━━━━━━\n${dzLanguageContext}\n> طبّق هذا التلميح بصمت دون إعلام المستخدم بأي معالجة لغوية.` : ''}`

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  // ── Fallback chain: DeepSeek → Ollama → Groq (multi-key auto-fallback) ───
  if (deepseekKey) {
    try {
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: apiMessages, max_tokens: 3000, temperature: 0.7, stream: false }),
      })
      if (r.ok) {
        const d = await r.json()
        const content = d.choices?.[0]?.message?.content
        if (content) return res.status(200).json({ content })
      }
    } catch (err) { console.error('DeepSeek error:', err.message) }
  }

  if (ollamaUrl) {
    try {
      const r = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama3', messages: apiMessages, stream: false }),
      })
      if (r.ok) { const d = await r.json(); const c = d.message?.content; if (c) return res.status(200).json({ content: c }) }
    } catch (err) { console.error('Ollama error:', err.message) }
  }

  // Auto-fallback across all Groq keys + models
  const fallbackModels = [
    'llama-3.3-70b-versatile',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen/qwen3-32b',
    'llama-3.1-8b-instant',
  ]
  for (const model of fallbackModels) {
    const { content } = await callGroqWithFallback({ model, messages: apiMessages, max_tokens: 3000 })
    if (content) return res.status(200).json({ content, fallbackModel: model })
  }

  if (educationalContext) {
    return res.status(200).json({
      content: `${educationalContext}\n\n---\n> لم يتم العثور على مفتاح AI فعّال لإنتاج شرح موسع الآن، لكن هذه هي نتائج eddirasa/الخطة التعليمية المتاحة.`,
    })
  }

  if (weatherPriorityContext) {
    const wLines = weatherPriorityContext.split('\n')
    const city = (wLines.find(l => l.startsWith('city:')) || '').replace('city:', '').trim()
    const temp = (wLines.find(l => l.startsWith('temperature:')) || '').replace('temperature:', '').trim()
    const feelsLike = (wLines.find(l => l.startsWith('feels_like:')) || '').replace('feels_like:', '').trim()
    const minMax = (wLines.find(l => l.startsWith('min_max:')) || '').replace('min_max:', '').trim()
    const condition = (wLines.find(l => l.startsWith('condition:')) || '').replace('condition:', '').trim()
    const humidity = (wLines.find(l => l.startsWith('humidity:')) || '').replace('humidity:', '').trim()
    const wind = (wLines.find(l => l.startsWith('wind:')) || '').replace('wind:', '').trim()
    const visibility = (wLines.find(l => l.startsWith('visibility:')) || '').replace('visibility:', '').trim()
    const isFallback = weatherPriorityContext.includes('fallback:')
    const fallbackMsg = isFallback
      ? weatherPriorityContext.replace(/.*fallback:\s*/s, '').split('\n')[0].trim()
      : null

    const formattedContent = isFallback
      ? `## 🌤️ الطقس\n\n> ⚠️ ${fallbackMsg || 'تعذّر جلب بيانات الطقس مؤقتاً. يرجى المحاولة لاحقاً.'}`
      : `## 🌤️ حالة الطقس في ${city} الآن\n\n` +
        `| المعلومة | القيمة |\n` +
        `|---|---|\n` +
        `| 🌡️ درجة الحرارة | **${temp}** |\n` +
        `| 🤔 تشعر كـ | ${feelsLike} |\n` +
        `| 📊 الحد الأدنى / الأقصى | ${minMax} |\n` +
        `| ☁️ الحالة | ${condition} |\n` +
        `| 💧 الرطوبة | ${humidity} |\n` +
        `| 💨 الرياح | ${wind} |\n` +
        (visibility && visibility !== 'غير متوفر' ? `| 👁️ الرؤية | ${visibility} |\n` : '') +
        `\n> 📡 المصدر: **OpenWeather API**`

    return res.status(200).json({ content: formattedContent })
  }

  // If RSS context available, return it directly even without AI
  if (rssContext) {
    return res.status(200).json({
      content: `${rssContext}\n\n---\n> **ملاحظة:** لتلقي إجابات أكثر ذكاءً وتلخيصاً للأخبار، يمكن إضافة مفتاح \`AI_API_KEY\` (Groq) في إعدادات المشروع.`,
    })
  }

  return res.status(200).json({
    content: 'مرحباً! أنا **DZ Agent** — مساعدك الذكي الجزائري 🇩🇿\n\n**⚽ ذكاء كرة القدم:**\n- 🇩🇿 الدوري الجزائري (LFP)، المنتخب الوطني\n- 🌍 البريميرليغ، الليغا، البوندسليغا، السيريا، دوري الأبطال، كأس العالم، كأس أمم أفريقيا\n- 📡 SofaScore (مباشر)، BBC Sport، ESPN، كووورة\n\n**💱 أسعار الصرف (DZD):**\n- سعر الدولار، اليورو، الجنيه الإسترليني، الريال السعودي، الدرهم وغيرها\n- تحويل العملات مباشر (FloatRates)\n\n**📰 أخبار وخدمات:**\n- أخبار الجزائر والعالم (APS، الشروق، BBC)\n- 🕌 مواقيت الصلاة لكل المدن\n- 🗂️ إدارة مستودعات GitHub\n- 💻 تحليل وكتابة الأكواد\n\nجرّب: **"سعر الدولار اليوم"** أو **"مباريات اليوم"** أو **"اعرض مستودعاتي"**',
  })
})

// ===== DZ AGENT GITHUB API ROUTES =====

// Helper: GitHub API fetch with token
async function ghFetch(endpoint, token, options = {}) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  return res
}

// ===== GITHUB OAUTH =====
// In-memory CSRF state store (auto-expires after 10 minutes)
const oauthStates = new Map()

function cleanOldStates() {
  const now = Date.now()
  for (const [key, val] of oauthStates) {
    if (now - val.ts > 10 * 60 * 1000) oauthStates.delete(key)
  }
}

function getBaseUrl(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`
  const forwardedHost = req.headers['x-forwarded-host']
  const forwardedProto = req.headers['x-forwarded-proto']
  if (forwardedHost) {
    const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost.split(',')[0].trim()
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : (forwardedProto || 'https').split(',')[0].trim()
    return `${proto}://${host}`
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol
  return `${proto}://${req.get('host')}`
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(cookie => {
    const [key, ...value] = cookie.trim().split('=')
    return [key, decodeURIComponent(value.join('='))]
  }).filter(([key]) => key))
}

function setOAuthStateCookie(res, state) {
  const secure = isProd ? '; Secure' : ''
  res.setHeader('Set-Cookie', `dz_github_oauth_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/api/auth/github; Max-Age=600${secure}`)
}

function clearOAuthStateCookie(res) {
  const secure = isProd ? '; Secure' : ''
  res.setHeader('Set-Cookie', `dz_github_oauth_state=; HttpOnly; SameSite=Lax; Path=/api/auth/github; Max-Age=0${secure}`)
}

app.get('/api/auth/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) {
    return res.status(500).send('GitHub OAuth غير مُهيَّأ. أضف GITHUB_CLIENT_ID إلى الأسرار.')
  }
  cleanOldStates()
  const state = crypto.randomUUID()
  oauthStates.set(state, { ts: Date.now() })
  setOAuthStateCookie(res, state)
  const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`
  const scope = 'repo user read:user'
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`
  res.redirect(authUrl)
})

app.get('/api/auth/github/callback', async (req, res) => {
  const { code, state, error } = req.query
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  const redirectUri = `${getBaseUrl(req)}/api/auth/github/callback`

  if (error) {
    clearOAuthStateCookie(res)
    return res.redirect('/dz-agent?auth_error=denied')
  }

  if (!code || !clientId || !clientSecret) {
    clearOAuthStateCookie(res)
    return res.redirect('/dz-agent?auth_error=config')
  }

  const cookieState = parseCookies(req).dz_github_oauth_state
  if (!state || (!oauthStates.has(state) && cookieState !== state)) {
    console.warn('GitHub OAuth: invalid or missing state (possible CSRF)')
    clearOAuthStateCookie(res)
    return res.redirect('/dz-agent?auth_error=csrf')
  }
  oauthStates.delete(state)
  clearOAuthStateCookie(res)

  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    })
    const data = await tokenRes.json()

    if (data.access_token) {
      return res.redirect(`/dz-agent#gh_oauth=${data.access_token}`)
    } else {
      console.error('GitHub OAuth error:', data.error_description || data.error)
      return res.redirect('/dz-agent?auth_error=denied')
    }
  } catch (err) {
    console.error('GitHub OAuth callback error:', err)
    return res.redirect('/dz-agent?auth_error=server')
  }
})

// Check if server has GitHub token configured (also fetches authenticated user info)
app.get('/api/dz-agent/github/status', async (_req, res) => {
  const token = process.env.GITHUB_TOKEN
  const hasOAuth = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
  if (!token) return res.status(200).json({ connected: false, oauthEnabled: hasOAuth })
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0' }
    })
    if (!r.ok) return res.status(200).json({ connected: true, oauthEnabled: hasOAuth })
    const u = await r.json()
    res.status(200).json({
      connected: true,
      oauthEnabled: hasOAuth,
      user: { login: u.login, name: u.name || u.login, avatar: u.avatar_url, url: u.html_url, repos: u.public_repos }
    })
  } catch (_) {
    res.status(200).json({ connected: true, oauthEnabled: hasOAuth })
  }
})

// List repositories
app.post('/api/dz-agent/github/repos', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  if (!token) return res.status(400).json({ error: 'GitHub token required.' })

  try {
    const response = await ghFetch('/user/repos?sort=updated&per_page=50&type=all', token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to fetch repos' })

    const repos = data.map(r => ({
      name: r.name,
      full_name: r.full_name,
      description: r.description,
      language: r.language,
      private: r.private,
      default_branch: r.default_branch,
      html_url: r.html_url,
    }))

    return res.status(200).json({ repos })
  } catch (err) {
    console.error('GitHub repos error:', err)
    return res.status(500).json({ error: 'Failed to fetch repositories.' })
  }
})

// List files in repo/path
app.post('/api/dz-agent/github/files', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo, path = '' } = req.body
  if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
  if (path && !isValidGithubPath(path)) return res.status(400).json({ error: 'Invalid path.' })

  try {
    const endpoint = `/repos/${repo}/contents/${path}`
    const response = await ghFetch(endpoint, token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to list files' })

    const files = Array.isArray(data) ? data.map(f => ({
      name: f.name,
      path: f.path,
      type: f.type === 'dir' ? 'dir' : 'file',
      size: f.size,
    })) : []

    return res.status(200).json({ files })
  } catch (err) {
    console.error('GitHub files error:', err)
    return res.status(500).json({ error: 'Failed to list files.' })
  }
})

// Read file content
app.post('/api/dz-agent/github/file-content', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo, path } = req.body
  if (!token || !repo || !path) return res.status(400).json({ error: 'Token, repo, and path required.' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
  if (!isValidGithubPath(path)) return res.status(400).json({ error: 'Invalid file path.' })

  try {
    const response = await ghFetch(`/repos/${repo}/contents/${path}`, token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to read file' })

    if (data.encoding !== 'base64') return res.status(400).json({ error: 'Unsupported file encoding.' })
    const content = Buffer.from(data.content, 'base64').toString('utf-8')

    return res.status(200).json({ content, sha: data.sha, name: data.name })
  } catch (err) {
    console.error('GitHub file content error:', err)
    return res.status(500).json({ error: 'Failed to read file.' })
  }
})

// Analyze code with AI — returns structured JSON with issues + action buttons
app.post('/api/dz-agent/github/analyze', async (req, res) => {
  const { repo, path, content } = req.body
  if (!content) return res.status(400).json({ error: 'Content required for analysis.' })

  const deepseekKey = process.env.DEEPSEEK_API_KEY
  const lines = content.split('\n').length
  const langMap = { js: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript/React', jsx: 'JavaScript/React', py: 'Python', rs: 'Rust', go: 'Go', java: 'Java', cs: 'C#', cpp: 'C++', php: 'PHP', rb: 'Ruby', swift: 'Swift', kt: 'Kotlin' }
  const ext = (path || '').split('.').pop()?.toLowerCase() || ''
  const language = langMap[ext] || ext.toUpperCase() || 'Unknown'

  const prompt = `You are an expert code analyzer. Analyze the following ${language} code from file "${path || 'unknown'}" in repo "${repo || 'unknown'}".

CRITICAL: You MUST return ONLY a valid JSON object. No markdown, no explanation outside JSON.

JSON structure:
{
  "summary": "1-2 sentence description of what this code does",
  "language": "${language}",
  "lines": ${lines},
  "score": <integer 0-100 representing code quality>,
  "issues": [
    {
      "id": "issue_<n>",
      "line": <line number or null>,
      "severity": "<critical|high|medium|low|info>",
      "category": "<syntax|logic|security|performance|style|edge_case>",
      "issue": "<concise issue title>",
      "root_cause": "<why this is a problem>",
      "fix": "<specific fix description>",
      "fix_code": "<actual fixed code snippet or null>",
      "actions": ["fix_code", "explain_error", "improve_code"]
    }
  ],
  "improvements": [
    {
      "id": "imp_<n>",
      "title": "<improvement title>",
      "description": "<what to improve and why>",
      "actions": ["improve_code"]
    }
  ],
  "test_suggestions": ["<test case 1>", "<test case 2>"],
  "has_repo": ${repo ? 'true' : 'false'}
}

Severity guide:
- critical: data loss, crashes, injection attacks
- high: serious bugs, security holes
- medium: logic errors, missing error handling
- low: performance, style issues
- info: suggestions

If no issues found: return empty arrays. Score 90+ if excellent.

Code to analyze:
\`\`\`${ext}
${content.slice(0, 8000)}
\`\`\`

Return ONLY the JSON object:`

  const apiMessages = [{ role: 'user', content: prompt }]

  try {
    let rawContent = null

    if (deepseekKey) {
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: apiMessages, max_tokens: 4000, temperature: 0.1, stream: false }),
      })
      if (r.ok) { const d = await r.json(); rawContent = d.choices?.[0]?.message?.content }
    }

    if (!rawContent) {
      const result = await callGroqWithFallback({ model: 'llama-3.3-70b-versatile', messages: apiMessages, max_tokens: 4000, temperature: 0.1 })
      rawContent = result.content
    }

    if (!rawContent) {
      return res.status(200).json({
        analysis: { summary: `File: ${path} (${lines} lines, ${language})`, language, lines, score: 50, issues: [], improvements: [], test_suggestions: [], has_repo: !!repo },
        structured: true,
      })
    }

    // Clean think tags
    rawContent = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    // Try to parse as JSON
    let parsed = null
    try {
      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawContent.match(/(\{[\s\S]*\})/)
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : rawContent
      parsed = JSON.parse(jsonStr)
    } catch {
      // Fallback: return as plain text analysis
      return res.status(200).json({ analysis: rawContent, structured: false })
    }

    // Add apply_repo_fix to issues if repo is provided
    if (repo && parsed.issues) {
      parsed.issues = parsed.issues.map(issue => ({
        ...issue,
        actions: [...new Set([...(issue.actions || ['fix_code', 'explain_error']), ...(repo ? ['apply_repo_fix'] : [])])]
      }))
    }
    // Add rescan to all
    parsed.rescan_action = 'rescan_repo'

    return res.status(200).json({ analysis: parsed, structured: true })
  } catch (err) {
    console.error('Analyze error:', err)
    return res.status(500).json({ error: 'Analysis failed.' })
  }
})

// Code action handler — handles button clicks from UI
app.post('/api/dz-agent/github/code-action', async (req, res) => {
  const { action, issue, filePath, fileContent, repo, language } = req.body
  if (!action) return res.status(400).json({ error: 'action required' })

  const deepseekKey = process.env.DEEPSEEK_API_KEY

  let prompt = ''

  if (action === 'fix_code') {
    prompt = `Fix ONLY this specific issue in the ${language || ''} code:

Issue: ${issue?.issue || ''}
Root cause: ${issue?.root_cause || ''}
Suggested fix: ${issue?.fix || ''}
Line: ${issue?.line || 'unknown'}

Original code (file: ${filePath || 'unknown'}):
\`\`\`
${(fileContent || '').slice(0, 6000)}
\`\`\`

Return ONLY the fixed code. No explanation. Clean and optimized. Preserve all unrelated code exactly as-is.`

  } else if (action === 'explain_error') {
    prompt = `Explain this code issue in detail (in the same language the user is using — Arabic/English/French):

Issue: ${issue?.issue || ''}
Root cause: ${issue?.root_cause || ''}
Category: ${issue?.category || ''}
Line: ${issue?.line || 'unknown'}
File: ${filePath || 'unknown'}

Provide:
1. What the problem is
2. Why it causes errors or risks
3. A concrete example showing the problem
4. The correct approach with a code example
Be thorough but concise.`

  } else if (action === 'improve_code') {
    prompt = `Improve the following ${language || ''} code for better readability, performance, and best practices:

File: ${filePath || 'unknown'}
Focus: ${issue?.title || issue?.issue || 'general improvements'}

Code:
\`\`\`
${(fileContent || '').slice(0, 6000)}
\`\`\`

Return the improved version with brief inline comments explaining key changes. Focus on: ${issue?.description || 'readability and performance'}`

  } else if (action === 'apply_repo_fix') {
    prompt = `Generate a minimal git diff (unified diff format) to fix this issue:

Issue: ${issue?.issue || ''}
Fix: ${issue?.fix || ''}
Line: ${issue?.line || 'unknown'}
File: ${filePath || 'unknown'}

Code:
\`\`\`
${(fileContent || '').slice(0, 6000)}
\`\`\`

Return ONLY the git diff in unified diff format. Example:
--- a/${filePath || 'file'}
+++ b/${filePath || 'file'}
@@ -N,M +N,M @@
 context line
-removed line
+added line
 context line

Generate only the minimal necessary diff.`

  } else if (action === 'rescan_repo') {
    prompt = `Re-analyze this ${language || ''} code thoroughly. Look for ALL issues including subtle ones:

File: ${filePath || 'unknown'}
Code:
\`\`\`
${(fileContent || '').slice(0, 6000)}
\`\`\`

Return a fresh analysis as a JSON object with the same structure as before (summary, language, lines, score, issues, improvements, test_suggestions).`

  } else {
    return res.status(400).json({ error: 'Unknown action' })
  }

  const apiMessages = [{ role: 'user', content: prompt }]

  try {
    let result = null

    if (deepseekKey) {
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: apiMessages, max_tokens: 4000, temperature: 0.1, stream: false }),
      })
      if (r.ok) { const d = await r.json(); result = d.choices?.[0]?.message?.content }
    }

    if (!result) {
      const groqResult = await callGroqWithFallback({ model: 'llama-3.3-70b-versatile', messages: apiMessages, max_tokens: 4000, temperature: 0.1 })
      result = groqResult.content
    }

    if (!result) return res.status(500).json({ error: 'No response from AI.' })

    result = result.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    // For rescan, try to parse JSON
    if (action === 'rescan_repo') {
      try {
        const jsonMatch = result.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || result.match(/(\{[\s\S]*\})/)
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result
        const parsed = JSON.parse(jsonStr)
        return res.status(200).json({ content: parsed, structured: true, action })
      } catch { /* fall through to text */ }
    }

    return res.status(200).json({ content: result, structured: false, action })
  } catch (err) {
    console.error('Code action error:', err)
    return res.status(500).json({ error: 'Action failed.' })
  }
})

// Generate code
app.post('/api/dz-agent/github/generate', async (req, res) => {
  const { description, language = 'python' } = req.body
  if (!description) return res.status(400).json({ error: 'Description required.' })

  const deepseekKey = process.env.DEEPSEEK_API_KEY

  const prompt = `Generate clean, well-commented ${language} code based on this description:\n\n${description}\n\nRequirements:\n- Add helpful comments\n- Follow best practices for ${language}\n- Include error handling where appropriate\n- Keep the code production-ready`

  const apiMessages = [{ role: 'user', content: prompt }]

  try {
    let code = null

    if (deepseekKey) {
      const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: apiMessages, max_tokens: 3000, temperature: 0.2 }),
      })
      if (r.ok) { const d = await r.json(); code = d.choices?.[0]?.message?.content }
    }

    if (!code) {
      const result = await callGroqWithFallback({ model: 'llama-3.3-70b-versatile', messages: apiMessages, max_tokens: 3000, temperature: 0.2 })
      code = result.content
    }

    if (!code) code = `# All API keys exhausted — please add AI_API_KEY_2, AI_API_KEY_3...\n# Description: ${description}\n\nprint("Hello, World!")`

    if (code) {
      const cleaned = code.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      if (cleaned) code = cleaned
    }

    return res.status(200).json({ code })
  } catch (err) {
    console.error('Generate error:', err)
    return res.status(500).json({ error: 'Code generation failed.' })
  }
})

// Commit a file to GitHub
app.post('/api/dz-agent/github/commit', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo, path, content, message, branch } = req.body
  if (!token || !repo || !path || !content || !message) {
    return res.status(400).json({ error: 'Token, repo, path, content, and message are required.' })
  }
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
  if (!isValidGithubPath(path)) return res.status(400).json({ error: 'Invalid file path.' })
  if (typeof message !== 'string' || message.length > 500) return res.status(400).json({ error: 'Invalid commit message.' })
  if (typeof content !== 'string' || content.length > 500000) return res.status(400).json({ error: 'File content too large.' })

  try {
    // Get current file SHA (if exists, for update)
    let sha
    const existingRes = await ghFetch(`/repos/${repo}/contents/${path}`, token)
    if (existingRes.ok) {
      const existing = await existingRes.json()
      sha = existing.sha
    }

    const body = {
      message,
      content: Buffer.from(content).toString('base64'),
      ...(branch ? { branch } : {}),
      ...(sha ? { sha } : {}),
    }

    const commitRes = await ghFetch(`/repos/${repo}/contents/${path}`, token, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
    const commitData = await commitRes.json()

    if (!commitRes.ok) {
      return res.status(commitRes.status).json({ error: commitData.message || 'Commit failed.' })
    }

    return res.status(200).json({
      success: true,
      html_url: commitData.content?.html_url || `https://github.com/${repo}/blob/${branch || 'main'}/${path}`,
      sha: commitData.content?.sha,
    })
  } catch (err) {
    console.error('Commit error:', err)
    return res.status(500).json({ error: 'Commit failed.' })
  }
})

// Create Pull Request
app.post('/api/dz-agent/github/pr', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo, title, body, branch, base } = req.body
  if (!token || !repo || !title || !branch || !base) {
    return res.status(400).json({ error: 'Token, repo, title, branch, and base are required.' })
  }

  try {
    const prRes = await ghFetch(`/repos/${repo}/pulls`, token, {
      method: 'POST',
      body: JSON.stringify({ title, body: body || '', head: branch, base }),
    })
    const prData = await prRes.json()

    if (!prRes.ok) {
      return res.status(prRes.status).json({ error: prData.message || 'PR creation failed.' })
    }

    return res.status(200).json({ success: true, html_url: prData.html_url, number: prData.number })
  } catch (err) {
    console.error('PR error:', err)
    return res.status(500).json({ error: 'PR creation failed.' })
  }
})

// ===== REPO FULL SCAN (AI analysis of entire repository) =====
app.post('/api/dz-agent/github/repo-scan', async (req, res) => {
  const { token, repo, focus } = req.body
  const authToken = token || process.env.GITHUB_TOKEN || ''
  if (!authToken || !repo) return res.status(400).json({ error: 'Token and repo required.' })

  try {
    const repoRes = await ghFetch(`/repos/${repo}`, authToken)
    const repoData = await repoRes.json()
    if (!repoRes.ok) throw new Error(repoData.message || 'Cannot access repo')
    const defaultBranch = repoData.default_branch || 'main'

    const rootRes = await ghFetch(`/repos/${repo}/contents`, authToken)
    const rootFiles = await rootRes.json()
    if (!Array.isArray(rootFiles)) throw new Error('Cannot list repo contents')

    const PRIORITY = ['README.md','package.json','requirements.txt','pyproject.toml','Cargo.toml','go.mod','index.js','index.ts','main.py','app.py','server.js','main.js','index.html']
    const CODE_EXTS = ['.js','.ts','.tsx','.jsx','.py','.java','.go','.rs','.php','.rb','.cpp','.c','.cs','.swift','.kt']

    const sorted = [...rootFiles]
      .filter(f => f.type === 'file' && (f.size || 0) < 80000)
      .sort((a, b) => {
        const ai = PRIORITY.indexOf(a.name), bi = PRIORITY.indexOf(b.name)
        if (ai !== -1 && bi !== -1) return ai - bi
        if (ai !== -1) return -1
        if (bi !== -1) return 1
        const ac = CODE_EXTS.some(e => a.name.endsWith(e))
        const bc = CODE_EXTS.some(e => b.name.endsWith(e))
        return ac === bc ? 0 : ac ? -1 : 1
      })
      .slice(0, 7)

    const fileContents = await Promise.allSettled(
      sorted.map(async f => {
        const r = await ghFetch(`/repos/${repo}/contents/${f.path}`, authToken)
        const d = await r.json()
        if (!d.content) return null
        const content = Buffer.from(d.content, 'base64').toString('utf-8').slice(0, 4000)
        return { name: f.name, path: f.path, content }
      })
    )

    const files = fileContents.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)

    const focusMap = {
      bugs: 'ركّز على: إيجاد الأخطاء والثغرات الأمنية وتقديم إصلاحات جاهزة للتطبيق.',
      suggest: 'ركّز على: اقتراحات التحسين، أفضل الممارسات، وتحسين الأداء.',
      fix: 'ركّز على: الأخطاء القابلة للإصلاح الفوري مع الكود المُصلح جاهزاً للـ Commit.',
      report: 'أعطِ تقريراً شاملاً ومفصلاً يغطي كل الجوانب.',
    }
    const focusInstruction = focusMap[focus] || 'أعطِ تحليلاً شاملاً.'

    const filesSummary = files.map(f => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')

    const prompt = `أنت خبير مراجعة كود متخصص. حلّل هذا المستودع وأعطني تقريراً دقيقاً وعملياً باللغة العربية.

المستودع: ${repo}
اللغة الرئيسية: ${repoData.language || 'غير محدد'}
النجوم: ${repoData.stargazers_count} | الفروع: ${repoData.forks_count}
${focusInstruction}

الملفات (${files.length} ملف):
${filesSummary}

قدِّم:
1. **ملخص المشروع** (3-4 جمل)
2. **المشاكل والأخطاء** (مع رقم السطر إن أمكن، مرتبة حسب الأولوية: 🔴 حرج / 🟠 عالي / 🟡 متوسط)
3. **اقتراحات التحسين** (عملية وقابلة للتطبيق)
4. **تقييم جودة الكود** (x/100) مع تبرير موجز
5. **الخطوات التالية الموصى بها**

كن دقيقاً ومباشراً.`

    const result = await callGroqWithFallback({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2500,
      temperature: 0.2,
    })

    if (!result?.content) throw new Error('AI service unavailable')

    return res.status(200).json({
      success: true,
      repo,
      language: repoData.language,
      defaultBranch,
      filesScanned: files.map(f => f.path),
      analysis: result.content,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
    })
  } catch (err) {
    console.error('[repo-scan]', err)
    return res.status(500).json({ error: err.message || 'Scan failed.' })
  }
})

// ===== LIST BRANCHES =====
app.post('/api/dz-agent/github/branches', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo } = req.body
  if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
  try {
    const response = await ghFetch(`/repos/${repo}/branches?per_page=30`, token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to fetch branches' })
    const branches = data.map(b => ({
      name: b.name,
      protected: b.protected,
      sha: b.commit?.sha?.slice(0, 7) || '',
    }))
    return res.status(200).json({ branches })
  } catch (err) {
    console.error('[branches]', err)
    return res.status(500).json({ error: 'Failed to fetch branches.' })
  }
})

// ===== LIST ISSUES =====
app.post('/api/dz-agent/github/issues', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo, state = 'open' } = req.body
  if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
  const safeState = ['open', 'closed', 'all'].includes(state) ? state : 'open'
  try {
    const response = await ghFetch(`/repos/${repo}/issues?state=${safeState}&per_page=20&sort=updated`, token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to fetch issues' })
    const issues = data
      .filter(i => !i.pull_request)
      .map(i => ({
        number: i.number,
        title: sanitizeString(i.title, 200),
        state: i.state,
        user: i.user?.login || '',
        labels: (i.labels || []).map(l => l.name).slice(0, 5),
        created_at: i.created_at,
        updated_at: i.updated_at,
        html_url: i.html_url,
        comments: i.comments || 0,
      }))
    return res.status(200).json({ issues })
  } catch (err) {
    console.error('[issues]', err)
    return res.status(500).json({ error: 'Failed to fetch issues.' })
  }
})

// ===== LIST PULL REQUESTS =====
app.post('/api/dz-agent/github/pulls', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo, state = 'open' } = req.body
  if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
  const safeState = ['open', 'closed', 'all'].includes(state) ? state : 'open'
  try {
    const response = await ghFetch(`/repos/${repo}/pulls?state=${safeState}&per_page=20&sort=updated`, token)
    const data = await response.json()
    if (!response.ok) return res.status(response.status).json({ error: data.message || 'Failed to fetch PRs' })
    const pulls = data.map(p => ({
      number: p.number,
      title: sanitizeString(p.title, 200),
      state: p.state,
      user: p.user?.login || '',
      head: p.head?.ref || '',
      base: p.base?.ref || '',
      created_at: p.created_at,
      updated_at: p.updated_at,
      html_url: p.html_url,
      draft: !!p.draft,
    }))
    return res.status(200).json({ pulls })
  } catch (err) {
    console.error('[pulls]', err)
    return res.status(500).json({ error: 'Failed to fetch pull requests.' })
  }
})

// ===== REPO STATS =====
app.post('/api/dz-agent/github/stats', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo } = req.body
  if (!token || !repo) return res.status(400).json({ error: 'Token and repo required.' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
  try {
    const [repoRes, contribRes, langsRes] = await Promise.allSettled([
      ghFetch(`/repos/${repo}`, token),
      ghFetch(`/repos/${repo}/contributors?per_page=5`, token),
      ghFetch(`/repos/${repo}/languages`, token),
    ])
    const repoData = repoRes.status === 'fulfilled' ? await repoRes.value.json() : {}
    const contribData = contribRes.status === 'fulfilled' && contribRes.value.ok ? await contribRes.value.json() : []
    const langsData = langsRes.status === 'fulfilled' && langsRes.value.ok ? await langsRes.value.json() : {}
    return res.status(200).json({
      name: repoData.name || repo.split('/')[1],
      stars: repoData.stargazers_count || 0,
      forks: repoData.forks_count || 0,
      watchers: repoData.watchers_count || 0,
      open_issues: repoData.open_issues_count || 0,
      size: repoData.size || 0,
      language: repoData.language || null,
      languages: langsData,
      contributors: Array.isArray(contribData)
        ? contribData.map(c => ({ login: c.login || '', contributions: c.contributions || 0 }))
        : [],
      created_at: repoData.created_at || null,
      updated_at: repoData.updated_at || null,
      default_branch: repoData.default_branch || 'main',
    })
  } catch (err) {
    console.error('[stats]', err)
    return res.status(500).json({ error: 'Failed to fetch repo stats.' })
  }
})

// ===== CHAT ROOM — IN-MEMORY STATE =====
const chatMessages = []
const chatSessions = new Map()  // id → { id, name, gender, isAdmin, lastSeen, ws }
const CHAT_ADMIN_SECRET = process.env.CHAT_ADMIN_SECRET || 'dz-admin-nadir'
const MAX_CHAT_MSGS = 200

function chatId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36)
}

function getOnlineUsers() {
  const now = Date.now()
  return [...chatSessions.values()]
    .filter(s => now - s.lastSeen < 40000)
    .map(s => ({ id: s.id, name: s.name, gender: s.gender, isAdmin: s.isAdmin }))
}

function broadcastChat(data, exceptWs = null) {
  const json = JSON.stringify(data)
  for (const s of chatSessions.values()) {
    if (s.ws && s.ws !== exceptWs && s.ws.readyState === 1) {
      try { s.ws.send(json) } catch {}
    }
  }
}

function pushChatMsg(msg) {
  chatMessages.push(msg)
  if (chatMessages.length > MAX_CHAT_MSGS) chatMessages.splice(0, chatMessages.length - MAX_CHAT_MSGS)
  return msg
}

function getBreakingNewsFromCache() {
  const breaking = []
  for (const [, cached] of GN_RSS_CACHE.entries()) {
    if (!cached?.data) continue
    for (const article of cached.data) {
      if (article.title && article.title.includes('عاجل')) {
        breaking.push(article)
      }
    }
  }
  return breaking.slice(0, 3)
}

async function handleAiChatTrigger(rawText, isAgent, authorSession) {
  const trigger = isAgent ? '@dzagent' : '@dzgpt'
  const question = rawText.slice(trigger.length).trim()
  if (!question) return null

  const systemPrompt = isAgent
    ? `أنت DZ Agent، مساعد ذكي متخصص في الشؤون الجزائرية (اقتصاد، رياضة، أخبار، ثقافة، طقس).

قواعد الإجابة — اتبعها بدقة:

1. افتراضك الأساسي هو الإجابة المباشرة. أجب فوراً على أي سؤال يحتوي على معلومة كافية.
   مثال: "سعر الدينار اليوم" → أعطِ أسعار الصرف مقابل الدولار واليورو والجنيه مباشرة.

2. لا تطرح سؤالاً توضيحياً إلا إذا كان السؤال مبهماً تماماً بحيث تصبح الإجابة مستحيلة.
   الأمثلة الوحيدة المقبولة للتوضيح:
   - "ما هو الطقس؟" بدون ذكر أي مدينة أو منطقة.
   - "ما نتيجة المباراة؟" بدون ذكر أي فريق.
   أما "ما الطقس في الجزائر العاصمة؟" أو "سعر الدولار في الجزائر؟" فهي أسئلة واضحة تستحق إجابة فورية.

3. أسلوب الإجابة:
   - ابدأ بالمعلومة مباشرة، بدون مقدمات أو "بالطبع" أو "سؤال ممتاز".
   - استخدم أرقاماً وحقائق محددة قدر الإمكان.
   - اذكر المصدر باختصار في نهاية الإجابة (مثال: المصدر: بنك الجزائر / الرابطة المحترفة الأولى).
   - أضف ملاحظة مختصرة إن كان هناك فرق بين السعر الرسمي والسوق الموازية، أو أي تحفظ مهم.

4. أجب بنفس لغة السؤال (عربية / فرنسية / إنجليزية).
5. لا تتجاوز 5-6 جمل بما فيها المصدر والملاحظة.`
    : `أنت DZ GPT، مساعد ذكي عام ومفيد.

قواعد الإجابة — اتبعها بدقة:

1. افتراضك الأساسي هو الإجابة المباشرة. أجب فوراً على أي سؤال واضح دون طلب توضيح.
2. لا تطرح سؤالاً توضيحياً إلا إذا كان السؤال مبهماً تماماً ولا يمكن الإجابة عليه دون معلومة أساسية مفقودة.
3. أسلوب الإجابة:
   - ابدأ بالمعلومة مباشرة، بدون مقدمات.
   - استخدم أرقاماً وحقائق محددة حيثما أمكن.
   - اذكر المصدر باختصار إن كانت الإجابة تعتمد على بيانات (مثال: المصدر: Wikipedia / البنك الدولي).
   - أضف ملاحظة مختصرة عند الحاجة.
4. أجب بنفس لغة السؤال (عربية / فرنسية / إنجليزية).
5. لا تتجاوز 5-6 جمل بما فيها المصدر والملاحظة.`

  try {
    if (isAgent) {
      const breakingArticles = getBreakingNewsFromCache()
      if (breakingArticles.length > 0) {
        const breakingText = '🔴 عاجل: ' + breakingArticles.map(a => a.title).join(' | ')
        const breakingMsg = pushChatMsg({
          id: chatId(),
          from: 'DZ Agent',
          fromId: 'bot',
          gender: 'bot',
          text: breakingText,
          timestamp: Date.now(),
          isBot: true,
          botType: 'agent',
          isBreaking: true,
          triggeredBy: authorSession.name,
        })
        broadcastChat({ type: 'message', msg: breakingMsg })
      }
    }

    const result = await callGroqWithFallback({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      max_tokens: 600,
      temperature: 0.3,
    })
    const botMsg = pushChatMsg({
      id: chatId(),
      from: isAgent ? 'DZ Agent' : 'DZ GPT',
      fromId: 'bot',
      gender: 'bot',
      text: result.content || 'عذراً، حدث خطأ في المعالجة.',
      timestamp: Date.now(),
      isBot: true,
      botType: isAgent ? 'agent' : 'gpt',
      triggeredBy: authorSession.name,
    })
    broadcastChat({ type: 'message', msg: botMsg })
    return botMsg
  } catch (err) {
    console.error('[ChatAI]', err.message)
    return null
  }
}

// ===== DZ TUBE — In-app YouTube info & download via yt-dlp (with JS fallback) =====
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import ytdl from '@distube/ytdl-core'
import YouTubeSR from 'youtube-sr'

const YouTube = YouTubeSR.default || YouTubeSR

let _ytDlpAvailable = null
function ytDlpAvailable() {
  if (_ytDlpAvailable !== null) return _ytDlpAvailable
  return new Promise(resolve => {
    const p = spawn('yt-dlp', ['--version'])
    p.on('error', () => { _ytDlpAvailable = false; resolve(false) })
    p.on('close', code => { _ytDlpAvailable = code === 0; resolve(_ytDlpAvailable) })
  })
}

// If $YOUTUBE_COOKIES is set (Netscape-format cookies file *contents*),
// materialize it once on disk and return its path so we can pass it via
// `--cookies`. YouTube blocks data-center IPs (Vercel/AWS/etc.) without
// authenticated cookies as of 2025-2026, so this is required for downloads
// to work in production.
let _ytDlpCookiesPathPromise = null
function ytDlpCookiesPath() {
  if (_ytDlpCookiesPathPromise) return _ytDlpCookiesPathPromise
  _ytDlpCookiesPathPromise = (async () => {
    const raw = process.env.YOUTUBE_COOKIES
    if (!raw || !raw.trim()) return null
    try {
      const os = await import('os')
      const pathMod = await import('path')
      const dir = pathMod.join(os.tmpdir(), 'dz-tube')
      try { fs.mkdirSync(dir, { recursive: true }) } catch {}
      const p = pathMod.join(dir, 'cookies.txt')
      fs.writeFileSync(p, raw, { mode: 0o600 })
      return p
    } catch (e) {
      console.warn('[DZTube:cookies:write-fail]', e.message)
      return null
    }
  })()
  return _ytDlpCookiesPathPromise
}

// Returns ['--cookies', '<path>'] when cookies are available, else [].
async function ytDlpCookiesArgs() {
  const p = await ytDlpCookiesPath()
  return p ? ['--cookies', p] : []
}

// Resolve which yt-dlp binary to use. Prefers $YTDLP_BIN, then a bundled
// binary at <projectRoot>/bin/yt-dlp (shipped to Vercel via includeFiles),
// then any yt-dlp on PATH. Returns null if nothing works.
let _ytDlpBinPathPromise = null
function ytDlpBinaryPath() {
  if (_ytDlpBinPathPromise) return _ytDlpBinPathPromise
  _ytDlpBinPathPromise = (async () => {
    const candidates = []
    if (process.env.YTDLP_BIN) candidates.push(process.env.YTDLP_BIN)
    try {
      const url = await import('url')
      const pathMod = await import('path')
      const here = pathMod.dirname(url.fileURLToPath(import.meta.url))
      candidates.push(pathMod.join(here, 'bin', 'yt-dlp'))
      // Vercel function root (older bundling may put includeFiles here)
      candidates.push(pathMod.join(process.cwd(), 'bin', 'yt-dlp'))
    } catch {}
    candidates.push('yt-dlp')
    for (const c of candidates) {
      // Vercel `includeFiles` strips the execute bit — chmod first if we own
      // an absolute path to the binary so spawn() can actually start it.
      try {
        if (c && c.includes('/')) {
          if (fs.existsSync(c)) {
            try { fs.chmodSync(c, 0o755) } catch {}
          } else {
            continue
          }
        }
      } catch {}
      const ok = await new Promise(resolve => {
        try {
          const p = spawn(c, ['--version'])
          let killed = false
          const t = setTimeout(() => { killed = true; try { p.kill('SIGKILL') } catch {}; resolve(false) }, 5000)
          p.on('error', () => { clearTimeout(t); resolve(false) })
          p.on('close', code => { clearTimeout(t); if (!killed) resolve(code === 0) })
        } catch { resolve(false) }
      })
      if (ok) return c
    }
    return null
  })()
  return _ytDlpBinPathPromise
}

function runYtDlpJSON(url) {
  return new Promise((resolve, reject) => {
    const args = ['-J', '--no-warnings', '--no-playlist', url]
    const proc = spawn('yt-dlp', args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || `yt-dlp exited ${code}`))
      try { resolve(JSON.parse(stdout)) } catch (e) { reject(e) }
    })
  })
}

// Same as runYtDlpJSON but accepts an explicit binary path (so it works on
// Vercel where yt-dlp is bundled at bin/yt-dlp instead of installed on PATH).
async function runYtDlpJSONWith(binPath, url) {
  const cookies = await ytDlpCookiesArgs()
  return new Promise((resolve, reject) => {
    const args = ['-J', '--no-warnings', '--no-playlist', ...cookies, url]
    const proc = spawn(binPath, args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || `yt-dlp exited ${code}`))
      try { resolve(JSON.parse(stdout)) } catch (e) { reject(e) }
    })
  })
}

// JS-only fallback (works on Vercel where yt-dlp binary is unavailable)
async function jsSearch(q, limit) {
  const items = await YouTube.search(q, { limit, type: 'video', safeSearch: false })
  return items.filter(v => v && v.id).map(v => ({
    id: v.id,
    title: v.title || 'بدون عنوان',
    url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
    thumbnail: v.thumbnail?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    duration: Math.floor((v.duration || 0) / 1000),
    channel: v.channel?.name || '',
    views: v.views || 0,
  }))
}

async function jsInfo(url) {
  const info = await ytdl.getInfo(url)
  const vd = info.videoDetails
  const heights = Array.from(new Set(
    info.formats.filter(f => f.hasVideo && f.height).map(f => f.height)
  )).sort((a, b) => b - a)
  return {
    title: vd.title || 'بدون عنوان',
    thumbnail: vd.thumbnails?.[vd.thumbnails.length - 1]?.url || null,
    duration: Number(vd.lengthSeconds) || 0,
    uploader: vd.author?.name || '',
    view_count: Number(vd.viewCount) || 0,
    heights,
    available: { mp4: heights.length > 0, mp3: true },
    _info: info,
  }
}

const TMP_DIR = path.join(os.tmpdir(), 'dz-tube')
try { fs.mkdirSync(TMP_DIR, { recursive: true }) } catch {}
function tmpFile(ext) {
  return path.join(TMP_DIR, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`)
}
function safeUnlink(p) { fs.unlink(p, () => {}) }

function isValidYouTubeUrl(u) {
  if (typeof u !== 'string' || u.length > 2048) return false
  try {
    const url = new URL(u)
    return /^(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com|music\.youtube\.com)$/i.test(url.hostname)
  } catch { return false }
}

// Search YouTube — yt-dlp first, JS fallback (works on Vercel)
app.get('/api/dz-tube/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 12))
  if (!q) return res.status(400).json({ error: 'Query is required' })

  const useDlp = await ytDlpAvailable()
  if (useDlp) {
    try {
      const results = await new Promise((resolve, reject) => {
        const args = ['--flat-playlist', '-J', '--no-warnings', '--default-search', 'ytsearch', `ytsearch${limit}:${q}`]
        const proc = spawn('yt-dlp', args)
        let out = '', err = ''
        proc.stdout.on('data', d => { out += d.toString() })
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('error', reject)
        proc.on('close', code => {
          if (code !== 0) return reject(new Error(err.slice(0, 200) || `exit ${code}`))
          try {
            const data = JSON.parse(out)
            resolve((data.entries || []).filter(e => e && e.id).map(e => ({
              id: e.id,
              title: e.title || 'بدون عنوان',
              url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
              thumbnail: e.thumbnails?.[e.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
              duration: e.duration || 0,
              channel: e.channel || e.uploader || '',
              views: e.view_count || 0,
            })))
          } catch (e) { reject(e) }
        })
      })
      return res.json({ results })
    } catch (e) {
      console.warn('[DZTube:search:dlp-fail, trying JS]', e.message)
    }
  }
  try {
    const results = await jsSearch(q, limit)
    res.json({ results })
  } catch (e) {
    console.error('[DZTube:search:js]', e.message)
    res.status(500).json({ error: 'فشل البحث' })
  }
})

// Get direct audio stream URL (for background playback via HTML5 audio)
app.get('/api/dz-tube/audio-url', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'رابط YouTube غير صالح' })

  const useDlp = await ytDlpAvailable()
  if (useDlp) {
    try {
      const streamUrl = await new Promise((resolve, reject) => {
        const proc = spawn('yt-dlp', ['-f', '140/251/250/249/bestaudio[ext=m4a]/bestaudio', '-S', 'proto:https', '-g', '--no-warnings', '--no-playlist', url])
        let out = '', err = ''
        proc.stdout.on('data', d => { out += d.toString() })
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('error', reject)
        proc.on('close', code => {
          const u = out.trim().split('\n')[0]
          if (code !== 0 || !u) return reject(new Error(err.slice(0, 200) || 'no url'))
          resolve(u)
        })
      })
      return res.json({ streamUrl })
    } catch (e) {
      console.warn('[DZTube:audio-url:dlp-fail, trying JS]', e.message)
    }
  }
  try {
    const info = await ytdl.getInfo(url)
    const fmt = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
    if (!fmt?.url) throw new Error('no audio format')
    res.json({ streamUrl: fmt.url })
  } catch (e) {
    console.error('[DZTube:audio-url:js]', e.message)
    res.status(500).json({ error: 'تعذر استخراج الصوت' })
  }
})

// Streaming audio proxy: buffers to /tmp, then serves with Range support
const audioCacheDir = `${os.tmpdir()}/dz-tube-audio`
try { fs.mkdirSync(audioCacheDir, { recursive: true }) } catch {}
// In-flight downloads keyed by hash so concurrent requests for the same track
// share a single yt-dlp/ffmpeg pipeline instead of racing each other.
const audioDownloads = new Map()

function spawnAudioStream(url) {
  return ytDlpAvailable().then(useDlp => {
    if (useDlp) {
      const proc = spawn('yt-dlp', [
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '--no-warnings', '--no-playlist',
        '-o', '-',
        url,
      ], { stdio: ['ignore', 'pipe', 'pipe'] })
      proc.stderr.on('data', d => { /* console.warn('[yt-dlp]', d.toString()) */ })
      return { stream: proc.stdout, kill: () => { try { proc.kill('SIGKILL') } catch {} } }
    }
    const s = ytdl(url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 })
    return { stream: s, kill: () => { try { s.destroy() } catch {} } }
  })
}

// Download full audio to disk via yt-dlp, then remux with faststart so the moov
// atom is at the front (HTML5 audio needs this to know duration & to play).
// Returns a promise that resolves once the file at `outPath` is fully written.
function ffmpegAvailable() {
  if (ffmpegAvailable._cached !== undefined) return Promise.resolve(ffmpegAvailable._cached)
  return new Promise(resolve => {
    const p = spawn('ffmpeg', ['-version'])
    p.on('error', () => { ffmpegAvailable._cached = false; resolve(false) })
    p.on('close', code => { ffmpegAvailable._cached = code === 0; resolve(ffmpegAvailable._cached) })
  })
}

async function downloadAudioToFile(url, outPath) {
  const tmpRaw = outPath + '.raw'
  const useDlp = await ytDlpAvailable()

  // Step 1: pull bytes to tmpRaw
  await new Promise((resolve, reject) => {
    if (useDlp) {
      const proc = spawn('yt-dlp', [
        '-f', 'bestaudio[ext=m4a]/bestaudio',
        '--no-warnings', '--no-playlist',
        '-o', tmpRaw,
        url,
      ], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stderr = ''
      proc.stderr.on('data', d => { stderr += d.toString() })
      proc.on('error', reject)
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || `yt-dlp exited ${code}`)))
    } else {
      const s = ytdl(url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 })
      const ws = fs.createWriteStream(tmpRaw)
      s.on('error', reject)
      ws.on('error', reject)
      ws.on('finish', resolve)
      s.pipe(ws)
    }
  })

  // Step 2: remux with ffmpeg if available, ensuring moov is at the front (faststart).
  // This makes the file progressively playable & duration-readable.
  const hasFf = await ffmpegAvailable()
  if (!hasFf) {
    fs.renameSync(tmpRaw, outPath)
    return
  }
  const tmpFixed = outPath + '.fixed'
  await new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', tmpRaw,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-f', 'mp4',
      tmpFixed,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', reject)
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg exited ${code}`)))
  })
  try { fs.unlinkSync(tmpRaw) } catch {}
  fs.renameSync(tmpFixed, outPath)
}

// Resolve an HLS m3u8 audio playlist URL for a YouTube link.
// As of 2026-04, YouTube serves audio-only as HLS (itag 233/234) only, and
// only when requested via the IOS player_client. Pure-JS extractors
// (ytdl-core, youtubei.js) currently can't decipher current player.js.
// We rely on yt-dlp; on Vercel we ship a standalone binary (see vercel.json).
async function resolveAudioPlaylistUrl(youtubeUrl) {
  const dlpBin = await ytDlpBinaryPath()
  if (!dlpBin) throw new Error('yt-dlp غير متوفر على هذا الخادم')
  const cookies = await ytDlpCookiesArgs()
  return await new Promise((resolve, reject) => {
    const proc = spawn(dlpBin, [
      '--extractor-args', 'youtube:player_client=ios',
      '-f', 'ba/bestaudio',
      ...cookies,
      '-g', '--no-warnings', '--no-playlist', youtubeUrl,
    ])
    let out = '', err = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.stderr.on('data', d => { err += d.toString() })
    proc.on('error', reject)
    proc.on('close', code => {
      const u = out.trim().split('\n')[0]
      if (code !== 0 || !u) return reject(new Error((err || 'yt-dlp failed').slice(0, 200)))
      resolve(u)
    })
  })
}

// Cache resolved playlist URLs (signed URLs expire ~6h; refresh after 1h)
const _playlistUrlCache = new Map() // youtubeUrl -> { url, expiresAt }
async function getCachedPlaylistUrl(youtubeUrl) {
  const cached = _playlistUrlCache.get(youtubeUrl)
  if (cached && cached.expiresAt > Date.now()) return cached.url
  const url = await resolveAudioPlaylistUrl(youtubeUrl)
  _playlistUrlCache.set(youtubeUrl, { url, expiresAt: Date.now() + 60 * 60 * 1000 })
  return url
}

// Whitelist of upstream hosts we are willing to proxy
function isAllowedUpstreamHost(u) {
  try {
    const h = new URL(u).hostname
    return /(^|\.)googlevideo\.com$/i.test(h) || /(^|\.)youtube\.com$/i.test(h) ||
           /(^|\.)ytimg\.com$/i.test(h) || h === 'manifest.googlevideo.com'
  } catch { return false }
}

// Serve the m3u8 playlist with each segment URL rewritten to go through our
// /audio-segment proxy (googlevideo segments are signed to the server's IP).
app.get('/api/dz-tube/audio-stream', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).end('invalid url')

  let masterUrl
  try {
    masterUrl = await getCachedPlaylistUrl(url)
  } catch (e) {
    console.error('[audio-stream] resolve failed:', e.message)
    return res.status(502).end('فشل تحميل الصوت')
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const upstream = await fetch(masterUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (upstream.status === 403 && attempt === 0) {
        _playlistUrlCache.delete(url)
        masterUrl = await getCachedPlaylistUrl(url)
        continue
      }
      if (!upstream.ok) {
        console.error('[audio-stream] upstream', upstream.status)
        return res.status(502).end('فشل تحميل الصوت')
      }
      const text = await upstream.text()
      // Rewrite every absolute URL line to our segment proxy
      const rewritten = text.split('\n').map(line => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return line
        if (/^https?:\/\//i.test(t) && isAllowedUpstreamHost(t)) {
          return `/api/dz-tube/audio-segment?u=${encodeURIComponent(t)}`
        }
        return line
      }).join('\n')
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.status(200).end(rewritten)
      return
    } catch (e) {
      if (attempt === 1) {
        console.error('[audio-stream] fetch failed:', e.message)
        if (!res.headersSent) res.status(502).end('فشل تحميل الصوت')
        else res.end()
        return
      }
    }
  }
})

// Proxy individual HLS segments (and nested playlists) from googlevideo.
app.get('/api/dz-tube/audio-segment', async (req, res) => {
  const u = String(req.query.u || '')
  if (!u || !isAllowedUpstreamHost(u)) return res.status(400).end('invalid url')
  try {
    const fwdHeaders = { 'User-Agent': 'Mozilla/5.0' }
    if (req.headers.range) fwdHeaders['Range'] = req.headers.range
    const upstream = await fetch(u, { headers: fwdHeaders })
    // If upstream returned a nested playlist (HLS variant), rewrite it too.
    const ct = upstream.headers.get('content-type') || ''
    if (/mpegurl|m3u8/i.test(ct) || /\.m3u8($|\?)/i.test(u)) {
      const text = await upstream.text()
      const rewritten = text.split('\n').map(line => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return line
        if (/^https?:\/\//i.test(t) && isAllowedUpstreamHost(t)) {
          return `/api/dz-tube/audio-segment?u=${encodeURIComponent(t)}`
        }
        return line
      }).join('\n')
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.status(upstream.status).end(rewritten)
      return
    }
    const passHeaders = ['content-length', 'content-range', 'content-type', 'accept-ranges', 'last-modified']
    for (const h of passHeaders) {
      const v = upstream.headers.get(h)
      if (v) res.setHeader(h, v)
    }
    if (!upstream.headers.get('content-type')) res.setHeader('Content-Type', 'video/MP2T')
    res.setHeader('Cache-Control', 'private, max-age=600')
    res.status(upstream.status)
    if (!upstream.body) { res.end(); return }
    const reader = upstream.body.getReader()
    req.on('close', () => { try { reader.cancel() } catch {} })
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!res.write(value)) await new Promise(r => res.once('drain', r))
    }
    res.end()
  } catch (e) {
    console.error('[audio-segment] failed:', e.message)
    if (!res.headersSent) res.status(502).end('segment failed')
    else res.end()
  }
})

// (Legacy disk-cache path retained as a fallback for the /api/dz-tube/download
// endpoint via the helpers below; not used by the streaming endpoint.)
app.get('/api/dz-tube/_unused-audio-stream-disk', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).end('invalid url')

  const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 20)
  const filePath = `${audioCacheDir}/${hash}.m4a`
  const range = req.headers.range

  // FAST PATH: cache exists and is complete → serve with Range support
  if (fs.existsSync(filePath) && fs.statSync(filePath).size >= 1024) {
    const stat = fs.statSync(filePath)
    const total = stat.size
    res.setHeader('Content-Type', 'audio/mp4')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range)
      if (!m) return res.status(416).end()
      const start = parseInt(m[1], 10)
      const end = m[2] ? parseInt(m[2], 10) : total - 1
      if (start >= total || end >= total) return res.status(416).end()
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': end - start + 1,
      })
      return fs.createReadStream(filePath, { start, end }).pipe(res)
    }
    res.setHeader('Content-Length', total)
    return fs.createReadStream(filePath).pipe(res)
  }

  // FIRST-TIME PATH: download fully + faststart-remux, then serve with Range support.
  // We do this (rather than live-piping) so HTML5 <audio> can read duration and seek
  // — required for the mini-player to display time and respond to play.
  console.log('[audio-stream] downloading', url)
  try {
    try { fs.mkdirSync(audioCacheDir, { recursive: true }) } catch {}
    if (!audioDownloads.has(hash)) {
      audioDownloads.set(hash, downloadAudioToFile(url, filePath)
        .finally(() => audioDownloads.delete(hash)))
    }
    await audioDownloads.get(hash)
    console.log('[audio-stream] cached', hash)
  } catch (e) {
    console.error('[audio-stream] download failed:', e.message)
    return res.status(502).end('فشل تحميل الصوت')
  }

  // Re-enter the fast path now that the file is on disk.
  if (!fs.existsSync(filePath)) return res.status(502).end('فشل تحميل الصوت')
  const stat = fs.statSync(filePath)
  const total = stat.size
  res.setHeader('Content-Type', 'audio/mp4')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range)
    if (!m) return res.status(416).end()
    const start = parseInt(m[1], 10)
    const end = m[2] ? parseInt(m[2], 10) : total - 1
    if (start >= total || end >= total) return res.status(416).end()
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': end - start + 1,
    })
    return fs.createReadStream(filePath, { start, end }).pipe(res)
  }
  res.setHeader('Content-Length', total)
  return fs.createReadStream(filePath).pipe(res)
})

app.post('/api/dz-tube/info', async (req, res) => {
  const { url } = req.body || {}
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'رابط YouTube غير صالح' })

  const useDlp = await ytDlpAvailable()
  if (useDlp) {
    try {
      const info = await runYtDlpJSON(url)
      const formats = (info.formats || [])
        .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
        .map(f => f.height)
      const heights = Array.from(new Set(formats)).sort((a, b) => b - a)
      return res.json({
        title: info.title || 'بدون عنوان',
        thumbnail: info.thumbnail || null,
        duration: info.duration || 0,
        uploader: info.uploader || info.channel || '',
        view_count: info.view_count || 0,
        heights,
        available: { mp4: heights.length > 0, mp3: true },
      })
    } catch (e) {
      console.warn('[DZTube:info:dlp-fail, trying JS]', e.message)
    }
  }
  try {
    const out = await jsInfo(url)
    delete out._info
    res.json(out)
  } catch (e) {
    console.error('[DZTube:info:js]', e.message)
    res.status(500).json({ error: 'تعذر جلب معلومات الفيديو' })
  }
})

const DZ_TUBE_QUALITY_MAP = { '360': 360, '720': 720, '1080': 1080 }

// Stream a buffered file to the client with Content-Length and cleanup
function streamFileToClient(req, res, filePath, mime, downloadName) {
  fs.stat(filePath, (err, st) => {
    if (err || !st) {
      if (!res.headersSent) res.status(500).end('فشل التحميل')
      return safeUnlink(filePath)
    }
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Length', String(st.size))
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
    const rs = fs.createReadStream(filePath)
    rs.on('error', () => { try { res.end() } catch {} ; safeUnlink(filePath) })
    rs.on('close', () => safeUnlink(filePath))
    req.on('close', () => { rs.destroy(); safeUnlink(filePath) })
    rs.pipe(res)
  })
}

app.get('/api/dz-tube/download', async (req, res) => {
  const url = String(req.query.url || '')
  const format = String(req.query.format || 'mp4').toLowerCase()
  const quality = String(req.query.quality || '720')

  if (!isValidYouTubeUrl(url)) return res.status(400).send('رابط YouTube غير صالح')
  if (format !== 'mp4' && format !== 'mp3' && format !== 'audio') return res.status(400).send('Format must be mp4, mp3 or audio')

  // Locate yt-dlp (PATH or bundled at bin/yt-dlp on Vercel)
  const dlpBin = await ytDlpBinaryPath()

  // Resolve title (best-effort)
  let title = 'video'
  try {
    if (dlpBin) {
      const info = await runYtDlpJSONWith(dlpBin, url)
      title = info.title || title
    } else {
      const info = await ytdl.getInfo(url)
      title = info.videoDetails?.title || title
    }
  } catch {}
  const safeName = title.replace(/[^\w\u0600-\u06FF\s.-]/g, '').slice(0, 80).trim().replace(/\s+/g, '_') || 'video'
  const h = DZ_TUBE_QUALITY_MAP[quality] || 720
  const isAudio = format === 'mp3' || format === 'audio'
  const initialExt = format === 'mp3' ? 'mp3' : (format === 'audio' ? 'm4a' : 'mp4')
  const outPath = tmpFile(initialExt)

  const hasFfmpeg = await ffmpegAvailable()
  const cookies = await ytDlpCookiesArgs()

  if (dlpBin) {
    // yt-dlp backend → buffer to disk, then stream to client.
    // We must avoid features that require ffmpeg when it's not on PATH
    // (e.g. on Vercel serverless where only the yt-dlp binary is bundled).
    let args
    let downloadName
    let mime
    if (format === 'mp3' && hasFfmpeg) {
      args = ['-f', 'bestaudio', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', outPath, '--no-playlist', '--no-warnings', ...cookies, url]
      downloadName = `${safeName}.mp3`
      mime = 'audio/mpeg'
    } else if (isAudio) {
      // Native audio (m4a/webm) — no transcoding needed, works without ffmpeg.
      args = ['-f', 'bestaudio[ext=m4a]/bestaudio', '-o', outPath, '--no-playlist', '--no-warnings', ...cookies, url]
      downloadName = `${safeName}.m4a`
      mime = 'audio/mp4'
    } else if (hasFfmpeg) {
      const fmt = `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${h}][ext=mp4]/best[height<=${h}]`
      args = ['-f', fmt, '--merge-output-format', 'mp4', '-o', outPath, '--no-playlist', '--no-warnings', ...cookies, url]
      downloadName = `${safeName}_${h}p.mp4`
      mime = 'video/mp4'
    } else {
      // No ffmpeg → must use a single progressive (combined audio+video) file.
      // 18 = 360p mp4, 22 = 720p mp4. Newer YouTube videos may not expose 22.
      const fmt = `best[ext=mp4][acodec!=none][vcodec!=none][height<=${h}]/best[ext=mp4][acodec!=none][vcodec!=none]/18`
      args = ['-f', fmt, '-o', outPath, '--no-playlist', '--no-warnings', ...cookies, url]
      downloadName = `${safeName}_${h}p.mp4`
      mime = 'video/mp4'
    }
    const proc = spawn(dlpBin, args)
    let stderrBuf = ''
    proc.stderr.on('data', d => { stderrBuf += d.toString() })
    let killed = false
    req.on('close', () => { if (!proc.killed) { killed = true; try { proc.kill('SIGTERM') } catch {} ; safeUnlink(outPath) } })
    proc.on('error', err => {
      console.error('[DZTube:download:dlp:spawn]', err.message)
      safeUnlink(outPath)
      if (!res.headersSent) res.status(500).end('فشل التحميل')
    })
    proc.on('close', code => {
      if (killed) return
      if (code !== 0) {
        console.warn('[DZTube:download:dlp] exit', code, stderrBuf.slice(0, 300))
        safeUnlink(outPath)
        if (!res.headersSent) return res.status(500).end('فشل التحميل')
        return res.end()
      }
      streamFileToClient(req, res, outPath, mime, downloadName)
    })
    return
  }

  // JS fallback (no yt-dlp) — buffer to disk via ytdl-core then stream
  try {
    let stream
    if (isAudio) {
      // Audio-only m4a (no transcoding without ffmpeg in serverless)
      stream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' })
    } else {
      stream = ytdl(url, { quality: 'highest', filter: f => f.hasVideo && f.hasAudio && (!h || (f.height || 0) <= h) })
    }
    const ws = fs.createWriteStream(outPath)
    let aborted = false
    req.on('close', () => { aborted = true; try { stream.destroy() } catch {} ; ws.destroy(); safeUnlink(outPath) })
    stream.on('error', e => {
      console.error('[DZTube:download:js:stream]', e.message)
      ws.destroy(); safeUnlink(outPath)
      if (!res.headersSent) res.status(500).end('فشل التحميل')
    })
    ws.on('error', e => {
      console.error('[DZTube:download:js:write]', e.message)
      try { stream.destroy() } catch {}
      safeUnlink(outPath)
      if (!res.headersSent) res.status(500).end('فشل التحميل')
    })
    ws.on('close', () => {
      if (aborted) return
      // mp3 conversion needs ffmpeg → fall back to native m4a
      const finalName = isAudio ? `${safeName}.m4a` : `${safeName}_${h}p.mp4`
      const finalMime = isAudio ? 'audio/mp4' : 'video/mp4'
      streamFileToClient(req, res, outPath, finalMime, finalName)
    })
    stream.pipe(ws)
  } catch (e) {
    console.error('[DZTube:download:js]', e.message)
    safeUnlink(outPath)
    if (!res.headersSent) res.status(500).end('فشل التحميل')
  }
})

// ===== CHAT ROOM REST ENDPOINTS (polling fallback) =====
app.post('/api/chat-room/join', (req, res) => {
  const { name, gender, adminSecret } = req.body || {}
  if (!name?.trim() || !gender) return res.status(400).json({ error: 'Name and gender required' })
  const id = chatId()
  const isAdmin = adminSecret === CHAT_ADMIN_SECRET
  const session = { id, name: sanitizeString(name, 30), gender, isAdmin, lastSeen: Date.now(), ws: null }
  chatSessions.set(id, session)
  const joinMsg = pushChatMsg({
    id: chatId(), from: 'System', fromId: 'system', gender: 'bot',
    text: `${session.name} joined the chat.`, timestamp: Date.now(), isSystem: true,
  })
  broadcastChat({ type: 'message', msg: joinMsg })
  broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
  res.json({ sessionId: id, isAdmin, messages: chatMessages.slice(-50), users: getOnlineUsers() })
})

app.post('/api/chat-room/leave', (req, res) => {
  const { sessionId } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (session) {
    chatSessions.delete(sessionId)
    const leaveMsg = pushChatMsg({
      id: chatId(), from: 'System', fromId: 'system', gender: 'bot',
      text: `${session.name} left the chat.`, timestamp: Date.now(), isSystem: true,
    })
    broadcastChat({ type: 'message', msg: leaveMsg })
    broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
  }
  res.json({ ok: true })
})

app.post('/api/chat-room/send', async (req, res) => {
  const { sessionId, text, dmTo, dmToName } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (!session) return res.status(401).json({ error: 'Invalid session' })
  const cleanText = sanitizeString(text, 1000).trim()
  if (!cleanText) return res.status(400).json({ error: 'Empty message' })
  session.lastSeen = Date.now()
  const msg = pushChatMsg({
    id: chatId(), from: session.name, fromId: session.id, gender: session.gender,
    text: cleanText, timestamp: Date.now(),
    isDM: !!dmTo, dmTo: dmTo || null, dmToName: dmToName || null,
  })
  if (dmTo) {
    const recip = [...chatSessions.values()].find(s => s.id === dmTo)
    const json = JSON.stringify({ type: 'message', msg })
    if (session.ws?.readyState === 1) session.ws.send(json)
    if (recip?.ws?.readyState === 1) recip.ws.send(json)
  } else {
    broadcastChat({ type: 'message', msg })
  }
  const lower = cleanText.toLowerCase()
  if (lower.startsWith('@dzgpt') || lower.startsWith('@dzagent')) {
    const botMsg = await handleAiChatTrigger(cleanText, lower.startsWith('@dzagent'), session)
    return res.json({ ok: true, msgId: msg.id, botMsg: botMsg || null })
  }
  res.json({ ok: true, msgId: msg.id })
})

app.get('/api/chat-room/messages', (req, res) => {
  const since = Number(req.query.since) || 0
  const sessionId = req.query.sessionId
  const session = chatSessions.get(sessionId)
  if (session) session.lastSeen = Date.now()
  const msgs = chatMessages.filter(m => !m.isDM && m.timestamp > since)
  res.json({ messages: msgs, users: getOnlineUsers(), count: chatSessions.size })
})

app.post('/api/chat-room/admin', (req, res) => {
  const { sessionId, action, targetId, msgId } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (!session?.isAdmin) return res.status(403).json({ error: 'Unauthorized' })
  if (action === 'delete' && msgId) {
    const m = chatMessages.find(m => m.id === msgId)
    if (m) m.isDeleted = true
    broadcastChat({ type: 'delete', msgId })
  } else if (action === 'block' && targetId) {
    const target = chatSessions.get(targetId)
    if (target?.ws?.readyState === 1) target.ws.close()
    chatSessions.delete(targetId)
    broadcastChat({ type: 'blocked', userId: targetId })
    broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
  } else if (action === 'highlight' && msgId) {
    const m = chatMessages.find(m => m.id === msgId)
    if (m) { m.isHighlighted = true; broadcastChat({ type: 'update', msg: m }) }
  }
  res.json({ ok: true })
})

// ===== WEBSOCKET CHAT SERVER =====
function setupChatWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/chat' })
  wss.on('connection', (ws) => {
    let sid = null
    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString())
        if (data.type === 'join') {
          const { name, gender, adminSecret } = data
          if (!name?.trim() || !gender) return ws.close()
          const id = chatId()
          sid = id
          const isAdmin = adminSecret === CHAT_ADMIN_SECRET
          chatSessions.set(id, { id, name: sanitizeString(name, 30), gender, isAdmin, lastSeen: Date.now(), ws })
          const session = chatSessions.get(id)
          ws.send(JSON.stringify({ type: 'welcome', sessionId: id, isAdmin, messages: chatMessages.slice(-50), users: getOnlineUsers() }))
          const joinMsg = pushChatMsg({ id: chatId(), from: 'System', fromId: 'system', gender: 'bot', text: `${session.name} joined the chat.`, timestamp: Date.now(), isSystem: true })
          broadcastChat({ type: 'message', msg: joinMsg }, ws)
          ws.send(JSON.stringify({ type: 'message', msg: joinMsg }))
          broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
        } else if (data.type === 'message') {
          const session = sid ? chatSessions.get(sid) : null
          if (!session) return
          session.lastSeen = Date.now()
          const cleanText = sanitizeString(data.text, 1000).trim()
          if (!cleanText) return
          const msg = pushChatMsg({
            id: chatId(), from: session.name, fromId: session.id, gender: session.gender,
            text: cleanText, timestamp: Date.now(),
            isDM: !!data.dmTo, dmTo: data.dmTo || null, dmToName: data.dmToName || null,
          })
          if (data.dmTo) {
            const recip = [...chatSessions.values()].find(s => s.id === data.dmTo)
            const json = JSON.stringify({ type: 'message', msg })
            ws.send(json)
            if (recip?.ws?.readyState === 1) recip.ws.send(json)
          } else {
            broadcastChat({ type: 'message', msg })
          }
          const lower = cleanText.toLowerCase()
          if (lower.startsWith('@dzgpt') || lower.startsWith('@dzagent')) {
            handleAiChatTrigger(cleanText, lower.startsWith('@dzagent'), session)
          }
        } else if (data.type === 'ping') {
          const session = sid ? chatSessions.get(sid) : null
          if (session) { session.lastSeen = Date.now(); ws.send(JSON.stringify({ type: 'pong', users: getOnlineUsers(), count: chatSessions.size })) }
        } else if (data.type === 'admin') {
          const session = sid ? chatSessions.get(sid) : null
          if (!session?.isAdmin) return
          if (data.action === 'delete' && data.msgId) {
            const m = chatMessages.find(m => m.id === data.msgId)
            if (m) m.isDeleted = true
            broadcastChat({ type: 'delete', msgId: data.msgId })
          } else if (data.action === 'block' && data.targetId) {
            const target = chatSessions.get(data.targetId)
            if (target?.ws?.readyState === 1) target.ws.close()
            chatSessions.delete(data.targetId)
            broadcastChat({ type: 'blocked', userId: data.targetId })
            broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
          } else if (data.action === 'highlight' && data.msgId) {
            const m = chatMessages.find(m => m.id === data.msgId)
            if (m) { m.isHighlighted = true; broadcastChat({ type: 'update', msg: m }) }
          }
        }
      } catch (err) { console.error('[WS:Chat]', err.message) }
    })
    ws.on('close', () => {
      if (sid) {
        const session = chatSessions.get(sid)
        if (session) {
          chatSessions.delete(sid)
          const leaveMsg = pushChatMsg({ id: chatId(), from: 'System', fromId: 'system', gender: 'bot', text: `${session.name} left the chat.`, timestamp: Date.now(), isSystem: true })
          broadcastChat({ type: 'message', msg: leaveMsg })
          broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
        }
        sid = null
      }
    })
    ws.on('error', () => {})
  })
  console.log('[WS:Chat] Chat WebSocket server ready on /ws/chat')
}

// ===== EXPORT APP (for Vercel serverless) =====
export { app }

// ===== SERVE FRONTEND + START SERVER (only when run directly) =====
const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  setInterval(() => {
    updateEddirasaIndex()
      .then(index => console.log(`[Eddirasa] Scheduled index update complete: ${index.lessons.length} lessons`))
      .catch(err => console.warn('[Eddirasa] Scheduled index update failed:', err.message))
  }, 24 * 60 * 60 * 1000)

  if (isProd) {
    app.use(express.static(distDir, { index: false, fallthrough: true }))
    app.get('*', async (_req, res) => {
      try {
        const html = await readFile(indexHtmlPath, 'utf8')
        res.type('html').send(html)
      } catch {
        res.status(500).send('Frontend not available.')
      }
    })
    const httpServer = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`)
    })
    setupChatWebSocket(httpServer)
  } else {
    // Dev: embed Vite as middleware so both API and frontend run on port 5000
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    })
    app.use(vite.middlewares)
    const httpServer = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Dev server running on http://0.0.0.0:${PORT}`)
    })
    setupChatWebSocket(httpServer)
  }
}
