# 🗺️ SERVER_MAP — خريطة server.js الكاملة

> **ملف التنقل الرئيسي لوكلاء الذكاء الاصطناعي وفريق التطوير**
> آخر تحديث: يونيو 2026 | الملف: `server.js` (~30,300 سطر)
>
> للوصول السريع: `grep -n "ZONE-XX" server.js`

---

## الهيكل العام

```
server.js
├── ZONE-01  Bootstrap & Imports          (~1–75)
├── ZONE-02  Lib/Module Mounts            (~76–201)
├── ZONE-03  Express Middleware           (~202–380)
├── ZONE-04  Utility Functions            (~380–1040)
├── ZONE-05  Modular Route Mounts         (~1042–1065)
├── ZONE-06  Ratings / Status / Health    (~1066–1182)
├── ZONE-07  Thinking Trace SSE           (~1182–3140)
├── ZONE-08  System & Admin APIs          (~3140–3572)
├── ZONE-09  Owner Commands & News        (~3572–4739)
├── ZONE-10  Website Builder / DZ Chat    (~4739–7180)
├── ZONE-11  Education Search             (~7180–7475)
├── ZONE-12  Clone Engine + Lessons       (~7475–7795)
├── ZONE-13  DZ Agent Search              (~7795–8465)
├── ZONE-14  RSS + Breaking News Stream   (~8465–9129)
├── ZONE-15  Dashboard + Sync             (~9129–9893)
├── ZONE-16  Maps + Prayer + Weather      (~9893–10480)
├── ZONE-17  LFP + News + Sports Data     (~10481–11434)
├── ZONE-18  GitHub Operations            (~11435–13572)
├── ZONE-19  Sports Agent API             (~13573–13772)
├── ZONE-20  Currency + DZ Dollar         (~13772–14200)
├── ZONE-21  Telegram + Sync + Deploy     (~14200–14600)
├── ZONE-22  ★ MAIN DZ-AGENT-CHAT ★      (~14600–21445)  ← أهم قسم
├── ZONE-23  Streaming SSE Endpoint       (~21445–21620)
├── ZONE-24  Analytics                    (~21620–21700)
├── ZONE-25  GitHub OAuth + Repos         (~21700–22557)
├── ZONE-26  GitHub Code Agent            (~22557–25069)
├── ZONE-27  AI Free Media                (~25069–25135)
├── ZONE-28  DZ Tube / YouTube            (~25135–27697)
├── ZONE-29  Chat Room                    (~27111–27697)
├── ZONE-30  Image Tools                  (~27697–28865)
├── ZONE-31  Video + TTS                  (~28865–29385)
├── ZONE-32  ChatImg + DZ Media           (~29385–29680)
├── ZONE-33  Radio Stations               (~29680–29760)
├── ZONE-34  Books + Whiteboard + Bugs    (~29760–29960)
└── ZONE-35  DZ Agent V4 Media            (~30107–30308)
```

---

## تفاصيل كل قسم

### ZONE-01 — Bootstrap & Imports `(~1–75)`
**الوصف:** متغير `build`، استيراد Express/Helmet/CORS/WS، معالج الأخطاء العالمي.
**الملفات الرئيسية:** `express`, `helmet`, `ws`, `compression`
**عناصر بارزة:**
- `process.on('uncaughtException')` — منع انهيار السيرفر
- `process.on('unhandledRejection')` — التقاط الرفض الصامت

---

### ZONE-02 — Lib/Module Mounts `(~76–201)`
**الوصف:** استيراد كل الأنظمة الفرعية المُستقلة وتهيئتها (وكلاء، مهارات، أدوات، رياضة...).
**العناصر الرئيسية:**
| الاستيراد | الوصف |
|-----------|-------|
| `mountSmartAgent` | الوكيل الذكي الأساسي |
| `mountDzAgentV2/V3/V4/V5` | طبقات الوكيل المتطورة |
| `mountAutonomousAgent` | الوكيل الذاتي (ReAct + ToT) |
| `runReActLoop` | محرك التفكير الاستنتاجي |
| `runSportsAgent` | الوكيل الرياضي متعدد المصادر |
| `detectMatchVsQuery` | كاشف استعلامات "X ضد Y" |
| `buildWC2026GroupTableData` | جداول كأس العالم 2026 |
| `DEVELOPER_LOCK_LAYER` + `ADVANCED_INJECTION_GUARD` | طبقات حماية system prompt |

---

### ZONE-03 — Express Middleware `(~202–380)`
**الوصف:** إعداد Helmet، CORS، Rate Limiting، compression، body-parser، static files.
**عناصر بارزة:**
- `aiLimiter` — 30 req/min لنقاط الـ AI
- `githubLimiter` — 20 req/min لنقاط GitHub
- Helmet CSP للأمان

---

### ZONE-04 — Utility Functions `(~380–1040)`
**الوصف:** دوال مساعدة مشتركة تُستخدم في كل أنحاء السيرفر.
| الدالة | الوصف |
|--------|-------|
| `sanitizeString(str, maxLen)` | تنظيف المدخلات |
| `resolveGitHubToken(reqToken)` | استخراج توكن GitHub الصحيح |
| `resilientFetch(url, opts)` | fetch مع retry/throttle/timeout |
| `makeCache(ttlMs)` | إنشاء cache بـ TTL مخصص |
| `fetchWeatherOpenMeteo(city)` | طقس من open-meteo |
| `fetchWeatherByCoords(lat, lon)` | طقس بالإحداثيات |
| `fetchCurrencyResilient()` | سعر الصرف مع fallback |
| `preloadEssentialData()` | تحميل مسبق عند البدء |
| `isDeveloperOrOwnerQuestion(msg)` | كشف أسئلة هوية النموذج |
| `isPersonQuery(msg)` | كشف أسئلة الشخصيات |
| `getGroqKeys()` + `getOrderedKeys()` | إدارة مفاتيح Groq بالتوازن |
| `validateAIContent(text)` | التحقق من نظافة رد الـ AI |
| `finalResponseGuard(response)` | حارس جودة الرد النهائي |
| `detectMatchVsQuery(msg)` *(~8226)* | كاشف مباريات "X ضد Y" + تصنيف زمني |

---

### ZONE-05 — Modular Route Mounts `(~1042–1065)`
**الوصف:** تحميل الـ routers المُعاد بناؤها (Phase 1 refactoring) — Voice، Quran، Admin، Excel، Health، Owner، GitHub.
```js
app.use('/api', voiceRouter)
app.use('/api', createQuranRouter())
app.use('/api', createAdminRouter(...))
app.use('/api', createGitHubRouter(...))
```

---

### ZONE-06 — Ratings / Status / Health `(~1066–1182)`
**الوصف:** نظام تقييم الردود (👍/👎) + فحص الاتصال + حالة الوكيل.
| Endpoint | الوصف |
|----------|-------|
| `POST /api/dz-agent/ratings` | تسجيل تقييم رسالة |
| `GET /api/dz-agent/ratings/stats` | إحصائيات التقييمات |
| `GET /api/dz-agent/preload-status` | حالة التحميل المسبق |
| `GET /api/dz-agent/connectivity` | فحص اتصالات خارجية |
| `GET /api/dz-agent/agent-status` | حالة كل الوكلاء |

---

### ZONE-07 — Thinking Trace SSE `(~1182–3140)`
**الوصف:** نقطة النهاية الأضخم لمحاكاة التفكير المرئي — 6 أدوار تتداول عبر SSE.
```
POST /api/dz-agent/thinking-trace
```
**الأدوار الستة:**
- 🧭 Planner — يُخطط للمهمة
- 🔬 Researcher — يبحث ويجمع المعلومات
- 🏗️ Architect — يصمم الحل
- 🐛 Debugger — يراجع ويكتشف الأخطاء
- 🧠 Memory Optimizer — يضغط السياق
- ⚖️ Critic — يقيّم ويحسّن

**تنسيق SSE المُرسَل:**
```
data: {"role":"planner", "token":"...", "done":false}
data: {"role":"critic",  "token":"...", "done":true}
data: [DONE]
```

---

### ZONE-08 — System & Admin APIs `(~3140–3572)`
**الوصف:** مراقبة حالة النظام، إحصائيات مفاتيح Groq، نتائج البحث، صحة الـ AI router.
| Endpoint | الوصف |
|----------|-------|
| `GET /api/groq-key-stats` | إحصائيات مفاتيح Groq |
| `GET /api/dz-agent/search-steps` | خطوات البحث الأخيرة |
| `GET /api/system-health` | صحة السيرفر الكاملة |
| `GET /api/ai-router/health` | صحة الـ AI router |
| `GET /api/admin/router-diagnostic` | تشخيص مسارات الـ AI |
| `GET /api/admin/groq-keys` | قائمة مفاتيح Groq |
| `POST /api/admin/test-provider` | اختبار مزود AI |

---

### ZONE-09 — Owner Commands & Breaking News `(~3572–4739)`
**الوصف:** نظام أوامر المالك (تدريب مباشر)، تصويت على الأخبار العاجلة، إدارة RSS feeds.
| Endpoint | الوصف |
|----------|-------|
| `POST /api/owner/command` | أمر مباشر من المالك |
| `GET /api/owner/config` | إعدادات المالك |
| `GET/POST/DELETE /api/owner/breaking-feeds` | إدارة feeds العاجلة |
| `GET /api/generate-report` | توليد تقرير شامل |
| `GET /api/breaking-news/stream` | بث الأخبار العاجلة SSE |
| `GET /api/national-team/news` | أخبار المنتخب الوطني |

---

### ZONE-10 — Website Builder / DZ Chat `(~4739–7180)`
**الوصف:** نظام بناء المواقع التلقائي + المحادثة العامة للـ DZ Chat.
**عناصر بارزة:**
- `WEBSITE_BUILDER_SYSTEM_PROMPT` — تعليمات بناء المواقع 2026-aesthetic (~4740)
- `REACT_PREFIX` / `applyReactLoop()` — تطبيق ReAct على الردود
- `POST /api/chat/stream` (~3845) — بث المحادثة
- `POST /api/chat` (~3921) — المحادثة الكاملة

---

### ZONE-11 — Education Search `(~7180–7475)`
**الوصف:** بحث المنح الدراسية، الجامعات، التوجيه التعليمي في الجزائر.
```
POST /api/dz-agent/education/search
POST /api/dz-agent/education/index
```

---

### ZONE-12 — Clone Engine + Lessons `(~7475–7795)`
**الوصف:** استنساخ المواقع بذكاء اصطناعي + نظام الدروس التعليمية.
```
POST /api/dz-agent/clone-advanced
POST /api/update-index
GET  /api/lessons
GET  /api/lesson
```

---

### ZONE-13 — DZ Agent Search `(~7795–8465)`
**الوصف:** محرك البحث الذكي متعدد المصادر (Brave/DuckDuckGo/Bing) + معالج RSS.
```
POST /api/dz-agent-search
```
**عناصر بارزة:**
- `parseRSS(xml)` — محلل RSS عالمي
- بحث في عدة محركات بالتوازي

---

### ZONE-14 — RSS + Breaking News Stream `(~8465–9129)`
**الوصف:** معالجة مصادر RSS الجزائرية والعالمية، بث الأخبار العاجلة في الوقت الفعلي.
**المصادر:** Ennahar، TSA، El Watan، Algeria Press، Al Jazeera...

---

### ZONE-15 — Dashboard + Sync `(~9129–9893)`
**الوصف:** لوحة تحكم DZ Agent (طقس + صلاة + رياضة + أخبار + دولار في استدعاء واحد).
| Endpoint | الوصف |
|----------|-------|
| `GET /api/dz-agent/rss/:type` | RSS حسب النوع |
| `GET /api/dz-agent/dashboard` | لوحة التحكم الشاملة |
| `GET /api/dz-agent/sync-status` | حالة التزامن |

---

### ZONE-16 — Maps + Prayer + Weather `(~9893–10480)`
**الوصف:** خرائط المواقع القريبة، مواقيت الصلاة، بيانات الطقس.
| Endpoint | الوصف |
|----------|-------|
| `POST /api/dz-maps/nearby` | المواقع القريبة (Overpass OSM) |
| `GET /api/dz-agent/reverse-geocode` | تحويل إحداثيات → مدينة |
| `GET /api/dz-agent/prayer` | مواقيت الصلاة |
| `GET /api/dz-agent/weather` | حالة الطقس |

---

### ZONE-17 — LFP + News + Sports Data `(~10481–11434)`
**الوصف:** بيانات الدوري الجزائري (LFP)، الأخبار الرياضية، بطولات عالمية، ترتيبات الدوريات.
| Endpoint | الوصف |
|----------|-------|
| `GET /api/dz-agent/lfp` | مباريات الدوري الجزائري |
| `GET /api/dz-agent/news` | الأخبار الرياضية |
| `GET /api/dz-agent/standings` | ترتيب الدوريات |
| `GET /api/dz-agent/global-leagues` | الدوريات العالمية |

---

### ZONE-18 — GitHub Operations `(~11435–13572)`
**الوصف:** كل العمليات على GitHub — ملفات، Pages، فروع، repos، تحليل الكود، pipeline.
**المجموعات الفرعية:**

#### 18a — File & Project Ops `(~11435–12120)`
```
POST /api/dz-agent/github/create-file
GET  /api/dz-agent/github/project-memory
POST /api/dz-agent/github/analyze-project
POST /api/dz-agent/github/generate-and-push
POST /api/dz-agent/github/improve-design
```

#### 18b — GitHub Pages Deploy `(~12121–12695)`
```
POST /api/dz-agent/github/pages/deploy
POST /api/dz-agent/github/pages/update
GET  /api/dz-agent/github/pages/status
POST /api/dz-agent/github/pages/stream-deploy   ← SSE
POST /api/dz-agent/github/pages/deploy-existing-stream
POST /api/dz-agent/github/pages/list-repos
POST /api/dz-agent/github/deploy-sync
```

#### 18c — Branch / Repo Creation `(~12696–13179)`
```
POST /api/dz-agent/github/create-branch
POST /api/dz-agent/github/create-repo-full
POST /api/dz-agent/github/exec
POST /api/dz-agent/github/init-empty-repo
```

#### 18d — Verify + Pipeline `(~13180–13572)`
```
POST /api/dz-agent/github/verify-env
POST /api/dz-agent/github/exec-pipeline
GET  /api/dz-agent/github/agent-status
POST /api/dz-agent/detect-intent
```

---

### ZONE-19 — Sports Agent API `(~13573–13772)`
**الوصف:** نقاط نهاية مباشرة للوكيل الرياضي (365score + FotMob + SofaScore).
| Endpoint | الوصف |
|----------|-------|
| `POST /api/sports-agent/query` | استعلام رياضي مباشر |
| `GET /api/sports-agent/match` | تفاصيل مباراة بالـ ID |
| `GET /api/sports/verify` | التحقق من صحة البيانات |
| `GET /api/sports/live` | المباريات الحية |
| `GET /api/sports/fixtures` | جدول المباريات |
| `GET /api/sports/standings` | الترتيبات |
| `GET /api/sports/algeria` | بيانات المنتخب الجزائري |

---

### ZONE-20 — Currency + DZ Dollar `(~13772–14200)`
**الوصف:** أسعار الصرف الرسمية والسوق الموازية، تحويل العملات، RSS للدينار.
| Endpoint | الوصف |
|----------|-------|
| `GET /api/currency/latest` | آخر أسعار الصرف |
| `GET /api/currency/convert` | تحويل بين العملات |
| `GET /rss/currency/dzd` | RSS feed سعر الدينار |
| `GET /api/dz-dollar` | سعر الدولار في السوق الموازية |

---

### ZONE-21 — Telegram + Sync + Deploy `(~14200–14600)`
**الوصف:** webhook تيليغرام، مزامنة البيانات الخارجية، نشر على Vercel.
| Endpoint | الوصف |
|----------|-------|
| `POST /api/telegram/webhook` | webhook بوت تيليغرام |
| `POST /api/telegram/setup` | إعداد الـ webhook |
| `GET /api/dz-agent/sync/status` | حالة المزامنة |
| `POST /api/dz-agent/sync` | تشغيل المزامنة |
| `POST /api/dz-agent/deploy` | نشر على Vercel (مؤمَّن) |

---

### ZONE-22 — ★ MAIN DZ-AGENT-CHAT HANDLER ★ `(~14600–21445)`
> **⚠️ أهم قسم في الملف — ~7000 سطر**
> `POST /api/dz-agent-chat`

**خط معالجة الطلب (Pipeline):**

```
الطلب الوارد
    │
    ├─ [PRE-PROCESSING ~14600-16000]
    │   ├─ تطهير الرسائل + detectMatchVsQuery
    │   ├─ كشف: retry / agent mode / YouTube / LFP / doctor
    │   ├─ كشف: isPersonQuery / isHistoricalGovQuery
    │   └─ استخراج: lastUserMessage / activeChatId / theme
    │
    ├─ [EARLY DIRECT BYPASSES ~16000-17500]
    │   ├─ WC2026 Group Query → buildWorldCup2026AlgeriaContext
    │   ├─ Historical Gov → buildHistoricalGovContext
    │   ├─ Doctor Query → fetchDoctors
    │   └─ Static Facts → lookupStaticFact
    │
    ├─ [PARALLEL DATA FETCH ~17500-19160]
    │   ├─ Promise.allSettled([
    │   │   weatherResult, lfpResult, standingsResult,
    │   │   sportsResult, newsResult, matchVsResult,
    │   │   wikiResult, searchResult, ...
    │   │   ])
    │   └─ WC2026 Today + Standings (parallel)
    │
    ├─ [MATCH-VS DIRECT ROUTE ~19171-19750]  ← ⚡ HARD GATE
    │   ├─ runSportsAgent(query, messages)
    │   ├─ إذا نجح → return مباشرة (LLM محظور)
    │   └─ إذا فشل → return hardcoded no-data (LLM محظور)
    │
    ├─ [CONTEXT BUILDING ~19750-20990]
    │   ├─ weatherContext / lfpContext / standingsContext
    │   ├─ matchVsContext + matchVsCtxRule
    │   ├─ wikiContext / searchContext / newsContext
    │   ├─ dashboardContext / decisionTreeContext
    │   └─ DEVELOPER_LOCK_LAYER + ADVANCED_INJECTION_GUARD
    │
    ├─ [FAST-PATH RETURNS ~20990-21160]
    │   ├─ Weather direct (no LLM) إذا hasWeatherPriority
    │   └─ LFP/Standings direct (no LLM)
    │
    └─ [LLM CALL ~21160-21445]
        ├─ buildSystemPrompt (10+ طبقات)
        ├─ aiRouter.route(messages, hint)
        └─ finalResponseGuard → return JSON
```

**الدوال الداخلية البارزة:**
| الدالة / المنطقة | السطر التقريبي | الوصف |
|------------------|----------------|-------|
| `detectMatchVsQuery` | 8226 | كاشف مباريات "X ضد Y" |
| `_isMatchVsQuery` DIRECT ROUTE | 19171 | حارس صارم — LLM محظور |
| `buildSportsRouterContext` | 19360 | بناء سياق الوكيل الرياضي |
| `matchVsContext` builder | 19552 | بناء السياق النصي للمباراة |
| `systemPrompt` array | 20744 | مصفوفة الـ system prompt الكاملة |
| `hasWeatherPriority` fast-path | 21010 | إرجاع الطقس بدون LLM |
| LFP fast-path | 21055 | إرجاع LFP بدون LLM |

---

### ZONE-23 — Streaming SSE Endpoint `(~21445–21620)`
**الوصف:** بث tokens فورياً عبر SSE (`POST /api/dz-agent-stream`) — يُقلّل وقت أول رد من 2-8 ثوانٍ إلى ~300ms.
**ملاحظة:** Queries التي تحتاج بيانات حية تُعاد توجيهها للـ endpoint الكامل.

---

### ZONE-24 — Analytics `(~21620–21700)`
**الوصف:** تتبع أحداث المستخدم (track) + إحصائيات الاستخدام (summary).
```
POST /api/analytics/track
GET  /api/analytics/summary
```

---

### ZONE-25 — GitHub OAuth + Repo Management `(~21700–22557)`
**الوصف:** مصادقة GitHub OAuth، معرفة المستخدم، إدارة المستودعات.
```
GET  /api/auth/github          ← OAuth redirect
GET  /api/auth/github/callback ← OAuth callback
GET  /api/github/whoami        ← معرفة المستخدم الحالي
POST /api/dz-agent/github/repos ← قائمة المستودعات
POST /api/dz-agent/smart-repos/suggest
```

---

### ZONE-26 — GitHub Code Agent `(~22557–25069)`
**الوصف:** الوكيل الكامل لإدارة الكود على GitHub — تحرير، إنشاء، push، PR، بناء.
| Endpoint | الوصف |
|----------|-------|
| `POST /api/dz-agent/github/code-action` | تنفيذ إجراء على كود |
| `POST /api/dz-agent/github/commit` | commit مُتعدد الملفات |
| `POST /api/dz-agent/github/pr` | إنشاء Pull Request |
| `POST /api/dz-agent/github/smart-push` | push ذكي مع Vercel hook |
| `POST /api/dz-agent/github/agent-build` | بناء مشروع كامل |
| `POST /api/dz-agent/github/agent-edit` | تحرير ملفات بالـ AI |
| `POST /api/dz-agent/github/agent` | الوكيل الكامل متعدد الخطوات |
| `POST /api/dz-excel/ai` | توليد Excel بالذكاء الاصطناعي |

---

### ZONE-27 — AI Free Media `(~25069–25135)`
**الوصف:** توليد صور مجاني عبر مزودين AI متعددين.
```
GET  /api/dz-media/aifree/models
GET  /api/dz-media/aifree/health
POST /api/dz-media/aifree/generate
```

---

### ZONE-28 — DZ Tube / YouTube `(~25135–27697)`
**الوصف:** بحث YouTube، تحليل مقاطع الفيديو، بث الصوت، تحميل.
| Endpoint | الوصف |
|----------|-------|
| `GET /api/dz-tube/search` | بحث YouTube |
| `GET /api/dz-tube/related` | مقاطع ذات صلة |
| `GET /api/dz-tube/audio-url` | URL صوت المقطع |
| `GET /api/dz-tube/audio-stream` | بث صوتي مباشر |
| `POST /api/dz-tube/info` | معلومات تفصيلية |
| `GET /api/dz-tube/download` | تحميل مقطع |
| `POST /api/extract` | استخراج محتوى URL |
| `POST /api/tts` | تحويل نص→صوت |

---

### ZONE-29 — Chat Room `(~27111–27697)`
**الوصف:** غرف محادثة متعددة المستخدمين في الوقت الفعلي.
```
POST /api/chat-room/join    ← الانضمام
POST /api/chat-room/send    ← إرسال رسالة
GET  /api/chat-room/messages ← استرجاع الرسائل
POST /api/chat-room/admin   ← أوامر المشرف
```

---

### ZONE-30 — Image Tools `(~27697–28865)`
**الوصف:** بحث عن صور، تحليل، إزالة الخلفية، رفع الجودة، تلوين.
| Endpoint | الوصف |
|----------|-------|
| `GET /api/tools/image-search` | بحث عن صور |
| `GET /api/tools/reverse-image` | بحث عكسي بالصورة |
| `POST /api/tools/image-analyze` | تحليل صورة بالـ AI |
| `POST /api/tools/img-remove-bg` | إزالة الخلفية |
| `POST /api/tools/img-upscale` | رفع جودة الصورة |
| `POST /api/tools/img-inpaint` | تلوين أجزاء الصورة |
| `POST /api/tools/img-gen` | توليد صورة من نص |

---

### ZONE-31 — Video + TTS `(~28865–29385)`
**الوصف:** توليد مقاطع فيديو، تحويل نص→صوت (Edge TTS)، لقطات شاشة.
```
POST /api/tools/video-gen
POST /api/tts / POST /api/tts/edge
GET  /api/tts/voices
POST /api/tools/screenshot
```

---

### ZONE-32 — ChatImg + DZ Media `(~29385–29680)`
**الوصف:** محادثة مع الصور (vision models)، موفرو صور متعددون.
```
POST /api/chatimg/relay
POST /api/chatimg/generate
GET  /api/dz-media/providers
POST /api/dz-media/providers/generate
```

---

### ZONE-33 — Radio Stations `(~29680–29760)`
**الوصف:** بث محطات الراديو الجزائرية والعربية.
```
GET /api/radio/stream/:station
GET /api/radio/stations
GET /api/radio/browser/algeria
```

---

### ZONE-34 — Books + Whiteboard + Bug Report `(~29760–29960)`
**الوصف:** بحث في الكتب، لوح الرسم التشاركي، نظام الإبلاغ عن الأخطاء.
```
GET  /api/tools/books
POST /api/tools/presentation
POST /api/wb/save
GET  /api/wb/projects
POST /api/report-bug          ← الإبلاغ عن مشكلة (→ GitHub Issues)
GET  /api/analytics/stats
```

---

### ZONE-35 — DZ Agent V4 Media `(~30107–30308)`
**الوصف:** توليد الفيديو والصور في V4 — img2img، text2video، img2video.
```
GET  /api/dz-agent-v4/video/quota
GET  /api/dz-agent-v4/video/models
POST /api/dz-agent-v4/img2img
POST /api/dz-agent-v4/video
POST /api/dz-agent-v4/img2video
```

---

## المكتبات الفرعية المرتبطة

| المجلد | الوصف |
|--------|-------|
| `lib/ai-router/` | توزيع الطلبات على 6 مزودين AI مع circuit breaker |
| `lib/sports-agent.js` | الوكيل الرياضي (365score + FotMob + SofaScore) |
| `lib/dz-sports-knowledge.js` | قاعدة بيانات الرياضة الجزائرية + WC2026 |
| `lib/prompts.js` | طبقات system prompt (LOCK + INJECTION_GUARD + SERVICES) |
| `lib/resilience.js` | semaphore + circuit breaker + stallGuard |
| `lib/reasoning/` | محرك التفكير (CoT/ReAct/ToT/Self-Reflection) |
| `lib/dz-v2/` → `v5/` | طبقات الوكيل المتطورة المتراكمة |
| `lib/agent-loop/` | ReAct loop + Claude ReAct |
| `lib/owner-commands.js` | نظام أوامر المالك + التدريب المباشر |
| `lib/breaking-news.js` | محرك الأخبار العاجلة + RSS poller |
| `lib/github-pages/` | محرك نشر GitHub Pages |
| `modules/clone-engine/` | استنساخ المواقع بالـ AI |
| `modules/youtube_insight_module/` | تحليل YouTube |
| `modules/dz-maps/` | الخرائط الجزائرية (Overpass OSM) |
| `dialect/` + `data/dz_dialect.json` | محرك الدارجة الجزائرية |

---

## نصائح للوكلاء

```bash
# البحث عن منطقة محددة بسرعة
grep -n "ZONE-22" server.js

# الوصول المباشر لنقطة نهاية API
grep -n "'/api/dz-agent-chat'\|'/api/dz-agent-stream'" server.js

# البحث عن دالة بعينها
grep -n "^function detectMatchVsQuery\|^async function" server.js

# قراءة قسم بأسطر محددة
sed -n '19171,19250p' server.js

# الأقسام ذات الأولوية للتعديل
# ├─ System Prompt:     sed -n '20744,20800p' server.js
# ├─ Sports Gate:       sed -n '19171,19240p' server.js
# ├─ Weather Fast-Path: sed -n '21010,21060p' server.js
# └─ LFP Fast-Path:     sed -n '21055,21110p' server.js
```
