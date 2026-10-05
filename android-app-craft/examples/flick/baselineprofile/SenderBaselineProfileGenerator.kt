package com.flick.baselineprofile.sender

import android.os.Build
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Records the classes and methods ART should compile ahead of time for the phone app.
 *
 * Every interaction here is best-effort. The generator runs against whatever library the
 * connected phone actually has, and it must not fail a journey just because a control was
 * not on screen — a short profile is still a valid profile, an aborted run is not.
 */
@RunWith(AndroidJUnit4::class)
class SenderBaselineProfileGenerator {

    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun startup() {
        assumeTrue(Build.VERSION.SDK_INT >= MIN_CAPTURE_SDK)
        rule.collect(packageName = SENDER_PACKAGE, includeInStartupProfile = true) {
            grantRuntimePermissions()
            device.pressHome()
            startActivityAndWait()
            awaitAppWindow()
        }
    }

    @Test
    fun journeys() {
        assumeTrue(Build.VERSION.SDK_INT >= MIN_CAPTURE_SDK)
        rule.collect(packageName = SENDER_PACKAGE) {
            grantRuntimePermissions()
            device.pressHome()
            startActivityAndWait()
            awaitAppWindow()

            scrollLibraryGrid()
            openFilmDetail()
            openNowPlayingRemote()
            openMetricsAndSubtitlesSheets()
            visitDevicesAndSettings()
        }
    }
}

private const val SENDER_PACKAGE = "com.flick.sender"

/** Below API 28 the platform exposes no way to dump ART's profile. */
private const val MIN_CAPTURE_SDK = 28

private const val WAIT_MS = 5_000L

/**
 * The library is MediaStore-backed, so without these grants every journey after cold start
 * would profile the empty state instead of the grid it exists to warm up.
 */
private fun MacrobenchmarkScope.grantRuntimePermissions() {
    val permissions = listOf(
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.POST_NOTIFICATIONS",
    )
    permissions.forEach { permission ->
        runCatching { device.executeShellCommand("pm grant $packageName $permission") }
    }
}

private fun MacrobenchmarkScope.awaitAppWindow() {
    device.wait(Until.hasObject(By.pkg(packageName).depth(0)), WAIT_MS)
    device.waitForIdle()
}

private fun MacrobenchmarkScope.scrollLibraryGrid() {
    val grid = device.wait(Until.findObject(By.pkg(packageName).scrollable(true)), WAIT_MS) ?: return
    // Keep the gesture off the edges: the shell floats a nav pill over the bottom of the
    // route and the system back gesture owns the sides, either of which eats the fling.
    runCatching { grid.setGestureMarginPercentage(0.15f) }
    repeat(3) {
        runCatching { grid.fling(Direction.DOWN) }
        device.waitForIdle()
    }
    repeat(2) {
        runCatching { grid.fling(Direction.UP) }
        device.waitForIdle()
    }
}

/** Tiles carry the film's own name as their description, so match on shape, not on text. */
private fun MacrobenchmarkScope.openFilmDetail() {
    val tile = device.findObjects(By.pkg(packageName).clickable(true))
        .maxByOrNull { it.describedArea() }
        ?.takeIf { it.describedArea() > 0 }
        ?: return
    runCatching { tile.click() }
    device.wait(Until.hasObject(By.pkg(packageName).depth(0)), WAIT_MS)
    device.waitForIdle()
    device.pressBack()
    device.waitForIdle()
}

private fun MacrobenchmarkScope.openNowPlayingRemote() {
    tapLabelled("Remote", "Now playing", "Flicked from")
    device.waitForIdle()
}

private fun MacrobenchmarkScope.openMetricsAndSubtitlesSheets() {
    if (tapLabelled("Metrics", "Stream metrics", "Signal & quality")) {
        device.waitForIdle()
        device.pressBack()
        device.waitForIdle()
    }
    if (tapLabelled("Subs", "Subtitles")) {
        device.waitForIdle()
        device.pressBack()
        device.waitForIdle()
    }
}

private fun MacrobenchmarkScope.visitDevicesAndSettings() {
    tapLabelled("Devices")
    device.waitForIdle()
    tapLabelled("Settings")
    device.waitForIdle()
    tapLabelled("Library")
    device.waitForIdle()
}

/**
 * Clicks the first clickable node whose text or description contains any of the labels,
 * case-insensitively. Returns false when nothing matched so callers can move on: these are
 * product strings and are allowed to change without breaking profile generation.
 */
private fun MacrobenchmarkScope.tapLabelled(vararg labels: String): Boolean {
    val needles = labels.map { it.lowercase() }
    val target = device.findObjects(By.pkg(packageName).clickable(true)).firstOrNull { node ->
        val haystack = node.labelText()
        needles.any { haystack.contains(it) }
    } ?: return false
    return runCatching { target.click() }.isSuccess
}

/** UiObject2 reads go through the accessibility tree and throw once the node is recycled. */
private fun UiObject2.labelText(): String = runCatching {
    "${text.orEmpty()} ${contentDescription.orEmpty()}".lowercase()
}.getOrDefault("")

private fun UiObject2.describedArea(): Long = runCatching {
    visibleBounds.width().toLong() * visibleBounds.height().toLong()
}.getOrDefault(0L)
