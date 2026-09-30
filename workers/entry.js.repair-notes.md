# Repair notes for workers/entry.js — 2026-09-30

## Doctor search (Annaba – dentist) fix
- Ensure Worker response for doctor searches includes:
  - `richType: 'doctor-results'`
  - `doctors: [{ name, specialty, city, address, phone, sourceUrl, googleMapsUrl }, ...]`
  - `dirs: [{ name, url }, ...]` (sahadoc, algerie-docto, addalile, salim-dz, pj-dz, docteur360, sihhatech, machrou3, beesiha, altibbi)
  - `metadata: { specialty, city, cache, gps }`
- Add `googleMapsUrl` for each doctor: `https://www.google.com/maps/search/?api=1&query=<encoded_address_city_Algeria>`
- Keep existing Markdown fallback text for backward compatibility.

## YouTube thumbnails fix
- Ensure every YouTube result object includes:
  - `thumbnail: cleanThumb(id, candidate)` where `cleanThumb` returns:
    - The candidate URL if valid and starting with `http`
    - Otherwise: `https://i.ytimg.com/vi/<ID>/hqdefault.jpg`

## Files to modify
- `workers/entry.js`: add `googleMapsUrl` helper, enforce structured doctor payload, enforce thumbnail fallback.
- `modules/youtube_insight_module/controller.js`: ensure `cleanThumb` is used and always returns a valid URL.
- `src/components/DoctorResultsPanel.tsx`: ensure each doctor card renders a clickable address opening Google Maps.

## Test smoke
- Query: `طبيب أسنان في عنابة`
  - Expect: interactive doctor table with ≥3 doctors, each with name, specialty, address, and a Maps link.
- Query: `فيديو تعليمي عن JavaScript`
  - Expect: YouTube result cards with visible thumbnails (hqdefault.jpg fallback if needed).

## Commit message
fix: doctor search structured payload + YouTube thumbnail fallback (2026-09-30)
