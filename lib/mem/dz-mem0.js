// lib/mem/dz-mem0.js
// DZ-Agent-Memory-Layer — Mem0-inspired smart memory engine
// Architecture: TF-IDF semantic retrieval + project namespacing + anti-bloat
// لا يحتاج API key — يعمل بالكامل محلياً

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const DATA_DIR  = join(__dir, '../../data/mem')
const MAX_PER_PROJECT = 300
const MAX_GLOBAL      = 100
const GLOBAL_NS       = '__global__'
const TOP_K           = 6
const SIMILARITY_MIN  = 0.12
const BLOAT_THRESHOLD = 0.88  // merge if cosine > this
const MAX_CONTENT_LEN = 800   // truncate stored content

// ── Memory Types ────────────────────────────────────────────────────────────
export const MEM_TYPE = {
  USER:      'user',       // تفضيلات المستخدم
  PROJECT:   'project',    // بنية وإعدادات المشروع
  EXECUTION: 'execution',  // أوامر وعمليات منفذة
  ERROR:     'error',      // أخطاء وحلول
  GENERAL:   'general',    // معرفة عامة
}

// ── توكينز TF-IDF بسيط ──────────────────────────────────────────────────────
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(t => t.length > 2)
}

function tfidfVector(tokens, idf) {
  const tf = {}
  tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1 })
  const len = tokens.length || 1
  const vec = {}
  for (const [t, cnt] of Object.entries(tf)) {
    vec[t] = (cnt / len) * (idf[t] || 1)
  }
  return vec
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const av = a[k] || 0, bv = b[k] || 0
    dot += av * bv
    na  += av * av
    nb  += bv * bv
  }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ── مسار الملف per-namespace ─────────────────────────────────────────────────
function nsFile(ns) {
  const safe = (ns || GLOBAL_NS).replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 80)
  return join(DATA_DIR, `${safe}.json`)
}

// ── قراءة store ───────────────────────────────────────────────────────────────
function loadStore(ns) {
  const file = nsFile(ns)
  try {
    if (!existsSync(file)) return { ns, entries: [] }
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch { return { ns, entries: [] } }
}

// ── كتابة store (atomic) ──────────────────────────────────────────────────────
function saveStore(ns, store) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    const file = nsFile(ns)
    const tmp  = file + '.tmp'
    writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8')
    renameSync(tmp, file)
  } catch { /* fail silently on Vercel read-only fs */ }
}

// ── بناء IDF من كامل entries ─────────────────────────────────────────────────
function buildIdf(entries) {
  const df = {}
  const N  = entries.length || 1
  for (const e of entries) {
    const seen = new Set(tokenize(e.content + ' ' + e.query))
    for (const t of seen) df[t] = (df[t] || 0) + 1
  }
  const idf = {}
  for (const [t, cnt] of Object.entries(df)) {
    idf[t] = Math.log((N + 1) / (cnt + 1)) + 1  // smoothed IDF
  }
  return idf
}

// ══════════════════════════════════════════════════════════════════════════════
// CORE API
// ══════════════════════════════════════════════════════════════════════════════

// ── حفظ ذكرى جديدة ──────────────────────────────────────────────────────────
export function storeMemory({
  type = MEM_TYPE.GENERAL,
  projectId = GLOBAL_NS,
  query = '',
  content,
  meta = {},
}) {
  if (!content) return null
  const ns    = projectId || GLOBAL_NS
  const store = loadStore(ns)
  const idf   = buildIdf(store.entries)

  const entry = {
    id:        `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    query:     String(query).slice(0, 300),
    content:   String(content).slice(0, MAX_CONTENT_LEN),
    meta:      { ...meta, useCount: 0 },
    ts:        Date.now(),
    projectId: ns,
  }

  // ── Anti-bloat: دمج الذكريات المتشابهة جداً ────────────────────────────────
  const newVec  = tfidfVector(tokenize(entry.content), idf)
  const dupIdx  = store.entries.findIndex(e => {
    if (e.type !== type) return false
    const sim = cosineSim(newVec, tfidfVector(tokenize(e.content), idf))
    return sim > BLOAT_THRESHOLD
  })

  if (dupIdx >= 0) {
    // تحديث الموجود بدلاً من الإضافة
    store.entries[dupIdx] = {
      ...store.entries[dupIdx],
      content: entry.content,  // أحدث محتوى
      query:   entry.query || store.entries[dupIdx].query,
      meta:    { ...store.entries[dupIdx].meta, ...meta, updatedAt: Date.now() },
      ts:      Date.now(),
    }
  } else {
    store.entries.unshift(entry)
    // LRU trim حسب النوع
    const maxPer = ns === GLOBAL_NS ? MAX_GLOBAL : MAX_PER_PROJECT
    if (store.entries.length > maxPer) {
      // احتفظ بالأحدث من كل نوع، اعمل نسبة حسب الأولوية
      const byType = {}
      for (const e of store.entries) {
        if (!byType[e.type]) byType[e.type] = []
        byType[e.type].push(e)
      }
      const quota = { execution: 80, error: 60, project: 40, user: 40, general: 80 }
      const kept  = []
      for (const [t, arr] of Object.entries(byType)) {
        kept.push(...arr.slice(0, quota[t] || 30))
      }
      store.entries = kept.sort((a, b) => b.ts - a.ts).slice(0, maxPer)
    }
  }

  saveStore(ns, store)
  return entry
}

// ── استرجاع Top-K ذكريات ذات صلة ───────────────────────────────────────────
export function searchMemories({
  query,
  projectId = GLOBAL_NS,
  topK  = TOP_K,
  types = null,  // null = كل الأنواع
  minSim = SIMILARITY_MIN,
}) {
  if (!query) return []
  const ns    = projectId || GLOBAL_NS
  const store = loadStore(ns)

  // أضف ذكريات global دائماً
  const globalStore = ns !== GLOBAL_NS ? loadStore(GLOBAL_NS) : null
  const allEntries  = [
    ...store.entries,
    ...(globalStore?.entries || []),
  ]

  const filtered = types ? allEntries.filter(e => types.includes(e.type)) : allEntries
  if (!filtered.length) return []

  const idf    = buildIdf(filtered)
  const qVec   = tfidfVector(tokenize(query), idf)
  const scored = filtered.map(e => ({
    ...e,
    _sim: cosineSim(qVec, tfidfVector(tokenize(e.content + ' ' + e.query), idf)),
  }))

  // أولوية الاسترجاع (حسب المواصفات)
  const typePriority = {
    project:   5,
    execution: 4,
    error:     3,
    user:      2,
    general:   1,
  }

  return scored
    .filter(e => e._sim >= minSim)
    .sort((a, b) => {
      // نجمع similarity + أولوية النوع + حداثة
      const scoreA = a._sim * 0.6 + (typePriority[a.type] || 1) * 0.02 + Math.min(a.ts / Date.now(), 1) * 0.38
      const scoreB = b._sim * 0.6 + (typePriority[b.type] || 1) * 0.02 + Math.min(b.ts / Date.now(), 1) * 0.38
      return scoreB - scoreA
    })
    .slice(0, topK)
    .map(({ _sim, ...e }) => ({ ...e, relevance: Math.round(_sim * 100) }))
}

// ── بناء سياق الذاكرة للـ system prompt (مُختصر) ────────────────────────────
export function buildMemoryContext(memories) {
  if (!memories?.length) return ''
  const lines = ['[🧠 ذاكرة DZ Agent — سياق مسترجع]']

  for (const m of memories) {
    const typeLabel = {
      user:      '👤 تفضيل',
      project:   '📁 مشروع',
      execution: '⚙️ تنفيذ',
      error:     '🐛 خطأ/حل',
      general:   '💡 معلومة',
    }[m.type] || '📌'

    const age = _ageLabel(m.ts)
    lines.push(`${typeLabel} [${age}]: ${m.content.slice(0, 200)}`)
  }

  lines.push('[نهاية الذاكرة المسترجعة]')
  return lines.join('\n')
}

// ── إحصاءات الذاكرة ──────────────────────────────────────────────────────────
export function memoryStats(projectId) {
  const ns    = projectId || GLOBAL_NS
  const store = loadStore(ns)
  const globalStore = ns !== GLOBAL_NS ? loadStore(GLOBAL_NS) : null

  const byType = {}
  for (const e of store.entries) {
    byType[e.type] = (byType[e.type] || 0) + 1
  }

  return {
    namespace:   ns,
    total:       store.entries.length,
    byType,
    global:      globalStore?.entries?.length || 0,
    oldest:      store.entries.at(-1)?.ts || null,
    newest:      store.entries[0]?.ts || null,
    dataDir:     DATA_DIR,
  }
}

// ── حذف ذكريات namespace ──────────────────────────────────────────────────────
export function clearMemory(projectId) {
  const ns    = projectId || GLOBAL_NS
  const store = { ns, entries: [] }
  saveStore(ns, store)
  return { cleared: true, ns }
}

// ── حفظ تفضيل مستخدم (user memory) ─────────────────────────────────────────
export function storeUserPreference(key, value, projectId) {
  return storeMemory({
    type: MEM_TYPE.USER,
    projectId: projectId || GLOBAL_NS,
    query: key,
    content: `${key}: ${value}`,
    meta: { key, value },
  })
}

// ── حفظ نتيجة تنفيذ (execution memory) ──────────────────────────────────────
export function storeExecutionResult({ action, result, files = [], branch, repo, projectId }) {
  const content = [
    `action: ${action}`,
    files.length ? `files: ${files.join(', ')}` : '',
    branch ? `branch: ${branch}` : '',
    result ? `result: ${String(result).slice(0, 300)}` : '',
  ].filter(Boolean).join(' | ')

  return storeMemory({
    type: MEM_TYPE.EXECUTION,
    projectId: repo || projectId || GLOBAL_NS,
    query: action,
    content,
    meta: { action, files, branch, repo },
  })
}

// ── حفظ خطأ وحله (error memory) ──────────────────────────────────────────────
export function storeErrorFix({ error, fix, status = 'resolved', repo, projectId }) {
  return storeMemory({
    type: MEM_TYPE.ERROR,
    projectId: repo || projectId || GLOBAL_NS,
    query: error,
    content: `error: ${String(error).slice(0, 200)} | fix: ${String(fix).slice(0, 300)} | status: ${status}`,
    meta: { error, fix, status },
  })
}

// ── حفظ بنية المشروع (project memory) ────────────────────────────────────────
export function storeProjectContext({ repo, framework, stack, branch, deployTarget, issues = [] }) {
  const content = [
    `repo: ${repo}`,
    framework ? `framework: ${framework}` : '',
    stack?.length ? `stack: ${stack.slice(0, 8).join(', ')}` : '',
    branch ? `branch: ${branch}` : '',
    deployTarget ? `deploy: ${deployTarget}` : '',
    issues.length ? `issues: ${issues.slice(0, 3).map(i => i.msg || i).join('; ')}` : '',
  ].filter(Boolean).join(' | ')

  return storeMemory({
    type: MEM_TYPE.PROJECT,
    projectId: repo || GLOBAL_NS,
    query: `project ${repo}`,
    content,
    meta: { repo, framework, stack, branch, deployTarget },
  })
}

// ── helpers ───────────────────────────────────────────────────────────────────
function _ageLabel(ts) {
  if (!ts) return 'قديم'
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1)  return 'الآن'
  if (mins < 60) return `${mins}د`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}س`
  return `${Math.floor(hrs / 24)}ي`
}
