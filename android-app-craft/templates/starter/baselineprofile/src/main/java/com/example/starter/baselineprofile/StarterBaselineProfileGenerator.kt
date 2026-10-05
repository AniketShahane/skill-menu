package com.example.starter.baselineprofile

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
 * Records the classes and methods ART should compile ahead of time.
 *
 * Every step is best-effort: it runs against whatever data the connected device has, and a
 * control that is not on screen is skipped, never failed. A short profile is still a valid
 * profile; an aborted run is not (flick:baselineprofile/sender/.../SenderBaselineProfileGenerator.kt:16-22).
 *
 * The journeys must perform the transitions that matter, or their code stays interpreted.
 * Paths no generator can reach (a flow that needs a second device, a paid backend) get
 * hand-written rules in app/src/main/baselineProfiles/ instead; see references/performance.md.
 * Regenerate after changing a hot screen: a profile names methods, and renamed or new methods
 * run interpreted until it is recorded again (flick@ac61e81).
 */
@RunWith(AndroidJUnit4::class)
class StarterBaselineProfileGenerator {

    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun startup() {
        assumeTrue(Build.VERSION.SDK_INT >= MIN_CAPTURE_SDK)
        rule.collect(packageName = TARGET_PACKAGE, includeInStartupProfile = true) {
            device.pressHome()
            startActivityAndWait()
            awaitAppWindow()
        }
    }

    @Test
    fun journeys() {
        assumeTrue(Build.VERSION.SDK_INT >= MIN_CAPTURE_SDK)
        rule.collect(packageName = TARGET_PACKAGE) {
            device.pressHome()
            startActivityAndWait()
            awaitAppWindow()

            flingMainList()
            openLargestTileAndReturn()
            visitTabs()
        }
    }
}

private const val TARGET_PACKAGE = "com.example.starter"

/** Below API 28 the platform exposes no way to dump ART's profile. */
private const val MIN_CAPTURE_SDK = 28

private const val WAIT_MS = 5_000L

/** Tab labels as the bottom bar exposes them (text or content description). */
private val TAB_LABELS = listOf("Settings", "Home")

private fun MacrobenchmarkScope.awaitAppWindow() {
    device.wait(Until.hasObject(By.pkg(packageName).depth(0)), WAIT_MS)
    device.waitForIdle()
}

private fun MacrobenchmarkScope.flingMainList() {
    val list = device.wait(Until.findObject(By.pkg(packageName).scrollable(true)), WAIT_MS) ?: return
    // Off the edges: the floating bar owns the bottom of the page and the back gesture owns the
    // sides, and either one eats the fling (flick:.../SenderBaselineProfileGenerator.kt:88-90).
    runCatching { list.setGestureMarginPercentage(0.15f) }
    repeat(3) {
        runCatching { list.fling(Direction.DOWN) }
        device.waitForIdle()
    }
    repeat(2) {
        runCatching { list.fling(Direction.UP) }
        device.waitForIdle()
    }
}

/** Cards carry their own content as labels, so match on shape: the largest clickable node. */
private fun MacrobenchmarkScope.openLargestTileAndReturn() {
    val tile = device.findObjects(By.pkg(packageName).clickable(true))
        .maxByOrNull { it.visibleArea() }
        ?.takeIf { it.visibleArea() > 0 }
        ?: return
    runCatching { tile.click() }
    device.wait(Until.hasObject(By.pkg(packageName).depth(0)), WAIT_MS)
    device.waitForIdle()
    device.pressBack()
    device.waitForIdle()
}

private fun MacrobenchmarkScope.visitTabs() {
    for (label in TAB_LABELS) {
        if (tapLabelled(label)) device.waitForIdle()
    }
}

/**
 * Clicks the first clickable node whose text or description contains any of [labels],
 * case-insensitively. Returns false when nothing matched, so a renamed product string skips a
 * step instead of failing the run (flick:.../SenderBaselineProfileGenerator.kt:141-153).
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

private fun UiObject2.visibleArea(): Long = runCatching {
    visibleBounds.width().toLong() * visibleBounds.height().toLong()
}.getOrDefault(0L)
