package com.example.starter

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.State
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.MotionDurationScale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.starter.ui.motion.AnimatedNumber
import com.example.starter.ui.motion.Easings
import com.example.starter.ui.motion.LocalReducedMotion
import com.example.starter.ui.motion.Reveal
import com.example.starter.ui.motion.RevealSession
import com.example.starter.ui.motion.rememberRevealProgress
import com.example.starter.ui.theme.AppText
import com.example.starter.ui.theme.AppTheme
import com.example.starter.ui.theme.ThemePreference
import java.util.UUID
import kotlin.math.roundToInt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Motion measured at exact instants instead of judged by eye (flick:receiver/androidTest/
 * HeardRingMotionTest.kt:57-72; examples/flick/androidTest/HeardRingMotionTest.kt).
 *
 * - The rule's effect context supplies the [MotionDurationScale], because the device's scale is
 *   not something a test can count on. `scripts/test-emulator.sh` runs `am instrument
 *   --no-window-animation`, which sets it to 0 for the run; Gradle's `connectedAndroidTest` does
 *   the same through `animationsDisabled = true`; a bare `am instrument` gets whatever the AVD
 *   has. At 0, every animation lands on its first frame and every assertion below passes on nothing.
 * - The main clock is frozen and advanced to chosen instants, so a sample at 300 ms is 300 ms.
 * - Reduced motion is modelled the way a device produces it. "Remove animations" sets the
 *   animator scale to 0, Compose scales every finite spec by it (so Reveal, draw-ins and
 *   count-ups land at once), and [LocalReducedMotion] covers what a scale cannot (loops, one-frame
 *   cuts). The reduced case sets both; the full-motion cases set scale 1 and the flag false.
 *
 * Each case asserts three things: it moves, it only moves one way, and it lands exactly.
 */
@RunWith(AndroidJUnit4::class)
class MotionClockTest {
    /** Read by Compose as each animation starts, so a test sets it before showing content. */
    private var durationScale = 1f

    @get:Rule
    val compose = createComposeRule(
        effectContext = object : MotionDurationScale {
            override val scaleFactor: Float get() = durationScale
        },
    )

    private val clock get() = compose.mainClock

    @Before fun freezeTheClock() {
        clock.autoAdvance = false
    }

    @Test fun aRevealProgressRisesAlongItsCurveAndLandsOnOne() {
        lateinit var progress: State<Float>
        show(reduced = false) {
            progress = rememberRevealProgress(uniqueKey(), durationMillis = 1_000, easing = Easings.Arrive, always = true)
        }
        val t0 = clock.currentTime
        val samples = SAMPLE_MILLIS.map { ms -> advanceTo(t0, ms); ms to compose.runOnUiThread { progress.value } }

        assertOneWay("reveal progress", samples.map { it.second }, rising = true)
        val at300 = samples.first { it.first == 300L }.second
        assertTrue("in flight at 300 ms, was $at300", at300 > 0f && at300 < 1f)
        assertEquals("lands exactly on 1", 1f, samples.last().second, 0f)
        // The animation starts on the first frame after its effect launches, up to ~3 frames after
        // t0; each sample must sit on the curve somewhere in that window.
        for ((ms, value) in samples.filter { it.first <= 1_000L }) {
            val latest = Easings.Arrive.transform(((ms - START_SLACK_MS) / 1_000f).coerceIn(0f, 1f))
            val earliest = Easings.Arrive.transform((ms / 1_000f).coerceIn(0f, 1f))
            assertTrue("at $ms ms, $value is off the curve [$latest, $earliest]", value in (latest - .01f)..(earliest + .01f))
        }
    }

    @Test fun aRevealRisesIntoPlaceOnceAndStops() {
        val key = uniqueKey()
        show(reduced = false) { RevealSession(key) { Reveal(revealKey = key) { Probe() } } }
        val t0 = clock.currentTime
        val samples = (SAMPLE_MILLIS + LANDED_MILLIS).map { ms -> advanceTo(t0, ms); probe() }

        val tops = samples.map { it.top }
        val light = samples.map { it.light }
        assertOneWay("probe top", tops, rising = false, slack = .5f)
        assertOneWay("probe light", light, rising = true, slack = light.last() * .005f)
        assertTrue(
            "a Reveal must move: first sample ${samples.first()}, landed ${samples.last()}",
            tops.first() - tops.last() > 1f || light.first() < light.last() * .95f,
        )
        val (settled, later) = samples.takeLast(2)
        assertEquals("still moving at ${SAMPLE_MILLIS.last()} ms", settled.top, later.top, .5f)
    }

    @Test fun anAnimatedNumberCountsUpOneWayAndLandsOnItsValue() {
        val key = uniqueKey()
        val painted = mutableListOf<Double>()
        show(reduced = false) {
            RevealSession(key) {
                AnimatedNumber(
                    value = TARGET,
                    style = AppText.heroNumber,
                    color = Color.White,
                    format = { value -> synchronized(painted) { painted += value }; value.roundToInt().toString() },
                )
            }
        }
        val t0 = clock.currentTime
        val samples = (SAMPLE_MILLIS + LANDED_MILLIS).map { ms -> advanceTo(t0, ms); lastPainted(painted) }

        assertOneWay("painted value", samples.map { it.toFloat() }, rising = true)
        val at300 = samples[SAMPLE_MILLIS.indexOf(300L)]
        assertTrue("counting at 300 ms, was $at300", at300 > 0.0 && at300 < TARGET)
        assertEquals("lands exactly on its value", TARGET, samples.last(), 0.0)
    }

    @Test fun reducedMotionLandsEverythingAtOnce() {
        val key = uniqueKey()
        lateinit var progress: State<Float>
        val painted = mutableListOf<Double>()
        show(reduced = true) {
            RevealSession(key) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    progress = rememberRevealProgress(uniqueKey(), durationMillis = 1_000, always = true)
                    Reveal(revealKey = key) { Probe() }
                    AnimatedNumber(
                        value = TARGET,
                        style = AppText.heroNumber,
                        color = Color.White,
                        format = { value -> synchronized(painted) { painted += value }; value.roundToInt().toString() },
                    )
                }
            }
        }
        val t0 = clock.currentTime
        advanceTo(t0, TWO_FRAMES_MS)
        val early = probe()
        assertEquals("progress under reduced motion", 1f, compose.runOnUiThread { progress.value }, 0f)
        assertEquals("number under reduced motion", TARGET, lastPainted(painted), 0.0)
        advanceTo(t0, 600L)
        val later = probe()
        assertEquals("a Reveal moved after landing under reduced motion", early.top, later.top, .5f)
        assertEquals("a Reveal kept fading under reduced motion", early.light, later.light, early.light * .005f)
    }

    // ---- Harness ----

    private fun show(reduced: Boolean, content: @Composable () -> Unit) {
        durationScale = if (reduced) 0f else 1f
        compose.setContent {
            AppTheme(preference = ThemePreference.DARK) {
                CompositionLocalProvider(LocalReducedMotion provides reduced) {
                    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                        content()
                    }
                }
            }
        }
        // The first frame: effects launch here, and every sample is timed from it.
        clock.advanceTimeByFrame()
    }

    private fun advanceTo(t0: Long, ms: Long) {
        val left = ms - (clock.currentTime - t0)
        if (left > 0) clock.advanceTimeBy(left, ignoreFrameDuration = true)
    }

    @Composable private fun Probe() {
        Box(Modifier.size(PROBE_DP.dp).background(Color.White).testTag(PROBE_TAG))
    }

    private data class ProbeSample(val top: Float, val light: Float)

    /**
     * Where the probe is (its bounds include the Reveal's layer transform) and how much white it
     * paints (its fade and scale). Either can carry a Reveal; both only ever move one way.
     */
    private fun probe(): ProbeSample {
        val top = compose.onNodeWithTag(PROBE_TAG).fetchSemanticsNode().boundsInRoot.top
        val pixels = compose.onRoot().captureToImage().toPixelMap()
        var light = 0f
        for (y in 0 until pixels.height step 2) for (x in 0 until pixels.width step 2) {
            val c = pixels[x, y]
            light += c.red + c.green + c.blue
        }
        return ProbeSample(top, light)
    }

    /**
     * The value AnimatedNumber last painted. Capturing the window forces a draw at the current
     * instant, and the count-up formats its running value in the draw phase.
     */
    private fun lastPainted(painted: MutableList<Double>): Double {
        compose.onRoot().captureToImage()
        return synchronized(painted) { painted.last() }
    }

    private fun assertOneWay(what: String, values: List<Float>, rising: Boolean, slack: Float = 1e-4f) {
        values.zipWithNext().forEachIndexed { i, (a, b) ->
            val ok = if (rising) b >= a - slack else b <= a + slack
            assertTrue("$what turned back at sample $i: $values", ok)
        }
    }

    private fun uniqueKey() = "motion-clock-${UUID.randomUUID()}"

    private companion object {
        const val PROBE_TAG = "motion_probe"
        const val PROBE_DP = 120
        const val TARGET = 1_000.0
        val SAMPLE_MILLIS = listOf(16L, 50L, 100L, 200L, 300L, 450L, 600L, 800L, 1_000L, 1_100L, 1_300L)
        const val LANDED_MILLIS = 1_800L
        const val START_SLACK_MS = 50L
        const val TWO_FRAMES_MS = 33L
    }
}
