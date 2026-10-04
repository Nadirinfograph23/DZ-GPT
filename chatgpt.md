# DZ Agent — ChatGPT Continuation Notes

## Current handoff — 2026-10-03 (read first; supersedes older snapshots)

- Repository: `Nadirinfograph23/DZ-GPT`; work only on `devin/1774405518-init-dz-gpt`.
- Latest application-code commit at this checkpoint: `00900f1ffbc6a37966dea7eac7758159dcf4874b` (`fix: isolate Pinterest image search and clarify doctor table`). It includes Pinterest source-isolation/cache work, a regression test, and the doctor-results table clarification. This handoff is documentation-only and uses `[skip ci]`; at the start of each new session, resolve the branch’s current HEAD from GitHub and distinguish later documentation-only commits from the latest application-code commit.
- GitHub Actions run [37135423925](https://github.com/Nadirinfograph23/DZ-GPT/actions/runs/37135423925) completed successfully for that SHA: build, Cloudflare Worker deploy, production API version check, static version fallback, and production YouTube smoke test all passed. The workflow did not run `npm run test:image-search`.
- Cloudflare’s account API lists the production domain `dzagent.app` bound to Worker service `dzagent`; its newest recorded deployment is at 100% traffic (deployment `a044a973-bb37-4fa2-b103-bcb1f09aa699`, version `007b0680-2100-4d63-ab67-86c4e88f6d44`).
- **Live mismatch—do not call the current HEAD deployed:** a direct no-cache request at 2026-10-03 16:42 UTC returned commit `86d45f591cbf97083cdc43fdac68ec78a913be26` from both `/api/version` and `/version.json`, dated 2026-09-21. The API response had a fresh server time and `no-store`; the static response reported Cloudflare cache `HIT` despite a unique query parameter. This conflicts with the successful workflow version checks and requires diagnosis. No production routing/settings changes have been made.

### Ordered continuation steps
1. Reconcile run 37135423925’s successful version-check steps with the current live SHA and Cloudflare’s active Worker/version records. Determine whether the mismatch is in Worker code, the `ASSETS` binding/static asset deployment, or which origin is serving the public URL; keep these as hypotheses until verified.
2. Do not change Cloudflare routes, domains, Worker settings, or roll back to an older commit while diagnosing. Ask before any production routing/configuration change.
3. Run `npm run test:image-search`; record its result. This is mocked regression coverage, not proof that Pinterest’s live endpoint works.
4. After the live version mismatch is resolved, verify `/api/version` and `/version.json` against the exact current HEAD, then smoke-test actual Pinterest search (Pinterest image URLs only, no Wikimedia results, Pinterest empty-state link) and the doctor table (RTL, narrow viewport, map/profile/phone actions, pagination). Recheck YouTube only if the repair changes its path.
5. Append exact SHA, run/deployment IDs, live endpoint values, and test results here. Mark production complete only when live SHA matches and the feature-specific smoke tests pass.

---

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

## Doctor search restoration — 2026-09-27
- The current branch checkout was verified at 37b5b65 before this repair; older SHA notes above are historical and must not be treated as the current branch state.
- The Node/Express YouTube and doctor engines both work locally: the Photoshop-tools query returned 8 valid YouTube results, and the dentist-in-Annaba query returned 7 doctor records with profile/source URLs.
- Root cause found in the Cloudflare path: workers/entry.js returned doctor search as Markdown plus doctorSearch: true, but omitted the structured richType doctor-results, doctors, dirs, and metadata consumed by DZChatBox. Production therefore could not render the interactive doctor table even when the search succeeded.
- Repair: the Worker doctor response now includes the same structured doctor payload as the Express path (richType, real doctors, directory links, specialty/city metadata, cache/GPS flags, and the existing dua). Existing Markdown remains as a fallback.
- Verification completed before the workspace restart: node tests/basic.test.js → 32/32 passed; direct YouTube controller search → 8 results with valid IDs/titles/thumbnails; direct doctor search → 7 results; Express routes → YouTube 8 results and doctor 7 results using a browser User-Agent. node --check workers/entry.js also passed before the restart.
- The full npm run build could not be completed in the local environment: the TypeScript process was killed with exit code 137 (resource exhaustion), with no TypeScript diagnostic emitted. This is an environment verification failure, not evidence of a source compile error.
- Pending after commit: run the Cloudflare workflow, confirm the deployed SHA via /api/version and /version.json, then run the production YouTube and doctor smoke tests. Do not call the live repair complete before those checks pass.

## Deployment follow-up — 2026-09-28
- Repair commit: ce06fc1208dea47ee3cbc143bf63a4e21f9de718 (ce06fc1), pushed to devin/1774405518-init-dz-gpt. It changes only workers/entry.js and this documentation file.
- Cloudflare workflow run 36370737180 was triggered for that exact SHA but completed with failure in Build application assets; Deploy Worker and all live smoke tests were skipped. The run URL is https://github.com/Nadirinfograph23/DZ-GPT/actions/runs/36370737180.
- Local npm run build was also killed with exit code 137 during TypeScript compilation in the restarted verification environment. No TypeScript diagnostic was emitted, so the source build remains unproven rather than proven broken.
- Live version check at 2026-09-28 02:43 UTC still served version.json commit 36c35fa1223431de09b3d1ee07f9aeb0b02157d2 from 2026-08-14; /api/version reported commit unknown. This confirms the doctor repair is not deployed to production yet.
- Next action: diagnose the Build application assets failure, get a successful Cloudflare deployment for ce06fc1 (or a follow-up fix), then require /api/version, /version.json, and production doctor/YouTube smoke tests before marking the repair complete.


## Doctor table UI update — 2026-09-28
- User selected option #2 (shadcn-data-table style) for the doctor-results interface and requested support for long result lists.
- Kept the existing DoctorResultsPanel data model and phone/Google Maps/source actions intact.
- Added client-side pagination to `src/components/DoctorResultsPanel.tsx`: 20 results per page by default, selectable 20/50/100, previous/next controls, and a visible range/total counter.
- Added responsive pagination styling to `src/styles/doctor-results.css`; the existing horizontal mobile table behavior remains intact.
- Commits: `63fc7be2b550898a40937d000cb43956ef74f023` (component pagination), `b42162296aeba36e6795179d8747eeb9371b045f` (pagination styling).
- This is a UI-only improvement; the doctor search backend and structured `doctor-results` payload are preserved.
- Deployment is still pending until the Cloudflare build succeeds and the exact deployed SHA is verified through `/api/version` and live doctor smoke tests.


## Doctor table rendering fix — 2026-09-28
- User reported that a query such as `طبيب أسنان في عنابة` was returning only the query/date text instead of the doctor table.
- Root cause found in `src/components/DZChatBox.tsx`: the Vercel AI SDK streaming fast-path could consume the request and return plain text before the full `/api/dz-agent-chat` response with `richType: 'doctor-results'` reached the existing `DoctorResultsPanel` renderer.
- Fix: structured doctor searches now bypass the generic streaming fast-path and continue through the full response path, where `doctor-results` is converted into `DoctorResultsPanel` with doctors, sources, phone links, Google Maps links, and pagination.
- Fix commit: `cda3d48e41af0519c3bb25487389f6518fbdb9d7` on `devin/1774405518-init-dz-gpt`.
- Deployment is still subject to the established Cloudflare production workflow and must be verified by the exact deployed SHA plus a live doctor search smoke test.


## 2026-09-28 — فرض نشر آخر تحديثات الفرع + الجداول للقوائم
- الفرع الإنتاجي المعتمد: `devin/1774405518-init-dz-gpt`.
- تم الحفاظ على جميع التحديثات الأخيرة وعدم الرجوع إلى commit `36c35fa1223431de09b3d1ee07f9aeb0b02157d2`؛ هذا الـcommit مرجع لمسار النشر الناجح فقط.
- آخر إصلاح بحث الأطباء: `35f51ca9b88aaadb514d77a4e10d6c449347ecef`، لإرجاع نتائج Docteur360 كبيانات منظمة (اسم، تخصص، هاتف، عنوان، رابط الملف).
- قاعدة واجهة النتائج: عند وجود قائمة منظمة (أطباء، أخبار، نتائج بحث، خدمات، عناصر متعددة...) يجب عرضها في جدول منظم ومتجاوب على الهاتف بدلاً من نص/روابط مصادر فقط. عند عدم توفر بيانات حقيقية فقط يُستخدم fallback.
- يجب أن تبقى بيانات الجدول مرتبطة بالـrich payload الموجود في الواجهة، وألا يتم تمريرها إلى مسار streaming النصي العام الذي يحوّلها إلى نص فقط.
- يجب أن يمر النشر من آخر HEAD للفرع، مع التحقق من SHA المنشور بعد البناء؛ لا يجوز نشر commit قديم مكان آخر التحديثات.


## 2026-09-28 — Cloudflare CI dependency-install repair
- Latest production branch: `devin/1774405518-init-dz-gpt`.
- The Cloudflare deployment workflow was failing during dependency installation with `npm error Exit handler never called!`, followed by missing `react`, `vite`, `lucide-react`, etc. because dependencies were incomplete.
- Minimal repair committed as `cc4ad1d806273b3d86392e31168481bac15d8c89`: changed the workflow dependency step from `npm install --no-audit --no-fund` to `npm ci --no-audit --no-fund`.
- This keeps the existing lockfile-based dependency tree and the current deployment path; no reset to `36c35fa1223431de09b3d1ee07f9aeb0b02157d2` was performed.
- Next verification requirement: confirm the new GitHub Actions run completes install/build/deploy, then verify the deployed SHA through `/api/version` and `/version.json`, followed by the production doctor-search/table smoke test.


## Cloudflare CI repair — 2026-09-28
- Verified GitHub Actions run #343 / ID 36391376622 on `devin/1774405518-init-dz-gpt` failed during `npm run build` because the previous `npm ci` reported `Exit handler never called!` and left required packages such as React/Vite unavailable.
- Commit `6a5ccaaf3bc6989ff5b5c6d4e075bf091f93e79e` hardens the install path: upgrades npm to 10.9.3, installs with `npm ci --ignore-scripts --prefer-online`, verifies critical modules exist, then runs the Cloudflare compatibility postinstall explicitly.
- Do not reset to the historical successful commit `36c35fa1223431de09b3d1ee07f9aeb0b02157d2`; preserve all newer work.
- Next verification: GitHub Actions must complete Build + Deploy, then production SHA checks and YouTube smoke test must pass.

## 2026-09-29 — Feature providers and automatic update handoff

### قواعد العمل
- العمل فقط داخل Nadirinfograph23/DZ-GPT وعلى الفرع devin/1774405518-init-dz-gpt، وعدم الرجوع إلى commits قديمة أو تعديل main.
- قراءة chatgpt.md أولًا، ثم فحص SHA الحالي والكود الفعلي قبل الاعتماد على الملاحظات التاريخية.
- مسار الإنتاج هو GitHub Actions ثم Cloudflare Worker باسم dzagent؛ وجود commit أو رسالة تحديث لا يثبت وحده اكتمال النشر.

### خريطة المزودات والميزات
- أسعار الصرف: workers/entry.js يقدّم currency intent قبل news intent، ويستخدم open.er-api.com ثم exchangerate-api.com لأسعار DZD؛ src/components/CurrencyWidget.tsx يعرض الجدول المنظم.
- الأطباء: lib/doctorSearch.js يبحث في الأدلة الجزائرية المهيأة؛ Worker يعيد doctor-results منظمة؛ src/components/DoctorResultsPanel.tsx يعرض الجدول والبطاقات، الهاتف والمصدر، pagination، ورابط Google Maps من خلال https://www.google.com/maps/search/?api=1&query=.
- YouTube: workers/stubs/youtube-sr.js يستخدم YouTube HTML ثم Invidious وJina وGoogle كبدائل؛ modules/youtube_insight_module/controller.js يتولى metadata وcaptions وdiscussion؛ يجب الحفاظ على selected-video context وتحليل الفيديو المختار. الهدف المرئي 8 بطاقات، مع قبول smoke test لنتيجة صحيحة واحدة على الأقل.
- التحديث التلقائي: src/utils/versionChecker.ts يفحص /api/version و/version.json، يقارن deployedAt، ويعرض banner أعلى الصفحة بعدّاد 15 ثانية وزر 🚀 تحديث الآن، ويمسح caches وService Workers ثم يعيد التحميل. public/sw.js يرسل NEW_VERSION وSW_UPDATED.

### ما تم إنجازه في 2026-09-29
- HEAD الحالي عند وقت التوثيق هو c22de834efe9c0e8b78bac01977e13ab7b9ca0ff.
- b89ba1c55e776e202e645430f2621922a8fb50ce normalized 106 رابطًا داخليًا من Replit في package-lock.json إلى https://registry.npmjs.org/، وأصلح تثبيت الحزم في Cloudflare CI دون تغيير dependencies التطبيق.
- c22de834efe9c0e8b78bac01977e13ab7b9ca0ff حصّن versionChecker ليقرأ المصدرين ويختار أحدث deployedAt، حتى لا يخفي رد API قديم banner الخاص بالنسخة الجديدة.
- GitHub Actions run 36539103201 / run 354: Install dependencies وpatches وBuild application assets وDeploy Worker وVerify production deployment version نجحت.
- /api/version و/version.json يعرضان SHA c22de834efe9c0e8b78bac01977e13ab7b9ca0ff في الموقع الحي.
- run 354 فشل فقط في Verify production static version fallback، ولذلك تم تخطي Smoke test YouTube؛ عند الفحص اللاحق كان /version.json الحي يعرض SHA الصحيح، فالمشكلة تبدو عدم اتساقًا/تأخرًا عابرًا في لحظة التحقق وليس فشلًا في deployment نفسه.

### المهام التالية
1. إعادة تشغيل أو متابعة run جديد بعد آخر commit، والتأكد من نجاح static version fallback ثم Smoke test YouTube.
2. اختبار أسعار الصرف فعليًا، ثم بحث طبيب مع تحقق من الجدول ورابط Google Maps.
3. اختبار بحث YouTube بإظهار 8 بطاقات، اختيار فيديو، preview، ثم تحليل ومناقشة الفيديو المختار.
4. تسجيل SHA المنشور ونتائج الاختبارات الحية هنا؛ لا تعتبر المهمة مكتملة قبل تطابق SHA في /api/version و/version.json ونجاح smoke tests.
5. إذا تكرر فشل npm، افحص hosts داخل package-lock.json قبل تعديل كود الميزات.


## 2026-10-01 — إصلاح بحث الأطباء وصور YouTube المصغّرة

### ما أُنجز
- تفعيل سبعة مصادر مفيدة لبحث الأطباء وتوسيع التغطية متعددة المصادر.
- في اختبار محلي مباشر: 15 نتيجة طبيب من خمسة مصادر، وكلها تضمنت التخصص والعنوان. Docteur360 أعاد HTTP 404 في هذا الاختبار، ويظهر فشل المصدر ضمن بيانات الاستجابة.
- تحميل CSS الخاص بجدول الأطباء، إظهار حالة المصادر، فتح روابط الأدلة عند غياب سجلات الأطباء، وإضافة العنوان الكامل إلى بحث Google Maps.
- استخدام صورة YouTube التي يعيدها الخادم مع بدائل مختلفة وصورة احتياطية محلية، مع الحفاظ على اختيار فيديو قبل طلب تحليله.
- بناء الإنتاج نجح، واختبارات `node tests/basic.test.js` نجحت (32/32).

### النشر والتحقق
- مسار النشر الصحيح هو GitHub Actions ثم Cloudflare Worker `dzagent`؛ لا تستخدم Vercel.
- أحدث أساس لفرع GitHub هو `6f77696b4ff419f99a8e1d512e9567204e41c2d1`. النسخة الحية قبل النشر كانت تعرض SHA `86d45f591cbf97083cdc43fdac68ec78a913be26`.
- سجل الإصلاح السابق على الفرع شمل commits `02d9e66` و`de9f896` و`866a689`؛ تبعتها محاولات استعادة تركت ملفات stub. تفاصيل التسلسل في `RECOVERY_STATUS.md`.
- GitHub Actions run 381 فشل عند `Patch and verify Cloudflare YouTube intent` لأن `workers/entry.js` على الفرع كان stub من 97 سطراً بلا markers المطلوبة؛ لم يبدأ build أو deploy. سيُستعاد الملف الكامل مع بقية الإصلاحات من دون تغيير النطاق أو التوجيه.
- PR #53 سيبقى مفتوحاً؛ لا تدمجه ضمن هذا التحديث.
- النشر والتحقق من النسخة الجديدة قيد التنفيذ. لا تعتبر المهمة مكتملة حتى يتطابق SHA الجديد في `/api/version` و`/version.json` وينجح smoke test لبحث الطبيب وYouTube.
- لم يتم تغيير النطاق أو إعدادات التوجيه. لا ترفع تعديلات `.replit` أو بيانات `data/eddirasa_index.json` التي ولّدها التشغيل المحلي.

## 2026-10-02 — Doctor search and YouTube production verification

### Code fix
- Repair commit: `dd2d2b6a2c2c49a971d537b53d12eb08262c8f70` on `devin/1774405518-init-dz-gpt`.
- Root cause: `wrangler.toml` aliased `cheerio` to a lightweight Worker stub. Removing that alias restored the real multi-source parser in `lib/doctorSearch.js`; a local Worker-bundle check returned 15 doctors and 3 directory links across 7 sources.
- The Worker now returns the structured doctor-results payload, source count, and source errors; `DZChatBox` passes those details to the existing doctor panel.
- `scripts/compact-version-json.js` compacts the generated `public/version.json` during `npm run postinstall`. This preserves compatibility with the current workflow's grep-based static-version check. The GitHub connection has `repo` scope but not `workflow` scope, so the workflow-file update could not be committed; no production domain or routing settings were changed.

### Verification
- `npm run build` passed locally (existing large-chunk warning only); `node tests/basic.test.js` passed 32/32; `node --check workers/entry.js` passed.
- GitHub Actions run 383 attempt 1 completed successfully, including Worker deployment, both version checks, and the YouTube production smoke test. Attempt 2 redeployed the same SHA and passed the API version check, but its static-version check ran before Cloudflare cache propagation and failed; the production endpoints subsequently converged.
- Current `/api/version` and `/version.json` responses both serve `dd2d2b6a2c2c49a971d537b53d12eb08262c8f70` with `deployedAt` `2026-10-02T12:52:03.752Z`.
- Production doctor smoke (`طبيب أسنان في عنابة`): 11 records, 7 complete records, 7 configured sources; `docteur360` and `sahadoc` reported source errors.
- Production YouTube smoke (`شرح أدوات الفوتوشوب`): 8 results, all 8 with valid IDs, titles, and thumbnails.
- Follow-up: add a doctor-search smoke test and retry the static-version check in the deployment workflow when workflow-file access is available.

## 2026-10-03 — YouTube response rendering handoff

### Current source of truth
- Repository: Nadirinfograph23/DZ-GPT; production work branch: devin/1774405518-init-dz-gpt.
- Branch HEAD observed: 51684308c476e27d0f03bc6243c1dbfc49ca3ec1 (fix: render YouTube search cards from Worker responses). Parent: 2d414ebecbcdf10e0c5177942afcdedb7a94e8bd.
- The latest commit changes src/components/DZChatBox.tsx, adds src/lib/youtube-response.js and its declaration, and adds response-classification coverage to tests/youtube-insight.test.js. The UI now recognizes Worker payloads identified by richType: youtube as well as the legacy isYouTube flag.

### Deployment evidence (do not conflate deploy with verification)
- GitHub Actions run 384 (ID 37127763706) completed successfully for 2d414ebecbcdf10e0c5177942afcdedb7a94e8bd, including Worker deploy, production version checks, and YouTube smoke test.
- Run 385 (ID 37128319126) targets the current HEAD 51684308c476e27d0f03bc6243c1dbfc49ca3ec1. Install, compatibility patches, YouTube intent patch, build, and Deploy Worker all succeeded; Verify production deployment version failed. Static version fallback and YouTube smoke test were skipped.
- Therefore, the deployment step ran, but production serving the exact current HEAD is NOT yet verified. Do not mark this commit deployed or the YouTube UI fix complete based on the deploy step alone.
- Run 385: https://github.com/Nadirinfograph23/DZ-GPT/actions/runs/37128319126. Run 384: https://github.com/Nadirinfograph23/DZ-GPT/actions/runs/37127763706.

### Ordered continuation steps
1. Inspect run 385 logs for the exact reason Verify production deployment version failed; establish whether this is stale propagation/cache, a version payload mismatch, or a real deploy issue.
2. Query the live /api/version and /version.json endpoints and record the returned SHA and deployedAt. Compare both values with 51684308c476e27d0f03bc6243c1dbfc49ca3ec1; do not infer the result from GitHub's Deploy Worker step.
3. If production serves the exact HEAD, run the production YouTube search smoke test and confirm multiple cards render from the Worker richType payload, with valid IDs, titles, and thumbnails.
4. Select a returned video and ask a follow-up question; confirm the conversation remains attached to that selected video and its hydrated metadata/captions. Recheck the doctor search/table smoke test if deployment or adjacent Worker behavior changed.
5. If any verification fails, fix only the demonstrated cause on this branch, preserve all newer commits, then repeat the workflow and relevant live checks.
6. Append the verified deployed SHA, run URL/result, endpoint values, and smoke-test results here. Mark the work complete only when the live SHA matches and required smoke tests pass.

## Pinterest image search and doctor results table — initial work snapshot (2026-10-03; superseded by Current handoff above)

### Verified starting point
- Target: `devin/1774405518-init-dz-gpt`. Starting HEAD was verified as `c8e9fe8771d5f162276ea5c903c4ac4ed0f1b409` before edits.
- `lib/image-search/index.js` previously made Pinterest one of several merged providers, and the cache key did not include the selected source.
- `src/components/DoctorResultsPanel.tsx` combined address and phone in a three-column results table.

### Changes prepared
1. Resolve the selected image source before cache lookup and include it in the cache key. Explicit/classified Pinterest searches return only Pinterest image URLs; empty results retain a Pinterest search link rather than directing users to Wikimedia.
2. Warm up the Pinterest search page before requesting its search resource. The request sequence was informed by the MIT-licensed `iamatulsingh/pinscrape` project. Cookies are request-scoped and are not hard-coded or persisted. This endpoint behavior remains an implementation hypothesis until a real Pinterest request is verified.
3. Split doctor table fields into number, doctor, specialty, address/map, and phone columns, retaining RTL, profile/map/phone links and pagination.
4. Add `tests/image-search.test.js` and the `npm run test:image-search` script.

### Verification status and ordered next steps
- Changes are prepared but not yet pushed or verified. Local JavaScript syntax checks could not run because Node.js is unavailable in the conversation execution environment. Do not describe the build or deployment as successful until CI and live checks pass.
1. Commit these changes directly to this branch, then record the resulting commit SHA and GitHub Actions run.
2. Run `npm run test:image-search` and `npm run build`; inspect the complete workflow result for the exact pushed HEAD.
3. Verify the production version endpoint(s) against the exact deployed HEAD; a successful Worker deploy step alone is insufficient.
4. Smoke-test a Pinterest-selected search: returned image URLs should be from `i.pinimg.com`, with no Wikimedia results, and the empty-state link should lead to Pinterest. Confirm the actual Pinterest endpoint responds rather than treating the mocked regression test as proof of live access.
5. Smoke-test the doctor results table in RTL and on a narrow viewport; check all five headers, profile/map/phone actions, and pagination.
6. Append commit, CI, production version, Pinterest and doctor smoke-test evidence here. If a check fails, record the demonstrated cause and fix only that issue before repeating verification.


## DZ Radio — Cloudflare playback repair (2026-10-04)

### Confirmed live findings
- GET https://dzagent.app/api/radio/browser/algeria and GET https://dzagent.app/api/radio/stream/chaine1 both returned HTTP 200 with Content-Length: 0 and no Content-Type; the expected station JSON/audio payload was absent.
- Cloudflare account worker dzagent had 100% traffic on version 9e87a725-909b-438a-a277-569b2dfa58e6, deployed 2026-10-03 23:51 UTC. The deployed Worker bundle contains Express radio handlers, while workers/entry.js did not handle radio paths natively and forwarded them through the Express bridge.
- GET https://dzagent.app/api/version reported commit 86d45f591cbf97083cdc43fdac68ec78a913be26 and deployedAt 2026-09-21, so its version marker is older than the active Worker deployment; verify the exact post-deploy commit rather than assuming the marker is current.
- Radio Browser returned 75 Algerian station records; the main official stream records were marked lastcheckok=1. Fetch failures from the diagnostic sandbox are not evidence that those streams fail in a user's browser.
- RadioPlayerContext played url_resolved/url directly; Promise rejection could try station.url, but a later media error stopped playback immediately. Built-in official channels did not use the existing same-origin stream path.

### Changes in this repair
- Added Worker-native Radio Browser Algeria/search endpoints with explicit JSON and 503 responses when provider mirrors are unavailable.
- Added a fixed allowlist streaming proxy for seven official channel keys (eight built-in station IDs), passing audio/range headers and streaming the upstream body without buffering. Unknown keys return 404.
- Updated RadioPlayerContext to try the same-origin proxy for the built-in national stations, then retry resolved/direct station URLs on either play() rejection or media error; generation guards ignore failures from a previous selection.
- No Cloudflare zone route, domain, or Worker settings were changed.

### Deployment and verification
- The deploy-cloudflare-worker workflow runs on every push to devin/1774405518-init-dz-gpt and deploys production after build. The requested change is being delivered as one atomic commit to avoid deploying an intermediate state.
- Local Node.js is unavailable in the conversation execution environment; Worker source and the extracted player callback passed syntax checks here, but no local build has been claimed. The GitHub workflow build/deploy result and live smoke tests remain authoritative.
- After the workflow, verify its exact commit SHA against /api/version; verify the Algeria endpoint returns a non-empty JSON array; verify /api/radio/stream/chaine1 returns an audio response (not JSON/empty); and test playback in a browser if available. A successful deploy alone does not prove a user's specific device/network can play every station.


## 2026-10-04 — Radio Browser refresh and DZ Chat secret status

### Radio repair — verified state
- The upstream `segler-alex/radiobrowser-api-rust` README says the project moved to GitLab and identifies the official hosted API at `https://api.radio-browser.info`; the service regularly checks station availability. DZ-GPT consumes the Radio Browser JSON API through its Cloudflare Worker.
- Commit `49f87081424a535d5dd27801d6978c55c524dc42` updates `RadioPlayerContext.tsx`: when the API returns current stations, those records now replace the static Algerian station list; the static list is retained for API outage fallback. The normalized station name prevents static entries from overriding refreshed records. Playback now tries `url_resolved`/`url` before the legacy Worker proxy.
- GitHub Actions run #391 (`37171676001`) completed successfully for the exact commit, including application asset build, Worker deployment, production version checks, static-version fallback check, and YouTube production smoke test: https://github.com/Nadirinfograph23/DZ-GPT/actions/runs/37171676001
- Live `/api/version` and `/version.json` both report commit `49f87081424a535d5dd27801d6978c55c524dc42`. `/api/radio/browser/algeria` returns HTTP 200 with 75 records; all 75 had `lastcheckok=1` at verification time.
- `/api/radio/stream/chaine1` still returns HTTP 502. The current browser-first player no longer blocks on this proxy before trying the direct catalog URL. Five representative direct station URLs on distinct hosts returned HTTP 200 with `audio/mpeg` on bounded Range probes; response bodies were cancelled after headers.
- The Radio Browser entry for `Algérie Chaine 1` is marked healthy (`lastcheckok=1`), but a direct diagnostic fetch to its host from this execution environment failed with a network `TypeError`; this does not prove playback fails in a user's browser. End-to-end browser playback, especially Chaine 1, remains unverified.

### DZ Chat admin credential — verified configuration
- On 2026-10-04, Cloudflare Worker `dzagent` received a `DZ_CHAT_ADMIN_PASSWORD` `secret_text` binding. Cloudflare returned success and a name-only secret listing confirmed it exists. Never read, print, commit, or store its value.
- The current server code reads this runtime setting (legacy fallback `CHAT_ADMIN_SECRET`), derives a `scrypt` hash, and uses a timing-safe comparison. No password was added to source or docs. `DEPLOY_ADMIN_TOKEN` was not changed.
- No production admin-login test was run because `/api/chat-room/join` creates a session and broadcasts a join event. Verify owner login in a controlled browser/non-broadcast path and verify a guest cannot obtain admin privileges.

### Ordered continuation
1. Refresh the live radio page and play several fresh catalog entries; pay special attention to Chaine 1 because its proxy still returns 502 even though Radio Browser marks the station healthy.
2. If direct playback fails in a normal browser, inspect that station's current Radio Browser record and choose a working catalog entry or an authorized alternative stream; do not claim all stations play based only on API health checks.
3. Verify DZ Chat admin login and guest denial in a controlled path that does not create an unintended public join event; record the outcome without exposing the password.
4. Keep this file as the continuation map; never store the secret value here.


## 2026-10-04 — Radio all-station catalog and official stream repair

### Verified before the patch
- Target repository and branch remained Nadirinfograph23/DZ-GPT and devin/1774405518-init-dz-gpt; branch HEAD was 80af198208d402acafe7c923f2589e5d07eef5c3, and existing PR #53 is still the release PR. Update that PR; do not create a duplicate.
- The live Algeria Radio Browser endpoint returns 75 station records. A global healthy-station query with hidebroken=true and limit=250 returned 250 stations. The user's Online World Radio API endpoints remained unavailable and returned 404 HTML, so it is not used as a production dependency.
- The official Radio Algérie Chaine 1 page embeds my.radioalgerie.dz/player/chaine1.html. Its audio source, and the corresponding official Chaine 2, Chaine 3 and Quran player pages, point to TDA hosts under webradio1/2.tda.dz:8001. Bounded HEAD checks returned 200 audio/mpeg for all four official channels, plus the TDA Jil candidate.
- The deployed /api/radio/stream/chaine1 endpoint returned 502 before the patch. The Worker allowlist had only older Infomaniak/webcast candidates, not the current TDA sources. The tests support replacing the stale fallbacks; the post-deploy Worker response still needs verification.
- Cloudflare read-only inspection confirmed the active dzagent.app zone and dzagent Worker. No DNS, route, Worker setting or secret was read or changed during this repair.

### Implementation in this change
- Add a Worker-native /api/radio/browser/all endpoint for the top 250 healthy Radio Browser stations; continue loading the dedicated Algeria feed so the global cap does not omit the Algerian catalog.
- Merge both feeds with built-in fallbacks, classify Algerian records by DZ country code/country/category, and keep stream relay aliases for refreshed API station names so national records can use the fixed allowlisted Worker proxy after direct playback fails.
- Update the DZ Radio page to open on the All view and provide explicit All and Algeria-only tabs. Search stays available; clearing a search returns to All.
- Put current TDA stream URLs first in the fixed Worker fallback list for Chaine 1, 2, 3, Quran and Jil, retaining previous candidates behind them.
- No production configuration or secret changes. Push was authorized and triggers the existing Cloudflare deployment workflow automatically. The implementation and this handoff entry are in the same atomic commit.

### Ordered post-push verification
1. Resolve the exact new branch HEAD and its GitHub Actions run; do not cite the older 49f87081424a535d5dd27801d6978c55c524dc42 run as verification for this change.
2. Require the workflow's application build/tests and Worker deploy to pass for this exact SHA. Then compare /api/version and /version.json with the committed SHA.
3. Check /api/radio/browser/all returns a non-empty JSON array (up to 250 healthy stations) and /api/radio/browser/algeria still returns Algerian entries with countrycode DZ.
4. Send a bounded Range GET to /api/radio/stream/chaine1. Confirm the response has an audio content type and is not the previous JSON 502; cancel the body without downloading the stream.
5. In a real browser, check direct and proxy playback for Chaine 1/2/3 and a few fresh global records. API health and a proxy response do not prove playback in every user's browser/network.
6. Append the exact commit, workflow run and live smoke results when this handoff is next updated. If any check fails, capture the observed response and repair only that issue.
