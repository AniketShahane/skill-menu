// Shows: proving an infinitely looping animation actually stops when it should, on the real
// clock rather than a frozen one, by counting frame writes instead of trusting a screenshot.
// Example written for this skill; read it, don't paste it.
package com.example.app

import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The item list's loading placeholder loops a shimmer while data is fetched. A frozen-clock
 * pixel test can show that one frame of the loop looks right, but it cannot show that the loop
 * *stops* once the activity leaves RESUMED — a loop that keeps animating off screen burns battery
 * and keeps the Compose clock busy for no visible reason. That claim needs the real clock, not a
 * frozen one, so this test toggles the actual animator scale and counts real frame writes.
 */
@RunWith(AndroidJUnit4::class)
class LoopMotionTest {
    @get:Rule val activity = createAndroidComposeRule<MainActivity>()

    @Test
    fun theShimmerStopsWritingFramesOnceTheActivityIsNotResumed() {
        EmulatorSupport.withSetting("global", "animator_duration_scale", "1") {
            activity.waitForIdle()
            EmulatorSupport.tap(activity, Tags.refreshButton)
            activity.waitForIdle()

            val writes = AtomicInteger(0)
            val observer = Snapshot.registerApplyObserver { changed, _ ->
                if (changed.any { it === ShimmerClock.frameState }) writes.incrementAndGet()
            }
            try {
                // While RESUMED, the loop is expected to keep writing new frames.
                Thread.sleep(400)
                assertTrue("the shimmer should still be animating", writes.get() > 0)

                // Send the activity to the background: the loop must stop writing frames, not
                // merely stop being visible. A loop that keeps running off screen is the bug.
                activity.activityRule.scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED)
                val atBackground = writes.get()
                Thread.sleep(400)
                assertEquals(
                    "the shimmer kept animating outside RESUMED",
                    atBackground,
                    writes.get(),
                )
            } finally {
                observer.dispose()
                activity.activityRule.scenario.moveToState(androidx.lifecycle.Lifecycle.State.RESUMED)
            }
        }
    }
}
