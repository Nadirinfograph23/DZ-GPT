---
name: Cloudflare Express bridge
description: قيد توافق مهم عند تشغيل Express داخل Cloudflare Workers
---

عند تمرير طلبات JSON من Cloudflare Workers إلى Express عبر جسر يدوي، يجب أن يكون الطلب تيار Node صالحاً وأن يُحلَّل جسم JSON عند حدود Worker قبل تشغيل `body-parser`.

**Why:** تيار طلب يدوي يشبه `IncomingMessage` قد يترك `raw-body` منتظراً بلا نهاية، فيؤدي إلى Cloudflare 1101 أو رسالة خطأ شبكة عامة حتى قبل تنفيذ مسار المحادثة.

**How to apply:** استخدم `Readable.from(...)` للطلب، مرّر `req.body` الجاهز، واجعل `content-length` صفراً بعد نجاح التحليل حتى يتجاوز `body-parser` قراءة التيار مرة ثانية؛ اختبر مسار POST محلياً بـ Wrangler قبل النشر.