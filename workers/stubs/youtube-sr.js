// Cloudflare Workers compatibility adapter for youtube-sr.
// youtube-sr itself depends on Node-only networking, so the Worker uses
// a fetch-based YouTube search provider instead. The returned shape matches
// the subset consumed by modules/youtube_insight_module/controller.js.

const INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://yt.chocolatemoo53.com",
  "https://invidious.tiekoetter.com",
  "https://invidious.f5.si"
];

const PROVIDER_TIMEOUT_MS = 4500;
const TOTAL_TIMEOUT_MS = 9500;

function normalizeResults(data, limit) {
  if (!Array.isArray(data)) return [];
  return data.slice(0, limit).map((video) => ({
    id: video.videoId || video.id || '',
    title: String(video.title || '').trim(),
    description: video.description || '',
    duration: Number(video.lengthSeconds || 0) * 1000,
    views: Number(video.viewCount || video.views || 0),
    channel: { name: video.author || video.channel?.name || video.channel || '' },
    thumbnail: { url: video.videoThumbnails?.[0]?.url || video.thumbnail?.url || '' },
    thumbnails: (video.videoThumbnails || video.thumbnails || []).map((t) => ({ url: t.url || t })),
  })).filter((video) => /^[A-Za-z0-9_-]{11}$/.test(video.id) && video.title.length >= 2);
}

async function fetchJson(url, timeout = PROVIDER_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Accept': 'application/json,text/plain,*/*', 'User-Agent': 'Mozilla/5.0 (compatible; DZ-Agent/2.2)' },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function searchInvidiousProvider(query, limit) {
  const encoded = encodeURIComponent(query);
  const attempts = INSTANCES.map(async (base) => {
    const data = await fetchJson(base + '/api/v1/search?q=' + encoded + '&type=video&page=1');
    const results = normalizeResults(data, limit);
    if (!results.length) throw new Error('empty results');
    return results;
  });
  return Promise.any(attempts);
}

async function searchJinaProvider(query, limit) {
  const encoded = encodeURIComponent(query);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const response = await fetch(
      'https://r.jina.ai/https://www.youtube.com/results?search_query=' + encoded,
      { signal: ctrl.signal, headers: { 'Accept': 'text/plain,text/markdown,*/*', 'User-Agent': 'DZ-Agent/2.2' } },
    );
    if (!response.ok) throw new Error('Jina HTTP ' + response.status);
    const text = await response.text();
    const results = [];
    const seen = new Set();
    const re = /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/g;
    let m;
    while ((m = re.exec(text)) && results.length < limit) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      results.push({
        id: m[1], title: 'YouTube: ' + query, description: '', duration: 0, views: 0,
        channel: { name: '' },
        thumbnail: { url: 'https://i.ytimg.com/vi/' + m[1] + '/hqdefault.jpg' },
        thumbnails: [{ url: 'https://i.ytimg.com/vi/' + m[1] + '/hqdefault.jpg' }],
      });
    }
    if (!results.length) throw new Error('empty Jina results');
    return results;
  } finally {
    clearTimeout(timer);
  }
}

async function searchWebProvider(query, limit) {
  const encoded = encodeURIComponent('site:youtube.com/watch ' + query);
  const response = await fetch(
    'https://www.google.com/search?q=' + encoded + '&num=10&hl=ar',
    { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ar,en;q=0.8' }, signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error('Google HTTP ' + response.status);
  const html = await response.text();
  const results = [];
  const seen = new Set();
  const re = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/g;
  let m;
  while ((m = re.exec(html)) && results.length < limit) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    results.push({
      id: m[1], title: 'YouTube: ' + query, description: '', duration: 0, views: 0,
      channel: { name: '' },
      thumbnail: { url: 'https://i.ytimg.com/vi/' + m[1] + '/hqdefault.jpg' },
      thumbnails: [{ url: 'https://i.ytimg.com/vi/' + m[1] + '/hqdefault.jpg' }],
    });
  }
  if (!results.length) throw new Error('empty web results');
  return results;
}

async function search(query, options = {}) {
  const limit = Math.min(Number(options.limit) || 8, 12);
  const q = String(query || '').trim();
  if (!q) return [];

  const providers = [
    () => searchInvidiousProvider(q, limit),
    () => searchJinaProvider(q, limit),
    () => searchWebProvider(q, limit),
  ];

  const deadline = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('youtube search deadline exceeded')), TOTAL_TIMEOUT_MS)
  );

  try {
    const results = await Promise.race([Promise.any(providers.map((fn) => fn())), deadline]);
    if (Array.isArray(results) && results.length) {
      console.log('[youtube-sr worker adapter] search OK: ' + results.length + ' results for "' + q + '"');
      return results;
    }
  } catch (error) {
    console.warn('[youtube-sr worker adapter] all providers failed:', error?.message || error);
  }
  return [];
}

const YouTube = {
  search,
  getVideo: async () => {
    throw new Error('youtube-sr getVideo is not available in Cloudflare Workers');
  },
};

export { YouTube };
export default YouTube;
