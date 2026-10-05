package com.example.starter

import android.os.Bundle
import androidx.test.runner.AndroidJUnitRunner

/**
 * The instrumentation runner (`testInstrumentationRunner` in app/build.gradle.kts). It exists for
 * one hook: [onCreate] runs before the app's `Application` is created, so a switch flipped here is
 * already off when the first screen composes. For example, set a paid text-to-speech
 * client's network switch to false here so no emulator run spends paid characters.
 *
 * The starter has no paid or network backend, so [switchOffPaidBackends] is empty. When the app
 * gains one, give that backend a process-wide switch in `src/main` (a `@Volatile var` on its
 * object, default on) and turn it off in [switchOffPaidBackends]. Do not read an instrumentation
 * argument inside the app instead: a switch the app looks up can be forgotten, one the runner
 * sets cannot.
 */
class StarterTestRunner : AndroidJUnitRunner() {
    override fun onCreate(arguments: Bundle?) {
        switchOffPaidBackends()
        super.onCreate(arguments)
    }

    private fun switchOffPaidBackends() {
        // e.g. SpeechBackend.networkAllowed = false; Billing.useFakes = true
    }
}
