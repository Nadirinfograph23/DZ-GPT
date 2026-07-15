// ── Android Builder — Template Definitions ────────────────────────────────
// كل قالب يعرّف: الاسم، المصادر على GitHub، ملفات المشروع، وworkflow البناء

export const APP_TYPES = {
  webview:      'webview',       // WebView بسيط — تحميل URL أو HTML محلي
  capacitor:    'capacitor',     // Ionic Capacitor — أفضل لتحويل مواقع الويب
  reactnative:  'reactnative',   // React Native — تطبيقات متقدمة
  flutter:      'flutter',       // Flutter — واجهات جميلة
  kotlin:       'kotlin',        // Kotlin Native — تطبيقات أندرويد خالصة
}

// ── الكلمات المفتاحية لكشف نوع التطبيق ──────────────────────────────────
export const TYPE_KEYWORDS = {
  flutter: [
    'flutter', 'فلاتر', 'dart', 'دارت',
    'تطبيق فلاتر', 'واجهة flutter', 'material design',
    'flutter app', 'مشروع flutter', 'مشروع فلاتر',
  ],
  reactnative: [
    'react native', 'react-native', 'reactnative', 'ريأكت نيتف', 'ريأكت',
    'expo', 'إكسبو', 'javascript mobile', 'js mobile',
    'تطبيق react', 'تطبيق ريأكت', 'تطبيق expo',
  ],
  capacitor: [
    'capacitor', 'ionic', 'إيونيك', 'pwa', 'progressive web',
    'تحويل موقع', 'حوّل موقع', 'حول موقع', 'convert site', 'convert website',
    'turn site', 'turn website', 'موقع إلى تطبيق', 'موقع الى تطبيق',
    'site to app', 'website to app', 'web to apk',
    'حوّله لتطبيق', 'حوله لتطبيق', 'من موقع', 'الموقع إلى تطبيق',
  ],
  kotlin: [
    'kotlin', 'كوتلن', 'native android', 'أندرويد خالص', 'تطبيق أصلي',
    'java android', 'jetpack', 'compose', 'coroutines',
    'تطبيق محلي', 'native app', 'jetpack compose', 'kotlin app',
  ],
}

// ── المستودعات المرجعية على GitHub (مُحدَّثة بأفضل repos 2025) ──────────
export const GITHUB_TEMPLATES = {
  webview: {
    label: 'WebView Android',
    label_ar: 'WebView أندرويد',
    icon: '🌐',
    refs: [
      'https://github.com/bapspatil/WebViewApp',
      'https://github.com/KwabenBerko/Android-WebView',
      'https://github.com/delight-im/Android-AdvancedWebView',
      'https://github.com/googlesamples/android-webview',
    ],
    build_time: '5-8 دقائق',
    description_ar: 'يحمّل الموقع مباشرةً داخل WebView — أسرع طريقة لتحويل موقع إلى تطبيق',
  },
  capacitor: {
    label: 'Ionic Capacitor',
    label_ar: 'Ionic Capacitor (ويب → أندرويد)',
    icon: '⚡',
    refs: [
      'https://github.com/ionic-team/capacitor',
      'https://github.com/ionic-team/capacitor-plugins',
      'https://github.com/robingenz/capacitor-app-template',
      'https://github.com/ionic-team/ionic-framework',
      'https://github.com/capacitor-community/camera-preview',
    ],
    build_time: '8-12 دقيقة',
    description_ar: 'يحوّل أي موقع HTML/CSS/JS إلى تطبيق أندرويد أصيل مع الوصول لميزات الهاتف',
  },
  reactnative: {
    label: 'React Native',
    label_ar: 'React Native',
    icon: '⚛️',
    refs: [
      'https://github.com/react-native-community/rn-new-architecture-app',
      'https://github.com/infinitered/ignite',
      'https://github.com/microsoft/react-native-macos',
      'https://github.com/facebook/react-native',
      'https://github.com/callstack/react-native-paper',
      'https://github.com/software-mansion/react-native-screens',
    ],
    build_time: '10-15 دقيقة',
    description_ar: 'تطبيقات أندرويد بـ JavaScript/TypeScript مع أداء يقارب التطبيقات الأصلية',
  },
  flutter: {
    label: 'Flutter',
    label_ar: 'Flutter (Dart)',
    icon: '🦋',
    refs: [
      'https://github.com/flutter/flutter',
      'https://github.com/mitesh77/Best-Flutter-UI-Templates',
      'https://github.com/imaNNeoFighT/fl_chart',
      'https://github.com/jonataslaw/getx',
      'https://github.com/bdlukaa/fluent_ui',
      'https://github.com/rrousselGit/riverpod',
      'https://github.com/flutterchina/dio',
    ],
    build_time: '12-18 دقيقة',
    description_ar: 'واجهات جميلة بـ Dart — أداء ممتاز وتصميم Material Design 3',
  },
  kotlin: {
    label: 'Kotlin Native',
    label_ar: 'Kotlin (أندرويد أصلي)',
    icon: '🟣',
    refs: [
      'https://github.com/android/architecture-samples',
      'https://github.com/skydoves/android-developer-roadmap',
      'https://github.com/philipplackner/ktor-client-android',
      'https://github.com/PatilShreyas/Foodium',
      'https://github.com/android/compose-samples',
      'https://github.com/android/nowinandroid',
      'https://github.com/google/accompanist',
    ],
    build_time: '8-12 دقيقة',
    description_ar: 'تطبيق أندرويد أصلي بـ Kotlin مع Jetpack Compose و MVVM Architecture',
  },
}

// ── كشف نوع التطبيق ───────────────────────────────────────────────────────
export function detectAppType(msg) {
  if (!msg || typeof msg !== 'string') return APP_TYPES.webview
  const m = msg.toLowerCase()

  // إذا وجد URL → تحويل موقع → Capacitor أو WebView
  const hasUrl = /https?:\/\/\S+/.test(msg)

  // فحص بالترتيب من الأكثر تخصصاً للأقل
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some(k => m.includes(k))) return type
  }

  // وجود رابط بدون كلمة flutter/RN → capacitor
  if (hasUrl) return APP_TYPES.capacitor

  // افتراضي
  return APP_TYPES.webview
}

// ── الحصول على معلومات القالب ─────────────────────────────────────────────
export function getTemplateInfo(appType) {
  return GITHUB_TEMPLATES[appType] || GITHUB_TEMPLATES.webview
}
