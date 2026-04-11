# DZ-GPT

A Vite + React + Express AI chat application with multi-model support.

## Architecture

- **Frontend**: React + TypeScript, built with Vite. Located in `src/`.
- **Backend**: Express.js server in `server.js` — serves API routes and in development acts as a Vite middleware host.
- **Port**: Both dev and production run on port `5000` at `0.0.0.0`.

## Running the App

```bash
npm run dev      # Development (Vite middleware + Express API)
npm run build    # Build frontend to dist/
npm run start    # Production (serves dist/ + Express API)
```

## Environment Variables / Secrets

The following secrets must be configured in Replit's Secrets tab:

| Key | Purpose |
|-----|---------|
| `AI_API_KEY` | Primary AI provider API key (Groq by default) |
| `AI_API_URL` | AI API endpoint (default: Groq's completions URL) |
| `DEEPSEEK_API_KEY` | DeepSeek API key (for DeepSeek model support) |
| `GITHUB_TOKEN` | GitHub personal access token (for GitHub integration routes) |
| `OLLAMA_PROXY_URL` | URL for Ollama proxy (for local model support) |
| `GOOGLE_API_KEY` | Google Custom Search Engine API key (for DZ Agent search) |
| `GOOGLE_CSE_ID` | Google CSE engine ID (cx) — optional, defaults to `12e6f922595f64d35` |
| `OPENWEATHER_API_KEY` | OpenWeatherMap API key (for weather in DZ Agent dashboard) |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `VERCEL_TOKEN` | Vercel token for deployment trigger route |
| `DEPLOY_ADMIN_TOKEN` | Required admin token for the restricted `/api/dz-agent/deploy` route |

## API Routes

- `POST /api/chat` — Chat completions (multi-model via Groq/OpenAI compatible)
- `POST /api/dz-agent-search` — DZ Agent search
- `POST /api/dz-agent/education/search` — eddirasa.com educational search for DZ Agent study mode
- `GET /api/dz-agent/dashboard` — Live dashboard: news (RSS), sports, weather (cached 10 min)
- `POST /api/dz-agent/deploy` — Restricted Vercel deploy trigger; requires `DEPLOY_ADMIN_TOKEN` via `x-deploy-token` or Bearer auth
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

## DZ Agent Education Mode

DZ Agent has an added education layer that keeps existing behavior intact while adding:

- eddirasa.com-first retrieval for study questions.
- Subject detection for Math, Physics, Arabic, French, English, Science, and History / Geography.
- Academic level detection for Primary 1–5, Middle 1–4/BEM, and Secondary 1–3/Baccalaureate.
- Step-by-step exercise solving and simplified lesson explanations.
- A Study Level Selector Card in `src/components/DZChatBox.tsx` with level, subject, search input, Search eddirasa, Solve with AI, and Explain Lesson actions.

## DZ Agent Security and Expertise

- API chat messages are normalized server-side, limited to the last 24 messages, stripped of control characters, and capped per message before reaching AI providers.
- The public deploy route is restricted with `DEPLOY_ADMIN_TOKEN` and rate limited to reduce abuse risk.
- GitHub tokens entered in the UI are stored in `sessionStorage` only; legacy `localStorage` token copies are removed on load.
- Production CSP no longer enables `unsafe-eval`; development keeps it only for Vite tooling.
- DZ Agent's trusted source list now includes OWASP, MDN, Node.js, React, Vite, Express, GitHub Docs, Vercel, npm, and Cloudflare for programming/security answers, with instructions to prioritize recent sourced information and avoid unsupported claims.

## Key Files

- `server.js` — Express server with all API routes + Vite integration
- `vite.config.ts` — Vite config (host: 0.0.0.0, port: 5000)
- `src/` — React frontend
- `src/pages/` — Page components
- `src/components/` — UI components
- `src/components/DZChatBox.tsx` — DZ Agent chat UI, GitHub tools, and study selector
- `src/styles/dz-agent.css` — DZ Agent styles including study card styles

## Notes

- The server already correctly binds to `0.0.0.0:5000` for Replit compatibility.
- `allowedHosts: true` is set in vite.config.ts for proxied preview support.
- DZ Agent's Google CSE default is `12e6f922595f64d35`; eddirasa search uses `site:eddirasa.com` with that CSE when `GOOGLE_API_KEY` is available and falls back to web search when needed.
