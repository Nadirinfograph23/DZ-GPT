/**
 * DZ Proverbs Engine v1.0
 * ═══════════════════════════════════════════════════════════════════════
 * كشف طلبات الحِكم والأمثال الجزائرية — استرجاع مباشر من البيانات المحلية
 * بدون LLM — 100% بيانات جزائرية أصيلة
 * ═══════════════════════════════════════════════════════════════════════
 */

import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(__dirname, '..', 'data', 'dz_proverbs.json')

let _cachedData = null
async function loadData() {
  if (_cachedData) return _cachedData
  const raw = await readFile(DATA_PATH, 'utf8')
  _cachedData = JSON.parse(raw)
  return _cachedData
}

// ─── Regex للكشف السريع ───────────────────────────────────────────────────
const PROVERB_PATTERN = new RegExp(
  '(' +
  [
    // طلب مثل
    'مثل جزائر', 'أمثال جزائر', 'امثال جزائر', 'مثل شعبي', 'أمثال شعبية', 'مثل دارجة',
    'مثل من الجزائر', 'مثل جزائري', 'أمثال جزائرية', 'امثال جزائرية',
    'مثلاً جزائرياً', 'مثلا جزائريا', 'مثل جزائري',
    'أعطني مثل', 'أعطيني مثل', 'عطيني مثل', 'عطني مثل',
    'جيبلي مثل', 'قولي مثل', 'ذكر لي مثل', 'اذكر مثل',
    // طلب حكمة
    'حكمة جزائر', 'حِكم جزائر', 'حكم جزائر', 'حكمة جزائرية', 'حِكم جزائرية',
    'حكمة شعبية', 'حكم شعبية', 'قول جزائري', 'أقوال جزائرية',
    'حكمة من الجزائر', 'اعطيني حكمة', 'قولي حكمة',
    'أعطني حكمة', 'أعطيني حكمة', 'عطيني حكمة', 'عطني حكمة',
    'جيبلي حكمة', 'ذكر لي حكمة', 'اذكر حكمة',
    // بالدارجة
    'مثل دزيري', 'قولة جزائرية', 'قولة دزيرية',
    'عندك مثل', 'عندك حكمة',
    'واش عندك مثل', 'واش عندك حكمة',
    // بالفرنسية
    'proverbe algérien', 'proverbe algerie', 'dicton algérien',
    'sagesse algérienne', 'proverbe dz', 'proverbe kabyle',
  ].map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
  ')',
  'i'
)

/**
 * isProverbQuery — هل يطلب المستخدم حكمة أو مثلاً جزائرياً؟
 */
export function isProverbQuery(msg) {
  return PROVERB_PATTERN.test(String(msg || ''))
}

/**
 * getProverbs — استرجاع أمثال/حِكم جزائرية مع دعم الفلترة
 * @param {string} query   — طلب المستخدم
 * @param {object} opts
 * @param {number} opts.count — عدد الأمثال المطلوبة (افتراضي 5)
 * @param {string} opts.type  — 'amthal' | 'hikam' | 'darija' | 'auto'
 */
export async function getProverbs(query = '', { count = 5, type = 'auto' } = {}) {
  const data = await loadData()

  const q = query.toLowerCase()

  // تحديد النوع تلقائياً من الطلب
  let resolvedType = type
  if (type === 'auto') {
    if (/حكمة|حِكم|حكم|sagesse|sagesse/i.test(query)) resolvedType = 'hikam'
    else if (/دارجة|darija|قولة/i.test(query)) resolvedType = 'darija'
    else resolvedType = 'all'
  }

  // جمع النتائج حسب النوع
  let pool = []
  if (resolvedType === 'hikam') {
    pool = [...(data.hikam || [])]
  } else if (resolvedType === 'darija') {
    pool = [...(data.darija_sayings || [])]
  } else if (resolvedType === 'amthal') {
    pool = [...(data.amthal || [])]
  } else {
    pool = [
      ...(data.amthal || []),
      ...(data.hikam || []),
      ...(data.darija_sayings || []),
    ]
  }

  // فلترة بالموضوع إذا ذُكر (صبر، صداقة، عمل...)
  const TOPIC_MAP = {
    'صبر': 'صبر', 'patience': 'صبر',
    'صداقة': 'صداقة', 'amitié': 'صداقة', 'صديق': 'صداقة',
    'عمل': 'عمل', 'travail': 'عمل',
    'علم': 'علم', 'savoir': 'علم',
    'أم': 'أم', 'mère': 'أم',
    'وقت': 'وقت', 'temps': 'وقت',
    'حب': 'حب', 'amour': 'حب',
    'صدق': 'صدق', 'kذب': 'كذب',
  }
  let matched = null
  for (const [kw, tag] of Object.entries(TOPIC_MAP)) {
    if (q.includes(kw)) { matched = tag; break }
  }

  let filtered = matched
    ? pool.filter(p => (p.tags || []).includes(matched))
    : pool

  // إذا لم توجد نتائج بالفلتر، نعود للكامل
  if (!filtered.length) filtered = pool

  // خلط عشوائي للتنوع
  for (let i = filtered.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filtered[i], filtered[j]] = [filtered[j], filtered[i]]
  }

  return filtered.slice(0, count)
}

/**
 * formatProverbsResponse — تنسيق الأمثال للعرض في المحادثة
 */
export function formatProverbsResponse(proverbs, query = '') {
  if (!proverbs || !proverbs.length) {
    return 'لم أجد أمثالاً مطابقة في قاعدة بياناتي الجزائرية. 🤔'
  }

  const isHikam = /حكمة|حِكم|حكم/i.test(query)
  const title = isHikam ? '💡 حِكم جزائرية أصيلة' : '📜 أمثال جزائرية شعبية'

  const lines = [`## ${title}\n`]

  proverbs.forEach((p, i) => {
    lines.push(`### ${i + 1}. **${p.dz}**`)
    if (p.ar && p.ar !== p.dz) {
      lines.push(`> 📖 *${p.ar}*`)
    }
    if (p.fr) {
      lines.push(`> 🇫🇷 *${p.fr}*`)
    }
    if (p.tags && p.tags.length) {
      lines.push(`🏷️ ${p.tags.join(' • ')}`)
    }
    lines.push('')
  })

  lines.push('---')
  lines.push('*📚 مصدر: بيانات الأمثال الجزائرية الشعبية — DZ AGENT*')

  return lines.join('\n')
}
