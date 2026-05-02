/**
 * algeria-knowledge-system — Smart Search Engine
 * Matches user queries against ALGERIA_DB using keyword scoring.
 * Returns the best match or null if confidence is too low.
 */

import { ALGERIA_DB } from './data.js'

/**
 * Normalize Arabic text: remove diacritics, normalize alef forms, lowercase.
 */
function normalize(text) {
  if (!text) return ''
  return text
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, '')           // strip tashkeel
    .replace(/[أإآا]/g, 'ا')                   // normalize alef
    .replace(/ة/g, 'ه')                        // ta marbuta → ha
    .replace(/ى/g, 'ي')                        // alef maqsura → ya
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ') // keep Arabic + latin + digits
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Score a single DB entry against a query.
 * Returns a numeric confidence score (0 = no match).
 */
function scoreEntry(entry, query) {
  const q = normalize(query)
  let score = 0

  for (const kw of entry.keywords) {
    const nkw = normalize(kw)
    if (q.includes(nkw)) {
      // Longer keyword match = higher confidence
      score += nkw.split(' ').length * 10
    } else {
      // Partial word overlap
      const kwWords = nkw.split(' ')
      for (const word of kwWords) {
        if (word.length >= 3 && q.includes(word)) {
          score += 3
        }
      }
    }
  }

  return score
}

/**
 * Search the Algeria knowledge base.
 * Returns { match, score, isAlgeriaQuery } or null.
 */
export function searchAlgeria(query) {
  if (!query || typeof query !== 'string') return null

  let best = null
  let bestScore = 0

  for (const entry of ALGERIA_DB) {
    const score = scoreEntry(entry, query)
    if (score > bestScore) {
      bestScore = score
      best = entry
    }
  }

  // Minimum confidence threshold = 10 (at least one full keyword match)
  if (bestScore < 10) return null

  return { match: best, score: bestScore }
}

/**
 * Detect if this is an Algerian citizen query worth routing.
 * Uses fast keyword scan without scoring.
 */
export function isAlgerianCitizenQuery(query) {
  if (!query) return false
  const q = normalize(query)

  const CITIZEN_TRIGGERS = [
    // Exam results
    'نتائج', 'نتيجة', 'باك', 'بكالوريا', 'بيام', 'bem', 'bac', 'ابتدائي', 'onec',
    // Docs
    'جواز سفر', 'بطاقة تعريف', 'شهادة ميلاد', 'شهادة اقامه', 'سوابق',
    // Housing
    'aadl', 'اادل', 'سكن تساهمي', 'سكن اجتماعي', 'cnl', 'opgi',
    // Employment
    'anem', 'انيم', 'عروض عمل', 'بحث عن عمل', 'توظيف', 'بطاله',
    // Services
    'بريد الجزائر', 'ccp', 'سونلغاز', 'فاتورة', 'اتصالات الجزائر',
    // Law
    'جريدة رسمية', 'قانون جزائري', 'مرسوم', 'joradp',
    // Health
    'cnas', 'casnos', 'تامين صحي',
    // Seasonal
    'اضحيتي', 'adhiyati', 'قرعة الحج',
    // Transport
    'air algerie', 'sntf', 'رخصة السياقة',
    // Government
    'el mouradia', 'apn', 'وزارة',
    // Keywords that signal Algerian context
    'الجزائر', 'جزائر', 'ولاية', 'دائرة', 'بلدية', 'الجزائري',
  ]

  return CITIZEN_TRIGGERS.some(trigger => q.includes(normalize(trigger)))
}

/**
 * Format a matched entry into a clean response string.
 */
export function formatAlgeriaResponse(result) {
  const { match } = result

  let text = match.answer

  // Append step-by-step if available
  if (match.steps && match.steps.length > 0) {
    text += '\n\n**📋 الخطوات:**\n'
    match.steps.forEach((step, i) => {
      text += `${i + 1}. ${step}\n`
    })
  }

  return text
}

/**
 * Fallback message when no match is found but query seems Algerian.
 */
export function algeriaFallbackMessage(query) {
  return `لم أجد معلومات دقيقة حول **"${query.slice(0, 60)}"**.\n\nيمكنك الرجوع إلى المصادر الرسمية:\n- 🏛️ [الجريدة الرسمية](https://www.joradp.dz/)\n- 🏢 [وزارة الداخلية](https://www.interieur.gov.dz/)\n- 📋 [البوابة الجزائرية للخدمات](https://www.interieur.gov.dz/)`
}
