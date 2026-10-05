package com.flick.receiver.ui.theme

import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.InfiniteRepeatableSpec
import androidx.compose.animation.core.KeyframesSpec
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.TweenSpec
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** One animation-scale observation per receiver composition, provided by the theme. */
val LocalReducedMotion = staticCompositionLocalOf { false }

/**
 * Motion — "flick & settle" (design-tokens.md §6, receiver-expressive-spec.md §6).
 *
 * Two halves. **Springs** carry everything a viewer can interrupt — focus, panels,
 * the seek reconcile — and carry the Expressive motion scheme's stiffnesses so the
 * TV speaks the same vocabulary as the phone. **Tweens** survive only
 * where nothing can interrupt them: looping ambience, media-clock motion, and
 * pure alpha. Each surviving tween below says why it is still a tween.
 *
 * The two apps diverge in exactly one place, and deliberately: TV spatial springs
 * are clamped to [TV_SPATIAL_DAMPING] / [TV_FOCUS_DAMPING], because the bounce
 * that reads as energy in the hand reads as instability at 55 inches.
 *
 * Note several surviving curves overshoot: the control points may exceed 1 on the
 * y axis (b/d), which [CubicBezierEasing] permits; only the x controls (a/c) must
 * stay in [0,1].
 *
 * The design file names four animations; they map onto these tokens as:
 * `tvRise` → [panelSpatial] over a [TvRise] offset; `tvBurst` → [tvBurstFadeIn] +
 * [tvBurstScaleIn] + [tvBurstExit] for the seek burst, and [tvBurstAlpha] +
 * [tvBurstReach] for the seek-landing ring; `tvPulse` → [tvPulse]. `tvSpin` has no token left: both arcs it
 * drove — the handshake ring and the rebuffer ring — are now `FlickLoader`, which
 * carries its own motion.
 *
 * Anything drawn while a film is on screen is designed for the 24 Hz pin, where a
 * frame is 41.67 ms: a full-screen alpha over a film moves on [filmReveal], a
 * card-sized one on [crossDissolve], and an overlay leaving into bare film on
 * [filmExit] (the seek burst keeps [tvBurstExit]). New motion over a film adds no
 * moving edge, wipe or layout-phase animation — at 24 steps a second those read as
 * judder, not motion. The side panel's `TvOriginReveal`/`animateBounds` and the chip
 * rows' `animateContentSize` are the known pre-existing exceptions
 * (receiver-expressive-spec.md §6.1). [lightsDown] and [pictureUp] are the only
 * tokens sized for the rest rate rather than the 24 Hz pin, because no film is visible
 * while they run. A lights-up whose resync hold a key or the cap ends early runs at the
 * panel's current rate.
 */
object FlickMotion {

    // --- Easing tokens ------------------------------------------------------

    /** Launch, toss-to-cast, seek confirm, screen transitions, play/pause morph. ~6% overshoot. */
    val FlickSettle: Easing = CubicBezierEasing(0.22f, 1.2f, 0.36f, 1f)

    /** The bar tracking the running clock. */
    val PlayheadGlide: Easing = LinearEasing

    /** Poster ↔ playback dissolve. */
    val CrossDissolve: Easing = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)

    /** TV controls fade — CSS "ease". */
    val ChromeFade: Easing = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)

    /** Ambient breathing (design `tvPulse`) — CSS "ease-in-out". */
    val Breathe: Easing = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)

    // --- Durations (ms) -----------------------------------------------------

    const val FLICK_SETTLE_MS = 320
    const val CROSS_DISSOLVE_MS = 400
    const val CHROME_FADE_IN_MS = 200
    const val CHROME_FADE_OUT_MS = 500
    const val PRESS_CONFIRM_MS = 90

    /**
     * How long the band under the top pill row stays CLAIMED after the card in it
     * is dismissed.
     *
     * The transient cards that share that band queue rather than stack, and a phase
     * is not enough to sequence them: a dismissal flips the outgoing card's phase in
     * the same recomposition that turns the next card on, so the one leaving is
     * still drawing — legibly, for most of its fade — while the one arriving fades
     * up at the identical coordinates. Two glass cards on top of each other is
     * exactly what the queue exists to prevent.
     *
     * It is defined AS the exit rather than as a number beside it, because the two
     * cannot be allowed to drift: a card is gone when its alpha reaches zero, and
     * that is [CHROME_FADE_OUT_MS] by construction. A handover shorter than the exit
     * re-opens the overlap; one longer is dead air on the film the viewer came for.
     */
    const val BAND_HANDOVER_MS = CHROME_FADE_OUT_MS

    /** Design `tvBurst` — the ±10 s seek flash. */
    const val TV_BURST_MS = 720

    /** `tvBurst` reaches full opacity and unit scale at 22 % of its run. */
    const val TV_BURST_PEAK_MS = 158

    /** Design `tvPulse` full cycle; the spec below runs a reversing half-cycle. */
    const val TV_PULSE_MS = 1900

    /**
     * The seek burst's exit. It must finish inside [SEEK_DELTA_CLEAR_MS], or the
     * next burst's delta text lands on a wash that is still leaving.
     */
    const val TV_BURST_EXIT_MS = 180

    /** How long the seek delta stays readable after the last key before it clears. */
    const val SEEK_DELTA_CLEAR_MS = 200L

    /**
     * An overlay leaving into bare film. 250 ms is the shortest pure-alpha exit that
     * still spans 6 vsyncs at the 24 Hz pin (41.67 ms frames); [fastStateEffects]
     * settles in about 2 frames there and reads as a cut.
     */
    const val FILM_EXIT_MS = 250

    /**
     * The room's light closing on the handshake card. Runs with no film visible, at the
     * rest rate unless a key or the cap ends the resync hold first.
     */
    const val LIGHTS_DOWN_MS = 560

    /**
     * The room's light opening: launch and lights-up. Runs with no film visible, at the
     * rest rate unless a key or the cap ends the resync hold first.
     */
    const val PICTURE_UP_MS = 640

    /**
     * Every full-screen veil change over a film. With [CrossDissolve] the steepest
     * step is 1.724 × 41.67 / 720 = 10.0 % of the span per 24 Hz frame; shorter and a
     * full-screen alpha visibly steps.
     */
    const val FILM_REVEAL_MS = 720

    /** How long the veil holds after the picture is released before it starts to lift. */
    const val REVEAL_VEIL_LAG_MS = 120L

    /** The fraction of the veil's travel that must have landed before the handshake card enters over a film. */
    const val CARD_AFTER_DIM_FRACTION = 0.6f

    /**
     * One idle drift half-cycle. At 34 s the wash is below the rate the eye reads as
     * motion — the room appears to breathe, rather than the app appearing to animate.
     */
    const val IDLE_DRIFT_MS = 34_000

    // --- Entrance offsets ---------------------------------------------------

    /** Rise distance for the bottom transport panel and the side panels (§5.3). */
    val TvRise: Dp = 21.dp

    /** Rise distance for the centred handshake card (§5.2). */
    val TvRiseCard: Dp = 23.dp

    // --- tvPulse envelope ---------------------------------------------------

    const val PULSE_ALPHA_MIN = 0.35f
    const val PULSE_ALPHA_MAX = 1f
    const val PULSE_SCALE_MIN = 0.8f
    const val PULSE_SCALE_MAX = 1.25f

    // --- Focus envelope (§3) ------------------------------------------------

    /** Scale applied to a focused element; skipped under reduced motion. */
    const val FOCUS_SCALE = 1.06f

    /** A short inward acknowledgement for D-pad center / Enter. */
    const val PRESS_SCALE = 0.98f

    /**
     * A focused element's press: still above rest, so the press reads as a dip in
     * the lift rather than the lift being dropped.
     */
    const val PRESS_FOCUSED_SCALE = 1.02f

    /** Alpha of a control that cannot act. */
    const val DISABLED_ALPHA = 0.38f

    // --- Spring vocabulary (Expressive) -------------------------------------

    /**
     * The Expressive motion scheme's spring stiffnesses, transcribed verbatim from
     * `ExpressiveMotionTokens` in this one place so both apps animate off a single
     * vocabulary. Stiffness is never adjusted for the TV; only damping is, below.
     *
     * The transcription originally existed because the receiver took material3 from
     * the Compose BOM, where `MotionScheme` is `internal`. That is no longer why it
     * stays: the module is now pinned to the same 1.5.0-alpha24 the sender uses, so
     * `MaterialTheme.motionScheme` IS reachable here. It is still transcribed
     * because reading the scheme would hand back the phone's damping, and the whole
     * TV deviation below is the damping — the values are identical either way, and
     * this keeps the one place a reader has to look.
     */
    private const val DEFAULT_SPATIAL_STIFFNESS = 380f
    private const val FAST_SPATIAL_STIFFNESS = 800f
    private const val DEFAULT_EFFECTS_STIFFNESS = 1600f
    private const val FAST_EFFECTS_STIFFNESS = 3800f
    private const val EFFECTS_DAMPING = 1f

    /**
     * The TV's damping floor for geometry. The scheme's expressive spatial springs
     * damp at 0.6–0.8 because a phone is held in the hand that launched the motion;
     * a ten-foot screen is a destination, and an overshoot big enough to see across
     * a room reads as the panel wobbling. Stiffness is never touched — that is what
     * carries the Expressive character.
     */
    const val TV_SPATIAL_DAMPING = 0.8f

    /**
     * Focus geometry clamps harder still. `FlickDimens.FocusRingReserve` is derived
     * from the [FOCUS_SCALE] lift with no overshoot budget in it, so the ring must
     * not fly past the element it surrounds: at 0.85 the peak excursion is ~0.6 %,
     * which the reserve absorbs.
     */
    const val TV_FOCUS_DAMPING = 0.85f

    /** Focus lift, press acknowledgement and beacon travel. Small and frequent. */
    @Composable
    fun <T> focusSpatial(): FiniteAnimationSpec<T> =
        spring(dampingRatio = TV_FOCUS_DAMPING, stiffness = FAST_SPATIAL_STIFFNESS)

    /** The spring successor to [flickSettle] — glyph morphs, seek swells, chips. */
    @Composable
    fun <T> flickSettleSpatial(): FiniteAnimationSpec<T> =
        spring(dampingRatio = TV_SPATIAL_DAMPING, stiffness = FAST_SPATIAL_STIFFNESS)

    /** Panel and chrome geometry — a whole surface arriving, not a control. */
    @Composable
    fun <T> panelSpatial(): FiniteAnimationSpec<T> =
        spring(dampingRatio = TV_SPATIAL_DAMPING, stiffness = DEFAULT_SPATIAL_STIFFNESS)

    /**
     * Every colour, alpha and selection fill. Effects specs are critically damped
     * by design and are never clamped: an opacity that overshoots past its target
     * is a rendering glitch, not expression.
     */
    @Composable
    fun <T> stateEffects(): FiniteAnimationSpec<T> =
        spring(dampingRatio = EFFECTS_DAMPING, stiffness = DEFAULT_EFFECTS_STIFFNESS)

    /** [stateEffects] for a surface on its way out — exits lead with the fade. */
    @Composable
    fun <T> fastStateEffects(): FiniteAnimationSpec<T> =
        spring(dampingRatio = EFFECTS_DAMPING, stiffness = FAST_EFFECTS_STIFFNESS)

    /**
     * Seek-landing reconciliation. A spring rather than a curve because a held
     * D-pad seek re-aims it mid-flight from wherever the bar has reached; a tween
     * re-aimed the same way restarts on a fresh clock and visibly jerks once per
     * key repeat. The threshold is in track fractions — 0.0005 of an 800 dp bar is
     * 0.4 dp, under half a pixel at density 2.
     */
    fun syncSpring(): SpringSpec<Float> = spring(
        dampingRatio = 0.72f,
        stiffness = Spring.StiffnessMediumLow,
        visibilityThreshold = 0.0005f,
    )

    /** Side-panel bounds travel. A spring, because a panel can be re-aimed mid-flight. */
    fun panelTravelRect(): SpringSpec<Rect> = spring(
        dampingRatio = TV_SPATIAL_DAMPING,
        stiffness = Spring.StiffnessMediumLow,
        visibilityThreshold = Rect.VisibilityThreshold,
    )

    // --- Reduced motion -----------------------------------------------------

    /**
     * The one reduced-motion idiom, mirroring the phone's `Motion.orSnap`: a zero
     * animator scale lands every finite spec in one frame.
     */
    fun <T> orSnap(reducedMotion: Boolean, spec: FiniteAnimationSpec<T>): FiniteAnimationSpec<T> =
        if (reducedMotion) snap() else spec

    /**
     * The reduced-motion content swap. AnimatedContent draws the incoming and outgoing
     * children together for one frame before it retires the old one, so the incoming
     * child must hold at alpha 0 for that frame; `EnterTransition.None` would draw both
     * at full opacity. A fresh instance each call, because `using` mutates it.
     */
    fun cut(sizeTransform: SizeTransform? = null): ContentTransform =
        ContentTransform(fadeIn(snap()), fadeOut(snap()), sizeTransform = sizeTransform)

    /** A small overlay's entrance: a pure-alpha tween over a film, a spring anywhere else. */
    @Composable
    fun <T> presenceIn(overFilm: Boolean): FiniteAnimationSpec<T> =
        if (overFilm) chromeFadeIn() else stateEffects()

    /** A small overlay's exit: [filmExit] over a film, where a spring's 2 frames read as a cut. */
    @Composable
    fun <T> presenceOut(overFilm: Boolean): FiniteAnimationSpec<T> =
        if (overFilm) filmExit() else fastStateEffects()

    // --- Ready-made specs ---------------------------------------------------

    fun <T> flickSettle(): TweenSpec<T> = tween(FLICK_SETTLE_MS, easing = FlickSettle)
    fun <T> crossDissolve(): TweenSpec<T> = tween(CROSS_DISSOLVE_MS, easing = CrossDissolve)

    /** 90 ms is below the threshold where an interrupted tween can be seen to restart. */
    fun <T> pressConfirm(): TweenSpec<T> = tween(PRESS_CONFIRM_MS, easing = ChromeFade)

    /** Pure alpha, nothing to interrupt: a fade has no position to retarget from. */
    fun <T> chromeFadeIn(): TweenSpec<T> = tween(CHROME_FADE_IN_MS, easing = ChromeFade)
    fun <T> chromeFadeOut(): TweenSpec<T> = tween(CHROME_FADE_OUT_MS, easing = ChromeFade)

    /** See [FILM_EXIT_MS]. Pure alpha, nothing to interrupt. */
    fun <T> filmExit(): TweenSpec<T> = tween(FILM_EXIT_MS, easing = ChromeFade)

    /** See [LIGHTS_DOWN_MS]. Pure alpha, nothing to interrupt. */
    fun <T> lightsDown(): TweenSpec<T> = tween(LIGHTS_DOWN_MS, easing = CrossDissolve)

    /** See [PICTURE_UP_MS]. Pure alpha, nothing to interrupt. */
    fun <T> pictureUp(): TweenSpec<T> = tween(PICTURE_UP_MS, easing = CrossDissolve)

    /** See [FILM_REVEAL_MS]. Pure alpha, nothing to interrupt. */
    fun <T> filmReveal(): TweenSpec<T> = tween(FILM_REVEAL_MS, easing = CrossDissolve)

    /** Seek-burst entrance opacity, peaking where [tvBurstAlpha] does. */
    fun <T> tvBurstFadeIn(): TweenSpec<T> = tween(TV_BURST_PEAK_MS, easing = ChromeFade)

    /** Seek-burst entrance scale, reaching unit scale at [TV_BURST_PEAK_MS], where [tvBurstAlpha] peaks. */
    fun <T> tvBurstScaleIn(): TweenSpec<T> = tween(TV_BURST_PEAK_MS, easing = FlickSettle)

    /** Seek-burst exit. See [TV_BURST_EXIT_MS]. */
    fun <T> tvBurstExit(): TweenSpec<T> = tween(TV_BURST_EXIT_MS, easing = ChromeFade)

    /** Seek-landing ring opacity: 0 → 1 (at 22 %) → 0. */
    fun tvBurstAlpha(): KeyframesSpec<Float> = keyframes {
        durationMillis = TV_BURST_MS
        0f at 0 using FlickSettle
        1f at TV_BURST_PEAK_MS using ChromeFade
        0f at TV_BURST_MS
    }

    /**
     * Seek-landing ring reach, 0 → 1 across the whole [tvBurstAlpha] envelope, so the ring is
     * still travelling outward when its light runs out, as `tvBurst`'s scale does. A tween
     * because nothing retargets it: a landing restarts its own slot from 0, and a live ring's
     * reach runs on while only its fade is retired. At the 24 Hz pin the 6 dp travel moves at
     * most ~0.8 dp a frame, under the 2 dp stroke.
     */
    fun tvBurstReach(): TweenSpec<Float> = tween(TV_BURST_MS, easing = ChromeFade)

    /**
     * The live-dot breath — a reversing half-cycle, so one full there-and-back
     * takes [TV_PULSE_MS]. Guard with [LocalReducedMotion].
     */
    fun tvPulse(): InfiniteRepeatableSpec<Float> = infiniteRepeatable(
        animation = tween(TV_PULSE_MS / 2, easing = Breathe),
        repeatMode = RepeatMode.Reverse,
    )

    /** The idle bed's drift — the one deliberate ambient loop. Guard with [LocalReducedMotion]. */
    fun idleDrift(): InfiniteRepeatableSpec<Float> = infiniteRepeatable(
        animation = tween(IDLE_DRIFT_MS, easing = Breathe),
        repeatMode = RepeatMode.Reverse,
    )
}

/**
 * A zero animator scale is a request for static state, not merely faster motion.
 * Foundation components branch on this before starting ambient/infinite effects;
 * Compose's regular animation clock still scales the finite specs above.
 */
@Composable
fun rememberReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    var animatorScale by remember(resolver) { mutableStateOf(readAnimatorScale(resolver)) }

    // This is a live setting on Android TV. Observing it keeps a viewer from
    // having to relaunch Flick after enabling Remove animations in Settings.
    DisposableEffect(resolver) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) {
                animatorScale = readAnimatorScale(resolver)
            }
        }
        val registered = runCatching {
            resolver.registerContentObserver(
                Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE),
                false,
                observer,
            )
        }.isSuccess
        onDispose {
            if (registered) runCatching { resolver.unregisterContentObserver(observer) }
        }
    }
    return animatorScale <= 0f
}

private fun readAnimatorScale(resolver: android.content.ContentResolver): Float = runCatching {
    Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
}.getOrDefault(1f)
