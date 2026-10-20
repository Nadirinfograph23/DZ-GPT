import crypto from 'node:crypto'

const CACHE_MAX = 300
const CACHE_TTL_MS = 4 * 60 * 60 * 1000
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length
}

// Return a source-language code only when there is a useful signal that the
// prompt is not English. Common non-Latin scripts and Algerian Franco-Darija
// are routed through the same translation chain as Arabic and French.
export function sourceLanguageForImage(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (ARABIC_SCRIPT.test(text)) return 'ar'
  if (/[\u3040-\u30FF]/.test(text)) return 'ja'
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'
  if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(text)) return 'zh'
  if (/[\u0400-\u052F]/.test(text)) return /[іїєґ]/i.test(text) ? 'uk' : 'ru'
  if (/[\u0900-\u097F]/.test(text)) return 'hi'
  if (/[\u0980-\u09FF]/.test(text)) return 'bn'
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta'
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th'
  if (/[\u0590-\u05FF]/.test(text)) return 'he'
  if (/[\u0370-\u03FF]/.test(text)) return 'el'
  if (/[\u0530-\u058F]/.test(text)) return 'hy'
  if (/[\u10A0-\u10FF]/.test(text)) return 'ka'

  const lower = text.toLowerCase()
  const darijaWords = /\b(rani|rana|nheb|n7eb|bghit|wesh|wach|kifach|bezaf|bzaaf|mli7|mlih|ta3|t3|3la|m3a|win|wayen|kayn|kayen|hada|hadi|rah|raha|nchallah|saha|sah|dirli|3andek|3andi|nta|nti|rak|raki)\b/g
  if (countMatches(lower, darijaWords) >= 2 || /\b(rani|nheb|n7eb|bghit|kifach|wesh|wach)\b/.test(lower)) return 'ar-latn'

  const hasFrenchAccent = /[àâçéèêëîïôöùûüÿœæ]/i.test(text)
  const frenchWords = /\b(le|la|les|un|une|des|du|de|je|tu|il|elle|nous|vous|ils|elles|est|sont|avec|dans|sur|pour|au|aux|et|mon|ma|mes|noir|blanc|rouge|vert|beau|belle)\b/g
  const frenchHits = countMatches(lower, frenchWords)
  if (frenchHits >= 2 || (hasFrenchAccent && frenchHits >= 1) || /\b(une|avec|dans|sont|est|aux)\b/.test(lower)) return 'fr'

  const spanishWords = /\b(el|la|los|las|un|una|unos|unas|del|con|para|por|sobre|está|están|son|que|en|y|rojo|roja|negro|negra|blanco|blanca)\b/g
  const spanishHits = countMatches(lower, spanishWords)
  if (/[¿¡ñ]/i.test(text) || (/[áíóú]/i.test(text) && spanishHits >= 1) || spanishHits >= 2) return 'es'

  const portugueseWords = /\b(não|uma|umas|uns|dos|das|com|para|por|sobre|está|estão|são|em|que|do|da|vermelho|vermelha|preto|branco)\b/g
  const portugueseHits = countMatches(lower, portugueseWords)
  if (/[ãõ]/i.test(text) || /\b(não|são|estão)\b/.test(lower) || portugueseHits >= 2) return 'pt'

  const germanWords = /\b(der|die|das|und|mit|für|auf|ein|eine|einer|einem|von|ist|schwarz|weiß|rote|roter|einen)\b/g
  const germanHits = countMatches(lower, germanWords)
  if (/[äöüß]/i.test(text) || germanHits >= 2) return 'de'

  const italianWords = /\b(il|lo|gli|della|delle|che|sono|con|per|una|nel|sulla|questa|questo|rosso|rossa|nero|nera)\b/g
  const italianHits = countMatches(lower, italianWords)
  if (italianHits >= 2 || /\b(della|delle|gli|sulla)\b/.test(lower)) return 'it'

  const dutchWords = /\b(een|het|met|voor|van|op|naast|bij|naar|rode|zwarte|witte)\b/g
  if (countMatches(lower, dutchWords) >= 2) return 'nl'
  return null
}

function cleanTranslation(value) {
  const withoutThinking = String(value || '').replace(/<think>[\s\S]*?<\/think>/gi, '')
  const withoutCodeTicks = withoutThinking.split(String.fromCharCode(96)).join('')
  return withoutCodeTicks
    .replace(/^(?:english translation|english prompt|translation)\s*:\s*/i, '')
    .trim()
    .replace(/^["'«»“”\s]+|["'«»“”\s]+$/g, '')
    .trim()
}

function isUsableEnglish(value) {
  const candidate = cleanTranslation(value)
  if (!candidate || candidate.length > 1200) return false
  if (sourceLanguageForImage(candidate)) return false
  if (/^(sorry|i cannot|i can’t|i can't|unable to|translation unavailable|all ai providers|api key not configured)\b/i.test(candidate)) return false
  return true
}

export function createImagePromptTranslator({ staticMap = [], callGroqWithFallback, safeGenerateAI, fetchImpl = globalThis.fetch } = {}) {
  const cache = new Map()
  return async function translateImgPrompt(rawPrompt) {
    const original = String(rawPrompt || '').trim()
    const language = sourceLanguageForImage(original)
    if (!language || !original) return original

    const cacheKey = crypto.createHash('sha256').update(language + ':' + original).digest('hex')
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value
    if (cached) cache.delete(cacheKey)

    let translated = original
    if (language === 'ar') {
      for (const [source, target] of staticMap) translated = translated.split(source).join(target)
    }

    const messages = [
      { role: 'system', content: 'Translate the image-generation description from its original language into concise, natural English. It may be Arabic, Algerian Darija, French, or another language. Preserve every requested subject, action, location, color, count, composition, lighting, and style. Do not add objects or visual details, and do not omit requested details. Output only the English translation.' },
      { role: 'user', content: original },
    ]

    if (sourceLanguageForImage(translated) && typeof callGroqWithFallback === 'function') {
      try {
        const result = await callGroqWithFallback({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 300, temperature: 0.1 })
        if (isUsableEnglish(result?.content)) translated = cleanTranslation(result.content)
      } catch {}
    }

    // Use the application's established multilingual model chain before an
    // external translator; this keeps the existing providers and fallbacks.
    if (sourceLanguageForImage(translated) && typeof safeGenerateAI === 'function') {
      try {
        const result = await safeGenerateAI({ messages, query: original, max_tokens: 300, taskHint: 'multilingual' })
        if (isUsableEnglish(result?.content)) translated = cleanTranslation(result.content)
      } catch {}
    }

    // Keep MyMemory as the final fallback for a supported source-language code.
    if (sourceLanguageForImage(translated) && typeof fetchImpl === 'function') {
      const queryText = original.slice(0, 500)
      const sourceCode = language === 'ar-latn' ? 'ar' : language
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 7000)
      try {
        const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(queryText) + '&langpair=' + encodeURIComponent(sourceCode + '|en')
        const response = await fetchImpl(url, { signal: controller.signal })
        if (response.ok) {
          const data = await response.json()
          const candidate = cleanTranslation(data?.responseData?.translatedText)
          if (candidate.length > 3 && isUsableEnglish(candidate)) {
            const remainder = original.slice(queryText.length).trim()
            const combined = remainder ? candidate + ' ' + remainder : candidate
            if (!sourceLanguageForImage(combined)) translated = combined
          }
        }
      } catch {} finally {
        clearTimeout(timer)
      }
    }

    // Never cache a failed translation or send mixed-language text to an
    // English-only image model. The existing route converts this into a clear 503.
    if (!sourceLanguageForImage(translated)) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
      cache.set(cacheKey, { value: translated, ts: Date.now() })
    }
    return translated
  }
}
