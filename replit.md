# DZ-GPT

## Run & Operate
- **Dev**: `npm run dev` (Express + Vite on port 5000)
- **Prod**: `npm run build && npm start`
- **Health checks**: `GET /api/system-health` | `GET /api/agent/health` | `GET /api/dz-agent-v2/health`

Required env secrets (all optional — agent degrades gracefully without them):
- `GROQ_API_KEY` / `GROQ_API_KEY_2` … — primary LLM provider
- `DEEPSEEK_API_KEY` — secondary LLM fallback
- `GOOGLE_API_KEY`, `GOOGLE_CSE_ID` — search enrichment
- `OPENWEATHER_API_KEY` — weather fallback
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN` — GitHub OAuth & API
- `HF_TOKEN` / `HUGGINGFACE_API_KEY` — image generation (V4)
- `OLLAMA_PROXY_URL` — third LLM fallback
- `VERCEL_TOKEN`, `DEPLOY_ADMIN_TOKEN` — deploy automation

## Stack
- **Frontend**: React 18, TypeScript, Vite 6, Tailwind CSS, React Router v7
- **Backend**: Node.js 20, Express 4, WebSockets (`ws`)
- **AI Providers**: Groq (primary, key rotation) → DeepSeek → Ollama (fallbacks)
- **OCR**: tesseract.js | **Charts**: recharts | **PDF**: pdfjs-dist
- **YouTube**: @distube/ytdl-core, youtube-sr | **Compression**: jszip

## Where things live
- `server.js` — monolithic Express server (11k+ lines), all API routes
- `src/` — React SPA (pages/, components/, context/, utils/, styles/)
- `lib/` — backend engines: router.js, agent-mount.js, dz-v2/, dz-v3/, dz-v4/, cache.js, memory.js
- **Resilience layer**: `lib/resilience.js` — Semaphore, Deduplicator, CircuitBreaker, HealthMonitor, scheduleOnce
- `modules/` — feature modules: algeria-knowledge-system/, dz-maps/, youtube_insight_module/, web-generator/
- `voice-system/` — browser STT/TTS + wake word
- `data/` — persistent JSON (memory.json, pending_learning.json, analytics)
- `public/` — static assets, Arabic fonts, PWA manifest

## Architecture decisions
- **Layered agents**: V1 (smart router) → V2 (multi-agent+plugins) → V3 (autonomous+SSE) → V4 (project gen). Each layer is additive — new routes, no old route changes.
- **Resilience layer** (`lib/resilience.js`): AI concurrency semaphore (max 6), in-flight request deduplication, per-provider circuit breakers (Groq/DeepSeek/Ollama), non-overlapping background jobs via `scheduleOnce`, process-level uncaughtException/unhandledRejection handlers. Server never crashes.
- **Key rotation**: Multiple GROQ_API_KEY_n env vars, each with cooldown/error tracking, ordered by lowest latency.
- **Dev/prod parity**: In dev, Vite runs as Express middleware on port 5000. In prod, `dist/` is served statically.
- **Stale-while-revalidate**: All caches (`makeCache`) support `.getStale()` to serve expired data as last-resort fallback.

## Product
- Multi-model AI chat (ChatGPT/LLaMA/Qwen/GPT-OSS modes via Groq)
- **FreeDZ Agent** (V1-V4): news, GitHub intelligence, web builder, autonomous research, code generation
- **DZ Tube**: YouTube audio streaming with multi-extractor fallback chain
- **AI Quran**: Quran.com API v4, reading/tafsir/audio, ayah interaction
- **OCR DZ**: Image + PDF text extraction (AR/EN/FR) with AI correction
- **Voice**: Browser Web Speech API STT/TTS + wake word ("hey dz")
- **DZ Dashboard**: Live prayer times, weather (all 58 wilayas), news, sports (LFP), currency rates
- Multi-language: Arabic (primary), French, English

## User Preferences
- Arabic-first UI and AI responses
- No breaking changes — all improvements are additive layers
- Performance and reliability are paramount

## Gotchas
- `server.js` is the single source of truth for all Express routes — extremely long file
- In dev mode, Vite middleware intercepts everything not matched by Express — register API routes BEFORE Vite setup
- THROTTLE_MAP auto-pruned every 10s via `autoCleanMap` — was a memory leak before
- `scheduleOnce` replaces `setInterval` for all background jobs — prevents overlap/pile-up
- `safeGenerateAI` wrapped with semaphore (max 6 concurrent) + deduplicator — prevents cascade failures under load
- Circuit breakers auto-reset after cooldown — no manual intervention needed

## Pointers
- Resilience module: `lib/resilience.js`
- Agent mount: `lib/agent-mount.js`, `lib/dz-v2/mount.js`, `lib/dz-v3/mount.js`, `lib/dz-v4/mount.js`
- Cache: `lib/cache.js` (LRU+TTL singletons)
- Memory: `lib/memory.js` (file-backed Jaccard similarity)
- Prompts: `lib/prompts.js`
