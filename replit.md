# DZ-GPT — حالة المشروع

> **آخر تحديث:** 6 يونيو 2026

---

## Git & Deployment

| العنصر | القيمة |
|--------|--------|
| **الفرع النشط** | `devin/1774405518-init-dz-gpt` ← كل التحديثات هنا فقط |
| **Repo** | `https://github.com/Nadirinfograph23/DZ-GPT` |
| **Vercel** | https://dz-gpt.vercel.app — Project ID: `prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5` |
| **Deploy Hook** | مربوط بالفرع — يُطلق تلقائياً عند كل push |

> 🚨 لا تعديل على `main` أبداً. `git commit/push` مقيّد — نستخدم `scripts/deploy.py` فقط.

---

## 🚀 قاعدة النشر الإلزامية — بعد كل مهمة

### الطريقة المثلى: `scripts/deploy.py` (Git Data API)

```bash
# ملف واحد أو أكثر — server.js افتراضياً
python3 scripts/deploy.py "وصف التعديل"

# ملفات محددة
python3 scripts/deploy.py "feat: وصف" server.js src/pages/X.tsx lib/y.js
```

**الآلية:** blob → tree → commit → ref update → Vercel deploy hook تلقائياً
- ✅ لا حد لحجم الملف (Git binary protocol — أسرع من base64 Contents API)
- ✅ لا تعارض في التاريخ (يبني دائماً على HEAD الحالي بالـ remote)
- ✅ Vercel يُطلَق تلقائياً بعد نجاح GitHub
- ✅ رسائل واضحة مع SHA لكل خطوة

### Deploy Hook مباشر (لتشغيل Vercel بدون رفع ملفات)
```bash
curl "https://api.vercel.com/v1/integrations/deploy/prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5/ul5gBfG4Af"
```

---

## 🔑 Secrets (Replit)

| المتغير | الحالة |
|---------|--------|
| `AI_API_KEY` (Groq) | ✅ |
| `GEMINI_API_KEY` | ✅ حصة مجانية |
| `MISTRAL_API_KEY` | ✅ |
| `NVIDIA_API_KEY` | ✅ |
| `COHERE_API_KEY` | ✅ |
| `OPENROUTER_API_KEY` | ✅ |
| `HF_TOKEN` | ✅ |
| `OPENWEATHER_API_KEY` | ✅ |
| `GITHUB_TOKEN` | ✅ |
| `VERCEL_TOKEN` | ✅ |
| `DEEPSEEK_API_KEY` | ⚠️ رصيد فارغ |
| `GOOGLE_API_KEY` / `GOOGLE_CSE_ID` | ⚠️ API_KEY_SERVICE_BLOCKED |

---

## ⚠️ مشاكل قيد الحل

| الأولوية | المشكلة | الحل |
|---------|---------|------|
| 🔴 | Google CSE مقيّد | Google Cloud Console → Credentials → رفع قيد Custom Search API |
| 🟡 | DeepSeek رصيد فارغ | شحن على platform.deepseek.com |
| 🟡 | Groq مفتاح واحد فقط | إضافة `AI_API_KEY_2`→`AI_API_KEY_10` |

---

## 🗺️ مسارات الصفحات

| المسار | الصفحة |
|--------|--------|
| `/` أو `/dz-agent` | DZAgent.tsx — الرئيسية |
| `/agent` | DZAgentV3.tsx — Agent Manus |
| `/dz-chat` أو `/dzchat` | DZChat.tsx |
| `/quran` | AIQuran.tsx |
| `/dz-tube` | DZTube.tsx |
| `/stats` | DZStats.tsx |
| `/tools` | DZTools.tsx — CV + مخطط + قانوني |

---

## 📡 API Endpoints الرئيسية

| Method | Path | الوصف |
|--------|------|-------|
| POST | `/api/dz-agent-chat` | المحادثة الرئيسية |
| POST | `/api/dz-agent-v4/smart` | V4 PRO — كود + صور + رسوم |
| POST | `/api/dz-agent/github/smart-push` | Push → PR → Vercel |
| POST | `/api/dz-agent/github/pages/deploy` | GitHub Pages engine |
| POST | `/api/dz-agent/thinking-trace` | 6-role deliberation SSE |
| GET  | `/api/health` | حالة السيرفر |
| WS   | `/ws/chat` | WebSocket DZ Chat |

---

## 🏗️ هيكل المشروع (المختصر)

```
DZ-GPT/
├── server.js          ← Express + WebSocket (19000+ سطر)
├── api/index.js       ← Vercel serverless entry
├── scripts/
│   └── deploy.py      ← سكريبت النشر المثالي (Git Data API)
├── src/
│   ├── pages/         ← DZAgent, DZChat, AIQuran, DZTube, DZStats, DZTools
│   ├── components/    ← DZChatBox, DZDashboard, VoicePanel
│   └── styles/        ← CSS لكل صفحة
├── lib/
│   ├── ai-router/     ← 6 مزودين + circuit breaker
│   ├── dz-v2/ → v5/   ← طبقات الذكاء المتراكمة
│   ├── github-pages/  ← GitHub Pages engine
│   └── resilience.js  ← semaphore + circuit breaker
├── modules/           ← clone-engine, dz-maps, youtube_insight
├── dialect/           ← محرك الدارجة الجزائرية
└── data/              ← dz_dialect.json, dz_learned.json
```

---

## User Preferences

- بعد كل مهمة: `python3 scripts/deploy.py "وصف"` ← Vercel يتحدث تلقائياً ← إبلاغ المستخدم
- الفرع النشط الوحيد: `devin/1774405518-init-dz-gpt`
- لا `main`، لا `git push` مباشر — `scripts/deploy.py` فقط
- Node 20 | Python 3.11 | Port 5000
- `npm run dev` ← يشغّل `node server.js`
