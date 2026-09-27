# DZ Agent — ChatGPT Continuation Notes

## Current objective
Make DZ Agent understand and speak natural Algerian Darija, including Arabic-script Darija, Franco-Arabic, mixed French/English technical speech, spelling variants, and regional vocabulary.

## Production source of truth
- Repository: `Nadirinfograph23/DZ-GPT`.
- Production source branch: `devin/1774405518-init-dz-gpt` (treat as effective production/main for project work).
- Live site: `https://dzagent.app/`.
- Primary deployment: GitHub Actions `.github/workflows/deploy-cloudflare-worker.yml` → `npm install` → YouTube intent patch → `npm run build` → `cloudflare/wrangler-action@v4` → `wrangler deploy --config wrangler.toml` → `/api/version` + `/version.json` verification → production feature smoke tests.
- Do not use Vercel as the production path. A Vercel status on recent commits reports `Account is blocked`; Cloudflare Worker is the intended production runtime.
- Secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; never store or print their values.
- A commit is not considered deployed until the exact SHA is observed from the live version endpoint and the relevant production smoke test passes.

## YouTube root-cause investigation — 2026-09-24
- The visible message `🔍 لم أجد نتائج ... على YouTube` means the request reached the YouTube response path but `youtubeResults` ended empty; the update banner only proves that version metadata changed.
- `wrangler.toml` aliases `youtube-sr` to `workers/stubs/youtube-sr.js`, so the Worker does not use the normal Node `youtube-sr` implementation.
- The Worker stub now has direct YouTube HTML search first, then multiple Invidious instances, Jina Reader, and Google site-search, with hard timeouts, an overall deadline, YouTube ID validation, and result normalization.
- The production Worker intent detector historically contained `شرح .*فيديو|tutorial|how to`; this does NOT match a normal request such as `شرح أدوات الفوتوشوب`.
- The workflow had a build-time patch for that regex, but it was previously fail-open: if the source changed, the script could silently skip the patch. This was a major reliability weakness because the deployment could proceed with the old intent detector.
- The latest source of truth is the actual branch content, not historical commit notes: the branch was found at `f39db30ec68754a32f0eb605a7db2f1753783d45` before the latest repair, and the Worker source still contained the old intent detector. This explains why earlier claimed hardening was not visible on the live path.
- The accidental placeholder write to `workers/entry.js` was immediately reverted by moving the branch ref back to `f39db30ec68754a32f0eb605a7db2f1753783d45`; no application source was left corrupted by that mistake.
- The intent patch was then hardened to validate the exact regression queries before Wrangler deployment: `شرح أدوات الفوتوشوب`, `شرح فوتوشوب للمبتدئين`, `دروس الفوتوشوب`, and `Photoshop tutorial`.
- Latest intent-test commits: `a05d4a2bd93125b3fa8b1d0ddd86aa14e46566bb` followed by `ce22d690b7d9ec9f7a9e216e0e6320bac89918d3`, with the latter correcting JavaScript RegExp escaping in the regression test.

## Latest hardening commits
- `ae01670e7a4fd64148ade5ec699234ee78e1f178` — `fix: fail closed when YouTube intent patch is missing`.
- `ab9afe7feaba88b08f93e9db40594d1b43b71c7f` — `ci: fail deployment when YouTube intent is not actually patched`.
- `a05d4a2bd93125b3fa8b1d0ddd86aa14e46566bb` — added exact regression-query validation.
- `ce22d690b7d9ec9f7a9e216e0e6320bac89918d3` — corrected the regression-test escaping.
- The current production branch HEAD is `ce22d690b7d9ec9f7a9e216e0e6320bac89918d3`.
- A previous Cloudflare run `35896761561` was cancelled, so it cannot be treated as proof of deployment. The current HEAD has not yet been verified by a completed Cloudflare run in the available GitHub workflow-run query.

## YouTube selected-video flow
- Existing frontend supports multiple YouTube result cards, thumbnails, selected-video preview, and `تحليل و مناقشة الفيديو`.
- Selected-video context must remain tied to the selected video through `youtubeContext` and `handleVideoDiscussion`; never turn a selected-video follow-up into a fresh keyword search.
- Thumbnail strategy: stable `https://i.ytimg.com/vi/<ID>/hqdefault.jpg` fallback rather than expiring signed thumbnail URLs.
- Preview strategy: standard YouTube embed with the current site origin and `playsinline`.

## Update banner / version chain
- The previous 15-second update banner with `🚀 تحديث الآن` remains part of `src/utils/versionChecker.ts`.
- Production version chain: Cloudflare deployment → generated `public/version.json` → Worker `GET /api/version` → `versionChecker`/Service Worker → update countdown.
- `/api/version` is Cloudflare-native and uses `no-store` headers; it reads the deployed `version.json` through the `ASSETS` binding.
- The banner alone is never proof that the YouTube backend is healthy.

## Verification checklist for every future YouTube fix
1. Read this file first.
2. Work only from `devin/1774405518-init-dz-gpt` unless explicitly instructed otherwise.
3. Inspect current branch SHA and preserve newer changes.
4. Verify the Worker YouTube intent source before modifying provider code.
5. Verify `wrangler.toml` still aliases `youtube-sr` to the intended Worker adapter.
6. Run/build the exact query `شرح أدوات الفوتوشوب` through production smoke test.
7. Require non-empty `youtubeResults`, valid IDs, titles, thumbnails.
8. Verify `/api/version` and `/version.json` expose the exact deployed SHA.
9. Test the browser flow: search → cards → thumbnails → select → preview → `تحليل و مناقشة الفيديو` → follow-up.
10. Record commit SHA, CI result, Cloudflare deployment result, and live verification here.

## Security / credentials
- Never request or store Cloudflare Global API Keys, API tokens, GitHub tokens, or other secrets in repository files or chat notes.
- Existing GitHub Actions secrets are sufficient for Cloudflare deployment.

## Critical live-debug finding — 2026-09-27
- The live failure persists because the update banner and the YouTube feature are separate verification domains: the banner can detect a new version while the YouTube Worker route remains old or the deployment can be cancelled before Cloudflare serves the new Worker.
- The branch was explicitly verified at `f39db30ec68754a32f0eb605a7db2f1753783d45` and the actual `workers/entry.js` still contained the old YouTube intent regex. This is stronger evidence than earlier notes claiming later hardening commits were on the branch.
- Current branch HEAD is now `ce22d690b7d9ec9f7a9e216e0e6320bac89918d3`. The latest change is in the exact build-time intent patch and includes source-level regression tests for the user's failing query.
- GitHub status still reports an unrelated Vercel failure (`Account is blocked`); this must not be used as Cloudflare deployment proof.
- Cloudflare deployment proof is still pending: a completed successful Cloudflare Actions run must serve the exact HEAD through `/api/version`, followed by the production YouTube smoke test. Until that happens, do not report the live YouTube fix as complete.
