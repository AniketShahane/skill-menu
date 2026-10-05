package com.example.starter.baselineprofile

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

/**
 * Frame timing of the main list's fling, the number to regress against.
 *
 *   ./gradlew :baselineprofile:connectedBenchmarkReleaseAndroidTest
 *
 * `Partial(BaselineProfileMode.Require)` measures the build the way a user gets it: compiled from
 * the committed profile, and failing if there is none rather than quietly measuring JIT code.
 * Preconditions fail loudly with check(): a benchmark that silently measured an empty list is
 * worse than none (flick:baselineprofile/sender/.../SenderLibraryScrollBenchmark.kt:24-54).
 * Read P99 frameOverrunMs, not P50: one long frame is the stutter a user reports.
 */
@RunWith(AndroidJUnit4::class)
class StarterScrollBenchmark {

    @get:Rule
    val rule = MacrobenchmarkRule()

    @Test
    fun mainListFling() {
        rule.measureRepeated(
            packageName = BENCHMARK_PACKAGE,
            metrics = listOf(FrameTimingMetric()),
            compilationMode = CompilationMode.Partial(BaselineProfileMode.Require),
            iterations = ITERATIONS,
            setupBlock = {
                startActivityAndWait()
                check(device.wait(Until.hasObject(By.pkg(packageName).depth(0)), WAIT_MS)) {
                    "The app did not show its window within ${WAIT_MS}ms"
                }
                device.waitForIdle()
                scrollToTop()
                check(withFreshList { it.fling(Direction.DOWN) }) {
                    "The benchmark needs a list longer than one fling"
                }
                device.waitForIdle()
                scrollToTop()
            },
        ) {
            withFreshList { it.fling(Direction.DOWN) }
            device.waitForIdle()
            withFreshList { it.fling(Direction.UP) }
            device.waitForIdle()
        }
    }
}

private const val BENCHMARK_PACKAGE = "com.example.starter"
private const val ITERATIONS = 10
private const val WAIT_MS = 5_000L
private const val MAX_RESET_SCROLLS = 40

private fun MacrobenchmarkScope.requireList(): UiObject2 =
    requireNotNull(device.wait(Until.findObject(By.pkg(packageName).scrollable(true)), WAIT_MS)) {
        "The start page exposed no scrollable list"
    }.also { list ->
        // The floating bar and the system gesture regions must not intercept a measured fling.
        list.setGestureMarginPercentage(0.15f)
    }

private fun MacrobenchmarkScope.scrollToTop() {
    repeat(MAX_RESET_SCROLLS) {
        // False means the list reached its edge, not that the gesture failed.
        if (!withFreshList { it.scroll(Direction.UP, 1f) }) {
            device.waitForIdle()
            return
        }
    }
    error("The list did not reach its first item after $MAX_RESET_SCROLLS scrolls")
}

/** A recomposed list hands uiautomator a new node; look it up again instead of failing. */
private inline fun MacrobenchmarkScope.withFreshList(gesture: (UiObject2) -> Boolean): Boolean {
    var stale: StaleObjectException? = null
    repeat(3) {
        try {
            return gesture(requireList())
        } catch (failure: StaleObjectException) {
            stale = failure
        }
    }
    throw checkNotNull(stale)
}
