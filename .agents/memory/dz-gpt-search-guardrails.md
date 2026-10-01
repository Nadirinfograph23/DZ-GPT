---
name: DZ-GPT search and release guardrails
description: Stable doctor-search and YouTube-analysis requirements, plus production change approval boundary.
---

For DZ-GPT:
- Doctor search should combine multiple useful sources and show doctor names, specialties, addresses, and map links.
- A user must select a YouTube result before requesting its analysis.
- Do not change production domains or traffic routing without explicit user approval.

**Why:** Search quality and explicit user control are product requirements; production routing changes can affect live traffic.

**How to apply:** Preserve multi-source doctor results and address-aware Maps links, keep analysis behind result selection, and obtain explicit approval before changing production domains or routing.