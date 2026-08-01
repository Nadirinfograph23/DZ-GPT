// ── Capacitor Generator — تحويل HTML/Web إلى أندرويد ─────────────────────
// المرجع: https://github.com/ionic-team/capacitor

export function generateCapacitorProject({ appName = 'DZ App', packageName = '', htmlContent = '', themeColor = '#1a73e8', siteUrl = '' }) {
  const pkg = _sanitizePkg(packageName || `com.dzapp.${_safeName(appName)}`)
  const label = appName.replace(/['"<>&]/g, '').trim().slice(0, 50) || 'DZ App'
  const repoSlug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const hexColor = themeColor.startsWith('#') ? themeColor.slice(1) : themeColor

  const files = []

  // ── capacitor.config.json ──────────────────────────────────────────────────
  files.push({
    path: 'capacitor.config.json',
    content: JSON.stringify({
      appId: pkg,
      appName: label,
      webDir: 'www',
      server: siteUrl ? { url: siteUrl, cleartext: true } : undefined,
      plugins: {
        SplashScreen: {
          launchShowDuration: 2000,
          backgroundColor: `#${hexColor}`,
          showSpinner: false,
        },
        StatusBar: { style: 'DARK', backgroundColor: `#${hexColor}` },
      },
    }, null, 2),
  })

  // ── package.json ──────────────────────────────────────────────────────────
  files.push({
    path: 'package.json',
    content: JSON.stringify({
      name: repoSlug,
      version: '1.0.0',
      description: `${label} — Android app built by DZ Agent`,
      scripts: {
        build: 'echo "web assets ready"',
        'cap:sync': 'npx cap sync android',
        'cap:open': 'npx cap open android',
      },
      dependencies: {
        '@capacitor/core': '^6.0.0',
        '@capacitor/android': '^6.0.0',
        '@capacitor/splash-screen': '^6.0.0',
        '@capacitor/status-bar': '^6.0.0',
      },
      devDependencies: {
        '@capacitor/cli': '^6.0.0',
      },
    }, null, 2),
  })

  // ── www/index.html — محتوى الويب ──────────────────────────────────────────
  if (!siteUrl) {
    files.push({
      path: 'www/index.html',
      content: htmlContent || `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:">
<title>${label}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    background: linear-gradient(135deg, #${hexColor} 0%, #1a1a2e 100%);
    min-height: 100vh; display: flex; align-items: center;
    justify-content: center; color: #fff; text-align: center; padding: 20px;
  }
  .card { background: rgba(255,255,255,0.1); backdrop-filter: blur(10px);
    border-radius: 24px; padding: 40px 32px; max-width: 400px; width: 100%; }
  .icon { font-size: 64px; margin-bottom: 20px; }
  h1 { font-size: 2rem; font-weight: 700; margin-bottom: 12px; }
  p { opacity: 0.85; font-size: 1rem; line-height: 1.6; }
  .badge { display: inline-block; margin-top: 24px; background: rgba(255,255,255,0.2);
    padding: 6px 16px; border-radius: 20px; font-size: 0.8rem; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">📱</div>
    <h1>${label}</h1>
    <p>تطبيق أندرويد مُنشأ بواسطة DZ Agent</p>
    <div class="badge">⚡ Ionic Capacitor</div>
  </div>
  <script src="cordova.js"></script>
</body>
</html>`,
    })
  }

  // ── android/app/build.gradle ──────────────────────────────────────────────
  files.push({
    path: 'android/app/build.gradle',
    content: `apply plugin: 'com.android.application'

android {
    namespace '${pkg}'
    compileSdkVersion 34
    defaultConfig {
        applicationId '${pkg}'
        minSdkVersion 22
        targetSdkVersion 34
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation 'androidx.appcompat:appcompat:1.7.0'
    implementation 'androidx.coordinatorlayout:coordinatorlayout:1.2.0'
    implementation 'com.capacitorjs:core:6.0.0'
    implementation 'com.capacitorjs:splash-screen:6.0.0'
    implementation 'com.capacitorjs:status-bar:6.0.0'
}`,
  })

  // ── android/build.gradle ──────────────────────────────────────────────────
  files.push({
    path: 'android/build.gradle',
    content: `buildscript {
    repositories { google(); mavenCentral() }
    dependencies { classpath 'com.android.tools.build:gradle:8.3.2' }
}
allprojects {
    repositories { google(); mavenCentral() }
}
task clean(type: Delete) { delete rootProject.buildDir }`,
  })

  // ── android/settings.gradle ───────────────────────────────────────────────
  files.push({
    path: 'android/settings.gradle',
    content: `include ':app'\nrootProject.name = "${label}"`,
  })

  // ── android/gradle.properties ─────────────────────────────────────────────
  files.push({
    path: 'android/gradle.properties',
    content: `org.gradle.jvmargs=-Xmx2048m\nandroid.useAndroidX=true\nandroid.enableJetifier=true`,
  })

  // ── android/gradle/wrapper ────────────────────────────────────────────────
  files.push({
    path: 'android/gradle/wrapper/gradle-wrapper.properties',
    content: `distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists`,
  })

  // ── AndroidManifest.xml ───────────────────────────────────────────────────
  files.push({
    path: 'android/app/src/main/AndroidManifest.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE"/>

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:exported="true"
            android:launchMode="singleTask"
            android:name="${pkg}.MainActivity">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
    </application>
</manifest>`,
  })

  // ── MainActivity.java — Capacitor ─────────────────────────────────────────
  const pkgPath = pkg.replace(/\./g, '/')
  files.push({
    path: `android/app/src/main/java/${pkgPath}/MainActivity.java`,
    content: `package ${pkg};

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }
}`,
  })

  // ── res/values/strings.xml ────────────────────────────────────────────────
  files.push({
    path: 'android/app/src/main/res/values/strings.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${label}</string>\n    <string name="title_activity_main">${label}</string>\n    <string name="package_name">${pkg}</string>\n    <string name="custom_url_scheme">${pkg}</string>\n</resources>`,
  })

  // ── res/values/styles.xml ─────────────────────────────────────────────────
  files.push({
    path: 'android/app/src/main/res/values/styles.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="colorPrimary">#${hexColor}</item>
        <item name="colorPrimaryDark">#${_darken(hexColor)}</item>
        <item name="colorAccent">#FFC107</item>
        <item name="android:statusBarColor">#${_darken(hexColor)}</item>
    </style>
</resources>`,
  })

  // ── proguard-rules.pro ────────────────────────────────────────────────────
  files.push({ path: 'android/app/proguard-rules.pro', content: '# Capacitor ProGuard\n-keep class com.getcapacitor.** { *; }\n' })

  // ── GitHub Actions ────────────────────────────────────────────────────────
  files.push({
    path: '.github/workflows/build-apk.yml',
    content: `name: 📱 Build Capacitor APK

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install --legacy-peer-deps

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - uses: android-actions/setup-android@v3
        with:
          packages: >-
            platform-tools
            platforms;android-34
            build-tools;34.0.0

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.7'

      - name: Build APK
        run: |
          cd android
          gradle assembleDebug --no-daemon --stacktrace

      - uses: actions/upload-artifact@v4
        with:
          name: ${repoSlug}-capacitor-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30

      - uses: softprops/action-gh-release@v2
        with:
          tag_name: v\${{ github.run_number }}
          name: "📱 ${label} v\${{ github.run_number }} (Capacitor)"
          body: |
            ## ⬇️ تحميل التطبيق
            انقر على \`app-debug.apk\` للتحميل المباشر.

            > ⚡ **Ionic Capacitor** — تطبيق ويب أصلي
            > 🤖 بُني بواسطة **DZ Agent**
          files: android/app/build/outputs/apk/debug/app-debug.apk
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`,
  })

  // ── README.md ─────────────────────────────────────────────────────────────
  files.push({
    path: 'README.md',
    content: `# 📱 ${label} (Ionic Capacitor)

> تطبيق أندرويد بـ **Ionic Capacitor** — بُني بواسطة **[DZ Agent](https://dz-gpt.vercel.app)** 🤖
${siteUrl ? `\n> 🌐 يحمّل الموقع: ${siteUrl}\n` : ''}
## ⬇️ تحميل APK
اذهب إلى **[Releases](../../releases)** وحمّل آخر إصدار.

## 🔧 البناء محلياً
\`\`\`bash
npm install
cd android && ./gradlew assembleDebug
\`\`\`

## 📚 مراجع
${GITHUB_TEMPLATES_REF.capacitor}
`,
  })

  return files
}

const GITHUB_TEMPLATES_REF = {
  capacitor: `- [ionic-team/capacitor](https://github.com/ionic-team/capacitor)\n- [robingenz/capacitor-app-template](https://github.com/robingenz/capacitor-app-template)`,
}

function _sanitizePkg(pkg) {
  return pkg.replace(/[^a-z0-9.]/gi, '').toLowerCase().replace(/^\.+|\.+$/g, '').replace(/\.{2,}/g, '.') || 'com.dzapp.app'
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
  } catch { return '1a56c0' }
}
