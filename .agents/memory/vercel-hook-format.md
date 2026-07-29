---
name: Vercel deploy hook format
description: The configured Vercel deploy hook must be a complete HTTP(S) URL.
---

The deploy hook secret must contain the full `https://...` URL, not only a token or hostname.

**Why:** A malformed value is interpreted by curl as a host name and prevents triggering a deployment even when the GitHub push succeeds.

**How to apply:** Validate the value format before calling the hook; never print the secret. If invalid, report that the live site may still be serving the previous build.