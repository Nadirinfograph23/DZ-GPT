# DZ-GPT

## Overview
DZ-GPT is a comprehensive AI chat application built with Vite, React, and Express, designed to offer multi-model AI capabilities and a rich user experience. The project aims to provide an advanced, multi-functional AI agent that can handle diverse queries, generate code, provide real-time information, and offer voice-based interactions. Key features include autonomous multi-agent task execution, full-stack web application generation, and intelligent conversational abilities with multi-language support (Arabic, French, English). The project emphasizes reliability, performance, and user-centric design, ensuring robust responses and a seamless experience across various functionalities like news aggregation, weather updates, GitHub integration, and specialized Quranic AI.

## User Preferences
(No explicit user preferences were found in the provided document.)

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

## External Dependencies

- **AI Providers**: Groq (default), DeepSeek, Ollama.
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