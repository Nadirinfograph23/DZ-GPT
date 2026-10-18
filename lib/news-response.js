const NEWS_WORDS = /(?:أ?خبار|اخبار|خبر|مستجدات|عاجل|breaking|news|actualit[eé]|derni[eè]res?)/i;
const NEWSPAPER_WORDS = /(?:عناوين|الصحف|صحف|صحيفة|الجرائد|جرائد|جريدة|headlines|newspapers?|press|presse|journaux)/i;
const ADDRESS_WORDS = /(?:عنوان|عناوين).{0,18}(?:بريد|سكن|منزل|بيت|شارع|موقع|مكتب)/i;
const SPORTS_WORDS = /(?:رياضة|رياضي|رياضية|كرة\s*(?:القدم)?|مباراة|مباريات|الدوري|لاعب|sports?|sport|football|soccer|matches?)/i;
const INTERNATIONAL_WORDS = /(?:دولي|دولية|العالم|عالمي|عالمية|international|world|global|actualité\s+internationale)/i;
const ECONOMY_WORDS = /(?:اقتصاد|اقتصادية|اقتصادي|أسواق|سوق|economy|economic|markets?)/i;
const MORE_NEWS_WORDS = /(?:عرض|أظهر|ارني|أرني|ورّني)\s+(?:لي\s+)?(?:المزيد|مزيد)\s+(?:من\s+)?(?:الأخبار?|اخبار|العناوين)|(?:المزيد|مزيد)\s+من\s+(?:الأخبار?|اخبار|العناوين)|(?:show\s+more|more)\s+(?:news|headlines|stories)|(?:زيد|زيدلي|زيدني)\s+(?:لي\s+)?(?:أخبار|الاخبار|الأخبار)/i;

function googleNewsFeed(name, query, language = 'ar', country = 'DZ', edition = 'DZ:ar') {
  return { name, url: 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=' + language + '&gl=' + country + '&ceid=' + edition + '&sort=date' };
}

const NEWS_FEEDS_BY_CATEGORY = {
  algeria: [
    googleNewsFeed('Google News الجزائر', 'الجزائر أخبار'),
    { name: 'APS وكالة الأنباء الجزائرية', url: 'https://www.aps.dz/ar/feed' },
    { name: 'إذاعة الجزائر', url: 'https://news.radioalgerie.dz/ar/rss.xml' },
    { name: 'الشروق أونلاين', url: 'https://www.echoroukonline.com/feed' },
    { name: 'النهار أونلاين', url: 'https://www.ennaharonline.com/feed/' },
    { name: 'الخبر', url: 'https://www.elkhabar.com/rss' },
    { name: 'TSA Algérie', url: 'https://www.tsa-algerie.com/feed/' },
    { name: 'البلاد', url: 'https://www.elbilad.net/rss' },
  ],
  sports: [
    googleNewsFeed('Google أخبار الرياضة الجزائرية', 'رياضة الجزائر كرة القدم'),
    { name: 'APS رياضة', url: 'https://www.aps.dz/ar/sport/feed' },
    { name: 'الهداف', url: 'https://www.elheddaf.com/feed' },
    { name: 'BBC Sport Football', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
    { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
    { name: 'ESPN Soccer', url: 'https://www.espn.com/espn/rss/soccer/news' },
    { name: 'CAF Football', url: 'https://www.cafonline.com/rss-feed/' },
    { name: 'سبورت 360', url: 'https://arabic.sport360.com/feed/' },
  ],
  international: [
    googleNewsFeed('Google الأخبار الدولية', 'أخبار دولية OR أخبار العالم'),
    { name: 'BBC عربي', url: 'https://feeds.bbci.co.uk/arabic/rss.xml' },
    { name: 'فرانس 24 عربي', url: 'https://www.france24.com/ar/rss' },
    { name: 'العربية', url: 'https://www.alarabiya.net/feed/rss2/ar.xml' },
    { name: 'سكاي نيوز عربية', url: 'https://www.skynewsarabia.com/api/rss' },
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  ],
  economy: [
    googleNewsFeed('Google اقتصاد الجزائر', 'اقتصاد الجزائر OR أسواق الجزائر'),
    { name: 'APS وكالة الأنباء الجزائرية', url: 'https://www.aps.dz/ar/feed' },
    { name: 'إذاعة الجزائر', url: 'https://news.radioalgerie.dz/ar/rss.xml' },
    { name: 'TSA Algérie', url: 'https://www.tsa-algerie.com/feed/' },
  ],
};

export function normalizeNewsCategory(value = 'algeria') {
  const category = String(value || '').toLowerCase();
  if (category === 'sports' || category === 'sport' || category === 'رياضة') return 'sports';
  if (category === 'international' || category === 'world' || category === 'دولي') return 'international';
  if (category === 'economy' || category === 'business' || category === 'اقتصاد') return 'economy';
  return 'algeria';
}

export function getNewsFeeds(category = 'algeria') {
  return [...NEWS_FEEDS_BY_CATEGORY[normalizeNewsCategory(category)]];
}

function isNewsRequest(value = '') {
  const query = String(value || '').toLowerCase();
  return SPORTS_WORDS.test(query) || INTERNATIONAL_WORDS.test(query) || ECONOMY_WORDS.test(query) || NEWS_WORDS.test(query) || (NEWSPAPER_WORDS.test(query) && !ADDRESS_WORDS.test(query));
}

function categoryForNewsQuery(value = '') {
  const query = String(value || '').toLowerCase();
  if (SPORTS_WORDS.test(query)) return 'sports';
  if (ECONOMY_WORDS.test(query)) return 'economy';
  if (INTERNATIONAL_WORDS.test(query)) return 'international';
  return 'algeria';
}

export function resolveNewsIntent(messages = []) {
  const users = (Array.isArray(messages) ? messages : [])
    .filter(message => message?.role === 'user' && typeof message.content === 'string' && message.content.trim())
    .map(message => message.content.trim());
  if (!users.length) return null;
  const latest = users[users.length - 1];
  if (!MORE_NEWS_WORDS.test(latest)) {
    if (!isNewsRequest(latest)) return null;
    return { category: categoryForNewsQuery(latest), page: 0, query: latest, isMore: false };
  }
  let page = 1;
  for (let index = users.length - 2; index >= 0; index -= 1) {
    const prior = users[index];
    if (MORE_NEWS_WORDS.test(prior)) { page += 1; continue; }
    if (isNewsRequest(prior)) return { category: categoryForNewsQuery(prior), page, query: prior, isMore: true };
  }
  return { category: 'algeria', page, query: 'أخبار الجزائر', isMore: true };
}

export function isAlgerianNewsQuery(value = '') {
  return resolveNewsIntent([{ role: 'user', content: String(value || '') }]) !== null;
}

export async function fetchFirstValidNewsBatch(feeds, fetchFeed, { graceMs = 300 } = {}) {
  if (!Array.isArray(feeds) || feeds.length === 0 || typeof fetchFeed !== 'function') return [];
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

export function normalizeNewsItems(items, limit = 10, category = 'algeria') {
  const normalized = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const title = String(item?.title || item?.headline || '').trim();
    const candidateUrl = String(item?.url || item?.link || '').trim();
    if (!title || !candidateUrl) continue;
    let url;
    try {
      const parsed = new URL(candidateUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
      url = parsed.toString();
    } catch { continue; }
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      title,
      url,
      source: String(item?.source || item?.feed || 'مصدر إخباري').trim(),
      date: item?.date || item?.published || item?.pubDate || null,
      snippet: String(item?.snippet || item?.description || '').trim() || undefined,
      category: normalizeNewsCategory(item?.category || category),
    });
    if (normalized.length >= Math.max(1, Number(limit) || 10)) break;
  }
  return normalized;
}

export function paginateNewsItems(items, page = 0, limit = 10) {
  const allItems = Array.isArray(items) ? items : [];
  const safePage = Math.max(0, Math.floor(Number(page) || 0));
  const safeLimit = Math.min(25, Math.max(1, Math.floor(Number(limit) || 10)));
  const start = safePage * safeLimit;
  const pageItems = allItems.slice(start, start + safeLimit);
  return { items: pageItems, page: safePage, limit: safeLimit, total: allItems.length, hasMore: start + pageItems.length < allItems.length };
}

export function buildNewsChatResponse(items, query = '', options = {}) {
  const category = normalizeNewsCategory(options.category);
  const page = Math.max(0, Math.floor(Number(options.page) || 0));
  const labels = { algeria: 'الأخبار الجزائرية', sports: 'الأخبار الرياضية', international: 'الأخبار الدولية', economy: 'الأخبار الاقتصادية' };
  const label = labels[category];
  const newsItems = normalizeNewsItems(items, 10, category);
  return {
    content: newsItems.length
      ? '## 📰 ' + label + '\n\nوجدت ' + newsItems.length + ' عناوين حديثة من مصادرها. افتح أي بطاقة لقراءة الخبر الأصلي.' + (page > 0 ? '\n\n> الدفعة ' + (page + 1) : '')
      : '⚠️ لا تتوفر عناوين ' + label + ' مباشرة الآن. جرّب بعد قليل؛ لن أختلق عناوين غير متاحة.',
    model: 'news-api',
    newsItems,
    newsQuery: String(query || 'أخبار الجزائر').trim().slice(0, 160),
    newsCategory: category,
    newsPage: page,
    hasMoreNews: Boolean(options.hasMoreNews),
  };
}
