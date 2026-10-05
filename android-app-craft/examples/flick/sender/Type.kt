package com.flick.sender.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.flick.sender.R

/**
 * Bricolage Grotesque carries display and titles, Geist carries body, labels and buttons,
 * and Geist Mono carries every running number.
 *
 * The faces are bundled `res/font` resources, never downloadable. A device whose Play
 * Services font catalogue lags would silently render the platform default with no error,
 * so there is no provider and no fallback family — the APK is the only source.
 *
 * Each family declares only the weights this scale actually requests, because an
 * unreferenced `res/font` file is dead APK weight and an undeclared weight silently
 * resolves to the nearest declared one.
 */
val Bricolage: FontFamily = FontFamily(
    Font(R.font.bricolage_bold, FontWeight.Bold),
    Font(R.font.bricolage_extrabold, FontWeight.ExtraBold),
)

/**
 * ExtraBold backs no style below: call sites reach for it through `copy(fontWeight = …)`
 * and `SpanStyle` to lead an advisory, so dropping it would silently render those at Bold.
 */
val Geist: FontFamily = FontFamily(
    Font(R.font.geist_semibold, FontWeight.SemiBold),
    Font(R.font.geist_bold, FontWeight.Bold),
    Font(R.font.geist_extrabold, FontWeight.ExtraBold),
)

val GeistMono: FontFamily = FontFamily(
    Font(R.font.geist_mono_semibold, FontWeight.SemiBold),
)

/**
 * Every family the ramp below draws from. Declared as a list so the theme can warm all of
 * them without naming them a second time — a family added above and missed here would
 * silently go back to being created inside the first measure that asks for it.
 */
internal val FlickFontFamilies: List<FontFamily> = listOf(Bricolage, Geist, GeistMono)

/**
 * Required on every live readout. `tnum` keeps a ticking timecode from re-laying out the
 * row; `zero` keeps the pairing code the user reads off the TV from turning `0` into `O`.
 *
 * Geist Mono satisfies both in its outlines rather than through these tags — it is
 * monospaced by construction and draws the slash in the default zero — so the string is
 * declared intent that also survives a re-cut which moves either behind a feature.
 */
private const val NUMERIC_FEATURES = "tnum, zero"

/** Standalone Flick text styles used directly by components. */
object FlickText {

    // --- Bricolage Grotesque: display & titles ---

    val displayLarge = TextStyle(
        fontFamily = Bricolage,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 44.sp,
        lineHeight = 42.sp,
        letterSpacing = (-0.045).em,
    )

    /** Named so the Typography role and its emphasized twin read from one place. */
    val displayMedium = displayLarge.copy(fontSize = 34.sp, lineHeight = 34.sp)

    val headlineLarge = TextStyle(
        fontFamily = Bricolage,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 30.sp,
        lineHeight = 31.sp,
        letterSpacing = (-0.04).em,
    )
    val headlineMedium = TextStyle(
        fontFamily = Bricolage,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 26.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.04).em,
    )
    val headlineSmall = TextStyle(
        fontFamily = Bricolage,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 24.sp,
        lineHeight = 28.sp,
        letterSpacing = (-0.035).em,
    )
    val titleLarge = TextStyle(
        fontFamily = Bricolage,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 23.sp,
        lineHeight = 24.sp,
        letterSpacing = (-0.035).em,
    )
    val titleMedium = TextStyle(
        fontFamily = Bricolage,
        fontWeight = FontWeight.Bold,
        fontSize = 19.sp,
        lineHeight = 23.sp,
        letterSpacing = (-0.03).em,
    )
    val titleSmall = TextStyle(
        fontFamily = Bricolage,
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp,
        lineHeight = 20.sp,
        letterSpacing = (-0.025).em,
    )

    // --- Geist: body, labels & buttons ---
    //
    // Tracking is pinned to 0 rather than left unspecified: Material's ProvideTextStyle
    // would otherwise leak a display face's negative tracking into body copy nested in a
    // button.

    val labelLarge = TextStyle(
        fontFamily = Geist,
        fontWeight = FontWeight.Bold,
        fontSize = 14.5.sp,
        lineHeight = 17.sp,
        letterSpacing = 0.em,
    )
    val bodyLarge = TextStyle(
        fontFamily = Geist,
        fontWeight = FontWeight.Bold,
        fontSize = 14.5.sp,
        lineHeight = 19.5.sp,
        letterSpacing = 0.em,
    )
    val bodyMedium = TextStyle(
        fontFamily = Geist,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.5.sp,
        lineHeight = 17.sp,
        letterSpacing = 0.em,
    )
    val bodySmall = TextStyle(
        fontFamily = Geist,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.em,
    )
    val labelMedium = TextStyle(
        fontFamily = Geist,
        fontWeight = FontWeight.Bold,
        fontSize = 12.5.sp,
        lineHeight = 15.sp,
        letterSpacing = 0.em,
    )
    val labelSmall = TextStyle(
        fontFamily = Geist,
        fontWeight = FontWeight.Bold,
        fontSize = 11.5.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.em,
    )

    // --- Emphasized: the weight step Material's expressive components ask for ---
    //
    // Material resolves emphasis by weight. Bricolage bundles nothing above ExtraBold,
    // which display, headline and titleLarge already carry, so those roles buy their
    // emphasis with tracking instead — 0.005em tighter packs the lockup without
    // changing the measure. Geist bundles a third weight, so every Geist role and the
    // two Bold Bricolage titles simply step up.

    val displayLargeEmphasized = displayLarge.copy(letterSpacing = (-0.05).em)
    val displayMediumEmphasized = displayMedium.copy(letterSpacing = (-0.05).em)
    val displaySmallEmphasized = headlineLarge.copy(letterSpacing = (-0.045).em)
    val headlineLargeEmphasized = headlineLarge.copy(letterSpacing = (-0.045).em)
    val headlineMediumEmphasized = headlineMedium.copy(letterSpacing = (-0.045).em)
    val headlineSmallEmphasized = headlineSmall.copy(letterSpacing = (-0.04).em)
    val titleLargeEmphasized = titleLarge.copy(letterSpacing = (-0.04).em)
    val titleMediumEmphasized = titleMedium.copy(fontWeight = FontWeight.ExtraBold)
    val titleSmallEmphasized = titleSmall.copy(fontWeight = FontWeight.ExtraBold)
    val bodyLargeEmphasized = bodyLarge.copy(fontWeight = FontWeight.ExtraBold)
    val bodyMediumEmphasized = bodyMedium.copy(fontWeight = FontWeight.Bold)
    val bodySmallEmphasized = bodySmall.copy(fontWeight = FontWeight.Bold)
    val labelLargeEmphasized = labelLarge.copy(fontWeight = FontWeight.ExtraBold)
    val labelMediumEmphasized = labelMedium.copy(fontWeight = FontWeight.ExtraBold)
    val labelSmallEmphasized = labelSmall.copy(fontWeight = FontWeight.ExtraBold)

    // --- Geist Mono: every live number, always tabular ---

    /** Section eyebrow — caller supplies UPPERCASE copy. */
    val monoEyebrow = TextStyle(
        fontFamily = GeistMono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        letterSpacing = 0.11.em,
        fontFeatureSettings = NUMERIC_FEATURES,
    )

    /** Wider eyebrow for the discovery count line. */
    val monoEyebrowWide = TextStyle(
        fontFamily = GeistMono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        letterSpacing = 0.16.em,
        fontFeatureSettings = NUMERIC_FEATURES,
    )

    /** Badge chip riding on a poster or tile. */
    val monoBadge = TextStyle(
        fontFamily = GeistMono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        letterSpacing = 0.06.em,
        fontFeatureSettings = NUMERIC_FEATURES,
    )

    /** Badge chip in the detail sheet's fact row. */
    val monoChip = TextStyle(
        fontFamily = GeistMono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        letterSpacing = 0.08.em,
        fontFeatureSettings = NUMERIC_FEATURES,
    )

    /** Compact telemetry: durations, sizes, decoder names. */
    val monoSmall = TextStyle(
        fontFamily = GeistMono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        letterSpacing = 0.em,
        fontFeatureSettings = NUMERIC_FEATURES,
    )

    /** Throughput and the scrub time row. */
    val monoValue = TextStyle(
        fontFamily = GeistMono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.5.sp,
        letterSpacing = 0.em,
        fontFeatureSettings = NUMERIC_FEATURES,
    )

    /** The pairing code. */
    val monoDisplay = TextStyle(
        fontFamily = GeistMono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 21.sp,
        letterSpacing = 0.14.em,
        fontFeatureSettings = NUMERIC_FEATURES,
    )

    /** Quality-sheet gauge readout. */
    val monoGauge = TextStyle(
        fontFamily = GeistMono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 25.sp,
        letterSpacing = 0.em,
        fontFeatureSettings = NUMERIC_FEATURES,
    )

    // --- Legacy aliases: kept so call sites outside ui/theme keep compiling. ---
    val title = displayLarge
    val heading = headlineMedium
    val body = bodyLarge
    val caption = bodyMedium
    val timecode = monoValue
    val mono = monoSmall
    val monoLabel = monoEyebrow
}

/**
 * The emphasized half is not optional decoration: Material's expressive components
 * read those roles directly, and a Typography that leaves them unset falls back to
 * the platform default face — the one thing the bundled-font rule above forbids.
 */
val FlickTypography = Typography(
    displayLarge = FlickText.displayLarge,
    displayMedium = FlickText.displayMedium,
    displaySmall = FlickText.headlineLarge,
    headlineLarge = FlickText.headlineLarge,
    headlineMedium = FlickText.headlineMedium,
    headlineSmall = FlickText.headlineSmall,
    titleLarge = FlickText.titleLarge,
    titleMedium = FlickText.titleMedium,
    titleSmall = FlickText.titleSmall,
    bodyLarge = FlickText.bodyLarge,
    bodyMedium = FlickText.bodyMedium,
    bodySmall = FlickText.bodySmall,
    labelLarge = FlickText.labelLarge,
    labelMedium = FlickText.labelMedium,
    labelSmall = FlickText.labelSmall,
    displayLargeEmphasized = FlickText.displayLargeEmphasized,
    displayMediumEmphasized = FlickText.displayMediumEmphasized,
    displaySmallEmphasized = FlickText.displaySmallEmphasized,
    headlineLargeEmphasized = FlickText.headlineLargeEmphasized,
    headlineMediumEmphasized = FlickText.headlineMediumEmphasized,
    headlineSmallEmphasized = FlickText.headlineSmallEmphasized,
    titleLargeEmphasized = FlickText.titleLargeEmphasized,
    titleMediumEmphasized = FlickText.titleMediumEmphasized,
    titleSmallEmphasized = FlickText.titleSmallEmphasized,
    bodyLargeEmphasized = FlickText.bodyLargeEmphasized,
    bodyMediumEmphasized = FlickText.bodyMediumEmphasized,
    bodySmallEmphasized = FlickText.bodySmallEmphasized,
    labelLargeEmphasized = FlickText.labelLargeEmphasized,
    labelMediumEmphasized = FlickText.labelMediumEmphasized,
    labelSmallEmphasized = FlickText.labelSmallEmphasized,
)
