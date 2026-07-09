---
name: Maps intent classifier pitfalls
description: كلمات الوثائق الإدارية في government POI labels تُسبب تصنيف استفسارات الوثائق كـ map queries
---

# Maps Intent Classifier — نقاط الخطر

## القاعدة
كلمات الوثائق الإدارية (وثيقة، شهادة، تسجيل، جواز سفر، بطاقة تعريف) يجب ألا تكون في `POI_TYPES[*].labels` في `modules/dz-maps/intent.js`.

**Why:** `detectPoiType()` يعمل بـ substring matching بسيط. أي كلمة في labels تجعل `hasPoi = true`، فتمر على Step 4c (POI alone → GPS fallback → MAP) حتى بدون أي نية جغرافية.

**How to apply:** عند إضافة POI type جديد، اسأل: "هل هذه الكلمة تعني المكان/المنشأة أم نوع الخدمة/الوثيقة؟" — فقط المكان يدخل في labels.

## الحل المطبّق
1. حذف كلمات الوثائق من `government.labels`
2. حذف `مصلحة`, `المكتب`, `إدارة` (كانت generic جداً)
3. إضافة 7 patterns في `NON_MAP_REGEXES` تستبعد استفسارات الوثائق الإدارية

## اختبارات التحقق
```js
// يجب TEXT:
'وثيقة شهادة ميلاد', 'وثائق البلدية', 'شروط استخراج جواز السفر'
// يجب MAP:
'أين البلدية في وهران', 'بلدية سطيف', 'دائرة في عنابة'
```
