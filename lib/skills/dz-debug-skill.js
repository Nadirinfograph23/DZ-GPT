// lib/skills/dz-debug-skill.js
// DZ-Debug-Skill — تحليل أخطاء البناء والتنفيذ + اقتراح إصلاحات تلقائية

// ── تصنيف نوع الخطأ ───────────────────────────────────────────────────────
const ERROR_CLASSIFIERS = [
  { type: 'typescript',  pattern: /error TS\d+:|\.tsx?\(\d+,\d+\):|type\s+'[^']+'\s+is\s+not\s+assignable/i },
  { type: 'import',      pattern: /cannot find module|module not found|import.*error|failed to resolve/i },
  { type: 'build',       pattern: /build failed|build error|rollup|vite.*error|webpack.*error/i },
  { type: 'lint',        pattern: /eslint|tslint|prettier|no-unused-vars|is defined but never/i },
  { type: 'runtime',     pattern: /referenceerror|typeerror|rangeerror|syntaxerror|is not a function/i },
  { type: 'dependency',  pattern: /npm error|yarn error|cannot find package|peer dep|unmet dep/i },
  { type: 'network',     pattern: /econnrefused|network error|failed to fetch|timeout|cors/i },
  { type: 'permission',  pattern: /eacces|permission denied|eperm|access denied/i },
  { type: 'port',        pattern: /eaddrinuse|address already in use|port.*in use/i },
  { type: 'memory',      pattern: /heap out of memory|javascript heap|out of memory/i },
]

// ── قاموس الإصلاحات حسب نوع الخطأ ───────────────────────────────────────
const FIX_STRATEGIES = {
  typescript: {
    label: '🔷 خطأ TypeScript',
    auto_fixable: true,
    fixes: [
      'إزالة أو استخدام المتغيرات غير المستخدمة (prefix _ للمتغيرات المتجاهلة)',
      'إضافة نوع البيانات الصحيح للمتغير',
      'استخدام `// @ts-ignore` للأسطر المشكلة إن لزم',
      'تحقق من tsconfig.json وأضف "strict": false مؤقتاً',
    ],
  },
  import: {
    label: '📦 خطأ استيراد',
    auto_fixable: true,
    fixes: [
      'تشغيل `npm install` لإعادة تثبيت الحزم',
      'التحقق من المسار الصحيح في import',
      'إضافة الحزمة المفقودة بـ `npm install <package>`',
      'التحقق من `package.json` أن الحزمة موجودة في dependencies',
    ],
  },
  build: {
    label: '🔨 خطأ بناء',
    auto_fixable: false,
    fixes: [
      'تشغيل `npm run build` لرؤية الخطأ كاملاً',
      'حذف مجلد `dist` وإعادة البناء',
      'تحقق من `vite.config.js` أو `next.config.js`',
      'مراجعة الـ logs كاملةً لتحديد الملف المشكل',
    ],
  },
  lint: {
    label: '🧹 خطأ Lint',
    auto_fixable: true,
    fixes: [
      'تشغيل `npm run lint --fix` لإصلاح تلقائي',
      'إضافة `/* eslint-disable */` في بداية الملف مؤقتاً',
      'تعديل `.eslintrc` لتخفيف القاعدة المخالَفة',
      'استخدام `_` كـ prefix للمتغيرات غير المستخدمة',
    ],
  },
  runtime: {
    label: '⚠️ خطأ وقت التنفيذ',
    auto_fixable: false,
    fixes: [
      'تحقق من أن المتغير معرّف قبل استخدامه',
      'أضف optional chaining: `obj?.property`',
      'أضف nullish coalescing: `value ?? defaultValue`',
      'استخدم try/catch لالتقاط الأخطاء',
    ],
  },
  dependency: {
    label: '📦 مشكلة تبعيات',
    auto_fixable: true,
    fixes: [
      'حذف `node_modules` و `package-lock.json` ثم `npm install`',
      'تشغيل `npm audit fix`',
      'تحديث الحزم بـ `npm update`',
      'التحقق من توافق إصدار Node.js مع الحزم',
    ],
  },
  network: {
    label: '🌐 خطأ شبكة',
    auto_fixable: false,
    fixes: [
      'تحقق من CORS headers على الـ server',
      'تأكد أن السيرفر يعمل على المنفذ الصحيح',
      'تحقق من المتغيرات البيئية (API URLs)',
      'استخدم HTTPS بدل HTTP في الإنتاج',
    ],
  },
  port: {
    label: '🔌 المنفذ مشغول',
    auto_fixable: true,
    fixes: [
      'تغيير المنفذ في الكود أو ملف .env',
      'إيقاف العملية التي تشغل المنفذ: `lsof -i :PORT && kill -9 PID`',
      'استخدام منفذ آخر في vite.config أو server.js',
    ],
  },
  memory: {
    label: '💾 نفاد الذاكرة',
    auto_fixable: false,
    fixes: [
      'زيادة ذاكرة Node.js: `NODE_OPTIONS="--max-old-space-size=4096" npm run build`',
      'تقسيم الـ bundle في vite.config.js بـ `build.rollupOptions.output.manualChunks`',
      'تحليل الـ bundle size بـ `vite-bundle-visualizer`',
    ],
  },
}

// ── تحليل نص الخطأ ────────────────────────────────────────────────────────
export function analyzeError(errorText) {
  if (!errorText) return { type: 'unknown', label: '❓ خطأ غير معروف', fixes: [], auto_fixable: false }

  for (const { type, pattern } of ERROR_CLASSIFIERS) {
    if (pattern.test(errorText)) {
      const strategy = FIX_STRATEGIES[type] || {}
      return {
        type,
        label: strategy.label || type,
        auto_fixable: strategy.auto_fixable || false,
        fixes: strategy.fixes || [],
        rawError: errorText.slice(0, 500),
      }
    }
  }

  return {
    type: 'unknown',
    label: '❓ خطأ غير محدد',
    auto_fixable: false,
    fixes: ['شارك نص الخطأ الكامل لتحليل أدق', 'ابحث في Stack Overflow أو GitHub Issues'],
    rawError: errorText.slice(0, 500),
  }
}

// ── استخراج معلومات الخطأ (ملف + سطر) ───────────────────────────────────
export function extractErrorLocation(errorText) {
  const locations = []

  // TypeScript: file(line,col)
  const tsMatch = [...(errorText.matchAll(/([^\s]+\.tsx?)\((\d+),(\d+)\)/g))]
  for (const m of tsMatch) locations.push({ file: m[1], line: parseInt(m[2]), col: parseInt(m[3]) })

  // ESLint / Vite: file:line:col
  const generalMatch = [...(errorText.matchAll(/([^\s]+\.[a-z]{2,5}):(\d+):(\d+)/g))]
  for (const m of generalMatch) locations.push({ file: m[1], line: parseInt(m[2]), col: parseInt(m[3]) })

  return [...new Map(locations.map(l => [`${l.file}:${l.line}`, l])).values()].slice(0, 10)
}

// ── اقتراح إصلاح TypeScript تلقائياً ─────────────────────────────────────
export function suggestTypeScriptFix(errorCode, errorText) {
  const fixes = {
    'TS6133': { // declared but never read
      fix: 'أضف _ قبل اسم المتغير: `const [_varName, setter] = ...`',
      auto: true,
    },
    'TS2307': { // Cannot find module
      fix: 'تثبيت الحزمة المفقودة أو إصلاح مسار الـ import',
      auto: false,
    },
    'TS2345': { // Type not assignable
      fix: 'تصحيح نوع البيانات أو استخدام `as Type` للـ casting',
      auto: false,
    },
    'TS2304': { // Cannot find name
      fix: 'إضافة import للاسم المفقود أو تعريفه',
      auto: false,
    },
    'TS7006': { // Parameter implicitly has 'any' type
      fix: 'إضافة نوع البيانات للمعامل: `(param: string) => ...`',
      auto: false,
    },
    'TS2322': { // Type X not assignable to type Y
      fix: 'مطابقة نوع البيانات أو تعديل الـ interface',
      auto: false,
    },
  }

  const codeMatch = errorText.match(/error (TS\d+):/)
  const code = codeMatch?.[1] || errorCode
  return fixes[code] || { fix: 'راجع وثائق TypeScript للكود ' + code, auto: false }
}

// ── بناء تقرير إصلاح كامل ─────────────────────────────────────────────────
export function buildDebugReport(errorText, repoStack = []) {
  const analysis = analyzeError(errorText)
  const locations = extractErrorLocation(errorText)

  const report = {
    errorType: analysis.type,
    label: analysis.label,
    autoFixable: analysis.auto_fixable,
    locations,
    fixes: analysis.fixes,
    rawError: analysis.rawError,
  }

  // إضافة إصلاحات خاصة بالـ Stack
  if (repoStack.includes('TypeScript') || repoStack.includes('React')) {
    const tsCode = errorText.match(/error (TS\d+):/)?.[1]
    if (tsCode) {
      const tsFix = suggestTypeScriptFix(tsCode, errorText)
      report.specificFix = tsFix
    }
  }

  return report
}
