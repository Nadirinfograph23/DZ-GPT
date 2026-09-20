# DZ Agent — ChatGPT Continuation Notes

## Current objective
Make DZ Agent understand and speak natural Algerian Darija, including Arabic-script Darija, Franco-Arabic, mixed French/English technical speech, spelling variants, and regional vocabulary.

## Existing Darija assets
- `data/dz_darija_corpus.json`: large existing corpus with 500+ vocabulary entries, grammar rules, sentence patterns, regional variants, Franco-Arabic and 200+ few-shot examples.
- `lib/darija-prompt.js`: builds the Darija system-prompt block.

## Latest Darija upgrade
Commit: `25dfc2cb1fd4395cdaece0a51c9e4a3be14d277a`

Changes:
- Added relevance-based retrieval from the existing corpus instead of always taking only the first entries.
- Vocabulary injection can now use up to 55 relevant entries (28 compact mode).
- Expressions can now use up to 28 relevant entries (14 compact mode).
- Few-shot examples can now use up to 18 relevant examples (8 compact mode).
- Added Arabic text normalization and simple corpus scoring.
- Added explicit understanding guidance for common variants:
  - واش / وش
  - علاش / عِلاه
  - كيفاش / كفاش
  - وين / فين
  - درك / دروك
  - بزاف / ياسر
  - ماكانش / ما كاش
  - تاع / نتاع / متاع
- Added Franco-Arabic and mixed technical examples such as:
  - wach, 3lach, kifach, rani, ma fhemtch
  - app, wifi, le lien, update, screenshot, login
- Added rules to understand typos, abbreviated chat writing and mixed Arabic/French/English.

## Design principle
Do NOT inject the whole Darija corpus into every prompt. Retrieve the most relevant vocabulary/examples for the current user message to keep context size and latency reasonable.

## Next expansion
Add a second curated extended Darija corpus with several hundred additional native-speaker examples covering:
- regional variants: Alger, Oran, Constantine, Annaba, Batna, Sétif, Biskra, Tlemcen, Béjaïa, Tizi Ouzou, etc.
- Franco-Arabic spellings and numeric forms: 3, 5, 7, 8, 9, 9a, etc.
- everyday conversation, humor, disagreement, clarification, emotions and indirect requests
- Algerian workplace/administrative language
- technical/mobile/AI/GitHub vocabulary in Algerian mixed speech
- common misspellings and phonetic spellings
- more question/answer few-shot pairs

Prefer curated examples over synthetic combinations.

## Important
Keep the existing corpus and retrieval system. Do not replace it or rewrite the project from scratch.

---

# ChatGPT Task Continuation — DZ-GPT / DZ Agent

## الهدف
إصلاح مسار المحادثة في مشروع `Nadirinfograph23/DZ-GPT` بحيث لا يتوقف DZ Agent عن الإجابة عندما يفشل مزود ذكاء اصطناعي واحد، وتوحيد مسار Cloudflare Worker مع نظام AI Router الموجود في المشروع.

## المشكلة الأصلية
عند سؤال بسيط مثل:
> سكان العالم

كان DZ Agent يعرض رسالة:
> لا أحصل حالياً على إجابة من مزودي الذكاء الاصطناعي...

بدلاً من الإجابة.

## ما تم اكتشافه
المشروع يحتوي على نظام متعدد المزودات جيد نسبياً في:
- `lib/ai-router/index.js`
- `lib/ai-sdk-stream.js`

لكن المسار المباشر في:
- `workers/entry.js`
كان يتجاوز `lib/ai-router` ويجرب Pollinations فقط قبل الوصول إلى fallback محلي.

هذا يعني أن تعطل Pollinations كان كافياً لإظهار فشل للمستخدم، حتى لو كانت مفاتيح Groq أو Gemini أو OpenRouter متوفرة.

كما أن `fetchChatDirect` كان يحتاج تمرير `env` للوصول الصحيح إلى أسرار Cloudflare Worker.

## التعديلات المنفذة
### Commit 1
`0aa91da4497a714a2f41b3f4452c5c8d4e800f2c`
تم فيه:
- تعديل `fetchChatDirect(request, env)`.
- تمرير `env` من Worker.
- تحسين fallback المحلي.
- منع رسالة فشل المزودات من أن تكون الرد الافتراضي.
- إضافة fallback مباشر لسؤال عدد سكان العالم.

### Commit 2
`42e2ab5e6b850dd794d4c45f9a845e0634ca6dc5`
تم فيه:
- ربط `/api/dz-agent-chat` المباشر في Cloudflare Worker مع:
  `lib/ai-router/index.js`
- استخدام `callAIRouter()` قبل Pollinations.
- تمرير `taskHint` إن أرسله العميل.
- الحفاظ على `max_tokens` مع حد أقصى 8192.
- إرجاع اسم النموذج والمزوّد وrequestId عند نجاح الـ router.
- إذا فشل الـ shared router، يستمر المسار القديم إلى Pollinations/fallback بدلاً من توقف الخدمة.

## سلسلة المزودات الحالية داخل AI Router
الـ Router يدعم مزودات كثيرة، أهمها:
- Groq
- Gemini
- OpenRouter
- Mistral
- Cerebras
- NVIDIA
- Hugging Face
- SambaNova
- Cohere
- DeepSeek
- Dahl
- Pollinations / keyless fallbacks

ويستخدم ترتيباً حسب نوع المهمة:
- `general`
- `multilingual`
- `technical`
- `retrieval`
- `reasoning`
- `translation`
- `code`
- `agent`
- `longcontext`
- `realtime`

## مفاتيح البيئة المهمة
الأسماء المستخدمة حالياً في المشروع تشمل:
- `AI_API_KEY`
- `AI_API_KEY_2` ... إلخ
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_AI_API_KEY`
- `OPENROUTER_API_KEY`
- `MISTRAL_API_KEY`
- `CEREBRAS_API_KEY`
- `NVIDIA_API_KEY`
- `HF_TOKEN`
- `SAMBANOVA_API_KEY`
- `COHERE_API_KEY`
- `DEEPSEEK_API_KEY`
- `DAHL_API_KEY`

لا تضع أي API key داخل Git أو هذا الملف. المفاتيح يجب أن تبقى في Cloudflare/Vercel/Replit environment secrets.

## المعرفة المحلية
يوجد fast-path في:
`lib/static-facts.js`

وهو يجيب فوراً عن مجموعة من الأسئلة الثابتة بدون LLM، ومنها:
- سكان العالم
- عواصم الدول
- حقائق الجزائر
- الرياضيات
- معلومات عامة

مثال:
`سكان العالم`
يُطابق نمط:
`/سكان\\s+(?:الأرض|العالم)|عدد\\s+سكان\\s+(?:الأرض|العالم)|.../i`

## ملاحظة مهمة عن النشر
التعديلات في GitHub لا تعني بالضرورة أن الموقع المنشور أصبح يستخدمها فوراً.
يجب التحقق من:
1. هل Cloudflare Worker / Vercel deployment تم بناؤه من آخر commit؟
2. هل أسرار البيئة موجودة في بيئة الإنتاج؟
3. هل `GROQ_API_KEY` أو `AI_API_KEY` متوفر؟
4. هل `GEMINI_API_KEY` متوفر؟
5. هل `OPENROUTER_API_KEY` متوفر؟
6. هل Worker يستخدم آخر deployment؟

## الاختبارات المطلوبة في الجلسة التالية
اختبر endpoint:
`POST /api/dz-agent-chat`

بأمثلة:
1. `سكان العالم`
2. `ما هي عاصمة فرنسا؟`
3. `اشرح لي الذكاء الاصطناعي`
4. `اكتب لي كود JavaScript بسيط`
5. سؤال بالعربية + الفرنسية
6. سؤال طويل/تقني
7. سؤال مع `taskHint=technical`
8. اختبار عندما يكون Groq غير متاح للتأكد من الانتقال إلى Gemini/OpenRouter.
9. اختبار عندما تكون كل المفاتيح غير متاحة للتأكد من fallback النهائي.

## المشكلة التي يجب مواصلة التحقيق فيها
يجب التأكد عملياً أن `lib/ai-router/index.js` يعمل داخل Cloudflare Workers مع `nodejs_compat_v2`، لأن الملف يستخدم:
- `node:http`
- `node:https`
- عدة modules داخل المشروع

إذا فشل dynamic import داخل Worker، لا تحذف AI Router. بدلاً من ذلك أنشئ نسخة Worker-native من provider router تستخدم `fetch()` فقط، مع نفس ترتيب المزودات ونفس منطق fallback.

## التصميم المستهدف
المسار النهائي المطلوب:

User
→ Static Knowledge Fast Path
→ Shared/Worker AI Router
→ Groq
→ Gemini
→ OpenRouter
→ Mistral / Cerebras / NVIDIA / HF / وغيرها حسب المهمة
→ Keyless/Pollinations
→ Local last-resort fallback

مع:
- timeout لكل مزود
- تجاوز 429/rate-limit
- تجاوز 5xx/network errors
- عدم كشف API keys
- عدم إظهار رسالة فشل تقنية للمستخدم
- logging داخلي للمزوّد الذي نجح
- حفظ `requestId`
- دعم العربية والفرنسية والإنجليزية
- الحفاظ على agent/tool functionality وعدم كسر المسارات الحالية

## قاعدة مهمة لـ ChatGPT في جلسة لاحقة
قبل تعديل أي شيء:
1. اقرأ هذا الملف بالكامل.
2. افحص آخر commit وحالة `workers/entry.js` و`lib/ai-router/index.js`.
3. لا تعيد إنشاء نظام AI Router من الصفر إذا كان الموجود قابلاً لإعادة الاستخدام.
4. لا تحذف Pollinations/keyless fallback.
5. لا تضع أي secrets في Git.
6. اختبر deployment بعد التعديل إن كانت أدوات Vercel/Cloudflare المتاحة تسمح بذلك.
7. عند كل إصلاح، حدّث هذا الملف في قسم "سجل التغييرات" مع commit SHA.

## سجل التغييرات
- 2026-09-20 — إصلاح Worker env + fallback المحلي — commit `0aa91da4497a714a2f41b3f4452c5c8d4e800f2c`
- 2026-09-20 — ربط Worker direct chat بالـ shared AI Router — commit `42e2ab5e6b850dd794d4c45f9a845e0634ca6dc5`

## الحالة الحالية
تم تنفيذ الربط الأساسي. الخطوة التالية ليست إعادة كتابة المشروع؛ بل:
**اختبار endpoint فعلياً، التأكد من deployment، ثم إصلاح أي مشكلة runtime في Cloudflare Worker، وبعدها إضافة/تحسين provider health checks وfallback إذا لزم.**


## سجل تغييرات 2026-09-20 — Darija + GitHub + Task Persistence

### Darija Extended
- أُضيف الملف `data/dz_darija_extended.json` — commit `e7ef739e1b5d11d5219915b6511880bdc47a6a11`.
- يحتوي على variants، مفردات تقنية جزائرية، تعبيرات محادثة، Arabizi، وأمثلة أصلية قصيرة.
- أُضيف retrieval سياقي إلى `lib/darija-prompt.js` بدل حقن corpus ضخم بالكامل — commit `b05e22fca090e3044d0ab52fcdeeace8b40332e9`.
- المرجع الخارجي المستخدم للتحقق من طبيعة code-switching وحجم الموارد: Algerian Darja Corpus (CC BY 4.0). لا يتم نسخ مقاطع طويلة من corpus إلى المشروع. citeturn0search2

### إصلاح زر GitHub
- أُصلح تحكم اتصال GitHub في `src/pages/DZAgentGitHub.tsx`.
- الزر أصبح يعيد فحص `/api/dz-agent/github/agent-status` ويعرض حالة الاتصال والحساب بدلاً من أن يكون مجرد badge ثابت.
- commit: `6018b498487f123ef484056126dc94554ac14cb9`.

### حفظ المهام في chatgpt.md — قاعدة دائمة
- أُضيف endpoint: `POST /api/dz-agent/github/task-log`.
- عند بدء كل مهمة من واجهة DZ Agent، تُرسل المهمة تلقائياً إلى endpoint ليتم حفظها في `chatgpt.md` عبر GitHub.
- commit: `db825615810df055e408eb40a84ce5095d7eaa74`.
- **قاعدة إلزامية للمستقبل:** كل مهمة/إصلاح/طلب تعديل يتم تنفيذه على المشروع يجب تسجيله في `chatgpt.md` مع التاريخ، الوصف، الحالة، وcommit SHA عند توفره. لا تبدأ جلسة تعديل جديدة بدون قراءة `chatgpt.md` أولاً.
- إذا فشل حفظ المهمة آلياً، يجب ألا يتم تجاهل ذلك بصمت في مسار الإدارة؛ يجب تسجيل سبب الفشل ضمن تقرير المهمة عند الإمكان.

### ملاحظة GitHub
المصادقة الحالية تعتمد على token موجود في بيئة الخادم. GitHub توصي باستخدام GitHub Apps عندما يكون ذلك مناسباً لأنها توفر صلاحيات أدق وtokens قصيرة العمر؛ OAuth apps تستخدم OAuth 2.0 أيضاً. citeturn0search0turn0search7


## سجل تحديث 2026-09-20 — ترقية رسالة التحديث العلوية
- تم تطوير `src/components/SiteAnnouncement.tsx`.
- أصبحت رسالة التحديث تعرض عنواناً، شارة NEW، الزمن النسبي، مؤشر حالة حي، وأيقونة حديثة، مع الحفاظ على SSE وAPI الحاليين.
- تم تطوير `src/styles/site-announcement.css` بتصميم premium، shimmer خفيف، responsive mobile، ودعم `prefers-reduced-motion`.
- Commits: `e9dc278d82cef68f9400b696bd3e21d504728764`, `41de06f7b446a168b9efc999c4722215dfaed4a2`.
- قاعدة دائمة: أي تعديل لاحق على رسالة/بانر التحديث يجب تسجيله هنا قبل اعتبار المهمة مكتملة.


## سجل مهمة 2026-09-20 — Live Research Brain بدون تغيير الإجابات الثابتة

### المطلوب
إضافة تقنية تجعل DZ Agent يكتشف تلقائياً الأسئلة التي تحتاج بحثاً حياً، ثم يجري بحثاً مباشراً ويستخدم النتائج مع AI Router، مع **عدم تغيير أو تجاوز الإجابات الثابتة الحالية**.

### التنفيذ
- أُضيف `lib/worker-live-search.js` — Worker-native بالكامل ويستخدم `fetch()` فقط.
- أُضيف كاشف نية بحث حي متعدد اللغات (العربية/الدارجة/الفرنسية/الإنجليزية) للأسئلة الزمنية، الحالية، صريحة البحث، والتحقق.
- تم الحفاظ على Static Knowledge Fast Path في `workers/entry.js` كما هو، ويُنفذ Live Research بعده فقط.
- مصادر البحث المجانية: SearXNG public instances كـ metasearch، مع دعم `SEARXNG_INSTANCES` لتخصيص instances؛ Google News RSS كمصدر إضافي مجاني؛ وWikipedia العربية كـ fallback معرفي.
- نتائج البحث لا تصبح إجابة خاماً؛ تُرسل إلى AI Router داخل سياق `[LIVE_WEB_RESEARCH]` ليقوم بتحليلها وصياغة الإجابة.
- تُرفق المصادر والروابط في استجابة API عبر `sources`.
- في حال فشل البحث الحي، يستمر المسار الحالي إلى AI Router/fallback بدون كسر المحادثة.
- لا توجد API keys داخل Git.

### Commits
- `4f5d2ef41747438a8670e1b52d4466d79a6aa4ff` — إضافة Worker Live Research Brain.
- `3a9503d396489401a4e5832489880ee96384f6cf` — ربط البحث الحي بمسار `workers/entry.js`.

### مصادر تقنية للتحقق
SearXNG يوثق `/search` و`format=json`، ويمكن للـ instance تشغيل محركات بحث متعددة حسب إعداداته. citeturn0search0turn0search11

### الحالة
تم تنفيذ الربط الأساسي. يلزم اختبار deployment فعلياً للتأكد من عمل instances العامة من بيئة Cloudflare، واختبار سؤال ثابت `سكان العالم`، وسؤال حالي، وسؤال صريح للبحث، وسؤال عادي لا يحتاج بحثاً.

### قاعدة دائمة
أي تعديل لاحق على Live Research Brain أو قرار SEARCH/NO_SEARCH يجب تسجيله في هذا الملف مع التاريخ، الوصف، الحالة وcommit SHA.


## سجل مهمة 2026-09-20 — إصلاح بطاقة الأخبار وإضافة RSS جزائرية عربية حية

### المطلوب
إصلاح بطاقة الأخبار الفارغة في DZ Agent مع الحفاظ على مصادر الأخبار الموجودة سابقاً، وإضافة طبقة RSS حية لمصادر صحفية ومواقع إخبارية جزائرية ناطقة بالعربية.

### التنفيذ
- تم الإبقاء على `FEED_MANIFEST` والمصادر الجزائرية الموجودة سابقاً.
- تم تحسين parser ليدعم RSS وAtom بشكل أكثر تحملًا، بما في ذلك `item/entry` و`link href` و`published/updated` وحقول المحتوى المختلفة.
- أضيفت `DZ_AR_LIVE_FALLBACK_FEEDS` عبر Google News RSS باستخدام `site:` لكل مصدر، لتوفير مسار حي عندما يتعطل RSS الأصلي للمصدر.
- أضيفت مصادر fallback لـ: الشروق أونلاين، الخبر، النهار أونلاين، البلاد، APS، إذاعة الجزائر، الحياة، الجمهورية، والمساء.
- عند فشل RSS الأصلي أو رجوعه فارغاً، يحاول المحرك تلقائياً RSS البديل للمصدر نفسه.
- تم منع تخزين نتيجة فارغة في cache حتى لا تبقى بطاقة الأخبار فارغة بسبب cache قديم.
- لم يتم تغيير منطق `renderNewsCards`; البطاقة تستمر في استخدام `title/url/source/pubDate/excerpt` من محرك الأخبار.

### التحقق الخارجي
المصادر التي أمكن التحقق من وجود تغذية لها تشمل الشروق (`/feed`) والبلاد (`/rss/`) والخبر (`/feed`)؛ كما يظهر موقع النهار نفسه قسم RSS. citeturn1search0turn1search7turn0search4

### Commit
- `311c4fef059f24434e3e1dde86b082032ae2898f` — إصلاح محرك الأخبار وRSS.

### الحالة
تم إصلاح طبقة جلب الأخبار في الكود. يلزم اختبار deployment فعلي للتأكد من امتلاء البطاقة في الإنتاج، لأن نجاح الوصول إلى RSS من بيئة Cloudflare/الإنتاج لا يمكن تأكيده من GitHub وحده.

### قاعدة دائمة
أي تعديل لاحق على بطاقة الأخبار أو مصادر RSS يجب تسجيله في `chatgpt.md` مع التاريخ والحالة وcommit SHA.


## سجل مهمة 2026-09-20 — إصلاح اتصال GitHub OAuth في DZ Agent

### المشكلة
واجهة DZ Agent كانت تشير إلى `/api/auth/github` بينما لم يكن مسار OAuth الفعلي موجوداً في Router، لذلك كان الضغط على اتصال GitHub يفتح مساراً غير مكتمل بدلاً من بدء مصادقة GitHub.

### التنفيذ
- إضافة `GET /api/auth/github` لبدء OAuth مع GitHub.
- إضافة `GET /api/auth/github/callback` للتحقق من state وتبادل code مع GitHub.
- إضافة حماية CSRF عبر state cookie.
- حفظ access token داخل cookie HttpOnly مشفّرة AES-256-GCM، دون وضع token في URL أو كشفه للواجهة.
- تمرير جلسة OAuth تلقائياً إلى مسارات GitHub CRUD الحالية دون تغيير عقد API للواجهة.
- تحديث `/api/dz-agent/github/agent-status` ليتعرف على جلسة OAuth.
- إضافة `POST /api/auth/github/logout` لمسح جلسة OAuth.
- دعم `GITHUB_REDIRECT_URI` إن كان مضبوطاً، وإلا يتم اشتقاق callback URL من host/proxy headers.

### متطلبات البيئة
يجب ضبط:
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- يفضّل `GITHUB_OAUTH_COOKIE_SECRET` كمفتاح تشفير مستقل؛ يستخدم الكود `GITHUB_CLIENT_SECRET` كبديل عند عدم وجوده.

لا توجد أسرار أو tokens داخل Git.

### Commit
- `3fadf93bac61601119b84cd35f504b8e477fb324` — `fix: implement GitHub OAuth connection for DZ Agent`

### الحالة
تم إصلاح المسار البرمجي داخل GitHub. يلزم الآن اختبار endpoint على deployment الفعلي، ثم التأكد من أن GitHub OAuth App يستخدم callback:
`https://dzagent.app/api/auth/github/callback`
إذا كان النشر الحالي على هذا النطاق.
