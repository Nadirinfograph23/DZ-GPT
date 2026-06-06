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
import { getAgentIdentityBlock }           from './dz-agent-identity.js'
import { buildFootballContext, isFootballQuery } from './football-context-builder.js'

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
  // ── حالة الاستعلام الفارغ: أعطِ هوية مختصرة فقط ─────────────────────────
  if (!query || query.trim().length < 2) {
    const { short } = getAgentIdentityBlock('')
    return { intent: null, entities: {}, taskHint: 'multilingual', systemBlock: short, isSelfQuery: false }
  }

  // ① هوية الوكيل — تُحقَن دائماً (مختصرة) + كاملة إذا سُئل عن نفسه
  const identityBlock = getAgentIdentityBlock(query)
  const parts = [ identityBlock.short ]

  // إذا كان السؤال عن الوكيل ذاته → أضف الكتلة الكاملة مباشرةً
  if (identityBlock.isSelfQuery && identityBlock.full) {
    parts.push(identityBlock.full)
    // في هذه الحالة يكتفي النموذج بالكتلة الكاملة
    return {
      intent:      { intent: 'SELF_QUERY', confidence: 100, action: 'describe-self' },
      entities:    {},
      taskHint:    'multilingual',
      systemBlock: parts.join('\n\n'),
      isSelfQuery: true,
    }
  }

  // ② تصنيف النية + كشف الكيانات
  const intent    = classifyIntent(query, history)
  const entities  = detectEntities(query)
  const taskHint  = INTENT_TO_TASK_HINT[intent.intent] || 'multilingual'

  // ③ كتلة الفهم العميق (نوع السؤال، الحاجة الضمنية، الدارجة، ...)
  const understandingBlock = buildUnderstandingContext(query)
  if (understandingBlock) parts.push(understandingBlock)

  // ④ سياق الوزراء إذا كان السؤال عن شخصية حكومية
  if (isMinisterQuery(query)) {
    const govData = findGovPerson(query)
    if (govData) {
      const ctx = buildMinistersContext(govData)
      if (ctx) parts.push(ctx)
    }
  }

  // ⑤ كتلة الكيانات المكتشفة (لاعبون / سياسيون / فرق)
  const entityLines = []
  if (entities.players.length)     entityLines.push(`👤 لاعبون: ${entities.players.join('، ')}`)
  if (entities.politicians.length) entityLines.push(`🏛️ سياسيون: ${entities.politicians.join('، ')}`)
  if (entities.figures.length)     entityLines.push(`📖 شخصيات: ${entities.figures.join('، ')}`)
  if (entities.teams.length)       entityLines.push(`⚽ فرق: ${entities.teams.join('، ')}`)
  if (entityLines.length) {
    parts.push(`━━━ كيانات مُكتشفة ━━━\n${entityLines.join('\n')}`)
  }

  // ⑥ تلميح التصنيف للنموذج
  if (intent.intent && intent.intent !== 'UNKNOWN' && intent.intent !== 'GENERAL') {
    parts.push(
      `🎯 النية المُصنَّفة: ${intent.intent} (ثقة: ${intent.confidence}%) — ${intent.action || ''}\n` +
      `📡 مصدر البيانات الموصى به: ${intent.source || 'عام'}`
    )
  }

  return {
    intent,
    entities,
    taskHint,
    systemBlock: parts.join('\n\n'),
    isSelfQuery: false,
  }
}

/**
 * enrichQueryContextAsync(query, history?)
 *
 * نسخة async من enrichQueryContext — تُضيف بيانات كرة القدم المباشرة
 * من 365score و Koora كأولوية عند الكشف عن استعلام رياضي.
 *
 * استخدم هذه الدالة في V2, V3, V5 بدلاً من enrichQueryContext
 * لكل الاستعلامات الرياضية (مباريات، ترتيب، لاعبون، فرق، دوريات)
 */
export async function enrichQueryContextAsync(query = '', history = []) {
  // الحصول على السياق الأساسي (sync)
  const ctx = enrichQueryContext(query, history)

  // إذا كان طلب ذاتي → لا حاجة لبيانات الكرة
  if (ctx.isSelfQuery) return ctx

  // كشف استعلام كرة القدم بشكل واسع
  const isSports = isFootballQuery(query) ||
    (ctx.intent?.intent || '').startsWith('SPORTS') ||
    (ctx.entities?.teams?.length > 0) ||
    (ctx.entities?.players?.length > 0)

  if (isSports) {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const footballCtx = await buildFootballContext(query, today)
      if (footballCtx?.content) {
        ctx.systemBlock =
          ctx.systemBlock +
          '\n\n━━━ ⚽ بيانات كرة القدم المباشرة ━━━\n' +
          `📡 المصادر: **365score** (أولوية) + **كووورة** ← FotMob ← SofaScore\n\n` +
          footballCtx.content
        ctx.footballData = footballCtx
      }
    } catch (err) {
      console.warn('[Pipeline:sports] football context failed:', err.message)
    }
  }

  return ctx
}
