export function isAlgerianNewsQuery(value = "") {
  const query = String(value || "").toLowerCase();
  const newsWords = /(?:أ?خبار|اخبار|خبر|مستجدات|عاجل|breaking|news|actualit[eé]|derni[eè]res?)/i;
  const newspaperWords = /(?:عناوين|الصحف|صحف|صحيفة|الجرائد|جرائد|جريدة|headlines|newspapers?|press|presse|journaux)/i;
  const addressWords = /(?:عنوان|عناوين).{0,18}(?:بريد|سكن|منزل|بيت|شارع|موقع|مكتب)/i;
  return newsWords.test(query) || (newspaperWords.test(query) && !addressWords.test(query));
}

export async function fetchFirstValidNewsBatch(feeds, fetchFeed, { graceMs = 300 } = {}) {
  if (!Array.isArray(feeds) || feeds.length === 0 || typeof fetchFeed !== "function") return [];
  const received = [];
  let remaining = feeds.length;
  let firstSettled = false;
  let resolveFirst;
  const firstValid = new Promise(resolve => { resolveFirst = resolve; });
  const attempts = feeds.map(feed => Promise.resolve()
    .then(() => fetchFeed(feed))
    .then(items => {
      const validItems = Array.isArray(items) ? items : [];
      if (validItems.length) {
        received.push(...validItems);
        if (!firstSettled) { firstSettled = true; resolveFirst(true); }
      } else {
        remaining -= 1;
        if (remaining === 0 && !firstSettled) { firstSettled = true; resolveFirst(false); }
      }
    })
    .catch(() => {
      remaining -= 1;
      if (remaining === 0 && !firstSettled) { firstSettled = true; resolveFirst(false); }
    }));
  const hasValidItems = await firstValid;
  if (!hasValidItems) return [];
  if (graceMs > 0) {
    let timer;
    await Promise.race([
      Promise.all(attempts),
      new Promise(resolve => { timer = setTimeout(resolve, graceMs); }),
    ]);
    if (timer) clearTimeout(timer);
  }
  return received;
}

export function normalizeNewsItems(items, limit = 10) {
  const normalized = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const title = String(item?.title || item?.headline || "").trim();
    const candidateUrl = String(item?.url || item?.link || "").trim();
    if (!title || !candidateUrl) continue;
    let url;
    try {
      const parsed = new URL(candidateUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
      url = parsed.toString();
    } catch { continue; }
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      title,
      url,
      source: String(item?.source || item?.feed || "مصدر إخباري").trim(),
      date: item?.date || item?.published || item?.pubDate || null,
      snippet: String(item?.snippet || item?.description || "").trim() || undefined,
    });
    if (normalized.length >= Math.max(1, Number(limit) || 10)) break;
  }
  return normalized;
}

export function buildNewsChatResponse(items, query = "") {
  const newsItems = normalizeNewsItems(items, 10);
  return {
    content: newsItems.length
      ? "## 📰 آخر الأخبار الجزائرية\n\nوجدت " + newsItems.length + " عناوين حديثة من مصادرها. افتح أي بطاقة لقراءة الخبر الأصلي."
      : "⚠️ لا تتوفر عناوين أخبار مباشرة الآن. جرّب بعد قليل؛ لن أختلق عناوين غير متاحة.",
    model: "news-api",
    newsItems,
    newsQuery: String(query || "أخبار الجزائر").trim().slice(0, 160),
    hasMoreNews: false,
  };
}
