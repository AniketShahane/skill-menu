package com.flick.sender.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.LinearGradientShader
import androidx.compose.ui.graphics.RadialGradientShader
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/**
 * Sender-only semantic roles that Material color roles cannot represent without
 * losing Flick's product meaning. They deliberately describe jobs, not a visual
 * direction: screens may use media and synchronization roles without knowing a
 * hex value.
 */
@Immutable
data class FlickColors(
    val isLight: Boolean,
    // --- surfaces ---
    val canvas: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val surfaceRaisedAlt: Color,
    val surfaceTonal: Color,
    val surfaceDisabled: Color,
    val inverseSurface: Color,
    val onInverseSurface: Color,
    val onInverseSurfaceDim: Color,
    val glass: Color,
    val glassBorder: Color,
    // --- ink ---
    val onSurface: Color,
    val onSurfaceDim: Color,
    val onSurfaceFaint: Color,
    // --- outlines ---
    val outline: Color,
    val outlineSoft: Color,
    val outlineHairline: Color,
    // --- action: what a tap is drawn in ---
    val primary: Color,
    val onPrimary: Color,
    val onPrimaryMuted: Color,
    val primaryContainer: Color,
    val onPrimaryContainer: Color,
    val primaryFixed: Color,
    val onPrimaryFixed: Color,
    // --- accent: the mark that is NOT a tap — badges, folder markers, live dots ---
    val spark: Color,
    val onSpark: Color,
    val sparkBright: Color,
    val sparkLight: Color,
    val sparkPale: Color,
    /**
     * The accent for the grounds this palette draws LIT. Both [inverseSurface] and
     * [primary] invert polarity between the sets — near-white and gold in dark,
     * near-black and deep blue in light — so an accent standing on either cannot be one
     * value. Same hue as [spark], the tone chosen by the ground rather than by the set.
     */
    val sparkInverse: Color,
    // --- media: the film's own light, and the one family that is amber in every set ---
    val playheadHi: Color,
    val playheadLo: Color,
    // --- status ---
    val link: Color,
    val live: Color,
    val caution: Color,
    val onCaution: Color,
    val trouble: Color,
    val ghost: Color,
    // --- translucent fills, measured against the surface they sit on ---
    val fillCard: Color,
    val fillControl: Color,
    val fillTrack: Color,
    val fillTrackAlt: Color,
    val fillBuffered: Color,
    // --- scrims ---
    val scrim: Color,
    val posterScrim: Color,
)

// The LIGHT assignment: electric blue carries every action, amber is the accent, and amber
// also carries the media itself. The dark sets swap the first two — see [PrimaryOnNight] —
// and never the third: [PlayheadHi] and [PlayheadLo] are amber in all four palettes.
val Primary = Color(0xFF1240E8)
val PrimaryOnDark = Color(0xFF4A78FF)
val PrimaryContainer = Color(0xFFDCE5FF)
val OnPrimaryContainer = Color(0xFF33477E)
val PrimaryFixed = Color(0xFFB6C8FF)
val OnPrimaryFixed = Color(0xFF0A2A8A)

val Spark = Color(0xFFFFB61E)
val SparkBright = Color(0xFFFFC44D)
val SparkLight = Color(0xFFFFD873)
val SparkPale = Color(0xFFFFEFC6)
val OnSpark = Color(0xFF33240A)
val PlayheadHi = Color(0xFFFFD873)
val PlayheadLo = Color(0xFFF5A100)

val Link = Color(0xFF6FD0FF)
val Ghost = Color(0xFF7FB0FF)
val Caution = Color(0xFFFFA23A)
val OnCaution = Color(0xFF331A00)
val Trouble = Color(0xFFC9314D)
val TroubleOnDark = Color(0xFFFF7A8C)

val Ink = Color(0xFF0A1533)
val InkDim = Color(0xFF4A5A85)
val InkFaint = Color(0xFF6B7BA8)
val CanvasLight = Color(0xFFF2F6FF)

// Cinematic dark stops — the Now-Playing / Connecting backdrops and the sheet
// that has to sit on top of them.
val CinemaTop = Color(0xFF0A1E4A)
val CinemaMid = Color(0xFF08142F)
val CinemaDeep = Color(0xFF050C1D)
val CinemaSheet = Color(0xFF08122B)
val CinemaInk = Color(0xFFEAF0FF)
val CinemaInkDim = Color(0xFFA8B8DC)
val CinemaInkFaint = Color(0xFF8C9CC4)

// Dark-mode surfaces, which are NOT the cinematic ones. The stops above are a backdrop:
// they are the bottom of a navy gradient a poster is laid on, and they are that saturated
// and that dark because a still has to be the brightest thing in the frame. A settings
// list is not a poster, and reusing them app-wide gave dark mode two faults light mode
// does not have. Both are visible in the numbers.
//
// Elevation ran BACKWARDS: the sheet stop is darker than the surface stop it is raised
// over (1.017:1, inverted), and the canvas-to-sheet step was 1.051:1 against light mode's
// 1.082:1 — on a canvas where a dark drop shadow renders nothing at all, so a card had
// neither a tonal step nor a shadow to separate it. These step 1.141:1 the right way,
// wider than light because they have to carry the separation alone.
//
// And the hue ran hot: the cinematic stops sit at ~80% chroma relative to their own
// brightness, where the light canvas sits at 5% — light mode is a near-neutral with a
// breath of brand in it, and dark mode was drowning in the brand. These hold one hue
// (225°) at half that chroma, so dark reads as the same product rather than a navy one.
val NightCanvas = Color(0xFF0C0F18)
val NightRaised = Color(0xFF171D2E)
val NightRaisedAlt = Color(0xFF212A3C)
val NightDisabled = Color(0xFF191F2B)
val NightInk = Color(0xFFE4EAF6)
val NightInkDim = Color(0xFFA5B0C6)
val NightInkFaint = Color(0xFF909BB2)

// --- the dark assignment: the action takes the amber, the accent takes the brand blue ---
//
// One hue story rather than two swapped variables. In light, Flick is a blue tool that
// plays amber films; in dark the room lights go down, the film's own amber becomes the
// interface, and blue recedes to being the cool signal of the network. What does NOT move
// is the media pair — the scrub fill, the FAB and the dock stay amber in every set, so
// gold acting and gold playing are one meaning rather than a duplication.
//
// The physiology is the argument for doing it at all: about 2% of retinal cones are
// blue-sensitive and the eye focuses blue in front of the retina rather than on it, so a
// saturated blue is the worst hue there is for small targets and fine lines on near-black
// — and that is precisely what the old dark set spent it on (1-2 dp rings, 10 dp dots, and
// every action label in the app). After the swap the blue is only ever an area: a badge, a
// marker, a ripple. Never a hairline.

/**
 * The action gold. Tone ~85 at 76% relative chroma — luminous rather than saturated-dark,
 * which is the shape M3 asks of a dark accent; a tone-40 amber at this chroma would
 * vibrate against the canvas. One notch off [SparkBright] so it reads as the amber
 * family's own head rather than as a fifth brand colour.
 *
 * 12.46:1 on the canvas, 10.92:1 on the raised surface, 8.72:1 on the worst surface this
 * set paints (a filled card over the raise) — over-shot on purpose. WCAG 2.x flatters
 * dark-on-dark pairs badly enough that its own authors say it cannot guide a dark theme,
 * so the roles a polarity-aware metric would punish hardest are the ones given headroom
 * rather than scraped past 4.5.
 *
 * The largest single gain is on the nav pill: as the travelling selection fill against the
 * drawn glass #313D61 it measures 6.93:1, where the blue it replaces managed 3.69:1.
 */
val PrimaryOnNight = Color(0xFFFFC93D)

/**
 * Amber needs near-black ink and it needs it WARM — the old cool #0A1020 reads grey on
 * gold. The same deep-brown family as [OnSpark], two steps darker because it carries
 * button labels at body weight rather than a single badge word. 11.33:1 on [PrimaryOnNight].
 */
val OnPrimaryOnNight = Color(0xFF241804)

/**
 * Unchanged in kind: the muted telemetry ink stays the dark ink at 80% rather than
 * becoming a pale tint, for the reason already recorded below — a pale ink drops under 3:1
 * on a light primary, and this primary is lighter still. 6.90:1 composited over the gold,
 * which is the only ground it is ever drawn on.
 */
val OnPrimaryMutedOnNight = Color(0xCC241804)

// Deep enough to read as a tinted CONTROL rather than as one more dark box: 1.350:1 above
// the sheet it sits on, which is the step light mode's #DCE5FF has over white (1.258:1)
// and the step the navy container it replaces held (1.348:1). Cut to land on that same
// tonal rung so the folder chip, every tonal button, the UNPAIRED link pill and the
// library filter row keep their exact relationship to the card behind them.
val PrimaryContainerOnNight = Color(0xFF46300E)

/** The bronze container's own ink — a real tint, not white, so tonal still reads tonal. 9.67:1. */
val OnPrimaryContainerOnNight = Color(0xFFFFDFA3)

/**
 * The deep, white-ink-carrying form of the action, so the family is one hue top to bottom.
 * Its luminance is a near-exact match for the #1240E8 it replaces (0.0959 against 0.0962),
 * which is why [FlickColors.onPrimaryFixed] stays pure white with no retune (7.20:1 against
 * 7.18:1) and why the device-row tile keeps its softness inside the container (1.73:1
 * against 1.74:1).
 */
val PrimaryFixedOnNight = Color(0xFF7A4E00)

/**
 * The surface role that used to share a value with [PrimaryContainerOnNight], and is
 * decoupled from it here. This is a SURFACE — a poster placeholder, an error screen's dot
 * track, and Material's `surfaceVariant`/`surfaceContainer` below API 31 — so it belongs to
 * this set's 225° surface family, not to the action hue. A bronze poster placeholder would
 * be wrong, and it would drag the surfaces off their anchor.
 */
val SurfaceTonalOnNight = Color(0xFF1D306B)

/**
 * The freed brand blue, unchanged in value: it changes job, not hue. The HDR/DV badge, the
 * folder marker, the connected badge, the tile ripple — fills and areas, never a fine line.
 * 5.82:1 as a badge on the raised surface, 4.64:1 as ink on the worst surface this set
 * paints.
 */
val SparkOnNight = Color(0xFF6E93FF)

/** The badge ink inverts with the badge: warm brown on blue reads muddy. 6.55:1. */
val OnSparkOnNight = Color(0xFF071026)

/**
 * The rest of the accent ramp, kept monotonic and kept BLUE even though nothing in this set
 * paints these two: their call sites moved to [SparkInverseOnNight], which is the role that
 * belongs on a lit ground. Deliberately not left amber and not deleted — a future component
 * reaching for the accent must not get an amber back from a palette whose accent is blue.
 * 6.27:1 and 8.11:1 on the worst surface, so either can be picked up without a retune.
 */
val SparkBrightOnNight = Color(0xFF8FB0FF)
val SparkLightOnNight = Color(0xFFB3C9FF)

/** The ramp's pale end — the light set's own [PrimaryContainer]. Carries [OnSparkOnNight] at 15.02:1. */
val SparkPaleOnNight = Color(0xFFDCE5FF)

/**
 * See [FlickColors.sparkInverse]. Two tones below [SparkOnNight] at the same hue (228.5°
 * against 224.7°): one accent, light on this set's dark surfaces and deep on the two
 * grounds it draws lit. 4.97:1 on `inverseSurface` #E4EAF6 and 3.90:1 on the gold fill.
 *
 * It repairs three defects that shipped, all of which were an amber accent drawn on a
 * near-WHITE `inverseSurface` in dark: an advisory's INFO glyph at 1.45:1, a pair card's
 * slot count at 1.31:1, and the link pill's live dot on the action fill at 2.09:1.
 */
val SparkInverseOnNight = Color(0xFF2A50F0)

/**
 * A safety vermilion, 16.6° round from [Caution] toward red. It has to move because the
 * link pill draws `primary` for CASTING/PAIRED and `caution` for OFFLINE in the same seat
 * in the header, both as a solid warm fill with near-black ink — with an amber action those
 * two states would be the same paint. 28.2° of hue and a 1.79:1 luminance step apart from
 * [PrimaryOnNight] now, still unambiguously a warning hue, still carried with a Warning
 * glyph and still inverting to [OnCaution] (5.93:1).
 *
 * The light sets keep [Caution]: they have a blue action and no collision to solve, and
 * moving an anchored light role to settle a dark problem is how a palette drifts.
 *
 * The weakest separation left in the set is this against [TroubleOnDark] — 1.10:1 and
 * 23.2° — and it is held structurally rather than tonally: a saturated vermilion against a
 * desaturated salmon, and the two never share a control (a status pill picks one by kind,
 * an error face by tone) or a treatment (caution is a solid fill with dark ink, trouble is
 * always a 12-14% tint carrying its own ink).
 */
val CautionOnNight = Color(0xFFFF7040)

/**
 * A guard rather than a repaint: nothing in this set draws `ghost` today — the scrub bar is
 * cinematic and keeps the periwinkle [Ghost]. But at 217° the old value sat 8° from the new
 * accent at comparable chroma, which is a trap for the next component to reach for it. This
 * is the job the role's NAME states: the surfaces' own 223.6° lifted to ink weight, at 15%
 * relative chroma against the accent's 57%. A phantom by construction, 1.62:1 and 42 points
 * of chroma off [SparkOnNight], where the old pair managed 1.31:1 and 7 points.
 */
val GhostOnNight = Color(0xFFB9C2DA)

// Drop shadows are authored as colors because Compose takes them as ambient/spot
// tints rather than as a CSS shadow list.
val PrimaryShadow = Color(0x521240E8)
val FabShadow = Color(0x6BF5A100)
val TileShadow = Color(0x2E0A1533)
val NavShadow = Color(0x260A1533)
val PosterShadow = Color(0x99000000)

/**
 * The floating nav pill's shadow on the dark set. A tinted ink shadow is a way of making
 * a pale canvas darker, and there is nothing darker than a near-black canvas to make it —
 * [NavShadow] renders as nothing there, which is what left the pill sitting flat on the
 * page. Black at 55% still darkens this canvas, so the one piece of chrome that has to
 * float is the one thing given a real shadow in dark.
 */
val NavShadowOnNight = Color(0x8C000000)

/**
 * The closing stop of [FlickGradients.navSheenDark], and [NavSheenFootStart] is where it is
 * allowed to begin. Both are named because this stop is not decoration the ink can ignore:
 * the gradient runs DOWN the pill, so a wash at its end lands where the tab labels are.
 *
 * Measured on a device, with the stop interpolating from 62%, a label's local background came
 * out `#38456B` against the then-bare glass's `#313D61` — `onSurfaceDim` at 4.31:1 where
 * that glass alone gave 4.88:1. Under the 4.5 floor for text, on the role in the bar with
 * the least headroom to begin with.
 *
 * Weakening the stop was the obvious answer and the wrong one: it would have cost the cool
 * edge the pill is meant to have and still only reached 4.47:1 over a bright still. The bar's
 * bottom 14% is row padding with nothing drawn in it, so the fix is to hold the wash off the
 * text entirely rather than to dilute it — full strength, below the labels, where the glass
 * meets its own rim. Ink now sits on bare glass: 5.00:1 on the page and 4.52:1 with a
 * blown-out still behind it, both clear.
 *
 * Worth keeping next to the values: this shipped because FlickColorsTest measured ink against
 * the glass and the glass alone, asserting a background the app never draws. A sheen laid over
 * a surface is part of that surface, and the test now says so.
 */
val NavSheenDarkFoot = Color(0x1F96B4FF)

/** See [NavSheenDarkFoot]: below this the pill is padding, so a wash there touches no ink. */
const val NavSheenFootStart = 0.86f

/** A tight specular lip: bright at the rim, already quiet before any control ink begins. */
internal const val NavSheenLipEnd = 0.08f

/** End of the faint body reflection shared by both glass treatments. */
internal const val NavSheenBodyEnd = 0.44f

internal const val NavSheenClearStart = 0.62f

internal val NavSheenLightShoulder = Color(0x52FFFFFF)
internal val NavSheenLightBody = Color(0x0FFFFFFF)
internal val NavSheenLightFoot = Color(0x2996B4FF)

internal val NavSheenDarkRim = Color(0x52FFFFFF)
internal val NavSheenDarkShoulder = Color(0x1FFFFFFF)
internal val NavSheenDarkBody = Color(0x08FFFFFF)

val LightFlickColors = FlickColors(
    isLight = true,
    canvas = CanvasLight,
    surface = CanvasLight,
    surfaceRaised = Color(0xFFFFFFFF),
    surfaceRaisedAlt = Color(0xFFE7EEFF),
    surfaceTonal = PrimaryContainer,
    surfaceDisabled = Color(0xFFDDE6F8),
    inverseSurface = Ink,
    onInverseSurface = CanvasLight,
    onInverseSurfaceDim = Color(0xFF9FB0D8),
    // Two points more backdrop than the old 92% fill. The slightly lighter tint keeps
    // both inks above their previous contrast over a black poster while the page and
    // artwork contribute enough colour for this to read as glass instead of blue plastic.
    glass = Color(0xE6D4E7FF),
    glassBorder = Color(0x8CFFFFFF),
    onSurface = Ink,
    onSurfaceDim = InkDim,
    onSurfaceFaint = InkFaint,
    outline = Color(0xFFCBD8F5),
    outlineSoft = Color(0xFFC3D0EE),
    outlineHairline = Color(0x1A0A1533),
    primary = Primary,
    onPrimary = Color(0xFFFFFFFF),
    onPrimaryMuted = Color(0xFFBFD2FF),
    primaryContainer = PrimaryContainer,
    onPrimaryContainer = OnPrimaryContainer,
    primaryFixed = PrimaryFixed,
    onPrimaryFixed = OnPrimaryFixed,
    spark = Spark,
    onSpark = OnSpark,
    sparkBright = SparkBright,
    sparkLight = SparkLight,
    sparkPale = SparkPale,
    // The accent is already the amber here, and the grounds this palette draws lit are the
    // near-black `inverseSurface` and the deep blue `primary` — so the inverse tone IS the
    // accent. 10.24:1 on the inverse card, 4.09:1 on the action fill.
    sparkInverse = Spark,
    playheadHi = PlayheadHi,
    playheadLo = PlayheadLo,
    // Cyan reads at ~1.3:1 on the pale canvas, so the LAN/health jobs borrow the
    // brand blue on light surfaces and only become cyan on the cinematic set.
    link = Primary,
    live = Primary,
    caution = Caution,
    onCaution = OnCaution,
    trouble = Trouble,
    ghost = Ghost,
    fillCard = Color(0x140A1533),
    fillControl = Color(0x1C0A1533),
    fillTrack = Color(0x260A1533),
    fillTrackAlt = Color(0x290A1533),
    fillBuffered = Color(0x420A1533),
    scrim = Color(0x800A1533),
    posterScrim = Color(0x9E000000),
)

val CinematicFlickColors = FlickColors(
    isLight = false,
    canvas = CinemaDeep,
    surface = CinemaMid,
    surfaceRaised = CinemaSheet,
    surfaceRaisedAlt = Color(0xFF0F1F45),
    surfaceTonal = Color(0xFF12275C),
    surfaceDisabled = Color(0xFF142445),
    inverseSurface = CinemaInk,
    onInverseSurface = Ink,
    onInverseSurfaceDim = InkDim,
    glass = Color(0xEB102452),
    glassBorder = Color(0x38FFFFFF),
    onSurface = CinemaInk,
    onSurfaceDim = CinemaInkDim,
    onSurfaceFaint = CinemaInkFaint,
    outline = Color(0x3DEAF0FF),
    outlineSoft = Color(0x42FFFFFF),
    outlineHairline = Color(0x14FFFFFF),
    primary = PrimaryOnDark,
    onPrimary = Color(0xFF041028),
    // The light set's pale-blue telemetry ink would drop under 3:1 on this lighter
    // primary, so the muted role stays the dark ink and only loses weight.
    onPrimaryMuted = Color(0xCC041028),
    primaryContainer = Color(0xFF12275C),
    onPrimaryContainer = Color(0xFFC7D6FF),
    primaryFixed = Primary,
    onPrimaryFixed = Color(0xFFFFFFFF),
    spark = Spark,
    onSpark = OnSpark,
    sparkBright = SparkBright,
    sparkLight = SparkLight,
    sparkPale = SparkPale,
    // The blue end of the brand, which on this set is the deep tone [OnPrimaryFixed]
    // already carries. 10.76:1 on the inverse card, 3.17:1 on the action fill.
    sparkInverse = OnPrimaryFixed,
    playheadHi = PlayheadHi,
    playheadLo = PlayheadLo,
    link = Link,
    live = Link,
    caution = Caution,
    onCaution = OnCaution,
    trouble = TroubleOnDark,
    ghost = Ghost,
    fillCard = Color(0x14FFFFFF),
    fillControl = Color(0x1CFFFFFF),
    fillTrack = Color(0x26FFFFFF),
    fillTrackAlt = Color(0x29FFFFFF),
    fillBuffered = Color(0x42FFFFFF),
    scrim = Color(0x990A0406),
    posterScrim = Color(0x9E000000),
)

/**
 * The cinematic set for a phone that has been put into dark mode — the same backdrop,
 * carrying the dark ACTION assignment.
 *
 * Derived from [CinematicFlickColors] rather than written out, because "identical except
 * for the action family" is the whole claim and a copy is the only form of it that cannot
 * drift. Three reasons it inherits at all, and inherits only this much:
 *
 * 1. Swapping the cinematic set unconditionally would give a LIGHT-mode user amber CTAs on
 *    Now Playing and blue ones everywhere else. Resolving it means the action colour is one
 *    colour at any instant across the whole app; neither user ever sees a split.
 * 2. Not inheriting at all leaves a real seam: the primary button, the sheet chrome and the
 *    subtitles sheet's loading indicator all read `primary` under the cinematic theme, so a
 *    dark-mode user would tap a gold CTA on every screen and a blue one inside one sheet.
 * 3. The accent and the media families deliberately do NOT follow. A blue `spark` and a blue
 *    ambient glow on a navy backdrop is blue on blue — the inversion
 *    `theGlassStaysQuieterThanTheFillThatTravelsOnIt` exists to catch — and it would delete
 *    the one claim this product makes about colour. So this keeps amber `spark`, amber
 *    `playhead*`, cyan `link` and periwinkle `ghost`.
 */
val CinematicNightFlickColors = CinematicFlickColors.copy(
    primary = PrimaryOnNight,
    onPrimary = OnPrimaryOnNight,
    onPrimaryMuted = OnPrimaryMutedOnNight,
    // Cut against this set's own sheet rather than reused from the dark one: 1.355:1 over
    // CinemaSheet, where the navy container it replaces held 1.299:1.
    primaryContainer = Color(0xFF3D2A0A),
    onPrimaryContainer = OnPrimaryContainerOnNight,
    primaryFixed = PrimaryFixedOnNight,
    // Both follow the assignment they belong to: caution cannot be the action's own hue in
    // the set that also draws the action, and the inverse accent is chosen by the polarity
    // of the ground, which the gold fill just flipped.
    caution = CautionOnNight,
    sparkInverse = SparkInverseOnNight,
)

/**
 * A dark resolution — chosen outright in Settings, or inherited from the platform while
 * the preference is Match system.
 *
 * A set of its own, and NOT the cinematic one it used to be an alias for. The two answer
 * different questions: the cinematic set is what a poster is laid on and is tuned to be
 * the darkest, most saturated thing on the screen, and this is what a library grid, a
 * settings list and a folder chooser are laid on. Aliasing them meant every card in the
 * app was drawn in a palette designed to disappear behind artwork — see the stops above
 * for the two measurements that made that concrete.
 *
 * Nothing here is shared BY REFERENCE with the cinematic sets beyond the brand roles that
 * are the same colours in both because they are the brand: amber for the media, cyan for
 * the LAN, and the trouble ink. The surfaces, the ink, the action family and the accent
 * family are this set's own, so tuning one theme can never move the other.
 */
val DarkFlickColors = FlickColors(
    isLight = false,
    canvas = NightCanvas,
    // One value for both, as in the light set: the canvas IS the surface, and every step
    // above it is an explicit raise. A separate, slightly different base was the thing
    // that let the sheet stop end up below it.
    surface = NightCanvas,
    surfaceRaised = NightRaised,
    surfaceRaisedAlt = NightRaisedAlt,
    surfaceTonal = SurfaceTonalOnNight,
    surfaceDisabled = NightDisabled,
    inverseSurface = NightInk,
    onInverseSurface = NightCanvas,
    onInverseSurfaceDim = InkDim,
    // The floating chrome — the nav pill and the Now-Playing dock — and the one role that
    // stayed a grey when the rest of this set became a blue. It carried 28 channel steps,
    // so the piece of chrome that floats over everything was the piece that dropped the
    // brand. This holds the set's 225° anchor at a spread of 49 — comparable to light
    // glass's 43 — and separates 1.32:1 from surfaceRaisedAlt where it once managed
    // 1.10:1, which is a pill sitting flat on the page rather than floating over it.
    //
    // 97% opaque rather than the old 98%: enough backdrop participates to stop the fill
    // reading as solid plastic, without handing control contrast to whichever poster is
    // underneath it. The slightly darker red channel holds `onSurfaceDim` above 4.5:1 even
    // over a blown-out still; the sheen, hairline and shadow complete the frosted read (see
    // [flickGlass]).
    //
    // It stays COOL under the gold selection fill, which is a decision rather than an
    // oversight: 51% relative chroma against the fill's 76%, so the loud thing on the pill
    // is still the fill and not the material it travels on. Warming the glass to match the
    // gold is the same inversion `theGlassStaysQuieterThanTheFillThatTravelsOnIt` was
    // written to catch, only the other way round.
    glass = Color(0xF8303D61),
    // Held at 18% so the hairline remains restrained beside the brighter specular lip.
    glassBorder = Color(0x2EFFFFFF),
    onSurface = NightInk,
    onSurfaceDim = NightInkDim,
    onSurfaceFaint = NightInkFaint,
    // Softened with the surfaces they are drawn on: the old pair sat at 24% and 26% white
    // over a near-black canvas, which is a hairline brighter than the card it borders.
    outline = Color(0x33DCE6FF),
    outlineSoft = Color(0x3DE8EEFF),
    // 10%, matching the light set's own hairline rather than the cinematic 8%: it is
    // drawn on the raised surfaces, which are no longer nearly black.
    outlineHairline = Color(0x1AFFFFFF),
    primary = PrimaryOnNight,
    onPrimary = OnPrimaryOnNight,
    onPrimaryMuted = OnPrimaryMutedOnNight,
    primaryContainer = PrimaryContainerOnNight,
    onPrimaryContainer = OnPrimaryContainerOnNight,
    primaryFixed = PrimaryFixedOnNight,
    onPrimaryFixed = Color(0xFFFFFFFF),
    spark = SparkOnNight,
    onSpark = OnSparkOnNight,
    sparkBright = SparkBrightOnNight,
    sparkLight = SparkLightOnNight,
    sparkPale = SparkPaleOnNight,
    sparkInverse = SparkInverseOnNight,
    // Amber in this set too, and that is the load-bearing line of the whole dark
    // assignment: the scrub fill, the play FAB and the Now-Playing dock are the film's own
    // light. Gold acting and gold playing read as one meaning rather than as a duplication,
    // and pinning them here is what lets [FlickGradients.playhead] and [FlickGradients.fab]
    // stay plain `val`s in the app's hottest draw path.
    playheadHi = PlayheadHi,
    playheadLo = PlayheadLo,
    link = Link,
    live = Link,
    caution = CautionOnNight,
    onCaution = OnCaution,
    trouble = TroubleOnDark,
    ghost = GhostOnNight,
    fillCard = Color(0x14FFFFFF),
    fillControl = Color(0x1CFFFFFF),
    fillTrack = Color(0x26FFFFFF),
    fillTrackAlt = Color(0x29FFFFFF),
    fillBuffered = Color(0x42FFFFFF),
    // Heavier than the light set's 50%. A pale canvas under a sheet is dimmed until it
    // reads as behind; a canvas that is already near-black has to be taken almost to
    // nothing before the sheet raised over it looks raised rather than adjacent.
    scrim = Color(0xA6060911),
    posterScrim = Color(0x9E000000),
)

object FlickGradients {
    /** 120° HDR/Dolby-Vision badge sheen. */
    val premiumSheen: Brush = angledGradient(120f, 0f to SparkPale, 1f to SparkBright)

    /** 172° Now-Playing backdrop. */
    val nowPlayingBackdrop: Brush =
        angledGradient(172f, 0f to CinemaTop, 0.52f to CinemaMid, 1f to CinemaDeep)

    /** 170° Connecting-overlay backdrop. */
    val connectingBackdrop: Brush = angledGradient(170f, 0f to CinemaTop, 1f to CinemaDeep)

    /**
     * 90° played-fill of the scrub bar, and 150° for the play/pause FAB.
     *
     * Both stay plain `val`s across a palette swap that moved the action colour, because
     * the media roles they are built from are pinned amber in all four sets. Making them
     * palette-aware would cost a shader allocation and a `remember` slot per call in the
     * app's hottest draw path — the scrub bar under a drag, on a phone that is at the same
     * time serving 4K over the LAN — to return a byte-identical brush. The invariant is
     * held by arithmetic in `FlickColorsTest` instead, which fails the day someone re-hues
     * the media accent.
     */
    val playhead: Brush = angledGradient(90f, 0f to PlayheadHi, 1f to PlayheadLo)

    /** See [playhead]: the same two stops, raked for the round key. */
    val fab: Brush = angledGradient(150f, 0f to PlayheadHi, 1f to PlayheadLo)

    /** 180° poster scrim — transparent until 42%, then down to 62% black. */
    val posterScrim: Brush = angledGradient(
        180f,
        0f to Color.Transparent,
        0.42f to Color.Transparent,
        1f to Color(0x9E000000),
    )

    /** 195° scrim for the taller Now-Playing poster. */
    val nowPosterScrim: Brush = angledGradient(
        195f,
        0f to Color(0x0A000000),
        0.38f to Color(0x0A000000),
        1f to Color(0x9E000000),
    )

    /**
     * 168° reflection over light glass. The highlight is concentrated in the first 8%
     * like a specular rim, then falls below control ink instead of whitening the whole bar.
     */
    val navSheen: Brush = angledGradient(
        168f,
        0f to Color(0xB8FFFFFF),
        NavSheenLipEnd to NavSheenLightShoulder,
        NavSheenBodyEnd to NavSheenLightBody,
        NavSheenClearStart to Color(0x00FFFFFF),
        1f to NavSheenLightFoot,
    )

    /**
     * The same tight specular rim for dark glass, at a fraction of the weight through the
     * body. It reuses the existing shader pass: no extra compositing layer or live blur.
     *
     * 60% white is a gloss on a pale blue fill and a blown highlight on a dark one — the
     * pill's top edge came out nearly white while everything around it was near-black,
     * which is the brightest contrast on the screen landing on a decoration. Glass is lit
     * by what is behind it, and behind this one there is almost nothing.
     */
    val navSheenDark: Brush = angledGradient(
        168f,
        0f to NavSheenDarkRim,
        NavSheenLipEnd to NavSheenDarkShoulder,
        NavSheenBodyEnd to NavSheenDarkBody,
        NavSheenClearStart to Color(0x00FFFFFF),
        // Transparent all the way to the rim, so the closing wash never reaches the labels
        // sitting at ~73%. See [NavSheenDarkFoot] for the measurement that put it here.
        NavSheenFootStart to Color(0x00FFFFFF),
        1f to NavSheenDarkFoot,
    )

    /** The amber pill that runs along the connecting hairline. */
    val travelLight: Brush = Brush.horizontalGradient(
        listOf(Color.Transparent, SparkBright, Color.Transparent),
    )

    /**
     * Ambient amber glow behind Now Playing. Drawn as an ellipse inscribed in the
     * box it is given, matching the mock's `closest-side` radial.
     */
    val ambientGlow: Brush = object : ShaderBrush() {
        override fun createShader(size: Size): Shader {
            val rx = (size.width / 2f).coerceAtLeast(0.01f)
            val ry = (size.height / 2f).coerceAtLeast(0.01f)
            return RadialGradientShader(
                center = Offset(rx, ry),
                radius = rx,
                colors = listOf(Color(0x57FFB61E), Color.Transparent),
            ).apply {
                setLocalMatrix(android.graphics.Matrix().apply { setScale(1f, ry / rx, rx, ry) })
            }
        }
    }

    /**
     * Shimmer sweep for the "SYNCING…" chip. [startX] and [spanPx] are supplied by
     * the caller's animation so the brush itself stays stateless.
     */
    fun syncShimmer(startX: Float, spanPx: Float): Brush = Brush.linearGradient(
        colors = listOf(Color(0x007FB0FF), Color(0x737FB0FF), Color(0x007FB0FF)),
        start = Offset(startX, 0f),
        end = Offset(startX + spanPx, 0f),
    )
}

/**
 * CSS-style angled linear gradient: 0° points up and the angle grows clockwise.
 * Compose only offers explicit endpoints, so the gradient line is re-derived from
 * the drawn size on every shader creation.
 */
private fun angledGradient(degrees: Float, vararg stops: Pair<Float, Color>): Brush =
    object : ShaderBrush() {
        override fun createShader(size: Size): Shader {
            val radians = Math.toRadians(degrees.toDouble())
            val dx = sin(radians).toFloat()
            val dy = -cos(radians).toFloat()
            val length = abs(size.width * dx) + abs(size.height * dy)
            val cx = size.width / 2f
            val cy = size.height / 2f
            return LinearGradientShader(
                from = Offset(cx - dx * length / 2f, cy - dy * length / 2f),
                to = Offset(cx + dx * length / 2f, cy + dy * length / 2f),
                colors = stops.map { it.second },
                colorStops = stops.map { it.first },
            )
        }
    }

val LocalFlickColors = staticCompositionLocalOf { LightFlickColors }
