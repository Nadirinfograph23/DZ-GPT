// ── Flutter Generator — مشروع Flutter كامل ───────────────────────────────
// المراجع: https://github.com/flutter/flutter
//          https://github.com/mitesh77/Best-Flutter-UI-Templates
//          https://github.com/jonataslaw/getx

export function generateFlutterProject({ appName = 'DZ App', packageName = '', themeColor = '#1a73e8', appDescription = '' }) {
  const pkg = _sanitizePkg(packageName || `com.dzapp.${_safeName(appName)}`)
  const label = appName.replace(/['"<>&]/g, '').trim().slice(0, 50) || 'DZ App'
  const repoSlug = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const hexColor = themeColor.startsWith('#') ? themeColor.slice(1) : themeColor
  const className = label.replace(/[^a-zA-Z0-9]/g, '') || 'DzApp'
  const desc = appDescription || `تطبيق ${label} مُنشأ بواسطة DZ Agent`

  const files = []

  // ── pubspec.yaml ──────────────────────────────────────────────────────────
  files.push({
    path: 'pubspec.yaml',
    content: `name: ${repoSlug.replace(/-/g, '_')}
description: "${desc}"
version: 1.0.0+1
publish_to: none

environment:
  sdk: '>=3.3.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.6
  http: ^1.2.1
  shared_preferences: ^2.2.3
  google_fonts: ^6.2.1
  flutter_svg: ^2.0.10+1
  intl: ^0.19.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true
  assets:
    - assets/images/
`,
  })

  // ── analysis_options.yaml ─────────────────────────────────────────────────
  files.push({
    path: 'analysis_options.yaml',
    content: `include: package:flutter_lints/flutter.yaml\n\nlinter:\n  rules:\n    prefer_const_constructors: true\n`,
  })

  // ── lib/main.dart ──────────────────────────────────────────────────────────
  files.push({
    path: 'lib/main.dart',
    content: `import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );
  runApp(const ${className}App());
}
`,
  })

  // ── lib/app.dart ──────────────────────────────────────────────────────────
  files.push({
    path: 'lib/app.dart',
    content: `import 'package:flutter/material.dart';
import 'screens/home_screen.dart';
import 'theme/app_theme.dart';

class ${className}App extends StatelessWidget {
  const ${className}App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '${label}',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.system,
      home: const HomeScreen(),
    );
  }
}
`,
  })

  // ── lib/theme/app_theme.dart ──────────────────────────────────────────────
  files.push({
    path: 'lib/theme/app_theme.dart',
    content: `import 'package:flutter/material.dart';

class AppTheme {
  static const Color primary = Color(0xFF${hexColor});
  static const Color secondary = Color(0xFFFFC107);

  static ThemeData get lightTheme => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.light,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: primary,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: true,
    ),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: primary,
      foregroundColor: Colors.white,
    ),
  );

  static ThemeData get darkTheme => ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: primary,
      brightness: Brightness.dark,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.grey[900],
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: true,
    ),
  );
}
`,
  })

  // ── lib/screens/home_screen.dart ──────────────────────────────────────────
  files.push({
    path: 'lib/screens/home_screen.dart',
    content: `import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          '${label}',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
      ),
      body: SafeArea(
        child: Directionality(
          textDirection: TextDirection.rtl,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Hero Card
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(28),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppTheme.primary, Color(0xFF0D47A1)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.primary.withOpacity(0.4),
                        blurRadius: 20,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('مرحباً! 👋',
                        style: TextStyle(color: Colors.white70, fontSize: 16)),
                      const SizedBox(height: 8),
                      const Text('${label}',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                        )),
                      const SizedBox(height: 12),
                      Text('${desc}',
                        style: const TextStyle(color: Colors.white70, fontSize: 14)),
                    ],
                  ),
                ),
                const SizedBox(height: 28),

                // Features Grid
                const Text('المميزات',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.2,
                  children: _features.map((f) => _FeatureCard(
                    icon: f['icon'] as IconData,
                    title: f['title'] as String,
                    color: f['color'] as Color,
                  )).toList(),
                ),
                const SizedBox(height: 28),

                // Info Card
                Card(
                  elevation: 0,
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16)),
                  child: const Padding(
                    padding: EdgeInsets.all(20),
                    child: Row(
                      children: [
                        Icon(Icons.info_outline, color: AppTheme.primary),
                        SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'بُني هذا التطبيق بواسطة DZ Agent 🤖 باستخدام Flutter',
                            style: TextStyle(fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('تطبيق مُنشأ بواسطة DZ Agent 🤖'),
              behavior: SnackBarBehavior.floating,
            ),
          );
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}

const _features = [
  {'icon': Icons.speed, 'title': 'سريع', 'color': Color(0xFF4CAF50)},
  {'icon': Icons.palette, 'title': 'جميل', 'color': Color(0xFF9C27B0)},
  {'icon': Icons.phone_android, 'title': 'أصلي', 'color': Color(0xFF2196F3)},
  {'icon': Icons.offline_bolt, 'title': 'بدون إنترنت', 'color': Color(0xFFFF9800)},
];

class _FeatureCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final Color color;
  const _FeatureCard({required this.icon, required this.title, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 36),
          const SizedBox(height: 8),
          Text(title,
            style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 15)),
        ],
      ),
    );
  }
}
`,
  })

  // ── android/app/build.gradle ──────────────────────────────────────────────
  files.push({
    path: 'android/app/build.gradle',
    content: `plugins {
    id 'com.android.application'
    id 'kotlin-android'
    id 'dev.flutter.flutter-gradle-plugin'
}

android {
    namespace '${pkg}'
    compileSdk flutter.compileSdkVersion
    ndkVersion flutter.ndkVersion

    defaultConfig {
        applicationId '${pkg}'
        minSdk flutter.minSdkVersion
        targetSdk flutter.targetSdkVersion
        versionCode flutterVersionCode.toInteger()
        versionName flutterVersionName
    }

    buildTypes {
        release {
            signingConfig signingConfigs.debug
        }
    }
}

flutter {
    source '../..'
}`,
  })

  // ── android/build.gradle ──────────────────────────────────────────────────
  files.push({
    path: 'android/build.gradle',
    content: `allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.buildDir = '../build'
subprojects { project.buildDir = "\${rootProject.buildDir}/\${project.name}" }
subprojects { project.evaluationDependsOn(':app') }

tasks.register("clean", Delete) { delete rootProject.buildDir }`,
  })

  // ── android/settings.gradle ───────────────────────────────────────────────
  files.push({
    path: 'android/settings.gradle',
    content: `include ':app'
def localPropertiesFile = new File(rootProject.projectDir, "local.properties")
def properties = new Properties()
localPropertiesFile.withReader("UTF-8") { reader -> properties.load(reader) }
def flutterSdkPath = properties.getProperty("flutter.sdk")
assert flutterSdkPath != null, "flutter.sdk not set in local.properties"
apply from: "\$flutterSdkPath/packages/flutter_tools/gradle/app_plugin_loader.gradle"`,
  })

  // ── android/gradle.properties ─────────────────────────────────────────────
  files.push({
    path: 'android/gradle.properties',
    content: `org.gradle.jvmargs=-Xmx4G -XX:MaxMetaspaceSize=2G -XX:+HeapDumpOnOutOfMemoryError
android.useAndroidX=true
android.enableJetifier=true`,
  })

  // ── android/app/src/main/AndroidManifest.xml ──────────────────────────────
  files.push({
    path: 'android/app/src/main/AndroidManifest.xml',
    content: `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
    <application
        android:label="${label}"
        android:name="\${applicationName}"
        android:icon="@mipmap/ic_launcher">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">
            <meta-data android:name="io.flutter.embedding.android.NormalTheme" android:resource="@style/NormalTheme"/>
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
        <meta-data android:name="flutterEmbedding" android:value="2"/>
    </application>
</manifest>`,
  })

  // ── android/app/src/main/kotlin/MainActivity.kt ───────────────────────────
  const pkgPath = pkg.replace(/\./g, '/')
  files.push({
    path: `android/app/src/main/kotlin/${pkgPath}/MainActivity.kt`,
    content: `package ${pkg}\n\nimport io.flutter.embedding.android.FlutterActivity\n\nclass MainActivity: FlutterActivity()\n`,
  })

  // ── android/app/src/main/res/values/styles.xml ────────────────────────────
  files.push({
    path: 'android/app/src/main/res/values/styles.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="LaunchTheme" parent="@android:style/Theme.Black.NoTitleBar">
        <item name="android:windowBackground">@drawable/launch_background</item>
    </style>
    <style name="NormalTheme" parent="@android:style/Theme.Black.NoTitleBar">
        <item name="android:windowBackground">?android:colorBackground</item>
    </style>
</resources>`,
  })

  // ── android/app/src/main/res/drawable/launch_background.xml ──────────────
  files.push({
    path: 'android/app/src/main/res/drawable/launch_background.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="#FF${hexColor}" />
</layer-list>`,
  })

  // ── assets placeholder ────────────────────────────────────────────────────
  files.push({ path: 'assets/images/.gitkeep', content: '' })

  // ── .gitignore ────────────────────────────────────────────────────────────
  files.push({
    path: '.gitignore',
    content: `# Flutter
.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
.packages
.pub-cache/
.pub/
build/
*.g.dart
*.freezed.dart

# Android
android/local.properties
android/.gradle
android/captures/
android/gradlew
android/gradlew.bat

# IDE
.idea/
*.iml
`,
  })

  // ── GitHub Actions ────────────────────────────────────────────────────────
  files.push({
    path: '.github/workflows/build-apk.yml',
    content: `name: 🦋 Build Flutter APK

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

      - uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.22.0'
          channel: 'stable'
          cache: true

      - name: Get dependencies
        run: flutter pub get

      - name: Build APK
        run: flutter build apk --release --no-tree-shake-icons

      - uses: actions/upload-artifact@v4
        with:
          name: ${repoSlug}-flutter-release
          path: build/app/outputs/flutter-apk/app-release.apk
          retention-days: 30

      - uses: softprops/action-gh-release@v2
        with:
          tag_name: v\${{ github.run_number }}
          name: "🦋 ${label} v\${{ github.run_number }} (Flutter)"
          body: |
            ## ⬇️ تحميل التطبيق
            انقر على \`app-release.apk\` للتحميل.

            > 🦋 **Flutter** — Dart | Material Design 3
            > 🤖 بُني بواسطة **DZ Agent**
          files: build/app/outputs/flutter-apk/app-release.apk
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`,
  })

  // ── README.md ─────────────────────────────────────────────────────────────
  files.push({
    path: 'README.md',
    content: `# 🦋 ${label} (Flutter)

> تطبيق Flutter مُنشأ بواسطة **[DZ Agent](https://dzagent.app)** 🤖

## ⬇️ تحميل APK
اذهب إلى **[Releases](../../releases)** وحمّل آخر إصدار.

## 🔧 البناء محلياً
\`\`\`bash
flutter pub get
flutter build apk --release
# APK: build/app/outputs/flutter-apk/app-release.apk
\`\`\`

## 📚 مراجع
- [flutter/flutter](https://github.com/flutter/flutter)
- [mitesh77/Best-Flutter-UI-Templates](https://github.com/mitesh77/Best-Flutter-UI-Templates)
- [jonataslaw/getx](https://github.com/jonataslaw/getx)
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
