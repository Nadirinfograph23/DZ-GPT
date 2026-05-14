// lib/skills/dz-memory-skill.js
// DZ Skill Memory — ذاكرة المهارات (مشاريع، أخطاء، حلول، أوامر ناجحة)
// In-memory + دعم لملف JSON مستمر

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MEMORY_DIR  = join(__dirname, '../../data/skills-memory')
const MEMORY_FILE = join(MEMORY_DIR, 'skill-memory.json')
const MAX_ENTRIES = 200
const SIMILARITY_THRESHOLD = 0.4

// ── إنشاء مجلد الذاكرة ────────────────────────────────────────────────────
function ensureDir() {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true })
}

// ── تحميل الذاكرة من الملف ────────────────────────────────────────────────
function loadMemory() {
  try {
    ensureDir()
    if (!existsSync(MEMORY_FILE)) return {}
    return JSON.parse(readFileSync(MEMORY_FILE, 'utf8'))
  } catch { return {} }
}

// ── حفظ الذاكرة في الملف ──────────────────────────────────────────────────
function saveMemory(data) {
  try {
    ensureDir()
    writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf8')
  } catch { /* fail silently */ }
}

// ── حساب التشابه بين نصين (Jaccard) ─────────────────────────────────────
function jaccard(a, b) {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(t => t.length > 2))
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(t => t.length > 2))
  if (!ta.size || !tb.size) return 0
  const intersection = new Set([...ta].filter(x => tb.has(x)))
  const union = new Set([...ta, ...tb])
  return intersection.size / union.size
}

// ── نظام الذاكرة الرئيسي ─────────────────────────────────────────────────
class SkillMemory {
  constructor() {
    this._cache = loadMemory()
    this._projectCache = {} // in-memory only for repo analyses
  }

  // حفظ نتيجة عملية
  store({ key, action, success, summary, filesModified = [], ts = Date.now(), repo = null, errorType = null, fixApplied = null }) {
    const entry = { key, action, success, summary, filesModified, ts, repo, errorType, fixApplied }

    // فهرسة بالأمر الأصلي
    this._cache[key] = entry

    // فهرسة بنوع الإجراء
    if (!this._cache[`__action:${action}`]) this._cache[`__action:${action}`] = []
    const actionList = this._cache[`__action:${action}`]
    actionList.unshift(entry)
    if (actionList.length > 20) actionList.splice(20)

    // فهرسة بالخطأ والحل
    if (errorType && fixApplied) {
      this._cache[`__fix:${errorType}`] = { fix: fixApplied, count: (this._cache[`__fix:${errorType}`]?.count || 0) + 1 }
    }

    // تنظيف القديم
    const entries = Object.keys(this._cache).filter(k => !k.startsWith('__'))
    if (entries.length > MAX_ENTRIES) {
      const sorted = entries.sort((a, b) => (this._cache[a]?.ts || 0) - (this._cache[b]?.ts || 0))
      sorted.slice(0, entries.length - MAX_ENTRIES).forEach(k => delete this._cache[k])
    }

    saveMemory(this._cache)
  }

  // استرجاع أقرب نتيجة مشابهة
  recall(query) {
    if (!query) return null
    let bestMatch = null
    let bestScore = 0

    for (const [key, val] of Object.entries(this._cache)) {
      if (key.startsWith('__') || !val?.key) continue
      const score = jaccard(query, key)
      if (score > bestScore && score >= SIMILARITY_THRESHOLD) {
        bestScore = score
        bestMatch = { ...val, score }
      }
    }
    return bestMatch
  }

  // البحث عن أفضل حل لخطأ محدد
  recallFix(errorType) {
    return this._cache[`__fix:${errorType}`] || null
  }

  // آخر N عمليات ناجحة لإجراء محدد
  recentSuccesses(action, limit = 5) {
    const list = this._cache[`__action:${action}`] || []
    return list.filter(e => e.success).slice(0, limit)
  }

  // حفظ تحليل مشروع (in-memory فقط — كبير جداً للملف)
  cacheRepoAnalysis(owner, repo, analysis) {
    this._projectCache[`${owner}/${repo}`] = { ...analysis, cachedAt: Date.now() }
  }

  // استرجاع تحليل مشروع (10 دقائق TTL)
  getCachedAnalysis(owner, repo) {
    const cached = this._projectCache[`${owner}/${repo}`]
    if (!cached) return null
    if (Date.now() - cached.cachedAt > 10 * 60 * 1000) {
      delete this._projectCache[`${owner}/${repo}`]
      return null
    }
    return cached
  }

  // إحصاءات الذاكرة
  stats() {
    const entries = Object.keys(this._cache).filter(k => !k.startsWith('__'))
    const fixes   = Object.keys(this._cache).filter(k => k.startsWith('__fix:'))
    const success = entries.filter(k => this._cache[k]?.success).length
    return {
      total: entries.length,
      successRate: entries.length ? Math.round((success / entries.length) * 100) : 0,
      knownFixes: fixes.length,
      cachedRepos: Object.keys(this._projectCache).length,
    }
  }

  // مسح الذاكرة
  clear() {
    this._cache = {}
    this._projectCache = {}
    saveMemory({})
  }
}

// Singleton
export const skillMemory = new SkillMemory()
