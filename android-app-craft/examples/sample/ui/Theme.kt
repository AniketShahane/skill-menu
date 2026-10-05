// Shows: fixed brand fills that don't repaint with the palette, MaterialExpressiveTheme wiring,
// type helpers (a display style capped near 1.0x leading), and tnum for digit columns that must
// not change width. Example written for this skill; read it, don't paste it.
package com.example.sample.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Brand fills that never move when the palette does. A chip or badge that must stay legible
 * on its own fixed background (not a role that repaints with light/dark or a dynamic seed)
 * reads from here, never from [ColorScheme]. Two fills plus their fixed foregrounds are enough
 * for a small app: a bright "featured" fill and a quiet "archived" one.
 */
data class AppColors(
    val isLight: Boolean,
    val canvas: Color,
    val paper: Color,
    val action: Color,
    val onAction: Color,
    val featuredFill: Color,
    val onFeaturedFill: Color,
    val archivedFill: Color,
    val onArchivedFill: Color,
)

private val LightColors = AppColors(
    isLight = true,
    canvas = Color(0xFFF7F8F2),
    paper = Color(0xFFFFFFFF),
    action = Color(0xFF2B6A39),
    onAction = Color(0xFFFFFFFF),
    featuredFill = Color(0xFFE3FF4A),
    onFeaturedFill = Color(0xFF14230A),
    archivedFill = Color(0xFFDCD8CC),
    onArchivedFill = Color(0xFF33322C),
)

private val DarkColors = AppColors(
    isLight = false,
    canvas = Color(0xFF14150F),
    paper = Color(0xFF1C1E16),
    action = Color(0xFFE3FF4A),
    onAction = Color(0xFF14230A),
    featuredFill = Color(0xFFE3FF4A),
    onFeaturedFill = Color(0xFF14230A),
    archivedFill = Color(0xFF2A2B22),
    onArchivedFill = Color(0xFFC8C7BC),
)

// staticCompositionLocalOf, deliberately: swapping the palette already repaints the whole
// subtree, so tracking which reader touched which field buys nothing and only adds a lookup.
val LocalAppColors = staticCompositionLocalOf { LightColors }

object AppTheme {
    val colors: AppColors
        @Composable get() = LocalAppColors.current
}

private fun appColorScheme(c: AppColors): ColorScheme =
    if (c.isLight) lightColorScheme(primary = c.action, onPrimary = c.onAction)
    else darkColorScheme(primary = c.action, onPrimary = c.onAction)

/**
 * Display type is set at or below 1.0x leading on a phone (measured against the common
 * "display line height ~1.2x" guidance, which was written for a reading surface, not a
 * number-forward dashboard card). A looser leading only buys readability once the viewing
 * distance stretches past arm's length, which is a ten-foot-TV condition, not a phone one.
 */
val DisplayLarge = TextStyle(fontSize = 52.sp, lineHeight = 51.sp, fontWeight = FontWeight.Bold)
val DisplaySmall = TextStyle(fontSize = 34.sp, lineHeight = 33.sp, fontWeight = FontWeight.Bold)

/**
 * A stopwatch-style readout changes every second; a proportional digit font (most of them)
 * reflows the whole string's width as narrow and wide digits swap. Tabular figures fix each
 * digit to the same advance width, so the layout doesn't jitter. Apply this feature setting to
 * every text role that carries a live, changing number — not the whole type scale, since most
 * labels never move and tabular spacing reads slightly looser than proportional for them.
 */
val TabularNumberStyle = TextStyle(fontFeatureSettings = "tnum")

fun numericTextStyle(base: TextStyle): TextStyle = base.merge(TabularNumberStyle)

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun AppTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colors = if (darkTheme) DarkColors else LightColors
    CompositionLocalProvider(LocalAppColors provides colors) {
        MaterialExpressiveTheme(
            colorScheme = appColorScheme(colors),
            motionScheme = MotionScheme.expressive(),
            typography = Typography(displayLarge = DisplayLarge, displaySmall = DisplaySmall),
            content = content,
        )
    }
}
