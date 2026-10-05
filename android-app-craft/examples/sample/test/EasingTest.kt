// Shows: pinning named easing curves down as numbers, so picking the wrong one has to argue
// with a test first, plus a per-frame speed cap at a target refresh rate.
// Example written for this skill; read it, don't paste it.
package com.example.app.ui.motion

import androidx.compose.animation.core.Easing
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [ItemEase] holds three named curves used across the item list and its detail page:
 * - Enter: a page arriving from off screen. Front-loaded on purpose — the sprint at the start
 *   is where nobody is looking yet.
 * - Carry: a thumbnail growing into a full page. Watched from its first frame, so it must start
 *   gently instead of leaping, unlike Enter.
 * - Settle: a whole screen's worth of content sliding, budgeted by how far it can move in one
 *   frame at the device's refresh rate.
 *
 * Writing the shape down as assertions is what catches a curve swap days later: a card growing
 * into its detail page on Enter instead of Carry looks identical in a screenshot and wrong in
 * motion, because Enter is already most of the way home before the eye finds it.
 */
class EasingTest {
    private fun Easing.at(fraction: Float) = transform(fraction)

    private val all = listOf(ItemEase.Enter, ItemEase.Carry, ItemEase.Settle)

    @Test
    fun `every curve starts at nothing and ends at everything`() {
        for (easing in all) {
            assertEquals(0f, easing.at(0f), 0.001f)
            assertEquals(1f, easing.at(1f), 0.001f)
        }
    }

    @Test
    fun `every curve only moves forward, never backward`() {
        for (easing in all) {
            var previous = -1f
            for (step in 0..100) {
                val value = easing.at(step / 100f)
                assertTrue("went backwards at step $step", value >= previous - 0.0005f)
                previous = value
            }
        }
    }

    /** The fact itself, pinned down so a regression has to come here and argue. */
    @Test
    fun `enter really is front-loaded`() {
        assertTrue("first twentieth was ${ItemEase.Enter.at(.05f)}", ItemEase.Enter.at(.05f) > .35f)
    }

    /** The opposite shape, on purpose: a growing thumbnail must not appear to leap. */
    @Test
    fun `carry begins gently instead of leaping`() {
        assertTrue("first twentieth was ${ItemEase.Carry.at(.05f)}", ItemEase.Carry.at(.05f) < .10f)
        assertTrue("first fifth was ${ItemEase.Carry.at(.2f)}", ItemEase.Carry.at(.2f) < .60f)
    }

    @Test
    fun `carry still lands softly rather than stopping dead`() {
        assertTrue("three quarters was ${ItemEase.Carry.at(.75f)}", ItemEase.Carry.at(.75f) > .90f)
    }

    /** Two curves for two jobs; collapsing them back into one recreates the "it snaps" bug. */
    @Test
    fun `enter and carry differ where it counts, in the first frames`() {
        val earlyGap = ItemEase.Enter.at(.05f) - ItemEase.Carry.at(.05f)
        assertTrue("curves differ by only $earlyGap early on", earlyGap > .25f)
    }

    /** The furthest a [widthPx]-wide screen moves in a single frame at [hz], over [millis]. */
    private fun fastestFramePx(easing: Easing, millis: Int, widthPx: Float = 1_080f, hz: Float = 120f): Float {
        val frame = (1_000f / hz) / millis
        var fastest = 0f
        var at = 0f
        while (at < 1f) {
            val next = minOf(1f, at + frame)
            fastest = maxOf(fastest, (easing.at(next) - easing.at(at)) * widthPx)
            at = next
        }
        return fastest
    }

    /**
     * A late frame on a fast-moving curve shows as a visible jump, so Settle's worst single
     * frame is capped well under a third of the screen width at 120 Hz.
     */
    @Test
    fun `a full-width slide never moves far in any one frame`() {
        val worst = fastestFramePx(ItemEase.Settle, ItemMotion.LIST_SLIDE_MILLIS)
        assertTrue("fastest frame moved $worst px", worst < 100f)
    }
}
