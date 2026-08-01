// Android Builder — DZ Agent
// يدعم: WebView · Capacitor · React Native · Flutter · Kotlin Native
// المراجع: android/architecture-samples · ionic-team/capacitor · flutter/flutter · react-native-community

import { detectAppType, getTemplateInfo, APP_TYPES } from './templates.js'
import { generateCapacitorProject }  from './gen-capacitor.js'
import { generateFlutterProject }    from './gen-flutter.js'
import { generateKotlinProject }     from './gen-kotlin.js'
import { generateReactNativeProject } from './gen-react-native.js'

// ── إعادة تصدير للـ backward compatibility ────────────────────────────────
export { detectAppType, getTemplateInfo, APP_TYPES }

// ── استخراج URL من البرومبت ──────────────────────────────────────────────────
export function extractSiteUrl(msg) {
  if (!msg) return null
  const m = msg.match(/https?:\/\/[^\s\u0600-\u06FF"'،,؟?!]+/i)
  if (m) return m[0].replace(/[.,;:!?]+$/, '')
  return null
}

// ── كشف طلب بناء أندرويد (موسّع ليشمل Flutter/RN/Kotlin) ─────────────────
export function detectAndroidBuildQuery(msg) {
  if (!msg || typeof msg !== 'string') return false
  const m = msg.toLowerCase()

  const kw = [
    // عربي عام
    'تطبيق أندرويد', 'تطبيق اندرويد', 'تطبيق android',
    'apk', 'ملف apk', 'تنزيل تطبيق', 'حمل تطبيق',
    'تطبيق جوال', 'تطبيق موبايل', 'تطبيق للهاتف', 'تطبيق للموبايل',
    'اصنع تطبيق', 'أنشئ تطبيق', 'انشئ تطبيق', 'ابني تطبيق',
    'اعمل تطبيق', 'دير تطبيق', 'صمم تطبيق', 'بني تطبيق',
    'صنعلي تطبيق', 'دير لي تطبيق', 'اصنعلي تطبيق', 'دير ليا تطبيق',
    'ابنيلي تطبيق', 'انشئلي تطبيق', 'أنشئلي تطبيق', 'اعمللي تطبيق',
    'app android', 'تطبيق mobile',
    // Flutter
    'تطبيق flutter', 'تطبيق فلاتر', 'flutter app', 'build flutter',
    'مشروع flutter', 'مشروع فلاتر',
    // React Native
    'react native', 'react-native', 'تطبيق react', 'تطبيق ريأكت',
    'expo app', 'تطبيق expo',
    // Kotlin
    'تطبيق kotlin', 'تطبيق كوتلن', 'kotlin app', 'native android app',
    'تطبيق أصلي', 'jetpack compose',
    // Capacitor
    'ionic app', 'capacitor app', 'تحويل موقع', 'تحويل الموقع',
    // English
    'build android', 'create android app', 'android app', 'android application',
    'generate apk', 'build apk', 'make apk', 'create apk',
    'mobile app', 'build mobile app', 'create mobile app',
  ]
  if (kw.some(k => m.includes(k))) return true

  const CONVERT_PATTERNS = [
    /(?:حوّل|حول|تحويل|حوّله|حوله|اعمل|اصنع|أنشئ|انشئ|ابني|دير)\s+(?:هذا\s+)?(?:الموقع|الرابط|الصفحة|site|url|link)\s+(?:إلى|الى|ل|لـ|تطبيق)/i,
    /(?:حوّل|حول|تحويل)\s+.{0,60}(?:تطبيق|app|apk)/i,
    /(?:موقع|site|url|رابط)\s+.{0,40}(?:تطبيق|app|apk)/i,
    /(?:تطبيق|app)\s+(?:من|من\s+)?(?:هذا\s+)?(?:الموقع|الرابط|site|url)/i,
    /(?:حول|convert|turn)\s+(?:this\s+)?(?:site|website|url|link)\s+(?:to|into)\s+(?:an?\s+)?(?:app|apk|android)/i,
    /https?:\/\/.+(?:تطبيق|app|apk|android)/i,
    /(?:تطبيق|app|apk|android).+https?:\/\//i,
  ]
  return CONVERT_PATTERNS.some(p => p.test(msg))
}

// ── توليد المشروع حسب النوع ───────────────────────────────────────────────
export function generateProjectByType({ appType, appName, packageName, htmlContent, themeColor, siteUrl, appDescription }) {
  const opts = { appName, packageName, htmlContent, themeColor: themeColor || '#1a73e8', siteUrl: siteUrl || '', appDescription: appDescription || '' }
  switch (appType) {
    case APP_TYPES.capacitor:    return generateCapacitorProject(opts)
    case APP_TYPES.flutter:      return generateFlutterProject(opts)
    case APP_TYPES.kotlin:       return generateKotlinProject(opts)
    case APP_TYPES.reactnative:  return generateReactNativeProject(opts)
    default:                     return generateAndroidProject(opts)   // webview
  }
}

export function generateAndroidProject({ appName = 'DZ App', packageName = '', htmlContent = '', themeColor = '#1a73e8', siteUrl = '' }) {
  const pkg = _sanitizePkg(packageName || `com.dzapp.${_safeName(appName)}`)
  const pkgPath = pkg.replace(/\./g, '/')
  const label = appName.replace(/['"<>&]/g, '').trim().slice(0, 50) || 'DZ App'
  const repoSlug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const hexColor = themeColor.startsWith('#') ? themeColor.slice(1) : themeColor
  const darkHex = _darken(hexColor)

  const files = []

  // ── Root build.gradle ──────────────────────────────────────────────────────
  files.push({
    path: 'android/build.gradle',
    content: `buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.3.2'
    }
}
allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
task clean(type: Delete) {
    delete rootProject.buildDir
}`,
  })

  // ── settings.gradle ────────────────────────────────────────────────────────
  files.push({
    path: 'android/settings.gradle',
    content: `rootProject.name = "${label}"\ninclude ':app'`,
  })

  // ── gradle.properties ──────────────────────────────────────────────────────
  files.push({
    path: 'android/gradle.properties',
    content: `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.enableJetifier=true`,
  })

  // ── gradle wrapper ─────────────────────────────────────────────────────────
  files.push({
    path: 'android/gradle/wrapper/gradle-wrapper.properties',
    content: `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists`,
  })

  // ── app/build.gradle ───────────────────────────────────────────────────────
  files.push({
    path: 'android/app/build.gradle',
    content: `plugins {
    id 'com.android.application'
}

android {
    namespace '${pkg}'
    compileSdk 34

    defaultConfig {
        applicationId '${pkg}'
        minSdk 21
        targetSdk 34
        versionCode 1
        versionName '1.0'
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.7.0'
    implementation 'androidx.webkit:webkit:1.11.0'
}`,
  })

  // ── proguard-rules.pro ─────────────────────────────────────────────────────
  files.push({ path: 'android/app/proguard-rules.pro', content: '# Default ProGuard rules\n' })

  // ── AndroidManifest.xml — SplashActivity هي نقطة الانطلاق ───────────────
  files.push({
    path: 'android/app/src/main/AndroidManifest.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true"
        android:allowBackup="true"
        android:supportsRtl="true">

        <!-- Splash Screen — نقطة الدخول الأولى -->
        <activity
            android:name=".SplashActivity"
            android:exported="true"
            android:theme="@style/SplashTheme"
            android:screenOrientation="portrait"
            android:noHistory="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>

        <!-- Main WebView Activity -->
        <activity
            android:name=".MainActivity"
            android:exported="false"
            android:screenOrientation="portrait"
            android:configChanges="orientation|screenSize|keyboardHidden"/>
    </application>
</manifest>`,
  })

  // ── MainActivity.java ─────────────────────────────────────────────────────
  files.push({
    path: `android/app/src/main/java/${pkgPath}/MainActivity.java`,
    content: `package ${pkg};

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        WebSettings ws = webView.getSettings();

        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setDatabaseEnabled(true);
        ws.setGeolocationEnabled(true);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.loadUrl(${siteUrl ? `"${siteUrl}"` : '"file:///android_asset/www/index.html"'});
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}`,
  })

  // ── SplashActivity.java ───────────────────────────────────────────────────
  const initials = _getInitials(label)
  files.push({
    path: `android/app/src/main/java/${pkgPath}/SplashActivity.java`,
    content: `package ${pkg};

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.appcompat.app.AppCompatActivity;

public class SplashActivity extends AppCompatActivity {
    private static final int SPLASH_DURATION_MS = 1800;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            startActivity(new Intent(SplashActivity.this, MainActivity.class));
        }, SPLASH_DURATION_MS);
    }
}`,
  })

  // ── layout/activity_splash.xml ────────────────────────────────────────────
  files.push({
    path: 'android/app/src/main/res/layout/activity_splash.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center"
    android:background="@color/colorPrimary"
    android:padding="32dp">

    <!-- دائرة الأيقونة مع الأحرف الأولى -->
    <FrameLayout
        android:layout_width="120dp"
        android:layout_height="120dp"
        android:background="@drawable/splash_icon_bg">

        <TextView
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:gravity="center"
            android:text="${initials}"
            android:textColor="#FFFFFF"
            android:textSize="48sp"
            android:textStyle="bold"
            android:fontFamily="sans-serif-medium"/>
    </FrameLayout>

    <!-- اسم التطبيق -->
    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="24dp"
        android:text="@string/app_name"
        android:textColor="#FFFFFF"
        android:textSize="28sp"
        android:textStyle="bold"
        android:gravity="center"
        android:fontFamily="sans-serif-medium"/>

    <!-- شعار DZ Agent -->
    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:layout_marginTop="8dp"
        android:text="بواسطة DZ Agent 🤖"
        android:textColor="#CCFFFFFF"
        android:textSize="13sp"
        android:gravity="center"/>

</LinearLayout>`,
  })

  // ── drawable/splash_icon_bg.xml — دائرة بيضاء شفافة ─────────────────────
  files.push({
    path: 'android/app/src/main/res/drawable/splash_icon_bg.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="oval">
    <solid android:color="#33FFFFFF"/>
    <stroke android:width="2dp" android:color="#66FFFFFF"/>
</shape>`,
  })

  // ── Adaptive Icon — foreground (دائرة بيضاء) ─────────────────────────────
  files.push({
    path: 'android/app/src/main/res/drawable/ic_launcher_foreground.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <!-- دائرة بيضاء مركزية -->
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M54,20 C74.435,20 91,36.565 91,57 C91,77.435 74.435,94 54,94 C33.565,94 17,77.435 17,57 C17,36.565 33.565,20 54,20 Z"/>
    <!-- الحرف الأول باللون الرئيسي -->
    <text
        android:x="54"
        android:y="75"
        android:textSize="52"
        android:fillColor="#${hexColor}"
        android:fontFamily="sans-serif-medium"
        android:textAlignment="center">${initials.charAt(0)}</text>
</vector>`,
  })

  // ── Adaptive Icon — background (لون الموضوع) ─────────────────────────────
  files.push({
    path: 'android/app/src/main/res/drawable/ic_launcher_background.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="@color/colorPrimary"/>
</shape>`,
  })

  // ── mipmap-anydpi-v26/ic_launcher.xml — Adaptive Icon manifest ───────────
  files.push({
    path: 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>`,
  })

  files.push({
    path: 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>`,
  })

  // ── layout/activity_main.xml ──────────────────────────────────────────────
  files.push({
    path: 'android/app/src/main/res/layout/activity_main.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical">

    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent"/>
</LinearLayout>`,
  })

  // ── values/strings.xml ────────────────────────────────────────────────────
  files.push({
    path: 'android/app/src/main/res/values/strings.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${label}</string>
</resources>`,
  })

  // ── values/colors.xml ─────────────────────────────────────────────────────
  files.push({
    path: 'android/app/src/main/res/values/colors.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#${hexColor}</color>
    <color name="colorPrimaryDark">#${darkHex}</color>
    <color name="colorAccent">#FFC107</color>
    <color name="white">#FFFFFF</color>
    <color name="splashBg">#${hexColor}</color>
    <color name="splashText">#FFFFFF</color>
</resources>`,
  })

  // ── values/styles.xml ─────────────────────────────────────────────────────
  files.push({
    path: 'android/app/src/main/res/values/styles.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Theme عام للتطبيق -->
    <style name="AppTheme" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>

    <!-- Theme شاشة الترحيب — خلفية ملونة، بدون شريط عنوان، ملء الشاشة -->
    <style name="SplashTheme" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="android:windowBackground">@color/splashBg</item>
        <item name="android:windowFullscreen">true</item>
        <item name="android:windowNoTitle">true</item>
        <item name="android:statusBarColor">@color/colorPrimaryDark</item>
    </style>
</resources>`,
  })

  // ── assets/www/index.html — يُضاف فقط في وضع HTML محلي (لا URL خارجي) ────
  if (!siteUrl) files.push({
    path: 'android/app/src/main/assets/www/index.html',
    content: htmlContent || `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${label}</title>
<style>
  body { font-family: Arial, sans-serif; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; margin: 0; background: #${hexColor}; color: #fff; }
  h1 { font-size: 2rem; text-align: center; }
</style>
</head>
<body><h1>🤖 ${label}</h1></body>
</html>`,
  })

  // ── GitHub Actions build-apk.yml ──────────────────────────────────────────
  files.push({
    path: '.github/workflows/build-apk.yml',
    content: `name: 📱 Build Android APK

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    name: Build & Release APK
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3
        with:
          packages: >-
            platform-tools
            platforms;android-34
            build-tools;34.0.0

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.7'

      - name: Build Debug APK
        run: |
          cd android
          gradle assembleDebug --no-daemon --stacktrace

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${repoSlug}-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v\${{ github.run_number }}
          name: "📱 ${label} v\${{ github.run_number }}"
          body: |
            ## ⬇️ تحميل التطبيق
            انقر على \`app-debug.apk\` في الأسفل للتحميل المباشر.

            > 🤖 بُني تلقائياً بواسطة **DZ Agent**
            > ⚠️ فعّل "مصادر غير معروفة" في إعدادات هاتفك قبل التثبيت.
          files: android/app/build/outputs/apk/debug/app-debug.apk
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`,
  })

  // ── README.md ─────────────────────────────────────────────────────────────
  files.push({
    path: 'README.md',
    content: `# 📱 ${label}

> تطبيق أندرويد مُنشأ بواسطة **[DZ Agent](https://dz-gpt.vercel.app)** 🤖

## ⬇️ تحميل APK
اذهب إلى **[Releases](../../releases)** وحمّل آخر إصدار مباشرةً.

## 🔧 البناء محلياً
\`\`\`bash
cd android
gradle assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
\`\`\`

## 📋 المتطلبات
- JDK 17+
- Android SDK 34
- Gradle 8.7
`,
  })

  return files
}

function _getInitials(name) {
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim()
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'DZ'
  if (words.length === 1) {
    const w = words[0]
    return (w.slice(0, 2)).toUpperCase()
  }
  return (words[0][0] + words[1][0]).toUpperCase()
}

function _sanitizePkg(pkg) {
  return pkg
    .replace(/[^a-z0-9.]/gi, '')
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.') || 'com.dzapp.app'
}

function _safeName(name) {
  return name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '').slice(0, 20) || 'app'
}

function _darken(hex) {
  try {
    const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 40).toString(16).padStart(2, '0')
    const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 40).toString(16).padStart(2, '0')
    const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 40).toString(16).padStart(2, '0')
    return r + g + b
  } catch {
    return '1a56c0'
  }
}
