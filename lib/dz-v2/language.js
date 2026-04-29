// DZ Agent V2 — Language detection layer.
// Lightweight AR / FR / EN auto-detection. Returns a canonical code plus
// helper utilities for system-prompt language hints. Pure heuristics, no
// dependencies, < 1ms per call.

const AR_RANGE = /[\u0600-\u06FF]/
const FR_HINTS = /\b(le|la|les|un|une|des|de|du|et|est|pour|avec|dans|que|qui|comment|pourquoi|où|j['']ai|c['']est|n['']est|s['']il|t['']es)\b|[àâçéèêëîïôûùü]/i
const EN_HINTS = /\b(the|and|for|with|that|this|what|how|why|where|when|please|build|create|fix|generate|website|app|code|api)\b/i

export function detectLanguage(text = '') {
  const s = String(text || '').trim()
  if (!s) return 'ar' // default to Arabic for DZ users
  const arabicChars = (s.match(/[\u0600-\u06FF]/g) || []).length
  const totalChars = s.replace(/\s/g, '').length || 1
  const arabicRatio = arabicChars / totalChars
  if (arabicRatio > 0.25) return 'ar'
  const fr = FR_HINTS.test(s)
  const en = EN_HINTS.test(s)
  if (fr && !en) return 'fr'
  if (en && !fr) return 'en'
  if (fr && en) {
    // Tie-breaker by accented chars
    return /[àâçéèêëîïôûùü]/i.test(s) ? 'fr' : 'en'
  }
  return 'en'
}

export function languageInstruction(lang) {
  switch (lang) {
    case 'ar': return 'يجب أن تجيب باللغة العربية الفصحى بأسلوب طبيعي وواضح.'
    case 'fr': return 'Réponds en français de façon claire, naturelle et structurée.'
    case 'en':
    default:   return 'Respond in clear, natural, well-structured English.'
  }
}

export function languageLabel(lang) {
  return { ar: 'Arabic', fr: 'French', en: 'English' }[lang] || 'English'
}
