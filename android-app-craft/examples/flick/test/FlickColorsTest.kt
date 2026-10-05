package com.flick.sender.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.pow
import kotlin.math.roundToInt

/**
 * The structural rules a Flick palette has to obey, in both themes, stated as arithmetic
 * rather than as taste.
 *
 * Dark mode broke every one of these by being an alias for the cinematic set, and none of
 * it showed up as a failure anywhere: a raised surface DARKER than the surface it is
 * raised over is a perfectly valid pair of colours, and on a canvas where drop shadows
 * render nothing it is also a card with no edge at all. That is the kind of defect only a
 * measurement catches — it looks like a flat app, not like a bug.
 */
class FlickColorsTest {

    private val palettes = listOf("light" to LightFlickColors, "dark" to DarkFlickColors)

    /**
     * …and the two cinematic sets, for the rules that are about the BRAND ASSIGNMENT rather
     * than about surfaces. They are excluded from everything above on purpose: the
     * cinematic backdrop is deliberately the darkest, most saturated thing on the screen,
     * so the surface and elevation rules would have to be weakened to admit it, and
     * weakening a rule to admit a palette is how a rule stops meaning anything.
     *
     * What every set does share is which role does which job, and that is what these four
     * are held to together.
     */
    private val allPalettes = palettes + listOf(
        "cinematic" to CinematicFlickColors,
        "cinematic night" to CinematicNightFlickColors,
    )

    /**
     * Raised means lighter, in both themes. Light mode gets this for free — white cards on
     * an off-white canvas — and dark mode is where the direction can silently invert.
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
     * …and by enough to see. The floor is the light set's own canvas-to-white step, which
     * is the smallest separation this app has ever shipped and still reads as an edge.
     *
     * Dark has to clear it by more, not less: the light theme also carries a tinted drop
     * shadow under its cards, and a dark shadow on a near-black canvas draws nothing, so
     * on dark the tonal step is the ONLY thing separating a card from the page.
     */
    @Test fun theElevationStepIsBigEnoughToRead() {
        val floor = contrast(LightFlickColors.canvas, LightFlickColors.surfaceRaised)
        assertTrue("the light step moved; retune the floor deliberately", floor > 1.05f)
        val darkStep = contrast(DarkFlickColors.canvas, DarkFlickColors.surfaceRaised)
        assertTrue(
            "dark canvas-to-raised is $darkStep, under the light theme's own $floor — and dark " +
                "has no visible shadow to make up the difference",
            darkStep >= floor,
        )
    }

    /** A tonal container has to read as a control rather than as one more surface. */
    @Test fun theTonalContainerStandsOffTheSurfaceItSitsOn() {
        for ((name, c) in palettes) {
            val step = contrast(c.surfaceRaised, c.primaryContainer)
            assertTrue(
                "$name: primaryContainer ${c.primaryContainer.hex()} is $step from surfaceRaised — " +
                    "the folder chip and every tonal button disappear into the card behind them",
                step >= 1.2f,
            )
        }
    }

    /**
     * Every surface a palette paints under [FlickTheme], including `fillCard` composited
     * over both of the surfaces it is laid on — which are the ones no palette listing
     * shows, because those colours do not exist until they are drawn.
     *
     * `fillControl`, `fillTrack` and the rest of the fills are absent because nothing
     * under this theme paints them: they belong to the transport and the Now-Playing
     * screen, which are forced cinematic. Asserting an ink against a surface the app never
     * puts it on is a claim that costs a real design decision to satisfy and buys nothing
     * — it is what first pushed the dark action blue a step paler than the brand.
     */
    private fun FlickColors.surfaces() = listOf(
        "canvas" to canvas,
        "surface" to surface,
        "surfaceRaised" to surfaceRaised,
        "surfaceRaisedAlt" to surfaceRaisedAlt,
        "fillCard over surfaceRaised" to fillCard.over(surfaceRaised),
        "fillCard over canvas" to fillCard.over(canvas),
    )

    private fun FlickColors.inks() = listOf(
        "onSurface" to onSurface,
        "onSurfaceDim" to onSurfaceDim,
        "onSurfaceFaint" to onSurfaceFaint,
        "primary" to primary,
        "trouble" to trouble,
    )

    /**
     * The dark set clears 4.5:1 for every ink role on every surface, composited fills
     * included. This is the palette this change is responsible for, so it is held to the
     * real floor with nothing carved out.
     */
    @Test fun everyDarkInkRoleClearsFourAndAHalfOnEverySurface() {
        for ((sName, s) in DarkFlickColors.surfaces()) {
            for ((iName, i) in DarkFlickColors.inks()) {
                val ratio = contrast(i, s)
                assertTrue("dark: $iName on $sName is $ratio, under 4.5:1", ratio >= 4.5f)
            }
        }
    }

    /**
     * The light set does not meet that floor everywhere, and did not before this change
     * either. Its worst pairs are `onSurfaceFaint` at 3.29:1 and `trouble` at 4.10:1, both
     * on a `fillCard` over the canvas — under 4.5 for text at this app's body sizes.
     *
     * Not quietly corrected here: light is the theme the product owner is happy with and
     * is not what this change is for, and moving an anchored ink to satisfy a test is how
     * a palette drifts. So this is a RATCHET rather than a standard — every role is pinned
     * just under where it stands today, so the shortfall can be closed but cannot deepen,
     * and the two numbers above are written down where the next person to open the light
     * theme will find them.
     *
     * The pairs are the cross product of the roles and the surfaces above, which is a
     * wider claim than the app makes today: it includes ink on surfaces that ink may not
     * currently be drawn on. That is deliberate for a ratchet — a component that starts
     * drawing one of those pairs then cannot introduce a regression silently.
     */
    @Test fun theLightSetNeverDropsBelowWhereItStandsToday() {
        val floors = mapOf(
            "onSurface" to 14.0f,
            "onSurfaceDim" to 5.3f,
            "onSurfaceFaint" to 3.25f,
            "primary" to 5.6f,
            "trouble" to 4.05f,
        )
        for ((sName, s) in LightFlickColors.surfaces()) {
            for ((iName, i) in LightFlickColors.inks()) {
                val ratio = contrast(i, s)
                assertTrue(
                    "light: $iName on $sName is $ratio, below the ${floors.getValue(iName)} this " +
                        "role holds today — the light palette regressed",
                    ratio >= floors.getValue(iName),
                )
            }
        }
    }

    /** The ink a filled control carries has to hold up on the fill. */
    @Test fun theInkOnAFilledControlClearsFourAndAHalf() {
        for ((name, c) in palettes) {
            assertTrue(
                "$name: onPrimary on primary is ${contrast(c.onPrimary, c.primary)}",
                contrast(c.onPrimary, c.primary) >= 4.5f,
            )
            assertTrue(
                "$name: onPrimaryContainer on primaryContainer is " +
                    "${contrast(c.onPrimaryContainer, c.primaryContainer)}",
                contrast(c.onPrimaryContainer, c.primaryContainer) >= 4.5f,
            )
            assertTrue(
                "$name: onPrimaryFixed on primaryFixed is " +
                    "${contrast(c.onPrimaryFixed, c.primaryFixed)}",
                contrast(c.onPrimaryFixed, c.primaryFixed) >= 4.5f,
            )
        }
    }

    /**
     * `sparkInverse` exists for the two grounds a palette draws LIT, and both of them
     * change polarity between the sets: `inverseSurface` is near-black in light and
     * near-WHITE in dark, and `primary` is a deep blue in light and a gold in dark. An
     * accent standing on either therefore cannot be one value, which is the entire reason
     * the role was cut.
     *
     * This is the rule that would have caught three defects that shipped, all of them an
     * amber accent drawn on the near-white dark `inverseSurface` and none of them visible
     * in a palette listing: an advisory's INFO glyph at 1.45:1, a pair card's slot count at
     * 1.31:1, and the link pill's live dot on the action fill at 2.09:1.
     *
     * Text on the inverse card, so 4.5; a dot and a 2 dp ring on the action fill, so 3.
     * Asserted for all four sets even though the cinematic-light value is currently painted
     * by nothing — the rule is about what the role MEANS, and a carve-out for the one set
     * that has no call site yet is a carve-out the next call site would inherit.
     */
    @Test fun theInverseAccentHoldsOnBothGroundsThatInvert() {
        for ((name, c) in allPalettes) {
            val onCard = contrast(c.sparkInverse, c.inverseSurface)
            assertTrue(
                "$name: sparkInverse ${c.sparkInverse.hex()} on inverseSurface " +
                    "${c.inverseSurface.hex()} is $onCard, under 4.5:1 — this is the pair that " +
                    "was invisible in dark for an entire release",
                onCard >= 4.5f,
            )
            val onFill = contrast(c.sparkInverse, c.primary)
            assertTrue(
                "$name: sparkInverse on the primary fill is $onFill, under the 3:1 a mark needs " +
                    "against its own background",
                onFill >= 3.0f,
            )
        }
    }

    /**
     * The action and the warning are never the same paint. This is not a general aesthetic
     * claim — the link pill draws `primary` for CASTING/PAIRED and `caution` for OFFLINE in
     * the SAME seat in the library header, both as a solid warm fill with near-black ink,
     * so with an amber action the two states would be indistinguishable before the words
     * are even read.
     *
     * 1.6 is the floor rather than 3, because these two are never drawn on each other: they
     * are alternative fills for one control, so what has to separate them is a step the eye
     * notices across a state change, not a legibility ratio. The dark sets sit at 1.79:1
     * with 28.2° of hue between them; light sits at 3.58:1 and needs none of this.
     */
    @Test fun theActionAndTheWarningAreNeverTheSamePaint() {
        for ((name, c) in allPalettes) {
            val step = contrast(c.primary, c.caution)
            assertTrue(
                "$name: primary ${c.primary.hex()} and caution ${c.caution.hex()} are $step " +
                    "apart — the link pill shows either one in the same seat, and a state has " +
                    "to be readable before its label is",
                step >= 1.6f,
            )
        }
    }

    /**
     * The media pair is the same amber in every set, and it is the two stops
     * [FlickGradients.playhead] and [FlickGradients.fab] are built from.
     *
     * This is arithmetic standing in for a mechanism. Those two brushes are plain `val`s,
     * so they cannot follow a palette — and making them follow one would cost a shader
     * allocation and a `remember` slot per call in the app's hottest draw path, the scrub
     * bar under a drag while the phone is serving 4K, to return a byte-identical brush.
     * Correct only for as long as the media roles stay pinned, so the pinning is what is
     * asserted; the day someone re-hues the scrub fill or the FAB this fails loudly rather
     * than shipping a gradient that disagrees with the palette it is drawn from.
     *
     * It is also the one claim this product makes about colour: the scrub fill, the play key
     * and the dock are the film's own light, in light mode and in dark.
     */
    @Test fun theMediaAccentIsTheSameAmberInEverySetAndIsWhatTheBrushesAreBuiltFrom() {
        for ((name, c) in allPalettes) {
            assertTrue(
                "$name: playheadHi is ${c.playheadHi.hex()}, not the PlayheadHi " +
                    "${PlayheadHi.hex()} FlickGradients.playhead and .fab open on — those " +
                    "brushes are palette-independent vals and have just been made wrong",
                c.playheadHi == PlayheadHi,
            )
            assertTrue(
                "$name: playheadLo is ${c.playheadLo.hex()}, not the PlayheadLo " +
                    "${PlayheadLo.hex()} those two brushes close on",
                c.playheadLo == PlayheadLo,
            )
        }
    }

    /**
     * Both badges in this app — Settings' support heart and the Devices screen's TV — draw
     * a fixed [Spark] glyph on each palette's own `onSpark` disc. They are the only marks
     * that step outside the set they sit in, and deliberately: `spark` itself turns blue in
     * the cinematic assignment, and a glyph that is its card's single warm note cannot be
     * warm on two screens out of three.
     *
     * What makes the constant safe is only that the disc is dark in every set. A palette
     * that ever lightened `onSpark` would leave a warm mark on a warm ground with nothing
     * to catch it, and that is a thing no palette listing shows.
     */
    @Test fun theBadgeGlyphsStillReadOnTheirOwnDiscInEverySet() {
        for ((name, c) in allPalettes) {
            val onDisc = contrast(Spark, c.onSpark)
            assertTrue(
                "$name: a badge's Spark ${Spark.hex()} on onSpark " +
                    "${c.onSpark.hex()} is $onDisc, under the 3:1 a mark needs against its " +
                    "own background",
                onDisc >= 3.0f,
            )
        }
    }

    /**
     * The two badge cards carry their type on the pale spark fill rather than on a card
     * fill, which is the trade they make for being found: `sparkPale` is a lighter ground
     * than anything else either screen puts text on. Body copy runs at 82% `onSpark` there,
     * so that is the ink the rule has to be measured against and not the full-strength token.
     */
    @Test fun badgeCardBodyCopyClearsFourAndAHalfOnTheSparkFill() {
        for ((name, c) in allPalettes) {
            val body = c.onSpark.copy(alpha = 0.82f).over(c.sparkPale)
            val ratio = contrast(body, c.sparkPale)
            assertTrue(
                "$name: badge-card body ink ${body.hex()} on sparkPale " +
                    "${c.sparkPale.hex()} is $ratio, under the 4.5:1 body text needs",
                ratio >= 4.5f,
            )
        }
    }

    /**
     * The ink ramp keeps its order. Three roles that have crossed over are three roles
     * that no longer mean anything, and the crossing is invisible in a palette listing.
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
     * The quietest ink still reads as an EDGE, on the raised surface and on the tonal fill
     * it encloses. This is a rule about a role being borrowed rather than about ink: the
     * pairing code's four cells and the manual-address form's three fields both stroke
     * themselves in `onSurfaceFaint`, because no outline role in this palette reaches 3:1
     * on either theme — `outline` measures 1.43:1 on the light sheet and 1.76:1 on the dark
     * one, which is a control with no perceptible container at all.
     *
     * So the floor is 3, the figure a control owes the surface behind it, and it is checked
     * on both grounds because a stroke has a surface on each side of it. The right long-term
     * fix is a real `outlineStrong` role; until there is one, two components depend on this
     * ink staying where it is and nothing else would notice it moving.
     */
    @Test fun theQuietestInkCanStillCarryAnEdge() {
        for ((name, c) in palettes) {
            val onSheet = contrast(c.onSurfaceFaint, c.surfaceRaised)
            assertTrue(
                "$name: onSurfaceFaint ${c.onSurfaceFaint.hex()} is $onSheet against " +
                    "surfaceRaised ${c.surfaceRaised.hex()} — the code cells and the manual " +
                    "form borrow it as their resting stroke and would lose their edge",
                onSheet >= 3.0f,
            )
            val onFill = contrast(c.onSurfaceFaint, c.surfaceRaisedAlt)
            assertTrue(
                "$name: onSurfaceFaint is $onFill against the surfaceRaisedAlt fill it " +
                    "encloses — a stroke has a surface on each side of it",
                onFill >= 3.0f,
            )
        }
    }

    /**
     * Dark mode is the same product as light mode, not a navy one.
     *
     * The measure is chroma relative to the surface's own brightness: the light canvas
     * spends 5% of its brightest channel on colour, and the cinematic stops this set
     * replaced spent about 80%, which is what made dark mode read as a different app
     * rather than as the same app at night. Dark legitimately carries more than light —
     * there is more room for it down there — but there is a difference between a tint and
     * a wash, and this is where it sits.
     */
    @Test fun theDarkSurfacesAreTintedRatherThanSaturated() {
        val surfaces = with(DarkFlickColors) {
            listOf("canvas" to canvas, "surfaceRaised" to surfaceRaised, "surfaceRaisedAlt" to surfaceRaisedAlt)
        }
        for ((name, s) in surfaces) {
            val chroma = s.relativeChroma()
            assertTrue("dark $name is ${(chroma * 100).toInt()}% chroma — that is a navy, not a tint", chroma < 0.6f)
        }
    }

    // --- generic floating chrome: light navigation and the Now-Playing dock ---

    /**
     * `glass` is the generic floating-surface role. It is translucent, so the colour
     * actually drawn does not exist until it is drawn over something.
     *
     * Both pieces of floating chrome now take a real backdrop blur, and Haze owns their
     * material: the pill and the Now-Playing dock are tinted stacks measured in
     * FlickBottomNavStyleTest, at their own budgets. That leaves `glass` reaching the screen
     * in exactly one place — as the colour the LIGHT tint is a translucent copy of — and
     * leaves `DarkFlickColors.glass` drawn nowhere at all.
     *
     * The rules below are kept as a ratchet on the role rather than as a measurement of a
     * pixel: a `glass` that drifts grey, opaque or unseparated is a palette regression
     * whichever surface next asks for it. They are measured twice, over the page and over
     * the extreme backdrop that drags the fill toward its ink, because floating chrome sits
     * over artwork.
     */
    private fun FlickColors.glassOnPage() = glass.over(canvas)

    /**
     * …and the sheen laid over the glass is part of the glass, which this file learned the
     * hard way. [FlickGradients.navSheenDark] runs DOWN the pill and closes on a pale blue
     * stop, so the bar's labels sit in the interpolating tail of it rather than on bare
     * glass. Measuring the ink against the previous fill alone put `onSurfaceDim` at 4.88:1
     * while the device drew it at 4.31:1 — a label under the floor, passing.
     *
     * The two fractions are where the bar's own layout puts things, as a share of its height:
     * an icon spans roughly 21-51% down (11 dp row padding, 6 dp box padding, a 24 dp glyph)
     * and a label sits at roughly 73%. So the icon is caught in the white opening stop and
     * the label in the blue closing one, and they need separate figures.
     */
    /** Where a label's glyphs sit down the pill, as a share of its height. */
    private val LABEL_DEPTH = 0.73f

    /** Where the top of an icon sits — the worst point for it, being the palest. */
    private val ICON_DEPTH = 0.21f

    private fun FlickColors.sheenedAtLabel(backdrop: Color): Color {
        // Read from the real stop position rather than a copy of it, so moving the wash in
        // the gradient moves this with it — the two drifting apart is the whole defect.
        val footStart = if (isLight) NavSheenClearStart else NavSheenFootStart
        val foot = if (isLight) NavSheenLightFoot else NavSheenDarkFoot
        val share = ((LABEL_DEPTH - footStart) / (1f - footStart)).coerceAtLeast(0f)
        return foot.copy(alpha = foot.alpha * share).over(glass.over(backdrop))
    }

    private fun FlickColors.sheenedAtIcon(backdrop: Color): Color {
        // The icon begins after the tight rim, between its shoulder and the faint body
        // stop. Read the real colours and positions so the contrast proof follows the
        // shader if that optical highlight is retuned.
        val share = (ICON_DEPTH - NavSheenLipEnd) / (NavSheenBodyEnd - NavSheenLipEnd)
        val shoulder = if (isLight) NavSheenLightShoulder else NavSheenDarkShoulder
        val body = if (isLight) NavSheenLightBody else NavSheenDarkBody
        val alpha = shoulder.alpha + share * (body.alpha - shoulder.alpha)
        return Color.White.copy(alpha = alpha).over(glass.over(backdrop))
    }

    /** The colour a surface carries, in channel steps out of 255. A grey scores 0. */
    private fun Color.channelSpread(): Int {
        val channels = listOf(red, green, blue)
        return ((channels.max() - channels.min()) * 255f).roundToInt()
    }

    /**
     * Both themes' generic floating chrome carries the brand. This protects the dock and
     * the light navigation treatment; dark navigation uses its separately tested blue tint.
     */
    @Test fun theFloatingGlassCarriesTheBrandInBothThemes() {
        for ((name, c) in palettes) {
            val spread = c.glass.channelSpread()
            assertTrue(
                "$name: glass ${c.glass.hex()} carries $spread channel steps of colour — the " +
                    "Now-Playing dock and light navigation should not read as grey slate",
                spread >= 40,
            )
        }
    }

    /** Persistent floating chrome must leave real backdrop in the material, not only fake it with a sheen. */
    @Test fun theFloatingChromeLetsTheBackdropParticipate() {
        assertTrue(
            "light glass is ${(LightFlickColors.glass.alpha * 100).toInt()}% opaque — it reads as a solid fill",
            LightFlickColors.glass.alpha <= 230f / 255f,
        )
        assertTrue(
            "dark glass is ${(DarkFlickColors.glass.alpha * 100).toInt()}% opaque — it reads as a solid fill",
            DarkFlickColors.glass.alpha <= 248f / 255f,
        )
    }

    /**
     * The dark chrome separates from every surface it floats over, and has to carry that
     * separation on its own tone. A tinted drop shadow is how light mode makes a pale page
     * darker underneath a pill, and on a near-black canvas there is nothing darker left to
     * make — which is why 1.10:1 over `surfaceRaisedAlt` read as a pill lying on the page
     * rather than floating above it.
     */
    @Test fun theDarkGlassSeparatesFromEverySurfaceItFloatsOver() {
        val c = DarkFlickColors
        val drawn = c.glassOnPage()
        val surfaces = listOf(
            "canvas" to c.canvas,
            "surface" to c.surface,
            "surfaceRaised" to c.surfaceRaised,
            "surfaceRaisedAlt" to c.surfaceRaisedAlt,
        )
        for ((name, s) in surfaces) {
            val step = contrast(drawn, s)
            assertTrue(
                "dark: the drawn glass ${drawn.hex()} is $step from $name ${s.hex()} — the dock " +
                    "stops reading as floating chrome",
                step >= 1.30f,
            )
        }
    }

    /**
     * Every ink the dark glass role would carry, held on the page AND over the worst still.
     * `onSurface` and `onSurfaceDim` are a floating bar's title and subtitle, so they are
     * text at 4.5; `playheadLo` is its played hairline, a graphic at 3. The dock drew these
     * three on bare `glass` until it moved onto Haze — see the note above the section.
     *
     * That third entry was `spark` until the action colour moved. The dock's key had to
     * follow the MEDIA roles rather than the accent, because the key morphs into the
     * remote's FAB — which is amber in every set — and a shared-element flight that changes
     * hue mid-air is the most visible thing this palette change could have produced. So the
     * accent is now drawn on the glass nowhere, and asserting an ink against a surface the
     * app never puts it on is what this file says not to do two rules up.
     *
     * Worth the measurement it replaces: the accent blue would have failed here anyway, at
     * 2.64:1 on the icon row over the page. Amber holds 5.18:1 and 3.97:1 there, and 4.68:1
     * and 3.61:1 with a blown-out still behind it.
     */
    @Test fun everyInkOnTheDarkGlassHoldsWhateverIsBehindIt() {
        val c = DarkFlickColors
        val backdrops = listOf("the page" to c.canvas, "a blown-out still" to Color.White)
        val inks = listOf(
            Triple("onSurface", c.onSurface, 4.5f),
            Triple("onSurfaceDim", c.onSurfaceDim, 4.5f),
            Triple("playheadLo", c.playheadLo, 3.0f),
        )
        for ((bName, backdrop) in backdrops) {
            for ((iName, i, floor) in inks) {
                // The label row, under the sheen's closing stop — this is the figure the
                // device actually draws, and the one that was missing.
                val onLabel = contrast(i, c.sheenedAtLabel(backdrop))
                assertTrue(
                    "dark: $iName on the glass at the LABEL row over $bName is $onLabel, under " +
                        "$floor:1 — the sheen's closing stop lands on the labels, so the bare " +
                        "glass figure is not the one that matters",
                    onLabel >= floor,
                )
                // The icon row sits in the white opening stop instead. An icon is a
                // graphical object, so 3:1 is its floor rather than 4.5.
                val onIcon = contrast(i, c.sheenedAtIcon(backdrop))
                assertTrue(
                    "dark: $iName on the glass at the ICON row over $bName is $onIcon, under 3:1",
                    onIcon >= 3.0f,
                )
            }
        }
    }

    /**
     * Light's chrome is a RATCHET rather than a standard, on the same grounds as
     * [theLightSetNeverDropsBelowWhereItStandsToday]: its worst pair is `onSurfaceDim` at
     * 4.29:1 over a black still, under the floor for text, and light is not the theme this
     * change is for. Pinned just under where it stands so the gap can close but not deepen.
     */
    @Test fun theLightGlassNeverDropsBelowWhereItStandsToday() {
        val c = LightFlickColors
        val backdrops = listOf("the page" to c.canvas, "a black still" to Color.Black)
        for ((name, backdrop) in backdrops) {
            val surfaces = listOf(
                "the label row over $name" to c.sheenedAtLabel(backdrop),
                "the icon row over $name" to c.sheenedAtIcon(backdrop),
            )
            for ((surfaceName, surface) in surfaces) {
                assertTrue(
                    "light: onSurface on $surfaceName is ${contrast(c.onSurface, surface)}",
                    contrast(c.onSurface, surface) >= 11.3f,
                )
                assertTrue(
                    "light: onSurfaceDim on $surfaceName is ${contrast(c.onSurfaceDim, surface)} — " +
                        "the light glass regressed",
                    contrast(c.onSurfaceDim, surface) >= 4.25f,
                )
            }
        }
    }

    // --- WCAG 2.x relative luminance and contrast, on straight sRGB ---

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

    private fun Color.hex() =
        "#%02X%02X%02X".format((red * 255).toInt(), (green * 255).toInt(), (blue * 255).toInt())
}
