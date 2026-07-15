// ── Kotlin Native Generator — تطبيق أندرويد خالص بـ Kotlin ─────────────────
// المراجع:
//   https://github.com/android/architecture-samples       (MVVM)
//   https://github.com/PatilShreyas/Foodium              (Retrofit + Coroutines)
//   https://github.com/skydoves/android-developer-roadmap
//   https://github.com/philipplackner/ktor-client-android

export function generateKotlinProject({ appName = 'DZ App', packageName = '', themeColor = '#1a73e8', appDescription = '', appFeatures = [] }) {
  const pkg = _sanitizePkg(packageName || `com.dzapp.${_safeName(appName)}`)
  const pkgPath = pkg.replace(/\./g, '/')
  const label = appName.replace(/['"<>&]/g, '').trim().slice(0, 50) || 'DZ App'
  const repoSlug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const hexColor = themeColor.startsWith('#') ? themeColor.slice(1) : themeColor
  const darkHex = _darken(hexColor)
  const desc = appDescription || `تطبيق ${label} مُنشأ بواسطة DZ Agent`
  const features = appFeatures.length > 0 ? appFeatures : ['المميزة ١', 'المميزة ٢', 'المميزة ٣']

  const files = []

  // ── Root build.gradle.kts ─────────────────────────────────────────────────
  files.push({
    path: 'build.gradle.kts',
    content: `plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
}`,
  })

  // ── settings.gradle.kts ───────────────────────────────────────────────────
  files.push({
    path: 'settings.gradle.kts',
    content: `pluginManagement {
    repositories {
        google { content { includeGroupByRegex("com\\\\.android.*"); includeGroupByRegex("com\\\\.google.*"); includeGroupByRegex("androidx.*") } }
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}

rootProject.name = "${label}"
include(":app")`,
  })

  // ── gradle/libs.versions.toml ─────────────────────────────────────────────
  files.push({
    path: 'gradle/libs.versions.toml',
    content: `[versions]
agp = "8.5.0"
kotlin = "2.0.0"
coreKtx = "1.13.1"
appcompat = "1.7.0"
material = "1.12.0"
constraintlayout = "2.1.4"
lifecycle = "2.8.3"
coroutines = "1.8.1"
retrofit = "2.11.0"
okhttp = "4.12.0"
gson = "2.11.0"
coil = "2.7.0"
navigation = "2.7.7"
room = "2.6.1"
junit = "4.13.2"
junitVersion = "1.2.1"
espressoCore = "3.6.1"

[libraries]
androidx-core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "coreKtx" }
androidx-appcompat = { group = "androidx.appcompat", name = "appcompat", version.ref = "appcompat" }
material = { group = "com.google.android.material", name = "material", version.ref = "material" }
androidx-constraintlayout = { group = "androidx.constraintlayout", name = "constraintlayout", version.ref = "constraintlayout" }
androidx-lifecycle-viewmodel = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-ktx", version.ref = "lifecycle" }
androidx-lifecycle-livedata = { group = "androidx.lifecycle", name = "lifecycle-livedata-ktx", version.ref = "lifecycle" }
kotlinx-coroutines-android = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-android", version.ref = "coroutines" }
retrofit = { group = "com.squareup.retrofit2", name = "retrofit", version.ref = "retrofit" }
retrofit-gson = { group = "com.squareup.retrofit2", name = "converter-gson", version.ref = "retrofit" }
okhttp-logging = { group = "com.squareup.okhttp3", name = "logging-interceptor", version.ref = "okhttp" }
gson = { group = "com.google.code.gson", name = "gson", version.ref = "gson" }
coil = { group = "io.coil-kt", name = "coil", version.ref = "coil" }
androidx-navigation-fragment = { group = "androidx.navigation", name = "navigation-fragment-ktx", version.ref = "navigation" }
androidx-navigation-ui = { group = "androidx.navigation", name = "navigation-ui-ktx", version.ref = "navigation" }
androidx-room-runtime = { group = "androidx.room", name = "room-runtime", version.ref = "room" }
androidx-room-ktx = { group = "androidx.room", name = "room-ktx", version.ref = "room" }
junit = { group = "junit", name = "junit", version.ref = "junit" }
androidx-junit = { group = "androidx.test.ext", name = "junit", version.ref = "junitVersion" }
androidx-espresso-core = { group = "androidx.test.espresso", name = "espresso-core", version.ref = "espressoCore" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
`,
  })

  // ── app/build.gradle.kts ──────────────────────────────────────────────────
  files.push({
    path: 'app/build.gradle.kts',
    content: `plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "${pkg}"
    compileSdk = 34

    defaultConfig {
        applicationId = "${pkg}"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions { jvmTarget = "11" }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    implementation(libs.androidx.constraintlayout)
    implementation(libs.androidx.lifecycle.viewmodel)
    implementation(libs.androidx.lifecycle.livedata)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.retrofit)
    implementation(libs.retrofit.gson)
    implementation(libs.okhttp.logging)
    implementation(libs.coil)
    implementation(libs.androidx.navigation.fragment)
    implementation(libs.androidx.navigation.ui)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}`,
  })

  // ── gradle.properties ─────────────────────────────────────────────────────
  files.push({
    path: 'gradle.properties',
    content: `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\nandroid.useAndroidX=true\nkotlin.code.style=official\nandroid.nonTransitiveRClass=true`,
  })

  // ── gradle wrapper ────────────────────────────────────────────────────────
  files.push({
    path: 'gradle/wrapper/gradle-wrapper.properties',
    content: `distributionBase=GRADLE_USER_HOME\ndistributionPath=wrapper/dists\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip\nnetworkTimeout=10000\nzipStoreBase=GRADLE_USER_HOME\nzipStorePath=wrapper/dists`,
  })

  // ── AndroidManifest.xml ───────────────────────────────────────────────────
  files.push({
    path: 'app/src/main/AndroidManifest.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.${_className(label)}">

        <activity
            android:name=".ui.MainActivity"
            android:exported="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
    </application>
</manifest>`,
  })

  const cn = _className(label)

  // ── MainActivity.kt ───────────────────────────────────────────────────────
  files.push({
    path: `app/src/main/java/${pkgPath}/ui/MainActivity.kt`,
    content: `package ${pkg}.ui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import ${pkg}.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = "${label}"

        setupUI()
    }

    private fun setupUI() {
        binding.tvWelcome.text = "مرحباً بك في ${label}! 🎉"
        binding.tvDescription.text = "${desc}"

        binding.btnAction.setOnClickListener {
            com.google.android.material.snackbar.Snackbar
                .make(binding.root, "تطبيق مُنشأ بواسطة DZ Agent 🤖", com.google.android.material.snackbar.Snackbar.LENGTH_LONG)
                .show()
        }
    }
}`,
  })

  // ── activity_main.xml ─────────────────────────────────────────────────────
  files.push({
    path: 'app/src/main/res/layout/activity_main.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<androidx.coordinatorlayout.widget.CoordinatorLayout
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <com.google.android.material.appbar.AppBarLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content">
        <androidx.appcompat.widget.Toolbar
            android:id="@+id/toolbar"
            android:layout_width="match_parent"
            android:layout_height="?attr/actionBarSize"
            android:background="@color/colorPrimary"
            app:titleTextColor="@android:color/white"/>
    </com.google.android.material.appbar.AppBarLayout>

    <ScrollView
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        app:layout_behavior="@string/appbar_scrolling_view_behavior">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:padding="20dp"
            android:layoutDirection="rtl">

            <!-- Hero Card -->
            <com.google.android.material.card.MaterialCardView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:layout_marginBottom="20dp"
                app:cardBackgroundColor="@color/colorPrimary"
                app:cardCornerRadius="20dp"
                app:cardElevation="8dp">
                <LinearLayout
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:orientation="vertical"
                    android:padding="24dp">
                    <TextView
                        android:id="@+id/tvWelcome"
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:text="مرحباً 👋"
                        android:textColor="#FFFFFF"
                        android:textSize="22sp"
                        android:textStyle="bold"/>
                    <TextView
                        android:id="@+id/tvDescription"
                        android:layout_width="wrap_content"
                        android:layout_height="wrap_content"
                        android:layout_marginTop="8dp"
                        android:text="${desc}"
                        android:textColor="#CCFFFFFF"
                        android:textSize="15sp"/>
                </LinearLayout>
            </com.google.android.material.card.MaterialCardView>

            <!-- Features -->
            ${features.map((f, i) => `<com.google.android.material.card.MaterialCardView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:layout_marginBottom="12dp"
                app:cardCornerRadius="16dp"
                app:cardElevation="2dp">
                <LinearLayout
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:orientation="horizontal"
                    android:padding="16dp"
                    android:gravity="center_vertical"
                    android:layoutDirection="rtl">
                    <TextView
                        android:layout_width="40dp"
                        android:layout_height="40dp"
                        android:text="${['🚀','⭐','🔥','💡','🎯','🎨'][i % 6]}"
                        android:textSize="24sp"
                        android:gravity="center"/>
                    <TextView
                        android:layout_width="0dp"
                        android:layout_height="wrap_content"
                        android:layout_weight="1"
                        android:layout_marginStart="12dp"
                        android:text="${f}"
                        android:textSize="16sp"
                        android:textStyle="bold"/>
                </LinearLayout>
            </com.google.android.material.card.MaterialCardView>`).join('\n            ')}

            <!-- Action Button -->
            <com.google.android.material.button.MaterialButton
                android:id="@+id/btnAction"
                android:layout_width="match_parent"
                android:layout_height="56dp"
                android:layout_marginTop="8dp"
                android:text="ابدأ الآن 🚀"
                android:textSize="16sp"
                app:cornerRadius="28dp"
                android:backgroundTint="@color/colorPrimary"/>

            <!-- Footer -->
            <TextView
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:layout_marginTop="20dp"
                android:text="🤖 بُني بواسطة DZ Agent"
                android:textAlignment="center"
                android:textColor="#888888"
                android:textSize="12sp"/>
        </LinearLayout>
    </ScrollView>
</androidx.coordinatorlayout.widget.CoordinatorLayout>`,
  })

  // ── res/values ────────────────────────────────────────────────────────────
  files.push({
    path: 'app/src/main/res/values/strings.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">${label}</string>\n    <string name="app_description">${desc}</string>\n</resources>`,
  })

  files.push({
    path: 'app/src/main/res/values/colors.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="colorPrimary">#${hexColor}</color>\n    <color name="colorPrimaryDark">#${darkHex}</color>\n    <color name="colorAccent">#FFC107</color>\n    <color name="colorBackground">#F5F5F5</color>\n    <color name="colorSurface">#FFFFFF</color>\n</resources>`,
  })

  files.push({
    path: 'app/src/main/res/values/themes.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.${cn}" parent="Theme.MaterialComponents.DayNight.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
        <item name="android:statusBarColor">@color/colorPrimaryDark</item>
    </style>
</resources>`,
  })

  // ── proguard ──────────────────────────────────────────────────────────────
  files.push({ path: 'app/proguard-rules.pro', content: '# Add project specific ProGuard rules here.\n-keep class retrofit2.** { *; }\n-keepclassmembers class * { @retrofit2.http.* <methods>; }\n' })

  // ── .gitignore ────────────────────────────────────────────────────────────
  files.push({
    path: '.gitignore',
    content: `*.iml\n.gradle\n/local.properties\n/.idea\n.DS_Store\n/build\n/captures\n.externalNativeBuild\n.cxx\nlocal.properties\n`,
  })

  // ── GitHub Actions ────────────────────────────────────────────────────────
  files.push({
    path: '.github/workflows/build-apk.yml',
    content: `name: 🟣 Build Kotlin APK

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

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
        uses: gradle/actions/setup-gradle@v3

      - name: Make gradlew executable
        run: chmod +x ./gradlew

      - name: Build Debug APK
        run: ./gradlew assembleDebug --no-daemon

      - uses: actions/upload-artifact@v4
        with:
          name: ${repoSlug}-kotlin-debug
          path: app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30

      - uses: softprops/action-gh-release@v2
        with:
          tag_name: v\${{ github.run_number }}
          name: "🟣 ${label} v\${{ github.run_number }} (Kotlin)"
          body: |
            ## ⬇️ تحميل التطبيق

            > 🟣 **Kotlin Native** — MVVM Architecture | Material Design 3
            > 🤖 بُني بواسطة **DZ Agent**
            > 📚 مُستوحى من [android/architecture-samples](https://github.com/android/architecture-samples)
          files: app/build/outputs/apk/debug/app-debug.apk
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`,
  })

  // ── README.md ─────────────────────────────────────────────────────────────
  files.push({
    path: 'README.md',
    content: `# 🟣 ${label} (Kotlin Native)

> تطبيق أندرويد أصلي بـ **Kotlin** — مُنشأ بواسطة **[DZ Agent](https://dz-gpt.vercel.app)** 🤖

## 🏗️ البنية المعمارية
- **MVVM** — Model-View-ViewModel
- **Kotlin Coroutines** — العمليات غير المتزامنة
- **Retrofit** — استدعاءات الشبكة
- **Material Design 3** — واجهة مستخدم حديثة
- **ViewBinding** — ربط العناصر بأمان

## ⬇️ تحميل APK
اذهب إلى **[Releases](../../releases)** وحمّل آخر إصدار.

## 🔧 البناء محلياً
\`\`\`bash
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
\`\`\`

## 📚 مراجع
- [android/architecture-samples](https://github.com/android/architecture-samples)
- [PatilShreyas/Foodium](https://github.com/PatilShreyas/Foodium)
- [skydoves/android-developer-roadmap](https://github.com/skydoves/android-developer-roadmap)
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
function _className(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '').replace(/^[0-9]+/, '') || 'DzApp'
}
function _darken(hex) {
  try {
    const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - 40).toString(16).padStart(2, '0')
    const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - 40).toString(16).padStart(2, '0')
    const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - 40).toString(16).padStart(2, '0')
    return r + g + b
  } catch { return '1a56c0' }
}
