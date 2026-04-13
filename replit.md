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

The following secrets must be configured in Replit's Secrets tab and Vercel project environment:

| Key | Purpose |
|-----|---------|
| `AI_API_KEY` | Primary AI provider API key (Groq by default) |
| `AI_API_URL` | AI API endpoint (default: Groq's completions URL) |
| `DEEPSEEK_API_KEY` | DeepSeek API key (for DeepSeek model support) |
| `GITHUB_TOKEN` | GitHub personal access token (for server-side GitHub integration routes) |
| `OLLAMA_PROXY_URL` | URL for Ollama proxy (for local model support) |
| `GOOGLE_API_KEY` | Google Custom Search Engine API key (for DZ Agent search) |
| `GOOGLE_CSE_ID` | Google CSE engine ID (cx) — optional, defaults to `12e6f922595f64d35` |
| `OPENWEATHER_API_KEY` | OpenWeatherMap API key (for weather in DZ Agent dashboard) |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `APP_BASE_URL` | Public app base URL, e.g. `https://dz-gpt.vercel.app` |
| `VERCEL_TOKEN` | Vercel token for deployment trigger route |
| `DEPLOY_ADMIN_TOKEN` | Required admin token for the restricted `/api/dz-agent/deploy` route |

## API Routes

- `POST /api/chat` — Chat completions (multi-model via Groq/OpenAI compatible)
- `POST /api/dz-agent-search` — DZ Agent search
- `GET /api/dz-agent/dashboard` — Live dashboard: news (RSS), sports, weather (cached 10 min)
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
- `src/components/DZChatBox.tsx` — DZ Agent chat UI, GitHub OAuth, repository selection, and repository action panels
- `src/styles/dz-agent.css` — DZ Agent styles including GitHub workspace and repository action panel styles

## DZ Agent Chat Navigation Update

- `/dz-agent` now acts as the DZ Agent landing page with a prominent AI-DZ CHAT entry button plus HOME navigation.
- `/chat` is the dedicated AI-DZ CHAT page with HOME and DZ Agent navigation buttons in the header.
- The chat supports visible invocation codes at the top of the welcome state: `@dz-agent`, `@dz-gpt`, and `/github`.
- The welcome cards were compacted so the DZ Agent chat box remains visible and usable on smaller screens.

## Notes

- The server correctly binds to `0.0.0.0:5000` for Replit compatibility.
- `allowedHosts: true` is set in vite.config.ts for proxied preview support.
- In development, the CSP `frame-ancestors` directive allows Replit preview iframe origins; production keeps iframe embedding disabled with `frame-ancestors 'none'`.
- DZ Agent's Google CSE default is `12e6f922595f64d35`; eddirasa search backend endpoints may remain available but the education center UI is not exposed in DZ Agent.
