package com.example.starter.ui.theme

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.view.ViewTreeObserver
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFontFamilyResolver
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import com.example.starter.ui.motion.LocalReducedMotion
import com.example.starter.ui.motion.rememberReducedMotion
import kotlinx.coroutines.CancellationException

/** Read-side access to the palette: `AppTheme.colors.primary`, `AppTheme.isDark`. */
object AppTheme {
    val colors: AppColors
        @Composable @ReadOnlyComposable
        get() = LocalAppColors.current

    val isDark: Boolean
        @Composable @ReadOnlyComposable
        get() = !LocalAppColors.current.isLight
}

/**
 * The theme, in three layers (flick: sender/.../Theme.kt:52-192):
 *
 * 1. The product palette ([AppColors]) in a CompositionLocal. Screens read jobs from it.
 * 2. The same values projected into a real Material [ColorScheme], so every stock component
 *    inherits the brand without being told.
 * 3. [MaterialExpressiveTheme] with the expressive motion scheme, [AppShapes] and
 *    [AppTypography].
 *
 * [dynamicColor] is off by default. When on (API 31+), wallpaper colour reaches the quiet
 * tonal containers Material draws with (`surfaceVariant`, `surfaceContainer*` except
 * Lowest), plus the 12 `*Fixed` roles, which this projection leaves at the base scheme and no
 * stock component reads. It never reaches an anchored role: action, ink, status, the page. An
 * identity the wallpaper can repaint is not an identity (flick: sender/.../Theme.kt:37-39).
 * Before turning it on, note that dark dynamic surfaceVariant is tone 30 and Highest tone 22:
 * the placeholder's dark faint and trouble inks fall to 3.4:1 and 4.49:1 there.
 *
 * The outermost AppTheme also owns the window: system-bar icon contrast, and the window
 * background plate, both kept in step with the resolved palette.
 */
@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun AppTheme(
    preference: ThemePreference = ThemePreference.SYSTEM,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val dark = preference.resolvesDark(isSystemInDarkTheme())
    val colors = if (dark) DarkColors else LightColors
    val useDynamicTonalRoles = dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val scheme = if (useDynamicTonalRoles) {
        // Not remembered: the wallpaper can change under a live process, and this recomposes
        // only when the appearance does.
        val context = LocalContext.current
        val base = if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        appColorScheme(colors, base, useDynamicTonalRoles = true)
    } else {
        remember(colors) {
            appColorScheme(colors, if (dark) darkColorScheme() else lightColorScheme(), useDynamicTonalRoles = false)
        }
    }

    val ownsWindow = LocalThemeOwnsWindow.current
    if (ownsWindow) {
        SyncWindowWithPalette(colors)
        PreloadBundledFonts()
    }

    CompositionLocalProvider(
        LocalAppColors provides colors,
        LocalReducedMotion provides rememberReducedMotion(),
        LocalThemeOwnsWindow provides false,
    ) {
        MaterialExpressiveTheme(
            colorScheme = scheme,
            motionScheme = MotionScheme.expressive(),
            shapes = AppShapes,
            typography = AppTypography,
            content = content,
        )
    }
}

/**
 * Only the outermost theme touches the window. A nested AppTheme (a forced-dark sheet, a
 * preview inside a preview) must not flip the whole app's bar icons behind its back.
 */
private val LocalThemeOwnsWindow = staticCompositionLocalOf { true }

/**
 * Keeps two things the platform owns in step with the palette:
 *
 * - **Bar icon contrast.** Dark icons on a light page, light on a dark one. MainActivity seeds
 *   them in `enableEdgeToEdge`; this follows an in-app change without an activity recreate.
 *   It is re-asserted when the window gains focus, because Android can reapply the launch
 *   theme when the window first attaches, after Compose's first side effect
 *   (dash: MainActivity.kt:57-69). Setting icon colours alone did not fix Android 15's stale
 *   bar backgrounds after recreation; that needs `setDecorFitsSystemWindows(window, false)`
 *   BEFORE `super.onCreate` (dash: MainActivity.kt:21-24), which MainActivity does.
 * - **The window plate.** themes.xml picks the cold-start plate from the system's night mode,
 *   which is not the user's choice below API 31 or on the first launch after a change. The
 *   plate shows wherever Compose has not drawn yet (a resize, a recreate, the gap under a
 *   window animation), so it is repainted from the palette actually composed
 *   (flick: sender/.../MainActivity.kt:94-107 does this in onCreate, before setContent).
 */
@Composable
private fun SyncWindowWithPalette(colors: AppColors) {
    if (LocalInspectionMode.current) return
    val view = LocalView.current
    val window = remember(view) { view.context.findActivity()?.window } ?: return
    DisposableEffect(window, colors) {
        val lightBars = colors.isLight
        fun paint() {
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = lightBars
                isAppearanceLightNavigationBars = lightBars
            }
        }
        paint()
        window.setBackgroundDrawable(ColorDrawable(colors.canvas.toArgb()))
        val onFocus = ViewTreeObserver.OnWindowFocusChangeListener { hasFocus -> if (hasFocus) paint() }
        view.viewTreeObserver.addOnWindowFocusChangeListener(onFocus)
        onDispose {
            if (view.viewTreeObserver.isAlive) view.viewTreeObserver.removeOnWindowFocusChangeListener(onFocus)
        }
    }
}

/**
 * Second pass only. The real warm is [startFontWarmup] on a daemon thread before
 * `setContent`. This runs on the main thread after the first composition, so it catches
 * nothing the thread missed except by paying on the frame (see FontWarmup.kt). A failure
 * stays silent: the fallback is the face loading on first measure.
 */
@Composable
private fun PreloadBundledFonts() {
    val resolver = LocalFontFamilyResolver.current
    LaunchedEffect(resolver) {
        BundledFamilies.forEach { family ->
            try {
                resolver.preload(family)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Throwable) {
                // Nothing to report and nothing to retry.
            }
        }
    }
}

/**
 * The palette projected into Material's roles. Every role a stock component can draw with is
 * set, so none of them falls back to Material's baseline purple.
 */
private fun appColorScheme(
    c: AppColors,
    base: ColorScheme,
    useDynamicTonalRoles: Boolean,
): ColorScheme = base.copy(
    primary = c.primary,
    onPrimary = c.onPrimary,
    primaryContainer = c.primaryContainer,
    onPrimaryContainer = c.onPrimaryContainer,
    // The other set's action: the tone M3 wants for an action drawn on inverseSurface
    // (a snackbar's button). 11.30:1 on the light inverse, 8.74:1 on the dark one.
    inversePrimary = if (c.isLight) DarkColors.primary else LightColors.primary,
    // Selection (nav indicator, selected chip) is a state of the action, so it stays in the
    // action family. The accent is a mark, never a selected state.
    secondary = c.primary,
    onSecondary = c.onPrimary,
    secondaryContainer = c.primaryContainer,
    onSecondaryContainer = c.onPrimaryContainer,
    tertiary = c.accent,
    onTertiary = c.onAccent,
    tertiaryContainer = c.accent,
    onTertiaryContainer = c.onAccent,
    background = c.canvas,
    onBackground = c.onSurface,
    surface = c.surface,
    onSurface = c.onSurface,
    surfaceTint = c.primary,
    onSurfaceVariant = c.onSurfaceDim,
    surfaceBright = c.surfaceRaised,
    surfaceDim = c.canvas,
    surfaceContainerLowest = c.canvas,
    // Wallpaper tint is confined to these five: quiet containment, never an anchored role.
    surfaceVariant = if (useDynamicTonalRoles) base.surfaceVariant else c.surfaceTonal,
    surfaceContainerLow = if (useDynamicTonalRoles) base.surfaceContainerLow else c.surfaceRaised,
    surfaceContainer = if (useDynamicTonalRoles) base.surfaceContainer else c.surfaceTonal,
    surfaceContainerHigh = if (useDynamicTonalRoles) base.surfaceContainerHigh else c.surfaceRaised,
    surfaceContainerHighest = if (useDynamicTonalRoles) base.surfaceContainerHighest else c.surfaceTonal,
    inverseSurface = c.onSurface,
    inverseOnSurface = c.canvas,
    outline = c.outline,
    outlineVariant = c.outlineHairline,
    scrim = c.scrim,
    error = c.trouble,
    onError = c.onTrouble,
    errorContainer = c.troubleContainer,
    onErrorContainer = c.trouble,
)

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
