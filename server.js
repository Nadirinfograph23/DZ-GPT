// build: 2026-05-05T03:24:25Z
import express from 'express'
import { fileURLToPath } from 'url'
import path from 'path'
import crypto from 'crypto'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { readFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { WebSocketServer } from 'ws'
import compression from 'compression'

// ── Autonomous Reasoning Engine (CoT, ReAct, ToT, Self-Reflection) ──────────
import { applyReasoning, selfReflect } from './lib/reasoning/index.js'

// ── Owner Command System ──────────────────────────────────────────────────────
import {
  loadOwnerConfig, saveOwnerConfig,
  detectOwnerCommand, processOwnerCommand,
  processImplicitOwnerLearning,
  verifyOwnerToken, getExtraFeeds,
  getTrainingContext, loadTrainingData,
} from './lib/owner-commands.js'

// ── Breaking News Detector ────────────────────────────────────────────────────
import {
  startBreakingNewsPoller,
  listFeeds, addFeed, removeFeed, pauseFeed, resumeFeed, triggerPollNow,
} from './lib/breaking-news.js'

// ── Resilience layer (must import before anything else uses AI) ──────────────
import {
  aiSemaphore,
  aiDeduplicator,
  groqCircuit,
  deepseekCircuit,
  ollamaCircuit,
  agentMonitor,
  chatMonitor,
  fetchDeduplicator,
  stallGuard,
  withTimeout,
  autoCleanMap,
  scheduleOnce,
  systemHealthSnapshot,
  getOverloadMessage,
} from './lib/resilience.js'

// ── Process-level crash prevention ──────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[CRASH GUARD] uncaughtException (server kept alive):', err?.stack || err?.message || err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH GUARD] unhandledRejection (server kept alive):', reason?.stack || reason?.message || reason)
})
// ─────────────────────────────────────────────────────────────────────────────

import { mountSmartAgent } from './lib/agent-mount.js'
import { mountDzAgentV2 } from './lib/dz-v2/mount.js'
import { mountDzAgentV3 } from './lib/dz-v3/mount.js'
import { mountDzAgentV4 } from './lib/dz-v4/mount.js'
import { mountDesignIntelligence } from './lib/design-intelligence/mount.js'
import { mountDzAgentV5 } from './lib/dz-v5/mount.js'
import { mountAutonomousAgent } from './lib/autonomous/mount.js'
import { runReActLoop, shouldUseReActLoop } from './lib/agent-loop/react.js'
import { runClaudeReActLoop } from './lib/agent-loop/claude-react.js'
import claudeProxyRouter from './lib/claude-proxy/index.js'
import { generateTaskPlan } from './lib/task-planner/index.js'
import { mountDzTubeAnalytics } from './lib/dz-tube/analytics-mount.js'
import { mountDownloadV2 } from './services/download/mount.js'
import { mountYouTubeInsight } from './modules/youtube_insight_module/mount.js'
import { mountCloneEngineV2 } from './modules/clone-engine/mount.js'
import { mountGitHubSkill } from './lib/skills/mount.js'
import { mountMetaClaw, injectSkills as metaClawInject } from './lib/skills/dz-metaclaw-skill.js'
import {
  deployGitHubPages,
  deployProject as ghDeployProject,
  uploadSingleFile as ghUploadSingleFile,
  waitForPagesActive as ghWaitForPages,
  getPagesStatus,
  detectGitHubPagesIntent,
  extractPagesRequestMeta,
  sanitizeRepoName,
  getAuthUser as ghPagesGetUser,
  batchPushFiles as ghPagesBatchPush,
  enableGitHubPages as ghPagesEnable,
  generatePagesWorkflow,
  generateReadme as ghPagesReadme,
  createRepo as ghCreateRepo,
} from './lib/github-pages/index.js'
import { analyzeRequest as plannerAnalyze, createDeployPlan, executeWithRecovery as plannerExecute, reflectionLoop as plannerReflect } from './lib/planner/index.js'
import { generateProjectFiles as buildProjectFiles } from './lib/github-pages/project-builder.js'
import { handleYouTubeInput, handleVideoDiscussion } from './modules/youtube_insight_module/controller.js'
import { extractCssFromHtml, extractJsFromHtml, buildHtmlShell } from './modules/web-generator/generator.js'
import { searchAlgeria, isAlgerianCitizenQuery, formatAlgeriaResponse, algeriaFallbackMessage } from './modules/algeria-knowledge-system/search.js'
import { handleMapQuery, isMapQuery, buildNearbyEmbedUrl, POI_EN_SEARCH, POI_TYPES } from './modules/dz-maps/index.js'
import { queryNearby, formatDistance } from './modules/dz-maps/overpass.js'
import {
  createStaticEducationalFallback,
  filterLessons,
  findLessonByTitle,
  lessonsToSearchResults,
  readEddirasaIndex,
  updateEddirasaIndex,
} from './eddirasa_rss_crawler.js'

import {
  callAIRouter,
  getRouterHealthSnapshot,
  getProviderStatus,
  testSingleProvider,
  getProviderScores,
  getRouterLogs,
  getRouterDiagnosticSummary,
  resetProviderScore,
} from './lib/ai-router/index.js'
import { detectIntent as detectSmartIntent, getTaskRoutingHint } from './lib/intent.js'
import { detectAmbiguity, formatClarification } from './lib/smart-clarify.js'
import { GITHUB_AGENT_LAYER, INTENT_SEPARATION_GUARD } from './lib/prompts.js'
import { lookupStaticFact, isStaticQuery } from './lib/static-facts.js'
import { pushMsg as dbPushMsg, getMessages as dbGetMessages, deleteMsg as dbDeleteMsg, setPinned as dbSetPinned, getPinned as dbGetPinned, react as dbReact, getReactions as dbGetReactions } from './lib/chat-store.js'
import { searchMemories, buildMemoryContext, storeMemory, storeExecutionResult, storeErrorFix, MEM_TYPE } from './lib/mem/dz-mem0.js'
import { mountMemoryRouter } from './lib/mem/mem-router.js'
import { streamAIResponse } from './lib/ai-sdk-stream.js'

// ── Modular route modules — Phase 1 refactoring ───────────────
import { createQuranRouter } from './routes/quran.js'
import { createAdminRouter } from './routes/admin.js'
import { createExcelRouter } from './routes/excel.js'
import { createHealthRouter } from './routes/health.js'
import { createOwnerRouter } from './routes/owner.js'

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
        ? ["'self'", 'https://www.youtube.com', 'https://s.ytimg.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com']
        : ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://www.youtube.com', 'https://s.ytimg.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://openweathermap.org', 'https://avatars.githubusercontent.com', 'https://i.ytimg.com', 'https://*.ytimg.com', 'https://*.githubusercontent.com', 'https://image.pollinations.ai', 'https://*.pollinations.ai', 'https://*.hf.space', 'https://*.huggingface.co'],
      connectSrc: isProd
        ? ["'self'", 'https://api.quran.com', 'https://*.googlevideo.com', 'https://manifest.googlevideo.com', 'https://*.youtube.com', 'https://api.openweathermap.org']
        : ["'self'", 'ws:', 'wss:', 'https://api.quran.com', 'https://*.googlevideo.com', 'https://manifest.googlevideo.com', 'https://*.youtube.com', 'https://api.openweathermap.org'],
      mediaSrc: ["'self'", 'https://verses.quran.com', 'https://download.quranicaudio.com', 'https://audio.qurancdn.com', 'https:', 'blob:'],
      fontSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'data:'],
      objectSrc: ["'none'"],
      frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'blob:'],
      childSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com', 'blob:'],
      frameAncestors: isProd
        ? ["'none'"]
        : ["'self'", 'https://replit.com', 'https://*.replit.com', 'https://*.replit.dev'],
    },
  },
  crossOriginEmbedderPolicy: false,
  frameguard: isProd ? { action: 'deny' } : false,
  crossOriginOpenerPolicy: isProd ? { policy: 'same-origin' } : false,
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

// ===== TASK 15+23: GZIP COMPRESSION (Algeria Network Optimization) =====
app.use(compression({
  level: 6, // balanced speed/size
  threshold: 1024, // compress responses > 1KB
  filter: (req, res) => {
    // Don't compress streaming or binary
    if (req.headers['x-no-compression']) return false
    return compression.filter(req, res)
  },
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

const cloneLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many clone requests. Please wait a minute.' },
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
app.use('/api/dz-agent/sync', deployLimiter)
app.use('/api/dz-agent/clone-v2', cloneLimiter)
app.use('/api/dz-agent/doctor-search', searchLimiter)
app.use('/api/claude-proxy', aiLimiter)

// ===== INPUT SANITIZER =====
function sanitizeString(str, maxLen = 10000) {
  if (typeof str !== 'string') return ''
  return str.slice(0, maxLen).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

/**
 * Resolve GitHub token — prefers GITHUB_PERSONAL_ACCESS_TOKEN (full permissions)
 * then falls back to GITHUB_TOKEN. Never exposed in responses.
 */
function resolveGitHubToken(reqToken = '') {
  const safe = sanitizeString(reqToken, 300)
  if (safe) return safe
  return process.env.GITHUB_PERSONAL_ACCESS_TOKEN ||
         process.env.GITHUB_TOKEN || ''
}

/**
 * Standard GitHub API headers using resolved token.
 */
function ghHeaders(token) {
  return {
    Authorization: `token ${token}`,
    'User-Agent': 'DZ-GPT-Agent/2.0',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
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

// ============================================================
// ████  RESILIENT DATA ENGINE — Tasks 11-24  ████
// API-Optional • Anti-Block • Fail-Safe • Auto-Refresh
// ============================================================

// ── Task 17: Anti-Block Header Rotation ──────────────────────
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
]

const REFERERS = [
  'https://www.google.com/',
  'https://www.google.dz/',
  'https://www.bing.com/',
  'https://duckduckgo.com/',
  'https://search.yahoo.com/',
]

function randomUA() { return UA_POOL[Math.floor(Math.random() * UA_POOL.length)] }
function randomReferer() { return REFERERS[Math.floor(Math.random() * REFERERS.length)] }

function buildScrapingHeaders(extra = {}) {
  return {
    'User-Agent': randomUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ar,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': randomReferer(),
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'DNT': '1',
    ...extra,
  }
}

// ── Task 17: Random Human-Like Delay ─────────────────────────
function randomDelay(minMs = 300, maxMs = 1200) {
  return new Promise(res => setTimeout(res, minMs + Math.random() * (maxMs - minMs)))
}

// ── Task 18: Request Throttle Queue (max 3 req/sec per domain) ─
const THROTTLE_MAP = new Map() // domain → { count, resetAt }
const MAX_REQ_PER_SEC = 3
// Auto-prune THROTTLE_MAP every 5 min to prevent memory leak
autoCleanMap(THROTTLE_MAP, { ttlMs: 10_000, label: 'throttle' })

function throttleCheck(url) {
  const domain = (() => { try { return new URL(url).hostname } catch { return 'unknown' } })()
  const now = Date.now()
  const entry = THROTTLE_MAP.get(domain) || { count: 0, resetAt: now + 1000 }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 1000 }
  if (entry.count >= MAX_REQ_PER_SEC) return false
  entry.count++
  THROTTLE_MAP.set(domain, entry)
  return true
}

async function waitForThrottle(url, retries = 8) {
  for (let i = 0; i < retries; i++) {
    if (throttleCheck(url)) return
    await randomDelay(350, 700)
  }
}

// ── Task 11+21: Resilient Fetch with retry + anti-block ────────
async function resilientFetch(url, opts = {}) {
  const {
    timeout = 12000,
    retries = 3,
    delay = true,
    scrapingHeaders = true,
    extraHeaders = {},
    body = undefined,
    method = 'GET',
  } = opts

  await waitForThrottle(url)
  let lastErr

  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0 && delay) await randomDelay(600 * attempt, 1500 * attempt)
    try {
      const headers = scrapingHeaders
        ? buildScrapingHeaders(extraHeaders)
        : { 'User-Agent': 'DZ-GPT-Agent/1.0', ...extraHeaders }

      const fetchOpts = {
        method,
        headers,
        signal: AbortSignal.timeout(timeout),
      }
      if (body) fetchOpts.body = body

      const r = await fetch(url, fetchOpts)

      // 429 Too Many Requests — back off harder
      if (r.status === 429) {
        const retryAfter = parseInt(r.headers.get('retry-after') || '5', 10)
        console.warn(`[ResilientFetch] 429 on ${url} — backing off ${retryAfter}s`)
        await randomDelay(retryAfter * 1000, retryAfter * 1000 + 2000)
        lastErr = new Error(`HTTP 429`)
        continue
      }

      // 503/502 — brief pause then retry
      if (r.status === 503 || r.status === 502) {
        lastErr = new Error(`HTTP ${r.status}`)
        await randomDelay(1000, 2000)
        continue
      }

      return r
    } catch (err) {
      lastErr = err
      console.warn(`[ResilientFetch] attempt ${attempt + 1}/${retries} failed for ${url}: ${err.message}`)
    }
  }
  throw lastErr || new Error(`resilientFetch failed for ${url}`)
}

// ── Task 13+24: Universal Cache Factory ────────────────────────
function makeCache(ttlMs = 10 * 60 * 1000) {
  const store = new Map()
  return {
    get(key) {
      const e = store.get(key)
      if (!e) return null
      if (Date.now() - e.ts > ttlMs) return null
      return e.data
    },
    getStale(key) { // returns even expired data as last-resort fallback
      const e = store.get(key)
      return e ? { data: e.data, ts: e.ts, stale: Date.now() - e.ts > ttlMs } : null
    },
    set(key, data) { store.set(key, { data, ts: Date.now() }) },
    has(key) { return store.has(key) },
    invalidate(key) { store.delete(key) },
    clear() { store.clear() },
    get size() { return store.size },
  }
}

// Global caches
const WEATHER_CACHE_V2  = makeCache(10 * 60 * 1000)  // 10 min
const CURRENCY_CACHE_V2 = makeCache(20 * 60 * 1000)  // 20 min
const SPORTS_CACHE_V2   = makeCache(8 * 60 * 1000)   // 8 min
const GLOBAL_CACHE_V2   = makeCache(6 * 60 * 1000)   // 6 min

// ── Task 11: API-Free Weather (wttr.in + open-meteo) ───────────
const CITY_COORDS = {
  Algiers:     { lat: 36.737, lon: 3.086,  ar: 'الجزائر' },
  Oran:        { lat: 35.697, lon: -0.633, ar: 'وهران' },
  Constantine: { lat: 36.365, lon: 6.614,  ar: 'قسنطينة' },
  Annaba:      { lat: 36.897, lon: 7.747,  ar: 'عنابة' },
  Setif:       { lat: 36.190, lon: 5.412,  ar: 'سطيف' },
  Batna:       { lat: 35.556, lon: 6.174,  ar: 'باتنة' },
  Blida:       { lat: 36.470, lon: 2.828,  ar: 'البليدة' },
  Tlemcen:     { lat: 34.878, lon: -1.316, ar: 'تلمسان' },
  Bejaia:      { lat: 36.755, lon: 5.084,  ar: 'بجاية' },
  Tizi:        { lat: 36.711, lon: 4.046,  ar: 'تيزي وزو' },
}

// All 58 wilayas with coords — used for GPS nearest-wilaya matching
const WILAYA_COORDS_FULL = [
  { en: 'Adrar',               ar: 'أدرار',            lat: 27.874, lon: -0.284 },
  { en: 'Chlef',               ar: 'الشلف',            lat: 36.169, lon:  1.330 },
  { en: 'Laghouat',            ar: 'الأغواط',          lat: 33.800, lon:  2.865 },
  { en: 'Oum el Bouaghi',      ar: 'أم البواقي',       lat: 35.879, lon:  7.114 },
  { en: 'Batna',               ar: 'باتنة',            lat: 35.556, lon:  6.174 },
  { en: 'Bejaia',              ar: 'بجاية',            lat: 36.755, lon:  5.084 },
  { en: 'Biskra',              ar: 'بسكرة',            lat: 34.850, lon:  5.731 },
  { en: 'Bechar',              ar: 'بشار',             lat: 31.617, lon: -2.216 },
  { en: 'Blida',               ar: 'البليدة',          lat: 36.470, lon:  2.828 },
  { en: 'Bouira',              ar: 'البويرة',          lat: 36.381, lon:  3.900 },
  { en: 'Tamanrasset',         ar: 'تمنراست',          lat: 22.785, lon:  5.523 },
  { en: 'Tebessa',             ar: 'تبسة',             lat: 35.404, lon:  8.120 },
  { en: 'Tlemcen',             ar: 'تلمسان',           lat: 34.878, lon: -1.316 },
  { en: 'Tiaret',              ar: 'تيارت',            lat: 35.371, lon:  1.317 },
  { en: 'Tizi Ouzou',          ar: 'تيزي وزو',         lat: 36.711, lon:  4.046 },
  { en: 'Algiers',             ar: 'الجزائر',          lat: 36.737, lon:  3.086 },
  { en: 'Djelfa',              ar: 'الجلفة',           lat: 34.670, lon:  3.263 },
  { en: 'Jijel',               ar: 'جيجل',             lat: 36.820, lon:  5.766 },
  { en: 'Setif',               ar: 'سطيف',             lat: 36.190, lon:  5.412 },
  { en: 'Saida',               ar: 'سعيدة',            lat: 34.831, lon:  0.151 },
  { en: 'Skikda',              ar: 'سكيكدة',           lat: 36.878, lon:  6.906 },
  { en: 'Sidi bel Abbes',      ar: 'سيدي بلعباس',      lat: 35.191, lon: -0.630 },
  { en: 'Annaba',              ar: 'عنابة',            lat: 36.897, lon:  7.747 },
  { en: 'Guelma',              ar: 'قالمة',            lat: 36.462, lon:  7.432 },
  { en: 'Constantine',         ar: 'قسنطينة',          lat: 36.365, lon:  6.614 },
  { en: 'Medea',               ar: 'المدية',           lat: 36.264, lon:  2.751 },
  { en: 'Mostaganem',          ar: 'مستغانم',          lat: 35.931, lon:  0.089 },
  { en: 'Msila',               ar: 'المسيلة',          lat: 35.706, lon:  4.543 },
  { en: 'Mascara',             ar: 'معسكر',            lat: 35.396, lon:  0.139 },
  { en: 'Ouargla',             ar: 'ورقلة',            lat: 31.951, lon:  5.325 },
  { en: 'Oran',                ar: 'وهران',            lat: 35.697, lon: -0.633 },
  { en: 'El Bayadh',           ar: 'البيض',            lat: 33.684, lon:  1.016 },
  { en: 'Illizi',              ar: 'إليزي',            lat: 26.508, lon:  8.477 },
  { en: 'Bordj Bou Arreridj',  ar: 'برج بوعريريج',     lat: 36.073, lon:  4.763 },
  { en: 'Boumerdes',           ar: 'بومرداس',          lat: 36.762, lon:  3.477 },
  { en: 'El Tarf',             ar: 'الطارف',           lat: 36.767, lon:  8.313 },
  { en: 'Tindouf',             ar: 'تندوف',            lat: 27.674, lon: -8.147 },
  { en: 'Tissemsilt',          ar: 'تيسمسيلت',         lat: 35.607, lon:  1.812 },
  { en: 'El Oued',             ar: 'الوادي',           lat: 33.356, lon:  6.863 },
  { en: 'Khenchela',           ar: 'خنشلة',            lat: 35.436, lon:  7.146 },
  { en: 'Souk Ahras',          ar: 'سوق أهراس',        lat: 36.286, lon:  7.951 },
  { en: 'Tipaza',              ar: 'تيبازة',           lat: 36.589, lon:  2.449 },
  { en: 'Mila',                ar: 'ميلة',             lat: 36.450, lon:  6.264 },
  { en: 'Ain Defla',           ar: 'عين الدفلى',       lat: 36.264, lon:  1.967 },
  { en: 'Naama',               ar: 'النعامة',          lat: 33.267, lon: -0.313 },
  { en: 'Ain Temouchent',      ar: 'عين تموشنت',       lat: 35.298, lon: -1.140 },
  { en: 'Ghardaia',            ar: 'غرداية',           lat: 32.490, lon:  3.673 },
  { en: 'Relizane',            ar: 'غليزان',           lat: 35.738, lon:  0.557 },
  { en: 'Timimoun',            ar: 'تيميمون',          lat: 29.264, lon:  0.234 },
  { en: 'Bordj Badji Mokhtar', ar: 'برج باجي مختار',   lat: 21.334, lon:  0.956 },
  { en: 'Ouled Djellal',       ar: 'أولاد جلال',       lat: 34.420, lon:  5.067 },
  { en: 'Beni Abbes',          ar: 'بني عباس',         lat: 30.128, lon: -2.163 },
  { en: 'In Salah',            ar: 'عين صالح',         lat: 27.197, lon:  2.468 },
  { en: 'In Guezzam',          ar: 'عين قزام',         lat: 19.567, lon:  5.771 },
  { en: 'Touggourt',           ar: 'تقرت',             lat: 33.100, lon:  6.067 },
  { en: 'Djanet',              ar: 'جانت',             lat: 24.554, lon:  9.484 },
  { en: 'El Meghaier',         ar: 'المغير',           lat: 33.945, lon:  5.924 },
  { en: 'El Meniaa',           ar: 'المنيعة',          lat: 30.584, lon:  2.880 },
]

function findNearestWilaya(lat, lon) {
  let best = null, bestDist = Infinity
  for (const w of WILAYA_COORDS_FULL) {
    const d = Math.pow(w.lat - lat, 2) + Math.pow(w.lon - lon, 2)
    if (d < bestDist) { bestDist = d; best = w }
  }
  return best
}

const WMO_CODES = {
  0: 'صافٍ', 1: 'صافٍ غالباً', 2: 'غائم جزئياً', 3: 'غائم',
  45: 'ضبابي', 48: 'ضبابي مع صقيع',
  51: 'رذاذ خفيف', 53: 'رذاذ متوسط', 55: 'رذاذ كثيف',
  61: 'مطر خفيف', 63: 'مطر متوسط', 65: 'مطر غزير',
  71: 'ثلج خفيف', 73: 'ثلج متوسط', 75: 'ثلج كثيف',
  80: 'زخات مطر خفيفة', 81: 'زخات مطر متوسطة', 82: 'زخات مطر عنيفة',
  95: 'عاصفة رعدية', 96: 'عاصفة مع برَد', 99: 'عاصفة مع برَد كثيف',
}

async function fetchWeatherOpenMeteo(city) {
  const coords = CITY_COORDS[city]
  if (!coords) throw new Error(`No coords for city: ${city}`)
  return fetchWeatherByCoords(coords.lat, coords.lon, city)
}

async function fetchWeatherByCoords(lat, lon, cityLabel) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=Africa%2FAlgiers&forecast_days=1`
  const r = await resilientFetch(url, { timeout: 8000, retries: 2, scrapingHeaders: false, extraHeaders: { 'Accept': 'application/json' } })
  if (!r.ok) throw new Error(`open-meteo HTTP ${r.status}`)
  const d = await r.json()
  const cur = d.current
  const wmo = cur?.weather_code
  return {
    city: cityLabel || `${lat.toFixed(3)},${lon.toFixed(3)}`,
    temp: Math.round(cur?.temperature_2m ?? 0),
    feels_like: Math.round(cur?.apparent_temperature ?? 0),
    temp_min: Math.round(d.daily?.temperature_2m_min?.[0] ?? 0),
    temp_max: Math.round(d.daily?.temperature_2m_max?.[0] ?? 0),
    condition: WMO_CODES[wmo] || `رمز ${wmo}`,
    icon: null,
    humidity: cur?.relative_humidity_2m ?? null,
    wind: Math.round(cur?.wind_speed_10m ?? 0),
    visibility: null,
    source: 'open-meteo.com',
    fetchedAt: new Date().toISOString(),
  }
}

async function fetchWeatherWttr(city) {
  const citySlug = encodeURIComponent(city + ',Algeria')
  const url = `https://wttr.in/${citySlug}?format=j1`
  const r = await resilientFetch(url, { timeout: 8000, retries: 2, scrapingHeaders: false, extraHeaders: { 'Accept': 'application/json' } })
  if (!r.ok) throw new Error(`wttr.in HTTP ${r.status}`)
  const d = await r.json()
  const cur = d?.current_condition?.[0]
  if (!cur) throw new Error('wttr.in: no current condition')
  const desc = cur.lang_ar?.[0]?.value || cur.weatherDesc?.[0]?.value || ''
  return {
    city,
    temp: parseInt(cur.temp_C, 10),
    feels_like: parseInt(cur.FeelsLikeC, 10),
    temp_min: parseInt(d.weather?.[0]?.mintempC ?? cur.temp_C, 10),
    temp_max: parseInt(d.weather?.[0]?.maxtempC ?? cur.temp_C, 10),
    condition: desc,
    icon: null,
    humidity: parseInt(cur.humidity, 10),
    wind: Math.round(parseInt(cur.windspeedKmph, 10)),
    visibility: parseInt(cur.visibility, 10),
    source: 'wttr.in',
    fetchedAt: new Date().toISOString(),
  }
}

async function fetchWeatherOpenWeather(city) {
  const apiKey = process.env.OPENWEATHER_API_KEY
  if (!apiKey) throw new Error('OPENWEATHER_API_KEY not set')
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)},Algeria&appid=${apiKey}&units=metric&lang=ar`
  const r = await fetch(url, { signal: AbortSignal.timeout(7000) })
  if (!r.ok) throw new Error(`OpenWeather HTTP ${r.status}`)
  const d = await r.json()
  return {
    city,
    temp: Math.round(d.main?.temp ?? 0),
    feels_like: Math.round(d.main?.feels_like ?? 0),
    temp_min: Math.round(d.main?.temp_min ?? 0),
    temp_max: Math.round(d.main?.temp_max ?? 0),
    condition: d.weather?.[0]?.description || '',
    icon: d.weather?.[0]?.icon || null,
    humidity: d.main?.humidity ?? null,
    wind: Math.round(d.wind?.speed ?? 0),
    visibility: d.visibility ? Math.round(d.visibility / 1000) : null,
    source: 'openweathermap.org',
    fetchedAt: new Date().toISOString(),
  }
}

// Task 12: Intelligent source switching for weather
async function fetchCityWeatherResilient(city) {
  const safeCity = String(city || 'Algiers').slice(0, 80)
  const cacheKey = safeCity.toLowerCase()

  const cached = WEATHER_CACHE_V2.get(cacheKey)
  if (cached) return cached

  const sources = [
    { name: 'open-meteo', fn: () => fetchWeatherOpenMeteo(safeCity) },
    { name: 'wttr.in',    fn: () => fetchWeatherWttr(safeCity) },
    { name: 'openweather', fn: () => fetchWeatherOpenWeather(safeCity) },
  ]

  for (const src of sources) {
    try {
      const data = await src.fn()
      if (data && data.temp !== null && !isNaN(data.temp)) {
        WEATHER_CACHE_V2.set(cacheKey, data)
        console.log(`[Weather] ✓ ${safeCity} from ${src.name}: ${data.temp}°C ${data.condition}`)
        return data
      }
    } catch (err) {
      console.warn(`[Weather] ${src.name} failed for ${safeCity}: ${err.message}`)
    }
  }

  // Task 24: Fail-safe — return stale cache rather than nothing
  const stale = WEATHER_CACHE_V2.getStale(cacheKey)
  if (stale?.data) {
    console.warn(`[Weather] All sources failed for ${safeCity}, returning stale cache`)
    return { ...stale.data, status: 'stale', staleAgeMin: Math.round((Date.now() - stale.ts) / 60000) }
  }

  throw new Error(`تعذّر جلب الطقس لـ ${safeCity} من جميع المصادر`)
}

// ── Task 11+12: API-Free Currency (multi-source cascade) ───────
async function fetchCurrencyFawazahmed() {
  // fawazahmed0 CDN — completely free, no key, high uptime
  const DATE = new Date().toISOString().split('T')[0]
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${DATE}/v1/currencies/dzd.json`,
    `https://latest.currency-api.pages.dev/v1/currencies/dzd.json`,
  ]
  const targets = ['usd', 'eur', 'gbp', 'sar', 'aed', 'tnd', 'mad', 'egp', 'qar', 'kwd', 'cad', 'chf', 'cny', 'try', 'jpy']
  for (const url of urls) {
    try {
      const r = await resilientFetch(url, { timeout: 8000, retries: 2, scrapingHeaders: false, extraHeaders: { 'Accept': 'application/json' } })
      if (!r.ok) continue
      const d = await r.json()
      const dzdRates = d?.dzd
      if (!dzdRates) continue
      const rates = {}
      for (const t of targets) {
        const v = dzdRates[t]
        if (v && !isNaN(v) && v > 0) rates[t.toUpperCase()] = +v.toFixed(6)
      }
      if (Object.keys(rates).length > 0) {
        return { base: 'DZD', provider: 'fawazahmed0/currency-api (CDN)', rates, status: 'live', last_update: new Date().toISOString() }
      }
    } catch (err) {
      console.warn(`[Currency] fawazahmed0 ${url} failed: ${err.message}`)
    }
  }
  return null
}

async function fetchCurrencyExchangeRateHost() {
  // exchangerate.host — free, no key required
  const urls = [
    'https://api.exchangerate.host/latest?base=DZD&symbols=USD,EUR,GBP,SAR,AED,TND,MAD,EGP,QAR,KWD,CAD,CHF,CNY,TRY,JPY',
    'https://open.er-api.com/v6/latest/DZD',
  ]
  for (const url of urls) {
    try {
      const r = await resilientFetch(url, { timeout: 8000, retries: 2, scrapingHeaders: false, extraHeaders: { 'Accept': 'application/json' } })
      if (!r.ok) continue
      const d = await r.json()
      const rawRates = d?.rates || d?.conversion_rates
      if (!rawRates) continue
      const targets = ['USD','EUR','GBP','SAR','AED','TND','MAD','EGP','QAR','KWD','CAD','CHF','CNY','TRY','JPY']
      const rates = {}
      for (const sym of targets) {
        const v = rawRates[sym]
        if (v && !isNaN(v) && v > 0) rates[sym] = +v.toFixed(6)
      }
      if (Object.keys(rates).length > 0) {
        return { base: 'DZD', provider: url.includes('er-api') ? 'open.er-api.com' : 'exchangerate.host', rates, status: 'live', last_update: new Date().toISOString() }
      }
    } catch (err) {
      console.warn(`[Currency] exchangerate.host ${url} failed: ${err.message}`)
    }
  }
  return null
}

// Task 12: Intelligent currency source switching
async function fetchCurrencyResilient(forceRefresh = false) {
  const cacheKey = 'dzd_rates'
  if (!forceRefresh) {
    const cached = CURRENCY_CACHE_V2.get(cacheKey)
    if (cached) return cached
  }

  const sources = [
    { name: 'fawazahmed0/cdn',    fn: fetchCurrencyFawazahmed },
    { name: 'floatrates.com',     fn: fetchCurrencyFloatRates },
    { name: 'exchangerate.host',  fn: fetchCurrencyExchangeRateHost },
    { name: 'exchangerate.fallback', fn: fetchCurrencyFallback },
  ]

  for (const src of sources) {
    try {
      const data = await src.fn()
      if (data?.rates && Object.keys(data.rates).length >= 5) {
        CURRENCY_CACHE_V2.set(cacheKey, data)
        console.log(`[Currency] ✓ from ${src.name}: ${Object.keys(data.rates).length} pairs`)
        return data
      }
    } catch (err) {
      console.warn(`[Currency] ${src.name} failed: ${err.message}`)
    }
  }

  // Task 24: stale fallback
  const stale = CURRENCY_CACHE_V2.getStale(cacheKey)
  if (stale?.data) {
    console.warn('[Currency] All sources failed — returning stale cache')
    return { ...stale.data, status: 'stale', stale_since: new Date(stale.ts).toISOString() }
  }
  return null
}

// ── Task 15+23: Lightweight Preload Data (Algeria Mode) ────────
const PRELOAD_CACHE = makeCache(10 * 60 * 1000)

async function preloadEssentialData() {
  const tasks = [
    { key: 'weather_algiers', fn: () => fetchCityWeatherResilient('Algiers') },
    { key: 'currency',        fn: () => fetchCurrencyResilient() },
  ]
  const results = {}
  await Promise.allSettled(tasks.map(async t => {
    try {
      const d = await t.fn()
      PRELOAD_CACHE.set(t.key, d)
      results[t.key] = 'ok'
    } catch (err) {
      results[t.key] = `failed: ${err.message}`
    }
  }))
  console.log('[Preload] Essential data preloaded:', results)
  return results
}

// ── Message Ratings ─────────────────────────────────────────────
const MESSAGE_RATINGS = new Map() // msgId → { vote, query, ts }

// ═══════════════════════════════════════════════════════════════
// MODULAR ROUTE MOUNTS — Phase 1 Refactoring
// These routers shadow the inline route definitions below.
// Inline routes remain for backward compatibility during migration.
// ═══════════════════════════════════════════════════════════════
app.use('/api', createQuranRouter())
app.use('/api', createAdminRouter({ getGroqKeys, callGroqWithFallback, PORT }))
app.use('/api', createExcelRouter({ safeGenerateAI, aiLimiter }))
app.use('/api', createHealthRouter({
  MESSAGE_RATINGS,
  PRELOAD_CACHE,
  WEATHER_CACHE_V2,
  CURRENCY_CACHE_V2,
  SPORTS_CACHE_V2,
  resilientFetch,
  MAX_REQ_PER_SEC,
  getGroqKeys,
  systemHealthSnapshot,
  getProviderStatus,
  getRouterHealthSnapshot,
}))
app.use('/api', createOwnerRouter({ getRSSFeeds: () => RSS_FEEDS }))
// ═══════════════════════════════════════════════════════════════

app.post('/api/dz-agent/ratings', (req, res) => {
  const { messageId, vote, query } = req.body || {}
  if (!messageId || !['up', 'down'].includes(vote)) {
    return res.status(400).json({ error: 'messageId and vote (up|down) required' })
  }
  MESSAGE_RATINGS.set(String(messageId), {
    vote,
    query: (query || '').slice(0, 300),
    ts: Date.now(),
  })
  res.json({ ok: true, total: MESSAGE_RATINGS.size })
})

app.get('/api/dz-agent/ratings/stats', (_req, res) => {
  const all = [...MESSAGE_RATINGS.values()]
  const up   = all.filter(r => r.vote === 'up').length
  const down = all.filter(r => r.vote === 'down').length
  const total = all.length
  const recent = [...MESSAGE_RATINGS.entries()]
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, 20)
    .map(([id, r]) => ({ id, ...r, tsIso: new Date(r.ts).toISOString() }))
  res.json({ total, up, down, ratio: total ? Math.round((up / total) * 100) : 0, recent })
})

// ── Task 22: Smart Preloading endpoint ─────────────────────────
app.get('/api/dz-agent/preload-status', (_req, res) => {
  res.json({
    preloaded: {
      weather_algiers: PRELOAD_CACHE.has('weather_algiers'),
      currency: PRELOAD_CACHE.has('currency'),
    },
    cacheStats: {
      weather: WEATHER_CACHE_V2.size,
      currency: CURRENCY_CACHE_V2.size,
      sports: SPORTS_CACHE_V2.size,
    },
    fetchedAt: new Date().toISOString(),
  })
})

// ── Task 14: Offline / Network Awareness probe ─────────────────
app.get('/api/dz-agent/connectivity', async (_req, res) => {
  const probes = [
    { name: 'open-meteo', url: 'https://api.open-meteo.com/v1/forecast?latitude=36.737&longitude=3.086&current=temperature_2m&forecast_days=1' },
    { name: 'currency-cdn', url: 'https://latest.currency-api.pages.dev/v1/currencies/dzd.json' },
    { name: 'kooora', url: 'https://www.kooora.com/?l=108' },
  ]
  const results = {}
  await Promise.allSettled(probes.map(async p => {
    try {
      const r = await resilientFetch(p.url, { timeout: 6000, retries: 1 })
      results[p.name] = r.ok ? 'online' : `http_${r.status}`
    } catch { results[p.name] = 'offline' }
  }))
  const allOnline = Object.values(results).every(v => v === 'online')
  res.json({ online: allOnline, sources: results, fetchedAt: new Date().toISOString() })
})

// ── Task 20: Multi-Agent status endpoint ───────────────────────
app.get('/api/dz-agent/agent-status', (_req, res) => {
  res.json({
    agents: {
      data: { status: 'active', description: 'Scraping + API fetching' },
      parsing: { status: 'active', description: 'HTML parsing & data structuring' },
      cache: { status: 'active', description: 'TTL caching & stale fallback', entries: WEATHER_CACHE_V2.size + CURRENCY_CACHE_V2.size },
      response: { status: 'active', description: 'AI response generation' },
    },
    resilience: {
      headerRotation: true,
      randomDelay: true,
      throttling: `max ${MAX_REQ_PER_SEC} req/sec/domain`,
      retries: 3,
      staleCache: true,
      sourceCascade: true,
    },
    fetchedAt: new Date().toISOString(),
  })
})
// ============================================================
// END RESILIENT DATA ENGINE
// ============================================================

// ═══════════════════════════════════════════════════════════════════════
// THINKING TRACE ENDPOINT — 6-Role Deliberation (SSE streaming)
// Exposes the Advanced Thinking Engine (Layer 14) visually to the user.
// POST /api/dz-agent/thinking-trace
// ═══════════════════════════════════════════════════════════════════════
const THINKING_ROLES = [
  { id: 'planner',   emoji: '🧭', name: 'Planner',          nameAr: 'المخطط',          color: '#3b82f6' },
  { id: 'researcher',emoji: '🔬', name: 'Researcher',        nameAr: 'الباحث',          color: '#8b5cf6' },
  { id: 'architect', emoji: '🏗️', name: 'Architect',         nameAr: 'المهندس',         color: '#06b6d4' },
  { id: 'debugger',  emoji: '🐛', name: 'Debugger',          nameAr: 'المدقق',          color: '#f59e0b' },
  { id: 'memory',    emoji: '🧠', name: 'Memory Optimizer',  nameAr: 'محسّن الذاكرة',   color: '#10b981' },
  { id: 'critic',    emoji: '⚖️', name: 'Critic',            nameAr: 'الناقد',          color: '#ef4444' },
]

const THINKING_TRACE_PROMPT = (query) => `You are running a structured internal deliberation for this user request:
"${query.slice(0, 400)}"

Output EXACTLY this JSON object — one key per role, each value 1-2 concise sentences (max 120 chars each):

{
  "planner":    "What is the real goal? Key subtasks?",
  "researcher": "What knowledge/tools are needed? Any gaps?",
  "architect":  "Best structural approach? Module/flow design?",
  "debugger":   "Potential errors, edge cases, or hallucinations to guard against?",
  "memory":     "What context from conversation is relevant?",
  "critic":     "What could be improved in this approach?"
}

Reply ONLY with the raw JSON object. No markdown, no explanation.`

app.post('/api/dz-agent/thinking-trace', async (req, res) => {
  const { query = '', messages = [], intent = 'general' } = req.body || {}
  if (!query && !messages.length) return res.status(400).json({ error: 'query required' })

  const userQuery = query || (messages.findLast?.(m => m.role === 'user')?.content) || ''

  // Fast-path: skip deliberation for trivial requests
  const isTrivial = userQuery.length < 20 ||
    /^(مرحبا|سلام|شكرا|hello|hi|thanks|ok|okay|نعم|لا|yes|no)\b/i.test(userQuery.trim())

  if (isTrivial) {
    return res.json({
      trivial: true,
      roles: THINKING_ROLES.map(r => ({ ...r, output: r.id === 'critic' ? 'Simple request — direct answer.' : '' }))
    })
  }

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // Emit roles as skeleton immediately
  send('init', { roles: THINKING_ROLES })

  try {
    const aiPrompt = [{ role: 'user', content: THINKING_TRACE_PROMPT(userQuery) }]
    const raw = await safeGenerateAI({ messages: aiPrompt, max_tokens: 600, taskHint: 'reasoning' })
    const text = typeof raw === 'string' ? raw : (raw?.content || raw?.choices?.[0]?.message?.content || '')

    // Parse JSON from AI output
    let parsed = {}
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
    } catch { /* fallback: use empty strings */ }

    // Stream each role with 80ms delay for visual effect
    for (const role of THINKING_ROLES) {
      const output = parsed[role.id] || '—'
      send('role', { id: role.id, output })
      await new Promise(r => setTimeout(r, 80))
    }

    send('done', { ok: true })
  } catch (err) {
    console.error('[thinking-trace]', err.message)
    // Emit fallback outputs on error
    for (const role of THINKING_ROLES) {
      send('role', { id: role.id, output: '—' })
    }
    send('done', { ok: false, error: err.message })
  }
  res.end()
})

function isDeveloperOrOwnerQuestion(message) {
  if (typeof message !== 'string' || !message) return false
  return DEVELOPER_QUESTION_PATTERNS.some(p => normalizeQuery(message).includes(p))
}

// ===== UNIFIED CAPABILITIES QUESTION DETECTION =====
const CAPABILITIES_RESPONSE = Object.freeze({
  content: [
    '🤖 **DZ Agent** 🇩🇿 — مدعم بـ **16 وكيل ذكي** و **39 مهارة متخصصة**',
    '',
    '## 🧠 الـ 16 وكيل المتخصص',
    '| # | الوكيل | الدور |',
    '|---|--------|-------|',
    '| 1 | 🔎 وكيل البحث الحي | Google-First · RSS · CSE مع تقييم المصادر |',
    '| 2 | 📰 وكيل الأخبار | أخبار الجزائر والعالم من 20+ مصدر موثوق |',
    '| 3 | ⚽ وكيل الرياضة | LFP · دوريات عالمية · نتائج مباشرة |',
    '| 4 | 🌤️ وكيل الطقس | 58 ولاية جزائرية + أي مدينة عالمية |',
    '| 5 | 🗺️ وكيل الخرائط | خرائط جزائرية ذكية + بحث جغرافي |',
    '| 6 | 🐙 وكيل GitHub | تنفيذ حقيقي: commit · PR · deploy · pages |',
    '| 7 | 🌐 وكيل بناء المواقع | HTML/CSS/JS/React كامل مع معاينة |',
    '| 8 | 🧠 وكيل الذاكرة | Long-Term Memory · سياق شخصي مستمر |',
    '| 9 | 📖 وكيل القرآن | تلاوات · ترجمة · تفسير · بحث آيات |',
    '| 10 | 🏥 وكيل الصحة | أعراض · أطباء · CNAS · رعاية صحية |',
    '| 11 | 🎓 وكيل التعليم | Eddirasa · ملخصات · تمارين · بكالوريا |',
    '| 12 | ⚖️ وكيل القانون | تحليل عقود · وثائق رسمية · OCR |',
    '| 13 | 🎬 وكيل يوتيوب | تحليل فيديو · ملخص · بحث ذكي |',
    '| 14 | 🗣️ وكيل الدارجة | فهم كل لهجات الجزائر + فرانكو |',
    '| 15 | 💱 وكيل العملات | DZD · دولار · يورو · أسعار مباشرة |',
    '| 16 | 🔬 وكيل التحليل | CoT · ReAct · ToT · استنتاج عميق |',
    '',
    '## ⚡ الـ 39 مهارة',
    '🔎 بحث حي على الإنترنت · 🌐 قراءة المواقع · 💻 كود وبرمجة · 🐙 GitHub Agent',
    '📰 أخبار الجزائر · 🌍 أخبار عالمية · ⚽ رياضة وLFP · 💱 أسعار العملات',
    '🌤️ طقس 58 ولاية · 🕌 مواقيت الصلاة · 📖 قرآن كريم · 🧠 ذاكرة شخصية',
    '📄 سيرة ذاتية ع/ف · 📋 مخطط المشاريع · 📑 وثائق تجارية · ⚖️ تحليل قانوني',
    '💼 بحث وظيفي · ✉️ رسائل تقدم · 🏥 وكيل صحة · 👨‍⚕️ بحث أطباء',
    '📊 إحصاءات جزائرية · 🗣️ دارجة جزائرية · 🔄 ترجمة 3 لغات · 🖼️ توليد صور AI',
    '🌐 بناء مواقع HTML · 🚀 نشر GitHub Pages · ☁️ نشر Vercel · 🎬 تحليل يوتيوب',
    '📷 OCR صور وPDF · 🗺️ خرائط جزائرية · 🎓 دروس Eddirasa · 📝 توليد عقود',
    '📊 خطة عمل Business Plan · 🏢 بحث شركات الجزائر · 🩺 CNAS/CHNAS',
    '🧩 multi-agent reasoning · 🔗 WebSocket فوري · 🛡️ circuit breaker',
    '',
    '**GitHub Agent:** أيقونة GitHub في شريط الإدخال ← رابط المستودع ← طلبك.',
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
  'موعد طبيب', 'موعد عند طبيب', 'دبيب', 'دكتوره', 'دكترة',
  'عيادة طبية', 'مركز صحي', 'مستوصف', 'عيادات',
  // Darija triggers
  'نقلب', 'نحوس', 'نلقى طبيب', 'وين طبيب', 'فين طبيب',
  // French
  'médecin', 'medecin', 'docteur', 'cabinet médical', 'cherche médecin', 'cherche docteur',
  'rendez-vous médecin', 'cabinet medical', 'clinique',
  // Specialty keywords (act as triggers too)
  'cardiologue', 'dentiste', 'pédiatre', 'pediatre', 'gynécologue', 'gynecologue',
  'ophtalmologue', 'dermatologue', 'généraliste', 'generaliste', 'orl', 'psychiatre',
  'rhumatologue', 'urologue', 'neurologue', 'chirurgien',
  'pneumologue', 'gastrologue', 'endocrinologue', 'nephrologue', 'oncologue', 'radiologue',
  // Arabic specialty triggers
  'أسنان', 'سنان', 'ضروس', 'طب الأسنان',
  'نسائية', 'نساء وتوليد', 'ولادة', 'حمل',
  'أطفال', 'طب الأطفال',
  'عيون', 'بصريات',
  'جلدية', 'أمراض الجلد',
  'قلبي', 'أمراض القلب',
  'عظام', 'كسور',
  'أعصاب', 'الجهاز العصبي',
  'مسالك', 'مسالك بولية',
]

const SPECIALITIES = [
  // [canonical_ar, canonical_fr, ...aliases] — includes Darija + FR synonyms
  { ar: 'عظام',          fr: 'orthopédiste',    search: 'orthopédiste',        aliases: ['عظام', 'العظام', 'عضام', 'كسور', 'مفاصل العظام', 'orthopédiste', 'orthopediste', 'chirurgien orthopediste', 'orthopedic'] },
  { ar: 'قلب',           fr: 'cardiologue',     search: 'cardiologue',         aliases: ['قلب', 'القلب', 'أمراض القلب', 'قلبي', 'cardiologue', 'cardio', 'cardiology'] },
  { ar: 'أسنان',         fr: 'dentiste',        search: 'dentiste',            aliases: ['أسنان', 'الأسنان', 'سنان', 'ضرس', 'ضروس', 'سن', 'طب الأسنان', 'dentiste', 'dentist', 'chirurgien dentiste', 'odontologue'] },
  { ar: 'عيون',          fr: 'ophtalmologue',   search: 'ophtalmologue',       aliases: ['عيون', 'العيون', 'بصر', 'النظر', 'طب العيون', 'ophtalmologue', 'ophtalmo', 'ophtalmologie'] },
  { ar: 'جلدية',         fr: 'dermatologue',    search: 'dermatologue',        aliases: ['جلدية', 'الجلدية', 'جلد', 'الجلد', 'dermatologue', 'dermato', 'dermatologie'] },
  { ar: 'نساء وتوليد',   fr: 'gynécologue',     search: 'gynécologue',         aliases: ['نساء', 'توليد', 'نسائية', 'ولادة', 'حمل', 'أمراض نسائية', 'gynécologue', 'gynecologue', 'gyneco', 'obstetricien', 'gynécologie'] },
  { ar: 'أطفال',         fr: 'pédiatre',        search: 'pédiatre',            aliases: ['أطفال', 'الأطفال', 'طفل', 'طب الأطفال', 'pédiatre', 'pediatre', 'pediatrie'] },
  { ar: 'أنف وأذن وحنجرة', fr: 'ORL',          search: 'ORL',                 aliases: ['أنف', 'أذن', 'حنجرة', 'انف واذن', 'الحنجرة', 'orl', 'oto-rhino', 'otorhino', 'otorhinolaryngologie'] },
  { ar: 'نفسي',          fr: 'psychiatre',      search: 'psychiatre',          aliases: ['نفسي', 'النفسي', 'نفسية', 'الطب النفسي', 'psychiatre', 'psy', 'psychiatrie', 'psychologue'] },
  { ar: 'باطني',         fr: 'interniste',      search: 'médecine interne',    aliases: ['باطني', 'الباطني', 'باطنية', 'طب داخلي', 'interniste', 'medecine interne'] },
  { ar: 'عام',           fr: 'généraliste',     search: 'médecin généraliste', aliases: ['عام', 'طبيب عام', 'généraliste', 'generaliste', 'medecin generaliste', 'médecin généraliste'] },
  { ar: 'مفاصل',         fr: 'rhumatologue',    search: 'rhumatologue',        aliases: ['مفاصل', 'روماتيزم', 'التهاب المفاصل', 'rhumatologue', 'rhumatologie'] },
  { ar: 'مسالك بولية',   fr: 'urologue',        search: 'urologue',            aliases: ['مسالك', 'بولية', 'مسالك بولية', 'urologue', 'urologie'] },
  { ar: 'أعصاب',         fr: 'neurologue',      search: 'neurologue',          aliases: ['أعصاب', 'الأعصاب', 'اعصاب', 'neurologue', 'neuro', 'neurologie'] },
  { ar: 'جراحة',         fr: 'chirurgien',      search: 'chirurgien',          aliases: ['جراحة', 'جراح', 'chirurgien', 'chirurgien generaliste', 'chirurgie'] },
  { ar: 'صدر ورئة',      fr: 'pneumologue',     search: 'pneumologue',         aliases: ['صدر', 'رئة', 'الرئة', 'ربو', 'pneumologue', 'pneumologie', 'pulmonologue'] },
  { ar: 'جهاز هضمي',    fr: 'gastro-entérologue', search: 'gastro-entérologue', aliases: ['هضمي', 'معدة', 'الجهاز الهضمي', 'قولون', 'gastro', 'gastroenterologue', 'gastro-enterologue'] },
  { ar: 'غدد صماء',      fr: 'endocrinologue',  search: 'endocrinologue',      aliases: ['غدد', 'السكري', 'درقية', 'endocrinologue', 'endocrinologie'] },
  { ar: 'كلى',           fr: 'néphrologue',     search: 'néphrologue',         aliases: ['كلى', 'الكلى', 'nephrologue', 'nephrologie'] },
  { ar: 'أورام',         fr: 'oncologue',       search: 'oncologue',           aliases: ['أورام', 'سرطان', 'الأورام', 'oncologue', 'oncologie', 'cancérologue'] },
  { ar: 'أشعة',          fr: 'radiologue',      search: 'radiologue',          aliases: ['أشعة', 'الأشعة', 'تصوير', 'radiologue', 'radiologie'] },
  { ar: 'تغذية',         fr: 'nutritionniste',  search: 'nutritionniste',      aliases: ['تغذية', 'التغذية', 'رجيم', 'nutritionniste', 'dieteticien', 'nutrition'] },
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

// كلمات تدل على السياق التقني — إذا وُجدت مع "توليد" لا يُعدّ طلب طبيب
const TECH_CONTEXT_EXCLUSIONS = [
  'صور', 'صورة', 'image', 'images', 'photo', 'كود', 'code', 'نص', 'text',
  'موقع', 'website', 'فيديو', 'video', 'ذكاء', 'ai', 'اصطناعي', 'artificial',
  'تلقائي', 'automatic', 'محتوى', 'content', 'بيانات', 'data', 'تقرير', 'report',
  'ملف', 'file', 'html', 'css', 'python', 'javascript', 'pdf', 'خريطة',
  'هل تستطيع', 'هل يمكنك', 'هل تقدر', 'can you', 'قادر على', 'able to',
]

function detectDoctorIntent(message) {
  if (!message || typeof message !== 'string') return { isDoctorQuery: false }
  const norm = normalizeQuery(message)

  // ── Exclusion guard — منع التفعيل الخاطئ في السياق التقني ───────────────
  // مثال: "توليد الصور" ، "هل تستطيع توليد كود"
  const hasTechContext = TECH_CONTEXT_EXCLUSIONS.some(w => norm.includes(w.toLowerCase()))
  if (hasTechContext) return { isDoctorQuery: false }

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

// ===== DZ LANGUAGE LAYER V2 (Algerian Darja Understanding System) =====
import {
  normalizeDarija,
  detectStyle as detectDzStyle,
  detectIntent as detectDzIntent,
  detectLightIntent,
  extractEntities as extractDzEntities,
  buildResponseStyle,
  moderateMessage,
  recordPendingLearning,
} from './lib/dzLanguage.js'

// ===== DZ PLACE SEARCH (OpenStreetMap Nominatim — no API key) =====
import {
  searchPlaces,
  buildPlaceResponse,
  PLACE_INTENTS,
  INTENT_TO_SERVICE,
  SERVICE_CONFIG,
} from './lib/dzPlaceSearch.js'

const DOCTOR_SOURCE_COUNT = 4

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

const execFileAsync = promisify(execFile)
const REPO_ROOT = path.resolve(__dirname)
async function runGit(args, opts = {}) {
  return execFileAsync('git', args, {
    cwd: REPO_ROOT,
    timeout: opts.timeout || 30000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(opts.env || {}) },
  })
}

// ===== YOUTUBE SMART VIDEO SELECTION — resolveVideoSelection() =====
// Maps user ordinal/keyword intent to a specific video from candidates list.
const YT_ORDINALS = [
  // index 0 → position 1
  ['الأول','اول','أول','الاول','1','رقم 1','رقم واحد','واحد','first','premier','الأولى','الاولى'],
  // index 1 → position 2
  ['الثاني','ثاني','2','رقم 2','رقم اثنين','اثنين','second','deuxième','الثانية'],
  // index 2 → position 3
  ['الثالث','ثالث','3','رقم 3','رقم ثلاثة','ثلاثة','third','troisième','الثالثة'],
  // index 3 → position 4
  ['الرابع','رابع','4','رقم 4','رقم أربعة','أربعة','fourth','quatrième','الرابعة'],
  // index 4 → position 5
  ['الخامس','خامس','5','رقم 5','رقم خمسة','خمسة','fifth','cinquième','الخامسة'],
  // index 5 → position 6
  ['السادس','سادس','6','رقم 6','سادسة'],
  // index 6 → position 7
  ['السابع','سابع','7','رقم 7','سابعة'],
  // index 7 → position 8
  ['الثامن','ثامن','8','رقم 8','ثامنة'],
]

function resolveVideoSelection(userMessage, candidates) {
  if (!candidates || candidates.length === 0) return null
  const norm = String(userMessage || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[؟?!.,،:;]/g, ' ')
    .trim()

  // 1) Ordinal match — "الأول", "رقم 2", etc.
  for (let i = 0; i < YT_ORDINALS.length; i++) {
    for (const kw of YT_ORDINALS[i]) {
      const pattern = new RegExp(`(^|\\s)${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i')
      if (pattern.test(norm) && i < candidates.length) {
        return candidates[i]
      }
    }
  }

  // 2) "هذا الفيديو" / "هذا" / "this one" when only 1 candidate
  if (/هذا|هذه|this one|this video|celui[- ]ci/i.test(norm) && candidates.length === 1) {
    return candidates[0]
  }

  // 3) Keyword partial-title match (top-scored)
  const words = norm.split(/\s+/).filter(w => w.length >= 3)
  if (words.length === 0) return null

  let bestScore = 0
  let bestCandidate = null
  for (const c of candidates) {
    const titleNorm = String(c.title || '').toLowerCase()
      .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    let score = 0
    for (const w of words) {
      if (titleNorm.includes(w)) score += w.length
    }
    if (score > bestScore) { bestScore = score; bestCandidate = c }
  }
  // Only use title-match if meaningful overlap (>= 6 chars worth)
  if (bestScore >= 6) return bestCandidate

  return null
}

// ===== GROQ SMART KEY ROTATION SYSTEM =====
const KEY_COOLDOWN_MS = 60 * 1000        // 60s cooldown after rate-limit
const KEY_ERROR_COOLDOWN_MS = 30 * 1000  // 30s cooldown after generic error
const KEY_MAX_ERRORS = 3                  // disable key after 3 consecutive errors

const keyStats = new Map() // key -> { requests, errors, lastError, cooldownUntil, totalMs, avgMs }

function getGroqKeys() {
  const seen = new Set()
  const keys = []
  const candidates = [
    process.env.GROQ_API_KEY,
    process.env.AI_API_KEY,
    ...Array.from({ length: 9 }, (_, i) => process.env[`AI_API_KEY_${i + 2}`]),
  ]
  for (const k of candidates) {
    if (k && k.trim() && !seen.has(k)) {
      seen.add(k)
      keys.push(k)
    }
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

// ===== DZ AGENT RELIABILITY LAYER =====
// Validates AI text output before returning it to the user.
// Catches: empty / null / undefined / placeholder / too-short responses.
function validateAIContent(text, query = '') {
  if (text === null || text === undefined) return false
  if (typeof text !== 'string') return false
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 5) return false
  if (/^(null|undefined|n\/a|none|empty|---+|\.\.\.+)\s*$/i.test(cleaned)) return false
  // Catch the model echoing the system prompt header back instead of answering
  if (cleaned.length < 30 && /^(system|assistant|user)\s*:/i.test(cleaned)) return false
  return true
}

// ===== ISSUE 4 FIX — GLOBAL RESPONSE GUARD =====
// Used by every dashboard / chat endpoint to make sure the user NEVER sees
// an empty or null response. Returns a localized Arabic fallback message
// keyed by data type when the upstream payload is missing.
const FINAL_FALLBACK_MESSAGES = {
  weather:  '⚠️ تعذر جلب حالة الطقس حالياً.',
  currency: '⚠️ بيانات الصرف غير متوفرة حالياً.',
  sports:   '⚠️ بيانات المباريات غير متاحة حالياً.',
  league:   '⚠️ بيانات الدوري غير متاحة حالياً.',
  global:   '⚠️ بيانات الدوريات العالمية غير متاحة حالياً.',
  news:     '⚠️ تعذر جلب الأخبار حالياً.',
  prayer:   '⚠️ تعذر جلب مواقيت الصلاة حالياً.',
  ai:       '⚠️ لم نتمكن من توليد رد، يرجى المحاولة مرة أخرى.',
  default:  '⚠️ حدث خطأ، حاول مرة أخرى.',
}
function finalResponseGuard(response, type = 'default') {
  // Arrays: empty → fallback message
  if (Array.isArray(response)) {
    if (response.length === 0) return FINAL_FALLBACK_MESSAGES[type] || FINAL_FALLBACK_MESSAGES.default
    return response
  }
  // Strings: empty / whitespace → fallback
  if (typeof response === 'string') {
    return response.trim().length > 0
      ? response
      : (FINAL_FALLBACK_MESSAGES[type] || FINAL_FALLBACK_MESSAGES.default)
  }
  // Objects: null/undefined → fallback message; non-empty object passes through
  if (response === null || response === undefined) {
    return FINAL_FALLBACK_MESSAGES[type] || FINAL_FALLBACK_MESSAGES.default
  }
  return response
}

// Server-side robust fetch with retry + delay. Wraps any async fn that may
// fail intermittently (network/scrape/API). Returns null after final failure
// so callers can apply their own cache fallback.
async function robustFetch(fn, { retries = 3, delayMs = 1000 } = {}) {
  let lastErr
  for (let i = 0; i < retries; i++) {
    try {
      const out = await fn()
      if (out !== null && out !== undefined) return out
    } catch (err) {
      lastErr = err
    }
    if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs))
  }
  if (lastErr) console.warn('[robustFetch] gave up after', retries, 'tries:', lastErr.message)
  return null
}

// Trims chat history to keep context relevant: system messages + last N turns.
// Removes any null/empty messages defensively.
function trimRelevantContext(messages, maxTurns = 8) {
  if (!Array.isArray(messages)) return []
  const safe = messages.filter(m => m && typeof m.content === 'string' && m.content.trim().length > 0)
  const systemMsgs = safe.filter(m => m.role === 'system')
  const nonSystem = safe.filter(m => m.role !== 'system')
  const trimmed = nonSystem.slice(-(maxTurns * 2))
  return [...systemMsgs, ...trimmed]
}

// Logs an empty/invalid AI response with the originating query for debugging.
function logInvalidResponse(stage, query, raw) {
  const preview = typeof raw === 'string' ? raw.slice(0, 80) : String(raw).slice(0, 80)
  console.warn(`[DZ Agent:Invalid] stage=${stage} | query="${(query || '').slice(0, 80)}" | raw="${preview}"`)
}

// ===== INTERNAL DIAGNOSTIC LOGGER =====
// Centralised logger for empty responses, outdated data usage and source
// failures. Keeps last 200 events in memory so /api/dz-agent/diagnostics can
// surface them. Console output is always emitted for tail -f workflows.
const DIAG_EVENTS = []
const DIAG_MAX = 200
function diagLog(kind, payload = {}) {
  const entry = { kind, ts: new Date().toISOString(), ...payload }
  DIAG_EVENTS.push(entry)
  if (DIAG_EVENTS.length > DIAG_MAX) DIAG_EVENTS.splice(0, DIAG_EVENTS.length - DIAG_MAX)
  const tag = kind === 'empty' ? '⚠️ EMPTY'
            : kind === 'outdated' ? '🕰️ OUTDATED'
            : kind === 'source_fail' ? '❌ SRC-FAIL'
            : kind === 'fallback' ? '↩ FALLBACK'
            : kind
  const detail = Object.entries(payload).slice(0, 4).map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join(' ')
  console.warn(`[DZ-Diag:${tag}] ${detail}`)
}

// ===== REAL-TIME / FRESHNESS ENGINE =====
// Dynamic current year so AI prompts and validators always reflect "now".
function getCurrentYear() { return new Date().getFullYear() }
function getCurrentDateString(locale = 'ar-DZ') {
  try { return new Date().toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }
  catch { return new Date().toISOString().slice(0, 10) }
}

// Returns true if the item is "fresh enough":
//   - has a valid pubDate within the last `maxAgeDays`
//   - OR has no date at all (assumed live / undated)
//   - OR date year >= currentYear - 1 (tolerate Dec→Jan boundary)
// Items dated in earlier years are considered outdated and rejected.
function isFreshItem(item, { maxAgeDays = 30 } = {}) {
  const raw = item?.pubDate || item?.date || item?.publishedDate
  if (!raw) return true
  const t = new Date(raw).getTime()
  if (!Number.isFinite(t)) return true
  const ageDays = (Date.now() - t) / 86400000
  if (ageDays > maxAgeDays) return false
  const y = new Date(raw).getFullYear()
  // STRICT: only allow current year and previous year (e.g. 2026 + 2025 in 2026).
  // Older years are considered outdated for the dashboard / news pipeline.
  if (y < getCurrentYear() - 1) return false
  return true
}

// Year-priority bucketer for "2026 first, then 2025, ignore older" rule.
// Higher value = displayed first.
function _itemYearPriority(item) {
  const raw = item?.pubDate || item?.date || item?.publishedDate
  if (!raw) return 0
  const y = new Date(raw).getFullYear()
  const cy = getCurrentYear()
  if (!Number.isFinite(y)) return 0
  if (y >= cy)     return 3  // current year (e.g. 2026) → top priority
  if (y === cy-1)  return 2  // previous year (e.g. 2025) → second
  return 0                   // older → deprioritised (already filtered by isFreshItem)
}

// Scores recency 0-100 (higher = fresher). Items with no date get a neutral 60.
function freshnessScore(item) {
  const raw = item?.pubDate || item?.date || item?.publishedDate
  if (!raw) return 60
  const t = new Date(raw).getTime()
  if (!Number.isFinite(t)) return 60
  const ageH = (Date.now() - t) / 3600000
  if (ageH < 6)   return 100
  if (ageH < 24)  return 90
  if (ageH < 48)  return 80
  if (ageH < 168) return 65 // 7d
  if (ageH < 720) return 45 // 30d
  return 25
}

// ===== NEWS INTELLIGENCE — CATEGORY CLASSIFIER + BALANCER =====
// Priority Algeria keywords (Arabic + French + English).
const NEWS_DZ_KEYWORDS = [
  // Arabic
  'الجزائر', 'الجزائرية', 'الجزائريين', 'الجزائريون', 'جزائري',
  'الحكومة', 'الرئيس', 'تبون', 'الوزير', 'البرلمان', 'وزارة',
  'اقتصاد', 'مجتمع', 'سياسة', 'الديوان', 'الولاية', 'العاصمة',
  // French
  'algérie', 'algerie', 'alger', 'algerien', 'algérien', 'algériens',
  'gouvernement', 'économie', 'economie', 'politique', 'société', 'societe',
  'wilaya', 'tebboune', 'ministère', 'ministre',
  // English
  'algeria', 'algiers', 'algerian',
]
const NEWS_SPORTS_KEYWORDS = [
  'رياضة', 'مباراة', 'كرة', 'دوري', 'بطولة', 'لاعب', 'هدف', 'فريق',
  'sport', 'football', 'soccer', 'match', 'league', 'goal', 'player',
  'foot', 'équipe', 'championnat',
]
const NEWS_INTL_HINTS = [
  'world', 'international', 'global', 'usa', 'china', 'russia', 'europe',
  'دولي', 'عالمي', 'أمريكا', 'الصين', 'روسيا', 'أوروبا', 'فلسطين', 'غزة',
  'mondial', 'monde', 'états-unis', 'chine', 'russie',
]
function _lcText(item) {
  return ((item?.title || '') + ' ' + (item?.description || '') + ' ' + (item?.source || '') + ' ' + (item?.feedName || '')).toLowerCase()
}
function classifyNewsArticle(item) {
  const t = _lcText(item)
  const hasSport = NEWS_SPORTS_KEYWORDS.some(k => t.includes(k))
  const hasDz    = NEWS_DZ_KEYWORDS.some(k => t.includes(k))
  const hasIntl  = NEWS_INTL_HINTS.some(k => t.includes(k))
  if (hasSport && !hasDz) return 'sports'
  if (hasSport && hasDz)  return 'national_dz' // Algerian sport story → national bucket
  if (hasDz)              return 'national_dz'
  if (hasIntl)            return 'international'
  return 'international'
}
// Algeria-aware relevance score (0-100). Combines location, freshness, source.
const NEWS_TRUST = {
  'aps.dz': 95, 'echoroukonline.com': 82, 'ennaharonline.com': 80,
  'elkhabar.com': 85, 'elbilad.net': 78, 'djazairess.com': 88,
  'aljazeera.net': 88, 'bbc.co.uk': 90, 'reuters.com': 95,
  'news.google.com': 75,
}
function _sourceTrust(item) {
  const s = ((item?.source || '') + ' ' + (item?.link || '') + ' ' + (item?.feedName || '')).toLowerCase()
  for (const [host, score] of Object.entries(NEWS_TRUST)) if (s.includes(host)) return score
  return 60
}
function newsRelevanceScore(item) {
  const cat = classifyNewsArticle(item)
  const loc = cat === 'national_dz' ? 100 : cat === 'sports' ? 50 : 70
  const fresh = freshnessScore(item)
  const trust = _sourceTrust(item)
  return Math.round(loc * 0.45 + fresh * 0.35 + trust * 0.20)
}
// Dedup by title similarity using normalised fingerprints + Jaccard token check.
function _normTitle(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function _tokens(s) {
  const set = new Set(_normTitle(s).split(' ').filter(w => w.length > 2))
  return set
}
function _jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}
function dedupByTitleSimilarity(items, threshold = 0.7) {
  const out = []
  const tokenized = []
  for (const it of items) {
    const tk = _tokens(it.title || '')
    let dup = false
    for (let i = 0; i < tokenized.length; i++) {
      if (_jaccard(tk, tokenized[i]) >= threshold) { dup = true; break }
    }
    if (!dup) { out.push(it); tokenized.push(tk) }
  }
  return out
}
// Enforce category balance: ≤30% sports, ≥40% national, rest international.
function balanceNewsCategories(items, target = 18) {
  const tagged = items.map(i => ({ ...i, _cat: classifyNewsArticle(i), _score: newsRelevanceScore(i) }))
  const byCat = { national_dz: [], international: [], sports: [] }
  for (const it of tagged) (byCat[it._cat] || byCat.international).push(it)
  for (const k of Object.keys(byCat)) {
    byCat[k].sort((a, b) => (b._score - a._score) || (new Date(b.pubDate || 0) - new Date(a.pubDate || 0)))
  }
  const maxSports = Math.floor(target * 0.30)
  const minNat    = Math.ceil(target * 0.40)
  const out = []
  out.push(...byCat.national_dz.slice(0, Math.max(minNat, Math.min(byCat.national_dz.length, target))))
  const remainingAfterNat = target - out.length
  const intlSlice = byCat.international.slice(0, Math.max(0, remainingAfterNat - Math.min(maxSports, byCat.sports.length)))
  out.push(...intlSlice)
  const sportsSlice = byCat.sports.slice(0, Math.min(maxSports, target - out.length))
  out.push(...sportsSlice)
  // Trim or top up if needed
  if (out.length < target) {
    const pool = [...byCat.national_dz, ...byCat.international, ...byCat.sports].filter(x => !out.includes(x))
    out.push(...pool.slice(0, target - out.length))
  }
  // Final sort: year-priority first (2026 > 2025 > older), then publishedAt DESC,
  // then relevance score as tiebreaker.
  out.sort((a, b) => {
    const yp = _itemYearPriority(b) - _itemYearPriority(a)
    if (yp !== 0) return yp
    const dt = (new Date(b.pubDate || 0)) - (new Date(a.pubDate || 0))
    if (dt !== 0) return dt
    return b._score - a._score
  })
  // Strip internal helper fields before returning
  return out.slice(0, target).map(({ _cat, _score, ...rest }) => ({ ...rest, category: _cat }))
}

// Calls DeepSeek with timeout protection + circuit breaker. Returns content string or null.
async function callDeepSeek(messages, { timeoutMs = 25000, max_tokens = 3000 } = {}) {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) return null
  if (!deepseekCircuit.isAvailable()) {
    console.warn('[DeepSeek] circuit open — skipping')
    return null
  }
  const t0 = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages, max_tokens, temperature: 0.7, stream: false }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!r.ok) {
      console.warn(`[DeepSeek] HTTP ${r.status}`)
      deepseekCircuit.recordFailure(`HTTP ${r.status}`)
      return null
    }
    const d = await r.json()
    const content = d.choices?.[0]?.message?.content || null
    if (content) deepseekCircuit.recordSuccess()
    else deepseekCircuit.recordFailure('empty response')
    return content
  } catch (err) {
    console.warn('[DeepSeek] error:', err.message)
    deepseekCircuit.recordFailure(err.message)
    return null
  }
}

// Calls Ollama proxy with timeout protection + circuit breaker. Returns content string or null.
async function callOllama(messages, { timeoutMs = 25000 } = {}) {
  const url = process.env.OLLAMA_PROXY_URL
  if (!url) return null
  if (!ollamaCircuit.isAvailable()) {
    console.warn('[Ollama] circuit open — skipping')
    return null
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const r = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3', messages, stream: false }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!r.ok) { ollamaCircuit.recordFailure(`HTTP ${r.ok}`); return null }
    const d = await r.json()
    const content = d.message?.content || null
    if (content) ollamaCircuit.recordSuccess()
    else ollamaCircuit.recordFailure('empty response')
    return content
  } catch (err) {
    console.warn('[Ollama] error:', err.message)
    ollamaCircuit.recordFailure(err.message)
    return null
  }
}

// Master fallback: tries DeepSeek → Ollama → multiple Groq models.
// Returns { content, model } where content is validated, or { content: null }.
// ── Wrapped with: concurrency semaphore + in-flight deduplication ──────────
// taskHint (optional): 'realtime'|'multilingual'|'technical'|'retrieval'|'reasoning'|'general'|'website'|'html'|'code'
// Used by the capability-aware AI router when all primary providers fail.
async function _safeGenerateAI_inner({ messages, query = '', max_tokens = 3000, taskHint = 'general' }) {
  const trimmed = trimRelevantContext(messages, 8)
  // Website/code generation needs more tokens — allow up to 8000; all others capped at 4096
  const _isHeavyGen = taskHint === 'website' || taskHint === 'html' || taskHint === 'code'
  const effectiveTokens = _isHeavyGen ? Math.min(max_tokens, 8000) : Math.min(max_tokens, 4096)

  // ── Smart model selection ────────────────────────────────────────────────────
  // Complex queries (Arabic, long, knowledge-heavy) → skip 8b, go straight to 70b
  // Simple/conversational → 8b-instant first (ultra-fast ~0.4s)
  const _arabicCount = (query.match(/[\u0600-\u06FF]/g) || []).length
  const _isComplex = (
    query.length > 80 ||
    _arabicCount > 20 ||
    /مباراة|نتيجة|أخبار|طقس|شرح|كيف|ماذا|لماذا|ترتيب|إحصاء|قانون|فيديو|أغنية|اكتب|أنشئ|برمجة|كود/.test(query) ||
    taskHint === 'reasoning' || taskHint === 'multilingual' || taskHint === 'retrieval' ||
    taskHint === 'website' || taskHint === 'html' || taskHint === 'code'
  )

  // Max 2 Groq attempts: right model first, one backup — never iterate all 4 models
  const groqModels = _isComplex
    ? ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct']
    : ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']

  for (const model of groqModels) {
    const { content } = await callGroqWithFallback({ model, messages: trimmed, max_tokens: effectiveTokens })
    if (validateAIContent(content, query)) return { content, model }
    if (content) logInvalidResponse(`groq:${model}`, query, content)
  }

  // ── Parallel provider race — fastest good answer wins ───────────────────────
  // After Groq fails, race multiple providers simultaneously instead of sequential fallback
  console.warn(`[AI] Groq exhausted — parallel provider race (hint=${taskHint})`)
  try {
    const raceCandidates = [
      // DeepSeek: fast if funded
      process.env.DEEPSEEK_API_KEY
        ? callDeepSeek(trimmed, { max_tokens, timeoutMs: 7000 }).then(c => validateAIContent(c, query) ? { content: c, model: 'deepseek-chat' } : null).catch(() => null)
        : null,
      // Router — Gemini/Mistral/Cohere based on taskHint
      callAIRouter(trimmed, { max_tokens, taskHint }).then(r => r?.content && validateAIContent(r.content, query) ? r : null).catch(() => null),
    ].filter(Boolean)

    if (raceCandidates.length > 0) {
      // Promise.any: resolves with first non-null good result
      const winner = await Promise.any(
        raceCandidates.map(p => p.then(r => r ?? Promise.reject(new Error('empty'))))
      ).catch(() => null)
      if (winner?.content) {
        console.log(`[AI] ✓ parallel race winner: ${winner.model}`)
        return winner
      }
    }
  } catch { /* ignore — all parallel attempts failed */ }

  // ── Pollinations.ai free text (no API key — always available) ─────────────
  try {
    const seed = Math.floor(Math.random() * 999999)
    const polRes = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai-large',
        messages: trimmed,
        seed,
        private: true,
      }),
      signal: AbortSignal.timeout(22000),
    })
    if (polRes.ok) {
      const polData = await polRes.json()
      const content = polData.choices?.[0]?.message?.content || null
      if (content && content.trim().length > 5) {
        console.log('[AI] ✓ Pollinations text fallback')
        return { content: content.trim(), model: 'pollinations/openai-large' }
      }
    }
  } catch (e) { console.warn('[AI] Pollinations text failed:', e.message) }

  return { content: null, model: null }
}

async function safeGenerateAI({ messages, query = '', max_tokens = 3000, taskHint = 'general' }) {
  // Build a stable dedup key from the last user message + query
  const lastMsg = [...(messages || [])].reverse().find(m => m?.role === 'user')?.content || ''
  const dedupKey = `ai:${String(query || lastMsg).slice(0, 120).trim()}`

  const t0 = Date.now()
  try {
    // Semaphore limits max concurrent AI calls to 6; deduplicator collapses parallel identical queries
    const result = await aiDeduplicator.run(dedupKey, () =>
      aiSemaphore.run(() =>
        stallGuard(
          () => _safeGenerateAI_inner({ messages, query, max_tokens, taskHint }),
          35_000,
          'safeGenerateAI'
        )
      )
    )
    agentMonitor.record(!!result?.content, Date.now() - t0)
    return result || { content: null, model: null }
  } catch (err) {
    agentMonitor.record(false, Date.now() - t0)
    console.warn('[safeGenerateAI] error:', err.message)
    return { content: null, model: null }
  }
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
        signal: AbortSignal.timeout(7000),
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
      groqCircuit.recordSuccess()
      console.log(`[Groq:Rotation] K${keyIndex} ✓ ${elapsed}ms | model:${model}`)
      if (Math.random() < 0.1) logKeyStats() // log stats 10% of the time
      return { content }

    } catch (err) {
      recordError(key, 'network')
      groqCircuit.recordFailure(err.message)
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
  return { content: null, error: 'والله يا صاحبي راني عيان شوية 😅\nخليني نرتاح ونرجعلك بعد قليل — سامحني 🤍\n\n_(All AI providers are currently busy or rate-limited. Please try again in a moment.)_' }
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

// ===== SYSTEM HEALTH API (resilience layer) =====
app.get('/api/system-health', (_req, res) => {
  try {
    res.json(systemHealthSnapshot())
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ===== AI ROUTER HEALTH API =====
app.get('/api/ai-router/health', (_req, res) => {
  try {
    res.json({
      ok: true,
      providers: getProviderStatus(),
      metrics: getRouterHealthSnapshot(),
      ts: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ===== QURAN KEYWORD SEARCH — RAG with tafsir injection =====
// Searches Quran.com for verses by keyword, then fetches tafsir for top results
app.get('/api/quran/search', async (req, res) => {
  const q = sanitizeString(String(req.query.q || '').trim(), 200)
  if (!q || q.length < 2) return res.status(400).json({ ok: false, error: 'كلمة البحث مطلوبة (حرفان على الأقل)' })

  const CDN = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir'
  const size = Math.min(parseInt(req.query.size, 10) || 5, 10)

  try {
    // 1. Search Quran.com
    const searchCtrl = new AbortController()
    const searchTimer = setTimeout(() => searchCtrl.abort(), 8000)
    const searchRes = await fetch(
      `https://api.quran.com/api/v4/search?q=${encodeURIComponent(q)}&size=${size}&language=ar`,
      { signal: searchCtrl.signal }
    )
    clearTimeout(searchTimer)
    if (!searchRes.ok) return res.json({ ok: true, query: q, results: [], note: 'تعذر الوصول إلى قاعدة بيانات القرآن الكريم' })
    const searchData = await searchRes.json()
    const rawResults = searchData.search?.results || []
    if (!rawResults.length) return res.json({ ok: true, query: q, results: [], total: 0 })

    // 2. Fetch tafsir (ibn-kathir) for top 3 results in parallel
    const withTafsir = await Promise.allSettled(
      rawResults.slice(0, 3).map(async (r) => {
        const [surah, ayah] = (r.verse_key || '').split(':').map(Number)
        let tafsir = ''
        if (surah && ayah) {
          try {
            const ctrl = new AbortController()
            const t = setTimeout(() => ctrl.abort(), 5000)
            const tf = await fetch(`${CDN}/ar-tafsir-ibn-kathir/${surah}/${ayah}.json`, { signal: ctrl.signal })
            clearTimeout(t)
            if (tf.ok) {
              const td = await tf.json()
              tafsir = (td.text || '').slice(0, 600)
            }
          } catch {}
        }
        return {
          verse_key: r.verse_key,
          surah,
          ayah,
          text: r.text || '',
          tafsir: tafsir || null,
        }
      })
    )

    const results = [
      ...withTafsir.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean),
      ...rawResults.slice(3).map(r => {
        const [surah, ayah] = (r.verse_key || '').split(':').map(Number)
        return { verse_key: r.verse_key, surah, ayah, text: r.text || '', tafsir: null }
      }),
    ]

    res.json({ ok: true, query: q, total: searchData.search?.total_results || results.length, results })
  } catch (e) {
    res.json({ ok: true, query: q, results: [], note: 'خطأ في البحث: ' + e.message })
  }
})

// ===== QURAN CONTEXT — RAG endpoint (tafsir_api + Dorar reference) =====
// Fetches verified tafsir from spa5k/tafsir_api CDN for a specific surah:ayah
// Dorar.net (dorar.net/api) is listed as a reference source in the system prompt;
// their API requires a key we don't have yet — will be wired when available.
app.get('/api/quran/context', async (req, res) => {
  const surah = parseInt(req.query.surah, 10)
  const ayah  = parseInt(req.query.ayah,  10)
  if (!surah || !ayah || surah < 1 || surah > 114 || ayah < 1) {
    return res.status(400).json({ ok: false, error: 'surah (1-114) و ayah مطلوبان' })
  }

  const CDN = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir'
  const TAFSIRS = [
    { slug: 'ar-tafsir-ibn-kathir', label: 'ابن كثير' },
    { slug: 'ar-tafsir-muyassar',   label: 'التفسير الميسر' },
    { slug: 'ar-tafsir-al-saadi',   label: 'السعدي' },
  ]

  const fetched = await Promise.allSettled(
    TAFSIRS.map(async ({ slug, label }) => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 6000)
      try {
        const r = await fetch(`${CDN}/${slug}/${surah}/${ayah}.json`, { signal: ctrl.signal })
        clearTimeout(timer)
        if (!r.ok) return null
        const d = await r.json()
        const text = (d.text || '').trim()
        return text ? { label, text: text.slice(0, 1200) } : null
      } catch {
        clearTimeout(timer)
        return null
      }
    })
  )

  const tafsirs = fetched
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(Boolean)

  if (tafsirs.length === 0) {
    return res.json({ ok: true, surah, ayah, tafsirs: [], note: 'لم يُعثر على تفسير في قاعدة البيانات لهذه الآية.' })
  }

  res.json({ ok: true, surah, ayah, tafsirs })
})

app.get('/api/link-preview', async (req, res) => {
  const { url } = req.query
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'invalid url' })
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZBot/1.0)' }, signal: ctrl.signal })
    clearTimeout(t)
    const html = await r.text()
    const og = k => (html.match(new RegExp('<meta[^>]+property=["\']og:' + k + '["\'][^>]+content=["\']([^"\']{1,300})["\']', 'i')) || html.match(new RegExp('<meta[^>]+content=["\']([^"\']{1,300})["\'][^>]+property=["\']og:' + k + '["\']', 'i')) || [])[1] || ''
    const title = og('title') || (html.match(/<title[^>]*>([^<]{1,120})<\/title>/i) || [])[1] || ''
    const description = og('description') || (html.match(/<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']{1,250})["\'][^>]*>/i) || [])[1] || ''
    const image = og('image')
    res.set('Cache-Control', 'public,max-age=3600').json({ title: title.trim(), description: description.trim(), image, url })
  } catch { res.json({ title: '', description: '', image: '', url }) }
})

// ===== BREAKING NEWS: SSE STREAM =====
const _breakingSseClients = new Set()

app.get('/api/breaking-news/stream', (req, res) => {
  res.set({
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders()
  _breakingSseClients.add(res)

  const ping = setInterval(() => {
    try { res.write(':ping\n\n') }
    catch { clearInterval(ping); _breakingSseClients.delete(res) }
  }, 25_000)

  req.on('close', () => {
    clearInterval(ping)
    _breakingSseClients.delete(res)
  })
})

function broadcastBreakingNews(items) {
  const payload = `data: ${JSON.stringify({ type: 'breaking_news', items })}\n\n`
  for (const res of _breakingSseClients) {
    try { res.write(payload) }
    catch { _breakingSseClients.delete(res) }
  }
  // Also push into DZ Chat WebSocket
  try { broadcastChat({ type: 'breaking_news', items }) } catch {}
  console.log(`[BreakingNews] 📡 Pushed ${items.length} item(s) to ${_breakingSseClients.size} SSE client(s)`)
}

// ===== OWNER: COMMAND ENDPOINT =====
app.post('/api/owner/command', async (req, res) => {
  const { message, githubToken } = req.body || {}
  if (!message) return res.status(400).json({ error: 'message is required' })
  const tok = githubToken || process.env.GITHUB_TOKEN || ''
  const isOwner = await verifyOwnerToken(tok)
  if (!isOwner) {
    return res.status(403).json({ error: 'تحقق الهوية فشل — يجب أن تكون مالك المشروع (Nadirinfograph23).' })
  }
  const cfg = loadOwnerConfig()
  const result = processOwnerCommand(message, cfg)
  if (result.success && result.config) {
    saveOwnerConfig(result.config)
    if (result.feed) {
      const alreadyIn = RSS_FEEDS.national.some(f => f.url === result.feed.url)
      if (!alreadyIn) RSS_FEEDS.national.push({ name: result.feed.name, url: result.feed.url, _owner: true })
    }
  }
  res.json({ success: result.success, message: result.message, config: result.config })
})

app.get('/api/owner/config', async (req, res) => {
  const tok = req.headers.authorization?.replace('token ', '') || process.env.GITHUB_TOKEN || ''
  const isOwner = await verifyOwnerToken(tok)
  if (!isOwner) return res.status(403).json({ error: 'غير مصرح' })
  res.json(loadOwnerConfig())
})

// ===== OWNER: BREAKING-FEEDS MANAGEMENT =====

/** مساعد: التحقق من هوية المالك من Authorization أو body */
async function _ownerAuth(req, res) {
  const tok =
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') ||
    req.body?.githubToken ||
    process.env.GITHUB_TOKEN ||
    ''
  const ok = await verifyOwnerToken(tok)
  if (!ok) res.status(403).json({ ok: false, error: 'تحقق الهوية فشل — يجب أن تكون Nadirinfograph23.' })
  return ok
}

/** GET /api/owner/breaking-feeds — قائمة كل المصادر مع حالتها */
app.get('/api/owner/breaking-feeds', async (req, res) => {
  if (!await _ownerAuth(req, res)) return
  res.json({ ok: true, feeds: listFeeds() })
})

/** POST /api/owner/breaking-feeds — إضافة مصدر جديد { name, url } */
app.post('/api/owner/breaking-feeds', async (req, res) => {
  if (!await _ownerAuth(req, res)) return
  const { name, url } = req.body || {}
  const result = addFeed(name?.trim(), url?.trim())
  res.status(result.ok ? 200 : 400).json(result)
})

/** DELETE /api/owner/breaking-feeds — حذف مصدر { url } */
app.delete('/api/owner/breaking-feeds', async (req, res) => {
  if (!await _ownerAuth(req, res)) return
  const { url } = req.body || {}
  if (!url) return res.status(400).json({ ok: false, error: 'url مطلوب' })
  res.json(removeFeed(url))
})

/** PATCH /api/owner/breaking-feeds/pause — إيقاف مؤقت { url } */
app.patch('/api/owner/breaking-feeds/pause', async (req, res) => {
  if (!await _ownerAuth(req, res)) return
  const { url } = req.body || {}
  if (!url) return res.status(400).json({ ok: false, error: 'url مطلوب' })
  res.json(pauseFeed(url))
})

/** PATCH /api/owner/breaking-feeds/resume — استئناف { url } */
app.patch('/api/owner/breaking-feeds/resume', async (req, res) => {
  if (!await _ownerAuth(req, res)) return
  const { url } = req.body || {}
  if (!url) return res.status(400).json({ ok: false, error: 'url مطلوب' })
  res.json(resumeFeed(url))
})

/** POST /api/owner/breaking-feeds/poll — فحص فوري بدون انتظار 2 دقيقة */
app.post('/api/owner/breaking-feeds/poll', async (req, res) => {
  if (!await _ownerAuth(req, res)) return
  triggerPollNow().catch(() => {})
  res.json({ ok: true, message: 'بدأ الفحص الفوري — النتائج ستُبث عبر SSE إذا وُجدت أخبار عاجلة' })
})

// ===== ADMIN: ROUTER DIAGNOSTIC SUMMARY =====
app.get('/api/admin/router-diagnostic', (_req, res) => {
  try {
    res.json(getRouterDiagnosticSummary())
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ===== ADMIN: ROUTER LOGS =====
app.get('/api/admin/router-logs', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500)
    const provider = req.query.provider || null
    res.json({ logs: getRouterLogs(limit, provider), ts: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ===== ADMIN: PROVIDER SCORES =====
app.get('/api/admin/provider-scores', (_req, res) => {
  try {
    res.json({ scores: getProviderScores(), ts: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ===== ADMIN: RESET PROVIDER SCORE =====
app.post('/api/admin/reset-provider/:provider', (req, res) => {
  const ALLOWED = ['openai', 'gemini', 'mistral', 'nvidia', 'cohere', 'openrouter', 'groq', 'deepseek', 'ollama']
  const { provider } = req.params
  if (!ALLOWED.includes(provider)) {
    return res.status(400).json({ ok: false, error: `Unknown provider: ${provider}` })
  }
  try {
    resetProviderScore(provider)
    res.json({ ok: true, provider, msg: `Score for ${provider} reset to 100` })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ===== ADMIN: TEST SINGLE PROVIDER =====
app.post('/api/admin/test-provider', async (req, res) => {
  const { provider } = req.body || {}
  if (!provider || typeof provider !== 'string') {
    return res.status(400).json({ ok: false, error: 'provider name required' })
  }
  const allowed = ['openai', 'gemini', 'mistral', 'nvidia', 'cohere', 'openrouter', 'groq']
  if (!allowed.includes(provider)) {
    return res.status(400).json({ ok: false, error: `Unknown provider: ${provider}` })
  }

  // Groq is tested separately via existing infrastructure
  if (provider === 'groq') {
    const keys = getGroqKeys()
    if (!keys.length) return res.json({ ok: false, error: 'No Groq API key configured (AI_API_KEY)' })
    const t0 = Date.now()
    try {
      const { content, error } = await callGroqWithFallback({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_tokens: 10,
      })
      if (content) {
        return res.json({ ok: true, model: 'groq:llama-3.1-8b-instant', latencyMs: Date.now() - t0 })
      }
      return res.json({ ok: false, error: error || 'Empty response from Groq' })
    } catch (e) {
      return res.json({ ok: false, error: e.message })
    }
  }

  // Other providers via ai-router
  try {
    const result = await testSingleProvider(provider)
    return res.json(result)
  } catch (e) {
    return res.json({ ok: false, error: e.message })
  }
})

// ===== ADMIN: FULL SYSTEM REPORT =====
app.get('/api/admin/full-report', async (_req, res) => {
  try {
    const [syncResult] = await Promise.allSettled([
      Promise.race([
        fetch(`http://localhost:${PORT}/api/dz-agent/sync-status`).then(r => r.json()),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
      ]),
    ])
    const sync = syncResult.status === 'fulfilled' ? syncResult.value : null

    res.json({
      generated: new Date().toISOString(),
      systemHealth: systemHealthSnapshot(),
      routerDiagnostics: getRouterDiagnosticSummary(),
      providerStatus: getProviderStatus(),
      groqKeys: (() => {
        const keys = getGroqKeys()
        return { count: keys.length, configured: keys.length > 0 }
      })(),
      environmentKeys: {
        GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
        VERCEL_TOKEN: !!process.env.VERCEL_TOKEN,
        GROQ_API_KEY: getGroqKeys().length > 0,
        GEMINI_API_KEY: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
        MISTRAL_API_KEY: !!process.env.MISTRAL_API_KEY,
        NVIDIA_API_KEY: !!process.env.NVIDIA_API_KEY,
        COHERE_API_KEY: !!process.env.COHERE_API_KEY,
        OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
        AI_INTEGRATIONS_OPENAI: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
        HF_TOKEN: !!(process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY),
        OPENWEATHER: !!process.env.OPENWEATHER_API_KEY,
        GOOGLE_CSE: !!((process.env.GOOGLE_API_KEY_NEW || process.env.GOOGLE_API_KEY) && process.env.GOOGLE_CSE_ID),
      },
      sync,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

// ===== /api/chat/stream — SSE Streaming (Improvement #1: Real-time token output) =====
// Streams Groq tokens via SSE so users see responses as they're generated, not after.
app.post('/api/chat/stream', aiLimiter, async (req, res) => {
  const { model } = req.body
  const messages = normalizeChatMessages(req.body?.messages)
  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages payload.' })
  }

  const keys = getGroqKeys()
  if (!keys.length) return res.status(500).json({ error: 'API key not configured.' })

  const groqModelMap = {
    'chatgpt': 'llama-3.3-70b-versatile',
    'llama-70b': 'llama-3.3-70b-versatile',
    'llama-8b': 'llama-3.1-8b-instant',
    'llama-4-scout': 'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen': 'qwen/qwen3-32b',
    'compound': 'groq/compound',
  }
  const actualModel = groqModelMap[model] || 'llama-3.3-70b-versatile'
  const trimmed = trimRelevantContext(messages, 8)
  const apiKey = keys[Math.floor(Math.random() * keys.length)]

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch {}
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: actualModel, messages: trimmed, max_tokens: 4096, stream: true }),
      signal: AbortSignal.timeout(45000),
    })

    if (!groqRes.ok) {
      send('error', { message: 'فشل الاتصال بالنموذج' })
      return res.end()
    }

    const reader = groqRes.body.getReader()
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
        if (raw === '[DONE]') { send('done', {}); res.end(); return }
        try {
          const chunk = JSON.parse(raw)
          const token = chunk.choices?.[0]?.delta?.content
          if (token) send('token', { token })
        } catch {}
      }
    }
    send('done', {})
    res.end()
  } catch (e) {
    send('error', { message: e.message })
    res.end()
  }
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

  const _chatT0 = Date.now()
  try {
    const trimmed = trimRelevantContext(messages, 8)
    const lastQuery = [...trimmed].reverse().find(m => m.role === 'user')?.content || ''
    const { content, error } = await callGroqWithFallback({ model: actualModel, messages: trimmed })
    if (validateAIContent(content, lastQuery)) {
      chatMonitor.record(true, Date.now() - _chatT0)
      return res.status(200).json({ content })
    }
    if (content) logInvalidResponse(`chat:${actualModel}`, lastQuery, content)

    // Try a second Groq model before failing
    const secondaryModel = actualModel === 'llama-3.3-70b-versatile'
      ? 'llama-3.1-8b-instant'
      : 'llama-3.3-70b-versatile'
    const retry = await callGroqWithFallback({ model: secondaryModel, messages: trimmed })
    if (validateAIContent(retry.content, lastQuery)) {
      chatMonitor.record(true, Date.now() - _chatT0)
      return res.status(200).json({ content: retry.content, fallbackModel: secondaryModel })
    }
    if (retry.content) logInvalidResponse(`chat:${secondaryModel}`, lastQuery, retry.content)

    chatMonitor.record(false, Date.now() - _chatT0)
    return res.status(500).json({ error: error || retry.error || 'No response generated.' })
  } catch (error) {
    chatMonitor.record(false, Date.now() - _chatT0)
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

// ── Hard freshness filter: drop items older than maxAgeDays ──────────────────
// Items with no parseable date are kept (we cannot determine their age).
function filterFreshItems(items, maxAgeDays = 60) {
  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  return items.filter(item => {
    const dateStr = item.pubDate || item.date || item.publishedDate || ''
    if (!dateStr) return true
    const ts = new Date(dateStr).getTime()
    if (isNaN(ts)) return true
    return ts >= cutoffMs
  })
}

// ── Build a Google News RSS URL with an `after:` date restriction ─────────────
// maxAgeDays controls how far back to go (default: 30 days for news queries)
function buildFreshGNRssUrl(query, lang = 'ar', maxAgeDays = 30) {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000)
  const afterStr = cutoff.toISOString().split('T')[0] // YYYY-MM-DD
  const hl = lang === 'ar' ? 'ar&gl=DZ&ceid=DZ:ar' : 'en&gl=US&ceid=US:en'
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' after:' + afterStr)}&hl=${hl}`
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

// ── Map Website Builder: query detection ─────────────────────────────────────
function detectMapWebsiteQuery(msg) {
  const lower = msg.toLowerCase()
  const keywords = [
    // Arabic — explicit map website
    'موقع خريطة', 'موقع مع خريطة', 'موقع خرائط', 'صفحة خريطة', 'صفحة مع خريطة',
    'أنشئ خريطة تفاعلية', 'انشئ خريطة تفاعلية', 'اصنع خريطة تفاعلية',
    'موقع يعرض خريطة', 'موقع فيه خريطة', 'موقع بخريطة',
    'اصنع موقع خريطة', 'أنشئ موقع خريطة', 'ابني موقع خريطة', 'عمل موقع خريطة',
    'موقع جغرافي', 'موقع تتبع', 'موقع للخريطة', 'تطبيق خريطة',
    'خريطة تفاعلية كموقع', 'خريطة ويب', 'صفحة خرائط',
    'اعمل موقع خرائط', 'صمم موقع خريطة', 'موقع خرائط تفاعلية',
    // English
    'map website', 'map site', 'map web app', 'website with map', 'site with map',
    'map application', 'create map website', 'build map website', 'leaflet website',
    'interactive map website', 'location website', 'mapping website',
    'create a map site', 'build a map app', 'generate a map website',
    'map page', 'map-based website', 'geo website',
    // French
    'site avec carte', 'site de carte', 'site cartographique', 'application carte',
    'créer une carte interactive', 'site web avec carte', 'carte interactive site',
    'site web carte', 'page web carte',
  ]
  return keywords.some(k => lower.includes(k))
}

// ── Website Builder: query detection ─────────────────────────────────────────
function detectWebsiteBuilderQuery(msg) {
  // Map website requests are handled separately
  if (detectMapWebsiteQuery(msg)) return false

  // ── GUARD: YouTube / Video / Music queries → NEVER route to web builder ──
  // "الشاب خالد فيديو" / "ابحث عن اغنية" / "جيبلي كليب" → YouTube search, NOT website build
  const _hasVideoIntent = /(?:فيديو|يوتيوب|يوتيب|كليب|اغنية|أغنية|موسيقى|نشيد|أنشودة|مقطع|شاهد|watch|youtube|video|music|clip|song)/i.test(msg)
  const _hasExplicitBuildWithWeb = /(?:ابني|اصنع|أنشئ|انشئ|صمم|اعمل|أعمل|دير|create|build|make|design)\s+(?:موقع|صفحة|تطبيق|site|page|app|html)/i.test(msg)
  if (_hasVideoIntent && !_hasExplicitBuildWithWeb) return false

  // ── GUARD: Simple search / question queries — NOT website build ──
  // "ابحث عن X" / "ما هو X" / "من هو X" → search/info request, not build
  if (/^(?:ابحث|ابحثلي|جيبلي|عطيني|اخبرني|ما هو|ما هي|من هو|من هي|متى|أين|كم|شكون|وش|علاش)\s/i.test(msg.trim())) return false

  // ── GUARD: Code Review / Analysis / Debug requests — NEVER route to web builder ──
  // If the message contains a code block (```) it's a review/debug request, not a build request
  if (/```/.test(msg)) {
    // Only skip builder if combined with a review/analysis verb OR if no explicit build keyword
    const reviewVerbs = /(?:راجع|اراجع|افحص|اشرح|شرح|اصلح|أصلح|صحح|اقترح|حسّن|حسن|optimize|refactor|review|explain|debug|fix|analyze|analyse|improve|check|inspect|أصلح|حلل|تحليل)/i
    const codeNouns = /(?:الكود|هذا الكود|كودي|كود|snippet|function|class|component|script|module)/i
    if (reviewVerbs.test(msg) || codeNouns.test(msg)) return false
    // Message has code block with no clear build instruction — treat as code chat
    const explicitBuildInBlock = /(?:أنشئ موقع|انشئ موقع|اصنع موقع|ابني موقع|build website|create website|make website|landing page)/i
    if (!explicitBuildInBlock.test(msg)) return false
  }

  // ── GUARD: "هذا الكود / الكود / كودي" + review signals — pure code assistance ──
  const isCodeReview = /(?:راجع|اراجع|افحص|اشرح|اقترح تحسينات|اقترح|أصلح|اصلح|حسّن|صحح)\s+(?:هذا\s+)?(?:الكود|كود|snippet)/i
  const isCodeReviewEn = /(?:review|fix|debug|refactor|explain|optimize|improve|check)\s+(?:this\s+)?(?:code|snippet|function|class|component)/i
  if (isCodeReview.test(msg) || isCodeReviewEn.test(msg)) return false

  const lower = msg.toLowerCase()
  const keywords = [
    // Arabic — verbs + "موقع/صفحة" (all spelling variants of أنشئ/انشئ/إنشأ/إنشاء)
    'أنشئ موقع', 'انشئ موقع', 'إنشأ موقع', 'انشأ موقع', 'أنشأ موقع', 'إنشاء موقع',
    'اصنع موقع', 'ابني موقع', 'أبني موقع', 'اعمل موقع', 'أعمل موقع', 'اعملي موقع',
    'أنشئ صفحة', 'انشئ صفحة', 'إنشأ صفحة', 'انشأ صفحة', 'إنشاء صفحة',
    'صمم موقع', 'صمم صفحة', 'اصنع صفحة', 'بني موقع', 'بنيلي موقع',
    'موقع ويب كامل', 'صفحة هبوط', 'صمملي', 'طور موقع', 'طوّر موقع', 'اكتب كود موقع',
    'اصنعلي موقع', 'صمملي موقع', 'ابنيلي موقع', 'عملي موقع',
    'واجهة مستخدم', 'تطبيق ويب', 'صفحة بورتفوليو',
    'موقع شركة', 'موقع تجاري', 'موقع متجر', 'موقع مطعم', 'موقع فندق',
    'موقع وكالة', 'موقع مدرسة', 'موقع شخصي', 'موقع احترافي',
    'موقع مطعم', 'موقع فندق', 'موقع متجر', 'موقع صيدلية', 'موقع نادي',
    'موقع جمعية', 'موقع مؤسسة', 'موقع عيادة', 'موقع حلاق', 'موقع مصبغة',
    'site restaurant', 'site hôtel', 'site hotel', 'site boutique', 'site école',
    'لوحة تحكم', 'لوحة إدارة', 'صفحة متجر',
    'اصنع لي موقع', 'ابني لي موقع', 'عمل موقع', 'نريد موقع',
    'موقع HTML', 'موقع html', 'كود موقع', 'كود HTML', 'كود html',
    'صفحة ويب', 'اعمل صفحة', 'صمم لي موقع', 'طورلي موقع',
    'انشئ لي موقع', 'أنشئ لي موقع', 'إنشأ لي موقع', 'أنشئلي موقع', 'انشئلي موقع',
    // Darija (Algerian)
    'دير موقع', 'عمل لي موقع', 'ابنيلي موقع', 'صنعلي موقع',
    'دير لي موقع', 'دير لينا موقع', 'عملي موقع', 'صمملي موقع',
    'بغيت موقع', 'نحتاج موقع', 'نبغي موقع',
    // English
    'landing page', 'build website', 'create website', 'generate website', 'make website',
    'design website', 'make a landing', 'build a landing', 'portfolio website',
    'business website', 'company website', 'startup website', 'saas website', 'saas landing',
    'html website', 'html page', 'create html', 'build html', 'generate html', 'write html',
    'dashboard ui', 'analytics dashboard', 'create dashboard', 'build dashboard', 'admin dashboard',
    'e-commerce', 'ecommerce site', 'shop website', 'store website', 'product page',
    'personal website', 'personal site', 'portfolio site', 'blog website',
    'web app', 'web application', 'single page', 'one page website',
    'portfolio page', 'restaurant website', 'hotel website', 'agency website',
    'make me a website', 'create me a website', 'build me a website',
    // Web editor / CodePen-like
    'محرر ويب', 'محرر كود', 'web editor', 'code editor', 'codepen', 'code pen',
    'محرر html', 'محرر برمجي', 'بيئة برمجة', 'playground',
    // French
    'crée un site', 'créer un site', 'faire un site', 'site web', 'page web',
    'construire un site', 'générer un site', 'design un site', 'tableau de bord',
    'page de destination', 'site e-commerce', 'boutique en ligne',
    'créer une page', 'faire une page', 'site vitrine', 'site portfolio',
    'créer un site restaurant', 'site restaurant', 'site hotel', 'site boutique',
  ]
  if (keywords.some(k => lower.includes(k))) return true

  // Extra pattern: creation verb + topic keyword (catches "إنشأ موقع مطعم", "أنشئ صفحة فندق", etc.)
  const creationVerbs = /(?:أنش[أئ]|انش[أئ]|إنش[أئا]|اصنع|ابني?|اعمل|أعمل|عمل|صمم|دير|طور|بني?|generate|create|build|make|design|créer?|faire|construire)\s/i
  const webNouns = /(?:موقع|صفحة|site|page|web|html|تطبيق ويب|web app)/i
  if (creationVerbs.test(msg) && webNouns.test(msg)) return true

  return false
}

// ── Code Execution Mode Detection (Programming Section ONLY) ─────────────────
function detectCodeExecutionQuery(msg) {
  const lower = msg.toLowerCase()

  // Strong programming signals — if ANY of these exist, it's definitely code
  const hasLangKw = /(?:python|javascript|js\b|typescript|ts\b|react|node|html|css|php|java\b|c\+\+|c#|rust|go\b|sql|bash|shell|بايثون|جافاسكريبت)/i.test(lower)
  const hasCodeKw = /(?:كود|دالة|function|class|سكريبت|script|برنامج|program|algorithm|خوارزمية|مصفوفة|array|loop|حلقة|متغير|variable|API|json|regex)/i.test(lower)

  // If no programming language AND no code keyword → not a code query
  if (!hasLangKw && !hasCodeKw) return null

  // Non-code contexts: only block if there are NO programming indicators
  const nonCodeContexts = ['خريطة','طبيب','صيدلية','مسجد','صحف','صلاة','قرآن']
  if (nonCodeContexts.some(k => lower.includes(k)) && !hasLangKw) return null

  // Execution keywords: user wants code to be generated/run
  const execVerbs = [
    'اكتب كود','اكتب دالة','اكتب سكريبت','اكتب برنامج','اكتب تطبيق',
    'أنشئ كود','أنشئ دالة','أنشئ سكريبت','أنشئ برنامج',
    'نفذ','شغل','اعمل كود','اعمل دالة','اعمل برنامج',
    'اصنع كود','اصنع برنامج','اصنع سكريبت',
    'دير كود','دير دالة','دير برنامج','دير سكريبت',
    'write code','write function','write script','write program',
    'create code','create function','create script','create program',
    'build code','build function','build script','build program',
    'run code','execute code','make code','make function','make program',
    'écris un code','créer un programme','écrire une fonction',
    'اكتب لي','اكتب لي كود','اكتب لي دالة','اكتب لي برنامج',
    'اعملي كود','اعملي دالة','اعملي برنامج',
  ]
  if (execVerbs.some(k => lower.includes(k))) {
    return detectExecLanguage(lower)
  }

  // Pattern: coding verb + language keyword
  const codingVerb = /(?:اكتب|أنشئ|انشئ|نفذ|شغل|اعمل|دير|اصنع|write|create|build|make|run|execute)\s/i
  if (codingVerb.test(msg) && hasLangKw) {
    return detectExecLanguage(lower)
  }

  // Direct code-related commands
  const directCode = [
    'كود python','كود javascript','كود js','كود html',
    'دالة python','دالة javascript','دالة js',
    'سكريبت python','سكريبت javascript','سكريبت bash',
    'python code','javascript code','js code',
    'python function','javascript function',
    'python script','javascript script','bash script',
  ]
  if (directCode.some(k => lower.includes(k))) {
    return detectExecLanguage(lower)
  }

  return null
}

function detectExecLanguage(lower) {
  if (/python|بايثون|\.py\b/i.test(lower)) return 'python'
  if (/javascript|js\b|node|جافاسكريبت/i.test(lower)) return 'javascript'
  if (/typescript|ts\b/i.test(lower)) return 'javascript'
  if (/html|css|واجهة/i.test(lower)) return 'html'
  if (/bash|shell|terminal|سكريبت/i.test(lower)) return 'javascript' // fallback to JS
  if (/react|vue|angular|svelte/i.test(lower)) return 'html'
  if (/php|java\b|c\+\+|c#|rust|go\b|sql/i.test(lower)) return 'python' // show code, no exec
  return 'python' // default
}

const CODE_EXECUTION_SYSTEM_PROMPT = `You are DZ Agent in CODE EXECUTION MODE.
Your job: generate COMPLETE, RUNNABLE code that works immediately.

RULES:
1. Output ONLY code — no explanations before or after the code block
2. Code must be COMPLETE and SELF-CONTAINED — include all imports, dependencies, sample data
3. Code must WORK when executed directly — no placeholders, no "TODO", no "..." ellipsis
4. After the code block, add a brief explanation in Arabic (2-3 lines max)

OUTPUT FORMAT — you MUST follow this exactly:
\`\`\`[language]
// complete runnable code here
\`\`\`

**شرح:** وصف مختصر بالعربية لما يفعله الكود

LANGUAGE-SPECIFIC RULES:
- Python: use print() for output, include sample data, no external APIs unless explicitly asked
- JavaScript: use console.log() for output, include sample data, write modern ES6+
- HTML: generate a complete HTML file with embedded CSS and JS, make it visually appealing

FORBIDDEN:
- ❌ No markdown before the code block
- ❌ No "هنا الكود" or similar preambles
- ❌ No incomplete code
- ❌ No placeholder values like [your_api_key] or TODO
- ❌ No input() in Python (use hardcoded sample data instead)
`

// ── Code Template Generator (AI-free fallback for common patterns) ────────────
function generateCodeTemplate(query, lang = 'python') {
  const q = query.toLowerCase()
  const isPython = lang === 'python' || lang === 'py'

  // ── Python templates ───────────────────────────────────────────────────────
  if (isPython) {
    // Hello world / print
    if (/مرحبا|hello|print.*مرحبا|اطبع|طباعة|print/i.test(q)) {
      return `# برنامج مرحبا بالعالم
print("مرحبا بالعالم!")
print("Hello, World!")
print("Bonjour le monde!")`
    }
    // Calculator
    if (/حساب|آلة حاسبة|calculator|جمع|طرح|ضرب|قسمة/i.test(q)) {
      return `# آلة حاسبة بسيطة
def calculator(a, op, b):
    if op == '+': return a + b
    if op == '-': return a - b
    if op == '*': return a * b
    if op == '/': return a / b if b != 0 else "خطأ: لا يمكن القسمة على صفر"
    return "عملية غير معروفة"

# أمثلة
print(f"10 + 5 = {calculator(10, '+', 5)}")
print(f"20 - 8 = {calculator(20, '-', 8)}")
print(f"6 × 7 = {calculator(6, '*', 7)}")
print(f"15 ÷ 3 = {calculator(15, '/', 3)}")`
    }
    // List / array
    if (/قائمة|list|مصفوفة|array|ترتيب|sort/i.test(q)) {
      return `# العمليات على القوائم في بايثون
fruits = ["تفاح", "موز", "برتقال", "عنب", "مانجو"]

print("القائمة الأصلية:", fruits)
print("عدد العناصر:", len(fruits))
print("أول عنصر:", fruits[0])
print("آخر عنصر:", fruits[-1])

# إضافة عنصر
fruits.append("فراولة")
print("بعد الإضافة:", fruits)

# ترتيب القائمة
fruits.sort()
print("بعد الترتيب:", fruits)

# البحث في القائمة
if "موز" in fruits:
    print("الموز موجود في القائمة")`
    }
    // Loop / for loop
    if (/حلقة|loop|for|تكرار|كرر/i.test(q)) {
      return `# أمثلة على الحلقات في بايثون

# حلقة for بسيطة
print("الأعداد من 1 إلى 10:")
for i in range(1, 11):
    print(i, end=" ")
print()

# حلقة for على قائمة
cities = ["الجزائر", "وهران", "قسنطينة", "عنابة", "سطيف"]
print("\\nمدن الجزائر:")
for i, city in enumerate(cities, 1):
    print(f"{i}. {city}")

# حلقة while
print("\\nجدول الضرب للعدد 5:")
n = 1
while n <= 10:
    print(f"5 × {n} = {5*n}")
    n += 1`
    }
    // Function / def
    if (/دالة|function|def|وظيفة/i.test(q)) {
      return `# أمثلة على الدوال في بايثون

def greet(name, lang="ar"):
    """دالة ترحيب بعدة لغات"""
    greetings = {
        "ar": f"مرحباً يا {name}!",
        "fr": f"Bonjour {name}!",
        "en": f"Hello, {name}!"
    }
    return greetings.get(lang, f"مرحبا {name}!")

def factorial(n):
    """حساب مضروب عدد"""
    if n <= 1: return 1
    return n * factorial(n - 1)

def is_prime(n):
    """التحقق من أن عدداً أولياً"""
    if n < 2: return False
    for i in range(2, int(n**0.5) + 1):
        if n % i == 0: return False
    return True

# استدعاء الدوال
print(greet("رياض", "ar"))
print(greet("Ahmed", "en"))
print(f"5! = {factorial(5)}")
print(f"7 عدد أولي: {is_prime(7)}")
print(f"10 عدد أولي: {is_prime(10)}")`
    }
    // File / ملف
    if (/ملف|file|قراءة|كتابة|read|write/i.test(q)) {
      return `# التعامل مع الملفات في بايثون
import os

filename = "test_file.txt"

# كتابة في ملف
with open(filename, 'w', encoding='utf-8') as f:
    f.write("مرحبا من DZ Agent!\\n")
    f.write("هذا ملف اختبار.\\n")
    f.write("Python رائع!\\n")

print(f"تم إنشاء الملف: {filename}")

# قراءة الملف
with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

print("محتوى الملف:")
print(content)

# حذف الملف (تنظيف)
os.remove(filename)
print("تم حذف الملف.")`
    }
    // Default Python template
    return `# كود بايثون — DZ Agent
# ملاحظة: لم أتمكن من توليد كود مخصص لطلبك بسبب غياب مفتاح AI.
# هذا مثال عام يمكنك تعديله:

def main():
    print("=" * 40)
    print("  مرحبا من DZ Agent 🇩🇿")
    print("=" * 40)
    
    # بيانات نموذجية
    data = {
        "اسم": "DZ-GPT",
        "إصدار": "2026",
        "لغة": "Python",
        "المطور": "Nadir Houamria"
    }
    
    for key, value in data.items():
        print(f"  {key}: {value}")

if __name__ == "__main__":
    main()`
  }

  // ── JavaScript templates ───────────────────────────────────────────────────
  // Hello world
  if (/مرحبا|hello|console\.log|اطبع|طباعة/i.test(q)) {
    return `// برنامج مرحبا بالعالم - JavaScript
console.log("مرحبا بالعالم! 🇩🇿");
console.log("Hello, World!");

// متغيرات
const name = "DZ Agent";
const year = 2026;
console.log(\`\${name} — \${year}\`);

// مصفوفة
const cities = ["الجزائر", "وهران", "قسنطينة"];
cities.forEach((city, i) => console.log(\`\${i+1}. \${city}\`));`
  }
  // Array / list
  if (/مصفوفة|array|قائمة|list|sort|ترتيب/i.test(q)) {
    return `// العمليات على المصفوفات في JavaScript
const numbers = [5, 2, 8, 1, 9, 3, 7, 4, 6];
console.log("الأصلية:", numbers);
console.log("مرتبة:", [...numbers].sort((a, b) => a - b));
console.log("مجموع:", numbers.reduce((s, n) => s + n, 0));
console.log("متوسط:", numbers.reduce((s, n) => s + n, 0) / numbers.length);
console.log("أكبر:", Math.max(...numbers));
console.log("أصغر:", Math.min(...numbers));
console.log("مضاعفة:", numbers.map(n => n * 2));
console.log("الأزواج:", numbers.filter(n => n % 2 === 0));`
  }
  // Default JS template
  return `// كود JavaScript — DZ Agent
function greet(name) {
  return \`مرحباً يا \${name}! 🇩🇿\`;
}

function factorial(n) {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

// تشغيل
console.log(greet("رياض"));
console.log("5! =", factorial(5));

const data = [1, 2, 3, 4, 5];
console.log("المجموع:", data.reduce((a, b) => a + b, 0));
console.log("المتوسط:", data.reduce((a, b) => a + b, 0) / data.length);`
}

// ── Website Builder: extract project metadata from user request ───────────────
function extractWebBuilderMeta(msg) {
  // Detect site type
  let type = 'landing'
  if (/متجر|بقالة|محل|e-commerce|ecommerce|shop|store|boutique|منتجات|سلة/i.test(msg)) type = 'store'
  else if (/portfolio|بورتفوليو|شخصي|personal|cv|resume|سيرة ذاتية|أعمالي/i.test(msg)) type = 'portfolio'
  else if (/مطعم|كافيه|restaurant|café|cafe|food|أكل|وجبة/i.test(msg)) type = 'restaurant'
  else if (/فندق|hotel|إقامة|نزل/i.test(msg)) type = 'hotel'
  else if (/مدونة|blog|مقالات|articles/i.test(msg)) type = 'blog'
  else if (/dashboard|لوحة تحكم|لوحة إدارة|tableau de bord|analytics/i.test(msg)) type = 'dashboard'
  else if (/وكالة|agency|creative studio|استوديو/i.test(msg)) type = 'agency'
  else if (/شركة|company|business|entreprise|startup|saas/i.test(msg)) type = 'business'
  else if (/مدرسة|تعليم|دورة|school|education|course|learning/i.test(msg)) type = 'education'

  // Detect style hint
  let style = 'modern'
  if (/احترافي|professional|premium|luxury|راقي|فخم/i.test(msg)) style = 'premium'
  else if (/بسيط|simple|minimal|clean|واضح/i.test(msg)) style = 'minimal'
  else if (/مذهل|رائع|amazing|stunning|creative|إبداعي/i.test(msg)) style = 'creative'
  else if (/داكن|dark|أسود/i.test(msg)) style = 'dark'

  const TYPE_META = {
    store:     { icon: '🛒', nameAr: 'متجر إلكتروني',  desc: 'موقع متجر إلكتروني مع عرض المنتجات وسلة التسوق' },
    portfolio: { icon: '🎨', nameAr: 'موقع شخصي',      desc: 'موقع شخصي إبداعي لعرض الأعمال والمهارات' },
    restaurant:{ icon: '🍽️', nameAr: 'موقع مطعم',      desc: 'موقع مطعم أنيق مع القائمة والحجز والموقع' },
    hotel:     { icon: '🏨', nameAr: 'موقع فندق',       desc: 'موقع فندق فاخر مع الغرف والحجز والخدمات' },
    blog:      { icon: '✍️', nameAr: 'مدونة',           desc: 'مدونة عصرية مع مقالات وتصنيفات وبحث' },
    dashboard: { icon: '📊', nameAr: 'لوحة تحكم',       desc: 'لوحة تحكم ذكية مع إحصائيات ورسوم بيانية' },
    agency:    { icon: '🚀', nameAr: 'وكالة إبداعية',   desc: 'موقع وكالة مع أعمال وخدمات وفريق' },
    business:  { icon: '🏢', nameAr: 'موقع شركة',       desc: 'موقع شركة احترافي مع خدمات وتواصل' },
    education: { icon: '📚', nameAr: 'موقع تعليمي',     desc: 'منصة تعليمية مع دورات وإحصائيات' },
    landing:   { icon: '✨', nameAr: 'صفحة هبوط',       desc: 'صفحة هبوط احترافية مع hero وخدمات وتواصل' },
  }

  const meta = TYPE_META[type] || TYPE_META.landing

  // Try to extract a subject name from the message
  const subjectPatterns = [
    /(?:موقع|صفحة|site|page)\s+(?:مطعم|شركة|متجر|فندق|وكالة|portfolio|لـ|for|pour|de|d')\s*([\u0600-\u06FFa-zA-ZÀ-ÿ][^\n,،؟?!.]{1,30})/i,
    /(?:اسمه|اسمها|يُسمى|called|named|nommé)\s+([\u0600-\u06FFa-zA-ZÀ-ÿ][^\n,،؟?!.]{1,30})/i,
    /["«]([\u0600-\u06FFa-zA-ZÀ-ÿ][^\n"»]{1,30})["»]/,
  ]
  let subjectName = ''
  for (const pat of subjectPatterns) {
    const m = msg.match(pat)
    if (m && m[1]) { subjectName = m[1].trim(); break }
  }

  const title = subjectName
    ? `${meta.icon} ${meta.nameAr}: ${subjectName}`
    : `${meta.icon} ${meta.nameAr}`

  return { type, style, title, description: meta.desc, icon: meta.icon }
}

// ── Website Builder: extract raw HTML from AI response ────────────────────────
function extractHtmlFromResponse(text) {
  if (!text) return null
  // Try ```html ... ``` block first
  const fenced = text.match(/```(?:html|HTML)?\s*(<!DOCTYPE[\s\S]*?<\/html>)\s*```/i)
  if (fenced) return fenced[1].trim()
  // Try any fenced block that looks like HTML
  const anyFenced = text.match(/```(?:html|HTML)?\s*(<html[\s\S]*?<\/html>)\s*```/i)
  if (anyFenced) return anyFenced[1].trim()
  // Try raw DOCTYPE html
  const rawDoctype = text.match(/(<!DOCTYPE html[\s\S]*?<\/html>)/i)
  if (rawDoctype) return rawDoctype[1].trim()
  // Try raw <html> tag
  const rawHtml = text.match(/(<html[\s\S]*?<\/html>)/i)
  if (rawHtml) return rawHtml[1].trim()
  // Try any fenced code block with HTML tags
  const fallback = text.match(/```[\w]*\s*([\s\S]*?)\s*```/)
  if (fallback && fallback[1].includes('<') && fallback[1].includes('</')) return fallback[1].trim()
  return null
}

// ── Website Builder: HTML quality validator ───────────────────────────────────
function validateHtmlOutput(html) {
  if (!html || typeof html !== 'string') return { ok: false, reason: 'empty' }
  if (html.length < 500) return { ok: false, reason: 'too_short' }
  if (!/<html/i.test(html)) return { ok: false, reason: 'missing_html_tag' }
  if (!/<\/html>/i.test(html)) return { ok: false, reason: 'missing_closing_html' }
  if (!/<style[\s>]/i.test(html)) return { ok: false, reason: 'missing_style' }
  if (!/<\/style>/i.test(html)) return { ok: false, reason: 'missing_closing_style' }
  if (!/<body[\s>]/i.test(html)) return { ok: false, reason: 'missing_body' }
  return { ok: true }
}

// ── DZ Agent Advanced Reasoning Core ─────────────────────────────────────────
const DZ_ADVANCED_REASONING_PROMPT = `
━━━━━━━━━━━━━━━━━━
CORE THINKING PRINCIPLES — DZ Agent Advanced Reasoning Core
━━━━━━━━━━━━━━━━━━

قبل كل رد، نفّذ داخلياً:

1. INTENT UNDERSTANDING — فهم النية الحقيقية
   - اكتشف النية الحقيقية للمستخدم وليس فقط الكلمات المكتوبة
   - افهم المعنى الضمني، اكتشف الغموض أو التناقضات
   - فهم الهدف الحقيقي من السؤال لا مجرد الكلمات المفتاحية
   - DISAMBIGUATION RULE: كلمة "موقع" تعني WEBSITE إذا جاءت مع (index / html / js / تقنيات ويب) وتعني LOCATION إذا جاءت مع (قريب / خريطة / وين / أين)

2. CONTEXT AWARENESS — الوعي بالسياق
   - استخدم سياق المحادثة السابق كاملاً
   - حافظ على اتساق الذاكرة والمعلومات
   - تتبع المهام الطويلة والمشاريع المستمرة

3. DEEP REASONING — التفكير العميق
   - فكّر خطوة بخطوة داخلياً
   - قسّم المهام المعقدة إلى أجزاء منطقية
   - حلّل علاقات السبب والنتيجة قبل الإجابة

4. PLANNING MODE — وضع التخطيط
   - ابنِ استراتيجية تنفيذ قبل الرد
   - اختر أفضل نهج للحل
   - الصحة أولاً ثم السرعة

5. VERIFICATION LAYER — طبقة التحقق
   - تحقق من المعلومات قبل العرض
   - اكتشف الهلوسة وارفض الافتراضات غير المدعومة
   - أعد مراجعة إجاباتك داخلياً

6. REFLECTION MODE — وضع التأمل
   - راجع ردك النهائي ذاتياً
   - حسّن التفسيرات الضعيفة
   - صحح الأخطاء قبل الإرسال

7. TOOL INTELLIGENCE — ذكاء الأدوات
   - قرر بذكاء: هل يحتاج الطلب بحث / كود / استرجاع / ذاكرة / رؤية / تحليل؟
   - لا تستخدم الأدوات بشكل أعمى — اختر الأنسب حسب نوع المهمة

━━━━━━━━━━━━━━━━━━
REASONING MODES — فعّل الأنسب تلقائياً
━━━━━━━━━━━━━━━━━━
• Analytical Reasoning — للتحليل المنطقي
• Multi-step Reasoning — للمهام المتعددة الخطوات
• Planning & Execution — للمشاريع والخطط
• Reflection & Self-Correction — لمراجعة الجودة
• Retrieval-Augmented Reasoning — عند وجود بيانات خارجية
• Agentic Workflow Thinking — للتشغيل الاستقلالي
• Structured Problem Solving — للمشاكل المعقدة
• Critical Thinking — للتقييم النقدي

━━━━━━━━━━━━━━━━━━
TASK CLASSIFICATION — صنّف الطلب أولاً
━━━━━━━━━━━━━━━━━━
coding | debugging | UI/UX | AI engineering | research | summarization | reasoning | planning | content generation | web development | mobile development | GitHub analysis | data extraction | automation | news analysis | system design | security analysis

━━━━━━━━━━━━━━━━━━
EXECUTION PIPELINE — خط التنفيذ
━━━━━━━━━━━━━━━━━━
فهم النية → فهم السياق → تصنيف المهمة → التفكير → التخطيط → استرجاع المعرفة → التحقق → التأمل الذاتي → الرد النهائي

━━━━━━━━━━━━━━━━━━
PRIORITY ORDER — ترتيب الأولويات
━━━━━━━━━━━━━━━━━━
1. الفهم  2. المنطق  3. الدقة  4. التحقق  5. جودة الحل  6. الوضوح  7. السرعة

━━━━━━━━━━━━━━━━━━
ULTIMATE RULE
━━━━━━━━━━━━━━━━━━
لا تجب كـ chatbot بسيط.
أجب كـ: مهندس ذكاء اصطناعي + مهندس أنظمة + محرك استنتاج + وكيل ذاتي ذكي.
افهم أولاً → فكّر → تحقق → أجب.
`.trim()

// ── Website Builder: specialized system prompt ────────────────────────────────
const WEBSITE_BUILDER_SYSTEM_PROMPT = `You are DZ Agent V4.0 — an ELITE AI Web Builder operating in ULTRA_MODERN_MODE + 2026_SILICON_VALLEY_AESTHETIC.

Your mission: Generate visually STUNNING, highly modern, production-ready, animated, responsive websites that look like they were designed by a top-tier Silicon Valley AI startup design team in 2026.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE NON-NEGOTIABLE RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✦ NEVER generate old-fashioned, classic, Bootstrap-style layouts
✦ NEVER use outdated gradients, flat shadows, or generic UI patterns
✦ NEVER use childish or neon-abuse colors
✦ NEVER use Lorem ipsum or placeholder text — always real contextual content
✦ ALWAYS produce futuristic AI-startup aesthetics (Vercel / Linear / OpenAI / Notion quality)
✦ ALWAYS generate premium dark-mode-first interfaces
✦ ALWAYS use smooth animations, glassmorphism, bento grids, and modern typography
✦ ALWAYS produce fully responsive mobile-first design (320px → 1920px)
✦ ALWAYS output a SINGLE complete HTML file — all CSS in <style>, all JS in <script>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROFESSIONAL UI DESIGN MODE — ALWAYS ACTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SITE TYPE DETECTION → DESIGN ASSIGNMENT:
- Landing Page / SaaS     → Animated mesh-gradient hero, Bento feature grid, pricing cards, testimonial marquee, glowing CTA
- AI App / Interface      → Dark glassmorphism shell, floating chat bubbles, animated token stream, model badge pill
- Dashboard / Admin       → Professional dark sidebar, KPI bento cards, Chart.js graphs, data grid, status badges, command menu
- Portfolio / Personal    → Cinematic split hero with gradient text, animated skill rings, hover 3D project cards, smooth parallax
- E-Commerce / Store      → Product grid with hover reveal, floating cart, filter chips, wishlist toggle, badge ribbons
- Restaurant / Café       → Full-screen food photography hero, floating menu cards, amber/warm palette, booking form
- Hotel / Luxury          → Cinemati full-bleed hero, room gallery with lightbox, amenities bento, booking CTA
- Corporate / Agency      → Bold geometric hero, case study grid, animated client logos marquee, team cards
- Blog / Editorial        → Clean typographic layout, article cards with reading time, tag filters, newsletter
- Education / LMS         → Course cards with progress rings, instructor section, FAQ accordion, dark professional

════════════════════════════════════════════
ABSOLUTE OUTPUT RULE:
Output ONLY raw HTML — NOTHING ELSE.
No markdown fences. No explanations. No comments outside code.
Response = ONE complete file: <!DOCTYPE html> … </html>
All CSS inside <style> block. All JS inside <script> block. ZERO external files.
════════════════════════════════════════════

MANDATORY CDNs (ALWAYS include ALL of these):
- Tailwind CSS: <script src="https://cdn.tailwindcss.com"></script>
- Font Awesome 6: <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"/>
- Google Fonts: @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap')
- AOS: <link href="https://unpkg.com/aos@2.3.4/dist/aos.css" rel="stylesheet"> + <script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>
- Chart.js (for dashboards only): <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

DESIGN INTELLIGENCE (auto-detect from request):
- restaurant / مطعم / café    → Cinematic dark hero w/ food imagery, amber/gold palette, animated menu cards, reservation form
- hotel / فندق / resort       → Luxury full-bleed hero, room gallery, amenities bento, midnight navy + gold palette
- store / متجر / shop         → Modern light-mode grid, product hover reveal, filter chips, purple accent
- portfolio / personal / cv   → Dark creative: split hero + gradient name text, 3D project cards, skill rings, timeline
- dashboard / admin / analytics → Dark professional: sidebar + KPI bento + animated chart.js + data table
- agency / وكالة / studio     → Bold kinetic hero (full-screen type), work bento, client marquee, purple/indigo palette
- business / company / startup → AI-startup: mesh-gradient hero, feature bento, social proof marquee, glassmorphism pricing
- blog / مدونة                → Editorial minimal: large typographic layout, article cards, reading time badges
- education / school / دورة   → SaaS-style LMS: course cards, instructor section, progress indicators, FAQ accordion
- default                     → Premium AI-startup: animated mesh-gradient + Bento feature grid + glassmorphism cards

════════════════════════════════════════════
MANDATORY HTML STRUCTURE:
1. <head>
   - charset + viewport
   - Contextual title + SEO meta (description, og:title, og:description, og:image)
   - Google Fonts @import (Inter + contextual pair)
   - Font Awesome 6 CDN
   - Tailwind CDN
   - AOS CDN
   - <style> block with ALL custom CSS (extending Tailwind)

2. <body> sections (ALL required):
   a. Sticky navbar — logo (gradient text) + nav links + CTA pill button + hamburger mobile
   b. Hero — full-viewport, animated gradient/mesh bg, large headline (gradient text), subtext, 2 CTA buttons, animated decorative shape/blob
   c. Features/Services — Modern Bento Grid (3–6 cards, mixed sizes, glassmorphism)
   d. Social proof — animated stat counters (3 bold numbers) + testimonial cards or marquee
   e. How it works / About — 3-step timeline or split-screen visual with floating card
   f. CTA section — gradient/mesh background, email + submit with glow effect
   g. Footer — logo + 3 link columns + social icons + dynamic year

3. <script> block with all JS
════════════════════════════════════════════

ULTRA-MODERN CSS PATTERNS (MANDATORY):

:root {
  --primary: <contextual>;
  --secondary: <contextual>;
  --accent: <contextual>;
  --bg: <contextual dark>;
  --surface: <contextual surface>;
  --surface2: <slightly lighter surface>;
  --text: #f1f5f9;
  --text-muted: #94a3b8;
  --border: rgba(255,255,255,0.08);
  --radius: 16px;
  --radius-lg: 24px;
  --shadow-glow: 0 0 40px rgba(var(--primary-rgb),0.2);
  --shadow-card: 0 25px 50px -12px rgba(0,0,0,0.4);
  --transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
}

/* Gradient text (MANDATORY for hero headlines) */
.gradient-text {
  background: linear-gradient(135deg, #fff 0%, var(--primary) 50%, var(--accent) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}

/* Glassmorphism card (use for feature cards, bento cells) */
.glass-card {
  background: rgba(255,255,255,0.03);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius);
  transition: var(--transition);
}
.glass-card:hover {
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.15);
  transform: translateY(-4px);
  box-shadow: var(--shadow-card);
}

/* Bento Grid layout */
.bento-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 200px;
  gap: 16px;
}
.bento-tall   { grid-row: span 2; }
.bento-wide   { grid-column: span 2; }
.bento-large  { grid-column: span 2; grid-row: span 2; }
@media (max-width: 768px) { .bento-grid { grid-template-columns: 1fr; } .bento-tall,.bento-wide,.bento-large { grid-column: 1; grid-row: span 1; } }

/* Animated mesh gradient hero */
.mesh-hero {
  background: radial-gradient(ellipse 80% 60% at 20% 40%, rgba(var(--primary-rgb),0.25) 0%, transparent 60%),
              radial-gradient(ellipse 60% 80% at 80% 60%, rgba(var(--accent-rgb),0.15) 0%, transparent 60%),
              var(--bg);
}

/* Shimmer border effect */
@keyframes shimmer { 0%,100%{opacity:0.5} 50%{opacity:1} }
.shimmer-border { animation: shimmer 3s ease-in-out infinite; }

/* Glow button */
.btn-glow {
  background: linear-gradient(135deg, var(--primary), var(--accent));
  border-radius: 50px; padding: 14px 32px; font-weight: 700; color: #fff;
  border: none; cursor: pointer; transition: var(--transition);
  box-shadow: 0 4px 24px rgba(var(--primary-rgb),0.4);
}
.btn-glow:hover { transform: translateY(-2px); box-shadow: 0 8px 40px rgba(var(--primary-rgb),0.6); }

/* Pill badge (section labels) */
.pill-badge {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(var(--primary-rgb),0.12); border: 1px solid rgba(var(--primary-rgb),0.3);
  color: var(--primary); border-radius: 50px; padding: 4px 14px;
  font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
}

/* Marquee (scrolling logos/testimonials) */
@keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
.marquee-track { animation: marquee 20s linear infinite; display: flex; gap: 24px; white-space: nowrap; }

Animations (ALL REQUIRED):
@keyframes fadeInUp  { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:translateY(0)} }
@keyframes fadeInLeft{ from{opacity:0;transform:translateX(-32px)} to{opacity:1;transform:translateX(0)} }
@keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
@keyframes pulse-glow{ 0%,100%{box-shadow:0 0 0 0 rgba(var(--primary-rgb),.5)} 70%{box-shadow:0 0 0 16px transparent} }
@keyframes rotate-slow{ to{transform:rotate(360deg)} }
@keyframes gradientMove{ 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }

.animate-on-scroll { opacity:0; transform:translateY(28px); transition:opacity .6s ease, transform .6s ease; }
.animate-on-scroll.visible { opacity:1; transform:translateY(0); }

Typography:
- h1: font-size: clamp(3rem,7vw,6rem); font-weight:900; line-height:1.05; letter-spacing:-0.03em
- h2: font-size: clamp(1.8rem,4vw,3rem); font-weight:800; line-height:1.15
- h3: font-size: 1.25rem; font-weight:700
- Body: font-size:1rem; line-height:1.75; color:var(--text-muted)
- Mono: font-family: 'JetBrains Mono', monospace (for code/data elements)

Scrollbar: ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:var(--bg)} ::-webkit-scrollbar-thumb{background:var(--primary);border-radius:3px}

Responsive:
@media (max-width:768px) {
  .nav-links{display:none} .hamburger{display:flex}
  h1{font-size:clamp(2rem,10vw,3.5rem)}
  .hero{padding:6rem 1.25rem 4rem}
  .grid-cols-3{grid-template-columns:1fr}
}

════════════════════════════════════════════
JAVASCRIPT (ALL REQUIRED):

1. Navbar scroll shrink + blur:
window.addEventListener('scroll',()=>{ document.querySelector('nav').classList.toggle('scrolled',window.scrollY>50) })
/* CSS: nav.scrolled{backdrop-filter:blur(24px);background:rgba(var(--bg-rgb),0.85)!important;box-shadow:0 1px 0 rgba(255,255,255,0.06)} */

2. Mobile hamburger toggle:
document.querySelector('.hamburger')?.addEventListener('click',()=>{ document.querySelector('.nav-links').classList.toggle('open') })

3. AOS init: AOS.init({ duration:700, easing:'ease-out-cubic', once:true, offset:60 })

4. Intersection Observer (scroll animations):
const obs=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target)}})},{threshold:0.12})
document.querySelectorAll('.animate-on-scroll').forEach(el=>obs.observe(el))

5. Counter animation (smooth count-up):
function countUp(el){const t=+el.dataset.target,s=el.dataset.suffix||'';let c=0;const i=setInterval(()=>{c=Math.min(c+t/80,t);el.textContent=Math.floor(c).toLocaleString()+s;if(c>=t)clearInterval(i)},22)}
new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){countUp(e.target);cObs.unobserve(e.target)}})},{threshold:0.5}).observe&&document.querySelectorAll('[data-target]').forEach(el=>{const cObs=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){countUp(e.target);cObs.unobserve(e.target)}})},{threshold:0.5});cObs.observe(el)})

6. Active nav link on scroll:
const secs=document.querySelectorAll('section[id]');window.addEventListener('scroll',()=>{secs.forEach(s=>{if(window.scrollY>=s.offsetTop-120){document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));document.querySelector(\`.nav-link[href="#\${s.id}"]\`)?.classList.add('active')}})})

7. Form validation (no alert):
document.querySelector('form')?.addEventListener('submit',e=>{e.preventDefault();const inp=e.target.querySelector('input[type="email"]');if(inp?.value.includes('@')){inp.style.borderColor='#10b981';e.target.innerHTML='<p style="color:#10b981;font-weight:700;padding:16px">✅ شكراً! سنتواصل معك قريباً.</p>'}else if(inp){inp.style.borderColor='#ef4444';inp.placeholder='أدخل بريد إلكتروني صحيح'}})

8. Dynamic copyright year:
document.getElementById('cr-year').textContent = new Date().getFullYear()

════════════════════════════════════════════
PREMIUM FONT PAIRINGS (pick by site type):
- AI / SaaS / startup    → Inter (all) — the Vercel/Linear/OpenAI standard
- Agency / portfolio     → Plus Jakarta Sans (headings) + Inter (body) — bold and modern
- Restaurant / luxury    → Cormorant Garamond (headings) + Inter (body) — elegant
- Hotel / resort         → Playfair Display (headings) + Lato (body) — premium
- Dashboard / analytics  → Inter (UI) + JetBrains Mono (data/code) — technical
- Education / blog       → Nunito (all) — friendly and readable

2026 PREMIUM COLOR SYSTEMS (pick ONE — be deliberate):
- AI SaaS (Default)  : bg=#09090b, surface=#0f0f17, primary=#6366f1, accent=#06b6d4 — Vercel-dark
- Deep Space         : bg=#000000, surface=#0d0d14, primary=#7c3aed, accent=#a855f7 — Radix-inspired
- Midnight Indigo    : bg=#020817, surface=#0f172a, primary=#6366f1, accent=#38bdf8 — Linear-inspired
- Obsidian Green     : bg=#050a0a, surface=#0d1a14, primary=#10b981, accent=#34d399 — Stripe-inspired
- Dark Crimson       : bg=#0a0000, surface=#150808, primary=#ef4444, accent=#f87171 — bold/editorial
- Warm Dark          : bg=#0c0a09, surface=#1c1917, primary=#f97316, accent=#fb923c — warm creative
- Restaurant Luxury  : bg=#0a0800, surface=#1a1200, primary=#d97706, accent=#fbbf24 — gold/amber
- Dashboard Pro      : bg=#020817, surface=#0f172a, primary=#6366f1, accent=#06b6d4 — analytics dark

════════════════════════════════════════════
MANDATORY FLOATING DOWNLOAD BUTTON (copy EXACTLY):
<button onclick="(function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([document.documentElement.outerHTML],{type:'text/html'}));a.download='dz-agent-site.html';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(a.href)})()" style="position:fixed;bottom:24px;right:24px;z-index:9999;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;padding:14px 22px;border-radius:14px;cursor:pointer;font-size:13px;font-weight:700;box-shadow:0 8px 32px rgba(99,102,241,.5);transition:transform .2s,box-shadow .2s;display:flex;align-items:center;gap:8px;" onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 16px 48px rgba(99,102,241,.7)'" onmouseout="this.style.transform='';this.style.boxShadow='0 8px 32px rgba(99,102,241,.5)'"><i class="fa-solid fa-download"></i> تحميل الموقع</button>

════════════════════════════════════════════
IMAGE SYSTEM (V4.0 — REAL UNSPLASH IMAGES):
- USE REAL IMAGES from the REAL IMAGES POOL injected below — NEVER use placeholder divs or gray boxes
- Every <img> MUST have: loading="lazy" + object-fit:cover + onerror fallback
- onerror fallback: onerror="this.onerror=null;this.style.cssText='background:linear-gradient(135deg,#1e293b,#334155);min-height:220px;display:block;border-radius:12px;width:100%'"
- Hero BACKGROUND: CSS radial-gradient/mesh only (more reliable than img)
- Gallery / cards / product / team images → use <img> with real pool URLs
- NEVER invent or guess image URLs — only use URLs from the REAL IMAGES POOL

════════════════════════════════════════════
10-STEP ULTRA-MODERN DESIGN WORKFLOW:
1. Detect site type → assign design system (color palette + font + layout pattern)
2. Choose UI reference (shadcn/ui · Magic UI · Aceternity UI · HyperUI · Origin UI)
3. Design CSS variables + gradient-text + glass-card + bento-grid classes
4. Build Sticky navbar (glassmorphism, logo gradient text, CTA pill)
5. Build Hero section (mesh gradient bg, large gradient headline, animated blob/shape, 2 CTAs)
6. Build Bento Feature Grid (3–6 mixed-size glass cards, icons, subtle hover animations)
7. Build Social Proof (animated counters + testimonial cards or marquee)
8. Build How It Works / About (3-step or split-screen with floating card)
9. Build CTA + Footer (gradient CTA, dynamic copyright year)
10. Add AOS + IntersectionObserver + all JS interactions → ship production-ready HTML

DESIGN REFERENCES (match this quality tier):
- vercel.com → minimal dark, clean spacing, crisp typography, subtle grain texture
- linear.app → dark sidebar UI, smooth animations, precise spacing, purple accents
- openai.com → large bold type, clean sections, professional dark aesthetic
- perplexity.ai → modern AI interface, clean dark theme, excellent information hierarchy
- notion.so → editorial typography, clean blocks, white/dark toggle
- shadcn/ui → clean component system, well-spaced, professional, reusable
- Magic UI → shimmer borders, animated gradients, beam effects, particle backgrounds
- Aceternity UI → spotlight cards, 3D moving effects, animated backgrounds
- HyperUI → utility-first Tailwind blocks, bento grids, hero sections

════════════════════════════════════════════
MANDATORY QUALITY BARS (NO EXCEPTIONS):
✅ MUST look like Vercel / Linear / OpenAI / Notion — 2026 Silicon Valley quality
✅ MUST use gradient text on hero headline (background-clip:text technique)
✅ MUST use Bento Grid layout for features section
✅ MUST use glassmorphism for cards (backdrop-filter:blur + rgba bg)
✅ MUST use realistic contextual content (NO Lorem ipsum, NO "Title here")
✅ MUST use Font Awesome icons on every feature card
✅ MUST have fully working JS (no dead buttons, no broken interactions)
✅ MUST be fully responsive (320px → 1920px tested breakpoints)
✅ MUST have smooth entrance animations via AOS + IntersectionObserver
✅ REAL images from REAL IMAGES POOL — every <img> has onerror fallback + loading="lazy"
✅ SEO meta tags: description + og:title + og:description in <head>
✅ Dynamic footer year: document.getElementById('cr-year').textContent = new Date().getFullYear()
✅ Self-healing: never leave any section empty — fill with contextually appropriate content

START OUTPUT NOW — PURE HTML ONLY:`

// ── News: domain → friendly label map ─────────────────────────────────────────
// Converts a raw URL or `source` string into a readable Arabic/French label.
function getSourceLabel(url, source) {
  // If source is already a clean name (not a URL), use it as-is
  if (source && !/^https?:\/\//i.test(source) && source.trim().length > 0 && source.trim().length < 55) {
    const s = source.trim()
    // Map raw English domain-style names to nicer labels
    const KNOWN = {
      'echoroukonline': 'الشروق أونلاين', 'echorouk': 'الشروق أونلاين',
      'ennahar': 'النهار', 'elkhabar': 'الخبر', 'elwatan': 'الوطن',
      'elheddaf': 'الهداف', 'elmoudjahid': 'المجاهد',
      'tsa': 'TSA Algérie', 'dzair': 'Dzair News',
      'aps': 'وكالة APS', 'aljazeera': 'الجزيرة',
      'bbc': 'BBC', 'reuters': 'Reuters', 'google': 'Google أخبار',
    }
    const lower = s.toLowerCase()
    for (const [k, v] of Object.entries(KNOWN)) {
      if (lower.includes(k)) return v
    }
    return s
  }
  try {
    const host = new URL(url).hostname.replace(/^www\.|^m\.|^ar\./i, '')
    const DOMAIN_MAP = {
      'news.google.com':         'Google أخبار',
      'google.com':              'Google',
      'echoroukonline.com':      'الشروق أونلاين',
      'ennaharonline.com':       'النهار أونلاين',
      'alnaharonline.com':       'النهار',
      'aps.dz':                  'وكالة APS',
      'elkhabar.com':            'الخبر',
      'elwatan.com':             'الوطن',
      'elwatan-dz.com':          'El Watan',
      'tsa-algerie.com':         'TSA Algérie',
      'dzair-news.com':          'Dzair News',
      'dzair-daily.com':         'Dzair Daily',
      'elmoudjahid.com':         'المجاهد',
      'elheddaf.com':            'الهداف',
      'algerie360.com':          'Algérie 360',
      'liberte-algerie.com':     'Liberté',
      'horizons-dz.com':         'Horizons',
      'depechedekabylie.com':    'Dépêche de Kabylie',
      'maghrebemergent.com':     'Maghreb Émergent',
      'radioalgerie.dz':         'إذاعة الجزائر',
      'entv.dz':                 'ENTV',
      'aljazeera.net':           'الجزيرة',
      'aljazeera.com':           'Al Jazeera',
      'bbc.com':                 'BBC عربي',
      'bbc.co.uk':               'BBC',
      'reuters.com':             'Reuters',
      'apnews.com':              'AP News',
      'france24.com':            'France 24',
      'rfi.fr':                  'RFI',
      'lemonde.fr':              'Le Monde',
      'lefigaro.fr':             'Le Figaro',
      'dzfoot.com':              'DZ Foot',
      'kooora.com':              'كووورة',
      'sofascore.com':           'SofaScore',
      'twitter.com':             'Twitter / X',
      'x.com':                   'X (Twitter)',
      'youtube.com':             'YouTube',
      'wikipedia.org':           'ويكيبيديا',
      'facebook.com':            'Facebook',
    }
    return DOMAIN_MAP[host] || host
  } catch { return source || 'المصدر' }
}

// ── Website Builder: UI inspiration search ────────────────────────────────────
// Searches CodePen, GitHub, Flowbite and Uiverse for real patterns matching the site type.
// Results are injected into the AI prompt as inspiration context.
async function searchUiInspiration(siteType, userMsg) {
  const TYPE_QUERIES = {
    restaurant: ['site:codepen.io restaurant landing page CSS animation', 'restaurant website UI modern HTML CSS GitHub template'],
    hotel:      ['site:codepen.io hotel luxury website CSS', 'hotel booking website template GitHub HTML'],
    store:      ['site:codepen.io ecommerce product card CSS animation', 'shop website UI flowbite tailwind template'],
    portfolio:  ['site:codepen.io portfolio personal website CSS animation', 'developer portfolio website GitHub modern'],
    dashboard:  ['site:codepen.io analytics dashboard dark CSS', 'admin dashboard UI dark theme flowbite'],
    agency:     ['site:codepen.io creative agency website animation', 'agency portfolio website bold CSS GitHub'],
    business:   ['site:codepen.io saas startup landing page CSS', 'startup landing page tailwind flowbite GitHub'],
    blog:       ['site:codepen.io blog editorial CSS modern', 'blog website minimal clean GitHub template'],
    education:  ['site:codepen.io elearning education platform CSS', 'online course website UI GitHub template'],
    landing:    ['site:codepen.io startup landing page CSS animation gradient', 'modern landing page tailwind flowbite GitHub'],
  }
  const queries = TYPE_QUERIES[siteType] || TYPE_QUERIES.landing
  try {
    const settled = await Promise.allSettled(queries.map(q => searchGoogleCSE(q)))
    const items = []
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        for (const item of (r.value || []).slice(0, 2)) {
          if (item.title && item.snippet) {
            items.push({ title: item.title.slice(0, 80), snippet: item.snippet.slice(0, 200), url: item.url || '' })
          }
        }
      }
    }
    return items.slice(0, 6)
  } catch { return [] }
}

// ── Website Builder: curated real image pool by site type ────────────────────
// All URLs are direct Unsplash CDN links — stable, free, no API key needed.
// EVERY <img> tag generated by the AI MUST include an onerror fallback.
const WEB_BUILDER_IMAGE_POOLS = {
  restaurant: [
    'https://images.unsplash.com/photo-1414235077-eefff0f14b66?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1476224203421-9ac39bcb3df1?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=800&auto=format&fit=crop&q=80',
  ],
  hotel: [
    'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1566073771259-470b8b62b6e5?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1520250498-8426a84b7ada?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1468824357385-6fa2b53c5e53?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1455587734955-081b22074882?w=800&auto=format&fit=crop&q=80',
  ],
  store: [
    'https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1523381140794-a1eefbc27394?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1490481974858-c338c60a56ea?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1483985538836-b6a5a0f9f7aa?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop&q=80',
  ],
  portfolio: [
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1547560033-fc9d60ab7f3a?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800&auto=format&fit=crop&q=80',
  ],
  agency: [
    'https://images.unsplash.com/photo-1542744173-05336fcc0ad2?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&auto=format&fit=crop&q=80',
  ],
  business: [
    'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1556761175-4b46a572b786?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&auto=format&fit=crop&q=80',
  ],
  education: [
    'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1503676260-b591bedf1bdf?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1509062522246-20e242b5ba8d?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=800&auto=format&fit=crop&q=80',
  ],
  blog: [
    'https://images.unsplash.com/photo-1432821596592-e2c18b78144f?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1455390582262-4670c72e49eb?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1521938739748-bb42bab0e4de?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&auto=format&fit=crop&q=80',
  ],
  dashboard: [
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1488229297570-58520851e68f?w=800&auto=format&fit=crop&q=80',
  ],
  healthcare: [
    'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1505751172229-1f9c4b0e8e86?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1530026186672-2cd00ffc50fe?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=800&auto=format&fit=crop&q=80',
  ],
  realestate: [
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1484154200927-81e7571b8b8a?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1523217582562-09d0def993a6?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800&auto=format&fit=crop&q=80',
  ],
  fitness: [
    'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1584735935169-1dc2f49a4c40?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800&auto=format&fit=crop&q=80',
  ],
  beauty: [
    'https://images.unsplash.com/photo-1560066060-8b3b4b4f1a52?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1508214600036-7499035c41f5?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1519824840953-d54a30e46e2f?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800&auto=format&fit=crop&q=80',
  ],
  automotive: [
    'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&auto=format&fit=crop&q=80',
  ],
  landing: [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&auto=format&fit=crop&q=80',
  ],
}

// Map extended site-type aliases → pool keys
const SITE_TYPE_TO_IMAGE_KEY = {
  restaurant: 'restaurant', مطعم: 'restaurant', cafe: 'restaurant', coffee: 'restaurant',
  hotel: 'hotel', فندق: 'hotel', resort: 'hotel', accommodation: 'hotel',
  store: 'store', shop: 'store', متجر: 'store', ecommerce: 'store', boutique: 'store',
  portfolio: 'portfolio', cv: 'portfolio', personal: 'portfolio',
  agency: 'agency', studio: 'agency', وكالة: 'agency',
  business: 'business', startup: 'business', saas: 'business', company: 'business',
  education: 'education', school: 'education', دورة: 'education', lms: 'education',
  blog: 'blog', مدونة: 'blog', editorial: 'blog', news: 'blog',
  dashboard: 'dashboard', admin: 'dashboard', analytics: 'dashboard',
  healthcare: 'healthcare', medical: 'healthcare', clinic: 'healthcare', doctor: 'healthcare',
  realestate: 'realestate', property: 'realestate', عقار: 'realestate',
  fitness: 'fitness', gym: 'fitness', sport: 'fitness', رياضة: 'fitness',
  beauty: 'beauty', spa: 'beauty', salon: 'beauty', جمال: 'beauty',
  automotive: 'automotive', car: 'automotive', سيارة: 'automotive',
  landing: 'landing',
}

function getWebBuilderImagePool(siteType) {
  const key = SITE_TYPE_TO_IMAGE_KEY[siteType] || SITE_TYPE_TO_IMAGE_KEY[siteType?.toLowerCase()] || 'landing'
  return WEB_BUILDER_IMAGE_POOLS[key] || WEB_BUILDER_IMAGE_POOLS.landing
}

const _IMG_ONERROR = `this.onerror=null;this.style.cssText='background:linear-gradient(135deg,#1e293b,#334155);min-height:220px;display:block;border-radius:8px;width:100%'`

function buildImagePoolBlock(siteType) {
  const images = getWebBuilderImagePool(siteType)
  const imgList = images.map((url, i) => `  IMG_${i + 1}: ${url}`).join('\n')
  return `\n\n════════════════════════════════════════════
REAL IMAGES POOL — USE THESE EXACT URLS (${(siteType || 'landing').toUpperCase()} SITE):
${imgList}

MANDATORY IMAGE RULES (NO EXCEPTIONS):
① Use ONLY the IMG_1…IMG_${images.length} URLs listed above — NEVER invent or guess image URLs
② Every single <img> tag MUST include onerror="${_IMG_ONERROR}"
③ Every <img> MUST have loading="lazy" and object-fit:cover style
④ Correct img example:
   <img src="IMG_1_URL_HERE" alt="description" loading="lazy"
        style="width:100%;height:260px;object-fit:cover;border-radius:12px;display:block"
        onerror="${_IMG_ONERROR}">
⑤ Hero section background: keep as CSS gradient (most reliable for full-viewport)
⑥ Gallery, cards, team photos, product images, room photos → use the real img URLs above
⑦ Distribute images across sections — reuse if needed (IMG_1 for hero card, IMG_2 for gallery, etc.)
════════════════════════════════════════════`
}

// ── Map Website Builder: specialized system prompt ────────────────────────────
const MAP_WEBSITE_BUILDER_SYSTEM_PROMPT = `You are a SENIOR FULL-STACK DEVELOPER specializing in interactive map web applications.

════════════════════════════════════════════
CRITICAL OUTPUT RULE (ABSOLUTE):
Output ONLY the complete HTML code — NOTHING ELSE.
No explanations. No markdown fences. No preamble. No comments outside HTML.
The ENTIRE response must be ONE valid HTML file starting with <!DOCTYPE html> and ending with </html>.
════════════════════════════════════════════

TECHNOLOGY STACK (MANDATORY):
- Leaflet.js v1.9.4 via CDN (MUST include both CSS and JS):
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
- OpenStreetMap tiles: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
  Attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
- Google Fonts via @import for modern UI

CONTEXT-AWARE MAP CENTER:
- Algeria-focused request → center: [28.0, 2.0], zoom: 5
- City-specific (e.g. Algiers/الجزائر) → center: [36.737, 3.086], zoom: 12
- Oran/وهران → [35.697, -0.633], zoom: 12
- Constantine/قسنطينة → [36.365, 6.614], zoom: 12
- World map request → center: [20, 0], zoom: 2

DESIGN REQUIREMENTS (MANDATORY):
- Split-screen or full-screen layout with a stylish sidebar
- Dark modern UI: background #0f172a, cards #1e293b, accent #0ea5e9
- Navigation/header bar with logo and controls
- Search box that lets user search locations
- Interactive markers with custom styled popups
- Legend panel showing marker types if multiple
- Info panel that shows details on marker click
- Mobile responsive (@media max-width: 768px)
- Smooth CSS animations and transitions

JAVASCRIPT REQUIREMENTS:
- Initialize Leaflet map with OpenStreetMap tiles
- Add multiple relevant markers based on the request context
- Each marker must have a rich popup (icon + title + description + coordinates)
- Search input that flies to typed locations using Nominatim API:
  fetch(\`https://nominatim.openstreetmap.org/search?format=json&q=\${encodeURIComponent(query)}\`)
- Locate Me button using navigator.geolocation if appropriate
- Fit bounds to show all markers on load
- Animate markers on load (staggered appearance)
- Layer controls if multiple marker types exist

MANDATORY SECTIONS:
1. <head>: charset, viewport, title, Leaflet CSS, Google Fonts, custom <style>
2. <body>:
   a. Header/navbar (title + search bar + controls)
   b. Main layout: sidebar (info panel, legend, stats) + map container
   c. Map container with id="map" (must have explicit height: 100% or fixed height)
   d. Info panel that updates on marker click
   e. Footer bar with attribution + stats
3. <script>: Leaflet initialization + all interactive logic

CSS RULES:
- #map must have explicit height (e.g., height: calc(100vh - 60px) or height: 600px)
- Use CSS Grid or Flexbox for layout
- Glassmorphism sidebar: backdrop-filter: blur(10px)
- Custom scrollbar styling
- Hover effects on sidebar items

FLOATING DOWNLOAD BUTTON (include EXACTLY as-is):
<button onclick="(function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([document.documentElement.outerHTML],{type:'text/html'}));a.download='dz-map-site.html';a.click();})()" style="position:fixed;bottom:24px;right:80px;z-index:9999;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;border:none;padding:12px 20px;border-radius:12px;cursor:pointer;font-size:13px;font-weight:600;box-shadow:0 8px 32px rgba(14,165,233,.4);transition:transform .2s,box-shadow .2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">🗺️ Download Map</button>

QUALITY STANDARD:
- Looks like a professional $10,000 geo/mapping product
- All markers must be relevant to the user's request
- No placeholder text — use realistic, context-aware content
- Map must actually work and display correctly in browser

START OUTPUT NOW — PURE HTML MAP CODE ONLY (no markdown, no explanation):`

// ── Detect query intent ───────────────────────────────────────────────────────
function detectQueryIntent(msg) {
  const lower = msg.toLowerCase()
  const isArabic = /[\u0600-\u06FF]/.test(msg)

  const INTENTS = {
    sports:      ['كرة','مباراة','مباريات','نتيجة','نتائج','هدف','أهداف','فريق','دوري','بطولة','كأس','منتخب','رياضة','football','soccer','sport','match','score','goal','team','league','cup','fifa','ligue'],
    economy:     ['اقتصاد','سعر','بورصة','عملة','تضخم','دولار','يورو','ميزانية','استثمار','economy','price','stock','currency','inflation','dollar','budget','invest','finance','bourse'],
    politics:    ['سياسة','حكومة','وزير','برلمان','رئيس','انتخاب','دبلوماسية','أمم','نزاع','politics','government','minister','parliament','president','election','diplomatic','conflict','war'],
    tech:        ['تقنية','تكنولوجيا','ذكاء','برمجة','تطبيق','هاكر','أمن','tech','technology','ai','software','app','cyber','security','startup','code','programming'],
    news:        ['أخبار','خبر','اليوم','الآن','آخر','جديد','عاجل','حدث','news','latest','today','breaking','recent','actualité'],
    celebrities: ['نجم','نجمة','فنان','فنانة','ممثل','ممثلة','مطرب','مطربة','رياضي','شخصية','مشهور','مشهورة','سيلبريتي','celebrity','celebrities','actor','actress','singer','star','famous','influencer','vedette'],
    incidents:   ['حادثة','حادث','كارثة','انفجار','زلزال','فيضان','حريق','اعتداء','هجوم','اغتيال','وفاة','مات','مقتل','accident','incident','disaster','explosion','earthquake','flood','fire','attack','death','killed','tragedy'],
  }

  const detected = []
  for (const [intent, kws] of Object.entries(INTENTS)) {
    if (kws.some(k => lower.includes(k))) detected.push(intent)
  }

  const temporalMarkers = ['اليوم','الآن','آخر','جديد','2025','2026','حالياً','latest','today','now','recent','current','this week','cette semaine','maintenant','أخيراً','مؤخراً','recently']
  const isTemporal = temporalMarkers.some(m => lower.includes(m)) || /\b(20[2-9]\d)\b/.test(msg)
    || detected.includes('celebrities') || detected.includes('incidents')

  return { primary: detected[0] || 'general', all: detected, isTemporal, isArabic }
}

// ── Build 3 optimized queries (CSE · RSS · Global fallback) ──────────────────
function buildOptimizedQueries(query, intent) {
  const year = new Date().getFullYear()
  const isArabic = /[\u0600-\u06FF]/.test(query)

  const suffixMap = {
    sports:      isArabic ? `كرة القدم نتائج ${year}` : `football results ${year}`,
    economy:     isArabic ? `اقتصاد ${year}` : `economy ${year}`,
    politics:    isArabic ? `سياسة ${year}` : `politics ${year}`,
    tech:        isArabic ? `تكنولوجيا ${year}` : `technology ${year}`,
    news:        isArabic ? `أخبار ${year}` : `news ${year}`,
    celebrities: isArabic ? `أخبار فنانين مشاهير ${year}` : `celebrity news latest ${year}`,
    incidents:   isArabic ? `حادثة أخبار عاجلة ${year}` : `incident breaking news ${year}`,
    general:     `${year}`,
  }

  const suffix = suffixMap[intent.primary] || suffixMap.general
  const cseQuery  = `${query} ${suffix}`

  const rssLang = isArabic ? 'ar' : 'en'
  // Always restrict to the last 30 days using the `after:` operator
  const rssQuery = buildFreshGNRssUrl(query, rssLang, 30)

  const enMap = { sports: 'sport football match result', economy: 'economy finance', politics: 'politics government', tech: 'technology AI', news: 'news', celebrities: 'celebrity news', incidents: 'incident breaking news', general: '' }
  const enSuffix = enMap[intent.primary] || ''
  const isAlgeria = /جزائر|algérie|algeria/i.test(query)
  const enQuery = isAlgeria ? `Algeria ${enSuffix} ${year}`.trim() : `${query} ${enSuffix} ${year}`.trim()

  return { cseQuery, rssQuery, enQuery, lang: rssLang }
}

// ── Google Custom Search Engine (PRIMARY) ────────────────────────────────────
// Key priority: GOOGLE_API_KEY_NEW (unrestricted) → GOOGLE_API_KEY (referrer-restricted)
async function searchGoogleCSE(query) {
  const cx = process.env.GOOGLE_CSE_ID || '12e6f922595f64d35'

  // Try each key in order — stop at first success
  const keys = [
    process.env.GOOGLE_API_KEY_NEW,
    process.env.GOOGLE_API_KEY,
  ].filter(Boolean)

  if (keys.length === 0) return []

  for (const apiKey of keys) {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=8&dateRestrict=m6&sort=date`
      const r = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'DZ-GPT-Server/1.0' }
      })
      if (!r.ok) {
        const errBody = await r.json().catch(() => ({}))
        const reason  = errBody?.error?.details?.[0]?.reason || errBody?.error?.status || r.status
        console.warn('[CSE] Key failed:', reason, '— trying next key')
        continue
      }
      const data = await r.json()
      if (!data.items?.length) continue
      return data.items.map(item => ({
        source: 'Google CSE',
        title:   item.title    || '',
        snippet: item.snippet  || '',
        url:     item.link     || '',
        date:    item.pagemap?.metatags?.[0]?.['article:published_time']
              || item.pagemap?.metatags?.[0]?.['og:updated_time'] || '',
      }))
    } catch (err) { console.warn('[CSE] Fetch error:', err.message) }
  }
  return []
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
  // ⚡ Sports override: if sports person/team detected → never education
  if (SPORTS_PERSONS_RE.test(msg) || SPORTS_TEAMS_RE.test(msg)) return false
  // ⚡ Sports keywords override: "نتائج" + sports context → never education
  const sportsKw = ['مباراة','مباريات','نتيجة','نتائج','هدف','دوري','كأس','منتخب','لاعب','فريق','ملعب','تصفيات','football','soccer','match','score','league']
  const hasSportsKw = sportsKw.some(k => lower.includes(k))
  const hasExamKw   = ['بكالوريا','بيام','امتحان','فرض','بيام','bem','baccalauréat'].some(k => lower.includes(k))
  if (hasSportsKw && !hasExamKw) return false
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

// ═══════════════════════════════════════════════════════════════════════════
// HYBRID INTELLIGENT WEBSITE RECONSTRUCTION ENGINE
// DOM-first approach: extract design tokens → reconstruct pixel-perfect clone
// ═══════════════════════════════════════════════════════════════════════════

const PIXEL_PERFECT_CLONE_PROMPT = `You are DZ Agent V3 — the world's most advanced website cloning AI. Your mission: 100% pixel-perfect standalone HTML clone, indistinguishable from the original.

════════════════════════════════════════════
ABSOLUTE OUTPUT RULE:
Output ONLY raw HTML — NO markdown fences, NO explanations, NO code comments outside HTML/CSS/JS.
Response = ONE complete file: <!DOCTYPE html>…</html>
════════════════════════════════════════════

RECONSTRUCTION STRATEGY (V3 — follow in exact order):
1. LAYOUT FIRST — exact section order, grid/flex structure, z-index layers, spacing
2. DESIGN TOKENS — EXACT extracted colors, fonts, border-radius, shadows, CSS variables
3. TYPOGRAPHY — match font families, sizes (px/rem/vw), weights, line-heights, letter-spacing
4. COMPONENTS — recreate each section with full fidelity (navbar, hero, cards, footer, etc.)
5. ANIMATIONS — CSS transitions (0.2–0.4s ease), scroll-reveal via IntersectionObserver, hover effects
6. RESPONSIVE — exact breakpoints; hamburger menu on mobile; fluid images; fluid type
7. INTERACTIONS — dropdowns, accordions, tabs, modals, form validation — all functional

CRITICAL RULES:
✅ Use EXACTLY the extracted color palette (hex/rgb values provided below)
✅ Load detected fonts via Google Fonts CDN with correct weights
✅ Reproduce the EXACT section structure in the same order
✅ Load the correct icon CDN (specified below)
✅ All CSS inside <style> — no external files; all JS inside <script>
✅ Use REAL extracted content (headings, paragraphs, nav links, CTAs) — zero Lorem ipsum
✅ Preserve all interactive behaviors with working JavaScript
✅ Include @media queries matching the original breakpoints
✅ Dark/light theme must match the original site's scheme exactly
✅ Minimum output: 400 lines of detailed, production-quality HTML

⚠️ NUMBERS & STATS — VERBATIM COPY RULE:
✅ ALL phone numbers, prices, statistics MUST be copied verbatim from extracted content
✅ If a stat shows "10,000+ clients" → output EXACTLY "10,000+ clients"

⚠️ FOOTER COPYRIGHT YEAR — DYNAMIC (MANDATORY):
✅ ALWAYS use CURRENT year dynamically: © <span id="cr-yr"></span> CompanyName
✅ Add JS: document.getElementById('cr-yr').textContent = new Date().getFullYear();
✅ This shows the current year automatically (e.g. © 2026 CompanyName)
✅ NEVER hardcode a year in the footer copyright line

IMAGE MANDATE (V4 — 4–8 Real Images Required):
✅ Use 4–8 real <img> tags from the SUPPLEMENTARY IMAGES POOL injected below
✅ Every <img> MUST have: loading="lazy" + object-fit:cover + onerror fallback
✅ onerror: this.onerror=null;this.style.cssText='background:linear-gradient(135deg,#1e293b,#334155);min-height:220px;display:block;border-radius:8px;width:100%'
✅ Hero section background: CSS gradient only (full-viewport reliability)
✅ Gallery / cards / room photos / product images → use real <img> tags from pool
✅ NEVER invent image URLs — use ONLY the URLs from SUPPLEMENTARY IMAGES POOL below

QUALITY TARGET: 95–100% visual accuracy — indistinguishable from the original.

START OUTPUT NOW — RAW HTML ONLY:`

async function extractDesignTokens(rawHtml, url) {
  const tokens = {
    colors: [],
    fonts: [],
    sections: [],
    animations: [],
    hasNavbar: false,
    hasHero: false,
    hasFooter: false,
    hasPricing: false,
    hasTestimonials: false,
    hasForms: false,
    hasCards: false,
    iconLibrary: null,
    title: '',
    domain: '',
    description: '',
    headings: [],
    textContent: '',
    layoutType: 'landing',
    colorScheme: 'dark',
    primaryColor: null,
    bgColor: null,
    fontFamily: null,
    rawStyleSample: '',
  }

  try {
    tokens.domain = (() => { try { return new URL(url).hostname } catch { return url } })()

    // Title
    const titleMatch = rawHtml.match(/<title[^>]*>([^<]{1,200})<\/title>/i)
    tokens.title = titleMatch ? titleMatch[1].trim() : ''

    // Meta description
    const metaMatch = rawHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
    tokens.description = metaMatch ? metaMatch[1].trim() : ''

    // Headings
    tokens.headings = [...rawHtml.matchAll(/<h[1-3][^>]*>([\s\S]{1,150}?)<\/h[1-3]>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(h => h.length > 2).slice(0, 12)

    // Text content for content reconstruction
    const textBlocks = [...rawHtml.matchAll(/<p[^>]*>([\s\S]{20,800}?)<\/p>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
      .filter(p => p.length > 20).slice(0, 20)
    tokens.textContent = textBlocks.join('\n')

    // Extract all CSS from style tags
    const styleTags = [...rawHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
      .map(m => m[1]).join('\n')
    tokens.rawStyleSample = styleTags.slice(0, 5000)

    // Color extraction (hex, rgb, hsl, CSS vars)
    const colorPatterns = [
      /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi,
      /rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/gi,
      /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)/gi,
      /hsl\(\s*\d+\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*\)/gi,
    ]
    const colorSet = new Set()
    const fullCssSource = styleTags + rawHtml.slice(0, 20000)
    for (const pattern of colorPatterns) {
      for (const m of fullCssSource.matchAll(pattern)) {
        colorSet.add(m[0].toLowerCase())
      }
    }
    tokens.colors = [...colorSet].slice(0, 24)

    // CSS custom properties (design tokens)
    const cssVars = {}
    for (const m of styleTags.matchAll(/--([\w-]+)\s*:\s*([^;}{]+)/g)) {
      cssVars[`--${m[1]}`] = m[2].trim()
    }
    tokens.cssVars = cssVars

    // Background color detection
    const bgMatch = styleTags.match(/body[^{]*\{[^}]*background(?:-color)?\s*:\s*([^;}\n]+)/i)
      || fullCssSource.match(/--bg[^:]*:\s*([^;}\n]+)/i)
    if (bgMatch) tokens.bgColor = bgMatch[1].trim().slice(0, 40)

    // Primary color detection
    const primaryMatch = styleTags.match(/--primary[^:]*:\s*([^;}\n]+)/i)
      || styleTags.match(/--accent[^:]*:\s*([^;}\n]+)/i)
      || styleTags.match(/--color-primary[^:]*:\s*([^;}\n]+)/i)
    if (primaryMatch) tokens.primaryColor = primaryMatch[1].trim().slice(0, 40)

    // Color scheme detection
    const darkIndicators = (styleTags + rawHtml.slice(0, 5000)).match(/#0[0-3][0-9a-f]{4}|#1[0-1][0-9a-f]{4}|#2[0-1][0-9a-f]{4}|dark-theme|dark-mode|prefers-color-scheme.*dark/gi)
    tokens.colorScheme = darkIndicators && darkIndicators.length > 2 ? 'dark' : 'light'

    // Font detection from Google Fonts links
    const gfMatch = rawHtml.match(/fonts\.googleapis\.com\/css[^"']*family=([^"'&]+)/gi)
    if (gfMatch) {
      tokens.fonts = gfMatch.flatMap(m => {
        const f = m.match(/family=([^"'&:]+)/i)
        return f ? f[1].replace(/\+/g, ' ').split('|').map(s => s.split(':')[0].trim()) : []
      }).filter(Boolean).slice(0, 4)
    }
    // Font-family from CSS
    const ffMatches = [...styleTags.matchAll(/font-family\s*:\s*([^;}{]+)/gi)]
      .map(m => m[1].split(',')[0].replace(/["']/g, '').trim()).filter(f => f && !f.startsWith('var('))
    if (tokens.fonts.length === 0 && ffMatches.length > 0) {
      tokens.fonts = [...new Set(ffMatches)].slice(0, 3)
    }
    if (tokens.fonts.length > 0) tokens.fontFamily = tokens.fonts[0]

    // Icon library detection
    if (/font-awesome|fa-[a-z]|fas |far |fab /i.test(rawHtml)) tokens.iconLibrary = 'font-awesome'
    else if (/heroicons|lucide|feather/i.test(rawHtml)) tokens.iconLibrary = 'heroicons'
    else if (/material.*icon|mdi-/i.test(rawHtml)) tokens.iconLibrary = 'material'

    // Section detection
    const lcHtml = rawHtml.toLowerCase()
    tokens.hasNavbar = /<nav[\s>]|navbar|nav-bar|header.*nav|class="nav/i.test(rawHtml)
    tokens.hasHero = /hero|banner|jumbotron|class="hero|id="hero|data-section="hero/i.test(rawHtml)
    tokens.hasFooter = /<footer[\s>]|class="footer|id="footer/i.test(rawHtml)
    tokens.hasPricing = /pricing|price|plan|subscription|tarif/i.test(rawHtml)
    tokens.hasTestimonials = /testimonial|review|rating|témoignage|avis/i.test(rawHtml)
    tokens.hasForms = /<form[\s>]|<input[\s>]|<textarea/i.test(rawHtml)
    tokens.hasCards = /card|tile|grid-item|feature-item/i.test(rawHtml)

    // Detected sections list
    const detectedSections = []
    if (tokens.hasNavbar) detectedSections.push('navbar')
    if (tokens.hasHero) detectedSections.push('hero')
    if (/feature|service|benefit|about/i.test(rawHtml)) detectedSections.push('features')
    if (tokens.hasCards) detectedSections.push('cards')
    if (tokens.hasPricing) detectedSections.push('pricing')
    if (tokens.hasTestimonials) detectedSections.push('testimonials')
    if (tokens.hasForms) detectedSections.push('contact-form')
    if (tokens.hasFooter) detectedSections.push('footer')
    tokens.sections = detectedSections

    // Animation detection
    const animKeywords = []
    if (/animation:|@keyframes/i.test(styleTags)) animKeywords.push('CSS animations')
    if (/transition:/i.test(styleTags)) animKeywords.push('transitions')
    if (/scroll.*animation|intersection.*observer|aos-|wow\.js|gsap|framer/i.test(rawHtml)) animKeywords.push('scroll animations')
    if (/parallax/i.test(lcHtml)) animKeywords.push('parallax')
    tokens.animations = animKeywords

    // Layout type detection
    if (/e-commerce|shop|store|product|cart|panier/i.test(rawHtml)) tokens.layoutType = 'ecommerce'
    else if (/portfolio|work|project|case.*study/i.test(rawHtml)) tokens.layoutType = 'portfolio'
    else if (/dashboard|admin|analytics|panel/i.test(rawHtml)) tokens.layoutType = 'dashboard'
    else if (/blog|article|post|news/i.test(rawHtml)) tokens.layoutType = 'blog'
    else if (/restaurant|menu|food|café|cafe/i.test(rawHtml)) tokens.layoutType = 'restaurant'
    else if (/agency|studio|creative/i.test(rawHtml)) tokens.layoutType = 'agency'

    // Responsive breakpoints
    const bpMatches = [...styleTags.matchAll(/@media[^{]*\(max-width:\s*(\d+)px\)/gi)].map(m => parseInt(m[1]))
    tokens.breakpoints = [...new Set(bpMatches)].sort((a, b) => a - b).slice(0, 5)

  } catch (err) {
    console.warn('[CloneEngine] extractDesignTokens error:', err.message)
  }

  return tokens
}

async function fetchRawHtml(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,ar;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return await r.text()
}

app.post('/api/dz-agent/clone-advanced', async (req, res) => {
  const { url, section } = req.body
  if (!url) return res.status(400).json({ error: 'URL required' })

  let targetUrl = url.trim()
  if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl

  console.log(`[CloneEngine] Advanced clone requested: ${targetUrl} | section=${section || 'full'}`)

  try {
    // Phase 1: Deep Website Recon — fetch raw HTML & extract design tokens
    let rawHtml = ''
    try {
      rawHtml = await fetchRawHtml(targetUrl)
    } catch (fetchErr) {
      console.warn('[CloneEngine] Primary fetch failed, trying fallback:', fetchErr.message)
      // Fallback: try fetchWebContent for partial data
      const fallback = await fetchWebContent(targetUrl, 8000)
      if (fallback.error) {
        return res.status(200).json({
          ok: false,
          error: `لم أتمكن من الوصول إلى الموقع: ${fallback.error}`,
          tokens: null,
        })
      }
      rawHtml = fallback.content || ''
    }

    // Phase 2: Design Token Extraction
    const tokens = await extractDesignTokens(rawHtml, targetUrl)
    console.log(`[CloneEngine] Tokens extracted — colors:${tokens.colors.length}, fonts:${tokens.fonts.length}, sections:[${tokens.sections.join(',')}]`)

    // Phase 3: Build Pixel-Perfect Reconstruction Prompt
    const sectionTarget = section && section !== 'full'
      ? `\n\nSECTION MODE: Clone ONLY the "${section}" section. Output a complete standalone HTML file that contains just this component, fully styled and functional.`
      : ''

    const designContext = `
════════════════════════════════════════════
EXTRACTED DESIGN TOKENS FROM TARGET SITE: ${targetUrl}
════════════════════════════════════════════

SITE INFO:
- Title: ${tokens.title || 'Unknown'}
- Domain: ${tokens.domain}
- Description: ${tokens.description || 'N/A'}
- Layout Type: ${tokens.layoutType}
- Color Scheme: ${tokens.colorScheme}

DETECTED SECTIONS (reproduce in this order):
${tokens.sections.length > 0 ? tokens.sections.map((s, i) => `${i + 1}. ${s}`).join('\n') : '- navbar\n- hero\n- features\n- footer'}

COLOR PALETTE (use EXACTLY these colors):
${tokens.colors.slice(0, 16).join(', ') || '#0f172a, #7c3aed, #ffffff, #e2e8f0'}

${tokens.primaryColor ? `PRIMARY COLOR: ${tokens.primaryColor}` : ''}
${tokens.bgColor ? `BACKGROUND: ${tokens.bgColor}` : ''}
${tokens.colorScheme === 'dark' ? 'THEME: Dark background with light text' : 'THEME: Light background with dark text'}

TYPOGRAPHY:
${tokens.fonts.length > 0 ? `Font families: ${tokens.fonts.join(', ')}` : 'Detect and use appropriate professional fonts'}
${tokens.fontFamily ? `Primary font: ${tokens.fontFamily}` : ''}

${tokens.cssVars && Object.keys(tokens.cssVars).length > 0 ? `CSS CUSTOM PROPERTIES DETECTED:\n${Object.entries(tokens.cssVars).slice(0, 20).map(([k, v]) => `  ${k}: ${v}`).join('\n')}` : ''}

ANIMATIONS DETECTED: ${tokens.animations.length > 0 ? tokens.animations.join(', ') : 'standard CSS transitions'}
ICON LIBRARY: ${tokens.iconLibrary || 'Font Awesome 6 (always use this as fallback)'}
RESPONSIVE BREAKPOINTS: ${tokens.breakpoints?.length > 0 ? tokens.breakpoints.join('px, ') + 'px' : '768px, 1024px'}

CONTENT TO RECONSTRUCT:
Headings: ${tokens.headings.slice(0, 8).join(' | ')}
${tokens.textContent ? `Text content:\n${tokens.textContent.slice(0, 2000)}` : ''}
${tokens.rawStyleSample ? `\nRAW CSS SAMPLE (study patterns & replicate):\n${tokens.rawStyleSample.slice(0, 3000)}` : ''}
${sectionTarget}
════════════════════════════════════════════
`

    // Phase 4: Supplementary image pool (injected when real images are insufficient)
    const _cloneImgPool = buildImagePoolBlock(tokens.layoutType || 'landing')
    const _cloneImageNote = `\n\n════════════════════════════════════════════
SUPPLEMENTARY IMAGES POOL (use when real site images are unavailable):
${_cloneImgPool}
════════════════════════════════════════════`

    // Phase 5: Pixel-Perfect Reconstruction via AI
    const cloneMessages = [
      { role: 'system', content: PIXEL_PERFECT_CLONE_PROMPT + _cloneImageNote + designContext },
      {
        role: 'user',
        content: section && section !== 'full'
          ? `Clone ONLY the "${section}" section of ${targetUrl}. Use the extracted design tokens above. Use 4–8 real images from the SUPPLEMENTARY IMAGES POOL. Output complete standalone HTML.`
          : `Reconstruct a pixel-perfect clone of ${targetUrl}. Use ALL the extracted design tokens, color palette, typography, and section structure above. Use 4–8 real images from the SUPPLEMENTARY IMAGES POOL. Footer copyright year must be DYNAMIC (new Date().getFullYear()). The result must be visually near-identical to the original.`
      },
    ]

    const result = await safeGenerateAI({ messages: cloneMessages, query: `clone ${targetUrl}`, max_tokens: 10000 })
    const rawResult = result.content || ''
    const htmlCode = extractHtmlFromResponse(rawResult) || rawResult

    if (!htmlCode || htmlCode.length < 200) {
      return res.status(200).json({
        ok: false,
        error: 'فشل في توليد الكود. جرّب مجدداً أو استخدم الاستنساخ البسيط.',
        tokens,
      })
    }

    // Phase 5: Extract CSS/JS for tabs
    const cssCode = extractCssFromHtml(htmlCode)
    const jsCode  = extractJsFromHtml(htmlCode)

    const sectionLabel = section && section !== 'full' ? ` — قسم: ${section}` : ''
    return res.status(200).json({
      ok: true,
      isWebsite: true,
      htmlCode,
      cssCode: cssCode || '',
      jsCode:  jsCode  || '',
      tokens,
      content: `🧬 **استنساخ متقدم${sectionLabel} — ${tokens.title || tokens.domain}**\n\n✅ تم استخراج ${tokens.colors.length} لون، ${tokens.fonts.length} خط، ${tokens.sections.length} قسم\n🎨 النظام اللوني: ${tokens.colorScheme === 'dark' ? 'داكن' : 'فاتح'} | النوع: ${tokens.layoutType}\n\n▶️ انقر **"معاينة مباشرة"** للمشاهدة أو **⬇ تحميل** للحفظ.`,
      webBuilderMeta: {
        type: tokens.layoutType,
        style: tokens.colorScheme === 'dark' ? 'dark' : 'premium',
        title: `🧬 ${tokens.title || tokens.domain}${sectionLabel}`,
        description: `استنساخ متقدم لـ ${tokens.domain}`,
        icon: '🧬',
      },
      webReaderIntent: 'build',
    })
  } catch (err) {
    console.error('[CloneEngine] clone-advanced error:', err.message)
    return res.status(500).json({ ok: false, error: 'خطأ داخلي في محرك الاستنساخ. يرجى المحاولة مرة أخرى.' })
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
    const mapped = items.slice(0, 20).map(item => ({
      source: item.source || 'Google News',
      title: item.title || '',
      snippet: item.description || '',
      url: item.link || '',
      date: item.pubDate || '',
    }))
    // Hard freshness filter: discard articles older than 60 days
    const fresh = filterFreshItems(mapped, 60)
    if (mapped.length > 0 && fresh.length < mapped.length) {
      console.log(`[GN-RSS] Dropped ${mapped.length - fresh.length} stale articles (> 60 days)`)
    }
    return fresh.slice(0, 12)
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
    { name: 'راديو الجزائر', url: 'https://news.radioalgerie.dz/ar/rss.xml' },
    { name: 'الشروق أونلاين', url: 'https://www.echoroukonline.com/feed' },
    { name: 'النهار', url: 'https://www.ennaharonline.com/feed/' },
    { name: 'الخبر', url: 'https://www.elkhabar.com/rss' },
    { name: 'البلاد', url: 'https://www.elbilad.net/rss' },
    { name: 'الفجر', url: 'https://www.al-fadjr.com/feed/' },
    { name: 'الحياة', url: 'https://elhayatdz.dz/feed/' },
    { name: 'TSA Algérie', url: 'https://www.tsa-algerie.com/feed/' },
    { name: 'الوطن', url: 'https://www.el-watan.com/feed/' },
    { name: 'جزاير تيوب', url: 'https://www.dzairtube.dz/feed/' },
    { name: 'جزايرس', url: 'https://www.djazairess.com/rss' },
    { name: 'الجزيرة عربي', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'BBC عربي', url: 'http://feeds.bbci.co.uk/arabic/rss.xml' },
    { name: 'رويترز عربي', url: 'https://feeds.reuters.com/reuters/arabicNews' },
    { name: 'فرانس 24 عربي', url: 'https://www.france24.com/ar/rss' },
    { name: 'Google أخبار الجزائر', url: 'https://news.google.com/rss/search?q=الجزائر&hl=ar&gl=DZ&ceid=DZ:ar' },
    { name: 'Google Algérie', url: 'https://news.google.com/rss/search?q=algerie&hl=fr&gl=DZ&ceid=DZ:fr' },
  ],
  sports: [
    { name: 'APS رياضة', url: 'https://www.aps.dz/ar/sport/feed' },
    { name: 'الهداف', url: 'https://www.elheddaf.com/feed' },
    { name: 'سبورت 360', url: 'https://arabic.sport360.com/feed/' },
    { name: 'كووورة', url: 'https://www.kooora.com/?feed=rss' },
    { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
    { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
    { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
    { name: 'Sky Sports', url: 'https://feeds.skynews.com/feeds/rss/sports.xml' },
    { name: 'CAF Football', url: 'https://www.cafonline.com/rss-feed/' },
    { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/rss/' },
  ],
  tech: [
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'Wired', url: 'https://www.wired.com/feed/rss' },
    { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
    { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/' },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
  ],
}

// ── Load owner config and inject custom feeds ─────────────────────────────────
const _ownerCfg = loadOwnerConfig()
{
  const _extraFeeds = getExtraFeeds(_ownerCfg)
  if (_extraFeeds.length) {
    RSS_FEEDS.national.push(..._extraFeeds)
    console.log(`[OwnerCmd] Loaded ${_extraFeeds.length} custom news feed(s) from owner config`)
  }
}

// ===== FOOTBALL INTELLIGENCE SYSTEM =====
const FOOTBALL_CACHE = new Map()
const FOOTBALL_CACHE_TTL = 5 * 60 * 1000 // 5 min for live match data

const INTL_FOOTBALL_FEEDS = [
  { name: 'APS رياضة', url: 'https://www.aps.dz/ar/sport/feed' },
  { name: 'الهداف', url: 'https://www.elheddaf.com/feed' },
  { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
  { name: 'Sky Sports', url: 'https://feeds.skynews.com/feeds/rss/sports.xml' },
  { name: 'سبورت 360', url: 'https://arabic.sport360.com/feed/' },
  { name: 'كووورة', url: 'https://www.kooora.com/?feed=rss' },
  { name: 'CAF Football', url: 'https://www.cafonline.com/rss-feed/' },
  { name: 'Yahoo Sports', url: 'https://sports.yahoo.com/rss/' },
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
    'صحف','صحيفة','عناوين','جرائد','جريدة','الشروق','النهار','الخبر','الوطن','الشعب','البلاد',
    'newspaper','headlines','press','presse','journal','journaux',
  ]
  const isSports = sportsKw.some(k => lower.includes(k))
  const isNews = newsKw.some(k => lower.includes(k))
  if (isSports && isNews) return 'both'
  if (isSports) return 'sports'
  if (isNews) return 'news'
  return null
}

// ── Extract the specific subject/entity from a news query ─────────────────────
// e.g. "آخر الأخبار عن رياض محرز" → "رياض محرز"
//      "news about Mahrez" → "Mahrez"
//      "أخبار الجزائر" → null (generic, not a specific subject)
function extractNewsSubject(msg) {
  if (!msg) return null
  let s = msg.trim()

  // Strip Arabic preposition patterns (order matters: longest first)
  const arPrefixes = [
    /^(ما هي |ما هو |ما |هل )?(آخر الأخبار|أحدث الأخبار|آخر أخبار|أخبار|خبر) (عن|حول|بخصوص|بشأن|ل|الخاصة ب|المتعلقة ب)\s+/i,
    /^(أعطني |اعطني |اريد |أريد |أخبرني عن |قدم لي |قدملي )?(آخر الأخبار|أحدث الأخبار|آخر أخبار|أخبار|خبر) (عن|حول|بخصوص|بشأن|ل)\s+/i,
    /^(ما آخر|ما أخبار|آخر) أخبار\s+/i,
    /^أخبار\s+/i,
    /^(اريد |أريد )أخبار\s+/i,
  ]
  // Strip English preposition patterns
  const enPrefixes = [
    /^(what('s| is| are) the )?(latest|recent|last|breaking) news (about|on|regarding|of)\s+/i,
    /^news (about|on|regarding|of)\s+/i,
    /^(tell me )?(about|latest about)\s+/i,
  ]
  // Strip French preposition patterns
  const frPrefixes = [
    /^(quelles sont les )?(dernières nouvelles|actualités|nouvelles) (sur|de|à propos de|concernant)\s+/i,
    /^(nouvelles|actualités) (sur|de)\s+/i,
  ]

  for (const re of [...arPrefixes, ...enPrefixes, ...frPrefixes]) {
    const m = s.match(re)
    if (m) { s = s.slice(m[0].length).trim(); break }
  }

  // If nothing was stripped, the subject is ambiguous — don't return it
  if (s.toLowerCase() === msg.trim().toLowerCase()) return null

  // Strip trailing punctuation / question marks
  s = s.replace(/[\u061F?!،,\.]+$/, '').trim()

  // Ignore very short (1 char) or very generic terms
  if (!s || s.length < 2) return null
  const genericTerms = [
    'الجزائر','algeria','algérie','الاقتصاد','السياسة','الرياضة','اليوم','العالم',
    'economy','politics','sport','world','today','الأخبار','news',
  ]
  if (genericTerms.some(g => s.toLowerCase() === g.toLowerCase())) return null

  return s
}

function isNewspaperHeadlineQuery(msg) {
  const lower = msg.toLowerCase()
  const newspaperKw = ['صحف','صحيفة','عناوين','جرائد','جريدة','الصحف','الجرائد','newspaper','headlines','press','presse']
  return newspaperKw.some(k => lower.includes(k))
}

// ── Web Reader Mode — URL detection & content extraction ─────────────────────
const URL_RE = /https?:\/\/[^\s\u0600-\u06FF"'،؟!]+/gi

function extractUrlsFromMessage(msg) {
  if (!msg) return []
  return [...msg.matchAll(URL_RE)].map(m => m[0].replace(/[.,;)>\]]+$/, '')).filter(u => {
    try { new URL(u); return true } catch { return false }
  })
}

async function fetchWebContent(url, maxChars = 6000) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DZ-GPT-WebReader/1.0)',
        'Accept': 'text/html,text/plain,*/*',
        'Accept-Language': 'ar,fr,en',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return { error: `HTTP ${r.status}`, url }
    const raw = await r.text()

    // Strip scripts, styles, nav, footer, ads
    let clean = raw
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')

    // Extract title
    const title = (clean.match(/<title[^>]*>([^<]{1,200})<\/title>/i) || [])[1]?.trim() || ''

    // Extract headings
    const headings = [...clean.matchAll(/<h[1-4][^>]*>([\s\S]{1,150}?)<\/h[1-4]>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(h => h.length > 2).slice(0, 15)

    // Extract paragraphs
    const paragraphs = [...clean.matchAll(/<p[^>]*>([\s\S]{20,1200}?)<\/p>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
      .filter(p => p.length > 20).slice(0, 30)

    // Extract code blocks
    const codeBlocks = [...clean.matchAll(/<(?:pre|code)[^>]*>([\s\S]{10,2000}?)<\/(?:pre|code)>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').trim()).slice(0, 5)

    // Extract meta description
    const metaDesc = (clean.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i) || [])[1]?.trim() || ''

    const content = [
      title ? `## ${title}` : '',
      metaDesc ? `> ${metaDesc}` : '',
      headings.length ? '\n### Headings:\n' + headings.map(h => `- ${h}`).join('\n') : '',
      paragraphs.length ? '\n### Content:\n' + paragraphs.join('\n\n') : '',
      codeBlocks.length ? '\n### Code:\n' + codeBlocks.map(c => '```\n' + c + '\n```').join('\n') : '',
    ].filter(Boolean).join('\n')

    return {
      url,
      title,
      content: content.length > maxChars ? content.slice(0, maxChars) + '\n...[مقتطع]' : content,
      headings,
      paragraphs: paragraphs.length,
      hasCodes: codeBlocks.length > 0,
    }
  } catch (err) {
    return { error: err.message, url }
  }
}

// ── Web Reader Intent Detector — BUILD / READER / UPDATE ─────────────────────
function detectWebReaderIntent(msg) {
  if (!msg) return 'reader'
  // BUILD: "ابني من هذا الموقع" / "اصنع" / "اعمل" / "أنشئ" / build / create
  if (/ابني?(?:لي)?|اصنع(?:لي)?|أنش[أئ](?:لي)?|انش[أئ]|اعمل(?:لي)?|أعمل|بني?|صمم|دير|طور|generate|build|create|make|inspired?|استلهم|مستوحى/i.test(msg)) return 'build'
  // UPDATE: "أضف ميزة" / "عدّل" / "حسّن" / add feature / improve
  if (/أضف|اضف|اضافه|ميزه|ميزة|عدّل|عدل|حسّن|حسن|طوّر|اضافة|update|modify|improve|add\s+feature|تحديث|تحسين/i.test(msg)) return 'update'
  // READER: default — analyze, summarize, explain
  return 'reader'
}

// ── Deep Query Analyzer — يفهم من/ماذا/متى/أين/كيف/لماذا قبل الإجابة ─────
// Known sports persons — used to disambiguate "نتائج" from exam results
const SPORTS_PERSONS_RE = /محرز|مانه|مبابي|بنزيمة|رونالدو|ميسي|نيمار|صلاح|هالاند|زيدان|ماني|بن لمقدم|بن ناصر|هاري|بن راهمة|سليماني|قداف|آيت نور|بن عيسى|بوزوق|بلايلي|بن شريفة|تالسكر|تاليسكا|بنتال|فاران|خيمينيز|شيكي|لمين يمال|بن مبارك|بوفال|Mahrez|Mane|Mbappe|Benzema|Ronaldo|Messi|Neymar|Salah|Haaland|Zidane|Atal|Bennacer|Slimani|Ghoulam|Brahimi|Feghouli|Bounedjah/i

// Sports teams — clubs and national teams
const SPORTS_TEAMS_RE = /شبيبة بلوزداد|اتحاد الجزائر|مولودية الجزائر|وفاق سطيف|مولودية وهران|نصر حسين داي|اتحاد بسكرة|ريال مدريد|برشلونة|باريس سان جيرمان|مانشستر|ليفربول|باييرن|يوفنتوس|دورتموند|أرسنال|تشيلسي|الهلال|النصر|الأهلي|المنتخب الجزائري|المنتخب الوطني|Real Madrid|Barcelona|PSG|Manchester|Liverpool|Bayern|Juventus|Arsenal|Chelsea|Dortmund/i

function analyzeQuery(msg) {
  if (!msg || msg.trim().length < 2) return null
  const isArabic = /[\u0600-\u06FF]/.test(msg)
  const isFrench = /\b(bonjour|comment|quoi|quel|quelle|est-ce|pourquoi|quand|où|qui|nouvelles|actualité|dernières?)\b/i.test(msg)
  const lang = isArabic ? 'ar' : isFrench ? 'fr' : 'en'

  // ── 0. PRIORITY: Sports person / team detection (beats generic classifiers) ──
  // Fixes: "آخر نتائج رياض محرز" → sports_news (not education/news)
  const hasSportsPerson = SPORTS_PERSONS_RE.test(msg)
  const hasSportsTeam   = SPORTS_TEAMS_RE.test(msg)
  const hasSportsContext = hasSportsPerson || hasSportsTeam

  // ── 1. Question Type Detection ────────────────────────────────────────
  const QT = {
    youtube:    /فيديو|يوتيوب|يوتيب|كليب|اغنية|أغنية|موسيقى|نشيد|أنشودة|مقطع.*فيديو|youtube|video\s*clip|music\s*video/i,
    news:       /أخبار|خبر|آخر أخبار|عاجل|حدث|news|latest|breaking|actualité|nouvelles/i,
    sports:     /مباراة|مباريات|نتيجة|نتائج رياضية|هدف|دوري|كأس|منتخب|لاعب|فريق|football|soccer|match|score|league|ليغ|هداف|تصفيات|الملعب|ركلة|خماسي|سداسي|تشكيلة/i,
    weather:    /طقس|حرارة|مطر|رياح|جو|درجة|weather|température|pluie|ثلج|عاصفة|رطوبة/i,
    price:      /سعر|أسعار|سعر الصرف|دولار|يورو|دينار|price|exchange rate|cours|تحويل|كم يساوي|صرف/i,
    prayer:     /صلاة|أذان|مواقيت|فجر|ظهر|عصر|مغرب|عشاء|prayer|salat/i,
    education:  /درس|دروس|تمرين|شرح|مادة|بكالوريا|بيام|lesson|exercise|homework|bac|شرح لي|اشرح/i,
    code:       /كود|برمجة|كيف أعمل|كيف أكتب|github|api|function|class|error|bug|npm|python|javascript|react|كتابة كود|اكتب لي|اكتب برنامج/i,
    howto:      /كيف|طريقة|خطوات|كيفية|how to|comment faire|étapes|steps|guide|ما هي طريقة|علاش|وش كيف/i,
    factual:    /ما هو|ما هي|من هو|من هي|متى|أين|كم|what is|who is|when|where|pourquoi|combien|قداش|شكون|وين|وقتاه/i,
    location:   /خريطة|عنوان|أين|مكان|مطعم|محطة|فندق|مستشفى|map|location|restaurant|hospital|hotel|adresse|ولاية|بلدية/i,
    comparison: /مقارنة|الفرق بين|أيهما أفضل|vs|versus|compare|différence|مقابل|أحسن|والو فالفرق/i,
    admin:      /وثيقة|بطاقة|جواز|رخصة|شهادة|استخراج|سجل|تسجيل|إجراء|passeport|permis|document|carte|إدارة|بلدية|وثائق/i,
  }

  let questionType = 'general'

  // PRIORITY 0: URL in message → web_reader mode (beats everything)
  const _msgUrls = extractUrlsFromMessage(msg)
  if (_msgUrls.length > 0) {
    questionType = 'web_reader'
  } else if (hasSportsContext) {
    // If sports person/team detected → always sports_news (highest priority)
    questionType = 'sports_news'
  } else {
    for (const [type, re] of Object.entries(QT)) {
      if (re.test(msg)) { questionType = type; break }
    }
    // "آخر / نتائج" + sports keywords → sports_news
    if (QT.sports.test(msg) && (QT.news.test(msg) || /آخر|أحدث|جديد|latest|recent/i.test(msg))) {
      questionType = 'sports_news'
    }
  }

  // Safety: if "نتائج" alone (without explicit exam context) + sports signal → sports_news
  // Prevents AI from hallucinating "نتائج البكالوريا" for sports queries
  const hasNatayij = /نتائج|نتيجة/.test(msg)
  const hasExamContext = /بكالوريا|بيام|شهادة|امتحان|اختبار|فرض|bem|bac\b/.test(msg)
  if (hasNatayij && !hasExamContext && QT.sports.test(msg)) {
    questionType = 'sports_news'
  }

  // ── 2. Timeframe Detection ────────────────────────────────────────────
  let timeframe = null
  if (/الآن|مباشر|live|en direct|right now|حالياً|هاذ الوقت/i.test(msg)) timeframe = 'live'
  else if (/اليوم|هذا الصباح|الليلة|today|aujourd'hui|ce soir|ليوم|النهار/i.test(msg)) timeframe = 'today'
  else if (/هذا الأسبوع|آخر|حديث|أخير|this week|recent|derniers?|هاذ الجمعة/i.test(msg)) timeframe = 'recent'
  else if (/\b(20[0-2][0-9])\b/.test(msg) || /تاريخ|قديم|سابق|منذ|historical|depuis/i.test(msg)) timeframe = 'historical'

  // ── 3. Entity Extraction ──────────────────────────────────────────────
  const entities = []

  // Priority: detect known sports person/team names first
  const sportsPersonMatch = msg.match(SPORTS_PERSONS_RE)
  const sportsTeamMatch   = msg.match(SPORTS_TEAMS_RE)
  if (sportsPersonMatch) entities.push(sportsPersonMatch[0])
  else if (sportsTeamMatch) entities.push(sportsTeamMatch[0])

  // Arabic entity patterns (prep phrases + contextual nouns)
  const arEntityPatterns = [
    /(?:عن|حول|بخصوص|بشأن|لـ|لل|خاص بـ?)\s+([\u0600-\u06FF][\u0600-\u06FF\s]{2,28}?)(?:\s*[؟?!،,]|$)/,
    /(?:أخبار|خبر|معلومات|تفاصيل|نتائج|وضع|حال|قصة|مسيرة|إحصائيات)\s+([\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){0,3})/,
  ]
  for (const re of arEntityPatterns) {
    const m = msg.match(re)
    if (m && m[1]) {
      const candidate = m[1].trim().replace(/[\u061F?!،,\.]+$/, '').replace(/\s+/g, ' ')
      const genericTerms = new Set(['الجزائر','اليوم','العالم','الأخبار','الرياضة','السياسة','المباريات'])
      if (candidate.length > 2 && !genericTerms.has(candidate) && !entities.includes(candidate)) {
        entities.push(candidate); break
      }
    }
  }

  // Latin proper names (capitalized sequences)
  const latinEntities = msg.match(/(?<![.!?]\s)\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*/g) || []
  const skipWords = new Set(['The','This','What','When','Who','How','Where','Why','Latest','News','Tell','Are','Does','Did','Can'])
  for (const e of latinEntities) {
    if (!skipWords.has(e) && !entities.includes(e)) entities.push(e)
  }

  // ── 4. Main Subject (reuses existing extractor) ───────────────────────
  const subject = extractNewsSubject(msg) || entities[0] || null

  // ── 5. Expected Response Format ───────────────────────────────────────
  let expectedFormat = 'summary'
  if (['howto', 'education', 'code', 'admin'].includes(questionType)) expectedFormat = 'steps'
  else if (['news', 'sports', 'sports_news'].includes(questionType)) expectedFormat = 'list'
  else if (questionType === 'comparison') expectedFormat = 'table'
  else if (questionType === 'factual') expectedFormat = 'explanation'
  else if (['weather', 'price'].includes(questionType)) expectedFormat = 'table'

  // ── 6. Contextual Follow-up Suggestions ──────────────────────────────
  const suggestionsMap = {
    news:        subject
      ? [`آخر أخبار ${subject} هذا الأسبوع`, `تاريخ ${subject}`, `${subject} في الجزائر`]
      : ['أبرز أخبار الجزائر اليوم', 'آخر أخبار العالم', 'الأخبار الرياضية'],
    sports:      subject
      ? [`إحصائيات ${subject} هذا الموسم`, `مباريات ${subject} القادمة`, `آخر أخبار ${subject}`]
      : ['نتائج مباريات اليوم', 'ترتيب الدوري الجزائري', 'نتائج دوري الأبطال'],
    sports_news: subject
      ? [`مسيرة ${subject}`, `إحصائيات ${subject} هذا الموسم`, `أحدث تصريحات ${subject}`]
      : ['أخبار المنتخب الوطني', 'انتقالات الصيف', 'نتائج دوري الأبطال'],
    weather:     ['توقعات الطقس لهذا الأسبوع', 'الطقس في مدن أخرى بالجزائر', 'هل سيكون غداً ممطراً؟'],
    price:       ['سعر الدولار اليوم بالجزائر', 'سعر اليورو مقابل الدينار', 'أسعار العملات الخليجية'],
    prayer:      ['مواقيت الصلاة في مدينة أخرى', 'قبلة الصلاة', 'أوقات الإفطار والسحور'],
    education:   ['تمارين مماثلة من eddirasa', 'شرح الدرس التالي', 'نماذج بكالوريا 2025'],
    code:        ['كيف أحسّن أداء الكود؟', 'أفضل ممارسات الأمان', 'مكتبات مفيدة لهذا المشروع'],
    howto:       ['خطوات أكثر تفصيلاً', 'بدائل لهذه الطريقة', 'نصائح للمبتدئين'],
    factual:     subject
      ? [`تاريخ ${subject}`, `${subject} في الجزائر`, `أهم ${subject} في العالم`]
      : ['معلومات عن الجزائر', 'تاريخ الجزائر', 'ثقافة وتقاليد جزائرية'],
    location:    ['أقرب مستشفى', 'مواصلات عامة', 'خريطة الجزائر العاصمة'],
    comparison:  ['مزايا وعيوب كل خيار', 'تجارب المستخدمين', 'الأنسب للسياق الجزائري'],
    admin:       ['الوثائق المطلوبة كاملاً', 'المواعيد والأوقات الرسمية', 'خدمات الكترونية متاحة'],
    general:     ['أخبار الجزائر اليوم', 'مباريات اليوم', 'سعر الدولار اليوم'],
  }
  const suggestions = suggestionsMap[questionType] || suggestionsMap.general

  // ── 7. Confidence score (how well understood is the query) ────────────
  let confidence = 'medium'
  if (subject && timeframe) confidence = 'high'
  else if (!subject && questionType === 'general') confidence = 'low'

  return { questionType, lang, timeframe, entities, subject, expectedFormat, suggestions, isArabic, confidence }
}

function buildRSSContext(feedResults, queryType, subject = null, maxAgeDays = 14) {
  if (!feedResults.length) return ''
  const date = new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const label = queryType === 'sports' ? '⚽ نتائج وأخبار رياضية' : '📰 أخبار'

  // Build subject keywords for filtering (split multi-word subject into tokens)
  const subjectTokens = subject
    ? subject.toLowerCase().split(/\s+/).filter(t => t.length > 1)
    : null

  function itemMatchesSubject(item) {
    if (!subjectTokens || subjectTokens.length === 0) return true
    const haystack = ((item.title || '') + ' ' + (item.description || '')).toLowerCase()
    return subjectTokens.some(tok => haystack.includes(tok))
  }

  function getItemDate(item) {
    const d = item.pubDate || item.date || item.publishedDate || ''
    if (!d) return 0
    const t = new Date(d).getTime()
    return isNaN(t) ? 0 : t
  }

  // Collect ALL items across feeds, apply filters, then sort by date newest-first
  const allItems = []
  for (const feed of feedResults) {
    if (!feed.items?.length) continue
    const freshItems = filterFreshItems(feed.items, maxAgeDays)
    for (const item of freshItems) {
      if (itemMatchesSubject(item)) allItems.push({ ...item, _feedName: feed.name })
    }
  }

  // Sort newest first
  allItems.sort((a, b) => getItemDate(b) - getItemDate(a))

  if (allItems.length === 0) return ''

  let ctx = `\n\n--- ${label}${subject ? ` — ${subject}` : ''} — ${date} (مرتبة من الأحدث) ---\n`
  let count = 0
  for (const item of allItems.slice(0, 20)) {
    const rawDate = item.pubDate || item.date || item.publishedDate || ''
    let dateLabel = ''
    if (rawDate) {
      try {
        const ageH = (Date.now() - new Date(rawDate).getTime()) / 3600000
        if (ageH < 1) dateLabel = ' (منذ دقائق)'
        else if (ageH < 24) dateLabel = ` (منذ ${Math.floor(ageH)} ساعة)`
        else dateLabel = ` (${new Date(rawDate).toLocaleDateString('ar-DZ')})`
      } catch {}
    }
    ctx += `• **[${item._feedName}]** ${item.title}${dateLabel}`
    if (item.link) ctx += ` — ${item.link}`
    ctx += '\n'
    count++
  }
  if (count === 0) return ''
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
  { name: 'الهداف', url: 'https://www.elheddaf.com/feed' },
  { name: 'جزايرس', url: 'https://www.djazairess.com/rss' },
  { name: 'الجزيرة', url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9' },
  { name: 'BBC عربي', url: 'https://feeds.bbci.co.uk/arabic/rss.xml' },
  { name: 'Google أخبار الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: 'Google سياسة الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%B3%D9%8A%D8%A7%D8%B3%D8%A9&hl=ar&gl=DZ&ceid=DZ:ar' },
  { name: 'Google اقتصاد الجزائر', url: 'https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%AC%D8%B2%D8%A7%D8%A6%D8%B1+%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF&hl=ar&gl=DZ&ceid=DZ:ar' },
]
// NOTE: Removed 'سبورت 360' (sport360) feed — was contaminating the Algerian
// League card with unrelated content. Algerian league data is now strictly
// sourced from lfp.dz only. Generic football news is sourced from
// Algeria-focused / international football feeds only.
const SPORTS_FEEDS_DASHBOARD = [
  // Removed: الجزيرة الرياضة (per user request — keeps the Algerian league
  // section uncontaminated by Al Jazeera Sport content)
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

  // Sort all articles newest-first before grouping
  const sorted = [...articles].sort((a, b) => {
    const ta = a.pubDate ? new Date(a.pubDate).getTime() : 0
    const tb = b.pubDate ? new Date(b.pubDate).getTime() : 0
    return tb - ta
  })

  let ctx = `\n\n--- ${label} — ${date} (مرتبة من الأحدث) ---\n`

  // Group by category (preserving sorted order within each category)
  const byCategory = {}
  const catOrder = []
  for (const art of sorted) {
    const cat = art.category || 'عام'
    if (!byCategory[cat]) { byCategory[cat] = []; catOrder.push(cat) }
    byCategory[cat].push(art)
  }

  for (const cat of catOrder) {
    const items = byCategory[cat]
    ctx += `\n**${cat}:**\n`
    for (const item of items.slice(0, 4)) {
      ctx += `• ${item.title}`
      if (item.link && item.source) ctx += ` — [${item.source}](${item.link})`
      else if (item.link) ctx += ` — [المصدر](${item.link})`
      else if (item.source) ctx += ` — ${item.source}`
      if (item.pubDate) {
        try {
          const ageH = (Date.now() - new Date(item.pubDate).getTime()) / 3600000
          if (ageH < 1) ctx += ` (منذ دقائق)`
          else if (ageH < 24) ctx += ` (منذ ${Math.floor(ageH)} ساعة)`
          else ctx += ` (${new Date(item.pubDate).toLocaleDateString('ar-DZ')})`
        } catch {}
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
  // Task 11+12: Use resilient multi-source engine — no API key needed
  const WEATHER_CITIES = ['Algiers', 'Oran', 'Constantine', 'Annaba']
  const results = await Promise.allSettled(
    WEATHER_CITIES.map(city => fetchCityWeatherResilient(city))
  )
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { city: WEATHER_CITIES[i], temp: null, condition: null, icon: null }
  )
}

app.get('/api/dz-agent/dashboard', async (req, res) => {
  const bypassCache = req.query.bypassCache === '1' || req.query.refresh === '1'
  if (!bypassCache && DASHBOARD_CACHE.data && Date.now() - DASHBOARD_CACHE.ts < DASHBOARD_TTL) {
    return res.json(DASHBOARD_CACHE.data)
  }

  // Vercel serverless: cap total fetch time to 50s to stay within the 60s function limit
  const FETCH_TIMEOUT_MS = 50000
  const [newsFeeds, sportsFeeds, techFeeds, weather, lfpResult, gnRssResult] = await Promise.race([
    Promise.allSettled([
      fetchMultipleFeeds(NEWS_FEEDS_DASHBOARD),
      fetchMultipleFeeds(SPORTS_FEEDS_DASHBOARD),
      fetchMultipleFeeds(TECH_FEEDS_DASHBOARD),
      fetchWeatherAlgiers(),
      fetchAlgerianLeague({ bypassCache }),
      // GN-RSS: fetch Arabic Algeria feeds for dashboard augmentation
      fetchGNRSSArticles(GN_RSS_FEEDS.ar),
    ]),
    new Promise(resolve => setTimeout(() => resolve([
      { status: 'rejected', reason: 'timeout' },
      { status: 'rejected', reason: 'timeout' },
      { status: 'rejected', reason: 'timeout' },
      { status: 'rejected', reason: 'timeout' },
      { status: 'rejected', reason: 'timeout' },
      { status: 'rejected', reason: 'timeout' },
    ]), FETCH_TIMEOUT_MS)),
  ])

  const existingNews = (newsFeeds.status === 'fulfilled' ? newsFeeds.value : [])
    .flatMap(f => (f?.items || []).map(item => ({ ...item, feedName: f.name })))

  // Merge GN-RSS articles with existing news (GN-RSS first for freshness, then deduplicate)
  const gnDashboardArticles = (gnRssResult.status === 'fulfilled' ? gnRssResult.value : [])
    .map(item => ({ ...item, feedName: item.gnSource || 'Google News' }))

  // ── NEWS INTELLIGENCE PIPELINE ──────────────────────────────────────────
  // 1. merge GN-RSS + classic feeds  2. dedup by title similarity
  // 3. drop outdated (year < currentYear-1)  4. balance categories
  //    (≤30% sports, ≥40% Algerian national, rest international)
  // 5. sort most-recent-first. Anti-empty: if upstream returned nothing,
  //    we still set news=[] so the UI can show its own empty-state.
  const mergedNewsRaw = deduplicateGNArticles([...gnDashboardArticles, ...existingNews])
  const mergedFreshNews = mergedNewsRaw.filter(n => isFreshItem(n, { maxAgeDays: 30 }))
  if (mergedFreshNews.length < mergedNewsRaw.length) {
    diagLog('outdated', { module: 'dashboard.news', dropped: mergedNewsRaw.length - mergedFreshNews.length })
  }
  const dedupedNews = dedupByTitleSimilarity(mergedFreshNews, 0.7)
  const allNews = balanceNewsCategories(dedupedNews, 18)
  if (allNews.length === 0) diagLog('empty', { module: 'dashboard.news', upstream: mergedNewsRaw.length })

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

async function fetchPrayerByCoords(lat, lon, cityLabel) {
  const cacheKey = `coords-${lat.toFixed(3)}-${lon.toFixed(3)}`
  const cached = PRAYER_CACHE.get(cacheKey)
  if (cached && Date.now() - cached.ts < PRAYER_CACHE_TTL) return cached.data
  try {
    const today = new Date()
    const dd = String(today.getDate()).padStart(2, '0')
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const yyyy = today.getFullYear()
    const url = `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}?latitude=${lat}&longitude=${lon}&method=2`
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(`aladhan coords error: ${r.status}`)
    const d = await r.json()
    if (d.code !== 200) throw new Error('aladhan returned non-200')
    const t = d.data?.timings
    const result = {
      city: cityLabel || 'موقعك الحالي',
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
    console.error('[Prayer] aladhan coords error:', err.message)
    return null
  }
}

// GPS reverse-geocode: returns nearest wilaya by Euclidean distance (no external API)
// ── DZ Maps: GPS Nearby endpoint (Overpass API) ───────────────────────────
app.post('/api/dz-maps/nearby', async (req, res) => {
  const { lat, lng, poiKey, radius = 3000 } = req.body || {}
  if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) {
    return res.status(400).json({ error: 'lat/lng required' })
  }
  const numLat = Number(lat)
  const numLng = Number(lng)
  const def      = poiKey ? POI_TYPES[poiKey] : null
  const enSearch = poiKey ? (POI_EN_SEARCH[poiKey] || def?.nameAr || '') : ''

  const embedUrl = buildNearbyEmbedUrl(numLat, numLng)
  const gmapsSearchLink = poiKey
    ? `https://www.google.com/maps/search/${encodeURIComponent(enSearch)}/@${numLat},${numLng},15z`
    : `https://www.google.com/maps/@${numLat},${numLng},15z`

  // Query real POI data from OpenStreetMap Overpass API
  let results = []
  try {
    const raw = await queryNearby(numLat, numLng, poiKey || null, Number(radius))
    results = raw.map(r => ({
      ...r,
      distanceLabel: formatDistance(r.distanceM),
      gmapsDir: `https://www.google.com/maps/dir/${numLat},${numLng}/${r.lat},${r.lng}`,
      gmapsPlace: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}&query_place_id=${r.osmId || ''}`,
    }))
  } catch (e) {
    console.warn('[DZ-Maps/Nearby] Overpass query failed:', e.message)
    // Non-fatal — return map without results list
  }

  return res.json({
    isMap: true,
    results,
    mapMeta: {
      type:         poiKey ? 'poi' : 'location',
      gmapsUrl:     embedUrl,
      gmapsLink:    gmapsSearchLink,
      poiKey:       poiKey || null,
      poiIcon:      def?.icon  || '📍',
      poiNameAr:    def?.nameAr || 'موقعك',
      locationName: 'موقعك الحالي',
      locationFr:   'votre position',
      lat:          numLat,
      lng:          numLng,
      fromGps:      true,
    },
  })
})

app.get('/api/dz-agent/reverse-geocode', (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat/lon required' })
  const w = findNearestWilaya(lat, lon)
  if (!w) return res.status(404).json({ error: 'no match' })
  res.json({ en: w.en, ar: w.ar, lat: w.lat, lon: w.lon })
})

app.get('/api/dz-agent/prayer', async (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)

  // GPS mode: use coordinates directly
  if (!isNaN(lat) && !isNaN(lon)) {
    const nearest = findNearestWilaya(lat, lon)
    const label = nearest?.ar || 'موقعك الحالي'
    const data = await fetchPrayerByCoords(lat, lon, label)
    if (data) return res.json({ ...data, gps: true })
    // fallback to nearest city
    const fallbackCity = nearest?.en || 'Algiers'
    const fallback = await fetchPrayerTimesAladhan(fallbackCity)
    if (fallback) return res.json({ ...fallback, gps: true })
  }

  const city = String(req.query.city || 'Algiers').slice(0, 80)
  const data = await fetchPrayerTimesAladhan(city)
  if (!data) {
    return res.status(200).json({
      city,
      country: 'Algeria',
      source: 'unavailable',
      date: new Date().toLocaleDateString('ar-DZ'),
      times: { 'الفجر': '--', 'الشروق': '--', 'الظهر': '--', 'العصر': '--', 'المغرب': '--', 'العشاء': '--' },
      error: 'تعذّر جلب مواقيت الصلاة من aladhan.com مؤقتاً',
      status: 'unavailable',
    })
  }
  return res.json(data)
})

// ===== WEATHER BY CITY — Resilient Multi-Source (Tasks 11-13) =====
// Primary: open-meteo.com (free, no key)
// Secondary: wttr.in (free, no key)
// Tertiary: OpenWeatherMap (API key optional)
// Fallback: stale cache — NEVER returns empty

app.get('/api/dz-agent/weather', async (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)

  // GPS mode: use coordinates directly via open-meteo
  if (!isNaN(lat) && !isNaN(lon)) {
    try {
      const nearest = findNearestWilaya(lat, lon)
      const label = nearest?.ar || 'موقعك الحالي'
      const data = await fetchWeatherByCoords(lat, lon, label)
      return res.json({ ...data, gps: true })
    } catch (err) {
      console.error('[Weather] GPS coords fetch failed:', err.message)
      // fallback to nearest city name
    }
  }

  const city = String(req.query.city || 'Algiers').slice(0, 80)
  try {
    const data = await fetchCityWeatherResilient(city)
    return res.json(data)
  } catch (err) {
    console.error('[Weather] All sources failed:', err.message)
    return res.status(200).json({
      city,
      temp: null, feels_like: null, temp_min: null, temp_max: null,
      condition: null, icon: null, humidity: null, wind: null, visibility: null,
      error: `تعذّر جلب الطقس لـ ${city} — يعاد المحاولة في الخلفية`,
      status: 'unavailable',
      fetchedAt: new Date().toISOString(),
    })
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

// ===== ALGERIAN LEAGUE — STRICT VALIDATION (Issue 1 fix) =====
// Reject any match whose teams contain forbidden tokens (e.g. "360",
// "sport360"). Ensures the Algerian-League card never shows unrelated data
// scraped from other sources.
const LFP_FORBIDDEN_TOKENS = ['360', 'sport360', 'سبورت 360']
function isCleanTeamName(name) {
  if (!name || typeof name !== 'string') return false
  const trimmed = name.trim()
  if (trimmed.length < 2) return false
  const lower = trimmed.toLowerCase()
  return !LFP_FORBIDDEN_TOKENS.some(tok => lower.includes(tok.toLowerCase()))
}
function validateAlgerianLeague(matches) {
  if (!Array.isArray(matches) || matches.length === 0) return false
  return matches.every(m => isCleanTeamName(m.home) && isCleanTeamName(m.away))
}
function sanitizeAlgerianLeague(matches) {
  if (!Array.isArray(matches)) return []
  return matches.filter(m => isCleanTeamName(m.home) && isCleanTeamName(m.away))
}

async function fetchLFPData() {
  // Task 13: Use new resilient cache first
  const sportsCached = SPORTS_CACHE_V2.get('lfp')
  if (sportsCached) return sportsCached
  if (LFP_CACHE.data && Date.now() - LFP_CACHE.ts < LFP_CACHE_TTL) return LFP_CACHE.data

  try {
    // Issue 1 fix: STRICT source binding — only lfp.dz pages.
    // Primary match source is the official calendar page; /ar is a backup
    // gallery view; /ar/articles is for news only.
    const [calRes, homeRes, articlesRes] = await Promise.allSettled([
      resilientFetch('https://lfp.dz/ar/calendar', { timeout: 12000, retries: 3 }),
      resilientFetch('https://lfp.dz/ar', { timeout: 12000, retries: 2 }),
      resilientFetch('https://lfp.dz/ar/articles', { timeout: 12000, retries: 2 }),
    ])

    const calHtml = calRes.status === 'fulfilled' && calRes.value.ok ? await calRes.value.text() : ''
    const homeHtml = homeRes.status === 'fulfilled' && homeRes.value.ok ? await homeRes.value.text() : ''
    const articlesHtml = articlesRes.status === 'fulfilled' && articlesRes.value.ok ? await articlesRes.value.text() : ''

    // Try calendar first, fall back to homepage
    let matches = calHtml ? parseLFPMatches(calHtml) : []
    if (matches.length === 0 && homeHtml) matches = parseLFPMatches(homeHtml)

    // Issue 1 fix: validate + sanitize before exposing to UI / AI
    matches = sanitizeAlgerianLeague(matches)
    if (matches.length > 0 && !validateAlgerianLeague(matches)) {
      console.warn('[LFP] Validation failed after sanitize — falling back to cache')
      const stale = SPORTS_CACHE_V2.getStale('lfp')
      return stale?.data || LFP_CACHE.data || { matches: [], articles: [], fetchedAt: null, source: 'lfp.dz' }
    }

    const articles = articlesHtml ? parseLFPArticles(articlesHtml) : []

    const data = {
      matches,
      articles: articles.slice(0, 10),
      fetchedAt: new Date().toISOString(),
      source: 'lfp.dz/ar/calendar',
    }

    // Task 13: Store in both caches
    LFP_CACHE.data = data
    LFP_CACHE.ts = Date.now()
    SPORTS_CACHE_V2.set('lfp', data)
    console.log(`[LFP] ✓ Scraped ${matches.length} matches, ${articles.length} articles (source: lfp.dz/ar/calendar)`)
    return data
  } catch (err) {
    console.error('[LFP] Scraping error:', err.message)
    // Task 24: always return something
    const stale = SPORTS_CACHE_V2.getStale('lfp')
    return stale?.data || LFP_CACHE.data || { matches: [], articles: [], fetchedAt: null, source: 'lfp.dz' }
  }
}

// ===== ALGERIAN LEAGUE — RESILIENT MULTI-SOURCE CASCADE =====
// Primary  : lfp.dz (official site, scraped via fetchLFPData)
// Backup 1 : API-Football (RapidAPI), league=186 (Algeria Ligue 1)
// Backup 2 : SofaScore filtered to Algeria
// Backup 3 : Flashscore lightweight scrape
// Cache    : 10 min (matches the 5–10 min spec) via ALGERIAN_LEAGUE_CACHE
const ALGERIAN_LEAGUE_CACHE = { data: null, ts: 0 }
const ALGERIAN_LEAGUE_TTL = 10 * 60 * 1000

function _dedupAlgerianMatches(arr) {
  const seen = new Set()
  const out = []
  for (const m of arr || []) {
    if (!m?.home || !m?.away) continue
    const key = `${(m.home || '').trim().toLowerCase()}|${(m.away || '').trim().toLowerCase()}|${m.date || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(m)
  }
  return out
}

// jdwel.com backup for the Algerian league.
// jdwel.com renders Arabic match cards under the heading
//   "الدوري الجزائري الدرجة الأولى"
// which we can pull via the existing curl-based scraper.
async function fetchAlgerianLeagueJdwel() {
  try {
    const dateStr = new Date().toISOString().slice(0, 10)
    const j = await fetchJdwelMatches(dateStr)
    if (!j?.groups?.length) return null
    const ALG_NAME_HINTS = [
      'الدوري الجزائري',
      'الجزائر',
      'algerian',
      'ligue 1 algérie',
      'ligue 1 algerie',
      'ligue 1 algeria',
    ]
    const matches = []
    for (const g of j.groups) {
      const name = (g?.name || '').toLowerCase()
      if (!ALG_NAME_HINTS.some(k => name.includes(k.toLowerCase()))) continue
      for (const m of (g.matches || [])) {
        const finished = m.statusType === 'finished'
        matches.push({
          round: g.name || 'Ligue 1',
          home: m.homeTeam,
          away: m.awayTeam,
          homeScore: finished ? m.homeScore : null,
          awayScore: finished ? m.awayScore : null,
          played: finished,
          date: dateStr,
          time: m.startTime || '',
          link: m.link || 'https://jdwel.com/today/',
        })
      }
    }
    return matches.length ? { matches, source: 'jdwel.com' } : null
  } catch (err) {
    console.warn('[AlgerianLeague:jdwel] error:', err.message)
    return null
  }
}

async function fetchAlgerianLeagueAPIFootball() {
  const key = process.env.RAPIDAPI_KEY || process.env.API_FOOTBALL_KEY
  if (!key) return null
  try {
    const season = new Date().getFullYear()
    const headers = {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
    }
    // League 186 = Algeria Ligue 1 Professionnelle
    const r = await fetch(`https://api-football-v1.p.rapidapi.com/v3/fixtures?league=186&season=${season}`, {
      headers, signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) { console.warn('[AlgerianLeague:API-Football]', r.status); return null }
    const d = await r.json()
    const fixtures = d?.response || []
    const matches = fixtures.slice(0, 30).map(f => {
      const status = f.fixture?.status?.short || ''
      const played = ['FT', 'AET', 'PEN'].includes(status)
      const dt = f.fixture?.date ? new Date(f.fixture.date) : null
      return {
        id: f.fixture?.id,
        round: f.league?.round || 'Ligue 1',
        home: f.teams?.home?.name || '',
        away: f.teams?.away?.name || '',
        homeScore: played ? (f.goals?.home ?? null) : null,
        awayScore: played ? (f.goals?.away ?? null) : null,
        played,
        date: dt ? dt.toLocaleDateString('ar-DZ', { timeZone: 'Africa/Algiers' }) : '',
        time: dt ? dt.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
        link: f.fixture?.id ? `https://www.api-football.com/fixture/${f.fixture.id}` : '',
      }
    })
    return matches.length ? { matches, source: 'api-football' } : null
  } catch (err) {
    console.warn('[AlgerianLeague:API-Football] error:', err.message)
    return null
  }
}

async function fetchAlgerianLeagueSofaScore() {
  try {
    const today = new Date().toISOString().split('T')[0]
    const sf = await fetchSofaScoreFootball(today)
    if (!sf?.matches?.length) return null
    const dz = sf.matches.filter(m => {
      const c = (m.country || '').toLowerCase()
      const comp = (m.competition || '').toLowerCase()
      return c.includes('algeria') || c.includes('algérie') || c.includes('الجزائر') ||
             comp.includes('algeria') || comp.includes('ligue 1') && comp.includes('alger')
    })
    if (!dz.length) return null
    const matches = dz.map(m => ({
      round: m.competition || 'Ligue 1',
      home: m.homeTeam,
      away: m.awayTeam,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      played: m.statusType === 'finished',
      date: m.date || '',
      time: m.startTime || '',
      link: m.link || '',
    }))
    return { matches, source: 'sofascore' }
  } catch (err) {
    console.warn('[AlgerianLeague:SofaScore] error:', err.message)
    return null
  }
}

async function fetchAlgerianLeagueFlashscore() {
  try {
    const r = await fetch('https://www.flashscore.com/football/algeria/ligue-1/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!r.ok) return null
    const html = await r.text()
    // Best-effort scrape: extract team-name pairs from JSON-like blobs
    const re = /"home":\s*\{[^}]*"name":\s*"([^"]+)"[^}]*\}[^{]*"away":\s*\{[^}]*"name":\s*"([^"]+)"/g
    const matches = []
    let m
    while ((m = re.exec(html)) !== null && matches.length < 20) {
      matches.push({
        round: 'Ligue 1',
        home: m[1], away: m[2],
        homeScore: null, awayScore: null,
        played: false, date: '', time: '',
        link: 'https://www.flashscore.com/football/algeria/ligue-1/',
      })
    }
    return matches.length ? { matches, source: 'flashscore' } : null
  } catch (err) {
    console.warn('[AlgerianLeague:Flashscore] error:', err.message)
    return null
  }
}

async function fetchAlgerianLeague(opts = {}) {
  const { bypassCache = false } = opts
  // Serve fresh cache (5–10 min spec — using 10) unless caller forces a refresh
  if (!bypassCache && ALGERIAN_LEAGUE_CACHE.data && Date.now() - ALGERIAN_LEAGUE_CACHE.ts < ALGERIAN_LEAGUE_TTL) {
    return ALGERIAN_LEAGUE_CACHE.data
  }
  // When the user clicks "Retry", invalidate every downstream cache so we
  // actually re-hit lfp.dz / jdwel.com instead of returning the same stale
  // empty payload that just made them click retry.
  if (bypassCache) {
    LFP_CACHE.data = null; LFP_CACHE.ts = 0
    if (typeof SPORTS_CACHE_V2?.invalidate === 'function') SPORTS_CACHE_V2.invalidate('lfp')
    JDWEL_CACHE.data = null; JDWEL_CACHE.ts = 0; JDWEL_CACHE.date = null
  }
  const sources = []

  // Step 1: PRIMARY — lfp.dz scrape
  try {
    const lfp = await fetchLFPData()
    if (lfp?.matches?.length) {
      sources.push({ source: 'lfp.dz', matches: lfp.matches, articles: lfp.articles || [] })
    } else if (lfp?.articles?.length) {
      sources.push({ source: 'lfp.dz', matches: [], articles: lfp.articles })
    }
  } catch (err) { diagLog('source_fail', { module: 'algerian-league.lfp', error: err.message }) }

  // Step 2: BACKUP 1 — jdwel.com (Arabic match aggregator, scraped via curl)
  if (!sources.some(s => s.matches.length > 0)) {
    try {
      const jd = await fetchAlgerianLeagueJdwel()
      if (jd?.matches?.length) sources.push({ ...jd, articles: [] })
    } catch (err) { diagLog('source_fail', { module: 'algerian-league.jdwel', error: err.message }) }
  }

  // Step 3: BACKUP 2 — API-Football
  if (!sources.some(s => s.matches.length > 0)) {
    try {
      const api = await fetchAlgerianLeagueAPIFootball()
      if (api?.matches?.length) sources.push({ ...api, articles: [] })
    } catch (err) { diagLog('source_fail', { module: 'algerian-league.api-football', error: err.message }) }
  }

  // Step 3: BACKUP 2 — SofaScore filtered to Algeria
  if (!sources.some(s => s.matches.length > 0)) {
    try {
      const sf = await fetchAlgerianLeagueSofaScore()
      if (sf?.matches?.length) sources.push({ ...sf, articles: [] })
    } catch (err) { diagLog('source_fail', { module: 'algerian-league.sofascore', error: err.message }) }
  }

  // Step 4: BACKUP 3 — Flashscore
  if (!sources.some(s => s.matches.length > 0)) {
    try {
      const fs = await fetchAlgerianLeagueFlashscore()
      if (fs?.matches?.length) sources.push({ ...fs, articles: [] })
    } catch (err) { diagLog('source_fail', { module: 'algerian-league.flashscore', error: err.message }) }
  }

  // Merge: take first non-empty `matches` source as primary, accumulate articles
  const primary = sources.find(s => s.matches.length > 0) || sources[0] || null
  const allMatches = primary ? sanitizeAlgerianLeague(primary.matches || []) : []
  const dedupedMatches = _dedupAlgerianMatches(allMatches)
  const allArticles = sources.flatMap(s => s.articles || []).slice(0, 10)

  const data = {
    matches: dedupedMatches,
    articles: allArticles,
    fetchedAt: new Date().toISOString(),
    source: primary?.source || 'unavailable',
    sourcesAttempted: sources.map(s => s.source),
  }

  // Only cache non-empty success — preserves last-good payload on transient failure
  if (dedupedMatches.length > 0 || allArticles.length > 0) {
    ALGERIAN_LEAGUE_CACHE.data = data
    ALGERIAN_LEAGUE_CACHE.ts = Date.now()
  } else if (ALGERIAN_LEAGUE_CACHE.data) {
    // Anti-empty: serve stale rather than empty
    return { ...ALGERIAN_LEAGUE_CACHE.data, stale: true }
  }
  return data
}

app.get('/api/dz-agent/lfp', async (req, res) => {
  const bypassCache = req.query.bypassCache === '1' || req.query.refresh === '1'
  const data = await fetchAlgerianLeague({ bypassCache })
  // Anti-empty: never return a silently empty card.
  const noMatches  = !data?.matches  || data.matches.length === 0
  const noArticles = !data?.articles || data.articles.length === 0
  if (noMatches && noArticles) {
    diagLog('empty', { module: 'algerian-league', sources: data?.sourcesAttempted || [] })
    return res.json({
      ...data,
      matches: [],
      articles: [],
      status: 'unavailable',
      message: '⚠️ بيانات الدوري الجزائري غير متاحة حالياً — يُرجى المحاولة لاحقاً.',
    })
  }
  res.json({ ...data, status: 'ok' })
})

// ===== BALANCED NEWS ENDPOINT =====
// Algeria-priority news with category balancing for the news card and any
// downstream consumers (chat AI context, dashboard refresh, etc.).
const NEWS_BALANCED_CACHE = { data: null, ts: 0 }
const NEWS_BALANCED_TTL = 8 * 60 * 1000 // 8 min — within 5–15 min spec
app.get('/api/dz-agent/news', async (req, res) => {
  const limit = Math.max(5, Math.min(40, parseInt(req.query.limit, 10) || 18))
  const now = Date.now()
  if (NEWS_BALANCED_CACHE.data && now - NEWS_BALANCED_CACHE.ts < NEWS_BALANCED_TTL) {
    return res.json({ ...NEWS_BALANCED_CACHE.data, cached: true })
  }
  try {
    const [classicSettled, gnSettled] = await Promise.allSettled([
      fetchMultipleFeeds(NEWS_FEEDS_DASHBOARD),
      fetchGNRSSArticles(GN_RSS_FEEDS.ar),
    ])
    const classic = (classicSettled.status === 'fulfilled' ? classicSettled.value : [])
      .flatMap(f => (f?.items || []).map(item => ({ ...item, feedName: f.name })))
    if (classicSettled.status !== 'fulfilled') diagLog('source_fail', { module: 'news.classic', reason: classicSettled.reason?.message })
    const gn = (gnSettled.status === 'fulfilled' ? gnSettled.value : [])
      .map(item => ({ ...item, feedName: item.gnSource || 'Google News' }))
    if (gnSettled.status !== 'fulfilled') diagLog('source_fail', { module: 'news.gn-rss', reason: gnSettled.reason?.message })

    const merged = deduplicateGNArticles([...gn, ...classic])
    const fresh  = merged.filter(n => isFreshItem(n, { maxAgeDays: 30 }))
    if (fresh.length < merged.length) diagLog('outdated', { module: 'news.endpoint', dropped: merged.length - fresh.length })
    const deduped = dedupByTitleSimilarity(fresh, 0.7)
    const balanced = balanceNewsCategories(deduped, limit)

    const counts = balanced.reduce((acc, a) => { acc[a.category] = (acc[a.category] || 0) + 1; return acc }, {})
    const payload = {
      year: getCurrentYear(),
      generatedAt: new Date().toISOString(),
      total: balanced.length,
      counts,
      items: balanced,
    }

    if (balanced.length === 0) {
      diagLog('empty', { module: 'news.endpoint', upstream: merged.length })
      return res.json({
        ...payload,
        status: 'unavailable',
        message: '⚠️ تعذر جلب الأخبار حالياً، يُرجى المحاولة لاحقاً.',
      })
    }

    payload.status = 'ok'
    NEWS_BALANCED_CACHE.data = payload
    NEWS_BALANCED_CACHE.ts = now
    return res.json(payload)
  } catch (err) {
    diagLog('source_fail', { module: 'news.endpoint', reason: err.message })
    if (NEWS_BALANCED_CACHE.data) {
      return res.json({ ...NEWS_BALANCED_CACHE.data, cached: true, stale: true })
    }
    return res.json({
      year: getCurrentYear(),
      generatedAt: new Date().toISOString(),
      total: 0,
      items: [],
      status: 'unavailable',
      message: '⚠️ لا توجد بيانات أخبار حديثة الآن — يرجى المحاولة لاحقاً.',
    })
  }
})

// ===== INTERNAL DIAGNOSTICS ENDPOINT =====
// Exposes the in-memory diagnostic event ring (empty responses, outdated
// data, source failures). Read-only, no PII.
app.get('/api/dz-agent/diagnostics', (_req, res) => {
  const summary = DIAG_EVENTS.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc }, {})
  res.json({
    year: getCurrentYear(),
    today: getCurrentDateString(),
    totalEvents: DIAG_EVENTS.length,
    summary,
    recent: DIAG_EVENTS.slice(-50).reverse(),
  })
})

// ===== TASK 4 — ALGERIAN LEAGUE STANDINGS (kooora.com) =====
const STANDINGS_CACHE = { data: null, ts: 0 }
const STANDINGS_TTL = 30 * 60 * 1000 // 30 min

// ===== STANDINGS — DEDUP + NORMALIZE (Issue 2 fix) =====
// Many scraped table cells contain the team name twice (image alt + text
// label concatenated). Detect and collapse exact halves.
function dedupTeamName(raw) {
  const name = (raw || '').toString().replace(/\s+/g, ' ').trim()
  if (!name) return ''
  const len = name.length
  if (len % 2 === 0) {
    const half = name.slice(0, len / 2)
    if (name.slice(len / 2) === half) return half.trim()
  }
  // Also collapse "X X" repetition with separator
  const m = name.match(/^(.+?)\s+\1$/)
  if (m) return m[1].trim()
  return name
}
function normalizeTeamRow(team, index) {
  const name = dedupTeamName(team.team || team.name || '')
  const toNum = v => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : 0
  }
  return {
    rank: index + 1,
    team: name,
    played: toNum(team.played),
    wins: toNum(team.wins),
    draws: toNum(team.draws),
    losses: toNum(team.losses),
    points: toNum(team.points),
  }
}
function dedupStandings(rows) {
  if (!Array.isArray(rows)) return []
  const seen = new Set()
  const cleaned = []
  for (const r of rows) {
    // Normalize team name FIRST (collapse doubled labels), then dedup by it.
    const name = dedupTeamName(r.team || r.name || '')
    if (!name || name.length < 2) continue
    if (!isCleanTeamName(name)) continue // strip 360-style noise
    const key = name.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push({ ...r, team: name })
  }
  // re-rank after dedup so positions are contiguous (1..N)
  return cleaned.map((r, i) => normalizeTeamRow(r, i))
}

async function fetchAlgerianStandings() {
  if (STANDINGS_CACHE.data && Date.now() - STANDINGS_CACHE.ts < STANDINGS_TTL) {
    return STANDINGS_CACHE.data
  }
  const sources = [
    'https://www.kooora.com/?l=108',
    'https://www.kooora.com/كرة-القدم/دولة/الجزائر/جدول/alg',
  ]
  for (const url of sources) {
    try {
      // Task 11+17: Use resilientFetch with anti-block headers
      const r = await resilientFetch(url, { timeout: 14000, retries: 3 })
      if (!r.ok) continue
      const html = await r.text()
      const rows = []
      // Extract table rows — kooora uses <tr class="..."> with td cells
      const tableMatch = html.match(/<table[^>]*standings[^>]*>([\s\S]*?)<\/table>/i)
        || html.match(/<table[^>]*league-table[^>]*>([\s\S]*?)<\/table>/i)
        || html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
      if (tableMatch) {
        const tbody = tableMatch[1]
        const trs = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
        for (const tr of trs) {
          const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
            m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim()
          ).filter(Boolean)
          if (tds.length >= 7) {
            rows.push({
              rank: tds[0] || '',
              team: tds[1] || tds[2] || '',
              played: tds[2] || tds[3] || '',
              wins: tds[3] || tds[4] || '',
              draws: tds[4] || tds[5] || '',
              losses: tds[5] || tds[6] || '',
              points: tds[tds.length - 1] || '',
            })
          }
        }
      }
      // Fallback: extract any table-like data
      if (rows.length === 0) {
        const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
        let inTable = false
        for (const tr of trMatches) {
          const text = tr[1].replace(/<[^>]+>/g, '').trim()
          if (/الدوري|المركز|الفريق|نقطة|pts|pos/i.test(text)) { inTable = true; continue }
          if (!inTable) continue
          const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
            m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim()
          ).filter(Boolean)
          if (tds.length >= 5 && /^\d+$/.test(tds[0])) {
            rows.push({ rank: tds[0], team: tds[1] || '', played: tds[2] || '', wins: tds[3] || '', draws: tds[4] || '', losses: tds[5] || '', points: tds[tds.length - 1] || '' })
            if (rows.length >= 20) break
          }
        }
      }
      if (rows.length > 0) {
        // Issue 2 fix: dedupe + normalize before caching/returning
        const cleaned = dedupStandings(rows)
        if (cleaned.length === 0) continue
        const data = { standings: cleaned, source: 'kooora.com', fetchedAt: new Date().toISOString() }
        STANDINGS_CACHE.data = data
        STANDINGS_CACHE.ts = Date.now()
        console.log(`[Standings] Fetched ${rows.length} rows → ${cleaned.length} unique teams from kooora.com`)
        return data
      }
    } catch (err) {
      console.warn('[Standings] Error fetching from', url, ':', err.message)
    }
  }

  // Fallback: use LFP match data to infer a basic standings
  try {
    const lfp = await fetchLFPData()
    if (lfp?.matches?.length > 0) {
      const teams = {}
      for (const m of lfp.matches.filter(x => x.played)) {
        const home = m.home; const away = m.away
        if (!home || !away) continue
        if (!teams[home]) teams[home] = { team: home, played: 0, wins: 0, draws: 0, losses: 0, points: 0 }
        if (!teams[away]) teams[away] = { team: away, played: 0, wins: 0, draws: 0, losses: 0, points: 0 }
        const hS = Number(m.homeScore); const aS = Number(m.awayScore)
        if (isNaN(hS) || isNaN(aS)) continue
        teams[home].played++; teams[away].played++
        if (hS > aS) { teams[home].wins++; teams[home].points += 3; teams[away].losses++ }
        else if (hS < aS) { teams[away].wins++; teams[away].points += 3; teams[home].losses++ }
        else { teams[home].draws++; teams[home].points++; teams[away].draws++; teams[away].points++ }
      }
      const sorted = Object.values(teams).sort((a, b) => b.points - a.points || b.wins - a.wins)
      // Issue 2 fix: normalize + dedupe (defensive, in case duplicates slipped in)
      const standings = dedupStandings(sorted)
      const data = { standings, source: 'lfp.dz (calculated)', fetchedAt: new Date().toISOString() }
      STANDINGS_CACHE.data = data
      STANDINGS_CACHE.ts = Date.now()
      return data
    }
  } catch {}

  return STANDINGS_CACHE.data || { standings: [], source: 'unavailable', fetchedAt: new Date().toISOString() }
}

app.get('/api/dz-agent/standings', async (_req, res) => {
  try {
    const data = await fetchAlgerianStandings()
    res.json(data)
  } catch (err) {
    console.error('[Standings] Endpoint error:', err.message)
    res.json({ standings: [], source: 'error', fetchedAt: new Date().toISOString() })
  }
})

// ===== TASK 5 — GLOBAL LEAGUES CALENDAR (multi-source fallback) =====
// Issue 3 fix: persist last-success result so the card NEVER shows empty when
// all live sources are temporarily down.
const GLOBAL_LEAGUES_CACHE = { data: null, ts: 0 }
const GLOBAL_LEAGUES_TTL = 5 * 60 * 1000 // 5 min freshness window

// ===== JDWEL.COM SCRAPER (PRIMARY GLOBAL LEAGUES SOURCE) =====
// User-mandated source for the Global Leagues card. jdwel.com renders
// server-side HTML with stable CSS classes for matches & competitions,
// so we parse with regex rather than depending on a JS-rendered API.
const JDWEL_CACHE = { data: null, ts: 0, date: null }
const JDWEL_CACHE_TTL = 5 * 60 * 1000

function _decodeJdwelText(s) {
  return (s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Parser approach (because jdwel.com's <ul> closes early before the actual
// <li class="single_match"> rows):
//   1. Index every comp_separator header with its position + name + comp_id
//   2. Walk every <li id="match_NNN" class="single_match ..."> in order
//   3. Assign each match to the most recently preceding comp_separator
function parseJdwelHtml(html) {
  if (!html || typeof html !== 'string') return []
  const single = html.replace(/\s+/g, ' ')

  // Step 1: index headers
  // <ul ... data-comp_id="N"> ... <h4 class="title">NAME</h4> ... </ul>
  const headers = []
  const headerRe = /<ul[^>]*class="comp_matches_list[^"]*"[^>]*data-comp_id="(\d+)"[^>]*>([\s\S]*?)<\/ul>/g
  let h
  while ((h = headerRe.exec(single)) !== null) {
    const compId = h[1]
    const inner = h[2]
    const titleM = inner.match(/<h4[^>]*class="title"[^>]*>([^<]+)<\/h4>/)
    headers.push({
      pos: h.index,
      compId,
      name: titleM ? _decodeJdwelText(titleM[1]) : `بطولة #${compId}`,
    })
  }
  // Sort ascending by pos so we can find the closest preceding header
  headers.sort((a, b) => a.pos - b.pos)
  function competitionAt(pos) {
    let chosen = null
    for (const hd of headers) {
      if (hd.pos <= pos) chosen = hd
      else break
    }
    return chosen || { name: 'أخرى', compId: '0' }
  }

  // Step 2: find each match <li>
  const liRe = /<li[^>]*id="match_(\d+)"[^>]*class="single_match[^"]*"[^>]*data-keys="([^"]*)"[\s\S]*?<div[^>]*class="match_row[^"]*"[^>]*>([\s\S]*?)<div[^>]*class="match_tab/g
  const groupMap = new Map()
  let lim
  while ((lim = liRe.exec(single)) !== null) {
    const matchId = lim[1]
    const block = lim[3]
    // Extract teams from the row (more reliable than data-keys because
    // data-keys also embeds day/date/status tokens).
    const homeM = block.match(/team\s+hometeam[\s\S]*?<span[^>]*class="the_team"[^>]*>([^<]+)<\/span>/)
    const awayM = block.match(/team\s+awayteam[\s\S]*?<span[^>]*class="the_team"[^>]*>([^<]+)<\/span>/)
    if (!homeM && !awayM) continue
    const home = homeM ? _decodeJdwelText(homeM[1]) : ''
    const away = awayM ? _decodeJdwelText(awayM[1]) : ''
    const scoreH = block.match(/<span\s+class="hometeam">(\d+)<\/span>/)
    const scoreA = block.match(/<span\s+class="awayteam">(\d+)<\/span>/)
    const timeM = block.match(/<span\s+class="the_otime">([^<]+)<\/span>/)
    const statusFromKeys = (lim[2] || '').match(/(انتهت|لم تبدأ|جاري|live|ft)/i)
    const hScore = scoreH ? Number(scoreH[1]) : null
    const aScore = scoreA ? Number(scoreA[1]) : null
    const played = (hScore != null && aScore != null) && (statusFromKeys?.[1] === 'انتهت' || /finished|ft/i.test(statusFromKeys?.[1] || ''))
    const live = /(جاري|live)/i.test(statusFromKeys?.[1] || '')

    const comp = competitionAt(lim.index)
    const item = {
      matchId,
      homeTeam: home,
      awayTeam: away,
      homeScore: hScore,
      awayScore: aScore,
      score: (hScore != null && aScore != null) ? `${hScore} - ${aScore}` : null,
      startTime: timeM ? _decodeJdwelText(timeM[1]) : '',
      statusType: live ? 'live' : played ? 'finished' : 'scheduled',
      competition: comp.name,
      compId: comp.compId,
      link: `https://jdwel.com/match/?id=${matchId}`,
      source: 'jdwel.com',
    }
    if (!groupMap.has(comp.compId)) groupMap.set(comp.compId, { name: comp.name, compId: comp.compId, matches: [] })
    groupMap.get(comp.compId).matches.push(item)
  }
  return Array.from(groupMap.values())
}

// Parse jdwel.com matches from r.jina.ai markdown output. Jina renders the
// page server-side and emits a clean markdown view that preserves every
// match line. This parser is the Vercel-runtime path (curl is unavailable
// in serverless lambdas, and direct `fetch` is 403'd by jdwel's Cloudflare
// JA3 fingerprint check).
function parseJdwelMarkdown(text) {
  if (!text || typeof text !== 'string') return []
  const lines = text.split('\n')
  const groups = []
  let currentGroup = null
  let pendingMatch = null
  const compHeaderRe = /^####\s*\[([^\]]+)\]\(https?:\/\/jdwel\.com\/competition\/([^/?\s)]+)/
  // Match line shape (Arabic):
  //   *   STATUS  HOME![Image N: HOME](url)  H - A  YYYY-MM-DD HH:MM ![Image N+1: AWAY](url) AWAY
  // STATUS ∈ { "لم تبدأ", "انتهت", "جاري" }. Date/time is optional for finished games.
  const matchRe = /^\*\s+(لم تبدأ|انتهت|جاري)\s+(.+?)!\[[^\]]*\]\([^)]+\)\s+(\d+)\s*-\s*(\d+)\s*(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})?[^!]*!\[[^\]]*\]\([^)]+\)\s*(.+?)\s*$/
  const linkRe = /\[صفحة المباراة\]\((https?:\/\/[^\s)]+)\)/
  for (const line of lines) {
    const ch = line.match(compHeaderRe)
    if (ch) {
      currentGroup = { name: ch[1].trim(), compId: ch[2] || '', matches: [] }
      groups.push(currentGroup)
      pendingMatch = null
      continue
    }
    if (!currentGroup) continue
    const mm = line.match(matchRe)
    if (mm) {
      const status = mm[1]
      const finished = status === 'انتهت'
      const live     = status === 'جاري'
      pendingMatch = {
        matchId:    '',
        homeTeam:   mm[2].trim(),
        awayTeam:   mm[6].trim(),
        homeScore:  (finished || live) ? Number(mm[3]) : null,
        awayScore:  (finished || live) ? Number(mm[4]) : null,
        score:      (finished || live) ? `${mm[3]} - ${mm[4]}` : null,
        startTime:  (mm[5] || '').trim(),
        statusType: live ? 'live' : finished ? 'finished' : 'scheduled',
        competition: currentGroup.name,
        compId:      currentGroup.compId,
        link:        'https://jdwel.com/today/',
        source:      'jdwel.com',
      }
      currentGroup.matches.push(pendingMatch)
      continue
    }
    if (pendingMatch) {
      const lm = line.match(linkRe)
      if (lm) {
        pendingMatch.link = lm[1]
        const idMatch = lm[1].match(/id=(\d+)/)
        if (idMatch) pendingMatch.matchId = idMatch[1]
        pendingMatch = null
      }
    }
  }
  return groups.filter(g => g.matches.length > 0)
}

// jdwel.com is fronted by Cloudflare and rejects Node's `fetch` based on its
// TLS/JA3 fingerprint (returns 403 even with a full Chrome header set). The
// only reliable way from a server is to shell out to `curl`, which is present
// in Replit's Nix runtime and in AWS Lambda's Amazon Linux base image used by
// Vercel. We fall back to `fetch` if curl is missing.
async function _spawnCurl(url, timeoutSec = 15) {
  const { spawn } = await import('child_process')
  return new Promise((resolve) => {
    const args = [
      '-sSL',
      '--max-time', String(timeoutSec),
      '--compressed',
      '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: ar,en;q=0.8',
      url,
    ]
    let stdout = ''
    let stderr = ''
    let proc
    try {
      proc = spawn('curl', args)
    } catch (e) {
      return resolve({ ok: false, error: 'curl-spawn-failed: ' + e.message })
    }
    proc.stdout.on('data', d => { stdout += d.toString('utf8') })
    proc.stderr.on('data', d => { stderr += d.toString('utf8') })
    proc.on('error', e => resolve({ ok: false, error: e.message }))
    proc.on('close', code => {
      if (code === 0 && stdout.length > 0) resolve({ ok: true, body: stdout })
      else resolve({ ok: false, error: `exit=${code} stderr=${stderr.slice(0, 200)}` })
    })
  })
}

async function fetchJdwelMatches(dateStr = null) {
  const cacheDate = dateStr || new Date().toISOString().slice(0, 10)
  if (JDWEL_CACHE.data && JDWEL_CACHE.date === cacheDate && Date.now() - JDWEL_CACHE.ts < JDWEL_CACHE_TTL) {
    return JDWEL_CACHE.data
  }
  // jdwel.com today page loads matches for the current day in viewer's TZ
  const url = dateStr
    ? `https://jdwel.com/matches/?date=${dateStr}`
    : 'https://jdwel.com/today/'
  try {
    let html = null
    let groups = []
    // Primary: curl (bypasses Cloudflare JA3 block on Node fetch). Works in
    // Replit's Nix runtime. On Vercel, curl exists but jdwel's Cloudflare
    // returns a tiny challenge page (~5–10 KB) instead of the real content,
    // so we must detect that and fall through to the Jina reader-proxy.
    const curlRes = await _spawnCurl(url, 15)
    if (curlRes.ok && curlRes.body) {
      html = curlRes.body
      groups = parseJdwelHtml(html)
      if (groups.length === 0) {
        diagLog('jdwel.curl_empty', { url, bodyLen: html.length })
        html = null  // force Jina fallback
      }
    } else {
      diagLog('source_fail', { module: 'jdwel.curl', error: curlRes.error })
    }
    // Vercel-friendly fallback: r.jina.ai is a free reader-proxy that fetches
    // the page server-side and returns clean markdown, bypassing Cloudflare's
    // JA3-fingerprint block. Used when curl is missing OR when curl returns a
    // Cloudflare challenge page that fails the HTML parser.
    if (!html || groups.length === 0) {
      try {
        const proxied = `https://r.jina.ai/${url}`
        const pr = await fetch(proxied, {
          headers: {
            'User-Agent': 'DZ-GPT/1.0 (+https://dz-gpt.vercel.app)',
            'Accept': 'text/plain,*/*',
          },
          signal: AbortSignal.timeout(15000),
        })
        if (pr.ok) {
          const md = await pr.text()
          const mdGroups = parseJdwelMarkdown(md)
          if (mdGroups.length > 0) {
            const data = {
              groups: mdGroups,
              totalMatches: mdGroups.reduce((s, g) => s + g.matches.length, 0),
              fetchedAt: new Date().toISOString(),
              source: 'jdwel.com',
              sourceUrl: url,
              via: 'r.jina.ai',
            }
            JDWEL_CACHE.data = data
            JDWEL_CACHE.ts = Date.now()
            JDWEL_CACHE.date = cacheDate
            diagLog('jdwel_jina_ok', { url, groups: mdGroups.length, total: data.totalMatches })
            console.log(`[jdwel] ✓ (jina) Parsed ${data.totalMatches} matches across ${mdGroups.length} leagues`)
            return data
          }
          diagLog('empty', { module: 'jdwel.jina', url, mdSize: md.length })
        } else {
          diagLog('source_fail', { module: 'jdwel.jina', status: pr.status, url })
        }
      } catch (perr) {
        diagLog('source_fail', { module: 'jdwel.jina', error: perr.message })
      }
    }
    if (!html || groups.length === 0) {
      diagLog('empty', { module: 'jdwel', url, htmlSize: html ? html.length : 0 })
      return null
    }
    const data = {
      groups,
      totalMatches: groups.reduce((s, g) => s + g.matches.length, 0),
      fetchedAt: new Date().toISOString(),
      source: 'jdwel.com',
      sourceUrl: url,
    }
    JDWEL_CACHE.data = data
    JDWEL_CACHE.ts = Date.now()
    JDWEL_CACHE.date = cacheDate
    console.log(`[jdwel] ✓ Parsed ${data.totalMatches} matches across ${groups.length} leagues`)
    return data
  } catch (err) {
    diagLog('source_fail', { module: 'jdwel', error: err.message })
    return null
  }
}

function buildLeagueGroups(matches) {
  const leagueMap = {}
  for (const m of matches || []) {
    const league = m.competition || m.country || 'Other'
    if (!leagueMap[league]) leagueMap[league] = []
    leagueMap[league].push(m)
  }
  return Object.entries(leagueMap)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([name, matches]) => ({ name, matches: matches.slice(0, 6) }))
}

// ===== GLOBAL LEAGUES — TOP-5 EUROPEAN COMPETITIONS CASCADE =====
// Champions League (UCL), Premier League (EPL), La Liga, Serie A, Bundesliga.
// Primary  : API-Football (RapidAPI) when RAPIDAPI_KEY/API_FOOTBALL_KEY is set
// Backup   : SofaScore (filtered to those 5 competitions)
// Failsafe : last-good cache → never empty UI
const GLOBAL_LEAGUES_TARGETS = {
  // API-Football league IDs
  apiFootball: { 2: 'Champions League', 39: 'Premier League', 140: 'La Liga', 135: 'Serie A', 78: 'Bundesliga' },
  // SofaScore competition-name fragments (case-insensitive)
  sofaNameMatchers: [
    { key: 'Champions League', match: ['champions league', 'دوري أبطال أوروبا'] },
    { key: 'Premier League',   match: ['premier league', 'الدوري الإنجليزي'] },
    { key: 'La Liga',          match: ['laliga', 'la liga', 'الدوري الإسباني'] },
    { key: 'Serie A',          match: ['serie a', 'الدوري الإيطالي'] },
    { key: 'Bundesliga',       match: ['bundesliga', 'الدوري الألماني'] },
  ],
}

// jdwel.com PRIMARY for the Global-Leagues card.
// jdwel.com aggregates Arabic match cards across competitions and exposes
// each league under an Arabic <h4 class="title"> heading. We map a few
// well-known fragments to the five canonical European league names.
const JDWEL_LEAGUE_MATCHERS = [
  { key: 'Champions League', match: ['دوري أبطال أوروبا', 'champions league'] },
  { key: 'Premier League',   match: ['الدوري الإنجليزي الممتاز', 'الإنجليزي الممتاز', 'premier league'] },
  { key: 'La Liga',          match: ['الدوري الإسباني', 'la liga', 'laliga'] },
  { key: 'Serie A',          match: ['الدوري الإيطالي', 'serie a'] },
  { key: 'Bundesliga',       match: ['الدوري الألماني', 'bundesliga'] },
]
async function fetchGlobalLeaguesJdwel(dateStr) {
  try {
    const j = await fetchJdwelMatches(dateStr)
    if (!j?.groups?.length) return null
    const grouped = {}
    for (const g of j.groups) {
      const lname = (g?.name || '').toLowerCase()
      const matched = JDWEL_LEAGUE_MATCHERS.find(x => x.match.some(s => lname.includes(s.toLowerCase())))
      if (!matched) continue
      ;(grouped[matched.key] ??= []).push(...(g.matches || []).map(m => ({
        homeTeam:  m.homeTeam,
        awayTeam:  m.awayTeam,
        homeScore: (m.statusType === 'finished' || m.statusType === 'live') ? m.homeScore : null,
        awayScore: (m.statusType === 'finished' || m.statusType === 'live') ? m.awayScore : null,
        statusType: m.statusType === 'live' ? 'inprogress' : (m.statusType === 'finished' ? 'finished' : 'notstarted'),
        startTime: m.startTime || '',
        link:      m.link || 'https://jdwel.com/today/',
      })))
    }
    const leagues = Object.entries(grouped).map(([name, matches]) => ({ name, matches: matches.slice(0, 8) }))
    return leagues.length ? { leagues, source: 'jdwel.com' } : null
  } catch (err) {
    console.warn('[GlobalLeagues:jdwel] error:', err.message)
    return null
  }
}

async function fetchGlobalLeaguesAPIFootball(dateStr) {
  const key = process.env.RAPIDAPI_KEY || process.env.API_FOOTBALL_KEY
  if (!key) return null
  try {
    const headers = { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com' }
    const r = await fetch(`https://api-football-v1.p.rapidapi.com/v3/fixtures?date=${dateStr}`, {
      headers, signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) return null
    const d = await r.json()
    const fixtures = d?.response || []
    const wanted = GLOBAL_LEAGUES_TARGETS.apiFootball
    const grouped = {}
    for (const f of fixtures) {
      const lid = f.league?.id
      if (!wanted[lid]) continue
      const name = wanted[lid]
      const status = f.fixture?.status?.short || ''
      const finished = ['FT', 'AET', 'PEN'].includes(status)
      const live = ['1H', '2H', 'ET', 'HT', 'P', 'BT'].includes(status)
      const dt = f.fixture?.date ? new Date(f.fixture.date) : null
      ;(grouped[name] ??= []).push({
        homeTeam: f.teams?.home?.name || '',
        awayTeam: f.teams?.away?.name || '',
        homeScore: (finished || live) ? (f.goals?.home ?? null) : null,
        awayScore: (finished || live) ? (f.goals?.away ?? null) : null,
        statusType: finished ? 'finished' : live ? 'inprogress' : 'notstarted',
        startTime: dt ? dt.toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Algiers' }) : '',
        link: f.fixture?.id ? `https://www.api-football.com/fixture/${f.fixture.id}` : '',
      })
    }
    const leagues = Object.entries(grouped).map(([name, matches]) => ({ name, matches: matches.slice(0, 8) }))
    return leagues.length ? { leagues, source: 'api-football' } : null
  } catch (err) {
    console.warn('[GlobalLeagues:API-Football] error:', err.message)
    return null
  }
}

async function fetchGlobalLeaguesSofaScore(dateStr) {
  try {
    const sf = await fetchSofaScoreFootball(dateStr)
    if (!sf?.matches?.length) return null
    const grouped = {}
    for (const m of sf.matches) {
      const comp = (m.competition || '').toLowerCase()
      const matched = GLOBAL_LEAGUES_TARGETS.sofaNameMatchers.find(x => x.match.some(s => comp.includes(s)))
      if (!matched) continue
      ;(grouped[matched.key] ??= []).push({
        homeTeam: m.homeTeam, awayTeam: m.awayTeam,
        homeScore: m.homeScore, awayScore: m.awayScore,
        statusType: m.statusType || '',
        startTime: m.startTime || '',
        link: m.link || '',
      })
    }
    const leagues = Object.entries(grouped).map(([name, matches]) => ({ name, matches: matches.slice(0, 8) }))
    return leagues.length ? { leagues, source: 'sofascore' } : null
  } catch (err) {
    console.warn('[GlobalLeagues:SofaScore] error:', err.message)
    return null
  }
}

app.get('/api/dz-agent/global-leagues', async (req, res) => {
  const dateStr = req.query.date || new Date().toISOString().split('T')[0]
  const bypassCache = req.query.bypassCache === '1' || req.query.refresh === '1'

  // Serve fresh cache if still warm (unless caller forces a refresh)
  if (
    !bypassCache &&
    GLOBAL_LEAGUES_CACHE.data &&
    GLOBAL_LEAGUES_CACHE.data.date === dateStr &&
    Date.now() - GLOBAL_LEAGUES_CACHE.ts < GLOBAL_LEAGUES_TTL
  ) {
    return res.json(GLOBAL_LEAGUES_CACHE.data)
  }
  // When the user explicitly retries, also drop the jdwel sub-cache so the
  // primary source is actually re-scraped instead of returning the same
  // stale empty payload.
  if (bypassCache) {
    JDWEL_CACHE.data = null; JDWEL_CACHE.ts = 0; JDWEL_CACHE.date = null
  }

  try {
    // PRIMARY: jdwel.com (Arabic match aggregator, scraped via curl)
    let result = await fetchGlobalLeaguesJdwel(dateStr)

    // BACKUP 1: API-Football for Top-5 (only if RAPIDAPI key set)
    if (!result?.leagues?.length) {
      const apf = await fetchGlobalLeaguesAPIFootball(dateStr)
      if (apf?.leagues?.length) {
        result = apf
        diagLog('fallback', { module: 'global-leagues', from: 'jdwel', to: 'api-football' })
      }
    }

    // BACKUP 2: SofaScore filtered to Top-5
    if (!result?.leagues?.length) {
      const sof = await fetchGlobalLeaguesSofaScore(dateStr)
      if (sof?.leagues?.length) {
        result = sof
        diagLog('fallback', { module: 'global-leagues', from: 'jdwel|api-football', to: 'sofascore' })
      }
    }

    // FAILSAFE: last-good cache → never empty UI
    if (!result?.leagues?.length) {
      if (GLOBAL_LEAGUES_CACHE.data?.leagues?.length > 0) {
        return res.json({
          ...GLOBAL_LEAGUES_CACHE.data,
          source: `${GLOBAL_LEAGUES_CACHE.data.source || 'cache'} (stale)`,
          servedFromCacheAt: new Date().toISOString(),
        })
      }
      diagLog('empty', { module: 'global-leagues', date: dateStr })
      return res.json({
        leagues: [],
        date: dateStr,
        fetchedAt: new Date().toISOString(),
        source: 'unavailable',
        status: 'unavailable',
        message: '⚠️ بيانات الدوريات العالمية غير متاحة حالياً، حاول لاحقاً.',
      })
    }

    const payload = {
      leagues: result.leagues,
      date: dateStr,
      fetchedAt: new Date().toISOString(),
      source: result.source,
      status: 'ok',
      message: null,
    }

    // Only persist non-empty results so cache always holds the last GOOD payload
    GLOBAL_LEAGUES_CACHE.data = payload
    GLOBAL_LEAGUES_CACHE.ts = Date.now()
    return res.json(payload)
  } catch (err) {
    console.error('[GlobalLeagues] Error:', err.message)
    if (GLOBAL_LEAGUES_CACHE.data?.leagues?.length > 0) {
      return res.json({
        ...GLOBAL_LEAGUES_CACHE.data,
        source: `${GLOBAL_LEAGUES_CACHE.data.source || 'cache'} (stale)`,
        servedFromCacheAt: new Date().toISOString(),
      })
    }
    return res.json({
      leagues: [],
      date: dateStr,
      fetchedAt: new Date().toISOString(),
      source: 'error',
      status: 'unavailable',
      message: '⚠️ بيانات الدوريات العالمية غير متاحة حالياً، حاول لاحقاً.',
    })
  }
})

// ===== TASK 6 — RESOURCE INJECTION LAYER (weekly cron cache) =====
const RESOURCE_CACHE = { data: null, ts: 0 }
const RESOURCE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 days

const RESOURCE_SOURCES = [
  { category: 'github-trending', url: 'https://github.com/trending', label: 'GitHub Trending' },
  { category: 'public-apis', url: 'https://raw.githubusercontent.com/public-apis/public-apis/master/README.md', label: 'Public APIs' },
  { category: 'ai-tools', url: 'https://huggingface.co', label: 'HuggingFace' },
  { category: 'docs', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', label: 'MDN JavaScript' },
]

async function fetchAndCacheResources() {
  if (RESOURCE_CACHE.data && Date.now() - RESOURCE_CACHE.ts < RESOURCE_CACHE_TTL) {
    return RESOURCE_CACHE.data
  }
  const results = {}
  for (const src of RESOURCE_SOURCES) {
    try {
      const r = await fetch(src.url, {
        headers: { 'User-Agent': 'DZ-GPT-Agent/1.0', 'Accept': 'text/html,text/plain,*/*' },
        signal: AbortSignal.timeout(8000),
      })
      if (!r.ok) continue
      const text = await r.text()
      // Extract meaningful links and titles
      const links = [...text.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map(m => m[1]).slice(0, 20)
      const titles = [...text.matchAll(/<h[1-3][^>]*>([^<]{5,80})<\/h[1-3]>/gi)].map(m => m[1].trim()).slice(0, 10)
      results[src.category] = {
        label: src.label,
        url: src.url,
        links: [...new Set(links)].slice(0, 10),
        titles: [...new Set(titles)].slice(0, 8),
        fetchedAt: new Date().toISOString(),
      }
    } catch (err) {
      console.warn(`[Resources] Failed to fetch ${src.label}:`, err.message)
    }
  }
  RESOURCE_CACHE.data = results
  RESOURCE_CACHE.ts = Date.now()
  console.log(`[Resources] Injected ${Object.keys(results).length} resource categories`)
  return results
}

app.get('/api/dz-agent/resources', async (_req, res) => {
  try {
    const data = await fetchAndCacheResources()
    res.json({ resources: data, fetchedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[Resources] Endpoint error:', err.message)
    res.json({ resources: {}, fetchedAt: new Date().toISOString() })
  }
})

// ===== TASK 7 — GITHUB FILE CREATE/UPDATE (Octokit-compatible REST) =====
app.post('/api/dz-agent/github/create-file', async (req, res) => {
  const { repo, path: filePath, content, message, branch = 'main' } = req.body
  if (!repo || !filePath || !content || !message) {
    return res.status(400).json({ error: 'repo, path, content, message are required.' })
  }
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repo format.' })
  if (!isValidGithubPath(filePath)) return res.status(400).json({ error: 'Invalid file path.' })
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not configured.' })

  try {
    // Check if file exists (to get its SHA for update)
    let sha = undefined
    const checkRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`, {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0', Accept: 'application/vnd.github+json' },
    })
    if (checkRes.ok) {
      const existing = await checkRes.json()
      sha = existing.sha
    }

    const body = {
      message: sanitizeString(message, 500),
      content: Buffer.from(content).toString('base64'),
      branch,
    }
    if (sha) body.sha = sha

    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath)}`, {
      method: 'PUT',
      headers: { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0', 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    })
    const result = await putRes.json()
    if (!putRes.ok) {
      return res.status(putRes.status).json({ error: result.message || 'GitHub file write failed.' })
    }
    return res.json({
      success: true,
      action: sha ? 'updated' : 'created',
      path: filePath,
      repo,
      branch,
      sha: result.content?.sha,
      url: result.content?.html_url,
      commit: result.commit?.sha,
    })
  } catch (err) {
    console.error('[GitHub:create-file] Error:', err.message)
    return res.status(500).json({ error: `GitHub file operation failed: ${err.message}` })
  }
})

// ===== GITHUB AI: ANALYZE PROJECT (read key files → AI comprehensive analysis) =====
app.post('/api/dz-agent/github/analyze-project', async (req, res) => {
  const { repo, branch = 'main', token } = req.body
  if (!repo) return res.status(400).json({ error: 'repo required' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repo' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'No GitHub token configured' })

  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
  }

  // Key files to attempt reading (priority order)
  const KEY_FILES = [
    'package.json', 'README.md', 'README',
    'src/main.tsx', 'src/main.ts', 'src/main.js', 'src/index.tsx', 'src/index.ts', 'src/index.js',
    'index.js', 'index.ts', 'app.js', 'app.ts', 'server.js', 'server.ts',
    'tsconfig.json', 'vite.config.ts', 'vite.config.js', 'next.config.js', 'next.config.ts',
    'tailwind.config.js', 'tailwind.config.ts', 'webpack.config.js',
    '.env.example', 'docker-compose.yml', 'Dockerfile',
    'requirements.txt', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pom.xml',
    'composer.json', 'Gemfile',
  ]

  const readFile = async (path) => {
    try {
      const r = await fetch(
        `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
        { headers: ghHeaders, signal: AbortSignal.timeout(8000) }
      )
      if (!r.ok) return null
      const d = await r.json()
      if (!d.content || d.size > 60000) return null
      return Buffer.from(d.content.replace(/\n/g, ''), 'base64').toString('utf8').slice(0, 3000)
    } catch { return null }
  }

  // Parallel: fetch tree + meta + key files
  const [treeRes, metaRes, ...fileReads] = await Promise.allSettled([
    fetch(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { headers: ghHeaders, signal: AbortSignal.timeout(10000) }),
    fetch(`https://api.github.com/repos/${repo}`, { headers: ghHeaders, signal: AbortSignal.timeout(8000) }),
    ...KEY_FILES.map(f => readFile(f)),
  ])

  const treeData = treeRes.status === 'fulfilled' && treeRes.value.ok ? await treeRes.value.json().catch(() => ({})) : {}
  const meta = metaRes.status === 'fulfilled' && metaRes.value.ok ? await metaRes.value.json().catch(() => ({})) : {}
  const fileTree = (treeData.tree || []).filter(f => f.type === 'blob').map(f => f.path)

  const fileContents = {}
  KEY_FILES.forEach((f, i) => {
    const r = fileReads[i]
    if (r.status === 'fulfilled' && r.value) fileContents[f] = r.value
  })

  // Detect tech stack from file names + package.json
  let techStack = []
  let dependencies = {}
  try {
    if (fileContents['package.json']) {
      const pkg = JSON.parse(fileContents['package.json'])
      dependencies = { ...pkg.dependencies, ...pkg.devDependencies }
      const deps = Object.keys(dependencies)
      if (deps.includes('react')) techStack.push('React')
      if (deps.includes('vue')) techStack.push('Vue')
      if (deps.includes('next')) techStack.push('Next.js')
      if (deps.includes('vite') || deps.includes('@vitejs/plugin-react')) techStack.push('Vite')
      if (deps.includes('express')) techStack.push('Express.js')
      if (deps.includes('typescript') || deps.includes('tsx') || fileContents['tsconfig.json']) techStack.push('TypeScript')
      if (deps.includes('tailwindcss')) techStack.push('Tailwind CSS')
      if (deps.includes('prisma') || deps.includes('@prisma/client')) techStack.push('Prisma ORM')
      if (deps.includes('mongoose') || deps.includes('mongodb')) techStack.push('MongoDB')
      if (deps.includes('pg') || deps.includes('postgres')) techStack.push('PostgreSQL')
    }
  } catch {}
  if (fileContents['requirements.txt']) techStack.push('Python')
  if (fileContents['go.mod']) techStack.push('Go')
  if (fileContents['Cargo.toml']) techStack.push('Rust')
  if (fileContents['Gemfile']) techStack.push('Ruby')
  if (fileContents['pom.xml']) techStack.push('Java/Maven')
  if (meta.language && !techStack.includes(meta.language)) techStack.unshift(meta.language)

  const fileCtx = Object.entries(fileContents)
    .map(([p, c]) => `### 📄 ${p}\n\`\`\`\n${c}\n\`\`\``)
    .join('\n\n')

  const depsTop = Object.keys(dependencies).slice(0, 20).join(', ')

  const prompt = [
    {
      role: 'system',
      content: `أنت DZ Agent، مهندس برمجيات ومحلل خبير. تحلل مشاريع GitHub بعمق وتقدم تقارير احترافية شاملة. أجب دائماً بالعربية بتنسيق Markdown واضح ومنظم. ركّز على الجودة والدقة والاقتراحات القابلة للتنفيذ.`,
    },
    {
      role: 'user',
      content: `حلّل مشروع GitHub هذا وأعطني تقريراً شاملاً:

**المستودع:** \`${repo}\`
**اللغة الرئيسية:** ${meta.language || 'غير محددة'}
**النجوم:** ⭐ ${meta.stargazers_count || 0} | **Forks:** 🍴 ${meta.forks_count || 0}
**الوصف:** ${meta.description || 'لا يوجد وصف'}
**Stack المكتشف:** ${techStack.join(', ') || 'غير محدد'}
**التبعيات الرئيسية:** ${depsTop || 'لا يوجد package.json'}
**إجمالي الملفات:** ${fileTree.length} ملف

**هيكل المشروع (أول 60 ملف):**
\`\`\`
${fileTree.slice(0, 60).join('\n') || 'تعذّر جلب الهيكل'}
\`\`\`

**محتوى الملفات الرئيسية:**
${fileCtx || 'لم يتم قراءة أي ملف'}

أريد تقريراً يشمل هذه الأقسام بالترتيب:
## 🎯 نظرة عامة
## 🔧 Stack التقنية والمعمارية
## 📊 جودة الكود (درجة من 100 مع تبرير)
## ⚡ مقترحات تحسين فورية (5 إجراءات ذات أولوية عالية)
## 🎨 تحسينات الواجهة والتصميم (إذا كان مشروع ويب)
## 🔐 ملاحظات أمنية
## 📦 حالة التبعيات`,
    },
  ]

  try {
    const _analysisResult = await safeGenerateAI({ messages: prompt, max_tokens: 2500, taskHint: 'code' })
    const analysis = _analysisResult?.content || ''
    console.log(`[GitHub:analyze-project] ${repo} — ${fileTree.length} files, ${Object.keys(fileContents).length} read`)
    return res.json({
      success: true,
      analysis,
      meta: {
        repo,
        language: meta.language,
        stars: meta.stargazers_count,
        forks: meta.forks_count,
        fileCount: fileTree.length,
        techStack,
        readFiles: Object.keys(fileContents),
        topDependencies: Object.keys(dependencies).slice(0, 10),
      },
    })
  } catch (err) {
    console.error('[GitHub:analyze-project]', err.message)
    return res.status(500).json({ error: `Project analysis failed: ${err.message}` })
  }
})

// ===== GITHUB AI: GENERATE CODE AND PUSH (AI → GitHub Pages) =====
app.post('/api/dz-agent/github/generate-and-push', async (req, res) => {
  const { repo, description, branch: targetBranch, token, projectContext = '' } = req.body
  if (!repo || !description) return res.status(400).json({ error: 'repo and description are required' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repo format' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'No GitHub token configured' })

  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  // Read package.json and main entry for context
  let techContext = projectContext || ''
  if (!techContext) {
    try {
      const pkgRes = await fetch(`https://api.github.com/repos/${repo}/contents/package.json`, { headers: ghHeaders, signal: AbortSignal.timeout(8000) })
      if (pkgRes.ok) {
        const d = await pkgRes.json()
        const pkg = JSON.parse(Buffer.from(d.content.replace(/\n/g, ''), 'base64').toString('utf8'))
        const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).slice(0, 20).join(', ')
        techContext = `Stack: ${deps} | Framework: ${pkg.scripts?.dev?.includes('vite') ? 'Vite' : pkg.scripts?.dev?.includes('next') ? 'Next.js' : 'Node.js'}`
      }
    } catch {}
  }

  // Also try to read file structure for better context
  let fileTreeCtx = ''
  try {
    const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`, { headers: ghHeaders, signal: AbortSignal.timeout(8000) })
    if (treeRes.ok) {
      const td = await treeRes.json()
      fileTreeCtx = (td.tree || []).filter(f => f.type === 'blob').map(f => f.path).slice(0, 40).join('\n')
    }
  } catch {}

  // AI generates code using FILE: /path block format
  const genPrompt = [
    {
      role: 'system',
      content: `أنت DZ Agent، مهندس برمجيات خبير. تولّد كوداً احترافياً متكاملاً جاهزاً للإنتاج.

استخدم هذا التنسيق الصارم لكل ملف تريد إنشاءه أو تعديله:

FILE: /path/to/file.ext
\`\`\`lang
// الكود الكامل هنا
\`\`\`

يمكنك إنشاء عدة ملفات. اجعل الكود كاملاً وقابلاً للتشغيل. اتبع أسلوب المشروع القائم.`,
    },
    {
      role: 'user',
      content: `المستودع: ${repo}
${techContext ? `\n${techContext}` : ''}
${fileTreeCtx ? `\nهيكل المشروع الحالي:\n${fileTreeCtx}` : ''}

المطلوب: ${description}

أنشئ الكود الكامل اللازم بصيغة FILE: /path مع الكود الكامل لكل ملف.`,
    },
  ]

  let generated = ''
  try {
    const _genResult = await safeGenerateAI({ messages: genPrompt, max_tokens: 4000, taskHint: 'code' })
    generated = _genResult?.content || ''
    if (!generated) return res.status(500).json({ error: 'AI returned empty response' })
  } catch (err) {
    return res.status(500).json({ error: `AI generation failed: ${err.message}` })
  }

  // Parse FILE: /path\n```lang\n...\n``` blocks
  const fileBlocks = []
  const fileRegex = /FILE:\s*\/?([^\n`]+)\n```[\w-]*\n([\s\S]*?)```/g
  let match
  while ((match = fileRegex.exec(generated)) !== null) {
    const filePath = match[1].trim().replace(/^\/+/, '')
    const content = match[2].trim()
    if (filePath && content && filePath.length < 200) {
      fileBlocks.push({ path: filePath, content })
    }
  }

  if (!fileBlocks.length) {
    // No FILE: blocks — return generated code without pushing
    return res.json({
      success: true,
      generated,
      pushed: false,
      message: '🤖 الكود جاهز — لم يتم رصد ملفات للـ Push تلقائياً. اطلب نسخ الكود أو قم بإضافته يدوياً.',
    })
  }

  // Create new branch from default branch
  const newBranch = targetBranch || `dz-agent/${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`

  try {
    // Get default branch SHA (try main then master)
    let baseSha = null
    for (const base of ['main', 'master']) {
      try {
        const r = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${base}`, { headers: ghHeaders, signal: AbortSignal.timeout(8000) })
        if (r.ok) { const d = await r.json(); baseSha = d.object?.sha; break }
      } catch {}
    }
    if (!baseSha) throw new Error('لم يتم العثور على الفرع الرئيسي (main/master)')

    // Create new branch
    await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: baseSha }),
      signal: AbortSignal.timeout(10000),
    })

    // Push each file
    const pushedFiles = []
    const failedFiles = []
    for (const file of fileBlocks) {
      try {
        let existingSha
        const checkR = await fetch(
          `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(file.path)}?ref=${encodeURIComponent(newBranch)}`,
          { headers: ghHeaders, signal: AbortSignal.timeout(8000) }
        )
        if (checkR.ok) { const d = await checkR.json(); existingSha = d.sha }

        const body = {
          message: `✨ ${sanitizeString(description, 60)} [DZ Agent]`,
          content: Buffer.from(file.content).toString('base64'),
          branch: newBranch,
        }
        if (existingSha) body.sha = existingSha

        const putR = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(file.path)}`, {
          method: 'PUT',
          headers: ghHeaders,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        })
        if (putR.ok) pushedFiles.push(file.path)
        else { const e = await putR.json(); failedFiles.push(`${file.path}: ${e.message}`) }
      } catch (fe) {
        failedFiles.push(`${file.path}: ${fe.message}`)
      }
    }

    if (!pushedFiles.length) throw new Error(`فشل رفع الملفات: ${failedFiles.join(', ')}`)

    // Create PR
    const prBody = [
      `## ✨ ميزة جديدة بواسطة DZ Agent`,
      ``,
      `**الوصف:** ${description}`,
      ``,
      `**الملفات المُنشأة/المُعدَّلة (${pushedFiles.length}):**`,
      ...pushedFiles.map(f => `- \`${f}\``),
      ``,
      failedFiles.length ? `**⚠️ ملفات فشل رفعها:** ${failedFiles.join(', ')}` : '',
      ``,
      `---`,
      `🤖 Generated by [DZ-GPT](https://dz-gpt.vercel.app)`,
    ].filter(l => l !== undefined).join('\n')

    const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({
        title: `✨ ${sanitizeString(description, 72)} [DZ Agent]`,
        body: prBody,
        head: newBranch,
        base: 'main',
      }),
      signal: AbortSignal.timeout(15000),
    })
    const prData = await prRes.json()

    console.log(`[GitHub:generate-and-push] ${repo} → branch=${newBranch} files=${pushedFiles.length} pr=${!!prData.html_url}`)

    return res.json({
      success: true,
      generated,
      pushed: true,
      branch: newBranch,
      files: pushedFiles,
      failedFiles,
      pr: prData.html_url ? { url: prData.html_url, number: prData.number, title: prData.title } : null,
    })
  } catch (err) {
    console.error('[GitHub:generate-and-push]', err.message)
    return res.status(500).json({ error: `Push failed: ${err.message}`, generated, pushed: false })
  }
})

// ===== GITHUB AI: IMPROVE DESIGN/THEME (reads CSS → AI rewrites → pushes PR) =====
app.post('/api/dz-agent/github/improve-design', async (req, res) => {
  const { repo, token, style = 'modern dark', branch = 'main' } = req.body
  if (!repo) return res.status(400).json({ error: 'repo required' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repo' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'No GitHub token configured' })

  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  // Scan for CSS/SCSS and Tailwind config files
  let cssFiles = []
  try {
    const treeRes = await fetch(
      `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { headers: ghHeaders, signal: AbortSignal.timeout(10000) }
    )
    if (treeRes.ok) {
      const td = await treeRes.json()
      cssFiles = (td.tree || [])
        .filter(f => f.type === 'blob' && /\.(css|scss|sass|less)$/.test(f.path) && f.size < 40000)
        .sort((a, b) => b.size - a.size) // largest first (most important)
        .slice(0, 4)
        .map(f => f.path)
    }
  } catch {}

  if (!cssFiles.length) {
    return res.json({
      success: false,
      message: '⚠️ لم يتم العثور على ملفات CSS/SCSS في المستودع. هل الأنماط داخل ملفات TSX/JSX؟',
    })
  }

  // Read CSS files in parallel
  const reads = await Promise.allSettled(cssFiles.map(async (path) => {
    const r = await fetch(
      `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
      { headers: ghHeaders, signal: AbortSignal.timeout(8000) }
    )
    if (!r.ok) return null
    const d = await r.json()
    return {
      path,
      content: Buffer.from(d.content.replace(/\n/g, ''), 'base64').toString('utf8'),
      sha: d.sha,
    }
  }))

  const files = reads.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
  if (!files.length) return res.json({ success: false, message: 'تعذّر قراءة ملفات CSS.' })

  const cssCtx = files.map(f => `### 📄 ${f.path}\n\`\`\`css\n${f.content.slice(0, 2500)}\n\`\`\``).join('\n\n')

  const designPrompt = [
    {
      role: 'system',
      content: `أنت DZ Agent، مصمم UI/UX خبير متخصص في Tailwind CSS وCSS الحديث. تحسّن تصميمات المواقع لتكون احترافية وعصرية. أخرج الملفات بصيغة FILE: /path ثم الكود.`,
    },
    {
      role: 'user',
      content: `حسّن تصميم هذا الموقع بأسلوب "${style}". احتفظ بنفس هيكل الفئات (class names) لكن أضف تحسينات قوية:

- 🎨 نظام ألوان متناسق وعصري (تدرجات، متغيرات CSS)
- ✨ انتقالات وتأثيرات hover أنيقة
- 📝 خطوط أفضل ومسافات متناسقة
- 📱 استجابة محسّنة للجوال
- 🌑 دعم Dark/Light mode إذا أمكن
- 💫 تأثيرات دقيقة على البطاقات والأزرار
- 🔲 Box shadows وborder radius عصرية

${cssCtx}

أخرج كل ملف بصيغة:
FILE: /path/to/file.css
\`\`\`css
/* الكود المحسّن */
\`\`\``,
    },
  ]

  let improved = ''
  try {
    const _impResult = await safeGenerateAI({ messages: designPrompt, max_tokens: 4000, taskHint: 'code' })
    improved = _impResult?.content || ''
    if (!improved) return res.status(500).json({ error: 'AI returned empty response for design' })
  } catch (err) {
    return res.status(500).json({ error: `Design generation failed: ${err.message}` })
  }

  // Parse FILE: blocks and push
  const newBranch = `dz-design/${new Date().toISOString().slice(0, 10)}`
  const pushedFiles = []

  try {
    // Get base SHA
    let baseSha = null
    for (const base of ['main', 'master']) {
      try {
        const r = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${base}`, { headers: ghHeaders, signal: AbortSignal.timeout(8000) })
        if (r.ok) { const d = await r.json(); baseSha = d.object?.sha; break }
      } catch {}
    }
    if (!baseSha) throw new Error('Cannot find main/master branch')

    await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha: baseSha }),
      signal: AbortSignal.timeout(10000),
    })

    const fileRegex = /FILE:\s*\/?([^\n`]+)\n```[\w-]*\n([\s\S]*?)```/g
    let m
    while ((m = fileRegex.exec(improved)) !== null) {
      const filePath = m[1].trim().replace(/^\/+/, '')
      const content = m[2].trim()
      if (!filePath || !content) continue
      const existing = files.find(f => f.path === filePath || f.path.endsWith(filePath))
      const body = {
        message: `🎨 improve UI/UX theme — style: ${style} [DZ Agent]`,
        content: Buffer.from(content).toString('base64'),
        branch: newBranch,
      }
      if (existing?.sha) body.sha = existing.sha
      const r = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(filePath)}`, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) pushedFiles.push(filePath)
    }

    // Create PR
    const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({
        title: `🎨 تحسين واجهة UI — أسلوب "${style}" [DZ Agent]`,
        body: `## 🎨 تحسين التصميم بواسطة DZ Agent\n\n**الأسلوب المطبّق:** ${style}\n\n**الملفات المُحسّنة:**\n${pushedFiles.map(f => `- \`${f}\``).join('\n') || '(لم يتم رصد ملفات بالتنسيق المطلوب — راجع الكود المولَّد)'}\n\n---\n🤖 Generated by [DZ-GPT](https://dz-gpt.vercel.app)`,
        head: newBranch,
        base: 'main',
      }),
      signal: AbortSignal.timeout(15000),
    })
    const prData = prRes.ok ? await prRes.json() : {}

    console.log(`[GitHub:improve-design] ${repo} → branch=${newBranch} files=${pushedFiles.length}`)

    return res.json({
      success: true,
      improved,
      pushed: pushedFiles.length > 0,
      files: pushedFiles,
      branch: newBranch,
      pr: prData.html_url ? { url: prData.html_url, number: prData.number } : null,
    })
  } catch (err) {
    console.error('[GitHub:improve-design]', err.message)
    // Return the generated code even if push failed
    return res.json({ success: true, improved, pushed: false, error: err.message })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// GITHUB PAGES AUTONOMOUS DEPLOYMENT ENGINE
// Pipeline: AI Generate Site → Create Repo → Push Files → Enable Pages → URL
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /api/dz-agent/github/pages/deploy ─────────────────────────────────
// Full pipeline: generate website + create repo + push + enable GitHub Pages
app.post('/api/dz-agent/github/pages/deploy', async (req, res) => {
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط. أضفه في الأسرار.' })

  const { prompt = '', siteType = 'landing', repoName, description, htmlContent } = req.body
  if (!prompt && !htmlContent) return res.status(400).json({ error: 'prompt أو htmlContent مطلوب.' })

  const safeName = sanitizeRepoName(repoName || siteType + '-site')

  try {
    let finalHtml = htmlContent || ''

    // If no HTML provided, generate it via AI
    if (!finalHtml) {
      const meta = extractPagesRequestMeta(prompt)
      const PAGES_SYSTEM = `You are DZ Agent V4.0 — an elite AI Web Builder. Generate a visually stunning, ultra-modern, production-ready single-file HTML website that looks like it was designed by a top-tier Silicon Valley AI startup team in 2026.

ABSOLUTE RULES:
- Output ONE complete HTML file: <!DOCTYPE html> … </html>
- All CSS inside <style> block. All JS inside <script> block. Zero external CSS files.
- NEVER use old-fashioned layouts, Bootstrap-style designs, or outdated UI patterns
- ALWAYS use dark-mode-first premium aesthetics (Vercel / Linear / OpenAI quality)
- ALWAYS use gradient text on hero headline (background-clip:text technique)
- ALWAYS use Bento Grid layout for features section
- ALWAYS use glassmorphism for cards (backdrop-filter:blur + rgba)
- NEVER use Lorem ipsum — always real contextual content

MANDATORY CDNs:
- Tailwind CSS: <script src="https://cdn.tailwindcss.com"></script>
- Font Awesome 6: <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"/>
- Google Fonts: Inter + contextual pair via @import
- AOS: <link href="https://unpkg.com/aos@2.3.4/dist/aos.css" rel="stylesheet"> + <script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>

REQUIRED SECTIONS: sticky navbar → animated mesh-gradient hero (gradient text headline) → bento feature grid → stat counters + testimonials → how it works → CTA section → footer with dynamic year

MANDATORY JS: AOS.init({duration:700,once:true}) + IntersectionObserver scroll animations + navbar scroll blur + mobile hamburger + dynamic year: document.getElementById('cr-year').textContent=new Date().getFullYear()

SEO: <meta> description + og:title + og:description in <head>

Output ONLY the complete HTML — no markdown, no explanation`

      const wbMsgs = [
        { role: 'system', content: PAGES_SYSTEM },
        { role: 'user', content: `Create a professional ${meta.siteType} website. Description: ${prompt}\n[Site type: ${meta.siteType} | Repo: ${safeName}]` },
      ]
      const aiResult = await safeGenerateAI({ messages: wbMsgs, query: prompt, max_tokens: 8000 })
      finalHtml = extractHtmlFromResponse(aiResult.content || '') || aiResult.content || ''

      if (!finalHtml || finalHtml.length < 200) {
        return res.status(500).json({ error: 'فشل توليد محتوى الموقع. يرجى المحاولة مرة أخرى مع وصف أوضح.' })
      }
    }

    const result = await deployGitHubPages({
      token,
      prompt,
      siteType,
      repoName: safeName,
      description: description || prompt.slice(0, 150),
      htmlContent: finalHtml,
    })

    console.log(`[GH Pages] Deployed: ${result.repoUrl} → ${result.siteUrl}`)
    return res.json({ success: true, ...result })

  } catch (err) {
    console.error('[GH Pages:deploy]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/dz-agent/github/pages/update ─────────────────────────────────
// Update/redeploy a GitHub Pages repo — files optional (redeploy triggers Pages enable)
app.post('/api/dz-agent/github/pages/update', async (req, res) => {
  const tok = req.body.token
    ? sanitizeString(req.body.token, 300)
    : process.env.GITHUB_TOKEN || ''
  if (!tok) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const { owner, repo, files, commitMessage = 'Redeploy via DZ Agent 🤖' } = req.body
  if (!owner || !repo) return res.status(400).json({ error: 'owner و repo مطلوبان.' })
  if (!isValidGithubRepo(`${owner}/${repo}`)) return res.status(400).json({ error: 'Invalid repo format.' })

  try {
    let commitSha = null

    // If files provided, push them first after ensuring branch is ready
    if (files?.length) {
      // Wait for main branch (handles newly created repos)
      const { waitForMainBranch: waitBranch } = await import('./lib/github-pages/index.js')
      const branchInfo = await waitBranch(tok, owner, repo)
      const pushResult = await ghPagesBatchPush(tok, owner, repo, files, commitMessage, branchInfo.branch)
      commitSha = typeof pushResult === 'string' ? pushResult : pushResult?.sha || null
    }

    // Enable/re-enable GitHub Pages
    const pagesResult = await ghPagesEnable(tok, owner, repo)
    const pagesInfo = await getPagesStatus(tok, owner, repo)

    return res.json({
      success: true,
      commitSha,
      siteUrl: pagesInfo?.url || `https://${owner}.github.io/${repo}`,
      pagesStatus: pagesInfo?.status || pagesResult?.status || 'building',
      branch: pagesInfo?.branch || 'main',
    })
  } catch (err) {
    console.error('[GH Pages:update]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── GET /api/dz-agent/github/pages/status ──────────────────────────────────
// Check GitHub Pages deployment status for a repo
app.get('/api/dz-agent/github/pages/status', async (req, res) => {
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const { owner, repo } = req.query
  if (!owner || !repo) return res.status(400).json({ error: 'owner و repo مطلوبان.' })
  if (!isValidGithubRepo(`${owner}/${repo}`)) return res.status(400).json({ error: 'Invalid repo.' })

  try {
    const status = await getPagesStatus(token, owner, repo)
    if (!status) return res.status(404).json({ error: 'GitHub Pages غير مفعّل لهذا المستودع.' })
    return res.json({ success: true, ...status })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/dz-agent/github/react/enable-pages ───────────────────────────
// Called by GitHubReActPanel "Publish" button — enables Pages on a given repo
app.post('/api/dz-agent/github/react/enable-pages', async (req, res) => {
  const { repo } = req.body
  if (!repo || !isValidGithubRepo(repo)) return res.status(400).json({ error: 'repo مطلوب (owner/repo)' })
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط' })
  const [owner, repoName] = repo.split('/')
  try {
    const result = await ghPagesEnable(token, owner, repoName)
    const html_url = (result && result.html_url) || `https://${owner}.github.io/${repoName}/`
    return res.json({ success: true, html_url, status: result?.status || 'building' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ── GET /api/dz-agent/github/react/pages-status ────────────────────────────
// Polls GitHub Pages build status — called every 10s by the panel
app.get('/api/dz-agent/github/react/pages-status', async (req, res) => {
  const { repo } = req.query
  if (!repo || !isValidGithubRepo(repo)) return res.status(400).json({ error: 'repo مطلوب' })
  const token = process.env.GITHUB_TOKEN
  const [owner, repoName] = repo.split('/')
  try {
    const status = await getPagesStatus(token, owner, repoName)
    if (!status) return res.json({ enabled: false, status: 'not_enabled' })
    return res.json({ enabled: true, ...status })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/dz-agent/github/pages/stream-deploy ──────────────────────────
// SSE Streaming: Full autonomous deployment pipeline
// Plan → Generate files → Create repo → Upload → Enable Pages → Live URL
app.post('/api/dz-agent/github/pages/stream-deploy', async (req, res) => {
  const token = req.body.githubToken
    ? sanitizeString(req.body.githubToken, 300)
    : process.env.GITHUB_TOKEN || ''
  if (!token) {
    return res.status(401).json({ error: 'GitHub token مطلوب. أضف GITHUB_TOKEN أو سجّل دخولك.' })
  }

  const { prompt = '', repoName: rawRepoName } = req.body
  if (!prompt) return res.status(400).json({ error: 'prompt مطلوب' })

  // ── SSE setup ──────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (type, payload) => {
    try {
      res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`)
      res.flush?.()
    } catch (_) {}
  }

  const steps = []
  const onStep = (step) => {
    steps.push(step)
    send('step', { step })
    console.log(`[stream-deploy] ${step.label || step.message || step.step}`)
  }

  try {
    // ── 1. Analyze request ───────────────────────────────────────────────────
    send('start', { message: '🧠 تحليل الطلب...' })
    const analysis = plannerAnalyze(prompt)
    if (rawRepoName) analysis.repoName = sanitizeRepoName(rawRepoName)
    send('analysis', { analysis: { siteType: analysis.siteType, projectType: analysis.projectType, repoName: analysis.repoName } })

    // ── 2. Create deployment plan ────────────────────────────────────────────
    const plan = createDeployPlan(analysis)
    send('plan', { tasks: plan.map(t => ({ id: t.id, label: t.label, icon: t.icon })) })

    // ── 3. Auth ──────────────────────────────────────────────────────────────
    onStep({ step: 'auth', label: '🔑 التحقق من هوية GitHub...' })
    const user = await ghPagesGetUser(token)
    const owner = user.login
    onStep({ step: 'auth', label: `✅ مرحباً @${owner}`, done: true })
    send('owner', { owner })

    // ── 4. Generate project files via AI ─────────────────────────────────────
    onStep({ step: 'generate', label: `🧠 توليد ملفات ${analysis.siteType} (${analysis.projectType})...` })
    let projectFiles
    try {
      projectFiles = await buildProjectFiles(analysis, safeGenerateAI)
    } catch (genErr) {
      // Fallback: single-file HTML via WEB_BUILDER pipeline
      onStep({ step: 'generate', label: '⚠️ تبديل إلى توليد ملف HTML واحد...', done: false })
      const fb = await safeGenerateAI({
        messages: [
          { role: 'system', content: 'أنت مهندس ويب. أنتج موقع HTML/CSS/JS كامل في ملف واحد لـ GitHub Pages. لا lorem ipsum. تصميم احترافي responsive. Output ONLY the HTML.' },
          { role: 'user', content: `موقع ${analysis.siteType}: ${prompt}` },
        ],
        query: prompt, max_tokens: 8000,
      })
      const html = extractHtmlFromResponse(fb.content || '') || fb.content || ''
      if (!html || html.length < 200) throw new Error('فشل توليد HTML')
      projectFiles = [
        { path: 'index.html', content: html },
        { path: '.github/workflows/pages.yml', content: generatePagesWorkflow() },
      ]
    }
    onStep({ step: 'generate', label: `✅ تم توليد ${projectFiles.length} ملف`, done: true })
    send('files', { files: projectFiles.map(f => f.path), count: projectFiles.length })

    // ── 5. Create repository (auto_init=true) ─────────────────────────────────
    const repoName = sanitizeRepoName(analysis.repoName || `${analysis.siteType}-site`)
    onStep({ step: 'create_repo', label: `📦 إنشاء مستودع "${repoName}"...` })
    let repoReused = false
    try {
      await ghCreateRepo(token, repoName, analysis.description || `${analysis.siteType} — by DZ Agent 🇩🇿`, false)
      onStep({ step: 'create_repo', label: `✅ المستودع "${owner}/${repoName}" جاهز`, done: true })
    } catch (repoErr) {
      if (repoErr.message.includes('مسبقاً') || repoErr.message.includes('already exists') || repoErr.message.includes('422')) {
        repoReused = true
        onStep({ step: 'create_repo', label: `♻️ مستودع "${repoName}" موجود — سنستخدمه`, done: true })
      } else {
        throw repoErr
      }
    }
    send('repo', { owner, repo: repoName, repoUrl: `https://github.com/${owner}/${repoName}`, reused: repoReused })

    // ── 6. Wait for main branch then upload files ─────────────────────────────
    onStep({ step: 'wait_branch', label: '⏳ انتظار تهيئة الفرع الرئيسي...' })
    await new Promise(r => setTimeout(r, 3000))
    const { waitForMainBranch: waitBranchFn } = await import('./lib/github-pages/index.js')
    const branchInfo = await waitBranchFn(token, owner, repoName)
    onStep({ step: 'wait_branch', label: `✅ الفرع "${branchInfo.branch}" جاهز`, done: true })

    onStep({ step: 'upload', label: `⬆️ رفع ${projectFiles.length} ملف إلى GitHub...` })
    const pushResult = await ghPagesBatchPush(
      token, owner, repoName, projectFiles,
      `🚀 Deploy by DZ Agent 🇩🇿 — ${analysis.siteType}`, branchInfo.branch
    )
    const commitSha = typeof pushResult === 'string' ? pushResult : pushResult?.sha || ''
    onStep({ step: 'upload', label: `✅ تم رفع ${projectFiles.length} ملف (${commitSha.slice(0, 7)})`, done: true })
    send('upload', { commitSha, fileCount: projectFiles.length })

    // ── 7. Enable GitHub Pages ────────────────────────────────────────────────
    onStep({ step: 'pages', label: '🌐 تفعيل GitHub Pages...' })
    let pagesEnabled = false
    let pagesStatus = 'building'
    try {
      const pagesResult = await ghPagesEnable(token, owner, repoName)
      pagesEnabled = !!pagesResult
      pagesStatus = pagesResult?.status || 'building'
      onStep({ step: 'pages', label: '✅ GitHub Pages مُفعَّل — يتم البناء...', done: true })
    } catch (pErr) {
      onStep({ step: 'pages', label: `⚠️ Pages: ${pErr.message}`, done: true })
    }

    // ── 8. Final result ───────────────────────────────────────────────────────
    const siteUrl  = `https://${owner}.github.io/${repoName}`
    const repoUrl  = `https://github.com/${owner}/${repoName}`
    const htmlFile = projectFiles.find(f => f.path === 'index.html' || f.path === 'dist/index.html')

    send('done', {
      success: true,
      owner,
      repo: repoName,
      repoUrl,
      siteUrl,
      commitSha,
      pagesEnabled,
      pagesStatus,
      siteType: analysis.siteType,
      fileCount: projectFiles.length,
      htmlPreview: htmlFile?.content || '',
    })
    onStep({ step: 'done', label: `🎉 الموقع جاهز: ${siteUrl}`, done: true })
    res.end()

  } catch (err) {
    console.error('[stream-deploy] Error:', err.message)
    send('error', { error: err.message })
    res.end()
  }
})

// ── POST /api/dz-agent/github/pages/list-repos ─────────────────────────────
// List user's GitHub repos that have Pages enabled
app.post('/api/dz-agent/github/pages/list-repos', async (req, res) => {
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  try {
    const userRes = await fetch(`https://api.github.com/user/repos?per_page=100&sort=updated`, {
      headers: {
        Authorization: `token ${token}`,
        'User-Agent': 'DZ-GPT/1.0',
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!userRes.ok) throw new Error('فشل جلب قائمة المستودعات')
    const repos = await userRes.json()
    const pagesRepos = repos
      .filter(r => r.has_pages)
      .map(r => ({
        name: r.name,
        fullName: r.full_name,
        siteUrl: `https://${r.owner.login}.github.io/${r.name}`,
        repoUrl: r.html_url,
        updatedAt: r.updated_at,
        description: r.description,
      }))
    return res.json({ success: true, repos: pagesRepos, total: pagesRepos.length })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ===== GITHUB AI: DEPLOY & SYNC (push files to GitHub branch) =====
app.post('/api/dz-agent/github/deploy-sync', async (req, res) => {
  const { repo, files: filesToPush, commitMessage, branch: targetBranch = 'main', token } = req.body
  if (!repo || !filesToPush?.length) return res.status(400).json({ error: 'repo and files[] required' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repo' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'No GitHub token' })

  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  const results = { pushed: [], failed: [] }

  // Push files
  for (const file of filesToPush) {
    if (!file.path || !file.content) continue
    try {
      let sha
      const check = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(file.path)}?ref=${encodeURIComponent(targetBranch)}`, { headers: ghHeaders, signal: AbortSignal.timeout(8000) })
      if (check.ok) { const d = await check.json(); sha = d.sha }
      const body = { message: sanitizeString(commitMessage || `chore: deploy sync [DZ Agent]`, 200), content: Buffer.from(file.content).toString('base64'), branch: targetBranch }
      if (sha) body.sha = sha
      const r = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(file.path)}`, { method: 'PUT', headers: ghHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) })
      if (r.ok) results.pushed.push(file.path)
      else results.failed.push(file.path)
    } catch { results.failed.push(file.path) }
  }

  return res.json({ success: results.pushed.length > 0, ...results })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GITHUB AGENT — REAL DEVOPS ENGINEER ENDPOINTS
// Full execution pipeline: create repo → branch → files → commit → pages → URL
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /api/dz-agent/github/create-branch ────────────────────────────────
// Create a new branch from an existing one (defaults to main/master)
app.post('/api/dz-agent/github/create-branch', async (req, res) => {
  const { repo, branch, fromBranch = 'main', token } = req.body
  if (!repo || !branch) return res.status(400).json({ error: 'repo و branch مطلوبان.' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repo format.' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  try {
    // 1. Get SHA of source branch
    let sha = null
    const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`, {
      headers: ghHeaders, signal: AbortSignal.timeout(10000),
    })
    if (refRes.ok) {
      const refData = await refRes.json()
      sha = refData?.object?.sha
    } else {
      // Try master if main not found
      const masterRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/master`, {
        headers: ghHeaders, signal: AbortSignal.timeout(8000),
      })
      if (masterRes.ok) {
        const masterData = await masterRes.json()
        sha = masterData?.object?.sha
      }
    }

    // ── If no SHA found → repo might be empty: auto-init with README then retry ──
    if (!sha) {
      console.log(`[GH:create-branch] No branch SHA found — attempting to auto-init repo ${repo}`)
      try {
        const readmeContent = Buffer.from(`# ${repo.split('/')[1] || repo}\n\nتم إنشاؤه بواسطة DZ Agent 🇩🇿\n`).toString('base64')
        const initRes = await fetch(`https://api.github.com/repos/${repo}/contents/README.md`, {
          method: 'PUT', headers: ghHeaders, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ message: '📚 init: README — by DZ Agent 🤖', content: readmeContent, branch: 'main' }),
        })
        if (initRes.ok) {
          await new Promise(r => setTimeout(r, 2000))
          const retryRef = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/main`, {
            headers: ghHeaders, signal: AbortSignal.timeout(8000),
          })
          if (retryRef.ok) {
            const rd = await retryRef.json()
            sha = rd?.object?.sha
          }
        }
      } catch (initErr) {
        console.warn('[GH:create-branch] auto-init failed:', initErr.message)
      }
    }

    if (!sha) return res.status(404).json({ error: `الفرع "${fromBranch}" غير موجود في المستودع. تأكد أن المستودع يحتوي على commit واحد على الأقل.` })

    // 2. Create the new branch
    const createRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      signal: AbortSignal.timeout(15000),
    })
    const createData = await createRes.json()
    if (!createRes.ok) {
      if (createData.message?.includes('already exists') || createRes.status === 422) {
        return res.json({ success: true, branch, sha, message: `الفرع "${branch}" موجود مسبقاً.`, reused: true })
      }
      return res.status(createRes.status).json({ error: createData.message || 'فشل إنشاء الفرع.' })
    }

    console.log(`[GH:create-branch] Created branch "${branch}" in ${repo}`)
    return res.json({ success: true, branch, sha: createData?.object?.sha || sha, repo, fromBranch })
  } catch (err) {
    console.error('[GH:create-branch]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/dz-agent/github/create-repo-full ────────────────────────────
// Full pipeline: create repo + main branch + README + optional index.html + GitHub Pages
app.post('/api/dz-agent/github/create-repo-full', async (req, res) => {
  const { repoName, description = '', isWebsite = false, prompt = '', token, isPrivate = false } = req.body
  if (!repoName) return res.status(400).json({ error: 'repoName مطلوب.' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const safeName = sanitizeRepoName(repoName)
  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  const report = { steps: [], errors: [], repoName: safeName }

  try {
    // 1. Get authenticated user
    const userRes = await fetch('https://api.github.com/user', { headers: ghHeaders, signal: AbortSignal.timeout(8000) })
    if (!userRes.ok) return res.status(401).json({ error: 'GitHub Token غير صالح.' })
    const user = await userRes.json()
    const owner = user.login
    report.owner = owner

    // 2. Create repository
    report.steps.push('🧠 تحليل الطلب...')
    report.steps.push('🔐 التحقق من GitHub Token... ✅')

    let repoReused = false
    const createRepoRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({
        name: safeName,
        description: description || prompt.slice(0, 150) || `Created by DZ Agent 🇩🇿`,
        private: isPrivate,
        auto_init: true,
        default_branch: 'main',
      }),
      signal: AbortSignal.timeout(20000),
    })
    const repoData = await createRepoRes.json()
    if (!createRepoRes.ok) {
      if (createRepoRes.status === 422 || repoData.message?.includes('already exists')) {
        repoReused = true
        report.steps.push(`♻️ المستودع "${safeName}" موجود — سنستخدمه`)
      } else {
        return res.status(createRepoRes.status).json({ error: repoData.message || 'فشل إنشاء المستودع.' })
      }
    } else {
      report.steps.push(`📦 إنشاء المستودع "${safeName}"... ✅`)
    }

    await new Promise(r => setTimeout(r, 2500))

    // 3. Push README.md if not already initialized
    const readmeContent = `# ${safeName}\n\n${description || prompt || 'مشروع منشأ بواسطة DZ Agent 🇩🇿'}\n\n---\n*Built with DZ Agent — Made in Algeria 🇩🇿*\n`
    const readmeRes = await fetch(`https://api.github.com/repos/${owner}/${safeName}/contents/README.md`, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify({
        message: '📚 Add README — by DZ Agent 🤖',
        content: Buffer.from(readmeContent).toString('base64'),
        branch: 'main',
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (readmeRes.ok) {
      report.steps.push('✍️ إنشاء README.md... ✅')
    } else {
      const rdErr = await readmeRes.json()
      if (!rdErr.message?.includes('sha')) {
        report.errors.push('README: ' + (rdErr.message || 'خطأ غير معروف'))
      } else {
        report.steps.push('✍️ README.md موجود مسبقاً')
      }
    }

    // 4. Generate and push index.html if website requested
    let indexHtml = null
    if (isWebsite || /موقع|ويب|website|html|landing|page/i.test(prompt)) {
      report.steps.push('🤖 توليد index.html بالذكاء الاصطناعي...')
      try {
        const aiResult = await safeGenerateAI({
          messages: [
            { role: 'system', content: 'أنت مهندس ويب خبير. أنتج موقع HTML/CSS/JS كامل في ملف واحد لـ GitHub Pages. لا lorem ipsum. تصميم احترافي responsive. Output ONLY the HTML document.' },
            { role: 'user', content: `أنشئ موقع ويب احترافي: ${prompt || description || safeName}` },
          ],
          query: prompt, max_tokens: 8000,
        })
        indexHtml = extractHtmlFromResponse(aiResult.content || '') || aiResult.content || ''
      } catch (_) { indexHtml = null }

      if (!indexHtml || indexHtml.length < 100) {
        indexHtml = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0d1117;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}.card{background:#161b22;border:1px solid #30363d;border-radius:16px;padding:3rem;max-width:600px;width:100%}h1{font-size:2.5rem;margin-bottom:1rem;background:linear-gradient(135deg,#00d4aa,#00a3e0);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#8b949e;line-height:1.7;font-size:1.1rem}.badge{display:inline-block;margin-top:1.5rem;background:#21262d;border:1px solid #30363d;border-radius:20px;padding:.5rem 1.2rem;font-size:.9rem;color:#58a6ff}</style></head><body><div class="card"><h1>${safeName}</h1><p>${description || prompt || 'مشروع رائع منشأ بواسطة DZ Agent'}</p><span class="badge">🇩🇿 Made with DZ Agent</span></div></body></html>`
      }

      const htmlRes = await fetch(`https://api.github.com/repos/${owner}/${safeName}/contents/index.html`, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({
          message: '🚀 Add index.html — by DZ Agent 🤖',
          content: Buffer.from(indexHtml).toString('base64'),
          branch: 'main',
        }),
        signal: AbortSignal.timeout(20000),
      })
      if (htmlRes.ok) {
        report.steps.push('✍️ إنشاء index.html... ✅')
      } else {
        const htmlErr = await htmlRes.json()
        report.errors.push('index.html: ' + (htmlErr.message || 'خطأ'))
      }
    }

    // 5. Enable GitHub Pages
    report.steps.push('🌐 تفعيل GitHub Pages...')
    let pagesUrl = `https://${owner}.github.io/${safeName}`
    let pagesStatus = 'building'
    try {
      const pagesRes = await fetch(`https://api.github.com/repos/${owner}/${safeName}/pages`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
        signal: AbortSignal.timeout(15000),
      })
      const pagesData = await pagesRes.json()
      if (pagesRes.ok || pagesRes.status === 409) {
        pagesStatus = pagesData.status || 'building'
        pagesUrl = pagesData.html_url || pagesUrl
        report.steps.push('🚀 نشر GitHub Pages... ✅')
        report.steps.push('✅ العملية اكتملت بنجاح!')
      } else {
        report.errors.push('Pages: ' + (pagesData.message || 'خطأ في التفعيل'))
      }
    } catch (pErr) {
      report.errors.push('Pages: ' + pErr.message)
    }

    console.log(`[GH:create-repo-full] Done: ${owner}/${safeName} → ${pagesUrl}`)
    return res.json({
      success: true,
      owner,
      repo: safeName,
      repoUrl: `https://github.com/${owner}/${safeName}`,
      siteUrl: pagesUrl,
      pagesStatus,
      repoReused,
      hasWebsite: !!(isWebsite || indexHtml),
      steps: report.steps,
      errors: report.errors,
    })
  } catch (err) {
    console.error('[GH:create-repo-full]', err.message)
    return res.status(500).json({ error: err.message, steps: report.steps })
  }
})

// ── POST /api/dz-agent/github/exec ────────────────────────────────────────
// Natural language GitHub command executor — maps NL → real GitHub API operations
// Understands: create file, edit file, create branch, commit, deploy pages, fix error
app.post('/api/dz-agent/github/exec', async (req, res) => {
  const { command, repo, branch = 'main', context = {}, token } = req.body
  if (!command) return res.status(400).json({ error: 'command مطلوب.' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const cmd = normalizeQuery(command)
  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  // Classify the GitHub command
  const isCreateFile = /أنشئ|انشئ|اكتب|create|add|أضف/i.test(command) && /ملف|file|html|css|js|json|md/i.test(command)
  const isEditFile   = /عدل|حدث|عدّل|حدّث|edit|update|modify|غيّر/i.test(command)
  const isCreateBranch = /فرع|branch/i.test(command) && /أنشئ|انشئ|create|جديد/i.test(command)
  const isCommit     = /commit|إضافة|سجل|حفظ/i.test(command)
  const isDeploy     = /انشر|نشر|deploy|pages|github\.io/i.test(command)
  const isFixError   = /أصلح|صلح|fix|repair|debug|حل|خطأ|error/i.test(command)
  const isListFiles  = /اعرض|قائمة|list|show|files/i.test(command)

  try {
    // Route to appropriate operation
    if (isListFiles && repo) {
      const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
        headers: ghHeaders, signal: AbortSignal.timeout(10000),
      })
      if (!treeRes.ok) return res.status(404).json({ error: `لم يتم العثور على المستودع "${repo}" أو الفرع "${branch}".` })
      const treeData = await treeRes.json()
      const files = (treeData.tree || []).filter(f => f.type === 'blob').map(f => f.path)
      return res.json({ success: true, operation: 'list_files', files, count: files.length, repo, branch })
    }

    if (isCreateBranch && repo) {
      const newBranch = context.branchName || command.match(/(?:اسمه|named?|باسم)\s+["']?(\S+?)["']?(?:\s|$)/i)?.[1] || `dz-agent/${Date.now()}`
      const refRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, {
        headers: ghHeaders, signal: AbortSignal.timeout(8000),
      })
      if (!refRes.ok) return res.status(404).json({ error: `الفرع المصدر "${branch}" غير موجود.` })
      const { object: { sha } } = await refRes.json()
      const createRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
        method: 'POST', headers: ghHeaders,
        body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
        signal: AbortSignal.timeout(15000),
      })
      const createData = await createRes.json()
      if (!createRes.ok && !createData.message?.includes('already exists')) {
        return res.status(createRes.status).json({ error: createData.message })
      }
      return res.json({ success: true, operation: 'create_branch', branch: newBranch, sha, repo })
    }

    if (isDeploy && repo) {
      const [owner, repoName] = repo.split('/')
      const pagesRes = await fetch(`https://api.github.com/repos/${repo}/pages`, {
        method: 'POST', headers: ghHeaders,
        body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
        signal: AbortSignal.timeout(15000),
      })
      const pagesData = await pagesRes.json()
      const siteUrl = pagesData.html_url || `https://${owner}.github.io/${repoName}`
      return res.json({
        success: pagesRes.ok || pagesRes.status === 409,
        operation: 'enable_pages',
        siteUrl,
        status: pagesData.status || 'building',
        repo,
      })
    }

    // For create/edit/fix/commit — use AI to generate content then push
    if ((isCreateFile || isEditFile || isFixError || isCommit) && repo) {
      // Step 1: Identify target file
      const fileMatch = command.match(/["']([^"']+\.\w+)["']|(\S+\.\w{2,5})/i)
      const targetFile = context.filePath || fileMatch?.[1] || fileMatch?.[2] || 'index.html'

      // Step 2: Get current content if exists
      let currentContent = context.currentContent || ''
      let currentSha = null
      try {
        const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(targetFile)}?ref=${encodeURIComponent(branch)}`, {
          headers: ghHeaders, signal: AbortSignal.timeout(8000),
        })
        if (getRes.ok) {
          const getData = await getRes.json()
          currentContent = Buffer.from(getData.content, 'base64').toString('utf8')
          currentSha = getData.sha
        }
      } catch (_) {}

      // Step 3: AI generates new/fixed content
      const aiMessages = [
        {
          role: 'system',
          content: `أنت مهندس GitHub DevOps متخصص. نفّذ الأمر التالي على الملف المحدد.
قواعد:
- أخرج فقط محتوى الملف الجديد بدون شرح ولا markdown code blocks.
- إذا كان الملف HTML: أخرج HTML كاملاً فقط.
- إذا كان JS/CSS: أخرج الكود فقط.
- لا lorem ipsum — محتوى حقيقي احترافي.`,
        },
        {
          role: 'user',
          content: `المستودع: ${repo}\nالفرع: ${branch}\nالملف: ${targetFile}\nالأمر: ${command}${currentContent ? `\n\nالمحتوى الحالي:\n${currentContent.slice(0, 3000)}` : ''}`,
        },
      ]
      const aiResult = await safeGenerateAI({ messages: aiMessages, query: command, max_tokens: 8000 })
      let newContent = aiResult.content || ''

      // Extract HTML if applicable
      if (targetFile.endsWith('.html')) {
        newContent = extractHtmlFromResponse(newContent) || newContent
      }

      if (!newContent || newContent.length < 10) {
        return res.status(500).json({ error: 'فشل توليد محتوى الملف.' })
      }

      // Step 4: Push to GitHub
      const commitMsg = `${isFixError ? '🛠️ fix' : isEditFile ? '✏️ update' : '✨ create'}: ${targetFile} — by DZ Agent 🤖`
      const pushBody = {
        message: commitMsg,
        content: Buffer.from(newContent).toString('base64'),
        branch,
      }
      if (currentSha) pushBody.sha = currentSha

      const pushRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(targetFile)}`, {
        method: 'PUT', headers: ghHeaders,
        body: JSON.stringify(pushBody),
        signal: AbortSignal.timeout(20000),
      })
      const pushData = await pushRes.json()
      if (!pushRes.ok) return res.status(pushRes.status).json({ error: pushData.message || 'فشل Push.' })

      console.log(`[GH:exec] ${isFixError ? 'fixed' : isEditFile ? 'edited' : 'created'} ${targetFile} in ${repo}@${branch}`)
      return res.json({
        success: true,
        operation: isFixError ? 'fix_and_commit' : isEditFile ? 'edit_and_commit' : 'create_and_commit',
        file: targetFile,
        repo,
        branch,
        commitSha: pushData.commit?.sha,
        commitUrl: pushData.commit?.html_url,
        fileUrl: pushData.content?.html_url,
        action: currentSha ? 'updated' : 'created',
      })
    }

    // Fallback: use AI to interpret and respond
    const fallbackAI = await safeGenerateAI({
      messages: [
        { role: 'system', content: 'أنت GitHub DevOps engineer. حلّل الأمر وأخبر المستخدم ماذا تحتاج (repo, branch, file) لتنفيذه.' },
        { role: 'user', content: command },
      ],
      query: command, max_tokens: 500,
    })
    return res.json({ success: false, operation: 'clarification_needed', message: fallbackAI.content, command })
  } catch (err) {
    console.error('[GH:exec]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/dz-agent/github/init-empty-repo ──────────────────────────────
// Auto-initialize an empty repository: add README + index.html + first commit
app.post('/api/dz-agent/github/init-empty-repo', async (req, res) => {
  const { repo, description = '', isWebsite = true, token } = req.body
  if (!repo) return res.status(400).json({ error: 'repo مطلوب.' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repo format.' })
  const tok = sanitizeString(token || process.env.GITHUB_TOKEN || '', 300)
  if (!tok) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط.' })

  const ghHeaders = {
    Authorization: `token ${tok}`,
    'User-Agent': 'DZ-GPT/1.0',
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  const [owner, repoName] = repo.split('/')
  const results = { created: [], failed: [] }

  // Push README.md
  const readme = `# ${repoName}\n\n${description || 'مشروع منشأ بواسطة DZ Agent 🇩🇿'}\n\n---\n*Built with [DZ Agent](https://dz-gpt.vercel.app) — Made in Algeria 🇩🇿*\n`
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/contents/README.md`, {
      method: 'PUT', headers: ghHeaders,
      body: JSON.stringify({ message: '📚 Initial commit: README — by DZ Agent 🤖', content: Buffer.from(readme).toString('base64'), branch: 'main' }),
      signal: AbortSignal.timeout(15000),
    })
    if (r.ok) results.created.push('README.md')
    else results.failed.push('README.md')
  } catch { results.failed.push('README.md') }

  // Push index.html if website
  if (isWebsite) {
    const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${repoName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem}.card{background:#161b22;border:1px solid #30363d;border-radius:16px;padding:3rem;max-width:640px;width:100%;text-align:center}h1{font-size:2.5rem;font-weight:700;margin-bottom:1rem;background:linear-gradient(135deg,#00d4aa,#00a3e0);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#8b949e;line-height:1.7;font-size:1.1rem;margin-bottom:1.5rem}.badge{display:inline-flex;align-items:center;gap:.4rem;background:#21262d;border:1px solid #30363d;border-radius:20px;padding:.5rem 1.2rem;font-size:.9rem;color:#58a6ff;text-decoration:none}a.badge:hover{border-color:#58a6ff}</style></head><body><div class="card"><h1>${repoName}</h1><p>${description || 'مشروع رائع منشأ بواسطة DZ Agent 🤖'}</p><a class="badge" href="https://dz-gpt.vercel.app">🇩🇿 Powered by DZ Agent</a></div></body></html>`
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/contents/index.html`, {
        method: 'PUT', headers: ghHeaders,
        body: JSON.stringify({ message: '🚀 Initial commit: index.html — by DZ Agent 🤖', content: Buffer.from(html).toString('base64'), branch: 'main' }),
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) results.created.push('index.html')
      else results.failed.push('index.html')
    } catch { results.failed.push('index.html') }

    // Enable Pages
    try {
      await fetch(`https://api.github.com/repos/${repo}/pages`, {
        method: 'POST', headers: ghHeaders,
        body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
        signal: AbortSignal.timeout(15000),
      })
      results.pagesEnabled = true
    } catch { results.pagesEnabled = false }
  }

  console.log(`[GH:init-empty-repo] Initialized ${repo}: ${results.created.join(', ')}`)
  return res.json({
    success: results.created.length > 0,
    repo,
    ...results,
    repoUrl: `https://github.com/${repo}`,
    siteUrl: isWebsite ? `https://${owner}.github.io/${repoName}` : null,
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// GITHUB EXECUTION AGENT V2 — Real DevOps + Verification Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /api/dz-agent/github/verify-env ────────────────────────────────────
// Check: token validity, repo access, branch existence, Pages status, permissions
app.post('/api/dz-agent/github/verify-env', async (req, res) => {
  const { repo, branch = 'main', token } = req.body
  const tok = resolveGitHubToken(token)
  const report = { ok: false, checks: {}, errors: [] }

  // 1. Token check
  if (!tok) {
    report.errors.push('GITHUB_PERSONAL_ACCESS_TOKEN / GITHUB_TOKEN غير مضبوط في الأسرار')
    return res.status(401).json(report)
  }
  const hdr = ghHeaders(tok)

  // 2. Authenticate
  try {
    const userRes = await fetch('https://api.github.com/user', { headers: hdr, signal: AbortSignal.timeout(8000) })
    if (!userRes.ok) {
      report.errors.push('Token غير صالح أو منتهي الصلاحية')
      return res.status(401).json(report)
    }
    const user = await userRes.json()
    report.checks.auth = { ok: true, login: user.login, name: user.name, plan: user.plan?.name || 'free' }
  } catch (e) { report.errors.push('فشل التحقق من Token: ' + e.message); return res.status(500).json(report) }

  // 3. Repo access (if provided)
  if (repo && isValidGithubRepo(repo)) {
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers: hdr, signal: AbortSignal.timeout(8000) })
      if (repoRes.ok) {
        const rd = await repoRes.json()
        report.checks.repo = { ok: true, full_name: rd.full_name, private: rd.private, default_branch: rd.default_branch, has_pages: rd.has_pages }
      } else { report.checks.repo = { ok: false, error: `HTTP ${repoRes.status}` } }
    } catch (e) { report.checks.repo = { ok: false, error: e.message } }

    // 4. Branch check
    if (report.checks.repo?.ok) {
      try {
        const brRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: hdr, signal: AbortSignal.timeout(8000) })
        report.checks.branch = { ok: brRes.ok, branch, sha: brRes.ok ? (await brRes.json())?.object?.sha : null }
      } catch (e) { report.checks.branch = { ok: false, error: e.message } }

      // 5. Pages status
      try {
        const pgRes = await fetch(`https://api.github.com/repos/${repo}/pages`, { headers: hdr, signal: AbortSignal.timeout(8000) })
        if (pgRes.ok) {
          const pg = await pgRes.json()
          report.checks.pages = { ok: true, status: pg.status, url: pg.html_url, source_branch: pg.source?.branch }
        } else { report.checks.pages = { ok: false, status: 'not_enabled' } }
      } catch { report.checks.pages = { ok: false, status: 'unknown' } }
    }
  }

  // 6. Token permissions check
  try {
    const scopeRes = await fetch('https://api.github.com/rate_limit', { headers: hdr, signal: AbortSignal.timeout(5000) })
    const scopes = scopeRes.headers.get('x-oauth-scopes') || ''
    report.checks.permissions = {
      ok: true,
      scopes: scopes.split(',').map(s => s.trim()).filter(Boolean),
      has_repo: scopes.includes('repo') || scopes.includes('public_repo'),
      has_workflow: scopes.includes('workflow'),
      has_pages: scopes.includes('pages'),
      rate_limit: {
        remaining: parseInt(scopeRes.headers.get('x-ratelimit-remaining') || '0'),
        limit: parseInt(scopeRes.headers.get('x-ratelimit-limit') || '0'),
      },
    }
  } catch { report.checks.permissions = { ok: false } }

  report.ok = report.errors.length === 0
  console.log(`[GH:verify-env] ${report.checks.auth?.login || 'unknown'} — ${JSON.stringify(report.checks)}`)
  return res.json(report)
})

// ── POST /api/dz-agent/github/exec-pipeline ────────────────────────────────
// Full execution pipeline: NL command → plan → execute → verify → report
// Supports: create/edit/delete files, create repo, create branch, deploy Pages, commit
app.post('/api/dz-agent/github/exec-pipeline', async (req, res) => {
  const { command, repo, branch = 'main', files = [], commitMessage, token, deployPages = false } = req.body
  if (!command && files.length === 0) return res.status(400).json({ error: 'command أو files مطلوب' })

  const tok = resolveGitHubToken(token)
  if (!tok) return res.status(401).json({ error: 'GITHUB_PERSONAL_ACCESS_TOKEN / GITHUB_TOKEN غير مضبوط في Replit Secrets' })

  const hdr = ghHeaders(tok)
  const pipeline = { steps: [], errors: [], verifications: {}, ok: false }

  try {
    // STEP 1 — Auth + environment check
    pipeline.steps.push('🔐 التحقق من GitHub Token...')
    const userRes = await fetch('https://api.github.com/user', { headers: hdr, signal: AbortSignal.timeout(8000) })
    if (!userRes.ok) { pipeline.errors.push('Token غير صالح'); return res.status(401).json(pipeline) }
    const user = await userRes.json()
    const owner = repo ? repo.split('/')[0] : user.login
    pipeline.steps.push(`✅ مصادق كـ ${user.login}`)

    // STEP 2 — Repo access check (if provided)
    if (repo && isValidGithubRepo(repo)) {
      pipeline.steps.push(`🔍 فحص المستودع ${repo}...`)
      const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers: hdr, signal: AbortSignal.timeout(8000) })
      if (!repoRes.ok) { pipeline.errors.push(`المستودع "${repo}" غير موصول أو لا صلاحية عليه`); return res.status(404).json(pipeline) }
      pipeline.steps.push(`✅ المستودع ${repo} متاح`)

      // STEP 3 — Branch check / create
      const brRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: hdr, signal: AbortSignal.timeout(8000) })
      if (!brRes.ok) {
        pipeline.steps.push(`📌 إنشاء الفرع "${branch}"...`)
        // Try creating from main/master
        for (const src of ['main', 'master']) {
          const srcRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${src}`, { headers: hdr, signal: AbortSignal.timeout(6000) })
          if (srcRes.ok) {
            const { object: { sha } } = await srcRes.json()
            const newBrRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
              method: 'POST', headers: hdr,
              body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
              signal: AbortSignal.timeout(12000),
            })
            if (newBrRes.ok) { pipeline.steps.push(`✅ الفرع "${branch}" أُنشئ`); break }
          }
        }
      } else { pipeline.steps.push(`✅ الفرع "${branch}" موجود`) }
    }

    // STEP 4 — Execute file operations
    const pushedFiles = []
    for (const f of files) {
      if (!f.path || !f.content) continue
      pipeline.steps.push(`✍️ كتابة ${f.path}...`)

      // Get current SHA if file exists (needed for update)
      let sha = null
      try {
        const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(f.path)}?ref=${encodeURIComponent(branch)}`, { headers: hdr, signal: AbortSignal.timeout(6000) })
        if (getRes.ok) sha = (await getRes.json()).sha
      } catch {}

      const putBody = {
        message: f.commitMessage || commitMessage || `🤖 DZ Agent: update ${f.path}`,
        content: Buffer.from(f.content).toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      }

      let pushOk = false
      for (let attempt = 1; attempt <= 3; attempt++) {
        const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(f.path)}`, {
          method: 'PUT', headers: hdr, body: JSON.stringify(putBody),
          signal: AbortSignal.timeout(15000),
        })
        if (putRes.ok) {
          const putData = await putRes.json()
          pushedFiles.push({ path: f.path, sha: putData.content?.sha, commit: putData.commit?.sha })
          pipeline.steps.push(`✅ ${f.path} → commit ${putData.commit?.sha?.slice(0,7)}`)
          pushOk = true
          break
        } else {
          const err = await putRes.json()
          if (attempt === 3) pipeline.errors.push(`${f.path}: ${err.message}`)
          else await new Promise(r => setTimeout(r, 1000 * attempt))
        }
      }
      if (!pushOk) pipeline.steps.push(`❌ فشل رفع ${f.path}`)
    }

    // STEP 5 — GitHub Pages (optional)
    let pagesUrl = null
    if (deployPages && repo) {
      pipeline.steps.push('🌐 تفعيل GitHub Pages...')
      const [pgOwner, pgRepo] = repo.split('/')
      const pgRes = await fetch(`https://api.github.com/repos/${repo}/pages`, {
        method: 'POST', headers: hdr,
        body: JSON.stringify({ source: { branch, path: '/' } }),
        signal: AbortSignal.timeout(15000),
      })
      const pgData = await pgRes.json()
      pagesUrl = pgData.html_url || `https://${pgOwner}.github.io/${pgRepo}`
      pipeline.steps.push(pgRes.ok || pgRes.status === 409 ? `✅ GitHub Pages: ${pagesUrl}` : `⚠️ Pages: ${pgData.message}`)
    }

    // STEP 6 — VERIFICATION
    pipeline.steps.push('🔎 التحقق من نجاح العمليات...')
    if (repo && pushedFiles.length > 0) {
      for (const pf of pushedFiles.slice(0, 5)) {
        try {
          const vRes = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(pf.path)}?ref=${encodeURIComponent(branch)}`, { headers: hdr, signal: AbortSignal.timeout(8000) })
          pipeline.verifications[pf.path] = vRes.ok ? '✅ موجود' : '❌ لم يُعثر عليه'
        } catch { pipeline.verifications[pf.path] = '⚠️ فشل التحقق' }
      }
    }

    pipeline.ok = pipeline.errors.length === 0
    pipeline.steps.push(pipeline.ok ? '✅ العملية اكتملت بنجاح!' : `⚠️ اكتملت مع ${pipeline.errors.length} خطأ`)

    console.log(`[GH:exec-pipeline] ${user.login}/${repo} — ${pushedFiles.length} files — ok:${pipeline.ok}`)
    return res.json({
      ...pipeline,
      user: user.login,
      repo,
      branch,
      pushedFiles,
      pagesUrl,
      repoUrl: repo ? `https://github.com/${repo}` : null,
    })
  } catch (err) {
    pipeline.errors.push(err.message)
    console.error('[GH:exec-pipeline]', err.message)
    return res.status(500).json(pipeline)
  }
})

// ── GET /api/dz-agent/github/agent-status ──────────────────────────────────
// Quick status: token configured + authenticated user info + rate limit
app.get('/api/dz-agent/github/agent-status', async (_req, res) => {
  const tok = resolveGitHubToken()
  if (!tok) return res.json({ ok: false, error: 'لا يوجد GITHUB_PERSONAL_ACCESS_TOKEN أو GITHUB_TOKEN', configured: false })

  try {
    const hdr = ghHeaders(tok)
    const [userRes, rateRes] = await Promise.all([
      fetch('https://api.github.com/user', { headers: hdr, signal: AbortSignal.timeout(6000) }),
      fetch('https://api.github.com/rate_limit', { headers: hdr, signal: AbortSignal.timeout(6000) }),
    ])
    if (!userRes.ok) return res.json({ ok: false, error: 'Token غير صالح', configured: true })
    const user = await userRes.json()
    const rate = await rateRes.json()
    const scopes = rateRes.headers.get('x-oauth-scopes') || ''
    return res.json({
      ok: true,
      configured: true,
      login: user.login,
      name: user.name,
      avatar: user.avatar_url,
      tokenSource: process.env.GITHUB_PERSONAL_ACCESS_TOKEN ? 'GITHUB_PERSONAL_ACCESS_TOKEN' : 'GITHUB_TOKEN',
      scopes: scopes.split(',').map(s => s.trim()).filter(Boolean),
      rateLimit: rate.rate,
    })
  } catch (err) {
    return res.json({ ok: false, error: err.message, configured: true })
  }
})

// ===== TASK 9 — ENHANCED INTENT ENGINE (create/update/fix/optimize) =====
// Exposed as a utility endpoint for frontend intent mapping
app.post('/api/dz-agent/detect-intent', (req, res) => {
  const message = sanitizeString(req.body.message || '', 1000)
  if (!message) return res.status(400).json({ error: 'message required' })

  const lower = normalizeQuery(message)
  const intentMap = {
    create: ['انشئ', 'اصنع', 'اكتب', 'create', 'generate', 'write', 'make', 'أنشئ', 'créer', 'générer'],
    update: ['عدّل', 'حدّث', 'غيّر', 'update', 'modify', 'change', 'edit', 'modifier', 'changer'],
    fix: ['صلح', 'أصلح', 'fix', 'repair', 'debug', 'solve', 'corriger', 'résoudre', 'حل مشكلة'],
    optimize: ['حسّن', 'اسرّع', 'optimize', 'improve', 'refactor', 'speed up', 'optimiser', 'améliorer'],
    search: ['ابحث', 'search', 'find', 'cherche', 'أبحث', 'قارن', 'explain'],
    deploy: ['انشر', 'deploy', 'publish', 'launch', 'déployer', 'push'],
    read: ['اقرأ', 'اعرض', 'show', 'read', 'view', 'list', 'montrer', 'afficher'],
  }

  let detectedIntent = 'general'
  for (const [intent, patterns] of Object.entries(intentMap)) {
    if (patterns.some(p => lower.includes(p))) {
      detectedIntent = intent
      break
    }
  }

  // Dashboard card mapping (Task 1)
  const dashboardMap = {
    weather: ['الطقس', 'weather', 'température', 'حرارة', 'جو'],
    currency: ['صرف', 'دولار', 'يورو', 'currency', 'euro', 'dollar', 'dzd'],
    sports: ['مباراة', 'دوري', 'كرة', 'football', 'soccer', 'match', 'lfp'],
    standings: ['ترتيب', 'جدول', 'standings', 'classement', 'نقاط'],
    global: ['بريميرليغ', 'ليغا', 'champions', 'premier league', 'la liga', 'دوريات'],
  }

  let dashboardTarget = null
  for (const [card, patterns] of Object.entries(dashboardMap)) {
    if (patterns.some(p => lower.includes(p))) {
      dashboardTarget = card
      break
    }
  }

  return res.json({ intent: detectedIntent, dashboardTarget, message, normalized: lower })
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
  // Task 12: Delegate to the resilient multi-source cascade
  return fetchCurrencyResilient(forceRefresh)
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
  if (!data) {
    // Always return a structured response with empty rates rather than a 503 — keeps the dashboard alive.
    console.warn('[Currency] No data available — returning empty structured response')
    return res.status(200).json({
      base: 'DZD',
      provider: 'unavailable',
      rates: {},
      status: 'unavailable',
      error: 'تعذّر جلب أسعار الصرف من جميع المصادر مؤقتاً',
      last_update: new Date().toISOString(),
    })
  }
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

// ─── DZ Dollar / Parallel Market Exchange Rates ────────────────────────────
// Fetches official rates then applies Algeria parallel-market spread estimate.
// Falls back to static estimates when external sources are unavailable.
let _dollarCache = null
let _dollarCacheTs = 0
const DOLLAR_CACHE_TTL = 30 * 60 * 1000 // 30 min

async function fetchDollarRates() {
  const now = Date.now()
  if (_dollarCache && now - _dollarCacheTs < DOLLAR_CACHE_TTL) return _dollarCache

  // Try to get official DZD rates then apply parallel market spread
  let officialUsd = 0, officialEur = 0, officialGbp = 0
  try {
    const officialData = await fetchCurrencyData()
    if (officialData?.rates) {
      officialUsd = officialData.rates['USD'] || 0
      officialEur = officialData.rates['EUR'] || 0
      officialGbp = officialData.rates['GBP'] || 0
    }
  } catch { /* ignore */ }

  // Parallel market spread (black market is typically 15-25% above official in Algeria)
  // This is an educational estimate — actual rates fluctuate daily
  const spread = 1.22 // ~22% spread (representative 2025 estimate)
  const toParallel = (official) => official > 0 ? Math.round(1 / official * spread * 10) / 10 : null

  let usd = toParallel(officialUsd) || 248
  let eur = toParallel(officialEur) || 268
  let gbp = toParallel(officialGbp) || 312

  // Try to get a live estimate from an API that exposes DZD parallel rates
  try {
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=dzd', { signal: ctrl.signal })
    if (r.ok) {
      const j = await r.json()
      const usdtDzd = j?.tether?.dzd
      if (usdtDzd && usdtDzd > 100 && usdtDzd < 1000) {
        usd = Math.round(usdtDzd * 10) / 10
        eur = Math.round(usdtDzd * 1.08 * 10) / 10
        gbp = Math.round(usdtDzd * 1.26 * 10) / 10
      }
    }
  } catch { /* use calculated estimates */ }

  const trend = usd > 245 ? '📈 الدولار في ارتفاع مقارنة بالمستوى العادي' : '📉 الدولار مستقر أو في انخفاض'

  _dollarCache = {
    usd, eur, gbp, trend,
    source: 'تقدير حسابي + بيانات رسمية',
    updatedAt: new Date().toISOString(),
    disclaimer: 'الأسعار تقديرية للإعلام فقط. الرجوع للبنك الرسمي للمعاملات القانونية.',
  }
  _dollarCacheTs = now
  return _dollarCache
}

app.get('/api/dz-dollar', async (_req, res) => {
  try {
    const data = await fetchDollarRates()
    res.json(data)
  } catch (err) {
    console.error('[dz-dollar] error:', err)
    res.json({
      usd: 248, eur: 268, gbp: 312,
      trend: '📊 بيانات تقديرية',
      source: 'تقدير ثابت',
      updatedAt: new Date().toISOString(),
      disclaimer: 'الأسعار تقديرية.',
    })
  }
})

// ─── Telegram Bot Webhook ────────────────────────────────────────────────────
// Set your bot webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://dz-gpt.vercel.app/api/telegram/webhook
app.post('/api/telegram/webhook', async (req, res) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  if (!BOT_TOKEN) return res.json({ ok: false, error: 'TELEGRAM_BOT_TOKEN not set' })

  try {
    const update = req.body
    const message = update?.message || update?.edited_message
    if (!message?.text) return res.json({ ok: true })

    const chatId = message.chat.id
    const text = message.text.trim()
    const username = message.from?.username || message.from?.first_name || 'مستخدم'

    // Handle /start command
    if (text === '/start') {
      const welcome = `🇩🇿 أهلاً بك في **DZ Agent** على تيليغرام!

أنا مساعدك الذكي الجزائري. أستطيع مساعدتك في:
• الأسئلة العامة والمعلومات
• الدارجة الجزائرية 🗣️
• أسعار الصرف والدولار 💵
• الرياضة والأخبار ⚽📰
• الوظائف والصحة 💼🏥
• وأكثر بكثير!

اكتب سؤالك مباشرة أو زر موقعنا: https://dz-gpt.vercel.app`
      await sendTelegramMessage(BOT_TOKEN, chatId, welcome)
      return res.json({ ok: true })
    }

    // Route to DZ Agent AI
    const aiRes = await fetch(`http://localhost:${process.env.PORT || 5000}/api/dz-agent-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: `[تيليغرام — ${username}]: ${text}` }],
        source: 'telegram',
      }),
    })
    const aiData = await aiRes.json()
    const reply = aiData?.content || '⚠️ عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.'

    // Telegram message limit is 4096 chars
    const trimmed = reply.slice(0, 4090)
    await sendTelegramMessage(BOT_TOKEN, chatId, trimmed)
    return res.json({ ok: true })
  } catch (err) {
    console.error('[telegram/webhook] error:', err)
    res.status(200).json({ ok: true }) // Always return 200 to Telegram
  }
})

async function sendTelegramMessage(token, chatId, text) {
  try {
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 10000)
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    })
  } catch (err) {
    console.error('[telegram/send] error:', err)
  }
}

// ─── Telegram Bot Setup Helper ──────────────────────────────────────────────
app.post('/api/telegram/setup', async (req, res) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  if (!BOT_TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN not set in environment secrets.' })
  const webhookUrl = req.body?.webhookUrl || `https://dz-gpt.vercel.app/api/telegram/webhook`
  try {
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 10000)
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({ url: webhookUrl }),
    })
    const data = await r.json()
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: String(err.message) })
  }
})

// ===== SYNC ENDPOINT (commit + push to GitHub from Replit) =====
app.get('/api/dz-agent/sync/status', async (_req, res) => {
  try {
    await runGit(['--version'])
    const { stdout: branchOut } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ({ stdout: '' }))
    const branch = branchOut.trim()
    const { stdout: statusOut } = await runGit(['status', '--porcelain']).catch(() => ({ stdout: '' }))
    const changedFiles = statusOut.trim() ? statusOut.trim().split('\n').length : 0

    // Also check unpushed commits if we have a token & branch
    let unpushedCommits = 0
    let localSha = null
    let remoteSha = null
    if (branch && process.env.GITHUB_TOKEN) {
      try {
        const remoteUrl = `https://github.com/${VERCEL_GITHUB_REPO}.git`
        const authHeader = `AUTHORIZATION: Basic ${Buffer.from(`x-access-token:${process.env.GITHUB_TOKEN}`).toString('base64')}`
        const { stdout: localOut } = await runGit(['rev-parse', 'HEAD'])
        localSha = localOut.trim()
        const { stdout: lsOut } = await runGit(
          ['-c', `http.extraHeader=${authHeader}`, 'ls-remote', remoteUrl, `refs/heads/${branch}`],
          { timeout: 15000 }
        )
        const m = lsOut.trim().match(/^([0-9a-f]{40})\s/)
        remoteSha = m ? m[1] : null
        if (remoteSha && localSha && remoteSha !== localSha) {
          // Count commits in local that aren't on remote (best-effort; depends on shallow clone state)
          try {
            const { stdout: cntOut } = await runGit(['rev-list', '--count', `${remoteSha}..HEAD`])
            unpushedCommits = parseInt(cntOut.trim(), 10) || 0
          } catch { unpushedCommits = 1 }
        }
      } catch { /* ignore */ }
    }

    return res.json({
      available: true,
      hasGithubToken: !!process.env.GITHUB_TOKEN,
      hasVercelToken: !!process.env.VERCEL_TOKEN,
      hasDeployAdminToken: !!process.env.DEPLOY_ADMIN_TOKEN,
      deployReady: !!(process.env.GITHUB_TOKEN && process.env.VERCEL_TOKEN && process.env.DEPLOY_ADMIN_TOKEN),
      branch: branch || null,
      changedFiles,
      unpushedCommits,
      pendingTotal: changedFiles + unpushedCommits,
      localSha,
      remoteSha,
      runtime: process.env.VERCEL ? 'vercel' : 'replit',
    })
  } catch {
    return res.json({
      available: false,
      hasGithubToken: !!process.env.GITHUB_TOKEN,
      hasVercelToken: !!process.env.VERCEL_TOKEN,
      hasDeployAdminToken: !!process.env.DEPLOY_ADMIN_TOKEN,
      deployReady: !!(process.env.GITHUB_TOKEN && process.env.VERCEL_TOKEN && process.env.DEPLOY_ADMIN_TOKEN),
      runtime: process.env.VERCEL ? 'vercel' : 'unknown',
    })
  }
})

app.post('/api/dz-agent/sync', async (req, res) => {
  if (!hasDeployAuthorization(req)) {
    return res.status(403).json({ error: 'Sync endpoint is restricted.' })
  }
  const githubToken = process.env.GITHUB_TOKEN
  if (!githubToken) {
    return res.status(500).json({ error: 'GITHUB_TOKEN not configured on server.' })
  }

  const rawMessage = sanitizeString(req.body?.message || '', 200).trim()
  const safeMessage = rawMessage && /[^\s]/.test(rawMessage)
    ? rawMessage
    : `chore: sync from Replit at ${new Date().toISOString()}`

  try {
    // Verify git is available and we're in a repo
    await runGit(['rev-parse', '--git-dir'])

    // Determine current branch
    const { stdout: branchOut } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'])
    const branch = branchOut.trim()
    if (!branch || branch === 'HEAD') {
      return res.status(400).json({ error: 'Detached HEAD — please checkout a branch first.' })
    }

    // Use GIT_* env vars for identity to avoid needing git config write access
    const GIT_IDENTITY_ENV = {
      GIT_AUTHOR_NAME: 'DZ Agent (Replit)',
      GIT_AUTHOR_EMAIL: 'dz-agent@replit.local',
      GIT_COMMITTER_NAME: 'DZ Agent (Replit)',
      GIT_COMMITTER_EMAIL: 'dz-agent@replit.local',
    }

    // Stage + commit only if there are working-tree changes
    const { stdout: statusOut } = await runGit(['status', '--porcelain'])
    let didCommit = false
    if (statusOut.trim()) {
      await runGit(['add', '-A'])
      try {
        await runGit(['commit', '-m', safeMessage], { env: GIT_IDENTITY_ENV })
        didCommit = true
      } catch (commitErr) {
        const text = String(commitErr?.stderr || commitErr?.stdout || commitErr?.message || '')
        if (!/nothing to commit/i.test(text)) throw commitErr
      }
    }

    // Determine if local is ahead of remote (so we know whether push has anything to do)
    const remoteUrl = `https://github.com/${VERCEL_GITHUB_REPO}.git`
    const authHeader = `AUTHORIZATION: Basic ${Buffer.from(`x-access-token:${githubToken}`).toString('base64')}`

    // Fetch remote state for the branch (cheap, no merge)
    let remoteSha = null
    try {
      const { stdout: lsOut } = await runGit(
        ['-c', `http.extraHeader=${authHeader}`, 'ls-remote', remoteUrl, `refs/heads/${branch}`],
        { timeout: 30000 }
      )
      const m = lsOut.trim().match(/^([0-9a-f]{40})\s/)
      remoteSha = m ? m[1] : null
    } catch { /* ignore — push will still try */ }

    const { stdout: localShaOut } = await runGit(['rev-parse', 'HEAD'])
    const localSha = localShaOut.trim()

    if (!didCommit && remoteSha === localSha) {
      return res.json({
        success: true,
        code: 'NO_CHANGES',
        message: 'No local changes and remote is already up to date.',
        sha: localSha,
        shortSha: localSha.slice(0, 8),
      })
    }

    // Push (token-authenticated)
    await runGit(
      ['-c', `http.extraHeader=${authHeader}`, 'push', remoteUrl, `HEAD:refs/heads/${branch}`],
      { timeout: 60000 }
    )

    return res.json({
      success: true,
      code: 'PUSHED',
      message: 'Changes pushed to GitHub. Vercel will deploy automatically.',
      branch,
      sha: localSha,
      shortSha: localSha.slice(0, 8),
      commitMessage: didCommit ? safeMessage : null,
      committed: didCommit,
    })
  } catch (err) {
    const detail = String(err?.stderr || err?.stdout || err?.message || 'Unknown git error')
      // Strip any leaked token from error output (defense in depth)
      .replace(/x-access-token:[^@\s]+/g, 'x-access-token:***')
      .slice(0, 600)
    console.error('[sync] error:', detail)
    return res.status(500).json({ error: 'Sync failed.', detail })
  }
})

app.post('/api/dz-agent/deploy', async (req, res) => {
  if (!hasDeployAuthorization(req)) {
    return res.status(403).json({ error: 'رمز النشر غير صحيح أو غير مهيأ على الخادم (DEPLOY_ADMIN_TOKEN).' })
  }
  const vercelToken = process.env.VERCEL_TOKEN
  const githubToken = process.env.GITHUB_TOKEN
  const missing = []
  if (!vercelToken) missing.push('VERCEL_TOKEN')
  if (!githubToken) missing.push('GITHUB_TOKEN')
  if (missing.length) {
    return res.status(500).json({
      error: `الأسرار التالية غير مهيأة على الخادم: ${missing.join(', ')}. أضفها في لوحة Secrets ثم أعد المحاولة.`,
      missing,
    })
  }

  try {
    // Get GitHub repo ID (required for Vercel git-source deploys)
    const repoRes = await fetch(`https://api.github.com/repos/${VERCEL_GITHUB_REPO}`, {
      headers: { Authorization: `token ${githubToken}`, 'User-Agent': 'DZ-GPT/1.0' },
    })
    const repoData = await repoRes.json().catch(() => ({}))
    if (!repoRes.ok || !repoData.id) {
      return res.status(repoRes.status || 502).json({
        error: `تعذّر الوصول إلى مستودع GitHub (${VERCEL_GITHUB_REPO}): ${repoData?.message || repoRes.statusText}`,
        stage: 'github-repo-lookup',
      })
    }
    const repoId = String(repoData.id)

    // Get latest commit SHA on the deploy branch
    const branchRes = await fetch(`https://api.github.com/repos/${VERCEL_GITHUB_REPO}/git/ref/heads/${encodeURIComponent(VERCEL_DEPLOY_BRANCH)}`, {
      headers: { Authorization: `token ${githubToken}`, 'User-Agent': 'DZ-GPT/1.0' },
    })
    const branchData = await branchRes.json().catch(() => ({}))
    if (!branchRes.ok || !branchData?.object?.sha) {
      return res.status(branchRes.status || 502).json({
        error: `تعذّر إيجاد فرع GitHub (${VERCEL_DEPLOY_BRANCH}): ${branchData?.message || branchRes.statusText}`,
        stage: 'github-branch-lookup',
      })
    }
    const sha = branchData.object.sha

    // Create new production deployment from GitHub
    const deployBody = {
      name: 'dz-gpt',
      project: VERCEL_PROJECT_ID,
      target: 'production',
      gitSource: { type: 'github', repoId, ref: VERCEL_DEPLOY_BRANCH, sha },
    }

    const r = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(deployBody),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      const vercelMsg = d?.error?.message || d?.message || r.statusText || 'Vercel deploy failed.'
      return res.status(r.status).json({
        error: `فشل Vercel: ${vercelMsg}`,
        stage: 'vercel-create-deployment',
        vercelStatus: r.status,
        detail: d,
      })
    }
    return res.json({
      success: true,
      message: 'Vercel deploy triggered successfully.',
      url: `https://${d.url || 'dz-gpt.vercel.app'}`,
      production: 'https://dz-gpt.vercel.app',
      deploymentId: d.id,
      sha,
      shortSha: sha.slice(0, 8),
      branch: VERCEL_DEPLOY_BRANCH,
    })
  } catch (err) {
    console.error('Vercel deploy error:', err)
    return res.status(500).json({
      error: `استثناء أثناء النشر: ${err?.message || 'unknown'}`,
      stage: 'exception',
    })
  }
})

// ── GitHub ReAct SSE streaming endpoint ──────────────────────────────────────
// Streams each Thought → Action → Observation step in real-time via SSE
app.post('/api/dz-agent/github/react/stream', async (req, res) => {
  const rawToken = req.body.githubToken
  const githubToken = rawToken ? sanitizeString(String(rawToken), 300) : process.env.GITHUB_TOKEN || ''
  const messages = normalizeChatMessages(req.body.messages)
  const query = sanitizeString(String(req.body.query || ''), 2000)
    || [...messages].reverse().find(m => m.role === 'user')?.content?.trim() || ''

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (type, payload = {}) => {
    try {
      res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`)
      if (typeof res.flush === 'function') res.flush()
    } catch (_) {}
  }

  send('start', { message: 'بدء GitHub ReAct Agent...' })

  try {
    const collectedSteps = []
    const result = await runReActLoop({
      query,
      messages,
      aiGenerate: safeGenerateAI,
      githubToken,
      onStep: (step) => {
        collectedSteps.push(step)
        send('step', { step })
        console.log(`[ReAct-SSE] ${step.type}: ${step.message || step.tool || ''}`)
      },
    })
    // ── Extract live site URL from ReAct steps ──────────────────────────────
    let liveUrl = null
    const allSteps = result.steps || collectedSteps
    for (const step of allSteps) {
      if (step.type === 'observation' && step.result) {
        // enable_pages tool returns html_url directly
        if (step.result.html_url && String(step.result.html_url).includes('.github.io')) {
          liveUrl = step.result.html_url
          break
        }
        // create_repo may return pages URL
        if (step.result.site_url || step.result.pagesUrl) {
          liveUrl = step.result.site_url || step.result.pagesUrl
          break
        }
      }
    }
    // Fallback: infer from create_repo full_name if index.html was pushed
    if (!liveUrl) {
      const repoObs = allSteps.find(s => s.type === 'observation' && s.result?.full_name)
      const hasIndexHtml = allSteps.some(s =>
        s.type === 'observation' && (
          String(s.result?.path || s.result?.file || '').includes('index.html') ||
          String(s.result?.files || '').includes('index.html')
        )
      )
      if (repoObs && hasIndexHtml) {
        const [owner2, repo2] = String(repoObs.result.full_name).split('/')
        if (owner2 && repo2) liveUrl = `https://${owner2}.github.io/${repo2}`
      }
    }

    send('done', {
      content: result.content,
      steps: allSteps,
      model: result.model,
      liveUrl,
    })
  } catch (err) {
    console.error('[ReAct-SSE] Error:', err.message)
    send('error', { message: err.message })
    send('done', {
      content: `⚠️ خطأ في GitHub Agent: ${err.message}`,
      steps: [],
      model: null,
    })
  } finally {
    res.end()
  }
})

// ── POST /api/dz-agent/plan/generate — Smart Task Planner ────────────────────
app.post('/api/dz-agent/plan/generate', async (req, res) => {
  const query = sanitizeString(String(req.body.query || ''), 2000)
  if (!query) return res.status(400).json({ error: 'query required' })

  try {
    const plan = await generateTaskPlan(query)
    res.json({ plan })
  } catch (err) {
    console.error('[task-planner] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})
console.log('[task-planner] Smart Task Planner mounted: /api/dz-agent/plan/generate')

// ── Mount Anthropic-compatible Claude Proxy (free-claude-code approach) ───────
app.use('/api/claude-proxy', claudeProxyRouter)
console.log('[claude-proxy] Anthropic-compatible proxy mounted: /api/claude-proxy/v1/messages')

// ── POST /api/dz-agent/github/claude/stream — Claude Code-style ReAct ─────────
app.post('/api/dz-agent/github/claude/stream', async (req, res) => {
  const rawToken = req.body.githubToken
  const githubToken = rawToken ? sanitizeString(String(rawToken), 300) : process.env.GITHUB_TOKEN || ''
  const messages = normalizeChatMessages(req.body.messages)
  const query = sanitizeString(String(req.body.query || ''), 2000)
    || [...messages].reverse().find(m => m.role === 'user')?.content?.trim() || ''

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  const send = (type, payload = {}) => {
    try {
      res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`)
      if (typeof res.flush === 'function') res.flush()
    } catch (_) {}
  }

  send('start', { message: '🤖 Claude Mode — بدء التنفيذ...' })

  try {
    const collectedSteps = []
    const ac = new AbortController()
    req.on('close', () => ac.abort())

    const result = await runClaudeReActLoop({
      query,
      messages,
      githubToken,
      signal: ac.signal,
      onStep: (step) => {
        collectedSteps.push(step)
        send('step', { step })
        console.log(`[claude-stream] ${step.type}: ${step.message || step.tool || ''}`)
      },
    })

    // Extract liveUrl from steps
    let liveUrl = null
    for (const step of result.steps || collectedSteps) {
      if (step.type === 'observation' && step.result) {
        if (step.result.html_url && String(step.result.html_url).includes('.github.io')) {
          liveUrl = step.result.html_url; break
        }
        if (step.result.site_url || step.result.pagesUrl) {
          liveUrl = step.result.site_url || step.result.pagesUrl; break
        }
      }
    }
    if (!liveUrl) {
      const allSteps = result.steps || collectedSteps
      const repoObs = allSteps.find(s => s.type === 'observation' && s.result?.full_name)
      const hasHtml = allSteps.some(s => s.type === 'observation' && (
        String(s.result?.path || s.result?.file || '').includes('index.html') ||
        String(s.result?.files || '').includes('index.html')
      ))
      if (repoObs && hasHtml) {
        const [o, r] = String(repoObs.result.full_name).split('/')
        if (o && r) liveUrl = `https://${o}.github.io/${r}`
      }
    }

    send('done', { content: result.content, steps: result.steps || collectedSteps, model: result.model, liveUrl, claudeMode: true })
  } catch (err) {
    console.error('[claude-stream] Error:', err.message)
    send('error', { message: err.message })
    send('done', { content: `⚠️ خطأ في Claude Mode: ${err.message}`, steps: [], model: null })
  } finally {
    res.end()
  }
})

// ── In-memory response cache (simple identical queries within 5 min) ──────────
const _agentCache = new Map()
const _CACHE_TTL_MS = 5 * 60 * 1000
const _CACHE_MAX = 200
function _cacheKey(msg) {
  return msg.trim().toLowerCase().slice(0, 120)
}
function _cacheGet(msg) {
  const k = _cacheKey(msg)
  const entry = _agentCache.get(k)
  if (!entry) return null
  if (Date.now() - entry.ts > _CACHE_TTL_MS) { _agentCache.delete(k); return null }
  return entry.value
}
function _cacheSet(msg, value) {
  if (_agentCache.size >= _CACHE_MAX) {
    const oldest = [..._agentCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
    if (oldest) _agentCache.delete(oldest[0])
  }
  _agentCache.set(_cacheKey(msg), { value, ts: Date.now() })
}
// Queries that should NEVER be cached (live data)
const _NOCACHE_RE = /أخبار|طقس|مباراة|سعر|صرف|الآن|اليوم|لحظة|live|breaking|latest|news|weather|price/i

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

  // ── Static Fast-Path — إجابة فورية <1ms للمعرفة الثابتة ────────────────
  if (!currentRepo && !req.body.githubToken && messages.length <= 2) {
    const _staticAnswer = lookupStaticFact(lastUserMessage)
    if (_staticAnswer) {
      console.log(`[StaticFact] HIT: "${lastUserMessage.slice(0, 60)}"`)
      return res.status(200).json({ content: _staticAnswer, _static: true })
    }
  }

  // ── Cache hit — return instantly for repeated simple queries ─────────────
  if (!currentRepo && !githubToken && !req.body.youtubeContext && messages.length <= 2 && !_NOCACHE_RE.test(lastUserMessage)) {
    const _cached = _cacheGet(lastUserMessage)
    if (_cached) {
      console.log(`[AgentCache] HIT: "${lastUserMessage.slice(0, 60)}"`)
      return res.status(200).json({ ..._cached, _cached: true })
    }
  }

  // Extract and strip client-injected behavior context tag from the last user message
  const behaviorContextMatch = lastUserMessage.match(/\n?\[سياق المستخدم:[^\]]*\]/)
  const clientBehaviorContext = behaviorContextMatch ? behaviorContextMatch[0].replace(/^\n?\[سياق المستخدم:/, '').replace(/\]$/, '').trim() : ''
  if (behaviorContextMatch) {
    lastUserMessage = lastUserMessage.replace(behaviorContextMatch[0], '').trim()
    const lastUserIndex = messages.map(m => m.role).lastIndexOf('user')
    if (lastUserIndex >= 0) messages[lastUserIndex] = { ...messages[lastUserIndex], content: lastUserMessage }
  }

  // Strip client-injected memory context tag [ذاكرة: ...] so it never leaks into search queries
  const memoryTagMatch = lastUserMessage.match(/\n?\[ذاكرة:[^\]]*\]/)
  if (memoryTagMatch) {
    lastUserMessage = lastUserMessage.replace(memoryTagMatch[0], '').trim()
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

  // ── Smart Context Isolation — DZTools tool requests bypass GitHub routing ──
  const _dzToolRequest = typeof req.body.tool === 'string' ? req.body.tool.toLowerCase() : ''
  const isDZToolRequest = ['jobs', 'health', 'cv', 'legal', 'chart', 'ocr', 'doctor'].includes(_dzToolRequest)

  // ── Deep Query Analysis — فهم السؤال قبل الإجابة ──────────────────────
  const queryAnalysis = analyzeQuery(lastUserMessage)

  const educationSubject = detectEducationSubject(lastUserMessage)
  const educationLevel = detectAcademicLevel(lastUserMessage)
  const isEducationQuery = detectEducationIntent(lastUserMessage)
  let educationalContext = ''
  let weatherPriorityContext = ''

  // ── Web Reader Mode — URL detection ──────────────────────────────────────
  const _detectedUrls = extractUrlsFromMessage(lastUserMessage)
  const isWebReaderQuery = _detectedUrls.length > 0
  let webReaderContext = ''

  // ── YouTube intent — pre-computed EARLY so we can guard other blocks ──────
  // Must be defined before isAlgerianCitizenQuery / detectAmbiguity checks.
  const _ytUrlInMsg_pre = _detectedUrls.find(u => isValidYouTubeUrl(u))
  const _ytKwRe_pre = /(?:فيديو|فيديوهات|فيديوها|يوتيوب|يوتيب|يوتيوبي|بالفيديو|شرحلي.*فيديو|جيبلي.*فيديو|شوفلي.*فيديو|ابحث.*فيديو|عطيني.*فيديو|ابحث.*يوتيوب|ابحث.*اغنية|جيبلي.*اغنية|شوفلي.*اغنية|tutorial|documentaire|review\s+(?:de|of|فيديو)|cours?\s+(?:sur|عن|about)|شرح.*بالفيديو|درس.*بالفيديو|فيديو.*يشرح|أفضل.*فيديو|best.*video|اغنية|أغنية|أغاني|اغاني|موسيقى|كليب|كليبات|video\s*clip|music\s*video|نشيد|أنشودة|مقطع.*فيديو|فيديو.*مقطع|شاهد.*فيديو|watch.*video)/i
  const _isYouTubeQuery_pre = !!_ytUrlInMsg_pre
    || (_ytKwRe_pre.test(lastUserMessage)
        && !detectWebsiteBuilderQuery(lastUserMessage)
        && !detectCodeExecutionQuery(lastUserMessage)
        && !isMapQuery(lastUserMessage))

  // ══════════════════════════════════════════════════════════════════════
  // DZ LANGUAGE LAYER V2 — Algerian Darja Understanding System
  // Pipeline: Moderation → Normalization → Intent → Entities → Style
  // ══════════════════════════════════════════════════════════════════════

  // Step 1: Moderation guard
  const moderation = moderateMessage(lastUserMessage)
  if (!moderation.ok) {
    return res.status(200).json({ content: moderation.replyIfBlocked })
  }

  // ── Owner Training & Command Detection ────────────────────────────────────
  const _ownerTok = req.body.githubToken || process.env.GITHUB_TOKEN || ''
  const _ownerCmd = detectOwnerCommand(lastUserMessage)

  if (_ownerCmd) {
    const _isOwner = await verifyOwnerToken(_ownerTok)
    if (_isOwner) {
      const _cfg    = loadOwnerConfig()
      const _result = processOwnerCommand(lastUserMessage, _cfg)

      if (_result.success) {
        // ── حفظ تغييرات مصادر الأخبار ──────────────────────────────────────
        if (_result.config) {
          saveOwnerConfig(_result.config)

          if (_ownerCmd === 'add_feed' && _result.feed) {
            const alreadyIn = RSS_FEEDS.national.some(f => f.url === _result.feed.url)
            if (!alreadyIn) RSS_FEEDS.national.push({ name: _result.feed.name, url: _result.feed.url, _owner: true })
            addFeed(_result.feed.name, _result.feed.url)
            console.log(`[OwnerTraining] ✅ add_feed → RSS.national + BreakingNews + owner_config.json: ${_result.feed.url}`)

          } else if (_ownerCmd === 'remove_feed') {
            const before = RSS_FEEDS.national.length
            RSS_FEEDS.national = RSS_FEEDS.national.filter(
              f => !f._owner || _result.config.feeds.some(cf => cf.url === f.url)
            )
            const removed = before - RSS_FEEDS.national.length
            const feedUrl = lastUserMessage.match(/https?:\/\/[^\s<>"،,\u060C\u061B]+/)?.[0]?.replace(/[.,;!?]+$/, '')
            if (feedUrl) removeFeed(feedUrl)
            console.log(`[OwnerTraining] 🗑️ remove_feed → RSS.national (${removed}) + BreakingNews + owner_config.json`)
          }
        }

        if (_result.training) {
          console.log(`[OwnerTraining] 🧠 ${_ownerCmd} → agent_training.json saved`)
        }
      }

      return res.status(200).json({ content: _result.message })

    } else {
      return res.status(200).json({
        content: '⛔ **تحقق الهوية فشل**\n\nهذا الأمر مخصص لمالك المشروع فقط.\n\nللتنفيذ، يجب أن تكون متصلاً بـ GitHub بحساب المالك (`Nadirinfograph23`).',
      })
    }
  }

  // ── Implicit Owner Learning — تعلم تلقائي من كل رسالة يكتبها المالك ────────
  // يعمل حتى بدون أوامر صريحة: تصحيح / تعريف / مصدر مرجعي
  if (_ownerTok) {
    // نفحص هوية المالك فقط إذا كانت الرسالة تحتوي إشارة لتصحيح/تعريف/مصدر
    const _hasLearningSignal = /الصواب|الصحيح|خطأ|صحّح|تصحيح|ليس.*بل|في الحقيقة|في الواقع|هو\s+|تعني?|يعني?|تعريف|معنى|مرجع|مصدر\s+موثوق|راجع|reference|definition|correction/i.test(lastUserMessage)
    if (_hasLearningSignal) {
      const _isOwnerSilent = await verifyOwnerToken(_ownerTok)
      if (_isOwnerSilent) {
        const _learned = processImplicitOwnerLearning(lastUserMessage)
        if (_learned.length > 0) {
          // نُعلم المالك بما تعلّمناه — بدون مقاطعة التدفق الطبيعي
          const _learnSummary = _learned.map(l => {
            if (l.type === 'correction')  return `✔️ تصحيح: "${l.correct}"`
            if (l.type === 'definition')  return `📖 تعريف: **${l.term}** = ${l.definition}`
            if (l.type === 'source')      return `📚 مصدر: ${l.name}`
            return ''
          }).filter(Boolean).join('\n')
          console.log(`[OwnerLearning] 🧠 implicit save from owner: ${_learned.map(l=>l.type).join(', ')}`)
          return res.status(200).json({
            content: `✅ **تم التسجيل والحفظ تلقائياً:**\n\n${_learnSummary}\n\n> سأعتمد هذا في جميع ردودي القادمة.`,
            _ownerLearned: true,
          })
        }
      }
    }
  }

  // Step 2: Style detection (darija | franco | mixed | msa | french | unknown)
  const dzStyle = detectDzStyle(lastUserMessage)

  // Step 3: Normalization — Franco-Arab & Darja → normalized Arabic for intent understanding
  const dzNorm = normalizeDarija(lastUserMessage)

  // Step 4: Full intent detection V2 (20 intent types with confidence scores)
  const dzIntent   = detectDzIntent(lastUserMessage)
  const dzEntities = extractDzEntities(lastUserMessage)

  // Step 5: Response style instruction for the AI model
  const dzResponseStyle = buildResponseStyle(dzStyle, dzIntent)

  // Step 6: Self-learning — record Darja patterns (best-effort, non-blocking)
  if (dzNorm.changed || dzStyle === 'darija' || dzStyle === 'franco') {
    recordPendingLearning(
      { input: lastUserMessage, normalized: dzNorm.normalized },
      { moderation, style: dzStyle, intent: dzIntent.type, entities: dzEntities },
    )
  }

  // Build rich language context injected into system prompt (never shown to user)
  const _styleLabel = {
    darija: 'دارجة جزائرية', franco: 'فرانكو-عربي جزائري',
    mixed: 'مزيج دارجة+فرنسية', msa: 'عربية فصحى',
    french: 'فرنسية', unknown: 'غير محددة',
  }[dzStyle] || dzStyle

  const _entityParts = []
  if (dzEntities.location)    _entityParts.push('الموقع: ' + dzEntities.location)
  if (dzEntities.serviceType) _entityParts.push('الخدمة: ' + dzEntities.serviceType)
  if (dzEntities.language)    _entityParts.push('اللغة: ' + dzEntities.language)
  if (dzEntities.timeframe)   _entityParts.push('الزمن: ' + dzEntities.timeframe)

  const dzLanguageContext = (() => {
    const isDarijaLike = ['darija','franco','mixed'].includes(dzStyle) || dzNorm.changed
    if (!isDarijaLike && dzStyle !== 'french' && dzStyle !== 'msa') return ''

    if (dzStyle === 'msa') {
      return '🗣️ LANGUAGE_HINT: المستخدم يكتب بالعربية الفصحى — أجب بالفصحى مع الحفاظ على شخصية DZ Agent.'
    }
    if (dzStyle === 'french') {
      return "🗣️ LANGUAGE_HINT: L'utilisateur écrit en français. Réponds en français naturel et amical, en gardant le caractère DZ Agent."
    }

    const lines = [
      '━━━ DZ LANGUAGE LAYER V2 ━━━',
      '🗣️ لغة المستخدم: ' + _styleLabel,
    ]
    if (dzNorm.changed) lines.push('🔄 الترجمة الداخلية: "' + dzNorm.normalized + '"')
    lines.push('🎯 النية: ' + dzIntent.type + (dzIntent.subtype ? ' + ' + dzIntent.subtype : '') + ' (ثقة ' + Math.round(dzIntent.confidence * 100) + '%)')
    if (_entityParts.length) lines.push('📍 ' + _entityParts.join(' | '))
    lines.push('')
    lines.push('📋 أسلوب الرد (إلزامي): ' + dzResponseStyle)
    lines.push('⚠️ لا تُعلم المستخدم بأي معالجة لغوية — طبّق الأسلوب بصمت تام.')
    lines.push('⚠️ لا تقل "لم أفهم" — حاول دائماً تفسير القصد والإجابة بشكل مفيد.')
    lines.push('⚠️ إذا كانت كلمة دارجة غير معروفة → اعتبرها سياقاً وأجب بشكل طبيعي.')
    return lines.join('\n')
  })()
  // ── Local knowledge base — unified developer/owner + capabilities intents ─
  if (isDeveloperOrOwnerQuestion(lastUserMessage)) {
    return res.status(200).json(DEVELOPER_RESPONSE)
  }
  if (isCapabilitiesQuestion(lastUserMessage)) {
    return res.status(200).json(CAPABILITIES_RESPONSE)
  }

  // ══════════════════════════════════════════════════════════════════════
  // SMART INTENT CLARIFICATION — فهم النية قبل التنفيذ
  // RULE: Only intercept genuinely ambiguous short requests.
  //       DZ-Tool requests, conversation-only patterns → always skip.
  // ══════════════════════════════════════════════════════════════════════
  if (!isDZToolRequest && !_isYouTubeQuery_pre) {
    const _ambiguity = detectAmbiguity(lastUserMessage)
    if (_ambiguity.needsClarification) {
      console.log(`[SmartClarify] 🤔 case=${_ambiguity.caseId} conf=${_ambiguity.confidence}% msg="${lastUserMessage.slice(0, 60)}"`)
      return res.status(200).json({
        content: formatClarification(_ambiguity.question, _ambiguity.options),
        mode: 'clarification',
        clarificationCase: _ambiguity.caseId,
      })
    }
  }

  // ── GitHub ReAct Agent — real tool execution via loop ─────────────────────
  if (shouldUseReActLoop(lastUserMessage)) {
    const resolvedToken = githubToken || process.env.GITHUB_TOKEN || ''
    console.log(`[GitHub ReAct] Routing to ReAct loop — token=${!!resolvedToken} query="${lastUserMessage.slice(0, 60)}"`)
    try {
      const steps = []
      const result = await runReActLoop({
        query: lastUserMessage,
        messages,
        aiGenerate: safeGenerateAI,
        githubToken: resolvedToken,
        onStep: (s) => steps.push(s),
      })
      return res.status(200).json({
        content: result.content,
        model: result.model,
        mode: 'github-react',
        steps: result.steps || steps,
        github_token: !!resolvedToken,
      })
    } catch (reactErr) {
      console.error('[GitHub ReAct] Error:', reactErr.message)
      return res.status(200).json({
        content: `⚠️ حدث خطأ في GitHub Agent: ${reactErr.message}\nيرجى المحاولة مرة أخرى.`,
        mode: 'github-react',
        steps: [],
      })
    }
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
  // Skip for DZTools health/symptom requests — they intentionally contain medical keywords
  if (!isDZToolRequest && isEmergencyQuery(lastUserMessage)) {
    return res.status(200).json({ content: EMERGENCY_INFO })
  }

  // ── DZTools fast-path: bypass ALL intent routing → go straight to AI ──────
  // When tool='health'|'cv'|'legal'|etc., the prompt is pre-structured by the tool.
  // Skip maps, places, YouTube, web-reader, doctor routing — all irrelevant.
  if (isDZToolRequest) {
    try {
      const toolResult = await safeGenerateAI({ messages, query: lastUserMessage, max_tokens: 2000, taskHint: 'general' })
      return res.status(200).json({ content: toolResult.content || '⚠️ فشل التحليل. يرجى المحاولة مرة أخرى.', model: toolResult.model })
    } catch (toolErr) {
      console.error('[DZTools fast-path] error:', toolErr.message)
      return res.status(500).json({ content: '⚠️ خطأ في الاتصال بالذكاء الاصطناعي. يرجى المحاولة مرة أخرى.' })
    }
  }

  // ── Algeria Citizen Knowledge System ─────────────────────────────────────
  // Guard: YouTube/Map/Doctor queries must not be intercepted by Algeria routing.
  if (!_isYouTubeQuery_pre && !isMapQuery(lastUserMessage) && !detectDoctorIntent(lastUserMessage).isDoctorQuery && isAlgerianCitizenQuery(lastUserMessage)) {
    const algeriaResult = searchAlgeria(lastUserMessage)
    if (algeriaResult) {
      console.log(`[Algeria-KS] Match: category=${algeriaResult.match.category} score=${algeriaResult.score}`)
      return res.status(200).json({
        content: formatAlgeriaResponse(algeriaResult),
        algeriaSource: algeriaResult.match.link || null,
        algeriaCategory: algeriaResult.match.category,
      })
    }
    // Query seems Algerian but no exact match — enrich AI prompt with Algerian context
    if (!messages.find(m => m.role === 'system')) {
      messages.unshift({
        role: 'system',
        content: `أنت مساعد رقمي جزائري متخصص. أجب دائماً بالعربية البسيطة. عند الإجابة على أسئلة المواطن الجزائري، استخدم دائماً المصادر الرسمية الجزائرية مثل الجريدة الرسمية (joradp.dz)، ONEC، ANEM، AADL، بريد الجزائر، وغيرها. لا تُعطِ معلومات مُبهمة أو خاطئة. إذا لم تعرف، وجّه المستخدم للجهة الرسمية المختصة.`,
      })
    }
  }

  // ── YouTube Discussion Mode ───────────────────────────────────────────────
  // When the client sends youtubeContext (active video), route to AI discussion.
  const youtubeContext = req.body.youtubeContext && typeof req.body.youtubeContext === 'object'
    ? req.body.youtubeContext
    : null

  if (youtubeContext?.id && lastUserMessage) {
    console.log(`[YouTube Discussion] videoId=${youtubeContext.id} query="${lastUserMessage.slice(0, 60)}"`)
    try {
      const history = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
      const result = await handleVideoDiscussion(
        youtubeContext,
        lastUserMessage,
        history,
        (params) => safeGenerateAI({ ...params }),
      )
      return res.status(200).json({
        content: result.reply || 'لم أتمكن من الإجابة. يرجى المحاولة مرة أخرى.',
        quickSuggestions: Array.isArray(result.quickSuggestions) ? result.quickSuggestions : [],
      })
    } catch (ytDiscErr) {
      console.error('[YouTube Discussion] Error:', ytDiscErr.message)
      return res.status(200).json({ content: '⚠️ خطأ في معالجة سؤالك عن الفيديو. يرجى المحاولة مرة أخرى.', quickSuggestions: [] })
    }
  }

  // ── YouTube Smart Selection — Non-Invasive Plugin ─────────────────────────
  // Resolves ordinal/keyword user intent to a previously shown video candidate.
  const youtubeCandidates = Array.isArray(req.body.youtubeCandidates)
    ? req.body.youtubeCandidates
        .slice(0, 20)
        .filter(c => c && typeof c.id === 'string' && typeof c.url === 'string' && typeof c.title === 'string')
    : []

  if (youtubeCandidates.length > 0 && !youtubeContext?.videoId) {
    const selectedVideo = resolveVideoSelection(lastUserMessage, youtubeCandidates)
    if (selectedVideo) {
      console.log(`[YouTube:SmartSelect] Auto-selected index=${youtubeCandidates.indexOf(selectedVideo) + 1} title="${selectedVideo.title.slice(0, 60)}"`)
      try {
        const ytSmartResult = await handleYouTubeInput(selectedVideo.url, {
          aiGenerate: (params) => safeGenerateAI({ ...params }),
        })
        if (ytSmartResult.flow === 'url') {
          return res.status(200).json({
            content: ytSmartResult.message || `🎬 تم تحليل **"${selectedVideo.title}"** بنجاح!`,
            isYouTube: true,
            youtubeFlow: 'url',
            youtubeVideo: ytSmartResult.video || null,
            youtubeAnalysis: ytSmartResult.analysis || null,
            youtubeSuggestions: ytSmartResult.suggestions || [],
            captionNote: ytSmartResult.captionNote || null,
            captionText: ytSmartResult.captionText || null,
          })
        }
      } catch (ytSmartErr) {
        console.error('[YouTube:SmartSelect] Error:', ytSmartErr.message)
        // Non-fatal — fall through to normal YouTube engine
      }
    }
  }

  // ── YouTube Insight Engine ─────────────────────────────────────────────────
  // Use pre-computed YouTube intent (defined early above for use as guards)
  const _ytUrlInMsg = _ytUrlInMsg_pre
  const _ytKwRe = _ytKwRe_pre
  const _isYouTubeQuery = _isYouTubeQuery_pre

  if (_isYouTubeQuery) {
    console.log(`[YouTube Insight] Detected: flow=${_ytUrlInMsg ? 'url' : 'search'} input="${lastUserMessage.slice(0, 80)}"`)
    try {
      const ytInput = _ytUrlInMsg || lastUserMessage
      const _ytPreloadedMeta = req.body.youtubePreloadedMeta && typeof req.body.youtubePreloadedMeta === 'object'
        ? req.body.youtubePreloadedMeta
        : null
      const ytResult = await handleYouTubeInput(ytInput, {
        aiGenerate: (params) => safeGenerateAI({ ...params }),
        preloadedMeta: _ytPreloadedMeta,
        noSuggestions: !!_ytPreloadedMeta,
      })
      if (ytResult.flow === 'url') {
        return res.status(200).json({
          content: ytResult.message || '🎬 تم تحليل الفيديو بنجاح!',
          isYouTube: true,
          youtubeFlow: 'url',
          youtubeVideo: ytResult.video || null,
          youtubeAnalysis: ytResult.analysis || null,
          youtubeSuggestions: ytResult.suggestions || [],
          captionNote: ytResult.captionNote || null,
          captionText: ytResult.captionText || null,
        })
      } else {
        return res.status(200).json({
          content: ytResult.message || '🔍 نتائج البحث على YouTube:',
          isYouTube: true,
          youtubeFlow: 'search',
          youtubeResults: ytResult.results || [],
          youtubeSuggestions: ytResult.suggestions || [],
        })
      }
    } catch (ytErr) {
      console.error('[YouTube Insight] Error:', ytErr.message)
      // ── YouTube query but engine failed → return direct search link, NOT general AI ──
      // Prevents: "الشاب خالد فيديو" → website builder when YouTube API is down
      const _ytFallbackQ = encodeURIComponent(lastUserMessage.replace(/^(?:جيبلي|ابحث عن|ابحث|عطيني|شوفلي|شرحلي)\s+/i, '').replace(/\s*بالفيديو\s*/i, ' ').trim())
      return res.status(200).json({
        content: `🔍 لم أتمكن من تحميل نتائج YouTube مؤقتاً.\n\n👉 [ابحث مباشرة على YouTube](https://www.youtube.com/results?search_query=${_ytFallbackQ})`,
        isYouTube: true,
        youtubeFlow: 'search',
        youtubeResults: [],
        youtubeSuggestions: [
          `ابحث عن "${_ytFallbackQ.replace(/%20/g,' ')} شرح"`,
          `ابحث عن "${_ytFallbackQ.replace(/%20/g,' ')} tutorial"`,
        ],
      })
    }
  }

  // ── Web Reader Mode — fetch & extract content from URLs in message ───────
  const _webReaderIntent = isWebReaderQuery ? detectWebReaderIntent(lastUserMessage) : 'reader'
  if (isWebReaderQuery && _detectedUrls.length > 0) {
    // ── WEBSITE DETECT MODE: pure URL with no explicit intent → show action panel ──
    const _msgStripped = lastUserMessage.replace(URL_RE, '').trim()
    const _hasExplicitIntent = /(ابني|اصنع|أنشئ|حلل|analyze|clone|build|create|استخرج|اقرأ|شرح|explain|مستوحى|inspired|اشرح|ماهو|ما هو|ما هي|اخبرني|تكلم|ناقش|كلمني|صف|describe|summarize|لخص)/i.test(lastUserMessage)
    if (_msgStripped.length < 15 && !_hasExplicitIntent) {
      console.log(`[WebReader:DETECT] Pure URL → auto-summary + action panel for: ${_detectedUrls[0]}`)
      try {
        const _qi = await fetchWebContent(_detectedUrls[0], 2000)
        const _domain = (() => { try { return new URL(_detectedUrls[0]).hostname } catch { return _detectedUrls[0] } })()
        const _rawDesc = (_qi.content || '').replace(/#+\s*/g, '').replace(/>\s*/g, '').replace(/\n+/g, ' ').trim()

        // ── Generate AI summary automatically ─────────────────────────────
        const _summaryMsgs = [
          {
            role: 'system',
            content: '[TOOL:WEB_SUMMARIZER — لا مقدمات — ابدأ مباشرةً — لا شرح — ملخص فقط]\nأنت محلل مواقع خبير. لخّص الموقع في 4-5 نقاط واضحة بالعربية.',
          },
          {
            role: 'user',
            content: `الموقع: ${_qi.title || _domain}\nالرابط: ${_detectedUrls[0]}\nالمحتوى المستخرج:\n${_rawDesc.slice(0, 1800)}\n\nأعطني:\n1. ما هو هذا الموقع وما هدفه؟\n2. ما أبرز محتوياته وأقسامه؟\n3. لمن هو موجّه؟\n4. نقاط قوته الرئيسية.`,
          },
        ]
        const _summaryResult = await safeGenerateAI({ messages: _summaryMsgs, max_tokens: 500, taskHint: 'general' })
        const _autoSummary = _summaryResult?.content || _rawDesc.slice(0, 400)

        return res.status(200).json({
          content: _autoSummary,
          isWebReader: true,
          showCloneOption: true,
          cloneUrl: _detectedUrls[0],
          webSiteInfo: {
            url: _detectedUrls[0],
            title: _qi.title || _domain,
            domain: _domain,
            description: _rawDesc.slice(0, 220),
            headings: (_qi.headings || []).slice(0, 5),
          },
        })
      } catch (_e) {
        console.error('[WebReader:DETECT] quick fetch failed:', _e.message)
        // Fall through to normal web reader processing
      }
    }
    console.log(`[WebReader] Detected ${_detectedUrls.length} URL(s) | intent=${_webReaderIntent} | urls=${_detectedUrls.join(', ')}`)
    const results = await Promise.allSettled(_detectedUrls.slice(0, 3).map(u => fetchWebContent(u)))
    const fetched = results
      .filter(r => r.status === 'fulfilled' && !r.value.error)
      .map(r => r.value)
    const failed = results
      .filter(r => r.status === 'fulfilled' && r.value.error)
      .map(r => r.value)

    if (fetched.length > 0) {
      webReaderContext = fetched.map(f =>
        `🌐 [${f.title || f.url}](${f.url})\n${f.content}`
      ).join('\n\n---\n\n')
      console.log(`[WebReader] Extracted ${fetched.length} pages, total chars: ${webReaderContext.length}`)

      // ── BUILD MODE: route to website builder with extracted content as inspiration ──
      if (_webReaderIntent === 'build') {
        console.log('[WebReader:BUILD] Routing to Website Builder with web content as inspiration')
        const wbMeta = extractWebBuilderMeta(lastUserMessage) || {
          type: 'landing', style: 'modern', title: 'موقع مستوحى من الرابط',
          description: 'website inspired by provided URL', icon: '🌐',
        }
        const webInspirationBlock = `\n\n════════════════════════════════════════════\nWEB READER INSPIRATION — محتوى الموقع المُقدَّم (استلهم منه فقط — لا تنسخه):\n${webReaderContext.slice(0, 3000)}\n\nINSTRUCTION: Study the design concept, structure and purpose of this page, then BUILD something original and superior inspired by it.\n════════════════════════════════════════════`
        let _buildHandled = false
        try {
          const wbMessages = [
            { role: 'system', content: WEBSITE_BUILDER_SYSTEM_PROMPT + webInspirationBlock },
            { role: 'user', content: lastUserMessage },
          ]
          const wbResult = await safeGenerateAI({ messages: wbMessages, query: lastUserMessage, max_tokens: 7000, taskHint: 'website' })
          const rawHtml = wbResult.content || ''
          const htmlCode = extractHtmlFromResponse(rawHtml) || rawHtml
          const validation = validateHtmlOutput(htmlCode)
          _buildHandled = true
          const cssCode = extractCssFromHtml(htmlCode)
          const jsCode  = extractJsFromHtml(htmlCode)
          // Return best-effort HTML even if validation fails (partial HTML is better than no HTML)
          if (htmlCode && htmlCode.length > 100) {
            return res.status(200).json({
              content: `✅ **تم إنشاء موقع مستوحى من الرابط!**\n\n🌐 المصدر: ${_detectedUrls[0]}\n\n▶️ انقر **"معاينة مباشرة"** للمشاهدة أو استخدم **⬇ تحميل** للحفظ.${!validation.ok ? '\n\n⚠️ ملاحظة: الكود قد يحتاج تعديلاً طفيفاً.' : ''}`,
              isWebsite: true,
              htmlCode,
              cssCode: cssCode || '',
              jsCode:  jsCode  || '',
              webBuilderMeta: { ...wbMeta, title: `🌐 ${wbMeta.title}` },
              webReaderIntent: 'build',
            })
          }
        } catch (err) {
          console.error('[WebReader:BUILD] Website builder failed:', err.message)
        }
        // BUILD was handled (even if failed) — skip normal website builder below
        if (_buildHandled) {
          return res.status(200).json({
            content: `⚠️ لم أتمكن من توليد موقع من الرابط. يمكنك وصف التصميم المطلوب بشكل أكثر تفصيلاً.`,
            webReaderIntent: 'build',
          })
        }
      }

      // ── UPDATE MODE: inject update instruction into system prompt ──────────
      if (_webReaderIntent === 'update') {
        webReaderContext = `[UPDATE MODE] المستخدم يريد إضافة ميزة أو تحسين:\n${webReaderContext}`
      }
    }

    if (failed.length > 0 && fetched.length === 0) {
      webReaderContext = `⚠️ لم يتمكن DZ Agent من قراءة الصفحة: ${failed.map(f => `${f.url} (${f.error})`).join(', ')}`
    }
  }

  // ── DZ Place Search (OSM Nominatim) ─────────────────────────────────────
  // Triggered when Darja V2 detects search_places / search_pharmacy / search_hospital
  // AND entities contain a serviceType or the intent is clearly pharmacy/hospital.
  // Guard: skip place search when user is clearly asking to CREATE a website/app.
  // Guard: skip place search for doctor queries — handled by dedicated doctor search below.
  // Guard: skip place search for news/newspaper queries — handled by news/RSS handler.
  const _doctorGuard = detectDoctorIntent(lastUserMessage)
  const _isNewsQuery = isNewspaperHeadlineQuery(lastUserMessage)
  if (PLACE_INTENTS.has(dzIntent.type)
    && !_doctorGuard.isDoctorQuery
    && !_isNewsQuery
    && !detectWebsiteBuilderQuery(lastUserMessage)
    && !detectMapWebsiteQuery(lastUserMessage)
    && !detectCodeExecutionQuery(lastUserMessage)
    && (dzEntities.serviceType || dzEntities.location || dzIntent.type !== 'search_places')) {
    const intentService = INTENT_TO_SERVICE[dzIntent.type]
    const serviceType   = intentService || dzEntities.serviceType || 'restaurant'
    const location      = dzEntities.location

    console.log(`[DZ-Places] intent=${dzIntent.type} service=${serviceType} location=${location}`)
    try {
      const placeResults = await searchPlaces(serviceType, location, 8)
      if (placeResults && placeResults.length > 0) {
        const placeResp = buildPlaceResponse(placeResults, serviceType, location, dzStyle)
        const svc = SERVICE_CONFIG[serviceType] || {}
        const noLocMsg = !location
          ? (dzStyle === 'french'
              ? `\n\n> **Conseil :** Précisez la ville ou la wilaya pour des résultats plus proches (ex: "pharmacie à Oran").`
              : dzStyle === 'msa'
                ? `\n\n> **ملاحظة:** حدّد الولاية أو المدينة للحصول على نتائج أقرب إليك (مثال: "صيدلية في وهران").`
                : `\n\n> **نصيحة:** حدد الولاية ولا المدينة باش نلقيلك الأقرب (مثال: "${svc.labelAr || 'مكان'} في وهران").`)
          : ''
        return res.status(200).json({
          content:  placeResp.text + noLocMsg,
          isMap:    !!placeResp.mapHtml,
          mapHtml:  placeResp.mapHtml || null,
          mapMeta:  { type: 'places', service: serviceType, location, count: placeResp.count },
          placeSearch: true,
        })
      }
      // Results empty: fall through to AI handler with enriched prompt
      console.log(`[DZ-Places] No results for service=${serviceType} location=${location} — falling through to AI`)
    } catch (placeErr) {
      console.error('[DZ-Places] Error:', placeErr.message)
      // Non-fatal — fall through to AI handler
    }
  }


  // ── DZ Maps Intelligence Engine ──────────────────────────────────────────
  // Guard: "موقع index" / "ملف index.html" / web-dev file terms → NOT a map query
  const _isWebFileCtx = /(?:موقع|صفحة|ملف|فايل|file)\s+index(?:\.[a-zA-Z0-9]+)?|\bindex\.(html?|js|ts|jsx|tsx|php|css|vue|svelte|py)\b|(?:موقع|صفحة|ملف)\s+(?:html?|css|javascript|react|vue|angular|next|nuxt|vite|django|flask|express|node|php|python)|\.(?:html?|css|js|ts|jsx|tsx|py|php|json)\b/i.test(lastUserMessage)
  // Guard: إنشاء موقع مطعم / موقع فندق / دير موقع → website builder, NOT map
  const _isWebBuildCtx = detectWebsiteBuilderQuery(lastUserMessage) || detectMapWebsiteQuery(lastUserMessage)
  if (isMapQuery(lastUserMessage) && !_isNewsQuery && !_isWebFileCtx && !_isWebBuildCtx) {
    console.log(`[DZ-Maps] Map query detected: "${lastUserMessage.slice(0, 80)}"`)
    try {
      const mapResult = await handleMapQuery(lastUserMessage, userLocation)
      if (mapResult) {
        return res.status(200).json({
          content:  mapResult.content,
          isMap:    mapResult.isMap || false,
          mapHtml:  mapResult.mapHtml || null,
          mapMeta:  mapResult.mapMeta || null,
        })
      }
      // mapResult is null only if isMapQuery changed — return GPS fallback
      return res.status(200).json({
        content: '📍 اضغط على زر الموقع لعرض الخريطة القريبة منك.',
        isMap: true,
        mapHtml: '',
        mapMeta: { type: 'gps-nearby', needsGps: true, poiKey: null, poiIcon: '📍', poiNameAr: 'مرفق' },
      })
    } catch (mapErr) {
      console.error('[DZ-Maps] Error:', mapErr.message)
      // Always return a map-type response — never fall through to AI for map queries
      return res.status(200).json({
        content: '⚠️ تعذّر تحميل الخريطة مؤقتاً. يرجى المحاولة مرة أخرى.',
        isMap: false,
      })
    }
  }

  // ── Map Website Builder ───────────────────────────────────────────────────
  if (detectMapWebsiteQuery(lastUserMessage)) {
    console.log(`[Map Website Builder] Detected: "${lastUserMessage.slice(0, 80)}"`)
    const MAX_MWB_ATTEMPTS = 2
    let lastMwbHtml = null
    let lastMwbValidation = null

    for (let attempt = 1; attempt <= MAX_MWB_ATTEMPTS; attempt++) {
      try {
        const retryNote = attempt > 1
          ? `\n\nPREVIOUS ATTEMPT FAILED VALIDATION: ${lastMwbValidation?.reason}. Fix it — output MUST include <html>, <style>, <script>, <body>, and Leaflet.js CDN links. HTML ONLY, nothing else.`
          : ''
        const mwbMessages = [
          { role: 'system', content: MAP_WEBSITE_BUILDER_SYSTEM_PROMPT + retryNote },
          { role: 'user', content: lastUserMessage },
        ]
        const mwbResult = await safeGenerateAI({ messages: mwbMessages, query: lastUserMessage, max_tokens: 7000, taskHint: 'website' })
        const rawOutput = mwbResult.content || ''
        const htmlCode = extractHtmlFromResponse(rawOutput) || rawOutput
        const validation = validateHtmlOutput(htmlCode)
        lastMwbHtml = htmlCode
        lastMwbValidation = validation
        if (validation.ok) {
          console.log(`[Map Website Builder] OK attempt ${attempt} — ${htmlCode.length} chars via ${mwbResult.model}`)
          const cssCode = extractCssFromHtml(htmlCode)
          const jsCode  = extractJsFromHtml(htmlCode)
          return res.status(200).json({
            content: `🗺️ **تم إنشاء موقع الخريطة التفاعلية بنجاح!**\n\n✅ **التقنيات المستخدمة:** Leaflet.js + OpenStreetMap (مجاني 100%)\n\n👁 انقر **"معاينة مباشرة"** لمشاهدتها، أو استخدم أزرار التحميل لحفظها.`,
            isWebsite: true,
            isMapWebsite: true,
            htmlCode,
            cssCode: cssCode || '',
            jsCode:  jsCode  || '',
            webBuilderMeta: { type: 'map', style: 'modern', title: '🗺️ خريطة تفاعلية', description: 'موقع خريطة تفاعلي مبني بـ Leaflet.js و OpenStreetMap', icon: '🗺️' },
          })
        }
        console.warn(`[Map Website Builder] Attempt ${attempt} failed: ${validation.reason} — retrying...`)
        if (attempt < MAX_MWB_ATTEMPTS) await new Promise(r => setTimeout(r, 800))
      } catch (err) {
        console.error(`[Map Website Builder] Attempt ${attempt} error:`, err.message)
        if (attempt === MAX_MWB_ATTEMPTS) {
          return res.status(200).json({ content: '⚠️ حدث خطأ أثناء توليد موقع الخريطة. يرجى المحاولة مرة أخرى.' })
        }
        await new Promise(r => setTimeout(r, 800))
      }
    }
    if (lastMwbHtml && lastMwbHtml.length > 200) {
      const cssCode = extractCssFromHtml(lastMwbHtml)
      const jsCode  = extractJsFromHtml(lastMwbHtml)
      return res.status(200).json({
        content: `⚠️ **تم توليد موقع الخريطة جزئياً** — قد لا يكون مكتملاً. تحقق من المعاينة.`,
        isWebsite: true,
        isMapWebsite: true,
        htmlCode: lastMwbHtml,
        cssCode: cssCode || '',
        jsCode:  jsCode  || '',
        webBuilderMeta: { type: 'map', style: 'modern', title: '🗺️ خريطة تفاعلية', description: 'موقع خريطة تفاعلي', icon: '🗺️' },
      })
    }
    return res.status(200).json({ content: '⚠️ لم يتمكن النظام من توليد موقع الخريطة. يرجى تفصيل طلبك (مثلاً: "أنشئ موقع خريطة لمطاعم وهران").' })
  }

  // ── Code Execution Mode (Programming Section ONLY) ─────────────────────────
  const execLang = detectCodeExecutionQuery(lastUserMessage)
  if (execLang) {
    console.log(`[Code Execution] Detected: lang=${execLang} query="${lastUserMessage.slice(0, 80)}"`)

    try {
      const execMessages = [
        { role: 'system', content: CODE_EXECUTION_SYSTEM_PROMPT },
        { role: 'user', content: lastUserMessage },
      ]

      const execResult = await safeGenerateAI({ messages: execMessages, query: lastUserMessage, max_tokens: 4000 })
      const rawOutput = execResult.content || ''

      // Extract code block
      const codeMatch = rawOutput.match(/```(\w*)\n([\s\S]*?)```/)
      let code = codeMatch ? codeMatch[2].trim() : rawOutput.trim()
      const detectedLang = codeMatch?.[1] || execLang

      // Extract explanation (everything after the code block)
      const explanation = rawOutput.replace(/```[\s\S]*?```/, '').trim()

      // ── AI failed → generate template-based code fallback ──────────────────
      if (!code) {
        console.warn(`[Code Execution] AI returned empty → using template generator`)
        code = generateCodeTemplate(lastUserMessage, detectedLang || execLang)
        const finalLang = (detectedLang || execLang) === 'python' ? 'python' : 'javascript'
        return res.status(200).json({
          content: `✅ **تم توليد الكود بنجاح!**\n\n> 💡 نصيحة: لتحصل على كود أكثر ذكاءً ومخصص لطلبك، أضف مفتاح Groq API مجاني في إعدادات المشروع (**AI_API_KEY**) من [console.groq.com](https://console.groq.com/keys)`,
          isExecution: true,
          executionLang: finalLang,
          executionCode: code,
        })
      }

      // For HTML: return as website (reuse WebsitePreview)
      if (detectedLang === 'html' || (code.includes('<html') && code.includes('</html>'))) {
        const cssCode = extractCssFromHtml(code)
        const jsCode  = extractJsFromHtml(code)
        return res.status(200).json({
          content: explanation || '✅ تم إنشاء الكود بنجاح!',
          isWebsite: true,
          htmlCode: code,
          cssCode: cssCode || '',
          jsCode: jsCode || '',
          webBuilderMeta: { type: 'code', style: 'modern', title: '💻 تنفيذ كود', description: 'كود قابل للتشغيل', icon: '💻' },
        })
      }

      // For Python/JavaScript: return as execution
      return res.status(200).json({
        content: explanation || '✅ تم إنشاء الكود بنجاح!',
        isExecution: true,
        executionLang: detectedLang === 'python' || detectedLang === 'py' ? 'python' : 'javascript',
        executionCode: code,
      })
    } catch (err) {
      console.error('[Code Execution] Error:', err.message)
      return res.status(200).json({ content: '⚠️ حدث خطأ أثناء توليد الكود. يرجى المحاولة مرة أخرى.' })
    }
  }

  // ── GITHUB WHOAMI (profile card — must come before GITHUB_PAGES_MODE) ─────
  {
    const _whoamiTriggers = [
      'من أنا على github', 'بروفايلي على github', 'حسابي على github', 'معلوماتي على github',
      'اعرض بروفايلي', 'اعرض حسابي على github', 'من أنا في github', 'ملفي الشخصي على github',
      'show my github', 'my github profile', 'who am i on github', 'github profile',
      'show github profile', 'mon profil github', 'mon compte github',
    ]
    const _lm2 = lastUserMessage.toLowerCase()
    if (_whoamiTriggers.some(t => _lm2.includes(t.toLowerCase()))) {
      const _tok2 = sanitizeString(req.body.githubToken || '', 300) || process.env.GITHUB_TOKEN || ''
      if (!_tok2) {
        return res.status(200).json({
          content: '⚠️ **يجب الاتصال بـ GitHub أولاً**\n\nانقر على زر **"ربط GitHub"** في الأعلى لعرض بروفايلك.',
          githubAction: 'needs-connect',
        })
      }
      try {
        const _pRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${_tok2}`, 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(8000),
        })
        if (!_pRes.ok) throw new Error('فشل جلب بيانات GitHub')
        const _u = await _pRes.json()
        const _joinYear = _u.created_at ? new Date(_u.created_at).getFullYear() : ''
        const _profileCard = [
          `## 👤 بروفايل GitHub — @${_u.login}`,
          '',
          `![صورة الحساب](${_u.avatar_url}&s=96)`,
          '',
          `**الاسم:** ${_u.name || _u.login}`,
          _u.bio ? `**Bio:** ${_u.bio}` : null,
          _u.company ? `**الشركة:** ${_u.company}` : null,
          _u.location ? `**الموقع:** ${_u.location}` : null,
          _u.email ? `**البريد:** ${_u.email}` : null,
          _u.blog ? `**الموقع:** [${_u.blog}](${_u.blog.startsWith('http') ? _u.blog : 'https://' + _u.blog})` : null,
          '',
          `| 📦 المستودعات | 👥 المتابعون | 👤 المتابَعون |`,
          `|:---:|:---:|:---:|`,
          `| **${_u.public_repos}** | **${_u.followers}** | **${_u.following}** |`,
          '',
          `🗓️ عضو منذ **${_joinYear}**${_u.plan ? ` · خطة **${_u.plan.name}**` : ''}`,
          '',
          `🔗 [افتح البروفايل على GitHub](${_u.html_url})`,
        ].filter(l => l !== null).join('\n')

        return res.status(200).json({
          content: _profileCard,
          githubAction: 'whoami',
          githubUser: {
            login: _u.login,
            name: _u.name || _u.login,
            avatar: _u.avatar_url,
            url: _u.html_url,
            repos: _u.public_repos,
            bio: _u.bio || null,
            company: _u.company || null,
            location: _u.location || null,
            followers: _u.followers,
            following: _u.following,
            joinYear: _joinYear,
          },
        })
      } catch (_e2) {
        return res.status(200).json({ content: `❌ **خطأ:** ${_e2.message}` })
      }
    }
  }

  // ── CREATE REPO (fast path — must come before GITHUB_PAGES_MODE) ──────────
  {
    const _createTriggers = ['أنشئ مستودع', 'انشئ مستودع', 'إنشاء مستودع', 'create repo', 'create a repo', 'new repo', 'new repository', 'create repository', 'create a new repo', 'créer un dépôt', 'créer un repo']
    const _lm = lastUserMessage.toLowerCase()
    if (_createTriggers.some(t => _lm.includes(t.toLowerCase()))) {
      let _repoName = ''
      const _nm = lastUserMessage.match(/(?:اسمه|اسم|باسم|named?|called?|nommé?)\s+["']?([\w\-\.]+)["']?/i)
        || lastUserMessage.match(/(?:مستودع|repo|dépôt)\s+["']?([\w\-\.]+)["']?/i)
      if (_nm) _repoName = _nm[1].replace(/[^a-zA-Z0-9\-_.]/g, '-').slice(0, 100)

      const _tok = sanitizeString(req.body.githubToken || '', 300) || process.env.GITHUB_TOKEN || ''
      if (!_tok) {
        return res.status(200).json({
          content: '⚠️ **يجب الاتصال بـ GitHub أولاً**\n\nلإنشاء مستودع، انقر على زر **"ربط GitHub"** في الأعلى للمصادقة بحسابك.\n\nبعد الاتصال، كرر طلبك وسيُنشئ DZ Agent المستودع مباشرةً باسم حسابك الحقيقي.',
          githubAction: 'needs-connect',
        })
      }
      try {
        const _uRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${_tok}`, 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(8000),
        })
        if (!_uRes.ok) throw new Error('فشل التحقق من حساب GitHub')
        const _ghUser = await _uRes.json()
        const _login = _ghUser.login
        if (!_repoName) {
          return res.status(200).json({
            content: `🔧 **اختر اسماً للمستودع**\n\nأنت متصل بـ GitHub كـ **@${_login}** ✅\n\nاكتب: *"أنشئ مستودع باسم my-project"*`,
            githubAction: 'needs-name', githubUser: _login,
          })
        }
        const _cRes = await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: { Authorization: `token ${_tok}`, 'Content-Type': 'application/json', 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/vnd.github+json' },
          body: JSON.stringify({ name: _repoName, description: 'Created by DZ Agent 🇩🇿', auto_init: true, private: false }),
          signal: AbortSignal.timeout(15000),
        })
        const _rd = await _cRes.json()
        if (!_cRes.ok) {
          const _em = _rd.errors?.[0]?.message || _rd.message || 'فشل إنشاء المستودع'
          const _exists = _em.toLowerCase().includes('already exists') || _cRes.status === 422
          return res.status(200).json({
            content: _exists
              ? `⚠️ **المستودع موجود مسبقاً**\n\n**${_login}/${_repoName}** موجود بالفعل.\n\n🔗 [افتح المستودع](https://github.com/${_login}/${_repoName})`
              : `❌ **فشل إنشاء المستودع**\n\n${_em}`,
          })
        }
        console.log(`[GitHub] ✅ Created: ${_rd.full_name} by @${_login}`)
        return res.status(200).json({
          content: `✅ **تم إنشاء المستودع بنجاح!**\n\n📦 **${_rd.full_name}**\n👤 [@${_login}](${_ghUser.html_url})\n🔗 [افتح المستودع](${_rd.html_url})\n📋 Clone: \`git clone ${_rd.clone_url}\`\n🌿 الفرع: \`${_rd.default_branch}\`\n\nيمكنك الآن رفع ملفات بقول: *"ارفع ملف index.html"*`,
          githubAction: 'repo-created', githubRepo: _rd.full_name, githubUrl: _rd.html_url, githubUser: _login,
        })
      } catch (_e) {
        return res.status(200).json({ content: `❌ **خطأ:** ${_e.message}` })
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GITHUB REPO COMMAND MODE — تنفيذ الأوامر داخل مستودع محدد
  // يكتشف: "المستودع test" | "مستودع my-repo" | "في repo X" | "داخل X"
  // يدعم: إنشاء صفحة | رفع ملف | تعديل | حذف | قراءة | قائمة الملفات
  // ══════════════════════════════════════════════════════════════════════════
  {
    // ── 1. كشف اسم المستودع من الرسالة ─────────────────────────────────────
    const _repoRefMatch = lastUserMessage.match(
      /(?:(?:في|داخل|بـ|على|inside|in|within|dans|le\s+repo|dans\s+le)\s+)?(?:مستودع|repo(?:sitory)?|dépôt)\s+["']?([\w\-\.]{1,100})["']?/i
    ) || lastUserMessage.match(
      /["']?([\w\-\.]{2,100})["']?\s+(?:مستودع|repo(?:sitory)?|dépôt)/i
    ) || lastUserMessage.match(
      /(?:في|داخل|inside|in)\s+["']?([\w\-\.]{2,100})["']?(?:\s+(?:مستودع|repo))?/i
    )

    // Use currentRepo as fallback ONLY when message has clear GitHub/file operation intent
    // (prevents false positives like "اكتب لي قصيدة" from triggering GitHub mode)
    const _currentRepoShort = currentRepo ? currentRepo.split('/')[1] : null
    const _hasExplicitGithubFileContext = _currentRepoShort && githubToken && (
      /\.(html|css|js|ts|tsx|jsx|py|json|md|yml|yaml|txt|sh|php|rb|go|rs|java|cpp|c)\b/i.test(lastUserMessage)
      || /\b(ملف|صفحة|موقع|فرع|file|page|commit|push|branch|readme|index|style|script|deploy|pages)\b/i.test(lastUserMessage)
    )
    const _targetRepoName = _repoRefMatch ? _repoRefMatch[1] : (_hasExplicitGithubFileContext ? _currentRepoShort : null)

    // ── 2. كشف نوع الأمر ─────────────────────────────────────────────────
    const _lmr = lastUserMessage.toLowerCase()
    const _isCreateFile  = /أنش[إئ]|انش[إئ]|اكتب|أضف|إضافة|add|create|generate|write|génér|créer|صمم|اصنع/.test(_lmr)
    const _isUpdateFile  = /عدّل|حدّث|غيّر|edit|update|modify|change|modifier/.test(_lmr)
    const _isDeleteFile  = /احذف|حذف|delete|remove|supprimer/.test(_lmr)
    const _isListFiles   = /اعرض|قائمة|الملفات|list|show\s+files|affich/.test(_lmr)
    const _isReadFile    = /اقرأ|اقرأ|محتوى|read\s+file|contenu/.test(_lmr)
    const _isWebPage     = /صفحة\s*ويب|موقع|html|landing|portfolio|page\s*web|web\s*page|index\.html/.test(_lmr)
    const _isReadme      = /readme|readme\.md|توثيق|وثّق/.test(_lmr)
    const _isScript      = /سكريبت|script|python|js\s+file|\.js|\.py/.test(_lmr)
    const _isCreateBranch = /(?:أنش[إئ]|انش[إئ]|create|add|جديد|new)\s+(?:فرع|branch)/i.test(lastUserMessage) || /(?:فرع|branch)\s+(?:جديد|new|باسم|named?)/i.test(lastUserMessage)
    const _isEnablePages  = /(?:فعّل|فعل|enable|انشر|نشر|deploy|github\s*pages|github\.io)/i.test(lastUserMessage) && /(?:pages|github\.io)/i.test(lastUserMessage)

    // ── 2b. كشف إنشاء فرع داخل مستودع محدد ─────────────────────────────
    if (_targetRepoName && _isCreateBranch) {
      console.log(`[GH:BranchCmd] repo="${_targetRepoName}" create-branch msg="${lastUserMessage.slice(0,60)}"`)
      const _tok = sanitizeString(req.body.githubToken || '', 300) || process.env.GITHUB_TOKEN || ''
      if (!_tok) {
        return res.status(200).json({ content: `⚠️ يجب الاتصال بـ GitHub أولاً.`, githubAction: 'needs-connect' })
      }
      const _ghH2 = { Authorization: `token ${_tok}`, 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
      try {
        // Get user login
        const _uR = await fetch('https://api.github.com/user', { headers: _ghH2, signal: AbortSignal.timeout(8000) })
        if (!_uR.ok) throw new Error('فشل التحقق من الحساب')
        const _ud = await _uR.json()
        const _branchFullRepo = `${_ud.login}/${_targetRepoName}`

        // Extract branch name from message
        const _brMatch = lastUserMessage.match(/(?:باسم|named?|اسمه|called?)\s+["']?([\w\-\.\/]+)["']?/i)
          || lastUserMessage.match(/(?:فرع|branch)\s+["']?([\w\-\.]+)["']?/i)
        const _newBranchName = _brMatch?.[1] || 'main'

        // Try to get SHA from main or master
        let _brSha = null
        for (const _src of ['main', 'master']) {
          const _refR = await fetch(`https://api.github.com/repos/${_branchFullRepo}/git/ref/heads/${_src}`, { headers: _ghH2, signal: AbortSignal.timeout(6000) }).catch(() => null)
          if (_refR?.ok) { const _rd = await _refR.json(); _brSha = _rd?.object?.sha; break }
        }

        // If no SHA → repo empty → create initial commit first
        if (!_brSha) {
          const _initReadme = Buffer.from(`# ${_targetRepoName}\n\nCreated by DZ Agent 🇩🇿\n`).toString('base64')
          const _initR = await fetch(`https://api.github.com/repos/${_branchFullRepo}/contents/README.md`, {
            method: 'PUT', headers: _ghH2, signal: AbortSignal.timeout(15000),
            body: JSON.stringify({ message: '📚 init: README — by DZ Agent', content: _initReadme, branch: 'main' }),
          })
          if (_initR.ok) {
            await new Promise(r => setTimeout(r, 2000))
            const _retryR = await fetch(`https://api.github.com/repos/${_branchFullRepo}/git/ref/heads/main`, { headers: _ghH2, signal: AbortSignal.timeout(8000) }).catch(() => null)
            if (_retryR?.ok) { const _rd2 = await _retryR.json(); _brSha = _rd2?.object?.sha }
          }
        }

        if (!_brSha) {
          return res.status(200).json({ content: `❌ **تعذّر إنشاء الفرع:** المستودع \`${_branchFullRepo}\` فارغ أو غير موجود. قل: *"أنشئ مستودع باسم ${_targetRepoName}"* أولاً.` })
        }

        if (_newBranchName === 'main' || _newBranchName === 'master') {
          return res.status(200).json({
            content: `✅ **الفرع \`${_newBranchName}\` موجود مسبقاً في \`${_branchFullRepo}\`**\n\n🌿 SHA: \`${_brSha?.slice(0,8)}\`\n🔗 [افتح المستودع](https://github.com/${_branchFullRepo})\n\nيمكنك الآن: *"أنشئ ملف index.html في مستودع ${_targetRepoName}"*`,
            githubAction: 'branch-exists', githubRepo: _branchFullRepo,
          })
        }

        // Create the new branch
        const _crBrR = await fetch(`https://api.github.com/repos/${_branchFullRepo}/git/refs`, {
          method: 'POST', headers: _ghH2, signal: AbortSignal.timeout(12000),
          body: JSON.stringify({ ref: `refs/heads/${_newBranchName}`, sha: _brSha }),
        })
        const _crBrD = await _crBrR.json()
        if (!_crBrR.ok && !_crBrD.message?.includes('already exists')) {
          return res.status(200).json({ content: `❌ فشل إنشاء الفرع \`${_newBranchName}\`: ${_crBrD.message}` })
        }
        const _existed = _crBrD.message?.includes('already exists')
        console.log(`[GH:BranchCmd] ✅ Branch "${_newBranchName}" ${_existed ? 'already existed' : 'created'} in ${_branchFullRepo}`)
        return res.status(200).json({
          content: [
            `✅ **${_existed ? 'الفرع موجود مسبقاً' : 'تم إنشاء الفرع بنجاح'}**`,
            ``,
            `🌿 **الفرع:** \`${_newBranchName}\``,
            `📦 **المستودع:** [${_branchFullRepo}](https://github.com/${_branchFullRepo})`,
            `🔗 [اعرض الفرع](https://github.com/${_branchFullRepo}/tree/${_newBranchName})`,
            ``,
            `💡 الآن يمكنك: *"أنشئ ملف index.html في مستودع ${_targetRepoName}"* أو *"انشر صفحة HTML على GitHub Pages"*`,
          ].join('\n'),
          githubAction: _existed ? 'branch-exists' : 'branch-created',
          githubRepo: _branchFullRepo,
          githubBranch: _newBranchName,
        })
      } catch (_bErr) {
        return res.status(200).json({ content: `❌ **خطأ في GitHub:** ${_bErr.message}` })
      }
    }

    // ── 2c. تفعيل GitHub Pages لمستودع محدد ─────────────────────────────
    if (_targetRepoName && _isEnablePages) {
      const _tok = sanitizeString(req.body.githubToken || '', 300) || process.env.GITHUB_TOKEN || ''
      if (!_tok) return res.status(200).json({ content: `⚠️ يجب الاتصال بـ GitHub أولاً.`, githubAction: 'needs-connect' })
      const _ghH3 = { Authorization: `token ${_tok}`, 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
      try {
        const _uR3 = await fetch('https://api.github.com/user', { headers: _ghH3, signal: AbortSignal.timeout(8000) })
        if (!_uR3.ok) throw new Error('فشل التحقق من الحساب')
        const _ud3 = await _uR3.json()
        const _pagesRepo = `${_ud3.login}/${_targetRepoName}`

        // Get default branch
        const _repoR = await fetch(`https://api.github.com/repos/${_pagesRepo}`, { headers: _ghH3, signal: AbortSignal.timeout(8000) })
        const _repoD = _repoR.ok ? await _repoR.json() : {}
        const _defBranch = _repoD.default_branch || 'main'

        // Upload GH Actions workflow
        const _yml = `name: Deploy to GitHub Pages\non:\n  push:\n    branches: [${_defBranch}]\n  workflow_dispatch:\npermissions:\n  contents: read\n  pages: write\n  id-token: write\nconcurrency:\n  group: "pages"\n  cancel-in-progress: false\njobs:\n  deploy:\n    environment:\n      name: github-pages\n      url: \${{ steps.deployment.outputs.page_url }}\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/configure-pages@v4\n      - uses: actions/upload-pages-artifact@v3\n        with:\n          path: '.'\n      - id: deployment\n        uses: actions/deploy-pages@v4\n`
        const _wfC = await fetch(`https://api.github.com/repos/${_pagesRepo}/contents/.github/workflows/pages.yml?ref=${_defBranch}`, { headers: _ghH3, signal: AbortSignal.timeout(5000) }).catch(() => null)
        const _wfS = _wfC?.ok ? (await _wfC.json().catch(() => ({}))).sha : undefined
        await fetch(`https://api.github.com/repos/${_pagesRepo}/contents/.github/workflows/pages.yml`, {
          method: 'PUT', headers: _ghH3, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ message: '🤖 ci: GitHub Pages workflow — DZ Agent', content: Buffer.from(_yml).toString('base64'), branch: _defBranch, ...(_wfS ? { sha: _wfS } : {}) }),
        }).catch(() => {})

        // Enable Pages — legacy source-based (direct from branch, no workflow needed)
        const _pgPayload = { source: { branch: _defBranch, path: '/' } }
        const _pgR = await fetch(`https://api.github.com/repos/${_pagesRepo}/pages`, {
          method: 'POST', headers: { ..._ghH3, Accept: 'application/vnd.github.switcheroo-preview+json' },
          body: JSON.stringify(_pgPayload),
          signal: AbortSignal.timeout(10000),
        })
        const _pgD = await _pgR.json().catch(() => ({}))
        // If already enabled (409), switch to legacy via PUT
        if (_pgR.status === 409) {
          await fetch(`https://api.github.com/repos/${_pagesRepo}/pages`, {
            method: 'PUT', headers: { ..._ghH3, Accept: 'application/vnd.github.switcheroo-preview+json' },
            body: JSON.stringify({ build_type: 'legacy', source: { branch: _defBranch, path: '/' } }),
            signal: AbortSignal.timeout(10000),
          }).catch(() => {})
        }
        const _siteUrl = `https://${_ud3.login}.github.io/${_targetRepoName}`
        console.log(`[GH:Pages] Enabled Pages (legacy) for ${_pagesRepo} → ${_siteUrl}`)
        return res.status(200).json({
          content: [
            `✅ **تم تفعيل GitHub Pages بنجاح!**`,
            ``,
            `🌐 **رابط الموقع:** [${_siteUrl}](${_siteUrl}) *(يصبح نشطاً خلال 1-3 دقائق)*`,
            `📦 **المستودع:** [github.com/${_pagesRepo}](https://github.com/${_pagesRepo})`,
            `⚙️ **آلية النشر:** مباشر من فرع \`${_defBranch}\` (لا يحتاج GitHub Actions)`,
            ``,
            `> ℹ️ إذا ظهر خطأ 404 → انتظر دقيقة أو اثنتين ثم أعد تحميل الصفحة.`,
          ].join('\n'),
          githubAction: 'pages-enabled', githubRepo: _pagesRepo, githubPagesUrl: _siteUrl,
        })
      } catch (_pErr) {
        return res.status(200).json({ content: `❌ خطأ في تفعيل Pages: ${_pErr.message}` })
      }
    }

    // ── 3. تنفيذ الأمر فقط إذا كان هناك مستودع محدد + أمر واضح ─────────
    if (_targetRepoName && (_isCreateFile || _isUpdateFile || _isDeleteFile || _isListFiles || _isReadFile)) {
      console.log(`[GH:RepoCmd] repo="${_targetRepoName}" cmd=${_isCreateFile?'create':_isUpdateFile?'update':_isDeleteFile?'delete':_isListFiles?'list':'read'} msg="${lastUserMessage.slice(0,60)}"`)

      const _tok = sanitizeString(req.body.githubToken || '', 300) || process.env.GITHUB_TOKEN || ''
      if (!_tok) {
        return res.status(200).json({
          content: `⚠️ **يجب الاتصال بـ GitHub أولاً**\n\nأضف \`GITHUB_TOKEN\` في أسرار Replit أو انقر **"ربط GitHub"**.`,
          githubAction: 'needs-connect',
        })
      }

      // ── بناء الاسم الكامل للمستودع ──────────────────────────────────────
      // currentRepo يحتوي على "owner/repo" كاملاً — نستخدمه مباشرة لتجنب /user API call
      let _ghLogin = ''
      let _fullRepo = ''
      if (currentRepo && currentRepo.includes('/') && currentRepo.split('/')[1] === _targetRepoName) {
        // currentRepo يطابق repo المطلوب — استخدمه مباشرة
        _fullRepo = currentRepo
        _ghLogin = currentRepo.split('/')[0]
      } else {
        // احتياج لجلب login من API
        try {
          const _uR = await fetch('https://api.github.com/user', {
            headers: { Authorization: `token ${_tok}`, 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/vnd.github+json' },
            signal: AbortSignal.timeout(8000),
          })
          if (!_uR.ok) throw new Error('فشل التحقق من الحساب')
          const _ud = await _uR.json()
          _ghLogin = _ud.login
          _fullRepo = `${_ghLogin}/${_targetRepoName}`
        } catch (_ue) {
          return res.status(200).json({ content: `❌ **خطأ في GitHub:** ${_ue.message}` })
        }
      }

      const _ghH = { Authorization: `token ${_tok}`, 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }

      // ── أمر: قائمة الملفات ──────────────────────────────────────────────
      if (_isListFiles) {
        try {
          const _lr = await fetch(`https://api.github.com/repos/${_fullRepo}/contents/`, { headers: _ghH, signal: AbortSignal.timeout(10000) })
          if (!_lr.ok) {
            const _ld = await _lr.json()
            if (_lr.status === 404) return res.status(200).json({ content: `❌ المستودع **${_fullRepo}** غير موجود أو لا تملك صلاحية الوصول إليه.` })
            return res.status(200).json({ content: `❌ خطأ ${_lr.status}: ${_ld.message}` })
          }
          const _files = await _lr.json()
          const _fileList = Array.isArray(_files) ? _files.map(f => `- ${f.type === 'dir' ? '📁' : '📄'} \`${f.name}\`${f.size ? ` (${(f.size/1024).toFixed(1)} KB)` : ''}`).join('\n') : 'لا توجد ملفات'
          return res.status(200).json({
            content: `## 📦 ملفات مستودع \`${_fullRepo}\`\n\n${_fileList}\n\n🔗 [افتح المستودع](https://github.com/${_fullRepo})`,
            githubAction: 'list-files', githubRepo: _fullRepo,
          })
        } catch (_le) {
          return res.status(200).json({ content: `❌ **خطأ:** ${_le.message}` })
        }
      }

      // ── أمر: قراءة ملف ──────────────────────────────────────────────────
      if (_isReadFile) {
        const _pathMatch = lastUserMessage.match(/(?:ملف|file)\s+["']?([\w\-\.\/]+\.\w+)["']?/i)
        const _filePath = _pathMatch ? _pathMatch[1] : 'index.html'
        try {
          const _fr = await fetch(`https://api.github.com/repos/${_fullRepo}/contents/${_filePath}`, { headers: _ghH, signal: AbortSignal.timeout(10000) })
          if (!_fr.ok) return res.status(200).json({ content: `❌ الملف \`${_filePath}\` غير موجود في \`${_fullRepo}\`.` })
          const _fd = await _fr.json()
          const _content = Buffer.from(_fd.content, 'base64').toString('utf-8')
          const _ext = _filePath.split('.').pop()
          return res.status(200).json({
            content: `## 📄 \`${_filePath}\` في \`${_fullRepo}\`\n\n\`\`\`${_ext}\n${_content.slice(0, 3000)}${_content.length > 3000 ? '\n... (مقتطع)' : ''}\n\`\`\``,
            githubAction: 'read-file', githubRepo: _fullRepo,
          })
        } catch (_re) {
          return res.status(200).json({ content: `❌ **خطأ:** ${_re.message}` })
        }
      }

      // ── أمر: حذف ملف ────────────────────────────────────────────────────
      if (_isDeleteFile) {
        const _pathMatch = lastUserMessage.match(/(?:ملف|file)\s+["']?([\w\-\.\/]+\.\w+)["']?/i)
        if (!_pathMatch) return res.status(200).json({ content: `⚠️ حدد اسم الملف للحذف. مثال: *"احذف ملف old.html من المستودع ${_targetRepoName}"*` })
        const _dPath = _pathMatch[1]
        try {
          const _ex = await fetch(`https://api.github.com/repos/${_fullRepo}/contents/${_dPath}`, { headers: _ghH, signal: AbortSignal.timeout(8000) })
          if (!_ex.ok) return res.status(200).json({ content: `❌ الملف \`${_dPath}\` غير موجود في \`${_fullRepo}\`.` })
          const { sha: _dSha } = await _ex.json()
          const _dr = await fetch(`https://api.github.com/repos/${_fullRepo}/contents/${_dPath}`, {
            method: 'DELETE', headers: _ghH, signal: AbortSignal.timeout(10000),
            body: JSON.stringify({ message: `chore: حذف ${_dPath} عبر DZ Agent 🤖`, sha: _dSha, branch: 'main' }),
          })
          if (!_dr.ok) { const _dd = await _dr.json(); return res.status(200).json({ content: `❌ فشل الحذف: ${_dd.message}` }) }
          return res.status(200).json({
            content: `✅ **تم حذف الملف بنجاح**\n\n🗑️ \`${_dPath}\` حُذف من \`${_fullRepo}\`\n🔗 [افتح المستودع](https://github.com/${_fullRepo})`,
            githubAction: 'file-deleted', githubRepo: _fullRepo,
          })
        } catch (_de) {
          return res.status(200).json({ content: `❌ **خطأ:** ${_de.message}` })
        }
      }

      // ── أمر: إنشاء / تعديل ملف أو صفحة ويب ────────────────────────────
      if (_isCreateFile || _isUpdateFile) {

        // ════════════════════════════════════════════════════════════════
        // BATCH COMMIT MODE — رفع عدة ملفات في commit واحد عبر Tree API
        // يُفعَّل عندما يطلب المستخدم مشروعاً كاملاً أو ملفات متعددة
        // ════════════════════════════════════════════════════════════════
        const _isBatchRequest = /موقع\s*كامل|مشروع\s*كامل|full\s*project|projet\s*complet|html\s*[وو+&]\s*css|css\s*[وو+&]\s*js|html\s*[وو+&]\s*js|ملفات\s*متعدد|multiple\s*file|plusieurs\s*fichier|index\.html.*style\.css|كل\s*الملفات|bootstrap.*project|react.*project|landing.*page.*complete/i.test(lastUserMessage)

        if (_isBatchRequest) {
          console.log(`[GH:BatchCommit] Activated for repo="${_fullRepo}" msg="${lastUserMessage.slice(0,60)}"`)

          // ── Step 1: تأكد من وجود المستودع أو أنشئه ──────────────────
          let _defaultBranch = 'main'
          try {
            const _repoChk = await fetch(`https://api.github.com/repos/${_fullRepo}`, { headers: _ghH, signal: AbortSignal.timeout(8000) })
            if (!_repoChk.ok) {
              const _crR = await fetch('https://api.github.com/user/repos', {
                method: 'POST', headers: _ghH, signal: AbortSignal.timeout(15000),
                body: JSON.stringify({ name: _targetRepoName, description: `Created by DZ Agent 🇩🇿`, auto_init: true, private: false }),
              })
              if (!_crR.ok) { const _d = await _crR.json(); return res.status(200).json({ content: `❌ تعذّر إنشاء المستودع: ${_d.message}` }) }
              console.log(`[GH:BatchCommit] ✅ Auto-created: ${_fullRepo}`)
              await new Promise(r => setTimeout(r, 2500))
            } else {
              const _rd = await _repoChk.json()
              _defaultBranch = _rd.default_branch || 'main'
            }
          } catch (_re) {
            return res.status(200).json({ content: `❌ **خطأ في GitHub:** ${_re.message}` })
          }

          // ── Step 2: توليد خطة الملفات عبر AI ───────────────────────
          let _filePlan = []
          try {
            const _planResult = await safeGenerateAI({
              messages: [
                {
                  role: 'system',
                  content: `أنت DZ Agent — مخطط مشاريع ويب. حلّل الطلب وأنتج خطة ملفات JSON دقيقة.
قواعد صارمة:
- أعطِ مصفوفة JSON فقط بدون أي نص آخر
- كل عنصر: {"path":"...","type":"html|css|js|md|json|py","desc":"وصف مختصر بالعربية"}
- أضف دائماً README.md
- للمواقع: index.html + style.css + script.js + README.md
- للمشاريع Python: main.py + requirements.txt + README.md
- للمشاريع Node: index.js + package.json + README.md
- لا تتجاوز 8 ملفات
- Output: JSON array فقط مثل: [{"path":"index.html","type":"html","desc":"الصفحة الرئيسية"}]`,
                },
                { role: 'user', content: `المستودع: ${_fullRepo}\nالطلب: ${lastUserMessage}` },
              ],
              query: lastUserMessage,
              max_tokens: 1000,
            })
            const _planRaw = (_planResult.content || '').trim()
            const _jsonMatch = _planRaw.match(/\[[\s\S]*\]/)
            if (_jsonMatch) _filePlan = JSON.parse(_jsonMatch[0])
            if (!Array.isArray(_filePlan) || !_filePlan.length) throw new Error('خطة فارغة')
          } catch (_pe) {
            // Fallback خطة افتراضية
            _filePlan = [
              { path: 'index.html', type: 'html', desc: 'الصفحة الرئيسية' },
              { path: 'style.css', type: 'css', desc: 'ملف التنسيق' },
              { path: 'script.js', type: 'js', desc: 'ملف JavaScript' },
              { path: 'README.md', type: 'md', desc: 'توثيق المشروع' },
            ]
            console.warn(`[GH:BatchCommit] Plan fallback: ${_pe.message}`)
          }
          console.log(`[GH:BatchCommit] Plan: ${_filePlan.map(f=>f.path).join(', ')}`)

          // ── Step 3: توليد محتوى كل ملف بالتوازي ───────────────────
          const _SYSTEM_MAP = {
            html: `أنت DZ Agent — مهندس ويب. أنشئ ملف HTML5 كاملاً احترافياً responsive مع TailwindCSS CDN إذا مناسب. محتوى حقيقي. Output: HTML فقط بدون markdown.`,
            css:  `أنت DZ Agent — مصمم CSS. أنشئ ملف CSS احترافياً modern، clean، responsive مع variables و animations. Output: CSS فقط بدون markdown.`,
            js:   `أنت DZ Agent — مطور JavaScript. أنشئ ملف JS احترافياً ES6+ مع تعليقات واضحة. Output: JS فقط بدون markdown.`,
            md:   `أنت DZ Agent — فنّي توثيق. اكتب README.md احترافياً بـ Markdown مع badges، وصف، تثبيت، استخدام. Output: Markdown فقط.`,
            json: `أنت DZ Agent. أنشئ ملف JSON صحيح مناسب للمشروع. Output: JSON فقط بدون markdown.`,
            py:   `أنت DZ Agent — مطور Python. اكتب سكريبت Python3 احترافياً مع docstrings. Output: Python فقط بدون markdown.`,
          }

          const _generatedFiles = await Promise.all(_filePlan.map(async (f) => {
            try {
              const _sys = _SYSTEM_MAP[f.type] || `أنت DZ Agent. أنشئ محتوى الملف "${f.path}" (${f.desc}). Output: كود فقط بدون markdown.`
              const _aiR = await safeGenerateAI({
                messages: [
                  { role: 'system', content: _sys },
                  { role: 'user', content: `المشروع: ${_targetRepoName}\nالملف: ${f.path}\nالوصف: ${f.desc}\nالطلب الأصلي: ${lastUserMessage}` },
                ],
                query: lastUserMessage,
                max_tokens: f.type === 'html' ? 8000 : 3000,
              })
              let _c = _aiR.content || ''
              if (f.type === 'html') _c = extractHtmlFromResponse(_c) || _c
              // نظّف markdown code fences إذا وُجدت
              _c = _c.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()
              return { ...f, content: _c, ok: _c.length > 20, size: _c.length }
            } catch (_fe) {
              return { ...f, content: `/* Error generating ${f.path}: ${_fe.message} */`, ok: false, size: 0 }
            }
          }))

          const _successFiles = _generatedFiles.filter(f => f.ok)
          const _failedFiles  = _generatedFiles.filter(f => !f.ok)
          console.log(`[GH:BatchCommit] Generated: ${_successFiles.length}/${_filePlan.length} files OK`)

          if (!_successFiles.length) {
            return res.status(200).json({ content: `❌ فشل توليد جميع الملفات. صف الطلب بشكل أوضح وأعد المحاولة.` })
          }

          // ── Step 4: الحصول على HEAD commit ──────────────────────────
          let _baseTree = null
          let _parentSha = null
          try {
            const _refR = await fetch(`https://api.github.com/repos/${_fullRepo}/git/ref/heads/${_defaultBranch}`, { headers: _ghH, signal: AbortSignal.timeout(8000) })
            if (_refR.ok) {
              const _refD = await _refR.json()
              _parentSha = _refD.object?.sha
              const _commitR = await fetch(`https://api.github.com/repos/${_fullRepo}/git/commits/${_parentSha}`, { headers: _ghH, signal: AbortSignal.timeout(8000) })
              if (_commitR.ok) { const _cd = await _commitR.json(); _baseTree = _cd.tree?.sha }
            }
          } catch (_te) {
            console.warn('[GH:BatchCommit] Could not fetch HEAD, will create initial commit:', _te.message)
          }

          // ── Step 5: إنشاء blob لكل ملف ──────────────────────────────
          const _blobs = await Promise.all(_successFiles.map(async (f) => {
            try {
              const _br = await fetch(`https://api.github.com/repos/${_fullRepo}/git/blobs`, {
                method: 'POST', headers: _ghH, signal: AbortSignal.timeout(15000),
                body: JSON.stringify({ content: f.content, encoding: 'utf-8' }),
              })
              if (!_br.ok) { const _d = await _br.json(); throw new Error(_d.message) }
              const { sha } = await _br.json()
              return { path: f.path, mode: '100644', type: 'blob', sha }
            } catch (_be) {
              console.warn(`[GH:BatchCommit] Blob failed for ${f.path}:`, _be.message)
              return null
            }
          }))
          const _validBlobs = _blobs.filter(Boolean)

          // ── Step 6: إنشاء Tree جديد ─────────────────────────────────
          const _treeBody = { tree: _validBlobs }
          if (_baseTree) _treeBody.base_tree = _baseTree
          const _treeR = await fetch(`https://api.github.com/repos/${_fullRepo}/git/trees`, {
            method: 'POST', headers: _ghH, signal: AbortSignal.timeout(15000),
            body: JSON.stringify(_treeBody),
          })
          if (!_treeR.ok) {
            const _td = await _treeR.json()
            return res.status(200).json({ content: `❌ فشل إنشاء Tree: ${_td.message}` })
          }
          const { sha: _newTreeSha } = await _treeR.json()

          // ── Step 7: إنشاء Commit ─────────────────────────────────────
          const _commitBody = {
            message: `feat: ${_filePlan.map(f=>f.path).join(', ')} — via DZ Agent 🇩🇿 [batch]`,
            tree: _newTreeSha,
            ...(_parentSha ? { parents: [_parentSha] } : { parents: [] }),
          }
          const _commitR = await fetch(`https://api.github.com/repos/${_fullRepo}/git/commits`, {
            method: 'POST', headers: _ghH, signal: AbortSignal.timeout(15000),
            body: JSON.stringify(_commitBody),
          })
          if (!_commitR.ok) {
            const _cd = await _commitR.json()
            return res.status(200).json({ content: `❌ فشل إنشاء Commit: ${_cd.message}` })
          }
          const { sha: _newCommitSha } = await _commitR.json()

          // ── Step 8: تحديث الفرع ──────────────────────────────────────
          const _updateMethod = _parentSha ? 'PATCH' : 'POST'
          const _updateUrl = _parentSha
            ? `https://api.github.com/repos/${_fullRepo}/git/refs/heads/${_defaultBranch}`
            : `https://api.github.com/repos/${_fullRepo}/git/refs`
          const _updateBody = _parentSha
            ? { sha: _newCommitSha }
            : { ref: `refs/heads/${_defaultBranch}`, sha: _newCommitSha }
          const _upR = await fetch(_updateUrl, {
            method: _updateMethod, headers: _ghH, signal: AbortSignal.timeout(10000),
            body: JSON.stringify(_updateBody),
          })
          if (!_upR.ok) {
            const _ud2 = await _upR.json()
            return res.status(200).json({ content: `❌ فشل تحديث الفرع: ${_ud2.message}` })
          }
          console.log(`[GH:BatchCommit] ✅ Commit ${_newCommitSha.slice(0,8)} pushed ${_validBlobs.length} files → ${_fullRepo}`)

          // ── Step 9: تفعيل GitHub Pages إذا وُجد index.html ─────────
          let _pagesUrl = null
          const _hasHtml = _successFiles.some(f => f.path === 'index.html' || f.type === 'html')
          if (_hasHtml) {
            try {
              // 9a. رفع GitHub Actions workflow لضمان نشر صحيح (يتجنب 404)
              const _pagesYml = `name: Deploy to GitHub Pages\non:\n  push:\n    branches: [${_defaultBranch}]\n  workflow_dispatch:\npermissions:\n  contents: read\n  pages: write\n  id-token: write\nconcurrency:\n  group: "pages"\n  cancel-in-progress: false\njobs:\n  deploy:\n    environment:\n      name: github-pages\n      url: \${{ steps.deployment.outputs.page_url }}\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/configure-pages@v4\n      - uses: actions/upload-pages-artifact@v3\n        with:\n          path: '.'\n      - id: deployment\n        uses: actions/deploy-pages@v4\n`
              const _wfCheck = await fetch(`https://api.github.com/repos/${_fullRepo}/contents/.github/workflows/pages.yml?ref=${_defaultBranch}`, { headers: _ghH, signal: AbortSignal.timeout(5000) }).catch(() => null)
              const _wfSha = _wfCheck?.ok ? (await _wfCheck.json().catch(() => ({}))).sha : undefined
              await fetch(`https://api.github.com/repos/${_fullRepo}/contents/.github/workflows/pages.yml`, {
                method: 'PUT', headers: _ghH, signal: AbortSignal.timeout(15000),
                body: JSON.stringify({ message: '🤖 ci: add GitHub Pages workflow — DZ Agent', content: Buffer.from(_pagesYml).toString('base64'), branch: _defaultBranch, ...(_wfSha ? { sha: _wfSha } : {}) }),
              }).catch(() => {})

              // 9b. تفعيل Pages API — legacy source-based مباشرة
              const _pgR = await fetch(`https://api.github.com/repos/${_fullRepo}/pages`, {
                method: 'POST', headers: { ..._ghH, Accept: 'application/vnd.github.switcheroo-preview+json' },
                body: JSON.stringify({ source: { branch: _defaultBranch, path: '/' } }),
                signal: AbortSignal.timeout(10000),
              })
              if (_pgR.ok || _pgR.status === 409) {
                _pagesUrl = `https://${_ghLogin}.github.io/${_targetRepoName}`
                // If already enabled with wrong type, switch to legacy
                if (_pgR.status === 409) {
                  await fetch(`https://api.github.com/repos/${_fullRepo}/pages`, {
                    method: 'PUT', headers: { ..._ghH, Accept: 'application/vnd.github.switcheroo-preview+json' },
                    body: JSON.stringify({ build_type: 'legacy', source: { branch: _defaultBranch, path: '/' } }),
                    signal: AbortSignal.timeout(10000),
                  }).catch(() => {})
                }
              }
            } catch {}
          }

          // ── Step 10: بناء التقرير التفصيلي ──────────────────────────
          const _totalKb = (_successFiles.reduce((s, f) => s + f.size, 0) / 1024).toFixed(1)
          const _fileReport = [
            ..._successFiles.map(f => `  ✅ \`${f.path}\` — ${f.desc} *(${(f.size/1024).toFixed(1)} KB)*`),
            ..._failedFiles.map(f => `  ❌ \`${f.path}\` — فشل التوليد`),
          ]

          const _batchReport = [
            `## ✅ Batch Commit مكتمل — \`${_fullRepo}\``,
            ``,
            `📦 **المستودع:** [github.com/${_fullRepo}](https://github.com/${_fullRepo})`,
            `🔀 **Commit:** [\`${_newCommitSha.slice(0,8)}\`](https://github.com/${_fullRepo}/commit/${_newCommitSha})`,
            `📁 **الملفات المرفوعة:** ${_validBlobs.length} / ${_filePlan.length} ملف`,
            `💾 **الحجم الإجمالي:** ${_totalKb} KB`,
            _pagesUrl ? `🌐 **الموقع المباشر:** [${_pagesUrl}](${_pagesUrl}) *(جاهز خلال دقيقة)*` : null,
            ``,
            `### 📋 تفاصيل الملفات`,
            ..._fileReport,
            ``,
            `### 📊 Commit Summary`,
            `| الملف | الحجم | الحالة |`,
            `|-------|-------|--------|`,
            ..._successFiles.map(f => `| \`${f.path}\` | ${(f.size/1024).toFixed(1)} KB | ✅ تم رفعه |`),
            ..._failedFiles.map(f => `| \`${f.path}\` | — | ❌ فشل |`),
            ``,
            `> 💡 **ماذا بعد؟** جرّب: *"عدّل التصميم في مستودع ${_targetRepoName}"* أو *"أضف صفحة about.html"*`,
          ].filter(l => l !== null).join('\n')

          const _htmlFile = _successFiles.find(f => f.path === 'index.html' || f.type === 'html')
          return res.status(200).json({
            content: _batchReport,
            isWebsite: !!_htmlFile,
            htmlCode: _htmlFile?.content || undefined,
            cssCode: _successFiles.find(f => f.type === 'css')?.content || undefined,
            jsCode: _successFiles.find(f => f.type === 'js')?.content || undefined,
            webBuilderMeta: _htmlFile ? { type: 'landing', style: 'modern', title: _targetRepoName, description: lastUserMessage.slice(0, 100), icon: '🚀' } : undefined,
            githubAction: 'batch-commit',
            githubRepo: _fullRepo,
            githubCommitSha: _newCommitSha,
            githubCommitUrl: `https://github.com/${_fullRepo}/commit/${_newCommitSha}`,
            githubPagesUrl: _pagesUrl,
            batchReport: {
              total: _filePlan.length, pushed: _validBlobs.length, failed: _failedFiles.length,
              files: _successFiles.map(f => ({ path: f.path, type: f.type, size: f.size, ok: true })),
              commitSha: _newCommitSha, totalKb: parseFloat(_totalKb),
            },
          })
        }
        // ── نهاية BATCH COMMIT MODE ───────────────────────────────────

        // كشف مسار الملف المطلوب (الوضع العادي — ملف واحد)
        const _pathMatch = lastUserMessage.match(/(?:ملف|file)\s+["']?([\w\-\.\/]+\.\w+)["']?/i)
        let _filePath = _pathMatch ? _pathMatch[1] : (_isWebPage ? 'index.html' : _isReadme ? 'README.md' : _isScript ? 'script.js' : 'index.html')
        const _ext = _filePath.split('.').pop().toLowerCase()

        // توليد المحتوى عبر AI
        let _generatedContent = ''
        try {
          let _genSystem = ''
          if (_ext === 'html' || _isWebPage) {
            _genSystem = `أنت DZ Agent — مهندس ويب محترف. أنشئ صفحة HTML5 كاملة بتصميم احترافي حديث.
قواعد صارمة:
- HTML5 كامل من <!DOCTYPE html> إلى </html>
- CSS مُدمَج في <style> — responsive، mobile-first، تصميم جميل
- TailwindCSS CDN مسموح: <script src="https://cdn.tailwindcss.com"></script>
- محتوى حقيقي مناسب للطلب — لا Lorem ipsum
- Output: HTML فقط — بدون markdown أو شرح`
          } else if (_ext === 'md' || _isReadme) {
            _genSystem = `أنت DZ Agent — اكتب ملف README.md احترافياً بـ Markdown يصف المشروع "${_targetRepoName}". أضف: badges، وصف، تثبيت، استخدام، ترخيص. Output: Markdown فقط.`
          } else if (_ext === 'py') {
            _genSystem = `أنت DZ Agent — اكتب سكريبت Python احترافياً. Output: Python code فقط — بدون markdown.`
          } else if (_ext === 'js' || _ext === 'ts') {
            _genSystem = `أنت DZ Agent — اكتب JavaScript/TypeScript احترافياً. Output: code فقط — بدون markdown.`
          } else {
            _genSystem = `أنت DZ Agent — نفّذ الطلب التالي وأعطِ الكود/المحتوى الكامل فقط بدون markdown.`
          }

          const _aiResult = await safeGenerateAI({
            messages: [
              { role: 'system', content: _genSystem },
              { role: 'user', content: `المستودع: ${_fullRepo}\nالطلب: ${lastUserMessage}` },
            ],
            query: lastUserMessage,
            max_tokens: 8000,
          })
          _generatedContent = (_ext === 'html' || _isWebPage)
            ? (extractHtmlFromResponse(_aiResult.content || '') || _aiResult.content || '')
            : (_aiResult.content || '')

          if (!_generatedContent || _generatedContent.length < 50) throw new Error('المحتوى المولّد قصير جداً')
        } catch (_ge) {
          return res.status(200).json({ content: `❌ **خطأ في توليد المحتوى:** ${_ge.message}\n\nحاول وصف الطلب بشكل أوضح.` })
        }

        // رفع الملف إلى GitHub
        try {
          // التحقق إذا كان الملف موجوداً (للتحديث)
          let _existingSha = null
          const _exR = await fetch(`https://api.github.com/repos/${_fullRepo}/contents/${_filePath}?ref=main`, { headers: _ghH, signal: AbortSignal.timeout(8000) }).catch(() => null)
          if (_exR?.ok) { const _exD = await _exR.json(); _existingSha = _exD.sha }

          // التأكد من وجود الفرع main — إذا لم يوجد المستودع أصلاً نُنشئه
          const _repoR = await fetch(`https://api.github.com/repos/${_fullRepo}`, { headers: _ghH, signal: AbortSignal.timeout(8000) })
          if (!_repoR.ok) {
            // المستودع غير موجود — أنشئه أولاً
            const _crR = await fetch('https://api.github.com/user/repos', {
              method: 'POST', headers: _ghH, signal: AbortSignal.timeout(15000),
              body: JSON.stringify({ name: _targetRepoName, description: `Created by DZ Agent 🇩🇿`, auto_init: true, private: false }),
            })
            if (!_crR.ok) {
              const _crd = await _crR.json()
              return res.status(200).json({ content: `❌ المستودع **${_fullRepo}** غير موجود ولم يمكن إنشاؤه: ${_crd.message}` })
            }
            console.log(`[GH:RepoCmd] ✅ Auto-created repo: ${_fullRepo}`)
            await new Promise(r => setTimeout(r, 2000))
          }

          const _pushBody = {
            message: `${_isUpdateFile ? 'update' : 'feat'}: ${_isWebPage ? 'صفحة ويب' : _filePath} عبر DZ Agent 🤖`,
            content: Buffer.from(_generatedContent).toString('base64'),
            branch: 'main',
            ...(_existingSha ? { sha: _existingSha } : {}),
          }
          const _pr = await fetch(`https://api.github.com/repos/${_fullRepo}/contents/${_filePath}`, {
            method: 'PUT', headers: _ghH, signal: AbortSignal.timeout(20000),
            body: JSON.stringify(_pushBody),
          })
          if (!_pr.ok) {
            const _prd = await _pr.json()
            // محاولة إصلاح: إذا كان خطأ "Git Repository is empty"
            if (/empty|not found|no commit/i.test(_prd.message || '')) {
              // إنشاء README أولاً ثم إعادة المحاولة
              await fetch(`https://api.github.com/repos/${_fullRepo}/contents/README.md`, {
                method: 'PUT', headers: _ghH, signal: AbortSignal.timeout(10000),
                body: JSON.stringify({ message: 'init: README via DZ Agent', content: Buffer.from(`# ${_targetRepoName}\n\nCreated by DZ Agent 🇩🇿`).toString('base64'), branch: 'main' }),
              })
              await new Promise(r => setTimeout(r, 1500))
              const _retry = await fetch(`https://api.github.com/repos/${_fullRepo}/contents/${_filePath}`, {
                method: 'PUT', headers: _ghH, signal: AbortSignal.timeout(20000),
                body: JSON.stringify({ ..._pushBody, sha: undefined }),
              })
              if (!_retry.ok) { const _rd = await _retry.json(); return res.status(200).json({ content: `❌ فشل الرفع حتى بعد الإصلاح: ${_rd.message}` }) }
            } else {
              return res.status(200).json({ content: `❌ **فشل رفع الملف:** ${_prd.message}` })
            }
          }

          console.log(`[GH:RepoCmd] ✅ Pushed ${_filePath} → ${_fullRepo}`)

          // تفعيل GitHub Pages تلقائياً إذا كانت صفحة HTML
          let _pagesUrl = `https://github.com/${_fullRepo}/blob/main/${_filePath}`
          let _pagesEnabled = false
          if (_ext === 'html' || _isWebPage) {
            try {
              // ── رفع GitHub Actions workflow لضمان عدم ظهور 404 ──
              const _pagesYml = `name: Deploy to GitHub Pages\non:\n  push:\n    branches: [main]\n  workflow_dispatch:\npermissions:\n  contents: read\n  pages: write\n  id-token: write\nconcurrency:\n  group: "pages"\n  cancel-in-progress: false\njobs:\n  deploy:\n    environment:\n      name: github-pages\n      url: \${{ steps.deployment.outputs.page_url }}\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/configure-pages@v4\n      - uses: actions/upload-pages-artifact@v3\n        with:\n          path: '.'\n      - id: deployment\n        uses: actions/deploy-pages@v4\n`
              const _wfChk = await fetch(`https://api.github.com/repos/${_fullRepo}/contents/.github/workflows/pages.yml?ref=main`, { headers: _ghH, signal: AbortSignal.timeout(5000) }).catch(() => null)
              const _wfShaX = _wfChk?.ok ? (await _wfChk.json().catch(() => ({}))).sha : undefined
              await fetch(`https://api.github.com/repos/${_fullRepo}/contents/.github/workflows/pages.yml`, {
                method: 'PUT', headers: _ghH, signal: AbortSignal.timeout(15000),
                body: JSON.stringify({ message: '🤖 ci: add GitHub Pages workflow — DZ Agent', content: Buffer.from(_pagesYml).toString('base64'), branch: 'main', ...(_wfShaX ? { sha: _wfShaX } : {}) }),
              }).catch(() => {})

              // ── تفعيل Pages API — legacy source-based مباشرة (بدون GitHub Actions) ──
              const _pgR = await fetch(`https://api.github.com/repos/${_fullRepo}/pages`, {
                method: 'POST', headers: { ..._ghH, Accept: 'application/vnd.github.switcheroo-preview+json' },
                body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
                signal: AbortSignal.timeout(10000),
              })
              if (_pgR.ok || _pgR.status === 409) {
                _pagesUrl = `https://${_ghLogin}.github.io/${_targetRepoName}`
                _pagesEnabled = true
                // If already enabled with wrong build type, switch to legacy
                if (_pgR.status === 409) {
                  await fetch(`https://api.github.com/repos/${_fullRepo}/pages`, {
                    method: 'PUT', headers: { ..._ghH, Accept: 'application/vnd.github.switcheroo-preview+json' },
                    body: JSON.stringify({ build_type: 'legacy', source: { branch: 'main', path: '/' } }),
                    signal: AbortSignal.timeout(10000),
                  }).catch(() => {})
                }
              }
            } catch {}
          }

          const _isHtml = _ext === 'html' || _isWebPage
          const _successMsg = [
            `✅ **${_isUpdateFile ? 'تم تحديث' : 'تم إنشاء'} \`${_filePath}\` في \`${_fullRepo}\`**`,
            ``,
            `📦 **المستودع:** [github.com/${_fullRepo}](https://github.com/${_fullRepo})`,
            `📄 **الملف:** [${_filePath}](https://github.com/${_fullRepo}/blob/main/${_filePath})`,
            _isHtml && _pagesEnabled ? `🌐 **الموقع المباشر:** [${_pagesUrl}](${_pagesUrl}) *(جاهز خلال دقيقة)*` : null,
            ``,
            `**ماذا تم؟**`,
            _isHtml && _pagesEnabled && !_isUpdateFile ? `- ✔️ إنشاء المستودع \`${_targetRepoName}\` (إن لم يكن موجوداً)` : null,
            `- ✔️ ${_isUpdateFile ? 'تحديث' : 'رفع'} الملف \`${_filePath}\` (${(_generatedContent.length/1024).toFixed(1)} KB)`,
            _isHtml && _pagesEnabled ? `- ✔️ تفعيل GitHub Pages تلقائياً` : null,
            ``,
            `💡 يمكنك الآن قول: *"عدّل التصميم"* أو *"أضف ملف style.css"* أو *"اعرض ملفات المستودع ${_targetRepoName}"*`,
          ].filter(l => l !== null).join('\n')

          return res.status(200).json({
            content: _successMsg,
            isWebsite: _isHtml,
            htmlCode: _isHtml ? _generatedContent : undefined,
            cssCode: _isHtml ? extractCssFromHtml(_generatedContent) : undefined,
            jsCode: _isHtml ? extractJsFromHtml(_generatedContent) : undefined,
            webBuilderMeta: _isHtml ? { type: 'landing', style: 'modern', title: _targetRepoName, description: lastUserMessage.slice(0, 100), icon: '🚀' } : undefined,
            githubAction: _isUpdateFile ? 'file-updated' : 'file-created',
            githubRepo: _fullRepo,
            githubFileUrl: `https://github.com/${_fullRepo}/blob/main/${_filePath}`,
            githubPagesUrl: _pagesEnabled ? _pagesUrl : null,
          })
        } catch (_pe) {
          return res.status(200).json({ content: `❌ **خطأ أثناء الرفع:** ${_pe.message}` })
        }
      }
    }
  }

  // ── GITHUB_PAGES_MODE — Autonomous GitHub Pages Deployment (Full Planner) ──
  if (detectGitHubPagesIntent(lastUserMessage)) {
    console.log(`[GITHUB_PAGES_MODE] Activated: "${lastUserMessage.slice(0, 80)}"`)

    const effectiveToken = sanitizeString(req.body.githubToken || '', 300) || process.env.GITHUB_TOKEN || ''
    if (!effectiveToken) {
      return res.status(200).json({
        content: '⚠️ **يجب الاتصال بـ GitHub أولاً**\n\nلنشر موقعك على GitHub Pages:\n1. انقر على زر **"ربط GitHub"** في الأعلى\n2. أو أضف `GITHUB_TOKEN` في أسرار Replit بصلاحية `repo` + `pages`\n\n[احصل على token مجاني](https://github.com/settings/tokens/new?scopes=repo,workflow)',
        githubAction: 'needs-connect',
      })
    }

    // ── Run full planner pipeline ─────────────────────────────────────────────
    const analysis  = plannerAnalyze(lastUserMessage)
    const stepLog   = []
    const onStep    = (s) => {
      stepLog.push(s)
      console.log(`[GITHUB_PAGES_MODE] ${s.label || s.message || '...'}`)
    }

    // ── Step A: Generate project files via AI ──────────────────────────────
    onStep({ step: 'generate', label: `🧠 توليد ملفات ${analysis.siteType}...` })
    let projectFiles = null
    let generatedHtml = ''

    try {
      projectFiles = await buildProjectFiles(analysis, safeGenerateAI)
      generatedHtml = projectFiles.find(f => f.path === 'index.html')?.content || ''
      onStep({ step: 'generate', label: `✅ ${projectFiles.length} ملفات جاهزة`, done: true })
    } catch (genErr) {
      console.warn('[GITHUB_PAGES_MODE] Project builder failed, falling back to single HTML:', genErr.message)
      // Fallback: single-file HTML
      try {
        const PAGES_GEN_SYSTEM = `أنت DZ Agent — مهندس ويب محترف. أنشئ موقع HTML/CSS/JS كاملاً في ملف واحد لـ GitHub Pages.
قواعد:
- HTML5 كامل: <!DOCTYPE html> → </html>
- CSS احترافي مُدمَج في <style> — responsive، mobile-first، animations
- TailwindCSS CDN مسموح: <script src="https://cdn.tailwindcss.com"></script>
- محتوى حقيقي لا Lorem ipsum
- SEO: <title>، <meta description>، Open Graph
- Output: ONLY the complete HTML — zero markdown`
        const pagesAiResult = await safeGenerateAI({
          messages: [
            { role: 'system', content: PAGES_GEN_SYSTEM },
            { role: 'user', content: `أنشئ موقع ${analysis.siteType}:\n${lastUserMessage}` },
          ],
          query: lastUserMessage,
          max_tokens: 8000,
        })
        generatedHtml = extractHtmlFromResponse(pagesAiResult.content || '') || pagesAiResult.content || ''
        if (!generatedHtml || generatedHtml.length < 200) throw new Error('HTML قصير جداً')
        projectFiles = [
          { path: 'index.html', content: generatedHtml },
          { path: '.github/workflows/pages.yml', content: generatePagesWorkflow() },
        ]
        onStep({ step: 'generate', label: `✅ HTML جاهز (fallback)`, done: true })
      } catch (fbErr) {
        console.error('[GITHUB_PAGES_MODE] HTML fallback error:', fbErr.message)
        return res.status(200).json({ content: '⚠️ حدث خطأ أثناء توليد محتوى الموقع. صف الموقع بشكل أوضح وأعد المحاولة.' })
      }
    }

    if (!projectFiles || !projectFiles.length) {
      return res.status(200).json({ content: '⚠️ لم يتمكن النظام من توليد ملفات صالحة. يرجى وصف الموقع بشكل أوضح.' })
    }

    // ── Step B: Deploy via deployProject pipeline ──────────────────────────
    try {
      const deployResult = await ghDeployProject({
        token: effectiveToken,
        analysis,
        projectFiles,
        onStep,
      })

      const cssCode = extractCssFromHtml(generatedHtml)
      const jsCode  = extractJsFromHtml(generatedHtml)

      const replyContent = [
        `✅ **تم النشر على GitHub Pages بنجاح!**`,
        ``,
        `🌐 **الموقع المباشر:** [${deployResult.siteUrl}](${deployResult.siteUrl})`,
        `📦 **المستودع:** [github.com/${deployResult.owner}/${deployResult.repo}](${deployResult.repoUrl})`,
        `👤 **الحساب:** @${deployResult.owner}`,
        ``,
        `> ⏳ **الموقع يُبنى الآن عبر GitHub Actions** — سيكون جاهزاً خلال 1-3 دقائق.`,
        ``,
        `**ماذا تم؟**`,
        `- ✔️ تحليل الطلب ووضع خطة النشر`,
        deployResult.repoReused
          ? `- ♻️ استخدام مستودع "${deployResult.repo}" الموجود`
          : `- ✔️ إنشاء مستودع \`${deployResult.repo}\` على حساب @${deployResult.owner}`,
        `- ✔️ رفع ${deployResult.fileCount} ملفات (HTML + CSS + JS + GitHub Actions workflow)`,
        `- ✔️ تفعيل GitHub Pages تلقائياً`,
        ``,
        `🔗 افتح الرابط بعد دقيقتين: **${deployResult.siteUrl}**`,
      ].join('\n')

      return res.status(200).json({
        content: replyContent,
        isWebsite: true,
        htmlCode: generatedHtml,
        cssCode: cssCode || '',
        jsCode: jsCode || '',
        webBuilderMeta: {
          type: analysis.siteType,
          style: 'modern',
          title: `🚀 ${deployResult.repo} — github.io`,
          description: analysis.description || 'GitHub Pages site',
          icon: '🚀',
        },
        githubPages: {
          siteUrl: deployResult.siteUrl,
          repoUrl: deployResult.repoUrl,
          repo: deployResult.repo,
          owner: deployResult.owner,
          commitSha: deployResult.commitSha,
          pagesEnabled: deployResult.pagesEnabled,
          fileCount: deployResult.fileCount,
        },
      })

    } catch (deployErr) {
      console.error('[GITHUB_PAGES_MODE] Deploy error:', deployErr.message)
      // Reflection: analyze and report what went wrong
      const reflection = plannerReflect('deploy', deployErr, { repoName: analysis.repoName })
      const cssCode = extractCssFromHtml(generatedHtml)
      const jsCode  = extractJsFromHtml(generatedHtml)
      return res.status(200).json({
        content: [
          `⚠️ **تعذّر النشر التلقائي على GitHub Pages**`,
          ``,
          `**السبب:** ${reflection.fix}`,
          `**تفاصيل الخطأ:** \`${deployErr.message}\``,
          ``,
          reflection.retry
            ? `💡 **اقتراح:** ${reflection.fix}\nأعد المحاولة بعد لحظة.`
            : `💡 **بديل:** يمكنك تحميل الموقع من المعاينة وإنشاء المستودع يدوياً.`,
          ``,
          `✅ الموقع تم توليده بنجاح — يمكنك مشاهدته في المعاينة أدناه أو تحميله.`,
        ].join('\n'),
        isWebsite: true,
        htmlCode: generatedHtml,
        cssCode: cssCode || '',
        jsCode: jsCode || '',
        webBuilderMeta: { type: analysis.siteType, style: 'modern', title: analysis.repoName, description: analysis.description, icon: '🌐' },
      })
    }
  }

  // ── WEB_BUILDER_MODE — Website Builder God Mode v6 (with UI Inspiration Search) ──
  // Guard: skip if this was already handled as a Web Reader BUILD mode query
  // Guard: skip if request comes from a DZ Tools tool (planner, bizplan, docs, health, jobs, ocr, cv)
  const _dzToolMode = typeof req.body.tool === 'string' && req.body.tool.length > 0
  if (detectWebsiteBuilderQuery(lastUserMessage) && !(_webReaderIntent === 'build' && isWebReaderQuery) && !_dzToolMode) {
    console.log(`[WEB_BUILDER_MODE] Activated: "${lastUserMessage.slice(0, 80)}"`)
    const wbMeta = extractWebBuilderMeta(lastUserMessage)

    // ── Step 1: Search for real UI inspiration from CodePen, GitHub, Flowbite ──
    // Skip inspiration search — build directly for immediate response (no deep analysis)
    const inspirationBlock = ''

    // ── Step 2: Build enriched user message with metadata hints ──────────────
    const enrichedUserMsg = [
      lastUserMessage,
      `\n[SITE TYPE: ${wbMeta.type} | STYLE: ${wbMeta.style} | TITLE: ${wbMeta.title}]`,
      `[Generate a complete, production-quality ${wbMeta.description}]`,
    ].join('\n')

    // ── Step 3: Generate HTML with up to 2 attempts ───────────────────────────
    const MAX_WB_ATTEMPTS = 2
    let lastHtml = null
    let lastValidation = null

    for (let attempt = 1; attempt <= MAX_WB_ATTEMPTS; attempt++) {
      try {
        const retryNote = attempt > 1
          ? `\n\nATTEMPT ${attempt} — PREVIOUS FAILED: "${lastValidation?.reason}". MANDATORY FIX: output MUST be a SINGLE complete HTML file with <html>, <head>, <style>, <body>, <script>, </html>. NO markdown. NO explanation. HTML ONLY.`
          : ''

        const imagePoolBlock = buildImagePoolBlock(wbMeta.type)
        const systemContent = WEBSITE_BUILDER_SYSTEM_PROMPT + imagePoolBlock + inspirationBlock + retryNote
        const wbMessages = [
          { role: 'system', content: systemContent },
          { role: 'user', content: enrichedUserMsg },
        ]

        const wbResult = await safeGenerateAI({ messages: wbMessages, query: lastUserMessage, max_tokens: 7000, taskHint: 'website' })
        console.log(`[Website Builder v6] model=${wbResult.model || 'null'} | content=${(wbResult.content||'').length}chars | type=${wbMeta.type}`)
        const rawOutput = wbResult.content || ''
        const htmlCode = extractHtmlFromResponse(rawOutput) || rawOutput

        const validation = validateHtmlOutput(htmlCode)
        lastHtml = htmlCode
        lastValidation = validation

        if (validation.ok) {
          console.log(`[WEB_BUILDER_MODE] ✅ OK attempt ${attempt} — ${htmlCode.length} chars — type=${wbMeta.type} — model=${wbResult.model}`)
          const cssCode = extractCssFromHtml(htmlCode)
          const jsCode  = extractJsFromHtml(htmlCode)
          return res.status(200).json({
            content: `✅ **تم إنشاء ${wbMeta.title} بنجاح!**\n\n🚀 **ELITE WEB BUILDER V4.0** — تصميم 2026 بمستوى Vercel · Linear · OpenAI\n✨ Bento Grid · Glassmorphism · Gradient Text · AOS Animations\n\n▶️ انقر **"معاينة مباشرة"** لمشاهدته — أو استخدم **⬇ HTML** و **🗜 ZIP** للتحميل.`,
            isWebsite: true,
            htmlCode,
            cssCode: cssCode || '',
            jsCode:  jsCode  || '',
            webBuilderMeta: wbMeta,
          })
        }

        console.warn(`[Website Builder v6] Attempt ${attempt} failed: ${validation.reason} (${htmlCode.length} chars)`)
        if (attempt < MAX_WB_ATTEMPTS) await new Promise(r => setTimeout(r, 150))
      } catch (err) {
        console.error(`[Website Builder v6] Attempt ${attempt} error:`, err.message)
        if (attempt === MAX_WB_ATTEMPTS) {
          return res.status(200).json({ content: '⚠️ حدث خطأ أثناء توليد الموقع. يرجى المحاولة مرة أخرى.' })
        }
        await new Promise(r => setTimeout(r, 150))
      }
    }

    // All attempts exhausted — return best effort
    if (lastHtml && lastHtml.length > 200) {
      console.warn('[Website Builder v6] All attempts failed — returning best-effort HTML')
      const cssCode = extractCssFromHtml(lastHtml)
      const jsCode  = extractJsFromHtml(lastHtml)
      return res.status(200).json({
        content: `⚠️ **تم توليد الموقع بشكل جزئي** — قد لا يكون مكتملاً. جرّب المعاينة أو التحميل.`,
        isWebsite: true,
        htmlCode: lastHtml,
        cssCode: cssCode || '',
        jsCode:  jsCode  || '',
        webBuilderMeta: wbMeta,
      })
    }
    return res.status(200).json({
      content: '⚠️ لم يتمكن النظام من توليد كود HTML صحيح. يرجى تفصيل طلبك أكثر وإعادة المحاولة.',
    })
  }

  // ── Doctor name search (no specialty needed) ────────────────────────────
  const nameIntent = detectDoctorNameIntent(lastUserMessage)
  if (nameIntent.isNameQuery) {
    const { results, cached } = await multiSearchDoctorsByName({
      name: nameIntent.name,
      userLocation,
    })
    const realDocs = results.filter(r => !r.directoryLink)
    const dirLinks = results.filter(r => r.directoryLink)
    console.log(`[DoctorSearch:byName] name="${nameIntent.name}" real=${realDocs.length} dirs=${dirLinks.length} cached=${cached}`)
    return res.status(200).json({
      richType: 'doctor-results',
      doctors: realDocs,
      dirs: dirLinks,
      byName: true,
      queryName: nameIntent.name,
      speciality: { ar: nameIntent.name, fr: nameIntent.name },
      city: { ar: '', fr: '' },
      hasGps: !!userLocation,
      cached: !!cached,
    })
  }

  const doctorIntent = detectDoctorIntent(lastUserMessage)
  console.log(`[DoctorSearch] isDoctorQuery=${doctorIntent.isDoctorQuery} isDZToolRequest=${isDZToolRequest} speciality=${doctorIntent.speciality?.ar||'—'} city=${doctorIntent.city?.ar||'—'} query="${lastUserMessage.slice(0,60)}"`)
  // Skip doctor search interception for DZTools requests (symptom analyzer prompt contains "طبيب")
  if (!isDZToolRequest && doctorIntent.isDoctorQuery) {
    if (!doctorIntent.speciality && !doctorIntent.city) {
      return res.status(200).json({
        content: [
          '🩺 **نحوس على طبيب؟ راني جايك!**',
          '',
          '**واشنو التخصص اللي تحتاجه؟**',
          '',
          '🦷 `طبيب أسنان` · 🫀 `طبيب قلب` · 🦴 `طبيب عظام` · 👶 `طبيب أطفال`',
          '👁️ `طبيب عيون` · 🌿 `طبيب جلدية` · 🧠 `طبيب نفسي` · 👩‍⚕️ `طبيب نساء`',
          '🩺 `طبيب عام` · 🧬 `طبيب أعصاب` · 🔪 `جراح` · 💧 `طبيب مسالك`',
          '',
          '**وفي أي ولاية؟**',
          '',
          '`عنابة` · `الجزائر` · `وهران` · `قسنطينة` · `سطيف`',
          '`تيزي وزو` · `ورقلة` · `باتنة` · `بجاية` · `بسكرة`',
          '',
          '💡 _مثال: اكتب مباشرة_ **"طبيب أسنان في عنابة"** _أو_ **"دكتور قلب في وهران"**',
          '',
          '_يمكنك أيضاً البحث باسم الطبيب مباشرة: **دكتور محمد بن علي** أو **Dr Ahmed Annaba**_',
        ].join('\n'),
      })
    }
    if (!doctorIntent.speciality) {
      return res.status(200).json({
        content: [
          '🩺 **وضّح لي التخصص اللي تحتاجه:**',
          '',
          '🦷 `طبيب أسنان` · 🫀 `طبيب قلب` · 🦴 `طبيب عظام` · 👶 `طبيب أطفال`',
          '👁️ `طبيب عيون` · 🌿 `طبيب جلدية` · 🧠 `طبيب نفسي` · 👩‍⚕️ `طبيب نساء`',
          '🩺 `طبيب عام` · 🧬 `طبيب أعصاب` · 🔪 `جراح` · 💧 `طبيب مسالك`',
          '',
          '_مثال: **"أسنان في عنابة"** أو **"عظام في وهران"**_',
        ].join('\n'),
      })
    }
    if (!doctorIntent.city) {
      return res.status(200).json({
        content: [
          `🩺 فاهم — تحتاج **طبيب ${doctorIntent.speciality.ar}**.`,
          '',
          '**في أي ولاية؟**',
          '',
          '`عنابة` · `الجزائر العاصمة` · `وهران` · `قسنطينة` · `سطيف`',
          '`تيزي وزو` · `ورقلة` · `باتنة` · `بجاية` · `بسكرة`',
          '`سكيكدة` · `قالمة` · `بومرداس` · `البليدة` · `تلمسان`',
          '',
          `_مثال: اكتب **"طبيب ${doctorIntent.speciality.ar} في سطيف"**_`,
        ].join('\n'),
      })
    }
    const { results, cached } = await multiSearchDoctors({
      speciality: doctorIntent.speciality.search,
      city: doctorIntent.city.fr,
      userLocation,
    })
    const realDocs = results.filter(r => !r.directoryLink)
    const dirLinks = results.filter(r => r.directoryLink)
    const _realCount = realDocs.length
    const _dirCount  = dirLinks.length
    console.log(`[DoctorSearch] results: total=${results.length} real=${_realCount} dirs=${_dirCount} cached=${cached} spec="${doctorIntent.speciality.search}" city="${doctorIntent.city.fr}"`)
    return res.status(200).json({
      richType: 'doctor-results',
      doctors: realDocs,
      dirs: dirLinks,
      speciality: { ar: doctorIntent.speciality.ar, fr: doctorIntent.speciality.search },
      city: { ar: doctorIntent.city.ar, fr: doctorIntent.city.fr },
      hasGps: !!userLocation,
      cached: !!cached,
      dua: 'ربي يجيب الشفاء 🤍\nاللهم اشفي مرضانا ومرضى المسلمين أجمعين يا رب العالمين.',
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

  // ── Natural-language GitHub action dispatch (when a repo is selected) ────
  // Detects intent like: scan / find bugs / security / suggestions / branches
  // / issues / PRs / stats / files even without explicit slash-commands.
  const repoActionTriggers = {
    securityScan: [
      'security audit', 'security scan', 'security check', 'vulnerabilities',
      'فحص امني', 'فحص أمني', 'الفحص الأمني', 'ثغرات', 'تدقيق امني', 'تدقيق أمني',
      'audit de sécurité', 'analyse de sécurité', 'vulnérabilités',
    ],
    bugScan: [
      'find bugs', 'find issues in code', 'detect bugs', 'check for bugs',
      'ابحث عن اخطاء', 'ابحث عن أخطاء', 'اخطاء في الكود', 'أخطاء في الكود',
      'كشف الاخطاء', 'كشف الأخطاء', 'الأخطاء البرمجية',
      'trouve les bugs', 'détecter les bugs', 'erreurs dans le code',
    ],
    suggestImprovements: [
      'suggest improvements', 'improvements', 'optimize code', 'best practices',
      'اقتراحات تحسين', 'اقتراحات للتحسين', 'حسّن الكود', 'تحسينات',
      'افضل الممارسات', 'أفضل الممارسات',
      'suggérer des améliorations', 'optimiser le code', 'meilleures pratiques',
    ],
    fullScan: [
      'scan repo', 'scan the repo', 'scan repository', 'analyze repo', 'analyze repository',
      'review repo', 'review repository', 'audit repo', 'audit repository',
      'افحص المستودع', 'فحص المستودع', 'افحص هذا المستودع', 'افحص الريبو',
      'حلل المستودع', 'تحليل المستودع', 'راجع المستودع', 'مراجعة المستودع',
      'scanner le dépôt', 'analyser le dépôt', 'vérifier le dépôt',
    ],
    listBranches: [
      'list branches', 'show branches', 'all branches',
      'اعرض الفروع', 'قائمة الفروع', 'الفروع',
      'lister les branches', 'montrer les branches',
    ],
    listIssues: [
      'list issues', 'show issues', 'open issues', 'all issues',
      'اعرض المشاكل', 'قائمة المشاكل', 'المشاكل المفتوحة', 'مشاكل المستودع',
      'lister les issues', 'montrer les issues', 'problèmes ouverts',
    ],
    listPulls: [
      'list pull requests', 'show pull requests', 'list prs', 'show prs', 'open prs',
      'اعرض ال pr', 'اعرض pull requests', 'قائمة الـ pr', 'الـ pr المفتوحة',
      'lister les pr', 'montrer les pull requests',
    ],
    repoStats: [
      'repo stats', 'repository stats', 'show stats', 'statistics',
      'إحصائيات المستودع', 'احصائيات المستودع', 'احصائيات الريبو',
      'statistiques du dépôt', 'statistiques',
    ],
    listFiles: [
      'show files', 'list files', 'show structure', 'project structure', 'repo files',
      'اعرض الملفات', 'قائمة الملفات', 'ملفات المستودع', 'هيكل المشروع', 'بنية المشروع',
      'lister les fichiers', 'structure du projet',
    ],
  }

  const matchTrigger = (key) => repoActionTriggers[key].some(p => lowerMsg.includes(p))

  // Smart GitHub Context Guard — explicit repo/github mention required for vague triggers
  const hasGithubContextInMsg = /\bgithub\b|مستودع|مستودعي|الريبو|ريبو\b|\brepo\b|\brepository\b/i.test(lastUserMessage)

  // Block entire GitHub routing for DZTools requests (jobs/health/cv/legal/ocr)
  if (githubToken && !isDZToolRequest) {
    // Specific scans first (more specific wins)
    if (matchTrigger('securityScan')) {
      if (!currentRepo) {
        return res.status(200).json({ action: 'list-repos', content: '🔐 **فحص أمني** — اختر أولاً المستودع الذي تريد فحصه:' })
      }
      return res.status(200).json({ action: 'scan-repo', repo: currentRepo, focus: 'security', content: `🔐 جاري الفحص الأمني للمستودع **${currentRepo}**...` })
    }
    if (matchTrigger('bugScan')) {
      if (!currentRepo) {
        return res.status(200).json({ action: 'list-repos', content: '🐛 **كشف الأخطاء** — اختر أولاً المستودع الذي تريد فحصه:' })
      }
      return res.status(200).json({ action: 'scan-repo', repo: currentRepo, focus: 'bugs', content: `🐛 جاري البحث عن الأخطاء في **${currentRepo}**...` })
    }
    if (matchTrigger('suggestImprovements') && (currentRepo || hasGithubContextInMsg)) {
      if (!currentRepo) {
        return res.status(200).json({ action: 'list-repos', content: '💡 **اقتراحات التحسين** — اختر أولاً المستودع الذي تريد تحسينه:' })
      }
      return res.status(200).json({ action: 'scan-repo', repo: currentRepo, focus: 'suggest', content: `💡 جاري إعداد اقتراحات التحسين لـ **${currentRepo}**...` })
    }
    if (matchTrigger('fullScan')) {
      if (!currentRepo) {
        return res.status(200).json({ action: 'list-repos', content: '🔍 **فحص شامل** — اختر أولاً المستودع الذي تريد فحصه:' })
      }
      return res.status(200).json({ action: 'scan-repo', repo: currentRepo, focus: '', content: `🔍 جاري الفحص الشامل للمستودع **${currentRepo}**...` })
    }
    if (matchTrigger('listBranches')) {
      if (!currentRepo) {
        return res.status(200).json({ content: '🌿 لعرض الفروع، اختر مستودعاً أولاً.' })
      }
      return res.status(200).json({ action: 'list-branches', repo: currentRepo, content: `🌿 جلب فروع **${currentRepo}**...` })
    }
    if (matchTrigger('listIssues')) {
      if (!currentRepo) {
        return res.status(200).json({ content: '📋 لعرض المشاكل (Issues)، اختر مستودعاً أولاً.' })
      }
      return res.status(200).json({ action: 'list-issues', repo: currentRepo, content: `📋 جلب مشاكل **${currentRepo}**...` })
    }
    if (matchTrigger('listPulls')) {
      if (!currentRepo) {
        return res.status(200).json({ content: '🔀 لعرض Pull Requests، اختر مستودعاً أولاً.' })
      }
      return res.status(200).json({ action: 'list-pulls', repo: currentRepo, content: `🔀 جلب Pull Requests لـ **${currentRepo}**...` })
    }
    if (matchTrigger('repoStats')) {
      if (!currentRepo) {
        return res.status(200).json({ content: '📊 لعرض الإحصائيات، اختر مستودعاً أولاً.' })
      }
      return res.status(200).json({ action: 'repo-stats', repo: currentRepo, content: `📊 جلب إحصائيات **${currentRepo}**...` })
    }
    if (matchTrigger('listFiles')) {
      if (!currentRepo) {
        return res.status(200).json({ content: '📂 لعرض الملفات، اختر مستودعاً أولاً.' })
      }
      return res.status(200).json({ action: 'list-files', repo: currentRepo, content: `📂 جلب ملفات **${currentRepo}**...` })
    }

    // ── New AI Coding Actions ────────────────────────────────────────────────
    const analyzeProjectTriggers = [
      'حلل المشروع', 'تحليل المشروع', 'افهم المشروع', 'اشرح المشروع',
      'حلل الكود', 'تحليل الكود', 'تقرير الأخطاء', 'تقرير عن الأخطاء',
      'حلل كودي', 'حلل مستودعي', 'تحليل مستودعي', 'تحليل الكود في مستودعي',
      'ما هو هذا المشروع', 'ما stack', 'ما التقنية', 'ما التبعيات',
      'analyze project', 'analyze code', 'code analysis', 'analyze my code',
      'understand project', 'project overview', 'tech stack', 'code report',
      'analyse le projet', 'comprendre le projet', 'analyser le code',
    ]
    const generateAndPushTriggers = [
      'أنشئ ميزة', 'أنشئ فيتشر', 'أضف ميزة', 'أضف مكوّن', 'أضف صفحة', 'أنشئ ملف',
      'generate feature', 'add feature', 'create feature', 'add page', 'add component',
      'generate and push', 'توليد وpush', 'اكتب وارفع', 'انشئ وارفع',
      'ajouter une fonctionnalité', 'générer et pousser',
    ]
    const improveDesignTriggers = [
      'حسّن التصميم', 'حسن التصميم', 'حسّن الثيم', 'حسن الثيم', 'غيّر الألوان', 'حسّن الواجهة',
      'improve design', 'improve theme', 'redesign', 'better ui', 'modern design', 'update colors',
      'améliorer le design', 'améliorer l\'interface', 'moderniser',
    ]
    const deployVercelTriggers = [
      'انشر على vercel', 'نشر vercel', 'deploy vercel', 'deploy to vercel',
      'انشر المستودع', 'ابني وانشر', 'build and deploy',
      'déployer sur vercel', 'déployer le projet',
      'انشر على github pages', 'نشر github pages', 'deploy github pages',
      'انشر الموقع', 'نشر الموقع', 'نشر على github.io', 'انشر على github.io',
    ]
    const createRepoTriggers = [
      'أنشئ مستودع', 'انشئ مستودع', 'إنشاء مستودع', 'اصنع مستودع',
      'create repo', 'create a repo', 'new repo', 'new repository', 'create repository', 'create a new repo',
      'créer un dépôt', 'créer un repo', 'nouveau dépôt', 'créer le dépôt',
    ]
    const updateFileTriggers = [
      'عدّل ملف', 'عدل ملف', 'حدّث ملف', 'حدث ملف', 'ارفع ملف', 'أنشئ ملف في مستودع',
      'update file', 'upload file', 'push file', 'create file in repo', 'add file to repo',
      'modifier un fichier', 'mettre à jour un fichier', 'pousser un fichier',
    ]
    const deleteBranchTriggers = [
      'احذف فرع', 'احذف الفرع', 'حذف فرع', 'امسح الفرع',
      'delete branch', 'remove branch', 'drop branch',
      'supprimer la branche', 'supprimer un branch',
    ]

    const matchList = (list) => list.some(p => lowerMsg.includes(p.toLowerCase()))

    if (matchList(analyzeProjectTriggers) && (currentRepo || hasGithubContextInMsg)) {
      if (!currentRepo) {
        return res.status(200).json({ action: 'list-repos', content: '🔬 **تحليل الكود** — اختر أولاً المستودع الذي تريد تحليله:' })
      }
      return res.status(200).json({ action: 'analyze-project', repo: currentRepo, content: `🔬 جاري قراءة وتحليل مشروع **${currentRepo}** بالكامل...` })
    }
    if (matchList(generateAndPushTriggers) && (currentRepo || hasGithubContextInMsg)) {
      if (!currentRepo) {
        return res.status(200).json({ action: 'list-repos', content: '⚡ اختر أولاً المستودع الذي تريد إضافة الميزة إليه:' })
      }
      // Extract the feature description (everything after the trigger phrase)
      let description = lastUserMessage
      for (const t of generateAndPushTriggers) {
        const idx = lowerMsg.indexOf(t.toLowerCase())
        if (idx !== -1) { description = lastUserMessage.slice(idx + t.length).trim(); break }
      }
      return res.status(200).json({ action: 'generate-and-push', repo: currentRepo, description: description || lastUserMessage, content: `⚡ جاري توليد الكود لـ **${currentRepo}**...` })
    }
    if (matchList(improveDesignTriggers) && (currentRepo || hasGithubContextInMsg)) {
      if (!currentRepo) {
        return res.status(200).json({ action: 'list-repos', content: '🎨 **تحسين التصميم** — اختر أولاً المستودع الذي تريد تحسينه:' })
      }
      return res.status(200).json({ action: 'improve-design', repo: currentRepo, content: `🎨 جاري تحليل وتحسين تصميم **${currentRepo}**...` })
    }
    if (matchList(deployVercelTriggers)) {
      if (!currentRepo) {
        return res.status(200).json({ action: 'list-repos', content: '🌐 **النشر** — اختر أولاً المستودع الذي تريد نشره:' })
      }
      return res.status(200).json({ action: 'deploy-pages', repo: currentRepo, content: `🌐 جاري النشر على GitHub Pages لـ **${currentRepo}**...` })
    }

    if (matchList(createRepoTriggers)) {
      // Extract repo name from message if provided
      let repoName = ''
      const nameMatch = lastUserMessage.match(/(?:اسمه|اسم|باسم|named?|called?|nommé?)\s+["']?([\w\-\.]+)["']?/i)
        || lastUserMessage.match(/(?:مستودع|repo|dépôt)\s+["']?([\w\-\.]+)["']?/i)
      if (nameMatch) repoName = nameMatch[1].replace(/[^a-zA-Z0-9\-_.]/g, '-').slice(0, 100)

      // Resolve token: user's OAuth token first, then server token
      const effectiveToken = sanitizeString(req.body.githubToken || '', 300) || process.env.GITHUB_TOKEN || ''

      // No token → ask user to connect GitHub
      if (!effectiveToken) {
        return res.status(200).json({
          content: '⚠️ **يجب الاتصال بـ GitHub أولاً**\n\nلإنشاء مستودع، انقر على زر **"ربط GitHub"** في الأعلى للمصادقة بحسابك.\n\nبعد الاتصال، كرر طلبك وسيُنشئ DZ Agent المستودع مباشرةً باسم حسابك الحقيقي.',
          githubAction: 'needs-connect',
        })
      }

      // Token available → fetch real user then create repo directly
      try {
        // 1. Get real GitHub username
        const userRes = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${effectiveToken}`, 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(8000),
        })
        if (!userRes.ok) throw new Error('فشل التحقق من حساب GitHub. تحقق من صلاحية التوكن.')
        const ghUser = await userRes.json()
        const login = ghUser.login

        // 2. Create the repository
        if (!repoName) {
          return res.status(200).json({
            content: `🔧 **اختر اسماً للمستودع**\n\nأنت متصل بـ GitHub كـ **@${login}** ✅\n\nاكتب: *"أنشئ مستودع باسم [اسم-المستودع]"*`,
            githubAction: 'needs-name',
            githubUser: login,
          })
        }

        const createRes = await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: { Authorization: `token ${effectiveToken}`, 'Content-Type': 'application/json', 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/vnd.github+json' },
          body: JSON.stringify({ name: repoName, description: 'Created by DZ Agent 🇩🇿', auto_init: true, private: false }),
          signal: AbortSignal.timeout(15000),
        })
        const repoData = await createRes.json()

        if (!createRes.ok) {
          const errMsg = repoData.errors?.[0]?.message || repoData.message || 'فشل إنشاء المستودع'
          const alreadyExists = errMsg.toLowerCase().includes('already exists') || createRes.status === 422
          return res.status(200).json({
            content: alreadyExists
              ? `⚠️ **المستودع موجود مسبقاً**\n\n**${login}/${repoName}** موجود بالفعل في حسابك.\n\n🔗 [افتح المستودع](https://github.com/${login}/${repoName})`
              : `❌ **فشل إنشاء المستودع**\n\n${errMsg}`,
          })
        }

        console.log(`[GitHub] ✅ Created repo: ${repoData.full_name} by @${login}`)
        return res.status(200).json({
          content: `✅ **تم إنشاء المستودع بنجاح!**\n\n📦 **${repoData.full_name}**\n👤 الحساب: [@${login}](${ghUser.html_url})\n🔗 [افتح المستودع](${repoData.html_url})\n📋 Clone: \`git clone ${repoData.clone_url}\`\n🌿 الفرع الرئيسي: \`${repoData.default_branch}\`\n\nيمكنك الآن رفع ملفات بقول: *"ارفع ملف index.html"*`,
          githubAction: 'repo-created',
          githubRepo: repoData.full_name,
          githubUrl: repoData.html_url,
          githubUser: login,
        })
      } catch (err) {
        console.error('[GitHub] create-repo in chat error:', err.message)
        return res.status(200).json({
          content: `❌ **خطأ في إنشاء المستودع**\n\n${err.message}\n\nتأكد أن:\n- حسابك متصل بـ GitHub\n- التوكن له صلاحية \`repo\``,
        })
      }
    }

    if (matchList(updateFileTriggers)) {
      if (!currentRepo) {
        return res.status(200).json({ content: '📝 لتعديل ملف، اختر مستودعاً أولاً. اطلب: "اعرض مستودعاتي".' })
      }
      const pathMatch = lastUserMessage.match(/["']([^"']+\.[a-zA-Z0-9]+)["']/)
        || lastUserMessage.match(/ملف\s+([\w/\-.]+\.[a-zA-Z0-9]+)/i)
        || lastUserMessage.match(/file\s+([\w/\-.]+\.[a-zA-Z0-9]+)/i)
      const filePath = pathMatch ? pathMatch[1] : ''
      return res.status(200).json({
        action: 'update-file',
        repo: currentRepo,
        filePath: filePath || '',
        content: filePath
          ? `📝 جاري تحضير تعديل الملف **${filePath}** في **${currentRepo}**...`
          : `📝 اختر الملف من القائمة لتعديله في **${currentRepo}**`,
      })
    }

    if (matchList(deleteBranchTriggers)) {
      if (!currentRepo) {
        return res.status(200).json({ content: '🗑️ لحذف فرع، اختر مستودعاً أولاً. اطلب: "اعرض مستودعاتي".' })
      }
      const branchMatch = lastUserMessage.match(/(?:فرع|branch)\s+["']?([\w\-/.]+)["']?/i)
      const branchName = branchMatch ? branchMatch[1] : ''
      return res.status(200).json({
        action: 'delete-branch',
        repo: currentRepo,
        branch: branchName || '',
        content: branchName
          ? `🗑️ هل تريد حذف الفرع **${branchName}** من **${currentRepo}**؟ قل "نعم" للتأكيد.`
          : `🗑️ اعرض الفروع أولاً باستخدام: "اعرض الفروع"، ثم اطلب حذف الفرع بالاسم.`,
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GITHUB WRITE CATCH-ALL — آخر خط دفاع قبل الـ AI العام
  // يُفعَّل عندما: token + currentRepo موجودان + نية كتابة/تعديل واضحة
  // يحوّل الطلب مباشرة لـ generate-and-push بدل ترك الـ AI يكذب
  // ═══════════════════════════════════════════════════════════════════════
  if (githubToken && currentRepo && !isDZToolRequest) {
    const _writeIntentPatterns = [
      // عربي
      /أنش[إئ]|انش[إئ]|اصنع|اكتب|أضف|أنشئ|اعمل|ارفع|اعمل لي|أنشئ لي/,
      /عدّل|حدّث|غيّر|أصلح|صلّح|طوّر|حسّن|أضف ميزة|أضف قسم|أضف صفحة/,
      /ملف|صفحة|موقع|مكون|component|feature|ميزة|وظيفة|function|class/,
      /commit|push|رفع|ارفع|دفع|save|حفظ|اضغط/,
      // إنجليزي
      /create|generate|add|write|build|make|implement|push|commit|update|edit|fix/,
      // فرنسي
      /créer|générer|ajouter|écrire|construire|modifier|mettre à jour|pousser/,
    ]
    const _hasWriteIntent = _writeIntentPatterns.some(p => p.test(lastUserMessage))
    const _hasFileRef = /\.(html|css|js|ts|tsx|jsx|py|json|md|yml|yaml|txt|sh|sql|php|rb|go|rs|java|cpp|c)\b/i.test(lastUserMessage)
      || /ملف|صفحة|موقع|page|file|component|مكون|function|class/i.test(lastUserMessage)

    // Guard: skip write routing for explanation/question requests — they should go to normal AI
    const _isExplanationRequest = /^(اشرح|explain\b|what is\b|what are\b|ما هو|ما هي|كيف تعمل|كيف يعمل|how does\b|how do\b|pourquoi|comment fonctionne|لماذا|ما معنى|ما الفرق|مقارنة بين|compare\b|difference between)/i.test(lastUserMessage.trim())

    if (_hasWriteIntent && _hasFileRef && !_isExplanationRequest) {
      console.log(`[GH:WriteGateway] Routing to generate-and-push: repo=${currentRepo} msg="${lastUserMessage.slice(0, 60)}"`)
      return res.status(200).json({
        action: 'generate-and-push',
        repo: currentRepo,
        description: lastUserMessage,
        content: `⚡ **DZ Agent** — جاري توليد الكود ورفعه إلى **${currentRepo}**...\n\n🧠 تحليل الطلب...\n📝 توليد الملفات...\n🚀 رفع إلى GitHub...`,
      })
    }

    // If clear intent to push something with no file ref — still route
    const _strongPushIntent = /(?:أنش[إئ]|انش[إئ]|اصنع|generate|create|build|اعمل)\s+(?:موقع|مشروع|project|website|app|تطبيق|portfolio|landing)/i.test(lastUserMessage)
    if (_strongPushIntent) {
      console.log(`[GH:WriteGateway] Strong push intent: repo=${currentRepo}`)
      return res.status(200).json({
        action: 'generate-and-push',
        repo: currentRepo,
        description: lastUserMessage,
        content: `⚡ **DZ Agent** — جاري بناء المشروع ورفعه إلى **${currentRepo}**...\n\n🧠 تحليل الطلب...\n📐 تصميم الهيكل...\n📝 توليد الملفات...\n🚀 رفع إلى GitHub...`,
      })
    }
  }

  // (general code request handled by AI with CODE_RULES context — no explicit routing needed)

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
  // ── Intent Detection: detect ALL data needs up front (Task 12) ─────────────
  const hasWeatherPriority = dashboardContext?.priority === 'weather' || lowerMsg.includes('context: weather_priority') || isWeatherQuery

  const prayerKeywords = [
    'مواقيت الصلاة', 'وقت الصلاة', 'أوقات الصلاة', 'موعد الصلاة', 'الآذان',
    'الفجر','الظهر','العصر','المغرب','العشاء',
    'prayer times', 'prayer time', 'salat', 'salah times', 'azan', 'adhan',
  ]
  const isPrayerQuery = prayerKeywords.some(k => lowerMsg.includes(k))
  const isLFPQuery = detectLFPQuery(lastUserMessage)
  const isCurrencyQuery = detectCurrencyQuery(lastUserMessage)
  const isFootballQuery = detectFootballQuery(lastUserMessage)

  // Standings detection keywords (ترتيب + global + classement)
  const standingsKeywords = [
    'ترتيب الدوري', 'جدول الترتيب', 'جدول الدوري', 'الترتيب الحالي',
    'كم نقطة', 'نقاط الدوري', 'المركز الأول', 'الصدارة', 'المتصدر',
    'standings', 'classement', 'league table', 'points table',
    'ترتيب LFP', 'ترتيب الرابطة', 'ترتيب الفريق',
  ]
  const isStandingsQuery = standingsKeywords.some(k => lowerMsg.includes(k))

  // Global leagues detection keywords
  const globalLeaguesKeywords = [
    'بريميرليغ', 'premier league', 'ليغا', 'la liga', 'الدوري الإسباني',
    'بوندسليغا', 'bundesliga', 'سيريا', 'serie a', 'ليغ 1', 'ligue 1',
    'دوري أبطال أوروبا', 'champions league', 'تشامبيونز', 'europa league',
    'الدوري الإنجليزي', 'الدوري الفرنسي', 'الدوري الإيطالي', 'الدوري الألماني',
    'الدوريات الأوروبية', 'الدوريات العالمية', 'مباريات اليوم في أوروبا',
  ]
  const isGlobalLeaguesQuery = globalLeaguesKeywords.some(k => lowerMsg.includes(k))

  // ── PARALLEL context fetching (Tasks 12+16 — fast, resilient) ────────────
  const weatherCity = sanitizeString(dashboardContext?.city || detectCityFromQuery(lastUserMessage), 80)
  const today = new Date().toISOString().split('T')[0]

  const [
    weatherResult,
    prayerResult,
    lfpResult,
    currencyResult,
    footballResult,
    standingsResult,
    globalLeaguesResult,
  ] = await Promise.allSettled([
    hasWeatherPriority ? fetchCityWeatherResilient(weatherCity) : Promise.resolve(null),
    isPrayerQuery ? fetchPrayerTimesAladhan(detectCityFromQuery(lastUserMessage)) : Promise.resolve(null),
    isLFPQuery ? fetchLFPData() : Promise.resolve(null),
    isCurrencyQuery ? fetchCurrencyData() : Promise.resolve(null),
    (isFootballQuery && !isLFPQuery) ? Promise.allSettled([fetchSofaScoreFootball(today), fetchMultipleFeeds(INTL_FOOTBALL_FEEDS)]) : Promise.resolve(null),
    isStandingsQuery ? fetchAlgerianStandings() : Promise.resolve(null),
    // Use jdwel.com (same source as the card) with SofaScore as a fallback
    isGlobalLeaguesQuery ? Promise.allSettled([fetchJdwelMatches(), fetchSofaScoreFootball(today)]) : Promise.resolve(null),
  ])

  // ── Build context strings from parallel results ────────────────────────────

  // Weather context (Task 11: API-free via open-meteo/wttr.in)
  if (hasWeatherPriority) {
    if (weatherResult.status === 'fulfilled' && weatherResult.value) {
      const w = weatherResult.value
      weatherPriorityContext = [
        `context: weather_priority`,
        `city: ${w.city}`,
        `| العنصر | القيمة |`,
        `|---|---|`,
        `| 🌡️ درجة الحرارة | ${w.temp}°C (تشعر بـ ${w.feels_like}°C) |`,
        `| 🌡️ الحد الأدنى / الأقصى | ${w.temp_min}°C / ${w.temp_max}°C |`,
        `| 📊 الحالة | ${w.condition} |`,
        `| 💧 الرطوبة | ${w.humidity ?? '—'}% |`,
        `| 💨 الرياح | ${w.wind ?? '—'} كم/س |`,
        `| 👁️ الرؤية | ${w.visibility ?? '—'} كم |`,
        `source: ${w.source || 'open-meteo.com'}`,
        w.status === 'stale' ? `⚠️ بيانات مؤقتة — منذ ${w.staleAgeMin} دقيقة` : '',
      ].filter(Boolean).join('\n')
    } else {
      weatherPriorityContext = `context: weather_priority\nfallback: تعذّر جلب بيانات الطقس من جميع المصادر. يرجى التحقق يدوياً.`
    }
  }

  // Prayer context
  let prayerContext = ''
  if (isPrayerQuery && prayerResult.status === 'fulfilled' && prayerResult.value) {
    const prayerData = prayerResult.value
    const times = Object.entries(prayerData.times).map(([name, time]) => `• ${name}: ${time}`).join('\n')
    prayerContext = `\n\n--- 🕌 مواقيت الصلاة في ${detectCityFromQuery(lastUserMessage)} — ${prayerData.date} ---\n${times}\n(المصدر: ${prayerData.source})\n---`
  }

  // LFP context
  let lfpContext = ''
  if (isLFPQuery) {
    const lfpData = lfpResult.status === 'fulfilled' ? lfpResult.value : null
    if (lfpData && (lfpData.matches.length > 0 || lfpData.articles.length > 0)) {
      console.log('[DZ Agent] LFP query — injecting live data from lfp.dz')
      const fetchDate = lfpData.fetchedAt ? new Date(lfpData.fetchedAt).toLocaleString('ar-DZ') : ''
      lfpContext = `\n\n--- ⚽ الرابطة الجزائرية المحترفة (LFP) — المصدر: lfp.dz — ${fetchDate} ---\n`
      const played = lfpData.matches.filter(m => m.played)
      const upcoming = lfpData.matches.filter(m => !m.played)
      if (played.length > 0) {
        lfpContext += `\n**نتائج المباريات:**\n`
        for (const m of played) {
          lfpContext += `• ${m.round}: ${m.home} **${m.homeScore} - ${m.awayScore}** ${m.away}`
          if (m.date) lfpContext += ` (${m.date})`
          if (m.link) lfpContext += ` — [التفاصيل](${m.link})`
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
          if (a.link) lfpContext += ` — [اقرأ المزيد](${a.link})`
          lfpContext += '\n'
        }
      }
      lfpContext += '\n---'
    }
  }

  // Currency context (Task 11: API-free via fawazahmed0 CDN)
  let currencyContext = ''
  if (isCurrencyQuery) {
    const currData = currencyResult.status === 'fulfilled' ? currencyResult.value : null
    if (currData) {
      console.log(`[DZ Agent] Currency — injecting ${Object.keys(currData.rates).length} pairs from ${currData.provider}`)
      currencyContext = buildCurrencyContext(currData)
    }
  }

  // Football context
  let footballContext = ''
  if (isFootballQuery && !isLFPQuery && footballResult.status === 'fulfilled' && footballResult.value) {
    const [sfResult2, rssResult2] = footballResult.value
    const sfData = sfResult2?.status === 'fulfilled' ? sfResult2.value : null
    const rssData = rssResult2?.status === 'fulfilled' ? rssResult2.value : []
    if (sfData || rssData?.length > 0) {
      footballContext = buildFootballContext(sfData, rssData || [], today)
      console.log(`[DZ Agent] Football context built: SofaScore=${!!sfData}, RSS=${rssData?.length ?? 0} feeds`)
    }
  }

  // ── NEW: Standings context injection ─────────────────────────────────────
  let standingsContext = ''
  if (isStandingsQuery) {
    const stData = standingsResult.status === 'fulfilled' ? standingsResult.value : null
    if (stData?.standings?.length > 0) {
      console.log(`[DZ Agent] Standings — injecting ${stData.standings.length} teams from ${stData.source}`)
      standingsContext = `\n\n--- 🏆 جدول ترتيب الدوري الجزائري المحترف — المصدر: ${stData.source} — ${new Date(stData.fetchedAt).toLocaleString('ar-DZ')} ---\n`
      standingsContext += `\n| # | الفريق | ل | ف | ت | خ | ن |\n|---|--------|---|---|---|---|---|\n`
      for (const row of stData.standings.slice(0, 20)) {
        standingsContext += `| ${row.rank} | ${row.team} | ${row.played} | ${row.wins} | ${row.draws} | ${row.losses} | **${row.points}** |\n`
      }
      standingsContext += `\nملاحظة: ل=لعب، ف=فوز، ت=تعادل، خ=خسارة، ن=نقاط\n---`
    } else {
      standingsContext = `\n\n--- 🏆 جدول الترتيب ---\nتعذّر جلب جدول الترتيب حالياً. يرجى التحقق من kooora.com أو lfp.dz.\n---`
    }
  }

  // ── Global Leagues context injection — PRIMARY: jdwel.com (matches the card) ──
  let globalLeaguesContext = ''
  if (isGlobalLeaguesQuery) {
    const settled = globalLeaguesResult.status === 'fulfilled' ? globalLeaguesResult.value : null
    const jdwelData = settled && settled[0]?.status === 'fulfilled' ? settled[0].value : null
    const sfData    = settled && settled[1]?.status === 'fulfilled' ? settled[1].value : null

    const formatJdwelMatch = (m) => {
      const t = m.startTime || ''
      if (m.statusType === 'inprogress') return `🔴 **${m.homeScore ?? 0} - ${m.awayScore ?? 0}** (مباشر${t ? ` ${t}` : ''})`
      if (m.statusType === 'finished')   return `✅ **${m.homeScore ?? 0} - ${m.awayScore ?? 0}**`
      return `(${t || 'قادمة'})`
    }

    if (jdwelData?.groups?.length > 0) {
      console.log(`[DZ Agent] Global leagues — injecting ${jdwelData.totalMatches} matches across ${jdwelData.groups.length} leagues from jdwel.com`)
      const fetchTime = jdwelData.fetchedAt ? new Date(jdwelData.fetchedAt).toLocaleString('ar-DZ') : ''
      globalLeaguesContext = `\n\n--- 🌍 الدوريات العالمية — ${today} (المصدر: jdwel.com — ${fetchTime}) ---\n`
      for (const g of jdwelData.groups.slice(0, 10)) {
        globalLeaguesContext += `\n**🏟️ ${g.name}:**\n`
        for (const m of g.matches.slice(0, 6)) {
          globalLeaguesContext += `• ${m.homeTeam} ${formatJdwelMatch(m)} ${m.awayTeam}`
          if (m.link) globalLeaguesContext += ` — ${m.link}`
          globalLeaguesContext += '\n'
        }
      }
      globalLeaguesContext += `\n*المصدر الرسمي: ${jdwelData.sourceUrl || 'https://jdwel.com/today/'}*\n---`
    } else if (sfData?.matches?.length > 0) {
      console.log(`[DZ Agent] Global leagues — jdwel unavailable, falling back to SofaScore (${sfData.matches.length} matches)`)
      // Group by competition
      const leagueMap = {}
      for (const m of sfData.matches) {
        const comp = m.competition || m.country || 'بطولة دولية'
        if (!leagueMap[comp]) leagueMap[comp] = []
        leagueMap[comp].push(m)
      }
      globalLeaguesContext = `\n\n--- 🌍 الدوريات العالمية — ${today} (المصدر الاحتياطي: SofaScore) ---\n`
      for (const [league, matches] of Object.entries(leagueMap).slice(0, 8)) {
        globalLeaguesContext += `\n**${league}:**\n`
        for (const m of matches.slice(0, 5)) {
          const score = m.statusType === 'notstarted'
            ? `(${m.startTime || 'قادمة'})`
            : m.statusType === 'inprogress'
              ? `🔴 **${m.homeScore} - ${m.awayScore}** (مباشر)`
              : `✅ **${m.homeScore} - ${m.awayScore}**`
          globalLeaguesContext += `• ${m.homeTeam} ${score} ${m.awayTeam}\n`
        }
      }
      globalLeaguesContext += '\n*ملاحظة: المصدر الأساسي jdwel.com غير متاح حالياً — تم استخدام SofaScore كاحتياط.*\n---'
    } else {
      globalLeaguesContext = `\n\n--- 🌍 الدوريات العالمية ---\nتعذّر جلب بيانات المباريات العالمية حالياً من jdwel.com أو SofaScore. يرجى المحاولة لاحقاً أو زيارة: https://jdwel.com/today/\n---`
    }
  }

  // ── RSS News/Sports detection and fetch ───────────────────────────────────
  let rssContext = ''
  const newsQueryType = detectNewsQuery(lastUserMessage)
  // Extract specific subject/entity from the query (e.g. "رياض محرز" from "آخر الأخبار عن رياض محرز")
  const newsSubject = extractNewsSubject(lastUserMessage)
  if (newsSubject) console.log(`[DZ Agent] News subject extracted: "${newsSubject}"`)

  // Allow RSS for football NEWS queries (e.g. "أخبار المنتخب") — not just match-score queries
  const _isFootballNewsQuery = isFootballQuery && /أخبار|خبر|آخر أخبار|جديد|عاجل|news|latest|المنتخب.*أخبار|أخبار.*المنتخب/i.test(lastUserMessage)
  if (newsQueryType && !isPrayerQuery && (!isFootballQuery || _isFootballNewsQuery)) {
    console.log(`[DZ Agent] News query detected: ${newsQueryType} (footballNews=${_isFootballNewsQuery})`)

    // ── TARGETED SEARCH: if a specific subject is detected, search GN-RSS for it directly ──
    if (newsSubject) {
      try {
        const isArabic = /[\u0600-\u06FF]/.test(newsSubject)
        const lang = isArabic ? 'ar' : 'en'
        // Use fresh URL with after: operator (30 days) for targeted subject search
        const targetedRssUrl = buildFreshGNRssUrl(newsSubject, lang, 30)
        const targetedArticles = await searchGoogleNewsRSS(targetedRssUrl)
        if (targetedArticles.length > 0) {
          const date = new Date().toLocaleDateString('ar-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          let targeted = `\n\n--- 🎯 أخبار خاصة بـ "${newsSubject}" — ${date} ---\n`
          for (const art of targetedArticles.slice(0, 15)) {
            const title = art.title || art.headline || ''
            const url = art.link || art.url
            const src = art.source || 'المصدر'
            targeted += `• ${title}`
            if (url) targeted += ` — [${src}](${url})`
            targeted += '\n'
          }
          targeted += '\n---\n'
          rssContext = targeted
          console.log(`[DZ Agent] Targeted GN-RSS: ${targetedArticles.length} articles for "${newsSubject}"`)
        }
      } catch (err) {
        console.error('[DZ Agent] Targeted GN-RSS search failed:', err.message)
      }
    }

    // ── GENERAL RSS FEEDS: fetch and filter by subject if one was detected ──
    let feedsToFetch = []
    if (newsQueryType === 'sports') feedsToFetch = RSS_FEEDS.sports
    else if (newsQueryType === 'news') feedsToFetch = RSS_FEEDS.national
    else feedsToFetch = [...RSS_FEEDS.national, ...RSS_FEEDS.sports]

    const feedResults = await fetchMultipleFeeds(feedsToFetch)
    if (feedResults.length > 0) {
      // Pass newsSubject so buildRSSContext filters articles to only those mentioning the subject
      const generalCtx = buildRSSContext(feedResults, newsQueryType, newsSubject)
      if (generalCtx) {
        rssContext = rssContext ? rssContext + generalCtx : generalCtx
        console.log(`[DZ Agent] RSS fetched: ${feedResults.length} sources, context length: ${rssContext.length}`)
      }
    }

    // ── GN-RSS ADD-ON: augment with general Google News RSS only when no specific subject ──
    if (!newsSubject && (newsQueryType === 'news' || newsQueryType === 'both')) {
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
  let hasNewsResults = false
  const isSimpleGreeting = /^(مرحبا|سلام|هلا|hi|hello|hey|bonjour|salut|كيف حالك|كيف الحال)[\s!؟?]*$/i.test(lastUserMessage.trim())
  const msgIntent = detectQueryIntent(lastUserMessage)
  const isFootballNewsQuery = _isFootballNewsQuery
  const skipSearch = isPrayerQuery || (isFootballQuery && !isFootballNewsQuery) || isLFPQuery || isSimpleGreeting || lastUserMessage.length < 6

  if (!skipSearch) {
    try {
      // If a specific subject was extracted (e.g. "رياض محرز"), use it as the search query
      // so CSE and GN-RSS search precisely for that subject rather than the full sentence
      const retrievalQuery = newsSubject || lastUserMessage
      const { cseQuery, rssQuery, enQuery } = buildOptimizedQueries(retrievalQuery, msgIntent)
      const mustSearch = msgIntent.isTemporal
        || ['news','sports','economy','politics','tech','celebrities','incidents'].includes(msgIntent.primary)
        || msgIntent.all.some(i => ['celebrities','incidents','news','politics'].includes(i))
        || !!newsQueryType

      console.log(`[DZ Retrieval] Query: "${cseQuery}" | subject="${newsSubject || ''}" | intent=${msgIntent.primary} temporal=${msgIntent.isTemporal} mustSearch=${mustSearch}`)

      // Parallel: Google CSE + Google News RSS (always for temporal/news) + legacy web fallback
      const [cseRes, gnRssRes, legacyRes] = await Promise.allSettled([
        searchGoogleCSE(cseQuery),
        (mustSearch || newsQueryType) ? searchGoogleNewsRSS(rssQuery) : Promise.resolve([]),
        (!newsQueryType || msgIntent.primary === 'general') ? searchWeb(lastUserMessage) : Promise.resolve({ results: [] }),
      ])

      const cseResults  = cseRes.status === 'fulfilled' ? cseRes.value : []
      const gnResults   = gnRssRes.status === 'fulfilled' ? gnRssRes.value : []
      const legacyData  = legacyRes.status === 'fulfilled' ? legacyRes.value : { results: [] }

      console.log(`[DZ Retrieval] Raw results: CSE=${cseResults.length} GN=${gnResults.length} legacy=${(legacyData.results||[]).length}`)
      if (cseResults.length > 0) console.log(`[DZ Retrieval] CSE URLs: ${cseResults.slice(0,3).map(r => r.url).join(' | ')}`)
      if (gnResults.length > 0) console.log(`[DZ Retrieval] GN URLs: ${gnResults.slice(0,3).map(r => r.url || r.link).join(' | ')}`)

      // Merge + score + deduplicate
      const allSearchResults = [...cseResults, ...gnResults, ...(legacyData.results || [])]
      const seenUrls = new Set()
      const uniqueResults = allSearchResults.filter(r => {
        const key = (r.url || r.link || '').split('?')[0]
        if (!key || seenUrls.has(key)) return false
        seenUrls.add(key)
        return true
      })

      let scoredResults = uniqueResults.map(r => ({
        ...r, _score: scoreResult(r, lastUserMessage)
      })).sort((a, b) => b._score - a._score).slice(0, 8)

      // Staleness re-search: if mustSearch and ALL top results are > 14 days old, try broader query
      if (mustSearch && scoredResults.length > 0) {
        const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000
        const allStale = scoredResults.every(r => {
          const d = r.date || r.pubDate || r.publishedDate
          if (!d) return true
          const ts = new Date(d).getTime()
          return isNaN(ts) || ts < fourteenDaysAgo
        })
        if (allStale) {
          console.warn(`[DZ Retrieval] All results stale (> 14 days) — forcing re-search with broader query`)
          const broaderQuery = newsSubject || lastUserMessage
          const isArabicQ = /[\u0600-\u06FF]/.test(broaderQuery)
          const [freshCse, freshGn] = await Promise.allSettled([
            searchGoogleCSE(broaderQuery),
            searchGoogleNewsRSS(buildFreshGNRssUrl(broaderQuery, isArabicQ ? 'ar' : 'en', 30)),
          ])
          const freshResults = [
            ...(freshCse.status === 'fulfilled' ? freshCse.value : []),
            ...(freshGn.status === 'fulfilled' ? freshGn.value : []),
          ]
          if (freshResults.length > 0) {
            const freshScored = freshResults.map(r => ({ ...r, _score: scoreResult(r, lastUserMessage) }))
              .sort((a, b) => b._score - a._score).slice(0, 8)
            scoredResults = freshScored
            console.log(`[DZ Retrieval] Re-search returned ${freshResults.length} results`)
          }
        }
      }

      // Log the final selected results with timestamps
      if (scoredResults.length > 0) {
        console.log(`[DZ Retrieval] Selected top-${scoredResults.length} results:`)
        scoredResults.slice(0, 3).forEach((r, i) => {
          const date = r.date || r.pubDate || r.publishedDate || 'no-date'
          console.log(`  [${i+1}] score=${r._score} date=${date} url=${r.url || r.link}`)
        })
      }

      if (scoredResults.length > 0) {
        const sourceTag = cseResults.length > 0 ? '🔍 Google CSE' : gnResults.length > 0 ? '📡 Google News RSS' : '🌐 Web'

        // Sort by date descending (newest first) for temporal ordering
        const now_ms = Date.now()
        const ONE_DAY = 24 * 60 * 60 * 1000
        const ONE_WEEK = 7 * ONE_DAY
        const ONE_MONTH = 30 * ONE_DAY

        function getResultAgeMs(r) {
          const d = r.date || r.pubDate || r.publishedDate
          if (!d) return Infinity
          const t = new Date(d).getTime()
          return isNaN(t) ? Infinity : now_ms - t
        }

        // Sort by date (freshest first), fall back to score
        const temporallySorted = [...scoredResults].sort((a, b) => {
          const ageA = getResultAgeMs(a)
          const ageB = getResultAgeMs(b)
          if (ageA === Infinity && ageB === Infinity) return b._score - a._score
          if (ageA === Infinity) return 1
          if (ageB === Infinity) return -1
          return ageA - ageB
        })

        // Group into temporal buckets
        const buckets = { today: [], week: [], month: [], older: [] }
        for (const r of temporallySorted) {
          const age = getResultAgeMs(r)
          if (age <= ONE_DAY) buckets.today.push(r)
          else if (age <= ONE_WEEK) buckets.week.push(r)
          else if (age <= ONE_MONTH) buckets.month.push(r)
          else buckets.older.push(r)
        }

        function formatResult(r, idx) {
          const rawDate = r.date || r.pubDate || r.publishedDate
          const dateStr = rawDate ? new Date(rawDate).toLocaleDateString('ar-DZ', { day: 'numeric', month: 'long' }) : ''
          const url = r.url || r.link || ''
          const label = getSourceLabel(url, r.source)
          // Remove source suffix from title (Google News format: "Title - Source")
          let cleanTitle = (r.title || '').replace(/\s*[-–—]\s*[^-–—]+$/, '').trim() || r.title || ''
          // Source title only as clickable link — no raw URLs
          const sourceLink = url ? `[${label}](${url})` : label
          return `• ${cleanTitle}${dateStr ? ` _(${dateStr})_` : ''} — ${sourceLink}`
        }

        const sections = []
        let idx = 1
        if (buckets.today.length)  { sections.push(`🟢 **الأحدث (اليوم / آخر 24 ساعة)**\n${buckets.today.map(r => formatResult(r, idx++)).join('\n\n')}`) }
        if (buckets.week.length)   { sections.push(`🟡 **هذا الأسبوع**\n${buckets.week.map(r => formatResult(r, idx++)).join('\n\n')}`) }
        if (buckets.month.length)  { sections.push(`🟠 **هذا الشهر**\n${buckets.month.map(r => formatResult(r, idx++)).join('\n\n')}`) }
        if (buckets.older.length)  { sections.push(`⚫ **أقدم (للسياق فقط)**\n${buckets.older.map(r => formatResult(r, idx++)).join('\n\n')}`) }

        const lines = sections.length > 0 ? sections.join('\n\n') : temporallySorted.map((r, i) => formatResult(r, i+1)).join('\n\n')
        webSearchContext = `${sourceTag} | مرتبة زمنياً من الأحدث للأقدم\n\n${lines}`
        hasNewsResults = true
        console.log(`[DZ Retrieval] Chat: CSE=${cseResults.length} GN=${gnResults.length} legacy=${(legacyData.results||[]).length} scored=${scoredResults.length} today=${buckets.today.length} week=${buckets.week.length} month=${buckets.month.length} older=${buckets.older.length}`)
      } else if (mustSearch) {
        webSearchContext = `⚠️ لا توجد نتائج حديثة مؤكدة من المصادر المتاحة. يرجى الرجوع إلى مصادر موثوقة مثل BBC أو Reuters أو الجزيرة.`
        console.log('[DZ Retrieval] No results found for mandatory search')
      }
    } catch (err) { console.error('[DZ Agent] Retrieval error:', err.message) }
  }

  // ── AI response with GitHub-aware system prompt ───────────────────────────

  // Build compact QUERY UNDERSTANDING block (token-efficient single line)
  const queryAnalysisBlock = queryAnalysis ? (() => {
    const parts = [
      `[QUERY_ANALYSIS`,
      `type=${queryAnalysis.questionType}`,
      queryAnalysis.subject   ? `subject="${queryAnalysis.subject}"` : '',
      queryAnalysis.timeframe ? `time=${queryAnalysis.timeframe}` : '',
      `format=${queryAnalysis.expectedFormat}`,
      `lang=${queryAnalysis.lang}`,
      queryAnalysis.confidence !== 'low' && queryAnalysis.subject
        ? `focus=subject`
        : 'focus=general',
      queryAnalysis.suggestions?.length
        ? `suggest:${queryAnalysis.suggestions.join(' · ')}`
        : '',
      `]`,
    ].filter(Boolean)

    return [
      `🧠 QUERY: ${parts.join(' | ')}`,
      queryAnalysis.subject
        ? `→ Focus strictly on "${queryAnalysis.subject}". End reply with: 💡 قد يهمك أيضاً: ${queryAnalysis.suggestions?.join(' / ')}`
        : `→ General query. End reply with: 💡 قد يهمك أيضاً: ${queryAnalysis.suggestions?.join(' / ')}`,
    ].join('\n')
  })() : ''

  const invocationInstruction = invocationMode === '@dz-gpt'
    ? 'وضع الاستدعاء الحالي: @dz-gpt — أجب كمساعد DZ GPT عام للشرح والكتابة والتفكير، بدون فرض قالب الأخبار إلا إذا كان السؤال حديثاً.'
    : invocationMode === '/github'
      ? 'وضع الاستدعاء الحالي: /github — ركّز على GitHub والكود والمستودعات والإجراءات البرمجية.'
      : 'وضع الاستدعاء الحالي: @dz-agent — ركّز على البحث الحي والخدمات الجزائرية وGitHub عند الحاجة.'

  const _yearNow = getCurrentYear()
  const _todayHuman = getCurrentDateString('ar-DZ')
  const _qType = queryAnalysis?.questionType || 'general'
  const _isCode      = ['code'].includes(_qType) || !!githubToken
  const _isEdu       = _qType === 'education'
  const _isSports    = ['sports', 'sports_news'].includes(_qType)
  const _isNews      = ['news', 'sports_news'].includes(_qType)
  const _isAdmin     = ['admin', 'howto'].includes(_qType)
  const _isWeather   = _qType === 'weather'
  const _isWebReader = _qType === 'web_reader' || isWebReaderQuery
  const _isYouTubeType = _qType === 'youtube'

  // Compress + trim contexts to prevent TPM exhaustion (Groq free tier limits)
  // GN article URLs can be 400-600 chars each — strip to save tokens
  function _compress(s) {
    if (!s) return s
    return s
      .replace(/https:\/\/news\.google\.com\/rss\/articles\/[A-Za-z0-9_=+/-]{30,}\?oc=\d+/g, 'https://news.google.com')
      .replace(/https?:\/\/[^\s\]]{100,}/g, (url) => url.slice(0, 60) + '…')
  }
  const _trim = (s, max = 2500) => {
    if (!s) return s
    const compressed = _compress(s)
    return compressed.length > max ? compressed.slice(0, max) + '\n...[مقتطع]' : compressed
  }

  // ── Post-process AI response: convert bare URLs to clickable source links ─
  function _cleanRawUrls(text) {
    if (!text) return text
    // Replace bare URLs not already inside markdown links [...](...) or href="..."
    return text.replace(
      /(?<!\]\()(?<!['"=])(https?:\/\/(?:www\.)?([a-zA-Z0-9\-]+(?:\.[a-zA-Z]{2,})+)(?:\/[^\s)\]"'<>]*)?)/g,
      (fullUrl, _, domain) => {
        // Extract readable name from domain (e.g. "elkhabar.com" → "El Khabar")
        const name = domain
          .replace(/^www\./, '')
          .split('.')[0]
          .replace(/-/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())
        return `[${name}](${fullUrl})`
      }
    )
  }

  // ── DZ Memory Layer — استرجاع الذكريات ذات الصلة قبل بناء systemPrompt ──
  // يُستبدل كامل تاريخ المحادثة بذكريات مُختارة → تقليل tokens
  const _memProjectId = currentRepo || req.body.projectId || null
  let _memoryContext = ''
  try {
    const _mems = searchMemories({
      query: lastUserMessage,
      projectId: _memProjectId,
      topK: 5,
    })
    if (_mems.length) _memoryContext = buildMemoryContext(_mems)
  } catch { /* fail silently — memory is optional */ }

  // ── MetaClaw Skill Injection ───────────────────────────────────────────
  let _metaClawBlock = ''
  try { _metaClawBlock = metaClawInject('', lastUserMessage) } catch { /* fail silently */ }

  const systemPrompt = [
    // ── LAYER 0: INTENT SEPARATION GUARD (mandatory — always first) ───────
    INTENT_SEPARATION_GUARD,
    // ── ADVANCED REASONING CORE ───────────────────────────────────────────
    DZ_ADVANCED_REASONING_PROMPT,
    // ── CORE (always) ─────────────────────────────────────────────────────
    `أنت DZ Agent 🇩🇿 — وكيل ذكاء اصطناعي متعدد الوكلاء أنشأه Nadir Houamria (Nadir Infograph) — منصة DZ-GPT.`,
    `اليوم: ${_todayHuman} | السنة: ${_yearNow} | ${invocationInstruction}`,
    // ── SELF-AWARENESS (يُجيب إذا سأل المستخدم عن هويتك/مهاراتك/تقنياتك) ──
    `إذا سأل المستخدم عن نفسك (من أنت / كم وكيل تستخدم / ما مهاراتك / ما تقنياتك / ما قدراتك) أجب بهذا دون كشف أسماء المزودين أو مفاتيح API:
• الهوية: DZ Agent — وكيل الجزائر الذكي الأول من نوعه، يعمل 24/7، أنشأه Nadir Houamria
• عدد الوكلاء: 16 وكيل متخصص يعملون معاً في تناسق كامل: [بحث الويب الحي] [الأخبار] [الرياضة] [الطقس] [الخرائط الجزائرية] [GitHub التنفيذي] [بناء المواقع] [الذاكرة الشخصية] [القرآن الكريم] [الصحة والطب] [التعليم/Eddirasa] [القانون والعقود] [يوتيوب] [الدارجة الجزائرية] [العملات] [التحليل العميق CoT/ReAct]
• المهارات الكاملة (39 مهارة): بحث حي · قراءة مواقع · كود وبرمجة · GitHub Agent · أخبار الجزائر · أخبار عالمية · رياضة وLFP · أسعار العملات DZD · طقس 58 ولاية · مواقيت الصلاة · قرآن كريم · ذاكرة شخصية · سيرة ذاتية ع/ف · مخطط مشاريع · وثائق تجارية · تحليل قانوني · توليد عقود جزائرية · خطة عمل Business Plan · بحث وظيفي · رسائل تقدم · وكيل صحة · بحث أطباء · CNAS/CHNAS · إحصاءات جزائرية · دارجة جزائرية · ترجمة 3 لغات · توليد صور AI · بناء مواقع HTML · نشر GitHub Pages · نشر Vercel · تحليل يوتيوب · OCR صور وPDF · خرائط جزائرية · دروس Eddirasa · بحث شركات الجزائر · multi-agent reasoning · WebSocket فوري · circuit breaker · كاشف النوايا الذكي
• التقنيات: نماذج LLM متعددة القدرات · بحث ويب حي · ذاكرة شخصية دائمة (Long-Term Memory) · WebSocket للحوار الفوري · محرك الدارجة الجزائرية المتقدم · نظام circuit breaker للمرونة · RAG · تكامل Telegram
• لا تذكر أسماء المزودين (Groq / Gemini / Mistral / DeepSeek / etc) في إجابتك`,
    queryAnalysisBlock,
    `❌ لا تخترع أخباراً أو نتائج أو أسعاراً | ❌ لا تستعمل معرفتك الداخلية للأحداث الزمنية | ✅ إذا لم توجد نتائج حديثة → قُل ذلك صراحةً ولا تخترع`,
    `روابط: ادمج الرابط في اسم المصدر فقط [اسم](url) — لا تكتب URL خاماً كنص أبداً. مثال الصحيح: [الخبر](https://elkhabar.com/...) | مثال خاطئ: https://elkhabar.com/... استخدم Markdown. أجب بلغة المستخدم (عربية/فرنسية/إنجليزية).`,
    queryAnalysis?.suggestions?.length
      ? `اقتراحات المتابعة (أضفها في نهاية إجابتك كـ "💡 قد يهمك أيضاً:"): ${queryAnalysis.suggestions.join(' / ')}`
      : '',

    // ── YOUTUBE MODULE (youtube questionType queries) ─────────────────────
    _isYouTubeType ? [
      `🎬 YOUTUBE SEARCH MODE: المستخدم يبحث عن فيديو / أغنية / كليب على YouTube.`,
      `⚠️ CRITICAL RULE: لا تبني موقعاً ولا تكتب HTML ولا تنشئ مستودعاً. هذا بحث يوتيوب فقط.`,
      `✅ إذا وصلتك نتائج YouTube: اعرضها منسقة بعنوان وقناة ورابط.`,
      `✅ إذا لم تصلك نتائج: أخبر المستخدم وأعطِه رابط البحث المباشر على YouTube.`,
      `✅ مثال صحيح: "الشاب خالد فيديو" → ابحث على YouTube عن "الشاب خالد" وأعرض النتائج.`,
      `❌ مثال خاطئ: "الشاب خالد فيديو" → بناء موقع باسم "الشاب خالد" ← محظور تماماً.`,
    ].join('\n') : '',

    // ── NEWS MODULE (news / sports_news queries only) ─────────────────────
    _isNews ? [
      `📰 NEWS: رتّب الإجابة زمنياً: 🟢 اليوم · 🟡 الأسبوع · 🟠 الشهر. أدرج التاريخ لكل خبر. المصدر يكون رابطاً قابلاً للضغط بعنوانه فقط — لا تكتب URL خاماً أبداً. قدّم كمية وفيرة من الأخبار (10-15 خبراً على الأقل). أعطِ الأولوية للأحدث دائماً.`,
      `مصادر موثوقة: aps.dz · echoroukonline.com · ennaharonline.com · elkhabar.com · reuters.com · aljazeera.net · djazairess.com · elbilad.net`,
      `قاعدة المصادر: استخدم كل النتائج المتاحة من Google News + RSS + Google CSE معاً — لا تقتصر على مصدر واحد.`,
    ].join('\n') : '',

    // ── SPORTS MODULE (sports / sports_news only) ─────────────────────────
    _isSports ? [
      `⚽ SPORTS: لا تخترع نتائج المباريات أبداً. تنسيق: 🔴 LIVE · ✅ نتيجة · 📅 قادم. إذا لم تتوفر بيانات → وجّه إلى sofascore.com أو flashscore.com.`,
      `⚠️ DISAMBIGUATION CRITIQUE: "نتائج" + اسم لاعب أو فريق = **نتائج رياضية** (مباريات / إحصائيات / أهداف). ليست نتائج امتحانات أو بكالوريا. لا تذكر ONEC أو البكالوريا أبداً في هذا السياق.`,
      `⚠️ DISAMBIGUATION: "آخر نتائج رياض محرز" = آخر مباريات ومعلومات اللاعب رياض محرز. ليس نتائج بكالوريا.`,
    ].join('\n') : '',

    // ── EDUCATION MODE (education queries only) ───────────────────────────
    _isEdu ? `📚 EDUCATION: حدّد المادة والمستوى (ابتدائي/متوسط/ثانوي/بكالوريا). ابحث أولاً في eddirasa.com. للتمارين: فهم → موضوع → حل خطوة بخطوة → شرح مبسط. للشرح: ملخص + أمثلة + 3 تمارين + اختبار صغير.` : '',

    // ── CODE / GITHUB AGENT MODE (activated when repo connected OR code query) ──
    _isCode ? [
      // Inject full GITHUB_AGENT_LAYER when user has a repo connected → AGENT MODE
      (githubToken || currentRepo) ? GITHUB_AGENT_LAYER : '',
      (githubToken || currentRepo) ? [
        ``,
        `━━━ AGENT MODE STATUS ━━━`,
        `🔐 GitHub Token: ${githubToken ? '✅ متصل' : '❌ غير متصل'}`,
        `📦 المستودع الحالي: ${currentRepo ? `✅ ${currentRepo}` : '⚠️ لم يُحدد — اطلب "اعرض مستودعاتي"'}`,
        `🤖 الوضع: ${currentRepo ? 'AGENT MODE — تنفيذ مباشر داخل ' + currentRepo : 'STANDBY — بانتظار اختيار مستودع'}`,
        currentRepo ? `📋 الأوامر المتاحة: أنشئ ملف | عدّل | أنشئ فرع | commit | انشر | حلّل المشروع | أصلح خطأ` : '',
      ].filter(Boolean).join('\n') : `💻 CODE: GitHub غير متصل. للعمل داخل مستودع، اطلب "ربط GitHub" أو أرسل رابط المستودع.`,
    ].filter(Boolean).join('\n') : '',

    // ── ALGERIAN ADMIN (admin / howto queries only) ───────────────────────
    _isAdmin ? [
      `🏛️ ADMIN: مصادر رسمية إلزامية: interieur.gov.dz · passeport.interieur.gov.dz · casier-judiciaire.justice.dz · poste.dz`,
      `أجب بهذا الهيكل: 📌 اسم الخدمة · 📍 المكان · 📄 الوثائق · 🪜 الخطوات · 🌐 الرابط الرسمي · 💡 نصائح. ❌ لا تخترع روابط.`,
    ].join('\n') : '',

    // ── WEATHER RULE (weather queries only) ──────────────────────────────
    _isWeather ? `🌤️ WEATHER: استخدم فقط البيانات المسترجعة (open-meteo / wttr.in / openweather). لا تخمّن أي قيمة. اذكر المصدر دائماً.` : '',

    // ── WEB READER MODULE (activated when URL detected in message) ────────
    _isWebReader ? [
      `🌐 WEB READER MODE: المستخدم أرسل رابطاً. لقد قرأت محتواه وأرسلته إليك في "محتوى الموقع" أدناه.`,
      `أجب بهذا الهيكل الإلزامي:`,
      `### 🌐 تحليل المصدر\n(ما هو هذا الموقع/الصفحة)`,
      `### 🧠 المعلومات الرئيسية\n- نقطة 1\n- نقطة 2`,
      `### 📊 التفاصيل المستخرجة\n(أرقام / بيانات / كود مهم)`,
      `### 💡 تحليل ذكي\n(تفسيرك كوكيل خبير)`,
      `### ✅ الإجابة النهائية\n(الإجابة المباشرة على سؤال المستخدم)`,
      `قواعد صارمة: ❌ لا تخترع معلومات غير موجودة في الصفحة | ✅ استند فقط للمحتوى المستخرج | إذا لم يُقرأ الموقع → أخبر المستخدم صراحةً`,
      `إذا طلب المستخدم "ابني من هذا الموقع" → استخرج الفكرة واقترح خطة تنفيذ + كود.`,
    ].join('\n') : '',

    // ── LIVE DATA BLOCKS (conditional, trimmed) ───────────────────────────
    webReaderContext ? `🌐 محتوى الموقع (مُستخرج تلقائياً):\n${_trim(webReaderContext, 5000)}\n> أجب بناءً على هذا المحتوى فقط.` : '',
    prayerContext    ? `🕌 مواقيت الصلاة (aladhan.com):\n${_trim(prayerContext, 800)}\n> اعرض في جدول. لا تخمّن.` : '',
    lfpContext       ? `🏆 LFP (lfp.dz):\n${_trim(lfpContext, 1500)}\n> لا تختلق نتائج.` : '',
    footballContext  ? `⚽ كرة القدم:\n${_trim(footballContext, 1500)}\n> لا تخترع نتائج.` : '',
    standingsContext ? `🏆 ترتيب الدوري:\n${_trim(standingsContext, 1000)}\n> لا تخترع نقاطاً.` : '',
    globalLeaguesContext ? `🌍 دوريات عالمية:\n${_trim(globalLeaguesContext, 1000)}\n> 🔴 حية ✅ منتهية 📅 قادمة. لا تخترع.` : '',
    currencyContext  ? `💱 أسعار الصرف:\n${_trim(currencyContext, 600)}\n> لا تخترع أسعاراً. اعرض جدولاً.` : '',
    rssContext       ? `📰 RSS FEEDS (أحدث الأخبار):\n${_trim(rssContext, 3000)}\n> لخّص مع [عنوان](رابط). لا تخترع.${isNewspaperHeadlineQuery(lastUserMessage) ? ' رتّب حسب الصحيفة.' : ''}` : '',
    webSearchContext ? `🔍 نتائج البحث الحي:\n${_trim(webSearchContext, 3000)}\n> هذا مصدرك الوحيد للمعلومات الآنية. لا تخترع. [اسم](رابط) فقط.` : '',
    weatherPriorityContext ? `🌤️ بيانات الطقس (جدول جاهز للعرض — لا تعيد صياغته):\n${_trim(weatherPriorityContext, 600)}\n> ابدأ إجابتك بهذا الجدول مباشرةً. لا تضف أي عناوين قبله. اذكر المصدر في آخر سطر فقط.` : '',
    educationalContext ? `📚 سياق تعليمي:\n${_trim(educationalContext, 1500)}\n> لخّص وفسّر. إذا لم يرجع eddirasa نتيجة، استعمل المعرفة العامة.` : '',
    clientBehaviorContext ? `🧠 سياق المستخدم: ${clientBehaviorContext}` : '',
    dzLanguageContext ? `🗣️ ${dzLanguageContext}` : '',
    _memoryContext ? `\n${_memoryContext}` : '',

    // ── Owner Training Injection (facts / qa / behaviors from admin) ──────
    (() => {
      try {
        const _tc = getTrainingContext()
        return _tc ? `\n━━━ تدريب مخصص من المالك (مُلزِم) ━━━\n${_tc}` : ''
      } catch { return '' }
    })(),

    _metaClawBlock,
  ].filter(Boolean).join('\n\n')

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]

  // ── Capability-aware routing hint ────────────────────────────────────────────
  // Compute intent → routing hint for the AI router fallback chain.
  // Primary providers (Groq, DeepSeek) are unaffected; hint only matters
  // when escalating to the multi-provider router.
  const _smartIntent  = detectSmartIntent(lastUserMessage)
  const _taskHint     = getTaskRoutingHint(_smartIntent)

  // ── Weather fast-path: return table directly — no AI needed ─────────────
  // When real weather data is available, skip AI entirely to avoid latency
  // and prevent the model from adding "شرح:" or unwanted preamble.
  if (hasWeatherPriority && weatherPriorityContext && !weatherPriorityContext.includes('fallback:')) {
    const wLines = weatherPriorityContext.split('\n')
    const city = (wLines.find(l => l.startsWith('city:')) || '').replace('city:', '').trim()
    const source = (wLines.find(l => l.startsWith('source:')) || '').replace('source:', '').trim() || 'open-meteo.com'
    const tableRows = wLines.filter(l => l.startsWith('|')).join('\n')
    const staleNote = wLines.find(l => l.startsWith('⚠️')) || ''
    const formattedWeather = [
      `## 🌤️ حالة الطقس في ${city} — اليوم`,
      '',
      tableRows,
      '',
      staleNote,
      `> 📡 المصدر: **${source}**`,
    ].filter(Boolean).join('\n')
    return res.status(200).json({ content: formattedWeather })
  }

  // ── Autonomous Reasoning Layer ────────────────────────────────────────────
  // Enriches system prompt with CoT / ReAct / ToT / Decomposition / Multi-Agent
  // based on query complexity. Zero extra AI calls for simple queries.
  const _hasSearchCtx = !!(webSearchContext || rssContext || lfpContext || footballContext)
  const {
    messages: reasonedMessages,
    strategy: _reasoningStrategy,
    complexity: _queryComplexity,
    needsReflection: _needsReflection,
  } = applyReasoning(apiMessages, lastUserMessage, {
    intent: _smartIntent,
    hasSearch: _hasSearchCtx,
  })

  // ── Validated fallback chain: DeepSeek → Ollama → Groq (with response validation) ───
  // Each step's output is validated for non-empty, meaningful content before returning.
  // History is trimmed to last 8 turns to keep context relevant and reduce off-topic answers.
  // Smart token budget — avoid paying 3000 tokens for a simple greeting
  const _chatArabicN = (lastUserMessage.match(/[\u0600-\u06FF]/g) || []).length
  const _chatHasComplexKw = /شرح|اكتب|أنشئ|انشئ|برمجة|كود|خطة|حلّل|قارن|generate|create|write|code|موقع|website/.test(lastUserMessage)
  const _chatTokens = (
    _queryComplexity === 'multi_step' ? 4000 :
    _queryComplexity === 'complex'    ? 3000 :
    (_chatArabicN > 15 || _chatHasComplexKw || lastUserMessage.length > 80) ? 2000 :
    lastUserMessage.length > 30 ? 1200 : 700
  )

  const aiResult = await safeGenerateAI({
    messages: reasonedMessages,
    query: lastUserMessage,
    max_tokens: _chatTokens,
    taskHint: _taskHint,
  })

  // Self-Reflection disabled — was triggering a full second AI call on complex queries
  // causing 2x latency. Speed > marginal accuracy gain for DZ Agent chat.

  if (aiResult.content) {
    // ── Strip any leaked thinking-trace patterns from AI output ──────────────
    const _stripThinking = (txt) => txt
      .replace(/^[\s\S]*?(?:🧠\s*STEP\s*\d+\s*[—–-][^\n]*\n[\s\S]*?\n\n)/gi, '')
      .replace(/(?:^|\n)(?:🧠\s*)?STEP\s*\d+\s*[—–-][^\n]*/gi, '')
      .replace(/(?:^|\n)\*\*STEP\s*\d+[^*]*\*\*[^\n]*/gi, '')
      .replace(/(?:^|\n)###\s*STEP\s*\d+[^\n]*/gi, '')
      .replace(/(?:^|\n)(?:النية|التصنيف|ما يريده المستخدم حقاً?)[^\n]*\n?/gi, '')
      .replace(/^\s*\n/, '').trim()

    const _finalContent = _cleanRawUrls(_stripThinking(aiResult.content))
    const _responsePayload = {
      content: _finalContent,
      fallbackModel: aiResult.model,
      reasoning: _reasoningStrategy !== 'passthrough' ? _reasoningStrategy : undefined,
      hasMoreNews: hasNewsResults,
      newsQuery: hasNewsResults ? lastUserMessage : undefined,
      webReaderIntent: isWebReaderQuery ? _webReaderIntent : undefined,
    }

    // ── Cache write — only simple, non-live-data, single-turn queries ────────
    if (!currentRepo && !githubToken && !_NOCACHE_RE.test(lastUserMessage) && messages.length <= 2 && _finalContent.length > 20) {
      _cacheSet(lastUserMessage, _responsePayload)
    }

    return res.status(200).json(_responsePayload)
  }
  console.warn(`[DZ Agent] All AI models failed validation for query: "${lastUserMessage.slice(0, 80)}"`)

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

  // Anti-empty: DZ Agent must always respond. If the user actually asked
  // something and every source (AI models + educational + weather + RSS)
  // failed, give a clear, actionable response — never a silent empty screen.
  const askedSomething = lastUserMessage && lastUserMessage.trim().length > 0
  if (askedSomething) {
    // Detect if this looks like a code/programming question
    const _isCodeQuery = /بايثون|python|javascript|كود|برمجة|دالة|script|كتابة.*كود|برنامج|اكتب.*كود|اكتب.*برنامج|react|html|css/i.test(lastUserMessage)
    if (_isCodeQuery) {
      const _tmplLang = /javascript|js|node/i.test(lastUserMessage) ? 'javascript' : 'python'
      const _tmplCode = generateCodeTemplate(lastUserMessage, _tmplLang)
      console.warn(`[DZ Agent] AI failed for code query → template fallback (lang=${_tmplLang})`)
      return res.status(200).json({
        content: `✅ **تم توليد الكود بنجاح!**\n\n> ⚙️ **ملاحظة:** نموذج AI غير متاح حالياً — تم استخدام مولّد القوالب كبديل.\n> 💡 لتحصل على إجابات أكثر ذكاءً، أضف مفتاح Groq مجاني: **AI_API_KEY** من [console.groq.com](https://console.groq.com/keys)`,
        isExecution: true,
        executionLang: _tmplLang,
        executionCode: _tmplCode,
      })
    }

    return res.status(200).json({
      content: `⚠️ **نموذج الذكاء الاصطناعي غير متاح حالياً.**\n\nلا يوجد مفتاح AI مُعيَّن في البيئة — جميع النماذج (Groq، DeepSeek، OpenAI) لم تستجب.\n\n**الحل السريع (مجاني):**\n1. اذهب إلى [console.groq.com/keys](https://console.groq.com/keys) وأنشئ مفتاحاً مجانياً\n2. أضفه في إعدادات المشروع باسم **AI_API_KEY**\n\n**ما يعمل الآن بدون AI:**\n- 💱 أسعار الصرف: "سعر الدولار اليوم"\n- ⚽ مباريات اليوم: "مباريات اليوم"\n- 🕌 مواقيت الصلاة: "مواقيت الصلاة في الجزائر"\n- 📰 أخبار: "أخبار الجزائر اليوم"\n- 🌤️ الطقس: "الطقس في وهران"`,
      status: 'no_api_key',
    })
  }

  return res.status(200).json({
    content: 'مرحباً! أنا **DZ Agent** — مساعدك الذكي الجزائري 🇩🇿\n\n**⚽ ذكاء كرة القدم:**\n- 🇩🇿 الدوري الجزائري (LFP)، المنتخب الوطني\n- 🌍 البريميرليغ، الليغا، البوندسليغا، السيريا، دوري الأبطال، كأس العالم، كأس أمم أفريقيا\n- 📡 SofaScore (مباشر)، BBC Sport، ESPN، كووورة\n\n**💱 أسعار الصرف (DZD):**\n- سعر الدولار، اليورو، الجنيه الإسترليني، الريال السعودي، الدرهم وغيرها\n- تحويل العملات مباشر (FloatRates)\n\n**📰 أخبار وخدمات:**\n- أخبار الجزائر والعالم (APS، الشروق، BBC)\n- 🕌 مواقيت الصلاة لكل المدن\n- 🗂️ إدارة مستودعات GitHub\n- 💻 تحليل وكتابة الأكواد\n\nجرّب: **"سعر الدولار اليوم"** أو **"مباريات اليوم"** أو **"اعرض مستودعاتي"**',
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// DZ AGENT STREAM — Fast SSE Streaming Endpoint (Vercel AI SDK)
// ═══════════════════════════════════════════════════════════════════════════
// استخدام streamText من Vercel AI SDK لإرسال tokens فورياً للعميل.
// المستخدم يرى أول كلمة خلال ~300ms بدلاً من انتظار 2-8 ثوانٍ.
//
// الاستجابات المُرسَلة عبر SSE:
//   data: {"token":"..."}     ← chunk نصي من LLM
//   data: {"redirect":"full"} ← تحويل للـ endpoint الكامل (بيانات حية)
//   data: {"error":"..."}     ← خطأ في جميع المزودين
//   data: [DONE]              ← نهاية البث
// ═══════════════════════════════════════════════════════════════════════════

const _streamSSEHeaders = (res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()
}

// Queries that require LIVE data injection — redirect to full endpoint
const _LIVE_DATA_RE = /طقس|حرارة|أمطار|ضباب|رياح|الجو اليوم|weather|مباراة|ماتش|أهداف|ترتيب الدوري|كأس أفريقيا|بطولة|صلاة|أذان|فجر|مغرب|عشاء|ظهر|عصر|سعر الصرف|دولار.*دينار|يورو.*دينار|صرف اليوم|آخر الأخبار|أخبار اليوم|أخبار.*الجزائر/i

app.post('/api/dz-agent-stream', async (req, res) => {
  const messages = normalizeChatMessages(req.body.messages)
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content?.trim() || ''

  // ── Step 1: Moderation ───────────────────────────────────────────────────
  const mod = moderateMessage(lastUserMessage)
  if (!mod.ok) {
    _streamSSEHeaders(res)
    res.write(`data: ${JSON.stringify({ token: mod.replyIfBlocked })}\n\n`)
    res.write('data: [DONE]\n\n')
    return res.end()
  }

  // ── Step 2: Live-data detection — redirect to full endpoint ──────────────
  if (_LIVE_DATA_RE.test(lastUserMessage)) {
    _streamSSEHeaders(res)
    res.write(`data: ${JSON.stringify({ redirect: 'full' })}\n\n`)
    res.write('data: [DONE]\n\n')
    return res.end()
  }

  // ── Step 1b: Static Fast-Path — إجابة فورية <1ms بدون LLM ──────────────
  if (messages.length <= 2) {
    const _staticAnswer = lookupStaticFact(lastUserMessage)
    if (_staticAnswer) {
      console.log(`[StaticFact:Stream] HIT: "${lastUserMessage.slice(0, 60)}"`)
      _streamSSEHeaders(res)
      res.write(`data: ${JSON.stringify({ token: _staticAnswer })}\n\n`)
      res.write('data: [DONE]\n\n')
      return res.end()
    }
  }

  // ── Step 2b: YouTube / Map / WebBuilder / Clone / Doctor — redirect to full endpoint ──
  // These operations have their own rich UI engines — streaming text would bypass them
  const _ytKwRe_stream = /(?:فيديو|فيديوهات|يوتيوب|يوتيب|بالفيديو|اغنية|أغنية|أغاني|موسيقى|كليب|نشيد|أنشودة|مقطع.*فيديو|شاهد.*فيديو|watch.*video|music.*video|video.*clip|youtube\.com|youtu\.be)/i
  const _ytUrlRe_stream = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i
  const _isYTStream = _ytUrlRe_stream.test(lastUserMessage) ||
    (_ytKwRe_stream.test(lastUserMessage) && !detectWebsiteBuilderQuery(lastUserMessage))
  const _isMapStream = isMapQuery(lastUserMessage)
  const _isWebBuildStream = detectWebsiteBuilderQuery(lastUserMessage) || detectMapWebsiteQuery(lastUserMessage)
  const _isCloneStream = /https?:\/\/[^\s]{5,}/i.test(lastUserMessage) &&
    /(?:استنسخ|استنساخ|clone|كلون|انسخ.*موقع|اعمل نسخة)/i.test(lastUserMessage)
  // Doctor search has its own rich results panel — must go through full endpoint
  const _isDoctorStream = detectDoctorIntent(lastUserMessage).isDoctorQuery
  if (_isYTStream || _isMapStream || _isWebBuildStream || _isCloneStream || _isDoctorStream) {
    _streamSSEHeaders(res)
    res.write(`data: ${JSON.stringify({ redirect: 'full' })}\n\n`)
    res.write('data: [DONE]\n\n')
    return res.end()
  }

  // ── Step 3: Core system prompt (slim — no heavy reasoning block) ─────────
  const _yearNow  = getCurrentYear()
  const _today    = getCurrentDateString('ar-DZ')
  const _training = (() => { try { return getTrainingContext() } catch { return '' } })()

  const coreSystemPrompt = [
    `أنت DZ Agent 🇩🇿 (DZ-GPT — Nadir Houamria). اليوم: ${_today} | ${_yearNow}. أجب مباشرةً بدون مقدمات. أجب بلغة المستخدم.`,
    `❌ لا تخترع أخباراً أو أسعاراً | ✅ إذا لم تعرف → قُل ذلك | روابط: [اسم](url) فقط.`,
    _training ? `━━━ تدريب المالك (مُلزِم) ━━━\n${_training}` : '',
  ].filter(Boolean).join('\n')

  // Smart token budget based on query complexity
  const _msgLen = lastUserMessage.length
  const _arabicN = (lastUserMessage.match(/[\u0600-\u06FF]/g) || []).length
  const _hasComplexKw = /شرح|اكتب|أنشئ|انشئ|برمجة|كود|خطة|حلّل|قارن|generate|create|write|code/.test(lastUserMessage)
  const _complexity = (_msgLen > 100 || _arabicN > 25 || _hasComplexKw) ? 'complex' : (_msgLen > 50 || _arabicN > 10) ? 'medium' : 'simple'
  const _streamTokens = _complexity === 'complex' ? 2000 : _complexity === 'medium' ? 700 : 300

  const apiMessages = [
    { role: 'system', content: coreSystemPrompt },
    ...messages,
  ]

  await streamAIResponse(res, apiMessages, { maxTokens: _streamTokens })
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
  // On Vercel serverless each request may run on a different instance (oauthStates is per-instance).
  // Accept the state if EITHER the in-memory map contains it OR the cookie matches it.
  const stateValidInMemory = oauthStates.has(state)
  const stateValidByCookie = cookieState && cookieState === state
  if (!state || (!stateValidInMemory && !stateValidByCookie)) {
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
// ── GET /api/github/whoami — Rich GitHub profile card ──────────────────────
app.get('/api/github/whoami', async (req, res) => {
  const token = req.headers['x-github-token'] || req.query.token || process.env.GITHUB_TOKEN || ''
  if (!token) return res.status(401).json({ error: 'no_token', message: 'GitHub token required' })
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${token}`, 'User-Agent': 'DZ-Agent/5.0', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      return res.status(r.status).json({ error: err.message || 'GitHub API error' })
    }
    const u = await r.json()
    return res.status(200).json({
      login: u.login,
      name: u.name || u.login,
      avatar: u.avatar_url,
      url: u.html_url,
      bio: u.bio || null,
      company: u.company || null,
      location: u.location || null,
      email: u.email || null,
      blog: u.blog || null,
      public_repos: u.public_repos,
      followers: u.followers,
      following: u.following,
      created_at: u.created_at,
      plan: u.plan?.name || null,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

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

// Create a new repository
app.post('/api/dz-agent/github/create-repo', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  if (!token) return res.status(400).json({ error: 'GitHub token required.' })
  const { name, description = '', isPrivate = false, autoInit = true } = req.body
  if (!name || typeof name !== 'string' || !/^[\w\-\.]{1,100}$/.test(name)) {
    return res.status(400).json({ error: 'Invalid repository name. Use letters, numbers, hyphens, dots (max 100 chars).' })
  }
  try {
    const r = await ghFetch('/user/repos', token, {
      method: 'POST',
      body: JSON.stringify({ name, description, private: !!isPrivate, auto_init: autoInit }),
    })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data.message || 'Failed to create repository.' })
    console.log(`[GitHub] ✅ Created repo: ${data.full_name}`)
    return res.status(201).json({
      success: true,
      full_name: data.full_name,
      html_url: data.html_url,
      clone_url: data.clone_url,
      default_branch: data.default_branch || 'main',
      private: data.private,
    })
  } catch (err) {
    console.error('[GitHub] create-repo error:', err)
    return res.status(500).json({ error: 'Failed to create repository.' })
  }
})

// Delete a branch
app.post('/api/dz-agent/github/delete-branch', async (req, res) => {
  const token = req.body.token || process.env.GITHUB_TOKEN || ''
  const { repo, branch } = req.body
  if (!token || !repo || !branch) return res.status(400).json({ error: 'Token, repo, and branch required.' })
  if (!isValidGithubRepo(repo)) return res.status(400).json({ error: 'Invalid repository name.' })
  if (branch === 'main' || branch === 'master') return res.status(400).json({ error: 'Cannot delete default branch.' })
  try {
    const r = await ghFetch(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, { method: 'DELETE' })
    if (r.status === 422 || r.status === 404) {
      const d = await r.json().catch(() => ({}))
      return res.status(r.status).json({ error: d.message || `Branch "${branch}" not found.` })
    }
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      return res.status(r.status).json({ error: d.message || 'Failed to delete branch.' })
    }
    console.log(`[GitHub] ✅ Deleted branch ${branch} from ${repo}`)
    return res.status(200).json({ success: true, message: `تم حذف الفرع "${branch}" من ${repo}` })
  } catch (err) {
    console.error('[GitHub] delete-branch error:', err)
    return res.status(500).json({ error: 'Failed to delete branch.' })
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

// Helper: check if a GitHub repo is completely empty (no commits yet)
async function isRepoEmpty(token, repo) {
  const r = await ghFetch(`/repos/${repo}/contents`, token)
  if (r.status === 409) return true
  if (!r.ok) return false
  const data = await r.json().catch(() => null)
  if (data && data.message && /Git Repository is empty/i.test(data.message)) return true
  return false
}

// Helper: create initial README.md commit so the repo is no longer empty
async function initRepoWithReadme(token, repo, branch = 'main') {
  const [owner, repoName] = repo.split('/')
  const readmeContent = `# ${repoName}\n\nCreated by DZ Agent 🇩🇿\n`
  const body = {
    message: 'Initial commit — add README.md',
    content: Buffer.from(readmeContent).toString('base64'),
    branch,
  }
  const r = await ghFetch(`/repos/${repo}/contents/README.md`, token, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const d = await r.json().catch(() => ({}))
    throw new Error(d.message || 'Failed to create initial commit')
  }
  console.log(`[GitHub] ✅ Initial commit created for ${repo} on branch ${branch}`)
  return await r.json()
}

// Commit a file to GitHub (auto-initialises empty repos with README.md first)
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

  const targetBranch = branch || 'main'

  try {
    // ── 1. Auto-init empty repo ───────────────────────────────────────────────
    const empty = await isRepoEmpty(token, repo)
    if (empty) {
      console.log(`[GitHub] ⚠️ Repo ${repo} is empty — creating initial README.md commit`)
      try {
        await initRepoWithReadme(token, repo, targetBranch)
        await new Promise(r => setTimeout(r, 1500))
      } catch (initErr) {
        console.error('[GitHub] initRepo error:', initErr.message)
      }
    }

    // ── 2. Get current file SHA (if exists, for update) ───────────────────────
    let sha
    const existingRes = await ghFetch(`/repos/${repo}/contents/${path}`, token)
    if (existingRes.ok) {
      const existing = await existingRes.json()
      sha = existing.sha
    }

    const body = {
      message,
      content: Buffer.from(content).toString('base64'),
      branch: targetBranch,
      ...(sha ? { sha } : {}),
    }

    const commitRes = await ghFetch(`/repos/${repo}/contents/${path}`, token, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
    const commitData = await commitRes.json()

    // ── 3. If still "empty" error, retry once after re-init ───────────────────
    if (!commitRes.ok && /Git Repository is empty/i.test(commitData.message || '')) {
      console.log(`[GitHub] ⚠️ Still empty after init — retrying README then file`)
      try { await initRepoWithReadme(token, repo, targetBranch) } catch {}
      await new Promise(r => setTimeout(r, 2000))
      const retry = await ghFetch(`/repos/${repo}/contents/${path}`, token, {
        method: 'PUT',
        body: JSON.stringify({ message, content: Buffer.from(content).toString('base64'), branch: targetBranch }),
      })
      const retryData = await retry.json()
      if (!retry.ok) return res.status(retry.status).json({ error: retryData.message || 'Commit failed.' })
      return res.status(200).json({
        success: true,
        html_url: retryData.content?.html_url || `https://github.com/${repo}/blob/${targetBranch}/${path}`,
        sha: retryData.content?.sha,
        autoInited: true,
      })
    }

    if (!commitRes.ok) {
      return res.status(commitRes.status).json({ error: commitData.message || 'Commit failed.' })
    }

    return res.status(200).json({
      success: true,
      html_url: commitData.content?.html_url || `https://github.com/${repo}/blob/${targetBranch}/${path}`,
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

// ═══════════════════════════════════════════════════════════
// DZ EXCEL — AI Assistant Endpoint
// ═══════════════════════════════════════════════════════════
app.post('/api/dz-excel/ai', aiLimiter, async (req, res) => {
  const { message = '', type = '' } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })

  const TEMPLATE_SYSTEM = `أنت مساعد Excel ذكي متخصص في إنشاء جداول البيانات للشركات الجزائرية.
عند طلب قالب، أعد JSON بالتنسيق التالي بالضبط:
{
  "action": "template",
  "templateName": "اسم القالب",
  "headers": ["العمود1","العمود2",...],
  "rows": [
    ["القيمة1","القيمة2",...],
    ...
  ],
  "message": "شرح قصير"
}

قواعد:
- الصف الأول (rows[0]) = رؤوس الأعمدة (headers) بتنسيق عريض
- أضف 10-15 صف نموذجية بيانات واقعية
- استخدم معادلات Excel حقيقية مثل =SUM(C2:C11) للإجماليات
- الأعداد بالأرقام فقط (بدون رموز عملة في الخلايا الرقمية)
- التواريخ بصيغة DD/MM/YYYY
- للـ macro: action="macro" وحقل "macro" يحتوي كود JS

عند سؤال عن معادلة أو شرح: action="answer" و message فقط.

قوالب متاحة:
- inventory: مخزون (رمز، منتج، كمية، سعر الشراء، سعر البيع، الإجمالي، ملاحظة)
- invoice: فاتورة (رقم، المنتج، الكمية، الوحدة، سعر الوحدة، الإجمالي)
- payroll: رواتب (الاسم، الوظيفة، الراتب الأساسي، السكن، المواصلات، الغيابات، الاقتطاع CNAS، الصافي)
- hr: موارد بشرية (الاسم، رقم الموظف، الوظيفة، القسم، تاريخ التوظيف، الهاتف، نوع العقد)
- leave: عطل (الموظف، نوع العطلة، تاريخ البداية، تاريخ النهاية، عدد الأيام، الحالة، ملاحظة)
- tasks: تكليف بمهمة (المهمة، المكلف، الأولوية، تاريخ البدء، الموعد النهائي، النسبة %, الحالة)
- grades: كشف نقاط (الطالب، رياضيات، علوم، عربية، فرنسية، إنجليزية، تاريخ، التربية البدنية، المعدل)
- customers: زبائن (الاسم، الهاتف، البريد الإلكتروني، العنوان، المدينة، رقم الزبون، الرصيد، آخر معاملة)
- budget: ميزانية (البند، النوع، المبلغ المتوقع، المبلغ الفعلي، الفارق، الملاحظة)
- schedule: جدول أعمال (المهمة، المسؤول، الأحد، الإثنين، الثلاثاء، الأربعاء، الخميس)`

  try {
    const aiResponse = await safeGenerateAI({
      system: TEMPLATE_SYSTEM,
      user: message,
      maxTokens: 2000,
      temperature: 0.3,
    })

    if (!aiResponse) {
      return res.json({ action: 'answer', message: 'عذراً، تعذّر توليد الرد. حاول مرة أخرى.' })
    }

    // Try to parse JSON from AI response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        // Validate structure
        if (parsed.action === 'template' && Array.isArray(parsed.rows)) {
          // Prepend header row if not already included
          const allRows = parsed.rows
          if (parsed.headers && allRows[0]?.join('') !== parsed.headers.join('')) {
            allRows.unshift(parsed.headers)
          }
          return res.json({
            action: 'template',
            templateName: parsed.templateName || 'قالب جديد',
            rows: allRows,
            headers: parsed.headers || [],
            message: parsed.message || `تم إنشاء قالب ${parsed.templateName || ''} بنجاح ✅`,
          })
        }
        if (parsed.action === 'macro' && parsed.macro) {
          return res.json({
            action: 'macro',
            macro: parsed.macro,
            message: parsed.message || 'تم إنشاء الـ Macro وتشغيله ✅',
          })
        }
        if (parsed.action === 'data' && Array.isArray(parsed.rows)) {
          return res.json({
            action: 'data',
            rows: parsed.rows,
            headers: parsed.headers || [],
            message: parsed.message || 'تم تحميل البيانات ✅',
          })
        }
        if (parsed.action === 'answer' && parsed.message) {
          return res.json({ action: 'answer', message: parsed.message })
        }
      } catch (_) { /* fall through to text response */ }
    }

    // Fallback: return as plain answer
    return res.json({ action: 'answer', message: aiResponse })
  } catch (err) {
    console.error('[DZ Excel AI]', err.message)
    return res.status(500).json({ action: 'answer', message: 'حدث خطأ في الخادم. حاول مرة أخرى.' })
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

    // Graceful fallback when no AI is available — return a structural overview
    // so the user still gets useful information instead of an empty error.
    if (!result?.content) {
      const overview = [
        `## 📦 نظرة عامة على المستودع: \`${repo}\``,
        `- **اللغة الرئيسية:** ${repoData.language || 'غير محدد'}`,
        `- **النجوم:** ${repoData.stargazers_count} · **الفروع (Forks):** ${repoData.forks_count}`,
        `- **الفرع الافتراضي:** \`${defaultBranch}\``,
        `- **الوصف:** ${repoData.description || '—'}`,
        '',
        `### 📂 الملفات المفحوصة (${files.length})`,
        files.map(f => `- \`${f.path}\``).join('\n') || '_لا توجد ملفات قابلة للقراءة على المستوى الجذري._',
        '',
        '> ⚠️ لم تتوفّر خدمة الذكاء الاصطناعي حالياً. هذه نظرة هيكلية فقط. يمكنك فتح أي ملف لقراءته أو تحليله.',
      ].join('\n')
      return res.status(200).json({
        success: true,
        repo,
        language: repoData.language,
        defaultBranch,
        filesScanned: files.map(f => f.path),
        analysis: overview,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        aiUnavailable: true,
      })
    }

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

// ===== GITHUB SMART-PUSH — Branch → Commit → PR → Vercel =====
// POST /api/dz-agent/github/smart-push
// Body: { files: [{path, content}], commitMessage, prTitle?, prBody?, targetBase? }
app.post('/api/dz-agent/github/smart-push', async (req, res) => {
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط في الأسرار.' })

  const { files, commitMessage, prTitle, prBody, targetBase } = req.body
  if (!files?.length) return res.status(400).json({ error: 'files[] مطلوب.' })

  const REPO = VERCEL_GITHUB_REPO
  const BASE_BRANCH = targetBase || VERCEL_DEPLOY_BRANCH
  const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const NEW_BRANCH = `dz-agent/${TIMESTAMP}`
  const ghH = { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }

  const report = { repo: REPO, baseBranch: BASE_BRANCH, newBranch: NEW_BRANCH, filesCommitted: [], errors: [], prUrl: null, vercelTriggered: false }

  try {
    // 1. Get base branch SHA
    const baseRef = await fetch(`https://api.github.com/repos/${REPO}/git/ref/heads/${encodeURIComponent(BASE_BRANCH)}`, { headers: ghH, signal: AbortSignal.timeout(10000) })
    const baseData = await baseRef.json()
    if (!baseRef.ok || !baseData?.object?.sha) {
      return res.status(502).json({ error: `تعذّر إيجاد الفرع الأساسي "${BASE_BRANCH}": ${baseData?.message || baseRef.status}`, report })
    }
    const baseSha = baseData.object.sha
    const baseTreeSha = (await (await fetch(`https://api.github.com/repos/${REPO}/git/commits/${baseSha}`, { headers: ghH, signal: AbortSignal.timeout(10000) })).json()).tree.sha

    // 2. Create new branch
    const branchRes = await fetch(`https://api.github.com/repos/${REPO}/git/refs`, {
      method: 'POST', headers: ghH, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ ref: `refs/heads/${NEW_BRANCH}`, sha: baseSha }),
    })
    if (!branchRes.ok) {
      const bd = await branchRes.json()
      return res.status(502).json({ error: `فشل إنشاء الفرع: ${bd.message || branchRes.status}`, report })
    }
    console.log(`[SmartPush] ✅ Branch created: ${NEW_BRANCH}`)

    // 3. Create blobs + tree
    const treeItems = []
    for (const file of files) {
      if (!file.path || !file.content) continue
      try {
        const blobRes = await fetch(`https://api.github.com/repos/${REPO}/git/blobs`, {
          method: 'POST', headers: ghH, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ content: Buffer.from(file.content).toString('base64'), encoding: 'base64' }),
        })
        const blobData = await blobRes.json()
        if (blobRes.ok && blobData.sha) {
          treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha })
          report.filesCommitted.push(file.path)
        } else {
          report.errors.push(`فشل رفع ${file.path}: ${blobData.message || blobRes.status}`)
        }
      } catch (e) { report.errors.push(`خطأ في ${file.path}: ${e.message}`) }
    }
    if (!treeItems.length) return res.status(400).json({ error: 'لا ملفات صالحة للرفع.', report })

    // 4. Create tree
    const newTree = await (await fetch(`https://api.github.com/repos/${REPO}/git/trees`, {
      method: 'POST', headers: ghH, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    })).json()

    // 5. Create commit
    const safeMsg = sanitizeString(commitMessage || `chore: DZ Agent auto-push ${TIMESTAMP}`, 200)
    const newCommit = await (await fetch(`https://api.github.com/repos/${REPO}/git/commits`, {
      method: 'POST', headers: ghH, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ message: safeMsg, tree: newTree.sha, parents: [baseSha], author: { name: 'DZ Agent', email: 'agent@dz-gpt.app' } }),
    })).json()

    // 6. Update branch ref
    await fetch(`https://api.github.com/repos/${REPO}/git/refs/heads/${encodeURIComponent(NEW_BRANCH)}`, {
      method: 'PATCH', headers: ghH, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    })
    console.log(`[SmartPush] ✅ Committed: ${newCommit.sha?.slice(0, 8)} — ${treeItems.length} files`)

    // 7. Create PR
    const pr = await (await fetch(`https://api.github.com/repos/${REPO}/pulls`, {
      method: 'POST', headers: ghH, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        title: sanitizeString(prTitle || `🤖 DZ Agent: ${safeMsg}`, 150),
        body: sanitizeString(prBody || `**Auto-generated by DZ Agent**\n\nFiles: ${report.filesCommitted.join(', ')}\nCommit: ${newCommit.sha?.slice(0, 8)}\nBranch: \`${NEW_BRANCH}\` → \`${BASE_BRANCH}\``, 1000),
        head: NEW_BRANCH,
        base: BASE_BRANCH,
        draft: false,
      }),
    })).json()
    report.prUrl = pr.html_url || null
    console.log(`[SmartPush] ✅ PR: ${report.prUrl}`)

    // 8. Trigger Vercel deploy
    const vercelToken = process.env.VERCEL_TOKEN
    if (vercelToken) {
      try {
        const vr = await fetch('https://api.vercel.com/v13/deployments', {
          method: 'POST', signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'dz-gpt', project: VERCEL_PROJECT_ID, target: 'production', gitSource: { type: 'github', repoId: '1191199822', ref: BASE_BRANCH, sha: baseSha } }),
        })
        const vd = await vr.json()
        report.vercelTriggered = vr.ok
        report.vercelDeployId = vd.id || null
        console.log(`[SmartPush] ⚡ Vercel: ${vr.ok ? 'triggered' : 'failed'} — ${vd.id || vd.error?.message || vr.status}`)
      } catch (ve) { report.errors.push(`Vercel: ${ve.message}`) }
    }

    return res.json({
      success: true,
      repo: REPO,
      newBranch: NEW_BRANCH,
      baseBranch: BASE_BRANCH,
      commitSha: newCommit.sha,
      shortSha: newCommit.sha?.slice(0, 8),
      filesCommitted: report.filesCommitted,
      prUrl: report.prUrl,
      vercelTriggered: report.vercelTriggered,
      vercelDeployId: report.vercelDeployId || null,
      errors: report.errors,
      liveUrl: 'https://dz-gpt.vercel.app',
    })
  } catch (err) {
    console.error('[SmartPush] error:', err.message)
    return res.status(500).json({ error: err.message, report })
  }
})

// ===== DZ AGENT BUILD — SSE pipeline: analyze → generate → push → pages → vercel =====
// POST /api/dz-agent/github/agent-build
app.post('/api/dz-agent/github/agent-build', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  const { task, repoName, repoOwner = 'Nadirinfograph23' } = req.body
  if (!task) { send({ type: 'error', message: 'task مطلوب' }); return res.end() }

  const tok = resolveGitHubToken()
  if (!tok) { send({ type: 'error', message: 'GITHUB_TOKEN غير مضبوط' }); return res.end() }

  const hdr = ghHeaders(tok)
  const safeRepo = sanitizeString(
    repoName || task.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40),
    60
  ).replace(/^-+|-+$/g, '') || 'dz-agent-project'

  try {
    // ── STEP 1: Analyze ──────────────────────────────────────────────────────
    send({ type: 'step', step: 'analyze', status: 'running', detail: 'تحليل المهمة وتحديد نوع المشروع...' })
    const taskLower = task.toLowerCase()
    const projectType = taskLower.includes('react') || taskLower.includes('vite') ? 'React'
      : taskLower.includes('bootstrap') ? 'Bootstrap'
      : taskLower.includes('dashboard') || taskLower.includes('لوحة') ? 'Dashboard'
      : 'HTML/CSS/JS'
    send({ type: 'detail', step: 'analyze', text: `نوع المشروع: ${projectType}` })
    send({ type: 'detail', step: 'analyze', text: `اسم المستودع: ${repoOwner}/${safeRepo}` })
    send({ type: 'step', step: 'analyze', status: 'done' })

    // ── STEP 2: Generate code with AI (ULTRA_MODERN_MODE) ────────────────────
    send({ type: 'step', step: 'generate', status: 'running', detail: 'توليد موقع عصري بالذكاء الاصطناعي...' })

    // Detect site type from task text for correct image pool + design mode
    const taskForType = task.toLowerCase()
    let detectedSiteType = 'landing'
    for (const [key, poolKey] of Object.entries(SITE_TYPE_TO_IMAGE_KEY)) {
      if (taskForType.includes(key)) { detectedSiteType = poolKey; break }
    }
    send({ type: 'detail', step: 'generate', text: `🎨 نمط التصميم: ${detectedSiteType.toUpperCase()}` })

    // Build image pool block (real Unsplash CDN images)
    const imagePoolBlock = buildImagePoolBlock(detectedSiteType)

    // Use the same elite prompt as the Web Builder
    const agentBuildSystem = WEBSITE_BUILDER_SYSTEM_PROMPT + imagePoolBlock
    const agentBuildUser   = `Design request: "${task}"\n[Site type: ${detectedSiteType} | Repo: ${safeRepo} | Deploy: https://${repoOwner}.github.io/${safeRepo}]`

    let generatedHtml = ''
    try {
      const aiResult = await safeGenerateAI({
        messages: [
          { role: 'system', content: agentBuildSystem },
          { role: 'user',   content: agentBuildUser },
        ],
        query: task,
        max_tokens: 8000,
        taskHint: 'web-builder',
      })
      generatedHtml = extractHtmlFromResponse(aiResult.content || '') || aiResult.content || ''
    } catch (aiErr) {
      send({ type: 'detail', step: 'generate', text: `⚠️ AI timeout — استخدام template عصري` })
    }

    // Validate HTML quality
    const htmlValid = validateHtmlOutput(generatedHtml)

    // Modern fallback template (only if AI fully fails)
    if (!htmlValid.ok) {
      send({ type: 'detail', step: 'generate', text: `⚠️ ${htmlValid.reason} — fallback template` })
      const imgPool = getWebBuilderImagePool(detectedSiteType)
      const hero = imgPool[0] || ''
      generatedHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${task}</title>
  <meta name="description" content="${task} — أُنشئ بواسطة DZ Agent">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://unpkg.com/aos@2.3.4/dist/aos.css" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    :root{--primary:#6366f1;--accent:#a855f7;--bg:#0a0a0f;--surface:#111118;}
    *{font-family:'Inter',sans-serif;box-sizing:border-box;}
    body{background:var(--bg);color:#f1f5f9;margin:0;}
    .gradient-text{background:linear-gradient(135deg,#fff 0%,var(--primary) 50%,var(--accent) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
    .glass-card{background:rgba(255,255,255,0.03);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.08);border-radius:16px;transition:all .3s ease;}
    .glass-card:hover{background:rgba(255,255,255,0.06);transform:translateY(-4px);}
    .btn-glow{background:linear-gradient(135deg,var(--primary),var(--accent));border-radius:50px;padding:14px 32px;font-weight:700;color:#fff;border:none;cursor:pointer;transition:all .3s;box-shadow:0 4px 24px rgba(99,102,241,.4);}
    .btn-glow:hover{transform:translateY(-2px);box-shadow:0 8px 40px rgba(99,102,241,.6);}
    .mesh-hero{background:radial-gradient(ellipse 80% 60% at 20% 40%,rgba(99,102,241,.25) 0%,transparent 60%),radial-gradient(ellipse 60% 80% at 80% 60%,rgba(168,85,247,.15) 0%,transparent 60%),var(--bg);}
    nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(20px);background:rgba(10,10,15,.8);border-bottom:1px solid rgba(255,255,255,.06);}
  </style>
</head>
<body>
  <nav class="px-8 py-4 flex justify-between items-center">
    <div class="text-xl font-bold gradient-text">${task}</div>
    <button class="btn-glow text-sm px-6 py-2">ابدأ الآن</button>
  </nav>
  <section class="mesh-hero min-h-screen flex flex-col items-center justify-center text-center px-6 py-20">
    ${hero ? `<img src="${hero}" alt="hero" class="w-full max-w-2xl rounded-2xl mb-10 shadow-2xl object-cover" style="max-height:400px;" onerror="this.style.display='none'">` : ''}
    <div class="text-sm font-semibold text-indigo-400 tracking-widest mb-4 uppercase">أُنشئ بواسطة DZ Agent 🤖</div>
    <h1 class="text-5xl md:text-7xl font-black mb-6 gradient-text leading-tight">${task}</h1>
    <p class="text-slate-400 text-xl max-w-xl mb-10">منصة متكاملة وعصرية — مصمّمة بأحدث تقنيات 2026</p>
    <div class="flex gap-4 flex-wrap justify-center">
      <button class="btn-glow">اكتشف المزيد <i class="fa fa-arrow-left mr-2"></i></button>
      <button class="glass-card px-8 py-4 font-semibold">تواصل معنا</button>
    </div>
  </section>
  <footer class="text-center py-8 text-slate-500 text-sm border-t border-white/5">
    © <span id="yr"></span> — ${task} — تطوير DZ Agent 🇩🇿
  </footer>
  <script src="https://unpkg.com/aos@2.3.4/dist/aos.js"></script>
  <script>AOS.init({duration:700,once:true});document.getElementById('yr').textContent=new Date().getFullYear();</script>
</body>
</html>`
    }

    const projectFiles = [
      { path: 'index.html', content: generatedHtml },
      { path: 'README.md',  content: `# ${safeRepo}\n\n> ${task}\n\n**نوع التصميم:** ${detectedSiteType}\n\nتم الإنشاء تلقائياً بواسطة [DZ Agent](https://dz-gpt.vercel.app) 🤖\n\n## 🌐 عرض مباشر\nhttps://${repoOwner}.github.io/${safeRepo}\n\n## 🚀 تقنيات مستخدمة\n- Tailwind CSS\n- Font Awesome 6\n- AOS Animations\n- Google Fonts` },
    ]

    send({ type: 'detail', step: 'generate', text: `✅ موقع ${detectedSiteType} جاهز (${(generatedHtml.length / 1024).toFixed(1)} KB)` })
    // Send generated HTML for live preview before publishing
    send({ type: 'preview', html: generatedHtml, siteType: detectedSiteType })
    send({ type: 'step', step: 'generate', status: 'done' })

    // ── STEP 3: Push to GitHub ────────────────────────────────────────────────
    send({ type: 'step', step: 'push', status: 'running', detail: `إنشاء/فحص المستودع ${repoOwner}/${safeRepo}...` })

    // Check if repo exists
    const repoCheck = await fetch(`https://api.github.com/repos/${repoOwner}/${safeRepo}`, {
      headers: hdr, signal: AbortSignal.timeout(8000),
    })

    if (!repoCheck.ok) {
      send({ type: 'detail', step: 'push', text: `📦 إنشاء مستودع جديد: ${safeRepo}` })
      const createRes = await fetch(`https://api.github.com/user/repos`, {
        method: 'POST', headers: hdr, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          name: safeRepo,
          description: task.slice(0, 100),
          auto_init: true,
          private: false,
          homepage: `https://${repoOwner}.github.io/${safeRepo}`,
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json()
        throw new Error(`فشل إنشاء المستودع: ${err.message}`)
      }
      await new Promise(r => setTimeout(r, 2500))
    } else {
      send({ type: 'detail', step: 'push', text: `✅ المستودع موجود: ${safeRepo}` })
    }

    // Push files one by one
    const pushedFiles = []
    let lastCommitSha = null
    for (const file of projectFiles) {
      if (!file.path || !file.content) continue
      let fileSha = null
      try {
        const getRes = await fetch(
          `https://api.github.com/repos/${repoOwner}/${safeRepo}/contents/${encodeURIComponent(file.path)}`,
          { headers: hdr, signal: AbortSignal.timeout(6000) }
        )
        if (getRes.ok) fileSha = (await getRes.json()).sha
      } catch {}

      const putRes = await fetch(
        `https://api.github.com/repos/${repoOwner}/${safeRepo}/contents/${encodeURIComponent(file.path)}`,
        {
          method: 'PUT', headers: hdr, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({
            message: `🤖 DZ Agent: add ${file.path}`,
            content: Buffer.from(file.content).toString('base64'),
            ...(fileSha ? { sha: fileSha } : {}),
          }),
        }
      )
      if (putRes.ok) {
        const pd = await putRes.json()
        pushedFiles.push(file.path)
        lastCommitSha = pd.commit?.sha || lastCommitSha
        send({ type: 'detail', step: 'push', text: `✅ ${file.path}` })
      } else {
        const e = await putRes.json().catch(() => ({}))
        send({ type: 'detail', step: 'push', text: `❌ ${file.path}: ${e.message || putRes.status}` })
      }
    }

    send({ type: 'step', step: 'push', status: 'done' })

    // ── STEP 4: GitHub Pages ──────────────────────────────────────────────────
    send({ type: 'step', step: 'deploy', status: 'running', detail: 'تفعيل GitHub Pages...' })

    let pagesUrl = null
    const pagesRes = await fetch(`https://api.github.com/repos/${repoOwner}/${safeRepo}/pages`, {
      method: 'POST', headers: hdr, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
    })

    if (pagesRes.ok || pagesRes.status === 409) {
      pagesUrl = `https://${repoOwner}.github.io/${safeRepo}`
      send({ type: 'detail', step: 'deploy', text: `✅ GitHub Pages: ${pagesUrl}` })
    } else {
      const pe = await pagesRes.json().catch(() => ({}))
      send({ type: 'detail', step: 'deploy', text: `⚠️ Pages: ${pe.message || pagesRes.status} (قد يحتاج تفعيلاً يدوياً)` })
    }

    send({ type: 'step', step: 'deploy', status: 'done' })

    // ── STEP 5: Vercel sync ───────────────────────────────────────────────────
    send({ type: 'step', step: 'verify', status: 'running', detail: 'مزامنة DZ-GPT مع Vercel...' })

    let vercelDeployId = null
    const vercelToken = process.env.VERCEL_TOKEN
    if (vercelToken) {
      try {
        const vr = await fetch('https://api.vercel.com/v13/deployments', {
          method: 'POST', signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'dz-gpt',
            project: SYNC_VERCEL_PROJECT_ID,
            target: 'production',
            gitSource: {
              type: 'github',
              repoId: '1191199822',
              ref: PRODUCTION_BRANCH,
            },
          }),
        })
        const vd = await vr.json()
        vercelDeployId = vd.id || null
        send({ type: 'detail', step: 'verify', text: vr.ok ? `✅ Vercel deploy triggered: ${(vd.id || '').slice(0, 12)}` : `⚠️ Vercel: ${vd.error?.message || vr.status}` })
      } catch (ve) {
        send({ type: 'detail', step: 'verify', text: `⚠️ Vercel: ${ve.message}` })
      }
    } else {
      send({ type: 'detail', step: 'verify', text: '⚠️ VERCEL_TOKEN غير مضبوط' })
    }

    send({ type: 'step', step: 'verify', status: 'done' })

    // ── Final result ──────────────────────────────────────────────────────────
    send({
      type: 'result',
      data: {
        repoUrl: `https://github.com/${repoOwner}/${safeRepo}`,
        pagesUrl,
        vercelUrl: 'https://dz-gpt.vercel.app',
        commitSha: lastCommitSha,
        files: pushedFiles,
        vercelDeployId,
      },
    })

    console.log(`[AgentBuild] ✅ ${repoOwner}/${safeRepo} — ${pushedFiles.length} files — Pages: ${pagesUrl}`)

  } catch (err) {
    send({ type: 'error', message: err.message })
    console.error('[AgentBuild]', err.message)
  }

  res.end()
})

// ===== AGENT EDIT — تعديل موقع منشور وإعادة نشره =====
// POST /api/dz-agent/github/agent-edit  (SSE)
// يعدّل index.html الموجود بناءً على طلب المستخدم ويعيد النشر
app.post('/api/dz-agent/github/agent-edit', async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  const { owner, repo, editRequest, currentHtml } = req.body
  if (!owner || !repo || !editRequest) {
    send({ type: 'error', message: 'owner, repo, editRequest مطلوبة' })
    return res.end()
  }

  const tok = resolveGitHubToken()
  if (!tok) { send({ type: 'error', message: 'GITHUB_TOKEN غير مضبوط' }); return res.end() }

  try {
    // STEP 1: Fetch current HTML from GitHub
    send({ type: 'step', step: 'fetch', status: 'running', detail: 'جلب الكود الحالي من GitHub...' })

    let existingHtml = currentHtml || ''
    if (!existingHtml) {
      const fileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/index.html`, {
        headers: ghHeaders(tok), signal: AbortSignal.timeout(10000),
      })
      if (fileRes.ok) {
        const fileData = await fileRes.json()
        existingHtml = Buffer.from(fileData.content, 'base64').toString('utf-8')
        send({ type: 'detail', step: 'fetch', text: `✅ جُلب index.html (${(existingHtml.length / 1024).toFixed(1)} KB)` })
      } else {
        send({ type: 'detail', step: 'fetch', text: '⚠️ لم يُعثر على index.html — سيتم التوليد من الصفر' })
      }
    } else {
      send({ type: 'detail', step: 'fetch', text: `✅ استُخدم HTML المحلي (${(existingHtml.length / 1024).toFixed(1)} KB)` })
    }
    send({ type: 'step', step: 'fetch', status: 'done' })

    // STEP 2: AI modifies the HTML
    send({ type: 'step', step: 'modify', status: 'running', detail: 'الذكاء الاصطناعي يعدّل الموقع...' })

    const editSystem = `You are an expert web developer. The user wants to modify an existing HTML website.
Apply ONLY the requested changes. Keep all other parts of the site exactly as they are.
Return ONLY the complete modified HTML file — no explanations, no markdown fences.
The output must be a valid, complete HTML file starting with <!DOCTYPE html>.`

    const editUser = existingHtml
      ? `CURRENT WEBSITE HTML:\n\`\`\`html\n${existingHtml.slice(0, 12000)}\n\`\`\`\n\nREQUESTED CHANGE: "${editRequest}"\n\nReturn the complete modified HTML.`
      : `Create a new website with this request: "${editRequest}"\nReturn complete HTML only.`

    const aiResult = await safeGenerateAI({
      messages: [
        { role: 'system', content: editSystem },
        { role: 'user',   content: editUser },
      ],
      query: editRequest,
      max_tokens: 8000,
      taskHint: 'web-builder',
    })

    const modifiedHtml = extractHtmlFromResponse(aiResult.content || '') || aiResult.content || ''
    const valid = validateHtmlOutput(modifiedHtml)

    if (!valid.ok) {
      send({ type: 'error', message: `فشل توليد HTML: ${valid.reason}` })
      return res.end()
    }

    send({ type: 'detail', step: 'modify', text: `✅ HTML معدَّل (${(modifiedHtml.length / 1024).toFixed(1)} KB)` })
    send({ type: 'preview', html: modifiedHtml })
    send({ type: 'step', step: 'modify', status: 'done' })

    // STEP 3: Push modified file to GitHub
    send({ type: 'step', step: 'push', status: 'running', detail: 'رفع التعديلات إلى GitHub...' })

    const { waitForMainBranch } = await import('./lib/github-pages/index.js')
    const branchInfo = await waitForMainBranch(tok, owner, repo)

    const pushResult = await ghPagesBatchPush(
      tok, owner, repo,
      [{ path: 'index.html', content: modifiedHtml }],
      `✏️ تعديل: ${editRequest.slice(0, 80)} — DZ Agent 🤖`,
      branchInfo.branch
    )
    const commitSha = typeof pushResult === 'string' ? pushResult : pushResult?.sha || ''
    send({ type: 'detail', step: 'push', text: `✅ commit: ${commitSha.slice(0, 12)}` })
    send({ type: 'step', step: 'push', status: 'done' })

    send({
      type: 'result',
      data: {
        repoUrl:   `https://github.com/${owner}/${repo}`,
        pagesUrl:  `https://${owner}.github.io/${repo}`,
        commitSha,
        modifiedHtml,
      },
    })

    console.log(`[AgentEdit] ✅ ${owner}/${repo} — "${editRequest.slice(0, 60)}"`)
  } catch (err) {
    send({ type: 'error', message: err.message })
    console.error('[AgentEdit]', err.message)
  }
  res.end()
})

// ===== GITHUB AGENT — وكيل GitHub التنفيذي الموحّد =====
// POST /api/dz-agent/github/agent
// يكشف النية تلقائياً ويُنفّذ: create_repo | pages_deploy | update_files | delete_file | list | status
app.post('/api/dz-agent/github/agent', async (req, res) => {
  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN غير مضبوط في الأسرار.' })

  const { action, repo, owner, files, commitMessage, description, isPrivate, repoName, siteType, prompt, htmlContent, path: filePath, branch, prTitle, prBody } = req.body

  const REPORT = {
    action: action || 'auto',
    repo: repo || repoName || null,
    repoCreated: false,
    branchReady: false,
    filesUploaded: [],
    pagesEnabled: false,
    pagesUrl: null,
    prUrl: null,
    vercelTriggered: false,
    errors: [],
    fixes: [],
  }

  // ── Intent auto-detect if no explicit action ─────────────────────────────
  let resolvedAction = action || 'unknown'
  if (!action && req.body.message) {
    const msg = (req.body.message || '').toLowerCase()
    if (/انش[إئ]|create.?repo|new.?repo/.test(msg)) resolvedAction = 'create_repo'
    else if (/pages|github\.io|انشر.?موقع|deploy.?site/.test(msg)) resolvedAction = 'pages_deploy'
    else if (/عدّل|حدّث|update|modify|push.?file/.test(msg)) resolvedAction = 'update_files'
    else if (/احذف|delete|remove.?file/.test(msg)) resolvedAction = 'delete_file'
    else if (/اعرض|list|show.?files/.test(msg)) resolvedAction = 'list'
    else if (/حالة|status|state/.test(msg)) resolvedAction = 'status'
    else resolvedAction = 'pages_deploy'
  }
  REPORT.action = resolvedAction

  // Helper: validate and auto-fix repo name
  function safeRepoName(raw) {
    const fixed = sanitizeRepoName(raw || 'my-site')
    if (fixed !== raw) REPORT.fixes.push(`اسم المستودع صُحِّح: "${raw}" → "${fixed}"`)
    return fixed
  }

  try {
    // ══════════════════════════════════════════════════════════
    // ACTION: create_repo
    // ══════════════════════════════════════════════════════════
    if (resolvedAction === 'create_repo') {
      const safeName = safeRepoName(repoName || repo?.split('/')[1] || 'my-repo')
      const ghH = { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }

      // Check token identity
      const userRes = await fetch('https://api.github.com/user', { headers: ghH, signal: AbortSignal.timeout(8000) })
      if (!userRes.ok) return res.status(502).json({ error: 'فشل التحقق من هوية GitHub Token.', report: REPORT })
      const user = await userRes.json()
      const repoFullName = `${user.login}/${safeName}`

      // Create repo with auto_init (always non-empty)
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST', headers: ghH, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ name: safeName, description: (description || '').slice(0, 255), private: !!isPrivate, auto_init: true, has_wiki: false, has_projects: false }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) {
        if (createRes.status === 422) REPORT.errors.push(`المستودع "${safeName}" موجود مسبقاً.`)
        else return res.status(createRes.status).json({ error: createData.message || 'فشل إنشاء المستودع.', report: REPORT })
      } else {
        REPORT.repoCreated = true
        REPORT.repo = repoFullName
        REPORT.fixes.push(`✅ تم إنشاء المستودع: ${repoFullName}`)
        await new Promise(r => setTimeout(r, 1500))
      }

      // Wait for main branch
      let mainBranch = 'main'
      for (let i = 0; i < 8; i++) {
        const br = await fetch(`https://api.github.com/repos/${repoFullName}/git/ref/heads/main`, { headers: ghH, signal: AbortSignal.timeout(8000) })
        if (br.ok) { REPORT.branchReady = true; break }
        const master = await fetch(`https://api.github.com/repos/${repoFullName}/git/ref/heads/master`, { headers: ghH, signal: AbortSignal.timeout(8000) })
        if (master.ok) { mainBranch = 'master'; REPORT.branchReady = true; break }
        await new Promise(r => setTimeout(r, 2000))
      }
      if (!REPORT.branchReady) REPORT.errors.push('انتهت مهلة انتظار الفرع الرئيسي.')

      // Upload files if provided
      if (files?.length && REPORT.branchReady) {
        for (const file of files) {
          if (!file.path || !file.content) continue
          try {
            let sha; const ex = await fetch(`https://api.github.com/repos/${repoFullName}/contents/${file.path}?ref=${mainBranch}`, { headers: ghH, signal: AbortSignal.timeout(8000) })
            if (ex.ok) { const ed = await ex.json(); sha = ed.sha }
            const body = { message: commitMessage || `feat: add ${file.path} via DZ Agent`, content: Buffer.from(file.content).toString('base64'), branch: mainBranch, ...(sha ? { sha } : {}) }
            const cr = await fetch(`https://api.github.com/repos/${repoFullName}/contents/${file.path}`, { method: 'PUT', headers: ghH, signal: AbortSignal.timeout(15000), body: JSON.stringify(body) })
            if (cr.ok) REPORT.filesUploaded.push(file.path)
            else REPORT.errors.push(`فشل رفع ${file.path}: ${(await cr.json()).message}`)
          } catch (e) { REPORT.errors.push(`خطأ في ${file.path}: ${e.message}`) }
        }
      }

      // Auto-create index.html + README if no files provided
      if (!files?.length && REPORT.branchReady) {
        const defaultHtml = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeName}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0d1117;color:#e6edf3;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{text-align:center;padding:3rem;border:1px solid #30363d;border-radius:12px;max-width:500px}.badge{background:#238636;color:#fff;padding:4px 12px;border-radius:20px;font-size:.8rem;margin-bottom:1rem;display:inline-block}h1{font-size:2rem;margin:.5rem 0;background:linear-gradient(135deg,#58a6ff,#79c0ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#8b949e;margin-top:1rem}</style></head><body><div class="card"><div class="badge">🚀 DZ Agent</div><h1>${safeName}</h1><p>تم إنشاء هذا المشروع تلقائياً بواسطة DZ Agent</p></div></body></html>`
        const idxBody = { message: 'feat: initial index.html via DZ Agent', content: Buffer.from(defaultHtml).toString('base64'), branch: mainBranch }
        let sha; const exIdx = await fetch(`https://api.github.com/repos/${repoFullName}/contents/index.html?ref=${mainBranch}`, { headers: ghH, signal: AbortSignal.timeout(8000) })
        if (exIdx.ok) { const ed = await exIdx.json(); sha = ed.sha; if (sha) idxBody.sha = sha }
        const idxRes = await fetch(`https://api.github.com/repos/${repoFullName}/contents/index.html`, { method: 'PUT', headers: ghH, signal: AbortSignal.timeout(15000), body: JSON.stringify(idxBody) })
        if (idxRes.ok) { REPORT.filesUploaded.push('index.html'); REPORT.fixes.push('✅ تم إنشاء index.html افتراضي') }
      }

      return res.json({
        success: true,
        report: REPORT,
        repoUrl: `https://github.com/${repoFullName}`,
        cloneUrl: `https://github.com/${repoFullName}.git`,
        defaultBranch: 'main',
      })
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: pages_deploy
    // ══════════════════════════════════════════════════════════
    if (resolvedAction === 'pages_deploy') {
      const { deployGitHubPages: dgp } = await import('./lib/github-pages/index.js')
      const safeName = safeRepoName(repoName || siteType ? `${siteType}-site` : 'my-site')
      const result = await dgp({ token, prompt: prompt || description || '', siteType: siteType || 'landing', repoName: safeName, description: (description || prompt || '').slice(0, 150), htmlContent: htmlContent || '' })
      REPORT.repoCreated = true; REPORT.branchReady = true; REPORT.pagesEnabled = true; REPORT.pagesUrl = result.siteUrl; REPORT.filesUploaded = ['index.html']
      return res.json({ success: true, report: REPORT, ...result })
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: update_files — push files to existing repo
    // ══════════════════════════════════════════════════════════
    if (resolvedAction === 'update_files') {
      const targetRepo = repo || repoName
      if (!targetRepo) return res.status(400).json({ error: 'repo مطلوب لتحديث الملفات.', report: REPORT })
      const ghH = { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
      const targetBranch = branch || 'main'
      for (const file of (files || [])) {
        if (!file.path || !file.content) continue
        try {
          let sha; const ex = await fetch(`https://api.github.com/repos/${targetRepo}/contents/${file.path}?ref=${targetBranch}`, { headers: ghH, signal: AbortSignal.timeout(8000) })
          if (ex.ok) { const ed = await ex.json(); sha = ed.sha }
          const body = { message: sanitizeString(commitMessage || `chore: update ${file.path} via DZ Agent`, 200), content: Buffer.from(file.content).toString('base64'), branch: targetBranch, ...(sha ? { sha } : {}) }
          const cr = await fetch(`https://api.github.com/repos/${targetRepo}/contents/${file.path}`, { method: 'PUT', headers: ghH, signal: AbortSignal.timeout(15000), body: JSON.stringify(body) })
          if (cr.ok) REPORT.filesUploaded.push(file.path)
          else { const cd = await cr.json(); REPORT.errors.push(`فشل تحديث ${file.path}: ${cd.message}`) }
        } catch (e) { REPORT.errors.push(`خطأ في ${file.path}: ${e.message}`) }
      }

      // Trigger Vercel if it's the main DZ-GPT repo
      if (targetRepo === VERCEL_GITHUB_REPO && process.env.VERCEL_TOKEN) {
        try {
          const vr = await fetch('https://api.vercel.com/v13/deployments', {
            method: 'POST', signal: AbortSignal.timeout(20000),
            headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'dz-gpt', project: VERCEL_PROJECT_ID, target: 'production', gitSource: { type: 'github', repoId: '1191199822', ref: VERCEL_DEPLOY_BRANCH } }),
          })
          REPORT.vercelTriggered = vr.ok
        } catch {}
      }

      return res.json({ success: REPORT.filesUploaded.length > 0, report: REPORT, filesUpdated: REPORT.filesUploaded, errors: REPORT.errors })
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: delete_file
    // ══════════════════════════════════════════════════════════
    if (resolvedAction === 'delete_file') {
      const targetRepo = repo || repoName
      if (!targetRepo || !filePath) return res.status(400).json({ error: 'repo و path مطلوبان للحذف.', report: REPORT })
      const ghH = { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0', Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }
      const targetBranch = branch || 'main'
      const ex = await fetch(`https://api.github.com/repos/${targetRepo}/contents/${filePath}?ref=${targetBranch}`, { headers: ghH, signal: AbortSignal.timeout(8000) })
      if (!ex.ok) return res.status(404).json({ error: `الملف "${filePath}" غير موجود.`, report: REPORT })
      const { sha: fileSha } = await ex.json()
      const dr = await fetch(`https://api.github.com/repos/${targetRepo}/contents/${filePath}`, {
        method: 'DELETE', headers: ghH, signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ message: sanitizeString(commitMessage || `chore: delete ${filePath} via DZ Agent`, 200), sha: fileSha, branch: targetBranch }),
      })
      if (!dr.ok) { const dd = await dr.json(); return res.status(dr.status).json({ error: dd.message || 'فشل الحذف.', report: REPORT }) }
      REPORT.fixes.push(`✅ تم حذف الملف: ${filePath}`)
      return res.json({ success: true, report: REPORT, deleted: filePath })
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: list — list files in repo
    // ══════════════════════════════════════════════════════════
    if (resolvedAction === 'list') {
      const targetRepo = repo || repoName
      if (!targetRepo) return res.status(400).json({ error: 'repo مطلوب.', report: REPORT })
      const ghH = { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0', Accept: 'application/vnd.github+json' }
      const listRes = await fetch(`https://api.github.com/repos/${targetRepo}/contents/${filePath || ''}?ref=${branch || 'main'}`, { headers: ghH, signal: AbortSignal.timeout(10000) })
      if (!listRes.ok) return res.status(listRes.status).json({ error: `تعذّر الوصول إلى المستودع.`, report: REPORT })
      const files = (await listRes.json()).map(f => ({ name: f.name, path: f.path, type: f.type, size: f.size }))
      return res.json({ success: true, report: REPORT, files })
    }

    // ══════════════════════════════════════════════════════════
    // ACTION: status — check repo + Pages status
    // ══════════════════════════════════════════════════════════
    if (resolvedAction === 'status') {
      const targetRepo = repo || repoName
      if (!targetRepo) return res.status(400).json({ error: 'repo مطلوب.', report: REPORT })
      const ghH = { Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/1.0', Accept: 'application/vnd.github+json' }
      const [repoRes, pagesRes] = await Promise.allSettled([
        fetch(`https://api.github.com/repos/${targetRepo}`, { headers: ghH, signal: AbortSignal.timeout(8000) }),
        fetch(`https://api.github.com/repos/${targetRepo}/pages`, { headers: ghH, signal: AbortSignal.timeout(8000) }),
      ])
      const repoData = repoRes.status === 'fulfilled' && repoRes.value.ok ? await repoRes.value.json() : {}
      const pagesData = pagesRes.status === 'fulfilled' && pagesRes.value.ok ? await pagesRes.value.json() : null
      return res.json({
        success: true,
        report: REPORT,
        repo: { name: repoData.name, fullName: repoData.full_name, defaultBranch: repoData.default_branch, private: repoData.private, stars: repoData.stargazers_count, url: repoData.html_url },
        pages: pagesData ? { status: pagesData.status, url: pagesData.html_url, branch: pagesData.source?.branch } : null,
      })
    }

    return res.status(400).json({ error: `الإجراء "${resolvedAction}" غير معروف. المتاح: create_repo | pages_deploy | update_files | delete_file | list | status`, report: REPORT })

  } catch (err) {
    console.error('[GitHubAgent]', err.message)
    return res.status(500).json({ error: err.message, report: REPORT })
  }
})

// ===== CHAT ROOM — IN-MEMORY STATE =====
const chatMessages = []
const chatSessions = new Map()  // id → { id, name, gender, isAdmin, lastSeen, ws, ip, profile }
const mutedUsers = new Map()    // userId → { until: timestamp, durationMs: number }
const bannedIPs = new Set()     // Permanent IP bans
let pinnedMessage = null        // { id, text, from, timestamp } | null
const CHAT_ADMIN_SECRET = process.env.CHAT_ADMIN_SECRET || 'openit1979##'
const MAX_CHAT_MSGS = 200

function chatId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36)
}

function getClientIp(reqOrHeaders) {
  const headers = reqOrHeaders?.headers || reqOrHeaders || {}
  const forwarded = headers['x-forwarded-for'] || headers['x-real-ip'] || ''
  const socketAddr = reqOrHeaders?.socket?.remoteAddress || reqOrHeaders?.connection?.remoteAddress || ''
  return (forwarded.split(',')[0] || socketAddr || '').trim()
}

function getOnlineUsers() {
  const now = Date.now()
  return [...chatSessions.values()]
    .filter(s => now - s.lastSeen < 40000)
    .map(s => ({ id: s.id, name: s.name, gender: s.gender, isAdmin: s.isAdmin, profile: s.profile || null, avatar: s.avatar || null, status: s.status || 'online' }))
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
  dbPushMsg(msg).catch(() => {})
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

  try {
    // ── Breaking news broadcast (agent only) ─────────────────────────────
    if (isAgent) {
      const breakingArticles = getBreakingNewsFromCache()
      if (breakingArticles.length > 0) {
        const breakingText = '🔴 عاجل: ' + breakingArticles.map(a => a.title).join(' | ')
        const breakingMsg = pushChatMsg({
          id: chatId(), from: 'DZ Agent', fromId: 'bot', gender: 'bot',
          text: breakingText, timestamp: Date.now(), isBot: true, botType: 'agent',
          isBreaking: true, triggeredBy: authorSession.name,
        })
        broadcastChat({ type: 'message', msg: breakingMsg })
      }
    }

    // ── Algeria knowledge system (agent only) ────────────────────────────
    if (isAgent && isAlgerianCitizenQuery(question)) {
      const algeriaResult = searchAlgeria(question)
      if (algeriaResult) {
        const content = formatAlgeriaResponse(algeriaResult)
        const botMsg = pushChatMsg({
          id: chatId(), from: 'DZ Agent', fromId: 'bot', gender: 'bot',
          text: content, timestamp: Date.now(), isBot: true, botType: 'agent',
          triggeredBy: authorSession.name,
        })
        broadcastChat({ type: 'message', msg: botMsg })
        return botMsg
      }
    }

    // ── Live context injection (agent only) ──────────────────────────────
    let liveContext = ''
    if (isAgent) {
      const lowerQ = question.toLowerCase()

      // News context — inject when question is about news/events/Algeria
      const newsKw = ['خبر', 'أخبار', 'news', 'actu', 'حوادث', 'اليوم', 'الآن', 'الجزائر', 'جديد', 'حدث', 'عاجل']
      if (newsKw.some(k => lowerQ.includes(k))) {
        const allArticles = []
        for (const [, cached] of GN_RSS_CACHE.entries()) {
          if (cached?.data) allArticles.push(...cached.data)
        }
        if (allArticles.length > 0) {
          liveContext += '\n\n📰 آخر الأخبار المتاحة:\n' +
            allArticles.slice(0, 8).map(a => {
              const src = a.source || 'المصدر'
              const url = a.link || a.url
              return `• ${a.title}${url ? ` — [${src}](${url})` : src ? ` (${src})` : ''}`
            }).join('\n')
        }
      }

      // Sports context — fetch live football data
      const sportsKw = ['رياضة', 'مباراة', 'مباريات', 'كرة', 'دوري', 'نتائج', 'هدف', 'فريق', 'منتخب', 'lfp', 'football', 'sport', 'match', 'score', 'ligue', 'رياض', 'محرز', 'بلايلي', 'بونجاح']
      if (sportsKw.some(k => lowerQ.includes(k))) {
        try {
          const [lfpRes, sfRes] = await Promise.allSettled([
            fetchLFPData(),
            fetchSofaScoreFootball(new Date().toISOString().slice(0, 10)),
          ])
          if (lfpRes.status === 'fulfilled' && lfpRes.value) {
            const lfp = lfpRes.value
            const played = (lfp.matches || []).filter(m => m.played).slice(0, 5)
            const upcoming = (lfp.matches || []).filter(m => !m.played).slice(0, 4)
            if (played.length > 0) {
              liveContext += '\n\n⚽ **نتائج LFP الأخيرة:**\n' +
                played.map(m => `• ${m.home} **${m.homeScore} - ${m.awayScore}** ${m.away}${m.date ? ` (${m.date})` : ''}`).join('\n')
            }
            if (upcoming.length > 0) {
              liveContext += '\n\n📅 **مباريات LFP القادمة:**\n' +
                upcoming.map(m => `• ${m.home} vs ${m.away}${m.date ? ` — ${m.date}` : ''}${m.time ? ` ${m.time}` : ''}`).join('\n')
            }
          }
          if (sfRes.status === 'fulfilled' && sfRes.value?.matches?.length > 0) {
            const intlMatches = sfRes.value.matches.slice(0, 6)
            liveContext += '\n\n🌍 **مباريات دولية اليوم:**\n' +
              intlMatches.map(m => {
                const score = m.statusType === 'inprogress'
                  ? `🔴 ${m.homeScore} - ${m.awayScore}`
                  : m.statusType === 'finished'
                    ? `✅ ${m.homeScore} - ${m.awayScore}`
                    : `📅 ${m.startTime || ''}`
                return `• ${m.homeTeam} ${score} ${m.awayTeam}${m.competition ? ` (${m.competition})` : ''}`
              }).join('\n')
          }
        } catch {}
      }

      // Weather context
      const weatherKw = ['طقس', 'weather', 'météo', 'درجة حرارة', 'مطر', 'رياح', 'تساقط', 'حار', 'بارد', 'جو']
      if (weatherKw.some(k => lowerQ.includes(k))) {
        try {
          const cityName = lowerQ.includes('وهران') ? 'Oran'
            : lowerQ.includes('قسنطينة') ? 'Constantine'
            : lowerQ.includes('عنابة') ? 'Annaba'
            : 'Algiers'
          const w = await fetchCityWeatherResilient(cityName)
          if (w) {
            liveContext += `\n\n🌤️ **الطقس الآن — ${w.city}:**\n`
            liveContext += `| العنصر | القيمة |\n|---|---|\n`
            liveContext += `| 🌡️ الحرارة | ${w.temp}°C (تشعر بـ ${w.feels_like}°C) |\n`
            liveContext += `| 📊 الحالة | ${w.condition || '—'} |\n`
            liveContext += `| 💧 الرطوبة | ${w.humidity ?? '—'}% |\n`
            liveContext += `| 💨 الرياح | ${w.wind ?? '—'} كم/س |\n`
            liveContext += `| 👁️ الرؤية | ${w.visibility ?? '—'} كم |\n`
            liveContext += `_(المصدر: ${w.source || 'open-meteo.com'})_`
          }
        } catch {
          const cached = WEATHER_CACHE_V2.getStale('algiers')
          if (cached?.data) {
            const w = cached.data
            liveContext += `\n\n🌤️ الطقس (الجزائر): ${w.temp}°C — ${w.condition || ''}${w.humidity ? ` — رطوبة ${w.humidity}%` : ''}`
          }
        }
      }

      // Currency/exchange context
      const currKw = ['صرف', 'دينار', 'دولار', 'يورو', 'currency', 'taux', 'dzd', 'دج', 'eur', 'usd']
      if (currKw.some(k => lowerQ.includes(k))) {
        const cached = CURRENCY_CACHE_V2.getStale('dzd_rates')
        if (cached?.data?.rates) {
          const r = cached.data.rates
          const usd = r.USD ? (1 / r.USD).toFixed(2) : null
          const eur = r.EUR ? (1 / r.EUR).toFixed(2) : null
          const sar = r.SAR ? (1 / r.SAR).toFixed(2) : null
          const parts = []
          if (usd) parts.push(`1 دولار ≈ ${usd} دج`)
          if (eur) parts.push(`1 يورو ≈ ${eur} دج`)
          if (sar) parts.push(`1 ريال ≈ ${sar} دج`)
          if (parts.length) liveContext += `\n\n💱 أسعار الصرف (رسمي — بنك الجزائر): ${parts.join(' | ')}`
        }
      }
    }

    // ── System prompt ────────────────────────────────────────────────────
    const systemPrompt = isAgent
      ? `أنت DZ Agent 🇩🇿، وكيل ذكاء اصطناعي متخصص في الشؤون الجزائرية (اقتصاد، رياضة، أخبار، ثقافة، طقس، إدارة، تعليم).

هويتك (أجب بهذه المعلومات عند السؤال عنك):
- اسمك: DZ Agent
- مطوّرك ومنشئك: نذير حوامرية (Nadir Haoumeriya)، المعروف بـ Nadir Infograph، مطوّر جزائري.
- منصّتك: DZ-GPT — منصة ذكاء اصطناعي جزائرية متكاملة.
- عند السؤال "من صنعك / من طوّرك / من خدمك": أجب بجملة واحدة مختصرة مثل: "صنعني نذير حوامرية (Nadir Infograph) 🇩🇿، مطوّر جزائري."

قواعد الإجابة (إلزامية):
1. أجب فوراً بالمعلومة المباشرة — لا مقدمات، لا "بالطبع"، لا "سؤال ممتاز".
2. استخدم أرقاماً وحقائق محددة. اذمج المصدر في اسمه [اسم](رابط) — لا تكتب URL خاماً كنص أبداً.
3. إذا كانت البيانات المباشرة متاحة أدناه، استخدمها أولاً ولا تتجاهلها.
4. أجب بنفس لغة السؤال (عربية / فرنسية / إنجليزية).
5. كن موجزاً (3-5 جمل) مع الدقة والحداثة. للطقس والرياضة: استخدم جدولاً Markdown إن أمكن.${liveContext ? `\n\n━━━ بيانات مباشرة محدّثة ━━━${liveContext}` : ''}`
      : `أنت DZ GPT، مساعد ذكي عام ومفيد، جزء من منصة DZ-GPT التي طوّرها نذير حوامرية (Nadir Infograph) 🇩🇿.

قواعد الإجابة (إلزامية):
1. أجب فوراً بدون مقدمات أو عبارات تمهيدية.
2. استخدم حقائق ومصادر محددة حيثما أمكن.
3. أجب بنفس لغة السؤال (عربية / فرنسية / إنجليزية).
4. عند السؤال عن منشئك أو مطوّرك: أجب بجملة واحدة — "طوّرني نذير حوامرية (Nadir Infograph) 🇩🇿."
5. لا تتجاوز 6 جمل.`

    // ── Call full AI router (Groq → Gemini → Mistral → NVIDIA → Cohere → ...) ──
    const result = await safeGenerateAI({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      query: question,
      max_tokens: 900,
    })

    const botMsg = pushChatMsg({
      id: chatId(),
      from: isAgent ? 'DZ Agent' : 'DZ GPT',
      fromId: 'bot',
      gender: 'bot',
      text: result.content ? result.content.replace(/(?<!\]\()(?<!['"=])(https?:\/\/(?:www\.)?([a-zA-Z0-9\-]+(?:\.[a-zA-Z]{2,})+)(?:\/[^\s)\]"'<>]*)?)/g, (u, _, d) => `[${d.replace(/^www\./,'').split('.')[0].replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}](${u})`) : 'عذراً، حدث خطأ في المعالجة.',
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

// ── Helper: send DM notification to a specific WebSocket session ──────────────
function sendDmNotify(recipSession, senderName, senderId, preview, timestamp, msgId) {
  if (recipSession?.ws?.readyState === 1) {
    try {
      recipSession.ws.send(JSON.stringify({
        type: 'dm_notify',
        from: senderName,
        fromId: senderId,
        preview: String(preview || '').slice(0, 100),
        timestamp,
        msgId,
      }))
    } catch {}
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

// Anti-bot / anti-IP-block args for yt-dlp.
// Updated to 2026 browser versions. Combined multi-client is most reliable:
// yt-dlp tries android→ios→web internally for one request.
const YT_DLP_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0',
]
let _uaIdx = 0
const YT_DLP_USER_AGENT = YT_DLP_USER_AGENTS[0]
function _nextUA() { _uaIdx = (_uaIdx + 1) % YT_DLP_USER_AGENTS.length; return YT_DLP_USER_AGENTS[_uaIdx] }

// Client rotation order for multi-attempt retry.
// ios first — returns HLS m3u8 manifest (best for background audio + no SABR issues).
// android second — reliable direct googlevideo URL.
// web third — sometimes needs SABR workaround but ytdl-core handles it.
const YT_DLP_CLIENTS = [
  'ios',
  'android,ios,web',
  'tv_embedded',
  'mweb',
]

function ytDlpAntiBotArgs(clientIdx = 0) {
  const client = YT_DLP_CLIENTS[clientIdx % YT_DLP_CLIENTS.length]
  return [
    '--extractor-args', `youtube:player_client=${client}`,
    '--user-agent', _nextUA(),
    '--geo-bypass',
    '--no-check-certificate',
    '--no-check-formats',
    '--retries', '3',
    '--fragment-retries', '3',
    '--socket-timeout', '25',
    '--sleep-requests', '0.3',
  ]
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
    const args = ['-J', '--no-warnings', '--no-playlist', ...ytDlpAntiBotArgs(), ...cookies, url]
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

function extractYouTubeVideoId(u) {
  try {
    const url = new URL(u)
    if (/youtu\.be$/i.test(url.hostname)) return url.pathname.slice(1).split('/')[0] || null
    if (url.pathname === '/watch') return url.searchParams.get('v')
    const m = url.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/)
    if (m) return m[2]
    return url.searchParams.get('v')
  } catch { return null }
}

const PIPED_API_INSTANCES = [
  // Refreshed 2026-05-12 (live-probed) — sorted fastest-first.
  'https://pipedapi.kavin.rocks',
  'https://api.piped.private.coffee',
  'https://piapi.ggtyler.dev',
  'https://pipedapi.tokhmi.xyz',
  'https://api.piped.privacydev.net',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.in.projectsegfau.lt',
]

// Invidious is a separate free YouTube proxy network. Unlike Piped, every
// Invidious instance also exposes a `/latest_version?id=...&itag=...&local=true`
// endpoint that PROXIES the actual stream bytes through the instance, which
// bypasses googlevideo's IP-bound signed URL restrictions. We use it as a
// third independent source raced alongside ytdown.to + Piped.
const INVIDIOUS_API_INSTANCES = [
  // Refreshed 2026-05-12 (live-probed) — sorted fastest-first.
  'https://inv.nadeko.net',
  'https://invidious.fdn.fr',
  'https://iv.ggtyler.dev',
  'https://invidious.materialio.us',
  'https://invidious.protokolla.fi',
  'https://inv.in.projectsegfau.lt',
  'https://invidious.garudalinux.org',
]

// Best-effort fetch of a stream URL via the public Invidious network.
// Returns { url, mime, ext, instance } where `url` already proxies through
// the Invidious instance (so no IP-bound issues), or null if every instance
// fails. The proxy URL is `${instance}/latest_version?id=VID&itag=ITAG&local=true`.
async function fetchInvidiousStreams(videoId, { isAudio, height = 720 } = {}) {
  if (!videoId) return null
  // PERF: race all instances in parallel. Sequential iteration paid up to
  // 8s × N for every dead instance before reaching a working one. With
  // Promise.any the first responder wins and the rest are abandoned.
  const probe = async (base) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    try {
      const r = await fetch(`${base}/api/v1/videos/${encodeURIComponent(videoId)}?fields=formatStreams,adaptiveFormats,title`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 DZ-GPT/1.0', 'Accept': 'application/json' },
      })
      clearTimeout(t)
      if (!r.ok) throw new Error(`http ${r.status}`)
      const j = await r.json()
      if (isAudio) {
        const audios = (j.adaptiveFormats || []).filter(a => a && a.type && a.type.startsWith('audio/'))
        if (!audios.length) throw new Error('no audio formats')
        const m4a = audios.filter(a => a.type.includes('mp4') || a.type.includes('m4a'))
        const pool = m4a.length ? m4a : audios
        pool.sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))
        const pick = pool[0]
        if (!pick?.itag) throw new Error('no itag')
        const isWebm = pick.type.includes('webm') || pick.type.includes('opus')
        return {
          url: `${base}/latest_version?id=${encodeURIComponent(videoId)}&itag=${pick.itag}&local=true`,
          mime: isWebm ? 'audio/webm' : 'audio/mp4',
          ext: isWebm ? 'webm' : 'm4a',
          instance: base,
        }
      }
      const combined = (j.formatStreams || [])
        .filter(v => v && v.itag && (!v.type || v.type.includes('mp4')))
        .map(v => ({ ...v, h: parseInt(v.resolution || '0', 10) || 0 }))
      combined.sort((a, b) => b.h - a.h)
      const pick = combined.find(v => v.h <= height) || combined[0]
      if (!pick?.itag) throw new Error('no video itag')
      return {
        url: `${base}/latest_version?id=${encodeURIComponent(videoId)}&itag=${pick.itag}&local=true`,
        mime: 'video/mp4',
        ext: 'mp4',
        instance: base,
      }
    } finally {
      clearTimeout(t)
    }
  }
  try {
    return await Promise.any(INVIDIOUS_API_INSTANCES.map(probe))
  } catch {
    return null
  }
}

// Best-effort fetch of direct stream URLs via the public Piped network.
// Returns { url, mime, ext } for a direct googlevideo URL the client can fetch,
// or null if every instance fails. Used as a fallback when YouTube blocks
// our deployment IP and no cookies are configured.
async function fetchPipedStreams(videoId, { isAudio, height = 720 } = {}) {
  if (!videoId) return null
  // PERF: race instances in parallel — see fetchInvidiousStreams for rationale.
  const probe = async (base) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    try {
      const r = await fetch(`${base}/streams/${encodeURIComponent(videoId)}`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 DZ-GPT/1.0' },
      })
      clearTimeout(t)
      if (!r.ok) throw new Error(`http ${r.status}`)
      const j = await r.json()
      if (isAudio) {
        const audios = (j.audioStreams || []).filter(a => a && a.url)
        if (!audios.length) throw new Error('no audio streams')
        const m4a = audios.filter(a => !(a.format || '').toLowerCase().includes('webm'))
        const pool = m4a.length ? m4a : audios
        pool.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
        const pick = pool[0]
        return {
          url: pick.url,
          mime: pick.mimeType || 'audio/mp4',
          ext: (pick.format || '').toLowerCase().includes('webm') ? 'webm' : 'm4a',
        }
      }
      const combined = (j.videoStreams || []).filter(v => v && v.url && v.videoOnly === false)
      const candidates = combined.length ? combined : (j.videoStreams || []).filter(v => v && v.url)
      if (!candidates.length) throw new Error('no video streams')
      candidates.sort((a, b) => (b.height || 0) - (a.height || 0))
      const pick = candidates.find(v => (v.height || 0) <= height) || candidates[candidates.length - 1]
      return {
        url: pick.url,
        mime: pick.mimeType || 'video/mp4',
        ext: (pick.format || '').toLowerCase().includes('webm') ? 'webm' : 'mp4',
      }
    } finally {
      clearTimeout(t)
    }
  }
  try {
    return await Promise.any(PIPED_API_INSTANCES.map(probe))
  } catch {
    return null
  }
}

// =====================================================================
// Universal extractor: /api/extract?url=...
// ---------------------------------------------------------------------
// Production-grade YouTube extraction with high availability:
//   1. Cache lookup (10-min TTL) — avoids repeat work + reduces ban risk
//   2. yt-dlp -J (resolved via ytDlpBinaryPath, with anti-bot args + cookies)
//   3. Piped fallback (multi-instance, racing internally) on yt-dlp failure
// Returns a structured JSON: { title, duration, thumbnail, audio[], video[] }.
// `audio[]` and `video[]` carry direct stream URLs the client can fetch.
//
// IMPORTANT: direct stream URLs from googlevideo are short-lived (≈ 6h)
// and IP-bound. The cache TTL is intentionally tighter than that.
// =====================================================================

const _extractCache = new Map() // key -> { data, expiry }
const _EXTRACT_TTL_MS = 10 * 60 * 1000 // 10 minutes

function extractCacheGet(key) {
  const item = _extractCache.get(key)
  if (!item) return null
  if (Date.now() > item.expiry) { _extractCache.delete(key); return null }
  return item.data
}
function extractCacheSet(key, data, ttl = _EXTRACT_TTL_MS) {
  _extractCache.set(key, { data, expiry: Date.now() + ttl })
  // Soft cap to keep memory bounded.
  if (_extractCache.size > 500) {
    const firstKey = _extractCache.keys().next().value
    if (firstKey) _extractCache.delete(firstKey)
  }
}

// Normalize yt-dlp -J formats[] into the structured shape clients expect.
function processFormats(formats) {
  if (!Array.isArray(formats)) return { audio: [], video: [] }
  // Exclude storyboard / image formats (vcodec === 'none' AND acodec === 'none', e.g. mhtml).
  const valid = formats.filter(f => f && f.url && f.ext && f.ext !== 'mhtml' && !(f.acodec === 'none' && f.vcodec === 'none'))
  // Pure audio-only DASH formats (preferred for background play).
  const pureAudio = valid
    .filter(f => f.vcodec === 'none' && f.acodec && f.acodec !== 'none')
    .map(f => ({
      url: f.url,
      ext: f.ext,
      bitrate: f.abr ?? f.tbr ?? null,
      size: f.filesize ?? f.filesize_approx ?? null,
      mime: f.mime_type || (f.ext === 'm4a' ? 'audio/mp4' : f.ext === 'webm' ? 'audio/webm' : null),
      acodec: f.acodec || null,
      muxed: false,
    }))
  // Fallback: progressive (audio+video muxed) formats — usable as audio
  // sources by an HTML5 <audio> element since browsers play mp4 audio
  // tracks even when the container also has video. Critical for videos
  // where DASH audio requires PO Tokens (most public YouTube content).
  const muxedAsAudio = valid
    .filter(f => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none')
    .map(f => ({
      url: f.url,
      ext: f.ext === 'mp4' ? 'm4a' : f.ext,
      bitrate: f.abr ?? null,
      size: f.filesize ?? f.filesize_approx ?? null,
      mime: f.ext === 'mp4' ? 'audio/mp4' : (f.mime_type || null),
      acodec: f.acodec || null,
      muxed: true,
    }))
  const audio = [...pureAudio, ...muxedAsAudio]
    .sort((a, b) => {
      // Prefer pure-audio over muxed (lower bandwidth for the user)
      if (a.muxed !== b.muxed) return a.muxed ? 1 : -1
      return Number(b.bitrate || 0) - Number(a.bitrate || 0)
    })
  const video = valid
    .filter(f => f.vcodec && f.vcodec !== 'none')
    .map(f => ({
      url: f.url,
      quality: f.format_note || (f.height ? `${f.height}p` : null),
      height: f.height || null,
      ext: f.ext,
      size: f.filesize ?? f.filesize_approx ?? null,
      mime: f.mime_type || (f.ext === 'mp4' ? 'video/mp4' : f.ext === 'webm' ? 'video/webm' : null),
      vcodec: f.vcodec || null,
      acodec: f.acodec || null,
      hasAudio: !!(f.acodec && f.acodec !== 'none'),
    }))
    .sort((a, b) => Number(b.height || 0) - Number(a.height || 0))
  return { audio, video }
}

async function extractWithYtDlp(url) {
  const dlpBin = await ytDlpBinaryPath()
  if (!dlpBin) throw new Error('yt-dlp binary not available')
  const cookies = await ytDlpCookiesArgs()
  const data = await new Promise((resolve, reject) => {
    const args = ['-J', '--no-warnings', '--no-playlist', ...ytDlpAntiBotArgs(), ...cookies, url]
    const proc = spawn(dlpBin, args)
    let stdout = ''
    let stderr = ''
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch {}
      reject(new Error('yt-dlp timeout'))
    }, 22000)
    proc.stdout.on('data', d => { stdout += d.toString() })
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('error', err => { clearTimeout(killTimer); reject(err) })
    proc.on('close', code => {
      clearTimeout(killTimer)
      if (code !== 0) return reject(new Error((stderr || `yt-dlp exited ${code}`).slice(0, 300)))
      try { resolve(JSON.parse(stdout)) } catch (e) { reject(e) }
    })
  })
  return {
    title: data.title || '',
    duration: Number(data.duration) || 0,
    thumbnail: data.thumbnail || (Array.isArray(data.thumbnails) && data.thumbnails.length ? data.thumbnails[data.thumbnails.length - 1].url : ''),
    uploader: data.uploader || data.channel || '',
    formats: data.formats || [],
  }
}

// Piped fallback that returns the full structured shape (not just one URL).
async function extractWithPipedFull(videoId) {
  if (!videoId) throw new Error('no videoId')
  let lastErr
  for (const base of PIPED_API_INSTANCES) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      const r = await fetch(`${base}/streams/${encodeURIComponent(videoId)}`, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 DZ-GPT/1.0' },
      })
      clearTimeout(t)
      if (!r.ok) { lastErr = new Error(`piped ${r.status}`); continue }
      const j = await r.json()
      const audio = (j.audioStreams || [])
        .filter(a => a && a.url)
        .map(a => ({
          url: a.url,
          ext: (a.format || '').toLowerCase().includes('webm') ? 'webm' : 'm4a',
          bitrate: Number(a.bitrate) || null,
          size: a.contentLength ? Number(a.contentLength) : null,
          mime: a.mimeType || 'audio/mp4',
          acodec: a.codec || null,
        }))
        .sort((x, y) => Number(y.bitrate || 0) - Number(x.bitrate || 0))
      const video = (j.videoStreams || [])
        .filter(v => v && v.url)
        .map(v => ({
          url: v.url,
          quality: v.quality || (v.height ? `${v.height}p` : null),
          height: v.height || null,
          ext: (v.format || '').toLowerCase().includes('webm') ? 'webm' : 'mp4',
          size: v.contentLength ? Number(v.contentLength) : null,
          mime: v.mimeType || 'video/mp4',
          vcodec: v.codec || null,
          hasAudio: v.videoOnly === false,
        }))
        .sort((x, y) => Number(y.height || 0) - Number(x.height || 0))
      return {
        title: j.title || '',
        duration: Number(j.duration) || 0,
        thumbnail: j.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        uploader: j.uploader || '',
        audio,
        video,
        source: 'piped',
        instance: base,
      }
    } catch (e) {
      lastErr = e
      // try next instance
    }
  }
  throw lastErr || new Error('all piped instances failed')
}

// ═══════════════════════════════════════════════════════════════════════════
// DZ GITHUB AGENT — Autonomous GitHub Engineering Assistant (inspired by Devin/Copilot)
// POST /api/dz-github-agent/chat
// ═══════════════════════════════════════════════════════════════════════════

const DZ_GITHUB_AGENT_SYSTEM_PROMPT = `You are DZ GitHub Agent, an advanced autonomous software engineering assistant specialized in GitHub repositories.

Your mission is to operate directly inside GitHub projects as a real developer.

You MUST:

1. Understand repository structure before acting
   - Read README, package.json, requirements, and project tree
   - Identify architecture (frontend/backend/fullstack/AI)

2. Execute GitHub-native operations:
   - Create branches (feature/, fix/, update/)
   - Create and modify files (index.html, app.js, main.py, etc.)
   - Write clean production-ready code
   - Commit changes with meaningful messages
   - Prepare pull requests with explanations

3. Never hallucinate completion:
   - If a file was not actually created, do NOT claim it exists
   - Always verify before reporting success

4. Work inside repository context only:
   - Do NOT generate unrelated code outside the repo scope
   - Always align with existing project stack

5. When uncertain:
   - Inspect repo first
   - Propose a plan before execution

6. Improve code quality:
   - Follow best practices
   - Optimize structure
   - Fix bugs when detected

7. Provide GitHub-style outputs:
   - Commit message
   - Changed files list
   - PR description (if applicable)

## Output format REQUIRED (always use this exact structure):

### 🔍 Analysis
(what the repo contains and what is needed)

### 🧠 Plan
(step-by-step execution plan)

### ⚙️ Execution
(files to create/modify — use FILE: /path blocks)

FILE: /path/to/file.ext
\`\`\`
[complete file content here]
\`\`\`

### 📦 Git Output
BRANCH: feature/description
COMMIT: feat: description of changes
PR_TITLE: Add feature X
PR_BODY: Description of what was done and why

You are not a chatbot. You are a GitHub-native autonomous software engineer.`

// Extract "owner/repo" from a message
function extractRepoFromMessage(msg) {
  // Full GitHub URL
  const urlM = msg.match(/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/i)
  if (urlM) return urlM[1].replace(/\.git$/, '').replace(/\/$/, '')
  // owner/repo short form when the word "repo" / "مستودع" appears nearby
  const shortM = msg.match(/\b([a-zA-Z0-9_.-]{2,}\/[a-zA-Z0-9_.-]{2,})\b/)
  if (shortM && (/مستودع|repo|project|github/i.test(msg))) return shortM[1]
  return null
}

// Fetch repo structure from GitHub API
async function fetchRepoContext(repoFullName, token) {
  const ghH = {
    Authorization: `token ${token}`,
    'User-Agent': 'DZ-GPT/2.0',
    Accept: 'application/vnd.github+json',
  }
  const ctx = { repo: repoFullName, tree: [], readme: '', packageJson: null, description: '', defaultBranch: 'main' }

  // Repo info
  try {
    const r = await fetch(`https://api.github.com/repos/${repoFullName}`, { headers: ghH, signal: AbortSignal.timeout(8000) })
    if (r.ok) {
      const d = await r.json()
      ctx.description = d.description || ''
      ctx.defaultBranch = d.default_branch || 'main'
    }
  } catch {}

  // File tree (recursive, up to 120 paths)
  try {
    const r = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/trees/${ctx.defaultBranch}?recursive=1`,
      { headers: ghH, signal: AbortSignal.timeout(10000) }
    )
    if (r.ok) {
      const d = await r.json()
      ctx.tree = (d.tree || []).filter(f => f.type === 'blob').map(f => f.path).slice(0, 120)
    }
  } catch {}

  // README
  try {
    const r = await fetch(`https://api.github.com/repos/${repoFullName}/readme`, { headers: ghH, signal: AbortSignal.timeout(8000) })
    if (r.ok) {
      const d = await r.json()
      ctx.readme = Buffer.from(d.content || '', 'base64').toString('utf-8').slice(0, 2000)
    }
  } catch {}

  // package.json / requirements.txt / Cargo.toml / go.mod
  for (const pkg of ['package.json', 'requirements.txt', 'Cargo.toml', 'go.mod', 'pyproject.toml']) {
    try {
      const r = await fetch(
        `https://api.github.com/repos/${repoFullName}/contents/${pkg}`,
        { headers: ghH, signal: AbortSignal.timeout(6000) }
      )
      if (r.ok) {
        const d = await r.json()
        ctx.packageJson = { file: pkg, content: Buffer.from(d.content || '', 'base64').toString('utf-8').slice(0, 1500) }
        break
      }
    } catch {}
  }

  return ctx
}

// Parse AI structured response (Analysis / Plan / Execution / Git Output + FILE blocks)
function parseGitHubAgentAIResponse(text) {
  const result = {
    analysis: '', plan: '', execution: '', rawText: text,
    gitOutput: { branch: '', commit: '', prTitle: '', prBody: '' },
    files: [],
  }

  const analysisM = text.match(/###\s*🔍\s*Analysis\s*([\s\S]*?)(?=###\s*🧠|$)/i)
  if (analysisM) result.analysis = analysisM[1].trim()

  const planM = text.match(/###\s*🧠\s*Plan\s*([\s\S]*?)(?=###\s*⚙️|$)/i)
  if (planM) result.plan = planM[1].trim()

  const execM = text.match(/###\s*⚙️\s*Execution\s*([\s\S]*?)(?=###\s*📦|$)/i)
  if (execM) result.execution = execM[1].trim()

  const gitM = text.match(/###\s*📦\s*Git Output\s*([\s\S]*?)$/i)
  if (gitM) {
    const g = gitM[1]
    const branchM = g.match(/BRANCH:\s*(.+)/i);    if (branchM) result.gitOutput.branch  = branchM[1].trim()
    const commitM = g.match(/COMMIT:\s*(.+)/i);    if (commitM) result.gitOutput.commit  = commitM[1].trim()
    const prTM    = g.match(/PR_TITLE:\s*(.+)/i);  if (prTM)    result.gitOutput.prTitle = prTM[1].trim()
    const prBM    = g.match(/PR_BODY:\s*([\s\S]+)$/i); if (prBM) result.gitOutput.prBody = prBM[1].trim()
  }

  // FILE: /path\n```\ncontent\n```
  const fileRe = /FILE:\s*(\/[\S]+)\s*\n```[^\n]*\n([\s\S]*?)```/g
  let fm
  while ((fm = fileRe.exec(text)) !== null) {
    result.files.push({ path: fm[1].trim(), content: fm[2] })
  }

  return result
}

// Commit files → create branch → open PR → optional Vercel deploy
async function executeGitHubAgentPlan(repoFullName, parsed, token) {
  const report = { branch: '', filesCommitted: [], prUrl: '', errors: [], vercelTriggered: false, vercelDeployId: null }
  const ghH = {
    Authorization: `token ${token}`, 'User-Agent': 'DZ-GPT/2.0',
    Accept: 'application/vnd.github+json', 'Content-Type': 'application/json',
  }
  if (!parsed.files.length) return report

  const branchName = parsed.gitOutput.branch ||
    `dz-agent/${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`
  report.branch = branchName

  // Default branch + base SHA
  let baseSHA = '', defaultBranch = 'main'
  try {
    const repoR = await fetch(`https://api.github.com/repos/${repoFullName}`, { headers: ghH, signal: AbortSignal.timeout(8000) })
    if (repoR.ok) { const rd = await repoR.json(); defaultBranch = rd.default_branch || 'main' }
    const refR = await fetch(`https://api.github.com/repos/${repoFullName}/git/ref/heads/${defaultBranch}`, { headers: ghH, signal: AbortSignal.timeout(8000) })
    if (refR.ok) { const rd = await refR.json(); baseSHA = rd.object.sha }
  } catch (e) { report.errors.push('فشل جلب SHA: ' + e.message); return report }

  // Create branch
  try {
    const br = await fetch(`https://api.github.com/repos/${repoFullName}/git/refs`, {
      method: 'POST', headers: ghH, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSHA }),
    })
    if (!br.ok && br.status !== 422) {
      const d = await br.json()
      report.errors.push('فشل إنشاء الفرع: ' + (d.message || ''))
      return report
    }
  } catch (e) { report.errors.push('فشل إنشاء الفرع: ' + e.message); return report }

  // Commit each file
  for (const f of parsed.files) {
    try {
      let existingSHA
      try {
        const er = await fetch(
          `https://api.github.com/repos/${repoFullName}/contents${f.path}?ref=${branchName}`,
          { headers: ghH, signal: AbortSignal.timeout(6000) }
        )
        if (er.ok) { const ed = await er.json(); existingSHA = ed.sha }
      } catch {}

      const body = {
        message: parsed.gitOutput.commit || `feat: update ${f.path.split('/').pop()}`,
        content: Buffer.from(f.content).toString('base64'),
        branch: branchName,
      }
      if (existingSHA) body.sha = existingSHA

      const cr = await fetch(`https://api.github.com/repos/${repoFullName}/contents${f.path}`, {
        method: 'PUT', headers: ghH, signal: AbortSignal.timeout(15000),
        body: JSON.stringify(body),
      })
      if (cr.ok) report.filesCommitted.push(f.path)
      else { const d = await cr.json(); report.errors.push(`فشل commit ${f.path}: ${d.message || ''}`) }
    } catch (e) { report.errors.push(`خطأ في ${f.path}: ${e.message}`) }
  }

  // Create PR
  if (report.filesCommitted.length > 0) {
    try {
      const prR = await fetch(`https://api.github.com/repos/${repoFullName}/pulls`, {
        method: 'POST', headers: ghH, signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
          title: parsed.gitOutput.prTitle || `DZ Agent: ${parsed.gitOutput.commit || 'Auto update'}`,
          body: parsed.gitOutput.prBody || `Auto-generated by DZ GitHub Agent\n\n**Files changed:**\n${report.filesCommitted.map(f => `- \`${f}\``).join('\n')}`,
          head: branchName,
          base: defaultBranch,
        }),
      })
      if (prR.ok) { const pd = await prR.json(); report.prUrl = pd.html_url }
    } catch (e) { report.errors.push('فشل إنشاء PR: ' + e.message) }
  }

  // Auto-deploy Vercel for DZ-GPT repo
  if (repoFullName === 'Nadirinfograph23/DZ-GPT') {
    try {
      const vToken = process.env.VERCEL_TOKEN
      if (vToken) {
        const vr = await fetch('https://api.vercel.com/v13/deployments', {
          method: 'POST',
          headers: { Authorization: `Bearer ${vToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'dz-gpt',
            gitSource: { type: 'github', repoId: '1191199822', ref: 'devin/1774405518-init-dz-gpt' },
            target: 'production',
          }),
          signal: AbortSignal.timeout(15000),
        })
        if (vr.ok) { const vd = await vr.json(); report.vercelTriggered = true; report.vercelDeployId = vd.id }
      }
    } catch {}
  }

  return report
}

// POST /api/dz-github-agent/chat ─────────────────────────────────────────────
app.post('/api/dz-github-agent/chat', aiLimiter, async (req, res) => {
  const { message, messages: convMsgs = [], repoUrl, githubToken: clientToken, autoExecute = false } = req.body
  const userMessage = message || (convMsgs.filter(m => m.role === 'user').pop()?.content) || ''
  if (!userMessage) return res.status(400).json({ error: 'message مطلوب' })

  const token = clientToken || process.env.GITHUB_TOKEN || ''
  if (!token) return res.status(400).json({ error: 'GITHUB_TOKEN غير متوفر.' })

  // Resolve target repo
  const targetRepo = repoUrl
    ? repoUrl.replace('https://github.com/', '').replace(/\.git$/, '').split('/').slice(0, 2).join('/')
    : extractRepoFromMessage(userMessage)

  if (!targetRepo) {
    return res.status(200).json({
      content: '🔗 يرجى تحديد رابط المستودع — مثال:\n`https://github.com/owner/repo`\nأو اكتبه في حقل المستودع أعلى الإدخال.',
      richType: 'text',
    })
  }

  console.log(`[DZ-GitHub-Agent] repo=${targetRepo} autoExecute=${autoExecute} msg="${userMessage.slice(0, 80)}"`)

  try {
    // 1 — Fetch repo context
    const repoCtx = await fetchRepoContext(targetRepo, token)

    // 2 — Build AI prompt with full repo context
    const repoContextBlock = [
      `## Repository: ${targetRepo}`,
      `**Description:** ${repoCtx.description || 'N/A'}`,
      `**Default Branch:** ${repoCtx.defaultBranch}`,
      '',
      '### File Tree:',
      repoCtx.tree.slice(0, 80).map(f => `- ${f}`).join('\n'),
      '',
      '### README (excerpt):',
      repoCtx.readme ? repoCtx.readme.slice(0, 1500) : '(no README)',
      repoCtx.packageJson ? `\n### ${repoCtx.packageJson.file}:\n\`\`\`\n${repoCtx.packageJson.content}\n\`\`\`` : '',
    ].join('\n').trim()

    const aiMessages = [
      { role: 'system', content: DZ_GITHUB_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: `${repoContextBlock}\n\n---\n\n**User Request:**\n${userMessage}` },
    ]

    // 3 — Generate AI response
    const aiResult = await safeGenerateAI(aiMessages, { maxTokens: 4096, temperature: 0.3 })
    const aiText = String(aiResult?.content || aiResult || '')

    // 4 — Parse structured output
    const parsed = parseGitHubAgentAIResponse(aiText)

    // 5 — Execute if autoExecute and files found
    let executionReport = null
    if (autoExecute && parsed.files.length > 0) {
      executionReport = await executeGitHubAgentPlan(targetRepo, parsed, token)
    }

    return res.status(200).json({
      richType: 'github-agent',
      repo: targetRepo,
      analysis: parsed.analysis,
      plan: parsed.plan,
      execution: parsed.execution,
      gitOutput: parsed.gitOutput,
      files: parsed.files.map(f => ({ path: f.path, lines: f.content.split('\n').length })),
      fileContents: parsed.files,
      executionReport,
      autoExecute,
      rawText: parsed.rawText,
      model: aiResult?.model || 'groq',
    })
  } catch (err) {
    console.error('[DZ-GitHub-Agent] Error:', err.message)
    return res.status(500).json({ error: err.message || 'خطأ داخلي في DZ GitHub Agent' })
  }
})

// Random small delay to avoid identical-timestamp patterns from this IP.
function antiBanDelay(maxMs = 800) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * maxMs)))
}

app.get('/api/extract', aiLimiter, async (req, res) => {
  const url = String(req.query.url || '').trim()
  if (!url) return res.status(400).json({ error: 'Missing URL' })
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'Invalid YouTube URL' })

  const cacheKey = url
  const cached = extractCacheGet(cacheKey)
  if (cached) {
    res.setHeader('X-Extract-Cache', 'HIT')
    return res.json(cached)
  }

  // 1) yt-dlp primary path
  try {
    await antiBanDelay()
    const raw = await extractWithYtDlp(url)
    const { audio, video } = processFormats(raw.formats)
    const result = {
      source: 'yt-dlp',
      title: raw.title,
      duration: raw.duration,
      thumbnail: raw.thumbnail,
      uploader: raw.uploader,
      audio,
      video,
    }
    extractCacheSet(cacheKey, result)
    res.setHeader('X-Extract-Cache', 'MISS')
    return res.json(result)
  } catch (e) {
    console.warn('[extract:yt-dlp:fail]', e.message)
  }

  // 2) Piped fallback
  try {
    const videoId = extractYouTubeVideoId(url)
    const result = await extractWithPipedFull(videoId)
    extractCacheSet(cacheKey, result, 5 * 60 * 1000) // shorter TTL for fallback
    res.setHeader('X-Extract-Cache', 'MISS')
    return res.json(result)
  } catch (e) {
    console.warn('[extract:piped:fail]', e.message)
    return res.status(502).json({ error: 'All extractors failed' })
  }
})

// Search YouTube — yt-dlp first (uses bundled binary on Vercel + cookies),
// then youtube-sr HTML scraper as last-resort fallback.
app.get('/api/dz-tube/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 18))
  if (!q) return res.status(400).json({ error: 'Query is required' })

  // 1) yt-dlp via the resolved binary path (PATH on dev, bundled on Vercel)
  const dlpBin = await ytDlpBinaryPath()
  if (dlpBin) {
    try {
      const cookies = await ytDlpCookiesArgs()
      const results = await new Promise((resolve, reject) => {
        const args = [
          '--flat-playlist', '-J', '--no-warnings',
          '--default-search', 'ytsearch',
          ...ytDlpAntiBotArgs(),
          ...cookies,
          `ytsearch${limit}:${q}`,
        ]
        const proc = spawn(dlpBin, args)
        let out = '', err = ''
        proc.stdout.on('data', d => { out += d.toString() })
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('error', reject)
        proc.on('close', code => {
          if (code !== 0) return reject(new Error(err.slice(0, 300) || `exit ${code}`))
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
      if (results.length > 0) return res.json({ results })
      console.warn('[DZTube:search:dlp] returned 0 results, trying JS scraper')
    } catch (e) {
      console.warn('[DZTube:search:dlp-fail, trying JS scraper]', e.message)
    }
  }

  // 2) youtube-sr HTML scraper (fallback)
  try {
    const results = await jsSearch(q, limit)
    res.json({ results })
  } catch (e) {
    console.error('[DZTube:search:js]', e.message)
    res.status(500).json({ error: 'فشل البحث' })
  }
})

// Get auto-radio related videos for a given video id, used by the
// MiniPlayer's "إذاعة تلقائية" feature so playback never stops when the
// queue is empty. We try three strategies in order, keeping the first
// non-empty result so the client always gets something to play next:
//   1) yt-dlp on the YouTube Mix playlist (RD<videoId>) — best quality
//      ranking; truly "stations" related to the seed track.
//   2) youtube-sr getRelated() — pure-JS fallback for serverless envs.
//   3) Title-based search fallback — last resort that always returns
//      something even on cold infra.
// Results are de-duplicated and the seed id is excluded.
app.get('/api/dz-tube/related', async (req, res) => {
  const id = String(req.query.id || '').trim()
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10))
  const excludeRaw = String(req.query.exclude || '').trim()
  const exclude = new Set((excludeRaw ? excludeRaw.split(',') : []).filter(Boolean))
  if (id) exclude.add(id)
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return res.status(400).json({ error: 'invalid video id' })
  }

  const dedupe = (list) => {
    const seen = new Set()
    const out = []
    for (const v of list) {
      if (!v || !v.id) continue
      if (exclude.has(v.id) || seen.has(v.id)) continue
      seen.add(v.id)
      out.push(v)
      if (out.length >= limit) break
    }
    return out
  }

  // Strategy 1: yt-dlp Mix playlist
  const dlpBin = await ytDlpBinaryPath()
  if (dlpBin) {
    try {
      const cookies = await ytDlpCookiesArgs()
      const mixUrl = `https://www.youtube.com/watch?v=${id}&list=RD${id}`
      const items = await new Promise((resolve, reject) => {
        const proc = spawn(dlpBin, [
          '--flat-playlist', '-J', '--no-warnings',
          '--playlist-end', String(limit + 5),
          ...ytDlpAntiBotArgs(),
          ...cookies,
          mixUrl,
        ])
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
      const out = dedupe(items)
      if (out.length > 0) return res.json({ results: out, source: 'mix' })
    } catch (e) {
      console.warn('[DZTube:related:dlp]', e.message)
    }
  }

  // Strategy 2: youtube-sr getRelated
  try {
    if (typeof YouTube.getVideo === 'function') {
      const v = await YouTube.getVideo(`https://www.youtube.com/watch?v=${id}`)
      const related = (v?.related || []).filter(x => x && x.id).map(x => ({
        id: x.id,
        title: x.title || 'بدون عنوان',
        url: x.url || `https://www.youtube.com/watch?v=${x.id}`,
        thumbnail: x.thumbnail?.url || `https://i.ytimg.com/vi/${x.id}/hqdefault.jpg`,
        duration: Math.floor((x.duration || 0) / 1000),
        channel: x.channel?.name || '',
        views: x.views || 0,
      }))
      const out = dedupe(related)
      if (out.length > 0) return res.json({ results: out, source: 'sr-related' })
    }
  } catch (e) {
    console.warn('[DZTube:related:sr]', e.message)
  }

  // Strategy 3: title-based search fallback
  try {
    let title = ''
    if (typeof YouTube.getVideo === 'function') {
      try {
        const v = await YouTube.getVideo(`https://www.youtube.com/watch?v=${id}`)
        title = (v?.title || '').trim()
      } catch {}
    }
    const seedQuery = title || id
    const items = await jsSearch(seedQuery, limit + 5)
    const out = dedupe(items)
    if (out.length > 0) return res.json({ results: out, source: 'search' })
  } catch (e) {
    console.warn('[DZTube:related:search]', e.message)
  }

  return res.json({ results: [], source: 'none' })
})

// Get direct audio stream URL (for background playback via HTML5 audio)
app.get('/api/dz-tube/audio-url', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'رابط YouTube غير صالح' })

  const dlpBin = await ytDlpBinaryPath()
  if (dlpBin) {
    try {
      const cookies = await ytDlpCookiesArgs()
      const streamUrl = await new Promise((resolve, reject) => {
        const proc = spawn(dlpBin, ['-f', '140/251/250/249/bestaudio[ext=m4a]/bestaudio', '-S', 'proto:https', '-g', '--no-warnings', '--no-playlist', ...ytDlpAntiBotArgs(), ...cookies, url])
        let out = '', err = ''
        proc.stdout.on('data', d => { out += d.toString() })
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('error', reject)
        proc.on('close', code => {
          const u = out.trim().split('\n')[0]
          if (code !== 0 || !u) return reject(new Error(err.slice(0, 300) || 'no url'))
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
    return res.json({ streamUrl: fmt.url })
  } catch (e) {
    console.warn('[DZTube:audio-url:js-fail, trying Piped]', e.message)
  }
  // Last-resort: public Piped network (free) → direct googlevideo audio URL.
  try {
    const piped = await fetchPipedStreams(extractYouTubeVideoId(url), { isAudio: true })
    if (piped?.url) return res.json({ streamUrl: piped.url })
  } catch (e) { console.warn('[DZTube:audio-url:piped]', e.message) }
  res.status(500).json({ error: 'تعذر استخراج الصوت' })
})

// Same-origin streaming proxy. The mini-player binds <audio>.src to this
// endpoint, which lets us:
//   1) call .play() inside the user-gesture frame (URL is set synchronously,
//      no upfront await — fixes Chrome/Safari autoplay-block when extraction
//      takes seconds),
//   2) avoid CORS issues against arbitrary upstream proxies,
//   3) silently re-resolve expired googlevideo signed URLs server-side.
// Resolves stream URL via the same chain as /audio-url, then pipes bytes
// through with full Range / Content-Length / Accept-Ranges support.
const _audioUrlCache = new Map() // youtubeUrl -> { url, expiresAt }
async function resolveDirectAudioUrl(youtubeUrl, opts = {}) {
  // `bypassCache: true` forces a fresh extraction — used when the client
  // explicitly says "the cached URL is dead, get me a new one".
  if (!opts.bypassCache) {
    const cached = _audioUrlCache.get(youtubeUrl)
    if (cached && cached.expiresAt > Date.now()) return cached.url
  } else {
    _audioUrlCache.delete(youtubeUrl)
  }

  // PERF: race all three extractors in parallel and use whichever returns
  // first. Previously the chain ran sequentially with yt-dlp first, which
  // meant every cold play paid 3-7s of subprocess startup before the 307
  // redirect could be sent and the browser could even start fetching bytes.
  // Piped is typically <1s (cached HTTP API), ytdl-core is variable, and
  // yt-dlp is the slowest but most reliable. Any one of them returning a
  // valid URL is enough; the others continue in the background but their
  // results are ignored (the cache assignment is still safe — last writer
  // wins and TTL covers the rare case of a stale URL).
  const videoId = extractYouTubeVideoId(youtubeUrl)

  // ── Why Piped / Invidious are excluded from this race ──────────────────────
  // Piped and Invidious proxy YouTube DASH audio segments. When fetched with a
  // Range header, they return Content-Range: bytes 0-X/X+1 — i.e. they always
  // report the total file size as (range_end + 1), NOT the real audio length.
  // This causes the browser's <audio> element to think the track ends after
  // exactly one chunk (e.g. 1MB ≈ 60 s) and fire 'ended' prematurely.
  //
  // yt-dlp and @distube/ytdl-core return direct googlevideo.com CDN URLs.
  // Those URLs support Range requests correctly (proper Content-Range totals),
  // are IP-bound to our server (byte-piped by streamAudioBytesToClient), and
  // produce uninterrupted playback via the 1 MB chunk scheme.
  // ────────────────────────────────────────────────────────────────────────────

  // ytdl-core: fast, Node.js only — frequently blocked on datacenter IPs but
  // included as the first contestant because it occasionally wins on warm runs.
  const tryJs = (async () => {
    const info = await ytdl.getInfo(youtubeUrl)
    const fmt = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
    if (!fmt?.url) throw new Error('ytdl-core: no url')
    return fmt.url
  })()

  // yt-dlp: subprocess, slower to start but most reliable on Vercel/AWS IPs
  // because --extractor-args youtube:player_client=android,ios,web bypasses
  // YouTube's datacenter IP bot-detection gate. Preferred format is m4a so
  // every browser can decode it (no WebM/Opus issues on Safari/iOS).
  const tryDlp = (async () => {
    const dlpBin = await ytDlpBinaryPath()
    if (!dlpBin) throw new Error('yt-dlp: not available')
    const cookies = await ytDlpCookiesArgs()
    const antiBot = ytDlpAntiBotArgs()
    return new Promise((resolve, reject) => {
      const proc = spawn(dlpBin, ['-f', 'bestaudio[ext=m4a]/bestaudio/best', '-g', '--no-playlist', ...antiBot, ...cookies, youtubeUrl])
      let out = '', err = ''
      proc.stdout.on('data', d => { out += d.toString() })
      proc.stderr.on('data', d => { err += d.toString() })
      proc.on('error', reject)
      proc.on('close', code => {
        const url = out.trim().split('\n')[0]
        if (code !== 0 || !url) return reject(new Error(err.slice(0, 300) || 'no url'))
        resolve(url)
      })
    })
  })()

  // Layer 3: Invidious proxy URL — each instance streams the bytes itself
  // so the URL is not IP-bound to our server. Content-Range from Invidious
  // is unreliable (always reports end+1 as total) so we byte-pipe it.
  // Used ONLY as last resort when both yt-dlp and ytdl-core fail.
  const tryInvidious = (async () => {
    const r = await fetchInvidiousStreams(videoId, { isAudio: true })
    if (!r?.url) throw new Error('invidious: no url')
    const ok = await probeUpstreamPlayable(r.url)
    if (!ok) throw new Error('invidious: probe failed')
    return r.url
  })()

  // Race yt-dlp + ytdl-core first (these return proper googlevideo URLs with
  // correct Content-Range). Only if both fail do we fall back to Invidious.
  const primaryTagged = [
    tryJs.catch(e => { console.warn('[audio-proxy:js-fail]', e.message); throw e }),
    tryDlp.catch(e => { console.warn('[audio-proxy:dlp-fail]', e.message); throw e }),
  ]

  try {
    const winner = await Promise.any(primaryTagged)
    _audioUrlCache.set(youtubeUrl, { url: winner, expiresAt: Date.now() + _AUDIO_URL_CACHE_TTL_MS })
    _trimAudioUrlCache()
    // Let Invidious complete in background to warm its own cache.
    tryInvidious.catch(() => {})
    return winner
  } catch {
    // Primary extractors both failed — try Invidious as last resort.
    console.warn('[audio-proxy] primary extractors failed — trying Invidious fallback')
    try {
      const fallback = await tryInvidious
      _audioUrlCache.set(youtubeUrl, { url: fallback, expiresAt: Date.now() + 10 * 60 * 1000 }) // 10 min TTL for proxy URLs
      _trimAudioUrlCache()
      return fallback
    } catch (e2) {
      throw new Error(`all extractors failed: ${e2.message}`)
    }
  }
}

// Detect Safari/iOS — these clients can NOT decode the webm/opus that YouTube
// frequently serves as bestaudio. Any browser on iOS uses WebKit (and so has
// the same codec limits as Safari), and on macOS Safari is the only major
// browser without webm/opus support. We use ffmpeg to remux/transcode the
// upstream stream to fragmented MP4 + AAC so playback works there.
function isSafariOrIOS(ua) {
  if (!ua) return false
  const u = String(ua)
  if (/iPhone|iPad|iPod/i.test(u)) return true
  if (/Safari/i.test(u) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|OPiOS|Brave/i.test(u)) return true
  return false
}

// LRU-bound the URL cache so a long-running server doesn't grow unbounded.
// Googlevideo URLs are valid for ~6 hours but yt-dlp can rate-limit us if
// we re-resolve too aggressively, so we keep entries for 20 min and never
// hold more than 200 of them. This single cap is the difference between
// "works for an hour or two" and "works forever".
const _AUDIO_URL_CACHE_MAX = 200
const _AUDIO_URL_CACHE_TTL_MS = 20 * 60 * 1000
function _trimAudioUrlCache() {
  if (_audioUrlCache.size <= _AUDIO_URL_CACHE_MAX) return
  // Drop the oldest insertion-order entries until we're back under the cap.
  const overflow = _audioUrlCache.size - _AUDIO_URL_CACHE_MAX
  let i = 0
  for (const k of _audioUrlCache.keys()) {
    if (i++ >= overflow) break
    _audioUrlCache.delete(k)
  }
}

// Stream a remuxed AAC-in-MP4 audio response to the client by piping the
// upstream googlevideo URL through ffmpeg. Output is fragmented mp4 so the
// browser can start playback before the whole song is downloaded.
//   • `-c:a aac` re-encodes opus/webm → AAC (universal browser support).
//   • `frag_keyframe+empty_moov+default_base_moof` makes the file streamable
//      from the very first byte (no need for a seekable input).
//   • `-vn` skips any video stream and `-bsf:a aac_adtstoasc` keeps timestamps
//      clean if the source is already AAC-in-ADTS.
function remuxAudioToClient(upstreamUrl, req, res) {
  res.setHeader('Content-Type', 'audio/mp4')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  // Fragmented mp4 over a single response → no Range support, but the
  // browser can still start playback progressively as bytes arrive.
  res.setHeader('Accept-Ranges', 'none')

  const proc = spawn('ffmpeg', [
    '-loglevel', 'error',
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '4',
    '-user_agent', 'Mozilla/5.0',
    '-i', upstreamUrl,
    '-vn',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  let stderr = ''
  proc.stderr.on('data', d => { stderr += d.toString() })
  proc.stdout.pipe(res)

  proc.on('error', err => {
    console.warn('[audio-proxy:remux] ffmpeg spawn error:', err.message)
    if (!res.headersSent) res.status(502).end('فشل تحضير الصوت')
    else { try { res.end() } catch {} }
  })
  proc.on('close', code => {
    if (code !== 0 && code !== null) {
      console.warn('[audio-proxy:remux] ffmpeg exited', code, stderr.slice(0, 300))
    }
    try { res.end() } catch {}
  })

  // Kill ffmpeg if the listener closes the page / skips the track.
  req.on('close', () => { try { proc.kill('SIGKILL') } catch {} })
}

// PERMANENT-FIX RATIONALE
// ───────────────────────
// Earlier this endpoint piped bytes through the server. That worked locally
// but broke in production after 30 seconds because Vercel kills serverless
// functions at `maxDuration` (30s in vercel.json). For a 4-minute song the
// audio element saw the stream end mid-track, recovered, played another 30s,
// and so on — building up cache pressure and yt-dlp rate-limit hits until the
// player became unrecoverably broken after an hour or two. The byte-pipe also
// added our small Node host as a bandwidth bottleneck and a single point of
// failure for every active listener.
//
// The robust answer is the standard YouTube-frontend pattern:
//   1) Resolve the direct googlevideo URL once (cached).
//   2) 307-redirect the <audio> element straight to googlevideo.
// The Vercel function then exits in milliseconds, the browser streams from
// googlevideo at full CDN speed, and the function timeout becomes irrelevant.
// When googlevideo eventually 403s (URL expiry), the <audio> fires `error`,
// the client retries this endpoint with `&_r=<ts>`, which forces us to
// invalidate the cache and resolve a fresh URL. The browser then follows the
// new redirect and resumes from the saved position.
//
// The only client that still needs byte-pipe + ffmpeg is Safari/iOS (no
// opus/webm decode), which is handled by `remuxAudioToClient` below.
async function fetchUpstreamRange(upstreamUrl, rangeHeader) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
    'Range': rangeHeader || 'bytes=0-',
  }
  return fetch(upstreamUrl, { headers, redirect: 'follow' })
}

// Fast (≤2s) playability probe used to reject broken proxy-hosted URLs
// before they win the extractor race. Sends a 32-byte Range request and
// confirms the upstream responds 200/206 with an audio/* (or video/*)
// content-type. A failure here means following the URL would yield no
// playable audio (e.g. Piped's proxy 500ing, Invidious instance returning
// "stop abusing my server" plaintext, etc).
async function probeUpstreamPlayable(url, timeoutMs = 2500) {
  if (!url) return false
  let r
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    r = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': '*/*',
        'Range': 'bytes=0-31',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    })
    clearTimeout(t)
  } catch { return false }
  try {
    if (r.status !== 200 && r.status !== 206) {
      try { await r.body?.cancel() } catch {}
      return false
    }
    const ct = (r.headers.get('content-type') || '').toLowerCase()
    const okType = ct.startsWith('audio/') || ct.startsWith('video/') || ct.includes('octet-stream') || ct.includes('mp4') || ct.includes('webm')
    try { await r.body?.cancel() } catch {}
    return okType
  } catch { return false }
}

// True iff the URL points to a direct googlevideo CDN host (the kind of
// URL yt-dlp / ytdl-core return). Such URLs are IP-bound to the EXTRACTOR
// (= the server), so they cannot be safely 307-redirected to a browser —
// googlevideo will reject the follow-up because the requester IP doesn't
// match the URL's signed `ip` parameter. They DO work when fetched by the
// server itself, so we transparently switch to byte-pipe streaming for
// them inside the audio-proxy handler.
function isDirectGoogleVideoUrl(url) {
  try {
    const u = new URL(url)
    return /(^|\.)googlevideo\.com$/i.test(u.hostname)
  } catch { return false }
}

// Maximum bytes sent per serverless invocation.
// At 128 kbps audio, 1 MB = ~60 seconds of audio, streamed in <3s.
// This keeps every Vercel function invocation well under the 60s timeout.
// The browser automatically requests the next chunk via a follow-up Range
// request once it exhausts the current one.
const MAX_PIPE_CHUNK = 1 * 1024 * 1024 // 1 MB

// Shared byte-pipe streaming helper used by both /audio-pipe and the
// /audio-proxy path. ALWAYS responds 206 with a bounded chunk so that:
//  1. Vercel's 60-second function timeout is never hit (each call < 5s)
//  2. The browser gets a proper Content-Range and knows to fetch more
//  3. Piped/Invidious connections are proxied through our server —
//     no 307 redirect — so unstable upstream drops are invisible to
//     the browser's <audio> element (it only sees clean chunk responses).
async function streamAudioBytesToClient(req, res, youtubeUrl, initialUpstreamUrl) {
  // Parse the byte range the client wants.
  const rawRange = req.headers.range || ''
  let clientStart = 0
  let clientEnd = null
  if (rawRange) {
    const m = rawRange.match(/bytes=(\d+)-(\d*)/)
    if (m) {
      clientStart = parseInt(m[1], 10)
      clientEnd = m[2] ? parseInt(m[2], 10) : null
    }
  }

  // Clamp the chunk size so we never stream more than MAX_PIPE_CHUNK bytes
  // in a single serverless invocation, regardless of what the client asked for.
  const chunkEnd = (clientEnd !== null && clientEnd < clientStart + MAX_PIPE_CHUNK)
    ? clientEnd
    : clientStart + MAX_PIPE_CHUNK - 1
  const upstreamRange = `bytes=${clientStart}-${chunkEnd}`

  let upstreamUrl = initialUpstreamUrl
  let upstream
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      upstream = await fetchUpstreamRange(upstreamUrl, upstreamRange)
    } catch (e) {
      if (attempt === 1) { if (!res.headersSent) res.status(502).end('فشل'); else try { res.end() } catch {}; return }
      try { upstreamUrl = await resolveDirectAudioUrl(youtubeUrl, { bypassCache: true }) } catch { if (!res.headersSent) res.status(502).end('فشل'); return }
      continue
    }
    if ((upstream.status === 403 || upstream.status === 410 || upstream.status === 404) && attempt === 0) {
      try { upstream.body?.cancel?.() } catch {}
      try { upstreamUrl = await resolveDirectAudioUrl(youtubeUrl, { bypassCache: true }) } catch { if (!res.headersSent) res.status(502).end('فشل'); return }
      continue
    }
    break
  }
  if (!upstream || (!upstream.ok && upstream.status !== 206)) {
    if (!res.headersSent) return res.status(upstream?.status || 502).end('فشل')
    try { res.end() } catch {}
    return
  }

  const upstreamCT = upstream.headers.get('content-type') || 'audio/mp4'
  const upstreamLen = upstream.headers.get('content-length')   // bytes in THIS response
  const upstreamCR  = upstream.headers.get('content-range')    // bytes X-Y/TOTAL from upstream

  // Derive the true total file size so the browser knows there is more to fetch.
  let totalSize = '*'
  if (upstreamCR) {
    const m = upstreamCR.match(/\/(\d+)\s*$/)
    if (m) totalSize = m[1]
  }
  // If upstream returned 200 (ignoring our Range header) Content-Length IS total size.
  if (totalSize === '*' && upstream.status === 200 && upstreamLen) {
    totalSize = upstreamLen
  }

  // Actual last byte we will send (upstream may give us fewer than we asked).
  let actualEnd = chunkEnd
  if (upstreamLen) {
    const len = parseInt(upstreamLen, 10)
    if (!isNaN(len)) actualEnd = clientStart + len - 1
  }

  res.setHeader('Content-Type', upstreamCT)
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  // Always 206 + Content-Range so the browser treats this as a partial
  // response and issues a follow-up Range request for the next chunk.
  res.setHeader('Content-Range', `bytes ${clientStart}-${actualEnd}/${totalSize}`)
  if (upstreamLen) res.setHeader('Content-Length', upstreamLen)
  res.status(206)

  if (!upstream.body) { res.end(); return }
  const reader = upstream.body.getReader()
  let cancelled = false
  let bytesWritten = 0
  req.on('close', () => { cancelled = true; try { reader.cancel() } catch {} })
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done || cancelled) break
      if (!res.write(value)) await new Promise(r => res.once('drain', r))
      bytesWritten += value.length
      // Hard safety: stop after MAX_PIPE_CHUNK even if upstream ignores our Range
      if (bytesWritten >= MAX_PIPE_CHUNK) { try { reader.cancel() } catch {}; break }
    }
  } catch (e) { console.warn('[audio-bytes] interrupted:', e.message) }
  try { res.end() } catch {}
}

// ── Warm endpoint ─────────────────────────────────────────────────────────────
// Lightweight URL resolver that ONLY fills the audio URL cache and returns
// JSON. The mini-player calls this to pre-resolve the next track in the
// queue and DZ Tube cards call it on hover/touchstart, so by the time the
// user actually clicks Play, the cached googlevideo URL is ready and the
// real audio-proxy call returns a 307 in a few milliseconds.
//
// Concurrency-safe: an in-flight Map ensures parallel warms for the same
// URL share a single extractor race. Without it, hovering over multiple
// cards quickly would fire N parallel piped/invidious/yt-js/yt-dlp pipelines
// per card and rate-limit the upstream extractors.
const _warmInflight = new Map() // youtubeUrl -> Promise<string>
app.get('/api/dz-tube/warm', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ ok: false, error: 'invalid url' })

  const t0 = Date.now()
  // Fast path: already cached → return immediately, signal cache-hit.
  const cached = _audioUrlCache.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ ok: true, cached: true, ms: 0, expiresInMs: cached.expiresAt - Date.now() })
  }

  // Coalesce concurrent calls.
  let pending = _warmInflight.get(url)
  if (!pending) {
    pending = resolveDirectAudioUrl(url, { bypassCache: false })
      .finally(() => { _warmInflight.delete(url) })
    _warmInflight.set(url, pending)
  }

  try {
    await pending
    return res.json({ ok: true, cached: false, ms: Date.now() - t0 })
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message, ms: Date.now() - t0 })
  }
})

// Diagnostic: run each extractor independently and report which succeed/fail.
// Useful for triaging "audio doesn't play" reports — gated behind a token so
// the diagnostic surface isn't open to the world. Set DEBUG_EXTRACT_TOKEN to
// enable; pass `?token=<value>`.
app.get('/api/dz-tube/debug-extract', async (req, res) => {
  const expected = process.env.DEBUG_EXTRACT_TOKEN
  if (!expected) return res.status(404).end()
  if (String(req.query.token || '') !== expected) return res.status(403).end()
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'invalid url' })
  const videoId = extractYouTubeVideoId(url)
  const t0 = Date.now()
  const runOne = async (name, fn) => {
    const s = Date.now()
    try {
      const out = await fn()
      return { name, ok: true, ms: Date.now() - s, url: typeof out === 'string' ? out.slice(0, 200) : (out?.url || '').slice(0, 200) }
    } catch (e) {
      return { name, ok: false, ms: Date.now() - s, error: String(e?.message || e).slice(0, 400) }
    }
  }
  const dlpBin = await ytDlpBinaryPath().catch(() => null)
  const cookiesPath = await ytDlpCookiesPath().catch(() => null)
  const results = await Promise.all([
    runOne('piped', async () => {
      const r = await fetchPipedStreams(videoId, { isAudio: true })
      if (!r?.url) throw new Error('no url')
      const probe = await probeUpstreamPlayable(r.url)
      return { url: r.url, probe }
    }),
    runOne('invidious', async () => {
      const r = await fetchInvidiousStreams(videoId, { isAudio: true })
      if (!r?.url) throw new Error('no url')
      const probe = await probeUpstreamPlayable(r.url)
      return { url: r.url, probe }
    }),
    runOne('ytdl-core', async () => {
      const info = await ytdl.getInfo(url)
      const fmt = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
      if (!fmt?.url) throw new Error('no url')
      return fmt.url
    }),
    runOne('yt-dlp', async () => {
      if (!dlpBin) throw new Error('binary not available')
      const cookies = await ytDlpCookiesArgs()
      const antiBot = ytDlpAntiBotArgs()
      return await new Promise((resolve, reject) => {
        const proc = spawn(dlpBin, ['-f', 'bestaudio[ext=m4a]/bestaudio/best', '-g', '--no-playlist', ...antiBot, ...cookies, url])
        let out = '', err = ''
        const t = setTimeout(() => { try { proc.kill('SIGKILL') } catch {}; reject(new Error('timeout 15s; stderr=' + err.slice(0, 300))) }, 15000)
        proc.stdout.on('data', d => { out += d.toString() })
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('error', e => { clearTimeout(t); reject(e) })
        proc.on('close', code => { clearTimeout(t); const u = out.trim().split('\n')[0]; if (code !== 0 || !u) return reject(new Error('exit ' + code + '; stderr=' + err.slice(0, 300))); resolve(u) })
      })
    }),
  ])
  res.json({ videoId, totalMs: Date.now() - t0, dlpBin, cookiesConfigured: !!cookiesPath, results })
})

app.get('/api/dz-tube/audio-proxy', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).end('invalid url')

  // Client-driven cache invalidation. The mini-player adds `&_r=<ts>` on
  // every recovery rebind — that's our signal that the current cached URL
  // is dead and we must re-extract.
  const bypassCache = !!req.query._r

  // Resolve the upstream URL.
  let upstreamUrl
  try {
    upstreamUrl = await resolveDirectAudioUrl(url, { bypassCache })
  } catch (e) {
    console.error('[audio-proxy] resolve failed:', e.message)
    return res.status(502).end('فشل تحضير الصوت')
  }

  // Safari / iOS path: remux opus/webm to AAC-in-MP4 in a streaming ffmpeg
  // pipeline. WebKit can't decode opus directly.
  const wantRemux = req.query.force_remux === '1' || isSafariOrIOS(req.headers['user-agent'])
  if (wantRemux && await ffmpegAvailable()) {
    return remuxAudioToClient(upstreamUrl, req, res)
  }

  // ALWAYS byte-pipe — never 307-redirect.
  // Previously we 307-redirected Piped/Invidious URLs directly to the browser.
  // This caused two fatal bugs:
  //  1. Piped/Invidious instances close connections after a few KB (rate limiting,
  //     abuse prevention). When they do, the browser's <audio> element receives a
  //     clean close and fires 'ended' — the player thinks the track finished and
  //     advances to the next one, causing silent playback.
  //  2. crossOrigin='anonymous' on the <audio> element triggers a CORS preflight.
  //     Piped doesn't always return Access-Control-Allow-Origin: *, so the request
  //     is silently blocked by the browser.
  // By always routing through streamAudioBytesToClient we:
  //  • Control the connection (Piped drops are invisible to the browser)
  //  • Serve chunks ≤1 MB so every Vercel invocation finishes in < 5 s
  //  • Let the browser request successive Range chunks automatically
  return streamAudioBytesToClient(req, res, url, upstreamUrl)
})

// Clean /api/stream?id=VIDEO_ID alias used by the Service Worker and any
// external consumer. Translates a bare video ID to the full audio-proxy flow.
app.get('/api/stream', async (req, res) => {
  const id = String(req.query.id || '').trim()
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return res.status(400).end('invalid id')
  // Rewrite to the canonical YouTube URL so resolveDirectAudioUrl recognises it.
  req.query.url = `https://www.youtube.com/watch?v=${id}`
  // Proxy through the same byte-pipe handler used by the mini-player.
  const url = req.query.url
  let upstreamUrl
  try {
    upstreamUrl = await resolveDirectAudioUrl(url, { bypassCache: !!req.query._r })
  } catch (e) {
    console.error('[stream] resolve failed:', e.message)
    return res.status(502).end('فشل تحضير الصوت')
  }
  // Set appropriate headers for clients that consume this as a standalone URL.
  res.setHeader('Content-Type', 'audio/mpeg')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  return streamAudioBytesToClient(req, res, url, upstreamUrl)
})

// Explicit byte-pipe endpoint kept for parity with the client's fallback
// path (after multiple 403s on the redirect path the mini-player flips to
// this). Now that audio-proxy auto-routes direct googlevideo URLs through
// the byte-pipe, this is rarely needed but remains as an escape hatch.
app.get('/api/dz-tube/audio-pipe', async (req, res) => {
  const url = String(req.query.url || '')
  if (!isValidYouTubeUrl(url)) return res.status(400).end('invalid url')

  let upstreamUrl
  try {
    upstreamUrl = await resolveDirectAudioUrl(url, { bypassCache: !!req.query._r })
  } catch (e) {
    return res.status(502).end('فشل تحضير الصوت')
  }

  return streamAudioBytesToClient(req, res, url, upstreamUrl)
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

// Resolve an audio URL for a YouTube link.
// Strategy (tried in order):
//   1. iOS player_client → prefers HLS m3u8 manifest URLs (best for background audio)
//   2. bestaudio without player_client restriction → direct googlevideo URL
// Returns { url: string, isHls: boolean }
async function resolveAudioPlaylistUrl(youtubeUrl) {
  const dlpBin = await ytDlpBinaryPath()
  if (!dlpBin) throw new Error('yt-dlp غير متوفر على هذا الخادم')
  const cookies = await ytDlpCookiesArgs()

  // Helper: run yt-dlp with given args, returns the first output URL or null
  function runDlp(extraArgs) {
    return new Promise(resolve => {
      try {
        const proc = spawn(dlpBin, [
          ...extraArgs,
          ...cookies,
          '-g', '--no-warnings', '--no-playlist', youtubeUrl,
        ])
        let out = '', err = ''
        proc.stdout.on('data', d => { out += d.toString() })
        proc.stderr.on('data', d => { err += d.toString() })
        proc.on('error', () => resolve(null))
        proc.on('close', code => {
          const u = out.trim().split('\n')[0]
          if (code === 0 && u && /^https?:\/\//.test(u)) resolve(u)
          else resolve(null)
        })
      } catch { resolve(null) }
    })
  }

  // Attempt 1: iOS player_client — returns HLS m3u8 manifest.
  // This is the best format for background audio: segment-based (3-10 s),
  // immune to Vercel's 60s timeout, buffers ahead, no SABR streaming issues.
  const iosUrl = await runDlp(['--extractor-args', 'youtube:player_client=ios', '--no-check-formats', '-f', 'ba/bestaudio'])
  if (iosUrl) {
    const isHls = /\.m3u8($|\?)/i.test(iosUrl) || /manifest\.googlevideo\.com/i.test(iosUrl)
    console.log('[audio-stream] resolved via iOS client —', isHls ? 'HLS ✓' : 'direct')
    return { url: iosUrl, isHls }
  }

  // Attempt 2: android client — returns direct googlevideo URL.
  const androidUrl = await runDlp(['--extractor-args', 'youtube:player_client=android,ios,web', '--no-check-formats', '-f', 'bestaudio[ext=m4a]/bestaudio/best'])
  if (androidUrl) {
    console.log('[audio-stream] resolved via android client — direct URL')
    return { url: androidUrl, isHls: false }
  }

  // Attempt 3: tv_embedded client — often bypasses bot detection.
  const tvUrl = await runDlp(['--extractor-args', 'youtube:player_client=tv_embedded', '--no-check-formats', '-f', 'bestaudio/best'])
  if (tvUrl) {
    const isHls = /\.m3u8($|\?)/i.test(tvUrl) || /manifest\.googlevideo\.com/i.test(tvUrl)
    console.log('[audio-stream] resolved via tv_embedded client —', isHls ? 'HLS' : 'direct')
    return { url: tvUrl, isHls }
  }

  throw new Error('yt-dlp: could not resolve audio URL for ' + youtubeUrl)
}

// Cache resolved audio URLs (googlevideo signed URLs expire ~6h; refresh after 1h)
const _playlistUrlCache = new Map() // youtubeUrl -> { url, isHls, expiresAt }
async function getCachedPlaylistUrl(youtubeUrl) {
  const cached = _playlistUrlCache.get(youtubeUrl)
  if (cached && cached.expiresAt > Date.now()) return cached
  const result = await resolveAudioPlaylistUrl(youtubeUrl)
  _playlistUrlCache.set(youtubeUrl, { ...result, expiresAt: Date.now() + 60 * 60 * 1000 })
  return result
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

  let resolved
  try {
    resolved = await getCachedPlaylistUrl(url)
  } catch (e) {
    console.error('[audio-stream] resolve failed:', e.message)
    return res.status(502).end('فشل تحميل الصوت')
  }

  const { url: masterUrl, isHls } = resolved

  // Non-HLS path: yt-dlp returned a direct audio URL (not M3U8).
  // HLS.js cannot parse a direct audio stream as a playlist, so we return a
  // clear error here. The backgroundPlayer error handler in the frontend will
  // fall back to /api/dz-tube/audio-proxy automatically.
  if (!isHls) {
    console.log('[audio-stream] non-HLS — signalling 501 so client falls back to audio-proxy')
    return res.status(501).end('non-hls')
  }

  // HLS path: fetch the M3U8 manifest and rewrite segment URLs so they go
  // through our same-origin /audio-segment proxy (googlevideo segments are
  // IP-bound and must be fetched from the server that resolved them).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const upstream = await fetch(masterUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (upstream.status === 403 && attempt === 0) {
        _playlistUrlCache.delete(url)
        resolved = await getCachedPlaylistUrl(url)
        if (!resolved.isHls) {
          return res.redirect(307, `/api/dz-tube/audio-proxy?url=${encodeURIComponent(url)}`)
        }
        continue
      }
      if (!upstream.ok) {
        console.error('[audio-stream] upstream', upstream.status)
        return res.status(502).end('فشل تحميل الصوت')
      }
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

// Compute which video heights the *server* can actually deliver as a single
// downloadable mp4 file given the YouTube-offered heights.
//   - With ffmpeg: any height (video+audio streams can be merged)
//   - Without ffmpeg: only progressive single-file mp4s exist — itag 18 (360)
//     is universal; itag 22 (720) is being deprecated and rarely available.
//     We surface 360p as the only safe option in that case.
function computeDownloadableHeights(heights, hasFfmpeg) {
  const want = [144, 240, 360, 480, 720, 1080, 1440, 2160]
  if (hasFfmpeg) return want.filter(h => heights.some(yh => yh >= h)).slice().reverse()
  return heights.includes(360) || heights.length > 0 ? [360] : []
}

// Best-effort: ask ytdown.to which MP4 video heights are downloadable as
// single-file (audio+video already muxed). This bypasses the need for ffmpeg
// on the server and lets us expose the full range of qualities (360 → 1080+)
// in the UI even on serverless deployments. Returns a sorted-desc array of
// heights, or [] on any failure.
async function fetchYtdownHeights(youtubeUrl) {
  try {
    const yt = await fetchYtdownItems(youtubeUrl)
    const heights = (yt.items || [])
      .filter(it => it.type === 'Video' && it.format === 'MP4' && /^\d+p$/i.test(it.quality))
      .map(it => parseInt(it.quality, 10))
      .filter(h => Number.isFinite(h) && h > 0)
    return Array.from(new Set(heights)).sort((a, b) => b - a)
  } catch (e) {
    // Don't surface ytdown errors here — the JS/yt-dlp path already populated
    // a fallback set. Just log for diagnostics.
    console.warn('[DZTube:info:ytdown-heights]', e.message)
    return []
  }
}

// Merge two height arrays (server-known + ytdown), dedupe, sort desc.
function mergeDownloadableHeights(a, b) {
  const set = new Set()
  for (const h of a || []) if (Number.isFinite(h) && h > 0) set.add(h)
  for (const h of b || []) if (Number.isFinite(h) && h > 0) set.add(h)
  return Array.from(set).sort((x, y) => y - x)
}

app.post('/api/dz-tube/info', async (req, res) => {
  const { url } = req.body || {}
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'رابط YouTube غير صالح' })

  const hasFfmpeg = await ffmpegAvailable()
  const dlpBin = await ytDlpBinaryPath()

  // Run the ytdown.to height probe in parallel with the primary metadata
  // fetch — that way the multi-quality download menu is populated even on
  // serverless deployments where ffmpeg isn't on PATH (the previous code
  // path only surfaced 360p in that case).
  const ytdownHeightsPromise = fetchYtdownHeights(url)

  if (dlpBin) {
    try {
      const info = await runYtDlpJSONWith(dlpBin, url)
      const formats = (info.formats || [])
        .filter(f => f.vcodec && f.vcodec !== 'none' && f.height)
        .map(f => f.height)
      const heights = Array.from(new Set(formats)).sort((a, b) => b - a)
      const serverHeights = computeDownloadableHeights(heights, hasFfmpeg)
      const ytdownHeights = await ytdownHeightsPromise
      return res.json({
        title: info.title || 'بدون عنوان',
        thumbnail: info.thumbnail || null,
        duration: info.duration || 0,
        uploader: info.uploader || info.channel || '',
        view_count: info.view_count || 0,
        heights,
        downloadableHeights: mergeDownloadableHeights(serverHeights, ytdownHeights),
        hasFfmpeg,
        available: { mp4: heights.length > 0 || ytdownHeights.length > 0, mp3: true, audio: true },
      })
    } catch (e) {
      console.warn('[DZTube:info:dlp-fail, trying JS]', e.message)
    }
  }
  try {
    const out = await jsInfo(url)
    delete out._info
    out.hasFfmpeg = hasFfmpeg
    const serverHeights = computeDownloadableHeights(out.heights || [], hasFfmpeg)
    const ytdownHeights = await ytdownHeightsPromise
    out.downloadableHeights = mergeDownloadableHeights(serverHeights, ytdownHeights)
    out.available = { ...(out.available || {}), audio: true }
    if (ytdownHeights.length > 0) out.available.mp4 = true
    res.json(out)
  } catch (e) {
    // Even if both ytdl-core and yt-dlp failed, ytdown.to may still know
    // the available qualities — return a minimal payload so the UI can
    // still let the user pick a quality.
    const ytdownHeights = await ytdownHeightsPromise
    if (ytdownHeights.length > 0) {
      return res.json({
        title: 'بدون عنوان',
        thumbnail: null,
        duration: 0,
        uploader: '',
        view_count: 0,
        heights: ytdownHeights,
        downloadableHeights: ytdownHeights,
        hasFfmpeg,
        available: { mp4: true, mp3: true, audio: true },
      })
    }
    console.error('[DZTube:info:js]', e.message)
    res.status(500).json({ error: 'تعذر جلب معلومات الفيديو' })
  }
})

const DZ_TUBE_QUALITY_MAP = { '144': 144, '240': 240, '360': 360, '480': 480, '720': 720, '1080': 1080, '1440': 1440, '2160': 2160 }

// Stream a remote (upstream) URL through this server with a forced
// Content-Disposition so the browser triggers a real download instead of
// trying to play the file inline. Used for the Piped/googlevideo fallback
// path when yt-dlp fails on Vercel due to bot challenges.
async function streamUpstreamToClient(req, res, upstreamUrl, mime, downloadName) {
  try {
    const fwdHeaders = { 'User-Agent': 'Mozilla/5.0' }
    if (req.headers.range) fwdHeaders['Range'] = req.headers.range
    const upstream = await fetch(upstreamUrl, { headers: fwdHeaders })
    if (!upstream.ok && upstream.status !== 206) {
      console.warn('[DZTube:upstream-proxy] upstream', upstream.status)
      if (!res.headersSent) res.status(502).end('فشل تحميل الملف من المصدر البديل')
      return
    }
    res.setHeader('Content-Type', mime)
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
    const passHeaders = ['content-length', 'content-range', 'accept-ranges']
    for (const h of passHeaders) {
      const v = upstream.headers.get(h)
      if (v) res.setHeader(h, v)
    }
    res.status(upstream.status === 206 ? 206 : 200)
    if (!upstream.body) { res.end(); return }
    const reader = upstream.body.getReader()
    let cancelled = false
    req.on('close', () => { cancelled = true; try { reader.cancel() } catch {} })
    while (true) {
      const { done, value } = await reader.read()
      if (done || cancelled) break
      if (!res.write(value)) await new Promise(r => res.once('drain', r))
    }
    res.end()
  } catch (e) {
    console.error('[DZTube:upstream-proxy] failed:', e.message)
    if (!res.headersSent) res.status(502).end('فشل تحميل الملف من المصدر البديل')
    else { try { res.end() } catch {} }
  }
}

// ─── ytdown.to + process4.me resolver ────────────────────────────────────────
// Free public YouTube extraction service (same approach used by
// nadir-downloader.vercel.app). Bypasses YouTube bot detection on
// serverless because the actual extraction runs on ytdown.to's workers.
// Returns: { title, thumbnail, items: [{ type, quality, format, url, size, task, mediaUrl }] }
const _YTDOWN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
const _YTDOWN_MAX_API_RETRIES = 2
const _YTDOWN_MAX_POLL_ATTEMPTS = 12
const _YTDOWN_POLL_DELAY_MS = 1500
const _YTDOWN_QUALITY_LABEL = { FHD: '1080p', HD: '720p', SD: '480p' }

async function _ytdownPollProcess4(mediaUrl) {
  const headers = { 'User-Agent': _YTDOWN_UA, 'Referer': 'https://app.ytdown.to/', 'Accept': 'application/json' }
  for (let i = 0; i < _YTDOWN_MAX_POLL_ATTEMPTS; i++) {
    try {
      const r = await fetch(mediaUrl, { headers, signal: AbortSignal.timeout(15000) })
      if (r.ok) {
        const j = await r.json().catch(() => ({}))
        const status = String(j.status || '').toLowerCase()
        if (status === 'completed' && j.fileUrl) return { fileUrl: j.fileUrl, fileSize: j.fileSize || '' }
        if (status === 'error' || status === 'failed') return null
      }
    } catch {}
    await new Promise(r => setTimeout(r, _YTDOWN_POLL_DELAY_MS))
  }
  return null
}

// Map ytdown.to API errors to user-friendly Arabic messages so the user
// understands WHY a particular video can't be downloaded (rather than seeing
// a generic "download failed").
function _ytdownFriendlyError(code, message) {
  const m = String(message || '').toLowerCase()
  if (code === 429 || m.includes('too many requests')) return 'الخدمة مشغولة جداً، انتظر دقيقة وحاول مرة أخرى'
  if (m.includes('private')) return 'هذا الفيديو خاص ولا يمكن تحميله'
  if (m.includes('unavailable') || m.includes('not exist') || m.includes('removed')) return 'هذا الفيديو محذوف أو غير متاح'
  if (m.includes('age') || m.includes('sign in')) return 'هذا الفيديو يتطلب تسجيل دخول (محتوى للبالغين أو محمي)'
  if (m.includes('region') || m.includes('country') || m.includes('geo')) return 'هذا الفيديو محظور في منطقة الخادم'
  if (m.includes('live') || m.includes('stream')) return 'البث المباشر لا يدعم التحميل'
  if (m.includes('premiere')) return 'العرض المجدول لم يُنشر بعد'
  if (m.includes('member') || m.includes('premium') || m.includes('paid')) return 'هذا المحتوى مدفوع أو محصور بالأعضاء'
  if (m.includes('copyright')) return 'الفيديو محظور بسبب حقوق الطبع'
  if (m.includes('maintenance') || code === 503) return 'الخدمة قيد الصيانة، حاول لاحقاً'
  return null
}

async function fetchYtdownItems(youtubeUrl) {
  const apiHeaders = {
    'User-Agent': _YTDOWN_UA,
    'Origin': 'https://app.ytdown.to',
    'Referer': 'https://app.ytdown.to/fr23/',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': '*/*',
  }
  const body = new URLSearchParams({ url: youtubeUrl }).toString()
  let lastErr = null
  let lastFriendly = null
  for (let attempt = 1; attempt <= _YTDOWN_MAX_API_RETRIES; attempt++) {
    try {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), 15000)
      const r = await fetch('https://app.ytdown.to/proxy.php', { method: 'POST', headers: apiHeaders, body, signal: ctl.signal })
      clearTimeout(t)
      if (!r.ok) { lastErr = `HTTP ${r.status}`; continue }
      const data = await r.json().catch(() => null)
      const api = data?.api
      if (!api) { lastErr = 'invalid response'; continue }
      const status = String(api.status || '').toLowerCase()
      if (status === 'error' || status !== 'ok') {
        // Specific upstream error — translate and bail (no retry helps here)
        const friendly = _ytdownFriendlyError(api.code, api.message)
        if (friendly) {
          const e = new Error(friendly); e.userFriendly = true; e.upstream = 'ytdown'; throw e
        }
        lastErr = api.message || `status=${status}`
        lastFriendly = null
        continue
      }
      const items = Array.isArray(api.mediaItems) ? api.mediaItems : []
      const out = []
      for (const m of items) {
        const type = m.type
        const ext = String(m.mediaExtension || '').toUpperCase()
        const qRaw = String(m.mediaQuality || '')
        const task = String(m.mediaTask || '').toLowerCase()
        const mediaUrl = m.mediaUrl
        if (!mediaUrl) continue
        const quality = _YTDOWN_QUALITY_LABEL[qRaw] || qRaw
        out.push({ type, quality, format: ext, mediaUrl, task, size: m.mediaFileSize || '' })
      }
      return { title: api.title || 'video', thumbnail: api.imagePreviewUrl || '', items: out }
    } catch (e) {
      if (e.userFriendly) throw e
      lastErr = e.message
    }
    await new Promise(r => setTimeout(r, 800))
  }
  const e = new Error(`ytdown.to: ${lastErr || 'unknown'}`); e.upstream = 'ytdown'; throw e
}

// Pick the best matching ytdown.to item for the requested format/quality.
// `wantFormat`: 'mp4' | 'mp3' | 'audio' (audio = m4a)
// `wantHeight`: numeric height (e.g. 720)
function pickYtdownItem(items, wantFormat, wantHeight) {
  if (!items?.length) return null
  if (wantFormat === 'mp3') {
    return items.find(it => it.type === 'Audio' && it.format === 'MP3') || null
  }
  if (wantFormat === 'audio') {
    // Prefer highest-bitrate M4A
    const audios = items.filter(it => it.type === 'Audio' && it.format === 'M4A')
    audios.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))
    return audios[0] || null
  }
  // Video MP4 — choose closest <=wantHeight, else fallback to highest available <=wantHeight
  const videos = items.filter(it => it.type === 'Video' && it.format === 'MP4' && /^\d+p$/i.test(it.quality))
  videos.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))
  const eligible = videos.filter(v => parseInt(v.quality) <= wantHeight)
  if (eligible.length) return eligible[0]
  return videos[videos.length - 1] || null
}

async function resolveYtdownDirectUrl(item) {
  if (!item) return null
  // The worker URL always returns a JSON status payload (even for task=download
  // it's already in "completed" state on the first hit). So we always poll;
  // the polling helper short-circuits on the first completed response.
  const polled = await _ytdownPollProcess4(item.mediaUrl)
  if (!polled) return null
  return { url: polled.fileUrl, size: polled.fileSize || item.size }
}

// ── PRIMARY yt-dlp downloader ─────────────────────────────────────────────────
// Downloads to a temp file via yt-dlp then streams it to the client.
// Returns true  → response was fully handled (success or client disconnected).
// Returns false → yt-dlp failed BEFORE writing any response headers so the
//                 caller can fall through to external-service fallbacks.
async function tryYtdlpDownloadToClient(req, res, url, format, h) {
  const dlpBin = await ytDlpBinaryPath()
  if (!dlpBin) return false

  const hasFfmpeg = await ffmpegAvailable()
  const cookies   = await ytDlpCookiesArgs()
  const isAudio   = format === 'mp3' || format === 'audio'
  const vid       = extractYouTubeVideoId(url) || 'video'
  const initialExt = format === 'mp3' ? 'mp3' : (format === 'audio' ? 'm4a' : 'mp4')

  // Resolve title in background (only for filename, doesn't block download)
  const titlePromise = fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    { headers: { 'User-Agent': YT_DLP_USER_AGENT }, signal: AbortSignal.timeout(6000) }
  ).then(r => r.ok ? r.json() : null).then(j => j?.title || null).catch(() => null)

  function buildArgs(clientIdx) {
    const antiBot = ytDlpAntiBotArgs(clientIdx)
    let args, mime
    if (format === 'mp3' && hasFfmpeg) {
      args = ['-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/18', '-x', '--audio-format', 'mp3', '--audio-quality', '0',
              '--no-playlist', '--no-warnings', ...antiBot, ...cookies]
      mime = 'audio/mpeg'
    } else if (isAudio && hasFfmpeg) {
      args = ['-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/18', '-x', '--audio-format', 'm4a',
              '--no-playlist', '--no-warnings', ...antiBot, ...cookies]
      mime = 'audio/mp4'
    } else if (isAudio) {
      args = ['-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/18',
              '--no-playlist', '--no-warnings', ...antiBot, ...cookies]
      mime = 'audio/mp4'
    } else if (hasFfmpeg) {
      const fmt = `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}][ext=mp4]/best[height<=${h}]/22/18`
      args = ['-f', fmt, '--merge-output-format', 'mp4',
              '--no-playlist', '--no-warnings', ...antiBot, ...cookies]
      mime = 'video/mp4'
    } else {
      const fmt = `best[ext=mp4][acodec!=none][vcodec!=none][height<=${h}]/best[ext=mp4][acodec!=none][vcodec!=none]/22/18`
      args = ['-f', fmt, '--no-playlist', '--no-warnings', ...antiBot, ...cookies]
      mime = 'video/mp4'
    }
    return { args, mime }
  }

  // ── Multi-client retry loop ─────────────────────────────────────
  for (let ci = 0; ci < YT_DLP_CLIENTS.length; ci++) {
    if (res.writableEnded || res.headersSent) return true
    const outPath = tmpFile(initialExt)
    const { args, mime } = buildArgs(ci)
    const fullArgs = [...args, '-o', outPath, url]

    console.log(`[DZTube:dlp] attempt ci=${ci} client=${YT_DLP_CLIENTS[ci]} format=${format} ffmpeg=${hasFfmpeg}`)

    const result = await new Promise((resolve) => {
      const TIMEOUT_MS = 5 * 60 * 1000
      const proc = spawn(dlpBin, fullArgs)
      let stderrBuf = '', clientGone = false

      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL') } catch {}
        safeUnlink(outPath)
        resolve({ ok: false, stderr: 'timeout', clientGone: false })
      }, TIMEOUT_MS)

      const onClose = () => {
        clientGone = true
        try { proc.kill('SIGTERM') } catch {}
        safeUnlink(outPath)
      }
      req.on('close', onClose)

      proc.stderr.on('data', d => { stderrBuf += d.toString() })
      proc.on('error', err => {
        clearTimeout(timer); req.off('close', onClose); safeUnlink(outPath)
        resolve({ ok: false, stderr: err.message, clientGone: false })
      })
      proc.on('close', async code => {
        clearTimeout(timer); req.off('close', onClose)
        if (clientGone) return resolve({ ok: false, clientGone: true })
        if (code !== 0) {
          safeUnlink(outPath)
          return resolve({ ok: false, stderr: stderrBuf, clientGone: false })
        }
        try {
          const st = fs.statSync(outPath)
          if (st.size === 0) { safeUnlink(outPath); return resolve({ ok: false, stderr: 'empty file', clientGone: false }) }
        } catch { return resolve({ ok: false, stderr: 'missing output', clientGone: false }) }
        resolve({ ok: true, stderr: '' })
      })
    })

    if (result.clientGone) return true  // client left, treated as handled
    if (result.ok) {
      const rawTitle = await Promise.race([titlePromise, Promise.resolve(null)])
      const safeTitle = (rawTitle || vid).replace(/[^\w\u0600-\u06FF\s.-]/g, '').slice(0, 80).trim().replace(/\s+/g, '_') || vid
      const downloadName = isAudio ? `${safeTitle}.${initialExt}` : `${safeTitle}_${h}p.${initialExt}`
      console.log(`[DZTube:dlp] ✓ ci=${ci} → ${downloadName}`)
      streamFileToClient(req, res, outPath, mime, downloadName)
      return true
    }

    console.warn(`[DZTube:dlp] ci=${ci} failed: ${result.stderr?.replace(/\n/g, ' ').slice(0, 300)}`)
    // Back off before next client (except last)
    if (ci < YT_DLP_CLIENTS.length - 1) await new Promise(r => setTimeout(r, 1500 + ci * 1000))
  }

  return false  // all clients failed — caller tries external fallbacks
}

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

  const h = DZ_TUBE_QUALITY_MAP[quality] || 720
  const isAudio = format === 'mp3' || format === 'audio'

  // ── PRIMARY: yt-dlp (fastest & most reliable when available) ─────────
  // We try this FIRST. External services (ytdown.to / Invidious / Piped)
  // are only used when yt-dlp is not installed (e.g. serverless Vercel).
  const primaryOk = await tryYtdlpDownloadToClient(req, res, url, format, h)
  if (primaryOk) return
  if (res.headersSent) return  // partial write — nothing more we can do
  console.warn('[DZTube:download] yt-dlp unavailable/failed — trying external services')

  // ── FALLBACK: Multi-source resolver ───────────────────────────────────
  // Capability matrix (refreshed 2026-04-24):
  //   • ytdown.to  → MP4 (any height), M4A audio, MP3 audio  ✅ all formats
  //   • Piped      → ONLY audio-only streams (M4A/WebM). Their video URLs
  //                  are DASH video-only (no audio) so unusable without
  //                  ffmpeg. Skipped for MP4 video and for MP3-conversion.
  //   • Invidious  → audio (M4A via /latest_version proxy) AND combined
  //                  progressive MP4 video (itag 18=360p / 22=720p) — the
  //                  proxy bypasses googlevideo's IP-bound signed URLs, so
  //                  it works for both formats from any deployment.
  //   • yt-dlp     → final fallback (block further below)
  let friendlyError = null
  let winner = null
  const vidId = extractYouTubeVideoId(url)

  const tryYtdown = (async () => {
    try {
      const yt = await fetchYtdownItems(url)
      const item = pickYtdownItem(yt.items, format, h)
      if (!item) return null
      const resolved = await resolveYtdownDirectUrl(item)
      if (!resolved?.url) return null
      return { source: 'ytdown', title: yt.title, url: resolved.url, quality: item.quality }
    } catch (e) {
      if (e.userFriendly) friendlyError = e.message
      console.warn('[DZTube:download] ytdown.to:', e.message)
      return null
    }
  })()

  const tryInvidious = (async () => {
    try {
      const inv = await fetchInvidiousStreams(vidId, { isAudio, height: h })
      if (!inv?.url) return null
      return { source: `invidious(${inv.instance})`, title: '', url: inv.url, quality: isAudio ? 'audio' : `${h}p`, ext: inv.ext, mime: inv.mime }
    } catch (e) { console.warn('[DZTube:download] invidious:', e.message); return null }
  })()

  // Piped only added to the audio race (it can't serve combined-AV video).
  let tryPiped = null
  if (format === 'audio') {
    tryPiped = (async () => {
      try {
        const piped = await fetchPipedStreams(vidId, { isAudio: true, height: h })
        if (!piped?.url) return null
        return { source: 'piped', title: '', url: piped.url, quality: 'audio', ext: piped.ext, mime: piped.mime }
      } catch (e) { console.warn('[DZTube:download] piped:', e.message); return null }
    })()
  }

  // Race — first non-null wins, but await all before declaring failure.
  const racers = [tryYtdown, tryInvidious, ...(tryPiped ? [tryPiped] : [])]
  winner = await Promise.race([
    ...racers.map(p => p.then(r => r || new Promise(() => {}))), // null never wins
    Promise.allSettled(racers).then(rs => {
      for (const r of rs) if (r.status === 'fulfilled' && r.value) return r.value
      return null
    }),
  ])
  // MP3 conversion still needs ffmpeg → only ytdown can satisfy it directly.
  // If ytdown didn't win and we're MP3, force the await on ytdown alone.
  if (!winner && format === 'mp3') winner = await tryYtdown

  if (winner) {
    const safe = (winner.title || 'video').replace(/[^\w\u0600-\u06FF\s.-]/g, '').slice(0, 80).trim().replace(/\s+/g, '_') || 'video'
    let dlExt, dlMime
    if (format === 'mp3') { dlExt = 'mp3'; dlMime = 'audio/mpeg' }
    else if (format === 'audio') { dlExt = winner.ext || 'm4a'; dlMime = winner.mime || 'audio/mp4' }
    else { dlExt = 'mp4'; dlMime = 'video/mp4' }
    const downloadName = isAudio ? `${safe}.${dlExt}` : `${safe}_${winner.quality || h+'p'}.${dlExt}`
    console.log(`[DZTube:download] ${winner.source} hit → ${downloadName}`)
    return await streamUpstreamToClient(req, res, winner.url, dlMime, downloadName)
  }

  // If ytdown returned an actionable error (private / live / unavailable),
  // surface it immediately — yt-dlp won't fare better for these cases.
  if (friendlyError) return res.status(400).send(`فشل التحميل: ${friendlyError}`)

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
    const antiBot = ytDlpAntiBotArgs()
    // NOTE (2025-2026): YouTube now requires a "GVS PO Token" for separate
    // audio/video streams on most clients, so `bestaudio` and `bestvideo`
    // often return "Requested format is not available". Format `18` (360p
    // mp4 with combined audio+video) does NOT need a PO Token, so we use
    // it as a universal fallback in every format string below.
    if (format === 'mp3' && hasFfmpeg) {
      args = ['-f', 'bestaudio/18', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', outPath, '--no-playlist', '--no-warnings', ...antiBot, ...cookies, url]
      downloadName = `${safeName}.mp3`
      mime = 'audio/mpeg'
    } else if (isAudio && hasFfmpeg) {
      // Want native m4a — extract audio (transcodes from 18 if needed)
      args = ['-f', 'bestaudio[ext=m4a]/bestaudio/18', '-x', '--audio-format', 'm4a', '-o', outPath, '--no-playlist', '--no-warnings', ...antiBot, ...cookies, url]
      downloadName = `${safeName}.m4a`
      mime = 'audio/mp4'
    } else if (isAudio) {
      // No ffmpeg → if bestaudio is unavailable we serve format 18 (mp4
      // with audio); browsers can still play the audio track from it.
      args = ['-f', 'bestaudio[ext=m4a]/bestaudio/18', '-o', outPath, '--no-playlist', '--no-warnings', ...antiBot, ...cookies, url]
      downloadName = `${safeName}.m4a`
      mime = 'audio/mp4'
    } else if (hasFfmpeg) {
      const fmt = `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${h}][ext=mp4]/best[height<=${h}]/22/18`
      args = ['-f', fmt, '--merge-output-format', 'mp4', '-o', outPath, '--no-playlist', '--no-warnings', ...antiBot, ...cookies, url]
      downloadName = `${safeName}_${h}p.mp4`
      mime = 'video/mp4'
    } else {
      // No ffmpeg → must use a single progressive (combined audio+video) file.
      // 22 = 720p mp4, 18 = 360p mp4. Many videos only expose 18 nowadays.
      const fmt = `best[ext=mp4][acodec!=none][vcodec!=none][height<=${h}]/best[ext=mp4][acodec!=none][vcodec!=none]/22/18`
      args = ['-f', fmt, '-o', outPath, '--no-playlist', '--no-warnings', ...antiBot, ...cookies, url]
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
    proc.on('close', async code => {
      if (killed) return
      if (code !== 0) {
        console.warn('[DZTube:download:dlp] exit', code, stderrBuf.slice(0, 600))
        safeUnlink(outPath)
        if (res.headersSent) return res.end()
        // Try Piped fallback (free public YouTube proxy) before giving up.
        // We PROXY the resulting googlevideo URL through this server so the
        // browser (a) actually triggers a download (Content-Disposition is
        // attached) and (b) avoids googlevideo's signed-IP restriction.
        try {
          const vid = extractYouTubeVideoId(url)
          const piped = await fetchPipedStreams(vid, { isAudio, height: h })
          if (piped?.url) {
            console.log('[DZTube:download] Piped fallback hit for', vid)
            const fallbackName = isAudio
              ? `${safeName}.${piped.ext === 'webm' ? 'webm' : 'm4a'}`
              : `${safeName}_${h}p.${piped.ext === 'webm' ? 'webm' : 'mp4'}`
            const fallbackMime = piped.mime || (isAudio ? 'audio/mp4' : 'video/mp4')
            return await streamUpstreamToClient(req, res, piped.url, fallbackMime, fallbackName)
          }
        } catch (e) { console.warn('[DZTube:download] Piped fallback error', e.message) }
        const lower = stderrBuf.toLowerCase()
        const isBot = lower.includes('sign in to confirm') || lower.includes('not a bot') || lower.includes('http error 429') || lower.includes('cookie')
        const msg = isBot
          ? 'فشل التحميل: YouTube يحجب خادم النشر مؤقتاً وكل بدائلنا المجانية مشغولة. حاول مجدداً بعد دقيقة أو زوّدنا بـ YOUTUBE_COOKIES.'
          : `فشل التحميل: ${stderrBuf.split('\n').filter(l => l.includes('ERROR') || l.includes('error')).slice(-1)[0]?.slice(0, 220) || 'خطأ غير معروف'}`
        return res.status(500).end(msg)
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
app.post('/api/chat-room/join', async (req, res) => {
  const clientIp = getClientIp(req)
  if (bannedIPs.has(clientIp)) return res.status(403).json({ error: 'محظور من الدردشة.' })
  const { name, gender, adminSecret, profilePassword, avatar: bodyAvatar, profile } = req.body || {}
  if (!name?.trim() || !gender) return res.status(400).json({ error: 'Name and gender required' })
  const id = chatId()
  const isAdmin = adminSecret === CHAT_ADMIN_SECRET
  const allowedProfileFields = ['city', 'bio', 'twitter', 'instagram', 'facebook', 'tiktok', 'snapchat']
  const cleanProfile = {}
  for (const k of allowedProfileFields) {
    if (typeof profile?.[k] === 'string' && profile[k].trim()) cleanProfile[k] = profile[k].trim().slice(0, 100)
  }
  const avatar = (typeof bodyAvatar === 'string' && bodyAvatar.startsWith('data:image') && bodyAvatar.length < 200000)
    ? bodyAvatar
    : (typeof profile?.avatar === 'string' && profile.avatar.startsWith('data:image') && profile.avatar.length < 200000 ? profile.avatar : null)
  const session = { id, name: sanitizeString(name, 30), gender, isAdmin, lastSeen: Date.now(), ws: null, ip: clientIp, profile: cleanProfile, avatar, status: 'online', room: 'عام' }
  chatSessions.set(id, session)
  const joinMsg = pushChatMsg({
    id: chatId(), from: 'System', fromId: 'system', gender: 'bot',
    text: `${session.name} joined the chat.`, timestamp: Date.now(), isSystem: true,
  })
  broadcastChat({ type: 'message', msg: joinMsg })
  broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
  const [messages, pinned] = await Promise.all([dbGetMessages(0, 50), dbGetPinned()])
  res.json({ sessionId: id, isAdmin, profileId: id, avatar: avatar || null, messages, users: getOnlineUsers(), pinnedMessage: pinned })
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
  const { sessionId, text, dmTo, dmToName, replyTo: replyToObj, replyToId, replyToText, replyToFrom } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (!session) return res.status(401).json({ error: 'Invalid session' })
  const muteInfo = mutedUsers.get(sessionId)
  if (muteInfo && Date.now() < muteInfo.until) {
    const remainSec = Math.ceil((muteInfo.until - Date.now()) / 1000)
    return res.status(403).json({ error: 'muted', remainSec })
  }
  if (muteInfo && Date.now() >= muteInfo.until) mutedUsers.delete(sessionId)
  const cleanText = sanitizeString(text, 1000).trim()
  if (!cleanText) return res.status(400).json({ error: 'Empty message' })
  session.lastSeen = Date.now()
  const replyTo = replyToObj
    ? { id: replyToObj.id, from: replyToObj.from || '?', text: replyToObj.text }
    : (replyToId && replyToText ? { id: replyToId, from: replyToFrom || '?', text: replyToText } : null)
  const msg = pushChatMsg({
    id: chatId(), from: session.name, fromId: session.id, gender: session.gender,
    text: cleanText, timestamp: Date.now(),
    isDM: !!dmTo, dmTo: dmTo || null, dmToName: dmToName || null,
    isAdmin: !!session.isAdmin,
    fromAvatar: session.avatar || null,
    replyTo,
    room: session.room || 'عام',
  })
  if (dmTo) {
    const recip = [...chatSessions.values()].find(s => s.id === dmTo)
    const json = JSON.stringify({ type: 'message', msg })
    if (session.ws?.readyState === 1) session.ws.send(json)
    if (recip?.ws?.readyState === 1) {
      recip.ws.send(json)
      sendDmNotify(recip, session.name, session.id, cleanText, msg.timestamp, msg.id)
    }
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

app.get('/api/chat-room/messages', async (req, res) => {
  const since = Number(req.query.since) || 0
  const sessionId = req.query.sessionId
  const session = chatSessions.get(sessionId)
  if (session) session.lastSeen = Date.now()
  const msgs = await dbGetMessages(since, 80)
  res.json({ messages: msgs, users: getOnlineUsers(), count: chatSessions.size })
})

app.post('/api/chat-room/react', async (req, res) => {
  const { sessionId, msgId, emoji } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (!session) return res.status(401).json({ error: 'Invalid session' })
  if (!msgId || !emoji) return res.status(400).json({ error: 'msgId and emoji required' })
  const allowed = ['👍','❤️','😂','😮','😢','🔥']
  if (!allowed.includes(emoji)) return res.status(400).json({ error: 'Invalid emoji' })
  try { await dbReact(msgId, emoji, session.id) } catch {}
  const updated = await dbGetReactions(msgId)
  broadcastChat({ type: 'reaction', msgId, emoji, count: updated[emoji]?.count || 0, users: updated[emoji]?.users || [] })
  res.json({ ok: true, reactions: updated })
})

app.post('/api/chat-room/profile', (req, res) => {
  const { sessionId, profile } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (!session) return res.status(401).json({ error: 'Invalid session' })
  const allowedProfileFields = ['city', 'bio', 'twitter', 'instagram', 'facebook', 'tiktok', 'snapchat']
  const cleanProfile = {}
  for (const k of allowedProfileFields) {
    if (typeof profile?.[k] === 'string') cleanProfile[k] = profile[k].trim().slice(0, 100)
  }
  if (typeof profile?.avatar === 'string' && profile.avatar.startsWith('data:image') && profile.avatar.length < 200000) {
    session.avatar = profile.avatar
  } else if (profile?.avatar === null || profile?.avatar === '') {
    session.avatar = null
  }
  session.profile = cleanProfile
  broadcastChat({ type: 'profileUpdate', userId: session.id, profile: cleanProfile, avatar: session.avatar || null })
  res.json({ ok: true, avatar: session.avatar || null })
})

app.put('/api/chat-room/profile/update', (req, res) => {
  const { sessionId, city, facebook, instagram, tiktok, avatar } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (!session) return res.status(401).json({ error: 'Invalid session' })
  const cleanProfile = {
    city: typeof city === 'string' ? city.trim().slice(0, 100) : (session.profile?.city || ''),
    facebook: typeof facebook === 'string' ? facebook.trim().slice(0, 200) : (session.profile?.facebook || ''),
    instagram: typeof instagram === 'string' ? instagram.trim().slice(0, 100) : (session.profile?.instagram || ''),
    tiktok: typeof tiktok === 'string' ? tiktok.trim().slice(0, 100) : (session.profile?.tiktok || ''),
  }
  if (typeof avatar === 'string' && avatar.startsWith('data:image') && avatar.length < 200000) {
    session.avatar = avatar
  } else if (avatar === null || avatar === '') {
    session.avatar = null
  }
  session.profile = cleanProfile
  // Update fromAvatar in existing in-memory messages for this user
  for (const m of chatMessages) {
    if (m.fromId === session.id) m.fromAvatar = session.avatar || null
  }
  broadcastChat({ type: 'profileUpdate', userId: session.id, profile: cleanProfile, avatar: session.avatar || null })
  res.json({ ok: true, profile: cleanProfile, avatar: session.avatar || null })
})

app.post('/api/chat-room/admin', async (req, res) => {
  const { sessionId, action, targetId, msgId } = req.body || {}
  const session = chatSessions.get(sessionId)
  if (!session?.isAdmin) return res.status(403).json({ error: 'Unauthorized' })
  if (action === 'delete' && msgId) {
    await dbDeleteMsg(msgId)
    broadcastChat({ type: 'delete', msgId })
  } else if (action === 'block' && targetId) {
    const target = chatSessions.get(targetId)
    if (target?.ws?.readyState === 1) target.ws.close()
    chatSessions.delete(targetId)
    mutedUsers.delete(targetId)
    broadcastChat({ type: 'blocked', userId: targetId })
    broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
  } else if (action === 'ipban' && targetId) {
    const target = chatSessions.get(targetId)
    if (target) {
      if (target.ip) bannedIPs.add(target.ip)
      if (target.ws?.readyState === 1) target.ws.close()
      chatSessions.delete(targetId)
      mutedUsers.delete(targetId)
      broadcastChat({ type: 'blocked', userId: targetId })
      broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
    }
  } else if (action === 'mute' && targetId) {
    const durationMs = Number(req.body.durationMs) || 5 * 60 * 1000
    const until = Date.now() + durationMs
    mutedUsers.set(targetId, { until, durationMs })
    const target = chatSessions.get(targetId)
    if (target?.ws?.readyState === 1) target.ws.send(JSON.stringify({ type: 'muted', until, durationMs }))
    broadcastChat({ type: 'muteUpdate', userId: targetId, until })
  } else if (action === 'unmute' && targetId) {
    mutedUsers.delete(targetId)
    broadcastChat({ type: 'muteUpdate', userId: targetId, until: 0 })
  } else if (action === 'highlight' && msgId) {
    const m = chatMessages.find(m => m.id === msgId)
    if (m) { m.isHighlighted = true; broadcastChat({ type: 'update', msg: m }) }
  } else if (action === 'pin' && msgId) {
    const m = chatMessages.find(m => m.id === msgId)
    const pinData = m
      ? { id: m.id, text: m.text, from: m.from, timestamp: m.timestamp }
      : null
    if (pinData) {
      pinnedMessage = pinData
      await dbSetPinned(pinData)
      broadcastChat({ type: 'pinUpdate', pinnedMessage })
    }
  } else if (action === 'unpin') {
    pinnedMessage = null
    await dbSetPinned(null)
    broadcastChat({ type: 'pinUpdate', pinnedMessage: null })
  }
  res.json({ ok: true })
})

// ===== WEBSOCKET CHAT SERVER =====
function setupChatWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/chat' })
  wss.on('connection', (ws, req) => {
    const clientIp = getClientIp(req)
    if (bannedIPs.has(clientIp)) { ws.close(); return }
    let sid = null
    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(raw.toString())
        if (data.type === 'join') {
          const { name, gender, adminSecret, profilePassword, profile, sessionId: existingSessionId } = data
          if (!name?.trim() || !gender) return ws.close()
          // Reuse existing HTTP session if provided — preserves isAdmin flag
          const existingSession = existingSessionId ? chatSessions.get(existingSessionId) : null
          const id = (existingSession && existingSession.id) ? existingSession.id : chatId()
          sid = id
          // isAdmin: reuse from HTTP session OR verify via adminSecret ONLY (profilePassword never grants admin)
          const isAdmin = !!(existingSession?.isAdmin || adminSecret === CHAT_ADMIN_SECRET)
          const allowedProfileFields = ['city', 'bio', 'twitter', 'instagram', 'facebook', 'tiktok', 'snapchat']
          const cleanProfile = {}
          for (const k of allowedProfileFields) {
            if (typeof profile?.[k] === 'string' && profile[k].trim()) cleanProfile[k] = profile[k].trim().slice(0, 100)
          }
          const wsAvatar = typeof profile?.avatar === 'string' && profile.avatar.startsWith('data:image') && profile.avatar.length < 200000 ? profile.avatar : (existingSession?.avatar || null)
          chatSessions.set(id, { ...(existingSession || {}), id, name: sanitizeString(name, 30), gender, isAdmin, lastSeen: Date.now(), ws, ip: clientIp, profile: Object.keys(cleanProfile).length ? cleanProfile : (existingSession?.profile || {}), avatar: wsAvatar, status: data.status || existingSession?.status || 'online', room: data.room || existingSession?.room || 'عام' })
          const session = chatSessions.get(id)
          const [wsMessages, wsPinned] = await Promise.all([dbGetMessages(0, 50), dbGetPinned()])
          if (pinnedMessage === null) pinnedMessage = wsPinned
          ws.send(JSON.stringify({ type: 'welcome', sessionId: id, isAdmin, profileId: id, messages: wsMessages, users: getOnlineUsers(), pinnedMessage: pinnedMessage || wsPinned }))
          const joinMsg = pushChatMsg({ id: chatId(), from: 'System', fromId: 'system', gender: 'bot', text: isAdmin ? 'انضم إلى الدردشة' : `${session.name} انضم إلى الدردشة`, timestamp: Date.now(), isSystem: true, isAdminAnnounce: !!isAdmin })
          broadcastChat({ type: 'message', msg: joinMsg }, ws)
          ws.send(JSON.stringify({ type: 'message', msg: joinMsg }))
          broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
        } else if (data.type === 'message') {
          const session = sid ? chatSessions.get(sid) : null
          if (!session) return
          const muteEntry = mutedUsers.get(sid)
          if (muteEntry && Date.now() < muteEntry.until) {
            const remainSec = Math.ceil((muteEntry.until - Date.now()) / 1000)
            ws.send(JSON.stringify({ type: 'muted', until: muteEntry.until, remainSec }))
            return
          }
          if (muteEntry && Date.now() >= muteEntry.until) mutedUsers.delete(sid)
          session.lastSeen = Date.now()
          const cleanText = sanitizeString(data.text, 1000).trim()
          if (!cleanText) return
          // Profanity guard — DZ Chat
          const chatMod = moderateMessage(cleanText, session.name)
          if (!chatMod.ok) {
            const warnMsg = pushChatMsg({
              id: chatId(), from: 'DZ AGENT 🤖', fromId: 'dzagent', gender: 'bot',
              text: chatMod.replyIfBlocked, timestamp: Date.now(), isSystem: true,
            })
            ws.send(JSON.stringify({ type: 'message', msg: warnMsg }))
            return
          }
          const wsReplyTo = data.replyTo ? { id: data.replyTo.id, from: data.replyTo.from || '?', text: data.replyTo.text } : null
          const msg = pushChatMsg({
            id: chatId(), from: session.name, fromId: session.id, gender: session.gender,
            text: cleanText, timestamp: Date.now(),
            isDM: !!data.dmTo, dmTo: data.dmTo || null, dmToName: data.dmToName || null,
            isAdmin: !!session.isAdmin,
            fromAvatar: session.avatar || null,
            replyTo: wsReplyTo,
            room: session.room || 'عام',
          })
          if (data.dmTo) {
            const recip = [...chatSessions.values()].find(s => s.id === data.dmTo)
            const json = JSON.stringify({ type: 'message', msg })
            ws.send(json)
            if (recip?.ws?.readyState === 1) {
              recip.ws.send(json)
              sendDmNotify(recip, session.name, session.id, cleanText, msg.timestamp, msg.id)
            }
          } else {
            broadcastChat({ type: 'message', msg })
          }
          const lower = cleanText.toLowerCase()
          if (lower.startsWith('@dzgpt') || lower.startsWith('@dzagent')) {
            handleAiChatTrigger(cleanText, lower.startsWith('@dzagent'), session)
          }
        } else if (data.type === 'typing') {
          const session = sid ? chatSessions.get(sid) : null
          if (!session) return
          broadcastChat({ type: 'typing', userId: session.id, name: session.name, gender: session.gender, isTyping: !!data.isTyping }, ws)
        } else if (data.type === 'react') {
          const session = sid ? chatSessions.get(sid) : null
          if (!session || !data.msgId || !data.emoji) return
          const allowed = ['👍','❤️','😂','😮','😢','🔥']
          if (!allowed.includes(data.emoji)) return
          try { await dbReact(data.msgId, data.emoji, session.id) } catch {}
          const updated = await dbGetReactions(data.msgId)
          broadcastChat({ type: 'reaction', msgId: data.msgId, emoji: data.emoji, count: updated[data.emoji]?.count || 0, users: updated[data.emoji]?.users || [] })
        } else if (data.type === 'setStatus') {
          const session = sid ? chatSessions.get(sid) : null
          if (!session) return
          if (['online','busy','away'].includes(data.status)) {
            session.status = data.status
            broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
          }
        } else if (data.type === 'setRoom') {
          const session = sid ? chatSessions.get(sid) : null
          if (session && data.room) session.room = data.room
        } else if (data.type === 'msgRead') {
          const session = sid ? chatSessions.get(sid) : null
          if (!session || !data.msgId) return
          const targetMsg = chatMessages.find(m => m.id === data.msgId && m.isDM)
          if (!targetMsg) return
          if (!targetMsg.readBy) targetMsg.readBy = []
          if (!targetMsg.readBy.includes(sid)) targetMsg.readBy.push(sid)
          const sender = chatSessions.get(targetMsg.fromId)
          if (sender?.ws?.readyState === 1) {
            sender.ws.send(JSON.stringify({ type: 'readReceipt', msgId: data.msgId, readBy: targetMsg.readBy }))
          }
        } else if (data.type === 'ping') {
          const session = sid ? chatSessions.get(sid) : null
          if (session) { session.lastSeen = Date.now(); ws.send(JSON.stringify({ type: 'pong', users: getOnlineUsers(), count: chatSessions.size })) }
        } else if (data.type === 'profileUpdate') {
          const session = sid ? chatSessions.get(sid) : null
          if (!session) return
          const allowedProfileFields = ['city', 'bio', 'twitter', 'instagram', 'facebook', 'tiktok', 'snapchat']
          const cleanProfile = {}
          for (const k of allowedProfileFields) {
            if (typeof data.profile?.[k] === 'string') cleanProfile[k] = data.profile[k].trim().slice(0, 100)
          }
          if (typeof data.avatar === 'string' && data.avatar.startsWith('data:image') && data.avatar.length < 200000) {
            session.avatar = data.avatar
          } else if (data.avatar === null || data.avatar === '') {
            session.avatar = null
          }
          session.profile = cleanProfile
          broadcastChat({ type: 'profileUpdate', userId: session.id, profile: cleanProfile, avatar: session.avatar || null })
        } else if (data.type === 'admin') {
          const session = sid ? chatSessions.get(sid) : null
          if (!session?.isAdmin) return
          if (data.action === 'delete' && data.msgId) {
            const m = chatMessages.find(m => m.id === data.msgId)
            if (m) m.isDeleted = true
            await dbDeleteMsg(data.msgId)
            broadcastChat({ type: 'delete', msgId: data.msgId })
          } else if (data.action === 'block' && data.targetId) {
            const target = chatSessions.get(data.targetId)
            if (target?.ws?.readyState === 1) target.ws.close()
            chatSessions.delete(data.targetId)
            mutedUsers.delete(data.targetId)
            broadcastChat({ type: 'blocked', userId: data.targetId })
            broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
          } else if (data.action === 'ipban' && data.targetId) {
            const target = chatSessions.get(data.targetId)
            if (target) {
              if (target.ip) bannedIPs.add(target.ip)
              if (target.ws?.readyState === 1) target.ws.close()
              chatSessions.delete(data.targetId)
              mutedUsers.delete(data.targetId)
              broadcastChat({ type: 'blocked', userId: data.targetId })
              broadcastChat({ type: 'users', users: getOnlineUsers(), count: chatSessions.size })
            }
          } else if (data.action === 'mute' && data.targetId) {
            const durationMs = Number(data.durationMs) || 5 * 60 * 1000
            const until = Date.now() + durationMs
            mutedUsers.set(data.targetId, { until, durationMs })
            const target = chatSessions.get(data.targetId)
            if (target?.ws?.readyState === 1) target.ws.send(JSON.stringify({ type: 'muted', until, durationMs }))
            broadcastChat({ type: 'muteUpdate', userId: data.targetId, until })
          } else if (data.action === 'unmute' && data.targetId) {
            mutedUsers.delete(data.targetId)
            broadcastChat({ type: 'muteUpdate', userId: data.targetId, until: 0 })
          } else if (data.action === 'highlight' && data.msgId) {
            const m = chatMessages.find(m => m.id === data.msgId)
            if (m) { m.isHighlighted = true; broadcastChat({ type: 'update', msg: m }) }
          } else if (data.action === 'pin' && data.msgId) {
            const m = chatMessages.find(m => m.id === data.msgId)
            if (m) {
              pinnedMessage = { id: m.id, text: m.text, from: m.from, timestamp: m.timestamp }
              await dbSetPinned(pinnedMessage)
              broadcastChat({ type: 'pinUpdate', pinnedMessage })
            }
          } else if (data.action === 'unpin') {
            pinnedMessage = null
            await dbSetPinned(null)
            broadcastChat({ type: 'pinUpdate', pinnedMessage: null })
          } else if (data.action === 'broadcast' && data.text) {
            const broadcastMsg = pushChatMsg({
              id: chatId(), from: session.name, fromId: session.id,
              gender: session.gender, text: String(data.text).slice(0, 500),
              timestamp: Date.now(), isAdmin: true, isBroadcast: true,
            })
            broadcastChat({ type: 'message', msg: broadcastMsg })
          }
        }
      } catch (err) { console.error('[WS:Chat]', err.message) }
    })
    ws.on('close', () => {
      if (sid) {
        const session = chatSessions.get(sid)
        if (session) {
          chatSessions.delete(sid)
          const leaveMsg = pushChatMsg({ id: chatId(), from: 'System', fromId: 'system', gender: 'bot', text: `${session.name} غادر الدردشة`, timestamp: Date.now(), isSystem: true })
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

// ===== MOUNT MULTI-AGENT LAYERS (must run on Vercel serverless too) =====
// These attach routes to `app` and must execute at import time, BEFORE the
// `app` is exported, so that Vercel's serverless wrapper sees them.
try {
  mountSmartAgent(app, {
    fetcher: (feed) => fetchMultipleFeeds([feed]).then(arr => arr[0] || null),
  })
} catch (err) {
  console.warn('[smart-agent] mount failed:', err.message)
}

try {
  const v2InternalBase = `http://127.0.0.1:${PORT}`
  const v2Fetch = async (path) => {
    try {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 5500)
      try {
        const r = await fetch(`${v2InternalBase}${path}`, { signal: ac.signal })
        if (!r.ok) return null
        return await r.json()
      } finally { clearTimeout(t) }
    } catch { return null }
  }
  mountDzAgentV2(app, {
    aiGenerate: ({ messages, query, max_tokens }) =>
      safeGenerateAI({ messages, query, max_tokens }),
    host: {
      fetchNews: (q) => v2Fetch(`/api/dz-agent/news?q=${encodeURIComponent(q || '')}&limit=8`),
      fetchCurrency: () => v2Fetch('/api/currency/latest'),
      fetchWeather: (city) => v2Fetch(`/api/dz-agent/weather?city=${encodeURIComponent(city || 'Algiers')}`),
      fetchWebSearch: (q) => v2Fetch(`/api/agent/ask?q=${encodeURIComponent(q || '')}&limit=6`),
      fetchGithub: (q) => v2Fetch(`/api/agent/github?q=${encodeURIComponent(q || '')}&limit=6`),
    },
  })
} catch (err) {
  console.warn('[dz-agent-v2] mount failed:', err.message)
}

// ===== DZ AGENT V3 (autonomous multi-agent + web app generator) =====
// Additive layer at /api/dz-agent-v3/*. Reuses the same safeGenerateAI chain.
try {
  mountDzAgentV3(app, {
    aiGenerate: ({ messages, query, max_tokens }) =>
      safeGenerateAI({ messages, query, max_tokens }),
  })
} catch (err) {
  console.warn('[dz-agent-v3] mount failed:', err.message)
}

// ===== DZ AGENT V4 PRO (multi-file project generation engine) =====
// Additive layer at /api/dz-agent-v4/*. Reuses the same safeGenerateAI chain.
// Implements: planner → generator → validator → persistent project store.
try {
  mountDzAgentV4(app, {
    aiGenerate: ({ messages, query, max_tokens }) =>
      safeGenerateAI({ messages, query, max_tokens }),
  })
} catch (err) {
  console.warn('[dz-agent-v4] mount failed:', err.message)
}

// ===== DESIGN INTELLIGENCE LAYER (additive — no existing routes changed) =====
// Endpoints: /api/dz-design/{health,analyze,tokens,generate-design-md,generate-page,improve,memory}
try {
  mountDesignIntelligence(app, {
    safeGenerateAI: ({ messages, query, max_tokens }) =>
      safeGenerateAI({ messages, query, max_tokens }),
  })
} catch (err) {
  console.warn('[dz-design] mount failed:', err.message)
}

// ===== DZ AGENT V5 — AUTONOMOUS AI OPERATING SYSTEM =====
// Additive endpoints: /api/dz-v5/{health,task,chat,tasks,memory,models,tools,workspace}
try {
  mountDzAgentV5(app, {
    safeGenerateAI: ({ messages, query, max_tokens }) =>
      safeGenerateAI({ messages, query, max_tokens }),
  })
} catch (err) {
  console.warn('[dz-v5] mount failed:', err.message)
}

// ===== AUTONOMOUS AGENT (Devin/Cursor style pipeline — /api/dz-agent/autonomous/*) =====
// Step-by-step: Analyze → Plan → Execute → Verify → Respond (SSE streaming)
try {
  mountAutonomousAgent(app, {
    aiGenerate: (params) => safeGenerateAI({ ...params }),
  })
} catch (err) {
  console.warn('[autonomous] mount failed:', err.message)
}

// ===== DZ TUBE ANALYTICS (mini-player events) =====
// Additive endpoints: /api/dz-tube/analytics/{event,recent,stats}.
try {
  mountDzTubeAnalytics(app)
} catch (err) {
  console.warn('[dz-tube-analytics] mount failed:', err.message)
}

// ===== DZ TUBE DOWNLOAD V2 (stable download engine — additive only) =====
// New endpoints: /api/dz-tube/v2/{health,info,download,mp3,audio-url,audio-proxy,queue,logs,cache/purge}
try {
  mountDownloadV2(app)
} catch (err) {
  console.warn('[dz-tube-v2] mount failed:', err.message)
}

// ===== YOUTUBE INSIGHT MODULE (plugin — additive only) =====
// New endpoints: /api/youtube-insight/{health,analyze,search,discuss,video/:id}
try {
  mountYouTubeInsight(app, {
    aiGenerate: ({ messages, query, max_tokens }) =>
      safeGenerateAI({ messages, query, max_tokens }),
  })
} catch (err) {
  console.warn('[youtube-insight] mount failed:', err.message)
}

// ===== CLONE ENGINE V2 (ultra website cloning — additive only) =====
// New endpoints: /api/dz-agent/clone-v2, /api/dz-agent/clone-v2/stream
try {
  mountCloneEngineV2(app, ({ messages, max_tokens }) =>
    safeGenerateAI({ messages, max_tokens })
  )
} catch (err) {
  console.warn('[clone-engine-v2] mount failed:', err.message)
}

// ===== DZ-GITHUB-EXECUTION-SKILL (real GitHub + Vercel ops — additive only) =====
// New endpoints: /api/github-skill/{health,analyze,file/*,branch/*,pr/*,debug,auto-fix,sync/*,execute}
try {
  mountGitHubSkill(app)
  mountMemoryRouter(app)
} catch (err) {
  console.warn('[github-skill] mount failed:', err.message)
}

// ===== MetaClaw Skill Evolution System =====
try {
  mountMetaClaw(app)
} catch (err) {
  console.warn('[MetaClaw] mount failed:', err.message)
}

// ══════════════════════════════════════════════════════════════════════
// DZ TOOLS — IMAGE SEARCH & VISUAL AI ENDPOINTS (available on Vercel too)
// ══════════════════════════════════════════════════════════════════════

// GET /api/tools/image-search?q=... — multi-source: Openverse + Wikimedia Commons fallback
app.get('/api/tools/image-search', async (req, res) => {
  const q = sanitizeString(String(req.query.q || ''), 200).trim()
  if (!q) return res.status(400).json({ error: 'query required', results: [] })

  // Translate Arabic keywords to English — apply ALL matches (not just first)
  const AR_EN_MAP = [
    ['الجزائر العاصمة', 'Algiers capital Algeria'],
    ['الجزائر', 'Algeria'],   ['جزائر', 'Algeria'],
    ['وهران', 'Oran Algeria'],['قسنطينة', 'Constantine Algeria'],
    ['عنابة', 'Annaba Algeria'], ['بجاية', 'Bejaia Algeria'],
    ['سطيف', 'Setif Algeria'], ['تلمسان', 'Tlemcen Algeria'],
    ['باتنة', 'Batna Algeria'], ['بسكرة', 'Biskra Algeria'],
    ['ورقلة', 'Ouargla Algeria'], ['تيزي وزو', 'Tizi Ouzou Algeria'],
    ['شروق', 'sunrise'], ['غروب', 'sunset'],
    ['بحر', 'sea'], ['جبل', 'mountain'], ['صحراء', 'sahara desert'],
    ['غابة', 'forest'], ['علم', 'flag'], ['مسجد', 'mosque'],
    ['قصبة', 'Casbah'], ['سوق', 'market'], ['شاطئ', 'beach'],
    ['مدينة', 'city'], ['قرية', 'village'], ['طبيعة', 'nature'],
    ['تقليدي', 'traditional'], ['ثقافة', 'culture'], ['تاريخ', 'history'],
    ['أزرق', 'blue'], ['أحمر', 'red'], ['أخضر', 'green'],
  ]
  let searchQ = q
  for (const [ar, en] of AR_EN_MAP) {
    if (searchQ.includes(ar)) searchQ = searchQ.split(ar).join(en)
  }
  const stillHasArabic = /[\u0600-\u06FF]/.test(searchQ)
  if (stillHasArabic) {
    searchQ = searchQ.replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+/g, '').trim() + ' Algeria'
  }
  searchQ = searchQ.replace(/\s+/g, ' ').trim() || 'Algeria'
  console.log(`[ImageSearch] original="${q}" searchQ="${searchQ}"`)

  // ── Source 1: Openverse (CC-licensed images) ──
  const fetchOpenverse = async () => {
    const params = new URLSearchParams({ q: searchQ, page_size: '24', license_type: 'all' })
    const r = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
      headers: { 'User-Agent': 'DZ-GPT/2.0 (dz-gpt.vercel.app; contact@dz-gpt.vercel.app)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) throw new Error(`Openverse ${r.status}`)
    const data = await r.json()
    return (data.results || []).map(img => ({
      id: `ov-${img.id}`,
      title: img.title || searchQ,
      url: img.url,
      thumbnail: img.url,
      source: img.source || 'openverse',
      license: img.license || 'CC',
      creator: img.creator || '',
      width: img.width || 0,
      height: img.height || 0,
    })).filter(img => img.url && img.url.startsWith('http'))
  }

  // ── Source 2: Wikimedia Commons (completely free, no key) ──
  const fetchWikimedia = async () => {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: `filetype:bitmap ${searchQ}`,
      gsrnamespace: '6',
      gsrlimit: '20',
      prop: 'imageinfo',
      iiprop: 'url|thumburl|extmetadata',
      iiurlwidth: '400',
      format: 'json',
      origin: '*',
    })
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { 'User-Agent': 'DZ-GPT/2.0 (dz-gpt.vercel.app)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) throw new Error(`Wikimedia ${r.status}`)
    const data = await r.json()
    const pages = Object.values(data?.query?.pages || {})
    return pages.map(p => {
      const info = p.imageinfo?.[0]
      if (!info?.url) return null
      const meta = info.extmetadata || {}
      const license = meta.LicenseShortName?.value || 'CC'
      const creator = meta.Artist?.value?.replace(/<[^>]*>/g, '') || ''
      return {
        id: `wm-${p.pageid}`,
        title: (p.title || '').replace(/^File:/, '').replace(/\.[^.]+$/, ''),
        url: info.url,
        thumbnail: info.thumburl || info.url,
        source: 'wikimedia',
        license,
        creator,
        width: info.width || 0,
        height: info.height || 0,
      }
    }).filter(Boolean).filter(img => img.url && img.url.startsWith('http'))
  }

  try {
    let results = []
    let total = 0
    let source = 'openverse'

    try {
      const ovResults = await fetchOpenverse()
      results = ovResults
      total = ovResults.length
      console.log(`[ImageSearch:Openverse] q="${searchQ}" results=${ovResults.length}`)
    } catch (ovErr) {
      console.warn(`[ImageSearch:Openverse] failed (${ovErr.message}) — trying Wikimedia`)
    }

    if (results.length < 3) {
      try {
        const wmResults = await fetchWikimedia()
        console.log(`[ImageSearch:Wikimedia] q="${searchQ}" results=${wmResults.length}`)
        const existingUrls = new Set(results.map(r => r.url))
        const wmNew = wmResults.filter(r => !existingUrls.has(r.url))
        results = [...results, ...wmNew]
        total = results.length
        source = results.length > 0 ? (results[0].source === 'openverse' ? 'openverse+wikimedia' : 'wikimedia') : 'none'
      } catch (wmErr) {
        console.warn(`[ImageSearch:Wikimedia] also failed: ${wmErr.message}`)
      }
    }

    console.log(`[ImageSearch] final q="${q}" results=${results.length} source=${source}`)
    if (results.length === 0) {
      return res.json({ results: [], total: 0, query: q, error: 'لم تُوجد صور — جرّب كلمات أبسط باللغة العربية أو الإنجليزية' })
    }
    return res.json({ results: results.slice(0, 24), total: total || results.length, query: q, source })
  } catch (err) {
    console.error('[ImageSearch] fatal error:', err.message)
    return res.status(500).json({ error: err.message, results: [] })
  }
})

// GET /api/tools/reverse-image?url=... — generate reverse search redirect links
app.get('/api/tools/reverse-image', (req, res) => {
  const imageUrl = sanitizeString(String(req.query.url || ''), 1000).trim()
  if (!imageUrl) return res.status(400).json({ error: 'url required' })
  const enc = encodeURIComponent(imageUrl)
  return res.json({
    links: [
      { name: 'Google Lens', url: `https://lens.google.com/uploadbyurl?url=${enc}`,                            icon: '🔍', color: '#4285F4' },
      { name: 'Bing Visual', url: `https://www.bing.com/images/search?q=imgurl:${enc}&view=detailv2&iss=sbi`,  icon: '🔎', color: '#00809d' },
      { name: 'Yandex',      url: `https://yandex.com/images/search?url=${enc}&rpt=imageview`,                 icon: '🟡', color: '#f0330a' },
      { name: 'TinEye',      url: `https://www.tineye.com/search?url=${enc}`,                                  icon: '👁️', color: '#72a81c' },
      { name: 'SauceNAO',   url: `https://saucenao.com/search.php?url=${enc}`,                                 icon: '🎨', color: '#1a1a2e' },
    ],
  })
})

// POST /api/tools/reverse-image-upload — upload base64 image → public URL → reverse search links
app.post('/api/tools/reverse-image-upload', async (req, res) => {
  const imageBase64 = String(req.body.imageBase64 || '')
  const mimeType = sanitizeString(String(req.body.mimeType || 'image/jpeg'), 50)
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' })

  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  const imgBuffer  = Buffer.from(base64Data, 'base64')
  const ext        = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  const filename   = `dz-image.${ext}`

  let publicUrl = null

  // ── Source 1: 0x0.st — completely free, no auth, no rate-limit for normal use ──
  try {
    const fd = new FormData()
    fd.append('file', new Blob([imgBuffer], { type: mimeType }), filename)
    const r = await fetch('https://0x0.st', {
      method: 'POST',
      headers: { 'User-Agent': 'DZ-GPT/2.0' },
      body: fd,
      signal: AbortSignal.timeout(18000),
    })
    if (r.ok) {
      const text = (await r.text()).trim()
      if (text.startsWith('http')) { publicUrl = text; console.log(`[ReverseUpload:0x0.st] ${publicUrl}`) }
    }
  } catch (e) { console.warn('[ReverseUpload:0x0.st] failed:', e.message) }

  // ── Source 2: tmpfiles.org ────────────────────────────────────────────────
  if (!publicUrl) {
    try {
      const fd = new FormData()
      fd.append('file', new Blob([imgBuffer], { type: mimeType }), filename)
      const r = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        headers: { 'User-Agent': 'DZ-GPT/2.0' },
        body: fd,
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) {
        const d = await r.json()
        // tmpfiles returns {"status":"success","data":{"url":"https://tmpfiles.org/..."}}
        const raw = d?.data?.url || ''
        if (raw) {
          // Convert tmpfiles viewer URL to direct URL
          publicUrl = raw.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
          console.log(`[ReverseUpload:tmpfiles] ${publicUrl}`)
        }
      }
    } catch (e) { console.warn('[ReverseUpload:tmpfiles] failed:', e.message) }
  }

  // ── Source 3: filebin.net ─────────────────────────────────────────────────
  if (!publicUrl) {
    try {
      const bin = `dzgpt-${Date.now()}`
      const r = await fetch(`https://filebin.net/${bin}/${filename}`, {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          'User-Agent': 'DZ-GPT/2.0',
          'Accept': 'application/json',
        },
        body: imgBuffer,
        signal: AbortSignal.timeout(15000),
      })
      if (r.ok) {
        publicUrl = `https://filebin.net/${bin}/${filename}`
        console.log(`[ReverseUpload:filebin] ${publicUrl}`)
      }
    } catch (e) { console.warn('[ReverseUpload:filebin] failed:', e.message) }
  }

  if (!publicUrl) {
    return res.status(500).json({ error: 'فشل رفع الصورة مؤقتاً — جرّب إدخال رابط URL مباشرة بدلاً من رفع الملف' })
  }

  const enc = encodeURIComponent(publicUrl)
  return res.json({
    url: publicUrl,
    links: [
      { name: 'Google Lens', url: `https://lens.google.com/uploadbyurl?url=${enc}`,                            icon: '🔍', color: '#4285F4' },
      { name: 'Bing Visual', url: `https://www.bing.com/images/search?q=imgurl:${enc}&view=detailv2&iss=sbi`,  icon: '🔎', color: '#00809d' },
      { name: 'Yandex',      url: `https://yandex.com/images/search?url=${enc}&rpt=imageview`,                 icon: '🟡', color: '#f0330a' },
      { name: 'TinEye',      url: `https://www.tineye.com/search?url=${enc}`,                                  icon: '👁️', color: '#72a81c' },
      { name: 'SauceNAO',   url: `https://saucenao.com/search.php?url=${enc}`,                                 icon: '🎨', color: '#1a1a2e' },
    ],
  })
})

// POST /api/tools/image-analyze — Vision AI (Gemini primary → OpenRouter fallback)
app.post('/api/tools/image-analyze', async (req, res) => {
  const imageBase64 = String(req.body.imageBase64 || '')
  const imageUrl    = sanitizeString(String(req.body.imageUrl || ''), 1000).trim()
  const mimeType    = sanitizeString(String(req.body.mimeType || 'image/jpeg'), 50)
  const mode        = sanitizeString(String(req.body.mode || 'analyze'), 20)

  const PROMPTS = {
    analyze: 'حلّل هذه الصورة بالتفصيل: اذكر كل ما تراه (الأشخاص، الأشياء، الألوان، الخلفية، الأجواء، أي نص مرئي). نظّم الإجابة بنقاط واضحة. أجب بالعربية.',
    ocr:     'استخرج كل النص الموجود في هذه الصورة بدقة تامة. حافظ على التنسيق الأصلي قدر الإمكان. أخرج النص المستخرج فقط دون أي تعليق.',
    caption: 'اكتب وصفاً موجزاً لهذه الصورة في جملة أو جملتين فقط. أجب بالعربية.',
    objects: 'حدّد وأعد قائمة بجميع الأشياء والعناصر المرئية في الصورة. رتّبها من الأبرز للأقل أهمية مع إشارة موضعها (يمين/يسار/مركز). أجب بالعربية.',
  }
  const prompt = PROMPTS[mode] || PROMPTS.analyze

  // ── Prepare image data (base64 or fetch from URL) ─────────────────────────
  let base64Data = ''
  let resolvedMime = mimeType

  if (imageBase64) {
    base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  } else if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DZ-GPT/2.0)',
          'Referer': 'https://dz-gpt.vercel.app',
        },
        signal: AbortSignal.timeout(15000),
      })
      if (!imgRes.ok) throw new Error(`تعذّر جلب الصورة: ${imgRes.status}`)
      const ct = imgRes.headers.get('content-type') || mimeType
      resolvedMime = ct.split(';')[0].trim() || mimeType
      const buf = await imgRes.arrayBuffer()
      base64Data = Buffer.from(buf).toString('base64')
    } catch (fetchErr) {
      return res.status(400).json({ error: `فشل جلب الصورة: ${fetchErr.message}` })
    }
  } else {
    return res.status(400).json({ error: 'imageBase64 أو imageUrl مطلوب' })
  }

  // ── Attempt 1: Gemini 1.5 Flash (primary) ────────────────────────────────
  // NOTE: do NOT send Referer header — GCP key has referer restrictions
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (geminiKey) {
    for (const gModel of ['gemini-1.5-flash', 'gemini-2.0-flash-lite']) {
      try {
        const body = {
          contents: [{ parts: [{ text: prompt }, { inlineData: { data: base64Data, mimeType: resolvedMime } }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        }
        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },  // NO Referer!
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30000),
          }
        )
        const gData = await gRes.json()
        if (gRes.ok && gData.candidates?.[0]?.content?.parts?.[0]?.text) {
          const content = gData.candidates[0].content.parts[0].text
          console.log(`[ImageAnalyze:Gemini/${gModel}] mode=${mode} ok (${content.length} chars)`)
          return res.json({ content, mode, model: gModel })
        }
        const errMsg = gData.error?.message || `HTTP ${gRes.status}`
        console.warn(`[ImageAnalyze:Gemini/${gModel}] failed: ${errMsg}`)
      } catch (gemErr) {
        console.warn(`[ImageAnalyze:Gemini/${gModel}] error: ${gemErr.message}`)
      }
    }
    console.warn('[ImageAnalyze:Gemini] all models failed — trying OpenRouter')
  }

  // ── Attempt 2: Groq Llama 4 Scout Vision (confirmed working) ─────────────
  const groqKey = process.env.AI_API_KEY
  if (groqKey) {
    try {
      const groqBody = {
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${resolvedMime};base64,${base64Data}` } },
          ],
        }],
        max_tokens: 2048,
        temperature: 0.4,
      }
      const gqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
        body: JSON.stringify(groqBody),
        signal: AbortSignal.timeout(30000),
      })
      const gqData = await gqRes.json()
      if (gqRes.ok && gqData.choices?.[0]?.message?.content) {
        const content = gqData.choices[0].message.content
        console.log(`[ImageAnalyze:Groq] mode=${mode} ok (${content.length} chars)`)
        return res.json({ content, mode, model: 'llama-4-scout-vision' })
      }
      console.warn(`[ImageAnalyze:Groq] failed: ${gqData.error?.message || `HTTP ${gqRes.status}`}`)
    } catch (gqErr) {
      console.warn(`[ImageAnalyze:Groq] error: ${gqErr.message}`)
    }
  }

  // ── Attempt 3: OpenRouter — additional fallback ───────────────────────────
  const orKey = process.env.OPENROUTER_API_KEY
  if (orKey) {
    const orModels = [
      'nvidia/nemotron-nano-12b-v2-vl:free',
      'google/gemma-4-31b-it:free',
    ]
    for (const model of orModels) {
      try {
        const orBody = {
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${resolvedMime};base64,${base64Data}` } },
            ],
          }],
          max_tokens: 2048,
          temperature: 0.4,
        }
        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${orKey}`,
            'HTTP-Referer': 'https://dz-gpt.vercel.app',
            'X-Title': 'DZ-GPT Vision',
          },
          body: JSON.stringify(orBody),
          signal: AbortSignal.timeout(30000),
        })
        const orData = await orRes.json()
        if (orRes.ok && orData.choices?.[0]?.message?.content) {
          const content = orData.choices[0].message.content
          console.log(`[ImageAnalyze:OpenRouter/${model}] mode=${mode} ok (${content.length} chars)`)
          return res.json({ content, mode, model: model.split('/').pop() })
        }
        const orErrMsg = orData.error?.message || orData.error || `HTTP ${orRes.status}`
        console.warn(`[ImageAnalyze:OpenRouter/${model}] failed: ${JSON.stringify(orErrMsg).slice(0, 100)}`)
      } catch (orErr) {
        console.warn(`[ImageAnalyze:OpenRouter/${model}] error: ${orErr.message}`)
      }
    }
  }

  // ── Attempt 3: Mistral Pixtral ────────────────────────────────────────────
  const mistralKey = process.env.MISTRAL_API_KEY
  if (mistralKey) {
    for (const mModel of ['pixtral-12b-2409', 'pixtral-large-latest']) {
      try {
        const mBody = {
          model: mModel,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${resolvedMime};base64,${base64Data}` } },
              { type: 'text', text: prompt },
            ],
          }],
          max_tokens: 2048,
        }
        const mRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mistralKey}` },
          body: JSON.stringify(mBody),
          signal: AbortSignal.timeout(30000),
        })
        const mText = await mRes.text()
        let mData = {}
        try { mData = JSON.parse(mText) } catch {}
        if (mRes.ok && mData.choices?.[0]?.message?.content) {
          const content = mData.choices[0].message.content
          console.log(`[ImageAnalyze:Mistral/${mModel}] mode=${mode} ok (${content.length} chars)`)
          return res.json({ content, mode, model: mModel })
        }
        console.warn(`[ImageAnalyze:Mistral/${mModel}] failed: HTTP ${mRes.status} — ${mText.slice(0, 120)}`)
      } catch (mErr) {
        console.warn(`[ImageAnalyze:Mistral/${mModel}] error: ${mErr.message}`)
      }
    }
  }

  // ── Attempt 4: HuggingFace (image captioning) ────────────────────────────
  const hfKey = process.env.HF_TOKEN
  if (hfKey) {
    // Try multiple HF models for image-to-text
    const hfModels = [
      'Salesforce/blip-image-captioning-large',
      'nlpconnect/vit-gpt2-image-captioning',
    ]
    for (const hfModel of hfModels) {
      try {
        const imgBytes = Buffer.from(base64Data, 'base64')
        const hfRes = await fetch(
          `https://api-inference.huggingface.co/models/${hfModel}`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': resolvedMime },
            body: imgBytes,
            signal: AbortSignal.timeout(30000),
          }
        )
        const hfText = await hfRes.text()
        if (hfRes.ok) {
          let hfData = {}
          try { hfData = JSON.parse(hfText) } catch {}
          const caption = Array.isArray(hfData) ? hfData[0]?.generated_text : hfData?.generated_text
          if (caption) {
            const content = `📷 **${caption}**\n\n*(تحليل بنموذج HuggingFace — لتحليل أعمق جرّب مرة أخرى)*`
            console.log(`[ImageAnalyze:HF/${hfModel}] ok (${caption.length} chars)`)
            return res.json({ content, mode, model: hfModel.split('/').pop() })
          }
        }
        console.warn(`[ImageAnalyze:HF/${hfModel}] failed: ${hfRes.status} ${hfText.slice(0, 80)}`)
      } catch (hfErr) {
        console.warn(`[ImageAnalyze:HF/${hfModel}] error: ${hfErr.message}`)
      }
    }
  }

  return res.status(500).json({ error: 'فشل تحليل الصورة — يرجى المحاولة مرة أخرى لاحقاً' })
})

// ── Image Processing Tools ─────────────────────────────────────────────────
const REMBG_PORT = 7000
let rembgReady = false

// POST /api/tools/img-remove-bg — rembg+alpha-matting (primary) → flood-fill (Vercel)
app.post('/api/tools/img-remove-bg', express.json({ limit: '25mb' }), async (req, res) => {
  const { imageBase64 } = req.body
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 مطلوب' })
  const b64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64

  // ── Primary: rembg + alpha matting (Replit / self-hosted) ─────────────────
  if (!process.env.VERCEL) {
    const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scripts', 'remove_bg.py')
    const pythonLibs = path.join(path.dirname(fileURLToPath(import.meta.url)), '.pythonlibs', 'lib', 'python3.11', 'site-packages')
    const payload = JSON.stringify({ image: b64, method: 'alpha_matting' })
    try {
      const result = await new Promise((resolve, reject) => {
        const proc = spawn('python3', [scriptPath], {
          env: { ...process.env, PYTHONPATH: pythonLibs },
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        const chunks = [], errChunks = []
        proc.stdout.on('data', d => chunks.push(d))
        proc.stderr.on('data', d => errChunks.push(d))
        proc.on('close', code => {
          if (code !== 0) return reject(new Error(Buffer.concat(errChunks).toString().slice(0, 300)))
          resolve(Buffer.concat(chunks).toString().trim())
        })
        proc.on('error', reject)
        proc.stdin.write(payload); proc.stdin.end()
      })
      console.log('[RemoveBG:rembg+matting] ok —', result.length, 'chars')
      return res.json({ imageBase64: `data:image/png;base64,${result}` })
    } catch (e) {
      console.warn('[RemoveBG:rembg+matting] error:', e.message.slice(0, 150), '— falling back')
    }
  }

  // ── Fallback: BFS flood-fill from borders + feathered edges (Vercel-safe) ──
  try {
    const sharp = (await import('sharp')).default
    const imgBytes = Buffer.from(b64, 'base64')

    const { data: raw, info } = await sharp(imgBytes)
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .removeAlpha().raw().toBuffer({ resolveWithObject: true })

    const W = info.width, H = info.height, C = info.channels
    const N = W * H

    // ── Step 1: BFS flood-fill from all border pixels ────────────────────────
    // Adaptive tolerance per-pixel based on local color variance on border
    const isBg  = new Uint8Array(N)      // 1 = confirmed background
    const visited = new Uint8Array(N)
    const queue = new Int32Array(N * 2)
    let qHead = 0, qTail = 0

    // Seed: all border pixels
    const seed = (idx) => { if (!visited[idx]) { visited[idx]=1; queue[qTail++]=idx } }
    for (let x = 0; x < W; x++) { seed(x); seed((H-1)*W+x) }
    for (let y = 1; y < H-1; y++) { seed(y*W); seed(y*W+W-1) }

    // Compute average background color from border seeds
    let bR=0,bG=0,bB=0,cnt=qTail
    for (let i=0;i<cnt;i++){const p=queue[i]*C;bR+=raw[p];bG+=raw[p+1];bB+=raw[p+2]}
    bR/=cnt; bG/=cnt; bB/=cnt

    const THARD = 50, TSOFT = 95

    // BFS: expand to neighbors if color is close to background
    while (qHead < qTail) {
      const idx = queue[qHead++]
      const pi = idx * C
      const r=raw[pi],g=raw[pi+1],b=raw[pi+2]
      const dist = Math.sqrt((r-bR)**2+(g-bG)**2+(b-bB)**2)
      if (dist > TSOFT) continue   // too different → foreground
      isBg[idx] = dist < THARD ? 2 : 1  // 2=hard bg, 1=soft bg

      const x=idx%W, y=(idx/W)|0
      if(x>0   && !visited[idx-1]){visited[idx-1]=1;queue[qTail++]=idx-1}
      if(x<W-1 && !visited[idx+1]){visited[idx+1]=1;queue[qTail++]=idx+1}
      if(y>0   && !visited[idx-W]){visited[idx-W]=1;queue[qTail++]=idx-W}
      if(y<H-1 && !visited[idx+W]){visited[idx+W]=1;queue[qTail++]=idx+W}
    }

    // ── Step 2: Build raw alpha mask ─────────────────────────────────────────
    const alphaBuf = Buffer.alloc(N)
    for (let i=0;i<N;i++) {
      alphaBuf[i] = isBg[i]===2 ? 0 : isBg[i]===1 ? 80 : 255
    }

    // ── Step 3: Smooth the alpha mask with two blur passes + threshold ────────
    const alphaImg = sharp(alphaBuf, { raw:{width:W,height:H,channels:1} })
    const blurred1 = await alphaImg.clone().blur(2.5).raw().toBuffer()
    // Second pass: sharpen result to clean up mid-values
    const blurred2 = Buffer.alloc(N)
    for (let i=0;i<N;i++){
      const v = blurred1[i]
      blurred2[i] = v < 30 ? 0 : v > 200 ? 255 : Math.round((v-30)/(170)*255)
    }
    // Final light blur for feathering
    const finalAlpha = await sharp(blurred2, {raw:{width:W,height:H,channels:1}})
      .blur(1.5).raw().toBuffer()

    // ── Step 4: Compose RGBA output ──────────────────────────────────────────
    const rgba = Buffer.alloc(N*4)
    for (let i=0;i<N;i++){
      const si=i*C, di=i*4
      rgba[di]=raw[si]; rgba[di+1]=raw[si+1]; rgba[di+2]=raw[si+2]; rgba[di+3]=finalAlpha[i]
    }

    const outBuf = await sharp(rgba,{raw:{width:W,height:H,channels:4}}).png().toBuffer()
    console.log('[RemoveBG:flood-fill] ok —', outBuf.length, 'bytes')
    return res.json({ imageBase64: `data:image/png;base64,${outBuf.toString('base64')}` })
  } catch (e) {
    console.warn('[RemoveBG:flood-fill] error:', e.message.slice(0, 150))
  }

  return res.status(500).json({ error: 'فشل إزالة الخلفية — حاول مرة أخرى بعد لحظات' })
})

// POST /api/tools/img-upscale — AI upscaling via HF Swin2SR, fallback to sharp Lanczos
app.post('/api/tools/img-upscale', express.json({ limit: '25mb' }), async (req, res) => {
  const { imageBase64, scale: scaleStr = '4' } = req.body
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 مطلوب' })
  const b64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  const inputBuf = Buffer.from(b64, 'base64')

  // ── Primary: HF Swin2SR Real-World Super-Resolution (AI quality) ────────────
  const hfToken = process.env.HF_TOKEN
  if (hfToken) {
    try {
      const hfRes = await fetch(
        'https://api-inference.huggingface.co/models/caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hfToken}`, 'Content-Type': 'application/octet-stream' },
          body: inputBuf,
          signal: AbortSignal.timeout(90000),
        }
      )
      if (hfRes.ok) {
        const outBuf = Buffer.from(await hfRes.arrayBuffer())
        console.log('[Upscale:Swin2SR] ok —', outBuf.length, 'bytes')
        return res.json({ imageBase64: `data:image/png;base64,${outBuf.toString('base64')}`, model: 'Swin2SR AI' })
      }
      const errTxt = await hfRes.text()
      console.warn('[Upscale:Swin2SR] non-ok:', hfRes.status, errTxt.slice(0, 120), '— falling back')
    } catch (e) {
      console.warn('[Upscale:Swin2SR] error:', e.message, '— falling back')
    }
  }

  // ── Fallback: sharp Lanczos3 ────────────────────────────────────────────────
  try {
    const sharp = (await import('sharp')).default
    const meta = await sharp(inputBuf).metadata()
    const scaleN = Math.min(Math.max(parseInt(scaleStr) || 4, 2), 4)
    const MAX = 4096
    const clampedW = Math.min((meta.width  || 512) * scaleN, MAX)
    const clampedH = Math.min((meta.height || 512) * scaleN, MAX)
    const resultBuf = await sharp(inputBuf)
      .resize(clampedW, clampedH, { kernel: 'lanczos3', fit: 'fill' })
      .png().toBuffer()
    console.log(`[Upscale:Lanczos] ${meta.width}x${meta.height} → ${clampedW}x${clampedH}`)
    return res.json({ imageBase64: `data:image/png;base64,${resultBuf.toString('base64')}`, model: 'Lanczos3' })
  } catch (e) {
    console.error('[Upscale]', e.message)
    return res.status(500).json({ error: 'فشل تحسين الصورة' })
  }
})

// POST /api/tools/img-inpaint — Object removal: Python skimage (local) → HF SD2 (Vercel fallback)
app.post('/api/tools/img-inpaint', express.json({ limit: '30mb' }), async (req, res) => {
  const { imageBase64, maskBase64 } = req.body
  if (!imageBase64 || !maskBase64) return res.status(400).json({ error: 'imageBase64 و maskBase64 مطلوبان' })
  const imgB64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  const mskB64 = maskBase64.includes(',') ? maskBase64.split(',')[1] : maskBase64

  // ── Primary: Python skimage biharmonic inpainting (Replit / self-hosted) ────
  if (!process.env.VERCEL) {
    const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'scripts', 'inpaint.py')
    const pythonLibs = path.join(path.dirname(fileURLToPath(import.meta.url)), '.pythonlibs', 'lib', 'python3.11', 'site-packages')
    const payload = JSON.stringify({ image: imgB64, mask: mskB64 })
    try {
      const result = await new Promise((resolve, reject) => {
        const proc = spawn('python3', [scriptPath], {
          env: { ...process.env, PYTHONPATH: pythonLibs },
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        const chunks = [], errChunks = []
        proc.stdout.on('data', d => chunks.push(d))
        proc.stderr.on('data', d => errChunks.push(d))
        proc.on('close', code => {
          if (code !== 0) return reject(new Error(Buffer.concat(errChunks).toString().slice(0, 200)))
          resolve(Buffer.concat(chunks).toString().trim())
        })
        proc.on('error', reject)
        proc.stdin.write(payload); proc.stdin.end()
      })
      console.log('[Inpaint:skimage] ok —', result.length, 'chars')
      return res.json({ imageBase64: `data:image/png;base64,${result}` })
    } catch (e) {
      console.warn('[Inpaint:skimage] error:', e.message, '— falling back to HF')
    }
  }

  // ── Fallback: sharp blur-fill inpaint (pure Node.js — works on Vercel) ───────
  try {
    const sharp = (await import('sharp')).default
    const imgBuf  = Buffer.from(imgB64, 'base64')
    const mskBuf  = Buffer.from(mskB64, 'base64')
    const meta    = await sharp(imgBuf).metadata()
    const W = meta.width, H = meta.height

    // 1. Resize mask to match image exactly
    const maskResized = await sharp(mskBuf)
      .resize(W, H, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer()

    // 2. Create a blurred version of the original image (fills masked area smoothly)
    const blurred = await sharp(imgBuf)
      .blur(Math.max(W, H) / 15)   // strong blur proportional to image size
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true })

    // 3. Get original pixels
    const orig = await sharp(imgBuf)
      .removeAlpha()
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true })

    const channels = orig.info.channels   // 3 (RGB)
    const pixels   = orig.data.length / channels

    // 4. Composite: where mask is white → use blurred; elsewhere → original
    const result = Buffer.alloc(pixels * channels)
    for (let i = 0; i < pixels; i++) {
      const alpha = maskResized[i] / 255   // 0 = keep original, 1 = fill
      for (let c = 0; c < channels; c++) {
        const idx = i * channels + c
        result[idx] = Math.round(orig.data[idx] * (1 - alpha) + blurred.data[idx] * alpha)
      }
    }

    const outBuf = await sharp(result, { raw: { width: W, height: H, channels } }).png().toBuffer()
    console.log('[Inpaint:sharp-fill] ok —', outBuf.length, 'bytes')
    return res.json({ imageBase64: `data:image/png;base64,${outBuf.toString('base64')}` })
  } catch (e) {
    console.error('[Inpaint:sharp-fill]', e.message)
    return res.status(500).json({ error: 'فشل حذف العنصر: ' + e.message.slice(0, 80) })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION STUDIO — Text-to-Image · Image-to-Image · Video Generation
// Providers: SD WebUI (SD_WEBUI_URL) → ComfyUI (COMFYUI_URL) → HuggingFace
// ═══════════════════════════════════════════════════════════════════════════════

// ── Shared helper: fetch image from Pollinations and return base64 ──────────
// Retries once after 4s delay to handle Vercel IP rate-limiting by Pollinations
async function pollinationsImage(prompt, { width = 768, height = 768, model = 'flux', timeoutMs = 45000 } = {}) {
  const ATTEMPTS = 2
  let lastErr = null
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 4000 + Math.random() * 2000))
    try {
      const seed = Math.floor(Math.random() * 9000000) + attempt * 31337
      const encoded = encodeURIComponent(prompt)
      const url = `https://image.pollinations.ai/prompt/${encoded}?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false`
      const r = await fetch(url, {
        headers: { 'Referer': 'https://dz-gpt.vercel.app', 'User-Agent': 'DZ-GPT/2.0' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!r.ok) { lastErr = new Error(`Pollinations ${r.status}`); continue }
      const ct = r.headers.get('content-type') || 'image/jpeg'
      if (!ct.startsWith('image/')) { lastErr = new Error(`Non-image response: ${ct}`); continue }
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 1000) { lastErr = new Error('Image too small'); continue }
      return { imageBase64: `data:${ct};base64,${buf.toString('base64')}`, mime: ct }
    } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('Pollinations failed after retries')
}

// ── Shared helper: HuggingFace FLUX.1-schnell ─────────────────────────────
async function huggingFaceFlux(prompt, negativePrompt, { timeoutMs = 40000 } = {}) {
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  if (!token) return null
  const r = await fetch('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'image/*' },
    body: JSON.stringify({ inputs: prompt, parameters: negativePrompt ? { negative_prompt: negativePrompt } : {} }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) return null
  const ct = r.headers.get('content-type') || ''
  if (!ct.startsWith('image/')) return null
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length < 1000) return null
  return { imageBase64: `data:${ct};base64,${buf.toString('base64')}`, mime: ct }
}

// POST /api/tools/img-gen — Text-to-Image (instant URL-based, no proxy delay)
// Strategy: return direct Pollinations URL (browser loads image directly = instant response)
// Falls back to HuggingFace base64 if HF_TOKEN is set and Pollinations fails
app.post('/api/tools/img-gen', express.json({ limit: '5mb' }), async (req, res) => {
  const { prompt, negativePrompt, width = 768, height = 768, model: reqModel } = req.body
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt مطلوب' })

  const w = Math.min(Number(width) || 768, 1024)
  const h = Math.min(Number(height) || 768, 1024)
  const seed = Math.floor(Math.random() * 99999999)

  // ── Priority 1: HuggingFace FLUX.1-schnell (high quality, needs HF_TOKEN) ──
  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''
  if (token) {
    try {
      const hf = await huggingFaceFlux(prompt, negativePrompt, { timeoutMs: 35000 })
      if (hf) {
        console.log('[img-gen] ✓ HuggingFace FLUX.1-schnell')
        return res.json({ imageBase64: hf.imageBase64, model: 'FLUX.1-schnell', provider: 'huggingface' })
      }
    } catch (e) { console.warn('[img-gen:hf]', e.message) }
  }

  // ── Priority 2: Pollinations direct URL (INSTANT — no proxy, browser loads directly) ──
  // Supports models: flux | flux-realism | flux-anime | flux-3d | flux-pro | turbo | dreamshaper
  const MODELS = ['flux', 'flux-realism', 'flux-3d', 'turbo']
  const chosenModel = reqModel && MODELS.includes(reqModel) ? reqModel : 'flux'
  const encoded = encodeURIComponent(prompt.trim())
  const negEnc  = negativePrompt ? `&negative=${encodeURIComponent(negativePrompt)}` : ''
  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?model=${chosenModel}&width=${w}&height=${h}&seed=${seed}&nologo=true&safe=false${negEnc}`

  console.log('[img-gen] ✓ Pollinations direct URL', chosenModel)
  return res.json({
    imageUrl,
    model: `FLUX via Pollinations (${chosenModel})`,
    provider: 'pollinations',
    seed,
    allModels: MODELS,
  })
})

// ── Stable Horde: poll until job is done (server-side, max 72s — within Vercel 90s maxDuration) ──
async function waitForHordeJob(jobId, maxWaitMs = 72000) {
  const BASE = 'https://stablehorde.net/api/v2'
  const H = { 'Client-Agent': 'DZ-GPT:1.0:dz-gpt.vercel.app', 'apikey': process.env.STABLE_HORDE_KEY || '0000000000' }
  const start = Date.now(); let polls = 0
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, polls < 4 ? 5000 : 8000)); polls++
    try {
      const chk = await fetch(`${BASE}/generate/check/${jobId}`, { headers: H, signal: AbortSignal.timeout(8000) })
      if (!chk.ok) continue
      const cd = await chk.json()
      console.log(`[horde:p${polls}] done=${cd.done} wait=${cd.wait_time}s q=${cd.queue_position}`)
      if (cd.faulted || cd.is_possible === false) break
      if (cd.done) {
        const st = await fetch(`${BASE}/generate/status/${jobId}`, { headers: H, signal: AbortSignal.timeout(15000) })
        if (!st.ok) break
        const sd = await st.json()
        const img = sd.generations?.[0]?.img
        if (img) return img
        break
      }
    } catch (e) { console.warn('[horde:poll]', e.message) }
  }
  return null
}

// ── Stable Horde: submit img2img job and return jobId ─────────────────────────
async function hordeSubmitImg2Img(imgB64, prompt, negPrompt, strength) {
  const BASE = 'https://stablehorde.net/api/v2'
  const H = { 'Content-Type': 'application/json', 'Client-Agent': 'DZ-GPT:1.0:dz-gpt.vercel.app', 'apikey': process.env.STABLE_HORDE_KEY || '0000000000' }
  const r = await fetch(`${BASE}/generate/async`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      prompt: `${prompt.trim()} ### ${negPrompt || 'ugly, blurry, low quality, distorted, deformed'}`,
      params: { n: 1, steps: 25, width: 512, height: 512, sampler_name: 'k_euler_a', denoising_strength: Math.max(0.3, Math.min(1, Number(strength) || 0.75)), cfg_scale: 7.5 },
      source_image: imgB64,
      source_processing: 'img2img',
      models: ['stable_diffusion'],
      shared: true, r2: false,
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!r.ok) { console.warn('[horde:submit]', r.status); return null }
  const d = await r.json(); return d.id || null
}

// POST /api/tools/img2img — True Image-to-Image via Stable Horde (open-source, free, community GPU)
// Architecture: server submits → polls Stable Horde (72s max, within Vercel 90s maxDuration)
// Fallback: Pollinations direct URL (prompt-based, instant)
app.post('/api/tools/img2img', express.json({ limit: '30mb' }), async (req, res) => {
  const { imageBase64, prompt, negativePrompt, strength = 0.75 } = req.body
  if (!imageBase64 || !prompt?.trim()) return res.status(400).json({ error: 'imageBase64 و prompt مطلوبان' })

  const imgB64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64

  // ── Priority 1: Stable Horde — real SD img2img (free, open-source, no API key) ──
  try {
    console.log('[img2img] submitting to Stable Horde...')
    const jobId = await hordeSubmitImg2Img(imgB64, prompt, negativePrompt, strength)
    if (jobId) {
      console.log('[img2img] Stable Horde job:', jobId)
      const img = await waitForHordeJob(jobId, 72000)
      if (img) {
        const src = img.startsWith('http') ? img : `data:image/webp;base64,${img}`
        console.log('[img2img] ✓ Stable Horde done')
        return res.json({ imageBase64: src, model: 'Stable Diffusion img2img', provider: 'stable-horde' })
      }
      console.warn('[img2img] Stable Horde timed out or faulted — using fallback')
    }
  } catch (e) { console.warn('[img2img:horde]', e.message) }

  // ── Fallback: Pollinations direct URL (prompt-based, instant response) ──
  const seed = Math.floor(Math.random() * 99999999)
  const encoded = encodeURIComponent(`${prompt.trim()}, ultra detailed, photorealistic, high quality, sharp focus`)
  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?model=flux-realism&width=768&height=768&seed=${seed}&nologo=true&safe=false`
  console.log('[img2img] fallback: Pollinations URL')
  return res.json({
    imageUrl,
    model: 'FLUX-Realism (Pollinations — نص إلى صورة)',
    provider: 'pollinations',
    note: 'Stable Horde غير متاح — تم توليد صورة من النص بدلاً من تعديل الصورة الأصلية',
  })
})

// POST /api/tools/video-gen — Video Generation: cinematic frame sequence (INSTANT URL-based)
// Strategy: return 4 direct Pollinations URLs with different cinematic styles for smooth Ken Burns
// animation. Response is INSTANT (no downloading). Browser loads frames directly.
// If HF_TOKEN set, also tries real video generation via AnimateDiff / ZeroScope.
app.post('/api/tools/video-gen', express.json({ limit: '30mb' }), async (req, res) => {
  const { prompt } = req.body
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt مطلوب' })

  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || ''

  // ── Priority 1: Real video via ZeroScope (HuggingFace, if HF_TOKEN) ──
  if (token) {
    try {
      const r = await fetch('https://router.huggingface.co/hf-inference/models/cerspense/zeroscope_v2_576w', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'video/mp4,image/gif,image/*,*/*' },
        body: JSON.stringify({ inputs: prompt }),
        signal: AbortSignal.timeout(38000),
      })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && (ct.startsWith('video/') || ct.includes('mp4'))) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 5000) {
          console.log('[video-gen] ✓ ZeroScope real video')
          return res.json({ videoBase64: `data:video/mp4;base64,${buf.toString('base64')}`, model: 'ZeroScope v2', provider: 'hf-zeroscope', isVideo: true })
        }
      }
    } catch (e) { console.warn('[video-gen:zeroscope]', e.message) }

    // AnimateDiff fallback (returns GIF)
    try {
      const r = await fetch('https://router.huggingface.co/hf-inference/models/damo-vilab/text-to-video-ms-1.7b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ inputs: prompt }),
        signal: AbortSignal.timeout(38000),
      })
      const ct = r.headers.get('content-type') || ''
      if (r.ok && (ct.startsWith('video/') || ct.startsWith('image/'))) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 5000) {
          const mime = ct.startsWith('video/') ? 'video/mp4' : 'image/gif'
          console.log('[video-gen] ✓ ModelScope text-to-video')
          return res.json({ videoBase64: `data:${mime};base64,${buf.toString('base64')}`, model: 'ModelScope T2V', provider: 'hf-modelscope', isVideo: true })
        }
      }
    } catch (e) { console.warn('[video-gen:modelscope]', e.message) }
  }

  // ── Priority 2: 4 cinematic Pollinations frames (INSTANT direct URLs) ──
  // Each frame has different cinematic style → Ken Burns animation creates fluid motion feel
  const baseSeed = Math.floor(Math.random() * 9000000)
  const frameStyles = [
    { suffix: 'wide establishing shot, cinematic, 8k, golden hour, dramatic sky', model: 'flux' },
    { suffix: 'medium shot, soft bokeh, cinematic lighting, shallow depth of field', model: 'flux-realism' },
    { suffix: 'close-up detail, macro photography, cinematic, ultra sharp, moody', model: 'flux' },
    { suffix: 'aerial wide angle, cinematic pan, dramatic clouds, vibrant colors', model: 'turbo' },
  ]

  const frames = frameStyles.map((f, i) => {
    const enc = encodeURIComponent(`${prompt}, ${f.suffix}`)
    const seed = baseSeed + i * 31337
    return `https://image.pollinations.ai/prompt/${enc}?model=${f.model}&width=768&height=432&seed=${seed}&nologo=true&safe=false`
  })

  console.log('[video-gen] ✓ 4 cinematic Pollinations frame URLs (instant)')
  return res.json({
    frames,
    model: 'AI DZ Media — Cinematic',
    provider: 'pollinations',
    frameCount: frames.length,
    kenBurns: true,
    note: 'أضف HF_TOKEN للحصول على فيديو حقيقي (ZeroScope)',
  })
})

// ── TTS — Kokoro (HF Inference API) + Google TTS fallback ────────────────────
// NOTE: must be BEFORE export { app } so it works on Vercel serverless

// Arabic → Google TTS  |  English/French → Kokoro (hexgrad/Kokoro-82M via HF)
const _TTS_VOICE_LANG = {
  'ar-DZ-AminaNeural':   'ar', 'ar-DZ-IsmaelNeural':  'ar',
  'ar-SA-ZariyahNeural': 'ar', 'ar-SA-HamedNeural':   'ar',
  'ar-EG-ShakirNeural':  'ar', 'fr-FR-DeniseNeural':  'fr',
  'fr-FR-HenriNeural':   'fr', 'fr-DZ-AmineNeural':   'fr',
  'en-US-JennyNeural':   'en', 'en-US-GuyNeural':     'en',
  'en-GB-SoniaNeural':   'en', 'en-GB-RyanNeural':    'en',
}

// Kokoro voice map — Arabic is NOT supported by Kokoro (use Google TTS for ar)
// voices: https://huggingface.co/hexgrad/Kokoro-82M
const _KOKORO_VOICE_MAP = {
  'en-US-JennyNeural':  'af_heart',   // American Female
  'en-US-GuyNeural':    'am_adam',    // American Male
  'en-GB-SoniaNeural':  'bf_emma',    // British Female
  'en-GB-RyanNeural':   'bm_george',  // British Male
  'fr-FR-DeniseNeural': 'ff_siwis',   // French Female
  'fr-FR-HenriNeural':  'fm_gaston',  // French Male
}

// Split long text into ≤190-char chunks at word boundaries
function _ttsSplitText(text, max = 190) {
  const parts = []
  let rem = text.trim()
  while (rem.length > 0) {
    if (rem.length <= max) { parts.push(rem); break }
    let cut = rem.lastIndexOf(' ', max)
    if (cut <= 0) cut = max
    parts.push(rem.slice(0, cut))
    rem = rem.slice(cut).trim()
  }
  return parts
}

// Google Translate TTS — Arabic + fallback
async function _googleTTSFetch(text, lang) {
  const parts = _ttsSplitText(text)
  const bufs = []
  for (const part of parts) {
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8'
      + `&q=${encodeURIComponent(part)}&tl=${lang}&client=tw-ob&ttsspeed=1`
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`Google TTS HTTP ${resp.status}`)
    bufs.push(Buffer.from(await resp.arrayBuffer()))
  }
  return Buffer.concat(bufs)
}

// Kokoro TTS via HuggingFace Inference API
async function _kokoroTTSFetch(text, kokoroVoice, speed = 1.0) {
  const token = process.env.HF_TOKEN
  if (!token) throw new Error('HF_TOKEN not configured')
  const resp = await fetch('https://api-inference.huggingface.co/models/hexgrad/Kokoro-82M', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'audio/wav,audio/*,*/*',
    },
    body: JSON.stringify({ inputs: text, parameters: { voice: kokoroVoice, speed } }),
    signal: AbortSignal.timeout(28000),
  })
  if (!resp.ok) {
    const msg = await resp.text().catch(() => '')
    throw new Error(`Kokoro HTTP ${resp.status}: ${msg.slice(0, 200)}`)
  }
  return Buffer.from(await resp.arrayBuffer())
}

app.post('/api/tts', async (req, res) => {
  const { text, voice = 'ar-DZ-AminaNeural', speed = 1.0 } = req.body || {}
  if (!text || typeof text !== 'string' || text.trim().length === 0)
    return res.status(400).json({ error: 'text is required' })
  if (text.length > 3000)
    return res.status(400).json({ error: 'text too long (max 3000 chars)' })

  const lang = _TTS_VOICE_LANG[voice] || 'ar'
  const kokoroVoice = _KOKORO_VOICE_MAP[voice]

  try {
    let buf
    if (kokoroVoice) {
      // Try Kokoro first (English/French) → fallback to Google TTS
      try {
        console.log(`[TTS] Kokoro: voice=${kokoroVoice}`)
        buf = await _kokoroTTSFetch(text.trim(), kokoroVoice, Number(speed) || 1.0)
      } catch (kokoroErr) {
        console.warn(`[TTS] Kokoro failed (${kokoroErr.message}), falling back to Google TTS`)
        buf = await _googleTTSFetch(text.trim(), lang)
      }
    } else {
      // Arabic → Google TTS (Kokoro doesn't support Arabic)
      buf = await _googleTTSFetch(text.trim(), lang)
    }

    if (!buf || buf.length === 0) return res.status(500).json({ error: 'No audio data received' })
    res.set('Content-Type', 'audio/mpeg')
    res.set('Content-Disposition', 'attachment; filename="ai-dz-voice.mp3"')
    res.send(buf)
  } catch (e) {
    console.error('[TTS] error:', e.message)
    res.status(500).json({ error: 'TTS generation failed', detail: e.message })
  }
})

app.get('/api/tts/voices', (_req, res) => {
  res.json([
    { id: 'ar-DZ-AminaNeural',   label: '🇩🇿 عربية جزائرية',        lang: 'ar', engine: 'google' },
    { id: 'ar-SA-ZariyahNeural', label: '🇸🇦 عربية فصحى',           lang: 'ar', engine: 'google' },
    { id: 'fr-FR-DeniseNeural',  label: '🇫🇷 فرنسية أنثى',          lang: 'fr', engine: 'kokoro', kokoro: 'ff_siwis' },
    { id: 'fr-FR-HenriNeural',   label: '🇫🇷 فرنسية ذكر',           lang: 'fr', engine: 'kokoro', kokoro: 'fm_gaston' },
    { id: 'en-US-JennyNeural',   label: '🇺🇸 إنجليزية أمريكية أنثى', lang: 'en', engine: 'kokoro', kokoro: 'af_heart' },
    { id: 'en-US-GuyNeural',     label: '🇺🇸 إنجليزية أمريكية ذكر', lang: 'en', engine: 'kokoro', kokoro: 'am_adam' },
    { id: 'en-GB-SoniaNeural',   label: '🇬🇧 إنجليزية بريطانية أنثى', lang: 'en', engine: 'kokoro', kokoro: 'bf_emma' },
    { id: 'en-GB-RyanNeural',    label: '🇬🇧 إنجليزية بريطانية ذكر', lang: 'en', engine: 'kokoro', kokoro: 'bm_george' },
  ])
})

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/tools/screenshot  — Full-page website screenshot via microlink.io
// GET  /api/tools/screenshot/status — Health check
// ═══════════════════════════════════════════════════════════════════════════
const SCREENSHOT_TIMEOUT = 30_000 // 30 s

function isValidScreenshotUrl(raw) {
  try {
    const u = new URL(raw)
    if (!['http:', 'https:'].includes(u.protocol)) return false
    const h = u.hostname.toLowerCase()
    // Block internal/private hosts
    const bad = ['localhost', '127.', '0.0.0.0', '::1', '10.', '192.168.', '172.16.', '169.254.']
    if (bad.some(b => h === b || h.startsWith(b))) return false
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) {
      // Allow only real public IPs — block RFC-1918
      const parts = h.split('.').map(Number)
      if (parts[0] === 10) return false
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false
      if (parts[0] === 192 && parts[1] === 168) return false
      if (parts[0] === 127) return false
    }
    return true
  } catch {
    return false
  }
}

// ── Screenshot helpers ────────────────────────────────────────────────────────

/** Try microlink.io — returns { url, width, height } */
async function tryMicrolink(targetUrl, opts = {}) {
  const { fullPage = true, viewport = 'desktop', darkMode = false } = opts
  const vpWidth  = viewport === 'mobile' ? 390 : 1280
  const vpHeight = viewport === 'mobile' ? 844 : 800
  const params = new URLSearchParams({
    url: targetUrl,
    screenshot: 'true',
    meta: 'false',
    'screenshot.fullPage': fullPage ? 'true' : 'false',
    'screenshot.viewport.width':  String(vpWidth),
    'screenshot.viewport.height': String(vpHeight),
    'screenshot.viewport.deviceScaleFactor': viewport === 'mobile' ? '2' : '1',
    'screenshot.viewport.isMobile':          viewport === 'mobile' ? 'true' : 'false',
    'screenshot.colorScheme':                darkMode ? 'dark' : 'light',
    waitUntil: 'load',
  })
  const r = await fetch(`https://api.microlink.io/?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 DZ-GPT/3.0' },
    signal: AbortSignal.timeout(22_000),
  })
  const j = await r.json()
  if (j.status !== 'success' || !j.data?.screenshot?.url) throw new Error(j.message || 'microlink: no screenshot')
  return { url: j.data.screenshot.url, width: vpWidth, height: vpHeight, engine: 'microlink' }
}

/** WordPress mshots — completely free, no API key */
async function tryWordPressMshots(targetUrl, viewport = 'desktop') {
  const w = viewport === 'mobile' ? 400 : 1280
  const h = viewport === 'mobile' ? 800 : 960
  const imgUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(targetUrl)}?w=${w}&h=${h}`
  return { url: imgUrl, width: w, height: h, engine: 'mshots' }
}

/** thum.io — free without API key (raw URL, NOT encoded) */
async function tryThumio(targetUrl, viewport = 'desktop') {
  const w = viewport === 'mobile' ? 400 : 1280
  // thum.io accepts raw URL directly after the path — no encodeURIComponent
  const imgUrl = `https://image.thum.io/get/width/${w}/crop/900/${targetUrl}`
  return { url: imgUrl, width: w, height: 900, engine: 'thum.io' }
}

/** Fetch image and convert to base64 data URI */
async function imgToDataUri(imgUrl, timeoutMs = 25_000) {
  const r = await fetch(imgUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} from screenshot service`)
  const ct = r.headers.get('content-type') || 'image/png'
  if (!ct.startsWith('image/')) throw new Error(`Non-image response: ${ct}`)
  const buf = await r.arrayBuffer()
  if (buf.byteLength < 1000) throw new Error('Image too small — service returned placeholder')
  return `data:${ct};base64,${Buffer.from(buf).toString('base64')}`
}

app.get('/api/tools/screenshot/status', (_req, res) => {
  res.json({ ok: true, engines: ['microlink', 'mshots', 'thum.io'], ts: Date.now() })
})

app.post('/api/tools/screenshot', async (req, res) => {
  const { url, fullPage = true, viewport = 'desktop', darkMode = false } = req.body || {}

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL مطلوب' })
  }

  const cleaned = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`

  if (!isValidScreenshotUrl(cleaned)) {
    return res.status(400).json({ error: 'الرابط غير صالح أو محظور لأسباب أمنية' })
  }

  // ── Extract page title (best-effort, non-blocking) ───────────────────────
  let pageTitle = ''
  try {
    const htmlRes = await fetch(cleaned, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DZ-GPT/3.0)' },
      signal: AbortSignal.timeout(6_000),
    })
    if (htmlRes.ok) {
      const html = await htmlRes.text()
      const m = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)
      if (m) pageTitle = m[1].trim()
    }
  } catch { /* ignore */ }

  // ── Try screenshot engines in order ─────────────────────────────────────
  const engines = [
    () => tryMicrolink(cleaned, { fullPage, viewport, darkMode }),
    () => tryWordPressMshots(cleaned, viewport),
    () => tryThumio(cleaned, viewport),
  ]

  let lastErr = 'كل خدمات التصوير فشلت'
  for (const getInfo of engines) {
    try {
      const info = await getInfo()
      console.log(`[screenshot] trying engine: ${info.engine} for ${cleaned}`)
      const dataUri = await imgToDataUri(info.url)
      return res.json({
        ok: true,
        url: cleaned,
        title: pageTitle,
        screenshot: dataUri,
        width: info.width,
        height: info.height,
        viewport,
        darkMode,
        engine: info.engine,
      })
    } catch (e) {
      console.warn(`[screenshot] engine failed: ${e.message}`)
      lastErr = e.message
    }
  }

  return res.status(500).json({
    error: lastErr?.includes('timeout') || lastErr?.includes('abort')
      ? 'انتهت المهلة — الموقع بطيء أو محجوب'
      : `فشل التصوير: ${lastErr}`,
  })
})

// ===== EXPORT APP (for Vercel serverless) =====
export { app }

// ===== SERVE FRONTEND + START SERVER (only when run directly) =====
const isMain = process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  // ── Resilience: scheduleOnce prevents overlapping background jobs ─────────
  scheduleOnce(
    () => updateEddirasaIndex()
      .then(index => console.log(`[Eddirasa] index update: ${index.lessons.length} lessons`))
      .catch(err => console.warn('[Eddirasa] index update failed:', err.message)),
    24 * 60 * 60 * 1000,
    { label: 'eddirasa-index' }
  )

  // Task 6 — Resource Injection Layer: weekly cron (no-overlap)
  fetchAndCacheResources()
    .then(r => console.log(`[Resources] Initial injection: ${Object.keys(r).length} categories`))
    .catch(err => console.warn('[Resources] Initial injection failed:', err.message))
  scheduleOnce(
    () => {
      RESOURCE_CACHE.ts = 0
      return fetchAndCacheResources()
        .then(r => console.log(`[Resources] Weekly refresh: ${Object.keys(r).length} categories`))
        .catch(err => console.warn('[Resources] Weekly refresh failed:', err.message))
    },
    7 * 24 * 60 * 60 * 1000,
    { label: 'resources-refresh' }
  )

  // ── Task 22: Smart Preloading — warm caches on startup ──────────
  setTimeout(() => {
    preloadEssentialData().catch(err => console.warn('[Preload] Startup preload error:', err.message))
  }, 2000)

  // ── Task 16: Auto-Refresh — silent background refresh using scheduleOnce ──
  // scheduleOnce ensures next run only starts AFTER previous completes — no pile-up
  const AUTO_REFRESH_INTERVAL = 7 * 60 * 1000 // 7 minutes

  scheduleOnce(async () => {
    console.log('[AutoRefresh] Refreshing weather caches...')
    const cities = ['Algiers', 'Oran', 'Constantine', 'Annaba', 'Setif']
    await Promise.allSettled(cities.map(city => {
      WEATHER_CACHE_V2.invalidate(city.toLowerCase())
      return fetchCityWeatherResilient(city)
        .then(d => console.log(`[AutoRefresh] Weather ${city}: ${d?.temp}°C`))
        .catch(err => console.warn(`[AutoRefresh] Weather ${city} failed:`, err.message))
    }))
  }, AUTO_REFRESH_INTERVAL, { label: 'weather-refresh' })

  scheduleOnce(async () => {
    console.log('[AutoRefresh] Refreshing currency...')
    await fetchCurrencyResilient(true)
      .then(d => console.log(`[AutoRefresh] Currency: ${d?.provider} (${Object.keys(d?.rates || {}).length} pairs)`))
      .catch(err => console.warn('[AutoRefresh] Currency failed:', err.message))
  }, AUTO_REFRESH_INTERVAL + 60000, { label: 'currency-refresh' })

  scheduleOnce(async () => {
    console.log('[AutoRefresh] Refreshing LFP matches...')
    SPORTS_CACHE_V2.invalidate('lfp')
    await fetchLFPData()
      .then(d => console.log(`[AutoRefresh] LFP: ${d?.matches?.length} matches`))
      .catch(err => console.warn('[AutoRefresh] LFP failed:', err.message))
  }, 10 * 60 * 1000, { label: 'lfp-refresh' })

  scheduleOnce(() => {
    console.log('[AutoRefresh] Refreshing standings...')
    STANDINGS_CACHE.ts = 0
  }, 25 * 60 * 1000, { label: 'standings-refresh' })

  // ── Periodic resilience housekeeping (every 10 min) ───────────────────────
  scheduleOnce(() => {
    aiDeduplicator.prune()
    fetchDeduplicator.prune()
    if (Math.random() < 0.3) { // log health snapshot 30% of the time
      const snap = systemHealthSnapshot()
      console.log(`[Health] mem:${snap.memory.heapUsedMB}MB | ai-sem:${snap.semaphores[0]?.running}/${snap.semaphores[0]?.max} | groq:${snap.circuits[0]?.state}`)
    }
  }, 10 * 60 * 1000, { label: 'resilience-housekeeping' })

  // (DZ Tools image routes are registered above export{app} — available on Vercel too)

  // TEMP deploy endpoint — used by agent to push files via server process.env
  app.post('/api/_agent_deploy', express.json(), async (req, res) => {
    const { files, commit_msg, repo, branch, vercel_project_id } = req.body;
    const GH = process.env.GITHUB_TOKEN;
    const VC = process.env.VERCEL_TOKEN;
    if (!GH) return res.status(500).json({ error: 'GITHUB_TOKEN missing' });
    const results = [];
    for (const filePath of files) {
      try {
        const { readFileSync } = await import('fs');
        const content = readFileSync(filePath, 'utf-8');
        const b64 = Buffer.from(content).toString('base64');
        const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
          headers: { Authorization: `token ${GH}`, Accept: 'application/vnd.github+json' }
        });
        let sha = null;
        if (getRes.ok) { const d = await getRes.json(); sha = d.sha; }
        const body = { message: commit_msg, content: b64, branch };
        if (sha) body.sha = sha;
        const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
          method: 'PUT',
          headers: { Authorization: `token ${GH}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
          body: JSON.stringify(body)
        });
        const r = await putRes.json();
        if (!putRes.ok) { results.push({ file: filePath, error: r.message }); continue; }
        results.push({ file: filePath, commit: r.commit?.sha?.slice(0, 12) });
      } catch (e) { results.push({ file: filePath, error: e.message }); }
    }
    let vercelUrl = null;
    if (VC && vercel_project_id) {
      try {
        const vRes = await fetch('https://api.vercel.com/v13/deployments', {
          method: 'POST',
          headers: { Authorization: `Bearer ${VC}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'dz-gpt', gitSource: { type: 'github', repoId: 1191199822, ref: branch } })
        });
        const vData = await vRes.json();
        vercelUrl = vData.url ? `https://${vData.url}` : JSON.stringify(vData).slice(0, 200);
      } catch (e) { vercelUrl = `error: ${e.message}`; }
    }
    res.json({ results, vercelUrl });
  });

  // ── Start rembg HTTP server locally (skip on Vercel) ───────────────────────
  if (!process.env.VERCEL) {
    const rembgScript = path.join(process.cwd(), 'scripts', 'rembg_server.py')
    const rembgPythonPath = path.join(process.cwd(), '.pythonlibs/lib/python3.11/site-packages')
    const startRembg = () => {
      const proc = spawn('python3', [rembgScript, '--port', String(REMBG_PORT)], {
        env: { ...process.env, PYTHONPATH: rembgPythonPath },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const markReady = (d) => {
        const msg = d.toString()
        console.log('[rembg]', msg.trim())
        if (/listening on port/i.test(msg)) rembgReady = true
      }
      proc.stdout.on('data', markReady)
      proc.stderr.on('data', markReady)
      proc.on('exit', (code) => {
        console.log(`[rembg] exited (${code}), restarting in 5s…`)
        rembgReady = false
        setTimeout(startRembg, 5000)
      })
      proc.on('error', (e) => console.warn('[rembg] spawn error:', e.message))
      // Fallback: assume ready after 20s
      setTimeout(() => { rembgReady = true }, 20000)
      console.log('[rembg] starting background removal server on port', REMBG_PORT)
    }
    startRembg()
  }

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
    startBreakingNewsPoller(broadcastBreakingNews)
  } else {
    // Dev: embed Vite as middleware so both API and frontend run on port 5000
    const { createServer: createViteServer } = await import('vite')
    const http = await import('http')
    const httpServer = http.createServer(app)
    const replitDomain = process.env.REPLIT_DEV_DOMAIN
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: false,
      },
      appType: 'spa',
    })
    app.use(vite.middlewares)
    setupChatWebSocket(httpServer)
    startBreakingNewsPoller(broadcastBreakingNews)
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Dev server running on http://0.0.0.0:${PORT}`)
    })
  }
}
