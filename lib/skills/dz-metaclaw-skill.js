// lib/skills/dz-metaclaw-skill.js
// MetaClaw-inspired Skill Evolution System for DZ Agent
// مستوحى من MetaClaw: https://github.com/aiming-lab/MetaClaw
// يُحسّن الوكيل تلقائياً من كل محادثة — بدون GPU

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR  = join(__dirname, '../../data/metaclaw-skills')
const SKILLS_FILE = join(SKILLS_DIR, 'skills.json')
const SESSIONS_FILE = join(SKILLS_DIR, 'sessions.jsonl')
const MAX_SKILLS = 100
const INJECT_TOP_K = 5

// ── Task-type keywords (from MetaClaw skill_manager) ─────────────────────────
const TASK_KEYWORDS = {
  coding:        ['كود', 'code', 'برمجة', 'debug', 'خطأ', 'error', 'دالة', 'function', 'api', 'بايثون', 'جافاسكريبت', 'typescript', 'git', 'deploy'],
  research:      ['بحث', 'research', 'ورقة', 'paper', 'معلومات', 'مقال', 'دراسة', 'arxiv', 'تقرير'],
  data_analysis: ['بيانات', 'data', 'csv', 'جدول', 'إحصاء', 'تحليل', 'رسم بياني', 'chart', 'dashboard'],
  productivity:  ['مهمة', 'task', 'خطة', 'plan', 'مشروع', 'project', 'جدول', 'schedule', 'أولوية'],
  security:      ['أمان', 'security', 'ثغرة', 'vulnerability', 'مصادقة', 'auth', 'token', 'تشفير'],
  communication: ['رسالة', 'message', 'email', 'إيميل', 'تقرير', 'report', 'كتابة', 'write'],
  automation:    ['أتمتة', 'automate', 'سكريبت', 'script', 'cron', 'webhook', 'bot', 'تلقائي'],
  agentic:       ['وكيل', 'agent', 'مستقل', 'autonomous', 'أدوات', 'tools', 'ذاكرة', 'memory'],
  algeria:       ['جزائر', 'دزاير', 'algérie', 'algeria', 'دارجة', 'wilaya', 'baladiya', 'دينار'],
}

// ── Dir init ──────────────────────────────────────────────────────────────────
function ensureDir() {
  if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true })
}

// ── Load skills ───────────────────────────────────────────────────────────────
function loadSkills() {
  try {
    ensureDir()
    if (!existsSync(SKILLS_FILE)) return []
    return JSON.parse(readFileSync(SKILLS_FILE, 'utf8'))
  } catch { return [] }
}

// ── Save skills ───────────────────────────────────────────────────────────────
function saveSkills(skills) {
  try {
    ensureDir()
    writeFileSync(SKILLS_FILE, JSON.stringify(skills, null, 2), 'utf8')
  } catch { /* fail silently */ }
}

// ── Append session log ────────────────────────────────────────────────────────
function appendSession(session) {
  try {
    ensureDir()
    writeFileSync(SESSIONS_FILE, JSON.stringify(session) + '\n', { flag: 'a', encoding: 'utf8' })
  } catch { /* fail silently */ }
}

// ── Detect task category ───────────────────────────────────────────────────────
function detectCategory(text) {
  const lower = text.toLowerCase()
  let best = 'general'; let bestScore = 0
  for (const [cat, keywords] of Object.entries(TASK_KEYWORDS)) {
    const score = keywords.filter(k => lower.includes(k)).length
    if (score > bestScore) { bestScore = score; best = cat }
  }
  return best
}

// ── Jaccard similarity ────────────────────────────────────────────────────────
function jaccard(a, b) {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter(t => t.length > 2))
  const tb = new Set(b.toLowerCase().split(/\s+/).filter(t => t.length > 2))
  if (!ta.size || !tb.size) return 0
  const inter = new Set([...ta].filter(x => tb.has(x)))
  const union = new Set([...ta, ...tb])
  return inter.size / union.size
}

// ── MetaClaw Skill Manager (JS port) ─────────────────────────────────────────
class MetaClawSkillManager {
  constructor() {
    this._skills = loadSkills()
  }

  reload() {
    this._skills = loadSkills()
  }

  // Seed default DZ-specific skills if empty
  seed() {
    if (this._skills.length > 0) return
    const defaults = [
      {
        id: 'dz-dialect-aware',
        name: 'دارجة جزائرية',
        description: 'استخدم عندما يكتب المستخدم بالدارجة الجزائرية أو يسأل عن الجزائر',
        category: 'algeria',
        content: 'تجاوب بالدارجة الجزائرية الطبيعية. استخدم مصطلحات جزائرية حقيقية. لا تتصنع الفصحى عندما يتكلم المستخدم بالدارجة.',
        useCount: 0, successRate: 1.0, ts: Date.now(),
      },
      {
        id: 'dz-coding-arabic',
        name: 'برمجة بالعربي',
        description: 'استخدم عند طلب كود مع شرح بالعربية',
        category: 'coding',
        content: 'اشرح الكود بالعربية الواضحة. ضع تعليقات عربية داخل الكود. قدّم أمثلة عملية مباشرة.',
        useCount: 0, successRate: 1.0, ts: Date.now(),
      },
      {
        id: 'dz-github-engineer',
        name: 'مهندس GitHub',
        description: 'استخدم عند طلب push لـ GitHub أو deploy لـ Vercel',
        category: 'agentic',
        content: 'استخدم دائماً الفرع devin/1774405518-init-dz-gpt. لا تعدّل main أبداً. بعد كل push انتظر Vercel READY.',
        useCount: 0, successRate: 1.0, ts: Date.now(),
      },
      {
        id: 'dz-react-vite',
        name: 'React + Vite DZ Style',
        description: 'استخدم عند بناء مكونات React للمشروع',
        category: 'coding',
        content: 'استخدم TypeScript. اتبع نمط الملفات الموجود. CSS classes تبدأ بـ dzt- لـ DZTools. لا تنشئ ملفات جديدة دون ضرورة.',
        useCount: 0, successRate: 1.0, ts: Date.now(),
      },
    ]
    this._skills = defaults
    saveSkills(this._skills)
  }

  // Retrieve top-K skills relevant to the conversation
  retrieve(userMessage, k = INJECT_TOP_K) {
    if (!this._skills.length) return []
    const category = detectCategory(userMessage)

    const scored = this._skills.map(skill => {
      let score = jaccard(userMessage, skill.name + ' ' + skill.description + ' ' + (skill.content || ''))
      if (skill.category === category) score += 0.3
      score *= (0.5 + 0.5 * (skill.successRate ?? 1.0))
      return { skill, score }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, k).filter(s => s.score > 0.05).map(s => s.skill)
  }

  // Build skill injection block for system prompt
  buildInjectionBlock(userMessage) {
    const skills = this.retrieve(userMessage)
    if (!skills.length) return ''
    const lines = skills.map(s => `• [${s.name}] — ${s.description}\n  ${s.content || ''}`).join('\n\n')
    return `\n\n── MetaClaw Skills (مهارات مُحقنة تلقائياً) ──\n${lines}\n────────────────────────────────────────────`
  }

  // Record skill usage outcome
  recordOutcome(skillId, success) {
    const skill = this._skills.find(s => s.id === skillId)
    if (!skill) return
    skill.useCount = (skill.useCount || 0) + 1
    const alpha = 0.1
    skill.successRate = (1 - alpha) * (skill.successRate ?? 1.0) + alpha * (success ? 1 : 0)
    saveSkills(this._skills)
  }

  // Add or update a skill (from evolution)
  upsertSkill(skill) {
    const idx = this._skills.findIndex(s => s.id === skill.id)
    if (idx >= 0) {
      this._skills[idx] = { ...this._skills[idx], ...skill, ts: Date.now() }
    } else {
      if (this._skills.length >= MAX_SKILLS) {
        // Prune lowest-performing skill
        this._skills.sort((a, b) => (a.successRate ?? 1) - (b.successRate ?? 1))
        this._skills.shift()
      }
      this._skills.push({ ...skill, useCount: 0, successRate: 1.0, ts: Date.now() })
    }
    saveSkills(this._skills)
    return skill
  }

  getAll() { return this._skills }
  getByCategory(cat) { return this._skills.filter(s => s.category === cat) }
}

// ── MetaClaw Skill Evolver (JS port) ─────────────────────────────────────────
class MetaClawSkillEvolver {
  constructor(skillManager, aiCallFn) {
    this._mgr = skillManager
    this._ai  = aiCallFn // async (prompt) => string
  }

  // Analyze a session and evolve skills
  async evolve(session) {
    const { userMessage, agentResponse, success, category } = session
    appendSession({ ...session, ts: Date.now() })

    if (!this._ai || !userMessage) return null

    // Only evolve on failure or explicitly marked sessions
    if (success && !session.forceEvolve) return null

    const existingSkillNames = this._mgr.getAll().map(s => s.name).join(', ') || 'لا يوجد'

    const prompt = `أنت نظام MetaClaw لتطوير مهارات الوكيل الذكي DZ Agent.

المهمة الفاشلة:
- رسالة المستخدم: "${userMessage?.slice(0, 300)}"
- رد الوكيل: "${agentResponse?.slice(0, 300)}"
- فئة المهمة: ${category || 'general'}
- المهارات الموجودة: ${existingSkillNames}

اقترح مهارة جديدة واحدة فقط بهذا التنسيق JSON الصارم (لا تضف أي نص خارجه):
{
  "id": "slug-lowercase-unique",
  "name": "اسم قصير",
  "description": "متى تُستخدم هذه المهارة (جملة واحدة)",
  "category": "${category || 'general'}",
  "content": "التعليمات الدقيقة للوكيل (2-4 جمل)"
}`

    try {
      const raw = await this._ai(prompt)
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) return null
      const skill = JSON.parse(match[0])
      if (!skill.id || !skill.name || !skill.content) return null
      return this._mgr.upsertSkill(skill)
    } catch { return null }
  }
}

// ── Singleton instances ───────────────────────────────────────────────────────
export const skillManager = new MetaClawSkillManager()
skillManager.seed()

export function createEvolver(aiCallFn) {
  return new MetaClawSkillEvolver(skillManager, aiCallFn)
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Inject relevant MetaClaw skills into a system prompt.
 * @param {string} systemPrompt - existing system prompt
 * @param {string} userMessage  - current user message
 * @returns {string} enhanced system prompt
 */
export function injectSkills(systemPrompt, userMessage) {
  try {
    const block = skillManager.buildInjectionBlock(userMessage || '')
    return systemPrompt + block
  } catch { return systemPrompt }
}

/**
 * Log a session for potential skill evolution.
 * @param {object} session - { userMessage, agentResponse, success, category, forceEvolve }
 * @param {Function} aiCallFn - async (prompt: string) => string — LLM call for evolution
 */
export async function logAndEvolve(session, aiCallFn = null) {
  try {
    const evolver = createEvolver(aiCallFn)
    const newSkill = await evolver.evolve(session)
    return newSkill
  } catch { return null }
}

/**
 * REST handler helpers — for mounting in Express
 */
export function mountMetaClaw(app) {
  // GET /api/metaclaw/skills
  app.get('/api/metaclaw/skills', (_req, res) => {
    skillManager.reload()
    res.json({ ok: true, count: skillManager.getAll().length, skills: skillManager.getAll() })
  })

  // POST /api/metaclaw/skills — add/update a skill manually
  app.post('/api/metaclaw/skills', (req, res) => {
    const { id, name, description, category, content } = req.body || {}
    if (!id || !name || !content) return res.status(400).json({ error: 'id, name, content مطلوبة' })
    const skill = skillManager.upsertSkill({ id, name, description: description || '', category: category || 'general', content })
    res.json({ ok: true, skill })
  })

  // DELETE /api/metaclaw/skills/:id
  app.delete('/api/metaclaw/skills/:id', (req, res) => {
    const skills = skillManager.getAll().filter(s => s.id !== req.params.id)
    saveSkills(skills)
    skillManager.reload()
    res.json({ ok: true, remaining: skills.length })
  })

  // POST /api/metaclaw/inject — get injection block for a message
  app.post('/api/metaclaw/inject', (req, res) => {
    const { systemPrompt = '', userMessage = '' } = req.body || {}
    const enhanced = injectSkills(systemPrompt, userMessage)
    const injected = skillManager.retrieve(userMessage)
    res.json({ ok: true, enhanced, injectedSkills: injected.map(s => s.name) })
  })

  // POST /api/metaclaw/evolve — trigger manual skill evolution
  app.post('/api/metaclaw/evolve', async (req, res) => {
    const { userMessage, agentResponse, success = false, category, apiKey } = req.body || {}
    if (!userMessage) return res.status(400).json({ error: 'userMessage مطلوب' })

    const aiCallFn = async (prompt) => {
      const key = apiKey || process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY
      if (!key) throw new Error('no AI key')
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 400,
          temperature: 0.3,
        }),
      })
      const data = await r.json()
      return data.choices?.[0]?.message?.content || ''
    }

    const newSkill = await logAndEvolve({ userMessage, agentResponse, success, category, forceEvolve: true }, aiCallFn)
    res.json({ ok: true, newSkill })
  })

  // GET /api/metaclaw/health
  app.get('/api/metaclaw/health', (_req, res) => {
    res.json({ ok: true, skills: skillManager.getAll().length, version: '1.0.0', inspired_by: 'MetaClaw (aiming-lab)' })
  })

  console.log('[MetaClaw] mounted: /api/metaclaw/{skills,inject,evolve,health}')
}
