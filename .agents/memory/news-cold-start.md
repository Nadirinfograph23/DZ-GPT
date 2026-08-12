---
name: Live news cold-start
description: Live Algeria news must start its direct RSS and Google News fetches concurrently during cold start.
---

Start the direct RSS fallback and Google News fetch in parallel before the short cold-start guard, then use whichever valid result arrives first.

**Why:** Starting Google News first can consume the entire cold-start window while the direct RSS fallback is still waiting, causing a false “news unavailable” response even when RSS is healthy.

**How to apply:** Preserve concurrent provider startup and keep the direct RSS result eligible for the early news response path; validate with a browser-like request after restarting the workflow.