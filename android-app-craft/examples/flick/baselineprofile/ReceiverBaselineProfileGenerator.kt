package com.flick.baselineprofile.receiver

import android.os.Build
import android.view.KeyEvent
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Records the classes and methods ART should compile ahead of time for the TV app.
 *
 * The TV is driven with the D-pad rather than taps: focus traversal is what actually runs
 * the receiver's animation code, and it is the path the MediaTek CPU has to keep up with.
 *
 * Playback chrome, the subtitles panel and the metrics panel only exist while a phone is
 * casting, which a generator run cannot arrange. Those steps are attempted and skipped
 * silently — the profile is then thinner, not wrong.
 */
@RunWith(AndroidJUnit4::class)
class ReceiverBaselineProfileGenerator {

    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun startup() {
        assumeTrue(Build.VERSION.SDK_INT >= MIN_CAPTURE_SDK)
        rule.collect(packageName = RECEIVER_PACKAGE, includeInStartupProfile = true) {
            device.pressHome()
            startActivityAndWait()
            awaitAppWindow()
        }
    }

    @Test
    fun journeys() {
        assumeTrue(Build.VERSION.SDK_INT >= MIN_CAPTURE_SDK)
        rule.collect(packageName = RECEIVER_PACKAGE) {
            device.pressHome()
            startActivityAndWait()
            awaitAppWindow()

            walkIdleAndPairScreen()
            openSettings()
            togglePlaybackChrome()
            openSubtitlesAndMetricsPanels()
        }
    }
}

private const val RECEIVER_PACKAGE = "com.flick.receiver"

/** Below API 28 the platform exposes no way to dump ART's profile. */
private const val MIN_CAPTURE_SDK = 28

private const val WAIT_MS = 5_000L

private fun MacrobenchmarkScope.awaitAppWindow() {
    device.wait(Until.hasObject(By.pkg(packageName).depth(0)), WAIT_MS)
    device.waitForIdle()
}

/** Drives the whole focus graph of the idle/pair route so its focus ring compiles. */
private fun MacrobenchmarkScope.walkIdleAndPairScreen() {
    pressKeys(
        KeyEvent.KEYCODE_DPAD_DOWN,
        KeyEvent.KEYCODE_DPAD_DOWN,
        KeyEvent.KEYCODE_DPAD_RIGHT,
        KeyEvent.KEYCODE_DPAD_RIGHT,
        KeyEvent.KEYCODE_DPAD_UP,
        KeyEvent.KEYCODE_DPAD_LEFT,
    )
    // "Show code bigger" and the full-screen composition behind it are gone; the pair
    // screen's action row is [Rename TV] [Settings], and the D-pad walk above covers it.
    // Settings is reached from here as well as from Idle, and it is the same surface, so
    // it is driven once from [openSettings] rather than twice.
}

private fun MacrobenchmarkScope.openSettings() {
    if (!activateLabelled("Settings")) return
    pressKeys(
        KeyEvent.KEYCODE_DPAD_DOWN,
        KeyEvent.KEYCODE_DPAD_DOWN,
        KeyEvent.KEYCODE_DPAD_DOWN,
        KeyEvent.KEYCODE_DPAD_UP,
    )
    // The paired-phones drill-in is its own pane behind an AnimatedContent, with its own
    // focus-beacon host and its own row composables — none of which the Settings column
    // itself compiles. It exists only once a phone is paired, so the generator may find
    // no such row at all; that is why this is a labelled activation and not a key count.
    if (activateLabelled("Manage")) {
        pressKeys(
            KeyEvent.KEYCODE_DPAD_DOWN,
            KeyEvent.KEYCODE_DPAD_RIGHT,
            KeyEvent.KEYCODE_BACK,
        )
    }
    pressKeys(KeyEvent.KEYCODE_BACK)
}

/** Center shows/hides the transport chrome; down opens it from the bare surface. */
private fun MacrobenchmarkScope.togglePlaybackChrome() {
    pressKeys(
        KeyEvent.KEYCODE_DPAD_CENTER,
        KeyEvent.KEYCODE_DPAD_DOWN,
        KeyEvent.KEYCODE_DPAD_CENTER,
        KeyEvent.KEYCODE_BACK,
    )
}

private fun MacrobenchmarkScope.openSubtitlesAndMetricsPanels() {
    if (activateLabelled("Subtitles")) {
        pressKeys(KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_BACK)
    }
    if (activateLabelled("Stream metrics", "Metrics")) {
        pressKeys(KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_BACK)
    }
}

private fun MacrobenchmarkScope.pressKeys(vararg keyCodes: Int) {
    keyCodes.forEach { keyCode ->
        runCatching { device.pressKeyCode(keyCode) }
        device.waitForIdle()
    }
}

/**
 * Activates the first node whose text or description contains any of the labels. Compose for
 * TV clickables accept an injected tap as well as a D-pad select, so a tap is enough here.
 * Returns false when nothing matched: these are product strings and are allowed to change
 * without breaking profile generation.
 */
private fun MacrobenchmarkScope.activateLabelled(vararg labels: String): Boolean {
    val needles = labels.map { it.lowercase() }
    val target = device.findObjects(By.pkg(packageName)).firstOrNull { node ->
        val haystack = node.labelText()
        needles.any { haystack.contains(it) }
    } ?: return false
    val clicked = runCatching { target.click() }.isSuccess
    device.waitForIdle()
    return clicked
}

/** UiObject2 reads go through the accessibility tree and throw once the node is recycled. */
private fun UiObject2.labelText(): String = runCatching {
    "${text.orEmpty()} ${contentDescription.orEmpty()}".lowercase()
}.getOrDefault("")
