// Shared plugins are declared once here with `apply false`; each module applies them with
// alias(libs.plugins.*). Every version lives in gradle/libs.versions.toml.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
    // Gradle resolves a plugin marker and its whole classpath at configuration time even under
    // `apply false`, so these two put the com.android.test and benchmark chains in front of
    // every invocation, `:app:assembleDebug` included. None of that ships in a stock Gradle
    // cache: the first build on a machine must be online (flick:build.gradle.kts:5-13,
    // flick:CLAUDE.md:23-37). After one online resolve, `--offline` works.
    alias(libs.plugins.android.test) apply false
    alias(libs.plugins.androidx.baselineprofile) apply false
}
