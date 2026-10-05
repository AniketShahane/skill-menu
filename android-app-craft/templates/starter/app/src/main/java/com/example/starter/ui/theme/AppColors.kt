package com.example.starter.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/*
 * PLACEHOLDER PALETTE. The next app replaces every value in this file after it has derived
 * its own direction (references/design-direction.md). Keep the ROLES and the tests; change
 * the numbers, then make PaletteContrastTest and ThemePlateTest pass again without weakening
 * a floor. Starter thesis, so the placeholder is at least a committed one: "ink and paper,
 * one indigo that acts, one citron that marks".
 *
 * Figures in the KDoc are WCAG 2.x contrast on straight sRGB, computed with the same helpers
 * PaletteContrastTest uses. "Tone" is CIELAB L* (0 black, 100 white), which is what M3 calls
 * tone. Retune a value, re-measure, and rewrite its figure: a stale number here is worse than
 * none (flick: docs/design/design-tokens.md still describes a palette retired in 7fe301e).
 */

/**
 * The app's colours, named by the job each one does, never by how it looks. Screens read
 * `AppTheme.colors.x` and never see a hex value. Material components get the same values
 * through the ColorScheme projection in AppTheme.kt.
 *
 * Why a palette of our own beside the ColorScheme: Material has no role for "a mark that is
 * not a tap", "glass", or "the ink one step quieter than dim", and an app that squeezes those
 * jobs into Material names ends up rebuilding them per screen (dash: `PlanTitleGreen`,
 * `LimeWash`, `RecapInk` as local `if (DashIsDark)` hexes in WeeklyPlanScreen.kt:145-148).
 */
@Immutable
data class AppColors(
    val isLight: Boolean,
    // --- surfaces ---
    val canvas: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val surfaceTonal: Color,
    val glass: Color,
    val glassBorder: Color,
    // --- ink ---
    val onSurface: Color,
    val onSurfaceDim: Color,
    val onSurfaceFaint: Color,
    // --- outlines ---
    val outline: Color,
    val outlineHairline: Color,
    // --- action: what a tap is drawn in ---
    val primary: Color,
    val onPrimary: Color,
    val primaryContainer: Color,
    val onPrimaryContainer: Color,
    // --- accent: a mark that is NOT a tap (badge, new-dot, highlight) ---
    val accent: Color,
    val onAccent: Color,
    // --- status ---
    val positive: Color,
    val caution: Color,
    val onCaution: Color,
    val trouble: Color,
    // --- scrims ---
    val scrim: Color,
)

// --- fixed brand step-out ------------------------------------------------------------------

/**
 * The accent, identical in both sets. A fixed step-out is a colour that refuses to follow
 * the theme because it IS the brand: Dash keeps its lime `primaryContainer` in both themes
 * (dash: ui/Theme.kt:55,66), Flick keeps its amber media pair in all four sets
 * (flick: sender/.../Color.kt:103-104). PaletteContrastTest pins it, so a brush or a
 * drawable built from this constant can stay a plain `val`.
 *
 * Tone 91, 63% relative chroma. On the dark set it is a mark in its own right: 15.15:1 on
 * the canvas, 13.42:1 on the raised surface. On the light set it is 1.16:1 on the canvas, so
 * there it may only ever be a FILL that carries [AccentInk]; never text, a hairline or an
 * icon on paper. 38° of hue and a 1.65:1 step from [Caution], so a "new" badge and a warning
 * pill can never be the same paint.
 */
internal val Accent = Color(0xFFD4F25A)

/** Warm near-black on citron. 12.79:1 on [Accent]. The same in both sets, with the fill. */
internal val AccentInk = Color(0xFF1C2400)

/** Amber warning fill, tone 73. It carries [CautionInk] at 8.22:1. Same in both sets. */
internal val Caution = Color(0xFFF2A33A)
internal val CautionInk = Color(0xFF2B1700)

// --- light set -----------------------------------------------------------------------------

/**
 * Paper, and the page. Tone 97, hue 240° at 2% relative chroma: a near-neutral with a
 * breath of the indigo in it. The canvas IS the surface; every step above it is an explicit
 * raise. A separate, slightly different base is what let Flick's sheet end up below the
 * page (flick@b2a3a8f). Written again by hand in res/values{,-v31}/themes.xml; ThemePlateTest
 * holds the two together.
 */
internal val PaperCanvas = Color(0xFFF5F5FA)

/**
 * The action on paper. Tone 27, hue 245°. 9.45:1 on the canvas, 8.47:1 on the tonal
 * container (the worst surface it is drawn on), 9.51:1 on the glass bar over the canvas.
 * Darker than a "brand" indigo would be on purpose: it has to stand 1.6:1 off [PaperTrouble]
 * (it stands 1.70:1), so the action and the error differ in luminance and not by hue alone.
 */
internal val PaperPrimary = Color(0xFF3024B5)

/** Error ink on paper, tone 42. 5.56:1 on the canvas, 4.99:1 on the tonal container. */
internal val PaperTrouble = Color(0xFFBE2238)

internal val LightColors = AppColors(
    isLight = true,
    canvas = PaperCanvas,
    surface = PaperCanvas,
    // White cards on off-white paper: 1.087:1. That is the smallest raise either app ever
    // shipped that still reads as an edge, and it is the floor the dark step is held to.
    surfaceRaised = Color(0xFFFFFFFF),
    // Quiet containment (chips, segmented tracks, filled fields). Tone 92, 1.115:1 below
    // the canvas. With dynamic colour on, Material's copies of it take the wallpaper tone
    // (AppTheme.kt); this value itself never changes.
    surfaceTonal = Color(0xFFE9E8F5),
    // The HUE of floating glass, opaque on purpose: GlassBar replaces the alpha with its own
    // coverage (1 - BarBackdropVisibility = 40%). Measured as drawn, onSurfaceDim holds 7.94:1
    // over the canvas and 1.43:1 over a black photo, so the starter's bar is for the app's own
    // surfaces; a bar over media needs far more coverage (PaletteContrastTest).
    glass = Color(0xFFF7F7FC),
    glassBorder = Color(0x8CFFFFFF),
    // Tone 6. 17.07:1 on the canvas.
    onSurface = Color(0xFF12121F),
    // Tone 32. 7.88:1 on the canvas, 7.07:1 on the tonal container.
    onSurfaceDim = Color(0xFF4A4A63),
    // Tone 41. The quietest ink that still clears 4.5 on every surface: 5.68:1 on the
    // canvas, 5.09:1 on the tonal container. Flick's light "faint" sat at 3.29:1 and had to
    // be held by a ratchet instead (flick: FlickColorsTest.kt:129-145); start above the line.
    onSurfaceFaint = Color(0xFF5F5F7A),
    // A control's resting edge: 3.09:1 on the canvas, 3.36:1 on white. Flick had no outline
    // role that reached 3:1 and borrowed its faint ink for strokes (FlickColorsTest.kt:332-343).
    outline = Color(0xFF8A8AA3),
    // Decoration only, never a control's only edge: ink at 10%.
    outlineHairline = Color(0x1A12121F),
    primary = PaperPrimary,
    // 10.27:1 on the primary fill.
    onPrimary = Color(0xFFFFFFFF),
    // Tone 89. 1.339:1 off the raised surface, so a tonal button reads as a control rather
    // than one more card. Carries its ink at 9.63:1.
    primaryContainer = Color(0xFFDEDBFF),
    onPrimaryContainer = Color(0xFF2A2180),
    accent = Accent,
    onAccent = AccentInk,
    // Tone 43. 5.40:1 on the canvas, 4.84:1 on the tonal container.
    positive = Color(0xFF1D7340),
    caution = Caution,
    onCaution = CautionInk,
    trouble = PaperTrouble,
    // A pale page under a sheet only has to be dimmed until it reads as behind.
    scrim = Color(0x8012121F),
)

// --- dark set ------------------------------------------------------------------------------
//
// A set of its own, not the light set inverted and not an alias of anything. Flick's dark
// theme was once an alias of its cinematic set: the raised surface came out DARKER than the
// page (1.017:1, inverted) and nothing failed (flick@b2a3a8f). Dark is designed to three
// rules: raised means lighter; the raise is wider than light's because a shadow draws
// nothing on near-black; and the surfaces carry the brand hue as a tint, not a wash.

/**
 * Night page. Tone 4, never pure black (a black page makes every raised surface look like a
 * hole, flick: receiver/.../Color.kt:29). Hue 232° at 36% relative chroma: the same indigo
 * family as the light paper, spent where there is room for it, and well under the 60% at
 * which a dark surface stops reading as a tint and starts reading as a navy. Written again by
 * hand in res/values-night{,-v31}/themes.xml; ThemePlateTest holds the two together.
 */
internal val NightCanvas = Color(0xFF0E0F16)

/**
 * Raised on night. Tone 11. 1.129:1 above the canvas, the right way round and wider than the
 * light set's 1.087:1, because on dark the tonal step is the only thing separating a card
 * from the page.
 */
internal val NightRaised = Color(0xFF1A1C28)

/**
 * The action on night: a luminous lavender, tone 81 at 23% relative chroma, which is the
 * shape M3 asks of a dark primary (a light tone of the same hue, not a saturated dark one).
 * 11.65:1 on the canvas, 9.16:1 on the tonal container, 11.36:1 on the glass bar over the canvas.
 * 1.68:1 off [NightTrouble]. It carries its dark ink at 9.62:1.
 */
internal val NightPrimary = Color(0xFFC8C4FF)

/** Error ink on night, a salmon, tone 64. 6.94:1 on the canvas, 5.46:1 on the tonal container. */
internal val NightTrouble = Color(0xFFFF6B78)

internal val DarkColors = AppColors(
    isLight = false,
    canvas = NightCanvas,
    surface = NightCanvas,
    surfaceRaised = NightRaised,
    // Tone 15. 1.272:1 above the canvas.
    surfaceTonal = Color(0xFF23253A),
    // The hue only, as in the light set. As drawn (black floor plus this, 40% coverage in all),
    // onSurfaceDim holds 9.15:1 over the canvas and 1.25:1 over a blown-out white photo.
    glass = Color(0xFF1C1E2C),
    // 18%: a restrained rim. A brighter one is the brightest edge on a near-black screen,
    // landing on decoration (flick: the 60%-white dark sheen was "a blown highlight").
    glassBorder = Color(0x2EFFFFFF),
    // Tone 94, cool near-white. 16.28:1 on the canvas; not pure white, which glares on OLED.
    onSurface = Color(0xFFECECF5),
    // Tone 74. 9.38:1 on the canvas, 7.37:1 on the tonal container.
    onSurfaceDim = Color(0xFFB4B4C8),
    // Tone 64. 6.95:1 on the canvas, 5.47:1 on the tonal container.
    onSurfaceFaint = Color(0xFF9A9AB2),
    // 3.87:1 on the canvas, 3.42:1 on the raised surface.
    outline = Color(0xFF6E6E88),
    // 10% white, drawn on raised surfaces that are no longer near-black.
    outlineHairline = Color(0x1AFFFFFF),
    primary = NightPrimary,
    onPrimary = Color(0xFF1B1464),
    // Tone 24. 1.445:1 above the raised surface; carries its ink at 8.90:1.
    primaryContainer = Color(0xFF342D78),
    onPrimaryContainer = Color(0xFFE0DDFF),
    accent = Accent,
    onAccent = AccentInk,
    // Mint, tone 79. 10.98:1 on the canvas.
    positive = Color(0xFF6FD99A),
    caution = Caution,
    onCaution = CautionInk,
    trouble = NightTrouble,
    // Heavier than light's 50%: a page that is already near-black has to be taken almost to
    // nothing before a sheet over it looks raised rather than adjacent (flick: Color.kt:588-591).
    scrim = Color(0xA6060710),
)

// --- derived roles the ColorScheme projection needs, kept here so the test can measure them ---

/**
 * Ink on a solid [AppColors.trouble] fill (Material's `onError`). White on the deep light
 * red (6.04:1), the night canvas on the dark salmon (6.94:1): white on a tone-64 salmon would
 * be 2.75:1.
 */
internal val AppColors.onTrouble: Color
    get() = if (isLight) Color.White else canvas

/**
 * Material's `errorContainer`: trouble as a tint, carrying trouble itself as its ink. The
 * alpha is set by what is drawn: at 10% (light) and 16% (dark) the ink clears 4.5 over both
 * the canvas and the raised surface. At 20% dark would clear by only 0.02 (4.52:1 over the
 * raised surface); 16% gives 4.85:1.
 */
internal val AppColors.troubleContainer: Color
    get() = trouble.copy(alpha = if (isLight) 0.10f else 0.16f)

/**
 * Static, because a palette swap repaints every surface in the tree anyway, so there is
 * nothing to save by tracking readers one by one (the argument Flick makes for its
 * LocalThemePreference, sender/.../Appearance.kt:46-49).
 * The default is the light set, so a preview or test that provides nothing still draws.
 */
val LocalAppColors: ProvidableCompositionLocal<AppColors> = staticCompositionLocalOf { LightColors }
