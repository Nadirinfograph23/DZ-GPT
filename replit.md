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

## API Routes

- `POST /api/chat` — Chat completions (multi-model via Groq/OpenAI compatible)
- `POST /api/dz-agent-search` — DZ Agent search
- `GET /api/dz-agent/dashboard` — Live dashboard: news (RSS), sports, weather (cached 10 min)
- `POST /api/dz-agent/deploy` — Trigger Vercel production redeploy
- Various GitHub API proxy routes

## Key Files

- `server.js` — Express server with all API routes + Vite integration
- `vite.config.ts` — Vite config (host: 0.0.0.0, port: 5000)
- `src/` — React frontend
- `src/pages/` — Page components
- `src/components/` — UI components

## Notes

- The server already correctly binds to `0.0.0.0:5000` for Replit compatibility.
- `allowedHosts: true` is set in vite.config.ts for proxied preview support.
