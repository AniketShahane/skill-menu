package com.flick.receiver.ui.theme

import androidx.compose.animation.core.SnapSpec
import androidx.compose.animation.core.TargetBasedAnimation
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.tween
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class MotionTokensTest {

    @Test fun filmExitSpansSixFilmFrames() {
        assertTrue(FlickMotion.FILM_EXIT_MS * 24 / 1000 >= 6)
    }

    @Test fun filmRevealSpansSeventeenFilmFrames() {
        assertTrue(FlickMotion.FILM_REVEAL_MS >= 17 * FILM_FRAME_MS)
    }

    @Test fun filmRevealStepsAtMostTenPercentPerFilmFrame() {
        val animation = TargetBasedAnimation(
            FlickMotion.filmReveal<Float>(),
            Float.VectorConverter,
            0f,
            1f,
        )
        var previous = 0f
        var maxStep = 0f
        var t = 0L
        while (t <= animation.durationNanos + FILM_FRAME_NANOS) {
            val value = animation.getValueFromNanos(t)
            maxStep = maxOf(maxStep, value - previous)
            previous = value
            t += FILM_FRAME_NANOS
        }
        assertEquals(1f, previous, 0.0001f)
        assertTrue("max step $maxStep", maxStep <= 0.101f)
    }

    @Test fun burstExitFinishesBeforeTheDeltaClears() {
        assertTrue(FlickMotion.TV_BURST_EXIT_MS < FlickMotion.SEEK_DELTA_CLEAR_MS)
    }

    @Test fun bandHandoverIsTheChromeExit() {
        assertEquals(FlickMotion.CHROME_FADE_OUT_MS, FlickMotion.BAND_HANDOVER_MS)
    }

    @Test fun orSnapSnapsOnlyUnderReducedMotion() {
        assertTrue(FlickMotion.orSnap(true, tween<Float>()) is SnapSpec)
        val spec = FlickMotion.crossDissolve<Float>()
        assertSame(spec, FlickMotion.orSnap(false, spec))
    }

    @Test fun landingRingEnvelopePeaksAtTheBurstPeak() {
        val ring = TargetBasedAnimation(FlickMotion.tvBurstAlpha(), Float.VectorConverter, 0f, 0f)
        assertEquals(1f, ring.getValueFromNanos(158 * NANOS_PER_MS), 0.01f)
        assertEquals(0f, ring.getValueFromNanos(0L), 0.01f)
        assertEquals(0f, ring.getValueFromNanos(720 * NANOS_PER_MS), 0.01f)
    }

    private companion object {
        const val FILM_FRAME_MS = 41.67
        const val FILM_FRAME_NANOS = 41_670_000L
        const val NANOS_PER_MS = 1_000_000L
    }
}
