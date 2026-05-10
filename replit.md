# DZ-GPT — ملف الحالة الكاملة للمستودع

> **آخر تحديث:** مايو 2026  
> **الغرض:** توثيق كامل لحالة المشروع — الفرع النشط، البيئة، المفاتيح، ما تم إنجازه، وأين نكمل.

---

## 🔀 معلومات Git الأساسية

| العنصر | القيمة |
|--------|--------|
| **الفرع الإنتاجي الوحيد** | `devin/1774405518-init-dz-gpt` ← **كل التحديثات تذهب هنا** |
| **آخر commit** | `a1935a7d1f69` — fix: restore full server.js + apply all 4 improvements |
| **Remote origin** | `https://github.com/Nadirinfograph23/DZ-GPT` |
| **Repo ID** | `1191199822` |
| **Vercel production branch** | `devin/1774405518-init-dz-gpt` (مربوط بـ Vercel مباشرة) |

> 🚨 **قاعدة ثابتة:** كل تحديث يجب أن يُرفع لـ `devin/1774405518-init-dz-gpt` مباشرةً — لا تعديل على `main` أبداً.  
> git push مقيّد في Replit — استخدم سكريبت `scripts/push-to-github.py` أو GitHub Contents API.

### ✅ طريقة الرفع الصحيحة (دائماً):
```bash
python3 scripts/push-to-github.py "رسالة التحديث" file1.js file2.tsx ...
```

---

## 🌐 معلومات Vercel (الموقع المباشر)

| العنصر | القيمة |
|--------|--------|
| **الموقع** | https://dz-gpt.vercel.app |
| **Project ID** | `prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5` |
| **آخر Deployment** | `dpl_AmphBehQkbS74VdcAd1EMUc6UXd1` — READY |
| **Build command** | `npm run build` |
| **Output dir** | `dist` |
| **Framework** | `vite` |
| **API routing** | `/api/*` → `api/index.js` (maxDuration: 60s) |
| **SPA routing** | `/((?!api/).*)` → `index.html` |

### طريقة رفع Deployment جديد:
```bash
# عبر deploy hook (الأسرع):
python3 scripts/push-to-github.py "وصف التحديث" server.js
# ثم يُطلق Vercel تلقائياً عبر deploy hook المربوط بالفرع
```

---

## 🔑 متغيرات البيئة — حالة كل مفتاح

### Replit Secrets (مضبوطة ✅)
| المتغير | الاستخدام | الحالة |
|---------|----------|--------|
| `AI_API_KEY` | Groq — النموذج الرئيسي | ✅ يعمل |
| `GEMINI_API_KEY` | Google Gemini 2.0 Flash | ✅ (حصة مجانية تتجدد يومياً) |
| `MISTRAL_API_KEY` | Mistral Small | ✅ يعمل |
| `NVIDIA_API_KEY` | NVIDIA NIM llama-3.3-70b | ✅ يعمل |
| `COHERE_API_KEY` | Cohere Command R+ | ✅ يعمل |
| `OPENROUTER_API_KEY` | OpenRouter catch-all | ✅ يعمل (rate-limit مؤقت أحياناً) |
| `DEEPSEEK_API_KEY` | DeepSeek Chat | ⚠️ رصيد فارغ — يحتاج شحن |
| `HF_TOKEN` | HuggingFace — توليد الصور | ✅ متصل (Nadirinfograph2) |
| `OPENWEATHER_API_KEY` | طقس الجزائر | ✅ يعمل |
| `GOOGLE_API_KEY` | Google APIs | ⚠️ مفعّل لكن مقيّد (API_KEY_SERVICE_BLOCKED) |
| `GOOGLE_CSE_ID` | `12e6f922595f64d35` | ⚠️ يحتاج رفع قيود المفتاح |
| `GITHUB_TOKEN` | GitHub Contents API | ✅ يعمل |
| `VERCEL_TOKEN` | Vercel API | ✅ يعمل |

### متغيرات Vercel الإضافية (موجودة على Vercel فقط)
| المتغير | الوصف |
|---------|-------|
| `CHAT_ADMIN_SECRET` | سر مشرف DZ Chat (default: `dz-admin-nadir`) |
| `AI_API_KEY_2` إلى `AI_API_KEY_6` | مفاتيح Groq إضافية للـ rotation |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth للمستخدمين |
| `APP_BASE_URL` | رابط الموقع الأساسي |
| `YOUTUBE_COOKIES` | كوكيز YouTube لـ yt-dlp |
| `DEPLOY_ADMIN_TOKEN` | رمز إدارة Deployments |

---

## ⚠️ مشاكل قيد الحل

### 1. Google Custom Search (الأولوية: متوسطة)
- **المشكلة:** `API_KEY_SERVICE_BLOCKED` — المفتاح مقيّد ويمنع Custom Search API
- **CSE رابط:** https://cse.google.com/cse?cx=12e6f922595f64d35
- **الحل:** في Google Cloud Console → Credentials → المفتاح → API restrictions → إزالة القيد أو إضافة Custom Search API
- **رابط التفعيل المباشر:** https://console.developers.google.com/apis/credentials?project=1051681540019

### 2. DeepSeek (الأولوية: منخفضة)
- **المشكلة:** رصيد الحساب فارغ (`Insufficient Balance`)
- **الحل:** شحن الرصيد على https://platform.deepseek.com — المفتاح صحيح

### 3. Groq Key Rotation (الأولوية: تحسين)
- عندنا مفتاح واحد فقط (`AI_API_KEY`) — يمكن إضافة `AI_API_KEY_2` إلى `AI_API_KEY_10` لزيادة الـ throughput

---

## 🏗️ هيكل المشروع

```
DZ-GPT/
├── server.js              ← الخادم الرئيسي (12600+ سطر) — Express + WebSocket
├── vercel.json            ← إعدادات Vercel
├── package.json           ← scripts: dev=node server.js | build=tsc -b && vite build
├── api/
│   └── index.js           ← Vercel serverless entry point
├── src/
│   ├── main.tsx           ← React router (routes: / /dz-agent /dz-chat /agent /quran /dz-tube)
│   ├── pages/
│   │   ├── DZAgent.tsx    ← DZ Agent V4 (الصفحة الرئيسية للذكاء الاصطناعي)
│   │   ├── DZAgentV3.tsx  ← Agent Manus — متاح على /agent
│   │   ├── DZChat.tsx     ← غرفة الدردشة الجماعية
│   │   ├── AIQuran.tsx    ← قرآن كريم + تفسير + صوت
│   │   ├── DZTube.tsx     ← بث YouTube صوتي
│   │   └── SystemHealth.tsx
│   ├── components/
│   │   ├── DZChatBox.tsx  ← صندوق محادثة DZ Agent
│   │   ├── DZDashboard.tsx← لوحة: طقس + أخبار + صلاة + رياضة + عملة
│   │   ├── VoicePanel.tsx ← نظام الصوت (STT/TTS + Wake Word)
│   │   └── DeveloperCard.tsx
│   └── styles/
│       ├── dz-agent.css   ← أنماط DZ Agent
│       └── dzchat.css     ← أنماط DZ Chat
├── lib/
│   ├── ai-router/index.js ← الراوتر الذكي 6 مزودين
│   ├── prompts.js         ← Master system prompt
│   ├── news.js            ← أخبار Algeria-first
│   ├── memory.js          ← ذاكرة ملفات + Jaccard
│   ├── cache.js           ← LRU cache
│   ├── safety.js          ← حماية prompt injection
│   ├── resilience.js      ← circuit breaker + semaphore
│   ├── dz-v2/            ← Multi-agent V2
│   ├── dz-v3/            ← Webapp generator V3
│   └── dz-v4/            ← Code/Image/Chart V4 PRO
├── modules/
│   ├── clone-engine/      ← استنساخ مواقع
│   ├── dz-maps/           ← خرائط الجزائر
│   ├── web-generator/     ← توليد مواقع كاملة
│   └── youtube_insight_module/
├── data/
│   ├── dz_dialect.json    ← 190+ كلمة دارجة جزائرية
│   ├── dz_learned.json    ← كلمات متعلمة تلقائياً
│   └── dz-v4/projects/   ← مشاريع كود مولّدة
└── dialect/
    └── dzEngine.js        ← محرك فهم الدارجة
```

---

## 🤖 معمارية الذكاء الاصطناعي

### سلسلة الـ Fallback الكاملة (10 طبقات)
```
safeGenerateAI()
  [1] DeepSeek (deepseek-chat)              ← ⚠️ رصيد فارغ
  [2] Ollama (llama3 — محلي)               ← غير متاح على Vercel
  [3] Groq × 4 نماذج × 10 مفاتيح:
       llama-3.3-70b-versatile             ← ✅ النموذج الرئيسي
       llama-4-scout-17b-16e-instruct      ← ✅ ثانوي
       qwen3-32b                           ← ✅ ثالث
       llama-3.1-8b-instant               ← ✅ خفيف/سريع
  [4] Capability-Aware Router:
       OpenAI/Replit (AI_INTEGRATIONS_OPENAI_API_KEY) ← غير مضبوط
       Gemini (GEMINI_API_KEY)             ← ✅ (حصة مجانية)
       Mistral (MISTRAL_API_KEY)           ← ✅
       NVIDIA NIM (NVIDIA_API_KEY)         ← ✅
       Cohere (COHERE_API_KEY)             ← ✅
       OpenRouter (OPENROUTER_API_KEY)     ← ✅ catch-all
```

### Capability Routing Matrix
| نوع المهمة | المزود الأول |
|-----------|-------------|
| `multilingual` (عربي/دارجة) | Gemini |
| `technical` (كود) | NVIDIA |
| `retrieval` (RAG/بحث) | Cohere |
| `translation` (ترجمة) | Mistral |
| `reasoning` (تحليل) | OpenRouter |
| `general` (عام) | Groq |

---

## 🚀 المميزات المطبقة (ما تم إنجازه)

### DZ Chat Room
- [x] شارة التحقق الزرقاء للمشرف (`msg.isAdmin || msg.isHighlighted`)
- [x] خيارات Mute: 10 دقائق / 30 دقيقة / 60 دقيقة
- [x] حفظ بروفايل المستخدم في localStorage
- [x] بانر "تم تذكر بياناتك" عند العودة
- [x] رسالة مثبتة (Pin) بشريط ذهبي أعلى الشات
- [x] عداد تنازلي للـ Mute مع أنيميشن أحمر

### DZ Agent
- [x] نظام تقييم 👍/👎 لكل رسالة
- [x] WEB_BUILDER_MODE — توليد مواقع HTML كاملة
- [x] GitHub Smart Push — Branch → Commit → PR → Vercel
- [x] OCR للصور والـ PDF (tesseract.js)
- [x] لوحة تحكم: طقس + أخبار + صلاة + رياضة + عملة

### البنية التحتية
- [x] Multi-Provider AI Router (6 مزودين + circuit breaker)
- [x] Groq Key Rotation (حتى 10 مفاتيح)
- [x] Concurrency Semaphore (max 6 طلبات متزامنة)
- [x] In-flight Deduplication
- [x] Security Hardening (ReDoS + XSS + Path Traversal + Command Injection)
- [x] جميع API keys مضبوطة على Replit + Vercel

---

## 📋 ما يجب إكماله (Next Steps)

| الأولوية | المهمة | التفاصيل |
|---------|--------|---------|
| 🔴 عالية | إصلاح Google CSE | رفع قيود `GOOGLE_API_KEY` في Google Cloud Console |
| 🟡 متوسطة | شحن DeepSeek | https://platform.deepseek.com — المفتاح صحيح |
| 🟡 متوسطة | إضافة Groq keys إضافية | `AI_API_KEY_2`→`AI_API_KEY_10` لزيادة الـ throughput |
| 🟢 منخفضة | تفعيل OpenAI Integration | `AI_INTEGRATIONS_OPENAI_API_KEY` عبر Replit Integrations |
| 🟢 منخفضة | لوحة `/admin/providers` | مراقبة حالة المزودين بالوقت الحقيقي |

---

## 🛠️ كيفية التشغيل محلياً في Replit

```bash
# تشغيل السيرفر
npm run dev
# يعمل على port 5000

# بناء للإنتاج
npm run build
# يولد dist/ جاهز لـ Vercel
```

### بيئة Replit
- **Node.js:** 20
- **Python:** 3.11 (للسكريبتات المساعدة)
- **Port:** 5000
- **Workflow:** "Start application" ← `node server.js`
- **Integration:** `javascript_openai_ai_integrations:2.0.0` (مثبت)

---

## 🔧 طريقة Push للـ GitHub (بدون git)

بما أن `git push` مقيّد في Replit، نستخدم GitHub Contents API:

```python
import urllib.request, json, base64, os

TOKEN = os.environ['GITHUB_TOKEN']
REPO  = "Nadirinfograph23/DZ-GPT"
BRANCH = "devin/1774405518-init-dz-gpt"

def push_file(path, content_str, message):
    # 1. Get current SHA
    url = f"https://api.github.com/repos/{REPO}/contents/{path}?ref={BRANCH}"
    req = urllib.request.Request(url, headers={"Authorization": f"token {TOKEN}"})
    try:
        current = json.loads(urllib.request.urlopen(req).read())
        sha = current.get("sha")
    except: sha = None
    
    # 2. Push
    body = {
        "message": message,
        "content": base64.b64encode(content_str.encode()).decode(),
        "branch": BRANCH
    }
    if sha: body["sha"] = sha
    
    req2 = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/contents/{path}",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"token {TOKEN}", "Content-Type": "application/json"},
        method="PUT"
    )
    return json.loads(urllib.request.urlopen(req2).read())
```

---

## 🗺️ مسارات الصفحات

| المسار | الصفحة | الوصف |
|--------|--------|-------|
| `/` | DZAgent.tsx | الصفحة الرئيسية — DZ Agent V4 |
| `/dz-agent` | DZAgent.tsx | نفس الرئيسية |
| `/dz-chat` | DZChat.tsx | غرفة الدردشة الجماعية |
| `/agent` | DZAgentV3.tsx | Agent Manus — متعدد الوكلاء |
| `/quran` | AIQuran.tsx | القرآن الكريم + ذكاء اصطناعي |
| `/dz-tube` | DZTube.tsx | بث YouTube صوتي |

---

## 📡 API Endpoints الرئيسية

| Method | Path | الوصف |
|--------|------|-------|
| POST | `/api/dz-agent-chat` | المحادثة الرئيسية — يقبل `{messages:[]}` |
| POST | `/api/dz-agent-v2/chat` | V2 Multi-agent |
| POST | `/api/dz-agent-v4/smart` | V4 PRO (كود + صور + رسوم) |
| POST | `/api/dz-agent/github/smart-push` | Push → PR → Vercel |
| GET  | `/api/health` | حالة السيرفر |
| GET  | `/api/admin/provider-scores` | نتائج المزودين |
| POST | `/api/dz-dialect/understand` | فهم الدارجة |
| GET  | `/api/dz-dialect/stats` | إحصاءات القاموس |
| WS   | `/ws` | WebSocket لـ DZ Chat |

---

## Overview
DZ-GPT is a comprehensive AI chat application built with Vite, React, and Express, designed to offer multi-model AI capabilities and a rich user experience. Includes a full **Algerian Dialect Intelligence Layer** for understanding and responding in Darija.

## Algerian Dialect Understanding System (DZ Dialect Layer)

### Architecture — 4 Core Modules (`/dialect/dzEngine.js`)
1. **Normalizer** (`normalize(text)`) — strips diacritics, normalizes Arabic letter variants, collapses repeated letters for fuzzy matching, replaces Darija slang with standard Arabic using the dictionary + learned words
2. **Semantic NLU** (`understand_dz(text)`) — tokenizes, matches words against the dictionary (exact + fuzzy Levenshtein), reconstructs standard Arabic, detects mixed languages
3. **Intent Engine** (`detectIntent(text)`) — classifies: `question | request | command | greeting | farewell | gratitude | build_web_app | code_help | statement`
4. **Darija Response Generator** (`toDarija(text)`) — converts standard Arabic responses back to Algerian Darija using the response map
5. **Context Learner** (`learnWord(word, context, meaning)`) — dynamically stores new discovered words in `/data/dz_learned.json`
6. **Full Pipeline** (`fullPipeline(text)`) — runs all modules, returns structured NLU result

### Dictionary (`/data/dz_dialect.json`)
- 190+ curated Algerian Darija words with: `meaning_ar | meaning_fr | meaning_en | synonyms | variants | usage | category`
- 80+ slang_map entries (Darija → Standard Arabic)
- 80+ response_map entries (Standard Arabic → Darija)
- Intent pattern sets for all intent types
- Categories: question, greeting, verb, pronoun, noun, evaluation, quantity, time, connective, modal, place, state, slang, address, exclamation, gratitude, wish

### Learned Words (`/data/dz_learned.json`)
- Auto-populated when users send unknown Darija tokens
- Manually teachable via `POST /api/dz-dialect/learn`

### API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/dz-dialect/understand` | Full NLU pipeline: intent, standard text, tokens, replacements |
| POST | `/api/dz-dialect/respond` | Convert Arabic text → Darija |
| POST | `/api/dz-dialect/learn` | Teach a new Darija word |
| GET | `/api/dz-dialect/stats` | Dictionary + learned words stats |
| GET | `/api/dz-dialect/normalize?text=` | Normalize a Darija sentence |

### Integration
- Dialect context is automatically injected into every DZ Agent system prompt when Darija is detected in the user message (`buildDialectContext()`)
- AI is instructed to understand Darija naturally and respond in Darija when the user writes in Darija The project aims to provide an advanced, multi-functional AI agent that can handle diverse queries, generate code, provide real-time information, and offer voice-based interactions. Key features include autonomous multi-agent task execution, full-stack web application generation, and intelligent conversational abilities with multi-language support (Arabic, French, English). The project emphasizes reliability, performance, and user-centric design, ensuring robust responses and a seamless experience across various functionalities like news aggregation, weather updates, GitHub integration, and specialized Quranic AI.

## User Preferences
- التوثيق يكتب بالعربية والإنجليزية معاً لأهمية السياق
- git push مقيّد — نستخدم GitHub Contents API دائماً
- الفرع النشط: `devin/1774405518-init-dz-gpt`
- جميع API keys تُضبط على Replit Secrets أولاً ثم تُرفع لـ Vercel

## System Architecture

### Core Architecture
The system is built as a layered architecture, with V1, V2, V3, and V4 representing additive intelligence layers. This design ensures backward compatibility and modularity, allowing new features to be integrated without disrupting existing functionalities. The backend is an Express.js server, while the frontend is a React application built with Vite.

### UI/UX Decisions
- **General Design**: UI is largely untouched across different agent versions (V2, V4).
- **Voice UI**: `VoicePanel.tsx` provides a minimal panel with mic/mute/settings buttons. Settings popover includes voice gender, language, continuous mode, wake word toggle, and fast mode. Mic pulses when listening; settings panel is anchored above input.
- **DZ Agent Sidebar**: Features chat history, new chat/delete chat buttons, and a language selector (AR/EN/FR). Mobile responsive design with sidebar sliding in/out.
- **DZ Agent Dashboard**: Displays live cards for prayer times, weather, news, sports, tech news, and currency rates.
- **AI Quran Page**: Features chapter navigation, reading/tafsir/audio tabs, a Quran-only AI chat box, and verse search. It uses specific Arabic fonts for correct rendering and includes an Ayah Interaction System with bookmarking, listening, and smart assistant features.
- **Color Scheme**: Quran page theme updated to yellow-green (`#9acd32`) to match DZ-GPT branding.

### Technical Implementations
- **Multi-Agent Layer (V2)**:
    - **Memory**: 3-tier memory system (short-term ring buffer, long-term file-based preferences, semantic recall via Jaccard token overlap).
    - **Plugins**: Registry for `news`, `currency`, `weather`, `web-search`, `github`, `dev` plugins, each with parallel execution and timeouts.
    - **Validation**: Empty/placeholder/system-echo/relevance checks with retry mechanisms.
    - **Learning**: Append-only JSONL log for tracking model and plugin usage.
    - **Orchestration**: `plan()` for intent/language/tool selection, `execute()` for tool results/recall/LLM generation, and `qa()` for final guard.
- **Multi-file Project Generation Engine (V4 PRO)**:
    - **Code Generation**: Implements a professional multi-file code generation system using strict `FILE: /project/<path>` block format.
    - **Persistence**: Project storage in `data/dz-v4/projects/<id>/` (Replit) or `/tmp/dz-v4/projects/<id>/` (Vercel).
    - **Image/Chart Generation**: `image.js` for image generation (SDXL Turbo, SD 2, SD 1.5) via HuggingFace Inference API with fallbacks; `chart.js` for Chart.js project generation without LLM calls.
    - **Dispatcher**: Smart intent classifier for `code`, `image`, `chart` intents.
- **Voice Intelligence System (DVIS)**:
    - **Browser-Native Voice**: Utilizes Web Speech API for Speech-to-Text (STT) and `SpeechSynthesis` for Text-to-Speech (TTS).
    - **Wake Word Engine**: V2 wake-word listener using a separate STT instance for phrases like "hey dz", "hi dz", "dz agent".
    - **Voice Router**: Routes transcripts to appropriate agent endpoints (`window.__dzAgentProcess`, V4 smart, V1 agent, chat).
    - **Controller**: Orchestrates STT → Router → TTS flow, manages continuous mode, follow-up silence, and wake-word toggle.
- **Autonomous Multi-Agent + Web App Generator (V3)**:
    - **Specialized Agents**: `news-agent`, `research-agent`, `dev-agent`, `execution-agent`, `qa-agent`.
    - **Coordination**: In-process pub/sub bus for agent-to-agent events, task manager for lifecycle, SSE for streaming.
    - **Webapp Generator**: In-memory artifact store with dependency-free PKZIP archiver.
- **DZ Tube Audio Playback**:
    - Streams YouTube audio via `/api/dz-tube/audio-proxy`.
    - Resolves direct `googlevideo` URLs by racing multiple extractors (Piped, Invidious, `ytdl-core`, `yt-dlp`).
    - Caching of successful URLs with 20-minute TTL.
    - Hardening with `probeUpstreamPlayable` and byte-piping for direct `googlevideo` URLs.
- **User Intelligence System (dzMemory)**:
    - LocalStorage-based user behavior memory (`src/utils/dzMemory.ts`).
    - Intent detection, query tracking, feature usage tracking (GitHub).
    - `buildBehaviorContext()` for injecting Arabic context hints into AI requests.
    - `getSmartSuggestions()` for ranked suggestions.
- **Reliability Layer**:
    - `validateAIContent()` to prevent empty/irrelevant responses.
    - `trimRelevantContext()` to reduce off-topic answers.
    - `safeGenerateAI()` for master fallback across DeepSeek, Ollama, and Groq models.
    - AbortController timeouts for AI calls.
    - Structured error logging.
- **OCR DZ**: Supports image (jpg, png, bmp, webp, tiff) and PDF (up to 15 pages) uploads. Uses `tesseract.js` for text extraction (AR/EN/FR), followed by AI correction and context injection into chat.
- **AI Quran**: Integrates with Quran.com API v4 for chapters, verses, translations, recitations, and audio. Features chapter navigation, verse search, and an ayah interaction system.
- **DZ Smart Agent Layer (V1)**:
    - **Pipeline**: User Query → Intent Detection → Smart Router → Multi-Source Fetch → Filter + Rank → Engine Response → Memory + LRU Cache.
    - **Intent Detection**: `detectIntent()` for `builder | github | news | structured | general` with language and live-mode flags.
    - **Ranking**: `rankAndTrim()` with Algeria-first scoring, freshness, relevance, spam filter, and dedup.
    - **Memory**: File-backed self-learning memory with Jaccard similarity recall.
    - **Reasoning**: Distilled production patterns from various advanced AI agents for planning, citations, and safety.
    - **Prompts**: Master system prompt (`lib/prompts.js`) composed by intent, including identity, core behavior, Algeria context, search discipline, response formatting, safety, and tool-use.
    - **Citations**: Perplexity-style numbered inline citations.
    - **Safety**: Prompt-injection detection, `quarantineExternal()`, secret/PII redaction, safe refusal builder.
    - **Planner**: Decomposes query into focused sub-queries with temporal qualifiers.
    - **Responder**: Renders router payloads as clean Markdown with citations.
    - **Reasoner**: Deep-research orchestrator: `plan → parallel multi-fetch → fuse + rank → self-critique → render with citations → memory`.
- **Live Sports Cards**: Implemented a fix for `jdwel.com` data sourcing on Vercel by using Jina AI Reader as a reverse-proxy for Cloudflare-protected sites.

## Security Hardening (May 2026)

A full security audit was performed and the following fixes were applied:

- **ReDoS Prevention**: Escaped regex special characters in user-supplied labels before `new RegExp()` in `modules/dz-maps/intent.js` and `lib/news.js`
- **Template Injection / XSS**: Added `escapeHtml()` sanitization for user-supplied values embedded in HTML templates in `lib/dzPlaceSearch.js` and `lib/dz-v4/generator.js`
- **Prototype Pollution Guard**: Added explicit Set-based whitelist validation for `templateId` in `lib/dz-v3/webapp-generator.js` before property lookup on `TEMPLATES` object
- **Path Traversal Prevention**: Hardened `tmpFile()` in `server.js` to only accept alphanumeric file extensions; `safeUnlink()` now verifies paths stay within the `TMP_DIR` sandbox before unlinking
- **Command Injection**: Replaced `execSync(cmd)` with `spawnSync(bin, args[])` in `scripts/update-changelog.mjs` to eliminate shell injection risk
- **Dependency Audit**: 0 vulnerabilities found across all 537 packages

## WEB_BUILDER_MODE — DZ Agent Web Builder (May 2026)

DZ Agent يعمل الآن كـ **مولّد مواقع ويب احترافي** بدون GitHub أو Vercel:

- **كشف تلقائي للنية**: إذا احتوى الطلب على "أنشئ موقع"، "صمم صفحة"، "landing page"، "portfolio"، "صفحة ويب"، "موقع HTML" — يُفعَّل WEB_BUILDER_MODE تلقائياً
- **توليد كود كامل**: HTML + CSS + JS في ملف واحد، تصميم حديث، responsive، animations
- **CDNs اختيارية**: Tailwind CSS CDN، Font Awesome 6، Google Fonts، Chart.js، AOS animations
- **معاينة مباشرة**: iframe مدمج داخل الإجابة مع sandbox آمن
- **تحميل فوري**: زر HTML واحد + زر ZIP (HTML + CSS + JS منفصلة)
- **تصميم ذكي**: يكتشف نوع الموقع ويختار الألوان والتصميم المناسب (مطعم، متجر، شركة، بورتفوليو...)
- **جودة عالية**: كود يبدو كـ Dribbble/Awwwards — بدون Lorem ipsum — محتوى حقيقي متناسق مع الطلب
- **Log label**: `[WEB_BUILDER_MODE]` في console لكل توليد
- **Files modified**: `server.js` (WEBSITE_BUILDER_SYSTEM_PROMPT enhanced, WEB_BUILDER_MODE label, Tailwind CDN support)

## Rating System (May 2026)

Added 👍/👎 rating buttons to DZ Agent assistant responses, next to the copy button:

- **Per-message rating**: Each assistant message has thumbs-up/thumbs-down toggle buttons. Clicking the same button again removes the rating.
- **Global counter**: A persistent counter in `localStorage` (`dz-agent-ratings-stats`) tracks total 👍 and 👎 across all sessions. Displayed in the footer bar when at least one rating exists.
- **AI context injection**: The rating of the last rated message is injected into the next outgoing request so the model adjusts its style — more detailed on 👎, consistent on 👍.
- **CSS**: New classes `.dz-rating-btn`, `.dz-rating-btn--up/--down`, `.dz-rating-btn--active`, `.dz-ratings-bar`, `.dz-ratings-up/down` added in `src/styles/dz-agent.css`.
- **Files modified**: `src/components/DZChatBox.tsx`, `src/styles/dz-agent.css`.

## GitHub Smart Push / Export Pipeline (May 2026)

Added a full "export to GitHub and deploy to Vercel" pipeline accessible from DZ Agent:

- **New endpoint** `POST /api/dz-agent/github/smart-push` in `server.js`: atomically creates a new branch (`dz-agent/YYYY-MM-DDTHH-mm-ss`), commits one or more files to it, creates a PR (`branch → main`), and returns the PR URL. Vercel picks up the PR automatically if the repo is connected.
- **Intent detection**: Natural-language phrases like "صدّر التغييرات", "تصدير + PR", "commit and PR", "deploy to vercel", etc. trigger the smart-push pipeline from the `/api/dz-agent-chat` handler.
- **UI approval dialog**: Extended `ApprovalDialog` in `DZChatBox.tsx` to show a visual pipeline `Branch → Commit → PR → ▲ Vercel` before execution. User must confirm before any GitHub action is taken.
- **executeApprovedAction**: Added `smart-push` handler that calls `/api/dz-agent/github/smart-push` and displays the PR URL on success.
- **RepoActionPanel**: Added "تصدير + PR + Vercel" button (🔨 icon, green) to `REPO_ACTIONS` array. Triggers `smart-push` intent prefill in the chat input.
- **PendingAction interface**: Extended with `type: 'smart-push'`, `files`, `prTitle`, `prBody`, `baseBranch`, `deployVercel` fields.
- **CSS**: New classes `.gh-approval-value--pipeline`, `.gh-pipeline-arrow`, `.gh-pipeline-vercel`, `.gh-approval-files`, `.gh-approval-file-row` in `src/styles/dz-agent.css`.
- **Files modified**: `src/components/DZChatBox.tsx`, `server.js`, `src/styles/dz-agent.css`.

## Multi-Provider AI Router (May 2026)

`lib/ai-router/index.js` rewritten with full 6-provider fallback chain:

- **OpenAI / Replit AI Integration** (`AI_INTEGRATIONS_OPENAI_API_KEY`) — primary
- **Google Gemini** (`GEMINI_API_KEY` or `GOOGLE_AI_API_KEY`) — `gemini-2.0-flash`
- **Mistral AI** (`MISTRAL_API_KEY`) — `mistral-small-latest`
- **NVIDIA NIM** (`NVIDIA_API_KEY`) — `meta/llama-3.3-70b-instruct` (OpenAI-compatible endpoint)
- **Cohere** (`COHERE_API_KEY`) — `command-r-plus-08-2024`
- **OpenRouter** (`OPENROUTER_API_KEY`) — `meta-llama/llama-3.3-70b-instruct:free` (catch-all)

Each provider is optional. The router tries providers in order and stops at the first valid response. `max_tokens` is always capped at 8192 per call to stay within provider limits. `getProviderStatus()` and `getRouterHealthSnapshot()` exported for diagnostics.

## Clone Engine Fixes (May 2026)

- **max_tokens capped to 8000** across all three `aiGenerate` calls in `modules/clone-engine/pipeline.js` (was 12000, exceeding Groq's 8192 limit — caused silent AI failures)
- **Jina AI Reader** added as fetch strategy #3 in `modules/clone-engine/fetcher.js` (`https://r.jina.ai/<url>`) — bypasses Cloudflare protection and JS-heavy pages before falling back to codetabs/corsproxy

## Mute (Temporary Ban) Feature in DZ Chat (May 2026)

Server already had full mute logic (`mutedUsers` Map, mute/unmute/muteUpdate broadcast, `muted` event with `remainSec`+`until`). Frontend was entirely missing the UI layer — added:

- **`isMuted` / `muteUntil` / `muteRemainSec` states** with countdown effect (ticks every second, auto-clears when time expires)
- **`muted` event handler** in `handleServerEvent` — sets mute state when server notifies the affected user
- **`muteUpdate` event handler** — applies or clears mute per userId in real-time for all connected clients
- **`adminMute(targetId, durationMs)`** — sends `mute` action via WebSocket or REST fallback
- **`adminUnmute(targetId)`** — sends `unmute` action
- **Red animated muted banner** above input: shows `VolumeX` icon + countdown (`Xد Yث` format)
- **Input disabled + placeholder updated** when muted; send button shows `VolumeX` icon
- **Admin User context menu** (right-click user in sidebar): 3 mute durations (10 min, 30 min, 60 min) + unmute option
- **Admin Message context menu**: same mute duration options for message sender
- **CSS**: `.dzc-muted-bar` (pulsing red gradient), `.dzc-muted-countdown` (red pill timer), `.dzc-input--muted`, `.dzc-context-item--mute`, `.dzc-context-separator`, `.dzc-context-label`
- **Files modified**: `src/pages/DZChat.tsx`, `src/styles/dzchat.css`

## Agent Manus (DZ Agent V3) — Route Confirmed

`DZAgentV3.tsx` is imported and routed at `/agent` in `src/main.tsx`. Server API mounted at `/api/dz-agent-v3/*`. Agents: planner, news, research, dev, execution, qa, synthesis. Accessible via `/agent` path.

## Admin Verified Badge + Pinned Message in DZ Chat (May 2026)

- **Blue verified badge** (`BadgeCheck` from lucide-react, Facebook blue `#1877f2`) added next to admin name in every chat message where `msg.isHighlighted === true`
- CSS class `.dzc-admin-verified-badge` with subtle blue glow added to `src/styles/dzchat.css`
- **Pinned message feature restored** — server already had full pin/unpin/pinUpdate logic; frontend was missing the entire UI layer:
  - `PinnedMessage` interface + `pinnedMessage` / `pinnedCollapsed` React states
  - `pinUpdate` event handler in `handleServerEvent` — real-time updates across all connected clients
  - `pinnedMessage` read from WebSocket `welcome` payload on join
  - Golden pin bar at top of chat area: shows sender name + truncated text, collapses to pill on dismiss
  - Admin: "تثبيت الرسالة" (Pin) and "إلغاء التثبيت" (Unpin) buttons in right-click context menu
  - CSS: `.dzc-pinned-bar`, `.dzc-pinned-pill`, `.dzc-context-item--pin` with gold accent color `#f0b429`
- **Files modified**: `src/pages/DZChat.tsx`, `src/styles/dzchat.css`

## External Dependencies

- **AI Providers**: Groq (default), DeepSeek, Ollama, + Gemini / Mistral / NVIDIA / Cohere / OpenRouter (optional via env vars).
- **Google Services**: Custom Search Engine API (`GOOGLE_API_KEY`, `GOOGLE_CSE_ID`).
- **Weather API**: OpenWeatherMap (`OPENWEATHER_API_KEY`).
- **GitHub**: GitHub API (for server-side integration and OAuth), GitHub OAuth app (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`).
- **YouTube Extractors**: Piped instances, Invidious instances, `ytdl-core`, `yt-dlp` binary.
- **Image Generation**: HuggingFace free Inference API (`HF_TOKEN` or `HUGGINGFACE_API_KEY`).
- **OCR**: `tesseract.js`.
- **Quran Data**: Quran.com API v4.
- **Web Scraping**: `jdwel.com` (via Jina AI Reader for Cloudflare bypass).
- **Deployment**: Vercel (`VERCEL_TOKEN`).
- **Libraries/Frameworks**: React, Vite, Express.js.
