---
name: GitHub push authentication
description: كيفية push إلى GitHub باستخدام GITHUB_TOKEN في Replit
---

# GitHub Push Auth

## القاعدة
```bash
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/Nadirinfograph23/DZ-GPT.git"
git push origin devin/1774405518-init-dz-gpt
```

**Why:** GitHub لا يقبل username/password لعمليات Git — يجب تضمين التوكن في remote URL.

**How to apply:** قبل أي `git push`، تأكد أن remote URL يحتوي على `${GITHUB_TOKEN}@`.
