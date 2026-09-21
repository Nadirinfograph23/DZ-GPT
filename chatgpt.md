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

## سجل مهمة 2026-09-20 — ربط وكيل الصحة في DZ Tools بالمصدر المتخصص

### المطلوب
إصلاح إجابات وكيل الصحة داخل صفحة DZ Tools بعد ملاحظة ظهور إجابات غير موثوقة/هلوسة، وربطه بمصدر وكيل الصحة المتخصص بدلاً من مسار المحادثة العام.

### التنفيذ
- إضافة مسار مخصص `POST /api/dz-agent/health` داخل `server.js`.
- المسار يستخدم وظائف وكيل الصحة المتخصص: اكتشاف النية الصحية، قاعدة المعرفة المحلية، قواعد الطوارئ، وparser الصحي.
- عند وجود حالة طارئة، يتم استخدام Emergency Guard وfallback الصحي بدلاً من الاعتماد على ذاكرة النموذج.
- عند عدم وجود تطابق في قاعدة المعرفة، لا يتم تقديم التشخيص كحقيقة؛ يظهر للمستخدم أن قاعدة الوكيل لا تحتوي على مطابقة مباشرة.
- تحديث واجهة `src/pages/DZTools.tsx` لإرسال طلبات وكيل الصحة إلى endpoint المتخصص.
- عرض مصدر وكيل الصحة داخل النتيجة عندما تتوفر مطابقة في قاعدة المعرفة.
- الحفاظ على التنبيه بأن النتيجة استرشادية وليست تشخيصاً طبياً.

### Commits
- `627bb0887f89a0715cce25ce800af87d058e9db0` — ربط واجهة DZ Tools بوكيل الصحة المتخصص.

### الحالة
تم تسجيل التحديث في هذا الملف. يجب نشر فرع التطوير/دمج التغييرات في مسار النشر الإنتاجي حتى تظهر على `https://dzagent.app`.

### قاعدة دائمة
أي تعديل على وكيل الصحة أو مصدره أو قواعد السلامة الخاصة به يجب تسجيله هنا مع التاريخ وسبب التعديل وcommit SHA قبل اعتبار المهمة مكتملة.

## سجل نشر 2026-09-20 — ترقية التحديثات إلى Pull Request على المستودع الأصلي

- التحديثات الأخيرة موجودة على المستودع الأصلي `Nadirinfograph23/DZ-GPT` في الفرع `devin/1774405518-init-dz-gpt`.
- Pull Request الحالي: #38 نحو `main`.
- GitHub يبلّغ حالياً أن PR غير قابل للدمج بسبب تعارضات مع `main`؛ لذلك لم أعتبر الموقع المباشر محدثاً بعد.
- بعد حل التعارضات ودمج PR يجب التحقق من deployment ثم اختبار `https://dzagent.app`.

## سجل نشر 2026-09-20 — مزامنة فرع الإصدار مع main

- تم اعتماد `devin/1774405518-init-dz-gpt` كفرع الإصدار/المصدر.
- تمت مزامنة آخر `main` مع فرع الإصدار عبر merge commit: `510d47e89ff3ca2aba9fc18d45cc35db7f59024e`.
- تم الحفاظ على محتوى فرع الإصدار أثناء حل التعارضات، مع إضافة main كـ parent في سجل Git حتى يصبح PR نحو `main` قابلاً للدمج.
- الخطوة التالية: تحديث PR #38 والتحقق من CI، ثم دمجه في `main` إذا كانت الفحوصات تسمح بذلك.
- لا يُعتبر `https://dzagent.app` محدثاً حتى يتم الدمج وتشغيل deployment والتحقق الفعلي من الموقع.


## سجل مهمة 2026-09-20 — استرجاع مسار البحث عن طبيب في DZ Agent

### المطلوب
إرجاع السلوك السابق لبحث الأطباء داخل محادثة DZ Agent:
1. عندما يطلب المستخدم طبيباً بدون تحديد كامل، يطلب DZ Agent التخصص.
2. بعد تحديد التخصص، يطلب الولاية/مكان الطبيب.
3. بعد اكتمال التخصص والولاية، يتم استدعاء محرك البحث متعدد المصادر وإرجاع قائمة الأطباء المنظمة من المصادر الموجودة.
4. الحفاظ على البحث بالاسم ومسار نتائج الأطباء.

### التنفيذ
- تم استرجاع استمرارية المحادثة متعددة المراحل: إذا كان آخر رد من المستخدم اسم ولاية فقط مثل «باتنة»، يتم ربطه بسياق طلب الطبيب السابق واستخراج التخصص من الرسائل السابقة.
- تم منع tool: doctor من تعطيل مسار Doctor Search في محادثة DZ Agent؛ أدوات الصحة الأخرى تبقى معزولة.
- تم تصحيح عداد مصادر Doctor Search ليعكس المصادر السبعة الموجودة في lib/doctorSearch.js.
- لم يتم تغيير مصادر البحث أو بنية نتائج الأطباء الحالية.

### Commit
- `97611f93682c9956581fcefdca592ec906352a54` — `fix: restore multi-turn doctor search flow`

### الحالة
تمت استعادة المسار البرمجي على فرع الإصدار `devin/1774405518-init-dz-gpt`. يلزم اختبار المحادثة على deployment الفعلي للتأكد من أن الواجهة والإنتاج يستخدمان هذا الـcommit.

### اختبار مقترح
- المستخدم: «أريد طبيب»
- DZ Agent: يطلب التخصص.
- المستخدم: «قلب»
- DZ Agent: يطلب الولاية.
- المستخدم: «باتنة»
- DZ Agent: يبحث عن أطباء القلب في باتنة ويعرض النتائج والمصادر.


## سجل مهمة 2026-09-20 — استرجاع Doctor Search وDZ Maps في مسار Worker المباشر

### المشكلة
كان منطق Doctor Search وDZ Maps موجوداً في المشروع، بما في ذلك:
- `lib/doctorSearch.js`
- `modules/dz-maps/`
- استمرارية البحث متعددة المراحل في المسار القديم

لكن `/api/dz-agent-chat` في Cloudflare Worker كان يمر عبر `fetchChatDirect` مباشرة، وبالتالي كان يتجاوز هذه الوظائف قبل الوصول إلى AI Router.

### التنفيذ
- ربط `fetchChatDirect` بمسار Doctor Search قبل Static Knowledge وLive Research.
- استرجاع الحوار متعدد المراحل:
  - «أريد طبيب» → طلب التخصص.
  - «قلب» → طلب الولاية/المدينة.
  - «عنابة» → تشغيل `searchDoctors()` وإرجاع النتائج من المصادر الحالية.
- الحفاظ على عداد المصادر الحالي: 7.
- عدم توليد أسماء أطباء من النموذج؛ النتائج تأتي من `lib/doctorSearch.js`.
- ربط `fetchChatDirect` بمحرك `modules/dz-maps/index.js`.
- استرجاع البحث عن المرافق والأماكن مع خريطة OpenStreetMap/Leaflet والبيانات الموثقة من Nominatim/Overpass.
- مثال مستهدف: «مسجد الفرقان في عنابة» → البحث عن المكان وعرض الخريطة والنتائج وروابط OpenStreetMap.
- لم يتم تغيير مسار الإجابات الثابتة أو Live Research؛ أدوات Doctor Search وMaps تسبقها فقط عند اكتشاف النية المناسبة.

### Commit
- `91a7ee9d1ac8b2942a017033789392fcd805959e` — ربط Doctor Search وDZ Maps بمسار Worker المباشر.

### الحالة
تمت إعادة توصيل الوظائف الموجودة فعلياً في المشروع بمسار المحادثة الذي يستخدمه Cloudflare Worker. يلزم الآن اختبار deployment فعلياً، خصوصاً تشغيل `cheerio`/مصادر Doctor Search داخل Worker، ثم اختبار:
1. «أريد طبيب» → التخصص.
2. «قلب» → الولاية.
3. «عنابة» → النتائج.
4. «مسجد الفرقان في عنابة» → OpenStreetMap/Leaflet.

## سجل مهمة 2026-09-20 — إصلاح GitHub OAuth في DZ Agent

### التنفيذ
- إضافة مسار GitHub OAuth Worker-native قبل Express وrequest.json() لتجاوز مشكلة iconv-lite داخل Cloudflare Workers.
- اعتراض GET /api/auth/github وGET /api/auth/github/callback وPOST /api/auth/github/logout.
- استخدام OAuth state داخل HttpOnly/Secure/SameSite=Lax cookie.
- تشفير access token عبر WebCrypto AES-GCM بصيغة متوافقة مع decrypt الموجود في routes/github.js.
- الحفاظ على scope repo read:user وإعادة التوجيه بعد النجاح إلى /dz-agent/github?github=connected.

### Commits
- a86dec3273f500cf2aac12b4be92765a0f18c561 — إضافة Worker-native OAuth.
- 98127eea4f299cb20f6c36cfb64e4ae5f66f0f2f — تشغيل OAuth قبل Express parsing.

### الحالة
الإصلاح موجود على release branch. آخر deployment السابق كان يفشل في خطوة Cloudflare Deploy، لذلك يلزم نجاح deployment ثم اختبار OAuth فعلياً قبل اعتباره منشوراً.

## سجل مهمة 2026-09-20 — إصلاح خطأ بناء OAuth في Worker
- فشل نشر Cloudflare في run 35499547641 أثناء Wrangler بسبب خطأ نحوي في `workers/entry.js:163`.
- السبب: إدراج الحرف النصي `\\n` داخل JavaScript عند إضافة استدعاء GitHub OAuth قبل Express.
- تم تصحيح السطر ليصبح JavaScript صالحاً وإزالة التسلسل النصي غير الصحيح.
- commit: 25a37ad052187dea82b3c96ca9323ab21c5d649b.
- يجب انتظار نجاح Workflow التالي قبل اعتبار إصلاح OAuth منشوراً على الإنتاج.


## سجل مهمة 2026-09-20 — استرجاع عرض نتائج البحث عن الطبيب في جدول

### المطلوب
إرجاع نتائج Doctor Search إلى العرض الجدولي السابق، بدلاً من السماح بالتبديل إلى البطاقات داخل لوحة النتائج.

### التنفيذ
- تم تثبيت DoctorResultsPanel على العرض الجدولي TableView.
- أزيل مفتاح التبديل بين الجدول والبطاقات من واجهة نتائج الأطباء.
- تم الحفاظ على بيانات الطبيب الحالية: الاسم، العنوان والخريطة، الهاتف، التخصص، القرب ومؤشرات التطابق والمصادر.
- لم يتم تغيير محرك البحث أو مصادر الأطباء.

### Commit
- a1aabc94e6ba7850e32b82115d0f9ecbfce25589 — fix: restore doctor results table view

### الحالة
تم تنفيذ التعديل على فرع الإصدار devin/1774405518-init-dz-gpt. يجب نشر الفرع/دمجه ثم اختبار بحث طبيب فعلياً للتأكد من ظهور النتائج في جدول على الإنتاج.

### قاعدة دائمة
نتائج Doctor Search في واجهة DZ Agent يجب أن تظهر افتراضياً وبشكل ثابت في جدول واضح وقابل للتمرير، مع الحفاظ على بيانات الاتصال والخريطة والمصادر.


## سجل مهمة 2026-09-20 — التعرف على طلب الطبيب الكامل (التخصص + المكان)

### المطلوب
عند الضغط على «ابحث عن طبيب»، يطلب DZ Agent التخصص ثم المكان. وعند إدخال طلب كامل مباشرة مثل «طبيب أسنان في عنابة» يجب أن يتعرف عليه كطلب Doctor Search منظم بدلاً من تمريره إلى المسار الطبي العام.

### التنفيذ
- توسيع `lib/intent.js` للتعرف على صيغ عربية كاملة للتخصص + المدينة، مثل «طبيب أسنان في عنابة» و«طبيب قلب باتنة».
- إضافة دعم للصيغ الفرنسية مثل «dentiste à Annaba» و«cardiologue à Oran».
- إبقاء مسار Doctor Search الحالي ومصادره وواجهة الجدول دون تغيير.
- عند التعرف على النية، يستمر الطلب في مسار البحث المنظم الذي يعيد بيانات الأطباء في الجدول، مع العنوان القابل للفتح في Google Maps والهاتف والمصادر.

### Commit
- `aa57a7d80583ad2753bb4573c328baa0283c8fb1` — `fix: detect complete doctor specialty and city queries`

### الحالة
تم تحديث كاشف النية على فرع الإصدار. يلزم نشر/دمج الفرع ثم اختبار:
1. «ابحث عن طبيب» → يطلب التخصص.
2. «أسنان» → يطلب المكان.
3. «عنابة» → يعرض الجدول.
4. «طبيب أسنان في عنابة» → يتعرف مباشرة على الطلب الكامل ويعرض مسار Doctor Search.


## تصحيح مهمة 2026-09-20 — استرجاع الإجابات الثابتة الأصلية لبحث الطبيب

تم التحقق من الكود التاريخي في `server.js` داخل commit `72a289e9095bdb05ffb6241753f8bd456b922e79`، واتضح أن المطلوب ليس فقط كشف صيغة «طبيب أسنان في عنابة»، بل استرجاع **الإجابات الثابتة الأصلية** لمسار Doctor Search.

### السلوك المستعاد
- «أريد طبيب» / الضغط على «ابحث عن طبيب» → رسالة ثابتة تطلب التخصص وتعرض أمثلة للتخصصات والولايات.
- ذكر التخصص فقط → رسالة ثابتة تطلب الولاية/المدينة.
- ذكر التخصص + المدينة مثل «طبيب أسنان في عنابة» → تشغيل البحث المنظم مباشرة.
- ذكر المدينة بعد اختيار التخصص → استخدام سياق المحادثة السابق واستخراج التخصص ثم تشغيل البحث.
- النتائج النهائية تستخدم `lib/doctorSearch.js` و`formatResults` وتظهر في الجدول مع العنوان القابل للفتح على Google Maps والهاتف والمصادر.

### Commits
- `88e1bdf88760c471e414984bc2ccb051237f1c05` — استعادة منطق الإجابات الثابتة وبناء Doctor Search Worker-native.
- `e8334024a299b8a8e8566782deba7e3f5872d277` — توجيه مسار المحادثة إلى الإجابات الثابتة قبل Static Knowledge وLive Research وAI.

### الحالة
تمت استعادة الخاصية من الكود التاريخي بدلاً من الاكتفاء بإضافة regex للتعرف على الطلب الكامل. يلزم الآن اختبار Worker بعد النشر بهذه الحالات: «أريد طبيب»، «أسنان»، «عنابة»، و«طبيب أسنان في عنابة».


## 2026-09-20 — Restore original Doctor table + DZ Maps

- Inspected historical doctor-search implementation, especially commit 72a289e9095bdb05ffb6241753f8bd456b922e79.
- Restored the original four-column doctor table in the UI: اسم الطبيب | الاختصاص | العنوان | الهاتف.
- Kept the address cell clickable and opening Google Maps using precise coordinates when available, with a search fallback otherwise.
- Restored Worker-side DZ Maps interception so place queries such as "مسجد في عنابة" use the existing OpenStreetMap/Leaflet map engine instead of falling through to AI.
- Preserved the existing deterministic doctor fixed-answer flow and live multi-source doctor search.
- Commits: 4f72e50d5ae8dceef41e865100356830e24e3ab5, d5118ebed66fe46dd0b42d30c252c8ff7a5aa0a3.


## 2026-09-20 — Deep historical restore of doctor sources/table

- Re-inspected repository history instead of relying only on the current branch.
- Historical commit 8de18e9957a928cccced2f510f009c7eb1e8634c contained the upgraded Algerian doctor directory aggregator with 10 sources: SahaDoc, Algerie-Docto, Addalile, SALIM-DZ, PJ-DZ, Docteur360, Sihhatech, Machrou3, Beesiha, and Altibbi.
- Restored that historical source aggregation into lib/doctorSearch.js while keeping the mandatory Markdown table output and clickable Google Maps/tel links.
- Restored the historical DoctorResultsPanel from commit 186f52d710dbb3216a4e12aa717913f98bca143f, including source badges/links.
- Added UI labels for SALIM-DZ and Altibbi.
- Commits: a73267e69894dcfc730a2923b8816594dcf7127d, ff751bd86d7bde6a1a7b75d012d6822a12213b8d, 4856aa08414a6810589ad3c7e60d476080cebae6, 7b3857d22cc4ed0c0326474c5c4dabf7fb3565bd.


## 2026-09-20 — Restore direct “ابحث عن طبيب” conversation flow
- Confirmed the Worker already contains the restored deterministic Doctor Search state machine: clicking the doctor entry should begin with “أريد طبيب”, then ask for specialty and wilaya, and a complete query such as “طبيب أسنان في عنابة” goes directly to doctor search.
- Confirmed the Worker calls handleWorkerDoctorSearch(...) before the AI fallback.
- Fixed src/components/DZDashboard.tsx so clicking the dashboard “نحوس على طبيب؟” entry immediately sends `أريد طبيب` instead of first forcing the GPS popup. This restores the intended original conversational flow; GPS remains optional through the existing GPS path.
- Commit: f502f09be36047f14059bce5231ca546863b0f11.


## 2026-09-20 — Verify historical doctor table + DZ Maps/OpenStreetMap flow
- Inspected historical Doctor Search implementations and confirmed the intended UI is the RTL ordered table from commit 186f52d710dbb3216a4e12aa717913f98bca143f: number, doctor, address/phone, specialty, and sources, with the address opening Google Maps.
- Confirmed commit 72a289e9095bdb05ffb6241753f8bd456b922e79 explicitly restored table-only doctor results, while 68269df5d3e0de02e65e367b9a46cfbb9bb39532 added RTL table/name search and Machrou3.
- Inspected historical DZ Place Search commit 21b910d63f767aa95799d34413bb5d901353432c: OpenStreetMap Nominatim place search, 58 wilayas, 12 POI types, and Leaflet mini-map. Current Worker also intercepts place queries through modules/dz-maps before AI, restoring queries such as “مسجد في عنابة”.
- Corrected the Worker doctor result metadata from 8 to the restored 10-source directory set.
- Latest code fix: 85be7226bece8582b2be6b7d7cf7077773305c6eb.


## 2026-09-20 — Restore historical doctor table source links
- Restored the historical doctor-table behavior: structured RTL table with doctor name, address, phone, specialty, and source information.
- Kept the ten-source Algerian doctor aggregation and merge/dedup logic already present in lib/doctorSearch.js.
- Restored clickable source badges in DoctorResultsPanel using the merged sourceUrls data, so each listed source can open its corresponding doctor/directory page.
- Address links continue to use Google Maps URLs with coordinates when available, otherwise an encoded doctor/city search; Google documents that these universal Maps URLs open the Google Maps app on Android when installed, or the browser otherwise. 
- Updated the doctor source-list documentation comment to include all ten restored sources.
- Commits: f5b170c61ddc821fa211abadd6322fb3ff82d490 and feb1327733606e123e1771cf036b1ab811ffe755.


## 2026-09-20 — Fix GitHub OAuth routing in Cloudflare Worker
- Found the remaining OAuth integration issue: the Worker-native GitHub OAuth handler existed, but `/api/auth/github`, its callback, and logout were not routed to it from the top-level Worker fetch path; they could fall through to the Express bridge.
- Routed all three GitHub OAuth endpoints through the Worker-native handler before the Express bridge.
- Fixed the OAuth callback to emit two separate `Set-Cookie` headers instead of joining them with a comma, preserving both the OAuth-state cleanup cookie and encrypted GitHub token cookie correctly.
- Commit: 7d5517b33265d9411df0f399b5334a21b47a576a.

- 2026-09-20 — Production deployment fix: updated `.github/workflows/deploy-cloudflare-worker.yml` so the Cloudflare Worker deploy runs on both the release branch and `main`. The previous workflow only watched the release branch, so merging the PR into `main` could leave the live site on an older Worker build. Commit: `0a44a6b8fec640e1bfb685ec7b5582ef036e4b59`.


## سجل مهمة 2026-09-21 — إصلاح جدول بحث الأطباء ومصادر النتائج

### المطلوب
إصلاح حالة بحث الطبيب لأن الجدول لم يكن يظهر بشكل موثوق، وكانت قائمة المصادر شبه فارغة، مع الالتزام بالعمل على الفرع الدائم:
`devin/1774405518-init-dz-gpt`.

### فحص الكود
- تم العثور على جدول نتائج الأطباء فعلياً داخل `src/components/DoctorResultsPanel.tsx`، وهو جدول HTML مخصص وليس `DoctorResultsTable.tsx` على هذا الفرع.
- تم العثور على محرك الجداول العام في:
  - `src/components/tables/DZSmartTable.tsx`
  - `src/hooks/useTableEngine.ts`
  - `src/lib/table-engine/types.ts`
- المشروع يستخدم بالفعل TanStack Table/React Table، لذلك لم تتم إضافة مكتبة جداول خارجية بلا حاجة. TanStack Table موثق كمحرك headless يترك طريقة العرض والتنسيق للتطبيق. citeturn0search5turn0search0

### مصادر الأطباء
تمت مراجعة المصادر الخارجية مباشرة. DZDOC يعرض بحثاً حسب التخصص والولاية، وصفحات نتائج فعلية للأطباء؛ وDocteur360 يعرض صفحات بحث حسب التخصص والموقع وملفات الأطباء التي تتضمن العنوان، وبعض النتائج تتضمن أرقام الهاتف. citeturn2view0turn4search0turn4search11

### التنفيذ
- تم استبدال قائمة المصادر القديمة المتعددة في `lib/doctorSearch.js` بمصدرين فعليين فقط حسب المطلوب:
  1. DZDOC — `https://dzdoc.com/`
  2. Docteur360 — `https://docteur360.com.dz/`
- أضيف parser حي لـ DZDOC يكتشف قيم التخصص/الولاية من نموذج الموقع نفسه، ثم يقرأ روابط ملفات الأطباء ويثري النتائج من صفحات الملفات عند الحاجة بالهاتف والعنوان.
- أضيف parser حي لـ Docteur360 باستخدام صفحات `/specialiste/{specialite}/{wilaya}/{wilaya}` وقراءة روابط ملفات الأطباء والعنوان والهاتف من النتائج.
- أضيفت إزالة التكرار داخل مصدر Docteur360.
- أضيفت تسمية `DZDOC` في واجهة المصادر داخل جدول الأطباء.
- تم الحفاظ على الحقول المطلوبة في الجدول: اسم الطبيب، التخصص، العنوان، رقم الهاتف. العنوان يبقى رابط Google Maps، والهاتف يبقى رابط `tel:`.

### Commit
`7d3d73561ad18a53352245deee49dbe364ae2422` — `fix: use live DZDOC and Docteur360 doctor sources`

### حالة النشر
التعديل موجود على فرع `devin/1774405518-init-dz-gpt`. يجب تشغيل CI ثم نشره إلى الإنتاج قبل اعتبار الإصلاح ظاهراً في `https://dzagent.app`.

### قاعدة دائمة
أي تعديل لاحق على بحث الأطباء يجب أن يحافظ على مصدرَي DZDOC وDocteur360، وعلى جدول النتائج وروابط Google Maps والهاتف، مع تسجيل الخطوات والـ commit في هذا الملف.


## 2026-09-21 — استرجاع جدول بحث الأطباء من إصدار تاريخي
- تمت مراجعة سجل GitHub للإصدارات السابقة الخاصة ببحث الأطباء.
- تم العثور على الإصدار التاريخي الذي أعاد عرض جدول Markdown للأطباء، خصوصاً commit `9a60977fe2273e108f9ae82b5a0134e54e4e3b70` لإصلاح فواصل الأسطر في الجدول، مع تاريخ سابق لواجهة الجدول في `4856aa08414a6810589ad3c7e60d476080cebae6`.
- بدلاً من استبدال ملفات الإصدار الحالي، تم دمج **وظيفة الجدول فقط** داخل `lib/doctorSearch.js` للحفاظ على تحديثات DZDOC وDocteur360 الحالية.
- الجدول الحالي في إجابة البحث أصبح 4 أعمدة واضحة: اسم الطبيب، الاختصاص، العنوان مع رابط Google Maps، الهاتف مع رابط الاتصال.
- تم إبقاء مصادر البحث الحالية كما هي وعدم الرجوع إلى المصادر القديمة.
- تم تحديث العدد الافتراضي للمصادر المعروض في ملخص الإجابة من 10 إلى 2 لأنه يعكس المصدرين النشطين حالياً.
- Branch: `devin/1774405518-init-dz-gpt`
- Commit: `041aca1fbd48766a27d67b93406cb995c50765b2`


## 2026-09-21 — إصلاح سبب عدم ظهور جدول الأطباء
- التدقيق في المسار الكامل كشف أن واجهة `DoctorResultsPanel` كانت موجودة فعلاً وتحتوي على `TableView`، لكن صفحة `DZTools` كانت تستدعي `/api/dz-agent/doctor-search` بينما Worker كان يمرر هذا المسار إلى Express، في حين أن تدفق البحث الأصلي داخل Worker كان يعيد `content` Markdown فقط.
- هذا يعني أن الواجهة لم تحصل على `doctorData.results` الذي تحتاجه لإظهار React table.
- تمت إضافة endpoint Worker-native مباشر: `POST /api/dz-agent/doctor-search` يعيد `results` المنظمة من `searchDoctors()` مع بيانات المصادر، العنوان، الهاتف، والإحداثيات.
- تم إبقاء التدفق القديم الثابت في الدردشة دون تغييره، وأصبح المسار الخاص بواجهة البحث يستخدم نفس محرك البحث الحالي.
- تم تصحيح عدد المصادر في رسالة البحث إلى مصدرين نشطين فقط: DZDOC وDocteur360.
- Branch: `devin/1774405518-init-dz-gpt`
- Commits: `eef92abb5173de13a14538d641765635e9d43c93` وcommit تصحيح source count لاحقاً.


## 2026-09-21 — تسريع وصول تحديثات الفرع إلى الإنتاج
- تم تدقيق مسار النشر ووجد أن الفرع المطلوب يحتوي Workflow خاصاً بـ Cloudflare Worker، لكن آلية التحقق من الإنتاج كانت غير كافية.
- تم تحديث `.github/workflows/deploy-cloudflare-worker.yml` على الفرع `devin/1774405518-init-dz-gpt` ليشمل توليد `public/version.json` و`data/build-info.json` من `GITHUB_SHA`، ثم نشر Worker، ثم التحقق من أن `https://dzagent.app/version.json` يعرض نفس commit قبل اعتبار النشر ناجحاً.
- Workflow الفرع مضبوط ليعمل على push إلى `devin/1774405518-init-dz-gpt` وكذلك `main`، ما يجعل كل commit جديد على الفرع مؤهلاً لتشغيل النشر دون انتظار merge.
- ملاحظة: الفرع حالياً متشعب عن main (12 commits ahead و43 behind)، لذلك لا يتم دمجه قسراً أو الكتابة فوق main تلقائياً لأن ذلك قد يؤدي إلى استبدال تغييرات الإنتاج. تم الاكتفاء بتقوية مسار النشر على الفرع المطلوب.
- Commit الخاص بتحسين Workflow: `116eba2b2576f2a01a5ae4eec48cd8dd89313f3c`.


## 2026-09-21 — إصلاح سبب رجوع بحث الأطباء إلى روابط فقط
- تم تدقيق الإجابة الفعلية التي كانت تظهر: «لم تتوفر بيانات مفصلة — روابط البحث المباشر في المصادر».
- السبب الجذري في `lib/doctorSearch.js`: قائمة `SOURCES` كانت ما تزال تستدعي المصادر القديمة (sahadoc/algerie-docto/...), بينما تم تطوير fetchers حيّة لـ DZDOC وDocteur360 لكنهما لم يكونا ضمن القائمة التنفيذية. لذلك كانت النتائج تصل كـ `directoryLink` فقط، فيسقط `formatResults()` إلى جدول روابط بدل جدول الأطباء.
- تم تعديل `SOURCES` على الفرع الإلزامي `devin/1774405518-init-dz-gpt` لتشغيل المصدرين المطلوبين فقط: `fetchDzdoc` و`fetchDocteur360Live`.
- تم تقوية التقاط روابط/بطاقات Docteur360 حتى لا يعتمد parser على صيغة رابط واحدة فقط.
- تحقق خارجي بتاريخ 21/09/2026 أكد أن DZDOC يعرض نتائج حقيقية لـ Chirurgien dentiste في Annaba، وأن Docteur360 يعرض نتائج حقيقية مع العناوين وأرقام الهاتف في بعض السجلات.
- commit: `9b1392015de26d9db012bab326550eb3b4385717`.
- بعد نشر هذا commit، يجب أن يتحول الطلب «طبيب أسنان في عنابة» إلى بيانات منظمة `results[]` ثم تظهر واجهة الجدول بأعمدة: اسم الطبيب، الاختصاص، العنوان، الهاتف؛ وليس جدول «روابط البحث».
