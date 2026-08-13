# DZ-GPT Agent Memory

- [Maps intent classifier pitfalls](maps-intent-pitfalls.md) — كلمات الوثائق الإدارية في POI labels تُسبب false map routing؛ الحل في NON_MAP_REGEXES.
- [GitHub push auth](github-push-auth.md) — git push يحتاج token في remote URL، لا username/password.
- [Deploy workflow](deploy-workflow.md) — الفرع النشط devin/1774405518-init-dz-gpt؛ Vercel عبر deploy hook.
- [Vercel hook format](vercel-hook-format.md) — قيمة hook يجب أن تكون رابط HTTP(S) كاملاً، لا token أو hostname فقط.
- [Live news cold-start](news-cold-start.md) — ابدأ RSS المباشر وGoogle News بالتوازي قبل مهلة الإقلاع القصيرة لتفادي fallback كاذب.
- [Cloudflare iconv compatibility](cloudflare-iconv.md) — عطّل امتدادات Node في iconv-lite داخل Worker قبل أن يجمّع Wrangler الحزمة.
- [Cloudflare Express bridge](cloudflare-express-bridge.md) — مرّر JSON المحلل مسبقاً إلى Express؛ body-parser قد يتجمّد على تيار الطلب اليدوي داخل Workers.
