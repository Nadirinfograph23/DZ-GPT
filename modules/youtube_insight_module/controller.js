// modules/youtube_insight_module/controller.js — repaired 2026-09-30
// Ensures every YouTube result has a stable thumbnail URL.

// Stable thumbnail fallback helper
function cleanThumb(id, candidate) {
  if (candidate && typeof candidate === 'string' && candidate.startsWith('http')) {
    return candidate;
  }
  return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
}

export async function handleYouTubeSearch(query, options = {}) {
  const { limit = 10 } = options;
  // Assume YouTube.search exists and returns raw results with id, title, thumbnail, duration, etc.
  const raw = await YouTube.search(query, { limit, type: 'video', safeSearch: false });

  const mapped = (Array.isArray(raw) ? raw : []).map(v => ({
    id: v.id,
    title: v.title || 'بدون عنوان',
    url: `https://www.youtube.com/watch?v=${v.id}`,
    thumbnail: cleanThumb(v.id, v.thumbnail?.url || v.thumbnails?.[0]?.url),
    duration: v.duration ? Math.floor(v.duration / 1000) : 0,
    description: v.description || '',
    views: Number(v.views) || 0
  }));

  return {
    results: mapped,
    query,
    count: mapped.length
  };
}

// ... [rest of existing controller code remains unchanged] ...
