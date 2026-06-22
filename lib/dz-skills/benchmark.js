/**
 * lib/dz-skills/benchmark.js
 * مجموعة اختبارات شاملة لنظام المهارات — 6 سيناريوهات + 18 اختبار
 */

import { routeSkill } from './index.js'

const TESTS = [
  // ── البرمجة ──────────────────────────────────────────────────────────────
  { id: 'P1', category: 'برمجة',      expectedSkill: 'programming', query: 'أنشئ API بـ Python Flask مع قاعدة بيانات SQLite' },
  { id: 'P2', category: 'برمجة',      expectedSkill: 'programming', query: 'عندي bug في JavaScript: Cannot read properties of undefined' },
  { id: 'P3', category: 'برمجة',      expectedSkill: 'programming', query: 'اكتب script يحوّل ملف CSV لـ JSON' },

  // ── الطب ─────────────────────────────────────────────────────────────────
  { id: 'M1', category: 'طب',         expectedSkill: 'medical',     query: 'ما الفرق بين أعراض الزكام والإنفلونزا؟' },
  { id: 'M2', category: 'طب',         expectedSkill: 'medical',     query: 'عندي ألم في صدري منذ البارح، واش ندير؟' },
  { id: 'M3', category: 'طب',         expectedSkill: 'medical',     query: 'ما جرعة Paracetamol للبالغين؟' },

  // ── البحث ────────────────────────────────────────────────────────────────
  { id: 'R1', category: 'بحث',        expectedSkill: 'research',    query: 'من هو الرئيس الحالي للولايات المتحدة؟' },
  { id: 'R2', category: 'بحث',        expectedSkill: 'research',    query: 'ما هي آخر أخبار الجزائر اليوم؟' },
  { id: 'R3', category: 'بحث',        expectedSkill: 'research',    query: 'متى تأسست جامعة الجزائر؟' },

  // ── الدارجة الجزائرية ────────────────────────────────────────────────────
  { id: 'D1', category: 'دارجة',      expectedSkill: 'darija',      query: 'واش راك؟' },
  { id: 'D2', category: 'دارجة',      expectedSkill: 'darija',      query: 'كيفاش نروح من الجزائر لوهران؟' },
  { id: 'D3', category: 'دارجة',      expectedSkill: 'darija',      query: 'يعطيك الصحة خويا' },

  // ── الإنتاجية ────────────────────────────────────────────────────────────
  { id: 'PR1', category: 'إنتاجية',   expectedSkill: 'productivity', query: 'نظملي خطة أسبوعية للمذاكرة' },
  { id: 'PR2', category: 'إنتاجية',   expectedSkill: 'productivity', query: 'كيف أنظم وقتي كطالب جامعي؟' },
  { id: 'PR3', category: 'إنتاجية',   expectedSkill: 'productivity', query: 'ضعلي جدول رياضة للمبتدئين' },

  // ── الترجمة ──────────────────────────────────────────────────────────────
  { id: 'T1', category: 'ترجمة',      expectedSkill: 'translation', query: 'ترجم هذه الجملة للفرنسية: أريد العمل في مجال الذكاء الاصطناعي' },
  { id: 'T2', category: 'ترجمة',      expectedSkill: 'translation', query: 'كيف أقول "Je suis fatigué" بالدارجة الجزائرية؟' },

  // ── تحليل البيانات ───────────────────────────────────────────────────────
  { id: 'DA1', category: 'بيانات',    expectedSkill: 'data_analysis', query: 'حلّل هذا الجدول وأعطني المتوسط والانحراف المعياري' },
  { id: 'DA2', category: 'بيانات',    expectedSkill: 'data_analysis', query: 'ارسم chart بـ Python لهذه البيانات' },
]

export function runBenchmark() {
  const results = []
  let passed = 0, failed = 0

  for (const test of TESTS) {
    const { skill, matched } = routeSkill(test.query)
    const gotSkill = skill?.id || 'none'
    const pass = gotSkill === test.expectedSkill

    if (pass) passed++; else failed++

    results.push({
      id: test.id,
      category: test.category,
      query: test.query,
      expectedSkill: test.expectedSkill,
      gotSkill,
      pass,
      matched,
    })
  }

  const total = results.length
  const score = `${Math.round((passed / total) * 100)}%`
  const status = failed === 0 ? '✅ PASS — كل المهارات تعمل بشكل صحيح' : `⚠️ ${failed} اختبار فشل — راجع الـ triggers`

  return {
    summary: { total, passed, failed, score, status },
    results,
  }
}
