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
