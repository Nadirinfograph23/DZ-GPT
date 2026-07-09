---
name: DZ-GPT deploy workflow
description: الفرع النشط وخطوات النشر بعد كل مهمة
---

# DZ-GPT Deploy Workflow

## الفرع النشط
الفرع الوحيد للتحديثات هو `devin/1774405518-init-dz-gpt` — لا يُعدَّل `main` مباشرة.

## خطوات النشر بعد كل مهمة
1. `git add` + `git commit` + `git push origin devin/1774405518-init-dz-gpt`
2. إطلاق Vercel عبر deploy hook المخزّن في `replit.md` (لا تُدرج URLs الـ hook في الذاكرة)

**Why:** المشروع يستخدم Vercel deploy hook مرتبط بالفرع — push → deploy تلقائي.

## الموقع المباشر
https://dz-gpt.vercel.app
