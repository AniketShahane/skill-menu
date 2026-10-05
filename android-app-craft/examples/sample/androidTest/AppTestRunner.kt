// Shows: a custom instrumentation runner used for exactly one hook — turning off a paid or
// network-backed dependency before the app's own Application object is ever created.
// Example written for this skill; read it, don't paste it.
package com.example.app

import android.os.Bundle
import androidx.test.runner.AndroidJUnitRunner

/**
 * `testInstrumentationRunner` in the app's build config points here instead of the default
 * runner. [onCreate] runs before `Application.onCreate`, so a switch flipped here is already off
 * by the time the first screen composes — no emulator run can spend paid API calls or reach a
 * real backend by accident, even if a test forgets to ask for the fake explicitly.
 *
 * Deliberately not an instrumentation argument (`-e fakeBackend true`) read inside the app: an
 * argument the app has to remember to check can be forgotten by a future screen; a switch the
 * runner sets before anything exists cannot.
 */
class AppTestRunner : AndroidJUnitRunner() {
    override fun onCreate(arguments: Bundle?) {
        disablePaidBackends()
        super.onCreate(arguments)
    }

    /**
     * Each backend exposes a single process-wide switch, default on, that a test build turns off
     * here. For example a paid thumbnail-captioning client:
     * `CaptionBackend.networkAllowed = false` — every instrumentation run then uses the bundled
     * fixture captions instead of calling out and billing the project's account.
     */
    private fun disablePaidBackends() {
        PaidBackend.networkAllowed = false
    }
}

/** The switch [AppTestRunner] flips off. Production code reads this at the call site, not an
 * instrumentation argument, so forgetting to check it is not a way to accidentally spend money. */
internal object PaidBackend {
    @Volatile var networkAllowed: Boolean = true
}
