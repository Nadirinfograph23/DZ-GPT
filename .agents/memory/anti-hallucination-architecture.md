---
name: Anti-Hallucination System Architecture
description: How the DZ Agent anti-hallucination system is structured — layer order matters, Arabic ؟ caveat
---

# Anti-Hallucination System — DZ Agent

## قاعدة مقاومة الهلوسة

### الطبقات بالترتيب (server.js):
1. **Anti-Hallucination Pre-check** — أماكن/أحداث وهمية — يجب أن يكون قبل static-facts
2. **Static Facts** — حقائق ثابتة عامة (عواصم، جغرافيا...)
3. **Anti-Hallucination Fast-Path** — رؤساء الجزائر بالسنة، خلفاء، ما قبل الاستقلال، مستقبل، قادة العالم

### ملف القاعدة: `lib/dz-knowledge.js`
- `DZ_PRESIDENTS` — جميع الرؤساء 1962→الآن
- `DZ_PRIME_MINISTERS` — رؤساء الحكومة
- `WORLD_LEADERS_2026` — القادة الحاليون
- `REAL_DZ_WILAYAS` — الـ58 ولاية الرسمية
- `FICTIONAL_DZ_EVENT_PATTERNS` / `FICTIONAL_DZ_PLACES` — أنماط الكشف

**Why:** الأماكن الوهمية يجب كشفها قبل static-facts لأن `lookupStaticFact("مدينة الزمرد في الجزائر")` يعود بحقيقة عن الجزائر بدلاً من رفض الاسم.

**كارثة Unicode:** علامة `؟` (U+061F) داخل نطاق `\u0600-\u06FF` — تُدرج في capture group العربي وتكسر `getAlgeriaPredecessor`. الحل: `\u0621-\u064A` أو strip بعد الاستخراج.

**How to apply:** أي إضافة لفئة جديدة من الأسئلة الثابتة → أضفها في `lib/dz-knowledge.js` وسجّل handler في الـ pre-check أو fast-path block بحسب الأولوية.
