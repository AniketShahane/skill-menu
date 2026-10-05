package com.flick.sender.ui.theme

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorProducer
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFontFamilyResolver
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException

/**
 * Literal Material 3 Expressive entry point for the phone. The brand is committed: amber
 * for the media itself, cyan for the LAN, and electric blue and amber trading the action
 * and accent jobs between the two palettes — light is a blue tool that plays amber films,
 * dark is the film's own amber become the interface. Dynamic color survives only as a
 * wallpaper tint on the quiet tonal containers — it is never allowed to reach an anchored
 * role.
 *
 * [darkTheme] defaults to the user's own [LocalThemePreference] resolved against the
 * platform — the only read of the configuration's night mode inside a composition.
 * `MainActivity` puts the same question to the Configuration for the window contract it
 * has to settle before there is a composition to ask in, and hands an explicit choice to
 * the platform as this app's own night mode: only [ThemePreference.SYSTEM] reaches the
 * argument below, and it is also the one choice that leaves that mode unset. It stays a
 * parameter so a test can pin a palette outright, and [FlickCinematicTheme] never routes
 * through here at all.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun FlickTheme(
    darkTheme: Boolean = LocalThemePreference.current.resolvesDark(isSystemInDarkTheme()),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit,
) {
    val flick = if (darkTheme) DarkFlickColors else LightFlickColors
    val context = LocalContext.current
    val useDynamicTonalRoles = dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    PreloadBundledFonts()
    val base = when {
        useDynamicTonalRoles ->
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        darkTheme -> darkColorScheme()
        else -> lightColorScheme()
    }

    FlickMaterial(flick, flickColorScheme(flick, base, useDynamicTonalRoles), content)
}

/**
 * Warms the typeface cache for the three bundled families.
 *
 * A `res/font` face is declared with the plain `Font(...)` constructor, which is
 * `FontLoadingStrategy.Blocking`: the typeface is created inside the first measure that
 * asks for a weight it has not seen. Six faces and ~455 KB of TTF are otherwise paid for
 * one glyph at a time, on the layout pass that needs each one — and on the phone that is
 * also serving the file. Preloading resolves every declared weight into the resolver's
 * cache instead, so only the faces a screen has genuinely never used can still block it.
 *
 * A failure here has to stay silent: the fallback is exactly the behaviour this replaces —
 * the face loads on first measure — and a preload is never worth a window.
 */
@Composable
private fun PreloadBundledFonts() {
    val resolver = LocalFontFamilyResolver.current
    LaunchedEffect(resolver) {
        FlickFontFamilies.forEach { family ->
            try {
                resolver.preload(family)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Throwable) {
                // Nothing to report and nothing to retry: the face loads on first measure.
            }
        }
    }
}

/**
 * Forces a cinematic dark set regardless of the system theme. Now Playing, the connecting
 * overlay and the quality sheet are dark by design, not by preference — that part of the
 * invariant is unchanged, and the surfaces below are the same navy in both variants.
 *
 * What the preference DOES pick is the brand assignment, because the action colour has to
 * be one colour at any instant across the whole app. These screens draw `primary` — the
 * primary button, the sheet chrome, the subtitles sheet's loading indicator — so pinning
 * them to the light assignment would give a dark-mode user a gold CTA everywhere and a
 * blue one inside a sheet, and swapping them outright would give a light-mode user the
 * reverse. Only the action family follows; the accent, the media and the LAN roles stay
 * where the cinematic backdrop needs them.
 *
 * Resolved from [LocalThemePreference] rather than from the ambient palette's own
 * `isLight`, which would answer wrongly for a cinematic theme nested inside another one. A
 * cinematic screen composed outside [FlickTheme] — a preview, an instrumentation harness —
 * sees [ThemePreference.SYSTEM] and resolves against the platform, which is what
 * [FlickTheme] itself already does there.
 */
@Composable
fun FlickCinematicTheme(content: @Composable () -> Unit) {
    val flick = if (LocalThemePreference.current.resolvesDark(isSystemInDarkTheme())) {
        CinematicNightFlickColors
    } else {
        CinematicFlickColors
    }
    val scheme = remember(flick) {
        flickColorScheme(flick, darkColorScheme(), useDynamicTonalRoles = false)
    }
    FlickMaterial(flick, scheme, content)
}

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
private fun FlickMaterial(
    flick: FlickColors,
    scheme: ColorScheme,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalFlickColors provides flick) {
        MaterialExpressiveTheme(
            colorScheme = scheme,
            motionScheme = MotionScheme.expressive(),
            shapes = FlickShapes,
            typography = FlickTypography,
            content = content,
        )
    }
}

private fun flickColorScheme(
    flick: FlickColors,
    base: ColorScheme,
    useDynamicTonalRoles: Boolean,
): ColorScheme = base.copy(
    primary = flick.primary,
    onPrimary = flick.onPrimary,
    primaryContainer = flick.primaryContainer,
    onPrimaryContainer = flick.onPrimaryContainer,
    inversePrimary = flick.primaryFixed,
    secondary = flick.link,
    onSecondary = if (flick.isLight) flick.onPrimary else flick.onInverseSurface,
    secondaryContainer = flick.link.copy(alpha = if (flick.isLight) 0.16f else 0.20f),
    onSecondaryContainer = flick.link,
    tertiary = flick.spark,
    onTertiary = flick.onSpark,
    tertiaryContainer = flick.sparkPale,
    onTertiaryContainer = flick.onSpark,
    background = flick.surface,
    onBackground = flick.onSurface,
    surface = flick.surface,
    onSurface = flick.onSurface,
    surfaceTint = flick.primary,
    // Wallpaper tint is intentionally confined to quiet tonal containment.
    surfaceVariant = if (useDynamicTonalRoles) base.surfaceVariant else flick.surfaceTonal,
    onSurfaceVariant = flick.onSurfaceDim,
    surfaceBright = flick.surfaceRaised,
    surfaceDim = flick.surfaceRaisedAlt,
    surfaceContainer = if (useDynamicTonalRoles) base.surfaceContainer else flick.surfaceTonal,
    surfaceContainerHigh = if (useDynamicTonalRoles) base.surfaceContainerHigh else flick.surfaceRaised,
    surfaceContainerHighest = if (useDynamicTonalRoles) base.surfaceContainerHighest else flick.surfaceRaised,
    surfaceContainerLow = if (useDynamicTonalRoles) base.surfaceContainerLow else flick.surfaceRaisedAlt,
    surfaceContainerLowest = flick.surface,
    inverseSurface = flick.inverseSurface,
    inverseOnSurface = flick.onInverseSurface,
    outline = flick.outline,
    outlineVariant = flick.outlineHairline,
    scrim = flick.scrim,
    error = flick.trouble,
    onError = Color.White,
    errorContainer = flick.trouble.copy(alpha = if (flick.isLight) 0.12f else 0.20f),
    onErrorContainer = flick.trouble,
)

/**
 * Glass treatment shared by the floating chrome. [backdropEffect] inserts a real background
 * effect, such as the dark navigation bar's Haze blur, inside the rounded clip. The material
 * above it stays contrast-stabilized and translucent; a tight specular rim falls into a
 * raking sheen where that treatment is enabled.
 */
fun Modifier.flickGlass(
    colors: FlickColors,
    shape: Shape = RoundedCornerShape(FlickCorners.nav),
    fill: Color = colors.glass,
    underlay: Color = Color.Transparent,
    showSheen: Boolean = true,
    backdropEffect: Modifier? = null,
): Modifier = flickGlassLayers(
    colors = colors,
    shape = shape,
    fillLayer = Modifier.background(color = fill, shape = shape),
    underlay = underlay,
    showSheen = showSheen,
    backdropEffect = backdropEffect,
)

/**
 * The same material with a fill that moves. [fill] is read in the draw scope, so a fill
 * that animates repaints this one node rather than recomposing the surface it paints, and
 * it lands in the fill's own seat — under the sheen and the rim, never over them.
 */
fun Modifier.flickGlass(
    colors: FlickColors,
    shape: Shape,
    fill: ColorProducer,
    underlay: Color = Color.Transparent,
    showSheen: Boolean = true,
    backdropEffect: Modifier? = null,
): Modifier = flickGlassLayers(
    colors = colors,
    shape = shape,
    fillLayer = Modifier.drawWithCache {
        val outline = shape.createOutline(size, layoutDirection, this)
        onDrawBehind {
            val color = fill()
            if (color.alpha > 0f) drawOutline(outline, color)
        }
    },
    underlay = underlay,
    showSheen = showSheen,
    backdropEffect = backdropEffect,
)

private fun Modifier.flickGlassLayers(
    colors: FlickColors,
    shape: Shape,
    fillLayer: Modifier,
    underlay: Color,
    showSheen: Boolean,
    backdropEffect: Modifier?,
): Modifier = this
    .shadow(
        elevation = 20.dp,
        shape = shape,
        clip = false,
        // Both halves of the treatment are a claim about light, and a dark canvas has a
        // different amount of it: the tinted shadow is invisible against near-black and
        // the sheen is a blown highlight on it. Read from the palette rather than from
        // the platform's night mode, so a forced-cinematic screen gets the dark pair too.
        ambientColor = if (colors.isLight) NavShadow else NavShadowOnNight,
        spotColor = if (colors.isLight) NavShadow else NavShadowOnNight,
    )
    .then(
        backdropEffect?.let { Modifier.clip(shape).then(it) } ?: Modifier,
    )
    .then(
        if (underlay.alpha > 0f) Modifier.background(color = underlay, shape = shape) else Modifier,
    )
    .then(fillLayer)
    .then(
        if (showSheen) {
            Modifier.background(
                brush = if (colors.isLight) FlickGradients.navSheen else FlickGradients.navSheenDark,
                shape = shape,
            )
        } else {
            Modifier
        },
    )
    .border(width = 1.dp, color = colors.glassBorder, shape = shape)

fun Modifier.flickRaised(
    colors: FlickColors,
    shape: Shape = RoundedCornerShape(FlickCorners.tile),
): Modifier = this
    .background(color = colors.surfaceRaised, shape = shape)
    .border(width = 1.dp, color = colors.outlineHairline, shape = shape)
