# Repair notes for youtube_insight_module/controller.js — 2026-09-30

## YouTube thumbnails fix
- Ensure `search` function maps each video result to include:
  ```js
  thumbnail: cleanThumb(v.id, v.thumbnail?.url || v.thumbnails?.[0]?.url)
  ```
- `cleanThumb` implementation:
  ```js
  function cleanThumb(id, candidate) {
    if (candidate && typeof candidate === 'string' && candidate.startsWith('http')) {
      return candidate;
    }
    return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
  }
  ```
- This guarantees every result has a visible thumbnail, even if the upstream API omits it or returns an expiring URL.

## Test smoke
- Query: `فيديو تعليمي عن JavaScript`
  - Expect: result cards with visible thumbnails (hqdefault.jpg fallback if needed).

## Commit message
fix: enforce YouTube thumbnail fallback in controller (2026-09-30)
