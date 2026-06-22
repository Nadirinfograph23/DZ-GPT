/**
 * lib/dz-skills/mount.js
 * نقطة تحميل DZ Skills API — endpoints جديدة بدون تعديل الـ routes الموجودة
 *
 * Endpoints:
 *  GET  /api/dz-skills/list           ← قائمة كل المهارات
 *  POST /api/dz-skills/route          ← موجّه المهارة لرسالة معينة
 *  POST /api/dz-skills/enable         ← تفعيل مهارة
 *  POST /api/dz-skills/disable        ← تعطيل مهارة
 *  POST /api/dz-skills/register       ← إضافة مهارة جديدة (plugin)
 *  POST /api/dz-skills/update         ← تحديث مهارة
 *  POST /api/dz-skills/test           ← اختبار مهارة بعينها
 *  GET  /api/dz-skills/benchmark      ← تشغيل كل الاختبارات
 *  GET  /api/dz-skills/health         ← حالة النظام
 */

import {
  routeSkill,
  enableSkill,
  disableSkill,
  registerSkill,
  updateSkill,
  listSkills,
  getSkill,
  testSkill,
} from './index.js'
import { runBenchmark } from './benchmark.js'

export function mountDzSkills(app) {

  // ── حالة النظام ────────────────────────────────────────────────────────
  app.get('/api/dz-skills/health', (_req, res) => {
    const skills = listSkills()
    res.json({
      ok: true,
      version: '1.0.0',
      totalSkills: skills.length,
      enabledSkills: skills.filter(s => s.enabled).length,
      skills: skills.map(s => s.id),
    })
  })

  // ── قائمة المهارات ────────────────────────────────────────────────────
  app.get('/api/dz-skills/list', (_req, res) => {
    res.json({ ok: true, skills: listSkills() })
  })

  // ── الموجّه ──────────────────────────────────────────────────────────
  app.post('/api/dz-skills/route', (req, res) => {
    const { message } = req.body
    if (!message) return res.status(400).json({ ok: false, error: 'message مطلوب' })
    const result = routeSkill(message)
    res.json({
      ok: true,
      matched: result.matched,
      skillId: result.skill?.id || null,
      skillName: result.skill?.nameAr || null,
      aiHint: result.aiHint || null,
      systemPromptSnippet: result.systemPromptSnippet || null,
    })
  })

  // ── تفعيل مهارة ───────────────────────────────────────────────────────
  app.post('/api/dz-skills/enable', (req, res) => {
    const { id } = req.body
    if (!id) return res.status(400).json({ ok: false, error: 'id مطلوب' })
    res.json(enableSkill(id))
  })

  // ── تعطيل مهارة ───────────────────────────────────────────────────────
  app.post('/api/dz-skills/disable', (req, res) => {
    const { id } = req.body
    if (!id) return res.status(400).json({ ok: false, error: 'id مطلوب' })
    res.json(disableSkill(id))
  })

  // ── إضافة مهارة جديدة (plugin) ────────────────────────────────────────
  app.post('/api/dz-skills/register', (req, res) => {
    const { skill } = req.body
    if (!skill) return res.status(400).json({ ok: false, error: 'skill object مطلوب' })
    res.json(registerSkill(skill))
  })

  // ── تحديث مهارة ──────────────────────────────────────────────────────
  app.post('/api/dz-skills/update', (req, res) => {
    const { id, patch } = req.body
    if (!id || !patch) return res.status(400).json({ ok: false, error: 'id و patch مطلوبان' })
    res.json(updateSkill(id, patch))
  })

  // ── اختبار مهارة بعينها ───────────────────────────────────────────────
  app.post('/api/dz-skills/test', (req, res) => {
    const { id, messages } = req.body
    if (!id) return res.status(400).json({ ok: false, error: 'id مطلوب' })
    res.json(testSkill(id, messages || []))
  })

  // ── تشغيل كامل الاختبارات ─────────────────────────────────────────────
  app.get('/api/dz-skills/benchmark', (_req, res) => {
    try {
      const report = runBenchmark()
      res.json({ ok: true, ...report })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  console.log('[dz-skills] mounted: /api/dz-skills/* (list|route|enable|disable|register|update|test|benchmark|health)')
}
