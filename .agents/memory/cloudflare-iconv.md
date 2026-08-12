---
name: Cloudflare iconv compatibility
description: Why iconv-lite needs a Cloudflare-specific stream guard before Wrangler bundling.
---

`iconv-lite` can expose browser-disabled `streams` and `extend-node` modules as empty CommonJS wrappers during Wrangler bundling. Cloudflare Workerd may then throw `require_streams(...) is not a function` on routes that parse RSS or other response data, even when Node tests and simple Worker routes succeed.

**Why:** The failure is runtime- and route-dependent, so a successful local Express check does not prove the bundled Worker is safe.

**How to apply:** Keep the postinstall compatibility patch idempotent, guard Node-only stream extensions when `CF_PAGES` is set, and apply it to every nested `iconv-lite` copy used by `body-parser` and `raw-body` before running Wrangler.