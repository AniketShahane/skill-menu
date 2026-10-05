package com.flick.receiver.ui.theme

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Typography
import com.flick.receiver.R

/**
 * Typography (receiver-expressive-spec.md §4), TV scale. Three bundled families:
 *  - **Display** — Bricolage Grotesque (700/800): headlines, the now-playing
 *    title, the wordmark.
 *  - **Body / UI** — Geist (500/600/700): reading copy, row labels, button text.
 *  - **Mono** — Geist Mono (500/600): timecodes, telemetry, the pairing code,
 *    uppercase eyebrows.
 *
 * The faces are `res/font` resources, not downloadable Google Fonts. A TV whose
 * Play Services font catalogue lags would have silently rendered the platform
 * default with no error, and Play Services updates lag hardest on TV hardware.
 * Bundling also removes the fallback-face flash on first paint.
 *
 * Every metric below answers to a 3 m viewing distance, which inverts the phone's
 * instincts: nothing renders under [MIN_SIZE_SP], no weight falls under
 * [MIN_WEIGHT], and tracking is *looser* than a phone's, never tighter — tight
 * tracking that flatters type at arm's length closes the counters at 10 ft.
 *
 * The scale is sized against the panel it ships on, not against a phone's: at
 * density 2.0 a 1080p TV is a **960 × 540 dp** canvas, so there is *less* height
 * here than on a phone. Type that assumed room to spare overflowed it.
 */
object FlickType {

    // ── Ten-foot floors ─────────────────────────────────────────────────────
    // The helpers clamp their arguments rather than trust them, so no screen can
    // drop a style under the ten-foot floor by passing a phone-tight number. The
    // floor is a floor and nothing more: it is low enough that every role in the
    // scale clears it, so clamping can never pull two roles onto one size. An
    // earlier 24 sp clamp did exactly that — it collapsed seven distinct roles
    // onto a single size and cost the hierarchy.

    /** Nothing a viewer must read renders below this. */
    private const val MIN_SIZE_SP = 14

    /** The default reading-copy size — [FlickTvTypography]'s `bodyMedium`. */
    private const val DEFAULT_BODY_SIZE_SP = 16

    /** Avoid thin strokes at distance — Light and Regular are out of range. */
    private val MIN_WEIGHT = FontWeight.Medium

    /** Tightest tracking display type may take; the phone's −0.045 em is not it. */
    private const val DISPLAY_TRACKING_EM = -0.02f

    /** UI tracking never goes negative at 3 m; a hair positive opens the counters. */
    private const val UI_TRACKING_EM = 0.005f

    /** Multi-line copy needs this much leading before it reads across a room. */
    private const val MIN_LINE_HEIGHT_RATIO = 1.3f

    /** Reading copy needs more still. */
    private const val MIN_BODY_LINE_HEIGHT_RATIO = 1.4f

    /**
     * `tnum` pins digit advance so a ticking timecode never shimmies; `zero` asks
     * for the slashed zero, because the pairing code is read off this screen and
     * typed into a phone where `0` and `O` must not be confusable.
     *
     * Both are belt-and-braces against a future font drop rather than load-bearing
     * today: the bundled Geist Mono binaries expose neither feature, but every
     * digit in them already advances exactly 0.6 em and their default zero is
     * already slashed. Absent features are ignored, so the string stays correct
     * either way.
     */
    private const val NUMERIC_FEATURES = "tnum, zero"

    // ── Families ────────────────────────────────────────────────────────────
    // Only the weights actually asked for are declared; an unreferenced res/font
    // file is dead weight in the APK.

    /** Bricolage Grotesque — display / headlines / wordmark. */
    val Display: FontFamily = FontFamily(
        Font(R.font.bricolage_bold, FontWeight.Bold),
        Font(R.font.bricolage_extrabold, FontWeight.ExtraBold),
    )

    /** Geist — body / UI. */
    val Body: FontFamily = FontFamily(
        Font(R.font.geist_medium, FontWeight.Medium),
        Font(R.font.geist_semibold, FontWeight.SemiBold),
        Font(R.font.geist_bold, FontWeight.Bold),
    )

    /** Geist Mono — timecode / telemetry / pairing code / eyebrows. */
    val Mono: FontFamily = FontFamily(
        Font(R.font.geist_mono_medium, FontWeight.Medium),
        Font(R.font.geist_mono_semibold, FontWeight.SemiBold),
    )

    /**
     * The same seven faces again, as bare resources, for [warmBundledTypefaces].
     *
     * A second list rather than a derivation because `FontListFontFamily` does not
     * expose its `ResourceFont` ids, and because what the warm needs is a resource id
     * — not a family, weight or style. It is a cache warm and nothing depends on it
     * being complete: a face missing from here costs one blocking parse on the thread
     * that first measures it, which is exactly the cost without the warm at all.
     */
    internal val BundledFaces: IntArray = intArrayOf(
        R.font.bricolage_bold,
        R.font.bricolage_extrabold,
        R.font.geist_medium,
        R.font.geist_semibold,
        R.font.geist_bold,
        R.font.geist_mono_medium,
        R.font.geist_mono_semibold,
    )

    /**
     * Tabular monospace style for any running number (timecodes, throughput,
     * RSSI, bitrate, the clock pill, the pairing code).
     *
     * No line height is set: Geist Mono's own line box is 1.30 em, which already
     * clears [MIN_LINE_HEIGHT_RATIO], and callers that pack numbers into a fixed
     * panel tighten it themselves. No tracking either — a 0.6 em monospaced
     * advance is generous enough at distance without help.
     */
    fun monoTabular(
        sizeSp: Int,
        weight: FontWeight = FontWeight.SemiBold,
        family: FontFamily = Mono,
        letterSpacing: TextUnit = TextUnit.Unspecified,
    ): TextStyle = TextStyle(
        fontFamily = family,
        fontWeight = weight.coerceAtLeast(MIN_WEIGHT),
        fontSize = sizeSp.coerceAtLeast(MIN_SIZE_SP).sp,
        letterSpacing = letterSpacing,
        fontFeatureSettings = NUMERIC_FEATURES,
    )

    /**
     * The uppercase mono micro-label — eyebrows, stat labels, spec chips, health
     * pills. Callers uppercase the text themselves so the string resource stays
     * the source of truth.
     *
     * [sizeSp] defaults to [MIN_SIZE_SP] because this *is* the smallest role in
     * the scale — `labelMedium` / `labelSmall`. It is the one style that sits on
     * the floor by design rather than by clamping.
     *
     * [trackingEm] is floored, never capped: wide tracking is the whole device
     * here, it runs in the loose direction the ten-foot read wants, and the
     * metrics panel's fixed width is measured against the exact values its call
     * sites pass. `tnum` is carried too — these labels interleave numbers
     * (`5 GHz · −44 dBm`).
     */
    fun monoEyebrow(
        sizeSp: Int = MIN_SIZE_SP,
        trackingEm: Float = 0.2f,
        weight: FontWeight = FontWeight.SemiBold,
    ): TextStyle = TextStyle(
        fontFamily = Mono,
        fontWeight = weight.coerceAtLeast(MIN_WEIGHT),
        fontSize = sizeSp.coerceAtLeast(MIN_SIZE_SP).sp,
        letterSpacing = trackingEm.coerceAtLeast(UI_TRACKING_EM).em,
        fontFeatureSettings = NUMERIC_FEATURES,
    )

    /**
     * Bricolage display style — the §1a "display" class, heavy and open.
     *
     * The line-height floor is doing real work, not just meeting the scale:
     * Bricolage's own line box is 1.20 em, so any ratio under the floor would clip
     * ascenders on a headline that wraps, and the pairing headline wraps by an
     * embedded newline.
     */
    fun display(
        sizeSp: Int,
        weight: FontWeight = FontWeight.ExtraBold,
        trackingEm: Float = DISPLAY_TRACKING_EM,
        lineHeightRatio: Float = MIN_LINE_HEIGHT_RATIO,
    ): TextStyle {
        val size = sizeSp.coerceAtLeast(MIN_SIZE_SP)
        return TextStyle(
            fontFamily = Display,
            fontWeight = weight.coerceAtLeast(MIN_WEIGHT),
            fontSize = size.sp,
            lineHeight = (size * lineHeightRatio.coerceAtLeast(MIN_LINE_HEIGHT_RATIO)).sp,
            letterSpacing = trackingEm.coerceAtLeast(DISPLAY_TRACKING_EM).em,
        )
    }

    /**
     * Geist reading copy — never below the [MIN_SIZE_SP] floor. The three body
     * roles it stands in for are 18 / 16 / 15 sp, so callers pass the one they
     * mean; the default is the middle of those.
     */
    fun body(
        sizeSp: Int = DEFAULT_BODY_SIZE_SP,
        weight: FontWeight = FontWeight.SemiBold,
        trackingEm: Float = UI_TRACKING_EM,
        lineHeightRatio: Float = MIN_BODY_LINE_HEIGHT_RATIO,
    ): TextStyle {
        val size = sizeSp.coerceAtLeast(MIN_SIZE_SP)
        return TextStyle(
            fontFamily = Body,
            fontWeight = weight.coerceAtLeast(MIN_WEIGHT),
            fontSize = size.sp,
            lineHeight = (size * lineHeightRatio.coerceAtLeast(MIN_BODY_LINE_HEIGHT_RATIO)).sp,
            letterSpacing = trackingEm.coerceAtLeast(UI_TRACKING_EM).em,
        )
    }
}

/**
 * TV typography for the theme. Roles map to the §1a ten-foot scale:
 *  - display* / headline* / titleLarge — Bricolage, the expressive voice, −0.02 em.
 *  - title(Medium|Small) / body* / labelLarge — Geist reading copy, non-negative
 *    tracking, 15–18 sp.
 *  - label(Medium|Small) — the uppercase Geist Mono micro-label, 14 sp flat.
 *
 * Fifteen roles, fifteen deliberate sizes — 40 / 31 / 27 / 27 / 22 / 20 / 21 /
 * 18 / 17 / 18 / 16 / 15 / 16 / 14 / 14 sp. Repeats are intentional pairs that
 * separate by family, weight or tracking rather than by size. Nothing is under
 * 14 sp and nothing is clamped up into its neighbour: the hierarchy is the
 * point, and a 960 × 540 dp canvas has no room to spend on type that is merely
 * large.
 *
 * Line heights are ≥ 1.3 × the size, and ≥ 1.4 × for the three body roles.
 *
 * Screen owners must not override these below 14 sp.
 */
val FlickTvTypography: Typography = Typography(
    // Pairing headline — the largest type the receiver ever draws.
    displayLarge = TextStyle(
        fontFamily = FlickType.Display,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 40.sp,
        lineHeight = 52.sp,
        letterSpacing = (-0.02).em,
    ),
    displayMedium = TextStyle(
        fontFamily = FlickType.Display,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 31.sp,
        lineHeight = 41.sp,
        letterSpacing = (-0.02).em,
    ),
    displaySmall = TextStyle(
        fontFamily = FlickType.Display,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 27.sp,
        lineHeight = 36.sp,
        letterSpacing = (-0.02).em,
    ),
    // Now-playing title.
    headlineLarge = TextStyle(
        fontFamily = FlickType.Display,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 27.sp,
        lineHeight = 36.sp,
        letterSpacing = (-0.02).em,
    ),
    // Handshake title / panel headers.
    headlineMedium = TextStyle(
        fontFamily = FlickType.Display,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 22.sp,
        lineHeight = 29.sp,
        letterSpacing = (-0.02).em,
    ),
    headlineSmall = TextStyle(
        fontFamily = FlickType.Display,
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
        letterSpacing = (-0.02).em,
    ),
    titleLarge = TextStyle(
        fontFamily = FlickType.Display,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 21.sp,
        lineHeight = 28.sp,
        letterSpacing = (-0.02).em,
    ),
    titleMedium = TextStyle(
        fontFamily = FlickType.Body,
        fontWeight = FontWeight.Bold,
        fontSize = 18.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.005.em,
    ),
    titleSmall = TextStyle(
        fontFamily = FlickType.Body,
        fontWeight = FontWeight.Bold,
        fontSize = 17.sp,
        lineHeight = 23.sp,
        letterSpacing = 0.005.em,
    ),
    bodyLarge = TextStyle(
        fontFamily = FlickType.Body,
        fontWeight = FontWeight.SemiBold,
        fontSize = 18.sp,
        lineHeight = 26.sp,
        letterSpacing = 0.005.em,
    ),
    bodyMedium = TextStyle(
        fontFamily = FlickType.Body,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 23.sp,
        letterSpacing = 0.005.em,
    ),
    bodySmall = TextStyle(
        fontFamily = FlickType.Body,
        fontWeight = FontWeight.Medium,
        fontSize = 15.sp,
        lineHeight = 21.sp,
        letterSpacing = 0.005.em,
    ),
    labelLarge = TextStyle(
        fontFamily = FlickType.Body,
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp,
        lineHeight = 21.sp,
        letterSpacing = 0.005.em,
    ),
    // The uppercase mono micro-label — 14 sp flat, wide tracking.
    labelMedium = TextStyle(
        fontFamily = FlickType.Mono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 19.sp,
        letterSpacing = 0.14.em,
        fontFeatureSettings = "tnum, zero",
    ),
    labelSmall = TextStyle(
        fontFamily = FlickType.Mono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 19.sp,
        letterSpacing = 0.2.em,
        fontFeatureSettings = "tnum, zero",
    ),
)
