/**
 * DZ Agent — Capability Registry
 * ══════════════════════════════════════════════════════════════════════════════
 * نظام السجل المركزي لقدرات DZ Agent
 * يقرأ من config/ ويُولّد تقارير منظمة عند الطلب
 *
 * المبدأ: لا hallucination — فقط بيانات حقيقية من السجل
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── تحميل بيانات السجل ────────────────────────────────────────────────────

function loadJSON(filename) {
  try {
    return JSON.parse(readFileSync(join(ROOT, 'config', filename), 'utf8'))
  } catch {
    return null
  }
}

let _agents   = null
let _tools    = null
let _skills   = null
let _providers = null

function getAgents()    { return _agents    ||= loadJSON('agents.json') }
function getTools()     { return _tools     ||= loadJSON('tools.json') }
function getSkills()    { return _skills    ||= loadJSON('skills.json') }
function getProviders() { return _providers ||= loadJSON('providers.json') }

// ── إعادة تحميل عند الطلب (live reload) ──────────────────────────────────
export function reloadRegistry() {
  _agents = _tools = _skills = _providers = null
  return { agents: getAgents(), tools: getTools(), skills: getSkills(), providers: getProviders() }
}

// ── تقرير الـ System Overview (ملخص) ─────────────────────────────────────

export function getSystemOverview() {
  const ag = getAgents()
  const to = getTools()
  const sk = getSkills()
  const pr = getProviders()

  return {
    system_name:     ag?.system || 'DZ Agent',
    version:         ag?.version || '5.0.0',
    architecture:    ag?.architecture || 'multi-agent-orchestration',
    total_agents:    ag?.total_agents || 0,
    total_tools:     to?.total_tools || 0,
    total_skills:    sk?.total_skills || 0,
    total_providers: pr?.total_providers || 0,
    primary_provider: pr?.primary_provider || 'groq',
    circuit_breaker:  pr?.circuit_breaker?.enabled || false,
    fallback_chain:   pr?.circuit_breaker?.fallback_chain || [],
    token_limits:     pr?.token_limits || {},
  }
}

// ── بناء تقرير القدرات الكامل (Markdown) ─────────────────────────────────

export function buildCapabilityReport(mode = 'full') {
  const overview = getSystemOverview()
  const ag = getAgents()
  const to = getTools()
  const sk = getSkills()
  const pr = getProviders()

  if (!ag || !to || !sk || !pr) {
    return '⚠️ **السجل غير مهيأ** — Registry not initialized. يرجى المراجعة مع المطور.'
  }

  // ── ملخص مختصر ──────────────────────────────────────────────────────────
  if (mode === 'short') {
    return buildShortReport(overview, ag, sk, pr)
  }

  // ── تقرير كامل ──────────────────────────────────────────────────────────
  return buildFullReport(overview, ag, to, sk, pr)
}

function buildShortReport(overview, ag, sk, pr) {
  const agentNames = ag.agents.slice(0, 8).map(a => `${a.emoji} ${a.name}`).join(' · ')
  const topProviders = pr.providers.slice(0, 3).map(p => p.name).join(' · ')

  return `## 🤖 DZ Agent — ملخص القدرات

### 📊 نظرة عامة
| العنصر | العدد |
|--------|-------|
| الوكلاء المتخصصون | **${overview.total_agents}** |
| الأدوات | **${overview.total_tools}** |
| المهارات | **${overview.total_skills}** |
| مزودو AI | **${overview.total_providers}** |

### 🧠 أبرز الوكلاء
${agentNames} ....

### ⚡ مزودو الذكاء الاصطناعي
${topProviders} + ${overview.total_providers - 3} آخرون

### 🔒 الحد الأقصى للـ Tokens
- المدخلات: **${overview.token_limits.max_input_tokens?.toLocaleString() || '32,768'}** token
- المخرجات: **${overview.token_limits.max_output_tokens?.toLocaleString() || '8,192'}** token

> اكتب **"قدراتك كاملة"** لعرض التقرير التفصيلي الكامل.`
}

function buildFullReport(overview, ag, to, sk, pr) {
  const lines = []

  // ── 1. SYSTEM OVERVIEW ──────────────────────────────────────────────────
  lines.push(`# 🤖 DZ Agent — تقرير القدرات الكامل
*المصدر: السجل الداخلي — لا hallucination*

---

## 1️⃣ SYSTEM OVERVIEW
| العنصر | القيمة |
|--------|--------|
| **اسم النظام** | ${overview.system_name} |
| **الإصدار** | ${overview.version} |
| **البنية** | ${overview.architecture} |
| **الوكلاء المتخصصون** | ${overview.total_agents} |
| **الأدوات** | ${overview.total_tools} |
| **المهارات** | ${overview.total_skills} |
| **مزودو AI** | ${overview.total_providers} |
| **المزود الأساسي** | ${overview.primary_provider} |
| **Circuit Breaker** | ${overview.circuit_breaker ? '✅ مفعّل' : '❌ معطّل'} |

---`)

  // ── 2. AGENTS LIST ───────────────────────────────────────────────────────
  lines.push(`## 2️⃣ الوكلاء المتخصصون (${ag.total_agents} وكيل)
`)
  for (const a of ag.agents) {
    lines.push(`### ${a.emoji} ${a.name}
| | |
|---|---|
| **الدور** | ${a.role} |
| **المسؤولية** | ${a.responsibility} |
| **المدخلات** | ${a.input_types.join(' · ')} |
| **المخرجات** | ${a.output_types.join(' · ')} |
| **الاعتماديات** | ${a.dependencies.join(' · ')} |
| **السرعة** | ${a.latency_class} |
| **القيود** | ${a.limitations.length ? a.limitations.join(' · ') : 'لا قيود'} |
`)
  }
  lines.push('---')

  // ── 3. TOOLS LIST ────────────────────────────────────────────────────────
  lines.push(`## 3️⃣ الأدوات (${to.total_tools} أداة)

| الأداة | الوظيفة | المصدر | السرعة | تكلفة Tokens | الحالة |
|--------|---------|--------|--------|--------------|--------|`)
  for (const t of to.tools) {
    lines.push(`| **${t.name}** | ${t.function} | ${t.api_source} | ${t.latency_class} | ${t.token_cost_estimate} | ${t.status === 'active' ? '✅' : '⚠️'} |`)
  }
  lines.push('\n---')

  // ── 4. SKILLS LIST ───────────────────────────────────────────────────────
  lines.push(`## 4️⃣ المهارات (${sk.total_skills} مهارة)

| المهارة | الوصف | المحفّز | الوكيل | الأداء |
|---------|-------|---------|--------|--------|`)
  for (const s of sk.skills) {
    const perf = '⭐'.repeat(Math.round(s.performance / 2))
    lines.push(`| **${s.name}** | ${s.description} | \`${s.trigger}\` | ${s.agent} | ${perf} (${s.performance}/10) |`)
  }
  lines.push('\n---')

  // ── 5. PROVIDERS & MODELS ────────────────────────────────────────────────
  lines.push(`## 5️⃣ مزودو AI والنماذج

| المزود | النماذج | نافذة السياق | التكلفة | الموثوقية |
|--------|---------|-------------|---------|-----------|`)
  for (const p of pr.providers) {
    const models = p.models.slice(0, 2).join(' · ') + (p.models.length > 2 ? ` +${p.models.length - 2}` : '')
    const rel = '⭐'.repeat(Math.round(p.reliability_score / 2))
    lines.push(`| **${p.name}** | ${models} | ${p.context_window.toLocaleString()} tokens | ${p.cost_level} | ${rel} (${p.reliability_score}/10) |`)
  }

  lines.push(`\n**سلسلة الـ Fallback التلقائية:**
${pr.circuit_breaker.fallback_chain.join(' → ')}

---`)

  // ── 6. TOKEN & LIMITS ────────────────────────────────────────────────────
  const tl = overview.token_limits
  lines.push(`## 6️⃣ حدود الـ Tokens والموارد

| المعيار | القيمة |
|---------|--------|
| **أقصى مدخلات** | ${tl.max_input_tokens?.toLocaleString() || 'N/A'} token |
| **أقصى مخرجات** | ${tl.max_output_tokens?.toLocaleString() || 'N/A'} token |
| **متوسط الرد** | ${tl.average_response_tokens?.toLocaleString() || 'N/A'} token |
| **تكلفة الأدوات** | ${tl.tool_overhead_tokens?.toLocaleString() || 'N/A'} token |
| **ميزانية الذاكرة** | ${tl.memory_budget_tokens?.toLocaleString() || 'N/A'} token |
| **استراتيجية الضغط** | ${tl.compression_strategy || 'N/A'} |

---`)

  // ── 7. LIMITATIONS ───────────────────────────────────────────────────────
  lines.push(`## 7️⃣ القيود والحدود (مهم — شفافية كاملة)

### ❌ ما لا يمكنني فعله:
- لا تنفيذ كود في بيئة حقيقية (sandbox) داخل الشات
- لا وصول لملفاتك المحلية على جهازك
- لا ذاكرة دائمة بين الجلسات المختلفة
- لا إرسال رسائل أو بريد إلكتروني باسمك بدون إذن

### 🌐 ما يحتاج إنترنت:
- البحث الحي · أسعار الصرف · الطقس · نتائج المباريات · الأخبار

### ⚠️ ما هو تجريبي:
- تحليل الفيديو الطويل (+2 ساعة) · OCR للخطوط غير الواضحة
- بعض نماذج توليد الصور (SDXL)

### 🔒 ما يحتاج API key:
- GitHub: \`GITHUB_TOKEN\` · Vercel: \`VERCEL_TOKEN\`
- الطقس: \`OPENWEATHER_API_KEY\`

### 💡 حالة المزودين الآن:
- ✅ Groq · ✅ Gemini · ✅ Mistral · ✅ NVIDIA NIM · ✅ Cohere · ✅ OpenRouter
- ⚠️ DeepSeek: رصيد فارغ · ⚠️ Google CSE: مقيّد

---
*📡 آخر تحديث للسجل: تلقائي — يتحدث مع كل نشر جديد*
*🔗 API مباشر: \`GET /api/capabilities\`*`)

  return lines.join('\n')
}

// ── تقرير JSON خام (للـ API endpoint) ───────────────────────────────────

export function getCapabilitiesJSON() {
  return {
    timestamp: new Date().toISOString(),
    overview: getSystemOverview(),
    agents:   getAgents()?.agents || [],
    tools:    getTools()?.tools || [],
    skills:   getSkills()?.skills || [],
    providers: getProviders()?.providers || [],
    token_limits: getProviders()?.token_limits || {},
    circuit_breaker: getProviders()?.circuit_breaker || {},
  }
}

// ── كشف نوع التقرير المطلوب (short vs full) ──────────────────────────────

export function detectReportMode(query = '') {
  const q = query.toLowerCase()
  const fullPatterns = [
    'كاملة', 'كامل', 'تفصيلي', 'تفاصيل', 'كل شيء', 'كلها', 'full',
    'detailed', 'complete', 'all', 'architecture', 'بنية', 'هيكل',
    'كل الوكلاء', 'كل الأدوات', 'كل المهارات', 'قائمة كاملة',
  ]
  return fullPatterns.some(p => q.includes(p)) ? 'full' : 'short'
}
