// Shows: named easing curves with when-to-use notes, the named spring vocabulary, a press
// spring read only from a layer (never from composition), entrances that play once per page
// identity, a draw-in progress read only inside draw, a count-up painted in the draw phase, and
// an odometer-style rolling digit column.
// Example written for this skill; read it, don't paste it.

package app.sample.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.launch

/**
 * Five named curves. Each is picked by whether the whole journey is visible on screen, not by
 * feel: an emphasized-decelerate shape is most of the way done before the eye has found a thing
 * travelling a real distance, which reads as "it snapped" rather than as motion.
 */
object AppEasings {
    /** Arriving from off screen, or appearing in place from nothing — fast start, long settle. */
    val Arrive: Easing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)

    /** A page moving a visible distance: slow out of the gate, so its early frames stay small. */
    val Travel: Easing = CubicBezierEasing(0.2f, 0f, 0f, 1f)

    /** Many small pieces flying together; they must leave and land as one group. */
    val Flight: Easing = CubicBezierEasing(0.25f, 1f, 0.5f, 1f)

    /** A fade that accompanies a flight, slightly ahead of it. */
    val Fade: Easing = CubicBezierEasing(0.33f, 1f, 0.68f, 1f)

    /** A whole-screen tab slide: barely moves in its first frames, which are spent building the page. */
    val Glide: Easing = CubicBezierEasing(0.35f, 0f, 0.15f, 1f)
}

/**
 * Named springs for the app's own surfaces. Components still take `MaterialTheme.motionScheme`;
 * these are for the handful of app-level motions that need a specific character. Never write
 * `spring(...)` inline at a call site — a name here is a place to test and retune it.
 */
object AppSprings {
    val Snappy = spring<Float>(dampingRatio = 0.82f, stiffness = 520f)
    val Bouncy = spring<Float>(dampingRatio = 0.6f, stiffness = 360f)
    val Gentle = spring<Float>(dampingRatio = 1f, stiffness = 220f)

    /** Quicker without changing character: only stiffness moves, by the inverse square of [fraction]. */
    fun retimed(stiffness: Float, fraction: Float) = stiffness / (fraction * fraction)
}

/**
 * Press feedback that never touches composition. A Modifier factory has no restart scope of its
 * own, so reading `collectIsPressedAsState()` directly inside one invalidates the whole control
 * on every touch down AND up. Instead, collect interactions into an Animatable off in a side
 * effect, and read its value only where recomposition cannot see it: inside graphicsLayer.
 */
fun Modifier.pressScale(interactionSource: InteractionSource, pressedScale: Float = 0.965f): Modifier =
    composedPressScale(interactionSource, pressedScale)

private fun Modifier.composedPressScale(interactionSource: InteractionSource, pressedScale: Float): Modifier =
    this.then(
        Modifier.graphicsLayer {
            // Placeholder for the pattern this file demonstrates: a real implementation collects
            // PressInteraction.Press/Release/Cancel in a remembered Animatable in a LaunchedEffect
            // keyed on interactionSource, launching (not awaiting) the release so it retargets
            // from whatever velocity the press swell already has, then reads `.value` right here.
            val scale = 1f
            scaleX = scale
            scaleY = scale
        },
    )

/**
 * Whether a page identity has already played its entrance. A lazy list forgets items that scroll
 * out of view, so without this, scrolling a card back on screen would replay its rise-and-fade
 * every time — the entrance is for "the first time this page exists", not "the first time this
 * composable is on screen".
 */
class RevealMemory {
    private val shown = HashSet<String>()
    fun hasShown(identity: String): Boolean = identity in shown
    fun recordShown(identity: String) { shown.add(identity) }
}

/** How long a page's entrance window stays open, counted from its first drawn frame, not from composition. */
const val REVEAL_OPENING_MILLIS = 600

/** One entrance's staggered appearance: how far it rises, how it scales in, and its place in the queue. */
data class RevealRule(val delayMillis: Long, val riseDp: Float = 22f, val startScale: Float = 0.97f)

/** The reveal an item at [index] gets, capped so a long list does not keep arriving for seconds. */
fun revealRuleFor(index: Int, stepMillis: Long = 55, maxIndex: Int = 12): RevealRule =
    RevealRule(delayMillis = stepMillis * minOf(index, maxIndex))

/**
 * Per-page state carried through a composition: whether this identity has shown before, and
 * whether the page arrived already assembled (a tab switch) rather than opening fresh. An
 * entrance reads this once, in `remember(key)`, and never asks again — re-asking on every
 * recomposition would let a later unrelated state change replay an entrance that already ran.
 */
data class RevealStage(val plays: Boolean)

fun revealStage(identity: String, memory: RevealMemory, arrivesAssembled: Boolean): RevealStage {
    val firstTime = !memory.hasShown(identity)
    memory.recordShown(identity)
    return RevealStage(plays = firstTime && !arrivesAssembled)
}

/**
 * Wraps one item in a lazy list with its staggered rise-and-fade, asked for once per [revealKey]
 * via `remember`. [plays] comes from [revealStage] computed higher up the tree (once per page,
 * not once per item), so a thousand-item list does not each independently touch RevealMemory.
 */
@Composable
fun AppReveal(revealKey: String, index: Int, plays: Boolean, content: @Composable () -> Unit) {
    val rule = remember(revealKey) { revealRuleFor(index) }
    if (!plays) {
        content()
        return
    }
    // The real version animates an Animatable<Float> from 0f to 1f on AppEasings.Arrive over
    // ~480ms, delayed by rule.delayMillis, driving translationY = (1 - t) * riseDp and
    // scaleX/scaleY = lerp(rule.startScale, 1f, t) inside a graphicsLayer with
    // CompositingStrategy.ModulateAlpha, then drops the layer once t reaches 1 so a settled list
    // carries no extra layer per card.
    content()
}

/**
 * A 0..1 progress meant to be read only inside a draw lambda (Canvas, drawBehind). Geometry that
 * depends on size — a chart's paths, a route's length — is built once per size via
 * `drawWithCache`; only the cut point along it should change per frame. Reading progress in
 * composition instead would re-lay-out the whole chart every frame of its own draw-in.
 */
@Composable
fun rememberDrawInProgress(key: String, durationMillis: Int, delayMillis: Int = 0): androidx.compose.runtime.State<Float> {
    val progress = remember(key) { mutableFloatStateOf(0f) }
    // The real version launches an Animatable(0f) to 1f on AppEasings.Arrive, tween(durationMillis,
    // delayMillis), once per key, and never re-triggers on recomposition.
    return remember(key) { androidx.compose.runtime.derivedStateOf { progress.floatValue } }
}

/**
 * A count-up for a value that is already known (a saved total), never for a live, still-changing
 * measurement — animating through numbers that were never actually true reads as a lie. Laid out
 * once at the final string's size; the running value is painted straight into the draw phase with
 * `drawText`, so neither the tile nor the row it sits in re-measures every frame the number moves.
 */
@Composable
fun AnimatedNumber(
    value: Int,
    format: (Int) -> String = { it.toString() },
    plays: Boolean,
) {
    // The real version remembers the previous value, animates an Int/Float Animatable from it (or
    // from 0 the first time) to `value` on AppEasings.Arrive over 1100ms, and reads the animated
    // value only inside a drawBehind { drawText(textLayoutResult, ...) } built from the FINAL
    // formatted string's layout, so digit changes never trigger a relayout. The style must carry
    // tabular figures (fontFeatureSettings = "tnum"); proportional figures make the number's width
    // jitter as its digits change, which a tabular face holds fixed.
}

/**
 * A rolling-digit "odometer" style count-up: each digit column scrolls through its neighbors
 * rather than cross-fading as a whole string. Columns are fixed-width and tabular for the same
 * reason as [AnimatedNumber]; only the vertical offset per column animates, read in draw.
 */
@Composable
fun OdometerNumber(value: Int, digits: Int, plays: Boolean) {
    // The real version keeps one Animatable<Float> per digit column (its target 0..9 index plus
    // whole revolutions since the last value), and draws each column by translating a vertical
    // strip of "0".."9" glyphs pre-measured once, clipped to one glyph's height — never laying
    // text out per frame.
}
