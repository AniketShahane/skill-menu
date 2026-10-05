package com.example.starter.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.example.starter.ui.components.BarBackdropVisibility
import com.example.starter.ui.components.glassFallbackTint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.pow

/**
 * The structural rules a palette has to obey, in both themes, stated as arithmetic rather
 * than as taste. Structure from Flick's FlickColorsTest (sender/src/test/.../FlickColorsTest.kt).
 *
 * Every rule here exists because breaking it looks like a flat or cheap app, not like a bug.
 * Flick's dark theme shipped with its raised surface DARKER than the page (1.017:1, inverted):
 * a perfectly valid pair of colours, and on a canvas where drop shadows render nothing, a card
 * with no edge at all. Nothing failed until this kind of test existed (flick@b2a3a8f).
 *
 * When you replace the placeholder palette: make these pass by moving colours, never by
 * lowering a floor. If a set you are happy with cannot meet a floor, pin it as a RATCHET
 * (see [aRatchetLooksLikeThis]) with the shortfall written down, rather than weakening the rule.
 */
/** Backdrop left showing by a bar that floats over media, sized in [PaletteContrastTest]. */
private const val MediaBackdropVisibility = 0.18f

class PaletteContrastTest {

    private val palettes = listOf("light" to LightColors, "dark" to DarkColors)

    // --- elevation ----------------------------------------------------------------------

    /**
     * Raised means lighter, in both themes. Light gets this for free (white cards on an
     * off-white page); dark is where the direction can silently invert.
     */
    @Test fun aRaisedSurfaceIsLighterThanTheSurfaceItIsRaisedOver() {
        for ((name, c) in palettes) {
            assertTrue(
                "$name: surfaceRaised ${c.surfaceRaised.hex()} is not lighter than surface " +
                    "${c.surface.hex()} — a card drawn on it reads as a hole, not a card",
                c.surfaceRaised.luminance() > c.surface.luminance(),
            )
            assertTrue(
                "$name: surfaceRaised is not lighter than canvas ${c.canvas.hex()}",
                c.surfaceRaised.luminance() > c.canvas.luminance(),
            )
        }
    }

    /**
     * …and by enough to see. The floor is the light set's own canvas-to-raised step, the
     * smallest separation either app has shipped that still reads as an edge.
     *
     * Dark has to clear it by more, not less: light also has a tinted drop shadow under its
     * cards, and a dark shadow on a near-black canvas draws nothing, so on dark the tonal step
     * is the ONLY thing separating a card from the page.
     */
    @Test fun theElevationStepIsBigEnoughToRead() {
        val floor = contrast(LightColors.canvas, LightColors.surfaceRaised)
        assertTrue("the light step moved to $floor; retune the floor deliberately", floor > 1.05f)
        val darkStep = contrast(DarkColors.canvas, DarkColors.surfaceRaised)
        assertTrue(
            "dark canvas-to-raised is $darkStep, under the light theme's own $floor — and dark " +
                "has no visible shadow to make up the difference",
            darkStep >= floor,
        )
    }

    /** Quiet containment has to read as a container, not as the page. */
    @Test fun theTonalSurfaceStandsOffThePage() {
        for ((name, c) in palettes) {
            val step = contrast(c.canvas, c.surfaceTonal)
            assertTrue(
                "$name: surfaceTonal ${c.surfaceTonal.hex()} is $step from the canvas — chips " +
                    "and filled fields lose their container",
                step >= 1.1f,
            )
        }
    }

    /** A tonal button has to read as a control rather than as one more card. */
    @Test fun theTonalContainerStandsOffTheSurfaceItSitsOn() {
        for ((name, c) in palettes) {
            val step = contrast(c.surfaceRaised, c.primaryContainer)
            assertTrue(
                "$name: primaryContainer ${c.primaryContainer.hex()} is $step from surfaceRaised — " +
                    "every tonal button disappears into the card behind it",
                step >= 1.2f,
            )
        }
    }

    // --- ink ----------------------------------------------------------------------------

    /**
     * Every surface a palette paints, INCLUDING the colours that only exist once drawn: the
     * glass bar composited over the page and over a card. A palette listing never shows those,
     * which is exactly why they are the ones that fail (flick: the device drew 4.31:1 where a
     * test on bare glass said 4.88:1, Color.kt:308-328).
     *
     * The bar's paint is [glassFallbackTint] at [BarBackdropVisibility], the one colour GlassBar
     * draws without blur and the composite of the tints it lays over the blur. It is NOT
     * [AppColors.glass], whose alpha GlassBar replaces: testing that would be Flick's defect
     * again, a figure for a paint the app never draws.
     *
     * Only surfaces the app really puts ink on. Asserting an ink against a ground it is never
     * drawn on costs a real design decision to satisfy and buys nothing.
     */
    private fun AppColors.surfaces() = listOf(
        "canvas" to canvas,
        "surface" to surface,
        "surfaceRaised" to surfaceRaised,
        "surfaceTonal" to surfaceTonal,
        "the bar over canvas" to barPaint().over(canvas),
        "the bar over surfaceRaised" to barPaint().over(surfaceRaised),
    )

    private fun AppColors.inks() = listOf(
        "onSurface" to onSurface,
        "onSurfaceDim" to onSurfaceDim,
        "onSurfaceFaint" to onSurfaceFaint,
        "primary" to primary,
        "positive" to positive,
        "trouble" to trouble,
    )

    /** 4.5:1 for every ink on every surface, both sets, nothing carved out. */
    @Test fun everyInkClearsFourAndAHalfOnEverySurface() {
        for ((name, c) in palettes) {
            for ((sName, s) in c.surfaces()) {
                for ((iName, i) in c.inks()) {
                    val ratio = contrast(i, s)
                    assertTrue("$name: $iName on $sName is $ratio, under 4.5:1", ratio >= 4.5f)
                }
            }
        }
    }

    /** The ink a filled control carries has to hold up on the fill. */
    @Test fun theInkOnEveryFilledControlClearsFourAndAHalf() {
        for ((name, c) in palettes) {
            val pairs = listOf(
                Triple("onPrimary on primary", c.onPrimary, c.primary),
                Triple("onPrimaryContainer on primaryContainer", c.onPrimaryContainer, c.primaryContainer),
                Triple("onAccent on accent", c.onAccent, c.accent),
                Triple("onCaution on caution", c.onCaution, c.caution),
                Triple("onTrouble on trouble", c.onTrouble, c.trouble),
            )
            for ((label, ink, fill) in pairs) {
                val ratio = contrast(ink, fill)
                assertTrue("$name: $label is $ratio, under 4.5:1", ratio >= 4.5f)
            }
        }
    }

    /**
     * Material's error container is trouble as a tint carrying trouble as its ink, so the
     * ground is a composite that only exists when drawn. Measured over both grounds it sits on.
     */
    @Test fun theErrorContainerCarriesItsOwnInk() {
        for ((name, c) in palettes) {
            for ((gName, ground) in listOf("canvas" to c.canvas, "surfaceRaised" to c.surfaceRaised)) {
                val drawn = c.troubleContainer.over(ground)
                val ratio = contrast(c.trouble, drawn)
                assertTrue("$name: trouble on its container over $gName is $ratio, under 4.5:1", ratio >= 4.5f)
            }
        }
    }

    /**
     * The ink ramp keeps its order. Three roles that have crossed over are three roles that no
     * longer mean anything, and the crossing is invisible in a palette listing.
     */
    @Test fun theInkRampIsMonotonic() {
        for ((name, c) in palettes) {
            val toward = if (c.isLight) -1f else 1f
            val ramp = listOf(c.onSurface, c.onSurfaceDim, c.onSurfaceFaint).map { it.luminance() * toward }
            assertTrue(
                "$name: onSurface/onSurfaceDim/onSurfaceFaint are not in decreasing weight — $ramp",
                ramp.zipWithNext().all { (a, b) -> a > b },
            )
        }
    }

    /**
     * A control's resting edge owes the surface behind it 3:1 (WCAG 1.4.11). Flick had no
     * outline role that reached it (1.43:1 light, 1.76:1 dark) and its forms borrowed the
     * faint ink as a stroke instead (FlickColorsTest.kt:332-343). Here the role carries it.
     */
    @Test fun theOutlineCanCarryAControlsEdge() {
        for ((name, c) in palettes) {
            for ((sName, s) in listOf("canvas" to c.canvas, "surfaceRaised" to c.surfaceRaised)) {
                val ratio = contrast(c.outline, s)
                assertTrue("$name: outline on $sName is $ratio, under 3:1", ratio >= 3.0f)
            }
        }
    }

    // --- roles that must never be the same paint ----------------------------------------

    /**
     * The action and the error are never the same paint. Hue alone can fail (red against green
     * is the classic pair colour-blind users lose), so two states that can replace each other
     * also differ in luminance. 1.6 rather than 3, because the two are never drawn on each
     * other; they are alternative states in one seat. Flick set 1.6 for its primary against its
     * caution fill (`theActionAndTheWarningAreNeverTheSamePaint`, FlickColorsTest.kt:221-243);
     * the starter applies the same floor to primary against trouble.
     */
    @Test fun theActionAndTheTroubleAreNeverTheSamePaint() {
        for ((name, c) in palettes) {
            val step = contrast(c.primary, c.trouble)
            assertTrue(
                "$name: primary ${c.primary.hex()} and trouble ${c.trouble.hex()} are $step apart, " +
                    "under 1.6 — a failed state and a ready one read alike before the label does",
                step >= 1.6f,
            )
        }
    }

    /** A "new" badge and a warning pill must not be mistaken for each other either. */
    @Test fun theAccentIsNeverMistakenForTheWarning() {
        for ((name, c) in palettes) {
            val step = contrast(c.accent, c.caution)
            assertTrue("$name: accent and caution are $step apart, under 1.5", step >= 1.5f)
        }
    }

    // --- fixed brand step-outs ----------------------------------------------------------

    /**
     * The accent is the one colour that does not follow the theme. That is only safe while it
     * really is the same value in both sets: anything built from the constant (a brush, a
     * drawable, a notification colour) cannot follow a palette, and the day someone re-hues
     * one set this fails instead of shipping a mark that disagrees with the palette
     * (flick: `theMediaAccentIsTheSameAmberInEverySet…`, FlickColorsTest.kt:260).
     */
    @Test fun theAccentIsTheSamePaintInBothSets() {
        for ((name, c) in palettes) {
            assertEquals("$name: accent is not the pinned Accent", Accent.hex(), c.accent.hex())
            assertEquals("$name: onAccent is not the pinned AccentInk", AccentInk.hex(), c.onAccent.hex())
        }
    }

    /** On dark the accent is also a mark on its own (a dot, a ring), so it owes the page 3:1. */
    @Test fun theAccentReadsAsAMarkOnTheDarkSurfaces() {
        val c = DarkColors
        for ((sName, s) in listOf("canvas" to c.canvas, "surfaceRaised" to c.surfaceRaised, "surfaceTonal" to c.surfaceTonal)) {
            val ratio = contrast(c.accent, s)
            assertTrue("dark: accent on $sName is $ratio, under 3:1", ratio >= 3.0f)
        }
    }

    // --- surfaces carry the brand as a tint, not a wash ---------------------------------

    /**
     * Dark mode is the same product at night, not a navy one. The measure is chroma relative to
     * the surface's own brightest channel. Flick's aliased dark surfaces sat near 80% and read
     * as a different app; its designed set holds half that.
     */
    @Test fun theDarkSurfacesAreTintedRatherThanSaturated() {
        val surfaces = with(DarkColors) {
            listOf("canvas" to canvas, "surfaceRaised" to surfaceRaised, "surfaceTonal" to surfaceTonal)
        }
        for ((name, s) in surfaces) {
            val chroma = s.relativeChroma()
            assertTrue("dark $name is ${(chroma * 100).toInt()}% chroma — that is a navy, not a tint", chroma < 0.6f)
        }
    }

    // --- floating glass: measured on what GlassBar composites --------------------------

    /**
     * The bar's ink over what really scrolls under it in the starter: the page, cards and
     * tonal chips. The starter's bar leaves 60% of the backdrop showing (40% coverage), and
     * at that density it is legible only over the app's own surfaces: over a black photo the
     * light bar's onSurfaceDim falls to 1.43:1, over a white one the dark bar's to 1.25:1.
     * Blur does not rescue a backdrop that is black or white edge to edge, so this worst case
     * is a floor for the blurred bar as well as the no-blur figure.
     */
    @Test fun theBarInkHoldsOverWhatScrollsUnderIt() {
        for ((name, c) in palettes) {
            val grounds = listOf("canvas" to c.canvas, "surfaceRaised" to c.surfaceRaised, "surfaceTonal" to c.surfaceTonal)
            for ((gName, ground) in grounds) {
                val drawn = c.barPaint().over(ground)
                for ((iName, ink) in listOf("onSurface" to c.onSurface, "onSurfaceDim" to c.onSurfaceDim, "primary" to c.primary)) {
                    val ratio = contrast(ink, drawn)
                    assertTrue("$name: $iName on the bar over $gName is $ratio, under 4.5:1", ratio >= 4.5f)
                }
            }
        }
    }

    /**
     * A bar that floats over photos or video is sized by the worst backdrop: black under light
     * glass, a blown-out white under dark. At the starter's palette, [MediaBackdropVisibility]
     * (18% showing, 82% coverage) is where onSurface, onSurfaceDim and primary all clear 4.5 in
     * both sets; dark onSurfaceDim is the binding one (it fails above 18.7%). An app that
     * scrolls media under its bar passes this value to GlassBar or adds a scrim, and keeps
     * this test. Flick's TV glass, copied from the mock at 13%, left its labels at 3.3:1 over
     * a white frame and had to go to 34% (receiver/.../Color.kt:47-54).
     */
    @Test fun aBarOverMediaIsSizedByTheWorstBackdrop() {
        for ((name, c) in palettes) {
            val worst = if (c.isLight) Color.Black else Color.White
            val drawn = glassFallbackTint(c, MediaBackdropVisibility).over(worst)
            for ((iName, ink) in listOf("onSurface" to c.onSurface, "onSurfaceDim" to c.onSurfaceDim, "primary" to c.primary)) {
                val ratio = contrast(ink, drawn)
                assertTrue("$name: $iName on a media bar over the worst photo is $ratio, under 4.5:1", ratio >= 4.5f)
            }
        }
    }

    /** …and the bar still lets the backdrop take part, or it is a solid bar pretending. */
    @Test fun theGlassLetsTheBackdropParticipate() {
        for ((name, c) in palettes) {
            val coverage = c.barPaint().alpha
            assertTrue(
                "$name: the bar covers ${(coverage * 100).toInt()}% of the page — it reads as a solid fill",
                coverage <= 0.92f,
            )
        }
    }

    // --- the ratchet pattern ------------------------------------------------------------

    /**
     * Not a rule about this palette: a worked example of the RATCHET, for the day a shipped
     * palette the owner is happy with misses a floor. Pin each role just under where it stands
     * today, so the shortfall can close but never deepen, and write the number down where the
     * next person will read it. "Moving an anchored ink to satisfy a test is how a palette
     * drifts" (flick: FlickColorsTest.kt:129-146, floors 14.0/5.3/3.25/5.6/4.05).
     *
     * The starter meets every floor above, so this pins each ink's worst figure today (all on
     * surfaceTonal: 15.31, 7.07, 5.09, 8.47, 4.84, 4.99) a hair under.
     * When you retune, re-measure and move these numbers on purpose.
     */
    @Test fun aRatchetLooksLikeThis() {
        val floors = mapOf(
            "onSurface" to 15.2f,
            "onSurfaceDim" to 7.0f,
            "onSurfaceFaint" to 5.0f,
            "primary" to 8.4f,
            "positive" to 4.8f,
            "trouble" to 4.9f,
        )
        val c = LightColors
        for ((sName, s) in c.surfaces()) {
            for ((iName, i) in c.inks()) {
                val ratio = contrast(i, s)
                assertTrue(
                    "light: $iName on $sName is $ratio, below the ${floors.getValue(iName)} it held " +
                        "when this ratchet was set — the light palette regressed",
                    ratio >= floors.getValue(iName),
                )
            }
        }
    }

    /** What GlassBar actually paints: its fallback, which equals its tints composited. */
    private fun AppColors.barPaint(): Color = glassFallbackTint(this, BarBackdropVisibility)

    // --- WCAG 2.x relative luminance and contrast, on straight sRGB (verbatim from Flick) ---

    /** Chroma as a share of the surface's own brightest channel. */
    private fun Color.relativeChroma(): Float {
        val channels = listOf(red, green, blue)
        return (channels.max() - channels.min()) / channels.max()
    }

    private fun Color.luminance(): Float {
        fun lin(c: Float) = if (c <= 0.03928f) c / 12.92f else ((c + 0.055f) / 1.055f).pow(2.4f)
        return 0.2126f * lin(red) + 0.7152f * lin(green) + 0.0722f * lin(blue)
    }

    private fun contrast(a: Color, b: Color): Float {
        val (hi, lo) = listOf(a.luminance(), b.luminance()).sortedDescending()
        return (hi + 0.05f) / (lo + 0.05f)
    }

    /** A translucent fill composited over an opaque surface — the colour actually drawn. */
    private fun Color.over(base: Color) = Color(
        red = red * alpha + base.red * (1f - alpha),
        green = green * alpha + base.green * (1f - alpha),
        blue = blue * alpha + base.blue * (1f - alpha),
    )

    /** `#RRGGBB` from the packed value, so no float rounding can turn F5 into F4. */
    private fun Color.hex() = "#%06X".format(toArgb() and 0xFFFFFF)
}
