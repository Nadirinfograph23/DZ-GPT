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
