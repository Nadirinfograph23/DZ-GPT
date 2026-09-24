# DZ Agent — ChatGPT Continuation Notes

## Current objective
Make DZ Agent understand and speak natural Algerian Darija, including Arabic-script Darija, Franco-Arabic, mixed French/English technical speech, spelling variants, and regional vocabulary.

## Production continuation rule
Always work from `devin/1774405518-init-dz-gpt` and verify the Cloudflare production runtime. Read this file first in future sessions.

## Latest deep YouTube hardening — 2026-09-24
- Important diagnosis: the visible update banner only proves that `/version.json` changed. It does **not** prove that the YouTube retrieval path is healthy.
- The exact failing request `شرح أدوات الفوتوشوب` exposed two independent weak points: the Worker intent regex historically recognized `شرح ... فيديو` but not normal tutorial phrasing such as `شرح أدوات الفوتوشوب`; and the Cloudflare `youtube-sr` adapter depended heavily on unofficial public search providers that can fail independently.
- `workers/stubs/youtube-sr.js` was replaced with a resilient Worker-native provider chain: direct YouTube HTML search first, then multiple Invidious instances, then Jina Reader, then Google site-search. Each provider has a timeout; the overall search has a deadline; IDs/titles/results are validated and deduplicated; thumbnails are normalized to stable `i.ytimg.com` URLs.
- `.github/workflows/deploy-cloudflare-worker.yml` now contains a real production smoke test for `شرح أدوات الفوتوشوب`: it parses the JSON, requires `model === youtube-insight`, requires at least one result, and rejects malformed results without a valid 11-character YouTube ID, title, and thumbnail. This prevents a false-green deployment where `youtubeResults: []` was accepted merely because the property existed.
- The same workflow verifies both `GET /api/version` and `/version.json` against the exact GitHub SHA before the YouTube smoke test.
- Because the Worker source's historical YouTube intent expression is embedded in the large `workers/entry.js`, a deterministic build patch was added at `scripts/patch-youtube-worker-intent.js` and is executed immediately before `npm run build`. It expands tutorial intent to recognize `شرح أدوات`, `فوتوشوب`, `تعلم`, `تعليم`, `دروس`, `tutorial`, and `how to`, while fixed/static answers are still checked before YouTube routing.
- This makes the production build itself enforce the intended Worker behavior instead of relying on a manual edit or browser cache.
- Code commits in this hardening sequence:
  - `cea586f6be93cd96561edc3f9c3c1d65f1e0ae3e` — resilient direct YouTube HTML + provider fallback adapter.
  - `d0d069f061945c4b643b4a503ac600eb4274f323` — CI smoke test requires real non-empty YouTube results.
  - `e2a19859947c996e87f0fb6239f01a9c2e38da59` — deterministic Worker tutorial-intent build patch.
  - `fa2778d46e64ba3a6334516397a325b4f9e43dca` — Cloudflare workflow executes the intent patch before build.
  - `0238f93fb2825c52263c4fbdf54fa44e0a1d98ab` — API route restored with tutorial intent support.
- The current release branch is the source of truth. Do not report the feature as fixed until GitHub Actions completes, `/api/version` reports the deployed SHA, and the live smoke test returns real `youtubeResults`.

## YouTube production verification flow
1. Deploy from `devin/1774405518-init-dz-gpt`.
2. Verify `/api/version` SHA.
3. Verify `/version.json` SHA.
4. POST the exact test phrase `شرح أدوات الفوتوشوب` to `/api/dz-agent-chat`.
5. Require `model: youtube-insight`.
6. Require non-empty `youtubeResults`.
7. Require valid YouTube IDs, titles, and thumbnails.
8. In the UI, confirm multiple video cards and visible thumbnails.
9. Select a video and confirm its preview appears.
10. Click `تحليل و مناقشة الفيديو` and confirm the selected video's ID/context is preserved.
11. Ask a follow-up question and confirm it stays tied to that selected video.

## Permanent deployment path
- Repository: `Nadirinfograph23/DZ-GPT`
- Production branch: `devin/1774405518-init-dz-gpt`
- Live site: `https://dzagent.app/`
- Deployment: GitHub Actions → `npm install` → build → `cloudflare/wrangler-action@v4` → `wrangler deploy --config wrangler.toml` → production verification.
- Cloudflare secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Never store their values in repository files.
- Vercel is not the primary production path; Cloudflare Workers is the production runtime.
- `chatgpt.md` must be updated after every meaningful production fix with commit SHA and verification status.

## Existing critical functionality that must not be regressed
- Fixed/static answers remain unchanged and execute before generic AI/YouTube routing.
- Doctor search must preserve specialty → city flow and structured table results with clickable phone/address/Google Maps behavior.
- DZ Maps/OpenStreetMap place search must remain available.
- Selected YouTube video analysis must use `youtubeContext` and `handleVideoDiscussion`, not start a new search.
- YouTube thumbnails use stable `i.ytimg.com` URLs with frontend fallback; embedded preview uses standard `www.youtube.com/embed`.
- Site update banner uses the Cloudflare `/api/version` endpoint and `/version.json` fallback, with countdown and `تحديث الآن`.
