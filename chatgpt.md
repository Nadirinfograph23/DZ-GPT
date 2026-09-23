# DZ Agent — ChatGPT Continuation Notes

## Current objective
Make DZ Agent understand and speak natural Algerian Darija, including Arabic-script Darija, Franco-Arabic, mixed French/English technical speech, spelling variants, and regional vocabulary.

## Latest video-analysis restoration — 2026-09-23
- Investigated the existing YouTube implementation instead of replacing it.
- Found the native analysis bridge already present as `public/dz-youtube-ordinal-fix.js`; it selects the actual YouTube result card, waits for React state, then clicks the native `تحليل و مناقشة الفيديو` action.
- Found the production `index.html` on `main` no longer loaded that bridge, while the release branch retained the script.
- Restored the script load in `index.html` on `devin/1774405518-init-dz-gpt` with cache-busting version `20260923-1`.
- This preserves the existing YouTube search, metadata/captions extraction and AI video discussion implementation instead of routing video questions through generic chat.
- Commit: `3621455cfe58d78280df631e630d276500d0b263`.
- Documentation commit: `d392a1e254e1a96a4d91a06ae4fcc28ae09438a5`.

## Source/deployment branch policy — 2026-09-23
- The production source of truth for the DZ Agent deployment is `devin/1774405518-init-dz-gpt`.
- This branch is being treated as the effective `main` for the current production workflow because the live deployment did not reliably reflect updates made only to the GitHub `main` branch.
- Future restoration/fixes must be applied to `devin/1774405518-init-dz-gpt` first, then synchronized to the original GitHub repository/production path through a PR so that the live site receives the same code without losing newer updates.
- Do not replace the release branch with an older snapshot. Preserve all newer functionality and restore historical features selectively.
- Every production-related change must be recorded here with its commit SHA, PR number (when applicable), deployment/build identifier, and verification status.
- The live site is `https://dzagent.app/` and must be checked after deployment rather than assuming that a successful GitHub commit means the live site has updated.

## Cloudflare production deployment — 2026-09-23
- Cloudflare Workers deployment is configured through `.github/workflows/deploy-cloudflare-worker.yml`.
- The workflow is triggered by pushes to `devin/1774405518-init-dz-gpt` and `main`, then deploys `wrangler.toml` using the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- The previous Cloudflare build for commit `df5cb67aa430989059a8646ecad46cb969274b56` failed. A new release-branch commit is being created now to trigger the current workflow against the latest code.
- Verification target: `https://dzagent.app/version.json` must expose the exact GitHub commit SHA produced by the deployment workflow.
- Do not place Cloudflare API tokens or Global API Keys in this file or in source code.

## YouTube / Cloudflare Worker production fix — 2026-09-23
- Root cause found in the production Worker path: wrangler.toml aliases youtube-sr to workers/stubs/youtube-sr.js, and that stub previously threw `youtube-sr: not available in Cloudflare Workers`. The YouTube controller therefore had no working primary search provider inside the Worker.
- A second issue was that the Worker-native fetchChatDirect() path did not invoke the restored handleYouTubeInput() flow before generic live research/AI. This allowed natural YouTube requests to fall through instead of returning structured youtubeResults.
- Fixed workers/stubs/youtube-sr.js with a fetch-based Invidious adapter that preserves the result shape expected by the existing YouTube Insight controller and keeps the existing multi-instance fallback logic.
- Added a Worker-native YouTube Insight interception in workers/entry.js, returning the same structured fields used by the existing Vercel route: youtubeFlow, youtubeVideo, youtubeResults, youtubeAnalysis, youtubeSuggestions, captionText, and captionNote.
- Updated .github/workflows/deploy-cloudflare-worker.yml to use cloudflare/wrangler-action@v4 and added a production smoke test for the exact failing query "شرح أدوات الفوتوشوب". Deployment is now considered unsuccessful if /version.json does not expose the deployed commit or if the YouTube route does not return youtube-insight + youtubeResults.
- Commits created on the production release branch:
  - 0971915face5f6da0d73d021aa174487724bcddd — YouTube Worker search adapter.
  - 813b0c797602a6105e9a6562c8ec6ad87da7ad9f — Worker-native YouTube Insight routing.
  - 0aff73c1e59458d6258051a864d105376dc7449e — Cloudflare CI deployment + production smoke verification.
- Required GitHub repository secrets are configured by the repository owner: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Their values must never be stored in this file or source code.
- Official Cloudflare CI/CD guidance confirms Wrangler requires the API token + account ID and recommends storing them in the CI/CD secret store rather than the repository.
- Final deployment status must be recorded after GitHub Actions completes; a GitHub commit alone is not treated as proof of production deployment. Verification target remains https://dzagent.app/version.json plus the YouTube production smoke test.

## Cloudflare deployment diagnosis and re-trigger — 2026-09-24
- Inspected GitHub Actions run `35894294613` for the Cloudflare Worker deployment.
- Cloudflare authentication reached the Wrangler deployment step successfully; the failure was a Worker bundle build failure, not an API-token authentication failure.
- The failed commit `f08ad1b82d4c90b1125e41fa082116a287c63e0a` contained two malformed regular expressions: `lib/news.js:262` and `lib/worker-live-search.js:161`.
- The current production branch `devin/1774405518-init-dz-gpt` is now at `8f905482347e957a16516a2ec0f7404a445f7590`, where both malformed regexes have already been replaced with valid Cloudflare-safe implementations.
- A controlled documentation commit is being used to trigger exactly one new Cloudflare deployment from the current release branch. No Cloudflare secret values are stored here.
- Success criteria: GitHub Actions Deploy Worker succeeds, `https://dzagent.app/version.json` exposes the exact new commit SHA, then the YouTube production smoke test passes.


## YouTube selected-video analysis restoration — 2026-09-24
- Confirmed the DZ Agent frontend already renders real YouTube search cards with thumbnails and a **تحليل و مناقشة الفيديو** action.
- Root cause in the Cloudflare Worker: clicking that action sends the selected video in `youtubeContext`, but the Worker previously ignored that context and passed the follow-up sentence to `handleYouTubeInput()` as a new keyword search. This caused the selected video to be searched again instead of being analyzed.
- Fixed the Worker to route a selected `youtubeContext` through `handleVideoDiscussion()`, preserving the selected video's ID, title, channel, metadata and captions.
- Updated the Worker YouTube search adapter and controller fallback list to use currently listed public Invidious instances. The official Invidious documentation notes that the public instance list is short because of current YouTube issues, so the adapter keeps multiple fallbacks rather than relying on one endpoint.
- Expected flow after deployment: user asks for/searches a YouTube topic → DZ Agent displays multiple YouTube videos → user selects a video → the selected video is embedded → **تحليل و مناقشة الفيديو** analyzes that exact selected video → follow-up questions continue against the active video context.
- Verification required after deployment: search a YouTube topic, confirm `youtubeResults` contains multiple cards, select a card, click **تحليل و مناقشة الفيديو**, and confirm the response remains tied to that selected video rather than starting a new search.


## YouTube thumbnail/preview follow-up — 2026-09-24
- User reported that YouTube results were returning but thumbnails and the selected-video preview were not visible.
- Frontend hardening: standard YouTube embed host with the current site origin, plus `img.youtube.com` thumbnails with `i.ytimg.com` fallback.
- Existing multi-result selection and selected-video analysis flow remain unchanged; fixed/static answers are untouched.


## Permanent continuation / deployment path — 2026-09-24
- Repository: `Nadirinfograph23/DZ-GPT`.
- Production/live site: `https://dzagent.app/`.
- **Production source branch:** `devin/1774405518-init-dz-gpt`. Treat this branch as the effective production/main branch for project work. Do not start fixes from GitHub `main` unless explicitly requested.
- **Primary deployment path:** push/commit to `devin/1774405518-init-dz-gpt` → GitHub Actions workflow `.github/workflows/deploy-cloudflare-worker.yml` → `npm install` → `npm run build` → `cloudflare/wrangler-action@v4` → `wrangler deploy --config wrangler.toml` → production verification at `https://dzagent.app/version.json` → YouTube production smoke test.
- The workflow also listens to `main`, but the project-specific production work must use `devin/1774405518-init-dz-gpt` because that is the branch previously established as the live production source.
- **Do not use Vercel as the primary production deployment path.** Vercel project/deployment access was observed blocked; Cloudflare Worker deployment is the intended production path for `dzagent.app`.
- Required Cloudflare GitHub secrets are `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Never request, print, commit, or store their values in repository files. Cloudflare's current GitHub Actions guidance confirms these secrets are used by Wrangler CI/CD. citeturn0search0
- **Verification rule:** a commit is NOT considered deployed merely because GitHub accepted it. Verify the production `/version.json` commit SHA and then run/confirm the production feature smoke test. Cloudflare documents that pushes to the configured production branch trigger the production build/deploy flow. citeturn0search1
- **Fast continuation checklist for future sessions:**
  1. Read this section of `chatgpt.md` first.
  2. Checkout/use `devin/1774405518-init-dz-gpt`.
  3. Inspect the latest commit on that branch before changing anything; preserve all newer work.
  4. Apply the requested fix on that branch only.
  5. Update `chatgpt.md` with the change, commit SHA, deployment status, and verification result.
  6. Push/update the branch in the original repository.
  7. Wait for the Cloudflare GitHub Actions deployment; do not assume Vercel deployment means production is updated.
  8. Verify `https://dzagent.app/version.json` contains the exact deployed commit SHA.
  9. Test the affected live feature on `https://dzagent.app/`.
  10. Only then report the task as deployed/complete.
- **YouTube verification flow:** search a topic → confirm multiple result cards and thumbnails → select a result → confirm the embedded preview appears → click `تحليل و مناقشة الفيديو` → confirm analysis is tied to the selected video → ask a follow-up question and confirm the active video context is preserved.
- **Latest code commit:** `cacefe3dc252c2df53a0814688b53bc2349f4ac0` — `fix: restore YouTube thumbnails and preview embed`.
- This latest commit is currently the next deployment candidate; its live deployment must still be verified before claiming production completion.
- Keep this section intact and append new deployment/fix entries below it rather than rewriting the established production path.

## Site update banner restoration — 2026-09-24
- Confirmed the previous countdown update banner still exists in `src/utils/versionChecker.ts`: it checks `/version.json` with cache-busting, shows a 15-second countdown, provides `🚀 تحديث الآن`, clears browser caches/service-worker registrations, and reloads with a cache-busting URL.
- The live deployment path uses `public/version.json` generated by GitHub Actions for every Cloudflare deployment, so the banner can detect a newly deployed commit without changing fixed answers or chat behavior.
- Hardened the Service Worker integration: receiving `SW_UPDATED` / `NEW_VERSION` no longer displays the banner blindly. It now re-checks the deployed version first, preventing false update banners on first SW installation while preserving the countdown/banner when a real deployment is detected.
- Code commit: `263a4066079ffa6d27f3421e2cc236c1d6203770`.
- Documentation commit: this entry.
- Deployment verification required: confirm the release branch commit reaches Cloudflare, then verify `/version.json` and the visible countdown banner on `https://dzagent.app/`.
