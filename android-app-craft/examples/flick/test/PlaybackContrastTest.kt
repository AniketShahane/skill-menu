package com.flick.receiver.ui.theme

import androidx.compose.ui.graphics.Color
import com.flick.receiver.ui.screens.PAUSED_REST_FILL_ALPHA
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * The playback chrome is drawn over a film this app did not choose, so every
 * legibility claim it makes has to hold against the worst frame it can be handed:
 * a white one — snow, a daylight exterior, a blown-out title card.
 *
 * This is the guard on the tones, not a description of them. Each surface below
 * had shipped at a density measured against the design mock's dark still, and
 * each one failed on white by a factor of two or more. Thinning any of them again
 * fails here rather than on a viewer's television.
 *
 * Everything is computed in the sRGB space Compose actually blends in: source-over
 * on gamma-encoded channels, then WCAG 2.x relative luminance.
 */
class PlaybackContrastTest {

    // ── Where each surface sits, as a fraction of the 540 dp canvas ──────────
    // Measured off the composed 1080p / density-2.0 layout the receiver ships.

    /** The lowest edge of the top-chrome pill row. */
    private val topPillRowBottom = 59f / 540f

    /** Centre of the END SESSION pill — the only focusable in the top chrome. */
    private val endSessionCentre = 87f / 540f

    /** Anywhere in the band neither scrim covers. */
    private val unscrimmedBand = 0.35f

    /** Top of the ±10 s burst's glyph column — its least-protected ink. */
    private val seekBurstGlyph = 0.43f

    /** The transport panel's own rows: eyebrow, title, scrub, controls. */
    private val transportEyebrow = 328f / 540f
    private val transportTitle = 360f / 540f
    private val transportScrub = 400f / 540f
    private val transportControls = 478f / 540f

    /**
     * The state dims `PlaybackScreen` applies over the film. The seeking dim is
     * absent on purpose: it is still animating in while the ±10 s burst is at its
     * most visible, so the burst is measured against bare film instead.
     */
    private val pausedDim = 0.34f
    private val endedDim = 0.50f
    private val bufferingDim = 0.38f

    private val minimumBodyContrast = 4.5f

    @Test fun theTwoScrimsLeaveTheMiddleOfTheFrameBare() {
        // Not a defect to be closed: covering it would darken the one part of the
        // frame the viewer is watching. It is the reason the state tone exists.
        assertEquals(TOP_SCRIM_FRACTION, UNSCRIMMED_BAND.start, TOLERANCE)
        assertEquals(1f - BOTTOM_SCRIM_FRACTION, UNSCRIMMED_BAND.endInclusive, TOLERANCE)
        assertEquals(0f, playbackScrimAlphaAt(unscrimmedBand), TOLERANCE)
        assertTrue(STATE_CHIP_ANCHOR in UNSCRIMMED_BAND)
    }

    @Test fun theBottomScrimIsAlreadyDenseWhereTheTransportPanelBegins() {
        // The knee's whole job. A single linear ramp over the bottom 56 % reached
        // only ~0.20 here, which is why the panel's own title read 3.0:1.
        assertTrue(playbackScrimAlphaAt(TRANSPORT_PANEL_TOP) > 0.5f)
    }

    @Test fun theTopChromePillsHoldTheirInkOnAWhiteFrame() {
        val plate = FlickColor.Glass.over(film(topPillRowBottom))
        assertReadable("clock / net pill", FlickColor.OnChrome, plate)
        assertReadable("pill white", Color.White, plate)
    }

    @Test fun endSessionHoldsItsInkWhereTheTopScrimHasThinnedOut() {
        val plate = FlickColor.GlassState.over(film(endSessionCentre))
        assertReadable("END SESSION label", FlickColor.OnSurfaceDim, plate)
        // The pill's own silhouette, which used to be a white-18 % hairline
        // standing 1.2:1 from the frame behind it.
        assertTrue(contrast(plate, film(endSessionCentre)) >= 3f)
    }

    @Test fun theFocusRingSurvivesLandingOnTheFilmItself() {
        // The ring is painted outside its control, so on this screen part of it is
        // on the film. Amber alone is 1.2:1 there.
        val bare = film(endSessionCentre)
        val contour = FlickColor.FocusRingContour.over(bare)
        assertTrue(contrast(contour, bare) >= 3f)
        assertTrue(contrast(FlickColor.FocusRing, contour) >= 3f)
    }

    @Test fun theFinishedChipHoldsBothItsWordAndItsGlyph() {
        // Only FINISHED still draws a centred chip. Its twin for Paused was cut:
        // a viewer who just pressed pause is being told what they did themselves.
        val plate = FlickColor.GlassState.over(film(STATE_CHIP_ANCHOR, endedDim))
        assertReadable("finished chip label", Color.White, plate)
        assertReadable("finished chip glyph", FlickColor.Spark, plate)
    }

    @Test fun theRestingPauseKeyIsLegibleAtBothEndsOfTheFilm() {
        // What replaced the chip: the play key left at the foot of the frame with
        // its FILL at 80 % and its ink solid. This is the guard on that
        // split — fading the ink along with the fill would weaken the only state
        // signal left on screen.
        //
        // The chrome is down whenever this is lit, so the only thing between the
        // key and the film is the paused dim; there is no scrim to borrow.
        //
        // GRAPHIC_FLOOR is WCAG 1.4.11's graphical-object floor rather than the
        // 4.5:1 body floor: this is a 56 dp key carrying a 28 dp glyph, not copy.
        val bright = FlickColor.CanvasPlayback.copy(alpha = pausedDim).over(Color.White)
        val dark = FlickColor.CanvasPlayback.copy(alpha = pausedDim).over(Color.Black)
        for (tone in listOf(FlickColor.SparkLight, FlickColor.SparkBright, FlickColor.Spark)) {
            val fill = tone.copy(alpha = PAUSED_REST_FILL_ALPHA)

            // Bright: the solid ink carries the glyph at every gradient stop.
            assertGraphic("resting glyph on its fill", FlickColor.OnSpark, fill.over(bright))
            assertGraphic("resting glyph on a bright frame", FlickColor.OnSpark, bright)

            // Dark: the amber silhouette carries the key at every gradient stop.
            assertGraphic("resting key on a dark frame", fill.over(dark), dark)
        }
    }

    @Test fun theRestingPauseFillUsesTheRequestedEightyPercentOpacity() {
        assertEquals(0.8f, PAUSED_REST_FILL_ALPHA, TOLERANCE)
    }

    private fun assertGraphic(what: String, ink: Color, plate: Color) {
        val measured = contrast(ink, plate)
        assertTrue(
            "$what measured %.2f:1, below the %.1f:1 graphic floor".format(measured, GRAPHIC_FLOOR),
            measured >= GRAPHIC_FLOOR,
        )
    }

    @Test fun theBufferingCardHoldsEveryLineAndItsArc() {
        val plate = FlickColor.GlassState.over(film(0.5f, bufferingDim))
        assertReadable("buffering title", Color.White, plate)
        assertReadable("buffering detail", FlickColor.OnSurfaceDim, plate)
        assertReadable("buffering arc", FlickColor.Spark, plate)
    }

    @Test fun theSeekBurstDarkensTheFrameAtEverySpeedLevel() {
        // Modelled where the burst's own glyph sits, not at the frame's centre:
        // that is inside the unscrimmed band, and the seek dim is animating in
        // behind it, so the honest backdrop is the bare film. A single tap is the
        // overwhelmingly common gesture and gets no more protection than 3× does.
        val frame = film(seekBurstGlyph)
        for (level in 1..3) {
            val bed = FlickColor.SeekWashBed.over(frame)
            // The shipped defect in one line: amber over a bright frame came out
            // brighter than the frame. The accent goes on top and carries the
            // speed level; the bed under it never does.
            assertTrue(luminance(bed) < luminance(frame))
            val accent = FlickColor.FocusGlow.copy(
                alpha = FlickColor.FocusGlow.alpha * seekAccentIntensity(level),
            )
            val washed = accent.over(bed)
            assertTrue(luminance(washed) < luminance(frame))
            assertReadable("seek burst glyph at ${level}×", Color.White, washed)
        }
    }

    @Test fun theSeekBurstBedIsFlatEverywhereItsInkStands() {
        // The bed is a radial, and a two-stop radial carries its nominal alpha at
        // exactly one pixel. Modelling it as a flat fill above is only honest
        // while the plateau still reaches past the glyph column's ink.
        val reach = seekWashReach(
            width = SEEK_BURST_WIDTH_FRACTION * CANVAS_WIDTH_DP,
            height = CANVAS_HEIGHT_DP,
        )
        assertTrue(reach * SEEK_WASH_PLATEAU >= SEEK_BURST_INK_RADIUS_DP)
    }

    @Test fun theSidePanelsHoldTheirTelemetryWithNoScrimUnderThem() {
        // This list is the panels' whole ink vocabulary and it deliberately omits
        // FlickColor.OnSurfaceFaint, which tops out at 3.00:1 here. That is an ink
        // limit, not a tone limit — even a fully opaque #0F2A66 leaves it at
        // 4.29:1 — so a panel that needs a third rank takes OnPanelLabel.
        val plate = FlickColor.GlassPanel.over(film(unscrimmedBand))
        assertReadable("panel title", Color.White, plate)
        assertReadable("panel value", FlickColor.OnSurface, plate)
        assertReadable("panel meta", FlickColor.OnChrome, plate)
        assertReadable("panel stat label", FlickColor.OnPanelLabel, plate)
        assertReadable("panel selected row", FlickColor.SparkLight, plate)
        assertReadable("panel accent", FlickColor.Spark, plate)
    }

    @Test fun theTransportPanelHoldsEveryRowItCarries() {
        // The sheen is part of this surface, not a thing laid over it: bare glass
        // is a ground the app no longer draws anywhere. Every row is measured
        // under the WORST sheen the panel can put on ink rather than under the
        // fraction that actually reaches it — the stops move with the panel's
        // size and its rows do not, and an over-approximation costs a little
        // headroom while a per-row model would have to be re-derived every time a
        // row changed height.
        fun panelAt(fraction: Float) =
            FlickColor.ChromeSheenOverInk.over(FlickColor.GlassChrome.over(film(fraction)))
        assertReadable("now-playing eyebrow", FlickColor.SparkBright, panelAt(transportEyebrow))
        assertReadable("syncing eyebrow", FlickColor.Spark, panelAt(transportEyebrow))
        assertReadable("spec chip", FlickColor.OnChrome, panelAt(transportEyebrow))
        assertReadable("title", Color.White, panelAt(transportTitle))
        assertReadable("position", Color.White, panelAt(transportScrub))
        assertReadable("remaining", FlickColor.OnSurfaceDim, panelAt(transportScrub))
        assertReadable("seek target", FlickColor.Spark, panelAt(transportScrub))
        // The control row’s own ink is the two named keys’ words, white at rest.
        // It carried an OnSurfaceDim state line until those keys became one line
        // each; asserting that colour here now measures nothing on screen.
        assertReadable("control key word", Color.White, panelAt(transportControls))
        assertReadable("±10 s marks", FlickColor.OnChrome, panelAt(transportControls))
        // The captions key inverts to the play key’s own gold when subtitles are
        // running, and its ink then stands on that fill rather than on the glass.
        // Opaque, so no film composites into it — which is the point of inverting
        // rather than tinting: this pair reads the same over every frame.
        assertReadable("lit captions key", FlickColor.OnSpark, FlickColor.Spark)
    }

    @Test fun theSheensLipIsSpentBeforeThePanelsOwnPaddingEnds() {
        // The naive read of the stop, and the one a future editor will make: the
        // panel's top 8.4 % is padding by construction, and the lip ends well
        // inside it. True, and not sufficient on its own — see below.
        assertTrue(CHROME_SHEEN_LIP_END < PANEL_TOP_PADDING_DP / PANEL_HEIGHT_DP)
    }

    @Test fun theSheensBrightStopsNeverReachTheInkTheyWouldWashOut() {
        // The claim that matters, and the one the fraction above does not make.
        // The sheen is raked at 168° over a panel [PANEL_WIDTH_DP] wide and
        // [PANEL_HEIGHT_DP] tall, so
        // its gradient line runs corner to corner along that direction and is
        // |W·sinθ| + |H·cosθ| long — nearly half of which is the horizontal term.
        // A stop fraction is therefore a distance from the TOP-LEFT CORNER along
        // that rake, not a fraction of the panel's height, and the two differ by
        // enough to matter: 6 % of the height clears the padding, 6 % of this line
        // does not.
        //
        // Ink is everything inside the 21 / 18 dp panel padding. The lip must be
        // spent before its nearest corner, and the foot may not begin before its
        // farthest one.
        assertTrue(CHROME_SHEEN_LIP_END <= sheenAxis(PANEL_SIDE_PADDING_DP, PANEL_TOP_PADDING_DP))
        assertTrue(
            CHROME_SHEEN_FOOT_START >= sheenAxis(
                PANEL_WIDTH_DP - PANEL_SIDE_PADDING_DP,
                PANEL_HEIGHT_DP - PANEL_TOP_PADDING_DP,
            ),
        )
    }

    /** Where a point on the transport panel falls along the 168° sheen's own axis. */
    private fun sheenAxis(x: Float, y: Float): Float {
        val radians = Math.toRadians(SHEEN_DEGREES.toDouble())
        val dx = sin(radians).toFloat()
        val dy = -cos(radians).toFloat()
        val length = abs(PANEL_WIDTH_DP * dx) + abs(PANEL_HEIGHT_DP * dy)
        return (x * dx + y * dy) / length
    }

    // ── The model ───────────────────────────────────────────────────────────

    /** The worst backdrop the receiver can be handed, plus whatever it draws over it. */
    private fun film(fraction: Float, dim: Float = 0f): Color {
        var bed = Color.White
        if (dim > 0f) bed = FlickColor.CanvasPlayback.copy(alpha = dim).over(bed)
        val scrim = playbackScrimAlphaAt(fraction)
        if (scrim > 0f) bed = FlickColor.CanvasPlayback.copy(alpha = scrim).over(bed)
        return bed
    }

    private fun assertReadable(what: String, ink: Color, plate: Color) {
        val measured = contrast(ink, plate)
        assertTrue(
            "$what measured %.2f:1, below the %.1f:1 floor".format(measured, minimumBodyContrast),
            measured >= minimumBodyContrast,
        )
    }

    /** Source-over onto an opaque backdrop, on gamma-encoded sRGB channels. */
    private fun Color.over(backdrop: Color): Color = Color(
        red = alpha * red + (1f - alpha) * backdrop.red,
        green = alpha * green + (1f - alpha) * backdrop.green,
        blue = alpha * blue + (1f - alpha) * backdrop.blue,
    )

    private fun luminance(color: Color): Float =
        0.2126f * linear(color.red) + 0.7152f * linear(color.green) + 0.0722f * linear(color.blue)

    private fun linear(channel: Float): Float =
        if (channel <= 0.04045f) {
            channel / 12.92f
        } else {
            Math.pow(((channel + 0.055f) / 1.055f).toDouble(), 2.4).toFloat()
        }

    private fun contrast(a: Color, b: Color): Float {
        val first = luminance(a)
        val second = luminance(b)
        return (maxOf(first, second) + 0.05f) / (minOf(first, second) + 0.05f)
    }

    private companion object {
        const val TOLERANCE = 1e-4f

        /** WCAG 1.4.11 — the floor for a graphical object rather than for copy. */
        const val GRAPHIC_FLOOR = 3f

        /** The receiver's reference canvas: 1920 × 1080 at density 2. */
        const val CANVAS_WIDTH_DP = 960f
        const val CANVAS_HEIGHT_DP = 540f

        /** `PlaybackScreen.STATE_CHIP_TOP_FRACTION`, which is private to that file. */
        const val STATE_CHIP_ANCHOR = 0.28f

        /** `PlaybackScreen.SEEK_BURST_WIDTH_FRACTION`, likewise private. */
        const val SEEK_BURST_WIDTH_FRACTION = 0.38f

        /**
         * Radius of the circle enclosing the burst's ink, about the point the bed
         * is centred on: a 48 dp icon over a 9 dp gap over a 20 sp label, the
         * label at its longest ("−120 s · 3×").
         */
        const val SEEK_BURST_INK_RADIUS_DP = 100f

        /**
         * Top edge of a full three-row transport panel: 21 dp × 2 padding, a 59 dp
         * header, a 24 dp scrub row, a 56 dp control row — the play key, its
         * tallest child — and two 16 dp gaps, hung
         * off the bottom safe-area inset.
         */
        const val TRANSPORT_PANEL_TOP = 306f / 540f

        /** That same panel's height, from the arithmetic above. */
        const val PANEL_HEIGHT_DP = 207f

        /** And its width: it fills, so the canvas less two overscan insets. */
        const val PANEL_WIDTH_DP = 864f

        /** `FlickDimens.PanelPadding` — what holds ink inside the panel's bounds. */
        const val PANEL_TOP_PADDING_DP = 18f
        const val PANEL_SIDE_PADDING_DP = 21f

        /** The angle `chromeSheenBrush` rakes at. */
        const val SHEEN_DEGREES = 168f
    }
}
