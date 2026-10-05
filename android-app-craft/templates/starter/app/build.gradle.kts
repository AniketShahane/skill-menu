// Imported, not written as `java.util.Properties`: inside a Kotlin build script `java` names
// Gradle's own java extension, so the qualified name does not resolve
// (flick:sender/build.gradle.kts:1-5).
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.androidx.baselineprofile)
}

/** A `-P<name>=true` switch; defaults live in gradle.properties. */
fun switch(name: String): Boolean =
    providers.gradleProperty(name).map { it.trim().equals("true", ignoreCase = true) }.getOrElse(false)

val appTestRelease = switch("appTestRelease")
val appTracing = switch("appTracing")

/** Gitignored local.properties, read once. Values from it are never printed. */
val localProperties: Properties? = rootProject.file("local.properties")
    .takeIf { it.isFile }
    ?.let { file -> Properties().apply { file.inputStream().use { load(it) } } }

/**
 * The Play upload identity, from local.properties or the environment (CI). The keystore lives
 * outside the repository; only a path to it is configured here.
 *
 * All-or-nothing: three fields set and the fourth forgotten would otherwise fall back to the
 * debug key in silence and produce a bundle Play rejects only after the upload. None set is the
 * normal state of a clone and must still build (flick:sender/build.gradle.kts:121-165). The error
 * names the field, never the value: a build log is the wrong place for a password.
 */
val uploadSigning: Map<String, String>? = run {
    fun field(propertyName: String, environmentName: String): String =
        (localProperties?.getProperty(propertyName) ?: System.getenv(environmentName)).orEmpty().trim()

    val fields = mapOf(
        "storeFile" to field("app.upload.storeFile", "APP_UPLOAD_STORE_FILE"),
        "storePassword" to field("app.upload.storePassword", "APP_UPLOAD_STORE_PASSWORD"),
        "keyAlias" to field("app.upload.keyAlias", "APP_UPLOAD_KEY_ALIAS"),
        "keyPassword" to field("app.upload.keyPassword", "APP_UPLOAD_KEY_PASSWORD"),
    )
    val missing = fields.filterValues { it.isEmpty() }.keys
    when {
        missing.size == fields.size -> null
        missing.isNotEmpty() -> throw GradleException(
            "Upload signing is all-or-nothing: app.upload.${missing.joinToString()} " +
                "${if (missing.size == 1) "is" else "are"} unset while the others are set.",
        )
        !File(fields.getValue("storeFile")).isFile -> throw GradleException(
            "app.upload.storeFile does not point at a file. The upload keystore is kept " +
                "outside this repository; restore it from your backup.",
        )
        else -> fields
    }
}

android {
    namespace = "com.example.starter"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        applicationId = "com.example.starter"
        minSdk = libs.versions.minSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        versionCode = 1
        versionName = "0.1.0"

        // The suites' own runner, so a test can cut paid or network backends before the app
        // starts (dash:app/build.gradle.kts:18-19, dash:.../DashTestRunner.kt).
        testInstrumentationRunner = "com.example.starter.StarterTestRunner"
    }

    signingConfigs {
        uploadSigning?.let { identity ->
            create("upload") {
                storeFile = File(identity.getValue("storeFile"))
                storePassword = identity.getValue("storePassword")
                keyAlias = identity.getValue("keyAlias")
                keyPassword = identity.getValue("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // The real shape of the app, and the only build whose frames mean anything: a debug
            // build carries Compose's source-information bookkeeping, inlines nothing, and ART
            // holds back optimisation. Dash's tour: 8.5 % janky, p99 133 ms on debug; 1.5 %,
            // p99 23 ms on this plus AOT and its 0.9.1 fixes (dash:docs/upgrade-0.9.1 "Measure").
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // The upload key when one is configured, otherwise the local debug key. The fallback
            // is a local-testing identity, not a distribution one: it is what lets
            // `adb install -r` of a release build replace a debug install and keep the phone's
            // data (dash:app/build.gradle.kts:49-55).
            signingConfig = signingConfigs.findByName("upload") ?: signingConfigs.getByName("debug")
            // The instrumentation APK, when it is built against this type (-PappTestRelease).
            testProguardFiles("proguard-test-rules.pro")
            if (appTestRelease) proguardFile("proguard-test-app-rules.pro")
        }

        // The measurement target: release-shaped and not debuggable (debuggable code is never
        // AOT-compiled, which invalidates timings), but unminified so traces and profiles show
        // real names. The baseline-profile plugin treats `benchmark*` names as its own, so this
        // type stays out of profile wiring; `benchmarkRelease` is the variant that carries a
        // profile (flick:sender/build.gradle.kts:237-250).
        create("benchmark") {
            initWith(getByName("release"))
            isMinifyEnabled = false
            isShrinkResources = false
            isDebuggable = false
            matchingFallbacks += listOf("release")
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    // `-PappTestRelease=true` points the instrumentation suites at the minified release build.
    testBuildType = if (appTestRelease) "release" else "debug"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }

    testOptions {
        // Animations off for the device suites, so a test never races a transition. Motion tests
        // that need time to pass drive the clock themselves (MotionDurationScale, mainClock).
        animationsDisabled = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

baselineProfile {
    from(project(":baselineprofile"))
    // Generation needs a connected device, so it stays off the assemble path:
    // `assembleRelease` packages whatever profile is committed under src/release/generated/.
    automaticGenerationDuringBuild = false
    saveInSrc = true
    // The plugin hides its synthetic build types from Studio's variant picker by default, which
    // would also hide the hand-written `benchmark` type.
    hideSyntheticBuildTypesInAndroidStudio = false
    // Lays startup classes out together in the dex. The sibling `baselineProfileRulesRewrite` is
    // left unset on purpose: it writes a module property AGP 9.3.0 no longer defines
    // (flick:sender/build.gradle.kts:283-297).
    dexLayoutOptimization = true
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    // Installs the packaged baseline profile into ART on first run.
    implementation(libs.androidx.profileinstaller)

    val composeBom = platform(libs.androidx.compose.bom)
    implementation(composeBom)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.animation)
    // Pinned apart from the BOM: the Expressive alpha pulls Compose 1.12.
    implementation(libs.androidx.compose.material3)
    implementation(libs.haze)
    debugImplementation(libs.androidx.compose.ui.tooling)

    // -PappTracing=true: composable names in a Perfetto trace of a non-debuggable build
    // (scripts/trace-phone.sh). Needs <profileable android:shell="true"/>, which the manifest has.
    if (appTracing) {
        implementation(libs.androidx.compose.runtime.tracing)
        implementation(libs.androidx.tracing.perfetto)
        implementation(libs.androidx.tracing.perfetto.binary)
    }

    testImplementation(libs.junit)

    androidTestImplementation(composeBom)
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.core.ktx)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.rules)
    androidTestImplementation(libs.androidx.test.uiautomator)
    // createComposeRule() needs this manifest's host activity in the APK under test. It is a
    // debug-only dependency, so a release-targeted run adds it to release for that build only.
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    if (appTestRelease) "releaseImplementation"(libs.androidx.compose.ui.test.manifest)
}
