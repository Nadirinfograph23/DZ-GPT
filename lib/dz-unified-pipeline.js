/**
 * DZ Unified Pipeline — طبقة التوحيد المركزية
 *
 * تُطبَّق على V2 + V3 + V5 قبل أي استدعاء AI.
 * تُعيد كتلة system enrichment جاهزة للإضافة إلى system prompt.
 *
 * لا تمس: توليد الصور | بحث الفيديو | الخرائط | طبيب (معالَجة في مسارات مستقلة)
 */

import { classifyIntent, detectEntities } from './dz-intent-router.js'
import { buildUnderstandingContext }       from './dz-understanding.js'
import {
  isMinisterQuery,
  findGovPerson,
  buildMinistersContext,
} from './algeria-gov/ministers.js'

// ── تحويل intent → taskHint لـ AI Router ─────────────────────────────────────
const INTENT_TO_TASK_HINT = {
  SPORTS_GENERAL:    'retrieval',
  SPORTS_LIVE:       'realtime',
  PUBLIC_FIGURE:     'retrieval',
  NEWS:              'realtime',
  NEWS_BREAKING:     'realtime',
  WEATHER:           'realtime',
  CURRENCY:          'realtime',
  CODING:            'code',
  TECHNICAL:         'technical',
  TRANSLATION:       'translation',
  QURAN:             'retrieval',
  LEGAL:             'retrieval',
  MEDICAL:           'retrieval',
  GREETING:          'realtime',
  GENERAL:           'multilingual',
  UNKNOWN:           'multilingual',
}

/**
 * enrichQueryContext(query, history?)
 *
 * يُحلّل رسالة المستخدم ويُعيد:
 * - intent        : التصنيف الكامل من classifyIntent
 * - entities      : الكيانات المكتشفة (لاعبون، سياسيون، ...)
 * - taskHint      : تلميح للـ AI Router
 * - systemBlock   : كتلة نصية جاهزة للإضافة إلى system prompt
 *
 * @param {string} query   - رسالة المستخدم
 * @param {Array}  history - [{role,content}] (اختياري)
 * @returns {object}
 */
export function enrichQueryContext(query = '', history = []) {
  if (!query || query.trim().length < 2) {
    return { intent: null, entities: {}, taskHint: 'multilingual', systemBlock: null }
  }

  // ① تصنيف النية + كشف الكيانات
  const intent    = classifyIntent(query, history)
  const entities  = detectEntities(query)
  const taskHint  = INTENT_TO_TASK_HINT[intent.intent] || 'multilingual'

  const parts = []

  // ② كتلة الفهم العميق (نوع السؤال، الحاجة الضمنية، الدارجة، ...)
  const understandingBlock = buildUnderstandingContext(query)
  if (understandingBlock) parts.push(understandingBlock)

  // ③ سياق الوزراء إذا كان السؤال عن شخصية حكومية
  if (isMinisterQuery(query)) {
    // جلب بيانات الشخصية المحددة إن أمكن
    const govData = findGovPerson(query)
    if (govData) {
      const ctx = buildMinistersContext(govData)
      if (ctx) parts.push(ctx)
    }
  }

  // ④ كتلة الكيانات المكتشفة (لاعبون / سياسيون / فرق)
  const entityLines = []
  if (entities.players.length)     entityLines.push(`👤 لاعبون: ${entities.players.join('، ')}`)
  if (entities.politicians.length) entityLines.push(`🏛️ سياسيون: ${entities.politicians.join('، ')}`)
  if (entities.figures.length)     entityLines.push(`📖 شخصيات: ${entities.figures.join('، ')}`)
  if (entities.teams.length)       entityLines.push(`⚽ فرق: ${entities.teams.join('، ')}`)
  if (entityLines.length) {
    parts.push(`━━━ كيانات مُكتشفة ━━━\n${entityLines.join('\n')}`)
  }

  // ⑤ تحذير التصنيف للنموذج
  if (intent.intent && intent.intent !== 'UNKNOWN' && intent.intent !== 'GENERAL') {
    parts.push(
      `🎯 النية المُصنَّفة: ${intent.intent} (ثقة: ${intent.confidence}%) — ${intent.action || ''}\n` +
      `📡 مصدر البيانات الموصى به: ${intent.source || 'عام'}`
    )
  }

  const systemBlock = parts.length > 0 ? parts.join('\n\n') : null

  return { intent, entities, taskHint, systemBlock }
}
