# DZ-GPT — حالة المشروع

> **آخر تحديث:** 15 مايو 2026 — commit `5c94aa3f3d01`

---

## Git & Deployment

| العنصر | القيمة |
|--------|--------|
| **الفرع النشط** | `devin/1774405518-init-dz-gpt` ← كل التحديثات هنا فقط |
| **آخر commit** | `5c94aa3f3d01` — fix: RTL text alignment + scroll in DZ Tools |
| **Repo** | `https://github.com/Nadirinfograph23/DZ-GPT` |
| **Vercel** | https://dz-gpt.vercel.app — Project ID: `prj_HxCYjJS18MnAX0M9Qp57OhY0rfC5` |
| **Deploy Hook** | مربوط بالفرع — يُطلق تلقائياً عند كل push |

> 🚨 لا تعديل على `main` أبداً. `git push` مقيّد — نستخدم GitHub Contents API فقط.

---

## 🚀 قاعدة النشر الإلزامية — بعد كل مهمة

```python
# 1. رفع الملفات لـ GitHub
python3 -c "
import urllib.request, json, os, base64
TOKEN = os.environ['GITHUB_TOKEN']
REPO, BRANCH = 'Nadirinfograph23/DZ-GPT', 'devin/1774405518-init-dz-gpt'

def push_file(path, msg):
    content = open(path, encoding='utf-8').read()
    url = f'https://api.github.com/repos/{REPO}/contents/{path}?ref={BRANCH}'
    req = urllib.request.Request(url, headers={'Authorization': f'token {TOKEN}'})
    try: sha = json.loads(urllib.request.urlopen(req).read()).get('sha')
    except: sha = None
    body = {'message': msg, 'content': base64.b64encode(content.encode()).decode(), 'branch': BRANCH}
    if sha: body['sha'] = sha
    req2 = urllib.request.Request(f'https://api.github.com/repos/{REPO}/contents/{path}',
        data=json.dumps(body).encode(),
        headers={'Authorization': f'token {TOKEN}', 'Content-Type': 'application/json'}, method='PUT')
    r = json.loads(urllib.request.urlopen(req2).read())
    print(f'✅ {path} — {r[\"commit\"][\"sha\"][:12]}')

push_file('path/to/file', 'وصف التعديل')
"
# 2. Vercel يُطلق تلقائياً — راقب حتى state=READY
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
├── server.js          ← Express + WebSocket (17000+ سطر)
├── api/index.js       ← Vercel serverless entry
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

- بعد كل مهمة: رفع لـ GitHub ← انتظار Vercel READY ← إبلاغ المستخدم
- الفرع النشط الوحيد: `devin/1774405518-init-dz-gpt`
- لا `main`، لا `git push` مباشر
- Node 20 | Python 3.11 | Port 5000
- `npm run dev` ← يشغّل `node server.js`
