package com.example.starter.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextMotion
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.example.starter.R

/*
 * Three bundled faces: Bricolage Grotesque for display and titles, Geist for everything that
 * is read, Geist Mono for every running number. All are static `res/font` files, never a
 * downloadable-font provider: Flick's provider path shipped an empty certificate array and
 * rendered the platform default for its whole life with no error (flick@40791d0). Licences
 * are in assets/licenses/ (SIL OFL 1.1).
 *
 * Each family declares exactly the weights the scale below asks for. A weight not declared
 * silently resolves to the nearest declared one, and an undeclared file is dead APK weight.
 * The next app may swap faces; keep the three jobs and re-derive the scale.
 */

val DisplayFont: FontFamily = FontFamily(
    Font(R.font.bricolage_bold, FontWeight.Bold),
    Font(R.font.bricolage_extrabold, FontWeight.ExtraBold),
)

/** Cut from Geist's variable font (v1.800) as static instances with fontTools; see theme-and-type.md. */
val BodyFont: FontFamily = FontFamily(
    Font(R.font.geist_regular, FontWeight.Normal),
    Font(R.font.geist_medium, FontWeight.Medium),
    Font(R.font.geist_semibold, FontWeight.SemiBold),
    Font(R.font.geist_bold, FontWeight.Bold),
)

val MonoFont: FontFamily = FontFamily(
    Font(R.font.geist_mono_medium, FontWeight.Medium),
    Font(R.font.geist_mono_semibold, FontWeight.SemiBold),
)

/**
 * Every face above as a bare resource id, for startFontWarmup. A second list rather than a
 * derivation, because a FontFamily does not expose its resource ids. A face missing here costs
 * one blocking parse on the first measure that needs it (flick: receiver/.../Type.kt:102-119).
 */
internal val BundledFaces: IntArray = intArrayOf(
    R.font.bricolage_bold,
    R.font.bricolage_extrabold,
    R.font.geist_regular,
    R.font.geist_medium,
    R.font.geist_semibold,
    R.font.geist_bold,
    R.font.geist_mono_medium,
    R.font.geist_mono_semibold,
)

/** The families, for the Compose-side preload that runs as a second pass (AppTheme.kt). */
internal val BundledFamilies: List<FontFamily> = listOf(DisplayFont, BodyFont, MonoFont)

/**
 * Figures of one width. Geist's default digits are proportional: a countdown set in it
 * ("4:37 left") changed width every second and shoved whatever was lined up beside it
 * (dash@1940b64, ui/Theme.kt:153-157). Bricolage has `tnum` too; the hero number uses it.
 */
private const val TabularFigures = "tnum"

/**
 * For the mono face. Declared intent more than mechanism: the bundled Geist Mono exposes no
 * `tnum` or `zero` feature (checked with fontTools: its GSUB has ccmp, dnom, frac, locl, numr)
 * because every digit already advances 0.6 em and its default zero already carries the slash.
 * Absent features are ignored, and the string keeps a later re-cut honest.
 */
private const val NumericFeatures = "tnum, zero"

/**
 * Every style animates its glyph positions. The starter's reveal scales cards 0.97 → 1, and
 * glyphs laid out for a static frame shimmer under that scale (dash@03174fc, ui/Theme.kt:100-105).
 * The cost: static text loses pixel-snapped glyph positions, which on a low-density screen
 * reads very slightly softer. An app that never scales text can drop this.
 */
private fun TextStyle.animated(): TextStyle = copy(textMotion = TextMotion.Animated)

// --- display: Bricolage, ExtraBold/Bold, tight leading (Flick's scale, sender/.../Type.kt:65-117) ---

private val displayLarge = TextStyle(
    fontFamily = DisplayFont, fontWeight = FontWeight.ExtraBold,
    fontSize = 44.sp, lineHeight = 42.sp, letterSpacing = (-0.045).em,
)
private val displayMedium = displayLarge.copy(fontSize = 34.sp, lineHeight = 34.sp)
private val headlineLarge = TextStyle(
    fontFamily = DisplayFont, fontWeight = FontWeight.ExtraBold,
    fontSize = 30.sp, lineHeight = 31.sp, letterSpacing = (-0.04).em,
)
private val headlineMedium = headlineLarge.copy(fontSize = 26.sp, lineHeight = 30.sp)
private val headlineSmall = TextStyle(
    fontFamily = DisplayFont, fontWeight = FontWeight.ExtraBold,
    fontSize = 24.sp, lineHeight = 28.sp, letterSpacing = (-0.035).em,
)
private val titleLarge = headlineSmall.copy(fontSize = 23.sp, lineHeight = 24.sp)
private val titleMedium = TextStyle(
    fontFamily = DisplayFont, fontWeight = FontWeight.Bold,
    fontSize = 19.sp, lineHeight = 23.sp, letterSpacing = (-0.03).em,
)
private val titleSmall = TextStyle(
    fontFamily = DisplayFont, fontWeight = FontWeight.Bold,
    fontSize = 16.sp, lineHeight = 20.sp, letterSpacing = (-0.025).em,
)

// --- read: Geist, tabular, tracking pinned to 0 (Dash's body sizes, ui/Theme.kt:112-113) ---
//
// Tracking is pinned rather than left unspecified. Material's defaults track small text out by
// up to 0.5 sp, tuned for Roboto; on Geist that set Dash's run-screen text a line longer
// (ui/Theme.kt:138-145). And an unspecified value lets ProvideTextStyle leak a display role's
// negative tracking into body copy nested in a button (flick: sender/.../Type.kt:120-123).

private fun body(weight: FontWeight, size: Float, line: Float) = TextStyle(
    fontFamily = BodyFont, fontWeight = weight,
    fontSize = size.sp, lineHeight = line.sp, letterSpacing = 0.em,
    fontFeatureSettings = TabularFigures,
)

private val bodyLarge = body(FontWeight.Normal, 16f, 23f)
private val bodyMedium = body(FontWeight.Normal, 14f, 20f)
private val bodySmall = body(FontWeight.Normal, 12f, 16f)
private val labelLarge = body(FontWeight.SemiBold, 14f, 18f)
private val labelMedium = body(FontWeight.Medium, 12f, 16f)
private val labelSmall = body(FontWeight.Medium, 11f, 14f)

// --- emphasized: what Material's expressive components ask for ---
//
// Bricolage bundles nothing above ExtraBold, which the display roles already wear, so they buy
// emphasis with 0.005 em tighter tracking (Flick). The Bold titles step to ExtraBold. Geist
// steps Regular → SemiBold (Dash's step; Medium is too close to see) and SemiBold → Bold.
// Never ship an emphasized role identical to its base: the component asked for a difference.

private fun TextStyle.tighter(): TextStyle =
    copy(letterSpacing = (letterSpacing.value - 0.005f).em)

/**
 * All 30 roles. The emphasized half is not optional: expressive components read those roles
 * directly, and a Typography that leaves them unset falls back to the platform face
 * (flick: sender/.../Type.kt:276-280).
 */
val AppTypography: Typography = Typography(
    displayLarge = displayLarge.animated(),
    displayMedium = displayMedium.animated(),
    displaySmall = headlineLarge.animated(),
    headlineLarge = headlineLarge.animated(),
    headlineMedium = headlineMedium.animated(),
    headlineSmall = headlineSmall.animated(),
    titleLarge = titleLarge.animated(),
    titleMedium = titleMedium.animated(),
    titleSmall = titleSmall.animated(),
    bodyLarge = bodyLarge.animated(),
    bodyMedium = bodyMedium.animated(),
    bodySmall = bodySmall.animated(),
    labelLarge = labelLarge.animated(),
    labelMedium = labelMedium.animated(),
    labelSmall = labelSmall.animated(),
    displayLargeEmphasized = displayLarge.tighter().animated(),
    displayMediumEmphasized = displayMedium.tighter().animated(),
    displaySmallEmphasized = headlineLarge.tighter().animated(),
    headlineLargeEmphasized = headlineLarge.tighter().animated(),
    headlineMediumEmphasized = headlineMedium.tighter().animated(),
    headlineSmallEmphasized = headlineSmall.tighter().animated(),
    titleLargeEmphasized = titleLarge.tighter().animated(),
    titleMediumEmphasized = titleMedium.copy(fontWeight = FontWeight.ExtraBold).animated(),
    titleSmallEmphasized = titleSmall.copy(fontWeight = FontWeight.ExtraBold).animated(),
    bodyLargeEmphasized = bodyLarge.copy(fontWeight = FontWeight.SemiBold).animated(),
    bodyMediumEmphasized = bodyMedium.copy(fontWeight = FontWeight.SemiBold).animated(),
    bodySmallEmphasized = bodySmall.copy(fontWeight = FontWeight.SemiBold).animated(),
    labelLargeEmphasized = labelLarge.copy(fontWeight = FontWeight.Bold).animated(),
    labelMediumEmphasized = labelMedium.copy(fontWeight = FontWeight.SemiBold).animated(),
    labelSmallEmphasized = labelSmall.copy(fontWeight = FontWeight.SemiBold).animated(),
)

/** Styles components use directly, for jobs Material has no role for. */
object AppText {

    /**
     * Section eyebrow above a group. Caller supplies UPPERCASE copy. Mono at wide tracking
     * (0.11 em), which is what makes a label read as a label rather than as a small heading
     * (flick: `monoEyebrow`, sender/.../Type.kt:195-201).
     */
    val eyebrow: TextStyle = TextStyle(
        fontFamily = MonoFont, fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp, lineHeight = 14.sp, letterSpacing = 0.11.em,
        fontFeatureSettings = NumericFeatures,
    ).animated()

    /**
     * A value in a row: a duration, a size, a count. Medium rather than Flick's SemiBold,
     * because here mono sits beside Regular body copy and should not outweigh it.
     */
    val monoValue: TextStyle = TextStyle(
        fontFamily = MonoFont, fontWeight = FontWeight.Medium,
        fontSize = 13.sp, lineHeight = 18.sp, letterSpacing = 0.em,
        fontFeatureSettings = NumericFeatures,
    ).animated()

    /**
     * The one big number a page leads with (AnimatedNumber on Detail). Display face, tabular,
     * so a count-up does not jitter its digits; leading equal to size, because a lone numeral
     * has no line above it to clear. A hero number of about 58 sp works.
     */
    val heroNumber: TextStyle = TextStyle(
        fontFamily = DisplayFont, fontWeight = FontWeight.ExtraBold,
        fontSize = 56.sp, lineHeight = 56.sp, letterSpacing = (-0.04).em,
        fontFeatureSettings = TabularFigures,
    ).animated()
}
