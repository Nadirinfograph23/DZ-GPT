// DZ AGENT V4 PRO — prompt translator
// Detects Arabic / French prompts and translates them to English before
// they hit FLUX.1-schnell (which is English-only). Reuses the host's free
// LLM chain (DeepSeek → Ollama → Groq) via the injected `aiGenerate`.
//
// Pure-additive: no new dependencies, never throws — falls back to the
// original prompt on any failure so the image engine still runs.

const CACHE = new Map() // key: `${lang}::${prompt}` → english
const CACHE_MAX = 200

// Heuristics — fast, no LLM call needed for detection.
function detectLanguage(text) {
  if (!text) return 'en'
  // Arabic block (covers MSA, Darija written in Arabic letters).
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) return 'ar'
  // French: accented letters OR common stop-words. Order matters: we only
  // mark it as `fr` when there are no Arabic chars (already returned above).
  const lower = text.toLowerCase()
  const accented = /[àâäéèêëïîôöùûüÿçœæ]/i.test(text)
  const frWords = /\b(le|la|les|une?|des?|du|au|aux|et|est|dans|avec|pour|sur|sous|chat|chien|chien|maison|montagne|coucher|soleil|fleur|forêt|plage|enfant|femme|homme|grand|petit|rouge|bleu|vert|noir|blanc)\b/i
  if (accented || frWords.test(lower)) {
    // Don't false-positive on plain English text containing words like "le" inside.
    const englishHits = (lower.match(/\b(the|and|with|for|on|in|of|a|an|is|are|was|were|cat|dog|house|mountain|sunset|flower|forest|beach|child|woman|man|big|small|red|blue|green|black|white)\b/g) || []).length
    const frenchHits = (lower.match(frWords) || []).length + (accented ? 2 : 0)
    if (frenchHits > englishHits) return 'fr'
  }
  return 'en'
}

function cachePut(key, val) {
  if (CACHE.size >= CACHE_MAX) {
    const first = CACHE.keys().next().value
    if (first) CACHE.delete(first)
  }
  CACHE.set(key, val)
}

function stripQuotes(s) {
  return s.replace(/^["'`«»“”\s]+|["'`«»“”\s]+$/g, '').trim()
}

// Translate `prompt` to English when it's Arabic or French.
// Returns { english, original, language, translated: boolean }.
export async function translateForImage({ aiGenerate, prompt }) {
  const original = String(prompt || '').trim()
  const language = detectLanguage(original)

  if (language === 'en' || !original) {
    return { english: original, original, language: 'en', translated: false }
  }
  if (typeof aiGenerate !== 'function') {
    return { english: original, original, language, translated: false }
  }

  const key = `${language}::${original}`
  if (CACHE.has(key)) {
    return { english: CACHE.get(key), original, language, translated: true, cached: true }
  }

  const sys = language === 'ar'
    ? 'You translate Arabic image-generation prompts into a single concise English sentence. Keep concrete visual details (subject, scene, style, lighting, colours). Do NOT add extra ideas. Output ONLY the English sentence — no quotes, no preamble, no explanation.'
    : 'You translate French image-generation prompts into a single concise English sentence. Keep concrete visual details (subject, scene, style, lighting, colours). Do NOT add extra ideas. Output ONLY the English sentence — no quotes, no preamble, no explanation.'

  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 12_000)
    let raw
    try {
      raw = await aiGenerate({
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: original },
        ],
        query: original,
        max_tokens: 200,
      })
    } finally { clearTimeout(timer) }

    // `aiGenerate` may return a string or { content }/{ text }/{ message: { content } }
    const text = stripQuotes(
      typeof raw === 'string'
        ? raw
        : (raw?.content || raw?.text || raw?.message?.content || raw?.choices?.[0]?.message?.content || '')
    )
    // Reject obvious failures: empty, still Arabic/French-heavy, or way too long.
    if (!text || text.length > 600 || detectLanguage(text) === language) {
      return { english: original, original, language, translated: false }
    }
    cachePut(key, text)
    return { english: text, original, language, translated: true }
  } catch {
    return { english: original, original, language, translated: false }
  }
}

export { detectLanguage }
