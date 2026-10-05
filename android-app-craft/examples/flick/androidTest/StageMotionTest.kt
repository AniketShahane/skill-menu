package com.flick.receiver.ui

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.MotionDurationScale
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.PixelMap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.layout.LayoutInfo
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.flick.receiver.ui.components.DisplayCadenceSource
import com.flick.receiver.ui.components.HANDSHAKE_CARD_WIDTH
import com.flick.receiver.ui.components.HouseLights
import com.flick.receiver.ui.components.HouseStage
import com.flick.receiver.ui.components.RATE_KNOWN_WAIT_MS
import com.flick.receiver.ui.components.VEIL_DENSITY
import com.flick.receiver.ui.theme.FlickColor
import com.flick.receiver.ui.theme.FlickTvTheme
import com.flick.receiver.ui.theme.LocalReducedMotion
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.io.File
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * The house lights at full motion on a paused clock, read back as pixels.
 *
 * The underlay stands in for what the curtain covers: a bright amber-white ramp for
 * the standby at Room and Fault, a bright blue-white ramp for the film at Handshake
 * and Film. Both are the worst backdrop a dark curtain can be judged over. Every case
 * leaves a filmstrip behind, `<test>_<ms>.png`, because a banded edge or a late glint
 * is settled by eye; what is asserted is ordering, monotonicity and step size.
 */
class StageMotionTest {

    // Full motion even when the device's animator scale is 0.
    @get:Rule
    val composeRule = createComposeRule(
        effectContext = object : MotionDurationScale {
            override val scaleFactor = 1f
        },
    )

    private class FakeDisplayCadence : DisplayCadenceSource {
        override var physicalHz: Float = 60f
        override var restHz: Float = 60f
        override var lastChangeAtMs: Long? = null
        private val events = MutableSharedFlow<Long>(extraBufferCapacity = 8)
        override val changes: Flow<Long> = events
        var blank = false

        override fun switchWouldBlank(requestedHz: Float): Boolean = blank

        fun emitChange(atMs: Long) {
            lastChangeAtMs = atMs
            events.tryEmit(atMs)
        }
    }

    private var stage by mutableStateOf(HouseStage.Room)
    private var filmDim by mutableFloatStateOf(0f)
    private var rate by mutableFloatStateOf(0f)

    // The pin the window is asked for at the seam; 0 models a pin released there.
    private var pin by mutableFloatStateOf(0f)
    private val cadence = FakeDisplayCadence()
    private val keys = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
    private var lightsDown = 0
    private var up = 0
    private var settled = 0
    private lateinit var density: Density

    @Before
    fun freezeClock() {
        composeRule.mainClock.autoAdvance = false
    }

    private fun launch(
        initial: HouseStage = HouseStage.Room,
        reduced: Boolean = false,
        settle: Boolean = true,
        offstage: Boolean = false,
    ) {
        stage = initial
        composeRule.setContent {
            density = LocalDensity.current
            FlickTvTheme {
                CompositionLocalProvider(LocalReducedMotion provides reduced) {
                    Box(Modifier.fillMaxSize()) {
                        Box(
                            Modifier
                                .fillMaxSize()
                                .drawBehind {
                                    val lit = stage == HouseStage.Room || stage == HouseStage.Fault
                                    drawRect(Brush.verticalGradient(if (lit) STANDBY else FILM))
                                },
                        )
                        HouseLights(
                            stage = stage,
                            filmDim = filmDim,
                            freshRate = { rate },
                            pinnedRate = { pin },
                            turnedFilm = false,
                            deviceLabel = DEVICE,
                            title = TITLE,
                            cadence = cadence,
                            keyPresses = keys,
                            onLightsDown = { lightsDown++ },
                            onPictureUp = { up++ },
                            onPictureSettled = { settled++ },
                            now = { composeRule.mainClock.currentTime },
                            offstage = offstage,
                        )
                    }
                }
            }
        }
        if (settle) advance(LAUNCH_SETTLED_MS)
    }

    /** Exactly [ms] of virtual time, not rounded up to a whole test-clock frame. */
    private fun advance(ms: Long) = composeRule.mainClock.advanceTimeBy(ms, ignoreFrameDuration = true)

    private fun frame() = composeRule.mainClock.advanceTimeByFrame()

    /** Sets the stage and returns the seam's time; the write lands on the next frame. */
    private fun cut(to: HouseStage): Long {
        composeRule.runOnIdle { stage = to }
        return composeRule.mainClock.currentTime
    }

    private fun since(seam: Long): Long = composeRule.mainClock.currentTime - seam

    private fun shot(test: String? = null, seam: Long = 0L): PixelMap {
        val image: ImageBitmap = composeRule.onRoot().captureToImage()
        if (test != null) {
            val dir = InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null)!!
            File(dir, "${test}_${since(seam)}.png").outputStream().use {
                image.asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it)
            }
        }
        return image.toPixelMap()
    }

    /** Mean luma of a 9 × 9 patch, which also averages out the curtain's dither. */
    private fun PixelMap.luma(fx: Float, fy: Float): Float = lumaAt((fx * width).roundToInt(), (fy * height).roundToInt())

    private fun PixelMap.lumaAt(cx: Int, cy: Int): Float {
        var sum = 0f
        var n = 0
        for (y in (cy - 4)..(cy + 4)) {
            for (x in (cx - 4)..(cx + 4)) {
                if (x !in 0 until width || y !in 0 until height) continue
                sum += lumaOf(this[x, y])
                n++
            }
        }
        return sum / n
    }

    /**
     * Total variation along the headline's middle row. A curtain over a ramp is smooth
     * and sums to a handful; glyphs at any visible alpha add a sharp step per stroke.
     */
    private fun PixelMap.glyphEnergy(row: Rect): Float {
        val y = row.center.y.roundToInt().coerceIn(0, height - 1)
        val from = row.left.roundToInt().coerceIn(0, width - 1)
        val to = row.right.roundToInt().coerceIn(0, width - 1)
        var total = 0f
        for (x in from until to) total += abs(lumaOf(this[x + 1, y]) - lumaOf(this[x, y]))
        return total
    }

    private fun headlineBounds(): Rect =
        composeRule.onNodeWithText(HEADLINE).fetchSemanticsNode().boundsInRoot

    private fun cardExists(): Boolean =
        composeRule.onAllNodesWithTag(CARD_TAG).fetchSemanticsNodes().isNotEmpty()

    private fun settleHandshake() {
        cut(HouseStage.Handshake)
        advance(1_000)
    }

    private fun settleFilm() {
        settleHandshake()
        cut(HouseStage.Film)
        // rate stays 0 here, so the reveal first spends RATE_KNOWN_WAIT_MS waiting for it.
        advance(RATE_KNOWN_WAIT_MS + 1_200)
    }

    @Test
    fun actOneClosesToTheCentre() {
        launch()
        val seam = cut(HouseStage.Handshake)
        var cornerDarkAt: Long? = null
        var centreDarkAt: Long? = null
        var cardSeenAt: Long? = null
        var lightsDownAt: Long? = null
        while (since(seam) < 720) {
            frame()
            val t = since(seam)
            val px = shot("actOneClosesToTheCentre", seam)
            assertTrue("the card slot must be composed from the seam's first frame (t=$t)", cardExists())
            if (cornerDarkAt == null && px.luma(0.05f, 0.05f) < DARK) cornerDarkAt = t
            if (centreDarkAt == null && px.luma(0.5f, 0.45f) < DARK) centreDarkAt = t
            if (cardSeenAt == null && px.glyphEnergy(headlineBounds()) > GLYPHS_VISIBLE) cardSeenAt = t
            if (lightsDownAt == null && lightsDown == 1) lightsDownAt = t
        }
        assertTrue("corner went dark at $cornerDarkAt, not before the centre at $centreDarkAt",
            cornerDarkAt != null && (centreDarkAt == null || cornerDarkAt < centreDarkAt))
        // Two frames of dispatch sit between the seam and the tween's first frame.
        assertTrue("onLightsDown ran at $lightsDownAt ms, not about 560", lightsDownAt != null && lightsDownAt in 540L..612L)
        // The aperture reaches CARD_ENTER_APERTURE about 425 ms into the tween. The same
        // dispatch frames, one more for the entrance to start, and the fade's climb past
        // GLYPHS_VISIBLE put the first legible frame up to ~90 ms later, still before dark.
        assertTrue("the card showed at $cardSeenAt ms, not about 425",
            cardSeenAt != null && cardSeenAt in 385L..560L && cardSeenAt < lightsDownAt!!)
        assertEquals(1, lightsDown)
    }

    /**
     * Below an aperture of about 0.1 the pool sits entirely behind the 88 % glass and
     * the loader, so no pixel outside the card can see it: the last ~100 ms of Act I is
     * judged from the filmstrip, not asserted here.
     */
    @Test
    fun actOneEndsWithoutAGlint() {
        launch()
        val seam = cut(HouseStage.Handshake)
        frame()
        val rimFromCentrePx = with(density) { (HANDSHAKE_CARD_WIDTH / 2 + 24.dp).toPx() }
        // The glass's resting top edge, from its layout height, which the entrance's
        // rise and scale (a graphicsLayer) do not change. The card enters lower than it
        // rests, so this point is never covered.
        val glassH = glassHeightPx()
        var aboveCardY: Int? = null
        var cardShowing = false
        var lastCentre = Float.MAX_VALUE
        var lastRim = Float.MAX_VALUE
        var lastAbove = Float.MAX_VALUE
        while (since(seam) < 720) {
            frame()
            val px = shot()
            val aboveY = aboveCardY ?: with(density) {
                (px.height / 2f - glassH / 2f - 16.dp.toPx()).roundToInt()
            }.also { aboveCardY = it }
            // Just outside the card's left edge. The 16:9 pool's sides pass it at an
            // aperture of about 0.15, before the card enters.
            val rim = px.lumaAt((px.width / 2f - rimFromCentrePx).roundToInt(), px.height / 2)
            // Just above the card, in the band where the pool's last light outside the
            // card lies until an aperture of about 0.1. A re-open to about 0.11 or more
            // at any time before onLightsDown relights it.
            val above = px.lumaAt(px.width / 2, aboveY)
            cardShowing = cardShowing || px.glyphEnergy(headlineBounds()) > GLYPHS_VISIBLE
            if (!cardShowing) {
                val centre = px.luma(0.5f, 0.45f)
                assertTrue("centre rose from $lastCentre to $centre at ${since(seam)} ms", centre <= lastCentre + NOISE)
                lastCentre = centre
            }
            // Past onLightsDown the curtain drops to the veil over what is, on a TV, the
            // player's black shutter; this underlay's bright ramp would read as a glint.
            if (lightsDown == 0) {
                assertTrue("rim rose from $lastRim to $rim at ${since(seam)} ms", rim <= lastRim + NOISE)
                if (lastRim < 0.3f) {
                    assertTrue("rim dropped ${lastRim - rim} in one frame at ${since(seam)} ms", lastRim - rim <= 0.2f)
                }
                // No per-frame drop cap here: a correct close crosses this row's ramp
                // by about 0.25 in one 16 ms harness frame.
                assertTrue("the pool re-lit above the card, $lastAbove to $above at ${since(seam)} ms",
                    above <= lastAbove + NOISE)
            }
            lastRim = rim
            lastAbove = above
        }
    }

    /**
     * The handshake glass's layout height: the outermost ancestor of the headline that
     * is [HANDSHAKE_CARD_WIDTH] wide. Above it is the full-screen card slot.
     */
    private fun glassHeightPx(): Int {
        val cardWidthPx = with(density) { HANDSHAKE_CARD_WIDTH.roundToPx() }
        var node: LayoutInfo? = composeRule.onNodeWithText(HEADLINE).fetchSemanticsNode().layoutInfo
        var glass: LayoutInfo? = null
        while (node != null) {
            if (abs(node.width - cardWidthPx) <= 1) glass = node
            node = node.parentInfo
        }
        assertTrue("no $HANDSHAKE_CARD_WIDTH-wide glass above the headline", glass != null)
        return glass!!.height
    }

    @Test
    fun revealLiftsWithoutAStep() {
        rate = 60f
        cadence.physicalHz = 60f
        cadence.blank = false
        launch()
        settleHandshake()
        val seam = cut(HouseStage.Film)
        val samples = mutableListOf<Float>()
        while (since(seam) < 1_000) {
            frame()
            val t = since(seam)
            samples += shot("revealLiftsWithoutAStep", seam).luma(0.5f, 0.1f)
            if (t >= 2 * FILM_FRAME_MS) assertEquals("onPictureUp by the second film frame", 1, up)
            if (t >= 460) assertTrue("the card outlived its exit at $t ms", !cardExists())
            if (t >= 920) assertEquals("onPictureSettled by about 880 ms", 1, settled)
        }
        assertMonotoneWithinBudget(samples, rising = true)
    }

    @Test
    fun revealWaitsForTheModeSwitch() {
        rate = 23.976f
        cadence.physicalHz = 60f
        cadence.blank = true
        launch()
        settleHandshake()
        val covered = shot().luma(0.5f, 0.1f)
        val seam = cut(HouseStage.Film)
        advance(400)
        assertEquals(covered, shot("revealWaitsForTheModeSwitch", seam).luma(0.5f, 0.1f), NOISE)
        assertEquals(0, up)
        cadence.physicalHz = 23.976f
        cadence.emitChange(composeRule.mainClock.currentTime)
        advance(499)
        assertEquals(covered, shot("revealWaitsForTheModeSwitch", seam).luma(0.5f, 0.1f), NOISE)
        assertEquals("the picture came up inside the resync grace", 0, up)
        frame()
        frame()
        assertEquals("the picture did not come up once the grace ran out", 1, up)
        advance(120 + 2 * FILM_FRAME_MS)
        assertTrue("the veil did not start lifting after the lag",
            shot("revealWaitsForTheModeSwitch", seam).luma(0.5f, 0.1f) > covered + NOISE)
    }

    @Test
    fun revealWaitsForALateRate() {
        // The film's rate reaches the stage up to one 2 Hz snapshot after Active.
        rate = 0f
        cadence.physicalHz = 60f
        cadence.blank = true
        launch()
        settleHandshake()
        val covered = shot().luma(0.5f, 0.1f)
        val seam = cut(HouseStage.Film)
        advance(300)
        assertEquals(0, up)
        composeRule.runOnIdle { rate = 23.976f }
        advance(150)
        assertEquals("the picture came up before the late rate's switch", 0, up)
        cadence.physicalHz = 23.976f
        val change = composeRule.mainClock.currentTime
        cadence.emitChange(change)
        while (composeRule.mainClock.currentTime - change < 484) {
            frame()
            assertEquals("the picture came up inside the resync grace at ${since(seam)} ms", 0, up)
            assertEquals("the veil moved at ${since(seam)} ms", covered,
                shot("revealWaitsForALateRate", seam).luma(0.5f, 0.1f), NOISE)
        }
        advance(499 - (composeRule.mainClock.currentTime - change))
        assertEquals("the picture came up inside the resync grace", 0, up)
        frame()
        frame()
        assertEquals("the picture did not come up once the grace ran out", 1, up)
    }

    @Test
    fun reCastWaitsForTheSecondSwitch() {
        // A re-cast of a 23.976 film: the panel is already pinned to it, the seam
        // releases the pin (to 60), and the pin is re-requested once the rate lands.
        rate = 23.976f
        cadence.physicalHz = 23.976f
        cadence.blank = true
        launch()
        settleHandshake()
        val covered = shot().luma(0.5f, 0.1f)
        cadence.physicalHz = 60f
        val release = composeRule.mainClock.currentTime
        cadence.emitChange(release)
        val seam = cut(HouseStage.Film)
        while (composeRule.mainClock.currentTime - release < 600) {
            frame()
            assertEquals("the picture came up between the two switches at ${since(seam)} ms", 0, up)
        }
        cadence.physicalHz = 23.976f
        val repin = composeRule.mainClock.currentTime
        cadence.emitChange(repin)
        while (composeRule.mainClock.currentTime - repin < 484) {
            frame()
            assertEquals("the picture came up inside the second resync grace at ${since(seam)} ms", 0, up)
            assertEquals("the veil moved at ${since(seam)} ms", covered,
                shot("reCastWaitsForTheSecondSwitch", seam).luma(0.5f, 0.1f), NOISE)
        }
        advance(499 - (composeRule.mainClock.currentTime - repin))
        assertEquals("the picture came up inside the second resync grace", 0, up)
        frame()
        frame()
        assertEquals("the picture did not come up once the second grace ran out", 1, up)
    }

    @Test
    fun reCastWaitsForAReleaseReportedAfterTheRate() {
        // A re-cast of a 23.976 film whose rate reaches the stage before the release
        // the seam made is reported: the release and the re-pin both still land.
        rate = 0f
        cadence.physicalHz = 23.976f
        cadence.restHz = 60f
        cadence.blank = true
        launch()
        settleHandshake()
        val covered = shot().luma(0.5f, 0.1f)
        val seam = cut(HouseStage.Film)
        advance(200)
        composeRule.runOnIdle { rate = 23.976f }
        frame()
        assertEquals("the picture came up when the rate landed", 0, up)
        while (since(seam) < 400) {
            frame()
            assertEquals("the picture came up before the release at ${since(seam)} ms", 0, up)
        }
        cadence.physicalHz = 60f
        cadence.emitChange(composeRule.mainClock.currentTime)
        while (since(seam) < 1_000) {
            frame()
            assertEquals("the picture came up between the two switches at ${since(seam)} ms", 0, up)
        }
        cadence.physicalHz = 23.976f
        val repin = composeRule.mainClock.currentTime
        cadence.emitChange(repin)
        while (composeRule.mainClock.currentTime - repin < 484) {
            frame()
            assertEquals("the picture came up inside the re-pin grace at ${since(seam)} ms", 0, up)
            assertEquals("the veil moved at ${since(seam)} ms", covered,
                shot("reCastWaitsForAReleaseReportedAfterTheRate", seam).luma(0.5f, 0.1f), NOISE)
        }
        advance(499 - (composeRule.mainClock.currentTime - repin))
        assertEquals("the picture came up inside the re-pin grace", 0, up)
        frame()
        frame()
        assertEquals("the picture did not come up once the re-pin grace ran out", 1, up)
    }

    @Test
    fun sameCadenceReCastWithAHeldPinDoesNotHold() {
        // A re-cast at the cadence the window is still pinned to: nothing switches, so
        // the rate landing late must not start a wait for a release that never comes.
        pin = 23.976f
        rate = 0f
        cadence.physicalHz = 23.976f
        cadence.restHz = 60f
        cadence.blank = true
        launch()
        settleHandshake()
        val seam = cut(HouseStage.Film)
        advance(300)
        assertEquals("the picture came up before the rate landed", 0, up)
        composeRule.runOnIdle { rate = 23.976f }
        frame()
        frame()
        assertEquals("the picture did not come up within two frames of the rate (${since(seam)} ms)", 1, up)
        assertTrue("the picture came up at ${since(seam)} ms, not well before 800", since(seam) < 800)
    }

    @Test
    fun rateLessReCastWaitsForAPinReleasedAfterTheSeam() {
        // The seam's snapshot still holds the old film's pin; the new film reports no
        // rate, so the pin is given up a tick later and its switch is reported late.
        pin = 23.976f
        rate = 0f
        cadence.physicalHz = 23.976f
        cadence.restHz = 60f
        cadence.blank = true
        launch()
        settleHandshake()
        val seam = cut(HouseStage.Film)
        advance(200)
        composeRule.runOnIdle { pin = 0f }
        advance(750 - since(seam))
        assertEquals("the picture came up before the release was reported", 0, up)
        cadence.physicalHz = 60f
        val change = composeRule.mainClock.currentTime
        cadence.emitChange(change)
        while (composeRule.mainClock.currentTime - change < 484) {
            frame()
            assertEquals("the picture came up inside the resync grace at ${since(seam)} ms", 0, up)
        }
        advance(499 - (composeRule.mainClock.currentTime - change))
        assertEquals("the picture came up inside the resync grace", 0, up)
        frame()
        frame()
        assertEquals("the picture did not come up once the grace ran out", 1, up)
    }

    @Test
    fun aCastDuringAFaultDissolveClosesWithoutAStep() {
        launch()
        settleFilm()
        cadence.physicalHz = 24f
        cadence.restHz = 60f
        val fault = cut(HouseStage.Fault)
        advance(200)
        cadence.physicalHz = 60f
        cadence.emitChange(composeRule.mainClock.currentTime)
        // The fault's curtain is flat, so any point reads its density.
        var d = 1f
        while (d > 0.5f) {
            frame()
            assertTrue("the fault never dissolved to half (${since(fault)} ms)", since(fault) < 2_500)
            d = shot().densityAt(lit = true, fx = 0.5f, fy = 0.1f)
        }
        assertTrue("the dissolve overshot half: $d", d > 0.35f)
        val lightsDownBefore = lightsDown
        val seam = cut(HouseStage.Handshake)
        // The seam's own frame still ticks the dissolve before the new move seeds from
        // it, and the underlay changes ramp there, so judging starts from that frame.
        frame()
        var last = shot().densityAt(lit = false, fx = 0.5f, fy = 0.1f)
        assertTrue("the move did not seed near the dissolve's density: $d → $last", last in 0.3f..0.6f)
        var firedAfter: Float? = null
        while (since(seam) < 1_000) {
            frame()
            val px = shot("aCastDuringAFaultDissolveClosesWithoutAStep", seam)
            val now = px.densityAt(lit = false, fx = 0.5f, fy = 0.1f)
            if (lightsDown == lightsDownBefore) {
                assertTrue("density fell from $last to $now at ${since(seam)} ms", now >= last - DENSITY_NOISE)
                assertTrue("density jumped from $last to $now in one frame at ${since(seam)} ms", now - last <= 0.1f)
                if (now < CARD_ENTER_DENSITY - DENSITY_NOISE) {
                    assertTrue("the card showed at density $now (${since(seam)} ms)",
                        px.glyphEnergy(headlineBounds()) <= GLYPHS_VISIBLE)
                }
            } else if (firedAfter == null) {
                firedAfter = last
            }
            last = now
        }
        assertEquals("onLightsDown must fire exactly once", lightsDownBefore + 1, lightsDown)
        assertTrue("onLightsDown fired at density $firedAfter, not under full dark",
            firedAfter != null && firedAfter >= 1f - DENSITY_NOISE)
    }

    /**
     * The density of a flat curtain at a point, from the underlay's luma there: the
     * ramp is linear in y, and the curtain blends Canvas over it by its alpha.
     */
    private fun PixelMap.densityAt(lit: Boolean, fx: Float, fy: Float): Float {
        val ramp = if (lit) STANDBY else FILM
        val under = lumaOf(ramp[0]) + (lumaOf(ramp[1]) - lumaOf(ramp[0])) * fy
        return (under - luma(fx, fy)) / (under - lumaOf(FlickColor.Canvas))
    }

    @Test
    fun aCastPlannedOffstageOpensDarkWithTheCard() {
        launch(offstage = true)
        val seam = cut(HouseStage.Handshake)
        frame()
        val first = shot("aCastPlannedOffstageOpensDarkWithTheCard", seam)
        val canvas = lumaOf(FlickColor.Canvas)
        assertEquals("the corner was not opaque Canvas on the first frame", canvas, first.luma(0.05f, 0.05f), NOISE)
        assertEquals("the top was not opaque Canvas on the first frame", canvas, first.luma(0.5f, 0.1f), NOISE)
        assertEquals("onLightsDown must fire at once", 1, lightsDown)
        assertTrue("the handshake card was not composed", cardExists())
    }

    @Test
    fun revealStopsWaitingForARateThatNeverComes() {
        rate = 0f
        cadence.physicalHz = 60f
        cadence.blank = true
        launch()
        settleHandshake()
        val seam = cut(HouseStage.Film)
        advance(RATE_KNOWN_WAIT_MS - 100)
        assertEquals("the picture came up before the rate wait ran out", 0, up)
        advance(100)
        frame()
        frame()
        assertEquals("onPictureUp by the rate wait plus two frames (${since(seam)} ms)", 1, up)
    }

    @Test
    fun aFaultMidActOneHoldsTheAperture() {
        launch()
        cut(HouseStage.Handshake)
        advance(250)
        frame()
        var last = shot().luma(0.5f, 0.45f)
        val canvas = lumaOf(FlickColor.Canvas)
        assertTrue("the centre was already dark 250 ms into Act I", last > canvas + 0.1f)
        val seam = cut(HouseStage.Fault)
        while (since(seam) < 700) {
            frame()
            val centre = shot("aFaultMidActOneHoldsTheAperture", seam).luma(0.5f, 0.45f)
            assertTrue("the centre dropped from $last to $centre at ${since(seam)} ms", centre >= last - NOISE)
            last = centre
        }
    }

    @Test
    fun aKeyEndsTheHold() {
        rate = 23.976f
        cadence.physicalHz = 60f
        cadence.blank = true
        launch()
        settleHandshake()
        cut(HouseStage.Film)
        advance(200)
        assertEquals(0, up)
        keys.tryEmit(Unit)
        frame()
        frame()
        assertEquals("a key must end the hold at once", 1, up)
    }

    @Test
    fun reCastSeedsAtTheOutgoingDim() {
        launch()
        settleFilm()
        val film = shot().luma(0.5f, 0.1f)
        val canvas = lumaOf(FlickColor.Canvas)
        composeRule.runOnIdle { filmDim = 0.34f }
        frame()
        val seam = cut(HouseStage.Handshake)
        frame()
        val first = shot("reCastSeedsAtTheOutgoingDim", seam).luma(0.5f, 0.1f)
        assertEquals("the veil must start at the paused film's dim", film + (canvas - film) * 0.34f, first, 0.03f)
        val samples = mutableListOf(first)
        while (since(seam) < 900) {
            frame()
            samples += shot("reCastSeedsAtTheOutgoingDim", seam).luma(0.5f, 0.1f)
        }
        assertEquals(film + (canvas - film) * VEIL_DENSITY, samples.last(), 0.03f)
        assertMonotoneWithinBudget(samples, rising = false)
    }

    @Test
    fun lightsUpHoldsThenOpensFromTheCentre() {
        launch()
        settleFilm()
        cadence.physicalHz = 24f
        cadence.restHz = 60f
        val seam = cut(HouseStage.Room)
        val canvas = lumaOf(FlickColor.Canvas)
        while (since(seam) < 400) {
            frame()
            val px = shot("lightsUpHoldsThenOpensFromTheCentre", seam)
            for ((fx, fy) in listOf(0.05f to 0.05f, 0.5f to 0.45f, 0.95f to 0.95f)) {
                assertEquals("uncovered at ($fx, $fy) during the hold", canvas, px.luma(fx, fy), 0.02f)
            }
        }
        cadence.physicalHz = 60f
        cadence.emitChange(composeRule.mainClock.currentTime)
        var centreLitAt: Long? = null
        var cornerLitAt: Long? = null
        while (since(seam) < 1_800) {
            frame()
            val t = since(seam)
            val px = shot("lightsUpHoldsThenOpensFromTheCentre", seam)
            if (centreLitAt == null && px.luma(0.5f, 0.45f) > canvas + 0.05f) centreLitAt = t
            if (cornerLitAt == null && px.luma(0.05f, 0.05f) > canvas + 0.05f) cornerLitAt = t
        }
        assertTrue("the room lit before the resync grace ran out ($centreLitAt ms)", centreLitAt != null && centreLitAt >= 900)
        assertTrue("centre lit at $centreLitAt, not before the corner at $cornerLitAt",
            cornerLitAt != null && centreLitAt!! < cornerLitAt)
    }

    @Test
    fun launchOpensFromTheCentre() {
        launch(settle = false)
        val seam = composeRule.mainClock.currentTime
        val canvas = lumaOf(FlickColor.Canvas)
        val first = shot("launchOpensFromTheCentre", seam)
        assertEquals("the first frame must match the window background", canvas, first.luma(0.5f, 0.45f), 0.02f)
        assertEquals(canvas, first.luma(0.05f, 0.05f), 0.02f)
        var centreLitAt: Long? = null
        var cornerLitAt: Long? = null
        while (since(seam) < 800) {
            frame()
            val t = since(seam)
            val px = shot("launchOpensFromTheCentre", seam)
            if (centreLitAt == null && px.luma(0.5f, 0.45f) > canvas + 0.05f) centreLitAt = t
            if (cornerLitAt == null && px.luma(0.05f, 0.05f) > canvas + 0.05f) cornerLitAt = t
        }
        assertTrue("centre lit at $centreLitAt, not before the corner at $cornerLitAt",
            centreLitAt != null && cornerLitAt != null && centreLitAt < cornerLitAt)
    }

    @Test
    fun faultDissolvesUniformly() {
        launch()
        settleHandshake()
        val seam = cut(HouseStage.Fault)
        val canvas = lumaOf(FlickColor.Canvas)
        val corner = mutableListOf<Float>()
        val centre = mutableListOf<Float>()
        while (since(seam) < 700) {
            frame()
            val px = shot("faultDissolvesUniformly", seam)
            // The outgoing card sits over the centre for its short exit; only the
            // curtain is being judged.
            if (cardExists()) continue
            corner += px.luma(0.05f, 0.05f)
            centre += px.luma(0.5f, 0.45f)
        }
        assertTrue("no frames after the card left", corner.size > 4)
        // The two points sit on different parts of the ramp, so each is read as its
        // progress from Canvas to its own lit value.
        val cornerLit = corner.last()
        val centreLit = centre.last()
        corner.indices.forEach { i ->
            val a = (corner[i] - canvas) / (cornerLit - canvas)
            val b = (centre[i] - canvas) / (centreLit - canvas)
            assertEquals("corner and centre parted at sample $i", a, b, 0.05f)
        }
    }

    @Test
    fun handshakeSemanticsLeaveOnTheFirstExitFrame() {
        launch()
        settleHandshake()
        composeRule.onNodeWithText(HEADLINE).assertExists()
        cut(HouseStage.Film)
        frame()
        composeRule.onNodeWithText(HEADLINE).assertDoesNotExist()
        assertTrue("the card must still be drawing its exit", cardExists())
    }

    @Test
    fun reducedMotionReachesEachEndStateInOneStep() {
        rate = 23.976f
        cadence.physicalHz = 60f
        cadence.blank = true
        launch(reduced = true, settle = false)
        oneStep()
        val standby = shot("reduced", 0L)
        assertTrue("launch must not cover the room", standby.luma(0.5f, 0.45f) > 0.5f)

        cut(HouseStage.Handshake)
        oneStep()
        assertEquals(1, lightsDown)
        assertTrue(cardExists())
        composeRule.onNodeWithText(HEADLINE).assertExists()

        cut(HouseStage.Film)
        oneStep()
        assertEquals("the pending switch must not hold a reduced-motion reveal", 1, up)
        assertEquals(1, settled)
        assertTrue(!cardExists())
        val film = shot().luma(0.5f, 0.1f)

        composeRule.runOnIdle { filmDim = 0.5f }
        cut(HouseStage.Handshake)
        oneStep()
        val veil = shot().luma(0.5f, 0.1f)
        val canvas = lumaOf(FlickColor.Canvas)
        assertEquals(film + (canvas - film) * VEIL_DENSITY, veil, 0.03f)

        cut(HouseStage.Fault)
        oneStep()
        assertTrue(!cardExists())
        assertTrue("a fault must not stay covered", shot().luma(0.05f, 0.05f) > 0.5f)

        cut(HouseStage.Room)
        oneStep()
        assertTrue(shot().luma(0.5f, 0.45f) > 0.5f)
    }

    /** The frame that composes a change launches its effect; the next one draws what it snapped. */
    private fun oneStep() {
        frame()
        frame()
    }

    /**
     * At most 10 % of the whole span per 24 Hz frame (the 24 Hz step budget,
     * receiver-expressive-spec.md §6.1), and never backwards. The test clock only ticks
     * every [HARNESS_FRAME_MS] and the curtain's alpha moves in whole 1/255 codes, so two
     * rules apply:
     * - no single 16 ms step exceeds that budget scaled to 16 ms, with [STEP_HEADROOM]
     *   for timing plus two alpha codes of slack, which catches a one-frame pop that a
     *   window would average away;
     * - no run of [BUDGET_WINDOW] frames exceeds the budget scaled to its length, where
     *   two codes of slack can no longer hide a curve that is too steep throughout.
     */
    private fun assertMonotoneWithinBudget(samples: List<Float>, rising: Boolean) {
        val span = abs(samples.last() - samples.first())
        assertTrue("nothing moved (span $span)", span > 0.1f)
        val slack = 2f / 255f
        val sign = if (rising) 1f else -1f
        val stepCap = 0.10f * span * HARNESS_FRAME_MS / FILM_FRAME_EXACT_MS * STEP_HEADROOM + slack
        samples.zipWithNext().forEachIndexed { i, (a, b) ->
            assertTrue("step $i went backwards: $a → $b", sign * (b - a) >= -slack)
            assertTrue("step $i jumped ${sign * (b - a) / span} of the span in one frame", sign * (b - a) <= stepCap)
        }
        assertTrue("too few samples to judge the budget", samples.size > BUDGET_WINDOW)
        val budget = 0.10f * span * BUDGET_WINDOW * HARNESS_FRAME_MS / FILM_FRAME_EXACT_MS + slack
        for (i in 0 until samples.size - BUDGET_WINDOW) {
            val moved = sign * (samples[i + BUDGET_WINDOW] - samples[i])
            assertTrue("frames $i..${i + BUDGET_WINDOW} moved ${moved / span} of the span", moved <= budget)
        }
    }

    private companion object {
        const val DEVICE = "Phone"
        const val TITLE = "Film"
        const val HEADLINE = "Phone is flicking Film"
        const val CARD_TAG = "house-card"
        const val LAUNCH_SETTLED_MS = 700L
        const val FILM_FRAME_MS = 41L
        const val FILM_FRAME_EXACT_MS = 1_000f / 24f
        const val HARNESS_FRAME_MS = 16f
        const val BUDGET_WINDOW = 6
        const val STEP_HEADROOM = 1.3f
        const val DARK = 0.08f
        const val NOISE = 2f / 255f
        const val GLYPHS_VISIBLE = 8f
        const val CARD_ENTER_DENSITY = 0.88f
        const val DENSITY_NOISE = 0.02f

        val STANDBY = listOf(Color.White, Color(0xFFFFB61E))
        val FILM = listOf(Color.White, Color(0xFF1240E8))

        fun lumaOf(c: Color): Float = 0.2126f * c.red + 0.7152f * c.green + 0.0722f * c.blue
    }
}
