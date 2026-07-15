// ── React Native Generator — تطبيق React Native كامل ─────────────────────
// المراجع:
//   https://github.com/react-native-community/rn-new-architecture-app
//   https://github.com/infinitered/ignite
//   https://github.com/microsoft/react-native-template-typescript

export function generateReactNativeProject({ appName = 'DZ App', packageName = '', themeColor = '#1a73e8', appDescription = '' }) {
  const pkg = _sanitizePkg(packageName || `com.dzapp.${_safeName(appName)}`)
  const label = appName.replace(/['"<>&]/g, '').trim().slice(0, 50) || 'DZ App'
  const repoSlug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const appSlug = _safeName(label)
  const hexColor = themeColor.startsWith('#') ? themeColor.slice(1) : themeColor
  const desc = appDescription || `تطبيق ${label} مُنشأ بواسطة DZ Agent`

  const files = []

  // ── package.json ──────────────────────────────────────────────────────────
  files.push({
    path: 'package.json',
    content: JSON.stringify({
      name: appSlug,
      version: '0.0.1',
      private: true,
      scripts: {
        android: 'react-native run-android',
        ios: 'react-native run-ios',
        start: 'react-native start',
        'build:android': 'cd android && ./gradlew assembleRelease',
        'build:debug': 'cd android && ./gradlew assembleDebug',
      },
      dependencies: {
        'react': '18.3.1',
        'react-native': '0.75.3',
        '@react-navigation/native': '^6.1.18',
        '@react-navigation/bottom-tabs': '^6.6.1',
        '@react-navigation/native-stack': '^6.11.0',
        'react-native-screens': '^3.34.0',
        'react-native-safe-area-context': '^4.11.0',
        'react-native-vector-icons': '^10.2.0',
        '@react-native-async-storage/async-storage': '^2.0.0',
        'react-native-linear-gradient': '^2.8.3',
      },
      devDependencies: {
        '@babel/core': '^7.25.2',
        '@babel/preset-env': '^7.25.3',
        '@babel/runtime': '^7.25.0',
        '@react-native-community/cli': '15.0.1',
        '@react-native-community/cli-platform-android': '15.0.1',
        '@react-native/babel-preset': '0.75.3',
        '@react-native/eslint-config': '0.75.3',
        '@react-native/gradle-plugin': '0.75.3',
        '@react-native/metro-config': '0.75.3',
        '@react-native/typescript-config': '0.75.3',
        '@types/react': '^18.3.5',
        '@types/react-native': '^0.73.0',
        'typescript': '5.0.4',
      },
    }, null, 2),
  })

  // ── tsconfig.json ──────────────────────────────────────────────────────────
  files.push({
    path: 'tsconfig.json',
    content: JSON.stringify({ extends: '@react-native/typescript-config/tsconfig.json' }, null, 2),
  })

  // ── babel.config.js ───────────────────────────────────────────────────────
  files.push({
    path: 'babel.config.js',
    content: `module.exports = { presets: ['module:@react-native/babel-preset'] };\n`,
  })

  // ── metro.config.js ───────────────────────────────────────────────────────
  files.push({
    path: 'metro.config.js',
    content: `const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');\nconst config = {};\nmodule.exports = mergeConfig(getDefaultConfig(__dirname), config);\n`,
  })

  // ── index.js ──────────────────────────────────────────────────────────────
  files.push({
    path: 'index.js',
    content: `import {AppRegistry} from 'react-native';\nimport App from './src/App';\nimport {name as appName} from './app.json';\nAppRegistry.registerComponent(appName, () => App);\n`,
  })

  // ── app.json ──────────────────────────────────────────────────────────────
  files.push({
    path: 'app.json',
    content: JSON.stringify({ name: appSlug, displayName: label }, null, 2),
  })

  // ── src/App.tsx ───────────────────────────────────────────────────────────
  files.push({
    path: 'src/App.tsx',
    content: `import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  I18nManager,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// تفعيل RTL للعربية
I18nManager.allowRTL(true);

const PRIMARY = '#${hexColor}';

function FeatureCard({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <View style={styles.featureCard}>
      <Text style={styles.featureEmoji}>{emoji}</Text>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureDesc}>{desc}</Text>
    </View>
  );
}

export default function App() {
  const [count, setCount] = React.useState(0);

  return (
    <SafeAreaProvider>
      <StatusBar backgroundColor={PRIMARY} barStyle="light-content" />
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>${label}</Text>
            <Text style={styles.headerSub}>${desc}</Text>
          </View>

          {/* Counter Card */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>عداد تفاعلي</Text>
            <Text style={styles.counterValue}>{count}</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={[styles.counterBtn, styles.counterBtnDec]}
                onPress={() => setCount(c => Math.max(0, c - 1))}>
                <Text style={styles.counterBtnText}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.counterBtn, styles.counterBtnInc]}
                onPress={() => setCount(c => c + 1)}>
                <Text style={styles.counterBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Features */}
          <Text style={styles.sectionTitle}>مميزات التطبيق</Text>
          <View style={styles.featuresGrid}>
            <FeatureCard emoji="⚛️" title="React Native" desc="أداء أصلي" />
            <FeatureCard emoji="🎨" title="تصميم حديث" desc="Material UI" />
            <FeatureCard emoji="🌙" title="وضع ليلي" desc="دعم كامل" />
            <FeatureCard emoji="🚀" title="سريع" desc="60fps ثابت" />
          </View>

          {/* Footer */}
          <Text style={styles.footer}>🤖 بُني بواسطة DZ Agent</Text>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f1a' },
  scroll: { padding: 20, paddingBottom: 40 },
  header: {
    backgroundColor: PRIMARY,
    borderRadius: 20,
    padding: 28,
    marginBottom: 20,
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 6, textAlign: 'center' },
  card: {
    backgroundColor: '#1c1c2e',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardLabel: { color: '#888', fontSize: 13, marginBottom: 8 },
  counterValue: { color: '#fff', fontSize: 52, fontWeight: '800', marginBottom: 16 },
  counterRow: { flexDirection: 'row', gap: 16 },
  counterBtn: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  counterBtnDec: { backgroundColor: '#2d2d3d', borderWidth: 1, borderColor: '#444' },
  counterBtnInc: { backgroundColor: PRIMARY },
  counterBtnText: { color: '#fff', fontSize: 28, fontWeight: '700', lineHeight: 32 },
  sectionTitle: {
    color: '#ccc', fontSize: 16, fontWeight: '700',
    marginBottom: 12, textAlign: 'right',
  },
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  featureCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: '#1c1c2e',
    borderRadius: 14, padding: 16,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  featureEmoji: { fontSize: 28, marginBottom: 8 },
  featureTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 4 },
  featureDesc: { color: '#888', fontSize: 12, textAlign: 'center' },
  footer: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 8 },
});
`,
  })

  // ── android/build.gradle ──────────────────────────────────────────────────
  files.push({
    path: 'android/build.gradle',
    content: `buildscript {
    ext {
        buildToolsVersion = "35.0.0"
        minSdkVersion = 24
        compileSdkVersion = 35
        targetSdkVersion = 35
        ndkVersion = "26.1.10909125"
        kotlinVersion = "1.9.25"
    }
    repositories { google(); mavenCentral() }
    dependencies {
        classpath("com.android.tools.build:gradle")
        classpath("com.facebook.react:react-native-gradle-plugin")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin")
    }
}

apply plugin: "com.facebook.react.rootproject"`,
  })

  // ── android/settings.gradle ───────────────────────────────────────────────
  files.push({
    path: 'android/settings.gradle',
    content: `pluginManagement { includeBuild("../node_modules/@react-native/gradle-plugin") }
plugins { id("com.facebook.react.settings") }
extensions.configure(com.facebook.react.ReactSettingsExtension) { ex -> ex.autolinkLibrariesFromCommand() }
rootProject.name = '${label}'
include ':app'
includeBuild('../node_modules/@react-native/gradle-plugin')`,
  })

  // ── android/gradle.properties ─────────────────────────────────────────────
  files.push({
    path: 'android/gradle.properties',
    content: `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m
android.useAndroidX=true
android.enableJetifier=true
MYAPP_UPLOAD_STORE_FILE=debug.keystore
MYAPP_UPLOAD_KEY_ALIAS=androiddebugkey
MYAPP_UPLOAD_STORE_PASSWORD=android
MYAPP_UPLOAD_KEY_PASSWORD=android
newArchEnabled=true
hermesEnabled=true`,
  })

  // ── android/gradle/wrapper/gradle-wrapper.properties ──────────────────────
  files.push({
    path: 'android/gradle/wrapper/gradle-wrapper.properties',
    content: `distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.10.2-bin.zip\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists`,
  })

  // ── android/app/build.gradle ──────────────────────────────────────────────
  files.push({
    path: 'android/app/build.gradle',
    content: `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

react {
    /* JS bundler settings if needed */
}

android {
    ndkVersion rootProject.ext.ndkVersion
    buildToolsVersion rootProject.ext.buildToolsVersion
    compileSdk rootProject.ext.compileSdkVersion

    namespace "${pkg}"
    defaultConfig {
        applicationId "${pkg}"
        minSdk rootProject.ext.minSdkVersion
        targetSdk rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
    }

    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }

    buildTypes {
        debug { signingConfig signingConfigs.debug }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
        }
    }
}

dependencies {
    implementation("com.facebook.react:react-android")
    implementation("com.facebook.react:hermes-android")
}

apply from: file("../../node_modules/@react-native-community/cli-platform-android/native_modules.gradle")
applyNativeModulesAppBuildGradle(project)`,
  })

  // ── android/app/src/main/AndroidManifest.xml ──────────────────────────────
  files.push({
    path: 'android/app/src/main/AndroidManifest.xml',
    content: `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
    <application
      android:name=".MainApplication"
      android:label="@string/app_name"
      android:icon="@mipmap/ic_launcher"
      android:roundIcon="@mipmap/ic_launcher_round"
      android:allowBackup="false"
      android:theme="@style/AppTheme"
      android:usesCleartextTraffic="true">
      <activity
        android:name=".MainActivity"
        android:label="@string/app_name"
        android:configChanges="keyboard|keyboardHidden|orientation|screenLayout|screenSize|smallestScreenSize|uiMode"
        android:launchMode="singleTask"
        android:windowSoftInputMode="adjustResize"
        android:exported="true">
        <intent-filter>
          <action android:name="android.intent.action.MAIN"/>
          <category android:name="android.intent.category.LAUNCHER"/>
        </intent-filter>
      </activity>
    </application>
</manifest>`,
  })

  // ── MainActivity.kt ───────────────────────────────────────────────────────
  const pkgPath = pkg.replace(/\./g, '/')
  files.push({
    path: `android/app/src/main/java/${pkgPath}/MainActivity.kt`,
    content: `package ${pkg}

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  override fun getMainComponentName(): String = "${appSlug}"
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
`,
  })

  // ── MainApplication.kt ────────────────────────────────────────────────────
  files.push({
    path: `android/app/src/main/java/${pkgPath}/MainApplication.kt`,
    content: `package ${pkg}

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {
  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> = PackageList(this).packages
        override fun getJSMainModuleName(): String = "index"
        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, false)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) load()
  }
}
`,
  })

  // ── res/values/strings.xml ────────────────────────────────────────────────
  files.push({
    path: 'android/app/src/main/res/values/strings.xml',
    content: `<resources>\n    <string name="app_name">${label}</string>\n</resources>`,
  })

  // ── res/values/styles.xml ─────────────────────────────────────────────────
  files.push({
    path: 'android/app/src/main/res/values/styles.xml',
    content: `<resources>\n    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">\n        <item name="android:editTextBackground">@drawable/rn_edit_text_material</item>\n    </style>\n</resources>`,
  })

  // ── proguard ──────────────────────────────────────────────────────────────
  files.push({
    path: 'android/app/proguard-rules.pro',
    content: `-keep class com.facebook.react.** { *; }\n-keep class com.facebook.hermes.** { *; }\n-dontwarn com.facebook.react.**\n`,
  })

  // ── .gitignore ────────────────────────────────────────────────────────────
  files.push({
    path: '.gitignore',
    content: `node_modules/\nnpm-debug.log\nyarn-error.log\nbuild/\nandroid/.gradle\nandroid/app/build/\nandroid/local.properties\n*.keystore\n!debug.keystore\nios/Pods\n`,
  })

  // ── GitHub Actions ────────────────────────────────────────────────────────
  files.push({
    path: '.github/workflows/build-apk.yml',
    content: `name: ⚛️ Build React Native APK

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
          cache: 'npm'

      - name: Install JS dependencies
        run: npm install --legacy-peer-deps

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - uses: android-actions/setup-android@v3
        with:
          packages: >-
            platform-tools
            platforms;android-35
            build-tools;35.0.0
            ndk;26.1.10909125

      - name: Generate debug keystore
        run: |
          cd android/app
          keytool -genkey -v -keystore debug.keystore -storepass android \\
            -alias androiddebugkey -keypass android \\
            -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000

      - name: Make gradlew executable
        run: chmod +x android/gradlew

      - name: Build Debug APK
        run: |
          cd android
          ./gradlew assembleDebug --no-daemon --stacktrace
        env:
          ANDROID_HOME: \${{ env.ANDROID_SDK_ROOT }}

      - uses: actions/upload-artifact@v4
        with:
          name: ${repoSlug}-rn-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30

      - uses: softprops/action-gh-release@v2
        with:
          tag_name: v\${{ github.run_number }}
          name: "⚛️ ${label} v\${{ github.run_number }} (React Native)"
          body: |
            ## ⬇️ تحميل التطبيق

            > ⚛️ **React Native 0.75** — TypeScript | New Architecture
            > 🤖 بُني بواسطة **DZ Agent**
            > 📚 مُستوحى من [react-native-community](https://github.com/react-native-community)
          files: android/app/build/outputs/apk/debug/app-debug.apk
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`,
  })

  // ── README.md ─────────────────────────────────────────────────────────────
  files.push({
    path: 'README.md',
    content: `# ⚛️ ${label} (React Native)

> تطبيق React Native مُنشأ بواسطة **[DZ Agent](https://dz-gpt.vercel.app)** 🤖

## 🔧 البناء محلياً
\`\`\`bash
npm install
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
\`\`\`

## 📚 مراجع
- [react-native-community/rn-new-architecture-app](https://github.com/react-native-community/rn-new-architecture-app)
- [infinitered/ignite](https://github.com/infinitered/ignite)
`,
  })

  return files
}

function _sanitizePkg(pkg) {
  return pkg.replace(/[^a-z0-9.]/gi, '').toLowerCase().replace(/^\.+|\.+$/g, '').replace(/\.{2,}/g, '.') || 'com.dzapp.app'
}
function _safeName(name) {
  return name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '').slice(0, 20) || 'app'
}
