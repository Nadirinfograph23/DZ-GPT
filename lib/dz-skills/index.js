/**
 * lib/dz-skills/index.js
 * DZ Skills Registry — نظام المهارات الموضوعاتية لـ DZ Agent
 *
 * المبدأ:
 *  • مطابقة regex سريعة — لا استدعاء LLM إضافي
 *  • كل مهارة تُضيف systemPromptSnippet قصيراً للـ system prompt الحالي
 *  • تفعيل/تعطيل المهارات بدون تعديل الكود الأساسي
 *  • يمكن تحميل مهارات جديدة كـ plugins في المستقبل
 */

import { SKILLS } from './skills.js'

// ── Registry الحي — يدعم التعديل اللحظي ────────────────────────────────────
const _registry = new Map()
let   _sortedSkills = []

function _rebuild() {
  _sortedSkills = [..._registry.values()]
    .filter(s => s.enabled)
    .sort((a, b) => b.priority - a.priority)
}

// تحميل المهارات الافتراضية
for (const skill of SKILLS) {
  _registry.set(skill.id, { ...skill })
}
_rebuild()

// ── الموجّه الرئيسي ──────────────────────────────────────────────────────────
/**
 * routeSkill(message)
 * @param {string} message — رسالة المستخدم الخام
 * @returns {{ skill: object|null, systemPromptSnippet: string, matched: boolean }}
 */
export function routeSkill(message) {
  if (!message || typeof message !== 'string') {
    return { skill: null, systemPromptSnippet: '', matched: false }
  }

  const lower = message.toLowerCase()

  for (const skill of _sortedSkills) {
    const hit = skill.triggers.some(rx => rx.test(lower) || rx.test(message))
    if (hit) {
      return {
        skill,
        systemPromptSnippet: skill.systemPromptSnippet,
        matched: true,
        aiHint: skill.aiHint || null,
      }
    }
  }

  return { skill: null, systemPromptSnippet: '', matched: false }
}

// ── إدارة المهارات (enable/disable/register) ─────────────────────────────────
export function enableSkill(id) {
  const s = _registry.get(id)
  if (!s) return { ok: false, error: `Skill "${id}" غير موجودة` }
  s.enabled = true
  _rebuild()
  return { ok: true, id, enabled: true }
}

export function disableSkill(id) {
  const s = _registry.get(id)
  if (!s) return { ok: false, error: `Skill "${id}" غير موجودة` }
  s.enabled = false
  _rebuild()
  return { ok: true, id, enabled: false }
}

export function registerSkill(skill) {
  if (!skill?.id || !skill?.triggers || !skill?.systemPromptSnippet) {
    return { ok: false, error: 'Skill يجب أن يحتوي على id + triggers + systemPromptSnippet' }
  }
  _registry.set(skill.id, {
    priority: 50,
    enabled: true,
    aiHint: null,
    tools: [],
    examples: [],
    ...skill,
    triggers: skill.triggers.map(t =>
      typeof t === 'string' ? new RegExp(t, 'i') : t
    ),
  })
  _rebuild()
  return { ok: true, id: skill.id, registered: true }
}

export function updateSkill(id, patch) {
  const s = _registry.get(id)
  if (!s) return { ok: false, error: `Skill "${id}" غير موجودة` }
  Object.assign(s, patch)
  _rebuild()
  return { ok: true, id }
}

export function listSkills() {
  return [..._registry.values()].map(s => ({
    id: s.id,
    nameAr: s.nameAr,
    enabled: s.enabled,
    priority: s.priority,
    aiHint: s.aiHint,
    toolsCount: s.tools?.length || 0,
    examplesCount: s.examples?.length || 0,
  }))
}

export function getSkill(id) {
  return _registry.get(id) || null
}

// ── اختبار مهارة واحدة ────────────────────────────────────────────────────────
export function testSkill(id, testMessages = []) {
  const skill = _registry.get(id)
  if (!skill) return { ok: false, error: `Skill "${id}" غير موجودة` }

  const results = (testMessages.length ? testMessages : skill.examples).map(msg => {
    const hit = skill.triggers.some(rx => rx.test(msg.toLowerCase()) || rx.test(msg))
    return { message: msg, triggered: hit }
  })

  const passed = results.filter(r => r.triggered).length
  return {
    ok: true,
    id,
    total: results.length,
    passed,
    failed: results.length - passed,
    score: results.length ? `${Math.round((passed / results.length) * 100)}%` : 'N/A',
    results,
  }
}
