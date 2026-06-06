/**
 * DZ-GPT — Crawl4AI Content Extractor
 * ⚠️ معطّل مؤقتاً — حتى إشعار لاحق
 *
 * السبب: تعارض مع SearXNG وتسبّب في فشل إجابات الأخبار الحالية.
 * يُبقى الملف بنفس الواجهة (exports) لتجنب أخطاء الاستيراد.
 * جميع الدوال ترجع null فوراً بدون أي طلب شبكي.
 */

const DISABLED = true

/**
 * extractContent — معطّلة مؤقتاً
 */
export async function extractContent(url) {
  if (DISABLED) return null
  return null
}

/**
 * extractMultiple — معطّلة مؤقتاً
 */
export async function extractMultiple(urls = [], max = 3) {
  if (DISABLED) return null
  return null
}

/**
 * extractForPerson — معطّلة مؤقتاً
 */
export async function extractForPerson(urls = []) {
  if (DISABLED) return null
  return null
}
