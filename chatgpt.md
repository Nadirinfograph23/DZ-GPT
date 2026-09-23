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

## Latest video-search routing hardening — 2026-09-23
- Root cause addressed: the YouTube analysis/discussion endpoints were multiplexed through `api/index.js` plus the generic `/api/(.*) -> /api/index` rewrite. This made the dedicated video flow dependent on the generic serverless entry instead of having its own Vercel functions.
- Added dedicated serverless handlers: `api/youtube-insight/analyze.js` and `api/youtube-insight/discuss.js`.
- Added explicit Vercel function configuration and rewrites for both video endpoints before the generic API fallback.
- Existing `modules/youtube_insight_module/controller.js` remains the source for search, metadata, captions, analysis and discussion; no replacement of the historical video engine was made.
- Working branch created from the requested production source branch: `fix/video-analysis-direct-routes-20260923` (based on `devin/1774405518-init-dz-gpt`).
- Commits: `2cc2975ebddff5921620b53a7d62df98b1cbd30c`, `fe817265dba52f93431a6b18e3b3a00e4a32f651`, `ee4b75049832b4bac22064f63526a71c77a81e5d`, followed by this continuation-note commit.
- Verification status: code-level routing fix committed; production Vercel verification still required after the PR is merged/deployed.
