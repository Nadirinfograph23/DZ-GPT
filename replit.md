# DZ-GPT

A Vite + React + Express AI chat application with multi-model support.

## Architecture

- **Frontend**: React + TypeScript, built with Vite. Located in `src/`.
- **Backend**: Express.js server in `server.js` — serves API routes and in development acts as a Vite middleware host.
- **Port**: Both dev and production run on port `5000` at `0.0.0.0`.
- **Intelligence Layer**: `src/utils/dzMemory.ts` — localStorage-based user behavior memory (intent detection, query tracking, smart suggestions, behavior context injection).

## User Intelligence System (dzMemory)

`src/utils/dzMemory.ts` provides a zero-dependency, privacy-first behavior layer:
- **Intent Detection**: classifies queries into 10 categories (coding, quran, ocr, news, sports, weather, github, currency, education, general)
- **Query Tracking**: stores last 30 queries with intent + timestamp in localStorage (`dza-memory-queries`)
- **Feature Usage Tracking**: tracks GitHub feature usage frequency
- **Behavior Context**: `buildBehaviorContext()` generates Arabic context hints injected into AI requests (server strips & uses them as BEHAVIOR INTELLIGENCE in system prompt)
- **Smart Suggestions**: `getSmartSuggestions()` returns ranked suggestions based on user history
- **Retry Utility**: `withRetry(fn, retries, delayMs)` — exponential retry used by all API loaders

## Performance & Reliability

- **DZDashboard**: all 5 API loaders wrapped with `withRetry(1 retry, 800ms delay)` — no more silent failures
- **DZChatBox**: 400ms debounce on sendMessage (ref-based, no state overhead), `withRetry(1 retry)` on fetch
- **server.js**: behavior context extraction — client-injected `[سياق المستخدم: ...]` is stripped from user message and injected into system prompt as `BEHAVIOR INTELLIGENCE` section

## DZ Agent Reliability Layer (server.js)

Added a server-side reliability layer that prevents empty/irrelevant responses:

- **`validateAIContent(text, query)`**: Rejects null, undefined, empty strings, placeholder responses (`null`, `undefined`, `n/a`, `...`), and content shorter than 5 meaningful chars.
- **`trimRelevantContext(messages, maxTurns=8)`**: Drops empty messages and keeps only system messages + last 8 turns. Reduces off-topic answers caused by unrelated history.
- **`safeGenerateAI({ messages, query, max_tokens })`**: Master fallback. Tries DeepSeek → Ollama → 4 Groq models in order, validating each response. Returns the first valid one.
- **`callDeepSeek` / `callOllama`**: Each wrapped in 25s `AbortController` timeout to prevent hanging requests.
- **`logInvalidResponse(stage, query, raw)`**: Structured warning log when a model returns invalid content, so failing stages can be traced.

Wired into:
- `/api/dz-agent-chat` — replaces previous inline DeepSeek/Ollama/Groq fallback chain. Falls through to existing static fallbacks (educational, weather priority, RSS, welcome) when all AI models fail.
- `/api/chat` — validates output and tries a secondary Groq model before failing.

## Dashboard Endpoint Resilience

All dashboard endpoints now return structured 200 responses (not 503/404) with explicit `error` and `status` fields, so the UI never sees an empty body:

- `/api/dz-agent/weather?city=...` — returns full schema with `null` values + `error` + `status: 'unavailable' | 'not_found'` on failure.
- `/api/currency/latest` — returns `{ base, provider, rates: {}, status: 'unavailable', error }` when all sources fail.
- `/api/dz-agent/prayer?city=...` — returns full prayer-times schema with `--` placeholders + `error` + `status: 'unavailable'` on failure.

## Running the App

```bash
npm run dev      # Development (Vite middleware + Express API)
npm run build    # Build frontend to dist/
npm run start    # Production (serves dist/ + Express API)
```

## Environment Variables / Secrets

The following secrets must be configured in Replit's Secrets tab and Vercel project environment:

| Key | Purpose |
|-----|---------|
| `AI_API_KEY` | Primary AI provider API key (Groq by default) |
| `AI_API_URL` | AI API endpoint (default: Groq's completions URL) |
| `DEEPSEEK_API_KEY` | DeepSeek API key (for DeepSeek model support) |
| `GITHUB_TOKEN` | GitHub personal access token (for server-side GitHub integration routes and deployment push automation) |
| `OLLAMA_PROXY_URL` | URL for Ollama proxy (for local model support) |
| `GOOGLE_API_KEY` | Google Custom Search Engine API key (for DZ Agent search) |
| `GOOGLE_CSE_ID` | Google CSE engine ID (cx) — optional, defaults to `12e6f922595f64d35` |
| `OPENWEATHER_API_KEY` | OpenWeatherMap API key (for weather in DZ Agent dashboard and weather-priority chat answers) |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `APP_BASE_URL` | Public app base URL, e.g. `https://dz-gpt.vercel.app` |
| `VERCEL_TOKEN` | Vercel token for deployment trigger route and deployment automation |
| `DEPLOY_ADMIN_TOKEN` | Required admin token for the restricted `/api/dz-agent/deploy` route |

## API Routes

- `POST /api/chat` — Chat completions (multi-model via Groq/OpenAI compatible)
- `POST /api/dz-agent-chat` — DZ Agent chat with live retrieval, GitHub context, and weather-priority support
- `POST /api/dz-agent-search` — DZ Agent search
- `GET /api/dz-agent/dashboard` — Live dashboard: news (RSS), sports, weather (cached 10 min)
- `GET /api/dz-agent/sync-status` — Compares the production GitHub branch head with the Vercel-deployed commit for DZ Agent sync visibility
- `GET /api/dz-agent/weather` — Per-city weather via OpenWeather API with server-side caching
- `GET /api/currency/latest` — Live exchange rates against the Algerian dinar
- `POST /api/dz-agent/deploy` — Restricted Vercel deploy trigger; requires `DEPLOY_ADMIN_TOKEN` via `x-deploy-token` or Bearer auth
- `GET /api/auth/github` — Starts GitHub OAuth
- `GET /api/auth/github/callback` — Handles GitHub OAuth callback
- Various GitHub API proxy routes:
  - `POST /api/dz-agent/github/repos` — List user repos
  - `POST /api/dz-agent/github/files` — Browse repo files
  - `POST /api/dz-agent/github/file-content` — Read file
  - `POST /api/dz-agent/github/analyze` — AI code analysis
  - `POST /api/dz-agent/github/code-action` — Code actions (fix, explain, improve)
  - `POST /api/dz-agent/github/commit` — Commit changes
  - `POST /api/dz-agent/github/pr` — Create Pull Request
  - `POST /api/dz-agent/github/repo-scan` — Full repo AI scan
  - `POST /api/dz-agent/github/branches` — List branches
  - `POST /api/dz-agent/github/issues` — List open issues
  - `POST /api/dz-agent/github/pulls` — List Pull Requests
  - `POST /api/dz-agent/github/stats` — Repo statistics & contributors

## DZ Agent Sidebar & Chat History

DZ Agent features a sidebar identical in style to the main DZ GPT models, including:

- **Chat history**: Each conversation is stored per-chat in `localStorage` under `dz-agent-msgs-{chatId}`. Chat list is stored under `dz-agent-chats`.
- **New chat button**: Creates a fresh conversation and saves it to the list.
- **Delete chat**: Removes the conversation and its messages from `localStorage`.
- **Language selector**: Three languages with flags — 🇩🇿 العربية (Arabic), 🇬🇧 English, 🇫🇷 Français. Language preference is persisted in `localStorage` under `dz-agent-lang`.
- **Mobile responsive**: Sidebar slides in/out on mobile (width < 769px); always visible on desktop.
- **DZChatBox** accepts `chatId`, `language`, and `onTitleChange` props for external chat management.

Key files: `src/pages/DZAgent.tsx` (layout + sidebar state), `src/styles/dz-agent.css` (`.dza-*` classes).

## DZ Agent GitHub Workspace

DZ Agent prioritizes the GitHub workflow on the welcome screen:

- GitHub OAuth is available from the main workspace card and the top GitHub bar.
- After OAuth completes, the app automatically fetches the user's repositories.
- Selecting a repository shows a repository action card with scan, bug finding, security scan, suggestions, files, branches, issues, Pull Requests, Commit, PR creation, and stats actions.
- The previous education center/study selector UI has been removed from the DZ Agent interface.
- GitHub OAuth state validation is cookie-backed so it works reliably on serverless production hosts such as Vercel.

## DZ Agent Live Cards

- The DZ Agent landing dashboard includes prayer times, weather, news, sports calendar/LFP results, tech news, and currency exchange rates.
- Weather and prayer times share the selected Algerian wilaya.
- Currency rates are loaded from `/api/currency/latest`; sports calendar data comes through the dashboard LFP payload.
- A sync tab compares the GitHub production branch with the Vercel-deployed commit and shows whether both are on the same version.
- Clicking the weather dashboard card sends a clean chat prompt while injecting `context: weather_priority` only into the server request. The server fetches OpenWeather data before the AI response and falls back safely if the API key or API response is unavailable.

## DZ Agent Header Update

- `/dz-agent` header now places the HOME button at the far-left side of the main header and keeps SPA navigation to `/`.
- The refresh icon button creates a new DZ Agent chat session with the same state reset behavior as the sidebar New Chat button.
- The refresh action is SPA-only and does not reload the page.

## Homepage Suggestion Interaction

- Homepage suggestion chips now force a fresh chat session, inject the clicked suggestion as the first user message, and auto-send it immediately.
- The action is guarded by the existing loading state to avoid duplicate sessions from repeated clicks.

## DZ Agent Security and Expertise

- API chat messages are normalized server-side, limited to the last 24 messages, stripped of control characters, and capped per message before reaching AI providers.
- The public deploy route is restricted with `DEPLOY_ADMIN_TOKEN` and rate limited to reduce abuse risk.
- GitHub tokens entered in the UI are stored in `sessionStorage` only; legacy `localStorage` token copies are removed on load.
- Production CSP no longer enables `unsafe-eval`; development keeps it only for Vite tooling.
- DZ Agent's trusted source list includes OWASP, MDN, Node.js, React, Vite, Express, GitHub Docs, Vercel, npm, and Cloudflare for programming/security answers.

## Key Files

- `server.js` — Express server with all API routes + Vite integration
- `vite.config.ts` — Vite config (host: 0.0.0.0, port: 5000)
- `src/` — React frontend
- `src/pages/` — Page components
- `src/components/` — UI components
- `src/components/DZChatBox.tsx` — DZ Agent chat UI, GitHub OAuth, repository selection, dashboard prompt handling, and repository action panels
- `src/components/DZDashboard.tsx` — Live dashboard cards and weather-priority prompt trigger
- `src/pages/AIQuran.tsx` — AI Quran page
- `src/styles/ai-quran.css` — AI Quran page styles
- `src/styles/dz-agent.css` — DZ Agent styles including GitHub workspace, header controls, and repository action panel styles

## DZ Agent Chat Navigation Update

- `/dz-agent` now acts as the DZ Agent landing page with a prominent AI-DZ CHAT entry button plus HOME navigation.
- `/chat` is the dedicated AI-DZ CHAT page with HOME and DZ Agent navigation buttons in the header.
- The chat supports visible invocation codes at the top of the welcome state: `@dz-agent`, `@dz-gpt`, and `/github`.
- The welcome cards were compacted so the DZ Agent chat box remains visible and usable on smaller screens.

## OCR DZ (نموذج استخراج النصوص)

- النموذج `ocr-dz` يدعم رفع الصور (jpg, png, bmp, webp, tiff) وملفات PDF في نفس الوقت
- يستخدم `tesseract.js` لاستخراج النص بدقة (عربي + إنجليزي + فرنسي)
- بعد رفع الملف يظهر زر "Extract Text" لبدء المعالجة
- **Pipeline ذكي**: استخراج النص → تصحيح AI (إملاء + صياغة + تنظيف) → وضع chat للتحليل
- ملفات PDF المحتوية على صور تُحوَّل إلى canvas ثم OCR (دعم حتى 15 صفحة)
- النص المستخرج والمصحح يُمرَّر كـ context للمحادثة للإجابة على الأسئلة

## AI Quran

- `/aiquran` is available as a dedicated Quran page using Quran.com API v4 for chapters, verses, translations, recitations, and audio.
- **Theme colors**: Updated from golden yellow (`#c8a96e`) to yellow-green (`#9acd32`) to match DZ GPT branding.
- The page includes chapter navigation, reading/tafsir/audio tabs, a Quran-only AI chat box, and verse search with highlighted word matches.
- The Quran audio player supports full-surah listening from the ayah menu, repeat-current-surah mode, and automatic next-surah playback.
- Quran verse search accepts an ayah number for the currently open surah, scrolls directly to it, and highlights it.
- Quran text uses bundled Amiri Quran and Noto Naskh Arabic font files from `public/fonts/` to avoid missing Arabic glyphs in production browsers.
- CSP allows `https://api.quran.com` for data requests and Quran audio domains for media playback.

### Ayah Interaction System
- Each verse card has a ⋮ menu button that opens a context menu with three actions:
  1. **حفظ العلامة (Bookmark)** — saves the ayah to localStorage, shows in bookmarks panel
  2. **استماع (Listen)** — plays audio for that specific ayah via Quran API verse-level recitation
  3. **المساعد الذكي (Smart Assistant)** — opens the AI chat with the ayah pre-loaded for tafsir
- A bookmarks panel (toggle button in header) shows all saved ayat with listen, ask AI, and delete options
- Individual verse audio plays via a floating mini-player bar at the bottom of the screen
- The verse audio uses `GET /api/v4/recitations/{recitation_id}/by_ayah/{ayah_key}` from the Quran API

### Mobile Responsiveness
- Fully responsive layout: sidebar collapses to a slide-in panel on mobile
- AI assistant panel is hidden on mobile (accessible via the toggle button)
- Surah index modal is usable on mobile with proper sizing
- Header elements collapse gracefully on small screens

### DZ Agent Dashboard — Quran Card
- "القرآن الكريم" is the first tab in the DZ Agent dashboard, with a 📖 icon
- Clicking it redirects to `/aiquran` (navigation card, not a data panel)
- The Quran button was removed from the DZ Agent header

## Notes

- The server correctly binds to `0.0.0.0:5000` for Replit compatibility.
- `allowedHosts: true` is set in vite.config.ts for proxied preview support.
- In development, the CSP `frame-ancestors` directive allows Replit preview iframe origins; production keeps iframe embedding disabled with `frame-ancestors 'none'`.
- The production service worker uses network-first/no-store fetching for app assets to prevent old cached UI bundles from mixing with newly deployed versions.
- DZ Agent's Google CSE default is `12e6f922595f64d35`; eddirasa search backend endpoints may remain available but the education center UI is not exposed in DZ Agent.

## DZ Smart Agent Layer (added 2026-04-28)

A new modular intelligence layer was added under `/lib/` and exposed as
`/api/agent/*` endpoints. It is **additive** — the existing
`/api/dz-agent-chat`, dashboard endpoints, and UI components are unchanged.

### Pipeline
`User Query → Intent Detection → Smart Router → Multi-Source Fetch →
Filter + Rank → Engine Response → Memory + LRU Cache`

### Files
- `lib/intent.js` — `detectIntent()` returns `builder | github | news | structured | general` plus language and live-mode flags. Includes `expandQuery()` for AR↔EN multi-query expansion.
- `lib/router.js` — `ask(query)` orchestrator + per-engine functions.
- `lib/news.js` — `FEED_MANIFEST` (Algeria-first), `getTopNews()`, parallel feed fetch, optional injected fetcher.
- `lib/github.js` — `searchRepos()`, `searchCode()`, `getRepoInsight()`, `trendingRepos()`, heuristic `detectStack()`. Uses `GITHUB_TOKEN` if set.
- `lib/builder.js` — `buildSite(brief)` returns plan + scaffold files; pulls inspiration from GitHub trending templates.
- `lib/ranker.js` — `rankAndTrim()` with Algeria-first scoring (Djazairess +60, APS +55, Echorouk/Ennahar +50, El Heddaf +45 sports, Google News DZ +40, Arabic +25, Global +10) + freshness + relevance + spam filter + dedup.
- `lib/cache.js` — LRU + TTL cache (`queryCache`, `newsCache`, `githubCache`, `builderCache`).
- `lib/memory.js` — File-backed self-learning memory (`/data/memory.json`), Jaccard similarity recall, fresh-reuse window 30min.
- `lib/agent-mount.js` — Express mount + 6h background refresh loop.
- `data/memory.json` — persistent answer memory store.

### Endpoints
- `GET  /api/agent/health`
- `GET  /api/agent/ask?q=...&limit=...`
- `POST /api/agent/ask` — body `{ query, limit?, bypassCache?, bypassMemory? }`
- `GET  /api/agent/news?q=...&limit=...&sports=1`
- `GET  /api/agent/github?q=...&limit=...&insight=1`
- `POST /api/agent/builder` — body `{ brief }`
- `GET  /api/agent/memory/recent` and `/api/agent/memory/stats`
- `POST /api/agent/memory/purge`
- `POST /api/agent/refresh` — manual trigger of the 6h cron warm-up

### Wiring in server.js
- Single import at top: `import { mountSmartAgent } from './lib/agent-mount.js'`
- Single call before `app.listen(...)`: `mountSmartAgent(app, { fetcher: feed => fetchMultipleFeeds([feed]).then(arr => arr[0] || null) })`
- Background refresh runs every 6h (warms news cache + trending repos).

### Notes
- The smart agent reuses the server's `fetchMultipleFeeds` / `RSS_CACHE` so feed fetches are not duplicated.
- Memory is capped at 500 entries with LRU eviction; writes are atomic (`tmp` + `rename`).
- All engines fail safe with `⚠️ لم أتمكن من العثور على بيانات حديثة...` if no results.

## DZ Smart Agent — Phase 2: Reasoning + Citations + Safety (added 2026-04-28)

Distilled production patterns from a curated set of leaked system prompts
(Perplexity Comet, GPT-5 Thinking, Claude Code, Warp 2.0 Agent, Kagi)
and adapted them for an Algerian-first audience. UI was not touched.

### New Modules
- `lib/prompts.js` — DZ Agent master system prompt, composed by intent (`general | news | github | builder | structured | deep`). Sections: identity, core behavior (no-clarification, partial-over-perfect, anti-sycophancy), Algeria context, search discipline (max 3 sub-queries), response formatting, safety, tool-use, code rules.
- `lib/citations.js` — Perplexity-style numbered inline citations `[n]`, no bibliography, sentence-level keyword matching, registry export.
- `lib/safety.js` — Prompt-injection detection (AR + EN patterns), `quarantineExternal()` wrapper for fetched content (treat as data, not commands), secret redaction (GitHub/Vercel/OpenAI/Anthropic/Google/Slack tokens, JWTs, private keys), PII redaction, safe refusal builder.
- `lib/planner.js` — Decomposes a query into 1–3 focused sub-queries with temporal qualifiers (Perplexity discipline), returns ordered execution plan.
- `lib/responder.js` — Renders router payloads as clean Markdown: news cards with tier flags 🇩🇿/🌐/🌍, GitHub tables, builder plans + scaffold code blocks, structured tables, then attaches inline citations.
- `lib/reasoner.js` — Deep-research orchestrator: `plan → parallel multi-fetch → fuse + rank → self-critique → render with citations → memory`.

### New Endpoints (all under `/api/agent/*`, additive)
- `GET  /api/agent/think?q=…`        — fast intent + plan, no fetch
- `GET  /api/agent/plan?q=…`         — full plan with sub-queries + steps
- `GET/POST /api/agent/deep`         — deep-research pipeline (markdown + citations)
- `POST /api/agent/render`           — render any payload to Markdown + citations
- `GET  /api/agent/system-prompt?intent=…`
- `POST /api/agent/safety/scan`      — injection score + harm score + sanitized output
- `POST /api/agent/safety/refusal`   — clean refusal builder

### Verified behavior
- Deep pipeline on "أخبار الجزائر": 8 s end-to-end, fetched 180 articles, kept top 8 with 100% Algerian sources at the top, 8 inline citations attached, zero self-critique issues.
- Safety scan correctly detected `ignore previous instructions` + `reveal system prompt` patterns and redacted a leaked `ghp_` token.
- Planner correctly identified `compare react vs vue today` as `structured` intent with `liveMode: true` and added the `2026` temporal qualifier.
