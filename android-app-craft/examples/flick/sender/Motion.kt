package com.flick.sender.ui.theme

import android.animation.ValueAnimator
import android.os.SystemClock
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.DurationBasedAnimationSpec
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Indication
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.util.lerp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.launch

/**
 * Motion and feedback for the surfaces Flick draws itself. Flick's controls are
 * hand-drawn boxes rather than Material components, so nothing here is supplied by
 * Material automatically — the press path reaches
 * [androidx.compose.material3.MotionScheme] only because [pressScale] and
 * [pressMorph] ask for it. Springs are used wherever a finger is involved, because
 * a spring retargets from its current velocity while a tween restarts on a fresh
 * clock. The tweens below survive only where there is no gesture to carry velocity
 * from: looping or media-clocked motion. Compose applies the system animator
 * duration scale to a finite spec, so a zero scale snaps rather than leaving a long
 * animation running — but looping animations never reach an end state and must
 * still be gated on [rememberReduceMotion].
 */
object Motion {

    /**
     * The dock-to-remote transform is deliberately quicker than the scheme's default
     * spatial motion while retaining that spring's character. Spring duration scales
     * approximately with the inverse square root of stiffness, so a 0.75 duration asks
     * for `1 / 0.75²` of the scheme spring's actual stiffness.
     */
    private const val CardMorphDurationFraction = 0.75f

    /** Route surface hold while the remote card grows over it. */
    const val CardMorphHoldMs = 450

    /** Latch lifetime for the specs captured at the start of a card flight. */
    const val CardMorphLatchMs = 675L

    /** Point at which the growing card takes ownership of the system bars. */
    const val CardMorphBarHandoffMs = 135L

    // --- Easing curves (cubic-bezier) ---
    /**
     * The toast rising into place. Sheets no longer use it — their rise is a gesture's
     * consequence and takes the scheme's spatial spring; a toast arrives on its own and
     * has nothing to retarget from.
     */
    val SheetRise: Easing = CubicBezierEasing(0.2f, 1.4f, 0.35f, 1f)

    /** The link light crossing the connecting hairline. */
    val Travel: Easing = CubicBezierEasing(0.3f, 0f, 0.2f, 1f)

    /** Pulse dot and the ambient glow breathe symmetrically. */
    val Breathe: Easing = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)

    /** Detent ripple expanding away from the thumb. */
    val RippleOut: Easing = CubicBezierEasing(0f, 0f, 0.58f, 1f)

    /** Shimmer and spinner run at a constant rate. */
    val Steady: Easing = LinearEasing

    // --- Durations (ms) ---
    const val SheetRiseMs = 400
    const val TravelMs = 1050
    const val PulseMs = 1600
    const val DetentMs = 420
    const val ShimmerMs = 900
    const val SpinMs = 800
    const val GlowMs = 5000
    const val ToastMs = 2200

    // --- Press scales ---
    // Only surfaces Flick still draws itself. The transport keys sit in a ButtonGroup
    // whose press response is a width squeeze, and scaling them as well would answer
    // one touch twice.
    const val PressRow = 0.96f

    // --- Sheet entry offsets ---
    const val SheetRiseOffsetDp = 30
    const val SheetRiseScale = 0.96f

    // --- Detent ripple geometry ---
    const val RippleFromScale = 0.55f
    const val RippleToScale = 2.5f
    const val RippleFromAlpha = 0.6f

    // --- Pulse-dot envelope ---
    const val PulseMinAlpha = 0.4f
    const val PulseMinScale = 0.82f
    const val PulseMaxScale = 1.18f

    // --- Ambient-glow envelope ---
    const val GlowMinAlpha = 0.45f
    const val GlowMaxAlpha = 0.95f

    /**
     * Consecutive slider-step ticks closer together than this are dropped. Below
     * roughly this interval the actuator cannot separate two pulses and the run
     * reads as one long buzz.
     */
    const val TickMinIntervalMs = 40L

    // --- Ready-made specs ---
    // No press spec here on purpose: a press is a gesture, so it takes a
    // motionScheme spring via pressScale/pressMorph. A tween cannot retarget from
    // the velocity an interrupted press already carries.
    fun <T> sheetRise(): DurationBasedAnimationSpec<T> =
        tween(durationMillis = SheetRiseMs, easing = SheetRise)

    fun <T> travel(): DurationBasedAnimationSpec<T> =
        tween(durationMillis = TravelMs, easing = Travel)

    fun <T> detent(): DurationBasedAnimationSpec<T> =
        tween(durationMillis = DetentMs, easing = RippleOut)

    /**
     * Retime the Material scheme spring used by the dock/remote shared bounds and its
     * dissolve. The damping ratio comes from the active scheme and only stiffness changes.
     * A future non-spring scheme passes through unchanged rather than making this product
     * token a source of a runtime cast failure.
     *
     * [visibilityThreshold] replaces the scheme's own, which names none: a bounds spring
     * left without one runs down to a hundredth of a pixel per edge, and the shared copy is
     * handed back to the bar only when the spring ENDS — long after the card has visibly
     * landed. The travel names [cardMorphTravelThreshold] so the hand-back is the landing.
     */
    @Suppress("UNCHECKED_CAST")
    fun <T> cardMorphSpec(
        base: FiniteAnimationSpec<T>,
        visibilityThreshold: T? = null,
    ): FiniteAnimationSpec<T> {
        val baseSpring = base as? SpringSpec<T> ?: return base
        return SpringSpec(
            dampingRatio = baseSpring.dampingRatio,
            stiffness = baseSpring.stiffness /
                (CardMorphDurationFraction * CardMorphDurationFraction),
            visibilityThreshold = visibilityThreshold ?: baseSpring.visibilityThreshold,
        )
    }

    /** Where the card's travel counts as landed: one pixel on every edge. */
    val cardMorphTravelThreshold: Rect = Rect.VisibilityThreshold

    /** Snap instead of animating when the platform's animators are off. */
    fun <T> orSnap(reduceMotion: Boolean, spec: FiniteAnimationSpec<T>): FiniteAnimationSpec<T> =
        if (reduceMotion) snap() else spec
}

/**
 * Product motion that is not managed by Material must still respect the platform's
 * animator setting. API 26 is Flick's minimum, so this is safe without a fallback.
 */
@Composable
fun rememberReduceMotion(): Boolean = !ValueAnimator.areAnimatorsEnabled()

/**
 * Whether the window this composition is in is resumed.
 *
 * A finite animation ends on its own and a paused window never sees it. A loop does not:
 * it keeps asking for frames for as long as it is composed, and a route that stays
 * composed for the whole of a two-hour cast keeps asking while the process is also
 * serving 4K over HTTP. So a loop on a long-lived surface is gated on this as well as on
 * [rememberReduceMotion].
 */
@Composable
internal fun rememberIsResumed(): Boolean {
    val lifecycleOwner = LocalLifecycleOwner.current
    var resumed by remember(lifecycleOwner) {
        mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED))
    }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> resumed = true
                Lifecycle.Event.ON_PAUSE -> resumed = false
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    return resumed
}

/**
 * How far a press has got: 0 at rest, 1 held down.
 *
 * The press flag is collected off composition and driven straight into an [Animatable]
 * rather than observed as state. A `@Composable` Modifier factory has no restart scope of
 * its own — its body runs in the CALLER's — so `collectIsPressedAsState` here invalidated
 * the whole control twice on every touch: the dock bar with its four texts and its decoded
 * thumbnail, a library tile, a remote segment. Nothing below reaches composition; every
 * consumer reads [Animatable.value] inside a layer or draw block.
 *
 * [spec] is a parameter because geometry and opacity do not answer a touch the same way:
 * a scale or a corner takes the scheme's spatial spring and is allowed to overshoot, a
 * press wash takes an effects spring and must not.
 */
@Composable
internal fun rememberPressAmount(
    interactionSource: InteractionSource,
    spec: FiniteAnimationSpec<Float> = MaterialTheme.motionScheme.fastSpatialSpec(),
): Animatable<Float, AnimationVector1D> {
    val reduceMotion = rememberReduceMotion()
    val amount = remember { Animatable(0f) }
    val current = rememberUpdatedState(Motion.orSnap(reduceMotion, spec))
    LaunchedEffect(interactionSource) {
        val presses = mutableListOf<PressInteraction.Press>()
        interactionSource.interactions.collect { interaction ->
            when (interaction) {
                is PressInteraction.Press -> presses += interaction
                is PressInteraction.Release -> presses -= interaction.press
                is PressInteraction.Cancel -> presses -= interaction.press
                else -> return@collect
            }
            // Launched rather than awaited: a release that lands mid-swell has to retarget
            // the spring from the velocity it already carries instead of queueing behind
            // it. Animatable's own mutex ends the run this one replaces.
            launch { amount.animateTo(if (presses.isEmpty()) 0f else 1f, current.value) }
        }
    }
    return amount
}

/**
 * Press response for rows, cards, buttons and the FAB. The scale is read inside the
 * layer block, so a press repaints without recomposing the caller.
 */
@Composable
internal fun Modifier.pressScale(
    interactionSource: InteractionSource,
    target: Float = Motion.PressRow,
): Modifier {
    val press = rememberPressAmount(interactionSource)
    return this.graphicsLayer {
        val scale = lerp(1f, target, press.value)
        scaleX = scale
        scaleY = scale
    }
}

/**
 * Press corner morph. This is a clip, so it replaces the surface's own
 * `Modifier.clip(RoundedCornerShape(restRadius))` rather than being added next to
 * it — at [restRadius] the two are identical, and a clip laid over a background
 * that already carries its own rounder shape would morph nothing. The radius is
 * read inside the layer block, so the morph repaints without recomposing the
 * caller.
 *
 * It rides the same spring [pressScale] does. On a tile the two answer one touch
 * together, and a corner still travelling after the scale had landed read as the shape
 * lagging the finger.
 */
@Composable
internal fun Modifier.pressMorph(
    interactionSource: InteractionSource,
    restRadius: Dp,
    pressedRadius: Dp,
): Modifier {
    val press = rememberPressAmount(interactionSource)
    return this.graphicsLayer {
        clip = true
        shape = PressCorner(pressRadius(restRadius, pressedRadius, press.value))
    }
}

/**
 * The corner one frame of a press morph is drawn at. Clamped, unlike the scale: the
 * spatial spring overshoots by design and a radius past either end is a corner the
 * surface never has — under zero it is not a shape at all.
 */
internal fun pressRadius(restRadius: Dp, pressedRadius: Dp, amount: Float): Dp =
    restRadius + (pressedRadius - restRadius) * amount.coerceIn(0f, 1f)

/**
 * One frame of that corner, as one object rather than five.
 *
 * A fresh instance per frame is the mechanism, not an oversight, and must not be replaced
 * by a remembered one that is mutated in place: the layer scope's shape setter compares
 * what it is handed against what it holds and flags the outline as changed only when the
 * two differ, so an instance that stays equal to itself while its radius moves underneath
 * re-pushes nothing and the corner freezes wherever it was first resolved. What the frame
 * can be spared is everything around it — RoundedCornerShape boxes a corner size, keeps
 * four of them and resolves all four per outline, to describe a radius that is one number
 * applied to every corner. Equality here is that number, so frames the spring resolves to
 * the same corner still cost no outline at all.
 */
private class PressCorner(private val radius: Dp) : Shape {

    override fun createOutline(
        size: Size,
        layoutDirection: LayoutDirection,
        density: Density,
    ): Outline {
        // Half the shorter side is the largest corner the surface has; past it the
        // renderer scales every radius down to fit anyway.
        val corner = with(density) { radius.toPx() }.coerceIn(0f, size.minDimension / 2f)
        return Outline.Rounded(
            RoundRect(0f, 0f, size.width, size.height, CornerRadius(corner)),
        )
    }

    override fun equals(other: Any?): Boolean = other is PressCorner && other.radius == radius

    override fun hashCode(): Int = radius.hashCode()
}

/**
 * Material's ripple, remembered so a press does not allocate a fresh factory on
 * every recomposition. Callers pass the theme role that reads on their own
 * background; Material applies its own alpha to it.
 */
@Composable
internal fun flickRipple(
    color: Color,
    bounded: Boolean = true,
    radius: Dp = Dp.Unspecified,
): Indication = remember(color, bounded, radius) {
    ripple(bounded = bounded, radius = radius, color = color)
}

/**
 * Haptics as named interactions rather than raw constants, so no call site can pick
 * a pulse that does not match what the user did. Every entry point must be invoked
 * from a gesture callback — never from a draw scope, a layer block or a
 * recomposition side effect, and never for state restored from process death or
 * changed programmatically. Reduce-motion does not gate haptics: the animator scale
 * and the system haptic preference are unrelated settings, and the platform already
 * honours the latter.
 *
 * This is the *touch* half only. `net.FlickHaptics` drives the platform vibrator
 * from PlaybackSession's own cue flow, and it already covers play/pause, seek and
 * the whole scrub gesture; anything it owns must not be cued from here as well, or
 * one gesture reaches the actuator twice.
 */
@Stable
internal class FlickTouchHaptics(private val haptics: HapticFeedback) {

    private var lastTickUptimeMs = 0L

    /** Chip and filter selection. Play/pause belongs to the session's own cue. */
    fun toggle(on: Boolean) =
        perform(if (on) HapticFeedbackType.ToggleOn else HapticFeedbackType.ToggleOff)

    /**
     * One volume step. Callers must already be firing on a step transition; the
     * interval floor here is a backstop, not a substitute.
     */
    fun sliderStep() {
        if (!tickAllowed()) return
        perform(HapticFeedbackType.SegmentTick)
    }

    /** A cast or a pairing succeeded. */
    fun confirm() = perform(HapticFeedbackType.Confirm)

    /** A cast or a pairing failed, or the input was rejected. */
    fun reject() = perform(HapticFeedbackType.Reject)

    /** Bottom nav moved to a different tab. Silent on a re-tap of the current one. */
    fun tabChange() = perform(HapticFeedbackType.ContextClick)

    private fun tickAllowed(): Boolean {
        // uptimeMillis is monotonic and unaffected by the wall clock; elapsed
        // realtime would keep counting through the doze the drag cannot survive.
        val now = SystemClock.uptimeMillis()
        if (now - lastTickUptimeMs < Motion.TickMinIntervalMs) return false
        lastTickUptimeMs = now
        return true
    }

    private fun perform(type: HapticFeedbackType) = haptics.performHapticFeedback(type)
}

/**
 * The holder carries the tick interval state, so it must survive recomposition; a
 * fresh instance per frame would let every tick through.
 */
@Composable
internal fun rememberFlickTouchHaptics(): FlickTouchHaptics {
    val haptics = LocalHapticFeedback.current
    return remember(haptics) { FlickTouchHaptics(haptics) }
}
