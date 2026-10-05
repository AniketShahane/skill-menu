// The baseline-profile producer for :app, and the home of its macrobenchmarks. Generate with
//   ./gradlew :app:generateReleaseBaselineProfile        (a device must be connected)
// and commit what lands in app/src/release/generated/baselineProfiles/.
plugins {
    alias(libs.plugins.android.test)
    alias(libs.plugins.androidx.baselineprofile)
}

android {
    namespace = "com.example.starter.baselineprofile"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        // Capture reads ART's profile files through shell, which the platform supports only from
        // API 28; below that there is nothing to dump, whatever the app's own minSdk is
        // (flick:baselineprofile/sender/build.gradle.kts:11-14).
        minSdk = libs.versions.baselineProfileMinSdk.get().toInt()
        targetSdk = libs.versions.targetSdk.get().toInt()
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // AGP 9's built-in Kotlin compiles this module. The app gets it as a side effect of the
    // Compose plugin; nothing here would imply it (flick:baselineprofile/sender/build.gradle.kts:24-26).
    enableKotlin = true

    targetProjectPath = ":app"
}

baselineProfile {
    // Whatever device adb has, with no Gradle-managed device: a profile recorded on the hardware
    // the app runs on, with real data on screen, is the one worth shipping. Flick's journeys need
    // real media; an empty emulator image profiles the empty state.
    useConnectedDevices = true
}

dependencies {
    implementation(libs.junit)
    implementation(libs.androidx.test.ext.junit)
    implementation(libs.androidx.test.runner)
    implementation(libs.androidx.test.uiautomator)
    implementation(libs.androidx.benchmark.macro.junit4)
}
