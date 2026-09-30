## Doctor search (Annaba – dentist) fix – 2026-09-30
- Problem: When selecting "طبيب أسنان في عنابة" in DZ Agent, the answer appeared empty or only showed Markdown without an interactive doctor table.
- Root cause: The Cloudflare Worker path (`workers/entry.js`) returned `doctorSearch: true` and Markdown, but omitted the structured payload (`richType: 'doctor-results'`, `doctors`, `dirs`, `metadata`) required by `DZChatBox`/`DoctorResultsPanel`.
- Fix:
  - Enforce structured doctor response in Worker: `richType: 'doctor-results'`, `doctors` array with `googleMapsUrl` per doctor, `dirs` (sahadoc, algerie-docto, addalile, salim-dz, pj-dz, docteur360, sihhatech, machrou3, beesiha, altibbi), and `metadata`.
  - Add `googleMapsUrl(address, city)` helper to generate `https://www.google.com/maps/search/?api=1&query=<encoded>` for each doctor.
  - Ensure `DoctorResultsPanel.tsx` renders clickable addresses opening Google Maps automatically.
- Files touched (repair notes added):
  - `workers/entry.js.repair-notes.md`
  - `src/components/DoctorResultsPanel.tsx.repair-notes.md`
- Test smoke: Query `طبيب أسنان في عنابة` → expect ≥3 doctors with names, addresses, and working Maps links.
- Next steps: Apply the same structured payload pattern to any remaining Express/Worker divergences and verify production SHA.

## YouTube thumbnails fix – 2026-09-30
- Problem: Video search results appeared without thumbnails in some paths.
- Root cause: Some YouTube result objects lacked a stable `thumbnail` URL; upstream APIs may omit or return expiring URLs.
- Fix:
  - Enforce `thumbnail: cleanThumb(id, candidate)` in `modules/youtube_insight_module/controller.js` and Worker YouTube paths.
  - `cleanThumb` returns the candidate URL if valid, otherwise falls back to `https://i.ytimg.com/vi/<ID>/hqdefault.jpg`.
- Files touched (repair notes added):
  - `modules/youtube_insight_module/controller.js.repair-notes.md`
- Test smoke: Query `فيديو تعليمي عن JavaScript` → expect result cards with visible thumbnails (hqdefault.jpg fallback).

## Continuation checkpoint – 2026-09-30
- Branch: `devin/1774405518-init-dz-gpt`
- Commits:
  - `5c9e36c` docs: add repair notes for doctor search and YouTube thumbnails (2026-09-30)
  - `f2871d4` docs: add repair notes for YouTube thumbnails in controller (2026-09-30)
  - `c9244dd` docs: add repair notes for DoctorResultsPanel Google Maps links (2026-09-30)
- Status: Repair notes pushed; next step is to apply the actual code changes in `workers/entry.js`, `controller.js`, and `DoctorResultsPanel.tsx` following these notes, then run smoke tests and update this file with the final SHAs.
