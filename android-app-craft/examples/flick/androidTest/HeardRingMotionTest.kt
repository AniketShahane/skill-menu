package com.flick.receiver.ui

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.MotionDurationScale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.flick.receiver.ui.components.TvScrubBar
import com.flick.receiver.ui.theme.FlickColor
import com.flick.receiver.ui.theme.FlickTvTheme
import com.flick.receiver.ui.theme.LocalReducedMotion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.io.File
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * The heard ring at full motion: one amber ring at the playhead when a seek really
 * landed, none when `seeking` fell for any other reason.
 *
 * Amber is found by hue, saturation and brightness over a black ground. The knob is
 * white and sits inside the annulus's hole; the resting halo is amber at 34 %, which
 * the brightness floor rejects; the knob's anti-aliased rim over that halo is a pale
 * amber the saturation floor rejects; the played fill is amber and runs through the
 * head, so the track's own band is left out of every count.
 */
class HeardRingMotionTest {

    @get:Rule
    val composeRule = createComposeRule(
        effectContext = object : MotionDurationScale {
            override val scaleFactor = 1f
        },
    )

    private var confirmed by mutableLongStateOf(250_000L)
    private var target by mutableLongStateOf(300_000L)
    private var seeking by mutableStateOf(true)
    private lateinit var density: Density

    @Before
    fun freezeClock() {
        composeRule.mainClock.autoAdvance = false
    }

    private fun show(reduced: Boolean, focusRequester: FocusRequester? = null) {
        composeRule.setContent {
            density = LocalDensity.current
            FlickTvTheme {
                CompositionLocalProvider(LocalReducedMotion provides reduced) {
                    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                        Box(Modifier.size(800.dp, 40.dp).testTag(BAR), contentAlignment = Alignment.Center) {
                            TvScrubBar(
                                durationMs = 600_000L,
                                confirmedMs = confirmed,
                                bufferedMs = 0L,
                                targetMs = target,
                                seeking = seeking,
                                playing = false,
                                interactive = focusRequester != null,
                                focusRequester = focusRequester,
                            )
                        }
                    }
                }
            }
        }
        // Let the seek-in-flight swell and the playhead spring settle before landing.
        composeRule.mainClock.advanceTimeBy(600)
    }

    /** Lit amber pixels between [innerDp] and [outerDp] of the head, and their mean radius in dp. */
    private fun PixelMap.litRing(headFrac: Float, innerDp: Float, outerDp: Float): Pair<Int, Float> {
        val bar = composeRule.onNodeWithTag(BAR).fetchSemanticsNode().boundsInRoot
        val px = density.density
        val cy = bar.center.y
        val cx = bar.left + bar.width * headFrac
        val band = TRACK_BAND_DP * px
        val outer = outerDp * px
        var count = 0
        var radii = 0f
        for (y in (cy - outer).toInt()..(cy + outer).toInt() + 1) {
            if (abs(y - cy) <= band || y !in 0 until height) continue
            for (x in (cx - outer).toInt()..(cx + outer).toInt() + 1) {
                if (x !in 0 until width) continue
                val r = sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / px
                if (r <= innerDp || r > outerDp) continue
                val c = this[x, y]
                if (!isSparkHue(c) || max(c.red, max(c.green, c.blue)) <= LIT_VALUE) continue
                count++
                radii += r
            }
        }
        return count to if (count > 0) radii / count else 0f
    }

    private fun land(at: Long) {
        composeRule.runOnIdle {
            confirmed = at
            seeking = false
        }
    }

    private fun since(t0: Long) = composeRule.mainClock.currentTime - t0

    private fun advanceTo(t0: Long, ms: Long) {
        val left = ms - since(t0)
        if (left > 0) composeRule.mainClock.advanceTimeBy(left, ignoreFrameDuration = true)
    }

    private fun shot(test: String, t0: Long): PixelMap {
        val image = composeRule.onRoot().captureToImage()
        val dir = InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null)!!
        File(dir, "${test}_${since(t0)}.png").outputStream().use {
            image.asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        return image.toPixelMap()
    }

    /**
     * Amber light in the ring [innerDp]..[outerDp] around the head at [headFrac], or
     * anywhere along the bar when it is null: the count of lit pixels, and their summed
     * brightness, which still falls smoothly once a fading ring is too dim to count.
     */
    private fun PixelMap.amber(headFrac: Float?, innerDp: Float = 10f, outerDp: Float = 19f): Pair<Int, Float> {
        val bar = composeRule.onNodeWithTag(BAR).fetchSemanticsNode().boundsInRoot
        val px = density.density
        val cy = bar.center.y
        val inner = innerDp * px
        val outer = outerDp * px
        val band = TRACK_BAND_DP * px
        val cx = if (headFrac != null) bar.left + bar.width * headFrac else bar.center.x
        val reachX = if (headFrac != null) outer else bar.width / 2f + outer
        var count = 0
        var energy = 0f
        for (y in (cy - outer).toInt()..(cy + outer).toInt() + 1) {
            if (abs(y - cy) <= band || y !in 0 until height) continue
            for (x in (cx - reachX).toInt()..(cx + reachX).toInt() + 1) {
                if (x !in 0 until width) continue
                if (headFrac != null) {
                    val r = sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy))
                    if (r < inner || r > outer) continue
                }
                val c = this[x, y]
                if (!isSparkHue(c)) continue
                val v = max(c.red, max(c.green, c.blue))
                energy += v
                if (v > LIT_VALUE) count++
            }
        }
        return count to energy
    }

    @Test
    fun aConfirmedLandingRingsOnce() {
        show(reduced = false)
        land(300_100L)
        val t0 = composeRule.mainClock.currentTime
        val head = 300_100f / 600_000f
        val counts = mutableMapOf<Long, Int>()
        for (ms in listOf(80L, 160L, 320L, 560L, 720L, 800L)) {
            advanceTo(t0, ms)
            counts[ms] = shot("aConfirmedLandingRingsOnce", t0).amber(head).first
        }
        assertTrue("no ring at 160 ms: $counts", counts.getValue(160L) > 0)
        assertEquals("the ring outlived its envelope: $counts", 0, counts.getValue(800L))
    }

    /**
     * Around a focused knob the bar's own §3 ring occupies out to 14.5 dp (its outer
     * contour edge), and a landing ring starting at 11 dp would be drawn under it for
     * its brightest phase. Fired while focused it starts at 16.5 dp instead.
     */
    @Test
    fun aFocusedLandingRingsOutsideTheFocusRing() {
        val fr = FocusRequester()
        show(reduced = false, focusRequester = fr)
        composeRule.runOnIdle { fr.requestFocus() }
        composeRule.mainClock.advanceTimeBy(600)
        composeRule.waitForIdle()
        val head = 300_100f / 600_000f
        val before = composeRule.onRoot().captureToImage().toPixelMap().litRing(head, FOCUS_RING_OUTER_DP, 24f)
        assertEquals("amber outside the §3 ring before any landing: $before", 0, before.first)
        land(300_100L)
        val t0 = composeRule.mainClock.currentTime
        var gap: Pair<Int, Float>? = null
        var peak: Pair<Int, Float>? = null
        for (ms in listOf(40L, 80L, 120L, 158L, 200L, 320L, 480L, 640L, 800L)) {
            advanceTo(t0, ms)
            val px = shot("aFocusedLandingRingsOutsideTheFocusRing", t0)
            if (ms == 158L) {
                gap = px.litRing(head, FOCUS_RING_OUTER_DP, FOCUSED_LANDING_SPARK_INNER_DP)
                peak = px.litRing(head, FOCUSED_LANDING_START_DP, 24f)
            }
        }
        // The scan never reaches inside 14.5 dp: the §3 ring's own Spark stroke covers
        // 11.5-13.5 dp at full alpha and would swamp any count or mean taken there.
        assertEquals(
            "landing Spark inside 15.5 dp, where only its dark contour may meet the §3 ring's 14.5 dp edge: $gap",
            0, gap!!.first,
        )
        val (count, meanDp) = peak!!
        assertTrue("no landing ring outside the §3 ring at the envelope peak: $peak", count > 0)
        // landingRingRadius(11, 17, 16.5, chromeFade(t / 720), lift = 1) for t ≈ 126-158 ms,
        // one or two frames of start offset, with about half a dp either side.
        assertTrue("the landing ring sat at $meanDp dp", meanDp in 17.4f..19.2f)
    }

    @Test
    fun aDeadlineFallDrawsNothing() {
        show(reduced = false)
        // The 1.5 s deadline ends `seeking` with the clock short of the target. The
        // head then springs back to the clock, so the whole bar is searched.
        land(250_000L)
        val t0 = composeRule.mainClock.currentTime
        for (ms in listOf(80L, 160L, 320L, 560L, 720L)) {
            advanceTo(t0, ms)
            val (count, _) = shot("aDeadlineFallDrawsNothing", t0).amber(headFrac = null)
            assertEquals("a ring at $ms ms for a seek that never landed", 0, count)
        }
    }

    @Test
    fun reducedMotionDrawsNoRing() {
        show(reduced = true)
        land(300_100L)
        val t0 = composeRule.mainClock.currentTime
        for (ms in listOf(80L, 160L, 320L, 560L)) {
            advanceTo(t0, ms)
            val (count, _) = shot("reducedMotionDrawsNoRing", t0).amber(headFrac = null)
            assertEquals("a ring at $ms ms under reduced motion", 0, count)
        }
    }

    @Test
    fun aSecondLandingNeverCutsTheFirst() {
        show(reduced = false)
        land(300_100L)
        val t0 = composeRule.mainClock.currentTime
        val head = 300_600f / 600_000f
        advanceTo(t0, 384L)
        composeRule.runOnIdle {
            target = 300_500L
            seeking = true
        }
        advanceTo(t0, 400L)
        land(300_600L)
        // Frames from the second landing: the first ring is past ~16 dp and still
        // growing on its reach, the second is born at 11 dp. The write lands on the first frame and the new
        // ring's first animated frame is the one after, so the fourth frame is the
        // first where it is bright enough to count.
        val outer = mutableListOf<Float>()
        var bothAt: Pair<Int, Float>? = null
        repeat(5) { i ->
            composeRule.mainClock.advanceTimeByFrame()
            val px = shot("aSecondLandingNeverCutsTheFirst", t0)
            outer += px.amber(head, OUTER_FROM_DP, 19.5f).second
            if (i == 3) bothAt = px.amber(head, 10.5f, INNER_TO_DP).first to outer.last()
        }
        val (innerCount, outerEnergy) = bothAt!!
        assertTrue("the second ring is missing about 60 ms in", innerCount > 0)
        assertTrue("the first ring vanished about 60 ms in", outerEnergy > 0f)
        outer.zipWithNext().forEachIndexed { i, (a, b) ->
            // Summed energy, and the first ring is still growing on its reach: its
            // circumference adds ~0.6 % a frame while its per-pixel alpha barely moves on
            // the frame before the retire starts. More than that is a real brightening.
            assertTrue("the retiring ring brightened at frame $i: $outer", b <= a * 1.02f + 0.5f)
            assertTrue("the retiring ring cut to nothing at frame $i: $outer", b > 0f)
        }
        assertTrue("the retiring ring did not fade: $outer", outer.last() < outer.first())
    }

    private companion object {
        const val BAR = "scrub-bar"

        /** Half the 6 dp track, plus the anti-aliased edge of the played fill. */
        const val TRACK_BAND_DP = 4f

        /** Above the 34 % halo over black. */
        const val LIT_VALUE = 0.45f

        /** Spark is 0.88; white blended over the halo sits near 0.5. */
        const val MIN_SATURATION = 0.7f

        /**
         * Where the first ring, past ~16 dp by 400 ms and still growing, stands clear of a
         * newborn one. The whole of its 2 dp stroke (inner edge ~15.1 dp) must sit inside the
         * outer band, or its growth carries more stroke in and reads as brightening; the
         * second ring's outer edge stays under ~13 dp for the five frames judged.
         */
        const val OUTER_FROM_DP = 14f
        const val INNER_TO_DP = 14f

        /** 8 dp knob + 4.5 dp offset + 1 dp half-stroke + 1 dp contour. */
        const val FOCUS_RING_OUTER_DP = 14.5f

        /**
         * The §3 edge + 1 dp landing contour + 1 dp half-stroke: the landing ring's radius
         * at fire. Held here rather than read from production, so a regressed constant
         * cannot move the expectation with it.
         */
        const val FOCUSED_LANDING_START_DP = 16.5f

        /**
         * The landing ring's Spark stroke begins a half-stroke inside its radius, so at
         * fire it spans 15.5-17.5 dp; only its dark contour may sit between here and
         * the §3 edge.
         */
        const val FOCUSED_LANDING_SPARK_INNER_DP = 15.5f

        private val SPARK_HUE = hue(FlickColor.Spark)

        fun hue(c: Color): Float {
            val mx = max(c.red, max(c.green, c.blue))
            val mn = min(c.red, min(c.green, c.blue))
            val d = mx - mn
            if (d <= 0f) return -1f
            val h = when (mx) {
                c.red -> 60f * (((c.green - c.blue) / d) % 6f)
                c.green -> 60f * ((c.blue - c.red) / d + 2f)
                else -> 60f * ((c.red - c.green) / d + 4f)
            }
            return (h + 360f) % 360f
        }

        fun isSparkHue(c: Color): Boolean {
            val mx = max(c.red, max(c.green, c.blue))
            val mn = min(c.red, min(c.green, c.blue))
            if (mx <= 0.02f || (mx - mn) / mx < MIN_SATURATION) return false
            val h = hue(c)
            val delta = abs(h - SPARK_HUE).let { min(it, 360f - it) }
            return delta <= 8f
        }
    }
}
