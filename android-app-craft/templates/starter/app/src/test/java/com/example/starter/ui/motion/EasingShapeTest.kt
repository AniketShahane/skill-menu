package com.example.starter.ui.motion

import androidx.compose.animation.core.Easing
import com.example.starter.ui.nav.NavMotion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The shapes of the app's named curves, held as facts (ported from dash DashEasingTest.kt).
 *
 * The bug this would have caught: every transition used emphasized-decelerate, already 45 % done
 * in its first twentieth. Right for an arrival from off screen — the sprint is where nobody looks.
 * Wrong for a card growing into a page, where the whole journey is watched: it is most of the way
 * there before the eye finds it, then creeps. That is what "it snaps" described (dash@42b59ff).
 */
class EasingShapeTest {
    private fun Easing.at(fraction: Float) = transform(fraction)

    private val all = listOf(Easings.Arrive, Easings.Travel, Easings.Flight, Easings.Fade, Easings.Glide)

    @Test
    fun `every curve starts at nothing and ends at everything`() {
        for (easing in all) {
            assertEquals(0f, easing.at(0f), 0.001f)
            assertEquals(1f, easing.at(1f), 0.001f)
        }
    }

    @Test
    fun `every curve only ever moves forwards`() {
        for (easing in all) {
            var previous = -1f
            for (step in 0..100) {
                val value = easing.at(step / 100f)
                assertTrue("went backwards at $step", value >= previous - 0.0005f)
                previous = value
            }
        }
    }

    /** Written down as a fact, so reaching for it again has to come here and argue first. */
    @Test
    fun `the arrive curve really is as front-loaded as its name promises`() {
        assertTrue("first twentieth covered ${Easings.Arrive.at(.05f)}", Easings.Arrive.at(.05f) > .35f)
        assertTrue("first fifth covered ${Easings.Arrive.at(.2f)}", Easings.Arrive.at(.2f) > .70f)
    }

    /** A shape changing into another is watched from its first frame, so those frames must be worth watching. */
    @Test
    fun `the travel curve begins gently instead of leaping`() {
        assertTrue("first twentieth covered ${Easings.Travel.at(.05f)}", Easings.Travel.at(.05f) < .10f)
        assertTrue("first tenth covered ${Easings.Travel.at(.1f)}", Easings.Travel.at(.1f) < .25f)
        assertTrue("first fifth covered ${Easings.Travel.at(.2f)}", Easings.Travel.at(.2f) < .60f)
    }

    @Test
    fun `the travel curve still lands softly rather than stopping dead`() {
        assertTrue("three quarters covered ${Easings.Travel.at(.75f)}", Easings.Travel.at(.75f) > .90f)
        assertTrue("${1f - Easings.Travel.at(.95f)} left at the end", 1f - Easings.Travel.at(.95f) < .05f)
    }

    @Test
    fun `travel is never further ahead than arrive`() {
        for (step in 0..100) {
            val fraction = step / 100f
            assertTrue(
                "at $fraction travel was ${Easings.Travel.at(fraction)} and arrive ${Easings.Arrive.at(fraction)}",
                Easings.Travel.at(fraction) <= Easings.Arrive.at(fraction) + 0.005f,
            )
        }
    }

    /** Two curves for two jobs. Collapsing them back into one re-creates the bug. */
    @Test
    fun `arrive and travel differ where it counts`() {
        val earlyGap = Easings.Arrive.at(.05f) - Easings.Travel.at(.05f)
        assertTrue("they differ by only $earlyGap in the first twentieth", earlyGap > .25f)
    }

    /** A dozen pieces must be seen to leave together, without Arrive's sprint landing them unseen. */
    @Test
    fun `flight is brisker than travel and gentler than arrive`() {
        for (fraction in listOf(.02f, .05f, .1f, .2f, .3f, .4f)) {
            assertTrue("at $fraction flight ${Easings.Flight.at(fraction)} vs travel ${Easings.Travel.at(fraction)}",
                Easings.Flight.at(fraction) > Easings.Travel.at(fraction))
            assertTrue("at $fraction flight ${Easings.Flight.at(fraction)} vs arrive ${Easings.Arrive.at(fraction)}",
                Easings.Flight.at(fraction) < Easings.Arrive.at(fraction))
        }
    }

    /** The furthest a page on [easing] moves in one [hz] frame, crossing [widthPx] in [millis]. */
    private fun fastestFramePx(easing: Easing, millis: Int, widthPx: Float = 1440f, hz: Float = 120f): Float {
        val frame = (1000f / hz) / millis
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
     * A tab page slides a whole screen. Its fastest frame is where a late frame shows as a jump,
     * so that frame is kept under 100 px on a 1440 px phone at 120 Hz, and well under what 300 ms
     * on Travel asked for.
     */
    @Test
    fun `a tab page never moves far in any one frame`() {
        val glide = fastestFramePx(Easings.Glide, NavMotion.TAB_MILLIS)
        val before = fastestFramePx(Easings.Travel, 300)
        assertTrue("fastest frame moved $glide px", glide < 100f)
        assertTrue("fastest frame moved $glide px against $before before", glide < before * .6f)
    }

    /** The first frames pay for building the arriving page; they should hardly move it. */
    @Test
    fun `a tab page starts gently and lands softly`() {
        assertTrue("first tenth covered ${Easings.Glide.at(.1f)}", Easings.Glide.at(.1f) < .06f)
        assertTrue("three quarters covered ${Easings.Glide.at(.75f)}", Easings.Glide.at(.75f) > .94f)
    }

    /**
     * The page's end of a piece fades in over the first stretch of the flight. By the time that
     * fade is done the piece must be nearly home, or the page's look lands on something still the
     * card's size.
     */
    @Test
    fun `a piece is nearly home by the time its look has changed`() {
        val fadeDone = NavMotion.PIECE_FADE_MILLIS.toFloat() / NavMotion.MORPH_BOUNDS_MILLIS
        assertTrue("only ${Easings.Flight.at(fadeDone)} of the way at $fadeDone", Easings.Flight.at(fadeDone) > .85f)
    }
}
