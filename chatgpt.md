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
