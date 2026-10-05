package com.example.starter.ui.motion

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.util.lerp
import kotlinx.coroutines.launch

/**
 * How far a press has got: 0 at rest, 1 held down.
 *
 * Collected off composition and driven straight into an [Animatable], never observed as state.
 * A `@Composable` Modifier factory has no restart scope of its own — its body runs in the
 * CALLER's — so `collectIsPressedAsState()` there invalidated the whole control twice on every
 * touch (flick:sender/.../Motion.kt:226-264). Every consumer reads [Animatable.value] inside a
 * layer or draw block.
 *
 * [spec] is a parameter because geometry and opacity answer a touch differently: a scale or a
 * corner takes a spatial spring and may overshoot; a press wash takes an effects spring and must
 * not. Clamp anything that must stay in 0..1 (a corner, an alpha) where you read it.
 */
@Composable
fun rememberPressAmount(
    interactionSource: InteractionSource,
    spec: FiniteAnimationSpec<Float> = MaterialTheme.motionScheme.fastSpatialSpec(),
): Animatable<Float, AnimationVector1D> {
    val reduceMotion = LocalReducedMotion.current
    val amount = remember { Animatable(0f) }
    val current = rememberUpdatedState(orSnap(reduceMotion, spec))
    LaunchedEffect(interactionSource) {
        val presses = mutableListOf<PressInteraction.Press>()
        interactionSource.interactions.collect { interaction ->
            when (interaction) {
                is PressInteraction.Press -> presses += interaction
                is PressInteraction.Release -> presses -= interaction.press
                is PressInteraction.Cancel -> presses -= interaction.press
                else -> return@collect
            }
            // Launched, not awaited: a release landing mid-swell must retarget the spring from the
            // velocity it already carries instead of queueing behind it. Animatable's own mutex
            // ends the run this one replaces.
            launch { amount.animateTo(if (presses.isEmpty()) 0f else 1f, current.value) }
        }
    }
    return amount
}

/**
 * Press response for rows, cards and buttons you draw yourself: shrink to [pressedScale] on the
 * scheme's fast spatial spring. Pass the same [interactionSource] you give `clickable`, with
 * `indication = null` — the scale is the feedback, and a ripple on top answers one touch twice.
 *
 * Put anything that measures its own bounds (a shared element, a tooltip anchor) OUTSIDE this
 * layer, or the press looks like a remeasure and cancels what consumed it
 * (android-design motion-and-performance.md §6).
 */
@Composable
fun Modifier.pressScale(interactionSource: InteractionSource, pressedScale: Float = 0.965f): Modifier {
    val press = rememberPressAmount(interactionSource)
    return this.graphicsLayer {
        val scale = lerp(1f, pressedScale, press.value)
        scaleX = scale
        scaleY = scale
    }
}
