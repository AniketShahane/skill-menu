plugins {
    alias(libs.plugins.android.test)
    alias(libs.plugins.androidx.baselineprofile)
}

android {
    namespace = "com.flick.baselineprofile.sender"
    compileSdk = libs.versions.compileSdk.get().toInt()

    defaultConfig {
        // Baseline-profile capture reads ART's profile files through shell, which
        // the platform only supports from API 28 — below that the generator has
        // nothing to dump, regardless of the app's own minSdk of 26.
        minSdk = 28
        targetSdk = libs.versions.targetSdk.get().toInt()
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // AGP 9's built-in Kotlin is what compiles this module. The app modules get it
    // as a side effect of the Compose plugin; nothing here would imply it.
    enableKotlin = true

    targetProjectPath = ":sender"
}

baselineProfile {
    // A phone plugged into adb. No Gradle-managed device is declared: the sender
    // journeys read MediaStore video, which an empty emulator image cannot show.
    useConnectedDevices = true
}

dependencies {
    implementation("junit:junit:4.13.2")
    implementation("androidx.test.ext:junit:1.2.1")
    implementation("androidx.test:runner:1.6.2")
    implementation("androidx.test.uiautomator:uiautomator:2.4.0")
    implementation(libs.androidx.benchmark.macro.junit4)
}
