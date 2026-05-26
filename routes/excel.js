/**
 * routes/excel.js
 * DZ Excel AI endpoint — AI assistant for the Excel editor.
 * Extracted & fixed from server.js line 14414.
 *
 * POST /api/dz-excel/ai
 *
 * Bug fix: original code called safeGenerateAI with wrong params { system, user, maxTokens }
 * instead of correct { messages, query, max_tokens, taskHint }. Fixed here.
 *
 * Factory deps:
 *   safeGenerateAI - async ({ messages, query, max_tokens, taskHint }) => { content, model }
 *   aiLimiter      - express rate-limit middleware
 */
import { Router } from 'express'

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

export function createExcelRouter(deps = {}) {
  const { safeGenerateAI, aiLimiter = (_req, _res, next) => next() } = deps
  const router = Router()

  router.post('/dz-excel/ai', aiLimiter, async (req, res) => {
    const { message = '' } = req.body
    if (!message) return res.status(400).json({ error: 'message required' })

    try {
      const { content } = await safeGenerateAI({
        messages: [
          { role: 'system', content: TEMPLATE_SYSTEM },
          { role: 'user', content: String(message).slice(0, 1000) },
        ],
        query: String(message).slice(0, 200),
        max_tokens: 2000,
        taskHint: 'general',
      })

      if (!content) {
        return res.json({ action: 'answer', message: 'عذراً، تعذّر توليد الرد. حاول مرة أخرى.' })
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])

          if (parsed.action === 'template' && Array.isArray(parsed.rows)) {
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
        } catch (_) {}
      }

      return res.json({ action: 'answer', message: content })
    } catch (err) {
      console.error('[DZ Excel AI]', err.message)
      return res.status(500).json({ action: 'answer', message: 'حدث خطأ في الخادم. حاول مرة أخرى.' })
    }
  })

  return router
}
