package com.flick.baselineprofile.sender

import androidx.benchmark.macro.BaselineProfileMode
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.StaleObjectException
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SenderLibraryScrollBenchmark {

    @get:Rule
    val rule = MacrobenchmarkRule()

    @Test
    fun darkLibraryGridFrameTiming() {
        rule.measureRepeated(
            packageName = SENDER_PACKAGE_NAME,
            metrics = listOf(FrameTimingMetric()),
            compilationMode = CompilationMode.Partial(BaselineProfileMode.Require),
            iterations = ITERATIONS,
            setupBlock = {
                grantMediaPermissions()
                startActivityAndWait()
                awaitAppWindow()
                selectDarkAppearance()
                openLibrary()
                closeSearchIfOpen()
                awaitLibraryRead()
                showAllVideosIfFolderScoped()
                awaitLibraryRead()
                scrollLibraryToTop()
                check(withFreshLibraryGrid { it.fling(Direction.DOWN) }) {
                    "The library scroll benchmark needs enough media for more than one full fling"
                }
                device.waitForIdle()
                scrollLibraryToTop()
            },
        ) {
            repeat(FLING_PAIRS) {
                flingLibrary(Direction.DOWN)
                flingLibrary(Direction.UP)
            }
        }
    }
}

private const val SENDER_PACKAGE_NAME = "com.flick.sender"
private const val LIBRARY_GRID_TEST_TAG = "library_grid"
private const val ITERATIONS = 10
private const val FLING_PAIRS = 1
private const val WAIT_MS = 5_000L
private const val LIBRARY_WAIT_MS = 20_000L
private const val MAX_RESET_SCROLLS = 40

private fun MacrobenchmarkScope.grantMediaPermissions() {
    listOf(
        "android.permission.READ_MEDIA_VIDEO",
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.POST_NOTIFICATIONS",
    ).forEach { permission ->
        runCatching { device.executeShellCommand("pm grant $packageName $permission") }
    }
}

private fun MacrobenchmarkScope.awaitAppWindow() {
    check(device.wait(Until.hasObject(By.pkg(packageName).depth(0)), WAIT_MS)) {
        "Flick did not expose its app window within ${WAIT_MS}ms"
    }
    device.waitForIdle()
}

private fun MacrobenchmarkScope.selectDarkAppearance() {
    requireBottomLabel("Settings").click()
    device.waitForIdle()

    requireClickableLabel("Dark").click()
    device.waitForIdle()
    check(requireClickableLabel("Dark").isChecked) {
        "Dark appearance did not become selected"
    }
}

private fun MacrobenchmarkScope.openLibrary() {
    requireBottomLabel("Library").click()
    device.waitForIdle()
    requireLibraryGrid()
}

private fun MacrobenchmarkScope.closeSearchIfOpen() {
    repeat(2) {
        val close = findClickableLabel("Clear search", "Close search") ?: return
        close.click()
        device.waitForIdle()
    }
}

private fun MacrobenchmarkScope.showAllVideosIfFolderScoped() {
    val folderChip = findClickableLabel("Choose a different folder") ?: return
    folderChip.click()
    check(device.wait(Until.hasObject(By.text("Show videos from")), WAIT_MS)) {
        "The library folder sheet did not open"
    }
    requireClickableLabel("All videos").click()
    check(device.wait(Until.gone(By.text("Show videos from")), WAIT_MS)) {
        "The library folder sheet did not close"
    }
    device.waitForIdle()
}

private fun MacrobenchmarkScope.awaitLibraryRead() {
    check(device.wait(Until.gone(By.textContains("READING YOUR LIBRARY")), LIBRARY_WAIT_MS)) {
        "The MediaStore library read did not finish within ${LIBRARY_WAIT_MS}ms"
    }
    check(!device.hasObject(By.text("Nothing to flick yet"))) {
        "The benchmark requires MediaStore videos on the connected phone"
    }
    check(!device.hasObject(By.textContains("Flick can't see your videos yet"))) {
        "The benchmark could not grant access to the phone's MediaStore videos"
    }
    device.waitForIdle()
}

private fun MacrobenchmarkScope.requireLibraryGrid(): UiObject2 =
    requireNotNull(
        device.wait(
            Until.findObject(By.res(LIBRARY_GRID_TEST_TAG).scrollable(true)),
            WAIT_MS,
        ),
    ) {
        "The Library route did not expose its tagged, scrollable grid"
    }.also { grid ->
        // The floating nav and the system gesture regions must not intercept a measured fling.
        grid.setGestureMarginPercentage(0.15f)
    }

private fun MacrobenchmarkScope.scrollLibraryToTop() {
    repeat(MAX_RESET_SCROLLS) {
        if (!withFreshLibraryGrid { it.scroll(Direction.UP, 1f) }) {
            device.waitForIdle()
            return
        }
    }
    error("The library grid did not reach its first item after $MAX_RESET_SCROLLS scrolls")
}

private fun MacrobenchmarkScope.flingLibrary(direction: Direction) {
    // False means the fling reached that edge, not that the gesture failed.
    withFreshLibraryGrid { it.fling(direction) }
    device.waitForIdle()
}

private inline fun MacrobenchmarkScope.withFreshLibraryGrid(
    gesture: (UiObject2) -> Boolean,
): Boolean {
    var stale: StaleObjectException? = null
    repeat(3) {
        try {
            return gesture(requireLibraryGrid())
        } catch (failure: StaleObjectException) {
            stale = failure
        }
    }
    throw checkNotNull(stale)
}

private fun MacrobenchmarkScope.requireBottomLabel(label: String): UiObject2 =
    requireNotNull(
        device.wait(Until.hasObject(By.text(label)), WAIT_MS)
            .takeIf { it }
            ?.let { device.findObjects(By.text(label)) }
            ?.maxByOrNull { it.safeCenterY() },
    ) { "Could not find the $label navigation label" }
        .requireClickableAncestor(label)

private fun MacrobenchmarkScope.requireClickableLabel(vararg labels: String): UiObject2 =
    requireNotNull(
        labels.firstNotNullOfOrNull { label ->
            device.wait(Until.findObject(By.text(label)), WAIT_MS)
                ?.clickableAncestor()
        } ?: findClickableLabel(*labels),
    ) {
        "Could not find clickable control labelled ${labels.joinToString()}"
    }

private fun MacrobenchmarkScope.findClickableLabel(vararg labels: String): UiObject2? {
    val needles = labels.map { it.lowercase() }
    return device.findObjects(By.pkg(packageName).clickable(true)).firstOrNull { node ->
        val haystack = node.labelText()
        needles.any(haystack::contains)
    }
}

private fun UiObject2.labelText(): String = runCatching {
    "${text.orEmpty()} ${contentDescription.orEmpty()}".lowercase()
}.getOrDefault("")

private fun UiObject2.safeCenterY(): Int = runCatching { visibleBounds.centerY() }.getOrDefault(0)

private fun UiObject2.requireClickableAncestor(label: String): UiObject2 =
    requireNotNull(clickableAncestor()) { "The $label label had no clickable parent" }

private fun UiObject2.clickableAncestor(): UiObject2? {
    var node: UiObject2? = this
    repeat(6) {
        val current = node ?: return null
        if (runCatching { current.isClickable }.getOrDefault(false)) return current
        node = runCatching { current.parent }.getOrNull()
    }
    return null
}
