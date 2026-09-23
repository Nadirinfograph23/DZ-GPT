// Cloudflare Workers compatibility adapter for youtube-sr.
// youtube-sr itself depends on Node-only networking, so the Worker uses
// a fetch-based YouTube search provider instead. The returned shape matches
// the subset consumed by modules/youtube_insight_module/controller.js.

const INSTANCES = [
  'https://iv.ggtyler.dev',
  'https://invidious.materialio.us',
  'https://invidious.protokolla.fi',
  'https://invidious.lunar.icu',
];

async function search(query, options = {}) {
  const limit = Math.min(Number(options.limit) || 8, 12);
  const encoded = encodeURIComponent(String(query || '').trim());
  if (!encoded) return [];

  for (const base of INSTANCES) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const response = await fetch(
        `${base}/api/v1/search?q=${encoded}&type=video&page=1`,
        {
          signal: ctrl.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'DZ-Agent/2.1',
          },
        },
      );
      clearTimeout(timer);
      if (!response.ok) continue;
      const data = await response.json().catch(() => null);
      if (!Array.isArray(data) || !data.length) continue;

      return data.slice(0, limit).map((video) => ({
        id: video.videoId || '',
        title: video.title || '',
        description: video.description || '',
        duration: Number(video.lengthSeconds || 0) * 1000,
        views: Number(video.viewCount || 0),
        channel: { name: video.author || '' },
        thumbnail: {
          url: video.videoThumbnails?.[0]?.url || '',
        },
        thumbnails: (video.videoThumbnails || []).map((t) => ({ url: t.url })),
      })).filter((video) => video.id && video.title);
    } catch (error) {
      console.warn('[youtube-sr worker adapter] provider failed:', error?.message || error);
    }
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
